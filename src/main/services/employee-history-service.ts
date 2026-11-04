import { employmentHistoryColumns, historyEmploymentSql, writableEmploymentPeriod, assertEmploymentHistoryEditable } from "./employee-employment-service";
import { getSeoulTodayDateString } from "../../shared/lib/local-date";
import { createHash, randomUUID } from "node:crypto";
import { canPerformAction } from "../../shared/domain/authorization";

import type {
  EmployeeAssignmentCloseInput,
  EmployeeAssignmentInput,
  EmployeeAssignmentReorderInput,
  EmployeeWageRateCloseInput,
  EmployeeWageRateInput
} from "../../shared/bridge/contracts";
import type { AuthSession, EmployeeSiteAssignment, WageRateHistoryRecord, WageRateRecord } from "../../shared/domain/model";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface WageRateRow {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  hourly_rate: number;
  effective_from: string;
  effective_to?: string | null;
  reason?: string | null;
  created_at: string;
  retirement_date?: string | null;
  employment_period_id?: string | null;
  employment_period_start?: string | null;
  employment_period_cancelled?: number;
  employment_managed?: number;
}

interface EmployeeAssignmentRow {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  site_id: string;
  site_name: string;
  team_name?: string | null;
  shift_group?: string | null;
  sort_order?: number | null;
  start_date: string;
  end_date?: string | null;
  status: "active" | "ended";
  created_at: string;
  retirement_date?: string | null;
  employment_period_id?: string | null;
  employment_period_start?: string | null;
  employment_period_cancelled?: number;
  employment_managed?: number;
}

interface TeamAssignmentOrderRow {
  id: string;
  employee_id: string;
  sort_order: number;
  created_at: string;
}

const toWageRateRecord = (row: WageRateRow): WageRateRecord => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeCode: row.employee_code,
  employeeName: row.employee_name,
  hourlyRate: Number(row.hourly_rate),
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to ?? undefined,
  reason: row.reason ?? undefined,
  createdAt: row.created_at,
  ...(row.retirement_date ? { retirementDate: row.retirement_date } : {}),
  ...(row.employment_managed ? { employmentPeriodId: row.employment_period_id ?? undefined, employmentPeriodStart: row.employment_period_start ?? undefined, employmentPeriodCancelled: Boolean(row.employment_period_cancelled || !row.employment_period_start) } : {})
});

const toAssignmentRecord = (row: EmployeeAssignmentRow): EmployeeSiteAssignment => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeCode: row.employee_code,
  employeeName: row.employee_name,
  siteId: row.site_id,
  siteName: row.site_name,
  teamName: row.team_name ?? undefined,
  shiftGroup: normalizeTeamLabel(row.shift_group ?? undefined),
  sortOrder:
    row.sort_order !== null && row.sort_order !== undefined
      ? Number(row.sort_order)
      : undefined,
  startDate: row.start_date,
  endDate: row.end_date ?? undefined,
  status: row.retirement_date && (row.start_date >= row.retirement_date || getSeoulTodayDateString() >= row.retirement_date || Boolean(row.end_date && row.end_date <= getSeoulTodayDateString())) ? "ended" : row.status,
  ...(row.retirement_date ? { retirementDate: row.retirement_date, retirementExcluded: row.start_date >= row.retirement_date } : {}),
  ...(row.employment_managed ? { employmentPeriodId: row.employment_period_id ?? undefined, employmentPeriodStart: row.employment_period_start ?? undefined, employmentPeriodCancelled: Boolean(row.employment_period_cancelled || !row.employment_period_start), ...(row.employment_period_cancelled || !row.employment_period_start ? {status:"ended" as const,retirementExcluded:true}: {}) } : {}),
  createdAt: row.created_at
});

const requireReadyDatabase = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database;
};

const requireEmployee = (employeeId: string) => {
  const database = requireReadyDatabase();
  const employee = database.prepare(`
    SELECT id
    FROM employees
    WHERE id = ?
    LIMIT 1
  `).get(employeeId) as { id: string } | undefined;

  if (!employee) {
    throw new Error("Employee not found.");
  }
};

const requireSite = (siteId: string) => {
  const database = requireReadyDatabase();
  const site = database.prepare(`
    SELECT id
    FROM sites
    WHERE id = ?
    LIMIT 1
  `).get(siteId) as { id: string } | undefined;

  if (!site) {
    throw new Error("Site not found.");
  }
};

const getActiveTeamCapacity = (siteId: string, teamLabel?: string) => {
  if (!teamLabel) {
    return undefined;
  }

  const database = requireReadyDatabase();
  const row = database.prepare(`
    SELECT shift_pattern_team_capacities.max_headcount
    FROM shift_pattern_team_capacities
    INNER JOIN shift_patterns
      ON shift_patterns.id = shift_pattern_team_capacities.pattern_id
    WHERE shift_patterns.site_id = ?
      AND shift_patterns.status = 'active'
      AND shift_pattern_team_capacities.team_label = ?
    ORDER BY COALESCE(shift_patterns.updated_at, shift_patterns.created_at) DESC
    LIMIT 1
  `).get(siteId, teamLabel) as { max_headcount: number } | undefined;

  return row && Number(row.max_headcount) > 0 ? Number(row.max_headcount) : undefined;
};

const ensureTeamCapacity = (siteId: string, teamLabel: string | undefined, employeeId: string) => {
  const maxHeadcount = getActiveTeamCapacity(siteId, teamLabel);

  if (!maxHeadcount || !teamLabel) {
    return;
  }

  const database = requireReadyDatabase();
  const row = database.prepare(`
    SELECT COUNT(*) as count
    FROM employee_site_assignments
    WHERE site_id = ?
      AND shift_group = ?
      AND status = 'active'
      AND NOT EXISTS (SELECT 1 FROM employees retired_employee WHERE retired_employee.id=employee_site_assignments.employee_id AND retired_employee.status='retired' AND retired_employee.retire_date <= '${getSeoulTodayDateString()}')
      AND ${historyEmploymentSql("employee_site_assignments", "'"+getSeoulTodayDateString()+"'")}
      AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employee_site_assignments.employee_id AND em.event_type='rehired') OR (start_date<='${getSeoulTodayDateString()}' AND (end_date IS NULL OR end_date>'${getSeoulTodayDateString()}')))
      AND employee_id <> ?
  `).get(siteId, teamLabel, employeeId) as { count: number };

  if (Number(row.count) >= maxHeadcount) {
    throw new Error(`${teamLabel} 정원(${maxHeadcount}명)을 초과할 수 없습니다.`);
  }
};

const requireWageRate = (wageRateId: string) => {
  const database = requireReadyDatabase();
  const wageRate = database.prepare(`
    SELECT *
    FROM wage_rates
    WHERE id = ?
    LIMIT 1
  `).get(wageRateId) as
    | { id: string; employee_id: string; employment_period_id?: string | null; effective_from: string; effective_to?: string | null }
    | undefined;

  if (!wageRate) {
    throw new Error("Wage rate not found.");
  }

  return wageRate;
};

const requireAssignment = (assignmentId: string) => {
  const database = requireReadyDatabase();
  const assignment = database.prepare(`
    SELECT *
    FROM employee_site_assignments
    WHERE id = ?
    LIMIT 1
  `).get(assignmentId) as
    | {
        id: string;
        employee_id: string;
        employment_period_id?: string | null;
        site_id: string;
        shift_group?: string | null;
        sort_order?: number | null;
        start_date: string;
        end_date?: string | null;
        status: "active" | "ended";
      }
    | undefined;

  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  return assignment;
};

const sanitizeAssignmentSortOrder = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;

const listActiveAssignmentsForTeam = (
  database: ReturnType<typeof requireReadyDatabase>,
  siteId: string,
  teamLabel?: string
) => {
  if (!teamLabel) {
    return [];
  }

  return database.prepare(`
    SELECT id, employee_id, sort_order, created_at
    FROM employee_site_assignments
    WHERE site_id = ?
      AND shift_group = ?
      AND status = 'active'
      AND NOT EXISTS (SELECT 1 FROM employees retired_employee WHERE retired_employee.id=employee_site_assignments.employee_id AND retired_employee.status='retired' AND retired_employee.retire_date <= '${getSeoulTodayDateString()}')
      AND ${historyEmploymentSql("employee_site_assignments", "'"+getSeoulTodayDateString()+"'")}
      AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employee_site_assignments.employee_id AND em.event_type='rehired') OR (start_date<='${getSeoulTodayDateString()}' AND (end_date IS NULL OR end_date>'${getSeoulTodayDateString()}')))
    ORDER BY sort_order ASC, created_at ASC
  `).all(siteId, teamLabel) as unknown as TeamAssignmentOrderRow[];
};

const getNextAssignmentSortOrder = (
  database: ReturnType<typeof requireReadyDatabase>,
  siteId: string,
  teamLabel?: string
) => {
  if (!teamLabel) {
    return 0;
  }

  const row = database.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort_order
    FROM employee_site_assignments
    WHERE site_id = ?
      AND shift_group = ?
      AND status = 'active'
      AND NOT EXISTS (SELECT 1 FROM employees retired_employee WHERE retired_employee.id=employee_site_assignments.employee_id AND retired_employee.status='retired' AND retired_employee.retire_date <= '${getSeoulTodayDateString()}')
      AND ${historyEmploymentSql("employee_site_assignments", "'"+getSeoulTodayDateString()+"'")}
      AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employee_site_assignments.employee_id AND em.event_type='rehired') OR (start_date<='${getSeoulTodayDateString()}' AND (end_date IS NULL OR end_date>'${getSeoulTodayDateString()}')))
  `).get(siteId, teamLabel) as { next_sort_order?: number } | undefined;

  return sanitizeAssignmentSortOrder(Number(row?.next_sort_order ?? 0));
};

const normalizeActiveTeamSortOrders = (
  database: ReturnType<typeof requireReadyDatabase>,
  siteId: string,
  teamLabel?: string
) => {
  if (!teamLabel) {
    return;
  }

  const orderedAssignments = listActiveAssignmentsForTeam(database, siteId, teamLabel);
  const updateSortOrder = database.prepare(`
    UPDATE employee_site_assignments
    SET sort_order = ?
    WHERE id = ?
  `);

  orderedAssignments.forEach((assignment, index) => {
    if (assignment.sort_order === index) {
      return;
    }

    updateSortOrder.run(index, assignment.id);
  });
};

const listStoredTeamAssignments = (
  siteId: string,
  teamLabel: string
): EmployeeSiteAssignment[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      employee_site_assignments.*,
      employees.employee_code,
      employees.name as employee_name,
      ${employmentHistoryColumns("employee_site_assignments")},
      sites.name as site_name
    FROM employee_site_assignments
    INNER JOIN employees
      ON employees.id = employee_site_assignments.employee_id
    INNER JOIN sites
      ON sites.id = employee_site_assignments.site_id
    WHERE employee_site_assignments.site_id = ?
      AND employee_site_assignments.shift_group = ?
      AND employee_site_assignments.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM employees retired_employee WHERE retired_employee.id=employee_site_assignments.employee_id AND retired_employee.status='retired' AND retired_employee.retire_date <= '${getSeoulTodayDateString()}')
      AND ${historyEmploymentSql("employee_site_assignments", "'"+getSeoulTodayDateString()+"'")}
      AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employee_site_assignments.employee_id AND em.event_type='rehired') OR (start_date<='${getSeoulTodayDateString()}' AND (end_date IS NULL OR end_date>'${getSeoulTodayDateString()}')))
    ORDER BY employee_site_assignments.sort_order ASC, employee_site_assignments.created_at ASC
  `).all(siteId, teamLabel) as unknown as EmployeeAssignmentRow[];

  return rows.map(toAssignmentRecord);
};

const shiftDateValue = (value: string, offsetDays: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date value.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

export const listStoredEmployeeWageRates = (employeeId: string): WageRateRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      wage_rates.*,
      employees.employee_code,
      employees.name as employee_name,
      ${employmentHistoryColumns("wage_rates")}
    FROM wage_rates
    INNER JOIN employees
      ON employees.id = wage_rates.employee_id
    WHERE wage_rates.employee_id = ?
    ORDER BY wage_rates.effective_from DESC, wage_rates.created_at DESC, wage_rates.rowid DESC
  `).all(employeeId) as unknown as WageRateRow[];

  const histories = database.prepare(`
    SELECT * FROM wage_rate_history
    WHERE employee_id = ? AND action_type IN ('same-date-replaced','corrected','invalidated','retirement-closed','retirement-adjusted','retirement-excluded')
    ORDER BY occurred_at DESC, rowid DESC
  `).all(employeeId) as Array<Record<string, unknown>>;
  const historyByRate = new Map<string, WageRateHistoryRecord[]>();
  for (const row of histories) {
    const rateId = String(row.wage_rate_id);
    const history = historyByRate.get(rateId) ?? [];
    history.push({
      id: String(row.id), actionType: String(row.action_type), hourlyRate: Number(row.hourly_rate),
      effectiveFrom: String(row.effective_from), effectiveTo: row.effective_to == null ? undefined : String(row.effective_to),
      reason: row.wage_reason == null ? undefined : String(row.wage_reason), changeReason: String(row.change_reason),
      actorDisplayName: String(row.actor_display_name), actorLoginId: String(row.actor_login_id),
      actorRole: String(row.actor_role), occurredAt: String(row.occurred_at)
    });
    historyByRate.set(rateId, history);
  }
  return rows.map(row => {
    const events = historyByRate.get(row.id) ?? [];
    const history = events.filter(e => e.actionType !== "invalidated");
    const invalidation = events.find(e => e.actionType === "invalidated");
    const revisionToken = createHash("sha256").update(JSON.stringify([row.id,row.employee_id,row.hourly_rate,row.effective_from,row.effective_to ?? null,row.reason ?? null,row.created_at,row.retirement_date ?? null,events.map(e => e.id)])).digest("hex");
    return { ...toWageRateRecord(row), revisionToken, ...(history.length ? { history } : {}), ...(invalidation ? { invalidation } : {}) };
  });
};

const hasWageInvalidation = (id: string) => Boolean(requireReadyDatabase().prepare(
  "SELECT 1 FROM wage_rate_history WHERE wage_rate_id = ? AND action_type = 'invalidated' LIMIT 1"
).get(id));

const reviseStoredEmployeeWageRate = (
  input: EmployeeWageRateInput,
  actor?: Pick<AuthSession, "userId" | "loginId" | "displayName" | "role">
): WageRateRecord => {
  const revision = input.revision!;
  if (!actor?.userId || !actor.loginId || !canPerformAction(actor.role, "employee-write")) throw new Error("시급 정정·무효 처리 권한이 없습니다.");
  if (!revision || !["correct", "invalidate"].includes(revision.operation)) throw new Error("시급 변경 구분을 확인해 주세요.");
  const changeReason = typeof revision.changeReason === "string" ? revision.changeReason.trim() : "";
  if (!changeReason || changeReason.length > 500) throw new Error("변경 사유를 1~500자로 입력해 주세요.");
  const database = requireReadyDatabase();
  const current = listStoredEmployeeWageRates(input.employeeId).find(r => r.id === revision.wageRateId);
  if(current) assertEmploymentHistoryEditable(input.employeeId, current.employmentPeriodId);
  if (!current || current.invalidation) throw new Error("처리할 시급이 없거나 이미 무효 처리되었습니다. 다시 조회해 주세요.");
  if (!revision.expectedRevision || current.revisionToken !== revision.expectedRevision || input.effectiveFrom !== current.effectiveFrom) throw new Error("시급 이력이 변경되었습니다. 다시 조회한 뒤 처리해 주세요.");
  if (revision.operation === "correct" && (!Number.isSafeInteger(input.hourlyRate) || input.hourlyRate <= 0)) throw new Error("시급은 0보다 큰 정수로 입력해 주세요.");
  if (revision.operation === "correct" && input.hourlyRate === current.hourlyRate) throw new Error("현재 금액과 다른 정정 시급을 입력해 주세요.");
  database.exec("SAVEPOINT wage_explicit_revision");
  try {
    const archived = database.prepare(`INSERT INTO wage_rate_history (
      id,wage_rate_id,employee_id,employment_period_id,employee_code,employee_name,action_type,
      hourly_rate,effective_from,effective_to,wage_reason,change_reason,
      actor_user_id,actor_login_id,actor_display_name,actor_role,occurred_at
    ) SELECT ?,w.id,w.employee_id,w.employment_period_id,e.employee_code,e.name,?,
      w.hourly_rate,w.effective_from,w.effective_to,w.reason,?,?,?,?,?,?
      FROM wage_rates w JOIN employees e ON e.id=w.employee_id WHERE w.id=? AND w.employee_id=?`)
      .run(randomUUID(),revision.operation === "invalidate" ? "invalidated" : "corrected",changeReason,
        actor.userId,actor.loginId,actor.displayName,actor.role,new Date().toISOString(),current.id,input.employeeId);
    if (Number(archived.changes) !== 1) throw new Error("원래 시급 이력을 보존하지 못했습니다.");
    if (revision.operation === "correct") {
      const updated = database.prepare("UPDATE wage_rates SET hourly_rate=?,reason=? WHERE id=? AND employee_id=?")
        .run(input.hourlyRate,changeReason,current.id,input.employeeId);
      if (Number(updated.changes) !== 1) throw new Error("시급 정정에 실패했습니다.");
    }
    database.exec("RELEASE wage_explicit_revision");
  } catch (error) {
    let message = error instanceof Error ? error.message : "시급 변경에 실패했습니다.";
    try { database.exec("ROLLBACK TO wage_explicit_revision"); database.exec("RELEASE wage_explicit_revision"); }
    catch (rollbackError) { message += ` 복원 확인: ${rollbackError instanceof Error ? rollbackError.message : "롤백 실패"}`; }
    throw new Error(message);
  }
  return listStoredEmployeeWageRates(input.employeeId).find(r => r.id === current.id)!;
};

export const listStoredEmployeeAssignments = (
  employeeId: string
): EmployeeSiteAssignment[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      employee_site_assignments.*,
      employees.employee_code,
      employees.name as employee_name,
      ${employmentHistoryColumns("employee_site_assignments")},
      sites.name as site_name
    FROM employee_site_assignments
    INNER JOIN employees
      ON employees.id = employee_site_assignments.employee_id
    INNER JOIN sites
      ON sites.id = employee_site_assignments.site_id
    WHERE employee_site_assignments.employee_id = ?
    ORDER BY
      CASE employee_site_assignments.status WHEN 'active' THEN 0 ELSE 1 END ASC,
      employee_site_assignments.start_date DESC,
      employee_site_assignments.sort_order ASC,
      employee_site_assignments.created_at DESC
  `).all(employeeId) as unknown as EmployeeAssignmentRow[];

  return rows.map(toAssignmentRecord);
};

// 시급은 이력 어느 자리에나 넣을 수 있다(소급 인상·오등록 정정). 넣은 뒤에도 기간이 겹치지
// 않도록 앞뒤 줄을 맞춘다: 시작일이 같은 줄은 고쳐 쓰고, 새 시작일을 물고 있던 앞줄은 전날로
// 끊고, 새 줄은 다음 줄 시작일 전날에서 끝난다(다음 줄이 없으면 계속).
export const saveStoredEmployeeWageRate = (
  input: EmployeeWageRateInput,
  actor?: Pick<AuthSession, "userId" | "loginId" | "displayName" | "role">
): WageRateRecord => {
  if (input.revision) return reviseStoredEmployeeWageRate(input, actor);
  const database = requireReadyDatabase();
  requireEmployee(input.employeeId);
  const period = writableEmploymentPeriod(input.employeeId, input.effectiveFrom);

  const existingRates = database.prepare(`
    SELECT id, effective_from, effective_to, hourly_rate, reason
    FROM wage_rates
    WHERE employee_id = ? ${period ? "AND employment_period_id = ?" : ""}
    ORDER BY effective_from ASC, created_at ASC, rowid ASC
  `).all(input.employeeId, ...(period ? [period.id] : [])) as Array<{
    id: string;
    effective_from: string;
    effective_to: string | null;
    hourly_rate: number;
    reason: string | null;
  }>;

  const latestSameStart = existingRates.filter(rate => rate.effective_from === input.effectiveFrom).at(-1);
  const sameStartRate = latestSameStart && !hasWageInvalidation(latestSameStart.id) ? latestSameStart : undefined;
  const previousWageEffectiveTo = shiftDateValue(input.effectiveFrom, -1);
  const nextRate = existingRates.find((rate) => rate.effective_from > input.effectiveFrom);
  const nextBoundary = nextRate ? shiftDateValue(nextRate.effective_from, -1) : null;
  const periodEnd = period?.endDate ? shiftDateValue(period.endDate, -1) : null;
  const nextEffectiveTo = periodEnd && (!nextBoundary || periodEnd < nextBoundary) ? periodEnd : nextBoundary;
  const createdAt = new Date().toISOString();

  // 계산에 쓰는 행 ID는 유지하고, 변경 전 값은 기존 이력표에 원자적으로 보존한다.
  if (sameStartRate) {
    const changed = Number(sameStartRate.hourly_rate) !== input.hourlyRate ||
      sameStartRate.reason !== (input.reason ?? null) || sameStartRate.effective_to !== nextEffectiveTo;
    if (changed) {
      database.exec("SAVEPOINT wage_same_date_correction");
      try {
        const archived = database.prepare(`
          INSERT INTO wage_rate_history (
            id, wage_rate_id, employee_id, employment_period_id, employee_code, employee_name,
            action_type, hourly_rate, effective_from, effective_to, wage_reason, change_reason,
            actor_user_id, actor_login_id, actor_display_name, actor_role, occurred_at
          )
          SELECT ?, w.id, w.employee_id, w.employment_period_id, e.employee_code, e.name,
            'same-date-replaced', w.hourly_rate, w.effective_from, w.effective_to, w.reason, ?,
            ?, ?, ?, ?, ?
          FROM wage_rates w JOIN employees e ON e.id = w.employee_id
          WHERE w.id = ?
        `).run(randomUUID(), "같은 적용일 시급 정정 전 기록", actor?.userId ?? "system", actor?.loginId ?? "system",
          actor?.displayName ?? "시스템", actor?.role ?? "system", createdAt, sameStartRate.id);
        if (Number(archived.changes) !== 1) throw new Error("이전 시급을 보존하지 못해 정정을 취소했습니다.");
        const updated = database.prepare(`
          UPDATE wage_rates SET hourly_rate = ?, effective_to = ?, reason = ? WHERE id = ?
        `).run(input.hourlyRate, nextEffectiveTo, input.reason ?? null, sameStartRate.id);
        if (Number(updated.changes) !== 1) throw new Error("시급을 갱신하지 못해 정정을 취소했습니다.");
        database.exec("RELEASE SAVEPOINT wage_same_date_correction");
      } catch (error) {
        database.exec("ROLLBACK TO SAVEPOINT wage_same_date_correction");
        database.exec("RELEASE SAVEPOINT wage_same_date_correction");
        throw error;
      }
    }

    return listStoredEmployeeWageRates(input.employeeId).find(
      (item) => item.id === sameStartRate.id
    ) as WageRateRecord;
  }

  const id = randomUUID();

  // 새 시작일을 걸치고 있는 앞줄(끝이 없거나 새 시작일 이후까지 가는 줄)은 전날로 끊는다.
  database.prepare(`
    UPDATE wage_rates
    SET effective_to = ?
    WHERE employee_id = ?
      AND effective_from < ?
      AND (effective_to IS NULL OR effective_to >= ?)
      AND NOT EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated')
      ${period ? "AND employment_period_id = ?" : ""}
  `).run(previousWageEffectiveTo, input.employeeId, input.effectiveFrom, input.effectiveFrom, ...(period ? [period.id] : []));

  database.prepare(`
    INSERT INTO wage_rates (
      id,
      employee_id,
      employment_period_id,
      hourly_rate,
      effective_from,
      effective_to,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.employeeId,
    period?.id ?? null,
    input.hourlyRate,
    input.effectiveFrom,
    nextEffectiveTo,
    input.reason ?? null,
    createdAt
  );

  return listStoredEmployeeWageRates(input.employeeId).find((item) => item.id === id) as WageRateRecord;
};

export const saveStoredEmployeeAssignment = (
  input: EmployeeAssignmentInput
): EmployeeSiteAssignment => {
  const database = requireReadyDatabase();
  const normalizedShiftGroup = normalizeTeamLabel(input.shiftGroup);
  requireEmployee(input.employeeId);
  const period = writableEmploymentPeriod(input.employeeId, input.startDate);
  if(period?.endDate)throw new Error("종료한 재직기간에는 새 배정을 등록하지 않습니다. 기존 배정 이력을 확인해 주세요.");
  requireSite(input.siteId);
  ensureTeamCapacity(input.siteId, normalizedShiftGroup, input.employeeId);

  const previousActiveAssignment = database.prepare(`
    SELECT site_id, shift_group
    FROM employee_site_assignments
    WHERE employee_id = ?
      AND status = 'active'
      AND NOT EXISTS (SELECT 1 FROM employees retired_employee WHERE retired_employee.id=employee_site_assignments.employee_id AND retired_employee.status='retired' AND retired_employee.retire_date <= '${getSeoulTodayDateString()}')
      AND ${historyEmploymentSql("employee_site_assignments", "'"+getSeoulTodayDateString()+"'")}
      AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employee_site_assignments.employee_id AND em.event_type='rehired') OR (start_date<='${getSeoulTodayDateString()}' AND (end_date IS NULL OR end_date>'${getSeoulTodayDateString()}')))
      ${period ? "AND employment_period_id = ?" : ""}
    ORDER BY start_date DESC, sort_order ASC, created_at DESC
    LIMIT 1
  `).get(input.employeeId, ...(period ? [period.id] : [])) as { site_id: string; shift_group?: string | null } | undefined;

  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const nextSortOrder =
    typeof input.sortOrder === "number"
      ? sanitizeAssignmentSortOrder(input.sortOrder)
      : getNextAssignmentSortOrder(database, input.siteId, normalizedShiftGroup);

  database.prepare(`
    UPDATE employee_site_assignments
    SET status = 'ended',
        end_date = COALESCE(end_date, ?)
    WHERE employee_id = ?
      AND status = 'active'
      AND NOT EXISTS (SELECT 1 FROM employees retired_employee WHERE retired_employee.id=employee_site_assignments.employee_id AND retired_employee.status='retired' AND retired_employee.retire_date <= '${getSeoulTodayDateString()}')
      AND ${historyEmploymentSql("employee_site_assignments", "'"+getSeoulTodayDateString()+"'")}
      AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employee_site_assignments.employee_id AND em.event_type='rehired') OR (start_date<='${getSeoulTodayDateString()}' AND (end_date IS NULL OR end_date>'${getSeoulTodayDateString()}')))
      ${period ? "AND employment_period_id = ?" : ""}
  `).run(input.startDate, input.employeeId, ...(period ? [period.id] : []));

  database.prepare(`
    INSERT INTO employee_site_assignments (
      id,
      employee_id,
      employment_period_id,
      site_id,
      team_name,
      shift_group,
      sort_order,
      start_date,
      end_date,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.employeeId,
    period?.id ?? null,
    input.siteId,
    input.teamName ?? normalizedShiftGroup ?? null,
    normalizedShiftGroup ?? null,
    nextSortOrder,
    input.startDate,
    null,
    "active",
    createdAt
  );

  if (previousActiveAssignment) {
    normalizeActiveTeamSortOrders(
      database,
      previousActiveAssignment.site_id,
      normalizeTeamLabel(previousActiveAssignment.shift_group)
    );
  }
  normalizeActiveTeamSortOrders(database, input.siteId, normalizedShiftGroup);

  return listStoredEmployeeAssignments(input.employeeId).find(
    (item) => item.id === id
  ) as EmployeeSiteAssignment;
};

export const closeStoredEmployeeWageRate = (
  input: EmployeeWageRateCloseInput
): WageRateRecord => {
  const database = requireReadyDatabase();
  const wageRate = requireWageRate(input.wageRateId);
  const period = assertEmploymentHistoryEditable(wageRate.employee_id, wageRate.employment_period_id);
  if(period?.endDate && input.effectiveTo >= period.endDate) throw new Error("시급 종료일은 해당 재직기간 종료일 전날을 넘길 수 없습니다.");

  if (hasWageInvalidation(input.wageRateId)) throw new Error("무효 처리한 시급은 적용 종료할 수 없습니다.");

  if (wageRate.effective_to) {
    throw new Error("Closed wage rate cannot be updated.");
  }

  if (input.effectiveTo < wageRate.effective_from) {
    throw new Error("Close date cannot be earlier than effective_from.");
  }

  database.prepare(`
    UPDATE wage_rates
    SET effective_to = ?
    WHERE id = ?
  `).run(input.effectiveTo, input.wageRateId);

  return listStoredEmployeeWageRates(wageRate.employee_id).find(
    (item) => item.id === input.wageRateId
  ) as WageRateRecord;
};

export const closeStoredEmployeeAssignment = (
  input: EmployeeAssignmentCloseInput
): EmployeeSiteAssignment => {
  const database = requireReadyDatabase();
  const assignment = requireAssignment(input.assignmentId);
  assertEmploymentHistoryEditable(assignment.employee_id, assignment.employment_period_id);
  const normalizedShiftGroup = normalizeTeamLabel(assignment.shift_group);

  if (assignment.status !== "active") {
    throw new Error("Closed assignment cannot be updated.");
  }

  if (input.endDate < assignment.start_date) {
    throw new Error("Close date cannot be earlier than start_date.");
  }

  database.prepare(`
    UPDATE employee_site_assignments
    SET status = 'ended',
        end_date = ?
    WHERE id = ?
  `).run(input.endDate, input.assignmentId);

  normalizeActiveTeamSortOrders(database, assignment.site_id, normalizedShiftGroup);

  return listStoredEmployeeAssignments(assignment.employee_id).find(
    (item) => item.id === input.assignmentId
  ) as EmployeeSiteAssignment;
};

export const reorderStoredEmployeeAssignment = (
  input: EmployeeAssignmentReorderInput
): EmployeeSiteAssignment[] => {
  const database = requireReadyDatabase();
  const assignment = requireAssignment(input.assignmentId);
  assertEmploymentHistoryEditable(assignment.employee_id, assignment.employment_period_id);

  if (assignment.status !== "active") {
    throw new Error("Closed assignment cannot be reordered.");
  }

  const normalizedShiftGroup = normalizeTeamLabel(assignment.shift_group);

  if (!normalizedShiftGroup) {
    throw new Error("근무조가 지정된 활성 배정만 순서를 변경할 수 있습니다.");
  }

  const orderedAssignments = listActiveAssignmentsForTeam(
    database,
    assignment.site_id,
    normalizedShiftGroup
  );
  const currentIndex = orderedAssignments.findIndex((item) => item.id === input.assignmentId);

  if (currentIndex < 0) {
    throw new Error("순서를 변경할 현재 배정을 찾을 수 없습니다.");
  }

  const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= orderedAssignments.length) {
    return listStoredTeamAssignments(assignment.site_id, normalizedShiftGroup);
  }

  const reorderedAssignments = orderedAssignments.slice();
  const [movedAssignment] = reorderedAssignments.splice(currentIndex, 1);

  reorderedAssignments.splice(targetIndex, 0, movedAssignment!);

  const updateSortOrder = database.prepare(`
    UPDATE employee_site_assignments
    SET sort_order = ?
    WHERE id = ?
  `);

  reorderedAssignments.forEach((item, index) => {
    updateSortOrder.run(index, item.id);
  });

  return listStoredTeamAssignments(assignment.site_id, normalizedShiftGroup);
};
