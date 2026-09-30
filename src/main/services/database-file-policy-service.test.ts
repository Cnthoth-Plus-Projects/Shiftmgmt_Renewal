import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveConfiguredMigrationFilePath,
  resolveDatabaseMigrationInput
} from "./database-file-policy-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-file-policy");

describe("database-file-policy-service", () => {
  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should resolve a configured relative migration path against the data directory", () => {
    const dataDir = path.resolve(testRoot, "data");
    const sourcePath = path.resolve(dataDir, "migration", "backup.json");

    expect(
      resolveConfiguredMigrationFilePath({
        dataDir,
        migrationFilePath: path.relative(dataDir, sourcePath)
      })
    ).toBe(sourcePath);
  });

  it("should accept valid JSON backup file inputs", () => {
    const jsonFilePath = path.resolve(testRoot, "backup.json");
    mkdirSync(testRoot, { recursive: true });
    writeFileSync(jsonFilePath, JSON.stringify({ tables: {} }, null, 2), "utf8");

    expect(
      resolveDatabaseMigrationInput({
        backupFilePath: jsonFilePath
      })
    ).toEqual({
      backupFilePath: jsonFilePath,
      migrationFilePath: jsonFilePath,
      sourceType: "json",
      extension: ".json"
    });

    expect(
      resolveDatabaseMigrationInput({
        migrationFilePath: jsonFilePath
      })
    ).toEqual({
      backupFilePath: jsonFilePath,
      migrationFilePath: jsonFilePath,
      sourceType: "json",
      extension: ".json"
    });
  });

  it("should reject empty or missing paths", () => {
    expect(() =>
      resolveDatabaseMigrationInput({
        backupFilePath: "   "
      })
    ).toThrow("복원 파일 경로를 입력하세요.");
  });

  it("should reject non-existent files", () => {
    expect(() =>
      resolveDatabaseMigrationInput({
        backupFilePath: path.resolve(testRoot, "non-existent.json")
      })
    ).toThrow("복원 파일을 찾을 수 없습니다.");
  });

  it("should reject directory inputs", () => {
    const directoryPath = path.resolve(testRoot, "some-directory");
    mkdirSync(directoryPath, { recursive: true });

    expect(() =>
      resolveDatabaseMigrationInput({
        backupFilePath: directoryPath
      })
    ).toThrow("복원 경로가 파일이 아닙니다.");
  });

  it("should reject accdb and xlsx files as unsupported (N1)", () => {
    mkdirSync(testRoot, { recursive: true });
    const accdbPath = path.resolve(testRoot, "legacy.accdb");
    const xlsxPath = path.resolve(testRoot, "legacy.xlsx");
    writeFileSync(accdbPath, "dummy-accdb", "utf8");
    writeFileSync(xlsxPath, "dummy-xlsx", "utf8");

    expect(() =>
      resolveDatabaseMigrationInput({
        backupFilePath: accdbPath
      })
    ).toThrow("지원하지 않는 복원 파일 형식입니다. JSON 백업(.json)만 사용할 수 있습니다.");

    expect(() =>
      resolveDatabaseMigrationInput({
        backupFilePath: xlsxPath
      })
    ).toThrow("지원하지 않는 복원 파일 형식입니다. JSON 백업(.json)만 사용할 수 있습니다.");
  });
});
