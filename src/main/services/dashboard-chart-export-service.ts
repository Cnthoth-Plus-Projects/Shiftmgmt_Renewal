import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import {
  APP_DEFAULT_VERSION,
  APP_DISPLAY_NAME,
  buildAppDisplayTitle
} from "../../shared/config/app-brand";
import type {
  BridgeResult,
  DashboardChartExportColumn,
  DashboardChartExportInput,
  DashboardChartExportRecord,
  DashboardReportExportInput,
  DashboardReportExportRecord
} from "../../shared/bridge/contracts";
import type {
  DocumentLayoutBlock,
  DocumentLayoutDefinition
} from "../../shared/domain/document-layout";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";
import { resolveDocumentLayoutOutputFilePath } from "./document-layout-excel-render-service";
import { getDocumentLayout } from "./document-layout-storage-service";
import {
  commitPdfBytesAtomically,
  renderHtmlToPdfBytes
} from "./installed-chrome-pdf-service";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const trimSheetName = (value: string) =>
  value.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Dashboard";
const dashboardWorkbookCreator = buildAppDisplayTitle(APP_DEFAULT_VERSION);
const dashboardWorkbookModifier = `${APP_DISPLAY_NAME} 대시보드 내보내기`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const validateChartImageDataUrl = (dataUrl?: string): void => {
  if (!dataUrl) {
    return;
  }

  if (/[\s\r\n]/.test(dataUrl)) {
    throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
  }

  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
  }

  const [, mimeSubtype, base64Data] = match;

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) || base64Data.length % 4 !== 0) {
    throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
  }

  if (buffer.toString("base64") !== base64Data) {
    throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
  }

  if (mimeSubtype === "png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length < 8 || !pngSignature.every((byte, idx) => buffer[idx] === byte)) {
      throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
    }
  } else {
    if (
      buffer.length < 4 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[buffer.length - 2] !== 0xff ||
      buffer[buffer.length - 1] !== 0xd9
    ) {
      throw new Error("차트 이미지 형식이 올바르지 않습니다. PNG 또는 JPEG 이미지를 사용해 주세요.");
    }
  }
};

const resolveUniqueOutputPath = (directoryPath: string, fileName: string) => {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let currentPath = path.resolve(directoryPath, fileName);
  let duplicateIndex = 1;

  while (existsSync(currentPath)) {
    currentPath = path.resolve(
      directoryPath,
      `${baseName}_dup${String(duplicateIndex).padStart(2, "0")}${extension}`
    );
    duplicateIndex += 1;
  }

  return currentPath;
};

const resolveOutputPath = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  outputPath?: string;
  outputDir?: string;
  name: string;
  timestamp: string;
  outputFormat: "xlsx" | "pdf";
}) => {
  const fallbackOutputDir =
    input.outputDir ??
    path.resolve(
      getStoredAppSettingsSnapshot({
        userDataPath: input.userDataPath,
        env: input.env
      }).scheduleExportDir,
      "dashboard-exports"
    );

  if (input.outputPath) {
    const targetPath = path.resolve(input.outputPath);
    const expectedExtension = `.${input.outputFormat}`;
    const normalizedTarget =
      path.extname(targetPath).toLowerCase() === expectedExtension
        ? targetPath
        : path.resolve(`${targetPath}${expectedExtension}`);

    if (existsSync(normalizedTarget)) {
      return resolveUniqueOutputPath(path.dirname(normalizedTarget), path.basename(normalizedTarget));
    }
    return normalizedTarget;
  }

  if (input.outputFormat === "pdf") {
    const layoutSnapshot = getDocumentLayout({ documentKind: "dashboard-report-pdf" });
    const pattern =
      layoutSnapshot.definition.outputs[0]?.outputFileNamePattern ?? "{name}_{timestamp}.pdf";
    return resolveDocumentLayoutOutputFilePath(fallbackOutputDir, pattern, {
      name: input.name,
      timestamp: input.timestamp
    });
  }

  const defaultFileName = `${input.name}_${input.timestamp}.xlsx`;
  return resolveUniqueOutputPath(fallbackOutputDir, defaultFileName);
};

const getCellNumberFormat = (format?: DashboardChartExportColumn["format"]) => {
  switch (format) {
    case "currency":
    case "number":
      return "#,##0";
    case "percent":
      return "0.0";
    default:
      return undefined;
  }
};

const getCurrencyTotalAmount = (input: {
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportInput["rows"];
}) => {
  const totalColumn =
    input.columns.find((column) => column.key === "totalAmount" && column.format === "currency") ??
    null;
  const targetColumns = totalColumn
    ? [totalColumn]
    : input.columns.filter((column) => column.format === "currency");

  if (targetColumns.length === 0) {
    return null;
  }

  return input.rows.reduce((sum, row) => {
    return (
      sum +
      targetColumns.reduce((columnSum, column) => {
        const rawValue = row[column.key];
        const numericValue =
          typeof rawValue === "number"
            ? rawValue
            : typeof rawValue === "string"
              ? Number(rawValue.replaceAll(",", ""))
              : 0;

        return columnSum + (Number.isFinite(numericValue) ? numericValue : 0);
      }, 0)
    );
  }, 0);
};

const setWorksheetColumns = (
  worksheet: ExcelJS.Worksheet,
  input: Pick<DashboardChartExportInput, "columns" | "rows">
) => {
  input.columns.forEach((column, index) => {
    const values = input.rows.map((row) => row[column.key]);
    const maxLength = Math.max(
      column.header.length,
      ...values.map((value) => String(value ?? "").length)
    );

    worksheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 4, 12), 26);
    const numberFormat = getCellNumberFormat(column.format);

    if (!numberFormat) {
      return;
    }

    worksheet.getColumn(index + 1).numFmt = numberFormat;
  });
};

const formatCellValue = (
  value: string | number | null,
  format?: DashboardChartExportColumn["format"]
) => {
  if (value === null || value === "") {
    return "-";
  }

  if (format === "currency") {
    return `₩${Math.round(Number(value)).toLocaleString("ko-KR")}`;
  }

  if (format === "percent") {
    return `${Number(value).toLocaleString("ko-KR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    })}%`;
  }

  if (format === "number") {
    return Number(value).toLocaleString("ko-KR");
  }

  return String(value);
};

const resolveImageExtension = (dataUrl: string) =>
  dataUrl.startsWith("data:image/jpeg") ? "jpeg" : "png";

const addChartImageToWorksheet = (input: {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  chartImageDataUrl?: string;
  startRow: number;
}) => {
  if (!input.chartImageDataUrl) {
    return input.startRow;
  }

  const imageWidth = 860;
  const imageHeight = 300;
  const imageId = input.workbook.addImage({
    base64: input.chartImageDataUrl,
    extension: resolveImageExtension(input.chartImageDataUrl)
  });

  input.worksheet.addImage(imageId, {
    tl: { col: 0, row: input.startRow - 1 },
    ext: { width: imageWidth, height: imageHeight }
  });

  return input.startRow + Math.ceil(imageHeight / 20) + 2;
};

const appendDataTableToWorksheet = (input: {
  worksheet: ExcelJS.Worksheet;
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportInput["rows"];
  headerRowNumber: number;
}) => {
  input.worksheet.getRow(input.headerRowNumber).values = input.columns.map((column) => column.header);
  input.worksheet.getRow(input.headerRowNumber).font = {
    name: "Pretendard",
    bold: true,
    color: { argb: "FF1B2D45" }
  };
  input.worksheet.getRow(input.headerRowNumber).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF3F9" }
  };

  if (input.rows.length === 0) {
    input.worksheet.getCell(`A${input.headerRowNumber + 1}`).value = "표시할 데이터가 없습니다.";
    input.worksheet.mergeCells(
      input.headerRowNumber + 1,
      1,
      input.headerRowNumber + 1,
      Math.max(input.columns.length, 1)
    );
    input.worksheet.getCell(`A${input.headerRowNumber + 1}`).font = {
      name: "Pretendard",
      italic: true,
      color: { argb: "FF6C7A8F" }
    };
    return;
  }

  input.rows.forEach((row, rowIndex) => {
    const rowNumber = input.headerRowNumber + 1 + rowIndex;
    input.worksheet.getRow(rowNumber).values = input.columns.map((column) => row[column.key] ?? "");
  });

  input.worksheet.views = [
    {
      state: "frozen",
      ySplit: input.headerRowNumber
    }
  ];
  input.worksheet.autoFilter = {
    from: { row: input.headerRowNumber, column: 1 },
    to: { row: input.headerRowNumber, column: input.columns.length }
  };
};

const createMetadataRows = (
  filters: DashboardChartExportInput["filters"] | DashboardReportExportInput["filters"],
  exportedAt: string
): Array<[string, string]> => {
  const rows: Array<[string, string]> = [
    ["내보내기 시각", exportedAt],
    ["조회 연도", filters.year],
    ["조회 월", filters.month]
  ];

  if (filters.periodLabel) {
    rows.push(["조회 기간", filters.periodLabel]);
  }

  rows.push(
    ["근무지", filters.siteName],
    ["이름", filters.employeeName],
    ["데이터 기준", filters.dataSource]
  );

  return rows;
};

const writeSectionSummaryRow = (input: {
  worksheet: ExcelJS.Worksheet;
  rowNumber: number;
  rowCount: number;
  totalAmount: number | null;
}) => {
  input.worksheet.getCell(`A${input.rowNumber}`).value = "산출 행 수";
  input.worksheet.getCell(`B${input.rowNumber}`).value = input.rowCount;
  input.worksheet.getCell(`C${input.rowNumber}`).value = "총액(원)";
  input.worksheet.getCell(`D${input.rowNumber}`).value =
    input.totalAmount === null ? "-" : input.totalAmount;

  ["A", "C"].forEach((column) => {
    input.worksheet.getCell(`${column}${input.rowNumber}`).font = {
      name: "Pretendard",
      bold: true,
      color: { argb: "FF526175" }
    };
  });
  input.worksheet.getCell(`D${input.rowNumber}`).numFmt = "#,##0";
};

const writeSheetHeader = (input: {
  worksheet: ExcelJS.Worksheet;
  title: string;
  metadataRows: Array<[string, string]>;
  mergeToColumnCount: number;
}) => {
  input.worksheet.mergeCells(1, 1, 1, Math.max(input.mergeToColumnCount, 2));
  input.worksheet.getCell("A1").value = input.title;
  input.worksheet.getCell("A1").font = {
    name: "Pretendard",
    size: 15,
    bold: true,
    color: { argb: "FF1B2D45" }
  };
  input.worksheet.getCell("A1").alignment = {
    vertical: "middle"
  };

  input.metadataRows.forEach(([label, value], index) => {
    const rowNumber = index + 2;
    input.worksheet.getCell(`A${rowNumber}`).value = label;
    input.worksheet.getCell(`B${rowNumber}`).value = value;
    input.worksheet.getCell(`A${rowNumber}`).font = {
      name: "Pretendard",
      bold: true,
      color: { argb: "FF526175" }
    };
  });
};

const writeChartWorkbook = async (input: {
  chart: DashboardChartExportInput;
  outputPath: string;
  exportedAt: string;
}) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(trimSheetName(input.chart.sheetName));
  const metadataRows = createMetadataRows(input.chart.filters, input.exportedAt);

  mkdirSync(path.dirname(input.outputPath), { recursive: true });
  workbook.creator = dashboardWorkbookCreator;
  workbook.lastModifiedBy = dashboardWorkbookModifier;
  workbook.created = new Date();
  workbook.modified = new Date();

  writeSheetHeader({
    worksheet,
    title: input.chart.chartTitle,
    metadataRows,
    mergeToColumnCount: input.chart.columns.length
  });
  writeSectionSummaryRow({
    worksheet,
    rowNumber: metadataRows.length + 2,
    rowCount: input.chart.rows.length,
    totalAmount: getCurrencyTotalAmount(input.chart)
  });
  const headerRowNumber = addChartImageToWorksheet({
    workbook,
    worksheet,
    chartImageDataUrl: input.chart.chartImageDataUrl,
    startRow: metadataRows.length + 4
  });

  appendDataTableToWorksheet({
    worksheet,
    columns: input.chart.columns,
    rows: input.chart.rows,
    headerRowNumber
  });
  setWorksheetColumns(worksheet, input.chart);

  await workbook.xlsx.writeFile(input.outputPath);
};

const writeReportWorkbook = async (input: {
  report: DashboardReportExportInput;
  outputPath: string;
  exportedAt: string;
}) => {
  const workbook = new ExcelJS.Workbook();
  const overviewSheet = workbook.addWorksheet("대시보드");
  const metadataRows = createMetadataRows(input.report.filters, input.exportedAt);

  mkdirSync(path.dirname(input.outputPath), { recursive: true });
  workbook.creator = dashboardWorkbookCreator;
  workbook.lastModifiedBy = dashboardWorkbookModifier;
  workbook.created = new Date();
  workbook.modified = new Date();

  writeSheetHeader({
    worksheet: overviewSheet,
    title: input.report.title,
    metadataRows,
    mergeToColumnCount: 4
  });
  overviewSheet.getCell("A9").value = "포함 섹션";
  overviewSheet.getCell("B9").value = "행 수";
  overviewSheet.getCell("C9").value = "총액(원)";
  overviewSheet.getRow(9).font = {
    name: "Pretendard",
    bold: true,
    color: { argb: "FF1B2D45" }
  };
  overviewSheet.getRow(9).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF3F9" }
  };

  input.report.sections.forEach((section, index) => {
    const rowNumber = 10 + index;
    overviewSheet.getCell(`A${rowNumber}`).value = section.chartTitle;
    overviewSheet.getCell(`B${rowNumber}`).value = section.rows.length;
    overviewSheet.getCell(`C${rowNumber}`).value = getCurrencyTotalAmount(section) ?? "-";
  });
  overviewSheet.getColumn(3).numFmt = "#,##0";

  input.report.sections.forEach((section) => {
    const worksheet = workbook.addWorksheet(trimSheetName(section.sheetName));
    writeSheetHeader({
      worksheet,
      title: section.chartTitle,
      metadataRows,
      mergeToColumnCount: section.columns.length
    });
    writeSectionSummaryRow({
      worksheet,
      rowNumber: metadataRows.length + 2,
      rowCount: section.rows.length,
      totalAmount: getCurrencyTotalAmount(section)
    });
    const headerRowNumber = addChartImageToWorksheet({
      workbook,
      worksheet,
      chartImageDataUrl: section.chartImageDataUrl,
      startRow: metadataRows.length + 4
    });

    appendDataTableToWorksheet({
      worksheet,
      columns: section.columns,
      rows: section.rows,
      headerRowNumber
    });
    setWorksheetColumns(worksheet, {
      columns: section.columns,
      rows: section.rows
    });
  });

  await workbook.xlsx.writeFile(input.outputPath);
};

const renderMetadataHtml = (
  filters: DashboardChartExportInput["filters"] | DashboardReportExportInput["filters"],
  exportedAt: string
) =>
  `
    <div class="meta-grid">
      <div><strong>내보내기 시각</strong><span>${escapeHtml(exportedAt)}</span></div>
      <div><strong>조회 연도</strong><span>${escapeHtml(filters.year)}</span></div>
      <div><strong>조회 월</strong><span>${escapeHtml(filters.month)}</span></div>
      ${
        filters.periodLabel
          ? `<div><strong>조회 기간</strong><span>${escapeHtml(filters.periodLabel)}</span></div>`
          : ""
      }
      <div><strong>근무지</strong><span>${escapeHtml(filters.siteName)}</span></div>
      <div><strong>이름</strong><span>${escapeHtml(filters.employeeName)}</span></div>
      <div><strong>데이터 기준</strong><span>${escapeHtml(filters.dataSource)}</span></div>
    </div>
  `;

const renderSectionSummaryHtml = (input: {
  rowCount: number;
  totalAmount: number | null;
}) => `
  <div class="section-summary">
    <div><strong>산출 행 수</strong><span>${escapeHtml(String(input.rowCount))}</span></div>
    <div><strong>총액(원)</strong><span>${escapeHtml(
      input.totalAmount === null ? "-" : formatCellValue(input.totalAmount, "currency")
    )}</span></div>
  </div>
`;

const buildDashboardColgroupHtml = (
  columnCount: number,
  columnWidths?: Record<string, number>
): string => {
  if (columnCount <= 0) {
    return "";
  }

  const weights: number[] = [];
  for (let col = 1; col <= columnCount; col++) {
    let key = "";
    let n = col;
    while (n > 0) {
      const rem = (n - 1) % 26;
      key = String.fromCharCode(65 + rem) + key;
      n = Math.floor((n - 1) / 26);
    }
    const weight = columnWidths?.[key] && columnWidths[key] > 0 ? columnWidths[key] : 1;
    weights.push(weight);
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    return "";
  }

  return `<colgroup>${weights
    .map((w) => `<col style="width: ${((w / totalWeight) * 100).toFixed(2)}%" />`)
    .join("")}</colgroup>`;
};

const renderTableHtml = (input: {
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportInput["rows"];
  colgroupHtml?: string;
}) => `
  <table>
    ${input.colgroupHtml ?? ""}
    <thead>
      <tr>${input.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${
        input.rows.length > 0
          ? input.rows
              .map(
                (row) => `
                  <tr>
                    ${input.columns
                      .map((column) => {
                        const value = formatCellValue(row[column.key] ?? null, column.format);
                        const cellClass =
                          column.format === "currency" ||
                          column.format === "number" ||
                          column.format === "percent"
                            ? ' class="number"'
                            : "";

                        return `<td${cellClass}>${escapeHtml(value)}</td>`;
                      })
                      .join("")}
                  </tr>
                `
              )
              .join("")
          : `<tr><td colspan="${Math.max(input.columns.length, 1)}">표시할 데이터가 없습니다.</td></tr>`
      }
    </tbody>
  </table>
`;

interface BlockDelta {
  visible: boolean;
  wrapperStyle: string;
  fontStyle: string;
  customText?: string;
  columnWidths?: Record<string, number>;
}

const sanitizeCssFontFamily = (family?: string): string => {
  if (!family) {
    return "";
  }
  if (/["';\\<>()=\u0000-\u001f\u007f-\u009f]/.test(family)) {
    return "";
  }
  const cleaned = family.trim();
  return cleaned ? `"${cleaned}"` : "";
};

const computeDashboardBlockDelta = (
  activeBlock: DocumentLayoutBlock | undefined,
  baseBlock: DocumentLayoutBlock
): BlockDelta => {
  if (!activeBlock) {
    return {
      visible: baseBlock.visible,
      wrapperStyle: "",
      fontStyle: "",
      columnWidths: baseBlock.columnWidths
    };
  }

  if (activeBlock.visible === false) {
    return {
      visible: false,
      wrapperStyle: "",
      fontStyle: "",
      columnWidths: activeBlock.columnWidths
    };
  }

  const styles: string[] = [];
  if (activeBlock.x !== baseBlock.x) {
    styles.push(`margin-left: ${activeBlock.x - baseBlock.x}mm`);
  }
  if (activeBlock.y !== baseBlock.y) {
    styles.push(`margin-top: ${activeBlock.y - baseBlock.y}mm`);
  }
  if (activeBlock.width !== baseBlock.width) {
    styles.push(`width: ${activeBlock.width}mm`, `max-width: ${activeBlock.width}mm`);
  }
  if (activeBlock.height !== baseBlock.height) {
    styles.push(`min-height: ${activeBlock.height}mm`);
  }

  const fontStyles: string[] = [];
  if (activeBlock.font) {
    if (activeBlock.font.family && activeBlock.font.family !== baseBlock.font?.family) {
      const sanitizedFamily = sanitizeCssFontFamily(activeBlock.font.family);
      if (sanitizedFamily) {
        fontStyles.push(`font-family: ${sanitizedFamily}, sans-serif`);
      }
    }
    if (activeBlock.font.sizePt && activeBlock.font.sizePt !== baseBlock.font?.sizePt) {
      fontStyles.push(`font-size: ${activeBlock.font.sizePt}pt`);
    }
    if (activeBlock.font.bold !== undefined && activeBlock.font.bold !== baseBlock.font?.bold) {
      fontStyles.push(`font-weight: ${activeBlock.font.bold ? "bold" : "normal"}`);
    }
    if (activeBlock.font.italic !== undefined && activeBlock.font.italic !== baseBlock.font?.italic) {
      fontStyles.push(`font-style: ${activeBlock.font.italic ? "italic" : "normal"}`);
    }
    if (activeBlock.font.color && activeBlock.font.color !== baseBlock.font?.color) {
      fontStyles.push(`color: ${activeBlock.font.color}`);
    }
  }

  return {
    visible: true,
    wrapperStyle: styles.length > 0 ? styles.join("; ") + ";" : "",
    fontStyle: fontStyles.length > 0 ? fontStyles.join("; ") + ";" : "",
    customText: activeBlock.text !== undefined && activeBlock.text !== baseBlock.text ? activeBlock.text : undefined,
    columnWidths: activeBlock.columnWidths
  };
};

const formatBlockWrapperAttr = (blockId: string, delta: BlockDelta): string => {
  const styles: string[] = [];
  if (delta.wrapperStyle) {
    styles.push(delta.wrapperStyle);
  }
  if (delta.fontStyle) {
    styles.push(delta.fontStyle);
  }
  const styleAttr = styles.length > 0 ? ` style="${escapeHtml(styles.join(" "))}"` : "";
  return `data-layout-block-id="${escapeHtml(blockId)}"${styleAttr}`;
};

export const buildDashboardPdfHtml = (input: {
  title: string;
  exportedAt: string;
  filters: DashboardChartExportInput["filters"] | DashboardReportExportInput["filters"];
  sections: Array<{
    title: string;
    chartImageDataUrl?: string;
    columns: DashboardChartExportColumn[];
    rows: DashboardChartExportInput["rows"];
  }>;
  layoutDefinition?: DocumentLayoutDefinition;
}): string => {
  const defaultDefinition = getDefaultDocumentLayoutDefinition({
    documentKind: "dashboard-report-pdf"
  });
  const baseOutput = defaultDefinition.outputs[0];
  const activeOutput = input.layoutDefinition?.outputs[0] ?? baseOutput;

  const getDelta = (blockId: string) =>
    computeDashboardBlockDelta(
      activeOutput.blocks.find((b) => b.id === blockId),
      baseOutput.blocks.find((b) => b.id === blockId)!
    );

  const titleDelta = getDelta("dashboard.title");
  const metadataDelta = getDelta("dashboard.metadata");
  const summaryDelta = getDelta("dashboard.section-summary");
  const chartDelta = getDelta("dashboard.chart");
  const tableDelta = getDelta("dashboard.table");

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 12mm;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #1b2434;
        font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
        font-size: 11px;
        line-height: 1.5;
      }
      h1, h2, p, strong, span { margin: 0; }
      .page {
        display: grid;
        gap: 14px;
      }
      .page + .page {
        break-before: page;
        page-break-before: always;
      }
      .title {
        display: grid;
        gap: 8px;
      }
      .title h1 {
        font-size: 20px;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px 14px;
        padding: 12px 14px;
        border: 1px solid #d6deeb;
        border-radius: 14px;
        background: #f7f9fc;
      }
      .meta-grid div {
        display: grid;
        gap: 4px;
      }
      .meta-grid strong {
        color: #53627c;
        font-size: 10px;
      }
      .section-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .section-summary div {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid #dbe3ef;
        border-radius: 14px;
        background: #f8fbff;
      }
      .section-summary strong {
        color: #55657f;
        font-size: 10px;
      }
      .section-summary span {
        font-size: 15px;
        font-weight: 800;
      }
      .chart-frame {
        border: 1px solid #dbe3ef;
        border-radius: 16px;
        background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
        padding: 10px;
      }
      .chart-frame img {
        display: block;
        width: 100%;
        max-height: 320px;
        object-fit: contain;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th, td {
        border: 1px solid #d4dceb;
        padding: 6px 8px;
        vertical-align: middle;
      }
      th {
        background: #eef3fb;
        color: #2c457f;
        font-weight: 700;
      }
      .number {
        text-align: right;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    ${input.sections
      .map((section, index) => {
        const colgroupHtml = buildDashboardColgroupHtml(
          section.columns.length,
          tableDelta.columnWidths
        );

        const titleHtml =
          titleDelta.visible === false
            ? ""
            : `
            <div class="title" ${formatBlockWrapperAttr("dashboard.title", titleDelta)}>
              <h1>${escapeHtml(index === 0 ? input.title : section.title)}</h1>
              ${
                index === 0 && metadataDelta.visible !== false
                  ? `<div ${formatBlockWrapperAttr("dashboard.metadata", metadataDelta)}>${renderMetadataHtml(
                      input.filters,
                      input.exportedAt
                    )}</div>`
                  : ""
              }
            </div>`;

        const summaryHtml =
          summaryDelta.visible === false
            ? ""
            : `
            <div ${formatBlockWrapperAttr("dashboard.section-summary", summaryDelta)}>
              ${renderSectionSummaryHtml({
                rowCount: section.rows.length,
                totalAmount: getCurrencyTotalAmount(section)
              })}
            </div>`;

        const chartHtml =
          chartDelta.visible === false || !section.chartImageDataUrl
            ? ""
            : `
            <div class="chart-frame" ${formatBlockWrapperAttr("dashboard.chart", chartDelta)}><img alt="${escapeHtml(
                section.title
              )}" src="${section.chartImageDataUrl}" /></div>`;

        const tableHtml =
          tableDelta.visible === false
            ? ""
            : `
            <div ${formatBlockWrapperAttr("dashboard.table", tableDelta)}>
              ${renderTableHtml({
                columns: section.columns,
                rows: section.rows,
                colgroupHtml
              })}
            </div>`;

        return `
          <section class="page">
            ${titleHtml}
            ${index > 0 && titleDelta.visible !== false ? `<h2>${escapeHtml(section.title)}</h2>` : ""}
            ${summaryHtml}
            ${chartHtml}
            ${tableHtml}
          </section>
        `;
      })
      .join("")}
  </body>
</html>`;
};

export const exportDashboardChartData = async (
  input: DashboardChartExportInput,
  context: {
    userDataPath: string;
    outputPath?: string;
    outputDir?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<DashboardChartExportRecord>> => {
  try {
    if (input.columns.length === 0) {
      throw new Error("내보낼 차트 컬럼이 없습니다.");
    }

    validateChartImageDataUrl(input.chartImageDataUrl);

    const outputFormat = input.outputFormat ?? "xlsx";
    const exportedAt = new Date().toISOString();
    const timestamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const name = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(input.chartTitle)}`;

    const outputPath = resolveOutputPath({
      userDataPath: context.userDataPath,
      env: context.env,
      outputPath: context.outputPath,
      outputDir: context.outputDir,
      name,
      timestamp,
      outputFormat
    });

    if (outputFormat === "pdf") {
      const layoutSnapshot = getDocumentLayout({ documentKind: "dashboard-report-pdf" });
      const html = buildDashboardPdfHtml({
        title: input.chartTitle,
        exportedAt,
        filters: input.filters,
        sections: [
          {
            title: input.chartTitle,
            chartImageDataUrl: input.chartImageDataUrl,
            columns: input.columns,
            rows: input.rows
          }
        ],
        layoutDefinition: layoutSnapshot.definition
      });

      const pdfBytes = await renderHtmlToPdfBytes(html);
      await commitPdfBytesAtomically(outputPath, pdfBytes);
    } else {
      await writeChartWorkbook({
        chart: input,
        outputPath,
        exportedAt
      });
    }

    return {
      ok: true,
      data: {
        chartKey: input.chartKey,
        chartTitle: input.chartTitle,
        outputFileName: path.basename(outputPath),
        outputPath,
        rowCount: input.rows.length,
        exportedAt
      }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "DASHBOARD_CHART_EXPORT_FAILED",
      message: error instanceof Error ? error.message : "대시보드 차트 내보내기 중 오류가 발생했습니다."
    };
  }
};

export const exportDashboardReport = async (
  input: DashboardReportExportInput,
  context: {
    userDataPath: string;
    outputPath?: string;
    outputDir?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<DashboardReportExportRecord>> => {
  try {
    if (input.sections.length === 0) {
      throw new Error("내보낼 대시보드 섹션이 없습니다.");
    }

    for (const section of input.sections) {
      if (section.columns.length === 0) {
        throw new Error("내보낼 차트 컬럼이 없습니다.");
      }
      validateChartImageDataUrl(section.chartImageDataUrl);
    }

    const outputFormat = input.outputFormat ?? "xlsx";
    const exportedAt = new Date().toISOString();
    const timestamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const name = sanitizeFileSegment(input.title);

    const outputPath = resolveOutputPath({
      userDataPath: context.userDataPath,
      env: context.env,
      outputPath: context.outputPath,
      outputDir: context.outputDir,
      name,
      timestamp,
      outputFormat
    });

    if (outputFormat === "pdf") {
      const layoutSnapshot = getDocumentLayout({ documentKind: "dashboard-report-pdf" });
      const html = buildDashboardPdfHtml({
        title: input.title,
        exportedAt,
        filters: input.filters,
        sections: input.sections.map((section) => ({
          title: section.chartTitle,
          chartImageDataUrl: section.chartImageDataUrl,
          columns: section.columns,
          rows: section.rows
        })),
        layoutDefinition: layoutSnapshot.definition
      });

      const pdfBytes = await renderHtmlToPdfBytes(html);
      await commitPdfBytesAtomically(outputPath, pdfBytes);
    } else {
      await writeReportWorkbook({
        report: input,
        outputPath,
        exportedAt
      });
    }

    return {
      ok: true,
      data: {
        title: input.title,
        outputFileName: path.basename(outputPath),
        outputPath,
        sectionCount: input.sections.length,
        exportedAt
      }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "DASHBOARD_REPORT_EXPORT_FAILED",
      message: error instanceof Error ? error.message : "대시보드 전체 내보내기 중 오류가 발생했습니다."
    };
  }
};
