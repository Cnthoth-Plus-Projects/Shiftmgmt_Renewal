import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build } from "esbuild";
import { checkServerHealth } from "../lib/ui-check.mjs";
import { findChrome } from "../lib/find-chrome.mjs";
import { seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import { seedPerformanceFixtures } from "./performance-fixtures.mjs";
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
const targetPort = portArg ? parseInt(portArg, 10) : isPreview ? 18931 : 18930;
const targetUrl = `http://127.0.0.1:${targetPort}/`;
const outArg = rawArgs
  .find(a => a.startsWith("--out="))
  ?.slice(6)
  ?.replace(/^["']|["']$/g, "")
  ?.trim();
const resolvedOut = path.resolve(
  outArg || path.join(os.tmpdir(), "shiftmgmt-perf-ui-" + crypto.randomUUID())
);
const tempRoot = fs.realpathSync(os.tmpdir());
const underTemp = val => {
  const rel = path.relative(tempRoot, path.resolve(val));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
if (!underTemp(resolvedOut)) throw new Error("Output must be a dedicated TEMP child directory");
fs.mkdirSync(resolvedOut, { recursive: true });
const capturesDir = path.join(resolvedOut, "captures");
fs.mkdirSync(capturesDir, { recursive: true });
const userDataDir = path.join(
  os.tmpdir(),
  "shiftmgmt-perf-data-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10)
);
fs.mkdirSync(userDataDir, { recursive: true });
const resourcesDir = path.join(
  os.tmpdir(),
  "shiftmgmt-perf-res-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10)
);
fs.mkdirSync(resourcesDir, { recursive: true });
const plannedScenarios = Array.from(
  { length: 20 },
  (_, i) => `S${String(i + 1).padStart(2, "0")}`
).filter(id => !focusIDs.size || focusIDs.has(id));
const completedScenarios = [];
const failedScenarios = [];
const unexpectedErrors = [];
const expectedRejections = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`N${String(i + 1).padStart(2, "0")}`, false])
);
let serverProcess = null;
let browser = null;
let proof = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function isPortInUse(port) {
  return new Promise(res => {
  const s = new net.Socket();
  s.setTimeout(500);
  s.once("connect", () => {
    s.destroy();
    res(true);
  });
  s.once("timeout", () => {
    s.destroy();
    res(false);
  });
  s.once("error", () => {
    s.destroy();
    res(false);
  });
  s.connect(port, "127.0.0.1");
  });
}
async function cleanup(force = false) {
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
  if (!isPreview || force) {
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(resourcesDir, { recursive: true, force: true });
  } catch {}
  }
}
async function run() {
  try {
  if (await isPortInUse(targetPort)) {
    throw new Error(`Port ${targetPort} is already in use.`);
  }
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
    NODE_ENV: "production"
  };
  const { ensureAuthBootstrapCredentials } = await import(
    pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js")).href
  );
  ensureAuthBootstrapCredentials({ userDataPath: userDataDir, env });
  const serverScript = path.join(repoRoot, "dist", "server", "main", "server.js");
  serverProcess = spawn(
    process.execPath,
    [serverScript],
    {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let serverLogs = "";
  serverProcess.stdout.on("data", d => {
    serverLogs += d.toString();
  });
  serverProcess.stderr.on("data", d => {
    const msg = d.toString();
    serverLogs += msg;
    if (!msg.includes("ExperimentalWarning")) {
      process.stderr.write(`[Server stderr] ${msg}\n`);
    }
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
  if (!isHealthy) {
    throw new Error("Server failed to respond healthy:\n" + serverLogs);
  }
  try {
    seedBootstrapSecrets(credentialsPath);
  } catch {}
  const chrome = findChrome();
  const chromePath = typeof chrome === "object" ? chrome.path : chrome;
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: !isPreview
  });
  const context = await browser.newContext({
    viewport: isPreview ? null : { width: 1707, height: 825 }
  });
  const page = await context.newPage();
  page.on("pageerror", err => unexpectedErrors.push(`pageerror: ${err.message}`));
  page.on("console", msg => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        !text.includes("404") &&
        !text.includes("401") &&
        !text.includes("403") &&
        !text.includes("favicon") &&
        !text.includes("net::ERR_") &&
        !text.includes("Applying inline style violates")
      ) {
        unexpectedErrors.push(`console.error: ${text}`);
      }
    }
  });
  const credsRaw = fs.readFileSync(credentialsPath, "utf-8");
  const bootstrapData = JSON.parse(credsRaw);
  const adminCreds = bootstrapData.credentials?.["user-admin"];
  assert.ok(adminCreds, "user-admin credentials found");
  try {
    seedBootstrapSecrets(credentialsPath);
  } catch {}
  const performLogin = async (loginId, password) => {
    await page.goto(targetUrl, { waitUntil: "networkidle" });
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
      const nextPw = "Ui05!" + crypto.randomUUID() + "a7";
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
  await page.waitForSelector(".btn-logout", { timeout: 15000 });
  const scenarioModelBundle = (
    await build({
      stdin: {
        contents: `import * as M from './src/web/screens/schedule-model.ts'; window.__SCENARIO_MODEL = M;`,
        resolveDir: repoRoot,
        loader: "ts"
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2022"
    })
  ).outputFiles[0].text;
  await page.evaluate(scenarioModelBundle);
  await page.exposeFunction("__scenarioVerifyFile", async input => {
    assert.ok(fs.existsSync(input.outputPath)); if(input.publishedPath)assert.ok(fs.existsSync(input.publishedPath));
  });
  const { seedOperationalScenarios } = await import(
    pathToFileURL(path.resolve(repoRoot, "scripts/ui-checks/operational-scenarios.mjs")).href
  );
  await seedOperationalScenarios({ page, isolatedRoot: userDataDir });
  const fixtureResult = await seedPerformanceFixtures({ page, isolatedRoot: userDataDir });
  process.stdout.write(
    `[UI-05] Seeded ${fixtureResult.totalGeneratedRows} rows across ${fixtureResult.createdExcelFiles.length} excel files\n`
  );
  const observations={}, negativeEvidence={}, blockedScenarios=[];proof={observations,negativeEvidence,blockedScenarios};
  const api=(method,...args)=>page.evaluate(async({method,args})=>window.appBridge[method](...args),{method,args});
  const take=r=>{assert.ok(r?.ok,r?.message);return r.data;};
  const rows=async(scope="pending")=>take(await api("listPerformanceOverview",{scheduleMonth:"2026-05",approvalScope:scope})).groups.flatMap(g=>g.rows);
  const ready=()=>page.waitForFunction(()=>document.querySelector('.performance-screen')?.getAttribute('aria-busy')==='false');
  const open=async()=>{await page.locator('button[data-id="performance-intake"]').click();await ready();};
  const refresh=async()=>{await page.locator('#btn-perf-reparse').click();await ready();};
  const clear=async()=>{await page.locator('#perf-tab-all').click();await ready();await page.locator('#perf-filter-status').selectOption('all');await page.locator('#perf-filter-site').selectOption('all');await page.locator('#perf-filter-search').fill('');};
  const select=async row=>{await clear();await page.locator('#perf-filter-scope').selectOption(row.sourceDirectoryType==='approved'?'approved':'pending');await ready();await page.locator('#perf-filter-search').fill(row.entry.employeeCode);let found=false;for(let n=0;n<30;n++){found=await page.evaluate(id=>{const e=[...document.querySelectorAll('.perf-data-row')].find(x=>x.dataset.rowId===id);if(e)e.click();return !!e;},row.rowId);if(found)break;const next=page.locator('#btn-perf-table-next');if(await next.isDisabled())break;await next.click();}assert.ok(found,'row reachable '+row.rowId);};
  const neg=(id,evidence)=>{expectedRejections[id]=true;negativeEvidence[id]=evidence;};
  const step=async(id,fn)=>{if(focusIDs.size&&!focusIDs.has(id))return;const result=await fn();observations[id]=result||{verified:true};if(result?.blocked)blockedScenarios.push({id,reason:result.blocked});else completedScenarios.push(id);process.stdout.write(id+' '+(result?.blocked?'BLOCKED':'PASS')+'\n');};
  const count=async()=>take(await api('listCalculationResults')).length;
  const approve=async row=>{await select(row);await page.locator('#btn-perf-approve').click();await page.locator('#perf-approve-current-rate').waitFor();await page.locator('#btn-modal-confirm').click();await page.waitForFunction(()=>!document.querySelector('#perf-approve-rate'));await ready();};
  await open();
  if(isPreview){const preview={url:targetUrl,userDataDir,resourcesDir,out:resolvedOut,helperPid:process.pid,fixture:fixtureResult};fs.writeFileSync(path.join(resolvedOut,'preview.json'),JSON.stringify(preview,null,2));await page.screenshot({path:path.join(capturesDir,'preview.png')});process.stdout.write('[PREVIEW_READY] '+JSON.stringify({url:targetUrl,out:resolvedOut})+'\n');await new Promise(()=>{});}
  await step('S01',async()=>{await page.locator('button[data-id="workforce"]').click();await page.locator('#workforce-root').waitFor();await open();assert.ok(await page.locator('#perf-kpi-container').isVisible());});
  await step('S02',async()=>{const dims=[];for(const size of [{width:1707,height:825},{width:1920,height:945}]){await page.setViewportSize(size);const a=await page.locator('#perf-table-container').boundingBox(),b=await page.locator('#perf-detail-container').boundingBox();assert.ok(Math.abs(a.y-b.y)<=2&&Math.abs(a.y+a.height-b.y-b.height)<=2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));dims.push({size,a,b});}await page.setViewportSize({width:1707,height:825});await page.screenshot({path:path.join(capturesDir,'layout.png')});return dims;});
  await step('S03',async()=>{
    await clear();await page.locator('#perf-filter-scope').selectOption('pending');await ready();
    const expected=(await rows()).map(r=>r.rowId).sort(),seen=[];
    assert.ok(expected.length>=50);
    await page.locator('#btn-perf-table-next').click();
    const selected=await page.locator('.perf-data-row.selected').getAttribute('data-row-id');
    assert.ok(selected,'page navigation selects a row on the displayed page');
    const secondPage=await page.locator('.perf-footer-info').innerText();
    await page.waitForTimeout(11000); // More than two real five-second refresh intervals.
    await ready();
    assert.equal(await page.locator('.perf-footer-info').innerText(),secondPage,'polling must retain page two');
    assert.equal(await page.locator('.perf-data-row.selected').getAttribute('data-row-id'),selected);
    await page.locator('#btn-perf-table-first').click();
    for(let n=0;n<50;n++){
      seen.push(...await page.locator('.perf-data-row').evaluateAll(es=>es.map(e=>e.dataset.rowId)));
      assert.equal(await page.locator('.perf-data-row.selected').count(),1);
      if(await page.locator('#btn-perf-table-next').isDisabled())break;
      await page.locator('#btn-perf-table-next').click();
    }
    assert.deepEqual([...seen].sort(),expected);
    assert.equal(new Set(seen).size,seen.length);
    const anchor=await page.locator('.perf-data-row.selected').getAttribute('data-row-id');
    for(const size of [{width:1366,height:768},{width:900,height:700},{width:1707,height:825}]){
      await page.setViewportSize(size);await page.waitForTimeout(150);
      assert.equal(await page.locator('.perf-data-row.selected').getAttribute('data-row-id'),anchor,'resize retains visible selection');
    }
    await page.locator('#btn-perf-table-first').click();
    const firstId=await page.locator('.perf-data-row').first().getAttribute('data-row-id');
    const first=(await rows()).find(r=>r.rowId===firstId);
    const site=take(await api('listSites')).find(s=>s.name===first.entry.siteName);
    const saved=take(await api('listMonthlySchedules')).find(s=>s.siteId===site.id&&s.scheduleMonth==='2026-05');
    const pattern=take(await api('listShiftPatterns')).find(p=>p.id===saved.patternId);
    assert.ok(pattern?.dutyTypes?.some(d=>d.id==='duty-D'));
    const renamed=take(await api('saveShiftPattern',{...pattern,dutyTypes:pattern.dutyTypes.map(d=>({...d,label:d.id==='duty-D'?'1근':d.id==='duty-N'?'2근':d.label}))}));
    assert.equal(renamed.id,pattern.id);
    await refresh();
    const badge=page.locator('.perf-data-row').first().locator('.perf-duty-badge');
    assert.equal(await badge.innerText(),'1근');
    assert.equal(await page.locator('#perf-detail-container .perf-duty-badge').innerText(),'1근');
    const colorBefore=await badge.evaluate(e=>({color:getComputedStyle(e).backgroundColor,transition:getComputedStyle(e).transitionDuration}));
    const colorHandle=await page.waitForFunction(()=>{const badge=document.querySelector('.perf-data-row .perf-duty-badge');const color=badge&&getComputedStyle(badge).backgroundColor;return color==='rgb(232, 245, 238)'?color:false;},{},{timeout:15000});
    const colorAfter=await colorHandle.jsonValue();
    fs.writeFileSync(path.join(resolvedOut,'s03-color-timing.json'),JSON.stringify({before:colorBefore,after:colorAfter,expected:'rgb(232, 245, 238)'},null,2));
    assert.equal(colorAfter,'rgb(232, 245, 238)');
    return {rows:seen.length,pollingPageRetained:true,resizeSelectionRetained:true,configuredName:'1근',configuredColor:'D'};
  });
  await step('S04',async()=>{const a=await page.locator('#perf-table-container').boundingBox();await page.locator('.perf-group-row').first().click();assert.ok(await page.locator('.perf-group-toggle-icon.collapsed').count());await page.locator('.perf-group-row').first().click();const b=await page.locator('#perf-table-container').boundingBox();assert.equal(a.height,b.height);});
  await step('S05',async()=>{await page.locator('#perf-filter-site').selectOption('판교연구센터');for(const tab of ['holiday','substitute','overtime','all']){await page.locator('#perf-tab-'+tab).click();await ready();assert.equal(await page.locator('#perf-filter-site').inputValue(),'판교연구센터');}await page.locator('#perf-filter-density').selectOption('compact');assert.ok(await page.locator('.density-compact').count());await page.locator('#perf-filter-density').selectOption('normal');await clear();});
  await step('S06',async()=>{await page.locator('#perf-filter-search').fill('없는사번999');assert.equal(await page.locator('.perf-data-row').count(),0);await page.locator('#perf-filter-search').fill('');const original=await page.evaluate(()=>{window.__ui05Calc=window.appBridge.listCalculationResults;window.appBridge.listCalculationResults=async()=>({ok:false,errorCode:'UI_TEST',message:'수당 조회 시험 오류'});return true;});assert.ok(original);await refresh();assert.ok((await page.locator('#perf-table-container').innerText()).includes('수당 조회에 실패'));await page.evaluate(()=>window.appBridge.listCalculationResults=window.__ui05Calc);await refresh();assert.ok(await page.locator('.perf-data-row').count());return {failureVisible:true,recovered:true};});
  await step('S07',async()=>{const actual=take(await api('getFileWatchStatus'));await page.locator('#btn-perf-intake-status').click();assert.ok((await page.locator('.perf-dialog-content').innerText()).includes(actual.isRunning?'감시 실행 중':'감시 정지'));await page.keyboard.press('Tab');await page.keyboard.press('Escape');assert.equal(await page.locator('.perf-modal-backdrop').count(),0);return {running:actual.isRunning};});
  await step('S08',async()=>{const all=[...await rows(),...await rows('approved')],predicates={approved:r=>r.approvalStatus==='approved',pending:r=>r.approvalStatus==='pending',rejected:r=>r.approvalStatus==='rejected',reapprovalPending:r=>r.reapprovalStatus==='pending'&&r.needsReapproval,reapprovalCompleted:r=>r.reapprovalStatus==='completed',locked:r=>r.isChangeLocked,nonpayable:r=>r.approvalStatus==='non-payable',holiday:r=>r.entry.section==='legal-holiday'};for(const [name,pred]of Object.entries(predicates)){const r=all.find(pred);assert.ok(r,'real fixture '+name);await select(r);assert.ok(await page.locator('#perf-detail-container .perf-badge').count());}return Object.fromEntries(Object.entries(predicates).map(([n,p])=>[n,all.filter(p).length]));});
  await step('S09',async()=>{const calc=take(await api('listCalculationResults'))[0],all=[...await rows(),...await rows('approved')],r=all.find(x=>x.fileId===calc.fileId&&x.entryId===calc.entryId);assert.ok(r);await select(r);const text=await page.locator('#perf-detail-container').innerText();assert.ok(text.includes(r.entry.employeeCode)&&text.includes(calc.snapshot.totalAllowanceAmount.toLocaleString('ko-KR')));return {entry:r.entryId,amount:calc.snapshot.totalAllowanceAmount};});
  await step('S10',async()=>{const r=(await rows()).find(r=>r.reapprovalStatus==='completed');assert.ok(r);await select(r);const c=take(await api('getPerformanceComparison',{fileId:r.fileId,entryId:r.entryId}));assert.ok(c.approvedRecord);await page.locator('#btn-perf-compare').click();await page.locator('#perf-compare-title').waitFor();assert.ok((await page.locator('.perf-dialog-content').innerText()).includes(r.entry.employeeName));await page.keyboard.press('Escape');await page.locator('#btn-perf-history').click();await page.locator('#perf-history-title').waitFor();assert.ok((await page.locator('.perf-dialog-content').innerText()).includes(r.entry.employeeName));await page.keyboard.press('Escape');});
  await step('S11',async()=>{const r=(await rows()).find(r=>r.canApprove&&r.entry.section==='overtime');assert.ok(r);await select(r);const before=await count();await page.locator('#btn-perf-approve').click();await page.locator('#btn-modal-cancel').click();assert.equal(await count(),before);neg('N04',{cancelledWithoutMutation:true});await page.evaluate(()=>{const b=window.appBridge,fn=b.approvePendingFile.bind(b);window.__ui05Calls=[];b.approvePendingFile=async p=>{window.__ui05Calls.push(p);return fn(p);};});await approve(r);const calls=await page.evaluate(()=>window.__ui05Calls);assert.equal(calls.length,1);assert.ok(calls[0].manualHourlyRate===undefined);assert.equal(await count(),before+1);const duplicate=await api('approvePendingFile',{fileId:r.fileId,entryId:r.entryId});assert.equal(duplicate.ok,false);assert.equal(await count(),before+1);neg('N02',{requests:calls.length,duplicateCode:duplicate.errorCode,calculations:before+1});return {normalRateUnchanged:true,stored:true};});
  await step('S12',async()=>{const r=(await rows()).find(r=>r.canApprove&&r.entry.section==='overtime');assert.ok(r);await select(r);await page.locator('#btn-perf-approve').click();assert.equal(await page.locator('#perf-manual-rate-toggle').isChecked(),false);await page.locator('#perf-manual-rate-toggle').check();await page.locator('#perf-approve-rate').fill('0');await page.locator('#btn-modal-confirm').click();assert.ok(await page.locator('#perf-approve-error').isVisible());await page.locator('#perf-approve-rate').fill(String(r.entry.hourlyRate));await page.locator('#btn-modal-confirm').click();assert.ok((await page.locator('#perf-approve-error').innerText()).includes('사유'));await page.locator('#perf-approve-comment').fill('현장 증빙에 따른 시급 확인');await page.locator('#btn-modal-confirm').click();await page.waitForFunction(()=>!document.querySelector('#perf-approve-rate'));await ready();const history=take(await api('listApprovalHistory'));assert.ok(history.some(h=>h.fileId===r.fileId&&h.entryId===r.entryId&&h.comment?.includes('현장 증빙')));neg('N05',{zeroBlocked:true,reasonRequired:true,overrideStored:true});});
  await step('S13',async()=>{const r=(await rows()).find(r=>r.canApprove);assert.ok(r);await select(r);await page.locator('#btn-perf-reject').click();await page.locator('#btn-reject-confirm').click();assert.ok(await page.locator('#perf-reject-error').isVisible());neg('N03',{blankReasonBlocked:true});await page.locator('#perf-reject-reason').fill('증빙 확인 필요');await page.locator('#btn-reject-confirm').click();await page.waitForFunction(()=>document.querySelector('#perf-reject-error')?.textContent.includes('2단계'));const response=await api('rejectPendingFile',{fileId:r.fileId,entryId:r.entryId,rejectionReason:'증빙 확인 필요'});assert.equal(response.errorCode,'PERFORMANCE_REJECT_UNSUPPORTED');await page.locator('#btn-reject-cancel').click();return {blocked:'Existing protected API explicitly returns PERFORMANCE_REJECT_UNSUPPORTED. No rejection success or history mutation is claimed.',code:response.errorCode};});
  await step('S14',async()=>{let all=await rows(),r=all.find(r=>r.reapprovalStatus==='pending');assert.ok(r);const id=r.fileId;const early=await api('finalizeReapprovedFile',{fileId:id});assert.equal(early.ok,false);neg('N06',{incompleteFinalizeCode:early.errorCode});for(let n=0;n<30;n++){all=await rows();r=all.find(x=>x.fileId===id&&x.reapprovalStatus==='pending'&&!x.isChangeLocked&&x.approvalStatus!=='non-payable');if(!r)break;await approve(r);}const summary=take(await api('listPerformanceOverview',{scheduleMonth:'2026-05'})).reapprovalFiles.find(f=>f.fileId===id);assert.ok(summary?.canFinalize);r=(await rows()).find(r=>r.fileId===id);await select(r);await page.locator('#btn-perf-finalize-file').click();await page.locator('#btn-finalize-confirm').click();await page.waitForFunction(()=>!document.querySelector('#btn-finalize-confirm'));await ready();assert.ok((await rows('approved')).some(x=>x.entry.siteName===r.entry.siteName));return {file:id,finalized:true};});
  await step('S15',async()=>{
    const all=await rows(),approvedBefore=await rows('approved');
    const r=all.find(x=>x.canApprove&&x.entry.section==='overtime'&&!approvedBefore.some(y=>y.entry.siteName===x.entry.siteName)&&all.filter(y=>y.fileId===x.fileId).every(y=>y.canApprove||y.approvalStatus==='non-payable')&&all.some(y=>y.fileId===x.fileId&&y.canApprove&&y.entry.section==='legal-holiday'));
    assert.ok(r,'independent first-time source with payable holiday rows for W07');
    const id=r.fileId;
    for(const x of all.filter(x=>x.fileId===id&&x.canApprove))take(await api('approvePendingFile',{fileId:id,entryId:x.entryId,comment:'W07 기준 파일 정상 승인'}));
    await refresh();
    const approved=await rows('approved'),archived=approved.find(x=>x.fileId===id&&x.entryId===r.entryId);
    fs.writeFileSync(path.join(resolvedOut,'w07-fixture-state.json'),JSON.stringify({target:r,archived,detail:take(await api('getPerformanceFileDetail',{fileId:id}))},null,2));
    assert.ok(archived,'W07 source is actually archived');
    const original=take(await api('getPerformanceFileDetail',{fileId:id})),rawOriginal=original.entries.find(e=>e.id===r.entryId);
    const employee=take(await api('listEmployees')).find(e=>e.employeeCode===rawOriginal.employeeCode);assert.ok(employee);
    const newRate=rawOriginal.hourlyRate+2222;
    take(await api('saveEmployeeWageRate',{employeeId:employee.id,hourlyRate:newRate,effectiveFrom:rawOriginal.workDate,reason:'W07 복귀 전 근무일 시급 정정'}));
    assert.equal(take(await api('getPerformanceFileDetail',{fileId:id})).entries.find(e=>e.id===r.entryId).hourlyRate,rawOriginal.hourlyRate);
    const historyBefore=take(await api('listApprovalHistory')),calculationsBefore=take(await api('listCalculationResults'));
    await select(archived);
    let returnPosts=0;const trackReturn=request=>{if(request.url().includes('/api/performance:return-to-pending'))returnPosts++;};page.on('request',trackReturn);
    await page.locator('#btn-perf-return-pending').click();
    assert.ok((await page.locator('.perf-modal-danger-box').innerText()).includes('함께 지워지며 되살릴 수 없습니다'));
    assert.ok((await page.locator('.perf-modal-desc').innerText()).includes('근무일 기준 시급'));
    await page.locator('#btn-return-cancel').click();assert.equal(returnPosts,0);
    assert.deepEqual(take(await api('listApprovalHistory')),historyBefore);assert.deepEqual(take(await api('listCalculationResults')),calculationsBefore);
    await page.locator('#btn-perf-return-pending').click();
    const response=page.waitForResponse(res=>res.url().includes('/api/performance:return-to-pending')&&res.request().method()==='POST');
    await page.locator('#btn-return-confirm').evaluate(button=>{button.click();button.click();});
    const returned=take(await(await response).json());await page.locator('#btn-notice-confirm').waitFor();
    assert.equal(returnPosts,1);page.off('request',trackReturn);
    assert.equal(returned.id,id);assert.equal(returned.directoryType,'pending');assert.equal(returned.wageReapplication.status,'completed');assert.equal(returned.wageReapplication.unresolvedEntryCount,0);
    assert.ok((await page.locator('.perf-dialog-content').innerText()).includes('시급 '+returned.wageReapplication.appliedEntryCount+'건 적용'));
    const target=returned.entries.find(e=>e.id===r.entryId);assert.equal(target.hourlyRate,newRate);assert.equal(target.sourceSignature,rawOriginal.sourceSignature);assert.equal(target.startTime,rawOriginal.startTime);assert.equal(target.totalWorkMinutes,rawOriginal.totalWorkMinutes);
    const historyAfterReturn=take(await api('listApprovalHistory')),calculationsAfterReturn=take(await api('listCalculationResults'));
    assert.equal(historyAfterReturn.filter(h=>h.fileId===id).length,0);assert.equal(calculationsAfterReturn.filter(c=>c.fileId===id).length,0);
    assert.deepEqual(historyAfterReturn,historyBefore.filter(h=>h.fileId!==id));assert.deepEqual(calculationsAfterReturn,calculationsBefore.filter(c=>c.fileId!==id));
    await page.screenshot({path:path.join(capturesDir,'w07-return-result.png')});
    // W07 preview stops with the actual return result notice open.
    await page.locator('#btn-notice-confirm').click();await ready();
    const pending=(await rows()).find(x=>x.fileId===id&&x.entryId===r.entryId);assert.ok(pending);assert.equal(pending.entry.hourlyRate,newRate);assert.equal(pending.canApprove,true);
    await select(pending);assert.ok((await page.locator('#perf-detail-container').innerText()).includes(newRate.toLocaleString('ko-KR')+'원'));
    await page.screenshot({path:path.join(capturesDir,'w07-pending-current-wage.png')});
    await approve(pending);
    assert.equal(take(await api('listCalculationResults')).find(c=>c.fileId===id&&c.entryId===r.entryId).hourlyRate,newRate);
    return {file:id,explicitWholeFileReturn:true,w07:{oldRate:rawOriginal.hourlyRate,newRate,workDate:rawOriginal.workDate,result:returned.wageReapplication,cancelPreserved:true,duplicatePostsBlocked:true,sourceFieldsPreserved:true,onlyOwnHistoryDeleted:true,noAutomaticApproval:true,reapprovalUsesCurrentRate:true}};
  });
  await step('S16',async()=>{const all=[...await rows(),...await rows('approved')],locked=all.find(r=>r.isChangeLocked);assert.ok(locked);const n=await count();for(const [method,input]of [['approvePendingFile',{fileId:locked.fileId,entryId:locked.entryId}],['returnApprovedFileToPending',{fileId:locked.fileId}],['hideApprovedRow',{approvalId:locked.latestApprovalId}]]){const res=await api(method,input);assert.equal(res.ok,false);negativeEvidence[method]=res.errorCode;}assert.equal(await count(),n);neg('N07',{lockedOperationsBlocked:true});const r=(await rows('approved')).find(r=>r.approvalStatus==='approved'&&!r.isChangeLocked);assert.ok(r);await select(r);const detail=take(await api('getPerformanceFileDetail',{fileId:r.fileId}));assert.ok(underTemp(detail.filePath));const away=detail.filePath+'.ui05-test-away';fs.renameSync(detail.filePath,away);try{await page.locator('#btn-perf-open-file').click();await page.locator('#btn-notice-confirm').waitFor();assert.ok((await page.locator('.perf-dialog-content').innerText()).includes('파일'));await page.locator('#btn-notice-confirm').click();neg('N10',{missingSourceReported:true});}finally{fs.renameSync(away,detail.filePath);}const calcBefore=await count();assert.ok(await page.locator('#btn-perf-hide-row').isDisabled());const denied=await api('hideApprovedRow',{approvalId:r.latestApprovalId});assert.equal(denied.errorCode,'PERFORMANCE_ALLOWANCE_HISTORY_EXISTS');assert.equal(await count(),calcBefore);assert.ok(fs.existsSync(detail.filePath));return {blocked:'Existing API blocks hiding calculated approvals.',code:denied.errorCode};});
  await step('S17',async()=>{const r=(await rows()).find(r=>r.canApprove);assert.ok(r);const results=[];for(const role of ['operator','planner']){const password='Ui05!'+crypto.randomUUID()+'a7',loginId='ui05-'+role;take(await api('saveOperationUser',{loginId,displayName:'시험 '+role,role,status:'active',password}));take(await api('signOut'));await performLogin(loginId,password);await open();await select(r);assert.ok(await page.locator('#btn-perf-approve').isDisabled());const before=await count(),res=await api('approvePendingFile',{fileId:r.fileId,entryId:r.entryId});assert.equal(res.errorCode,'AUTH_FORBIDDEN');assert.equal(await count(),before);results.push({role,code:res.errorCode});take(await api('signOut'));await performLogin(adminCreds.loginId,adminPassword);await open();}neg('N01',results);});
  await step('S18',async()=>{const r=(await rows()).find(r=>r.canApprove);await select(r);await page.locator('#btn-perf-approve').click();await page.evaluate(()=>document.querySelector('button[data-id="workforce"]').click());await page.locator('#workforce-root').waitFor();assert.equal(await page.locator('.perf-modal-backdrop').count(),0);await open();await select(r);await page.evaluate(()=>{const fn=window.appBridge.getPerformanceComparison.bind(window.appBridge);window.appBridge.getPerformanceComparison=async p=>{const result=await fn(p);await new Promise(resolve=>window.__releaseCompare=resolve);return result;};});await page.locator('#btn-perf-compare').click();await page.waitForFunction(()=>typeof window.__releaseCompare==='function');await page.evaluate(()=>document.querySelector('button[data-id="workforce"]').click());await page.evaluate(()=>window.__releaseCompare());await page.locator('#workforce-root').waitFor();assert.equal(await page.locator('.perf-modal-backdrop').count(),0);await page.reload();await page.locator('.btn-logout').waitFor();await open();take(await api('signOut'));await page.locator('#btn-perf-reparse').click();await page.locator('#login-id').waitFor();await performLogin(adminCreds.loginId,adminPassword);await open();neg('N11',{actionClosed:true,lateComparisonIgnored:true,expiredSessionLoggedOut:true});});
  await step('S19',async()=>{await page.locator('#btn-perf-intake-status').click();for(let i=0;i<5;i++)await page.keyboard.press('Tab');await page.keyboard.press('Escape');assert.equal(await page.locator('.perf-modal-backdrop').count(),0);const pool=(await rows()).find(r=>r.approvalStatus==='non-payable');assert.ok(pool);const before=await count(),res=await api('approvePendingFile',{fileId:pool.fileId,entryId:pool.entryId});assert.equal(res.ok,false);assert.equal(await count(),before);neg('N08',{excludedPoolCode:res.errorCode});const settings=take(await api('getAppSettings')),bad=path.join(settings.pendingDir,'2026_05_잘못된원본.xlsx');assert.ok(underTemp(bad));fs.writeFileSync(bad,'not an Excel workbook');const snapshot=take(await api('listPerformanceOverview',{scheduleMonth:'2026-05',forceReparse:true}));assert.ok(snapshot.syncIssues.some(i=>i.fileName==='2026_05_잘못된원본.xlsx'));const signatures=take(await api('listCalculationResults')).map(c=>c.signature);assert.equal(new Set(signatures).size,signatures.length);await refresh();await page.locator('#btn-perf-intake-status').click();assert.ok((await page.locator('.perf-intake-issues').innerText()).includes('2026_05_잘못된원본.xlsx'));await page.keyboard.press('Escape');neg('N09',{invalidWorkbookReported:true,uniquePaidSignatures:signatures.length});const f=fixtureResult.createdExcelFiles.find(f=>fs.existsSync(f.filePath));assert.ok(f&&underTemp(f.filePath));const book=new ExcelJS.Workbook();await book.xlsx.readFile(f.filePath);book.worksheets[0].getCell('BH35').value='<img src=x onerror="window.__ui05Xss=1">';await book.xlsx.writeFile(f.filePath);await refresh();await page.locator('#perf-filter-search').fill('<img');const text=await page.locator('#perf-table-container').innerText();assert.ok(text.includes('<img'));assert.equal(await page.locator('#perf-table-container img').count(),0);assert.equal(await page.evaluate(()=>window.__ui05Xss),undefined);neg('N12',{literalMarkup:true,execution:false});await clear();});
  await step('S20',async()=>{
    // W05 uses a real approved XLSX source + public wage API + the screen's re-read action.
    const pendingRows=await rows();
    const clean=pendingRows.find(r=>r.canApprove&&r.entry.section==='overtime'&&pendingRows.filter(x=>x.fileId===r.fileId).every(x=>x.approvalStatus==='non-payable'||x.canApprove));
    assert.ok(clean,'independent unapproved file for W05');
    for(const row of pendingRows.filter(r=>r.fileId===clean.fileId&&r.canApprove))take(await api('approvePendingFile',{fileId:row.fileId,entryId:row.entryId,comment:'W05 독립 원본 기준 승인'}));
    const approvedRows=[...await rows(),...await rows('approved')];
    fs.writeFileSync(path.join(resolvedOut,'w05-fixture-state.json'),JSON.stringify({clean,approvedRows,detail:take(await api('getPerformanceFileDetail',{fileId:clean.fileId}))},null,2));
    const archived=approvedRows.find(r=>r.fileId===clean.fileId&&r.entryId===clean.entryId);
    assert.ok(archived,'approved overtime for W05; existing archive guards may retain a fully approved file in pending');
    const originalComparison=take(await api('getPerformanceComparison',{fileId:archived.fileId,entryId:archived.entryId}));
    assert.equal(originalComparison.currentEntry.sourceSignature,originalComparison.approvedEntry.sourceSignature,'W05 starts with the actual latest approved source');
    const source=take(await api('getPerformanceFileDetail',{fileId:archived.fileId}));
    const settings=take(await api('getAppSettings'));
    const pendingPath=path.join(settings.pendingDir,source.fileName);
    assert.ok(underTemp(source.filePath)&&underTemp(pendingPath));
    const employee=take(await api('listEmployees')).find(e=>e.employeeCode===archived.entry.employeeCode);
    assert.ok(employee);
    const beforeHistory=take(await api('listApprovalHistory'));
    const beforeCalculations=take(await api('listCalculationResults'));
    const originalRate=archived.entry.hourlyRate,newRate=originalRate+1111;
    take(await api('saveEmployeeWageRate',{employeeId:employee.id,hourlyRate:newRate,effectiveFrom:archived.entry.workDate,reason:'W05 시급만 변경한 재읽기'}));
    if(path.resolve(source.filePath)!==path.resolve(pendingPath))fs.copyFileSync(source.filePath,pendingPath);
    await clear();await page.locator('#perf-filter-scope').selectOption('pending');await ready();await refresh();
    const current=(await rows()).find(r=>r.logicalKey===archived.logicalKey);
    fs.writeFileSync(path.join(resolvedOut,'w05-reread-evidence.json'),JSON.stringify({archived,current,comparison:current?take(await api('getPerformanceComparison',{fileId:current.fileId,entryId:current.entryId})):null},null,2));
    assert.ok(current);assert.equal(current.approvalStatus,'approved');assert.equal(current.needsReapproval,false);assert.equal(current.reapprovalStatus,'none');assert.equal(current.canApprove,false);assert.equal(current.entry.hourlyRate,originalRate);
    const comparison=take(await api('getPerformanceComparison',{fileId:current.fileId,entryId:current.entryId}));
    assert.equal(comparison.currentEntry.hourlyRate,newRate);assert.equal(comparison.approvedEntry.hourlyRate,originalRate);assert.equal(comparison.approvedCalculation.hourlyRate,originalRate);
    assert.deepEqual(take(await api('listApprovalHistory')),beforeHistory);assert.deepEqual(take(await api('listCalculationResults')),beforeCalculations);
    const duplicate=await api('approvePendingFile',{fileId:current.fileId,entryId:current.entryId});assert.equal(duplicate.errorCode,'PERFORMANCE_ALREADY_APPROVED');
    await select(current);await page.locator('#btn-perf-approve').waitFor();assert.ok(await page.locator('#btn-perf-approve').isDisabled());
    assert.ok((await page.locator('#perf-detail-container').innerText()).includes(originalRate.toLocaleString('ko-KR')+'원'));
    const w05={originalRate,rereadRate:newRate,displayedRate:current.entry.hourlyRate,logicalKey:current.logicalKey,approvedSourceUnchanged:true,needsReapproval:false,approvalAndCalculationsUnchanged:true,duplicateCode:duplicate.errorCode,actualUiReparse:true};
    await page.screenshot({path:path.join(capturesDir,'w05-wage-only-reread.png')});

    // W06: save through both actual workforce dialogs and verify raw pending data without a refresh action.
    const pendingTarget=(await rows()).find(r=>r.canApprove&&r.entry.section==='overtime'&&r.entry.hourlyRate>0);
    assert.ok(pendingTarget,'unapproved payable source for W06');
    const code=pendingTarget.entry.employeeCode,day=pendingTarget.entry.workDate;
    const singleRate=pendingTarget.entry.hourlyRate+1234,bulkRate=singleRate+345;
    const historyBeforeW06=take(await api('listApprovalHistory')),calculationsBeforeW06=take(await api('listCalculationResults'));
    const openWorker=async()=>{
      await page.locator('button[data-id="workforce"]').click();await page.locator('#workforce-root').waitFor();
      await page.locator('#filter-status-select').selectOption('all');await page.locator('#filter-keyword-input').fill(code);
      await page.locator(`tr[data-employee-code="${code}"]`).click();await page.waitForFunction(code=>document.querySelector('#e2-detail-title')?.textContent.includes(code),code);await page.locator('#btn-detail-retry').waitFor({state:'detached'});
    };
    await openWorker();await page.locator('#btn-open-e3').click();await page.waitForFunction(()=>document.activeElement?.id==='modal-e3-rate');
    await page.locator('#modal-e3-rate').fill(String(singleRate));await page.locator('#modal-e3-from').fill(day);await page.locator('#modal-e3-reason').fill('W06 실제 화면 단건 저장');
    const singleResponse=page.waitForResponse(r=>r.url().includes('/api/employees:save-wage-rate')&&r.request().method()==='POST');
    await page.locator('#btn-submit-e3').click();if(await page.locator('#modal-wage-confirm').count())await page.locator('#btn-confirm-wage-save').click();
    await page.locator('#modal-wage-impact').waitFor();
    const singleSaved=take(await(await singleResponse).json());
    assert.equal(singleSaved.pendingPerformanceRefresh.status,'completed');assert.ok(singleSaved.pendingPerformanceRefresh.refreshedFileCount>=1);
    assert.ok((await page.locator('#wage-pending-refresh-result').innerText()).includes('다시 읽기 완료'));
    let raw=take(await api('getPerformanceFileDetail',{fileId:pendingTarget.fileId})).entries.find(e=>e.logicalKey===pendingTarget.logicalKey);
    assert.equal(raw.hourlyRate,singleRate);
    await page.screenshot({path:path.join(capturesDir,'w06-single-auto-refresh.png')});await page.locator('#btn-close-impact').click();
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('시급');sheet.addRow(['근무지','이름','시급','사번']);sheet.addRow([pendingTarget.entry.siteName,pendingTarget.entry.employeeName,bulkRate,code]);
    const bulkPath=path.join(resolvedOut,'w06-wages.xlsx');await book.xlsx.writeFile(bulkPath);
    await page.locator('#btn-open-e6').click();await page.waitForFunction(()=>document.activeElement?.id==='modal-e6-file-path');
    await page.locator('#modal-e6-file-path').fill(bulkPath);await page.locator('#modal-e6-effective-from').fill(day);await page.locator('#modal-e6-col-code').fill('D');
    await page.locator('#btn-e6-preview').click();await page.locator('#table-e6-preview tbody tr').first().waitFor();
    assert.match(await page.locator('#e6-preview-summary').innerText(),/적용 가능: 1행/);
    await page.locator('#btn-submit-e6').click();await page.locator('#modal-e6-confirm').waitFor();
    const bulkResponse=page.waitForResponse(r=>r.url().includes('/api/employees:apply-wage-bulk-update')&&r.request().method()==='POST');
    await page.locator('#btn-confirm-e6-apply').click();await page.locator('#modal-e6-summary').waitFor();
    const bulkSaved=take(await(await bulkResponse).json());assert.equal(bulkSaved.appliedCount,1);assert.equal(bulkSaved.pendingPerformanceRefresh.status,'completed');assert.ok(bulkSaved.pendingPerformanceRefresh.refreshedFileCount>=1);
    assert.ok((await page.locator('#wage-pending-refresh-result').innerText()).includes('다시 읽기 완료'));
    raw=take(await api('getPerformanceFileDetail',{fileId:pendingTarget.fileId})).entries.find(e=>e.logicalKey===pendingTarget.logicalKey);assert.equal(raw.hourlyRate,bulkRate);
    assert.deepEqual(take(await api('listApprovalHistory')),historyBeforeW06);assert.deepEqual(take(await api('listCalculationResults')),calculationsBeforeW06);
    await page.screenshot({path:path.join(capturesDir,'w06-bulk-auto-refresh.png')});await page.locator('#btn-close-e6-summary').click();
    // Hold an owned TEMP source with an actual Windows exclusive read lock. Source bytes stay unchanged.
    const sourcePath=take(await api('getPerformanceFileDetail',{fileId:pendingTarget.fileId})).filePath;
    assert.ok(underTemp(fs.realpathSync(sourcePath)));
    const lockReady=path.join(resolvedOut,'w06-lock-'+crypto.randomUUID()+'.ready');
    const locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$stream=[IO.File]::Open($env:W06_LOCK_PATH,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);[IO.File]::WriteAllText($env:W06_READY_PATH,'ready');try{[Console]::ReadLine()|Out-Null}finally{$stream.Dispose()}"],{windowsHide:true,env:{...process.env,W06_LOCK_PATH:sourcePath,W06_READY_PATH:lockReady},stdio:['pipe','ignore','ignore']});
    let partialSaved;
    const failedRate=bulkRate+100;
    try{
      for(let i=0;i<100&&!fs.existsSync(lockReady)&&locker.exitCode===null;i++)await sleep(20);
      assert.ok(fs.existsSync(lockReady),'exclusive source lock acquired before wage save');
      await page.locator('#btn-open-e3').click();await page.waitForFunction(()=>document.activeElement?.id==='modal-e3-rate');
      await page.locator('#modal-e3-rate').fill(String(failedRate));await page.locator('#modal-e3-from').fill(day);await page.locator('#modal-e3-reason').fill('W06 파일 잠금 실패 안내');
      const failedResponse=page.waitForResponse(r=>r.url().includes('/api/employees:save-wage-rate')&&r.request().method()==='POST');
      await page.locator('#btn-submit-e3').click();if(await page.locator('#modal-wage-confirm').count())await page.locator('#btn-confirm-wage-save').click();await page.locator('#modal-wage-impact').waitFor();
      partialSaved=take(await(await failedResponse).json());assert.equal(partialSaved.hourlyRate,failedRate);assert.equal(partialSaved.pendingPerformanceRefresh.status,'partial');assert.ok(partialSaved.pendingPerformanceRefresh.issues.length>=1);
      assert.ok((await page.locator('#wage-pending-refresh-result').innerText()).includes('일부 미완료'));
      raw=take(await api('getPerformanceFileDetail',{fileId:pendingTarget.fileId})).entries.find(e=>e.logicalKey===pendingTarget.logicalKey);assert.equal(raw.hourlyRate,bulkRate);
      await page.screenshot({path:path.join(capturesDir,'w06-locked-file-report.png')});await page.locator('#btn-close-impact').click();
    }finally{
      locker.stdin.end('\n');await Promise.race([new Promise(resolve=>locker.once('exit',resolve)),sleep(2000)]);if(locker.exitCode===null)locker.kill();
    }
    await open();await refresh();
    raw=take(await api('getPerformanceFileDetail',{fileId:pendingTarget.fileId})).entries.find(e=>e.logicalKey===pendingTarget.logicalKey);assert.equal(raw.hourlyRate,failedRate);
    assert.deepEqual(take(await api('listApprovalHistory')),historyBeforeW06);assert.deepEqual(take(await api('listCalculationResults')),calculationsBeforeW06);
    const w06={logicalKey:pendingTarget.logicalKey,singleRate,bulkRate,failedRate,single:singleSaved.pendingPerformanceRefresh,bulk:bulkSaved.pendingPerformanceRefresh,locked:partialSaved.pendingPerformanceRefresh,actualUiBoth:true,noManualReparseBetweenSaves:true,realExclusiveSourceLock:true,cacheRetainedOnFailure:true,manualReparseAfterUnlock:true,approvedHistoryAndCalculationsUnchanged:true};
    // W08 native preview scenario starts here; it stops with the real void result notice open.
    const targetW08=pendingTarget;
    const employeeW08=take(await api('listEmployees')).find(e=>e.employeeCode===targetW08.entry.employeeCode);assert.ok(employeeW08);
    const ratesW08=take(await api('listEmployeeWageRates',employeeW08.id));
    const rateW08=ratesW08.find(r=>!r.invalidation&&r.effectiveFrom<=targetW08.entry.workDate&&(!r.effectiveTo||targetW08.entry.workDate<=r.effectiveTo));assert.ok(rateW08?.revisionToken);
    const historyW08=take(await api('listApprovalHistory')),calculationsW08=take(await api('listCalculationResults'));
    await page.locator('button[data-id="workforce"]').click();await page.locator('#workforce-root').waitFor();await page.locator('#filter-status-select').selectOption('all');await page.locator('#filter-keyword-input').fill(employeeW08.employeeCode);
    await page.locator(`tr[data-employee-code="${employeeW08.employeeCode}"]`).click();await page.locator(`#e2-wage-history tr[data-wage-rate-id="${rateW08.id}"] .btn-revise-wage`).waitFor();
    await page.locator(`#e2-wage-history tr[data-wage-rate-id="${rateW08.id}"] .btn-revise-wage`).click();await page.locator('#wage-revision-operation').selectOption('invalidate');await page.locator('#wage-revision-reason').fill('W08 원본 시급 등록 오류 확인');await page.locator('#btn-review-wage-revision').click();
    assert.match(await page.locator('#modal-wage-revision-confirm').innerText(),/시급 미등록/);
    const responseW08=page.waitForResponse(r=>r.url().includes('/api/employees:save-wage-rate')&&r.request().method()==='POST');
    await page.locator('#btn-confirm-wage-revision').click();const invalidW08=take(await(await responseW08).json());await page.locator('#modal-wage-revision-result').waitFor();
    assert.ok(invalidW08.invalidation);assert.equal(invalidW08.pendingPerformanceRefresh.status,'completed');assert.ok(invalidW08.pendingPerformanceRefresh.refreshedFileCount>=1);
    const gapRawW08=take(await api('getPerformanceFileDetail',{fileId:targetW08.fileId})).entries.find(e=>e.id===targetW08.entryId);assert.equal(gapRawW08.hourlyRate,undefined);
    assert.deepEqual(take(await api('listApprovalHistory')),historyW08);assert.deepEqual(take(await api('listCalculationResults')),calculationsW08);
    const blockedW08=await api('approvePendingFile',{fileId:targetW08.fileId,entryId:targetW08.entryId});assert.equal(blockedW08.ok,false);
    assert.deepEqual(take(await api('listCalculationResults')),calculationsW08);
    await page.screenshot({path:path.join(capturesDir,'w08-void-pending-result.png')});
    // W08 native preview stops here before dismissing the actual result notice.
    await page.locator('#btn-close-wage-revision-result').click();await open();
    const gapOverviewW08=(await rows()).find(r=>r.fileId===targetW08.fileId&&r.entryId===targetW08.entryId);assert.ok(gapOverviewW08);assert.equal(gapOverviewW08.canApprove,false);await select(gapOverviewW08);await page.screenshot({path:path.join(capturesDir,'w08-pending-approval-blocked.png')});
    const replacementRateW08=rateW08.hourlyRate+1000;
    const replacementW08=take(await api('saveEmployeeWageRate',{employeeId:employeeW08.id,effectiveFrom:rateW08.effectiveFrom,hourlyRate:replacementRateW08,reason:'W08 올바른 증빙으로 새 시급 등록'}));assert.notEqual(replacementW08.id,rateW08.id);assert.equal(replacementW08.pendingPerformanceRefresh.status,'completed');
    assert.ok(take(await api('listEmployeeWageRates',employeeW08.id)).find(r=>r.id===rateW08.id).invalidation);
    const rawReplacementW08=take(await api('getPerformanceFileDetail',{fileId:targetW08.fileId})).entries.find(e=>e.id===targetW08.entryId);assert.equal(rawReplacementW08.hourlyRate,replacementRateW08);
    assert.deepEqual(take(await api('listApprovalHistory')),historyW08);assert.deepEqual(take(await api('listCalculationResults')),calculationsW08);
    take(await api('approvePendingFile',{fileId:targetW08.fileId,entryId:targetW08.entryId}));
    const calculationW08=take(await api('listCalculationResults')).find(c=>c.fileId===targetW08.fileId&&c.entryId===targetW08.entryId);assert.ok(calculationW08);assert.equal(calculationW08.hourlyRate,replacementRateW08);
    assert.deepEqual(take(await api('listCalculationResults')).filter(c=>c.id!==calculationW08.id),calculationsW08);
    const w08={file:targetW08.fileId,entry:targetW08.entryId,invalidRate:rateW08.hourlyRate,replacementRate:replacementRateW08,void:invalidW08.invalidation,refresh:invalidW08.pendingPerformanceRefresh,actualUiVoid:true,sourceKept:true,approvedHistoryAndCalculationsPreservedBeforeExplicitApproval:true,gapBlockedApproval:true,explicitSameDateReplacement:true,newCalculationUsesReplacement:true};
    // W09 native preview starts here with an actual pending XLSX row.
    const targetW09=(await rows()).find(r=>r.canApprove&&r.entry.section==='overtime');assert.ok(targetW09);
    const employeeW09=take(await api('listEmployees')).find(e=>e.employeeCode===targetW09.entry.employeeCode);assert.ok(employeeW09);
    const historyW09=take(await api('listApprovalHistory')),calculationsW09=take(await api('listCalculationResults'));
    await page.locator('button[data-id="workforce"]').click();await page.locator('#workforce-root').waitFor();await page.locator('#filter-status-select').selectOption('all');await page.locator('#filter-keyword-input').fill(employeeW09.employeeCode);
    await page.locator(`tr[data-employee-code="${employeeW09.employeeCode}"]`).click();await page.locator('#btn-edit-employee').click();await page.locator('#edit-status').selectOption('retired');await page.locator('#edit-retire-date').fill(targetW09.entry.workDate);
    assert.match(await page.locator('#employee-retirement-guidance').innerText(),/근무에서 제외/);
    const responseW09=page.waitForResponse(r=>r.url().includes('/api/employees:save')&&r.request().method()==='POST');await page.locator('#btn-submit-edit').click();const retiredW09=take(await(await responseW09).json());await page.locator('#modal-retirement-result').waitFor();
    assert.ok(retiredW09.retirementChange);assert.equal(retiredW09.retirementChange.pendingPerformanceRefresh.status,'completed');assert.ok(retiredW09.retirementChange.pendingPerformanceRefresh.refreshedFileCount>=1);
    const unavailableW09=take(await api('getPerformanceFileDetail',{fileId:targetW09.fileId})).entries.find(e=>e.id===targetW09.entryId);assert.equal(unavailableW09.hourlyRate,undefined);
    assert.deepEqual(take(await api('listApprovalHistory')),historyW09);assert.deepEqual(take(await api('listCalculationResults')),calculationsW09);
    const blockedW09=await api('approvePendingFile',{fileId:targetW09.fileId,entryId:targetW09.entryId,manualHourlyRate:20000,comment:'W09 퇴사일 이후 수동 우회 차단'});assert.equal(blockedW09.ok,false);assert.equal(blockedW09.errorCode,'PERFORMANCE_EMPLOYEE_RETIRED');
    await page.screenshot({path:path.join(capturesDir,'w09-retirement-pending-result.png')});
    // W09 native preview stops here with the actual retirement result notice open.
    await page.locator('#btn-close-retirement-result').click();await page.waitForFunction(()=>document.querySelector('#e2-current-rate')?.textContent.includes('적용 중인 시급 없음'));await page.locator('#btn-edit-employee').click();
    const correctedDateW09=new Date(Date.parse(targetW09.entry.workDate+'T00:00:00Z')+2*86400000).toISOString().slice(0,10);await page.locator('#edit-retire-date').fill(correctedDateW09);
    const correctionResponseW09=page.waitForResponse(r=>r.url().includes('/api/employees:save')&&r.request().method()==='POST');await page.locator('#btn-submit-edit').click();const correctedW09=take(await(await correctionResponseW09).json());await page.locator('#modal-retirement-result').waitFor();assert.equal(correctedW09.retirementChange.kind,'date-correction');
    const restoredW09=take(await api('getPerformanceFileDetail',{fileId:targetW09.fileId})).entries.find(e=>e.id===targetW09.entryId);assert.equal(restoredW09.hourlyRate,targetW09.entry.hourlyRate);
    assert.deepEqual(take(await api('listApprovalHistory')),historyW09);assert.deepEqual(take(await api('listCalculationResults')),calculationsW09);await page.screenshot({path:path.join(capturesDir,'w09-date-corrected-pending.png')});await page.locator('#btn-close-retirement-result').click();
    take(await api('approvePendingFile',{fileId:targetW09.fileId,entryId:targetW09.entryId}));const calculationW09=take(await api('listCalculationResults')).find(c=>c.fileId===targetW09.fileId&&c.entryId===targetW09.entryId);assert.ok(calculationW09);assert.equal(calculationW09.hourlyRate,targetW09.entry.hourlyRate);
    assert.deepEqual(take(await api('listCalculationResults')).filter(c=>c.id!==calculationW09.id),calculationsW09);
    const w09={file:targetW09.fileId,entry:targetW09.entryId,retirement:retiredW09.retirementChange,corrected:correctedW09.retirementChange,actualUi:true,firstExcludedDay:true,cachedManualApprovalBlocked:true,approvedSnapshotsPreserved:true,correctedDateReappliesValidWage:true,explicitApprovalAfterCorrection:true};

    // W10: same-code rehire UI triggers actual XLSX reread and keeps a gap unapprovable.
    await open();const targetW10=(await rows()).find(r=>r.canApprove);assert.ok(targetW10,'W10 remaining pending actual Excel entry');
    const employeeW10=take(await api('listEmployees')).find(e=>e.employeeCode===targetW10.entry.employeeCode);assert.ok(employeeW10);
    const assignmentW10=take(await api('listEmployeeAssignments',employeeW10.id)).find(a=>a.siteId&&a.shiftGroup);assert.ok(assignmentW10);const siteW10=employeeW10.currentSiteId||assignmentW10.siteId,groupW10=employeeW10.currentShiftGroup||assignmentW10.shiftGroup;
    const historyW10=take(await api('listApprovalHistory')),calculationsW10=take(await api('listCalculationResults'));
    const retiredW10=take(await api('saveEmployee',{...employeeW10,status:'retired',retireDate:targetW10.entry.workDate,hourlyRate:undefined}));
    await page.locator('button[data-id="workforce"]').click();await page.locator('#workforce-root').waitFor();await page.locator('#filter-status-select').selectOption('all');await page.locator('#filter-keyword-input').fill(employeeW10.employeeCode);await page.locator(`tr[data-employee-code="${employeeW10.employeeCode}"]`).click();await page.locator('#btn-rehire-start').click();
    const startW10=new Date(Date.parse(targetW10.entry.workDate+'T00:00:00Z')+2*86400000).toISOString().slice(0,10);await page.locator('#rehire-date').fill(startW10);await page.locator('#rehire-rate').fill('18500');await page.locator('#rehire-site').selectOption(siteW10);await page.waitForFunction(()=>document.querySelector('#rehire-group')?.disabled===false);await page.locator('#rehire-group').selectOption(groupW10);await page.locator('#rehire-next').click();
    const responseW10=page.waitForResponse(r=>r.url().includes('/api/employees:save')&&r.request().method()==='POST');await page.locator('#rehire-save').click();const savedW10=take(await(await responseW10).json());await page.locator('#modal-rehire-result').waitFor();assert.equal(savedW10.id,employeeW10.id);assert.equal(savedW10.hireDate,employeeW10.hireDate);assert.equal(savedW10.rehireChange.pendingPerformanceRefresh.status,'completed');
    const rawW10=take(await api('getPerformanceFileDetail',{fileId:targetW10.fileId})).entries.find(e=>e.id===targetW10.entryId);assert.equal(rawW10.hourlyRate,undefined);assert.deepEqual(take(await api('listApprovalHistory')),historyW10);assert.deepEqual(take(await api('listCalculationResults')),calculationsW10);await page.screenshot({path:path.join(capturesDir,'w10-rehire-pending-result.png')});await page.locator('#rehire-done').click();
    const manualW10=await api('approvePendingFile',{fileId:targetW10.fileId,entryId:targetW10.entryId,manualHourlyRate:20000,comment:'W10 employment gap backstop'});assert.equal(manualW10.errorCode,'PERFORMANCE_EMPLOYEE_NOT_EMPLOYED');await open();const overviewW10=(await rows()).find(r=>r.fileId===targetW10.fileId&&r.entryId===targetW10.entryId);assert.ok(overviewW10);assert.equal(overviewW10.canApprove,false);await select(overviewW10);assert.ok(await page.locator('#btn-perf-approve').isDisabled());await page.screenshot({path:path.join(capturesDir,'w10-rehire-gap-blocked.png')});
    const w10={file:targetW10.fileId,entry:targetW10.entryId,retirement:retiredW10.retirementChange,rehire:savedW10.rehireChange,sameIdentity:true,firstHirePreserved:true,actualUi:true,actualXlsxReparse:true,gapBlocksCachedManualApproval:true,approvedSnapshotsPreserved:true};


    await open();

    for(const size of [{width:1366,height:768},{width:900,height:700}]){await page.setViewportSize(size);assert.ok(await page.locator('#perf-table-footer').isVisible());}await page.setViewportSize({width:1707,height:825});for(const id of ['workforce','sites','schedule-create','operations']){await page.locator('button[data-id="'+id+'"]').click();await page.waitForTimeout(80);}await open();await page.screenshot({path:path.join(capturesDir,'final.png')});return {w05,w06,w08,w09,w10};});
  proof={status:blockedScenarios.length?'PARTIAL_BLOCKED':focusIDs.size?'PARTIAL_FOCUS':'PASS',plannedScenarios,completedScenarios,blockedScenarios,failedScenarios,expectedRejections,negativeEvidence,observations,fixture:fixtureResult,userDataDir,out:resolvedOut,unexpectedErrors};
  if(!focusIDs.size){assert.equal(completedScenarios.length+blockedScenarios.length,20);assert.ok(Object.values(expectedRejections).every(Boolean),'all negative obligations need actual evidence');}
  assert.equal(unexpectedErrors.length,0,JSON.stringify(unexpectedErrors));
  fs.writeFileSync(path.join(resolvedOut,'results.json'),JSON.stringify(proof,null,2));
  process.stdout.write('[RESULT] '+JSON.stringify({status:proof.status,passed:completedScenarios.length,blocked:blockedScenarios.length,negativePassed:Object.values(expectedRejections).filter(Boolean).length,out:resolvedOut})+'\n');
  if(blockedScenarios.length)process.exitCode=2;
  } catch (err) {
  failedScenarios.push({message:err.message});
  proof={...proof,status:"FAILED",plannedScenarios,completedScenarios,failedScenarios,expectedRejections,unexpectedErrors,userDataDir,out:resolvedOut};
  fs.writeFileSync(path.join(resolvedOut,"results.json"),JSON.stringify(proof,null,2));
  try { const pages=browser?.contexts()[0]?.pages(); if(pages?.length)await pages[0].screenshot({path:path.join(capturesDir,"failure.png")}); }catch{}
  process.stderr.write(err.stack+"\n");process.exitCode=1;
  } finally {
  if (!isPreview || process.exitCode) await cleanup(true);
  }
}
run();
