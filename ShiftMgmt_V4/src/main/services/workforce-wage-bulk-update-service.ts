import { existsSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  WorkforceWageBulkUpdateApplyInput,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview,
  WorkforceWageBulkUpdatePreviewInput,
  WorkforceWageBulkUpdatePreviewRow,
  WorkforceWageBulkUpdateRowStatus
} from "../../shared/bridge/contracts";
import { excelColumnLabelToIndex } from "../../shared/lib/excel-column";
import type { AuthSession } from "../../shared/domain/model";
import { saveStoredEmployeeWageRate } from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import { historyEmploymentSql } from "./employee-employment-service";
import { isManagedEmployeeEmployedOnDate } from "../../shared/domain/employee-employment";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface EmployeeLookupRow {
  id: string;
  employeeCode: string;
  name: string;
  status: string;
  retireDate?: string;
  currentSiteName?: string;
  currentHourlyRate?: number;
  currentEffectiveFrom?: string;
  employmentEligible?: boolean;
}

interface ImportedSpreadsheetRow {
  rowNumber: number;
  employeeCode: string;
  siteName: string;
  employeeName: string;
  hourlyRateText: string;
}

interface EmployeeLookup {
  byCode: Map<string, EmployeeLookupRow[]>;
  bySiteAndName: Map<string, EmployeeLookupRow[]>;
}

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xlsm"]);
const DATA_START_ROW = 2;

const statusLabelByCode: Record<WorkforceWageBulkUpdateRowStatus, string> = {
  ready: "적용 가능",
  applied: "적용 완료",
  "missing-required-value": "필수값 누락",
  "invalid-hourly-rate": "시급 형식 오류",
  "employee-not-found": "일치 인력 없음",
  "ambiguous-employee": "동일 인력 중복",
  "employee-retired": "퇴사자 제외",
  "same-rate": "기존 시급과 동일",
  "duplicate-entry": "중복 행 제외"
};

const normalizeText = (value: string | null | undefined) => value?.trim() ?? "";

const isDateInputValue = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const shiftDateValue = (value: string, offsetDays: number) => {
  if (!isDateInputValue(value)) {
    throw new Error("적용일 형식이 올바르지 않습니다.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

const parseImportedHourlyRate = (value: string) => {
  const normalizedValue = normalizeText(value).replace(/[,\s원]/g, "");

  if (!normalizedValue) {
    return null;
  }

  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const requireReadyDatabase = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database;
};

const readWorkbook = async (filePath: string) => {
  if (!existsSync(filePath)) {
    throw new Error("선택한 Excel 파일을 찾을 수 없습니다.");
  }

  if (!SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error("Excel 파일은 .xlsx 또는 .xlsm 형식만 지원합니다.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  if (workbook.worksheets.length === 0) {
    throw new Error("워크시트가 없는 Excel 파일입니다.");
  }

  return workbook;
};

// 비교 기준 시급은 "적용일 그 날에 유효한 시급"이다. 지난 날짜로 일괄 적용할 때도
// 그 시점 시급과 견줘야 '기존 시급과 동일'을 제대로 걸러낸다.
const listEmployeeLookupRows = (effectiveFrom: string) => {
  const database = requireReadyDatabase();

  return database.prepare(`
    SELECT
      employees.id,
      employees.employee_code,
      employees.name,
      employees.status,
      employees.retire_date,
      sites.name as current_site_name,
      CASE WHEN EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated') THEN NULL ELSE wage_rates.hourly_rate END as current_hourly_rate,
      CASE WHEN EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated') THEN NULL ELSE wage_rates.effective_from END as current_effective_from
    FROM employees
    LEFT JOIN employee_site_assignments as assignments
      ON assignments.id = (
        SELECT latest_assignments.id
        FROM employee_site_assignments as latest_assignments
        WHERE latest_assignments.employee_id = employees.id
          AND latest_assignments.status = 'active'
          AND ${historyEmploymentSql("latest_assignments", "@day")}
          AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employees.id AND em.event_type='rehired')
            OR (latest_assignments.start_date<=@day AND (latest_assignments.end_date IS NULL OR latest_assignments.end_date>@day)))
        ORDER BY latest_assignments.start_date DESC, latest_assignments.created_at DESC
        LIMIT 1
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT latest_wage_rates.id
        FROM wage_rates as latest_wage_rates
        WHERE latest_wage_rates.employee_id = employees.id
          AND latest_wage_rates.effective_from <= @day
          AND (
            latest_wage_rates.effective_to IS NULL
            OR latest_wage_rates.effective_to >= @day
          )
          AND ${historyEmploymentSql("latest_wage_rates", "@day")}
        ORDER BY latest_wage_rates.effective_from DESC, latest_wage_rates.created_at DESC, latest_wage_rates.rowid DESC
        LIMIT 1
      )
    ORDER BY employees.name ASC
  `).all({day:effectiveFrom}) as Array<Record<string, unknown>>;
};

const buildEmployeeLookup = (effectiveFrom: string) => {
  const employees = new Map(listStoredEmployees().map(employee => [employee.id, employee]));

  const lookup: EmployeeLookup = { byCode: new Map(), bySiteAndName: new Map() };

  listEmployeeLookupRows(effectiveFrom).forEach((row) => {
    const currentSiteName = normalizeText(
      row.current_site_name ? String(row.current_site_name) : undefined
    );
    const employeeName = normalizeText(String(row.name));

    const employee: EmployeeLookupRow = {
      id: String(row.id),
      employeeCode: String(row.employee_code),
      name: employeeName,
      status: String(row.status),
      employmentEligible: employees.get(String(row.id))?.employmentPeriods ? isManagedEmployeeEmployedOnDate(employees.get(String(row.id))!, effectiveFrom) && !(employees.get(String(row.id))!.scheduledRehire && effectiveFrom>=employees.get(String(row.id))!.scheduledRehire!.startDate) : undefined,
      retireDate: row.retire_date ? String(row.retire_date) : undefined,
      currentSiteName,
      currentHourlyRate:
        row.current_hourly_rate !== null && row.current_hourly_rate !== undefined
          ? Number(row.current_hourly_rate)
          : undefined,
      currentEffectiveFrom: row.current_effective_from
        ? String(row.current_effective_from)
        : undefined
    };
    const codeRows = lookup.byCode.get(employee.employeeCode) ?? [];
    codeRows.push(employee);
    lookup.byCode.set(employee.employeeCode, codeRows);

    if (currentSiteName && employeeName) {
      const key = `${currentSiteName}::${employeeName}`.toLowerCase();
      const nameRows = lookup.bySiteAndName.get(key) ?? [];
      nameRows.push(employee);
      lookup.bySiteAndName.set(key, nameRows);
    }
  });

  return lookup;
};

const extractImportedRows = async (
  input: WorkforceWageBulkUpdatePreviewInput
): Promise<{ fileName: string; filePath: string; sheetName: string; rows: ImportedSpreadsheetRow[] }> => {
  if (!isDateInputValue(input.effectiveFrom)) {
    throw new Error("적용일은 YYYY-MM-DD 형식이어야 합니다.");
  }

  const workbook = await readWorkbook(input.filePath);
  const worksheet = workbook.worksheets[0]!;
  const siteNameColumnIndex = excelColumnLabelToIndex(input.mapping.siteNameColumn);
  const employeeNameColumnIndex = excelColumnLabelToIndex(input.mapping.employeeNameColumn);
  const hourlyRateColumnIndex = excelColumnLabelToIndex(input.mapping.hourlyRateColumn);
  const codeColumn = normalizeText(input.mapping.employeeCodeColumn);
  const employeeCodeColumnIndex = codeColumn ? excelColumnLabelToIndex(codeColumn) : undefined;
  const rows: ImportedSpreadsheetRow[] = [];

  for (let rowNumber = DATA_START_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const siteName = normalizeText(worksheet.getCell(rowNumber, siteNameColumnIndex).text);
    const employeeName = normalizeText(worksheet.getCell(rowNumber, employeeNameColumnIndex).text);
    const hourlyRateText = normalizeText(worksheet.getCell(rowNumber, hourlyRateColumnIndex).text);
    const employeeCode = employeeCodeColumnIndex
      ? normalizeText(worksheet.getCell(rowNumber, employeeCodeColumnIndex).text)
      : "";

    if (!employeeCode && !siteName && !employeeName && !hourlyRateText) {
      continue;
    }

    rows.push({
      rowNumber,
      employeeCode,
      siteName,
      employeeName,
      hourlyRateText
    });
  }

  return {
    fileName: path.basename(input.filePath),
    filePath: input.filePath,
    sheetName: worksheet.name,
    rows
  };
};

const createPreviewRow = (
  input: WorkforceWageBulkUpdatePreviewInput,
  row: ImportedSpreadsheetRow,
  employeeLookup: EmployeeLookup
): WorkforceWageBulkUpdatePreviewRow => {
  const importedHourlyRate = parseImportedHourlyRate(row.hourlyRateText) ?? undefined;
  const usesCode = Boolean(normalizeText(input.mapping.employeeCodeColumn));
  const base = {
    rowNumber: row.rowNumber,
    siteName: row.siteName,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode || undefined,
    importedHourlyRate,
    effectiveFrom: input.effectiveFrom
  };

  if (!row.hourlyRateText || (usesCode ? !row.employeeCode : !row.siteName || !row.employeeName)) {
    return {
      ...base,
      status: "missing-required-value",
      statusLabel: statusLabelByCode["missing-required-value"],
      note: usesCode ? "사번과 시급 값이 모두 필요합니다." : "근무지명, 이름, 시급 값이 모두 필요합니다."
    };
  }

  if (typeof importedHourlyRate !== "number") {
    return {
      ...base,
      status: "invalid-hourly-rate",
      statusLabel: statusLabelByCode["invalid-hourly-rate"],
      note: "시급은 숫자 또는 쉼표가 포함된 숫자만 지원합니다."
    };
  }

  // 지정한 사번이 없거나 틀렸을 때 다른 사람의 이름으로 대체하지 않는다.
  const candidates = usesCode
    ? employeeLookup.byCode.get(row.employeeCode) ?? []
    : employeeLookup.bySiteAndName.get(`${row.siteName}::${row.employeeName}`.toLowerCase()) ?? [];

  if (candidates.length === 0) {
    return {
      ...base,
      status: "employee-not-found",
      statusLabel: statusLabelByCode["employee-not-found"],
      note: usesCode
        ? "입력한 사번과 일치하는 인력을 찾지 못했습니다. 사번을 확인해 주세요."
        : "현재 배정된 인력 목록에서 동일한 근무지명과 이름을 찾지 못했습니다."
    };
  }

  // 기존 퇴사 판정은 유지하되 동명이인 판정 전에 적용한다.
  const eligible = candidates.filter((employee) =>
    employee.employmentEligible ?? (employee.status !== "retired" && !(employee.retireDate && employee.retireDate < input.effectiveFrom))
  );
  if (eligible.length === 0) {
    const employee = candidates.length === 1 ? candidates[0] : undefined;
    return {
      ...base,
      employeeId: employee?.id,
      employeeCode: employee?.employeeCode ?? base.employeeCode,
      currentHourlyRate: employee?.currentHourlyRate,
      currentEffectiveFrom: employee?.currentEffectiveFrom,
      previousEffectiveTo: shiftDateValue(input.effectiveFrom, -1),
      status: "employee-retired",
      statusLabel: employee?.employmentEligible===false ? "재직기간·예약 확인" : statusLabelByCode["employee-retired"],
      note: employee?.employmentEligible === false ? "적용일이 재직기간 밖입니다. 재입사 예약 전 공백·취소한 예약에는 시급을 적용할 수 없습니다. 예약의 새 시급은 인력 상세의 예약 변경에서 확인해 주세요." : "적용일 기준 퇴사 처리된 인력입니다."
    };
  }

  if (eligible.length > 1) {
    return {
      ...base,
      status: "ambiguous-employee",
      statusLabel: statusLabelByCode["ambiguous-employee"],
      note: "같은 근무지와 이름으로 여러 재직 인력이 조회됩니다. 사번 열을 지정해 확인해 주세요."
    };
  }

  const employee = eligible[0]!;
  const matched = {
    ...base,
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    currentHourlyRate: employee.currentHourlyRate,
    currentEffectiveFrom: employee.currentEffectiveFrom,
    previousEffectiveTo: shiftDateValue(input.effectiveFrom, -1)
  };
  if (employee.currentHourlyRate === importedHourlyRate) {
    return {
      ...matched,
      status: "same-rate",
      statusLabel: statusLabelByCode["same-rate"],
      note: "현재 활성 시급과 동일하여 변경하지 않습니다."
    };
  }
  return {
    ...matched,
    status: "ready",
    statusLabel: statusLabelByCode.ready,
    note: "미리보기 검증을 통과했습니다."
  };
};

const deduplicatePreviewRows = (rows: WorkforceWageBulkUpdatePreviewRow[]) => {
  const usedEmployeeIds = new Set<string>();

  return rows.map((row) => {
    if (row.status !== "ready" || !row.employeeId) {
      return row;
    }

    if (!usedEmployeeIds.has(row.employeeId)) {
      usedEmployeeIds.add(row.employeeId);
      return row;
    }

    return {
      ...row,
      status: "duplicate-entry",
      statusLabel: statusLabelByCode["duplicate-entry"],
      note: "같은 인력이 파일에 중복으로 포함되어 첫 번째 행만 사용합니다."
    } satisfies WorkforceWageBulkUpdatePreviewRow;
  });
};

const evaluatePreview = async (input: WorkforceWageBulkUpdatePreviewInput) => {
  const extracted = await extractImportedRows(input);
  const employeeLookup = buildEmployeeLookup(input.effectiveFrom);
  const previewRows = deduplicatePreviewRows(
    extracted.rows.map((row) => createPreviewRow(input, row, employeeLookup))
  );

  return {
    fileName: extracted.fileName,
    filePath: extracted.filePath,
    sheetName: extracted.sheetName,
    effectiveFrom: input.effectiveFrom,
    totalRows: previewRows.length,
    readyCount: previewRows.filter((row) => row.status === "ready").length,
    skippedCount: previewRows.filter((row) => row.status !== "ready").length,
    rows: previewRows
  } satisfies WorkforceWageBulkUpdatePreview;
};

const isReadyPreviewRow = (
  row: WorkforceWageBulkUpdatePreviewRow
): row is WorkforceWageBulkUpdatePreviewRow &
  Required<Pick<WorkforceWageBulkUpdatePreviewRow, "employeeId" | "importedHourlyRate">> =>
  row.status === "ready" &&
  typeof row.employeeId === "string" &&
  typeof row.importedHourlyRate === "number";

export const previewWorkforceWageBulkUpdate = async (
  input: WorkforceWageBulkUpdatePreviewInput
) => evaluatePreview(input);

export const applyWorkforceWageBulkUpdate = async (
  input: WorkforceWageBulkUpdateApplyInput,
  actor?: Pick<AuthSession, "userId" | "loginId" | "displayName" | "role">
) => {
  const database = requireReadyDatabase();
  const preview = await evaluatePreview(input);
  const readyRows = preview.rows.filter(isReadyPreviewRow);

  if (readyRows.length > 0) {
    // 단건 시급 저장과 같은 규칙을 쓴다: 지난 날짜도 넣을 수 있고, 앞뒤 기간이 겹치지 않게
    // 정리되며, 같은 적용일이 이미 있으면 그 줄을 고쳐 쓴다.
    try {
      database.exec("BEGIN");

      readyRows.forEach((row) => {
        saveStoredEmployeeWageRate({
          employeeId: row.employeeId,
          hourlyRate: row.importedHourlyRate,
          effectiveFrom: input.effectiveFrom,
          reason: `엑셀 일괄 시급 업데이트 (${preview.fileName})`
        }, actor);
      });

      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    fileName: preview.fileName,
    filePath: preview.filePath,
    sheetName: preview.sheetName,
    effectiveFrom: preview.effectiveFrom,
    totalRows: preview.totalRows,
    appliedCount: readyRows.length,
    skippedCount: preview.rows.length - readyRows.length,
    rows: preview.rows.map((row) =>
      row.status === "ready"
        ? {
            ...row,
            status: "applied",
            statusLabel: statusLabelByCode.applied,
            note: "시급 변경 이력에 반영되었습니다."
          }
        : row
    )
  } satisfies WorkforceWageBulkUpdateApplySummary;
};
