// 정책 이력 및 기간별 버전 도메인 모델 (POLICY-HISTORY-01: PH-R01~R04)

export type PolicyKind = "substitute-eligibility" | "changed-worker-priority";

export type SubstituteEligibilityRuleKey = "substitute-legacy" | "substitute-team-type-v1";
export type ChangedWorkerPriorityRuleKey = "changed-worker-legacy" | "changed-worker-after-v1";
export type PolicyRuleKey = SubstituteEligibilityRuleKey | ChangedWorkerPriorityRuleKey;

export type PolicyOrigin = "initial" | "registered" | "correction";
export type PolicyEventType = "initialized" | "created" | "corrected" | "cancelled" | "used";

export interface PolicyActorSnapshot {
  userId: string;
  loginId: string;
  displayName: string;
  role: string;
}

export interface PolicyRevisionRecord {
  id: string;
  policyKind: PolicyKind;
  versionNumber: number;
  ruleKey: PolicyRuleKey;
  criteriaJson: string;
  implementationVersion: string;
  effectiveFrom: string | null; // null: 도입 종전 기준 (최초 기준)
  origin: PolicyOrigin;
  actor: PolicyActorSnapshot;
  createdAt: string;
  reason: string;
}

export interface PolicyEventRecord {
  id: string;
  policyKind: PolicyKind;
  revisionId: string;
  eventType: PolicyEventType;
  replacementRevisionId?: string | null;
  beforeJson?: string | null;
  afterJson?: string | null;
  actor: PolicyActorSnapshot;
  occurredAt: string;
  relatedApprovalId?: string | null;
}

export interface ActivePolicyProjection {
  revision: PolicyRevisionRecord;
  status: "scheduled" | "active" | "retired";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isUsed: boolean;
  useCount: number;
  isInitial: boolean;
}

export interface PolicyApplicationBinding {
  kind: PolicyKind;
  policyId: string;
  versionNumber: number;
  ruleKey: PolicyRuleKey;
  effectiveFrom: string | null;
  criteriaSummary: string;
  criteriaJson: string;
  implementationVersion: string;
}

export interface PolicyApplicationSnapshot {
  workDate: string;
  fingerprint: string;
  bindings: PolicyApplicationBinding[];
}

export const SUPPORTED_POLICY_KINDS: readonly PolicyKind[] = [
  "substitute-eligibility",
  "changed-worker-priority"
] as const;

export const SUPPORTED_RULE_KEYS: Record<PolicyKind, readonly PolicyRuleKey[]> = {
  "substitute-eligibility": ["substitute-legacy", "substitute-team-type-v1"],
  "changed-worker-priority": ["changed-worker-legacy", "changed-worker-after-v1"]
} as const;

export const POLICY_KIND_LABELS: Record<PolicyKind, string> = {
  "substitute-eligibility": "대체근무수당 지급 대상 판정",
  "changed-worker-priority": "실제 근무자 판정 (변경후 우선)"
};

export const RULE_KEY_METADATA: Record<PolicyRuleKey, { label: string; summary: string }> = {
  "substitute-legacy": {
    label: "종전 기준 (Pool·BP 제외)",
    summary: "Pool·BP는 제외하고, 주간고정조 등 다른 근무유형의 교대근무 대체는 수당 지급 대상으로 인정합니다."
  },
  "substitute-team-type-v1": {
    label: "근무유형 기준 (Pool 및 주간고정조 제외)",
    summary: "Pool 소속 및 주간고정조 소속의 교대근무 대체는 수당 지급 대상에서 제외합니다 (교대조 간 대체만 인정)."
  },
  "changed-worker-legacy": {
    label: "종전 방식 (원근무자 우선)",
    summary: "근무변경 시 원근무자(변경전)를 우선 인정하고 변경후 근무자를 제외합니다. (Pool·BP 공통 제외)"
  },
  "changed-worker-after-v1": {
    label: "현장 기준 (실제근무자 우선)",
    summary: "근무변경 시 실제 근무한 대체근무자(변경후)를 우선 인정합니다. (Pool·BP 공통 제외)"
  }
};

export function isValidPolicyKind(kind: string): kind is PolicyKind {
  return SUPPORTED_POLICY_KINDS.includes(kind as PolicyKind);
}

export function isValidRuleKey(kind: PolicyKind, ruleKey: string): ruleKey is PolicyRuleKey {
  const allowed = SUPPORTED_RULE_KEYS[kind];
  return Boolean(allowed && allowed.includes(ruleKey as PolicyRuleKey));
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** 실제 달력 기준 엄격한 YYYY-MM-DD 날짜 검증 (윤년 검증 포함) */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  if (!dateStr || !DATE_REGEX.test(dateStr)) return false;
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const isValidIsoDateString = isValidDateString;

/** 날짜 문자열 하루 전 계산 */
export function getPreviousDayString(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const prevY = date.getUTCFullYear();
  const prevM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const prevD = String(date.getUTCDate()).padStart(2, "0");
  return `${prevY}-${prevM}-${prevD}`;
}

/** 날짜 문자열 하루 뒤 계산 */
export function getNextDayString(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  const nextY = date.getUTCFullYear();
  const nextM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextD = String(date.getUTCDate()).padStart(2, "0");
  return `${nextY}-${nextM}-${nextD}`;
}

export function buildCriteriaJson(ruleKey: PolicyRuleKey): string {
  const meta = RULE_KEY_METADATA[ruleKey];
  return JSON.stringify({
    ruleKey,
    label: meta.label,
    summary: meta.summary
  });
}

/** 활성 타임라인 투영 계산 */
export function resolveActivePolicies(
  revisions: PolicyRevisionRecord[],
  events: PolicyEventRecord[],
  referenceDate?: string
): ActivePolicyProjection[] {
  const now = referenceDate || new Date().toISOString().slice(0, 10);

  // 1. corrected, cancelled 사건으로 교체되거나 취소된 revisionId 수집
  const inactiveRevisionIds = new Set<string>();
  const usedCountMap = new Map<string, number>();

  for (const ev of events) {
    if (ev.eventType === "corrected" || ev.eventType === "cancelled") {
      inactiveRevisionIds.add(ev.revisionId);
    }
    if (ev.eventType === "used") {
      usedCountMap.set(ev.revisionId, (usedCountMap.get(ev.revisionId) ?? 0) + 1);
    }
  }

  // 2. 유효한 revision만 필터링
  const validRevisions = revisions.filter((r) => !inactiveRevisionIds.has(r.id));

  // 3. effectiveFrom 오름차순 정렬 (null은 가장 과거, 같은 날짜는 versionNumber 오름차순)
  validRevisions.sort((a, b) => {
    if (a.effectiveFrom === null && b.effectiveFrom === null) {
      return a.versionNumber - b.versionNumber;
    }
    if (a.effectiveFrom === null) return -1;
    if (b.effectiveFrom === null) return 1;
    if (a.effectiveFrom !== b.effectiveFrom) {
      return a.effectiveFrom.localeCompare(b.effectiveFrom);
    }
    return a.versionNumber - b.versionNumber;
  });

  // 4. 구간(effectiveTo) 및 상태(scheduled, active, retired) 판정
  const projections: ActivePolicyProjection[] = [];

  for (let i = 0; i < validRevisions.length; i++) {
    const rev = validRevisions[i];
    const nextRev = validRevisions[i + 1];
    const effectiveTo = nextRev && nextRev.effectiveFrom ? getPreviousDayString(nextRev.effectiveFrom) : null;

    let status: "scheduled" | "active" | "retired";
    if (rev.effectiveFrom && rev.effectiveFrom > now) {
      status = "scheduled";
    } else if (effectiveTo && effectiveTo < now) {
      status = "retired";
    } else {
      status = "active";
    }

    const useCount = usedCountMap.get(rev.id) ?? 0;

    projections.push({
      revision: rev,
      status,
      effectiveFrom: rev.effectiveFrom,
      effectiveTo,
      isUsed: useCount > 0,
      useCount,
      isInitial: rev.origin === "initial"
    });
  }

  return projections;
}

/** 근무일(workDate)에 해당하는 정책 투영 선택 */
export function selectPolicyForWorkDate(
  projections: ActivePolicyProjection[],
  workDate: string
): ActivePolicyProjection | null {
  for (const proj of projections) {
    const fromOk = proj.effectiveFrom === null || proj.effectiveFrom <= workDate;
    const toOk = proj.effectiveTo === null || proj.effectiveTo >= workDate;
    if (fromOk && toOk) {
      return proj;
    }
  }
  return null;
}

/** 단순 해시 함수 (브라우저/노드 공통) */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hash = (hash << 5) - hash + code;
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 정책 적용 지문 계산 */
export function computePolicyApplicationFingerprint(
  workDate: string,
  bindings: PolicyApplicationBinding[]
): string {
  const sortedBindings = [...bindings].sort((a, b) => a.kind.localeCompare(b.kind)).map(binding => ({
    kind: binding.kind, policyId: binding.policyId, versionNumber: binding.versionNumber,
    ruleKey: binding.ruleKey, effectiveFrom: binding.effectiveFrom,
    criteriaSummary: binding.criteriaSummary, criteriaJson: binding.criteriaJson,
    implementationVersion: binding.implementationVersion
  }));
  const raw = `${workDate}|${JSON.stringify(sortedBindings)}`;
  return `pol_snap_${simpleHash(raw)}`;
}

/** 월별 정책 컨텍스트 지문 계산 (해당 월 1일~말일까지 선택되는 정책 목록 기준) */
export function computeMonthPolicyFingerprint(
  scheduleMonth: string,
  projectionsByKind: Record<PolicyKind, ActivePolicyProjection[]>
): string {
  if (!/^\d{4}-\d{2}$/.test(scheduleMonth)) return "invalid_month";
  const [yStr, mStr] = scheduleMonth.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const daySelections: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dayStr = `${scheduleMonth}-${String(d).padStart(2, "0")}`;
    const sub = selectPolicyForWorkDate(projectionsByKind["substitute-eligibility"] || [], dayStr);
    const chg = selectPolicyForWorkDate(projectionsByKind["changed-worker-priority"] || [], dayStr);
    const bindingKey = (selection: ActivePolicyProjection | null) => selection ? {
      id: selection.revision.id, version: selection.revision.versionNumber,
      rule: selection.revision.ruleKey, criteria: selection.revision.criteriaJson,
      implementation: selection.revision.implementationVersion,
      effectiveFrom: selection.revision.effectiveFrom
    } : null;
    daySelections.push(JSON.stringify([dayStr, bindingKey(sub), bindingKey(chg)]));
  }

  return `pol_ctx_${simpleHash(daySelections.join(";"))}`;
}


/** Read the complete immutable policy context; absent old records remain unbound. */
export function parsePolicyApplicationSnapshot(value: unknown): PolicyApplicationSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !["workDate", "fingerprint", "bindings"].includes(key))) return null;
  if (typeof record.workDate !== "string" || !isValidDateString(record.workDate) || typeof record.fingerprint !== "string" || !Array.isArray(record.bindings)) return null;
  const kinds = new Set<string>();
  const bindings: PolicyApplicationBinding[] = [];
  for (const raw of record.bindings) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(key => !["kind", "policyId", "versionNumber", "ruleKey", "effectiveFrom", "criteriaSummary", "criteriaJson", "implementationVersion"].includes(key))) return null;
    if (typeof item.kind !== "string" || !isValidPolicyKind(item.kind) || kinds.has(item.kind)) return null;
    if (typeof item.ruleKey !== "string" || !isValidRuleKey(item.kind, item.ruleKey)) return null;
    if (typeof item.policyId !== "string" || !item.policyId || !Number.isInteger(item.versionNumber) || Number(item.versionNumber) < 1) return null;
    if (item.effectiveFrom !== null && (typeof item.effectiveFrom !== "string" || !isValidDateString(item.effectiveFrom))) return null;
    if (typeof item.criteriaSummary !== "string" || !item.criteriaSummary || typeof item.criteriaJson !== "string" || typeof item.implementationVersion !== "string" || !item.implementationVersion) return null;
    try { const criteria: unknown = JSON.parse(item.criteriaJson); if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) return null; } catch { return null; }
    kinds.add(item.kind);
    bindings.push(item as unknown as PolicyApplicationBinding);
  }
  const result: PolicyApplicationSnapshot = { workDate: record.workDate, fingerprint: record.fingerprint, bindings };
  return result.fingerprint === computePolicyApplicationFingerprint(result.workDate, bindings) ? result : null;
}
