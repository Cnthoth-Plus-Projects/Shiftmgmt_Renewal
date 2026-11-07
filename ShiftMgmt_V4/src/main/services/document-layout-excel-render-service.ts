import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type ExcelJS from "exceljs";

import type {
  DocumentLayoutBlock,
  DocumentLayoutBlockFont,
  DocumentLayoutDefinition
} from "../../shared/domain/document-layout";
import {
  getDefaultDocumentLayoutDefinition,
  parseRelativeColumnKey
} from "./document-layout-definition-service";
import {
  addBrandLogoToWorksheetRange
} from "./document-brand-logo-service";

export interface DocumentLayoutRenderContext {
  proposal?: {
    regularSiteCount: number;
    earlySiteCount: number;
  };
  attachment1?: {
    regularRowCount: number;
    earlyRowCount: number;
  };
  attachment2?: {
    lastRow: number;
  };
}

export interface GridRange {
  startCol: number; // 1-based inclusive
  startRow: number; // 1-based inclusive
  endCol: number;   // 1-based inclusive
  endRow: number;   // 1-based inclusive
}

export const toColumnLetter = (columnNumber: number): string => {
  let current = columnNumber;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
};

export const toColumnNumber = (columnLetters: string): number =>
  columnLetters
    .toUpperCase()
    .split("")
    .reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);

export const parseCellRangeAddress = (rangeAddress: string): GridRange | null => {
  const match = rangeAddress.trim().toUpperCase().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!match) {
    return null;
  }
  const startCol = toColumnNumber(match[1]!);
  const startRow = Number(match[2]!);
  const endCol = match[3] ? toColumnNumber(match[3]!) : startCol;
  const endRow = match[4] ? Number(match[4]!) : startRow;
  return { startCol, startRow, endCol, endRow };
};

export const doRangesIntersect = (a: GridRange, b: GridRange): boolean =>
  a.startCol <= b.endCol &&
  a.endCol >= b.startCol &&
  a.startRow <= b.endRow &&
  a.endRow >= b.startRow;

export const sanitizeTokenValue = (value: string | number): string =>
  String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

export interface DocumentLayoutFileNameTokens {
  year?: number | string;
  monthNumber?: number | string;
  month2?: number | string;
  siteName?: string;
  name?: string;
  timestamp?: string;
}

export const resolveDocumentLayoutFileName = (
  pattern: string,
  tokens: DocumentLayoutFileNameTokens
): string => {
  let resolved = pattern;
  if (tokens.year !== undefined) {
    resolved = resolved.replace(/\{year\}/g, sanitizeTokenValue(tokens.year));
  }
  if (tokens.monthNumber !== undefined) {
    resolved = resolved.replace(/\{monthNumber\}/g, sanitizeTokenValue(tokens.monthNumber));
  }
  if (tokens.month2 !== undefined) {
    resolved = resolved.replace(/\{month2\}/g, sanitizeTokenValue(tokens.month2));
  }
  if (tokens.siteName !== undefined) {
    resolved = resolved.replace(/\{siteName\}/g, sanitizeTokenValue(tokens.siteName));
  }
  if (tokens.name !== undefined) {
    resolved = resolved.replace(/\{name\}/g, sanitizeTokenValue(tokens.name));
  }
  if (tokens.timestamp !== undefined) {
    resolved = resolved.replace(/\{timestamp\}/g, sanitizeTokenValue(tokens.timestamp));
  }

  if (/\{[^{}]+\}/.test(resolved)) {
    throw new Error(`[레이아웃 파일명 치환 오류] 치환되지 않은 토큰이 남아있습니다: ${resolved}`);
  }

  return resolved;
};

export const resolveDocumentLayoutOutputFilePath = (
  baseDir: string,
  pattern: string,
  tokens: DocumentLayoutFileNameTokens,
  reservedOutputPaths?: Set<string>
): string => {
  const resolvedRelative = resolveDocumentLayoutFileName(pattern, tokens);
  if (resolvedRelative.includes("\\")) {
    throw new Error(`[레이아웃 파일 경로 오류] 파일명 패턴에 역슬래시가 포함되어 있습니다: ${resolvedRelative}`);
  }
  const normalizedRelative = resolvedRelative.replace(/\\/g, "/");
  const absoluteBase = path.resolve(baseDir);
  const targetPath = path.resolve(absoluteBase, normalizedRelative);

  const relativeToBase = path.relative(absoluteBase, targetPath);
  if (relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
    throw new Error(`[레이아웃 파일 경로 오류] 계산된 대상 경로('${targetPath}')가 기본 디렉터리('${absoluteBase}') 밖으로 벗어났습니다.`);
  }

  const parentDir = path.dirname(targetPath);
  mkdirSync(parentDir, { recursive: true });

  // Writers may choose every member's name before creating any files.
  const tryReserve = (candidatePath: string): boolean => {
    const resolvedPath = path.resolve(candidatePath);
    const key = process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
    if (existsSync(candidatePath) || reservedOutputPaths?.has(key)) {
      return false;
    }
    reservedOutputPaths?.add(key);
    return true;
  };

  if (tryReserve(targetPath)) {
    return targetPath;
  }

  // 중복 시 _dup01, _dup02 형식 적용
  const ext = path.extname(targetPath);
  const baseName = path.basename(targetPath, ext);
  let duplicateIndex = 1;

  while (true) {
    const dupSuffix = `_dup${String(duplicateIndex).padStart(2, "0")}`;
    const candidatePath = path.resolve(parentDir, `${baseName}${dupSuffix}${ext}`);
    if (tryReserve(candidatePath)) {
      return candidatePath;
    }
    duplicateIndex += 1;
  }
};

export interface DocumentLayoutFontPropertyDeltas {
  familyChanged: boolean;
  sizePtChanged: boolean;
  boldChanged: boolean;
  italicChanged: boolean;
  colorChanged: boolean;
  hasAnyFontDelta: boolean;
}

export const computeFontPropertyDeltas = (
  candidateFont?: DocumentLayoutBlockFont,
  baselineFont?: DocumentLayoutBlockFont
): DocumentLayoutFontPropertyDeltas => {
  const cFam = candidateFont?.family?.trim();
  const bFam = baselineFont?.family?.trim();
  const familyChanged = cFam !== undefined && cFam !== bFam;

  const cSize = candidateFont?.sizePt;
  const bSize = baselineFont?.sizePt;
  const sizePtChanged = cSize !== undefined && cSize !== bSize;

  const cBold = candidateFont?.bold;
  const bBold = baselineFont?.bold;
  const boldChanged = cBold !== undefined && cBold !== bBold;

  const cItalic = candidateFont?.italic;
  const bItalic = baselineFont?.italic;
  const italicChanged = cItalic !== undefined && cItalic !== bItalic;

  const cColor = candidateFont?.color?.trim().toUpperCase();
  const bColor = baselineFont?.color?.trim().toUpperCase();
  const colorChanged = cColor !== undefined && cColor !== bColor;

  const hasAnyFontDelta =
    familyChanged ||
    sizePtChanged ||
    boldChanged ||
    italicChanged ||
    colorChanged;

  return {
    familyChanged,
    sizePtChanged,
    boldChanged,
    italicChanged,
    colorChanged,
    hasAnyFontDelta
  };
};

export const areFontsSemanticallyEqual = (
  fontA?: DocumentLayoutBlockFont,
  fontB?: DocumentLayoutBlockFont
): boolean => !computeFontPropertyDeltas(fontA, fontB).hasAnyFontDelta;

export const hasDocumentLayoutModifications = (
  candidate: DocumentLayoutDefinition,
  baseline: DocumentLayoutDefinition
): boolean => {
  const candBlocks = candidate.outputs?.[0]?.blocks ?? [];
  const baseBlocks = baseline.outputs?.[0]?.blocks ?? [];

  if (candBlocks.length !== baseBlocks.length) {
    return true;
  }

  for (let i = 0; i < candBlocks.length; i++) {
    const c = candBlocks[i]!;
    const b = baseBlocks[i]!;

    if (
      c.id !== b.id ||
      c.x !== b.x ||
      c.y !== b.y ||
      c.width !== b.width ||
      c.height !== b.height ||
      c.visible !== b.visible ||
      c.text !== b.text ||
      c.logoAssetId !== b.logoAssetId
    ) {
      return true;
    }

    if (c.columnWidths !== undefined && Object.keys(c.columnWidths).length > 0) {
      return true;
    }

    if (c.font !== undefined && !areFontsSemanticallyEqual(c.font, b.font)) {
      return true;
    }
  }

  return false;
};

export const computeDocumentLayoutActualBlockRanges = (
  definition: DocumentLayoutDefinition,
  context?: DocumentLayoutRenderContext
): {
  sourceRanges: Map<string, GridRange>;
  targetRanges: Map<string, GridRange>;
} => {
  const sourceRanges = new Map<string, GridRange>();
  const targetRanges = new Map<string, GridRange>();
  const kind = definition.documentKind;

  if (kind === "schedule-xlsx") {
    // schedule template1/template2
    const baseline = getDefaultDocumentLayoutDefinition(definition);
    const candBlocks = definition.outputs[0]?.blocks ?? [];
    const baseBlocks = baseline.outputs[0]?.blocks ?? [];
    const baseMap = new Map<string, DocumentLayoutBlock>();
    baseBlocks.forEach((b) => baseMap.set(b.id, b));

    candBlocks.forEach((cb) => {
      const bb = baseMap.get(cb.id) ?? cb;
      const src: GridRange = {
        startCol: bb.x + 1,
        startRow: bb.y + 1,
        endCol: bb.x + bb.width,
        endRow: bb.y + bb.height
      };
      const tgt: GridRange = {
        startCol: cb.x + 1,
        startRow: cb.y + 1,
        endCol: cb.x + cb.width,
        endRow: cb.y + cb.height
      };
      sourceRanges.set(cb.id, src);
      targetRanges.set(cb.id, tgt);
    });
  } else if (kind === "proposal-xlsx") {
    const R = Math.max(context?.proposal?.regularSiteCount ?? 1, 1);
    const E = Math.max(context?.proposal?.earlySiteCount ?? 1, 1);
    const regularDelta = R - 1;
    const earlyDelta = E - 1;

    // Proposal baseline blocks
    // 0: proposal.logo (A1:C1)
    sourceRanges.set("proposal.logo", { startCol: 1, startRow: 1, endCol: 3, endRow: 1 });
    // 1: proposal.decision (A3:C3)
    sourceRanges.set("proposal.decision", { startCol: 1, startRow: 3, endCol: 3, endRow: 3 });
    // 2: proposal.meta (A5:I9)
    sourceRanges.set("proposal.meta", { startCol: 1, startRow: 5, endCol: 9, endRow: 9 });
    // 3: proposal.title (A11:I12)
    sourceRanges.set("proposal.title", { startCol: 1, startRow: 11, endCol: 9, endRow: 12 });
    // 4: proposal.scope (B14:I16)
    sourceRanges.set("proposal.scope", { startCol: 2, startRow: 14, endCol: 9, endRow: 16 });
    // 5: proposal.regular-summary (B18:H(21+R))
    sourceRanges.set("proposal.regular-summary", { startCol: 2, startRow: 18, endCol: 8, endRow: 21 + R });
    // 6: proposal.early-summary (B(23+R):H(26+R+E))
    sourceRanges.set("proposal.early-summary", { startCol: 2, startRow: 23 + R, endCol: 8, endRow: 26 + R + E });
    // 7: proposal.grand-total (B(28+R+E):H(28+R+E))
    sourceRanges.set("proposal.grand-total", { startCol: 2, startRow: 28 + R + E, endCol: 8, endRow: 28 + R + E });
    // 8: proposal.footer (B(30+R+E):I(31+R+E))
    sourceRanges.set("proposal.footer", { startCol: 2, startRow: 30 + R + E, endCol: 9, endRow: 31 + R + E });

    // Target ranges based on candidate definition with dynamic row additions
    const candBlocks = definition.outputs[0]?.blocks ?? [];
    candBlocks.forEach((cb) => {
      let dynamicShift = 0;
      let actualHeight = cb.height;

      if (cb.id === "proposal.regular-summary") {
        actualHeight = (cb.height - 5) + (4 + R);
      } else if (cb.id === "proposal.early-summary") {
        dynamicShift = regularDelta;
        actualHeight = (cb.height - 5) + (4 + E);
      } else if (cb.id === "proposal.grand-total" || cb.id === "proposal.footer") {
        dynamicShift = regularDelta + earlyDelta;
      }

      const tgtStartRow = cb.y + 1 + dynamicShift;
      const tgt: GridRange = {
        startCol: cb.x + 1,
        startRow: tgtStartRow,
        endCol: cb.x + cb.width,
        endRow: tgtStartRow + actualHeight - 1
      };
      targetRanges.set(cb.id, tgt);
    });
  } else if (kind === "attachment1-xlsx") {
    const N = Math.max(context?.attachment1?.regularRowCount ?? 1, 1);
    const X = Math.max(context?.attachment1?.earlyRowCount ?? 1, 1);
    const deltaN = N - 10;
    const deltaX = X - 1;

    // Attachment 1 baseline blocks
    sourceRanges.set("attachment1.logo", { startCol: 17, startRow: 1, endCol: 19, endRow: 1 });
    sourceRanges.set("attachment1.title", { startCol: 1, startRow: 1, endCol: 16, endRow: 1 });
    sourceRanges.set("attachment1.regular-table", { startCol: 1, startRow: 2, endCol: 19, endRow: 6 + N });
    sourceRanges.set("attachment1.early-title", { startCol: 1, startRow: 8 + N, endCol: 19, endRow: 8 + N });
    sourceRanges.set("attachment1.early-table", { startCol: 1, startRow: 9 + N, endCol: 19, endRow: 11 + N + X });
    sourceRanges.set("attachment1.rate-guide", { startCol: 1, startRow: 14 + N + X, endCol: 19, endRow: 35 + N + X });

    const candBlocks = definition.outputs[0]?.blocks ?? [];
    candBlocks.forEach((cb) => {
      let dynamicShift = 0;
      let actualHeight = cb.height;

      if (cb.id === "attachment1.regular-table") {
        actualHeight = (cb.height - 15) + (5 + N);
      } else if (cb.id === "attachment1.early-title") {
        dynamicShift = deltaN;
      } else if (cb.id === "attachment1.early-table") {
        dynamicShift = deltaN;
        actualHeight = (cb.height - 4) + (3 + X);
      } else if (cb.id === "attachment1.rate-guide") {
        dynamicShift = deltaN + deltaX;
      }

      const tgtStartRow = cb.y + 1 + dynamicShift;
      const tgt: GridRange = {
        startCol: cb.x + 1,
        startRow: tgtStartRow,
        endCol: cb.x + cb.width,
        endRow: tgtStartRow + actualHeight - 1
      };
      targetRanges.set(cb.id, tgt);
    });
  } else if (kind === "attachment2-xlsx") {
    const lastRow = Math.max(context?.attachment2?.lastRow ?? 86, 5);
    const tableHeight = lastRow - 3 + 1;

    sourceRanges.set("attachment2.logo", { startCol: 6, startRow: 1, endCol: 7, endRow: 1 });
    sourceRanges.set("attachment2.title", { startCol: 1, startRow: 1, endCol: 5, endRow: 1 });
    sourceRanges.set("attachment2.period", { startCol: 6, startRow: 2, endCol: 7, endRow: 2 });
    sourceRanges.set("attachment2.table", { startCol: 1, startRow: 3, endCol: 7, endRow: lastRow });

    const candBlocks = definition.outputs[0]?.blocks ?? [];
    candBlocks.forEach((cb) => {
      let actualHeight = cb.height;
      if (cb.id === "attachment2.table") {
        actualHeight = (cb.height - 84) + tableHeight;
      }
      const tgt: GridRange = {
        startCol: cb.x + 1,
        startRow: cb.y + 1,
        endCol: cb.x + cb.width,
        endRow: cb.y + actualHeight
      };
      targetRanges.set(cb.id, tgt);
    });
  }

  // 충돌 검증 (schedule.month-anchors 제외)
  const candBlocks = definition.outputs[0]?.blocks ?? [];
  const visibleCandBlocks = candBlocks.filter((b) => b.visible && b.id !== "schedule.month-anchors");

  for (let i = 0; i < visibleCandBlocks.length; i++) {
    const b1 = visibleCandBlocks[i]!;
    const r1 = targetRanges.get(b1.id);
    if (!r1) continue;

    for (let j = i + 1; j < visibleCandBlocks.length; j++) {
      const b2 = visibleCandBlocks[j]!;
      const r2 = targetRanges.get(b2.id);
      if (!r2) continue;

      if (doRangesIntersect(r1, r2)) {
        throw new Error(`[레이아웃 적용 오류 (BLOCK_COLLISION)] 블록 '${b1.id}'(범위 ${toColumnLetter(r1.startCol)}${r1.startRow}:${toColumnLetter(r1.endCol)}${r1.endRow})와 블록 '${b2.id}'(범위 ${toColumnLetter(r2.startCol)}${r2.startRow}:${toColumnLetter(r2.endCol)}${r2.endRow})의 대상 영역이 겹칩니다.`);
      }
    }
  }

  return { sourceRanges, targetRanges };
};

export interface DocumentLayoutBlockDelta {
  blockId: string;
  posChanged: boolean;
  sizeChanged: boolean;
  visibleChanged: boolean;
  textChanged: boolean;
  logoChanged: boolean;
  colWidthsChanged: boolean;
  fontDeltas: DocumentLayoutFontPropertyDeltas;
  fontChanged: boolean;
  hasAnyDelta: boolean;
}

export const computeBlockDelta = (
  candidateBlock: DocumentLayoutBlock,
  baselineBlock: DocumentLayoutBlock
): DocumentLayoutBlockDelta => {
  const posChanged = candidateBlock.x !== baselineBlock.x || candidateBlock.y !== baselineBlock.y;
  const sizeChanged = candidateBlock.width !== baselineBlock.width || candidateBlock.height !== baselineBlock.height;
  const visibleChanged = candidateBlock.visible !== baselineBlock.visible;
  const textChanged =
    candidateBlock.text !== undefined &&
    candidateBlock.text !== baselineBlock.text &&
    (candidateBlock.kind === "title" || candidateBlock.kind === "note" || candidateBlock.kind === "footer") &&
    !candidateBlock.bindingKey;
  const logoChanged = candidateBlock.logoAssetId !== baselineBlock.logoAssetId;
  const colWidthsChanged =
    candidateBlock.columnWidths !== undefined &&
    JSON.stringify(candidateBlock.columnWidths) !== JSON.stringify(baselineBlock.columnWidths ?? {});
  const fontDeltas = computeFontPropertyDeltas(candidateBlock.font, baselineBlock.font);
  const fontChanged = fontDeltas.hasAnyFontDelta;

  const hasAnyDelta =
    posChanged ||
    sizeChanged ||
    visibleChanged ||
    textChanged ||
    logoChanged ||
    colWidthsChanged ||
    fontChanged;

  return {
    blockId: candidateBlock.id,
    posChanged,
    sizeChanged,
    visibleChanged,
    textChanged,
    logoChanged,
    colWidthsChanged,
    fontDeltas,
    fontChanged,
    hasAnyDelta
  };
};

interface CapturedCellData {
  relCol: number;
  relRow: number;
  value: unknown;
  style: Record<string, unknown>;
  hasValue: boolean;
  hasStyle: boolean;
  isMerged: boolean;
}

interface CapturedMergeData {
  relStartCol: number;
  relStartRow: number;
  relEndCol: number;
  relEndRow: number;
  isFullBlock: boolean;
}

interface CapturedBlockData {
  blockId: string;
  sourceRange: GridRange;
  targetRange: GridRange;
  candidateBlock: DocumentLayoutBlock;
  baselineBlock: DocumentLayoutBlock;
  delta: DocumentLayoutBlockDelta;
  cells: CapturedCellData[];
  merges: CapturedMergeData[];
  hasLogo: boolean;
}

export const unmergeCellsInRange = (
  worksheet: ExcelJS.Worksheet,
  range: GridRange,
  blockId?: string
): void => {
  const currentMerges = [...((worksheet.model.merges ?? []) as string[])];
  const unmergedAddresses = new Set<string>();

  currentMerges.forEach((mStr) => {
    const parsed = parseCellRangeAddress(mStr);
    if (parsed && doRangesIntersect(parsed, range)) {
      try {
        worksheet.unMergeCells(mStr);
        unmergedAddresses.add(mStr);
      } catch (err) {
        throw new Error(
          `[레이아웃 적용 오류 (UNMERGE_FAILED)] 블록 '${blockId ?? "unknown"}'(범위 ${toColumnLetter(range.startCol)}${range.startRow}:${toColumnLetter(range.endCol)}${range.endRow})의 기존 병합('${mStr}') 해제 중 오류가 발생했습니다: ${(err as Error).message}`
        );
      }
    }
  });

  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const cell = worksheet.getCell(r, c);
      if (cell.isMerged && cell.master?.address && !unmergedAddresses.has(cell.master.address)) {
        try {
          worksheet.unMergeCells(cell.master.address);
          unmergedAddresses.add(cell.master.address);
        } catch (err) {
          throw new Error(
            `[레이아웃 적용 오류 (UNMERGE_FAILED)] 블록 '${blockId ?? "unknown"}'의 마스터 셀('${cell.master.address}') 병합 해제 중 오류가 발생했습니다: ${(err as Error).message}`
          );
        }
      }
    }
  }
};

export const applyDocumentLayoutToWorksheet = (input: {
  worksheet: ExcelJS.Worksheet;
  definition: DocumentLayoutDefinition;
  context?: DocumentLayoutRenderContext;
}): void => {
  const { worksheet, definition, context } = input;
  const baseline = getDefaultDocumentLayoutDefinition(definition);

  if (!hasDocumentLayoutModifications(definition, baseline)) {
    return;
  }

  const { sourceRanges, targetRanges } = computeDocumentLayoutActualBlockRanges(definition, context);
  const candBlocks = definition.outputs[0]?.blocks ?? [];
  const baseBlocks = baseline.outputs[0]?.blocks ?? [];
  const baseBlockMap = new Map<string, DocumentLayoutBlock>();
  baseBlocks.forEach((b) => baseBlockMap.set(b.id, b));

  // 1. 블록별 delta 계산
  const blockDeltas = new Map<string, DocumentLayoutBlockDelta>();
  const changedBlockIds = new Set<string>();

  candBlocks.forEach((cb) => {
    if (cb.id === "schedule.month-anchors") return;
    const bb = baseBlockMap.get(cb.id) ?? cb;
    const delta = computeBlockDelta(cb, bb);
    blockDeltas.set(cb.id, delta);
    if (delta.hasAnyDelta) {
      changedBlockIds.add(cb.id);
    }
  });

  if (changedBlockIds.size === 0) {
    return;
  }

  // 2. 재구축(rebuild)이 필요한 블록 판별:
  //    - 직접 변경된 블록(changedBlockIds)
  //    - 또는 변경된 블록의 sourceRange/targetRange와 자신의 sourceRange/targetRange가 교차하는 블록
  const blocksToRebuild = new Set<string>();
  candBlocks.forEach((cb) => {
    if (cb.id === "schedule.month-anchors") return;
    if (changedBlockIds.has(cb.id)) {
      blocksToRebuild.add(cb.id);
      return;
    }
    const src = sourceRanges.get(cb.id);
    const tgt = targetRanges.get(cb.id);
    if (!src || !tgt) return;

    for (const chId of changedBlockIds) {
      const chSrc = sourceRanges.get(chId);
      const chTgt = targetRanges.get(chId);
      if (chSrc && (doRangesIntersect(src, chSrc) || doRangesIntersect(tgt, chSrc))) {
        blocksToRebuild.add(cb.id);
        return;
      }
      if (chTgt && (doRangesIntersect(src, chTgt) || doRangesIntersect(tgt, chTgt))) {
        blocksToRebuild.add(cb.id);
        return;
      }
    }
  });

  // 3. 재구축 대상 블록의 원본 데이터 캡처
  const capturedBlocks: CapturedBlockData[] = [];
  const currentMerges = [...((worksheet.model.merges ?? []) as string[])];

  candBlocks.forEach((cb) => {
    if (!blocksToRebuild.has(cb.id)) {
      return; // 변경되지 않았고 다른 블록 이동 영역과도 겹치지 않는 블록은 건드리지 않음 (100% 무손실 보존)
    }

    const srcRange = sourceRanges.get(cb.id);
    const tgtRange = targetRanges.get(cb.id);
    if (!srcRange || !tgtRange) {
      return;
    }

    const bb = baseBlockMap.get(cb.id) ?? cb;
    const delta = blockDeltas.get(cb.id) ?? computeBlockDelta(cb, bb);

    const cells: CapturedCellData[] = [];
    for (let r = srcRange.startRow; r <= srcRange.endRow; r++) {
      for (let c = srcRange.startCol; c <= srcRange.endCol; c++) {
        const cell = worksheet.getCell(r, c);
        const hasValue = cell.value !== null && cell.value !== undefined && cell.value !== "";
        const cellStyle = cell.style ? JSON.parse(JSON.stringify(cell.style)) : {};
        const hasStyle = Object.keys(cellStyle).length > 0;
        const isMerged = Boolean(cell.isMerged);

        cells.push({
          relCol: c - srcRange.startCol,
          relRow: r - srcRange.startRow,
          value: cell.value,
          style: cellStyle,
          hasValue,
          hasStyle,
          isMerged
        });
      }
    }

    const merges: CapturedMergeData[] = [];
    const srcWidth = srcRange.endCol - srcRange.startCol;
    const srcHeight = srcRange.endRow - srcRange.startRow;

    currentMerges.forEach((mStr) => {
      const parsed = parseCellRangeAddress(mStr);
      if (
        parsed &&
        parsed.startCol >= srcRange.startCol &&
        parsed.endCol <= srcRange.endCol &&
        parsed.startRow >= srcRange.startRow &&
        parsed.endRow <= srcRange.endRow
      ) {
        const relStartCol = parsed.startCol - srcRange.startCol;
        const relStartRow = parsed.startRow - srcRange.startRow;
        const relEndCol = parsed.endCol - srcRange.startCol;
        const relEndRow = parsed.endRow - srcRange.startRow;
        const isFullBlock =
          relStartCol === 0 &&
          relStartRow === 0 &&
          relEndCol === srcWidth &&
          relEndRow === srcHeight;

        merges.push({
          relStartCol,
          relStartRow,
          relEndCol,
          relEndRow,
          isFullBlock
        });
      }
    });

    const isLogoBlock = cb.kind === "logo" || cb.id.endsWith(".logo");
    capturedBlocks.push({
      blockId: cb.id,
      sourceRange: srcRange,
      targetRange: tgtRange,
      candidateBlock: cb,
      baselineBlock: bb,
      delta,
      cells,
      merges,
      hasLogo: isLogoBlock
    });
  });

  // 4. PREFLIGHT 검증 (C2 - worksheet를 수정하기 전에 반드시 검증)
  //    캡처된 non-empty 셀, 서식, 부분 병합 중 targetRange를 벗어나는 항목이 있으면 즉시 차단
  for (const cap of capturedBlocks) {
    const cb = cap.candidateBlock;
    if (!cb.visible) continue;

    const tgt = cap.targetRange;
    const tgtWidth = tgt.endCol - tgt.startCol + 1;
    const tgtHeight = tgt.endRow - tgt.startRow + 1;

    const isSingleFullBlockText =
      (cb.kind === "title" || cb.kind === "note" || cb.kind === "footer") &&
      cap.merges.length <= 1 &&
      (cap.merges.length === 0 || Boolean(cap.merges[0]?.isFullBlock));

    // 셀 검증: 실제 데이터(value)는 모든 블록에서 대상 범위를 벗어나면 즉시 차단
    for (const cellData of cap.cells) {
      if (cellData.hasValue) {
        const targetCol = tgt.startCol + cellData.relCol;
        const targetRow = tgt.startRow + cellData.relRow;
        if (targetCol > tgt.endCol || targetRow > tgt.endRow) {
          throw new Error(
            `[레이아웃 적용 오류 (UNRENDERABLE_BLOCK_SIZE)] 블록 '${cap.blockId}'의 대상 영역 크기(${tgtWidth}x${tgtHeight})가 실제 캡처된 내용 범위(최소 행 ${cellData.relRow + 1}, 최소 열 ${cellData.relCol + 1})보다 작아 데이터 손실이 발생합니다.`
          );
        }
      } else if (!isSingleFullBlockText && (cellData.hasStyle || cellData.isMerged)) {
        // 단일 문구 전체 병합 블록이 아닌 복합 표/서식 블록에서는 슬레이브 서식 및 병합 셀의 누락도 차단
        const targetCol = tgt.startCol + cellData.relCol;
        const targetRow = tgt.startRow + cellData.relRow;
        if (targetCol > tgt.endCol || targetRow > tgt.endRow) {
          throw new Error(
            `[레이아웃 적용 오류 (UNRENDERABLE_BLOCK_SIZE)] 블록 '${cap.blockId}'의 대상 영역 크기(${tgtWidth}x${tgtHeight})가 실제 캡처된 서식·병합 범위(최소 행 ${cellData.relRow + 1}, 최소 열 ${cellData.relCol + 1})보다 작아 서식 손실이 발생합니다.`
          );
        }
      }
    }

    // 부분 병합 검증 (전체 블록 단일 병합이 아닌 내부 병합이 대상 범위를 초과하는 경우)
    for (const m of cap.merges) {
      if (!m.isFullBlock) {
        const mEndCol = tgt.startCol + m.relEndCol;
        const mEndRow = tgt.startRow + m.relEndRow;
        if (mEndCol > tgt.endCol || mEndRow > tgt.endRow) {
          throw new Error(
            `[레이아웃 적용 오류 (UNRENDERABLE_BLOCK_SIZE)] 블록 '${cap.blockId}'의 대상 영역 크기(${tgtWidth}x${tgtHeight})가 내부 셀 병합 범위를 수용하기에 너무 작아 병합 손실이 발생합니다.`
          );
        }
      }
    }
  }

  // 5. 원본 블록 범위 해제 (unmerge 및 값/서식 소거, 로고 제거)
  capturedBlocks.forEach((cap) => {
    unmergeCellsInRange(worksheet, cap.sourceRange, cap.blockId);

    for (let r = cap.sourceRange.startRow; r <= cap.sourceRange.endRow; r++) {
      for (let c = cap.sourceRange.startCol; c <= cap.sourceRange.endCol; c++) {
        const cell = worksheet.getCell(r, c);
        cell.value = null;
        cell.style = {};
      }
    }

    if (cap.hasLogo) {
      const remainingMedia = ((worksheet as unknown as { _media?: unknown[] })._media ?? []).filter(
        (m: unknown) => {
          const range = (m as { range?: { tl?: { nativeCol: number; nativeRow: number } } }).range;
          if (!range?.tl) return true;
          const imgCol = range.tl.nativeCol + 1;
          const imgRow = range.tl.nativeRow + 1;
          return !(
            imgCol >= cap.sourceRange.startCol &&
            imgCol <= cap.sourceRange.endCol &&
            imgRow >= cap.sourceRange.startRow &&
            imgRow <= cap.sourceRange.endRow
          );
        }
      );
      (worksheet as unknown as { _media: unknown[] })._media = remainingMedia;
    }
  });

  // 6. 대상 위치에 블록 재배치 및 속성 적용
  capturedBlocks.forEach((cap) => {
    const cb = cap.candidateBlock;
    if (!cb.visible) {
      return;
    }

    const tgt = cap.targetRange;
    const delta = cap.delta;

    // 셀 내용 및 서식 배치
    cap.cells.forEach((cellData) => {
      const targetCol = tgt.startCol + cellData.relCol;
      const targetRow = tgt.startRow + cellData.relRow;

      if (targetCol <= tgt.endCol && targetRow <= tgt.endRow) {
        const cell = worksheet.getCell(targetRow, targetCol);

        // 기본 스타일 복원: 비어있는 스타일은 {} 유지
        const origStyle = cellData.style;
        const isEmptyStyle = !origStyle || Object.keys(origStyle).length === 0;
        if (isEmptyStyle) {
          cell.style = {};
        } else {
          cell.style = JSON.parse(JSON.stringify(origStyle));
        }

        // C4: 오직 사용자가 실제로 변경한 font 속성만 cell.font에 적용 (bold-only 시 size/family 보존)
        if (delta.fontChanged && cb.font) {
          const fd = delta.fontDeltas;
          const font = (cell.font ? { ...cell.font } : {}) as Record<string, unknown>;

          if (fd.familyChanged && cb.font.family !== undefined) {
            font.name = cb.font.family;
          }
          if (fd.sizePtChanged && cb.font.sizePt !== undefined) {
            font.size = cb.font.sizePt;
          }
          if (fd.boldChanged && cb.font.bold !== undefined) {
            font.bold = cb.font.bold;
          }
          if (fd.italicChanged && cb.font.italic !== undefined) {
            font.italic = cb.font.italic;
          }
          if (fd.colorChanged && cb.font.color !== undefined) {
            font.color = { argb: cb.font.color.replace(/^#/, "") };
          }

          if (Object.keys(font).length > 0) {
            cell.font = font as unknown as ExcelJS.Font;
          }
        }

        cell.value = cellData.value as ExcelJS.CellValue;
      }
    });

    // 정적 문구 속성 재정의 (text override) - delta.textChanged가 참일 때만
    if (delta.textChanged && cb.text !== undefined && (cb.kind === "title" || cb.kind === "note" || cb.kind === "footer") && !cb.bindingKey) {
      const anchorCell = worksheet.getCell(tgt.startRow, tgt.startCol);
      anchorCell.value = cb.text;
    }

    // 병합 복구 및 크기 변경 반영
    if (cap.merges.length > 0) {
      cap.merges.forEach((m) => {
        const mStartCol = tgt.startCol + m.relStartCol;
        const mStartRow = tgt.startRow + m.relStartRow;
        let mEndCol = tgt.startCol + m.relEndCol;
        let mEndRow = tgt.startRow + m.relEndRow;

        if (m.isFullBlock) {
          mEndCol = tgt.endCol;
          mEndRow = tgt.endRow;
        }

        if (mEndCol > tgt.endCol) mEndCol = tgt.endCol;
        if (mEndRow > tgt.endRow) mEndRow = tgt.endRow;

        if (mStartCol < mEndCol || mStartRow < mEndRow) {
          try {
            worksheet.mergeCells(mStartRow, mStartCol, mEndRow, mEndCol);
          } catch (err) {
            throw new Error(
              `[레이아웃 적용 오류 (MERGE_FAILED)] 블록 '${cb.id}'(대상 범위 ${toColumnLetter(tgt.startCol)}${tgt.startRow}:${toColumnLetter(tgt.endCol)}${tgt.endRow})의 셀 병합(${toColumnLetter(mStartCol)}${mStartRow}:${toColumnLetter(mEndCol)}${mEndRow})에 실패했습니다: ${(err as Error).message}`
            );
          }
        }
      });
    } else if (cb.kind === "title" || cb.kind === "note" || cb.kind === "footer") {
      // 기본적으로 단일 셀이 아닌 경우 전체 병합
      if (tgt.startCol < tgt.endCol || tgt.startRow < tgt.endRow) {
        try {
          worksheet.mergeCells(tgt.startRow, tgt.startCol, tgt.endRow, tgt.endCol);
        } catch (err) {
          throw new Error(
            `[레이아웃 적용 오류 (MERGE_FAILED)] 블록 '${cb.id}'(대상 범위 ${toColumnLetter(tgt.startCol)}${tgt.startRow}:${toColumnLetter(tgt.endCol)}${tgt.endRow})의 기본 영역 병합에 실패했습니다: ${(err as Error).message}`
          );
        }
      }
    }

    // 열 너비 재정의 (columnWidths override)
    if (cb.columnWidths && delta.colWidthsChanged) {
      for (const [colKey, colWidth] of Object.entries(cb.columnWidths)) {
        const relIdx = parseRelativeColumnKey(colKey);
        if (relIdx >= 1) {
          const absCol = tgt.startCol + (relIdx - 1);
          worksheet.getColumn(absCol).width = colWidth;
        }
      }
    }

    // 로고 자산 배치 (logoAssetId) - C3 해결
    if (cap.hasLogo) {
      if (cb.logoAssetId === "brand-logo") {
        try {
          addBrandLogoToWorksheetRange(
            worksheet,
            {
              startColumn: tgt.startCol,
              startRow: tgt.startRow,
              endColumn: tgt.endCol,
              endRow: tgt.endRow
            },
            "레이아웃"
          );
        } catch (err) {
          throw new Error(
            `[레이아웃 적용 오류 (LOGO_INSERT_FAILED)] 블록 '${cb.id}'의 브랜드 로고 삽입에 실패했습니다: ${(err as Error).message}`
          );
        }

        // 로고 삽입 후 대상 영역 내 이미지 정확히 1개 존재 검증
        const images = worksheet.getImages();
        const placedLogos = images.filter((img) => {
          const range = img.range as unknown as { tl?: { nativeCol: number; nativeRow: number } };
          if (!range?.tl) return false;
          const imgCol = range.tl.nativeCol + 1;
          const imgRow = range.tl.nativeRow + 1;
          return (
            imgCol >= tgt.startCol &&
            imgCol <= tgt.endCol &&
            imgRow >= tgt.startRow &&
            imgRow <= tgt.endRow
          );
        });

        if (placedLogos.length !== 1) {
          throw new Error(
            `[레이아웃 적용 오류 (LOGO_VERIFICATION_FAILED)] 블록 '${cb.id}'(대상 범위 ${toColumnLetter(tgt.startCol)}${tgt.startRow}:${toColumnLetter(tgt.endCol)}${tgt.endRow})에 로고 이미지가 정상적으로 1개 배치되지 않았습니다. (실제 발견: ${placedLogos.length}개)`
          );
        }
      } else if (cb.logoAssetId !== null && cb.logoAssetId !== undefined) {
        throw new Error(
          `[레이아웃 적용 오류 (UNKNOWN_LOGO_ASSET)] 지원하지 않는 로고 자산 식별자('${cb.logoAssetId}')입니다.`
        );
      }
    }
  });
};
