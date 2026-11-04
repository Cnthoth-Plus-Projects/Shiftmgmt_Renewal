import { describe, it, expect } from "vitest";
import {
  type PolicyRevisionRecord,
  type PolicyEventRecord,
  type PolicyActorSnapshot,
  resolveActivePolicies,
  selectPolicyForWorkDate,
  isValidDateString,
  isValidPolicyKind,
  isValidRuleKey,
  computePolicyApplicationFingerprint,
  computeMonthPolicyFingerprint
} from "./policy-history";

const testActor: PolicyActorSnapshot = {
  userId: "admin-1",
  loginId: "admin",
  displayName: "관리자",
  role: "admin"
};

describe("Policy History Domain Model (PH01 ~ PH04)", () => {
  it("[PH02] verifies valid dates including leap years and rejects malformed dates", () => {
    expect(isValidDateString("2026-07-01")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // 윤년 2월 29일 유효
    expect(isValidDateString("2025-02-29")).toBe(false); // 평년 2월 29일 무효
    expect(isValidDateString("2026-04-31")).toBe(false); // 4월 31일 무효
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString(null)).toBe(false);

    expect(isValidPolicyKind("substitute-eligibility")).toBe(true);
    expect(isValidPolicyKind("changed-worker-priority")).toBe(true);
    expect(isValidPolicyKind("unknown-kind")).toBe(false);

    expect(isValidRuleKey("substitute-eligibility", "substitute-legacy")).toBe(true);
    expect(isValidRuleKey("substitute-eligibility", "substitute-team-type-v1")).toBe(true);
    expect(isValidRuleKey("substitute-eligibility", "changed-worker-legacy")).toBe(false);
  });

  it("[PH03] resolves active timeline with continuous periods (6/30, 7/1, 8/31, 9/1 boundaries)", () => {
    // V1: initial (effectiveFrom: null)
    // V2: registered on 2026-07-01
    // V3: registered on 2026-09-01
    const revisions: PolicyRevisionRecord[] = [
      {
        id: "rev-sub-v1",
        policyKind: "substitute-eligibility",
        versionNumber: 1,
        ruleKey: "substitute-legacy",
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: null,
        origin: "initial",
        actor: testActor,
        createdAt: "2026-06-01T00:00:00Z",
        reason: "최초 기준"
      },
      {
        id: "rev-sub-v2",
        policyKind: "substitute-eligibility",
        versionNumber: 2,
        ruleKey: "substitute-team-type-v1",
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: "2026-07-01",
        origin: "registered",
        actor: testActor,
        createdAt: "2026-06-20T00:00:00Z",
        reason: "7월 적용 신설"
      },
      {
        id: "rev-sub-v3",
        policyKind: "substitute-eligibility",
        versionNumber: 3,
        ruleKey: "substitute-legacy", // 9월부터 다시 종전 기준으로 복귀
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: "2026-09-01",
        origin: "registered",
        actor: testActor,
        createdAt: "2026-08-15T00:00:00Z",
        reason: "9월 종전 기준 복귀"
      }
    ];

    const events: PolicyEventRecord[] = [
      {
        id: "ev-1",
        policyKind: "substitute-eligibility",
        revisionId: "rev-sub-v1",
        eventType: "initialized",
        actor: testActor,
        occurredAt: "2026-06-01T00:00:00Z"
      },
      {
        id: "ev-2",
        policyKind: "substitute-eligibility",
        revisionId: "rev-sub-v2",
        eventType: "created",
        actor: testActor,
        occurredAt: "2026-06-20T00:00:00Z"
      },
      {
        id: "ev-3",
        policyKind: "substitute-eligibility",
        revisionId: "rev-sub-v3",
        eventType: "created",
        actor: testActor,
        occurredAt: "2026-08-15T00:00:00Z"
      }
    ];

    const timeline = resolveActivePolicies(revisions, events, "2026-08-01");
    expect(timeline).toHaveLength(3);

    // V1: ~ 2026-06-30
    expect(timeline[0].revision.id).toBe("rev-sub-v1");
    expect(timeline[0].effectiveFrom).toBeNull();
    expect(timeline[0].effectiveTo).toBe("2026-06-30");
    expect(timeline[0].status).toBe("retired");

    // V2: 2026-07-01 ~ 2026-08-31
    expect(timeline[1].revision.id).toBe("rev-sub-v2");
    expect(timeline[1].effectiveFrom).toBe("2026-07-01");
    expect(timeline[1].effectiveTo).toBe("2026-08-31");
    expect(timeline[1].status).toBe("active");

    // V3: 2026-09-01 ~ null
    expect(timeline[2].revision.id).toBe("rev-sub-v3");
    expect(timeline[2].effectiveFrom).toBe("2026-09-01");
    expect(timeline[2].effectiveTo).toBeNull();
    expect(timeline[2].status).toBe("scheduled");

    // 경계일 검증
    const p630 = selectPolicyForWorkDate(timeline, "2026-06-30");
    expect(p630?.revision.id).toBe("rev-sub-v1");
    expect(p630?.revision.ruleKey).toBe("substitute-legacy");

    const p701 = selectPolicyForWorkDate(timeline, "2026-07-01");
    expect(p701?.revision.id).toBe("rev-sub-v2");
    expect(p701?.revision.ruleKey).toBe("substitute-team-type-v1");

    const p831 = selectPolicyForWorkDate(timeline, "2026-08-31");
    expect(p831?.revision.id).toBe("rev-sub-v2");

    const p901 = selectPolicyForWorkDate(timeline, "2026-09-01");
    expect(p901?.revision.id).toBe("rev-sub-v3");
    expect(p901?.revision.ruleKey).toBe("substitute-legacy");
  });

  it("[PH04] handles scheduled policy correction and cancellation with gapless timeline preservation", () => {
    // V1 (initial, null), V2 (2026-07-01, cancelled), V3 (2026-08-01, corrected -> V4 2026-08-15)
    const revisions: PolicyRevisionRecord[] = [
      {
        id: "rev-1",
        policyKind: "changed-worker-priority",
        versionNumber: 1,
        ruleKey: "changed-worker-legacy",
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: null,
        origin: "initial",
        actor: testActor,
        createdAt: "2026-06-01T00:00:00Z",
        reason: "초기 기준"
      },
      {
        id: "rev-2",
        policyKind: "changed-worker-priority",
        versionNumber: 2,
        ruleKey: "changed-worker-after-v1",
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: "2026-07-01",
        origin: "registered",
        actor: testActor,
        createdAt: "2026-06-10T00:00:00Z",
        reason: "7월 변경 예정"
      },
      {
        id: "rev-3",
        policyKind: "changed-worker-priority",
        versionNumber: 3,
        ruleKey: "changed-worker-after-v1",
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: "2026-08-01",
        origin: "registered",
        actor: testActor,
        createdAt: "2026-06-15T00:00:00Z",
        reason: "8월 변경 예정"
      },
      {
        id: "rev-4",
        policyKind: "changed-worker-priority",
        versionNumber: 4,
        ruleKey: "changed-worker-after-v1",
        criteriaJson: "{}",
        implementationVersion: "v1",
        effectiveFrom: "2026-08-15",
        origin: "correction",
        actor: testActor,
        createdAt: "2026-06-18T00:00:00Z",
        reason: "8월 15일로 정정"
      }
    ];

    const events: PolicyEventRecord[] = [
      {
        id: "ev-1",
        policyKind: "changed-worker-priority",
        revisionId: "rev-1",
        eventType: "initialized",
        actor: testActor,
        occurredAt: "2026-06-01T00:00:00Z"
      },
      {
        id: "ev-2",
        policyKind: "changed-worker-priority",
        revisionId: "rev-2",
        eventType: "created",
        actor: testActor,
        occurredAt: "2026-06-10T00:00:00Z"
      },
      {
        id: "ev-cancel-2",
        policyKind: "changed-worker-priority",
        revisionId: "rev-2",
        eventType: "cancelled",
        actor: testActor,
        occurredAt: "2026-06-12T00:00:00Z"
      },
      {
        id: "ev-3",
        policyKind: "changed-worker-priority",
        revisionId: "rev-3",
        eventType: "created",
        actor: testActor,
        occurredAt: "2026-06-15T00:00:00Z"
      },
      {
        id: "ev-correct-3",
        policyKind: "changed-worker-priority",
        revisionId: "rev-3",
        eventType: "corrected",
        replacementRevisionId: "rev-4",
        actor: testActor,
        occurredAt: "2026-06-18T00:00:00Z"
      },
      {
        id: "ev-4",
        policyKind: "changed-worker-priority",
        revisionId: "rev-4",
        eventType: "created",
        actor: testActor,
        occurredAt: "2026-06-18T00:00:00Z"
      }
    ];

    const timeline = resolveActivePolicies(revisions, events, "2026-06-20");
    // rev-2(취소)와 rev-3(정정 교체됨)은 제외되어 rev-1과 rev-4만 남아야 함!
    expect(timeline).toHaveLength(2);
    expect(timeline[0].revision.id).toBe("rev-1");
    expect(timeline[0].effectiveTo).toBe("2026-08-14"); // rev-4 전날까지 연결!
    expect(timeline[1].revision.id).toBe("rev-4");
    expect(timeline[1].effectiveFrom).toBe("2026-08-15");
    expect(timeline[1].effectiveTo).toBeNull();
  });

  it("[PH01] generates deterministic fingerprints for application and month context", () => {
    const bindings = [
      {
        kind: "substitute-eligibility" as const,
        policyId: "rev-sub-v1",
        versionNumber: 1,
        ruleKey: "substitute-legacy" as const,
        effectiveFrom: null,
        criteriaSummary: "Pool만 제외"
      }
    ];

    const fp1 = computePolicyApplicationFingerprint("2026-07-15", bindings);
    const fp2 = computePolicyApplicationFingerprint("2026-07-15", bindings);
    expect(fp1).toBe(fp2);
    expect(fp1.startsWith("pol_snap_")).toBe(true);

    const monthFp = computeMonthPolicyFingerprint("2026-07", {
      "substitute-eligibility": [],
      "changed-worker-priority": []
    });
    expect(monthFp.startsWith("pol_ctx_")).toBe(true);
  });
});
