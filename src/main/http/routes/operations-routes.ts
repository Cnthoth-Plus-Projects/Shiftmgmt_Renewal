import path from "node:path";
import type {
  AllowanceRateVersionDeleteInput,
  AllowanceRateVersionSaveInput,
  AppSettingsUpdateInput,
  DatabaseMigrationRunInput,
  DirectorySelectionInput,
  DocumentTemplateInspectInput,
  DocumentTemplateOutputFileNameUpdateInput,
  DocumentTemplatePreviewInput,
  DocumentTemplateSaveInput,
  FileSelectionInput,
  HolidayCalendarReplaceInput,
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
import type { TemplateType } from "../../../shared/domain/model";
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
  approveManagedDocumentTemplateVersion,
  deleteManagedDocumentTemplateVersion,
  inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion,
} from "../../services/document-template-management-service";
import { previewDocumentTemplateFile } from "../../services/document-template-preview-service";
import { fetchHolidayApiItems } from "../../services/holiday-api-service";
import {
  deleteStoredAllowanceRateVersion,
  deleteStoredSiteNameOption,
  listStoredAllowanceRateHistory,
  deleteStoredHolidayItem,
  deleteStoredOperationUser,
  listStoredAllowanceRateVersions,
  listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  listStoredSiteNameOptions,
  renameStoredHolidayItem,
  replaceStoredHolidayCalendar,
  saveStoredAllowanceRateVersion,
  saveStoredHolidayItem,
  saveStoredOperationUser,
  saveStoredSiteNameOption,
  setStoredDefaultDocumentTemplateVersion,
  updateStoredDocumentTemplateOutputFileNamePattern,
} from "../../services/operations-storage-service";
import { listReleaseHistory } from "../../services/release-history-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcAction,
  runIpcActionWithCleanup,
  runIpcSaveDialogAction,
  type IpcActivityInput,
} from "../../ipc/ipc-handler-helpers";
import type { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";
import type { RequestContext } from "../api-types";

const documentTemplateLabelByType: Record<TemplateType, string> = {
  schedule: "근무표",
  proposal: "품의서",
  attachment1: "별첨1",
  attachment2: "별첨2",
};

const sanitizeFileSegment = (value: string): string =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const assertSupportedDatabaseRestoreFile = (filePath: string): void => {
  if (!isSupportedDatabaseMigrationFilePath(filePath)) {
    throw new Error(
      "DB복구는 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 사용할 수 있습니다. Excel 파일은 복구 대상이 아닙니다.",
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

  // 4. operations:select-migration-file
  registry.register("operations:select-migration-file", async (args, context) => {
    const input = args[0] as FileSelectionInput | undefined;
    const result = await context.dialogBridge.showDialog(
      {
        operation: "openFile",
        title: input?.title ?? "복원 파일 선택",
        defaultPath: input?.defaultPath,
        filters:
          input?.filters && input.filters.length > 0
            ? input.filters
            : [
                {
                  name: "복원 파일",
                  extensions: ["json", "accdb"],
                },
              ],
      },
      context.signal,
    );
    const selectedFilePath = result.cancelled ? null : (result.path ?? null);
    if (selectedFilePath && !isSupportedDatabaseMigrationFilePath(selectedFilePath)) {
      return createIpcFailure(
        "DATABASE_RESTORE_FILE_REQUIRED",
        "DB복구는 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 선택할 수 있습니다.",
      );
    }
    return createIpcSuccess(selectedFilePath);
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
    const input = args[0] as DatabaseMigrationRunInput;
    return runIpcAction({
      action: () => {
        assertSupportedDatabaseRestoreFile(input.migrationFilePath);
        return checkDatabaseMigrationRequirements({
          migrationFilePath: input.migrationFilePath,
        });
      },
      errorCode: "DATABASE_MIGRATION_REQUIREMENTS_FAILED",
      getErrorMessage,
    });
  });

  // 7. operations:preview-database-migration-update
  registry.register("operations:preview-database-migration-update", async (args, context) => {
    const input = args[0] as DatabaseMigrationRunInput;
    assertSupportedDatabaseRestoreFile(input.migrationFilePath);
    await stopFileWatchRuntime({
      userDataPath: context.dataDir,
    });
    return runIpcActionWithCleanup({
      action: () =>
        previewDatabaseMigrationUpdate({
          userDataPath: context.dataDir,
          migrationFilePath: input.migrationFilePath,
          selectedAccessTables: input.selectedAccessTables,
        }),
      cleanup: () =>
        restartFileWatchRuntime({
          userDataPath: context.dataDir,
        }),
      errorCode: "DATABASE_MIGRATION_PREVIEW_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "database-migration-preview",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "DB 복원 미리보기",
      }),
    });
  });

  // 8. operations:update-database-from-migration
  registry.register("operations:update-database-from-migration", async (args, context) => {
    const input = args[0] as DatabaseMigrationRunInput;
    assertSupportedDatabaseRestoreFile(input.migrationFilePath);
    await stopFileWatchRuntime({
      userDataPath: context.dataDir,
    });
    return runIpcActionWithCleanup({
      action: () =>
        runDatabaseMigrationUpdate({
          userDataPath: context.dataDir,
          migrationFilePath: input.migrationFilePath,
          selectedAccessTables: input.selectedAccessTables,
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

  // 31. operations:list-document-template-history
  registry.register("operations:list-document-template-history", (args) => {
    const templateType = args[0] as TemplateType | undefined;
    return createIpcSuccess(listStoredDocumentTemplateHistory(templateType));
  });

  // 32. operations:select-document-template-file
  registry.register("operations:select-document-template-file", async (args, context) => {
    const templateType = args[0] as TemplateType | undefined;
    const result = await context.dialogBridge.showDialog(
      {
        operation: "openFile",
        title: "양식 파일 선택",
        filters: [
          {
            name:
              templateType === "schedule" ? "근무표 Excel 양식" : "Excel 양식 파일",
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

  // 33. operations:inspect-document-template
  registry.register("operations:inspect-document-template", async (args, context) => {
    const input = args[0] as DocumentTemplateInspectInput;
    return runIpcAction({
      action: () => inspectDocumentTemplateImport(input),
      errorCode: "DOCUMENT_TEMPLATE_INSPECT_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-inspect",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${documentTemplateLabelByType[input.templateType]} 양식 검증`,
      }),
    });
  });

  // 34. operations:preview-document-template
  registry.register("operations:preview-document-template", async (args, context) => {
    const input = args[0] as DocumentTemplatePreviewInput;
    const settings = getStoredAppSettingsSnapshot({
      userDataPath: context.dataDir,
    });
    const previewDirectory = path.resolve(
      settings.scheduleExportDir,
      "template-previews",
      input.templateType,
    );
    const sourceBaseName = path.basename(input.sourcePath, path.extname(input.sourcePath));
    const versionSegment = sanitizeFileSegment(
      input.versionLabel?.trim() ||
        sourceBaseName ||
        documentTemplateLabelByType[input.templateType],
    );
    const defaultPath = path.resolve(
      previewDirectory,
      `${documentTemplateLabelByType[input.templateType]}_${versionSegment}_preview.xlsx`,
    );

    return runIpcSaveDialogAction({
      choosePath: async () => {
        const saveResult = await context.dialogBridge.showDialog(
          {
            operation: "saveFile",
            title: "양식 미리보기 저장",
            defaultPath,
            filters: [
              {
                name: "Excel Workbook",
                extensions: ["xlsx"],
              },
            ],
            showOverwriteConfirmation: true,
          },
          context.signal,
        );
        return saveResult.cancelled ? null : (saveResult.path ?? null);
      },
      onCancel: () => createIpcSuccess(null),
      action: (outputPath) =>
        previewDocumentTemplateFile(input, {
          outputPath,
        }),
      errorCode: "DOCUMENT_TEMPLATE_PREVIEW_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-preview",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${documentTemplateLabelByType[input.templateType]} 양식 미리보기`,
      }),
    });
  });

  // 35. operations:save-document-template-version
  registry.register("operations:save-document-template-version", async (args, context) => {
    const input = args[0] as DocumentTemplateSaveInput;
    return runIpcAction({
      action: () =>
        saveManagedDocumentTemplateVersion(input, {
          userDataPath: context.dataDir,
        }),
      errorCode: "DOCUMENT_TEMPLATE_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: `${documentTemplateLabelByType[input.templateType]} 양식 등록`,
      }),
    });
  });

  // 36. operations:approve-document-template-version
  registry.register("operations:approve-document-template-version", async (args, context) => {
    const templateId = args[0] as string;
    return runIpcAction({
      action: () => approveManagedDocumentTemplateVersion(templateId),
      errorCode: "DOCUMENT_TEMPLATE_APPROVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-approve",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "양식 승인",
      }),
    });
  });

  // 37. operations:set-default-document-template-version
  registry.register("operations:set-default-document-template-version", async (args, context) => {
    const templateId = args[0] as string;
    return runIpcAction({
      action: () => setStoredDefaultDocumentTemplateVersion(templateId),
      errorCode: "DOCUMENT_TEMPLATE_SET_DEFAULT_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-set-default",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "기본 양식 지정",
      }),
    });
  });

  // 38. operations:update-document-template-output-file-name
  registry.register("operations:update-document-template-output-file-name", async (args, context) => {
    const input = args[0] as DocumentTemplateOutputFileNameUpdateInput;
    return runIpcAction({
      action: () => updateStoredDocumentTemplateOutputFileNamePattern(input),
      errorCode: "DOCUMENT_TEMPLATE_OUTPUT_FILE_NAME_UPDATE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-file-name-update",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "출력 파일명 규칙 저장",
      }),
    });
  });

  // 39. operations:delete-document-template-version
  registry.register("operations:delete-document-template-version", async (args, context) => {
    const templateId = args[0] as string;
    return runIpcAction({
      action: () => {
        deleteManagedDocumentTemplateVersion(templateId, {
          userDataPath: context.dataDir,
        });
        return null;
      },
      errorCode: "DOCUMENT_TEMPLATE_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "template-delete",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "양식 삭제",
      }),
    });
  });

  // 40. operations:list-document-template-versions
  registry.register("operations:list-document-template-versions", (args) => {
    const templateType = args[0] as TemplateType | undefined;
    return createIpcSuccess(listStoredDocumentTemplateVersions(templateType));
  });
};
