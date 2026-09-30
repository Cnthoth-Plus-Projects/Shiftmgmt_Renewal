import path from "node:path";
import type {
  AllowanceRateVersionDeleteInput,
  AllowanceRateVersionSaveInput,
  AppSettingsUpdateInput,
  DirectorySelectionInput,
  FileSelectionInput,
  HolidayCalendarReplaceInput,
  JsonBackupFileSelectionInput,
  JsonDatabaseRestoreExecuteInput,
  HolidayItemDeleteInput,
  HolidayItemRenameInput,
  HolidayItemUpsertInput,
  OperationUserDeleteInput,
  OperationUserSaveInput,
  ReleaseHistoryListQuery,
  SiteNameOptionDeleteInput,
  SiteNameOptionSaveInput,
} from "../../../shared/bridge/contracts";
import { isSupportedDatabaseMigrationFilePath } from "../../../shared/domain/database-migration";
import type {
  DocumentLayoutKey,
  DocumentLayoutPreviewInput,
  DocumentLayoutResetInput,
  DocumentLayoutSaveInput,
} from "../../../shared/domain/document-layout";
import {
  getStoredAppSettingsSnapshot,
  saveStoredAppSettings,
} from "../../services/app-settings-storage-service";
import { rotateAdminAccountRecoveryKey } from "../../services/account-recovery-service";
import {
  getFileWatchStatusSnapshot,
  restartFileWatchRuntime,
  stopFileWatchRuntime,
} from "../../services/file-watch-runtime-service";
import {
  runDatabaseBackupNow,
  restartDatabaseBackupRuntime,
} from "../../services/database-backup-service";
import {
  checkDatabaseMigrationRequirements,
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate,
} from "../../services/database-migration-service";
import {
  getDocumentLayout,
  listDocumentLayoutHistory,
  listDocumentLayouts,
  resetDocumentLayout,
  saveDocumentLayout,
} from "../../services/document-layout-storage-service";
import { documentLayoutPreviewArtifactService } from "../../services/document-layout-preview-artifact-service";
import { fetchHolidayApiItems } from "../../services/holiday-api-service";
import {
  deleteStoredAllowanceRateVersion,
  deleteStoredSiteNameOption,
  listStoredAllowanceRateHistory,
  deleteStoredHolidayItem,
  deleteStoredOperationUser,
  listStoredAllowanceRateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  listStoredSiteNameOptions,
  renameStoredHolidayItem,
  replaceStoredHolidayCalendar,
  saveStoredAllowanceRateVersion,
  saveStoredHolidayItem,
  saveStoredOperationUser,
  saveStoredSiteNameOption,
} from "../../services/operations-storage-service";
import { listReleaseHistory } from "../../services/release-history-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcAction,
  runIpcActionWithCleanup,
  type IpcActivityInput,
} from "../../ipc/ipc-handler-helpers";
import type { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";
import type { RequestContext } from "../api-types";

const resolveRestorePath = (input: unknown): string => {
  if (typeof input === "object" && input !== null) {
    const obj = input as { backupFilePath?: string; migrationFilePath?: string };
    return obj.backupFilePath ?? obj.migrationFilePath ?? "";
  }
  return "";
};

const assertSupportedDatabaseRestoreFile = (filePath: string): void => {
  if (!isSupportedDatabaseMigrationFilePath(filePath)) {
    throw new Error(
      "DB복구는 JSON 백업(.json) 파일만 사용할 수 있습니다. Excel 및 Access 파일은 복구 대상이 아닙니다.",
    );
  }
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const trackSuccess = (
  context: RequestContext,
  sessionManager: SessionManager,
  input: Omit<IpcActivityInput, "session">,
) => ({
  input: {
    ...input,
    session: context.session,
  },
  recordSuccessfulActivity: <T extends { ok: boolean }>(result: T, actInput: IpcActivityInput) =>
    sessionManager.recordSuccessfulActivity(result, actInput),
});

export const registerOperationsRoutes = (
  registry: RouteRegistry,
  sessionManager: SessionManager,
): void => {
  // 1. operations:get-app-settings
  registry.register("operations:get-app-settings", (_args, context) =>
    createIpcSuccess(
      getStoredAppSettingsSnapshot({
        userDataPath: context.dataDir,
      }),
    ),
  );

  // 2. operations:save-app-settings
  registry.register("operations:save-app-settings", async (args, context) => {
    const input = args[0] as AppSettingsUpdateInput;
    return runIpcAction({
      action: async () => {
        const savedSettings = saveStoredAppSettings(input, {
          userDataPath: context.dataDir,
        });
        await restartFileWatchRuntime({
          userDataPath: context.dataDir,
        });
        restartDatabaseBackupRuntime({
          userDataPath: context.dataDir,
        });
        return savedSettings;
      },
      errorCode: "APP_SETTINGS_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "app-settings-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "앱 운영 설정 저장",
      }),
    });
  });

  // 3. operations:select-directory
  registry.register("operations:select-directory", async (args, context) => {
    const input = args[0] as DirectorySelectionInput | undefined;
    const result = await context.dialogBridge.showDialog(
      {
        operation: "openFolder",
        title: input?.title ?? "폴더 선택",
        defaultPath: input?.defaultPath,
      },
      context.signal,
    );
    return createIpcSuccess(result.cancelled ? null : (result.path ?? null));
  });

  // 4. operations:select-json-backup-file
  registry.register("operations:select-json-backup-file", async (args, context) => {
    const input = args[0] as JsonBackupFileSelectionInput | undefined;
    const result = await context.dialogBridge.showDialog(
      {
        operation: "openFile",
        title: "JSON 백업 파일 선택",
        defaultPath: input?.defaultPath,
        filters: [
          {
            name: "JSON 백업 파일",
            extensions: ["json"],
          },
        ],
      },
      context.signal,
    );
    const selectedFilePath = result.cancelled ? null : (result.path ?? null);
    if (!selectedFilePath) {
      return createIpcSuccess(null);
    }
    if (!selectedFilePath.toLowerCase().endsWith(".json")) {
      return createIpcFailure(
        "DATABASE_RESTORE_FILE_REQUIRED",
        "DB복구는 JSON 백업(.json) 파일만 선택할 수 있습니다.",
      );
    }
    return createIpcSuccess({
      fileName: path.basename(selectedFilePath),
      filePath: selectedFilePath,
    });
  });

  // 5. operations:select-spreadsheet-file
  registry.register("operations:select-spreadsheet-file", async (args, context) => {
    const input = args[0] as FileSelectionInput | undefined;
    const result = await context.dialogBridge.showDialog(
      {
        operation: "openFile",
        title: input?.title ?? "Excel 파일 선택",
        defaultPath: input?.defaultPath,
        filters:
          input?.filters && input.filters.length > 0
            ? input.filters
            : [
                {
                  name: "Excel Workbook",
                  extensions: ["xlsx", "xlsm"],
                },
              ],
      },
      context.signal,
    );
    if (result.cancelled || !result.path) {
      return createIpcSuccess(null);
    }
    const filePath = result.path;
    return createIpcSuccess({
      fileName: path.basename(filePath),
      filePath,
    });
  });

  // 6. operations:check-database-migration-requirements
  registry.register("operations:check-database-migration-requirements", async (args) => {
    const restorePath = resolveRestorePath(args[0]);
    return runIpcAction({
      action: () => {
        assertSupportedDatabaseRestoreFile(restorePath);
        return checkDatabaseMigrationRequirements({
          backupFilePath: restorePath,
        });
      },
      errorCode: "DATABASE_MIGRATION_REQUIREMENTS_FAILED",
      getErrorMessage,
    });
  });

  // 7. operations:preview-database-migration-update
  registry.register("operations:preview-database-migration-update", async (args, context) => {
    const restorePath = resolveRestorePath(args[0]);
    assertSupportedDatabaseRestoreFile(restorePath);
    await stopFileWatchRuntime({
      userDataPath: context.dataDir,
    });
    return runIpcActionWithCleanup({
      action: () =>
        previewDatabaseMigrationUpdate({
          userDataPath: context.dataDir,
          backupFilePath: restorePath,
          onPreviewSuccess: () => {
            sessionManager.recordSuccessfulActivity(
              { ok: true },
              {
                actionType: "database-migration-preview",
                routeKey: "operations",
                routeLabel: "운영 관리",
                details: "DB 복원 미리보기",
                session: context.session,
              },
            );
          },
        }),
      cleanup: () =>
        restartFileWatchRuntime({
          userDataPath: context.dataDir,
        }),
      errorCode: "DATABASE_MIGRATION_PREVIEW_FAILED",
      getErrorMessage,
    });
  });

  // 8. operations:update-database-from-migration
  registry.register("operations:update-database-from-migration", async (args, context) => {
    const input = (args[0] ?? {}) as JsonDatabaseRestoreExecuteInput;
    const restorePath = resolveRestorePath(input);
    assertSupportedDatabaseRestoreFile(restorePath);
    await stopFileWatchRuntime({
      userDataPath: context.dataDir,
    });
    return runIpcActionWithCleanup({
      action: () =>
        runDatabaseMigrationUpdate({
          userDataPath: context.dataDir,
          backupFilePath: restorePath,
          backupSha256: input.backupSha256,
          previewToken: input.previewToken,
          confirmationText: input.confirmationText,
        }),
      cleanup: () =>
        restartFileWatchRuntime({
          userDataPath: context.dataDir,
        }),
      errorCode: "DATABASE_MIGRATION_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "database-migration-update",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "DB 복원 반영",
      }),
    });
  });

  // 9. operations:run-database-backup-now
  registry.register("operations:run-database-backup-now", async (_args, context) =>
    runIpcAction({
      action: () =>
        runDatabaseBackupNow({
          userDataPath: context.dataDir,
        }),
      errorCode: "DATABASE_BACKUP_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "database-backup-run",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "DB 수동 백업",
      }),
    }),
  );

  // 10. operations:get-file-watch-status
  registry.register("operations:get-file-watch-status", (_args, context) =>
    createIpcSuccess(
      getFileWatchStatusSnapshot({
        userDataPath: context.dataDir,
      }),
    ),
  );

  // 11. operations:restart-file-watch
  registry.register("operations:restart-file-watch", async (_args, context) =>
    runIpcAction({
      action: () =>
        restartFileWatchRuntime({
          userDataPath: context.dataDir,
        }),
      errorCode: "FILE_WATCH_RESTART_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "file-watch-restart",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "파일 감시 재시작",
      }),
    }),
  );

  // 12. operations:stop-file-watch
  registry.register("operations:stop-file-watch", async (_args, context) =>
    runIpcAction({
      action: () =>
        stopFileWatchRuntime({
          userDataPath: context.dataDir,
        }),
      errorCode: "FILE_WATCH_STOP_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "file-watch-stop",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "파일 감시 중지",
      }),
    }),
  );

  // 13. operations:list-holiday-calendars
  registry.register("operations:list-holiday-calendars", (args) => {
    const year = args[0] as number | undefined;
    return createIpcSuccess(listStoredHolidayCalendars(year));
  });

  // 14. operations:fetch-holiday-api-items
  registry.register("operations:fetch-holiday-api-items", async (args, context) => {
    const year = args[0] as number;
    return runIpcAction({
      action: () => {
        const settings = getStoredAppSettingsSnapshot({
          userDataPath: context.dataDir,
        });
        return fetchHolidayApiItems({
          baseUrl: settings.holidayApiBaseUrl,
          year,
        });
      },
      errorCode: "HOLIDAY_API_FETCH_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "holiday-fetch",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${year}년 공휴일 불러오기`,
      }),
    });
  });

  // 15. operations:add-holiday-item
  registry.register("operations:add-holiday-item", async (args, context) => {
    const input = args[0] as HolidayItemUpsertInput;
    return runIpcAction({
      action: () => saveStoredHolidayItem(input),
      errorCode: "HOLIDAY_ITEM_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "holiday-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${input.holidayDate} 공휴일 등록`,
      }),
    });
  });

  // 16. operations:rename-holiday-item
  registry.register("operations:rename-holiday-item", async (args, context) => {
    const input = args[0] as HolidayItemRenameInput;
    return runIpcAction({
      action: () => renameStoredHolidayItem(input),
      errorCode: "HOLIDAY_ITEM_RENAME_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "holiday-rename",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "공휴일명 수정",
      }),
    });
  });

  // 17. operations:delete-holiday-item
  registry.register("operations:delete-holiday-item", async (args, context) => {
    const input = args[0] as HolidayItemDeleteInput;
    return runIpcAction({
      action: () => deleteStoredHolidayItem(input),
      errorCode: "HOLIDAY_ITEM_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "holiday-delete",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "공휴일 삭제",
      }),
    });
  });

  // 18. operations:replace-holiday-calendar
  registry.register("operations:replace-holiday-calendar", async (args, context) => {
    const input = args[0] as HolidayCalendarReplaceInput;
    return runIpcAction({
      action: () => replaceStoredHolidayCalendar(input),
      errorCode: "HOLIDAY_CALENDAR_REPLACE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "holiday-replace",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${input.year}년 공휴일 일괄 반영`,
      }),
    });
  });

  // 19. operations:list-allowance-rate-versions
  registry.register("operations:list-allowance-rate-versions", (args) => {
    const year = args[0] as number | undefined;
    return createIpcSuccess(listStoredAllowanceRateVersions(year));
  });

  // 20. operations:list-allowance-rate-history
  registry.register("operations:list-allowance-rate-history", () =>
    createIpcSuccess(listStoredAllowanceRateHistory()),
  );

  // 21. operations:list-release-history
  registry.register("operations:list-release-history", (args) => {
    const query = args[0] as ReleaseHistoryListQuery | undefined;
    return createIpcSuccess(listReleaseHistory(query));
  });

  // 22. operations:save-allowance-rate-version
  registry.register("operations:save-allowance-rate-version", async (args, context) => {
    const input = args[0] as AllowanceRateVersionSaveInput;
    return runIpcAction({
      action: () => saveStoredAllowanceRateVersion(input),
      errorCode: "ALLOWANCE_RATE_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-rate-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: input.changeReason?.trim()
          ? `${input.versionLabel} 요율 저장 · 사유: ${input.changeReason}`
          : `${input.versionLabel} 요율 저장`,
      }),
    });
  });

  // 23. operations:delete-allowance-rate-version
  registry.register("operations:delete-allowance-rate-version", async (args, context) => {
    const input = args[0] as AllowanceRateVersionDeleteInput;
    return runIpcAction({
      action: () => {
        deleteStoredAllowanceRateVersion(input.rateVersionId);
        return null;
      },
      errorCode: "ALLOWANCE_RATE_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-rate-delete",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "요율 버전 삭제",
      }),
    });
  });

  // 24. operations:list-users
  registry.register("operations:list-users", () =>
    createIpcSuccess(listStoredOperationUsers()),
  );

  // 25. operations:save-user
  registry.register("operations:save-user", async (args, context) => {
    const input = args[0] as OperationUserSaveInput;
    return runIpcAction({
      action: () => saveStoredOperationUser(input),
      errorCode: "OPERATION_USER_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "user-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${input.loginId} 사용자 저장`,
      }),
    });
  });

  // 26. operations:delete-user
  registry.register("operations:delete-user", async (args, context) => {
    const input = args[0] as OperationUserDeleteInput;
    return runIpcAction({
      action: () => {
        deleteStoredOperationUser(input.userId);
        return null;
      },
      errorCode: "OPERATION_USER_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "user-delete",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "사용자 삭제",
      }),
    });
  });

  // 27. operations:rotate-account-recovery-key
  registry.register("operations:rotate-account-recovery-key", async (_args, context) =>
    runIpcAction({
      action: rotateAdminAccountRecoveryKey,
      errorCode: "ACCOUNT_RECOVERY_KEY_ROTATE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "account-recovery-key-rotate",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "admin 계정복구키 발급",
      }),
    }),
  );

  // 28. operations:list-site-name-options
  registry.register("operations:list-site-name-options", () =>
    createIpcSuccess(listStoredSiteNameOptions()),
  );

  // 29. operations:save-site-name-option
  registry.register("operations:save-site-name-option", async (args, context) => {
    const input = args[0] as SiteNameOptionSaveInput;
    return runIpcAction({
      action: () => saveStoredSiteNameOption(input),
      errorCode: "SITE_NAME_OPTION_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "site-name-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${input.name} 사이트 명 저장`,
      }),
    });
  });

  // 30. operations:delete-site-name-option
  registry.register("operations:delete-site-name-option", async (args, context) => {
    const input = args[0] as SiteNameOptionDeleteInput;
    return runIpcAction({
      action: () => {
        deleteStoredSiteNameOption(input);
        return null;
      },
      errorCode: "SITE_NAME_OPTION_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "site-name-delete",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "사이트 명 삭제",
      }),
    });
  });

  // 31. operations:list-document-layouts
  registry.register("operations:list-document-layouts", () =>
    runIpcAction({
      action: () => listDocumentLayouts(),
      errorCode: "DOCUMENT_LAYOUT_LIST_FAILED",
      getErrorMessage,
    }),
  );

  // 32. operations:get-document-layout
  registry.register("operations:get-document-layout", (args) => {
    const key = args[0] as DocumentLayoutKey;
    return runIpcAction({
      action: () => getDocumentLayout(key),
      errorCode: "DOCUMENT_LAYOUT_GET_FAILED",
      getErrorMessage,
    });
  });

  // 33. operations:save-document-layout
  registry.register("operations:save-document-layout", (args, context) => {
    const input = args[0] as DocumentLayoutSaveInput;
    return runIpcAction({
      action: () => saveDocumentLayout(input),
      errorCode: "DOCUMENT_LAYOUT_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "layout-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "문서 레이아웃 저장",
      }),
    });
  });

  // 34. operations:reset-document-layout
  registry.register("operations:reset-document-layout", (args, context) => {
    const input = args[0] as DocumentLayoutResetInput;
    return runIpcAction({
      action: () => resetDocumentLayout(input),
      errorCode: "DOCUMENT_LAYOUT_RESET_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "layout-reset",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "문서 레이아웃 초기화",
      }),
    });
  });

  // 35. operations:preview-document-layout
  registry.register("operations:preview-document-layout", async (args, context) => {
    const input = args[0] as DocumentLayoutPreviewInput;
    return runIpcAction({
      action: () => documentLayoutPreviewArtifactService.createPreview(input),
      errorCode: "DOCUMENT_LAYOUT_PREVIEW_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "layout-preview",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "문서 레이아웃 미리보기",
      }),
    });
  });

  // 36. operations:list-document-layout-history
  registry.register("operations:list-document-layout-history", (args) => {
    const key = args[0] as DocumentLayoutKey;
    return runIpcAction({
      action: () => listDocumentLayoutHistory(key),
      errorCode: "DOCUMENT_LAYOUT_HISTORY_LIST_FAILED",
      getErrorMessage,
    });
  });
};
