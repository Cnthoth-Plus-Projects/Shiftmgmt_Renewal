import path from "node:path";

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  assertScheduleLayoutRevisionMetadata,
  assertScheduleWorkbookProtectedStructure,
  attachScheduleLayoutMetadataToWorkbook,
  buildSchedulePlanCalendarDates,
  buildSchedulePlanDateBlockAddresses,
  canonicalizeJson,
  computeCanonicalDigestSha256,
  inspectSchedulePlanTemplate,
  inspectSchedulePlanTemplateFromDefinition,
  readScheduleLayoutRevisionMetadataFromWorkbook,
  resolveSchedulePlanLayoutKeyOrThrow,
  resolveScheduleSectionLayoutsFromDefinition,
  SCHEDULE_LAYOUT_METADATA_DEFINED_NAME,
  SCHEDULE_LAYOUT_METADATA_SHEET_NAME,
  type ScheduleLayoutRevisionMetadata
} from "./schedule-plan-adapter";
import {
  getBuiltInDocumentLayoutDefinition
} from "./document-layout-definition-service";
import { createBuiltInExcelWorkbook } from "./built-in-excel-layout-service";
import { applyDocumentLayoutToWorksheet } from "./document-layout-excel-render-service";
import { extractWorksheetSemanticSnapshot } from "../../test-utils/document-layout-semantic-snapshot";

const template1Path = path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx");
const template2Path = path.resolve(process.cwd(), "양식샘플", "근무표_템플릿2.xlsx");

describe("buildSchedulePlanCalendarDates", () => {
  it("should build a fixed 6-week calendar grid for the target month", () => {
    const dates = buildSchedulePlanCalendarDates("2024-10");

    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2024-09-29");
    expect(dates[41]).toBe("2024-11-09");
  });
});

describe("buildSchedulePlanDateBlockAddresses", () => {
  it("should resolve the three-cell calendar date block from the left date cell", () => {
    expect(buildSchedulePlanDateBlockAddresses("C39")).toEqual(["C39", "D39", "E39"]);
    expect(buildSchedulePlanDateBlockAddresses("U59")).toEqual(["U59", "V59", "W59"]);
  });
});

describe("inspectSchedulePlanTemplate", () => {
  it("should detect the layout anchors from template1", async () => {
    const layout = await inspectSchedulePlanTemplate(template1Path);

    expect(layout.variant).toBe("sample1");
    expect(layout.sheetName).toBe("교대 근무 계획표");
    expect(layout.siteNameCell).toBe("C3");
    expect(layout.monthTitleCell).toBe("W6");
    expect(layout.rosterSummaryCell).toBe("B7");
    expect(layout.monthAnchorCells).toEqual(["AY8", "BK8", "BK30"]);
    expect(layout.supportedWorkingDutyCodes).toEqual(["D", "E", "N"]);
    expect(layout.weekBlocks.map((block) => block.dateRow)).toEqual([9, 15, 21, 27, 33, 39]);
    expect(layout.weekBlocks[0]?.daySlots[0]).toEqual({
      dateAddress: "C9",
      dutyCellAddresses: {
        D: ["D10"],
        E: ["D11"],
        N: ["D12"],
        O: ["D13", "D14"]
      }
    });
    expect(layout.regularPlanColumns).toEqual({
      D: ["Z", "AA", "AB", "AC"],
      E: ["AD", "AE", "AF", "AG"],
      N: ["AH", "AI", "AJ", "AK"]
    });
    expect(layout.changeReasonColumn).toBe("AX");
    expect(layout.changeReasonColumns).toEqual(["AX", "AY"]);
  });

  it("should detect the layout anchors from template2", async () => {
    const layout = await inspectSchedulePlanTemplate(template2Path);

    expect(layout.variant).toBe("sample2");
    expect(layout.sheetName).toBe("교대 근무 계획표");
    expect(layout.siteNameCell).toBe("C3");
    expect(layout.monthTitleCell).toBe("W6");
    expect(layout.rosterSummaryCell).toBe("B7");
    expect(layout.monthAnchorCells).toEqual(["BG8", "BS8", "BS30"]);
    expect(layout.supportedWorkingDutyCodes).toEqual(["D", "N"]);
    expect(layout.weekBlocks.map((block) => block.dateRow)).toEqual([9, 19, 29, 39, 49, 59]);
    expect(layout.weekBlocks[0]?.daySlots[0]).toEqual({
      dateAddress: "C9",
      dutyCellAddresses: {
        D: ["C10", "D10", "E10"],
        N: ["D13"],
        O: ["D14", "D15", "D16", "D17", "D18"]
      }
    });
    expect(layout.regularPlanColumns).toEqual({
      D: ["Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK"],
      N: ["AL", "AM", "AN", "AO"]
    });
    expect(layout.changeReasonColumn).toBe("BF");
    expect(layout.changeReasonColumns).toEqual(["BF", "BG"]);

    // D25-2-010 / N6: Validate layout selector logic without silent template1 fallback
    expect(() => resolveSchedulePlanLayoutKeyOrThrow({})).toThrow("근무표 템플릿 선택 정보");
    expect(() => resolveSchedulePlanLayoutKeyOrThrow({ layoutKey: "invalid-key" })).toThrow("지원하지 않는 근무표 레이아웃 키");
    expect(() => resolveSchedulePlanLayoutKeyOrThrow({ variant: "invalid-variant" })).toThrow("지원하지 않는 근무표 variant");
    expect(() =>
      resolveSchedulePlanLayoutKeyOrThrow({
        layoutKey: "schedule-xlsx/template1",
        variant: "sample2"
      })
    ).toThrow("서로 일치하지 않습니다");
    expect(resolveSchedulePlanLayoutKeyOrThrow({ layoutKey: "schedule-xlsx/template2" })).toBe("schedule-xlsx/template2");
    expect(resolveSchedulePlanLayoutKeyOrThrow({ variant: "sample1" })).toBe("schedule-xlsx/template1");
  });

  it("should apply customized layout definition to schedule workbook output", async () => {
    const { writeSchedulePlanWorkbook } = await import("./schedule-plan-adapter");
    const { getDefaultDocumentLayoutDefinition } = await import("./document-layout-definition-service");
    const os = await import("node:os");
    const fs = await import("node:fs");
    const ExcelJS = (await import("exceljs")).default;

    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const customDef = JSON.parse(JSON.stringify(baseDef));
    const titleBlock = customDef.outputs[0].blocks.find((b: { id: string }) => b.id === "schedule.title");
    titleBlock.x = 2; // C열로 이동
    titleBlock.text = "커스텀 근무 계획표 제목";
    titleBlock.font = { family: "맑은 고딕", sizePt: 22, bold: true };
    titleBlock.columnWidths = { A: 28 };

    const tempDir = path.join(os.tmpdir(), `test-sched-adapter-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, "custom_schedule.xlsx");

    try {
      await writeSchedulePlanWorkbook({
        layoutKey: "schedule-xlsx/template1",
        outputPath,
        updates: [],
        definition: customDef
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.readFile(outputPath);
      const ws = reloaded.worksheets[0]!;

      expect(ws.getCell("C1").value).toBe("커스텀 근무 계획표 제목");
      expect(ws.getColumn(3).width).toBe(28);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("E1 검증: schedule template1 및 template2에 대해 definition 생략과 explicit 기본 definition의 actual output full semantic parity (100% 일치)", async () => {
    const { writeSchedulePlanWorkbook } = await import("./schedule-plan-adapter");
    const { getDefaultDocumentLayoutDefinition } = await import("./document-layout-definition-service");
    const os = await import("node:os");
    const fs = await import("node:fs");
    const ExcelJS = (await import("exceljs")).default;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-sched-parity-"));

    try {
      const variants: Array<{
        layoutKey: "schedule-xlsx/template1" | "schedule-xlsx/template2";
        variant: "template1" | "template2";
      }> = [
        { layoutKey: "schedule-xlsx/template1", variant: "template1" },
        { layoutKey: "schedule-xlsx/template2", variant: "template2" }
      ];

      for (const item of variants) {
        const omittedPath = path.join(tempDir, `${item.variant}_omitted.xlsx`);
        const explicitPath = path.join(tempDir, `${item.variant}_explicit.xlsx`);

        const updates = [
          { address: "C3", value: "테스트 사이트" },
          { address: "W6", value: "2026년 3월" }
        ];

        // 1) definition 생략 writer
        await writeSchedulePlanWorkbook({
          layoutKey: item.layoutKey,
          outputPath: omittedPath,
          updates
        });

        // 2) explicit 기본 definition writer
        const defaultDef = getDefaultDocumentLayoutDefinition({
          documentKind: "schedule-xlsx",
          variant: item.variant
        });
        await writeSchedulePlanWorkbook({
          layoutKey: item.layoutKey,
          outputPath: explicitPath,
          updates,
          definition: defaultDef
        });

        // 3) 재로딩 및 전체 semantic snapshot 비교
        const wbOmitted = new ExcelJS.Workbook();
        await wbOmitted.xlsx.readFile(omittedPath);

        const wbExplicit = new ExcelJS.Workbook();
        await wbExplicit.xlsx.readFile(explicitPath);

        expect(wbExplicit.worksheets).toHaveLength(wbOmitted.worksheets.length);

        for (let i = 0; i < wbOmitted.worksheets.length; i++) {
          const snapOmitted = extractWorksheetSemanticSnapshot(wbOmitted.worksheets[i]!);
          const snapExplicit = extractWorksheetSemanticSnapshot(wbExplicit.worksheets[i]!);
          expect(snapExplicit).toEqual(snapOmitted);
        }
      }
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  // 7. metadata v1 canonical serialize / deserialize / validate roundtrip (Phase 2.5-4 R1/T3)
  it("metadata v1 canonical serialize / deserialize / validate roundtrip (Phase 2.5-4 R1/T3)", async () => {
    const def = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const digest = computeCanonicalDigestSha256(def);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    const storedMeta: ScheduleLayoutRevisionMetadata = {
      definitionSha256: digest,
      format: "shiftmgmt.schedule-layout-revision",
      generatorCompatibilityVersion: "built-in-excel-layout-v1",
      layoutKey: "schedule-xlsx/template1",
      revisionId: "550e8400-e29b-41d4-a716-446655440000",
      revisionKind: "stored",
      schemaVersion: 1
    };

    // 1) Canonical JSON 순서 검증
    const json = canonicalizeJson(storedMeta);
    expect(json).toBe(
      `{"definitionSha256":"${digest}","format":"shiftmgmt.schedule-layout-revision","generatorCompatibilityVersion":"built-in-excel-layout-v1","layoutKey":"schedule-xlsx/template1","revisionId":"550e8400-e29b-41d4-a716-446655440000","revisionKind":"stored","schemaVersion":1}`
    );

    // 2) Workbook writeBuffer / load roundtrip
    const wb = createBuiltInExcelWorkbook("schedule-xlsx/template1");
    attachScheduleLayoutMetadataToWorkbook(wb, storedMeta);

    const buf = await wb.xlsx.writeBuffer();
    const loadedWb = new ExcelJS.Workbook();
    await loadedWb.xlsx.load(Buffer.from(buf));

    const readMeta = readScheduleLayoutRevisionMetadataFromWorkbook(loadedWb);
    expect(readMeta).toEqual(storedMeta);

    // 3) built-in metadata roundtrip
    const builtInMeta: ScheduleLayoutRevisionMetadata = {
      definitionSha256: digest,
      format: "shiftmgmt.schedule-layout-revision",
      generatorCompatibilityVersion: "built-in-excel-layout-v1",
      layoutKey: "schedule-xlsx/template1",
      revisionId: `builtin:schedule-xlsx/template1:${digest}`,
      revisionKind: "built-in",
      schemaVersion: 1
    };
    attachScheduleLayoutMetadataToWorkbook(wb, builtInMeta);
    const readBuiltIn = readScheduleLayoutRevisionMetadataFromWorkbook(wb);
    expect(readBuiltIn).toEqual(builtInMeta);

    // 4) 음성 matrix: 누락/추가/타입 오류
    expect(() => assertScheduleLayoutRevisionMetadata({ ...storedMeta, extra: 123 })).toThrow(
      "허용되지 않거나 누락된 필드"
    );
    expect(() => assertScheduleLayoutRevisionMetadata({ ...storedMeta, format: "wrong.format" })).toThrow(
      "format이 올바르지 않습니다"
    );
    expect(() => assertScheduleLayoutRevisionMetadata({ ...storedMeta, schemaVersion: 2 })).toThrow(
      "schemaVersion이 올바르지 않습니다"
    );
    expect(() => assertScheduleLayoutRevisionMetadata({ ...storedMeta, definitionSha256: "short" })).toThrow(
      "definitionSha256은 64자리"
    );
    expect(() =>
      assertScheduleLayoutRevisionMetadata({
        ...builtInMeta,
        revisionId: "builtin:schedule-xlsx/template1:wrong"
      })
    ).toThrow("built-in revisionId가 규약과 일치하지 않습니다");

    // metaSheet 상태 visible 변조 시 거절
    const wsMeta = wb.getWorksheet("__shiftmgmt_meta")!;
    wsMeta.state = "visible";
    expect(() => readScheduleLayoutRevisionMetadataFromWorkbook(wb)).toThrow(
      "메타데이터 시트가 숨겨져 있지 않습니다"
    );

    // 5) 예약 정의 이름 case-variant alias 충돌 거절 및 writer 정리 검증 (Phase 2.5-4 C3)
    const wbConflict = createBuiltInExcelWorkbook("schedule-xlsx/template1");
    attachScheduleLayoutMetadataToWorkbook(wbConflict, storedMeta);
    // canonical과 대소문자만 다른 alias를 충돌 range로 추가
    wbConflict.definedNames.add(
      `${SCHEDULE_LAYOUT_METADATA_SHEET_NAME}!$B$1`,
      SCHEDULE_LAYOUT_METADATA_DEFINED_NAME.toLowerCase()
    );
    expect(() => readScheduleLayoutRevisionMetadataFromWorkbook(wbConflict)).toThrow(
      "정의 이름이 중복 정의되었습니다"
    );

    // writer(attach)는 case-variant alias가 존재해도 제거하고 canonical 1개로 단일화
    attachScheduleLayoutMetadataToWorkbook(wbConflict, storedMeta);
    expect(readScheduleLayoutRevisionMetadataFromWorkbook(wbConflict)).toEqual(storedMeta);
  });

  // 8. 기본 및 조정 definition에 대한 전체 좌표 translation 및 67행 overtime scan window (Phase 2.5-4 R3/T3)
  it("기본 및 조정 definition에 대한 전체 좌표 translation 및 67행 overtime scan window (Phase 2.5-4 R3/T3)", () => {
    const variants: Array<"template1" | "template2"> = ["template1", "template2"];

    for (const v of variants) {
      const layoutKey = `schedule-xlsx/${v}` as const;
      const wb = createBuiltInExcelWorkbook(layoutKey);
      const defaultDef = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: v });

      // 1) 기본 definition 좌표 검증
      const defaultLayout = inspectSchedulePlanTemplateFromDefinition(defaultDef, wb);
      const defaultSections = resolveScheduleSectionLayoutsFromDefinition(defaultDef);

      expect(defaultLayout.siteNameCell).toBe("C3");
      expect(defaultLayout.monthTitleCell).toBe("W6");
      expect(defaultLayout.rosterSummaryCell).toBe("B7");
      expect(defaultLayout.weekBlocks[0]!.dateRow).toBe(9);
      expect(defaultLayout.rescheduleDateCells[0]).toBe("Y12");
      expect(defaultSections.substitute.startRow).toBe(11);
      expect(defaultSections.substitute.endRow).toBe(26);
      expect(defaultSections.substitute.endRow - defaultSections.substitute.startRow + 1).toBe(16);
      expect(defaultSections.overtime.startRow).toBe(34);
      expect(defaultSections.overtime.endRow).toBe(100);
      expect(defaultSections.overtime.endRow - defaultSections.overtime.startRow + 1).toBe(67);

      // 2) 조정 definition 좌표 검증 (오른쪽으로 1칸, 아래로 1칸 이동)
      const adjustedDef = JSON.parse(JSON.stringify(defaultDef));
      const parserBlockIds = [
        "schedule.site",
        "schedule.calendar-heading",
        "schedule.roster",
        "schedule.calendar-grid",
        "schedule.reschedule",
        "schedule.substitute",
        "schedule.overtime"
      ];
      for (const blockId of parserBlockIds) {
        const blk = adjustedDef.outputs[0].blocks.find((b: { id: string }) => b.id === blockId);
        if (blk) {
          blk.x += 1;
          blk.y += 1;
        }
      }

      const adjLayout = inspectSchedulePlanTemplateFromDefinition(adjustedDef, wb);
      const adjSections = resolveScheduleSectionLayoutsFromDefinition(adjustedDef);

      expect(adjLayout.siteNameCell).toBe("D4");
      expect(adjLayout.monthTitleCell).toBe("X7");
      expect(adjLayout.rosterSummaryCell).toBe("C8");
      expect(adjLayout.weekBlocks[0]!.dateRow).toBe(10);
      expect(adjLayout.rescheduleDateCells[0]).toBe("Z13");
      // substitute 16행 유지
      expect(adjSections.substitute.startRow).toBe(12);
      expect(adjSections.substitute.endRow).toBe(27);
      expect(adjSections.substitute.endRow - adjSections.substitute.startRow + 1).toBe(16);
      // overtime 67행 scan window 유지
      expect(adjSections.overtime.startRow).toBe(35);
      expect(adjSections.overtime.endRow).toBe(101);
      expect(adjSections.overtime.endRow - adjSections.overtime.startRow + 1).toBe(67);
    }
  });

  // 9. strict metadata 구조 검증 및 reference workbook protected structure matrix (Phase 2.5-4 R4/R5/T3)
  it("strict metadata 구조 검증 및 reference workbook protected structure matrix (Phase 2.5-4 R4/R5/T3)", () => {
    const variants: Array<"template1" | "template2"> = ["template1", "template2"];

    for (const v of variants) {
      const layoutKey = `schedule-xlsx/${v}` as const;
      const def = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: v });

      // 1) 정상 내장 워크북은 보호 구조 검증 통과
      const wb = createBuiltInExcelWorkbook(layoutKey);
      expect(() => assertScheduleWorkbookProtectedStructure(wb, def)).not.toThrow();

      // 2) 변조 matrix:
      // A. DATE 표식 변조
      const wbDateTamper = createBuiltInExcelWorkbook(layoutKey);
      const wsDate = wbDateTamper.getWorksheet("교대 근무 계획표")!;
      wsDate.getCell(9, 2).value = "MODIFIED";
      expect(() => assertScheduleWorkbookProtectedStructure(wbDateTamper, def)).toThrow(
        "DATE 표식이 일치하지 않거나 변조되었습니다"
      );

      // B. 변경 사유 머리글 변조
      const wbReasonTamper = createBuiltInExcelWorkbook(layoutKey);
      const wsReason = wbReasonTamper.getWorksheet("교대 근무 계획표")!;
      const reasonCol = v === "template1" ? "AX" : "BF";
      wsReason.getCell(`${reasonCol}9`).value = "사유";
      expect(() => assertScheduleWorkbookProtectedStructure(wbReasonTamper, def)).toThrow(
        "변경 사유 머리글이 일치하지 않거나 변조되었습니다"
      );

      // C. 행 높이 변조
      const wbHeightTamper = createBuiltInExcelWorkbook(layoutKey);
      const wsHeight = wbHeightTamper.getWorksheet("교대 근무 계획표")!;
      wsHeight.getRow(8).height = 40;
      expect(() => assertScheduleWorkbookProtectedStructure(wbHeightTamper, def)).toThrow(
        "보호된 행 높이가 변조되었습니다"
      );

      // 3) legacy: metadata 전혀 없음 -> read는 null 반환, 그러나 정상 구조는 통과
      const legacyWb = createBuiltInExcelWorkbook(layoutKey);
      expect(readScheduleLayoutRevisionMetadataFromWorkbook(legacyWb)).toBeNull();
      expect(() => assertScheduleWorkbookProtectedStructure(legacyWb, def)).not.toThrow();

      // 4) shifted 워크북에서 metadata만 제거된 경우: legacy 기본 구조 검증에서 거절
      const shiftedWb = createBuiltInExcelWorkbook(layoutKey);
      const shiftedWs = shiftedWb.getWorksheet("교대 근무 계획표")!;
      // 조정 적용
      const shiftedDef = JSON.parse(JSON.stringify(def));
      const grid = shiftedDef.outputs[0].blocks.find((b: { id: string }) => b.id === "schedule.calendar-grid");
      grid.y += 1;
      applyDocumentLayoutToWorksheet({ worksheet: shiftedWs, definition: shiftedDef });
      // shiftedWb에는 metadata가 없으나, 기본 def 구조와 불일치하므로 거절됨
      expect(readScheduleLayoutRevisionMetadataFromWorkbook(shiftedWb)).toBeNull();
      expect(() => assertScheduleWorkbookProtectedStructure(shiftedWb, def)).toThrow(
        "보호 구조 검증 실패"
      );
    }
  });
});
