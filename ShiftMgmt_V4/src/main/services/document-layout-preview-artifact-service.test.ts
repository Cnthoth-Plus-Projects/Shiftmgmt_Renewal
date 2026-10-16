import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DocumentLayoutDefinition,
  DocumentLayoutSnapshot
} from "../../shared/domain/document-layout";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";
import type { DocumentLayoutPreviewArtifact } from "./document-layout-preview-service";
import { createDocumentLayoutPreviewArtifactService } from "./document-layout-preview-artifact-service";

describe("document-layout-preview-artifact-service", () => {
  let tempRoot: string;
  let fixedTime: number;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-svc-test-"));
    fixedTime = 1770000000000; // arbitrary fixed timestamp
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("정상 생성: 실제 기본 5종 통합 create/resolve 및 중첩 상대 경로·ZIP 서명 검증", async () => {
    const keys: Array<
      | { documentKind: "schedule-xlsx"; variant: "template1" | "template2" }
      | { documentKind: "proposal-xlsx" }
      | { documentKind: "attachment1-xlsx" }
      | { documentKind: "attachment2-xlsx" }
    > = [
      { documentKind: "schedule-xlsx", variant: "template1" },
      { documentKind: "schedule-xlsx", variant: "template2" },
      { documentKind: "proposal-xlsx" },
      { documentKind: "attachment1-xlsx" },
      { documentKind: "attachment2-xlsx" }
    ];

    const service = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      tempRoot,
      getCurrentLayout: (k) => ({
        documentKind: k.documentKind,
        variant: "variant" in k ? k.variant : undefined,
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition: getDefaultDocumentLayoutDefinition(k),
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      })
      // generator는 mock하지 않고 실제 generateDocumentLayoutPreview를 사용
    });

    for (const key of keys) {
      const definition = getDefaultDocumentLayoutDefinition(key);
      const preview = await service.createPreview({
        definition,
        basedOnRevisionId: null
      });

      expect(preview.previewId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(preview.outputs.length).toBeGreaterThanOrEqual(1);

      for (const output of preview.outputs) {
        expect(output.previewUrl).toBe(
          `/api/document-layout-previews/${preview.previewId}/${output.memberId}`
        );
        const expectedExpiresAt = new Date(
          fixedTime + 10 * 60 * 1000
        ).toISOString();
        expect(output.expiresAt).toBe(expectedExpiresAt);

        const resolved = service.resolveArtifact(
          preview.previewId,
          output.memberId
        );
        expect(resolved).not.toBeNull();
        // 중첩 상대 경로에 / 포함 확인
        expect(resolved!.fileName).toContain("/");
        expect(resolved!.fileName.split("/").length).toBeGreaterThanOrEqual(2);
        expect(resolved!.fileName.endsWith(".xlsx")).toBe(true);

        // non-empty bytes 및 ZIP signature 'PK' (0x50, 0x4B) 확인
        expect(resolved!.bytes.length).toBeGreaterThan(0);
        expect(resolved!.bytes[0]).toBe(0x50);
        expect(resolved!.bytes[1]).toBe(0x4b);

        // mediaType 확인
        expect(resolved!.mediaType).toBe(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
      }
    }

    // clear 후 tempRoot 내 생성된 디렉터리들이 모두 안전하게 정리되었는지 확인
    service.clear();
    const remainingDirs = fs.readdirSync(tempRoot);
    expect(remainingDirs).toHaveLength(0);
  });

  it("stale basedOnRevisionId: generator·mkdir·file 0", async () => {
    const definition = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const fakeGenerator = vi.fn();

    const mockSnapshot: DocumentLayoutSnapshot = {
      documentKind: "schedule-xlsx",
      variant: "template1",
      activeRevisionId: "active-rev-456",
      usingBuiltInDefault: false,
      updatedAt: "2026-09-21T00:00:00Z",
      definition,
      capabilities: {
        editableProperties: [],
        protectedBlockIds: [],
        protectedProperties: [],
        blockCapabilities: []
      }
    };

    const service = createDocumentLayoutPreviewArtifactService({
      tempRoot,
      getCurrentLayout: () => mockSnapshot,
      generator: fakeGenerator
    });

    await expect(
      service.createPreview({
        definition,
        basedOnRevisionId: "stale-rev-999" // 불일치!
      })
    ).rejects.toThrow("동시성 충돌");

    expect(fakeGenerator).not.toHaveBeenCalled();
    // tempRoot 아래에 하위 디렉터리나 파일 생성 0건 확인
    const files = fs.readdirSync(tempRoot);
    expect(files).toHaveLength(0);
  });

  it("미지원 layout key: generator·file 0 차단 (N14)", async () => {
    const fakeUnsupportedDef = {
      documentKind: "unknown-pdf" as unknown as "proposal-pdf",
      schemaVersion: "1.0",
      generatorCompatibilityVersion: "built-in-pdf-layout-v1",
      outputs: [
        {
          memberId: "main" as const,
          canvas: { unit: "mm" as const, width: 210, height: 297 },
          outputFileNamePattern: "unknown.pdf",
          blocks: []
        }
      ]
    } as unknown as DocumentLayoutDefinition;

    const fakeGenerator = vi.fn();
    const service = createDocumentLayoutPreviewArtifactService({
      tempRoot,
      generator: fakeGenerator
    });

    await expect(
      service.createPreview({
        definition: fakeUnsupportedDef,
        basedOnRevisionId: null
      })
    ).rejects.toThrow(/지원하지 않는/);

    expect(fakeGenerator).not.toHaveBeenCalled();
    const files = fs.readdirSync(tempRoot);
    expect(files).toHaveLength(0);
  });

  it("PDF layout keys(proposal-pdf, dashboard-report-pdf) 정상 미리보기 생성 및 resolve (T7)", async () => {
    const pdfKeys: Array<Parameters<typeof getDefaultDocumentLayoutDefinition>[0]> = [
      { documentKind: "proposal-pdf" },
      { documentKind: "dashboard-report-pdf" }
    ];

    const service = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      tempRoot,
      getCurrentLayout: (k) => ({
        documentKind: k.documentKind,
        variant: "variant" in k ? k.variant : undefined,
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition: getDefaultDocumentLayoutDefinition(k),
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      })
    });

    for (const key of pdfKeys) {
      const definition = getDefaultDocumentLayoutDefinition(key);
      const preview = await service.createPreview({
        definition,
        basedOnRevisionId: null
      });

      expect(preview.previewId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      const expectedOutputsCount = key.documentKind === "proposal-pdf" ? 3 : 1;
      expect(preview.outputs).toHaveLength(expectedOutputsCount);

      for (const output of preview.outputs) {
        expect(output.previewUrl).toBe(
          `/api/document-layout-previews/${preview.previewId}/${output.memberId}`
        );
        const resolved = service.resolveArtifact(preview.previewId, output.memberId);
        expect(resolved).not.toBeNull();
        expect(resolved!.mediaType).toBe("application/pdf");
        expect(resolved!.bytes.length).toBeGreaterThan(0);
        expect(resolved!.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      }
    }
  });

  it("유효 resolve: bytes/media type/safe file name 일치", async () => {
    const fakeId = "22222222-3333-4444-5555-666666666666";
    const definition = getDefaultDocumentLayoutDefinition({
      documentKind: "proposal-xlsx"
    });
    const expectedBytes = Buffer.from("test-excel-binary-data");

    const service = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      generateId: () => fakeId,
      tempRoot,
      getCurrentLayout: () => ({
        documentKind: "proposal-xlsx",
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition,
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      }),
      generator: async ({ outputDir }) => {
        const filePath = path.join(outputDir, "proposal.xlsx");
        fs.writeFileSync(filePath, expectedBytes);
        return {
          artifacts: [
            {
              memberId: "proposal" as const,
              mediaType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
              filePath,
              fileName: "proposal.xlsx"
            }
          ] as [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]],
          validationIssues: []
        };
      }
    });

    await service.createPreview({
      definition,
      basedOnRevisionId: null
    });

    const resolved = service.resolveArtifact(fakeId, "proposal");
    expect(resolved).not.toBeNull();
    expect(resolved?.bytes.equals(expectedBytes)).toBe(true);
    expect(resolved?.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(resolved?.fileName).toBe("proposal.xlsx");
  });

  it("만료 artifact: 접근 거부 후 cleanup 시도", async () => {
    const fakeId = "33333333-4444-5555-6666-777777777777";
    const definition = getDefaultDocumentLayoutDefinition({
      documentKind: "attachment1-xlsx"
    });

    let currentTime = fixedTime;
    const service = createDocumentLayoutPreviewArtifactService({
      clock: () => currentTime,
      generateId: () => fakeId,
      tempRoot,
      getCurrentLayout: () => ({
        documentKind: "attachment1-xlsx",
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition,
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      }),
      generator: async ({ outputDir }) => {
        const filePath = path.join(outputDir, "att1.xlsx");
        fs.writeFileSync(filePath, Buffer.from("temp"));
        return {
          artifacts: [
            {
              memberId: "attachment1" as const,
              mediaType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
              filePath,
              fileName: "att1.xlsx"
            }
          ] as [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]],
          validationIssues: []
        };
      }
    });

    await service.createPreview({
      definition,
      basedOnRevisionId: null
    });

    const targetDir = path.join(tempRoot, fakeId);
    expect(fs.existsSync(targetDir)).toBe(true);

    // 10분 1초 경과
    currentTime = fixedTime + 10 * 60 * 1000 + 1000;

    const resolved = service.resolveArtifact(fakeId, "attachment1");
    expect(resolved).toBeNull();
    // 디렉터리 정리 시도 확인
    expect(fs.existsSync(targetDir)).toBe(false);
  });

  it("적대 공격 방어: sibling/root-symlink/nested-junction/Windows 경계 공격 차단 및 sentinel 보존", async () => {
    const service = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      tempRoot
    });

    // 1. N5: 잘못된 UUID 형식
    expect(service.resolveArtifact("not-a-uuid", "main")).toBeNull();
    expect(service.resolveArtifact("", "main")).toBeNull();

    // 2. N5: 존재하지 않는 manifest
    expect(
      service.resolveArtifact(
        "99999999-9999-9999-9999-999999999999",
        "main"
      )
    ).toBeNull();

    // 3. N5: Path traversal 공격 시도 (memberId)
    expect(
      service.resolveArtifact(
        "11111111-2222-3333-4444-555555555555",
        "../../etc/passwd"
      )
    ).toBeNull();
    expect(
      service.resolveArtifact(
        "11111111-2222-3333-4444-555555555555",
        "..\\..\\windows\\system32"
      )
    ).toBeNull();

    // 4. N1 / C3C-01: Sibling 디렉터리 공격 방어
    const siblingUuid = "44444444-5555-6666-7777-888888888888";
    const siblingDir = path.join(tempRoot, `${siblingUuid}-evil`);
    fs.mkdirSync(siblingDir, { recursive: true });
    const siblingSentinelFile = path.join(siblingDir, "sibling-sentinel.xlsx");
    const siblingSentinelBytes = Buffer.from("CRITICAL_SIBLING_SENTINEL_CONTENT");
    fs.writeFileSync(siblingSentinelFile, siblingSentinelBytes);
    expect(fs.existsSync(siblingSentinelFile)).toBe(true);

    const maliciousSiblingGenerator = vi.fn(async ({ outputDir }) => {
      fs.writeFileSync(path.join(outputDir, "dummy.xlsx"), Buffer.from("dummy"));
      return {
        artifacts: [
          {
            memberId: "main" as const,
            mediaType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
            filePath: siblingSentinelFile,
            fileName: "sibling-sentinel.xlsx"
          }
        ] as [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]],
        validationIssues: []
      };
    });

    const definition = getDefaultDocumentLayoutDefinition({
      documentKind: "proposal-xlsx"
    });

    const siblingAttackService = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      generateId: () => siblingUuid,
      tempRoot,
      getCurrentLayout: () => ({
        documentKind: "proposal-xlsx",
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition,
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      }),
      generator: maliciousSiblingGenerator
    });

    await expect(
      siblingAttackService.createPreview({
        definition,
        basedOnRevisionId: null
      })
    ).rejects.toThrow();

    expect(siblingAttackService.resolveArtifact(siblingUuid, "main")).toBeNull();
    expect(fs.existsSync(siblingSentinelFile)).toBe(true);
    expect(fs.readFileSync(siblingSentinelFile).equals(siblingSentinelBytes)).toBe(true);

    // 5. N2 / C3C-01: Symlink / Junction root 우회 공격 방어
    const outsideTemp = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-outside-sentinel-"));
    const outsideSentinelFile = path.join(outsideTemp, "external-secret.xlsx");
    const outsideSentinelBytes = Buffer.from("HIGHLY_CONFIDENTIAL_EXTERNAL_DATA");
    fs.writeFileSync(outsideSentinelFile, outsideSentinelBytes);
    expect(fs.existsSync(outsideSentinelFile)).toBe(true);

    const normalUuid = "55555555-6666-7777-8888-999999999999";
    const normalGenerator = vi.fn(async ({ outputDir }) => {
      const normalFile = path.join(outputDir, "preview.xlsx");
      fs.writeFileSync(normalFile, Buffer.from("normal-preview-content"));
      return {
        artifacts: [
          {
            memberId: "main" as const,
            mediaType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
            filePath: normalFile,
            fileName: "preview.xlsx"
          }
        ] as [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]],
        validationIssues: []
      };
    });

    const symlinkAttackService = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      generateId: () => normalUuid,
      tempRoot,
      getCurrentLayout: () => ({
        documentKind: "proposal-xlsx",
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition,
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      }),
      generator: normalGenerator
    });

    await symlinkAttackService.createPreview({
      definition,
      basedOnRevisionId: null
    });

    const outputDir = path.join(tempRoot, normalUuid);
    expect(fs.existsSync(outputDir)).toBe(true);

    fs.rmSync(outputDir, { recursive: true, force: true });
    const hijackedTargetFile = path.join(outsideTemp, "preview.xlsx");
    fs.writeFileSync(hijackedTargetFile, outsideSentinelBytes);

    const linkType = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(outsideTemp, outputDir, linkType);

    const linkStat = fs.lstatSync(outputDir);
    expect(linkStat.isSymbolicLink()).toBe(true);

    const resolvedHijacked = symlinkAttackService.resolveArtifact(normalUuid, "main");
    expect(resolvedHijacked).toBeNull();

    symlinkAttackService.clear();

    expect(fs.existsSync(outsideSentinelFile)).toBe(true);
    expect(fs.readFileSync(outsideSentinelFile).equals(outsideSentinelBytes)).toBe(true);
    expect(fs.existsSync(hijackedTargetFile)).toBe(true);
    expect(fs.readFileSync(hijackedTargetFile).equals(outsideSentinelBytes)).toBe(true);

    if (fs.existsSync(outputDir)) {
      if (process.platform === "win32") {
        fs.rmdirSync(outputDir);
      } else {
        fs.unlinkSync(outputDir);
      }
    }
    fs.rmSync(outsideTemp, { recursive: true, force: true });

    // 6. N3 / C3C-01: outputDir 내부 중첩 디렉터리 junction/symlink 공격 방어 및 cleanup 후 외부 보존
    const nestedOutsideTemp = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-nested-outside-"));
    const nestedSentinelFile = path.join(nestedOutsideTemp, "secret-nested.xlsx");
    const nestedSentinelBytes = Buffer.from("NESTED_SENTINEL_CRITICAL_BYTES");
    fs.writeFileSync(nestedSentinelFile, nestedSentinelBytes);
    expect(fs.existsSync(nestedSentinelFile)).toBe(true);

    const nestedAttackUuid = "66666666-7777-8888-9999-000000000000";
    const nestedGenerator = vi.fn(async ({ outputDir: outDir }) => {
      const subDir = path.join(outDir, "sub");
      fs.mkdirSync(subDir, { recursive: true });
      const junctionPath = path.join(subDir, "link-to-outside");
      fs.symlinkSync(nestedOutsideTemp, junctionPath, linkType);

      return {
        artifacts: [
          {
            memberId: "main" as const,
            mediaType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
            filePath: path.join(junctionPath, "secret-nested.xlsx"),
            fileName: "sub/link-to-outside/secret-nested.xlsx"
          }
        ] as [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]],
        validationIssues: []
      };
    });

    const nestedAttackService = createDocumentLayoutPreviewArtifactService({
      clock: () => fixedTime,
      generateId: () => nestedAttackUuid,
      tempRoot,
      getCurrentLayout: () => ({
        documentKind: "proposal-xlsx",
        activeRevisionId: null,
        usingBuiltInDefault: true,
        updatedAt: null,
        definition,
        capabilities: {
          editableProperties: [],
          protectedBlockIds: [],
          protectedProperties: [],
          blockCapabilities: []
        }
      }),
      generator: nestedGenerator
    });

    await expect(
      nestedAttackService.createPreview({
        definition,
        basedOnRevisionId: null
      })
    ).rejects.toThrow();

    expect(nestedAttackService.resolveArtifact(nestedAttackUuid, "main")).toBeNull();
    // 실패 시 safeCleanupDir이 실행된 뒤에도 외부 sentinel 파일은 온전히 보존되어야 함
    expect(fs.existsSync(nestedSentinelFile)).toBe(true);
    expect(fs.readFileSync(nestedSentinelFile).equals(nestedSentinelBytes)).toBe(true);
    fs.rmSync(nestedOutsideTemp, { recursive: true, force: true });

    // 7. N4 / C3C-01: Windows drive, ADS, UNC, traversal, backslash 등 잘못된 상대 경로 입력 방어
    const invalidPaths = [
      "C:evil.xlsx",
      "file.xlsx:stream",
      "a/../b.xlsx",
      "a\\b.xlsx",
      "/abs/file.xlsx",
      "//unc/share/file.xlsx",
      "a//b.xlsx",
      "nul.xlsx",
      "con/file.xlsx",
      "com1",
      "bad_name. /file.xlsx"
    ];

    for (const badPath of invalidPaths) {
      const badUuid = "77777777-8888-9999-0000-111111111111";
      const badGenerator = vi.fn(async ({ outputDir: outDir }) => {
        const dummy = path.join(outDir, "dummy.xlsx");
        fs.writeFileSync(dummy, Buffer.from("dummy"));
        return {
          artifacts: [
            {
              memberId: "main" as const,
              mediaType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
              filePath: dummy,
              fileName: badPath
            }
          ] as [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]],
          validationIssues: []
        };
      });

      const badService = createDocumentLayoutPreviewArtifactService({
        clock: () => fixedTime,
        generateId: () => badUuid,
        tempRoot,
        getCurrentLayout: () => ({
          documentKind: "proposal-xlsx",
          activeRevisionId: null,
          usingBuiltInDefault: true,
          updatedAt: null,
          definition,
          capabilities: {
            editableProperties: [],
            protectedBlockIds: [],
            protectedProperties: [],
            blockCapabilities: []
          }
        }),
        generator: badGenerator
      });

      await expect(
        badService.createPreview({
          definition,
          basedOnRevisionId: null
        })
      ).rejects.toThrow();

      expect(badService.resolveArtifact(badUuid, "main")).toBeNull();
    }
  });
});
