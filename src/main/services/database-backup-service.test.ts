import crypto from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

let mockPublishFailure: Error | null = null;
let mockWriteFailure: Error | null = null;

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (oldPath: string, newPath: string) => {
      if (mockPublishFailure) {
        throw mockPublishFailure;
      }
      return actual.rename(oldPath, newPath);
    },
    writeFile: async (
      file: Parameters<typeof actual.writeFile>[0],
      data: Parameters<typeof actual.writeFile>[1],
      options?: Parameters<typeof actual.writeFile>[2]
    ) => {
      if (mockWriteFailure) {
        throw mockWriteFailure;
      }
      return actual.writeFile(file, data, options);
    }
  };
});

import type { JsonDatabaseBackupSummary } from "../../shared/bridge/contracts";
import { saveStoredAppSettings } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-backup");
const dataDir = path.resolve(testRoot, "data");
const dbPath = path.resolve(dataDir, "database-backup.test.sqlite");
const userDataPath = path.resolve(testRoot, "user-data");
const env = {
  DATA_DIR: dataDir
};

describe("database-backup-service", () => {
  afterEach(() => {
    mockPublishFailure = null;
    mockWriteFailure = null;
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should write a single JSON backup file with 40 tables, row count, and verified SHA-256 (J1, N8)", async () => {
    initializeSqliteStorage({ dbPath, env });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports"),
        allowanceProposalExportDir: path.resolve(testRoot, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRoot, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRoot, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRoot, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      { userDataPath, env }
    );

    const result = await runDatabaseBackupNow({ userDataPath, env });

    // 1. JSON backup file exists
    expect(existsSync(result.jsonBackupPath)).toBe(true);

    // 2. Real file SHA-256 matches returned backupSha256
    const fileBytes = readFileSync(result.jsonBackupPath);
    const computedSha = crypto.createHash("sha256").update(fileBytes).digest("hex");
    expect(result.backupSha256).toBe(computedSha);

    // 3. Schema version and table count
    expect(result.schemaVersion).toBe("1");
    expect(result.tableCount).toBe(40);
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.warningMessages).toHaveLength(0);

    // 4. Verify JSON content structure
    const parsed = JSON.parse(fileBytes.toString("utf8")) as {
      schemaVersion: number;
      createdAt: string;
      tables: Record<string, unknown[]>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(Object.keys(parsed.tables)).toHaveLength(40);
    expect(Array.isArray(parsed.tables.app_setting_entries)).toBe(true);

    // 5. Excel and Access directories/files are NOT created (N8)
    const backupDir = path.resolve(testRoot, "backups");
    expect(existsSync(path.resolve(backupDir, "excel"))).toBe(false);
    expect(existsSync(path.resolve(backupDir, "access"))).toBe(false);
  });

  it("should generate distinct filenames without overwriting when executed multiple times in the same second (J1, N8)", async () => {
    initializeSqliteStorage({ dbPath, env });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports"),
        allowanceProposalExportDir: path.resolve(testRoot, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRoot, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRoot, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRoot, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      { userDataPath, env }
    );

    const firstResult = await runDatabaseBackupNow({ userDataPath, env });
    const secondResult = await runDatabaseBackupNow({ userDataPath, env });

    expect(firstResult.jsonBackupPath).not.toBe(secondResult.jsonBackupPath);
    expect(existsSync(firstResult.jsonBackupPath)).toBe(true);
    expect(existsSync(secondResult.jsonBackupPath)).toBe(true);

    const jsonDir = path.resolve(testRoot, "backups", "json");
    const jsonFiles = readdirSync(jsonDir).filter((name) => name.endsWith(".json"));
    expect(jsonFiles.length).toBe(2);

    // No leftover temporary files (.tmp*)
    const tempFiles = readdirSync(jsonDir).filter((name) => name.startsWith(".tmp"));
    expect(tempFiles).toHaveLength(0);
  });

  it("should handle concurrent backups in the same second with Promise.allSettled without EPERM or collision (C04, J1, N8)", async () => {
    initializeSqliteStorage({ dbPath, env });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports"),
        allowanceProposalExportDir: path.resolve(testRoot, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRoot, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRoot, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRoot, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      { userDataPath, env }
    );

    const settledResults = await Promise.allSettled([
      runDatabaseBackupNow({ userDataPath, env }),
      runDatabaseBackupNow({ userDataPath, env })
    ]);

    expect(settledResults[0].status).toBe("fulfilled");
    expect(settledResults[1].status).toBe("fulfilled");

    const first = (settledResults[0] as PromiseFulfilledResult<JsonDatabaseBackupSummary>).value;
    const second = (settledResults[1] as PromiseFulfilledResult<JsonDatabaseBackupSummary>).value;

    expect(first.jsonBackupPath).not.toBe(second.jsonBackupPath);
    expect(existsSync(first.jsonBackupPath)).toBe(true);
    expect(existsSync(second.jsonBackupPath)).toBe(true);

    const firstBytes = readFileSync(first.jsonBackupPath);
    const secondBytes = readFileSync(second.jsonBackupPath);
    const firstComputedSha = crypto.createHash("sha256").update(firstBytes).digest("hex");
    const secondComputedSha = crypto.createHash("sha256").update(secondBytes).digest("hex");

    expect(first.backupSha256).toBe(firstComputedSha);
    expect(second.backupSha256).toBe(secondComputedSha);

    const firstParsed = JSON.parse(firstBytes.toString("utf8"));
    const secondParsed = JSON.parse(secondBytes.toString("utf8"));

    expect(firstParsed.schemaVersion).toBe(1);
    expect(secondParsed.schemaVersion).toBe(1);
    expect(Object.keys(firstParsed.tables)).toHaveLength(40);
    expect(Object.keys(secondParsed.tables)).toHaveLength(40);
    expect(first.rowCount).toBe(second.rowCount);

    const jsonDir = path.resolve(testRoot, "backups", "json");
    const tempFiles = readdirSync(jsonDir).filter((name) => name.startsWith(".tmp"));
    expect(tempFiles).toHaveLength(0);
  });

  it("C04: should preserve existing completed backup and leave zero temporary files when subsequent backup fails during write or publish", async () => {
    initializeSqliteStorage({ dbPath, env });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports"),
        allowanceProposalExportDir: path.resolve(testRoot, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRoot, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRoot, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRoot, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      { userDataPath, env }
    );

    // 1. Initial successful backup
    const initialResult = await runDatabaseBackupNow({ userDataPath, env });
    expect(existsSync(initialResult.jsonBackupPath)).toBe(true);

    const initialBytes = readFileSync(initialResult.jsonBackupPath);
    const initialSha = crypto.createHash("sha256").update(initialBytes).digest("hex");
    expect(initialResult.backupSha256).toBe(initialSha);

    const jsonDir = path.resolve(testRoot, "backups", "json");

    // 2. Failure injection during publish (rename failure)
    mockPublishFailure = new Error("Injected publish/rename failure");

    await expect(runDatabaseBackupNow({ userDataPath, env })).rejects.toThrow("Injected publish/rename failure");
    mockPublishFailure = null;

    // Verify existing completed backup is untouched (bytes and SHA-256 identical)
    expect(existsSync(initialResult.jsonBackupPath)).toBe(true);
    const currentBytesAfterRenameFail = readFileSync(initialResult.jsonBackupPath);
    expect(currentBytesAfterRenameFail).toEqual(initialBytes);
    const currentShaAfterRenameFail = crypto.createHash("sha256").update(currentBytesAfterRenameFail).digest("hex");
    expect(currentShaAfterRenameFail).toBe(initialSha);

    // Verify zero temporary files left (.tmp*) and only 1 file in directory
    const tempFilesAfterRename = readdirSync(jsonDir).filter((name) => name.startsWith(".tmp"));
    expect(tempFilesAfterRename).toHaveLength(0);
    expect(readdirSync(jsonDir)).toEqual([path.basename(initialResult.jsonBackupPath)]);

    // 3. Failure injection during write (writeFile failure)
    mockWriteFailure = new Error("Injected disk write failure");

    await expect(runDatabaseBackupNow({ userDataPath, env })).rejects.toThrow("Injected disk write failure");
    mockWriteFailure = null;

    // Verify existing completed backup is still untouched
    const currentBytesAfterWriteFail = readFileSync(initialResult.jsonBackupPath);
    expect(currentBytesAfterWriteFail).toEqual(initialBytes);
    const currentShaAfterWriteFail = crypto.createHash("sha256").update(currentBytesAfterWriteFail).digest("hex");
    expect(currentShaAfterWriteFail).toBe(initialSha);

    // Verify zero temporary files left and only 1 file in directory
    const tempFilesAfterWrite = readdirSync(jsonDir).filter((name) => name.startsWith(".tmp"));
    expect(tempFilesAfterWrite).toHaveLength(0);
    expect(readdirSync(jsonDir)).toEqual([path.basename(initialResult.jsonBackupPath)]);
  });
});
