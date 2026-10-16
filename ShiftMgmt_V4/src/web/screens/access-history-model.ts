// 활동 이력 화면 순수 모델 및 헬퍼 함수
import type { AccessLogActionType, AccessLogRecord } from "../../shared/domain/access-log";
import type { AccessLogListQuery } from "../../shared/bridge/contracts";
import type { UserRecord, UserRole } from "../../shared/domain/model";
import { getRoleLabel } from "../../shared/domain/authorization";
import { createTodayDateInputValue } from "../../shared/lib/local-date";

export const ACCESS_HISTORY_PAGE_SIZE = 200;
export const KEYWORD_DEBOUNCE_MS = 250;

/** 운영 PC 로컬 기준 월초(YYYY-MM-01) 날짜 문자열 */
export function createMonthStartDate(): string {
  const today = createTodayDateInputValue();
  return `${today.slice(0, 8)}01`;
}

/** 운영 PC 로컬 기준 기본 날짜 범위 (월초 ~ 오늘) */
export function createDefaultDateRange(): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: createMonthStartDate(),
    dateTo: createTodayDateInputValue(),
  };
}

export interface DateValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * YYYY-MM-DD 형식 및 실제 달력상의 유효 날짜 검증
 * (윤년 검증, 2월 29일, 30일/31일 구분 등)
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  // 각 월별 일수 검증
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= daysInMonth[month - 1];
}

/** 윤년 계산 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 활동 이력 조회 날짜 범위 검증
 * - 빈 문자열은 해당 경계 생략으로 허용
 * - 날짜가 입력된 경우 실제 존재하는 날짜 형식이어야 함
 * - 시작일과 종료일이 모두 입력된 경우 시작일 <= 종료일이어야 함
 */
export function validateDateRange(dateFrom: string, dateTo: string): DateValidationResult {
  const from = dateFrom.trim();
  const to = dateTo.trim();

  if (from !== "" && !isValidCalendarDate(from)) {
    return {
      valid: false,
      error: "조회 시작일이 올바른 날짜 형식이 아닙니다.",
    };
  }

  if (to !== "" && !isValidCalendarDate(to)) {
    return {
      valid: false,
      error: "조회 종료일이 올바른 날짜 형식이 아닙니다.",
    };
  }

  if (from !== "" && to !== "" && from > to) {
    return {
      valid: false,
      error: "조회 시작일이 조회 종료일보다 늦을 수 없습니다.",
    };
  }

  return { valid: true };
}

/**
 * 활동시간 문자열 포맷팅
 * - ISO 문자열 -> ko-KR 로컬 일시 (24시간제)
 * - invalid 값이면 안전한 원문 문자열 반환
 */
export function formatAccessDateTime(value: string): string {
  if (!value) return "-";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return value;
  }
  return target.toLocaleString("ko-KR", {
    hour12: false,
  });
}

/**
 * 상세 내용 조합
 * - routeLabel / details 조합
 * - 둘 다 있으면 `${routeLabel} / ${details}`
 * - 한쪽만 있으면 해당 값
 * - 둘 다 없으면 `"-"`
 */
export function resolveLogDetails(record: AccessLogRecord): string {
  const route = record.routeLabel?.trim();
  const details = record.details?.trim();

  if (route && details) {
    return `${route} / ${details}`;
  }
  return route || details || "-";
}

export type ActionBadgeTone = "neutral" | "approved" | "danger" | "info";

export interface ActionBadgeStyle {
  tone: ActionBadgeTone;
  className: string;
}

/**
 * 활동 종류별 배지 색상 정본 매핑 (디자인 시스템 v1.3 & 12-access-logs-1.html)
 * - sign-in, route-view: neutral (#F1F2F4 / #4B5563)
 * - approve, reapprove, publish: approved (#E8F5EE / #1E7A46)
 * - delete, reject, fail, deactivate, hide-approved: danger (#FCEBE9 / #C0392B)
 * - 그 외(백업, 설정, 인력, 시급 등): info (#EEF1FB / #3E56B6)
 */
export function resolveActionBadge(actionType: AccessLogActionType): ActionBadgeStyle {
  if (actionType === "sign-in" || actionType === "route-view") {
    return { tone: "neutral", className: "badge-neutral" };
  }

  // danger 우선 판정: hide-approved, delete, reject, fail, deactivate (approval보다 먼저 검사하여 hide-approved 충돌 방지)
  if (
    actionType.includes("hide-approved") ||
    actionType.includes("delete") ||
    actionType.includes("reject") ||
    actionType.includes("fail") ||
    actionType.includes("deactivate")
  ) {
    return { tone: "danger", className: "badge-danger" };
  }

  // approved 판정: approve, reapprove만 (publish 제외)
  if (
    actionType.endsWith("-approve") ||
    actionType.endsWith("-reapprove")
  ) {
    return { tone: "approved", className: "badge-approved" };
  }

  return { tone: "info", className: "badge-info" };
}

export interface UserSelectOption {
  loginId: string;
  label: string;
}

/**
 * 사용자 목록 정렬 및 옵션 매핑
 * - 동명이인을 displayName으로 합치지 않고 각각 loginId 식별자 보존
 * - 한국어 displayName 가나다 정렬, 동일 시 loginId 정렬
 */
export function sortUserOptions(users: UserRecord[]): UserSelectOption[] {
  return [...users]
    .sort((a, b) => {
      const cmp = a.displayName.localeCompare(b.displayName, "ko");
      if (cmp !== 0) return cmp;
      return a.loginId.localeCompare(b.loginId, "en");
    })
    .map((u) => ({
      loginId: u.loginId,
      label: `${u.displayName} (${u.loginId})`,
    }));
}

/**
 * 권한 표시 문자열 획득
 */
export function resolveRoleLabel(role: UserRole): string {
  return getRoleLabel(role);
}

export interface LogFilterParams {
  dateFrom: string;
  dateTo: string;
  loginId: string;
  actionType: string;
  keyword: string;
}

/**
 * API 요청용 불변 쿼리 스냅샷 구성
 */
export function buildLogListQuery(params: LogFilterParams): AccessLogListQuery {
  const query: AccessLogListQuery = {};

  const from = params.dateFrom.trim();
  if (from !== "") {
    query.dateFrom = from;
  }

  const to = params.dateTo.trim();
  if (to !== "") {
    query.dateTo = to;
  }

  if (params.loginId && params.loginId !== "all") {
    query.loginId = params.loginId.trim();
  }

  if (params.actionType && params.actionType !== "all") {
    query.actionType = params.actionType.trim() as AccessLogActionType;
  }

  const kw = params.keyword.trim();
  if (kw !== "") {
    query.keyword = kw;
  }

  return query;
}
