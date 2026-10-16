import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  createBuiltInExcelWorkbook,
  getBuiltInExcelLayoutDefinition,
  validateBuiltInExcelLayoutDefinition,
  type BuiltInExcelLayoutDefinition,
  type BuiltInExcelLayoutKey
} from "./built-in-excel-layout-service";
import { setBrandLogoResolverForTest } from "./document-brand-logo-service";

const SAMPLES_DIR = path.resolve(process.cwd(), "양식샘플");

const DYNAMIC_VALUE_BLACKLIST = [
  "2024023", "2014102", "2020091", "2026011", "2023042",
  "박건우", "박성호", "고현재", "주향모", "우현욱",
  "김인권", "김현우", "김희동", "류지범", "문광호", "송기헌", "신재희", "이상묵", "강전환", "송준영",
  "이 민 호", "7251",
  "SKB동작국사", "이천HN_OP", "대전DC", "대전NOC", "SK하이닉스_이천",
  "513558", "513596", "256799", "256798", "3081542", "28129234",
  "177008", "214574", "391582"
];

// Volatile metadata excluded from parity comparison:
// 1. ExcelJS internal volatile IDs: styleId, mediaId, rId
// 2. Zip archive timestamp and entry ordering
// 3. Worksheet image binary/relationship ID (image anchor topology tested separately)
// Formula and cell style fields (font, alignment, border, fill, numFmt, protection) are strictly preserved and compared recursively.
const deepNormalize = (val: unknown): unknown => {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val !== "object") return val;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) {
    return val.map(deepNormalize);
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const res: Record<string, unknown> = {};
  for (const k of keys) {
    if (k === "styleId" || k === "rId" || k === "mediaId") {
      continue;
    }
    const norm = deepNormalize(obj[k]);
    if (norm !== undefined) {
      res[k] = norm;
    }
  }
  return res;
};


const parseCellRange = (rangeStr: string) => {
  const [start, end] = rangeStr.split(":");
  const parseCell = (cellStr: string) => {
    const match = cellStr.match(/^([A-Z]+)(\d+)$/);
    if (!match) throw new Error(`Invalid cell address: ${cellStr}`);
    const colStr = match[1]!;
    const row = Number(match[2]);
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    return { row, col };
  };
  return { start: parseCell(start!), end: parseCell(end!) };
};

const scrubScheduleTemplate1 = (ws: ExcelJS.Worksheet) => {
  ws.getCell("C3").value = null;
  ws.getCell("W6").value = null;
  ws.getCell("B7").value = null;
  const weekStarts = [9, 15, 21, 27, 33, 39];
  const colStarts = [3, 6, 9, 12, 15, 18, 21];
  for (const r of weekStarts) {
    for (const c of colStarts) {
      ws.getCell(r, c).value = null;
      ws.getCell(r + 1, c + 1).value = null;
      ws.getCell(r + 2, c + 1).value = null;
      ws.getCell(r + 3, c + 1).value = null;
      ws.getCell(r + 4, c + 1).value = null;
      ws.getCell(r + 5, c + 1).value = null;
    }
  }
  for (let r = 12; r <= 42; r++) {
    ws.getCell(`Y${r}`).value = null;
    for (let c = 26; c <= 49; c++) {
      ws.getCell(r, c).value = null;
    }
    ws.getCell(`AX${r}`).value = null;
    ws.getCell(`AY${r}`).value = null;
  }
  for (let r = 11; r <= 26; r++) {
    for (let c = 53; c <= 63; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  for (let r = 34; r <= 40; r++) {
    for (let c = 53; c <= 63; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  ws.getCell("AY8").value = null;
  ws.getCell("BK8").value = null;
  ws.getCell("BK30").value = null;
};

const scrubScheduleTemplate2 = (ws: ExcelJS.Worksheet) => {
  ws.getCell("C3").value = null;
  ws.getCell("W6").value = null;
  ws.getCell("B7").value = null;
  const weekStarts = [9, 19, 29, 39, 49, 59];
  const colStarts = [3, 6, 9, 12, 15, 18, 21];
  for (const r of weekStarts) {
    for (const c of colStarts) {
      ws.getCell(r, c).value = null;
      ws.getCell(r + 1, c).value = null;
      ws.getCell(r + 1, c + 1).value = null;
      ws.getCell(r + 1, c + 2).value = null;
      ws.getCell(r + 4, c + 1).value = null;
      for (let o = 5; o <= 9; o++) {
        ws.getCell(r + o, c + 1).value = null;
      }
    }
  }
  for (let r = 12; r <= 42; r++) {
    ws.getCell(`Y${r}`).value = null;
    for (let c = 26; c <= 57; c++) {
      ws.getCell(r, c).value = null;
    }
    ws.getCell(`BF${r}`).value = null;
    ws.getCell(`BG${r}`).value = null;
  }
  for (let r = 11; r <= 26; r++) {
    for (let c = 61; c <= 71; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  for (let r = 34; r <= 40; r++) {
    for (let c = 61; c <= 71; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  ws.getCell("BG8").value = null;
  ws.getCell("BS8").value = null;
  ws.getCell("BS30").value = null;
};

const scrubProposal = (ws: ExcelJS.Worksheet) => {
  ws.getCell("C5").value = null;
  ws.getCell("E5").value = null;
  ws.getCell("C6").value = null;
  ws.getCell("D6").value = null;
  ws.getCell("E6").value = null;
  ws.getCell("C7").value = null;
  ws.getCell("D7").value = null;
  ws.getCell("E7").value = null;
  for (let c = 1; c <= 9; c++) {
    ws.getCell(11, c).value = null;
  }
  ws.getCell("C12").value = null;
  ws.getCell("B16").value = null;
  ws.getCell("B18").value = null;
  for (let c = 2; c <= 8; c++) {
    ws.getCell(21, c).value = null;
    ws.getCell(22, c).value = null;
  }
  ws.getCell("B24").value = null;
  for (let c = 2; c <= 8; c++) {
    ws.getCell(27, c).value = null;
    ws.getCell(28, c).value = null;
  }
  for (let c = 2; c <= 8; c++) {
    ws.getCell(30, c).value = null;
  }
  ws.getCell("B32").value = null;
  ws.getCell("B33").value = null;
};

const scrubAttachment1 = (ws: ExcelJS.Worksheet) => {
  ws.getCell("A1").value = null;
  for (let r = 5; r <= 14; r++) {
    for (let c = 1; c <= 19; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  for (let c = 1; c <= 19; c++) {
    ws.getCell(15, c).value = null;
    ws.getCell(16, c).value = null;
  }
  ws.getCell("A18").value = null;
  for (let c = 1; c <= 19; c++) {
    ws.getCell(22, c).value = null;
    ws.getCell(23, c).value = null;
  }
};

const scrubAttachment2 = (ws: ExcelJS.Worksheet) => {
  ws.getCell("B1").value = null;
  ws.getCell("G2").value = null;
  for (let r = 5; r <= 85; r++) {
    for (let c = 1; c <= 7; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  for (let c = 1; c <= 7; c++) {
    ws.getCell(86, c).value = null;
  }
};

const assertWorkbookParity = (
  actualWs: ExcelJS.Worksheet,
  sampleWs: ExcelJS.Worksheet,
  canvasRangeStr: string
) => {
  // 1. Sheet name
  expect(actualWs.name).toBe(sampleWs.name);

  // 2. Merges
  const actualMerges = [...(actualWs.model.merges ?? [])].sort();
  const sampleMerges = [...(sampleWs.model.merges ?? [])].sort();
  expect(actualMerges).toEqual(sampleMerges);

  // 3. Columns width, hidden, outlineLevel
  const { start, end } = parseCellRange(canvasRangeStr);
  for (let c = start.col; c <= end.col; c++) {
    const actCol = actualWs.getColumn(c);
    const samCol = sampleWs.getColumn(c);
    expect(deepNormalize({
      width: actCol.width,
      hidden: actCol.hidden,
      outlineLevel: actCol.outlineLevel
    })).toEqual(deepNormalize({
      width: samCol.width,
      hidden: samCol.hidden,
      outlineLevel: samCol.outlineLevel
    }));
  }

  // 4. Rows height, hidden, outlineLevel
  for (let r = start.row; r <= end.row; r++) {
    const actRow = actualWs.getRow(r);
    const samRow = sampleWs.getRow(r);
    expect(deepNormalize({
      height: actRow.height,
      hidden: actRow.hidden,
      outlineLevel: actRow.outlineLevel
    })).toEqual(deepNormalize({
      height: samRow.height,
      hidden: samRow.hidden,
      outlineLevel: samRow.outlineLevel
    }));
  }

  // 5. Worksheet properties, views, pageSetup, pageMargins, headerFooter (Normalized full deep equality)
  expect(deepNormalize(actualWs.properties)).toEqual(deepNormalize(sampleWs.properties));
  expect(deepNormalize(actualWs.views)).toEqual(deepNormalize(sampleWs.views));
  expect(deepNormalize(actualWs.pageSetup)).toEqual(deepNormalize(sampleWs.pageSetup));
  expect(deepNormalize(actualWs.pageMargins)).toEqual(deepNormalize(sampleWs.pageMargins));
  expect(deepNormalize(actualWs.headerFooter)).toEqual(deepNormalize(sampleWs.headerFooter));

  // 6. Cells values, protection, and styles (Recursive full deep equality)
  for (let r = start.row; r <= end.row; r++) {
    for (let c = start.col; c <= end.col; c++) {
      const actCell = actualWs.getCell(r, c);
      const samCell = sampleWs.getCell(r, c);

      // Merged slave cells: verify master relationship and skip independent style check
      if (samCell.isMerged && samCell.master.address !== samCell.address) {
        expect(actCell.isMerged).toBe(true);
        expect(actCell.master.address).toBe(samCell.master.address);
        continue;
      }

      // Value parity
      try {
        expect(deepNormalize(actCell.value)).toEqual(deepNormalize(samCell.value));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] Value mismatch: ${(err as Error).message}`);
      }

      // Protection parity (meaningful false preserved)
      try {
        expect(deepNormalize(actCell.protection)).toEqual(deepNormalize(samCell.protection));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] Protection mismatch: ${(err as Error).message}`);
      }

      // Style parity (full enumerable fields: font/alignment/border/fill/numFmt)
      try {
        expect(deepNormalize(actCell.numFmt)).toEqual(deepNormalize(samCell.numFmt));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] numFmt mismatch: ${(err as Error).message}`);
      }
      try {
        expect(deepNormalize(actCell.font)).toEqual(deepNormalize(samCell.font));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] Font mismatch: ${(err as Error).message}`);
      }
      try {
        expect(deepNormalize(actCell.alignment)).toEqual(deepNormalize(samCell.alignment));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] Alignment mismatch: ${(err as Error).message}`);
      }
      try {
        expect(deepNormalize(actCell.border)).toEqual(deepNormalize(samCell.border));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] Border mismatch: ${(err as Error).message}`);
      }
      try {
        expect(deepNormalize(actCell.fill)).toEqual(deepNormalize(samCell.fill));
      } catch (err) {
        throw new Error(`[Cell ${actCell.address}] Fill mismatch: ${(err as Error).message}`);
      }
    }
  }
};

const assertNoBlacklistValues = (ws: ExcelJS.Worksheet, canvasRangeStr: string) => {
  const { start, end } = parseCellRange(canvasRangeStr);
  for (let r = start.row; r <= end.row; r++) {
    for (let c = start.col; c <= end.col; c++) {
      const val = ws.getCell(r, c).value;
      if (val !== null && val !== undefined) {
        const valStr = String(typeof val === "object" && "formula" in (val as Record<string, unknown>) ? (val as { result?: unknown }).result ?? "" : val);
        for (const blacklisted of DYNAMIC_VALUE_BLACKLIST) {
          expect(valStr).not.toContain(blacklisted);
        }
      }
    }
  }
};

describe("built-in-excel-layout-service", () => {
  // Test 1: template1 built-in ↔ 표본 정적 값·구조·서식 parity + 동적 값 scrub + BA11 unlocked 보존
  it("should match template1 sample static layout with dynamic values scrubbed", async () => {
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.readFile(path.join(SAMPLES_DIR, "근무표_템플릿1.xlsx"));
    const sampleWs = sampleWb.getWorksheet("교대 근무 계획표")!;
    scrubScheduleTemplate1(sampleWs);

    const builtInWb = createBuiltInExcelWorkbook("schedule-xlsx/template1", { applyLogo: false });
    const builtInWs = builtInWb.getWorksheet("교대 근무 계획표")!;

    assertWorkbookParity(builtInWs, sampleWs, "A1:BS80");
    assertNoBlacklistValues(builtInWs, "A1:BS80");

    // Write to buffer and reopen to verify cell protection preservation across serialization
    const buf = await builtInWb.xlsx.writeBuffer();
    const reopenedWb = new ExcelJS.Workbook();
    await reopenedWb.xlsx.load(buf);
    const reopenedWs = reopenedWb.getWorksheet("교대 근무 계획표")!;
    const reopenedBA11 = reopenedWs.getCell("BA11");
    expect(reopenedBA11.protection?.locked).toBe(false);
    expect(reopenedBA11.protection?.hidden).toBe(true);

    // N6: font.color.theme 변조 시 parity helper가 실제로 throw하는 음성 assertion (D25-2-003)
    const mutatedWs = sampleWb.getWorksheet("교대 근무 계획표")!;
    const originalA1Font = JSON.parse(JSON.stringify(mutatedWs.getCell("A1").font));
    mutatedWs.getCell("A1").font = {
      ...originalA1Font,
      color: { theme: 999 }
    };
    expect(() => assertWorkbookParity(builtInWs, mutatedWs, "A1:BS80")).toThrow(
      /Font mismatch/
    );
    mutatedWs.getCell("A1").font = originalA1Font;
  });

  // Test 2: template2 built-in ↔ 표본 정적 값·구조·서식 parity + 동적 값 scrub + BI11 unlocked 보존
  it("should match template2 sample static layout with dynamic values scrubbed", async () => {
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.readFile(path.join(SAMPLES_DIR, "근무표_템플릿2.xlsx"));
    const sampleWs = sampleWb.getWorksheet("교대 근무 계획표")!;
    scrubScheduleTemplate2(sampleWs);

    const builtInWb = createBuiltInExcelWorkbook("schedule-xlsx/template2", { applyLogo: false });
    const builtInWs = builtInWb.getWorksheet("교대 근무 계획표")!;

    assertWorkbookParity(builtInWs, sampleWs, "A1:BS80");
    assertNoBlacklistValues(builtInWs, "A1:BS80");

    // Write to buffer and reopen to verify cell protection preservation across serialization
    const buf = await builtInWb.xlsx.writeBuffer();
    const reopenedWb = new ExcelJS.Workbook();
    await reopenedWb.xlsx.load(buf);
    const reopenedWs = reopenedWb.getWorksheet("교대 근무 계획표")!;
    const reopenedBI11 = reopenedWs.getCell("BI11");
    expect(reopenedBI11.protection?.locked).toBe(false);
    expect(reopenedBI11.protection?.hidden).toBe(true);
  });

  // Test 3: proposal built-in ↔ 표본 주 시트 정적 값·구조·서식 parity + 동적 값 scrub
  it("should match proposal sample primary sheet static layout with dynamic values scrubbed", async () => {
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.readFile(path.join(SAMPLES_DIR, "품의서_2026-04_수정본.xlsx"));
    const sampleWs = sampleWb.getWorksheet("품의서")!;
    scrubProposal(sampleWs);

    const builtInWb = createBuiltInExcelWorkbook("proposal-xlsx", { applyLogo: false });
    const builtInWs = builtInWb.getWorksheet("품의서")!;

    assertWorkbookParity(builtInWs, sampleWs, "A1:I44");
    assertNoBlacklistValues(builtInWs, "A1:I44");
  });

  // Test 4: attachment1 built-in ↔ 표본 '별첨1' 정적 값·구조·서식 parity + 인력/사번/금액 scrub
  it("should match attachment1 sample primary sheet static layout with dynamic values scrubbed", async () => {
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.readFile(path.join(SAMPLES_DIR, "별첨1_2026-04_수정본.xlsx"));
    const sampleWs = sampleWb.getWorksheet("별첨1")!;
    scrubAttachment1(sampleWs);

    const builtInWb = createBuiltInExcelWorkbook("attachment1-xlsx", { applyLogo: false });
    const builtInWs = builtInWb.getWorksheet("별첨1")!;

    assertWorkbookParity(builtInWs, sampleWs, "A1:S92");
    assertNoBlacklistValues(builtInWs, "A1:S92");
  });

  // Test 5: attachment2 built-in ↔ 표본 정적 값·구조·서식 parity + 인력/금액 scrub
  it("should match attachment2 sample static layout with dynamic values scrubbed", async () => {
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.readFile(path.join(SAMPLES_DIR, "별첨2_샘플.xlsx"));
    const sampleWs = sampleWb.getWorksheet("별첨2")!;
    scrubAttachment2(sampleWs);

    const builtInWb = createBuiltInExcelWorkbook("attachment2-xlsx", { applyLogo: false });
    const builtInWs = builtInWb.getWorksheet("별첨2")!;

    assertWorkbookParity(builtInWs, sampleWs, "A1:G86");
    assertNoBlacklistValues(builtInWs, "A1:G86");
  });

  // Test 6: 수당 3종 topology/단일 시트/로고 anchor tl·br 및 로고 부재 시 에러 throw 검증
  it("should enforce single primary sheet and logo anchor topology for allowance documents", () => {
    const proposalWb = createBuiltInExcelWorkbook("proposal-xlsx");
    expect(proposalWb.worksheets).toHaveLength(1);
    expect(proposalWb.worksheets[0]!.name).toBe("품의서");
    const proposalImages = proposalWb.worksheets[0]!.getImages();
    expect(proposalImages).toHaveLength(1);
    expect(proposalImages[0]!.range.editAs).toBe("oneCell");
    expect(proposalImages[0]!.range.tl.col).toBe(0); // Col A (0-based)
    expect(proposalImages[0]!.range.tl.row).toBe(0); // Row 1 (0-based)
    expect(proposalImages[0]!.range.br.col).toBe(3); // Col C (0-based exclusive end)
    expect(proposalImages[0]!.range.br.row).toBe(1); // Row 1 (0-based exclusive end)

    const att1Wb = createBuiltInExcelWorkbook("attachment1-xlsx");
    expect(att1Wb.worksheets).toHaveLength(1);
    expect(att1Wb.worksheets[0]!.name).toBe("별첨1");
    const att1Images = att1Wb.worksheets[0]!.getImages();
    expect(att1Images).toHaveLength(1);
    expect(att1Images[0]!.range.editAs).toBe("oneCell");
    expect(att1Images[0]!.range.tl.col).toBe(16); // Col Q (16: 0-based)
    expect(att1Images[0]!.range.tl.row).toBe(0);  // Row 1 (0-based)
    expect(att1Images[0]!.range.br.col).toBe(19); // Col S (19: 0-based exclusive end)
    expect(att1Images[0]!.range.br.row).toBe(1);  // Row 1 (0-based exclusive end)

    const att2Wb = createBuiltInExcelWorkbook("attachment2-xlsx");
    expect(att2Wb.worksheets).toHaveLength(1);
    expect(att2Wb.worksheets[0]!.name).toBe("별첨2");
    const att2Images = att2Wb.worksheets[0]!.getImages();
    expect(att2Images).toHaveLength(1);
    expect(att2Images[0]!.range.editAs).toBe("oneCell");
    expect(att2Images[0]!.range.tl.col).toBe(5); // Col F (5: 0-based)
    expect(att2Images[0]!.range.tl.row).toBe(0); // Row 1 (0-based)
    expect(att2Images[0]!.range.br.col).toBe(7); // Col G (7: 0-based exclusive end)
    expect(att2Images[0]!.range.br.row).toBe(1); // Row 1 (0-based exclusive end)

    // Verify missing logo throws with specific document kind label and restore seam in try/finally
    try {
      setBrandLogoResolverForTest(() => null);
      expect(() => createBuiltInExcelWorkbook("proposal-xlsx")).toThrow(
        "[품의서 Excel] 브랜드 로고 이미지를 찾을 수 없습니다."
      );
      expect(() => createBuiltInExcelWorkbook("attachment1-xlsx")).toThrow(
        "[별첨1 Excel] 브랜드 로고 이미지를 찾을 수 없습니다."
      );
      expect(() => createBuiltInExcelWorkbook("attachment2-xlsx")).toThrow(
        "[별첨2 Excel] 브랜드 로고 이미지를 찾을 수 없습니다."
      );
    } finally {
      setBrandLogoResolverForTest(null);
    }
  });

  // Test 7: 알 수 없는 layout key 및 손상된 definition이 fallback 없이 실패
  it("should fail without fallback when given an unknown layout key", async () => {
    // 1. Unknown layout key
    expect(() =>
      createBuiltInExcelWorkbook("unknown-key" as BuiltInExcelLayoutKey)
    ).toThrow("지원하지 않는 기본 Excel 레이아웃 키입니다: unknown-key");

    // 2. Corrupt definition: invalid schemaVersion
    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 999,
        layoutKey: "proposal-xlsx",
        canvasRange: "A1:I44",
        worksheet: { name: "품의서" },
        columns: [],
        rows: [],
        merges: [],
        cells: []
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'schemaVersion'의 형식이 올바르지 않습니다: schemaVersion은 1이어야 합니다.");

    // 3. Corrupt definition: invalid canvasRange
    expect(() =>
      validateBuiltInExcelLayoutDefinition("attachment1-xlsx", {
        schemaVersion: 1,
        layoutKey: "attachment1-xlsx",
        canvasRange: "INVALID_RANGE",
        worksheet: { name: "별첨1" },
        columns: [],
        rows: [],
        merges: [],
        cells: []
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (attachment1-xlsx)] 필드 'canvasRange'의 형식이 올바르지 않습니다: 'A1:BS80' 형식의 유효한 좌표 범위여야 합니다.");

    // 4. N1: cells[0].font = "BROKEN" 손상 거절
    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 1,
        layoutKey: "proposal-xlsx",
        canvasRange: "A1:I44",
        worksheet: { name: "품의서" },
        columns: [],
        rows: [],
        merges: [],
        cells: [{ address: "A1", font: "BROKEN" as unknown as Partial<ExcelJS.Font> }]
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'cells[0].font'의 형식이 올바르지 않습니다: 객체여야 합니다.");

    // 5. N2: cells[0].value.formula 손상 ({ formula: 123 }) 거절
    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 1,
        layoutKey: "proposal-xlsx",
        canvasRange: "A1:I44",
        worksheet: { name: "품의서" },
        columns: [],
        rows: [],
        merges: [],
        cells: [{ address: "A1", value: { formula: 123 as unknown as string } }]
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'cells[0].value.formula'의 형식이 올바르지 않습니다: formula는 문자열이어야 합니다.");

    // 6. N3: reversed/out-of-canvas canvas/merges/columns/rows 거절
    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 1,
        layoutKey: "proposal-xlsx",
        canvasRange: "A2:A1",
        worksheet: { name: "품의서" },
        columns: [],
        rows: [],
        merges: [],
        cells: []
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'canvasRange'의 형식이 올바르지 않습니다: 'A1:BS80' 형식의 유효한 좌표 범위여야 합니다.");

    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 1,
        layoutKey: "proposal-xlsx",
        canvasRange: "A1:I44",
        worksheet: { name: "품의서" },
        columns: [],
        rows: [],
        merges: ["B2:A1"],
        cells: []
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'merges[0]'의 형식이 올바르지 않습니다: 유효한 병합 범위 문자열이어야 하며 시작 좌표가 끝 좌표보다 작거나 같아야 합니다.");

    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 1,
        layoutKey: "proposal-xlsx",
        canvasRange: "A1:I44",
        worksheet: { name: "품의서" },
        columns: [{ index: 1, width: -5 }],
        rows: [],
        merges: [],
        cells: []
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'columns[0].width'의 형식이 올바르지 않습니다: 0 이상의 유한한 숫자여야 합니다.");

    expect(() =>
      validateBuiltInExcelLayoutDefinition("proposal-xlsx", {
        schemaVersion: 1,
        layoutKey: "proposal-xlsx",
        canvasRange: "A1:I44",
        worksheet: { name: "품의서" },
        columns: [],
        rows: [{ number: 1, height: -10 }],
        merges: [],
        cells: []
      })
    ).toThrow("[내장 Excel 레이아웃 오류 (proposal-xlsx)] 필드 'rows[0].height'의 형식이 올바르지 않습니다: 0 이상의 유한한 숫자여야 합니다.");

    type GeneratorValidatorModule = {
      validateLayoutSchema: (definition: unknown) => void;
    };
    const generatorModuleUrl = pathToFileURL(
      path.resolve(process.cwd(), "scripts", "generate-built-in-excel-layouts.mjs")
    ).href;
    const generatorModule = (await import(generatorModuleUrl)) as GeneratorValidatorModule;

    const createValidDefinition = (): BuiltInExcelLayoutDefinition => ({
      schemaVersion: 1,
      layoutKey: "proposal-xlsx",
      canvasRange: "A1:I44",
      worksheet: { name: "품의서" },
      columns: [],
      rows: [],
      merges: [],
      cells: [{ address: "A1" }]
    });

    const corruptCases: Array<{
      path: string;
      mutate: (definition: BuiltInExcelLayoutDefinition) => void;
    }> = [
      {
        path: "worksheet.properties.defaultColWidth",
        mutate: (definition) => { definition.worksheet.properties = { defaultColWidth: "bad" }; }
      },
      {
        path: "worksheet.properties.outlineProperties.summaryBelow",
        mutate: (definition) => {
          definition.worksheet.properties = { outlineProperties: { summaryBelow: "yes" } };
        }
      },
      {
        path: "worksheet.views[0].state",
        mutate: (definition) => { definition.worksheet.views = [{ state: "sideways" }]; }
      },
      {
        path: "worksheet.views[0].zoomScale",
        mutate: (definition) => { definition.worksheet.views = [{ state: "normal", zoomScale: 0 }]; }
      },
      {
        path: "worksheet.pageSetup.orientation",
        mutate: (definition) => { definition.worksheet.pageSetup = { orientation: "diagonal" }; }
      },
      {
        path: "worksheet.pageSetup.margins.left",
        mutate: (definition) => {
          definition.worksheet.pageSetup = { margins: { left: "wide" } };
        }
      },
      {
        path: "worksheet.headerFooter.differentFirst",
        mutate: (definition) => { definition.worksheet.headerFooter = { differentFirst: 1 }; }
      },
      {
        path: "cells[0].value.result",
        mutate: (definition) => {
          definition.cells[0]!.value = { formula: "1+1", result: Symbol("bad") };
        }
      },
      {
        path: "cells[0].value.richText[0].text",
        mutate: (definition) => {
          definition.cells[0]!.value = { richText: [{ text: 123 }] };
        }
      },
      {
        path: "cells[0].value.date",
        mutate: (definition) => { definition.cells[0]!.value = { date: 123 }; }
      },
      {
        path: "cells[0].value.hyperlink",
        mutate: (definition) => {
          definition.cells[0]!.value = { text: "링크", hyperlink: 1 };
        }
      },
      {
        path: "cells[0].value.error",
        mutate: (definition) => { definition.cells[0]!.value = { error: "#BROKEN!" }; }
      },
      {
        path: "cells[0].value",
        mutate: (definition) => { definition.cells[0]!.value = 1n; }
      },
      {
        path: "cells[0].font.bold",
        mutate: (definition) => {
          definition.cells[0]!.font = { bold: "yes" } as unknown as Partial<ExcelJS.Font>;
        }
      },
      {
        path: "cells[0].font.scheme",
        mutate: (definition) => {
          definition.cells[0]!.font = { scheme: "unexpected" } as unknown as Partial<ExcelJS.Font>;
        }
      },
      {
        path: "cells[0].font.color.argb",
        mutate: (definition) => { definition.cells[0]!.font = { color: { argb: "RED" } }; }
      },
      {
        path: "cells[0].alignment.horizontal",
        mutate: (definition) => {
          definition.cells[0]!.alignment = {
            horizontal: "sideways"
          } as unknown as Partial<ExcelJS.Alignment>;
        }
      },
      {
        path: "cells[0].alignment.textRotation",
        mutate: (definition) => {
          definition.cells[0]!.alignment = { textRotation: 91 };
        }
      },
      {
        path: "cells[0].border.top.style",
        mutate: (definition) => {
          definition.cells[0]!.border = {
            top: { style: 123 }
          } as unknown as Partial<ExcelJS.Borders>;
        }
      },
      {
        path: "cells[0].border.diagonal.up",
        mutate: (definition) => {
          definition.cells[0]!.border = {
            diagonal: { style: "thin", up: "yes" }
          } as unknown as Partial<ExcelJS.Borders>;
        }
      },
      {
        path: "cells[0].fill.pattern",
        mutate: (definition) => {
          definition.cells[0]!.fill = {
            type: "pattern",
            pattern: 123
          } as unknown as ExcelJS.Fill;
        }
      },
      {
        path: "cells[0].fill.stops[0].position",
        mutate: (definition) => {
          definition.cells[0]!.fill = {
            type: "gradient",
            gradient: "angle",
            degree: 45,
            stops: [{ position: 2, color: { argb: "FFFFFFFF" } }]
          };
        }
      },
      {
        path: "cells[0].protection.locked",
        mutate: (definition) => {
          definition.cells[0]!.protection = {
            locked: "yes"
          } as unknown as Partial<ExcelJS.Protection>;
        }
      },
      {
        path: "cells[0].font.typoBold",
        mutate: (definition) => {
          definition.cells[0]!.font = {
            typoBold: true
          } as unknown as Partial<ExcelJS.Font>;
        }
      }
    ];

    for (const corruptCase of corruptCases) {
      const runtimeDefinition = createValidDefinition();
      corruptCase.mutate(runtimeDefinition);
      expect(() =>
        validateBuiltInExcelLayoutDefinition("proposal-xlsx", runtimeDefinition)
      ).toThrow(`필드 '${corruptCase.path}'`);

      const generatorDefinition = createValidDefinition();
      corruptCase.mutate(generatorDefinition);
      expect(() => generatorModule.validateLayoutSchema(generatorDefinition)).toThrow(
        `필드 '${corruptCase.path}'`
      );
    }
  });

  // Test 8: 두 번 생성한 workbook이 독립적이며 첫 객체 수정이 두 번째에 새지 않음
  it("should create independent workbooks without mutating underlying JSON definitions", () => {
    const wb1 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws1 = wb1.getWorksheet("품의서")!;
    ws1.getCell("A1").value = "MUTATED_VALUE_FOR_ISOLATION_TEST";
    ws1.getCell("A1").font = { name: "FakeFont", size: 99, bold: true };
    ws1.getColumn(1).width = 999;
    ws1.getRow(1).height = 888;

    const wb2 = createBuiltInExcelWorkbook("proposal-xlsx");
    const ws2 = wb2.getWorksheet("품의서")!;
    expect(ws2.getCell("A1").value).not.toBe("MUTATED_VALUE_FOR_ISOLATION_TEST");
    expect(ws2.getCell("A1").font?.name).not.toBe("FakeFont");
    expect(ws2.getCell("A1").font?.size).not.toBe(99);
    expect(ws2.getColumn(1).width).not.toBe(999);
    expect(ws2.getRow(1).height).not.toBe(888);

    // N5: getBuiltInExcelLayoutDefinition 반환값 수정 후 재호출 격리 검증 (D25-2-011)
    const def1 = getBuiltInExcelLayoutDefinition("proposal-xlsx");
    def1.worksheet.name = "MUTATED_SHARED_DEFINITION";
    def1.columns[0]!.width = 999;
    def1.rows[0]!.height = 888;
    def1.cells[0]!.value = "MUTATED_CELL_DEF";

    const def2 = getBuiltInExcelLayoutDefinition("proposal-xlsx");
    expect(def2.worksheet.name).toBe("품의서");
    expect(def2.columns[0]!.width).not.toBe(999);
    expect(def2.rows[0]!.height).not.toBe(888);
    expect(def2.cells[0]!.value).not.toBe("MUTATED_CELL_DEF");

    const wbIsolated = createBuiltInExcelWorkbook("proposal-xlsx");
    expect(wbIsolated.getWorksheet("품의서")).toBeDefined();
    expect(wbIsolated.getWorksheet("MUTATED_SHARED_DEFINITION")).toBeUndefined();
  });
});
