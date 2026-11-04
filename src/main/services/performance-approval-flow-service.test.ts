import { existsSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as archiveService from "./performance-file-archive-service";
import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";

import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest
} from "./approved-allowance-calculation-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile,
  returnApprovedPerformanceFileToPending
} from "./performance-approval-flow-service";
import {
  getPerformanceApprovalHistoryByEntryId,
  getLatestPerformanceApprovalByEntryId,
  listPerformanceApprovalHistory,
  resetPerformanceApprovalStateForTest
} from "./performance-approval-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { listPendingPerformanceFiles } from "./performance-queue-service";
import { closeSqliteStorage, initializeSqliteStorage, getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
import { closeStoredEmployeeWageRate, listStoredEmployeeWageRates, saveStoredEmployeeWageRate } from "./employee-history-service";

import * as intake from "./performance-file-intake-service";
import { refreshPendingPerformanceForWageChanges } from "./workforce-wage-performance-service";
import { initializePolicyHistory } from "./policy-history-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "performance-approval-flow");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

const prepareApprovedReturn = async () => {
  const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot() });
  const detail = await syncPreparedReturnedSchedule(fixture);
  for (const entry of detail.entries) expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
  const archived = getStoredPerformanceFileDetail(detail.id)!;
  const target = archived.entries.find(e => e.section === "overtime")!;
  const employee = listStoredEmployees().find(e => e.employeeCode === target.employeeCode)!;
  return { fixture, detail: archived, target, employee };
};
const returnFinancial = () => ["performance_approvals", "allowance_calculations", "allowance_calculation_items"].map(t => getSqliteDatabase()!.prepare(`SELECT * FROM ${t} ORDER BY id`).all());
const previousDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

describe("performance-approval-flow-service", () => {
  it("W-08: an explicit invalidation marker blocks the wage of a real newly parsed workbook", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot() });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const target = detail.entries.find(e => e.section === "overtime")!;
    const employee = listStoredEmployees().find(e => e.employeeCode === target.employeeCode)!;
    const rate = listStoredEmployeeWageRates(employee.id)[0];
    getSqliteDatabase()!.prepare(`INSERT INTO wage_rate_history
      (id,wage_rate_id,employee_id,action_type,hourly_rate,effective_from,effective_to,change_reason,actor_user_id,actor_login_id,actor_display_name,actor_role,occurred_at)
      VALUES ('w08-red',?,?, 'invalidated',?,?,?, '잘못 등록한 시급', 'w08','w08','담당자','admin',?)`)
      .run(rate.id,employee.id,rate.hourlyRate,rate.effectiveFrom,rate.effectiveTo ?? null,new Date().toISOString());
    const parsed = await intake.buildPerformanceFileDetailFromPath({ filePath: fixture.filePath, settings: getStoredAppSettingsSnapshot({ userDataPath: fixture.userDataPath }), forceReparse: true });
    expect(parsed?.entries.find(e => e.id === target.id)?.hourlyRate).toBeUndefined();
  });

  it("W-09 retirement preserves the archive until explicit return, then work-date wages remain blocked",async()=>{
    const {fixture,detail,target,employee}=await prepareApprovedReturn();const before=returnFinancial();
    saveStoredEmployee({...employee,status:"retired",retireDate:target.workDate,hourlyRate:undefined},testAdminSession);
    expect(returnFinancial()).toEqual(before);
    const returned=await returnApprovedPerformanceFileToPending({fileId:detail.id},testAdminSession,{userDataPath:fixture.userDataPath});expect(returned.ok).toBe(true);if(!returned.ok)throw new Error(returned.message);
    expect(returned.data.entries.find(e=>e.id===target.id)?.hourlyRate).toBeUndefined();expect(returned.data.wageReapplication?.unresolvedEntryCount).toBe(1);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id,manualHourlyRate:20000,comment:"퇴사 후 우회 차단"},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(false);
  });

  it("W-08 real invalidation stays off approved snapshots until explicit return then blocks stale reapproval", async () => {
    const {fixture,detail,target,employee}=await prepareApprovedReturn();const before=returnFinancial(), rate=listStoredEmployeeWageRates(employee.id)[0];
    saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:rate.effectiveFrom,hourlyRate:rate.hourlyRate,revision:{operation:"invalidate",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"W08 원본 시급 무효"}},testAdminSession);
    expect(returnFinancial()).toEqual(before);expect(getStoredPerformanceFileDetail(detail.id)?.entries.find(e=>e.id===target.id)?.hourlyRate).toBe(target.hourlyRate);
    const returned=await returnApprovedPerformanceFileToPending({fileId:detail.id},testAdminSession,{userDataPath:fixture.userDataPath});expect(returned.ok).toBe(true);if(!returned.ok)throw new Error(returned.message);
    expect(returned.data.entries.find(e=>e.id===target.id)?.hourlyRate).toBeUndefined();expect(returned.data.wageReapplication?.unresolvedEntryCount).toBe(1);
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(false);
  });

  it("W-07: returning approved source reapplies its work-date wage before immediate reapproval", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot() });
    const detail = await syncPreparedReturnedSchedule(fixture);
    for (const entry of detail.entries) expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const target = detail.entries.find(e => e.section === "overtime")!;
    const employee = listStoredEmployees().find(e => e.employeeCode === target.employeeCode)!;
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 15500, effectiveFrom: target.workDate });
    const returned = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(returned.ok).toBe(true);
    if (!returned.ok) throw new Error(returned.message);
    expect(returned.data.entries.find(e => e.id === target.id)?.hourlyRate).toBe(15500);
    expect(returned.data.entries.find(e => e.id === target.id)?.sourceSignature).toBe(target.sourceSignature);
    expect({ ...returned.data.entries.find(e => e.id === target.id)!, hourlyRate: target.hourlyRate }).toEqual(target);
    expect(returned.data.wageReapplication).toMatchObject({ status: "completed", appliedEntryCount: 3, unresolvedEntryCount: 0, sourceFileMissing: false });
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: target.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    expect(listApprovedAllowanceCalculationResults().find(c => c.entryId === target.id)?.hourlyRate).toBe(15500);
  });

  it.each(["closed", "future-only", "missing-history"])("W-07: %s clears the old positive wage and blocks stale reapproval", async mode => {
    const { fixture, detail, target, employee } = await prepareApprovedReturn();
    const rate = listStoredEmployeeWageRates(employee.id)[0];
    if (mode === "missing-history") getSqliteDatabase()!.prepare("DELETE FROM wage_rates WHERE employee_id = ?").run(employee.id);
    else {
      closeStoredEmployeeWageRate({ employeeId: employee.id, wageRateId: rate.id, effectiveTo: previousDay(target.workDate) });
      if (mode === "future-only") saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 16600, effectiveFrom: "2026-04-01" });
    }
    const returned = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(returned.ok).toBe(true); if (!returned.ok) throw new Error(returned.message);
    expect(returned.data.entries.find(e => e.id === target.id)?.hourlyRate).toBeUndefined();
    expect(returned.data.wageReapplication).toMatchObject({ status: "needs-review", unresolvedEntryCount: 1 });
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: target.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(false);
    expect(listApprovedAllowanceCalculationResults().filter(c => c.fileId === detail.id)).toHaveLength(0);
  });

  it.each(["missing-employee", "invalid-date"])("W-07: %s cannot retain a historical payable wage", async mode => {
    const { fixture, detail, target } = await prepareApprovedReturn();
    if (mode === "missing-employee") getSqliteDatabase()!.prepare("UPDATE performance_entries SET employee_code = 'W07-UNKNOWN' WHERE id = ?").run(target.id);
    else getSqliteDatabase()!.prepare("UPDATE performance_entries SET work_date = '2026-02-30' WHERE id = ?").run(target.id);
    const returned = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(returned.ok).toBe(true); if (!returned.ok) throw new Error(returned.message);
    expect(returned.data.entries.find(e => e.id === target.id)?.hourlyRate).toBeUndefined();
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: target.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(false);
  });

  it.each(["missing-source", "corrupt-source"])("W-07: %s retains cached source fields and applies the current wage", async mode => {
    const { fixture, detail, target, employee } = await prepareApprovedReturn();
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 16600, effectiveFrom: target.workDate });
    if (mode === "missing-source") { const fs = await import("node:fs"); fs.unlinkSync(detail.filePath); }
    else writeFileSync(detail.filePath, "corrupt workbook, cached Excel source retained");
    const returned = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(returned.ok).toBe(true); if (!returned.ok) throw new Error(returned.message);
    const entry = returned.data.entries.find(e => e.id === target.id)!;
    expect(entry.hourlyRate).toBe(16600); expect(entry.sourceSignature).toBe(target.sourceSignature);
    expect(entry.startTime).toBe(target.startTime); expect(entry.totalWorkMinutes).toBe(target.totalWorkMinutes);
    expect(returned.data.wageReapplication?.sourceFileMissing).toBe(mode === "missing-source");
  });

  it("W-07: resets an old manual wage and removes only known wage errors", async () => {
    const { fixture, detail, target, employee } = await prepareApprovedReturn();
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: target.id, manualHourlyRate: 19000, comment: "이전 수동 정정" }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    getSqliteDatabase()!.prepare("UPDATE performance_entries SET hourly_rate = 19000, alert_json = ? WHERE id = ?").run(JSON.stringify([{ severity: "error", message: `${target.employeeName}의 시급 정보가 없습니다.` }, { severity: "warning", message: "증빙 확인 메모" }]), target.id);
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 16600, effectiveFrom: target.workDate });
    const result = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.message);
    const entry = result.data.entries.find(e => e.id === target.id)!;
    expect(entry.hourlyRate).toBe(16600); expect(entry.alerts).toEqual([{ severity: "warning", message: "증빙 확인 메모" }]);
  });

  it("W-07: unrelated blocking source errors survive wage application", async () => {
    const { fixture, detail, target } = await prepareApprovedReturn();
    getSqliteDatabase()!.prepare("UPDATE performance_entries SET alert_json = ? WHERE id = ?").run(JSON.stringify([{ severity: "error", message: "시급 증빙 적용 내용이 원본과 다릅니다." }]), target.id);
    const returned = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(returned.ok).toBe(true); if (!returned.ok) throw new Error(returned.message);
    expect(returned.data.entries.find(e => e.id === target.id)?.alerts).toEqual([{ severity: "error", message: "시급 증빙 적용 내용이 원본과 다릅니다." }]);
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: target.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(false);
  });

  it.each(["proposal-lock", "db-reopen", "settings"])("W-07: %s during the physical move preserves approvals and restores the source", async mode => {
    const { fixture, detail } = await prepareApprovedReturn();
    const before = returnFinancial(), original = archiveService.restoreApprovedPerformanceFileToPending;
    let expected = before;
    vi.spyOn(archiveService, "restoreApprovedPerformanceFileToPending").mockImplementationOnce(async input => {
      const moved = await original(input);
      if (mode === "proposal-lock") { getSqliteDatabase()!.prepare("UPDATE allowance_calculations SET status = 'proposal-approved' WHERE file_id = ?").run(detail.id); expected = returnFinancial(); }
      else if (mode === "db-reopen") { closeSqliteStorage(); initializeSqliteStorage({ dbPath: fixture.dbPath }); }
      else saveStoredAppSettings({ ...getStoredAppSettingsSnapshot({ userDataPath: fixture.userDataPath }), pendingDir: path.join(fixture.rootDir, "changed-pending") }, { userDataPath: fixture.userDataPath });
      return moved;
    });
    const result = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(result.ok).toBe(false); expect(returnFinancial()).toEqual(expected);
    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("approved"); expect(existsSync(detail.filePath)).toBe(true);
  });

  it.each(["ABORT", "ROLLBACK"])("W-07: failed wage replacement (%s) restores financial records and physical source", async failure => {
    const { fixture, detail } = await prepareApprovedReturn(); const before = returnFinancial();
    const db = getSqliteDatabase()!;
    db.exec(`CREATE TRIGGER w07_failed_insert BEFORE INSERT ON performance_entries BEGIN SELECT RAISE(${failure}, 'W07 insert failure'); END`);
    try {
      const result = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
      expect(result.ok).toBe(false); expect(returnFinancial()).toEqual(before);
      expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("approved"); expect(existsSync(detail.filePath)).toBe(true);
    } finally { db.exec("DROP TRIGGER w07_failed_insert"); }
  });

  it("W-07: physical move failure leaves all approval records and source untouched", async () => {
    const { fixture, detail } = await prepareApprovedReturn(); const before = returnFinancial();
    const blocked = path.join(fixture.rootDir, "pending-is-a-file");
    saveStoredAppSettings({ ...getStoredAppSettingsSnapshot({ userDataPath: fixture.userDataPath }), pendingDir: blocked }, { userDataPath: fixture.userDataPath });
    rmdirSync(blocked); writeFileSync(blocked, "not a directory");
    const result = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(result.ok).toBe(false); expect(returnFinancial()).toEqual(before); expect(existsSync(detail.filePath)).toBe(true);
  });

  it("W-07 affected W06: actual folder change after parsing preserves cached entries", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot() });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const target = detail.entries.find(e => e.section === "overtime")!;
    const employee = listStoredEmployees().find(e => e.employeeCode === target.employeeCode)!;
    const rate = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 16600, effectiveFrom: target.workDate });
    const before = getStoredPerformanceFileDetail(detail.id), original = intake.buildPerformanceFileDetailFromPath;
    const changedPending = path.join(fixture.rootDir, "actual-changed-pending");
    vi.spyOn(intake, "buildPerformanceFileDetailFromPath").mockImplementationOnce(async input => {
      const parsed = await original(input);
      saveStoredAppSettings({ ...getStoredAppSettingsSnapshot({ userDataPath: fixture.userDataPath }), pendingDir: changedPending }, { userDataPath: fixture.userDataPath });
      return parsed;
    });
    const result = await refreshPendingPerformanceForWageChanges([rate]);
    expect(getStoredAppSettingsSnapshot({ userDataPath: fixture.userDataPath }).pendingDir).toBe(changedPending);
    expect(result).toMatchObject({ status: "partial", refreshedFileCount: 0 });
    expect(result.issues[0].message).toContain("변경되었습니다");
    expect(getStoredPerformanceFileDetail(detail.id)).toEqual(before);
  });

  it("W-07: rollback never overwrites a new file at the original archive path", async () => {
    const { fixture, detail } = await prepareApprovedReturn(); const before = returnFinancial(), bytes = readFileSync(detail.filePath);
    const original = archiveService.restoreApprovedPerformanceFileToPending; let pendingPath = "";
    vi.spyOn(archiveService, "restoreApprovedPerformanceFileToPending").mockImplementationOnce(async input => {
      const moved = await original(input); pendingPath = moved.pendingFilePath; writeFileSync(detail.filePath, "new unrelated file"); return moved;
    });
    const db = getSqliteDatabase()!; db.exec("CREATE TRIGGER w07_failed_insert BEFORE INSERT ON performance_entries BEGIN SELECT RAISE(ABORT, 'W07 insert failure'); END");
    try {
      const result = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
      expect(result.ok).toBe(false); if (result.ok) throw new Error("Rollback collision must be reported");
      expect(result.message).toContain("복원"); expect(returnFinancial()).toEqual(before);
      expect(readFileSync(detail.filePath, "utf8")).toBe("new unrelated file"); expect(readFileSync(pendingPath)).toEqual(bytes);
    } finally { db.exec("DROP TRIGGER w07_failed_insert"); }
  });

  it("W-07: destination collision and another file's financial history are preserved", async () => {
    const { fixture, detail, target } = await prepareApprovedReturn();
    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(fixture.filePath);
    workbook.worksheets[0].getCell("BE34").value = 2; await workbook.xlsx.writeFile(fixture.filePath);
    const other = await syncPreparedReturnedSchedule(fixture), otherEntry = other.entries.find(e => e.section === "overtime")!;
    expect((await approvePerformanceFile({ fileId: other.id, entryId: otherEntry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const history = listPerformanceApprovalHistory().filter(a => a.fileId === other.id);
    const calculations = listApprovedAllowanceCalculationResults().filter(c => c.fileId === other.id);
    const bytes = readFileSync(fixture.filePath);
    const result = await returnApprovedPerformanceFileToPending({ fileId: detail.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.message);
    expect(result.data.filePath).not.toBe(fixture.filePath); expect(readFileSync(fixture.filePath)).toEqual(bytes);
    expect(result.data.entries.find(e => e.id === target.id)?.sourceSignature).toBe(target.sourceSignature);
    expect(listPerformanceApprovalHistory().filter(a => a.fileId === other.id)).toEqual(history);
    expect(listApprovedAllowanceCalculationResults().filter(c => c.fileId === other.id)).toEqual(calculations);
  });

  it("W-05: explicit different manual rate creates history once; repeating that rate is a no-op", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot() });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const entry = detail.entries.find(e => e.section === "overtime")!;
    const input = { fileId: detail.id, entryId: entry.id };
    expect((await approvePerformanceFile(input, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const original = getPerformanceApprovalHistoryByEntryId(entry.id)[0];
    expect((await approvePerformanceFile({ ...input, manualHourlyRate: 15500, comment: "명시 시급 정정" }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const history = getPerformanceApprovalHistoryByEntryId(entry.id);
    const calculations = listApprovedAllowanceCalculationResults();
    expect(history).toHaveLength(2);
    expect(history).toContainEqual(original);
    expect(JSON.parse(history.find(r => r.id !== original.id)!.snapshotJson).entry.hourlyRate).toBe(15500);
    expect(calculations.some(c => c.entryId === entry.id && c.hourlyRate === 15500)).toBe(true);
    const duplicate = await approvePerformanceFile({ ...input, manualHourlyRate: 15500, comment: "같은 시급 반복" }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    expect(getPerformanceApprovalHistoryByEntryId(entry.id)).toEqual(history);
    expect(listApprovedAllowanceCalculationResults()).toEqual(calculations);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should approve a single row while keeping the file pending until all rows are processed", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries[0];

    expect(targetEntry).toBeDefined();

    const result = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        comment: "1차 확인"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);
    expect(getLatestPerformanceApprovalByEntryId(targetEntry!.id)?.decision).toBe("approved");
    expect(getStoredPerformanceFileDetail(detail.id)?.approvedEntryCount).toBe(1);
    expect(getStoredPerformanceFileDetail(detail.id)?.status).toBe("pending");
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(1);
    expect(listApprovedAllowanceCalculationResults()[0]?.entryId).toBe(targetEntry!.id);

    const pendingItems = await listPendingPerformanceFiles();

    expect(pendingItems).toHaveLength(1);
    expect(pendingItems[0]?.approvedEntryCount).toBe(1);
  });

  it("should ignore pool substitute rows for approval progress and allowance results", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const visibleEntries = detail.entries.filter((entry) => entry.section !== "substitute");

    expect(detail.entryCount).toBe(2);
    expect(detail.entries.find((entry) => entry.section === "substitute")?.isPoolWorker).toBe(true);

    for (const entry of visibleEntries) {
      const result = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.status).toBe("approved");
    expect(archivedDetail?.approvedEntryCount).toBe(2);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(2);
    expect(
      listApprovedAllowanceCalculationResults().some((item) => item.workType === "substitute")
    ).toBe(false);
  });

  it("should still block an identical duplicate approval for the same entry", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry).toBeDefined();

    const firstResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(firstResult.ok).toBe(true);

    const duplicateResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) {
      throw new Error("중복 승인 요청이 성공하면 안 됩니다.");
    }
    expect(duplicateResult.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
  });

  it("should allow reapproval for the same pending entry when a manual hourly rate is newly assigned", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry).toBeDefined();

    const firstResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(firstResult.ok).toBe(true);

    const reapproveResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        comment: "재승인 보정",
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(reapproveResult.ok).toBe(true);

    const approvalHistory = getPerformanceApprovalHistoryByEntryId(targetEntry!.id);
    const calculations = listApprovedAllowanceCalculationResults().filter(
      (item) => item.entryId === targetEntry!.id
    );

    expect(approvalHistory).toHaveLength(2);
    expect(
      approvalHistory.some(
        (record) =>
          record.comment?.includes("재승인 보정") && record.comment.includes("시급 임의지정 15,500원")
      )
    ).toBe(true);
    expect(calculations.some((item) => item.hourlyRate === 15500)).toBe(true);
  });

  it("should archive the file and mark it effective after every parsed row is approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.status).toBe("approved");
    expect(archivedDetail?.isEffective).toBe(true);
    expect(archivedDetail?.approvedEntryCount).toBe(detail.entries.length);
    expect(archivedDetail?.filePath).toContain(path.resolve(fixture.approvedDir, "2026년", "3월"));
    expect(existsSync(archivedDetail?.filePath ?? "")).toBe(true);
  });

  it("should not create a reapproval record when identical approved content is restaged", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    const secondDetail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(secondDetail.id).not.toBe(firstDetail.id);
    expect(targetEntry).toBeDefined();

    const duplicateResult = await approvePerformanceFile(
      {
        fileId: secondDetail.id,
        entryId: targetEntry!.id,
        comment: "동일 파일 재확인"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) {
      throw new Error("동일 승인본 재투입이 재승인으로 처리되면 안 됩니다.");
    }
    expect(duplicateResult.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    expect(getLatestPerformanceApprovalByEntryId(targetEntry!.id)).toBeNull();
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(firstDetail.entries.length);
  });

  it("should keep a fully re-approved pending file in place until the operator finalizes it", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    expect(secondDetail.id).not.toBe(firstDetail.id);
    expect(secondDetail.alerts.some((alert) => alert.message.includes("파일이 이미"))).toBe(true);

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: secondDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    const allDetails = listStoredPerformanceFileDetails().filter(
      (item) => item.scheduleMonth === "2026-03" && item.siteName === "보라매DC"
    );
    const firstApproved = allDetails.find((item) => item.id === firstDetail.id);
    const secondApproved = allDetails.find((item) => item.id === secondDetail.id);

    expect(allDetails).toHaveLength(2);
    expect(firstApproved?.status).toBe("approved");
    expect(firstApproved?.isEffective).toBe(true);
    expect(secondApproved?.directoryType).toBe("pending");
    expect(secondApproved?.status).toBe("pending");
    expect(secondApproved?.isEffective).toBe(false);
  });

  it("should detect an approved archive even when legacy schedule keys include directory suffixes", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    const database = getSqliteDatabase()!;
    const legacyBaseScheduleKey = firstDetail.scheduleKey;

    database
      .prepare("UPDATE performance_files SET schedule_key = ? WHERE id = ?")
      .run(`${legacyBaseScheduleKey}:approved`, firstDetail.id);

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    database
      .prepare("UPDATE performance_files SET schedule_key = ? WHERE id = ?")
      .run(`${legacyBaseScheduleKey}:pending`, secondDetail.id);

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: secondDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    const restagedDetail = getStoredPerformanceFileDetail(secondDetail.id);

    expect(restagedDetail?.directoryType).toBe("pending");
    expect(restagedDetail?.status).toBe("pending");
  });

  it("should block finalize when some reapproval rows were not individually re-approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    const reapproveResult = await approvePerformanceFile(
      {
        fileId: secondDetail.id,
        entryId: overtimeEntry!.id,
        comment: "재승인 보정"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(reapproveResult.ok).toBe(true);

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      {
        fileId: secondDetail.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(finalizeResult.ok).toBe(false);
    if (finalizeResult.ok) {
      throw new Error("일부 행만 재승인된 파일이 확정되었습니다.");
    }
    expect(finalizeResult.errorCode).toBe("PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED");
    expect(finalizeResult.message).toContain("현재 파일 기준으로 다시 승인해야 합니다.");

    const storedDetail = getStoredPerformanceFileDetail(secondDetail.id);

    expect(storedDetail?.directoryType).toBe("pending");
    expect(storedDetail?.status).toBe("pending");
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === secondDetail.id)
    ).toHaveLength(1);
  });

  it("should allow reapproval with a manually assigned hourly rate and keep the note in approval history", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE wage_rates
      SET effective_from = '2026-03-21',
          effective_to = NULL
    `).run();

    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry).toBeDefined();

    const result = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        comment: "재승인 보정",
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);

    const approval = getLatestPerformanceApprovalByEntryId(targetEntry!.id);

    expect(approval?.comment).toContain("재승인 보정");
    expect(approval?.comment).toContain("시급 임의지정 15,500원");

    const calculation = listApprovedAllowanceCalculationResults()[0];

    expect(calculation?.entryId).toBe(targetEntry!.id);
    expect(calculation?.hourlyRate).toBe(15500);
    expect(calculation?.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should allow reapproval with a manual hourly rate even when the restaged row reports missing wage information", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const restagedDetail = await syncPreparedReturnedSchedule(fixture);
    const reapprovalEntry = restagedDetail.entries.find((entry) => entry.section === "overtime");

    expect(reapprovalEntry).toBeDefined();

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE performance_entries
      SET hourly_rate = NULL,
          alert_json = ?
      WHERE id = ?
    `).run(
      JSON.stringify([
        {
          severity: "error",
          message: `${reapprovalEntry!.employeeName}의 시급 정보가 없습니다.`
        }
      ]),
      reapprovalEntry!.id
    );

    const result = await approvePerformanceFile(
      {
        fileId: restagedDetail.id,
        entryId: reapprovalEntry!.id,
        comment: "재승인 보정",
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);

    const approval = getLatestPerformanceApprovalByEntryId(reapprovalEntry!.id);
    const calculation = listApprovedAllowanceCalculationResults().find(
      (item) => item.entryId === reapprovalEntry!.id
    );

    expect(approval?.comment).toContain("재승인 보정");
    expect(approval?.comment).toContain("시급 임의지정 15,500원");
    expect(calculation?.hourlyRate).toBe(15500);
    expect(calculation?.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should re-enable approval for a hand-moved orphan whose approved source is gone", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: firstDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    const firstApproved = getStoredPerformanceFileDetail(firstDetail.id);

    expect(firstApproved?.directoryType).toBe("approved");

    // A byte-identical copy is left back in the pending tree (a hand-move): new fileId, same logicalKeys.
    await restageReturnedScheduleFixture(fixture);
    const secondDetail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(secondDetail.id).not.toBe(firstDetail.id);
    expect(overtimeEntry).toBeDefined();

    // Control: while the approved source file STILL exists, the prior approval must keep blocking it.
    const blocked = await approvePerformanceFile(
      { fileId: secondDetail.id, entryId: overtimeEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(blocked.ok).toBe(false);
    if (blocked.ok) {
      throw new Error("승인본이 살아 있는데 재승인이 열리면 안 됩니다.");
    }
    expect(blocked.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");

    const database = getSqliteDatabase()!;

    // Guard: when the recorded source path's CONTAINING FOLDER is also unreachable (a momentarily
    // offline network/cloud 승인완료 folder), this must NOT look like a missing source and must keep
    // blocking — otherwise a whole-share outage would mass-unlock reapproval.
    database
      .prepare("UPDATE performance_files SET file_path = ? WHERE id = ?")
      .run(path.resolve(fixture.approvedDir, "offline-share", "gone.xlsx"), firstDetail.id);

    const stillBlocked = await approvePerformanceFile(
      { fileId: secondDetail.id, entryId: overtimeEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(stillBlocked.ok).toBe(false);
    if (stillBlocked.ok) {
      throw new Error("승인완료 폴더가 통째로 안 보일 때 재승인이 열리면 안 됩니다.");
    }
    expect(stillBlocked.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");

    // The user hand-moved the approved workbook out of 승인완료: the recorded source file no longer
    // exists on disk, but its containing folder (approvedDir) is still reachable — the genuine
    // hand-moved-orphan signature. Point it at a missing file inside that existing folder.
    database
      .prepare("UPDATE performance_files SET file_path = ? WHERE id = ?")
      .run(path.resolve(fixture.approvedDir, "hand-moved-away.xlsx"), firstDetail.id);

    expect(existsSync(getStoredPerformanceFileDetail(firstDetail.id)?.filePath ?? "x")).toBe(false);

    // FIX B: the orphaned approval no longer shadows the pending file, so it becomes re-approvable.
    const recovered = await approvePerformanceFile(
      { fileId: secondDetail.id, entryId: overtimeEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(recovered.ok).toBe(true);
  });

  it("should block returning a file to pending when it is not currently approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    const result = await returnApprovedPerformanceFileToPending(
      { fileId: detail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("승인대기 파일을 되돌릴 수 있으면 안 됩니다.");
    }
    expect(result.errorCode).toBe("PERFORMANCE_RETURN_TO_PENDING_BLOCKED");
  });

  it("should cleanly return an approved file to pending and wipe its prior approvals", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    const archived = getStoredPerformanceFileDetail(detail.id);

    expect(archived?.directoryType).toBe("approved");
    expect(archived?.isEffective).toBe(true);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === detail.id).length
    ).toBeGreaterThan(0);

    const returnResult = await returnApprovedPerformanceFileToPending(
      { fileId: detail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(returnResult.ok).toBe(true);

    const restored = getStoredPerformanceFileDetail(detail.id);

    expect(restored?.directoryType).toBe("pending");
    expect(restored?.status).toBe("pending");
    expect(restored?.approvedEntryCount).toBe(0);
    expect(restored?.isEffective).toBe(false);

    // Clean undo: the file's prior approvals and allowance calculations are gone.
    expect(
      listPerformanceApprovalHistory().filter((approval) => approval.fileId === detail.id)
    ).toHaveLength(0);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === detail.id)
    ).toHaveLength(0);

    // The file is freshly re-approvable, with no PERFORMANCE_ALREADY_APPROVED deadlock.
    const reapprove = await approvePerformanceFile(
      { fileId: detail.id, entryId: detail.entries[0]!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(reapprove.ok).toBe(true);
  });

  it("should block finalizing a first-time file over an existing approved copy of the same schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: firstDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    expect(getStoredPerformanceFileDetail(firstDetail.id)?.isEffective).toBe(true);

    // Stage a second pending file for the SAME 근무지·월. Removing the first file's approval records
    // makes the second file a genuine first-time file (its rows have no prior approval) that merely
    // shares the schedule_key — the disjoint-sibling shape.
    await restageReturnedScheduleFixture(fixture);
    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    expect(secondDetail.id).not.toBe(firstDetail.id);

    getSqliteDatabase()!
      .prepare("DELETE FROM performance_approvals WHERE file_id = ?")
      .run(firstDetail.id);

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: secondDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    // The second file stayed pending (an approved sibling blocks auto-archive); finalizing it must be
    // refused so it cannot flip the existing approved copy's effective flag off.
    const stored = getStoredPerformanceFileDetail(secondDetail.id);
    expect(stored?.directoryType).toBe("pending");

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: secondDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(false);
    if (finalizeResult.ok) {
      throw new Error("같은 일정의 승인완료본이 있는데 첫 확정이 통과되면 안 됩니다.");
    }
    expect(finalizeResult.errorCode).toBe("PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED");

    // The original approved copy keeps its effective flag.
    expect(getStoredPerformanceFileDetail(firstDetail.id)?.isEffective).toBe(true);
  });

  it("should block approving non-payable performance entries (Pool / BP / unassigned code)", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase()!;

    // 1. Pool 행으로 갱신 후 승인 시도 -> 차단
    database.prepare("UPDATE performance_entries SET is_pool_worker = 1 WHERE id = ?").run(detail.entries[0]!.id);
    const poolResult = await approvePerformanceFile(
      { fileId: detail.id, entryId: detail.entries[0]!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );
    expect(poolResult.ok).toBe(false);
    expect(poolResult.errorCode).toBe("PERFORMANCE_APPROVAL_BLOCKED");
    expect(poolResult.message).toContain("Pool");

    // 2. BP 행으로 갱신 후 승인 시도 -> 차단
    database.prepare("UPDATE performance_entries SET is_pool_worker = 0, employee_name = 'BP(홍길동)' WHERE id = ?").run(detail.entries[0]!.id);
    const bpResult = await approvePerformanceFile(
      { fileId: detail.id, entryId: detail.entries[0]!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );
    expect(bpResult.ok).toBe(false);
    expect(bpResult.errorCode).toBe("PERFORMANCE_APPROVAL_BLOCKED");
    expect(bpResult.message).toContain("BP");

    // 3. 무사번 비-BP 행으로 갱신 후 승인 시도 -> 차단
    database.prepare("UPDATE performance_entries SET is_pool_worker = 0, employee_name = '홍길동', employee_code = '' WHERE id = ?").run(detail.entries[0]!.id);
    const noCodeResult = await approvePerformanceFile(
      { fileId: detail.id, entryId: detail.entries[0]!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );
    expect(noCodeResult.ok).toBe(false);
    expect(noCodeResult.errorCode).toBe("PERFORMANCE_APPROVAL_BLOCKED");
    expect(noCodeResult.message).toContain("사번");
  });

  it("PH-R09: should reject approval with POLICY_CONFLICT when expectedPolicyFingerprint does not match and record used event on success", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    initializePolicyHistory(database, {
      legacySubstituteDate: "2026-07-01",
      legacyChangedDate: "2026-07-01",
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const entry = detail.entries.find((e) => e.section === "substitute" && e.appliedPolicies?.bindings?.length);
    expect(entry).toBeDefined();

    // 1. fingerprint 불일치 시 거절
    const conflictResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: entry!.id,
        expectedPolicyFingerprint: "wrong-fingerprint"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath,
        requireExpectedPolicyFingerprint: true
      }
    );

    expect(conflictResult.ok).toBe(false);
    expect(conflictResult.errorCode).toBe("POLICY_CONFLICT");

    // 2. fingerprint 일치 시 승인 성공 및 used 이벤트 기록 확인
    const successResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: entry!.id,
        expectedPolicyFingerprint: entry!.appliedPolicies!.fingerprint
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath,
        requireExpectedPolicyFingerprint: true
      }
    );

    expect(successResult.ok).toBe(true);
    const usedEvents = database.prepare("SELECT * FROM policy_events WHERE event_type = 'used' AND related_approval_id = ?").all(successResult.data!.id);
    expect(usedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
