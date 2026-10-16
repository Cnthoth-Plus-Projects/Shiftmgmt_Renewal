import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentLayoutDefinition } from "../../shared/domain/document-layout";
import {
  assertValidDocumentLayoutDefinition,
  getDefaultDocumentLayoutDefinition
} from "./document-layout-definition-service";
import { generateDocumentLayoutPreview } from "./document-layout-preview-service";
import * as sqliteStorage from "./sqlite-storage-service";
import * as docTplPreview from "./document-template-preview-service";
import { extractWorksheetSemanticSnapshot } from "../../test-utils/document-layout-semantic-snapshot";

describe("document-layout-preview-service", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-preview-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should generate a valid readable XLSX workbook for all 5 Excel layout keys", async () => {
    const keys: Array<Parameters<typeof getDefaultDocumentLayoutDefinition>[0]> = [
      { documentKind: "schedule-xlsx", variant: "template1" },
      { documentKind: "schedule-xlsx", variant: "template2" },
      { documentKind: "proposal-xlsx" },
      { documentKind: "attachment1-xlsx" },
      { documentKind: "attachment2-xlsx" }
    ];

    for (const key of keys) {
      const definition = getDefaultDocumentLayoutDefinition(key);
      const subDir = path.join(tempDir, `${key.documentKind}-${key.variant ?? "default"}`);
      fs.mkdirSync(subDir, { recursive: true });

      const result = await generateDocumentLayoutPreview({
        definition,
        outputDir: subDir
      });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0]!;
      expect(artifact.mediaType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      expect(fs.existsSync(artifact.filePath)).toBe(true);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(artifact.filePath);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      const sheet = workbook.worksheets[0]!;
      expect(sheet.actualRowCount).toBeGreaterThan(0);
    }
  });

  it("should reflect draft modifications in the generated preview workbook", async () => {
    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "proposal-xlsx"
    });
    const modifiedDef: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));

    // 제목 블록 텍스트 및 글꼴 변경
    const titleBlock = modifiedDef.outputs[0]!.blocks.find((b) => b.id === "proposal.title");
    expect(titleBlock).toBeDefined();
    titleBlock!.text = "[초안 수정] 특별 시간외 근무 수당 지급 품의";
    titleBlock!.font = {
      family: "맑은 고딕",
      sizePt: 18,
      bold: true,
      color: "#FF0000"
    };

    const result = await generateDocumentLayoutPreview({
      definition: modifiedDef,
      outputDir: tempDir
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.artifacts[0]!.filePath);
    const sheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0]!;

    // 0-based x=0, y=10 -> A11 셀
    const titleCell = sheet.getCell("A11");
    expect(titleCell.value).toBe("[초안 수정] 특별 시간외 근무 수당 지급 품의");
    expect(titleCell.font?.bold).toBe(true);
    expect(titleCell.font?.size).toBe(18);
  });

  it("E4 검증: schedule parser table position 조정 시 save 모드와 preview 모드 모두 허용", async () => {
    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const modifiedDef: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));

    // schedule.reschedule 블록(회수 해석기 관련 표)을 1행 아래로 이동 (y: 8 -> 9)
    const tableBlock = modifiedDef.outputs[0]!.blocks.find(
      (b) => b.id === "schedule.reschedule"
    );
    expect(tableBlock).toBeDefined();
    tableBlock!.y = 9;

    // Phase 2.5-4 R6 계약: parser table 위치 조정된 definition도 save 모드에서 throw하지 않음
    expect(() => assertValidDocumentLayoutDefinition(modifiedDef, "save")).not.toThrow();

    // preview 모드에서도 파일 생성 성공
    const result = await generateDocumentLayoutPreview({
      definition: modifiedDef,
      outputDir: tempDir
    });

    expect(result.artifacts).toHaveLength(1);
    expect(fs.existsSync(result.artifacts[0]!.filePath)).toBe(true);
  });

  it("E2 검증: 5개 레이아웃 키 전체에 대해 동일 초안 2회 실행 시 semantic snapshot 100% 일치 (결정성 검증)", async () => {
    const keys: Array<Parameters<typeof getDefaultDocumentLayoutDefinition>[0]> = [
      { documentKind: "schedule-xlsx", variant: "template1" },
      { documentKind: "schedule-xlsx", variant: "template2" },
      { documentKind: "proposal-xlsx" },
      { documentKind: "attachment1-xlsx" },
      { documentKind: "attachment2-xlsx" }
    ];

    for (const key of keys) {
      const baseDef = getDefaultDocumentLayoutDefinition(key);
      const subKey = `${key.documentKind}-${key.variant ?? "default"}`;
      const dir1 = path.join(tempDir, `${subKey}-run1`);
      const dir2 = path.join(tempDir, `${subKey}-run2`);
      fs.mkdirSync(dir1);
      fs.mkdirSync(dir2);

      const result1 = await generateDocumentLayoutPreview({ definition: baseDef, outputDir: dir1 });
      const result2 = await generateDocumentLayoutPreview({ definition: baseDef, outputDir: dir2 });

      const wb1 = new ExcelJS.Workbook();
      await wb1.xlsx.readFile(result1.artifacts[0]!.filePath);
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.readFile(result2.artifacts[0]!.filePath);

      expect(wb1.worksheets).toHaveLength(wb2.worksheets.length);

      for (let i = 0; i < wb1.worksheets.length; i++) {
        const snap1 = extractWorksheetSemanticSnapshot(wb1.worksheets[i]!);
        const snap2 = extractWorksheetSemanticSnapshot(wb2.worksheets[i]!);
        expect(snap1).toEqual(snap2);

        if (key.documentKind === "schedule-xlsx") {
          expect(snap1.images).toHaveLength(0);
          expect(snap2.images).toHaveLength(0);
        } else {
          // proposal-xlsx, attachment1-xlsx, attachment2-xlsx
          expect(snap1.images).toHaveLength(1);
          expect(snap2.images).toHaveLength(1);

          for (const img of [snap1.images[0]!, snap2.images[0]!]) {
            expect(img.mediaHash).toMatch(/^[a-f0-9]{64}$/);
            expect(img.mediaExtension).toBe("png");
            expect(img.mediaKind).toBe("image");
            expect(img.contentType).toBe("image/png");
          }
        }
      }
    }

    // image media lookup 강제 실패 시 SNAPSHOT_IMAGE_MEDIA_FAILED fail-loud 전파 단언
    const poisonedWb = new ExcelJS.Workbook();
    const poisonedWs = poisonedWb.addWorksheet("poisoned");
    const dummyImgId = poisonedWb.addImage({
      buffer: Buffer.from("dummy-image-data"),
      extension: "png"
    });
    poisonedWs.addImage(dummyImgId, "A1:B2");
    vi.spyOn(poisonedWb, "getImage").mockReturnValue(undefined as unknown as ReturnType<ExcelJS.Workbook["getImage"]>);

    expect(() => extractWorksheetSemanticSnapshot(poisonedWs)).toThrowError(
      /SNAPSHOT_IMAGE_MEDIA_FAILED/
    );
  });

  it("E3 검증: preview 실행 중 업무 DB/storage 및 legacy loader 미호출 (무접근 spy 검증)", async () => {
    // 1. sqlite-storage-service의 getSqliteDatabase가 호출되면 즉시 실패하도록 poison spy 설치
    const dbSpy = vi.spyOn(sqliteStorage, "getSqliteDatabase").mockImplementation(() => {
      throw new Error("[POISON] preview 실행 중 비즈니스 SQLite DB(getSqliteDatabase) 접근이 감지되었습니다.");
    });

    // 2. 구버전 document-template-preview-service가 호출되면 즉시 실패하도록 poison spy 설치
    const legacySpy = vi.spyOn(docTplPreview, "previewDocumentTemplateFile").mockImplementation(() => {
      throw new Error("[POISON] preview 실행 중 구버전 document-template-preview-service 접근이 감지되었습니다.");
    });

    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "proposal-xlsx"
    });

    const result = await generateDocumentLayoutPreview({
      definition: baseDef,
      outputDir: tempDir
    });

    expect(result.artifacts).toHaveLength(1);
    expect(fs.existsSync(result.artifacts[0]!.filePath)).toBe(true);
    expect(dbSpy).not.toHaveBeenCalled();
    expect(legacySpy).not.toHaveBeenCalled();
  });

  it("E3 검증: 사전 미존재 outputDir에서 invalid draft 시 폴더/파일 0개 생성 및 차단", async () => {
    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const invalidDef: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));
    invalidDef.outputs[0]!.blocks[0]!.x = 1.5; // 유효하지 않은 정수 외 geometry

    const nonExistentDir = path.join(tempDir, "non_existent_subdir_for_invalid_test");
    expect(fs.existsSync(nonExistentDir)).toBe(false);

    await expect(
      generateDocumentLayoutPreview({
        definition: invalidDef,
        outputDir: nonExistentDir
      })
    ).rejects.toThrow();

    // 에러 발생 시 사전에 없던 디렉터리나 파일이 전혀 생성되지 않아야 함
    expect(fs.existsSync(nonExistentDir)).toBe(false);
  });

  it("should generate 3 valid readable PDF artifacts for proposal-pdf layout key (T7, T10)", async () => {
    const definition = getDefaultDocumentLayoutDefinition({
      documentKind: "proposal-pdf"
    });
    const subDir = path.join(tempDir, "proposal-pdf-preview");
    fs.mkdirSync(subDir, { recursive: true });

    const result = await generateDocumentLayoutPreview({
      definition,
      outputDir: subDir
    });

    expect(result.artifacts).toHaveLength(3);
    const expectedMembers = ["proposal", "attachment1", "attachment2"];

    for (let i = 0; i < 3; i++) {
      const artifact = result.artifacts[i]!;
      expect(artifact.memberId).toBe(expectedMembers[i]);
      expect(artifact.mediaType).toBe("application/pdf");
      expect(fs.existsSync(artifact.filePath)).toBe(true);

      const fileBytes = fs.readFileSync(artifact.filePath);
      expect(fileBytes.length).toBeGreaterThan(0);
      expect(fileBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }
  });

  it("should generate 1 valid readable PDF artifact for dashboard-report-pdf layout key (T7, T10)", async () => {
    const definition = getDefaultDocumentLayoutDefinition({
      documentKind: "dashboard-report-pdf"
    });
    const subDir = path.join(tempDir, "dashboard-report-pdf-preview");
    fs.mkdirSync(subDir, { recursive: true });

    const result = await generateDocumentLayoutPreview({
      definition,
      outputDir: subDir
    });

    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0]!;
    expect(artifact.memberId).toBe("main");
    expect(artifact.mediaType).toBe("application/pdf");
    expect(fs.existsSync(artifact.filePath)).toBe(true);

    const fileBytes = fs.readFileSync(artifact.filePath);
    expect(fileBytes.length).toBeGreaterThan(0);
    expect(fileBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});

