import { isManagedEmployeeEmployedOnDate } from "../../shared/domain/employee-employment";
import { getWageTimelineRowForDate, resolveWageRateForDate } from "../../shared/domain/wage-rate";
import { existsSync } from "node:fs";
import path from "node:path";

import type { BridgeResult, PerformanceReturnToPendingResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  PerformanceAlert,
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceEntryRecord,
  PerformanceFileDetail,
  PerformanceReapprovalFinalizeInput,
  PerformanceRejectionInput
} from "../../shared/domain/performance-file";
import {
  getNonPayablePerformanceReasonText,
  isNonPayablePerformanceEntry,
  isPayablePerformanceEntry
} from "../../shared/domain/performance-file";
import {
  createPerformanceApprovalRecord,
  deletePerformanceApprovalRecord,
  getLatestPerformanceApprovalByLogicalKey,
  listPerformanceApprovalHistory
} from "./performance-approval-service";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";
import { createPerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import {
  archiveApprovedPerformanceFile,
  rollbackPerformanceReturnSource,
  restoreApprovedPerformanceFileToPending
} from "./performance-file-archive-service";
import { detectUnmarkedHolidayGap } from "./performance-holiday-gap-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  markStoredPerformanceFileArchivedAsEffective,
  moveStoredPerformanceFileToPending,
  upsertPerformanceFileDetail,
  updateStoredPerformanceFileApprovalProgress
} from "./performance-file-storage-service";
import { getPendingPerformanceFileDetail } from "./performance-queue-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { listStoredEmployees } from "./employee-storage-service";
import { listStoredEmployeeWageRates } from "./employee-history-service";
import {
  deleteAllowanceCalculationByApprovalId,
  getLatestAllowanceCalculationByApprovalId,
  runApprovedAllowanceCalculationForApproval
} from "./approved-allowance-calculation-service";
import type { PolicyActorSnapshot } from "../../shared/domain/policy-history";
import {
  isPolicyHistoryInitialized,
  recordPolicyUse,
  selectPolicyForWorkDate
} from "./policy-history-service";

const buildMissingFileResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildMissingEntryResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_ENTRY_NOT_FOUND",
  message: "대상 실적 행을 찾을 수 없습니다."
});

const buildAlreadyProcessedResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_ALREADY_APPROVED",
  message: "이미 승인 처리된 실적 행입니다."
});

const buildApprovalBlockedResult = (message: string): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_APPROVAL_BLOCKED",
  message
});

const buildFinalizeMissingFileResult = (): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildFinalizeBlockedResult = (message: string): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED",
  message
});

const isCompletedInCurrentReapprovalCycle = (
  detail: Pick<PerformanceFileDetail, "id" | "receivedAt">,
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) =>
  Boolean(
    latestApproval &&
      latestApproval.fileId === detail.id &&
      latestApproval.processedAt >= detail.receivedAt
  );

const isHourlyRateAlert = (alert: PerformanceAlert) => {
  const normalizedMessage = alert.message.replace(/\s+/g, "");

  if (!normalizedMessage.includes("시급")) {
    return false;
  }

  return (
    normalizedMessage.includes("적용") ||
    normalizedMessage.includes("이력") ||
    normalizedMessage.includes("정보") ||
    normalizedMessage.includes("찾지못") ||
    normalizedMessage.includes("없")
  );
};

const resolveApprovalEntry = (
  entry: PerformanceEntryRecord,
  manualHourlyRate?: number
): PerformanceEntryRecord => {
  if (!manualHourlyRate || manualHourlyRate <= 0) {
    return entry;
  }

  return {
    ...entry,
    hourlyRate: manualHourlyRate,
    alerts: entry.alerts.filter((alert) => !isHourlyRateAlert(alert))
  };
};

const buildApprovalComment = (input: {
  comment?: string;
  manualHourlyRate?: number;
}) => {
  const notes = [];

  if (input.comment?.trim()) {
    notes.push(input.comment.trim());
  }

  if (input.manualHourlyRate && input.manualHourlyRate > 0) {
    notes.push(`시급 임의지정 ${input.manualHourlyRate.toLocaleString("ko-KR")}원`);
  }

  return notes.join(" / ") || undefined;
};

const buildNonPayablePerformanceMessage = (entry: PerformanceEntryRecord) => {
  return getNonPayablePerformanceReasonText(entry) ?? "수당 미지급 대상 실적입니다.";
};

const validateApprovalEntry = (entry: PerformanceEntryRecord): string | null => {
  if (isNonPayablePerformanceEntry(entry)) {
    return buildNonPayablePerformanceMessage(entry);
  }

  if (!entry.hourlyRate || entry.hourlyRate <= 0) {
    return "적용 시급이 없어 승인할 수 없습니다. 재승인 상세보기에서 시급을 임의 지정한 뒤 다시 승인하세요.";
  }

  if (entry.alerts.some((alert) => alert.severity === "error")) {
    return "오류 알림이 남아 있어 승인할 수 없습니다. 알림을 해소하거나 시급을 임의 지정한 뒤 다시 승인하세요.";
  }

  return null;
};

const createApprovedPerformanceRecord = async (input: {
  detail: PerformanceFileDetail;
  entry: PerformanceEntryRecord;
  session: AuthSession;
  comment?: string;
}): Promise<BridgeResult<PerformanceApprovalRecord>> => {
  const validationMessage = validateApprovalEntry(input.entry);

  if (validationMessage) {
    return {
      ok: false as const,
      errorCode: "PERFORMANCE_APPROVAL_BLOCKED",
      message: validationMessage
    };
  }

  // 승인 기록 저장과 수당 계산 저장을 한 묶음(트랜잭션)으로 처리한다.
  // 둘 중 하나라도 실패하면 전체를 되돌려, 저장 도중 멈춰도 짝이 안 맞는 찌꺼기 기록이 남지 않게 한다.
  // (수당 계산에 필요한 요율·공휴일 조회는 BEGIN 이전 검증 단계에서 끝나며 중첩 트랜잭션을 열지 않는다.)
  const transactionalDatabase = isSqliteStorageReady() ? getSqliteDatabase() : null;

  if (transactionalDatabase) {
    transactionalDatabase.exec("BEGIN");
  }

  try {
    if (transactionalDatabase && isPolicyHistoryInitialized(transactionalDatabase) && input.entry.appliedPolicies?.bindings?.length) {
      for (const binding of input.entry.appliedPolicies.bindings) {
        const currentActive = selectPolicyForWorkDate(binding.kind, input.entry.workDate, transactionalDatabase);
        if (!currentActive || currentActive.revision.id !== binding.policyId || currentActive.revision.ruleKey !== binding.ruleKey) {
          transactionalDatabase.exec("ROLLBACK");
          return {
            ok: false as const,
            errorCode: "POLICY_CONFLICT",
            message: "승인 준비 중 정책 기준이 변경되었습니다. 실적 화면을 새로고침한 뒤 다시 승인하세요."
          };
        }
      }
    }

    const record = createPerformanceApprovalRecord({
      fileId: input.detail.id,
      entry: input.entry,
      fileName: input.detail.fileName,
      processedBy: input.session.userId,
      processedByName: input.session.displayName,
      comment: input.comment,
      snapshotJson: createPerformanceApprovalSnapshot(input.detail, input.entry)
    });
    const calculationResult = await runApprovedAllowanceCalculationForApproval(record);

    if (!calculationResult.ok) {
      if (transactionalDatabase) {
        transactionalDatabase.exec("ROLLBACK");
      } else {
        deletePerformanceApprovalRecord(record.id);
        deleteAllowanceCalculationByApprovalId(record.id);
      }

      return {
        ok: false as const,
        errorCode: calculationResult.errorCode,
        message: calculationResult.message
      };
    }

    if (transactionalDatabase && isPolicyHistoryInitialized(transactionalDatabase) && input.entry.appliedPolicies?.bindings?.length) {
      const actor: PolicyActorSnapshot = {
        userId: input.session.userId,
        loginId: input.session.userId,
        displayName: input.session.displayName,
        role: input.session.role
      };
      recordPolicyUse(transactionalDatabase, input.entry.appliedPolicies.bindings, record.id, actor);
    }

    if (transactionalDatabase) {
      transactionalDatabase.exec("COMMIT");
    }

    return {
      ok: true as const,
      data: record
    };
  } catch (error) {
    if (transactionalDatabase) {
      transactionalDatabase.exec("ROLLBACK");
    }

    throw error;
  }
};

const getResolvedApprovedEntryCount = (
  detail: NonNullable<Awaited<ReturnType<typeof getPendingPerformanceFileDetail>>>
) =>
  detail.entries.filter((entry) => {
    if (isNonPayablePerformanceEntry(entry)) {
      return false;
    }

    const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
    const isReapprovalFile =
      detail.status === "rejected" || hasPriorApprovedContentForPendingFile(detail);

    if (isReapprovalFile) {
      if (isChangeLockedApproval(latestApproval)) {
        return true;
      }

      return (
        latestApproval?.decision === "approved" &&
        isCompletedInCurrentReapprovalCycle(detail, latestApproval)
      );
    }

    return resolvePerformanceEntryApprovalState({
      entry,
      latestApproval
    }).satisfied;
  }).length;

const getEligibleApprovalEntries = (
  detail: Pick<PerformanceFileDetail, "entries">
) => detail.entries.filter((entry) => isPayablePerformanceEntry(entry));

const isChangeLockedApproval = (
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) =>
  latestApproval?.decision === "approved" &&
  getLatestAllowanceCalculationByApprovalId(latestApproval.id)?.status === "proposal-approved";

const normalizeArchiveScheduleKey = (scheduleKey?: string | null) =>
  (scheduleKey ?? "").replace(/:(?:pending|approved)$/i, "");

const hasApprovedArchiveForSchedule = (detail: Pick<PerformanceFileDetail, "id" | "scheduleKey">) =>
  Boolean(detail.scheduleKey) &&
  listStoredPerformanceFileDetails().some(
    (item) =>
      item.id !== detail.id &&
      normalizeArchiveScheduleKey(item.scheduleKey) ===
        normalizeArchiveScheduleKey(detail.scheduleKey) &&
      item.directoryType === "approved" &&
      item.status === "approved"
  );

const hasPriorApprovedHistoryFromAnotherFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries">
) => {
  const payrollLogicalKeys = new Set(
    getEligibleApprovalEntries(detail).map((entry) => entry.logicalKey)
  );

  if (payrollLogicalKeys.size === 0) {
    return false;
  }

  return listPerformanceApprovalHistory().some(
    (approval) =>
      approval.decision === "approved" &&
      approval.fileId !== detail.id &&
      payrollLogicalKeys.has(approval.logicalKey)
  );
};

const hasCurrentCycleApproval = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "receivedAt">
) =>
  getEligibleApprovalEntries(detail).some((entry) =>
    isCompletedInCurrentReapprovalCycle(
      detail,
      getLatestPerformanceApprovalByLogicalKey(entry.logicalKey)
    )
  );

// A prior approval whose owning file row is gone, or whose archived workbook no longer exists on
// disk, is an orphan: the user hand-moved the approved file out of 승인완료 (which mints a brand-new
// pending file id and strands the old approved row). Such an approval can no longer be trusted as a
// live "already approved" copy, so the pending file in hand must be treated as re-approvable instead
// of returning PERFORMANCE_ALREADY_APPROVED forever. Returns false for healthy approvals, so live
// approvals are completely unaffected.
const isLatestApprovalSourceMissing = (
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
): boolean => {
  if (!latestApproval || latestApproval.decision !== "approved") {
    return false;
  }

  const approvedFile = getStoredPerformanceFileDetail(latestApproval.fileId);

  // If we cannot positively confirm an archived approval row, keep blocking (treat as healthy). Only a
  // row we can read as directory_type='approved' is a candidate for the hand-moved-orphan signature.
  if (!approvedFile || approvedFile.directoryType !== "approved") {
    return false;
  }

  if (existsSync(approvedFile.filePath)) {
    return false;
  }

  // The recorded source file is gone. Only trust that as a genuine orphan when its CONTAINING FOLDER
  // is still reachable: a momentarily-offline 승인완료 folder (network share / cloud-on-demand) would
  // otherwise make every approved source look "missing" and wrongly unlock reapproval en masse. When
  // the folder itself is unreachable we treat it as unknown and keep blocking.
  return existsSync(path.dirname(approvedFile.filePath));
};

const hasPriorApprovedContentForPendingFile = (
  detail: Pick<PerformanceFileDetail, "id" | "directoryType" | "status" | "entries" | "receivedAt">
) =>
  detail.directoryType === "pending" &&
  (
    detail.status === "rejected" ||
    (hasPriorApprovedHistoryFromAnotherFile(detail) && hasCurrentCycleApproval(detail)) ||
    getEligibleApprovalEntries(detail).some((entry) => {
      const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
      return Boolean(
        latestApproval?.decision === "approved" &&
          latestApproval.fileId !== detail.id &&
          (resolvePerformanceEntryApprovalState({
            entry,
            latestApproval
          }).needsReapproval ||
            isLatestApprovalSourceMissing(latestApproval))
      );
    })
  );

export const approvePerformanceFile = async (
  input: PerformanceApprovalActionInput,
  session: AuthSession,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
    requireExpectedPolicyFingerprint?: boolean;
  }
): Promise<BridgeResult<PerformanceApprovalRecord>> => {
  const detail = await getPendingPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildMissingFileResult();
  }

  const entry = detail.entries.find((item) => item.id === input.entryId);

  if (!entry) {
    return buildMissingEntryResult();
  }

  if (isNonPayablePerformanceEntry(entry)) {
    return buildApprovalBlockedResult(buildNonPayablePerformanceMessage(entry));
  }

  const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);

  if (isChangeLockedApproval(latestApproval)) {
    return buildApprovalBlockedResult("품의승인 완료 수당은 재승인으로 변경할 수 없습니다.");
  }

  // A failed source refresh can retain an old positive cached/manual wage. An explicit void still
  // blocks a new approval; approved snapshots are never retroactively rewritten by this guard.
  const wageEmployee = listStoredEmployees({ includeDeleted: true, includeHistoricalAssignments: true }).find(e => e.employeeCode === entry.employeeCode);
  if(wageEmployee && !isManagedEmployeeEmployedOnDate(wageEmployee,entry.workDate))return {ok:false,errorCode:"PERFORMANCE_EMPLOYEE_NOT_EMPLOYED",message:"해당 근무일은 재직기간에 포함되지 않습니다. 퇴사 공백이나 취소한 재입사 예약의 실적은 수동 시급으로도 승인할 수 없습니다. 인력의 재직기간과 원본을 확인해 주세요."};
  if (wageEmployee?.status === "retired" && wageEmployee.retireDate && entry.workDate >= wageEmployee.retireDate) {
    return { ok:false, errorCode:"PERFORMANCE_EMPLOYEE_RETIRED", message:"퇴사일은 근무에서 제외되는 첫날입니다. 퇴사일 이후 실적은 수동 시급으로도 승인할 수 없습니다. 인력 정보와 원본을 확인해 주세요." };
  }
  if (wageEmployee && getWageTimelineRowForDate(listStoredEmployeeWageRates(wageEmployee.id), entry.workDate)?.invalidation) {
    return { ok: false, errorCode: "PERFORMANCE_WAGE_INVALIDATED", message: "무효 처리한 시급의 적용 기간입니다. 인력 관리에서 유효한 시급을 등록한 뒤 실적을 다시 읽어 주세요. 수동 시급으로 승인할 수 없습니다." };
  }

  const approvalEntry = resolveApprovalEntry(entry, input.manualHourlyRate);
  const resolvedApproval = resolvePerformanceEntryApprovalState({
    entry: approvalEntry,
    latestApproval
  });
  const hasCurrentCycleApproval = isCompletedInCurrentReapprovalCycle(detail, latestApproval);
  const hasExplicitHourlyRateChange = Boolean(
    input.manualHourlyRate && input.manualHourlyRate > 0 &&
      input.manualHourlyRate !== resolvedApproval.approvedEntry?.hourlyRate
  );
  const isPendingReapprovalFile = hasPriorApprovedContentForPendingFile(detail);
  const canReapproveCurrentCycle =
    latestApproval?.decision === "approved" &&
    resolvedApproval.satisfied &&
    isPendingReapprovalFile &&
    !hasCurrentCycleApproval;

  if (
    latestApproval?.decision === "approved" &&
    resolvedApproval.satisfied &&
    !hasExplicitHourlyRateChange &&
    !canReapproveCurrentCycle
  ) {
    return buildAlreadyProcessedResult();
  }

  if (context?.requireExpectedPolicyFingerprint) {
    if (!input.expectedPolicyFingerprint) {
      return {
        ok: false,
        errorCode: "POLICY_CONFLICT",
        message: "승인 시 정책 지문이 누락되었습니다. 실적 화면을 새로고침한 뒤 다시 승인하세요."
      };
    }
    if (!entry.appliedPolicies || input.expectedPolicyFingerprint !== entry.appliedPolicies.fingerprint) {
      return {
        ok: false,
        errorCode: "POLICY_CONFLICT",
        message: "실적에 적용된 정책 기준이 최신이 아닙니다. 실적 화면을 새로고침하여 최신 정책 기준을 확인한 뒤 다시 승인하세요."
      };
    }
  }

  const creationResult = await createApprovedPerformanceRecord({
    detail,
    entry: approvalEntry,
    session,
    comment: buildApprovalComment(input)
  });

  if (!creationResult.ok) {
    return creationResult;
  }

  const record = creationResult.data;

  const approvedEntryCount = getResolvedApprovedEntryCount(detail);
  const eligibleEntryCount = getEligibleApprovalEntries(detail).length;
  const userDataPath = context?.userDataPath;

  updateStoredPerformanceFileApprovalProgress({
    fileId: detail.id,
    approvedEntryCount
  });

  if (
    approvedEntryCount === eligibleEntryCount &&
    eligibleEntryCount > 0 &&
    userDataPath &&
    !hasApprovedArchiveForSchedule(detail) &&
    // Hold the auto-archive when the month has registered public holidays but the file produced no
    // 법정휴일 근무 row at all: that is the signature of a returned schedule whose holiday markings
    // were lost, and silently moving it to 승인완료 is exactly the surprise this change prevents. The
    // overtime approval still persists; the file stays in 승인대기 with the holiday-gap hint, and the
    // user can register the holidays and re-import, or finalize as-is via "이대로 승인완료".
    !detectUnmarkedHolidayGap(detail)
  ) {
    try {
      const archiveResult = await archiveApprovedPerformanceFile({
        detail,
        userDataPath,
        env: context?.env
      });
      const completedAt = new Date().toISOString();

      markStoredPerformanceFileArchivedAsEffective({
        fileId: detail.id,
        archivedFilePath: archiveResult.archivedFilePath,
        archivedFileName: archiveResult.archivedFileName,
        completedAt,
        scheduleKey: detail.scheduleKey ?? ""
      });
    } catch (error) {
      deletePerformanceApprovalRecord(record.id);
      deleteAllowanceCalculationByApprovalId(record.id);
      updateStoredPerformanceFileApprovalProgress({
        fileId: detail.id,
        approvedEntryCount: getResolvedApprovedEntryCount(detail)
      });

      return {
        ok: false,
        errorCode: "PERFORMANCE_ARCHIVE_FAILED",
        message: error instanceof Error ? error.message : "승인 파일 보관에 실패했습니다."
      };
    }
  }

  return {
    ok: true,
    data: record
  };
};

export const finalizeReapprovedPerformanceFile = async (
  input: PerformanceReapprovalFinalizeInput,
  _session: AuthSession,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<PerformanceFileDetail>> => {
  const detail = await getPendingPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildFinalizeMissingFileResult();
  }

  if (detail.directoryType !== "pending") {
    return buildFinalizeBlockedResult("승인대기 폴더에 있는 파일만 승인완료로 확정할 수 있습니다.");
  }

  if (!context?.userDataPath) {
    return buildFinalizeBlockedResult("재승인본 이동 경로를 확인할 수 없습니다.");
  }

  // A reapproval file (a re-imported correction or a 근무지 반려 후 재승인) keeps its existing
  // semantics. A first-time file is only finalizable here when every eligible row has already been
  // approved — that is the "이대로 승인완료" escape hatch for a file whose auto-archive was held back
  // by the holiday-gap guard (e.g. a month with a registered holiday that nobody actually worked).
  const isReapprovalFile = hasPriorApprovedContentForPendingFile(detail);

  // A genuinely new first-time file (not a reapproval/re-import of the same rows) must not be force
  // archived over an existing approved copy of the same 근무지·월: archiving would flip the existing
  // copy's is_effective bit off and supersede it, even though the two files may cover disjoint people.
  // Reapproval files intentionally replace their prior approved copy and are exempt.
  if (!isReapprovalFile && hasApprovedArchiveForSchedule(detail)) {
    return buildFinalizeBlockedResult(
      "이미 같은 근무지·월의 승인완료본이 있어 이대로 승인완료할 수 없습니다. 기존 승인완료본을 먼저 승인대기로 되돌린 뒤 다시 시도하세요."
    );
  }

  const eligibleEntries = getEligibleApprovalEntries(detail);

  if (eligibleEntries.length === 0) {
    return buildFinalizeBlockedResult("확정할 실적 행이 없습니다.");
  }

  const missingApprovalEntries = eligibleEntries.flatMap((entry) => {
    const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);

    if (isChangeLockedApproval(latestApproval)) {
      return [];
    }

    if (
      latestApproval?.decision === "approved" &&
      isCompletedInCurrentReapprovalCycle(detail, latestApproval)
    ) {
      return [];
    }

    return [`${entry.employeeName} ${entry.workDate}`];
  });

  if (missingApprovalEntries.length > 0) {
    return buildFinalizeBlockedResult(
      detail.status === "rejected"
        ? `근무지 반려 후 재승인된 실적은 모두 현재 파일 기준으로 다시 승인해야 합니다. ${missingApprovalEntries.join(" / ")}`
        : isReapprovalFile
        ? `재승인 파일은 변경 가능한 모든 실적을 현재 파일 기준으로 다시 승인해야 합니다. ${missingApprovalEntries.join(" / ")}`
        : `먼저 모든 실적을 승인해야 승인완료로 옮길 수 있습니다. ${missingApprovalEntries.join(" / ")}`
    );
  }

  try {
    updateStoredPerformanceFileApprovalProgress({
      fileId: detail.id,
      approvedEntryCount: getResolvedApprovedEntryCount(detail)
    });

    const archiveResult = await archiveApprovedPerformanceFile({
      detail,
      userDataPath: context.userDataPath,
      env: context.env
    });
    const completedAt = new Date().toISOString();

    markStoredPerformanceFileArchivedAsEffective({
      fileId: detail.id,
      archivedFilePath: archiveResult.archivedFilePath,
      archivedFileName: archiveResult.archivedFileName,
      completedAt,
      scheduleKey: detail.scheduleKey ?? ""
    });

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    if (!archivedDetail) {
      return {
        ok: false,
        errorCode: "PERFORMANCE_ARCHIVE_FAILED",
        message: "이동 후 실적 파일 상태를 다시 불러오지 못했습니다."
      };
    }

    return {
      ok: true,
      data: archivedDetail
    };
  } catch (error) {
    updateStoredPerformanceFileApprovalProgress({
      fileId: detail.id,
      approvedEntryCount: getResolvedApprovedEntryCount(detail)
    });

    return {
      ok: false,
      errorCode: "PERFORMANCE_ARCHIVE_FAILED",
      message: error instanceof Error ? error.message : "재승인본 이동에 실패했습니다."
    };
  }
};

const buildReturnToPendingMissingResult = (): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildReturnToPendingBlockedResult = (message: string): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_RETURN_TO_PENDING_BLOCKED",
  message
});

// This explicit whole-file action retains the existing narrow approval/calculation deletion exception.
// Cached source/time values stay intact; only their work-date wage is reapplied in that transaction.
const reapplyReturnedEntryWages = (detail: PerformanceFileDetail) => {
  const employees = new Map(listStoredEmployees({ includeDeleted: true, includeHistoricalAssignments: true }).map(e => [e.employeeCode, e]));
  const ratesById = new Map<string, ReturnType<typeof listStoredEmployeeWageRates>>();
  let appliedEntryCount = 0, unresolvedEntryCount = 0;
  const entries = detail.entries.map(entry => {
    if (!isPayablePerformanceEntry(entry)) return entry;
    const employee = employees.get(entry.employeeCode);
    let rates: ReturnType<typeof listStoredEmployeeWageRates> = [];
    if (employee) {
      if (!ratesById.has(employee.id)) ratesById.set(employee.id, listStoredEmployeeWageRates(employee.id));
      rates = ratesById.get(employee.id)!;
    }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(entry.workDate) ? new Date(`${entry.workDate}T00:00:00Z`) : null;
    const validDay = day && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === entry.workDate;
    // listStoredEmployeeWageRates orders latest effectiveFrom first, matching the intake resolver.
    const rate = validDay ? resolveWageRateForDate(rates, entry.workDate) : undefined;
    const alerts = entry.alerts.filter(alert => !(alert.severity === "error" && (
      /^.+의 (?:시급 이력이 없습니다\.|\d{4}-\d{2}-\d{2} 기준 적용 시급을 찾지 못했습니다\. 현재 등록 시작일: \d{4}-\d{2}-\d{2})$/.test(alert.message.trim()) ||
      alert.message.trim() === `${entry.employeeName}의 시급 정보가 없습니다.`
    )));
    if (rate) appliedEntryCount += 1;
    else {
      unresolvedEntryCount += 1;
      alerts.push({ severity: "error", message: !employee
        ? `${entry.employeeName}의 사번에 해당하는 인력 정보를 찾지 못했습니다.`
        : !validDay ? "근무일을 확인할 수 없어 시급을 적용하지 않았습니다."
        : rates[0]?.effectiveFrom ? `${entry.employeeName}의 ${entry.workDate} 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: ${rates[0].effectiveFrom}`
        : `${entry.employeeName}의 시급 이력이 없습니다.` });
    }
    return { ...entry, hourlyRate: rate?.hourlyRate, alerts };
  });
  upsertPerformanceFileDetail({ ...detail, entries });
  return { status: unresolvedEntryCount ? "needs-review" as const : "completed" as const, appliedEntryCount, unresolvedEntryCount };
};

export const returnApprovedPerformanceFileToPending = async (
  input: PerformanceReapprovalFinalizeInput,
  _session: AuthSession,
  context?: { userDataPath?: string; env?: NodeJS.ProcessEnv }
): Promise<BridgeResult<PerformanceReturnToPendingResult>> => {
  const detail = getStoredPerformanceFileDetail(input.fileId);
  if (!detail) return buildReturnToPendingMissingResult();
  if (detail.directoryType !== "approved") return buildReturnToPendingBlockedResult("승인완료 상태의 실적 파일만 승인대기로 되돌릴 수 있습니다.");
  if (!context?.userDataPath) return buildReturnToPendingBlockedResult("되돌릴 파일을 옮길 경로를 확인할 수 없습니다.");
  const database = getSqliteDatabase();
  if (!database || !isSqliteStorageReady()) return buildReturnToPendingBlockedResult("실적 저장소가 연결되지 않았습니다.");
  const ownApprovals = () => listPerformanceApprovalHistory().filter(a => a.fileId === detail.id);
  const fileApprovals = ownApprovals();
  if (fileApprovals.some(isChangeLockedApproval)) return buildReturnToPendingBlockedResult("수당 품의가 승인된 실적은 되돌릴 수 없습니다. 먼저 수당 관리에서 품의 승인을 취소한 뒤 다시 시도하세요.");
  const settingsInput = { userDataPath: context.userDataPath, env: context.env };
  const folders = () => { const s = getStoredAppSettingsSnapshot(settingsInput); return JSON.stringify([s.pendingDir, s.approvedDir]); };
  const originalFolders = folders(), fileBinding = JSON.stringify(detail), approvalBinding = JSON.stringify(fileApprovals);
  let movedSource: Awaited<ReturnType<typeof restoreApprovedPerformanceFileToPending>>;
  try {
    movedSource = await restoreApprovedPerformanceFileToPending({ detail, ...settingsInput, allowMissingSource: true });
  } catch (error) {
    return { ok: false, errorCode: "PERFORMANCE_RETURN_TO_PENDING_FAILED", message: error instanceof Error ? error.message : "원본 파일을 옮기지 못했습니다." };
  }
  const failAndRestore = async (message: string): Promise<BridgeResult<PerformanceReturnToPendingResult>> => {
    try { await rollbackPerformanceReturnSource({ originalPath: detail.filePath, pendingPath: movedSource.pendingFilePath, sourceFileMissing: movedSource.sourceFileMissing }); }
    catch (error) { message += ` 원본 파일 위치 복원을 완료하지 못했습니다. 승인완료·승인대기 폴더를 확인해 주세요. (${error instanceof Error ? error.message : "파일 복원 실패"})`; }
    return { ok: false, errorCode: "PERFORMANCE_RETURN_TO_PENDING_FAILED", message };
  };
  if (getSqliteDatabase() !== database || !isSqliteStorageReady()) return failAndRestore("읽는 동안 데이터 연결이 변경되었습니다. 다시 확인해 주세요.");
  try {
    const currentApprovals = ownApprovals();
    if (currentApprovals.some(isChangeLockedApproval)) return failAndRestore("파일을 옮기는 동안 품의가 승인되어 되돌릴 수 없습니다.");
    if (folders() !== originalFolders || JSON.stringify(getStoredPerformanceFileDetail(detail.id)) !== fileBinding || JSON.stringify(currentApprovals) !== approvalBinding) return failAndRestore("파일을 옮기는 동안 실적·승인 또는 폴더 설정이 변경되었습니다. 다시 확인해 주세요.");
  } catch (error) {
    return failAndRestore(error instanceof Error ? error.message : "복귀 전 승인 상태를 확인하지 못했습니다.");
  }
  let transactionOpen = false;
  let wageReapplication: PerformanceReturnToPendingResult["wageReapplication"];
  try {
    database.exec("BEGIN"); transactionOpen = true;
    if (!moveStoredPerformanceFileToPending({ fileId: detail.id, pendingFilePath: movedSource.pendingFilePath, receivedAt: new Date().toISOString(), status: "pending" })) throw new Error("승인대기로 되돌리는 중 상태 갱신에 실패했습니다.");
    for (const approval of fileApprovals) { deleteAllowanceCalculationByApprovalId(approval.id); deletePerformanceApprovalRecord(approval.id); }
    const pending = getStoredPerformanceFileDetail(detail.id);
    if (!pending || pending.directoryType !== "pending") throw new Error("승인대기 상태를 확인할 수 없습니다.");
    wageReapplication = { ...reapplyReturnedEntryWages(pending), sourceFileMissing: movedSource.sourceFileMissing };
    database.exec("COMMIT"); transactionOpen = false;
  } catch (error) {
    let message = error instanceof Error ? error.message : "승인대기로 되돌리지 못했습니다.";
    if (transactionOpen) {
      try { database.exec("ROLLBACK"); }
      catch (rollbackError) { message += ` 트랜잭션 복원 확인: ${rollbackError instanceof Error ? rollbackError.message : "롤백 실패"}`; }
    }
    return failAndRestore(message);
  }
  const refreshed = getStoredPerformanceFileDetail(detail.id);
  if (!refreshed) return { ok: false, errorCode: "PERFORMANCE_RETURN_TO_PENDING_FAILED", message: "되돌린 후 실적 파일 상태를 다시 불러오지 못했습니다." };
  return { ok: true, data: { ...refreshed, wageReapplication } };
};

export const rejectPerformanceFile = async (
  _input: PerformanceRejectionInput,
  _session: AuthSession
): Promise<BridgeResult<PerformanceApprovalRecord>> => ({
  ok: false,
  errorCode: "PERFORMANCE_REJECT_UNSUPPORTED",
  message: "실적 관리는 미승인/승인 2단계만 지원합니다."
});

export const getPerformanceApprovalHistory = () => ({
  ok: true as const,
  data: listPerformanceApprovalHistory()
});
