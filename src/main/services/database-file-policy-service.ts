import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { AppSettingsSnapshot } from "../../shared/bridge/contracts";
import {
  resolveDatabaseMigrationSourceType
} from "../../shared/domain/database-migration";

type ConfiguredMigrationPathSettings = Pick<AppSettingsSnapshot, "migrationFilePath" | "dataDir">;

export const resolveConfiguredMigrationFilePath = (settings: ConfiguredMigrationPathSettings) => {
  const migrationFilePath = settings.migrationFilePath.trim();

  if (!migrationFilePath) {
    return "";
  }

  return path.isAbsolute(migrationFilePath)
    ? migrationFilePath
    : path.resolve(settings.dataDir, migrationFilePath);
};

export const resolveDatabaseMigrationInput = (input: {
  backupFilePath?: string;
  migrationFilePath?: string;
}) => {
  const rawPath = input.backupFilePath ?? input.migrationFilePath ?? "";
  const trimmedMigrationFilePath = rawPath.trim();

  if (!trimmedMigrationFilePath) {
    throw new Error("복원 파일 경로를 입력하세요.");
  }

  const migrationFilePath = path.resolve(trimmedMigrationFilePath);

  if (!existsSync(migrationFilePath)) {
    throw new Error("복원 파일을 찾을 수 없습니다.");
  }

  if (!statSync(migrationFilePath).isFile()) {
    throw new Error("복원 경로가 파일이 아닙니다.");
  }

  const sourceType = resolveDatabaseMigrationSourceType(migrationFilePath);

  if (sourceType !== "json") {
    throw new Error(
      "지원하지 않는 복원 파일 형식입니다. JSON 백업(.json)만 사용할 수 있습니다."
    );
  }

  return {
    backupFilePath: migrationFilePath,
    migrationFilePath,
    sourceType: "json" as const,
    extension: ".json" as const
  };
};
