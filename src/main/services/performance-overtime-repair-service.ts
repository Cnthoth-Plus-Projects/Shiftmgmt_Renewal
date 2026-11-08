import { calculateAutomaticBreakMinutes, calculateWorkBreakdown } from "../../shared/domain/calculation";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface RepairSummary {
  repairedEntryCount: number;
  repairedApprovalCount: number;
  repairedCalculationCount: number;
}

// Approved entries and their financial snapshots are immutable during startup.
export const repairStoredOvertimePerformanceData = (): RepairSummary => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return {
      repairedEntryCount: 0,
      repairedApprovalCount: 0,
      repairedCalculationCount: 0
    };
  }

  const rows = database.prepare(`
    SELECT *
    FROM performance_entries
    WHERE work_type = 'overtime'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
  `).all() as Array<Record<string, unknown>>;

  let repairedEntryCount = 0;
  const repairedApprovalCount = 0;
  const repairedCalculationCount = 0;

  rows.forEach((row) => {
    const history = database.prepare(
      "SELECT 1 FROM performance_approvals WHERE entry_id = ? UNION ALL SELECT 1 FROM allowance_calculations WHERE performance_entry_id = ? LIMIT 1"
    ).get(String(row.id), String(row.id));
    if (history) return;
    const startTime = String(row.start_time);
    const endTime = String(row.end_time);
    const breakMinutes = calculateAutomaticBreakMinutes({
      startTime,
      endTime
    });
    const breakdown = calculateWorkBreakdown({
      workType: "overtime",
      timeRange: {
        startTime,
        endTime,
        breakMinutes
      }
    });
    const currentBreakMinutes = Number(row.break_minutes ?? 0);
    const currentBaseMinutes = Number(row.base_work_minutes ?? 0);
    const currentOvertimeMinutes = Number(row.overtime_minutes ?? 0);
    const currentNightMinutes = Number(row.night_minutes ?? 0);

    if (
      currentBreakMinutes === breakMinutes &&
      currentBaseMinutes === breakdown.baseWorkMinutes &&
      currentOvertimeMinutes === breakdown.overtimeMinutes &&
      currentNightMinutes === breakdown.nightMinutes
    ) {
      return;
    }

    database.prepare(`
      UPDATE performance_entries
      SET total_work_minutes = ?,
          work_hours = ?,
          break_minutes = ?,
          base_work_minutes = ?,
          overtime_minutes = ?,
          night_minutes = ?
      WHERE id = ?
    `).run(
      breakdown.totalWorkMinutes,
      breakdown.totalWorkMinutes / 60,
      breakMinutes,
      breakdown.baseWorkMinutes,
      breakdown.overtimeMinutes,
      breakdown.nightMinutes,
      String(row.id)
    );
    repairedEntryCount += 1;

  });

  return {
    repairedEntryCount,
    repairedApprovalCount,
    repairedCalculationCount
  };
};
