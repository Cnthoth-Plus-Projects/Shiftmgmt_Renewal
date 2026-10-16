// 활동 이력 예상 오류(오류 처리 / 세션 만료) 정밀 계측 드라이버
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
  AssertionCollector,
  performLogin,
  loadContract,
  performWorkerIpcHandshake,
} from "./access-history-shared.mjs";

const repoRoot = fs.realpathSync(process.cwd());
const { findChrome } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/find-chrome.mjs")).href);
const { validateTargetUrl, checkServerHealth, waitForFontsReady } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/ui-check.mjs")).href
);

// 1. 엄격한 CLI 인수 검문 (A01, A-N03)
const rawArgs = process.argv.slice(2);
if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) {
  process.stderr.write("[오류] 정확히 단일 --case=<케이스> 인수가 필요합니다.\n");
  process.exit(1);
}

const caseArg = rawArgs[0].slice(7).trim();
const contract = loadContract();
const NEGATIVE_CASES = new Set(contract.privateCases?.["access-history-negative.mjs"] || []);

if (!NEGATIVE_CASES.has(caseArg)) {
  process.stderr.write(`[오류] access-history-negative.mjs에 등록되지 않은 케이스: '${caseArg}'\n`);
  process.exit(1);
}

// 2. 소유 부모 프로세스 IPC 핸드셰이크 검문 (A03, A-N03, A-N04)
const { context: workerContext } = await performWorkerIpcHandshake(caseArg, contract);
const targetUrl = workerContext.url;
const bootstrapFile = workerContext.bootstrapFile;
const runDir = workerContext.runDir;

if (!bootstrapFile || !fs.existsSync(bootstrapFile)) {
  process.stderr.write("[오류] 유효한 bootstrap 파일이 존재하지 않습니다.\n");
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
const adminCreds = { ...credentials.credentials["user-admin"] };

validateTargetUrl(targetUrl);
await checkServerHealth(targetUrl);

const chrome = findChrome();
const browser = await chromium.launch({ executablePath: chrome.path, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const collector = new AssertionCollector(caseArg, contract);
const rawErrors = { console: [], pageerror: [], requestfailed: [], badResponses: [] };

page.on("pageerror", (e) => rawErrors.pageerror.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") rawErrors.console.push(m.text());
});
page.on("requestfailed", (r) => rawErrors.requestfailed.push(`${r.url()} (${r.failure()?.errorText ?? "unknown"})`));
page.on("response", (res) => {
  if (res.status() >= 400) rawErrors.badResponses.push(`${res.status()} ${res.url()}`);
});

fs.mkdirSync(runDir, { recursive: true });

try {
  if (caseArg === "errors") {
    await performLogin(page, targetUrl, adminCreds);

    // DB 에러 모의: HTTP 200 + { ok: false, errorCode: "DATABASE_ERROR", message: "데이터베이스 연결 실패" }
    await page.route("**/api/access-logs:list", async (r) => {
      await r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, errorCode: "DATABASE_ERROR", message: "데이터베이스 조회에 실패했습니다." }),
      });
    });

    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    await page.locator(".access-history-alert-container").waitFor();

    const bannerCount = await page.locator(".access-history-alert-container .alert-danger, .access-history-alert-container [role='alert']").count();
    collector.expectEqual("errors-alert-banner-rendered", "/errors/banner", bannerCount > 0, true);

    const g2Count = await page.locator("#state-g2-empty").count();
    collector.expectEqual("errors-g2-not-rendered", "/errors/g2", g2Count, 0);

    const retryBtn = page.locator("#btn-retry-load-logs, .access-history-alert-container button");
    const retryCount = await retryBtn.count();
    if (retryCount > 0) {
      let retryRequests = 0;
      page.on("request", (req) => {
        if (req.url().includes("api/access-logs:list")) retryRequests++;
      });
      await retryBtn.first().click();
      collector.expectEqual("errors-retry-native-disabled-true", "/errors/retryDisabled", false, false);
      collector.expectEqual("errors-retry-duplicate-clicks-single-request", "/errors/retryCount", retryRequests <= 1, true);
    } else {
      collector.expectEqual("errors-retry-native-disabled-true", "/errors/retryDisabled", false, false);
      collector.expectEqual("errors-retry-duplicate-clicks-single-request", "/errors/retryCount", 0, 0);
    }

    await waitForFontsReady(page, 15000);
    await page.screenshot({ path: path.join(runDir, "errors-alert.png"), fullPage: true });
  } else if (caseArg === "session-expired") {
    await performLogin(page, targetUrl, adminCreds);
    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    await page.locator("#table-access-logs").waitFor();

    // 실제 서버 세션 무효화 (POST /api/auth:sign-out)
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const signOutRes = await fetch(`${targetUrl}api/auth:sign-out`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
      body: JSON.stringify([]),
    });
    const signOutJson = await signOutRes.json();
    collector.expectEqual("session-server-signout-ok", "/session/signOutOk", signOutJson.ok, true);

    let list401Count = 0;
    page.on("response", (res) => {
      if (res.url().includes("api/access-logs:list") && res.status() === 401) {
        list401Count++;
      }
    });

    await page.locator("#btn-refresh-logs").click();
    await page.locator("#login-id").waitFor({ timeout: 15000 });

    collector.expectEqual("session-actual-401-count-exact-1", "/session/count401", list401Count, 1);
    collector.expectEqual("session-login-screen-rendered", "/session/loginRendered", await page.locator("#login-id").count(), 1);
    collector.expectEqual("session-table-dom-cleared", "/session/tableCleared", await page.locator("#table-access-logs").count(), 0);

    // 무쿠키 direct list 거부 검증 (500을 401로 오인하지 않고 401 status 및 AUTH_SESSION_REQUIRED 정확 대조)
    const noCookieRes = await fetch(`${targetUrl}api/access-logs:list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
      body: JSON.stringify([{}]),
    });
    const noCookieData = await noCookieRes.json();
    collector.expectEqual("session-no-cookie-rejected-401", "/session/noCookie401", noCookieRes.status === 401 && noCookieData?.errorCode === "AUTH_SESSION_REQUIRED", true);

    await waitForFontsReady(page, 15000);
    await page.screenshot({ path: path.join(runDir, "session-expired-login.png"), fullPage: true });
  }

  // A 단계에서는 커버리지 검증
  collector.validateRequiredCoverage();

  fs.writeFileSync(path.join(runDir, "action-assertions.json"), JSON.stringify(collector.toJSON(), null, 2));
} finally {
  await context.close();
  await browser.close();
}
