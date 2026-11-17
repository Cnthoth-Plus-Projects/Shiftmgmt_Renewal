// One-time, explicitly scoped migration. Never opens the application's production data directory.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { canonicalTableHash } from "./verify-v3-json-migration.mjs";
const require = createRequire(import.meta.url);
const storage = require("../dist/server/main/services/sqlite-storage-service.js");
const migration = require("../dist/server/main/services/database-migration-service.js");
const backup = require("../dist/server/main/services/database-backup-service.js");
const settings = require("../dist/server/main/services/app-settings-storage-service.js");
const policy = require("../dist/server/main/services/policy-history-service.js");
const identities = require("../dist/server/main/services/legacy-identity-service.js");
const { isBpDisplayName } = require("../dist/server/shared/domain/employment-type.js");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert(["--input", "--output-dir", "--names-json", "--expected-sha"].includes(key) && process.argv[i + 1] && !Object.hasOwn(options, key), "입력/출력폴더/검토한 이름/원본해시 인수를 확인하세요.");
  options[key] = process.argv[i + 1];
}
assert(Object.keys(options).length === 4, "--input --output-dir --names-json --expected-sha가 모두 필요합니다.");
const input = path.resolve(options["--input"]), output = path.resolve(options["--output-dir"]);
const bytes = fs.readFileSync(input), inputSha = sha(bytes);
assert.equal(inputSha, options["--expected-sha"].toLowerCase(), "원본 SHA 불일치");
assert(!fs.existsSync(output), "출력 폴더가 이미 있습니다. 원본/기존 결과를 덮어쓰지 않습니다.");
const source = JSON.parse(bytes.toString("utf8"));
const prepared = identities.prepareLegacyIdentityBackup({ snapshot: source, sourceSha256: inputSha, names: JSON.parse(options["--names-json"]) });
const excluded = prepared.snapshot.tables.performance_entries.filter(row => !String(row.employee_code ?? "").trim() && !isBpDisplayName(String(row.employee_name)));
const excludedIds = new Set(excluded.map(row => row.id));
for (const row of excluded) {
  assert(!source.tables.performance_approvals.some(a => a.entry_id === row.id || a.logical_key === row.logical_key), "검토하지 않은 무사번 실적에 승인 이력이 있습니다.");
  assert(!source.tables.allowance_calculations.some(a => a.performance_entry_id === row.id), "검토하지 않은 무사번 실적에 계산 이력이 있습니다.");
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-legacy-migrate-"));
const context = { userDataPath: path.join(temp, "user-data"), env: { DATA_DIR: path.join(temp, "data") } };
const listRows = table => storage.getSqliteDatabase().prepare(`SELECT * FROM "${table}"`).all();
const money = values => {
  const groups = new Map();
  for (const row of values) { const key = String(row.work_date).slice(0, 7) + ":" + row.status; const item = groups.get(key) ?? { key, records: 0, amount: 0 }; item.records++; item.amount += Number(row.total_allowance_amount); groups.set(key, item); }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
};
try {
  const normalizedPath = path.join(temp, "identity-normalized-v1.json");
  fs.writeFileSync(normalizedPath, JSON.stringify(prepared.snapshot));
  const check = migration.checkDatabaseMigrationRequirements({ backupFilePath: normalizedPath });
  assert(check.isReady, JSON.stringify(check));
  storage.initializeSqliteStorage(context);
  settings.getStoredAppSettingsSnapshot(context);
  policy.initializePolicyHistory(storage.getSqliteDatabase());
  const initialBusiness = Object.fromEntries(Object.keys(source.tables).filter(name => name !== "app_setting_entries").map(name => [name, canonicalTableHash(listRows(name))]));
  const before = migration.computeDatabaseContentFingerprint(storage.getSqliteDatabase());
  const preview = migration.previewDatabaseMigrationUpdate({ ...context, backupFilePath: normalizedPath });
  assert.equal(migration.computeDatabaseContentFingerprint(storage.getSqliteDatabase()), before, "미리보기가 임시대상 DB를 변경했습니다.");
  const restored = await migration.runDatabaseMigrationUpdate({ ...context, backupFilePath: normalizedPath, backupSha256: check.backupSha256, previewToken: preview.previewToken, confirmationText: "교체" });
  assert.equal(listRows("performance_entries").length, source.tables.performance_entries.length - excluded.length);
  const comparisons = [];
  for (const name of Object.keys(source.tables).filter(name => !["app_setting_entries", "performance_files"].includes(name))) {
    const wanted = name === "performance_entries" ? prepared.snapshot.tables[name].filter(row => !excludedIds.has(row.id)) : prepared.snapshot.tables[name];
    assert.equal(canonicalTableHash(listRows(name)), canonicalTableHash(wanted, name), name + " 원문 비교");
    comparisons.push({ table: name, rows: wanted.length, sha256: canonicalTableHash(listRows(name)) });
  }
  const affectedFiles = new Set(excluded.map(row => row.performance_file_id));
  const changedMetadata = new Set(["preview_json", "warning_count", "entry_count", "approved_entry_count"]);
  for (const file of listRows("performance_files")) {
    const wanted = prepared.snapshot.tables.performance_files.find(row => row.id === file.id);
    assert(wanted);
    for (const key of Object.keys(wanted)) if (!affectedFiles.has(file.id) || !changedMetadata.has(key)) assert.deepEqual(file[key], wanted[key], "실적 파일의 보호 필드 " + key);
  }
  const expectedMoney = money(source.tables.allowance_calculations);
  assert.deepEqual(money(listRows("allowance_calculations")), expectedMoney);
  for (const name of ["allowance_calculation_items", "allowance_proposal_approvals", "allowance_document_exports", "wage_rate_history"]) assert.equal(canonicalTableHash(listRows(name)), canonicalTableHash(source.tables[name]), name + " 금융 원문 보존");
  assert.equal(storage.getSqliteDatabase().prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(identities.listLegacyIdentities().length, prepared.registry.identities.length);
  const generated = await backup.runDatabaseBackupNow(context), generatedBytes = fs.readFileSync(generated.jsonBackupPath), generatedSnapshot = JSON.parse(generatedBytes);
  assert.equal(generatedSnapshot.schemaVersion, 3);
  assert.equal(Object.keys(generatedSnapshot.tables).length, 43);
  const roundtrip = migration.previewDatabaseMigrationUpdate({ ...context, backupFilePath: generated.jsonBackupPath });
  await migration.runDatabaseMigrationUpdate({ ...context, backupFilePath: generated.jsonBackupPath, backupSha256: roundtrip.backupSha256, previewToken: roundtrip.previewToken, confirmationText: "교체" });
  for (const name of Object.keys(generatedSnapshot.tables).filter(name => name !== "app_setting_entries")) assert.equal(canonicalTableHash(listRows(name)), canonicalTableHash(generatedSnapshot.tables[name]), name + " JSON3 실제 왕복");
  storage.closeSqliteStorage(); storage.initializeSqliteStorage(context);
  assert.deepEqual(money(listRows("allowance_calculations")), expectedMoney, "재시작 후 금액 보존");
  const identitySummary = identities.listLegacyIdentities();
  assert.equal(identitySummary.length, prepared.registry.identities.length);
  const recovery = migration.previewDatabaseMigrationUpdate({ ...context, backupFilePath: restored.backupBeforeRestore.jsonBackupPath });
  await migration.runDatabaseMigrationUpdate({ ...context, backupFilePath: restored.backupBeforeRestore.jsonBackupPath, backupSha256: recovery.backupSha256, previewToken: recovery.previewToken, confirmationText: "교체" });
  for (const [name, fingerprint] of Object.entries(initialBusiness)) assert.equal(canonicalTableHash(listRows(name)), fingerprint, "교체 전 자동백업 실제 복구 " + name);
  assert.equal(sha(fs.readFileSync(input)), inputSha, "원본 변경");
  fs.mkdirSync(output);
  const fileName = "shiftmgmt-initial-legacy-identity.json";
  fs.writeFileSync(path.join(output, fileName), generatedBytes, { flag: "wx" });
  fs.writeFileSync(path.join(output, "excluded-unassigned-records.json"), JSON.stringify({ sourceSha256: inputSha, reason: "검토한 두 인물 외 사번 없는 미승인·미계산 실적은 기존 이관 규칙으로 제외", records: excluded }, null, 2), { flag: "wx" });
  const result = { ok: true, mode: "FRESH_EXECUTION", sourceSha256: inputSha, sourceUnchanged: true, sourceTables: Object.keys(source.tables).length, sourceRows: Object.values(source.tables).reduce((n, a) => n + a.length, 0), initialBackup: fileName, initialBackupSha256: sha(generatedBytes), schemaVersion: 3, tables: 43, performanceEntriesBefore: source.tables.performance_entries.length, performanceEntriesAfter: generatedSnapshot.tables.performance_entries.length, excludedRecords: excluded.length, preservedIdentities: identitySummary, comparisons, moneyByMonthAndStatus: expectedMoney, approvedAmountsPreserved: true, json3RoundTrip: true, restartVerified: true, automaticBackupActuallyRecovered: true, productionDatabaseAccessed: false, tempDir: temp, warningMessages: restored.warningMessages };
  fs.writeFileSync(path.join(output, "migration-result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ ok: true, output, schemaVersion: 3, tables: 43, excluded: excluded.length, identities: identitySummary, moneyPreserved: true, json3RoundTrip: true, originalUnchanged: true, result: path.join(output, "migration-result.json") }, null, 2));
} finally { storage.closeSqliteStorage(); }
