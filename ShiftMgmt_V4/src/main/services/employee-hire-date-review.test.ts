import { describe, expect, it, vi } from "vitest";
import { buildImportedEmployeeHireDateReview } from "./employee-hire-date-review";

describe("W11 imported hire date review", () => {
  it.each(["2024-02-29", "1980-01-01", "2026-01-01", "2099-12-31"])("keeps source date %s without treating it as a confirmed actual hire", hireDate => {
    const report = buildImportedEmployeeHireDateReview([{ id: "e", employee_code: "EMP", name: "직원", hire_date: hireDate }], "source-hash");
    expect(report.rows[0]).toMatchObject({ sourceHireDate: hireDate, classification: "source-date" });
    expect(report).toMatchObject({ policy: "preserve-source-no-fallback", sourceBackupSha256: "source-hash", sourceDateCount: 1 });
    expect(report.rows[0]).not.toHaveProperty("confirmedActualHireDate");
  });
  it.each([null, undefined, "", " ", "\t"])("reports missing value %j without substituting a wage, job or file date", hireDate => {
    const source = { id: "e", hire_date: hireDate, created_at: "2026-01-01", wage_start: "2025-03-01", assignment_start: "2024-04-01" };
    const report = buildImportedEmployeeHireDateReview([source], "source-hash");
    expect(report.rows[0]).toMatchObject({ classification: "missing" });
    expect(report.rows[0].sourceHireDate).toBe(hireDate);expect(source.hire_date).toBe(hireDate);
    expect(report.missingDateCount).toBe(1);
  });
  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-3-1", "2026/03/01", "not a date", " 2026-03-01 "])("keeps invalid source text %s for explicit review", hireDate => {
    const report = buildImportedEmployeeHireDateReview([{ id: "e", hire_date: hireDate }], "source-hash");
    expect(report.rows[0]).toMatchObject({ classification: "invalid", sourceHireDate: hireDate });expect(report.invalidDateCount).toBe(1);
  });
  it("includes archived employees, binds the file hash and leaves every original field unchanged", () => {
    const source = [{ id: "a", employee_code: "A", name: "원본", hire_date: "2026-01-01", retire_date: "2026-03-01" }, { id: "b", employee_code: "B", name: "보관", hire_date: null, deleted_at: "2026-04-01" }];
    const before = structuredClone(source);const report = buildImportedEmployeeHireDateReview(source, "locked-backup");
    expect(source).toEqual(before);expect(report).toMatchObject({ sourceBackupSha256: "locked-backup", totalEmployeeCount: 2, sourceDateCount: 1, missingDateCount: 1, invalidDateCount: 0 });expect(report.rows[1].archived).toBe(true);
  });
  it("does not turn an empty employee table into zero-date employee records", () => {
    expect(buildImportedEmployeeHireDateReview([], "empty-file")).toMatchObject({ totalEmployeeCount: 0, sourceDateCount: 0, missingDateCount: 0, invalidDateCount: 0, rows: [] });
  });
  it("is independent of the current clock", () => {
    const source = [{ id: "e", hire_date: null }], before = buildImportedEmployeeHireDateReview(source, "same");vi.useFakeTimers({ toFake: ["Date"] });
    try { vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));expect(buildImportedEmployeeHireDateReview(source, "same")).toEqual(before); } finally { vi.useRealTimers(); }
  });
});
