import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { DocumentLayoutDefinition, DocumentLayoutKey } from "../../shared/domain/document-layout";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";

const columnName = (value: number): string => {
  let name = "";
  while (value > 0) {
    const digit = (value - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

export const applyDocumentLayoutPrintSetup = (input: {
  worksheet: ExcelJS.Worksheet;
  key?: DocumentLayoutKey;
  definition?: DocumentLayoutDefinition;
  orientation?: "portrait" | "landscape";
}): void => {
  const { worksheet } = input;
  const documentKind = input.definition?.documentKind ?? input.key?.documentKind;
  if (documentKind !== "proposal-xlsx" && documentKind !== "attachment1-xlsx" && documentKind !== "attachment2-xlsx") return;
  const definition = input.definition ?? (input.key ? getDefaultDocumentLayoutDefinition(input.key) : undefined);
  const member = definition?.outputs[0];
  if (definition && (!member || member.canvas.unit !== "cell")) {
    throw new Error("Excel 문서의 인쇄 영역을 확인할 수 없습니다.");
  }
  const blocks = member?.blocks.filter(block => block.visible) ?? [];
  const values: Array<{ row: number; column: number }> = [];
  worksheet.eachRow(row => row.eachCell(cell => {
    if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
      values.push({ row: Number(cell.row), column: Number(cell.col) });
    }
  }));
  let lastColumn = Math.max(1, worksheet.columnCount, ...blocks.map(block => block.x + block.width));
  for (const image of worksheet.getImages()) {
    const range = image.range as unknown as {
      tl: { col?: number; row?: number; nativeCol?: number; nativeRow?: number };
      br?: { col?: number; row?: number; nativeCol?: number; nativeRow?: number };
      ext?: { width: number; height: number };
    };
    const left = range.tl.col ?? range.tl.nativeCol ?? 0, top = range.tl.row ?? range.tl.nativeRow ?? 0;
    let endColumn = Math.ceil(range.br?.col ?? range.br?.nativeCol ?? left + 1);
    let endRow = Math.ceil(range.br?.row ?? range.br?.nativeRow ?? top + 1);
    if (range.ext) {
      const columnPixels = (column: number) => {
        const item = worksheet.columns?.[column - 1];
        return item?.hidden ? 0 : Math.max(1, Math.floor((item?.width ?? worksheet.properties.defaultColWidth ?? 8.43) * 7 + 5));
      };
      const rowPixels = (row: number) => {
        const item = worksheet.findRow(row);
        return item?.hidden ? 0 : (item?.height ?? worksheet.properties.defaultRowHeight ?? 15) * 96 / 72;
      };
      endColumn = Math.floor(left) + 1;
      let width = range.ext.width + (left % 1) * columnPixels(endColumn);
      while (width > 0 && endColumn <= 16384) { width -= columnPixels(endColumn); if (width > 0) endColumn++; }
      endRow = Math.floor(top) + 1;
      let height = range.ext.height + (top % 1) * rowPixels(endRow);
      while (height > 0 && endRow <= 1048576) { height -= rowPixels(endRow); if (height > 0) endRow++; }
    }
    lastColumn = Math.max(lastColumn, endColumn);
    values.push({ row: endRow, column: endColumn });
  }
  // Unused preformatted table rows are not additional data pages. Actual extra rows still extend the area.
  let endRow = 1;
  for (const value of values) endRow = Math.max(endRow, value.row);
  for (const block of blocks) {
    if (block.kind !== "table") endRow = Math.max(endRow, block.y + block.height);
  }
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    paperSize: 9,
    orientation: input.orientation ?? (documentKind === "attachment1-xlsx" ? "landscape" : "portrait"),
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${columnName(lastColumn)}${endRow}`,
    margins: {
      top: 10 / 25.4, right: 10 / 25.4, bottom: 10 / 25.4, left: 10 / 25.4,
      header: worksheet.pageSetup.margins?.header ?? 0.3,
      footer: worksheet.pageSetup.margins?.footer ?? 0.3
    }
  };
};

const cloneWorkbookModel = <T>(value: T): T => {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(item => cloneWorkbookModel(item)) as T;
  if (value && typeof value === "object") {
    return Object.assign(Object.create(Object.getPrototypeOf(value)),
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneWorkbookModel(item)])));
  }
  return value;
};

export const writeDocumentWorkbook = async (workbook: ExcelJS.Workbook, outputPath: string): Promise<void> => {
  const model = cloneWorkbookModel(workbook.model);
  // Serialize a clone so the original workbook's cells, widths and metadata remain intact.
  const writer = new ExcelJS.Workbook();
  Object.defineProperty(writer, "model", { get: () => model });
  const generated = Buffer.from(await writer.xlsx.writeBuffer());
  // Reuse ExcelJS's existing ZIP dependency; no package or vendor-file changes are needed.
  const Zip = createRequire(require.resolve("exceljs/package.json"))("jszip") as typeof import("jszip");
  const zip = await Zip.loadAsync(generated);
  let reordered = false;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const xml = await entry.async("string");
    const corrected = xml.replace(/(<pageSetUpPr\b[^>]*\/>)(<outlinePr\b[^>]*\/>)/g, "$2$1");
    if (corrected !== xml) { zip.file(name, corrected); reordered = true; }
  }
  await writeFile(outputPath, reordered ? await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : generated);
};
