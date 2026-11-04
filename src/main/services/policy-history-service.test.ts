import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "./sqlite-storage-service";
import {
  addPolicyRevision,
  cancelPolicyRevision,
  correctPolicyRevision,
  getActivePolicySummary,
  initializePolicyHistory,
  isPolicyHistoryInitialized,
  listPolicyHistory,
  recordPolicyUse,
  selectPolicyForWorkDate,
} from "./policy-history-service";

const testActor = {
  userId: "admin-1",
  loginId: "admin",
  displayName: "관리자",
  role: "admin",
};

describe("policy-history-service", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrateDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  it("[PH01] bootstraps baseline V1 when no raw dates exist", () => {
    expect(isPolicyHistoryInitialized(db)).toBe(false);

    initializePolicyHistory(db);

    expect(isPolicyHistoryInitialized(db)).toBe(true);

    const sub = getActivePolicySummary("substitute-eligibility", db);
    expect(sub.timeline).toHaveLength(1);
    expect(sub.timeline[0]?.revision.versionNumber).toBe(1);
    expect(sub.timeline[0]?.revision.ruleKey).toBe("substitute-legacy");
    expect(sub.timeline[0]?.effectiveFrom).toBeNull();
    expect(sub.timeline[0]?.effectiveTo).toBeNull();
    expect(sub.current?.revision.ruleKey).toBe("substitute-legacy");
    expect(sub.next).toBeNull();

    const chg = getActivePolicySummary("changed-worker-priority", db);
    expect(chg.timeline).toHaveLength(1);
    expect(chg.timeline[0]?.revision.versionNumber).toBe(1);
    expect(chg.timeline[0]?.revision.ruleKey).toBe("changed-worker-legacy");
    expect(chg.timeline[0]?.effectiveFrom).toBeNull();
  });

  it("[PH01] bootstraps V1 (legacy) and V2 (effective date) when raw dates exist", () => {
    db.prepare(`
      INSERT INTO app_setting_entries (setting_key, value, updated_at)
      VALUES
        ('substitute_allowance_policy_effective_from', '2026-07-01', '2026-07-01T00:00:00Z'),
        ('changed_slot_priority_effective_from', '2026-09-01', '2026-09-01T00:00:00Z')
    `).run();

    initializePolicyHistory(db);

    const sub = getActivePolicySummary("substitute-eligibility", db);
    expect(sub.timeline).toHaveLength(2);
    expect(sub.timeline[0]?.revision.versionNumber).toBe(1);
    expect(sub.timeline[0]?.revision.ruleKey).toBe("substitute-legacy");
    expect(sub.timeline[0]?.effectiveFrom).toBeNull();
    expect(sub.timeline[0]?.effectiveTo).toBe("2026-06-30");

    expect(sub.timeline[1]?.revision.versionNumber).toBe(2);
    expect(sub.timeline[1]?.revision.ruleKey).toBe("substitute-team-type-v1");
    expect(sub.timeline[1]?.effectiveFrom).toBe("2026-07-01");
    expect(sub.timeline[1]?.effectiveTo).toBeNull();

    const chg = getActivePolicySummary("changed-worker-priority", db);
    expect(chg.timeline).toHaveLength(2);
    expect(chg.timeline[1]?.revision.ruleKey).toBe("changed-worker-after-v1");
    expect(chg.timeline[1]?.effectiveFrom).toBe("2026-09-01");
  });

  it("[PH01] initialization is idempotent and does not duplicate records", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });

    const row = db.prepare("SELECT COUNT(*) AS count FROM policy_revisions WHERE policy_kind = 'substitute-eligibility'").get() as { count: number };
    expect(Number(row.count)).toBe(2);
  });

  it("[PH02] adds a scheduled policy revision and enforces validation", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });

    const rev = addPolicyRevision(
      {
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 종전 기준 복귀",
        actor: testActor,
      },
      db,
    );

    expect(rev.versionNumber).toBe(3);
    expect(rev.origin).toBe("registered");
    expect(rev.effectiveFrom).toBe("2026-12-01");

    const sub = getActivePolicySummary("substitute-eligibility", db);
    expect(sub.timeline).toHaveLength(3);
    expect(sub.timeline[1]?.effectiveTo).toBe("2026-11-30");
    expect(sub.timeline[2]?.effectiveFrom).toBe("2026-12-01");
    expect(sub.timeline[2]?.revision.versionNumber).toBe(3);

    // 같은 시작일 중복 거부
    expect(() =>
      addPolicyRevision(
        {
          kind: "substitute-eligibility",
          ruleKey: "substitute-team-type-v1",
          effectiveFrom: "2026-12-01",
          reason: "중복 시작일 시도",
          actor: testActor,
        },
        db,
      ),
    ).toThrowError(/already scheduled/);

    // 동일한 ruleKey로 무의미한 중복 변경 거부
    expect(() =>
      addPolicyRevision(
        {
          kind: "substitute-eligibility",
          ruleKey: "substitute-legacy",
          effectiveFrom: "2026-12-15",
          reason: "이미 legacy인데 또 legacy",
          actor: testActor,
        },
        db,
      ),
    ).toThrowError(/already effective/);
  });

  it("[PH04] corrects a scheduled future revision with audit trail", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });

    const v3 = addPolicyRevision(
      {
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 복귀",
        actor: testActor,
      },
      db,
    );

    const v4 = correctPolicyRevision(
      {
        targetRevisionId: v3.id,
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-15",
        reason: "시작일 연기 정정",
        actor: testActor,
        todaySeoul: "2026-11-03",
      },
      db,
    );

    expect(v4.versionNumber).toBe(4);
    expect(v4.origin).toBe("correction");
    expect(v4.effectiveFrom).toBe("2026-12-15");

    const sub = getActivePolicySummary("substitute-eligibility", db);
    // v3는 excluded 되고 v1, v2, v4만 남음
    expect(sub.timeline).toHaveLength(3);
    expect(sub.timeline[1]?.effectiveTo).toBe("2026-12-14");
    expect(sub.timeline[2]?.revision.versionNumber).toBe(4);
    expect(sub.timeline[2]?.effectiveFrom).toBe("2026-12-15");

    // 정정된 v3는 다시 정정 불가
    expect(() =>
      correctPolicyRevision(
        {
          targetRevisionId: v3.id,
          ruleKey: "substitute-legacy",
          effectiveFrom: "2026-12-20",
          reason: "재정정 시도",
          actor: testActor,
          todaySeoul: "2026-11-03",
        },
        db,
      ),
    ).toThrowError(/already corrected/);
  });

  it("[PH04] cancels a scheduled future revision", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });

    const v3 = addPolicyRevision(
      {
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 임시 복귀",
        actor: testActor,
      },
      db,
    );

    cancelPolicyRevision(
      {
        targetRevisionId: v3.id,
        reason: "계획 취소",
        actor: testActor,
        todaySeoul: "2026-11-03",
      },
      db,
    );

    const sub = getActivePolicySummary("substitute-eligibility", db);
    expect(sub.timeline).toHaveLength(2);
    expect(sub.timeline[1]?.effectiveTo).toBeNull();
  });

  it("[PH04] forbids correcting/cancelling initial baseline or used policies", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });
    const sub = getActivePolicySummary("substitute-eligibility", db);
    const initialRev = sub.timeline[1]?.revision;
    expect(initialRev).toBeDefined();

    // initial baseline 정정 시도 거부
    expect(() =>
      correctPolicyRevision(
        {
          targetRevisionId: initialRev!.id,
          ruleKey: "substitute-legacy",
          effectiveFrom: "2026-12-01",
          reason: "초기기준 정정 시도",
          actor: testActor,
          todaySeoul: "2026-05-01",
        },
        db,
      ),
    ).toThrowError(/Cannot correct initial baseline/);

    // 미래 정책 추가 후 used 기록 시 정정/취소 불가
    const v3 = addPolicyRevision(
      {
        kind: "substitute-eligibility",
        ruleKey: "substitute-legacy",
        effectiveFrom: "2026-12-01",
        reason: "연말 복귀",
        actor: testActor,
      },
      db,
    );

    recordPolicyUse(
      db,
      [
        {
          kind: "substitute-eligibility",
          policyId: v3.id,
          versionNumber: v3.versionNumber,
          ruleKey: v3.ruleKey,
          effectiveFrom: v3.effectiveFrom,
          criteriaSummary: "연말 복귀",
        },
      ],
      "appr-123",
      testActor,
    );

    expect(() =>
      cancelPolicyRevision(
        {
          targetRevisionId: v3.id,
          reason: "사용된 정책 취소 시도",
          actor: testActor,
          todaySeoul: "2026-11-03",
        },
        db,
      ),
    ).toThrowError(/already been used/);
  });

  it("[PH03] selects accurate policy for workDate across boundaries", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });

    // 2026-06-30 -> legacy
    const p1 = selectPolicyForWorkDate("substitute-eligibility", "2026-06-30", db);
    expect(p1?.revision.ruleKey).toBe("substitute-legacy");

    // 2026-07-01 -> team-type-v1
    const p2 = selectPolicyForWorkDate("substitute-eligibility", "2026-07-01", db);
    expect(p2?.revision.ruleKey).toBe("substitute-team-type-v1");

    // 2026-11-03 -> team-type-v1
    const p3 = selectPolicyForWorkDate("substitute-eligibility", "2026-11-03", db);
    expect(p3?.revision.ruleKey).toBe("substitute-team-type-v1");
  });

  it("[PH05] lists revisions and events with pagination and enforces admin check", () => {
    initializePolicyHistory(db, { legacySubstituteDate: "2026-07-01" });

    const revList = listPolicyHistory({ kind: "substitute-eligibility", view: "revisions" }, db);
    expect(revList.total).toBe(2);
    expect(revList.items).toHaveLength(2);
    expect(revList.summary.current).toBeDefined();

    const evtList = listPolicyHistory({ kind: "substitute-eligibility", view: "events" }, db);
    expect(evtList.total).toBe(2);
    expect(evtList.items).toHaveLength(2);
  });
});
