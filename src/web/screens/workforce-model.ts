// 인력 관리 화면 순수 모델 및 유효성 검증 함수
import type {
  EmployeeRecord,
  WageRateRecord
} from "../../shared/domain/model";
import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import { isPayablePerformanceEntry } from "../../shared/domain/performance-file";
import { employeeRankOptions, isEmployeeRank, formatEmployeeRank, type EmployeeRank } from "../../shared/domain/employee-rank";
import { isBpEmploymentType, normalizeEmploymentTypeLabel } from "../../shared/domain/employment-type";
import type { WorkforceWageBulkUpdatePreviewInput } from "../../shared/bridge/contracts";

export { employeeRankOptions, isEmployeeRank, formatEmployeeRank, type EmployeeRank };
export { isBpEmploymentType, normalizeEmploymentTypeLabel };

export const MIN_HIRE_DATE = "1990-01-01";

/** 서울(Asia/Seoul) 기준 오늘 날짜 문자열(YYYY-MM-DD)을 반환한다. */
export function getSeoulTodayDateString(baseDate = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(baseDate);
}

/** 서울 기준 오늘+1년 날짜 문자열(YYYY-MM-DD)을 반환한다. */
export function getSeoulMaxHireDateString(todayStr: string): string {
  const [yearStr, monthStr, dayStr] = todayStr.split("-");
  const nextYear = parseInt(yearStr, 10) + 1;
  // 윤년 2월 29일인 경우 다음 해는 2월 28일로 처리
  if (monthStr === "02" && dayStr === "29") {
    return `${nextYear}-02-28`;
  }
  return `${nextYear}-${monthStr}-${dayStr}`;
}

/** YYYY-MM-DD 형식 및 실제 달력 유효 날짜인지 검증한다. */
export function isValidDateString(val: unknown): val is string {
  if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return false;
  }
  const [y, m, d] = val.split("-").map((v) => parseInt(v, 10));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** 입사일 유효성 검증 (1990-01-01 ~ 오늘+1년) */
export function validateHireDate(hireDate: string, todayStr: string): { valid: boolean; message?: string } {
  if (!hireDate || !isValidDateString(hireDate)) {
    return { valid: false, message: "올바른 입사일(YYYY-MM-DD)을 입력해 주세요." };
  }
  if (hireDate < MIN_HIRE_DATE) {
    return { valid: false, message: `입사일은 ${MIN_HIRE_DATE} 이후여야 합니다.` };
  }
  const maxHireDate = getSeoulMaxHireDateString(todayStr);
  if (hireDate > maxHireDate) {
    return { valid: false, message: `입사일은 오늘 기준 1년 이내(${maxHireDate}까지)여야 합니다.` };
  }
  return { valid: true };
}

/** 금액 포맷: 12000 -> "12,000원", 없으면 "-" */
export function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "-";
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 시급 이력에서 오늘 유효 시급과 적용 예정 시급을 계산한다. */
export interface EffectiveWageRateSummary {
  currentRate: WageRateRecord | null;
  scheduledRate: WageRateRecord | null;
  rates: WageRateRecord[];
}

export function calculateEffectiveWageRates(
  rates: WageRateRecord[],
  todayStr: string
): EffectiveWageRateSummary {
  if (!Array.isArray(rates) || rates.length === 0) {
    return { currentRate: null, scheduledRate: null, rates: [] };
  }

  // effectiveFrom 내림차순 정렬
  const sorted = [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  // 오늘 유효한 시급: effectiveFrom <= todayStr && (!effectiveTo || todayStr <= effectiveTo)
  // 가장 최근 적용된 줄 1개
  const currentRate =
    sorted.find(
      (r) =>
        r.effectiveFrom <= todayStr &&
        (!r.effectiveTo || todayStr <= r.effectiveTo)
    ) || null;

  // 적용 예정 시급: effectiveFrom > todayStr인 줄 중 가장 이른 줄
  const scheduledRates = sorted.filter((r) => r.effectiveFrom > todayStr);
  // 가장 이른 시작일
  const scheduledRate =
    scheduledRates.length > 0
      ? scheduledRates.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]
      : null;

  return {
    currentRate,
    scheduledRate,
    rates: sorted
  };
}

/** 인력 목록 필터링 */
export interface EmployeeFilterOptions {
  siteId?: string;
  status?: string;
  keyword?: string;
  orphanOnly?: boolean;
  employmentType?: string;
  shiftGroup?: string;
}

/** Order the full filtered collection before pagination, preserving team order. */
export function sortEmployeesByWorksite(employees: EmployeeRecord[]): EmployeeRecord[] {
  const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
  const assigned = (e: EmployeeRecord) => Boolean(e.currentSiteId && !e.currentSiteDeletedAt);
  return [...employees].sort((a, b) => {
    if (assigned(a) !== assigned(b)) return assigned(a) ? -1 : 1;
    if (assigned(a)) {
      const site = collator.compare(a.currentSiteName || "", b.currentSiteName || "") || collator.compare(a.currentSiteId || "", b.currentSiteId || "");
      if (site) return site;
    }
    return collator.compare(a.currentShiftGroup || "", b.currentShiftGroup || "") ||
      (a.currentAssignmentOrder ?? Number.MAX_SAFE_INTEGER) - (b.currentAssignmentOrder ?? Number.MAX_SAFE_INTEGER) ||
      collator.compare(a.employeeCode || "", b.employeeCode || "") || collator.compare(a.id, b.id);
  });
}

export function filterEmployees(
  employees: EmployeeRecord[],
  options: EmployeeFilterOptions
): EmployeeRecord[] {
  if (!Array.isArray(employees)) return [];

  const trimmedKeyword = (options.keyword || "").trim().toLowerCase();

  return employees.filter((emp) => {
    if (options.employmentType && options.employmentType !== "all" && normalizeEmploymentTypeLabel(emp.employmentType) !== options.employmentType) return false;
    if (options.shiftGroup && options.shiftGroup !== "all" && emp.currentShiftGroup !== options.shiftGroup) return false;
    // 삭제된 근무지(고아 배정) 필터
    if (options.orphanOnly) {
      if (!emp.currentSiteDeletedAt) {
        return false;
      }
    }

    // 근무지 필터
    if (options.siteId && options.siteId !== "all") {
      if (options.siteId === "unassigned" ? Boolean(emp.currentSiteId && !emp.currentSiteDeletedAt) : emp.currentSiteId !== options.siteId) {
        return false;
      }
    }

    // 재직 상태 필터
    if (options.status && options.status !== "all") {
      if (emp.status !== options.status) {
        return false;
      }
    }

    // 검색어 필터 (이름 또는 사번)
    if (trimmedKeyword) {
      const nameMatch = emp.name.toLowerCase().includes(trimmedKeyword);
      const codeMatch = (emp.employeeCode || "").toLowerCase().includes(trimmedKeyword);
      if (!nameMatch && !codeMatch) {
        return false;
      }
    }

    return true;
  });
}

export interface PendingImpactCalculationResult {
  ok: boolean;
  count: number;
  errorMessage?: string;
}

/** R08: 저장된 대기 실적 중 해당 시급 변경에 영향받는 고유 건수 계산 */
export function calculatePendingPerformanceImpact(
  entries: PerformanceEntryRecord[],
  employeeCode: string,
  effectiveFrom: string,
  effectiveTo?: string
): PendingImpactCalculationResult {
  if (!employeeCode || !effectiveFrom || !isValidDateString(effectiveFrom)) {
    return { ok: false, count: 0, errorMessage: "유효하지 않은 사번 또는 적용 시작일입니다." };
  }
  if (effectiveTo && (!isValidDateString(effectiveTo) || effectiveTo < effectiveFrom)) {
    return { ok: false, count: 0, errorMessage: "유효하지 않은 적용 종료일입니다." };
  }
  if (!Array.isArray(entries)) {
    return { ok: false, count: 0, errorMessage: "실적 데이터가 올바르지 않습니다." };
  }

  const uniqueKeys = new Set<string>();
  const logicalKeyMap = new Map<string, string>();
  for (const entry of entries) {
    if (!entry) return { ok: false, count: 0, errorMessage: "불완전한 실적 행이 포함되어 있습니다." };
    if (entry.status !== "pending" || !isPayablePerformanceEntry(entry)) continue;
    if (!isValidDateString(entry.workDate) || typeof entry.logicalKey !== "string" || !entry.logicalKey.trim()) {
      return { ok: false, count: 0, errorMessage: "근무일 또는 실적 식별값을 확인할 수 없습니다." };
    }
    const signature = JSON.stringify([entry.employeeCode, entry.workDate, entry.section, entry.workType, entry.hourlyRate]);
    const prior = logicalKeyMap.get(entry.logicalKey);
    if (prior !== undefined && prior !== signature) return { ok: false, count: 0, errorMessage: "같은 실적에 서로 다른 자료가 있습니다. 다시 확인해 주세요." };
    logicalKeyMap.set(entry.logicalKey, signature);
    if (entry.employeeCode === employeeCode && entry.workDate >= effectiveFrom && (!effectiveTo || entry.workDate <= effectiveTo)) uniqueKeys.add(entry.logicalKey);
  }

  return { ok: true, count: uniqueKeys.size };
}

/** R08: 대기 실적 파일 목록 변경 여부 검증 (전/후 집합 일치 비교) */
export function arePendingFileSetsEqual(filesA: string[], filesB: string[]): boolean {
  if (!Array.isArray(filesA) || !Array.isArray(filesB)) return false;
  if (filesA.length !== filesB.length) return false;
  const setA = new Set(filesA);
  if (setA.size !== filesA.length || new Set(filesB).size !== filesB.length || filesA.some(id => typeof id !== "string" || !id.trim())) return false;
  for (const id of filesB) {
    if (!setA.has(id)) return false;
  }
  return true;
}

/** HTML 속성(value="", title="" 등)에 안전하게 삽입하기 위한 이스케이프 */
export function escapeHtmlAttribute(value: string | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** R10: 시급 일괄 미리보기 stale 판정 */
export function isBulkPreviewStale(
  current: WorkforceWageBulkUpdatePreviewInput,
  previewed: WorkforceWageBulkUpdatePreviewInput | null
): boolean {
  if (!previewed) {
    return true;
  }
  return (
    current.filePath !== previewed.filePath ||
    current.effectiveFrom !== previewed.effectiveFrom ||
    current.mapping.siteNameColumn !== previewed.mapping.siteNameColumn ||
    current.mapping.employeeNameColumn !== previewed.mapping.employeeNameColumn ||
    current.mapping.hourlyRateColumn !== previewed.mapping.hourlyRateColumn
  );
}

/** R11: 인력 삭제 가능 여부 판정 (퇴사 상태이고 retireDate < today) */
export function canDeleteEmployee(
  employee: EmployeeRecord,
  todayStr: string
): { canDelete: boolean; reason?: string } {
  if (employee.status !== "retired") {
    return { canDelete: false, reason: "퇴사 처리된 인력만 삭제할 수 있습니다." };
  }
  if (!employee.retireDate || !isValidDateString(employee.retireDate)) {
    return { canDelete: false, reason: "퇴사일이 등록되어 있지 않아 삭제할 수 없습니다." };
  }
  if (employee.retireDate >= todayStr) {
    return { canDelete: false, reason: "퇴사일이 오늘 이후인 인력은 퇴사일 익일부터 삭제할 수 있습니다." };
  }
  return { canDelete: true };
}

/** 신규/수정 입력 유효성 검증 */
export interface EmployeeFormInputData {
  employeeCode: string;
  name: string;
  contact?: string;
  rank?: string;
  employmentType: string;
  status: "active" | "leave" | "retired";
  hireDate?: string;
  retireDate?: string;
  siteId?: string;
  shiftGroup?: string;
  hourlyRate?: number;
}

export function validateEmployeeFormInput(
  data: EmployeeFormInputData,
  todayStr: string,
  isEdit = false
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const isBp = isBpEmploymentType(data.employmentType);

  // 사원번호 검증: BP는 빈값 허용, 그 외는 필수
  const code = (data.employeeCode || "").trim();
  if (!isBp && !code) {
    errors.employeeCode = "사원번호를 입력해 주세요.";
  }

  // 이름 필수
  const name = (data.name || "").trim();
  if (!name) {
    errors.name = "이름을 입력해 주세요.";
  }

  // 직급: 선택된 경우 5개 중 하나여야 함
  if (data.rank && !isEmployeeRank(data.rank)) {
    errors.rank = `직급은 ${employeeRankOptions.join(", ")} 중 하나여야 합니다.`;
  }

  // 입사일 검증: 등록 시에는 필수
  if (!isEdit) {
    const hireRes = validateHireDate(data.hireDate || "", todayStr);
    if (!hireRes.valid) {
      errors.hireDate = hireRes.message || "입사일을 확인해 주세요.";
    }
  }

  // 시급 검증: BP는 시급 입력 불가, 정규/계약직에 입력된 경우 양수여야 함
  if (isBp && data.hourlyRate !== undefined && data.hourlyRate !== null && data.hourlyRate > 0) {
    errors.hourlyRate = "BP(외부인력)는 시급을 등록할 수 없습니다.";
  } else if (!isBp && data.hourlyRate !== undefined && data.hourlyRate !== null) {
    if (Number.isNaN(data.hourlyRate) || data.hourlyRate < 0) {
      errors.hourlyRate = "시급은 0원 이상이어야 합니다.";
    }
  }

  // 퇴사 상태인 경우 퇴사일 검증
  if (data.status === "retired") {
    if (!data.retireDate || !isValidDateString(data.retireDate)) {
      errors.retireDate = "퇴사일을 올바르게 입력해 주세요.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/** 시급 등록 입력 유효성 검증 */
export interface WageRateFormInputData {
  hourlyRate: number;
  effectiveFrom: string;
  reason?: string;
}

export function validateWageRateFormInput(
  data: WageRateFormInputData,
  todayStr: string,
  existingRates: WageRateRecord[] = []
): { valid: boolean; message?: string; isRetroactive?: boolean; isSameDayOverwrite?: boolean } {
  if (typeof data.hourlyRate !== "number" || Number.isNaN(data.hourlyRate) || data.hourlyRate <= 0) {
    return { valid: false, message: "시급 금액은 0보다 큰 양수여야 합니다." };
  }

  if (!data.effectiveFrom || !isValidDateString(data.effectiveFrom)) {
    return { valid: false, message: "적용 시작일을 올바른 날짜(YYYY-MM-DD)로 입력해 주세요." };
  }

  // 오늘 기준 소급 경고 여부
  const isRetroactive = data.effectiveFrom < todayStr;

  // 같은 시작일 기존행 존재 여부 (덮어쓰기 경고)
  const isSameDayOverwrite = existingRates.some((r) => r.effectiveFrom === data.effectiveFrom);

  return {
    valid: true,
    isRetroactive,
    isSameDayOverwrite
  };
}
