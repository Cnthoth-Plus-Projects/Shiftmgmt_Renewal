import ExcelJS from "exceljs";

import scheduleTemplate1Json from "./document-layouts/schedule-template1.json";
import scheduleTemplate2Json from "./document-layouts/schedule-template2.json";
import proposalJson from "./document-layouts/proposal.json";
import attachment1Json from "./document-layouts/attachment1.json";
import attachment2Json from "./document-layouts/attachment2.json";
import { addBrandLogoToWorksheetRange } from "./document-brand-logo-service";

export type BuiltInExcelLayoutKey =
  | "schedule-xlsx/template1"
  | "schedule-xlsx/template2"
  | "proposal-xlsx"
  | "attachment1-xlsx"
  | "attachment2-xlsx";

export interface BuiltInExcelColumnDefinition {
  index: number;
  width?: number;
  hidden?: boolean;
  outlineLevel?: number;
}

export interface BuiltInExcelRowDefinition {
  number: number;
  height?: number;
  hidden?: boolean;
  outlineLevel?: number;
}

export interface BuiltInExcelCellDefinition {
  address: string;
  value?: unknown;
  numFmt?: string;
  font?: Partial<ExcelJS.Font>;
  alignment?: Partial<ExcelJS.Alignment>;
  border?: Partial<ExcelJS.Borders>;
  fill?: ExcelJS.Fill;
  protection?: Partial<ExcelJS.Protection>;
}

export interface BuiltInExcelLayoutDefinition {
  schemaVersion: 1;
  layoutKey: BuiltInExcelLayoutKey;
  worksheet: {
    name: string;
    properties?: Record<string, unknown>;
    views?: Array<Record<string, unknown>>;
    pageSetup?: Record<string, unknown>;
    headerFooter?: Record<string, unknown>;
  };
  canvasRange: string;
  logoRange?: {
    startColumn: number;
    startRow: number;
    endColumn: number;
    endRow: number;
  };
  columns: BuiltInExcelColumnDefinition[];
  rows: BuiltInExcelRowDefinition[];
  merges: string[];
  cells: BuiltInExcelCellDefinition[];
}

const BUILT_IN_LAYOUTS: Record<BuiltInExcelLayoutKey, BuiltInExcelLayoutDefinition> = {
  "schedule-xlsx/template1": scheduleTemplate1Json as unknown as BuiltInExcelLayoutDefinition,
  "schedule-xlsx/template2": scheduleTemplate2Json as unknown as BuiltInExcelLayoutDefinition,
  "proposal-xlsx": proposalJson as unknown as BuiltInExcelLayoutDefinition,
  "attachment1-xlsx": attachment1Json as unknown as BuiltInExcelLayoutDefinition,
  "attachment2-xlsx": attachment2Json as unknown as BuiltInExcelLayoutDefinition
};

const getDocumentLabel = (key: BuiltInExcelLayoutKey): string => {
  switch (key) {
    case "schedule-xlsx/template1":
    case "schedule-xlsx/template2":
      return "근무표 Excel";
    case "proposal-xlsx":
      return "품의서 Excel";
    case "attachment1-xlsx":
      return "별첨1 Excel";
    case "attachment2-xlsx":
      return "별첨2 Excel";
    default:
      return "문서 Excel";
  }
};

export const BUILT_IN_LAYOUT_KEYS: BuiltInExcelLayoutKey[] = [
  "schedule-xlsx/template1",
  "schedule-xlsx/template2",
  "proposal-xlsx",
  "attachment1-xlsx",
  "attachment2-xlsx"
];

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const parseColumnLabelToNumber = (label: string): number | null => {
  let result = 0;
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    if (code < 65 || code > 90) return null;
    result = result * 26 + (code - 64);
  }
  return result >= 1 && result <= 16384 ? result : null;
};

const parseCellCoordinate = (
  address: string
): { column: number; row: number } | null => {
  if (typeof address !== "string") return null;
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const column = parseColumnLabelToNumber(match[1]);
  const row = Number(match[2]);
  if (!column || !Number.isInteger(row) || row < 1 || row > 1048576) {
    return null;
  }
  return { column, row };
};

const parseRangeCoordinate = (
  rangeStr: string
): {
  startColumn: number;
  startRow: number;
  endColumn: number;
  endRow: number;
} | null => {
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
};

const rangesOverlap = (
  r1: { startColumn: number; startRow: number; endColumn: number; endRow: number },
  r2: { startColumn: number; startRow: number; endColumn: number; endRow: number }
): boolean =>
  r1.startColumn <= r2.endColumn &&
  r1.endColumn >= r2.startColumn &&
  r1.startRow <= r2.endRow &&
  r1.endRow >= r2.startRow;

const ROOT_KEYS = new Set([
  "schemaVersion",
  "layoutKey",
  "worksheet",
  "canvasRange",
  "logoRange",
  "columns",
  "rows",
  "merges",
  "cells"
]);

const WORKSHEET_KEYS = new Set([
  "name",
  "properties",
  "views",
  "pageSetup",
  "headerFooter"
]);

const WORKSHEET_PROPERTY_KEYS = new Set([
  "tabColor",
  "outlineLevelCol",
  "outlineLevelRow",
  "outlineProperties",
  "defaultRowHeight",
  "defaultColWidth",
  "dyDescent",
  "showGridLines"
]);

const OUTLINE_PROPERTY_KEYS = new Set(["summaryBelow", "summaryRight"]);

const WORKSHEET_VIEW_KEYS = new Set([
  "workbookViewId",
  "state",
  "style",
  "rightToLeft",
  "activeCell",
  "showRuler",
  "showRowColHeaders",
  "showGridLines",
  "zoomScale",
  "zoomScaleNormal",
  "xSplit",
  "ySplit",
  "topLeftCell",
  "activePane"
]);

const PAGE_SETUP_KEYS = new Set([
  "margins",
  "orientation",
  "horizontalDpi",
  "verticalDpi",
  "fitToPage",
  "fitToWidth",
  "fitToHeight",
  "scale",
  "pageOrder",
  "blackAndWhite",
  "draft",
  "cellComments",
  "errors",
  "paperSize",
  "showRowColHeaders",
  "showGridLines",
  "firstPageNumber",
  "useFirstPageNumber",
  "usePrinterDefaults",
  "horizontalCentered",
  "verticalCentered",
  "printArea",
  "printTitlesRow",
  "printTitlesColumn",
  "copies"
]);

const PAGE_MARGIN_KEYS = new Set(["top", "left", "bottom", "right", "header", "footer"]);
const HEADER_FOOTER_KEYS = new Set([
  "differentFirst",
  "differentOddEven",
  "oddHeader",
  "oddFooter",
  "evenHeader",
  "evenFooter",
  "firstHeader",
  "firstFooter"
]);
const COLUMN_KEYS = new Set(["index", "width", "hidden", "outlineLevel"]);
const ROW_KEYS = new Set(["number", "height", "hidden", "outlineLevel"]);
const LOGO_RANGE_KEYS = new Set(["startColumn", "startRow", "endColumn", "endRow"]);
const CELL_KEYS = new Set([
  "address",
  "value",
  "numFmt",
  "font",
  "alignment",
  "border",
  "fill",
  "protection"
]);

const FONT_KEYS = new Set([
  "name",
  "size",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "family",
  "scheme",
  "charset",
  "vertAlign",
  "outline"
]);

const ALIGNMENT_KEYS = new Set([
  "horizontal",
  "vertical",
  "wrapText",
  "shrinkToFit",
  "indent",
  "readingOrder",
  "textRotation"
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
const FONT_UNDERLINES = new Set([
  "none",
  "single",
  "double",
  "singleAccounting",
  "doubleAccounting"
]);
const FONT_VERTICAL_ALIGNMENTS = new Set(["superscript", "subscript"]);
const HORIZONTAL_ALIGNMENTS = new Set([
  "left",
  "center",
  "right",
  "fill",
  "justify",
  "centerContinuous",
  "distributed"
]);
const VERTICAL_ALIGNMENTS = new Set(["top", "middle", "bottom", "distributed", "justify"]);
const READING_ORDERS = new Set(["rtl", "ltr"]);
const BORDER_STYLES = new Set([
  "thin",
  "dotted",
  "hair",
  "medium",
  "double",
  "thick",
  "dashed",
  "dashDot",
  "dashDotDot",
  "slantDashDot",
  "mediumDashed",
  "mediumDashDotDot",
  "mediumDashDot"
]);
const FILL_PATTERNS = new Set([
  "none",
  "solid",
  "darkVertical",
  "darkHorizontal",
  "darkGrid",
  "darkTrellis",
  "darkDown",
  "darkUp",
  "lightVertical",
  "lightHorizontal",
  "lightGrid",
  "lightTrellis",
  "lightDown",
  "lightUp",
  "darkGray",
  "mediumGray",
  "lightGray",
  "gray125",
  "gray0625"
]);
const BORDER_SIDES = ["top", "left", "bottom", "right", "diagonal"] as const;
const CELL_ERROR_VALUES = new Set([
  "#N/A",
  "#REF!",
  "#NAME?",
  "#DIV/0!",
  "#NULL!",
  "#VALUE!",
  "#NUM!"
]);
const PAPER_SIZES = new Set([5, 7, 9, 11, 13, 20, 27, 28, 34, 37, 82, 119]);

function throwLayoutError(layoutKey: string, fieldPath: string, detail: string): never {
  throw new Error(
    `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 '${fieldPath}'의 형식이 올바르지 않습니다: ${detail}`
  );
}

const validateAllowedKeys = (
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  fieldPath: string,
  layoutKey: string
) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throwLayoutError(layoutKey, `${fieldPath}.${key}`, "지원하지 않는 속성입니다.");
    }
  }
};

const validateBooleanField = (
  value: Record<string, unknown>,
  key: string,
  fieldPath: string,
  layoutKey: string
) => {
  if (value[key] !== undefined && typeof value[key] !== "boolean") {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "boolean이어야 합니다.");
  }
};

const validateStringField = (
  value: Record<string, unknown>,
  key: string,
  fieldPath: string,
  layoutKey: string,
  options?: { nonEmpty?: boolean; allowed?: ReadonlySet<string> }
) => {
  const fieldValue = value[key];
  if (fieldValue === undefined) return;
  if (typeof fieldValue !== "string" || (options?.nonEmpty && !fieldValue.trim())) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "문자열이어야 합니다.");
  }
  if (options?.allowed && !options.allowed.has(fieldValue)) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "지원하지 않는 값입니다.");
  }
};

const validateNumberField = (
  value: Record<string, unknown>,
  key: string,
  fieldPath: string,
  layoutKey: string,
  options?: { integer?: boolean; min?: number; max?: number }
) => {
  const fieldValue = value[key];
  if (fieldValue === undefined) return;
  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "유한한 숫자여야 합니다.");
  }
  if (options?.integer && !Number.isInteger(fieldValue)) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, "정수여야 합니다.");
  }
  if (options?.min !== undefined && fieldValue < options.min) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, `${options.min} 이상이어야 합니다.`);
  }
  if (options?.max !== undefined && fieldValue > options.max) {
    throwLayoutError(layoutKey, `${fieldPath}.${key}`, `${options.max} 이하여야 합니다.`);
  }
};

const validateColorObject = (
  color: unknown,
  fieldPath: string,
  layoutKey: string
) => {
  if (!isPlainObject(color)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 '${fieldPath}'의 형식이 올바르지 않습니다: 객체여야 합니다.`
    );
  }
  validateAllowedKeys(color, COLOR_KEYS, fieldPath, layoutKey);
  if (
    color.argb !== undefined &&
    (typeof color.argb !== "string" || !/^[0-9A-Fa-f]{8}$/.test(color.argb))
  ) {
    throwLayoutError(layoutKey, `${fieldPath}.argb`, "8자리 ARGB 16진수 문자열이어야 합니다.");
  }
  validateNumberField(color, "theme", fieldPath, layoutKey, { integer: true, min: 0, max: 11 });
  validateNumberField(color, "indexed", fieldPath, layoutKey, { integer: true, min: 0, max: 64 });
  validateNumberField(color, "tint", fieldPath, layoutKey, { min: -1, max: 1 });
};

const validateFontObject = (font: unknown, fieldPath: string, layoutKey: string) => {
  if (!isPlainObject(font)) {
    throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  }
  validateAllowedKeys(font, FONT_KEYS, fieldPath, layoutKey);
  validateStringField(font, "name", fieldPath, layoutKey, { nonEmpty: true });
  validateNumberField(font, "size", fieldPath, layoutKey, { min: 0.01 });
  validateNumberField(font, "family", fieldPath, layoutKey, { integer: true, min: 0 });
  validateNumberField(font, "charset", fieldPath, layoutKey, { integer: true, min: 0 });
  validateStringField(font, "scheme", fieldPath, layoutKey, { allowed: FONT_SCHEMES });
  for (const key of ["bold", "italic", "strike", "outline"]) {
    validateBooleanField(font, key, fieldPath, layoutKey);
  }
  if (
    font.underline !== undefined &&
    typeof font.underline !== "boolean" &&
    (typeof font.underline !== "string" || !FONT_UNDERLINES.has(font.underline))
  ) {
    throwLayoutError(layoutKey, `${fieldPath}.underline`, "지원하는 underline 값이어야 합니다.");
  }
  validateStringField(font, "vertAlign", fieldPath, layoutKey, {
    allowed: FONT_VERTICAL_ALIGNMENTS
  });
  if (font.color !== undefined) {
    validateColorObject(font.color, `${fieldPath}.color`, layoutKey);
  }
};

const validateAlignmentObject = (alignment: unknown, fieldPath: string, layoutKey: string) => {
  if (!isPlainObject(alignment)) {
    throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  }
  validateAllowedKeys(alignment, ALIGNMENT_KEYS, fieldPath, layoutKey);
  validateStringField(alignment, "horizontal", fieldPath, layoutKey, {
    allowed: HORIZONTAL_ALIGNMENTS
  });
  validateStringField(alignment, "vertical", fieldPath, layoutKey, {
    allowed: VERTICAL_ALIGNMENTS
  });
  validateBooleanField(alignment, "wrapText", fieldPath, layoutKey);
  validateBooleanField(alignment, "shrinkToFit", fieldPath, layoutKey);
  validateNumberField(alignment, "indent", fieldPath, layoutKey, { integer: true, min: 0 });
  validateStringField(alignment, "readingOrder", fieldPath, layoutKey, {
    allowed: READING_ORDERS
  });
  if (alignment.textRotation !== undefined) {
    if (
      alignment.textRotation !== "vertical" &&
      (typeof alignment.textRotation !== "number" ||
        !Number.isInteger(alignment.textRotation) ||
        alignment.textRotation < -90 ||
        alignment.textRotation > 90)
    ) {
      throwLayoutError(
        layoutKey,
        `${fieldPath}.textRotation`,
        "-90~90 정수 또는 'vertical'이어야 합니다."
      );
    }
  }
};

const validateBorderObject = (border: unknown, fieldPath: string, layoutKey: string) => {
  if (!isPlainObject(border)) {
    throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  }
  validateAllowedKeys(border, BORDER_KEYS, fieldPath, layoutKey);
  for (const sideName of BORDER_SIDES) {
    const side = border[sideName];
    if (side === undefined) continue;
    const sidePath = `${fieldPath}.${sideName}`;
    if (!isPlainObject(side)) {
      throwLayoutError(layoutKey, sidePath, "객체여야 합니다.");
    }
    validateAllowedKeys(
      side,
      sideName === "diagonal" ? DIAGONAL_BORDER_KEYS : BORDER_SIDE_KEYS,
      sidePath,
      layoutKey
    );
    validateStringField(side, "style", sidePath, layoutKey, { allowed: BORDER_STYLES });
    if (side.color !== undefined) {
      validateColorObject(side.color, `${sidePath}.color`, layoutKey);
    }
    if (sideName === "diagonal") {
      validateBooleanField(side, "up", sidePath, layoutKey);
      validateBooleanField(side, "down", sidePath, layoutKey);
    }
  }
};

const validateFillObject = (fill: unknown, fieldPath: string, layoutKey: string) => {
  if (!isPlainObject(fill)) {
    throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  }
  if (fill.type === "pattern") {
    validateAllowedKeys(fill, PATTERN_FILL_KEYS, fieldPath, layoutKey);
    validateStringField(fill, "pattern", fieldPath, layoutKey, { allowed: FILL_PATTERNS });
    if (fill.fgColor !== undefined) {
      validateColorObject(fill.fgColor, `${fieldPath}.fgColor`, layoutKey);
    }
    if (fill.bgColor !== undefined) {
      validateColorObject(fill.bgColor, `${fieldPath}.bgColor`, layoutKey);
    }
    return;
  }
  if (fill.type !== "gradient") {
    throwLayoutError(layoutKey, `${fieldPath}.type`, "'pattern' 또는 'gradient'여야 합니다.");
  }
  validateAllowedKeys(fill, GRADIENT_FILL_KEYS, fieldPath, layoutKey);
  validateStringField(fill, "gradient", fieldPath, layoutKey, {
    allowed: new Set(["angle", "path"])
  });
  if (fill.gradient === undefined) {
    throwLayoutError(layoutKey, `${fieldPath}.gradient`, "gradient 채우기에 필요합니다.");
  }
  if (fill.gradient === "angle") {
    validateNumberField(fill, "degree", fieldPath, layoutKey, { min: 0, max: 359 });
    if (fill.degree === undefined) {
      throwLayoutError(layoutKey, `${fieldPath}.degree`, "angle gradient에 필요합니다.");
    }
    if (fill.center !== undefined) {
      throwLayoutError(layoutKey, `${fieldPath}.center`, "angle gradient에서는 사용할 수 없습니다.");
    }
  } else if (fill.gradient === "path") {
    if (!isPlainObject(fill.center)) {
      throwLayoutError(layoutKey, `${fieldPath}.center`, "path gradient의 중심 객체가 필요합니다.");
    }
    validateAllowedKeys(fill.center, GRADIENT_CENTER_KEYS, `${fieldPath}.center`, layoutKey);
    for (const key of ["left", "top"]) {
      validateNumberField(fill.center, key, `${fieldPath}.center`, layoutKey, { min: 0, max: 1 });
      if (fill.center[key] === undefined) {
        throwLayoutError(layoutKey, `${fieldPath}.center.${key}`, "path gradient에 필요합니다.");
      }
    }
    if (fill.degree !== undefined) {
      throwLayoutError(layoutKey, `${fieldPath}.degree`, "path gradient에서는 사용할 수 없습니다.");
    }
  }
  if (!Array.isArray(fill.stops) || fill.stops.length === 0) {
    throwLayoutError(layoutKey, `${fieldPath}.stops`, "하나 이상의 gradient stop 배열이어야 합니다.");
  }
  fill.stops.forEach((stop, index) => {
    const stopPath = `${fieldPath}.stops[${index}]`;
    if (!isPlainObject(stop)) {
      throwLayoutError(layoutKey, stopPath, "객체여야 합니다.");
    }
    validateAllowedKeys(stop, GRADIENT_STOP_KEYS, stopPath, layoutKey);
    validateNumberField(stop, "position", stopPath, layoutKey, { min: 0, max: 1 });
    if (stop.position === undefined) {
      throwLayoutError(layoutKey, `${stopPath}.position`, "gradient stop에 필요합니다.");
    }
    if (stop.color === undefined) {
      throwLayoutError(layoutKey, `${stopPath}.color`, "gradient stop에 필요합니다.");
    }
    validateColorObject(stop.color, `${stopPath}.color`, layoutKey);
  });
};

const validateProtectionObject = (protection: unknown, fieldPath: string, layoutKey: string) => {
  if (!isPlainObject(protection)) {
    throwLayoutError(layoutKey, fieldPath, "객체여야 합니다.");
  }
  validateAllowedKeys(protection, PROTECTION_KEYS, fieldPath, layoutKey);
  validateBooleanField(protection, "locked", fieldPath, layoutKey);
  validateBooleanField(protection, "hidden", fieldPath, layoutKey);
};

const validateErrorValue = (value: unknown, fieldPath: string, layoutKey: string) => {
  if (typeof value !== "string" || !CELL_ERROR_VALUES.has(value)) {
    throwLayoutError(layoutKey, fieldPath, "지원하는 Excel 오류 값이어야 합니다.");
  }
};

const validateFormulaResult = (result: unknown, fieldPath: string, layoutKey: string) => {
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
};

const validateCellValue = (value: unknown, fieldPath: string, layoutKey: string) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throwLayoutError(layoutKey, fieldPath, "유한한 숫자여야 합니다.");
    }
    return;
  }
  if (!isPlainObject(value)) {
    throwLayoutError(layoutKey, fieldPath, "지원하는 primitive 또는 tagged value여야 합니다.");
  }
  if (Object.hasOwn(value, "date")) {
    validateAllowedKeys(value, new Set(["date"]), fieldPath, layoutKey);
    if (
      typeof value.date !== "string" ||
      Number.isNaN(Date.parse(value.date)) ||
      new Date(value.date).toISOString() !== value.date
    ) {
      throwLayoutError(layoutKey, `${fieldPath}.date`, "ISO 날짜 문자열이어야 합니다.");
    }
    return;
  }
  for (const formulaKey of ["formula", "sharedFormula"] as const) {
    if (!Object.hasOwn(value, formulaKey)) continue;
    validateAllowedKeys(value, new Set([formulaKey, "result", "date1904"]), fieldPath, layoutKey);
    validateStringField(value, formulaKey, fieldPath, layoutKey, { nonEmpty: true });
    if (value.result !== undefined) {
      validateFormulaResult(value.result, `${fieldPath}.result`, layoutKey);
    }
    validateBooleanField(value, "date1904", fieldPath, layoutKey);
    return;
  }
  if (Object.hasOwn(value, "richText")) {
    validateAllowedKeys(value, new Set(["richText"]), fieldPath, layoutKey);
    if (!Array.isArray(value.richText)) {
      throwLayoutError(layoutKey, `${fieldPath}.richText`, "배열이어야 합니다.");
    }
    value.richText.forEach((part, index) => {
      const partPath = `${fieldPath}.richText[${index}]`;
      if (!isPlainObject(part)) {
        throwLayoutError(layoutKey, partPath, "객체여야 합니다.");
      }
      validateAllowedKeys(part, new Set(["text", "font"]), partPath, layoutKey);
      if (typeof part.text !== "string") {
        throwLayoutError(layoutKey, `${partPath}.text`, "문자열이어야 합니다.");
      }
      if (part.font !== undefined) {
        validateFontObject(part.font, `${partPath}.font`, layoutKey);
      }
    });
    return;
  }
  if (Object.hasOwn(value, "text") || Object.hasOwn(value, "hyperlink")) {
    validateAllowedKeys(value, new Set(["text", "hyperlink", "tooltip"]), fieldPath, layoutKey);
    for (const key of ["text", "hyperlink"]) {
      validateStringField(value, key, fieldPath, layoutKey, { nonEmpty: true });
      if (value[key] === undefined) {
        throwLayoutError(layoutKey, `${fieldPath}.${key}`, "hyperlink 값에 필요합니다.");
      }
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
};

export const validateBuiltInExcelLayoutDefinition = (
  layoutKey: string,
  definition: unknown
): BuiltInExcelLayoutDefinition => {
  if (!isPlainObject(definition)) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'root'의 형식이 올바르지 않습니다: 정의가 객체가 아닙니다.`
    );
  }

  const def = definition as Record<string, unknown>;
  validateAllowedKeys(def, ROOT_KEYS, "root", layoutKey);

  if (def.schemaVersion !== 1) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'schemaVersion'의 형식이 올바르지 않습니다: schemaVersion은 1이어야 합니다.`
    );
  }

  if (def.layoutKey !== layoutKey) {
    throw new Error(
      `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'layoutKey'의 형식이 올바르지 않습니다: 기대 '${layoutKey}', 실제 '${String(def.layoutKey)}'.`
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

  const ws = def.worksheet as Record<string, unknown>;
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
        integer: true,
        min: 0,
        max: 7
      });
    }
    for (const key of ["defaultRowHeight", "defaultColWidth", "dyDescent"]) {
      validateNumberField(properties, key, "worksheet.properties", layoutKey, { min: 0 });
    }
    validateBooleanField(properties, "showGridLines", "worksheet.properties", layoutKey);
    if (properties.outlineProperties !== undefined) {
      if (!isPlainObject(properties.outlineProperties)) {
        throwLayoutError(
          layoutKey,
          "worksheet.properties.outlineProperties",
          "객체여야 합니다."
        );
      }
      validateAllowedKeys(
        properties.outlineProperties,
        OUTLINE_PROPERTY_KEYS,
        "worksheet.properties.outlineProperties",
        layoutKey
      );
      validateBooleanField(
        properties.outlineProperties,
        "summaryBelow",
        "worksheet.properties.outlineProperties",
        layoutKey
      );
      validateBooleanField(
        properties.outlineProperties,
        "summaryRight",
        "worksheet.properties.outlineProperties",
        layoutKey
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
      validateAllowedKeys(
        pageSetup.margins,
        PAGE_MARGIN_KEYS,
        "worksheet.pageSetup.margins",
        layoutKey
      );
      for (const key of PAGE_MARGIN_KEYS) {
        validateNumberField(pageSetup.margins, key, "worksheet.pageSetup.margins", layoutKey, {
          min: 0
        });
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
      "fitToPage",
      "blackAndWhite",
      "draft",
      "showRowColHeaders",
      "showGridLines",
      "useFirstPageNumber",
      "usePrinterDefaults",
      "horizontalCentered",
      "verticalCentered"
    ]) {
      validateBooleanField(pageSetup, key, "worksheet.pageSetup", layoutKey);
    }
    for (const key of ["horizontalDpi", "verticalDpi", "fitToWidth", "fitToHeight"]) {
      validateNumberField(pageSetup, key, "worksheet.pageSetup", layoutKey, {
        integer: true,
        min: 0
      });
    }
    for (const key of ["firstPageNumber", "copies"]) {
      validateNumberField(pageSetup, key, "worksheet.pageSetup", layoutKey, {
        integer: true,
        min: 1
      });
    }
    validateNumberField(pageSetup, "scale", "worksheet.pageSetup", layoutKey, {
      integer: true,
      min: 10,
      max: 400
    });
    if (pageSetup.paperSize !== undefined) {
      if (
        typeof pageSetup.paperSize !== "number" ||
        !Number.isInteger(pageSetup.paperSize) ||
        !PAPER_SIZES.has(pageSetup.paperSize)
      ) {
        throwLayoutError(
          layoutKey,
          "worksheet.pageSetup.paperSize",
          "지원하는 Excel 용지 크기 번호여야 합니다."
        );
      }
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
      "oddHeader",
      "oddFooter",
      "evenHeader",
      "evenFooter",
      "firstHeader",
      "firstFooter"
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
    const lr = def.logoRange as Record<string, unknown>;
    validateAllowedKeys(lr, LOGO_RANGE_KEYS, "logoRange", layoutKey);
    if (
      !Number.isInteger(lr.startColumn) ||
      !Number.isInteger(lr.startRow) ||
      !Number.isInteger(lr.endColumn) ||
      !Number.isInteger(lr.endRow) ||
      (lr.startColumn as number) < 1 ||
      (lr.startRow as number) < 1 ||
      (lr.endColumn as number) < (lr.startColumn as number) ||
      (lr.endRow as number) < (lr.startRow as number) ||
      (lr.startColumn as number) < canvas.startColumn ||
      (lr.endColumn as number) > canvas.endColumn ||
      (lr.startRow as number) < canvas.startRow ||
      (lr.endRow as number) > canvas.endRow
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
  const colIndices = new Set<number>();
  def.columns.forEach((colItem, idx) => {
    if (!isPlainObject(colItem)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const col = colItem as Record<string, unknown>;
    validateAllowedKeys(col, COLUMN_KEYS, `columns[${idx}]`, layoutKey);
    if (!Number.isInteger(col.index) || (col.index as number) < 1) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].index'의 형식이 올바르지 않습니다: 1 이상의 열 번호여야 합니다.`
      );
    }
    const colIndex = col.index as number;
    if (colIndex < canvas.startColumn || colIndex > canvas.endColumn) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].index'의 형식이 올바르지 않습니다: canvasRange 범위를 벗어났습니다.`
      );
    }
    if (colIndices.has(colIndex)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'columns[${idx}].index'의 형식이 올바르지 않습니다: 중복된 열 번호(${colIndex})입니다.`
      );
    }
    colIndices.add(colIndex);

    if (col.width !== undefined && (!Number.isFinite(col.width) || (col.width as number) < 0)) {
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
      (!Number.isInteger(col.outlineLevel) || (col.outlineLevel as number) < 0)
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
  const rowNumbers = new Set<number>();
  def.rows.forEach((rowItem, idx) => {
    if (!isPlainObject(rowItem)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const row = rowItem as Record<string, unknown>;
    validateAllowedKeys(row, ROW_KEYS, `rows[${idx}]`, layoutKey);
    if (!Number.isInteger(row.number) || (row.number as number) < 1) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].number'의 형식이 올바르지 않습니다: 1 이상의 행 번호여야 합니다.`
      );
    }
    const rowNumber = row.number as number;
    if (rowNumber < canvas.startRow || rowNumber > canvas.endRow) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].number'의 형식이 올바르지 않습니다: canvasRange 범위를 벗어났습니다.`
      );
    }
    if (rowNumbers.has(rowNumber)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'rows[${idx}].number'의 형식이 올바르지 않습니다: 중복된 행 번호(${rowNumber})입니다.`
      );
    }
    rowNumbers.add(rowNumber);

    if (row.height !== undefined && (!Number.isFinite(row.height) || (row.height as number) < 0)) {
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
      (!Number.isInteger(row.outlineLevel) || (row.outlineLevel as number) < 0)
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
  const parsedMerges: Array<{
    startColumn: number;
    startRow: number;
    endColumn: number;
    endRow: number;
  }> = [];
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
  const cellAddresses = new Set<string>();
  def.cells.forEach((cellItem, idx) => {
    if (!isPlainObject(cellItem)) {
      throw new Error(
        `[내장 Excel 레이아웃 오류 (${layoutKey})] 필드 'cells[${idx}]'의 형식이 올바르지 않습니다: 객체여야 합니다.`
      );
    }
    const cell = cellItem as Record<string, unknown>;
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
      if (
        isPlainObject(cell.value) &&
        Object.hasOwn(cell.value, "formula") &&
        typeof cell.value.formula !== "string"
      ) {
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

  return def as unknown as BuiltInExcelLayoutDefinition;
};

export const getBuiltInExcelLayoutDefinition = (
  layoutKey: string
): BuiltInExcelLayoutDefinition => {
  if (!BUILT_IN_LAYOUT_KEYS.includes(layoutKey as BuiltInExcelLayoutKey)) {
    throw new Error(`지원하지 않는 기본 Excel 레이아웃 키입니다: ${layoutKey}`);
  }

  const definition = BUILT_IN_LAYOUTS[layoutKey as BuiltInExcelLayoutKey];
  validateBuiltInExcelLayoutDefinition(layoutKey, definition);
  return JSON.parse(JSON.stringify(definition)) as BuiltInExcelLayoutDefinition;
};

export interface CreateBuiltInExcelWorkbookOptions {
  applyLogo?: boolean;
}

export const createBuiltInExcelWorkbook = (
  layoutKey: BuiltInExcelLayoutKey | string,
  options?: CreateBuiltInExcelWorkbookOptions
): ExcelJS.Workbook => {
  const def = getBuiltInExcelLayoutDefinition(layoutKey);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(def.worksheet.name);

  // 1. 값(Values) 적용
  def.cells.forEach((cellDef) => {
    if (cellDef.value !== undefined) {
      const cell = worksheet.getCell(cellDef.address);
      if (typeof cellDef.value === "object" && cellDef.value !== null) {
        const valObj = cellDef.value as Record<string, unknown>;
        if ("date" in valObj && typeof valObj.date === "string") {
          cell.value = new Date(valObj.date);
        } else if ("formula" in valObj) {
          cell.value = {
            formula: valObj.formula as string,
            result:
              valObj.result !== undefined
                ? (valObj.result as string | number | boolean | Date | ExcelJS.CellErrorValue)
                : undefined
          };
        } else if ("richText" in valObj && Array.isArray(valObj.richText)) {
          cell.value = { richText: JSON.parse(JSON.stringify(valObj.richText)) };
        } else if ("text" in valObj && "hyperlink" in valObj) {
          cell.value = {
            text: valObj.text as string,
            hyperlink: valObj.hyperlink as string,
            ...(valObj.tooltip !== undefined ? { tooltip: valObj.tooltip as string } : {})
          };
        } else if ("error" in valObj) {
          cell.value = { error: valObj.error as ExcelJS.CellErrorValue["error"] };
        } else {
          cell.value = JSON.parse(JSON.stringify(cellDef.value));
        }
      } else {
        cell.value = cellDef.value as ExcelJS.CellValue;
      }
    }
  });

  // 2. 열(Columns) 크기 및 설정
  def.columns.forEach((col) => {
    const targetCol = worksheet.getColumn(col.index);
    if (typeof col.width === "number") targetCol.width = col.width;
    if (col.hidden !== undefined) targetCol.hidden = col.hidden;
    if (col.outlineLevel !== undefined) targetCol.outlineLevel = col.outlineLevel;
  });

  // 3. 행(Rows) 높이 및 설정
  def.rows.forEach((row) => {
    const targetRow = worksheet.getRow(row.number);
    if (typeof row.height === "number") targetRow.height = row.height;
    if (row.hidden !== undefined) targetRow.hidden = row.hidden;
    if (row.outlineLevel !== undefined) targetRow.outlineLevel = row.outlineLevel;
  });

  // 4. 병합(Merges) 적용
  def.merges.forEach((mergeRange) => {
    worksheet.mergeCells(mergeRange);
  });

  // 5. 서식(Styles) 적용 (독립 복사본 적용)
  def.cells.forEach((cellDef) => {
    const cell = worksheet.getCell(cellDef.address);
    if (cell.isMerged && cell.master.address !== cell.address) {
      return;
    }
    if (cellDef.numFmt) cell.numFmt = cellDef.numFmt;
    if (cellDef.font) cell.font = JSON.parse(JSON.stringify(cellDef.font));
    if (cellDef.alignment) cell.alignment = JSON.parse(JSON.stringify(cellDef.alignment));
    if (cellDef.border) {
      cell.border = JSON.parse(JSON.stringify(cellDef.border));
    } else if (
      cellDef.font ||
      cellDef.alignment ||
      cellDef.fill ||
      cellDef.numFmt ||
      cellDef.protection
    ) {
      cell.border = {};
    }
    if (cellDef.fill) cell.fill = JSON.parse(JSON.stringify(cellDef.fill));
    if (cellDef.protection) cell.protection = JSON.parse(JSON.stringify(cellDef.protection));
  });

  // 6. 보기(Views) 적용
  if (def.worksheet.views) {
    worksheet.views = JSON.parse(JSON.stringify(def.worksheet.views));
  }

  // 7. 인쇄 설정(properties, pageSetup, headerFooter) 적용
  if (def.worksheet.properties) {
    worksheet.properties = JSON.parse(JSON.stringify(def.worksheet.properties));
  }
  if (def.worksheet.pageSetup) {
    worksheet.pageSetup = JSON.parse(JSON.stringify(def.worksheet.pageSetup));
  }
  if (def.worksheet.headerFooter) {
    worksheet.headerFooter = JSON.parse(JSON.stringify(def.worksheet.headerFooter));
  } else {
    worksheet.headerFooter = null as unknown as ExcelJS.HeaderFooter;
  }

  // 8. 로고 추가 (수당 문서)
  if (options?.applyLogo !== false && def.logoRange) {
    addBrandLogoToWorksheetRange(
      worksheet,
      def.logoRange,
      getDocumentLabel(def.layoutKey)
    );
  }

  return workbook;
};
