import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const EXPECTED_SAMPLE_HASHES = {
  "근무표_템플릿1.xlsx": {
    size: 21727,
    sha256: "E09DA2FAA5571668F9BBC67C08D83CACBD89A6B86E4CC5028493A5A579F8F413".toLowerCase()
  },
  "근무표_템플릿2.xlsx": {
    size: 21332,
    sha256: "75C374E55FF21335E51F1EB480D1E57814213EEB53B485CDE533C2A6EF86F2D0".toLowerCase()
  },
  "품의서_2026-04_수정본.xlsx": {
    size: 37925,
    sha256: "D45C4F98EB08F78C51C613B309E1F54D4076A7C6B1F158CDBF2DB02726D3A057".toLowerCase()
  },
  "별첨1_2026-04_수정본.xlsx": {
    size: 665801,
    sha256: "248A5A28BC6CBAD739F35D9252D56922556D625BE07EE120242EB0DFB0A5B4B7".toLowerCase()
  },
  "별첨2_샘플.xlsx": {
    size: 19090,
    sha256: "AD0FE1CAD90A41F217A6582219FECD862E005B016D2427B98339323992A9FB56".toLowerCase()
  }
};

export const LAYOUT_TARGETS = [
  {
    layoutKey: "schedule-xlsx/template1",
    fileName: "근무표_템플릿1.xlsx",
    sheetName: "교대 근무 계획표",
    outputJson: "schedule-template1.json",
    canvasRange: "A1:BS80",
    manifest: [
      "C3", "W6", "B7", "AY8", "BK8", "BK30",
      ...[9, 15, 21, 27, 33, 39].flatMap((r) =>
        [3, 6, 9, 12, 15, 18, 21].flatMap((c) => [
          { row: r, col: c },
          { row: r + 1, col: c + 1 },
          { row: r + 2, col: c + 1 },
          { row: r + 3, col: c + 1 },
          { row: r + 4, col: c + 1 },
          { row: r + 5, col: c + 1 }
        ])
      ),
      ...Array.from({ length: 31 }, (_, i) => 12 + i).flatMap((r) => [
        `Y${r}`,
        ...Array.from({ length: 24 }, (_, ci) => ({ row: r, col: 26 + ci })),
        `AX${r}`,
        `AY${r}`
      ]),
      ...Array.from({ length: 16 }, (_, i) => 11 + i).flatMap((r) =>
        Array.from({ length: 11 }, (_, ci) => ({ row: r, col: 53 + ci }))
      ),
      ...Array.from({ length: 7 }, (_, i) => 34 + i).flatMap((r) =>
        Array.from({ length: 11 }, (_, ci) => ({ row: r, col: 53 + ci }))
      )
    ]
  },
  {
    layoutKey: "schedule-xlsx/template2",
    fileName: "근무표_템플릿2.xlsx",
    sheetName: "교대 근무 계획표",
    outputJson: "schedule-template2.json",
    canvasRange: "A1:BS80",
    manifest: [
      "C3", "W6", "B7", "BG8", "BS8", "BS30",
      ...[9, 19, 29, 39, 49, 59].flatMap((r) =>
        [3, 6, 9, 12, 15, 18, 21].flatMap((c) => [
          { row: r, col: c },
          { row: r + 1, col: c },
          { row: r + 1, col: c + 1 },
          { row: r + 1, col: c + 2 },
          { row: r + 4, col: c + 1 },
          ...Array.from({ length: 5 }, (_, o) => ({ row: r + 5 + o, col: c + 1 }))
        ])
      ),
      ...Array.from({ length: 31 }, (_, i) => 12 + i).flatMap((r) => [
        `Y${r}`,
        ...Array.from({ length: 32 }, (_, ci) => ({ row: r, col: 26 + ci })),
        `BF${r}`,
        `BG${r}`
      ]),
      ...Array.from({ length: 16 }, (_, i) => 11 + i).flatMap((r) =>
        Array.from({ length: 11 }, (_, ci) => ({ row: r, col: 61 + ci }))
      ),
      ...Array.from({ length: 7 }, (_, i) => 34 + i).flatMap((r) =>
        Array.from({ length: 11 }, (_, ci) => ({ row: r, col: 61 + ci }))
      )
    ]
  },
  {
    layoutKey: "proposal-xlsx",
    fileName: "품의서_2026-04_수정본.xlsx",
    sheetName: "품의서",
    outputJson: "proposal.json",
    canvasRange: "A1:I44",
    logoRange: { startColumn: 1, startRow: 1, endColumn: 3, endRow: 1 },
    manifest: [
      "C5", "E5", "C6", "D6", "E6", "C7", "D7", "E7",
      ...Array.from({ length: 9 }, (_, c) => ({ row: 11, col: c + 1 })),
      "C12", "B16", "B18",
      ...Array.from({ length: 7 }, (_, c) => ({ row: 21, col: c + 2 })),
      ...Array.from({ length: 7 }, (_, c) => ({ row: 22, col: c + 2 })),
      "B24",
      ...Array.from({ length: 7 }, (_, c) => ({ row: 27, col: c + 2 })),
      ...Array.from({ length: 7 }, (_, c) => ({ row: 28, col: c + 2 })),
      ...Array.from({ length: 7 }, (_, c) => ({ row: 30, col: c + 2 })),
      "B32", "B33"
    ]
  },
  {
    layoutKey: "attachment1-xlsx",
    fileName: "별첨1_2026-04_수정본.xlsx",
    sheetName: "별첨1",
    outputJson: "attachment1.json",
    canvasRange: "A1:S92",
    logoRange: { startColumn: 17, startRow: 1, endColumn: 19, endRow: 1 },
    manifest: [
      "A1",
      ...Array.from({ length: 10 }, (_, i) => 5 + i).flatMap((r) =>
        Array.from({ length: 19 }, (_, c) => ({ row: r, col: c + 1 }))
      ),
      ...Array.from({ length: 19 }, (_, c) => ({ row: 15, col: c + 1 })),
      ...Array.from({ length: 19 }, (_, c) => ({ row: 16, col: c + 1 })),
      "A18",
      ...Array.from({ length: 19 }, (_, c) => ({ row: 22, col: c + 1 })),
      ...Array.from({ length: 19 }, (_, c) => ({ row: 23, col: c + 1 }))
    ]
  },
  {
    layoutKey: "attachment2-xlsx",
    fileName: "별첨2_샘플.xlsx",
    sheetName: "별첨2",
    outputJson: "attachment2.json",
    canvasRange: "A1:G86",
    logoRange: { startColumn: 6, startRow: 1, endColumn: 7, endRow: 1 },
    manifest: [
      "B1", "G2",
      ...Array.from({ length: 81 }, (_, i) => 5 + i).flatMap((r) =>
        Array.from({ length: 7 }, (_, c) => ({ row: r, col: c + 1 }))
      ),
      ...Array.from({ length: 7 }, (_, c) => ({ row: 86, col: c + 1 }))
    ]
  }
];

export function verifySampleHashes() {
  for (const [fileName, expected] of Object.entries(EXPECTED_SAMPLE_HASHES)) {
    const fullPath = path.resolve(projectRoot, "양식샘플", fileName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`표본 파일이 존재하지 않습니다: ${fullPath}`);
    }
    const buf = fs.readFileSync(fullPath);
    if (buf.length !== expected.size) {
      throw new Error(`표본 크기 불일치 (${fileName}): 기대 ${expected.size}, 실제 ${buf.length}`);
    }
    const sha = crypto.createHash("sha256").update(buf).digest("hex").toLowerCase();
    if (sha !== expected.sha256) {
      throw new Error(`표본 SHA-256 불일치 (${fileName}): 기대 ${expected.sha256}, 실제 ${sha}`);
    }
  }
}

export function clean(value, seen = new WeakSet()) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (seen.has(value)) return undefined;
    seen.add(value);
  }

  if (Array.isArray(value)) {
    const entries = value.map((entry) => clean(entry, seen)).filter((entry) => entry !== undefined);
    return entries.length > 0 ? entries : undefined;
  }

  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (key.startsWith("_") || key === "styleId" || key === "id") continue;
      const next = clean(value[key], seen);
      if (next !== undefined) result[key] = next;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  return value;
}

function serializeCellValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) return { date: value.toISOString() };
  if (typeof value !== "object") return value;
  if (value.formula !== undefined) return { formula: value.formula, result: clean(value.result) };
  if (value.sharedFormula !== undefined) return { sharedFormula: value.sharedFormula, result: clean(value.result) };
  if (value.richText !== undefined) {
    return {
      richText: value.richText.map((entry) => {
        const item = { text: entry.text };
        const f = clean(entry.font);
        if (f) item.font = f;
        return item;
      })
    };
  }
  if (value.text !== undefined && value.hyperlink !== undefined) {
    return { text: value.text, hyperlink: value.hyperlink };
  }
  if (value.error !== undefined) {
    return { error: value.error };
  }
  return clean(value);
}

function parseCanvasDimensions(canvasRange) {
  const parts = canvasRange.split(":");
  const endMatch = parts[1]?.match(/^([A-Z]+)(\d+)$/);
  if (!endMatch) throw new Error(`Invalid canvasRange: ${canvasRange}`);
  let col = 0;
  for (let i = 0; i < endMatch[1].length; i++) {
    col = col * 26 + (endMatch[1].charCodeAt(i) - 64);
  }
  return { maxCol: col, maxRow: Number(endMatch[2]) };
}

function applyManifestScrub(worksheet, manifest) {
  for (const item of manifest) {
    if (typeof item === "string") {
      worksheet.getCell(item).value = null;
    } else if (item && typeof item === "object") {
      worksheet.getCell(item.row, item.col).value = null;
    }
  }
}

export function assertManifestScrubbed(worksheet, target) {
  for (const item of target.manifest) {
    const cell = typeof item === "string" ? worksheet.getCell(item) : worksheet.getCell(item.row, item.col);
    const val = cell.value;
    if (val !== null && val !== undefined && val !== "") {
      const address = typeof item === "string" ? item : `R${item.row}C${item.col}`;
      throw new Error(`동적 바인딩 manifest 범위에 값이 잔존합니다 (${target.layoutKey}, 셀 ${address}): ${JSON.stringify(val)}`);
    }
  }
}

function isPlainObject(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const prototype = Object.getPrototypeOf(v);
  return prototype === Object.prototype || prototype === null;
}

function parseColumnLabelToNumber(label) {
  let result = 0;
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    if (code < 65 || code > 90) return null;
    result = result * 26 + (code - 64);
  }
  return result >= 1 && result <= 16384 ? result : null;
}

function parseCellCoordinate(address) {
  if (typeof address !== "string") return null;
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const column = parseColumnLabelToNumber(match[1]);
  const row = Number(match[2]);
  if (!column || !Number.isInteger(row) || row < 1 || row > 1048576) {
    return null;
  }
  return { column, row };
}

function parseRangeCoordinate(rangeStr) {
  if (typeof rangeStr !== "string") return null;
  const match = rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
  if (!match) return null;
  const start = parseCellCoordinate(match[1]);
  const end = parseCellCoordinate(match[2]);
  if (!start || !end) return null;
  if (start.column > end.column || start.row > end.row) return null;
  return {
    startColumn: start.column,
    startRow: start.row,
    endColumn: end.column,
    endRow: end.row
  };
}

function rangesOverlap(r1, r2) {
  return (
    r1.startColumn <= r2.endColumn &&
    r1.endColumn >= r2.startColumn &&
    r1.startRow <= r2.endRow &&
    r1.endRow >= r2.startRow
  );
}

const ROOT_KEYS = new Set([
  "schemaVersion", "layoutKey", "worksheet", "canvasRange", "logoRange",
  "columns", "rows", "merges", "cells"
]);
const WORKSHEET_KEYS = new Set(["name", "properties", "views", "pageSetup", "headerFooter"]);
const WORKSHEET_PROPERTY_KEYS = new Set([
  "tabColor", "outlineLevelCol", "outlineLevelRow", "outlineProperties",
  "defaultRowHeight", "defaultColWidth", "dyDescent", "showGridLines"
]);
const OUTLINE_PROPERTY_KEYS = new Set(["summaryBelow", "summaryRight"]);
const WORKSHEET_VIEW_KEYS = new Set([
  "workbookViewId", "state", "style", "rightToLeft", "activeCell", "showRuler",
  "showRowColHeaders", "showGridLines", "zoomScale", "zoomScaleNormal", "xSplit",
  "ySplit", "topLeftCell", "activePane"
]);
const PAGE_SETUP_KEYS = new Set([
  "margins", "orientation", "horizontalDpi", "verticalDpi", "fitToPage", "fitToWidth",
  "fitToHeight", "scale", "pageOrder", "blackAndWhite", "draft", "cellComments", "errors",
  "paperSize", "showRowColHeaders", "showGridLines", "firstPageNumber", "useFirstPageNumber",
  "usePrinterDefaults", "horizontalCentered", "verticalCentered", "printArea", "printTitlesRow",
  "printTitlesColumn", "copies"
]);
const PAGE_MARGIN_KEYS = new Set(["top", "left", "bottom", "right", "header", "footer"]);
const HEADER_FOOTER_KEYS = new Set([
  "differentFirst", "differentOddEven", "oddHeader", "oddFooter", "evenHeader",
  "evenFooter", "firstHeader", "firstFooter"
]);
const COLUMN_KEYS = new Set(["index", "width", "hidden", "outlineLevel"]);
const ROW_KEYS = new Set(["number", "height", "hidden", "outlineLevel"]);
const LOGO_RANGE_KEYS = new Set(["startColumn", "startRow", "endColumn", "endRow"]);
const CELL_KEYS = new Set([
  "address", "value", "numFmt", "font", "alignment", "border", "fill", "protection"
]);
const FONT_KEYS = new Set([
  "name", "size", "bold", "italic", "underline", "strike", "color", "family",
  "scheme", "charset", "vertAlign", "outline"
]);
const ALIGNMENT_KEYS = new Set([
  "horizontal", "vertical", "wrapText", "shrinkToFit", "indent", "readingOrder", "textRotation"
]);
const BORDER_KEYS = new Set(["top", "left", "bottom", "right", "diagonal"]);
const BORDER_SIDE_KEYS = new Set(["style", "color"]);
const DIAGONAL_BORDER_KEYS = new Set(["style", "color", "up", "down"]);
const PATTERN_FILL_KEYS = new Set(["type", "pattern", "fgColor", "bgColor"]);
const GRADIENT_FILL_KEYS = new Set(["type", "gradient", "degree", "center", "stops"]);
const GRADIENT_CENTER_KEYS = new Set(["left", "top"]);
const GRADIENT_STOP_KEYS = new Set(["position", "color"]);
const PROTECTION_KEYS = new Set(["locked", "hidden"]);
const COLOR_KEYS = new Set(["argb", "theme", "indexed", "tint"]);

const FONT_SCHEMES = new Set(["minor", "major", "none"]);
const FONT_UNDERLINES = new Set(["none", "single", "double", "singleAccounting", "doubleAccounting"]);
const FONT_VERTICAL_ALIGNMENTS = new Set(["superscript", "subscript"]);
const HORIZONTAL_ALIGNMENTS = new Set([
  "left", "center", "right", "fill", "justify", "centerContinuous", "distributed"
]);
const VERTICAL_ALIGNMENTS = new Set(["top", "middle", "bottom", "distributed", "justify"]);
const READING_ORDERS = new Set(["rtl", "ltr"]);
const BORDER_STYLES = new Set([
  "thin", "dotted", "hair", "medium", "double", "thick", "dashed", "dashDot",
  "dashDotDot", "slantDashDot", "mediumDashed", "mediumDashDotDot", "mediumDashDot"
]);
const FILL_PATTERNS = new Set([
  "none", "solid", "darkVertical", "darkHorizontal", "darkGrid", "darkTrellis", "darkDown",
  "darkUp", "lightVertical", "lightHorizontal", "lightGrid", "lightTrellis", "lightDown",
  "lightUp", "darkGray", "mediumGray", "lightGray", "gray125", "gray0625"
]);
const BORDER_SIDES = ["top", "left", "bottom", "right", "diagonal"];
const CELL_ERROR_VALUES = new Set([
  "#N/A", "#REF!", "#NAME?", "#DIV/0!", "#NULL!", "#VALUE!", "#NUM!"
]);
const PAPER_SIZES = new Set([5, 7, 9, 11, 13, 20, 27, 28, 34, 37, 82, 119]);

function throwLayoutError(layoutKey, fieldPath, detail) {
  throw new Error(
    `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 '${fieldPath}'의 형식이 올바르지 않습니다: ${detail}`
  );
}

function validateAllowedKeys(value, allowedKeys, fieldPath, layoutKey) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throwLayoutError(layoutKey, `${fieldPath}.${key}`, "지원하지 않는 속성입니다.");
    }
  }
}

function validateBooleanField(value, key, fieldPath, layoutKey) {
  if (value[key] !== undefined && typeof value[key] !== "boolean") {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "boolean이어야 합니다.");
  }
}

function validateStringField(value, key, fieldPath, layoutKey, options = {}) {
  const fieldValue = value[key];
  if (fieldValue === undefined) return;
  if (typeof fieldValue !== "string" || (options.nonEmpty && !fieldValue.trim())) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "문자열이어야 합니다.");
  }
  if (options.allowed && !options.allowed.has(fieldValue)) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "지원하지 않는 값입니다.");
  }
}

function validateNumberField(value, key, fieldPath, layoutKey, options = {}) {
  const fieldValue = value[key];
  if (fieldValue === undefined) return;
  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "유한한 숫자여야 합니다.");
  }
  if (options.integer && !Number.isInteger(fieldValue)) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "정수여야 합니다.");
  }
  if (options.min !== undefined && fieldValue < options.min) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, `${options.min} 이상이어야 합니다.`);
  }
  if (options.max !== undefined && fieldValue > options.max) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, `${options.max} 이하여야 합니다.`);
  }
}

function validateColorObject(color, fieldPath, layoutKey) {
  if (!isPlainObject(color)) throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  validateAllowedKeys(color, COLOR_KEYS, fieldPath, layoutKey);
  if (color.argb !== undefined &&
      (typeof color.argb !== "string" || !/^[0-9A-Fa-f]{8}$/.test(color.argb))) {
    throwLayoutError(layoutKey, `${fieldPath}.argb`, "8자리 ARGB 16진수 문자열이어야 합니다.");
  }
  validateNumberField(color, "theme", fieldPath, layoutKey, { integer: true, min: 0, max: 11 });
  validateNumberField(color, "indexed", fieldPath, layoutKey, { integer: true, min: 0, max: 64 });
  validateNumberField(color, "tint", fieldPath, layoutKey, { min: -1, max: 1 });
}

function validateFontObject(font, fieldPath, layoutKey) {
  if (!isPlainObject(font)) throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  validateAllowedKeys(font, FONT_KEYS, fieldPath, layoutKey);
  validateStringField(font, "name", fieldPath, layoutKey, { nonEmpty: true });
  validateNumberField(font, "size", fieldPath, layoutKey, { min: 0.01 });
  validateNumberField(font, "family", fieldPath, layoutKey, { integer: true, min: 0 });
  validateNumberField(font, "charset", fieldPath, layoutKey, { integer: true, min: 0 });
  validateStringField(font, "scheme", fieldPath, layoutKey, { allowed: FONT_SCHEMES });
  for (const key of ["bold", "italic", "strike", "outline"]) {
    validateBooleanField(font, key, fieldPath, layoutKey);
  }
  if (font.underline !== undefined && typeof font.underline !== "boolean" &&
      (typeof font.underline !== "string" || !FONT_UNDERLINES.has(font.underline))) {
    throwLayoutError(layoutKey, `${fieldPath}.underline`, "지원하는 underline 값이어야 합니다.");
  }
  validateStringField(font, "vertAlign", fieldPath, layoutKey, { allowed: FONT_VERTICAL_ALIGNMENTS });
  if (font.color !== undefined) validateColorObject(font.color, `${fieldPath}.color`, layoutKey);
}

function validateAlignmentObject(alignment, fieldPath, layoutKey) {
  if (!isPlainObject(alignment)) throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  validateAllowedKeys(alignment, ALIGNMENT_KEYS, fieldPath, layoutKey);
  validateStringField(alignment, "horizontal", fieldPath, layoutKey, { allowed: HORIZONTAL_ALIGNMENTS });
  validateStringField(alignment, "vertical", fieldPath, layoutKey, { allowed: VERTICAL_ALIGNMENTS });
  validateBooleanField(alignment, "wrapText", fieldPath, layoutKey);
  validateBooleanField(alignment, "shrinkToFit", fieldPath, layoutKey);
  validateNumberField(alignment, "indent", fieldPath, layoutKey, { integer: true, min: 0 });
  validateStringField(alignment, "readingOrder", fieldPath, layoutKey, { allowed: READING_ORDERS });
  if (alignment.textRotation !== undefined && alignment.textRotation !== "vertical" &&
      (typeof alignment.textRotation !== "number" || !Number.isInteger(alignment.textRotation) ||
       alignment.textRotation < -90 || alignment.textRotation > 90)) {
    throwLayoutError(layoutKey, `${fieldPath}.textRotation`, "-90~90 정수 또는 'vertical'이어야 합니다.");
  }
}

function validateBorderObject(border, fieldPath, layoutKey) {
  if (!isPlainObject(border)) throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  validateAllowedKeys(border, BORDER_KEYS, fieldPath, layoutKey);
  for (const sideName of BORDER_SIDES) {
    const side = border[sideName];
    if (side === undefined) continue;
    const sidePath = `${fieldPath}.${sideName}`;
    if (!isPlainObject(side)) throwLayoutError(layoutKey, sidePath, "객체여야 합니다.");
    validateAllowedKeys(side, sideName === "diagonal" ? DIAGONAL_BORDER_KEYS : BORDER_SIDE_KEYS, sidePath, layoutKey);
    validateStringField(side, "style", sidePath, layoutKey, { allowed: BORDER_STYLES });
    if (side.color !== undefined) validateColorObject(side.color, `${sidePath}.color`, layoutKey);
    if (sideName === "diagonal") {
      validateBooleanField(side, "up", sidePath, layoutKey);
      validateBooleanField(side, "down", sidePath, layoutKey);
    }
  }
}

function validateFillObject(fill, fieldPath, layoutKey) {
  if (!isPlainObject(fill)) throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  if (fill.type === "pattern") {
    validateAllowedKeys(fill, PATTERN_FILL_KEYS, fieldPath, layoutKey);
    validateStringField(fill, "pattern", fieldPath, layoutKey, { allowed: FILL_PATTERNS });
    if (fill.fgColor !== undefined) validateColorObject(fill.fgColor, `${fieldPath}.fgColor`, layoutKey);
    if (fill.bgColor !== undefined) validateColorObject(fill.bgColor, `${fieldPath}.bgColor`, layoutKey);
    return;
  }
  if (fill.type !== "gradient") {
    throwLayoutError(layoutKey, `${fieldPath}.type`, "'pattern' 또는 'gradient'여야 합니다.");
  }
  validateAllowedKeys(fill, GRADIENT_FILL_KEYS, fieldPath, layoutKey);
  validateStringField(fill, "gradient", fieldPath, layoutKey, { allowed: new Set(["angle", "path"]) });
  if (fill.gradient === undefined) throwLayoutError(layoutKey, `${fieldPath}.gradient`, "gradient 채우기에 필요합니다.");
  if (fill.gradient === "angle") {
    validateNumberField(fill, "degree", fieldPath, layoutKey, { min: 0, max: 359 });
    if (fill.degree === undefined) throwLayoutError(layoutKey, `${fieldPath}.degree`, "angle gradient에 필요합니다.");
    if (fill.center !== undefined) throwLayoutError(layoutKey, `${fieldPath}.center`, "angle gradient에서는 사용할 수 없습니다.");
  } else if (fill.gradient === "path") {
    if (!isPlainObject(fill.center)) throwLayoutError(layoutKey, `${fieldPath}.center`, "path gradient의 중심 객체가 필요합니다.");
    validateAllowedKeys(fill.center, GRADIENT_CENTER_KEYS, `${fieldPath}.center`, layoutKey);
    for (const key of ["left", "top"]) {
      validateNumberField(fill.center, key, `${fieldPath}.center`, layoutKey, { min: 0, max: 1 });
      if (fill.center[key] === undefined) throwLayoutError(layoutKey, `${fieldPath}.center.${key}`, "path gradient에 필요합니다.");
    }
    if (fill.degree !== undefined) throwLayoutError(layoutKey, `${fieldPath}.degree`, "path gradient에서는 사용할 수 없습니다.");
  }
  if (!Array.isArray(fill.stops) || fill.stops.length === 0) {
    throwLayoutError(layoutKey, `${fieldPath}.stops`, "하나 이상의 gradient stop 배열이어야 합니다.");
  }
  fill.stops.forEach((stop, index) => {
    const stopPath = `${fieldPath}.stops[${index}]`;
    if (!isPlainObject(stop)) throwLayoutError(layoutKey, stopPath, "객체여야 합니다.");
    validateAllowedKeys(stop, GRADIENT_STOP_KEYS, stopPath, layoutKey);
    validateNumberField(stop, "position", stopPath, layoutKey, { min: 0, max: 1 });
    if (stop.position === undefined) throwLayoutError(layoutKey, `${stopPath}.position`, "gradient stop에 필요합니다.");
    if (stop.color === undefined) throwLayoutError(layoutKey, `${stopPath}.color`, "gradient stop에 필요합니다.");
    validateColorObject(stop.color, `${stopPath}.color`, layoutKey);
  });
}

function validateProtectionObject(protection, fieldPath, layoutKey) {
  if (!isPlainObject(protection)) throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  validateAllowedKeys(protection, PROTECTION_KEYS, fieldPath, layoutKey);
  validateBooleanField(protection, "locked", fieldPath, layoutKey);
  validateBooleanField(protection, "hidden", fieldPath, layoutKey);
}

function validateErrorValue(value, fieldPath, layoutKey) {
  if (typeof value !== "string" || !CELL_ERROR_VALUES.has(value)) {
    throwLayoutError(layoutKey, fieldPath, "지원하는 Excel 오류 값이어야 합니다.");
  }
}

function validateFormulaResult(result, fieldPath, layoutKey) {
  if (typeof result === "string" || typeof result === "boolean") return;
  if (typeof result === "number" && Number.isFinite(result)) return;
  if (isPlainObject(result)) {
    validateAllowedKeys(result, new Set(["error"]), fieldPath, layoutKey);
    if (result.error !== undefined) {
      validateErrorValue(result.error, `${fieldPath}.error`, layoutKey);
      return;
    }
  }
  throwLayoutError(layoutKey, fieldPath, "문자열, 유한한 숫자, boolean 또는 Excel 오류여야 합니다.");
}

function validateCellValue(value, fieldPath, layoutKey) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throwLayoutError(layoutKey, fieldPath, "유한한 숫자여야 합니다.");
    return;
  }
  if (!isPlainObject(value)) throwLayoutError(layoutKey, fieldPath, "지원하는 primitive 또는 tagged value여야 합니다.");
  if (Object.hasOwn(value, "date")) {
    validateAllowedKeys(value, new Set(["date"]), fieldPath, layoutKey);
    if (typeof value.date !== "string" || Number.isNaN(Date.parse(value.date)) ||
        new Date(value.date).toISOString() !== value.date) {
      throwLayoutError(layoutKey, `${fieldPath}.date`, "ISO 날짜 문자열이어야 합니다.");
    }
    return;
  }
  for (const formulaKey of ["formula", "sharedFormula"]) {
    if (!Object.hasOwn(value, formulaKey)) continue;
    validateAllowedKeys(value, new Set([formulaKey, "result", "date1904"]), fieldPath, layoutKey);
    validateStringField(value, formulaKey, fieldPath, layoutKey, { nonEmpty: true });
    if (value.result !== undefined) validateFormulaResult(value.result, `${fieldPath}.result`, layoutKey);
    validateBooleanField(value, "date1904", fieldPath, layoutKey);
    return;
  }
  if (Object.hasOwn(value, "richText")) {
    validateAllowedKeys(value, new Set(["richText"]), fieldPath, layoutKey);
    if (!Array.isArray(value.richText)) throwLayoutError(layoutKey, `${fieldPath}.richText`, "배열이어야 합니다.");
    value.richText.forEach((part, index) => {
      const partPath = `${fieldPath}.richText[${index}]`;
      if (!isPlainObject(part)) throwLayoutError(layoutKey, partPath, "객체여야 합니다.");
      validateAllowedKeys(part, new Set(["text", "font"]), partPath, layoutKey);
      if (typeof part.text !== "string") throwLayoutError(layoutKey, `${partPath}.text`, "문자열이어야 합니다.");
      if (part.font !== undefined) validateFontObject(part.font, `${partPath}.font`, layoutKey);
    });
    return;
  }
  if (Object.hasOwn(value, "text") || Object.hasOwn(value, "hyperlink")) {
    validateAllowedKeys(value, new Set(["text", "hyperlink", "tooltip"]), fieldPath, layoutKey);
    for (const key of ["text", "hyperlink"]) {
      validateStringField(value, key, fieldPath, layoutKey, { nonEmpty: true });
      if (value[key] === undefined) throwLayoutError(layoutKey, `${fieldPath}.${key}`, "hyperlink 값에 필요합니다.");
    }
    validateStringField(value, "tooltip", fieldPath, layoutKey);
    return;
  }
  if (Object.hasOwn(value, "error")) {
    validateAllowedKeys(value, new Set(["error"]), fieldPath, layoutKey);
    validateErrorValue(value.error, `${fieldPath}.error`, layoutKey);
    return;
  }
  throwLayoutError(layoutKey, fieldPath, "지원하지 않는 tagged value입니다.");
}

export function validateLayoutSchema(layoutDef) {
  const layoutKey = layoutDef?.layoutKey ?? "unknown";
  if (!isPlainObject(layoutDef)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'root'의 형식이 올바르지 않습니다: 정의가 객체가 아닙니다.`
    );
  }

  const def = layoutDef;
  validateAllowedKeys(def, ROOT_KEYS, "root", layoutKey);

  if (def.schemaVersion !== 1) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'schemaVersion'의 형식이 올바르지 않습니다: schemaVersion은 1이어야 합니다.`
    );
  }

  if (!def.layoutKey || typeof def.layoutKey !== "string") {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'layoutKey'의 형식이 올바르지 않습니다: layoutKey는 비어있지 않은 문자열이어야 합니다.`
    );
  }

  if (typeof def.canvasRange !== "string") {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'canvasRange'의 형식이 올바르지 않습니다: 문자열이어야 합니다.`
    );
  }

  const canvas = parseRangeCoordinate(def.canvasRange);
  if (!canvas) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'canvasRange'의 형식이 올바르지 않습니다: 'A1:BS80' 형식의 유효한 좌표 범위여야 합니다.`
    );
  }

  if (!isPlainObject(def.worksheet)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet'의 형식이 올바르지 않습니다: 객체여야 합니다.`
    );
  }

  const ws = def.worksheet;
  validateAllowedKeys(ws, WORKSHEET_KEYS, "worksheet", layoutKey);
  if (typeof ws.name !== "string" || !ws.name.trim()) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.name'의 형식이 올바르지 않습니다: 시트 이름이 필요합니다.`
    );
  }

  if (ws.properties !== undefined) {
    if (!isPlainObject(ws.properties)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.properties'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const properties = ws.properties;
    validateAllowedKeys(properties, WORKSHEET_PROPERTY_KEYS, "worksheet.properties", layoutKey);
    if (properties.tabColor !== undefined) {
      validateColorObject(properties.tabColor, "worksheet.properties.tabColor", layoutKey);
    }
    for (const key of ["outlineLevelCol", "outlineLevelRow"]) {
      validateNumberField(properties, key, "worksheet.properties", layoutKey, {
        integer: true, min: 0, max: 7
      });
    }
    for (const key of ["defaultRowHeight", "defaultColWidth", "dyDescent"]) {
      validateNumberField(properties, key, "worksheet.properties", layoutKey, { min: 0 });
    }
    validateBooleanField(properties, "showGridLines", "worksheet.properties", layoutKey);
    if (properties.outlineProperties !== undefined) {
      if (!isPlainObject(properties.outlineProperties)) {
        throwLayoutError(layoutKey, "worksheet.properties.outlineProperties", "객체여야 합니다.");
      }
      validateAllowedKeys(
        properties.outlineProperties,
        OUTLINE_PROPERTY_KEYS,
        "worksheet.properties.outlineProperties",
        layoutKey
      );
      validateBooleanField(
        properties.outlineProperties, "summaryBelow",
        "worksheet.properties.outlineProperties", layoutKey
      );
      validateBooleanField(
        properties.outlineProperties, "summaryRight",
        "worksheet.properties.outlineProperties", layoutKey
      );
    }
  }

  if (ws.views !== undefined) {
    if (!Array.isArray(ws.views)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.views'의 형식이 올바르지 않습니다: 배열이어야 합니다.`
      );
    }
    ws.views.forEach((v, idx) => {
      if (!isPlainObject(v)) {
        throw new Error(
          `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.views[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
        );
      }
      const viewPath = `worksheet.views[${idx}]`;
      validateAllowedKeys(v, WORKSHEET_VIEW_KEYS, viewPath, layoutKey);
      validateNumberField(v, "workbookViewId", viewPath, layoutKey, { integer: true, min: 0 });
      validateStringField(v, "state", viewPath, layoutKey, {
        allowed: new Set(["normal", "frozen", "split"])
      });
      validateStringField(v, "style", viewPath, layoutKey, {
        allowed: new Set(["pageBreakPreview", "pageLayout"])
      });
      for (const key of ["rightToLeft", "showRuler", "showRowColHeaders", "showGridLines"]) {
        validateBooleanField(v, key, viewPath, layoutKey);
      }
      for (const key of ["zoomScale", "zoomScaleNormal"]) {
        validateNumberField(v, key, viewPath, layoutKey, { min: 10, max: 400 });
      }
      for (const key of ["xSplit", "ySplit"]) {
        validateNumberField(v, key, viewPath, layoutKey, { min: 0 });
      }
      for (const key of ["activeCell", "topLeftCell"]) {
        if (v[key] !== undefined && (typeof v[key] !== "string" || !parseCellCoordinate(v[key]))) {
          throwLayoutError(layoutKey, `${viewPath}.${key}`, "유효한 셀 주소여야 합니다.");
        }
      }
      validateStringField(v, "activePane", viewPath, layoutKey, {
        allowed: new Set(["topLeft", "topRight", "bottomLeft", "bottomRight"])
      });
    });
  }

  if (ws.pageSetup !== undefined) {
    if (!isPlainObject(ws.pageSetup)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.pageSetup'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const pageSetup = ws.pageSetup;
    validateAllowedKeys(pageSetup, PAGE_SETUP_KEYS, "worksheet.pageSetup", layoutKey);
    if (pageSetup.margins !== undefined) {
      if (!isPlainObject(pageSetup.margins)) {
        throw new Error(
          `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.pageSetup.margins'의 형식이 올바르지 않습니다: 객체여야 합니다.`
        );
      }
      validateAllowedKeys(pageSetup.margins, PAGE_MARGIN_KEYS, "worksheet.pageSetup.margins", layoutKey);
      for (const key of PAGE_MARGIN_KEYS) {
        validateNumberField(pageSetup.margins, key, "worksheet.pageSetup.margins", layoutKey, { min: 0 });
      }
    }
    validateStringField(pageSetup, "orientation", "worksheet.pageSetup", layoutKey, {
      allowed: new Set(["portrait", "landscape"])
    });
    validateStringField(pageSetup, "pageOrder", "worksheet.pageSetup", layoutKey, {
      allowed: new Set(["downThenOver", "overThenDown"])
    });
    validateStringField(pageSetup, "cellComments", "worksheet.pageSetup", layoutKey, {
      allowed: new Set(["atEnd", "asDisplayed", "None"])
    });
    validateStringField(pageSetup, "errors", "worksheet.pageSetup", layoutKey, {
      allowed: new Set(["dash", "blank", "NA", "displayed"])
    });
    for (const key of [
      "fitToPage", "blackAndWhite", "draft", "showRowColHeaders", "showGridLines",
      "useFirstPageNumber", "usePrinterDefaults", "horizontalCentered", "verticalCentered"
    ]) {
      validateBooleanField(pageSetup, key, "worksheet.pageSetup", layoutKey);
    }
    for (const key of ["horizontalDpi", "verticalDpi", "fitToWidth", "fitToHeight"]) {
      validateNumberField(pageSetup, key, "worksheet.pageSetup", layoutKey, { integer: true, min: 0 });
    }
    for (const key of ["firstPageNumber", "copies"]) {
      validateNumberField(pageSetup, key, "worksheet.pageSetup", layoutKey, { integer: true, min: 1 });
    }
    validateNumberField(pageSetup, "scale", "worksheet.pageSetup", layoutKey, {
      integer: true, min: 10, max: 400
    });
    if (pageSetup.paperSize !== undefined &&
        (typeof pageSetup.paperSize !== "number" || !Number.isInteger(pageSetup.paperSize) ||
         !PAPER_SIZES.has(pageSetup.paperSize))) {
      throwLayoutError(
        layoutKey, "worksheet.pageSetup.paperSize", "지원하는 Excel 용지 크기 번호여야 합니다."
      );
    }
    for (const key of ["printArea", "printTitlesRow", "printTitlesColumn"]) {
      validateStringField(pageSetup, key, "worksheet.pageSetup", layoutKey, { nonEmpty: true });
    }
  }

  if (ws.headerFooter !== undefined) {
    if (!isPlainObject(ws.headerFooter)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'worksheet.headerFooter'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    validateAllowedKeys(ws.headerFooter, HEADER_FOOTER_KEYS, "worksheet.headerFooter", layoutKey);
    validateBooleanField(ws.headerFooter, "differentFirst", "worksheet.headerFooter", layoutKey);
    validateBooleanField(ws.headerFooter, "differentOddEven", "worksheet.headerFooter", layoutKey);
    for (const key of [
      "oddHeader", "oddFooter", "evenHeader", "evenFooter", "firstHeader", "firstFooter"
    ]) {
      validateStringField(ws.headerFooter, key, "worksheet.headerFooter", layoutKey);
    }
  }

  if (def.logoRange !== undefined) {
    if (!isPlainObject(def.logoRange)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'logoRange'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const lr = def.logoRange;
    validateAllowedKeys(lr, LOGO_RANGE_KEYS, "logoRange", layoutKey);
    if (
      !Number.isInteger(lr.startColumn) ||
      !Number.isInteger(lr.startRow) ||
      !Number.isInteger(lr.endColumn) ||
      !Number.isInteger(lr.endRow) ||
      lr.startColumn < 1 ||
      lr.startRow < 1 ||
      lr.endColumn < lr.startColumn ||
      lr.endRow < lr.startRow ||
      lr.startColumn < canvas.startColumn ||
      lr.endColumn > canvas.endColumn ||
      lr.startRow < canvas.startRow ||
      lr.endRow > canvas.endRow
    ) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'logoRange'의 형식이 올바르지 않습니다: 유효한 양수 범위여야 하며 canvasRange 안이어야 합니다.`
      );
    }
  }

  if (!Array.isArray(def.columns)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns'의 형식이 올바르지 않습니다: columns는 배열이어야 합니다.`
    );
  }
  const colIndices = new Set();
  def.columns.forEach((colItem, idx) => {
    if (!isPlainObject(colItem)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const col = colItem;
    validateAllowedKeys(col, COLUMN_KEYS, `columns[${idx}]`, layoutKey);
    if (!Number.isInteger(col.index) || col.index < 1) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].index'의 형식이 올바르지 않습니다: 1 이상의 열 번호여야 합니다.`
      );
    }
    if (col.index < canvas.startColumn || col.index > canvas.endColumn) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].index'의 형식이 올바르지 않습니다: canvasRange 범위를 벗어났습니다.`
      );
    }
    if (colIndices.has(col.index)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].index'의 형식이 올바르지 않습니다: 중복된 열 번호(${col.index})입니다.`
      );
    }
    colIndices.add(col.index);

    if (col.width !== undefined && (!Number.isFinite(col.width) || col.width < 0)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].width'의 형식이 올바르지 않습니다: 0 이상의 유한한 숫자여야 합니다.`
      );
    }
    if (col.hidden !== undefined && typeof col.hidden !== "boolean") {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].hidden'의 형식이 올바르지 않습니다: boolean이어야 합니다.`
      );
    }
    if (
      col.outlineLevel !== undefined &&
      (!Number.isInteger(col.outlineLevel) || col.outlineLevel < 0)
    ) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].outlineLevel'의 형식이 올바르지 않습니다: 0 이상의 정수여야 합니다.`
      );
    }
  });

  if (!Array.isArray(def.rows)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows'의 형식이 올바르지 않습니다: rows는 배열이어야 합니다.`
    );
  }
  const rowNumbers = new Set();
  def.rows.forEach((rowItem, idx) => {
    if (!isPlainObject(rowItem)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const row = rowItem;
    validateAllowedKeys(row, ROW_KEYS, `rows[${idx}]`, layoutKey);
    if (!Number.isInteger(row.number) || row.number < 1) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].number'의 형식이 올바르지 않습니다: 1 이상의 행 번호여야 합니다.`
      );
    }
    if (row.number < canvas.startRow || row.number > canvas.endRow) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].number'의 형식이 올바르지 않습니다: canvasRange 범위를 벗어났습니다.`
      );
    }
    if (rowNumbers.has(row.number)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].number'의 형식이 올바르지 않습니다: 중복된 행 번호(${row.number})입니다.`
      );
    }
    rowNumbers.add(row.number);

    if (row.height !== undefined && (!Number.isFinite(row.height) || row.height < 0)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].height'의 형식이 올바르지 않습니다: 0 이상의 유한한 숫자여야 합니다.`
      );
    }
    if (row.hidden !== undefined && typeof row.hidden !== "boolean") {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].hidden'의 형식이 올바르지 않습니다: boolean이어야 합니다.`
      );
    }
    if (
      row.outlineLevel !== undefined &&
      (!Number.isInteger(row.outlineLevel) || row.outlineLevel < 0)
    ) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].outlineLevel'의 형식이 올바르지 않습니다: 0 이상의 정수여야 합니다.`
      );
    }
  });

  if (!Array.isArray(def.merges)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'merges'의 형식이 올바르지 않습니다: merges는 배열이어야 합니다.`
    );
  }
  const parsedMerges = [];
  def.merges.forEach((m, idx) => {
    if (typeof m !== "string") {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'merges[${idx}]'의 형식이 올바르지 않습니다: 유효한 병합 범위 문자열이어야 합니다.`
      );
    }
    const mr = parseRangeCoordinate(m);
    if (!mr) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'merges[${idx}]'의 형식이 올바르지 않습니다: 유효한 병합 범위 문자열이어야 하며 시작 좌표가 끝 좌표보다 작거나 같아야 합니다.`
      );
    }
    if (
      mr.startColumn < canvas.startColumn ||
      mr.endColumn > canvas.endColumn ||
      mr.startRow < canvas.startRow ||
      mr.endRow > canvas.endRow
    ) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'merges[${idx}]'의 형식이 올바르지 않습니다: canvasRange 범위를 벗어났습니다.`
      );
    }
    for (const existing of parsedMerges) {
      if (rangesOverlap(existing, mr)) {
        throw new Error(
          `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'merges[${idx}]'의 형식이 올바르지 않습니다: 중복되거나 다른 병합 범위와 겹칩니다.`
        );
      }
    }
    parsedMerges.push(mr);
  });

  if (!Array.isArray(def.cells)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells'의 형식이 올바르지 않습니다: cells는 배열이어야 합니다.`
    );
  }
  const cellAddresses = new Set();
  def.cells.forEach((cellItem, idx) => {
    if (!isPlainObject(cellItem)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const cell = cellItem;
    validateAllowedKeys(cell, CELL_KEYS, `cells[${idx}]`, layoutKey);
    const address = cell.address;
    if (typeof address !== "string") {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}].address'의 형식이 올바르지 않습니다: 유효한 셀 주소여야 합니다.`
      );
    }
    const coord = parseCellCoordinate(address);
    if (!coord) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}].address'의 형식이 올바르지 않습니다: 유효한 셀 주소여야 합니다.`
      );
    }
    if (
      coord.column < canvas.startColumn ||
      coord.column > canvas.endColumn ||
      coord.row < canvas.startRow ||
      coord.row > canvas.endRow
    ) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}].address'의 형식이 올바르지 않습니다: canvasRange 범위를 벗어났습니다.`
      );
    }
    if (cellAddresses.has(address)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}].address'의 형식이 올바르지 않습니다: 중복된 셀 주소(${address})입니다.`
      );
    }
    cellAddresses.add(address);

    if (cell.value !== undefined) {
      if (isPlainObject(cell.value) && Object.hasOwn(cell.value, "formula") &&
          typeof cell.value.formula !== "string") {
        throw new Error(
          `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}].value.formula'의 형식이 올바르지 않습니다: formula는 문자열이어야 합니다.`
        );
      }
      validateCellValue(cell.value, `cells[${idx}].value`, layoutKey);
    }

    if (cell.numFmt !== undefined && typeof cell.numFmt !== "string") {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}].numFmt'의 형식이 올바르지 않습니다: 문자열이어야 합니다.`
      );
    }

    if (cell.font !== undefined) {
      validateFontObject(cell.font, `cells[${idx}].font`, layoutKey);
    }

    if (cell.alignment !== undefined) {
      validateAlignmentObject(cell.alignment, `cells[${idx}].alignment`, layoutKey);
    }

    if (cell.border !== undefined) {
      validateBorderObject(cell.border, `cells[${idx}].border`, layoutKey);
    }

    if (cell.fill !== undefined) {
      validateFillObject(cell.fill, `cells[${idx}].fill`, layoutKey);
    }

    if (cell.protection !== undefined) {
      validateProtectionObject(cell.protection, `cells[${idx}].protection`, layoutKey);
    }
  });
}

export async function processWorkbookTarget(target) {
  const filePath = path.resolve(projectRoot, "양식샘플", target.fileName);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(target.sheetName);
  if (!worksheet) {
    throw new Error(`시트를 찾을 수 없습니다: ${target.sheetName} in ${target.fileName}`);
  }

  applyManifestScrub(worksheet, target.manifest);
  assertManifestScrubbed(worksheet, target);

  const { maxCol, maxRow } = parseCanvasDimensions(target.canvasRange);

  const columns = [];
  for (let c = 1; c <= maxCol; c++) {
    const col = worksheet.getColumn(c);
    const colData = { index: c };
    if (typeof col.width === "number") colData.width = col.width;
    if (col.hidden !== undefined) colData.hidden = col.hidden;
    if (col.outlineLevel !== undefined) colData.outlineLevel = col.outlineLevel;
    if (Object.keys(colData).length > 1) {
      columns.push(colData);
    }
  }
  columns.sort((a, b) => a.index - b.index);

  const rows = [];
  for (let r = 1; r <= maxRow; r++) {
    const row = worksheet.getRow(r);
    const rowData = { number: r };
    if (typeof row.height === "number") rowData.height = row.height;
    if (row.hidden !== undefined) rowData.hidden = row.hidden;
    if (row.outlineLevel !== undefined) rowData.outlineLevel = row.outlineLevel;
    if (Object.keys(rowData).length > 1) {
      rows.push(rowData);
    }
  }
  rows.sort((a, b) => a.number - b.number);

  const merges = [...(worksheet.model.merges ?? [])].sort();

  const cells = [];
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const cell = worksheet.getCell(r, c);
      const isSlave = cell.isMerged && cell.master.address !== cell.address;
      const val = isSlave ? undefined : serializeCellValue(cell);

      const font = clean(cell.font);
      const alignment = clean(cell.alignment);
      const border = clean(cell.border);
      const fill = clean(cell.fill);
      const numFmt = cell.numFmt && cell.numFmt !== "General" ? cell.numFmt : undefined;
      const protection = clean(cell.protection);

      if (val === undefined && !font && !alignment && !border && !fill && !numFmt && !protection) {
        continue;
      }

      const cellDef = { address: cell.address };
      if (val !== undefined) cellDef.value = val;
      if (numFmt) cellDef.numFmt = numFmt;
      if (font) cellDef.font = font;
      if (alignment) cellDef.alignment = alignment;
      if (border) cellDef.border = border;
      if (fill) cellDef.fill = fill;
      if (protection) cellDef.protection = protection;

      cells.push(cellDef);
    }
  }

  const wsDef = { name: target.sheetName };
  const props = clean(worksheet.properties);
  if (props) wsDef.properties = props;
  const views = clean(worksheet.views);
  if (views) wsDef.views = views;
  const pageSetup = clean(worksheet.pageSetup);
  if (pageSetup) wsDef.pageSetup = pageSetup;
  const headerFooter = clean(worksheet.headerFooter);
  if (headerFooter) wsDef.headerFooter = headerFooter;

  const layoutDef = {
    schemaVersion: 1,
    layoutKey: target.layoutKey,
    worksheet: wsDef,
    canvasRange: target.canvasRange
  };

  if (target.logoRange) {
    layoutDef.logoRange = target.logoRange;
  }

  layoutDef.columns = columns;
  layoutDef.rows = rows;
  layoutDef.merges = merges;
  layoutDef.cells = cells;

  validateLayoutSchema(layoutDef);
  return layoutDef;
}

export async function generateAllLayoutsInMemory() {
  verifySampleHashes();
  const results = [];
  for (const target of LAYOUT_TARGETS) {
    const layout = await processWorkbookTarget(target);
    const jsonContent = JSON.stringify(layout, null, 2) + "\n";
    results.push({ target, layout, jsonContent });
  }
  return results;
}

export async function runCheckMode(outDir) {
  if (!fs.existsSync(outDir)) {
    throw new Error(`출력 디렉터리가 존재하지 않습니다: ${outDir}`);
  }
  const generated = await generateAllLayoutsInMemory();
  for (const { target, jsonContent } of generated) {
    const outPath = path.resolve(outDir, target.outputJson);
    if (!fs.existsSync(outPath)) {
      throw new Error(`JSON 파일이 존재하지 않습니다: ${outPath}`);
    }
    const existing = fs.readFileSync(outPath, "utf8");
    if (existing !== jsonContent) {
      throw new Error(`JSON 내용 불일치 (${target.outputJson}): committed 내용과 생성 결과가 다릅니다.`);
    }
    console.log(`[CHECK OK] ${target.layoutKey} -> ${target.outputJson}`);
  }
  console.log("5개 레이아웃 JSON 검증 통과 (동적 값 0건, byte-identical).");
}

export async function runWriteMode(outDir) {
  const generated = await generateAllLayoutsInMemory();

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 기존 파일 백업
  const backups = new Map();
  for (const { target } of generated) {
    const outPath = path.resolve(outDir, target.outputJson);
    if (fs.existsSync(outPath)) {
      backups.set(outPath, fs.readFileSync(outPath));
    } else {
      backups.set(outPath, null);
    }
  }

  const stagedPaths = [];
  try {
    // 1. 임시 파일에 쓰기
    for (const { target, jsonContent } of generated) {
      const outPath = path.resolve(outDir, target.outputJson);
      const stagePath = `${outPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(stagePath, jsonContent, "utf8");
      stagedPaths.push({ stagePath, outPath, target, byteLength: Buffer.byteLength(jsonContent) });
    }

    // 2. 원자적 교체
    for (const { stagePath, outPath, target, byteLength } of stagedPaths) {
      fs.renameSync(stagePath, outPath);
      console.log(`[WRITE] ${target.layoutKey} -> ${outPath} (${byteLength} bytes)`);
    }
    console.log("5개 레이아웃 JSON 원자적 직렬화 완료.");
  } catch (err) {
    // 롤백 복구 및 임시 파일 정리
    console.error("쓰기 실패, 롤백을 수행합니다:", err);
    for (const { stagePath } of stagedPaths) {
      if (fs.existsSync(stagePath)) {
        try { fs.unlinkSync(stagePath); } catch {}
      }
    }
    for (const [outPath, prevBuf] of backups.entries()) {
      if (prevBuf !== null) {
        fs.writeFileSync(outPath, prevBuf);
      } else if (fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath); } catch {}
      }
    }
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isWrite = args.includes("--write");
  const isCheck = args.includes("--check");

  if (!isWrite && !isCheck) {
    console.error("사용법: node scripts/generate-built-in-excel-layouts.mjs [--write | --check]");
    process.exit(1);
  }

  const outDir = path.resolve(projectRoot, "src/main/services/document-layouts");

  if (isWrite) {
    await runWriteMode(outDir);
  } else if (isCheck) {
    await runCheckMode(outDir);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("오류:", err);
    process.exit(1);
  });
}
