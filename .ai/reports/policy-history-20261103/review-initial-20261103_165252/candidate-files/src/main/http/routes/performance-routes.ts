import { existsSync } from "node:fs";
import type {
  PerformanceComparisonQuery,
  PerformanceFileDetailQuery,
  PerformanceFileListQuery,
  PerformanceOverviewQuery,
} from "../../../shared/bridge/contracts";
import type {
  PerformanceApprovalActionInput,
  PerformanceApprovedRowHideInput,
  PerformanceReapprovalFinalizeInput,
  PerformanceRejectionInput,
} from "../../../shared/domain/performance-file";
import { getStoredAppSettingsSnapshot } from "../../services/app-settings-storage-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile,
  getPerformanceApprovalHistory,
  rejectPerformanceFile,
  returnApprovedPerformanceFileToPending,
} from "../../services/performance-approval-flow-service";
import { hideApprovedPerformanceOverviewRow } from "../../services/performance-approved-row-management-service";
import { getPerformanceFileSyncStateSnapshot } from "../../services/performance-file-intake-service";
import {
  getPerformanceComparison,
  listPerformanceOverview,
} from "../../services/performance-management-service";
import {
  getPerformanceFileDetail,
  getPendingPerformanceFileDetail,
  listPendingPerformanceFiles,
  listPerformanceFiles,
} from "../../services/performance-queue-service";
import { recoverPerformanceDataOnStartup } from "../../services/performance-startup-recovery-service";
import { getPerformanceStartupRecoveryStatusSnapshot } from "../../services/performance-startup-recovery-status-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcOpenPathAction,
  type IpcActivityInput,
} from "../../ipc/ipc-handler-helpers";
import type { RequestContext } from "../api-types";
import type { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";

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
  recordSuccessfulActivity: <T extends { ok: boolean }>(result: T, activity: IpcActivityInput) =>
    sessionManager.recordSuccessfulActivity(result, activity),
});

export const registerPerformanceRoutes = (
  registry: RouteRegistry,
  sessionManager: SessionManager,
): void => {
  // 1. performance:list-files
  registry.register("performance:list-files", async (args, context) => {
    const query = args[0] as PerformanceFileListQuery | undefined;
    return createIpcSuccess(
      await listPerformanceFiles(
        query,
        getStoredAppSettingsSnapshot({
          userDataPath: context.dataDir,
        }),
      ),
    );
  });

  // 2. performance:get-sync-state
  registry.register("performance:get-sync-state", () =>
    createIpcSuccess(getPerformanceFileSyncStateSnapshot()),
  );

  // 3. performance:get-startup-recovery-status
  registry.register("performance:get-startup-recovery-status", () =>
    createIpcSuccess(getPerformanceStartupRecoveryStatusSnapshot()),
  );

  // 4. performance:retry-startup-recovery
  registry.register("performance:retry-startup-recovery", async (_args, context) => {
    await recoverPerformanceDataOnStartup({ userDataPath: context.dataDir });
    return createIpcSuccess(getPerformanceStartupRecoveryStatusSnapshot());
  });

  // 5. performance:list-overview
  registry.register("performance:list-overview", async (args, context) => {
    const query = args[0] as PerformanceOverviewQuery | undefined;
    return createIpcSuccess(
      await listPerformanceOverview(
        query,
        getStoredAppSettingsSnapshot({
          userDataPath: context.dataDir,
        }),
      ),
    );
  });

  // 6. performance:get-file-detail
  registry.register("performance:get-file-detail", async (args, context) => {
    const query = args[0] as PerformanceFileDetailQuery;
    return createIpcSuccess(
      await getPerformanceFileDetail(
        query,
        getStoredAppSettingsSnapshot({
          userDataPath: context.dataDir,
        }),
      ),
    );
  });

  // 7. performance:get-comparison
  registry.register("performance:get-comparison", (args) => {
    const query = args[0] as PerformanceComparisonQuery;
    return createIpcSuccess(getPerformanceComparison(query));
  });

  // 8. performance:list-pending-files
  registry.register("performance:list-pending-files", async () =>
    createIpcSuccess(await listPendingPerformanceFiles()),
  );

  // 9. performance:get-pending-file-detail
  registry.register("performance:get-pending-file-detail", async (args) =>
    createIpcSuccess(await getPendingPerformanceFileDetail(args[0] as string)),
  );

  // 10. performance:approve
  registry.register("performance:approve", async (args, context) => {
    const input = args[0] as PerformanceApprovalActionInput;
    const result = await approvePerformanceFile(input, context.session!, {
      userDataPath: context.dataDir,
      requireExpectedPolicyFingerprint: true,
    });
    return sessionManager.recordSuccessfulActivity(result, {
      actionType: "performance-approve",
      routeKey: "performance",
      routeLabel: "실적 관리",
      details: "실적 승인",
      session: context.session,
    });
  });

  // 11. performance:finalize-reapproved-file
  registry.register("performance:finalize-reapproved-file", async (args, context) => {
    const input = args[0] as PerformanceReapprovalFinalizeInput;
    const result = await finalizeReapprovedPerformanceFile(input, context.session!, {
      userDataPath: context.dataDir,
    });
    return sessionManager.recordSuccessfulActivity(result, {
      actionType: "performance-reapprove",
      routeKey: "performance",
      routeLabel: "실적 관리",
      details: "재승인 파일 확정 · 현재 파일 기준 반영",
      session: context.session,
    });
  });

  // 12. performance:return-to-pending
  registry.register("performance:return-to-pending", async (args, context) => {
    const input = args[0] as PerformanceReapprovalFinalizeInput;
    const result = await returnApprovedPerformanceFileToPending(input, context.session!, {
      userDataPath: context.dataDir,
    });
    return sessionManager.recordSuccessfulActivity(result, {
      actionType: "performance-return-to-pending",
      routeKey: "performance",
      routeLabel: "실적 관리",
      details: "승인완료 → 승인대기 되돌리기",
      session: context.session,
    });
  });

  // 13. performance:reject
  registry.register("performance:reject", async (args, context) => {
    const input = args[0] as PerformanceRejectionInput;
    const result = await rejectPerformanceFile(input, context.session!);
    return sessionManager.recordSuccessfulActivity(result, {
      actionType: "performance-reject",
      routeKey: "performance",
      routeLabel: "실적 관리",
      details: "실적 반려",
      session: context.session,
    });
  });

  // 14. performance:hide-approved-row
  registry.register("performance:hide-approved-row", async (args, context) => {
    const input = args[0] as PerformanceApprovedRowHideInput;
    const result = await hideApprovedPerformanceOverviewRow(input, context.session!);
    return sessionManager.recordSuccessfulActivity(result, {
      actionType: "performance-hide-approved",
      routeKey: "performance",
      routeLabel: "실적 관리",
      details: "승인완료 목록삭제",
      session: context.session,
    });
  });

  // 15. performance:list-approval-history
  registry.register("performance:list-approval-history", () =>
    getPerformanceApprovalHistory(),
  );

  // 16. performance:open-source-file
  registry.register("performance:open-source-file", async (args, context) => {
    const detail = await getPerformanceFileDetail({ fileId: args[0] as string });
    if (!detail) {
      return createIpcFailure(
        "PERFORMANCE_FILE_NOT_FOUND",
        "원본 파일 정보를 찾을 수 없습니다.",
      );
    }

    return runIpcOpenPathAction({
      filePath: detail.filePath,
      exists: existsSync,
      openPath: async (filePath) => {
        const result = await context.dialogBridge.showDialog(
          { operation: "openPath", path: filePath },
          context.signal,
        );
        return result.ok ? "" : "원본 Excel 파일을 열 수 없습니다.";
      },
      missingErrorCode: "PERFORMANCE_FILE_MISSING",
      missingMessage: "원본 Excel 파일이 존재하지 않습니다.",
      openErrorCode: "PERFORMANCE_FILE_OPEN_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "performance-open-file",
        routeKey: "performance",
        routeLabel: "실적 관리",
        details: `${detail.fileName} 원본 파일 열기`,
      }),
    });
  });
};
