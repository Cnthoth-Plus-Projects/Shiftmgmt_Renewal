import { describe, expect, it } from "vitest";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import { buildDashboardModel, dashboardChartInput, dashboardGrowth, dashboardMonthOffset, dashboardReportInput, defaultDashboardFilter, normalizeDashboardRows, type DashboardFilter } from "./dashboard-model";

const filter: DashboardFilter = { year: "2026", month: "05", site: "all", employee: "all", category: "all" };
function accessRow(
  idSuffix: string,
  totalAmount: number,
  lines: { allowanceCode: "base" | "overtime" | "night" | "holiday" | "substitute"; workMinutes: number; multiplier: number; amount: number }[],
  extra: Partial<AllowanceCalculationResultRecord> = {},
  workDate = "2024-10-09"
): AllowanceCalculationResultRecord {
  const id = `access-allowance-calculation-${idSuffix}`;
  const year = workDate.slice(0, 4);
  const totalWorkMinutes = lines.reduce((acc, l) => acc + l.workMinutes, 0);
  const snapshot = {
    id,
    performanceApprovalId: `access-performance-approval-${idSuffix}`,
    calculationVersion: 1,
    businessCategoryCode: "legal-holiday" as const,
    businessCategoryLabel: "법정휴일",
    breakdown: {
      totalWorkMinutes,
      baseWorkMinutes: lines.find(l => l.allowanceCode === "base")?.workMinutes ?? 0,
      overtimeMinutes: lines.find(l => l.allowanceCode === "overtime")?.workMinutes ?? 0,
      nightMinutes: lines.find(l => l.allowanceCode === "night")?.workMinutes ?? 0,
      holidayMinutes: totalWorkMinutes,
      substituteMinutes: 0
    },
    lines,
    totalAllowanceAmount: totalAmount,
    createdAt: "2024-10-10T00:00:00Z"
  };
  const signature = JSON.stringify({
    performanceApprovalId: snapshot.performanceApprovalId,
    calculationVersion: snapshot.calculationVersion,
    businessCategoryCode: snapshot.businessCategoryCode,
    breakdown: snapshot.breakdown,
    lines: lines.map(l => ({
      allowanceCode: l.allowanceCode,
      workMinutes: l.workMinutes,
      multiplier: l.multiplier,
      amount: l.amount
    })),
    totalAllowanceAmount: totalAmount
  });
  return {
    id,
    fileId: `access-performance-file-${idSuffix}`,
    fileName: "access_sample.xlsx",
    entryId: `access-performance-entry-${idSuffix}`,
    employeeCode: "EMP001",
    employeeName: "이관직원",
    siteName: "센터A",
    workDate,
    workType: "holiday",
    hourlyRate: 10000,
    rateVersionId: `access-performance-inline-${year}`,
    rateVersionLabel: `Access 실적 이관 ${year}`,
    status: "approved",
    signature,
    snapshot,
    ...extra
  };
}
function row(id: string, amount = 101, minutes = 90, extra: Partial<AllowanceCalculationResultRecord> = {}): AllowanceCalculationResultRecord {
  return { id, fileId: "f", fileName: "실적.xlsx", entryId: id, employeeCode: id, employeeName: "김동일", siteName: "센터A", workDate: "2026-05-02", workType: "overtime", hourlyRate: 99999, rateVersionId: "old", rateVersionLabel: "저장 시점", status: "pending", signature: id, snapshot: { id, performanceApprovalId: id, calculationVersion: 1, businessCategoryCode: "weekday-overtime", businessCategoryLabel: "연장", breakdown: { totalWorkMinutes: minutes, baseWorkMinutes: minutes, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, substituteMinutes: 0 }, lines: [{ allowanceCode: "base", workMinutes: minutes, multiplier: 1, amount }], totalAllowanceAmount: amount, createdAt: "2026-05-03T00:00:00Z" }, ...extra };
}
describe("dashboard canonical stored aggregation", () => {
  it("B01 preserves all four review statuses and saved amounts/minutes", () => {
    const source = [row("A", 101, 90), row("B", 202, 30, { status: "approved" }), row("C", 303, 60, { status: "rejected" }), row("D", 404, 120, { status: "proposal-approved" })];
    expect(buildDashboardModel(source, filter).totals).toEqual({ amount: 1010, minutes: 300, employees: 4, count: 4 });
    expect(source[0].hourlyRate).toBe(99999);
  });
  it("B02 uses stored business category, not workType", () => {
    const a = row("A", 101); a.snapshot.businessCategoryCode = "legal-holiday";
    const b = row("B", 202); b.snapshot.businessCategoryCode = "holiday-substitute";
    const m = buildDashboardModel([a, b], filter);
    expect(m.ratio.map(r => r.totalAmount)).toEqual([101, 202, 0]);
    expect(buildDashboardModel([a, b], { ...filter, category: "substitute" }).totals.amount).toBe(202);
  });
  it("B03 uses work month despite another early payout month", () => {
    const source = [row("A", 101, 90, { earlyPayoutDate: "2026-04-30" })];
    expect(buildDashboardModel(source, filter).totals.amount).toBe(101);
    expect(buildDashboardModel(source, { ...filter, month: "04" }).totals.count).toBe(0);
  });
  it("B04 validates leap dates and crosses year/month boundaries", () => {
    expect(normalizeDashboardRows([row("A", 1, 0, { workDate: "2024-02-29" })])).toHaveLength(1);
    expect(() => normalizeDashboardRows([row("A", 1, 0, { workDate: "2026-02-29" })])).toThrow();
    expect(dashboardMonthOffset("2026-01", -1)).toBe("2025-12");
    expect(() => buildDashboardModel([], { ...filter, month: "13" })).toThrow();
  });
  it("B05 compares equal preceding periods and handles a zero base", () => {
    const source = [row("A", 200, 90), row("B", 100, 30, { workDate: "2026-04-01" }), row("C", 500, 30, { workDate: "2025-07-01" })];
    const m = buildDashboardModel(source, filter); expect(m.previous.amount).toBe(100); expect(m.growth.amount).toBe("+100.0%");
    expect(buildDashboardModel(source, { ...filter, month: "all" }).previous.amount).toBe(500);
    expect(dashboardGrowth(0, 0)).toBe("0.0%"); expect(dashboardGrowth(1, 0)).toBe("신규"); expect(dashboardGrowth(0, 10)).toBe("-100.0%");
  });
  it("B06 combines site, code and category filters", () => {
    const a = row("A", 10); a.snapshot.businessCategoryCode = "legal-holiday";
    const source = [a, row("B", 20), row("C", 30, 40, { siteName: "센터B", employeeCode: "A" })];
    expect(buildDashboardModel(source, { ...filter, employee: "A", site: "센터A", category: "legalHoliday" }).totals).toEqual({ amount: 10, minutes: 90, employees: 1, count: 1 });
  });
  it("B07 separates identical names using employee code", () => {
    const m = buildDashboardModel([row("A", 10), row("B", 20)], filter);
    expect(m.totals.employees).toBe(2); expect(m.ranking.map(r => r.code)).toEqual(["B", "A"]);
  });
  it("B08 combines one code across sites and selects latest saved name", () => {
    const source = [row("A", 10, 40, { employeeName: "이전 이름" }), row("B", 20, 50, { employeeCode: "A", employeeName: "새 이름", siteName: "센터B", workDate: "2026-05-03" })];
    expect(buildDashboardModel(source, filter).ranking).toEqual([{ code: "A", name: "새 이름", site: "센터A, 센터B", totalAmount: 30, workMinutes: 90, count: 2 }]);
  });
  it("B09 keeps zero-minute/zero-won ranks and full totals beyond top10", () => {
    const source = Array.from({ length: 15 }, (_, i) => row(`E${i}`, i, i));
    const m = buildDashboardModel(source, filter); expect(m.ranking).toHaveLength(15); expect(m.totals).toEqual({ amount: 105, minutes: 105, employees: 15, count: 15 });
    expect(m.ranking.at(-1)?.totalAmount).toBe(0);
  });
  it("B10 has deterministic code order for tied amounts and minutes", () => {
    expect(buildDashboardModel([row("B", 101, 120), row("A", 101, 30)], filter).ranking.map(r => r.code)).toEqual(["A", "B"]);
  });
  it("B11 includes zero trend months and a matching last period", () => {
    const m = buildDashboardModel([row("A", 101)], filter);
    expect(m.trend.map(r => r.label)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(m.trend.map(r => r.totalAmount)).toEqual([0, 0, 0, 0, 0, 101]);
    expect(buildDashboardModel([row("A")], { ...filter, month: "all" }).trend).toHaveLength(12);
  });
  it("B12 preserves site/category totals including other sites bucket", () => {
    const source = Array.from({ length: 12 }, (_, i) => row(`E${i}`, 10, 30, { siteName: `센터${i}` })); const m = buildDashboardModel(source, filter);
    expect(m.sites).toHaveLength(12); expect(m.siteChart).toHaveLength(11); expect(m.siteChart.at(-1)?.totalAmount).toBe(20);
    expect(m.siteChart.reduce((n, r) => n + r.totalAmount, 0)).toBe(120); expect(m.ratio[2].percent).toBe(100);
  });
  it("B13 exports four canonical sections with raw minutes and exact amounts", () => {
    const m = buildDashboardModel([row("A", 101, 90), row("B", 202, 30)], filter); const report = dashboardReportInput(m, "xlsx");
    expect(report.sections.map(s => s.sectionKey)).toEqual(["trend", "site", "ratio", "ranking"]);
    expect(dashboardChartInput(m, "ranking").rows).toEqual([{ rank: 1, employeeCode: "B", employeeName: "김동일", siteName: "센터A", workMinutes: 30, totalAmount: 202 }, { rank: 2, employeeCode: "A", employeeName: "김동일", siteName: "센터A", workMinutes: 90, totalAmount: 101 }]);
    expect(report.sections[2].rows[2].ratioPercent).toBe(100); expect(report.filters.periodLabel).toContain("추이 2025-12");
  });
  it("B14 distinguishes empty results from valid zero records", () => {
    expect(buildDashboardModel([], filter).totals.count).toBe(0);
    const m = buildDashboardModel([row("A", 0, 0)], filter); expect(m.totals.count).toBe(1); expect(m.ratio.every(r => r.percent === 0)).toBe(true);
    expect(defaultDashboardFilter([], new Date("2026-12-31T16:00:00Z"))).toMatchObject({ year: "2027", month: "01" });
    expect(defaultDashboardFilter([row("A")])).toMatchObject({ year: "2026", month: "05" });
  });
  it("B15 rejects invalid identity, duplicate IDs, unsafe numbers and unequal lines", () => {
    expect(() => buildDashboardModel([row("A"), row("A")], filter)).toThrow();
    expect(() => buildDashboardModel([row("A", 1, 1, { employeeCode: "" })], filter)).toThrow();
    for (const n of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) expect(() => buildDashboardModel([row("A", n)], filter)).toThrow();
    const a = row("A"); a.snapshot.lines[0].amount = 100; expect(() => buildDashboardModel([a], filter)).toThrow();
    expect(() => buildDashboardModel([row("A", Number.MAX_SAFE_INTEGER), row("B", 1)], filter)).toThrow();
  });
  it("B16 detaches immutable export snapshots from source and later filters", () => {
    const source = [row("A", 101)]; const f = { ...filter }; const m = buildDashboardModel(source, f); const out = dashboardReportInput(m, "pdf");
    source[0].snapshot.totalAllowanceAmount = 999; source[0].employeeName = "변경"; f.month = "04";
    expect(out.sections[3].rows[0].totalAmount).toBe(101); expect(out.sections[3].rows[0].employeeName).toBe("김동일"); expect(out.filters.month).toBe("5월");
  });
  it("accepts valid four-digit edge years without Date.UTC century conversion", () => {
    for (const year of ["0001", "0099", "0999", "9999"]) {
      const source = [row("A", 1, 0, { workDate: `${year}-01-01` })];
      expect(buildDashboardModel(source, defaultDashboardFilter(source)).totals.amount).toBe(1);
    }
    expect(dashboardMonthOffset("0099-01", -1)).toBe("0098-12");
  });
  it("identifies the calculation whose line total exceeds safe integer range", () => {
    const a = row("bad-lines", Number.MAX_SAFE_INTEGER); a.snapshot.lines.push({ ...a.snapshot.lines[0], amount: 1 });
    expect(() => normalizeDashboardRows([a])).toThrow("bad-lines");
  });
  it("P1 aggregates Access record with decimal line amounts and independent total 215240", () => {
    const r1 = accessRow("p1", 215240, [
      { allowanceCode: "base", workMinutes: 90, multiplier: 1.5, amount: 30748.5 },
      { allowanceCode: "overtime", workMinutes: 150, multiplier: 1.5, amount: 51247.5 },
      { allowanceCode: "night", workMinutes: 390, multiplier: 1.5, amount: 133243.5 }
    ]);
    const rows = normalizeDashboardRows([r1]);
    expect(rows[0].amount).toBe(215240);
    expect(rows[0].minutes).toBe(630);
    const m = buildDashboardModel([r1], { year: "2024", month: "10", site: "all", employee: "all", category: "all" });
    expect(m.totals.amount).toBe(215240);
    expect(m.totals.minutes).toBe(630);
  });
  it("P2 aggregates Access record with integer lines differing from independent total 221200", () => {
    const r2 = accessRow("p2", 221200, [
      { allowanceCode: "base", workMinutes: 480, multiplier: 1.5, amount: 168528 },
      { allowanceCode: "overtime", workMinutes: 150, multiplier: 1.5, amount: 52665 }
    ]);
    const rows = normalizeDashboardRows([r2]);
    expect(rows[0].amount).toBe(221200);
    expect(rows[0].minutes).toBe(630);
    const m = buildDashboardModel([r2], { year: "2024", month: "10", site: "all", employee: "all", category: "all" });
    expect(m.totals.amount).toBe(221200);
  });
  it("P3 accepts records when lines order or signature JSON key order differs while inputs remain immutable", () => {
    const linesOriginal = [
      { allowanceCode: "base" as const, workMinutes: 90, multiplier: 1.5, amount: 30748.5 },
      { allowanceCode: "night" as const, workMinutes: 390, multiplier: 1.5, amount: 133243.5 },
      { allowanceCode: "overtime" as const, workMinutes: 150, multiplier: 1.5, amount: 51247.5 }
    ];
    const r3 = accessRow("p3", 215240, linesOriginal);
    const sigLinesReordered = [
      { allowanceCode: "overtime", workMinutes: 150, multiplier: 1.5, amount: 51247.5 },
      { allowanceCode: "base", workMinutes: 90, multiplier: 1.5, amount: 30748.5 },
      { allowanceCode: "night", workMinutes: 390, multiplier: 1.5, amount: 133243.5 }
    ];
    r3.signature = JSON.stringify({
      totalAllowanceAmount: 215240,
      breakdown: r3.snapshot.breakdown,
      lines: sigLinesReordered,
      calculationVersion: 1,
      businessCategoryCode: "legal-holiday",
      performanceApprovalId: r3.snapshot.performanceApprovalId
    });
    const snapshotBefore = JSON.stringify(r3.snapshot);
    const signatureBefore = r3.signature;
    const rows = normalizeDashboardRows([r3]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(r3.snapshot)).toBe(snapshotBefore);
    expect(r3.signature).toBe(signatureBefore);
  });
  it("N1 rejects general V4 calculation with decimal lines or unequal line sum", () => {
    const v4Decimal = row("v4-dec", 100);
    v4Decimal.snapshot.lines[0].amount = 100.5;
    expect(() => normalizeDashboardRows([v4Decimal])).toThrow("v4-dec");
    const v4Unequal = row("v4-unequal", 100);
    v4Unequal.snapshot.lines[0].amount = 99;
    expect(() => normalizeDashboardRows([v4Unequal])).toThrow("v4-unequal");
  });
  it("N2 rejects legacy-like record missing any Access provenance identifier or year mismatch", () => {
    const lines = [
      { allowanceCode: "base" as const, workMinutes: 90, multiplier: 1.5, amount: 30748.5 },
      { allowanceCode: "night" as const, workMinutes: 390, multiplier: 1.5, amount: 133243.5 },
      { allowanceCode: "overtime" as const, workMinutes: 150, multiplier: 1.5, amount: 51247.5 }
    ];
    const badLabel = accessRow("n2-label", 215240, lines, { rateVersionLabel: "일반 2024" });
    expect(() => normalizeDashboardRows([badLabel])).toThrow("n2-label");
    const badRateId = accessRow("n2-rate", 215240, lines, { rateVersionId: "access-performance-inline-2025" });
    expect(() => normalizeDashboardRows([badRateId])).toThrow("n2-rate");
    const badId = accessRow("n2-id", 215240, lines);
    badId.id = "general-calculation-n2-id";
    badId.snapshot.id = "general-calculation-n2-id";
    expect(() => normalizeDashboardRows([badId])).toThrow("general-calculation-n2-id");
    const badEntry = accessRow("n2-entry", 215240, lines, { entryId: "other-entry-1" });
    expect(() => normalizeDashboardRows([badEntry])).toThrow("n2-entry");
    const badFile = accessRow("n2-file", 215240, lines, { fileId: "other-file-1" });
    expect(() => normalizeDashboardRows([badFile])).toThrow("n2-file");
    const badAppr = accessRow("n2-appr", 215240, lines);
    badAppr.snapshot.performanceApprovalId = "other-approval-1";
    expect(() => normalizeDashboardRows([badAppr])).toThrow("n2-appr");
    const badSnapId = accessRow("n2-snapid", 215240, lines);
    badSnapId.snapshot.id = "other-snap-id";
    expect(() => normalizeDashboardRows([badSnapId])).toThrow("n2-snapid");
  });
  it("N3 rejects Access record with malformed or missing signature", () => {
    const lines = [
      { allowanceCode: "base" as const, workMinutes: 90, multiplier: 1.5, amount: 30748.5 },
      { allowanceCode: "night" as const, workMinutes: 390, multiplier: 1.5, amount: 133243.5 },
      { allowanceCode: "overtime" as const, workMinutes: 150, multiplier: 1.5, amount: 51247.5 }
    ];
    expect(() => normalizeDashboardRows([accessRow("n3-empty", 215240, lines, { signature: "" })])).toThrow("n3-empty");
    expect(() => normalizeDashboardRows([accessRow("n3-badjson", 215240, lines, { signature: "{" })])).toThrow("n3-badjson");
    expect(() => normalizeDashboardRows([accessRow("n3-obj", 215240, lines, { signature: "{}" })])).toThrow("n3-obj");
    expect(() => normalizeDashboardRows([accessRow("n3-arr", 215240, lines, { signature: "[]" })])).toThrow("n3-arr");
  });
  it("N4 rejects Access record when signature or snapshot total, lines, or minutes differ", () => {
    const lines = [
      { allowanceCode: "base" as const, workMinutes: 90, multiplier: 1.5, amount: 30748.5 },
      { allowanceCode: "night" as const, workMinutes: 390, multiplier: 1.5, amount: 133243.5 },
      { allowanceCode: "overtime" as const, workMinutes: 150, multiplier: 1.5, amount: 51247.5 }
    ];
    const rTotalSig = accessRow("n4-totalsig", 215240, lines);
    const sig1 = JSON.parse(rTotalSig.signature);
    sig1.totalAllowanceAmount = 999999;
    rTotalSig.signature = JSON.stringify(sig1);
    expect(() => normalizeDashboardRows([rTotalSig])).toThrow("n4-totalsig");

    const rTotalSnap = accessRow("n4-totalsnap", 215240, lines);
    rTotalSnap.snapshot.totalAllowanceAmount = 999999;
    expect(() => normalizeDashboardRows([rTotalSnap])).toThrow("n4-totalsnap");

    const rLineSig = accessRow("n4-linesig", 215240, lines);
    const sig2 = JSON.parse(rLineSig.signature);
    sig2.lines[0].amount = 999;
    rLineSig.signature = JSON.stringify(sig2);
    expect(() => normalizeDashboardRows([rLineSig])).toThrow("n4-linesig");

    const rLineSnap = accessRow("n4-linesnap", 215240, lines);
    rLineSnap.snapshot.lines[0].amount = 999;
    expect(() => normalizeDashboardRows([rLineSnap])).toThrow("n4-linesnap");

    const rMinSig = accessRow("n4-minsig", 215240, lines);
    const sig3 = JSON.parse(rMinSig.signature);
    sig3.breakdown.totalWorkMinutes = 9999;
    rMinSig.signature = JSON.stringify(sig3);
    expect(() => normalizeDashboardRows([rMinSig])).toThrow("n4-minsig");

    const rMinSnap = accessRow("n4-minsnap", 215240, lines);
    rMinSnap.snapshot.breakdown.totalWorkMinutes = 9999;
    expect(() => normalizeDashboardRows([rMinSnap])).toThrow("n4-minsnap");
  });
  it("N5 rejects negative, NaN, Infinity, unsafe amounts, and line sum overflow", () => {
    const baseLines = [{ allowanceCode: "base" as const, workMinutes: 90, multiplier: 1.5, amount: 100 }];
    for (const n of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => normalizeDashboardRows([accessRow("n5-line-acc", 100, [{ allowanceCode: "base", workMinutes: 90, multiplier: 1.5, amount: n }])])).toThrow();
      expect(() => normalizeDashboardRows([accessRow("n5-total-acc", n, baseLines)])).toThrow();
    }
    const overflowLines = [
      { allowanceCode: "base" as const, workMinutes: 90, multiplier: 1.5, amount: Number.MAX_SAFE_INTEGER },
      { allowanceCode: "overtime" as const, workMinutes: 90, multiplier: 1.5, amount: 1 }
    ];
    expect(() => normalizeDashboardRows([accessRow("n5-sum-acc", 100, overflowLines)])).toThrow("n5-sum-acc");
  });
});
