import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WAIT_TIMEOUT_MS = 15_000;
const v4Root = process.env.SHIFTMGMT_V4_ROOT ?? "C:\\Projects\\Active\\ShiftMgmt_V4";
const url = process.argv[2];
const screenshotPath = process.argv[3];

if (!url || !screenshotPath) {
  console.error("사용법: node verify-health-bridge.mjs <URL> <스크린샷 경로>");
  process.exit(2);
}

const requireFromV4 = createRequire(path.join(v4Root, "package.json"));
const { chromium } = requireFromV4("playwright");
const { findChrome } = await import(
  pathToFileURL(path.join(v4Root, "scripts", "lib", "find-chrome.mjs")).href
);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const chrome = findChrome();
const browser = await chromium.launch({ executablePath: chrome.path, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];
const apiRequests = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("requestfailed", (request) => {
  failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" });
});
page.on("request", (request) => {
  if (new URL(request.url()).pathname.startsWith("/api/")) {
    apiRequests.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      postData: request.postData(),
      contentType: request.headers()["content-type"] ?? null,
      origin: request.headers().origin ?? null,
    });
  }
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    badResponses.push({ status: response.status(), url: response.url() });
  }
});

let report;

try {
  const uiHealthResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/health" &&
      response.request().method() === "GET",
    { timeout: WAIT_TIMEOUT_MS },
  );

  await page.goto(url, { waitUntil: "networkidle", timeout: WAIT_TIMEOUT_MS });
  const uiHealthResponse = await uiHealthResponsePromise;
  await page.waitForFunction(
    () => document.querySelector("#health")?.textContent?.startsWith("서버 연결됨"),
    undefined,
    { timeout: WAIT_TIMEOUT_MS },
  );

  const bridgeResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/app:get-health" &&
      response.request().method() === "POST",
    { timeout: WAIT_TIMEOUT_MS },
  );

  const browserResult = await page.evaluate(async () => {
    const bridge = window.appBridge;
    return {
      methodCount: bridge ? Object.keys(bridge).length : 0,
      hasGetAppHealth: typeof bridge?.getAppHealth === "function",
      statusText: document.querySelector("#health")?.textContent ?? null,
      healthResult: await bridge?.getAppHealth(),
    };
  });

  const bridgeResponse = await bridgeResponsePromise;
  const bridgeResponseBody = await bridgeResponse.json();
  mkdirSync(path.dirname(path.resolve(screenshotPath)), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const capturedBridgeRequest = apiRequests.find(
    (request) => request.method === "POST" && request.path === "/api/app:get-health",
  );
  const bridgeRequestHeaders = await bridgeResponse.request().allHeaders();
  const bridgeRequest = capturedBridgeRequest
    ? {
        ...capturedBridgeRequest,
        contentType: bridgeRequestHeaders["content-type"] ?? null,
        origin: bridgeRequestHeaders.origin ?? null,
      }
    : undefined;
  const health = browserResult.healthResult?.data;

  assert(uiHealthResponse.status() === 200, `GET /api/health 상태 ${uiHealthResponse.status()}`);
  assert(browserResult.statusText?.startsWith("서버 연결됨"), "임시 화면이 서버 연결 상태가 아님");
  assert(browserResult.methodCount === 111, `window.appBridge 메서드 수 ${browserResult.methodCount}`);
  assert(browserResult.hasGetAppHealth, "window.appBridge.getAppHealth가 없음");
  assert(bridgeResponse.status() === 200, `POST app:get-health 상태 ${bridgeResponse.status()}`);
  assert(bridgeRequest?.postData === "[]", `요청 본문이 []가 아님: ${bridgeRequest?.postData}`);
  assert(
    bridgeRequest?.contentType?.startsWith("application/json"),
    `Content-Type이 application/json이 아님: ${bridgeRequest?.contentType}`,
  );
  assert(bridgeRequest?.origin === new URL(url).origin, `Origin 불일치: ${bridgeRequest?.origin}`);
  assert(browserResult.healthResult?.ok === true, "브리지 반환이 BridgeSuccess가 아님");
  assert(
    JSON.stringify(browserResult.healthResult) === JSON.stringify(bridgeResponseBody),
    "브라우저 반환값과 HTTP 응답 본문이 다름",
  );
  assert(health?.appVersion === "0.1.0", `appVersion 불일치: ${health?.appVersion}`);
  assert(health?.environment === "production", `environment 불일치: ${health?.environment}`);
  for (const key of [
    "databaseConfigured",
    "pendingDirectoryConfigured",
    "approvedDirectoryConfigured",
  ]) {
    assert(typeof health?.[key] === "boolean", `${key}가 boolean이 아님`);
  }
  assert(health?.sessionPolicy?.persistence === "runtime-only", "세션 persistence 불일치");
  assert(health?.sessionPolicy?.restoreOnRestart === false, "세션 restoreOnRestart 불일치");
  assert(
    health?.sessionPolicy?.renewOnAuthenticatedAccess === true,
    "세션 renewOnAuthenticatedAccess 불일치",
  );
  assert(health?.sessionPolicy?.durationHours === 8, "세션 durationHours 불일치");
  assert(
    typeof health?.bootstrapCredentialsFilePath === "string" &&
      health.bootstrapCredentialsFilePath.length > 0,
    "bootstrapCredentialsFilePath가 비어 있음",
  );
  assert(consoleErrors.length === 0, `브라우저 콘솔 오류: ${JSON.stringify(consoleErrors)}`);
  assert(pageErrors.length === 0, `페이지 오류: ${JSON.stringify(pageErrors)}`);
  assert(failedRequests.length === 0, `실패 요청: ${JSON.stringify(failedRequests)}`);
  assert(badResponses.length === 0, `HTTP 400+ 응답: ${JSON.stringify(badResponses)}`);

  report = {
    result: "PASS",
    browser: chrome,
    url,
    screenshotPath: path.resolve(screenshotPath),
    ui: {
      status: uiHealthResponse.status(),
      statusText: browserResult.statusText,
    },
    bridge: {
      methodCount: browserResult.methodCount,
      request: bridgeRequest,
      responseStatus: bridgeResponse.status(),
      result: browserResult.healthResult,
    },
    diagnostics: { consoleErrors, pageErrors, failedRequests, badResponses },
  };

  console.log("HEALTH_BRIDGE_VERIFY_OK");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
