import { describe, expect, it } from "vitest";
import {
  type DocumentLayoutBlock,
  type DocumentLayoutKey,
  DOCUMENT_LAYOUT_EDITABLE_PROPERTIES,
  DOCUMENT_LAYOUT_PROTECTED_PROPERTIES,
  DOCUMENT_LAYOUT_SCHEMA_VERSION,
  EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
  PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
  SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS,
  SUPPORTED_EXCEL_LAYOUT_STORAGE_KEYS
} from "../../shared/domain/document-layout";
import {
  assertValidDocumentLayoutDefinition,
  formatDocumentLayoutStorageKey,
  getBuiltInDocumentLayoutDefinition,
  getDocumentLayoutCapabilities,
  isSupportedDocumentLayoutKey,
  isSupportedExcelLayoutKey,
  parseDocumentLayoutStorageKey,
  validateDocumentLayoutDefinition
} from "./document-layout-definition-service";

const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

describe("document-layout-definition-service", () => {
  // 1. 7개 key 직렬화/역직렬화와 variant 거절 (N1)
  it("7개 key 직렬화/역직렬화와 variant 거절 (N1)", () => {
    const validPairs: Array<{ key: DocumentLayoutKey; storageKey: string }> = [
      { key: { documentKind: "schedule-xlsx", variant: "template1" }, storageKey: "schedule-xlsx/template1" },
      { key: { documentKind: "schedule-xlsx", variant: "template2" }, storageKey: "schedule-xlsx/template2" },
      { key: { documentKind: "proposal-xlsx" }, storageKey: "proposal-xlsx" },
      { key: { documentKind: "attachment1-xlsx" }, storageKey: "attachment1-xlsx" },
      { key: { documentKind: "attachment2-xlsx" }, storageKey: "attachment2-xlsx" },
      { key: { documentKind: "proposal-pdf" }, storageKey: "proposal-pdf" },
      { key: { documentKind: "dashboard-report-pdf" }, storageKey: "dashboard-report-pdf" }
    ];

    for (const pair of validPairs) {
      expect(formatDocumentLayoutStorageKey(pair.key)).toBe(pair.storageKey);
      expect(parseDocumentLayoutStorageKey(pair.storageKey)).toEqual(pair.key);
    }

    // N1: schedule variant 누락 또는 비schedule variant 주입 거절
    expect(() => formatDocumentLayoutStorageKey({ documentKind: "schedule-xlsx" } as unknown as DocumentLayoutKey)).toThrow(
      "근무표 레이아웃에는 유효한 변형('template1' 또는 'template2')이 필수입니다."
    );
    expect(() =>
      formatDocumentLayoutStorageKey({
        documentKind: "schedule-xlsx",
        variant: "template3" as unknown as "template1"
      })
    ).toThrow("근무표 레이아웃에는 유효한 변형('template1' 또는 'template2')이 필수입니다.");
    expect(() =>
      formatDocumentLayoutStorageKey({
        documentKind: "proposal-xlsx",
        variant: "template1" as unknown as undefined
      } as unknown as DocumentLayoutKey)
    ).toThrow("근무표 외 문서 종류에는 변형을 지정할 수 없습니다.");

    // 역직렬화 거절
    expect(() => parseDocumentLayoutStorageKey("schedule-xlsx")).toThrow(
      "근무표 레이아웃에는 변형('template1' 또는 'template2')이 필수입니다."
    );
    expect(() => parseDocumentLayoutStorageKey("schedule-xlsx/unknown")).toThrow(
      "지원하지 않는 근무표 레이아웃 변형입니다: schedule-xlsx/unknown"
    );
    expect(() => parseDocumentLayoutStorageKey("unknown-doc")).toThrow(
      "지원하지 않는 문서 레이아웃 키입니다: unknown-doc"
    );
  });

  // 2. 7개 지원 key 고정 순서 및 PDF 기본 정의 지원 (T2)
  it("7개 지원 key 고정 순서 및 PDF 기본 정의 지원 (T2)", () => {
    const expected5ExcelKeys = [
      "schedule-xlsx/template1",
      "schedule-xlsx/template2",
      "proposal-xlsx",
      "attachment1-xlsx",
      "attachment2-xlsx"
    ];
    const expected7DocKeys = [
      "schedule-xlsx/template1",
      "schedule-xlsx/template2",
      "proposal-xlsx",
      "attachment1-xlsx",
      "attachment2-xlsx",
      "proposal-pdf",
      "dashboard-report-pdf"
    ];
    expect(SUPPORTED_EXCEL_LAYOUT_STORAGE_KEYS).toEqual(expected5ExcelKeys);
    expect(SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS).toEqual(expected7DocKeys);

    for (const key of expected5ExcelKeys) {
      expect(isSupportedExcelLayoutKey(key)).toBe(true);
      expect(isSupportedExcelLayoutKey(parseDocumentLayoutStorageKey(key))).toBe(true);
    }

    for (const key of expected7DocKeys) {
      expect(isSupportedDocumentLayoutKey(key)).toBe(true);
      expect(isSupportedDocumentLayoutKey(parseDocumentLayoutStorageKey(key))).toBe(true);
    }

    expect(isSupportedExcelLayoutKey("proposal-pdf")).toBe(false);
    expect(isSupportedExcelLayoutKey("dashboard-report-pdf")).toBe(false);
    expect(isSupportedExcelLayoutKey("unknown-xlsx")).toBe(false);
    expect(isSupportedDocumentLayoutKey("unknown-doc")).toBe(false);

    // PDF 키 기본 정의가 올바르게 반환되는지 검증
    const propPdf = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
    expect(propPdf.schemaVersion).toBe(DOCUMENT_LAYOUT_SCHEMA_VERSION);
    expect(propPdf.generatorCompatibilityVersion).toBe(PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION);
    expect(propPdf.outputs).toHaveLength(3);
    expect(propPdf.outputs.map((o) => o.memberId)).toEqual(["proposal", "attachment1", "attachment2"]);

    const dashPdf = getBuiltInDocumentLayoutDefinition({ documentKind: "dashboard-report-pdf" });
    expect(dashPdf.schemaVersion).toBe(DOCUMENT_LAYOUT_SCHEMA_VERSION);
    expect(dashPdf.generatorCompatibilityVersion).toBe(PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION);
    expect(dashPdf.outputs).toHaveLength(1);
    expect(dashPdf.outputs[0]!.memberId).toBe("main");
  });

  // 3. 5개 canvas/output/member/file-name 기본값
  it("5개 canvas/output/member/file-name 기본값", () => {
    const expectedConfigs: Array<{
      key: DocumentLayoutKey;
      width: number;
      height: number;
      pattern: string;
      blockCount: number;
    }> = [
      {
        key: { documentKind: "schedule-xlsx", variant: "template1" },
        width: 71,
        height: 80,
        pattern: "{year}년/{monthNumber}월/{year}_{monthNumber}_{siteName}.xlsx",
        blockCount: 13
      },
      {
        key: { documentKind: "schedule-xlsx", variant: "template2" },
        width: 71,
        height: 80,
        pattern: "{year}년/{monthNumber}월/{year}_{monthNumber}_{siteName}.xlsx",
        blockCount: 13
      },
      {
        key: { documentKind: "proposal-xlsx" },
        width: 9,
        height: 44,
        pattern: "{year}년/{month2}월/{year}_{month2}_품의서.xlsx",
        blockCount: 9
      },
      {
        key: { documentKind: "attachment1-xlsx" },
        width: 19,
        height: 92,
        pattern: "{year}년/{month2}월/{year}_{month2}_별첨1.xlsx",
        blockCount: 6
      },
      {
        key: { documentKind: "attachment2-xlsx" },
        width: 7,
        height: 86,
        pattern: "{year}년/{month2}월/{year}_{month2}_별첨2.xlsx",
        blockCount: 4
      }
    ];

    for (const conf of expectedConfigs) {
      const def = getBuiltInDocumentLayoutDefinition(conf.key);
      expect(def.schemaVersion).toBe(DOCUMENT_LAYOUT_SCHEMA_VERSION);
      expect(def.generatorCompatibilityVersion).toBe(EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION);
      expect(def.documentKind).toBe(conf.key.documentKind);
      if ("variant" in conf.key) {
        expect(def.variant).toBe(conf.key.variant);
      } else {
        expect(def.variant).toBeUndefined();
      }
      expect(def.outputs.length).toBe(1);
      const out = def.outputs[0]!;
      expect(out.memberId).toBe("main");
      expect(out.outputFileNamePattern).toBe(conf.pattern);
      expect(out.canvas).toEqual({
        width: conf.width,
        height: conf.height,
        unit: "cell"
      });
      expect(out.blocks.length).toBe(conf.blockCount);
    }
  });

  // 4. §5.1 block ID·0-based geometry 정확성 (C1 canonical ID 전체)
  it("§5.1 block ID·0-based geometry 정확성", () => {
    // Schedule template 1
    const t1 = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const b1 = t1.outputs[0]!.blocks;
    expect(b1.map((b) => b.id)).toEqual([
      "schedule.title",
      "schedule.description",
      "schedule.site",
      "schedule.calendar-heading",
      "schedule.roster",
      "schedule.calendar-grid",
      "schedule.reschedule-note",
      "schedule.reschedule",
      "schedule.substitute-note",
      "schedule.substitute",
      "schedule.overtime-note",
      "schedule.overtime",
      "schedule.month-anchors"
    ]);
    expect(b1.find((b) => b.id === "schedule.title")?.x).toBe(0); // A1:W1
    expect(b1.find((b) => b.id === "schedule.title")?.y).toBe(0);
    expect(b1.find((b) => b.id === "schedule.title")?.width).toBe(23);
    expect(b1.find((b) => b.id === "schedule.title")?.height).toBe(1);
    expect(b1.find((b) => b.id === "schedule.calendar-grid")?.x).toBe(1); // B8:W44
    expect(b1.find((b) => b.id === "schedule.calendar-grid")?.y).toBe(7);
    expect(b1.find((b) => b.id === "schedule.calendar-grid")?.width).toBe(22);
    expect(b1.find((b) => b.id === "schedule.calendar-grid")?.height).toBe(37);
    expect(b1.find((b) => b.id === "schedule.reschedule")?.x).toBe(24); // Y9:AY42
    expect(b1.find((b) => b.id === "schedule.reschedule")?.y).toBe(8);
    expect(b1.find((b) => b.id === "schedule.reschedule")?.width).toBe(27);
    expect(b1.find((b) => b.id === "schedule.reschedule")?.height).toBe(34);
    expect(b1.find((b) => b.id === "schedule.month-anchors")?.x).toBe(50); // AY8:BK30
    expect(b1.find((b) => b.id === "schedule.month-anchors")?.y).toBe(7);
    expect(b1.find((b) => b.id === "schedule.month-anchors")?.width).toBe(13);
    expect(b1.find((b) => b.id === "schedule.month-anchors")?.height).toBe(23);

    // Schedule template 2
    const t2 = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template2" });
    const b2 = t2.outputs[0]!.blocks;
    expect(b2.map((b) => b.id)).toEqual([
      "schedule.title",
      "schedule.description",
      "schedule.site",
      "schedule.calendar-heading",
      "schedule.roster",
      "schedule.calendar-grid",
      "schedule.reschedule-note",
      "schedule.reschedule",
      "schedule.substitute-note",
      "schedule.substitute",
      "schedule.overtime-note",
      "schedule.overtime",
      "schedule.month-anchors"
    ]);
    expect(b2.find((b) => b.id === "schedule.calendar-grid")?.width).toBe(22); // B8:W68
    expect(b2.find((b) => b.id === "schedule.calendar-grid")?.height).toBe(61);
    expect(b2.find((b) => b.id === "schedule.reschedule")?.x).toBe(24); // Y9:BG42
    expect(b2.find((b) => b.id === "schedule.reschedule")?.y).toBe(8);
    expect(b2.find((b) => b.id === "schedule.reschedule")?.width).toBe(35);
    expect(b2.find((b) => b.id === "schedule.reschedule")?.height).toBe(34);
    expect(b2.find((b) => b.id === "schedule.month-anchors")?.x).toBe(58); // BG8:BS30
    expect(b2.find((b) => b.id === "schedule.month-anchors")?.y).toBe(7);
    expect(b2.find((b) => b.id === "schedule.month-anchors")?.width).toBe(13);
    expect(b2.find((b) => b.id === "schedule.month-anchors")?.height).toBe(23);

    // Proposal
    const prop = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const bp = prop.outputs[0]!.blocks;
    expect(bp.map((b) => b.id)).toEqual([
      "proposal.logo",
      "proposal.decision",
      "proposal.meta",
      "proposal.title",
      "proposal.scope",
      "proposal.regular-summary",
      "proposal.early-summary",
      "proposal.grand-total",
      "proposal.footer"
    ]);
    expect(bp.find((b) => b.id === "proposal.logo")?.x).toBe(0); // A1:C1
    expect(bp.find((b) => b.id === "proposal.logo")?.y).toBe(0);
    expect(bp.find((b) => b.id === "proposal.logo")?.width).toBe(3);
    expect(bp.find((b) => b.id === "proposal.logo")?.height).toBe(1);
    expect(bp.find((b) => b.id === "proposal.meta")?.x).toBe(0); // A5:I9
    expect(bp.find((b) => b.id === "proposal.meta")?.y).toBe(4);
    expect(bp.find((b) => b.id === "proposal.meta")?.width).toBe(9);
    expect(bp.find((b) => b.id === "proposal.meta")?.height).toBe(5);
    expect(bp.find((b) => b.id === "proposal.footer")?.x).toBe(1); // B32:I33
    expect(bp.find((b) => b.id === "proposal.footer")?.y).toBe(31);
    expect(bp.find((b) => b.id === "proposal.footer")?.width).toBe(8);
    expect(bp.find((b) => b.id === "proposal.footer")?.height).toBe(2);

    // Attachment 1
    const att1 = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment1-xlsx" });
    const ba1 = att1.outputs[0]!.blocks;
    expect(ba1.map((b) => b.id)).toEqual([
      "attachment1.logo",
      "attachment1.title",
      "attachment1.regular-table",
      "attachment1.early-title",
      "attachment1.early-table",
      "attachment1.rate-guide"
    ]);
    expect(ba1.find((b) => b.id === "attachment1.logo")?.x).toBe(16); // Q1:S1
    expect(ba1.find((b) => b.id === "attachment1.logo")?.y).toBe(0);
    expect(ba1.find((b) => b.id === "attachment1.title")?.x).toBe(0); // A1:P1
    expect(ba1.find((b) => b.id === "attachment1.title")?.y).toBe(0);
    expect(ba1.find((b) => b.id === "attachment1.rate-guide")?.x).toBe(0); // A24:S45
    expect(ba1.find((b) => b.id === "attachment1.rate-guide")?.y).toBe(23);
    expect(ba1.find((b) => b.id === "attachment1.rate-guide")?.width).toBe(19);
    expect(ba1.find((b) => b.id === "attachment1.rate-guide")?.height).toBe(22);

    // Attachment 2
    const att2 = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment2-xlsx" });
    const ba2 = att2.outputs[0]!.blocks;
    expect(ba2.map((b) => b.id)).toEqual([
      "attachment2.logo",
      "attachment2.title",
      "attachment2.period",
      "attachment2.table"
    ]);
    expect(ba2.find((b) => b.id === "attachment2.logo")?.x).toBe(5); // F1:G1
    expect(ba2.find((b) => b.id === "attachment2.logo")?.y).toBe(0);
    expect(ba2.find((b) => b.id === "attachment2.title")?.x).toBe(0); // A1:E1
    expect(ba2.find((b) => b.id === "attachment2.title")?.y).toBe(0);
    expect(ba2.find((b) => b.id === "attachment2.table")?.x).toBe(0); // A3:G86
    expect(ba2.find((b) => b.id === "attachment2.table")?.y).toBe(2);
    expect(ba2.find((b) => b.id === "attachment2.table")?.width).toBe(7);
    expect(ba2.find((b) => b.id === "attachment2.table")?.height).toBe(84);
  });

  // 5. capabilities 고정 순서와 공통 protected 5종
  it("capabilities 고정 순서와 공통 protected 5종", () => {
    expect(DOCUMENT_LAYOUT_EDITABLE_PROPERTIES).toEqual([
      "position",
      "size",
      "visibility",
      "text",
      "logo",
      "column-width",
      "font"
    ]);
    expect(DOCUMENT_LAYOUT_PROTECTED_PROPERTIES).toEqual([
      "row-order",
      "value",
      "binding",
      "row-height",
      "merge"
    ]);

    const def = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const caps = getDocumentLayoutCapabilities(def);
    expect(caps.editableProperties).toEqual(DOCUMENT_LAYOUT_EDITABLE_PROPERTIES);
    expect(caps.protectedProperties).toEqual(DOCUMENT_LAYOUT_PROTECTED_PROPERTIES);
  });

  // 6. block별 capability와 protected metadata (C5 bound title text 제외 확인)
  it("block별 capability와 protected metadata", () => {
    const t1 = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const caps1 = getDocumentLayoutCapabilities(t1);

    // month-anchors는 protectedBlockIds에 포함되고 editableProperties는 빈 배열이어야 함
    expect(caps1.protectedBlockIds).toContain("schedule.month-anchors");
    const monthCap = caps1.blockCapabilities.find((b) => b.blockId === "schedule.month-anchors");
    expect(monthCap).toBeDefined();
    expect(monthCap?.editableProperties).toEqual([]);
    expect(monthCap?.protectedProperties).toEqual([
      "row-order",
      "value",
      "binding",
      "row-height",
      "merge",
      "position",
      "size",
      "visibility",
      "text",
      "logo",
      "column-width",
      "font"
    ]);

    // calendar-grid: position, column-width, font만 editable
    const calCap = caps1.blockCapabilities.find((b) => b.blockId === "schedule.calendar-grid");
    expect(calCap?.editableProperties).toEqual(["position", "column-width", "font"]);
    expect(calCap?.protectedProperties).toEqual([
      "row-order",
      "value",
      "binding",
      "row-height",
      "merge",
      "size",
      "visibility",
      "text",
      "logo"
    ]);

    // proposal.logo: position, size, visibility, logo
    const prop = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const propCaps = getDocumentLayoutCapabilities(prop);
    const logoCap = propCaps.blockCapabilities.find((b) => b.blockId === "proposal.logo");
    expect(logoCap?.editableProperties).toEqual(["position", "size", "visibility", "logo"]);
    expect(logoCap?.protectedProperties).toEqual([
      "row-order",
      "value",
      "binding",
      "row-height",
      "merge",
      "text",
      "column-width",
      "font"
    ]);

    // C5: attachment1.title과 attachment2.title은 바인딩되어 있으므로 editable에 text가 없어야 함!
    const att1 = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment1-xlsx" });
    const att1Caps = getDocumentLayoutCapabilities(att1);
    const att1TitleCap = att1Caps.blockCapabilities.find((b) => b.blockId === "attachment1.title");
    expect(att1TitleCap?.editableProperties).toEqual(["position", "size", "visibility", "font"]);
    expect(att1TitleCap?.protectedProperties).toContain("text");
    expect(att1TitleCap?.protectedProperties).toContain("binding");

    const att2 = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment2-xlsx" });
    const att2Caps = getDocumentLayoutCapabilities(att2);
    const att2TitleCap = att2Caps.blockCapabilities.find((b) => b.blockId === "attachment2.title");
    expect(att2TitleCap?.editableProperties).toEqual(["position", "size", "visibility", "font"]);
    expect(att2TitleCap?.protectedProperties).toContain("text");

    // regular-table in attachment1: position, size, visibility, column-width, font
    const tableCap = att1Caps.blockCapabilities.find((b) => b.blockId === "attachment1.regular-table");
    expect(tableCap?.editableProperties).toEqual(["position", "size", "visibility", "column-width", "font"]);
  });

  // 7. 5개 built-in 정의 preview/save baseline 통과 + deep clone 격리
  it("5개 built-in 정의 preview/save baseline 통과 + deep clone 격리", () => {
    const keys: DocumentLayoutKey[] = [
      { documentKind: "schedule-xlsx", variant: "template1" },
      { documentKind: "schedule-xlsx", variant: "template2" },
      { documentKind: "proposal-xlsx" },
      { documentKind: "attachment1-xlsx" },
      { documentKind: "attachment2-xlsx" }
    ];

    for (const key of keys) {
      const def = getBuiltInDocumentLayoutDefinition(key);
      const previewIssues = validateDocumentLayoutDefinition(def, "preview");
      const saveIssues = validateDocumentLayoutDefinition(def, "save");
      expect(previewIssues).toEqual([]);
      expect(saveIssues).toEqual([]);
      expect(() => assertValidDocumentLayoutDefinition(def, "save")).not.toThrow();

      // Deep clone 격리 확인
      def.outputs[0]!.canvas.width = 9999;
      def.outputs[0]!.blocks[0]!.text = "MODIFIED";
      const freshDef = getBuiltInDocumentLayoutDefinition(key);
      expect(freshDef.outputs[0]!.canvas.width).not.toBe(9999);
      expect(freshDef.outputs[0]!.blocks[0]!.text).not.toBe("MODIFIED");
    }
  });

  // 8. top-level/key/schema/generator/canvas 구조 변경 거절 (N2, C3)
  it("top-level/key/schema/generator/canvas 구조 변경 거절 (N2)", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });

    // non-object candidate
    expect(validateDocumentLayoutDefinition(null, "save").some((i) => i.code === "INVALID_DEFINITION_OBJECT")).toBe(true);
    expect(validateDocumentLayoutDefinition([], "save").some((i) => i.code === "INVALID_DEFINITION_OBJECT")).toBe(true);

    // schemaVersion mismatch
    const badSchema = deepClone(base);
    badSchema.schemaVersion = "2.0";
    expect(validateDocumentLayoutDefinition(badSchema, "save").some((i) => i.code === "UNSUPPORTED_SCHEMA_VERSION")).toBe(true);

    // generatorCompatibilityVersion mismatch
    const badGen = deepClone(base);
    badGen.generatorCompatibilityVersion = "excel-v2";
    expect(validateDocumentLayoutDefinition(badGen, "save").some((i) => i.code === "UNSUPPORTED_GENERATOR_COMPATIBILITY_VERSION")).toBe(true);

    // documentKind mismatch
    const badKind = deepClone(base);
    badKind.documentKind = "schedule-xlsx" as unknown as typeof base.documentKind;
    expect(validateDocumentLayoutDefinition(badKind, "save").some((i) => i.code === "INVALID_SCHEDULE_VARIANT")).toBe(true);

    // canvas structure modification (크기 변경)
    const badCanvas = deepClone(base);
    badCanvas.outputs[0]!.canvas.width = 100;
    expect(validateDocumentLayoutDefinition(badCanvas, "save").some((i) => i.code === "PROTECTED_CANVAS_MODIFIED")).toBe(true);

    // C3: Excel canvas에 PDF optional 필드 주입 거절
    const canvasWithPdfField = deepClone(base);
    (canvasWithPdfField.outputs[0]!.canvas as Record<string, unknown>).paperSize = "A4";
    expect(validateDocumentLayoutDefinition(canvasWithPdfField, "save").some((i) => i.code === "PROTECTED_CANVAS_MODIFIED")).toBe(true);

    const canvasWithOrientation = deepClone(base);
    (canvasWithOrientation.outputs[0]!.canvas as Record<string, unknown>).orientation = "landscape";
    expect(validateDocumentLayoutDefinition(canvasWithOrientation, "save").some((i) => i.code === "PROTECTED_CANVAS_MODIFIED")).toBe(true);
  });

  // 9. output member 중복/누락/순서/ID 변경 거절 (N3)
  it("output member 중복/누락/순서/ID 변경 거절 (N3)", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });

    // Empty outputs
    const emptyOutputs = deepClone(base);
    emptyOutputs.outputs = [] as unknown as typeof base.outputs;
    expect(validateDocumentLayoutDefinition(emptyOutputs, "save").some((i) => i.code === "INVALID_OUTPUTS")).toBe(true);

    // Output length mismatch
    const extraOutput = deepClone(base);
    extraOutput.outputs.push(deepClone(base.outputs[0]!));
    expect(validateDocumentLayoutDefinition(extraOutput, "save").some((i) => i.code === "OUTPUT_MEMBER_COUNT_MISMATCH")).toBe(true);

    // Member ID mismatch
    const badMemberId = deepClone(base);
    badMemberId.outputs[0]!.memberId = "sheet2" as unknown as typeof base.outputs[0]["memberId"];
    expect(validateDocumentLayoutDefinition(badMemberId, "save").some((i) => i.code === "OUTPUT_MEMBER_ID_MISMATCH")).toBe(true);
  });

  // 10. block 중복/누락/순서/kind/binding/structural 변경 거절 (N3, N4, C5)
  it("block 중복/누락/순서/kind/binding/structural 변경 거절 (N3, N4)", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });

    // Block count mismatch
    const missingBlock = deepClone(base);
    missingBlock.outputs[0]!.blocks.pop();
    expect(validateDocumentLayoutDefinition(missingBlock, "save").some((i) => i.code === "BLOCK_COUNT_MISMATCH")).toBe(true);

    // Block reorder / ID mismatch
    const reordered = deepClone(base);
    const blocks = reordered.outputs[0]!.blocks;
    const temp = blocks[0]!;
    blocks[0] = blocks[1]!;
    blocks[1] = temp;
    expect(validateDocumentLayoutDefinition(reordered, "save").some((i) => i.code === "BLOCK_ORDER_MISMATCH")).toBe(true);

    // Block kind change (N4)
    const badKind = deepClone(base);
    badKind.outputs[0]!.blocks[0]!.kind = "table";
    expect(validateDocumentLayoutDefinition(badKind, "save").some((i) => i.code === "PROTECTED_BLOCK_KIND_MODIFIED")).toBe(true);

    // Block bindingKey change (N4)
    const badBinding = deepClone(base);
    badBinding.outputs[0]!.blocks[0]!.bindingKey = "custom_binding";
    expect(validateDocumentLayoutDefinition(badBinding, "save").some((i) => i.code === "PROTECTED_BINDING_KEY_MODIFIED")).toBe(true);

    // Structural attribute change (flowOrder, autoHeight, etc.) (N4)
    const badFlow = deepClone(base);
    badFlow.outputs[0]!.blocks[0]!.flowOrder = 99;
    expect(validateDocumentLayoutDefinition(badFlow, "save").some((i) => i.code === "PROTECTED_STRUCTURAL_ATTRIBUTE_MODIFIED")).toBe(true);

    // C5: attachment1.title처럼 바인딩된 title 블록에 임의 text 주입 시 거절
    const att1 = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment1-xlsx" });
    const boundTitleEdit = deepClone(att1);
    boundTitleEdit.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "attachment1.title")!.text = "임의의 변조 문구";
    expect(validateDocumentLayoutDefinition(boundTitleEdit, "save").some((i) => i.code === "PROTECTED_PROPERTY_MODIFIED")).toBe(true);
  });

  // 11. geometry/font/color/file-name/unknown key 음성 입력 거절 (N5, N6, N7, C2, C4)
  it("geometry/font/color/file-name/unknown key 음성 입력 거절 (N5, N6, N7)", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });

    // Unknown top-level key (N5)
    const unknownTopKey = deepClone(base) as Record<string, unknown>;
    unknownTopKey.extraField = "forbidden";
    expect(validateDocumentLayoutDefinition(unknownTopKey, "save").some((i) => i.code === "UNKNOWN_DEFINITION_PROPERTY")).toBe(true);

    // Unknown block key (row-height, merge, unknown) (N5)
    const unknownBlockKey = deepClone(base);
    (unknownBlockKey.outputs[0]!.blocks[0] as unknown as Record<string, unknown>)["row-height"] = 25;
    expect(validateDocumentLayoutDefinition(unknownBlockKey, "save").some((i) => i.code === "UNKNOWN_BLOCK_PROPERTY")).toBe(true);

    // Geometry errors: NaN, Infinity, negative, zero, out of canvas (N6)
    const negX = deepClone(base);
    negX.outputs[0]!.blocks[0]!.x = -1;
    expect(validateDocumentLayoutDefinition(negX, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    const zeroWidth = deepClone(base);
    zeroWidth.outputs[0]!.blocks[0]!.width = 0;
    expect(validateDocumentLayoutDefinition(zeroWidth, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    const nanY = deepClone(base);
    nanY.outputs[0]!.blocks[0]!.y = Number.NaN;
    expect(validateDocumentLayoutDefinition(nanY, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    const outOfCanvas = deepClone(base);
    outOfCanvas.outputs[0]!.blocks[0]!.x = 8;
    outOfCanvas.outputs[0]!.blocks[0]!.width = 5; // x(8) + width(5) = 13 > canvas.width(9)
    expect(validateDocumentLayoutDefinition(outOfCanvas, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    // C2 반례 1: visible-string (문자열 visible 거부)
    const badVisible = deepClone(base);
    (badVisible.outputs[0]!.blocks[0] as unknown as Record<string, unknown>).visible = "yes";
    expect(validateDocumentLayoutDefinition(badVisible, "save").some((i) => i.code === "INVALID_BLOCK_VISIBILITY")).toBe(true);

    // C2 반례 2: text-object (객체 text 거부)
    const badTextObj = deepClone(base);
    (badTextObj.outputs[0]!.blocks[3] as unknown as Record<string, unknown>).text = { evil: true };
    expect(validateDocumentLayoutDefinition(badTextObj, "save").some((i) => i.code === "INVALID_BLOCK_TEXT")).toBe(true);

    // C2 반례 3: logo-number (숫자 logoAssetId 거부)
    const badLogoNum = deepClone(base);
    (badLogoNum.outputs[0]!.blocks[0] as unknown as Record<string, unknown>).logoAssetId = 12345;
    expect(validateDocumentLayoutDefinition(badLogoNum, "save").some((i) => i.code === "INVALID_LOGO_ASSET_ID")).toBe(true);

    // C2 반례 4: column-width-invalid (음수/문자열 columnWidths 거부)
    const badCw = deepClone(base);
    badCw.outputs[0]!.blocks[5]!.columnWidths = { colA: -10 };
    expect(validateDocumentLayoutDefinition(badCw, "save").some((i) => i.code === "INVALID_COLUMN_WIDTHS")).toBe(true);

    // C2 반례 5: font-flags-invalid (문자열 bold, 숫자 italic 거부)
    const badFontFlags = deepClone(base);
    (badFontFlags.outputs[0]!.blocks[3] as unknown as Record<string, unknown>).font = {
      family: "맑은 고딕",
      sizePt: 12,
      bold: "yes",
      italic: 1
    };
    const fontFlagIssues = validateDocumentLayoutDefinition(badFontFlags, "save");
    expect(fontFlagIssues.some((i) => i.code === "INVALID_FONT_BOLD")).toBe(true);
    expect(fontFlagIssues.some((i) => i.code === "INVALID_FONT_ITALIC")).toBe(true);

    // Font size and color errors
    const badFont = deepClone(base);
    badFont.outputs[0]!.blocks[3]!.font = {
      family: "맑은 고딕",
      sizePt: -5,
      color: "#INVALID_HEX"
    };
    const fontIssues = validateDocumentLayoutDefinition(badFont, "save");
    expect(fontIssues.some((i) => i.code === "INVALID_FONT_SIZE")).toBe(true);
    expect(fontIssues.some((i) => i.code === "INVALID_FONT_COLOR")).toBe(true);

    // C4 반례: Windows 금지 문자 ('?'), NUL, 제어문자, 슬래시 경로
    const badFileName = deepClone(base);
    badFileName.outputs[0]!.outputFileNamePattern = "../escape/file.xlsx";
    expect(validateDocumentLayoutDefinition(badFileName, "save").some((i) => i.code === "DISALLOWED_FILE_NAME_PATTERN_PATH")).toBe(true);

    const questionMarkFile = deepClone(base);
    questionMarkFile.outputs[0]!.outputFileNamePattern = "proposal_?.xlsx";
    expect(validateDocumentLayoutDefinition(questionMarkFile, "save").some((i) => i.code === "DISALLOWED_FILE_NAME_PATTERN_PATH")).toBe(true);

    // C4 반례: 닫히지 않은 중괄호 ({bad)
    const unclosedBraceFile = deepClone(base);
    unclosedBraceFile.outputs[0]!.outputFileNamePattern = "{year}년/{bad.xlsx";
    expect(validateDocumentLayoutDefinition(unclosedBraceFile, "save").some((i) => i.code === "UNMATCHED_FILE_NAME_PATTERN_TOKEN")).toBe(true);

    // C4 반례: 미지원 치환 토큰
    const badTokenFileName = deepClone(base);
    badTokenFileName.outputs[0]!.outputFileNamePattern = "{invalidToken}.xlsx";
    expect(validateDocumentLayoutDefinition(badTokenFileName, "save").some((i) => i.code === "UNKNOWN_FILE_NAME_PATTERN_TOKEN")).toBe(true);

    // 3b: Non-integer geometry check (소수 좌표/크기 거부)
    const floatGeom = deepClone(base);
    floatGeom.outputs[0]!.blocks[0]!.x = 1.5;
    expect(validateDocumentLayoutDefinition(floatGeom, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    const floatHeight = deepClone(base);
    floatHeight.outputs[0]!.blocks[0]!.height = 2.5;
    expect(validateDocumentLayoutDefinition(floatHeight, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    // 3b: Non-.xlsx extension check (Excel 아닌 확장자 거부)
    const nonXlsxPattern = deepClone(base);
    nonXlsxPattern.outputs[0]!.outputFileNamePattern = "{year}년/{month2}월/{year}_{month2}_품의서.pdf";
    expect(validateDocumentLayoutDefinition(nonXlsxPattern, "save").some((i) => i.code === "INVALID_FILE_NAME_PATTERN_EXTENSION")).toBe(true);

    // 3b: Unknown logoAssetId check ("brand-logo" 외 식별자 거부)
    const unknownLogo = deepClone(base);
    unknownLogo.outputs[0]!.blocks[0]!.logoAssetId = "unsupported-corp-logo";
    expect(validateDocumentLayoutDefinition(unknownLogo, "save").some((i) => i.code === "UNKNOWN_LOGO_ASSET_ID")).toBe(true);

    // 3b: Relative columnWidths key validation (대문자 A, B, AA 정상 vs 소문자/범위 밖/잘못된 키)
    const badColKeyLower = deepClone(base);
    badColKeyLower.outputs[0]!.blocks[5]!.columnWidths = { a: 15 };
    expect(validateDocumentLayoutDefinition(badColKeyLower, "save").some((i) => i.code === "INVALID_COLUMN_WIDTH_KEY")).toBe(true);

    const badColKeyOutOfRange = deepClone(base);
    // proposal.regular-summary width is 7 (A..G) -> key 'H' or 'Z' is out of range
    badColKeyOutOfRange.outputs[0]!.blocks[5]!.columnWidths = { Z: 15 };
    expect(validateDocumentLayoutDefinition(badColKeyOutOfRange, "save").some((i) => i.code === "INVALID_COLUMN_WIDTH_KEY")).toBe(true);

    const badColKeyNumber = deepClone(base);
    badColKeyNumber.outputs[0]!.blocks[5]!.columnWidths = { "1": 15 };
    expect(validateDocumentLayoutDefinition(badColKeyNumber, "save").some((i) => i.code === "INVALID_COLUMN_WIDTH_KEY")).toBe(true);

    // 3b: Conflicting column width on same absolute column between visible blocks
    const conflictCw = deepClone(base);
    // block 0 (logo): x=0, width=3. relative col A -> absCol 0, width=10
    conflictCw.outputs[0]!.blocks[0]!.columnWidths = { A: 10 };
    // block 1 (decision): x=0, width=3. relative col A -> absCol 0, width=20 (CONFLICT!)
    conflictCw.outputs[0]!.blocks[1]!.columnWidths = { A: 20 };
    expect(validateDocumentLayoutDefinition(conflictCw, "save").some((i) => i.code === "CONFLICTING_COLUMN_WIDTH")).toBe(true);

    // 3b: Visible block collision check
    const collidingBlocks = deepClone(base);
    // move decision (x=0, y=2) to overlap with logo (x=0, y=0, w=3, h=1) -> put decision at (x=0, y=0)
    collidingBlocks.outputs[0]!.blocks[1]!.x = 0;
    collidingBlocks.outputs[0]!.blocks[1]!.y = 0;
    expect(validateDocumentLayoutDefinition(collidingBlocks, "save").some((i) => i.code === "BLOCK_COLLISION")).toBe(true);

    // 3b: Unrenderable block size check (D3)
    const tooSmallBlock = deepClone(base);
    // proposal.meta requires minWidth 9, minHeight 5
    tooSmallBlock.outputs[0]!.blocks[2]!.width = 4;
    expect(validateDocumentLayoutDefinition(tooSmallBlock, "save").some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);
  });

  // 12. schedule 판독 표 position은 preview 및 save 모두 통과하며 타 보호 속성은 계속 거절 (Phase 2.5-4 R6/T1)
  it("schedule 판독 표 position은 preview 및 save 모두 통과하며 타 보호 속성은 계속 거절 (Phase 2.5-4 R6/T1)", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });

    // schedule parser table block IDs: schedule.calendar-grid, schedule.reschedule, schedule.substitute, schedule.overtime
    const parserBlocks = [
      "schedule.calendar-grid",
      "schedule.reschedule",
      "schedule.substitute",
      "schedule.overtime"
    ];

    for (const blockId of parserBlocks) {
      const modified = deepClone(base);
      const targetBlock = modified.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === blockId)!;
      // change position within canvas bounds
      targetBlock.x += 1;

      // preview validation MUST pass
      const previewIssues = validateDocumentLayoutDefinition(modified, "preview");
      expect(previewIssues).toEqual([]);

      // save validation MUST also pass (Phase 2.5-4: position activation allowed)
      const saveIssues = validateDocumentLayoutDefinition(modified, "save");
      expect(saveIssues).toEqual([]);

      // But protected properties like visibility must still fail
      const illegalModified = deepClone(modified);
      const illegalTarget = illegalModified.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === blockId)!;
      illegalTarget.visible = false;
      const illegalIssues = validateDocumentLayoutDefinition(illegalModified, "save");
      expect(illegalIssues.some((i) => i.code === "PROTECTED_PROPERTY_MODIFIED")).toBe(true);
    }
  });

  it("C2 반례: proposal 및 attachment의 손실 가능한 축소는 preview/save 모두 UNRENDERABLE_BLOCK_SIZE로 차단", () => {
    // 1. proposal.regular-summary.height=3 차단
    const propBase = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const propSummary3 = deepClone(propBase);
    const regSummary = propSummary3.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.regular-summary")!;
    regSummary.height = 3; // 5 -> 3
    for (const mode of ["preview", "save"] as const) {
      const issues = validateDocumentLayoutDefinition(propSummary3, mode);
      expect(issues.some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);
    }

    // 2. proposal.early-summary.height=3 차단
    const propEarly3 = deepClone(propBase);
    const earlySummary = propEarly3.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.early-summary")!;
    earlySummary.height = 3;
    expect(validateDocumentLayoutDefinition(propEarly3, "preview").some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);

    // 3. attachment1.regular-table 및 rate-guide 축소 차단
    const att1Base = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment1-xlsx" });
    const att1Shrunk = deepClone(att1Base);
    const regTable = att1Shrunk.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "attachment1.regular-table")!;
    regTable.height = 10; // 15 -> 10
    expect(validateDocumentLayoutDefinition(att1Shrunk, "preview").some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);

    const att1RateShrunk = deepClone(att1Base);
    const rateGuide = att1RateShrunk.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "attachment1.rate-guide")!;
    rateGuide.height = 15; // 22 -> 15
    expect(validateDocumentLayoutDefinition(att1RateShrunk, "preview").some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);

    // 4. attachment2.table 축소 차단
    const att2Base = getBuiltInDocumentLayoutDefinition({ documentKind: "attachment2-xlsx" });
    const att2Shrunk = deepClone(att2Base);
    const att2Table = att2Shrunk.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "attachment2.table")!;
    att2Table.height = 50; // 84 -> 50
    expect(validateDocumentLayoutDefinition(att2Shrunk, "preview").some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);

    // 5. schedule template2 calendar-grid 축소 차단 (61 -> 50)
    const sched2Base = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template2" });
    const sched2Shrunk = deepClone(sched2Base);
    const gridBlock = sched2Shrunk.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "schedule.calendar-grid")!;
    gridBlock.height = 50;
    expect(validateDocumentLayoutDefinition(sched2Shrunk, "preview").some((i) => i.code === "UNRENDERABLE_BLOCK_SIZE")).toBe(true);
  });

  // 14. PDF 2개 키 기본 정의 검증 통과 및 capabilities 확인 (T2, T6)
  it("PDF 2개 키 기본 정의 검증 통과 및 capabilities 확인 (T2, T6)", () => {
    const pdfKeys: DocumentLayoutKey[] = [
      { documentKind: "proposal-pdf" },
      { documentKind: "dashboard-report-pdf" }
    ];

    for (const key of pdfKeys) {
      const def = getBuiltInDocumentLayoutDefinition(key);
      const previewIssues = validateDocumentLayoutDefinition(def, "preview");
      const saveIssues = validateDocumentLayoutDefinition(def, "save");
      expect(previewIssues).toEqual([]);
      expect(saveIssues).toEqual([]);
      expect(() => assertValidDocumentLayoutDefinition(def, "save")).not.toThrow();

      const caps = getDocumentLayoutCapabilities(def);
      expect(caps.editableProperties).toEqual(DOCUMENT_LAYOUT_EDITABLE_PROPERTIES);
      expect(caps.protectedProperties).toEqual(DOCUMENT_LAYOUT_PROTECTED_PROPERTIES);
      expect(caps.blockCapabilities.length).toBeGreaterThan(0);
    }
  });

  // 15. PDF 음성 시험: N1 - proposal outputs[1]/[2] 변조 시 정확한 index path로 거절 (N1)
  it("PDF 음성 시험: N1 - proposal outputs[1]/[2] 변조 시 정확한 index path로 거절", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });

    // outputs[1] memberId 변조
    const badMember1 = deepClone(base);
    badMember1.outputs[1]!.memberId = "invalid_member" as unknown as typeof base.outputs[1]["memberId"];
    const issues1 = validateDocumentLayoutDefinition(badMember1, "save");
    const mIssue = issues1.find((i) => i.code === "OUTPUT_MEMBER_ID_MISMATCH");
    expect(mIssue).toBeDefined();
    expect(mIssue?.path).toContain("outputs[1]");

    // outputs[2] blocks pop (block count mismatch)
    const badBlockCount2 = deepClone(base);
    badBlockCount2.outputs[2]!.blocks.pop();
    const issues2 = validateDocumentLayoutDefinition(badBlockCount2, "save");
    const bIssue = issues2.find((i) => i.code === "BLOCK_COUNT_MISMATCH");
    expect(bIssue).toBeDefined();
    expect(bIssue?.path).toContain("outputs[2]");

    // outputs[1] canvas 크기 변조
    const badCanvas1 = deepClone(base);
    badCanvas1.outputs[1]!.canvas.width = 500;
    const issuesCanvas = validateDocumentLayoutDefinition(badCanvas1, "save");
    const cIssue = issuesCanvas.find((i) => i.code === "PROTECTED_CANVAS_MODIFIED");
    expect(cIssue).toBeDefined();
    expect(cIssue?.path).toContain("outputs[1]");

    // outputs[2] bindingKey 변조
    const badBinding2 = deepClone(base);
    badBinding2.outputs[2]!.blocks[0]!.bindingKey = "hacked_binding";
    const issuesBinding = validateDocumentLayoutDefinition(badBinding2, "save");
    const bindIssue = issuesBinding.find((i) => i.code === "PROTECTED_BINDING_KEY_MODIFIED");
    expect(bindIssue).toBeDefined();
    expect(bindIssue?.path).toContain("outputs[2]");
  });

  // 16. PDF 음성 시험: N2 - PDF compatibility를 Excel 값으로 교체 시 거절 (N2)
  it("PDF 음성 시험: N2 - PDF compatibility를 Excel 값으로 교체 시 거절", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
    const badCompat = deepClone(base);
    badCompat.generatorCompatibilityVersion = EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION as unknown as typeof base.generatorCompatibilityVersion;
    const issues = validateDocumentLayoutDefinition(badCompat, "save");
    expect(issues.some((i) => i.code === "UNSUPPORTED_GENERATOR_COMPATIBILITY_VERSION")).toBe(true);
  });

  // 17. PDF 음성 시험: N3 - NaN/Infinity/음수/캔버스 밖 mm 거절 (N3)
  it("PDF 음성 시험: N3 - NaN/Infinity/음수/캔버스 밖 mm 거절", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });

    // 음수 x
    const negX = deepClone(base);
    negX.outputs[0]!.blocks[0]!.x = -5;
    expect(validateDocumentLayoutDefinition(negX, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    // NaN y
    const nanY = deepClone(base);
    nanY.outputs[0]!.blocks[0]!.y = Number.NaN;
    expect(validateDocumentLayoutDefinition(nanY, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    // Infinity width
    const infW = deepClone(base);
    infW.outputs[0]!.blocks[0]!.width = Number.POSITIVE_INFINITY;
    expect(validateDocumentLayoutDefinition(infW, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);

    // 캔버스 너비(210mm) 초과
    const outCanvas = deepClone(base);
    outCanvas.outputs[0]!.blocks[0]!.x = 200;
    outCanvas.outputs[0]!.blocks[0]!.width = 50; // 200 + 50 = 250 > 210
    expect(validateDocumentLayoutDefinition(outCanvas, "save").some((i) => i.code === "INVALID_BLOCK_GEOMETRY")).toBe(true);
  });

  // 18. PDF 음성 시험: N4 - unknown token, wrong extension, '..', absolute/backslash 거절 (N4)
  it("PDF 음성 시험: N4 - unknown token, wrong extension, traversal, absolute 거절", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });

    // wrong extension (.xlsx instead of .pdf)
    const wrongExt = deepClone(base);
    wrongExt.outputs[0]!.outputFileNamePattern = "{year}년/{month2}월/{year}_{month2}_품의서.xlsx";
    expect(validateDocumentLayoutDefinition(wrongExt, "save").some((i) => i.code === "INVALID_FILE_NAME_PATTERN_EXTENSION")).toBe(true);

    // unknown token
    const unkToken = deepClone(base);
    unkToken.outputs[0]!.outputFileNamePattern = "{unknown_token}.pdf";
    expect(validateDocumentLayoutDefinition(unkToken, "save").some((i) => i.code === "UNKNOWN_FILE_NAME_PATTERN_TOKEN")).toBe(true);

    // path traversal '..'
    const traversal = deepClone(base);
    traversal.outputs[0]!.outputFileNamePattern = "../escape.pdf";
    expect(validateDocumentLayoutDefinition(traversal, "save").some((i) => i.code === "DISALLOWED_FILE_NAME_PATTERN_PATH")).toBe(true);

    // absolute path
    const absPath = deepClone(base);
    absPath.outputs[0]!.outputFileNamePattern = "/root/escape.pdf";
    expect(validateDocumentLayoutDefinition(absPath, "save").some((i) => i.code === "DISALLOWED_FILE_NAME_PATTERN_PATH")).toBe(true);
  });

  // 19. T-C4: font.family에 제어 문자/특수 문자 포함 시 INVALID_FONT_FAMILY로 거절
  it("T-C4: font.family에 제어 문자, 따옴표, 세미콜론 등 포함 시 거절", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
    const dangerousFamilies = [
      'Arial"; display: none; "',
      "Malgun' Gothic",
      "font-family; color: red;",
      "Malgun\\Gothic",
      "<script>alert(1)</script>",
      "Pretendard (Bold)",
      // 적대 payload 3종
      '" onmouseover="boom',
      "';background:url(http://x)",
      "</style><script>",
      // C0 제어문자: LF, CR, TAB, NUL
      "Malgun\nGothic",
      "Malgun\rGothic",
      "Malgun\tGothic",
      "Malgun\0Gothic",
      // DEL 및 C1 제어문자
      "Malgun\x7fGothic",
      "Malgun\x85Gothic"
    ];

    for (const family of dangerousFamilies) {
      const candidate = deepClone(base);
      candidate.outputs[0]!.blocks[0]!.font = { family, sizePt: 12 };
      const issues = validateDocumentLayoutDefinition(candidate, "save");
      const fontIssue = issues.find((i) => i.code === "INVALID_FONT_FAMILY");
      expect(fontIssue, `Failed for dangerous font family: ${JSON.stringify(family)}`).toBeDefined();
      expect(fontIssue?.path).toBe("outputs[0].blocks[0].font.family");
    }
  });

  // 20. T-C5a: 고정표 블록의 columnWidths 계약 검증 (빈 객체, 누락, 초과 거절 및 전체 집합 통과)
  it("T-C5a: 고정표 블록의 columnWidths는 전체 열 키 집합이 필수이며 빈 객체/부분 열/초과 열은 거절된다", () => {
    const base = getBuiltInDocumentLayoutDefinition({ documentKind: "proposal-pdf" });

    // 1) 빈 객체: 거절
    const emptyCw = deepClone(base);
    const bEmpty = emptyCw.outputs[0]!.blocks.find(
      (b) => b.id === "allowance-pdf.proposal.regular-table"
    )!;
    bEmpty.columnWidths = {};
    const issuesEmpty = validateDocumentLayoutDefinition(emptyCw, "save");
    expect(issuesEmpty.some((i) => i.code === "INVALID_COLUMN_WIDTHS")).toBe(true);

    // 2) 부분 열(A, B만 제공): 거절
    const partialCw = deepClone(base);
    const bPartial = partialCw.outputs[0]!.blocks.find(
      (b) => b.id === "allowance-pdf.proposal.regular-table"
    )!;
    bPartial.columnWidths = { A: 1, B: 2 };
    const issuesPartial = validateDocumentLayoutDefinition(partialCw, "save");
    expect(issuesPartial.some((i) => i.code === "INVALID_COLUMN_WIDTHS")).toBe(true);

    // 3) 초과 열(H 포함): 거절
    const extraCw = deepClone(base);
    const bExtra = extraCw.outputs[0]!.blocks.find(
      (b) => b.id === "allowance-pdf.proposal.regular-table"
    )!;
    bExtra.columnWidths = { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1, H: 1 };
    const issuesExtra = validateDocumentLayoutDefinition(extraCw, "save");
    expect(issuesExtra.some((i) => i.code === "INVALID_COLUMN_WIDTH_KEY")).toBe(true);

    // 4) 정확한 7열 전체 키(A~G): 통과
    const validCw = deepClone(base);
    const bValid = validCw.outputs[0]!.blocks.find(
      (b) => b.id === "allowance-pdf.proposal.regular-table"
    )!;
    bValid.columnWidths = { A: 2, B: 1, C: 1.5, D: 1, E: 2, F: 1, G: 3 };
    const issuesValid = validateDocumentLayoutDefinition(validCw, "save");
    expect(issuesValid.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

