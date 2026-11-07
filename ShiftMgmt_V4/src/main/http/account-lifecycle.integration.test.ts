import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, unlinkSync, rmdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, UserRecord, UserStatus } from "../../shared/domain/model";
import type { BridgeResult, JsonDatabaseBackupSummary, JsonDatabaseRestorePreview } from "../../shared/bridge/contracts";
import { createServer } from "../server";
import { AppRuntime } from "../runtime";
import { resetAuthStateForTest } from "../services/auth-service";
import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "../services/app-settings-storage-service";
import { deleteStoredOperationUser, listStoredOperationUsers } from "../services/operations-storage-service";
import { closeFileWatchRuntime } from "../services/file-watch-runtime-service";
import { closeSqliteStorage, getSqliteDatabase, getSqliteStorageContext, initializeSqliteStorage, resetSqliteStorageForTest } from "../services/sqlite-storage-service";

const initialPassword = "Quality-Fixture-123!";
const changedPassword = "Quality-Changed-456!";
let fixture: string;
let runtime: AppRuntime;
let server: Server;
let origin: string;
let activeCookie: string;
let admin: UserRecord;

function take<T>(result: BridgeResult<T>): T {
  expect(result.ok, result.ok ? "success" : result.message).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

async function call<T = unknown>(channel: string, args: unknown[] = [], cookie = activeCookie) {
  const response = await fetch(origin + "/api/" + channel, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(args)
  });
  return { status: response.status, body: await response.json() as BridgeResult<T>, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

async function createUser(status: UserStatus = "active", role: UserRecord["role"] = "operator") {
  return take((await call<UserRecord>("operations:save-user", [{
    loginId: "quality-" + role + "-" + status, displayName: "계정 검증 " + status,
    role, status, password: initialPassword
  }])).body);
}

async function expectOldCookieRejected() {
  for (const channel of ["operations:list-users", "employees:list"]) {
    const result = await call(channel);
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, errorCode: "AUTH_SESSION_REQUIRED" });
  }
  expect((await call("auth:get-session")).body).toEqual({ ok: true, data: null });
}

describe("account lifecycle through actual HTTP routes and SQLite", () => {
  beforeEach(async () => {
    fixture = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-account-lifecycle-"));
    vi.stubEnv("DATA_DIR", fixture);
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", initialPassword);
    resetAuthStateForTest();
    initializeSqliteStorage({ userDataPath: fixture });
    admin = listStoredOperationUsers().find(user => user.loginId === "admin")!;
    saveStoredAppSettings({
      ...getStoredAppSettingsSnapshot({ userDataPath: fixture }),
      pendingDir: path.join(fixture, "pending"), approvedDir: path.join(fixture, "approved"),
      databaseBackupDir: path.join(fixture, "backups"), scheduleExportDir: path.join(fixture, "exports")
    }, { userDataPath: fixture });
    runtime = new AppRuntime({ dataDir: fixture, version: "0.1.0", dialogBridge: {
      showDialog: async () => ({ ok: true, cancelled: true }), dispose: async () => {}
    } });
    server = createServer({ runtime, dataDir: fixture, log: () => {} });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    activeCookie = "";
    const response = await call<AuthSession>("auth:sign-in", [{ loginId: "admin", password: initialPassword }]);
    const session = take(response.body);
    expect(response.cookie).toBeTruthy();
    activeCookie = response.cookie!;
    if (session.passwordChangeRequired) take((await call("auth:change-password", [{ currentPassword: initialPassword, nextPassword: changedPassword }])).body);
  });

  afterEach(async () => {
    await closeFileWatchRuntime();
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    runtime?.sessionManager.clear();
    resetAuthStateForTest();
    resetSqliteStorageForTest();
    vi.unstubAllEnvs();
  });

  it.each<UserStatus>(["active", "inactive", "pending"])("preserves %s when editing other account details", async status => {
    const user = await createUser(status);
    take((await call("operations:save-user", [{ ...user, displayName: "이름만 변경" }])).body);
    const users = take((await call<UserRecord[]>("operations:list-users")).body);
    expect(users.find(row => row.id === user.id)).toMatchObject({ status, displayName: "이름만 변경" });
    expect((await call("operations:save-user", [{ ...user, status: "suspended" }])).body).toMatchObject({ ok: false, errorCode: "OPERATION_USER_SAVE_FAILED" });
    expect(take((await call<UserRecord[]>("operations:list-users")).body).find(row => row.id === user.id)?.status).toBe(status);
  });

  it("revokes a demoted administrator's cookie and uses the current role on new login", async () => {
    await createUser("active", "admin");
    take((await call("operations:save-user", [{ ...admin, role: "operator" }])).body);
    await expectOldCookieRejected();
    const next = await call<AuthSession>("auth:sign-in", [{ loginId: "admin", password: changedPassword }], "");
    expect(take(next.body).role).toBe("operator");
    expect((await call("operations:list-users", [], next.cookie)).body).toMatchObject({ ok: false, errorCode: "AUTH_FORBIDDEN" });
  });

  it.each<UserStatus>(["inactive", "pending"])("revokes an administrator changed to %s and rejects a new login", async status => {
    await createUser("active", "admin");
    take((await call("operations:save-user", [{ ...admin, status }])).body);
    await expectOldCookieRejected();
    expect((await call("auth:sign-in", [{ loginId: "admin", password: changedPassword }], "")).body).toMatchObject({ ok: false, errorCode: "AUTH_INVALID_CREDENTIALS" });
  });

  it("rejects a deleted account without recreating the seeded administrator", async () => {
    await createUser("active", "admin");
    deleteStoredOperationUser(admin.id);
    const before = getSqliteDatabase()!.prepare("SELECT total_changes() AS changes").get();
    await expectOldCookieRejected();
    expect(getSqliteDatabase()!.prepare("SELECT total_changes() AS changes").get()).toEqual(before);
    expect(getSqliteDatabase()!.prepare("SELECT id FROM app_users WHERE id = ?").get(admin.id)).toBeUndefined();
  });

  it("does not seed any table while rejecting a session whose user table became empty", async () => {
    const db = getSqliteDatabase()!;
    db.exec("DELETE FROM app_users"); // Simulated external invalid restore, not an application write path.
    const before = db.prepare("SELECT total_changes() AS changes").get();
    await expectOldCookieRejected();
    expect(db.prepare("SELECT total_changes() AS changes").get()).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS count FROM app_users").get()).toMatchObject({ count: 0 });
  });

  it("revokes a cookie after an administrative password reset", async () => {
    take((await call("operations:save-user", [{ ...admin, password: "Quality-Reset-789!" }])).body);
    await expectOldCookieRejected();
    const next = await call<AuthSession>("auth:sign-in", [{ loginId: "admin", password: "Quality-Reset-789!" }], "");
    expect(take(next.body).passwordChangeRequired).toBe(true);
    expect((await call("operations:list-users", [], next.cookie)).body).toMatchObject({ ok: false, errorCode: "AUTH_PASSWORD_CHANGE_REQUIRED" });
  });

  it.each([
    { role: "admin", status: "inactive" }, { role: "admin", status: "pending" }, { role: "operator", status: "active" }
  ])("protects the last active admin from $role/$status even with inactive admins", async change => {
    await createUser("inactive", "admin");
    const users = take((await call<UserRecord[]>("operations:list-users")).body);
    expect((await call("operations:save-user", [{ ...admin, ...change }])).body).toMatchObject({ ok: false, errorCode: "OPERATION_USER_SAVE_FAILED" });
    expect(take((await call<UserRecord[]>("operations:list-users")).body)).toEqual(users);
    expect(() => deleteStoredOperationUser(admin.id)).toThrow("활성 관리자");
    expect(take((await call<UserRecord[]>("operations:list-users")).body)).toEqual(users);
  });

  it("rejects self deletion while allowing another administrator account to be deleted", async () => {
    const other = await createUser("active", "admin");
    expect((await call("operations:delete-user", [{ userId: admin.id }])).body).toMatchObject({ ok: false, errorCode: "OPERATION_USER_DELETE_FAILED" });
    take((await call("operations:delete-user", [{ userId: other.id }])).body);
    const users = take((await call<UserRecord[]>("operations:list-users")).body);
    expect(users.some(user => user.id === admin.id)).toBe(true);
    expect(users.some(user => user.id === other.id)).toBe(false);
  });

  it("invalidates cookies after a connection replacement with identical credentials", async () => {
    closeSqliteStorage();
    initializeSqliteStorage({ userDataPath: fixture });
    await expectOldCookieRejected();
    expect(take((await call<AuthSession>("auth:sign-in", [{ loginId: "admin", password: changedPassword }], "")).body).role).toBe("admin");
  });

  it("keeps the session on preview/pre-replacement failure and revokes it after real same-account JSON restore", async () => {
    const backup = take((await call<JsonDatabaseBackupSummary>("operations:run-database-backup-now")).body);
    const preview = take((await call<JsonDatabaseRestorePreview>("operations:preview-database-migration-update", [{ backupFilePath: backup.jsonBackupPath }])).body);
    expect(take((await call<UserRecord[]>("operations:list-users")).body).some(user => user.id === admin.id)).toBe(true);
    const original = readFileSync(backup.jsonBackupPath);
    writeFileSync(backup.jsonBackupPath, Buffer.concat([original, Buffer.from("\n")]));
    const input = { backupFilePath: backup.jsonBackupPath, backupSha256: preview.backupSha256, previewToken: preview.previewToken, confirmationText: "교체" };
    expect((await call("operations:update-database-from-migration", [input])).body).toMatchObject({ ok: false, errorCode: "DATABASE_MIGRATION_FAILED" });
    expect(take((await call<UserRecord[]>("operations:list-users")).body).some(user => user.id === admin.id)).toBe(true);
    writeFileSync(backup.jsonBackupPath, original);
    const refreshed = take((await call<JsonDatabaseRestorePreview>("operations:preview-database-migration-update", [{ backupFilePath: backup.jsonBackupPath }])).body);
    take((await call("operations:update-database-from-migration", [{ ...input, backupSha256: refreshed.backupSha256, previewToken: refreshed.previewToken }])).body);
    await expectOldCookieRejected();
    expect(take((await call<AuthSession>("auth:sign-in", [{ loginId: "admin", password: changedPassword }], "")).body).role).toBe("admin");
  });

  it("rejects the old cookie after a real DB replacement followed by cleanup/reopen failure", async () => {
    const backup = take((await call<JsonDatabaseBackupSummary>("operations:run-database-backup-now")).body);
    const preview = take((await call<JsonDatabaseRestorePreview>("operations:preview-database-migration-update", [{ backupFilePath: backup.jsonBackupPath }])).body);
    const databasePath = getSqliteStorageContext()!.dbPath;
    const faultDir = databasePath + ".migration-backup-" + (Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(path.relative(fixture, faultDir).startsWith("..")).toBe(false);
    expect(path.isAbsolute(path.relative(fixture, faultDir))).toBe(false);
    mkdirSync(faultDir);
    writeFileSync(path.join(faultDir, "keep.txt"), "Controlled cleanup failure after replacement");
    try {
      const result = await call("operations:update-database-from-migration", [{
        backupFilePath: backup.jsonBackupPath, backupSha256: preview.backupSha256,
        previewToken: preview.previewToken, confirmationText: "교체"
      }]);
      expect(result.body).toMatchObject({ ok: false, errorCode: "DATABASE_MIGRATION_FAILED" });
      expect(readdirSync(path.dirname(databasePath)).some(name =>
        name.startsWith(path.basename(databasePath) + ".migration-backup-") &&
        statSync(path.join(path.dirname(databasePath), name)).isFile())).toBe(true);
      await expectOldCookieRejected();
    } finally {
      unlinkSync(path.join(faultDir, "keep.txt"));
      rmdirSync(faultDir);
      initializeSqliteStorage({ userDataPath: fixture });
    }
    await expectOldCookieRejected();
    expect(take((await call<AuthSession>("auth:sign-in", [{ loginId: "admin", password: changedPassword }], "")).body).role).toBe("admin");
  });
});
