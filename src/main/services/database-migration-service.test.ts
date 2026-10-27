import crypto from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import {
  checkDatabaseMigrationRequirements,
  computeDatabaseContentFingerprint,
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate
} from "./database-migration-service";
import {
  closeSqliteStorage,
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-migration");
const userDataPath = path.resolve(testRoot, "user-data");
const dataDir = path.resolve(testRoot, "data");
const dbPath = path.resolve(dataDir, "shiftmgmt.sqlite");
const env = {
  DATA_DIR: dataDir
};

const setupTestEnvironment = () => {
  mkdirSync(testRoot, { recursive: true });
  initializeSqliteStorage({
    dbPath,
    userDataPath,
    env
  });

  saveStoredAppSettings(
    {
      holidayApiBaseUrl: "https://example.com/holidays",
      pendingDir: path.resolve(dataDir, "pending"),
      approvedDir: path.resolve(dataDir, "approved"),
      scheduleExportDir: path.resolve(dataDir, "exports"),
      allowanceProposalExportDir: path.resolve(dataDir, "allowance", "proposal"),
      allowanceAttachment1ExportDir: path.resolve(dataDir, "allowance", "attachment1"),
      allowanceAttachment2ExportDir: path.resolve(dataDir, "allowance", "attachment2"),
      databaseBackupDir: path.resolve(dataDir, "backups"),
      databaseBackupSchedule: "daily",
      databaseBackupTime: "02:00",
      migrationFilePath: ""
    },
    {
      userDataPath,
      env
    }
  );
};

const createBaselineBackupFile = async (
  filename: string,
  modifier?: (tables: Record<string, unknown[]>) => void
): Promise<{ filePath: string; sha256: string }> => {
  setupTestEnvironment();
  const backupSummary = await runDatabaseBackupNow({ userDataPath, env });
  const raw = readFileSync(backupSummary.jsonBackupPath, "utf8");
  const parsed = JSON.parse(raw) as {
    schemaVersion: number;
    sourceType: string;
    generatedAt: string;
    tableCount: number;
    rowCount: number;
    tables: Record<string, unknown[]>;
  };

  if (modifier) {
    modifier(parsed.tables);
    let totalRows = 0;
    for (const rows of Object.values(parsed.tables)) {
      if (Array.isArray(rows)) totalRows += rows.length;
    }
    parsed.rowCount = totalRows;
  }

  const filePath = path.resolve(testRoot, filename);
  const updatedBuffer = Buffer.from(JSON.stringify(parsed, null, 2), "utf8");
  writeFileSync(filePath, updatedBuffer);
  const sha256 = crypto.createHash("sha256").update(updatedBuffer).digest("hex");
  return { filePath, sha256 };
};

const createValidPerformanceFile = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "file-1",
  file_name: "test.xlsx",
  file_path: "C:\\test\\test.xlsx",
  directory_type: "approved",
  template_kind: "schedule-plan",
  template_variant: "default",
  sheet_name: "Sheet1",
  row_count: 5,
  column_count: 10,
  file_size: 5,
  modified_time_ms: 1000,
  duplicate_key: "dup-1",
  received_at: "2026-03-01T00:00:00.000Z",
  schedule_month: "2024-08",
  site_name: "SK증권",
  schedule_key: "sk",
  entry_count: 1,
  approved_entry_count: 1,
  warning_count: 0,
  is_effective: 1,
  completed_at: "2026-03-01T00:00:00.000Z",
  status: "approved",
  error_message: null,
  preview_json: JSON.stringify([{ 근무지: "SK증권", 직원명: "홍길동1", 근무날짜: "2024-08-15" }]),
  reparse_marker_snapshot_json: null,
  ...overrides
});

const createValidPerformanceEntry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "entry-nocode",
  performance_file_id: "file-1",
  logical_key: "key-1",
  employee_code: "",
  employee_name: "홍길동1",
  employee_rank: "사원",
  work_date: "2024-08-15",
  work_hours: 8,
  schedule_month: "2024-08",
  schedule_key: "sk",
  site_name: "SK증권",
  work_type: "holiday",
  section: "legal-holiday",
  duty_code: "D",
  start_time: "09:00",
  end_time: "18:00",
  break_minutes: 0,
  total_work_minutes: 480,
  base_work_minutes: 480,
  overtime_minutes: 0,
  night_minutes: 0,
  department: "보안팀",
  category: "일반",
  reason_text: null,
  evidence_text: null,
  source_signature: "sig-1",
  source_row_number: 1,
  sort_order: 1,
  team_label: "A",
  alert_json: "[]",
  hourly_rate: 10000,
  note: null,
  is_pool_worker: 0,
  substitute_work_type: null,
  target_work_type: null,
  substitute_allowance_eligible: 1,
  substitute_allowance_reason_code: null,
  substitute_allowance_policy_version: null,
  ...overrides
});

const createValidPerformanceApproval = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "approval-1",
  file_id: "file-1",
  entry_id: "entry-nocode",
  logical_key: "key-1",
  file_name: "test.xlsx",
  schedule_key: "sk",
  employee_code: "",
  employee_name: "홍길동1",
  work_date: "2024-08-15",
  work_type: "holiday",
  decision: "approved",
  processed_at: "2024-08-16T00:00:00.000Z",
  processed_by: "tester",
  processed_by_name: "테스터",
  comment: null,
  rejection_reason: null,
  snapshot_json: "{}",
  archived_file_name: null,
  archived_file_path: null,
  ...overrides
});

describe("database-migration-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should replace the current sqlite database with a json backup while preserving current settings", async () => {
    const { filePath } = await createBaselineBackupFile("backup-simple.json", (tables) => {
      tables.sites = [
        {
          id: "site-restored",
          site_code: "RESTORE-001",
          name: "복원근무지",
          customer_name: "고객사",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-03-24T01:00:00.000Z",
          updated_at: null
        }
      ];
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    expect(preview.sourceType).toBe("json");
    expect(preview.tableImpacts).toHaveLength(40);
    expect(preview.previewToken).toBeDefined();

    const summary = await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: preview.backupSha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    expect(summary.sourceType).toBe("json");
    expect(summary.tableResults).toHaveLength(40);
    expect(summary.databasePath).toBe(dbPath);
    expect(existsSync(summary.backupBeforeRestore.jsonBackupPath)).toBe(true);

    const restoredDatabase = getSqliteDatabase()!;
    const rows = restoredDatabase.prepare(`
      SELECT site_code, name
      FROM sites
      ORDER BY name ASC
    `).all() as Array<{ site_code: string; name: string }>;

    expect(rows).toEqual([
      {
        site_code: "RESTORE-001",
        name: "복원근무지"
      }
    ]);

    const settings = getStoredAppSettingsSnapshot({
      userDataPath,
      env
    });

    expect(settings.pendingDir).toBe(path.resolve(dataDir, "pending"));
    expect(settings.approvedDir).toBe(path.resolve(dataDir, "approved"));
    expect(settings.migrationFilePath).toBe(filePath);
  });

  it("should preserve approval and audit history tables across a backup→restore round trip", async () => {
    setupTestEnvironment();
    const database = getSqliteDatabase()!;

    database
      .prepare(
        `INSERT INTO access_logs
          (id, user_id, login_id, display_name, role, action_type, action_label, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "access-1",
        "user-1",
        "reviewer1",
        "검토자",
        "reviewer",
        "performance-approve",
        "실적 승인",
        "2026-06-14T01:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO allowance_approvals
          (id, calculation_id, work_month, employee_name, work_date, decision, processed_at, processed_by, processed_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "appr-1",
        "calc-1",
        "2026-03",
        "홍길동",
        "2026-03-02",
        "approved",
        "2026-06-14T01:05:00.000Z",
        "user-1",
        "검토자"
      );

    database
      .prepare(
        `INSERT INTO allowance_proposal_approvals
          (id, work_month, calculation_ids_json, calculation_count, employee_count, total_allowance_amount, export_record_id, approved_at, approved_by, approved_by_name, preview_snapshot_json, backup_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "prop-1",
        "2026-03",
        JSON.stringify(["calc-1"]),
        1,
        1,
        135450,
        "export-1",
        "2026-06-14T01:10:00.000Z",
        "user-1",
        "검토자",
        JSON.stringify({ rows: [] }),
        JSON.stringify({ jsonBackupPath: "" })
      );

    database
      .prepare(
        `INSERT INTO hidden_approved_performance_rows
          (id, approval_id, logical_key, file_id, entry_id, hidden_at, hidden_by, hidden_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "hidden-1",
        "approval-1",
        "2026-03:yuseong:OT",
        "file-1",
        "entry-1",
        "2026-06-14T01:15:00.000Z",
        "user-1",
        "검토자"
      );

    database
      .prepare(
        `INSERT INTO sites (id, site_code, name, status, timezone, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "site-sentinel-1",
        "S-SENTINEL",
        "센티널근무지",
        "active",
        "Asia/Seoul",
        "2026-06-14T01:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO employees (id, employee_code, name, employment_type, status, hire_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "emp-sentinel-1",
        "E-SENTINEL",
        "센티널직원",
        "regular",
        "active",
        "2024-01-01",
        "2024-01-01T00:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO employee_employment_periods
          (id, employee_id, start_date, end_date, closure_provenance_complete, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "period-sentinel-1",
        "emp-sentinel-1",
        "2024-01-01",
        "2024-12-31",
        1,
        "2024-01-01T00:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO employee_retirement_history_closures
          (id, employment_period_id, history_kind, history_id, previous_status, previous_end_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "closure-sentinel-1",
        "period-sentinel-1",
        "assignment",
        "asgn-sentinel-1",
        "active",
        "2024-06-30",
        "2024-07-01T00:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO employee_employment_period_events
          (id, employee_id, employment_period_id, event_type, event_date, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "event-sentinel-1",
        "emp-sentinel-1",
        "period-sentinel-1",
        "hire",
        "2024-01-01",
        "입사",
        "2024-01-01T00:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO employee_site_assignments
          (id, employee_id, employment_period_id, site_id, start_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "asgn-sentinel-1",
        "emp-sentinel-1",
        "period-sentinel-1",
        "site-sentinel-1",
        "2024-01-01",
        "active",
        "2024-01-01T00:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO wage_rates
          (id, employee_id, employment_period_id, hourly_rate, effective_from, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "wage-sentinel-1",
        "emp-sentinel-1",
        "period-sentinel-1",
        12500,
        "2024-01-01",
        "초임",
        "2024-01-01T00:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO wage_rate_history
          (id, wage_rate_id, employee_id, employment_period_id, employee_code, employee_name, action_type, hourly_rate, effective_from, wage_reason, change_reason, actor_user_id, actor_login_id, actor_display_name, actor_role, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "wrh-sentinel-1",
        "wage-sentinel-1",
        "emp-sentinel-1",
        "period-sentinel-1",
        "E-SENTINEL",
        "센티널직원",
        "create",
        12500,
        "2024-01-01",
        "초임",
        "신규",
        "user-1",
        "reviewer1",
        "검토자",
        "reviewer",
        "2024-01-01T09:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO performance_files
          (id, file_name, file_path, directory_type, template_kind, sheet_name, row_count, column_count, file_size, modified_time_ms, duplicate_key, received_at, status, preview_json, reparse_marker_snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "file-sentinel-1",
        "test.xlsx",
        "c:/test.xlsx",
        "approved",
        "normal",
        "Sheet1",
        1,
        1,
        100,
        1000,
        "dup-sentinel-1",
        "2024-01-01T00:00:00.000Z",
        "approved",
        "[]",
        '{"marker":"sentinel-snapshot"}'
      );

    const backupSummary = await runDatabaseBackupNow({ userDataPath, env });
    const migrationFilePath = path.resolve(testRoot, "restore-source.json");
    copyFileSync(backupSummary.jsonBackupPath, migrationFilePath);

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: migrationFilePath,
      env
    });

    const summary = await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: migrationFilePath,
      backupSha256: preview.backupSha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    expect(summary.tableResults).toHaveLength(40);

    const restoredDatabase = getSqliteDatabase()!;
    const hasId = (tableName: string, id: string) =>
      (
        restoredDatabase
          .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE id = ?`)
          .get(id) as { count: number }
      ).count;

    expect(hasId("allowance_approvals", "appr-1")).toBe(1);
    expect(hasId("allowance_proposal_approvals", "prop-1")).toBe(1);
    expect(hasId("hidden_approved_performance_rows", "hidden-1")).toBe(1);
    expect(hasId("access_logs", "access-1")).toBe(1);

    expect(hasId("employee_employment_periods", "period-sentinel-1")).toBe(1);
    expect(hasId("employee_retirement_history_closures", "closure-sentinel-1")).toBe(1);
    expect(hasId("employee_employment_period_events", "event-sentinel-1")).toBe(1);
    expect(hasId("wage_rate_history", "wrh-sentinel-1")).toBe(1);

    const asgnRow = restoredDatabase
      .prepare(`SELECT employment_period_id FROM employee_site_assignments WHERE id = ?`)
      .get("asgn-sentinel-1") as { employment_period_id: string | null };
    expect(asgnRow.employment_period_id).toBe("period-sentinel-1");

    const wageRow = restoredDatabase
      .prepare(`SELECT employment_period_id FROM wage_rates WHERE id = ?`)
      .get("wage-sentinel-1") as { employment_period_id: string | null };
    expect(wageRow.employment_period_id).toBe("period-sentinel-1");

    const fileRow = restoredDatabase
      .prepare(`SELECT reparse_marker_snapshot_json FROM performance_files WHERE id = ?`)
      .get("file-sentinel-1") as { reparse_marker_snapshot_json: string | null };
    expect(fileRow.reparse_marker_snapshot_json).toBe('{"marker":"sentinel-snapshot"}');
  });

  it("should preview a json backup without replacing the current database", async () => {
    const { filePath } = await createBaselineBackupFile("preview-backup.json", (tables) => {
      tables.sites = [
        {
          id: "site-preview",
          site_code: "PREVIEW-001",
          name: "미리보기근무지",
          customer_name: "고객사",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-03-24T01:00:00.000Z",
          updated_at: null
        }
      ];
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    expect(preview.sourceType).toBe("json");
    expect(preview.tableImpacts).toHaveLength(40);
    expect(preview.previewToken).toBeDefined();

    const siteImpact = preview.tableImpacts.find((t) => t.tableName === "sites");
    expect(siteImpact?.nextRowCount).toBe(1);

    const currentRows = getSqliteDatabase()!.prepare(`
      SELECT site_code, name FROM sites WHERE site_code = 'PREVIEW-001'
    `).all();
    expect(currentRows).toHaveLength(0);
  });

  it("should mark json migration requirements as ready without additional runtime checks", async () => {
    const { filePath } = await createBaselineBackupFile("requirements-backup.json");

    const requirementCheck = checkDatabaseMigrationRequirements({
      backupFilePath: filePath
    });

    expect(requirementCheck.sourceType).toBe("json");
    expect(requirementCheck.isReady).toBe(true);
    expect(requirementCheck.status).toBe("ready");
  });

  it("should reject directory paths before checking migration requirements", () => {
    const migrationDirectoryPath = path.resolve(testRoot, "migration-dir");
    mkdirSync(migrationDirectoryPath, { recursive: true });

    const requirementCheck = checkDatabaseMigrationRequirements({
      backupFilePath: migrationDirectoryPath
    });

    expect(requirementCheck.isReady).toBe(false);
    expect(requirementCheck.status).toBe("check-failed");
  });

  // N1: .accdb / .xlsx 파일 거부
  it("N1: should reject non-json files (.accdb, .xlsx) in requirement check, preview, and update", async () => {
    mkdirSync(testRoot, { recursive: true });
    const accdbPath = path.resolve(testRoot, "legacy.accdb");
    const xlsxPath = path.resolve(testRoot, "sample.xlsx");
    writeFileSync(accdbPath, "mock accdb content");
    writeFileSync(xlsxPath, "mock xlsx content");

    const check = checkDatabaseMigrationRequirements({ backupFilePath: accdbPath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");

    expect(() => previewDatabaseMigrationUpdate({ userDataPath, backupFilePath: accdbPath, env })).toThrow(
      "지원하지 않는 복원 파일 형식입니다. JSON 백업(.json)만 사용할 수 있습니다."
    );
    await expect(
      runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: xlsxPath,
        backupSha256: "sha-1",
        previewToken: "tok-1",
        confirmationText: "교체",
        env
      })
    ).rejects.toThrow("지원하지 않는 복원 파일 형식입니다. JSON 백업(.json)만 사용할 수 있습니다.");
  });

  // N2: JSON 구문 오류, schemaVersion!=1, 필수 40표 누락 거절
  it("N2: should reject invalid json syntax, schemaVersion != 1, or missing tables", async () => {
    mkdirSync(testRoot, { recursive: true });
    const invalidJsonPath = path.resolve(testRoot, "syntax-error.json");
    writeFileSync(invalidJsonPath, "{ invalid json text }");

    expect(() => previewDatabaseMigrationUpdate({ userDataPath, backupFilePath: invalidJsonPath, env })).toThrow(
      "백업 파일 JSON 구문 분석에 실패했습니다"
    );

    const wrongVersionPath = path.resolve(testRoot, "wrong-version.json");
    writeFileSync(wrongVersionPath, JSON.stringify({ schemaVersion: 2, tables: {} }));
    expect(() => previewDatabaseMigrationUpdate({ userDataPath, backupFilePath: wrongVersionPath, env })).toThrow(
      "지원하지 않는 백업 버전입니다. (지원 버전: 1, 백업 파일 버전: 2)"
    );

    const missingTablesPath = path.resolve(testRoot, "missing-tables.json");
    writeFileSync(missingTablesPath, JSON.stringify({ schemaVersion: 1, tables: { sites: [] } }));
    expect(() => previewDatabaseMigrationUpdate({ userDataPath, backupFilePath: missingTablesPath, env })).toThrow(
      "백업 JSON에 필수 표가 누락되었습니다"
    );
  });

  // N3: 업무 설정 6키 누락 시 거절
  it("N3: should reject backup when required business settings (6 keys) are missing", async () => {
    const { filePath } = await createBaselineBackupFile("missing-biz-key.json", (tables) => {
      tables.app_setting_entries = (tables.app_setting_entries as Array<{ setting_key: string }>).filter(
        (r) => r.setting_key !== "schedule_consecutive_night_limit"
      );
    });

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("백업 JSON에 필수 업무 규칙 설정 키가 누락되었습니다: schedule_consecutive_night_limit");
  });

  // N4: confirmationText 오타, 변조된 토큰, 변조된 SHA 거절
  it("N4: should reject restore when confirmationText is invalid, token is invalid, or file is modified", async () => {
    const { filePath } = await createBaselineBackupFile("token-test.json");

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    // 1. 확인 문구 오타
    await expect(
      runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        backupSha256: preview.backupSha256,
        previewToken: preview.previewToken,
        confirmationText: "교체확인" as "교체",
        env
      })
    ).rejects.toThrow("확인 문구가 올바르지 않습니다. 정확히 '교체'를 입력해야 합니다.");

    // 2. 잘못된 토큰
    await expect(
      runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        backupSha256: preview.backupSha256,
        previewToken: "invalid-random-token",
        confirmationText: "교체",
        env
      })
    ).rejects.toThrow("유효하지 않거나 만료된 미리보기 토큰입니다.");

    // 3. 파일 내용 변경 (SHA 불일치)
    writeFileSync(filePath, readFileSync(filePath, "utf8") + " ");
    await expect(
      runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        backupSha256: preview.backupSha256,
        previewToken: preview.previewToken,
        confirmationText: "교체",
        env
      })
    ).rejects.toThrow("미리보기 이후 백업 파일이 변경되었습니다.");
  });

  // N5: HTTP preview 콜백이 access_logs를 추가해도 토큰이 유효하게 실행 성공
  it("N5: should succeed when preview onPreviewSuccess callback records access_logs before token issuance", async () => {
    const { filePath } = await createBaselineBackupFile("preview-activity.json");

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      onPreviewSuccess: () => {
        const liveDb = getSqliteDatabase()!;
        liveDb
          .prepare(
            `INSERT INTO access_logs (id, user_id, login_id, display_name, role, action_type, action_label, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            `log-${Date.now()}`,
            "admin-1",
            "admin",
            "관리자",
            "admin",
            "database-migration-preview",
            "DB 복원 미리보기",
            new Date().toISOString()
          );
      },
      env
    });

    // 활동 이록 추가 후 발급된 토큰으로 실행이 정상 완료되어야 함 (자기 무효화 없음)
    const result = await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: preview.backupSha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    expect(result.tableResults).toHaveLength(40);
  });

  // N7 (DEC-001): 사번 없는 실적에 승인/숨김/수당 계산 이력이 있으면 롤백 및 거절
  it("N7: should fail and rollback JSON restore if unassigned non-BP entry has linked approvals or calculations", async () => {
    const { filePath } = await createBaselineBackupFile("n7-linked-entry.json", (tables) => {
      tables.performance_files = [
        createValidPerformanceFile()
      ];
      tables.performance_entries = [
        createValidPerformanceEntry()
      ];
      tables.performance_approvals = [
        createValidPerformanceApproval()
      ];
    });

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("승인/숨김/수당 계산 이력이 연결되어 있어");
  });

  // N8 (DEC-001): 사번 없는 안전한 비-BP 실적 1건 제거 및 파일 메타데이터 갱신
  it("N8: should safely remove unassigned non-BP entry and update performance_files metadata", async () => {
    const { filePath } = await createBaselineBackupFile("n8-safe-entry.json", (tables) => {
      tables.performance_files = [
        createValidPerformanceFile({
          entry_count: 2,
          approved_entry_count: 2,
          warning_count: 1,
          preview_json: JSON.stringify([
            { 근무지: "SK증권", 직원명: "오영빈", 근무날짜: "2024-08-16" },
            { 근무지: "SK증권", 직원명: "홍길동1", 근무날짜: "2024-08-15" }
          ])
        })
      ];
      tables.performance_entries = [
        createValidPerformanceEntry({
          id: "entry-valid",
          logical_key: "key-valid",
          employee_name: "오영빈",
          employee_code: "EMP-001",
          work_date: "2024-08-16",
          work_type: "substitute",
          section: "substitute",
          source_row_number: 1,
          sort_order: 1
        }),
        createValidPerformanceEntry({
          id: "entry-nocode",
          logical_key: "key-nocode",
          employee_name: "홍길동1",
          employee_code: "",
          work_date: "2024-08-15",
          work_type: "holiday",
          section: "legal-holiday",
          source_row_number: 2,
          sort_order: 2,
          alert_json: JSON.stringify([{ severity: "warning", message: "경고 메시지" }])
        })
      ];
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    expect(
      preview.warningMessages.some((msg) =>
        msg.includes("백업 JSON의 사번 없는 실적 1건을 V4 복원 대상에서 제거했습니다")
      )
    ).toBe(true);

    const summary = await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: preview.backupSha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    expect(
      summary.warningMessages.some((msg) =>
        msg.includes("백업 JSON의 사번 없는 실적 1건을 V4 복원 대상에서 제거했습니다")
      )
    ).toBe(true);

    const db = getSqliteDatabase()!;
    const remainingEntries = db.prepare("SELECT * FROM performance_entries WHERE performance_file_id = 'file-1'").all() as Array<{ id: string }>;
    expect(remainingEntries).toHaveLength(1);
    expect(remainingEntries[0]?.id).toBe("entry-valid");

    const updatedFile = db.prepare("SELECT * FROM performance_files WHERE id = ?").get("file-1") as {
      entry_count: number;
      approved_entry_count: number;
      warning_count: number;
      preview_json: string;
    } | undefined;
    expect(updatedFile).toBeDefined();
    expect(updatedFile?.entry_count).toBe(1);
    expect(updatedFile?.approved_entry_count).toBe(1);
    expect(updatedFile?.warning_count).toBe(0);

    const previewJson = JSON.parse(updatedFile?.preview_json ?? "[]") as Array<{ 직원명: string }>;
    expect(previewJson).toHaveLength(1);
    expect(previewJson[0]?.직원명).toBe("오영빈");
  });

  // N7 ambiguity: preview 대응 행이 2개 이상일 때 모호성으로 거절
  it("N7: should abort and rollback JSON restore when unassigned entry has multiple matching preview rows", async () => {
    const { filePath } = await createBaselineBackupFile("n7-ambiguity.json", (tables) => {
      tables.performance_files = [
        createValidPerformanceFile({
          preview_json: JSON.stringify([
            { 근무지: "SK증권", 직원명: "홍길동1", 근무날짜: "2024-08-15" },
            { 근무지: "SK증권", 직원명: "홍길동1", 근무날짜: "2024-08-15" }
          ])
        })
      ];
      tables.performance_entries = [
        createValidPerformanceEntry({
          id: "entry-nocode",
          logical_key: "key-nocode",
          employee_name: "홍길동1",
          employee_code: "",
          work_date: "2024-08-15",
          work_type: "holiday",
          section: "legal-holiday",
          source_row_number: 1,
          sort_order: 1
        })
      ];
    });

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("preview 행이 2개로 모호하여 복원을 중단했습니다");
  });

  // --- C01: 대상 운영 설정 보존 및 업무 규칙 복원 ---
  it("C01: should preserve existing operating settings (patch note/skip version/existing marker) and restore business rule keys from JSON", async () => {
    setupTestEnvironment();
    const liveDb = getSqliteDatabase()!;
    liveDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)").run("update_last_seen_patch_note_version", "v1.5.0", "2026-09-01T00:00:00.000Z");
    liveDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)").run("update_last_skipped_version", "v1.4.0", "2026-09-01T00:00:00.000Z");
    liveDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)").run("substitute_allowance_policy_reparse_marker", "2026-09-10T12:00:00.000Z", "2026-09-10T12:00:00.000Z");

    const { filePath, sha256 } = await createBaselineBackupFile("c01-operating.json", (tables) => {
      const settings = tables.app_setting_entries as Array<Record<string, unknown>>;
      const nightLimitRow = settings.find((r) => r.setting_key === "schedule_consecutive_night_limit");
      if (nightLimitRow) nightLimitRow.value = "5";
      const patchRow = settings.find((r) => r.setting_key === "update_last_seen_patch_note_version");
      if (patchRow) patchRow.value = "v9.9.9";
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    const previewSettingsImpact = preview.tableImpacts.find((t) => t.tableName === "app_setting_entries");
    expect(previewSettingsImpact).toBeDefined();

    const result = await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: sha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    const resultSettingsImpact = result.tableResults.find((t) => t.tableName === "app_setting_entries");
    expect(resultSettingsImpact?.nextRowCount).toBe(previewSettingsImpact?.nextRowCount);

    const afterDb = getSqliteDatabase()!;
    const rows = afterDb.prepare("SELECT setting_key, value FROM app_setting_entries").all() as Array<{ setting_key: string; value: string }>;
    const settingMap = new Map(rows.map((r) => [r.setting_key, r.value]));

    expect(settingMap.get("update_last_seen_patch_note_version")).toBe("v1.5.0");
    expect(settingMap.get("update_last_skipped_version")).toBe("v1.4.0");
    expect(settingMap.get("substitute_allowance_policy_reparse_marker")).toBe("2026-09-10T12:00:00.000Z");
    expect(settingMap.get("schedule_consecutive_night_limit")).toBe("5");
  });

  it("C01: should NOT create optional operating keys when absent from target device DB", async () => {
    setupTestEnvironment();
    const liveDb = getSqliteDatabase()!;
    liveDb.prepare("DELETE FROM app_setting_entries WHERE setting_key IN ('update_last_seen_patch_note_version', 'update_last_skipped_version', 'substitute_allowance_policy_reparse_marker')").run();

    const { filePath, sha256 } = await createBaselineBackupFile("c01-no-optional.json", (tables) => {
      const settings = tables.app_setting_entries as Array<Record<string, unknown>>;
      settings.push({ setting_key: "update_last_seen_patch_note_version", value: "v9.9.9", updated_at: "2026-09-01T00:00:00.000Z" });
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: sha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    const afterDb = getSqliteDatabase()!;
    const rows = afterDb.prepare("SELECT setting_key, value FROM app_setting_entries").all() as Array<{ setting_key: string; value: string }>;
    const settingMap = new Map(rows.map((r) => [r.setting_key, r.value]));

    expect(settingMap.has("update_last_seen_patch_note_version")).toBe(false);
    expect(settingMap.has("update_last_skipped_version")).toBe(false);
    expect(settingMap.has("substitute_allowance_policy_reparse_marker")).toBe(false);
  });

  it("C01: should generate new reparse marker when policy date is changed", async () => {
    setupTestEnvironment();
    const { filePath, sha256 } = await createBaselineBackupFile("c01-policy-changed.json", (tables) => {
      const settings = tables.app_setting_entries as Array<Record<string, unknown>>;
      const policyRow = settings.find((r) => r.setting_key === "substitute_allowance_policy_effective_from");
      if (policyRow) {
        policyRow.value = "2025-01-01";
      }
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    await runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: sha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    const afterDb = getSqliteDatabase()!;
    const markerRow = afterDb.prepare("SELECT value FROM app_setting_entries WHERE setting_key = 'substitute_allowance_policy_reparse_marker'").get() as { value: string } | undefined;
    expect(markerRow).toBeDefined();
    expect(markerRow?.value).toBeTruthy();
  });

  // --- C02: JSON 데이터 유효성 및 행/열 무결성 검증 ---
  it("C02: should reject backup containing unknown tables (e.g. 41st table) in check and preview", async () => {
    const { filePath } = await createBaselineBackupFile("c02-unknown-table.json", (tables) => {
      (tables as Record<string, unknown[]>).unknown_extra_table = [{ id: "extra-1", col: "val" }];
    });

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("정규 스키마와 일치하지 않습니다");
  });

  it("C02: should reject backup when app_setting_entries value is a number (e.g. 3) in check and preview (execution blocked without token)", async () => {
    const { filePath } = await createBaselineBackupFile("c02-setting-number-val.json", (tables) => {
      const settings = tables.app_setting_entries as Array<Record<string, unknown>>;
      const row = settings.find((r) => r.setting_key === "schedule_consecutive_night_limit");
      if (row) {
        row.value = 3; // number instead of string "3"
      }
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    // 1. checkDatabaseMigrationRequirements: isReady false, status check-failed
    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("문자열"))).toBe(true);

    // 2. previewDatabaseMigrationUpdate: throw error
    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("문자열");

    // Live DB unmodified
    const liveDbAfter = getSqliteDatabase()!;
    const fpAfter = computeDatabaseContentFingerprint(liveDbAfter);
    expect(fpAfter).toBe(fpBefore);
  });

  it("C02: should reject backup when sites row is missing updated_at in check and preview (execution blocked without token)", async () => {
    const { filePath } = await createBaselineBackupFile("c02-missing-updated-at.json", (tables) => {
      tables.sites = [
        {
          id: "site-no-updated-at",
          site_code: "S01",
          name: "지점1",
          customer_name: "고객사1",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01"
          // updated_at missing!
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    // 1. checkDatabaseMigrationRequirements: isReady false, status check-failed
    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("누락 컬럼: updated_at"))).toBe(true);

    // 2. previewDatabaseMigrationUpdate: throw error
    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("누락 컬럼: updated_at");

    // Live DB unmodified
    const liveDbAfter = getSqliteDatabase()!;
    const fpAfter = computeDatabaseContentFingerprint(liveDbAfter);
    expect(fpAfter).toBe(fpBefore);
  });

  it("C02: should reject backup when sites row has mystery_col in check and preview (execution blocked without token)", async () => {
    const { filePath } = await createBaselineBackupFile("c02-unknown-col.json", (tables) => {
      tables.sites = [
        {
          id: "site-extra-col",
          site_code: "S01",
          name: "지점1",
          customer_name: "고객사1",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          mystery_col: "unknown_value"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    // 1. checkDatabaseMigrationRequirements: isReady false, status check-failed
    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("알 수 없는 컬럼: mystery_col"))).toBe(true);

    // 2. previewDatabaseMigrationUpdate: throw error
    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("알 수 없는 컬럼: mystery_col");

    // Live DB unmodified
    const liveDbAfter = getSqliteDatabase()!;
    const fpAfter = computeDatabaseContentFingerprint(liveDbAfter);
    expect(fpAfter).toBe(fpBefore);
  });

  it("C02: should reject backup when subsequent row has extra or missing columns", async () => {
    const { filePath } = await createBaselineBackupFile("c02-extra-col.json", (tables) => {
      tables.sites = [
        { id: "site-1", site_code: "S01", name: "지점1", customer_name: "고객1", status: "active", timezone: "Asia/Seoul", deleted_at: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: "site-2", site_code: "S02", name: "지점2", customer_name: "고객2", status: "active", timezone: "Asia/Seoul", deleted_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", extra_column_bad: "surprise" }
      ];
    });

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("알 수 없는 컬럼: extra_column_bad");
  });

  it("C02: should reject non-integer, non-positive or invalid business rule numbers", async () => {
    const { filePath } = await createBaselineBackupFile("c02-bad-number.json", (tables) => {
      const settings = tables.app_setting_entries as Array<Record<string, unknown>>;
      const row = settings.find((r) => r.setting_key === "schedule_consecutive_night_limit");
      if (row) row.value = "0";
    });

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.details.some((d) => d.includes("1 이상 정수"))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("1 이상 정수");
  });

  it("C02: should reject non-existent calendar dates (e.g. 2026-02-30)", async () => {
    const { filePath } = await createBaselineBackupFile("c02-bad-date.json", (tables) => {
      const settings = tables.app_setting_entries as Array<Record<string, unknown>>;
      const row = settings.find((r) => r.setting_key === "substitute_allowance_policy_effective_from");
      if (row) row.value = "2026-02-30";
    });

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("존재하지 않는 달력일");
  });


  // --- C02: 40표 457열 전체 계약 정합성 및 타입/NULL 엄격 검증 (§4.2, §4.5) ---
  it("C02: should verify 40 tables / 457 columns contract against isolated DB PRAGMA table_info", async () => {
    const inspectDbDir = path.resolve(testRoot, "pragma-inspect");
    mkdirSync(inspectDbDir, { recursive: true });
    const inspectDbPath = path.resolve(inspectDbDir, "inspect.sqlite");
    if (existsSync(inspectDbPath)) rmSync(inspectDbPath, { force: true });

    const inspectStorage = initializeSqliteStorage({
      dbPath: inspectDbPath,
      userDataPath: inspectDbDir,
      env: { DATA_DIR: inspectDbDir }
    });
    const inspectDb = inspectStorage.database;

    const tables = (inspectDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables.length).toBe(40);

    const schemaInfo: Record<string, Array<{ name: string; type: string; notnull: number }>> = {};
    let totalCols = 0;
    let textCols = 0;
    let intCols = 0;
    let realCols = 0;
    let notNullCols = 0;

    for (const t of tables) {
      const cols = inspectDb.prepare(`PRAGMA table_info("${t}")`).all() as Array<{ name: string; type: string; notnull: number }>;
      schemaInfo[t] = cols;
      totalCols += cols.length;
      for (const c of cols) {
        const type = c.type.toUpperCase();
        if (type.includes("INT")) intCols++;
        else if (type.includes("REAL")) realCols++;
        else textCols++;
        if (c.notnull === 1) notNullCols++;
      }
    }

    // 40표 457열, TEXT 379, INTEGER 72, REAL 6, 명시적 NOT NULL 277 실측 일치 단언
    expect(totalCols).toBe(457);
    expect(textCols).toBe(379);
    expect(intCols).toBe(72);
    expect(realCols).toBe(6);
    expect(notNullCols).toBe(277);

    closeSqliteStorage();
    rmSync(inspectDbDir, { recursive: true, force: true });

    // 기본 40표 fixture (39표 빈 배열, app_setting_entries는 유효한 6개 업무 설정)
    const validBusinessSettings = [
      { setting_key: "schedule_consecutive_night_limit", value: "2", updated_at: "2026-01-01T00:00:00.000Z" },
      { setting_key: "schedule_minimum_rest_minutes", value: "660", updated_at: "2026-01-01T00:00:00.000Z" },
      { setting_key: "schedule_require_weekly_holiday", value: "true", updated_at: "2026-01-01T00:00:00.000Z" },
      { setting_key: "schedule_weekly_max_minutes", value: "3120", updated_at: "2026-01-01T00:00:00.000Z" },
      { setting_key: "substitute_allowance_policy_effective_from", value: "2026-01-01", updated_at: "2026-01-01T00:00:00.000Z" },
      { setting_key: "changed_slot_priority_effective_from", value: "2026-01-01", updated_at: "2026-01-01T00:00:00.000Z" }
    ];

    const baseTables: Record<string, unknown[]> = {};
    for (const t of tables) {
      baseTables[t] = t === "app_setting_entries" ? [...validBusinessSettings] : [];
    }

    const tmpFixturePath = path.resolve(testRoot, "contract-check-fixture.json");
    const writeFixture = (obj: Record<string, unknown[]>) => {
      writeFileSync(tmpFixturePath, JSON.stringify({
        schemaVersion: 1,
        sourceType: "sqlite-json",
        createdAt: new Date().toISOString(),
        tables: obj
      }));
    };

    // 40개 표 457개 열 각각에 대해 타입 위반 및 NOT NULL 위반 검사
    for (const t of tables) {
      if (t === "app_setting_entries") continue; // 업무 설정은 전용 테스트로 검증

      const cols = schemaInfo[t];
      const validRow: Record<string, unknown> = {};
      for (const c of cols) {
        const type = c.type.toUpperCase();
        if (type.includes("INT") || type.includes("REAL")) {
          validRow[c.name] = 1;
        } else {
          validRow[c.name] = c.notnull === 1 ? "valid_str" : null;
        }
      }

      // 1. 해당 표에 완전한 합성 1행을 넣었을 때 check 통과
      writeFixture({ ...baseTables, [t]: [validRow] });
      const validCheck = checkDatabaseMigrationRequirements({ backupFilePath: tmpFixturePath });
      expect(validCheck.isReady).toBe(true);

      // 2. 표의 각 열별 타입 위반 및 NOT NULL 위반 검사
      for (const c of cols) {
        const isNum = c.type.toUpperCase().includes("INT") || c.type.toUpperCase().includes("REAL");

        // 잘못된 타입 거절 단언
        const badTypeRow = { ...validRow, [c.name]: isNum ? "bad_str" : 99999 };
        writeFixture({ ...baseTables, [t]: [badTypeRow] });
        const badTypeCheck = checkDatabaseMigrationRequirements({ backupFilePath: tmpFixturePath });
        expect(badTypeCheck.isReady).toBe(false);
        expect(badTypeCheck.status).toBe("check-failed");
        expect(badTypeCheck.details.some((d) => d.includes(t) && d.includes(c.name))).toBe(true);

        // NOT NULL 제약 위반 거절 단언
        if (c.notnull === 1) {
          const nullRow = { ...validRow, [c.name]: null };
          writeFixture({ ...baseTables, [t]: [nullRow] });
          const nullCheck = checkDatabaseMigrationRequirements({ backupFilePath: tmpFixturePath });
          expect(nullCheck.isReady).toBe(false);
          expect(nullCheck.status).toBe("check-failed");
          expect(nullCheck.details.some((d) => d.includes(t) && d.includes(c.name))).toBe(true);
        }
      }

      // 3. 표별 열 누락 시험
      const missingColRow = { ...validRow };
      delete missingColRow[cols[0].name];
      writeFixture({ ...baseTables, [t]: [missingColRow] });
      const missingCheck = checkDatabaseMigrationRequirements({ backupFilePath: tmpFixturePath });
      expect(missingCheck.isReady).toBe(false);
      expect(missingCheck.details.some((d) => d.includes("누락 컬럼"))).toBe(true);

      // 4. 표별 열 추가 시험
      const unknownColRow = { ...validRow, mystery_extra_column: "extra" };
      writeFixture({ ...baseTables, [t]: [unknownColRow] });
      const unknownCheck = checkDatabaseMigrationRequirements({ backupFilePath: tmpFixturePath });
      expect(unknownCheck.isReady).toBe(false);
      expect(unknownCheck.details.some((d) => d.includes("알 수 없는 컬럼"))).toBe(true);
    }

    if (existsSync(tmpFixturePath)) rmSync(tmpFixturePath, { force: true });
  });

  it("C02: should reject sites.id=42 (number in TEXT column) in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-sites-id-42.json", (tables) => {
      tables.sites = [
        {
          id: 42, // number instead of string
          site_code: "S01",
          name: "지점1",
          customer_name: "고객사1",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("sites") && d.includes("id") && (d.includes("TEXT") || d.includes("문자열")))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("TEXT");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02: should reject sites.id={bad: 'object'} (object in TEXT column) in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-sites-id-object.json", (tables) => {
      tables.sites = [
        {
          id: { bad: "object" }, // object instead of string
          site_code: "S01",
          name: "지점1",
          customer_name: "고객사1",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("sites") && d.includes("id") && (d.includes("TEXT") || d.includes("문자열")))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("TEXT");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02: should reject NOT NULL violation when null is provided to non-nullable column in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-not-null-violation.json", (tables) => {
      tables.sites = [
        {
          id: "site-1",
          site_code: null, // NOT NULL column given null!
          name: "지점1",
          customer_name: null, // customer_name is nullable (allowed)
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("sites") && d.includes("site_code") && d.includes("NOT NULL"))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("NOT NULL");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02: should reject type violation in subsequent rows (e.g. 2nd row)", async () => {
    const { filePath } = await createBaselineBackupFile("c02-bad-second-row.json", (tables) => {
      tables.sites = [
        {
          id: "site-1",
          site_code: "S01",
          name: "지점1",
          customer_name: "고객1",
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        },
        {
          id: "site-2",
          site_code: "S02",
          name: "지점2",
          customer_name: "고객2",
          status: 12345, // 2nd row has invalid number in TEXT column
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("2번째 행") && d.includes("status"))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("2번째 행");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02-T1: should reject sites.id=true (boolean in TEXT column) in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-t1-text-bool.json", (tables) => {
      tables.sites = [
        {
          id: true, // boolean in TEXT column
          site_code: "S01",
          name: "지점1",
          customer_name: null,
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("sites") && d.includes("id") && (d.includes("TEXT") || d.includes("문자열")))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("TEXT");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02-T1: should reject employee_site_assignments.sort_order={bad: 'object'} (object in INTEGER column) in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-t1-int-obj.json", (tables) => {
      tables.employee_site_assignments = [
        {
          id: "assign-1",
          employee_id: "emp-1",
          employment_period_id: null,
          site_id: "site-1",
          team_name: null,
          shift_group: null,
          sort_order: { bad: "object" }, // object in INTEGER column
          start_date: "2026-01-01",
          end_date: null,
          status: "active",
          created_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("employee_site_assignments") && d.includes("sort_order") && (d.includes("INTEGER") || d.includes("숫자")))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("INTEGER");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02-T1: should reject employee_site_assignments.sort_order=false (boolean in INTEGER column) in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-t1-int-bool.json", (tables) => {
      tables.employee_site_assignments = [
        {
          id: "assign-1",
          employee_id: "emp-1",
          employment_period_id: null,
          site_id: "site-1",
          team_name: null,
          shift_group: null,
          sort_order: false, // boolean in INTEGER column
          start_date: "2026-01-01",
          end_date: null,
          status: "active",
          created_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("employee_site_assignments") && d.includes("sort_order") && (d.includes("INTEGER") || d.includes("숫자")))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("INTEGER");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02-T1: should reject allowance_calculation_items.multiplier={bad: 'object'} (object in REAL column) in check, preview, and keep live DB intact", async () => {
    const { filePath } = await createBaselineBackupFile("c02-t1-real-obj.json", (tables) => {
      tables.allowance_calculation_items = [
        {
          id: "item-1",
          calculation_id: "calc-1",
          allowance_code: "OT",
          work_minutes: 120,
          multiplier: { bad: "object" }, // object in REAL column
          amount: 15000,
          detail_json: null
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("allowance_calculation_items") && d.includes("multiplier") && (d.includes("REAL") || d.includes("숫자")))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("REAL");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02: should reject invalid types in INTEGER and REAL columns (string, object, boolean)", async () => {
    const { filePath } = await createBaselineBackupFile("c02-bad-number-types.json", (tables) => {
      tables.employee_site_assignments = [
        {
          id: "assign-1",
          employee_id: "emp-1",
          employment_period_id: null,
          site_id: "site-1",
          team_name: null,
          shift_group: null,
          sort_order: "first", // string in INTEGER column
          start_date: "2026-01-01",
          end_date: null,
          status: "active",
          created_at: "2026-01-01"
        }
      ];
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(false);
    expect(check.status).toBe("check-failed");
    expect(check.details.some((d) => d.includes("sort_order") && d.includes("INTEGER"))).toBe(true);

    expect(() =>
      previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        env
      })
    ).toThrow("INTEGER");

    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  it("C02: should permit floating-point numbers in INTEGER declared columns as observed in real V3 data", async () => {
    const { filePath } = await createBaselineBackupFile("c02-v3-float-in-int.json", (tables) => {
      // V3 INTEGER 선언 열의 실제 소수 데이터 패턴 재현
      tables.wage_rates = [
        {
          id: "wage-1",
          employee_id: "emp-1",
          employment_period_id: null,
          hourly_rate: 12500.5, // float in INTEGER declared column
          effective_from: "2026-01-01",
          effective_to: null,
          reason: "테스트",
          created_at: "2026-01-01"
        }
      ];
      tables.allowance_calculation_items = [
        {
          id: "item-1",
          calculation_id: "calc-1",
          allowance_code: "OT",
          work_minutes: 120,
          multiplier: 1.5,
          amount: 25410.75, // float in INTEGER declared column
          detail_json: null
        }
      ];
    });

    const check = checkDatabaseMigrationRequirements({ backupFilePath: filePath });
    expect(check.isReady).toBe(true);
    expect(check.status).toBe("ready");

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });
    expect(preview.sourceType).toBe("json");
  });

  it("C02: should block execution with modified corrupted backup file via previewToken SHA mismatch and preserve live DB and pre-backup", async () => {
    setupTestEnvironment();
    const { filePath, sha256 } = await createBaselineBackupFile("c02-tampered-execute.json", (tables) => {
      tables.sites = [
        {
          id: "site-valid",
          site_code: "S-VALID",
          name: "정상지점",
          customer_name: null,
          status: "active",
          timezone: "Asia/Seoul",
          deleted_at: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }
      ];
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    const liveDbBefore = getSqliteDatabase()!;
    const fpBefore = computeDatabaseContentFingerprint(liveDbBefore);

    // C02-T2: 실행 직전 dataDir/backups/json 파일명 및 바이트 SHA-256 스냅샷
    const backupJsonDir = path.resolve(dataDir, "backups", "json");
    const getBackupSnapshot = () => {
      if (!existsSync(backupJsonDir)) return [];
      const files = readdirSync(backupJsonDir).filter((f) => f.endsWith(".json")).sort();
      return files.map((file) => {
        const fullPath = path.resolve(backupJsonDir, file);
        const bytes = readFileSync(fullPath);
        const hash = crypto.createHash("sha256").update(bytes).digest("hex");
        return { file, hash };
      });
    };

    const backupSnapshotBefore = getBackupSnapshot();

    // 미리보기 토큰 발급 후 백업 파일에 불량 값(sites.id=42)을 주입하여 변조
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.tables.sites[0].id = 42;
    writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");

    // 실행 시도 시 SHA 불일치로 차단 (실행 단계 셀 타입 직접 검사가 아닌 실시간 파일 SHA 대조로 차단)
    await expect(
      runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        backupSha256: sha256,
        previewToken: preview.previewToken,
        confirmationText: "교체",
        env
      })
    ).rejects.toThrow("미리보기 이후 백업 파일이 변경되었습니다");

    // C02-T2: 실행 직후 백업 파일명 및 바이트 SHA-256 불변 단언 (기존 파일 불변 및 새 사전 백업 미생성)
    const backupSnapshotAfter = getBackupSnapshot();
    expect(backupSnapshotAfter).toEqual(backupSnapshotBefore);

    // 라이브 DB 내용 불변 단언
    const liveDbAfter = getSqliteDatabase()!;
    expect(computeDatabaseContentFingerprint(liveDbAfter)).toBe(fpBefore);
  });

  // --- C03: 지문 구분자 충돌 방지 및 await 중 DB 쓰기 감지 ---
  it("C03: should prevent delimiter collision in database fingerprint calculation", () => {
    const db1 = new DatabaseSync(":memory:");
    db1.exec("CREATE TABLE test_tab (a TEXT, b TEXT);");
    db1.prepare("INSERT INTO test_tab (a, b) VALUES (?, ?)").run("x;b=y", "z");

    const db2 = new DatabaseSync(":memory:");
    db2.exec("CREATE TABLE test_tab (a TEXT, b TEXT);");
    db2.prepare("INSERT INTO test_tab (a, b) VALUES (?, ?)").run("x", "y;b=z");

    const fp1 = computeDatabaseContentFingerprint(db1);
    const fp2 = computeDatabaseContentFingerprint(db2);

    expect(fp1).not.toBe(fp2);
    db1.close();
    db2.close();
  });

  it("C03: should reject restore if live database is modified before runDatabaseMigrationUpdate call", async () => {
    setupTestEnvironment();
    const { filePath, sha256 } = await createBaselineBackupFile("c03-before-call-write.json", (tables) => {
      tables.sites = [
        {
          id: "site-ok", site_code: "S-OK", name: "지점OK", customer_name: "고객OK",
          status: "active", timezone: "Asia/Seoul", deleted_at: null, created_at: "2026-01-01", updated_at: "2026-01-01"
        }
      ];
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    // Modify live DB before calling runDatabaseMigrationUpdate
    const liveDb = getSqliteDatabase()!;
    liveDb.prepare("INSERT INTO sites (id, site_code, name, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("site-before-call", "PRECALL", "사전쓰기", "active", "Asia/Seoul", "2026-09-27", "2026-09-27");

    await expect(
      runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: filePath,
        backupSha256: sha256,
        previewToken: preview.previewToken,
        confirmationText: "교체",
        env
      })
    ).rejects.toThrow("미리보기 이후 데이터베이스 내용이 변경되었습니다");

    const checkDb = getSqliteDatabase()!;
    const insertedSite = checkDb.prepare("SELECT id FROM sites WHERE id = 'site-before-call'").get();
    expect(insertedSite).toBeDefined();
  });

  it("C03: should abort restore if live database is modified during pre-backup await and preserve inserted rows", async () => {
    setupTestEnvironment();
    const { filePath, sha256 } = await createBaselineBackupFile("c03-await-write.json", (tables) => {
      tables.sites = [
        {
          id: "site-ok", site_code: "S-OK", name: "지점OK", customer_name: "고객OK",
          status: "active", timezone: "Asia/Seoul", deleted_at: null, created_at: "2026-01-01", updated_at: "2026-01-01"
        }
      ];
    });

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      env
    });

    // Start restore asynchronously (reaches pre-backup await)
    const restorePromise = runDatabaseMigrationUpdate({
      userDataPath,
      backupFilePath: filePath,
      backupSha256: sha256,
      previewToken: preview.previewToken,
      confirmationText: "교체",
      env
    });

    // Synchronously insert a row into live database during pre-backup await
    const liveDb = getSqliteDatabase()!;
    liveDb.prepare("INSERT INTO sites (id, site_code, name, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("site-during-await", "CONCURRENT", "동시쓰기", "active", "Asia/Seoul", "2026-09-27", "2026-09-27");

    await expect(restorePromise).rejects.toThrow(
      "사전 백업 진행 중 데이터베이스 내용이 변경되었습니다"
    );

    const checkDb = getSqliteDatabase()!;
    const concurrentSite = checkDb.prepare("SELECT id FROM sites WHERE id = 'site-during-await'").get();
    expect(concurrentSite).toBeDefined();
  });
  it.each([false, true])("restores employee email and legacy backups without that column (email=%s)", async (hasEmail) => {
    const { filePath } = await createBaselineBackupFile(`employee-email-${hasEmail}.json`, tables => {
      tables.employees = [{ id: "email-restore", employee_code: "EMAIL-RESTORE", name: "백업 인력", contact: "010-0000-1001", rank: "사원", employment_type: "정규", status: "active", hire_date: "2023-01-01", retire_date: null, deleted_at: null, created_at: "2023-01-01T00:00:00Z", updated_at: null, ...(hasEmail ? { email: "restore@example.invalid" } : {}) }];
    });
    const preview = previewDatabaseMigrationUpdate({ backupFilePath: filePath, userDataPath, env });
    await runDatabaseMigrationUpdate({ backupFilePath: filePath, backupSha256: preview.backupSha256, previewToken: preview.previewToken, confirmationText: "교체", userDataPath, env });
    expect(getSqliteDatabase()!.prepare("SELECT name, contact, email FROM employees WHERE id = ?").get("email-restore")).toEqual({ name: "백업 인력", contact: "010-0000-1001", email: hasEmail ? "restore@example.invalid" : null });
    const backup = await runDatabaseBackupNow({ userDataPath, env });
    const exported = JSON.parse(readFileSync(backup.jsonBackupPath, "utf8"));
    expect(exported.tables.employees.find((row: { id: string }) => row.id === "email-restore").email).toBe(hasEmail ? "restore@example.invalid" : null);
  });

});
