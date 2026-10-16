import path from "node:path";
import type {
  AccessLogListQuery,
  AccessLogRecordInput,
  AccountRecoveryInput,
  AppHealth,
  AuthPasswordChangeInput,
  DashboardChartExportInput,
  DashboardReportExportInput,
  SignInInput,
} from "../../../shared/bridge/contracts";
import type { UpdateStateSnapshot } from "../../../shared/domain/app-update";
import {
  getAccountRecoveryAvailability,
  recoverAdminAccount,
} from "../../services/account-recovery-service";
import { listAccessLogs, recordAccessLog } from "../../services/access-log-service";
import { getAuthBootstrapCredentialsFilePath } from "../../services/auth-bootstrap-service";
import { createAppHealth } from "../../services/app-settings-service";
import { getStoredAppSettingsSnapshot } from "../../services/app-settings-storage-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcAction,
} from "../../ipc/ipc-handler-helpers";
import {
  exportDashboardChartData,
  exportDashboardReport,
} from "../../services/dashboard-chart-export-service";
import type { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const createDisabledUpdateState = (version: string): UpdateStateSnapshot => ({
  enabled: false,
  status: "idle",
  currentVersion: version,
  availableManifest: null,
  releaseNotesToShow: null,
});

export const registerCoreRoutes = (
  registry: RouteRegistry,
  sessionManager: SessionManager,
): void => {
  // 1. app:get-version
  registry.register("app:get-version", (_args, context) => context.version);

  // 2. app:get-health
  registry.register("app:get-health", (_args, context) => {
    const isDevelopment = process.env.NODE_ENV === "development";
    const health: AppHealth = createAppHealth({
      appVersion: context.version,
      environment: isDevelopment ? "development" : "production",
      userDataPath: context.dataDir,
    });

    return createIpcSuccess({
      ...health,
      bootstrapCredentialsFilePath: getAuthBootstrapCredentialsFilePath({
        userDataPath: context.dataDir,
      }),
    });
  });

  // 3. app:get-update-state (D5)
  registry.register("app:get-update-state", (_args, context) =>
    createIpcSuccess(createDisabledUpdateState(context.version)),
  );

  // 4. app:check-for-update (D5)
  registry.register("app:check-for-update", async (_args, context) => {
    const state = createDisabledUpdateState(context.version);
    await context.recordActivity({
      actionType: "app-update-check",
      actionLabel: "업데이트 확인",
      routeKey: "dashboard",
      routeLabel: "업데이트",
      details: "최신 버전 확인",
    });
    return createIpcSuccess(state);
  });

  // 5. app:download-update (D5)
  registry.register("app:download-update", (_args, context) =>
    createIpcSuccess(createDisabledUpdateState(context.version)),
  );

  // 6. app:install-update (D5)
  registry.register("app:install-update", (_args, context) =>
    createIpcSuccess(createDisabledUpdateState(context.version)),
  );

  // 7. app:dismiss-update-notice (D5)
  registry.register("app:dismiss-update-notice", (_args, context) =>
    createIpcSuccess(createDisabledUpdateState(context.version)),
  );

  // 8. dashboard:export-chart-data (D6)
  registry.register("dashboard:export-chart-data", async (args, context) => {
    const input = args[0] as DashboardChartExportInput;
    const settings = getStoredAppSettingsSnapshot({
      userDataPath: context.dataDir,
    });
    const outputFormat = input.outputFormat ?? "xlsx";
    const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(
      input.chartTitle,
    )}_${exportedAt}.${outputFormat}`;
    const defaultPath = path.resolve(
      settings.scheduleExportDir,
      "dashboard-exports",
      defaultFileName,
    );

    const dialogResult = await context.dialogBridge.showDialog(
      {
        operation: "saveFile",
        title: outputFormat === "pdf" ? "차트 PDF 내보내기" : "차트 Excel 내보내기",
        defaultPath,
        showOverwriteConfirmation: true,
        filters: [
          outputFormat === "pdf"
            ? { name: "PDF Document", extensions: ["pdf"] }
            : { name: "Excel Workbook", extensions: ["xlsx"] },
        ],
      },
      context.signal,
    );

    if (dialogResult.cancelled || !dialogResult.path) {
      return createIpcFailure("EXPORT_CANCELLED", "차트 내보내기를 취소했습니다.");
    }

    const exportResult = await exportDashboardChartData(input, {
      userDataPath: context.dataDir,
      outputPath: dialogResult.path,
    });

    if (exportResult.ok) {
      await context.recordActivity({
        actionType: "dashboard-export",
        actionLabel: "대시보드 출력",
        routeKey: "dashboard",
        routeLabel: "대시보드",
        details: `${input.chartTitle} (${outputFormat.toUpperCase()})`,
      });
    }

    return exportResult;
  });

  // 9. dashboard:export-report (D6)
  registry.register("dashboard:export-report", async (args, context) => {
    const input = args[0] as DashboardReportExportInput;
    const settings = getStoredAppSettingsSnapshot({
      userDataPath: context.dataDir,
    });
    const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.title)}_${exportedAt}.${input.outputFormat}`;
    const defaultPath = path.resolve(
      settings.scheduleExportDir,
      "dashboard-exports",
      defaultFileName,
    );

    const dialogResult = await context.dialogBridge.showDialog(
      {
        operation: "saveFile",
        title: input.outputFormat === "pdf" ? "대시보드 PDF 내보내기" : "대시보드 Excel 내보내기",
        defaultPath,
        showOverwriteConfirmation: true,
        filters: [
          input.outputFormat === "pdf"
            ? { name: "PDF Document", extensions: ["pdf"] }
            : { name: "Excel Workbook", extensions: ["xlsx"] },
        ],
      },
      context.signal,
    );

    if (dialogResult.cancelled || !dialogResult.path) {
      return createIpcFailure("EXPORT_CANCELLED", "대시보드 내보내기를 취소했습니다.");
    }

    const exportResult = await exportDashboardReport(input, {
      userDataPath: context.dataDir,
      outputPath: dialogResult.path,
    });

    if (exportResult.ok) {
      await context.recordActivity({
        actionType: "dashboard-export",
        actionLabel: "대시보드 출력",
        routeKey: "dashboard",
        routeLabel: "대시보드",
        details: `${input.title} (${input.outputFormat.toUpperCase()})`,
      });
    }

    return exportResult;
  });

  // 10. auth:sign-in
  registry.register("auth:sign-in", (args) => {
    const input = (args[0] ?? {}) as SignInInput;
    const { result, setCookie } = sessionManager.handleSignIn(input);
    return {
      status: 200,
      body: result,
      ...(setCookie ? { setCookie } : {}),
    };
  });

  // 11. auth:sign-out
  registry.register("auth:sign-out", (_args, context) => {
    const { result, setCookie } = sessionManager.handleSignOut(context.cookie);
    return {
      status: 200,
      body: result,
      setCookie,
    };
  });

  // 12. auth:get-session
  registry.register("auth:get-session", (_args, context) =>
    sessionManager.handleGetSession(context.cookie),
  );

  // 13. auth:get-account-recovery-availability
  registry.register("auth:get-account-recovery-availability", () =>
    createIpcSuccess(getAccountRecoveryAvailability()),
  );

  // 14. auth:recover-admin-account
  registry.register("auth:recover-admin-account", async (args) => {
    const input = (args[0] ?? {}) as AccountRecoveryInput;
    return runIpcAction({
      action: () => recoverAdminAccount(input),
      errorCode: "AUTH_ACCOUNT_RECOVERY_FAILED",
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "계정복구 중 오류가 발생했습니다.",
    });
  });

  // 15. auth:change-password
  registry.register("auth:change-password", (args, context) => {
    const input = (args[0] ?? {}) as AuthPasswordChangeInput;
    const { result, status } = sessionManager.handleChangePassword(input, context.cookie);
    return {
      status,
      body: result,
    };
  });

  // 16. access-logs:list
  registry.register("access-logs:list", (args) => {
    const query = args[0] as AccessLogListQuery | undefined;
    return createIpcSuccess(listAccessLogs(query));
  });

  // 17. access-logs:record
  registry.register("access-logs:record", (args, context) => {
    const input = args[0] as AccessLogRecordInput;
    if (context.session) {
      recordAccessLog(input, context.session);
    }
    return createIpcSuccess(null);
  });
};
