import type {
  AllowanceApprovedCalculationInput,
  AllowanceDocumentExportInput,
  AllowanceEarlyPayoutInput,
  AllowancePreviewInput,
} from "../../../shared/bridge/contracts";
import type {
  AllowanceProposalApprovalInput,
  AllowanceReviewActionInput,
} from "../../../shared/domain/allowance-workflow";
import {
  listAllowanceApprovalHistory,
  reviewAllowanceCalculations,
} from "../../services/allowance-approval-service";
import { exportAllowanceDocuments } from "../../services/allowance-document-export-service";
import { listStoredAllowanceDocumentExports } from "../../services/allowance-document-export-history-service";
import { previewAllowanceCalculation } from "../../services/allowance-preview-service";
import {
  approveAllowanceProposal,
  listAllowanceProposalApprovalHistory,
  previewAllowanceProposalApproval,
} from "../../services/allowance-proposal-approval-service";
import {
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults,
  listApprovedAllowanceTargets,
  runApprovedAllowanceCalculation,
  setAllowanceCalculationEarlyPayout,
} from "../../services/approved-allowance-calculation-service";
import {
  createIpcSuccess,
  runIpcResultAction,
  type IpcActivityInput,
} from "../../ipc/ipc-handler-helpers";
import type { RequestContext } from "../api-types";
import type { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";

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

export const registerAllowanceRoutes = (
  registry: RouteRegistry,
  sessionManager: SessionManager,
): void => {
  // 1. allowance:run-approved-calculation
  registry.register("allowance:run-approved-calculation", async (args, context) => {
    const input = args[0] as AllowanceApprovedCalculationInput;
    return runIpcResultAction({
      action: () => runApprovedAllowanceCalculation(input),
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-calculate",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: "승인 실적 기반 수당 계산",
      }),
    });
  });

  // 2. allowance:list-results
  registry.register("allowance:list-results", () =>
    createIpcSuccess(listApprovedAllowanceCalculationResults()),
  );

  // 3. allowance:list-history
  registry.register("allowance:list-history", () =>
    createIpcSuccess(listAllowanceCalculationHistory()),
  );

  // 4. allowance:set-early-payout
  registry.register("allowance:set-early-payout", async (args, context) => {
    const input = args[0] as AllowanceEarlyPayoutInput;
    return runIpcResultAction({
      action: () => Promise.resolve(setAllowanceCalculationEarlyPayout(input)),
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-early-payout",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: "선지급 지정",
      }),
    });
  });

  // 5. allowance:review-calculations
  registry.register("allowance:review-calculations", async (args, context) => {
    const input = args[0] as AllowanceReviewActionInput;
    return runIpcResultAction({
      action: () =>
        reviewAllowanceCalculations(input, context.session!, {
          userDataPath: context.dataDir,
          env: process.env,
        }),
      activity: trackSuccess(context, sessionManager, {
        actionType: input.decision === "rejected" ? "allowance-reject" : "allowance-approve",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details:
          input.decision === "rejected"
            ? `${input.syncPerformanceSiteReject ? "근무지 반려" : "수당 반려"} ${
                input.calculationIds.length
              }건${input.syncPerformanceSiteReject ? " · 재승인 복귀" : ""}`
            : `수당 승인 ${input.calculationIds.length}건`,
      }),
    });
  });

  // 6. allowance:list-approval-history
  registry.register("allowance:list-approval-history", () =>
    createIpcSuccess(listAllowanceApprovalHistory()),
  );

  // 7. allowance:list-approved-targets
  registry.register("allowance:list-approved-targets", () =>
    createIpcSuccess(listApprovedAllowanceTargets()),
  );

  // 8. allowance:export-documents
  registry.register("allowance:export-documents", async (args, context) => {
    const input = args[0] as AllowanceDocumentExportInput;
    return runIpcResultAction({
      action: () =>
        exportAllowanceDocuments(input, {
          userDataPath: context.dataDir,
        }),
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-export",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: `품의서/별첨 출력 · ${input.outputFormat === "pdf" ? "PDF" : "Excel"}`,
      }),
    });
  });

  // 9. allowance:list-document-exports
  registry.register("allowance:list-document-exports", () =>
    createIpcSuccess(listStoredAllowanceDocumentExports()),
  );

  // 10. allowance:preview-proposal
  registry.register("allowance:preview-proposal", async (args, context) => {
    const input = args[0] as { calculationIds: string[] };
    return runIpcResultAction({
      action: () => Promise.resolve(previewAllowanceProposalApproval(input)),
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-proposal-preview",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: `품의 미리보기 ${input.calculationIds.length}건`,
      }),
    });
  });

  // 11. allowance:approve-proposal
  registry.register("allowance:approve-proposal", async (args, context) => {
    const input = args[0] as AllowanceProposalApprovalInput;
    return runIpcResultAction({
      action: () =>
        approveAllowanceProposal(input, context.session!, {
          userDataPath: context.dataDir,
        }),
      activity: trackSuccess(context, sessionManager, {
        actionType: "allowance-proposal-approve",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: `품의 승인 ${input.calculationIds.length}건 · ${
          input.outputFormat === "xlsx" ? "Excel" : "PDF"
        }`,
      }),
    });
  });

  // 12. allowance:list-proposal-approvals
  registry.register("allowance:list-proposal-approvals", () =>
    createIpcSuccess(listAllowanceProposalApprovalHistory()),
  );

  // 13. allowance:preview-calculation
  registry.register("allowance:preview-calculation", async (args) => {
    const input = args[0] as AllowancePreviewInput;
    return runIpcResultAction({
      action: () => Promise.resolve(previewAllowanceCalculation(input)),
    });
  });
};
