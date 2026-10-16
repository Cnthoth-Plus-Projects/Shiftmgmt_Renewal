// 화면을 실제 크롬으로 열어 PNG로 찍는다(절대 규칙 12 — 코드만 보고 「됐다」고 하지 않는다).
//
//   npm run capture -- http://127.0.0.1:8734/ artifacts/captures/home.png [폭] [높이]
//
// 설치된 크롬만 쓴다(브라우저를 내려받지 않는다).
// 서버 연결(/api/health 200) · 상태 줄 「서버 연결됨」 · 글꼴 준비를 기다린 뒤 찍는다.
// 콘솔 오류(CSP 위반 포함)나 400 이상 응답이 하나라도 있으면 목록을 내보내고 종료 코드 2로 끝난다.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import { findChrome } from "./lib/find-chrome.mjs";

const WAIT_TIMEOUT_MS = 15_000;

const [url, outArgument, widthArgument, heightArgument] = process.argv.slice(2);

if (url === undefined || outArgument === undefined) {
  process.stderr.write(
    "쓰는 법: npm run capture -- <주소> <저장할 PNG 경로> [폭=1440] [높이=900]\n" +
      "예: npm run capture -- http://127.0.0.1:8734/ artifacts/captures/home.png\n"
  );
  process.exit(1);
}

const width = Number.parseInt(widthArgument ?? "1440", 10) || 1440;
const height = Number.parseInt(heightArgument ?? "900", 10) || 900;
const outPath = path.resolve(outArgument);

let chrome;

try {
  chrome = findChrome();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

process.stdout.write(`크롬: ${chrome.path} · 판 ${chrome.version}\n`);

mkdirSync(path.dirname(outPath), { recursive: true });

const consoleErrors = [];
const badResponses = [];

const browser = await chromium.launch({ executablePath: chrome.path });
const context = await browser.newContext({ viewport: { width, height } });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

page.on("pageerror", (error) => {
  consoleErrors.push(`페이지 오류: ${error.message}`);
});

page.on("requestfailed", (request) => {
  consoleErrors.push(`요청 실패: ${request.url()} (${request.failure()?.errorText ?? "이유 불명"})`);
});

page.on("response", (response) => {
  if (response.status() >= 400) {
    badResponses.push(`${response.status()} ${response.url()}`);
  }
});

/** 기다리는 일마다 상한을 씌운다(멈춘 채로 영원히 기다리지 않게). */
function withTimeout(promise, milliseconds, what) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${what} 을(를) ${milliseconds / 1000}초 안에 마치지 못했습니다.`));
      }, milliseconds);
    })
  ]).finally(() => {
    clearTimeout(timer);
  });
}

let failure = null;

try {
  const healthResponse = page.waitForResponse(
    (response) => response.url().includes("/api/health") && response.status() === 200,
    { timeout: WAIT_TIMEOUT_MS }
  );

  // 페이지 열기가 먼저 실패해도 이 기다림이 「아무도 안 받은 거절」이 되지 않게 미리 받아 둔다
  // (그래야 아래 catch 로 내려가 한국어 안내 + 종료 코드 2 로 끝난다).
  healthResponse.catch(() => undefined);

  await page.goto(url, { waitUntil: "load", timeout: WAIT_TIMEOUT_MS });
  await healthResponse;

  await page.waitForFunction(
    () => (document.getElementById("health")?.textContent ?? "").startsWith("서버 연결됨"),
    undefined,
    { timeout: WAIT_TIMEOUT_MS }
  );

  await withTimeout(
    page.evaluate(() => document.fonts.ready.then(() => true)),
    WAIT_TIMEOUT_MS,
    "글꼴 준비"
  );
  await page.screenshot({ path: outPath });
} catch (error) {
  failure = error;
}

try {
  await context.close();
  await browser.close();
} catch {
  // 크롬이 이미 닫혔으면 그만이다 — 아래 판정에는 영향이 없다.
}

if (failure !== null) {
  process.stderr.write(`화면을 찍지 못했습니다: ${failure.message}\n`);
  process.exit(2);
}

if (consoleErrors.length > 0 || badResponses.length > 0) {
  process.stderr.write("화면에 문제가 있습니다.\n");

  for (const message of consoleErrors) {
    process.stderr.write(`- 콘솔 오류: ${message}\n`);
  }

  for (const message of badResponses) {
    process.stderr.write(`- 400 이상 응답: ${message}\n`);
  }

  process.exit(2);
}

process.stdout.write(`CAPTURE_OK — ${outPath} (${width}x${height}) · 콘솔 오류 0 · 400 이상 응답 0\n`);
