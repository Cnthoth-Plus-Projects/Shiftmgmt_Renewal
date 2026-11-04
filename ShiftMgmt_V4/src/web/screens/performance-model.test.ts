import { describe, expect, it } from "vitest";
import type {
  PerformanceEntryRecord,
  PerformanceOverviewRow
} from "../../shared/domain/performance-file";
import type { ShiftPatternRecord } from "../../shared/domain/model";
import {
  calculatePerformanceKpi,
  comparePerformanceRows,
  deriveRowBadges,
  flattenPerformanceGroups,
  formatCurrencyOrUnsaved,
  formatMinutesToHours,
  formatSectionLabel,
  getDensityHeights,
  getPerformanceDuty,
  getPerformancePageSelection,
  matchPerformanceRow,
  type PerformanceFilterState,
  type PerformanceDutyContext
} from "./performance-model";

const createMockRow = (overrides: Partial<PerformanceOverviewRow> = {}): PerformanceOverviewRow => {
  const defaultEntry: PerformanceEntryRecord = {
    id: "entry-1",
    performanceFileId: "file-1",
    logicalKey: "siteA_2026-05-01_EMP001",
    scheduleMonth: "2026-05",
    scheduleKey: "siteA_2026-05",
    siteName: "서울본사",
    employeeCode: "EMP001",
    employeeName: "홍길동",
    workDate: "2026-05-01",
    workType: "대체",
    section: "substitute",
    dutyCode: "D",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    totalWorkMinutes: 480,
    baseWorkMinutes: 480,
    overtimeMinutes: 0,
    nightMinutes: 0,
    sourceRowNumber: 1,
    sortOrder: 1,
    teamLabel: "1조",
    alerts: [],
    status: "pending"
  };

  return {
    rowId: "row-1",
    fileId: "file-1",
    entryId: "entry-1",
    logicalKey: defaultEntry.logicalKey,
    sourceFileName: "실적_202605_서울본사.xlsx",
    sourceFileExists: true,
    sourceDirectoryType: "pending",
    sourceReceivedAt: "2026-05-02T10:00:00Z",
    entry: { ...defaultEntry, ...(overrides.entry || {}) },
    approvalStatus: "pending",
    canApprove: true,
    needsReapproval: false,
    reapprovalStatus: "none",
    isChangeLocked: false,
    canHideApprovedRow: false,
    ...overrides
  };
};

describe("performance-model", () => {
  describe("configured duty names and page selection", () => {
    const pattern = (id: string, siteId: string, labels: string[], effectiveFrom = "2026-01-01"): ShiftPatternRecord => ({
      id, siteId, name: id, effectiveFrom, status: "active", createdAt: effectiveFrom,
      teamCount: 2, cycleLength: 2, patternCode: "DN", startIndexRule: "fixed",
      steps: [], teamIndexes: [], cycles: [], teamCycleAssignments: [], teamCapacities: [], teamSettings: [], poolEnabled: false,
      dutyTypes: labels.map((label, sortOrder) => ({ id: `custom-${sortOrder}`, kind: "work", label, sortOrder }))
    });
    const row = (code = "D", siteName = "서울본사") => createMockRow({ entry: { ...createMockRow().entry, dutyCode: code, siteName } });
    const context = (): PerformanceDutyContext => ({
      sites: [{ id: "site-a", name: "서울본사" }, { id: "site-b", name: "부산지사" }],
      patterns: [pattern("a", "site-a", ["1근", "2근"]), pattern("b", "site-b", ["주간", "야간"])], schedules: []
    });

    it("shows configured 1근/2근 names in the same D/N colors as the site palette", () => {
      expect(getPerformanceDuty(row(), context())).toEqual({ code: "D", label: "1근", className: "perf-duty-D" });
      expect(getPerformanceDuty(row("N"), context())).toEqual({ code: "N", label: "2근", className: "perf-duty-N" });
      expect(getPerformanceDuty(row("D", "부산지사"), context()).label).toBe("주간");
    });
    it("uses a saved historical pattern even when a newer active version exists", () => {
      const ctx = context();
      const historical = { ...pattern("old", "site-a", ["옛주간", "옛야간"]), status: "inactive" as const };
      expect(getPerformanceDuty(row(), { ...ctx, patterns: [...ctx.patterns, historical], schedules: [{ siteId: "site-a", scheduleMonth: "2026-05", patternId: "old" }] }).label).toBe("옛주간");
    });
    it("resolves the month's version instead of applying a future name", () => {
      const ctx = context();
      expect(getPerformanceDuty(row(), { ...ctx, patterns: [...ctx.patterns, pattern("future", "site-a", ["새주간", "새야간"], "2026-06-01")] }).label).toBe("1근");
    });
    it("falls back to a code label for conflicting saved patterns or duplicate site names", () => {
      const ctx = context();
      expect(getPerformanceDuty(row(), { ...ctx, schedules: ["a", "other"].map(patternId => ({ siteId: "site-a", scheduleMonth: "2026-05", patternId })) }).label).toBe("주간");
      expect(getPerformanceDuty(row(), { ...ctx, sites: [...ctx.sites, { id: "duplicate", name: "서울본사" }] }).label).toBe("주간");
    });
    it("keeps unknown or missing codes neutral and preserves custom labels as text", () => {
      expect(getPerformanceDuty(row("new-code"), context())).toEqual({ code: "NEW-CODE", label: "NEW-CODE", className: "perf-duty-unknown" });
      expect(getPerformanceDuty(row(""), context()).label).toBe("미확인");
      expect(getPerformanceDuty(row(), { ...context(), patterns: [pattern("markup", "site-a", ['<img src=x onerror="alert(1)">', "2근"])] }).label).toContain("<img");
    });
    it("selects the target page's first row instead of anchoring refresh to page one", () => {
      const rows = Array.from({ length: 6 }, (_, i) => createMockRow({ rowId: `row-${i}` }));
      const selected = getPerformancePageSelection(rows, { start: 3, end: 6 }, "row-0", new Set());
      expect(selected?.rowId).toBe("row-3");
      expect(getPerformancePageSelection(rows, { start: 3, end: 6 }, selected!.rowId, new Set())?.rowId).toBe("row-3");
      expect(getPerformancePageSelection(rows, { start: 3, end: 6 }, "row-5", new Set())?.rowId).toBe("row-5");
    });
    it("skips collapsed groups and clears selection when a page has no visible rows", () => {
      const rows = [row(), { ...row("N", "부산지사"), rowId: "other" }];
      expect(getPerformancePageSelection(rows, { start: 0, end: 2 }, rows[0].rowId, new Set(["서울본사"]))?.rowId).toBe("other");
      expect(getPerformancePageSelection(rows, { start: 0, end: 2 }, rows[0].rowId, new Set(["서울본사", "부산지사"]))).toBeNull();
      expect(getPerformancePageSelection([], { start: 0, end: 0 }, rows[0].rowId, new Set())).toBeNull();
    });
  });
  describe("deriveRowBadges (8가지 상태 배지 파생)", () => {
    it("법정휴일 근로는 legal-holiday 배지가 부여된다", () => {
      const row = createMockRow({
        entry: {
          ...createMockRow().entry,
          section: "legal-holiday",
          workType: "휴일"
        }
      });
      const badges = deriveRowBadges(row);
      expect(badges.some(b => b.type === "legal-holiday")).toBe(true);
      expect(badges.find(b => b.type === "legal-holiday")?.label).toBe("법정휴일");
    });

    it("Pool 작업자이거나 미지급 대상인 경우 수당 미지급 배지가 부여된다", () => {
      const row = createMockRow({
        entry: {
          ...createMockRow().entry,
          isPoolWorker: true,
          employeeName: "김풀 (P)"
        },
        approvalStatus: "non-payable"
      });
      const badges = deriveRowBadges(row);
      expect(badges.some(b => b.type === "non-payable")).toBe(true);
      expect(badges.find(b => b.type === "non-payable")?.description).toContain("Pool");
    });

    it("품의 잠금 또는 변경 불가 시 locked 배지가 부여된다", () => {
      const row = createMockRow({
        isChangeLocked: true,
        changeLockedReason: "2026년 5월 수당 품의 완료"
      });
      const badges = deriveRowBadges(row);
      expect(badges.some(b => b.type === "locked")).toBe(true);
      expect(badges.find(b => b.type === "locked")?.description).toContain("수당 품의 완료");
    });

    it("재승인 대기 및 재승인 완료 상태를 올바르게 구분한다", () => {
      const rowPending = createMockRow({
        needsReapproval: true,
        reapprovalStatus: "pending"
      });
      const badgesPending = deriveRowBadges(rowPending);
      expect(badgesPending.some(b => b.type === "reapproval-pending")).toBe(true);
      expect(badgesPending.some(b => b.type === "pending")).toBe(false);

      const rowCompleted = createMockRow({
        needsReapproval: true,
        reapprovalStatus: "completed"
      });
      const badgesCompleted = deriveRowBadges(rowCompleted);
      expect(badgesCompleted.some(b => b.type === "reapproval-completed")).toBe(true);
    });

    it("법정휴일 + 승인 + 품의잠금의 경우 복수 배지가 함께 병기된다", () => {
      const row = createMockRow({
        entry: {
          ...createMockRow().entry,
          section: "legal-holiday"
        },
        approvalStatus: "approved",
        isChangeLocked: true,
        latestApprovalAt: "2026-05-10T09:00:00Z",
        latestApprovalByName: "관리자"
      });
      const badges = deriveRowBadges(row);
      const types = badges.map(b => b.type);
      expect(types).toContain("legal-holiday");
      expect(types).toContain("approved");
      expect(types).toContain("locked");
    });

    it("반려 상태인 경우 rejected 배지가 부여된다", () => {
      const row = createMockRow({
        approvalStatus: "rejected"
      });
      const badges = deriveRowBadges(row);
      expect(badges.some(b => b.type === "rejected")).toBe(true);
    });
  });

  describe("comparePerformanceRows (전역 정렬)", () => {
    it("근무지명 -> 근무일자 -> 조 -> 사번 순서로 정렬한다", () => {
      const rows: PerformanceOverviewRow[] = [
        createMockRow({
          rowId: "1",
          entry: { ...createMockRow().entry, siteName: "부산지사", workDate: "2026-05-02", employeeCode: "EMP002" }
        }),
        createMockRow({
          rowId: "2",
          entry: { ...createMockRow().entry, siteName: "서울본사", workDate: "2026-05-01", employeeCode: "EMP001", teamLabel: "2조" }
        }),
        createMockRow({
          rowId: "3",
          entry: { ...createMockRow().entry, siteName: "서울본사", workDate: "2026-05-01", employeeCode: "EMP003", teamLabel: "1조" }
        }),
        createMockRow({
          rowId: "4",
          entry: { ...createMockRow().entry, siteName: "서울본사", workDate: "2026-05-02", employeeCode: "EMP001" }
        })
      ];

      const sorted = [...rows].sort(comparePerformanceRows);
      // 한글 자음순: 'ㅂ'(부산지사)이 'ㅅ'(서울본사)보다 앞선다.
      // 부산지사(1) -> 서울본사 5/1 1조(3) -> 서울본사 5/1 2조(2) -> 서울본사 5/2(4)
      expect(sorted.map(r => r.rowId)).toEqual(["1", "3", "2", "4"]);
    });
  });

  describe("matchPerformanceRow (필터링)", () => {
    const baseFilter: PerformanceFilterState = {
      scheduleMonth: "2026-05",
      siteName: "all",
      section: "all",
      approvalScope: "pending",
      statusFilter: "all",
      searchQuery: "",
      density: "normal"
    };

    it("근무지 필터가 동작한다", () => {
      const row = createMockRow({
        entry: { ...createMockRow().entry, siteName: "인천센터" }
      });
      expect(matchPerformanceRow(row, { ...baseFilter, siteName: "인천센터" })).toBe(true);
      expect(matchPerformanceRow(row, { ...baseFilter, siteName: "서울본사" })).toBe(false);
    });

    it("섹션(유형) 필터가 동작한다", () => {
      const row = createMockRow({
        entry: { ...createMockRow().entry, section: "overtime" }
      });
      expect(matchPerformanceRow(row, { ...baseFilter, section: "overtime" })).toBe(true);
      expect(matchPerformanceRow(row, { ...baseFilter, section: "substitute" })).toBe(false);
    });

    it("상태 필터가 동작한다", () => {
      const rowApproved = createMockRow({ approvalStatus: "approved" });
      const rowPending = createMockRow({ approvalStatus: "pending", needsReapproval: false });

      expect(matchPerformanceRow(rowApproved, { ...baseFilter, statusFilter: "approved" })).toBe(true);
      expect(matchPerformanceRow(rowPending, { ...baseFilter, statusFilter: "approved" })).toBe(false);
      expect(matchPerformanceRow(rowPending, { ...baseFilter, statusFilter: "pending" })).toBe(true);
    });

    it("검색어(사번, 이름, 파일명, 사유) 매칭이 동작한다", () => {
      const row = createMockRow({
        sourceFileName: "202605_특별근무_실적.xlsx",
        entry: {
          ...createMockRow().entry,
          employeeCode: "K12345",
          employeeName: "이몽룡",
          reason: "시스템 야간 긴급 패치 지원"
        }
      });

      expect(matchPerformanceRow(row, { ...baseFilter, searchQuery: "k12345" })).toBe(true);
      expect(matchPerformanceRow(row, { ...baseFilter, searchQuery: "이몽룡" })).toBe(true);
      expect(matchPerformanceRow(row, { ...baseFilter, searchQuery: "특별근무" })).toBe(true);
      expect(matchPerformanceRow(row, { ...baseFilter, searchQuery: "긴급 패치" })).toBe(true);
      expect(matchPerformanceRow(row, { ...baseFilter, searchQuery: "성춘향" })).toBe(false);
    });
  });

  describe("calculatePerformanceKpi (KPI 계산)", () => {
    it("스냅샷 행들로부터 통계치를 정확히 집계한다", () => {
      const rows: PerformanceOverviewRow[] = [
        createMockRow({ approvalStatus: "approved", canApprove: false }),
        createMockRow({ approvalStatus: "pending", canApprove: true }),
        createMockRow({ approvalStatus: "rejected", canApprove: false }),
        createMockRow({
          approvalStatus: "pending",
          needsReapproval: true,
          reapprovalStatus: "pending",
          canApprove: true
        }),
        createMockRow({
          approvalStatus: "approved",
          isChangeLocked: true,
          canApprove: false
        }),
        createMockRow({
          approvalStatus: "non-payable",
          entry: { ...createMockRow().entry, section: "legal-holiday" },
          canApprove: false
        })
      ];

      const kpi = calculatePerformanceKpi(rows);
      expect(kpi.totalRows).toBe(6);
      expect(kpi.approvedCount).toBe(2);
      expect(kpi.pendingCount).toBe(1);
      expect(kpi.rejectedCount).toBe(1);
      expect(kpi.needsReapprovalCount).toBe(1);
      expect(kpi.changeLockedCount).toBe(1);
      expect(kpi.nonPayableCount).toBe(1);
      expect(kpi.legalHolidayCount).toBe(1);
      expect(kpi.approvableCount).toBe(2);
    });
  });

  describe("flattenPerformanceGroups (그룹화 및 접기)", () => {
    it("접히지 않은 근무지 그룹은 헤더와 하위 행들을 순서대로 반환한다", () => {
      const rows: PerformanceOverviewRow[] = [
        createMockRow({ rowId: "1", entry: { ...createMockRow().entry, siteName: "서울본사" } }),
        createMockRow({ rowId: "2", entry: { ...createMockRow().entry, siteName: "서울본사" } }),
        createMockRow({ rowId: "3", entry: { ...createMockRow().entry, siteName: "부산지사" } })
      ];

      const collapsed = new Set<string>();
      const items = flattenPerformanceGroups(rows, collapsed);

      // 부산지사(헤더) -> row 3 -> 서울본사(헤더) -> row 1 -> row 2
      expect(items.length).toBe(5);
      expect(items[0]).toEqual({
        kind: "group-header",
        siteName: "부산지사",
        isCollapsed: false,
        totalInSite: 1
      });
      expect(items[1].kind).toBe("row");
      expect(items[1].row?.rowId).toBe("3");
      expect(items[2]).toEqual({
        kind: "group-header",
        siteName: "서울본사",
        isCollapsed: false,
        totalInSite: 2
      });
      expect(items[3].row?.rowId).toBe("1");
      expect(items[4].row?.rowId).toBe("2");
    });

    it("접힌 근무지 그룹은 하위 행을 생성하지 않고 헤더만 반환한다", () => {
      const rows: PerformanceOverviewRow[] = [
        createMockRow({ rowId: "1", entry: { ...createMockRow().entry, siteName: "서울본사" } }),
        createMockRow({ rowId: "2", entry: { ...createMockRow().entry, siteName: "부산지사" } })
      ];

      const collapsed = new Set<string>(["서울본사"]);
      const items = flattenPerformanceGroups(rows, collapsed);

      // 부산지사(헤더) -> row 2 -> 서울본사(헤더 접힘)
      expect(items.length).toBe(3);
      expect(items[2]).toEqual({
        kind: "group-header",
        siteName: "서울본사",
        isCollapsed: true,
        totalInSite: 1
      });
    });
  });

  describe("formatCurrencyOrUnsaved (0원과 미저장 구분)", () => {
    it("계산 기록이 없거나 값이 null/undefined이면 '저장 전'을 반환한다", () => {
      expect(formatCurrencyOrUnsaved(null, false)).toBe("저장 전");
      expect(formatCurrencyOrUnsaved(0, false)).toBe("저장 전");
      expect(formatCurrencyOrUnsaved(undefined, true)).toBe("저장 전");
    });

    it("계산 기록이 있고 실제 0원이면 '0원'을 반환한다", () => {
      expect(formatCurrencyOrUnsaved(0, true)).toBe("0원");
    });

    it("양수 금액은 천 단위 구분 기호와 함께 반환한다", () => {
      expect(formatCurrencyOrUnsaved(125000, true)).toBe("125,000원");
    });
  });

  describe("formatMinutesToHours 및 getDensityHeights", () => {
    it("분을 시간과 분으로 변환한다", () => {
      expect(formatMinutesToHours(0)).toBe("0분");
      expect(formatMinutesToHours(45)).toBe("45분");
      expect(formatMinutesToHours(120)).toBe("2시간");
      expect(formatMinutesToHours(150)).toBe("2시간 30분");
    });

    it("밀도 모드별 높이를 반환한다", () => {
      expect(getDensityHeights("compact")).toEqual({ rowHeight: 32, groupHeight: 28 });
      expect(getDensityHeights("normal")).toEqual({ rowHeight: 38, groupHeight: 32 });
      expect(getDensityHeights("spacious")).toEqual({ rowHeight: 46, groupHeight: 36 });
    });
  });

  describe("formatSectionLabel 및 scheduleMonth 필터링 (D07, D08)", () => {
    it("업무코드 영문을 한국어 라벨로 변환한다", () => {
      expect(formatSectionLabel("substitute")).toBe("대체근무");
      expect(formatSectionLabel("legal-holiday")).toBe("법정휴일");
      expect(formatSectionLabel("overtime")).toBe("연장근무");
      expect(formatSectionLabel("custom-type")).toBe("custom-type");
      expect(formatSectionLabel(null)).toBe("-");
    });

    it("filter.scheduleMonth가 일치하는 행만 매칭한다", () => {
      const rowMay = createMockRow({ entry: { ...createMockRow().entry, workDate: "2026-05-15" } });
      const rowJune = createMockRow({ entry: { ...createMockRow().entry, workDate: "2026-06-01" } });

      const baseFilter: PerformanceFilterState = {
        scheduleMonth: "2026-05",
        siteName: "all",
        section: "all",
        approvalScope: "pending",
        statusFilter: "all",
        searchQuery: "",
        density: "normal"
      };

      expect(matchPerformanceRow(rowMay, baseFilter)).toBe(true);
      expect(matchPerformanceRow(rowJune, baseFilter)).toBe(false);
    });
  });
});
