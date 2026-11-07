import { existsSync, renameSync, copyFileSync, unlinkSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { listApprovedAllowanceCalculationResults } from "./approved-allowance-calculation-service";
import {
  getPerformanceComparison,
  listPerformanceOverview
} from "./performance-management-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile
} from "./performance-approval-flow-service";
import { getStoredPerformanceFileDetail, upsertPerformanceFileDetail } from "./performance-file-storage-service";
import { buildPerformanceFileDetailFromPath } from "./performance-file-intake-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredEmployees } from "./employee-storage-service";
import { saveStoredEmployeeWageRate } from "./employee-history-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "performance-management");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("performance-management-service", () => {
  it("FLOW-02: legacy folder-only approval flags cannot produce approved rows or counts", async () => {
    const fixture = await prepareReturnedScheduleFixture({rootDir: createTestRoot()});
    const approvedPath = path.join(fixture.approvedDir, fixture.fileName);
    copyFileSync(fixture.filePath, approvedPath);
    unlinkSync(fixture.filePath);
    const settings = {pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir};
    const detail = (await buildPerformanceFileDetailFromPath({filePath: approvedPath, settings}))!;
    expect(detail.status).toBe("parsed");
    expect(detail.approvedEntryCount).toBe(0);
    // Recreate only the old cache flags from this real intake; no approval/calculation is invented.
    upsertPerformanceFileDetail({...detail, status: "approved", approvedEntryCount: detail.entryCount});
    const cached = getStoredPerformanceFileDetail(detail.id)!;
    expect(cached.status).toBe("parsed");
    expect(cached.approvedEntryCount).toBe(0);
    expect(cached.entries.every(entry => entry.status === "pending")).toBe(true);
    const overview = await listPerformanceOverview({scheduleMonth: "2026-03", approvalScope: "approved"}, settings);
    expect(overview.groups.flatMap(group => group.rows)).toEqual([]);
    expect(overview.syncIssues.some(issue => issue.message.includes("실제 승인·수당 계산 기록"))).toBe(true);
    expect(getSqliteDatabase()!.prepare("SELECT COUNT(*) AS n FROM performance_approvals").get()?.n).toBe(0);
    expect(listApprovedAllowanceCalculationResults()).toEqual([]);
  });

  it("W-05: wage-only real XLSX reread preserves historic approvals, displayed rate and calculations", async () => {
    const fixture = await prepareReturnedScheduleFixture({ rootDir: createTestRoot() });
    const first = await syncPreparedReturnedSchedule(fixture);
    for (const entry of first.entries) expect((await approvePerformanceFile({ fileId: first.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const db = getSqliteDatabase()!;
    const tables = ["performance_approvals", "allowance_calculations", "allowance_calculation_items"];
    const snapshot = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const before = snapshot();
    const schema = db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    const target = first.entries.find(e => e.section === "overtime")!;
    const employee = listStoredEmployees().find(e => e.employeeCode === target.employeeCode)!;
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 15500, effectiveFrom: "2026-03-01", reason: "W05 시급만 정정" });
    await restageReturnedScheduleFixture(fixture);
    const current = await syncPreparedReturnedSchedule(fixture);
    const reread = current.entries.find(e => e.logicalKey === target.logicalKey)!;
    expect(reread.hourlyRate).toBe(15500);
    const overview = await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir });
    const row = overview.groups.flatMap(g => g.rows).find(r => r.logicalKey === target.logicalKey)!;
    expect(row.approvalStatus).toBe("approved");
    expect(row.needsReapproval).toBe(false);
    expect(row.reapprovalStatus).toBe("none");
    expect(row.canApprove).toBe(false);
    expect(row.entry.hourlyRate).toBe(target.hourlyRate);
    expect(row.entry.startTime).toBe(reread.startTime);
    expect(row.entry.endTime).toBe(reread.endTime);
    expect(row.entry.dutyCode).toBe(reread.dutyCode);
    expect(overview.reapprovalFiles).toHaveLength(0);
    const comparison = getPerformanceComparison({ fileId: current.id, entryId: reread.id })!;
    expect(comparison.currentEntry.hourlyRate).toBe(15500);
    expect(comparison.approvedEntry?.hourlyRate).toBe(target.hourlyRate);
    expect(comparison.approvedCalculation?.hourlyRate).toBe(target.hourlyRate);
    expect(snapshot()).toEqual(before);
    expect(db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
    const duplicate = await approvePerformanceFile({ fileId: current.id, entryId: reread.id }, testAdminSession, { userDataPath: fixture.userDataPath });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    expect(snapshot()).toEqual(before);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(fixture.filePath);
    (workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0]).getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);
    const changed = await syncPreparedReturnedSchedule(fixture);
    const edited = changed.entries.find(e => e.section === "overtime")!;
    const changedOverview = await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir });
    expect(changedOverview.groups.flatMap(g => g.rows).find(r => r.entryId === edited.id)?.needsReapproval).toBe(true);
    const sibling = changedOverview.groups.flatMap(g => g.rows).find(r => r.fileId === changed.id && r.entryId !== edited.id)!;
    expect(sibling.needsReapproval).toBe(false);
    expect(sibling.reapprovalStatus).toBe("pending");
    expect(snapshot()).toEqual(before);
    expect((await approvePerformanceFile({ fileId: changed.id, entryId: edited.id, manualHourlyRate: 16000, comment: "원본 수정 후 명시 정정" }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    expect(listApprovedAllowanceCalculationResults().some(c => c.entryId === edited.id && c.hourlyRate === 16000)).toBe(true);
    expect((await approvePerformanceFile({ fileId: changed.id, entryId: sibling.entryId }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    expect((await approvePerformanceFile({ fileId: changed.id, entryId: sibling.entryId }, testAdminSession, { userDataPath: fixture.userDataPath })).errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    for (let i = 0; i < tables.length; i++) for (const old of before[i]) expect(snapshot()[i]).toContainEqual(old);
  }, 30_000);

  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should group pending rows by site and sort them by work date before team label", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.siteCount).toBe(1);
    expect(overview.rowCount).toBe(3);
    expect(overview.approvableCount).toBe(3);
    expect(overview.groups[0]?.rows.map((row) => row.entry.workDate)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03"
    ]);
    expect(overview.groups[0]?.rows.map((row) => row.entry.teamLabel)).toEqual([
      "A조",
      "B조",
      "D조"
    ]);
    expect(overview.groups[0]?.rows.map((row) => row.entry.section)).toEqual([
      "legal-holiday",
      "substitute",
      "overtime"
    ]);
  });

  it("should keep work date as the primary sort key when team labels would sort differently", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("테스트 DB를 초기화하지 못했습니다.");
    }

    database.prepare(`
      UPDATE performance_entries
      SET work_date = ?, team_label = ?
      WHERE performance_file_id = ?
        AND section = ?
    `).run("2026-03-01", "D조", fixture.fileId, "legal-holiday");
    database.prepare(`
      UPDATE performance_entries
      SET work_date = ?, team_label = ?
      WHERE performance_file_id = ?
        AND section = ?
    `).run("2026-03-02", "A조", fixture.fileId, "overtime");
    database.prepare(`
      UPDATE performance_entries
      SET work_date = ?, team_label = ?
      WHERE performance_file_id = ?
        AND section = ?
    `).run("2026-03-02", "B조", fixture.fileId, "substitute");

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(
      overview.groups[0]?.rows.map((row) => [
        row.entry.workDate,
        row.entry.teamLabel,
        row.entry.section
      ])
    ).toEqual([
      ["2026-03-01", "D조", "legal-holiday"],
      ["2026-03-02", "A조", "overtime"],
      ["2026-03-02", "B조", "substitute"]
    ]);
  });

  it("should recover team labels for existing stored rows without a persisted team label", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("테스트 DB를 초기화하지 못했습니다.");
    }

    database.prepare(`
      UPDATE performance_entries
      SET team_label = NULL
      WHERE performance_file_id = ?
    `).run(fixture.fileId);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.groups[0]?.rows.map((row) => row.entry.teamLabel)).toEqual([
      "A조",
      "B조",
      "D조"
    ]);
  });

  it("should default the overview to pending rows instead of loading approved archives", async () => {
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

    const defaultOverview = await listPerformanceOverview(
      {},
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const approvedOverview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(defaultOverview.rowCount).toBe(0);
    expect(approvedOverview.rowCount).toBe(3);
  });

  it("should require a schedule month before listing approved archives", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "approved"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(0);
    expect(overview.syncIssues[0]?.message).toContain("연도와 월을 선택");
  });

  it("should not show stale pending rows when the workbook is no longer in the pending folder", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);
    renameSync(fixture.filePath, path.resolve(fixture.rootDir, "moved-outside-pending.xlsx"));

    expect(existsSync(fixture.filePath)).toBe(false);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(0);
    expect(overview.groups).toHaveLength(0);
  });

  it("should reparse rejected pending files instead of reusing stale stored entries", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase()!;

    database.prepare(`
      DELETE FROM performance_entries
      WHERE performance_file_id = ?
        AND section = 'legal-holiday'
    `).run(detail.id);
    database.prepare(`
      UPDATE performance_files
      SET status = 'rejected',
          entry_count = 2
      WHERE id = ?
    `).run(detail.id);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const restoredDetail = getStoredPerformanceFileDetail(detail.id);

    expect(overview.rowCount).toBe(3);
    expect(overview.reapprovalFiles[0]?.entryCount).toBe(3);
    expect(
      overview.groups[0]?.rows.some((row) => row.entry.section === "legal-holiday")
    ).toBe(true);
    expect(
      restoredDetail?.entries.some((entry) => entry.section === "legal-holiday")
    ).toBe(true);
  });

  it("should keep pool substitute rows visible while excluding them from payable approval", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool"
    });

    const detail = await syncPreparedReturnedSchedule(fixture);

    expect(detail.entries.find((entry) => entry.section === "substitute")?.isPoolWorker).toBe(true);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.siteCount).toBe(1);
    expect(overview.rowCount).toBe(3);
    expect(overview.approvableCount).toBe(2);
    expect(overview.groups[0]?.rows.map((row) => row.entry.section)).toEqual([
      "legal-holiday",
      "substitute",
      "overtime"
    ]);
    const substituteRow = overview.groups[0]?.rows.find((row) => row.entry.section === "substitute");

    expect(substituteRow?.approvalStatus).toBe("non-payable");
    expect(substituteRow?.canApprove).toBe(false);
    expect(substituteRow?.entry.note).toContain("Pool 대체근무");
    expect(substituteRow?.entry.note).toContain("수당 미지급");
  });

  it("should surface reapproval candidates when a changed file is re-staged after approval", async () => {
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

      if (!result.ok) {
        throw new Error(`${result.errorCode}: ${result.message}`);
      }
      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.approvableCount).toBe(0);
    expect(overview.needsReapprovalCount).toBe(1);

    const overtimeRow = overview.groups[0]?.rows.find((row) => row.entry.section === "overtime");

    expect(overtimeRow?.needsReapproval).toBe(true);
    expect(overtimeRow?.approvalStatus).toBe("approved");
    expect(overtimeRow?.reapprovalStatus).toBe("pending");
    expect(overview.reapprovalFiles).toHaveLength(1);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      entryCount: 3,
      reapprovalCompletedCount: 0,
      reapprovalPendingCount: 3,
      remainingEntryCount: 3,
      canFinalize: false
    });

    const comparison = getPerformanceComparison({
      fileId: overtimeRow!.fileId,
      entryId: overtimeRow!.entryId
    });

    expect(comparison?.approvedEntry?.endTime).toBe("01:00");
    expect(comparison?.currentEntry.endTime).toBe("02:00");
    expect(comparison?.approvedCalculation?.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
  });

  it("should surface reapproval when a holiday source edit changes payable minutes", async () => {
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

    database.prepare(`
      UPDATE monthly_schedule_items
      SET start_time = '08:00',
          end_time = '17:00',
          break_minutes = 60
      WHERE work_date = '2026-03-01'
        AND duty_code = 'D'
    `).run();

    await restageReturnedScheduleFixture(fixture);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const holidayRow = overview.groups[0]?.rows.find((row) => row.entry.section === "legal-holiday");

    expect(overview.needsReapprovalCount).toBe(1);
    expect(holidayRow?.needsReapproval).toBe(true);
    expect(holidayRow?.reapprovalStatus).toBe("pending");
    expect(holidayRow?.entry.totalWorkMinutes).toBe(480);
    expect(holidayRow?.entry.overtimeMinutes).toBe(0);
  });

  it("should reparse unchanged pending files on explicit refresh so stored schedule time changes are reflected", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const database = getSqliteDatabase()!;

    database.prepare(`
      UPDATE monthly_schedule_items
      SET start_time = '08:00',
          end_time = '17:00',
          break_minutes = 60
      WHERE work_date = '2026-03-01'
        AND duty_code = 'D'
    `).run();

    const reusedOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const reusedHolidayRow = reusedOverview.groups[0]?.rows.find(
      (row) => row.entry.section === "legal-holiday"
    );

    expect(reusedHolidayRow?.entry.totalWorkMinutes).toBe(660);

    const refreshedOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03",
        forceReparse: true
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const refreshedHolidayRow = refreshedOverview.groups[0]?.rows.find(
      (row) => row.entry.section === "legal-holiday"
    );

    expect(refreshedHolidayRow?.entry.totalWorkMinutes).toBe(480);
    expect(refreshedHolidayRow?.entry.overtimeMinutes).toBe(0);
  });

  it("should keep already approved rows visible in pending view and open comparison even without content changes", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.approvableCount).toBe(0);
    expect(overview.needsReapprovalCount).toBe(0);

    const substituteRow = overview.groups[0]?.rows.find((row) => row.entry.section === "substitute");

    expect(substituteRow?.sourceDirectoryType).toBe("pending");
    expect(substituteRow?.approvalStatus).toBe("approved");
    expect(substituteRow?.needsReapproval).toBe(false);
    expect(substituteRow?.reapprovalStatus).toBe("none");
    expect(overview.reapprovalFiles).toHaveLength(0);

    const comparison = getPerformanceComparison({
      fileId: substituteRow!.fileId,
      entryId: substituteRow!.entryId
    });

    expect(comparison?.approvedRecord?.decision).toBe("approved");
    expect(comparison?.approvedEntry?.logicalKey).toBe(substituteRow?.logicalKey);
    expect(comparison?.approvedEntry?.startTime).toBe(comparison?.currentEntry.startTime);
    expect(comparison?.approvedEntry?.endTime).toBe(comparison?.currentEntry.endTime);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
  });

  it("should not surface a reapproval summary when a restaged pending file has identical approved content", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.needsReapprovalCount).toBe(0);
    expect(overview.reapprovalFiles).toHaveLength(0);
    expect(overview.groups[0]?.rows.every((row) => row.reapprovalStatus === "none")).toBe(true);
  });

  it("should mark individually re-approved rows as completed in pending view", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const rows = overview.groups[0]?.rows ?? [];
    const completedRow = rows.find((row) => row.entry.section === "overtime");

    expect(completedRow?.reapprovalStatus).toBe("completed");
    expect(rows.filter((row) => row.reapprovalStatus === "pending")).toHaveLength(2);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      reapprovalCompletedCount: 1,
      reapprovalPendingCount: 2,
      canFinalize: false
    });
  });

  it("should keep a finalized file moved back into pending out of reapproval when content is unchanged", async () => {
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
    for (const entry of secondDetail.entries) {
      const reapproveResult = await approvePerformanceFile(
        {
          fileId: secondDetail.id,
          entryId: entry.id,
          comment: "재승인 보정"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(reapproveResult.ok).toBe(true);
    }

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      {
        fileId: secondDetail.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(finalizeResult.ok).toBe(true);

    const finalizedDetail = getStoredPerformanceFileDetail(secondDetail.id);

    expect(finalizedDetail?.directoryType).toBe("approved");
    expect(finalizedDetail?.filePath).toBeDefined();

    renameSync(finalizedDetail!.filePath, fixture.filePath);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const rows = overview.groups[0]?.rows ?? [];

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.sourceDirectoryType === "pending")).toBe(true);
    expect(rows.every((row) => row.approvalStatus === "approved")).toBe(true);
    expect(rows.every((row) => row.reapprovalStatus === "none")).toBe(true);
    expect(overview.reapprovalFiles).toHaveLength(0);
  });

  it("should keep the approved view limited to approved archive rows when an approved file is re-staged into pending", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.pendingCount).toBe(0);
    expect(overview.groups[0]?.rows.every((row) => row.approvalStatus === "approved")).toBe(true);
    expect(overview.groups[0]?.rows.every((row) => row.sourceDirectoryType === "approved")).toBe(true);
    expect(overview.reapprovalFiles).toHaveLength(0);
  });

  it("should keep reapproval file summary available in pending view even before individual reapproval", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.reapprovalFiles).toHaveLength(1);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      entryCount: 3,
      resolvedApprovedEntryCount: 0,
      remainingEntryCount: 3,
      reapprovalCompletedCount: 0,
      reapprovalPendingCount: 3,
      needsReapprovalCount: 1,
      canFinalize: false
    });
  });

  it("should block pending approval when no hourly rate is applicable on the work date", async () => {
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

    await syncPreparedReturnedSchedule(fixture);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.approvableCount).toBe(0);
    expect(overview.groups[0]?.rows.every((row) => row.canApprove === false)).toBe(true);
    expect(
      overview.groups[0]?.rows.every((row) =>
        row.entry.alerts.some((alert) => alert.message.includes("기준 적용 시급을 찾지 못했습니다."))
      )
    ).toBe(true);
  });

  it("should show the approved manual hourly rate without missing-wage alerts after approval", async () => {
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

    const approvalResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(approvalResult.ok).toBe(true);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const approvedRow = overview.groups[0]?.rows.find((row) => row.entryId === targetEntry?.id);

    expect(approvedRow?.approvalStatus).toBe("approved");
    expect(approvedRow?.entry.hourlyRate).toBe(15500);
    expect(approvedRow?.latestApprovalUsedManualRate).toBe(true);
    expect(approvedRow?.latestApprovalManualHourlyRate).toBe(15500);
    expect(
      approvedRow?.entry.alerts.some((alert) => alert.message.includes("적용 시급을 찾지 못했습니다."))
    ).toBe(false);
  });

  it("should keep approved snapshot data visible even if the archived file is re-read with missing hourly rate alerts", async () => {
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

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE performance_entries
      SET hourly_rate = NULL,
          alert_json = ?
      WHERE performance_file_id = ?
    `).run(
      JSON.stringify([
        {
          severity: "error",
          message: "홍길동의 2026-03-01 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: 2026-03-21"
        }
      ]),
      firstDetail.id
    );

    const overview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const approvedRow = overview.groups[0]?.rows.find((row) => row.entry.section === "legal-holiday");

    expect(approvedRow?.approvalStatus).toBe("approved");
    expect(approvedRow?.entry.hourlyRate).toBeGreaterThan(0);
    expect(approvedRow?.entry.alerts.some((alert) => alert.message.includes("적용 시급"))).toBe(false);
  });

  it("should treat Pool legal-holiday and overtime rows as non-payable rather than approved ghosts in approved folder and prevent approval in pending (P2-6-D6)", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");
    const legalHolidayEntry = detail.entries.find((entry) => entry.section === "legal-holiday");

    expect(overtimeEntry).toBeDefined();
    expect(legalHolidayEntry).toBeDefined();

    const database = getSqliteDatabase();
    expect(database).not.toBeNull();

    // 연장 및 법정공휴일 행을 Pool 인력으로 업데이트
    database!.prepare(`
      UPDATE performance_entries
      SET employee_name = '전인환(P)',
          is_pool_worker = 1
      WHERE id = ?
    `).run(overtimeEntry!.id);

    database!.prepare(`
      UPDATE performance_entries
      SET employee_name = '홍길동(P)',
          is_pool_worker = 1
      WHERE id = ?
    `).run(legalHolidayEntry!.id);

    // 1. Pending 상태에서 확인: canApprove = false, approvalStatus = non-payable
    const pendingOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const pendingOvertimeRow = pendingOverview.groups[0]?.rows.find(
      (row) => row.entryId === overtimeEntry!.id
    );
    const pendingHolidayRow = pendingOverview.groups[0]?.rows.find(
      (row) => row.entryId === legalHolidayEntry!.id
    );

    expect(pendingOvertimeRow).toBeDefined();
    expect(pendingOvertimeRow?.approvalStatus).toBe("non-payable");
    expect(pendingOvertimeRow?.canApprove).toBe(false);

    expect(pendingHolidayRow).toBeDefined();
    expect(pendingHolidayRow?.approvalStatus).toBe("non-payable");
    expect(pendingHolidayRow?.canApprove).toBe(false);

    // 2. 파일을 승인완료 폴더로 이동하여 승인완료 상태 모의
    const approvedFilePath = path.resolve(fixture.approvedDir, fixture.fileName);
    renameSync(fixture.filePath, approvedFilePath);

    database!.prepare(`
      UPDATE performance_files
      SET directory_type = 'approved',
          file_path = ?,
          status = 'approved'
      WHERE id = ?
    `).run(approvedFilePath, detail.id);

    // 3. Approved 폴더 조회 시 Pool 법정공휴일/연장 행이 'approved' ghost가 아니라 'non-payable'인지 단언
    const approvedOverview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const approvedOvertimeRow = approvedOverview.groups[0]?.rows.find(
      (row) => row.entryId === overtimeEntry!.id
    );
    const approvedHolidayRow = approvedOverview.groups[0]?.rows.find(
      (row) => row.entryId === legalHolidayEntry!.id
    );

    expect(approvedOvertimeRow).toBeDefined();
    expect(approvedOvertimeRow?.approvalStatus).toBe("non-payable");
    expect(approvedOvertimeRow?.canApprove).toBe(false);

    expect(approvedHolidayRow).toBeDefined();
    expect(approvedHolidayRow?.approvalStatus).toBe("non-payable");
    expect(approvedHolidayRow?.canApprove).toBe(false);
  });
});
