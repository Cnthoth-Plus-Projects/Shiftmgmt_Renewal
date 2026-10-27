import assert from "node:assert/strict";
import { artifactRegistry, evidenceJSON, redactText, seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import ExcelJS from "exceljs";
import { findChrome } from "../lib/find-chrome.mjs";
import { checkServerHealth } from "../lib/ui-check.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const rawArgs = process.argv.slice(2);
let outArg = rawArgs.find((a) => a.startsWith("--out="))?.slice(6)?.replace(/^["']|["']$/g, "")?.trim();
const outDir = path.resolve(outArg || path.join(os.tmpdir(), "shiftmgmt-workforce-ui-" + randomUUID()));
const tempBoundary = fs.realpathSync(os.tmpdir());
const underTemp = value => { const rel = path.relative(tempBoundary, value); return rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
if (!underTemp(outDir)) throw new Error("출력은 TEMP 하위 전용 폴더여야 합니다.");
let existingParent = outDir; while (!fs.existsSync(existingParent)) existingParent = path.dirname(existingParent);
if (existingParent !== tempBoundary && !underTemp(fs.realpathSync(existingParent))) throw new Error("출력 경로의 실제 위치가 TEMP 밖입니다.");
fs.mkdirSync(outDir, { recursive: true });

const capturesDir = path.join(outDir, "captures");
fs.mkdirSync(capturesDir, { recursive: true });

const targetPort = 18809;
const targetUrl = `http://127.0.0.1:${targetPort}/`;

const tempRoot = fs.realpathSync(os.tmpdir());
const userDataDir = path.join(tempRoot, "shiftmgmt-wf-data-" + randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(userDataDir, { recursive: true });

const plannedScenarios = ["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10","S11","S12","S13","S14","S15","S16","S17","S18","S19","S20","S21"];
const completedScenarios = [];
const failedScenarios = [];
const unexpectedErrors = [];
const expectedHttpRejections = [];
let expectSession401 = false;
const captures = [];
const expectedRejections = { N01: false, N02: false, N03: false, N04: false, N05: false, N06: false, N07: false, N08: false, N09: false, N10: false, N11: false, N12: false };

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

async function createSampleExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("시급업데이트");
  ws.addRow(["근무지", "이름", "시급"]);
  ws.addRow(["동탄센터", "이수민", 15500]);
  ws.addRow(["없는근무지", "없는직원", 99999]);
  await wb.xlsx.writeFile(filePath);
}

async function cleanup() {
  if (browser) { try { await browser.close(); } catch {} browser = null; }
  if (serverProcess) {
    try { if (serverProcess.pid) execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { stdio: "ignore" }); } catch {}
    serverProcess = null;
  }
}

process.on("SIGINT", async () => { await cleanup(); process.exit(1); });
process.on("SIGTERM", async () => { await cleanup(); process.exit(1); });

async function main() {
  process.stdout.write(`[UI-01] Starting Workforce Screen Verification (S01~S21)\n`);
  if (await isPortInUse(targetPort)) {
    process.stderr.write(`[Err] 포트 ${targetPort} 사용 중\n`);
    process.exit(1);
  }

  const serverScript = path.join(repoRoot, "dist", "server", "main", "server.js");
  if (!fs.existsSync(serverScript)) {
    process.stderr.write(`[Err] server.js 없음\n`);
    process.exit(1);
  }

  const bootstrapFile = path.join(userDataDir, "data", "bootstrap-credentials.json");
  fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: "production",
    SHIFTMGMT_PORT: String(targetPort),
    SHIFTMGMT_USER_DATA_DIR: userDataDir,
    SHIFTMGMT_UI_BOOTSTRAP_FILE: bootstrapFile
  };

  const { ensureAuthBootstrapCredentials } = await import(pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js")).href);
  ensureAuthBootstrapCredentials({ userDataPath: userDataDir, env });

  serverProcess = spawn(process.execPath, [serverScript], { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  serverProcess.stderr.on("data", (d) => {
    const m = d.toString();
    if (!m.includes("ExperimentalWarning")) process.stderr.write(`[Err] ${m}`);
  });
  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) unexpectedErrors.push(`서버 비정상 종료 (${code})`);
  });

  let healthOk = false;
  for (let i = 0; i < 40; i++) {
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

  let bootstrapData = {};
  try {
    bootstrapData = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
  } catch (err) {
    process.stderr.write(`[Err] bootstrap 읽기 실패: ${err.message}\n`);
    await cleanup();
    process.exit(2);
  }

  const adminCreds = bootstrapData.credentials?.["user-admin"];
  const operatorCreds = bootstrapData.credentials?.["user-operator"];
  if (!adminCreds || !operatorCreds) {
    process.stderr.write(`[Err] 자격증명 부족\n`);
    await cleanup();
    process.exit(2);
  }

  seedBootstrapSecrets(bootstrapFile);
  const chromePath = findChrome().path;
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);

  page.on("pageerror", (err) => unexpectedErrors.push(`[Page Error] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (expectSession401 && /401.*Unauthorized/.test(t)) expectedHttpRejections.push(t);
      else if (!t.includes("favicon") && !t.includes("404")) unexpectedErrors.push(`[Console Error] ${t}`);
    }
  });

  const takeCapture = async (name) => {
    const capturePath = path.join(capturesDir, `${name}.png`);
    await page.screenshot({ path: capturePath, fullPage: false });
    captures.push(capturePath);
  };

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
    ]).catch(() => "TIMEOUT");

    if (mode === "L4") {
      const nextPw = "Sm!nextStrongPw7a"; artifactRegistry.register(nextPw);
      await page.locator("#l4-current-pw").fill(password);
      await page.locator("#l4-new-pw").fill(nextPw);
      await page.locator("#l4-confirm-pw").fill(nextPw);
      await page.locator("#l4-btn-submit").click();
      await page.locator(".btn-logout").waitFor({ state: "visible", timeout: 15000 });
      return nextPw;
    }
    await page.locator(".btn-logout").waitFor({ state: "visible", timeout: 15000 });
    return password;
  };

  const performLogout = async () => {
    const logoutBtn = page.locator(".btn-logout");
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForSelector("#login-id", { timeout: 10000 });
    }
  };

  let adminPw = await performLogin(adminCreds.loginId, adminCreds.password);
  const operatorId = "test-operator-" + randomUUID().slice(0, 6);
  const plannerId = "test-planner-" + randomUUID().slice(0, 6);
  const reviewerId = "test-reviewer-" + randomUUID().slice(0, 6);
  const subPw = "Sm!testPass123"; artifactRegistry.register(subPw);
  await page.evaluate(async ({ opId, pId, rId, pw }) => {
    const b = window.appBridge;
    if (b?.saveOperationUser) {
      await b.saveOperationUser({ loginId: opId, displayName: "운영자", role: "operator", status: "active", password: pw });
      await b.saveOperationUser({ loginId: pId, displayName: "기획자", role: "planner", status: "active", password: pw });
      await b.saveOperationUser({ loginId: rId, displayName: "검토자", role: "reviewer", status: "active", password: pw });
    }
  }, { opId: operatorId, pId: plannerId, rId: reviewerId, pw: subPw });

  const api = (method, ...args) => page.evaluate(async ({ method, args }) => window.appBridge[method](...args), { method, args });
  const ok = result => { assert.equal(result.ok, true, result.message); return result.data; };
  const writes = [];
  page.on("request", request => { const channel = request.url().split("/api/")[1]; if (channel?.startsWith("employees:")) writes.push(channel); });
  const writeCount = channel => writes.filter(x => x === channel).length;
  const flush = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  const openEmployee = async code => {
    await page.getByRole("button", { name: "인력 관리", exact: true }).click();
    await page.locator("#filter-status-select").selectOption("all");
    await page.locator("#filter-keyword-input").fill(code);
    const row = page.locator(`tr[data-employee-code="${code}"]`);
    await row.waitFor(); await row.click();
    await page.waitForFunction(code => document.querySelector("#e2-detail-title")?.textContent.includes(code), code);
    await page.locator("#btn-detail-retry").waitFor({ state: "detached" });
    return row;
  };
  const employeeByCode = async code => ok(await api("listEmployees")).find(e => e.employeeCode === code);
  const closeImpact = async () => { await page.locator("#btn-close-impact").click(); await page.locator("#modal-wage-impact").waitFor({ state: "detached" }); };
  const submitWage = async (rate, from) => {
    await page.locator("#btn-open-e3").click(); await page.locator("#modal-e3-rate").fill(String(rate)); await page.locator("#modal-e3-from").fill(from);
    await page.locator("#btn-submit-e3").click();
    if (await page.locator("#modal-wage-confirm").count()) await page.locator("#btn-confirm-wage-save").click();
    await page.locator("#modal-wage-impact").waitFor();
  };
  const trapAndClose = async id => {
    const modal = page.locator(id); await modal.waitFor();
    await page.waitForFunction(id => document.querySelector(id)?.contains(document.activeElement), id);
    const focusable = modal.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]');
    const visible = []; for (const el of await focusable.all()) if (await el.isVisible()) visible.push(el);
    assert.ok(visible.length > 0); await visible[visible.length - 1].focus(); await page.keyboard.press("Tab"); assert.equal(await visible[0].evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Shift+Tab"); assert.equal(await visible[visible.length - 1].evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Escape"); await modal.waitFor({ state: "detached" });
  };

  const focus = rawArgs.find(a => a.startsWith("--focus="))?.slice(8).split(",");
  if (focus?.some(id => !plannedScenarios.includes(id))) throw new Error("unknown focused scenario");
  const selectedScenarios = focus ? plannedScenarios.filter(id => ["S01","S02","S03","S04","S05",...focus].includes(id)) : plannedScenarios;
  const newEmpCode = "EMP" + Date.now().toString().slice(-4);
const excelSamplePath = path.join(outDir, "workforce-sample.xlsx");
  await createSampleExcel(excelSamplePath);
  if (selectedScenarios.includes("S01")) {
  // S01
  try {
    await page.locator("button.nav-item:has-text('인력 관리')").click();
    await page.waitForSelector("#workforce-root", { timeout: 10000 });
    await page.waitForSelector("#table-emp-e1", { timeout: 10000 });

    const firstRow = page.locator("#table-emp-e1 tbody tr.workforce-row").first();
    await firstRow.waitFor({ state: "visible", timeout: 5000 });
    const rowName = (await firstRow.locator("td").nth(1).textContent())?.trim() || "";

    const detailTitle = page.locator("#e2-detail-title");
    await detailTitle.waitFor({ state: "visible", timeout: 5000 });
    const detailText = await detailTitle.textContent();
    if (!detailText.includes(rowName)) throw new Error(`이름 불일치: ${rowName}`);

    await takeCapture("s01-workforce-main");
    completedScenarios.push("S01");
  } catch (err) { failedScenarios.push(`S01: ${err.message}`); }
  }
  if (selectedScenarios.includes("S02")) {
  // S02
  try {
    const searchInput = page.locator("#filter-keyword-input");
    await searchInput.fill("김");
    await sleep(350);
    if (!await searchInput.evaluate((el) => document.activeElement === el)) throw new Error("포커스 유실");

    await page.locator("#filter-site-select").selectOption("unassigned");
    assert.equal(await page.locator("#btn-filter-orphan").count(), 0);
    await page.locator("#filter-site-select").selectOption("all");

    await searchInput.fill("");
    await sleep(350);

    const groupHeader = page.locator(".workforce-group-row").first();
    if (await groupHeader.isVisible().catch(() => false)) {
      await groupHeader.click();
      await sleep(100);
      await groupHeader.click();
    }
    await takeCapture("s02-filter-search");

    for (let i=0;i<21;i++) ok(await api("saveEmployee", { employeeCode:`SOL-PAGE-${i}`,name:`페이지 검증 ${String(i).padStart(2,"0")}`,employmentType:i%2?"계약":"정규",status:"active",rank:"사원",hireDate:"2026-01-01" }));
    await openEmployee("EMP-001"); await page.locator("#filter-keyword-input").fill("페이지 검증"); await page.waitForFunction(() => document.querySelector("#workforce-pagination")?.textContent.includes("21명"));
    assert.equal(await page.locator("#btn-employees-prev").isDisabled(),true);
    const pageCodes = [];
    for (let pageIndex = 0; pageIndex < 21; pageIndex++) {
      const rows = page.locator("tr.workforce-row");
      assert.ok(await rows.count() > 0);
      pageCodes.push(...await rows.evaluateAll(elements => elements.map(row => row.dataset.employeeCode)));
      assert.ok(await page.locator("#workforce-row-slots").evaluate(viewport => viewport.scrollHeight <= viewport.clientHeight + 1));
      if (await page.locator("#btn-employees-next").isDisabled()) break;
      await page.locator("#btn-employees-next").click();
    }
    assert.equal(pageCodes.length,21); assert.equal(new Set(pageCodes).size,21);
    await page.locator("#filter-employment-type").selectOption("계약"); assert.match(await page.locator("#workforce-pagination").innerText(), /1\/1페이지/); assert.equal(await page.locator("tr.workforce-row").count(),10); await page.locator("#btn-workforce-reset-filters").click(); assert.equal(await page.locator("#filter-keyword-input").inputValue(),""); assert.equal(await page.locator("#workforce-kpis .workforce-kpi").count(),6);

    completedScenarios.push("S02");
  } catch (err) { failedScenarios.push(`S02: ${err.message}`); }
  }
  if (selectedScenarios.includes("S03")) {
  // S03
  try {
    await page.locator("#btn-e1-new").click();
    await page.waitForSelector("#modal-e8", { timeout: 5000 });
    await sleep(300);
    const codeInput = page.locator("#modal-e8-code");
    await codeInput.click();
    await codeInput.fill(newEmpCode);
    await page.locator("#modal-e8-name").fill("정규테스트");
    await page.locator("#modal-e8-rank").selectOption("대리");
    await page.locator("#modal-e8-hire-date").fill("2026-10-01");
    await page.locator("#modal-e8-rate").fill("13000");
    await page.locator("#modal-e8-contact").fill("010-0000-5678");
    await page.locator("#modal-e8-email").fill("created@example.invalid");
    await sleep(100);
    await page.locator("#btn-submit-e8").click();
    await page.waitForSelector("#modal-e8", { state: "detached", timeout: 10000 });
    await sleep(500);
    const searchInput = page.locator("#filter-keyword-input");
    await searchInput.fill(newEmpCode);
    await sleep(350);
    const createdRow = page.locator(`#table-emp-e1 tbody tr[data-employee-code='${newEmpCode}']`);
    await createdRow.waitFor({ state: "visible", timeout: 5000 });
    await createdRow.click();
    await page.waitForFunction((c) => document.querySelector("#e2-detail-title")?.textContent?.includes(c), newEmpCode, { timeout: 5000 });
    const emailCreated = await employeeByCode(newEmpCode);
    assert.equal(emailCreated.email, "created@example.invalid"); assert.equal(emailCreated.contact, "010-0000-5678");
    await takeCapture("s03-new-employee");
    completedScenarios.push("S03");
  } catch (err) {
    const errTexts = await page.locator(".workforce-form-error").allTextContents().catch(() => []);
    failedScenarios.push(`S03: ${err.message} [errs: ${errTexts.filter(Boolean).join("|")}]`);
    await page.keyboard.press("Escape").catch(() => {});
  }
  }
  if (selectedScenarios.includes("S04")) {
  // S04
  try {
    await page.locator("#btn-e1-new").click();
    await page.waitForSelector("#modal-e8", { timeout: 5000 });
    await page.locator("#modal-e8-emp-type").selectOption("BP");

    if (!await page.locator("#modal-e8-rate").isDisabled()) throw new Error("BP 시급 미잠금");
    expectedRejections.N02 = true;

    await page.locator("#modal-e8-code").fill("");
    await page.locator("#modal-e8-name").fill("외부협력원");
    await page.locator("#modal-e8-hire-date").fill("2026-10-01");
    await page.locator("#btn-submit-e8").click();
    await page.waitForSelector("#modal-e8", { state: "detached", timeout: 10000 });

    await sleep(500);
    await takeCapture("s04-bp-employee");
    completedScenarios.push("S04");
  } catch (err) { failedScenarios.push(`S04: ${err.message}`); }
  }
  if (selectedScenarios.includes("S05")) {
  // S05
  try {
    await openEmployee(newEmpCode);
    await page.locator("#btn-edit-employee").click();
    await page.waitForSelector("#modal-edit-employee", { timeout: 5000 });

    if (!await page.locator("#edit-hire-date").isDisabled()) throw new Error("입사일 미잠금");
    expectedRejections.N03 = true;

    assert.equal(await page.locator("#edit-email").inputValue(), "created@example.invalid");
    await page.locator("#edit-contact").fill("010-9999-8888");
    assert.equal(await page.locator("#edit-contact").inputValue(), "010-9999-8888");
    await page.locator("#edit-email").fill("edited@example.invalid");
    await page.locator("#btn-submit-edit").click();
    await page.waitForSelector("#modal-edit-employee", { state: "detached", timeout: 5000 });

    await sleep(500);
    const emailEdited = await employeeByCode(newEmpCode);
    assert.equal(emailEdited.email, "edited@example.invalid"); assert.equal(emailEdited.contact, "010-9999-8888");
    await takeCapture("s05-edit-employee");
    completedScenarios.push("S05");
  } catch (err) { failedScenarios.push(`S05: ${err.message}`); }
  }
  if (selectedScenarios.includes("S06")) {
  // S06
  try {

    const employee = await employeeByCode(newEmpCode); assert.ok(employee);
    ok(await api("saveEmployeeWageRate", { employeeId: employee.id, hourlyRate: 14000, effectiveFrom: "2026-10-27" }));
    ok(await api("saveEmployeeWageRate", { employeeId: employee.id, hourlyRate: 20000, effectiveFrom: "2026-10-28" }));
    await openEmployee(newEmpCode);
    await page.waitForFunction(() => document.querySelector("#e2-current-rate")?.textContent.includes("14,000"));
    assert.match(await page.locator("#e2-scheduled-rate").innerText(), /20,000/);
    assert.match(await page.locator(`tr[data-employee-code="${newEmpCode}"]`).innerText(), /20,000/);
    await page.evaluate(() => { window.__wageOriginal = window.appBridge.listEmployeeWageRates; window.appBridge.listEmployeeWageRates = async () => ({ ok: true, data: [] }); });
    await page.locator(`tr[data-employee-code="${newEmpCode}"]`).click(); await page.waitForFunction(() => document.querySelector("#e2-current-rate")?.textContent === "미등록");
    await page.evaluate(() => { window.appBridge.listEmployeeWageRates = window.__wageOriginal; }); await openEmployee(newEmpCode);

    await takeCapture("s06-verified");
    completedScenarios.push("S06");
  } catch (err) { failedScenarios.push(`S06: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S07")) {
  // S07
  try {

    await openEmployee(newEmpCode); assert.equal(await page.locator("#btn-open-e3").isEnabled(), true);
    await page.locator("#btn-open-e3").click(); await page.locator("#modal-e3-rate").fill("0");
    await page.locator("#btn-submit-e3").click(); assert.equal(await page.locator("#err-e3-rate").isVisible(), true);
    await page.locator("#modal-e3-rate").fill("14100"); await page.locator("#btn-submit-e3").click(); assert.equal(await page.locator("#err-e3-from").isVisible(), true);
    expectedRejections.N01 = true;
    const before = writeCount("employees:save-wage-rate"); await page.locator("#modal-e3-from").fill("2026-10-27"); await page.locator("#btn-submit-e3").click();
    await page.locator("#modal-wage-confirm").waitFor(); assert.equal(writeCount("employees:save-wage-rate"), before);
    await page.locator("#btn-cancel-wage-confirm").click(); await page.locator("#modal-e3").waitFor(); assert.equal(writeCount("employees:save-wage-rate"), before);
    expectedRejections.N04 = true;
    await page.locator("#modal-e3-rate").fill("14100"); await page.locator("#modal-e3-from").fill("2026-10-27"); await page.locator("#btn-submit-e3").click(); await page.locator("#btn-confirm-wage-save").click();
    await page.locator("#impact-count-label").waitFor(); assert.equal(writeCount("employees:save-wage-rate"), before + 1); await closeImpact();
    const employee = await employeeByCode(newEmpCode); assert.equal(ok(await api("listEmployeeWageRates", employee.id)).find(r => r.effectiveFrom === "2026-10-27").hourlyRate, 14100);
    await page.locator(".btn-close-wage").first().click(); await page.locator("#modal-close-wage-to").fill("2020-01-01"); await page.locator("#btn-submit-close-wage").click(); assert.equal(await page.locator("#err-close-wage-to").isVisible(), true);
    await page.locator("#modal-close-wage-to").fill("2026-10-28"); const closedBefore = writeCount("employees:close-wage-rate"); await page.locator("#btn-submit-close-wage").click(); await page.locator("#modal-wage-close").waitFor({ state: "detached" }); assert.equal(writeCount("employees:close-wage-rate"), closedBefore + 1);

    await takeCapture("s07-verified");
    completedScenarios.push("S07");
  } catch (err) { failedScenarios.push(`S07: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S08")) {
  // S08
  try {

    await openEmployee(newEmpCode);
    await page.evaluate(code => {
      window.__queueOriginal = window.appBridge.listPendingFiles; window.__detailOriginal = window.appBridge.getPendingFileDetail;
      window.__queueCalls = 0; window.__mode = "duplicate";
      window.appBridge.listPendingFiles = async () => { window.__queueCalls++; return { ok: true, data: window.__mode === "changed" ? (window.__queueCalls === 1 ? [] : [{ id: "new" }]) : [{ id: "a" }, { id: "b" }] }; };
      window.appBridge.getPendingFileDetail = async id => ({ ok: true, data: { id, errorMessage: window.__mode === "error" ? "읽기 오류" : undefined, entries: [{ id: "same", logicalKey: "same-work", employeeCode: code, employeeName: "검증", status: "pending", section: "overtime", workType: "overtime", workDate: "2026-10-27" }] } });
    }, newEmpCode);
    await submitWage(15100, "2026-10-27"); await page.locator("#impact-count-label").waitFor(); assert.match(await page.locator("#impact-count-label").innerText(), /1건/); await closeImpact();
    for (const mode of ["error"]) { await page.evaluate(mode => { window.__mode = mode; window.__queueCalls = 0; }, mode); await submitWage(mode === "error" ? 15200 : 15300, "2026-10-27"); await page.locator("#btn-retry-impact").waitFor(); assert.equal(await page.locator("#impact-count-label").count(), 0); await closeImpact(); }
    await page.evaluate(() => { window.appBridge.listPendingFiles = () => new Promise(resolve => { window.__releaseQueue = resolve; }); window.__detailCalls = 0; window.appBridge.getPendingFileDetail = async () => { window.__detailCalls++; return { ok: true, data: { entries: [] } }; }; });
    await submitWage(15400, "2026-10-27"); await page.waitForFunction(() => Boolean(window.__releaseQueue)); await closeImpact();
    await page.evaluate(() => window.__releaseQueue({ ok: true, data: [{ id: "late" }] })); await flush(); assert.equal(await page.evaluate(() => window.__detailCalls), 0);
    await page.evaluate(() => { window.appBridge.listPendingFiles = window.__queueOriginal; window.appBridge.getPendingFileDetail = window.__detailOriginal; });

    await takeCapture("s08-verified");
    completedScenarios.push("S08");
  } catch (err) { failedScenarios.push(`S08: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S09")) {
  // S09
  try {

    await openEmployee("EMP-001"); await page.locator("#btn-open-e4").click(); await page.locator("#modal-e4-shift-group option[value]:not([value=''])").first().waitFor({ state: "attached" });
    await page.locator("#modal-e4-start").fill(""); await page.locator("#btn-submit-e4").click(); assert.equal(await page.locator("#err-e4-start").isVisible(), true);
    await page.locator("#modal-e4-start").fill("2026-10-27");
    await page.evaluate(() => { window.__assignOriginal = window.appBridge.saveEmployeeAssignment; window.appBridge.saveEmployeeAssignment = async () => ({ ok: false, message: "조 정원을 초과할 수 없습니다." }); });
    await page.locator("#btn-submit-e4").click(); await page.waitForFunction(() => document.querySelector("#e4-global-error")?.textContent.includes("정원")); expectedRejections.N05 = true;
    await page.evaluate(() => { window.appBridge.saveEmployeeAssignment = window.__assignOriginal; });
    const group = await page.locator("#modal-e4-shift-group").inputValue(); assert.ok(group); await page.locator("#btn-submit-e4").click(); await page.locator("#modal-e4").waitFor({ state: "detached" });
    const employee = await employeeByCode("EMP-001"); assert.equal(employee.currentShiftGroup, group);
    await page.locator("#btn-close-assignment").click(); await page.locator("#modal-close-assign-date").fill(""); await page.locator("#btn-confirm-close-assign").click(); assert.equal(await page.locator("#err-close-assign-date").isVisible(), true); await page.keyboard.press("Escape");

    await takeCapture("s09-verified");
    completedScenarios.push("S09");
  } catch (err) { failedScenarios.push(`S09: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S10")) {
  // S10
  try {

    const template = ok(await api("listShiftPatterns"))[0]; assert.ok(template);
    const site = ok(await api("saveSite", { siteCode: "SOL-ORDER", name: "순서 검증 근무지", status: "active", timezone: "Asia/Seoul" }));
    ok(await api("saveShiftPattern", { ...template, id: undefined, siteId: site.id, name: "순서 검증 패턴", effectiveFrom: "2026-01-01", teamCapacities: [{ teamLabel: "A조", maxHeadcount: 10 }] }));
    const team = [];
    for (let i = 0; i < 3; i++) team.push(ok(await api("saveEmployee", { employeeCode: `SOL-ORDER-${i}`, name: `순서 검증 ${i}`, employmentType: "정규", rank: "사원", status: "active", hireDate: "2026-01-01", siteId: site.id, shiftGroup: "A조" })));
    await openEmployee(team[0].employeeCode); await page.locator("#btn-open-e5").click(); await page.locator(".btn-reorder-down").nth(2).waitFor();
    assert.equal(await page.locator(".btn-reorder-up").first().isDisabled(), true); assert.equal(await page.locator(".btn-reorder-down").last().isDisabled(), true); expectedRejections.N06 = true;
    await page.locator(`.btn-reorder-down[data-id="${team[1].id}"]`).click();
    await page.waitForFunction(id => [...document.querySelectorAll(".btn-reorder-down")].at(-1)?.getAttribute("data-id") === id, team[1].id);
    const ordered = ok(await api("listEmployees", { siteId: site.id, status: "active" })).sort((a,b) => a.currentAssignmentOrder-b.currentAssignmentOrder); assert.deepEqual(ordered.map(e => e.id), [team[0].id, team[2].id, team[1].id]);
    assert.equal(await page.locator(".btn-reorder-up").first().isDisabled(), true); await page.keyboard.press("Escape");

    await takeCapture("s10-verified");
    completedScenarios.push("S10");
  } catch (err) { failedScenarios.push(`S10: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S11")) {
  // S11
  try {
    const bulkBtn = page.locator("#btn-open-e6");
    await bulkBtn.click();
    await page.waitForSelector("#modal-e6", { timeout: 5000 });
    await page.locator("#modal-e6-file-path").fill(excelSamplePath);
    await page.locator("#btn-e6-preview").click();
    await page.waitForSelector("#table-e6-preview tbody tr", { timeout: 10000 });
    const previewSummary = await page.locator("#e6-preview-summary").textContent();
    if (!previewSummary.includes("적용 가능")) throw new Error("미리보기 요약 미표시");
    await page.locator("#btn-submit-e6").click();
    await page.waitForSelector("#modal-e6-confirm", { timeout: 5000 });
    await page.locator("#btn-cancel-e6-confirm").click();
    await page.waitForSelector("#modal-e6-confirm", { state: "detached", timeout: 5000 });
    expectedRejections.N08 = true;

    await bulkBtn.click();
    await page.waitForSelector("#modal-e6", { timeout: 5000 });
    await page.locator("#modal-e6-file-path").fill(excelSamplePath);
    await page.locator("#btn-e6-preview").click();
    await page.waitForSelector("#table-e6-preview tbody tr", { timeout: 10000 });
    await page.locator("#btn-submit-e6").click();
    await page.waitForSelector("#modal-e6-confirm", { timeout: 5000 });
    await page.locator("#btn-confirm-e6-apply").click();
    await page.waitForSelector("#modal-e6-summary", { timeout: 10000 });
    await page.locator("#btn-close-e6-summary").click();
    await page.waitForSelector("#modal-e6-summary", { state: "detached", timeout: 5000 });
    await takeCapture("s11-bulk-apply");
    assert.equal((await employeeByCode("EMP-014")).currentHourlyRate, 15500);
    completedScenarios.push("S11");
  } catch (err) { failedScenarios.push(`S11: ${err.message}`); }
  }
  if (selectedScenarios.includes("S12")) {
  // S12
  try {

    await page.locator("#btn-open-e6").click(); await page.locator("#modal-e6-file-path").fill(excelSamplePath); await page.locator("#btn-e6-preview").click(); await page.locator("#table-e6-preview tbody tr").first().waitFor();
    for (const [id, value] of [["#modal-e6-effective-from", "2026-11-01"], ["#modal-e6-col-rate", "D"], ["#modal-e6-file-path", excelSamplePath + ".missing"]]) { await page.locator(id).fill(value); assert.equal(await page.locator("#e6-submit-desc").isVisible(), true); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true); }
    expectedRejections.N07 = true;
    await page.evaluate(() => { window.__previewOriginal = window.appBridge.previewWorkforceWageBulkUpdate; window.appBridge.previewWorkforceWageBulkUpdate = input => new Promise(resolve => { window.__releasePreview = () => resolve({ ok: true, data: { filePath: input.filePath, totalRows: 1, readyCount: 1, skippedCount: 0, rows: [] } }); }); });
    await page.locator("#btn-e6-preview").click(); await page.waitForFunction(() => Boolean(window.__releasePreview)); await page.locator("#modal-e6-col-rate").fill("E"); await page.evaluate(() => window.__releasePreview()); await flush(); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true);
    await page.evaluate(() => { window.appBridge.previewWorkforceWageBulkUpdate = window.__previewOriginal; }); await page.keyboard.press("Escape");

    await takeCapture("s12-verified");
    completedScenarios.push("S12");
  } catch (err) { failedScenarios.push(`S12: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S13")) {
  // S13
  try {

    await openEmployee(newEmpCode); assert.equal(await page.locator("#btn-delete-employee").isDisabled(), true);
    const employee = await employeeByCode(newEmpCode);
    ok(await api("saveEmployee", { id: employee.id, employeeCode: employee.employeeCode, name: employee.name, rank: employee.rank, employmentType: employee.employmentType, hireDate: employee.hireDate, status: "retired", retireDate: "2026-10-27" }));
    await openEmployee(newEmpCode); await page.locator("#filter-status-select").selectOption("all"); assert.equal(await page.locator("#btn-delete-employee").isDisabled(), true);
    ok(await api("saveEmployee", { id: employee.id, employeeCode: employee.employeeCode, name: employee.name, rank: employee.rank, employmentType: employee.employmentType, hireDate: employee.hireDate, status: "retired", retireDate: "2026-10-26" }));
    await openEmployee(newEmpCode); await page.locator("#filter-status-select").selectOption("all"); await page.locator(`tr[data-employee-code="${newEmpCode}"]`).click(); await page.locator("#btn-delete-employee").click(); const before = writeCount("employees:delete"); await page.keyboard.press("Escape"); assert.equal(writeCount("employees:delete"), before);
    await page.locator("#btn-delete-employee").click(); await page.locator("#btn-confirm-delete").click(); await page.locator("#modal-delete-confirm").waitFor({ state: "detached" }); assert.equal(writeCount("employees:delete"), before + 1); assert.equal((await employeeByCode(newEmpCode)), undefined); expectedRejections.N09 = true;

    await takeCapture("s13-verified");
    completedScenarios.push("S13");
  } catch (err) { failedScenarios.push(`S13: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S14")) {
  // S14
  try {

    for (const id of [operatorId, reviewerId]) {
      await performLogout(); await performLogin(id, subPw); await openEmployee("EMP-001");
      for (const selector of ["#btn-e1-new", "#btn-edit-employee", "#btn-open-e3", "#btn-open-e4", "#btn-delete-employee"]) assert.equal(await page.locator(selector).isDisabled(), true, selector);
      await page.locator("#btn-open-e6").click(); await page.locator("#modal-e6-file-path").fill(excelSamplePath); await page.locator("#btn-e6-preview").click(); await page.locator("#table-e6-preview tbody tr").first().waitFor(); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true); assert.equal(await page.locator("#btn-e6-select-file").isDisabled(), true); await page.keyboard.press("Escape");
      const rejected = await api("saveEmployee", { employeeCode: "DENIED", name: "거절", status: "active", employmentType: "정규", hireDate: "2026-01-01" }); assert.equal(rejected.ok, false); assert.match(rejected.errorCode || rejected.code, /FORBIDDEN/); assert.equal(await page.getByRole("button", { name: "활동 이력", exact: true }).count(), 0);
    }
    expectedRejections.N10 = true;
    await performLogout(); await performLogin(plannerId, subPw); await openEmployee("EMP-001"); assert.equal(await page.locator("#btn-e1-new").isEnabled(), true);
    await page.locator("#btn-open-e6").click(); assert.equal(await page.locator("#btn-e6-select-file").isDisabled(), true); await page.locator("#modal-e6-file-path").fill(excelSamplePath + ".missing"); await page.locator("#btn-e6-preview").click(); await page.locator("#e6-global-error").waitFor({ state: "visible" }); await page.waitForFunction(() => document.querySelector("#btn-e6-preview").disabled === false); assert.equal(await page.locator("#btn-e6-select-file").isDisabled(), true); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true); await page.keyboard.press("Escape");
    await performLogout(); await performLogin(adminCreds.loginId, adminPw);

    await takeCapture("s14-verified");
    completedScenarios.push("S14");
  } catch (err) { failedScenarios.push(`S14: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S15")) {
  // S15
  try {

    await page.evaluate(() => { const original = window.appBridge.listEmployees; window.appBridge.listEmployees = async (...args) => { window.appBridge.listEmployees = original; return { ok: false, errorCode: "NETWORK_ERROR", message: "시험용 목록 조회 실패" }; }; });
    await page.getByRole("button", { name: "인력 관리", exact: true }).click(); await page.locator("#btn-workforce-retry").click(); await page.locator("tr.workforce-row").first().waitFor();
    const employees = ok(await api("listEmployees")).filter(e => e.status === "active"); assert.ok(employees.length >= 2);
    await page.evaluate(id => { window.__ratesOriginal = window.appBridge.listEmployeeWageRates; window.appBridge.listEmployeeWageRates = employeeId => employeeId === id ? new Promise(resolve => { window.__releaseRates = resolve; }) : window.__ratesOriginal(employeeId); }, employees[0].id);
    await page.locator("#filter-keyword-input").fill(""); await page.locator(`tr[data-id="${employees[0].id}"]`).click(); await page.waitForFunction(() => Boolean(window.__releaseRates)); await page.locator(`tr[data-id="${employees[1].id}"]`).click();
    await page.waitForFunction(code => document.querySelector("#e2-detail-title")?.textContent.includes(code), employees[1].employeeCode); await page.evaluate(() => window.__releaseRates({ ok: true, data: [] })); await flush(); assert.match(await page.locator("#e2-detail-title").innerText(), new RegExp(employees[1].employeeCode));
    await page.evaluate(() => { window.appBridge.listEmployeeWageRates = async () => ({ ok: false, message: "시험용 상세 오류" }); }); await page.locator(`tr[data-id="${employees[1].id}"]`).click(); await page.locator("#btn-detail-retry").waitFor(); await page.evaluate(() => { window.appBridge.listEmployeeWageRates = window.__ratesOriginal; }); await page.locator("#btn-detail-retry").click(); await page.locator("#btn-detail-retry").waitFor({ state: "detached" }); expectedRejections.N11 = true;

    await takeCapture("s15-verified");
    completedScenarios.push("S15");
  } catch (err) { failedScenarios.push(`S15: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S16")) {
  // S16
  try {

    const payload = `XSS" /><b id="injected-tag">PWN</b>`, code = "SOL-XSS";
    ok(await api("saveEmployee", { employeeCode: code, name: payload, status: "active", hireDate: "2026-01-01", employmentType: "정규", rank: "사원", hourlyRate: 12345 }));
    await page.setViewportSize({ width: 1024, height: 768 }); await openEmployee(code); await takeCapture("s16-accessibility-1024");
    assert.equal(await page.locator("#injected-tag").count(), 0); await page.locator("#btn-edit-employee").click(); assert.equal(await page.locator("#edit-name").inputValue(), payload); assert.equal(await page.locator("#injected-tag").count(), 0); await trapAndClose("#modal-edit-employee");
    await page.locator("#btn-open-e3").click(); await trapAndClose("#modal-e3"); await page.locator("#btn-e1-new").click(); await trapAndClose("#modal-e8"); await page.locator("#btn-open-e6").click(); await trapAndClose("#modal-e6");
    await openEmployee("EMP-001"); await page.locator("#btn-open-e4").click(); await trapAndClose("#modal-e4"); await page.locator("#btn-open-e5").click(); await trapAndClose("#modal-e5");
    await page.setViewportSize({ width: 1440, height: 900 }); await openEmployee("EMP-001"); const boxes = await page.evaluate(() => ({ table: document.querySelector("#workforce-table-area").getBoundingClientRect().toJSON(), detail: document.querySelector("#workforce-detail-area").getBoundingClientRect().toJSON() })); assert.ok(boxes.detail.x >= boxes.table.right); assert.ok(Math.abs(boxes.detail.y - boxes.table.y) < 2);
    await page.locator(".btn-close-wage").first().click(); assert.match(await page.locator("#modal-wage-close").innerText(), /기존 시급을 먼저 종료할 필요 없이/); assert.match(await page.locator("#modal-wage-close").innerText(), /퇴사일/); await trapAndClose("#modal-wage-close"); expectedRejections.N12 = true;

    await takeCapture("s16-verified");
    completedScenarios.push("S16");
  } catch (err) { failedScenarios.push(`S16: ${err.stack || err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S17")) {
  // S17
  try {

    await openEmployee("EMP-001");
    await page.evaluate(() => {
      const original = window.appBridge.saveEmployeeWageRate; window.__saveWageOriginal = original;
      window.appBridge.saveEmployeeWageRate = async input => { const saved = await original(input); return new Promise(resolve => { window.__releaseOldSave = () => resolve(saved); }); };
    });
    await page.locator("#btn-open-e3").click(); await page.locator("#modal-e3-rate").fill("15501"); await page.locator("#modal-e3-from").fill("2026-11-20"); await page.locator("#btn-submit-e3").click(); await page.waitForFunction(() => Boolean(window.__releaseOldSave));
    expectSession401 = true;
    await api("signOut");
    await page.evaluate(() => { [...document.querySelectorAll("button.nav-item")].find(b => b.querySelector(".nav-label")?.textContent === "홈").click(); [...document.querySelectorAll("button.nav-item")].find(b => b.querySelector(".nav-label")?.textContent === "인력 관리").click(); });
    await page.locator("#login-id").waitFor();
    await page.evaluate(() => { window.appBridge.saveEmployeeWageRate = window.__saveWageOriginal; });
    await page.locator("#login-id").fill(adminCreds.loginId); await page.locator("#login-password").fill(adminPw); await page.locator(".login-form button[type=submit]").click(); await page.locator(".btn-logout").waitFor();
    const before = writes.length; await page.evaluate(() => window.__releaseOldSave()); await flush(); assert.equal(await page.locator("#login-id").count(), 0); assert.equal(await page.locator(".workforce-modal-overlay").count(), 0); assert.equal(writes.length, before); expectSession401 = false;

    await takeCapture("s17-verified");
    completedScenarios.push("S17");
  } catch (err) { failedScenarios.push(`S17: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S18")) {
  // S18
  try {

    await performLogout(); await page.locator("#login-id").waitFor(); adminPw = await performLogin(adminCreds.loginId, adminPw); assert.equal(await page.locator(".btn-logout").isVisible(), true);

    await takeCapture("s18-verified");
    completedScenarios.push("S18");
  } catch (err) { failedScenarios.push(`S18: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S19")) {
  // S19
  try {

    for (const menu of ["인력 관리", "홈", "활동 이력", "인력 관리"]) { await page.getByRole("button", { name: menu, exact: true }).click(); await page.waitForFunction(name => document.querySelector("#header-current-title")?.textContent === name, menu); }
    const sidebar = page.locator(".sidebar"); const collapsed = await sidebar.evaluate(el => el.classList.contains("collapsed")); await page.getByRole("button", { name: "사이드바 접기/펼치기" }).click(); assert.equal(await sidebar.evaluate(el => el.classList.contains("collapsed")), !collapsed); await page.getByRole("button", { name: "사이드바 접기/펼치기" }).click();

    await takeCapture("s19-verified");
    completedScenarios.push("S19");
  } catch (err) { failedScenarios.push(`S19: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S20")) {
  // S20
  try {

    await page.getByRole("button", { name: "홈", exact: true }).click(); await page.locator(".footer-statusbar").waitFor(); await page.waitForFunction(() => document.querySelector("#sb-sync")?.textContent.includes("완료") || document.querySelector("#sb-sync")?.textContent.includes("처리 이력 없음"));
    await page.locator("#card-progress-prep").waitFor();
    await page.locator("#section-performance-kpi").waitFor();
    if (await page.locator("#section-empty-todos").count()) assert.equal(await page.locator("#main-content button").count(), 0);
    else await page.locator("#section-todo-list").waitFor(); assert.ok((await page.locator("#main-content").innerText()).length > 50); assert.equal((await api("listEmployees")).ok, true);

    await takeCapture("s20-verified");
    completedScenarios.push("S20");
  } catch (err) { failedScenarios.push(`S20: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S21")) {
  // S21
  try {

    await page.getByRole("button", { name: "활동 이력", exact: true }).click(); await page.locator("#table-access-logs").waitFor(); await page.waitForFunction(() => document.querySelector("#btn-refresh-logs")?.disabled === false);
    await page.locator("#btn-refresh-logs").click(); await page.waitForFunction(() => document.querySelector("#btn-refresh-logs")?.disabled === false);
    const text = await page.locator("#main-content").innerText(); assert.match(text, /인력|시급/);

    await takeCapture("s21-verified");
    completedScenarios.push("S21");
  } catch (err) { failedScenarios.push(`S21: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  for (const id of selectedScenarios) if (completedScenarios.filter(x => x === id).length !== 1) failedScenarios.push(`${id}: scenario not completed exactly once`);
  if (!focus) for (const [id, passed] of Object.entries(expectedRejections)) if (passed !== true) failedScenarios.push(`${id}: expected rejection not verified`);
  const isAllPassed = failedScenarios.length === 0 && unexpectedErrors.length === 0;
  const status = isAllPassed ? (focus ? "FOCUSED_PASS" : "PASS") : "FAIL";

  const resultData = {
    status,
    planned: selectedScenarios, focused: Boolean(focus),
    completed: completedScenarios,
    failed: failedScenarios,
    captures,
    unexpectedErrors,
    expectedRejections, expectedHttpRejections
  };

  const resultJsonPath = path.join(outDir, "result.json");
  fs.writeFileSync(resultJsonPath, evidenceJSON(resultData, null, 2), "utf8");

  process.stdout.write(`\n[UI-01 RESULT] status: ${status}, completed: ${completedScenarios.length}/${plannedScenarios.length}, failed: ${failedScenarios.length}\n`);
  process.stdout.write(`[UI-01 RESULT JSON] ${resultJsonPath}\n`);

  await cleanup();

  if (!isAllPassed) {
    process.stderr.write(`[UI-01 FAILED SCENARIOS] ${evidenceJSON(failedScenarios)}\n`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  process.stderr.write(`[FATAL] ${redactText(err.stack || err.message)}\n`);
  await cleanup();
  process.exit(1);
});
