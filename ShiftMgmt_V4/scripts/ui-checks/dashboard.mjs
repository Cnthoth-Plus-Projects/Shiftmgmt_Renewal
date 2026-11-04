import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build } from "esbuild";
import { checkServerHealth } from "../lib/ui-check.mjs";
import { findChrome } from "../lib/find-chrome.mjs";
import { seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import { seedDashboardFixtures, dashboardExpected } from "./dashboard-fixtures.mjs";
import { execFileSync } from "node:child_process";

const startTime = new Date().toISOString();
const startMs = Date.now();
const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rawArgs = process.argv.slice(2);
const focusIDs = new Set(
  (
    rawArgs.find(a => a.startsWith("--focus="))?.slice(8) ||
    rawArgs.find(a => a.startsWith("--scenarios="))?.slice(12) ||
    ""
  )
    .split(",")
    .filter(Boolean)
);
const isPreview = rawArgs.includes("--preview");
const portArg = rawArgs.find(a => a.startsWith("--port="))?.slice(7)?.trim();
const targetPort = portArg ? parseInt(portArg, 10) : isPreview ? 18953 : 18952;
const targetUrl = `http://127.0.0.1:${targetPort}/`;
const outArg = rawArgs
  .find(a => a.startsWith("--out="))
  ?.slice(6)
  ?.replace(/^["']|["']$/g, "")
  ?.trim();
const resolvedOut = path.resolve(
  outArg || path.join(os.tmpdir(), "shiftmgmt-dashboard-ui-" + crypto.randomUUID())
);
const tempRoot = fs.realpathSync(os.tmpdir());
const underTemp = v => {
  const r = path.relative(tempRoot, path.resolve(v));
  return !!r && !r.startsWith("..") && !path.isAbsolute(r);
};
if (!underTemp(resolvedOut)) throw new Error("Output must be a dedicated TEMP child directory");
fs.mkdirSync(resolvedOut, { recursive: true });
const capturesDir = path.join(resolvedOut, "captures");
fs.mkdirSync(capturesDir, { recursive: true });
const userDataDir = path.join(
  os.tmpdir(),
  "shiftmgmt-dashboard-data-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10)
);
fs.mkdirSync(userDataDir, { recursive: true });

const plannedScenarios = Array.from(
  { length: 20 },
  (_, i) => `S${String(i + 1).padStart(2, "0")}`
).filter(id => !focusIDs.size || focusIDs.has(id));
const completedScenarios = [];
const blockedScenarios = [];
const failedScenarios = [];
const unexpectedErrors = [];
const rawConsoleEvents = [];
const expectedRejections = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`N${String(i + 1).padStart(2, "0")}`, false])
);
let allowExpected401 = false;
let serverProcess = null;
let browser = null;
let servedAssets = null;
const observations = {};
const negativeEvidence = {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256Buf = buf => crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
const sha256File = p => sha256Buf(fs.readFileSync(p));

const writeResult = (status, code) => {
  const endTime = new Date().toISOString();
  const elapsedMs = Date.now() - startMs;
  const proof = {
    status,
    plannedScenarios,
    completedScenarios,
    blockedScenarios,
    failedScenarios,
    expectedRejections,
    observations,
    negativeEvidence,
    unexpectedErrors,
    rawConsoleEvents,
    servedAssets,
    argv: process.argv,
    exitCode: code,
    startTime,
    endTime,
    elapsedMs,
    userDataDir,
    out: resolvedOut,
  };
  fs.writeFileSync(path.join(resolvedOut, "results.json"), JSON.stringify(proof, null, 2));
};

async function isPortInUse(port) {
  return new Promise(res => {
    const s = new net.Socket();
    s.setTimeout(500);
    const end = val => {
      s.destroy();
      res(val);
    };
    s.once("connect", () => end(true));
    s.once("timeout", () => end(false));
    s.once("error", () => end(false));
    s.connect(port, "127.0.0.1");
  });
}

async function cleanup() {
  if (browser) {
    try {
      await browser.close();
    } catch {}
    browser = null;
  }
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {}
    serverProcess = null;
  }
}

function readCellStrings(v) {
  if (v == null) return [];
  if (typeof v === "number") return [String(Math.round(v)), Math.round(v).toLocaleString("ko-KR")];
  if (typeof v === "string") return [v];
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return [v.richText.map(x => x.text || "").join("")];
    }
    if ("result" in v && v.result != null) return readCellStrings(v.result);
  }
  return [String(v)];
}

async function inspectWorkbookForAmount(filePath, expectedAmount) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const needlePlain = String(expectedAmount);
  const needleFmt = expectedAmount.toLocaleString("ko-KR");
  let foundAmount = false;
  let nonEmptyCells = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow(row => {
      row.eachCell(cell => {
        nonEmptyCells++;
        for (const text of readCellStrings(cell.value)) {
          if (text.includes(needlePlain) || text.includes(needleFmt)) foundAmount = true;
        }
      });
    });
  }
  return { sheetCount: wb.worksheets.length, nonEmptyCells, foundAmount };
}

async function run() {
  try {
    if (await isPortInUse(targetPort)) throw new Error(`Port ${targetPort} is already in use.`);
    const credentialsPath = path.join(userDataDir, "data", "bootstrap-credentials.json");
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    const env = {
      ...process.env,
      PORT: String(targetPort),
      HOST: "127.0.0.1",
      SHIFTMGMT_PORT: String(targetPort),
      SHIFTMGMT_DATA_DIR: userDataDir,
      SHIFTMGMT_USER_DATA_DIR: userDataDir,
      SHIFTMGMT_BOOTSTRAP_CREDENTIALS_FILE: credentialsPath,
      SHIFTMGMT_UI_BOOTSTRAP_FILE: credentialsPath,
      NODE_ENV: "production",
    };
    const { ensureAuthBootstrapCredentials } = await import(
      pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js"))
        .href
    );
    ensureAuthBootstrapCredentials({ userDataPath: userDataDir, env });

    const serverScript = path.join(repoRoot, "dist", "server", "main", "server.js");
    const dialogControl = path.join(resolvedOut, "dialog-control.json");
    fs.writeFileSync(dialogControl, JSON.stringify({ mode: "save" }));
    const serverEntry = `const fs=require('node:fs'),path=require('node:path');const control=${JSON.stringify(dialogControl)},root=${JSON.stringify(userDataDir)};let count=0;const s=require(${JSON.stringify(serverScript)});s.startServer({dialogBridge:{showDialog:async r=>{const c=JSON.parse(fs.readFileSync(control,'utf8'));if(r.operation==='saveFile'){if(c.mode==='cancel')return{ok:true,cancelled:true};const dir=path.join(root,'dialog-exports');fs.mkdirSync(dir,{recursive:true});return{ok:true,cancelled:false,path:path.join(dir,String(++count).padStart(3,'0')+'-'+path.basename(r.defaultPath))};}return{ok:true,cancelled:true};},dispose:async()=>{}}});`;
    serverProcess = spawn(process.execPath, isPreview ? [serverScript] : ["-e", serverEntry], {
      cwd: repoRoot,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLogs = "";
    serverProcess.stdout.on("data", d => {
      serverLogs += d.toString();
    });
    serverProcess.stderr.on("data", d => {
      const msg = d.toString();
      serverLogs += msg;
      if (!msg.includes("ExperimentalWarning")) process.stderr.write(`[Server stderr] ${msg}\n`);
    });

    let isHealthy = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const res = await checkServerHealth(targetUrl, 2000);
        if (res?.ok) {
          isHealthy = true;
          break;
        }
      } catch {}
    }
    if (!isHealthy) throw new Error("Server failed to respond healthy:\n" + serverLogs);

    // 실제 제공되는 /web/app.js 및 /web/dashboard.css 바이트/SHA-256 대조 (§8.4)
    const [appJsRes, cssRes] = await Promise.all([
      fetch(`${targetUrl}web/app.js`),
      fetch(`${targetUrl}web/dashboard.css`),
    ]);
    const appJsBuf = Buffer.from(await appJsRes.arrayBuffer());
    const cssBuf = Buffer.from(await cssRes.arrayBuffer());
    const distAppJs = path.join(repoRoot, "dist", "browser", "web", "app.js");
    const distCss = path.join(repoRoot, "dist", "browser", "web", "dashboard.css");
    servedAssets = {
      appJs: {
        servedBytes: appJsBuf.length,
        servedSha256: sha256Buf(appJsBuf),
        distBytes: fs.statSync(distAppJs).size,
        distSha256: sha256File(distAppJs),
      },
      dashboardCss: {
        servedBytes: cssBuf.length,
        servedSha256: sha256Buf(cssBuf),
        distBytes: fs.statSync(distCss).size,
        distSha256: sha256File(distCss),
      },
    };
    assert.equal(servedAssets.appJs.servedSha256, servedAssets.appJs.distSha256);
    assert.equal(servedAssets.dashboardCss.servedSha256, servedAssets.dashboardCss.distSha256);

    try {
      seedBootstrapSecrets(credentialsPath);
    } catch {}

    const chrome = findChrome();
    browser = await chromium.launch({
      executablePath: typeof chrome === "object" ? chrome.path : chrome,
      headless: !isPreview,
    });
    const context = await browser.newContext({
      viewport: isPreview ? null : { width: 1707, height: 825 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();

    page.on("pageerror", err => {
      rawConsoleEvents.push({ kind: "pageerror", text: err.message });
      unexpectedErrors.push(`pageerror: ${err.message}`);
    });
    page.on("console", msg => {
      if (msg.type() === "error") {
        const t = msg.text();
        const isExpectedAuth =
          (allowExpected401 && t.includes("401")) ||
          (t.includes("api/auth/session") && t.includes("401")) ||
          t.includes("favicon");
        rawConsoleEvents.push({ kind: "console.error", text: t, expected: isExpectedAuth });
        if (!isExpectedAuth) unexpectedErrors.push(`console.error: ${t}`);
      }
    });

    const credsRaw = fs.readFileSync(credentialsPath, "utf-8");
    const adminCreds = JSON.parse(credsRaw).credentials?.["user-admin"];
    assert.ok(adminCreds, "user-admin credentials found");

    const performLogin = async (loginId, password) => {
      allowExpected401 = true;
      await page.goto(isPreview ? `${targetUrl}?developmentPreview=1` : targetUrl, { waitUntil: "networkidle" });
      allowExpected401 = false;
      await page.locator("#login-id").fill(loginId);
      await page.locator("#login-password").fill(password);
      await page.locator("button[type='submit']").click();
      const mode = await Promise.race([
        page
          .locator("#l4-btn-submit")
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => "L4"),
        page
          .locator(".btn-logout")
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => "SHELL"),
      ]).catch(() => "TIMEOUT");
      if (mode === "L4") {
        const nextPw = isPreview ? "ShiftTest1234!" : "Ui06!" + crypto.randomUUID() + "b8";
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

    const adminPassword = await performLogin(adminCreds.loginId, adminCreds.password);
    const sMb = (
      await build({
        stdin: {
          contents: `import * as M from './src/web/screens/schedule-model.ts'; window.__SCENARIO_MODEL = M;`,
          resolveDir: repoRoot,
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2022",
      })
    ).outputFiles[0].text;
    await page.evaluate(sMb);
    await page.exposeFunction("__scenarioVerifyFile", async input => {
      assert.ok(fs.existsSync(input.outputPath));
      if (input.publishedPath) assert.ok(fs.existsSync(input.publishedPath));
    });

    const fixtureResult = await seedDashboardFixtures({ page, isolatedRoot: userDataDir });
    process.stdout.write(
      `[UI-07] Seeded ${fixtureResult.totalCalculations} calculations, ${fixtureResult.approvalHistoryCount} reviews, ${fixtureResult.pastVersionCount} past versions\n`
    );

    const api = (method,...args)=>page.evaluate(({method,args})=>window.appBridge[method](...args),{method,args});
    const take = r=>{assert.ok(r?.ok,r?.message||'API failed');return r.data;};
    const ready = ()=>page.waitForFunction(()=>document.querySelector('#dashboard-root')?.getAttribute('aria-busy')==='false');
    const open = async()=>{await page.locator('button[data-id="dashboard"]').click();await page.locator('#dashboard-root').waitFor();await ready();};
    const reset = async()=>{await page.locator('#dashboard-reset').click();await ready();};
    const refresh = async()=>{await page.locator('#dashboard-refresh').click();await ready();};
    const neg=(id,evidence)=>{expectedRejections[id]=true;negativeEvidence[id]=evidence;};
    const step=async(id,fn)=>{if(focusIDs.size&&!focusIDs.has(id))return;const result=await fn();observations[id]=result;completedScenarios.push(id);process.stdout.write(`${id} PASS\n`);};
    const readKpis=()=>page.evaluate(()=>{const text=k=>document.querySelector('#dashboard-kpi-'+k).textContent;const time=text('minutes');return{amount:Number(text('amount').replace(/\D/g,'')),minutes:Number(time.match(/([\d,]+)시간/)?.[1].replace(/,/g,'')||0)*60+Number(time.match(/([\d,]+)분/)?.[1].replace(/,/g,'')||0),employees:Number(text('employees').replace(/\D/g,'')),count:Number(text('count').replace(/\D/g,''))};});
    const assertKpis=async expected=>{const got=await readKpis();for(const k of ['amount','minutes','employees','count'])assert.equal(got[k],expected[k],k);return got;};
    const installTap=()=>page.evaluate(()=>{window.__dashCalls=[];window.__dashResults=[];for(const key of ['exportDashboardChartData','exportDashboardReport']){const original=window.appBridge[key];window.appBridge[key]=async input=>{window.__dashCalls.push({key,input:structuredClone(input)});const r=await original(input);window.__dashResults.push(r);return r;};}});
    const withRows=async(rows,fn)=>{await page.evaluate(rows=>{window.__dashOriginalList=window.appBridge.listCalculationResults;window.appBridge.listCalculationResults=async()=>({ok:true,data:rows});},rows);try{await refresh();return await fn();}finally{await page.evaluate(()=>{window.appBridge.listCalculationResults=window.__dashOriginalList;delete window.__dashOriginalList;});if(await page.locator('#dashboard-root').count())await refresh();}};
    const exportsRoot=path.join(userDataDir,'dialog-exports');
    const fileCount=()=>fs.existsSync(exportsRoot)?fs.readdirSync(exportsRoot).length:0;
    const artifact=file=>{assert.ok(underTemp(file));assert.ok(fs.existsSync(file));return{path:file,bytes:fs.statSync(file).size,sha256:sha256File(file)};};
    const clickExport=async selector=>{
      const before=await page.evaluate(()=>window.__dashCalls.length);assert.ok(!(await page.locator(selector).isDisabled()));await page.locator(selector).click();
      await page.waitForFunction(n=>window.__dashResults.length>n,before,{timeout:30000});await ready();
      const result=await page.evaluate(()=>window.__dashResults.at(-1));assert.ok(result.ok,result.message);
      const input=await page.evaluate(()=>window.__dashCalls.at(-1).input);const file=await page.locator('#dashboard-output-path').innerText();assert.equal(file,result.data.outputPath);
      return {file,input,data:result.data,artifact:artifact(file)};
    };
    const inspectXlsx=async(result,report=false)=>{
      const book=new ExcelJS.Workbook();await book.xlsx.readFile(result.file);const sections=report?result.input.sections:[result.input];const proofs=[];
      for(const section of sections){const sheet=book.getWorksheet(section.sheetName);assert.ok(sheet);let header=0;sheet.eachRow((row,n)=>{if(row.getCell(1).text===section.columns[0].header&&row.getCell(section.columns.length).text===section.columns.at(-1).header)header=n;});assert.ok(header,'actual headers');
        section.rows.forEach((r,i)=>section.columns.forEach((c,j)=>{const v=sheet.getRow(header+i+1).getCell(j+1).value;if(typeof r[c.key]==='number')assert.ok(Math.abs(Number(v)-r[c.key])<1e-7,`${c.key} row${i}`);else assert.equal(v,r[c.key]);}));
        let allText='';sheet.eachRow(row=>row.eachCell(cell=>{allText+=cell.text+'\n';}));assert.ok(allText.includes(result.input.filters.dataSource));assert.ok(allText.includes(result.input.filters.periodLabel));
        const images=sheet.getImages().length;if(section.chartImageDataUrl)assert.ok(images>0);proofs.push({sheet:section.sheetName,rows:section.rows.length,images,total:section.rows.reduce((n,r)=>n+Number(r.totalAmount||0),0)});
      }
      return{...result.artifact,sheets:book.worksheets.length,sections:proofs};
    };
    const inspectPdf=result=>{
      const code="import fitz,json,re,sys;d=fitz.open(sys.argv[1]);t=re.sub(r'\\s','', ''.join(p.get_text() for p in d));print(json.dumps({'pages':len(d),'images':sum(len(p.get_images()) for p in d),'text':t}))";
      const d=JSON.parse(execFileSync('python',['-c',code,result.file],{encoding:'utf8',windowsHide:true}));assert.ok(d.pages>0&&d.images>0);const sections=result.input.sections||[result.input];
      for(const section of sections){const total=section.rows.reduce((n,r)=>n+Number(r.totalAmount||0),0);assert.ok(d.text.includes(total.toLocaleString('en-US')),`PDF amount ${total}`);}
      assert.ok(d.text.includes('2026'));return{...result.artifact,pages:d.pages,images:d.images,textChars:d.text.length,amountsVerified:true};
    };
    const originalRows=fixtureResult.records;
    await open();await installTap();

    if(isPreview){
      await page.locator('.btn-logout').click();await page.locator('#btn-development-autofill').waitFor();
      await page.goto(`${targetUrl}?developmentPreview=0`,{waitUntil:'networkidle'});await page.locator('#login-id').waitFor();assert.equal(await page.locator('#btn-development-autofill').count(),0);
      await page.goto(`${targetUrl}?developmentPreview=1`,{waitUntil:'networkidle'});await page.locator('#btn-development-autofill').waitFor();await page.screenshot({path:path.join(capturesDir,'login-autofill.png')});await page.locator('#btn-development-autofill').click();assert.ok(await page.locator('#login-password').inputValue()===adminPassword);await page.locator('button[type="submit"]').click();await page.locator('.btn-logout').waitFor();await open();
      const preview={url:`${targetUrl}?developmentPreview=1`,selectedMenu:'dashboard',userDataDir,out:resolvedOut,helperPid:process.pid,servedAssets,autofillCheck:{persistedAfterLogout:true,disabledModeHidden:true,fieldsMatch:true,normalLoginSuccess:true}};
      fs.writeFileSync(path.join(resolvedOut,'preview.json'),JSON.stringify(preview,null,2));await page.screenshot({path:path.join(capturesDir,'preview.png'),fullPage:true});process.stdout.write('[PREVIEW_READY] '+JSON.stringify({url:preview.url,helperPid:process.pid,out:resolvedOut})+'\n');await new Promise(()=>{});
    }

    await step('S01',async()=>{
      assert.equal((await page.locator('#header-current-title').innerText()).trim(),'대시보드');await page.getByRole('button',{name:'홈',exact:true}).click();await page.locator('.home-container').waitFor({timeout:10000});await page.locator('#card-progress-prep').waitFor();assert.equal(await page.locator('#dashboard-root').count(),0);
      await page.locator('button[data-id="schedule-status"]').click();await page.locator('#schedule-screen').waitFor();await open();return{homeAndSchedulePreserved:true,destroyOnLeave:true};
    });
    await step('S02',async()=>{
      const sizes=[{width:1920,height:945},{width:1707,height:825},{width:1366,height:768},{width:928,height:919},{width:900,height:700}],checks=[];
      for(const size of sizes){await page.setViewportSize(size);await sleep(240);const result=await page.evaluate(()=>{const v=document.querySelector('.dashboard-rank-viewport'),f=document.querySelector('.dashboard-rank-footer'),main=document.querySelector('.page-content'),root=document.querySelector('#dashboard-root'),footer=document.querySelector('.footer-statusbar').getBoundingClientRect(),mb=main.getBoundingClientRect();const panels=[...document.querySelectorAll('.dashboard-card')].map(c=>{const r=c.getBoundingClientRect();return{key:c.dataset.chart||'ranking',top:r.top,bottom:r.bottom,left:r.left,right:r.right};});return{documentOverflow:document.documentElement.scrollWidth>innerWidth,documentHeight:document.documentElement.scrollHeight,innerHeight,mainClient:main.clientHeight,mainScroll:main.scrollHeight,rootClient:root.clientHeight,rootScroll:root.scrollHeight,mainTop:mb.top,footerTop:footer.top,panels,client:v.clientHeight,scroll:v.scrollHeight,footerBottom:f.getBoundingClientRect().bottom,inlineStyles:root.querySelectorAll('[style]').length,canvas:[...root.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,ready:c.dataset.ready}))};});assert.equal(result.documentOverflow,false);assert.ok(result.documentHeight<=result.innerHeight+1,JSON.stringify(result));assert.ok(result.mainScroll<=result.mainClient+1&&result.rootScroll<=result.rootClient+1,JSON.stringify(result));assert.ok(result.panels.every(p=>p.top>=result.mainTop-1&&p.bottom<=result.footerTop+1&&p.left>=0&&p.right<=size.width),JSON.stringify(result));assert.ok(result.footerBottom<=result.footerTop+1);assert.ok(result.scroll<=result.client+1,JSON.stringify(result));assert.equal(result.inlineStyles,0);assert.ok(result.canvas.every(c=>c.w>0&&c.h>=35&&c.ready==='true'),JSON.stringify(result));checks.push({size,...result});
        if(size.width===900){await page.locator('#dashboard-filter-toggle').click();assert.equal(await page.locator('#dashboard-filter-toggle').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#dashboard-site').isVisible());await page.locator('#dashboard-category').selectOption('substitute');await assertKpis(dashboardExpected(originalRows,'2026-05',{category:'substitute'}));await page.keyboard.press('Escape');assert.equal(await page.locator('#dashboard-filter-toggle').getAttribute('aria-expanded'),'false');await reset();for(const key of ['trend','site','ratio']){await page.locator(`[data-chart="${key}"] summary`).click();assert.ok(await page.locator(`#dashboard-data-${key}`).isVisible());assert.ok(await page.evaluate(()=>document.querySelector('#dashboard-root').scrollHeight<=document.querySelector('#dashboard-root').clientHeight+1));await page.keyboard.press('Escape');assert.equal(await page.locator(`[data-chart="${key}"] details`).getAttribute('open'),null);}}
      }
      await page.setViewportSize({width:1707,height:825});await sleep(150);await page.screenshot({path:path.join(capturesDir,'s02-dashboard.png'),fullPage:true});return{checks};
    });
    await step('S03',async()=>{await reset();const got=await assertKpis(fixtureResult.expected);const rows=take(await api('listCalculationResults'));assert.equal(rows.length,127);assert.equal(new Set(rows.map(r=>r.status)).size,4);assert.equal(rows.filter(r=>r.workDate.startsWith('2026-05')).length,97);return{...got,currentRows:rows.length,statuses:4,source:fixtureResult.sourceKind};});
    await step('S04',async()=>{
      await reset();await page.locator('#dashboard-month').selectOption('04');await assertKpis(dashboardExpected(originalRows,'2026-04'));await page.locator('#dashboard-month').selectOption('all');await assertKpis(dashboardExpected(originalRows,'2026'));await page.locator('#dashboard-month').selectOption('01');assert.equal((await readKpis()).count,0);await reset();
      const a=structuredClone(originalRows[0]);a.id='boundary';a.workDate='2026-01-02';a.earlyPayoutDate='2025-12-31';await withRows([a],async()=>{await page.locator('#dashboard-month').selectOption('01');assert.equal((await readKpis()).amount,a.snapshot.totalAllowanceAmount);assert.ok((await page.locator('#dashboard-trend-period').innerText()).includes('2025-08'));});await reset();return{workMonthNotEarlyMonth:true,monthlyAnnualAndBoundary:true};
    });
    await step('S05',async()=>{
      await reset();const target=fixtureResult.expected.selected.find(r=>r.snapshot.businessCategoryCode==='legal-holiday');assert.ok(target);await page.locator('#dashboard-site').selectOption(target.siteName);await page.locator('#dashboard-category').selectOption('legalHoliday');await page.locator('#dashboard-employee').selectOption(target.employeeCode);await assertKpis(dashboardExpected(originalRows,'2026-05',{site:target.siteName,category:'legalHoliday',employee:target.employeeCode}));await reset();
      const two=structuredClone(fixtureResult.expected.selected.slice(0,2));two[0].id='identity1';two[1].id='identity2';two[0].employeeCode='TEST-A';two[1].employeeCode='TEST-B';two.forEach(r=>r.employeeName='동명이인');await withRows(two,async()=>{assert.equal((await readKpis()).employees,2);assert.equal(await page.locator('#dashboard-ranking tr[data-code]').count(),2);});neg('N11',{sameNameSeparateCodes:true,kind:'response fault injection; finance baseline uses real API'});return{combinedActualFilters:true,identityInjectionSeparate:true};
    });
    await step('S06',async()=>{
      await reset();const e=fixtureResult.expected;const sumCells=async id=>page.locator(id).evaluate(el=>{const heads=[...el.querySelectorAll('th')].map(e=>e.textContent);const col=heads.findIndex(h=>h==='합계(원)'||h==='금액(원)');return [...el.querySelectorAll('tbody tr')].reduce((n,r)=>n+Number(r.children[col].textContent.replace(/[^\d.-]/g,'')),0);});assert.equal(await sumCells('#dashboard-data-site'),e.amount);assert.equal(await sumCells('#dashboard-data-ratio'),e.amount);await assertKpis(e);
      await page.locator('#dashboard-category').selectOption('substitute');await assertKpis(dashboardExpected(originalRows,'2026-05',{category:'substitute'}));await reset();const source=take(await api('listCalculationResults'));assert.deepEqual(source,originalRows);return{expectedAmount:e.amount,expectedMinutes:e.minutes,sourceUnchanged:true};
    });
    await step('S07',async()=>{
      await reset();const canvas=page.locator('#dashboard-canvas-ratio');const pixels=await canvas.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let colored=0;for(let i=0;i<d.length;i+=4)if(d[i+3]&&Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>70)colored++;return colored;});assert.ok(pixels>500);const before=await canvas.evaluate(c=>c.toDataURL());await canvas.focus();await page.keyboard.press('ArrowRight');await sleep(190);assert.equal(await canvas.getAttribute('data-active-index'),'1');assert.ok(await page.locator('#dashboard-tooltip-ratio').evaluate(e=>e.classList.contains('is-visible')));assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),before);await page.keyboard.press('Escape');await page.locator('[data-chart="ratio"] summary').focus();await page.keyboard.press('Enter');assert.ok(await page.locator('#dashboard-data-ratio').isVisible());await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});await canvas.focus();await page.keyboard.press('ArrowRight');await sleep(80);const still=await canvas.evaluate(c=>c.toDataURL());await sleep(80);assert.equal(await canvas.evaluate(c=>c.toDataURL()),still);assert.equal(await page.locator('#dashboard-tooltip-ratio').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});return{coloredPixels:pixels,keyboardTable:true,keyboardArcEmphasis:true,reducedMotionStable:true};
    });
    await step('S08',async()=>{
      await reset();const months=await page.locator('#dashboard-data-trend tbody tr').count();assert.equal(months,6);const trendBox=await page.locator('#dashboard-canvas-trend').boundingBox();await page.mouse.move(trendBox.x+trendBox.width*.92,trendBox.y+trendBox.height*.5);await sleep(190);assert.equal(await page.locator('#dashboard-canvas-trend').getAttribute('data-active-index'),'5');assert.ok((await page.locator('#dashboard-tooltip-trend').innerText()).includes('2026-05'));await page.screenshot({path:path.join(capturesDir,'hover-trend.png')});await page.locator('[data-chart="trend"] summary').click();assert.ok(await page.locator('#dashboard-data-trend').isVisible());const last=await page.locator('#dashboard-data-trend tbody tr').last().innerText();assert.ok(last.includes(fixtureResult.expected.amount.toLocaleString('ko-KR')));await page.locator('[data-chart="trend"] summary').click();const widths=[];for(const width of [1366,1920,1707]){await page.setViewportSize({width,height:825});await sleep(160);widths.push(await page.locator('#dashboard-canvas-trend').evaluate(c=>c.width));}assert.ok(new Set(widths).size>1);await page.locator('#dashboard-month').selectOption('all');assert.equal(await page.locator('#dashboard-data-trend tbody tr').count(),12);await reset();return{months,widths,annualMonths:12};
    });
    await step('S09',async()=>{await reset();assert.equal(await page.locator('#dashboard-data-site tbody tr').count(),new Set(fixtureResult.expected.selected.map(r=>r.siteName)).size);const c=page.locator('#dashboard-canvas-site');const before=await c.evaluate(c=>c.toDataURL());const box=await c.boundingBox();await page.mouse.move(box.x+box.width*.55,box.y+12);await sleep(190);assert.equal(await c.getAttribute('data-active-index'),'0');assert.ok(await page.locator('#dashboard-tooltip-site').evaluate(e=>e.classList.contains('is-visible')));assert.notEqual(await c.evaluate(c=>c.toDataURL()),before);await page.locator('[data-chart="site"] summary').click();assert.ok(await page.locator('#dashboard-data-site').isVisible());await page.keyboard.press('Escape');return{sites:new Set(fixtureResult.expected.selected.map(r=>r.siteName)).size,canvasAndData:true,pointerHighlight:true};});
    await step('S10',async()=>{
      await reset();const seen=[];let pages=0;do{const codes=await page.locator('#dashboard-ranking tr[data-code]').evaluateAll(rs=>rs.map(r=>r.dataset.code));seen.push(...codes);pages++;const next=page.locator('#btn-dashboard-next');if(await next.isDisabled())break;await next.click();}while(pages<100);assert.equal(new Set(seen).size,fixtureResult.expected.employees);assert.equal(seen.length,new Set(seen).size);assert.deepEqual([...seen].sort(),fixtureResult.expected.codes);
      await page.locator('#btn-dashboard-first').click();await page.locator('#dashboard-ranking tr[data-code]').first().click();await page.locator('#btn-dashboard-number-2').click();const anchor=await page.locator('#dashboard-ranking tr[data-code]').first().getAttribute('data-code');await page.setViewportSize({width:1366,height:768});await sleep(180);await page.setViewportSize({width:1707,height:825});await sleep(180);assert.equal(await page.locator('#btn-dashboard-number-2').getAttribute('aria-current'),'page');assert.ok((await page.locator('#dashboard-ranking tr[data-code]').evaluateAll(rs=>rs.map(r=>r.dataset.code))).includes(anchor));await page.locator('#dashboard-rank-sort').selectOption('minutes');const text=await page.locator('#dashboard-ranking tbody').innerText();assert.ok(text.length>0);await page.locator('#dashboard-rank-sort').selectOption('amount');await page.locator('#btn-dashboard-number-2').click();await refresh();assert.equal(await page.locator('#btn-dashboard-number-2').getAttribute('aria-current'),'page');await page.locator('#dashboard-category').selectOption('overtime');assert.equal(await page.locator('#btn-dashboard-number-1').getAttribute('aria-current'),'page');await reset();return{unique:seen.length,pages,keptPageAfterRefresh:true};
    });
    await step('S11',async()=>{await reset();const outputs=[];for(const key of ['trend','site','ratio','ranking']){const r=await clickExport(`[data-export="${key}"][data-format="xlsx"]`);const total=r.input.rows.reduce((n,row)=>n+Number(row.totalAmount||0),0);assert.equal(total,key==='trend'?dashboardExpected(originalRows,'2026').amount:fixtureResult.expected.amount);outputs.push(await inspectXlsx(r));}return{outputs,actualService:true,controlledSaveDialog:true};});
    await step('S12',async()=>{await reset();const chart=await clickExport('[data-export="trend"][data-format="pdf"]');const report=await clickExport('[data-report="pdf"]');assert.equal(report.data.sectionCount,4);return{chart:inspectPdf(chart),report:inspectPdf(report)};});
    await step('S13',async()=>{await reset();const r=await clickExport('[data-report="xlsx"]');assert.equal(r.data.sectionCount,4);const proof=await inspectXlsx(r,true);assert.equal(proof.sheets,5);assert.equal(proof.sections[3].rows,fixtureResult.expected.employees);return proof;});
    await step('S14',async()=>{await reset();const before=fileCount();const logBefore=take(await api('listAccessLogs',{actionType:'dashboard-export'})).filter(r=>r.actionType==='dashboard-export').length;fs.writeFileSync(dialogControl,JSON.stringify({mode:'cancel'}));try{await page.locator('[data-export="site"]').click();await ready();assert.ok((await page.locator('#dashboard-export-result').innerText()).includes('취소'));assert.equal(fileCount(),before);assert.equal(await page.locator('#dashboard-output-path').count(),0);assert.equal(take(await api('listAccessLogs',{actionType:'dashboard-export'})).filter(r=>r.actionType==='dashboard-export').length,logBefore);}finally{fs.writeFileSync(dialogControl,JSON.stringify({mode:'save'}));}neg('N05',{filesDelta:0,successLogsDelta:0});await clickExport('[data-export="site"]');return{cancelledWithoutFileOrLog:true,retrySucceeded:true};});
    await step('S15',async()=>{await reset();await page.evaluate(()=>{window.__dashRestoreExport=window.appBridge.exportDashboardChartData;window.appBridge.exportDashboardChartData=async()=>({ok:false,errorCode:'DASHBOARD_CHART_EXPORT_FAILED',message:'시험 출력 실패'});});try{await page.locator('[data-export="site"]').click();await ready();assert.ok((await page.locator('#dashboard-export-result').innerText()).includes('시험 출력 실패'));assert.equal(await page.locator('#dashboard-output-path').count(),0);}finally{await page.evaluate(()=>window.appBridge.exportDashboardChartData=window.__dashRestoreExport);}neg('N06',{explicitFailureNoSuccessPath:true});await clickExport('[data-export="site"]');await page.locator('#dashboard-copy-path').click();await page.waitForFunction(()=>document.querySelector('#dashboard-copy-path')?.textContent==='복사했습니다');return{failureVisible:true,retryAndClipboard:true};});
    await step('S16',async()=>{await reset();const before=await readKpis();await page.evaluate(()=>{window.__dashRestoreList=window.appBridge.listCalculationResults;window.appBridge.listCalculationResults=async()=>({ok:false,errorCode:'TEST_READ_FAILED',message:'시험 조회 실패'});});try{await refresh();assert.ok((await page.locator('#dashboard-notice').innerText()).includes('이전 조회'));assert.deepEqual(await readKpis(),before);assert.ok(await page.locator('[data-report="pdf"]').isDisabled());}finally{await page.evaluate(()=>window.appBridge.listCalculationResults=window.__dashRestoreList);}await refresh();await assertKpis(fixtureResult.expected);neg('N01',{staleNotEmpty:true,retrySucceeded:true});return{staleLockedAndRecovered:true};});
    await step('S17',async()=>{const roles=[];for(const role of ['operator','planner','reviewer']){const loginId=`ui07-${role}`,password='Ui07!'+crypto.randomUUID()+'a7';take(await api('saveOperationUser',{loginId,displayName:'대시보드 시험 '+role,role,status:'active',password}));take(await api('signOut'));await performLogin(loginId,password);await open();await installTap();await assertKpis(fixtureResult.expected);const r=await clickExport('[data-export="ranking"]');assert.ok(fs.existsSync(r.file));roles.push({role,exported:true});take(await api('signOut'));await performLogin(adminCreds.loginId,adminPassword);await open();await installTap();}roles.push({role:'admin',read:true});return{roles,serverGuardUnchanged:true};});
    await step('S18',async()=>{
      await reset();await page.evaluate(()=>{window.__dashRestoreExport=window.appBridge.exportDashboardChartData;window.__dashBusyCalls=0;window.appBridge.exportDashboardChartData=async input=>{window.__dashBusyCalls++;return new Promise(resolve=>{window.__dashRelease=async()=>resolve(await window.__dashRestoreExport(input));});};});
      try{await page.locator('[data-export="trend"][data-format="xlsx"]').click();assert.ok(await page.locator('#dashboard-year').isDisabled());assert.ok(await page.locator('[data-report="pdf"]').isDisabled());await page.locator('button[data-id="workforce"]').click();await page.locator('#btn-notice-close').waitFor();assert.equal((await page.locator('#header-current-title').innerText()).trim(),'대시보드');await page.locator('#btn-notice-close').click();await page.locator('.btn-logout').click();await page.locator('#btn-notice-close').waitFor();await page.locator('#btn-notice-close').click();assert.equal(await page.evaluate(()=>window.__dashBusyCalls),1);await page.evaluate(()=>window.__dashRelease());await ready();}finally{await page.evaluate(()=>window.appBridge.exportDashboardChartData=window.__dashRestoreExport);}
      neg('N07',{calls:1,otherButtonsFiltersNavigationLogoutLocked:true});neg('N04',{filterChangeBlockedDuringSnapshot:true});
      await page.evaluate(()=>{window.__dashRestoreList=window.appBridge.listCalculationResults;window.appBridge.listCalculationResults=()=>new Promise(resolve=>window.__dashLate=()=>resolve({ok:false,errorCode:'AUTH_SESSION_REQUIRED',message:'이전 화면 만료'}));});await page.locator('#dashboard-refresh').click();await page.locator('button[data-id="workforce"]').click();await page.locator('#workforce-root').waitFor();await page.evaluate(()=>window.__dashLate());await sleep(100);assert.equal(await page.locator('#login-id').count(),0);assert.ok(await page.locator('#workforce-root').isVisible());await page.evaluate(()=>window.appBridge.listCalculationResults=window.__dashRestoreList);await open();neg('N08',{oldAuthResponseIgnoredAfterDestroy:true});
      await page.evaluate(()=>{window.__dashRestoreList=window.appBridge.listCalculationResults;window.appBridge.listCalculationResults=async()=>({ok:false,errorCode:'AUTH_SESSION_REQUIRED',message:'현재 세션 만료'});});await page.locator('#dashboard-refresh').click();await page.locator('#login-id').waitFor();take(await api('signOut'));
      allowExpected401=true;const unauthorized=await api('exportDashboardChartData',{chartKey:'ranking',chartTitle:'서명없음검사',sheetName:'검사',filters:{year:'2026',month:'5월',siteName:'전체',employeeName:'전체',dataSource:'시험'},columns:[{key:'totalAmount',header:'원',format:'currency'}],rows:[{totalAmount:1}]});allowExpected401=false;assert.equal(unauthorized.errorCode,'AUTH_SESSION_REQUIRED');neg('N09',{currentExpiredHandled:true,signedOutDirectExportRejected:unauthorized.errorCode});await performLogin(adminCreds.loginId,adminPassword);await open();await installTap();return{busyAndLifetimeAndSessionVerified:true};
    });
    await step('S19',async()=>{await reset();const malicious=structuredClone(fixtureResult.expected.selected[0]);malicious.employeeName='<img src=x onerror="window.__dashXss=1">';malicious.siteName='<script>window.__dashXss=2</script>';await withRows([malicious],async()=>{assert.equal(await page.evaluate(()=>window.__dashXss||0),0);assert.equal(await page.locator('#dashboard-root img,#dashboard-root script,#dashboard-root [style]').count(),0);assert.ok((await page.locator('#dashboard-ranking').innerText()).includes('<img'));});neg('N10',{safeText:true,inlineStyleNodes:0});return{unsafeLabelFaultInjectionSafe:true,unexpectedErrors:unexpectedErrors.length};});
    await step('S20',async()=>{
      await reset();await withRows([],async()=>{assert.equal((await readKpis()).count,0);assert.ok(await page.locator('[data-report="pdf"]').isDisabled());});const zero=structuredClone(fixtureResult.expected.selected[0]);zero.snapshot.totalAllowanceAmount=0;zero.snapshot.lines.forEach(l=>l.amount=0);zero.snapshot.breakdown.totalWorkMinutes=0;await withRows([zero],async()=>{const k=await readKpis();assert.equal(k.count,1);assert.equal(k.amount,0);assert.ok(!(await page.locator('[data-export="ranking"]').isDisabled()));assert.ok(!(await page.locator('#dashboard-root').innerText()).includes('NaN'));});neg('N03',{normalEmptyAndZeroDistinct:true});
      const errors=[];for(const kind of ['missingCode','duplicate','badSnapshot']){const r=structuredClone(fixtureResult.expected.selected[0]);if(kind==='missingCode')r.employeeCode='';if(kind==='badSnapshot')r.snapshot.totalAllowanceAmount=NaN;await withRows(kind==='duplicate'?[r,r]:[r],async()=>{assert.ok((await page.locator('#dashboard-notice').innerText()).includes('집계할 수 없는'));assert.ok(await page.locator('[data-report="pdf"]').isDisabled());errors.push(kind);});}neg('N02',{invalidResponsesRejected:errors});
      const before=await page.evaluate(()=>window.__dashCalls.length);await page.evaluate(()=>{window.__dashToDataURL=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/svg+xml,invalid';});try{await page.locator('[data-export="trend"][data-format="xlsx"]').click();await ready();assert.ok((await page.locator('#dashboard-export-result').innerText()).includes('PNG'));assert.equal(await page.evaluate(()=>window.__dashCalls.length),before);}finally{await page.evaluate(()=>HTMLCanvasElement.prototype.toDataURL=window.__dashToDataURL);}const callsBeforeHidden=await page.evaluate(()=>window.__dashCalls.length);await page.locator('#dashboard-canvas-trend').evaluate(c=>c.hidden=true);try{await page.locator('[data-export="trend"][data-format="xlsx"]').click();await ready();assert.ok((await page.locator('#dashboard-export-result').innerText()).includes('차트를 준비'));assert.equal(await page.evaluate(()=>window.__dashCalls.length),callsBeforeHidden);}finally{await page.locator('#dashboard-canvas-trend').evaluate(c=>c.hidden=false);await page.waitForFunction(()=>document.querySelector('#dashboard-canvas-trend').dataset.ready==='true');}neg('N12',{unsupportedCaptureBlockedBeforeApi:true,zeroSizeCachedCaptureBlocked:true});
      const pending=take(await api('listCalculationResults')).find(r=>r.status==='pending');assert.ok(pending);take(await api('setCalculationEarlyPayout',{calculationId:pending.id,earlyPayoutDate:'2026-03-15'}));await refresh();await assertKpis(fixtureResult.expected);return{errors,realServiceRefreshPreservesWorkMonth:true};
    });
    if(!focusIDs.size){assert.equal(completedScenarios.length,20);assert.ok(Object.values(expectedRejections).every(Boolean));}
    assert.equal(unexpectedErrors.length,0,JSON.stringify(unexpectedErrors));assert.equal(completedScenarios.length,plannedScenarios.length);
    writeResult('PASSED',0);process.stdout.write('[RESULT] '+JSON.stringify({status:'PASSED',passed:completedScenarios.length,negativePassed:Object.values(expectedRejections).filter(Boolean).length,out:resolvedOut})+'\n');
  } catch(err) {
    failedScenarios.push({message:err.message,stack:err.stack});writeResult('FAILED',1);try{const pages=browser?.contexts()[0]?.pages();if(pages?.length)await pages[0].screenshot({path:path.join(capturesDir,'failure.png'),fullPage:true});}catch{}process.stderr.write((err.stack||err.message)+'\n');process.exitCode=1;
  } finally {if(!isPreview||process.exitCode)await cleanup();}
}
run();

