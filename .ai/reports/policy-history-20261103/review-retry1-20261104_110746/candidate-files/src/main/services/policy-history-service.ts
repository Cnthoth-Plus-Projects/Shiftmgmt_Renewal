import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  type ActivePolicyProjection,
  type PolicyActorSnapshot,
  type PolicyApplicationBinding,
  type PolicyEventRecord,
  type PolicyEventType,
  type PolicyKind,
  type PolicyOrigin,
  type PolicyRevisionRecord,
  type PolicyRuleKey,
  isValidDateString,
  isValidRuleKey,
  resolveActivePolicies,
  selectPolicyForWorkDate as domainSelectPolicyForWorkDate,
} from "../../shared/domain/policy-history";
import { getSqliteDatabase } from "./sqlite-storage-service";

export const IMPLEMENTATION_VERSION = "4.0.0";

const POLICY_CRITERIA_MAP: Record<PolicyRuleKey, { ruleKey: PolicyRuleKey; description: string }> = {
  "substitute-legacy": {
    ruleKey: "substitute-legacy",
    description: "종전 기준 (Pool만 제외, 다른 근무유형 인정)",
  },
  "substitute-team-type-v1": {
    ruleKey: "substitute-team-type-v1",
    description: "근무유형 기준 (Pool 및 주간고정조 제외, 교대조 간 대체만 인정)",
  },
  "changed-worker-legacy": {
    ruleKey: "changed-worker-legacy",
    description: "종전 방식 (원근무자 우선, 변경전 인정, Pool·BP 제외)",
  },
  "changed-worker-after-v1": {
    ruleKey: "changed-worker-after-v1",
    description: "현장 기준 (실제근무자 우선, 변경후 대체근무자 인정, Pool·BP 제외)",
  },
};

export const getPolicyCriteriaJson = (ruleKey: PolicyRuleKey): string => {
  const criteria = POLICY_CRITERIA_MAP[ruleKey];
  if (!criteria) {
    throw new Error(`Unsupported policy ruleKey: ${ruleKey}`);
  }
  return JSON.stringify(criteria);
};

const resolveDb = (explicitDb?: DatabaseSync): DatabaseSync => {
  const db = explicitDb ?? getSqliteDatabase();
  if (!db) {
    throw new Error("Sqlite database is not initialized");
  }
  return db;
};

export const isPolicyHistoryInitialized = (db?: DatabaseSync): boolean => {
  const database = resolveDb(db);
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM policy_revisions")
    .get() as { count: number | bigint } | undefined;
  return Number(row?.count ?? 0) > 0;
};

export interface PolicyHistoryBootstrapOptions {
  legacySubstituteDate?: string | null;
  legacyChangedDate?: string | null;
  actor?: PolicyActorSnapshot;
}

export const initializePolicyHistory = (
  db?: DatabaseSync,
  options?: PolicyHistoryBootstrapOptions,
): void => {
  const database = resolveDb(db);

  if (isPolicyHistoryInitialized(database)) {
    return;
  }

  const nowIso = new Date().toISOString();
  const actor: PolicyActorSnapshot = options?.actor ?? {
    userId: "system-bootstrap",
    loginId: "system",
    displayName: "초기전환 시스템",
    role: "admin",
  };

  // raw app_setting_entries 읽기 (옵션이 명시되지 않은 경우)
  let substituteDate = options?.legacySubstituteDate;
  let changedDate = options?.legacyChangedDate;

  if (substituteDate === undefined) {
    const row = database
      .prepare("SELECT value FROM app_setting_entries WHERE setting_key = ?")
      .get("substitute_allowance_policy_effective_from") as { value: string } | undefined;
    substituteDate = row?.value ? row.value.trim() : null;
  }
  if (changedDate === undefined) {
    const row = database
      .prepare("SELECT value FROM app_setting_entries WHERE setting_key = ?")
      .get("changed_slot_priority_effective_from") as { value: string } | undefined;
    changedDate = row?.value ? row.value.trim() : null;
  }

  const insertRevision = (revision: PolicyRevisionRecord) => {
    database
      .prepare(
        `
        INSERT INTO policy_revisions (
          id, policy_kind, version_number, rule_key, criteria_json,
          implementation_version, effective_from, origin,
          actor_user_id, actor_login_id, actor_display_name, actor_role,
          created_at, reason
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `,
      )
      .run(
        revision.id,
        revision.policyKind,
        revision.versionNumber,
        revision.ruleKey,
        revision.criteriaJson,
        revision.implementationVersion,
        revision.effectiveFrom,
        revision.origin,
        revision.actor.userId,
        revision.actor.loginId,
        revision.actor.displayName,
        revision.actor.role,
        revision.createdAt,
        revision.reason,
      );
  };

  const insertEvent = (event: PolicyEventRecord) => {
    database
      .prepare(
        `
        INSERT INTO policy_events (
          id, policy_kind, revision_id, event_type, replacement_revision_id,
          before_json, after_json,
          actor_user_id, actor_login_id, actor_display_name, actor_role,
          occurred_at, related_approval_id
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `,
      )
      .run(
        event.id,
        event.policyKind,
        event.revisionId,
        event.eventType,
        event.replacementRevisionId ?? null,
        event.beforeJson ?? null,
        event.afterJson ?? null,
        event.actor.userId,
        event.actor.loginId,
        event.actor.displayName,
        event.actor.role,
        event.occurredAt,
        event.relatedApprovalId ?? null,
      );
  };

  // 1. substitute-eligibility
  const subV1: PolicyRevisionRecord = {
    id: `rev-sub-v1-${crypto.randomUUID()}`,
    policyKind: "substitute-eligibility",
    versionNumber: 1,
    ruleKey: "substitute-legacy",
    criteriaJson: getPolicyCriteriaJson("substitute-legacy"),
    implementationVersion: IMPLEMENTATION_VERSION,
    effectiveFrom: null,
    origin: "initial",
    actor,
    createdAt: nowIso,
    reason: "시스템 초기 종전 기준 (도입 이전)",
  };
  insertRevision(subV1);
  insertEvent({
    id: `evt-${crypto.randomUUID()}`,
    policyKind: "substitute-eligibility",
    revisionId: subV1.id,
    eventType: "initialized",
    afterJson: JSON.stringify(subV1),
    actor,
    occurredAt: nowIso,
  });

  if (substituteDate && isValidDateString(substituteDate)) {
    const subV2: PolicyRevisionRecord = {
      id: `rev-sub-v2-${crypto.randomUUID()}`,
      policyKind: "substitute-eligibility",
      versionNumber: 2,
      ruleKey: "substitute-team-type-v1",
      criteriaJson: getPolicyCriteriaJson("substitute-team-type-v1"),
      implementationVersion: IMPLEMENTATION_VERSION,
      effectiveFrom: substituteDate,
      origin: "initial",
      actor,
      createdAt: nowIso,
      reason: "시스템 초기 운영 설정 적용 기준",
    };
    insertRevision(subV2);
    insertEvent({
      id: `evt-${crypto.randomUUID()}`,
      policyKind: "substitute-eligibility",
      revisionId: subV2.id,
      eventType: "initialized",
      afterJson: JSON.stringify(subV2),
      actor,
      occurredAt: nowIso,
    });
  }

  // 2. changed-worker-priority
  const chgV1: PolicyRevisionRecord = {
    id: `rev-chg-v1-${crypto.randomUUID()}`,
    policyKind: "changed-worker-priority",
    versionNumber: 1,
    ruleKey: "changed-worker-legacy",
    criteriaJson: getPolicyCriteriaJson("changed-worker-legacy"),
    implementationVersion: IMPLEMENTATION_VERSION,
    effectiveFrom: null,
    origin: "initial",
    actor,
    createdAt: nowIso,
    reason: "시스템 초기 종전 기준 (도입 이전)",
  };
  insertRevision(chgV1);
  insertEvent({
    id: `evt-${crypto.randomUUID()}`,
    policyKind: "changed-worker-priority",
    revisionId: chgV1.id,
    eventType: "initialized",
    afterJson: JSON.stringify(chgV1),
    actor,
    occurredAt: nowIso,
  });

  if (changedDate && isValidDateString(changedDate)) {
    const chgV2: PolicyRevisionRecord = {
      id: `rev-chg-v2-${crypto.randomUUID()}`,
      policyKind: "changed-worker-priority",
      versionNumber: 2,
      ruleKey: "changed-worker-after-v1",
      criteriaJson: getPolicyCriteriaJson("changed-worker-after-v1"),
      implementationVersion: IMPLEMENTATION_VERSION,
      effectiveFrom: changedDate,
      origin: "initial",
      actor,
      createdAt: nowIso,
      reason: "시스템 초기 운영 설정 적용 기준",
    };
    insertRevision(chgV2);
    insertEvent({
      id: `evt-${crypto.randomUUID()}`,
      policyKind: "changed-worker-priority",
      revisionId: chgV2.id,
      eventType: "initialized",
      afterJson: JSON.stringify(chgV2),
      actor,
      occurredAt: nowIso,
    });
  }
};

export const mapRowToRevision = (row: Record<string, unknown>): PolicyRevisionRecord => ({
  id: String(row.id),
  policyKind: row.policy_kind as PolicyKind,
  versionNumber: Number(row.version_number),
  ruleKey: row.rule_key as PolicyRuleKey,
  criteriaJson: String(row.criteria_json),
  implementationVersion: String(row.implementation_version),
  effectiveFrom: row.effective_from ? String(row.effective_from) : null,
  origin: row.origin as PolicyOrigin,
  actor: {
    userId: String(row.actor_user_id ?? "unknown"),
    loginId: String(row.actor_login_id ?? "unknown"),
    displayName: String(row.actor_display_name ?? "관리자"),
    role: String(row.actor_role ?? "admin"),
  },
  createdAt: String(row.created_at),
  reason: String(row.reason),
});

export const mapRowToEvent = (row: Record<string, unknown>): PolicyEventRecord => ({
  id: String(row.id),
  policyKind: row.policy_kind as PolicyKind,
  revisionId: String(row.revision_id),
  eventType: row.event_type as PolicyEventType,
  replacementRevisionId: row.replacement_revision_id ? String(row.replacement_revision_id) : null,
  beforeJson: row.before_json ? String(row.before_json) : null,
  afterJson: row.after_json ? String(row.after_json) : null,
  actor: {
    userId: String(row.actor_user_id ?? "unknown"),
    loginId: String(row.actor_login_id ?? "unknown"),
    displayName: String(row.actor_display_name ?? "관리자"),
    role: String(row.actor_role ?? "admin"),
  },
  occurredAt: String(row.occurred_at),
  relatedApprovalId: row.related_approval_id ? String(row.related_approval_id) : null,
});

export const getActivePolicyTimeline = (
  kind: PolicyKind,
  db?: DatabaseSync,
  referenceDate?: string,
): ActivePolicyProjection[] => {
  const database = resolveDb(db);

  if (!isPolicyHistoryInitialized(database)) {
    try {
      initializePolicyHistory(database);
    } catch {
      // 읽기 전용 DB 등 초기화 불가 시에만 raw 설정 기반 가상 투영 사용
    }
  }

  if (isPolicyHistoryInitialized(database)) {
    const revisions = (
      database
        .prepare("SELECT * FROM policy_revisions WHERE policy_kind = ? ORDER BY version_number ASC")
        .all(kind) as Array<Record<string, unknown>>
    ).map(mapRowToRevision);

    const events = (
      database
        .prepare("SELECT * FROM policy_events WHERE policy_kind = ? ORDER BY occurred_at ASC")
        .all(kind) as Array<Record<string, unknown>>
    ).map(mapRowToEvent);

    return resolveActivePolicies(revisions, events, referenceDate);
  }

  const settingKey =
      kind === "substitute-eligibility"
        ? "substitute_allowance_policy_effective_from"
        : "changed_slot_priority_effective_from";
    const row = database
      .prepare("SELECT value FROM app_setting_entries WHERE setting_key = ?")
      .get(settingKey) as { value: string } | undefined;
    const effectiveDate = row?.value ? row.value.trim() : null;

    const v1Rule = kind === "substitute-eligibility" ? "substitute-legacy" : "changed-worker-legacy";
    const v2Rule = kind === "substitute-eligibility" ? "substitute-team-type-v1" : "changed-worker-after-v1";

    const v1Rev: PolicyRevisionRecord = {
      id: `rev-${kind}-v1-legacy`,
      policyKind: kind,
      versionNumber: 1,
      ruleKey: v1Rule,
      criteriaJson: getPolicyCriteriaJson(v1Rule),
      implementationVersion: IMPLEMENTATION_VERSION,
      effectiveFrom: null,
      origin: "initial",
      actor: { userId: "system", loginId: "system", displayName: "시스템", role: "admin" },
      createdAt: "2026-01-01T00:00:00.000Z",
      reason: "시스템 초기 종전 기준 (도입 이전)"
    };

    const fallbackRevisions: PolicyRevisionRecord[] = [v1Rev];
    if (effectiveDate && isValidDateString(effectiveDate)) {
      fallbackRevisions.push({
        id: `rev-${kind}-v2-legacy`,
        policyKind: kind,
        versionNumber: 2,
        ruleKey: v2Rule,
        criteriaJson: getPolicyCriteriaJson(v2Rule),
        implementationVersion: IMPLEMENTATION_VERSION,
        effectiveFrom: effectiveDate,
        origin: "initial",
        actor: { userId: "system", loginId: "system", displayName: "시스템", role: "admin" },
        createdAt: "2026-01-01T00:00:00.000Z",
        reason: "시스템 초기 설정 기준"
      });
    }

    return resolveActivePolicies(fallbackRevisions, [], referenceDate);
};

export const getActivePolicySummary = (
  kind: PolicyKind,
  db?: DatabaseSync,
  referenceDate?: string,
): {
  timeline: ActivePolicyProjection[];
  current: ActivePolicyProjection | null;
  next: ActivePolicyProjection | null;
} => {
  const timeline = getActivePolicyTimeline(kind, db, referenceDate);
  const current = timeline.find((p) => p.status === "active") ?? null;
  const next = timeline.find((p) => p.status === "scheduled") ?? null;
  return { timeline, current, next };
};

export const getRegistryConfigFingerprint = (db?: DatabaseSync): string => {
  const database = resolveDb(db);
  const hash = crypto.createHash("sha256");

  const subTimeline = getActivePolicyTimeline("substitute-eligibility", database);
  const chgTimeline = getActivePolicyTimeline("changed-worker-priority", database);

  hash.update("substitute-eligibility:");
  for (const entry of subTimeline) {
    hash.update(`${entry.revision.versionNumber}:${entry.revision.ruleKey}:${entry.effectiveFrom ?? "null"}:${entry.effectiveTo ?? "null"}:`);
  }
  hash.update("|changed-worker-priority:");
  for (const entry of chgTimeline) {
    hash.update(`${entry.revision.versionNumber}:${entry.revision.ruleKey}:${entry.effectiveFrom ?? "null"}:${entry.effectiveTo ?? "null"}:`);
  }

  return hash.digest("hex");
};

export const selectPolicyForWorkDate = (
  kind: PolicyKind,
  workDate: string,
  db?: DatabaseSync,
): ActivePolicyProjection | null => {
  const timeline = getActivePolicyTimeline(kind, db);
  return domainSelectPolicyForWorkDate(timeline, workDate);
};

export interface ListPolicyHistoryInput {
  kind: PolicyKind;
  view?: "revisions" | "events";
  revisionId?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPolicyHistoryResult {
  kind: PolicyKind;
  currentRevision: ActivePolicyProjection | null;
  nextScheduledRevision: ActivePolicyProjection | null;
  timeline: ActivePolicyProjection[];
  revisions: PolicyRevisionRecord[];
  events: PolicyEventRecord[];
  totalCount: number;
  summary: {
    current: ActivePolicyProjection | null;
    next: ActivePolicyProjection | null;
  };
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  registryConfigFingerprint: string;
}

export const listPolicyHistory = (
  input: ListPolicyHistoryInput,
  db?: DatabaseSync,
): ListPolicyHistoryResult => {
  const database = resolveDb(db);

  if (!isPolicyHistoryInitialized(database)) {
    initializePolicyHistory(database);
  }

  const { current, next, timeline } = getActivePolicySummary(input.kind, database);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const registryConfigFingerprint = getRegistryConfigFingerprint(database);

  if (input.view === "events") {
    let whereClause = "WHERE policy_kind = ?";
    const params: Array<string | number> = [input.kind];

    if (input.revisionId) {
      whereClause += " AND revision_id = ?";
      params.push(input.revisionId);
    }

    const totalRow = database
      .prepare(`SELECT COUNT(*) AS count FROM policy_events ${whereClause}`)
      .get(...params) as { count: number | bigint } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = database
      .prepare(
        `
        SELECT *
        FROM policy_events
        ${whereClause}
        ORDER BY occurred_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    const items: PolicyEventRecord[] = rows.map(mapRowToEvent);

    return {
      kind: input.kind,
      currentRevision: current,
      nextScheduledRevision: next,
      timeline,
      revisions: [],
      events: items,
      totalCount: total,
      summary: { current, next },
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      registryConfigFingerprint,
    };
  }

  // view === "revisions" (기본)
  const usedCounts = database
    .prepare(
      `
      SELECT revision_id, COUNT(*) AS used_count
      FROM policy_events
      WHERE policy_kind = ? AND event_type = 'used'
      GROUP BY revision_id
    `,
    )
    .all(input.kind) as Array<{ revision_id: string; used_count: number | bigint }>;
  const usedCountMap = new Map(usedCounts.map((u) => [u.revision_id, Number(u.used_count)]));

  const invalidEvents = database
    .prepare(
      `
      SELECT revision_id, event_type
      FROM policy_events
      WHERE policy_kind = ? AND event_type IN ('corrected', 'cancelled')
    `,
    )
    .all(input.kind) as Array<{ revision_id: string; event_type: string }>;
  const invalidStatusMap = new Map(invalidEvents.map((e) => [e.revision_id, e.event_type]));

  const totalRow = database
    .prepare("SELECT COUNT(*) AS count FROM policy_revisions WHERE policy_kind = ?")
    .get(input.kind) as { count: number | bigint } | undefined;
  const total = Number(totalRow?.count ?? 0);

  const rows = database
    .prepare(
      `
      SELECT *
      FROM policy_revisions
      WHERE policy_kind = ?
      ORDER BY version_number DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(input.kind, pageSize, offset) as Array<Record<string, unknown>>;

  const timelineMap = new Map(timeline.map((p) => [p.revision.id, p]));

  const items = rows.map((row) => {
    const rev = mapRowToRevision(row);
    const usedCount = usedCountMap.get(rev.id) ?? 0;
    const invalidType = invalidStatusMap.get(rev.id);
    const proj = timelineMap.get(rev.id);

    let status: "active" | "scheduled" | "retired" | "corrected" | "cancelled" = "retired";
    if (invalidType === "corrected") {
      status = "corrected";
    } else if (invalidType === "cancelled") {
      status = "cancelled";
    } else if (proj) {
      status = proj.status;
    }

    return {
      ...rev,
      effectiveTo: proj?.effectiveTo ?? null,
      usedCount,
      status,
    };
  });

  return {
    kind: input.kind,
    currentRevision: current,
    nextScheduledRevision: next,
    timeline,
    revisions: items,
    events: [],
    totalCount: total,
    summary: { current, next },
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
    registryConfigFingerprint,
  };
};

export interface AddPolicyRevisionInput {
  kind: PolicyKind;
  ruleKey: PolicyRuleKey;
  effectiveFrom: string;
  reason: string;
  actor: PolicyActorSnapshot;
  nowIso?: string;
}

export const addPolicyRevision = (
  input: AddPolicyRevisionInput,
  db?: DatabaseSync,
): PolicyRevisionRecord => {
  const database = resolveDb(db);

  if (!isPolicyHistoryInitialized(database)) {
    initializePolicyHistory(database);
  }

  if (input.actor.role !== "admin") {
    const error = new Error("Only administrators can manage policy revisions");
    (error as unknown as { code: string }).code = "POLICY_FORBIDDEN";
    throw error;
  }


  if (!isValidDateString(input.effectiveFrom)) {
    throw new Error(`Invalid effectiveFrom date string: ${input.effectiveFrom}`);
  }

  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("Reason cannot be empty");
  }
  if (reason.length > 500) {
    throw new Error("Reason exceeds maximum length of 500 characters");
  }

  // ruleKey 지원 여부 확인
  getPolicyCriteriaJson(input.ruleKey);

  const timeline = getActivePolicyTimeline(input.kind, database);

  // 같은 시작일 중복 검사
  const existingWithSameStart = timeline.find(
    (e) => e.effectiveFrom === input.effectiveFrom,
  );
  if (existingWithSameStart) {
    const error = new Error(`A policy is already scheduled with effectiveFrom: ${input.effectiveFrom}`);
    (error as unknown as { code: string }).code = "POLICY_CONFLICT";
    throw error;
  }

  // 동일한 ruleKey로 무의미한 중복 변경 거부
  const activeAtEffectiveFrom = domainSelectPolicyForWorkDate(timeline, input.effectiveFrom);
  if (activeAtEffectiveFrom && activeAtEffectiveFrom.revision.ruleKey === input.ruleKey) {
    const error = new Error("The requested ruleKey is already effective at the specified date");
    (error as unknown as { code: string }).code = "POLICY_NO_CHANGE";
    throw error;
  }

  const maxRow = database
    .prepare("SELECT MAX(version_number) AS max_v FROM policy_revisions WHERE policy_kind = ?")
    .get(input.kind) as { max_v: number | bigint | null } | undefined;
  const nextVersionNumber = Number(maxRow?.max_v ?? 0) + 1;

  const now = input.nowIso ?? new Date().toISOString();
  const revision: PolicyRevisionRecord = {
    id: `rev-${crypto.randomUUID()}`,
    policyKind: input.kind,
    versionNumber: nextVersionNumber,
    ruleKey: input.ruleKey,
    criteriaJson: getPolicyCriteriaJson(input.ruleKey),
    implementationVersion: IMPLEMENTATION_VERSION,
    effectiveFrom: input.effectiveFrom,
    origin: "registered",
    actor: input.actor,
    createdAt: now,
    reason,
  };

  database
    .prepare(
      `
      INSERT INTO policy_revisions (
        id, policy_kind, version_number, rule_key, criteria_json,
        implementation_version, effective_from, origin,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        created_at, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      revision.id,
      revision.policyKind,
      revision.versionNumber,
      revision.ruleKey,
      revision.criteriaJson,
      revision.implementationVersion,
      revision.effectiveFrom,
      revision.origin,
      revision.actor.userId,
      revision.actor.loginId,
      revision.actor.displayName,
      revision.actor.role,
      revision.createdAt,
      revision.reason,
    );

  database
    .prepare(
      `
      INSERT INTO policy_events (
        id, policy_kind, revision_id, event_type, replacement_revision_id,
        before_json, after_json,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        occurred_at, related_approval_id
      ) VALUES (?, ?, ?, 'created', NULL, NULL, ?, ?, ?, ?, ?, ?, NULL)
    `,
    )
    .run(
      `evt-${crypto.randomUUID()}`,
      revision.policyKind,
      revision.id,
      JSON.stringify(revision),
      revision.actor.userId,
      revision.actor.loginId,
      revision.actor.displayName,
      revision.actor.role,
      now,
    );

  return revision;
};

export interface CorrectPolicyRevisionInput {
  targetRevisionId: string;
  kind?: PolicyKind;
  ruleKey: PolicyRuleKey;
  effectiveFrom: string;
  reason: string;
  actor: PolicyActorSnapshot;
  nowIso?: string;
  todaySeoul?: string;
}

export const correctPolicyRevision = (
  input: CorrectPolicyRevisionInput,
  db?: DatabaseSync,
): PolicyRevisionRecord => {
  const database = resolveDb(db);

  if (!isPolicyHistoryInitialized(database)) {
    initializePolicyHistory(database);
  }

  if (input.actor.role !== "admin") {
    const error = new Error("Only administrators can manage policy revisions");
    (error as unknown as { code: string }).code = "POLICY_FORBIDDEN";
    throw error;
  }



  const targetRow = database
    .prepare("SELECT * FROM policy_revisions WHERE id = ?")
    .get(input.targetRevisionId) as Record<string, unknown> | undefined;

  if (!targetRow) {
    const error = new Error(`Target policy revision not found: ${input.targetRevisionId}`);
    (error as unknown as { code: string }).code = "POLICY_NOT_FOUND";
    throw error;
  }

  const target = mapRowToRevision(targetRow);

  if (input.kind && target.policyKind !== input.kind) {
    const error = new Error(`Target policy kind (${target.policyKind}) does not match request kind (${input.kind})`);
    (error as unknown as { code: string }).code = "POLICY_KIND_MISMATCH";
    throw error;
  }

  if (!isValidRuleKey(target.policyKind, input.ruleKey)) {
    const error = new Error(`Unsupported ruleKey (${input.ruleKey}) for policy kind (${target.policyKind})`);
    (error as unknown as { code: string }).code = "POLICY_RULE_UNSUPPORTED";
    throw error;
  }

  if (target.ruleKey === input.ruleKey && target.effectiveFrom === input.effectiveFrom) {
    const error = new Error("The requested correction does not change ruleKey or effectiveFrom");
    (error as unknown as { code: string }).code = "POLICY_NO_CHANGE";
    throw error;
  }

  const timeline = getActivePolicyTimeline(target.policyKind, database);
  const duplicateStart = timeline.find(
    (e) => e.revision.id !== target.id && e.effectiveFrom === input.effectiveFrom
  );
  if (duplicateStart) {
    const error = new Error(`A policy is already scheduled with effectiveFrom: ${input.effectiveFrom}`);
    (error as unknown as { code: string }).code = "POLICY_CONFLICT";
    throw error;
  }

  if (target.origin === "initial") {
    const error = new Error("Cannot correct initial baseline policy revision");
    (error as unknown as { code: string }).code = "POLICY_IMMUTABLE";
    throw error;
  }

  // 이미 used 되었는지 검사
  const usedRow = database
    .prepare(
      "SELECT COUNT(*) AS count FROM policy_events WHERE revision_id = ? AND event_type = 'used'",
    )
    .get(target.id) as { count: number | bigint } | undefined;
  if (Number(usedRow?.count ?? 0) > 0) {
    const error = new Error("Cannot correct a policy that has already been used in approvals");
    (error as unknown as { code: string }).code = "POLICY_IN_USE";
    throw error;
  }

  // 이미 corrected 또는 cancelled 되었는지 검사
  const invalidRow = database
    .prepare(
      "SELECT event_type FROM policy_events WHERE revision_id = ? AND event_type IN ('corrected', 'cancelled')",
    )
    .get(target.id) as { event_type: string } | undefined;
  if (invalidRow) {
    const error = new Error(`Target policy is already ${invalidRow.event_type}`);
    (error as unknown as { code: string }).code = "POLICY_ALREADY_INVALIDATED";
    throw error;
  }

  // 오늘보다 미래여야 함
  const today = input.todaySeoul ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  if (!target.effectiveFrom || target.effectiveFrom <= today) {
    const error = new Error("Cannot correct past or currently active policy revision; must be scheduled in the future");
    (error as unknown as { code: string }).code = "POLICY_NOT_SCHEDULED";
    throw error;
  }

  if (!isValidDateString(input.effectiveFrom)) {
    throw new Error(`Invalid effectiveFrom date string: ${input.effectiveFrom}`);
  }
  if (input.effectiveFrom <= today) {
    const error = new Error("New effectiveFrom must be in the future");
    (error as unknown as { code: string }).code = "POLICY_NOT_SCHEDULED";
    throw error;
  }

  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("Reason cannot be empty");
  }

  // ruleKey 지원 여부 확인
  getPolicyCriteriaJson(input.ruleKey);

  const maxRow = database
    .prepare("SELECT MAX(version_number) AS max_v FROM policy_revisions WHERE policy_kind = ?")
    .get(target.policyKind) as { max_v: number | bigint | null } | undefined;
  const nextVersionNumber = Number(maxRow?.max_v ?? 0) + 1;

  const now = input.nowIso ?? new Date().toISOString();
  const newRevision: PolicyRevisionRecord = {
    id: `rev-${crypto.randomUUID()}`,
    policyKind: target.policyKind,
    versionNumber: nextVersionNumber,
    ruleKey: input.ruleKey,
    criteriaJson: getPolicyCriteriaJson(input.ruleKey),
    implementationVersion: IMPLEMENTATION_VERSION,
    effectiveFrom: input.effectiveFrom,
    origin: "correction",
    actor: input.actor,
    createdAt: now,
    reason,
  };

  database
    .prepare(
      `
      INSERT INTO policy_events (
        id, policy_kind, revision_id, event_type, replacement_revision_id,
        before_json, after_json,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        occurred_at, related_approval_id
      ) VALUES (?, ?, ?, 'corrected', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `,
    )
    .run(
      `evt-${crypto.randomUUID()}`,
      target.policyKind,
      target.id,
      newRevision.id,
      JSON.stringify(target),
      JSON.stringify(newRevision),
      input.actor.userId,
      input.actor.loginId,
      input.actor.displayName,
      input.actor.role,
      now,
    );

  database
    .prepare(
      `
      INSERT INTO policy_revisions (
        id, policy_kind, version_number, rule_key, criteria_json,
        implementation_version, effective_from, origin,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        created_at, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      newRevision.id,
      newRevision.policyKind,
      newRevision.versionNumber,
      newRevision.ruleKey,
      newRevision.criteriaJson,
      newRevision.implementationVersion,
      newRevision.effectiveFrom,
      newRevision.origin,
      newRevision.actor.userId,
      newRevision.actor.loginId,
      newRevision.actor.displayName,
      newRevision.actor.role,
      newRevision.createdAt,
      newRevision.reason,
    );

  database
    .prepare(
      `
      INSERT INTO policy_events (
        id, policy_kind, revision_id, event_type, replacement_revision_id,
        before_json, after_json,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        occurred_at, related_approval_id
      ) VALUES (?, ?, ?, 'created', NULL, NULL, ?, ?, ?, ?, ?, ?, NULL)
    `,
    )
    .run(
      `evt-${crypto.randomUUID()}`,
      newRevision.policyKind,
      newRevision.id,
      JSON.stringify(newRevision),
      newRevision.actor.userId,
      newRevision.actor.loginId,
      newRevision.actor.displayName,
      newRevision.actor.role,
      now,
    );

  return newRevision;
};

export interface CancelPolicyRevisionInput {
  kind?: PolicyKind;
  targetRevisionId: string;
  reason: string;
  actor: PolicyActorSnapshot;
  nowIso?: string;
  todaySeoul?: string;
}

export const cancelPolicyRevision = (
  input: CancelPolicyRevisionInput,
  db?: DatabaseSync,
): void => {
  const database = resolveDb(db);

  if (!isPolicyHistoryInitialized(database)) {
    initializePolicyHistory(database);
  }

  if (input.actor.role !== "admin") {
    const error = new Error("Only administrators can cancel policy revisions");
    (error as unknown as { code: string }).code = "POLICY_FORBIDDEN";
    throw error;
  }

  const targetRow = database
    .prepare("SELECT * FROM policy_revisions WHERE id = ?")
    .get(input.targetRevisionId) as Record<string, unknown> | undefined;

  if (!targetRow) {
    const error = new Error(`Target policy revision not found: ${input.targetRevisionId}`);
    (error as unknown as { code: string }).code = "POLICY_NOT_FOUND";
    throw error;
  }

  const target = mapRowToRevision(targetRow);

  if (input.kind && target.policyKind !== input.kind) {
    const error = new Error(`Target policy kind (${target.policyKind}) does not match request kind (${input.kind})`);
    (error as unknown as { code: string }).code = "POLICY_KIND_MISMATCH";
    throw error;
  }

  if (target.origin === "initial") {
    const error = new Error("Cannot cancel initial baseline policy revision");
    (error as unknown as { code: string }).code = "POLICY_IMMUTABLE";
    throw error;
  }

  // 이미 used 되었는지 검사
  const usedRow = database
    .prepare(
      "SELECT COUNT(*) AS count FROM policy_events WHERE revision_id = ? AND event_type = 'used'",
    )
    .get(target.id) as { count: number | bigint } | undefined;
  if (Number(usedRow?.count ?? 0) > 0) {
    const error = new Error("Cannot cancel a policy that has already been used in approvals");
    (error as unknown as { code: string }).code = "POLICY_IN_USE";
    throw error;
  }

  // 이미 corrected 또는 cancelled 되었는지 검사
  const invalidRow = database
    .prepare(
      "SELECT event_type FROM policy_events WHERE revision_id = ? AND event_type IN ('corrected', 'cancelled')",
    )
    .get(target.id) as { event_type: string } | undefined;
  if (invalidRow) {
    const error = new Error(`Target policy is already ${invalidRow.event_type}`);
    (error as unknown as { code: string }).code = "POLICY_ALREADY_INVALIDATED";
    throw error;
  }

  // 오늘보다 미래여야 함
  const today = input.todaySeoul ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  if (!target.effectiveFrom || target.effectiveFrom <= today) {
    const error = new Error("Cannot cancel past or currently active policy revision; must be scheduled in the future");
    (error as unknown as { code: string }).code = "POLICY_NOT_SCHEDULED";
    throw error;
  }

  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("Reason cannot be empty");
  }

  const now = input.nowIso ?? new Date().toISOString();

  database
    .prepare(
      `
      INSERT INTO policy_events (
        id, policy_kind, revision_id, event_type, replacement_revision_id,
        before_json, after_json,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        occurred_at, related_approval_id
      ) VALUES (?, ?, ?, 'cancelled', NULL, ?, NULL, ?, ?, ?, ?, ?, NULL)
    `,
    )
    .run(
      `evt-${crypto.randomUUID()}`,
      target.policyKind,
      target.id,
      JSON.stringify(target),
      input.actor.userId,
      input.actor.loginId,
      input.actor.displayName,
      input.actor.role,
      now,
    );
};

export const recordPolicyUse = (
  database: DatabaseSync,
  bindings: PolicyApplicationBinding[],
  approvalId: string,
  actor: PolicyActorSnapshot,
): void => {
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO policy_events (
      id, policy_kind, revision_id, event_type, replacement_revision_id,
      before_json, after_json,
      actor_user_id, actor_login_id, actor_display_name, actor_role,
      occurred_at, related_approval_id
    ) VALUES (?, ?, ?, 'used', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
  `);

  for (const binding of bindings) {
    stmt.run(
      `evt-used-${crypto.randomUUID()}`,
      binding.kind,
      binding.policyId,
      actor.userId,
      actor.loginId,
      actor.displayName,
      actor.role,
      now,
      approvalId,
    );
  }
};
