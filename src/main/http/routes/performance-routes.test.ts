import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_CONTRACTS } from "../../../shared/bridge/channel-contracts";
import { accessLogActionLabels } from "../../../shared/domain/access-log";
import type { AuthSession } from "../../../shared/domain/model";
import type { DialogBridge } from "../api-types";
import { RouteRegistry } from "../route-registry";
import { SessionManager } from "../session";
import { PERFORMANCE_CHANNELS } from "./index";
import { registerPerformanceRoutes } from "./performance-routes";

const mocks = vi.hoisted(() => {
  const settingsSnapshot = { performanceIntakeDir: "C:/intake" };
  return {
    settingsSnapshot,
    existsSync: vi.fn(() => true),
    getStoredAppSettingsSnapshot: vi.fn(() => settingsSnapshot),
    approvePerformanceFile: vi.fn(async () => ({ ok: true, data: { approved: true } })),
    finalizeReapprovedPerformanceFile: vi.fn(async () => ({ ok: true, data: { finalized: true } })),
    getPerformanceApprovalHistory: vi.fn(() => ({ ok: true, data: [] })),
    rejectPerformanceFile: vi.fn(async () => ({ ok: true, data: { rejected: true } })),
    returnApprovedPerformanceFileToPending: vi.fn(async () => ({ ok: true, data: { returned: true } })),
    hideApprovedPerformanceOverviewRow: vi.fn(async () => ({ ok: true, data: { hidden: true } })),
    getPerformanceFileSyncStateSnapshot: vi.fn(() => ({ status: "idle" })),
    getPerformanceComparison: vi.fn((query: unknown) => ({ query })),
    listPerformanceOverview: vi.fn(async () => []),
    getPerformanceFileDetail: vi.fn(async () => ({
      fileId: "file-1",
      fileName: "file.xlsx",
      filePath: "C:/source/file.xlsx",
    })),
    getPendingPerformanceFileDetail: vi.fn(async (fileId: string) => ({ fileId })),
    listPendingPerformanceFiles: vi.fn(async () => []),
    listPerformanceFiles: vi.fn(async () => []),
    recoverPerformanceDataOnStartup: vi.fn(async () => undefined),
    getPerformanceStartupRecoveryStatusSnapshot: vi.fn(() => ({ status: "completed" })),
  };
});

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: mocks.existsSync,
}));
vi.mock("../../services/app-settings-storage-service", () => ({
  getStoredAppSettingsSnapshot: mocks.getStoredAppSettingsSnapshot,
}));
vi.mock("../../services/performance-approval-flow-service", () => ({
  approvePerformanceFile: mocks.approvePerformanceFile,
  finalizeReapprovedPerformanceFile: mocks.finalizeReapprovedPerformanceFile,
  getPerformanceApprovalHistory: mocks.getPerformanceApprovalHistory,
  rejectPerformanceFile: mocks.rejectPerformanceFile,
  returnApprovedPerformanceFileToPending: mocks.returnApprovedPerformanceFileToPending,
}));
vi.mock("../../services/performance-approved-row-management-service", () => ({
  hideApprovedPerformanceOverviewRow: mocks.hideApprovedPerformanceOverviewRow,
}));
vi.mock("../../services/performance-file-intake-service", () => ({
  getPerformanceFileSyncStateSnapshot: mocks.getPerformanceFileSyncStateSnapshot,
}));
vi.mock("../../services/performance-management-service", () => ({
  getPerformanceComparison: mocks.getPerformanceComparison,
  listPerformanceOverview: mocks.listPerformanceOverview,
}));
vi.mock("../../services/performance-queue-service", () => ({
  getPerformanceFileDetail: mocks.getPerformanceFileDetail,
  getPendingPerformanceFileDetail: mocks.getPendingPerformanceFileDetail,
  listPendingPerformanceFiles: mocks.listPendingPerformanceFiles,
  listPerformanceFiles: mocks.listPerformanceFiles,
}));
vi.mock("../../services/performance-startup-recovery-service", () => ({
  recoverPerformanceDataOnStartup: mocks.recoverPerformanceDataOnStartup,
}));
vi.mock("../../services/performance-startup-recovery-status-service", () => ({
  getPerformanceStartupRecoveryStatusSnapshot: mocks.getPerformanceStartupRecoveryStatusSnapshot,
}));

const adminSession: AuthSession = {
  userId: "admin-1",
  loginId: "admin",
  displayName: "관리자",
  role: "admin",
  passwordChangeRequired: false,
  issuedAt: "2026-09-16T00:00:00.000Z",
  expiresAt: "2026-09-16T08:00:00.000Z",
};
const operatorSession: AuthSession = { ...adminSession, userId: "operator-1", role: "operator" };

const createDialogBridge = (showDialog = vi.fn(async () => ({ ok: true, cancelled: false }))) => ({
  showDialog,
  dispose: vi.fn(async () => undefined),
}) satisfies DialogBridge;

const setup = (session: AuthSession | null = adminSession) => {
  const accessLogSpy = vi.fn();
  const sessionManager = new SessionManager({
    authService: {
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ ok: true, data: session })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: session })),
      changePassword: vi.fn(),
    },
    accessLogService: { recordAccessLog: accessLogSpy },
    findUserByLoginId: vi.fn(() => null),
    randomId: () => "b".repeat(64),
  });
  const cookieId = "b".repeat(64);
  if (session) {
    (
      sessionManager as unknown as {
        sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }>;
      }
    ).sessionMap.set(cookieId, { session, issuedAt: Date.now(), lastSeenAt: Date.now() });
  }
  const registry = new RouteRegistry(sessionManager);
  registerPerformanceRoutes(registry, sessionManager);
  return {
    accessLogSpy,
    cookie: `sm_session=${cookieId}`,
    dataDir: "C:/sentinel/data",
    registry,
    sessionManager,
  };
};

const dispatch = async (
  env: ReturnType<typeof setup>,
  channel: string,
  args: unknown[],
  dialogBridge: DialogBridge = createDialogBridge(),
) => {
  const signal = new AbortController().signal;
  const result = await env.registry.dispatch(channel, args, {
    headers: {},
    cookie: env.cookie,
    signal,
    version: "0.1.0",
    dataDir: env.dataDir,
    dialogBridge,
  });
  return { dialogBridge, result, signal };
};

type Descriptor = {
  args: unknown[];
  spy: ReturnType<typeof vi.fn>;
  expectedArgs: (env: ReturnType<typeof setup>, args: unknown[]) => unknown[];
};

const descriptors: Record<string, Descriptor> = {
  "performance:list-files": { args: [{ yearMonth: "2026-09" }], spy: mocks.listPerformanceFiles, expectedArgs: (_e, a) => [a[0], mocks.settingsSnapshot] },
  "performance:get-sync-state": { args: [], spy: mocks.getPerformanceFileSyncStateSnapshot, expectedArgs: () => [] },
  "performance:get-startup-recovery-status": { args: [], spy: mocks.getPerformanceStartupRecoveryStatusSnapshot, expectedArgs: () => [] },
  "performance:retry-startup-recovery": { args: [], spy: mocks.recoverPerformanceDataOnStartup, expectedArgs: (e) => [{ userDataPath: e.dataDir }] },
  "performance:list-overview": { args: [{ yearMonth: "2026-09" }], spy: mocks.listPerformanceOverview, expectedArgs: (_e, a) => [a[0], mocks.settingsSnapshot] },
  "performance:get-file-detail": { args: [{ fileId: "file-1" }], spy: mocks.getPerformanceFileDetail, expectedArgs: (_e, a) => [a[0], mocks.settingsSnapshot] },
  "performance:get-comparison": { args: [{ fileId: "file-1", rowId: "row-1" }], spy: mocks.getPerformanceComparison, expectedArgs: (_e, a) => [a[0]] },
  "performance:list-pending-files": { args: [], spy: mocks.listPendingPerformanceFiles, expectedArgs: () => [] },
  "performance:get-pending-file-detail": { args: ["file-1"], spy: mocks.getPendingPerformanceFileDetail, expectedArgs: (_e, a) => [a[0]] },
  "performance:approve": { args: [{ fileId: "file-1" }], spy: mocks.approvePerformanceFile, expectedArgs: (e, a) => [a[0], adminSession, { userDataPath: e.dataDir, requireExpectedPolicyFingerprint: true }] },
  "performance:finalize-reapproved-file": { args: [{ fileId: "file-1" }], spy: mocks.finalizeReapprovedPerformanceFile, expectedArgs: (e, a) => [a[0], adminSession, { userDataPath: e.dataDir }] },
  "performance:return-to-pending": { args: [{ fileId: "file-1", reason: "원본 수정" }], spy: mocks.returnApprovedPerformanceFileToPending, expectedArgs: (e, a) => [a[0], adminSession, { userDataPath: e.dataDir, isSessionCurrent: expect.any(Function) }] },
  "performance:reject": { args: [{ fileId: "file-1", reason: "오류" }], spy: mocks.rejectPerformanceFile, expectedArgs: (_e, a) => [a[0], adminSession] },
  "performance:hide-approved-row": { args: [{ rowId: "row-1" }], spy: mocks.hideApprovedPerformanceOverviewRow, expectedArgs: (_e, a) => [a[0], adminSession] },
  "performance:list-approval-history": { args: [], spy: mocks.getPerformanceApprovalHistory, expectedArgs: () => [] },
  "performance:open-source-file": { args: ["file-1"], spy: mocks.getPerformanceFileDetail, expectedArgs: (_e, a) => [{ fileId: a[0] }] },
};

const activities = {
  "performance:approve": ["performance-approve", "실적 승인"],
  "performance:finalize-reapproved-file": ["performance-reapprove", "재승인 파일 확정 · 현재 파일 기준 반영"],
  "performance:return-to-pending": ["performance-return-to-pending", "승인완료 → 승인대기 되돌리기"],
  "performance:reject": ["performance-reject", "실적 반려"],
  "performance:hide-approved-row": ["performance-hide-approved", "승인완료 목록삭제"],
  "performance:open-source-file": ["performance-open-file", "file.xlsx 원본 파일 열기"],
} as const;

describe("performance-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(true);
  });

  it("registers exactly the 16 performance contracts and manifest flags", () => {
    const env = setup();
    expect(env.registry.getRegisteredChannels().sort()).toEqual([...PERFORMANCE_CHANNELS].sort());
    expect(PERFORMANCE_CHANNELS).toHaveLength(16);
    expect(Object.keys(descriptors).sort()).toEqual([...PERFORMANCE_CHANNELS].sort());
    const manifestActivities = CHANNEL_CONTRACTS.filter(
      (contract) => contract.group === "performance" && contract.recordsActivity,
    ).map((contract) => contract.channel).sort();
    expect(Object.keys(activities).sort()).toEqual(manifestActivities);
    expect(manifestActivities).toHaveLength(6);
    const dataDirChannels = CHANNEL_CONTRACTS.filter(
      (contract) => contract.group === "performance" && contract.usesDataDir,
    ).map((contract) => contract.channel).sort();
    expect(dataDirChannels).toEqual([
      "performance:approve",
      "performance:finalize-reapproved-file",
      "performance:get-file-detail",
      "performance:list-files",
      "performance:list-overview",
      "performance:retry-startup-recovery",
      "performance:return-to-pending",
    ]);
  });

  it("return commit guard remains tied to the original authenticated cookie", async () => {
    const env = setup();
    await dispatch(env, "performance:return-to-pending", [{ fileId: "file-1", reason: "수정" }], createDialogBridge());
    const call = mocks.returnApprovedPerformanceFileToPending.mock.calls.at(-1) as unknown as [unknown, unknown, { isSessionCurrent: () => boolean }];
    const context = call[2];
    expect(context.isSessionCurrent()).toBe(true);
    env.sessionManager.clear();
    expect(context.isSessionCurrent()).toBe(false);
  });

  it("dispatches all 16 channels with exact service effects, dataDir, openPath, and activities", async () => {
    for (const channel of PERFORMANCE_CHANNELS) {
      vi.clearAllMocks();
      mocks.existsSync.mockReturnValue(true);
      const env = setup();
      const descriptor = descriptors[channel];
      const dialog = createDialogBridge();
      const { result, signal } = await dispatch(env, channel, descriptor.args, dialog);
      expect(result?.status, channel).toBe(200);
      expect((result?.body as { ok: boolean }).ok, channel).toBe(true);
      expect(descriptor.spy, channel).toHaveBeenCalledTimes(1);
      expect(descriptor.spy, channel).toHaveBeenCalledWith(
        ...descriptor.expectedArgs(env, descriptor.args),
      );

      if (channel === "performance:retry-startup-recovery") {
        expect(mocks.getPerformanceStartupRecoveryStatusSnapshot).toHaveBeenCalledTimes(1);
      }
      if (channel === "performance:open-source-file") {
        expect(mocks.existsSync).toHaveBeenCalledWith("C:/source/file.xlsx");
        expect(dialog.showDialog).toHaveBeenCalledWith(
          { operation: "openPath", path: "C:/source/file.xlsx" },
          signal,
        );
      } else {
        expect(dialog.showDialog).not.toHaveBeenCalled();
      }

      if (channel in activities) {
        const [actionType, details] = activities[channel as keyof typeof activities];
        expect(env.accessLogSpy).toHaveBeenCalledTimes(1);
        expect(env.accessLogSpy).toHaveBeenCalledWith(
          {
            actionType,
            actionLabel: accessLogActionLabels[actionType],
            routeKey: "performance",
            routeLabel: "실적 관리",
            details,
          },
          adminSession,
        );
      } else {
        expect(env.accessLogSpy).not.toHaveBeenCalled();
      }
    }
  });

  it("blocks missing sessions and insufficient approval roles before service effects", async () => {
    const noSession = setup(null);
    const missing = await dispatch(noSession, "performance:list-files", []);
    expect(missing.result?.status).toBe(401);
    expect(mocks.listPerformanceFiles).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const operator = setup(operatorSession);
    const forbidden = await dispatch(operator, "performance:approve", [{ fileId: "file-1" }]);
    expect(forbidden.result?.status).toBe(200);
    expect(forbidden.result?.body).toMatchObject({ ok: false, errorCode: "AUTH_FORBIDDEN" });
    expect(mocks.approvePerformanceFile).not.toHaveBeenCalled();
    expect(operator.accessLogSpy).not.toHaveBeenCalled();
  });

  it("preserves openPath not-found, missing-file, and bridge-failure semantics without activity", async () => {
    mocks.getPerformanceFileDetail.mockResolvedValueOnce(null);
    const notFoundEnv = setup();
    const notFound = await dispatch(notFoundEnv, "performance:open-source-file", ["missing"]);
    expect(notFound.result?.body).toEqual({
      ok: false,
      errorCode: "PERFORMANCE_FILE_NOT_FOUND",
      message: "원본 파일 정보를 찾을 수 없습니다.",
    });
    expect(notFound.dialogBridge.showDialog).not.toHaveBeenCalled();
    expect(notFoundEnv.accessLogSpy).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.existsSync.mockReturnValueOnce(false);
    const missingEnv = setup();
    const missing = await dispatch(missingEnv, "performance:open-source-file", ["file-1"]);
    expect(missing.result?.body).toEqual({
      ok: false,
      errorCode: "PERFORMANCE_FILE_MISSING",
      message: "원본 Excel 파일이 존재하지 않습니다.",
    });
    expect(missing.dialogBridge.showDialog).not.toHaveBeenCalled();
    expect(missingEnv.accessLogSpy).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const failingDialog = createDialogBridge(vi.fn(async () => {
      throw new Error("경로 열기 실패");
    }));
    const failedEnv = setup();
    const failed = await dispatch(failedEnv, "performance:open-source-file", ["file-1"], failingDialog);
    expect(failed.result?.body).toEqual({
      ok: false,
      errorCode: "PERFORMANCE_FILE_OPEN_FAILED",
      message: "경로 열기 실패",
    });
    expect(failedEnv.accessLogSpy).not.toHaveBeenCalled();
  });

  it("records no activity when an approval service returns a BridgeFailure", async () => {
    mocks.approvePerformanceFile.mockResolvedValueOnce({
      ok: false,
      errorCode: "PERFORMANCE_APPROVAL_FAILED",
      message: "승인 실패",
    });
    const env = setup();
    const result = await dispatch(env, "performance:approve", [{ fileId: "file-1" }]);
    expect(result.result?.body).toEqual({
      ok: false,
      errorCode: "PERFORMANCE_APPROVAL_FAILED",
      message: "승인 실패",
    });
    expect(env.accessLogSpy).not.toHaveBeenCalled();
  });
});
