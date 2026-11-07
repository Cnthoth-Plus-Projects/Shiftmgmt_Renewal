import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import {
  listStoredSchedulePlanExports,
  markStoredSchedulePlanExportPublished
} from "./schedule-plan-export-history-service";

export const resolveSchedulePlanPublishDirectory = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => path.join(getStoredAppSettingsSnapshot(input).scheduleExportDir, "배포");

export const publishSchedulePlanExport = (input: {
  exportId: string;
  userDataPath: string;
  outputDir?: string;
  env?: NodeJS.ProcessEnv;
}): SchedulePlanExportRecord | null => {
  const exportRecord = listStoredSchedulePlanExports().find((item) => item.id === input.exportId);

  if (!exportRecord) {
    return null;
  }

  const outputDir =
    input.outputDir ??
    resolveSchedulePlanPublishDirectory({
      userDataPath: input.userDataPath,
      env: input.env
    });
  mkdirSync(outputDir, { recursive: true });

  const extension = path.extname(exportRecord.outputFileName);
  const baseName = path.basename(exportRecord.outputFileName, extension);
  let publishedPath = path.resolve(outputDir, exportRecord.outputFileName);
  let duplicateIndex = 1;

  while (existsSync(publishedPath)) {
    publishedPath = path.resolve(
      outputDir,
      `${baseName}_dup${String(duplicateIndex).padStart(2, "0")}${extension}`
    );
    duplicateIndex += 1;
  }

  copyFileSync(exportRecord.outputPath, publishedPath);

  return markStoredSchedulePlanExportPublished({
    exportId: input.exportId,
    publishedPath
  });
};
