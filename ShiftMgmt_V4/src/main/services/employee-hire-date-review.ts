import type { ImportedEmployeeHireDateReview, ImportedEmployeeHireDateRow } from "../../shared/bridge/contracts";

/** A calendar date is only a source value, never evidence of actual hire or its legacy fallback branch. */
export const buildImportedEmployeeHireDateReview = (
  employees: readonly Record<string, unknown>[],
  sourceBackupSha256: string
): ImportedEmployeeHireDateReview => {
  const rows: ImportedEmployeeHireDateRow[] = employees.map(employee => {
    const value = employee.hire_date;
    const missing = value == null || typeof value === "string" && value.trim() === "";
    const calendarDate = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
    return {
      employeeId: String(employee.id ?? ""),
      employeeCode: String(employee.employee_code ?? ""),
      employeeName: String(employee.name ?? ""),
      archived: Boolean(employee.deleted_at),
      ...(value === undefined ? {} : { sourceHireDate: value === null ? null : String(value) }),
      classification: missing ? "missing" : calendarDate ? "source-date" : "invalid"
    };
  });
  return {
    policy: "preserve-source-no-fallback",
    sourceBackupSha256,
    totalEmployeeCount: rows.length,
    sourceDateCount: rows.filter(row => row.classification === "source-date").length,
    missingDateCount: rows.filter(row => row.classification === "missing").length,
    invalidDateCount: rows.filter(row => row.classification === "invalid").length,
    rows
  };
};
