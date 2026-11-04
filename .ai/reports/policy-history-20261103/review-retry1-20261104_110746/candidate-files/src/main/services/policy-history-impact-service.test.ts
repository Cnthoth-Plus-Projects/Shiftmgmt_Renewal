import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "./sqlite-storage-service";
import {
  clearPreviewTokensForTest,
  applyPolicyChange,
  previewPolicyChange,
} from "./policy-history-impact-service";
import {
  getActivePolicySummary,
  initializePolicyHistory,
} from "./policy-history-service";

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
    expect(preview.affectedPendingRowCount).toBe(15);
    expect(preview.impactSummary).toContain("15건");
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
    ).toThrowError(/consumed|expired/i);
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
    ).toThrowError(/Actor mismatch/);
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
    ).toThrowError(/changed since preview/);
  });
});
