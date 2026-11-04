import type { PageRange } from "../pagination";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type {
  AllowanceCalculationStatus,
  AllowanceProposalPreview,
} from "../../shared/domain/allowance-workflow";

export type DensityMode = "normal" | "compact" | "spacious";
export type AllowanceTabId =
  | "results"
  | "calculations"
  | "reviews"
  | "proposals"
  | "exports"
  | "overview"
  | "history";

/** 수당 관리 화면 필터 상태 */
export interface AllowanceFilterState {
  scheduleMonth: string; // YYYY-MM
  workMonth?: string; // alias
  siteName: string; // "all" 또는 특정 근무지명
  statusFilter: AllowanceCalculationStatus | "all";
  status?: AllowanceCalculationStatus | "all"; // alias
  workType?: string; // "all" 또는 특정 근무 유형
  payoutType: "all" | "regular" | "early";
  searchQuery: string;
  activeTab?: AllowanceTabId;
  density: DensityMode;
}

/** KPI 요약 통계 (R02 4대 KPI 및 R04 선택 합계 구분) */
export interface AllowanceKpiSummary {
  totalCount: number;
  employeeCount: number;
  regularTotalAmount: number;
  earlyPayoutTotalAmount: number;
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  proposalApprovedCount: number;
  selectedCount: number;
  selectedAmount: number;
}

/** 상태 배지 정보 */
export interface AllowanceBadgeInfo {
  type: "pending" | "approved" | "rejected" | "locked" | "early";
  label: string;
  className: string;
  description: string;
}

/** 근무지별 그룹 구조 */
export interface AllowanceGroup {
  siteName: string;
  rows: AllowanceCalculationResultRecord[];
  totalAmount: number;
  count: number;
}

/** 스냅샷 정합성 점검 결과 (R06, N07: 0원과 미저장 구분 및 합계 대조) */
export interface AllowanceSnapshotInspection {
  hasSnapshot: boolean;
  isZeroAmount: boolean;
  totalAllowanceAmount: number;
  lineSumAmount: number;
  isLineSumConsistent: boolean;
  businessCategoryLabel: string;
  calculationVersion: number | null;
}

/** 품의 미리보기 바인딩 불변 지문 (UI06-D02, R10, R11, N05) */
export interface AllowancePreviewBinding {
  workMonth: string;
  outputFormat: "pdf" | "xlsx";
  calculationIds: string[];
  signatureHash: string;
  hasSignatureMap: boolean;
  isPreviewConsistent: boolean;
  totalAllowanceAmount: number;
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
}

/** 밀도별 높이 기준 */
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

/** 페이지 내 선택 유지 및 첫 가시행 선택 (UI05-D08 방지) */
export function getAllowancePageSelection(
  rows: readonly AllowanceCalculationResultRecord[],
  range: PageRange,
  selectedId: string | null
): AllowanceCalculationResultRecord | null {
  const visible = rows.slice(range.start, range.end);
  return visible.find(r => r.id === selectedId) || visible[0] || null;
}

/** 금액 포맷팅 (1원 단위 정수) */
export function formatCurrency(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return `${n.toLocaleString("ko-KR")}원`;
}

/** 근로 분(minutes)을 "X시간 Y분" 포맷으로 변환 */
export function formatWorkMinutes(minutes: number | null | undefined): string {
  const m = typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}시간 ${rem}분`;
  if (h > 0) return `${h}시간`;
  return `${rem}분`;
}

/** 근무 유형 한글 라벨 (정본 WorkType 5종 + 호환 코드 지원) */
export function formatWorkTypeLabel(workType: string | null | undefined): string {
  switch (workType) {
    case "regular":
      return "통상근무";
    case "overtime":
      return "연장근무";
    case "night":
      return "야간근무";
    case "holiday":
      return "휴일근무";
    case "substitute":
      return "대체근무";
    case "shift":
      return "교대근무";
    case "day":
      return "주간근무";
    case "evening":
      return "석간근무";
    default:
      return workType || "-";
  }
}

/** 수당 산출 항목 코드 한글 라벨 */
export function formatAllowanceLineCodeLabel(code: string | null | undefined): string {
  switch (code) {
    case "base":
      return "기본근로";
    case "overtime":
      return "연장근로";
    case "night":
      return "야간근로";
    default:
      return code || "-";
  }
}

/** 수당 상태 한글 라벨 */
export function formatStatusLabel(status: AllowanceCalculationStatus | string): string {
  switch (status) {
    case "pending":
      return "검토 대기";
    case "approved":
      return "검토 승인";
    case "rejected":
      return "반려";
    case "proposal-approved":
      return "품의 승인(마감)";
    default:
      return status;
  }
}

/** 저장된 스냅샷 정합성 검사 (R06, N07: 0원과 미저장 명확 구분, line 합계 대조) */
export function inspectAllowanceSnapshot(
  row: AllowanceCalculationResultRecord | null | undefined
): AllowanceSnapshotInspection {
  const snap = row?.snapshot;
  if (!snap || typeof snap.totalAllowanceAmount !== "number") {
    return {
      hasSnapshot: false,
      isZeroAmount: false,
      totalAllowanceAmount: 0,
      lineSumAmount: 0,
      isLineSumConsistent: false,
      businessCategoryLabel: "-",
      calculationVersion: null,
    };
  }

  const lines = Array.isArray(snap.lines) ? snap.lines : [];
  const lineSumAmount = lines.reduce(
    (sum, line) => sum + (typeof line.amount === "number" ? Math.trunc(line.amount) : 0),
    0
  );
  const totalAllowanceAmount = Math.trunc(snap.totalAllowanceAmount);

  return {
    hasSnapshot: true,
    isZeroAmount: totalAllowanceAmount === 0,
    totalAllowanceAmount,
    lineSumAmount,
    isLineSumConsistent: lineSumAmount === totalAllowanceAmount,
    businessCategoryLabel: snap.businessCategoryLabel || formatWorkTypeLabel(row?.workType),
    calculationVersion:
      typeof snap.calculationVersion === "number" ? snap.calculationVersion : null,
  };
}

/** 행 상태에 따른 배지 정보 목록 도출 */
export function deriveAllowanceBadges(row: AllowanceCalculationResultRecord): AllowanceBadgeInfo[] {
  const badges: AllowanceBadgeInfo[] = [];

  if (row.status === "proposal-approved") {
    badges.push({
      type: "locked",
      label: "품의 완료",
      className: "badge-locked",
      description: "품의 결재가 완료되어 수정이 잠긴 상태입니다.",
    });
  } else if (row.status === "approved") {
    badges.push({
      type: "approved",
      label: "검토 승인",
      className: "badge-approved",
      description: "검토 승인이 완료된 건입니다.",
    });
  } else if (row.status === "rejected") {
    badges.push({
      type: "rejected",
      label: "반려",
      className: "badge-rejected",
      description: "검토에서 반려된 건입니다.",
    });
  } else {
    badges.push({
      type: "pending",
      label: "검토 대기",
      className: "badge-pending",
      description: "관리자 검토 대기 중인 건입니다.",
    });
  }

  if (row.earlyPayoutDate) {
    badges.push({
      type: "early",
      label: `조기지급 (${row.earlyPayoutDate})`,
      className: "badge-early-payout",
      description: `조기지급일: ${row.earlyPayoutDate}`,
    });
  }

  return badges;
}

/** 단일 배지 정보 호환용 */
export function deriveStatusBadge(row: AllowanceCalculationResultRecord): AllowanceBadgeInfo {
  const badges = deriveAllowanceBadges(row);
  return badges[0];
}

/** KPI 계산 (필터링된 결과 전체 기준 정수 합산 및 선택 합계 별도 집계) */
export function calculateAllowanceKpi(
  rows: AllowanceCalculationResultRecord[],
  selectedIds?: Set<string>
): AllowanceKpiSummary {
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let proposalApprovedCount = 0;
  let totalAmount = 0;
  let regularTotalAmount = 0;
  let earlyPayoutTotalAmount = 0;
  let selectedCount = 0;
  let selectedAmount = 0;
  const employeesSet = new Set<string>();

  for (const r of rows) {
    const amt =
      typeof r.snapshot?.totalAllowanceAmount === "number"
        ? Math.trunc(r.snapshot.totalAllowanceAmount)
        : 0;
    totalAmount += amt;

    if (r.earlyPayoutDate) {
      earlyPayoutTotalAmount += amt;
    } else {
      regularTotalAmount += amt;
    }

    if (r.employeeCode) {
      employeesSet.add(r.employeeCode);
    } else if (r.employeeName) {
      employeesSet.add(r.employeeName);
    }

    if (r.status === "pending") pendingCount++;
    else if (r.status === "approved") approvedCount++;
    else if (r.status === "rejected") rejectedCount++;
    else if (r.status === "proposal-approved") proposalApprovedCount++;

    if (selectedIds && selectedIds.has(r.id)) {
      selectedCount++;
      selectedAmount += amt;
    }
  }

  return {
    totalCount: rows.length,
    employeeCount: employeesSet.size,
    regularTotalAmount,
    earlyPayoutTotalAmount,
    totalAmount,
    pendingCount,
    approvedCount,
    rejectedCount,
    proposalApprovedCount,
    selectedCount,
    selectedAmount,
  };
}

/** 행 정렬 비교 함수: 근무지(ko numeric) -> 근무일자 -> 사번 -> 계산 ID */
export function compareAllowanceRows(
  a: AllowanceCalculationResultRecord,
  b: AllowanceCalculationResultRecord
): number {
  const siteCmp = (a.siteName || "").localeCompare(b.siteName || "", "ko", { numeric: true });
  if (siteCmp !== 0) return siteCmp;

  const dateCmp = (a.workDate || "").localeCompare(b.workDate || "");
  if (dateCmp !== 0) return dateCmp;

  const empCmp = (a.employeeCode || "").localeCompare(b.employeeCode || "");
  if (empCmp !== 0) return empCmp;

  return (a.id || "").localeCompare(b.id || "");
}

/** 행 필터링 조건 검사 */
export function matchAllowanceRow(
  row: AllowanceCalculationResultRecord,
  filter: AllowanceFilterState
): boolean {
  const monthFilter = filter.workMonth || filter.scheduleMonth;
  if (monthFilter) {
    const rowMonth = row.workDate ? row.workDate.slice(0, 7) : "";
    if (rowMonth !== monthFilter) return false;
  }

  if (filter.siteName && filter.siteName !== "all" && row.siteName !== filter.siteName) {
    return false;
  }

  const stFilter = filter.status || filter.statusFilter;
  if (stFilter && stFilter !== "all" && row.status !== stFilter) {
    return false;
  }

  if (filter.workType && filter.workType !== "all" && row.workType !== filter.workType) {
    return false;
  }

  if (filter.payoutType === "regular" && row.earlyPayoutDate) return false;
  if (filter.payoutType === "early" && !row.earlyPayoutDate) return false;

  if (filter.searchQuery && filter.searchQuery.trim().length > 0) {
    const q = filter.searchQuery.trim().toLowerCase();
    const matchName = (row.employeeName || "").toLowerCase().includes(q);
    const matchCode = (row.employeeCode || "").toLowerCase().includes(q);
    const matchSite = (row.siteName || "").toLowerCase().includes(q);
    const matchFile = (row.fileName || "").toLowerCase().includes(q);
    const matchWorkType = formatWorkTypeLabel(row.workType).toLowerCase().includes(q);
    const matchCategory = (row.snapshot?.businessCategoryLabel || "").toLowerCase().includes(q);
    if (!matchName && !matchCode && !matchSite && !matchFile && !matchWorkType && !matchCategory) {
      return false;
    }
  }

  return true;
}

/** 달력 기준 실제 날짜 유효성 검사 (N06: 2026-02-30 등 거짓 날짜 차단) */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return (
    dateObj.getUTCFullYear() === y &&
    dateObj.getUTCMonth() === m - 1 &&
    dateObj.getUTCDate() === d
  );
}

/** 근무지별 그룹화 */
export function groupAllowanceRows(rows: AllowanceCalculationResultRecord[]): AllowanceGroup[] {
  const groupMap = new Map<string, AllowanceCalculationResultRecord[]>();
  for (const r of rows) {
    const site = r.siteName || "미지정 근무지";
    let list = groupMap.get(site);
    if (!list) {
      list = [];
      groupMap.set(site, list);
    }
    list.push(r);
  }

  const groups: AllowanceGroup[] = [];
  for (const [siteName, siteRows] of groupMap.entries()) {
    const totalAmount = siteRows.reduce(
      (sum, r) => sum + (r.snapshot?.totalAllowanceAmount || 0),
      0
    );
    groups.push({
      siteName,
      rows: siteRows,
      totalAmount,
      count: siteRows.length,
    });
  }

  groups.sort((a, b) => a.siteName.localeCompare(b.siteName, "ko", { numeric: true }));
  return groups;
}

/** 품의 미리보기 바인딩 불변 지문 생성 (UI06-D02, R10, N05) */
export function createPreviewBinding(
  preview: AllowanceProposalPreview,
  outputFormat: "pdf" | "xlsx",
  sourceRows?: AllowanceCalculationResultRecord[]
): AllowancePreviewBinding {
  const calculationIds = [...new Set(preview.rows.map(r => r.calculationId))].sort();
  const sortedRows = [...preview.rows].sort((a, b) =>
    a.calculationId.localeCompare(b.calculationId)
  );
  const sigById = sourceRows ? new Map(sourceRows.map(r => [r.id, r.signature || ""])) : null;
  const matchesSelectedIds = !sourceRows || (
    sourceRows.length === calculationIds.length &&
    sigById?.size === sourceRows.length &&
    calculationIds.every(id => sigById?.has(id))
  );

  const signatureHash = sortedRows
    .map(r => {
      const sig = sigById ? sigById.get(r.calculationId) || "" : "";
      return `${r.calculationId}:${r.siteName}:${r.workDate}:${r.totalAllowanceAmount}:${r.earlyPayoutDate || ""}:${sig}`;
    })
    .join("|");

  const rowTotalSum = preview.rows.reduce((s, r) => s + r.totalAllowanceAmount, 0);
  const isPreviewConsistent =
    matchesSelectedIds &&
    preview.rows.length === calculationIds.length &&
    preview.calculationCount === preview.rows.length &&
    preview.regularTotalAllowanceAmount + preview.earlyPayoutTotalAllowanceAmount ===
      preview.totalAllowanceAmount &&
    rowTotalSum === preview.totalAllowanceAmount;

  return {
    workMonth: preview.workMonth,
    outputFormat,
    calculationIds,
    signatureHash,
    hasSignatureMap: Boolean(sigById),
    isPreviewConsistent,
    totalAllowanceAmount: preview.totalAllowanceAmount,
    regularTotalAllowanceAmount: preview.regularTotalAllowanceAmount,
    earlyPayoutTotalAllowanceAmount: preview.earlyPayoutTotalAllowanceAmount,
  };
}

/** 최신 행들과 바인딩 지문 대조 (UI06-D02, N05: ID/status/month/site/money/payout/signature) */
export function validatePreviewBinding(
  binding: AllowancePreviewBinding,
  latestRows: AllowanceCalculationResultRecord[]
): { valid: boolean; reason?: string } {
  if (!binding.isPreviewConsistent) {
    return {
      valid: false,
      reason: "품의 미리보기 대상 ID, 행 수 또는 합계 정합성이 일치하지 않아 승인할 수 없습니다.",
    };
  }

  const matchedLatest = latestRows.filter(r => binding.calculationIds.includes(r.id));
  if (matchedLatest.length !== binding.calculationIds.length) {
    return {
      valid: false,
      reason: "미리보기 대상 수당 계산 항목 중 일부가 최신 결과에서 제거되었습니다. 다시 미리보기를 수행해 주십시오.",
    };
  }

  for (const r of matchedLatest) {
    if (r.status !== "approved") {
      return {
        valid: false,
        reason: `계산 항목(${r.id})의 상태가 '${formatStatusLabel(r.status)}' 상태입니다. '검토 승인' 상태인 건만 품의할 수 있습니다.`,
      };
    }
    const rowMonth = r.workDate ? r.workDate.slice(0, 7) : "";
    if (rowMonth !== binding.workMonth) {
      return {
        valid: false,
        reason: `계산 항목(${r.id})의 근무월(${rowMonth})이 품의 대상월(${binding.workMonth})과 일치하지 않습니다.`,
      };
    }
  }

  matchedLatest.sort((a, b) => a.id.localeCompare(b.id));
  const latestHash = matchedLatest
    .map(r => {
      const sig = binding.hasSignatureMap ? r.signature || "" : "";
      return `${r.id}:${r.siteName}:${r.workDate}:${r.snapshot?.totalAllowanceAmount || 0}:${r.earlyPayoutDate || ""}:${sig}`;
    })
    .join("|");

  if (latestHash !== binding.signatureHash) {
    return {
      valid: false,
      reason:
        "미리보기 생성 이후 대상 건의 금액, 조기지급일, 근무지 또는 산출 서명이 변경되었습니다. 새 미리보기가 필요합니다.",
    };
  }

  return { valid: true };
}

/** 확정 직전 최신 결과와 대상 행 무결성 재검증 (UI06-D02, L01, L02) */
export function validateFreshRecordsForAction(
  targetIds: string[],
  freshRows: AllowanceCalculationResultRecord[],
  options: {
    requiredStatus?: AllowanceCalculationStatus | AllowanceCalculationStatus[];
    checkSameMonth?: boolean;
    blockProposalApproved?: boolean;
    expectedRecords?: AllowanceCalculationResultRecord[];
  } = {}
): { valid: boolean; reason?: string; freshTargets?: AllowanceCalculationResultRecord[] } {
  const uniqueIds = [...new Set(targetIds)];
  if (uniqueIds.length === 0) {
    return { valid: false, reason: "처리할 대상 항목이 선택되지 않았습니다." };
  }

  const freshMap = new Map(freshRows.map(r => [r.id, r]));
  const expectedMap = options.expectedRecords
    ? new Map(options.expectedRecords.map(r => [r.id, r]))
    : null;
  const freshTargets: AllowanceCalculationResultRecord[] = [];

  for (const id of uniqueIds) {
    const record = freshMap.get(id);
    if (!record) {
      return {
        valid: false,
        reason: `대상 항목(${id})이 최신 수당 산출 목록에 존재하지 않습니다. 목록을 새로고침해 주십시오.`,
      };
    }

    if (options.blockProposalApproved && record.status === "proposal-approved") {
      return {
        valid: false,
        reason: `항목(${record.employeeName || id})은 이미 품의 완료(마감)되어 변경할 수 없습니다.`,
      };
    }

    if (options.requiredStatus) {
      const allowed = Array.isArray(options.requiredStatus)
        ? options.requiredStatus
        : [options.requiredStatus];
      if (!allowed.includes(record.status)) {
        return {
          valid: false,
          reason: `항목(${record.employeeName || id})의 상태가 '${formatStatusLabel(record.status)}'입니다. (필요 상태: ${allowed.map(formatStatusLabel).join(", ")})`,
        };
      }
    }

    const expected = expectedMap?.get(id);
    if (expected) {
      const expAmt = expected.snapshot?.totalAllowanceAmount ?? 0;
      const curAmt = record.snapshot?.totalAllowanceAmount ?? 0;
      if (
        expected.status !== record.status ||
        expected.workDate !== record.workDate ||
        expected.siteName !== record.siteName ||
        expAmt !== curAmt ||
        (expected.earlyPayoutDate || "") !== (record.earlyPayoutDate || "") ||
        (expected.signature || "") !== (record.signature || "")
      ) {
        return {
          valid: false,
          reason: `확인창을 연 이후 항목(${record.employeeName || id})의 최신 상태·금액·지급일·서명이 변경되었습니다. 목록을 새로고침한 뒤 다시 진행해 주십시오.`,
        };
      }
    }

    freshTargets.push(record);
  }

  if (options.checkSameMonth && freshTargets.length > 0) {
    const firstMonth = freshTargets[0].workDate ? freshTargets[0].workDate.slice(0, 7) : "";
    for (const r of freshTargets) {
      const m = r.workDate ? r.workDate.slice(0, 7) : "";
      if (m !== firstMonth) {
        return {
          valid: false,
          reason: "서로 다른 근무월의 항목이 함께 선택되었습니다. 동일한 근무월 항목만 일괄 처리할 수 있습니다.",
        };
      }
    }
  }

  return { valid: true, freshTargets };
}

/** 자동 조회 시 DOM 불필요 재작성 방지를 위한 데이터 지문 계산 (§6.1 item 4) */
export function computeAllowanceDataFingerprint(params: {
  results: AllowanceCalculationResultRecord[];
  historyCount: number;
  reviewCount: number;
  proposalCount: number;
  exportCount: number;
  errorsKey: string;
}): string {
  const rowsSig = params.results
    .map(
      r =>
        `${r.id}:${r.status}:${r.earlyPayoutDate || ""}:${r.snapshot?.totalAllowanceAmount ?? 0}:${r.signature}`
    )
    .join("|");
  return `${rowsSig}#${params.historyCount}#${params.reviewCount}#${params.proposalCount}#${params.exportCount}#${params.errorsKey}`;
}
