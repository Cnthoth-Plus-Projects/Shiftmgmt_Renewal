import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LEGACY_IDENTITY_SETTING_KEY, parseLegacyIdentityRegistry, validateLegacyIdentityBindings, type LegacyIdentityTables } from "../../shared/domain/legacy-identity";
import { prepareLegacyIdentityBackup, listLegacyIdentities, resolveLegacyIdentity } from "./legacy-identity-service";
import { closeSqliteStorage, getSqliteDatabase } from "./sqlite-storage-service";
import { prepareReturnedScheduleFixture, syncPreparedReturnedSchedule, testAdminSession } from "./performance-test-helpers";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { previewDatabaseMigrationUpdate, runDatabaseMigrationUpdate, checkDatabaseMigrationRequirements, computeDatabaseContentFingerprint } from "./database-migration-service";
import { saveStoredEmployee } from "./employee-storage-service";
import { deleteStoredPerformanceFile, getStoredPerformanceFileDetail, upsertPerformanceFileDetail } from "./performance-file-storage-service";

const sourceSha256 = "a".repeat(64);
const roots: string[] = [];
const fixtureSnapshot = () => ({ schemaVersion: 1, createdAt: "2026-01-01T00:00:00Z", tables: {
  employees: [], app_setting_entries: [], performance_files: [],
  performance_entries: [{ id: "a", employee_name: "과거갑", employee_code: "", logical_key: "a-key" }, { id: "b1", employee_name: "과거을", employee_code: "", logical_key: "shared-slot" }, { id: "b2", employee_name: "과거을", employee_code: "", logical_key: "shared-slot" }, { id: "c", employee_name: "현재병", employee_code: "1003", logical_key: "shared-slot" }],
  performance_approvals: [{ id: "ap-a", entry_id: "a", employee_name: "과거갑", employee_code: "", logical_key: "a-key", snapshot_json: JSON.stringify({ entry: { id: "a", employeeName: "과거갑", employeeCode: "", workDate: "2024-01-01" } }) }, { id: "ap-c", entry_id: "c", employee_name: "현재병", employee_code: "1003", logical_key: "shared-slot", snapshot_json: "{}" }],
  allowance_calculations: [{ id: "calc-a", performance_entry_id: "a", performance_approval_id: "ap-a", employee_name: "과거갑", employee_code: "", total_allowance_amount: 167400, signature: "unchanged", snapshot_json: "unchanged-financial" }],
  allowance_approvals: [{ id: "review-a", calculation_id: "calc-a", employee_name: "과거갑", employee_code: "" }]
} as LegacyIdentityTables });
const convert = (snapshot = fixtureSnapshot()) => prepareLegacyIdentityBackup({ snapshot, sourceSha256, names: ["과거갑", "과거을"], nowIso: "2026-01-01T00:00:00Z" });

afterEach(() => {
  closeSqliteStorage();
  for (const root of roots.splice(0)) {
    const target = realpathSync(root), parent = realpathSync(os.tmpdir());
    if (!target.startsWith(parent + path.sep) || !path.basename(target).startsWith("shiftmgmt-identity-test-")) throw Error("임시 시험 경로 오류");
    rmSync(target, { recursive: true, force: true });
  }
});

describe("reviewed legacy identities", () => {
  it("keeps historical people distinct, changes identity only, and leaves the source untouched", () => {
    const source = fixtureSnapshot(), before = JSON.stringify(source), result = convert(source);
    const [a, b] = result.registry.identities;
    expect(a.currentCode).not.toBe(b.currentCode);
    expect(a.currentCode).toMatch(/^LEGACY-UNKNOWN-/);
    expect(result.snapshot.tables.allowance_calculations[0]).toMatchObject({ total_allowance_amount: 167400, signature: "unchanged", snapshot_json: "unchanged-financial" });
    expect(JSON.parse(result.snapshot.tables.performance_approvals[0].snapshot_json as string).entry.employeeCode).toBe(a.currentCode);
    expect(a.originalApprovalSnapshots[0].snapshotJson).toBe(source.tables.performance_approvals[0].snapshot_json);
    expect(result.snapshot.tables.performance_approvals[1]).toEqual(source.tables.performance_approvals[1]);
    expect(result.snapshot.tables.performance_entries[1].logical_key).toBe(result.snapshot.tables.performance_entries[2].logical_key);
    expect(result.snapshot.tables.performance_entries[1].logical_key).not.toBe("shared-slot");
    expect(b.approvalIds).toEqual([]);
    expect(JSON.stringify(source)).toBe(before);
    expect(() => validateLegacyIdentityBindings(parseLegacyIdentityRegistry(result.registry), result.snapshot.tables)).not.toThrow();
  });
  it("uses a unique existing same-name employee without creating employment facts", () => {
    const snapshot = fixtureSnapshot(); snapshot.tables.employees.push({ id: "real-a", name: "과거갑", employee_code: "1001" });
    const result = convert(snapshot);
    expect(result.registry.identities[0]).toMatchObject({ currentCode: "1001", matchedEmployeeId: "real-a" });
    expect(result.snapshot.tables.employees).toEqual(snapshot.tables.employees);
    result.snapshot.tables.employees[0].name = "개명후이름";
    expect(() => validateLegacyIdentityBindings(result.registry, result.snapshot.tables)).not.toThrow();
  });
  it("rejects homonyms, a repeated migration, duplicate names, and a non-V1 input", () => {
    const snapshot = fixtureSnapshot(); snapshot.tables.employees.push({ id: "one", name: "과거갑", employee_code: "1" }, { id: "two", name: "과거갑", employee_code: "2" });
    expect(() => convert(snapshot)).toThrow("동명이인");
    expect(() => convert(convert().snapshot)).toThrow("이미");
    expect(() => prepareLegacyIdentityBackup({ snapshot: fixtureSnapshot(), sourceSha256, names: ["과거갑", "과거갑"] })).toThrow("중복");
    expect(() => convert({ ...fixtureSnapshot(), schemaVersion: 3 })).toThrow("V1");
  });
  it("rejects forged bindings and a mixed person's direct approval", () => {
    const changed = convert(); changed.snapshot.tables.performance_entries[0].employee_code = "forged";
    expect(() => validateLegacyIdentityBindings(changed.registry, changed.snapshot.tables)).toThrow("사번 연결 기록");
    const source = fixtureSnapshot(); source.tables.performance_approvals[0].employee_name = "다른사람";
    expect(() => convert(source)).toThrow("신원이 달라");
  });

  it("round-trips actual Excel approvals, resolves once, preserves money, and rolls failed writes back", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-identity-test-")); roots.push(root);
    const fixture = await prepareReturnedScheduleFixture({ rootDir: root });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const entry = detail.entries.find(e => e.section === "overtime")!;
    expect((await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, { userDataPath: fixture.userDataPath })).ok).toBe(true);
    const context = { userDataPath: fixture.userDataPath, env: { DATA_DIR: path.dirname(fixture.dbPath) } };
    const backup = await runDatabaseBackupNow(context);
    const snapshot = JSON.parse(readFileSync(backup.jsonBackupPath, "utf8"));
    snapshot.schemaVersion = 1;
    for (const name of ["policy_revisions", "policy_events", "performance_return_history"]) delete snapshot.tables[name];
    // The actual V1 producer predates policy bindings; do not fabricate a V1 file
    // that retains IDs from a deleted V3 policy registry.
    for (const row of snapshot.tables.performance_entries) row.policy_snapshot_json = null;
    for (const row of snapshot.tables.performance_files) row.policy_context_fingerprint = null;
    for (const row of snapshot.tables.performance_approvals) {
      const value = JSON.parse(row.snapshot_json); delete value.entry.appliedPolicies; row.snapshot_json = JSON.stringify(value);
    }
    const legacyName = "사번도입전인력";
    for (const table of ["performance_entries", "performance_approvals", "allowance_calculations", "allowance_approvals"]) for (const row of snapshot.tables[table]) {
      if (row.employee_code !== entry.employeeCode) continue;
      row.employee_name = legacyName; row.employee_code = "";
      if (table === "performance_approvals") { const value = JSON.parse(row.snapshot_json); value.entry.employeeName = legacyName; value.entry.employeeCode = ""; row.snapshot_json = JSON.stringify(value); }
    }
    const prepared = prepareLegacyIdentityBackup({ snapshot, sourceSha256, names: [legacyName] });
    const normalizedPath = path.join(root, "normalized.json"); writeFileSync(normalizedPath, JSON.stringify(prepared.snapshot));
    const preview = previewDatabaseMigrationUpdate({ ...context, backupFilePath: normalizedPath });
    await runDatabaseMigrationUpdate({ ...context, backupFilePath: normalizedPath, backupSha256: preview.backupSha256, previewToken: preview.previewToken, confirmationText: "교체" });
    const summary = listLegacyIdentities()[0]; expect(summary.canResolve).toBe(true);
    const preservedFile = getStoredPerformanceFileDetail(detail.id)!;
    expect(deleteStoredPerformanceFile(detail.id)).toBe(false);
    expect(() => upsertPerformanceFileDetail({ ...preservedFile, entries: [] })).toThrow("이관한 과거");
    const blocked = await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession);
    expect(blocked).toMatchObject({ ok: false });
    if (!blocked.ok) expect(blocked.message).toContain("미확인 번호");
    const financial = () => getSqliteDatabase()!.prepare("SELECT id,total_allowance_amount,snapshot_json,signature,hourly_rate,rate_version_id,status FROM allowance_calculations ORDER BY id").all();
    const before = financial();
    const person = saveStoredEmployee({ employeeCode: "REAL-1001", name: legacyName, status: "active", employmentType: "정규", hireDate: "2020-01-01" });
    const input = { identityId: summary.id, employeeCode: person.employeeCode, reason: "운영자 원부 확인", confirmationText: "연결" };
    let fingerprint = computeDatabaseContentFingerprint(getSqliteDatabase()!);
    expect(() => resolveLegacyIdentity(input, { ...testAdminSession, role: "operator" })).toThrow("관리자");
    expect(() => resolveLegacyIdentity({ ...input, employeeCode: entry.employeeCode }, testAdminSession)).toThrow("같은 이름");
    expect(computeDatabaseContentFingerprint(getSqliteDatabase()!)).toBe(fingerprint);
    getSqliteDatabase()!.exec(`CREATE TEMP TRIGGER identity_fail BEFORE UPDATE ON app_setting_entries WHEN NEW.setting_key='${LEGACY_IDENTITY_SETTING_KEY}' BEGIN SELECT RAISE(ABORT,'controlled failure'); END;`);
    expect(() => resolveLegacyIdentity(input, testAdminSession)).toThrow("controlled failure");
    getSqliteDatabase()!.exec("DROP TRIGGER identity_fail");
    expect(computeDatabaseContentFingerprint(getSqliteDatabase()!)).toBe(fingerprint);
    expect(resolveLegacyIdentity(input, testAdminSession)[0]).toMatchObject({ canResolve: false, employeeCode: person.employeeCode, resolution: { actorUserId: testAdminSession.userId, reason: input.reason } });
    expect(financial()).toEqual(before);
    fingerprint = computeDatabaseContentFingerprint(getSqliteDatabase()!);
    expect(() => resolveLegacyIdentity(input, testAdminSession)).toThrow("한 번");
    expect(computeDatabaseContentFingerprint(getSqliteDatabase()!)).toBe(fingerprint);
    const second = await runDatabaseBackupNow(context);
    const roundtrip = previewDatabaseMigrationUpdate({ ...context, backupFilePath: second.jsonBackupPath });
    await runDatabaseMigrationUpdate({ ...context, backupFilePath: second.jsonBackupPath, backupSha256: roundtrip.backupSha256, previewToken: roundtrip.previewToken, confirmationText: "교체" });
    expect(listLegacyIdentities()[0]).toMatchObject({ canResolve: false, employeeCode: person.employeeCode });
    expect(financial()).toEqual(before);
    const invalid = JSON.parse(readFileSync(second.jsonBackupPath, "utf8"));
    const setting = invalid.tables.app_setting_entries.find((row: {setting_key: string}) => row.setting_key === LEGACY_IDENTITY_SETTING_KEY);
    const registry = JSON.parse(setting.value); registry.identities[0].currentCode = "OTHER"; setting.value = JSON.stringify(registry);
    const invalidPath = path.join(root, "forged.json"); writeFileSync(invalidPath, JSON.stringify(invalid));
    expect(checkDatabaseMigrationRequirements({ backupFilePath: invalidPath }).isReady).toBe(false);
  }, 30000);
});
