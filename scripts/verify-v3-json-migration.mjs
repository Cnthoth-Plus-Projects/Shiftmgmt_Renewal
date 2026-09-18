import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate
} = require("../dist/server/main/services/database-migration-service.js");
const {
  closeSqliteStorage
} = require("../dist/server/main/services/sqlite-storage-service.js");

const EXPECTED_SETTINGS_WARNING =
  "백업 JSON의 경로 설정은 무시하고 현재 환경 경로를 유지했습니다.";

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

function canonicalTableHash(rows) {
  const sortedRows = rows.map(canonicalizeRow).sort();
  const hash = crypto.createHash("sha256");
  for (const r of sortedRows) {
    hash.update(r + "\n");
  }
  return hash.digest("hex");
}

function assertSettingsWarning(warnings, context) {
  if (!Array.isArray(warnings)) {
    fail(`오류: ${context} warningMessages가 배열이 아닙니다.`);
  }
  if (warnings.length !== 1) {
    fail(
      `오류: ${context} 설정 경고 개수 불일치 (기대: 1개, 실제: ${warnings.length}개 - [${warnings.join("; ")}])`
    );
  }
  if (warnings[0] !== EXPECTED_SETTINGS_WARNING) {
    fail(
      `오류: ${context} 설정 경고 문구 불일치\n  기대: "${EXPECTED_SETTINGS_WARNING}"\n  실제: "${warnings[0]}"`
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

  let db = null;
  let cleanedUp = false;
  let cleanupError = null;

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
        migrationFilePath: options.input,
        env
      });
    } finally {
      console.warn = origWarn;
    }

    // P22-D2: preview 설정 경고 정확히 1개 검증
    assertSettingsWarning(previewResult.warningMessages, "preview");

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

    if (previewResult.restoredTableCount !== 32) {
      fail(`오류: preview restoredTableCount 불일치 (기대: 32, 실제: ${previewResult.restoredTableCount})`);
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
        migrationFilePath: options.input,
        env
      });
    } finally {
      console.warn = origWarn;
    }

    // P22-D2: 실복원 설정 경고 정확히 1개 검증
    assertSettingsWarning(restoreResult.warningMessages, "복원 실행");

    const restoreExclusions = [
      ...restoreResult.warningMessages.filter(isExcludedSchemaWarning),
      ...restoreWarnLogs.filter(isExcludedSchemaWarning)
    ];

    if (restoreExclusions.length > 0) {
      fail(`오류: 복원 실행에서 스키마 제외 경고 감지: ${restoreExclusions.join("; ")}`);
    }

    if (restoreResult.restoredTableCount !== 32) {
      fail(`오류: 복원 restoredTableCount 불일치 (기대: 32, 실제: ${restoreResult.restoredTableCount})`);
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

    if (targetTables.length !== 40) {
      fail(`오류: target DB 표 수 불일치 (기대: 40, 실제: ${targetTables.length})`);
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

    // 6. Target total rows check
    let targetTotalRows = 0;
    for (const t of targetTables) {
      const count = db.prepare(`SELECT COUNT(*) AS cnt FROM ${t}`).get().cnt;
      targetTotalRows += count;
    }

    if (targetTotalRows !== 3598) {
      fail(`오류: target DB 총 행 수 불일치 (기대: 3598, 실제: ${targetTotalRows})`);
    }

    // 7. app_setting_entries check
    const sourceSettingsCount = parsedJson.tables.app_setting_entries?.length ?? 0;
    const targetSettingsCount = db.prepare("SELECT COUNT(*) AS cnt FROM app_setting_entries").get().cnt;
    if (sourceSettingsCount !== 18 || targetSettingsCount !== 17) {
      fail(`오류: app_setting_entries 행 수 불일치 (source: ${sourceSettingsCount}, target: ${targetSettingsCount})`);
    }

    // 8. 39 tables canonical comparison
    for (const t of targetTables) {
      if (t === "app_setting_entries") continue;
      const sRows = parsedJson.tables[t] || [];
      const tRows = db.prepare(`SELECT * FROM ${t}`).all();

      if (sRows.length !== tRows.length) {
        fail(`오류: 표 '${t}' 행 수 불일치 (source: ${sRows.length}, target: ${tRows.length})`);
      }

      const sHash = canonicalTableHash(sRows);
      const tHash = canonicalTableHash(tRows);

      if (sHash !== tHash) {
        fail(`오류: 표 '${t}' canonical hash 불일치 (source: ${sHash}, target: ${tHash})`);
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

    // 11. Verify input file SHA afterwards
    const finalSha = computeFileSha256(options.input);
    if (finalSha.toLowerCase() !== initialSha.toLowerCase()) {
      fail(`오류: 검증 후 입력 파일 SHA 변조 감지! (전: ${initialSha}, 후: ${finalSha})`);
    }

    // 정상 완료 시 자원 정리 및 확인 후 성공 출력
    db.close();
    db = null;
    closeSqliteStorage();

    fs.rmSync(tempDir, { recursive: true, force: true });
    if (fs.existsSync(tempDir)) {
      fail(`오류: 임시 디렉터리 삭제 실패: ${tempDir}`);
    }
    cleanedUp = true;

    console.log("================================================================");
    console.log("V3 운영 JSON 마이그레이션 무손실 복원 검증 완료 (RC 0)");
    console.log("================================================================");
    console.log(`- 입력 JSON SHA-256 (전/후 동일): ${finalSha.toUpperCase()}`);
    console.log(`- 입력 표/행: ${sourceTableNames.length}개 표, ${sourceTotalRows}개 행`);
    console.log(`- preview/실복원 스키마 제외 경고: 0건`);
    console.log(`- preview/실복원 경로 설정 유지 경고: 각각 정확히 1건 확인 ("${EXPECTED_SETTINGS_WARNING}")`);
    console.log(`- target 스키마 표 집합: 40/40 (V4 고유 shift_pattern_duty_types 및 신규 4표 포함)`);
    console.log(`- restoredTableCount: ${restoreResult.restoredTableCount}`);
    console.log(`- target 총 행 수: ${targetTotalRows} (app_setting_entries: source 18 -> target 17, 정책 경고 1건)`);
    console.log(`- 39개 표 canonical hash 및 행 수 대조: 전건 100% 일치`);
    console.log(`- 신규 4표 행 수: periods=${periodsCount}, closures=${closuresCount}, events=${eventsCount}, wage_rate_history=${wageHistCount}`);
    console.log(`- 신규 3컬럼 비NULL 수: assignments=${asgnNonNull}/89, wages=${wageNonNull}/87, performance_snapshot=${perfNonNull}/37`);
    console.log(`- SQLite 무결성: quick_check=ok, integrity_check=ok`);
    console.log(`- 격리 임시 DB: ${tempDir} (정상 정리 완료)`);
    console.log("================================================================");

  } finally {
    if (!cleanedUp) {
      if (db) {
        try {
          db.close();
        } catch (e) {
          if (!cleanupError) cleanupError = e;
        }
        db = null;
      }
      try {
        closeSqliteStorage();
      } catch (e) {
        if (!cleanupError) cleanupError = e;
      }
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        if (fs.existsSync(tempDir)) {
          const remErr = new Error(`정리 실패: 임시 디렉터리가 여전히 존재합니다: ${tempDir}`);
          if (!cleanupError) cleanupError = remErr;
        }
      } catch (e) {
        if (!cleanupError) cleanupError = e;
      }
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }
}

main().catch((err) => {
  if (err instanceof VerificationError) {
    console.error(err.message);
  } else {
    console.error("검증 스크립트 예외 발생:", err?.message || err);
  }
  process.exitCode = 1;
});
