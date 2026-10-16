import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_CONTRACTS } from "../../../shared/bridge/channel-contracts";
import { accessLogActionLabels } from "../../../shared/domain/access-log";
import type { AuthSession } from "../../../shared/domain/model";
import type { DialogBridge } from "../api-types";
import { RouteRegistry } from "../route-registry";
import { SessionManager } from "../session";
import { registerAllowanceRoutes } from "./allowance-routes";
import { ALLOWANCE_CHANNELS } from "./index";

const mocks = vi.hoisted(() => ({
  listAllowanceApprovalHistory: vi.fn(() => []),
  reviewAllowanceCalculations: vi.fn(async () => ({ ok: true, data: { reviewed: true } })),
  exportAllowanceDocuments: vi.fn(async () => ({ ok: true, data: { exported: true } })),
  listStoredAllowanceDocumentExports: vi.fn(() => []),
  previewAllowanceCalculation: vi.fn((input: unknown) => ({ ok: true, data: input })),
  approveAllowanceProposal: vi.fn(async () => ({ ok: true, data: { approved: true } })),
  listAllowanceProposalApprovalHistory: vi.fn(() => []),
  previewAllowanceProposalApproval: vi.fn((input: unknown) => ({ ok: true, data: input })),
  listAllowanceCalculationHistory: vi.fn(() => []),
  listApprovedAllowanceCalculationResults: vi.fn(() => []),
  listApprovedAllowanceTargets: vi.fn(() => []),
  runApprovedAllowanceCalculation: vi.fn(async () => ({ ok: true, data: { calculated: true } })),
  setAllowanceCalculationEarlyPayout: vi.fn(() => ({ ok: true, data: { updated: true } })),
}));

vi.mock("../../services/allowance-approval-service", () => ({
  listAllowanceApprovalHistory: mocks.listAllowanceApprovalHistory,
  reviewAllowanceCalculations: mocks.reviewAllowanceCalculations,
}));
vi.mock("../../services/allowance-document-export-service", () => ({
  exportAllowanceDocuments: mocks.exportAllowanceDocuments,
}));
vi.mock("../../services/allowance-document-export-history-service", () => ({
  listStoredAllowanceDocumentExports: mocks.listStoredAllowanceDocumentExports,
}));
vi.mock("../../services/allowance-preview-service", () => ({
  previewAllowanceCalculation: mocks.previewAllowanceCalculation,
}));
vi.mock("../../services/allowance-proposal-approval-service", () => ({
  approveAllowanceProposal: mocks.approveAllowanceProposal,
  listAllowanceProposalApprovalHistory: mocks.listAllowanceProposalApprovalHistory,
  previewAllowanceProposalApproval: mocks.previewAllowanceProposalApproval,
}));
vi.mock("../../services/approved-allowance-calculation-service", () => ({
  listAllowanceCalculationHistory: mocks.listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults: mocks.listApprovedAllowanceCalculationResults,
  listApprovedAllowanceTargets: mocks.listApprovedAllowanceTargets,
  runApprovedAllowanceCalculation: mocks.runApprovedAllowanceCalculation,
  setAllowanceCalculationEarlyPayout: mocks.setAllowanceCalculationEarlyPayout,
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

const dialogBridge: DialogBridge = {
  showDialog: vi.fn(),
  dispose: vi.fn(async () => undefined),
};

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
    randomId: () => "c".repeat(64),
  });
  const cookieId = "c".repeat(64);
  if (session) {
    (
      sessionManager as unknown as {
        sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }>;
      }
    ).sessionMap.set(cookieId, { session, issuedAt: Date.now(), lastSeenAt: Date.now() });
  }
  const registry = new RouteRegistry(sessionManager);
  registerAllowanceRoutes(registry, sessionManager);
  return {
    accessLogSpy,
    cookie: `sm_session=${cookieId}`,
    dataDir: "C:/sentinel/data",
    registry,
    session,
  };
};

const dispatch = (env: ReturnType<typeof setup>, channel: string, args: unknown[]) =>
  env.registry.dispatch(channel, args, {
    headers: {},
    cookie: env.cookie,
    signal: new AbortController().signal,
    version: "0.1.0",
    dataDir: env.dataDir,
    dialogBridge,
  });

type Descriptor = {
  args: unknown[];
  spy: ReturnType<typeof vi.fn>;
  expectedArgs: (env: ReturnType<typeof setup>, args: unknown[]) => unknown[];
};

const descriptors: Record<string, Descriptor> = {
  "allowance:run-approved-calculation": { args: [{ performanceFileIds: ["file-1"] }], spy: mocks.runApprovedAllowanceCalculation, expectedArgs: (_e, a) => [a[0]] },
  "allowance:list-results": { args: [], spy: mocks.listApprovedAllowanceCalculationResults, expectedArgs: () => [] },
  "allowance:list-history": { args: [], spy: mocks.listAllowanceCalculationHistory, expectedArgs: () => [] },
  "allowance:set-early-payout": { args: [{ calculationIds: ["calc-1"], payoutDate: "2026-09-25" }], spy: mocks.setAllowanceCalculationEarlyPayout, expectedArgs: (_e, a) => [a[0]] },
  "allowance:review-calculations": { args: [{ decision: "approved", calculationIds: ["calc-1", "calc-2"] }], spy: mocks.reviewAllowanceCalculations, expectedArgs: (e, a) => [a[0], adminSession, { userDataPath: e.dataDir, env: process.env }] },
  "allowance:list-approval-history": { args: [], spy: mocks.listAllowanceApprovalHistory, expectedArgs: () => [] },
  "allowance:list-approved-targets": { args: [], spy: mocks.listApprovedAllowanceTargets, expectedArgs: () => [] },
  "allowance:export-documents": { args: [{ calculationIds: ["calc-1"], outputFormat: "xlsx" }], spy: mocks.exportAllowanceDocuments, expectedArgs: (e, a) => [a[0], { userDataPath: e.dataDir }] },
  "allowance:list-document-exports": { args: [], spy: mocks.listStoredAllowanceDocumentExports, expectedArgs: () => [] },
  "allowance:preview-proposal": { args: [{ calculationIds: ["calc-1", "calc-2"] }], spy: mocks.previewAllowanceProposalApproval, expectedArgs: (_e, a) => [a[0]] },
  "allowance:approve-proposal": { args: [{ calculationIds: ["calc-1", "calc-2"], outputFormat: "xlsx" }], spy: mocks.approveAllowanceProposal, expectedArgs: (e, a) => [a[0], adminSession, { userDataPath: e.dataDir }] },
  "allowance:list-proposal-approvals": { args: [], spy: mocks.listAllowanceProposalApprovalHistory, expectedArgs: () => [] },
  "allowance:preview-calculation": { args: [{ performanceFileIds: ["file-1"] }], spy: mocks.previewAllowanceCalculation, expectedArgs: (_e, a) => [a[0]] },
};

const activities = {
  "allowance:run-approved-calculation": ["allowance-calculate", "승인 실적 기반 수당 계산"],
  "allowance:set-early-payout": ["allowance-early-payout", "선지급 지정"],
  "allowance:review-calculations": ["allowance-approve", "수당 승인 2건"],
  "allowance:export-documents": ["allowance-export", "품의서/별첨 출력 · Excel"],
  "allowance:preview-proposal": ["allowance-proposal-preview", "품의 미리보기 2건"],
  "allowance:approve-proposal": ["allowance-proposal-approve", "품의 승인 2건 · Excel"],
} as const;

describe("allowance-routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers exactly the 13 allowance contracts and manifest flags", () => {
    const env = setup();
    expect(env.registry.getRegisteredChannels().sort()).toEqual([...ALLOWANCE_CHANNELS].sort());
    expect(ALLOWANCE_CHANNELS).toHaveLength(13);
    expect(Object.keys(descriptors).sort()).toEqual([...ALLOWANCE_CHANNELS].sort());
    const manifestActivities = CHANNEL_CONTRACTS.filter(
      (contract) => contract.group === "allowance" && contract.recordsActivity,
    ).map((contract) => contract.channel).sort();
    expect(Object.keys(activities).sort()).toEqual(manifestActivities);
    expect(manifestActivities).toHaveLength(6);
    const dataDirChannels = CHANNEL_CONTRACTS.filter(
      (contract) => contract.group === "allowance" && contract.usesDataDir,
    ).map((contract) => contract.channel).sort();
    expect(dataDirChannels).toEqual([
      "allowance:approve-proposal",
      "allowance:export-documents",
      "allowance:review-calculations",
    ]);
  });

  it("dispatches all 13 channels with exact service effects, dataDir, and activities", async () => {
    for (const channel of ALLOWANCE_CHANNELS) {
      vi.clearAllMocks();
      const env = setup();
      const descriptor = descriptors[channel];
      const result = await dispatch(env, channel, descriptor.args);
      expect(result?.status, channel).toBe(200);
      expect((result?.body as { ok: boolean }).ok, channel).toBe(true);
      expect(descriptor.spy, channel).toHaveBeenCalledTimes(1);
      expect(descriptor.spy, channel).toHaveBeenCalledWith(
        ...descriptor.expectedArgs(env, descriptor.args),
      );

      if (channel in activities) {
        const [actionType, details] = activities[channel as keyof typeof activities];
        expect(env.accessLogSpy).toHaveBeenCalledTimes(1);
        expect(env.accessLogSpy).toHaveBeenCalledWith(
          {
            actionType,
            actionLabel: accessLogActionLabels[actionType],
            routeKey: "allowance",
            routeLabel: "수당 관리",
            details,
          },
          adminSession,
        );
      } else {
        expect(env.accessLogSpy).not.toHaveBeenCalled();
      }
    }
  });

  it("preserves session-vs-action permission behavior for operator users", async () => {
    const operator = setup(operatorSession);
    const allowed = await dispatch(operator, "allowance:run-approved-calculation", [
      { performanceFileIds: ["file-1"] },
    ]);
    expect(allowed?.status).toBe(200);
    expect(allowed?.body).toMatchObject({ ok: true });
    expect(mocks.runApprovedAllowanceCalculation).toHaveBeenCalledTimes(1);
    expect(operator.accessLogSpy).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const forbidden = await dispatch(operator, "allowance:review-calculations", [
      { decision: "approved", calculationIds: ["calc-1"] },
    ]);
    expect(forbidden?.status).toBe(200);
    expect(forbidden?.body).toMatchObject({ ok: false, errorCode: "AUTH_FORBIDDEN" });
    expect(mocks.reviewAllowanceCalculations).not.toHaveBeenCalled();
    expect(operator.accessLogSpy).not.toHaveBeenCalled();
  });

  it("blocks missing sessions before any service or activity effect", async () => {
    const env = setup(null);
    const result = await dispatch(env, "allowance:list-history", []);
    expect(result?.status).toBe(401);
    expect(result?.body).toMatchObject({ ok: false, errorCode: "AUTH_SESSION_REQUIRED" });
    expect(mocks.listAllowanceCalculationHistory).not.toHaveBeenCalled();
    expect(env.accessLogSpy).not.toHaveBeenCalled();
  });

  it("records no activity when a result service returns BridgeFailure", async () => {
    mocks.setAllowanceCalculationEarlyPayout.mockReturnValueOnce({
      ok: false,
      errorCode: "ALLOWANCE_EARLY_PAYOUT_FAILED",
      message: "선지급 실패",
    });
    const env = setup();
    const result = await dispatch(env, "allowance:set-early-payout", [
      { calculationIds: ["calc-1"], payoutDate: "2026-09-25" },
    ]);
    expect(result?.body).toEqual({
      ok: false,
      errorCode: "ALLOWANCE_EARLY_PAYOUT_FAILED",
      message: "선지급 실패",
    });
    expect(env.accessLogSpy).not.toHaveBeenCalled();
  });

  it("preserves rejected review activity wording and session identity", async () => {
    const env = setup();
    const input = {
      decision: "rejected",
      calculationIds: ["calc-1", "calc-2"],
      syncPerformanceSiteReject: true,
    };
    const result = await dispatch(env, "allowance:review-calculations", [input]);
    expect(result?.body).toMatchObject({ ok: true });
    expect(env.accessLogSpy).toHaveBeenCalledWith(
      {
        actionType: "allowance-reject",
        actionLabel: accessLogActionLabels["allowance-reject"],
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: "근무지 반려 2건 · 재승인 복귀",
      },
      adminSession,
    );
  });
});
