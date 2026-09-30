import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type DocumentLayoutKey,
  SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS
} from "../../shared/domain/document-layout";
import {
  formatDocumentLayoutStorageKey,
  getBuiltInDocumentLayoutDefinition
} from "./document-layout-definition-service";
import {
  getDocumentLayout,
  getDocumentLayoutDefinitionByRevision,
  listDocumentLayoutHistory,
  listDocumentLayouts,
  resetDocumentLayout,
  saveDocumentLayout
} from "./document-layout-storage-service";
import {
  listStoredDocumentTemplateVersions,
  resetOperationsStorageForTest
} from "./operations-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

describe("document-layout-storage-service", () => {
  beforeEach(() => {
    resetOperationsStorageForTest();
    resetSqliteStorageForTest();
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", `layout-storage-${randomUUID()}.test.sqlite`)
    });
  });

  afterEach(() => {
    resetOperationsStorageForTest();
    resetSqliteStorageForTest();
  });

  // 1. 빈 저장소 list/get built-in fallback (7개 키)
  it("빈 저장소 list/get built-in fallback (7개 키)", () => {
    const list = listDocumentLayouts();
    expect(list.length).toBe(7);
    expect(list.map((item) => formatDocumentLayoutStorageKey(item))).toEqual(SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS);

    for (const item of list) {
      expect(item.activeRevisionId).toBeNull();
      expect(item.usingBuiltInDefault).toBe(true);
      expect(item.updatedAt).toBeNull();
    }

    // getDocumentLayout fallback
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const snapshot = getDocumentLayout(key);
    expect(snapshot.activeRevisionId).toBeNull();
    expect(snapshot.usingBuiltInDefault).toBe(true);
    expect(snapshot.updatedAt).toBeNull();
    expect(snapshot.definition).toEqual(getBuiltInDocumentLayoutDefinition(key));
    expect(snapshot.capabilities.editableProperties.length).toBeGreaterThan(0);

    // PDF 키 fallback도 확인
    const pdfKey: DocumentLayoutKey = { documentKind: "proposal-pdf" };
    const pdfSnapshot = getDocumentLayout(pdfKey);
    expect(pdfSnapshot.activeRevisionId).toBeNull();
    expect(pdfSnapshot.usingBuiltInDefault).toBe(true);
    expect(pdfSnapshot.definition).toEqual(getBuiltInDocumentLayoutDefinition(pdfKey));
  });

  // 2. 첫 save의 raw DB 11개 핵심 열과 snapshot
  it("첫 save의 raw DB 11개 핵심 열과 snapshot", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const def = getBuiltInDocumentLayoutDefinition(key);
    def.outputs[0]!.blocks.find((b) => b.id === "proposal.footer")!.text = "커스텀 제목";

    const snapshot = saveDocumentLayout({
      definition: def,
      expectedRevisionId: null,
      changeReason: "초기 레이아웃 등록"
    });

    expect(snapshot.activeRevisionId).toBeTruthy();
    expect(snapshot.usingBuiltInDefault).toBe(false);
    expect(snapshot.updatedAt).toBeTruthy();
    expect(snapshot.definition.outputs[0]!.blocks.find((b) => b.id === "proposal.footer")!.text).toBe("커스텀 제목");

    // Raw DB 11개 핵심 열 검증
    const db = getSqliteDatabase();
    const row = db.prepare("SELECT * FROM document_template_versions WHERE id = ?").get(snapshot.activeRevisionId) as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.template_type).toBe("proposal-xlsx");
    expect(row.version_label).toBe("v1");
    expect(row.source_path).toBe("");
    expect(row.status).toBe("approved");
    expect(row.is_default).toBe(1);
    expect(row.output_file_name_pattern).toBeNull();
    expect(row.profile_schema_version).toBe("1.0");
    expect(row.profile_json).toBe(JSON.stringify(def));
    expect(JSON.parse(row.validation_json as string)).toEqual({
      operation: "save",
      changeReason: "초기 레이아웃 등록"
    });
    expect(row.checksum).toBeNull();
    expect(row.created_at).toBe(row.updated_at);
    expect(row.created_at).toBe(row.approved_at);
  });

  // 3. 둘째 save가 첫 row 보존·demote, 새 active, v2 history
  it("둘째 save가 첫 row 보존·demote, 새 active, v2 history", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const def1 = getBuiltInDocumentLayoutDefinition(key);
    def1.outputs[0]!.blocks.find((b) => b.id === "proposal.footer")!.text = "버전 1 문구";

    const snap1 = saveDocumentLayout({
      definition: def1,
      expectedRevisionId: null,
      changeReason: "버전 1"
    });

    const def2 = deepClone(def1);
    def2.outputs[0]!.blocks.find((b) => b.id === "proposal.footer")!.text = "버전 2 문구";

    const snap2 = saveDocumentLayout({
      definition: def2,
      expectedRevisionId: snap1.activeRevisionId,
      changeReason: "버전 2"
    });

    expect(snap2.activeRevisionId).not.toBe(snap1.activeRevisionId);
    expect(snap2.definition.outputs[0]!.blocks.find((b) => b.id === "proposal.footer")!.text).toBe("버전 2 문구");

    // DB 확인: row 보존 및 demote
    const db = getSqliteDatabase();
    const rows = db.prepare("SELECT * FROM document_template_versions WHERE template_type = 'proposal-xlsx' AND source_path = '' ORDER BY version_label ASC").all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    expect(rows[0]!.id).toBe(snap1.activeRevisionId);
    expect(rows[0]!.is_default).toBe(0); // demote
    expect(rows[0]!.version_label).toBe("v1");
    expect(rows[1]!.id).toBe(snap2.activeRevisionId);
    expect(rows[1]!.is_default).toBe(1); // new active
    expect(rows[1]!.version_label).toBe("v2");

    // History 확인
    const history = listDocumentLayoutHistory(key);
    expect(history.length).toBe(2);
    expect(history[0]!.revisionId).toBe(snap2.activeRevisionId);
    expect(history[0]!.isActive).toBe(true);
    expect(history[0]!.versionLabel).toBe("v2");
    expect(history[1]!.revisionId).toBe(snap1.activeRevisionId);
    expect(history[1]!.isActive).toBe(false);
    expect(history[1]!.versionLabel).toBe("v1");
  });

  // 4. expected old revision 충돌 mutation 0
  it("expected old revision 충돌 mutation 0", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const def = getBuiltInDocumentLayoutDefinition(key);

    const snap1 = saveDocumentLayout({ definition: def, expectedRevisionId: null });
    const snap2 = saveDocumentLayout({ definition: def, expectedRevisionId: snap1.activeRevisionId });

    // snap1은 이미 구버전이므로 충돌 발생해야 함 (N9)
    expect(() =>
      saveDocumentLayout({
        definition: def,
        expectedRevisionId: snap1.activeRevisionId,
        changeReason: "구버전 기반 저장 시도"
      })
    ).toThrow("동시성 충돌");

    // DB 확인: 여전히 2개 행, snap2만 활성, 추가 행 없음
    const db = getSqliteDatabase();
    const rows = db.prepare("SELECT * FROM document_template_versions WHERE template_type = 'proposal-xlsx'").all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.id === snap2.activeRevisionId)?.is_default).toBe(1);
  });

  // 5. expected null인데 active 존재 충돌 mutation 0
  it("expected null인데 active 존재 충돌 mutation 0", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const def = getBuiltInDocumentLayoutDefinition(key);

    const snap1 = saveDocumentLayout({ definition: def, expectedRevisionId: null });

    // 이미 활성 판이 있는데 expectedRevisionId: null 전달 (N10)
    expect(() =>
      saveDocumentLayout({
        definition: def,
        expectedRevisionId: null,
        changeReason: "null 충돌 시도"
      })
    ).toThrow("동시성 충돌");

    const db = getSqliteDatabase();
    const count = db.prepare("SELECT COUNT(*) as cnt FROM document_template_versions WHERE template_type = 'proposal-xlsx'").get() as { cnt: number };
    expect(count.cnt).toBe(1);
    const active = db.prepare("SELECT * FROM document_template_versions WHERE id = ?").get(snap1.activeRevisionId) as Record<string, unknown>;
    expect(active.is_default).toBe(1);
  });

  // 6. reset이 built-in 복사본 새 판으로 저장
  it("reset이 built-in 복사본 새 판으로 저장", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const modified = getBuiltInDocumentLayoutDefinition(key);
    modified.outputs[0]!.blocks.find((b) => b.id === "proposal.footer")!.text = "수정된 값";

    const snap1 = saveDocumentLayout({ definition: modified, expectedRevisionId: null });

    // Reset 실행
    const resetSnap = resetDocumentLayout({
      documentKind: "proposal-xlsx",
      expectedRevisionId: snap1.activeRevisionId,
      changeReason: "기본값으로 초기화"
    });

    expect(resetSnap.activeRevisionId).not.toBe(snap1.activeRevisionId);
    expect(resetSnap.usingBuiltInDefault).toBe(false); // 새 판이 저장되었으므로 false
    expect(resetSnap.definition).toEqual(getBuiltInDocumentLayoutDefinition(key));

    const db = getSqliteDatabase();
    const rows = db.prepare("SELECT * FROM document_template_versions WHERE template_type = 'proposal-xlsx' ORDER BY version_label ASC").all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    expect(rows[1]!.id).toBe(resetSnap.activeRevisionId);
    expect(rows[1]!.version_label).toBe("v2");
    expect(rows[1]!.is_default).toBe(1);
    expect(JSON.parse(rows[1]!.validation_json as string)).toEqual({
      operation: "reset",
      changeReason: "기본값으로 초기화"
    });
  });

  // 7. history 최신순·isActive 정확히 1
  it("history 최신순·isActive 정확히 1", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const def = getBuiltInDocumentLayoutDefinition(key);

    const s1 = saveDocumentLayout({ definition: def, expectedRevisionId: null, changeReason: "첫번째" });
    const s2 = saveDocumentLayout({ definition: def, expectedRevisionId: s1.activeRevisionId, changeReason: "두번째" });
    const s3 = resetDocumentLayout({ documentKind: "proposal-xlsx", expectedRevisionId: s2.activeRevisionId, changeReason: "초기화" });

    // C2: 동일 timestamp 상황에서도 revision 역순(v3, v2, v1)이 결정적으로 유지되는지 강제 검증
    const db = getSqliteDatabase();
    const fixedTime = "2026-09-22T00:00:00.000Z";
    db.prepare("UPDATE document_template_versions SET created_at = ? WHERE template_type = 'proposal-xlsx'").run(fixedTime);

    const history = listDocumentLayoutHistory(key);
    expect(history.length).toBe(3);
    expect(history.map((h) => h.versionLabel)).toEqual(["v3", "v2", "v1"]);
    expect(history.filter((h) => h.isActive).length).toBe(1);
    expect(history[0]!.isActive).toBe(true);
    expect(history[0]!.revisionId).toBe(s3.activeRevisionId);
    expect(history[0]!.changeReason).toBe("초기화");
    expect(history[1]!.isActive).toBe(false);
    expect(history[2]!.isActive).toBe(false);
  });

  // 8. legacy 4종과 신규 key nonempty source row를 신규 조회에서 무시
  it("legacy 4종과 신규 key nonempty source row를 신규 조회에서 무시", () => {
    const db = getSqliteDatabase();
    const now = new Date().toISOString();

    // Legacy row (source_path 있음, template_type = 'proposal')
    db.prepare(`
      INSERT INTO document_template_versions (
        id, template_type, version_label, source_path, status, is_default, created_at
      ) VALUES ('legacy-1', 'proposal', 'v1', 'C:/templates/proposal.xlsx', 'approved', 1, ?)
    `).run(now);

    // 신규 키이지만 source_path가 비어있지 않은 row (N13)
    db.prepare(`
      INSERT INTO document_template_versions (
        id, template_type, version_label, source_path, status, is_default, created_at
      ) VALUES ('bad-source-1', 'proposal-xlsx', 'v1', 'C:/templates/proposal-new.xlsx', 'approved', 1, ?)
    `).run(now);

    // 신규 조회에서는 위의 두 행을 완전히 무시하고 built-in fallback 반환해야 함
    const list = listDocumentLayouts();
    const propSummary = list.find((item) => item.documentKind === "proposal-xlsx")!;
    expect(propSummary.activeRevisionId).toBeNull();
    expect(propSummary.usingBuiltInDefault).toBe(true);

    const snapshot = getDocumentLayout({ documentKind: "proposal-xlsx" });
    expect(snapshot.activeRevisionId).toBeNull();
    expect(snapshot.usingBuiltInDefault).toBe(true);

    const history = listDocumentLayoutHistory({ documentKind: "proposal-xlsx" });
    expect(history.length).toBe(0);
  });

  // 9. 신규 layout row가 있어도 legacy seed/list 4종 정상
  it("신규 layout row가 있어도 legacy seed/list 4종 정상", () => {
    // 신규 레이아웃 행 먼저 삽입
    saveDocumentLayout({
      definition: getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" }),
      expectedRevisionId: null,
      changeReason: "신규 행 먼저 삽입"
    });

    // legacy list 호출 시 legacy seed가 정상 수행되어 4종(또는 설정된 수) 반환
    const legacyTemplates = listStoredDocumentTemplateVersions();
    expect(legacyTemplates.length).toBeGreaterThan(0);
    // 신규 키('proposal-xlsx')가 legacy 목록에 섞이지 않음
    for (const t of legacyTemplates) {
      expect(["schedule", "proposal", "attachment1", "attachment2"]).toContain(t.templateType);
    }
  });

  // 10. active 2개 data error, 임의 선택/수정 0
  it("active 2개 data error, 임의 선택/수정 0", () => {
    const db = getSqliteDatabase();
    const now = new Date().toISOString();
    const defJson = JSON.stringify(getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" }));

    // 강제로 is_default = 1인 행을 2개 생성 (N11)
    db.prepare(`
      INSERT INTO document_template_versions (id, template_type, version_label, source_path, status, is_default, profile_json, created_at)
      VALUES ('active-1', 'proposal-xlsx', 'v1', '', 'approved', 1, ?, ?)
    `).run(defJson, now);
    db.prepare(`
      INSERT INTO document_template_versions (id, template_type, version_label, source_path, status, is_default, profile_json, created_at)
      VALUES ('active-2', 'proposal-xlsx', 'v2', '', 'approved', 1, ?, ?)
    `).run(defJson, now);

    // list, get, save 모두 데이터 에러 발생해야 함
    expect(() => listDocumentLayouts()).toThrow("활성 레이아웃 판이 2개 이상 존재");
    expect(() => getDocumentLayout({ documentKind: "proposal-xlsx" })).toThrow("활성 레이아웃 판이 2개 이상 존재");
    expect(() =>
      saveDocumentLayout({
        definition: getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" }),
        expectedRevisionId: "active-1"
      })
    ).toThrow("활성 레이아웃 판이 2개 이상 존재");

    // DB 행과 is_default 상태 변조 없음 확인
    const rows = db.prepare("SELECT * FROM document_template_versions WHERE template_type = 'proposal-xlsx'").all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    expect(rows.filter((r) => r.is_default === 1).length).toBe(2);
  });

  // 11. malformed profile JSON 및 storage key/documentKind/variant 불일치 data error
  it("malformed profile JSON 및 storage key/documentKind/variant 불일치 data error", () => {
    const db = getSqliteDatabase();
    const now = new Date().toISOString();

    // 깨진 JSON 저장 (N12)
    db.prepare(`
      INSERT INTO document_template_versions (id, template_type, version_label, source_path, status, is_default, profile_json, created_at)
      VALUES ('corrupt-1', 'proposal-xlsx', 'v1', '', 'approved', 1, '{ broken json ...', ?)
    `).run(now);

    expect(() => getDocumentLayout({ documentKind: "proposal-xlsx" })).toThrow(
      "저장된 레이아웃 JSON 데이터가 올바르지 않습니다"
    );

    // documentKind 불일치 JSON
    const mismatchKindDef = JSON.stringify(getBuiltInDocumentLayoutDefinition({ documentKind: "attachment1-xlsx" }));
    db.prepare("UPDATE document_template_versions SET profile_json = ? WHERE id = 'corrupt-1'").run(mismatchKindDef);

    expect(() => getDocumentLayout({ documentKind: "proposal-xlsx" })).toThrow(
      "저장된 레이아웃 문서 종류('attachment1-xlsx')가 요청된 종류('proposal-xlsx')와 일치하지 않습니다."
    );
  });

  // 12. insert 전후 강제 실패 경로가 transaction rollback으로 이전 active를 보존
  it("insert 전후 강제 실패 경로가 transaction rollback으로 이전 active를 보존", () => {
    const key: DocumentLayoutKey = { documentKind: "proposal-xlsx" };
    const def = getBuiltInDocumentLayoutDefinition(key);

    const snap1 = saveDocumentLayout({ definition: def, expectedRevisionId: null, changeReason: "정상 1" });

    const db = getSqliteDatabase();

    // 트랜잭션 도중 실패를 시뮬레이션하기 위해 테이블에 트리거 추가 (INSERT 시 에러 발생) (N14)
    db.exec(`
      CREATE TRIGGER fail_new_insert
      BEFORE INSERT ON document_template_versions
      WHEN NEW.version_label = 'v2'
      BEGIN
        SELECT RAISE(FAIL, '강제 실패 트리거');
      END;
    `);

    expect(() =>
      saveDocumentLayout({
        definition: def,
        expectedRevisionId: snap1.activeRevisionId,
        changeReason: "실패해야 함"
      })
    ).toThrow("강제 실패 트리거");

    // 이전 active 판이 1로 안전하게 유지되고 v2 행이 삽입되지 않았는지(Rollback) 확인
    const rows = db.prepare("SELECT * FROM document_template_versions WHERE template_type = 'proposal-xlsx'").all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(snap1.activeRevisionId);
    expect(rows[0]!.is_default).toBe(1);
  });

  // 13. 비활성 과거 revision 조회 성공 및 missing/wrong-key/malformed 거절 matrix (Phase 2.5-4 R2/T2)
  it("비활성 과거 revision 조회 성공 및 missing/wrong-key/malformed 거절 matrix (Phase 2.5-4 R2/T2)", () => {
    const key1: DocumentLayoutKey = { documentKind: "schedule-xlsx", variant: "template1" };
    const def1 = getBuiltInDocumentLayoutDefinition(key1);

    // 1) 첫 번째 판 저장 (v1, active)
    const snap1 = saveDocumentLayout({ definition: def1, expectedRevisionId: null, changeReason: "v1 저장" });
    const rev1 = snap1.activeRevisionId!;

    // 2) 두 번째 판 저장 (v2, active -> v1은 이제 inactive)
    const def2 = deepClone(def1);
    const titleBlock = def2.outputs[0]!.blocks.find((b: { id: string }) => b.id === "schedule.title")!;
    titleBlock.text = "두 번째 판 타이틀";
    const snap2 = saveDocumentLayout({ definition: def2, expectedRevisionId: rev1, changeReason: "v2 저장" });
    const rev2 = snap2.activeRevisionId!;
    expect(rev1).not.toBe(rev2);

    // v1이 현재 inactive인지 확인
    const currentActive = getDocumentLayout(key1);
    expect(currentActive.activeRevisionId).toBe(rev2);

    // inactive인 v1을 getDocumentLayoutDefinitionByRevision으로 조회 성공 검증
    const histDef1 = getDocumentLayoutDefinitionByRevision(key1, rev1);
    expect(histDef1).toEqual(def1);

    // active인 v2도 조회 성공 검증
    const histDef2 = getDocumentLayoutDefinitionByRevision(key1, rev2);
    const hist2Title = histDef2.outputs[0]!.blocks.find((b: { id: string }) => b.id === "schedule.title")!;
    expect(hist2Title.text).toBe("두 번째 판 타이틀");

    // 3) Matrix 거절 검증
    // A. 존재하지 않는 revisionId
    expect(() => getDocumentLayoutDefinitionByRevision(key1, randomUUID())).toThrow(
      "레이아웃 판을 찾을 수 없습니다"
    );

    // B. 잘못된 layoutKey (template1 revisionId를 template2로 조회)
    const wrongKey: DocumentLayoutKey = { documentKind: "schedule-xlsx", variant: "template2" };
    expect(() => getDocumentLayoutDefinitionByRevision(wrongKey, rev1)).toThrow(
      "레이아웃 판을 찾을 수 없습니다"
    );

    // C. malformed JSON (DB row의 profile_json이 깨진 경우)
    const db = getSqliteDatabase();
    db.prepare("UPDATE document_template_versions SET profile_json = 'invalid json' WHERE id = ?").run(rev1);
    expect(() => getDocumentLayoutDefinitionByRevision(key1, rev1)).toThrow(
      "저장된 레이아웃 JSON 데이터가 올바르지 않습니다"
    );

    // D. profile_json이 비어있는 경우
    db.prepare("UPDATE document_template_versions SET profile_json = '' WHERE id = ?").run(rev1);
    expect(() => getDocumentLayoutDefinitionByRevision(key1, rev1)).toThrow(
      "저장된 레이아웃 프로필 데이터가 비어 있습니다"
    );

    // E. invalid definition (schemaVersion 불일치 등)
    const invalidDef = JSON.stringify({ ...def1, schemaVersion: 999 });
    db.prepare("UPDATE document_template_versions SET profile_json = ? WHERE id = ?").run(invalidDef, rev1);
    expect(() => getDocumentLayoutDefinitionByRevision(key1, rev1)).toThrow();
  });
});
