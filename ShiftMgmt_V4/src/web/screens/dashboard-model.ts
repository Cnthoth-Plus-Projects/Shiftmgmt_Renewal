import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import { resolveAllowanceSummaryCategory } from "../../shared/domain/allowance-rate-matrix";
import type { DashboardChartExportInput, DashboardChartExportRow, DashboardReportExportInput } from "../../shared/bridge/contracts";

export type DashboardCategory = "legalHoliday" | "substitute" | "overtime";
export type DashboardKey = DashboardChartExportInput["chartKey"];
export const dashboardCategories: readonly DashboardCategory[] = ["legalHoliday", "substitute", "overtime"];
export const dashboardCategoryLabels: Record<DashboardCategory, string> = { legalHoliday: "법정휴일", substitute: "대체근무", overtime: "연장근무" };
export const dashboardSourceLabel = "실적 승인 계산결과 · 수당 검토 상태 전체";
export interface DashboardFilter { year: string; month: string; site: string; employee: string; category: DashboardCategory | "all" }
export interface DashboardRow { id: string; code: string; name: string; site: string; date: string; category: DashboardCategory; amount: number; minutes: number; status: string }
export interface DashboardTotals { amount: number; minutes: number; employees: number; count: number }
export interface DashboardBucket { label: string; totalAmount: number; workMinutes: number; count: number; overtimeAmount: number; substituteAmount: number; legalHolidayAmount: number }
export interface DashboardRank { code: string; name: string; site: string; totalAmount: number; workMinutes: number; count: number }
export interface DashboardModel {
  filter: DashboardFilter; rows: DashboardRow[]; totals: DashboardTotals; previous: DashboardTotals;
  growth: Record<keyof DashboardTotals, string>; periodLabel: string; trendLabel: string;
  trend: DashboardBucket[]; sites: DashboardBucket[]; siteChart: DashboardBucket[];
  ratio: (DashboardBucket & { category: DashboardCategory; percent: number })[];
  ranking: DashboardRank[]; options: { years: string[]; sites: string[]; employees: { code: string; name: string }[] };
}
const sum = (a: number, b: number): number => { const n = a + b; if (!Number.isSafeInteger(n)) throw new Error("집계 범위가 안전한 정수 한도를 초과했습니다."); return n; };
const validNumber = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function validDashboardDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
interface SignatureLine { allowanceCode?: unknown; workMinutes?: unknown; multiplier?: unknown; amount?: unknown; }
function isSameBreakdown(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const brkA = a as Record<string, unknown>; const brkB = b as Record<string, unknown>;
  const keys = ["totalWorkMinutes", "baseWorkMinutes", "overtimeMinutes", "nightMinutes", "holidayMinutes", "substituteMinutes"] as const;
  return keys.every(k => brkA[k] === brkB[k]);
}
function isSameLines(sigLines: unknown, snapLines: unknown): boolean {
  if (!Array.isArray(sigLines) || !Array.isArray(snapLines) || sigLines.length !== snapLines.length) return false;
  const sortedSig = [...sigLines].sort((a: SignatureLine, b: SignatureLine) => String(a?.allowanceCode ?? "").localeCompare(String(b?.allowanceCode ?? "")));
  const sortedSnap = [...snapLines].sort((a: SignatureLine, b: SignatureLine) => String(a?.allowanceCode ?? "").localeCompare(String(b?.allowanceCode ?? "")));
  for (let i = 0; i < sortedSig.length; i++) {
    const sl = sortedSig[i] as SignatureLine; const nl = sortedSnap[i] as SignatureLine;
    if (!sl || !nl || typeof sl !== "object" || typeof nl !== "object") return false;
    if (sl.allowanceCode !== nl.allowanceCode || sl.workMinutes !== nl.workMinutes || sl.multiplier !== nl.multiplier || sl.amount !== nl.amount) return false;
  }
  return true;
}
function isAccessProvenance(r: AllowanceCalculationResultRecord): boolean {
  const s = r.snapshot; if (!s) return false;
  const year = r.workDate.slice(0, 4);
  return (
    typeof r.id === "string" && r.id.startsWith("access-allowance-calculation-") &&
    typeof r.entryId === "string" && r.entryId.startsWith("access-performance-entry-") &&
    typeof r.fileId === "string" && r.fileId.startsWith("access-performance-file-") &&
    typeof s.performanceApprovalId === "string" && s.performanceApprovalId.startsWith("access-performance-approval-") &&
    s.id === r.id &&
    r.rateVersionId === `access-performance-inline-${year}` &&
    r.rateVersionLabel === `Access 실적 이관 ${year}`
  );
}
function verifyAccessSignature(r: AllowanceCalculationResultRecord): boolean {
  const s = r.snapshot; if (typeof r.signature !== "string" || !r.signature.trim()) return false;
  let sig: Record<string, unknown>;
  try { sig = JSON.parse(r.signature); } catch { return false; }
  if (!sig || typeof sig !== "object" || Array.isArray(sig)) return false;
  if (sig.performanceApprovalId !== s.performanceApprovalId || sig.calculationVersion !== s.calculationVersion || sig.businessCategoryCode !== s.businessCategoryCode || sig.totalAllowanceAmount !== s.totalAllowanceAmount) return false;
  return isSameBreakdown(sig.breakdown, s.breakdown) && isSameLines(sig.lines, s.lines);
}
export function normalizeDashboardRows(source: readonly AllowanceCalculationResultRecord[]): DashboardRow[] {
  const ids = new Set<string>();
  return source.map(r => {
    const fail = () => new Error(`집계할 수 없는 계산 내역입니다. 계산 ID: ${String(r?.id || "없음")}`);
    if (!r || typeof r.id !== "string" || !r.id.trim() || ids.has(r.id) || typeof r.employeeCode !== "string" || !r.employeeCode.trim() || !validDashboardDate(r.workDate)) throw fail();
    const s = r.snapshot;
    if (!s || !s.breakdown || !validNumber(s.totalAllowanceAmount) || !validNumber(s.breakdown.totalWorkMinutes) || !Array.isArray(s.lines)) throw fail();
    if (isAccessProvenance(r)) {
      if (!verifyAccessSignature(r)) throw fail();
      if (!s.lines.every(l => l && typeof l.amount === "number" && Number.isFinite(l.amount) && l.amount >= 0 && l.amount <= Number.MAX_SAFE_INTEGER)) throw fail();
      let lineSum = 0;
      for (const l of s.lines) { lineSum += l.amount; if (!Number.isFinite(lineSum) || lineSum > Number.MAX_SAFE_INTEGER) throw fail(); }
    } else {
      if (!s.lines.every(l => l && validNumber(l.amount))) throw fail();
      try { if (s.lines.reduce((n, l) => sum(n, l.amount), 0) !== s.totalAllowanceAmount) throw fail(); } catch { throw fail(); }
    }
    if (!["legal-holiday", "weekday-substitute", "holiday-substitute", "weekday-overtime", "holiday-overtime"].includes(s.businessCategoryCode) || !["pending", "approved", "rejected", "proposal-approved"].includes(r.status)) throw fail();
    ids.add(r.id);
    return { id: r.id, code: r.employeeCode.trim(), name: String(r.employeeName || r.employeeCode), site: String(r.siteName || "미지정"), date: r.workDate, category: resolveAllowanceSummaryCategory(s.businessCategoryCode), amount: s.totalAllowanceAmount, minutes: s.breakdown.totalWorkMinutes, status: r.status };
  });
}
export function dashboardMonthOffset(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number); const index = y * 12 + m - 1 + offset;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(((index % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}
export function defaultDashboardFilter(source: readonly AllowanceCalculationResultRecord[], now = new Date()): DashboardFilter {
  const rows = normalizeDashboardRows(source); const latest = rows.map(r => r.date.slice(0, 7)).sort().pop();
  const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(now);
  const month = latest || `${current.find(p => p.type === "year")!.value}-${current.find(p => p.type === "month")!.value}`;
  return { year: month.slice(0, 4), month: month.slice(5), site: "all", employee: "all", category: "all" };
}
export function dashboardGrowth(current: number, previous: number): string {
  if (!previous) return current ? "신규" : "0.0%";
  const n = (current - previous) / previous * 100; return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}
const totals = (rows: DashboardRow[]): DashboardTotals => ({ amount: rows.reduce((n, r) => sum(n, r.amount), 0), minutes: rows.reduce((n, r) => sum(n, r.minutes), 0), employees: new Set(rows.map(r => r.code)).size, count: rows.length });
const bucket = (label: string): DashboardBucket => ({ label, totalAmount: 0, workMinutes: 0, count: 0, overtimeAmount: 0, substituteAmount: 0, legalHolidayAmount: 0 });
function add(target: DashboardBucket, row: DashboardRow): void {
  target.totalAmount = sum(target.totalAmount, row.amount); target.workMinutes = sum(target.workMinutes, row.minutes); target.count++;
  const key = `${row.category}Amount` as "legalHolidayAmount" | "substituteAmount" | "overtimeAmount"; target[key] = sum(target[key], row.amount);
}
function aggregate(rows: DashboardRow[], key: (row: DashboardRow) => string): DashboardBucket[] {
  const map = new Map<string, DashboardBucket>();
  for (const row of rows) { const k = key(row); if (!map.has(k)) map.set(k, bucket(k)); add(map.get(k)!, row); }
  return [...map.values()];
}
export function buildDashboardModel(source: readonly AllowanceCalculationResultRecord[], filter: DashboardFilter): DashboardModel {
  if (!/^\d{4}$/.test(filter.year) || Number(filter.year) < 1 || !(filter.month === "all" || /^(0[1-9]|1[0-2])$/.test(filter.month)) || ![...dashboardCategories, "all"].includes(filter.category)) throw new Error("조회 기간 또는 구분이 올바르지 않습니다.");
  const all = normalizeDashboardRows(source);
  const latestNames = new Map<string, string>();
  for (const row of [...all].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))) if (!latestNames.has(row.code)) latestNames.set(row.code, row.name);
  const nonPeriod = all.filter(r => (filter.site === "all" || r.site === filter.site) && (filter.employee === "all" || r.code === filter.employee) && (filter.category === "all" || r.category === filter.category));
  const start = `${filter.year}-${filter.month === "all" ? "01" : filter.month}`;
  const end = `${filter.year}-${filter.month === "all" ? "12" : filter.month}`;
  const length = filter.month === "all" ? 12 : 1; const prevEnd = dashboardMonthOffset(start, -1); const prevStart = dashboardMonthOffset(start, -length);
  const within = (r: DashboardRow, from: string, to: string) => r.date.slice(0, 7) >= from && r.date.slice(0, 7) <= to;
  const rows = nonPeriod.filter(r => within(r, start, end)); const total = totals(rows); const previous = totals(nonPeriod.filter(r => within(r, prevStart, prevEnd)));
  const trendMonths = Array.from({ length: filter.month === "all" ? 12 : 6 }, (_, i) => filter.month === "all" ? `${filter.year}-${String(i + 1).padStart(2, "0")}` : dashboardMonthOffset(end, i - 5));
  const trend = trendMonths.map(m => { const b = bucket(m); nonPeriod.filter(r => r.date.startsWith(m)).forEach(r => add(b, r)); return b; });
  const sites = aggregate(rows, r => r.site).sort((a, b) => b.totalAmount - a.totalAmount || a.label.localeCompare(b.label, "ko"));
  const siteChart = sites.slice(0, 10).map(s => ({ ...s }));
  if (sites.length > 10) { const b = bucket(`기타 ${sites.length - 10}곳`); for (const s of sites.slice(10)) for (const k of ["totalAmount", "workMinutes", "count", "overtimeAmount", "substituteAmount", "legalHolidayAmount"] as const) b[k] = sum(b[k], s[k]); siteChart.push(b); }
  const ratio = dashboardCategories.map(category => { const b = bucket(dashboardCategoryLabels[category]); rows.filter(r => r.category === category).forEach(r => add(b, r)); return { ...b, category, percent: total.amount ? b.totalAmount / total.amount * 100 : 0 }; });
  const byEmployee = new Map<string, DashboardRow[]>(); for (const row of rows) byEmployee.set(row.code, [...(byEmployee.get(row.code) || []), row]);
  const ranking = [...byEmployee].map(([code, records]) => ({ code, name: latestNames.get(code)!, site: [...new Set(records.map(r => r.site))].sort().join(", "), totalAmount: totals(records).amount, workMinutes: totals(records).minutes, count: records.length })).sort((a, b) => b.totalAmount - a.totalAmount || a.code.localeCompare(b.code));
  if (ranking.reduce((n, r) => sum(n, r.totalAmount), 0) !== total.amount || ranking.reduce((n, r) => sum(n, r.workMinutes), 0) !== total.minutes) throw new Error("순위 집계 합계가 일치하지 않습니다.");
  return { filter: { ...filter }, rows, totals: total, previous, growth: { amount: dashboardGrowth(total.amount, previous.amount), minutes: dashboardGrowth(total.minutes, previous.minutes), employees: dashboardGrowth(total.employees, previous.employees), count: dashboardGrowth(total.count, previous.count) }, periodLabel: filter.month === "all" ? `${filter.year}년 전체` : `${filter.year}년 ${Number(filter.month)}월`, trendLabel: `${trendMonths[0]} ~ ${trendMonths[trendMonths.length - 1]}`, trend, sites, siteChart, ratio, ranking, options: { years: [...new Set([filter.year, ...all.map(r => r.date.slice(0, 4))])].sort().reverse(), sites: [...new Set(all.map(r => r.site))].sort((a, b) => a.localeCompare(b, "ko")), employees: [...latestNames].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, "ko") || a.code.localeCompare(b.code)) } };
}
export function dashboardChartInput(model: DashboardModel, key: DashboardKey): DashboardChartExportInput {
  const { filter: f } = model;
  const currency = ["overtimeAmount", "substituteAmount", "legalHolidayAmount", "totalAmount"].map((key, i) => ({ key, header: ["연장수당(원)", "대체수당(원)", "법정휴일수당(원)", "합계(원)"][i], format: "currency" as const }));
  let rows: DashboardChartExportRow[]; let columns: DashboardChartExportInput["columns"];
  const minutes = { key: "workMinutes", header: "근로시간(분)", format: "number" as const };
  if (key === "trend" || key === "site") {
    const first = key === "trend" ? "month" : "siteName";
    columns = [{ key: first, header: key === "trend" ? "월" : "근무지", format: "text" }, ...currency, minutes];
    rows = (key === "trend" ? model.trend : model.sites).map(b => ({ [first]: b.label, overtimeAmount: b.overtimeAmount, substituteAmount: b.substituteAmount, legalHolidayAmount: b.legalHolidayAmount, totalAmount: b.totalAmount, workMinutes: b.workMinutes }));
  } else if (key === "ratio") {
    columns = [{ key: "category", header: "수당 구분", format: "text" }, { key: "totalAmount", header: "금액(원)", format: "currency" }, { key: "ratioPercent", header: "비율(%)", format: "percent" }];
    rows = model.ratio.map(r => ({ category: r.label, totalAmount: r.totalAmount, ratioPercent: r.percent }));
  } else {
    columns = [{ key: "rank", header: "순위", format: "number" }, { key: "employeeCode", header: "사번", format: "text" }, { key: "employeeName", header: "이름", format: "text" }, { key: "siteName", header: "근무지", format: "text" }, minutes, { key: "totalAmount", header: "합계(원)", format: "currency" }];
    rows = model.ranking.map((r, i) => ({ rank: i + 1, employeeCode: r.code, employeeName: r.name, siteName: r.site, workMinutes: r.workMinutes, totalAmount: r.totalAmount }));
  }
  const title = { trend: "월별 산출 수당 추이", site: "근무지별 산출 수당", ratio: "수당 구분별 비중", ranking: "전체 인원 순위" }[key];
  return { chartKey: key, chartTitle: `${title} (${key === "trend" ? model.trendLabel : model.periodLabel})`, sheetName: title, filters: { year: f.year, month: f.month === "all" ? "전체" : `${Number(f.month)}월`, periodLabel: key === "trend" ? model.trendLabel : model.periodLabel, siteName: f.site === "all" ? "전체" : f.site, employeeName: f.employee === "all" ? "전체" : `${model.options.employees.find(e => e.code === f.employee)?.name || ""} (${f.employee})`, dataSource: dashboardSourceLabel }, columns, rows };
}
export function dashboardReportInput(model: DashboardModel, outputFormat: "xlsx" | "pdf"): DashboardReportExportInput {
  const charts = (["trend", "site", "ratio", "ranking"] as const).map(key => dashboardChartInput(model, key));
  return { title: `산출 수당 집계 보고서 (${model.periodLabel})`, filters: { ...charts[0].filters, periodLabel: `본표 ${model.periodLabel} / 추이 ${model.trendLabel}` }, outputFormat, sections: charts.map(c => ({ sectionKey: c.chartKey, chartTitle: c.chartTitle, sheetName: c.sheetName, columns: c.columns, rows: c.rows })) };
}
export const dashboardMoney = (n: number): string => `${n.toLocaleString("ko-KR")}원`;
export const dashboardTime = (n: number): string => `${Math.floor(n / 60).toLocaleString("ko-KR")}시간${n % 60 ? ` ${n % 60}분` : ""}`;
