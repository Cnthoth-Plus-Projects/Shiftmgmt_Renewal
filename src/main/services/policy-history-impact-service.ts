import crypto from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { PolicyChangeApplyInput, PolicyChangeApplyResult, PolicyChangePreviewInput, PolicyChangePreviewResult } from "../../shared/bridge/contracts";
import { getPreviousDayString, isValidDateString, isValidPolicyKind, isValidRuleKey, type ActivePolicyProjection, type PolicyActorSnapshot, type PolicyRevisionRecord } from "../../shared/domain/policy-history";
import { addPolicyRevision, cancelPolicyRevision, correctPolicyRevision, getActivePolicyTimeline, getRegistryConfigFingerprint, isPolicyHistoryInitialized } from "./policy-history-service";
import { getSqliteDatabase } from "./sqlite-storage-service";

export interface PolicyRequestContext { sessionFingerprint: string; }
interface Period { from: string | null; to: string | null; }
interface ChangePlan { input: PolicyChangePreviewInput; periods: Period[]; before: ActivePolicyProjection[]; }
interface StoredPreviewToken {
  actorId: string;
  sessionFingerprint: string;
  input: PolicyChangePreviewInput;
  stateFingerprint: string;
  registryConfigFingerprint: string;
  expiresAt: number;
  affectedPendingFileCount: number;
}
const tokens = new Map<string, StoredPreviewToken>();
const TTL_MS = 5 * 60 * 1000;
export const clearPreviewTokensForTest = () => tokens.clear();
const fail = (code: string, message: string): never => { throw Object.assign(new Error(message), { code }); };
const resolveDb = (db?: DatabaseSync) => db ?? getSqliteDatabase() ?? fail("POLICY_NOT_INITIALIZED", "정책 이력을 먼저 조회해 주세요.");
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const authorize = (actor: PolicyActorSnapshot, context?: PolicyRequestContext) => {
  if (actor.role !== "admin") fail("POLICY_FORBIDDEN", "관리자만 정책 기준을 변경할 수 있습니다.");
  if (!context?.sessionFingerprint) fail("POLICY_SESSION_REQUIRED", "로그인 상태를 확인한 뒤 다시 시도해 주세요.");
  return context!.sessionFingerprint;
};
const contains = (periods: Period[], date: string) => periods.some(p => (!p.from || date >= p.from) && (!p.to || date <= p.to));
const intersectsMonth = (periods: Period[], month: string | null) => {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  const [year, part] = month.split("-").map(Number);
  const end = `${month}-${new Date(Date.UTC(year, part, 0)).getUTCDate()}`;
  return periods.some(p => (!p.from || end >= p.from) && (!p.to || `${month}-01` <= p.to));
};

// Compare actual before/after selections, including disjoint changed periods when a reservation moves.
const changedPeriods = (before: PolicyRevisionRecord[], after: PolicyRevisionRecord[]): Period[] => {
  const boundaries: Array<string | null> = [null, ...new Set([...before, ...after].flatMap(r => r.effectiveFrom ? [r.effectiveFrom] : []))].sort((a, b) => a === null ? -1 : b === null ? 1 : a.localeCompare(b));
  const at = (rows: PolicyRevisionRecord[], date: string | null) => rows.filter(r => r.effectiveFrom === null || (date !== null && r.effectiveFrom <= date)).sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""))[0]?.id;
  return boundaries.flatMap((from, index) => at(before, from) === at(after, from) ? [] : [{ from, to: boundaries[index + 1] ? getPreviousDayString(boundaries[index + 1]!) : null }]);
};

const planChange = (raw: PolicyChangePreviewInput, database: DatabaseSync): ChangePlan => {
  if (!isPolicyHistoryInitialized(database)) fail("POLICY_NOT_INITIALIZED", "정책 이력을 새로고침한 뒤 영향 확인을 다시 실행해 주세요.");
  if (!isValidPolicyKind(raw.kind)) fail("POLICY_RULE_UNSUPPORTED", "지원하지 않는 정책 종류입니다.");
  if (!["add", "correct", "cancel"].includes(raw.action)) fail("POLICY_INVALID_ACTION", "지원하지 않는 변경 작업입니다.");
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (!reason || reason.length > 500) fail("POLICY_INVALID_REASON", "변경 사유를 1~500자로 입력해 주세요.");
  const input = { ...raw, reason };
  const before = getActivePolicyTimeline(input.kind, database);
  const fingerprint = getRegistryConfigFingerprint(database);
  if (input.expectedRegistryConfigFingerprint && input.expectedRegistryConfigFingerprint !== fingerprint) fail("POLICY_CONFLICT", "정책 기준이 바뀌었습니다. 이력을 새로고침해 주세요.");
  let target: ActivePolicyProjection | undefined;
  if (input.action !== "add") {
    target = before.find(p => p.revision.id === input.targetRevisionId);
    if (!target) fail("POLICY_NOT_ACTIVE", "현재 유효한 예약 정책을 선택해 주세요. 종류나 상태가 변경되었을 수 있습니다.");
    if (target!.revision.origin === "initial") fail("POLICY_IMMUTABLE", "도입 당시 기준은 보존됩니다. 새 정책을 추가해 주세요.");
    if (target!.isUsed || target!.useCount > 0) fail("POLICY_IN_USE", "승인에 사용한 기준은 정정·취소할 수 없습니다. 새 정책을 추가해 주세요.");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    if (!target!.effectiveFrom || target!.effectiveFrom <= today) fail("POLICY_NOT_SCHEDULED", "아직 시작하지 않은 예약만 정정·취소할 수 있습니다.");
    if (input.action === "correct" && (!input.effectiveFrom || input.effectiveFrom <= today)) fail("POLICY_NOT_SCHEDULED", "정정할 적용일은 오늘 이후여야 합니다.");
  }
  const remaining = before.map(p => p.revision).filter(r => r.id !== target?.revision.id);
  if (input.action !== "cancel") {
    if (!input.ruleKey || !isValidRuleKey(input.kind, input.ruleKey)) fail("POLICY_RULE_UNSUPPORTED", "선택한 정책 종류에 맞는 기준을 선택해 주세요.");
    if (!input.effectiveFrom || !isValidDateString(input.effectiveFrom)) fail("POLICY_INVALID_DATE", "실제 달력에 있는 적용일을 입력해 주세요.");
    if (remaining.some(r => r.effectiveFrom === input.effectiveFrom)) fail("POLICY_DUPLICATE_DATE", "같은 날짜의 유효한 정책이 있습니다. 해당 예약을 정정해 주세요.");
    const current = before.filter(p => p.effectiveFrom === null || p.effectiveFrom <= input.effectiveFrom!).at(-1);
    if (input.action === "add" && current?.revision.ruleKey === input.ruleKey) fail("POLICY_NO_CHANGE", "해당 날짜에 이미 같은 기준이 적용됩니다.");
    if (target && target.revision.ruleKey === input.ruleKey && target.effectiveFrom === input.effectiveFrom) fail("POLICY_NO_CHANGE", "기준과 적용일이 같습니다. 변경할 내용을 확인해 주세요.");
  }
  const after = input.action === "cancel" ? remaining : [...remaining, { ...(target?.revision ?? before[0].revision), id: "preview-new-revision", policyKind: input.kind, ruleKey: input.ruleKey!, effectiveFrom: input.effectiveFrom! }];
  return { input, periods: changedPeriods(before.map(p => p.revision), after), before };
};

const fileState = (filePath: string) => {
  try { const stat = statSync(filePath); return { path: filePath, size: stat.size, modifiedAt: stat.mtimeMs, sha256: stat.isFile() ? crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex") : null }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path: filePath, missing: true }; return fail("POLICY_IMPACT_UNAVAILABLE", "대상 파일 상태를 확인하지 못했습니다. 폴더 접근 권한을 확인해 주세요."); }
};
const captureState = (database: DatabaseSync, plan: ChangePlan) => {
  const files = (database.prepare("SELECT * FROM performance_files WHERE directory_type = 'pending' ORDER BY id").all() as Array<Record<string, unknown>>).filter(f => intersectsMonth(plan.periods, f.schedule_month as string | null));
  const ids = new Set(files.map(f => String(f.id)));
  const rows = (database.prepare("SELECT * FROM performance_entries ORDER BY id").all() as Array<Record<string, unknown>>).filter(row => ids.has(String(row.performance_file_id)) && contains(plan.periods, String(row.work_date)));
  const approvals = (database.prepare("SELECT * FROM performance_approvals WHERE decision = 'approved' ORDER BY id").all() as Array<Record<string, unknown>>);
  const relatedApprovals = approvals.filter(row => contains(plan.periods, String(row.work_date)));
  const settings = database.prepare("SELECT * FROM app_setting_entries WHERE setting_key IN ('pending_dir','approved_dir') ORDER BY setting_key").all() as Array<Record<string, unknown>>;
  const folders = settings.map(row => {
    const dir = String(row.value ?? "");
    if (!dir || !path.isAbsolute(dir)) return { value: dir };
    try { return { path: dir, entries: readdirSync(dir).sort().map(name => { const item = statSync(path.join(dir, name)); return { name, size: item.size, modifiedAt: item.mtimeMs }; }) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path: dir, missing: true }; return fail("POLICY_IMPACT_UNAVAILABLE", "업무 폴더 상태를 확인하지 못했습니다. 접근 권한을 확인해 주세요."); }
  });
  const uses = plan.input.targetRevisionId ? database.prepare("SELECT * FROM policy_events WHERE revision_id = ? AND event_type = 'used' ORDER BY id").all(plan.input.targetRevisionId) : [];
  const state = { registry: getRegistryConfigFingerprint(database), files, rows, relatedApprovals, settings, folders, uses, sources: files.map(f => fileState(String(f.file_path))) };
  return { fingerprint: digest(state), files: files.length, rows: rows.length, relevantApproved: relatedApprovals.length, totalApproved: approvals.length };
};

export const previewPolicyChange = (input: PolicyChangePreviewInput, actor: PolicyActorSnapshot, db?: DatabaseSync, context?: PolicyRequestContext): PolicyChangePreviewResult => {
  const sessionFingerprint = authorize(actor, context);
  const database = resolveDb(db);
  const plan = planChange(input, database);
  const state = captureState(database, plan);
  const token = `pol_tok_${crypto.randomUUID()}`;
  const expiresAt = Date.now() + TTL_MS;
  for (const [key, value] of tokens) if (value.expiresAt <= Date.now()) tokens.delete(key);
  const registryConfigFingerprint = getRegistryConfigFingerprint(database);
  tokens.set(token, { actorId: actor.userId, sessionFingerprint, input: structuredClone(plan.input), stateFingerprint: state.fingerprint, registryConfigFingerprint, expiresAt, affectedPendingFileCount: state.files });
  return { previewToken: token, expiresAt: new Date(expiresAt).toISOString(), action: input.action, kind: input.kind, ruleKey: input.ruleKey, effectiveFrom: input.effectiveFrom ?? null, effectiveTo: plan.periods.at(-1)?.to ?? null, affectedPeriods: plan.periods, affectedPendingFileCount: state.files, affectedPendingRowCount: state.rows, preservedApprovedRowCount: state.totalApproved, preservedRelevantApprovedRowCount: state.relevantApproved, registryConfigFingerprint, impactSummary: `재확인 대상 파일 ${state.files}건 · 해당 기간 대기 파일에 저장된 행 ${state.rows}건. 해당 구간 승인 기록 ${state.relevantApproved}건과 전체 승인 기록 ${state.totalApproved}건은 보존됩니다. 미수집 파일은 포함하지 않으며 재판독 후 행 수는 달라질 수 있습니다.` };
};

export const applyPolicyChange = (input: PolicyChangeApplyInput, actor: PolicyActorSnapshot, db?: DatabaseSync, context?: PolicyRequestContext): PolicyChangeApplyResult => {
  const sessionFingerprint = authorize(actor, context);
  const database = resolveDb(db);
  const stored = tokens.get(input.previewToken);
  if (!stored || stored.expiresAt <= Date.now()) { tokens.delete(input.previewToken); return fail("POLICY_PREVIEW_EXPIRED", "영향 확인이 만료되었거나 이미 사용되었습니다. 다시 확인해 주세요."); }
  if (stored.actorId !== actor.userId || stored.sessionFingerprint !== sessionFingerprint) fail("POLICY_ACTOR_MISMATCH", "로그인 세션이 달라졌습니다. 영향 확인을 다시 실행해 주세요.");
  let ownsTransaction = false;
  try {
    database.exec("BEGIN IMMEDIATE"); ownsTransaction = true;
    const plan = planChange(stored.input, database);
    if (getRegistryConfigFingerprint(database) !== stored.registryConfigFingerprint || captureState(database, plan).fingerprint !== stored.stateFingerprint) fail("POLICY_CONFLICT", "정책이나 대상 자료가 변경되었습니다. 영향 확인을 다시 실행해 주세요.");
    let revisionId: string;
    let versionNumber: number;
    if (plan.input.action === "cancel") {
      const target = plan.before.find(p => p.revision.id === plan.input.targetRevisionId)!;
      cancelPolicyRevision({ kind: plan.input.kind, targetRevisionId: target.revision.id, reason: plan.input.reason, actor }, database);
      revisionId = target.revision.id; versionNumber = target.revision.versionNumber;
    } else {
      const revision = plan.input.action === "add" ? addPolicyRevision({ kind: plan.input.kind, ruleKey: plan.input.ruleKey!, effectiveFrom: plan.input.effectiveFrom!, reason: plan.input.reason, actor }, database) : correctPolicyRevision({ kind: plan.input.kind, targetRevisionId: plan.input.targetRevisionId!, ruleKey: plan.input.ruleKey!, effectiveFrom: plan.input.effectiveFrom!, reason: plan.input.reason, actor }, database);
      revisionId = revision.id; versionNumber = revision.versionNumber;
    }
    database.exec("COMMIT"); ownsTransaction = false; tokens.delete(input.previewToken);
    return { success: true, kind: plan.input.kind, action: plan.input.action, revisionId, versionNumber, affectedPendingFileCount: stored.affectedPendingFileCount, message: "정책 변경을 저장했습니다. 다음 실적 조회에서 대상 파일을 다시 확인합니다." };
  } catch (error) {
    if (ownsTransaction) database.exec("ROLLBACK");
    if ((error as {code?: string}).code !== "SQLITE_BUSY") tokens.delete(input.previewToken);
    throw error;
  }
};
