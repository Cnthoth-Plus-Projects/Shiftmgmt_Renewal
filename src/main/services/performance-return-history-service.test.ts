import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approvePerformanceFile, returnApprovedPerformanceFileToPending } from "./performance-approval-flow-service";
import { listAllowanceCalculationHistory, resetApprovedAllowanceCalculationStateForTest } from "./approved-allowance-calculation-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { getStoredPerformanceFileDetail, resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import { prepareReturnedScheduleFixture, syncPreparedReturnedSchedule, resetPreparedReturnedScheduleRoot, testAdminSession } from "./performance-test-helpers";
import { closeSqliteStorage, getSqliteDatabase, resetSqliteStorageForTest, initializeSqliteStorage } from "./sqlite-storage-service";
import * as fileArchive from "./performance-file-archive-service";
import { listStoredEmployees } from "./employee-storage-service";
import { saveStoredEmployeeWageRate } from "./employee-history-service";
import { initializePolicyHistory } from "./policy-history-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { checkDatabaseMigrationRequirements, previewDatabaseMigrationUpdate, runDatabaseMigrationUpdate } from "./database-migration-service";
import { listPerformanceReturnHistoryForFile, parsePerformanceReturnSnapshot, RETURN_SNAPSHOT_TABLES } from "./performance-return-history-service";

const roots: string[] = [];
const database = () => getSqliteDatabase()!;
const historyRows = () => database().prepare("SELECT * FROM performance_return_history ORDER BY rowid").all();
const financial = () => ["performance_files", "performance_entries", "performance_approvals", "allowance_calculations", "allowance_calculation_items", "allowance_approvals"].map(table => JSON.parse(JSON.stringify(database().prepare(`SELECT * FROM ${table} ORDER BY id`).all())));
const prepare = async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-cancellation-test-")); roots.push(root);
  const fixture = await prepareReturnedScheduleFixture({ rootDir: root });
  initializePolicyHistory(database());
  const detail = await syncPreparedReturnedSchedule(fixture);
  for (const entry of detail.entries) expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
  return { fixture, detail: getStoredPerformanceFileDetail(detail.id)! };
};
const reason = "원본 시급 확인 후 재승인 <기록>";
const performReturn = (fixture: Awaited<ReturnType<typeof prepare>>["fixture"], fileId: string) => returnApprovedPerformanceFileToPending({ fileId, reason }, testAdminSession, { userDataPath: fixture.userDataPath });

afterEach(() => {
  vi.restoreAllMocks(); closeSqliteStorage(); resetSqliteStorageForTest();
  resetPerformanceFileStorageForTest(); resetPerformanceApprovalStateForTest(); resetApprovedAllowanceCalculationStateForTest();
  for (const root of roots.splice(0)) resetPreparedReturnedScheduleRoot(root);
});

describe("approval cancellation archive through actual Excel intake", () => {
  it("atomically preserves original rows, snapshots, amounts and actor; reapproval keeps separate active totals", async () => {
    const { fixture, detail } = await prepare();
    const original = Object.fromEntries(RETURN_SNAPSHOT_TABLES.map(table => [table, JSON.parse(JSON.stringify(database().prepare(`SELECT * FROM ${table}`).all()))]));
    const oldCalculations = listAllowanceCalculationHistory();
    const target = detail.entries[0], employee = listStoredEmployees().find(person => person.employeeCode === target.employeeCode)!;
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: target.hourlyRate! + 2345, effectiveFrom: target.workDate, reason: "취소 후 재승인 차액 검증" }, testAdminSession);
    const result = await performReturn(fixture, detail.id); expect(result.ok).toBe(true);
    const stored = historyRows()[0];
    const snapshot = parsePerformanceReturnSnapshot(stored);
    for (const table of RETURN_SNAPSHOT_TABLES) expect([...snapshot.tables[table]].sort((a,b) => String(a.id).localeCompare(String(b.id)))).toEqual([...original[table]].sort((a,b) => String(a.id).localeCompare(String(b.id))));
    expect(snapshot.actor.userId).toBe(testAdminSession.userId); expect(stored.reason).toBe(reason);
    expect(listAllowanceCalculationHistory()).toEqual([]);
    const archivedBefore = JSON.stringify(stored);
    const events = listPerformanceReturnHistoryForFile(detail.id); expect(events).toHaveLength(1);
    expect(events[0].entries.flatMap(entry => entry.calculations).map(calc => calc.id).sort()).toEqual(oldCalculations.map(calc => calc.id).sort());
    const pending = getStoredPerformanceFileDetail(detail.id)!;
    for (const entry of pending.entries) expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    expect(listAllowanceCalculationHistory()).toHaveLength(oldCalculations.length);
    expect(listAllowanceCalculationHistory().some(calc => oldCalculations.some(old => old.id === calc.id))).toBe(false);
    expect(listAllowanceCalculationHistory().find(calc => calc.entryId === target.id)?.hourlyRate).toBe(target.hourlyRate! + 2345);
    expect(JSON.stringify(historyRows()[0])).toBe(archivedBefore);
    expect((await performReturn(fixture, detail.id)).ok).toBe(true); expect(historyRows()).toHaveLength(2);
    expect(JSON.stringify(historyRows()[0])).toBe(archivedBefore);
  });

  it.each(["performance_return_history", "allowance_calculations"])("failure at %s rolls back archive, file status, approvals, items and the moved workbook", async table => {
    const { fixture, detail } = await prepare(), before = financial();
    database().exec(`CREATE TEMP TRIGGER fail_cancellation BEFORE ${table === "performance_return_history" ? "INSERT" : "DELETE"} ON ${table} BEGIN SELECT RAISE(ABORT, 'controlled cancellation failure'); END`);
    const result = await performReturn(fixture, detail.id); expect(result.ok).toBe(false);
    expect(financial()).toEqual(before); expect(historyRows()).toEqual([]); expect(existsSync(detail.filePath)).toBe(true);
  });

  it("refuses blank/oversized reasons and operator/planner actors without moving or writing", async () => {
    const { fixture, detail } = await prepare(), before = financial();
    for (const value of [undefined, "  ", "x".repeat(501)]) expect((await returnApprovedPerformanceFileToPending({ fileId: detail.id, reason: value }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(false);
    for (const role of ["operator", "planner"] as const) expect((await returnApprovedPerformanceFileToPending({ fileId: detail.id, reason }, { ...testAdminSession, role }, { userDataPath: fixture.userDataPath })).ok).toBe(false);
    expect(financial()).toEqual(before); expect(historyRows()).toEqual([]); expect(existsSync(detail.filePath)).toBe(true);
  });

  it("concurrent returns create exactly one event and leave the file in the successful pending location", async () => {
    const { fixture, detail } = await prepare();
    const results = await Promise.all([performReturn(fixture, detail.id), performReturn(fixture, detail.id)]);
    expect(results.filter(result => result.ok)).toHaveLength(1); expect(historyRows()).toHaveLength(1);
    const current = getStoredPerformanceFileDetail(detail.id)!; expect(current.directoryType).toBe("pending"); expect(existsSync(current.filePath)).toBe(true);
  });

  it("archives every legacy calculation version and removes every active row for the canceled approval", async () => {
    const { fixture, detail } = await prepare();
    const row = database().prepare("SELECT * FROM allowance_calculations LIMIT 1").get()!;
    const extra = { ...row, id: randomUUID(), signature: randomUUID(), calculation_version: 2 };
    const cols = Object.keys(extra); database().prepare(`INSERT INTO allowance_calculations(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...Object.values(extra) as Array<string | number | null>);
    expect((await performReturn(fixture, detail.id)).ok).toBe(true);
    const archived = parsePerformanceReturnSnapshot(historyRows()[0]);
    expect(archived.tables.allowance_calculations.some(calc => calc.id === extra.id)).toBe(true); expect(listAllowanceCalculationHistory()).toEqual([]);
  });

  it("a prior locked calculation version blocks the whole file even when another version is not locked", async () => {
    const { fixture, detail } = await prepare();
    const row = database().prepare("SELECT * FROM allowance_calculations LIMIT 1").get()!;
    const extra = { ...row, id: randomUUID(), signature: randomUUID(), status: "proposal-approved", calculation_version: 2 };
    const columns = Object.keys(extra); database().prepare(`INSERT INTO allowance_calculations(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`).run(...Object.values(extra) as Array<string | number | null>);
    const before = financial(); const result = await performReturn(fixture, detail.id);
    expect(result.ok).toBe(false); expect(financial()).toEqual(before); expect(historyRows()).toEqual([]); expect(existsSync(detail.filePath)).toBe(true);
  });

  it("reconnection cannot bypass the physical file lock or steal the first request's moved workbook", async () => {
    const { fixture, detail } = await prepare();
    const actual = fileArchive.restoreApprovedPerformanceFileToPending;
    let moved!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { moved = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(fileArchive, "restoreApprovedPerformanceFileToPending").mockImplementationOnce(async input => { const result = await actual(input); moved(); await gate; return result; });
    const first = performReturn(fixture, detail.id); await reached;
    closeSqliteStorage(); initializeSqliteStorage({ dbPath: fixture.dbPath, userDataPath: fixture.userDataPath });
    const second = await performReturn(fixture, detail.id); expect(second.ok).toBe(false);
    release(); expect((await first).ok).toBe(false); expect(historyRows()).toEqual([]);
    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("approved"); expect(existsSync(detail.filePath)).toBe(true);
    expect((await performReturn(fixture, detail.id)).ok).toBe(true); expect(historyRows()).toHaveLength(1);
    expect(existsSync(getStoredPerformanceFileDetail(detail.id)!.filePath)).toBe(true);
  });

  it("revocation during the actual workbook move restores the file with no cancellation history", async () => {
    const { fixture, detail } = await prepare(), before = financial();
    const actual = fileArchive.restoreApprovedPerformanceFileToPending;
    let moved!: () => void, release!: () => void, authorized = true;
    const reached = new Promise<void>(resolve => { moved = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(fileArchive, "restoreApprovedPerformanceFileToPending").mockImplementationOnce(async input => { const result = await actual(input); moved(); await gate; return result; });
    const pending = returnApprovedPerformanceFileToPending({ fileId: detail.id, reason }, testAdminSession, { userDataPath: fixture.userDataPath, isSessionCurrent: () => authorized });
    await reached; authorized = false; release(); const result = await pending;
    expect(result.ok).toBe(false); if (!result.ok) expect(result.errorCode).toBe("AUTH_SESSION_REQUIRED");
    expect(financial()).toEqual(before); expect(historyRows()).toEqual([]); expect(existsSync(detail.filePath)).toBe(true);
  });

  it("round-trips complete cancellation bytes in JSON3; rejects corruption and dangling archived references before replacement", async () => {
    const { fixture, detail } = await prepare(); expect((await performReturn(fixture, detail.id)).ok).toBe(true);
    const before = JSON.parse(JSON.stringify(historyRows()));
    const backup = await runDatabaseBackupNow({ userDataPath: fixture.userDataPath });
    expect(backup.schemaVersion).toBe("3"); expect(backup.tableCount).toBe(43);
    const payload = JSON.parse(readFileSync(backup.jsonBackupPath, "utf8"));
    for (const corrupt of ["hash", "calculation", "approval-entry"]) {
      const modified = structuredClone(payload), row = modified.tables.performance_return_history[0];
      if (corrupt === "hash") row.snapshot_sha256 = "0".repeat(64);
      else { const snapshot = JSON.parse(row.snapshot_json); if (corrupt === "calculation") snapshot.tables.allowance_calculations[0].performance_approval_id = "missing"; else snapshot.tables.performance_approvals[0].entry_id = "unrelated-entry"; row.snapshot_json = JSON.stringify(snapshot); row.snapshot_sha256 = createHash("sha256").update(row.snapshot_json).digest("hex"); }
      const file = path.join(fixture.rootDir, "corrupt-" + corrupt + ".json"); writeFileSync(file, JSON.stringify(modified));
      expect(checkDatabaseMigrationRequirements({ userDataPath: fixture.userDataPath, backupFilePath: file }).isReady).toBe(false); expect(JSON.parse(JSON.stringify(historyRows()))).toEqual(before);
    }
    const preview = previewDatabaseMigrationUpdate({ userDataPath: fixture.userDataPath, backupFilePath: backup.jsonBackupPath });
    await runDatabaseMigrationUpdate({ userDataPath: fixture.userDataPath, backupFilePath: backup.jsonBackupPath, backupSha256: preview.backupSha256, previewToken: preview.previewToken, confirmationText: "교체" });
    expect(JSON.parse(JSON.stringify(historyRows()))).toEqual(before); expect(listPerformanceReturnHistoryForFile(detail.id)).toHaveLength(1);
  });
});
