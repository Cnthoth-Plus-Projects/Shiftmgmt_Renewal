import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getSqliteDatabase,
} from "./sqlite-storage-service";
import {
  initializePolicyHistory,
  isPolicyHistoryInitialized,
  listPolicyHistory,
  selectPolicyForWorkDate
} from "./policy-history-service";
import {
  previewPolicyChange,
  applyPolicyChange
} from "./policy-history-impact-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import type { PolicyActorSnapshot } from "../../shared/domain/policy-history";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "policy-history-integration");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );
  allocatedTestRoots.push(root);
  return root;
};

const adminActor: PolicyActorSnapshot = {
  userId: testAdminSession.userId,
  loginId: testAdminSession.userId,
  displayName: testAdminSession.displayName,
  role: testAdminSession.role
};

describe("policy-history-integration (PH01 ~ PH09)", () => {
  afterEach(async () => {
    for (const root of allocatedTestRoots.splice(0, allocatedTestRoots.length)) {
      await resetPreparedReturnedScheduleRoot(root);
    }
  });

  it("PH01~PH09: complete policy lifecycle - bootstrap, parsing, preview, apply, approval, used event, and immutable lock", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    // 1. Bootstrap: V1 (기존) and V2 (2026-07-01~)
    initializePolicyHistory(database, {
      legacySubstituteDate: "2026-07-01",
      legacyChangedDate: "2026-07-01",
      actor: adminActor
    });
    expect(isPolicyHistoryInitialized(database)).toBe(true);

    // 2. 6/30 vs 7/1 경계 확인:
    // 6월 근무일은 V1(substitute-legacy), 7월 근무일은 V2(substitute-team-type-v1)
    const junPolicy = selectPolicyForWorkDate("substitute-eligibility", "2026-06-30", database);
    expect(junPolicy?.revision.ruleKey).toBe("substitute-legacy");
    expect(junPolicy?.revision.versionNumber).toBe(1);

    const julPolicy = selectPolicyForWorkDate("substitute-eligibility", "2026-07-01", database);
    expect(julPolicy?.revision.ruleKey).toBe("substitute-team-type-v1");
    expect(julPolicy?.revision.versionNumber).toBe(2);

    // 3. 실적 파싱 및 근무일 기준 정책 바인딩:
    // sample1 워크북(2026년 3월) 파싱
    const detail = await syncPreparedReturnedSchedule(fixture);
    expect(detail.entries.length).toBeGreaterThan(0);

    const subEntry = detail.entries.find((e) => e.section === "substitute" && e.appliedPolicies);
    expect(subEntry).toBeDefined();
    expect(subEntry!.appliedPolicies?.bindings).toHaveLength(1);
    expect(subEntry!.appliedPolicies!.bindings[0]!.ruleKey).toBe("substitute-legacy");
    expect(subEntry!.appliedPolicies!.bindings[0]!.policyId).toBe(junPolicy!.revision.id);

    // 4. 새 정책 V3 추가 미리보기 (previewPolicyChange):
    // 9월 1일부터 새로운 정책 추가 (시작일 2026-09-01)
    const previewResult = previewPolicyChange({
      kind: "substitute-eligibility",
      action: "add",
      ruleKey: "substitute-legacy", // 지원 기준 재선택 (V3)
      effectiveFrom: "2026-09-01",
      reason: "9월 정책 기준 변경 테스트",
    }, adminActor, database);

    expect(previewResult.previewToken).toBeDefined();

    // 미리보기 직후에는 DB에 아직 V3가 없어야 함 (변경 0 검증)
    const activeListBefore = listPolicyHistory({ kind: "substitute-eligibility" }, database);
    expect(activeListBefore.total).toBe(2);

    // 5. 확정 (applyPolicyChange):
    const applyResult = applyPolicyChange({
      previewToken: previewResult.previewToken,
    }, adminActor, database);

    expect(applyResult.success).toBe(true);

    // V3가 추가되었으므로 전체 revision은 3개
    const activeListAfter = listPolicyHistory({ kind: "substitute-eligibility" }, database);
    expect(activeListAfter.total).toBe(3);

    // 6. 경계 보존 검증: 9월에 새 정책을 추가해도 7~8월 V2 판정은 불변이어야 함
    const augPolicy = selectPolicyForWorkDate("substitute-eligibility", "2026-08-31", database);
    expect(augPolicy?.revision.versionNumber).toBe(2);
    expect(augPolicy?.revision.ruleKey).toBe("substitute-team-type-v1");

    const sepPolicy = selectPolicyForWorkDate("substitute-eligibility", "2026-09-01", database);
    expect(sepPolicy?.revision.versionNumber).toBe(3);

    // 7. 승인 플로우 및 expectedPolicyFingerprint / used 이벤트 기록:
    // 잘못된 지문 전달 시 거절
    const wrongApproval = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: subEntry!.id,
        expectedPolicyFingerprint: "stale-fingerprint"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath,
        requireExpectedPolicyFingerprint: true
      }
    );
    expect(wrongApproval.ok).toBe(false);
    expect(wrongApproval.errorCode).toBe("POLICY_CONFLICT");

    // 올바른 지문 전달 시 승인 성공
    const goodApproval = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: subEntry!.id,
        expectedPolicyFingerprint: subEntry!.appliedPolicies!.fingerprint
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath,
        requireExpectedPolicyFingerprint: true
      }
    );
    expect(goodApproval.ok).toBe(true);

    // 승인 후 policy_events에 'used' 이벤트가 기록되었는지 확인
    const usedEvents = database.prepare(
      "SELECT * FROM policy_events WHERE event_type = 'used' AND revision_id = ? AND related_approval_id = ?"
    ).all(junPolicy!.revision.id, goodApproval.data!.id);
    expect(usedEvents).toHaveLength(1);

    // 8. 초기 기준 불변성 보호:
    // initial origin 정책(V1)은 취소 불가 (POLICY_IMMUTABLE)
    expect(() => previewPolicyChange({
      kind: "substitute-eligibility",
      action: "cancel",
      targetRevisionId: junPolicy!.revision.id,
      reason: "초기 기준 취소 시도",
    }, adminActor, database)).toThrowError(/Cannot cancel initial baseline policy revision/);

    // 9. 사용된 정책 불변성 보호 (PH-R03/PH-R05):
    // V3에 used 이벤트가 기록된 경우 취소 차단 (POLICY_IN_USE)
    database.prepare(`
      INSERT INTO policy_events (
        id, policy_kind, revision_id, event_type, replacement_revision_id,
        before_json, after_json, actor_user_id, actor_login_id, actor_display_name, actor_role,
        occurred_at, related_approval_id
      ) VALUES (?, ?, ?, 'used', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      "evt-used-test-v3",
      "substitute-eligibility",
      sepPolicy!.revision.id,
      adminActor.userId,
      adminActor.loginId,
      adminActor.displayName,
      adminActor.role,
      new Date().toISOString(),
      "appr-test-v3"
    );

    expect(() => previewPolicyChange({
      kind: "substitute-eligibility",
      action: "cancel",
      targetRevisionId: sepPolicy!.revision.id,
      reason: "사용된 9월 정책 취소 시도",
    }, adminActor, database)).toThrowError(/Cannot cancel a policy that has already been used in approvals/);

    // 10. 미사용 예약 정책의 취소 (PH-R04):
    // 12월 1일 적용 예정 V4를 추가한 뒤, 아직 미사용 상태에서 취소
    const previewV4 = previewPolicyChange({
      kind: "substitute-eligibility",
      action: "add",
      ruleKey: "substitute-team-type-v1",
      effectiveFrom: "2026-12-01",
      reason: "12월 예정 정책 추가",
    }, adminActor, database);
    expect(previewV4.previewToken).toBeDefined();

    const applyV4 = applyPolicyChange({
      previewToken: previewV4.previewToken,
    }, adminActor, database);
    expect(applyV4.success).toBe(true);

    const cancelV4Preview = previewPolicyChange({
      kind: "substitute-eligibility",
      action: "cancel",
      targetRevisionId: applyV4.revisionId,
      reason: "12월 예정 정책 취소",
    }, adminActor, database);
    expect(cancelV4Preview.previewToken).toBeDefined();

    const cancelApply = applyPolicyChange({
      previewToken: cancelV4Preview.previewToken,
    }, adminActor, database);
    expect(cancelApply.success).toBe(true);

    // 취소 후 12월 날짜 조회 시 V3가 계속 유효함을 확인
    const decAfterCancel = selectPolicyForWorkDate("substitute-eligibility", "2026-12-01", database);
    expect(decAfterCancel?.revision.versionNumber).toBe(3);
  });
});
