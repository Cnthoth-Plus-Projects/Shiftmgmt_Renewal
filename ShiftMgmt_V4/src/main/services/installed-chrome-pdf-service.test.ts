import { existsSync, linkSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import {
  commitPdfBatchAtomically,
  commitPdfBytesAtomically,
  findInstalledChrome,
  renderHtmlToPdfBytes,
  setChromeFinderForTest,
  setChromeLauncherForTest,
  setLinkSyncForTest
} from "./installed-chrome-pdf-service";

describe("installed-chrome-pdf-service", () => {
  afterEach(() => {
    setChromeFinderForTest(null);
    setChromeLauncherForTest(null);
    setLinkSyncForTest(null);
  });

  it("실제 설치된 Chrome을 정상 탐색한다", async () => {
    const chrome = await findInstalledChrome();
    expect(chrome.path).toBeTruthy();
    expect(existsSync(chrome.path)).toBe(true);
    expect(chrome.version).toBeTruthy();
  });

  it("Chrome이 없거나 유효하지 않은 경로일 때 한국어 안전 오류를 던진다 (N5)", async () => {
    setChromeFinderForTest(() => ({ path: "C:\\non-existent-chrome\\chrome.exe", version: "0.0.0.0" }));

    await expect(findInstalledChrome()).rejects.toThrow(
      "PDF를 만들 수 없습니다. 이 컴퓨터의 크롬 설치 상태를 확인해 주세요."
    );
  });

  it("Chrome 경로가 빈 문자열일 때 거절한다 (T-C1a)", async () => {
    setChromeFinderForTest(() => ({ path: "", version: "120.0.0.0" }));

    await expect(findInstalledChrome()).rejects.toThrow(
      "PDF를 만들 수 없습니다. 이 컴퓨터의 크롬 설치 상태를 확인해 주세요."
    );
  });

  it("Chrome 경로가 파일이 아닌 디렉터리일 때 거절한다 (T-C1b)", async () => {
    setChromeFinderForTest(() => ({ path: tmpdir(), version: "120.0.0.0" }));

    await expect(findInstalledChrome()).rejects.toThrow(
      "PDF를 만들 수 없습니다. 이 컴퓨터의 크롬 설치 상태를 확인해 주세요."
    );
  });

  it("실제 Chrome을 통해 HTML을 %PDF- 바이트로 정상 렌더링한다 (T4)", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: sans-serif; font-size: 14pt; }
          </style>
        </head>
        <body>
          <h1>PDF 생성 테스트</h1>
          <p>교대근무관리 시스템 Phase 2.5-5</p>
        </body>
      </html>
    `;

    const pdfBytes = await renderHtmlToPdfBytes({ html });
    expect(Buffer.isBuffer(pdfBytes)).toBe(true);
    expect(pdfBytes.length).toBeGreaterThan(100);
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("단일 deadline 초과 시 한국어 안내 오류를 던진다 (T-C2a)", async () => {
    setChromeLauncherForTest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        newContext: async () => ({
          newPage: async () => ({
            setDefaultTimeout: () => {},
            route: async () => {},
            setContent: async () => {},
            evaluate: async () => {},
            pdf: async () => Buffer.from("%PDF-mock"),
            close: async () => {}
          }),
          close: async () => {}
        }),
        close: async () => {}
      } as unknown as Browser;
    });

    await expect(
      renderHtmlToPdfBytes({ html: "<h1>Timeout</h1>", timeoutMs: 50 })
    ).rejects.toThrow("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("late launcher acquisition: deadline 초과 후 브라우저가 resolve되어도 즉시 close되고 추가 렌더 0 (T-C2a-late-launcher)", async () => {
    let lateBrowserClosed = false;
    let newContextCalled = false;

    setChromeLauncherForTest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        newContext: async () => {
          newContextCalled = true;
          return {
            newPage: async () => ({
              setDefaultTimeout: () => {},
              route: async () => {},
              setContent: async () => {},
              evaluate: async () => {},
              pdf: async () => Buffer.from("%PDF-mock"),
              close: async () => {}
            } as unknown as Page),
            close: async () => {}
          } as unknown as BrowserContext;
        },
        close: async () => {
          lateBrowserClosed = true;
        }
      } as unknown as Browser;
    });

    await expect(
      renderHtmlToPdfBytes({ html: "<h1>Late Launcher</h1>", timeoutMs: 15 })
    ).rejects.toThrow("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(lateBrowserClosed).toBe(true);
    expect(newContextCalled).toBe(false);
  });

  it("late context acquisition: deadline 초과 후 context가 resolve되어도 즉시 close되고 추가 렌더 0 (T-C2a-late-context)", async () => {
    let lateContextClosed = false;
    let newPageCalled = false;

    setChromeLauncherForTest(async () => ({
      newContext: async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          newPage: async () => {
            newPageCalled = true;
            return {
              setDefaultTimeout: () => {},
              route: async () => {},
              setContent: async () => {},
              evaluate: async () => {},
              pdf: async () => Buffer.from("%PDF-mock"),
              close: async () => {}
            } as unknown as Page;
          },
          close: async () => {
            lateContextClosed = true;
          }
        } as unknown as BrowserContext;
      },
      close: async () => {}
    } as unknown as Browser));

    await expect(
      renderHtmlToPdfBytes({ html: "<h1>Late Context</h1>", timeoutMs: 15 })
    ).rejects.toThrow("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(lateContextClosed).toBe(true);
    expect(newPageCalled).toBe(false);
  });

  it("late page acquisition: deadline 초과 후 page가 resolve되어도 즉시 close되고 추가 렌더 0 (T-C2a-late-page)", async () => {
    let latePageClosed = false;
    let pdfCalled = false;

    setChromeLauncherForTest(async () => ({
      newContext: async () => ({
        newPage: async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return {
            setDefaultTimeout: () => {},
            route: async () => {},
            setContent: async () => {},
            evaluate: async () => {},
            pdf: async () => {
              pdfCalled = true;
              return Buffer.from("%PDF-mock");
            },
            close: async () => {
              latePageClosed = true;
            }
          } as unknown as Page;
        },
        close: async () => {}
      } as unknown as BrowserContext),
      close: async () => {}
    } as unknown as Browser));

    await expect(
      renderHtmlToPdfBytes({ html: "<h1>Late Page</h1>", timeoutMs: 15 })
    ).rejects.toThrow("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(latePageClosed).toBe(true);
    expect(pdfCalled).toBe(false);
  });

  it("page.pdf pending 타임아웃 시 제한 시간 오류 및 page/context/browser close 3종 호출 (T-C2a-pending-pdf)", async () => {
    let pageClosed = false;
    let contextClosed = false;
    let browserClosed = false;

    setChromeLauncherForTest(async () => ({
      newContext: async () => ({
        newPage: async () => ({
          setDefaultTimeout: () => {},
          route: async () => {},
          setContent: async () => {},
          evaluate: async () => {},
          pdf: () => new Promise<Buffer>(() => {}), // 영원히 pending
          close: async () => {
            pageClosed = true;
          }
        } as unknown as Page),
        close: async () => {
          contextClosed = true;
        }
      } as unknown as BrowserContext),
      close: async () => {
        browserClosed = true;
      }
    } as unknown as Browser));

    await expect(
      renderHtmlToPdfBytes({ html: "<h1>Pending PDF</h1>", timeoutMs: 25 })
    ).rejects.toThrow("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");

    expect(pageClosed).toBe(true);
    expect(contextClosed).toBe(true);
    expect(browserClosed).toBe(true);
  });

  it("외부 네트워크 요청(http/https)은 차단된다 (N7)", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
        </head>
        <body>
          <h1>외부 요청 차단 테스트</h1>
          <img src="http://127.0.0.1:54321/external-image.png" alt="external" />
        </body>
      </html>
    `;

    const pdfBytes = await renderHtmlToPdfBytes({ html });
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("호출자가 PDF 고정 옵션을 우회할 수 없고 고정 세 옵션으로만 호출된다 (T-C2b)", async () => {
    let capturedOptions: unknown = null;

    setChromeLauncherForTest(async () => ({
      newContext: async () => ({
        newPage: async () => ({
          setDefaultTimeout: () => {},
          route: async () => {},
          setContent: async () => {},
          evaluate: async () => {},
          pdf: async (opts: unknown) => {
            capturedOptions = opts;
            return Buffer.from("%PDF-captured");
          },
          close: async () => {}
        } as unknown as Page),
        close: async () => {}
      } as unknown as BrowserContext),
      close: async () => {}
    } as unknown as Browser));

    const result = await renderHtmlToPdfBytes({ html: "<h1>Fixed Options</h1>" });
    expect(result.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(capturedOptions).toEqual({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });
  });

  it("유효하지 않은 PDF 바이트가 반환되면 오류를 던진다 (N6)", async () => {
    setChromeLauncherForTest(async () => ({
      newContext: async () => ({
        newPage: async () => ({
          setDefaultTimeout: () => {},
          route: async () => {},
          setContent: async () => {},
          evaluate: async () => {},
          pdf: async () => Buffer.from("NOT_A_PDF_CONTENT"),
          close: async () => {}
        } as unknown as Page),
        close: async () => {}
      } as unknown as BrowserContext),
      close: async () => {}
    } as unknown as Browser));

    await expect(renderHtmlToPdfBytes({ html: "<h1>Test</h1>" })).rejects.toThrow(
      "PDF 생성 결과가 올바르지 않습니다."
    );
  });

  it("commitPdfBytesAtomically는 단일 파일을 배타적으로 생성한다", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "pdf-commit-test-"));
    try {
      const targetPath = path.join(tempDir, "output.pdf");
      const pdfBytes = Buffer.from("%PDF-1.4 sample content");

      await commitPdfBytesAtomically(targetPath, pdfBytes);

      expect(existsSync(targetPath)).toBe(true);
      expect(readFileSync(targetPath).toString("ascii")).toBe("%PDF-1.4 sample content");

      // 이미 존재할 때 재시도하면 거절
      await expect(commitPdfBytesAtomically(targetPath, pdfBytes)).rejects.toThrow(
        "대상 파일이 이미 존재합니다"
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("commitPdfBatchAtomically는 첫 link 성공 후 둘째 link 실패 시 역순 롤백하고 temp 0개 (T-C3a, mid-commit)", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "pdf-midcommit-test-"));
    let linkCallCount = 0;
    let firstLinkSucceeded = false;
    setLinkSyncForTest((src, dst) => {
      linkCallCount++;
      linkSync(src, dst);
      if (linkCallCount === 1) {
        firstLinkSucceeded = true;
      }
    });

    try {
      const existingFile = path.join(tempDir, "existing.pdf");
      writeFileSync(existingFile, "PRE_EXISTING_CONTENT");

      // targetA는 호출 전 존재하지 않음
      const targetA = path.join(tempDir, "targetA.pdf");
      const targetB = path.join(tempDir, "targetB.pdf");

      // task1과 task2가 동일한 targetA를 가리킴:
      // 선검사 통과(호출 전 targetA 없음) -> task1 linkSync 성공 -> task2 linkSync EEXIST 실패!
      const tasks = [
        { targetPath: targetA, pdfBytes: Buffer.from("%PDF-1") },
        { targetPath: targetA, pdfBytes: Buffer.from("%PDF-2-DUPLICATE") },
        { targetPath: targetB, pdfBytes: Buffer.from("%PDF-3") }
      ];

      await expect(commitPdfBatchAtomically(tasks)).rejects.toThrow(
        "대상 파일이 이미 존재합니다"
      );

      // linkSync가 2회 호출되었고 첫 번째 호출이 실제 성공했음을 관측
      expect(linkCallCount).toBe(2);
      expect(firstLinkSucceeded).toBe(true);

      // 롤백으로 인해 첫째로 링크되었던 targetA가 삭제되었어야 함
      expect(existsSync(targetA)).toBe(false);
      expect(existsSync(targetB)).toBe(false);

      // 기존 파일은 그대로 보존되어야 함
      expect(existsSync(existingFile)).toBe(true);
      expect(readFileSync(existingFile, "utf8")).toBe("PRE_EXISTING_CONTENT");

      // 임시 파일(.tmp) 잔여물이 전혀 남지 않았는지 확인
      const allFiles = readdirSync(tempDir);
      const tmpFiles = allFiles.filter((f) => f.includes(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    } finally {
      setLinkSyncForTest(null);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("타겟 파일 사전 존재 시 선검사 거절 및 기존 파일 보존/temp 0개 (T-C3b, N8)", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "pdf-preexist-test-"));
    try {
      const targetPath = path.join(tempDir, "preexisting.pdf");
      writeFileSync(targetPath, "ORIGINAL");

      await expect(
        commitPdfBytesAtomically(targetPath, Buffer.from("%PDF-NEW"))
      ).rejects.toThrow("대상 파일이 이미 존재합니다");

      const remainingFiles = readdirSync(tempDir);
      expect(remainingFiles).toEqual(["preexisting.pdf"]);
      expect(readFileSync(targetPath, "utf8")).toBe("ORIGINAL");

      const allFiles = readdirSync(tempDir);
      const tmpFiles = allFiles.filter((f) => f.includes(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

