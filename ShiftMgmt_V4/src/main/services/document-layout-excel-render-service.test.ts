import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";
import {
  applyDocumentLayoutToWorksheet,
  computeDocumentLayoutActualBlockRanges,
  hasDocumentLayoutModifications,
  parseCellRangeAddress,
  resolveDocumentLayoutFileName,
  resolveDocumentLayoutOutputFilePath,
  toColumnLetter,
  toColumnNumber
} from "./document-layout-excel-render-service";
import {
  createBuiltInExcelWorkbook,
  type BuiltInExcelLayoutKey
} from "./built-in-excel-layout-service";
import * as brandLogoService from "./document-brand-logo-service";
import type { DocumentLayoutBlock } from "../../shared/domain/document-layout";
import { extractWorksheetSemanticSnapshot } from "../../test-utils/document-layout-semantic-snapshot";

const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

describe("document-layout-excel-render-service", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-layout-render-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("toColumnLetter 및 toColumnNumber 양방향 변환", () => {
    expect(toColumnLetter(1)).toBe("A");
    expect(toColumnLetter(2)).toBe("B");
    expect(toColumnLetter(26)).toBe("Z");
    expect(toColumnLetter(27)).toBe("AA");
    expect(toColumnLetter(28)).toBe("AB");

    expect(toColumnNumber("A")).toBe(1);
    expect(toColumnNumber("B")).toBe(2);
    expect(toColumnNumber("Z")).toBe(26);
    expect(toColumnNumber("AA")).toBe(27);
    expect(toColumnNumber("AB")).toBe(28);

    expect(parseCellRangeAddress("A1:C3")).toEqual({
      startCol: 1,
      startRow: 1,
      endCol: 3,
      endRow: 3
    });
    expect(parseCellRangeAddress("B5")).toEqual({
      startCol: 2,
      startRow: 5,
      endCol: 2,
      endRow: 5
    });
  });

  it("파일명 패턴 토큰 치환 및 특수문자 정제", () => {
    const pattern = "{year}년/{monthNumber}월/{year}_{monthNumber}_{siteName}.xlsx";
    const fileName = resolveDocumentLayoutFileName(pattern, {
      year: 2026,
      monthNumber: 5,
      siteName: "보라매/현장:1"
    });
    // 특수문자 '/', ':' 치환
    expect(fileName).toBe("2026년/5월/2026_5_보라매_현장_1.xlsx");
  });

  it("대상 파일 경로 결정, 상위 디렉터리 탈출 거절 및 _dup01/_dup02 중복 해결", () => {
    const pattern = "{year}년/{month2}월/{year}_{month2}_품의서.xlsx";
    const tokens = { year: 2026, month2: "05" };

    const firstPath = resolveDocumentLayoutOutputFilePath(tempDir, pattern, tokens);
    expect(firstPath).toContain(path.join("2026년", "05월", "2026_05_품의서.xlsx"));

    // 파일 생성 후 재호출 시 _dup01
    writeFileSync(firstPath, "dummy");
    const dup1Path = resolveDocumentLayoutOutputFilePath(tempDir, pattern, tokens);
    expect(dup1Path).toContain("2026_05_품의서_dup01.xlsx");

    // _dup01 파일 생성 후 재호출 시 _dup02
    writeFileSync(dup1Path, "dummy");
    const dup2Path = resolveDocumentLayoutOutputFilePath(tempDir, pattern, tokens);
    expect(dup2Path).toContain("2026_05_품의서_dup02.xlsx");

    // 상위 디렉터리 탈출 패턴 거부
    expect(() => {
      resolveDocumentLayoutOutputFilePath(tempDir, "../escape.xlsx", tokens);
    }).toThrow("기본 디렉터리");
  });

  it("PDF 파일명 패턴 토큰({name}, {timestamp}) 치환 및 특수문자 정제 (T8)", () => {
    const pattern = "{name}_{timestamp}.pdf";
    const fileName = resolveDocumentLayoutFileName(pattern, {
      name: "월별/보고서:대시보드",
      timestamp: "2026-09-23_11-00-00"
    });
    expect(fileName).toBe("월별_보고서_대시보드_2026-09-23_11-00-00.pdf");

    // 중복 파일명 생성 시 _dup01 적용 확인
    const targetPath1 = resolveDocumentLayoutOutputFilePath(tempDir, pattern, {
      name: "차트리포트",
      timestamp: "20260923"
    });
    expect(targetPath1).toContain("차트리포트_20260923.pdf");
    writeFileSync(targetPath1, "%PDF-dummy");

    const targetPath2 = resolveDocumentLayoutOutputFilePath(tempDir, pattern, {
      name: "차트리포트",
      timestamp: "20260923"
    });
    expect(targetPath2).toContain("차트리포트_20260923_dup01.pdf");
  });

  it("기본 정의 5개는 hasDocumentLayoutModifications=false를 반환", () => {
    const keys = [
      { documentKind: "schedule-xlsx" as const, variant: "template1" as const },
      { documentKind: "schedule-xlsx" as const, variant: "template2" as const },
      { documentKind: "proposal-xlsx" as const },
      { documentKind: "attachment1-xlsx" as const },
      { documentKind: "attachment2-xlsx" as const }
    ];

    for (const key of keys) {
      const def = getDefaultDocumentLayoutDefinition(key);
      const baseline = getDefaultDocumentLayoutDefinition(key);
      expect(hasDocumentLayoutModifications(def, baseline)).toBe(false);
    }
  });

  it("동적 행 수에 따른 실제 블록 범위 계산 (동적 앞 블록 밀림 반영)", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    // R=3, E=2
    const { sourceRanges, targetRanges } = computeDocumentLayoutActualBlockRanges(propDef, {
      proposal: { regularSiteCount: 3, earlySiteCount: 2 }
    });

    // regular-summary: 18 .. (21 + 3) = 18..24
    expect(sourceRanges.get("proposal.regular-summary")).toEqual({
      startCol: 2,
      startRow: 18,
      endCol: 8,
      endRow: 24
    });
    // early-summary: (23 + 3) .. (26 + 3 + 2) = 26..31
    expect(sourceRanges.get("proposal.early-summary")).toEqual({
      startCol: 2,
      startRow: 26,
      endCol: 8,
      endRow: 31
    });
    // grand-total: row (28 + 3 + 2) = 33
    expect(sourceRanges.get("proposal.grand-total")).toEqual({
      startCol: 2,
      startRow: 33,
      endCol: 8,
      endRow: 33
    });
    // footer: rows (30 + 3 + 2) .. (31 + 3 + 2) = 35..36
    expect(sourceRanges.get("proposal.footer")).toEqual({
      startCol: 2,
      startRow: 35,
      endCol: 9,
      endRow: 36
    });

    // targetRanges도 동일하게 일치
    expect(targetRanges.get("proposal.footer")?.startRow).toBe(35);
  });

  it("보이는 블록 간 대상 영역 충돌 시 BLOCK_COLLISION 오류 발생", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const colliding = deepClone(propDef);
    // move decision (A3:C3) to A1:C1 (collides with logo A1:C1)
    colliding.outputs[0]!.blocks[1]!.y = 0;

    expect(() => {
      computeDocumentLayoutActualBlockRanges(colliding);
    }).toThrow("BLOCK_COLLISION");
  });

  it("실제 워크시트에 레이아웃 수정(위치, 문구, 글꼴, 열 너비, 표시 여부) 적용 및 검증", async () => {
    const scheduleDef = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const customDef = deepClone(scheduleDef);

    // 1. title 위치(x=2, y=1), 문구 변경, 글꼴 변경
    const titleBlock = customDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "schedule.title")!;
    titleBlock.x = 2; // C열부터
    titleBlock.y = 0;
    titleBlock.width = 20;
    titleBlock.text = "맞춤형 교대근무 계획표 제목";
    titleBlock.font = {
      family: "맑은 고딕",
      sizePt: 20,
      bold: true,
      color: "#FF0000"
    };

    // 2. description 숨김 (visible=false)
    const descBlock = customDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "schedule.description")!;
    descBlock.visible = false;

    // 3. 열 너비 지정 (상대 열 A -> 절대 열 C = 3번째 열 너비 30)
    titleBlock.columnWidths = { A: 30 };

    const workbook = createBuiltInExcelWorkbook("schedule-xlsx/template1");
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    applyDocumentLayoutToWorksheet({
      worksheet,
      definition: customDef
    });

    // 검증: title이 C1(3열 1행)에 배치되고 새 텍스트와 글꼴을 가짐
    const cellC1 = worksheet.getCell("C1");
    expect(cellC1.value).toBe("맞춤형 교대근무 계획표 제목");
    expect(cellC1.font?.name).toBe("맑은 고딕");
    expect(cellC1.font?.size).toBe(20);
    expect(cellC1.font?.bold).toBe(true);

    // 열 너비 확인: C열(3번째 열)의 너비가 30
    expect(worksheet.getColumn(3).width).toBe(30);

    // description(기존 B2)은 내용이 지워져 비어 있음
    const cellB2 = worksheet.getCell("B2");
    expect(cellB2.value).toBeNull();

    // 파일로 쓰고 다시 읽어서 실제 파일 관찰 가능성 확인
    const outputPath = path.join(tempDir, "rendered_schedule.xlsx");
    await workbook.xlsx.writeFile(outputPath);

    const reloadedWb = new ExcelJS.Workbook();
    await reloadedWb.xlsx.readFile(outputPath);
    const reloadedWs = reloadedWb.worksheets[0]!;

    expect(reloadedWs.getCell("C1").value).toBe("맞춤형 교대근무 계획표 제목");
    expect(reloadedWs.getColumn(3).width).toBe(30);
    expect(reloadedWs.getCell("B2").value).toBeNull();
  });

  it("C1 회귀: proposal title text만 변경 시 untouched regular-summary 영역의 서식·글꼴 100% 보존 (변화 셀 0개)", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const modifiedDef = deepClone(propDef);

    // 오직 proposal.title.text만 변경
    const titleBlock = modifiedDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.title")!;
    titleBlock.text = "교대근무 연장근로 수당 지급 품의서 (변경됨)";

    const workbook = createBuiltInExcelWorkbook("proposal-xlsx");
    const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0]!;

    // 변경 전 regular-summary(B18:H22) 영역의 셀 스타일 및 글꼴 기록
    const beforeStyles: Record<string, { fontSize?: number; fontName?: string; isStyleEmpty: boolean; value: unknown }> = {};
    for (let r = 18; r <= 22; r++) {
      for (let c = 2; c <= 8; c++) {
        const cell = worksheet.getCell(r, c);
        const addr = `${toColumnLetter(c)}${r}`;
        const s = cell.style;
        beforeStyles[addr] = {
          fontSize: cell.font?.size,
          fontName: cell.font?.name,
          isStyleEmpty: !s || Object.keys(s).length === 0,
          value: cell.value
        };
      }
    }

    // Sol probe 기준 주요 셀 사전 검증
    expect(beforeStyles["B18"]?.fontSize).toBe(12);
    expect(beforeStyles["E19"]?.fontSize).toBe(9);
    expect(beforeStyles["D18"]?.isStyleEmpty).toBe(true);

    // renderer 실행
    applyDocumentLayoutToWorksheet({
      worksheet,
      definition: modifiedDef,
      context: { proposal: { regularSiteCount: 1, earlySiteCount: 1 } }
    });

    // 변경 후 regular-summary 영역 검증: 변화 셀 수 0
    let changedCellsCount = 0;
    for (let r = 18; r <= 22; r++) {
      for (let c = 2; c <= 8; c++) {
        const cell = worksheet.getCell(r, c);
        const addr = `${toColumnLetter(c)}${r}`;
        const b = beforeStyles[addr]!;
        const s = cell.style;
        const currentEmpty = !s || Object.keys(s).length === 0;

        if (cell.font?.size !== b.fontSize || cell.font?.name !== b.fontName || currentEmpty !== b.isStyleEmpty || cell.value !== b.value) {
          changedCellsCount++;
        }
      }
    }

    expect(changedCellsCount).toBe(0);
    // 주요 셀 보존 직접 단언
    expect(worksheet.getCell("B18").font?.size).toBe(12);
    expect(worksheet.getCell("E19").font?.size).toBe(9);
    const d18Style = worksheet.getCell("D18").style;
    expect(!d18Style || Object.keys(d18Style).length === 0).toBe(true);
  });

  it("C2 반례: proposal.regular-summary.height=3 시 런타임 preflight에서 UNRENDERABLE_BLOCK_SIZE로 차단 및 원본 보존", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const modifiedDef = deepClone(propDef);
    const regSummary = modifiedDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.regular-summary")!;
    regSummary.height = 3; // 5 -> 3으로 축소 (행 21, 22 손실 유발)

    const workbook = createBuiltInExcelWorkbook("proposal-xlsx");
    const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0]!;

    // 렌더링 전 원본 상태 기록
    const beforeMerges = [...((worksheet.model.merges ?? []) as string[])];
    const beforeRow21Value = worksheet.getCell("B21").value;
    const beforeRow22Value = worksheet.getCell("B22").value;

    expect(() => {
      applyDocumentLayoutToWorksheet({
        worksheet,
        definition: modifiedDef,
        context: { proposal: { regularSiteCount: 1, earlySiteCount: 1 } }
      });
    }).toThrow("UNRENDERABLE_BLOCK_SIZE");

    // 차단 후 원본 워크시트가 전혀 훼손되지 않고 온전히 유지됨을 검증
    const afterMerges = [...((worksheet.model.merges ?? []) as string[])];
    expect(afterMerges).toEqual(beforeMerges);
    expect(worksheet.getCell("B21").value).toEqual(beforeRow21Value);
    expect(worksheet.getCell("B22").value).toEqual(beforeRow22Value);
  });

  it("C3 검증: 로고 visible=false 시 로고 제거 관찰 및 알 수 없는 로고 식별자 차단", async () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });

    // 1. 알 수 없는 로고 식별자는 UNKNOWN_LOGO_ASSET 오류 발생
    const unknownLogoDef = deepClone(propDef);
    const logoBlock = unknownLogoDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.logo")!;
    logoBlock.logoAssetId = "unsupported-asset-id";
    const wb1 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws1 = wb1.getWorksheet("품의서") ?? wb1.worksheets[0]!;
    expect(() => {
      applyDocumentLayoutToWorksheet({ worksheet: ws1, definition: unknownLogoDef });
    }).toThrow("UNKNOWN_LOGO_ASSET");

    // 2. visible=false 시 로고가 완전히 제거됨을 파일 저장 후 재로딩으로 확인
    const hiddenLogoDef = deepClone(propDef);
    const hiddenLogoBlock = hiddenLogoDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.logo")!;
    hiddenLogoBlock.visible = false;

    const wb2 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws2 = wb2.getWorksheet("품의서") ?? wb2.worksheets[0]!;
    applyDocumentLayoutToWorksheet({ worksheet: ws2, definition: hiddenLogoDef });

    const hiddenLogoPath = path.join(tempDir, "hidden_logo_proposal.xlsx");
    await wb2.xlsx.writeFile(hiddenLogoPath);

    const reloadedWb = new ExcelJS.Workbook();
    await reloadedWb.xlsx.readFile(hiddenLogoPath);
    const reloadedWs = reloadedWb.worksheets[0]!;
    expect(reloadedWs.getImages()).toHaveLength(0);
  });

  it("E1 검증: 5개 기본 키 full semantic parity 검증 (기본 정의 적용 시 셀/서식/병합/행열/설정/이미지 100% 불변)", () => {
    const keys = [
      { documentKind: "schedule-xlsx" as const, variant: "template1" as const },
      { documentKind: "schedule-xlsx" as const, variant: "template2" as const },
      { documentKind: "proposal-xlsx" as const },
      { documentKind: "attachment1-xlsx" as const },
      { documentKind: "attachment2-xlsx" as const }
    ];

    for (const key of keys) {
      const def = getDefaultDocumentLayoutDefinition(key);
      const storageKey = key.documentKind === "schedule-xlsx" ? `schedule-xlsx/${key.variant}` : key.documentKind;
      const wb = createBuiltInExcelWorkbook(storageKey as BuiltInExcelLayoutKey);
      const ws = wb.worksheets[0]!;

      const beforeSnapshot = extractWorksheetSemanticSnapshot(ws);

      applyDocumentLayoutToWorksheet({ worksheet: ws, definition: def });

      const afterSnapshot = extractWorksheetSemanticSnapshot(ws);
      expect(afterSnapshot).toEqual(beforeSnapshot);
    }
  });

  it("C4 회귀: regular-summary bold=true만 변경 후 실제 XLSX 재로딩 시 B18 12pt 유지, E19 9pt 유지, D18 최소 bold만 생성", async () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const boldDef = deepClone(propDef);
    const regBlock = boldDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.regular-summary")!;
    regBlock.font = {
      family: "맑은 고딕",
      sizePt: 11,
      bold: true
    };

    const workbook = createBuiltInExcelWorkbook("proposal-xlsx");
    const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0]!;

    applyDocumentLayoutToWorksheet({
      worksheet,
      definition: boldDef,
      context: { proposal: { regularSiteCount: 1, earlySiteCount: 1 } }
    });

    const outputPath = path.join(tempDir, "proposal_bold_only.xlsx");
    await workbook.xlsx.writeFile(outputPath);

    const reloadedWb = new ExcelJS.Workbook();
    await reloadedWb.xlsx.readFile(outputPath);
    const reloadedWs = reloadedWb.worksheets[0]!;

    // B18: 원래 size 12 유지, bold true
    const cellB18 = reloadedWs.getCell("B18");
    expect(cellB18.font?.size).toBe(12);
    expect(cellB18.font?.bold).toBe(true);

    // E19: 원래 size 9 유지, bold true
    const cellE19 = reloadedWs.getCell("E19");
    expect(cellE19.font?.size).toBe(9);
    expect(cellE19.font?.bold).toBe(true);

    // D18: 원래 스타일 빈 셀 -> bold만 적용, size/family 평탄화 없음
    const cellD18 = reloadedWs.getCell("D18");
    expect(cellD18.font?.bold).toBe(true);
    expect(cellD18.font?.size).toBeUndefined();
    expect(cellD18.font?.name).toBeUndefined();
    expect(cellD18.font).toEqual({ bold: true });
    expect(cellD18.border).toEqual({});
    expect(cellD18.fill).toEqual({ type: "pattern", pattern: "none" });
  });

  it("C4 no-op: font 객체의 key 순서만 다른 정의는 semantic no-op 및 hasDocumentLayoutModifications=false", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const reorderedDef = deepClone(propDef);
    const titleBlock = reorderedDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.title")!;
    // 원래: { family: "맑은 고딕", sizePt: 14, bold: true } -> key 순서 뒤집기
    titleBlock.font = {
      bold: true,
      sizePt: 14,
      family: "맑은 고딕"
    };

    expect(hasDocumentLayoutModifications(reorderedDef, propDef)).toBe(false);

    const wb = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws = wb.worksheets[0]!;
    const beforeA11Val = ws.getCell("A11").value;
    applyDocumentLayoutToWorksheet({ worksheet: ws, definition: reorderedDef });
    expect(ws.getCell("A11").value).toBe(beforeA11Val);
  });

  it("C3 실패 경로: unMergeCells 오류 주입 시 UNMERGE_FAILED 전파", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const customDef = deepClone(propDef);
    // proposal.regular-summary (B19:D20 등 확실한 병합 보유) 블록 이동
    const regBlock = customDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.regular-summary")!;
    regBlock.y += 1;

    const wb = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws = wb.getWorksheet("품의서") ?? wb.worksheets[0]!;
    vi.spyOn(ws, "unMergeCells").mockImplementation(() => {
      throw new Error("강제 주입된 unMergeCells 실패");
    });

    expect(() => {
      applyDocumentLayoutToWorksheet({
        worksheet: ws,
        definition: customDef,
        context: { proposal: { regularSiteCount: 1, earlySiteCount: 1 } }
      });
    }).toThrow("UNMERGE_FAILED");
  });

  it("C3 실패 경로: mergeCells 오류 주입 시 MERGE_FAILED 전파", () => {
    const scheduleDef = getDefaultDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const customDef = deepClone(scheduleDef);
    customDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "schedule.title")!.text = "제목 변경";

    const wb = createBuiltInExcelWorkbook("schedule-xlsx/template1");
    const ws = wb.worksheets[0]!;
    vi.spyOn(ws, "mergeCells").mockImplementation(() => {
      throw new Error("강제 주입된 mergeCells 실패");
    });

    expect(() => {
      applyDocumentLayoutToWorksheet({ worksheet: ws, definition: customDef });
    }).toThrow("MERGE_FAILED");
  });

  it("C3 실패 경로: brand logo 삽입 실패 시 LOGO_INSERT_FAILED, 이미지 개수 불일치 시 LOGO_VERIFICATION_FAILED 전파", () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });
    const customDef = deepClone(propDef);
    const logoBlock = customDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.logo")!;
    logoBlock.x = 1;

    const realAddBrandLogo = brandLogoService.addBrandLogoToWorksheetRange;

    // 1. 삽입 함수 실패 주입
    const wb1 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws1 = wb1.getWorksheet("품의서") ?? wb1.worksheets[0]!;
    vi.spyOn(brandLogoService, "addBrandLogoToWorksheetRange").mockImplementation(() => {
      throw new Error("강제 주입된 로고 삽입 실패");
    });
    expect(() => {
      applyDocumentLayoutToWorksheet({ worksheet: ws1, definition: customDef });
    }).toThrow("LOGO_INSERT_FAILED");
    vi.restoreAllMocks();

    // 2. 삽입 함수는 성공했으나 이미지가 추가되지 않은 경우 검증 실패 (0개)
    const wb2 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws2 = wb2.getWorksheet("품의서") ?? wb2.worksheets[0]!;
    vi.spyOn(brandLogoService, "addBrandLogoToWorksheetRange").mockImplementation(() => {
      // 이미지 미삽입
      return 0;
    });
    expect(() => {
      applyDocumentLayoutToWorksheet({ worksheet: ws2, definition: customDef });
    }).toThrowError(/LOGO_VERIFICATION_FAILED.*실제 발견: 0개/);
    vi.restoreAllMocks();

    // 3. 삽입 함수가 이미지를 2개 추가한 경우 검증 실패 (2개)
    const wb3 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws3 = wb3.getWorksheet("품의서") ?? wb3.worksheets[0]!;
    vi.spyOn(brandLogoService, "addBrandLogoToWorksheetRange").mockImplementation((worksheet, range, label) => {
      realAddBrandLogo(worksheet, range, label);
      realAddBrandLogo(worksheet, range, label);
      return 1;
    });
    expect(() => {
      applyDocumentLayoutToWorksheet({ worksheet: ws3, definition: customDef });
    }).toThrowError(/LOGO_VERIFICATION_FAILED.*실제 발견: 2개/);
    vi.restoreAllMocks();
  });

  it("C3 로고 위치/크기/null/visible 4경로 실제 파일 재로딩 검증", async () => {
    const propDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-xlsx" });

    // 1) 위치(x=3, y=1) 및 크기(w=4, h=2) 변경
    const posSizeDef = deepClone(propDef);
    const logoBlock1 = posSizeDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.logo")!;
    logoBlock1.x = 3;
    logoBlock1.y = 1;
    logoBlock1.width = 4;
    logoBlock1.height = 2;

    const wb1 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws1 = wb1.getWorksheet("품의서") ?? wb1.worksheets[0]!;
    applyDocumentLayoutToWorksheet({ worksheet: ws1, definition: posSizeDef });
    const file1 = path.join(tempDir, "logo_pos_size.xlsx");
    await wb1.xlsx.writeFile(file1);

    const reloadedWb1 = new ExcelJS.Workbook();
    await reloadedWb1.xlsx.readFile(file1);
    const reloadedWs1 = reloadedWb1.worksheets[0]!;
    const images1 = reloadedWs1.getImages();
    expect(images1).toHaveLength(1);
    const imgRange1 = images1[0]!.range as unknown as {
      tl: { nativeCol: number; nativeRow: number };
      br: { nativeCol: number; nativeRow: number };
      editAs?: string;
    };
    expect(imgRange1.tl.nativeCol).toBe(3);
    expect(imgRange1.tl.nativeRow).toBe(1);
    expect(imgRange1.br.nativeCol).toBe(7);
    expect(imgRange1.br.nativeRow).toBe(3);
    expect(imgRange1.br.nativeCol - imgRange1.tl.nativeCol).toBe(4);
    expect(imgRange1.br.nativeRow - imgRange1.tl.nativeRow).toBe(2);
    expect(images1[0]!.range.editAs).toBe("oneCell");

    // 2) logoAssetId = null 시 로고 제거
    const nullLogoDef = deepClone(propDef);
    const logoBlock2 = nullLogoDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.logo")!;
    logoBlock2.logoAssetId = null;

    const wb2 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws2 = wb2.getWorksheet("품의서") ?? wb2.worksheets[0]!;
    applyDocumentLayoutToWorksheet({ worksheet: ws2, definition: nullLogoDef });
    const file2 = path.join(tempDir, "logo_null.xlsx");
    await wb2.xlsx.writeFile(file2);

    const reloadedWb2 = new ExcelJS.Workbook();
    await reloadedWb2.xlsx.readFile(file2);
    expect(reloadedWb2.worksheets[0]!.getImages()).toHaveLength(0);

    // 3) visible = false 시 로고 제거
    const hiddenLogoDef = deepClone(propDef);
    const logoBlock3 = hiddenLogoDef.outputs[0]!.blocks.find((b: DocumentLayoutBlock) => b.id === "proposal.logo")!;
    logoBlock3.visible = false;

    const wb3 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws3 = wb3.getWorksheet("품의서") ?? wb3.worksheets[0]!;
    applyDocumentLayoutToWorksheet({ worksheet: ws3, definition: hiddenLogoDef });
    const file3 = path.join(tempDir, "logo_hidden.xlsx");
    await wb3.xlsx.writeFile(file3);

    const reloadedWb3 = new ExcelJS.Workbook();
    await reloadedWb3.xlsx.readFile(file3);
    expect(reloadedWb3.worksheets[0]!.getImages()).toHaveLength(0);
  });
});
