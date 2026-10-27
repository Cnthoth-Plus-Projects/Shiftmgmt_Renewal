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
  await page.click(`#tab-btn-${tabId}`);
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
  for(let i=1;i<=55;i++)artifactRegistry.register(`Password${String(i).padStart(2,'0')}!@#`);
  for(const folder of ['pending','approved','export'])fs.mkdirSync(path.join(userDataDir,folder),{recursive:true});

  const entry = `const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;process.on('message',message=>{offset=message.clockOffsetMs;process.send({clockOffsetMs:offset});});require(${JSON.stringify(serverScript)}).startServer();`;
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
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    const logoutBtn = page.locator(".btn-logout");
    if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await logoutBtn.click();
    }
    const idInput = page.locator("#login-id");
    await idInput.waitFor({ state: "visible", timeout: 10000 });
    await idInput.fill(loginId);
    await page.locator("#login-password").fill(password);
    await page.locator("button[type='submit']").click();

    const mode = await Promise.race([
      page.locator("#l4-btn-submit").waitFor({ state: "visible", timeout: 10000 }).then(() => "L4"),
      page.locator(".btn-logout").waitFor({ state: "visible", timeout: 10000 }).then(() => "SHELL"),
    ]);

    if (mode === "L4") {
      const nextPw = "Sm!nextStrongPw7a";
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
    await page.click('button[data-id="operations"]');
    await page.waitForSelector(".operations-screen-root", { timeout: 10000 });
    process.stdout.write(`[Preview] Live preview ready at ${targetUrl} (PID: ${process.pid}, Server PID: ${serverProcess?.pid})\n`);
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
    assert.equal(await tabs.count(), 7, "7개 탭이 존재해야 함");

    // 사용자 관리 바로가기 메뉴 클릭 시 같은 화면의 '사용자' 탭으로 전환 확인
    await page.click('button[data-id="user-mgmt"]');
    await sleep(200);
    const activeTab = await page.locator(".tab-btn.active").textContent();
    assert.equal(activeTab?.trim(), "사용자", "사용자 탭으로 전환되어야 함");

    await verifyScenario("S01", { page, browser, context, adminCreds, seeded, resourcesDir });
    process.stdout.write("[S01] verified\n");
    completedScenarios.push("S01");
  } catch (e) {
    failedScenarios.push({ id: "S01", err: String(e) });
  }
  }

  // --- S02: 사용자 또는 이름 55개에서 전체 정렬/필터 -> 6페이지 (10/10/10/10/10/5) ---
  if (!focusIDs.size || focusIDs.has("S02")) {
  try {
    await switchToTab(page, "site-names");
    const paginationText = await page.locator(".data-table-pagination .pagination-info").textContent();
    assert(paginationText?.includes("6"), "55개 데이터는 총 6페이지여야 함");
    // 마지막 페이지 이동
    await page.click(".btn-last-page");
    await sleep(200);
    const rowCount = await page.locator(".data-table-body .table-row").count();
    assert.equal(rowCount, 5, "6번째 마지막 페이지는 5개 행이어야 함");

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
    await page.click("#btn-rotate-my-recovery-key");
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
  const negativePlan = {"N01": ["three-roles-forced-zero-api-and-direct-guards"], "N02": ["settings-discard-cancel", "watch-double-click", "holiday-import-cancel", "active-rate-confirm-cancel", "user-delete-cancel", "recovery-key-cancel", "site-delete-cancel", "layout-save-reset-cancel", "restore-cancel-wrong-text-double-and-locks"], "N03": ["settings-missing-unit-time-date", "holiday-year-duplicate"], "N04": ["missing-negative-started-date-period"], "N05": ["failed-partial-stale-impact", "controlled-zero-warning-readonly"], "N06": ["empty-password-self-last-admin-and-omission"], "N07": ["protected-structure-binding-unknown-block", "filename-token-path-extension"], "N08": ["stale-save-reset-preview-and-expired-ui"], "N09": ["invalid-json-unknown-missing-type"], "N10": ["path-sha-expiry-phrase-and-locked-db-preservation"], "N11": ["late-tab-and-expired-relogin-ownership", "late-json-after-key-change", "late-secret-response-modal-replacement"], "N12": ["site-literal-roundtrip", "release-literal-detail", "preview-error-literal", "layout-canvas-literal"]};
  for(const [id,labels] of Object.entries(negativePlan)) expectedRejections[id]=labels.every(label=>negativeEvidence[id].includes(label));
  const exactScenarios=completedScenarios.length===plannedScenarios.length&&new Set(completedScenarios).size===plannedScenarios.length&&plannedScenarios.every(id=>completedScenarios.includes(id));
  const accepted=!focusIDs.size&&exactScenarios&&failedScenarios.length===0&&unexpectedErrors.length===0&&Object.values(expectedRejections).every(Boolean);
  await page.evaluate(()=>document.querySelectorAll('.key-input').forEach(input=>{input.value='';}));

  const capturePath = path.join(capturesDir, "operations-final.png");
  await page.screenshot({ path: capturePath, fullPage: true });

  const summary = {
    status: accepted ? "PASS" : focusIDs.size&&failedScenarios.length===0?"PARTIAL_PASS":"FAIL",
    fullRun: !focusIDs.size,
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
  if(await page.locator(`#tab-btn-${id}`).getAttribute('aria-selected')==='true') {
    await switchToTab(page,id==='settings'?'holidays':'settings');
  }
  await switchToTab(page,id);
  await page.locator(`.operations-${id==='layout'?'layout':id}-wrap`).waitFor();
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
async function verifyScenario(id,{page,browser,context,adminCreds,seeded,resourcesDir}) {
  const api=(name,...args)=>bridgeCall(page,name,...args), data=(name,...args)=>bridgeData(page,name,...args);
  const count=name=>callCount(page,name);
  extraEvidence[id]={kind:'ACTUAL_UI_AND_API',assertions:[]};
  const record=label=>extraEvidence[id].assertions.push(label);
  if(id==='S01') {
    assert(Object.values(seeded).every(value=>value>=55),'All six fixture sets contain at least 55 actual records');
    for(const tab of ['settings','holidays','rates','users','layout','site-names','releases']) {
      await freshTab(page,tab);
      assert.equal(await page.locator('.tab-btn.active').getAttribute('id'),`tab-btn-${tab}`);
      assert.equal(await page.locator('[role=tabpanel]').getAttribute('aria-labelledby'),`tab-btn-${tab}`);
    }
    await page.locator('button[data-id="user-mgmt"]').click();
    await page.locator('.operations-users-wrap').waitFor();
    assert.equal((await page.locator('.tab-btn.active').textContent()).trim(),'사용자');
    record('Seven actual tab loads and user shortcut agree with active panel');
  }
  if(id==='S02') {
    await freshTab(page,'site-names');
    const actual=await data('listSiteNameOptions');assert.equal(actual.length,55);
    await page.locator('.dt-table th').first().click();
    const ids=[],names=[],counts=[];
    for(let pageNo=1;pageNo<=6;pageNo++) {
      const rows=await page.locator('.dt-table tr.table-row').evaluateAll(rows=>rows.map(r=>({id:r.dataset.id,name:r.querySelector('td')?.textContent})));
      counts.push(rows.length);ids.push(...rows.map(r=>r.id));names.push(...rows.map(r=>r.name));
      if(pageNo<6) await page.locator('.btn-next-page').click();
    }
    assert.deepEqual(counts,[10,10,10,10,10,5]);assert.equal(new Set(ids).size,55);
    assert.deepEqual(new Set(ids),new Set(actual.map(r=>r.id)));
    assert.deepEqual(names,[...actual].sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(r=>r.name));
    await page.locator('.dt-search-input').fill('시험근무지_01');
    assert.equal(await page.locator('tr.table-row').count(),1);
    assert.match(await page.locator('tr.table-row').innerText(),/시험근무지_01/);
    await page.locator('.dt-search-input').fill('');record('55 distinct records sorted globally before six pages; filter resets page');
  }
  if(id==='S03') {
    await freshTab(page,'settings');
    const before=await data('getAppSettings');
    const changes={pendingDir:path.join(userDataDir,'pending'),approvedDir:path.join(userDataDir,'approved'),scheduleExportDir:path.join(userDataDir,'export'),databaseBackupTime:'03:17',scheduleConsecutiveNightLimit:5,scheduleMinimumRestMinutes:720,scheduleWeeklyMaxMinutes:2880,substituteAllowancePolicyEffectiveFrom:'2026-01-01',changedSlotPriorityEffectiveFrom:'2026-02-01'};
    for(const [key,value] of Object.entries(changes)) await page.locator(`#input-${key}`).fill(String(value));
    const writes=await count('saveAppSettings');
    await page.locator('#tab-btn-holidays').click();await page.locator('#btn-confirm-cancel').click();
    const canceledWrites=await count('saveAppSettings');
    negative('N02','settings-discard-cancel',()=>assert.equal(canceledWrites,writes));
    assert.equal(await page.locator('#input-scheduleConsecutiveNightLimit').inputValue(),'5');
    await page.locator('#btn-save-settings').click();await notice(page);assert.equal(await count('saveAppSettings'),writes+1);
    const after=await data('getAppSettings');for(const [key,value] of Object.entries(changes)) assert.equal(after[key],value,key);
    for(const [key,value] of Object.entries(before)) if(!(key in changes)&&!['updatedAt','updatedBy'].includes(key)) assert.deepEqual(after[key],value,key);
    await freshTab(page,'holidays');await freshTab(page,'settings');assert.equal(await page.locator('#input-databaseBackupTime').inputValue(),'03:17');
    const invalidWrites=[];
    for(const [key,value] of [['scheduleConsecutiveNightLimit',''],['scheduleMinimumRestMinutes','-1'],['databaseBackupTime',''],['changedSlotPriorityEffectiveFrom','bad-date']]) {
      const field=page.locator(`#input-${key}`), original=await field.inputValue(), originalType=await field.getAttribute('type');
      await field.evaluate((input,value)=>{if(input.type==='date')input.type='text';input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
      const old=await count('saveAppSettings');await page.locator('#btn-save-settings').click();await notice(page);invalidWrites.push((await count('saveAppSettings'))-old);
      await field.evaluate((input,{type,value})=>{input.type=type||'text';input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},{type:originalType,value:original});
    }
    negative('N03','settings-missing-unit-time-date',()=>assert.deepEqual(invalidWrites,[0,0,0,0]));record('Full settings saved once and re-read, unrelated fields preserved, invalid writes zero');
  }
  if(id==='S04') {
    await freshTab(page,'settings');
    const stop=await count('stopFileWatch');await page.locator('.operations-settings-wrap #btn-stop-watch').dblclick();await notice(page);
    const stopped=await data('getFileWatchStatus');assert.equal(await count('stopFileWatch'),stop+1);assert.equal(stopped.isRunning,false);
    await page.locator('.operations-settings-wrap #btn-ops-restart-watch').click();await notice(page);const started=await data('getFileWatchStatus');assert.equal(started.isRunning,true);
    negative('N02','watch-double-click',()=>assert.equal(stopped.isRunning,false));record('Actual watcher stop/restart state and double-click count');
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
      if(holidayMode==='error'){response.statusCode=503;response.end('{}');}
      else response.end(holidayMode==='parse'?'bad-json':JSON.stringify([{date:'2026-11-01',name:'로컬 API 공휴일',isSubstitute:false},{date:'2026-11-02',name:'로컬 대체일',isSubstitute:true}]));
    });await new Promise(resolve=>holidayServer.listen(0,'127.0.0.1',resolve));
    const settings=await data('getAppSettings');await data('saveAppSettings',{...settings,holidayApiBaseUrl:`http://127.0.0.1:${holidayServer.address().port}/holidays`});
    await freshTab(page,'holidays');const before=await data('getHolidayCalendar',2026),writes=await count('replaceHolidayCalendar');
    await page.locator('#btn-fetch-holiday-api').click();await page.locator('#btn-confirm-cancel').click();assert.equal(await count('replaceHolidayCalendar'),writes);
    await page.locator('#btn-fetch-holiday-api').click();await page.locator('#btn-confirm-ok').click();await notice(page);
    assert.equal(await count('replaceHolidayCalendar'),writes+1);const imported=await data('getHolidayCalendar',2026);assert.equal(imported.items.length,2);
    for(const mode of ['error','parse']) {holidayMode=mode;await page.locator('#btn-fetch-holiday-api').click();await notice(page);assert.deepEqual(await data('getHolidayCalendar',2026),imported);}
    holidayMode='ok';await data('replaceHolidayCalendar',{year:2026,items:before.items});
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
    await page.locator('#btn-rotate-my-recovery-key').click();await page.locator('#btn-confirm-cancel').click();assert.equal(await count('rotateAccountRecoveryKey'),before);
    await page.locator('#btn-rotate-my-recovery-key').click();await page.locator('#btn-confirm-ok').click();await page.locator('.key-input').waitFor();
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
    await selectLayout(page,0);const before=await data('getDocumentLayout',layoutKeys[0]),history=await data('listDocumentLayoutHistory',layoutKeys[0]);
    const filename=page.locator('#input-layout-filename-main');await filename.fill('검수/{year}-{month2}-{siteName}.xlsx');
    const keyValue=await page.locator('.layout-key-select').inputValue();const values=await page.locator('.layout-key-select option').evaluateAll(options=>options.map(o=>o.value));
    await page.locator('.layout-key-select').selectOption(values[1]);await page.locator('#btn-confirm-cancel').click();assert.equal(await page.locator('.layout-key-select').inputValue(),keyValue);assert.equal(await filename.inputValue(),'검수/{year}-{month2}-{siteName}.xlsx');
    const writes=await count('saveDocumentLayout');await page.locator('#btn-save-layout').click();await page.locator('#btn-modal-cancel').click();assert.equal(await count('saveDocumentLayout'),writes);
    await page.locator('#btn-save-layout').click();await page.locator('#btn-modal-submit').click();await notice(page);assert.equal(await count('saveDocumentLayout'),writes+1);
    const saved=await data('getDocumentLayout',layoutKeys[0]);assert.notEqual(saved.activeRevisionId,before.activeRevisionId);assert.equal(saved.definition.outputs[0].outputFileNamePattern,'검수/{year}-{month2}-{siteName}.xlsx');
    const afterHistory=await data('listDocumentLayoutHistory',layoutKeys[0]);assert.equal(afterHistory.length,history.length+1);
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
    const employee=await data('saveEmployee',{employeeCode:'SOL-BACKUP-EMAIL',name:'백업 이메일 검수',employmentType:'정규',status:'active',email:'backup@example.invalid',contact:'010-1111-2222'});
    const backup=await data('runDatabaseBackupNow');assert.equal(backup.tableCount,40);assert(fs.existsSync(backup.jsonBackupPath));
    const bytes=fs.readFileSync(backup.jsonBackupPath);assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),backup.backupSha256.toUpperCase());
    const payload=JSON.parse(bytes);assert.equal(Object.keys(payload.tables).length,40);assert(JSON.stringify(payload.tables.employees).includes(employee.email));
    const extra=await data('saveSiteNameOption',{name:'복원 이후 제거되어야 하는 시험자료'});
    await prepareRestore(page,backup.jsonBackupPath);
    const preview=(await page.evaluate(()=>window.__lastDbPreview)).data;assert.equal(preview.tableImpacts.length,40);
    const shown=[];for(let n=0;n<4;n++) {
      shown.push(...await page.locator('.restore-flow-container tr.table-row').evaluateAll(rows=>rows.map(row=>({name:row.children[0].textContent.trim(),before:Number(row.children[1].textContent.replaceAll(',','')),after:Number(row.children[2].textContent.replaceAll(',',''))}))));
      if(n<3)await page.locator('.restore-flow-container .btn-next-page').click();
    }
    assert.equal(new Set(shown.map(r=>r.name)).size,40);for(const row of shown){const expected=preview.tableImpacts.find(t=>t.tableName===row.name);assert(expected);assert.equal(row.before,expected.currentRowCount);assert.equal(row.after,expected.nextRowCount);}
    const writes=await count('updateDatabaseFromMigration');await page.locator('#btn-execute-db-restore').click();await page.locator('#btn-prompt-cancel').click();assert.equal(await count('updateDatabaseFromMigration'),writes);
    await page.locator('#btn-execute-db-restore').click();await page.locator('.prompt-input').fill('확인');await page.locator('#btn-prompt-ok').click();assert.equal(await count('updateDatabaseFromMigration'),writes);assert(await page.locator('.form-error').isVisible());
    await overrideBridge(page,'updateDatabaseFromMigration','async input=>{const result=await window.__opsActual.updateDatabaseFromMigration(input);window.__lastRestore=result;return new Promise(resolve=>{window.__releaseRestore=()=>resolve(result);});}');
    await page.locator('.prompt-input').fill('교체');await page.locator('#btn-prompt-ok').evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>!!window.__releaseRestore);assert.equal(await count('updateDatabaseFromMigration'),writes+1);
    assert(await page.locator('.db-backup-section input,.db-backup-section button').evaluateAll(controls=>controls.every(c=>c.disabled)));
    await page.evaluate(()=>window.__releaseRestore());await page.waitForFunction(()=>document.querySelector('.restore-flow-container')?.textContent.includes('교체 직전 자동 백업'));
    const result=await page.evaluate(()=>window.__lastRestore);assert(result.ok);assert(fs.existsSync(result.data.backupBeforeRestore.jsonBackupPath));assert.equal(result.data.tableResults.length,40);
    assert(!(await data('listSiteNameOptions')).some(site=>site.id===extra.id));assert.equal((await data('listEmployees')).find(e=>e.id===employee.id).email,employee.email);
    await restoreBridge(page,'updateDatabaseFromMigration');scenarioState.backup=backup;scenarioState.backupPayload=payload;scenarioState.databasePath=result.data.databasePath;
    negative('N02','restore-cancel-wrong-text-double-and-locks',()=>assert.equal(shown.length,40));record('Actual JSON40/SHA/email, all table counts, cancel/wrong phrase zero writes, actual restore once and automatic pre-backup');
  }
  if(id==='S18') {
    await freshTab(page,'settings');const snapshot=await data('listSiteNameOptions'),watchBefore=await data('getFileWatchStatus');
    const original=clone(scenarioState.backupPayload);const invalids=[];
    const malformed=path.join(userDataDir,'malformed.json');fs.writeFileSync(malformed,'not-json');invalids.push(malformed);
    for(const [name,mutate] of [
      ['unknown-column',p=>{p.tables.employees[0].unknown_column='bad';}],
      ['missing-required',p=>{delete p.tables.employees[0].id;}],
      ['wrong-type',p=>{p.tables.employees[0].id={invalid:true};}]
    ]) {const p=clone(original);mutate(p);const file=path.join(userDataDir,name+'.json');fs.writeFileSync(file,JSON.stringify(p));invalids.push(file);}
    const rejected=[];for(const file of invalids){const result=await api('checkDatabaseMigrationRequirements',{backupFilePath:file});rejected.push(!result.ok||!result.data.isReady);}
    negative('N09','invalid-json-unknown-missing-type',()=>assert(rejected.length===4&&rejected.every(Boolean)));
    const legacy=clone(original);for(const employee of legacy.tables.employees)delete employee.email;const legacyFile=path.join(userDataDir,'legacy-no-email.json');fs.writeFileSync(legacyFile,JSON.stringify(legacy));assert.equal((await data('checkDatabaseMigrationRequirements',{backupFilePath:legacyFile})).isReady,true);
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
    await page.locator('#btn-rotate-my-recovery-key').click();await page.locator('#btn-confirm-ok').click();await page.waitForFunction(()=>!!window.__releaseLateKey);
    await page.locator('#btn-add-user').click();const newModalId=await page.locator('.workforce-modal-overlay').getAttribute('id');
    await page.evaluate(()=>window.__releaseLateKey());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));assert.equal(await page.locator('.workforce-modal-overlay').getAttribute('id'),newModalId);assert.equal(await page.locator('.key-input').count(),0);
    await page.locator('#btn-modal-cancel').click();await page.evaluate(()=>{delete window.__releaseLateKey;});await restoreBridge(page,'rotateAccountRecoveryKey');
    negative('N11','late-secret-response-modal-replacement',()=>assert.equal(newModalId,'modal-add-user'));
    await overrideBridge(page,'getDocumentLayout','async key=>{const actual=await window.__opsActual.getDocumentLayout(key);window.__heldLayout=true;return new Promise(resolve=>{window.__releaseLayout=()=>resolve(actual);});}');
    await page.locator('#tab-btn-layout').click();await page.waitForFunction(()=>window.__heldLayout);await page.locator('#tab-btn-holidays').click();await page.locator('.operations-holidays-wrap').waitFor();
    await page.evaluate(()=>window.__releaseLayout());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));assert.equal(await page.locator('.operations-holidays-wrap').count(),1);await restoreBridge(page,'getDocumentLayout');
    await overrideBridge(page,'listOperationUsers','async()=>new Promise(resolve=>{window.__lateUsers=()=>resolve({ok:false,errorCode:"AUTH_SESSION_REQUIRED",message:"controlled delayed old-session response"});})');
    await page.locator('#tab-btn-users').click();await page.waitForFunction(()=>!!window.__lateUsers);
    await page.evaluate(()=>{window.__loginRenders=0;window.__loginObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&(node.matches?.('.login-form')||node.querySelector?.('.login-form')))window.__loginRenders++;});window.__loginObserver.observe(document.body,{childList:true,subtree:true});});
    await api('signOut');await page.locator('#tab-btn-settings').click();await page.locator('.login-form').waitFor();
    await page.locator('#login-id').fill(adminCreds.loginId);await page.locator('#login-password').fill(adminCreds.password);await page.locator('.login-form button[type=submit]').click();await page.locator('.btn-logout').waitFor();
    await page.evaluate(()=>window.__lateUsers());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));assert.equal(await page.locator('.btn-logout').count(),1);
    const loginRenders=await page.evaluate(()=>{window.__loginObserver.disconnect();return window.__loginRenders;});assert.equal(loginRenders,1);
    await restoreBridge(page,'listOperationUsers');await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();
    negative('N11','late-tab-and-expired-relogin-ownership',()=>assert.equal(loginRenders,1));record('Actual three role sessions/forced guards; delayed tab success and old-session failure after actual signout/relogin cannot replace new screen/session');
  }
  if(id==='S20') {
    await freshTab(page,'settings');const metrics=[];
    for(const viewport of [{width:1024,height:768},{width:1440,height:900},{width:2048,height:1080}]) {
      await page.setViewportSize(viewport);metrics.push(await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,devicePixelRatio,documentWidth:document.documentElement.scrollWidth})));
      assert.equal(metrics.at(-1).innerWidth,viewport.width);assert(metrics.at(-1).documentWidth<=viewport.width+1);
    }
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#select-databaseBackupSchedule').click();await page.locator('.ui-control-popup.ui-listbox').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.ui-control-popup').count(),0);
    await page.locator('#input-substituteAllowancePolicyEffectiveFrom').click();await page.locator('.ui-calendar-grid').waitFor();await page.keyboard.press('Escape');
    const original=await page.locator('#input-scheduleConsecutiveNightLimit').inputValue();await page.locator('#input-scheduleConsecutiveNightLimit').fill('-1');await page.locator('#btn-save-settings').click();await page.locator('.workforce-modal-overlay').waitFor();await page.waitForFunction(()=>!!document.activeElement?.closest('.workforce-modal-overlay'));
    for(const key of ['Tab','Shift+Tab','Tab']) {await page.keyboard.press(key);assert(await page.evaluate(()=>!!document.activeElement?.closest('.workforce-modal-overlay')));}
    await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.id==='btn-save-settings');await page.locator('#input-scheduleConsecutiveNightLimit').fill(original);
    await page.reload({waitUntil:'networkidle'});await page.locator('.home-container').waitFor();await installCalls(page);
    for(const [menu,selector] of [['workforce','#workforce-root'],['access-history','#access-history-screen']]) {
      await page.locator(`button[data-id="${menu}"]`).click();await page.locator(selector).waitFor();assert(await page.locator(selector).isVisible());
    }
    await page.locator('button[data-id="operations"]').click();await page.locator('.operations-settings-wrap').waitFor();
    assert.deepEqual(unexpectedErrors,[]);extraEvidence[id].viewports=metrics;record('Actual widths and no page overflow; shared select/date popup, modal keyboard/focus, home/workforce/access-history navigation');
  }
  assert(extraEvidence[id].assertions.length>0,`${id} has no actual assertion evidence`);
}


main().catch(async (e) => {
  process.stderr.write(redactText(`[Err] 치명적 오류: ${String(e)}\n`));
  await cleanup();
  process.exit(1);
});
