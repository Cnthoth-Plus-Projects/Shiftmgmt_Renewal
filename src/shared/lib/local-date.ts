const pad = (value: number) => String(value).padStart(2, "0");

// 날짜 입력칸의 기본값은 운영자가 달력에서 보는 날짜와 같아야 한다. toISOString()은 UTC라
// 한국시간 자정~오전 9시 사이에는 하루 전 날짜가 나와 적용일이 하루 어긋난다.
export const formatLocalDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const createTodayDateInputValue = () => formatLocalDateInputValue(new Date());

/** 인력 시급 조회와 표시가 공유하는 서울 기준 날짜(서버/브라우저 시간대와 무관). */
export const getSeoulTodayDateString = (baseDate = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(baseDate);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export const MIN_HIRE_DATE = "1990-01-01";

export const getSeoulMaxHireDateString = (today: string): string => {
  const [year, month, day] = today.split("-");
  return `${Number(year) + 1}-${month}-${month === "02" && day === "29" ? "28" : day}`;
};

/** 입사일 등록/정정이 공유하는 기존 날짜 범위·달력 검증. */
export const validateHireDate = (value: string, today: string): { valid: boolean; message?: string } => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false, message: "올바른 입사일(YYYY-MM-DD)을 입력해 주세요." };
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return { valid: false, message: "올바른 입사일(YYYY-MM-DD)을 입력해 주세요." };
  }
  if (value < MIN_HIRE_DATE) return { valid: false, message: `입사일은 ${MIN_HIRE_DATE} 이후여야 합니다.` };
  const max = getSeoulMaxHireDateString(today);
  if (value > max) return { valid: false, message: `입사일은 오늘 기준 1년 이내(${max}까지)여야 합니다.` };
  return { valid: true };
};
