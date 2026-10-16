import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const detail = args.includes("--detail");
const filteredArgs = args.filter((arg) => arg !== "--detail");
const repo = path.resolve(filteredArgs.shift() ?? "C:/Projects/Active/ShiftMgmt_V4");
const files = filteredArgs.length > 0 ? filteredArgs : [
  "근무표_템플릿1.xlsx",
  "근무표_템플릿2.xlsx",
  "품의서_2026-04_수정본.xlsx",
  "별첨1_2026-04_수정본.xlsx",
  "별첨2_샘플.xlsx"
];

const requireFromRepo = createRequire(pathToFileURL(path.join(repo, "package.json")));
const ExcelJS = requireFromRepo("exceljs");

const clean = (value, seen = new WeakSet()) => {
  if (value === undefined || value === null || value === "") return undefined;
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
      const next = clean(value[key], seen);
      if (next !== undefined && next !== false) result[key] = next;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value;
};

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(clean(value) ?? {})).digest("hex").slice(0, 12);

const serializeCellValue = (cell) => {
  const value = cell.value;
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) return { date: value.toISOString() };
  if (typeof value !== "object") return value;
  if (value.formula !== undefined) return { formula: value.formula, result: clean(value.result) };
  if (value.sharedFormula !== undefined) return { sharedFormula: value.sharedFormula, result: clean(value.result) };
  if (value.richText !== undefined) return { richText: value.richText.map((entry) => ({ text: entry.text, font: clean(entry.font) })) };
  if (value.text !== undefined && value.hyperlink !== undefined) return { text: value.text, hyperlink: value.hyperlink };
  return clean(value);
};

const styleDefinition = (cell) => clean({
  font: cell.font,
  fill: cell.fill,
  border: cell.border,
  alignment: cell.alignment,
  numFmt: cell.numFmt,
  protection: cell.protection
}) ?? {};

const toColumnName = (column) => {
  let current = column;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
};

const compressRowRuns = (entries) => {
  const byRow = new Map();
  for (const { row, column } of entries) {
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(column);
  }
  const ranges = [];
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const columns = [...new Set(byRow.get(row))].sort((a, b) => a - b);
    let start = columns[0];
    let end = columns[0];
    for (const column of columns.slice(1)) {
      if (column === end + 1) {
        end = column;
        continue;
      }
      ranges.push(start === end ? `${toColumnName(start)}${row}` : `${toColumnName(start)}${row}:${toColumnName(end)}${row}`);
      start = column;
      end = column;
    }
    ranges.push(start === end ? `${toColumnName(start)}${row}` : `${toColumnName(start)}${row}:${toColumnName(end)}${row}`);
  }
  return ranges;
};

const summarizeWorksheet = (worksheet) => {
  const cells = [];
  const styleGroups = new Map();
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const cell = worksheet.getCell(row, column);
      const value = cell.isMerged && cell.master.address !== cell.address
        ? undefined
        : serializeCellValue(cell);
      if (value === undefined && !cell.hasStyle) continue;
      const style = styleDefinition(cell);
      const styleKey = hash(style);
      if (!styleGroups.has(styleKey)) styleGroups.set(styleKey, { definition: style, cells: [] });
      styleGroups.get(styleKey).cells.push({ row, column });
      if (value !== undefined) {
        cells.push({ address: cell.address, value, style: styleKey });
      }
    }
  }

  const columns = [];
  for (let index = 1; index <= worksheet.columnCount; index += 1) {
    const column = worksheet.getColumn(index);
    const attributes = clean({
      width: column.width,
      hidden: column.hidden,
      outlineLevel: column.outlineLevel || undefined
    });
    if (attributes) columns.push({ index, letter: toColumnName(index), ...attributes });
  }

  const rows = [];
  for (let index = 1; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const attributes = clean({
      height: row.height,
      hidden: row.hidden,
      outlineLevel: row.outlineLevel || undefined
    });
    if (attributes) rows.push({ index, ...attributes });
  }

  const styles = [...styleGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, group]) => ({
      id,
      count: group.cells.length,
      ranges: compressRowRuns(group.cells),
      definition: group.definition
    }));

  const serializePoint = (point) => clean({
    nativeCol: point?.nativeCol,
    nativeColOff: point?.nativeColOff,
    nativeRow: point?.nativeRow,
    nativeRowOff: point?.nativeRowOff
  });
  const images = typeof worksheet.getImages === "function"
    ? worksheet.getImages().map((image) => clean({
      imageId: image.imageId,
      editAs: image.range?.editAs,
      tl: serializePoint(image.range?.tl),
      br: serializePoint(image.range?.br)
    }))
    : [];

  return clean({
    name: worksheet.name,
    state: worksheet.state,
    dimensions: { rows: worksheet.rowCount, columns: worksheet.columnCount },
    merges: [...(worksheet.model.merges ?? [])].sort(),
    columns,
    rows,
    properties: worksheet.properties,
    views: worksheet.views,
    pageSetup: worksheet.pageSetup,
    pageMargins: worksheet.pageMargins,
    headerFooter: worksheet.headerFooter,
    images,
    cells,
    styles: detail ? styles : styles.map(({ id, count, ranges }) => ({ id, count, ranges }))
  });
};

const results = [];
for (const file of files) {
  const filePath = path.isAbsolute(file) ? file : path.join(repo, "양식샘플", file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const media = (workbook.media ?? []).map((item, index) => clean({
    index,
    type: item.type,
    extension: item.extension,
    name: item.name,
    bytes: item.buffer?.length,
    sha256: item.buffer ? crypto.createHash("sha256").update(item.buffer).digest("hex") : undefined
  }));
  results.push({
    file: path.basename(filePath),
    path: filePath,
    worksheets: workbook.worksheets.map(summarizeWorksheet),
    definedNames: clean(workbook.definedNames?.model),
    media
  });
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
