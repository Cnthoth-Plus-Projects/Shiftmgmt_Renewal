// 공휴일 순수 도메인/비교 모델 (H02, H03, H05, H07)
import type { HolidayCalendar, HolidayItem } from "../../shared/domain/model";
import { isValidDateFormat } from "./operations-model";

export type HolidayTypeFilter = "all" | "regular" | "substitute";
export type HolidaySortField = "holidayDate" | "name";
export type HolidaySortOrder = "asc" | "desc";

export interface HolidayFilterOptions {
  query?: string;
  typeFilter?: HolidayTypeFilter;
  sortField?: HolidaySortField;
  sortOrder?: HolidaySortOrder;
}

export interface HolidaySummary {
  totalCount: number;
  regularCount: number;
  substituteCount: number;
}

export type HolidayChangeType = "added" | "removed" | "modified" | "unchanged";

export interface HolidayComparisonRow {
  holidayDate: string;
  changeType: HolidayChangeType;
  before?: HolidayItem;
  after?: HolidayItem;
  isNameChanged?: boolean;
  isSubstituteChanged?: boolean;
}

export interface HolidayComparisonResult {
  targetYear: number;
  currentCount: number;
  fetchedCount: number;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
  hasChanges: boolean;
  rows: HolidayComparisonRow[];
  validationErrors: string[];
}

/**
 * 요일 문자열 (월, 화, 수, 목, 금, 토, 일) 반환 (UTC 기준 안전 계산)
 */
export function getKoreanDayOfWeek(dateStr: string): string {
  if (!isValidDateFormat(dateStr)) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[date.getUTCDay()] || "";
}

/**
 * 날짜 문자열 포맷팅: YYYY-MM-DD (요일)
 */
export function formatHolidayDateWithDay(dateStr: string): string {
  const dow = getKoreanDayOfWeek(dateStr);
  return dow ? `${dateStr} (${dow})` : dateStr;
}

/**
 * 공휴일 요약 통계 계산 (전체 = 일반 + 대체)
 */
export function computeHolidaySummary(items: readonly HolidayItem[]): HolidaySummary {
  let regularCount = 0;
  let substituteCount = 0;

  for (const item of items) {
    if (item.isSubstitute) {
      substituteCount++;
    } else {
      regularCount++;
    }
  }

  return {
    totalCount: items.length,
    regularCount,
    substituteCount
  };
}

/**
 * 공휴일 목록 필터링 및 정렬 (불변 순수 함수)
 */
export function filterHolidayItems(
  items: readonly HolidayItem[],
  options: HolidayFilterOptions = {}
): HolidayItem[] {
  const query = (options.query || "").trim().toLowerCase();
  const typeFilter = options.typeFilter || "all";
  const sortField = options.sortField || "holidayDate";
  const sortOrder = options.sortOrder || "asc";

  const filtered = items.filter((item) => {
    // 1. 구분 필터
    if (typeFilter === "regular" && item.isSubstitute) return false;
    if (typeFilter === "substitute" && !item.isSubstitute) return false;

    // 2. 검색어 필터 (날짜 또는 명칭)
    if (query) {
      const matchName = item.name.toLowerCase().includes(query);
      const matchDate = item.holidayDate.includes(query);
      if (!matchName && !matchDate) return false;
    }

    return true;
  });

  // 정렬 (원본 보존)
  return filtered.sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") {
      cmp = a.name.localeCompare(b.name, "ko");
      if (cmp === 0) {
        cmp = a.holidayDate.localeCompare(b.holidayDate);
      }
    } else {
      cmp = a.holidayDate.localeCompare(b.holidayDate);
      if (cmp === 0) {
        cmp = a.name.localeCompare(b.name, "ko");
      }
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });
}

/**
 * 외부 API 가져오기 결과와 현재 달력 항목을 비교 (H05)
 * 날짜를 키로 추가/변경(명칭 또는 대체 여부)/제외/동일을 정확히 구분.
 * 양쪽 ID 차이는 업무 변경으로 세지 않는다.
 */
export function buildHolidayComparison(
  currentItems: readonly HolidayItem[],
  fetchedItems: readonly HolidayItem[],
  targetYear: number
): HolidayComparisonResult {
  const validationErrors: string[] = [];

  if (!fetchedItems || fetchedItems.length === 0) {
    validationErrors.push("가져온 공휴일 목록이 비어 있습니다.");
  }

  // 가져온 항목 유효성 검사 (입력 불변 보존)
  const seenDates = new Set<string>();
  for (const item of fetchedItems || []) {
    if (!item.holidayDate || !isValidDateFormat(item.holidayDate)) {
      validationErrors.push(`유효하지 않은 날짜 형식입니다: ${item.holidayDate || "빈값"}`);
      continue;
    }
    if (targetYear > 0) {
      const year = parseInt(item.holidayDate.slice(0, 4), 10);
      if (year !== targetYear) {
        validationErrors.push(`선택 연도(${targetYear}년)와 일치하지 않는 날짜입니다: ${item.holidayDate}`);
      }
    }
    if (!item.name || !item.name.trim()) {
      validationErrors.push(`공휴일 명칭이 비어 있습니다 (${item.holidayDate})`);
    }
    if (seenDates.has(item.holidayDate)) {
      validationErrors.push(`가져온 목록에 중복된 날짜가 있습니다: ${item.holidayDate}`);
    }
    seenDates.add(item.holidayDate);
  }

  const currentMap = new Map<string, HolidayItem>();
  for (const item of currentItems) {
    currentMap.set(item.holidayDate, item);
  }

  const fetchedMap = new Map<string, HolidayItem>();
  for (const item of fetchedItems || []) {
    // 중복 날짜가 있더라도 첫 항목을 유지하여 맵 생성
    if (!fetchedMap.has(item.holidayDate)) {
      fetchedMap.set(item.holidayDate, item);
    }
  }

  const allDates = Array.from(new Set([...currentMap.keys(), ...fetchedMap.keys()])).sort((a, b) =>
    a.localeCompare(b)
  );

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;
  const rows: HolidayComparisonRow[] = [];

  for (const date of allDates) {
    const cur = currentMap.get(date);
    const fetched = fetchedMap.get(date);

    if (fetched && !cur) {
      addedCount++;
      rows.push({
        holidayDate: date,
        changeType: "added",
        after: fetched
      });
    } else if (cur && !fetched) {
      removedCount++;
      rows.push({
        holidayDate: date,
        changeType: "removed",
        before: cur
      });
    } else if (cur && fetched) {
      const isNameChanged = cur.name.trim() !== fetched.name.trim();
      const isSubstituteChanged = Boolean(cur.isSubstitute) !== Boolean(fetched.isSubstitute);

      if (isNameChanged || isSubstituteChanged) {
        modifiedCount++;
        rows.push({
          holidayDate: date,
          changeType: "modified",
          before: cur,
          after: fetched,
          isNameChanged,
          isSubstituteChanged
        });
      } else {
        unchangedCount++;
        rows.push({
          holidayDate: date,
          changeType: "unchanged",
          before: cur,
          after: fetched
        });
      }
    }
  }

  const hasChanges =
    validationErrors.length === 0 && (addedCount > 0 || modifiedCount > 0 || removedCount > 0);

  return {
    targetYear,
    currentCount: currentItems.length,
    fetchedCount: fetchedItems ? fetchedItems.length : 0,
    addedCount,
    modifiedCount,
    removedCount,
    unchangedCount,
    hasChanges,
    rows,
    validationErrors
  };
}

/**
 * 캘린더 안정적 지문 직렬화 (H07 최신성 점검용 / HOL-D03)
 * JSON 구조화 튜플 직렬화로 구분자(|, ;, 줄바꿈 등) 삽입 공격 및 충돌 완전 방지
 */
export function holidayCalendarFingerprint(calendar: HolidayCalendar | null | undefined): string {
  if (!calendar) return "empty";
  const sortedItems = [...(calendar.items || [])].sort((a, b) => {
    const dateCmp = a.holidayDate.localeCompare(b.holidayDate);
    if (dateCmp !== 0) return dateCmp;
    return a.id.localeCompare(b.id);
  });
  const payload = [
    calendar.id,
    calendar.year,
    calendar.sourceName || "",
    sortedItems.map((i) => [i.id, i.holidayDate, i.name, i.isSubstitute ? 1 : 0])
  ];
  return JSON.stringify(payload);
}
