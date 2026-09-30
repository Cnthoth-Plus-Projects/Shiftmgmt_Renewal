import { describe, expect, it } from "vitest";

import {
  databaseMigrationSourceLabels,
  isSupportedDatabaseMigrationFilePath,
  resolveDatabaseMigrationSourceType
} from "./database-migration";

describe("database-migration source helpers", () => {
  it("resolves json backup files", () => {
    expect(resolveDatabaseMigrationSourceType("C:/backup/shiftmgmt-backup.json")).toBe("json");
    expect(isSupportedDatabaseMigrationFilePath("C:/backup/shiftmgmt-backup.json")).toBe(true);
  });

  it("rejects access database files as unsupported", () => {
    expect(resolveDatabaseMigrationSourceType("C:/backup/shiftmgmt-source.accdb")).toBeNull();
    expect(isSupportedDatabaseMigrationFilePath("C:/backup/shiftmgmt-source.accdb")).toBe(false);
  });

  it("rejects unsupported restore file types", () => {
    expect(resolveDatabaseMigrationSourceType("C:/backup/shiftmgmt-source.xlsx")).toBeNull();
    expect(isSupportedDatabaseMigrationFilePath("C:/backup/shiftmgmt-source.xlsx")).toBe(false);
  });

  it("provides user-facing labels for json source type only", () => {
    expect(databaseMigrationSourceLabels.json).toBe("JSON 백업 복원");
    expect((databaseMigrationSourceLabels as Record<string, string>).access).toBeUndefined();
  });
});
