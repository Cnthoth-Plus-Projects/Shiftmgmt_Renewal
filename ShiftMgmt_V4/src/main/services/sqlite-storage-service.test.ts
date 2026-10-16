import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  closeSqliteStorage,
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

describe("sqlite-storage-service", () => {
  it("should initialize the sqlite file and apply runtime tables", () => {
    const dbPath = path.resolve(process.cwd(), "artifacts", "tests", "sqlite-storage.test.sqlite");

    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    const tables = database!.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    expect(tables.map((item) => item.name)).toContain("performance_approvals");
    expect(tables.map((item) => item.name)).toContain("allowance_calculations");
    expect(tables.map((item) => item.name)).toContain("allowance_calculation_items");
    expect(tables.map((item) => item.name)).toContain("allowance_document_exports");
    expect(tables.map((item) => item.name)).toContain("performance_files");
    expect(tables.map((item) => item.name)).toContain("performance_entries");
    expect(tables.map((item) => item.name)).toContain("sites");
    expect(tables.map((item) => item.name)).toContain("employees");
    expect(tables.map((item) => item.name)).toContain("employee_site_assignments");
    expect(tables.map((item) => item.name)).toContain("wage_rates");
    expect(tables.map((item) => item.name)).toContain("shift_patterns");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_steps");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_cycles");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_cycle_steps");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_cycle_team_indexes");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_team_cycles");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_team_capacities");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_team_settings");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_duty_types");
    expect(tables.map((item) => item.name)).toContain("monthly_schedules");
    expect(tables.map((item) => item.name)).toContain("monthly_schedule_items");
    expect(tables.map((item) => item.name)).toContain("schedule_plan_exports");
    expect(tables.map((item) => item.name)).toContain("holiday_calendars");
    expect(tables.map((item) => item.name)).toContain("holiday_items");
    expect(tables.map((item) => item.name)).toContain("allowance_rate_versions");
    expect(tables.map((item) => item.name)).toContain("allowance_rate_items");
    expect(tables.map((item) => item.name)).toContain("app_users");
    expect(tables.map((item) => item.name)).toContain("document_template_versions");
    expect(tables.map((item) => item.name)).toContain("app_setting_entries");
    expect(tables.map((item) => item.name)).toContain("employee_employment_periods");
    expect(tables.map((item) => item.name)).toContain("employee_retirement_history_closures");
    expect(tables.map((item) => item.name)).toContain("employee_employment_period_events");
    expect(tables.map((item) => item.name)).toContain("wage_rate_history");

    const shiftPatternColumns = database!.prepare(`
      PRAGMA table_info(shift_patterns)
    `).all() as Array<{ name: string }>;
    const approvalColumns = database!.prepare(`
      PRAGMA table_info(performance_approvals)
    `).all() as Array<{ name: string }>;
    const employeeColumns = database!.prepare(`
      PRAGMA table_info(employees)
    `).all() as Array<{ name: string }>;
    const performanceEntryColumns = database!.prepare(`
      PRAGMA table_info(performance_entries)
    `).all() as Array<{ name: string }>;
    const allowanceCalculationColumns = database!.prepare(`
      PRAGMA table_info(allowance_calculations)
    `).all() as Array<{ name: string }>;
    const appUserColumns = database!.prepare(`
      PRAGMA table_info(app_users)
    `).all() as Array<{ name: string }>;
    const assignmentColumns = database!.prepare(`
      PRAGMA table_info(employee_site_assignments)
    `).all() as Array<{ name: string }>;
    const wageRateColumns = database!.prepare(`
      PRAGMA table_info(wage_rates)
    `).all() as Array<{ name: string }>;
    const performanceFileColumns = database!.prepare(`
      PRAGMA table_info(performance_files)
    `).all() as Array<{ name: string }>;

    expect(employeeColumns.map((item) => item.name)).toContain("rank");
    expect(performanceEntryColumns.map((item) => item.name)).toContain("employee_rank");
    expect(allowanceCalculationColumns.map((item) => item.name)).toContain("employee_rank");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("team_count");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pattern_start_date");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_enabled");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_start_time");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_end_time");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_break_minutes");
    expect(approvalColumns.map((item) => item.name)).toContain("archived_file_name");
    expect(approvalColumns.map((item) => item.name)).toContain("archived_file_path");
    expect(appUserColumns.map((item) => item.name)).toContain("password_hash");
    expect(appUserColumns.map((item) => item.name)).toContain("must_change_password");
    expect(appUserColumns.map((item) => item.name)).toContain("sign_in_failure_count");
    expect(appUserColumns.map((item) => item.name)).toContain("sign_in_locked_until");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_key_hash");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_key_issued_at");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_failure_count");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_locked_until");
    expect(appUserColumns.map((item) => item.name)).toContain("extension_number");
    expect(assignmentColumns.map((item) => item.name)).toContain("employment_period_id");
    expect(wageRateColumns.map((item) => item.name)).toContain("employment_period_id");
    expect(performanceFileColumns.map((item) => item.name)).toContain("reparse_marker_snapshot_json");

    const indexNames = (
      database!.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{
        name: string;
      }>
    ).map((item) => item.name);

    expect(indexNames).toContain("idx_employee_employment_periods_employee");
    expect(indexNames).toContain("idx_employee_employment_periods_open");
    expect(indexNames).toContain("idx_employee_retirement_closures_period");
    expect(indexNames).toContain("idx_employee_employment_events_employee");
    expect(indexNames).toContain("idx_wage_rate_history_wage_rate_id");
    expect(indexNames).toContain("idx_wage_rate_history_employee_id");
    expect(indexNames).toContain("idx_employee_assignments_employment_period");
    expect(indexNames).toContain("idx_wage_rates_employment_period");

    closeSqliteStorage();
    resetSqliteStorageForTest();
  });

  it("should backfill legacy employment periods and avoid creating periods for blank/null/whitespace hire_date (N1, R3)", () => {
    const dbPath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "sqlite-storage-legacy-period.test.sqlite"
    );

    initializeSqliteStorage({ dbPath });
    const database = getSqliteDatabase()!;

    // Clean any prior data
    database.exec("DELETE FROM employee_employment_periods; DELETE FROM employees;");

    // Seed employees:
    // emp-1: normal active
    // emp-2: retired
    // emp-3: NULL hire_date
    // emp-4: empty string hire_date
    // emp-5: whitespace-only hire_date
    database.prepare(`
      INSERT INTO employees (id, employee_code, name, employment_type, status, hire_date, retire_date, created_at, updated_at)
      VALUES
        ('emp-1', 'E001', '정상직원', 'regular', 'active', '2024-01-15', null, '2024-01-15T00:00:00.000Z', null),
        ('emp-2', 'E002', '퇴직직원', 'regular', 'retired', '2023-03-01', '2024-12-31', '2023-03-01T00:00:00.000Z', '2024-12-31T00:00:00.000Z'),
        ('emp-3', 'E003', '입사일NULL', 'regular', 'active', null, null, '2024-01-01T00:00:00.000Z', null),
        ('emp-4', 'E004', '입사일빈문자열', 'regular', 'active', '', null, '2024-01-01T00:00:00.000Z', null),
        ('emp-5', 'E005', '입사일공백', 'regular', 'active', '   ', null, '2024-01-01T00:00:00.000Z', null);
    `).run();

    // Re-initialize to trigger migrateDatabase backfill logic
    closeSqliteStorage();
    initializeSqliteStorage({ dbPath });
    const dbAfter = getSqliteDatabase()!;

    const periods = dbAfter.prepare(`
      SELECT * FROM employee_employment_periods ORDER BY employee_id
    `).all() as Array<{
      id: string;
      employee_id: string;
      start_date: string;
      end_date: string | null;
      closure_provenance_complete: number;
    }>;

    expect(periods).toHaveLength(2);

    expect(periods[0]).toEqual({
      id: "legacy:emp-1",
      employee_id: "emp-1",
      start_date: "2024-01-15",
      end_date: null,
      closure_provenance_complete: 1,
      created_at: "2024-01-15T00:00:00.000Z",
      updated_at: null
    });

    expect(periods[1]).toEqual({
      id: "legacy:emp-2",
      employee_id: "emp-2",
      start_date: "2023-03-01",
      end_date: "2024-12-31",
      closure_provenance_complete: 0,
      created_at: "2023-03-01T00:00:00.000Z",
      updated_at: "2024-12-31T00:00:00.000Z"
    });

    // N1: Confirm emp-3, emp-4, emp-5 have NO legacy period generated
    const blankPeriods = dbAfter.prepare(`
      SELECT * FROM employee_employment_periods WHERE employee_id IN ('emp-3', 'emp-4', 'emp-5')
    `).all();
    expect(blankPeriods).toHaveLength(0);

    closeSqliteStorage();
    resetSqliteStorageForTest();
  });

  it("should be idempotent when initialized multiple times without duplicates (N2)", () => {
    const dbPath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "sqlite-storage-idempotency.test.sqlite"
    );

    initializeSqliteStorage({ dbPath });
    const database = getSqliteDatabase()!;

    database.exec("DELETE FROM employee_employment_periods; DELETE FROM employees;");

    database.prepare(`
      INSERT INTO employees (id, employee_code, name, employment_type, status, hire_date, created_at)
      VALUES ('emp-idempotent', 'E999', '중복확인', 'regular', 'active', '2025-01-01', '2025-01-01T00:00:00.000Z');
    `).run();

    // Re-initialize storage 1st time
    closeSqliteStorage();
    initializeSqliteStorage({ dbPath });

    // Re-initialize storage 2nd time
    closeSqliteStorage();
    initializeSqliteStorage({ dbPath });

    const db = getSqliteDatabase()!;
    const periods = db.prepare(`
      SELECT * FROM employee_employment_periods WHERE employee_id = 'emp-idempotent'
    `).all();
    expect(periods).toHaveLength(1);

    closeSqliteStorage();
    resetSqliteStorageForTest();
  });

  it("should backfill assignment and wage rate employment_period_id links (N3, R4)", () => {
    const dbPath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "sqlite-storage-links.test.sqlite"
    );

    initializeSqliteStorage({ dbPath });
    const database = getSqliteDatabase()!;

    database.exec(`
      DELETE FROM employee_employment_periods;
      DELETE FROM employee_site_assignments;
      DELETE FROM wage_rates;
      DELETE FROM employees;

      INSERT INTO employees (id, employee_code, name, employment_type, status, hire_date, created_at)
      VALUES ('emp-link', 'ELINK', '연결직원', 'regular', 'active', '2024-01-01', '2024-01-01T00:00:00.000Z');

      INSERT INTO employee_employment_periods (id, employee_id, start_date, end_date, closure_provenance_complete, created_at)
      VALUES
        ('period-1', 'emp-link', '2024-01-01', '2024-12-31', 1, '2024-01-01T00:00:00.000Z'),
        ('period-2', 'emp-link', '2025-01-01', null, 1, '2025-01-01T00:00:00.000Z');

      INSERT INTO employee_site_assignments (id, employee_id, employment_period_id, site_id, start_date, end_date, status, created_at)
      VALUES
        ('asgn-1', 'emp-link', null, 'site-1', '2024-06-01', null, 'active', '2024-06-01T00:00:00.000Z'),
        ('asgn-2', 'emp-link', null, 'site-1', '2025-03-01', null, 'active', '2025-03-01T00:00:00.000Z'),
        ('asgn-3', 'emp-link', 'period-preset', 'site-1', '2025-06-01', null, 'active', '2025-06-01T00:00:00.000Z'),
        ('asgn-4', 'emp-link', null, 'site-1', '2023-01-01', null, 'active', '2023-01-01T00:00:00.000Z');

      INSERT INTO wage_rates (id, employee_id, employment_period_id, hourly_rate, effective_from, effective_to, created_at)
      VALUES
        ('wage-1', 'emp-link', null, 10000, '2024-06-01', null, '2024-06-01T00:00:00.000Z'),
        ('wage-2', 'emp-link', null, 12000, '2025-03-01', null, '2025-03-01T00:00:00.000Z'),
        ('wage-3', 'emp-link', 'period-preset', 15000, '2025-06-01', null, '2025-06-01T00:00:00.000Z'),
        ('wage-4', 'emp-link', null, 9000, '2023-01-01', null, '2023-01-01T00:00:00.000Z');
    `);

    // Re-initialize to trigger connection backfill
    closeSqliteStorage();
    initializeSqliteStorage({ dbPath });
    const db = getSqliteDatabase()!;

    const asgns = db.prepare(`
      SELECT id, employment_period_id FROM employee_site_assignments ORDER BY id
    `).all() as Array<{ id: string; employment_period_id: string | null }>;

    expect(asgns).toEqual([
      { id: "asgn-1", employment_period_id: "period-1" },
      { id: "asgn-2", employment_period_id: "period-2" },
      { id: "asgn-3", employment_period_id: "period-preset" }, // N3: existing value preserved
      { id: "asgn-4", employment_period_id: null } // N3: no candidate period, remains null
    ]);

    const wages = db.prepare(`
      SELECT id, employment_period_id FROM wage_rates ORDER BY id
    `).all() as Array<{ id: string; employment_period_id: string | null }>;

    expect(wages).toEqual([
      { id: "wage-1", employment_period_id: "period-1" },
      { id: "wage-2", employment_period_id: "period-2" },
      { id: "wage-3", employment_period_id: "period-preset" }, // N3: existing value preserved
      { id: "wage-4", employment_period_id: null } // N3: no candidate period, remains null
    ]);

    closeSqliteStorage();
    resetSqliteStorageForTest();
  });
});
