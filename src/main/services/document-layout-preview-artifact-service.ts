import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  DocumentLayoutKey,
  DocumentLayoutMemberId,
  DocumentLayoutPreview,
  DocumentLayoutPreviewInput,
  DocumentLayoutPreviewOutput,
  DocumentLayoutSnapshot
} from "../../shared/domain/document-layout";
import {
  formatDocumentLayoutStorageKey,
  isSupportedDocumentLayoutKey
} from "./document-layout-definition-service";
import {
  generateDocumentLayoutPreview,
  type GenerateDocumentLayoutPreviewInput,
  type GenerateDocumentLayoutPreviewResult
} from "./document-layout-preview-service";
import { getDocumentLayout } from "./document-layout-storage-service";

export interface ResolvedDocumentLayoutPreviewArtifact {
  bytes: Buffer;
  mediaType: string;
  fileName: string;
}

export interface DocumentLayoutPreviewArtifactServiceDependencies {
  clock?: () => number;
  generateId?: () => string;
  tempRoot?: string;
  getCurrentLayout?: (key: DocumentLayoutKey) => DocumentLayoutSnapshot;
  generator?: (
    input: GenerateDocumentLayoutPreviewInput
  ) => Promise<GenerateDocumentLayoutPreviewResult>;
}

function isPathContained(parentPath: string, candidatePath: string): boolean {
  const resolvedParent = path.resolve(parentPath);
  const resolvedCandidate = path.resolve(candidatePath);
  const rel = path.relative(resolvedParent, resolvedCandidate);
  if (!rel || rel === "." || path.isAbsolute(rel)) {
    return false;
  }
  if (rel === ".." || rel.startsWith(`..${path.sep}`)) {
    return false;
  }
  return true;
}

function isSafeRelativePath(relPath: string): boolean {
  if (!relPath || typeof relPath !== "string") {
    return false;
  }
  // 제어문자 거절 (NUL 등)
  if (/[\x00-\x1f\x7f]/.test(relPath)) {
    return false;
  }
  // 역슬래시 거절
  if (relPath.includes("\\")) {
    return false;
  }
  // 콜론 거절 (드라이브 C:, ADS file:stream 등)
  if (relPath.includes(":")) {
    return false;
  }
  // UNC / 이중 슬래시 거절
  if (relPath.startsWith("//") || relPath.includes("//")) {
    return false;
  }
  // 절대 경로 거절
  if (path.posix.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) {
    return false;
  }
  // 드라이브 문자 시작 거절 (C: 등)
  if (/^[A-Za-z]:/.test(relPath)) {
    return false;
  }

  const segments = relPath.split("/");
  if (segments.length === 0) {
    return false;
  }

  // Windows 예약 장치명: CON, PRN, AUX, NUL, COM1-9, LPT1-9 (확장자 무관)
  const reservedDeviceRegex = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  // Windows 금지 문자: < > : " | ? *
  const invalidCharsRegex = /[<>:"|?*]/;

  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") {
      return false;
    }
    if (invalidCharsRegex.test(seg)) {
      return false;
    }
    // 끝의 점 또는 공백 거절
    if (seg.endsWith(".") || seg.endsWith(" ")) {
      return false;
    }
    if (reservedDeviceRegex.test(seg)) {
      return false;
    }
  }

  return true;
}

export interface DocumentLayoutPreviewArtifactManifestItem {
  memberId: DocumentLayoutMemberId;
  fileName: string;
  mediaType: string;
}

export interface DocumentLayoutPreviewArtifactManifestEntry {
  previewId: string;
  outputDir: string;
  expiresAtMs: number;
  expiresAt: string;
  items: Map<string, DocumentLayoutPreviewArtifactManifestItem>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export class DocumentLayoutPreviewArtifactService {
  private readonly clock: () => number;
  private readonly generateId: () => string;
  private readonly tempRoot: string;
  private readonly getCurrentLayout: (key: DocumentLayoutKey) => DocumentLayoutSnapshot;
  private readonly generator: (
    input: GenerateDocumentLayoutPreviewInput
  ) => Promise<GenerateDocumentLayoutPreviewResult>;
  private readonly manifests = new Map<string, DocumentLayoutPreviewArtifactManifestEntry>();

  constructor(deps?: DocumentLayoutPreviewArtifactServiceDependencies) {
    this.clock = deps?.clock ?? (() => Date.now());
    this.generateId = deps?.generateId ?? (() => randomUUID());
    this.tempRoot = deps?.tempRoot ?? path.join(os.tmpdir(), "shiftmgmt-layout-previews");
    this.getCurrentLayout = deps?.getCurrentLayout ?? getDocumentLayout;
    this.generator = deps?.generator ?? generateDocumentLayoutPreview;
  }

  private validateComponentChain(
    outputDir: string,
    relativeFileName: string
  ): { fullPath: string; realFullPath: string } {
    if (!fs.existsSync(this.tempRoot)) {
      throw new Error(`임시 루트가 존재하지 않습니다: ${this.tempRoot}`);
    }
    if (!fs.existsSync(outputDir)) {
      throw new Error(`출력 디렉터리가 존재하지 않습니다: ${outputDir}`);
    }

    const realTempRoot = fs.realpathSync(this.tempRoot);
    const dirStat = fs.lstatSync(outputDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
      throw new Error(`출력 디렉터리가 올바르지 않거나 심볼릭 링크입니다: ${outputDir}`);
    }
    const realOutputDir = fs.realpathSync(outputDir);
    if (!isPathContained(realTempRoot, realOutputDir)) {
      throw new Error(`출력 디렉터리가 임시 루트 경계 밖입니다: ${outputDir}`);
    }

    if (!isSafeRelativePath(relativeFileName)) {
      throw new Error(`안전하지 않은 파일명입니다: ${relativeFileName}`);
    }

    const segments = relativeFileName.split("/");
    let currentPath = outputDir;

    // 중간 디렉터리들 lstat & realpath 검증
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      currentPath = path.join(currentPath, seg);

      if (!isPathContained(outputDir, currentPath)) {
        throw new Error(`중간 디렉터리가 출력 디렉터리 경계 밖입니다: ${currentPath}`);
      }
      if (!fs.existsSync(currentPath)) {
        throw new Error(`중간 디렉터리가 존재하지 않습니다: ${currentPath}`);
      }
      const segStat = fs.lstatSync(currentPath);
      if (!segStat.isDirectory() || segStat.isSymbolicLink()) {
        throw new Error(`중간 디렉터리가 올바르지 않거나 심볼릭 링크입니다: ${currentPath}`);
      }
      const realSeg = fs.realpathSync(currentPath);
      if (!isPathContained(realOutputDir, realSeg)) {
        throw new Error(`중간 디렉터리의 실제 경로가 출력 디렉터리 경계 밖입니다: ${realSeg}`);
      }
    }

    // 최종 파일 component lstat & realpath 검증
    const lastSeg = segments[segments.length - 1]!;
    const fullPath = path.join(currentPath, lastSeg);

    if (!isPathContained(outputDir, fullPath)) {
      throw new Error(`아티팩트 경로가 출력 디렉터리 경계 밖입니다: ${fullPath}`);
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`아티팩트 파일이 존재하지 않습니다: ${fullPath}`);
    }
    const fileStat = fs.lstatSync(fullPath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error(`아티팩트가 일반 파일이 아니거나 심볼릭 링크입니다: ${fullPath}`);
    }
    const realFullPath = fs.realpathSync(fullPath);
    if (!isPathContained(realOutputDir, realFullPath)) {
      throw new Error(`아티팩트의 실제 경로가 출력 디렉터리 경계 밖입니다: ${realFullPath}`);
    }

    return { fullPath, realFullPath };
  }

  private validateGeneratedArtifacts(
    outputDir: string,
    result: GenerateDocumentLayoutPreviewResult
  ): void {
    if (!result || !Array.isArray(result.artifacts) || result.artifacts.length === 0) {
      throw new Error("미리보기 아티팩트가 비어 있습니다.");
    }

    for (const artifact of result.artifacts) {
      if (!artifact || typeof artifact !== "object") {
        throw new Error("올바르지 않은 아티팩트 객체입니다.");
      }
      const relPath = artifact.fileName;
      if (!isSafeRelativePath(relPath)) {
        throw new Error(`안전하지 않은 파일명입니다: ${relPath}`);
      }

      const { fullPath } = this.validateComponentChain(outputDir, relPath);

      if (
        !artifact.filePath ||
        typeof artifact.filePath !== "string" ||
        path.resolve(artifact.filePath) !== path.resolve(fullPath)
      ) {
        throw new Error(
          `아티팩트 파일 경로가 출력 디렉터리 내 기대 위치와 일치하지 않습니다: ${artifact.filePath}`
        );
      }
    }
  }

  private safeCleanupDir(dirPath: string): void {
    try {
      if (!fs.existsSync(this.tempRoot)) {
        return;
      }
      let dirStat: fs.Stats;
      try {
        dirStat = fs.lstatSync(dirPath);
      } catch {
        return;
      }
      if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
        return;
      }
      const realTempRoot = fs.realpathSync(this.tempRoot);
      const realOutputDir = fs.realpathSync(dirPath);
      if (!isPathContained(realTempRoot, realOutputDir)) {
        return;
      }
      this.safeRemoveTree(dirPath, realOutputDir);
    } catch {
      // 무시
    }
  }

  private safeRemoveTree(currentDir: string, realOutputDir: string): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(entryPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        try {
          if (process.platform === "win32") {
            try {
              fs.rmdirSync(entryPath);
            } catch {
              fs.unlinkSync(entryPath);
            }
          } else {
            fs.unlinkSync(entryPath);
          }
        } catch {
          // 무시
        }
      } else if (stat.isDirectory()) {
        try {
          const realSub = fs.realpathSync(entryPath);
          if (isPathContained(realOutputDir, realSub)) {
            this.safeRemoveTree(entryPath, realOutputDir);
            fs.rmdirSync(entryPath);
          }
        } catch {
          // 무시
        }
      } else if (stat.isFile()) {
        try {
          fs.unlinkSync(entryPath);
        } catch {
          // 무시
        }
      }
    }

    try {
      fs.rmdirSync(currentDir);
    } catch {
      // 무시
    }
  }

  async createPreview(
    input: DocumentLayoutPreviewInput
  ): Promise<DocumentLayoutPreview> {
    const def = input.definition;
    const key: DocumentLayoutKey =
      def.documentKind === "schedule-xlsx"
        ? { documentKind: "schedule-xlsx", variant: def.variant! }
        : ({ documentKind: def.documentKind } as DocumentLayoutKey);

    const storageKey = formatDocumentLayoutStorageKey(key);
    if (!isSupportedDocumentLayoutKey(storageKey)) {
      throw new Error(
        `[미리보기 지원 불가] 지원하지 않거나 기본 정의가 없는 레이아웃 키입니다: ${storageKey}`
      );
    }

    // basedOnRevisionId 동시성 검증: 현재 활성 판과 생성 시작 전 정확 일치해야 함
    const current = this.getCurrentLayout(key);
    if (input.basedOnRevisionId !== current.activeRevisionId) {
      throw new Error(
        `레이아웃 판 동시성 충돌이 발생했습니다. (기대 판: ${input.basedOnRevisionId ?? "없음"}, 현재 활성 판: ${current.activeRevisionId ?? "없음"})`
      );
    }

    const previewId = this.generateId();
    if (!UUID_REGEX.test(previewId)) {
      throw new Error(`[미리보기 식별자 오류] 유효하지 않은 식별자입니다: ${previewId}`);
    }
    const outputDir = path.join(this.tempRoot, previewId);

    // 생성 시작: 임시 디렉터리 생성
    fs.mkdirSync(outputDir, { recursive: true });

    let result: GenerateDocumentLayoutPreviewResult;
    try {
      result = await this.generator({ definition: input.definition, outputDir });
      this.validateGeneratedArtifacts(outputDir, result);
    } catch (error) {
      this.safeCleanupDir(outputDir);
      throw error;
    }

    const now = this.clock();
    const expiresAtMs = now + TEN_MINUTES_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const items = new Map<string, DocumentLayoutPreviewArtifactManifestItem>();
    const outputs: DocumentLayoutPreviewOutput[] = [];

    for (const artifact of result.artifacts) {
      items.set(artifact.memberId, {
        memberId: artifact.memberId,
        fileName: artifact.fileName,
        mediaType: artifact.mediaType
      });

      outputs.push({
        memberId: artifact.memberId,
        mediaType: artifact.mediaType,
        previewUrl: `/api/document-layout-previews/${previewId}/${artifact.memberId}`,
        expiresAt
      });
    }

    this.manifests.set(previewId, {
      previewId,
      outputDir,
      expiresAtMs,
      expiresAt,
      items
    });

    return {
      previewId,
      outputs: outputs as [DocumentLayoutPreviewOutput, ...DocumentLayoutPreviewOutput[]],
      validationIssues: result.validationIssues
    };
  }

  resolveArtifact(
    previewId: string,
    memberId: string
  ): ResolvedDocumentLayoutPreviewArtifact | null {
    if (!previewId || !UUID_REGEX.test(previewId)) {
      return null;
    }
    if (
      !memberId ||
      memberId.includes("/") ||
      memberId.includes("\\") ||
      memberId.includes("..")
    ) {
      return null;
    }

    const entry = this.manifests.get(previewId);
    if (!entry) {
      return null;
    }

    const now = this.clock();
    if (now >= entry.expiresAtMs) {
      this.manifests.delete(previewId);
      this.safeCleanupDir(entry.outputDir);
      return null;
    }

    const item = entry.items.get(memberId);
    if (!item) {
      return null;
    }

    try {
      const { fullPath } = this.validateComponentChain(
        entry.outputDir,
        item.fileName
      );

      const bytes = fs.readFileSync(fullPath);
      return {
        bytes,
        mediaType: item.mediaType,
        fileName: item.fileName
      };
    } catch {
      return null;
    }
  }

  clear(): void {
    for (const entry of this.manifests.values()) {
      this.safeCleanupDir(entry.outputDir);
    }
    this.manifests.clear();
  }
}

export const documentLayoutPreviewArtifactService =
  new DocumentLayoutPreviewArtifactService();

export const createDocumentLayoutPreviewArtifactService = (
  deps?: DocumentLayoutPreviewArtifactServiceDependencies
) => new DocumentLayoutPreviewArtifactService(deps);
