import assert from "node:assert/strict";
import { artifactRegistry, evidenceJSON, redactText, seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
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
const w01Evidence = {};
const w02Evidence = {};
const w03Evidence = {};
const w04Evidence = {};
const w08Evidence = {};
const w09Evidence = {};
const w10Evidence = {};

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
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type).value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  });
  const relativeDate = days => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const tomorrow = relativeDate(1), yesterday = relativeDate(-1);
  const waitForBulkInitialFocus = () => page.waitForFunction(() => document.activeElement?.id === "modal-e6-file-path");
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
    await page.waitForFunction(() => document.activeElement?.id === "edit-name");
    w03Evidence.editModalReady = { initialFocus: "edit-name", awaitedBeforeInput: true };

    const initialEmployee = await employeeByCode(newEmpCode);
    const initialWages = ok(await api("listEmployeeWageRates", initialEmployee.id));
    const initialAssignments = ok(await api("listEmployeeAssignments", initialEmployee.id));
    assert.equal(await page.locator("#edit-hire-date").isDisabled(), false);
    assert.equal(await page.locator("#edit-hire-date").getAttribute("type"), "date");
    assert.equal(await page.locator("#edit-hire-date").getAttribute("min"), "1990-01-01");
    assert.ok((await page.locator("#edit-hire-date").getAttribute("max")).startsWith(String(Number(today.slice(0,4))+1)));
    const editWrites = writeCount("employees:save");
    for (const invalidDate of ["", "2062-01-01"]) {
      await page.locator("#edit-hire-date").fill(invalidDate); await page.locator("#btn-submit-edit").click();
      assert.equal(await page.locator("#err-edit-hire-date").isVisible(), true);
      assert.equal(writeCount("employees:save"), editWrites);
    }
    expectedRejections.N03 = true; // W04: invalid changed hire date is blocked; date editing is now supported.
    await page.locator("#edit-hire-date").fill("2026-09-15"); await page.locator("#btn-cancel-edit").click();
    assert.equal((await employeeByCode(newEmpCode)).hireDate, initialEmployee.hireDate);
    await page.locator("#btn-edit-employee").click(); await page.waitForFunction(() => document.activeElement?.id === "edit-name");
    await page.locator("#edit-hire-date").fill("2026-09-15");

    assert.equal(await page.locator("#edit-email").inputValue(), "created@example.invalid");
    await page.locator("#edit-contact").fill("010-9999-8888");
    assert.equal(await page.locator("#edit-contact").inputValue(), "010-9999-8888");
    await page.locator("#edit-email").fill("edited@example.invalid");
    await page.locator("#btn-submit-edit").click();
    await page.waitForSelector("#modal-edit-employee", { state: "detached", timeout: 5000 });

    await sleep(500);
    const emailEdited = await employeeByCode(newEmpCode);
    assert.equal(emailEdited.email, "edited@example.invalid"); assert.equal(emailEdited.contact, "010-9999-8888");
    assert.equal(emailEdited.hireDate, "2026-09-15");
    assert.deepEqual(ok(await api("listEmployeeWageRates", initialEmployee.id)), initialWages);
    assert.deepEqual(ok(await api("listEmployeeAssignments", initialEmployee.id)), initialAssignments);
    await openEmployee(newEmpCode);
    assert.ok((await page.locator(`tr[data-employee-code="${newEmpCode}"]`).innerText()).includes("2026-09-15"));
    assert.ok((await page.locator(".workforce-detail-sub").first().innerText()).includes("2026-09-15"));
    await page.locator("#btn-edit-employee").click(); await page.waitForFunction(() => document.activeElement?.id === "edit-name");
    assert.equal(await page.locator("#edit-hire-date").inputValue(), "2026-09-15");
    await page.keyboard.press("Escape");
    const legacy = ok(await api("saveEmployee", { employeeCode: "W04-LEGACY", name: "입사일 원문 보존", employmentType: "정규", status: "active", hireDate: " 2020-01-01 " }));
    await openEmployee(legacy.employeeCode); await page.locator("#btn-edit-employee").click(); await page.waitForFunction(() => document.activeElement?.id === "edit-name");
    assert.equal(await page.locator("#edit-hire-date").inputValue(), "");
    assert.match(await page.locator("#hint-edit-hire-date").innerText(), /기존 값은 유지/);
    await page.locator("#edit-contact").fill("010-2222-3333"); await page.locator("#btn-submit-edit").click();
    await page.locator("#modal-edit-employee").waitFor({ state: "detached" });
    assert.equal((await employeeByCode(legacy.employeeCode)).hireDate, " 2020-01-01 ");
    await openEmployee(newEmpCode);
    w04Evidence.edit = { original: initialEmployee.hireDate, corrected: "2026-09-15", invalidDatesBlockedBeforeApi: true, cancelPreserved: true, reopenListDetailAgree: true, wageAndAssignmentSnapshotsUnchanged: true, legacyUnchangedValuePreserved: true };
    await takeCapture("s05-edit-employee");
    completedScenarios.push("S05");
  } catch (err) { failedScenarios.push(`S05: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S06")) {
  // S06
  try {

    const employee = await employeeByCode(newEmpCode); assert.ok(employee);
    ok(await api("saveEmployeeWageRate", { employeeId: employee.id, hourlyRate: 14000, effectiveFrom: today, reason: "정정 전 사유 <strong>원문</strong>" }));
    ok(await api("saveEmployeeWageRate", { employeeId: employee.id, hourlyRate: 20000, effectiveFrom: tomorrow }));
    await openEmployee(newEmpCode);
    await page.waitForFunction(() => document.querySelector("#e2-current-rate")?.textContent.includes("14,000"));
    assert.match(await page.locator("#e2-scheduled-rate").innerText(), /20,000/);
    const currentCell = page.locator(`tr[data-employee-code="${newEmpCode}"] .employee-current-wage`);
    assert.match(await currentCell.innerText(), /14,000/); assert.doesNotMatch(await currentCell.innerText(), /20,000/);
    assert.ok((await currentCell.innerText()).includes(`${today}부터`));
    assert.equal(await currentCell.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, "Current amount and full effective date must fit their cell");
    assert.ok((await page.locator("#e2-current-rate-period").innerText()).includes(today));
    const currentEmployee = await employeeByCode(newEmpCode);
    assert.equal(currentEmployee.currentHourlyRate, 14000);
    assert.equal(currentEmployee.currentHourlyRateEffectiveFrom, today);
    assert.equal(currentEmployee.currentHourlyRateEffectiveTo, today);
    assert.equal(currentEmployee.currentHourlyRateAsOfDate, today);
    await page.evaluate(() => { window.__wageOriginal = window.appBridge.listEmployeeWageRates; window.appBridge.listEmployeeWageRates = async () => ({ ok: true, data: [] }); });
    await page.locator(`tr[data-employee-code="${newEmpCode}"]`).click(); await page.waitForFunction(() => document.querySelector("#e2-current-rate")?.textContent === "적용 중인 시급 없음");
    await page.evaluate(() => { window.appBridge.listEmployeeWageRates = window.__wageOriginal; }); await openEmployee(newEmpCode);

    const site = ok(await api("listSites")).find(s => s.name === "보라매DC");
    const edgeChecks = [];
    for (const mode of ["future", "expired", "missing", "ending"]) {
      const code = `W03-${mode.toUpperCase()}`;
      const target = ok(await api("saveEmployee", { employeeCode: code, name: `시급경계 ${mode}`, employmentType: "정규", rank: "사원", status: "active", hireDate: "2020-01-01", siteId: site.id, shiftGroup: "A조" }));
      if (mode !== "missing") {
        const rate = ok(await api("saveEmployeeWageRate", { employeeId: target.id, hourlyRate: mode === "future" ? 18000 : 14200, effectiveFrom: mode === "future" ? tomorrow : relativeDate(-7), reason: "현재 시급 경계 검문" }));
        if (mode !== "future") ok(await api("closeEmployeeWageRate", { wageRateId: rate.id, effectiveTo: mode === "expired" ? yesterday : today }));
      }
      await openEmployee(code);
      const cell = page.locator(`tr[data-employee-code="${code}"] .employee-current-wage`);
      if (mode === "ending") {
        assert.match(await cell.innerText(), /14,200/); assert.match(await page.locator("#e2-current-rate").innerText(), /14,200/);
        assert.ok((await page.locator("#e2-current-rate-period").innerText()).includes(today));
      } else {
        assert.equal(await cell.innerText(), "적용 중인 시급 없음");
        assert.equal(await page.locator("#e2-current-rate").innerText(), "적용 중인 시급 없음");
        assert.equal(await page.locator("#e2-current-rate-period").count(), 0);
      }
      if (mode === "future") { assert.match(await page.locator("#e2-scheduled-rate").innerText(), /18,000/); assert.ok((await page.locator("#e2-scheduled-rate").innerText()).includes(tomorrow)); }
      else assert.equal(await page.locator("#e2-scheduled-rate").count(), 0);
      edgeChecks.push({ mode, listAndDetailAgree: true });
    }
    const guard = ok(await api("saveEmployee", { employeeCode: "W03-DATE-GUARD", name: "날짜 기준 분리", employmentType: "정규", rank: "사원", status: "retired", retireDate: today, hireDate: "2020-01-01" }));
    // Reader-only as-of transition; actual server midnight selection is covered by frozen-clock storage tests.
    await page.evaluate(({ code, guardCode, tomorrow }) => {
      window.__w03ListOriginal = window.appBridge.listEmployees;
      window.appBridge.listEmployees = async (...args) => {
        const result = await window.__w03ListOriginal(...args);
        return result.ok ? { ...result, data: result.data.map(e => e.employeeCode === code ? { ...e, currentHourlyRate: 20000, currentHourlyRateEffectiveFrom: tomorrow, currentHourlyRateEffectiveTo: undefined, currentHourlyRateAsOfDate: tomorrow } : e.employeeCode === guardCode ? { ...e, currentHourlyRateAsOfDate: tomorrow } : e) } : result;
      };
    }, { code: newEmpCode, guardCode: guard.employeeCode, tomorrow });
    try {
      await openEmployee(guard.employeeCode); assert.equal(await page.locator("#btn-delete-employee").isDisabled(), true);
      await openEmployee(newEmpCode);
      await page.waitForFunction(() => document.querySelector("#e2-current-rate")?.textContent.includes("20,000"));
      assert.ok((await page.locator("#e2-current-rate").locator("..").innerText()).includes(tomorrow));
      assert.ok((await page.locator("#e2-current-rate-period").innerText()).includes(tomorrow));
    } finally { await page.evaluate(() => { window.appBridge.listEmployees = window.__w03ListOriginal; }); }
    await openEmployee(newEmpCode); await page.waitForFunction(() => document.querySelector("#e2-current-rate")?.textContent.includes("14,000"));
    assert.ok((await page.locator("#e2-current-rate").locator("..").innerText()).includes(today));
    w03Evidence.current = { current: 14000, future: 20000, asOf: today, effectiveFrom: today, effectiveTo: today, listAndDetailAgree: true, fullEffectiveDateFitsCell: true, edgeChecks, asOfRerenderOnSamePanel: true, asOfReaderTimingControlled: true, wageAsOfDoesNotChangeDeletionDay: true, actualServerMidnightCoveredByUnit: true };

    await takeCapture("s06-verified");
    completedScenarios.push("S06");
  } catch (err) { failedScenarios.push(`S06: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S07")) {
  // S07
  try {

    const priorEmployee = await employeeByCode(newEmpCode);
    const priorSameDateRate = ok(await api("listEmployeeWageRates", priorEmployee.id)).find(r => r.effectiveFrom === today);
    assert.ok(priorSameDateRate, "S07 same-date correction requires S06 today wage fixture");
    await openEmployee(newEmpCode); assert.equal(await page.locator("#btn-open-e3").isEnabled(), true);
    await page.locator("#btn-open-e3").click(); await page.locator("#modal-e3-rate").fill("0");
    await page.locator("#btn-submit-e3").click(); assert.equal(await page.locator("#err-e3-rate").isVisible(), true);
    await page.locator("#modal-e3-rate").fill("14100"); await page.locator("#btn-submit-e3").click(); assert.equal(await page.locator("#err-e3-from").isVisible(), true);
    expectedRejections.N01 = true;
    const before = writeCount("employees:save-wage-rate"); await page.locator("#modal-e3-from").fill(today); await page.locator("#btn-submit-e3").click();
    await page.locator("#modal-wage-confirm").waitFor(); assert.equal(writeCount("employees:save-wage-rate"), before);
    assert.match(await page.locator("#modal-wage-confirm").innerText(), /이전 금액·사유.*정정 이력에 보관/);
    assert.doesNotMatch(await page.locator("#modal-wage-confirm").innerText(), /보관되지|미보관/);
    await page.locator("#btn-cancel-wage-confirm").click(); await page.locator("#modal-e3").waitFor(); assert.equal(writeCount("employees:save-wage-rate"), before);
    expectedRejections.N04 = true;
    await page.locator("#modal-e3-rate").fill("14100"); await page.locator("#modal-e3-from").fill(today); await page.locator("#btn-submit-e3").click(); await page.locator("#btn-confirm-wage-save").click();
    await page.locator("#impact-count-label").waitFor(); assert.match(await page.locator("#wage-pending-refresh-result").innerText(), /다시 읽기 완료/); assert.equal(writeCount("employees:save-wage-rate"), before + 1); await closeImpact();
    const employee = await employeeByCode(newEmpCode); assert.equal(ok(await api("listEmployeeWageRates", employee.id)).find(r => r.effectiveFrom === today).hourlyRate, 14100);
    const correction = ok(await api("listEmployeeWageRates", employee.id)).find(r => r.effectiveFrom === today).history[0];
    assert.equal(ok(await api("listEmployeeWageRates", employee.id)).find(r => r.effectiveFrom === today).id, priorSameDateRate.id);
    assert.equal(correction.hourlyRate, 14000); assert.equal(correction.reason, "정정 전 사유 <strong>원문</strong>");
    assert.equal(correction.actorLoginId, "admin"); assert.equal(correction.actorRole, "admin"); assert.ok(Number.isFinite(Date.parse(correction.occurredAt)));
    await openEmployee(newEmpCode); await page.locator("#e2-wage-corrections summary").click();
    const correctionTable = page.locator("#e2-wage-correction-history");
    await correctionTable.scrollIntoViewIfNeeded();
    assert.match(await correctionTable.innerText(), /14,000/); assert.match(await correctionTable.innerText(), /정정 전 사유 <strong>원문<\/strong>/);
    assert.equal(await correctionTable.locator("strong").count(), 1); // Only the amount uses markup; saved reason remains text.
    assert.match(await correctionTable.innerText(), /admin/);
    await takeCapture("w02-single-correction-history");
    w02Evidence.single = { priorRate: correction.hourlyRate, priorReason: correction.reason, currentRate: 14100, actor: correction.actorLoginId, occurredAt: correction.occurredAt, currentIdPreserved: true, literalReasonRenderedSafely: true };
    await page.locator(".btn-close-wage").first().click(); await page.locator("#modal-close-wage-to").fill("2020-01-01"); await page.locator("#btn-submit-close-wage").click(); assert.equal(await page.locator("#err-close-wage-to").isVisible(), true);
    await page.locator("#modal-close-wage-to").fill(tomorrow); const closedBefore = writeCount("employees:close-wage-rate"); await page.locator("#btn-submit-close-wage").click(); await page.locator("#modal-wage-close").waitFor({ state: "detached" }); assert.equal(writeCount("employees:close-wage-rate"), closedBefore + 1);

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
    await bulkBtn.click(); await waitForBulkInitialFocus();
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

    await bulkBtn.click(); await waitForBulkInitialFocus();
    await page.waitForSelector("#modal-e6", { timeout: 5000 });
    await page.locator("#modal-e6-file-path").fill(excelSamplePath);
    await page.locator("#btn-e6-preview").click();
    await page.waitForSelector("#table-e6-preview tbody tr", { timeout: 10000 });
    await page.locator("#btn-submit-e6").click();
    await page.waitForSelector("#modal-e6-confirm", { timeout: 5000 });
    await page.locator("#btn-confirm-e6-apply").click();
    await page.waitForSelector("#modal-e6-summary", { timeout: 10000 });
    assert.match(await page.locator("#wage-pending-refresh-result").innerText(), /다시 읽기 완료/);
    await page.locator("#btn-close-e6-summary").click();
    await page.waitForSelector("#modal-e6-summary", { state: "detached", timeout: 5000 });
    await takeCapture("s11-bulk-apply");
    assert.equal((await employeeByCode("EMP-014")).currentHourlyRate, 15500);

    // W-01: actual Excel -> HTTP -> preview/confirmation -> stored wage histories.
    const site = ok(await api("listSites")).find(site => site.name === "보라매DC");
    const add = (employeeCode, name, status = "active") => api("saveEmployee", {
      employeeCode, name, employmentType: "정규", rank: "사원", status,
      hireDate: "2020-01-01", retireDate: status === "retired" ? "2026-02-28" : undefined,
      siteId: site.id, shiftGroup: "A조", hourlyRate: 12000
    }).then(ok);
    const target = await add("00017", "시급동명검사");
    const other = await add("W01-OTHER", "시급동명검사");
    const retired = await add("W01-RETIRED", "시급동명검사", "retired");
    const legacy = await add("W01-LEGACY", "퇴사혼합검사");
    const legacyRetired = await add("W01-LEGACY-RETIRED", "퇴사혼합검사", "retired");
    const untouched = [other, retired, legacyRetired];
    const historiesBefore = await Promise.all(untouched.map(e => api("listEmployeeWageRates", e.id).then(ok)));
    const codePath = path.join(outDir, "w01-codes.xlsx");
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("사번별시급");
    ws.addRow(["근무지", "이름", "시급", "사번"]);
    ws.addRow(["표기가다른근무지", "이름오타", 14111, "00017"]);
    ws.addRow(["보라매DC", other.name, 15111, "없는사번"]);
    ws.addRow(["보라매DC", target.name, 15111, ""]);
    ws.addRow(["보라매DC", retired.name, 15111, retired.employeeCode]);
    ws.addRow(["다른표기", "오타2", 16111, "00017"]);
    ws.addRow(["보라매DC", other.name, 12000, other.employeeCode]);
    ws.addRow(["보라매DC", target.name, "오류", target.employeeCode]);
    await wb.xlsx.writeFile(codePath);
    const previewInput = { filePath: codePath, effectiveFrom: "2026-10-01", mapping: { siteNameColumn: "A", employeeNameColumn: "B", hourlyRateColumn: "C", employeeCodeColumn: "D" } };
    const expectedStatuses = ["ready", "employee-not-found", "missing-required-value", "employee-retired", "duplicate-entry", "same-rate", "invalid-hourly-rate"];
    const actualPreview = ok(await api("previewWorkforceWageBulkUpdate", previewInput));
    assert.deepEqual(actualPreview.rows.map(row => row.status), expectedStatuses);
    assert.equal(actualPreview.rows[0].employeeId, target.id);
    await page.evaluate(() => {
      const original = window.appBridge.previewWorkforceWageBulkUpdate;
      window.appBridge.previewWorkforceWageBulkUpdate = async input => {
        const result = await original(input);
        window.__w01LastPreview = { input, ok: result.ok, message: result.message, rows: result.data?.rows?.map(row => ({ rowNumber: row.rowNumber, status: row.status })) };
        return result;
      };
    });
    await bulkBtn.click(); await waitForBulkInitialFocus();
    await page.locator("#modal-e6-file-path").fill(codePath);
    await page.locator("#modal-e6-effective-from").fill(previewInput.effectiveFrom);
    await page.locator("#modal-e6-col-code").fill("D");
    await page.locator("#btn-e6-preview").click();
    await page.locator("#table-e6-preview tbody tr").nth(6).waitFor();
    assert.match(await page.locator("#table-e6-preview tbody tr").first().innerText(), /00017/);
    assert.match(await page.locator("#e6-preview-summary").innerText(), /적용 가능: 1행, 제외: 6행/);
    await takeCapture("w01-code-preview");
    await page.locator("#btn-submit-e6").click();
    await page.locator("#modal-e6-confirm").waitFor();
    await page.locator("#btn-confirm-e6-apply").click();
    await page.locator("#modal-e6-summary").waitFor();
    await takeCapture("w01-code-applied");
    await page.locator("#btn-close-e6-summary").click();
    assert.equal(ok(await api("listEmployeeWageRates", target.id))[0].hourlyRate, 14111);
    assert.deepEqual(await Promise.all(untouched.map(e => api("listEmployeeWageRates", e.id).then(ok))), historiesBefore);
    const legacyPath = path.join(outDir, "w01-legacy.xlsx");
    const oldWb = new ExcelJS.Workbook(); const oldWs = oldWb.addWorksheet("기존파일");
    oldWs.addRow(["근무지", "이름", "시급"]); oldWs.addRow([site.name, legacy.name, 14222]);
    await oldWb.xlsx.writeFile(legacyPath);
    await bulkBtn.click(); await waitForBulkInitialFocus(); await page.locator("#modal-e6-file-path").fill(legacyPath);
    await page.locator("#modal-e6-effective-from").fill("2026-10-01");
    await page.locator("#btn-e6-preview").click(); await page.locator("#table-e6-preview tbody tr").first().waitFor();
    assert.match(await page.locator("#table-e6-preview tbody tr").first().innerText(), /W01-LEGACY/);
    assert.equal(await page.locator("#btn-submit-e6").isDisabled(), false);
    await page.locator("#btn-submit-e6").click(); await page.locator("#btn-confirm-e6-apply").click();
    await page.locator("#modal-e6-summary").waitFor(); await page.locator("#btn-close-e6-summary").click();
    assert.equal(ok(await api("listEmployeeWageRates", legacy.id))[0].hourlyRate, 14222);
    assert.deepEqual(ok(await api("listEmployeeWageRates", legacyRetired.id)), historiesBefore[2]);
    // W-02: overwrite the same date through the actual bulk UI and inspect its old snapshot.
    ws.getRow(2).getCell(3).value = 14333; await wb.xlsx.writeFile(codePath);
    const previousTargetRate = ok(await api("listEmployeeWageRates", target.id))[0];
    await bulkBtn.click(); await waitForBulkInitialFocus(); await page.locator("#modal-e6-file-path").fill(codePath);
    await page.locator("#modal-e6-effective-from").fill(previewInput.effectiveFrom);
    await page.locator("#modal-e6-col-code").fill("D"); await page.locator("#btn-e6-preview").click();
    await page.locator("#table-e6-preview tbody tr").nth(6).waitFor();
    await page.locator("#btn-submit-e6").click(); await page.locator("#btn-confirm-e6-apply").click();
    await page.locator("#modal-e6-summary").waitFor(); await page.locator("#btn-close-e6-summary").click();
    const correctedTargetRate = ok(await api("listEmployeeWageRates", target.id))[0];
    assert.equal(correctedTargetRate.id, previousTargetRate.id); assert.equal(correctedTargetRate.hourlyRate, 14333);
    assert.equal(correctedTargetRate.history[0].hourlyRate, 14111);
    assert.equal(correctedTargetRate.history[0].reason, previousTargetRate.reason);
    assert.equal(correctedTargetRate.history[0].actorLoginId, "admin");
    assert.deepEqual(await Promise.all(untouched.map(e => api("listEmployeeWageRates", e.id).then(ok))), historiesBefore);
    w02Evidence.bulk = { currentIdPreserved: true, priorRate: 14111, currentRate: 14333, oldReasonPreserved: true, actor: "admin", unrelatedHistoriesUnchanged: 3 };
    w01Evidence.identity = { statuses: expectedStatuses, exactLeadingZeroCode: "00017", targetId: target.id, targetRate: 14111, legacyRate: 14222, untouchedHistories: 3, actualHttpAndUiApply: true };
    completedScenarios.push("S11");
  } catch (err) {
    w01Evidence.failure = await page.evaluate(() => ({
      preview: window.__w01LastPreview,
      modal: document.querySelector('[role="dialog"]')?.id,
      error: document.querySelector("#e6-global-error")?.textContent,
      summary: document.querySelector("#e6-preview-summary")?.textContent,
      codeColumn: document.querySelector("#modal-e6-col-code")?.value,
      rowCount: document.querySelectorAll("#table-e6-preview tbody tr").length,
      previewHidden: document.querySelector("#e6-preview-container")?.className
    }));
    await takeCapture("s11-failure");
    failedScenarios.push(`S11: ${err.message}`); await page.keyboard.press("Escape").catch(() => {});
  }
  }
  if (selectedScenarios.includes("S12")) {
  // S12
  try {

    await page.locator("#btn-open-e6").click(); await waitForBulkInitialFocus(); await page.locator("#modal-e6-file-path").fill(excelSamplePath); await page.locator("#btn-e6-preview").click(); await page.locator("#table-e6-preview tbody tr").first().waitFor();
    for (const [id, value] of [["#modal-e6-effective-from", tomorrow], ["#modal-e6-col-rate", "D"], ["#modal-e6-file-path", excelSamplePath + ".missing"]]) { await page.locator(id).fill(value); assert.equal(await page.locator("#e6-submit-desc").isVisible(), true); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true); }
    expectedRejections.N07 = true;
    await page.evaluate(() => { window.__previewOriginal = window.appBridge.previewWorkforceWageBulkUpdate; window.appBridge.previewWorkforceWageBulkUpdate = input => new Promise(resolve => { window.__releasePreview = () => resolve({ ok: true, data: { filePath: input.filePath, totalRows: 1, readyCount: 1, skippedCount: 0, rows: [] } }); }); });
    for (const [field, value] of [["#modal-e6-col-rate", "E"], ["#modal-e6-col-code", "D"]]) {
      await page.evaluate(() => { delete window.__releasePreview; });
      await page.locator("#btn-e6-preview").click(); await page.waitForFunction(() => Boolean(window.__releasePreview));
      await page.locator(field).fill(value); await page.evaluate(() => window.__releasePreview()); await flush();
      assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true);
    }
    await page.evaluate(() => { window.appBridge.previewWorkforceWageBulkUpdate = window.__previewOriginal; }); await page.keyboard.press("Escape");

    // Each code-column change starts from a fresh, actually applicable preview.
    const employee = await employeeByCode("EMP-001");
    const stalePath = path.join(outDir, "w01-stale.xlsx");
    const staleBook = new ExcelJS.Workbook(); const staleSheet = staleBook.addWorksheet("조건변경");
    staleSheet.addRow(["근무지", "이름", "시급", "사번", "사번복사"]);
    staleSheet.addRow([employee.currentSiteName, employee.name, 18888, employee.employeeCode, employee.employeeCode]);
    await staleBook.xlsx.writeFile(stalePath);
    await page.locator("#btn-open-e6").click(); await waitForBulkInitialFocus(); await page.locator("#modal-e6-file-path").fill(stalePath);
    for (const codeColumn of ["D", "E", ""]) {
      await page.locator("#btn-e6-preview").click();
      await page.locator("#table-e6-preview tbody tr").first().waitFor();
      assert.equal(await page.locator("#btn-submit-e6").isDisabled(), false);
      await page.locator("#modal-e6-col-code").fill(codeColumn);
      assert.equal(await page.locator("#e6-preview-container").isVisible(), false);
      assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true);
    }
    let releaseResponse, responseReady;
    const heldResponse = new Promise(resolve => { releaseResponse = resolve; });
    const actualResponseReady = new Promise(resolve => { responseReady = resolve; });
    const previewRoute = "**/api/employees:preview-wage-bulk-update";
    await page.route(previewRoute, async route => {
      const response = await route.fetch(); responseReady(); await heldResponse;
      await route.fulfill({ response });
    });
    try {
      await page.locator("#btn-e6-preview").click(); await actualResponseReady;
      // A blur/change for the same value must not discard an actual HTTP result.
      await page.locator("#modal-e6-col-code").dispatchEvent("change");
      releaseResponse();
      await page.locator("#table-e6-preview tbody tr").first().waitFor();
      assert.equal(await page.locator("#btn-submit-e6").isDisabled(), false);
    } finally { releaseResponse(); await page.unroute(previewRoute); }
    w01Evidence.stale = { addChangeRemove: true, realReadyPreviewBeforeEach: true, pendingCodeChangeDiscarded: true, identicalCodeChangePreservesActualHttpPreview: true };
    await page.keyboard.press("Escape");

    await takeCapture("s12-verified");
    completedScenarios.push("S12");
  } catch (err) { failedScenarios.push(`S12: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  if (selectedScenarios.includes("S13")) {
  // S13
  try {

    await openEmployee(newEmpCode); assert.equal(await page.locator("#btn-delete-employee").isDisabled(), true);
    const employee = await employeeByCode(newEmpCode);
    ok(await api("saveEmployee", { id: employee.id, employeeCode: employee.employeeCode, name: employee.name, rank: employee.rank, employmentType: employee.employmentType, hireDate: employee.hireDate, status: "retired", retireDate: today }));
    await openEmployee(newEmpCode); await page.locator("#filter-status-select").selectOption("all"); assert.equal(await page.locator("#btn-delete-employee").isDisabled(), true);
    ok(await api("saveEmployee", { id: employee.id, employeeCode: employee.employeeCode, name: employee.name, rank: employee.rank, employmentType: employee.employmentType, hireDate: employee.hireDate, status: "retired", retireDate: yesterday }));
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
      await page.locator("#btn-open-e6").click(); await waitForBulkInitialFocus(); await page.locator("#modal-e6-file-path").fill(excelSamplePath); await page.locator("#btn-e6-preview").click(); await page.locator("#table-e6-preview tbody tr").first().waitFor(); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true); assert.equal(await page.locator("#btn-e6-select-file").isDisabled(), true); await page.keyboard.press("Escape");
      const rejected = await api("saveEmployee", { employeeCode: "DENIED", name: "거절", status: "active", employmentType: "정규", hireDate: "2026-01-01" }); assert.equal(rejected.ok, false); assert.match(rejected.errorCode || rejected.code, /FORBIDDEN/); assert.equal(await page.getByRole("button", { name: "활동 이력", exact: true }).count(), 0);
    }
    expectedRejections.N10 = true;
    await performLogout(); await performLogin(plannerId, subPw); await openEmployee("EMP-001"); assert.equal(await page.locator("#btn-e1-new").isEnabled(), true);
    await page.locator("#btn-open-e6").click(); await waitForBulkInitialFocus(); assert.equal(await page.locator("#btn-e6-select-file").isDisabled(), true); await page.locator("#modal-e6-file-path").fill(excelSamplePath + ".missing"); await page.locator("#btn-e6-preview").click(); await page.locator("#e6-global-error").waitFor({ state: "visible" }); await page.waitForFunction(() => document.querySelector("#btn-e6-preview").disabled === false); assert.equal(await page.locator("#btn-e6-select-file").isDisabled(), true); assert.equal(await page.locator("#btn-submit-e6").isDisabled(), true); await page.keyboard.press("Escape");
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
    await page.locator("#btn-open-e3").click(); await trapAndClose("#modal-e3"); await page.locator("#btn-e1-new").click(); await trapAndClose("#modal-e8"); await page.locator("#btn-open-e6").click(); await waitForBulkInitialFocus(); await trapAndClose("#modal-e6");
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
    const initializingAt = writes.length;
    await page.waitForFunction(() => document.querySelector("#header-current-title")?.textContent === "홈");
    await page.waitForLoadState("networkidle");
    const initializationRequests = writes.slice(initializingAt);
    const before = writes.length; await page.evaluate(() => window.__releaseOldSave()); await flush();
    w03Evidence.lateSave = { initializationRequests, afterReleaseRequests: writes.slice(before), newScreenReadyBeforeRelease: true };
    assert.equal(await page.locator("#login-id").count(), 0); assert.equal(await page.locator(".workforce-modal-overlay").count(), 0); assert.equal(writes.length, before); expectSession401 = false;

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

    // W08 uses an independent real employee so earlier retirement/bulk scenarios stay intact.
    const w08Code="W08-UI-"+Date.now();
    const w08Employee=ok(await api("saveEmployee",{employeeCode:w08Code,name:"시급이력검증",employmentType:"정규직",status:"active",hireDate:relativeDate(-60),hourlyRate:12000}));
    ok(await api("saveEmployeeWageRate",{employeeId:w08Employee.id,effectiveFrom:today,hourlyRate:16000,reason:"W08 원본"}));
    let w08Rate=ok(await api("listEmployeeWageRates",w08Employee.id)).find(r=>r.effectiveFrom===today&&!r.invalidation);assert.ok(w08Rate?.revisionToken);
    const originalW08=w08Rate;
    await openEmployee(w08Code);
    const reviseButton=()=>page.locator(`#e2-wage-history tr[data-wage-rate-id="${w08Rate.id}"] .btn-revise-wage`);
    let w08Writes=writeCount("employees:save-wage-rate");
    await reviseButton().click();await page.locator("#btn-review-wage-revision").click();assert.match(await page.locator("#wage-revision-error").innerText(),/사유/);
    await page.locator("#btn-cancel-wage-revision").click();assert.equal(writeCount("employees:save-wage-rate"),w08Writes);
    await reviseButton().click();await page.locator("#wage-revision-amount").fill("16500");await page.locator("#wage-revision-reason").fill("W08 증빙에 따른 금액 정정");
    await page.locator("#btn-review-wage-revision").click();await page.locator("#btn-confirm-wage-revision").evaluate(b=>{b.click();b.click();});await page.locator("#modal-wage-revision-result").waitFor();
    assert.equal(writeCount("employees:save-wage-rate"),w08Writes+1);assert.match(await page.locator("#wage-pending-refresh-result").innerText(),/다시 읽기 완료/);await page.locator("#btn-close-wage-revision-result").click();
    await page.waitForFunction(()=>document.querySelector("#e2-current-rate")?.textContent.includes("16,500"));
    w08Rate=ok(await api("listEmployeeWageRates",w08Employee.id)).find(r=>r.id===originalW08.id);
    assert.equal(w08Rate.hourlyRate,16500);assert.equal(w08Rate.effectiveFrom,originalW08.effectiveFrom);assert.equal(w08Rate.effectiveTo,originalW08.effectiveTo);assert.equal(w08Rate.history[0].hourlyRate,16000);
    const stale=await api("saveEmployeeWageRate",{employeeId:w08Employee.id,effectiveFrom:today,hourlyRate:17000,revision:{operation:"correct",wageRateId:w08Rate.id,expectedRevision:originalW08.revisionToken,changeReason:"오래된 화면"}});assert.equal(stale.ok,false);
    const correctedW08=w08Rate;
    await reviseButton().click();await page.locator("#wage-revision-operation").selectOption("invalidate");assert.equal(await page.locator("#wage-revision-amount").isDisabled(),true);
    await page.locator("#wage-revision-reason").fill("W08 등록 대상 착오 <증빙>");await page.locator("#btn-review-wage-revision").click();
    assert.match(await page.locator("#modal-wage-revision-confirm").innerText(),/시급 미등록/);assert.match(await page.locator("#modal-wage-revision-confirm").innerText(),/자동 복귀하지 않습니다/);
    await page.locator("#btn-back-wage-revision").click();assert.equal(await page.locator("#wage-revision-operation").inputValue(),"invalidate");assert.equal(await page.locator("#wage-revision-reason").inputValue(),"W08 등록 대상 착오 <증빙>");
    await page.locator("#btn-review-wage-revision").click();w08Writes=writeCount("employees:save-wage-rate");await page.locator("#btn-confirm-wage-revision").evaluate(b=>{b.click();b.click();});await page.locator("#modal-wage-revision-result").waitFor();assert.equal(writeCount("employees:save-wage-rate"),w08Writes+1);
    await takeCapture("w08-void-result");await page.locator("#btn-close-wage-revision-result").click();await page.waitForFunction(()=>document.querySelector("#e2-current-rate")?.textContent.includes("적용 중인 시급 없음"));
    const invalidW08=ok(await api("listEmployeeWageRates",w08Employee.id)).find(r=>r.id===w08Rate.id);assert.ok(invalidW08.invalidation);assert.equal((await employeeByCode(w08Code)).currentHourlyRate,undefined);
    for(const key of ["id","employeeId","hourlyRate","effectiveFrom","effectiveTo","reason","createdAt"])assert.equal(invalidW08[key],correctedW08[key]);
    const invalidRow=page.locator(`#e2-wage-history tr[data-wage-rate-id="${w08Rate.id}"]`);assert.match(await invalidRow.innerText(),/무효/);assert.match(await page.locator(`[data-wage-invalidation-id="${w08Rate.id}"]`).innerText(),/등록 대상 착오 <증빙>/);assert.equal(await invalidRow.locator("button").count(),0);
    await takeCapture("w08-invalidated-state");
    await submitWage(16800,today);await closeImpact();
    const replacementW08=ok(await api("listEmployeeWageRates",w08Employee.id)).find(r=>r.effectiveFrom===today&&!r.invalidation);assert.ok(replacementW08);assert.notEqual(replacementW08.id,invalidW08.id);assert.equal(replacementW08.hourlyRate,16800);
    assert.ok(ok(await api("listEmployeeWageRates",w08Employee.id)).find(r=>r.id===invalidW08.id).invalidation);
    await openEmployee(w08Code);await page.waitForFunction(()=>document.querySelector("#e2-current-rate")?.textContent.includes("16,800"));await takeCapture("w08-explicit-replacement");
    w08Rate=replacementW08;await reviseButton().click();await page.locator("#wage-revision-amount").fill("17000");await page.locator("#wage-revision-reason").fill("W08 화면 이동 중 응답");await page.locator("#btn-review-wage-revision").click();
    await page.evaluate(()=>{window.__w08Original=window.appBridge.saveEmployeeWageRate;window.appBridge.saveEmployeeWageRate=async input=>{const result=await window.__w08Original(input);window.__w08ActualResponse=result;await new Promise(resolve=>window.__releaseW08=resolve);return result;};});
    try {
      await page.locator("#btn-confirm-wage-revision").click();await page.waitForFunction(()=>typeof window.__releaseW08==='function');assert.equal(await page.evaluate(()=>window.__w08ActualResponse.ok),true);
      await page.getByRole("button",{name:"홈",exact:true}).evaluate(button=>button.click());await page.evaluate(()=>window.__releaseW08());await page.locator("#card-progress-prep").waitFor();await page.locator("#section-performance-kpi").waitFor();await page.waitForTimeout(100);assert.equal(await page.locator(".workforce-modal-overlay").count(),0);
    }finally{await page.evaluate(()=>{window.__releaseW08?.();window.appBridge.saveEmployeeWageRate=window.__w08Original;delete window.__releaseW08;});}

    Object.assign(w08Evidence,{employeeCode:w08Code,originalId:originalW08.id,originalRate:16000,correctedRate:16500,replacementRate:16800,voidEvent:invalidW08.invalidation,correctionHistoryPreserved:true,voidSourceFieldsUnchanged:true,voidGapNoCurrentWage:true,explicitSameDateReplacement:true,cancelNoWrite:true,reasonRequired:true,duplicatePostsBlocked:true,staleRevisionRejected:true,lateRealResponseIgnored:true,actualUi:true});

    // W09 independent employee exercises real retirement and date correction through the edit UI.
    const w09Code="W09-UI-"+Date.now(),w09Site=ok(await api("listSites"))[0];
    const w09Employee=ok(await api("saveEmployee",{employeeCode:w09Code,name:"퇴사종료검증",employmentType:"정규직",status:"active",hireDate:relativeDate(-60),hourlyRate:14500,siteId:w09Site.id,shiftGroup:"A조"}));
    const w09Future=ok(await api("saveEmployeeWageRate",{employeeId:w09Employee.id,effectiveFrom:tomorrow,hourlyRate:20000,reason:"W09 예정 시급"}));
    const w09InitialRates=ok(await api("listEmployeeWageRates",w09Employee.id));const w09Original=w09InitialRates.find(r=>r.id!==w09Future.id);assert.ok(w09Original);
    await openEmployee(w09Code);await page.locator("#btn-edit-employee").click();await page.locator("#edit-status").selectOption("retired");await page.locator("#edit-retire-date").fill(today);
    assert.match(await page.locator("#employee-retirement-guidance").innerText(),/근무에서 제외/);assert.match(await page.locator("#employee-retirement-guidance").innerText(),/승인된 수당은 보존/);
    const w09BeforeWrites=writeCount("employees:save");await page.locator("#btn-cancel-edit").click();assert.equal(writeCount("employees:save"),w09BeforeWrites);
    await page.locator("#btn-edit-employee").click();await page.locator("#edit-status").selectOption("retired");await page.locator("#edit-retire-date").fill(today);
    const responseW09=page.waitForResponse(r=>r.url().includes('/api/employees:save')&&r.request().method()==='POST');await page.locator("#btn-submit-edit").evaluate(b=>{b.click();b.click();});const w09Retired=ok(await(await responseW09).json());
    await page.locator("#modal-retirement-result").waitFor();assert.equal(writeCount("employees:save"),w09BeforeWrites+1);assert.ok(w09Retired.retirementChange);assert.equal(w09Retired.retirementChange.closedWageCount,1);assert.equal(w09Retired.retirementChange.closedAssignmentCount,1);assert.equal(w09Retired.retirementChange.excludedFutureWageCount,1);assert.equal(w09Retired.retirementChange.pendingPerformanceRefresh.status,"completed");
    await takeCapture("w09-retirement-result");await page.locator("#btn-close-retirement-result").click();await page.waitForFunction(()=>document.querySelector("#e2-current-rate")?.textContent.includes("적용 중인 시급 없음"));
    const w09ClosedRates=ok(await api("listEmployeeWageRates",w09Employee.id));assert.equal(w09ClosedRates.find(r=>r.id===w09Original.id).effectiveTo,yesterday);assert.equal(w09ClosedRates.find(r=>r.id===w09Future.id).effectiveFrom,tomorrow);assert.equal(w09ClosedRates.find(r=>r.id===w09Future.id).effectiveTo,w09Future.effectiveTo);
    assert.match(await page.locator("#e2-wage-history").innerText(),/퇴사로 적용 제외/);await takeCapture("w09-ended-histories");
    const newRetireW09=relativeDate(7);await page.locator("#btn-edit-employee").click();await page.locator("#edit-retire-date").fill(newRetireW09);assert.match(await page.locator("#employee-retirement-guidance").innerText(),/자동 종료한 이력만/);
    const correctedResponseW09=page.waitForResponse(r=>r.url().includes('/api/employees:save')&&r.request().method()==='POST');await page.locator("#btn-submit-edit").click();const w09Corrected=ok(await(await correctedResponseW09).json());await page.locator("#modal-retirement-result").waitFor();assert.ok(w09Corrected.retirementChange.adjustedHistoryCount>=2);await takeCapture("w09-retirement-date-corrected");await page.locator("#btn-close-retirement-result").click();
    await page.waitForFunction(()=>document.querySelector("#e2-current-rate")?.textContent.includes("14,500"));const w09CorrectedRates=ok(await api("listEmployeeWageRates",w09Employee.id));assert.equal(w09CorrectedRates.find(r=>r.id===w09Original.id).effectiveTo,today);assert.equal(w09CorrectedRates.find(r=>r.id===w09Future.id).effectiveTo,relativeDate(6));
    const w09Assignments=ok(await api("listEmployeeAssignments",w09Employee.id));assert.ok(w09Assignments.some(a=>a.endDate===newRetireW09));
    Object.assign(w09Evidence,{employeeCode:w09Code,retireDate:today,correctedRetireDate:newRetireW09,retirement:w09Retired.retirementChange,corrected:w09Corrected.retirementChange,cancelNoWrite:true,duplicatePostsBlocked:true,firstExcludedDay:true,futureOriginalRetained:true,manualOriginalBoundaryPreserved:true,actualUi:true});

    // W10 explicit UI journey: future booking -> change -> cancel -> actual rehire.
    const w10Code="W10-UI-"+Date.now(),w10Initial=ok(await api("saveEmployee",{employeeCode:w10Code,name:"재입사예약검증",employmentType:"정규",status:"active",hireDate:relativeDate(-90),hourlyRate:14000,siteId:w09Site.id,shiftGroup:"A조"}));
    const oldFutureW10=ok(await api("saveEmployeeWageRate",{employeeId:w10Initial.id,effectiveFrom:relativeDate(30),hourlyRate:99000,reason:"W10 previous period future"}));
    const retiredW10=ok(await api("saveEmployee",{...w10Initial,status:"retired",retireDate:yesterday,hourlyRate:undefined}));
    const enterW10=async(date,rate)=>{await page.locator('#rehire-date').fill(date);await page.locator('#rehire-rate').fill(String(rate));await page.locator('#rehire-site').selectOption(w09Site.id);await page.waitForFunction(()=>document.querySelector('#rehire-group')?.disabled===false);await page.locator('#rehire-group').selectOption('A조');await page.locator('#rehire-next').click();await page.locator('#rehire-review').waitFor();};
    const saveW10=async()=>{const response=page.waitForResponse(r=>r.url().includes('/api/employees:save')&&r.request().method()==='POST');await page.locator('#rehire-save').evaluate(b=>{b.click();b.click();});const saved=ok(await(await response).json());await page.locator('#modal-rehire-result').waitFor();return saved;};
    await openEmployee(w10Code);await page.locator('#btn-rehire-start').click();await enterW10(relativeDate(14),15000);assert.match(await page.locator('#rehire-review').innerText(),/최초 입사일|과거 재직기간/);
    const writesBeforeW10=writeCount('employees:save');await page.locator('#rehire-back').click();assert.equal(writeCount('employees:save'),writesBeforeW10);await page.locator('#rehire-next').click();
    const bookedW10=await saveW10();assert.equal(writeCount('employees:save'),writesBeforeW10+1);assert.equal(bookedW10.employmentPhase,'scheduled');assert.equal(bookedW10.currentHourlyRate,undefined);await takeCapture('w10-future-reservation-saved');await page.locator('#rehire-done').click();
    assert.equal(await page.locator('#filter-status-select').inputValue(),'scheduled');await page.locator('#btn-rehire-reschedule').click();await enterW10(relativeDate(21),16000);const movedW10=await saveW10();assert.equal(movedW10.scheduledRehire.startDate,relativeDate(21));await page.locator('#rehire-done').click();
    const staleW10=await api('saveEmployee',{...bookedW10,rehire:{operation:'cancel',periodId:bookedW10.scheduledRehire.periodId,expectedRevision:bookedW10.scheduledRehire.revisionToken}});assert.equal(staleW10.ok,false);
    await page.locator('#btn-rehire-cancel').click();await page.locator('#rehire-back').click();assert.equal(ok(await api('listEmployees')).find(e=>e.id===w10Initial.id).scheduledRehire.startDate,relativeDate(21));
    await page.locator('#btn-rehire-cancel').click();const cancelledW10=await saveW10();assert.equal(cancelledW10.retireDate,yesterday);assert.equal(cancelledW10.scheduledRehire,undefined);await page.locator('#rehire-done').click();assert.equal(await page.locator('#filter-status-select').inputValue(),'retired');
    await page.locator('#btn-rehire-start').click();await enterW10(today,17000);const activeW10=await saveW10();assert.equal(activeW10.id,w10Initial.id);assert.equal(activeW10.hireDate,w10Initial.hireDate);assert.equal(activeW10.currentHourlyRate,17000);await takeCapture('w10-actual-rehire-saved');await page.locator('#rehire-done').click();
    assert.equal(await page.locator('#filter-status-select').inputValue(),'active');await page.locator('#employee-employment-history summary').click();assert.match(await page.locator('#employee-employment-history').innerText(),/취소한 예약/);
    const oldFutureAfterW10=ok(await api('listEmployeeWageRates',w10Initial.id)).find(r=>r.id===oldFutureW10.id);assert.equal(oldFutureAfterW10.hourlyRate,oldFutureW10.hourlyRate);assert.equal(oldFutureAfterW10.effectiveTo,oldFutureW10.effectiveTo);assert.equal(oldFutureAfterW10.retirementDate,yesterday);
    Object.assign(w10Evidence,{employeeCode:w10Code,sameIdentity:true,firstHirePreserved:true,futureBooking:bookedW10.rehireChange,rescheduled:movedW10.rehireChange,cancelled:cancelledW10.rehireChange,actual:activeW10.rehireChange,oldFutureOriginalRetained:true,cancelNoWrite:true,duplicatePostsBlocked:true,staleReservationRejected:true,postSaveEmployeeSelected:true,actualUi:true});

    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    // Activity storage filters UTC ISO dates while this screen defaults to local month start.
    // Query the actual write window explicitly; keep the inherited default-date defect recorded.
    await page.locator("#filter-date-from").fill(yesterday);await page.locator("#filter-date-from").dispatchEvent("change");
    try { await page.locator("#table-access-logs").waitFor(); } catch(error) { fs.writeFileSync(path.join(outDir,"s21-activity-diagnostic.json"),evidenceJSON(await page.evaluate(()=>({text:document.querySelector("#main-content")?.innerText,inputs:[...document.querySelectorAll("input")].map(e=>({id:e.id,value:e.value})),activeMenu:document.querySelector(".sidebar-nav-item.active")?.getAttribute("data-id")})),null,2));await takeCapture("s21-activity-failure");throw error;} await page.waitForFunction(() => document.querySelector("#btn-refresh-logs")?.disabled === false);
    await page.locator("#btn-refresh-logs").click(); await page.waitForFunction(() => document.querySelector("#btn-refresh-logs")?.disabled === false);
    const text = await page.locator("#main-content").innerText(); assert.match(text, /인력|시급/);

    await takeCapture("s21-verified");
    completedScenarios.push("S21");
  } catch (err) { failedScenarios.push(`S21: ${err.message}`); await page.keyboard.press("Escape").catch(() => {}); }
  }
  for (const id of selectedScenarios) if (completedScenarios.filter(x => x === id).length !== 1) failedScenarios.push(`${id}: scenario not completed exactly once`);
  if (!focus) for (const [id, passed] of Object.entries(expectedRejections)) if (passed !== true) failedScenarios.push(`${id}: expected rejection not verified`);
  const bundleResponse = await fetch(new URL("/web/app.js", targetUrl));
  assert.equal(bundleResponse.status, 200);
  const bundleBytes = Buffer.from(await bundleResponse.arrayBuffer());
  const distBytes = fs.readFileSync(path.join(repoRoot, "dist/browser/web/app.js"));
  assert.deepEqual(bundleBytes, distBytes);
  const servedAssets = { appJs: { bytes: bundleBytes.length, sha256: createHash("sha256").update(bundleBytes).digest("hex").toUpperCase(), matchesDist: true } };
  const isAllPassed = failedScenarios.length === 0 && unexpectedErrors.length === 0;
  const status = isAllPassed ? (focus ? "FOCUSED_PASS" : "PASS") : "FAIL";

  const resultData = {
    status,
    planned: selectedScenarios, focused: Boolean(focus),
    completed: completedScenarios,
    failed: failedScenarios,
    captures,
    unexpectedErrors,
    expectedRejections, expectedHttpRejections, w01Evidence, w02Evidence, w03Evidence, w04Evidence, w08Evidence, w09Evidence, w10Evidence, servedAssets, dateBasis: { today, tomorrow, yesterday }
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
