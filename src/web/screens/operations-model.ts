// 운영 관리 화면 순수 모델 및 비즈니스 검증 함수
import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput
} from "../../shared/bridge/contracts";
import type {
  HolidayItem,
  SiteNameOptionRecord
} from "../../shared/domain/model";
import type {
  DocumentLayoutKey,
  DocumentKind
} from "../../shared/domain/document-layout";
import {
  allowanceRateCategoryOrder,
  allowanceRateAxisOrder,
  getAllowanceRateEntryCode,
  type AllowanceRateMatrix
} from "../../shared/domain/allowance-rate-matrix";

// --- 1. 날짜 및 시간 유효성 검사 ---

export function isValidDateFormat(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function isValidTimeFormat(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// --- 2. 설정 검증 (R03) ---

export interface SettingsValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateAppSettings(
  input: Partial<AppSettingsUpdateInput>
): SettingsValidationResult {
  const errors: Record<string, string> = {};

  if (!input.pendingDir || !input.pendingDir.trim()) {
    errors.pendingDir = "대기 폴더 경로를 입력하세요.";
  }
  if (!input.approvedDir || !input.approvedDir.trim()) {
    errors.approvedDir = "승인 폴더 경로를 입력하세요.";
  }
  if (!input.scheduleExportDir || !input.scheduleExportDir.trim()) {
    errors.scheduleExportDir = "근무표 내보내기 폴더 경로를 입력하세요.";
  }
  if (!input.allowanceProposalExportDir || !input.allowanceProposalExportDir.trim()) {
    errors.allowanceProposalExportDir = "수당 품의서 폴더 경로를 입력하세요.";
  }
  if (!input.allowanceAttachment1ExportDir || !input.allowanceAttachment1ExportDir.trim()) {
    errors.allowanceAttachment1ExportDir = "수당 별첨1 폴더 경로를 입력하세요.";
  }
  if (!input.allowanceAttachment2ExportDir || !input.allowanceAttachment2ExportDir.trim()) {
    errors.allowanceAttachment2ExportDir = "수당 별첨2 폴더 경로를 입력하세요.";
  }
  if (!input.databaseBackupDir || !input.databaseBackupDir.trim()) {
    errors.databaseBackupDir = "백업 폴더 경로를 입력하세요.";
  }

  if (input.databaseBackupTime && !isValidTimeFormat(input.databaseBackupTime)) {
    errors.databaseBackupTime = "백업 시각은 HH:mm 형식(00:00~23:59)이어야 합니다.";
  }

  if (
    input.scheduleConsecutiveNightLimit !== undefined &&
    (!Number.isFinite(input.scheduleConsecutiveNightLimit) ||
      input.scheduleConsecutiveNightLimit < 0)
  ) {
    errors.scheduleConsecutiveNightLimit = "연속 야간 근무 제한은 0 이상의 정수여야 합니다.";
  }

  if (
    input.scheduleMinimumRestMinutes !== undefined &&
    (!Number.isFinite(input.scheduleMinimumRestMinutes) ||
      input.scheduleMinimumRestMinutes < 0)
  ) {
    errors.scheduleMinimumRestMinutes = "최소 휴식 시간은 0 이상의 정수(분 단위)여야 합니다.";
  }

  if (
    input.scheduleWeeklyMaxMinutes !== undefined &&
    (!Number.isFinite(input.scheduleWeeklyMaxMinutes) ||
      input.scheduleWeeklyMaxMinutes < 0)
  ) {
    errors.scheduleWeeklyMaxMinutes = "주당 최대 근무 시간은 0 이상의 정수(분 단위)여야 합니다.";
  }

  if (
    input.substituteAllowancePolicyEffectiveFrom &&
    input.substituteAllowancePolicyEffectiveFrom.trim() !== "" &&
    !isValidDateFormat(input.substituteAllowancePolicyEffectiveFrom)
  ) {
    errors.substituteAllowancePolicyEffectiveFrom = "날짜 형식은 YYYY-MM-DD여야 합니다.";
  }

  if (
    input.changedSlotPriorityEffectiveFrom &&
    input.changedSlotPriorityEffectiveFrom.trim() !== "" &&
    !isValidDateFormat(input.changedSlotPriorityEffectiveFrom)
  ) {
    errors.changedSlotPriorityEffectiveFrom = "날짜 형식은 YYYY-MM-DD여야 합니다.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function buildCompleteSettingsInput(
  current: AppSettingsSnapshot,
  updated: Partial<AppSettingsUpdateInput>
): AppSettingsUpdateInput {
  return {
    holidayApiBaseUrl: updated.holidayApiBaseUrl ?? current.holidayApiBaseUrl,
    pendingDir: updated.pendingDir ?? current.pendingDir,
    approvedDir: updated.approvedDir ?? current.approvedDir,
    scheduleExportDir: updated.scheduleExportDir ?? current.scheduleExportDir,
    allowanceProposalExportDir:
      updated.allowanceProposalExportDir ?? current.allowanceProposalExportDir,
    allowanceAttachment1ExportDir:
      updated.allowanceAttachment1ExportDir ?? current.allowanceAttachment1ExportDir,
    allowanceAttachment2ExportDir:
      updated.allowanceAttachment2ExportDir ?? current.allowanceAttachment2ExportDir,
    databaseBackupDir: updated.databaseBackupDir ?? current.databaseBackupDir,
    databaseBackupSchedule:
      updated.databaseBackupSchedule ?? current.databaseBackupSchedule,
    databaseBackupTime: updated.databaseBackupTime ?? current.databaseBackupTime,
    migrationFilePath: updated.migrationFilePath ?? current.migrationFilePath,
    scheduleConsecutiveNightLimit:
      updated.scheduleConsecutiveNightLimit ?? current.scheduleConsecutiveNightLimit,
    scheduleMinimumRestMinutes:
      updated.scheduleMinimumRestMinutes ?? current.scheduleMinimumRestMinutes,
    scheduleRequireWeeklyHoliday:
      updated.scheduleRequireWeeklyHoliday ?? current.scheduleRequireWeeklyHoliday,
    scheduleWeeklyMaxMinutes:
      updated.scheduleWeeklyMaxMinutes ?? current.scheduleWeeklyMaxMinutes,
    substituteAllowancePolicyEffectiveFrom:
      updated.substituteAllowancePolicyEffectiveFrom ??
      current.substituteAllowancePolicyEffectiveFrom ??
      "",
    changedSlotPriorityEffectiveFrom:
      updated.changedSlotPriorityEffectiveFrom ??
      current.changedSlotPriorityEffectiveFrom ??
      ""
  };
}

// --- 3. 공휴일 모델 (R05) ---

export interface HolidayValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateHolidayItem(
  date: string,
  name: string,
  targetYear: number,
  existingHolidays: HolidayItem[],
  currentId?: string
): HolidayValidationResult {
  if (!isValidDateFormat(date)) {
    return { isValid: false, error: "유효한 날짜 형식(YYYY-MM-DD)이 아닙니다." };
  }
  const year = parseInt(date.slice(0, 4), 10);
  if (year !== targetYear) {
    return {
      isValid: false,
      error: `선택한 연도(${targetYear}년)와 일치하지 않습니다.`
    };
  }
  if (!name || !name.trim()) {
    return { isValid: false, error: "공휴일 이름을 입력하세요." };
  }
  const duplicate = existingHolidays.find(
    (h) => h.holidayDate === date && (!currentId || h.id !== currentId)
  );
  if (duplicate) {
    return { isValid: false, error: `이미 등록된 공휴일 날짜입니다 (${date}: ${duplicate.name}).` };
  }
  return { isValid: true };
}

export function sortHolidays(holidays: HolidayItem[]): HolidayItem[] {
  return [...holidays].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
}

// --- 4. 요율 5x3 매트릭스 모델 (R06) ---

export interface MatrixCellValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export function validateRateMatrix(matrix: AllowanceRateMatrix): MatrixCellValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  for (const cat of allowanceRateCategoryOrder) {
    for (const axis of allowanceRateAxisOrder) {
      const code = getAllowanceRateEntryCode(cat, axis);
      const val = matrix[cat]?.[axis];
      if (val === undefined || val === null || !Number.isFinite(val)) {
        errors[code] = "배율은 유한한 숫자여야 합니다.";
      } else if (val < 0) {
        errors[code] = "배율은 음수가 될 수 없습니다.";
      } else if (val === 0) {
        warnings[code] = "0 배율이 설정되었습니다 (수당 지급액이 0원이 됩니다).";
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}

export function matrixToRateItems(
  matrix: AllowanceRateMatrix
): Array<{ allowanceCode: string; multiplier: number }> {
  const items: Array<{ allowanceCode: string; multiplier: number }> = [];
  for (const cat of allowanceRateCategoryOrder) {
    for (const axis of allowanceRateAxisOrder) {
      items.push({
        allowanceCode: getAllowanceRateEntryCode(cat, axis),
        multiplier: matrix[cat][axis]
      });
    }
  }
  return items;
}

// --- 5. 사용자 검증 (R07) ---

export interface UserValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateOperationUser(input: {
  loginId: string;
  displayName: string;
  role: string;
  status: string;
  password?: string;
  isNew: boolean;
}): UserValidationResult {
  const errors: Record<string, string> = {};

  if (!input.loginId || !input.loginId.trim()) {
    errors.loginId = "계정 ID를 입력하세요.";
  } else if (!/^[a-zA-Z0-9_-]{3,30}$/.test(input.loginId.trim())) {
    errors.loginId = "계정 ID는 3~30자의 영문, 숫자, _, - 만 사용 가능합니다.";
  }

  if (!input.displayName || !input.displayName.trim()) {
    errors.displayName = "사용자 이름을 입력하세요.";
  }

  if (!["admin", "planner", "reviewer", "operator"].includes(input.role)) {
    errors.role = "유효한 역할을 선택하세요.";
  }

  if (!["active", "suspended", "retired"].includes(input.status)) {
    errors.status = "유효한 상태를 선택하세요.";
  }

  if (input.isNew) {
    if (!input.password || input.password.length < 8) {
      errors.password = "비밀번호는 최소 8자 이상이어야 합니다.";
    }
  } else if (input.password && input.password.length > 0 && input.password.length < 8) {
    errors.password = "변경할 비밀번호는 최소 8자 이상이어야 합니다.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

// --- 6. 근무지 이름 검증 (R08) ---

export function validateSiteNameOption(
  name: string,
  existingList: SiteNameOptionRecord[],
  currentId?: string
): { isValid: boolean; error?: string } {
  const trimmed = name ? name.trim() : "";
  if (!trimmed) {
    return { isValid: false, error: "근무지 이름을 입력하세요." };
  }
  const duplicate = existingList.find(
    (item) => item.name.trim().toLowerCase() === trimmed.toLowerCase() &&
              (!currentId || item.id !== currentId)
  );
  if (duplicate) {
    return { isValid: false, error: `이미 존재하는 근무지 이름입니다: "${trimmed}"` };
  }
  return { isValid: true };
}

// --- 7. 레이아웃 파일명 토큰 및 경로 검증 (R10, R13) ---

export interface LayoutFilenameValidationResult {
  isValid: boolean;
  error?: string;
}

const ALLOWED_TOKENS_BY_KIND: Record<string, string[]> = {
  "schedule-xlsx": ["{year}", "{monthNumber}", "{month2}", "{siteName}"],
  "proposal-xlsx": ["{year}", "{month2}"],
  "attachment1-xlsx": ["{year}", "{month2}"],
  "attachment2-xlsx": ["{year}", "{month2}"],
  "proposal-pdf": ["{year}", "{month2}"],
  "dashboard-report-pdf": ["{name}", "{timestamp}"]
};

export function validateLayoutOutputFilename(
  pattern: string,
  documentKind: string
): LayoutFilenameValidationResult {
  if (!pattern || !pattern.trim()) {
    return { isValid: false, error: "출력 파일명 패턴을 입력하세요." };
  }

  const trimmed = pattern.trim();

  // 금지 문자 및 안전 경로 검증
  // 역슬래시, 절대경로(C: 또는 /로 시작), 상위폴더(..) 금지
  if (trimmed.includes("\\")) {
    return { isValid: false, error: "파일명에 역슬래시(\\)는 사용할 수 없습니다. 하위폴더 구분은 슬래시(/)를 사용하세요." };
  }
  if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
    return { isValid: false, error: "절대 경로는 허용되지 않습니다." };
  }
  if (trimmed.includes("..")) {
    return { isValid: false, error: "상위 디렉터리 경로(..)는 허용되지 않습니다." };
  }
  if (/[*?"<>|]/.test(trimmed)) {
    return { isValid: false, error: "파일명에 특수문자(* ? \" < > |)는 사용할 수 없습니다." };
  }

  // 확장자 확인
  const expectedExt = documentKind.endsWith("-pdf") ? ".pdf" : ".xlsx";
  if (!trimmed.toLowerCase().endsWith(expectedExt)) {
    return { isValid: false, error: `파일명 확장자는 ${expectedExt}이어야 합니다.` };
  }

  // 허용된 토큰 검증
  const allowedTokens = ALLOWED_TOKENS_BY_KIND[documentKind] || [];
  const tokenRegex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(trimmed)) !== null) {
    const token = match[0];
    if (!allowedTokens.includes(token)) {
      return {
        isValid: false,
        error: `허용되지 않은 토큰 '${token}'입니다. (허용 목록: ${allowedTokens.join(", ")})`
      };
    }
  }

  return { isValid: true };
}

// --- 8. 레이아웃 키 헬퍼 ---

export function layoutKeyToString(key: DocumentLayoutKey): string {
  if (key.documentKind === "schedule-xlsx") {
    return `schedule-xlsx/${key.variant}`;
  }
  return key.documentKind;
}

export function stringToLayoutKey(str: string): DocumentLayoutKey {
  if (str === "schedule-xlsx/template1") {
    return { documentKind: "schedule-xlsx", variant: "template1" };
  }
  if (str === "schedule-xlsx/template2") {
    return { documentKind: "schedule-xlsx", variant: "template2" };
  }
  return { documentKind: str as Exclude<DocumentKind, "schedule-xlsx"> };
}
