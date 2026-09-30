import crypto from "node:crypto";
import type ExcelJS from "exceljs";

export interface WorksheetSemanticSnapshotImage {
  type: string;
  tl?: { col?: number; row?: number };
  br?: { col?: number; row?: number };
  editAs?: string;
  mediaHash: string;
  mediaExtension: string;
  mediaKind: string;
  contentType: string;
}

export interface WorksheetSemanticSnapshot {
  name: string;
  actualRowCount: number;
  actualColumnCount: number;
  cells: Record<string, unknown>;
  merges: string[];
  rows: Record<number, { height?: number; hidden?: boolean; outlineLevel?: number }>;
  columns: Record<number, { width?: number; hidden?: boolean; outlineLevel?: number }>;
  properties?: unknown;
  pageSetup?: unknown;
  headerFooter?: unknown;
  views?: unknown;
  images: WorksheetSemanticSnapshotImage[];
}

export const extractWorksheetSemanticSnapshot = (
  worksheet: ExcelJS.Worksheet
): WorksheetSemanticSnapshot => {
  const cells: Record<string, unknown> = {};
  for (let r = 1; r <= worksheet.actualRowCount; r++) {
    for (let c = 1; c <= worksheet.actualColumnCount; c++) {
      const cell = worksheet.getCell(r, c);
      const val = cell.value;
      const s = cell.style;
      const hasValue = val !== null && val !== undefined && val !== "";
      const hasStyle = Boolean(s && Object.keys(s).length > 0);

      if (hasValue || hasStyle || cell.isMerged) {
        cells[`${r}:${c}`] = {
          value: val,
          formula: cell.formula,
          numFmt: cell.numFmt,
          font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : undefined,
          alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : undefined,
          border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
          fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : undefined,
          protection: cell.protection ? JSON.parse(JSON.stringify(cell.protection)) : undefined
        };
      }
    }
  }

  const merges = [...((worksheet.model.merges ?? []) as string[])].sort();

  const rows: Record<number, { height?: number; hidden?: boolean; outlineLevel?: number }> = {};
  for (let r = 1; r <= worksheet.actualRowCount; r++) {
    const row = worksheet.getRow(r);
    if (row.height !== undefined || row.hidden || row.outlineLevel) {
      rows[r] = {
        height: row.height,
        hidden: row.hidden || undefined,
        outlineLevel: row.outlineLevel || undefined
      };
    }
  }

  const columns: Record<number, { width?: number; hidden?: boolean; outlineLevel?: number }> = {};
  for (let c = 1; c <= worksheet.actualColumnCount; c++) {
    const col = worksheet.getColumn(c);
    if (col.width !== undefined || col.hidden || col.outlineLevel) {
      columns[c] = {
        width: col.width,
        hidden: col.hidden || undefined,
        outlineLevel: col.outlineLevel || undefined
      };
    }
  }

  const images: WorksheetSemanticSnapshotImage[] = worksheet.getImages().map((img) => {
    const r = img.range as unknown as {
      tl?: { nativeCol?: number; nativeRow?: number; col?: number; row?: number };
      br?: { nativeCol?: number; nativeRow?: number; col?: number; row?: number };
      editAs?: string;
    };

    if (!worksheet.workbook) {
      throw new Error("SNAPSHOT_IMAGE_MEDIA_FAILED: worksheet has no workbook reference");
    }

    const imgId = (img as unknown as { imageId?: number }).imageId;
    if (imgId === undefined || imgId === null) {
      throw new Error("SNAPSHOT_IMAGE_MEDIA_FAILED: image has no imageId");
    }

    const media = (
      worksheet.workbook as unknown as {
        getImage?: (id: number) => {
          buffer?: ArrayBuffer | Uint8Array;
          extension?: string;
          type?: string;
        };
      }
    ).getImage?.(imgId);

    if (!media || !media.buffer) {
      throw new Error(`SNAPSHOT_IMAGE_MEDIA_FAILED: media not found for imageId ${imgId}`);
    }

    const ext = (media.extension ?? "").toLowerCase();
    let contentType: string;
    if (ext === "png") {
      contentType = "image/png";
    } else if (ext === "jpeg" || ext === "jpg") {
      contentType = "image/jpeg";
    } else if (ext === "gif") {
      contentType = "image/gif";
    } else {
      throw new Error(`SNAPSHOT_IMAGE_UNSUPPORTED_EXTENSION: ${ext}`);
    }

    const mediaHash = crypto
      .createHash("sha256")
      .update(Buffer.from(media.buffer))
      .digest("hex")
      .toLowerCase();
    const mediaKind = media.type ?? "image";

    return {
      type: img.type,
      tl: r?.tl ? { col: r.tl.col ?? r.tl.nativeCol, row: r.tl.row ?? r.tl.nativeRow } : undefined,
      br: r?.br ? { col: r.br.col ?? r.br.nativeCol, row: r.br.row ?? r.br.nativeRow } : undefined,
      editAs: r?.editAs,
      mediaHash,
      mediaExtension: ext,
      mediaKind,
      contentType
    };
  });

  return {
    name: worksheet.name,
    actualRowCount: worksheet.actualRowCount,
    actualColumnCount: worksheet.actualColumnCount,
    cells,
    merges,
    rows,
    columns,
    properties: worksheet.properties ? JSON.parse(JSON.stringify(worksheet.properties)) : undefined,
    pageSetup: worksheet.pageSetup ? JSON.parse(JSON.stringify(worksheet.pageSetup)) : undefined,
    headerFooter: worksheet.headerFooter ? JSON.parse(JSON.stringify(worksheet.headerFooter)) : undefined,
    views: worksheet.views ? JSON.parse(JSON.stringify(worksheet.views)) : undefined,
    images
  };
};
