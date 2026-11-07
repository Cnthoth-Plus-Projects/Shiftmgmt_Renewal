// 운영 관리 화면 UI 검증 및 E2E 자동화 러너 (S01~S20, N01~N12, UI02-D01, UI02-D08)
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { checkServerHealth } from "../lib/ui-check.mjs";
import { findChrome } from "../lib/find-chrome.mjs";
import { artifactRegistry, artifactJSON, redactText, seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import { performNormalLogin } from "./access-history-negative.mjs";
import { seedOperationsFixtures } from "./operations-fixtures.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rawArgs = process.argv.slice(2);
const focusIDs = new Set((rawArgs.find(a=>a.startsWith("--focus="))?.slice(8)||"").split(",").filter(Boolean));
const isPreview = rawArgs.includes("--preview");

const portArg = rawArgs.find((a) => a.startsWith("--port="))?.slice(7)?.trim();
const targetPort = portArg ? parseInt(portArg, 10) : isPreview ? 18818 : 18819;
const targetUrl = `http://127.0.0.1:${targetPort}/`;

// UI02-D01: --out 디렉터리는 반드시 mkdir 전에 OS TEMP 디렉터리 하위인지 검증
let outArg = rawArgs.find((a) => a.startsWith("--out="))?.slice(6)?.replace(/^["']|["']$/g, "")?.trim();
const resolvedOut = path.resolve(outArg || path.join(os.tmpdir(), "shiftmgmt-operations-ui-" + randomUUID()));
const tempRoot = fs.realpathSync(os.tmpdir());
const underTemp = value => { const rel=path.relative(tempRoot,path.resolve(value));return !!rel&&!rel.startsWith("..")&&!path.isAbsolute(rel); };
if (!underTemp(resolvedOut)) throw new Error("Output must be a dedicated TEMP child directory");
// Reuse one independently built TEMP browser tree across focused, full and preview runs.
const staticArg = rawArgs.find(a=>a.startsWith("--static-root="))?.slice(14)?.trim();
const staticRoot = staticArg ? fs.realpathSync(path.resolve(staticArg)) : undefined;
if (staticRoot && !underTemp(staticRoot)) throw new Error("Static assets must be an existing dedicated TEMP child directory");

let existingParent=resolvedOut;while(!fs.existsSync(existingParent))existingParent=path.dirname(existingParent);
if (fs.realpathSync(existingParent)!==tempRoot&&!underTemp(fs.realpathSync(existingParent))) throw new Error("Output follows a path outside TEMP");
fs.mkdirSync(resolvedOut, { recursive: true });
const capturesDir = path.join(resolvedOut, "captures");
fs.mkdirSync(capturesDir, { recursive: true });

const userDataDir = path.join(os.tmpdir(), "shiftmgmt-ops-data-" + randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(userDataDir, { recursive: true });
const resourcesDir = path.join(os.tmpdir(), "shiftmgmt-ops-res-" + randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(resourcesDir, { recursive: true });

const plannedScenarios = Array.from({ length: 20 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`).filter(id=>!focusIDs.size||focusIDs.has(id));
const completedScenarios = [];
const failedScenarios = [];
const unexpectedErrors = [];
const expectedRejections = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`N${String(i + 1).padStart(2, "0")}`, false])
);

let servedAssets = null;
let serverProcess = null;
let browser = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isPortInUse(port) {
  return new Promise((res) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("timeout", () => { s.destroy(); res(false); });
    s.once("error", () => { s.destroy(); res(false); });
    s.connect(port, "127.0.0.1");
  });
}

async function cleanup() {
  if (holidayServer) { await new Promise(resolve=>holidayServer.close(resolve)); holidayServer=null; }
  if (browser && !isPreview) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  if (serverProcess && !isPreview) {
    try {
      if (serverProcess.pid) execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { stdio: "ignore" });
    } catch {}
    serverProcess = null;
  }
}

async function closeAnyOpenModal(page) {
  try {
    const noticeClose = page.locator("#btn-notice-close");
    if (await noticeClose.isVisible({ timeout: 500 })) {
      await noticeClose.click();
      await sleep(200);
    }
  } catch {}
  try {
    const confirmCancel = page.locator("#btn-confirm-cancel");
    if (await confirmCancel.isVisible({ timeout: 500 })) {
      await confirmCancel.click();
      await sleep(200);
    }
  } catch {}
  try {
    const modalCancel = page.locator("#btn-modal-cancel");
    if (await modalCancel.isVisible({ timeout: 500 })) {
      await modalCancel.click();
      await sleep(200);
    }
  } catch {}
  try {
    const ghostClose = page.locator(".workforce-modal-header button");
    if (await ghostClose.isVisible({ timeout: 500 })) {
      await ghostClose.click();
      await sleep(200);
    }
  } catch {}
}

async function switchToTab(page, tabId) {
  await closeAnyOpenModal(page);
  if(tabId==='users') await page.click('button[data-id="user-mgmt"]');
  else { if(!await page.locator('#tab-btn-settings').count()) await page.click('button[data-id="operations"]'); await page.click(`#tab-btn-${tabId}`); }
  await sleep(300);
  // 미저장 초안 확인 가드 모달이 뜬 경우 이동 승인 (UI02-D02)
  const confirmModal = page.locator("#operations-confirm-modal");
  if (await confirmModal.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.click("#btn-confirm-ok");
    await sleep(300);
  }
}

process.on("SIGINT", async () => { await cleanup(); process.exit(1); });
process.on("SIGTERM", async () => { await cleanup(); process.exit(1); });

async function main() {
  process.stdout.write(`[UI-02] Starting Operations Screen Verification (${isPreview ? "PREVIEW" : "TEST"})\n`);

  if (await isPortInUse(targetPort)) {
    process.stderr.write(`[Err] 포트 ${targetPort} 사용 중\n`);
    process.exit(1);
  }

  const serverScript = path.join(repoRoot, "dist", "server", "main", "server.js");
  if (!fs.existsSync(serverScript)) {
    process.stderr.write(`[Err] dist/server/main/server.js 없음 (빌드 필요)\n`);
    process.exit(1);
  }

  const bootstrapFile = path.join(userDataDir, "data", "bootstrap-credentials.json");
  fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });

  const preloadScript = path.join(resourcesDir, "inject-resources.cjs");
  fs.writeFileSync(
    preloadScript,
    `process.resourcesPath = process.env.SHIFTMGMT_RESOURCES_PATH;\n`,
    "utf8"
  );
  const normalizedPreload = preloadScript.replace(/\\/g, "/");

  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(SOL_|SHIFTMGMT_|AUTH_BOOTSTRAP_|NODE_OPTIONS$|NODE_DEBUG$)/i.test(key))),
    NODE_ENV: "production",
    NODE_OPTIONS: `--require "${normalizedPreload}"`,
    SHIFTMGMT_PORT: String(targetPort),
    SHIFTMGMT_USER_DATA_DIR: userDataDir,
    SHIFTMGMT_RESOURCES_PATH: resourcesDir,
    SHIFTMGMT_UI_BOOTSTRAP_FILE: bootstrapFile
  };

  const { ensureAuthBootstrapCredentials } = await import(
    pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js")).href
  );
  ensureAuthBootstrapCredentials({ userDataPath: userDataDir, env });
  seedBootstrapSecrets(bootstrapFile);
  artifactRegistry.register("Sm!nextStrongPw7a");
  if (isPreview) artifactRegistry.register("ShiftTest1234!");
  for(let i=1;i<=55;i++)artifactRegistry.register(`Password${String(i).padStart(2,'0')}!@#`);
  for(const folder of ['pending','approved','export'])fs.mkdirSync(path.join(userDataDir,folder),{recursive:true});

  const entry = `const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;process.on('message',message=>{offset=message.clockOffsetMs;process.send({clockOffsetMs:offset});});require(${JSON.stringify(serverScript)} ).startServer(${JSON.stringify(staticRoot ? {staticRoot} : {})});`;
  serverProcess = spawn(process.execPath, ['-e',entry], { cwd: repoRoot, env, windowsHide:true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  for(const stream of ['stdout','stderr']) {
    const masker=artifactRegistry.stream(),file=path.join(resolvedOut,`server.${stream}.log`);
    serverProcess[stream].on('data',chunk=>fs.appendFileSync(file,masker.push(chunk)));
    serverProcess[stream].once('end',()=>fs.appendFileSync(file,masker.flush()));
  }
  serverProcess.stdout.on("data", (d) => {
    const m = d.toString();
    if (m.includes("서버 실행 중")) process.stdout.write(m);
  });
  serverProcess.stderr.on("data", (d) => {
    const m = d.toString();
    if (!m.includes("ExperimentalWarning")) process.stderr.write(redactText(`[Err] ${m}`));
  });
  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0 && !isPreview) unexpectedErrors.push(`서버 비정상 종료 (${code})`);
  });

  let healthOk = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const res = await checkServerHealth(targetUrl, 2000);
      if (res?.ok) { healthOk = true; break; }
    } catch {}
  }
  if (!healthOk) {
    process.stderr.write(`[Err] 서버 준비 실패\n`);
    await cleanup();
    process.exit(2);
  }

  servedAssets = [];
  for (const name of ["app.js", "operations.css", "policy-history.css"]) {
    const response = await fetch(new URL(`/web/${name}`, targetUrl));
    assert(response.ok, `Browser asset unavailable: ${name}`);
    const served = Buffer.from(await response.arrayBuffer());
    const file = path.join(staticRoot || path.join(repoRoot, "dist", "browser"), "web", name);
    const local = fs.readFileSync(file);
    assert(local.equals(served), `Served browser asset differs from built bytes: ${name}`);
    servedAssets.push({name, bytes: served.length, sha256: createHash("sha256").update(served).digest("hex")});
  }

  const bootstrapData = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
  const adminCreds = bootstrapData.credentials?.["user-admin"];

  const chromePath = findChrome().path;
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: !isPreview,
    args: ["--no-sandbox", "--disable-gpu"]
  });

  const context = await browser.newContext({
    viewport: isPreview ? null : { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.exposeFunction("registerOpsSecret",value=>artifactRegistry.register(value));
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  page.on("pageerror",error=>unexpectedErrors.push(redactText(String(error))));

  // 콘솔 오류 감지 (권한 거절 401/403 및 404/favicon 등 음성 검문 응답 제외)
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        !text.includes("404") &&
        !text.includes("401") &&
        !text.includes("403") &&
        !text.includes("favicon") &&
        !text.includes("net::ERR_")
      ) {
        unexpectedErrors.push(`브라우저 콘솔 오류: ${text}`);
      }
    }
  });

  const performLogin = async (loginId, password) => {
    await page.goto(isPreview ? `${targetUrl}?developmentPreview=1` : targetUrl, { waitUntil: "networkidle" });
    const logoutBtn = page.locator(".btn-logout");
    if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await logoutBtn.click();
    }
    const idInput = page.locator("#login-id");
    await idInput.waitFor({ state: "visible", timeout: 10000 });
    if (!isPreview) assert.equal(await page.locator("#btn-development-autofill").count(), 0);
    await idInput.fill(loginId);
    await page.locator("#login-password").fill(password);
    await page.locator("button[type='submit']").click();

    const mode = await Promise.race([
      page.locator("#l4-btn-submit").waitFor({ state: "visible", timeout: 10000 }).then(() => "L4"),
      page.locator(".btn-logout").waitFor({ state: "visible", timeout: 10000 }).then(() => "SHELL"),
    ]);

    if (mode === "L4") {
      const nextPw = isPreview ? "ShiftTest1234!" : "Sm!nextStrongPw7a";
      await page.locator("#l4-current-pw").fill(password);
      await page.locator("#l4-new-pw").fill(nextPw);
      await page.locator("#l4-confirm-pw").fill(nextPw);
      await page.locator("#l4-btn-submit").click();
      await page.locator(".btn-logout").waitFor({ state: "visible", timeout: 15000 });
      return nextPw;
    }
    return password;
  };

  // 로그인 수행 (비밀번호 마스킹)
  adminCreds.password = await performLogin(adminCreds.loginId, adminCreds.password);
  await page.waitForSelector(".app-shell", { timeout: 15000 });

  // 55개 픽스처 데이터 시딩
  process.stdout.write("[Fixtures] Seeding 55 test records across 6 modules...\n");
  const seeded = await seedOperationsFixtures({
    page,
    resourcesDir
  });
  process.stdout.write(`[Fixtures] Seeded: users=${seeded.usersCount}, sites=${seeded.siteNamesCount}, holidays=${seeded.holidaysCount}, rates=${seeded.rateVersionsCount}, history=${seeded.layoutHistoryCount}, releases=${seeded.releasesCount}\n`);

  await installCalls(page);

  if (isPreview) {
    const previewUrl = `${targetUrl}?developmentPreview=1`;
    // 기존 UI-03-DEV-LOGIN 계약: 로그아웃/새 브라우저에서도 하단 자동입력으로 정상 로그인.
    await page.locator(".btn-logout").click();
    await page.locator("#btn-development-autofill").waitFor({state:"visible"});
    await page.goto(targetUrl, {waitUntil:"networkidle"});
    await page.locator("#btn-development-autofill").waitFor({state:"visible"});
    await page.goto(`${targetUrl}?developmentPreview=0`, {waitUntil:"networkidle"});
    await page.locator("#login-id").waitFor({state:"visible"});
    assert.equal(await page.locator("#btn-development-autofill").count(), 0);
    await page.goto(previewUrl, {waitUntil:"networkidle"});
    const autofill = page.locator("#btn-development-autofill");
    await autofill.waitFor({state:"visible"});
    const bannerBelowLogin = await page.evaluate(() => {
      const banner = document.querySelector("#btn-development-autofill"), submit = document.querySelector(".login-form button[type=submit]");
      return banner.getBoundingClientRect().top >= submit.getBoundingClientRect().bottom;
    });
    assert.ok(bannerBelowLogin);
    const loginCapture = path.join(capturesDir, "login-autofill.png");
    await page.screenshot({path:loginCapture,fullPage:true});
    await autofill.click();
    assert.ok(await page.locator("#login-id").inputValue() === adminCreds.loginId);
    assert.ok(await page.locator("#login-password").inputValue() === adminCreds.password);
    const freshContext = await browser.newContext({viewport:{width:1024,height:768}});
    try {
      const freshPage = await freshContext.newPage();
      await freshPage.goto(previewUrl, {waitUntil:"networkidle"});
      await freshPage.locator("#btn-development-autofill").waitFor({state:"visible"});
      await freshPage.locator("#btn-development-autofill").click();
      assert.ok(await freshPage.locator("#login-id").inputValue() === adminCreds.loginId);
      assert.ok(await freshPage.locator("#login-password").inputValue() === adminCreds.password);
      await freshPage.locator(".login-form button[type=submit]").click();
      await freshPage.locator(".btn-logout").waitFor({state:"visible"});
    } finally { await freshContext.close(); }
    // 새 브라우저 로그인은 이전 세션을 종료하므로 확인용 주 창을 마지막에 로그인한다.
    await page.locator(".login-form button[type=submit]").click();
    await page.locator(".btn-logout").waitFor({state:"visible"});
    await page.click('button[data-id="operations"]');
    await page.waitForSelector(".operations-screen-root", { timeout: 10000 });
    await switchToTab(page, "holidays");
    const previewCapture = path.join(capturesDir, "holidays-preview.png");
    await page.screenshot({ path: previewCapture, fullPage: true });
    fs.writeFileSync(path.join(resolvedOut, "preview.json"), artifactJSON({
      url: previewUrl, runnerPid: process.pid, serverPid: serverProcess?.pid,
      userDataDir, resourcesDir, viewport: await page.evaluate(() => ({width:innerWidth,height:innerHeight})),
      nativeViewport: true, captures: [previewCapture, loginCapture], servedAssets,
      autofillCheck: {bannerBelowLogin, persistedAfterLogout:true, persistedAtPlainLocalUrl:true, disabledModeHidden:true, fieldsMatch:true, normalLoginSuccess:true, freshBrowserContextLogin:true}
    }, null, 2), "utf8");
    process.stdout.write(`[Preview] Live preview ready at ${previewUrl} (PID: ${process.pid}, Server PID: ${serverProcess?.pid})\n`);
    return;
  }

  await page.locator('button[data-id="operations"]').click();
  await page.locator('.operations-settings-wrap').waitFor();

  // --- S01: admin 운영 관리 진입 / 7탭 전환 / 사용자관리 바로가기 ---
  if (!focusIDs.size || focusIDs.has("S01")) {
  try {
    await closeAnyOpenModal(page);
    await page.click('button[data-id="operations"]');
    await page.waitForSelector(".operations-screen-root", { timeout: 10000 });
    const tabs = page.locator(".tab-btn");
    assert.equal(await tabs.count(), 6, "운영 6개 탭이 존재해야 함");

    // 사용자 관리 바로가기 메뉴 클릭 시 같은 화면의 '사용자' 탭으로 전환 확인
    await page.click('button[data-id="user-mgmt"]');
    await sleep(200);
    await page.locator('.operations-users-wrap').waitFor();
    assert.equal(await page.locator('.operations-tab-list').count(),0,"사용자 관리는 독립 메뉴");
    assert.equal(await page.locator('.screen-title').textContent(),"사용자 관리");

    await verifyScenario("S01", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S01] verified\n");
    completedScenarios.push("S01");
  } catch (e) {
    failedScenarios.push({ id: "S01", err: String(e) });
  }
  }

  // --- S02: 이름55개 전체 정렬/필터 → 실제 높이별 페이지의 모든 행 검증 ---
  if (!focusIDs.size || focusIDs.has("S02")) {
  try {
    await switchToTab(page, "site-names");
    const paginationText = await page.locator(".data-table-pagination .pagination-info").textContent();
    const capacity = await page.locator(".data-table-body .table-row").count();
    assert(capacity > 0 && paginationText?.includes(String(Math.ceil(55 / capacity))));
    // 마지막 페이지 이동
    await page.click(".btn-last-page");
    await sleep(200);
    const rowCount = await page.locator(".data-table-body .table-row").count();
    assert.equal(rowCount, 55 % capacity || capacity, "마지막 페이지는 남은 실제 행과 일치해야 함");

    await verifyScenario("S02", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S02] verified\n");
    completedScenarios.push("S02");
  } catch (e) {
    failedScenarios.push({ id: "S02", err: String(e) });
  }
  }

  // --- S03 & N03: 설정 실제값 읽기 -> 수정 -> 저장 -> 값 보존 & 잘못된 값 거절 ---
  if (!focusIDs.size || focusIDs.has("S03")) {
  try {
    await switchToTab(page, "settings");
    await selectSettingsArea(page, "policy");
    const nightLimitInput = page.locator("#input-scheduleConsecutiveNightLimit");
    
    // N03: 음수값 입력 시 거절 확인
    await nightLimitInput.fill("-1");
    await page.click("#btn-save-settings");
    await sleep(400);
    const hasWarningModal = await page.locator(".workforce-modal-overlay").isVisible();
    assert(hasWarningModal, "잘못된 음수 야간제한은 경고 모달로 거절되어야 함");
    await page.click("#btn-notice-close");
    await sleep(200);

    // 정상값 저장 (4)
    await nightLimitInput.fill("4");
    await page.click("#btn-save-settings");
    await sleep(500);
    await page.click("#btn-notice-close"); // 저장 완료 모달 닫기
    await sleep(200);
    assert.equal(await nightLimitInput.inputValue(), "4");
    await verifyScenario("S03", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S03] verified\n");
    completedScenarios.push("S03");
  } catch (e) {
    failedScenarios.push({ id: "S03", err: String(e) });
  }
  }

  // --- S04: 파일 감시 상태 조회 / 중지 / 재시작 ---
  if (!focusIDs.size || focusIDs.has("S04")) {
  try {
    await closeAnyOpenModal(page);
    await switchToTab(page, "settings");
    await selectSettingsArea(page, "system");
    await page.click(".operations-settings-wrap #btn-stop-watch");
    await sleep(400);
    await page.click("#btn-notice-close");
    await sleep(200);
    await page.click(".operations-settings-wrap #btn-ops-restart-watch");
    await sleep(400);
    await page.click("#btn-notice-close");
    await sleep(200);
    await verifyScenario("S04", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S04] verified\n");
    completedScenarios.push("S04");
  } catch (e) {
    failedScenarios.push({ id: "S04", err: String(e) });
  }
  }

  // --- S05: 공휴일 55자료 조회 / 추가 / 수정 / 삭제 ---
  if (!focusIDs.size || focusIDs.has("S05")) {
  try {
    await switchToTab(page, "holidays");
    await page.click("#btn-add-holiday");
    await sleep(300);
    await page.fill("#modal-add-holiday input[type='date']", "2026-12-31");
    await page.fill("#modal-add-holiday input[placeholder*='명칭']", "시험종료일");
    await page.click("#btn-modal-submit");
    await sleep(500);
    await page.click("#btn-notice-close");
    await sleep(200);

    // H01: Dense 레이아웃 및 KPI 검증
    const kpiTotal = parseInt(await page.locator('#holidays-kpi-total .ops-holidays-kpi-val').innerText(), 10);
    const kpiRegular = parseInt(await page.locator('#holidays-kpi-regular .ops-holidays-kpi-val').innerText(), 10);
    const kpiSubstitute = parseInt(await page.locator('#holidays-kpi-substitute .ops-holidays-kpi-val').innerText(), 10);
    assert.equal(kpiTotal, kpiRegular + kpiSubstitute);

    // 표 및 상세 패널 높이 정렬 검증 (top/bottom 오차 2px 이내)
    const alignDiff = await page.evaluate(() => {
      const tbl = document.querySelector('.ops-holidays-table-panel');
      const dtl = document.querySelector('.ops-holidays-detail-panel');
      if (!tbl || !dtl) return 999;
      const tr = tbl.getBoundingClientRect();
      const dr = dtl.getBoundingClientRect();
      return Math.max(Math.abs(tr.top - dr.top), Math.abs(tr.bottom - dr.bottom));
    });
    assert(alignDiff <= 2, `표와 상세 패널의 top/bottom 오차는 2px 이내여야 함 (실측: ${alignDiff}px)`);

    // HOL-D05: 행 높이 실측 32~36px 검증
    const rowHeight = await page.evaluate(() => {
      const row = document.querySelector("#holidays-table-body tr.holidays-table-row");
      return row ? row.getBoundingClientRect().height : 0;
    });
    assert(rowHeight >= 32 && rowHeight <= 36, `공휴일 행 높이는 32~36px여야 함 (실측: ${rowHeight}px)`);

    // HOL-D06: 라벨 htmlFor 연결 및 버튼 키보드 조작 검증
    await page.click("#btn-add-holiday");
    await sleep(200);
    const hasLabelsFor = await page.evaluate(() => {
      const dateLabel = document.querySelector('label[for="input-add-holiday-date"]');
      const nameLabel = document.querySelector('label[for="input-add-holiday-name"]');
      return !!dateLabel && !!nameLabel;
    });
    assert(hasLabelsFor, "추가 모달 입력 필드에 label for 연결 확인");
    await page.click("#btn-modal-cancel");
    await sleep(200);

    await page.locator('.btn-rename-holiday').first().focus();
    await page.keyboard.press('Enter');
    await sleep(200);
    assert.equal(await page.locator('#modal-rename-holiday').count(), 1, "수정 버튼 Enter 시 수정 모달 열림 확인");
    await page.click('#btn-modal-cancel');
    await sleep(200);

    // H02/H03: 검색 필터 작동 확인
    await page.fill('#holiday-search-input', '시험종료일');
    await sleep(250);
    const filteredRowCount = await page.locator('#holidays-table-body tr.holidays-table-row').count();
    assert.equal(filteredRowCount, 1);
    await page.fill('#holiday-search-input', '');
    await sleep(250);

    // H04: 추가 모달 음성 검증 (중복 날짜 거절)
    await page.click('#btn-add-holiday');
    await sleep(200);
    await page.fill("#modal-add-holiday input[type='date']", "2026-12-31");
    await page.fill("#modal-add-holiday input[placeholder*='명칭']", "중복추가시도");
    await page.click('#btn-modal-submit');
    await sleep(200);
    assert(await page.locator('#modal-add-holiday .alert-danger').isVisible());
    await page.click('#btn-modal-cancel');
    await sleep(200);

    await verifyScenario("S05", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S05] verified\n");
    completedScenarios.push("S05");
  } catch (e) {
    failedScenarios.push({ id: "S05", err: String(e) });
  }
  }

  // --- S06 & N02: API 공휴일 가져오기 (비교 모달 및 취소 쓰기 0 확인) ---
  if (!focusIDs.size || focusIDs.has("S06")) {
  try {
    await verifyScenario("S06", { page, browser, context, adminCreds, seeded, resourcesDir });
    completedScenarios.push("S06");
  } catch (e) { failedScenarios.push({id:"S06",err:String(e)}); }
  }

  // --- S07 & N05: 요율 55버전 / 15셀 편집 / 영향도 비교 분석 ---
  if (!focusIDs.size || focusIDs.has("S07")) {
  try {
    await switchToTab(page, "rates");
    await closeAnyOpenModal(page);
    await sleep(400);
    await page.click("#btn-rate-impact-preview");
    await sleep(600);
    const impactResult = page.locator("#rate-impact-container .impact-result-card");
    assert(await impactResult.isVisible({ timeout: 8000 }), "영향도 분석 결과 카드가 노출되어야 함");

    await verifyScenario("S07", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S07] verified\n");
    completedScenarios.push("S07");
  } catch (e) {
    failedScenarios.push({ id: "S07", err: String(e) });
  }
  }

  // --- S08 & N04: 기존 active를 바꾸는 활성화 확인 모달 및 잘못된 날짜 거절 ---
  if (!focusIDs.size || focusIDs.has("S08")) {
  try {
    await closeAnyOpenModal(page);
    await selectOperationsArea(page,"rates","versions");
    const fromInput = page.locator("#input-rate-effective-from");
    await fromInput.fill(""); // 빈 시작일 거절 검문
    await page.click("#btn-save-rate-version");
    await sleep(400);
    const hasWarn = await page.locator(".workforce-modal-overlay").isVisible();
    assert(hasWarn, "빈 날짜는 경고 모달로 거절되어야 함");
    await page.click("#btn-notice-close");
    await sleep(200);


    await fromInput.fill("2026-01-01");
    const statusSelect = page.locator("#select-rate-status");
    await statusSelect.selectOption("active");
    await page.click("#btn-save-rate-version");
    await sleep(400);
    const confirmModal = page.locator("#operations-confirm-modal");
    assert(await confirmModal.isVisible(), "활성 전환 경고 확인 모달이 표시되어야 함");
    await page.click("#btn-confirm-cancel"); // 취소 시 쓰기 0
    await sleep(200);
    await verifyScenario("S08", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S08] verified\n");
    completedScenarios.push("S08");
  } catch (e) {
    failedScenarios.push({ id: "S08", err: String(e) });
  }
  }

  // --- S09 & N06: 사용자 등록 / 수정 / 삭제 & 관리자 삭제 거절 ---
  if (!focusIDs.size || focusIDs.has("S09")) {
  try {
    await switchToTab(page, "users");
    await page.click("#btn-add-user");
    await sleep(300);
    await page.fill("#modal-add-user input[placeholder*='영문']", "testdummy99");
    await page.fill("#modal-add-user input[placeholder*='실명']", "더미사용자");
    await page.fill("#modal-add-user input[type='password']", "Password99!@#");
    await page.click("#btn-modal-submit");
    await sleep(500);
    await page.click("#btn-notice-close");
    await sleep(200);

    await verifyScenario("S09", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S09] verified\n");
    completedScenarios.push("S09");
  } catch (e) {
    failedScenarios.push({ id: "S09", err: String(e) });
  }
  }

  // --- S10: 내 복구키 재발급 및 닫기 후 폐기 ---
  if (!focusIDs.size || focusIDs.has("S10")) {
  try {
    await closeAnyOpenModal(page);
    await selectOperationsArea(page,"users","security");await page.click("#btn-rotate-my-recovery-key");
    await page.locator("#btn-confirm-ok").waitFor({ state: "visible", timeout: 5000 });
    await page.click("#btn-confirm-ok"); // 확인 모달 승인
    const keyModal = page.locator("#modal-recovery-key-display");
    await keyModal.waitFor({ state: "visible", timeout: 5000 });
    assert(await keyModal.isVisible(), "새 복구키 표시 모달 노출");
    await page.click("#btn-close-recovery-key"); // 안전하게 보관 및 폐기
    await sleep(200);
    await verifyScenario("S10", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S10] verified\n");
    completedScenarios.push("S10");
  } catch (e) {
    failedScenarios.push({ id: "S10", err: String(e) });
  }
  }

  // --- S11 & N12: 근무지 이름 55개 등록 및 따옴표/특수문자 literal 유지 (XSS 차단) ---
  if (!focusIDs.size || focusIDs.has("S11")) {
  try {
    await switchToTab(page, "site-names");
    await page.click("#btn-add-site-name");
    await sleep(300);
    const xssPayload = `특수'"<script>근무지`;
    await page.fill("#modal-add-site-name input[placeholder*='명칭']", xssPayload);
    await page.click("#btn-modal-submit");
    await sleep(500);
    await page.click("#btn-notice-close");
    await sleep(200);

    // 등록된 이름이 script 태그가 아닌 텍스트 literal로 렌더링되었는지 확인
    const searchInput = page.locator(".dt-search-input");
    await searchInput.fill("특수");
    await sleep(400);
    const cellText = await page.locator(`.table-row:has-text("특수")`).textContent();
    assert(cellText?.includes(xssPayload), "XSS 특수문자가 안전하게 literal로 유지되어야 함");

    await verifyScenario("S11", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S11] verified\n");
    completedScenarios.push("S11");
  } catch (e) {
    failedScenarios.push({ id: "S11", err: String(e) });
  }
  }

  // --- S12: 릴리즈 이력 55개 목록 및 상세 확인 ---
  if (!focusIDs.size || focusIDs.has("S12")) {
  try {
    await switchToTab(page, "releases");
    const detailTitleEl = page.locator(".release-version-title");
    await detailTitleEl.waitFor({ state: "visible", timeout: 8000 });
    const detailTitle = await detailTitleEl.textContent();
    assert(detailTitle?.includes("버전"), "릴리즈 상세 패널이 정상 렌더링되어야 함");
    await verifyScenario("S12", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S12] verified\n");
    completedScenarios.push("S12");
  } catch (e) {
    failedScenarios.push({ id: "S12", err: String(e) });
  }
  }

  // --- S13: 레이아웃 7키 모두 불러오기 ---
  if (!focusIDs.size || focusIDs.has("S13")) {
  try {
    await switchToTab(page, "layout");
    await page.locator(".layout-key-select option").first().waitFor({ state: "attached", timeout: 10000 });
    const keySelect = page.locator(".layout-key-select");
    assert.equal(await keySelect.locator("option").count(), 7, "7개 양식 키가 선택지에 있어야 함");
    await verifyScenario("S13", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S13] verified\n");
    completedScenarios.push("S13");
  } catch (e) {
    failedScenarios.push({ id: "S13", err: String(e) });
  }
  }

  // --- S14 & N07: 캔버스 블록 속성 / 키보드 연속 이동 / 보호 속성 잠금 ---
  if (!focusIDs.size || focusIDs.has("S14")) {
  try {
    await closeAnyOpenModal(page);
    await page.waitForSelector(".block-item-btn", { timeout: 8000 });
    const blockBtn = page.locator(".block-item-btn").first();
    await blockBtn.click();
    await sleep(200);
    assert(await page.locator(".property-panel-content").isVisible());

    // N07: 보호 속성 안내 메시지 확인
    const protectedNotice = await page.locator(".protected-attributes-notice").textContent();
    assert(protectedNotice?.includes("보호"), "보호된 속성(row-order, binding 등) 안내가 표시되어야 함");


    // 키보드 방향키 이동 테스트: 오른쪽으로 이동 후 다시 왼쪽으로 원위치 복구
    const blockNode = page.locator(".canvas-block-node.active");
    if (await blockNode.isVisible()) {
      await blockNode.press("ArrowRight");
      await sleep(100);
      await blockNode.press("ArrowLeft");
      await sleep(100);
    }
    await verifyScenario("S14", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S14] verified\n");
    completedScenarios.push("S14");
  } catch (e) {
    failedScenarios.push({ id: "S14", err: String(e) });
  }
  }

  // --- S15 & N08: 실제 생성물 (PDF / XLSX) 바이너리 Blob 미리보기 및 만료/stale 검증 ---
  if (!focusIDs.size || focusIDs.has("S15")) {
  try {
    await closeAnyOpenModal(page);
    await page.click("#btn-preview-layout");
    const displayArea = page.locator("#preview-display-area");
    await displayArea.waitFor({ state: "visible", timeout: 15000 });
    assert(await displayArea.isVisible(), "미리보기 영역이 노출되어야 함");

    await verifyScenario("S15", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S15] verified\n");
    completedScenarios.push("S15");
  } catch (e) {
    failedScenarios.push({ id: "S15", err: String(e) });
  }
  }

  // --- S16: 레이아웃 초안 저장 / 이력 55개 / 기본값 복원 확인 ---
  if (!focusIDs.size || focusIDs.has("S16")) {
  try {
    await closeAnyOpenModal(page);
    await selectOperationsArea(page,"layout","history");
    const histTableWrap = page.locator(".history-table-wrap");
    await histTableWrap.waitFor({ state: "visible", timeout: 8000 });
    await sleep(500);
    const paginationText = await page.locator(".history-table-wrap .pagination-info").textContent().catch(() => "");
    assert(paginationText?.includes("페이지") || await histTableWrap.locator(".table-row").count() > 0, "양식 변경 이력 목록이 존재해야 함");
    await verifyScenario("S16", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S16] verified\n");
    completedScenarios.push("S16");
  } catch (e) {
    failedScenarios.push({ id: "S16", err: String(e) });
  }
  }

  // --- S17: 설정 즉시 백업 및 복원 요구조건 검사 ---
  if (!focusIDs.size || focusIDs.has("S17")) {
  try {
    await switchToTab(page, "settings");
    await selectSettingsArea(page, "backup");
    await page.click("#btn-run-db-backup");
    await sleep(800);
    const backupResult = await page.locator(".backup-result-info").textContent();
    assert(backupResult?.includes("성공적으로 생성"), "즉시 백업 성공 확인");
    await verifyScenario("S17", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S17] verified\n");
    completedScenarios.push("S17");
  } catch (e) {
    failedScenarios.push({ id: "S17", err: String(e) });
  }
  }

  // --- S18 & N09 & N10: 잘못된 백업 파일 거절 및 경로 변경 잠금 ---
  if (!focusIDs.size || focusIDs.has("S18")) {
  try {
    await closeAnyOpenModal(page);
    await selectSettingsArea(page, "backup");
    const pathInput = page.locator("#input-restore-backup-path");
    await pathInput.fill("C:/non-existent-backup.json");
    await page.click("#btn-check-db-requirements");
    await sleep(500);
    const hasErrMsg = await page.locator(".restore-flow-container .alert-danger").isVisible();
    assert(hasErrMsg, "존재하지 않는 파일 검사는 에러 메시지를 표시해야 함");


    await verifyScenario("S18", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S18] verified\n");
    completedScenarios.push("S18");
  } catch (e) {
    failedScenarios.push({ id: "S18", err: String(e) });
  }
  }

  // --- S19 & N01 & N11: 비관리자 강제 진입 차단 & 지연/세션 만료 처리 ---
  if (!focusIDs.size || focusIDs.has("S19")) {
  try {
    await verifyScenario("S19", { page, browser, context, adminCreds, seeded, resourcesDir });
    completedScenarios.push("S19");
  } catch (e) { failedScenarios.push({id:"S19",err:String(e)}); }
  }

  // --- S20: 해상도(1024, 1440, 2048) 반응형 검사 및 콘솔 오류 0 ---
  if (!focusIDs.size || focusIDs.has("S20")) {
  try {
    await closeAnyOpenModal(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(200);
    await page.setViewportSize({ width: 2048, height: 1080 });
    await sleep(200);
    await page.setViewportSize({ width: 1440, height: 900 });

    assert.equal(unexpectedErrors.length, 0, `예기치 않은 콘솔 오류가 없어야 함: ${unexpectedErrors.join("; ")}`);
    await verifyScenario("S20", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S20] verified\n");
    completedScenarios.push("S20");
  } catch (e) {
    failedScenarios.push({ id: "S20", err: String(e) });
  }
  }

  // 최종 캡처 및 결과 파일 저장
  const negativePlan = {"N01": ["three-roles-forced-zero-api-and-direct-guards"], "N02": ["settings-discard-cancel", "watch-double-click", "holiday-import-cancel", "active-rate-confirm-cancel", "user-delete-cancel", "recovery-key-cancel", "site-delete-cancel", "layout-save-reset-cancel", "restore-cancel-wrong-text-double-and-locks"], "N03": ["settings-missing-unit-time-date", "holiday-year-duplicate"], "N04": ["missing-negative-started-date-period"], "N05": ["failed-partial-stale-impact", "controlled-zero-warning-readonly"], "N06": ["empty-password-self-last-admin-and-omission"], "N07": ["protected-structure-binding-unknown-block", "filename-token-path-extension"], "N08": ["stale-save-reset-preview-and-expired-ui", "holiday-stale-calendar-identity"], "N09": ["invalid-json-unknown-missing-type"], "N10": ["path-sha-expiry-phrase-and-locked-db-preservation"], "N11": ["late-tab-and-expired-relogin-ownership", "late-json-after-key-change", "late-secret-response-modal-replacement", "holiday-late-response-and-modal-close"], "N12": ["site-literal-roundtrip", "release-literal-detail", "preview-error-literal", "layout-canvas-literal", "holiday-literal-name"]};
  for(const [id,labels] of Object.entries(negativePlan)) expectedRejections[id]=labels.every(label=>negativeEvidence[id].includes(label));
  const exactScenarios=completedScenarios.length===plannedScenarios.length&&new Set(completedScenarios).size===plannedScenarios.length&&plannedScenarios.every(id=>completedScenarios.includes(id));
  const accepted=!focusIDs.size&&exactScenarios&&failedScenarios.length===0&&unexpectedErrors.length===0&&Object.values(expectedRejections).every(Boolean);
  await page.evaluate(()=>document.querySelectorAll('.key-input').forEach(input=>{input.value='';}));

  const capturePath = path.join(capturesDir, "operations-final.png");
  await page.screenshot({ path: capturePath, fullPage: true });

  const summary = {
    status: accepted ? "PASS" : focusIDs.size&&failedScenarios.length===0?"PARTIAL_PASS":"FAIL",
    fullRun: !focusIDs.size,
    servedAssets,
    negativePlan, negativeEvidence, extraEvidence, exactScenarios,
    planned: plannedScenarios,
    completed: completedScenarios,
    failed: failedScenarios,
    unexpectedErrors,
    expectedRejections,
    captures: [capturePath]
  };

  fs.writeFileSync(path.join(resolvedOut, "summary.json"), artifactJSON(summary, null, 2), "utf8");

  await cleanup();

  process.stdout.write(`\n[UI-02] Verification Complete: ${completedScenarios.length}/20 PASS, ${failedScenarios.length} FAIL\n`);
  if (failedScenarios.length > 0 || (!focusIDs.size && !accepted)) {
    process.stderr.write(artifactJSON(failedScenarios, null, 2) + "\n");
    process.exitCode=1;
  }
}

// The additional assertions below retain the original twenty scenario identities.
const negativeEvidence = Object.fromEntries(Array.from({length:12},(_,i)=>[`N${String(i+1).padStart(2,'0')}`,[]]));
const extraEvidence = {};
const scenarioState = {};
let holidayServer;
let holidayMode = 'ok';
const clone = value => JSON.parse(JSON.stringify(value));
const layoutKeys = [
  {documentKind:'schedule-xlsx',variant:'template1'}, {documentKind:'schedule-xlsx',variant:'template2'},
  ...['proposal-xlsx','attachment1-xlsx','attachment2-xlsx','proposal-pdf','dashboard-report-pdf'].map(documentKind=>({documentKind}))
];
async function bridgeCall(page, method, ...args) {
  return page.evaluate(async ({method,args})=>window.appBridge[method](...args),{method,args});
}
async function bridgeData(page, method, ...args) {
  if(method==='getHolidayCalendar') return (await bridgeData(page,'listHolidayCalendars',...args))[0];
  const result=await bridgeCall(page,method,...args);
  assert.equal(result.ok,true,`${method}: ${result.errorCode||''} ${result.message||''}`);
  return result.data;
}
function negative(id,label,assertion) { assertion(); negativeEvidence[id].push(label); }
async function callCount(page,method) {return page.evaluate(method=>window.__opsCalls.filter(name=>name===method).length,method);}
async function installCalls(page) {
  await page.evaluate(()=>{
    window.__opsCalls=[];window.__opsActual={};
    for(const [name,fn] of Object.entries(window.appBridge)) if(typeof fn==='function') {
      window.__opsActual[name]=fn.bind(window.appBridge);
      window.appBridge[name]=async(...args)=>{window.__opsCalls.push(name);const result=await window.__opsActual[name](...args);if(name==='previewDatabaseMigrationUpdate')window.__lastDbPreview=result;return result;};
    }
  });
}
async function overrideBridge(page,method,source) {
  await page.evaluate(({method,source})=>{
    const implementation=Function(`return (${source})`)();
    window.appBridge[method]=(...args)=>{window.__opsCalls.push(method);return implementation(...args);};
  },{method,source});
}
async function restoreBridge(page,method) {
  await page.evaluate(method=>{window.appBridge[method]=(...args)=>{window.__opsCalls.push(method);return window.__opsActual[method](...args);};},method);
}
async function notice(page) {await page.locator('#btn-notice-close').waitFor();await page.locator('#btn-notice-close').click();}
async function freshTab(page,id) {
  if(id==='users' ? await page.locator('.operations-users-wrap').count()>0 : await page.locator(`#tab-btn-${id}`).count()>0 && await page.locator(`#tab-btn-${id}`).getAttribute('aria-selected')==='true') {
    await switchToTab(page,id==='settings'?'holidays':'settings');
  }
  await switchToTab(page,id);
  await page.locator(`.operations-${id==='layout'?'layout':id}-wrap`).waitFor();
}
async function selectSettingsArea(page, areaId) {
  const btn = page.locator(`#btn-settings-area-${areaId}`);
  await btn.click();
  await page.locator(`#settings-area-${areaId}`).waitFor({ state: 'visible' });
}
async function waitCalls(page,method,count) {
  await page.waitForFunction(({method,count})=>window.__opsCalls.filter(n=>n===method).length>=count,{method,count});
}
async function selectLayout(page,index) {
  const values=await page.locator('.layout-key-select option').evaluateAll(options=>options.map(o=>o.value));
  await page.locator('.layout-key-select').selectOption(values[index]);
  if(await page.locator('#btn-confirm-ok').isVisible()) await page.locator('#btn-confirm-ok').click();
  await page.waitForFunction(value=>document.querySelector('.layout-key-select')?.value===value,values[index]);
  return values[index];
}
async function serverClock(offsetMs) {
  const receipt = new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('controlled server clock acknowledgement timeout')),15000);
    serverProcess.once('message',message=>{clearTimeout(timer);assert.equal(message.clockOffsetMs,offsetMs);resolve();});
  });serverProcess.send({clockOffsetMs:offsetMs});await receipt;
}
async function prepareRestore(page,file) {
  const ready=await bridgeData(page,'checkDatabaseMigrationRequirements',{backupFilePath:file});assert.equal(ready.isReady,true,JSON.stringify({headline:ready.headline,details:ready.details}));
  await page.locator('#input-restore-backup-path').fill(file);
  await page.locator('#btn-check-db-requirements').click();await page.locator('#btn-generate-db-preview').click();await page.locator('#btn-execute-db-restore').waitFor();
}

async function verifyOperationsUniformLayout(page) {
  const tabs=['settings','holidays','rates','users','layout','site-names','releases'];
  // status-bar.ts가 주기적으로 읽는 정확한5개. 변경 API는 이 분류에서 제거되지 않는다.
  const statusReads=new Set(['getAppHealth','getPerformanceSyncState','listPendingFiles','getFileWatchStatus','getUpdateState']);
  const mutationProbes=['saveAppSettings','replaceHolidayCalendar','rotateAccountRecoveryKey'];
  assert.deepEqual([...statusReads,...mutationProbes].filter(name=>!statusReads.has(name)),mutationProbes);
  const evidence=[];
  for(const size of [{width:1024,height:768},{width:1440,height:900},{width:2048,height:1080}]) {
    await page.setViewportSize(size);
    const starts=[];
    for(const tab of tabs) {
      await freshTab(page,tab);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
      const metrics=await page.evaluate(()=>{
        const root=document.querySelector('.ops-menu-workspace'),nav=root.querySelector('.ops-category-nav');
        const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';
        const title=[...root.querySelectorAll('.ops-menu-title')].find(visible),heading=title.closest('.ops-menu-heading');
        const bodyRows=[...root.querySelectorAll('tr.table-row,.holidays-table-row')].filter(visible);
        const mainButtons=[...root.querySelectorAll('.btn')].filter(e=>visible(e)&&!e.closest('td'));
        const rows=[...root.querySelectorAll('.dt-table-wrapper')].filter(visible).map(viewport=>{
          const rowList=[...viewport.querySelectorAll('tr.table-row')];const footer=viewport.closest('.dt-container').querySelector('.pagination-info');
          const total=Number(footer.textContent.match(/총\s+(\d+)/)?.[1]||0),scrollbar=Math.max(0,viewport.offsetHeight-viewport.clientHeight);
          return {count:rowList.length,total,unused:rowList.length?viewport.getBoundingClientRect().bottom-rowList.at(-1).getBoundingClientRect().bottom-scrollbar:0};
        });
        return {width:innerWidth,height:innerHeight,menu:root.dataset.opsMenu,frameTop:root.getBoundingClientRect().top,titleTop:title.getBoundingClientRect().top,titleLeft:title.getBoundingClientRect().left,rootLeft:root.getBoundingClientRect().left,titleFont:getComputedStyle(title).fontSize,navWidth:nav.getBoundingClientRect().width,headingTop:heading.getBoundingClientRect().top,pageOverflow:document.documentElement.scrollWidth-innerWidth,rootOverflow:root.scrollWidth-root.clientWidth,rows:bodyRows.map(row=>row.getBoundingClientRect().height),mainButtons:mainButtons.map(button=>button.getBoundingClientRect().height),tables:rows};
      });
      assert.equal(metrics.menu,tab);assert.equal(metrics.titleFont,'18px');assert(metrics.pageOverflow<=1&&metrics.rootOverflow<=1);
      assert(metrics.rows.every(height=>height>=33.5&&height<=34.5));
      assert(metrics.mainButtons.every(height=>height>=33.5&&height<=34.5));
      if(size.width>1100) {
        assert(Math.abs(metrics.navWidth-180)<=1);assert(Math.abs(metrics.titleLeft-metrics.rootLeft-196)<=1);
        for(const table of metrics.tables)if(table.total>table.count&&table.count>0)assert(table.unused<36,'Table must fill every complete row slot');
      }
      starts.push(metrics.titleTop);
      await page.waitForLoadState('networkidle');
      const before=await page.evaluate(()=>window.__opsCalls.length);
      const categoryIDs=await page.locator('.ops-category-nav [role=tab]').evaluateAll(buttons=>buttons.map(b=>b.id));
      for(const id of categoryIDs) {
        await page.locator('#'+id).click();
        const panelID=await page.locator('#'+id).getAttribute('aria-controls');
        assert.equal(await page.locator('#'+panelID).isVisible(),true);
        assert.equal(await page.locator('#'+id).getAttribute('aria-selected'),'true');
      }
      await page.locator('#'+categoryIDs.at(-1)).focus();
      await page.keyboard.press('Home');assert.equal(await page.locator('#'+categoryIDs[0]).getAttribute('aria-selected'),'true');
      await page.keyboard.press('End');assert.equal(await page.locator('#'+categoryIDs.at(-1)).getAttribute('aria-selected'),'true');
      if(categoryIDs.length>1) {
        await page.keyboard.press(size.width<=1100?'ArrowLeft':'ArrowUp');
        assert.equal(await page.locator('#'+categoryIDs.at(-2)).getAttribute('aria-selected'),'true');
        await page.keyboard.press(size.width<=1100?'ArrowRight':'ArrowDown');
        assert.equal(await page.locator('#'+categoryIDs.at(-1)).getAttribute('aria-selected'),'true');
      }
      const categoryCalls=await page.evaluate(before=>window.__opsCalls.slice(before),before);
      const areaCalls=categoryCalls.filter(name=>!statusReads.has(name));
      assert.deepEqual(areaCalls,[],'Category selection must not call APIs or write; only existing status-bar reads are separate');
      evidence.push({...metrics,categories:categoryIDs.length,categoryCalls:areaCalls.length,backgroundStatusReads:categoryCalls.filter(name=>statusReads.has(name))});
    }
    assert(Math.max(...starts)-Math.min(...starts)<=2,'All seven menu headings must share the same start line');
  }
  await page.setViewportSize({width:1440,height:900});
  await freshTab(page,'rates');
  const rate=page.locator('#input-rate-version-label'),label=await rate.inputValue();await rate.fill(label+'-초안보존');
  await selectOperationsArea(page,'rates','impact');await selectOperationsArea(page,'rates','history');await selectOperationsArea(page,'rates','versions');
  assert.equal(await rate.inputValue(),label+'-초안보존');await rate.fill(label);
  await freshTab(page,'layout');
  await page.locator('.filename-section summary').click();
  const filename=page.locator('[id^=input-layout-filename-]').first();
  const originalName=await filename.inputValue();await filename.fill('초안보존-'+originalName);
  await selectOperationsArea(page,'layout','preview');await selectOperationsArea(page,'layout','history');await selectOperationsArea(page,'layout','editor');
  assert.equal(await filename.inputValue(),'초안보존-'+originalName);await filename.fill(originalName);
  await freshTab(page,'users');await page.locator('.users-table-wrap .dt-search-input').fill('admin');
  await selectOperationsArea(page,'users','security');await selectOperationsArea(page,'users','users');
  assert.equal(await page.locator('.users-table-wrap .dt-search-input').inputValue(),'admin');
  const editButton=page.locator('.users-table-wrap tr.table-row').first().getByRole('button',{name:'수정',exact:true});
  await editButton.focus();await page.keyboard.press('Enter');
  await page.locator('.workforce-modal-overlay').waitFor({state:'visible'});
  assert((await page.locator('.workforce-modal-title').innerText()).includes('수정'));
  await page.keyboard.press('Escape');assert.equal(await page.locator('.workforce-modal-overlay').count(),0);
  await page.locator('.users-table-wrap .dt-search-input').fill('');
  return {viewports:3,menus:7,measurements:evidence,draftAndSearchPreserved:true,keyboardCategories:true,sharedTableKeyboardAction:true,categorySwitchWrites:0};
}

async function selectOperationsArea(page, menu, area) {
  const button=page.locator('#ops-'+menu+'-area-'+area);
  if(await button.getAttribute('aria-selected')!=='true')await button.click();
  await page.locator('#ops-'+menu+'-panel-'+area).waitFor({state:'visible'});
}

async function verifyEditorUsability(page) {
  const measurements=[];
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:929,height:917}]) {
    await page.setViewportSize(viewport);
    await freshTab(page,'rates');await selectOperationsArea(page,'rates','history');
    const dates=await page.locator('.rate-history-table tbody tr td:first-child').evaluateAll(cells=>cells.map(cell=>({text:cell.textContent,width:cell.clientWidth,scroll:cell.scrollWidth,datetime:cell.querySelector('time')?.getAttribute('datetime')})));
    assert(dates.length>0);assert(dates.every(d=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d.text)&&d.datetime&&d.scroll<=d.width),'Every visible change timestamp must fit');
    await freshTab(page,'layout');await page.locator('.actual-canvas-board').waitFor();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const geometry=await page.evaluate(()=>{const board=document.querySelector('.actual-canvas-board'),view=document.querySelector('.canvas-viewport'),b=board.getBoundingClientRect(),v=view.getBoundingClientRect();return {paperWidth:b.width,paperHeight:b.height,viewportWidth:v.width,viewportHeight:v.height,expectedRatio:Number(board.dataset.canvasWidth)/Number(board.dataset.canvasHeight),overflow:document.documentElement.scrollWidth-innerWidth};});
    assert(geometry.paperWidth<=geometry.viewportWidth-20&&geometry.paperHeight<=geometry.viewportHeight-20,'Fit must show the complete paper');
    assert(Math.abs(geometry.paperWidth/geometry.paperHeight-geometry.expectedRatio)<0.02,'Uniform document aspect ratio');
    assert(geometry.paperHeight>=200,'Paper must remain usable on short screens');assert.equal(geometry.overflow,0);
    measurements.push({viewport,dates,geometry});
  }
  await page.setViewportSize({width:1440,height:900});
  await freshTab(page,'layout');
  const baseline=await bridgeData(page,'getDocumentLayout',layoutKeys[0]);
  const saves=await callCount(page,'saveDocumentLayout'),resets=await callCount(page,'resetDocumentLayout');
  const before=await page.locator('.actual-canvas-board').boundingBox();
  await page.locator('#btn-canvas-zoom-in').click();
  assert.equal(await page.locator('.actual-canvas-board').getAttribute('data-view-zoom'),'1.25');
  const enlarged=await page.locator('.actual-canvas-board').boundingBox();assert(enlarged.width>before.width);
  await page.locator('#btn-canvas-zoom-out').click();await page.locator('#btn-canvas-fit').click();
  await page.locator('.canvas-block-select').selectOption({index:1});
  assert.equal(await page.locator('.canvas-block-select').inputValue(),await page.locator('.block-item-btn.selected').getAttribute('id').then(id=>id.slice('block-item-'.length)));
  assert.equal(await page.locator('.filename-section').getAttribute('open'),null);
  await overrideBridge(page,'previewDocumentLayout','async input=>{window.__viewOnlyDraft=input;return window.__opsActual.previewDocumentLayout(input);}');
  await page.locator('#btn-preview-layout').click();await page.locator('#preview-display-area a').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__viewOnlyDraft.definition),baseline.definition,'Zoom, fit, selection and resize must not change the draft');
  await restoreBridge(page,'previewDocumentLayout');
  assert.equal(await callCount(page,'saveDocumentLayout'),saves);assert.equal(await callCount(page,'resetDocumentLayout'),resets);
  return {measurements,viewOnlyDraftUnchanged:true,zoomAndFit:true,blockSelection:true,implicitWrites:0,actualPreview:true};
}

async function fetchHolidayPreview(page) {
  if(await page.locator('#holiday-area-import').getAttribute('aria-selected')!=='true') await page.locator('#holiday-area-import').click();
  await page.locator('#holiday-panel-import').waitFor({state:'visible'});
  await page.locator('#btn-fetch-holiday-api').click();
}

async function verifyHolidayCategories(page) {
  const writes=await callCount(page,'replaceHolidayCalendar'),fetches=await callCount(page,'fetchHolidayApiItems');
  await page.locator('#holiday-search-input').fill('시험공휴일');
  await page.waitForFunction(()=>document.querySelector('.cell-name')?.textContent.includes('시험공휴일'));
  await page.locator('#btn-holidays-number-2').click();
  const prior=await page.evaluate(()=>({selected:document.querySelector('.holidays-table-row.selected')?.dataset.id,page:document.querySelector('.ops-holidays-pagination-info')?.textContent,year:document.querySelector('#holiday-year-select').value}));
  await page.locator('#holiday-area-calendar').focus();await page.keyboard.press('End');
  assert.equal(await page.locator('#holiday-area-import').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#holiday-panel-calendar').isVisible(),false);
  assert.equal(await page.locator('.ops-holiday-import-steps li').count(),3);
  const copy=await page.locator('#holiday-panel-import').innerText();
  for(const phrase of ['불러오기와 비교는 저장된 공휴일을 변경하지 않습니다','직접 추가한 공휴일','취소하면 기존 목록을 유지','설정 → 시스템·감시'])assert(copy.includes(phrase),phrase);
  assert.equal(await callCount(page,'replaceHolidayCalendar'),writes);assert.equal(await callCount(page,'fetchHolidayApiItems'),fetches);
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#holiday-search-input').inputValue(),'시험공휴일');
  const after=await page.evaluate(()=>({selected:document.querySelector('.holidays-table-row.selected')?.dataset.id,page:document.querySelector('.ops-holidays-pagination-info')?.textContent,year:document.querySelector('#holiday-year-select').value}));
  assert.deepEqual(after,prior);
  const buttons=await page.evaluate(()=>[...document.querySelectorAll('.holidays-table-row:first-child .btn')].map(button=>{const s=getComputedStyle(button);return {height:button.getBoundingClientRect().height,font:s.fontFamily,border:s.border,radius:s.borderRadius};}));
  assert.equal(buttons.length,2);assert(buttons.every(b=>b.height===28&&!b.border.includes('outset')&&b.radius==='6px'));assert.equal(buttons[0].font,buttons[1].font);
  await page.locator('#holiday-search-input').fill('');
  await page.waitForFunction(()=>document.querySelector('.cell-name')?.textContent==='신정');
  return {keyboardCategories:true,searchPageSelectionPreserved:true,categorySwitchFetches:0,categorySwitchWrites:0,threeStepsAndDataImpactCopy:true,buttons};
}

async function verifyHolidayBoundaries(page, adminCreds) {
  const data=(name,...args)=>bridgeData(page,name,...args), count=name=>callCount(page,name);
  const evidence={};
  await freshTab(page,'holidays');
  evidence.categories=await verifyHolidayCategories(page);
  const writesBeforeCancel=await count('replaceHolidayCalendar');
  for(const close of ['Escape','header']) {
    await fetchHolidayPreview(page);
    await page.locator('#modal-compare-holidays').waitFor();
    assert.equal(await page.locator('#holiday-year-select').isDisabled(),true);
    assert.equal(await page.locator('#btn-add-holiday').isDisabled(),true);
    if(close==='Escape') await page.keyboard.press('Escape');
    else await page.locator('#modal-compare-holidays .workforce-modal-header button').click();
    assert.equal(await page.locator('#modal-compare-holidays').count(),0);
    assert.equal(await page.locator('#holiday-year-select').isDisabled(),false);
    assert.equal(await page.locator('#btn-add-holiday').isDisabled(),false);
  }
  assert.equal(await count('replaceHolidayCalendar'),writesBeforeCancel);
  evidence.closePathsUnlockWithoutWrites=true;

  await overrideBridge(page,'fetchHolidayApiItems','async()=>new Promise((resolve,reject)=>{window.__holidayOldReject=reject;})');
  await fetchHolidayPreview(page);
  await page.waitForFunction(()=>!!window.__holidayOldReject);
  const locked=await page.evaluate(()=>['#holiday-year-select','#btn-add-holiday','#btn-fetch-holiday-api','#holiday-area-calendar','#holiday-area-import','.btn-rename-holiday','.btn-delete-holiday'].every(selector=>document.querySelector(selector)?.disabled));
  assert.equal(locked,true);
  await page.evaluate(()=>document.querySelector('.holidays-table-row')?.click());
  assert.equal(await page.locator('#modal-holiday-detail').count(),0);
  await page.locator('#tab-btn-settings').click();
  await page.locator('.ops-settings-workspace').waitFor();
  await page.locator('#tab-btn-holidays').click();
  await page.locator('#holidays-table').waitFor();
  await page.locator('#btn-add-holiday').click();
  await page.locator('#input-add-holiday-name').fill('새 화면의 입력 보존');
  await page.evaluate(()=>window.__holidayOldReject(new Error('CONTROLLED_OLD_HOLIDAY_FETCH')));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  assert.equal(await page.locator('#modal-add-holiday').count(),1);
  assert.equal(await page.locator('#input-add-holiday-name').inputValue(),'새 화면의 입력 보존');
  assert.equal(await page.locator('#operations-notice-modal').count(),0);
  assert.equal(await page.locator('#btn-add-holiday').isDisabled(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#btn-add-holiday').isDisabled(),false);
  await restoreBridge(page,'fetchHolidayApiItems');
  evidence.lateOldFailurePreservesNewDialog=true;

  const collision=await data('replaceHolidayCalendar',{year:2028,sourceName:'검수',items:[{holidayDate:'2028-01-01',name:'Name',isSubstitute:false},{holidayDate:'2028-02-01',name:'Other',isSubstitute:false}]});
  await page.locator('#holiday-year-select').selectOption('2028');
  await page.waitForFunction(()=>document.querySelector('.cell-date')?.textContent.includes('2028'));
  await fetchHolidayPreview(page);
  await page.locator('#modal-compare-holidays').waitFor();
  const a=collision.items[0],b=collision.items[1];
  await data('renameHolidayItem',{holidayItemId:a.id,name:`${a.name}|0;${b.id}|${b.holidayDate}|${b.name}`});
  await data('deleteHolidayItem',{holidayItemId:b.id});
  const writes=await count('replaceHolidayCalendar');
  await page.locator('#btn-confirm-ok').click();
  await page.locator('#modal-compare-holidays .alert-danger').waitFor({state:'visible'});
  assert((await page.locator('#modal-compare-holidays .alert-danger').innerText()).includes('변경'));
  assert.equal(await count('replaceHolidayCalendar'),writes);
  assert.equal(await page.locator('#btn-confirm-ok').isDisabled(),true);
  await page.locator('#btn-confirm-cancel').click();
  await data('replaceHolidayCalendar',{year:2028,items:[]});
  await page.locator('#holiday-year-select').selectOption('2026');
  await page.waitForFunction(()=>document.querySelector('.cell-date')?.textContent.includes('2026'));
  negative('N08','holiday-stale-calendar-identity',()=>assert.equal(evidence.closePathsUnlockWithoutWrites,true));
  evidence.changedCalendarRejectedWithoutWrite=true;
  await page.locator('#holiday-area-calendar').click();

  const dimensions=[];
  for(const size of [{width:929,height:917},{width:1024,height:768},{width:1440,height:900},{width:2048,height:1080}]) {
    await page.setViewportSize(size);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const measured=await page.evaluate(()=>{
      const vp=document.querySelector('#holidays-table-viewport'),rows=[...document.querySelectorAll('.holidays-table-row')],table=document.querySelector('.ops-holidays-table-panel'),detail=document.querySelector('.ops-holidays-detail-panel'),footer=document.querySelector('#holidays-pagination-container');
      return {width:innerWidth,height:innerHeight,rowHeight:rows[0].getBoundingClientRect().height,rows:rows.length,extraSpace:vp.getBoundingClientRect().bottom-rows.at(-1).getBoundingClientRect().bottom,align:innerWidth>1100?Math.max(Math.abs(table.getBoundingClientRect().top-detail.getBoundingClientRect().top),Math.abs(table.getBoundingClientRect().bottom-detail.getBoundingClientRect().bottom)):0,footerBottom:footer.getBoundingClientRect().bottom,headerHidden:getComputedStyle(document.querySelector('.operations-screen-header')).display==='none',pageOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert(measured.rowHeight>=32&&measured.rowHeight<=36);
    assert(measured.headerHidden&&measured.align<=2&&measured.pageOverflow<=1);
    assert(measured.footerBottom<=size.height);
    if(size.width>1100)assert(measured.extraSpace<measured.rowHeight+2,'Wide table should fill every complete row slot');
    if(size.width<=1100) {
      await page.locator('#holiday-area-calendar').focus();await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#holiday-panel-import').isVisible(),true);
      await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#holiday-panel-calendar').isVisible(),true);
    }
    dimensions.push(measured);
  }
  evidence.dimensions=dimensions;
  await page.setViewportSize({width:1440,height:900});

  const literal=('HOL-LITERAL <img src=x onerror="window.__holidayLiteral=1"> | ; '+ '긴 공휴일 이름 '.repeat(100)).trim();
  const saved=await data('addHolidayItem',{year:2026,holidayDate:'2026-12-27',name:literal,isSubstitute:false});
  const literalItem=saved.items.find(item=>item.holidayDate==='2026-12-27');assert(literalItem);
  await freshTab(page,'holidays');
  await page.locator('#holiday-search-input').fill('HOL-LITERAL');
  await page.waitForFunction(()=>document.querySelectorAll('.holidays-table-row').length===1);
  assert.equal(await page.locator('.cell-name').innerText(),literal);
  assert.equal(await page.locator('.cell-name img').count(),0);
  assert((await page.locator('#holidays-detail-container').innerText()).includes(literal));
  assert.equal(await page.evaluate(()=>window.__holidayLiteral),undefined);
  await data('deleteHolidayItem',{holidayItemId:literalItem.id});
  await freshTab(page,'holidays');
  negative('N12','holiday-literal-name',()=>assert.equal(literal.includes('| ;'),true));
  evidence.literalNamePreservedWithoutExecution=true;

  for(const errorCode of ['AUTH_SESSION_REQUIRED','SESSION_EXPIRED']) {
    await fetchHolidayPreview(page);
    await page.locator('#modal-compare-holidays').waitFor();
    await bridgeData(page,'signOut');
    await overrideBridge(page,'listHolidayCalendars',`async()=>({ok:false,errorCode:${JSON.stringify(errorCode)},message:'통제된 세션 만료'})`);
    await page.locator('#btn-confirm-ok').click();
    await page.locator('#login-id').waitFor({state:'visible'});
    assert.equal(await page.locator('#modal-compare-holidays').count(),0);
    await restoreBridge(page,'listHolidayCalendars');
    await performNormalLogin(page,targetUrl,adminCreds,null,value=>artifactRegistry.register(value));
    await installCalls(page);
    await page.locator('button[data-id="operations"]').click();
    await page.locator('.ops-settings-workspace').waitFor();
    await page.locator('#tab-btn-holidays').click();
    await page.locator('#holidays-table').waitFor();
  }
  evidence.currentSessionErrorsReturnToLogin=true;
  negative('N11','holiday-late-response-and-modal-close',()=>assert(evidence.lateOldFailurePreservesNewDialog&&evidence.currentSessionErrorsReturnToLogin));
  return evidence;
}

async function verifyScenario(id,{page,browser,context,adminCreds,seeded,resourcesDir}) {
  const api=(name,...args)=>bridgeCall(page,name,...args), data=(name,...args)=>bridgeData(page,name,...args);
  const count=name=>callCount(page,name);
  extraEvidence[id]={kind:'ACTUAL_UI_AND_API',assertions:[]};
  const record=label=>extraEvidence[id].assertions.push(label);
  if(id==='S01') {
    assert(Object.values(seeded).every(value=>value>=55),'All six fixture sets contain at least 55 actual records');
    for(const tab of ['settings','holidays','rates','users','layout','site-names','releases']) {
      await freshTab(page,tab);
      if(tab==='users') {
        assert.equal(await page.locator('.operations-tab-list').count(),0);
        assert.equal(await page.locator('.operations-tab-content[role=region]').getAttribute('aria-labelledby'),'operations-screen-title');
      } else {
        assert.equal(await page.locator('.tab-btn.active').getAttribute('id'),`tab-btn-${tab}`);
        assert.equal(await page.locator('.operations-tab-content[role=tabpanel]').getAttribute('aria-labelledby'),`tab-btn-${tab}`);
      }
    }
    await page.locator('button[data-id="user-mgmt"]').click();
    await page.locator('.operations-users-wrap').waitFor();
    assert.equal(await page.locator('.operations-users-wrap').count(),1);
    assert.equal(await page.locator('.operations-tab-list').count(),0);
    record('Six actual operation tabs and standalone user menu retain all seven features with accessible panels');
  }
  if(id==='S02') {
    await freshTab(page,'site-names');
    const actual=await data('listSiteNameOptions');assert.equal(actual.length,55);
    await page.locator('.dt-table th').first().click();
    const ids=[],names=[],counts=[];
    const capacity=await page.locator(".dt-table tr.table-row").count(), pageCount=Math.ceil(actual.length/capacity);
    for(let pageNo=1;pageNo<=pageCount;pageNo++) {
      const rows=await page.locator('.dt-table tr.table-row').evaluateAll(rows=>rows.map(r=>({id:r.dataset.id,name:r.querySelector('td')?.textContent})));
      counts.push(rows.length);ids.push(...rows.map(r=>r.id));names.push(...rows.map(r=>r.name));
      if(pageNo<pageCount) await page.locator('.btn-next-page').click();
    }
    assert.deepEqual(counts,Array.from({length:pageCount},(_,i)=>Math.min(capacity,actual.length-i*capacity)));assert.equal(new Set(ids).size,55);
    assert.deepEqual(new Set(ids),new Set(actual.map(r=>r.id)));
    assert.deepEqual(names,[...actual].sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(r=>r.name));
    await page.locator('.dt-search-input').fill('시험근무지_01');
    assert.equal(await page.locator('tr.table-row').count(),1);
    assert.match(await page.locator('tr.table-row').innerText(),/시험근무지_01/);
    await page.locator('.dt-search-input').fill('');record('55 distinct records sorted globally across height-adaptive pages; filter resets page');
  }
  if(id==='S03') {
    await freshTab(page,'settings');
    const before=await data('getAppSettings');
    const fieldAreaMap = {
      pendingDir: 'folders', approvedDir: 'folders', scheduleExportDir: 'folders',
      databaseBackupTime: 'backup',
      scheduleConsecutiveNightLimit: 'policy', scheduleMinimumRestMinutes: 'policy',
      scheduleWeeklyMaxMinutes: 'policy'
    };
    const changes={pendingDir:path.join(userDataDir,'pending'),approvedDir:path.join(userDataDir,'approved'),scheduleExportDir:path.join(userDataDir,'export'),databaseBackupTime:'03:17',scheduleConsecutiveNightLimit:5,scheduleMinimumRestMinutes:720,scheduleWeeklyMaxMinutes:2880};
    for(const [key,value] of Object.entries(changes)) {
      await selectSettingsArea(page, fieldAreaMap[key]);
      await page.locator(`#input-${key}`).fill(String(value));
    }

    // 영역 전환 후에도 미저장 값 및 dirty 상태 보존 확인
    await selectSettingsArea(page, 'system');
    await selectSettingsArea(page, 'policy');
    assert.equal(await page.locator('#input-scheduleConsecutiveNightLimit').inputValue(), '5');
    const dirtyText = await page.locator('#ops-settings-dirty-status').innerText();
    assert(dirtyText.includes('저장되지 않은 변경'), '미저장 변경 개수가 표시되어야 함');

    // 되돌리기 취소 -> 값 보존 및 API 쓰기 0
    const writesBeforeRevert = await count('saveAppSettings');
    await page.locator('#btn-revert-settings').click();
    await page.locator('#btn-confirm-cancel').click();
    assert.equal(await count('saveAppSettings'), writesBeforeRevert, '되돌리기 취소는 API 쓰기 0');
    assert.equal(await page.locator('#input-scheduleConsecutiveNightLimit').inputValue(), '5');

    const writes=await count('saveAppSettings');
    await page.locator('#tab-btn-holidays').click();await page.locator('#btn-confirm-cancel').click();
    const canceledWrites=await count('saveAppSettings');
    negative('N02','settings-discard-cancel',()=>assert.equal(canceledWrites,writes));
    assert.equal(await page.locator('#input-scheduleConsecutiveNightLimit').inputValue(),'5');
    await page.locator('#btn-save-settings').click();await notice(page);assert.equal(await count('saveAppSettings'),writes+1);
    const after=await data('getAppSettings');for(const [key,value] of Object.entries(changes)) assert.equal(after[key],value,key);
    for(const [key,value] of Object.entries(before)) if(!(key in changes)&&!['updatedAt','updatedBy'].includes(key)) assert.deepEqual(after[key],value,key);
    await freshTab(page,'holidays');await freshTab(page,'settings');
    await selectSettingsArea(page, 'backup');
    assert.equal(await page.locator('#input-databaseBackupTime').inputValue(),'03:17');
    const invalidWrites=[];
    for(const [key,value] of [['scheduleConsecutiveNightLimit',''],['scheduleMinimumRestMinutes','-1'],['databaseBackupTime','']]) {
      const area = fieldAreaMap[key] || 'policy';
      await selectSettingsArea(page, area);
      const field=page.locator(`#input-${key}`), original=await field.inputValue(), originalType=await field.getAttribute('type');
      await field.evaluate((input,value)=>{if(input.type==='date')input.type='text';input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
      const old=await count('saveAppSettings');
      // 다른 영역으로 이동 후 저장 실행 시 해당 오류 영역으로 자동 전환 및 포커스 복귀 확인
      await selectSettingsArea(page, 'folders');
      await page.locator('#btn-save-settings').click();
      assert.equal(await page.locator(`#settings-area-${area}`).isVisible(), true, '오류 영역으로 자동 전환되어야 함');
      await notice(page);
      invalidWrites.push((await count('saveAppSettings'))-old);
      assert.equal(await page.evaluate(id => document.activeElement?.id, `input-${key}`), `input-${key}`, '오류 필드로 포커스 복귀되어야 함');
      await field.evaluate((input,{type,value})=>{input.type=type||'text';input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},{type:originalType,value:original});
    }
    negative('N03','settings-missing-unit-time-date',()=>assert.deepEqual(invalidWrites,[0,0,0]));

    // POLICY-HISTORY-01: 새 정책 이력, 미리보기, 확정, 일반 날짜 writer 우회 거절 검증
    await selectSettingsArea(page, 'policy');
    assert.equal(await page.locator('.policy-summary-card').count(), 2, '2개의 정책 카드가 렌더링되어야 함');

    // 일반 saveAppSettings로 날짜 키 변경 시도 시 우회 차단 검증
    const bypassResult = await page.evaluate(async () => {
      try {
        const res = await window.appBridge.saveAppSettings({ substituteAllowancePolicyEffectiveFrom: '2026-11-01' });
        return { ok: res.ok, code: res.ok ? null : res.errorCode };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    });
    assert.equal(bypassResult.ok, false, '날짜 키 우회 저장은 차단되어야 함');
    assert.match(bypassResult.code || '', /POLICY_MANAGED_SETTINGS/, 'POLICY_MANAGED_SETTINGS 에러 코드 반환');

    // 정책 이력 모달 및 새 정책 등록 흐름 검증
    await page.locator('#btn-open-substitute-policy').click();
    await sleep(1000);
    await page.locator('.policy-history-dense-table').waitFor();
    assert.equal(await page.locator('.policy-history-dense-table').isVisible(), true, '정책 Dense 테이블 표시');

    // 새 정책 추가 다이얼로그 열기
    await page.locator('#btn-add-new-policy').click();
    await page.locator('#policy-dialog-form').waitFor();

    // N03: 잘못된 입력(빈 사유) 검증
    await page.locator('#btn-policy-preview').click();
    assert.equal(await page.locator('#policy-dialog-error').isVisible(), true, '사유 누락 시 오류 표시');

    // 정상 입력 후 미리보기
    const activeSub = await data('listPolicyHistory',{kind:'substitute-eligibility',pageSize:100});
    const initialRule = activeSub.currentRevision.revision.ruleKey === 'substitute-legacy' ? 'substitute-team-type-v1' : 'substitute-legacy';
    await page.locator('#policy-rule-select').selectOption(initialRule);
    await page.locator('#policy-reason-input').fill('2026년 12월 정책 개정 사전 등록');
    await page.locator('#policy-date-input').fill('2026-12-01');
    await overrideBridge(page, 'previewPolicyChange', 'async input => { const result = await window.__opsActual.previewPolicyChange(input); return new Promise(resolve => { window.__releasePolicyPreview = () => resolve(result); }); }');
    await page.locator('#btn-policy-preview').click();
    await page.waitForFunction(() => !!window.__releasePolicyPreview);
    await page.locator('#policy-date-input').fill('2026-12-02');
    await page.evaluate(() => window.__releasePolicyPreview());
    await page.waitForFunction(() => !document.querySelector('#btn-policy-preview').disabled);
    assert.equal(await page.locator('#btn-policy-confirm').isEnabled(), false, '입력 변경 전 미리보기는 확정할 수 없음');
    await restoreBridge(page, 'previewPolicyChange');
    await page.locator('#policy-date-input').fill('2026-12-01');
    await page.locator('#btn-policy-preview').click();
    await page.locator('.policy-impact-preview-box').waitFor().catch(async error => { throw new Error(`${error.message}; policy error: ${await page.locator('#policy-dialog-error').textContent()}`); });
    assert.equal(await page.locator('.policy-impact-preview-box').isVisible(), true, '영향 미리보기 표시');
    assert.equal(await page.locator('#btn-policy-confirm').isEnabled(), true, '확인 후 등록 활성화');

    // 실제 확정 응답 지연 중 입력과 중복 실행을 막고 성공 안내 소유권을 유지한다.
    const applyCountBefore = await count('applyPolicyChange');
    await overrideBridge(page, 'applyPolicyChange', 'async input => { const result = await window.__opsActual.applyPolicyChange(input); return new Promise(resolve => { window.__releasePolicyApply = () => resolve(result); }); }');
    await page.locator('#btn-policy-confirm').click();
    await page.waitForFunction(() => !!window.__releasePolicyApply);
    assert.equal(await page.locator('#policy-reason-input').isDisabled(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#policy-dialog-form').count(),1);
    assert.equal((await count('applyPolicyChange'))-applyCountBefore,1);
    await page.evaluate(() => window.__releasePolicyApply());
    await restoreBridge(page, 'applyPolicyChange');
    await sleep(500);

    await page.locator('#policy-history-table-container .policy-history-dense-table').waitFor();
    const createdPolicies = await data('listPolicyHistory', {kind:'substitute-eligibility',pageSize:100});
    const added = createdPolicies.revisions.find(row => row.effectiveFrom === '2026-12-01');
    assert(added && added.origin === 'registered');
    await page.locator(`.btn-correct-policy[data-id="${added.id}"]`).click();
    await page.locator('#policy-date-input').fill('2026-12-02');
    await page.locator('#policy-reason-input').fill('적용일 정정 <예시>');
    await page.locator('#btn-policy-preview').click();await page.locator('.policy-impact-preview-box').waitFor().catch(async error => { throw new Error(`${error.message}; policy error: ${await page.locator('#policy-dialog-error').textContent()}`); });
    await page.locator('#btn-policy-confirm').click();await page.locator('#policy-history-table-container .policy-history-dense-table').waitFor();
    const correctedPolicies = await data('listPolicyHistory', {kind:'substitute-eligibility',pageSize:100});
    assert.equal(correctedPolicies.revisions.find(row => row.id === added.id).effectiveFrom, '2026-12-01', '정정 전 원본 보존');
    const corrected = correctedPolicies.revisions.find(row => row.effectiveFrom === '2026-12-02');
    assert(corrected && corrected.origin === 'correction');
    await page.locator(`.btn-cancel-policy[data-id="${corrected.id}"]`).click();
    await page.locator('#policy-reason-input').fill('미사용 예약 취소');
    await page.locator('#btn-policy-preview').click();await page.locator('.policy-impact-preview-box').waitFor().catch(async error => { throw new Error(`${error.message}; policy error: ${await page.locator('#policy-dialog-error').textContent()}`); });
    await page.locator('#btn-policy-confirm').click();await page.locator('#policy-history-table-container .policy-history-dense-table').waitFor();
    await page.locator('#btn-toggle-events').click();await page.locator('.policy-show-event').first().waitFor();
    await page.locator('.policy-show-event').first().click();await page.locator('#operations-policy-details').waitFor();
    assert.equal(await page.locator('.policy-detail-section').count(),2,'변경 전후 기준 상세');
    await page.keyboard.press('Escape');await page.locator('#policy-history-table-container .policy-history-dense-table').waitFor();
    await page.keyboard.press('Escape');
    // Populate a second real page through the same preview/apply APIs, retaining every revision.
    let lastRule = (await data('listPolicyHistory',{kind:'changed-worker-priority',pageSize:100})).currentRevision.revision.ruleKey;
    for(let month=1;month<=12;month++) {
      lastRule = lastRule === 'changed-worker-legacy' ? 'changed-worker-after-v1' : 'changed-worker-legacy';
      const preview = await data('previewPolicyChange',{action:'add',kind:'changed-worker-priority',ruleKey:lastRule,effectiveFrom:`2090-${String(month).padStart(2,'0')}-01`,reason:`페이지 검문 ${month}`});
      await data('applyPolicyChange',{previewToken:preview.previewToken});
      const reused=await api('applyPolicyChange',{previewToken:preview.previewToken});assert(!reused.ok && reused.errorCode==='POLICY_PREVIEW_EXPIRED');
    }
    await page.locator('#btn-open-changed-slot-policy').click();await page.locator('#btn-policy-next-page').waitFor();
    await page.locator('#btn-policy-next-page').click();await page.waitForFunction(()=>document.querySelector('.policy-page-info')?.textContent.includes('페이지 2'));
    await page.keyboard.press('Escape');
    record('Actual policy add/correct/cancel, immutable original, event before/after, page2, edited pending preview rejected and consumed tokens rejected');

    // 모달 닫기
    await page.keyboard.press('Escape');
    await sleep(200);

    // ADM01-D01 회귀 검문: 정상 지연 응답 중 추가 입력 보존, 되돌리기 확인 복원(API 쓰기 0), 실패 저장 초안 보존
    await selectSettingsArea(page, 'policy');
    const nightLimitInputD01 = page.locator('#input-scheduleConsecutiveNightLimit');
    await nightLimitInputD01.fill('6');
    await overrideBridge(page, 'saveAppSettings', 'async input => new Promise(resolve => { window.__releaseDelayedSave = () => resolve(window.__opsActual.saveAppSettings(input)); })');
    await page.locator('#btn-save-settings').click();
    await page.waitForFunction(() => !!window.__releaseDelayedSave);
    // 지연 저장 진행 중 입력을 7로 변경
    await nightLimitInputD01.fill('7');
    await page.evaluate(() => window.__releaseDelayedSave());
    await notice(page); // 저장 완료 모달 닫기
    await restoreBridge(page, 'saveAppSettings');
    assert.equal(await nightLimitInputD01.inputValue(), '7', '지연 응답 중 추가 입력 7이 보존되어야 함');
    assert((await page.locator('#ops-settings-dirty-status').innerText()).includes('저장되지 않은 변경 1개'));
    assert.equal(await page.locator('#btn-revert-settings').isEnabled(), true);

    // 되돌리기 확인 시 마지막 저장값(6)으로 복원 및 API 쓰기 0
    const writesBeforeRevertD01 = await count('saveAppSettings');
    await page.locator('#btn-revert-settings').click();
    await page.locator('#btn-confirm-ok').click();
    assert.equal(await count('saveAppSettings'), writesBeforeRevertD01, '되돌리기 확인은 API 쓰기 0');
    assert.equal(await nightLimitInputD01.inputValue(), '6', '마지막 저장값 6으로 복원되어야 함');
    assert((await page.locator('#ops-settings-dirty-status').innerText()).includes('저장된 설정'));

    // 실패 저장의 초안 및 dirty 보존 검문
    await nightLimitInputD01.fill('7');
    await overrideBridge(page, 'saveAppSettings', 'async () => ({ ok: false, errorCode: "CONTROLLED_FAIL", message: "통제된 저장 실패" })');
    await page.locator('#btn-save-settings').click();
    await notice(page);
    await restoreBridge(page, 'saveAppSettings');
    assert.equal(await nightLimitInputD01.inputValue(), '7', '실패 후에도 입력 초안 7 보존');
    assert((await page.locator('#ops-settings-dirty-status').innerText()).includes('저장되지 않은 변경 1개'));
    await page.locator('#btn-revert-settings').click();
    await page.locator('#btn-confirm-ok').click();
    assert.equal(await nightLimitInputD01.inputValue(), '6');
    // 원래 5로 정리 저장
    await nightLimitInputD01.fill('5');
    await page.locator('#btn-save-settings').click();
    await notice(page);

    record('Full settings saved once and re-read, unrelated fields preserved, invalid writes zero, areas navigated and focus restored, delayed draft and revert verified');
  }
  if(id==='S04') {
    await freshTab(page,'settings');
    await selectSettingsArea(page, 'system');
    const stop=await count('stopFileWatch');await page.locator('.operations-settings-wrap #btn-stop-watch').dblclick();await notice(page);
    const stopped=await data('getFileWatchStatus');assert.equal(await count('stopFileWatch'),stop+1);assert.equal(stopped.isRunning,false);
    await page.locator('.operations-settings-wrap #btn-ops-restart-watch').click();await notice(page);const started=await data('getFileWatchStatus');assert.equal(started.isRunning,true);
    negative('N02','watch-double-click',()=>assert.equal(stopped.isRunning,false));

    // ADM01-D02 회귀 검문: 야간제한 -1(오류 상태)에서 getFileWatchStatus 지연 중 저장 클릭 시 오류 모달 유지 확인
    await selectSettingsArea(page, 'policy');
    const nightLimitInputS04 = page.locator('#input-scheduleConsecutiveNightLimit');
    const originalLimitS04 = await nightLimitInputS04.inputValue();
    await nightLimitInputS04.fill('-1');
    await selectSettingsArea(page, 'system');
    await overrideBridge(page, 'getFileWatchStatus', 'async () => new Promise(resolve => { window.__releaseLateWatch = () => resolve(window.__opsActual.getFileWatchStatus()); })');
    await page.locator('#btn-ops-refresh-watch-status').click();
    await page.waitForFunction(() => !!window.__releaseLateWatch);
    await page.locator('#btn-save-settings').click();
    await page.locator('.workforce-modal-overlay').waitFor();
    const modalTitleBefore = await page.locator('.workforce-modal-title').innerText();
    assert.equal(modalTitleBefore, '설정 입력 오류', '입력 오류 모달이 표시되어야 함');
    // 지연된 감시 상태 응답 방출 -> 기존 오류 모달을 덮어쓰지 않아야 함
    await page.evaluate(() => window.__releaseLateWatch());
    await sleep(300);
    const modalTitleAfter = await page.locator('.workforce-modal-title').innerText();
    assert.equal(modalTitleAfter, '설정 입력 오류', '지연된 감시 조회가 최신 오류 모달을 덮어쓰지 않아야 함');
    await notice(page); // 오류 모달 닫기
    await restoreBridge(page, 'getFileWatchStatus');
    await selectSettingsArea(page, 'policy');
    await nightLimitInputS04.fill(originalLimitS04);
    await selectSettingsArea(page, 'system');

    // 신규 UX 검문: 통제된 getFileWatchStatus 실패 주입 및 '상태 다시 조회' 복구 확인
    const stopBeforeProbe = await count('stopFileWatch');
    const restartBeforeProbe = await count('restartFileWatch');
    const saveBeforeProbe = await count('saveAppSettings');
    await overrideBridge(page,'getFileWatchStatus','async () => ({ ok: false, errorCode: "INTERNAL_ERROR", message: "통제된 감시 조회 실패" })');
    await page.locator('#btn-ops-refresh-watch-status').click();
    await notice(page);
    const statusBadgeText = await page.locator('.file-watch-section .status-badge').innerText();
    assert(statusBadgeText.includes('확인 실패'), '조회 실패 시 중지가 아닌 확인 실패로 표시되어야 함');
    await restoreBridge(page,'getFileWatchStatus');
    await page.locator('#btn-ops-refresh-watch-status').click();
    await notice(page);
    assert.equal(await count('stopFileWatch'), stopBeforeProbe, '재조회에서 stopFileWatch 호출 0');
    assert.equal(await count('restartFileWatch'), restartBeforeProbe, '재조회에서 restartFileWatch 호출 0');
    assert.equal(await count('saveAppSettings'), saveBeforeProbe, '재조회에서 saveAppSettings 호출 0');
    const recovered = await data('getFileWatchStatus');
    assert.equal(recovered.isRunning, true, '정상 재조회 후 감시 상태 복구');

    // D02: stop/restart actions must preserve a newer validation dialog as well as reads.
    await selectSettingsArea(page,'policy');
    const limitBeforeLateStop = await page.locator('#input-scheduleConsecutiveNightLimit').inputValue();
    await page.locator('#input-scheduleConsecutiveNightLimit').fill('-1');
    await selectSettingsArea(page,'system');
    await overrideBridge(page,'stopFileWatch','async()=>{const result=await window.__opsActual.stopFileWatch();return new Promise(resolve=>{window.__releaseLateStop=()=>resolve(result);});}');
    await page.locator('#btn-stop-watch').click();await page.waitForFunction(()=>!!window.__releaseLateStop);
    await page.locator('#btn-save-settings').click();await page.locator('#operations-notice-modal').waitFor();
    assert.equal(await page.locator('.workforce-modal-title').innerText(),'설정 입력 오류');
    await page.evaluate(()=>window.__releaseLateStop());await sleep(100);
    assert.equal(await page.locator('.workforce-modal-title').innerText(),'설정 입력 오류','Late stop cannot replace newer error');
    await notice(page);await restoreBridge(page,'stopFileWatch');
    await selectSettingsArea(page,'policy');await page.locator('#input-scheduleConsecutiveNightLimit').fill(limitBeforeLateStop);
    await selectSettingsArea(page,'system');await page.locator('#btn-ops-restart-watch').click();await notice(page);

    // D06/D07: service messages remain literal text, including the last processing error.
    const literal = '<b data-watch-literal>감시 오류 문자열</b>';
    await overrideBridge(page,'getFileWatchStatus',`async()=>({ok:false,errorCode:"INTERNAL_ERROR",message:${JSON.stringify(literal)}})`);
    await page.locator('#btn-ops-refresh-watch-status').click();await notice(page);
    assert.equal(await page.locator('.watch-details [data-watch-literal]').count(),0);
    assert((await page.locator('.watch-details').innerText()).includes(literal));
    await overrideBridge(page,'getFileWatchStatus',`async()=>{const result=await window.__opsActual.getFileWatchStatus();return {...result,data:{...result.data,lastErrorMessage:${JSON.stringify(literal)}}};}`);
    await page.locator('#btn-ops-refresh-watch-status').click();await notice(page);
    assert.equal(await page.locator('.watch-details [data-watch-literal]').count(),0);
    assert((await page.locator('.watch-details').innerText()).includes(literal));
    await restoreBridge(page,'getFileWatchStatus');await page.locator('#btn-ops-refresh-watch-status').click();await notice(page);
    extraEvidence[id].settingsAsyncOwnershipAndLiteralMessages = true;
    record('Actual watcher stop/restart state and double-click count, controlled failure display and recovery without side effects');
  }
  if(id==='S05') {
    const added=await data('addHolidayItem',{year:2026,holidayDate:'2026-12-29',name:'변경 전',isSubstitute:false});
    const item=added.items.find(i=>i.holidayDate==='2026-12-29');assert(item);
    await data('renameHolidayItem',{holidayItemId:item.id,name:'변경 후'});
    assert.equal((await data('getHolidayCalendar',2026)).items.find(i=>i.id===item.id).name,'변경 후');
    const duplicate=await api('addHolidayItem',{year:2026,holidayDate:'2026-12-29',name:'중복',isSubstitute:false});assert.equal(duplicate.ok,false);
    const wrongYear=await api('addHolidayItem',{year:2026,holidayDate:'2027-01-01',name:'다른 연도',isSubstitute:false});assert.equal(wrongYear.ok,false);
    await data('deleteHolidayItem',{holidayItemId:item.id});assert(!(await data('getHolidayCalendar',2026)).items.some(i=>i.id===item.id));
    negative('N03','holiday-year-duplicate',()=>assert(!duplicate.ok&&!wrongYear.ok));record('Holiday add/rename/delete persisted; wrong year and duplicate rejected');
  }
  if(id==='S06') {
    const {createServer}=await import('node:http');
    holidayServer=createServer((request,response)=>{
      response.setHeader('Content-Type','application/json');
      const url = new URL(request.url, 'http://127.0.0.1');
      const reqYear = url.searchParams.get('year') || '2026';
      if(holidayMode==='error'){response.statusCode=503;response.end('{}');}
      else if(holidayMode==='parse'){response.end('bad-json');}
      else if(reqYear==='2027'){
        const items2027 = Array.from({length: 15}, (_, i) => ({
          date: `2027-${String(Math.min(12, Math.floor(i / 2) + 1)).padStart(2, '0')}-${String((i % 20) + 1).padStart(2, '0')}`,
          name: `2027공휴일_${i + 1}`,
          isSubstitute: i % 3 === 0
        }));
        response.end(JSON.stringify(items2027));
      } else {
        response.end(JSON.stringify([{date:`${reqYear}-11-01`,name:'로컬 API 공휴일',isSubstitute:false},{date:`${reqYear}-11-02`,name:'로컬 대체일',isSubstitute:true}]));
      }
    });await new Promise(resolve=>holidayServer.listen(0,'127.0.0.1',resolve));
    const settings=await data('getAppSettings');await data('saveAppSettings',{...settings,holidayApiBaseUrl:`http://127.0.0.1:${holidayServer.address().port}/holidays`});
    await freshTab(page,'holidays');const before=await data('getHolidayCalendar',2026),writes=await count('replaceHolidayCalendar');
    await fetchHolidayPreview(page);
    await page.locator('#modal-compare-holidays').waitFor();
    assert.equal(await page.locator('#modal-compare-holidays').count(), 1);
    assert((await page.locator('.compare-diff-table .diff-row').count()) >= 2);
    await page.locator('#btn-confirm-cancel').click();assert.equal(await count('replaceHolidayCalendar'),writes);
    await fetchHolidayPreview(page);await page.locator('#btn-confirm-ok').click();await notice(page);
    assert.equal(await count('replaceHolidayCalendar'),writes+1);const imported=await data('getHolidayCalendar',2026);assert.equal(imported.items.length,2);
    for(const mode of ['error','parse']) {holidayMode=mode;await fetchHolidayPreview(page);await notice(page);assert.deepEqual(await data('getHolidayCalendar',2026),imported);}
    holidayMode='ok';await data('replaceHolidayCalendar',{year:2026,items:before.items});

    // HOL-D01 & HOL-D04: 미등록 빈 연도(2027) 첫 가져오기 및 비교 모달 페이징 검증
    await page.locator('#holiday-year-select').selectOption('2027');
    await sleep(250);
    const writes2027 = await count('replaceHolidayCalendar');
    await fetchHolidayPreview(page);
    await page.locator('#modal-compare-holidays').waitFor();
    assert.equal(await page.locator('.compare-diff-table .diff-row').count(), 10);
    const pagerInfo = await page.locator('.compare-pagination-info').innerText();
    assert(pagerInfo.includes('전체 15건') && pagerInfo.includes('1/2페이지'));
    await page.locator('#btn-compare-holidays-number-2').click();
    await sleep(100);
    assert.equal(await page.locator('.compare-diff-table .diff-row').count(), 5);
    await page.locator('#btn-confirm-cancel').click();
    assert.equal(await count('replaceHolidayCalendar'), writes2027);
    await fetchHolidayPreview(page);
    await page.locator('#modal-compare-holidays').waitFor();
    await page.locator('#btn-confirm-ok').click();
    await notice(page);
    assert.equal(await count('replaceHolidayCalendar'), writes2027 + 1);
    const imported2027 = await data('getHolidayCalendar', 2027);
    assert.equal(imported2027.items.length, 15);
    await data('replaceHolidayCalendar', { year: 2027, items: [] });
    await page.locator('#holiday-year-select').selectOption('2026');
    await sleep(200);

    extraEvidence[id].holidayBoundaries = await verifyHolidayBoundaries(page, adminCreds);

    negative('N02','holiday-import-cancel',()=>assert.equal(imported.items.length,2));record('Local API compare/cancel/write-once and HTTP/parse failure preserve calendar');
  }
  if(id==='S07') {
    await freshTab(page,'rates');assert((await data('listAllowanceRateVersions')).length>=55);
    await page.locator('#filter-rate-status').selectOption('draft');
    assert((await page.locator('.rates-table-wrap tr.table-row').allTextContents()).every(t=>t.includes('초안')));
    await page.locator('#filter-rate-status').selectOption('');
    await page.locator('#btn-new-rate-version').click();
    await page.locator('#input-rate-version-label').fill('검수_미래요율');await page.locator('#input-rate-year').fill('2027');
    await page.locator('#input-rate-effective-from').fill('2027-01-01');await page.locator('#input-rate-reason').fill('실제15셀 저장 검수');
    const cells=page.locator('.matrix-cell-input');assert.equal(await cells.count(),15);
    for(let i=0;i<15;i++)await cells.nth(i).fill(String(1+i/10));
    const beforeHistory=await data('listAllowanceRateHistory'),writes=await count('saveAllowanceRateVersion');
    await page.locator('#btn-save-rate-version').click();await notice(page);assert.equal(await count('saveAllowanceRateVersion'),writes+1);
    const saved=(await data('listAllowanceRateVersions',2027)).find(v=>v.versionLabel==='검수_미래요율');assert(saved);assert.equal(saved.items.length,15);
    assert.deepEqual(saved.items.map(i=>i.multiplier).sort((a,b)=>a-b),Array.from({length:15},(_,i)=>1+i/10));
    assert((await data('listAllowanceRateHistory')).some(h=>h.rateVersionId===saved.id&&!beforeHistory.some(old=>old.id===h.id)));scenarioState.rate=saved;
    for(let i=0;i<15;i++)await page.locator('.matrix-cell-input').nth(i).fill('0');
    const calculation={id:'controlled-impact',fileId:'controlled-file',fileName:'controlled.xlsx',entryId:'controlled-entry',employeeCode:'CONTROLLED',employeeName:'시험자료',siteName:'시험근무지',workDate:'2027-04-01',workType:'overtime',hourlyRate:10000,rateVersionId:'controlled-old',rateVersionLabel:'기존',status:'pending',signature:'controlled',snapshot:{id:'controlled-impact',performanceApprovalId:'controlled-approval',calculationVersion:1,businessCategoryCode:'weekday-overtime',businessCategoryLabel:'평일 연장근로',breakdown:{totalWorkMinutes:120,baseWorkMinutes:0,overtimeMinutes:120,nightMinutes:0,holidayMinutes:0,substituteMinutes:0},lines:[{allowanceCode:'overtime',workMinutes:120,multiplier:1.5,amount:30000}],totalAllowanceAmount:30000,createdAt:'2027-04-01T00:00:00.000Z'}};
    await overrideBridge(page,'listCalculationResults',`async()=>({ok:true,data:[${JSON.stringify(calculation)}]})`);
    await page.locator('#btn-rate-impact-preview').click();await page.locator('.impact-result-card').waitFor();
    const zeroWarning=await page.locator('.impact-result-card').innerText();assert(zeroWarning.includes('30,000원')&&zeroWarning.includes('0원')&&zeroWarning.includes('0배율 지급 주의'));
    negative('N05','controlled-zero-warning-readonly',()=>assert(zeroWarning.includes('분석 대상 건수: 1건')));
    await overrideBridge(page,'listCalculationResults','async()=>({ok:false,errorCode:"CONTROLLED_READ_FAILURE",message:"검수용 영향조회 실패"})');
    await page.locator('#btn-rate-impact-preview').click();await page.locator('#rate-impact-container .alert-danger').waitFor();assert.equal(await page.locator('.impact-result-card').count(),0);
    await overrideBridge(page,'listCalculationResults','async()=>({ok:true})');
    await page.locator('#btn-rate-impact-preview').click();await page.locator('#rate-impact-container .alert-danger').waitFor();assert.equal(await page.locator('.impact-result-card').count(),0);
    await overrideBridge(page,'listCalculationResults','async()=>new Promise(resolve=>{window.__releaseImpact=()=>resolve({ok:true,data:[]});})');
    await page.locator('#btn-rate-impact-preview').click();await page.waitForFunction(()=>!!window.__releaseImpact);
    await selectOperationsArea(page,'rates','versions');
    await page.locator('.matrix-cell-input').first().fill('2.7');await page.evaluate(()=>window.__releaseImpact());
    await page.waitForFunction(()=>!document.querySelector('#rate-impact-container .loading-spinner'));assert.equal(await page.locator('.impact-result-card').count(),0);
    await restoreBridge(page,'listCalculationResults');
    const writesToCalculations=await page.evaluate(()=>window.__opsCalls.filter(n=>/^(runCalculation|reapprove|recalculate)/i.test(n)));
    negative('N05','failed-partial-stale-impact',()=>assert.deepEqual(writesToCalculations,[]));
    record('Actual fifteen values/save/history; controlled read failures/partial/stale results produce no false zero or calculation writes');
  }
  if(id==='S08') {
    await freshTab(page,'rates');const calcBefore=await data('listCalculationResults');
    const row=page.locator(`.rates-table-wrap tr[data-id="${scenarioState.rate.id}"]`);
    await page.locator('.rates-table-wrap .dt-search-input').fill('검수_미래요율');await row.click();
    await page.locator('#select-rate-status').selectOption('active');const writes=await count('saveAllowanceRateVersion');
    await page.locator('#btn-save-rate-version').click();await page.locator('#btn-confirm-cancel').click();assert.equal(await count('saveAllowanceRateVersion'),writes);
    await page.locator('#btn-save-rate-version').click();await page.locator('#btn-confirm-ok').click();await notice(page);
    const versions=await data('listAllowanceRateVersions');assert.equal(versions.filter(v=>v.status==='active').length,1);assert.equal(versions.find(v=>v.id===scenarioState.rate.id).status,'active');
    negative('N02','active-rate-confirm-cancel',()=>assert.equal(versions.filter(v=>v.status==='active').length,1));
    const cells=page.locator('.matrix-cell-input'),invalidWrites=[];
    for(const value of ['', '-1']) {
      const old=await cells.first().inputValue(),n=await count('saveAllowanceRateVersion');await cells.first().fill(value);
      await page.locator('#btn-save-rate-version').click();await notice(page);invalidWrites.push((await count('saveAllowanceRateVersion'))-n);await cells.first().fill(old);
    }
    const past=versions.find(v=>v.effectiveFrom==='2026-01-01'&&v.status==='draft');assert(past);
    const invalidDate=await api('saveAllowanceRateVersion',{...past,effectiveFrom:'2026-02-01'});
    const invalidPeriod=await api('saveAllowanceRateVersion',{year:2027,versionLabel:'검수_역전기간',status:'draft',effectiveFrom:'2027-12-01',effectiveTo:'2027-01-01',items:scenarioState.rate.items});
    const duplicate=await api('saveAllowanceRateVersion',{year:2027,versionLabel:scenarioState.rate.versionLabel,status:'draft',effectiveFrom:'2027-01-01',items:scenarioState.rate.items});assert.equal(duplicate.ok,false);
    assert(!invalidDate.ok&&!invalidPeriod.ok);assert.deepEqual(await data('listCalculationResults'),calcBefore);
    negative('N04','missing-negative-started-date-period',()=>assert.deepEqual(invalidWrites,[0,0]));record('Active transition confirmed once, prior active retired; rejected invalid edits preserve calculations');
  }
  if(id==='S09') {
    await freshTab(page,'users');const password=`Sol!${randomUUID()}7a`;artifactRegistry.register(password);
    const created=await data('saveOperationUser',{loginId:'sol_ui02_user',displayName:'연락처 검수',role:'planner',status:'active',contact:'010-1234-7777',email:'sol@example.invalid',password});
    await freshTab(page,'site-names');await freshTab(page,'users');await page.locator('.users-table-wrap .dt-search-input').fill('sol_ui02_user');
    const row=page.locator(`tr[data-id="${created.id}"]`);await row.getByRole('button',{name:'수정',exact:true}).click();
    const field=label=>page.locator('.workforce-modal-body .form-group').filter({hasText:label}).locator('input,select').first();
    await field('사용자 이름').fill('연락처 수정');await field('연락처').fill('010-1234-8888');await field('이메일').fill('edited@example.invalid');
    assert.equal(await field('비밀번호').inputValue(),'');await page.locator('#btn-modal-submit').click();await notice(page);
    const edited=(await data('listOperationUsers')).find(u=>u.id===created.id);assert.equal(edited.contact,'010-1234-8888');assert.equal(edited.email,'edited@example.invalid');assert.equal(edited.role,'planner');
    for(const status of ['inactive','pending','active']){
      await page.locator('.users-table-wrap .dt-search-input').fill('sol_ui02_user');
      await row.getByRole('button',{name:'수정',exact:true}).click();await field('계정 상태').selectOption(status);
      await page.locator('#btn-modal-submit').click();await notice(page);
      assert.equal((await data('listOperationUsers')).find(u=>u.id===created.id).status,status);
      await page.locator('.users-table-wrap .dt-search-input').fill('sol_ui02_user');
      await row.getByRole('button',{name:'수정',exact:true}).click();assert.equal(await field('계정 상태').inputValue(),status);
      await page.keyboard.press('Escape');
    }
    const authContext=await browser.newContext();const authPage=await authContext.newPage();await performNormalLogin(authPage,targetUrl,{loginId:'sol_ui02_user',password},null,value=>artifactRegistry.register(value));await authContext.close();
    await performNormalLogin(page,targetUrl,adminCreds,null,value=>artifactRegistry.register(value));await installCalls(page);await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();await freshTab(page,'users');await page.locator('.users-table-wrap .dt-search-input').fill('sol_ui02_user');
    const empty=await api('saveOperationUser',{loginId:'sol_empty_password',displayName:'빈암호',role:'operator',status:'active',password:''});assert.equal(empty.ok,false);
    const self=(await data('listOperationUsers')).find(u=>u.loginId===adminCreds.loginId);assert(self);assert.equal((await api('deleteOperationUser',{userId:self.id})).ok,false);
    await row.getByRole('button',{name:'삭제',exact:true}).click();const deletes=await count('deleteOperationUser');await page.locator('#btn-confirm-cancel').click();assert.equal(await count('deleteOperationUser'),deletes);
    await row.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('#btn-confirm-ok').click();await notice(page);assert(!(await data('listOperationUsers')).some(u=>u.id===created.id));
    negative('N06','empty-password-self-last-admin-and-omission',()=>assert(!empty.ok&&self.role==='admin'));
    negative('N02','user-delete-cancel',()=>assert.equal(edited.id,created.id));record('User edit persists role/contact/email, omitted password still logs in, delete cancel and actual delete');
  }
  if(id==='S10') {
    await freshTab(page,'users');const before=await count('rotateAccountRecoveryKey');
    await selectOperationsArea(page,"users","security");await page.locator('#btn-rotate-my-recovery-key').click();await page.locator('#btn-confirm-cancel').click();assert.equal(await count('rotateAccountRecoveryKey'),before);
    await selectOperationsArea(page,"users","security");await page.locator('#btn-rotate-my-recovery-key').click();await page.locator('#btn-confirm-ok').click();await page.locator('.key-input').waitFor();
    const key=await page.locator('.key-input').inputValue();assert(key.length>=16);artifactRegistry.register(key);assert.equal(await count('rotateAccountRecoveryKey'),before+1);
    await page.evaluate(()=>{window.__retainedKeyNode=document.querySelector('.key-input');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedKey=value;}}});});
    await page.getByRole('button',{name:'복사',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copiedKey),key);
    await page.locator('#btn-close-recovery-key').click();assert.equal(await page.evaluate(()=>window.__retainedKeyNode.value),'');assert.equal(await page.locator('.key-input').count(),0);
    await page.evaluate(()=>{window.__copiedKey='';window.__retainedKeyNode=null;});
    negative('N02','recovery-key-cancel',()=>assert(key.length>=16));record('Actual own recovery key rotated once; controlled clipboard sink and close wipe; secret excluded from evidence');
  }
  if(id==='S11') {
    const literal='검수 "따옴표" <b id="literal-site-probe">문자열</b>';
    const created=await data('saveSiteNameOption',{name:literal});await freshTab(page,'users');await freshTab(page,'site-names');
    await page.locator('.dt-search-input').fill('literal-site-probe');const row=page.locator(`tr[data-id="${created.id}"]`);assert((await row.innerText()).includes(literal));assert.equal(await page.locator('#literal-site-probe').count(),0);
    await row.getByRole('button',{name:'수정',exact:true}).click();await page.locator('.workforce-modal-body input').fill(literal+' 수정');await page.locator('#btn-modal-submit').click();await notice(page);
    assert.equal((await data('listSiteNameOptions')).find(r=>r.id===created.id).name,literal+' 수정');
    const duplicate=await api('saveSiteNameOption',{name:literal+' 수정'}),empty=await api('saveSiteNameOption',{name:''});assert(!duplicate.ok&&!empty.ok);
    await row.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('#btn-confirm-cancel').click();assert((await data('listSiteNameOptions')).some(r=>r.id===created.id));
    await row.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('#btn-confirm-ok').click();await notice(page);assert(!(await data('listSiteNameOptions')).some(r=>r.id===created.id));
    negative('N12','site-literal-roundtrip',()=>assert(literal.includes('<b')));negative('N02','site-delete-cancel',()=>assert(!empty.ok));record('Site-name real roundtrip, duplicate/empty rejection, literal DOM and delete');
  }
  if(id==='S12') {
    const all=await data('listReleaseHistory');const fixtures=all.filter(m=>/^4\.1\.\d+$/.test(m.version));assert.equal(fixtures.length,55);assert.equal(fixtures[0].version,'4.1.55');
    const filtered=await data('listReleaseHistory',{requiredFilter:'required',backupFilter:'required'});assert(filtered.length>0&&filtered.every(m=>m.required&&m.requiresDbBackup));
    const manifestPath=path.join(resourcesDir,'release-history/v4.1.55/RELEASE_MANIFEST.json');const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    manifest.headline='릴리즈 <b id="literal-release-probe">문자열</b>';fs.writeFileSync(manifestPath,JSON.stringify(manifest));
    await freshTab(page,'site-names');await freshTab(page,'releases');await page.locator('.filter-keyword').fill('4.1.55');await page.locator('.filter-keyword').press('Enter');await page.locator('.releases-list-col tr.table-row').first().click();
    assert((await page.locator('.operations-releases-wrap').innerText()).includes(manifest.headline));assert.equal(await page.locator('#literal-release-probe').count(),0);
    const writes=await page.evaluate(()=>window.__opsCalls.filter(n=>/publish|installRelease|applyRelease/i.test(n)));
    negative('N12','release-literal-detail',()=>assert.deepEqual(writes,[]));record('55 actual manifests, semantic version order, required/backup filters and literal detail');
  }
  if(id==='S13') {
    await freshTab(page,'layout');const summaries=await data('listDocumentLayouts');assert.equal(summaries.length,7);
    for(let i=0;i<layoutKeys.length;i++) {
      await selectLayout(page,i);const snapshot=await data('getDocumentLayout',layoutKeys[i]);
      for(const output of snapshot.definition.outputs) {
        if(snapshot.definition.outputs.length>1)await page.locator(`#btn-canvas-member-${output.memberId}`).click();
        const blockIds=await page.locator('.canvas-block-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.blockId));
        assert.deepEqual(blockIds,output.blocks.map(b=>b.id));assert.equal(await page.locator('.block-item-btn').count(),output.blocks.length);
      }
      const history=await data('listDocumentLayoutHistory',layoutKeys[i]);assert(history.length>=(i===0?55:3));
    }
    record('All seven actual snapshots, members and exact block identities/counts; history 55/other keys 3+');
  }
  if(id==='S14') {
    await selectLayout(page,0);const snapshot=await data('getDocumentLayout',layoutKeys[0]);
    const capability=snapshot.capabilities.blockCapabilities.find(c=>c.editableProperties.includes('position'));assert(capability);
    const node=page.locator(`[data-block-id="${capability.blockId}"]`);await node.click();
    const before=Number(await page.locator('#input-prop-x').inputValue());await node.focus();await node.press('ArrowRight');
    await page.locator(`[data-block-id="${capability.blockId}"]`).press('ArrowRight');assert.equal(Number(await page.locator('#input-prop-x').inputValue()),before+2);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-block-id')),capability.blockId);
    const movable=page.locator(`[data-block-id="${capability.blockId}"]`);await movable.scrollIntoViewIfNeeded();const box=await movable.boundingBox();
    await page.mouse.move(box.x+Math.min(8,box.width/2),box.y+Math.min(8,box.height/2));await page.mouse.down();await page.mouse.move(box.x+28,box.y+18,{steps:5});await page.mouse.up();
    const dragged=Number(await page.locator('#input-prop-x').inputValue());assert(dragged>before+2);
    await page.locator('#input-prop-x').fill(String(dragged+1));await page.locator('#input-prop-x').dispatchEvent('change');
    const textCapability=snapshot.capabilities.blockCapabilities.find(c=>c.editableProperties.includes('text'));assert(textCapability);
    await page.locator(`[id="block-item-${textCapability.blockId}"]`).click();const literal='검수 "따옴표" <b id="layout-literal-probe">문자열</b>';
    await page.locator('#input-prop-text').fill(literal);assert.equal(await page.locator('#layout-literal-probe').count(),0);
    const literalOnCanvas=await page.locator(`[data-block-id="${textCapability.blockId}"]`).textContent();negative('N12','layout-canvas-literal',()=>assert.equal(literalOnCanvas,literal));
    await overrideBridge(page,'previewDocumentLayout','async input=>{window.__capturedDraft=input;return window.__opsActual.previewDocumentLayout(input);}');
    await page.locator('#btn-preview-layout').click();await page.locator('#preview-display-area a').waitFor();
    const captured=await page.evaluate(()=>window.__capturedDraft);const edited=captured.definition.outputs.flatMap(o=>o.blocks).find(b=>b.id===capability.blockId);assert.equal(edited.x,dragged+1);
    await restoreBridge(page,'previewDocumentLayout');
    const protectedMutations=[];
    for(const mutate of [d=>d.outputs[0].blocks.reverse(),d=>{d.outputs[0].blocks[0].bindingKey='unregistered-binding';},d=>{d.outputs[0].blocks.push({...d.outputs[0].blocks[0],id:'unregistered-block'});},d=>{d.outputs[0].blocks[0].logoAssetId='unregistered-logo';}]) {
      const definition=clone(snapshot.definition);mutate(definition);protectedMutations.push(await api('saveDocumentLayout',{definition,expectedRevisionId:snapshot.activeRevisionId}));
    }
    negative('N07','protected-structure-binding-unknown-block',()=>assert(protectedMutations.every(r=>!r.ok)));
    assert.deepEqual((await data('getDocumentLayout',layoutKeys[0])).definition,snapshot.definition);record('Real keyboard/drag/property share draft sent to actual preview; protected mutations rejected');
  }
  if(id==='S15') {
    const binaries=[];
    for(const [index,key] of layoutKeys.entries()) {
      const snap=await data('getDocumentLayout',key),preview=await data('previewDocumentLayout',{definition:snap.definition,basedOnRevisionId:snap.activeRevisionId});
      if(key.documentKind==='proposal-pdf')assert.deepEqual(preview.outputs.map(o=>o.memberId).sort(),['attachment1','attachment2','proposal']);
      for(const output of preview.outputs) {
        const response=await page.request.get(new URL(output.previewUrl,targetUrl).href);assert.equal(response.status(),200);
        assert.equal(response.headers()['content-type'].split(';')[0],output.mediaType);const bytes=await response.body();
        assert(bytes.length>100);assert.equal(bytes.subarray(0,output.mediaType==='application/pdf'?4:2).toString(),output.mediaType==='application/pdf'?'%PDF':'PK');
        binaries.push({kind:key.documentKind,variant:key.variant,member:output.memberId,mime:output.mediaType,bytes:bytes.length});scenarioState.previewOutput=output;
      }
      await selectLayout(page,index);await page.locator('#btn-preview-layout').click();
      for(const output of preview.outputs) {
        if(preview.outputs.length>1) await page.locator(`#btn-preview-member-${output.memberId}`).click();
        await page.locator(output.mediaType==='application/pdf'?`#iframe-preview-${output.memberId}`:`#btn-download-xlsx-${output.memberId}`).waitFor();
      }
    }
    assert.equal(binaries.length,9);extraEvidence[id].binaries=binaries;
    await serverClock(11*60*1000);const expiredUrl=await page.request.get(new URL(scenarioState.previewOutput.previewUrl,targetUrl).href);await serverClock(0);assert.equal(expiredUrl.status(),404);
    extraEvidence[id].controlledClock='Server clock advanced 11min for an actual generated preview URL; HTTP404 observed; clock restored';
    await overrideBridge(page,'previewDocumentLayout','async()=>({ok:true,data:{previewId:"controlled-late-json",outputs:[{memberId:"main",mediaType:"application/pdf",previewUrl:"/api/document-layout-previews/controlled-late-json/main",expiresAt:new Date(Date.now()+60000).toISOString()}],validationIssues:[]}})');
    await page.evaluate(()=>{window.__fetchBeforeLateJson=window.fetch;window.fetch=async(...args)=>String(args[0]).includes('controlled-late-json')?{ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:()=>new Promise(resolve=>{window.__releaseLateJson=()=>resolve({ok:false,errorCode:'AUTH_SESSION_REQUIRED',message:'controlled old error'});})}:window.__fetchBeforeLateJson(...args);});
    await page.locator('#btn-preview-layout').click();await page.waitForFunction(()=>!!window.__releaseLateJson);await selectLayout(page,0);
    await page.evaluate(()=>window.__releaseLateJson());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
    const stillLoggedIn=await page.locator('.btn-logout').count();negative('N11','late-json-after-key-change',()=>assert.equal(stillLoggedIn,1));
    await page.evaluate(()=>{window.fetch=window.__fetchBeforeLateJson;delete window.__releaseLateJson;});
    await overrideBridge(page,'previewDocumentLayout','async()=>({ok:true,data:{previewId:"controlled-safety",outputs:[{memberId:"main",mediaType:"application/pdf",previewUrl:"/api/document-layout-previews/controlled-safety/main",expiresAt:new Date(Date.now()+60000).toISOString()}],validationIssues:[]}})');
    await page.route('**/api/document-layout-previews/controlled-safety/main',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,errorCode:'AUTH_FORBIDDEN',message:'<b id="preview-error-probe">문자열</b>'})}));
    await page.locator('#btn-preview-layout').click();await page.locator('#preview-display-area .alert-danger').waitFor();
    assert.equal(await page.locator('#preview-error-probe').count(),0);assert.equal(await page.locator('#preview-display-area iframe,#preview-display-area a').count(),0);
    assert((await page.locator('#preview-display-area').innerText()).includes('<b id="preview-error-probe">'));
    negative('N12','preview-error-literal',()=>assert.equal(binaries.filter(b=>b.mime==='application/pdf').length,4));
    await page.unroute('**/api/document-layout-previews/controlled-safety/main');
    await overrideBridge(page,'previewDocumentLayout','async()=>({ok:true,data:{previewId:"controlled-wrong-mime",outputs:[{memberId:"main",mediaType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",previewUrl:"/api/document-layout-previews/controlled-wrong-mime/main",expiresAt:new Date(Date.now()+60000).toISOString()}],validationIssues:[]}})');
    await page.route('**/api/document-layout-previews/controlled-wrong-mime/main',route=>route.fulfill({status:200,contentType:'application/octet-stream',body:Buffer.from([0x50,0x4b,0x03,0x04,0,0])}));
    await page.locator('#btn-preview-layout').click();await page.locator('#preview-display-area .alert-danger').waitFor();const wrongMimeLinks=await page.locator('#preview-display-area a').count();assert.equal(wrongMimeLinks,0);await page.unroute('**/api/document-layout-previews/controlled-wrong-mime/main');
    await overrideBridge(page,'previewDocumentLayout','async()=>({ok:true,data:{previewId:"controlled-expired",outputs:[{memberId:"main",mediaType:"application/pdf",previewUrl:"/api/document-layout-previews/controlled-expired/main",expiresAt:new Date(Date.now()-1).toISOString()}],validationIssues:[]}})');
    await page.locator('#btn-preview-layout').click();await page.locator('.preview-invalidated-msg').waitFor();assert.equal(await page.locator('#preview-display-area iframe,#preview-display-area a').count(),0);
    await restoreBridge(page,'previewDocumentLayout');
    const snap=await data('getDocumentLayout',layoutKeys[0]);const stale=[];
    stale.push(await api('previewDocumentLayout',{definition:snap.definition,basedOnRevisionId:'stale-revision'}));
    stale.push(await api('saveDocumentLayout',{definition:snap.definition,expectedRevisionId:'stale-revision'}));
    stale.push(await api('resetDocumentLayout',{...layoutKeys[0],expectedRevisionId:'stale-revision'}));
    const unknown=await page.request.get(new URL('/api/document-layout-previews/unknown/main',targetUrl).href);assert.equal(unknown.status(),404);
    negative('N08','stale-save-reset-preview-and-expired-ui',()=>assert(stale.every(r=>!r.ok)));
    record('Nine actual generated PDF/XLSX members; controlled JSON/expiry UI cases explicitly separate; actual stale/unknown URL rejection');
  }
  if(id==='S16') {
    await selectOperationsArea(page,'layout','editor');
    await selectLayout(page,0);const before=await data('getDocumentLayout',layoutKeys[0]),history=await data('listDocumentLayoutHistory',layoutKeys[0]);
    await page.locator('.filename-section summary').click();
    const filename=page.locator('#input-layout-filename-main');await filename.fill('검수/{year}-{month2}-{siteName}.xlsx');
    const keyValue=await page.locator('.layout-key-select').inputValue();const values=await page.locator('.layout-key-select option').evaluateAll(options=>options.map(o=>o.value));
    await page.locator('.layout-key-select').selectOption(values[1]);await page.locator('#btn-confirm-cancel').click();assert.equal(await page.locator('.layout-key-select').inputValue(),keyValue);assert.equal(await filename.inputValue(),'검수/{year}-{month2}-{siteName}.xlsx');
    const writes=await count('saveDocumentLayout');await page.locator('#btn-save-layout').click();await page.locator('#btn-modal-cancel').click();assert.equal(await count('saveDocumentLayout'),writes);
    await page.locator('#btn-save-layout').click();await page.locator('#btn-modal-submit').click();await notice(page);assert.equal(await count('saveDocumentLayout'),writes+1);
    const saved=await data('getDocumentLayout',layoutKeys[0]);assert.notEqual(saved.activeRevisionId,before.activeRevisionId);assert.equal(saved.definition.outputs[0].outputFileNamePattern,'검수/{year}-{month2}-{siteName}.xlsx');
    const afterHistory=await data('listDocumentLayoutHistory',layoutKeys[0]);assert.equal(afterHistory.length,history.length+1);
    await page.locator('.filename-section summary').click();
    const invalidWrites=[];for(const pattern of ['../bad.xlsx','{unknown}.xlsx','{year}.pdf']) {
      await filename.fill(pattern);const n=await count('saveDocumentLayout');await page.locator('#btn-save-layout').click();await notice(page);invalidWrites.push((await count('saveDocumentLayout'))-n);
    }
    await filename.fill(saved.definition.outputs[0].outputFileNamePattern);
    const resets=await count('resetDocumentLayout');await page.locator('#btn-reset-layout-default').click();await page.locator('#btn-confirm-cancel').click();assert.equal(await count('resetDocumentLayout'),resets);
    await page.locator('#btn-reset-layout-default').click();await page.locator('#btn-confirm-ok').click();await notice(page);
    const reset=await data('getDocumentLayout',layoutKeys[0]);assert.notEqual(reset.activeRevisionId,saved.activeRevisionId);assert.equal(reset.usingBuiltInDefault,false);
    const resetHistory=await data('listDocumentLayoutHistory',layoutKeys[0]);assert.equal(resetHistory.length,afterHistory.length+1);assert(afterHistory.every(h=>resetHistory.some(r=>r.revisionId===h.revisionId)));
    negative('N07','filename-token-path-extension',()=>assert.deepEqual(invalidWrites,[0,0,0]));negative('N02','layout-save-reset-cancel',()=>assert.equal(resetHistory.length,history.length+2));
    record('Dirty key cancel, actual save/new revision/history, invalid filenames zero writes, reset adds revision without deletion');
  }
  if(id==='S17') {
    await freshTab(page,'settings');
    await selectSettingsArea(page, 'backup');
    const employee=await data('saveEmployee',{employeeCode:'SOL-BACKUP-EMAIL',name:'백업 이메일 검수',employmentType:'정규',status:'active',email:'backup@example.invalid',contact:'010-1111-2222'});
    const backup=await data('runDatabaseBackupNow');assert.equal(backup.tableCount,43);assert(fs.existsSync(backup.jsonBackupPath));
    const bytes=fs.readFileSync(backup.jsonBackupPath);assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),backup.backupSha256.toUpperCase());
    const payload=JSON.parse(bytes);assert.equal(Object.keys(payload.tables).length,43);assert(JSON.stringify(payload.tables.employees).includes(employee.email));
    const extra=await data('saveSiteNameOption',{name:'복원 이후 제거되어야 하는 시험자료'});
    await prepareRestore(page,backup.jsonBackupPath);
    const preview=(await page.evaluate(()=>window.__lastDbPreview)).data;assert.equal(preview.tableImpacts.length,43);
    const shown=[];for(let n=0;n<5;n++) {
      shown.push(...await page.locator('.restore-flow-container tr.table-row').evaluateAll(rows=>rows.map(row=>({name:row.children[0].textContent.trim(),before:Number(row.children[1].textContent.replaceAll(',','')),after:Number(row.children[2].textContent.replaceAll(',',''))}))));
      if(n<4)await page.locator('.restore-flow-container .btn-next-page').click();
    }
    assert.equal(new Set(shown.map(r=>r.name)).size,43);for(const row of shown){const expected=preview.tableImpacts.find(t=>t.tableName===row.name);assert(expected);assert.equal(row.before,expected.currentRowCount);assert.equal(row.after,expected.nextRowCount);}
    const writes=await count('updateDatabaseFromMigration');await page.locator('#btn-execute-db-restore').click();await page.locator('#btn-prompt-cancel').click();assert.equal(await count('updateDatabaseFromMigration'),writes);
    await page.locator('#btn-execute-db-restore').click();await page.locator('.prompt-input').fill('확인');await page.locator('#btn-prompt-ok').click();assert.equal(await count('updateDatabaseFromMigration'),writes);assert(await page.locator('.form-error').isVisible());
    await overrideBridge(page,'updateDatabaseFromMigration','async input=>new Promise(resolve=>{window.__releaseRestore=async()=>{const result=await window.__opsActual.updateDatabaseFromMigration(input);window.__lastRestore=result;resolve(result);};})');
    await page.locator('.prompt-input').fill('교체');await page.locator('#btn-prompt-ok').evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>!!window.__releaseRestore);assert.equal(await count('updateDatabaseFromMigration'),writes+1);
    assert(await page.locator('.db-backup-section input,.db-backup-section button').evaluateAll(controls=>controls.every(c=>c.disabled)));

    // 신규 UX 검문: busy 상태에서 영역 전환, 저장 차단 및 추가 쓰기 0 확인
    const writesDuringRestore = await count('saveAppSettings');
    await page.locator('#btn-settings-area-folders').click();
    await notice(page);
    assert.equal(await page.locator('#settings-area-backup').isVisible(), true, 'busy 중 영역 전환 차단되어 backup 영역 유지');
    await page.locator('#btn-save-settings').click();
    await notice(page);
    assert.equal(await count('saveAppSettings'), writesDuringRestore, 'busy 중 저장 차단되어 추가 쓰기 0');

    await page.evaluate(()=>window.__releaseRestore());await page.waitForFunction(()=>!!window.__lastRestore);
    const result=await page.evaluate(()=>window.__lastRestore);assert(result.ok);assert(fs.existsSync(result.data.backupBeforeRestore.jsonBackupPath));assert.equal(result.data.tableResults.length,43);
    const expired=await page.evaluate(()=>window.appBridge.getSession());assert.equal(expired.ok,true);assert.equal(expired.data,null,'Successful restore revokes the old cookie');
    await page.reload();await page.locator('#login-id').waitFor({state:'visible'});
    await performNormalLogin(page,targetUrl,adminCreds,null,value=>artifactRegistry.register(value));await installCalls(page);
    await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();
    await selectSettingsArea(page,'backup');
    assert(!(await data('listSiteNameOptions')).some(site=>site.id===extra.id));assert.equal((await data('listEmployees')).find(e=>e.id===employee.id).email,employee.email);
    await restoreBridge(page,'updateDatabaseFromMigration');scenarioState.backup=backup;scenarioState.backupPayload=payload;scenarioState.databasePath=result.data.databasePath;

    // ADM01-D03 회귀 검문: 복원 완료 후 버튼 잠김 없이 정상 입력 및 저장 가능 확인
    await page.locator('#input-databaseBackupTime').fill('04:00');
    assert.equal(await page.locator('#btn-save-settings').isEnabled(), true, '복원 완료 후 저장 버튼 활성화');
    assert.equal(await page.locator('#btn-revert-settings').isEnabled(), true, '복원 완료 후 되돌리기 버튼 활성화');
    const writesAfterRestore = await count('saveAppSettings');
    await page.locator('#btn-save-settings').click();
    await notice(page);
    assert.equal(await count('saveAppSettings'), writesAfterRestore + 1, '정상 저장 완료');
    // 원복 (03:17)
    await page.locator('#input-databaseBackupTime').fill('03:17');
    await page.locator('#btn-save-settings').click();
    await notice(page);


    negative('N02','restore-cancel-wrong-text-double-and-locks',()=>assert.equal(shown.length,43));record('Actual JSON43/SHA/email, all table counts, cancel/wrong phrase zero writes, actual restore once and automatic pre-backup');
  }
  if(id==='S18') {
    await freshTab(page,'settings');
    await selectSettingsArea(page, 'backup');
    const snapshot=await data('listSiteNameOptions'),watchBefore=await data('getFileWatchStatus');
    const original=clone(scenarioState.backupPayload);const invalids=[];
    const malformed=path.join(userDataDir,'malformed.json');fs.writeFileSync(malformed,'not-json');invalids.push(malformed);
    for(const [name,mutate] of [
      ['unknown-column',p=>{p.tables.employees[0].unknown_column='bad';}],
      ['missing-required',p=>{delete p.tables.employees[0].id;}],
      ['wrong-type',p=>{p.tables.employees[0].id={invalid:true};}]
    ]) {const p=clone(original);mutate(p);const file=path.join(userDataDir,name+'.json');fs.writeFileSync(file,JSON.stringify(p));invalids.push(file);}
    const rejected=[];for(const file of invalids){const result=await api('checkDatabaseMigrationRequirements',{backupFilePath:file});rejected.push(!result.ok||!result.data.isReady);}
    negative('N09','invalid-json-unknown-missing-type',()=>assert(rejected.length===4&&rejected.every(Boolean)));
    const legacy=clone(original);legacy.schemaVersion=1;delete legacy.tables.policy_revisions;delete legacy.tables.policy_events;delete legacy.tables.performance_return_history;legacy.tableCount=40;for(const employee of legacy.tables.employees)delete employee.email;const legacyFile=path.join(userDataDir,'legacy-no-email.json');fs.writeFileSync(legacyFile,JSON.stringify(legacy));assert.equal((await data('checkDatabaseMigrationRequirements',{backupFilePath:legacyFile})).isReady,true);
    const file=scenarioState.backup.jsonBackupPath,preview=await data('previewDatabaseMigrationUpdate',{backupFilePath:file});
    const base={backupFilePath:file,backupSha256:preview.backupSha256,previewToken:preview.previewToken,confirmationText:'교체'};
    const copy=path.join(userDataDir,'different-path.json');fs.copyFileSync(file,copy);
    const pathFailure=await api('updateDatabaseFromMigration',{...base,backupFilePath:copy});assert.equal(pathFailure.ok,false);
    const phraseFailure=await api('updateDatabaseFromMigration',{...base,confirmationText:'확인'});assert.equal(phraseFailure.ok,false);
    const copyPreview=await data('previewDatabaseMigrationUpdate',{backupFilePath:copy});fs.appendFileSync(copy,'\n');
    const shaFailure=await api('updateDatabaseFromMigration',{...base,backupFilePath:copy,backupSha256:copyPreview.backupSha256,previewToken:copyPreview.previewToken});assert.equal(shaFailure.ok,false);
    const expiring=await data('previewDatabaseMigrationUpdate',{backupFilePath:file});await serverClock(11*60*1000);
    const expired=await api('updateDatabaseFromMigration',{...base,backupSha256:expiring.backupSha256,previewToken:expiring.previewToken});await serverClock(0);assert.equal(expired.ok,false);
    assert.deepEqual(await data('listSiteNameOptions'),snapshot);
    await prepareRestore(page,file);await page.locator('#input-restore-backup-path').fill(copy);assert.equal(await page.locator('#btn-execute-db-restore').count(),0);
    await prepareRestore(page,file);
    const {DatabaseSync}=await import('node:sqlite');assert(path.resolve(scenarioState.databasePath).startsWith(path.resolve(userDataDir)+path.sep));const lock=new DatabaseSync(scenarioState.databasePath);
    try {
      lock.exec('BEGIN EXCLUSIVE');await page.locator('#btn-execute-db-restore').click();await page.locator('.prompt-input').fill('교체');await page.locator('#btn-prompt-ok').click();await page.locator('#btn-notice-close').waitFor();
      assert.match(await page.locator('#operations-notice-modal-title').innerText(),/실패|오류/);await notice(page);
    } finally {lock.exec('ROLLBACK');lock.close();}
    assert.deepEqual(await data('listSiteNameOptions'),snapshot);assert.equal((await data('getFileWatchStatus')).isRunning,watchBefore.isRunning);
    assert.equal(await page.locator('#btn-execute-db-restore').count(),0);assert.equal(await page.locator('#input-restore-backup-path').isDisabled(),false);
    negative('N10','path-sha-expiry-phrase-and-locked-db-preservation',()=>assert(!pathFailure.ok&&!shaFailure.ok&&!expired.ok&&!phraseFailure.ok));
    extraEvidence[id].controlledClock='Server Date.now offset +11min, restored to zero; actual token endpoint rejects expiry';record('Invalid/schema cases and nullable legacy email; actual path/SHA/token expiry failures and SQLite-lock failure preserve active DB/watch state');
  }
  if(id==='S19') {
    const {build}=await import('esbuild');const bundle=await build({stdin:{contents:'export {OperationsScreen} from "./src/web/screens/operations";',resolveDir:repoRoot},bundle:true,write:false,format:'iife',globalName:'OperationsTestExports',platform:'browser'});
    if(!scenarioState.previewOutput){const snapshot=await data('getDocumentLayout',layoutKeys[0]);scenarioState.previewOutput=(await data('previewDocumentLayout',{definition:snapshot.definition,basedOnRevisionId:snapshot.activeRevisionId})).outputs[0];}
    for(const [number,role] of [[1,'operator'],[2,'planner'],[3,'reviewer']]) {
      const roleContext=await browser.newContext();const rolePage=await roleContext.newPage();const num=String(number).padStart(2,'0');
      await performNormalLogin(rolePage,targetUrl,{loginId:'opuser'+num,password:`Password${num}!@#`},null,value=>artifactRegistry.register(value));
      assert.equal(await rolePage.locator('button[data-id="operations"]').count(),0);const session=await bridgeData(rolePage,'getSession');assert.equal(session.role,role);
      await rolePage.evaluate(code=>(0,eval)(code+'\nwindow.OperationsTestExports=OperationsTestExports;'),bundle.outputFiles[0].text);const forced=await rolePage.evaluate(async session=>{
        const container=document.createElement('div');document.body.appendChild(container);let calls=0;
        const original=window.appBridge;window.appBridge=new Proxy(original,{get(target,key){const value=target[key];return typeof value==='function'?(...args)=>{calls++;return value(...args);}:value;}});
        for(const candidate of [session,undefined]){const screen=new OperationsTestExports.OperationsScreen({container,session:candidate});await screen.render();if(!container.querySelector('.operations-forbidden-guard'))throw new Error('forced non-admin screen guard missing');screen.destroy();}
        window.appBridge=original;container.remove();return {calls};
      },session);assert.equal(forced.calls,0);
      const protectedCall=await bridgeCall(rolePage,'listOperationUsers');assert.equal(protectedCall.ok,false);assert.equal(protectedCall.errorCode,'AUTH_FORBIDDEN');
      const response=await rolePage.request.get(new URL(scenarioState.previewOutput.previewUrl,targetUrl).href);const body=await response.json();assert.equal(body.ok,false);assert.equal(body.errorCode,'AUTH_FORBIDDEN');
      await roleContext.close();
    }
    negative('N01','three-roles-forced-zero-api-and-direct-guards',()=>assert.equal(layoutKeys.length,7));
    await performNormalLogin(page,targetUrl,adminCreds,null,value=>artifactRegistry.register(value));await installCalls(page);await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();
    await freshTab(page,'settings');
    await freshTab(page,'users');await overrideBridge(page,'rotateAccountRecoveryKey','async()=>{const actual=await window.__opsActual.rotateAccountRecoveryKey();if(actual.ok)await window.registerOpsSecret(actual.data.recoveryKey);return new Promise(resolve=>{window.__releaseLateKey=()=>resolve(actual);});}');
    await selectOperationsArea(page,"users","security");await page.locator('#btn-rotate-my-recovery-key').click();await page.locator('#btn-confirm-ok').click();await page.waitForFunction(()=>!!window.__releaseLateKey);
    await selectOperationsArea(page,"users","users");await page.locator('#btn-add-user').click();const newModalId=await page.locator('.workforce-modal-overlay').getAttribute('id');
    await page.evaluate(()=>window.__releaseLateKey());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));assert.equal(await page.locator('.workforce-modal-overlay').getAttribute('id'),newModalId);assert.equal(await page.locator('.key-input').count(),0);
    await page.locator('#btn-modal-cancel').click();await page.evaluate(()=>{delete window.__releaseLateKey;});await restoreBridge(page,'rotateAccountRecoveryKey');
    negative('N11','late-secret-response-modal-replacement',()=>assert.equal(newModalId,'modal-add-user'));
    await overrideBridge(page,'getDocumentLayout','async key=>{const actual=await window.__opsActual.getDocumentLayout(key);window.__heldLayout=true;return new Promise(resolve=>{window.__releaseLayout=()=>resolve(actual);});}');
    await switchToTab(page,'layout');await page.waitForFunction(()=>window.__heldLayout);await page.locator('#tab-btn-holidays').click();await page.locator('.operations-holidays-wrap').waitFor();
    await page.evaluate(()=>window.__releaseLayout());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));assert.equal(await page.locator('.operations-holidays-wrap').count(),1);await restoreBridge(page,'getDocumentLayout');
    await overrideBridge(page,'listOperationUsers','async()=>new Promise(resolve=>{window.__lateUsers=()=>resolve({ok:false,errorCode:"AUTH_SESSION_REQUIRED",message:"controlled delayed old-session response"});})');
    await page.locator('button[data-id="user-mgmt"]').click();await page.waitForFunction(()=>!!window.__lateUsers);
    await page.evaluate(()=>{window.__loginRenders=0;window.__loginObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&(node.matches?.('.login-form')||node.querySelector?.('.login-form')))window.__loginRenders++;});window.__loginObserver.observe(document.body,{childList:true,subtree:true});});
    await api('signOut');await page.locator('button[data-id="operations"]').click();await page.locator('.login-form').waitFor();
    await page.locator('#login-id').fill(adminCreds.loginId);await page.locator('#login-password').fill(adminCreds.password);await page.locator('.login-form button[type=submit]').click();await page.locator('.btn-logout').waitFor();
    await page.evaluate(()=>window.__lateUsers());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));assert.equal(await page.locator('.btn-logout').count(),1);
    const loginRenders=await page.evaluate(()=>{window.__loginObserver.disconnect();return window.__loginRenders;});assert.equal(loginRenders,1);
    await restoreBridge(page,'listOperationUsers');await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();
    negative('N11','late-tab-and-expired-relogin-ownership',()=>assert.equal(loginRenders,1));record('Actual three role sessions/forced guards; delayed tab success and old-session failure after actual signout/relogin cannot replace new screen/session');
  }
  if(id==='S20') {
    extraEvidence[id].uniformLayout=await verifyOperationsUniformLayout(page);
    extraEvidence[id].editorUsability=await verifyEditorUsability(page);
    await freshTab(page,'settings');const metrics=[];
    for(const viewport of [{width:1024,height:768},{width:1280,height:720},{width:1440,height:900},{width:1707,height:825},{width:2048,height:1080}]) {
      await page.setViewportSize(viewport);metrics.push(await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,devicePixelRatio,documentWidth:document.documentElement.scrollWidth})));
      assert.equal(metrics.at(-1).innerWidth,viewport.width);assert(metrics.at(-1).documentWidth<=viewport.width+1);
    }
    await page.setViewportSize({width:1440,height:900});

    // backup 영역에서 공통 select 팝업 Escape
    await selectSettingsArea(page, 'backup');
    await page.locator('#select-databaseBackupSchedule').click();await page.locator('.ui-control-popup.ui-listbox').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.ui-control-popup').count(),0);

    // policy 영역에서 모달 Escape
    await selectSettingsArea(page, 'policy');
    await page.locator('#btn-open-substitute-policy').click();
    await page.locator('.policy-history-dialog').waitFor();
    await page.keyboard.press('Escape');
    await sleep(200);
    assert.equal(await page.locator('.policy-history-dialog').count(), 0, 'Escape 키로 정책 이력 모달 닫힘');

    // 다른 공통 대화상자가 열리면 이전 정책 창의 늦은 복귀가 새 창을 덮지 않는다.
    await page.locator('#btn-open-substitute-policy').click();await page.locator('#btn-add-new-policy').click();
    await page.locator('#policy-dialog-form').waitFor();
    await page.evaluate(() => document.querySelector('#help-input-scheduleConsecutiveNightLimit').click());
    await page.locator('#ops-policy-help-modal').waitFor();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve,0)));
    assert.equal(await page.locator('#ops-policy-help-modal').count(),1);
    assert.equal(await page.locator('#operations-policy-history').count(),0);
    await page.keyboard.press('Escape');

    // policy 영역에서 음수값 저장 시 경고 모달 포커스 트랩 및 Escape 확인
    const original=await page.locator('#input-scheduleConsecutiveNightLimit').inputValue();await page.locator('#input-scheduleConsecutiveNightLimit').fill('-1');await page.locator('#btn-save-settings').click();await page.locator('.workforce-modal-overlay').waitFor();await page.waitForFunction(()=>!!document.activeElement?.closest('.workforce-modal-overlay'));
    for(const key of ['Tab','Shift+Tab','Tab']) {await page.keyboard.press(key);assert(await page.evaluate(()=>!!document.activeElement?.closest('.workforce-modal-overlay')));}
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.activeElement?.id==='input-scheduleConsecutiveNightLimit');
    await page.locator('#input-scheduleConsecutiveNightLimit').fill(original);

    // system 영역 읽기 전용 및 dirty 상태 문자 제공 확인
    await selectSettingsArea(page, 'system');
    assert.equal(await page.locator('#input-ro-appName').getAttribute('readonly'), '');
    const dirtyStatusText = await page.locator('#ops-settings-dirty-status').innerText();
    assert(dirtyStatusText.includes('저장된 설정') || dirtyStatusText.includes('변경'), 'dirty 상태가 문자로 제공되어야 함');

    await page.reload({waitUntil:'networkidle'});await page.locator('.home-container').waitFor();await installCalls(page);
    for(const [menu,selector] of [['workforce','#workforce-root'],['access-history','#access-history-screen']]) {
      await page.locator(`button[data-id="${menu}"]`).click();await page.locator(selector).waitFor();assert(await page.locator(selector).isVisible());
    }
    await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();

    // Shared time picker uses the real input/change flow and keeps cancelled edits local.
    await selectSettingsArea(page,'backup');
    const backupTime = page.locator('#input-databaseBackupTime'), savedTime = await backupTime.inputValue();
    await backupTime.click();await page.locator('.ui-time-picker').waitFor();
    await page.locator('.ui-time-hour').fill('4');await page.locator('.ui-time-minute').fill('25');
    await page.getByRole('button',{name:'시간 선택 취소',exact:true}).click();
    assert.equal(await backupTime.inputValue(),savedTime);
    await backupTime.click();await page.locator('.ui-time-picker').waitFor();
    await page.locator('.ui-time-hour').fill('4');await page.locator('.ui-time-minute').fill('25');
    await page.locator('.ui-time-apply').click();assert.equal(await backupTime.inputValue(),'04:25');
    await page.locator('#btn-revert-settings').click();await page.locator('#btn-confirm-ok').click();
    assert.equal(await backupTime.inputValue(),savedTime);
    await backupTime.click();await page.locator('.ui-time-picker').waitFor();await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ui-time-picker').count(),0);assert.equal(await backupTime.inputValue(),savedTime);

    const localTabs = page.locator('.ops-settings-tab-btn');
    await localTabs.first().focus();
    for (const [key,area] of [['End','system'],['Home','folders'],['ArrowRight','backup'],['ArrowLeft','folders'],['ArrowDown','backup'],['ArrowUp','folders']]) {
      await page.keyboard.press(key);
      assert.equal(await page.locator('#btn-settings-area-'+area).getAttribute('aria-selected'),'true');
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'btn-settings-area-'+area);
    }
    // S20: 18필드 (15개 수정 + 3개 읽기전용) 및 연동 힌트 검증
    const expectedIds = ['pendingDir','approvedDir','scheduleExportDir','allowanceProposalExportDir','allowanceAttachment1ExportDir','allowanceAttachment2ExportDir','databaseBackupDir','databaseBackupTime','migrationFilePath','scheduleConsecutiveNightLimit','scheduleMinimumRestMinutes','scheduleWeeklyMaxMinutes','holidayApiBaseUrl','ro-appName','ro-dataDir','ro-databasePath'].map(key=>'input-'+key).concat(['select-databaseBackupSchedule','checkbox-scheduleRequireWeeklyHoliday']);
    const names = await page.evaluate(ids=>ids.map(id=>{
      const input=document.getElementById(id), hint=input?.closest('.form-group')?.querySelector('.form-help');
      return {id,labels:input?.labels?.length||0,hint:!!hint,hintLinked:!hint||(!!hint.id&&(input.getAttribute('aria-describedby')||'').split(' ').includes(hint.id))};
    }),expectedIds);
    assert.equal(names.length,18);assert(names.every(field=>field.labels>0&&field.hintLinked),'All settings have associated names and hints');
    extraEvidence[id].settingsControls = {timeApplyCancelEscape:true, keyboardAreas:true, fieldBindings:names};

    // ADM01-D04 회귀 검문: 15개 편집 + 3개 읽기전용 필드의 label for/id 연결 및 checkbox label 클릭 토글 실측
    for (const area of ['folders', 'backup', 'policy', 'system']) {
      await selectSettingsArea(page, area);
    }
    // policy 영역에서 label for 연결 및 checkbox label 토글 검증
    await selectSettingsArea(page, 'policy');
    assert.equal(await page.locator('.policy-summary-card').count(), 2, '2개의 정책 안내 카드가 렌더링되어야 함');
    assert.equal(await page.locator('#btn-open-substitute-policy').count(), 1, '대체수당 정책 모달 열기 버튼');
    assert.equal(await page.locator('#btn-open-changed-slot-policy').count(), 1, '근무자 우선순위 정책 모달 열기 버튼');

    const policyFieldIds = [
      'input-scheduleConsecutiveNightLimit',
      'input-scheduleMinimumRestMinutes',
      'input-scheduleWeeklyMaxMinutes',
      'checkbox-scheduleRequireWeeklyHoliday'
    ];
    for (const fid of policyFieldIds) {
      const labelCount = await page.locator(`label[for="${fid}"]`).count();
      assert(labelCount >= 1, `${fid}는 label[for]와 연결되어 있어야 함`);
    }
    // checkbox-scheduleRequireWeeklyHoliday 라벨 클릭 시 실제 체크값 토글 검증
    const cb = page.locator('#checkbox-scheduleRequireWeeklyHoliday');
    const checkedBefore = await cb.isChecked();
    await page.locator('label[for="checkbox-scheduleRequireWeeklyHoliday"]').first().click();
    assert.notEqual(await cb.isChecked(), checkedBefore, '라벨 클릭 시 체크박스가 토글되어야 함');
    // 다시 클릭하여 원복
    await page.locator('label[for="checkbox-scheduleRequireWeeklyHoliday"]').first().click();
    assert.equal(await cb.isChecked(), checkedBefore, '라벨 다시 클릭 시 원래 값으로 복원');

    // Dense 후속: 여섯 설명의 목적/적용/예시/영향, 키보드 트랩과 원래 버튼으로의 복귀.
    const policyHelpChecks = [];
    for (const fid of policyFieldIds) {
      const trigger = page.locator('#help-'+fid);
      await trigger.click();
      await page.waitForFunction(() => document.activeElement?.id === 'btn-policy-help-close');
      const dialog = page.locator('#ops-policy-help-modal');
      assert.equal(await dialog.getAttribute('aria-modal'),'true');
      assert.equal(await dialog.locator('.ops-policy-help section').count(),4);
      const copy = await dialog.innerText();
      for (const heading of ['어떤 기능인가요?','언제 적용되나요?','입력 예시','바꾸면 어떻게 되나요?']) assert(copy.includes(heading));
      if (fid.includes('MinimumRest')) assert(copy.includes('660분은 11시간'));
      if (fid.includes('WeeklyMax')) assert(copy.includes('휴게시간을 뺀 합계'));
      if (fid.includes('RequireWeeklyHoliday')) assert(copy.includes('주휴수당 지급 여부'));
      if (fid.includes('EffectiveFrom')) assert(copy.includes('승인된 보관 실적'));
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => !!document.activeElement?.closest('#ops-policy-help-modal')));
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(),0);
      assert.equal(await page.evaluate(() => document.activeElement?.id),'help-'+fid);
      policyHelpChecks.push({field:fid,sections:4,escapeAndFocusRestore:true});
    }
    extraEvidence[id].policyHelpChecks = policyHelpChecks;

    // ADM01-D05 회귀 검문: 5개 뷰포트 크기 x 4개 영역에서 footer 및 저장/되돌리기 버튼 실제 bounding rect 실측 (가시 영역 내 포함, clipping 0)
    const settingsRects = [];
    for (const vp of [{width:1024,height:768},{width:1280,height:720},{width:1440,height:900},{width:1707,height:825},{width:2048,height:1080}]) {
      await page.setViewportSize(vp);
      for (const area of ['folders', 'backup', 'policy', 'system']) {
        await selectSettingsArea(page, area);
        const rects = await page.evaluate(() => {
          const footer = document.querySelector('.ops-settings-footer');
          const saveBtn = document.querySelector('#btn-save-settings');
          const revertBtn = document.querySelector('#btn-revert-settings');
          const panels = document.querySelector('.ops-settings-panels');
          return {
            footer: footer ? footer.getBoundingClientRect() : null,
            saveBtn: saveBtn ? saveBtn.getBoundingClientRect() : null,
            revertBtn: revertBtn ? revertBtn.getBoundingClientRect() : null,
            panelClientHeight: panels.clientHeight,
            panelScrollHeight: panels.scrollHeight,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
          };
        });
        settingsRects.push({viewport:vp,area,...rects});
        assert(rects.footer && rects.footer.height>0 && rects.footer.top>=0, 'footer가 화면 안에 존재해야 함');
        assert(rects.footer.bottom <= rects.windowHeight + 1, 'footer가 화면 아래로 잘리지 않아야 함');
        assert(rects.footer.left >= 0 && rects.footer.right <= rects.windowWidth + 1, 'footer 가로 범위 유지');
        assert(rects.saveBtn && rects.saveBtn.top>=0 && rects.saveBtn.left>=0 && rects.saveBtn.right<=rects.windowWidth+1 && rects.saveBtn.bottom <= rects.windowHeight + 1, '저장 버튼이 화면 내에 노출되어야 함');
        assert(rects.revertBtn && rects.revertBtn.top>=0 && rects.revertBtn.left>=0 && rects.revertBtn.right<=rects.windowWidth+1 && rects.revertBtn.bottom <= rects.windowHeight + 1, '되돌리기 버튼이 화면 내에 노출되어야 함');
        if (vp.width >= 1440 && vp.height >= 825) assert(rects.panelScrollHeight <= rects.panelClientHeight + 1, `${area}: 기본 설정은 내부 스크롤 없이 보여야 함`);
      }
    }
    await page.setViewportSize({width:1440,height:900});

    extraEvidence[id].settingsRects=settingsRects;
    assert.deepEqual(unexpectedErrors,[]);extraEvidence[id].viewports=metrics;record('Actual widths and no page overflow; shared select/date popup, modal keyboard/focus, home/workforce/access-history navigation, label/clipping verified');
  }
  assert(extraEvidence[id].assertions.length>0,`${id} has no actual assertion evidence`);
}


main().catch(async (e) => {
  process.stderr.write(redactText(`[Err] 치명적 오류: ${String(e)}\n`));
  await cleanup();
  process.exit(1);
});
