import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as intake from "./performance-file-intake-service";
import { refreshPendingPerformanceForWageChanges } from "./workforce-wage-performance-service";
import { prepareReturnedScheduleFixture, syncPreparedReturnedSchedule, testAdminSession } from "./performance-test-helpers";
import { listStoredEmployees, listStoredEmployeesForSiteMonth, saveStoredEmployee } from "./employee-storage-service";
import { listStoredEmployeeWageRates, saveStoredEmployeeWageRate } from "./employee-history-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { getStoredPerformanceFileDetail, resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import { closeSqliteStorage, initializeSqliteStorage, getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { saveStoredAppSettings } from "./app-settings-storage-service";
import { listPerformanceOverview } from "./performance-management-service";
import { restoreMissingMonthlySchedulesFromExportedPlans } from "./monthly-schedule-restore-service";
import { listStoredMonthlySchedules } from "./monthly-schedule-storage-service";

const roots: string[] = [];
const prepare = async (templateVariant?:"sample1"|"sample2") => {
  const root = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-w06-")); roots.push(root);
  const fixture = await prepareReturnedScheduleFixture({ rootDir: root,templateVariant });
  const detail = await syncPreparedReturnedSchedule(fixture);
  const target = detail.entries.find(e => e.section === "overtime")!;
  const employee = listStoredEmployees().find(e => e.employeeCode === target.employeeCode)!;
  return { fixture, detail, target, employee };
};
const financial = () => ["performance_approvals", "allowance_calculations", "allowance_calculation_items"].map(table => getSqliteDatabase()!.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
const change = (employeeId: string, hourlyRate = 15500, effectiveFrom = "2026-03-01") => saveStoredEmployeeWageRate({ employeeId, hourlyRate, effectiveFrom, reason: "W06 대상 재읽기" });

describe("W-06 targeted pending refresh after wage save", () => {
  afterEach(() => {
    vi.restoreAllMocks(); resetPerformanceApprovalStateForTest(); resetPerformanceFileStorageForTest(); resetSqliteStorageForTest();
    for (const root of roots.splice(0)) {
      if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("shiftmgmt-w06-")) throw new Error("Unexpected W06 cleanup path");
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([["2026-03-01",false],["2026-03-02",true]] as const)("W10 exported-plan restore respects the gap and old-period team at retirement %s",async(retireDate,expected)=>{
    const {fixture}=await prepare("sample2");const employee=listStoredEmployees().find(e=>e.employeeCode===fixture.workers.holiday.employeeCode)!;
    const retired=saveStoredEmployee({...employee,status:"retired",retireDate,hourlyRate:undefined},testAdminSession);
    saveStoredEmployee({...retired,rehire:{operation:"start",startDate:"2026-03-03",siteId:employee.currentSiteId!,shiftGroup:"B조",hourlyRate:17000,expectedUpdatedAt:retired.updatedAt,expectedRetireDate:retired.retireDate!}},testAdminSession);
    // Remove only the replaceable saved schedule items; the Excel producer remains the actual exported workbook.
    getSqliteDatabase()!.exec("DELETE FROM monthly_schedule_items");
    const summary=await restoreMissingMonthlySchedulesFromExportedPlans({scheduleExportDir:fixture.exportDir});expect(summary.restoredScheduleCount,JSON.stringify(summary)).toBeGreaterThan(0);
    const restored=listStoredMonthlySchedules().flatMap(schedule=>schedule.items);expect(restored.some(item=>item.employeeCode===employee.employeeCode&&item.workDate==="2026-03-01")).toBe(expected);if(expected)expect(restored.find(item=>item.employeeCode===employee.employeeCode&&item.workDate==="2026-03-01")?.teamLabel).toBe("A조");expect(restored.some(item=>item.employeeCode===fixture.workers.substituteOriginal.employeeCode&&item.workDate==="2026-03-02"&&item.teamLabel==="B조")).toBe(true);
  });
  it("W10 gap blocks cached/manual approval and real Excel reread while approved siblings stay unchanged",async()=>{
    const {fixture,detail,target,employee}=await prepare(),sibling=detail.entries.find(e=>e.section==="legal-holiday")!;
    expect((await approvePerformanceFile({fileId:detail.id,entryId:sibling.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);const preserved=financial();
    const retired=saveStoredEmployee({...employee,status:"retired",retireDate:target.workDate,hourlyRate:undefined},testAdminSession);
    const startDate=new Date(Date.parse(target.workDate+"T00:00:00Z")+2*86400000).toISOString().slice(0,10);
    saveStoredEmployee({...retired,rehire:{operation:"start",startDate,siteId:employee.currentSiteId!,shiftGroup:employee.currentShiftGroup!,hourlyRate:17000,expectedUpdatedAt:retired.updatedAt,expectedRetireDate:retired.retireDate!}},testAdminSession);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id,manualHourlyRate:22000,comment:"W10 gap"},testAdminSession,{userDataPath:fixture.userDataPath}))).toMatchObject({ok:false,errorCode:"PERFORMANCE_EMPLOYEE_NOT_EMPLOYED"});
    const overview=await listPerformanceOverview({scheduleMonth:"2026-03"});const row=overview.groups.flatMap(g=>g.rows).find(r=>r.entry.employeeCode===employee.employeeCode&&r.entry.workDate===target.workDate)!;expect(row.canApprove).toBe(false);expect(row.entry.alerts.some(a=>a.message.includes("재직기간"))).toBe(true);
    expect(await refreshPendingPerformanceForWageChanges([{employeeId:employee.id,effectiveFrom:target.workDate,employmentFrom:target.workDate}])).toMatchObject({status:"completed",refreshedFileCount:1});
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBeUndefined();expect(financial()).toEqual(preserved);
  });
  it("W10 same-day rehire refresh applies the new period rate to actual Excel and preserves existing approval snapshots",async()=>{
    const {fixture,detail,target,employee}=await prepare(),sibling=detail.entries.find(e=>e.section==="legal-holiday")!;
    expect((await approvePerformanceFile({fileId:detail.id,entryId:sibling.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);const preserved=financial();
    const retired=saveStoredEmployee({...employee,status:"retired",retireDate:target.workDate,hourlyRate:undefined},testAdminSession);
    saveStoredEmployee({...retired,rehire:{operation:"start",startDate:target.workDate,siteId:employee.currentSiteId!,shiftGroup:employee.currentShiftGroup!,hourlyRate:17500,expectedUpdatedAt:retired.updatedAt,expectedRetireDate:retired.retireDate!}},testAdminSession);
    expect(await refreshPendingPerformanceForWageChanges([{employeeId:employee.id,effectiveFrom:target.workDate,employmentFrom:target.workDate}])).toMatchObject({status:"completed",refreshedFileCount:1});
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(17500);expect(financial()).toEqual(preserved);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);
  });
  it("W10 changed employment binding during parsing cannot commit a stale re-read",async()=>{
    const {detail,target,employee}=await prepare(),before=getStoredPerformanceFileDetail(detail.id),original=intake.buildPerformanceFileDetailFromPath;
    vi.spyOn(intake,"buildPerformanceFileDetailFromPath").mockImplementationOnce(async input=>{const parsed=await original(input);const retired=saveStoredEmployee({...employee,status:"retired",retireDate:target.workDate,hourlyRate:undefined},testAdminSession);saveStoredEmployee({...retired,rehire:{operation:"start",startDate:target.workDate,siteId:employee.currentSiteId!,shiftGroup:employee.currentShiftGroup!,hourlyRate:17000,expectedUpdatedAt:retired.updatedAt,expectedRetireDate:retired.retireDate!}},testAdminSession);return parsed;});
    expect(await refreshPendingPerformanceForWageChanges([{employeeId:employee.id,effectiveFrom:target.workDate,employmentFrom:target.workDate}])).toMatchObject({status:"partial",refreshedFileCount:0});expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
  });
  it("W-09 retirement refresh and corrected date preserve approved siblings and block stale/manual post-retirement approval", async () => {
    const {fixture,detail,target,employee}=await prepare();const sibling=detail.entries.find(e=>e.section==="legal-holiday")!;
    expect((await approvePerformanceFile({fileId:detail.id,entryId:sibling.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);
    const before=financial();const retired=saveStoredEmployee({...employee,status:"retired",retireDate:target.workDate,hourlyRate:undefined},testAdminSession);expect(retired.retirementChange).toBeDefined();
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(target.hourlyRate);
    const denied=await approvePerformanceFile({fileId:detail.id,entryId:target.id,manualHourlyRate:19000,comment:"퇴사 후 수동 시급 우회 금지"},testAdminSession,{userDataPath:fixture.userDataPath});expect(denied).toMatchObject({ok:false,errorCode:"PERFORMANCE_EMPLOYEE_RETIRED"});
    expect(await refreshPendingPerformanceForWageChanges([{employeeId:employee.id,effectiveFrom:target.workDate,employmentFrom:target.workDate}])).toMatchObject({status:"completed",targetFileCount:1,refreshedFileCount:1});
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBeUndefined();expect(financial()).toEqual(before);
    const correctedDate=new Date(Date.parse(target.workDate+"T00:00:00Z")+2*86400000).toISOString().slice(0,10);
    saveStoredEmployee({...employee,status:"retired",retireDate:correctedDate,hourlyRate:undefined},testAdminSession);
    await refreshPendingPerformanceForWageChanges([{employeeId:employee.id,effectiveFrom:target.workDate,employmentFrom:target.workDate}]);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(target.hourlyRate);expect(financial()).toEqual(before);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);
  });

  it("W-09 missing source retains the saved retirement and cache but still blocks a new approval", async () => {
    const {fixture,detail,target,employee}=await prepare();unlinkSync(fixture.filePath);
    saveStoredEmployee({...employee,status:"retired",retireDate:target.workDate,hourlyRate:undefined},testAdminSession);
    expect((await refreshPendingPerformanceForWageChanges([{employeeId:employee.id,effectiveFrom:target.workDate,employmentFrom:target.workDate}])).status).toBe("partial");
    expect(listStoredEmployees({includeHistoricalAssignments:true}).find(e=>e.id===employee.id)?.retireDate).toBe(target.workDate);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(target.hourlyRate);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(false);expect(financial().every(rows=>rows.length===0)).toBe(true);
  });

  it("W-08 partial source refresh cannot approve a cached or manually overridden invalid wage", async () => {
    const {fixture,detail,target,employee}=await prepare();const rate=listStoredEmployeeWageRates(employee.id)[0];
    unlinkSync(fixture.filePath);
    const invalid=saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:rate.effectiveFrom,hourlyRate:rate.hourlyRate,revision:{operation:"invalidate",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"W08 원본 누락 시 승인 검문"}},testAdminSession);
    expect((await refreshPendingPerformanceForWageChanges([invalid])).status).toBe("partial");
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(target.hourlyRate);
    for(const manualHourlyRate of [undefined,19000]) {
      const result=await approvePerformanceFile({fileId:detail.id,entryId:target.id,manualHourlyRate,comment:"수동 시급도 무효 구간을 우회할 수 없음"},testAdminSession,{userDataPath:fixture.userDataPath});
      expect(result.ok).toBe(false);
    }
    expect(financial().every(rows=>rows.length===0)).toBe(true);
  });

  it("W-08 actual invalidation refresh blocks pending XLSX approval and keeps approved siblings/snapshots", async () => {
    const {fixture,detail,target,employee}=await prepare();const sibling=detail.entries.find(e=>e.section==="legal-holiday")!;
    expect((await approvePerformanceFile({fileId:detail.id,entryId:sibling.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);
    const before=financial(), rate=listStoredEmployeeWageRates(employee.id)[0];
    const invalid=saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:rate.effectiveFrom,hourlyRate:rate.hourlyRate,revision:{operation:"invalidate",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"W08 실제 대기 실적 검증"}},testAdminSession);
    expect(listStoredEmployeesForSiteMonth(employee.currentSiteId!, target.workDate.slice(0,7)).find(e=>e.id===employee.id)?.currentHourlyRate).toBeUndefined();
    expect(invalid.invalidation).toBeDefined();expect(await refreshPendingPerformanceForWageChanges([invalid])).toMatchObject({status:"completed",targetFileCount:1,refreshedFileCount:1});
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBeUndefined();expect(financial()).toEqual(before);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(false);
    const replacement=saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:rate.effectiveFrom,hourlyRate:16600});await refreshPendingPerformanceForWageChanges([replacement]);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(16600);expect(financial()).toEqual(before);
  });

  it("updates a pending wage in a real workbook while preserving approved siblings, financial rows and schema", async () => {
    const { fixture, detail, target, employee } = await prepare();
    const sibling = detail.entries.find(e => e.section === "legal-holiday")!;
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: sibling.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const rate = change(employee.id); const before = financial();
    const schema = getSqliteDatabase()!.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e => e.id === target.id)?.hourlyRate).not.toBe(15500);
    const result = await refreshPendingPerformanceForWageChanges([rate]);
    expect(result).toMatchObject({ status: "completed", targetFileCount: 1, refreshedFileCount: 1, affectedEntryCount: 1, issues: [] });
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e => e.id === target.id)?.hourlyRate).toBe(15500);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e => e.id === sibling.id)?.status).toBe("approved");
    expect(financial()).toEqual(before);
    expect(getSqliteDatabase()!.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
  });

  it("deduplicates a bulk change in one file and updates both affected employees", async () => {
    const { detail, employee } = await prepare();
    const sibling = detail.entries.find(e => e.section === "legal-holiday")!;
    const other = listStoredEmployees().find(e => e.employeeCode === sibling.employeeCode)!;
    const first = change(employee.id), second = change(other.id, 16600);
    const result = await refreshPendingPerformanceForWageChanges([first, second, first]);
    expect(result).toMatchObject({ status: "completed", affectedEntryCount: 2, targetFileCount: 1, refreshedFileCount: 1 });
    const stored = getStoredPerformanceFileDetail(detail.id)!;
    expect(stored.entries.find(e => e.employeeCode === employee.employeeCode)?.hourlyRate).toBe(15500);
    expect(stored.entries.find(e => e.employeeCode === other.employeeCode)?.hourlyRate).toBe(16600);
  });

  it.each(["future", "bounded-before-work"])("uses the actual saved effective period: %s", async mode => {
    const { detail, target, employee } = await prepare();
    if (mode === "bounded-before-work") change(employee.id, 16000, "2026-03-01");
    const rate = change(employee.id, 15500, mode === "future" ? "2026-04-01" : "2026-02-01");
    const before = getStoredPerformanceFileDetail(detail.id);
    const result = await refreshPendingPerformanceForWageChanges([rate]);
    expect(result).toMatchObject({ status: "completed", targetFileCount: 0, affectedEntryCount: 0 });
    expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e => e.id === target.id)?.hourlyRate).toBe(target.hourlyRate);
  });

  it("does not re-read a fully approved archive or change its calculations", async () => {
    const { fixture, detail, employee } = await prepare();
    for (const entry of detail.entries) expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const before = getStoredPerformanceFileDetail(detail.id), rows = financial();
    const result = await refreshPendingPerformanceForWageChanges([change(employee.id)]);
    expect(result).toMatchObject({ status: "completed", targetFileCount: 0 });
    expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before); expect(financial()).toEqual(rows);
  });

  it.each(["missing", "corrupt"])("keeps saved wages and cached performance when the source is %s", async mode => {
    const { fixture, detail, employee } = await prepare();
    const rate = change(employee.id), before = getStoredPerformanceFileDetail(detail.id);
    if (mode === "missing") unlinkSync(fixture.filePath); else writeFileSync(fixture.filePath, "not an xlsx");
    const result = await refreshPendingPerformanceForWageChanges([rate]);
    expect(result).toMatchObject({ status: "partial", targetFileCount: 1, refreshedFileCount: 0 });
    expect(result.issues).toHaveLength(1); expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
    expect(listStoredEmployeeWageRates(employee.id).some(r => r.hourlyRate === 15500)).toBe(true);
  });

  it("rolls back a failed replacement so cached entries remain intact", async () => {
    const { detail, employee } = await prepare(); const rate = change(employee.id);
    const before = getStoredPerformanceFileDetail(detail.id), db = getSqliteDatabase()!;
    db.exec("CREATE TRIGGER w06_insert_failure BEFORE INSERT ON performance_entries BEGIN SELECT RAISE(ABORT, 'W06 injected write failure'); END");
    try {
      const result = await refreshPendingPerformanceForWageChanges([rate]);
      expect(result.status).toBe("partial"); expect(result.refreshedFileCount).toBe(0);
      expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
    } finally { db.exec("DROP TRIGGER w06_insert_failure"); }
  });

  it("does not resurrect a file that is approved while a re-read is in flight", async () => {
    const { fixture, detail, employee } = await prepare(); const rate = change(employee.id);
    const original = intake.buildPerformanceFileDetailFromPath;
    vi.spyOn(intake, "buildPerformanceFileDetailFromPath").mockImplementationOnce(async input => {
      const parsed = await original(input);
      for (const entry of detail.entries) expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
      return parsed;
    });
    const result = await refreshPendingPerformanceForWageChanges([rate]);
    expect(result.status).toBe("partial"); expect(result.refreshedFileCount).toBe(0);
    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("approved");
    expect(financial()[0]).toHaveLength(3);
  });

  it("retains the current cache if the original bytes change during parsing", async () => {
    const { fixture, detail, employee } = await prepare(); const rate = change(employee.id);
    const before = getStoredPerformanceFileDetail(detail.id), original = intake.buildPerformanceFileDetailFromPath;
    vi.spyOn(intake, "buildPerformanceFileDetailFromPath").mockImplementationOnce(async input => {
      const parsed = await original(input); const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(fixture.filePath); workbook.worksheets[0].getCell("BE34").value = 2;
      await workbook.xlsx.writeFile(fixture.filePath); return parsed;
    });
    expect((await refreshPendingPerformanceForWageChanges([rate])).status).toBe("partial");
    expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
  });

  it("does no parsing when a bulk apply changed no wages", async () => {
    const parser = vi.spyOn(intake, "buildPerformanceFileDetailFromPath");
    expect(await refreshPendingPerformanceForWageChanges([])).toEqual({ status: "completed", affectedEntryCount: 0, targetFileCount: 0, refreshedFileCount: 0, issues: [] });
    expect(parser).not.toHaveBeenCalled();
  });

  it.each(["same-path-db-reopen", "folder-settings"])("does not commit into changed storage after parsing: %s", async mode => {
    const { fixture, detail, employee } = await prepare(); const rate = change(employee.id);
    const before = getStoredPerformanceFileDetail(detail.id), original = intake.buildPerformanceFileDetailFromPath;
    vi.spyOn(intake, "buildPerformanceFileDetailFromPath").mockImplementationOnce(async input => {
      const parsed = await original(input);
      if (mode === "same-path-db-reopen") { closeSqliteStorage(); initializeSqliteStorage({ dbPath: fixture.dbPath }); }
      else saveStoredAppSettings({ pendingDir: path.join(fixture.rootDir, "new-pending") }, { userDataPath: fixture.userDataPath });
      return parsed;
    });
    const result = await refreshPendingPerformanceForWageChanges([rate]);
    expect(result.status).toBe("partial"); expect(result.refreshedFileCount).toBe(0);
    expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
  });

  it("an older refresh cannot overwrite a newer completed wage refresh after its parse returns", async () => {
    const { detail, employee } = await prepare(); const firstRate = change(employee.id);
    const original = intake.buildPerformanceFileDetailFromPath;
    vi.spyOn(intake, "buildPerformanceFileDetailFromPath").mockImplementationOnce(async input => {
      const parsed = await original(input);
      const latestRate = change(employee.id, 16600);
      expect((await refreshPendingPerformanceForWageChanges([latestRate])).status).toBe("completed");
      return parsed;
    });
    const older = await refreshPendingPerformanceForWageChanges([firstRate]);
    expect(older.status).toBe("partial"); expect(older.refreshedFileCount).toBe(0);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e => e.employeeCode === employee.employeeCode)?.hourlyRate).toBe(16600);
  });
});
