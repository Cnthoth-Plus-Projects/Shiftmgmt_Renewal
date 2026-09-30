export type DatabaseMigrationSourceType = "json";

export const databaseMigrationSourceLabels: Record<DatabaseMigrationSourceType, string> = {
  json: "JSON 백업 복원"
};

export const resolveDatabaseMigrationSourceType = (
  filePath: string
): DatabaseMigrationSourceType | null => {
  if (typeof filePath !== "string") {
    return null;
  }

  const normalized = filePath.trim().toLowerCase();

  if (normalized.endsWith(".json")) {
    return "json";
  }

  return null;
};

export const isSupportedDatabaseMigrationFilePath = (filePath: string) =>
  resolveDatabaseMigrationSourceType(filePath) !== null;
