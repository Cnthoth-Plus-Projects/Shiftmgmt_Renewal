import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AppSettingsSnapshot,
  JsonDatabaseBackupSummary
} from "../../shared/bridge/contracts";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { getSqliteDatabase } from "./sqlite-storage-service";
import { initializePolicyHistory, isPolicyHistoryInitialized } from "./policy-history-service";

interface BackupRuntimeState {
  interval: NodeJS.Timeout | null;
  lastTriggeredSlot: string | null;
}

const runtimeState: BackupRuntimeState = {
  interval: null,
  lastTriggeredSlot: null
};

const backupTickIntervalMs = 30_000;

interface BackupTableSnapshot {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

const getTimestampSegment = (date = new Date()) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(
    date.getMinutes()
  ).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;

const quoteSqlIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const listUserTableNames = () => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }

  return database
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `
    )
    .all() as Array<{ name: string }>;
};

const listBackupTableSnapshots = (): BackupTableSnapshot[] => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }

  if (!isPolicyHistoryInitialized(database)) {
    initializePolicyHistory(database);
  }

  return listUserTableNames().map(({ name }) => {
    const columns = (
      database.prepare(`PRAGMA table_info(${quoteSqlIdentifier(name)})`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    const rows = database.prepare(`SELECT * FROM ${quoteSqlIdentifier(name)}`).all() as Array<
      Record<string, unknown>
    >;

    return {
      name,
      columns,
      rows
    };
  });
};

const buildJsonBackupSnapshot = (input: {
  createdAt: string;
  tables: BackupTableSnapshot[];
}) => {
  const tables = input.tables.reduce<Record<string, Array<Record<string, unknown>>>>(
    (accumulator, table) => {
      accumulator[table.name] = table.rows;
      return accumulator;
    },
    {}
  );

  return {
    schemaVersion: 3,
    createdAt: input.createdAt,
    tables
  };
};

const reservedBackupPaths = new Set<string>();

const claimAndPublishBackupFile = async (
  tempJsonPath: string,
  jsonDir: string,
  timestamp: string
): Promise<string> => {
  const baseName = `shiftmgmt-backup-${timestamp}`;
  let counter = 0;

  while (counter < 1000) {
    const candidateName =
      counter === 0
        ? `${baseName}.json`
        : `${baseName}_${String(counter).padStart(2, "0")}.json`;
    const candidatePath = path.resolve(jsonDir, candidateName);

    if (reservedBackupPaths.has(candidatePath) || existsSync(candidatePath)) {
      counter += 1;
      continue;
    }

    reservedBackupPaths.add(candidatePath);
    try {
      if (existsSync(candidatePath)) {
        counter += 1;
        continue;
      }
      await rename(tempJsonPath, candidatePath);
      return candidatePath;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "EPERM" || code === "EEXIST") {
        counter += 1;
        continue;
      }
      throw err;
    } finally {
      reservedBackupPaths.delete(candidatePath);
    }
  }

  throw new Error("고유한 백업 파일 경로를 예약하지 못했습니다.");
};


const shouldRunForSchedule = (
  schedule: AppSettingsSnapshot["databaseBackupSchedule"],
  now: Date
) => {
  if (schedule === "daily") {
    return true;
  }

  if (schedule === "weekly") {
    return now.getDay() === 1;
  }

  return now.getDate() === 1;
};

const getScheduleSlotKey = (
  schedule: AppSettingsSnapshot["databaseBackupSchedule"],
  backupTime: string,
  now: Date
) =>
  `${schedule}:${backupTime}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

export const runDatabaseBackupNow = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<JsonDatabaseBackupSummary> => {
  const settings = getStoredAppSettingsSnapshot(input);
  const timestamp = getTimestampSegment();
  const createdAt = new Date().toISOString();
  const tableSnapshots = listBackupTableSnapshots();
  const jsonDir = path.resolve(settings.databaseBackupDir, "json");
  const tempJsonPath = path.resolve(jsonDir, `.tmp-${Date.now()}-${randomUUID()}.json`);

  await mkdir(jsonDir, { recursive: true });

  const totalRowCount = tableSnapshots.reduce((acc, t) => acc + t.rows.length, 0);
  const tableCount = tableSnapshots.length;

  const jsonContent = JSON.stringify(
    buildJsonBackupSnapshot({
      createdAt,
      tables: tableSnapshots
    }),
    null,
    2
  );

  let finalJsonPath: string | null = null;
  try {
    await writeFile(tempJsonPath, jsonContent, "utf8");

    finalJsonPath = await claimAndPublishBackupFile(tempJsonPath, jsonDir, timestamp);

    // 공개된 실파일을 다시 읽어 SHA-256 계산
    const publishedBytes = await readFile(finalJsonPath);
    const backupSha256 = crypto.createHash("sha256").update(publishedBytes).digest("hex");

    return {
      createdAt,
      jsonBackupPath: finalJsonPath,
      backupSha256,
      schemaVersion: "3",
      tableCount,
      rowCount: totalRowCount,
      warningMessages: []
    };
  } catch (error) {
    if (existsSync(tempJsonPath)) {
      try {
        rmSync(tempJsonPath, { force: true });
      } catch {
        // ignore cleanup error
      }
    }
    if (finalJsonPath && existsSync(finalJsonPath)) {
      try {
        rmSync(finalJsonPath, { force: true });
      } catch {
        // ignore cleanup error
      }
    }
    throw error;
  }
};

const checkAndRunScheduledBackup = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => {
  const settings = getStoredAppSettingsSnapshot(input);
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  if (currentTime !== settings.databaseBackupTime) {
    return;
  }

  if (!shouldRunForSchedule(settings.databaseBackupSchedule, now)) {
    return;
  }

  const slotKey = getScheduleSlotKey(
    settings.databaseBackupSchedule,
    settings.databaseBackupTime,
    now
  );

  if (runtimeState.lastTriggeredSlot === slotKey) {
    return;
  }

  runtimeState.lastTriggeredSlot = slotKey;

  try {
    await runDatabaseBackupNow(input);
  } catch (error) {
    console.error("[database-backup] scheduled backup failed", error);
  }
};

export const restartDatabaseBackupRuntime = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }

  runtimeState.lastTriggeredSlot = null;
  runtimeState.interval = setInterval(() => {
    void checkAndRunScheduledBackup(input);
  }, backupTickIntervalMs);
};

export const stopDatabaseBackupRuntime = () => {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }

  runtimeState.lastTriggeredSlot = null;
};
