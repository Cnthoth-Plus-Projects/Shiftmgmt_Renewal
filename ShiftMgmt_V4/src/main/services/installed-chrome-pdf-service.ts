import { existsSync, linkSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface FindChromeResult {
  path: string;
  version: string;
}

type FindChromeFn = () => FindChromeResult;

let cachedFinderFn: FindChromeFn | null = null;
let customChromeLauncherForTest:
  | ((options: { executablePath: string; headless: boolean }) => Promise<Browser>)
  | null = null;

export const setChromeLauncherForTest = (
  launcher: ((options: { executablePath: string; headless: boolean }) => Promise<Browser>) | null
) => {
  customChromeLauncherForTest = launcher;
};

export const setChromeFinderForTest = (finder: FindChromeFn | null) => {
  cachedFinderFn = finder;
};

let customLinkSyncForTest: typeof linkSync | null = null;

export const setLinkSyncForTest = (fn: typeof linkSync | null) => {
  customLinkSyncForTest = fn;
};

const loadFindChromeModule = async (): Promise<FindChromeFn> => {
  if (cachedFinderFn) {
    return cachedFinderFn;
  }

  const candidatePaths = [
    path.resolve(__dirname, "../../../../scripts/lib/find-chrome.mjs"),
    path.resolve(process.cwd(), "scripts/lib/find-chrome.mjs")
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      try {
        const moduleUrl = pathToFileURL(candidatePath).href;
        let mod: { findChrome?: FindChromeFn } | undefined;
        try {
          // Vitest / Vite 환경
          mod = (await import(/* @vite-ignore */ moduleUrl)) as { findChrome?: FindChromeFn };
        } catch {
          // Node.js CommonJS 환경
          const dynamicImport = new Function("specifier", "return import(specifier)") as (
            specifier: string
          ) => Promise<{ findChrome?: FindChromeFn }>;
          mod = await dynamicImport(moduleUrl);
        }

        if (typeof mod?.findChrome === "function") {
          cachedFinderFn = mod.findChrome;
          return mod.findChrome;
        }
      } catch (_e) {
        // 다음 경로 계속 탐색
      }
    }
  }

  throw new Error("PDF를 만들 수 없습니다. 이 컴퓨터의 크롬 설치 상태를 확인해 주세요.");
};

export const findInstalledChrome = async (): Promise<FindChromeResult> => {
  try {
    const finder = await loadFindChromeModule();
    const result = finder();
    if (
      !result ||
      typeof result !== "object" ||
      typeof result.path !== "string" ||
      result.path.length === 0 ||
      typeof result.version !== "string" ||
      result.version.length === 0 ||
      !existsSync(result.path) ||
      !statSync(result.path).isFile()
    ) {
      throw new Error("Chrome execution binary not found");
    }
    return result;
  } catch {
    throw new Error("PDF를 만들 수 없습니다. 이 컴퓨터의 크롬 설치 상태를 확인해 주세요.");
  }
};

export interface RenderHtmlToPdfInput {
  html: string;
  timeoutMs?: number;
}

const CHROME_PERFORMANCE_FLAGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-component-update",
  "--disable-background-networking",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--hide-scrollbars",
  "--mute-audio",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-breakpad",
  "--disable-crash-reporter",
  "--disable-domain-reliability",
  "--metrics-recording-only"
];

const cleanupResource = async (res: { close?: () => Promise<unknown> } | null | undefined): Promise<void> => {
  if (!res || typeof res.close !== "function") return;
  try {
    await res.close();
  } catch {
    /* 무시 */
  }
};

class TimedRenderSession {
  private timedOut = false;
  private timer: NodeJS.Timeout | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Page[] = [];

  constructor(public readonly timeoutMs: number) {}

  public isTimedOut(): boolean {
    return this.timedOut;
  }

  public markTimedOut(): void {
    this.timedOut = true;
  }

  public setTimer(timer: NodeJS.Timeout): void {
    this.timer = timer;
  }

  public clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public checkDeadline(): void {
    if (this.timedOut) {
      const err = new Error("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
      err.name = "TimeoutError";
      throw err;
    }
  }

  public async adoptBrowser(browser: Browser): Promise<Browser> {
    if (this.timedOut) {
      await cleanupResource(browser);
      this.checkDeadline();
    }
    this.browser = browser;
    return browser;
  }

  public async adoptContext(context: BrowserContext): Promise<BrowserContext> {
    if (this.timedOut) {
      await cleanupResource(context);
      this.checkDeadline();
    }
    this.context = context;
    return context;
  }

  public async adoptPage(page: Page): Promise<Page> {
    if (this.timedOut) {
      await cleanupResource(page);
      this.checkDeadline();
    }
    this.pages.push(page);
    return page;
  }

  public async closePage(page: Page): Promise<void> {
    const idx = this.pages.indexOf(page);
    if (idx !== -1) {
      this.pages.splice(idx, 1);
    }
    await cleanupResource(page);
  }

  public async cleanupAll(): Promise<void> {
    this.clearTimer();
    for (const page of [...this.pages]) {
      await cleanupResource(page);
    }
    this.pages = [];
    if (this.context) {
      const ctx = this.context;
      this.context = null;
      await cleanupResource(ctx);
    }
    if (this.browser) {
      const b = this.browser;
      this.browser = null;
      await cleanupResource(b);
    }
  }
}

export const renderHtmlToPdfBytes = async (
  input: string | RenderHtmlToPdfInput
): Promise<Buffer> => {
  const options: RenderHtmlToPdfInput = typeof input === "string" ? { html: input } : input;
  const timeoutMs = options.timeoutMs ?? 30000;
  const session = new TimedRenderSession(timeoutMs);

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      session.markTimedOut();
      void session.cleanupAll();
      const err = new Error("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
    session.setTimer(timer);
  });

  const renderPromise = (async (): Promise<Buffer> => {
    session.checkDeadline();
    const chrome = await findInstalledChrome();
    session.checkDeadline();

    const launchFn = customChromeLauncherForTest ?? chromium.launch.bind(chromium);
    const rawBrowser = await launchFn({
      executablePath: chrome.path,
      headless: true,
      args: CHROME_PERFORMANCE_FLAGS
    });
    const browser = await session.adoptBrowser(rawBrowser);

    session.checkDeadline();
    const rawContext = await browser.newContext();
    const context = await session.adoptContext(rawContext);

    session.checkDeadline();
    const rawPage = await context.newPage();
    const page = await session.adoptPage(rawPage);
    page.setDefaultTimeout(timeoutMs);

    session.checkDeadline();
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") {
        route.continue();
      } else {
        route.abort();
      }
    });

    session.checkDeadline();
    await page.setContent(options.html, { waitUntil: "domcontentloaded" });

    if (options.html.includes("@font-face")) {
      session.checkDeadline();
      try {
        await page.evaluate(async () => {
          const doc = (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document;
          if (doc?.fonts?.ready) {
            await Promise.race([
              doc.fonts.ready,
              new Promise((resolve) => setTimeout(resolve, 10))
            ]);
          }
        });
      } catch {
        /* 무시 */
      }
    }

    session.checkDeadline();
    const pdfBufferRaw = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });
    session.checkDeadline();

    const pdfBuffer = Buffer.isBuffer(pdfBufferRaw) ? pdfBufferRaw : Buffer.from(pdfBufferRaw);
    if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("PDF 생성 결과가 올바르지 않습니다.");
    }

    return pdfBuffer;
  })();

  renderPromise.catch(() => {});

  try {
    return await Promise.race([renderPromise, timeoutPromise]);
  } catch (err: unknown) {
    const error = err as Error;
    if (
      session.isTimedOut() ||
      error?.name === "TimeoutError" ||
      error?.message?.includes("초과") ||
      error?.message?.includes("Timeout") ||
      error?.message?.includes("timeout")
    ) {
      throw new Error("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (
      error?.message?.includes("크롬 설치 상태") ||
      error?.message?.includes("PDF 생성 결과")
    ) {
      throw error;
    }
    throw new Error("PDF를 생성하는 중 오류가 발생했습니다.");
  } finally {
    await session.cleanupAll();
  }
};

export const renderHtmlBatchToPdfBytes = async (
  htmlList: string[],
  options?: { timeoutMs?: number }
): Promise<Buffer[]> => {
  if (htmlList.length === 0) return [];
  if (htmlList.length === 1) {
    const single = await renderHtmlToPdfBytes({ html: htmlList[0]!, timeoutMs: options?.timeoutMs });
    return [single];
  }

  const timeoutMs = options?.timeoutMs ?? 30000;
  const session = new TimedRenderSession(timeoutMs);

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      session.markTimedOut();
      void session.cleanupAll();
      const err = new Error("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
    session.setTimer(timer);
  });

  const renderPromise = (async (): Promise<Buffer[]> => {
    session.checkDeadline();
    const chrome = await findInstalledChrome();
    session.checkDeadline();

    const launchFn = customChromeLauncherForTest ?? chromium.launch.bind(chromium);
    const rawBrowser = await launchFn({
      executablePath: chrome.path,
      headless: true,
      args: CHROME_PERFORMANCE_FLAGS
    });
    const browser = await session.adoptBrowser(rawBrowser);

    session.checkDeadline();
    const rawContext = await browser.newContext();
    const context = await session.adoptContext(rawContext);

    const renderPage = async (html: string): Promise<Buffer> => {
      session.checkDeadline();
      const rawPage = await context.newPage();
      const page = await session.adoptPage(rawPage);
      page.setDefaultTimeout(timeoutMs);

      session.checkDeadline();
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith("data:") || url === "about:blank") {
          route.continue();
        } else {
          route.abort();
        }
      });

      session.checkDeadline();
      await page.setContent(html, { waitUntil: "domcontentloaded" });

      if (html.includes("@font-face")) {
        session.checkDeadline();
        try {
          await page.evaluate(async () => {
            const doc = (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document;
            if (doc?.fonts?.ready) {
              await Promise.race([
                doc.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, 10))
              ]);
            }
          });
        } catch {
          /* 무시 */
        }
      }

      session.checkDeadline();
      const pdfBufferRaw = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false
      });
      session.checkDeadline();

      const pdfBuffer = Buffer.isBuffer(pdfBufferRaw) ? pdfBufferRaw : Buffer.from(pdfBufferRaw);
      if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("PDF 생성 결과가 올바르지 않습니다.");
      }
      await session.closePage(page);
      return pdfBuffer;
    };

    return await Promise.all(htmlList.map((html) => renderPage(html)));
  })();

  renderPromise.catch(() => {});

  try {
    return await Promise.race([renderPromise, timeoutPromise]);
  } catch (err: unknown) {
    const error = err as Error;
    if (
      session.isTimedOut() ||
      error?.name === "TimeoutError" ||
      error?.message?.includes("초과") ||
      error?.message?.includes("Timeout") ||
      error?.message?.includes("timeout")
    ) {
      throw new Error("PDF 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (
      error?.message?.includes("크롬 설치 상태") ||
      error?.message?.includes("PDF 생성 결과")
    ) {
      throw error;
    }
    throw new Error("PDF를 생성하는 중 오류가 발생했습니다.");
  } finally {
    await session.cleanupAll();
  }
};

export const commitPdfBytesAtomically = async (
  targetPath: string,
  pdfBytes: Buffer
): Promise<void> => {
  await commitPdfBatchAtomically([{ targetPath, pdfBytes }]);
};

export interface PdfBatchCommitTask {
  targetPath: string;
  pdfBytes?: Buffer;
  bytes?: Buffer;
}

export const commitPdfBatchAtomically = async (
  tasks: PdfBatchCommitTask[]
): Promise<void> => {
  if (tasks.length === 0) {
    return;
  }

  // 1단계: 선검사 - 대상 파일 이미 존재하는지 확인
  for (const task of tasks) {
    if (existsSync(task.targetPath)) {
      throw new Error(`[PDF 저장 오류] 대상 파일이 이미 존재합니다: ${task.targetPath}`);
    }
  }

  const tempFiles: Array<{ tempPath: string; targetPath: string }> = [];
  const committedFiles: string[] = [];

  try {
    // 2단계: 대상 디렉터리에 임시 파일 생성 및 쓰기 (wx 플래그)
    for (const task of tasks) {
      const parentDir = path.dirname(task.targetPath);
      mkdirSync(parentDir, { recursive: true });

      const baseName = path.basename(task.targetPath);
      const tempName = `.${baseName}.${randomUUID()}.tmp`;
      const tempPath = path.resolve(parentDir, tempName);

      const bytes = task.pdfBytes ?? task.bytes;
      if (!bytes) {
        throw new Error("PDF bytes가 누락되었습니다.");
      }

      writeFileSync(tempPath, bytes, { flag: "wx" });
      tempFiles.push({ tempPath, targetPath: task.targetPath });
    }

    // 3단계: 배타적 하드링크 생성 및 임시 파일 해제
    const linkFn = customLinkSyncForTest ?? linkSync;
    for (const { tempPath, targetPath } of tempFiles) {
      try {
        linkFn(tempPath, targetPath);
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error?.code === "EEXIST") {
          throw new Error(`[PDF 저장 오류] 대상 파일이 이미 존재합니다: ${targetPath}`);
        }
        throw error;
      }
      committedFiles.push(targetPath);
      unlinkSync(tempPath);
    }
  } catch (error) {
    // 롤백: 이번 배치 호출에서 새로 생성된 파일만 역순으로 삭제
    for (const committedPath of committedFiles.reverse()) {
      try {
        if (existsSync(committedPath)) {
          unlinkSync(committedPath);
        }
      } catch {
        /* 무시 */
      }
    }
    throw error;
  } finally {
    // 잔여 임시 파일 정리
    for (const { tempPath } of tempFiles) {
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {
        /* 무시 */
      }
    }
  }
};

