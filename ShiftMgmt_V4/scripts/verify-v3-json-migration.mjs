import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const storage = require("../dist/server/main/services/sqlite-storage-service.js");
const migration = require("../dist/server/main/services/database-migration-service.js");
const backup = require("../dist/server/main/services/database-backup-service.js");
const settingsService = require("../dist/server/main/services/app-settings-storage-service.js");
const policy = require("../dist/server/main/services/policy-history-service.js");
const { isBpDisplayName } = require("../dist/server/shared/domain/employment-type.js");
const { isPayablePerformanceEntry } = require("../dist/server/shared/domain/performance-file.js");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const quote = name => `"${name.replaceAll('"', '""')}"`;
const nullColumns = { employees: ["email"], shift_patterns: ["holiday_policy_json"], performance_files: ["policy_context_fingerprint"], performance_entries: ["policy_snapshot_json"] };
const businessKeys = ["schedule_consecutive_night_limit", "schedule_minimum_rest_minutes", "schedule_require_weekly_holiday", "schedule_weekly_max_minutes", "substitute_allowance_policy_effective_from", "changed_slot_priority_effective_from"];
const newTables = ["shift_pattern_duty_types", "policy_revisions", "policy_events", "performance_return_history"];
const markerKeys = ["substitute_allowance_policy", "employee_master", "team_work_type", "monthly_schedule", "wage_rate"].flatMap(prefix => [`${prefix}_reparse_marker`, `${prefix}_reparse_progress`]);

export function canonicalTableHash(rows, sourceTable) {
  const canonical = rows.map(row => {
    const normalized = { ...Object.fromEntries((nullColumns[sourceTable] ?? []).map(key => [key, null])), ...row };
    return JSON.stringify(Object.fromEntries(Object.keys(normalized).sort().map(key => [key, normalized[key] ?? null])));
  }).sort();
  return sha(Buffer.from(canonical.map(row => row + "\n").join("")));
}

function parseArgs(args) {
  const options = {};
  const names = new Set(["input", "expected-sha", "expected-tables", "expected-rows", "expected-removed-entry-ids", "report"]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, "");
    if (key === "keep-temp") { options.keepTemp = true; continue; }
    if (!names.has(key) || args[i + 1] === undefined || args[i + 1].startsWith("--")) throw Error("검증 인수를 확인하세요: " + args[i]);
    assert(options[key] === undefined, "중복 인수: " + key);
    options[key] = args[++i];
  }
  assert(options.input && /^[a-f0-9]{64}$/i.test(options["expected-sha"] ?? ""), "--input 및 정확한 --expected-sha가 필요합니다.");
  for (const key of ["expected-tables", "expected-rows"]) assert(/^\d+$/.test(options[key] ?? ""), "정수 인수 필요: " + key);
  assert([39, 40].includes(Number(options["expected-tables"])), "이 도구는 V1 구판39표/40표만 검증합니다.");
  return options;
}

function expectedBusinessTables(source, removedIds) {
  const expected = structuredClone(source.tables);
  const selected = new Set(removedIds);
  const candidates = expected.performance_entries.filter(row => !String(row.employee_code ?? "").trim() && !isBpDisplayName(String(row.employee_name)));
  assert.deepEqual(candidates.map(row => String(row.id)).sort(), [...selected].sort(), "사번 없는 미승인 실적의 검토된 정확한 ID를 --expected-removed-entry-ids에 지정하세요. 임의 제외는 허용하지 않습니다.");
  for (const entry of candidates) {
    assert(!expected.performance_approvals.some(row => row.entry_id === entry.id || row.logical_key === entry.logical_key), "제외 대상에 승인 이력 연결");
    assert(!expected.hidden_approved_performance_rows.some(row => row.entry_id === entry.id || row.logical_key === entry.logical_key), "제외 대상에 숨김 이력 연결");
    assert(!expected.allowance_calculations.some(row => row.performance_entry_id === entry.id), "제외 대상에 계산 연결");
    expected.performance_entries = expected.performance_entries.filter(row => row.id !== entry.id);
    const file = expected.performance_files.find(row => row.id === entry.performance_file_id);
    if (!file) continue;
    const preview = JSON.parse(String(file.preview_json ?? "[]"));
    const matches = row => String(row["직원명"] ?? row.employee_name ?? row.employeeName ?? "").trim() === entry.employee_name && String(row["근무날짜"] ?? row.work_date ?? row.workDate ?? "").trim() === entry.work_date;
    assert(preview.filter(matches).length <= 1, "모호한 미리보기 행을 제외할 수 없습니다.");
    file.preview_json = JSON.stringify(preview.filter(row => !matches(row)));
    let alerts = [];
    try { alerts = JSON.parse(String(entry.alert_json ?? "[]")); } catch { /* 구판의 비정상 알림 문자열은 알림 0건 */ }
    file.warning_count = Math.max(0, Number(file.warning_count ?? 0) - (Array.isArray(alerts) ? alerts.length : 0));
    const remaining = expected.performance_entries.filter(row => row.performance_file_id === file.id && isPayablePerformanceEntry({ employeeCode: String(row.employee_code ?? ""), employeeName: String(row.employee_name ?? ""), isPoolWorker: Number(row.is_pool_worker ?? 0) === 1, section: row.section ?? undefined, substituteAllowanceEligible: row.substitute_allowance_eligible == null ? undefined : Number(row.substitute_allowance_eligible) === 1, substituteAllowanceReasonCode: row.substitute_allowance_reason_code ?? undefined }));
    file.entry_count = remaining.length;
    const history = expected.performance_approvals.filter(row => row.file_id === file.id).sort((a, b) => String(b.processed_at).localeCompare(String(a.processed_at)) || String(b.id).localeCompare(String(a.id)));
    if (!history.length) file.approved_entry_count = Math.min(remaining.length, Number(file.approved_entry_count ?? 0));
    else {
      const latest = new Map();
      for (const row of history) if (row.entry_id && !latest.has(row.entry_id)) latest.set(row.entry_id, row.decision);
      file.approved_entry_count = remaining.filter(row => latest.get(row.id) === "approved").length;
    }
  }
  return expected;
}

const tableNames = db => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
const rows = (db, name) => db.prepare(`SELECT * FROM ${quote(name)}`).all();
const totals = values => {
  const groups = new Map();
  for (const row of values) {
    const key = `${String(row.work_date).slice(0, 7)}:${String(row.status)}`;
    const current = groups.get(key) ?? { key, records: 0, amount: 0 };
    current.records++; current.amount += Number(row.total_allowance_amount);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
};
const checkWarnings = (messages, source, removed) => {
  for (const text of ["계정 정보(app_users)가 백업 파일의 계정으로 교체됩니다.", "실적 파일 등 외부 파일 자체는 JSON 백업에 포함되지 않으므로 기기 간 이동 시 별도 보존이 필요할 수 있습니다.", "백업 JSON의 경로 설정은 무시하고 현재 환경 경로를 유지했습니다."]) assert(messages.includes(text), "필수 경고 누락: " + text);
  const hasMarkers = source.tables.app_setting_entries.some(row => markerKeys.includes(row.setting_key));
  const expectedCount = 3 + (Object.keys(source.tables).length === 39 ? 1 : 0) + Number(hasMarkers) + Number(removed > 0);
  assert.equal(messages.length, expectedCount, "검토되지 않은 추가/누락 경고가 있습니다.");
  if (hasMarkers) assert(messages.some(text => text.includes("미승인")));
  if (removed) assert(messages.includes(`백업 JSON의 사번 없는 실적 ${removed}건을 V4 복원 대상에서 제거했습니다. 원본 백업은 변경하지 않았습니다.`));
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = path.resolve(options.input), originalBytes = fs.readFileSync(input), inputSha = sha(originalBytes);
  assert.equal(inputSha, options["expected-sha"].toLowerCase(), "원본 SHA-256 불일치");
  const source = JSON.parse(originalBytes.toString("utf8"));
  assert.equal(source.schemaVersion, 1, "이 도구의 입력은 V1 구판 JSON입니다.");
  assert.equal(Object.keys(source.tables).length, Number(options["expected-tables"]), "원본 표 수 불일치");
  assert.equal(Object.values(source.tables).reduce((n, table) => n + table.length, 0), Number(options["expected-rows"]), "원본 총 행 수 불일치");
  const removedIds = (options["expected-removed-entry-ids"] ?? "").split(",").filter(Boolean);
  const expected = expectedBusinessTables(source, removedIds);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-verify-v3-"));
  const context = { userDataPath: path.join(tempDir, "user-data"), env: { DATA_DIR: path.join(tempDir, "data") } };
  let result;
  try {
    storage.initializeSqliteStorage(context);
    const settings = settingsService.getStoredAppSettingsSnapshot(context);
    settingsService.saveStoredAppSettings({ ...settings, holidayApiBaseUrl: "https://target-device.invalid/holidays", databaseBackupSchedule: "weekly", databaseBackupTime: "04:30" }, context);
    let db = storage.getSqliteDatabase();
    for (const [key, value] of [["update_last_seen_patch_note_version", "target-note"], ["update_last_skipped_version", "target-skip"], ["substitute_allowance_policy_reparse_marker", "target-marker"]]) db.prepare("INSERT OR REPLACE INTO app_setting_entries(setting_key,value,updated_at) VALUES(?,?,?)").run(key, value, "2026-01-01");
    policy.initializePolicyHistory(db);
    const initialBusiness = Object.fromEntries(tableNames(db).filter(name => name !== "app_setting_entries").map(name => [name, canonicalTableHash(rows(db, name))]));
    const before = migration.computeDatabaseContentFingerprint(db);
    const requirement = migration.checkDatabaseMigrationRequirements({ backupFilePath: input });
    assert(requirement.isReady, JSON.stringify(requirement));
    assert.equal(requirement.tableCount, Object.keys(source.tables).length);
    const preview = migration.previewDatabaseMigrationUpdate({ ...context, backupFilePath: input });
    assert.equal(migration.computeDatabaseContentFingerprint(storage.getSqliteDatabase()), before, "미리보기가 운영 DB를 변경했습니다.");
    assert.equal(preview.tableImpacts.length, 43);
    checkWarnings(preview.warningMessages, source, removedIds.length);
    const restored = await migration.runDatabaseMigrationUpdate({ ...context, backupFilePath: input, backupSha256: inputSha, previewToken: preview.previewToken, confirmationText: "교체" });
    checkWarnings(restored.warningMessages, source, removedIds.length);
    db = storage.getSqliteDatabase();
    assert.deepEqual(tableNames(db), [...new Set([...Object.keys(source.tables), ...newTables])].sort());
    assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    const comparisons = [];
    for (const name of Object.keys(source.tables).filter(name => name !== "app_setting_entries")) {
      const actual = rows(db, name), wanted = expected[name];
      assert.equal(actual.length, wanted.length, name + " 행 수");
      const expectedHash = canonicalTableHash(wanted, name), actualHash = canonicalTableHash(actual);
      assert.equal(actualHash, expectedHash, name + " 필드 원문");
      comparisons.push({ table: name, rows: actual.length, sha256: actualHash });
    }
    if (!source.tables.shift_pattern_duty_types) assert.equal(rows(db, "shift_pattern_duty_types").length, 0);
    assert.equal(rows(db, "performance_return_history").length, 0);
    const current = settingsService.getStoredAppSettingsSnapshot(context), settingsMap = new Map(rows(db, "app_setting_entries").map(row => [row.setting_key, row.value]));
    for (const key of ["pendingDir", "approvedDir", "scheduleExportDir", "allowanceProposalExportDir", "allowanceAttachment1ExportDir", "allowanceAttachment2ExportDir", "databaseBackupDir"]) assert.equal(current[key], settings[key], key);
    assert.equal(current.migrationFilePath, input);
    assert.equal(current.holidayApiBaseUrl, "https://target-device.invalid/holidays");
    assert.equal(current.databaseBackupSchedule, "weekly"); assert.equal(current.databaseBackupTime, "04:30");
    assert.equal(settingsMap.get("update_last_seen_patch_note_version"), "target-note"); assert.equal(settingsMap.get("update_last_skipped_version"), "target-skip");
    for (const key of businessKeys) assert.equal(settingsMap.get(key), source.tables.app_setting_entries.find(row => row.setting_key === key)?.value, key);
    for (const key of ["site_name_options_json", "shift_pattern_presets_json"]) {
      const original = source.tables.app_setting_entries.find(row => row.setting_key === key); if (original) assert.equal(settingsMap.get(key), original.value, key);
    }
    const legacyMarkers = source.tables.app_setting_entries.some(row => markerKeys.includes(row.setting_key));
    for (const key of markerKeys.filter(key => key !== "substitute_allowance_policy_reparse_marker")) assert(!settingsMap.has(key));
    const sourceSettings = new Map(source.tables.app_setting_entries.map(row => [row.setting_key, row.value]));
    const dateChanged = current.substituteAllowancePolicyEffectiveFrom !== settings.substituteAllowancePolicyEffectiveFrom || current.changedSlotPriorityEffectiveFrom !== settings.changedSlotPriorityEffectiveFrom;
    if (legacyMarkers || dateChanged) assert(Number.isFinite(Date.parse(settingsMap.get("substitute_allowance_policy_reparse_marker"))));
    else assert.equal(settingsMap.get("substitute_allowance_policy_reparse_marker"), "target-marker");
    assert.equal(sourceSettings.get("schedule_weekly_max_minutes"), settingsMap.get("schedule_weekly_max_minutes"));
    const sourceMoney = totals(source.tables.allowance_calculations), targetMoney = totals(rows(db, "allowance_calculations"));
    assert.deepEqual(targetMoney, sourceMoney, "월별/상태별 수당 건수·금액");
    const second = await backup.runDatabaseBackupNow(context), secondParsed = JSON.parse(fs.readFileSync(second.jsonBackupPath, "utf8"));
    assert.equal(secondParsed.schemaVersion, 3); assert.equal(Object.keys(secondParsed.tables).length, 43);
    for (const name of ["performance_approvals", "allowance_calculations", "allowance_calculation_items", "wage_rate_history"]) assert.equal(canonicalTableHash(secondParsed.tables[name]), canonicalTableHash(source.tables[name]), name + " JSON3 왕복 원문");
    const preview2 = migration.previewDatabaseMigrationUpdate({ ...context, backupFilePath: second.jsonBackupPath });
    await migration.runDatabaseMigrationUpdate({ ...context, backupFilePath: second.jsonBackupPath, backupSha256: preview2.backupSha256, previewToken: preview2.previewToken, confirmationText: "교체" });
    for (const name of ["performance_approvals", "allowance_calculations", "allowance_calculation_items", "wage_rate_history"]) assert.equal(canonicalTableHash(rows(storage.getSqliteDatabase(), name)), canonicalTableHash(source.tables[name]), name + " JSON3 실제 복원");
    assert(migration.checkDatabaseMigrationRequirements({ backupFilePath: restored.backupBeforeRestore.jsonBackupPath }).isReady, "교체 전 자동 백업을 재사용할 수 없습니다.");
    const recovery = migration.previewDatabaseMigrationUpdate({ ...context, backupFilePath: restored.backupBeforeRestore.jsonBackupPath });
    await migration.runDatabaseMigrationUpdate({ ...context, backupFilePath: restored.backupBeforeRestore.jsonBackupPath, backupSha256: recovery.backupSha256, previewToken: recovery.previewToken, confirmationText: "교체" });
    for (const [name, hash] of Object.entries(initialBusiness)) assert.equal(canonicalTableHash(rows(storage.getSqliteDatabase(), name)), hash, name + " 교체 전 백업 실제 복구");
    assert.equal(sha(fs.readFileSync(input)), inputSha, "원본 파일 변경");
    result = { ok: true, mode: "FRESH_NATIVE_V1_JSON_MIGRATION_VERIFICATION", inputSha256: inputSha, inputTables: Object.keys(source.tables).length, inputRows: Number(options["expected-rows"]), targetTables: 43, removedEntryIds: removedIds, originalUnchanged: true, previewPreservedLiveDb: true, comparisons, moneyByMonthAndStatus: targetMoney, json3RoundTrip: true, automaticBackupActuallyRecovered: true, warningMessages: restored.warningMessages, tempDirRetained: Boolean(options.keepTemp), ...(options.keepTemp ? { tempDir } : {}) };
  } finally {
    storage.closeSqliteStorage();
    if (!options.keepTemp) {
      const absolute = fs.realpathSync(tempDir), parent = fs.realpathSync(os.tmpdir());
      assert(absolute.startsWith(parent + path.sep) && path.basename(absolute).startsWith("shiftmgmt-verify-v3-"), "임시 정리 경로 범위 오류");
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  }
  if (options.report) fs.writeFileSync(path.resolve(options.report), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, inputTables: result.inputTables, inputRows: result.inputRows, comparedTables: result.comparisons.length, approvedMoneyPreserved: true, json3RoundTrip: true, automaticBackupActuallyRecovered: true, originalUnchanged: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
