import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

import type { DocumentTemplateVersion } from "../../shared/domain/model";
import type { DocumentLayoutDefinition } from "../../shared/domain/document-layout";
import type {
  SchedulePlanCellUpdate,
  SchedulePlanTemplateLayout,
  SchedulePlanTemplateVariant,
  SchedulePlanTemplateWeekBlock
} from "../../shared/domain/schedule-plan";
import { applyDocumentTemplateStyleSpec } from "./document-template-style-apply-service";
import { createBuiltInExcelWorkbook } from "./built-in-excel-layout-service";
import {
  applyDocumentLayoutToWorksheet,
  computeDocumentLayoutActualBlockRanges
} from "./document-layout-excel-render-service";
import { formatDocumentLayoutStorageKey } from "./document-layout-definition-service";

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook;
};

const writeWorkbook = async (workbook: ExcelJS.Workbook, outputPath: string) => {
  await workbook.xlsx.writeFile(outputPath);
};

const toColumnLetter = (columnNumber: number) => {
  let current = columnNumber;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const toColumnNumber = (columnLetters: string) =>
  columnLetters
    .toUpperCase()
    .split("")
    .reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);

export const parseCellAddress = (address: string) => {
  const match = address.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    columnNumber: toColumnNumber(match[1]!),
    rowNumber: Number(match[2])
  };
};

export const parseRangeString = (rangeStr: string) => {
  const clean = rangeStr.replace(/\$/g, "").trim();
  const [start, end] = clean.split(":");
  if (!start) return null;
  const startAddr = parseCellAddress(start);
  if (!startAddr) return null;
  const endAddr = end ? parseCellAddress(end) : startAddr;
  if (!endAddr) return null;
  return {
    startCol: Math.min(startAddr.columnNumber, endAddr.columnNumber),
    endCol: Math.max(startAddr.columnNumber, endAddr.columnNumber),
    startRow: Math.min(startAddr.rowNumber, endAddr.rowNumber),
    endRow: Math.max(startAddr.rowNumber, endAddr.rowNumber)
  };
};

export const SCHEDULE_LAYOUT_METADATA_SHEET_NAME = "__shiftmgmt_meta";
export const SCHEDULE_LAYOUT_METADATA_DEFINED_NAME = "_SHIFT_MGMT_SCHEDULE_LAYOUT_REVISION";
export const SCHEDULE_LAYOUT_METADATA_CELL_ADDRESS = "A1";
export const SCHEDULE_LAYOUT_METADATA_FORMAT = "shiftmgmt.schedule-layout-revision";

export interface ScheduleLayoutRevisionMetadata {
  definitionSha256: string;
  format: "shiftmgmt.schedule-layout-revision";
  generatorCompatibilityVersion: string;
  layoutKey: "schedule-xlsx/template1" | "schedule-xlsx/template2";
  revisionId: string;
  revisionKind: "stored" | "built-in";
  schemaVersion: 1;
}

export const canonicalizeJson = (val: unknown): string => {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((item) => canonicalizeJson(item)).join(",")}]`;
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return `{${pairs.join(",")}}`;
};

export const computeCanonicalDigestSha256 = (val: unknown): string => {
  const json = canonicalizeJson(val);
  return createHash("sha256").update(json, "utf8").digest("hex").toLowerCase();
};

const ALLOWED_METADATA_KEYS = new Set([
  "definitionSha256",
  "format",
  "generatorCompatibilityVersion",
  "layoutKey",
  "revisionId",
  "revisionKind",
  "schemaVersion"
]);

export function assertScheduleLayoutRevisionMetadata(
  val: unknown
): asserts val is ScheduleLayoutRevisionMetadata {
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    throw new Error("메타데이터 검증 실패: 메타데이터는 객체 형식이어야 합니다.");
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 7 || keys.some((k) => !ALLOWED_METADATA_KEYS.has(k))) {
    throw new Error("메타데이터 검증 실패: 허용되지 않거나 누락된 필드가 있습니다.");
  }
  if (obj.format !== SCHEDULE_LAYOUT_METADATA_FORMAT) {
    throw new Error(`메타데이터 검증 실패: format이 올바르지 않습니다: ${String(obj.format)}`);
  }
  if (obj.schemaVersion !== 1) {
    throw new Error(`메타데이터 검증 실패: schemaVersion이 올바르지 않습니다: ${String(obj.schemaVersion)}`);
  }
  if (obj.revisionKind !== "stored" && obj.revisionKind !== "built-in") {
    throw new Error(`메타데이터 검증 실패: revisionKind가 올바르지 않습니다: ${String(obj.revisionKind)}`);
  }
  if (obj.layoutKey !== "schedule-xlsx/template1" && obj.layoutKey !== "schedule-xlsx/template2") {
    throw new Error(`메타데이터 검증 실패: layoutKey가 올바르지 않습니다: ${String(obj.layoutKey)}`);
  }
  if (typeof obj.definitionSha256 !== "string" || !/^[0-9a-f]{64}$/.test(obj.definitionSha256)) {
    throw new Error("메타데이터 검증 실패: definitionSha256은 64자리 소문자 hex 해시여야 합니다.");
  }
  if (typeof obj.revisionId !== "string" || obj.revisionId.trim().length === 0) {
    throw new Error("메타데이터 검증 실패: revisionId가 비어 있습니다.");
  }
  if (typeof obj.generatorCompatibilityVersion !== "string" || obj.generatorCompatibilityVersion.trim().length === 0) {
    throw new Error("메타데이터 검증 실패: generatorCompatibilityVersion이 비어 있습니다.");
  }
  if (obj.revisionKind === "built-in") {
    const expectedBuiltInId = `builtin:${obj.layoutKey}:${obj.definitionSha256}`;
    if (obj.revisionId !== expectedBuiltInId) {
      throw new Error(`메타데이터 검증 실패: built-in revisionId가 규약과 일치하지 않습니다: ${obj.revisionId}`);
    }
  }
}

export const attachScheduleLayoutMetadataToWorkbook = (
  workbook: ExcelJS.Workbook,
  metadata: ScheduleLayoutRevisionMetadata
) => {
  assertScheduleLayoutRevisionMetadata(metadata);
  let metaSheet = workbook.getWorksheet(SCHEDULE_LAYOUT_METADATA_SHEET_NAME);
  if (!metaSheet) {
    metaSheet = workbook.addWorksheet(SCHEDULE_LAYOUT_METADATA_SHEET_NAME);
  }
  metaSheet.state = "veryHidden";
  metaSheet.getCell(SCHEDULE_LAYOUT_METADATA_CELL_ADDRESS).value = canonicalizeJson(metadata);

  const targetRange = `${SCHEDULE_LAYOUT_METADATA_SHEET_NAME}!$A$1`;
  const targetUpper = SCHEDULE_LAYOUT_METADATA_DEFINED_NAME.toUpperCase();
  if (workbook.definedNames.model) {
    workbook.definedNames.model = workbook.definedNames.model.filter(
      (d) => typeof d.name === "string" && d.name.toUpperCase() !== targetUpper
    );
  }
  workbook.definedNames.add(targetRange, SCHEDULE_LAYOUT_METADATA_DEFINED_NAME);
};

export const readScheduleLayoutRevisionMetadataFromWorkbook = (
  workbook: ExcelJS.Workbook
): ScheduleLayoutRevisionMetadata | null => {
  const metaSheet = workbook.getWorksheet(SCHEDULE_LAYOUT_METADATA_SHEET_NAME);
  const targetUpper = SCHEDULE_LAYOUT_METADATA_DEFINED_NAME.toUpperCase();
  const definedNamesModel = workbook.definedNames.model ?? [];
  const matchingDefinedNames = definedNamesModel.filter(
    (d) => typeof d.name === "string" && d.name.toUpperCase() === targetUpper
  );

  if (!metaSheet && matchingDefinedNames.length === 0) {
    return null;
  }

  if (!metaSheet || matchingDefinedNames.length === 0) {
    throw new Error("메타데이터 검증 실패: 메타데이터 시트 또는 정의 이름이 누락되었습니다.");
  }

  if (matchingDefinedNames.length > 1) {
    throw new Error("메타데이터 검증 실패: 정의 이름이 중복 정의되었습니다.");
  }

  const defEntry = matchingDefinedNames[0]!;
  const ranges = defEntry.ranges ?? [];
  if (ranges.length !== 1) {
    throw new Error("메타데이터 검증 실패: 정의 이름은 정확히 하나의 셀 범위를 가리켜야 합니다.");
  }
  const normalizedRange = ranges[0]!.replace(/'/g, "");
  if (
    normalizedRange !== `${SCHEDULE_LAYOUT_METADATA_SHEET_NAME}!$A$1` &&
    normalizedRange !== `${SCHEDULE_LAYOUT_METADATA_SHEET_NAME}!A1`
  ) {
    throw new Error(`메타데이터 검증 실패: 정의 이름이 가리키는 범위가 올바르지 않습니다: ${ranges[0]}`);
  }

  if (metaSheet.state !== "veryHidden") {
    throw new Error(`메타데이터 검증 실패: 메타데이터 시트가 숨겨져 있지 않습니다 (state: ${metaSheet.state})`);
  }

  const cellValue = metaSheet.getCell(SCHEDULE_LAYOUT_METADATA_CELL_ADDRESS).value;
  if (typeof cellValue !== "string" || cellValue.trim().length === 0) {
    throw new Error("메타데이터 검증 실패: 메타데이터 셀이 비어 있거나 문자열이 아닙니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cellValue);
  } catch {
    throw new Error("메타데이터 검증 실패: 메타데이터 JSON 형식이 올바르지 않습니다.");
  }

  assertScheduleLayoutRevisionMetadata(parsed);
  return parsed as ScheduleLayoutRevisionMetadata;
};

export const buildSchedulePlanDateBlockAddresses = (dateAddress: string) => {
  const parsed = parseCellAddress(dateAddress);

  if (!parsed) {
    return [dateAddress];
  }

  return Array.from(
    { length: 3 },
    (_, index) => `${toColumnLetter(parsed.columnNumber + index)}${parsed.rowNumber}`
  );
};

const normalizeCellText = (value: ExcelJS.CellValue | undefined | null) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const createDayBlock = (startColumnNumber: number) => ({
  left: `${toColumnLetter(startColumnNumber)}`,
  center: `${toColumnLetter(startColumnNumber + 1)}`,
  right: `${toColumnLetter(startColumnNumber + 2)}`
});

const createSample1WeekBlock = (dateRow: number): SchedulePlanTemplateWeekBlock => ({
  dateRow,
  daySlots: [3, 6, 9, 12, 15, 18, 21].map((columnNumber) => {
    const block = createDayBlock(columnNumber);

    return {
      dateAddress: `${block.left}${dateRow}`,
      dutyCellAddresses: {
        D: [`${block.center}${dateRow + 1}`],
        E: [`${block.center}${dateRow + 2}`],
        N: [`${block.center}${dateRow + 3}`],
        O: [`${block.center}${dateRow + 4}`, `${block.center}${dateRow + 5}`]
      }
    };
  })
});

const createSample2WeekBlock = (dateRow: number): SchedulePlanTemplateWeekBlock => ({
  dateRow,
  daySlots: [3, 6, 9, 12, 15, 18, 21].map((columnNumber) => {
    const block = createDayBlock(columnNumber);

    return {
      dateAddress: `${block.left}${dateRow}`,
      dutyCellAddresses: {
        D: [`${block.left}${dateRow + 1}`, `${block.center}${dateRow + 1}`, `${block.right}${dateRow + 1}`],
        N: [`${block.center}${dateRow + 4}`],
        O: Array.from({ length: 5 }, (_, index) => `${block.center}${dateRow + 5 + index}`)
      }
    };
  })
});

const detectTemplateVariant = (
  worksheet: ExcelJS.Worksheet
): SchedulePlanTemplateVariant => {
  const sample2ReasonHeader = normalizeCellText(worksheet.getCell("BF9").value);
  const sample1ReasonHeader = normalizeCellText(worksheet.getCell("AX9").value);

  if (sample2ReasonHeader === "변경 사유") {
    return "sample2";
  }

  if (sample1ReasonHeader === "변경 사유") {
    return "sample1";
  }

  throw new Error("지원하지 않는 근무표 템플릿 형식입니다.");
};

const createSample1Layout = (
  worksheet: ExcelJS.Worksheet,
  dateRows: number[]
): SchedulePlanTemplateLayout => ({
  variant: "sample1",
  sheetName: worksheet.name,
  siteNameCell: "C3",
  monthTitleCell: "W6",
  rosterSummaryCell: "B7",
  monthAnchorCells: ["AY8", "BK8", "BK30"],
  weekBlocks: dateRows.map(createSample1WeekBlock),
  rescheduleDateCells: Array.from({ length: 31 }, (_, index) => `Y${index + 12}`),
  supportedWorkingDutyCodes: ["D", "E", "N"],
  regularPlanColumns: {
    D: ["Z", "AA", "AB", "AC"],
    E: ["AD", "AE", "AF", "AG"],
    N: ["AH", "AI", "AJ", "AK"]
  },
  changedPlanColumns: {
    D: ["AL", "AM", "AN", "AO"],
    E: ["AP", "AQ", "AR", "AS"],
    N: ["AT", "AU", "AV", "AW"]
  },
  changeReasonColumn: "AX",
  changeReasonColumns: ["AX", "AY"]
});

const createSample2Layout = (
  worksheet: ExcelJS.Worksheet,
  dateRows: number[]
): SchedulePlanTemplateLayout => ({
  variant: "sample2",
  sheetName: worksheet.name,
  siteNameCell: "C3",
  monthTitleCell: "W6",
  rosterSummaryCell: "B7",
  monthAnchorCells: ["BG8", "BS8", "BS30"],
  weekBlocks: dateRows.map(createSample2WeekBlock),
  rescheduleDateCells: Array.from({ length: 31 }, (_, index) => `Y${index + 12}`),
  supportedWorkingDutyCodes: ["D", "N"],
  regularPlanColumns: {
    D: ["Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK"],
    N: ["AL", "AM", "AN", "AO"]
  },
  changedPlanColumns: {
    D: ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "AY", "AZ", "BA"],
    N: ["BB", "BC", "BD", "BE"]
  },
  changeReasonColumn: "BF",
  changeReasonColumns: ["BF", "BG"]
});

export const buildSchedulePlanCalendarDates = (scheduleMonth: string) => {
  const [yearText, monthText] = scheduleMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return [];
  }

  const firstDay = new Date(year, month - 1, 1);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());
  const dates: string[] = [];

  for (let index = 0; index < 42; index += 1) {
    const cursor = new Date(calendarStart);
    cursor.setDate(calendarStart.getDate() + index);
    dates.push(createDateValue(cursor));
  }

  return dates;
};

// 이미 읽어 둔 워크북에서 레이아웃을 도출한다(파일을 다시 읽지 않음).
// 워크시트 선택 규칙은 기존과 동일하다.
export const inspectSchedulePlanTemplateFromWorkbook = (
  workbook: ExcelJS.Workbook
): SchedulePlanTemplateLayout => {
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];
  const variant = detectTemplateVariant(worksheet);
  const dateRows = Array.from({ length: worksheet.rowCount }, (_, index) => index + 1).filter(
    (rowNumber) => normalizeCellText(worksheet.getCell(rowNumber, 2).value) === "DATE"
  );

  if (dateRows.length === 0) {
    throw new Error("근무표 템플릿에서 주차 블록을 찾을 수 없습니다.");
  }

  if (variant === "sample2") {
    return createSample2Layout(worksheet, dateRows);
  }

  return createSample1Layout(worksheet, dateRows);
};

export const inspectSchedulePlanTemplate = async (
  filePath: string
): Promise<SchedulePlanTemplateLayout> => {
  const workbook = await readWorkbook(filePath);
  return inspectSchedulePlanTemplateFromWorkbook(workbook);
};

const applyCellNumberFormat = (
  worksheet: ExcelJS.Worksheet,
  addresses: string[],
  numberFormat: string
) => {
  addresses.forEach((address) => {
    const sourceCell = worksheet.getCell(address);
    const targetCell = sourceCell.master ?? sourceCell;

    targetCell.numFmt = numberFormat;
  });
};

export const resolveSchedulePlanLayoutKeyOrThrow = (input: {
  layoutKey?: unknown;
  variant?: unknown;
}): "schedule-xlsx/template1" | "schedule-xlsx/template2" => {
  const hasLayoutKey = input.layoutKey !== undefined && input.layoutKey !== null && input.layoutKey !== "";
  const hasVariant = input.variant !== undefined && input.variant !== null && input.variant !== "";

  if (!hasLayoutKey && !hasVariant) {
    throw new Error("근무표 템플릿 선택 정보(layoutKey 또는 variant)가 필요합니다.");
  }

  if (hasLayoutKey) {
    if (input.layoutKey !== "schedule-xlsx/template1" && input.layoutKey !== "schedule-xlsx/template2") {
      throw new Error(`지원하지 않는 근무표 레이아웃 키입니다: ${String(input.layoutKey)}`);
    }
  }

  if (hasVariant) {
    if (input.variant !== "sample1" && input.variant !== "sample2") {
      throw new Error(`지원하지 않는 근무표 variant입니다: ${String(input.variant)}`);
    }
  }

  if (hasLayoutKey && hasVariant) {
    const expectedVariant = input.layoutKey === "schedule-xlsx/template1" ? "sample1" : "sample2";
    if (input.variant !== expectedVariant) {
      throw new Error(
        `근무표 layoutKey(${String(input.layoutKey)})와 variant(${String(input.variant)})가 서로 일치하지 않습니다.`
      );
    }
  }

  return (input.layoutKey as "schedule-xlsx/template1" | "schedule-xlsx/template2" | undefined) ??
    (input.variant === "sample1" ? "schedule-xlsx/template1" : "schedule-xlsx/template2");
};

export interface ScheduleLayoutRevisionIdentity {
  activeRevisionId: string | null;
  usingBuiltInDefault: boolean;
  layoutKey: "schedule-xlsx/template1" | "schedule-xlsx/template2";
  definition: DocumentLayoutDefinition;
}

export const writeSchedulePlanWorkbook = async (input: {
  variant?: SchedulePlanTemplateVariant;
  layoutKey?: "schedule-xlsx/template1" | "schedule-xlsx/template2";
  outputPath: string;
  updates: SchedulePlanCellUpdate[];
  cellFillUpdates?: Array<{ address: string; colorArgb: string }>;
  template?: Pick<DocumentTemplateVersion, "profile" | "validation">;
  definition?: DocumentLayoutDefinition;
  layoutRevisionIdentity?: ScheduleLayoutRevisionIdentity;
}) => {
  const layoutKey = resolveSchedulePlanLayoutKeyOrThrow(input);
  const workbook = createBuiltInExcelWorkbook(layoutKey);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  input.updates.forEach((update) => {
    const sourceCell = worksheet.getCell(update.address);
    const targetCell = sourceCell.master ?? sourceCell;

    if (update.value instanceof Date) {
      const excelSafeDate = new Date(update.value);
      excelSafeDate.setHours(12, 0, 0, 0);
      targetCell.value = excelSafeDate;

      if (update.numberFormat) {
        applyCellNumberFormat(
          worksheet,
          update.numberFormatAddresses?.length ? update.numberFormatAddresses : [update.address],
          update.numberFormat
        );
      }

      return;
    }

    targetCell.value = update.value;

    if (update.numberFormat) {
      applyCellNumberFormat(
        worksheet,
        update.numberFormatAddresses?.length ? update.numberFormatAddresses : [update.address],
        update.numberFormat
      );
    }
  });

  (input.cellFillUpdates ?? []).forEach(({ address, colorArgb }) => {
    const targetCell = worksheet.getCell(address).master ?? worksheet.getCell(address);

    targetCell.style = {
      ...targetCell.style,
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorArgb }
      }
    };
  });

  if (input.template) {
    applyDocumentTemplateStyleSpec({
      workbook,
      template: input.template
    });
  }

  if (input.definition) {
    applyDocumentLayoutToWorksheet({
      worksheet,
      definition: input.definition
    });
  }

  if (input.layoutRevisionIdentity) {
    const { activeRevisionId, usingBuiltInDefault, layoutKey: identityKey, definition: identDef } = input.layoutRevisionIdentity;
    const definitionSha256 = computeCanonicalDigestSha256(identDef);
    let revisionId: string;
    let revisionKind: "stored" | "built-in";

    if (usingBuiltInDefault) {
      revisionKind = "built-in";
      revisionId = `builtin:${identityKey}:${definitionSha256}`;
    } else {
      if (!activeRevisionId) {
        throw new Error(`저장된 레이아웃 판의 revisionId가 유효하지 않습니다: ${identityKey}`);
      }
      revisionKind = "stored";
      revisionId = activeRevisionId;
    }

    const metadata: ScheduleLayoutRevisionMetadata = {
      definitionSha256,
      format: SCHEDULE_LAYOUT_METADATA_FORMAT,
      generatorCompatibilityVersion: identDef.generatorCompatibilityVersion,
      layoutKey: identityKey,
      revisionId,
      revisionKind,
      schemaVersion: 1
    };

    attachScheduleLayoutMetadataToWorkbook(workbook, metadata);
  }

  await writeWorkbook(workbook, input.outputPath);
};

export interface SchedulePlanSectionTableLayout {
  dateColumns: string[];
  startRow: number;
  endRow: number;
  originalWorkerColumns?: string[];
  substituteWorkerColumns?: string[];
  startHourColumn?: string;
  startMinuteColumn?: string;
  endHourColumn?: string;
  endMinuteColumn?: string;
  workerColumns?: string[];
  reasonColumns: string[];
  evidenceColumns: string[];
}

export const resolveScheduleSectionLayoutsFromDefinition = (
  definition: DocumentLayoutDefinition
): { substitute: SchedulePlanSectionTableLayout; overtime: SchedulePlanSectionTableLayout } => {
  const { targetRanges } = computeDocumentLayoutActualBlockRanges(definition);
  const subRange = targetRanges.get("schedule.substitute");
  const otRange = targetRanges.get("schedule.overtime");

  if (!subRange || !otRange) {
    throw new Error("레이아웃 정의에 schedule.substitute 또는 schedule.overtime 블록이 누락되었습니다.");
  }

  // substitute: startRow + 2부터 16행 유지 (16행 용량)
  const subStartCol = subRange.startCol;
  const subStartRow = subRange.startRow + 2;
  const subEndRow = subStartRow + 16 - 1;

  const substitute: SchedulePlanSectionTableLayout = {
    dateColumns: [toColumnLetter(subStartCol), toColumnLetter(subStartCol + 1)],
    startRow: subStartRow,
    endRow: subEndRow,
    originalWorkerColumns: [toColumnLetter(subStartCol + 2), toColumnLetter(subStartCol + 3)],
    substituteWorkerColumns: [toColumnLetter(subStartCol + 4), toColumnLetter(subStartCol + 5)],
    reasonColumns: [
      toColumnLetter(subStartCol + 6),
      toColumnLetter(subStartCol + 7),
      toColumnLetter(subStartCol + 8)
    ],
    evidenceColumns: [toColumnLetter(subStartCol + 9), toColumnLetter(subStartCol + 10)]
  };

  // overtime: startRow + 3부터 67행 scan window 유지
  const otStartCol = otRange.startCol;
  const otStartRow = otRange.startRow + 3;
  const otEndRow = otStartRow + 67 - 1;

  const overtime: SchedulePlanSectionTableLayout = {
    dateColumns: [toColumnLetter(otStartCol), toColumnLetter(otStartCol + 1)],
    startRow: otStartRow,
    endRow: otEndRow,
    startHourColumn: toColumnLetter(otStartCol + 2),
    startMinuteColumn: toColumnLetter(otStartCol + 3),
    endHourColumn: toColumnLetter(otStartCol + 4),
    endMinuteColumn: toColumnLetter(otStartCol + 5),
    workerColumns: [toColumnLetter(otStartCol + 6)],
    reasonColumns: [toColumnLetter(otStartCol + 7), toColumnLetter(otStartCol + 8)],
    evidenceColumns: [toColumnLetter(otStartCol + 9), toColumnLetter(otStartCol + 10)]
  };

  return { substitute, overtime };
};

export const inspectSchedulePlanTemplateFromDefinition = (
  definition: DocumentLayoutDefinition,
  workbook: ExcelJS.Workbook
): SchedulePlanTemplateLayout => {
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];
  const { targetRanges } = computeDocumentLayoutActualBlockRanges(definition);
  const variant: SchedulePlanTemplateVariant = definition.variant === "template2" ? "sample2" : "sample1";

  const siteRange = targetRanges.get("schedule.site");
  const headingRange = targetRanges.get("schedule.calendar-heading");
  const rosterRange = targetRanges.get("schedule.roster");
  const gridRange = targetRanges.get("schedule.calendar-grid");
  const rescheduleRange = targetRanges.get("schedule.reschedule");

  if (!siteRange || !headingRange || !rosterRange || !gridRange || !rescheduleRange) {
    throw new Error("정의에 필수 스케줄 블록(site, heading, roster, grid, reschedule)이 누락되었습니다.");
  }

  const siteNameCell = `${toColumnLetter(siteRange.startCol + 1)}${siteRange.startRow}`;
  const monthTitleCell = `${toColumnLetter(headingRange.startCol + 21)}${headingRange.startRow}`;
  const rosterSummaryCell = `${toColumnLetter(rosterRange.startCol)}${rosterRange.startRow}`;
  const monthAnchorCells = variant === "sample2" ? ["BG8", "BS8", "BS30"] : ["AY8", "BK8", "BK30"];

  const step = variant === "sample2" ? 10 : 6;
  const dateRows = [0, 1, 2, 3, 4, 5].map((i) => gridRange.startRow + 1 + i * step);
  const colOffsets = [1, 4, 7, 10, 13, 16, 19];

  const weekBlocks: SchedulePlanTemplateWeekBlock[] = dateRows.map((dateRow) => ({
    dateRow,
    daySlots: colOffsets.map((cOffset) => {
      const colNum = gridRange.startCol + cOffset;
      const block = createDayBlock(colNum);

      if (variant === "sample2") {
        return {
          dateAddress: `${block.left}${dateRow}`,
          dutyCellAddresses: {
            D: [`${block.left}${dateRow + 1}`, `${block.center}${dateRow + 1}`, `${block.right}${dateRow + 1}`],
            N: [`${block.center}${dateRow + 4}`],
            O: Array.from({ length: 5 }, (_, idx) => `${block.center}${dateRow + 5 + idx}`)
          }
        };
      }

      return {
        dateAddress: `${block.left}${dateRow}`,
        dutyCellAddresses: {
          D: [`${block.center}${dateRow + 1}`],
          E: [`${block.center}${dateRow + 2}`],
          N: [`${block.center}${dateRow + 3}`],
          O: [`${block.center}${dateRow + 4}`, `${block.center}${dateRow + 5}`]
        }
      };
    })
  }));

  const rescheduleDateCells = Array.from(
    { length: 31 },
    (_, idx) => `${toColumnLetter(rescheduleRange.startCol)}${rescheduleRange.startRow + 3 + idx}`
  );

  const resStartCol = rescheduleRange.startCol;
  if (variant === "sample2") {
    return {
      variant: "sample2",
      sheetName: worksheet.name,
      siteNameCell,
      monthTitleCell,
      rosterSummaryCell,
      monthAnchorCells,
      weekBlocks,
      rescheduleDateCells,
      supportedWorkingDutyCodes: ["D", "N"],
      regularPlanColumns: {
        D: Array.from({ length: 12 }, (_, i) => toColumnLetter(resStartCol + 1 + i)),
        N: [
          toColumnLetter(resStartCol + 13),
          toColumnLetter(resStartCol + 14),
          toColumnLetter(resStartCol + 15),
          toColumnLetter(resStartCol + 16)
        ]
      },
      changedPlanColumns: {
        D: Array.from({ length: 12 }, (_, i) => toColumnLetter(resStartCol + 17 + i)),
        N: [
          toColumnLetter(resStartCol + 29),
          toColumnLetter(resStartCol + 30),
          toColumnLetter(resStartCol + 31),
          toColumnLetter(resStartCol + 32)
        ]
      },
      changeReasonColumn: toColumnLetter(resStartCol + 33),
      changeReasonColumns: [toColumnLetter(resStartCol + 33), toColumnLetter(resStartCol + 34)]
    };
  }

  return {
    variant: "sample1",
    sheetName: worksheet.name,
    siteNameCell,
    monthTitleCell,
    rosterSummaryCell,
    monthAnchorCells,
    weekBlocks,
    rescheduleDateCells,
    supportedWorkingDutyCodes: ["D", "E", "N"],
    regularPlanColumns: {
      D: [
        toColumnLetter(resStartCol + 1),
        toColumnLetter(resStartCol + 2),
        toColumnLetter(resStartCol + 3),
        toColumnLetter(resStartCol + 4)
      ],
      E: [
        toColumnLetter(resStartCol + 5),
        toColumnLetter(resStartCol + 6),
        toColumnLetter(resStartCol + 7),
        toColumnLetter(resStartCol + 8)
      ],
      N: [
        toColumnLetter(resStartCol + 9),
        toColumnLetter(resStartCol + 10),
        toColumnLetter(resStartCol + 11),
        toColumnLetter(resStartCol + 12)
      ]
    },
    changedPlanColumns: {
      D: [
        toColumnLetter(resStartCol + 13),
        toColumnLetter(resStartCol + 14),
        toColumnLetter(resStartCol + 15),
        toColumnLetter(resStartCol + 16)
      ],
      E: [
        toColumnLetter(resStartCol + 17),
        toColumnLetter(resStartCol + 18),
        toColumnLetter(resStartCol + 19),
        toColumnLetter(resStartCol + 20)
      ],
      N: [
        toColumnLetter(resStartCol + 21),
        toColumnLetter(resStartCol + 22),
        toColumnLetter(resStartCol + 23),
        toColumnLetter(resStartCol + 24)
      ]
    },
    changeReasonColumn: toColumnLetter(resStartCol + 25),
    changeReasonColumns: [toColumnLetter(resStartCol + 25), toColumnLetter(resStartCol + 26)]
  };
};

export const assertScheduleWorkbookProtectedStructure = (
  workbook: ExcelJS.Workbook,
  definition: DocumentLayoutDefinition
) => {
  const layoutKey = formatDocumentLayoutStorageKey(definition) as "schedule-xlsx/template1" | "schedule-xlsx/template2";
  const refWorkbook = createBuiltInExcelWorkbook(layoutKey);
  const refWorksheet = refWorkbook.getWorksheet("교대 근무 계획표") ?? refWorkbook.worksheets[0];
  applyDocumentLayoutToWorksheet({ worksheet: refWorksheet, definition });

  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("보호 구조 검증 실패: 교대 근무 계획표 워크시트를 찾을 수 없습니다.");
  }

  const { targetRanges } = computeDocumentLayoutActualBlockRanges(definition);
  const gridRange = targetRanges.get("schedule.calendar-grid");
  const rescheduleRange = targetRanges.get("schedule.reschedule");
  const substituteRange = targetRanges.get("schedule.substitute");
  const overtimeRange = targetRanges.get("schedule.overtime");

  if (!gridRange || !rescheduleRange || !substituteRange || !overtimeRange) {
    throw new Error("보호 구조 검증 실패: 레이아웃 정의에 필수 판독 블록이 누락되었습니다.");
  }

  const variant = definition.variant === "template2" ? "sample2" : "sample1";

  // 1. DATE 표식 검사
  const step = variant === "sample2" ? 10 : 6;
  const dateRows = [0, 1, 2, 3, 4, 5].map((i) => gridRange.startRow + 1 + i * step);
  for (const dateRow of dateRows) {
    const actualDateText = normalizeCellText(worksheet.getCell(dateRow, gridRange.startCol).value);
    if (actualDateText !== "DATE") {
      throw new Error(`보호 구조 검증 실패: DATE 표식이 일치하지 않거나 변조되었습니다 (행: ${dateRow}).`);
    }
  }

  // 2. 변경 사유 머리글 검사
  const reasonCol = rescheduleRange.startCol + (variant === "sample2" ? 33 : 25);
  const reasonText = normalizeCellText(worksheet.getCell(rescheduleRange.startRow, reasonCol).value);
  if (reasonText !== "변경 사유") {
    throw new Error("보호 구조 검증 실패: 변경 사유 머리글이 일치하지 않거나 변조되었습니다.");
  }

  // 3. 대체 및 연장 표 정적 머리글 검증
  const checkStaticHeaders = (range: { startCol: number; startRow: number; endCol: number }, headerRows: number) => {
    for (let r = range.startRow; r < range.startRow + headerRows; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const refVal = normalizeCellText(refWorksheet.getCell(r, c).value);
        if (refVal.length > 0) {
          const actualVal = normalizeCellText(worksheet.getCell(r, c).value);
          if (actualVal !== refVal) {
            throw new Error(`보호 구조 검증 실패: 정적 표 머리글이 변조되었습니다 (셀: ${toColumnLetter(c)}${r}).`);
          }
        }
      }
    }
  };
  checkStaticHeaders(substituteRange, 2);
  checkStaticHeaders(overtimeRange, 3);

  // 4. 보호된 병합(Merge) 범위 검증
  const criticalBlocks = [
    targetRanges.get("schedule.site")!,
    targetRanges.get("schedule.calendar-heading")!,
    targetRanges.get("schedule.roster")!,
    gridRange,
    rescheduleRange,
    substituteRange,
    overtimeRange
  ].filter(Boolean);

  const intersectsCriticalBlock = (rangeStr: string) => {
    const parsed = parseRangeString(rangeStr);
    if (!parsed) return false;
    return criticalBlocks.some(
      (b) =>
        !(
          parsed.endCol < b.startCol ||
          parsed.startCol > b.endCol ||
          parsed.endRow < b.startRow ||
          parsed.startRow > b.endRow
        )
    );
  };

  const getNormalizedMerges = (ws: ExcelJS.Worksheet): Set<string> => {
    const rawMerges = (ws.model as { merges?: string[] })?.merges ?? [];
    const set = new Set<string>();
    for (const m of rawMerges) {
      if (intersectsCriticalBlock(m)) {
        const parsed = parseRangeString(m);
        if (parsed) {
          set.add(
            `${toColumnLetter(parsed.startCol)}${parsed.startRow}:${toColumnLetter(parsed.endCol)}${parsed.endRow}`
          );
        }
      }
    }
    return set;
  };

  const refMerges = getNormalizedMerges(refWorksheet);
  const actualMerges = getNormalizedMerges(worksheet);

  if (refMerges.size !== actualMerges.size) {
    throw new Error("보호 구조 검증 실패: 보호된 병합 범위가 일치하지 않거나 변조되었습니다.");
  }
  for (const m of refMerges) {
    if (!actualMerges.has(m)) {
      throw new Error(`보호 구조 검증 실패: 보호된 병합 범위가 일치하지 않거나 변조되었습니다 (${m}).`);
    }
  }

  // 5. 보호된 행 높이 검사
  for (const b of criticalBlocks) {
    for (let r = b.startRow; r <= b.endRow; r++) {
      const refHeight = refWorksheet.getRow(r).height;
      if (refHeight !== undefined && refHeight > 0) {
        const actualHeight = worksheet.getRow(r).height;
        if (actualHeight === undefined || Math.abs(actualHeight - refHeight) > 0.5) {
          throw new Error(`보호 구조 검증 실패: 보호된 행 높이가 변조되었습니다 (행: ${r}).`);
        }
      }
    }
  }
};
