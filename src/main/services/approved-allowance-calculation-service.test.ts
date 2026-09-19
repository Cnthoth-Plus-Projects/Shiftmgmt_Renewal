import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation,
  runApprovedAllowanceCalculationForApproval,
  setAllowanceCalculationEarlyPayout
} from "./approved-allowance-calculation-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "approved-allowance-calculation");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("approved-allowance-calculation-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should calculate an approved overtime entry from the approval snapshot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);

    const result = await runApprovedAllowanceCalculation({
      entryId: overtimeEntry!.id
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.fileId).toBe(detail.id);
    expect(result.data.entryId).toBe(overtimeEntry!.id);
    expect(result.data.employeeName).toBe(fixture.workers.overtime.name);
    expect(result.data.employeeRank).toBe("사원");
    expect(result.data.hourlyRate).toBe(14100);
    expect(result.data.snapshot.breakdown.totalWorkMinutes).toBe(270);
    expect(result.data.snapshot.breakdown.nightMinutes).toBe(150);
    expect(result.data.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should return the stored calculation for duplicate runs of the same approved entry", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const first = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });
    const second = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(second.data.id).toBe(first.data.id);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
  });

  it("should persist the calculation summary and line items in sqlite", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const result = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const database = getSqliteDatabase();
    const summaryRow = database!.prepare(`
      SELECT employee_rank, total_allowance_amount
      FROM allowance_calculations
      WHERE id = ?
    `).get(result.data.id) as { employee_rank: string | null; total_allowance_amount: number } | undefined;
    const itemRows = database!.prepare(`
      SELECT allowance_code, amount
      FROM allowance_calculation_items
      WHERE calculation_id = ?
      ORDER BY allowance_code ASC
    `).all(result.data.id) as Array<{ allowance_code: string; amount: number }>;

    expect(summaryRow?.total_allowance_amount).toBe(result.data.snapshot.totalAllowanceAmount);
    expect(summaryRow?.employee_rank).toBe("사원");
    expect(itemRows.length).toBe(result.data.snapshot.lines.length);
  });

  it(
    "should refresh the latest allowance result when an entry is re-approved",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: createTestRoot(),
        templateVariant: "sample1"
      });
      const firstDetail = await syncPreparedReturnedSchedule(fixture);
      const firstOvertimeEntry = firstDetail.entries.find((entry) => entry.section === "overtime");

      expect(firstOvertimeEntry).toBeDefined();

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

      const initialOvertimeResult = listApprovedAllowanceCalculationResults().find(
        (record) => record.entryId === firstOvertimeEntry!.id
      );

      expect(initialOvertimeResult).toBeDefined();

      await restageReturnedScheduleFixture(fixture);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(fixture.filePath);
      const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

      worksheet.getCell("BE34").value = 2;
      await workbook.xlsx.writeFile(fixture.filePath);

      const restagedDetail = await syncPreparedReturnedSchedule(fixture);
      const restagedOvertimeEntry = restagedDetail.entries.find(
        (entry) => entry.section === "overtime"
      );

      expect(restagedOvertimeEntry).toBeDefined();

      const reapproveResult = await approvePerformanceFile(
        {
          fileId: restagedDetail.id,
          entryId: restagedOvertimeEntry!.id,
          comment: "재승인 보정"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(reapproveResult.ok).toBe(true);

      const latestResults = listApprovedAllowanceCalculationResults();
      const refreshedOvertimeResult = latestResults.find(
        (record) => record.entryId === restagedOvertimeEntry!.id
      );

      expect(latestResults).toHaveLength(3);
      expect(refreshedOvertimeResult).toBeDefined();
      expect(refreshedOvertimeResult?.fileId).toBe(restagedDetail.id);
      expect(refreshedOvertimeResult?.snapshot.totalAllowanceAmount).not.toBe(
        initialOvertimeResult?.snapshot.totalAllowanceAmount
      );
      expect(listAllowanceCalculationHistory()).toHaveLength(4);
    },
    15000
  );

  it("should persist the early payout date for an allowance calculation", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const calculation = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });

    expect(calculation.ok).toBe(true);
    if (!calculation.ok) {
      return;
    }

    const updated = setAllowanceCalculationEarlyPayout({
      calculationId: calculation.data.id,
      earlyPayoutDate: "2026-04-05"
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    expect(updated.data.earlyPayoutDate).toBe("2026-04-05");

    const database = getSqliteDatabase();
    const stored = database!.prepare(`
      SELECT early_payout_date
      FROM allowance_calculations
      WHERE id = ?
    `).get(calculation.data.id) as { early_payout_date: string } | undefined;

    expect(stored?.early_payout_date).toBe("2026-04-05");
  });

  describe("DEC-001 direct calculation entry point regression (P2-6-D6)", () => {
    const buildApprovalSnapshotFixture = (entryOverrides: Record<string, unknown> = {}) => {
      const entry = {
        id: "direct-entry-1",
        performanceFileId: "direct-file-1",
        logicalKey: "direct-logical-key-1",
        scheduleMonth: "2026-03",
        scheduleKey: "direct-schedule-1",
        siteName: "본사",
        employeeCode: "EMP001",
        employeeName: "홍길동",
        workDate: "2026-03-10",
        workType: "overtime",
        section: "overtime",
        startTime: "18:00",
        endTime: "22:00",
        breakMinutes: 0,
        totalWorkMinutes: 240,
        baseWorkMinutes: 0,
        overtimeMinutes: 240,
        nightMinutes: 0,
        hourlyRate: 15000,
        employeeRank: "사원",
        isPoolWorker: false,
        alerts: [],
        status: "approved",
        ...entryOverrides
      };

      const snapshot = {
        fileId: "direct-file-1",
        fileName: "direct-test.xlsx",
        filePath: "/test/direct-test.xlsx",
        scheduleMonth: "2026-03",
        siteName: "본사",
        scheduleKey: "direct-schedule-1",
        templateKind: "schedule-return",
        sheetName: "교대 근무 계획표",
        duplicateKey: "direct-checksum-1",
        receivedAt: "2026-03-11T09:00:00Z",
        entry
      };

      return {
        id: "direct-approval-1",
        fileId: "direct-file-1",
        decision: "approved",
        processedAt: "2026-03-11T10:00:00Z",
        processedBy: "admin",
        snapshotJson: JSON.stringify(snapshot)
      };
    };

    it("should reject Pool worker directly at calculation entry point with ALLOWANCE_EXCLUDED_ENTRY without creating calculation", async () => {
      const poolApproval = buildApprovalSnapshotFixture({
        id: "pool-entry-1",
        employeeName: "전인환",
        isPoolWorker: true
      });

      const result = await runApprovedAllowanceCalculationForApproval(poolApproval);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("ALLOWANCE_EXCLUDED_ENTRY");
      expect(result.message).toContain("Pool");
      expect(listApprovedAllowanceCalculationResults()).toHaveLength(0);
    });

    it("should reject BP worker directly at calculation entry point with ALLOWANCE_EXCLUDED_ENTRY without creating calculation", async () => {
      const bpApproval = buildApprovalSnapshotFixture({
        id: "bp-entry-1",
        employeeName: "BP(정다운)",
        employeeRank: "BP"
      });

      const result = await runApprovedAllowanceCalculationForApproval(bpApproval);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("ALLOWANCE_EXCLUDED_ENTRY");
      expect(result.message).toContain("BP");
      expect(listApprovedAllowanceCalculationResults()).toHaveLength(0);
    });

    it("should reject non-BP worker without employeeCode directly at calculation entry point with ALLOWANCE_EXCLUDED_ENTRY", async () => {
      const noCodeApproval = buildApprovalSnapshotFixture({
        id: "nocode-entry-1",
        employeeName: "김무사번",
        employeeCode: ""
      });

      const result = await runApprovedAllowanceCalculationForApproval(noCodeApproval);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("ALLOWANCE_EXCLUDED_ENTRY");
      expect(result.message).toContain("사번");
      expect(listApprovedAllowanceCalculationResults()).toHaveLength(0);
    });

    it("should preserve existing calculation record without deleting or recalculating when already present", async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: createTestRoot(),
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);
      const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");
      expect(overtimeEntry).toBeDefined();

      const approvalResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: overtimeEntry!.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
      expect(approvalResult.ok).toBe(true);

      const existingCalculations = listApprovedAllowanceCalculationResults();
      const existing = existingCalculations.find((c) => c.entryId === overtimeEntry!.id);
      expect(existing).toBeDefined();

      const database = getSqliteDatabase();
      const latestApprovalRow = database!.prepare(`
        SELECT id, file_id, decision, processed_at, processed_by, snapshot_json
        FROM performance_approvals
        WHERE entry_id = ? AND decision = 'approved'
        ORDER BY processed_at DESC
        LIMIT 1
      `).get(overtimeEntry!.id) as {
        id: string;
        file_id: string;
        decision: string;
        processed_at: string;
        processed_by: string;
        snapshot_json: string;
      } | undefined;
      expect(latestApprovalRow).toBeDefined();

      const calcResult = await runApprovedAllowanceCalculationForApproval({
        id: latestApprovalRow!.id,
        fileId: latestApprovalRow!.file_id,
        decision: latestApprovalRow!.decision,
        processedAt: latestApprovalRow!.processed_at,
        processedBy: latestApprovalRow!.processed_by,
        snapshotJson: latestApprovalRow!.snapshot_json
      });

      expect(calcResult.ok).toBe(true);
      if (!calcResult.ok) return;
      expect(calcResult.data.id).toBe(existing!.id);
      expect(calcResult.data.snapshot.totalAllowanceAmount).toBe(existing!.snapshot.totalAllowanceAmount);
      // 건수와 내역이 증가하거나 재계산되지 않고 보존됨
      expect(listApprovedAllowanceCalculationResults()).toHaveLength(existingCalculations.length);
    });
  });
});
