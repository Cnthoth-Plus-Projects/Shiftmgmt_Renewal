import type {
  PerformanceApprovalScope,
  PerformanceEntrySection,
  PerformanceOverviewRow
} from "../../shared/domain/performance-file";
import {
  getNonPayablePerformanceReasonText,
  isNonPayablePerformanceEntry
} from "../../shared/domain/performance-file";
import type { MonthlyScheduleRecord, ShiftPatternRecord, SiteRecord } from "../../shared/domain/model";
import { getPatternDutyCodes } from "../../shared/domain/holiday-pattern";
import { resolveShiftPatternForMonth } from "../../shared/domain/shift-pattern-version";
import type { PageRange } from "../pagination";

export interface PerformanceDutyContext {
  sites: readonly Pick<SiteRecord, "id" | "name">[];
  patterns: readonly ShiftPatternRecord[];
  schedules: readonly Pick<MonthlyScheduleRecord, "siteId" | "siteName" | "scheduleMonth" | "patternId">[];
}

/** Use the saved month's pattern before resolving a version; never use another site's labels. */
export function getPerformanceDuty(row: PerformanceOverviewRow, context: PerformanceDutyContext) {
  const code = row.entry.dutyCode?.trim().toUpperCase() || "";
  const defaults: Record<string, string> = { D: "주간", E: "석간", N: "야간", O: "휴무", OFF: "휴무", OT: "연장" };
  let label = defaults[code] || code || "미확인";
  const sites = context.sites.filter(site => site.name === row.entry.siteName);
  const month = row.entry.scheduleMonth || row.entry.workDate.slice(0, 7);
  if (sites.length === 1) {
    const siteId = sites[0].id;
    const saved = context.schedules.filter(schedule => schedule.siteId === siteId && schedule.scheduleMonth === month);
    const patternIds = new Set(saved.map(schedule => schedule.patternId));
    const pattern = patternIds.size === 1
      ? context.patterns.find(candidate => candidate.id === saved[0].patternId && candidate.siteId === siteId)
      : saved.length === 0
        ? resolveShiftPatternForMonth(context.patterns.filter(candidate => candidate.siteId === siteId), month)
        : null;
    const duties = pattern?.dutyTypes || [];
    const codes = getPatternDutyCodes(duties);
    const duty = duties.find(candidate => codes[candidate.id] === (code === "OFF" ? "O" : code));
    if (duty?.label.trim()) label = duty.label;
  }
  const colorCode = code === "OFF" ? "O" : code;
  return { code, label, className: `perf-duty-${["D", "E", "N", "O", "OT"].includes(colorCode) ? colorCode : "unknown"}` };
}

/** Keep selection inside the displayed page, including after refresh, resize and collapse. */
export function getPerformancePageSelection(
  rows: readonly PerformanceOverviewRow[], range: PageRange, selectedRowId: string | null,
  collapsedSites: ReadonlySet<string>
): PerformanceOverviewRow | null {
  const visible = rows.slice(range.start, range.end).filter(row => !collapsedSites.has(row.entry.siteName || "미지정 근무지"));
  return visible.find(row => row.rowId === selectedRowId) || visible[0] || null;
}

export type DensityMode = "normal" | "compact" | "spacious";

export interface PerformanceFilterState {
  scheduleMonth: string;
  siteName: string;
  section: PerformanceEntrySection | "all";
  approvalScope: PerformanceApprovalScope;
  statusFilter:
    | "all"
    | "pending"
    | "approved"
    | "rejected"
    | "non-payable"
    | "reapproval-pending"
    | "reapproval-completed"
    | "locked";
  searchQuery: string;
  density: DensityMode;
}

export type PerformanceBadgeType =
  | "approved"
  | "pending"
  | "rejected"
  | "reapproval-pending"
  | "reapproval-completed"
  | "locked"
  | "non-payable"
  | "legal-holiday";

export interface PerformanceBadgeInfo {
  type: PerformanceBadgeType;
  label: string;
  className: string;
  description?: string;
}

export interface FlattenedPerformanceItem {
  kind: "group-header" | "row";
  siteName: string;
  isContinuation?: boolean;
  isCollapsed?: boolean;
  totalInSite?: number;
  row?: PerformanceOverviewRow;
}

export interface PerformanceKpiSummary {
  totalRows: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  needsReapprovalCount: number;
  changeLockedCount: number;
  nonPayableCount: number;
  legalHolidayCount: number;
  approvableCount: number;
}

/** 8가지 상태 배지 파생 (상호배타가 아니며 복수 병기 가능) */
export function deriveRowBadges(row: PerformanceOverviewRow): PerformanceBadgeInfo[] {
  const badges: PerformanceBadgeInfo[] = [];

  // 1. 법정휴일
  if (row.entry.section === "legal-holiday") {
    badges.push({
      type: "legal-holiday",
      label: "법정휴일",
      className: "badge-legal-holiday",
      description: "법정휴일 근로 실적입니다."
    });
  }

  // 2. 수당 미지급 (Pool, BP, 사번없음, 비적격 대체근무 등)
  const isNonPayable =
    row.approvalStatus === "non-payable" || isNonPayablePerformanceEntry(row.entry);
  if (isNonPayable) {
    const reasonText = getNonPayablePerformanceReasonText(row.entry) || "수당 미지급 대상 실적입니다.";
    badges.push({
      type: "non-payable",
      label: "수당 미지급",
      className: "badge-non-payable",
      description: reasonText
    });
  }

  // 3. 변경불가 / 품의잠금
  if (row.isChangeLocked) {
    badges.push({
      type: "locked",
      label: "변경불가",
      className: "badge-locked",
      description: row.changeLockedReason || "품의 완료 또는 관리 잠금으로 수정/취소할 수 없습니다."
    });
  }

  // 4. 재승인 상태
  if (row.reapprovalStatus === "completed") {
    badges.push({
      type: "reapproval-completed",
      label: "재승인 완료",
      className: "badge-reapproval-completed",
      description: "수정 실적이 재승인되었습니다. 파일 단위 확정이 필요합니다."
    });
  } else if (row.needsReapproval && row.reapprovalStatus === "pending") {
    badges.push({
      type: "reapproval-pending",
      label: "재승인 대기",
      className: "badge-reapproval-pending",
      description: "수정 엑셀이 감지되어 재검토 및 재승인이 필요합니다."
    });
  }

  // 5. 기본 승인/대기/반려 상태
  if (row.approvalStatus === "approved") {
    badges.push({
      type: "approved",
      label: "승인",
      className: "badge-approved",
      description: row.latestApprovalAt
        ? `${row.latestApprovalByName || "승인자"} (${row.latestApprovalAt.slice(0, 10)})`
        : "승인 완료"
    });
  } else if (row.approvalStatus === "rejected") {
    badges.push({
      type: "rejected",
      label: "반려",
      className: "badge-rejected",
      description: "반려된 실적입니다."
    });
  } else if (row.approvalStatus === "pending" && !row.needsReapproval) {
    badges.push({
      type: "pending",
      label: "대기",
      className: "badge-pending",
      description: "승인 검토 대기 중입니다."
    });
  }

  return badges;
}

/** 행 정렬 비교 함수: 근무지명 -> 근무일자 -> 조 -> 사번 -> 원본순 */
export function comparePerformanceRows(
  a: PerformanceOverviewRow,
  b: PerformanceOverviewRow
): number {
  const siteA = a.entry.siteName || "";
  const siteB = b.entry.siteName || "";
  const siteCmp = siteA.localeCompare(siteB, "ko", { numeric: true });
  if (siteCmp !== 0) return siteCmp;

  const dateA = a.entry.workDate || "";
  const dateB = b.entry.workDate || "";
  const dateCmp = dateA.localeCompare(dateB);
  if (dateCmp !== 0) return dateCmp;

  const teamA = a.entry.teamLabel || "";
  const teamB = b.entry.teamLabel || "";
  const teamCmp = teamA.localeCompare(teamB, "ko", { numeric: true });
  if (teamCmp !== 0) return teamCmp;

  const empA = a.entry.employeeCode || "";
  const empB = b.entry.employeeCode || "";
  const empCmp = empA.localeCompare(empB, "ko", { numeric: true });
  if (empCmp !== 0) return empCmp;

  return (a.entry.sortOrder ?? 0) - (b.entry.sortOrder ?? 0);
}

/** 행 필터링 */
export function matchPerformanceRow(
  row: PerformanceOverviewRow,
  filter: PerformanceFilterState
): boolean {
  // 0. 근무월 필터 (D08)
  if (filter.scheduleMonth) {
    const rowMonth = row.entry.scheduleMonth || (row.entry.workDate ? row.entry.workDate.slice(0, 7) : "");
    if (rowMonth && rowMonth !== filter.scheduleMonth) {
      return false;
    }
  }

  // 1. 근무지 필터
  if (filter.siteName && filter.siteName !== "all") {
    if (row.entry.siteName !== filter.siteName) {
      return false;
    }
  }

  // 2. 섹션(유형) 필터
  if (filter.section && filter.section !== "all") {
    if (row.entry.section !== filter.section) {
      return false;
    }
  }

  // 3. 상태 필터
  if (filter.statusFilter && filter.statusFilter !== "all") {
    switch (filter.statusFilter) {
      case "approved":
        if (row.approvalStatus !== "approved") return false;
        break;
      case "pending":
        if (row.approvalStatus !== "pending" || row.needsReapproval) return false;
        break;
      case "rejected":
        if (row.approvalStatus !== "rejected") return false;
        break;
      case "non-payable":
        if (!isNonPayablePerformanceEntry(row.entry) && row.approvalStatus !== "non-payable") {
          return false;
        }
        break;
      case "reapproval-pending":
        if (!row.needsReapproval || row.reapprovalStatus !== "pending") return false;
        break;
      case "reapproval-completed":
        if (row.reapprovalStatus !== "completed") return false;
        break;
      case "locked":
        if (!row.isChangeLocked) return false;
        break;
    }
  }

  // 4. 검색어 (사번, 이름, 원본파일명, 사유, 조명)
  const q = filter.searchQuery.trim().toLowerCase();
  if (q) {
    const code = (row.entry.employeeCode || "").toLowerCase();
    const name = (row.entry.employeeName || "").toLowerCase();
    const file = (row.sourceFileName || "").toLowerCase();
    const reason = (row.entry.reason || "").toLowerCase();
    const team = (row.entry.teamLabel || "").toLowerCase();
    if (
      !code.includes(q) &&
      !name.includes(q) &&
      !file.includes(q) &&
      !reason.includes(q) &&
      !team.includes(q)
    ) {
      return false;
    }
  }

  return true;
}

/** 전체 스냅샷으로부터 KPI 통계 계산 */
export function calculatePerformanceKpi(rows: PerformanceOverviewRow[]): PerformanceKpiSummary {
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let needsReapprovalCount = 0;
  let changeLockedCount = 0;
  let nonPayableCount = 0;
  let legalHolidayCount = 0;
  let approvableCount = 0;

  for (const row of rows) {
    if (row.approvalStatus === "approved") approvedCount++;
    if (row.approvalStatus === "pending" && !row.needsReapproval) pendingCount++;
    if (row.approvalStatus === "rejected") rejectedCount++;
    if (row.needsReapproval && row.reapprovalStatus === "pending") needsReapprovalCount++;
    if (row.isChangeLocked) changeLockedCount++;
    if (isNonPayablePerformanceEntry(row.entry) || row.approvalStatus === "non-payable") {
      nonPayableCount++;
    }
    if (row.entry.section === "legal-holiday") legalHolidayCount++;
    if (row.canApprove) approvableCount++;
  }

  return {
    totalRows: rows.length,
    approvedCount,
    pendingCount,
    rejectedCount,
    needsReapprovalCount,
    changeLockedCount,
    nonPayableCount,
    legalHolidayCount,
    approvableCount
  };
}

/** 근무지 그룹화 및 접기 처리된 평탄화 목록 생성 */
export function flattenPerformanceGroups(
  rows: PerformanceOverviewRow[],
  collapsedSites: Set<string>
): FlattenedPerformanceItem[] {
  // 1. 근무지별로 분류
  const siteMap = new Map<string, PerformanceOverviewRow[]>();
  for (const row of rows) {
    const site = row.entry.siteName || "미지정 근무지";
    let list = siteMap.get(site);
    if (!list) {
      list = [];
      siteMap.set(site, list);
    }
    list.push(row);
  }

  // 2. 근무지명 정렬
  const sortedSites = Array.from(siteMap.keys()).sort((a, b) =>
    a.localeCompare(b, "ko", { numeric: true })
  );

  const result: FlattenedPerformanceItem[] = [];
  for (const siteName of sortedSites) {
    const siteRows = siteMap.get(siteName)!;
    const isCollapsed = collapsedSites.has(siteName);

    // 헤더 아이템
    result.push({
      kind: "group-header",
      siteName,
      isCollapsed,
      totalInSite: siteRows.length
    });

    if (!isCollapsed) {
      for (const row of siteRows) {
        result.push({
          kind: "row",
          siteName,
          row
        });
      }
    }
  }

  return result;
}

/** 금액 포맷: 0원과 미저장 구분 */
export function formatCurrencyOrUnsaved(
  amount: number | null | undefined,
  hasCalculatedRecord: boolean
): string {
  if (!hasCalculatedRecord || amount === null || amount === undefined) {
    return "저장 전";
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 시간(분) 포맷 */
export function formatMinutesToHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

/** 업무코드 영문 -> 한국어 변환 (D07) */
export function formatSectionLabel(section: string | null | undefined): string {
  switch (section) {
    case "substitute":
      return "대체근무";
    case "legal-holiday":
      return "법정휴일";
    case "overtime":
      return "연장근무";
    default:
      return section || "-";
  }
}

/** 밀도별 행 높이 및 헤더 높이 반환 */
export function getDensityHeights(density: DensityMode): {
  rowHeight: number;
  groupHeight: number;
} {
  switch (density) {
    case "compact":
      return { rowHeight: 32, groupHeight: 28 };
    case "spacious":
      return { rowHeight: 46, groupHeight: 36 };
    case "normal":
    default:
      return { rowHeight: 38, groupHeight: 32 };
  }
}
