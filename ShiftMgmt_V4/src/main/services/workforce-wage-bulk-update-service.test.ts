import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";

import { listStoredEmployeeWageRates, saveStoredEmployeeWageRate } from "./employee-history-service";
import { listStoredEmployees, resetEmployeeStorageForTest, saveStoredEmployee } from "./employee-storage-service";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { prepareReturnedScheduleFixture, syncPreparedReturnedSchedule, testAdminSession } from "./performance-test-helpers";
import {
  applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate
} from "./workforce-wage-bulk-update-service";

const createWorkbookFixture = async (
  fileName: string,
  rows: Array<{ siteName: string; employeeName: string; hourlyRate: string }>
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("시급업데이트");
  const filePath = path.resolve(process.cwd(), "artifacts", "tests", fileName);

  worksheet.getCell("B1").value = "근무지명";
  worksheet.getCell("C1").value = "이름";
  worksheet.getCell("D1").value = "시급";

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    worksheet.getCell(`B${rowNumber}`).value = row.siteName;
    worksheet.getCell(`C${rowNumber}`).value = row.employeeName;
    worksheet.getCell(`D${rowNumber}`).value = row.hourlyRate;
  });

  await workbook.xlsx.writeFile(filePath);

  return filePath;
};

describe("workforce-wage-bulk-update-service", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should preview applicable and skipped wage update rows from an imported workbook", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-preview.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" },
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" },
      { siteName: "동탄센터", employeeName: "이수민", hourlyRate: "13,200" },
      { siteName: "보라매DC", employeeName: "없는사람", hourlyRate: "12,500" },
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "시급오류" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: {
        siteNameColumn: "B",
        employeeNameColumn: "C",
        hourlyRateColumn: "D"
      }
    });

    expect(preview.readyCount).toBe(1);
    expect(preview.skippedCount).toBe(4);
    expect(preview.rows[0]?.status).toBe("ready");
    expect(preview.rows[1]?.status).toBe("duplicate-entry");
    expect(preview.rows[2]?.status).toBe("same-rate");
    expect(preview.rows[3]?.status).toBe("employee-not-found");
    expect(preview.rows[4]?.status).toBe("invalid-hourly-rate");
  });

  it("should apply only ready wage update rows and append history", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const targetEmployee = listStoredEmployees().find((employee) => employee.name === "김현우");

    expect(targetEmployee).toBeDefined();

    const filePath = await createWorkbookFixture("workforce-wage-bulk-apply.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" },
      { siteName: "동탄센터", employeeName: "이수민", hourlyRate: "13,200" }
    ]);

    const summary = await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: {
        siteNameColumn: "B",
        employeeNameColumn: "C",
        hourlyRateColumn: "D"
      }
    });

    const wageRates = listStoredEmployeeWageRates(targetEmployee!.id);

    expect(summary.appliedCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.rows[0]?.status).toBe("applied");
    expect(wageRates[0]?.hourlyRate).toBe(13600);
    expect(wageRates[0]?.effectiveFrom).toBe("2026-04-01");
    expect(wageRates[1]?.effectiveTo).toBe("2026-03-31");
  });
});

describe("W-01: bulk wage identity and retirement filtering", () => {
  let fixtureRoot: string;
  const mapping = { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" };
  const codeMapping = { ...mapping, employeeCodeColumn: "A" };

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-w01-unit-"));
    initializeSqliteStorage({ dbPath: path.join(fixtureRoot, "test.sqlite") });
    listStoredEmployees();
  });

  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
    if (path.dirname(path.resolve(fixtureRoot)) !== path.resolve(os.tmpdir()) || !path.basename(fixtureRoot).startsWith("shiftmgmt-w01-unit-")) {
      throw new Error("Unexpected W-01 fixture cleanup path.");
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  const addEmployee = (employeeCode: string, status: "active" | "retired" = "active", retireDate?: string) => {
    const legacyMissingRetirement = status === "retired" && !retireDate;
    const employee = saveStoredEmployee({
      employeeCode, name: "동명검사", employmentType: "정규", rank: "사원", status: legacyMissingRetirement ? "active" : status,
      hireDate: "2020-01-01", retireDate,
      siteId: listStoredSites().find((site) => site.name === "보라매DC")!.id,
      shiftGroup: "A조", hourlyRate: 12000
    });
    // Reproduce old imported rows; the current save API correctly requires a real retirement date.
    if (legacyMissingRetirement) getSqliteDatabase()!.prepare("UPDATE employees SET status='retired',retire_date=NULL WHERE id=?").run(employee.id);
    return legacyMissingRetirement ? { ...employee, status } : employee;
  };

  const workbookInput = async (
    rows: Array<[string, string, string, string | number]>,
    useCode = true,
    effectiveFrom = "2026-04-01"
  ) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("시급");
    sheet.addRow(["사번", "근무지", "이름", "시급"]);
    rows.forEach((row) => sheet.addRow(row));
    const filePath = path.join(fixtureRoot, "wages.xlsx");
    await workbook.xlsx.writeFile(filePath);
    return { filePath, effectiveFrom, mapping: useCode ? codeMapping : mapping };
  };

  it("W10 bulk rejects the employment gap and compares only the new period, ignoring old future wages",async()=>{
    listStoredShiftPatterns();const employee=addEmployee("W10-BULK");saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:"2026-06-01",hourlyRate:99000});
    const retired=saveStoredEmployee({...employee,status:"retired",retireDate:"2026-03-16",hourlyRate:undefined},testAdminSession);
    const active=saveStoredEmployee({...retired,rehire:{operation:"start",startDate:"2026-04-01",siteId:employee.currentSiteId!,shiftGroup:"A조",hourlyRate:15000,expectedRetireDate:retired.retireDate!,expectedUpdatedAt:retired.updatedAt}},testAdminSession);
    expect((await previewWorkforceWageBulkUpdate(await workbookInput([[employee.employeeCode,"","",16000]],true,"2026-03-20"))).rows[0]).toMatchObject({status:"employee-retired",statusLabel:"재직기간·예약 확인"});
    expect((await previewWorkforceWageBulkUpdate(await workbookInput([[employee.employeeCode,"","",15000]],true,"2026-06-01"))).rows[0]).toMatchObject({status:"same-rate",currentHourlyRate:15000});
    expect((await applyWorkforceWageBulkUpdate(await workbookInput([[employee.employeeCode,"","",16000]],true,"2026-06-01"),testAdminSession)).appliedCount).toBe(1);expect(listStoredEmployeeWageRates(active.id).find(w=>w.hourlyRate===16000)?.employmentPeriodId).toBe(active.rehireChange!.employmentPeriodId);
  });
  it("W10 bulk preview directs a future booking wage change to reservation management",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    try{listStoredShiftPatterns();const employee=addEmployee("W10-BOOKED"),retired=saveStoredEmployee({...employee,status:"retired",retireDate:"2026-03-16",hourlyRate:undefined},testAdminSession);
      saveStoredEmployee({...retired,rehire:{operation:"start",startDate:"2026-11-10",siteId:employee.currentSiteId!,shiftGroup:"A조",hourlyRate:15000,expectedRetireDate:retired.retireDate!,expectedUpdatedAt:retired.updatedAt}},testAdminSession);
      const preview=await previewWorkforceWageBulkUpdate(await workbookInput([[employee.employeeCode,"","",16000]],true,"2026-11-10"));expect(preview.readyCount).toBe(0);expect(preview.rows[0]?.note).toContain("예약 변경");
    }finally{vi.useRealTimers();}
  });

  it("W-08 bulk compares a voided work-date interval as missing, never an overlapping predecessor", async () => {
    const employee=addEmployee("W08-BULK");
    const rate=saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:"2026-04-01",hourlyRate:14000});
    saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:rate.effectiveFrom,hourlyRate:rate.hourlyRate,revision:{operation:"invalidate",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"W08 일괄 비교 검증"}},testAdminSession);
    getSqliteDatabase()!.prepare("UPDATE wage_rates SET effective_to=NULL WHERE employee_id=? AND effective_from < '2026-04-01'").run(employee.id);
    for(const amount of [12000,14000]) {
      const preview=await previewWorkforceWageBulkUpdate(await workbookInput([[employee.employeeCode,"","",amount]],true,"2026-04-01"));
      expect(preview.rows[0]?.status).toBe("ready");
    }
  });

  it("matches an exact code despite display-name/site mismatch and active namesakes, and writes only that employee", async () => {
    const target = addEmployee("00017");
    const namesake = addEmployee("W01-OTHER");
    const before = listStoredEmployeeWageRates(namesake.id);
    const input = await workbookInput([[" 00017 ", "다른 근무지 표기", "이름오타", 13600]]);
    const preview = await previewWorkforceWageBulkUpdate(input);
    expect(preview.rows[0]).toMatchObject({ status: "ready", employeeId: target.id, employeeCode: "00017" });
    const summary = await applyWorkforceWageBulkUpdate(input);
    expect(summary.appliedCount).toBe(1);
    expect(listStoredEmployeeWageRates(target.id)[0]).toMatchObject({ hourlyRate: 13600, effectiveFrom: "2026-04-01" });
    expect(listStoredEmployeeWageRates(namesake.id)).toEqual(before);
  });

  it("never falls back from an unknown supplied code to a different employee's matching name", async () => {
    const target = addEmployee("W01-REAL");
    const before = listStoredEmployeeWageRates(target.id);
    const input = await workbookInput([["W01-UNKNOWN", "보라매DC", target.name, 13600]]);
    const preview = await previewWorkforceWageBulkUpdate(input);
    expect(preview.rows[0]).toMatchObject({ status: "employee-not-found", employeeCode: "W01-UNKNOWN" });
    expect((await applyWorkforceWageBulkUpdate(input)).appliedCount).toBe(0);
    expect(listStoredEmployeeWageRates(target.id)).toEqual(before);
  });

  it("requires codes on every populated row when a code column is configured, and retains code-only incomplete rows", async () => {
    addEmployee("W01-REAL");
    const preview = await previewWorkforceWageBulkUpdate(await workbookInput([
      ["", "보라매DC", "동명검사", 13600], ["W01-REAL", "", "", ""]
    ]));
    expect(preview.totalRows).toBe(2);
    expect(preview.rows.map((row) => row.status)).toEqual(["missing-required-value", "missing-required-value"]);
  });

  it("uses the active namesake after excluding retired candidates in legacy files", async () => {
    const target = addEmployee("W01-ACTIVE");
    const retired = addEmployee("W01-RETIRED", "retired", "2026-02-28");
    const retiredBefore = listStoredEmployeeWageRates(retired.id);
    const input = await workbookInput([["", "보라매DC", "동명검사", 13600]], false);
    expect((await previewWorkforceWageBulkUpdate(input)).rows[0]).toMatchObject({ status: "ready", employeeId: target.id });
    expect((await applyWorkforceWageBulkUpdate(input)).appliedCount).toBe(1);
    expect(listStoredEmployeeWageRates(target.id)[0]?.hourlyRate).toBe(13600);
    expect(listStoredEmployeeWageRates(retired.id)).toEqual(retiredBefore);
  });

  it("keeps multiple eligible namesakes ambiguous without a code", async () => {
    addEmployee("W01-ACTIVE-1"); addEmployee("W01-ACTIVE-2"); addEmployee("W01-RETIRED", "retired");
    const input = await workbookInput([["", "보라매DC", "동명검사", 13600]], false);
    expect((await previewWorkforceWageBulkUpdate(input)).rows[0]?.status).toBe("ambiguous-employee");
    expect((await applyWorkforceWageBulkUpdate(input)).appliedCount).toBe(0);
  });

  it("reports retirement rather than ambiguity when all legacy candidates are retired", async () => {
    addEmployee("W01-RETIRED-1", "retired"); addEmployee("W01-RETIRED-2", "retired");
    const input = await workbookInput([["", "보라매DC", "동명검사", 13600]], false);
    expect((await previewWorkforceWageBulkUpdate(input)).rows[0]?.status).toBe("employee-retired");
    expect((await applyWorkforceWageBulkUpdate(input)).appliedCount).toBe(0);
  });

  it.each([
    ["active", "2026-03-31", "2026-04-01", "employee-retired"],
    ["active", "2026-04-01", "2026-04-01", "ready"],
    ["active", "2026-04-02", "2026-04-01", "ready"],
    ["retired", "2026-06-01", "2026-04-01", "employee-retired"]
  ] as const)("preserves retirement boundary: %s/%s at %s => %s", async (status, retireDate, effectiveFrom, expected) => {
    const employee = addEmployee("W01-DATE", status, retireDate);
    addEmployee("W01-OTHER");
    const input = await workbookInput([[employee.employeeCode, "보라매DC", employee.name, 13600]], true, effectiveFrom);
    expect((await previewWorkforceWageBulkUpdate(input)).rows[0]?.status).toBe(expected);
  });

  it("deduplicates by resolved ID even when two code rows have different display labels", async () => {
    const employee = addEmployee("W01-DUP");
    const input = await workbookInput([[employee.employeeCode, "", "오타1", 13600], [employee.employeeCode, "다른표기", "오타2", 14000]]);
    expect((await previewWorkforceWageBulkUpdate(input)).rows.map((row) => row.status)).toEqual(["ready", "duplicate-entry"]);
    expect((await applyWorkforceWageBulkUpdate(input)).appliedCount).toBe(1);
    expect(listStoredEmployeeWageRates(employee.id)[0]?.hourlyRate).toBe(13600);
  });

  it("uses code without a current site assignment and preserves invalid-rate handling", async () => {
    const employee = saveStoredEmployee({ employeeCode: "W01-NOSITE", name: "미배정", employmentType: "정규", rank: "사원", status: "active", hireDate: "2020-01-01", hourlyRate: 12000 });
    const preview = await previewWorkforceWageBulkUpdate(await workbookInput([[employee.employeeCode, "", "", 13600], [employee.employeeCode, "", "", 0]]));
    expect(preview.rows[0]).toMatchObject({ status: "ready", employeeId: employee.id });
    expect(preview.rows[1]?.status).toBe("invalid-hourly-rate");
  });

  it("preserves actual approved calculations, pending intake rows and schema when applying a wage by code", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: path.join(fixtureRoot, "performance") });
    const detail = await syncPreparedReturnedSchedule(fixture);
    expect(detail.entries.length).toBeGreaterThan(1);
    const entry = detail.entries[0]!;
    const approval = await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(approval.ok).toBe(true);
    const database = getSqliteDatabase()!;
    const preserved = ["performance_files", "performance_entries", "performance_approvals", "allowance_calculations", "allowance_calculation_items"];
    const snapshot = () => preserved.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    expect(before[2]!.length).toBe(1);
    expect(before[3]!.length).toBeGreaterThan(0);
    const schema = database.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
    const input = await workbookInput([[entry.employeeCode, "표기차이", "오타", 20000]], true, "2026-03-02");
    expect((await applyWorkforceWageBulkUpdate(input)).appliedCount).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(database.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all()).toEqual(schema);
    const correctionInput = await workbookInput([[entry.employeeCode, "표기차이", "오타", 21000]], true, "2026-03-02");
    expect((await applyWorkforceWageBulkUpdate(correctionInput, testAdminSession)).appliedCount).toBe(1);
    expect(snapshot()).toEqual(before);
    const employee = listStoredEmployees().find(e => e.employeeCode === entry.employeeCode)!;
    expect(listStoredEmployeeWageRates(employee.id).find(r => r.effectiveFrom === "2026-03-02")?.history?.[0]).toMatchObject({ hourlyRate: 20000, actorDisplayName: testAdminSession.displayName });
  }, 30_000);

  it("W-02: rolls back all prior snapshots and rate changes when a later bulk correction fails", async () => {
    const first = addEmployee("W02-FIRST"), second = addEmployee("W02-SECOND");
    for (const employee of [first, second]) saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 12500, effectiveFrom: "2026-04-01", reason: "기존 금액" });
    const before = [first, second].map(e => listStoredEmployeeWageRates(e.id));
    const database = getSqliteDatabase()!;
    database.exec(`CREATE TEMP TRIGGER w02_bulk_fail BEFORE UPDATE ON wage_rates WHEN OLD.employee_id = '${second.id}' BEGIN SELECT RAISE(ABORT,'w02 bulk rejected'); END`);
    const input = await workbookInput([[first.employeeCode, "", "", 13600], [second.employeeCode, "", "", 14000]]);
    await expect(applyWorkforceWageBulkUpdate(input, testAdminSession)).rejects.toThrow("w02 bulk rejected");
    expect([first, second].map(e => listStoredEmployeeWageRates(e.id))).toEqual(before);
    expect(database.prepare("SELECT * FROM wage_rate_history").all()).toHaveLength(0);
  });

  it("W-02: stores the trusted actor and exact old reason on a successful bulk same-date correction", async () => {
    const employee = addEmployee("W02-ACTOR");
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 12500, effectiveFrom: "2026-04-01", reason: "정기 인상 전" });
    const input = await workbookInput([[employee.employeeCode, "", "", 13600]]);
    expect((await applyWorkforceWageBulkUpdate(input, testAdminSession)).appliedCount).toBe(1);
    expect(listStoredEmployeeWageRates(employee.id)[0]?.history?.[0]).toMatchObject({ hourlyRate: 12500, reason: "정기 인상 전", actorDisplayName: testAdminSession.displayName, actorLoginId: testAdminSession.loginId });
  });
});
