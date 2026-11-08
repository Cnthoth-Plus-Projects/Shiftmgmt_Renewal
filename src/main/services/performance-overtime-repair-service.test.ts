import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetApprovedAllowanceCalculationStateForTest } from "./approved-allowance-calculation-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import { repairStoredOvertimePerformanceData } from "./performance-overtime-repair-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "performance-overtime-repair"
);
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("performance-overtime-repair-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("preserves approved snapshots and historical zero amounts even when their minute analysis is obsolete", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

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

    const database = getSqliteDatabase();
    expect(database).not.toBeNull();

    const approvalRow = database!.prepare(`
      SELECT id, snapshot_json
      FROM performance_approvals
      WHERE entry_id = ?
        AND decision = 'approved'
      ORDER BY processed_at DESC
      LIMIT 1
    `).get(overtimeEntry!.id) as { id: string; snapshot_json: string } | undefined;

    expect(approvalRow).toBeDefined();

    const allowanceRow = database!.prepare(`
      SELECT id, snapshot_json
      FROM allowance_calculations
      WHERE performance_approval_id = ?
    `).get(approvalRow!.id) as { id: string; snapshot_json: string } | undefined;

    expect(allowanceRow).toBeDefined();

    const brokenApprovalSnapshot = JSON.parse(approvalRow!.snapshot_json) as {
      entry: Record<string, unknown>;
    };
    brokenApprovalSnapshot.entry = {
      ...brokenApprovalSnapshot.entry,
      totalWorkMinutes: 240,
      breakMinutes: 60,
      baseWorkMinutes: 240,
      overtimeMinutes: 0,
      nightMinutes: 0,
      workHours: 4
    };

    const brokenCalculationSnapshot = JSON.parse(allowanceRow!.snapshot_json) as {
      breakdown: Record<string, unknown>;
      totalAllowanceAmount: number;
      lines: Array<Record<string, unknown>>;
    };
    brokenCalculationSnapshot.breakdown = {
      ...brokenCalculationSnapshot.breakdown,
      totalWorkMinutes: 240,
      baseWorkMinutes: 240,
      overtimeMinutes: 0,
      nightMinutes: 0
    };
    brokenCalculationSnapshot.totalAllowanceAmount = 0;
    brokenCalculationSnapshot.lines = [];

    database!.prepare(`
      UPDATE performance_entries
      SET total_work_minutes = 240,
          work_hours = 4,
          break_minutes = 60,
          base_work_minutes = 240,
          overtime_minutes = 0,
          night_minutes = 0
      WHERE id = ?
    `).run(overtimeEntry!.id);

    database!.prepare(`
      UPDATE performance_approvals
      SET snapshot_json = ?
      WHERE id = ?
    `).run(JSON.stringify(brokenApprovalSnapshot), approvalRow!.id);

    database!.prepare(`
      UPDATE allowance_calculations
      SET total_work_minutes = 240,
          base_work_minutes = 240,
          overtime_minutes = 0,
          night_minutes = 0,
          total_allowance_amount = 0,
          snapshot_json = ?
      WHERE id = ?
    `).run(JSON.stringify(brokenCalculationSnapshot), allowanceRow!.id);

    database!.prepare(`
      DELETE FROM allowance_calculation_items
      WHERE calculation_id = ?
    `).run(allowanceRow!.id);

    const readHistory = () => ({
      entries: database!.prepare("SELECT * FROM performance_entries ORDER BY id").all(),
      approvals: database!.prepare("SELECT * FROM performance_approvals ORDER BY id").all(),
      calculations: database!.prepare("SELECT * FROM allowance_calculations ORDER BY id").all(),
      items: database!.prepare("SELECT * FROM allowance_calculation_items ORDER BY id").all()
    });
    const before = readHistory();
    for (let restart = 0; restart < 2; restart++) {
      expect(repairStoredOvertimePerformanceData()).toEqual({
        repairedEntryCount: 0, repairedApprovalCount: 0, repairedCalculationCount: 0
      });
      expect(readHistory()).toEqual(before);
    }
  });

  it("still repairs minute analysis for an unapproved entry without financial history", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot(), templateVariant: "sample1" });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const entry = detail.entries.find(entry => entry.section === "overtime")!;
    const database = getSqliteDatabase()!;
    database.prepare("UPDATE performance_entries SET total_work_minutes=240, work_hours=4, break_minutes=60, base_work_minutes=240, overtime_minutes=0, night_minutes=0 WHERE id=?").run(entry.id);
    expect(repairStoredOvertimePerformanceData()).toEqual({
      repairedEntryCount: 1, repairedApprovalCount: 0, repairedCalculationCount: 0
    });
    expect(database.prepare("SELECT break_minutes, base_work_minutes, overtime_minutes, night_minutes FROM performance_entries WHERE id=?").get(entry.id)).toEqual({
      break_minutes: 30, base_work_minutes: 0, overtime_minutes: 120, night_minutes: 150
    });
    expect(repairStoredOvertimePerformanceData().repairedEntryCount).toBe(0);
    expect(database.prepare("SELECT COUNT(*) AS n FROM allowance_calculations").get()).toEqual({n: 0});
  });
});
