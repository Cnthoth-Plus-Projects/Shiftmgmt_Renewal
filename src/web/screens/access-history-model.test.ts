import { describe, expect, it } from "vitest";
import {
  ACCESS_HISTORY_PAGE_SIZE,
  KEYWORD_DEBOUNCE_MS,
  buildLogListQuery,
  createDefaultDateRange,
  createMonthStartDate,
  formatAccessDateTime,
  isLeapYear,
  isValidCalendarDate,
  resolveActionBadge,
  resolveLogDetails,
  resolveRoleLabel,
  sortUserOptions,
  validateDateRange,
} from "./access-history-model";
import type { AccessLogRecord } from "../../shared/domain/access-log";
import type { UserRecord } from "../../shared/domain/model";
import { createTodayDateInputValue } from "../../shared/lib/local-date";

describe("access-history-model", () => {
  it("상수 및 기본 페이징/디바운스 규격 검증", () => {
    expect(ACCESS_HISTORY_PAGE_SIZE).toBe(200);
    expect(KEYWORD_DEBOUNCE_MS).toBe(250);
  });

  // ① KST 자정 부근의 로컬 기본월/오늘
  it("① 로컬 기본 날짜 범위 생성: 로컬 월초(01일) 및 오늘 일자 정확성", () => {
    const today = createTodayDateInputValue();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const monthStart = createMonthStartDate();
    expect(monthStart).toBe(`${today.slice(0, 8)}01`);

    const range = createDefaultDateRange();
    expect(range.dateFrom).toBe(monthStart);
    expect(range.dateTo).toBe(today);
    expect(range.dateFrom <= range.dateTo).toBe(true);
  });

  // ② 윤년 유효일·불가능날짜 검증
  it("② 달력 유효 날짜 및 윤년 2월 29일 검증", () => {
    // 윤년 판정
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);

    // 윤년 2월 29일 유효
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("2000-02-29")).toBe(true);

    // 평년 2월 29일 불가
    expect(isValidCalendarDate("2025-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2100-02-29")).toBe(false);

    // 30일/31일 불가능 날짜
    expect(isValidCalendarDate("2026-04-30")).toBe(true);
    expect(isValidCalendarDate("2026-04-31")).toBe(false);
    expect(isValidCalendarDate("2026-06-31")).toBe(false);
    expect(isValidCalendarDate("2026-11-31")).toBe(false);

    // 잘못된 월/일/형식
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
    expect(isValidCalendarDate("2026-00-10")).toBe(false);
    expect(isValidCalendarDate("2026-05-00")).toBe(false);
    expect(isValidCalendarDate("2026-05-32")).toBe(false);
    expect(isValidCalendarDate("invalid-date")).toBe(false);
    expect(isValidCalendarDate("2026/05/10")).toBe(false);
    expect(isValidCalendarDate("")).toBe(false);
  });

  // ③ 역전기간 거부 및 빈 경계 허용
  it("③ 날짜 범위 검증: 역전 기간 거부, 유효하지 않은 날짜 거부, 빈 경계 허용", () => {
    // 정상 범위
    expect(validateDateRange("2026-05-01", "2026-05-31")).toEqual({ valid: true });
    expect(validateDateRange("2026-05-20", "2026-05-20")).toEqual({ valid: true });

    // 빈 경계 허용 (한쪽 또는 양쪽 모두 빈 문자열)
    expect(validateDateRange("", "2026-05-31")).toEqual({ valid: true });
    expect(validateDateRange("2026-05-01", "")).toEqual({ valid: true });
    expect(validateDateRange("", "")).toEqual({ valid: true });
    expect(validateDateRange("   ", "   ")).toEqual({ valid: true });

    // 시작일 > 종료일 역전 거부
    const reversed = validateDateRange("2026-05-31", "2026-05-01");
    expect(reversed.valid).toBe(false);
    expect(reversed.error).toContain("조회 시작일이 조회 종료일보다 늦을 수 없습니다");

    // 잘못된 날짜 형식 거부
    const invalidFrom = validateDateRange("2026-02-29", "2026-05-01");
    expect(invalidFrom.valid).toBe(false);
    expect(invalidFrom.error).toContain("조회 시작일이 올바른 날짜 형식이 아닙니다");

    const invalidTo = validateDateRange("2026-05-01", "2026-04-31");
    expect(invalidTo.valid).toBe(false);
    expect(invalidTo.error).toContain("조회 종료일이 올바른 날짜 형식이 아닙니다");
  });

  // ④ 동명이인 다른 loginId 옵션 보존 및 가나다 정렬
  it("④ 사용자 목록 정렬: 한국어 displayName 가나다 정렬 및 동명이인 loginId 식별자 보존", () => {
    const rawUsers: UserRecord[] = [
      {
        id: "u-3",
        loginId: "kim-b",
        displayName: "김철수",
        role: "operator",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "u-1",
        loginId: "park",
        displayName: "박영희",
        role: "planner",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "u-2",
        loginId: "kim-a",
        displayName: "김철수",
        role: "reviewer",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "u-0",
        loginId: "admin",
        displayName: "관리자",
        role: "admin",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];

    const sorted = sortUserOptions(rawUsers);
    expect(sorted).toHaveLength(4);

    // 관리자 -> 김철수(kim-a) -> 김철수(kim-b) -> 박영희
    expect(sorted[0]).toEqual({ loginId: "admin", label: "관리자 (admin)" });
    expect(sorted[1]).toEqual({ loginId: "kim-a", label: "김철수 (kim-a)" });
    expect(sorted[2]).toEqual({ loginId: "kim-b", label: "김철수 (kim-b)" });
    expect(sorted[3]).toEqual({ loginId: "park", label: "박영희 (park)" });
  });

  // ⑤ 상세 누락('-'), 특수문자, invalid 시간 원문 보존
  it("⑤ 상세 내용 및 시간 포맷팅: routeLabel/details 조합, 누락 시 '-', invalid 시간 원문 보존", () => {
    // 1) routeLabel과 details 모두 있는 경우
    const rec1: AccessLogRecord = {
      id: "1",
      userId: "u-1",
      loginId: "admin",
      displayName: "관리자",
      role: "admin",
      actionType: "route-view",
      actionLabel: "화면 이동",
      routeKey: "user-mgmt",
      routeLabel: "사용자 관리",
      details: "목록 조회",
      occurredAt: "2026-05-20T14:32:00.000Z",
    };
    expect(resolveLogDetails(rec1)).toBe("사용자 관리 / 목록 조회");

    // 2) 한쪽만 있는 경우
    const rec2: AccessLogRecord = {
      ...rec1,
      routeLabel: undefined,
      details: "단독 상세 <script>alert(1)</script>",
    };
    expect(resolveLogDetails(rec2)).toBe("단독 상세 <script>alert(1)</script>");

    const rec3: AccessLogRecord = {
      ...rec1,
      routeLabel: "단독 화면",
      details: undefined,
    };
    expect(resolveLogDetails(rec3)).toBe("단독 화면");

    // 3) 둘 다 없는 경우
    const rec4: AccessLogRecord = {
      ...rec1,
      routeLabel: undefined,
      details: undefined,
    };
    expect(resolveLogDetails(rec4)).toBe("-");

    // 4) 시간 포맷팅
    expect(formatAccessDateTime("")).toBe("-");
    // invalid ISO 문자열 -> 원문 보존
    expect(formatAccessDateTime("not-a-valid-timestamp")).toBe("not-a-valid-timestamp");
    // valid ISO 일시 -> ko-KR 포맷 포함
    const formatted = formatAccessDateTime("2026-05-20T14:32:00.000Z");
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  // ⑥ G1 행의 배지/한국어권한과 query exact identity
  it("⑥ 배지 분류, 한국어 권한 매핑, 불변 쿼리 구성 검증", () => {
    // 배지 매핑
    expect(resolveActionBadge("sign-in")).toEqual({ tone: "neutral", className: "badge-neutral" });
    expect(resolveActionBadge("route-view")).toEqual({ tone: "neutral", className: "badge-neutral" });

    expect(resolveActionBadge("performance-approve")).toEqual({ tone: "approved", className: "badge-approved" });
    expect(resolveActionBadge("performance-reapprove")).toEqual({ tone: "approved", className: "badge-approved" });
    expect(resolveActionBadge("template-approve")).toEqual({ tone: "approved", className: "badge-approved" });
    expect(resolveActionBadge("allowance-approve")).toEqual({ tone: "approved", className: "badge-approved" });
    expect(resolveActionBadge("schedule-publish")).toEqual({ tone: "info", className: "badge-info" });

    // hide-approved는 approve 문자열이 포함되어 있어도 danger로 매핑되어야 함 (substring 충돌 방지 회귀)
    expect(resolveActionBadge("performance-hide-approved")).toEqual({ tone: "danger", className: "badge-danger" });
    expect(resolveActionBadge("shift-pattern-deactivate")).toEqual({ tone: "danger", className: "badge-danger" });
    expect(resolveActionBadge("employee-delete")).toEqual({ tone: "danger", className: "badge-danger" });
    expect(resolveActionBadge("sign-in-failed")).toEqual({ tone: "danger", className: "badge-danger" });
    expect(resolveActionBadge("performance-reject")).toEqual({ tone: "danger", className: "badge-danger" });

    expect(resolveActionBadge("database-backup-run")).toEqual({ tone: "info", className: "badge-info" });
    expect(resolveActionBadge("password-change")).toEqual({ tone: "info", className: "badge-info" });

    // 권한 한글 매핑 (정본 getRoleLabel)
    expect(resolveRoleLabel("admin")).toBe("관리자");
    expect(resolveRoleLabel("operator")).toBe("사용자");
    expect(resolveRoleLabel("planner")).toBe("계획 담당");
    expect(resolveRoleLabel("reviewer")).toBe("승인 담당");

    // 쿼리 생성
    const query = buildLogListQuery({
      dateFrom: " 2026-05-01 ",
      dateTo: " 2026-05-20 ",
      loginId: "admin",
      actionType: "sign-in",
      keyword: " 로그인 ",
    });
    expect(query).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-20",
      loginId: "admin",
      actionType: "sign-in",
      keyword: "로그인",
    });

    // "all" 및 빈 문자열 생략 검증
    const queryAll = buildLogListQuery({
      dateFrom: "",
      dateTo: "",
      loginId: "all",
      actionType: "all",
      keyword: "   ",
    });
    expect(queryAll).toEqual({});
  });
});
