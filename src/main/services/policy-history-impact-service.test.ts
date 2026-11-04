import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "./sqlite-storage-service";
import {
  clearPreviewTokensForTest,
  applyPolicyChange as applyWithSession,
  previewPolicyChange as previewWithSession,
} from "./policy-history-impact-service";
import {
  addPolicyRevision,
  getActivePolicySummary,
  initializePolicyHistory,
} from "./policy-history-service";

const previewPolicyChange = (...args: Parameters<typeof previewWithSession>) => previewWithSession(args[0], args[1], args[2], args[3] ?? { sessionFingerprint: `test-session:${args[1].userId}` });
const applyPolicyChange = (...args: Parameters<typeof applyWithSession>) => applyWithSession(args[0], args[1], args[2], args[3] ?? { sessionFingerprint: `test-session:${args[1].userId}` });

const actorA = {
  userId: "user-admin-1",
  loginId: "admin1",
  displayName: "관리자A",
  role: "admin",
};

const actorB = {
  userId: "user-admin-2",
  loginId: "admin2",
  displayName: "관리자B",
  role: "admin",
};

describe("policy-history-impact-service (PH-R05, PH-R06)", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    clearPreviewTokensForTest();
    db = new DatabaseSync(":memory:");
    migrateDatabase(db);
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });
  });

  afterEach(() => {
    db.close();
  });

  it("[PH06] preview does not write to database (0 mutations) and reports impact", () => {
    // pending 파일 1건 추가
    db.prepare(`
      INSERT INTO performance_files (
        id, file_name, file_path, directory_type, template_kind,
        sheet_name, row_count, column_count, file_size, modified_time_ms,
        duplicate_key, received_at, schedule_month, entry_count, status, preview_json
      ) VALUES (
        'file-1', '2026-12.xlsx', '/tmp/2026-12.xlsx', 'pending', 'shift',
        'Sheet1', 10, 5, 1024, 1000,
        'dup-1', '2026-11-01', '2026-12', 15, 'pending', '{}'
      )
    `).run();

    const countBeforeRev = db.prepare("SELECT COUNT(*) as count FROM policy_revisions").get() as { count: number };
    const countBeforeEvt = db.prepare("SELECT COUNT(*) as count FROM policy_events").get() as { count: number };

    const preview = previewPolicyChange(
      {
        action: "add",
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 복귀",
      },
      actorA,
      db,
    );

    const countAfterRev = db.prepare("SELECT COUNT(*) as count FROM policy_revisions").get() as { count: number };
    const countAfterEvt = db.prepare("SELECT COUNT(*) as count FROM policy_events").get() as { count: number };

    // DB 변경 0
    expect(Number(countAfterRev.count)).toBe(Number(countBeforeRev.count));
    expect(Number(countAfterEvt.count)).toBe(Number(countBeforeEvt.count));

    // 영향 집계 확인
    expect(preview.previewToken).toMatch(/^pol_tok_/);
    expect(preview.affectedPendingFileCount).toBe(1);
    expect(preview.affectedPendingRowCount).toBe(0);
    expect(preview.impactSummary).toContain("0건");
  });

  it("[PH06] applies change with valid token and consumes token (single use)", () => {
    const preview = previewPolicyChange(
      {
        action: "add",
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 복귀",
      },
      actorA,
      db,
    );

    const result = applyPolicyChange({ previewToken: preview.previewToken }, actorA, db);

    expect(result.success).toBe(true);
    expect(result.versionNumber).toBe(3);
    expect(result.revisionId).toBeTruthy();

    const summary = getActivePolicySummary("substitute-eligibility", db);
    expect(summary.timeline).toHaveLength(3);

    // 단일 사용: 토큰 재사용 거부
    expect(() =>
      applyPolicyChange({ previewToken: preview.previewToken }, actorA, db),
    ).toThrowError(expect.objectContaining({code: "POLICY_PREVIEW_EXPIRED"}));
  });

  it("[PH05] rejects apply when actor mismatches or lacks admin role", () => {
    const preview = previewPolicyChange(
      {
        action: "add",
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 복귀",
      },
      actorA,
      db,
    );

    expect(() =>
      applyPolicyChange({ previewToken: preview.previewToken }, actorB, db),
    ).toThrowError(expect.objectContaining({code: "POLICY_ACTOR_MISMATCH"}));
  });

  it("[PH07] rejects apply when registry changed since preview (fingerprint conflict)", () => {
    const preview = previewPolicyChange(
      {
        action: "add",
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 복귀",
      },
      actorA,
      db,
    );

    // 다른 정책 변경이 먼저 반영되어 레지스트리 지문이 변경됨
    db.prepare(`
      INSERT INTO policy_revisions (
        id, policy_kind, version_number, rule_key, criteria_json,
        implementation_version, effective_from, origin,
        actor_user_id, actor_login_id, actor_display_name, actor_role,
        created_at, reason
      ) VALUES (
        'rev-interfering', 'changed-worker-priority', 3, 'changed-worker-legacy', '{}',
        '4.0.0', '2026-11-15', 'registered',
        'u', 'l', 'd', 'r',
        '2026-11-03T00:00:00Z', '간섭 변경'
      )
    `).run();

    expect(() =>
      applyPolicyChange({ previewToken: preview.previewToken }, actorA, db),
    ).toThrowError(expect.objectContaining({code: "POLICY_CONFLICT"}));
  });
  const intent = () => ({ action: "add" as const, kind: "substitute-eligibility" as const, ruleKey: "substitute-legacy" as const, effectiveFrom: "2090-01-01", reason: "future revision" });
  const snapshot = () => JSON.stringify(db.prepare("SELECT * FROM policy_revisions ORDER BY id").all()) + JSON.stringify(db.prepare("SELECT * FROM policy_events ORDER BY id").all());

  it("[PH06] fresh preview is read-only even before bootstrap", () => {
    const empty = new DatabaseSync(":memory:");
    migrateDatabase(empty);
    try {
      const before = Number((empty.prepare("SELECT total_changes() AS n").get() as {n: number}).n);
      expect(() => previewPolicyChange(intent(), actorA, empty)).toThrowError(expect.objectContaining({code: "POLICY_NOT_INITIALIZED"}));
      expect(Number((empty.prepare("SELECT total_changes() AS n").get() as {n: number}).n)).toBe(before);
      expect(empty.prepare("SELECT * FROM policy_revisions").all()).toHaveLength(0);
    } finally { empty.close(); }
  });

  it("[PH05, PH06] requires a session and binds a token to the same login session", () => {
    const before = snapshot();
    expect(() => previewWithSession(intent(), actorA, db)).toThrowError(expect.objectContaining({code: "POLICY_SESSION_REQUIRED"}));
    const preview = previewPolicyChange(intent(), actorA, db);
    expect(() => applyWithSession({previewToken: preview.previewToken}, actorA, db, {sessionFingerprint: "new-login"})).toThrowError(expect.objectContaining({code: "POLICY_ACTOR_MISMATCH"}));
    expect(() => previewPolicyChange(intent(), {...actorA, role: "operator"}, db)).toThrowError(expect.objectContaining({code: "POLICY_FORBIDDEN"}));
    expect(snapshot()).toBe(before);
  });

  it("[PH06] captures intent by value and rejects expired preview without writes", () => {
    const change = intent();
    const preview = previewPolicyChange(change, actorA, db);
    change.reason = "mutated after preview";
    applyPolicyChange({previewToken: preview.previewToken}, actorA, db);
    expect((db.prepare("SELECT reason FROM policy_revisions WHERE origin = 'registered'").get() as {reason: string}).reason).toBe("future revision");
    const later = previewPolicyChange({...intent(), ruleKey: "substitute-team-type-v1", effectiveFrom: "2090-02-01"}, actorA, db);
    const before = snapshot();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 300001);
    try { expect(() => applyPolicyChange({previewToken: later.previewToken}, actorA, db)).toThrowError(expect.objectContaining({code: "POLICY_PREVIEW_EXPIRED"})); }
    finally { clock.mockRestore(); }
    expect(snapshot()).toBe(before);
  });

  it("[PH07] detects a related file change even when file and approval counts are identical", () => {
    db.prepare(`INSERT INTO performance_files (id,file_name,file_path,directory_type,template_kind,sheet_name,row_count,column_count,file_size,modified_time_ms,duplicate_key,received_at,schedule_month,entry_count,status,preview_json)
      VALUES ('related','related.xlsx','/missing/related.xlsx','pending','shift','sheet',0,0,1,1,'related','2089-01-01','2090-01',0,'pending','{}')`).run();
    const preview = previewPolicyChange(intent(), actorA, db);
    expect(preview.affectedPendingFileCount).toBe(1);
    expect(preview.affectedPendingRowCount).toBe(0);
    db.prepare("UPDATE performance_files SET warning_count = 2 WHERE id = 'related'").run();
    const before = snapshot();
    expect(() => applyPolicyChange({previewToken: preview.previewToken}, actorA, db)).toThrowError(expect.objectContaining({code: "POLICY_CONFLICT"}));
    expect(snapshot()).toBe(before);
  });

  it("[PH04, PH07] previews both changed intervals when moving a reservation past another version", () => {
    const january = addPolicyRevision({...intent(), actor: actorA, todaySeoul: "2026-11-04"}, db);
    addPolicyRevision({...intent(), ruleKey: "substitute-team-type-v1", effectiveFrom: "2090-02-01", actor: actorA}, db);
    const before = snapshot();
    const preview = previewPolicyChange({...intent(), action: "correct", targetRevisionId: january.id, effectiveFrom: "2090-03-01"}, actorA, db);
    expect(preview.affectedPeriods).toEqual([{from: "2090-01-01", to: "2090-01-31"}, {from: "2090-03-01", to: null}]);
    expect(snapshot()).toBe(before);
    expect(() => previewPolicyChange({...intent(), action: "correct", targetRevisionId: january.id, effectiveFrom: "2090-02-01"}, actorA, db)).toThrowError(expect.objectContaining({code: "POLICY_DUPLICATE_DATE"}));
    expect(() => previewPolicyChange({...intent(), action: "correct", targetRevisionId: january.id}, actorA, db)).toThrowError(expect.objectContaining({code: "POLICY_NO_CHANGE"}));
    expect(() => previewPolicyChange({...intent(), action: "cancel", kind: "changed-worker-priority", targetRevisionId: january.id}, actorA, db)).toThrowError(expect.objectContaining({code: "POLICY_NOT_ACTIVE"}));
  });

});
