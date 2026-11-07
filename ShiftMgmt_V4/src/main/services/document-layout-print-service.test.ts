import ExcelJS from "exceljs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DocumentLayoutKey } from "../../shared/domain/document-layout";
import { createBuiltInExcelWorkbook } from "./built-in-excel-layout-service";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";
import { applyDocumentLayoutPrintSetup, writeDocumentWorkbook } from "./document-layout-print-service";

const snapshot = (worksheet: ExcelJS.Worksheet) => JSON.parse(JSON.stringify(worksheet.model));
const withoutPrintSettings = (worksheet: ExcelJS.Worksheet) => {
  const model = snapshot(worksheet);
  delete model.pageSetup;
  return model;
};

describe("three printable allowance documents", () => {
  it.each(["proposal-xlsx", "attachment1-xlsx", "attachment2-xlsx"] as const)("%s만 A4로 맞추며 셀·행·열·병합을 보존한다", documentKind => {
    const workbook = createBuiltInExcelWorkbook(documentKind), worksheet = workbook.worksheets[0]!;
    const before = withoutPrintSettings(worksheet);
    applyDocumentLayoutPrintSetup({ worksheet, key: { documentKind } });
    expect(worksheet.pageSetup.paperSize).toBe(9);
    expect(worksheet.pageSetup.orientation).toBe(documentKind === "attachment1-xlsx" ? "landscape" : "portrait");
    expect(worksheet.pageSetup.fitToPage).toBe(true);
    expect(worksheet.pageSetup.fitToWidth).toBe(1);
    expect(worksheet.pageSetup.fitToHeight).toBe(0);
    expect(worksheet.pageSetup.printArea).toMatch(/^A1:[A-Z]+\d+$/);
    expect(withoutPrintSettings(worksheet)).toEqual(before);
  });

  it.each<DocumentLayoutKey>([
    { documentKind: "schedule-xlsx", variant: "template1" },
    { documentKind: "schedule-xlsx", variant: "template2" },
    { documentKind: "dashboard-report-pdf" }
  ])("인쇄 비대상 $documentKind/$variant의 열 너비·배율·원본 모델에 개입하지 않는다", key => {
    const workbook = key.documentKind === "schedule-xlsx"
      ? createBuiltInExcelWorkbook(`schedule-xlsx/${key.variant}`) : new ExcelJS.Workbook();
    const worksheet = workbook.worksheets[0] ?? workbook.addWorksheet("대시보드");
    worksheet.getColumn(3).width = 22;
    const before = snapshot(worksheet);
    applyDocumentLayoutPrintSetup({ worksheet, key });
    expect(snapshot(worksheet)).toEqual(before);
  });

  it("실제 별첨 파일의 단일 인쇄 영역·사용자 열 너비·셀·병합·숨김 메타데이터를 왕복 보존한다", async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "three-doc-print-roundtrip-"));
    try {
      const workbook = createBuiltInExcelWorkbook("attachment1-xlsx"), sheet = workbook.worksheets[0]!;
      sheet.properties.outlineProperties = { summaryBelow: true, summaryRight: true };
      const meta = workbook.addWorksheet("보호 메타데이터", { state: "veryHidden" });
      meta.getCell("A1").value = '{"revision":"보존"}';
      sheet.getCell("A120").value = "A4 왕복 검증";
      sheet.getCell("C120").value = 0.5;
      sheet.getCell("C120").numFmt = "hh:mm";
      sheet.getColumn(3).width = 22;
      workbook.definedNames.add(`'${sheet.name}'!$A$120`, "보존할이름");
      applyDocumentLayoutPrintSetup({ worksheet: sheet, key: { documentKind: "attachment1-xlsx" } });
      const before = snapshot(sheet), areas = sheet.pageSetup.printArea;
      const output = path.join(temp, "attachment1.xlsx");
      await writeDocumentWorkbook(workbook, output);
      expect(snapshot(sheet)).toEqual(before);
      const fromProject = createRequire(path.join(process.cwd(), "package.json"));
      const Zip = createRequire(fromProject.resolve("exceljs/package.json"))("jszip") as typeof import("jszip");
      const zip = await Zip.loadAsync(readFileSync(output));
      const xml = await zip.file("xl/workbook.xml")!.async("string");
      const printNames = [...xml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)]
        .filter(match => /name="_xlnm\.Print_Area"/.test(match[1]!));
      expect(printNames).toHaveLength(1);
      expect(printNames[0]![1]).toContain('localSheetId="0"');
      const sheetXml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
      const properties = /<sheetPr>([\s\S]*?)<\/sheetPr>/.exec(sheetXml)![1]!;
      expect(properties.indexOf("<outlinePr")).toBeGreaterThanOrEqual(0);
      expect(properties.indexOf("<pageSetUpPr")).toBeGreaterThan(properties.indexOf("<outlinePr"));
      const loaded = new ExcelJS.Workbook(); await loaded.xlsx.readFile(output);
      expect(loaded.worksheets[0]!.pageSetup.printArea).toBe(areas);
      expect(loaded.worksheets[0]!.getCell("A120").value).toBe("A4 왕복 검증");
      expect(loaded.worksheets[0]!.getColumn(3).width).toBe(22);
      expect(loaded.worksheets[0]!.getCell("C120").numFmt).toBe("hh:mm");
      expect([...loaded.worksheets[0]!.model.merges].sort()).toEqual([...sheet.model.merges].sort());
      expect(loaded.getWorksheet("보호 메타데이터")!.state).toBe("veryHidden");
      expect(loaded.getWorksheet("보호 메타데이터")!.getCell("A1").value).toBe('{"revision":"보존"}');
      expect(loaded.definedNames.getRanges("보존할이름").ranges).toEqual([`'${sheet.name}'!$A$120`]);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  it("늘어난 행과 마지막 합계 열을 포함하고 서식만 있는 끝 빈 행은 출력에서 제외한다", () => {
    const workbook = new ExcelJS.Workbook(), worksheet = workbook.addWorksheet("별첨2");
    worksheet.getCell("A1").value = "월간 수당 지급 현황";
    worksheet.getCell("H5").value = "합계";
    worksheet.getCell("H120").value = 466050;
    worksheet.getCell("H300").font = { bold: true };
    const before = withoutPrintSettings(worksheet);
    applyDocumentLayoutPrintSetup({ worksheet, key: { documentKind: "attachment2-xlsx" } });
    expect(worksheet.pageSetup.printArea).toBe("A1:H120");
    expect(withoutPrintSettings(worksheet)).toEqual(before);
  });

  it("본문 아래로 이동한 로고와 그림·표시 속성을 보존한다", () => {
    const key = { documentKind: "attachment1-xlsx" as const };
    const workbook = createBuiltInExcelWorkbook("attachment1-xlsx"), worksheet = workbook.worksheets[0]!;
    const definition = getDefaultDocumentLayoutDefinition(key);
    const logo = definition.outputs[0]!.blocks.find(block => block.kind === "logo")!;
    logo.y = 100; logo.height = 3;
    const imageId = workbook.addImage({ base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0Y4AAAAASUVORK5CYII=", extension: "png" });
    worksheet.addImage(imageId, "Q101:S103");
    const before = withoutPrintSettings(worksheet);
    applyDocumentLayoutPrintSetup({ worksheet, key, definition });
    expect(worksheet.pageSetup.printArea).toBe("A1:S103");
    expect(withoutPrintSettings(worksheet)).toEqual(before);
  });
});
