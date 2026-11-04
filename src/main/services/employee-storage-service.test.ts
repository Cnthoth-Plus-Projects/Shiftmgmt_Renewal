import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveStoredEmployeeWageRate, closeStoredEmployeeWageRate, listStoredEmployeeWageRates, saveStoredEmployeeAssignment, closeStoredEmployeeAssignment } from "./employee-history-service";
import { listStoredEmployeeAssignments } from "./employee-history-service";
import { listStoredShiftPatterns, saveStoredShiftPattern } from "./shift-pattern-storage-service";
import { prepareRosterEmployees } from "../../web/screens/schedule-model";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { prepareReturnedScheduleFixture, syncPreparedReturnedSchedule, testAdminSession } from "./performance-test-helpers";

import { deleteStoredSite, listStoredSites } from "./site-storage-service";
import {
  getSqliteDatabase,
  closeSqliteStorage,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import {
  deleteStoredEmployee,
  listStoredEmployees,
  listStoredEmployeesForSiteMonth,
  resetEmployeeStorageForTest,
  saveStoredEmployee
} from "./employee-storage-service";

describe("employee-storage-service", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should seed and list default employees", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const employees = listStoredEmployees();
    const kim = employees.find((employee) => employee.employeeCode === "EMP-001");

    expect(employees.length).toBeGreaterThanOrEqual(3);
    expect(employees.some((employee) => employee.name === "김현우")).toBe(true);
    expect(kim?.currentSiteName).toBe("보라매DC");
    expect(kim?.currentShiftGroup).toBe("A조");
    expect(kim?.currentAssignmentStartDate).toBe("2023-03-01");
    expect(kim?.currentHourlyRate).toBe(12800);
    expect(kim?.rank).toBe("사원");
  });

  it("should insert a new employee record with assignment and wage rate", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");
    expect(targetSite).toBeDefined();

    const saved = saveStoredEmployee({
      employeeCode: "EMP-100",
      name: "최민아",
      contact: "010-5555-1000",
      rank: "대리",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite?.id,
      shiftGroup: "A",
      hourlyRate: 15600
    });

    expect(saved.employeeCode).toBe("EMP-100");
    expect(saved.contact).toBe("010-5555-1000");
    expect(saved.rank).toBe("대리");
    expect(saved.employmentType).toBe("정규");
    expect(saved.currentSiteName).toBe("동탄센터");
    expect(saved.currentShiftGroup).toBe("A조");
    expect(saved.currentAssignmentStartDate).toBe("2026-03-01");
    expect(saved.currentHourlyRate).toBe(15600);
    expect(listStoredEmployees().some((employee) => employee.employeeCode === "EMP-100")).toBe(true);
  });

  it("should keep a newly created employee unassigned when no site is selected", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const saved = saveStoredEmployee({
      employeeCode: "EMP-101",
      name: "무배정 직원",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-04-01",
      hourlyRate: 14000
    });

    expect(saved.currentSiteId).toBeUndefined();
    expect(saved.currentSiteName).toBeUndefined();
    expect(saved.currentShiftGroup).toBeUndefined();
    expect(saved.currentAssignmentStartDate).toBeUndefined();
  });

  it("should keep a newly created employee unassigned when only the site is selected", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(targetSite).toBeDefined();

    const saved = saveStoredEmployee({
      employeeCode: "EMP-102",
      name: "근무조 미지정 직원",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-04-01",
      siteId: targetSite?.id,
      hourlyRate: 15000
    });

    expect(saved.currentSiteId).toBeUndefined();
    expect(saved.currentSiteName).toBeUndefined();
    expect(saved.currentShiftGroup).toBeUndefined();
    expect(saved.currentAssignmentStartDate).toBeUndefined();
  });

  it("should generate an internal employee code for BP workers without creating a wage rate", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(targetSite).toBeDefined();

    const saved = saveStoredEmployee({
      employeeCode: "",
      name: "외부 협력사",
      employmentType: "BP",
      status: "active",
      hireDate: "2026-04-01",
      siteId: targetSite?.id,
      shiftGroup: "A조"
    });
    const database = getSqliteDatabase()!;
    const wageRateCount = database
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM wage_rates
          WHERE employee_id = ?
        `
      )
      .get(saved.id) as { count: number };

    expect(saved.employeeCode).toMatch(/^BP-\d{4}$/);
    expect(saved.employmentType).toBe("BP");
    expect(saved.currentSiteName).toBe("동탄센터");
    expect(saved.currentShiftGroup).toBe("A조");
    expect(saved.currentHourlyRate).toBeUndefined();
    expect(wageRateCount.count).toBe(0);
  });

  it("should reject duplicate employee codes", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    expect(() =>
      saveStoredEmployee({
        employeeCode: "EMP-001",
        name: "중복 직원",
        employmentType: "정규직",
        status: "active",
        hireDate: "2026-04-01"
      })
    ).toThrow("이미 사용 중인 사원번호입니다.");
  });

  it("should list only the latest active assignment for each employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const database = getSqliteDatabase()!;
    const employee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");
    const site = listStoredSites().find((item) => item.name === "동탄센터");

    expect(employee).toBeDefined();
    expect(site).toBeDefined();

    database.prepare(`
      INSERT INTO employee_site_assignments (
        id,
        employee_id,
        site_id,
        team_name,
        shift_group,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      employee!.id,
      site!.id,
      "B조",
      "B조",
      "2026-04-01",
      null,
      "active",
      "2026-04-01T00:00:00.000Z"
    );

    const records = listStoredEmployees().filter((item) => item.employeeCode === "EMP-001");

    expect(records).toHaveLength(1);
    expect(records[0]?.currentSiteName).toBe("동탄센터");
    expect(records[0]?.currentShiftGroup).toBe("B조");
    expect(records[0]?.currentAssignmentStartDate).toBe("2026-04-01");
  });

  it("should filter employees by keyword and status", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const employees = listStoredEmployees({
      keyword: "김",
      status: "active"
    });

    expect(employees).toHaveLength(1);
    expect(employees[0]?.name).toBe("김현우");
  });

  it("should search employees by contact and rank and normalize legacy dispatched employment types to contract", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const saved = saveStoredEmployee({
      employeeCode: "EMP-103",
      name: "연락처 검색 직원",
      contact: "010-9999-1234",
      rank: "차장",
      employmentType: "파견직",
      status: "active",
      hireDate: "2026-04-01",
      hourlyRate: 15000
    });

    const searched = listStoredEmployees({ keyword: "9999" });
    const rankSearched = listStoredEmployees({ keyword: "차장" });

    expect(saved.employmentType).toBe("계약");
    expect(searched.map((employee) => employee.employeeCode)).toContain("EMP-103");
    expect(rankSearched.map((employee) => employee.employeeCode)).toContain("EMP-103");
  });

  it("should preserve employee current site name after the site is removed from visible lists", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const targetSite = listStoredSites().find((site) => site.name === "보라매DC");

    expect(targetSite).toBeDefined();

    deleteStoredSite(targetSite!.id);

    const kim = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-001");

    expect(kim?.currentSiteName).toBe("보라매DC");
    expect(kim?.currentSiteDeletedAt).toBeDefined();
    expect(listStoredSites().some((site) => site.id === targetSite!.id)).toBe(false);
  });

  it("should archive a retired employee after the retirement date without deleting history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const retiredEmployee = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-023");

    expect(retiredEmployee).toBeDefined();

    const deleted = deleteStoredEmployee(retiredEmployee!.id);

    expect(deleted.employeeCode).toBe("EMP-023");
    expect(listStoredEmployees().some((employee) => employee.id === retiredEmployee!.id)).toBe(false);
    expect(
      listStoredEmployees({ includeDeleted: true }).find(
        (employee) => employee.id === retiredEmployee!.id
      )?.deletedAt
    ).toBeDefined();

    const database = getSqliteDatabase()!;
    const assignmentCount = database
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM employee_site_assignments
          WHERE employee_id = ?
        `
      )
      .get(retiredEmployee!.id) as { count: number };
    const wageRateCount = database
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM wage_rates
          WHERE employee_id = ?
        `
      )
      .get(retiredEmployee!.id) as { count: number };

    expect(assignmentCount.count).toBeGreaterThan(0);
    expect(wageRateCount.count).toBeGreaterThan(0);
  });

  it("should reject deleting employees who are not fully retired yet", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const activeEmployee = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-001");

    expect(activeEmployee).toBeDefined();
    expect(() => deleteStoredEmployee(activeEmployee!.id)).toThrow(
      "퇴사 처리된 인력만 삭제할 수 있습니다."
    );
  });
  it("persists employee email, preserves omitted values for old callers and explicitly clears empty email", () => {
    initializeSqliteStorage({ dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite") });
    const saved = saveStoredEmployee({ employeeCode: "EMAIL-01", name: "이메일 검증", employmentType: "정규", status: "active", hireDate: "2026-01-01", email: "  person@example.invalid  ", contact: "010-0000-1000" });
    expect(saved.email).toBe("person@example.invalid");
    const edited = saveStoredEmployee({ ...saved, contact: "010-0000-2000", email: undefined });
    expect(edited.email).toBe("person@example.invalid");
    expect(listStoredEmployees().find(e => e.id === saved.id)?.contact).toBe("010-0000-2000");
    expect(() => saveStoredEmployee({ ...edited, email: "invalid address" })).toThrow("이메일");
    expect(listStoredEmployees().find(e => e.id === saved.id)?.email).toBe("person@example.invalid");
    expect(saveStoredEmployee({ ...edited, email: "" }).email).toBeUndefined();
  });

});

describe("W-04: hire-date metadata correction", () => {
  let fixtureRoot: string;
  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-w04-unit-"));
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
    initializeSqliteStorage({ dbPath: path.join(fixtureRoot, "test.sqlite") }); listStoredEmployees();
  });
  afterEach(() => {
    vi.useRealTimers(); resetEmployeeStorageForTest(); resetSqliteStorageForTest();
    if (path.dirname(path.resolve(fixtureRoot)) !== path.resolve(os.tmpdir()) || !path.basename(fixtureRoot).startsWith("shiftmgmt-w04-unit-")) throw new Error("Unexpected W04 cleanup path.");
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
  const add = () => saveStoredEmployee({ employeeCode: "W04-TARGET", name: "입사일 정정 검증", employmentType: "정규", rank: "사원", status: "active", hireDate: "2020-01-01", siteId: listStoredSites().find(s => s.name === "보라매DC")!.id, shiftGroup: "A조", hourlyRate: 12000 });
  const edit = (employee: ReturnType<typeof add>, hireDate?: string) => ({ id: employee.id, employeeCode: employee.employeeCode, name: employee.name, employmentType: employee.employmentType, rank: employee.rank, status: employee.status, retireDate: employee.retireDate, hireDate });

  it("changes the metadata and preserves existing wage, assignment and employment-period rows even after reopening", () => {
    const target = add(); const dbPath = path.join(fixtureRoot, "test.sqlite");
    closeSqliteStorage(); initializeSqliteStorage({ dbPath });
    const tables = ["wage_rates", "wage_rate_history", "employee_site_assignments", "employee_employment_periods", "employee_employment_period_events"];
    const snapshot = () => tables.map(table => getSqliteDatabase()!.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    expect(saveStoredEmployee(edit(target, "2020-02-01")).hireDate).toBe("2020-02-01");
    expect(snapshot()).toEqual(before);
    closeSqliteStorage(); initializeSqliteStorage({ dbPath });
    expect(listStoredEmployees().find(e => e.id === target.id)?.hireDate).toBe("2020-02-01");
    expect(snapshot()).toEqual(before);
  });

  it("preserves an omitted existing hire date during an unrelated update", () => {
    const target = add(); const payload = edit(target); payload.name = "이름만 정정";
    expect(saveStoredEmployee(payload).hireDate).toBe("2020-01-01");
  });

  it.each(["", "1989-12-31", "2027-11-01", "2026-02-30", "2026-13-01", "날짜아님"])("rejects a changed invalid hire date without a write: %s", value => {
    const target = add(); const db = getSqliteDatabase()!;
    const before = db.prepare("SELECT * FROM employees ORDER BY id").all();
    expect(() => saveStoredEmployee(edit(target, value))).toThrow();
    expect(db.prepare("SELECT * FROM employees ORDER BY id").all()).toEqual(before);
  });

  it("rejects a changed hire date later than the retirement date", () => {
    const target = add();
    expect(() => saveStoredEmployee({ ...edit(target, "2026-04-01"), status: "retired", retireDate: "2026-03-31" })).toThrow();
    expect(listStoredEmployees().find(e => e.id === target.id)?.hireDate).toBe("2020-01-01");
  });

  it("allows unchanged legacy null/out-of-range dates while retaining strict correction bounds", () => {
    const missing = saveStoredEmployee({ employeeCode: "W04-NULL", name: "이전 입사일 없음", employmentType: "정규", status: "active" });
    expect(saveStoredEmployee(edit(missing)).hireDate).toBeUndefined();
    const legacy = saveStoredEmployee({ employeeCode: "W04-LEGACY", name: "이전 범위 밖 날짜", employmentType: "정규", status: "active", hireDate: "1980-01-01" });
    expect(saveStoredEmployee(edit(legacy, legacy.hireDate)).hireDate).toBe("1980-01-01");
    expect(saveStoredEmployee(edit(legacy, "2020-01-01")).hireDate).toBe("2020-01-01");
  });

  it("uses the existing one-year limit including the leap-day boundary", () => {
    const target = add(); vi.setSystemTime(new Date("2024-02-29T03:00:00Z"));
    expect(saveStoredEmployee(edit(target, "2025-02-28")).hireDate).toBe("2025-02-28");
    expect(() => saveStoredEmployee(edit(target, "2025-03-01"))).toThrow();
  });

  it("uses the corrected date for later schedule preparation without rewriting original assignments", async () => {
    const target = add(); const assignments = listStoredEmployeeAssignments(target.id);
    const corrected = saveStoredEmployee(edit(target, "2026-05-16"));
    const prepared = await prepareRosterEmployees([corrected], "2026-05", target.currentSiteId!, async () => assignments);
    expect(prepared.rosterEmployees[0]?.hireDate).toBe("2026-05-16");
    const afterMonth = saveStoredEmployee(edit(corrected, "2026-06-01"));
    expect((await prepareRosterEmployees([afterMonth], "2026-05", target.currentSiteId!, async () => assignments)).rosterEmployees).toHaveLength(0);
    expect(listStoredEmployeeAssignments(target.id)).toEqual(assignments);
  });

  it("preserves real approved calculations, pending intake, wage/assignment and schema when correcting hire metadata", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: path.join(fixtureRoot, "performance") });
    const detail = await syncPreparedReturnedSchedule(fixture); const entry = detail.entries[0]!;
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const employee = listStoredEmployees().find(e => e.employeeCode === entry.employeeCode)!;
    const db = getSqliteDatabase()!; const tables = ["performance_files", "performance_entries", "performance_approvals", "allowance_calculations", "allowance_calculation_items", "wage_rates", "wage_rate_history", "employee_site_assignments", "employee_employment_periods", "employee_employment_period_events"];
    const snapshot = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot(); expect(before[2]!.length).toBe(1); expect(before[3]!.length).toBeGreaterThan(0);
    const schema = db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    expect(saveStoredEmployee(edit(employee, "2026-04-01")).hireDate).toBe("2026-04-01");
    expect(snapshot()).toEqual(before); expect(db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
  }, 30_000);
});

describe("W-03: current employee wage as of Seoul today", () => {
  let fixtureRoot: string;
  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-w03-unit-"));
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
    initializeSqliteStorage({ dbPath: path.join(fixtureRoot, "test.sqlite") }); listStoredEmployees();
  });
  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllEnvs(); resetEmployeeStorageForTest(); resetSqliteStorageForTest();
    if (path.dirname(path.resolve(fixtureRoot)) !== path.resolve(os.tmpdir()) || !path.basename(fixtureRoot).startsWith("shiftmgmt-w03-unit-")) throw new Error("Unexpected W03 cleanup path.");
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
  const add = (code = "W03-TARGET") => saveStoredEmployee({ employeeCode: code, name: "시급기준검증", rank: "사원", employmentType: "정규", status: "active", hireDate: "2020-01-01", siteId: listStoredSites().find(s => s.name === "보라매DC")!.id, shiftGroup: "A조" });
  const wage = (id: string, rate: number, from: string) => saveStoredEmployeeWageRate({ employeeId: id, hourlyRate: rate, effectiveFrom: from, reason: "날짜 기준 검문" });
  const employee = (id: string) => listStoredEmployees().find(e => e.id === id)!;

  it("selects today's finite-ended rate instead of tomorrow's open rate and returns the exact period/as-of", () => {
    const target = add(); wage(target.id, 14000, "2026-10-01"); wage(target.id, 18000, "2026-11-01");
    expect(employee(target.id)).toMatchObject({ currentHourlyRate: 14000, currentHourlyRateEffectiveFrom: "2026-10-01", currentHourlyRateEffectiveTo: "2026-10-31", currentHourlyRateAsOfDate: "2026-10-31" });
  });

  it.each([
    ["2026-10-31", undefined, 14000],
    ["2026-10-01", "2026-10-31", 14000],
    ["2026-10-01", "2026-10-30", undefined],
    ["2026-11-01", undefined, undefined]
  ] as const)("respects inclusive start/end and excludes expired/future rates: %s..%s", (from, to, expected) => {
    const target = add(); const stored = wage(target.id, 14000, from);
    if (to) closeStoredEmployeeWageRate({ wageRateId: stored.id, effectiveTo: to });
    const result = employee(target.id);
    expect(result.currentHourlyRate).toBe(expected);
    expect(result.currentHourlyRateEffectiveFrom).toBe(expected === undefined ? undefined : from);
    expect(result.currentHourlyRateAsOfDate).toBe("2026-10-31");
  });

  it("does not substitute a future rate in a gap or invent a value for a worker without wage records", () => {
    const gap = add("W03-GAP"), missing = add("W03-MISSING");
    const old = wage(gap.id, 14000, "2026-10-01"); closeStoredEmployeeWageRate({ wageRateId: old.id, effectiveTo: "2026-10-29" });
    wage(gap.id, 18000, "2026-11-02");
    expect(employee(gap.id).currentHourlyRate).toBeUndefined();
    expect(employee(missing.id).currentHourlyRate).toBeUndefined();
    expect(employee(gap.id).currentHourlyRateEffectiveFrom).toBeUndefined();
  });

  it.each(["UTC", "America/Los_Angeles"])("switches at Seoul midnight on reread independently of host timezone %s", timezone => {
    vi.stubEnv("TZ", timezone);
    const target = add(); wage(target.id, 14000, "2026-10-01"); wage(target.id, 18000, "2026-11-01");
    vi.setSystemTime(new Date("2026-10-31T14:59:59.999Z"));
    expect(employee(target.id)).toMatchObject({ currentHourlyRate: 14000, currentHourlyRateAsOfDate: "2026-10-31" });
    vi.setSystemTime(new Date("2026-10-31T15:00:00.000Z"));
    expect(employee(target.id)).toMatchObject({ currentHourlyRate: 18000, currentHourlyRateEffectiveFrom: "2026-11-01", currentHourlyRateAsOfDate: "2026-11-01" });
  });

  it("preserves the separate requested-month wage selection", () => {
    const target = add(); wage(target.id, 14000, "2026-10-01"); wage(target.id, 18000, "2026-11-01");
    const site = listStoredSites().find(s => s.name === "보라매DC")!;
    const historical = listStoredEmployeesForSiteMonth(site.id, "2026-11").find(e => e.id === target.id)!;
    expect(historical.currentHourlyRate).toBe(18000);
    expect(historical.currentHourlyRateAsOfDate).toBeUndefined();
    expect(employee(target.id).currentHourlyRate).toBe(14000);
  });

  it("keeps persisted wages, history, financial rows and schema unchanged on current-wage reads", () => {
    const target = add(); wage(target.id, 14000, "2026-10-01"); wage(target.id, 18000, "2026-11-01");
    const db = getSqliteDatabase()!;
    const tables = ["wage_rates", "wage_rate_history", "performance_files", "performance_entries", "performance_approvals", "allowance_calculations", "allowance_calculation_items"];
    const snapshot = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot(); const schema = db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    expect(employee(target.id).currentHourlyRate).toBe(14000);
    listStoredEmployees({ keyword: target.employeeCode });
    expect(snapshot()).toEqual(before); expect(db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
  });

  it("preserves a stored zero amount and its actual start date without a future fallback", () => {
    const target = add(); wage(target.id, 0, "2026-10-01"); wage(target.id, 18000, "2026-11-01");
    expect(employee(target.id)).toMatchObject({ currentHourlyRate: 0, currentHourlyRateEffectiveFrom: "2026-10-01" });
  });
});


describe("W-09 retirement lifecycle", () => {
  let root: string;
  beforeEach(() => { root=mkdtempSync(path.join(os.tmpdir(),"shiftmgmt-w09-employee-"));initializeSqliteStorage({dbPath:path.join(root,"test.sqlite")}); });
  afterEach(() => { vi.useRealTimers();resetEmployeeStorageForTest();resetSqliteStorageForTest();if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith("shiftmgmt-w09-employee-"))throw new Error("Unexpected W09 root");rmSync(root,{recursive:true,force:true}); });
  const target = () => listStoredEmployees().find(e=>e.employeeCode==="EMP-001")!;
  it("W-09: retirement automatically ends wage the day before and assignment on first excluded day", () => {
    const employee=target();
    saveStoredEmployee({...employee,hourlyRate:undefined,status:"retired",retireDate:"2026-03-16"});
    const db=getSqliteDatabase()!;
    expect((db.prepare("SELECT effective_to FROM wage_rates WHERE employee_id=? ORDER BY effective_from DESC LIMIT 1").get(employee.id) as {effective_to:string}).effective_to).toBe("2026-03-15");
    expect((db.prepare("SELECT end_date FROM employee_site_assignments WHERE employee_id=? ORDER BY start_date DESC LIMIT 1").get(employee.id) as {end_date:string}).end_date).toBe("2026-03-16");
  });
  const retire = (date: string) => saveStoredEmployee({...target(),hourlyRate:undefined,status:"retired",retireDate:date},testAdminSession);
  const snapshot = () => ["employees","wage_rates","wage_rate_history","employee_site_assignments","employee_employment_periods","employee_retirement_history_closures","employee_employment_period_events"].map(t=>getSqliteDatabase()!.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());

  it("adjusts only auto-closed bounds on a corrected retirement date and preserves original source identity", () => {
    const employee=target(),rate=listStoredEmployeeWageRates(employee.id)[0],assignment=listStoredEmployeeAssignments(employee.id)[0];
    const first=retire("2026-03-16");expect(first.retirementChange).toMatchObject({closedWageCount:1,closedAssignmentCount:1});
    const corrected=retire("2026-04-16");expect(corrected.retirementChange).toMatchObject({kind:"date-correction",adjustedHistoryCount:2});
    const saved=listStoredEmployeeWageRates(employee.id).find(r=>r.id===rate.id)!;expect(saved.effectiveTo).toBe("2026-04-15");expect(saved.hourlyRate).toBe(rate.hourlyRate);expect(saved.createdAt).toBe(rate.createdAt);
    expect(listStoredEmployeeAssignments(employee.id).find(a=>a.id===assignment.id)?.endDate).toBe("2026-04-16");
    const events=getSqliteDatabase()!.prepare("SELECT * FROM employee_employment_period_events WHERE employee_id=? ORDER BY rowid").all(employee.id) as Array<{reason:string}>;
    expect(events).toHaveLength(2);expect(JSON.parse(events[1].reason).actor).toEqual({userId:testAdminSession.userId,loginId:testAdminSession.loginId,displayName:testAdminSession.displayName,role:testAdminSession.role});
    const history=getSqliteDatabase()!.prepare("SELECT * FROM wage_rate_history WHERE wage_rate_id=? ORDER BY rowid").all(rate.id) as Array<{effective_to:string|null}>;
    expect(history.map(h=>h.effective_to)).toEqual([rate.effectiveTo??null,"2026-03-15"]);
    const counts=snapshot().map(rows=>rows.length);retire("2026-04-16");expect(snapshot().map(rows=>rows.length)).toEqual(counts);
  });

  it("never extends beyond original manual wage or assignment endpoints", () => {
    const e=target(),rate=listStoredEmployeeWageRates(e.id)[0],assignment=listStoredEmployeeAssignments(e.id)[0];
    closeStoredEmployeeWageRate({wageRateId:rate.id,effectiveTo:"2026-07-31"});closeStoredEmployeeAssignment({assignmentId:assignment.id,endDate:"2026-07-20"});
    retire("2026-03-16");expect(listStoredEmployeeWageRates(e.id)[0].effectiveTo).toBe("2026-03-15");
    retire("2026-09-01");expect(listStoredEmployeeWageRates(e.id)[0].effectiveTo).toBe("2026-07-31");
    expect(listStoredEmployeeAssignments(e.id)[0]).toMatchObject({id:assignment.id,status:"ended",endDate:"2026-07-20"});
  });

  it("keeps future histories without inverted ranges and excludes them from retirement onward", () => {
    const e=target();const rate=saveStoredEmployeeWageRate({employeeId:e.id,effectiveFrom:"2027-01-01",hourlyRate:16000});
    const a=saveStoredEmployeeAssignment({employeeId:e.id,siteId:e.currentSiteId!,shiftGroup:e.currentShiftGroup!,startDate:"2027-01-01"});
    const db=getSqliteDatabase()!,before=db.prepare("SELECT * FROM wage_rates WHERE id=?").get(rate.id);
    const result=retire("2026-03-16");expect(result.retirementChange).toMatchObject({excludedFutureWageCount:1,excludedFutureAssignmentCount:1});
    expect(db.prepare("SELECT * FROM wage_rates WHERE id=?").get(rate.id)).toEqual(before);
    expect(listStoredEmployeeAssignments(e.id).find(r=>r.id===a.id)).toMatchObject({status:"ended",retirementExcluded:true});
    expect(listStoredEmployees().find(r=>r.id===e.id)?.currentHourlyRate).toBeUndefined();expect(listStoredEmployees().find(r=>r.id===e.id)?.currentSiteId).toBeUndefined();
    expect((db.prepare("SELECT count(*) as n FROM wage_rates WHERE employee_id=? AND effective_to < effective_from").get(e.id) as {n:number}).n).toBe(0);
    retire("2027-03-01");expect(listStoredEmployeeWageRates(e.id).find(r=>r.id===rate.id)?.effectiveTo).toBe("2027-02-28");
    expect(listStoredEmployeeAssignments(e.id).find(r=>r.id===a.id)?.endDate).toBe("2027-03-01");
  });

  it("does not change or reopen a W08 invalidated original row during retirement/correction", () => {
    const e=target(),rate=listStoredEmployeeWageRates(e.id)[0];
    saveStoredEmployeeWageRate({employeeId:e.id,effectiveFrom:rate.effectiveFrom,hourlyRate:rate.hourlyRate,revision:{operation:"invalidate",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"W09 무효 원본 보존"}},testAdminSession);
    const db=getSqliteDatabase()!,before=db.prepare("SELECT * FROM wage_rates WHERE id=?").get(rate.id),oldHistory=db.prepare("SELECT * FROM wage_rate_history WHERE wage_rate_id=?").all(rate.id);
    retire("2026-03-16");retire("2026-06-16");expect(db.prepare("SELECT * FROM wage_rates WHERE id=?").get(rate.id)).toEqual(before);expect(db.prepare("SELECT * FROM wage_rate_history WHERE wage_rate_id=?").all(rate.id)).toEqual(oldHistory);
  });

  it.each(["deleted","moved","individual-end"])("rejects a %s auto-closed source instead of losing its provenance", mode => {
    const e=target(),rate=listStoredEmployeeWageRates(e.id)[0];retire("2026-03-16");const db=getSqliteDatabase()!;
    if(mode==="deleted")db.prepare("DELETE FROM wage_rates WHERE id=?").run(rate.id);
    else if(mode==="moved")db.prepare("UPDATE wage_rates SET employment_period_id='other-period' WHERE id=?").run(rate.id);
    else db.prepare("UPDATE wage_rates SET effective_to='2026-03-10' WHERE id=?").run(rate.id);
    const before=snapshot();expect(()=>retire("2026-04-16")).toThrow();expect(snapshot()).toEqual(before);
  });

  it.each(["ABORT","ROLLBACK","IGNORE"])("SQL %s while preserving retirement event rolls back employee and all histories", failure => {
    target();const db=getSqliteDatabase()!,before=snapshot();
    db.exec(`CREATE TEMP TRIGGER w09_failed_event BEFORE INSERT ON employee_employment_period_events BEGIN SELECT RAISE(${failure}${failure==="IGNORE"?"":", 'w09 event failure'"}); END`);
    expect(()=>retire("2026-03-16")).toThrow();expect(snapshot()).toEqual(before);
  });

  it.each(["employees","wage_rate_history","employee_retirement_history_closures","employee_site_assignments"])("failure in %s leaves metadata and dependent histories intact", table => {
    target();const db=getSqliteDatabase()!,before=snapshot();const operation=table==="employee_site_assignments"?"UPDATE":"INSERT";
    db.exec(`CREATE TEMP TRIGGER w09_failed_write BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'w09 dependent failure'); END`);
    expect(()=>retire("2026-03-16")).toThrow("w09 dependent failure");expect(snapshot()).toEqual(before);
  });

  it("an ignored employee write cannot close histories while leaving employment active",()=>{
    target();const db=getSqliteDatabase()!,before=snapshot();db.exec("CREATE TEMP TRIGGER w09_ignored_employee BEFORE INSERT ON employees BEGIN SELECT RAISE(IGNORE); END");
    expect(()=>retire("2026-03-16")).toThrow("기본 정보");expect(snapshot()).toEqual(before);
  });

  it.each(["2026-02-30","not-date","1990-01-01"])("rejects invalid/before-hire retirement %s atomically", date => {
    target();const before=snapshot();expect(()=>retire(date)).toThrow();expect(snapshot()).toEqual(before);
  });

  it("future retirement never reactivates an independently ended assignment",()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));const e=target(),assignment=listStoredEmployeeAssignments(e.id).find(a=>a.status==="active")!;
    closeStoredEmployeeAssignment({assignmentId:assignment.id,endDate:"2026-11-03"});expect(target().currentSiteId).toBeUndefined();
    retire("2026-11-05");expect(target().currentSiteId).toBeUndefined();expect(listStoredEmployeeAssignments(e.id).find(a=>a.id===assignment.id)).toMatchObject({status:"ended",endDate:"2026-11-03"});
    retire("2026-11-06");expect(target().currentSiteId).toBeUndefined();expect(listStoredEmployeeAssignments(e.id).find(a=>a.id===assignment.id)).toMatchObject({status:"ended",endDate:"2026-11-03"});
  });

  it("scheduled retirement releases team capacity on the first excluded day without another save",()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));const e=target(),site=e.currentSiteId!,team=e.currentShiftGroup!,db=getSqliteDatabase()!;
    const count=db.prepare("SELECT COUNT(*) AS n FROM employee_site_assignments WHERE site_id=? AND shift_group=? AND status='active'").get(site,team) as {n:number};
    const pattern=listStoredShiftPatterns(site)[0];saveStoredShiftPattern({...pattern,teamCapacities:[{teamLabel:team,maxHeadcount:count.n}]});
    const candidate=saveStoredEmployee({employeeCode:"W09-CAPACITY",name:"퇴사정원검증",rank:"사원",employmentType:"정규",status:"active",hireDate:"2020-01-01"});retire("2026-11-02");
    const assign=()=>saveStoredEmployeeAssignment({employeeId:candidate.id,siteId:site,shiftGroup:team,startDate:"2026-11-02"});
    expect(assign).toThrow("정원");vi.setSystemTime(new Date("2026-11-02T03:00:00Z"));expect(assign().status).toBe("active");
  });

  it("the current wage and assignment expire on the retirement day even without another save",()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));const e=target();retire("2026-11-02");
    expect(listStoredEmployees().find(r=>r.id===e.id)?.currentSiteId).toBe(e.currentSiteId);expect(listStoredEmployees().find(r=>r.id===e.id)?.currentHourlyRate).toBeDefined();
    vi.setSystemTime(new Date("2026-11-02T03:00:00Z"));expect(listStoredEmployees().find(r=>r.id===e.id)?.currentSiteId).toBeUndefined();expect(listStoredEmployees().find(r=>r.id===e.id)?.currentHourlyRate).toBeUndefined();expect(listStoredEmployeeAssignments(e.id).every(a=>a.status==="ended")).toBe(true);
  });

  it("keeps a future retirement current before cutoff and rejects implicit rehire", () => {
    const e=target();const result=retire("2027-03-01");expect(result.currentHourlyRate).toBeDefined();expect(result.currentSiteId).toBe(e.currentSiteId);
    expect(()=>saveStoredEmployee({...target(),status:"active",retireDate:undefined})).toThrow("재입사");
  });

});
