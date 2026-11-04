import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  PolicyChangeApplyInput,
  PolicyChangeApplyResult,
  PolicyChangePreviewInput,
  PolicyChangePreviewResult,
} from "../../shared/bridge/contracts";
import {
  type PolicyActorSnapshot,
  getPreviousDayString,
  isValidDateString,
  isValidPolicyKind,
  isValidRuleKey,
} from "../../shared/domain/policy-history";
import {
  addPolicyRevision,
  cancelPolicyRevision,
  correctPolicyRevision,
  getActivePolicyTimeline,
  getRegistryConfigFingerprint,
} from "./policy-history-service";
import { getSqliteDatabase } from "./sqlite-storage-service";

export interface StoredPreviewToken {
  token: string;
  actor: PolicyActorSnapshot;
  input: PolicyChangePreviewInput;
  registryConfigFingerprint: string;
  expiresAt: number;
  pendingFileCount?: number;
  pendingRowCount?: number;
  preservedApprovalCount?: number;
}

const previewTokenStore = new Map<string, StoredPreviewToken>();
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5분 유효

export const clearPreviewTokensForTest = () => {
  previewTokenStore.clear();
};

const resolveDb = (explicitDb?: DatabaseSync): DatabaseSync => {
  const db = explicitDb ?? getSqliteDatabase();
  if (!db) {
    throw new Error("Sqlite database is not initialized");
  }
  return db;
};

// 월 문자열 (YYYY-MM)과 구간 [from, to] 교차 여부
const isMonthIntersectingPeriod = (
  month: string,
  from: string | null,
  to: string | null,
): boolean => {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  if (from && monthEnd < from) return false;
  if (to && monthStart > to) return false;
  return true;
};

export const previewPolicyChange = (
  input: PolicyChangePreviewInput,
  actor: PolicyActorSnapshot,
  db?: DatabaseSync,
): PolicyChangePreviewResult => {
  const database = resolveDb(db);

  // PH-D04: 서비스 레벨 관리자 권한 확인
  if (actor.role !== "admin") {
    const error = new Error("Only administrators can preview policy changes");
    (error as unknown as { code: string }).code = "POLICY_FORBIDDEN";
    throw error;
  }

  // PH-D04: preview는 DB 쓰기를 절대 하지 않는다! (initializePolicyHistory 호출 금지)

  if (!isValidPolicyKind(input.kind)) {
    const error = new Error(`Unsupported policy kind: ${input.kind}`);
    (error as unknown as { code: string }).code = "POLICY_RULE_UNSUPPORTED";
    throw error;
  }

  const currentFingerprint = getRegistryConfigFingerprint(database);
  if (
    input.expectedRegistryConfigFingerprint &&
    input.expectedRegistryConfigFingerprint !== currentFingerprint
  ) {
    const error = new Error("Registry configuration has changed; please refresh and try again");
    (error as unknown as { code: string }).code = "POLICY_CONFLICT";
    throw error;
  }

  const reason = (input.reason ?? "").trim();
  if (reason.length === 0) {
    throw new Error("Reason cannot be empty");
  }
  if (reason.length > 500) {
    throw new Error("Reason exceeds maximum length of 500 characters");
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  let targetFrom: string | null = null;
  let targetTo: string | null = null;

  const timeline = getActivePolicyTimeline(input.kind, database);

  if (input.action === "add") {
    if (!input.ruleKey || !isValidRuleKey(input.kind, input.ruleKey)) {
      const error = new Error(`Unsupported ruleKey: ${input.ruleKey}`);
      (error as unknown as { code: string }).code = "POLICY_RULE_UNSUPPORTED";
      throw error;
    }
    if (!input.effectiveFrom || !isValidDateString(input.effectiveFrom)) {
      throw new Error(`Invalid effectiveFrom date: ${input.effectiveFrom}`);
    }

    targetFrom = input.effectiveFrom;

    // 같은 시작일 중복 검사
    const existing = timeline.find((e) => e.effectiveFrom === input.effectiveFrom);
    if (existing) {
      const error = new Error(`A policy is already scheduled with effectiveFrom: ${input.effectiveFrom}`);
      (error as unknown as { code: string }).code = "POLICY_CONFLICT";
      throw error;
    }

    // 다음 유효 시작일 전날까지로 targetTo 계산
    const nextEntry = timeline.find((e) => e.effectiveFrom && e.effectiveFrom > input.effectiveFrom!);
    targetTo = nextEntry?.effectiveFrom ? getPreviousDayString(nextEntry.effectiveFrom) : null;
  } else if (input.action === "correct") {
    if (!input.targetRevisionId) {
      throw new Error("targetRevisionId is required for correction");
    }
    if (!input.ruleKey || !isValidRuleKey(input.kind, input.ruleKey)) {
      const error = new Error(`Unsupported ruleKey: ${input.ruleKey}`);
      (error as unknown as { code: string }).code = "POLICY_RULE_UNSUPPORTED";
      throw error;
    }
    if (!input.effectiveFrom || !isValidDateString(input.effectiveFrom)) {
      throw new Error(`Invalid effectiveFrom date: ${input.effectiveFrom}`);
    }

    const targetRow = database
      .prepare("SELECT * FROM policy_revisions WHERE id = ?")
      .get(input.targetRevisionId) as Record<string, unknown> | undefined;
    if (!targetRow) {
      const error = new Error("Target revision not found");
      (error as unknown as { code: string }).code = "POLICY_NOT_FOUND";
      throw error;
    }

    // PH-D05: 대상 kind와 요청 kind 일치 검증
    if (String(targetRow.policy_kind) !== input.kind) {
      const error = new Error(`Target policy kind (${targetRow.policy_kind}) does not match request kind (${input.kind})`);
      (error as unknown as { code: string }).code = "POLICY_KIND_MISMATCH";
      throw error;
    }

    if (String(targetRow.origin) === "initial") {
      const error = new Error("Cannot correct initial baseline policy revision");
      (error as unknown as { code: string }).code = "POLICY_IMMUTABLE";
      throw error;
    }
    const usedRow = database
      .prepare("SELECT COUNT(*) AS count FROM policy_events WHERE revision_id = ? AND event_type = 'used'")
      .get(input.targetRevisionId) as { count: number | bigint } | undefined;
    if (Number(usedRow?.count ?? 0) > 0) {
      const error = new Error("Cannot correct a policy that has already been used in approvals");
      (error as unknown as { code: string }).code = "POLICY_IN_USE";
      throw error;
    }
    if (String(targetRow.effective_from) <= today) {
      const error = new Error("Cannot correct active or past policy revision");
      (error as unknown as { code: string }).code = "POLICY_NOT_SCHEDULED";
      throw error;
    }

    // PH-D05: 중복 시작일 검증 (자기 자신 제외)
    const duplicateStart = timeline.find(
      (e) => e.revision.id !== input.targetRevisionId && e.effectiveFrom === input.effectiveFrom
    );
    if (duplicateStart) {
      const error = new Error(`A policy is already scheduled with effectiveFrom: ${input.effectiveFrom}`);
      (error as unknown as { code: string }).code = "POLICY_CONFLICT";
      throw error;
    }

    // PH-D05: 무변경 정정 거부
    if (String(targetRow.rule_key) === input.ruleKey && String(targetRow.effective_from) === input.effectiveFrom) {
      const error = new Error("The requested correction does not change ruleKey or effectiveFrom");
      (error as unknown as { code: string }).code = "POLICY_NO_CHANGE";
      throw error;
    }

    // 영향 범위: 옛 시작일과 새 시작일의 최솟값부터 다음 유효 시작일 전날까지
    const oldFrom = String(targetRow.effective_from);
    const newFrom = input.effectiveFrom;
    targetFrom = oldFrom < newFrom ? oldFrom : newFrom;
    const nextEntry = timeline.find(
      (e) => e.revision.id !== input.targetRevisionId && e.effectiveFrom && e.effectiveFrom > targetFrom!
    );
    targetTo = nextEntry?.effectiveFrom ? getPreviousDayString(nextEntry.effectiveFrom) : null;
  } else if (input.action === "cancel") {
    if (!input.targetRevisionId) {
      throw new Error("targetRevisionId is required for cancellation");
    }
    const targetRow = database
      .prepare("SELECT * FROM policy_revisions WHERE id = ?")
      .get(input.targetRevisionId) as Record<string, unknown> | undefined;
    if (!targetRow) {
      const error = new Error("Target revision not found");
      (error as unknown as { code: string }).code = "POLICY_NOT_FOUND";
      throw error;
    }

    // PH-D05: 대상 kind와 요청 kind 일치 검증
    if (String(targetRow.policy_kind) !== input.kind) {
      const error = new Error(`Target policy kind (${targetRow.policy_kind}) does not match request kind (${input.kind})`);
      (error as unknown as { code: string }).code = "POLICY_KIND_MISMATCH";
      throw error;
    }

    if (String(targetRow.origin) === "initial") {
      const error = new Error("Cannot cancel initial baseline policy revision");
      (error as unknown as { code: string }).code = "POLICY_IMMUTABLE";
      throw error;
    }
    const usedRow = database
      .prepare("SELECT COUNT(*) AS count FROM policy_events WHERE revision_id = ? AND event_type = 'used'")
      .get(input.targetRevisionId) as { count: number | bigint } | undefined;
    if (Number(usedRow?.count ?? 0) > 0) {
      const error = new Error("Cannot cancel a policy that has already been used in approvals");
      (error as unknown as { code: string }).code = "POLICY_IN_USE";
      throw error;
    }
    if (String(targetRow.effective_from) <= today) {
      const error = new Error("Cannot cancel active or past policy revision");
      (error as unknown as { code: string }).code = "POLICY_NOT_SCHEDULED";
      throw error;
    }

    targetFrom = String(targetRow.effective_from);
    const nextEntry = timeline.find(
      (e) => e.revision.id !== input.targetRevisionId && e.effectiveFrom && e.effectiveFrom > targetFrom!
    );
    targetTo = nextEntry?.effectiveFrom ? getPreviousDayString(nextEntry.effectiveFrom) : null;
  } else {
    throw new Error(`Unknown action: ${input.action}`);
  }

  // 대기 파일 및 실제 보관 대기 행 집계 (DB 변경 0)
  const pendingFiles = database
    .prepare("SELECT id, schedule_month, entry_count FROM performance_files WHERE status = 'pending'")
    .all() as Array<{ id: string; schedule_month: string | null; entry_count: number }>;

  const pendingRows = database
    .prepare(
      `SELECT pe.id, pe.performance_file_id AS file_id, pe.work_date, pf.schedule_month
       FROM performance_entries pe
       JOIN performance_files pf ON pf.id = pe.performance_file_id
       WHERE pf.status = 'pending'`,
    )
    .all() as Array<{ id: string; file_id: string; work_date: string; schedule_month: string | null }>;

  const affectedFilesSet = new Set<string>();
  let affectedRowCount = 0;

  for (const row of pendingRows) {
    const d = row.work_date;
    const fromOk = targetFrom === null || d >= targetFrom;
    const toOk = targetTo === null || d <= targetTo;
    if (fromOk && toOk) {
      affectedFilesSet.add(row.file_id);
      affectedRowCount++;
    }
  }

  // zero-entry 파일 및 entries 행이 아직 없는 파일도 schedule_month가 구간과 교차하면 대상에 포함
  for (const file of pendingFiles) {
    if (file.schedule_month && isMonthIntersectingPeriod(file.schedule_month, targetFrom, targetTo)) {
      affectedFilesSet.add(file.id);
      if (pendingRows.length === 0) {
        affectedRowCount += Number(file.entry_count || 0);
      }
    }
  }

  const pendingFileCount = affectedFilesSet.size;
  const pendingRowCount = affectedRowCount;

  // 보존되는 승인 건수 (기존 승인 결과 보존 원칙)
  const approvalCountRow = database
    .prepare("SELECT COUNT(*) AS count FROM performance_approvals")
    .get() as { count: number | bigint } | undefined;
  const preservedApprovalCount = Number(approvalCountRow?.count ?? 0);

  // 5분 토큰 생성 및 보관
  const token = `pol_tok_${crypto.randomUUID()}`;
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  previewTokenStore.set(token, {
    token,
    actor,
    input,
    registryConfigFingerprint: currentFingerprint,
    expiresAt: expiresAtMs,
    pendingFileCount,
    pendingRowCount,
    preservedApprovalCount,
  });

  return {
    previewToken: token,
    expiresAt: expiresAtIso,
    action: input.action,
    kind: input.kind,
    ruleKey: input.ruleKey,
    effectiveFrom: input.effectiveFrom ?? null,
    affectedPendingFileCount: pendingFileCount,
    affectedPendingRowCount: pendingRowCount,
    preservedApprovedRowCount: preservedApprovalCount,
    impactSummary: `재확인 대상 파일 ${pendingFileCount}건 / 현재 저장된 대기 행 ${pendingRowCount}건 (기존 승인 ${preservedApprovalCount}건 보존)`,
    registryConfigFingerprint: currentFingerprint,
  };
};

export const applyPolicyChange = (
  input: PolicyChangeApplyInput,
  actor: PolicyActorSnapshot,
  db?: DatabaseSync,
): PolicyChangeApplyResult => {
  const database = resolveDb(db);

  // PH-D04: 서비스 레벨 관리자 권한 확인
  if (actor.role !== "admin") {
    const error = new Error("Only administrators can apply policy changes");
    (error as unknown as { code: string }).code = "POLICY_FORBIDDEN";
    throw error;
  }

  const stored = previewTokenStore.get(input.previewToken);
  if (!stored) {
    const error = new Error("Invalid or already consumed preview token");
    (error as unknown as { code: string }).code = "POLICY_PREVIEW_EXPIRED";
    throw error;
  }

  if (Date.now() > stored.expiresAt) {
    previewTokenStore.delete(input.previewToken);
    const error = new Error("Preview token has expired; please preview again");
    (error as unknown as { code: string }).code = "POLICY_PREVIEW_EXPIRED";
    throw error;
  }

  if (stored.actor.userId !== actor.userId) {
    const error = new Error("Actor mismatch for preview token");
    (error as unknown as { code: string }).code = "POLICY_ACTOR_MISMATCH";
    throw error;
  }

  const currentFingerprint = getRegistryConfigFingerprint(database);
  if (currentFingerprint !== stored.registryConfigFingerprint) {
    previewTokenStore.delete(input.previewToken);
    const error = new Error("Policy registry configuration changed since preview; please preview again");
    (error as unknown as { code: string }).code = "POLICY_CONFLICT";
    throw error;
  }

  // 트랜잭션 내에서 실행
  database.exec("BEGIN IMMEDIATE");
  let appliedRevisionId: string | undefined;
  let appliedVersionNumber: number | undefined;

  try {
    // PH-D04: 트랜잭션 내부에서 최신 승인 건수 및 레지스트리 재검증
    const currentApprovalCountRow = database
      .prepare("SELECT COUNT(*) AS count FROM performance_approvals")
      .get() as { count: number | bigint } | undefined;
    const currentApprovalCount = Number(currentApprovalCountRow?.count ?? 0);
    if (stored.preservedApprovalCount !== undefined && currentApprovalCount !== stored.preservedApprovalCount) {
      previewTokenStore.delete(input.previewToken);
      const error = new Error("Approvals have changed since preview; please preview again");
      (error as unknown as { code: string }).code = "POLICY_CONFLICT";
      throw error;
    }

    const txFingerprint = getRegistryConfigFingerprint(database);
    if (txFingerprint !== stored.registryConfigFingerprint) {
      previewTokenStore.delete(input.previewToken);
      const error = new Error("Policy registry changed during transaction; please preview again");
      (error as unknown as { code: string }).code = "POLICY_CONFLICT";
      throw error;
    }

    const originalInput = stored.input;
    if (originalInput.action === "add") {
      const rev = addPolicyRevision(
        {
          kind: originalInput.kind,
          ruleKey: originalInput.ruleKey!,
          effectiveFrom: originalInput.effectiveFrom!,
          reason: originalInput.reason,
          actor,
        },
        database,
      );
      appliedRevisionId = rev.id;
      appliedVersionNumber = rev.versionNumber;
    } else if (originalInput.action === "correct") {
      const rev = correctPolicyRevision(
        {
          kind: originalInput.kind,
          targetRevisionId: originalInput.targetRevisionId!,
          ruleKey: originalInput.ruleKey!,
          effectiveFrom: originalInput.effectiveFrom!,
          reason: originalInput.reason,
          actor,
        },
        database,
      );
      appliedRevisionId = rev.id;
      appliedVersionNumber = rev.versionNumber;
    } else if (originalInput.action === "cancel") {
      appliedRevisionId = originalInput.targetRevisionId!;
      const targetRow = database
        .prepare("SELECT version_number FROM policy_revisions WHERE id = ?")
        .get(appliedRevisionId) as { version_number: number | bigint } | undefined;
      appliedVersionNumber = targetRow ? Number(targetRow.version_number) : 0;
      cancelPolicyRevision(
        {
          kind: originalInput.kind,
          targetRevisionId: originalInput.targetRevisionId!,
          reason: originalInput.reason,
          actor,
        },
        database,
      );
    }

    database.exec("COMMIT");
    // 토큰 소비
    previewTokenStore.delete(input.previewToken);

    return {
      success: true,
      action: originalInput.action,
      kind: originalInput.kind,
      revisionId: appliedRevisionId ?? "",
      versionNumber: appliedVersionNumber ?? 0,
      affectedPendingFileCount: stored.pendingFileCount ?? 0,
      message: `정책 ${originalInput.action === "add" ? "신설" : originalInput.action === "correct" ? "정정" : "취소"}이 정상적으로 확정되었습니다.`,
    };
  } catch (err) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // rollback failure ignored
    }
    throw err;
  }
};
