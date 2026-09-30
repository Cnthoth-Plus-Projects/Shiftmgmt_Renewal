// 설치된 Chrome 기반 공통 UI 검증 실행기
// 브라우저를 임의로 내려받지 않고 로컬에 설치된 크롬을 사용한다.
// URL 검문 -> 서버 건강 상태 확인(/api/health) -> 뷰포트 1440x900 크롬 실행 ->
// 콘솔/페이지/요청/HTTP 오류 계측 -> steps 실행 -> 캡처 및 manifest.json 기록 -> 브라우저 종료.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import { findChrome } from "./find-chrome.mjs";

/**
 * 대상 주소 검문:
 * - http 프로토콜만 허용 (https 거부)
 * - 127.0.0.1 호스트만 허용 (localhost, 외부 도메인/IP 거부)
 * - 사용자 정보(userinfo) 거부
 * - 루트 경로('/')만 허용
 * - 쿼리스트링 및 해시 거부
 * 위반 시 Error를 던진다.
 */
export function validateTargetUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error("대상 주소가 지정되지 않았습니다. 예: http://127.0.0.1:18735/");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`올바른 주소 형식이 아닙니다: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:") {
    throw new Error(`http 프로토콜만 허용됩니다 (입력된 프로토콜: ${parsed.protocol})`);
  }

  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(`127.0.0.1 호스트만 허용됩니다 (입력된 호스트: ${parsed.hostname})`);
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("주소에 사용자 정보(userinfo)를 포함할 수 없습니다.");
  }

  if (parsed.pathname !== "/") {
    throw new Error(`루트 경로('/')만 허용됩니다 (입력된 경로: ${parsed.pathname})`);
  }

  if (parsed.search !== "") {
    throw new Error("주소에 검색 쿼리(?...)를 포함할 수 없습니다.");
  }

  if (parsed.hash !== "") {
    throw new Error("주소에 해시(#...)를 포함할 수 없습니다.");
  }

  return parsed;
}

/**
 * 서버 건강 상태 확인:
 * /api/health 엔드포인트의 HTTP 200 및 JSON payload.ok === true를 확인한다.
 * fetch 요청, 응답 본문 수신, JSON 파싱 전체를 timeoutMs 상한으로 묶어 지연/중단을 방지한다.
 * 실패 시 Error를 던진다.
 */
export async function checkServerHealth(baseUrl, timeoutMs = 10_000) {
  const healthUrl = new URL("/api/health", baseUrl).toString();
  const controller = new AbortController();
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`서버 건강 상태 확인 시간 초과 (${healthUrl}, ${timeoutMs}ms)`));
    }, timeoutMs);
  });

  const fetchPromise = (async () => {
    let response;
    try {
      response = await fetch(healthUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`서버 건강 상태 확인 시간 초과 (${healthUrl}, ${timeoutMs}ms)`);
      }
      throw new Error(`서버 연결 실패 (${healthUrl}): ${error.message}`);
    }

    if (response.status !== 200) {
      throw new Error(`서버 건강 상태 HTTP 응답 코드가 200이 아닙니다: ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`서버 건강 상태 확인 시간 초과 (${healthUrl}, ${timeoutMs}ms)`);
      }
      throw new Error(`서버 응답을 JSON으로 파싱하지 못했습니다: ${error.message}`);
    }

    if (!payload || payload.ok !== true) {
      throw new Error(`서버 건강 상태 응답의 ok가 true가 아닙니다: ${JSON.stringify(payload)}`);
    }

    return payload;
  })();

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/** 글꼴 준비 완료를 유한 시간 동안 기다린다. */
export async function waitForFontsReady(page, timeoutMs = 15_000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`글꼴 준비를 ${timeoutMs / 1000}초 안에 마치지 못했습니다.`));
    }, timeoutMs);
  });

  try {
    await Promise.race([
      page.evaluate(() => document.fonts.ready.then(() => true)),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 고유 실행 산출물 디렉터리 생성 (C30-05):
 * 같은 초에 동일 시나리오가 시작되어도 덮어쓰지 않도록 원자적으로 고유 접미어가 붙은 run-* 디렉터리를 생성한다.
 * @param {string} baseCapturesDir - phase3 캡처 기본 디렉터리
 * @param {string} id - 시나리오 ID
 * @returns {string} 생성된 디렉터리의 절대 경로
 */
export function createUniqueRunDir(baseCapturesDir, id) {
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error(`검증 ID는 영숫자와 하이픈만 허용됩니다: ${id}`);
  }

  const parentDir = path.join(baseCapturesDir, id);
  mkdirSync(parentDir, { recursive: true });

  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const prefix = `run-${timestamp}-`;

  return mkdtempSync(path.join(parentDir, prefix));
}

/**
 * 공통 화면 검증 실행기
 * @param {object} options
 * @param {string} options.id - 검증 시나리오 식별자 (영숫자 및 하이픈)
 * @param {string} options.url - 대상 주소 문자열
 * @param {function} options.steps - 실행할 시나리오 함수 ({ page, capture, waitForFontsReady, url })
 */
export async function runScreenCheck({ id, url: rawUrl, steps }) {
  // 1. URL 검증 (브라우저·네트워크 접근 전 실행. 실패 시 RC 1)
  let parsedUrl;
  try {
    parsedUrl = validateTargetUrl(rawUrl);
  } catch (error) {
    process.stderr.write(`[URL 검증 실패] ${error.message}\n`);
    process.exit(1);
  }

  // 2. 서버 건강 상태 확인 (실패 시 RC 2)
  let healthInfo;
  try {
    healthInfo = await checkServerHealth(parsedUrl, 10_000);
  } catch (error) {
    process.stderr.write(`[서버 확인 실패] ${error.message}\n`);
    process.exit(2);
  }

  // 3. 로컬 Chrome 탐색 (실패 시 RC 2)
  let chrome;
  try {
    chrome = findChrome();
  } catch (error) {
    process.stderr.write(`[크롬 탐색 실패] ${error.message}\n`);
    process.exit(2);
  }

  // 4. 식별자 검증 및 고유 산출물 디렉터리 준비 (C30-05)
  const repoRoot = process.cwd();
  const baseCapturesDir = path.join(repoRoot, "artifacts", "captures", "phase3");
  let runDir;
  let runRelDir;

  try {
    runDir = createUniqueRunDir(baseCapturesDir, id);
    runRelDir = path.relative(repoRoot, runDir).replace(/\\/g, "/");
  } catch (err) {
    process.stderr.write(`[디렉터리 준비 실패] ${err.message}\n`);
    process.exit(2);
  }

  const capturedFiles = [];
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailed = [];
  const badResponses = [];
  const cleanupErrors = [];

  let browser;
  let context;
  let page;
  let executionError = null;

  try {
    browser = await chromium.launch({ executablePath: chrome.path });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();

    // 브라우저 이벤트 계측 (C30-04: pageerror 분리 수집)
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("requestfailed", (request) => {
      requestFailed.push(`${request.url()} (${request.failure()?.errorText ?? "이유 불명"})`);
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        badResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    // 안전한 이름 기반 캡처 도우미
    const capture = async (name) => {
      if (!name || typeof name !== "string" || !/^[a-zA-Z0-9-]+$/.test(name)) {
        throw new Error(`캡처 이름은 영숫자와 하이픈만 허용됩니다: ${name}`);
      }
      const filename = `${name}.png`;
      const filePath = path.join(runDir, filename);
      await page.screenshot({ path: filePath, fullPage: true });
      const relPath = path.posix.join(runRelDir, filename);
      capturedFiles.push({
        name,
        filename,
        path: relPath
      });
      return filePath;
    };

    // 초기 화면 로드 및 글꼴 대기
    await page.goto(parsedUrl.toString(), { waitUntil: "load", timeout: 15_000 });
    await waitForFontsReady(page, 15_000);

    // 시나리오 실행
    await steps({
      page,
      capture,
      waitForFontsReady: (timeout) => waitForFontsReady(page, timeout),
      url: parsedUrl.toString()
    });
  } catch (error) {
    executionError = error;
  } finally {
    // C30-02: context 및 browser 종료 실패를 독립적으로 수집하고 건너뛰지 않음
    if (context) {
      try {
        await context.close();
      } catch (err) {
        cleanupErrors.push(`브라우저 컨텍스트 종료 실패: ${err.message}`);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        cleanupErrors.push(`브라우저 인스턴스 종료 실패: ${err.message}`);
      }
    }
  }

  // 초기 오류 집계
  const hasErrors =
    executionError !== null ||
    consoleErrors.length > 0 ||
    pageErrors.length > 0 ||
    requestFailed.length > 0 ||
    badResponses.length > 0 ||
    cleanupErrors.length > 0;

  const manifest = {
    status: hasErrors ? "FAIL" : "PASS",
    id,
    url: parsedUrl.toString(),
    timestamp: new Date().toISOString(),
    chrome: {
      path: chrome.path,
      version: chrome.version
    },
    viewport: {
      width: 1440,
      height: 900
    },
    captures: capturedFiles,
    serverHealth: healthInfo,
    errors: {
      executionError: executionError ? (executionError.stack || executionError.message) : null,
      manifestWriteError: null,
      consoleErrors,
      pageErrors,
      requestFailed,
      badResponses,
      cleanupErrors
    }
  };

  const manifestRelPath = path.posix.join(runRelDir, "manifest.json");
  const manifestPath = path.join(runDir, "manifest.json");
  let manifestWriteError = null;

  // C30-01: manifest 작성 실패를 명시적 오류로 전파
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch (err) {
    manifestWriteError = err;
    process.stderr.write(`[manifest 작성 오류] ${err.message}\n`);
  }

  const finalHasErrors = hasErrors || manifestWriteError !== null;

  if (finalHasErrors) {
    process.stderr.write(`\nFAIL: [UI 검증 실패: ${id}]\n`);
    if (executionError) {
      process.stderr.write(`- 실행 오류: ${executionError.message}\n`);
    }
    if (manifestWriteError) {
      process.stderr.write(`- manifest 작성 오류: ${manifestWriteError.message}\n`);
    }
    for (const msg of cleanupErrors) {
      process.stderr.write(`- 정리 오류: ${msg}\n`);
    }
    for (const msg of consoleErrors) {
      process.stderr.write(`- 콘솔 오류: ${msg}\n`);
    }
    for (const msg of pageErrors) {
      process.stderr.write(`- 페이지 오류: ${msg}\n`);
    }
    for (const msg of requestFailed) {
      process.stderr.write(`- 요청 실패: ${msg}\n`);
    }
    for (const msg of badResponses) {
      process.stderr.write(`- 400 이상 응답: ${msg}\n`);
    }
    process.stderr.write(`- manifest: ${manifestRelPath}\n`);
    process.exit(2);
  }

  process.stdout.write(`\nPASS: [UI 검증 성공: ${id}]\n`);
  process.stdout.write(`- 대상 주소: ${parsedUrl.toString()}\n`);
  process.stdout.write(`- 크롬: ${chrome.path} (판 ${chrome.version})\n`);
  process.stdout.write(`- 뷰포트: 1440x900 (fullPage)\n`);
  process.stdout.write(`- 캡처 산출물 (${capturedFiles.length}개):\n`);
  for (const c of capturedFiles) {
    process.stdout.write(`  * ${c.name}: ${c.path}\n`);
  }
  process.stdout.write(`- manifest: ${manifestRelPath}\n`);
  process.stdout.write(`- 콘솔/페이지/요청/HTTP/정리 오류: 0건\n`);
}
