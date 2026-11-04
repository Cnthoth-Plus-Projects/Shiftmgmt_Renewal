// 근무표 생성·조회·엑셀·게시 UI 검증 및 E2E 자동화 러너 (S01~S17, N01~N12)
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import ExcelJS from "exceljs";
import { build } from "esbuild";
import { checkServerHealth } from "../lib/ui-check.mjs";
import { findChrome } from "../lib/find-chrome.mjs";
import { seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import { performNormalLogin } from "./access-history-negative.mjs";
import { seedScheduleFixtures } from "./schedule-fixtures.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rawArgs = process.argv.slice(2);
const focusIDs = new Set(
  (rawArgs.find((a) => a.startsWith("--focus="))?.slice(8) ||
    rawArgs.find((a) => a.startsWith("--scenarios="))?.slice(12) ||
    "").split(",").filter(Boolean),
);
const isPreview = rawArgs.includes("--preview");

const portArg = rawArgs.find((a) => a.startsWith("--port="))?.slice(7)?.trim();
const targetPort = portArg ? parseInt(portArg, 10) : isPreview ? 18841 : 18840;
const targetUrl = `http://127.0.0.1:${targetPort}/`;

// OS TEMP 디렉터리 하위 검증
const outArg = rawArgs.find((a) => a.startsWith("--out="))?.slice(6)?.replace(/^["']|["']$/g, "")?.trim();
const resolvedOut = path.resolve(outArg || path.join(os.tmpdir(), "shiftmgmt-schedule-ui-" + crypto.randomUUID()));
const tempRoot = fs.realpathSync(os.tmpdir());
const underTemp = (val) => {
  const rel = path.relative(tempRoot, path.resolve(val));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
if (!underTemp(resolvedOut)) throw new Error("Output must be a dedicated TEMP child directory");
fs.mkdirSync(resolvedOut, { recursive: true });
const capturesDir = path.join(resolvedOut, "captures");
fs.mkdirSync(capturesDir, { recursive: true });

const userDataDir = path.join(os.tmpdir(), "shiftmgmt-sched-data-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(userDataDir, { recursive: true });
const resourcesDir = path.join(os.tmpdir(), "shiftmgmt-sched-res-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(resourcesDir, { recursive: true });

const plannedScenarios = Array.from({ length: 17 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`).filter(
  (id) => !focusIDs.size || focusIDs.has(id),
);
const completedScenarios = [];
const failedScenarios = [];
const unexpectedErrors = [];
const expectedRejections = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`N${String(i + 1).padStart(2, "0")}`, false]),
);

let serverProcess = null;
let browser = null;
let proof = {};
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

async function cleanup(force = false) {
  if (browser && (!isPreview || force)) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  if (serverProcess && (!isPreview || force)) {
    try {
      if (serverProcess.pid) execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { stdio: "ignore" });
    } catch {}
    serverProcess = null;
  }
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(1);
});

async function main() {
  process.stdout.write(`[UI-04] Starting schedule suite on port ${targetPort} (preview=${isPreview})\n`);

  try {
    const portBusy = await isPortInUse(targetPort);
    if (portBusy) {
      throw new Error(`Port ${targetPort} is occupied; use a new isolated port.`);
    } else {
      const serverScript = path.join(repoRoot, "dist", "server", "main", "server.js");
      if (!fs.existsSync(serverScript)) throw new Error("dist/server/main/server.js 없음 (빌드 필요)");

      const bootstrapFile = path.join(userDataDir, "data", "bootstrap-credentials.json");
      fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });

      const preloadScript = path.join(resourcesDir, "inject-resources.cjs");
      fs.writeFileSync(preloadScript, "process.resourcesPath = process.env.SHIFTMGMT_RESOURCES_PATH;\n", "utf8");
      const normalizedPreload = preloadScript.replace(/\\/g, "/");

      const env = {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(SOL_|SHIFTMGMT_|AUTH_BOOTSTRAP_|NODE_OPTIONS$|NODE_DEBUG$)/i.test(key))),
        NODE_ENV: "production",
        NODE_OPTIONS: `--require "${normalizedPreload}"`,
        SHIFTMGMT_PORT: String(targetPort),
        SHIFTMGMT_USER_DATA_DIR: userDataDir,
        SHIFTMGMT_RESOURCES_PATH: resourcesDir,
        SHIFTMGMT_UI_BOOTSTRAP_FILE: bootstrapFile,
      };

      const { ensureAuthBootstrapCredentials } = await import(
        pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js")).href
      );
      ensureAuthBootstrapCredentials({ userDataPath: userDataDir, env });
      try { seedBootstrapSecrets(bootstrapFile); } catch {}
      for (const folder of ["pending", "approved", "export"]) {
        fs.mkdirSync(path.join(userDataDir, folder), { recursive: true });
      }

      const entry = `require(${JSON.stringify(serverScript)}).startServer();`;
      serverProcess = spawn(process.execPath, ["-e", entry], {
        cwd: repoRoot,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      serverProcess.stdout.on("data", (d) => process.stdout.write("[ServerOut] " + d.toString()));
      serverProcess.stderr.on("data", (d) => process.stderr.write("[ServerErr] " + d.toString()));
      let healthOk = false;
      for (let i = 0; i < 60; i++) {
        await sleep(500);
        try {
          const res = await checkServerHealth(targetUrl, 2000);
          if (res?.ok) { healthOk = true; break; }
        } catch {}
      }
      if (!healthOk) throw new Error("서버 시작 실패 (health check 타임아웃)");
    }

    const chromeInfo = findChrome();
    const launchOptions = {
      headless: !isPreview,
      executablePath: chromeInfo?.path || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--start-maximized"],
    };
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport: null });
    let page = await context.newPage();

    // CSP 및 콘솔 에러 리스너 (UI04-D01)
    page.on("pageerror", (err) => {
      const msg = `pageerror: ${err.message}`;
      process.stderr.write(`[BrowserPageError] ${msg}\n`);
      unexpectedErrors.push(msg);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        process.stderr.write(`[BrowserConsoleError] ${text}\n`);
        unexpectedErrors.push(`console.error: ${text}`);
      }
    });

    // 1. 로그인
    const bootstrapFile = path.join(userDataDir, "data", "bootstrap-credentials.json");
    const bootstrapData = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
    const adminCreds = bootstrapData.credentials?.["user-admin"];
    const adminPassword = "Ui04!" + crypto.randomUUID() + "a7";

    await performNormalLogin(page, targetUrl, adminCreds, adminPassword, () => {});
    await page.waitForSelector("button[data-id=\"schedule-create\"]", { timeout: 15000 });

    await page.setViewportSize({ width: 1600, height: 900 });
    const representativeFiles = [];
    await page.exposeFunction('__ui04VerifyRepresentative', async ({ preview, record }) => { representativeFiles.push(await verifyWorkbook(preview, record)); });
    // 2. 55+ 픽스처 생성
    process.stdout.write("[UI-04] Seeding 55+ fixture data...\n");
    const seedResult = await seedScheduleFixtures({ page, resourcesDir });
    assert(seedResult.verified, "55+ 픽스처 생성 검증 실패");
    process.stdout.write(`[UI-04] Seeded: ${seedResult.employeeCount} emps, ${seedResult.scheduleCount} scheds, ${seedResult.exportCount} exports, ${seedResult.publishedCount} pubs\n`);

    // 메뉴 클릭하여 근무표 화면 진입
    await page.click("button[data-id=\"schedule-create\"]");
    await page.waitForSelector("#schedule-screen", { timeout: 10000 });
    await page.waitForSelector(".schedule-kpi-card", { timeout: 15000 });

    proof = { controlled: {}, files: representativeFiles, layouts: [], roles: [], pages: {} };
    const moduleBundle = (await build({ stdin: { contents: `import * as M from './src/web/screens/schedule-model.ts';import {ScheduleScreen} from './src/web/screens/schedule.ts';import {create4Team3ShiftTemplate} from './src/web/screens/sites-pattern-model.ts';import {draftToPatternRecord,runThreeMonthSimulation} from './src/web/screens/sites-simulation.ts';window.__UI04={M,ScheduleScreen,create4Team3ShiftTemplate,draftToPatternRecord,runThreeMonthSimulation};`, resolveDir: repoRoot, loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
    await page.evaluate(moduleBundle); proof.controlled = await page.evaluate(controlledCases);
    const take = (r, label) => { assert(r?.ok, `${label}: ${r?.message || 'failed'}`); return r.data; };
    const api = (method, ...args) => page.evaluate(async ({ method, args }) => window.appBridge[method](...args), { method, args });
    const waitReady = async () => {
      await page.waitForFunction(() => { const e = document.querySelector('#schedule-message'); return !e || e.hidden; });
      await page.locator('#schedule-roster-table').waitFor();
      await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(100);
    };
    const closeNotice = async () => { await page.locator('#btn-notice-close').waitFor(); await page.click('#btn-notice-close'); await waitReady(); };
    const calendarTarget = async (id = 'new') => {
      if (await page.locator('#tab-btn-calendar').count()) await page.click('#tab-btn-calendar');
      await page.selectOption('#select-schedule-site', seedResult.mainSiteId); await page.fill('#input-schedule-year', '2026'); await page.locator('#input-schedule-year').press('Tab');
      await page.selectOption('#select-schedule-month', '5'); await waitReady(); await page.selectOption('#select-schedule-version', id); await waitReady();
    };
    const run = async (id, task) => {
      if (!plannedScenarios.includes(id)) return;
      process.stdout.write(`[${id}] checking actual behavior\n`);
      try { await task(); completedScenarios.push(id); }
      catch (error) { failedScenarios.push({ id, message: error.message }); throw error; }
    };
    const collectPages = async (kind, key) => {
      await page.waitForTimeout(100);
      const out = [], selector = kind === 'roster' ? '.schedule-roster-row' : '.schedule-history-row';
      const teams=kind==='roster'?await page.locator('.schedule-team-select').evaluateAll(rows=>rows.map(r=>r.dataset.team)):[null];
      for(const team of teams){
        if(team!==null)await page.locator('.schedule-team-select').filter({has:page.locator('b')}).evaluateAll((nodes,value)=>nodes.find(n=>n.dataset.team===value).click(),team);
        await page.waitForTimeout(100);const first = page.locator(`#btn-schedule-${kind}-first`); if (await first.isEnabled()) await first.click();
        for (let guard = 0; guard < 100; guard++) {
          out.push(...await page.locator(selector).evaluateAll((rows, key) => rows.map(r => r.dataset[key]), key));
          const next = page.locator(`#btn-schedule-${kind}-next`); if (await next.isDisabled()) break; await next.click(); await page.waitForTimeout(60);
        }
      }
      assert.equal(new Set(out).size, out.length, `${kind} duplicate page items`); return out;
    };
    const measure = async kind => page.evaluate(kind => {
      const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
      const view = document.querySelector('.schedule-table-viewport'), table = view.querySelector('table'), rows = table.querySelectorAll(kind === 'roster' ? '.schedule-roster-row' : '.schedule-history-row');
      const last = rows[rows.length - 1], nextButton = document.querySelector(`#btn-schedule-${kind}-next`), footer = box('.schedule-pagination');
      const bodyBottom = view.getBoundingClientRect().top + view.clientTop + view.clientHeight;
      const list = window.__ui04LayoutRows[kind], text = document.querySelector('.schedule-pagination .schedule-pagination-info').textContent;
      const end = Number(text.match(/–(\d+)/)?.[1]);
      const key = kind === 'roster' ? 'shiftGroup' : 'scheduleMonth';
      const groupHeight = table.querySelector('.schedule-group-row')?.getBoundingClientRect().height || 0;
      const nextCost = last.getBoundingClientRect().height + (list[end]?.[key] !== list[end - 1]?.[key] ? groupHeight : 0);
      return { kind,window: { width: innerWidth, height: innerHeight }, table: box('#schedule-table-pane'), detail: box('#schedule-detail-pane'),calendar:kind==='roster'?box('.schedule-month-pane'):null,staff:kind==='roster'?box('.schedule-staff-pane'):null, footer, kpi: box('#schedule-kpi-container'), toolbar: box('#schedule-toolbar-container'), rows: rows.length, nextCost, remaining: bodyBottom - last.getBoundingClientRect().bottom, rowHeight: last.getBoundingClientRect().height, scroll: view.scrollHeight - view.clientHeight, hasNext: !nextButton.disabled, controls: [...document.querySelectorAll('.pagination-button')].map(b => ({ text: b.textContent, height: b.getBoundingClientRect().height })) };
    }, kind);
    const checkLayout = data => {
      if(data.kind==='history'){assert(Math.abs(data.detail.width - 380) < 1, '380px history detail');assert(Math.abs(data.table.y - data.detail.y) < 1 && Math.abs(data.table.bottom - data.detail.bottom) < 1, 'aligned history table/detail');}
      else{assert.equal(data.detail.width,0,'calendar has no persistent right detail');assert(data.staff.width<=225&&data.calendar.width>data.staff.width*2,'left compact people / full month calendar');assert(Math.abs(data.calendar.y-data.staff.y)<1&&Math.abs(data.calendar.bottom-data.staff.bottom)<1,'aligned staff/calendar');assert(data.calendar.bottom<=data.window.height-20,'full month above status bar');}
      assert(data.footer.bottom <= data.window.height - 20, 'footer above statusbar'); assert(data.scroll <= 1, 'no vertical list scroll');
      if (data.hasNext) assert(data.remaining >= -1 && data.remaining < data.nextCost + 1, `whole row should fill remaining ${data.remaining}/${data.rowHeight}`);
      assert(data.controls.every(b => Math.abs(b.height - 28) < 1), 'common 28px page buttons'); assert.deepEqual(data.controls.filter(b => ['«','‹','›','»'].includes(b.text)).map(b => b.text), ['«','‹','›','»']);
      proof.layouts.push(data);
    };
    await calendarTarget();
    await page.evaluate(async seed => {
      const { M } = window.__UI04, b = window.appBridge, people = (await b.listEmployees()).data, patterns = (await b.listShiftPatterns()).data;
      const roster = await M.prepareRosterEmployees(people, seed.targetMonth, seed.mainSiteId, async id => (await b.listEmployeeAssignments(id)).data);
      const history = M.joinSchedulePlanExports((await b.listSchedulePlanExports()).data, (await b.listMonthlySchedules()).data, (await b.listSites()).data);
      window.__ui04LayoutRows = { roster: M.generateSchedulePreview(patterns.filter(p => p.siteId === seed.mainSiteId), roster.rosterEmployees, seed.targetMonth).rows, history: M.filterScheduleHistory(history, { siteId: 'all', scheduleMonth: 'all', status: 'all', keyword: '' }) };
    }, seedResult);
    const writesBeforePreview = take(await api('listMonthlySchedules'), 'preview baseline').length;
    await run('S01', async () => {
      assert.equal(await page.locator('.schedule-kpi-card').count(), 4); assert((await page.locator('#kpi-roster-count').innerText()).includes('56명'));
      await page.click('button[data-id="schedule-status"]'); await page.locator('#schedule-history-table').waitFor(); assert.equal(await page.locator('.schedule-kpi-card').count(), 3);
      await page.click('#tab-btn-calendar'); await waitReady(); expectedRejections.N01 = proof.controlled.N01;
    });
    await run('S02', async () => {
      for (const size of [{ width: 1600, height: 900 }, { width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1707, height: 825 }]) {
        await page.setViewportSize(size); await page.waitForTimeout(180); checkLayout(await measure('roster'));
        if(size.width===1707)assert.equal(await page.locator('.schedule-month-day').first().locator('.schedule-day-team:not([hidden])').count(),4,'all four active teams fit the actual review window');
        await page.click('#tab-btn-history'); await page.locator('#schedule-history-table').waitFor(); await page.waitForTimeout(180); checkLayout(await measure('history'));
        await page.click('#tab-btn-calendar'); await waitReady();
      }
      const toggle = page.locator('.btn-sidebar-toggle');
      if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(180); checkLayout(await measure('roster')); await toggle.click(); }
      await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(180); await page.screenshot({ path: path.join(capturesDir, 'S02-layout.png') });
    });
    await run('S03', async () => {
      const ids = await collectPages('roster', 'rowKey'); assert.equal(ids.length, 56); proof.pages.roster = ids;
      const expected = await page.evaluate(async seed => {
        const { M } = window.__UI04, b = window.appBridge, people = (await b.listEmployees()).data, patterns = (await b.listShiftPatterns()).data;
        const roster = await M.prepareRosterEmployees(people, seed.targetMonth, seed.mainSiteId, async id => (await b.listEmployeeAssignments(id)).data);
        return M.generateSchedulePreview(patterns.filter(p => p.siteId === seed.mainSiteId), roster.rosterEmployees, seed.targetMonth).rows.map(r => r.rowKey);
      }, seedResult); assert.deepEqual(ids, expected, 'all pages retain domain order');
      for (const [year, month, days] of [[2026,2,28],[2028,2,29],[2026,4,30],[2026,5,31]]) {
        await page.fill('#input-schedule-year', String(year)); await page.locator('#input-schedule-year').press('Tab'); await page.selectOption('#select-schedule-month', String(month)); await waitReady();
        assert.equal(await page.locator('#schedule-roster-table thead th').count(),1,'member list shows names beneath a unique team heading');assert.equal(await page.locator('.schedule-month-day').count(),days,'all actual month dates');assert.deepEqual(await page.locator('.schedule-month-weekdays > div').allTextContents(),['일','월','화','수','목','금','토']);
      }
      await calendarTarget(); assert.equal(take(await api('listMonthlySchedules'), 'preview writes').length, writesBeforePreview);
      assert(/[주간야간비번휴무]/.test(await page.locator('.duty-badge').first().innerText()));
      const row = page.locator('.schedule-roster-row').nth(1); const code = await row.locator('.col-sticky-2').innerText(), calendarBeforeName=await page.locator('.schedule-month-grid').innerText(); await row.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('.schedule-month-grid').innerText(),calendarBeforeName,'selecting a member never turns team calendar into a personal calendar');
      await page.click('#btn-schedule-person-detail');assert((await page.locator('#schedule-person-modal .detail-title').innerText()).includes(code));assert((await page.locator('#schedule-person-modal').innerText()).includes('주차별'));await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(capturesDir, 'S03-calendar.png') });
    });
    await run('S04', async () => { assert(proof.controlled.periodParity && proof.controlled.N02); expectedRejections.N02 = true; });
    await run('S05', async () => { assert(proof.controlled.N03); expectedRejections.N03 = true; assert((await page.locator('#kpi-warning-count').innerText()).includes('건')); });
    let newScheduleId, freshExport, freshPreview;
    await run('S06', async () => {
      await calendarTarget(); const before = take(await api('listMonthlySchedules'), 'before save'), beforeExports = take(await api('listSchedulePlanExports'), 'before save exports');
      await page.click('#btn-schedule-create'); assert((await page.locator('.confirm-main-msg').innerText()).includes('기존')); await page.click('#btn-confirm-cancel');
      assert.equal(take(await api('listMonthlySchedules'), 'cancel save').length, before.length);
      await page.click('#btn-schedule-create'); await page.click('#btn-confirm-ok'); await closeNotice();
      const after = take(await api('listMonthlySchedules'), 'after save'); assert.equal(after.length, before.length + 1); newScheduleId = await page.locator('#select-schedule-version').inputValue(); assert(!before.some(s => s.id === newScheduleId));
      for (const prior of before) assert.deepEqual(after.find(s => s.id === prior.id), prior, 'existing stored records preserved'); assert.deepEqual(take(await api('listSchedulePlanExports'), 'old export preservation'), beforeExports);
      assert(proof.controlled.N04); expectedRejections.N04 = true;
    });
    await run('S07', async () => {
      await calendarTarget(newScheduleId || seedResult.mainScheduleId); const versionLabels = await page.locator('#select-schedule-version option').allTextContents(); assert.equal(new Set(versionLabels).size, versionLabels.length, 'same-day stored versions must remain identifiable'); const prior = take(await api('listMonthlySchedules'), 'saved input').find(s => s.id === (newScheduleId || seedResult.mainScheduleId));
      const pattern = take(await api('listShiftPatterns'), 'patterns').find(p => p.id === prior.patternId);
      take(await api('saveShiftPattern', { ...pattern, id: undefined, name: '미래 설정 검증판', effectiveFrom: '2030-01-01', patternStartDate: '2030-01-01' }), 'future version');
      await page.click('#btn-schedule-preview'); await waitReady(); assert.equal(await page.locator('#select-schedule-version').inputValue(), prior.id);
      const stored = await page.evaluate(async id => { const saved = (await window.appBridge.listMonthlySchedules()).data.find(s => s.id === id); return window.__UI04.M.buildRosterFromStoredSchedule(saved).rows.map(r => r.rowKey); }, prior.id);
      assert.deepEqual(await collectPages('roster', 'rowKey'), stored); assert.deepEqual(take(await api('listMonthlySchedules'), 'saved unchanged').find(s => s.id === prior.id), prior);
      assert(proof.controlled.N05); expectedRejections.N05 = true; assert(await page.locator('#btn-schedule-publish').isDisabled());
    });
    await run('S08', async () => {
      await calendarTarget(newScheduleId || seedResult.mainScheduleId); const id = await page.locator('#select-schedule-version').inputValue();
      freshPreview = take(await api('previewMonthlySchedulePlan', id), 'export preview');
      const before = take(await api('listSchedulePlanExports'), 'before export'); await page.click('#btn-schedule-export'); await page.click('#btn-confirm-ok'); await closeNotice();
      const exports = take(await api('listSchedulePlanExports'), 'after export'); const added = exports.filter(e => !before.some(p => p.id === e.id)); assert.equal(added.length, 1); freshExport = added[0]; assert.equal(freshExport.scheduleId, id);
      proof.files.push(await verifyWorkbook(freshPreview, freshExport));
      const values = freshPreview.updates.map(u => String(u.value)); assert(values.some(v => v.includes(seedResult.mainSiteName)), 'actual site cell'); assert(values.some(v => v.includes('2026') || v.includes('05')), 'actual month cell');
      const employeeNames = take(await api('listEmployees'), 'names').filter(e => seedResult.mainEmployeeIds.includes(e.id)).map(e => e.name); assert(employeeNames.every(name => values.some(v => v.includes(name))), 'all roster names in Excel');
    });
    await run('S09', async () => {
      assert(freshExport, 'S08 export required'); const ctx = take(await api('getSchedulePreparationContext', 2026), 'publish context'); const before = take(await api('listSchedulePlanExports'), 'before publish');
      await page.click('#btn-schedule-publish'); const message = await page.locator('.confirm-main-msg').innerText(); for (const text of [seedResult.mainSiteName, '2026-05', '56명', freshExport.outputFileName, ctx.publishDirectory]) assert(message.includes(text));
      await page.click('#btn-confirm-cancel'); assert.deepEqual(take(await api('listSchedulePlanExports'), 'cancel publication'), before);
      await page.click('#btn-schedule-publish'); await page.click('#btn-confirm-ok'); await closeNotice();
      let record = take(await api('listSchedulePlanExports'), 'published').find(e => e.id === freshExport.id); assert.equal(record.publishStatus, 'published'); assert(fs.readFileSync(record.outputPath).equals(fs.readFileSync(record.publishedPath)), 'copy bytes');
      const firstCopy = { path: record.publishedPath, bytes: fs.readFileSync(record.publishedPath) };
      await page.click('#btn-schedule-publish'); await page.click('#btn-confirm-ok'); await closeNotice(); record = take(await api('listSchedulePlanExports'), 'duplicate publication').find(e => e.id === freshExport.id);
      assert.notEqual(record.publishedPath, firstCopy.path); assert(/_dup\d+\.xlsx$/i.test(record.publishedPath)); assert(fs.readFileSync(firstCopy.path).equals(firstCopy.bytes)); assert(fs.readFileSync(record.outputPath).equals(fs.readFileSync(record.publishedPath)));
      proof.files.push({ publishedPath: record.publishedPath, sha256: hash(fs.readFileSync(record.publishedPath)), originalPath: firstCopy.path, originalPreserved: true }); expectedRejections.N06 = true;
      await page.selectOption('#select-schedule-month', '6'); await waitReady(); assert(await page.locator('#btn-schedule-publish').isDisabled()); await calendarTarget(newScheduleId || seedResult.mainScheduleId);
    });
    await run('S10', async () => {
      await page.click('#tab-btn-history'); await page.locator('#schedule-history-table').waitFor(); const exports = take(await api('listSchedulePlanExports'), 'history all'); assert(exports.length >= 55);
      const ids = await collectPages('history', 'exportid'); proof.pages.historyObserved = ids; proof.pages.historyExpected = exports.map(e => e.id); proof.pages.historyInfo = await page.locator('.schedule-pagination .schedule-pagination-info').innerText(); assert.equal(ids.length, exports.length); const expected = exports.slice().sort((a,b) => b.scheduleMonth.localeCompare(a.scheduleMonth) || Date.parse(b.exportedAt)-Date.parse(a.exportedAt) || a.id.localeCompare(b.id, undefined, { numeric: true })).map(e => e.id); assert.deepEqual(ids, expected); proof.pages.history = ids; await page.selectOption('#select-history-site', seedResult.subSiteId); assert.equal(await page.locator('.schedule-history-row').count(), 0); await page.selectOption('#select-history-site', seedResult.mainSiteId); assert.equal((await collectPages('history','exportid')).length,exports.length); await page.selectOption('#select-history-site','all');
      await page.selectOption('#select-history-month', '2026-05'); const may = exports.filter(e => e.scheduleMonth === '2026-05'); assert.equal((await collectPages('history', 'exportid')).length, may.length);
      await page.selectOption('#select-history-status', 'published'); const publishedMay = may.filter(e => e.publishedPath); assert.equal((await collectPages('history', 'exportid')).length, publishedMay.length);
      await page.fill('#input-history-keyword', '일치하는파일없음'); assert.equal(await page.locator('.schedule-history-row').count(), 0); assert.equal(await page.locator('.pagination-button:not([disabled])').count(), 0);
      await page.fill('#input-history-keyword', ''); await page.selectOption('#select-history-month', 'all'); await page.selectOption('#select-history-status', 'all');
      const selected = page.locator('.schedule-history-row').nth(1), filename = await selected.locator('td').nth(3).innerText(); await selected.focus(); await page.keyboard.press('Space'); assert.equal(await page.locator('.detail-title').innerText(), filename);
      const detail = await page.locator('#schedule-detail-pane').innerText(); assert(!detail.includes('게시자') && !detail.includes('게시 일시'), 'no invented publisher/time'); await page.screenshot({ path: path.join(capturesDir, 'S10-history.png') });
    });
    const roleRun = async (role, creds) => {
      const exportId = freshExport?.id || take(await api('listSchedulePlanExports'), 'existing export')[0].id; await page.close();
      const roleContext = await browser.newContext({ viewport: { width: 1600, height: 900 } }); const rolePage = await roleContext.newPage(); const automatic = []; rolePage.on('pageerror', e => unexpectedErrors.push(`${role}: ${e.message}`)); rolePage.on('console', m => { if (m.type() === 'error' && !/status of 403/.test(m.text())) unexpectedErrors.push(`${role}: ${m.text()}`); });
      try {
        await performNormalLogin(rolePage, targetUrl, creds, null, () => {}); rolePage.on('request', request => automatic.push(new URL(request.url()).pathname));
        await rolePage.click('button[data-id="schedule-create"]'); await rolePage.selectOption('#select-schedule-site', seedResult.mainSiteId); await rolePage.fill('#input-schedule-year', '2026'); await rolePage.locator('#input-schedule-year').press('Tab'); await rolePage.selectOption('#select-schedule-month', '5');
        await rolePage.waitForFunction(() => document.querySelector('#schedule-message')?.hidden); await rolePage.locator('#schedule-roster-table').waitFor();
        assert(!automatic.some(url => /operations:(get-app-settings|list-holiday-calendars)/.test(url)), `${role} must not auto-call admin settings`);
        const result = await rolePage.evaluate(async ({ role, seed }) => {
          const b = window.appBridge; const session = await b.getSession(), context = await b.getSchedulePreparationContext(2026), saved = (await b.listMonthlySchedules()).data.find(s => s.id === seed.mainScheduleId);
          const reads = [await b.listSites(), await b.listShiftPatterns(), await b.listEmployees(), await b.listEmployeeAssignments(seed.mainEmployeeIds[0]), await b.previewMonthlySchedulePlan(saved.id), await b.listSchedulePlanExports()];
          const admin = [await b.getAppSettings(), await b.listHolidayCalendars(2026)];
          if (role === 'planner') {
            const created = await b.saveMonthlySchedule({ siteId: saved.siteId, patternId: saved.patternId, scheduleMonth: saved.scheduleMonth, generatedBy: '플래너 검증', items: saved.items });
            if (!created.ok) return { sessionRole: session.data?.role, context, reads, admin, writes: [created] };
            const exported = await b.exportMonthlySchedulePlan(created.data.id); const published = exported.ok ? await b.publishSchedulePlanExport(exported.data.id) : exported;
            return { sessionRole: session.data?.role, context, reads, admin, writes: [created, exported, published] };
          }
          return { sessionRole: session.data?.role, context, reads, admin, writes: [await b.saveMonthlySchedule({ siteId: saved.siteId, patternId: saved.patternId, scheduleMonth: saved.scheduleMonth, generatedBy: '권한거절검증', items: saved.items }), await b.exportMonthlySchedulePlan(saved.id), await b.publishSchedulePlanExport(seed.exportId)] };
        }, { role, seed: { ...seedResult, exportId } });
        assert.equal(result.sessionRole, role); assert(result.context.ok && result.reads.every(r => r.ok)); assert.deepEqual(result.context.data.warningSettings, seedResult.expectedContext.warningSettings); assert.equal(result.context.data.exportDirectory, seedResult.expectedContext.exportDirectory); assert.equal(result.context.data.publishDirectory, seedResult.expectedContext.publishDirectory); assert(result.admin.every(r => !r.ok), `${role} admin API guard`);
        if (role === 'planner') assert(result.writes.every(r => r.ok), 'planner real save/export/publish');
        else { assert(result.writes.every(r => !r.ok && /AUTH|PERMISSION|FORBIDDEN/.test(r.errorCode)), `${role} writes denied by permission`); for (const id of ['#btn-schedule-create','#btn-schedule-export','#btn-schedule-publish']) { assert(await rolePage.locator(id).isDisabled()); assert((await rolePage.locator(id).getAttribute('title')).includes('권한')); } }
        proof.roles.push({ role, readSuccess: true, writeAllowed: role === 'planner', adminDenied: true, automaticAdminCalls: 0 });
      } finally { await roleContext.close(); page = await context.newPage(); page.on('pageerror', e => unexpectedErrors.push(e.message)); page.on('console', m => { if (m.type() === 'error') unexpectedErrors.push(m.text()); }); await performNormalLogin(page, targetUrl, adminCreds, null, () => {}); await page.click('button[data-id="schedule-create"]'); await page.evaluate(moduleBundle); await calendarTarget(newScheduleId || seedResult.mainScheduleId); }
    };
    await run('S11', async () => { take(await api('saveOperationUser', { id: 'user-pending-review', loginId: 'reviewer', displayName: '승인담당 검증', role: 'reviewer', status: 'active' }), 'activate fixture reviewer'); for (const [role, key] of [['operator','user-operator'],['reviewer','user-pending-review']]) await roleRun(role, bootstrapData.credentials[key]); expectedRejections.N07 = true; });
    await run('S12', async () => {
      const ctx = take(await api('getSchedulePreparationContext', 2026), 'admin context'); assert.deepEqual(Object.keys(ctx).sort(), ['exportDirectory','publicHolidayDates','publishDirectory','warningSettings','year']); assert(ctx.publicHolidayDates.includes('2026-05-05')); assert.deepEqual(ctx.warningSettings, seedResult.expectedContext.warningSettings); assert.equal(ctx.exportDirectory, seedResult.expectedContext.exportDirectory); assert.equal(ctx.publishDirectory, seedResult.expectedContext.publishDirectory);
      for (const year of [-1, 1899, 10000, 2026.5]) assert(!(await api('getSchedulePreparationContext', year)).ok);
      const noAuth = await browser.newContext(); const response = await noAuth.request.post(targetUrl + 'api/monthly-schedules:preparation-context', { data: [2026], headers: { Origin: targetUrl.replace(/\/$/, '') } }); assert.equal(response.status(), 401); await noAuth.close();
      const password = 'Ui04!' + crypto.randomUUID() + 'a7', creds = { loginId: 'ui04-planner', password }; take(await api('saveOperationUser', { ...creds, displayName: '배포 플래너', role: 'planner', status: 'active' }), 'planner create'); await roleRun('planner', creds); expectedRejections.N08 = true;
    });
    await run('S13', async () => { assert(proof.controlled.N09); expectedRejections.N09 = true; });
    await run('S14', async () => { assert(proof.controlled.N10); expectedRejections.N10 = true; });
    await run('S15', async () => {
      assert(proof.controlled.N11); await calendarTarget();
      for (const [method, button] of [['saveMonthlySchedule','#btn-schedule-create'], ['exportMonthlySchedulePlan','#btn-schedule-export'], ['publishSchedulePlanExport','#btn-schedule-publish']]) {
        await page.evaluate(method => {
          const bridge = window.appBridge, original = bridge[method]; window.__ui04HeldCalls = 0;
          bridge[method] = (...args) => { window.__ui04HeldCalls++; return new Promise(resolve => { window.__ui04Release = async () => { bridge[method] = original; resolve(await original(...args)); }; }); };
        }, method);
        await page.click(button); await page.click('#btn-confirm-ok'); await page.waitForFunction(() => window.__ui04HeldCalls === 1);
        assert(await page.locator('#select-schedule-site').isDisabled()); assert(await page.locator('#btn-schedule-preview').isDisabled());
        await page.click('button[data-id="workforce"]'); await page.locator('#btn-notice-close').waitFor(); assert((await page.locator('#operations-notice-modal').innerText()).includes('진행 중')); await page.click('#btn-notice-close');
        await page.click('.btn-logout'); await page.locator('#btn-notice-close').waitFor(); await page.click('#btn-notice-close'); assert(await page.locator('#schedule-screen').isVisible()); assert(take(await api('getSession'),'busy session'));
        assert(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; }), 'beforeunload lock');
        assert.equal(await page.evaluate(() => window.__ui04HeldCalls), 1); await page.evaluate(() => { void window.__ui04Release(); }); await closeNotice();
        assert(await page.locator('#select-schedule-site').isEnabled());
      }
      expectedRejections.N11 = true;
    });
    await run('S16', async () => {
      assert(proof.controlled.N12); await calendarTarget(); await page.click('#btn-schedule-create');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'btn-confirm-cancel'); await page.keyboard.press('Shift+Tab'); assert(await page.locator('#operations-confirm-modal :focus').count()); await page.keyboard.press('Tab'); assert(await page.locator('#operations-confirm-modal :focus').count());
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#btn-confirm-ok').count(), 0); assert.equal(await page.locator(':focus').getAttribute('id'), 'btn-schedule-create');
      const next = page.locator('#btn-schedule-roster-next'); if (await next.isEnabled()) { await next.click(); assert.equal(await page.locator(':focus').getAttribute('aria-current'), 'page'); }
      expectedRejections.N12 = true;
    });
    await run('S17',async()=>{
      await page.setViewportSize({width:1024,height:768});
      await calendarTarget();await page.click('#btn-schedule-view-all');const teamNames=await page.locator('.schedule-team-select').evaluateAll(rows=>rows.map(r=>r.dataset.team));assert.deepEqual(teamNames,['A조','B조','C조','D조'],'each team appears once per site');assert.equal(await page.locator('.schedule-roster-row .col-sticky-1').count(),0,'no duplicated team label on person rows');const count=async()=>page.locator('.schedule-month-day[data-date="2026-05-05"] .schedule-day-count').innerText(),before=await count();const next=page.locator('#btn-schedule-roster-next');if(await next.isEnabled())await next.click();assert.equal(await count(),before,'sidebar page never limits month aggregation');
      const holiday=page.locator('.schedule-month-day[data-date="2026-05-05"]');assert(await holiday.locator('.schedule-public-holiday-label').isVisible());assert((await holiday.getAttribute('aria-label')).includes('공휴일'));await holiday.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.schedule-month-day:focus').getAttribute('data-date'),'2026-05-06');await page.keyboard.press('Enter');await page.waitForSelector('#schedule-day-modal');assert((await page.locator('#schedule-day-modal').innerText()).includes('전체'));await page.keyboard.press('Escape');assert.equal(await page.locator('.schedule-month-day:focus').getAttribute('data-date'),'2026-05-06');
      const calendarBeforeSearch=await page.locator('.schedule-month-grid').innerText();
      await page.fill('#schedule-staff-search','존재하지않는사람');assert.equal(await page.locator('.schedule-roster-row').count(),0);assert.equal(await page.locator('.schedule-month-day').count(),31);assert(await page.locator('#btn-schedule-roster-next').isDisabled());
      assert.equal(await page.locator('.schedule-month-grid').innerText(),calendarBeforeSearch,'member search never limits calendar to matching individuals');assert.equal(await page.locator('.schedule-team-visible').count(),4,'team visibility controls remain available without member matches');
      await page.click('#btn-schedule-view-all');await page.locator('.schedule-team-select').last().click();assert.equal(await page.locator('.schedule-month-grid').innerText(),calendarBeforeSearch,'expanding membership does not change active teams');
      for(const team of ['B조','C조','D조'])await page.locator(`.schedule-team-visible[data-team="${team}"]`).uncheck();
      assert.deepEqual(await page.locator('.schedule-month-day[data-date="2026-05-05"] .schedule-day-team').evaluateAll(nodes=>nodes.map(n=>n.dataset.team)),['A조']);assert((await page.locator('.schedule-month-scope').innerText()).includes('14명'));
      await page.locator('.schedule-team-visible[data-team="A조"]').uncheck();assert.equal(await page.locator('.schedule-day-team').count(),0);assert((await page.locator('.schedule-month-scope').innerText()).includes('체크'));assert.equal(await page.locator('.schedule-month-day').count(),31);
      await page.click('#btn-schedule-view-all');
      assert.deepEqual(await page.locator('.schedule-month-day[data-date="2026-05-05"] .schedule-day-team').evaluateAll(nodes=>nodes.map(n=>n.dataset.team)),['A조','B조','C조','D조'],'stable team order on every date');
      assert.equal(await page.locator('.schedule-month-day[data-date="2026-05-05"] .schedule-day-team[hidden]').count(),0,'four teams fit the standard calendar');
      const fixturePeople=take(await api('listEmployees'),'distinct sample people').filter(e=>seedResult.mainEmployeeIds.includes(e.id));assert.equal(new Set(fixturePeople.map(e=>e.name)).size,56,'56 distinct sample names');assert(!fixturePeople.some(e=>e.name.includes('관제_')),'sample names must be readily distinguishable');
      // Responsive labels are hidden in the standard grid and shown in reading mode.
      // Compare every DOM string and require the actual worker/duty cells to remain rendered.
      const visibleCalendar=async selector=>page.locator(`${selector} .schedule-day-team:not([hidden])`).evaluateAll(rows=>rows.map(row=>{
        const names=row.querySelector('.schedule-day-names'),badge=row.querySelector('.duty-badge');
        const shown=element=>{if(!element)return false;const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;};
        return {date:row.closest('.schedule-month-day').dataset.date,team:row.dataset.team,duty:row.dataset.duty,names:names?.innerText,label:badge?.innerText,visible:shown(names)&&shown(badge)};
      }));
      const normalGrid=await page.locator('.schedule-month-grid').textContent(),normalCells=await visibleCalendar('.schedule-month-grid');assert(normalCells.length>0&&normalCells.every(cell=>cell.visible&&cell.names&&cell.label),'normal worker names and duty labels are rendered');assert.equal(await page.locator('.schedule-day-team-name').first().evaluate(e=>getComputedStyle(e).display),'none','normal compact labels intentionally hidden');
      await page.click('#btn-schedule-reading');await page.waitForSelector('#schedule-reading-dialog[open]');
      assert.equal(await page.locator('#schedule-reading-dialog .schedule-day-names').first().evaluate(e=>getComputedStyle(e).fontSize),'16px','large view uses readable worker names');assert.equal(await page.locator('#schedule-reading-dialog .schedule-day-team-name').first().evaluate(e=>getComputedStyle(e).display),'block','reading mode exposes team labels');
      assert.equal(await page.locator('#schedule-reading-dialog .schedule-month-grid').textContent(),normalGrid,'expansion preserves every calendar DOM string');assert.deepEqual(await visibleCalendar('#schedule-reading-dialog .schedule-month-grid'),normalCells,'expansion preserves exact visible worker/duty content');
      await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('#schedule-reading-dialog').contains(document.activeElement)),'focus remains in native modal');
      await page.locator('#schedule-reading-dialog .schedule-month-day[data-date="2026-05-05"]').click();await page.waitForSelector('#schedule-reading-dialog #schedule-day-modal');await page.keyboard.press('Escape');assert.equal(await page.locator('#schedule-day-modal').count(),0);assert.equal(await page.locator('#schedule-reading-dialog[open]').count(),1,'Escape closes detail before enlarged calendar');
      await page.getByRole('button',{name:'다음 달',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#schedule-reading-dialog')?.open&&document.querySelector('#schedule-reading-dialog h2')?.textContent.includes('6월'));await page.getByRole('button',{name:'이전 달',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#schedule-reading-dialog')?.open&&document.querySelector('#schedule-reading-dialog h2')?.textContent.includes('5월'));
      await page.keyboard.press('Escape');assert.equal(await page.locator('#schedule-reading-dialog').count(),0);assert.equal(await page.locator(':focus').getAttribute('id'),'btn-schedule-reading','focus returns to expansion control');
      const beforeWrites=take(await api('listMonthlySchedules'),'calendar writes').length;await page.getByRole('button',{name:'다음 달',exact:true}).click();await waitReady();assert.equal(await page.locator('#select-schedule-month').inputValue(),'6');assert.equal(await page.locator('.schedule-month-day').count(),30);await page.getByRole('button',{name:'이전 달',exact:true}).click();await waitReady();assert.equal(await page.locator('#select-schedule-month').inputValue(),'5');assert.equal(take(await api('listMonthlySchedules'),'calendar no-write').length,beforeWrites);await page.screenshot({path:path.join(capturesDir,'S17-calendar.png')});
      const original=take(await api('listShiftPatterns',seedResult.mainSiteId),'calendar exception source').find(p=>p.id===seedResult.mainPatternId);take(await api('saveShiftPattern',{...original,holidayPolicy:{version:1,rules:{public:{mode:'off',excludedDutyCodes:[]}},dateExceptions:[{id:'ui04-calendar-exception',from:'2026-05-05',to:'2026-05-05',scope:'team',teamLabel:'A조',reason:'달력 반영 시험',dutyCode:'N',timing:{startTime:'21:00',endTime:'08:00',breakMinutes:60}},{id:'ui04-calendar-person-name',from:'2026-05-05',to:'2026-05-05',scope:'employee',employeeId:seedResult.mainEmployeeIds[0],reason:'주간 근무자 이름 확인',dutyCode:'D',timing:{startTime:'07:00',endTime:'19:00',breakMinutes:60}}]}}),'calendar exception fixture');await page.click('#btn-schedule-preview');await waitReady();await page.click('#btn-schedule-view-all');
      const assignedName=fixturePeople.find(e=>e.id===seedResult.mainEmployeeIds[0]).name,nightName=fixturePeople.find(e=>e.id===seedResult.mainEmployeeIds[4]).name;
      const dayWorker=page.locator('.schedule-month-day[data-date="2026-05-05"] .schedule-day-team[data-team="A조"][data-duty="D"] .schedule-day-names'),nightWorkers=page.locator('.schedule-month-day[data-date="2026-05-05"] .schedule-day-team[data-team="A조"][data-duty="N"] .schedule-day-names');
      assert.equal(await dayWorker.innerText(),assignedName,'daytime exception shows its actual worker');assert((await nightWorkers.innerText()).includes(nightName),'nighttime row shows its actual workers');assert(!(await nightWorkers.innerText()).split('·').includes(assignedName),'do not show daytime exception worker as night worker');assert(!/\d{2}:\d{2}/.test((await page.locator('.schedule-day-names').allTextContents()).join(' ')),'calendar name fields contain workers instead of times');
      await page.locator('.schedule-month-day[data-date="2026-05-05"]').click();await page.waitForSelector('#schedule-day-modal');assert((await page.locator('#schedule-day-modal').innerText()).includes('공휴일'));assert((await page.locator('#schedule-day-modal').innerText()).includes('21:00 ~ 08:00'),'existing exception affects real calendar timing');await page.screenshot({path:path.join(capturesDir,'S17-holiday-exception.png')});await page.keyboard.press('Escape');take(await api('saveShiftPattern',original),'restore calendar fixture');await page.click('#btn-schedule-preview');await waitReady();
    });
    await calendarTarget(newScheduleId || seedResult.mainScheduleId);
    const response = await page.request.get(targetUrl + 'web/app.js'); assert.equal(hash(await response.body()), hash(fs.readFileSync(path.join(repoRoot,'dist/browser/web/app.js'))), 'served bundle must equal dist');
    const sourceMapPath = path.join(repoRoot,'dist/browser/web/app.js.map'), sourceMap = JSON.parse(fs.readFileSync(sourceMapPath,'utf8'));
    for (let i = 0; i < sourceMap.sources.length; i++) assert.equal(fs.readFileSync(path.resolve(path.dirname(sourceMapPath), sourceMap.sources[i]),'utf8'), sourceMap.sourcesContent[i], `sourceMap ${sourceMap.sources[i]}`);
    const actualExports = take(await api('listSchedulePlanExports'), 'all real files'); for (const record of actualExports) { assert(fs.existsSync(record.outputPath)); if (record.publishedPath) assert(fs.existsSync(record.publishedPath)); }
    proof.sourceBinding = { servedSha256: hash(await response.body()), sourceMapSources: sourceMap.sources.length, actualFiles: actualExports.length };
    assert.equal(unexpectedErrors.length, 0, JSON.stringify(unexpectedErrors));
    if (!focusIDs.size) assert(Object.values(expectedRejections).every(Boolean), 'all N01–N12 must have actual assertions');
    const summary = { completedScenarios, failedScenarios, unexpectedErrors, expectedRejections, totalPassed: completedScenarios.length, allPlannedPassed: completedScenarios.length === plannedScenarios.length && !failedScenarios.length, unexpectedErrorsCount: unexpectedErrors.length, url: targetUrl, fixture: seedResult, proof };
    fs.writeFileSync(path.join(resolvedOut,'summary.json'), JSON.stringify(summary,null,2));
    process.stdout.write(`[UI-04] PASS ${completedScenarios.length}/${plannedScenarios.length}; real files=${actualExports.length}\n`);
    if (isPreview) { const cdp = await context.newCDPSession(page); const target = await cdp.send('Browser.getWindowForTarget'); await cdp.send('Browser.setWindowBounds', { windowId: target.windowId, bounds: { windowState: 'maximized' } }); await cdp.send('Emulation.clearDeviceMetricsOverride'); process.stdout.write(`[PREVIEW] Chrome and isolated server retained at ${targetUrl}\n`); return; }
  } catch (error) {
    fs.writeFileSync(path.join(resolvedOut,'summary.json'), JSON.stringify({ completedScenarios, failedScenarios, unexpectedErrors, expectedRejections, proof, allPlannedPassed: false, error: error.stack },null,2));
    process.stderr.write(`[Fatal] ${error.stack}\n`); await cleanup(true); process.exitCode = 1; return;
  }
  await cleanup();
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function verifyWorkbook(preview, record) {
  assert(fs.existsSync(record.outputPath), 'actual workbook'); const bytes = fs.readFileSync(record.outputPath), book = new ExcelJS.Workbook(); await book.xlsx.load(bytes); const sheet = book.getWorksheet(preview.templateSheetName); assert(sheet, 'preview worksheet');
  const updates = new Map(preview.updates.map(u => [u.address,u.value]));
  const normalized = v => v instanceof Date ? v.toISOString().slice(0,10) : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? (() => { const date = new Date(v); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; })() : v ?? null;
  for (const [address,value] of updates) assert.deepEqual(normalized(sheet.getCell(address).value), normalized(value), `Excel ${address}`);
  if (record.publishedPath) assert(bytes.equals(fs.readFileSync(record.publishedPath)), 'representative copied bytes');
  return { outputPath: record.outputPath, bytes: bytes.length, sha256: hash(bytes), verifiedCells: updates.size, copiedBytesEqual: !!record.publishedPath };
}
main().catch(async error => { process.stderr.write(String(error.stack)+'\n'); await cleanup(true); process.exitCode = 1; });

async function controlledCases() {
  const { M, ScheduleScreen, create4Team3ShiftTemplate, draftToPatternRecord, runThreeMonthSimulation } = window.__UI04;
  const original = window.appBridge, results = {}, live = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const ok = data => ({ ok: true, data }), fail = (message = "의도한 조회 실패", errorCode = "CONTROLLED_FAILURE") => ({ ok: false, errorCode, message });
  const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { resolve, promise }; };
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  const close = () => { document.querySelector("#btn-notice-close")?.click(); document.querySelector("#btn-confirm-cancel")?.click(); };
  const context = { year: 2026, publicHolidayDates: ["2026-05-05"], warningSettings: { consecutiveNightLimit: 1, minimumRestMinutes: 900, requireWeeklyHoliday: true, weeklyMaxMinutes: 1800 }, exportDirectory: "X", publishDirectory: "Y" };
  const session = { userId: "controlled", loginId: "controlled", displayName: "시험", role: "admin", sessionToken: "CONTROLLED_NOT_A_SESSION", expiresAt: "2099-01-01", passwordChangeRequired: false };
  const employee = id => ({ id, employeeCode: id, name: id, hireDate: "2020-01-01", status: "active", role: "worker", employmentType: "정규", createdAt: "" });
  const assignment = (id, group = "A조", startDate = "2025-01-01", endDate) => ({ id: id + startDate, employeeId: id, siteId: "s", shiftGroup: group, startDate, endDate, sortOrder: 0, createdAt: "" });
  const draft = create4Team3ShiftTemplate("s"); draft.effectiveFrom = "2025-01-01";
  const pattern = { ...draftToPatternRecord(draft), id: "p", siteId: "s", effectiveFrom: "2025-01-01", status: "active" };
  const roster = await M.prepareRosterEmployees([employee("e")], "2026-05", "s", async () => [assignment("e")]);
  const preview = M.generateSchedulePreview([pattern], roster.rosterEmployees, "2026-05", context.publicHolidayDates, context.warningSettings);
  check(!preview.fatalIssues.length && preview.items.length === 31, "valid controlled template");
  const saved = { id: "saved", siteId: "s", patternId: "p", scheduleMonth: "2026-05", generatedBy: "시험", createdAt: "", items: preview.items };
  const exported = { id: "export1", scheduleId: saved.id, scheduleMonth: saved.scheduleMonth, outputPath: "X/a.xlsx", outputFileName: "a.xlsx", exportedAt: "2026-05-01", updateCount: 31 };
  let writes = 0;
  const base = () => ({ listSites: async () => ok([{ id: "s", name: "시험근무지", status: "active" }]), listShiftPatterns: async () => ok([pattern]), listEmployees: async () => ok([employee("e")]), listMonthlySchedules: async () => ok([saved]), listSchedulePlanExports: async () => ok([]), getSchedulePreparationContext: async () => ok(context), listEmployeeAssignments: async id => ok([assignment(id)]), saveMonthlySchedule: async () => { writes++; return ok(saved); }, previewMonthlySchedulePlan: async () => ok({ scheduleId: saved.id }), exportMonthlySchedulePlan: async () => { writes++; return ok(exported); }, publishSchedulePlanExport: async () => { writes++; return ok({ ...exported, publishStatus: "published", publishedPath: "Y/a.xlsx" }); } });
  const make = (overrides = {}, onSessionExpired) => {
    window.appBridge = { ...base(), ...overrides };
    const host = document.createElement("div"), screen = new ScheduleScreen({ container: host, session, onSessionExpired }); screen.render(); live.push(screen);
    Object.assign(screen, { sites: [{ id: "s", name: "시험근무지", status: "active" }], shiftPatterns: [pattern], employees: [employee("e")], storedSchedules: [saved], selectedSiteId: "s", selectedYear: 2026, selectedMonth: 5, initialDataLoaded: true, prepContext: context, calendarPreviewData: preview });
    screen.updateView(); return screen;
  };
  try {
    let screen = make({ getSchedulePreparationContext: async () => fail("공휴일 조회 실패") });
    await screen.loadScheduleData(); check(screen.loadError?.includes("공휴일") && !screen.calendarPreviewData.items.length && screen.container.querySelector("#btn-schedule-create").disabled, "context failure must block and offer retry");
    check(!!screen.container.querySelector("#btn-schedule-retry"), "retry control"); screen.destroy();
    screen = make({ listEmployeeAssignments: async () => fail("배정 조회 실패") }); await screen.loadScheduleData(); check(screen.calendarPreviewData.fatalIssues.length > 0 && !screen.calendarPreviewData.items.length, "partial roster must block"); screen.destroy(); results.N01 = results.N02 = true;
    const missing = await M.prepareRosterEmployees([employee("e")], "2026-05", "s", async () => [assignment("e", "")]);
    const overlap = await M.prepareRosterEmployees([employee("e")], "2026-05", "s", async () => [assignment("e", "A조", "2026-05-01", "2026-05-17"), assignment("e", "B조", "2026-05-16")]);
    check(overlap.fatalIssues.length > 0 && !overlap.rosterEmployees.length, "overlap must block");
    const emptyPattern = M.generateSchedulePreview([], roster.rosterEmployees, "2026-05"), missingGroup = M.generateSchedulePreview([pattern], missing.rosterEmployees, "2026-05"), noPeople = M.generateSchedulePreview([pattern], [], "2026-05");
    const badCycle = structuredClone(pattern); badCycle.teamCycleAssignments[0].cycleKey = "missing";
    const fourCodes = structuredClone(pattern); fourCodes.cycles[0].steps = ["D", "E", "N", "Z"].map((dutyCode, stepIndex) => ({ stepIndex, dutyCode, startTime: "07:00", endTime: "15:00", breakMinutes: 0 }));
    for (const data of [emptyPattern, missingGroup, noPeople, M.generateSchedulePreview([badCycle], roster.rosterEmployees, "2026-05"), M.generateSchedulePreview([fourCodes], roster.rosterEmployees, "2026-05")]) check(data.fatalIssues.length && !data.items.length, "invalid preparation must generate no items");
    check(!M.isValidYearMonth("2026-13"), "invalid month");
    screen = make(); await screen.changeYear(1899); check(screen.loadError && screen.container.querySelector("#btn-schedule-create").disabled, "invalid year UI must block"); screen.destroy();
    const warnings = M.buildRosterFromStoredSchedule({ ...saved, items: M.getDaysInMonth("2026-05").map(workDate => ({ employeeCode: "e", workDate, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 })) }, context.warningSettings);
    check([warnings.warningStats.consecutiveNight, warnings.warningStats.minRest, warnings.warningStats.weeklyHoliday, warnings.warningStats.weeklyMax].every(n => n > 0), "all four non-default warning rules must calculate");
    screen = make(); screen.calendarPreviewData = { ...warnings, pattern }; screen.updateView(); check(!screen.container.querySelector("#btn-schedule-create").disabled, "warnings alone must not block"); screen.destroy(); results.N03 = true;
    // Half-open moves and public holiday marker are distinct from an employee's OFF day.
    const moving = await M.prepareRosterEmployees([employee("e")], "2026-05", "s", async () => [assignment("e", "A조", "2026-05-01", "2026-05-16"), assignment("e", "B조", "2026-05-16")]);
    const moved = M.generateSchedulePreview([pattern], moving.rosterEmployees, "2026-05", context.publicHolidayDates);
    check(moved.rows.length === 2 && new Set(moved.items.map(i => i.workDate)).size === 31 && moved.items.length === 31, "move must not duplicate dates");
    screen = make(); screen.calendarPreviewData = moved; screen.updateView(); screen.selectedRowKey = moved.rows[1].rowKey; screen.updateView();
    check(screen.container.querySelectorAll(".schedule-roster-row.selected").length === 1 && screen.container.querySelector(".detail-sub").textContent.includes("B조"), "detail selection must use team+employee identity");
    check(JSON.stringify([...screen.container.querySelectorAll(".schedule-month-day.is-public-holiday")].map(e=>e.dataset.date))===JSON.stringify(context.publicHolidayDates), "only actual public holiday can mark calendar date; ordinary OFF is not a public holiday"); screen.destroy();
    const splitDraft = structuredClone(draft); splitDraft.cycles[0].holidayTimeMode = 'split'; splitDraft.cycles[0].weekdayPublicHolidayAsHoliday = true;
    splitDraft.cycles[0].steps.forEach(step => { if (!['O','OFF','X'].includes(step.dutyCode)) { step.holidayStartTime = '08:00'; step.holidayEndTime = '16:30'; step.holidayBreakMinutes = 30; } });
    const splitPattern = { ...draftToPatternRecord(splitDraft), id: 'split', siteId: 's', effectiveFrom: '2025-01-01', status: 'active' };
    const nextPattern = { ...splitPattern, id: 'future', effectiveFrom: '2027-01-01' };
    const ui04 = M.generateSchedulePreview([splitPattern,nextPattern], moving.rosterEmployees, '2026-05', context.publicHolidayDates);
    const ui03 = runThreeMonthSimulation({ draft: splitDraft, startMonth: '2026-05', assignedEmployees: moving.rosterEmployees, publicHolidayDates: new Set(context.publicHolidayDates) }).months[0];
    check(ui04.pattern.id === 'split' && JSON.stringify(ui04.items) === JSON.stringify(ui03.items), 'UI03/UI04 exact date/person/code/start/end/break parity');
    const holidayWork = ui04.items.find(i => i.workDate === '2026-05-05' && ['D','E','N'].includes(i.dutyCode)) || ui04.items.find(i => ['2026-05-02','2026-05-03'].includes(i.workDate) && ['D','E','N'].includes(i.dutyCode));
    check(holidayWork?.startTime === '08:00' && holidayWork?.endTime === '16:30' && holidayWork?.breakMinutes === 30, 'holiday split times');
    results.periodParity = true;
    // Save failures, null preview/export/publish, failed verification and lease release.
    for (const [operation, override] of [["export", { previewMonthlySchedulePlan: async () => fail("엑셀 미리보기 실패") }], ["export", { previewMonthlySchedulePlan: async () => { throw new Error("엑셀 미리보기 연결 실패"); } }], ["export", { exportMonthlySchedulePlan: async () => fail("엑셀 생성 실패") }], ["export", { exportMonthlySchedulePlan: async () => { throw new Error("엑셀 생성 연결 실패"); } }], ["export", { listSchedulePlanExports: async () => fail("엑셀 이력 조회 실패") }], ["publish", { publishSchedulePlanExport: async () => fail("게시 실패") }], ["publish", { publishSchedulePlanExport: async () => { throw new Error("게시 연결 실패"); } }], ["publish", { listSchedulePlanExports: async () => fail("게시 이력 조회 실패") }], ["save", { saveMonthlySchedule: async () => fail("저장 실패") }], ["save", { saveMonthlySchedule: async () => { throw new Error("저장 연결 실패"); } }], ["save", { listMonthlySchedules: async () => fail("저장 확인 조회 실패") }], ["export", { previewMonthlySchedulePlan: async () => ok(null) }], ["export", { exportMonthlySchedulePlan: async () => ok(null) }], ["publish", { publishSchedulePlanExport: async () => ok(null) }]]) {
      close(); screen = make(override); if (operation !== "save") screen.selectedScheduleId = saved.id; if (operation === "publish") screen.currentExportRecord = exported;
      const before = writes;
      if (operation === "save") await screen.handleCreateSchedule(); else if (operation === "export") await screen.handleExportExcel(); else await screen.handlePublishSchedule();
      check(!!document.querySelector("#btn-confirm-ok"), `${operation} confirmation`); document.querySelector("#btn-confirm-ok").click(); await flush();
      check(!screen.isBusy(), `${operation} failure unlock`); check(/[가-힣]/.test(document.querySelector("#operations-notice-modal")?.textContent || document.body.textContent) && !!document.querySelector("#btn-notice-close"), `${operation} must show failure notice`);
      if (operation === "export" && override.previewMonthlySchedulePlan) check(writes === before, "null preview must prevent export"); check(!document.querySelector('#operations-notice-modal h2')?.textContent.includes('완료'), 'failed operation must not claim success');
      if (operation === 'export' && override.exportMonthlySchedulePlan || operation === 'publish' && override.publishSchedulePlanExport) check(writes === before, 'failed bridge write cannot trigger downstream write');
      screen.destroy(); close();
    } results.N09 = true;
    // Reverse reads: second target wins; destroyed host receives no mutations.
    const first = deferred(), second = deferred(); let reads = 0;
    screen = make({ getSchedulePreparationContext: () => ++reads === 1 ? first.promise : second.promise });
    const a = screen.loadScheduleData(); screen.selectedMonth = 6; const b = screen.loadScheduleData(); second.resolve(ok(context)); await b; first.resolve(ok(context)); await a;
    check(screen.getTargetMonthStr() === "2026-06" && screen.calendarPreviewData.dates[0] === "2026-06-01", "reverse response must preserve newer month"); screen.destroy();
    const pending = deferred(); screen = make({ getSchedulePreparationContext: () => pending.promise }); const old = screen.loadScheduleData(); screen.destroy(); screen.container.innerHTML = "new-screen"; pending.resolve(ok(context)); await old; check(screen.container.innerHTML === "new-screen", "destroyed load must not touch replacement");
    screen = make(); await screen.handleCreateSchedule(); const priorWrites = writes; screen.destroy(); document.querySelector("#btn-confirm-ok").click(); await flush(); check(writes === priorWrites && !document.querySelector("#btn-notice-close"), "destroyed confirm must write zero");
    // Global load must survive a tab switch; session expiry must outrank another list error.
    const globalRead = deferred(); screen = make({ listSites: () => globalRead.promise }); screen.initialDataLoaded = false; const loading = screen.loadData(); screen.switchTab("history"); globalRead.resolve(await base().listSites()); await loading; check(screen.initialDataLoaded && screen.storedSchedules.length === 1, "initial load tab race"); screen.destroy(); results.N10 = true;
    // Same-target old publication context is invalid after a newer export is bound.
    const directory = deferred(); screen = make({ getSchedulePreparationContext: () => directory.promise }); screen.selectedScheduleId = saved.id; screen.currentExportRecord = exported;
    const publication = screen.handlePublishSchedule(); screen.currentExportRecord = { ...exported, id: "new-export" }; directory.resolve(ok(context)); await publication; check(!document.querySelector("#btn-confirm-ok"), "old export context must not open confirm"); screen.destroy(); results.N05 = true;
    // A write is single-flight, locks controls, and releases independently of save's new selection.
    for (const operation of ["save", "export", "publish"]) {
      const response = deferred(); let calls = 0;
      const updated = operation === "save" ? { ...saved, id: "new-saved" } : operation === "publish" ? { ...exported, publishStatus: "published", publishedPath: "Y/a.xlsx" } : exported;
      const overrides = { [operation === "save" ? "saveMonthlySchedule" : operation === "export" ? "exportMonthlySchedulePlan" : "publishSchedulePlanExport"]: () => { calls++; return response.promise; }, listMonthlySchedules: async () => ok([saved, { ...saved, id: "new-saved" }]), listSchedulePlanExports: async () => ok([updated]) };
      screen = make(overrides); if (operation !== "save") screen.selectedScheduleId = saved.id; if (operation === "publish") screen.currentExportRecord = exported;
      const action = () => operation === "save" ? screen.handleCreateSchedule() : operation === "export" ? screen.handleExportExcel() : screen.handlePublishSchedule();
      await action(); const button = document.querySelector("#btn-confirm-ok"); button.click(); button.click(); await flush();
      check(calls === 1 && screen.isBusy(), `${operation} double click must be single-flight`); const monthBefore = screen.selectedMonth; await screen.changeMonth(7); check(screen.selectedMonth === monthBefore, "target lock");
      check(screen.container.querySelector("#select-schedule-site").disabled && screen.container.querySelector("#tab-btn-history").disabled, "busy selector/tab lock");
      response.resolve(ok(updated)); await flush(); check(!screen.isBusy(), `${operation} success unlock`); check(!!document.querySelector("#btn-notice-close"), `${operation} verified success notice`); screen.destroy(); close();
    } results.N04 = results.N11 = true;
    screen = make(); screen.currentTab = 'history'; screen.history.setData([{ exportId:'long',scheduleId:'saved',siteId:'s',siteName:'시험',scheduleMonth:'2026-05',fileName:'<img src=x onerror=alert(1)>'+'긴파일명'.repeat(80),outputPath:'X',publishedPath:null,exportedAt:'잘못된 날짜',generatedBy:'시험',status:'생성 완료',publishStatus:'draft',itemCount:31,employeeCount:1 }],null);
    check(!screen.container.querySelector('img') && !screen.container.textContent.includes('Invalid Date') && screen.container.textContent.includes('잘못된 날짜'), 'long or malformed history must render safely'); screen.destroy();
    let expired = 0; screen = make({ getSchedulePreparationContext: async () => fail("세션 만료", "AUTH_SESSION_REQUIRED") }, () => expired++); await screen.loadScheduleData(); await screen.loadScheduleData(); check(expired === 1 && screen.isDestroyed, "later read session expiry host once");
    screen = make({ listSites: async () => fail("일반 실패"), listMonthlySchedules: async () => fail("세션 만료", "AUTH_SESSION_REQUIRED") }, () => expired++); await screen.loadData(); check(expired === 2, "session error must not be hidden behind another failure");
    screen = make({ saveMonthlySchedule: async () => fail("세션 만료", "AUTH_SESSION_REQUIRED") }, () => expired++); await screen.handleCreateSchedule(); const oldConfirm = document.querySelector("#btn-confirm-ok"); oldConfirm.click(); await flush(); check(expired === 3, "write session expiry host once");
    const replacement = make(); const beforeOld = writes; oldConfirm.click(); await flush(); check(writes === beforeOld && !replacement.isDestroyed && !document.querySelector("#btn-notice-close"), "old callback invalid after reauthentication"); replacement.destroy(); results.N12 = true;
    return results;
  } finally { for (const screen of live) screen.destroy(); close(); window.appBridge = original; }
}
