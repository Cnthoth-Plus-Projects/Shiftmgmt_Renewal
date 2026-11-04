import { attachEmploymentState, historyEmploymentSql, historyEmploymentOverlapSql, hasManagedEmployment } from "./employee-employment-service";
import { matchesEmployeeEmploymentStatus } from "../../shared/domain/employee-employment";
import { saveEmployeeRehire } from "./employee-rehire-service";
import { synchronizeEmployeeRetirement } from "./employee-retirement-service";
import { randomUUID } from "node:crypto";
import { getSeoulTodayDateString, validateHireDate } from "../../shared/lib/local-date";
import type { DatabaseSync } from "node:sqlite";

import type {
  EmployeeListQuery,
  EmployeeUpsertInput, EmployeeSaveResult
} from "../../shared/bridge/contracts";
import {
  formatEmployeeDisplayName,
  isBpEmploymentType,
  normalizeEmploymentTypeLabel
} from "../../shared/domain/employment-type";
import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";
import type { AuthSession, EmployeeRecord, SiteRecord } from "../../shared/domain/model";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface StoredEmployeeListQuery extends EmployeeListQuery {
  includeDeleted?: boolean;
  includeHistoricalAssignments?: boolean;
}

const defaultEmployees: EmployeeUpsertInput[] = [
  {
    employeeCode: "EMP-001",
    name: "김현우",
    rank: "사원",
    employmentType: "정규",
    status: "active",
    hireDate: "2023-03-01",
    shiftGroup: "A조",
    hourlyRate: 12800
  },
  {
    employeeCode: "EMP-014",
    name: "이수민",
    rank: "대리",
    employmentType: "계약",
    status: "leave",
    hireDate: "2024-01-15",
    shiftGroup: "B조",
    hourlyRate: 13200
  },
  {
    employeeCode: "EMP-023",
    name: "박정호",
    rank: "과장",
    employmentType: "정규",
    status: "retired",
    hireDate: "2021-06-10",
    retireDate: "2026-02-28",
    shiftGroup: "야간조",
    hourlyRate: 14100
  }
];

const defaultSiteNamesByEmployeeCode: Record<string, string> = {
  "EMP-001": "보라매DC",
  "EMP-014": "동탄센터",
  "EMP-023": "인천허브"
};

const createCurrentDateValue = () => {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
};

const getNextAssignmentSortOrder = (
  database: DatabaseSync,
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
  `).get(siteId, teamLabel) as { next_sort_order?: number } | undefined;

  return Math.max(Number(row?.next_sort_order ?? 0), 0);
};

const generateInternalBpEmployeeCode = (database: DatabaseSync) => {
  const rows = database.prepare(`
    SELECT employee_code
    FROM employees
    WHERE employee_code LIKE 'BP-%'
  `).all() as Array<{ employee_code?: string }>;
  let maxSequence = 0;

  rows.forEach((row) => {
    const matched = String(row.employee_code ?? "").match(/^BP-(\d+)$/i);

    if (!matched) {
      return;
    }

    maxSequence = Math.max(maxSequence, Number(matched[1]));
  });

  return `BP-${String(maxSequence + 1).padStart(4, "0")}`;
};

const toEmployeeRecord = (row: Record<string, unknown>): EmployeeRecord => ({
  id: String(row.id),
  employeeCode: String(row.employee_code),
  name: String(row.name),
  contact: row.contact ? String(row.contact) : undefined,
  email: row.email ? String(row.email) : undefined,
  rank: normalizeEmployeeRank(row.rank ? String(row.rank) : undefined),
  employmentType: normalizeEmploymentTypeLabel(
    row.employment_type ? String(row.employment_type) : undefined
  ),
  status: row.status as EmployeeRecord["status"],
  hireDate: row.hire_date ? String(row.hire_date) : undefined,
  retireDate: row.retire_date ? String(row.retire_date) : undefined,
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  currentSiteId: row.current_site_id ? String(row.current_site_id) : undefined,
  currentSiteName: row.current_site_name ? String(row.current_site_name) : undefined,
  currentSiteDeletedAt: row.current_site_deleted_at
    ? String(row.current_site_deleted_at)
    : undefined,
  currentShiftGroup: normalizeTeamLabel(
    row.current_shift_group ? String(row.current_shift_group) : undefined
  ),
  currentAssignmentOrder:
    row.current_assignment_order !== null && row.current_assignment_order !== undefined
      ? Number(row.current_assignment_order)
      : undefined,
  currentAssignmentStartDate: row.current_assignment_start_date
    ? String(row.current_assignment_start_date)
    : undefined,
  currentAssignmentEndDate: row.current_assignment_end_date
    ? String(row.current_assignment_end_date)
    : undefined,
  currentHourlyRate:
    row.current_hourly_rate !== null && row.current_hourly_rate !== undefined
      ? Number(row.current_hourly_rate)
      : undefined,
  currentHourlyRateEffectiveFrom: row.current_hourly_rate_effective_from
    ? String(row.current_hourly_rate_effective_from) : undefined,
  currentHourlyRateEffectiveTo: row.current_hourly_rate_effective_to
    ? String(row.current_hourly_rate_effective_to) : undefined,
  currentHourlyRateAsOfDate: row.current_hourly_rate_as_of_date
    ? String(row.current_hourly_rate_as_of_date) : undefined,
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined
});

const ensureEmployeeSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const row = database.prepare("SELECT COUNT(*) as count FROM employees").get() as {
    count: number;
  };

  if (row.count > 0) {
    return;
  }

  const sites = listStoredSites({ includeDeleted: true });
  const siteMap = new Map<string, SiteRecord>(sites.map((site) => [site.name, site]));
  const now = new Date().toISOString();
  const insertEmployee = database.prepare(`
    INSERT INTO employees (
      id,
      employee_code,
      name,
      contact,
      rank,
      employment_type,
      status,
      hire_date,
      retire_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAssignment = database.prepare(`
      INSERT INTO employee_site_assignments (
        id,
        employee_id,
        site_id,
        team_name,
        shift_group,
        sort_order,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  const insertWageRate = database.prepare(`
    INSERT INTO wage_rates (
      id,
      employee_id,
      hourly_rate,
      effective_from,
      effective_to,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  defaultEmployees.forEach((employee) => {
    const employeeId = randomUUID();
    insertEmployee.run(
      employeeId,
      employee.employeeCode,
      employee.name,
      null,
      normalizeEmployeeRank(employee.rank) ?? null,
      employee.employmentType,
      employee.status,
      employee.hireDate ?? null,
      employee.retireDate ?? null,
      now,
      now
    );

    const targetSite = siteMap.get(defaultSiteNamesByEmployeeCode[employee.employeeCode] ?? "");

    if (targetSite) {
      insertAssignment.run(
        randomUUID(),
        employeeId,
        targetSite.id,
        null,
        employee.shiftGroup ?? null,
        getNextAssignmentSortOrder(database, targetSite.id, normalizeTeamLabel(employee.shiftGroup)),
        employee.hireDate ?? "2026-01-01",
        employee.retireDate ?? null,
        employee.status === "retired" ? "ended" : "active",
        now
      );
    }

    if (employee.hourlyRate) {
      insertWageRate.run(
        randomUUID(),
        employeeId,
        employee.hourlyRate,
        employee.hireDate ?? "2026-01-01",
        employee.retireDate ?? null,
        "초기 시드",
        now
      );
    }
  });
};

export const listStoredEmployees = (query?: StoredEmployeeListQuery): EmployeeRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureEmployeeSeed();

  const includeHistoricalAssignments = Boolean(query?.includeHistoricalAssignments);
  const wageAsOfDate = getSeoulTodayDateString();
  const assignmentStatusFilter = includeHistoricalAssignments ? "" : `AND (
    employees.status <> 'retired' AND latest_assignments.status = 'active'
    OR employees.status = 'retired' AND (employees.retire_date IS NULL OR employees.retire_date > '${wageAsOfDate}')
      AND latest_assignments.status = 'active'
      AND latest_assignments.start_date <= '${wageAsOfDate}' AND (latest_assignments.end_date IS NULL OR latest_assignments.end_date > '${wageAsOfDate}')
  )`;

  const rows = database.prepare(`
    SELECT
      employees.*,
      sites.id as current_site_id,
      sites.name as current_site_name,
      sites.deleted_at as current_site_deleted_at,
      assignments.shift_group as current_shift_group,
      assignments.sort_order as current_assignment_order,
      assignments.start_date as current_assignment_start_date,
      assignments.end_date as current_assignment_end_date,
      CASE WHEN EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated') THEN NULL ELSE wage_rates.hourly_rate END as current_hourly_rate,
      CASE WHEN EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated') THEN NULL ELSE wage_rates.effective_from END as current_hourly_rate_effective_from,
      CASE WHEN EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated') THEN NULL ELSE wage_rates.effective_to END as current_hourly_rate_effective_to,
      ? as current_hourly_rate_as_of_date
    FROM employees
    LEFT JOIN employee_site_assignments as assignments
      ON assignments.id = (
        SELECT latest_assignments.id
        FROM employee_site_assignments as latest_assignments
        WHERE latest_assignments.employee_id = employees.id
          ${assignmentStatusFilter}
          AND (NOT EXISTS(SELECT 1 FROM employee_employment_period_events me WHERE me.employee_id=employees.id AND me.event_type='rehired') OR (
            latest_assignments.start_date <= '${wageAsOfDate}' AND (latest_assignments.end_date IS NULL OR latest_assignments.end_date > '${wageAsOfDate}')
            AND ${historyEmploymentSql("latest_assignments", "'"+wageAsOfDate+"'")}
          ))
        ORDER BY
          CASE latest_assignments.status WHEN 'active' THEN 0 ELSE 1 END ASC,
          latest_assignments.start_date DESC,
          latest_assignments.sort_order ASC,
          latest_assignments.created_at DESC
        LIMIT 1
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT latest_wage_rates.id
        FROM wage_rates as latest_wage_rates
        WHERE latest_wage_rates.employee_id = employees.id
          AND latest_wage_rates.effective_from <= ?
          AND (latest_wage_rates.effective_to IS NULL OR latest_wage_rates.effective_to >= ?)
          AND ${historyEmploymentSql("latest_wage_rates", "'"+wageAsOfDate+"'")}
        ORDER BY latest_wage_rates.effective_from DESC, latest_wage_rates.created_at DESC, latest_wage_rates.rowid DESC
        LIMIT 1
      ) AND (employees.status <> 'retired' OR employees.retire_date IS NULL OR employees.retire_date > '${wageAsOfDate}')
    ORDER BY employees.name ASC
  `).all(wageAsOfDate, wageAsOfDate, wageAsOfDate) as Array<Record<string, unknown>>;

  const normalizedKeyword = query?.keyword?.trim().toLowerCase() ?? "";

  return attachEmploymentState(rows.map(toEmployeeRecord))
    .filter((employee) => query?.includeDeleted || !employee.deletedAt)
    .filter((employee) => matchesEmployeeEmploymentStatus(employee, query?.status, wageAsOfDate))
    .filter((employee) => !query?.siteId || employee.currentSiteId === query.siteId)
    .filter((employee) => {
      if (normalizedKeyword.length === 0) {
        return true;
      }

      const displayName = formatEmployeeDisplayName(employee).toLowerCase();

      return (
        employee.name.toLowerCase().includes(normalizedKeyword) ||
        displayName.includes(normalizedKeyword) ||
        employee.employeeCode.toLowerCase().includes(normalizedKeyword) ||
        (employee.contact?.toLowerCase().includes(normalizedKeyword) ?? false) ||
        (employee.rank?.toLowerCase().includes(normalizedKeyword) ?? false)
      );
    });
};

const resolveMonthBoundaryDates = (scheduleMonth: string) => {
  const matched = scheduleMonth.match(/^(\d{4})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const monthEnd = new Date(Date.UTC(year, month, 0));

  return {
    startDate: `${scheduleMonth}-01`,
    endDate: `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(monthEnd.getUTCDate()).padStart(2, "0")}`
  };
};

export const listStoredEmployeesForSiteMonth = (
  siteId: string,
  scheduleMonth: string,
  options?: { includeDeleted?: boolean }
): EmployeeRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureEmployeeSeed();

  const monthBoundary = resolveMonthBoundaryDates(scheduleMonth);

  if (!monthBoundary) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      employees.*,
      sites.id as current_site_id,
      sites.name as current_site_name,
      sites.deleted_at as current_site_deleted_at,
      assignments.shift_group as current_shift_group,
      assignments.sort_order as current_assignment_order,
      assignments.start_date as current_assignment_start_date,
      assignments.end_date as current_assignment_end_date,
      CASE WHEN EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated') THEN NULL ELSE wage_rates.hourly_rate END as current_hourly_rate
    FROM employees
    INNER JOIN employee_site_assignments as assignments
      ON assignments.id = (
        SELECT matched_assignments.id
        FROM employee_site_assignments as matched_assignments
        WHERE matched_assignments.employee_id = employees.id
          AND matched_assignments.site_id = ?
          AND ${historyEmploymentOverlapSql("matched_assignments","start_date","end_date","'"+monthBoundary.startDate+"'","'"+monthBoundary.endDate+"'")}
          AND matched_assignments.start_date <= ?
          AND (
            matched_assignments.end_date IS NULL
            OR matched_assignments.end_date > ?
          )
        ORDER BY
          matched_assignments.start_date DESC,
          matched_assignments.sort_order ASC,
          matched_assignments.created_at DESC
        LIMIT 1
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT matched_wage_rates.id
        FROM wage_rates as matched_wage_rates
        WHERE matched_wage_rates.employee_id = employees.id
          AND ${historyEmploymentOverlapSql("matched_wage_rates","effective_from","effective_to","'"+monthBoundary.startDate+"'","'"+monthBoundary.endDate+"'",true)}
          AND matched_wage_rates.effective_from <= ?
          AND (
            matched_wage_rates.effective_to IS NULL
            OR matched_wage_rates.effective_to >= ?
          )
        ORDER BY matched_wage_rates.effective_from DESC, matched_wage_rates.created_at DESC, matched_wage_rates.rowid DESC
        LIMIT 1
      )
    WHERE (? = 1 OR employees.deleted_at IS NULL)
    ORDER BY employees.name ASC
  `).all(
    siteId,
    monthBoundary.endDate,
    monthBoundary.startDate,
    monthBoundary.endDate,
    monthBoundary.startDate,
    options?.includeDeleted ? 1 : 0
  ) as Array<Record<string, unknown>>;

  return attachEmploymentState(rows.map(toEmployeeRecord));
};

export const saveStoredEmployee = (input: EmployeeUpsertInput, actor?: AuthSession): EmployeeSaveResult => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();
  if (input.rehire) return saveEmployeeRehire(input, actor, id => listStoredEmployees({includeDeleted:true}).find(e=>e.id===id));

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM employees
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;

  const id = existing ? String(existing.id) : randomUUID();
  const createdAt = existing ? String(existing.created_at) : new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const normalizedEmploymentType = normalizeEmploymentTypeLabel(input.employmentType);
  if (existing?.status === "retired" && input.status !== "retired" && database.prepare(
    "SELECT 1 FROM employee_employment_period_events WHERE employee_id=? AND event_type IN ('retired','retirement-date-corrected','retirement-synchronized') LIMIT 1"
  ).get(id)) throw new Error("자동 종료한 퇴사 이력이 있습니다. 퇴사일 정정은 가능하지만 재직 전환은 별도 재입사 처리에서 진행해야 합니다.");
  if(existing && hasManagedEmployment(id)) {
    if(input.hireDate!==undefined && input.hireDate!==(existing.hire_date ?? ""))throw new Error("재입사 이력이 있는 직원의 최초 입사일은 이 화면에서 변경하지 않습니다. 재직기간 이력을 확인해 주세요.");
    if(input.siteId || input.hourlyRate!==undefined)throw new Error("재입사 직원의 시급·배정은 각 이력 등록에서 처리해 주세요.");
    const state=attachEmploymentState([toEmployeeRecord(existing)])[0];
    if(state.scheduledRehire && (input.status!==existing.status || input.employmentType!==existing.employment_type || (input.retireDate ?? null)!==(existing.retire_date ?? null)))throw new Error("재입사 예약이 있습니다. 상태·고용형태를 바꾸려면 예약을 먼저 확인해 주세요. 날짜·시급·배정은 예약 변경 또는 예약 취소에서 처리해 주세요.");
  }
  const previousHireDate = existing?.hire_date == null ? null : String(existing.hire_date);
  const nextHireDate = existing
    ? input.hireDate === undefined ? previousHireDate : typeof input.hireDate === "string" ? input.hireDate.trim() || null : null
    : input.hireDate ?? null;
  if (existing && input.hireDate !== undefined && nextHireDate !== previousHireDate) {
    const validation = validateHireDate(nextHireDate ?? "", getSeoulTodayDateString());
    if (!validation.valid) throw new Error(validation.message);
    if (input.retireDate && nextHireDate! > input.retireDate) throw new Error("입사일은 퇴사일보다 늦을 수 없습니다.");
  }
  const normalizedRank = normalizeEmployeeRank(input.rank) ?? null;
  const isBpEmployee = isBpEmploymentType(normalizedEmploymentType);
  const existingEmployeeCode = existing ? String(existing.employee_code) : "";
  let normalizedEmployeeCode = input.employeeCode.trim();
  const normalizedContact = input.contact?.trim() || null;
  const normalizedEmail = input.email === undefined && existing ? existing.email ?? null : input.email?.trim() || null;
  if (normalizedEmail !== null && (typeof normalizedEmail !== "string" || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) throw new Error("올바른 이메일 주소를 입력해 주세요.");
  const normalizedShiftGroup = normalizeTeamLabel(input.shiftGroup);
  const shouldCreateInitialAssignment = Boolean(input.siteId && normalizedShiftGroup);
  const assignmentSiteId = shouldCreateInitialAssignment ? input.siteId ?? null : null;

  if (normalizedEmployeeCode.length === 0) {
    if (!isBpEmployee) {
      throw new Error("Employee code is required.");
    }

    normalizedEmployeeCode = existingEmployeeCode || generateInternalBpEmployeeCode(database);
  }

  const duplicateEmployee = database.prepare(`
    SELECT id
    FROM employees
    WHERE employee_code = ?
      AND id <> ?
    LIMIT 1
  `).get(normalizedEmployeeCode, id) as { id: string } | undefined;

  if (duplicateEmployee) {
    throw new Error("이미 사용 중인 사원번호입니다.");
  }

  database.exec("SAVEPOINT w09_employee_save");
  try {
  const storedEmployee = database.prepare(`
    INSERT INTO employees (
      id,
      employee_code,
      name,
      contact,
      email,
      rank,
      employment_type,
      status,
      hire_date,
      retire_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      employee_code = excluded.employee_code,
      name = excluded.name,
      contact = excluded.contact,
      email = excluded.email,
      rank = excluded.rank,
      employment_type = excluded.employment_type,
      status = excluded.status,
      hire_date = excluded.hire_date,
      retire_date = excluded.retire_date,
      updated_at = excluded.updated_at
  `).run(
    id,
    normalizedEmployeeCode,
    input.name,
    normalizedContact,
    normalizedEmail as string | null,
    normalizedRank,
    normalizedEmploymentType,
    input.status,
    nextHireDate,
    input.retireDate ?? null,
    createdAt,
    updatedAt
  );
  if (Number(storedEmployee.changes) !== 1) throw new Error("인력 기본 정보를 저장하지 못했습니다.");

  if (assignmentSiteId) {
    database.prepare(`
      UPDATE employee_site_assignments
      SET status = 'ended',
          end_date = COALESCE(end_date, ?)
      WHERE employee_id = ?
        AND status = 'active'
    `).run(updatedAt.slice(0, 10), id);

    database.prepare(`
      INSERT INTO employee_site_assignments (
        id,
        employee_id,
        site_id,
        team_name,
        shift_group,
        sort_order,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      assignmentSiteId,
      null,
      normalizedShiftGroup ?? null,
      getNextAssignmentSortOrder(database, assignmentSiteId, normalizedShiftGroup),
      input.hireDate ?? updatedAt.slice(0, 10),
      null,
      "active",
      updatedAt
    );
  }

  if (typeof input.hourlyRate === "number") {
    database.prepare(`
      UPDATE wage_rates
      SET effective_to = COALESCE(effective_to, ?)
      WHERE employee_id = ?
        AND effective_to IS NULL AND NOT EXISTS (SELECT 1 FROM wage_rate_history h WHERE h.wage_rate_id=wage_rates.id AND h.action_type='invalidated')
    `).run(updatedAt.slice(0, 10), id);

    database.prepare(`
      INSERT INTO wage_rates (
        id,
        employee_id,
        hourly_rate,
        effective_from,
        effective_to,
        reason,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      input.hourlyRate,
      input.hireDate ?? updatedAt.slice(0, 10),
      null,
      "직원 등록/수정",
      updatedAt
    );
  }

  const previous = existing ? { id,employeeCode:existingEmployeeCode,name:String(existing.name),status:String(existing.status) as EmployeeRecord["status"],hireDate:previousHireDate ?? undefined,retireDate:existing.retire_date == null ? undefined : String(existing.retire_date) } : undefined;
  const retirementChange = synchronizeEmployeeRetirement(previous,{id,employeeCode:normalizedEmployeeCode,name:input.name,status:input.status,hireDate:nextHireDate ?? undefined,retireDate:input.retireDate},actor);
  const savedEmployee = listStoredEmployees().find(employee => employee.id === id);
  if (!savedEmployee) throw new Error("저장한 인력을 다시 확인하지 못했습니다.");
  database.exec("RELEASE w09_employee_save");
  return { ...savedEmployee, ...(retirementChange ? { retirementChange } : {}) };
  } catch(error) {
    let message = error instanceof Error ? error.message : "인력 저장에 실패했습니다.";
    try { database.exec("ROLLBACK TO w09_employee_save"); database.exec("RELEASE w09_employee_save"); }
    catch(rollbackError) { message += ` 복원 확인: ${rollbackError instanceof Error ? rollbackError.message : "롤백 실패"}`; }
    throw new Error(message);
  }
};

export const deleteStoredEmployee = (employeeId: string, actor?: AuthSession): EmployeeRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();

  const employee = listStoredEmployees({
    includeDeleted: true,
    includeHistoricalAssignments: true
  }).find((item) => item.id === employeeId);

  if (!employee) {
    throw new Error("삭제할 인력을 찾을 수 없습니다.");
  }

  if (employee.status !== "retired" || !employee.retireDate) {
    throw new Error("퇴사 처리된 인력만 삭제할 수 있습니다.");
  }

  if (employee.retireDate >= createCurrentDateValue()) {
    throw new Error("퇴사 처리일이 지난 인력만 삭제할 수 있습니다.");
  }

  database.exec("BEGIN;");

  try {
    synchronizeEmployeeRetirement(employee,employee,actor,true);
    const deletedAt = new Date().toISOString();

    database
      .prepare(
        `
          UPDATE employees
          SET deleted_at = COALESCE(deleted_at, ?),
              updated_at = ?
          WHERE id = ?
        `
      )
      .run(deletedAt, deletedAt, employeeId);
    database.exec("COMMIT;");
  } catch (error) {
    let message=error instanceof Error ? error.message : "인력 삭제에 실패했습니다.";
    try { database.exec("ROLLBACK;"); } catch(rollbackError) { message += ` 복원 확인: ${rollbackError instanceof Error ? rollbackError.message : "롤백 실패"}`; }
    throw new Error(message);
  }

  return (
    listStoredEmployees({
      includeDeleted: true,
      includeHistoricalAssignments: true
    }).find((item) => item.id === employeeId) ?? employee
  );
};

export const resetEmployeeStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM wage_rates;");
    database.exec("DELETE FROM employee_site_assignments;");
    database.exec("DELETE FROM employees;");
  }
};
