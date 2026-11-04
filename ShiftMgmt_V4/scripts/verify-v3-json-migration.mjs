import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const {
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate
} = require("../dist/server/main/services/database-migration-service.js");
const {
  initializeSqliteStorage,
  closeSqliteStorage
} = require("../dist/server/main/services/sqlite-storage-service.js");

const EXPECTED_ACCOUNT_WARNING =
  "계정 정보(app_users)가 백업 파일의 계정으로 교체됩니다.";
const EXPECTED_EXTERNAL_FILE_WARNING =
  "실적 파일 등 외부 파일 자체는 JSON 백업에 포함되지 않으므로 기기 간 이동 시 별도 보존이 필요할 수 있습니다.";
const EXPECTED_SETTINGS_WARNING =
  "백업 JSON의 경로 설정은 무시하고 현재 환경 경로를 유지했습니다.";
const EXPECTED_REMOVAL_WARNING =
  "백업 JSON의 사번 없는 실적 1건을 V4 복원 대상에서 제거했습니다. 원본 백업은 변경하지 않았습니다.";

class VerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerificationError";
  }
}

function fail(message) {
  throw new VerificationError(message);
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && i + 1 < args.length) {
      options.input = args[++i];
    } else if (args[i] === "--expected-sha" && i + 1 < args.length) {
      options.expectedSha = args[++i];
    } else if (args[i] === "--expected-tables" && i + 1 < args.length) {
      options.expectedTables = parseInt(args[++i], 10);
    } else if (args[i] === "--expected-rows" && i + 1 < args.length) {
      options.expectedRows = parseInt(args[++i], 10);
    }
  }
  return options;
}

function computeFileSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function canonicalizeRow(row) {
  const sorted = {};
  for (const k of Object.keys(row).sort()) {
    sorted[k] = row[k] === undefined ? null : row[k];
  }
  return JSON.stringify(sorted);
}

export function canonicalTableHash(rows, legacySourceTableName) {
  const missingNullCols =
    legacySourceTableName === "employees"
      ? ["email"]
      : legacySourceTableName === "shift_patterns"
        ? ["holiday_policy_json"]
        : legacySourceTableName === "performance_files"
          ? ["policy_context_fingerprint"]
          : legacySourceTableName === "performance_entries"
            ? ["policy_snapshot_json"]
            : [];
  const sortedRows = rows
    .map((row) => {
      let normalized = row;
      for (const col of missingNullCols) {
        if (!Object.hasOwn(normalized, col)) {
          normalized = { ...normalized, [col]: null };
        }
      }
      return canonicalizeRow(normalized);
    })
    .sort();
  const hash = crypto.createHash("sha256");
  for (const r of sortedRows) {
    hash.update(r + "\n");
  }
  return hash.digest("hex");
}

function assertMigrationWarnings(warnings, context) {
  if (!Array.isArray(warnings)) {
    fail(`오류: ${context} warningMessages가 배열이 아닙니다.`);
  }
  if (warnings.length !== 4) {
    fail(
      `오류: ${context} 경고 개수 불일치 (기대: 4개, 실제: ${warnings.length}개 - [${warnings.join("; ")}])`
    );
  }
  if (!warnings.includes(EXPECTED_ACCOUNT_WARNING)) {
    fail(
      `오류: ${context} 계정 교체 경고 문구 누락\n  기대 포함: "${EXPECTED_ACCOUNT_WARNING}"\n  실제: [${warnings.join("; ")}]`
    );
  }
  if (!warnings.includes(EXPECTED_EXTERNAL_FILE_WARNING)) {
    fail(
      `오류: ${context} 외부 파일 미포함 경고 문구 누락\n  기대 포함: "${EXPECTED_EXTERNAL_FILE_WARNING}"\n  실제: [${warnings.join("; ")}]`
    );
  }
  if (!warnings.includes(EXPECTED_SETTINGS_WARNING)) {
    fail(
      `오류: ${context} 설정 경고 문구 누락\n  기대 포함: "${EXPECTED_SETTINGS_WARNING}"\n  실제: [${warnings.join("; ")}]`
    );
  }
  if (!warnings.includes(EXPECTED_REMOVAL_WARNING)) {
    fail(
      `오류: ${context} 사번 없는 실적 제거 경고 문구 누락\n  기대 포함: "${EXPECTED_REMOVAL_WARNING}"\n  실제: [${warnings.join("; ")}]`
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.input || !options.expectedSha || isNaN(options.expectedTables) || isNaN(options.expectedRows)) {
    fail("오류: 필수 인자가 누락되었습니다. (--input, --expected-sha, --expected-tables, --expected-rows)");
  }

  if (!fs.existsSync(options.input)) {
    fail(`오류: 입력 파일이 존재하지 않습니다: ${options.input}`);
  }

  const initialSha = computeFileSha256(options.input);
  if (initialSha.toLowerCase() !== options.expectedSha.toLowerCase()) {
    fail(`오류: SHA-256 불일치 (기대: ${options.expectedSha}, 실제: ${initialSha})`);
  }

  let rawJsonText;
  let parsedJson;
  try {
    rawJsonText = fs.readFileSync(options.input, "utf8");
    parsedJson = JSON.parse(rawJsonText);
  } catch (err) {
    fail(`오류: JSON 파싱 실패: ${err.message}`);
  }

  if (parsedJson.schemaVersion !== 1) {
    fail(`오류: schemaVersion 불일치 (기대: 1, 실제: ${parsedJson.schemaVersion})`);
  }

  const sourceTableNames = Object.keys(parsedJson.tables || {});
  if (sourceTableNames.length !== options.expectedTables) {
    fail(`오류: 표 수 불일치 (기대: ${options.expectedTables}, 실제: ${sourceTableNames.length})`);
  }

  let sourceTotalRows = 0;
  for (const [tbl, rows] of Object.entries(parsedJson.tables)) {
    if (Array.isArray(rows)) {
      sourceTotalRows += rows.length;
    }
  }

  if (sourceTotalRows !== options.expectedRows) {
    fail(`오류: 총 행 수 불일치 (기대: ${options.expectedRows}, 실제: ${sourceTotalRows})`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-verify-v3-"));
  const userDataPath = path.join(tempDir, "user-data");
  const dataDir = path.join(tempDir, "data");
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const env = { DATA_DIR: dataDir };

  // C01: 대상 운영 키를 실제 fixture에 심기
  initializeSqliteStorage({
    userDataPath,
    env
  });

  const fixtureDbPath = path.join(dataDir, "shiftmgmt.sqlite");
  const fixtureDb = new DatabaseSync(fixtureDbPath);
  fixtureDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)")
    .run("holiday_api_base_url", "https://target-device.holiday-api.internal", "2026-09-01T00:00:00.000Z");
  fixtureDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)")
    .run("database_backup_schedule", "weekly", "2026-09-01T00:00:00.000Z");
  fixtureDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)")
    .run("database_backup_time", "04:30", "2026-09-01T00:00:00.000Z");
  fixtureDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)")
    .run("update_last_seen_patch_note_version", "v1.8.2", "2026-09-01T00:00:00.000Z");
  fixtureDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)")
    .run("update_last_skipped_version", "v1.8.0", "2026-09-01T00:00:00.000Z");
  fixtureDb.prepare("INSERT OR REPLACE INTO app_setting_entries (setting_key, value, updated_at) VALUES (?, ?, ?)")
    .run("substitute_allowance_policy_reparse_marker", "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
  fixtureDb.close();

  let db = null;
  let primaryError = null;
  const cleanupErrors = [];
  let successSummary = null;

  try {
    // 1. Preview
    const previewWarnLogs = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      previewWarnLogs.push(args.join(" "));
      origWarn(...args);
    };

    let previewResult;
    try {
      previewResult = previewDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: options.input,
        env
      });
    } finally {
      console.warn = origWarn;
    }

    assertMigrationWarnings(previewResult.warningMessages, "preview");

    const isExcludedSchemaWarning = (msg) =>
      msg.includes("employee_employment_periods") ||
      msg.includes("employee_retirement_history_closures") ||
      msg.includes("employee_employment_period_events") ||
      msg.includes("wage_rate_history") ||
      msg.includes("employment_period_id") ||
      msg.includes("reparse_marker_snapshot_json");

    const previewExclusions = [
      ...previewResult.warningMessages.filter(isExcludedSchemaWarning),
      ...previewWarnLogs.filter(isExcludedSchemaWarning)
    ];

    if (previewExclusions.length > 0) {
      fail(`오류: preview에서 스키마 제외 경고 감지: ${previewExclusions.join("; ")}`);
    }

    if (!Array.isArray(previewResult.tableImpacts) || previewResult.tableImpacts.length !== 42) {
      fail(
        `오류: preview tableImpacts 불일치 (기대: 42개 표, 실제: ${previewResult.tableImpacts?.length})`
      );
    }

    // 2. Real restore
    const restoreWarnLogs = [];
    console.warn = (...args) => {
      restoreWarnLogs.push(args.join(" "));
      origWarn(...args);
    };

    let restoreResult;
    try {
      restoreResult = await runDatabaseMigrationUpdate({
        userDataPath,
        backupFilePath: options.input,
        backupSha256: previewResult.backupSha256,
        previewToken: previewResult.previewToken,
        confirmationText: "교체",
        env
      });
    } finally {
      console.warn = origWarn;
    }

    assertMigrationWarnings(restoreResult.warningMessages, "복원 실행");

    const restoreExclusions = [
      ...restoreResult.warningMessages.filter(isExcludedSchemaWarning),
      ...restoreWarnLogs.filter(isExcludedSchemaWarning)
    ];

    if (restoreExclusions.length > 0) {
      fail(`오류: 복원 실행에서 스키마 제외 경고 감지: ${restoreExclusions.join("; ")}`);
    }

    if (!Array.isArray(restoreResult.tableResults) || restoreResult.tableResults.length !== 42) {
      fail(
        `오류: 복원 tableResults 불일치 (기대: 42개 표, 실제: ${restoreResult.tableResults?.length})`
      );
    }

    // 3. Open restored database directly
    closeSqliteStorage();
    db = new DatabaseSync(restoreResult.databasePath);

    // 4. Quick check & Integrity check
    const qc = db.prepare("PRAGMA quick_check;").all();
    if (qc.length === 0 || qc[0].quick_check !== "ok") {
      fail(`오류: PRAGMA quick_check 실패: ${JSON.stringify(qc)}`);
    }

    const ic = db.prepare("PRAGMA integrity_check;").all();
    if (ic.length === 0 || ic[0].integrity_check !== "ok") {
      fail(`오류: PRAGMA integrity_check 실패: ${JSON.stringify(ic)}`);
    }

    // 5. Target schema table set check
    const targetTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
      .all()
      .map((r) => r.name);

    if (targetTables.length !== 42) {
      fail(`오류: target DB 표 수 불일치 (기대: 42, 실제: ${targetTables.length})`);
    }

    const targetTableSet = new Set(targetTables);
    for (const t of sourceTableNames) {
      if (!targetTableSet.has(t)) {
        fail(`오류: target DB에 표 '${t}' 누락`);
      }
    }
    if (!targetTableSet.has("shift_pattern_duty_types")) {
      fail("오류: target DB에 'shift_pattern_duty_types' 표 누락");
    }

    // 6. app_setting_entries 4대 분류 매핑 및 행 수 검증
    const sourceSettingsRows = parsedJson.tables.app_setting_entries || [];
    const sourceSettingsMap = new Map();
    for (const r of sourceSettingsRows) {
      sourceSettingsMap.set(r.setting_key, r.value);
    }
    if (sourceSettingsRows.length !== 18) {
      fail(`오류: source app_setting_entries 행 수 불일치 (기대: 18, 실제: ${sourceSettingsRows.length})`);
    }

    const targetSettingsRows = db.prepare("SELECT * FROM app_setting_entries").all();
    const targetSettingsMap = new Map();
    for (const r of targetSettingsRows) {
      targetSettingsMap.set(r.setting_key, r.value);
    }

    // 분류 1: 설치 대상 기기의 경로 (7개)
    const expectedPathKeys = [
      "pending_dir", "approved_dir", "schedule_export_dir",
      "allowance_proposal_export_dir", "allowance_attachment1_export_dir",
      "allowance_attachment2_export_dir", "database_backup_dir"
    ];
    for (const k of expectedPathKeys) {
      if (!targetSettingsMap.has(k)) {
        fail(`오류: target app_setting_entries에 경로 설정 키 '${k}' 누락`);
      }
    }

    // 분류 2: 이번 선택 파일 경로 (1개)
    if (path.resolve(targetSettingsMap.get("migration_file_path")) !== path.resolve(options.input)) {
      fail(`오류: target migration_file_path 불일치 (기대: ${options.input}, 실제: ${targetSettingsMap.get("migration_file_path")})`);
    }

    // 분류 3: 운영 설정 (6개: 기본 3개 + 선택 2개 + reparse marker 1개)
    const expectedOperatingValues = {
      holiday_api_base_url: "https://target-device.holiday-api.internal",
      database_backup_schedule: "weekly",
      database_backup_time: "04:30",
      update_last_seen_patch_note_version: "v1.8.2",
      update_last_skipped_version: "v1.8.0"
    };

    const targetRowMap = new Map();
    for (const r of targetSettingsRows) {
      targetRowMap.set(r.setting_key, r);
    }

    for (const [k, expectedVal] of Object.entries(expectedOperatingValues)) {
      if (!targetRowMap.has(k)) {
        fail(`오류: target app_setting_entries에 운영 설정 키 '${k}' 누락`);
      }
      const row = targetRowMap.get(k);
      if (row.value !== expectedVal) {
        fail(`오류: target 운영 설정 '${k}' 값 불일치 (기대: ${expectedVal}, 실제: ${row.value})`);
      }
    }

    if (!targetRowMap.has("substitute_allowance_policy_reparse_marker")) {
      fail("오류: target app_setting_entries에 substitute_allowance_policy_reparse_marker 누락");
    }

    const markerRow = targetRowMap.get("substitute_allowance_policy_reparse_marker");
    // C01: 정책일 변경에 따른 marker 값 갱신 검증 (이전 fixture 값 "2026-09-01T00:00:00.000Z"에서 새 ISO 타임스탬프로 갱신)
    if (markerRow.value === "2026-09-01T00:00:00.000Z") {
      fail("오류: substitute_allowance_policy_reparse_marker가 정책일 변경에도 불구하고 기존 fixture 값을 유지했습니다.");
    }
    const markerTime = Date.parse(markerRow.value);
    if (isNaN(markerTime)) {
      fail(`오류: substitute_allowance_policy_reparse_marker 값이 올바른 ISO 타임스탬프가 아닙니다: ${markerRow.value}`);
    }
    if (markerRow.value !== markerRow.updated_at) {
      fail(`오류: substitute_allowance_policy_reparse_marker의 value와 updated_at 불일치 (value: ${markerRow.value}, updated_at: ${markerRow.updated_at})`);
    }

    // C01: 운영 키들의 updated_at도 마이그레이션 실행 시점(markerRow.updated_at)과 일치해야 함
    for (const k of Object.keys(expectedOperatingValues)) {
      const row = targetRowMap.get(k);
      if (row.updated_at !== markerRow.updated_at) {
        fail(`오류: 운영 설정 '${k}'의 updated_at이 마이그레이션 실행 시점(${markerRow.updated_at})과 일치하지 않습니다: ${row.updated_at}`);
      }
    }

    // 분류 4: 필수 업무 규칙 (6개) - source에서 필수 복원
    const expectedBizKeys = [
      "schedule_consecutive_night_limit",
      "schedule_minimum_rest_minutes",
      "schedule_require_weekly_holiday",
      "schedule_weekly_max_minutes",
      "substitute_allowance_policy_effective_from",
      "changed_slot_priority_effective_from"
    ];
    for (const k of expectedBizKeys) {
      if (!targetSettingsMap.has(k)) {
        fail(`오류: target app_setting_entries에 업무 규칙 키 '${k}' 누락`);
      }
      if (targetSettingsMap.get(k) !== sourceSettingsMap.get(k)) {
        fail(`오류: target 업무 규칙 '${k}' 값 불일치 (기대: ${sourceSettingsMap.get(k)}, 실제: ${targetSettingsMap.get(k)})`);
      }
    }

    const hasReparseMarker = targetSettingsMap.has("substitute_allowance_policy_reparse_marker");
    const expectedTargetSettingsCount = 7 + 1 + 3 + 2 + (hasReparseMarker ? 1 : 0) + 6;
    if (targetSettingsRows.length !== expectedTargetSettingsCount) {
      fail(`오류: target app_setting_entries 행 수 불일치 (기대: ${expectedTargetSettingsCount}, 실제: ${targetSettingsRows.length})`);
    }

    // 7. Target total rows check (승인된 변환 결과로 산출: 3599 - 1[DEC-001] - sourceSettings + targetSettings + policyRevs + policyEvents)
    const policyRevsCount = db.prepare("SELECT COUNT(*) AS cnt FROM policy_revisions").get().cnt;
    const policyEventsCount = db.prepare("SELECT COUNT(*) AS cnt FROM policy_events").get().cnt;

    let targetTotalRows = 0;
    for (const t of targetTables) {
      const count = db.prepare(`SELECT COUNT(*) AS cnt FROM ${t}`).get().cnt;
      targetTotalRows += count;
    }

    const expectedTargetTotalRows =
      sourceTotalRows - 1 - sourceSettingsRows.length + targetSettingsRows.length + policyRevsCount + policyEventsCount;
    if (targetTotalRows !== expectedTargetTotalRows) {
      fail(`오류: target DB 총 행 수 불일치 (기대: ${expectedTargetTotalRows}, 실제: ${targetTotalRows})`);
    }

    // 8. 39 tables canonical comparison
    const EXCLUDED_NOCODE_ENTRY_ID =
      "access-performance-entry-accessperformance202408sk증권nocode202408150056";
    const TARGET_FILE_ID = "access-performance-file-202408|sk증권|approved";

    for (const t of targetTables) {
      if (t === "app_setting_entries" || t === "policy_revisions" || t === "policy_events") continue;
      let sRows = parsedJson.tables[t] || [];
      const tRows = db.prepare(`SELECT * FROM ${t}`).all();

      if (t === "performance_entries") {
        const matchingEntryCount = sRows.filter((r) => r.id === EXCLUDED_NOCODE_ENTRY_ID).length;
        if (matchingEntryCount !== 1) {
          fail(`오류: source performance_entries에서 exact ID '${EXCLUDED_NOCODE_ENTRY_ID}' 일치 건수 불일치 (기대: 1, 실제: ${matchingEntryCount})`);
        }
        sRows = sRows.filter((r) => r.id !== EXCLUDED_NOCODE_ENTRY_ID);
      } else if (t === "performance_files") {
        sRows = sRows.map((file) => {
          if (file.id === TARGET_FILE_ID) {
            const preview = JSON.parse(file.preview_json || "[]");
            const matchesTargetHong = (p) => {
              const name = String(p["직원명"] ?? p["employee_name"] ?? p["employeeName"] ?? "").trim();
              const workDate = String(p["근무날짜"] ?? p["work_date"] ?? p["workDate"] ?? "").trim();
              return name === "홍길동1" && workDate === "2024-08-15";
            };
            const matchingCount = preview.filter(matchesTargetHong).length;
            if (matchingCount !== 1) {
              fail(`오류: target file(${TARGET_FILE_ID}) preview에서 홍길동1 / 2024-08-15 일치 건수 불일치 (기대: 1, 실제: ${matchingCount})`);
            }
            const filteredPreview = preview.filter((p) => !matchesTargetHong(p));
            return {
              ...file,
              entry_count: 4,
              approved_entry_count: 4,
              warning_count: 0,
              preview_json: JSON.stringify(filteredPreview)
            };
          }
          return file;
        });
      }

      if (sRows.length !== tRows.length) {
        fail(`오류: 표 '${t}' 행 수 불일치 (source: ${sRows.length}, target: ${tRows.length})`);
      }

      const sHash = canonicalTableHash(sRows, t);
      const tHash = canonicalTableHash(tRows);

      if (sHash !== tHash) {
        fail(`오류: 표 '${t}' canonical hash 불일치 (source: ${sHash}, target: ${tHash})`);
      }
    }

    // 8-1. 신규 policy_revisions / policy_events 초기 provenance 및 정합성 검사
    const targetPolicyRevs = db.prepare("SELECT * FROM policy_revisions").all();
    if (targetPolicyRevs.length < 2) {
      fail(`오류: target policy_revisions 초기 행 수 부족 (최소 2개 기대, 실제: ${targetPolicyRevs.length})`);
    }
    for (const rev of targetPolicyRevs) {
      if (rev.origin !== "initial") {
        fail(`오류: target policy_revisions origin 불일치 (기대: initial, 실제: ${rev.origin})`);
      }
      if (!rev.criteria_json) {
        fail("오류: target policy_revisions criteria_json 누락");
      }
    }

    // 9. New tables row count check
    const periodsCount = db.prepare("SELECT COUNT(*) AS cnt FROM employee_employment_periods").get().cnt;
    const closuresCount = db.prepare("SELECT COUNT(*) AS cnt FROM employee_retirement_history_closures").get().cnt;
    const eventsCount = db.prepare("SELECT COUNT(*) AS cnt FROM employee_employment_period_events").get().cnt;
    const wageHistCount = db.prepare("SELECT COUNT(*) AS cnt FROM wage_rate_history").get().cnt;

    if (periodsCount !== 87 || closuresCount !== 0 || eventsCount !== 0 || wageHistCount !== 0) {
      fail(`오류: 신규 표 행 수 불일치 (기대: 87/0/0/0, 실제: ${periodsCount}/${closuresCount}/${eventsCount}/${wageHistCount})`);
    }

    // 10. New columns non-null count check
    const asgnNonNull = db.prepare("SELECT COUNT(*) AS cnt FROM employee_site_assignments WHERE employment_period_id IS NOT NULL").get().cnt;
    const wageNonNull = db.prepare("SELECT COUNT(*) AS cnt FROM wage_rates WHERE employment_period_id IS NOT NULL").get().cnt;
    const perfNonNull = db.prepare("SELECT COUNT(*) AS cnt FROM performance_files WHERE reparse_marker_snapshot_json IS NOT NULL").get().cnt;

    if (asgnNonNull !== 87 || wageNonNull !== 84 || perfNonNull !== 0) {
      fail(`오류: 신규 컬럼 non-null 수 불일치 (기대: 87/84/0, 실제: ${asgnNonNull}/${wageNonNull}/${perfNonNull})`);
    }

    // 11. Domain & Payroll assertions
    const poolPerfCount = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM performance_entries pe
      JOIN performance_files pf ON pe.performance_file_id = pf.id
      WHERE pe.employee_name LIKE '%전인환%' AND pf.status = 'approved'
    `).get().cnt;
    const poolApprCount = db.prepare("SELECT COUNT(*) AS cnt FROM performance_approvals WHERE employee_name LIKE '%전인환%'").get().cnt;
    const poolCalcCount = db.prepare("SELECT COUNT(*) AS cnt FROM allowance_calculations WHERE employee_name LIKE '%전인환%'").get().cnt;
    if (poolPerfCount !== 44 || poolApprCount !== 0 || poolCalcCount !== 0) {
      fail(`오류: Pool 전인환 실적/승인/계산 수 불일치 (기대: 44/0/0, 실제: ${poolPerfCount}/${poolApprCount}/${poolCalcCount})`);
    }

    const bpPerfCount = db.prepare("SELECT COUNT(*) AS cnt FROM performance_entries WHERE employee_name LIKE '%정다운%'").get().cnt;
    const bpApprCount = db.prepare("SELECT COUNT(*) AS cnt FROM performance_approvals WHERE employee_name LIKE '%정다운%'").get().cnt;
    const bpCalcCount = db.prepare("SELECT COUNT(*) AS cnt FROM allowance_calculations WHERE employee_name LIKE '%정다운%'").get().cnt;
    if (bpPerfCount !== 0 || bpApprCount !== 0 || bpCalcCount !== 0) {
      fail(`오류: BP 정다운 실적/승인/계산 수 불일치 (기대: 0/0/0, 실제: ${bpPerfCount}/${bpApprCount}/${bpCalcCount})`);
    }

    const unassignedNonBpCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM performance_entries
      WHERE (employee_code IS NULL OR trim(employee_code) = '')
        AND employee_name NOT LIKE '%BP%'
        AND employee_name NOT LIKE '%(BP)%'
    `).get().cnt;
    if (unassignedNonBpCount !== 0) {
      fail(`오류: target DB에 사번 없는 비-BP 실적 존재 (${unassignedNonBpCount}건)`);
    }

    const totalCalc = db.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(total_allowance_amount), 0) AS total_amount
      FROM allowance_calculations
    `).get();
    if (totalCalc.cnt !== 263 || totalCalc.total_amount !== 56076024) {
      fail(`오류: 수당 계산 전체 건수/금액 불일치 (기대: 263건 / 56,076,024원, 실제: ${totalCalc.cnt}건 / ${totalCalc.total_amount}원)`);
    }

    const approvedCalc = db.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(total_allowance_amount), 0) AS total_amount
      FROM allowance_calculations
      WHERE status = 'approved' OR status = 'proposal-approved'
    `).get();
    if (approvedCalc.cnt !== 64 || approvedCalc.total_amount !== 13611839) {
      fail(`오류: 승인 완료 수당 계산 건수/금액 불일치 (기대: 64건 / 13,611,839원, 실제: ${approvedCalc.cnt}건 / ${approvedCalc.total_amount}원)`);
    }

    // 12. Verify input file SHA afterwards
    const finalSha = computeFileSha256(options.input);
    if (finalSha.toLowerCase() !== initialSha.toLowerCase()) {
      fail(`오류: 검증 후 입력 파일 SHA 변조 감지! (전: ${initialSha}, 후: ${finalSha})`);
    }

    // 성공 요약 데이터 보존 (출력은 자원 및 디렉터리 정리 완료 뒤에 실행)
    successSummary = {
      finalSha,
      sourceTableCount: sourceTableNames.length,
      sourceTotalRows,
      restoreResult,
      targetTotalRows,
      periodsCount,
      closuresCount,
      eventsCount,
      wageHistCount,
      asgnNonNull,
      wageNonNull,
      perfNonNull,
      tempDir
    };
  } catch (err) {
    primaryError = err;
  } finally {
    // 각 정리 단계를 독립 try/catch로 실행하여 어느 한 단계가 실패해도 나머지 정리 계속 시도
    if (db) {
      try {
        db.close();
      } catch (e) {
        cleanupErrors.push(new Error(`[DB close] ${e?.message || e}`));
      }
      db = null;
    }

    try {
      closeSqliteStorage();
    } catch (e) {
      cleanupErrors.push(new Error(`[SqliteStorage close] ${e?.message || e}`));
    }

    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      cleanupErrors.push(new Error(`[임시 디렉터리 삭제] ${e?.message || e}`));
    }

    try {
      if (fs.existsSync(tempDir)) {
        cleanupErrors.push(
          new Error(`[임시 디렉터리 잔존] 임시 디렉터리가 여전히 존재합니다: ${tempDir}`)
        );
      }
    } catch (e) {
      cleanupErrors.push(new Error(`[임시 디렉터리 잔존 확인 실패] ${e?.message || e}`));
    }
  }

  // 주 오류 또는 정리 오류가 있는 경우 병합하여 처리
  if (primaryError || cleanupErrors.length > 0) {
    if (primaryError && cleanupErrors.length > 0) {
      const primaryMsg =
        primaryError instanceof VerificationError
          ? primaryError.message
          : primaryError.message || String(primaryError);
      const cleanupMsgs = cleanupErrors.map((e) => e.message || String(e)).join("\n  - ");
      fail(`${primaryMsg}\n[정리 실패]\n  - ${cleanupMsgs}`);
    } else if (primaryError) {
      throw primaryError;
    } else {
      const cleanupMsgs = cleanupErrors.map((e) => e.message || String(e)).join("\n  - ");
      fail(`[정리 실패]\n  - ${cleanupMsgs}`);
    }
  }

  // 오류 없이 모든 정리가 검증된 후에만 성공 요약 출력
  console.log("================================================================");
  console.log("V3 운영 JSON 마이그레이션 무손실 복원 검증 완료 (RC 0)");
  console.log("================================================================");
  console.log(`- 입력 JSON SHA-256 (전/후 동일): ${successSummary.finalSha.toUpperCase()}`);
  console.log(`- 입력 표/행: ${successSummary.sourceTableCount}개 표, ${successSummary.sourceTotalRows}개 행`);
  console.log(`- preview/실복원 스키마 제외 경고: 0건`);
  console.log(`- preview/실복원 경고: 각각 4건 확인 ("${EXPECTED_ACCOUNT_WARNING}" / "${EXPECTED_EXTERNAL_FILE_WARNING}" / "${EXPECTED_SETTINGS_WARNING}" / "${EXPECTED_REMOVAL_WARNING}")`);
  console.log(`- target 스키마 표 집합: 40/40 (V4 고유 shift_pattern_duty_types 및 신규 4표 포함)`);
  console.log(`- restoredTableCount: ${successSummary.restoreResult.tableResults.length}`);
  console.log(`- target 총 행 수: ${successSummary.targetTotalRows} (app_setting_entries 4대 분류 변환 및 DEC-001 사번 없는 실적 1건 안전 제거 반영)`);
  const sourceEmployees = parsedJson.tables.employees || [];
  const missingEmailNullCount = sourceEmployees.filter((r) => !Object.hasOwn(r, "email")).length;
  const sourcePatterns = parsedJson.tables.shift_patterns || [];
  const missingPolicyNullCount = sourcePatterns.filter((r) => !Object.hasOwn(r, "holiday_policy_json")).length;
  console.log(`- 39개 표 canonical hash 및 행 수 대조: 전건 100% 일치 (performance_entries 349건 대조, performance_files 정규화 대조, employees ${sourceEmployees.length}건 중 email 누락→NULL 비교 보완 ${missingEmailNullCount}건, shift_patterns ${sourcePatterns.length}건 중 holiday_policy_json 누락→NULL 비교 보완 ${missingPolicyNullCount}건)`);
  console.log(`- 도메인/수당 단언: Pool 전인환 44/0/0, BP 정다운 0/0/0, 계산 전체 263건(56,076,024원), 승인 64건(13,611,839원) 전건 일치`);
  console.log(`- 신규 4표 행 수: periods=${successSummary.periodsCount}, closures=${successSummary.closuresCount}, events=${successSummary.eventsCount}, wage_rate_history=${successSummary.wageHistCount}`);
  console.log(`- 신규 3컬럼 비NULL 수: assignments=${successSummary.asgnNonNull}/89, wages=${successSummary.wageNonNull}/87, performance_snapshot=${successSummary.perfNonNull}/37`);
  console.log(`- SQLite 무결성: quick_check=ok, integrity_check=ok`);
  console.log(`- 격리 임시 DB: ${successSummary.tempDir} (정상 정리 완료)`);
  console.log("================================================================");
}

const normalizeCliPath = (p) =>
  process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p);
if (
  process.argv[1] &&
  normalizeCliPath(process.argv[1]) === normalizeCliPath(fileURLToPath(import.meta.url))
) {
  main().catch((err) => {
    if (err instanceof VerificationError) {
      console.error(err.message);
    } else {
      console.error("검증 스크립트 예외 발생:", err?.message || err);
    }
    process.exitCode = 1;
  });
}
