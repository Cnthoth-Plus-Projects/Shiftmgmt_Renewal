import { describe, expect, it } from "vitest";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type { AllowanceProposalPreview } from "../../shared/domain/allowance-workflow";
import {
  calculateAllowanceKpi,
  compareAllowanceRows,
  computeAllowanceDataFingerprint,
  createPreviewBinding,
  deriveAllowanceBadges,
  formatAllowanceLineCodeLabel,
  formatCurrency,
  formatStatusLabel,
  formatWorkMinutes,
  formatWorkTypeLabel,
  getAllowancePageSelection,
  getDensityHeights,
  groupAllowanceRows,
  inspectAllowanceSnapshot,
  isValidCalendarDate,
  matchAllowanceRow,
  validateFreshRecordsForAction,
  validatePreviewBinding,
  type AllowanceFilterState,
} from "./allowance-model";

const makeMockRecord = (
  overrides?: Partial<AllowanceCalculationResultRecord>
): AllowanceCalculationResultRecord => ({
  id: "calc-001",
  fileId: "file-001",
  fileName: "2026_05_강남사업소.xlsx",
  entryId: "entry-001",
  employeeCode: "EMP-001",
  employeeName: "홍길동",
  siteName: "강남사업소",
  workDate: "2026-05-11",
  workType: "overtime",
  hourlyRate: 10000,
  rateVersionId: "rv-001",
  rateVersionLabel: "2026년 상반기",
  status: "pending",
  signature: "sig-001",
  snapshot: {
    id: "calc-001",
    performanceApprovalId: "pa-001",
    calculationVersion: 1,
    businessCategoryCode: "weekday-overtime",
    businessCategoryLabel: "평일 연장근무",
    createdAt: "2026-05-12T00:00:00.000Z",
    breakdown: {
      totalWorkMinutes: 240,
      baseWorkMinutes: 0,
      overtimeMinutes: 240,
      nightMinutes: 0,
      holidayMinutes: 0,
      substituteMinutes: 0,
    },
    lines: [
      {
        allowanceCode: "overtime",
        workMinutes: 240,
        multiplier: 1.5,
        amount: 60000,
      },
    ],
    totalAllowanceAmount: 60000,
  },
  ...overrides,
});

describe("allowance-model", () => {
  describe("formatCurrency & formatWorkMinutes", () => {
    it("숫자를 한국 원화 형식으로 포맷한다", () => {
      expect(formatCurrency(60000)).toBe("60,000원");
      expect(formatCurrency(0)).toBe("0원");
      expect(formatCurrency(null)).toBe("0원");
      expect(formatCurrency(undefined)).toBe("0원");
      expect(formatCurrency(1234567.89)).toBe("1,234,567원");
    });

    it("근로 분을 시간과 분 단위로 알기 쉽게 변환한다", () => {
      expect(formatWorkMinutes(0)).toBe("0분");
      expect(formatWorkMinutes(45)).toBe("45분");
      expect(formatWorkMinutes(60)).toBe("1시간");
      expect(formatWorkMinutes(150)).toBe("2시간 30분");
      expect(formatWorkMinutes(null)).toBe("0분");
    });
  });

  describe("formatWorkTypeLabel, formatAllowanceLineCodeLabel & formatStatusLabel", () => {
    it("정본 WorkType 5종 및 산출 항목·상태 코드를 한글 명칭으로 변환한다", () => {
      expect(formatWorkTypeLabel("regular")).toBe("통상근무");
      expect(formatWorkTypeLabel("overtime")).toBe("연장근무");
      expect(formatWorkTypeLabel("night")).toBe("야간근무");
      expect(formatWorkTypeLabel("holiday")).toBe("휴일근무");
      expect(formatWorkTypeLabel("substitute")).toBe("대체근무");
      expect(formatWorkTypeLabel("shift")).toBe("교대근무");
      expect(formatWorkTypeLabel("unknown")).toBe("unknown");

      expect(formatAllowanceLineCodeLabel("base")).toBe("기본근로");
      expect(formatAllowanceLineCodeLabel("overtime")).toBe("연장근로");
      expect(formatAllowanceLineCodeLabel("night")).toBe("야간근로");

      expect(formatStatusLabel("pending")).toBe("검토 대기");
      expect(formatStatusLabel("approved")).toBe("검토 승인");
      expect(formatStatusLabel("rejected")).toBe("반려");
      expect(formatStatusLabel("proposal-approved")).toBe("품의 승인(마감)");
    });
  });

  describe("inspectAllowanceSnapshot (R06 & N07 대응)", () => {
    it("0원 스냅샷과 미저장 상태를 명확히 구분하고 line 합계를 대조한다", () => {
      const zeroRow = makeMockRecord({
        snapshot: {
          id: "calc-zero",
          performanceApprovalId: "pa-z",
          calculationVersion: 2,
          businessCategoryCode: "weekday-overtime",
          businessCategoryLabel: "평일 연장근무",
          createdAt: "2026-05-12T00:00:00.000Z",
          breakdown: {
            totalWorkMinutes: 0,
            baseWorkMinutes: 0,
            overtimeMinutes: 0,
            nightMinutes: 0,
            holidayMinutes: 0,
            substituteMinutes: 0,
          },
          lines: [],
          totalAllowanceAmount: 0,
        },
      });
      const zeroInfo = inspectAllowanceSnapshot(zeroRow);
      expect(zeroInfo.hasSnapshot).toBe(true);
      expect(zeroInfo.isZeroAmount).toBe(true);
      expect(zeroInfo.isLineSumConsistent).toBe(true);
      expect(zeroInfo.calculationVersion).toBe(2);

      const missingRow = makeMockRecord({ snapshot: undefined as never });
      const missingInfo = inspectAllowanceSnapshot(missingRow);
      expect(missingInfo.hasSnapshot).toBe(false);
      expect(missingInfo.isZeroAmount).toBe(false);
      expect(missingInfo.isLineSumConsistent).toBe(false);

      const mismatchRow = makeMockRecord({
        snapshot: {
          ...makeMockRecord().snapshot,
          totalAllowanceAmount: 60001,
        },
      });
      expect(inspectAllowanceSnapshot(mismatchRow).isLineSumConsistent).toBe(false);
    });
  });

  describe("isValidCalendarDate (N06 대응)", () => {
    it("올바른 YYYY-MM-DD 날짜를 검증한다", () => {
      expect(isValidCalendarDate("2026-05-15")).toBe(true);
      expect(isValidCalendarDate("2026-02-28")).toBe(true);
      expect(isValidCalendarDate("2024-02-29")).toBe(true);
    });

    it("존재하지 않는 가짜 날짜나 잘못된 형식은 거절한다", () => {
      expect(isValidCalendarDate("2026-02-30")).toBe(false);
      expect(isValidCalendarDate("2026-04-31")).toBe(false);
      expect(isValidCalendarDate("2026-13-01")).toBe(false);
      expect(isValidCalendarDate("invalid")).toBe(false);
      expect(isValidCalendarDate("")).toBe(false);
    });
  });

  describe("calculateAllowanceKpi (R02 4대 KPI 대응)", () => {
    it("정규금액, 조기금액, 총액, 인원 및 건수를 정확히 집계하고 선택 합계를 구분한다", () => {
      const rows = [
        makeMockRecord({
          id: "1",
          employeeCode: "E01",
          status: "pending",
          snapshot: { ...makeMockRecord().snapshot, totalAllowanceAmount: 50000 },
        }),
        makeMockRecord({
          id: "2",
          employeeCode: "E02",
          status: "approved",
          earlyPayoutDate: "2026-05-20",
          snapshot: { ...makeMockRecord().snapshot, totalAllowanceAmount: 30000 },
        }),
        makeMockRecord({
          id: "3",
          employeeCode: "E01",
          status: "approved",
          snapshot: { ...makeMockRecord().snapshot, totalAllowanceAmount: 20000 },
        }),
      ];

      const kpi = calculateAllowanceKpi(rows, new Set(["1", "2"]));
      expect(kpi.totalCount).toBe(3);
      expect(kpi.employeeCount).toBe(2);
      expect(kpi.regularTotalAmount).toBe(70000);
      expect(kpi.earlyPayoutTotalAmount).toBe(30000);
      expect(kpi.totalAmount).toBe(100000);
      expect(kpi.pendingCount).toBe(1);
      expect(kpi.approvedCount).toBe(2);
      expect(kpi.selectedCount).toBe(2);
      expect(kpi.selectedAmount).toBe(80000);
    });
  });

  describe("matchAllowanceRow & compareAllowanceRows", () => {
    it("근무월·근무지·상태·근무유형·지급구분·검색어 조건에 부합하는 행만 선별한다", () => {
      const r1 = makeMockRecord({
        siteName: "강남",
        status: "pending",
        workDate: "2026-05-01",
        workType: "substitute",
      });
      const r2 = makeMockRecord({
        siteName: "판교",
        status: "approved",
        workDate: "2026-05-02",
        workType: "overtime",
      });

      const filter: AllowanceFilterState = {
        scheduleMonth: "2026-05",
        siteName: "강남",
        statusFilter: "pending",
        workType: "substitute",
        payoutType: "all",
        searchQuery: "대체근무",
        density: "normal",
      };

      expect(matchAllowanceRow(r1, filter)).toBe(true);
      expect(matchAllowanceRow(r2, filter)).toBe(false);
    });

    it("근무지 ko numeric, 일자, 사번, ID 순으로 정렬하며 동일 사번 다른 계산을 안정 정렬한다", () => {
      const a = makeMockRecord({ id: "c-2", siteName: "1사업소", workDate: "2026-05-02", employeeCode: "E1" });
      const a2 = makeMockRecord({ id: "c-1", siteName: "1사업소", workDate: "2026-05-02", employeeCode: "E1" });
      const b = makeMockRecord({ id: "c-3", siteName: "2사업소", workDate: "2026-05-01" });
      const c = makeMockRecord({ id: "c-4", siteName: "10사업소", workDate: "2026-05-01" });

      const list = [c, b, a, a2].sort(compareAllowanceRows);
      expect(list.map(r => r.id)).toEqual(["c-1", "c-2", "c-3", "c-4"]);
    });
  });

  describe("groupAllowanceRows", () => {
    it("근무지별로 행을 그룹화하고 근무지명을 정렬한다", () => {
      const rows = [
        makeMockRecord({ siteName: "판교", snapshot: { totalAllowanceAmount: 10000 } as never }),
        makeMockRecord({ siteName: "강남", snapshot: { totalAllowanceAmount: 20000 } as never }),
        makeMockRecord({ siteName: "판교", snapshot: { totalAllowanceAmount: 30000 } as never }),
      ];

      const groups = groupAllowanceRows(rows);
      expect(groups).toHaveLength(2);
      expect(groups[0].siteName).toBe("강남");
      expect(groups[0].totalAmount).toBe(20000);
      expect(groups[1].siteName).toBe("판교");
      expect(groups[1].totalAmount).toBe(40000);
      expect(groups[1].count).toBe(2);
    });
  });

  describe("deriveAllowanceBadges", () => {
    it("상태 및 조기지급에 따른 배지를 구성한다", () => {
      const row = makeMockRecord({ status: "proposal-approved", earlyPayoutDate: "2026-05-20" });
      const badges = deriveAllowanceBadges(row);
      expect(badges).toHaveLength(2);
      expect(badges[0].type).toBe("locked");
      expect(badges[0].label).toBe("품의 완료");
      expect(badges[1].type).toBe("early");
    });
  });

  describe("getDensityHeights & getAllowancePageSelection", () => {
    it("밀도별 행 및 그룹 높이를 올바르게 반환한다", () => {
      expect(getDensityHeights("compact")).toEqual({ rowHeight: 32, groupHeight: 28 });
      expect(getDensityHeights("normal")).toEqual({ rowHeight: 38, groupHeight: 32 });
      expect(getDensityHeights("spacious")).toEqual({ rowHeight: 46, groupHeight: 36 });
    });

    it("현재 페이지 범위 안의 선택 행 또는 첫 번째 가시 행을 반환한다", () => {
      const rows = [
        makeMockRecord({ id: "r1" }),
        makeMockRecord({ id: "r2" }),
        makeMockRecord({ id: "r3" }),
      ];
      const range = { start: 1, end: 3 };
      expect(getAllowancePageSelection(rows, range, "r3")?.id).toBe("r3");
      expect(getAllowancePageSelection(rows, range, null)?.id).toBe("r2");
      expect(getAllowancePageSelection(rows, range, "r1")?.id).toBe("r2");
    });
  });

  describe("createPreviewBinding & validatePreviewBinding (UI06-D02 & N05 대응)", () => {
    const mockPreview: AllowanceProposalPreview = {
      workMonth: "2026-05",
      generatedAt: "2026-05-30T00:00:00.000Z",
      calculationCount: 2,
      employeeCount: 2,
      regularTotalAllowanceAmount: 20000,
      earlyPayoutTotalAllowanceAmount: 30000,
      totalAllowanceAmount: 50000,
      rows: [
        {
          calculationId: "calc-1",
          siteName: "강남",
          employeeCode: "E1",
          employeeName: "홍길동",
          workDate: "2026-05-10",
          workType: "overtime",
          businessCategoryLabel: "평일 연장근무",
          totalWorkMinutes: 120,
          totalAllowanceAmount: 20000,
          earlyPayoutDate: undefined,
        },
        {
          calculationId: "calc-2",
          siteName: "강남",
          employeeCode: "E2",
          employeeName: "김철수",
          workDate: "2026-05-11",
          workType: "holiday",
          businessCategoryLabel: "법정휴일근무",
          totalWorkMinutes: 180,
          totalAllowanceAmount: 30000,
          earlyPayoutDate: "2026-05-25",
        },
      ],
      regularSiteSummaries: [],
      earlyPayoutSiteSummaries: [],
    };

    it("서명이 비어 있어도 선택하지 않은 동일 건수의 미리보기 ID로 대체할 수 없다", () => {
      const selected = mockPreview.rows.map(row => makeMockRecord({
        id: `selected-${row.calculationId}`, signature: "", status: "approved"
      }));
      const returned = mockPreview.rows.map(row => makeMockRecord({
        id: row.calculationId, siteName: row.siteName, workDate: row.workDate,
        earlyPayoutDate: row.earlyPayoutDate, signature: "", status: "approved",
        snapshot: { ...makeMockRecord().snapshot, totalAllowanceAmount: row.totalAllowanceAmount }
      }));
      const binding = createPreviewBinding(mockPreview, "pdf", selected);
      expect(binding.isPreviewConsistent).toBe(false);
      expect(validatePreviewBinding(binding, returned).valid).toBe(false);
    });

    it("선택 원본이 누락되거나 중복되면 미리보기를 승인 가능한 상태로 만들지 않는다", () => {
      const first = makeMockRecord({ id: mockPreview.rows[0].calculationId });
      expect(createPreviewBinding(mockPreview, "pdf", [first]).isPreviewConsistent).toBe(false);
      expect(createPreviewBinding(mockPreview, "pdf", [first, first]).isPreviewConsistent).toBe(false);
    });

    it("미리보기 시점의 ID·근무지·일자·금액·지급일·서명이 동일하면 검증을 통과한다", () => {
      const sourceRows = [
        makeMockRecord({
          id: "calc-1",
          siteName: "강남",
          workDate: "2026-05-10",
          status: "approved",
          signature: "sig-a",
          snapshot: { ...makeMockRecord().snapshot, totalAllowanceAmount: 20000 },
        }),
        makeMockRecord({
          id: "calc-2",
          siteName: "강남",
          workDate: "2026-05-11",
          status: "approved",
          signature: "sig-b",
          earlyPayoutDate: "2026-05-25",
          snapshot: { ...makeMockRecord().snapshot, totalAllowanceAmount: 30000 },
        }),
      ];
      const binding = createPreviewBinding(mockPreview, "pdf", sourceRows);
      expect(binding.isPreviewConsistent).toBe(true);
      expect(validatePreviewBinding(binding, sourceRows).valid).toBe(true);

      const sigChanged = [sourceRows[0], { ...sourceRows[1], signature: "sig-b-mutated" }];
      expect(validatePreviewBinding(binding, sigChanged).valid).toBe(false);
    });

    it("미리보기 이후 금액이나 조기지급일이 바뀌면 검증을 차단한다", () => {
      const binding = createPreviewBinding(mockPreview, "pdf");
      const changedRows = [
        makeMockRecord({
          id: "calc-1",
          siteName: "강남",
          workDate: "2026-05-10",
          status: "approved",
          snapshot: { totalAllowanceAmount: 25000 } as never,
        }),
        makeMockRecord({
          id: "calc-2",
          siteName: "강남",
          workDate: "2026-05-11",
          status: "approved",
          earlyPayoutDate: "2026-05-25",
          snapshot: { totalAllowanceAmount: 30000 } as never,
        }),
      ];

      const res = validatePreviewBinding(binding, changedRows);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("새 미리보기가 필요합니다");
    });

    it("미리보기 이후 행이 반려되거나 이미 품의 완료되었으면 차단한다", () => {
      const binding = createPreviewBinding(mockPreview, "pdf");
      const rejectedRows = [
        makeMockRecord({
          id: "calc-1",
          siteName: "강남",
          workDate: "2026-05-10",
          status: "rejected",
          snapshot: { totalAllowanceAmount: 20000 } as never,
        }),
        makeMockRecord({
          id: "calc-2",
          siteName: "강남",
          workDate: "2026-05-11",
          status: "approved",
          earlyPayoutDate: "2026-05-25",
          snapshot: { totalAllowanceAmount: 30000 } as never,
        }),
      ];

      const res = validatePreviewBinding(binding, rejectedRows);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("반려");
    });
  });

  describe("validateFreshRecordsForAction & computeAllowanceDataFingerprint (UI06-D02)", () => {
    const freshRows = [
      makeMockRecord({ id: "c1", status: "pending", workDate: "2026-05-01", signature: "s1" }),
      makeMockRecord({ id: "c2", status: "approved", workDate: "2026-05-02", signature: "s2" }),
      makeMockRecord({ id: "c3", status: "proposal-approved", workDate: "2026-05-03", signature: "s3" }),
      makeMockRecord({ id: "c4", status: "approved", workDate: "2026-04-30", signature: "s4" }),
    ];

    it("최신 목록에 없는 ID는 거절한다", () => {
      const res = validateFreshRecordsForAction(["c1", "c999"], freshRows);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("존재하지 않습니다");
    });

    it("이미 마감된 proposal-approved 건에 대한 변경을 차단한다", () => {
      const res = validateFreshRecordsForAction(["c3"], freshRows, { blockProposalApproved: true });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("이미 품의 완료(마감)");
    });

    it("지정된 상태와 불일치하거나 모달 오픈 시점 스냅샷과 달라진 행을 차단한다", () => {
      const res = validateFreshRecordsForAction(["c1", "c2"], freshRows, { requiredStatus: "pending" });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("상태가 '검토 승인'입니다");

      const staleExpected = [{ ...freshRows[0], earlyPayoutDate: "2026-05-19" }];
      const drift = validateFreshRecordsForAction(["c1"], freshRows, {
        expectedRecords: staleExpected,
      });
      expect(drift.valid).toBe(false);
      expect(drift.reason).toContain("변경되었습니다");
    });

    it("서로 다른 근무월이 섞여있으면 일괄 처리를 차단한다 (checkSameMonth)", () => {
      const res = validateFreshRecordsForAction(["c2", "c4"], freshRows, { checkSameMonth: true });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("서로 다른 근무월의 항목이 함께 선택되었습니다");
    });

    it("모든 조건을 충족하면 중복 ID를 제거한 유효 freshTargets와 안정 지문을 반환한다", () => {
      const res = validateFreshRecordsForAction(["c2", "c2"], freshRows, {
        requiredStatus: "approved",
        checkSameMonth: true,
        blockProposalApproved: true,
        expectedRecords: [freshRows[1]],
      });
      expect(res.valid).toBe(true);
      expect(res.freshTargets).toHaveLength(1);
      expect(res.freshTargets?.[0].id).toBe("c2");

      const fp1 = computeAllowanceDataFingerprint({
        results: freshRows,
        historyCount: 60,
        reviewCount: 55,
        proposalCount: 1,
        exportCount: 1,
        errorsKey: "",
      });
      const fp2 = computeAllowanceDataFingerprint({
        results: [...freshRows],
        historyCount: 60,
        reviewCount: 55,
        proposalCount: 1,
        exportCount: 1,
        errorsKey: "",
      });
      expect(fp1).toBe(fp2);
    });
  });
});
