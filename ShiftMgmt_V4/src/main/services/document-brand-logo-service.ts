import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

type MutableImageAnchor = {
  nativeCol: number;
  nativeColOff: number;
  nativeRow: number;
  nativeRowOff: number;
};

type MutableImageRange = {
  br?: MutableImageAnchor;
  editAs?: string;
  tl?: MutableImageAnchor;
};

let customLogoResolverForTest: (() => Buffer | null) | null = null;

export const setBrandLogoResolverForTest = (resolver: (() => Buffer | null) | null) => {
  customLogoResolverForTest = resolver;
};

export const resolveBrandLogoBuffer = (): Buffer | null => {
  if (customLogoResolverForTest) {
    return customLogoResolverForTest();
  }

  const candidatePaths = [
    path.resolve(__dirname, "../../../dist/assets/brand-logo-clean.png"),
    path.resolve(__dirname, "../../../src/renderer/assets/brand-logo-clean.png"),
    path.resolve(process.cwd(), "dist", "assets", "brand-logo-clean.png"),
    path.resolve(process.cwd(), "src", "renderer", "assets", "brand-logo-clean.png"),
    path.resolve(__dirname, "../../../dist/assets"),
    path.resolve(__dirname, "../../../src/renderer/assets"),
    path.resolve(process.cwd(), "dist", "assets"),
    path.resolve(process.cwd(), "src", "renderer", "assets")
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    if (candidatePath.endsWith(".png")) {
      return readFileSync(candidatePath);
    }

    const logoFileName = readdirSync(candidatePath).find((fileName) =>
      /^brand-logo-clean.*\.png$/i.test(fileName)
    );

    if (logoFileName) {
      return readFileSync(path.resolve(candidatePath, logoFileName));
    }
  }

  return null;
};

export const resolveBrandLogoDataUrl = (): string | null => {
  const buffer = resolveBrandLogoBuffer();
  if (!buffer) {
    return null;
  }
  return `data:image/png;base64,${buffer.toString("base64")}`;
};

const toColumnLetter = (columnNumber: number) => {
  let current = columnNumber;
  let result = "";

  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }

  return result;
};

export const addBrandLogoToWorksheetRange = (
  worksheet: ExcelJS.Worksheet,
  range: {
    startColumn: number;
    startRow: number;
    endColumn: number;
    endRow: number;
  },
  documentKindLabel: string = "수당 문서"
) => {
  const logoBuffer = resolveBrandLogoBuffer();

  if (!logoBuffer) {
    throw new Error(`[${documentKindLabel}] 브랜드 로고 이미지를 찾을 수 없습니다.`);
  }

  const imageId = worksheet.workbook.addImage({
    buffer: logoBuffer as unknown as ExcelJS.Buffer,
    extension: "png"
  });

  const rangeString = `${toColumnLetter(range.startColumn)}${range.startRow}:${toColumnLetter(range.endColumn)}${range.endRow}`;
  worksheet.addImage(imageId, rangeString);
  fitWorksheetBrandLogoToRange(worksheet, range);

  return imageId;
};

export const applyWorkbookBrandLogo = (workbook: ExcelJS.Workbook) => {
  const logoBuffer = resolveBrandLogoBuffer();

  if (!logoBuffer) {
    return false;
  }

  const imageIds = new Set<number>();
  workbook.worksheets.forEach((worksheet) => {
    worksheet.getImages().forEach((image) => {
      const imageId = Number(image.imageId);

      if (Number.isFinite(imageId)) {
        imageIds.add(imageId);
      }
    });
  });

  const media = workbook.model.media ?? [];
  imageIds.forEach((imageId) => {
    const image = media[imageId];

    if (!image || image.type !== "image") {
      return;
    }

    const mutableImage = image as unknown as {
      buffer: unknown;
      extension: string;
      type: string;
    };

    mutableImage.buffer = logoBuffer;
    mutableImage.extension = "png";
  });

  return imageIds.size > 0;
};

const moveAnchorToCellBoundary = (anchor: MutableImageAnchor, columnIndex: number, rowIndex: number) => {
  anchor.nativeCol = columnIndex;
  anchor.nativeColOff = 0;
  anchor.nativeRow = rowIndex;
  anchor.nativeRowOff = 0;
};

export const fitWorksheetBrandLogoToRange = (
  worksheet: ExcelJS.Worksheet,
  input: {
    endColumn: number;
    endRow: number;
    startColumn: number;
    startRow: number;
  }
) => {
  let updated = false;

  worksheet.getImages().forEach((image) => {
    const range = image.range as unknown as MutableImageRange;

    if (!range.tl || !range.br) {
      return;
    }

    moveAnchorToCellBoundary(range.tl, input.startColumn - 1, input.startRow - 1);
    moveAnchorToCellBoundary(range.br, input.endColumn, input.endRow);
    range.editAs = "oneCell";
    updated = true;
  });

  return updated;
};
