import type { HolidayItem } from "../../shared/domain/model";

interface ExternalHolidayRow {
  date?: string;
  holidayDate?: string;
  localName?: string;
  name?: string;
  isSubstitute?: boolean;
}

const normalizeDateText = (value: string) => {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed)) || new Date(trimmed).toISOString().slice(0, 10) !== trimmed) {
    throw new Error("공휴일 API 응답에 잘못된 날짜 형식이 포함되어 있습니다.");
  }

  return trimmed;
};

const resolveHolidayApiUrl = (baseUrl: string, year: number) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (trimmed.length === 0) {
    throw new Error("공휴일 API 주소가 비어 있습니다.");
  }

  if (trimmed.includes("{year}") || trimmed.includes("{countryCode}")) {
    return trimmed.replaceAll("{year}", String(year)).replaceAll("{countryCode}", "KR");
  }

  if (/\/PublicHolidays$/i.test(trimmed)) {
    return `${trimmed}/${year}/KR`;
  }

  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}year=${year}&countryCode=KR`;
};

export const fetchHolidayApiItems = async (input: {
  baseUrl: string;
  year: number;
}): Promise<HolidayItem[]> => {
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > 9999) {
    throw new Error("공휴일을 불러올 연도를 확인해 주세요.");
  }
  const url = resolveHolidayApiUrl(input.baseUrl, input.year);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`공휴일 API 호출에 실패했습니다. (${response.status})`);
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new Error("공휴일 API 응답 형식이 올바르지 않습니다.");
  }

  const itemsByDate = new Map<string, HolidayItem>();

  payload.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("공휴일 API 응답에 잘못된 항목이 있습니다.");
    }

    const row = entry as ExternalHolidayRow;
    const holidayDate = row.holidayDate ?? row.date;
    const holidayName = row.localName ?? row.name;

    if (typeof holidayDate !== "string" || typeof holidayName !== "string" || !holidayName.trim()) {
      throw new Error("공휴일 API 응답의 날짜와 명칭을 확인해 주세요.");
    }

    const normalizedDate = normalizeDateText(holidayDate);

    if (!normalizedDate.startsWith(`${input.year}-`)) {
      throw new Error("공휴일 API 응답의 연도가 선택한 연도와 다릅니다.");
    }

    if (itemsByDate.has(normalizedDate)) {
      return;
    }

    itemsByDate.set(normalizedDate, {
      id: `holiday-api-${input.year}-${index}`,
      holidayDate: normalizedDate,
      name: String(holidayName).trim(),
      isSubstitute: row.isSubstitute === true || String(holidayName).includes("대체")
    });
  });

  if (!itemsByDate.size) throw new Error("가져온 공휴일 목록이 비어 있습니다.");

  // 기본 Nager 자료는 원 공휴일 또는 대체일을 누락하는 경우가 있다.
  // Google의 한국 공휴일 일정과 합쳐 원 공휴일/대체일을 함께 보존한다.
  // 사용자 지정 JSON API는 기존 계약대로 한 출처만 사용한다.
  if (/^https:\/\/(?:date\.nager\.at|nagerholidays\.com)\/api\/v3\/PublicHolidays\/\d{4}\/KR$/i.test(url)) {
    const calendarResponse = await fetch(
      "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics",
      { headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(15_000) }
    );
    if (!calendarResponse.ok) throw new Error(`한국 공휴일 보완 자료를 불러오지 못했습니다. (${calendarResponse.status}) 다시 동기화해 주세요.`);
    const calendarText = (await calendarResponse.text()).replace(/\r?\n[ \t]/g, "");
    if (!calendarText.startsWith("BEGIN:VCALENDAR")) throw new Error("한국 공휴일 보완 자료의 형식이 올바르지 않습니다.");
    let matched = 0;
    for (const event of calendarText.split("BEGIN:VEVENT").slice(1)) {
      if (/^STATUS:CANCELLED\r?$/m.test(event) || !/^DESCRIPTION:공휴일\r?$/m.test(event)) continue;
      const rawDate = /^DTSTART;VALUE=DATE:(\d{8})\r?$/m.exec(event)?.[1];
      if (!rawDate?.startsWith(String(input.year))) continue;
      const holidayDate = normalizeDateText(`${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`);
      const summary = /^SUMMARY:(.+)\r?$/m.exec(event)?.[1]?.trim().replace(/\\([,;\\])/g, "$1");
      if (!summary) throw new Error("한국 공휴일 보완 자료의 명칭이 비어 있습니다.");
      const isSubstitute = /^쉬는 날\s/.test(summary) || summary.includes("대체");
      const name = summary.replace(/^쉬는 날\s+(.+)$/, "대체공휴일($1)");
      const previous = itemsByDate.get(holidayDate);
      itemsByDate.set(holidayDate, { id: previous?.id ?? `holiday-calendar-${holidayDate}`, holidayDate, name, isSubstitute });
      matched++;
    }
    if (!matched) throw new Error(`${input.year}년 한국 공휴일 보완 자료가 아직 제공되지 않습니다. 기존 목록은 유지됩니다. 직접 추가하거나 자료 제공 후 다시 동기화해 주세요.`);
  }

  return Array.from(itemsByDate.values()).sort((left, right) =>
    left.holidayDate.localeCompare(right.holidayDate)
  );
};
