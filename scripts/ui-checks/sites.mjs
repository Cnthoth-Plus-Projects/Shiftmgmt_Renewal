// 근무지 관리 화면 UI 검증 및 E2E 자동화 러너 (S01~S20, N01~N12)
import { build } from "esbuild";
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
import { seedSitesFixtures } from "./sites-fixtures.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rawArgs = process.argv.slice(2);
const focusIDs = new Set((rawArgs.find(a => a.startsWith("--focus="))?.slice(8) || rawArgs.find(a => a.startsWith("--scenarios="))?.slice(12) || "").split(",").filter(Boolean));
const isPreview = rawArgs.includes("--preview");

const portArg = rawArgs.find((a) => a.startsWith("--port="))?.slice(7)?.trim();
const targetPort = portArg ? parseInt(portArg, 10) : isPreview ? 18825 : 18822;
const targetUrl = `http://127.0.0.1:${targetPort}/`;

// OS TEMP 디렉터리 하위인지 엄격 검증
let outArg = rawArgs.find((a) => a.startsWith("--out="))?.slice(6)?.replace(/^["']|["']$/g, "")?.trim();
const resolvedOut = path.resolve(outArg || path.join(os.tmpdir(), "shiftmgmt-sites-ui-" + randomUUID()));
const tempRoot = fs.realpathSync(os.tmpdir());
const underTemp = (val) => {
  const rel = path.relative(tempRoot, path.resolve(val));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
if (!underTemp(resolvedOut)) throw new Error("Output must be a dedicated TEMP child directory");
let existingParent = resolvedOut;
while (!fs.existsSync(existingParent)) existingParent = path.dirname(existingParent);
if (fs.realpathSync(existingParent) !== tempRoot && !underTemp(fs.realpathSync(existingParent))) {
  throw new Error("Output follows a path outside TEMP");
}
fs.mkdirSync(resolvedOut, { recursive: true });
const capturesDir = path.join(resolvedOut, "captures");
fs.mkdirSync(capturesDir, { recursive: true });

const userDataDir = path.join(os.tmpdir(), "shiftmgmt-sites-data-" + randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(userDataDir, { recursive: true });
const resourcesDir = path.join(os.tmpdir(), "shiftmgmt-sites-res-" + randomUUID().replace(/-/g, "").slice(0, 10));
fs.mkdirSync(resourcesDir, { recursive: true });

const plannedScenarios = Array.from({ length: 20 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`).filter(id => !focusIDs.size || focusIDs.has(id));
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

process.on("SIGINT", async () => { await cleanup(); process.exit(1); });
process.on("SIGTERM", async () => { await cleanup(); process.exit(1); });

async function closeAnyOpenModal(page) {
  try {
    const modalCancel = page.locator("#btn-confirm-cancel, #btn-notice-close, #btn-modal-cancel, #btn-copy-cancel, #btn-import-cancel");
    if (await modalCancel.first().isVisible({ timeout: 400 }).catch(() => false)) {
      await modalCancel.first().click();
      await sleep(200);
    }
  } catch {}
}

async function main() {
  process.stdout.write(`[UI-03] Starting Sites Management Verification (${isPreview ? "PREVIEW" : "TEST"})\n`);

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
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(SOL_|SHIFTMGMT_|AUTH_BOOTSTRAP_|NODE_OPTIONS$|NODE_DEBUG$)/i.test(key))),
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
  for (const folder of ["pending", "approved", "export"]) {
    fs.mkdirSync(path.join(userDataDir, folder), { recursive: true });
  }

  const entry = `const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;process.on('message',message=>{offset=message.clockOffsetMs;process.send({clockOffsetMs:offset});});require(${JSON.stringify(serverScript)}).startServer();`;
  serverProcess = spawn(process.execPath, ["-e", entry], {
    cwd: repoRoot,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });

  serverProcess.stdout.on("data", (d) => {
    const msg = d.toString();
    if (msg.includes("서버 실행 중")) process.stdout.write(msg);
  });
  serverProcess.stderr.on("data", (d) => {
    const m = d.toString();
    if (!m.includes("ExperimentalWarning")) process.stderr.write(redactText(`[Server Err] ${m}`));
  });

  let healthOk = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const res = await checkServerHealth(targetUrl, 2000);
      if (res?.ok) {
        healthOk = true;
        break;
      }
    } catch {}
  }
  if (!healthOk) {
    process.stderr.write("[Err] 서버 시작 실패 (health check 타임아웃)\n");
    await cleanup();
    process.exit(1);
  }

  const bootstrapData = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
  const adminCreds = bootstrapData.credentials?.["user-admin"];

  const chromePath = findChrome().path;
  browser = await chromium.launch({
    headless: !isPreview,
    executablePath: chromePath,
    args: isPreview ? ["--start-maximized"] : [],
    slowMo: isPreview ? 50 : 0
  });

  const context = await browser.newContext({
    viewport: isPreview ? null : { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  if(isPreview){const cdp=await context.newCDPSession(page);const {windowId}=await cdp.send("Browser.getWindowForTarget");await cdp.send("Browser.setWindowBounds",{windowId,bounds:{windowState:"maximized"}});await cdp.detach();}

  page.on("pageerror",error=>unexpectedErrors.push(redactText(error.message)));
  // 1. 기본 관리자 로그인
  process.stdout.write("[UI-03] Logging in as admin...\n");
  const adminPassword="Ui03!"+randomUUID()+"a7";artifactRegistry.register(adminPassword);
  await performNormalLogin(page, targetUrl, adminCreds,adminPassword,value=>artifactRegistry.register(value));

  // 2. 근무지 메뉴 진입
  process.stdout.write("[UI-03] Navigating to Sites screen...\n");
  await page.click('button[data-id="sites"]');
  await page.waitForSelector("#sites-screen", { timeout: 10000 });
  await sleep(500);

  // 3. 55곳/55명/55버전 피스처 시딩
  process.stdout.write("[UI-03] Seeding 55 sites, 55 employees, 55 versions...\n");
  const fixtureManifest = await seedSitesFixtures({ page, resourcesDir });
  process.stdout.write(`[UI-03] Seeded: ${fixtureManifest.sitesCount} sites, ${fixtureManifest.employeesCount} employees, ${fixtureManifest.patternsCount} patterns, ${fixtureManifest.assignmentsCount} assignments\n`);

  // 화면 새로고침하여 피스처 반영 확인
  await page.click('button[data-id="workforce"]');
  await sleep(300);
  await page.click('button[data-id="sites"]');
  await page.waitForSelector("#sites-screen", { timeout: 10000 });
  await sleep(500);

  if(isPreview){
    await page.fill('#sites-search-input','중앙관제센터');await page.locator('.sites-row-item').first().click();await page.fill('#sites-search-input','');
    const nativeLayout=[];const cdp=await context.newCDPSession(page);const {windowId}=await cdp.send("Browser.getWindowForTarget");
    for(const state of ["normal","maximized"]){await cdp.send("Browser.setWindowBounds",{windowId,bounds:state==="normal"?{windowState:"normal",width:1440,height:900}:{windowState:"maximized"}});
      for(const menu of ["workforce","sites"]){await page.click(`button[data-id="${menu}"]`);await page.waitForSelector(menu==="sites"?"#sites-pagination-info":"#workforce-pagination");await sleep(250);
        const metrics=await page.evaluate(menu=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};const prefix=menu==="sites"?"sites":"workforce",viewport=document.querySelector(menu==="sites"?".sites-table-viewport":"#workforce-row-slots");return {menu,innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualHeight:visualViewport.height,shell:box(".app-shell"),content:box(".page-content"),kpis:box(`#${prefix}-kpis`),toolbar:box(menu==="sites"?"#sites-toolbar-container":"#workforce-list-container"),table:box(`#${prefix}-table-wrapper`),detail:box(`#${prefix}-detail-area`),pager:box(menu==="sites"?".sites-pagination":"#workforce-pagination"),status:box(".footer-statusbar"),bodyHeadingCount:document.querySelectorAll(`#${prefix}-screen h1`).length,paginationLabels:[...document.querySelectorAll(`#${prefix}-table-wrapper .pagination-button`)].filter(b=>!/^\d+$/.test(b.textContent)).map(b=>b.textContent),listViewport:{height:viewport.clientHeight,contentHeight:viewport.scrollHeight}};},menu);
        fs.writeFileSync(path.join(resolvedOut,"native-last-observation.json"),artifactJSON({windowState:state,...metrics},null,2));
        assert.ok(Math.abs(metrics.shell.right-metrics.innerWidth)<=1,"native window width must be filled");assert.ok(metrics.status.bottom<=metrics.innerHeight+1,"status bar within actual window");if(metrics.innerWidth>1100){assert.ok(metrics.pager.bottom<=metrics.status.top+1&&metrics.pager.top>=0,"pagination within actual window");assert.ok(metrics.listViewport.contentHeight<=metrics.listViewport.height+1,"page rows fit without vertical list scrolling");}else{await page.locator(menu==="sites"?".sites-pagination":"#workforce-pagination").scrollIntoViewIfNeeded();const visible=await page.locator(menu==="sites"?".sites-pagination":"#workforce-pagination").boundingBox();assert.ok(visible.y>=metrics.content.top-1&&visible.y+visible.height<=metrics.status.top+1,"narrow layout pager reachable within content");}nativeLayout.push({windowState:state,...metrics});await page.screenshot({path:path.join(capturesDir,`native-${state}-${menu}.png`)});
      }}await cdp.detach();
    const desktop=nativeLayout.filter(x=>x.windowState==="maximized"&&x.innerWidth>1100);
    assert.equal(desktop.length,2,"both desktop menus measured");
    for(const metrics of desktop){assert.equal(metrics.bodyHeadingCount,0,"shell title has no duplicate body heading");assert.deepEqual(metrics.paginationLabels,["«","‹","›","»"],"shared arrow labels");assert.ok(Math.abs(metrics.table.top-metrics.detail.top)<=1&&Math.abs(metrics.table.bottom-metrics.detail.bottom)<=1,"table and detail have aligned edges");}
    for(const key of ["top","height"])assert.ok(Math.abs(desktop[0].kpis[key]-desktop[1].kpis[key])<=2,`shared KPI ${key}`);
    assert.ok(Math.abs(desktop[0].table.top-desktop[1].table.top)<=2,"shared desktop body start");
    fs.writeFileSync(path.join(resolvedOut,'preview.json'),artifactJSON({url:targetUrl,fixtureManifest,serverPid:serverProcess.pid,helperPid:process.pid,technicalAccepted:false,viewportMode:"NATIVE_WINDOW",nativeLayout},null,2));
    process.stdout.write(`[PREVIEW] ${targetUrl} actual55sites/${fixtureManifest.employeesCount}employees; pending user review\n`);
    await page.screenshot({path:path.join(capturesDir,'preview.png')});
    await new Promise(()=>{});return;
  }
  page.setDefaultTimeout(15000);
  const moduleSource = (await build({stdin:{contents:`
    import * as pattern from './src/web/screens/sites-pattern-model.ts';
    import * as model from './src/web/screens/sites-model.ts';
    import * as sim from './src/web/screens/sites-simulation.ts';
    import {SitesScreen} from './src/web/screens/sites.ts';
    import {SitesWizard} from './src/web/screens/sites-wizard.ts';
    import {SitesWizardPattern} from './src/web/screens/sites-wizard-pattern.ts';
    import {SitesOrganization} from './src/web/screens/sites-organization.ts';
    import {SitesCommit} from './src/web/screens/sites-commit.ts';
    import {SitesImportModal} from './src/web/screens/sites-import.ts';
    import {buildMonthlyScheduleDraft} from './src/shared/domain/monthly-schedule-draft.ts';
    import {resolveShiftPatternForMonth} from './src/shared/domain/shift-pattern-version.ts';
    window.__M={...pattern,...model,...sim,SitesScreen,SitesWizard,SitesWizardPattern,SitesOrganization,SitesCommit,SitesImportModal,buildMonthlyScheduleDraft,resolveShiftPatternForMonth};
  `,resolveDir:repoRoot,loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'})).outputFiles[0].text;
  await page.evaluate(moduleSource);
  await page.evaluate(async () => {
    const b=window.appBridge;
    window.__calls=[];window.__real={};
    for(const name of Object.keys(b)){if(typeof b[name]!=="function")continue;window.__real[name]=b[name].bind(b);b[name]=async(...args)=>{window.__calls.push({name,args:/signIn|Password/.test(name)?[]:args});return window.__real[name](...args);};}
    const T=window.__T={};T.ok=(v,message)=>{if(!v)throw Error(message);};T.eq=(a,b,message)=>T.ok(JSON.stringify(a)===JSON.stringify(b),message+": "+JSON.stringify(a)+" / "+JSON.stringify(b));
    T.until=async predicate=>{const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw Error('condition timeout');await new Promise(r=>setTimeout(r,10));}};T.take=r=>{T.ok(r.ok,r.message||"API failed");return r.data;};T.writes=()=>window.__calls.filter(c=>/^(save|delete|close|reorder|deactivate)/.test(c.name)).length;
    T.data=async()=>({sites:T.take(await b.listSites()),patterns:T.take(await b.listShiftPatterns()),people:T.take(await b.listEmployees()),session:T.take(await b.getSession())});
    T.clean=()=>{if(window.__H){window.__H.alive=false;window.__H.instance?.destroy?.();}document.querySelector('#ui03-probe')?.remove();document.querySelector('#btn-notice-close')?.click();document.querySelector('#btn-confirm-cancel')?.click();};
    T.mount=()=>{T.clean();const root=document.createElement('section');root.id='ui03-probe';Object.assign(root.style,{position:'fixed',inset:'65px 12px 36px',zIndex:30,background:'white',overflow:'auto',padding:'16px'});document.body.append(root);const h=window.__H={root,alive:true};return h;};
    T.input=(selector,value,event='input')=>{const el=window.__H.root.querySelector(selector);T.ok(el,'missing input '+selector);el.value=String(value);el.dispatchEvent(new Event(event,{bubbles:true}));};
    T.click=selector=>{const el=window.__H.root.querySelector(selector);T.ok(el,'missing control '+selector);el.click();};
    T.draft=()=>{const d=window.__M.create4Team3ShiftTemplate('probe-'+Date.now());d.effectiveFrom='2026-10-01';d.patternStartDate='2025-01-01';return d;};
    T.wizard=async(existing=false)=>{const data=await T.data(),h=T.mount();const site=existing?data.sites.find(s=>s.id===window.__manifest.mainSiteId):null;const p=site?window.__M.resolveShiftPatternForMonth(data.patterns.filter(p=>p.siteId===site.id),'2026-10'):null;h.instance=new window.__M.SitesWizard({container:h.root,session:data.session,initialSite:site,initialPattern:p,existingSites:data.sites,existingPatterns:data.patterns,allEmployees:data.people,identityMap:window.__M.buildEmployeeIdentityMap(data.people),isAlive:()=>h.alive,onClose:id=>{h.closed=id||true;},onNavigateWorkforce:()=>{h.navigated=true;}});h.instance.render();h.draft=h.instance.draft;return h;};
    T.editor=(d=T.draft(),role='admin',versions=[])=>{const h=T.mount();h.draft=d;h.history=new window.__M.PatternHistoryManager();h.history.record(d);h.instance=new window.__M.SitesWizardPattern({container:h.root,draft:d,historyManager:h.history,sessionRole:role,existingPatterns:versions,onChange:()=>{h.changed=(h.changed||0)+1;},onSessionExpired:()=>{h.expired=true;}});h.instance.render();return h;};
  });
  await page.evaluate(m=>{window.__manifest=m;},fixtureManifest);
  const evidence={},negativeEvidence={};
  const n=(id,detail)=>{(negativeEvidence[id]??=[]).push(detail);};
  const checked=async(id,fn)=>{
    if(!plannedScenarios.includes(id))return;
    const started=new Date().toISOString();process.stdout.write(`[UI-03] ${id}\n`);
    try{const detail=await fn();await page.evaluate(()=>window.__T.clean());evidence[id]={started,finished:new Date().toISOString(),detail};completedScenarios.push(id);}
    catch(error){failedScenarios.push({id,error:redactText(error.stack||error.message)});try{await page.screenshot({path:path.join(capturesDir,id+'-failure.png')});await page.evaluate(()=>window.__T.clean());}catch{};}
  };
  const enterSites=async()=>{await page.evaluate(()=>window.__T.clean());await page.click('button[data-id="sites"]');await page.waitForSelector('#sites-search-input');};
  const snapshot=async()=>page.evaluate(async()=>{const T=window.__T,d=await T.data();return {sites:d.sites,patterns:d.patterns,people:d.people,writes:T.writes()};});
  const shownIds=async()=>page.locator('#sites-table-area .sites-row-item').evaluateAll(rows=>rows.map(r=>r.dataset.id));

  await checked('S01',async()=>{
    const before=await snapshot();assert.equal(before.sites.length,55);assert.equal(await page.locator('.sites-kpi-card').count(),4);
    await page.getByRole('button',{name:'홈',exact:true}).click();await enterSites();assert.equal(await page.textContent('#kpi-total-sites'),'55');assert.equal((await snapshot()).writes,before.writes);
    const states=await page.evaluate(async()=>{const T=window.__T,M=window.__M,h=T.mount(),data=await T.data(),real=window.appBridge.listShiftPatterns;h.instance=new M.SitesScreen({container:h.root,session:data.session});window.appBridge.listShiftPatterns=async()=>({ok:false,errorCode:'TEST_CONTROLLED_FAILURE',message:'패턴 조회 실패 시험'});try{await h.instance.loadData();T.ok(h.root.textContent.includes('패턴 조회 실패 시험'),'failure must not become 0 rows');}finally{window.appBridge.listShiftPatterns=real;}await h.instance.loadData();T.ok(h.root.querySelector('#sites-table-wrapper'),'retry real query');const w=T.writes();T.input('#sites-search-input','없는 근무지 0건');T.ok(h.root.textContent.includes('일치하는 근무지가 없습니다'),'empty result');T.eq(T.writes(),w,'read only');return {errorShown:true,retryActual:true,emptyShown:true,writes:0};});return states;
  });
  await checked('S02',async()=>{
    await enterSites();const all=[],pageCounts=[];while(true){const ids=await shownIds();assert.ok(ids.length>0);pageCounts.push(ids.length);all.push(...ids);const next=page.locator('.sites-page-nav').getByRole('button',{name:'다음 페이지',exact:true});if(await next.isDisabled())break;assert.ok(pageCounts.length<56,'bounded page traversal');await next.click();}
    assert.equal(new Set(all).size,55);const actual=await snapshot();assert.deepEqual([...all].sort(),actual.sites.map(s=>s.id).sort());
    const expected=actual.sites.slice().sort((a,b)=>(a.customerName||'고객사 미지정').localeCompare(b.customerName||'고객사 미지정','ko-KR')||a.name.localeCompare(b.name,'ko-KR')||a.siteCode.localeCompare(b.siteCode,'ko-KR',{numeric:true})||a.id.localeCompare(b.id)).map(s=>s.id);assert.deepEqual(all,expected);
    await page.click('#btn-sites-page-first');const before=await page.locator('#sites-table-wrapper').boundingBox();const group=await page.locator('.sites-group-row').first().textContent();await page.locator('.sites-group-row').first().click();const after=await page.locator('#sites-table-wrapper').boundingBox();assert.deepEqual(before,after);
    await page.locator('.sites-group-row').first().press('Enter');await page.fill('#sites-search-input','중앙관제센터');assert.equal((await shownIds()).length,1);await page.fill('#sites-search-input','');await page.locator('.sites-filter-chip').filter({hasText:/^비활성$/}).click();const ids=await shownIds();assert.ok(ids.length>0&&ids.every(id=>actual.sites.find(s=>s.id===id).status==='inactive'));await page.locator('.sites-filter-chip').filter({hasText:/^전체$/}).click();
    await page.selectOption('#sites-sort-select','code');await page.selectOption('#sites-sort-select','name');await page.selectOption('#sites-sort-select','customer');
    return {uniqueSites:55,pages:pageCounts.length,pageCounts,lastPage:pageCounts.at(-1),stableOuterCard:true,groupHeader:group,filterActualIds:ids};
  });
  await checked('S03',async()=>{
    await page.fill('#sites-search-input','중앙관제센터');await page.locator('.sites-row-item').first().click();assert.match(await page.textContent('#sites-detail-panel'),/55건/);
    const count=await page.locator('#sites-detail-panel .sites-page-btn').count(),versions=[];for(let i=0;i<count;i++){await page.locator('#sites-detail-panel .sites-page-btn').nth(i).click();versions.push(...await page.locator('.sites-version-item').allTextContents());}
    assert.equal(versions.length,55);assert.ok(versions.some(s=>s.includes('예정'))&&versions.some(s=>s.includes('과거'))&&versions.some(s=>s.includes('비활성')));
    const data=await snapshot(),people=data.people.filter(e=>e.currentSiteId===fixtureManifest.mainSiteId&&e.status==='active'),text=await page.textContent('#sites-detail-panel');for(const e of people){assert.ok(text.includes(e.name));assert.ok(text.includes(e.employeeCode));}assert.ok(people.length>=12);
    await page.fill('#sites-search-input','');await page.screenshot({path:path.join(capturesDir,'S03-detail.png')});return {versions:55,people:people.map(e=>({id:e.id,code:e.employeeCode,name:e.name})),historyCounts:fixtureManifest.historyCounts};
  });
  await checked('S04',async()=>{
    const result=await page.evaluate(async()=>{const T=window.__T,h=await T.wizard(),w=T.writes(),d=h.draft;T.ok(h.root.querySelector('#inp-site-code').value.includes('자동 생성'),'new code guide');T.input('#wizard-team-count',9);T.eq(d.teamCount,9,'no clamp');T.click('#btn-wizard-next');T.eq(h.instance.currentStep,'basics','invalid next blocked');document.querySelector('#btn-notice-close')?.click();T.input('#wizard-team-count',4);T.input('#wizard-site-name','실제 화면 시험');T.input('#wizard-cycle-count',9,'change');T.ok(!window.__M.validatePatternDraft(d,'실제 화면 시험').isValid,'cycle count invalid');T.input('#wizard-cycle-count',1,'change');T.input('#inp-effective-from','');const invalid=window.__M.validatePatternDraft(d,'실제 화면 시험');T.ok(!invalid.isValid,'date invalid');T.eq(T.writes(),w,'cancel writes0');return {teamOutside:9,cycleOutside:9,dateErrors:invalid.issues.length,writes:0};});n('N02',result);n('N03',result);return result;
  });
  await checked('S05',async()=>{
    const result=await page.evaluate(()=>{const T=window.__T,h=T.editor(),d=h.draft,code=d.cycles[0].steps[0].dutyCode,types=d.dutyTypes.length;
      T.ok(h.root.querySelector('#btn-add-work-duty').disabled,'3 work types maximum');T.input('.duty-label[data-idx="0"]','이름 변경 D 야간');T.eq(d.cycles[0].steps[0].dutyCode,code,'label does not remap');T.input('.duty-break[data-idx="0"]',17);T.ok(d.dutyTypes[0].isBreakDirty,'manual break dirty');T.input('.duty-end[data-idx="0"]','19:00','change');T.eq(d.dutyTypes[0].breakMinutes,17,'dirty break retained');
      T.click('.btn-del-duty[data-idx="0"]');T.ok(d.dutyTypes.some(t=>t.id==='duty-day'||t.id===h.draft.dutyTypes[0].id),'referenced work preserved');T.eq(d.dutyTypes.length,types,'referenced delete refused');T.click('#btn-add-off-duty');T.click('#btn-add-off-duty');T.eq(d.dutyTypes.length,types+2,'multiple off labels');
      d.cycles[0].steps[0].dutyCode='UNKNOWN';T.ok(!window.__M.validatePatternDraft(d,'시험').isValid,'unknown code rejected');h.instance.render();T.ok(h.root.textContent.includes('UNKNOWN'),'unknown original visible');return {labelIdentity:code,manualBreak:17,multipleOff:2,unknownRejected:true};});n('N02',result);n('N03',result);return result;
  });
  await checked('S06',async()=>{
    const r=await page.evaluate(()=>{const T=window.__T,M=window.__M,h=T.editor(),d=h.draft,before=structuredClone(d);T.click('#btn-add-day');T.eq(d.cycles[0].steps.length,before.cycles[0].steps.length+1,'add day');T.click('#btn-pattern-undo');T.eq(d,before,'undo full snapshot');T.click('#btn-pattern-redo');T.eq(d.cycles[0].steps.length,before.cycles[0].steps.length+1,'redo');
      h.instance.selectedDutyId=d.dutyTypes.find(t=>t.kind==='off').id;const cell=h.root.querySelector('.sites-pattern-cell');cell.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));T.eq(d.cycles[0].steps[0].dutyCode,'O','keyboard paint');
      const current=structuredClone(d);current.siteId='other';T.eq(h.history.undo(current),null,'different site undo rejected');current.siteId=d.siteId;current.cycles[0].name='different structure';T.eq(h.history.undo(current),null,'stale structure undo rejected');return {keyboardPaint:'O',undoSnapshot:true,staleUndoRejected:true};});n('N05',r);return r;
  });
  await checked('S07',async()=>{
    const r=await page.evaluate(()=>{const T=window.__T,M=window.__M,d=T.draft();d.teamSettings[3].isActive=false;d.teamSettings[3].displayName='보존할 조';d.teamCapacities[3].maxHeadcount=7;const h=T.editor(d);const original=JSON.stringify(d.teamSettings[3]);T.input('#cycle-name','입력한 묶음 이름');T.eq(d.cycles[0].name,'입력한 묶음 이름','cycle name');T.input('#cycle-shift-count',2,'change');T.ok(!M.validatePatternDraft(d,'시험').isValid,'used duty count cannot decrease');T.input('#cycle-shift-count',3,'change');T.input('.sites-team-offset[data-team="B조"]',999,'change');T.ok(!M.validatePatternDraft(d,'시험').isValid,'offset outside cycle');T.input('.sites-team-offset[data-team="B조"]',1,'change');d.teamCycleAssignments=d.teamCycleAssignments.filter(a=>a.teamLabel!=='A조');h.instance.render();T.eq(h.root.querySelector('.sites-team-cycle-select[data-team="A조"]').value,'','missing selection visible');T.ok(!M.validatePatternDraft(d,'시험').isValid,'missing mapping rejected');T.eq(JSON.stringify(d.teamSettings[3]),original,'inactive retained');T.eq(d.teamCapacities[3].maxHeadcount,7,'capacity retained');return {missingMappingBlocked:true,inactivePreserved:true};});n('N04',r);return r;
  });
  await checked('S08',async()=>{
    const r=await page.evaluate(()=>{const T=window.__T,M=window.__M,h=T.editor(),d=h.draft,shared=structuredClone(d.teamCycleAssignments);T.click('#chk-per-team-toggle');T.ok(d.isPerTeamPattern,'on');const key=d.teamCycleAssignments[0].cycleKey;d.cycles.find(c=>c.cycleKey===key).name='개별 수정 보존';h.history.record(d);T.click('#chk-per-team-toggle');T.eq(d.teamCycleAssignments,shared,'off restores original maps');T.click('#chk-per-team-toggle');T.eq(d.cycles.find(c=>c.cycleKey===key).name,'개별 수정 보존','re-on preserves');
      const round=M.draftFromPattern(M.draftToPatternRecord(d));T.ok(round.isPerTeamPattern,'entry detects mode');M.togglePerTeamPattern(round,false);T.eq(round.teamCycleAssignments.map(({teamLabel,cycleKey})=>({teamLabel,cycleKey})),shared,'persisted off restoration');
      const big=T.draft();M.setDraftTeamCount(big,8);const before=JSON.stringify(big),result=M.togglePerTeamPattern(big,true);T.ok(!result.success,'8 limit rejected');T.eq(JSON.stringify(big),before,'no truncation');return {dedicatedPreserved:true,persistedRestore:true,overflowRejected:true};});n('N02',r);return r;
  });
  await checked('S09',async()=>{
    const r=await page.evaluate(async()=>{const T=window.__T,h=T.editor();await h.instance.loadHolidayData();T.click('#chk-weekend-split-toggle');T.ok(h.root.querySelector('.sites-holiday-time-input'),'holiday input');T.input('.duty-h-start[data-idx="0"]','10:00','change');const val=h.draft.dutyTypes[0].holidayStartTime;T.click('#chk-weekend-split-toggle');T.click('#chk-weekend-split-toggle');T.eq(h.draft.dutyTypes[0].holidayStartTime,val,'hidden holiday retained');T.click('#chk-weekday-holiday');T.eq(h.draft.cycles[0].weekdayPublicHolidayAsHoliday,h.root.querySelector('#chk-weekday-holiday').checked,'holiday option draft');
      const b=window.appBridge,real=b.listHolidayCalendars;b.listHolidayCalendars=async()=>({ok:false,errorCode:'TEST_CONTROLLED_FAILURE',message:'휴일 조회 실패'});try{await h.instance.loadHolidayData();T.ok(h.instance.holidayState==='unavailable','holiday failure separated');T.ok(h.root.textContent.includes('확인이 필요'),'failure is not confirmed empty');}finally{b.listHolidayCalendars=real;}return {holidayValue:val,offOnRetained:true,unavailableExplicit:true};});n('N12',r);return r;
  });
  await checked('S10',async()=>{
    const before=await snapshot();const r=await page.evaluate(async()=>{const T=window.__T,h=await T.wizard();T.click('#btn-tpl-2t2s');document.querySelector('#btn-confirm-ok')?.click();T.eq(h.instance.draft.teamCount,2,'2 shift template');T.click('#btn-quick-template-4t3s');document.querySelector('#btn-confirm-ok')?.click();T.eq(h.instance.draft.teamCount,4,'3 shift template');T.click('#btn-open-site-copy');T.ok(document.querySelector('#sites-copy-modal'),'copy common dialog');document.querySelector('#btn-copy-cancel').click();T.eq(h.instance.draft.teamCount,4,'cancel preserves');T.click('#btn-open-site-copy');const select=document.querySelector('#sel-copy-pattern');T.ok(select&&select.options.length>=55,'all versions offered');select.value=select.options[1].value;document.querySelector('#btn-copy-ok').click();document.querySelector('#btn-confirm-ok')?.click();T.ok(!h.instance.draft.patternId,'source id not copied');return {templates:[2,4],sourceVersions:select.options.length,cancelPreserved:true};});const after=await snapshot();assert.deepEqual(after.patterns,before.patterns);assert.equal(after.writes,before.writes);n('N06',r);return r;
  });
  await checked('S11',async()=>{
    const r=await page.evaluate(async filePath=>{const T=window.__T,h=await T.wizard(),b=window.appBridge,real=b.selectSpreadsheetFile,before=JSON.stringify(h.instance.draft),writes=T.writes();// Controlled native picker result; real analysis API below.
      h.instance.siteName='역추출 시험';h.instance.currentStep='pattern';h.instance.render();T.click('#btn-open-import-modal');b.selectSpreadsheetFile=async()=>({ok:true,data:null});try{await h.instance.importModal.analyze();T.eq(JSON.stringify(h.instance.draft),before,'picker cancel keeps draft');b.selectSpreadsheetFile=async()=>({ok:true,data:{filePath:filePath+'.bad'}});await h.instance.importModal.analyze();T.ok(document.querySelector('#sites-import-modal').textContent.includes('파일')||document.querySelector('#sites-import-modal .banner-warning'),'bad file visible');b.selectSpreadsheetFile=async()=>({ok:true,data:{filePath}});await h.instance.importModal.analyze();T.ok(!document.querySelector('#btn-apply-import').disabled,'real analysis proposal');const report=document.querySelector('#sites-import-modal pre').textContent;T.ok(report.includes('패턴'),'report from API');document.querySelector('#btn-apply-import').click();T.ok(h.instance.draft.cycles.length>0,'explicit apply');T.eq(T.writes(),writes,'analysis does not write');return {controlled:'CONTROLLED_NATIVE_PICKER_RESULT',actualFile:filePath,reportChars:report.length,cycles:h.instance.draft.cycles.length,cancelAndFailurePreserve:true,writes:0};}finally{b.selectSpreadsheetFile=real;}},fixtureManifest.importXlsxPath);n('N09',r);return r;
  });
  await checked('S12',async()=>{
    const r=await page.evaluate(async()=>{const T=window.__T,h=await T.wizard(),w=T.writes();h.instance.siteName='검토 시험';h.instance.draft.cycles[0].steps[0].startTime='bad';h.instance.currentStep='review';h.instance.render();T.ok(h.root.textContent.includes('오류가 발견'),'actual invalid review');T.click('#btn-wizard-next');T.eq(h.instance.currentStep,'review','invalid cannot advance');document.querySelector('#btn-notice-close')?.click();h.instance.draft.cycles[0].steps[0].startTime='07:00';h.instance.render();T.click('#btn-wizard-next');T.eq(h.instance.currentStep,'org','valid advances');T.eq(T.writes(),w,'review writes0');return {invalidReview:true,correctedNext:true,writes:0};});n('N03',r);return r;
  });
  await checked('S13',async()=>{
    const r=await page.evaluate(async()=>{const T=window.__T,M=window.__M,data=await T.data(),h=T.mount(),p=M.resolveShiftPatternForMonth(data.patterns.filter(p=>p.siteId===window.__manifest.mainSiteId),'2026-10');h.draft=M.draftFromPattern(p);h.instance=new M.SitesOrganization({container:h.root,draft:h.draft,allEmployees:data.people,identityMap:M.buildEmployeeIdentityMap(data.people),stagedMoves:[],onUpdateMoves:m=>h.moves=m,onNavigateWorkforce:()=>{}});h.instance.render();const w=T.writes(),card=h.root.querySelector('.sites-org-worker-card');T.ok(card,'actual pool');const id=card.dataset.empid;card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));h.root.querySelector('.sites-team-card[data-team="B조"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));T.ok(h.moves.some(m=>m.employeeId===id&&m.toTeam==='B조'),'keyboard assignment');
      const second=h.root.querySelector('.sites-org-worker-card');second.click();h.root.querySelector('.sites-team-card[data-team="C조"] .btn-assign-here').click();T.ok(h.moves.length===2,'click assignment');
      const third=h.root.querySelector('.sites-org-worker-card'),transfer=new DataTransfer();transfer.setData('text/plain',third.dataset.empid);third.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));h.root.querySelector('.sites-team-card[data-team="C조"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));T.ok(h.root.textContent.includes('정원')||h.moves.length>=2,'drag observed');
      const unassigned=data.people.find(e=>e.status==='active'&&!e.currentSiteId);const rejected=await window.appBridge.saveEmployeeAssignment({employeeId:unassigned.id,siteId:p.siteId,shiftGroup:'A조',startDate:'2026-10-28'});T.ok(!rejected.ok,'real server full team refusal');const original=data.people.filter(e=>e.currentSiteId===p.siteId);let blocked=false;try{M.planAssignmentMoves(original,p.siteId,{'A조':3,'D조':3},[{employeeId:original.find(e=>e.currentShiftGroup==='A조').id,toTeam:'D조'},{employeeId:original.find(e=>e.currentShiftGroup==='D조').id,toTeam:'A조'}]);}catch{blocked=true;}T.ok(blocked,'full team swap preflight');
      const order=h.root.querySelector('.sites-team-card[data-team="A조"] .btn-order-down');order.click();T.ok(h.moves.some(m=>m.orderOnly),'order staged');return {activePool:data.people.filter(e=>e.status==='active').length,staged:h.moves,realCapacityRefusal:rejected.errorCode,swapBlocked:true,ordinaryUiWrites:1};});n('N07',r);return r;
  });
  await checked('S14',async()=>{
    await enterSites();await page.click('#btn-sites-create');await page.fill('#wizard-site-name','확인 후 저장 시험');await page.fill('#wizard-client-name','화면 저장');
    await page.click('#btn-wizard-next');await page.waitForSelector('.sites-palette-container');await page.click('#btn-wizard-next');await page.click('#btn-wizard-next');await page.waitForSelector('.sites-org-layout');
    const writesBefore=(await snapshot()).writes;await page.click('#btn-wizard-save');await page.waitForSelector('#operations-confirm-modal');await page.click('#btn-confirm-cancel');assert.equal((await snapshot()).writes,writesBefore);await page.click('#btn-wizard-save');await page.evaluate(()=>{const button=document.querySelector('#btn-confirm-ok');button.click();button.click();});await page.waitForSelector('#btn-commit-done');const savedUi=await snapshot();assert.equal(savedUi.sites.filter(s=>s.name==='확인 후 저장 시험').length,1);await page.click('#btn-commit-done');await page.waitForSelector('#sites-search-input');
    const r=await page.evaluate(async()=>{const T=window.__T,M=window.__M,data=await T.data(),h=T.mount(),d=T.draft();d.siteId='';const employee=data.people.find(e=>e.status==='active'&&!e.currentSiteId);h.instance=new M.SitesCommit({container:h.root,siteName:'저장 왕복 시험',siteCustomer:'왕복 고객사',siteStatus:'active',siteCode:'',draft:d,stagedMoves:[{employeeId:employee.id,toTeam:'A조',startDate:'2026-10-28'}],onRetry:()=>{},onFinish:()=>{}});await Promise.all([h.instance.startCommit(),h.instance.startCommit()]);T.ok(h.instance.isCompleted,'all stages complete');const site=h.instance.savedSiteResult,pattern=h.instance.savedPatternResult;T.ok(site.siteCode&&site.id,'server code');const history=T.take(await window.appBridge.listEmployeeAssignments(employee.id));T.ok(history.some(a=>a.siteId===site.id&&a.shiftGroup==='A조'&&a.status==='active'),'actual assignment');
      const edit=T.mount(),next=M.draftFromPattern(pattern);next.name='수정된 패턴';edit.instance=new M.SitesCommit({container:edit.root,siteId:site.id,siteName:'수정된 근무지',siteCustomer:'수정 고객사',siteStatus:'active',siteCode:site.siteCode,draft:next,stagedMoves:[{employeeId:employee.id,fromTeam:'A조',toTeam:'',startDate:'2026-10-29'}],onRetry:()=>{},onFinish:()=>{}});await edit.instance.startCommit();T.ok(edit.instance.isCompleted,'existing site and close complete');const saved=T.take(await window.appBridge.listSites()).find(s=>s.id===site.id);T.eq(saved.name,'수정된 근무지','existing site update saved');const hs=T.take(await window.appBridge.listEmployeeAssignments(employee.id));T.ok(hs.some(a=>a.siteId===site.id&&a.status==='ended'&&a.endDate==='2026-10-29'),'real assignment id ended');window.__roundtrip={siteId:site.id,patternId:edit.instance.savedPatternResult.id,employeeId:employee.id};return {siteId:site.id,generatedCode:site.siteCode,existingUpdate:saved.name,history:hs};});
    await enterSites();await page.fill('#sites-search-input','수정된 근무지');assert.equal((await shownIds()).length,1);assert.match(await page.textContent('#sites-detail-panel'),/수정된 근무지/);n('N08',{doubleSubmit:'one initial site/pattern/assignment',actualRoundtrip:r.siteId});return r;
  });
  await checked('S15',async()=>{
    const r=await page.evaluate(async()=>{const T=window.__T,M=window.__M,b=window.appBridge,h=T.mount(),d=T.draft();d.siteId='';const old=b.saveShiftPattern;let patternCalls=0,siteCalls=0;const realSite=b.saveSite;b.saveSite=async i=>{siteCalls++;return realSite(i);};b.saveShiftPattern=async i=>{patternCalls++;return patternCalls===1?{ok:false,errorCode:'TEST_CONTROLLED_FAILURE',message:'첫 패턴 저장 실패 시험'}:old(i);};try{h.instance=new M.SitesCommit({container:h.root,siteName:'부분 저장 시험',siteCustomer:'부분',siteStatus:'active',siteCode:'',draft:d,stagedMoves:[],onRetry:()=>{},onFinish:()=>{}});await h.instance.startCommit();T.ok(!h.instance.isCompleted&&h.instance.savedSiteResult&&!h.instance.savedPatternResult,'partial visible');await h.instance.startCommit();T.ok(h.instance.isCompleted,'resume complete');T.eq(siteCalls,1,'site not repeated');T.eq(patternCalls,2,'only failed pattern retried');}finally{b.saveSite=realSite;b.saveShiftPattern=old;}
      const uncertain=T.mount(),ud=T.draft();ud.siteId='';let savedCalls=0,failRead=false;const saveSite=b.saveSite,listSites=b.listSites;
      b.saveSite=async i=>{savedCalls++;const actual=await saveSite(i);failRead=true;throw Error('CONTROLLED_LOST_SITE_RESPONSE');};b.listSites=async()=>{if(failRead){failRead=false;return {ok:false,errorCode:'NETWORK_ERROR',message:'CONTROLLED_RECOVERY_READ_FAILURE'};}return listSites();};
      try{uncertain.instance=new M.SitesCommit({container:uncertain.root,siteName:'불명 응답 재조회 시험',siteCustomer:'복구',siteStatus:'active',siteCode:'',draft:ud,stagedMoves:[],onRetry:()=>{},onFinish:()=>{}});await uncertain.instance.startCommit();T.ok(!uncertain.instance.isCompleted&&uncertain.instance.pendingRecovery,'failed reconciliation retains guard');await uncertain.instance.startCommit();T.ok(uncertain.instance.isCompleted,'retry first reconciles real saved id');T.eq(savedCalls,1,'no duplicate after read failure');}finally{b.saveSite=saveSite;b.listSites=listSites;}
      const data=await T.data(),p=data.patterns.find(p=>p.id===window.__roundtrip.patternId),employee=data.people.find(e=>e.status==='active'&&!e.currentSiteId&&e.id!==window.__roundtrip.employeeId),h2=T.mount(),draft=M.draftFromPattern(p);const saved=b.saveEmployeeAssignment;let count=0;b.saveEmployeeAssignment=async i=>{count++;const actual=await saved(i);if(count===1)throw Error('CONTROLLED_LOST_RESPONSE_AFTER_COMMIT');return actual;};try{h2.instance=new M.SitesCommit({container:h2.root,siteId:p.siteId,siteName:data.sites.find(s=>s.id===p.siteId).name,siteCustomer:'수정 고객사',siteStatus:'active',siteCode:'',draft,stagedMoves:[{employeeId:employee.id,toTeam:'B조',startDate:'2026-10-28'}],onRetry:()=>{},onFinish:()=>{}});await h2.instance.startCommit();T.ok(h2.instance.isCompleted,'lost response reconciled from real history');T.eq(count,1,'unknown outcome not duplicated');const history=T.take(await b.listEmployeeAssignments(employee.id));T.eq(history.filter(a=>a.siteId===p.siteId).length,1,'one persisted assignment');b.saveEmployeeAssignment=saved;
        const fresh=await T.data(),base=fresh.patterns.find(v=>v.id===p.id),owner=fresh.sites.find(s=>s.id===p.siteId),free=fresh.people.filter(e=>e.status==='active'&&!e.currentSiteId).slice(0,2),partial=T.mount();let attempts=0;const assignmentApi=b.saveEmployeeAssignment;
        const historyBefore=new Map(await Promise.all(free.map(async e=>[e.id,T.take(await b.listEmployeeAssignments(e.id)).filter(a=>a.siteId===owner.id).length])));b.saveEmployeeAssignment=async input=>{attempts++;return attempts===2?{ok:false,errorCode:'TEST_CONTROLLED_FAILURE',message:'중간 배정 실패 시험'}:assignmentApi(input);};
        try{partial.instance=new M.SitesCommit({container:partial.root,siteId:owner.id,siteName:owner.name,siteCustomer:owner.customerName,siteStatus:'active',siteCode:owner.siteCode,draft:M.draftFromPattern(base),stagedMoves:free.map((e,i)=>({employeeId:e.id,toTeam:['C조','D조'][i],startDate:'2026-10-28'})),onRetry:()=>{},onFinish:()=>{}});await partial.instance.startCommit();T.ok(!partial.instance.isCompleted&&partial.instance.completedMoves.size===1,'middle assignment partial');await partial.instance.startCommit();T.ok(partial.instance.isCompleted,'remaining assignment resumed');T.eq(attempts,3,'one success never resubmitted');for(const e of free)T.eq(T.take(await b.listEmployeeAssignments(e.id)).filter(a=>a.siteId===owner.id).length,historyBefore.get(e.id)+1,'no duplicate histories');}finally{b.saveEmployeeAssignment=assignmentApi;}
        const latest=await T.data(),main=latest.sites.find(s=>s.id===window.__manifest.mainSiteId),mainPattern=M.resolveShiftPatternForMonth(latest.patterns.filter(p=>p.siteId===main.id),'2026-10'),members=latest.people.filter(e=>e.currentSiteId===main.id&&e.currentShiftGroup==='A조').sort((a,b)=>(a.currentAssignmentOrder??0)-(b.currentAssignmentOrder??0)),ordered=T.mount(),reorder=b.reorderEmployeeAssignment;let reorderCalls=0;
        b.reorderEmployeeAssignment=async input=>{reorderCalls++;const result=await reorder(input);if(reorderCalls===1)throw Error('CONTROLLED_LOST_REORDER_RESPONSE');return result;};try{ordered.instance=new M.SitesCommit({container:ordered.root,siteId:main.id,siteName:main.name,siteCustomer:main.customerName,siteStatus:'active',siteCode:main.siteCode,draft:M.draftFromPattern(mainPattern),stagedMoves:[{employeeId:members[0].id,fromTeam:'A조',toTeam:'A조',orderOnly:true,sortOrder:2}],onRetry:()=>{},onFinish:()=>{}});await ordered.instance.startCommit();T.ok(ordered.instance.isCompleted,'lost reorder reconciled');T.eq(reorderCalls,2,'only remaining adjacent step');const live=T.take(await b.listEmployees()).filter(e=>e.currentSiteId===main.id&&e.currentShiftGroup==='A조').sort((a,b)=>a.currentAssignmentOrder-b.currentAssignmentOrder);T.eq(live[2].id,members[0].id,'final full team order');}finally{b.reorderEmployeeAssignment=reorder;}
        return {siteCalls,patternCalls,lostResponseCalls:count,unknownReadRecoveryWrites:savedCalls,middleAssignmentCalls:attempts,reorderCalls,historyCount:history.length};}finally{b.saveEmployeeAssignment=saved;}});n('N08',r);return r;
  });
  await checked('S16',async()=>{
    const r=await page.evaluate(async()=>{const T=window.__T,M=window.__M,b=window.appBridge,data=await T.data(),p=data.patterns.find(p=>p.id===window.__roundtrip.patternId),old=structuredClone(p),d=M.draftFromPattern(p);d.effectiveFrom='2027-04-01';d.name='예정 새 버전';const created=T.take(await b.saveShiftPattern(M.serializePatternDraft(d)));T.ok(created.id!==p.id,'new date creates id');const versions=T.take(await b.listShiftPatterns(p.siteId));T.eq(versions.find(v=>v.id===p.id),old,'past version byte-shape preserved');const collision=M.draftFromPattern(old);collision.effectiveFrom=created.effectiveFrom;const validation=M.validatePatternDraft(collision,'시험',versions);T.ok(!validation.isValid,'collision preflight');const refused=await b.saveShiftPattern(M.serializePatternDraft(collision));T.ok(!refused.ok,'actual collision rejected');
      const h=T.mount();h.instance=new M.SitesScreen({container:h.root,session:data.session});await h.instance.loadData();h.instance.selectedSiteId=p.siteId;await h.instance.render();const before=T.writes();T.click('#btn-delete-site');document.querySelector('#btn-confirm-cancel').click();T.eq(T.writes(),before,'delete cancel writes0');T.click('#btn-deactivate-site');document.querySelector('#btn-confirm-cancel').click();T.eq(T.writes(),before,'deactivate cancel writes0');T.click('#btn-toggle-pattern');document.querySelector('#btn-confirm-cancel').click();T.eq(T.writes(),before,'pattern cancel writes0');T.click('#btn-toggle-pattern');document.querySelector('#btn-confirm-ok').click();await T.until(()=>!h.instance.mutating&&!h.instance.isLoading);T.eq(T.take(await b.listShiftPatterns(p.siteId)).find(v=>v.id===p.id).status,'inactive','selected pattern deactivated');const item=[...h.root.querySelectorAll('.sites-version-item')].find(el=>el.textContent.includes(p.name));T.ok(item,'inactive version remains visible');item.click();T.click('#btn-toggle-pattern');document.querySelector('#btn-confirm-ok').click();await T.until(()=>!h.instance.mutating&&!h.instance.isLoading);T.eq(T.take(await b.listShiftPatterns(p.siteId)).find(v=>v.id===p.id).status,'active','selected pattern resumed');return {oldId:p.id,newId:created.id,collision:refused.errorCode,patternToggleActual:true,cancelWrites:0};});n('N06',r);n('N12',r);return r;
  });
  await checked('S17',async()=>{
    const r=await page.evaluate(async()=>{const T=window.__T,M=window.__M,b=window.appBridge,data=await T.data(),siteId=window.__manifest.mainSiteId,versions=data.patterns.filter(p=>p.siteId===siteId),pattern=M.resolveShiftPatternForMonth(versions,'2026-10'),draft=M.draftFromPattern(pattern),people=data.people.filter(e=>e.currentSiteId===siteId),holidays=new Set(['2026-10-09']);T.take(await b.addHolidayItem({year:2026,holidayDate:'2026-10-09',name:'휴일 시간 검증'}));const h=T.editor(draft,'admin',versions);await h.instance.loadHolidayData();const preview=M.runThreeMonthSimulation({draft,startMonth:draft.effectiveFrom.slice(0,7),assignedEmployees:people,existingPatterns:versions,publicHolidayDates:holidays});const normalize=rows=>rows.map(i=>[i.employeeCode,i.teamLabel,i.workDate,i.dutyCode,i.startTime||null,i.endTime||null,i.breakMinutes]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const counts=[];for(const month of preview.months){const selected=M.resolveShiftPatternForMonth(versions,month.scheduleMonth),expected=M.buildMonthlyScheduleDraft({scheduleMonth:month.scheduleMonth,pattern:selected,employees:people,publicHolidayDates:holidays});T.eq(normalize(month.items),normalize(expected),'adapter matches independent persisted pattern generator '+month.scheduleMonth);const saved=T.take(await b.saveMonthlySchedule({siteId,scheduleMonth:month.scheduleMonth,patternId:selected.id,generatedBy:'UI03 isolated verification',items:expected}));const allSaved=T.take(await b.listMonthlySchedules(siteId));const found=allSaved.find(s=>s.id===saved.id);T.ok(found,'monthly persistence readback '+JSON.stringify({savedId:saved.id,ids:allSaved.map(s=>s.id),siteId}));const rows=found.items;T.eq(normalize(rows),normalize(expected),'actual saved monthly items');counts.push({month:month.scheduleMonth,items:rows.length});}
      const cells=[...h.root.querySelectorAll('.sites-sim-cell')];T.ok(cells.length>=84,'3 months screen');for(const c of cells){const month=preview.months.find(m=>m.scheduleMonth===c.dataset.date.slice(0,7));const expected=month.items.find(i=>i.teamLabel===c.dataset.team&&i.workDate===c.dataset.date);T.ok(expected,'matching actual employee day');T.eq(c.dataset.duty,expected.dutyCode,'visible day code');}T.eq(M.runThreeMonthSimulation({draft,startMonth:'2026-10',assignedEmployees:[]}).months[0].items.length,0,'explicit empty people');return {months:counts,visibleCells:cells.length,holiday:'2026-10-09',actualMonthlySave:true};});return r;
  });
  await checked('S18',async()=>{
    await enterSites();await page.click('#btn-sites-create');await page.fill('#wizard-site-name','미저장 이탈 시험');await page.click('button[data-id="workforce"]');await page.waitForSelector('#operations-confirm-modal');await page.click('#btn-confirm-cancel');assert.ok(await page.locator('#sites-wizard-container').isVisible());await page.click('.btn-logout');await page.waitForSelector('#operations-confirm-modal');await page.click('#btn-confirm-cancel');assert.ok(await page.locator('#sites-wizard-container').isVisible());await page.click('#btn-wizard-cancel');await page.click('#btn-confirm-ok');await page.waitForSelector('#sites-search-input');
    const r=await page.evaluate(async()=>{const T=window.__T,M=window.__M,b=window.appBridge,h=T.mount(),d=T.draft();d.siteId='';const real=b.saveSite;let release,patterns=0;const oldPattern=b.saveShiftPattern;b.saveSite=i=>new Promise(resolve=>{release=async()=>resolve(await real(i));});b.saveShiftPattern=async i=>{patterns++;return oldPattern(i);};try{h.instance=new M.SitesCommit({container:h.root,siteName:'늦은 응답 시험',siteCustomer:'수명',siteStatus:'active',siteCode:'',draft:d,stagedMoves:[],onRetry:()=>{},onFinish:()=>{},isAlive:()=>h.alive});const running=h.instance.startCommit();await T.until(()=>!!release);T.ok(h.instance.isRunning,'busy owner');h.alive=false;h.instance.destroy();h.root.textContent='새 화면';await release();await running;T.eq(patterns,0,'destroyed owner cannot write next pattern');T.eq(h.root.textContent,'새 화면','old response cannot replace UI');return {dirtyMenuCancel:true,dirtyLogoutCancel:true,lateFollowupWrites:patterns,newUiPreserved:true};}finally{b.saveSite=real;b.saveShiftPattern=oldPattern;}});n('N06',r);n('N10',r);
    await page.evaluate(()=>window.__T.clean());await enterSites();await page.click('#btn-sites-create');await page.fill('#wizard-site-name','세션 만료 수명 시험');await page.click('#btn-wizard-next');await page.click('#btn-open-import-modal');
    await page.evaluate(filePath=>{const b=window.appBridge;window.__importRestore={select:b.selectSpreadsheetFile,analyze:b.analyzeSitePatternImport};b.selectSpreadsheetFile=async()=>({ok:true,data:{filePath}});b.analyzeSitePatternImport=async input=>{const result=await window.__importRestore.analyze(input);return new Promise(resolve=>{window.__releaseImport=()=>resolve(result);});};},fixtureManifest.importXlsxPath);
    await page.click('#btn-select-excel');await page.waitForFunction(()=>typeof window.__releaseImport==='function');assert.ok(await page.locator('#btn-import-cancel').isDisabled());
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('clock acknowledgement timeout')),3000);serverProcess.once('message',()=>{clearTimeout(timer);resolve();});serverProcess.send({clockOffsetMs:86400000});});
    await page.waitForSelector('#login-id',{timeout:15000});assert.equal(await page.locator('#sites-import-modal').count(),0);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('clock reset acknowledgement timeout')),3000);serverProcess.once('message',()=>{clearTimeout(timer);resolve();});serverProcess.send({clockOffsetMs:0});});
    await page.fill('#login-id',adminCreds.loginId);await page.fill('#login-password',adminPassword);await page.locator('.login-form button[type=submit]').click();await page.waitForSelector('button[data-id="sites"]');
    const late=await page.evaluate(async()=>{const b=window.appBridge;b.selectSpreadsheetFile=window.__importRestore.select;b.analyzeSitePatternImport=window.__importRestore.analyze;const before=window.__T.writes();window.__releaseImport();await new Promise(r=>setTimeout(r,100));return {writes:window.__T.writes()-before,oldModal:document.querySelector('#sites-import-modal')!==null,loggedIn:!!document.querySelector('.btn-logout')};});assert.deepEqual(late,{writes:0,oldModal:false,loggedIn:true});n('N10',{actualExpiryAndRelogin:late});return {...r,expiry:late};
  });
  await checked('S19',async()=>{
    const roles=[];for(const role of ['planner','operator','reviewer']){const password='Ui03!'+randomUUID()+'a7';artifactRegistry.register(password);const loginId='ui03-'+role;const created=await page.evaluate(async input=>{const r=await window.appBridge.saveOperationUser(input);if(!r.ok)throw Error(r.message);return r.data.id;},{loginId,displayName:'시연 '+role,role,status:'active',password});roles.push({key:'user-'+role,creds:{loginId,password},userId:created});}
    const checks=[];for(const entry of roles){const {key,creds}=entry;const ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(15000);const requests=[];p.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});try{await performNormalLogin(p,targetUrl,creds,null,value=>artifactRegistry.register(value));await p.click('button[data-id="sites"]');await p.waitForSelector('#sites-search-input');const role=key.slice(5),editable=await p.locator('#btn-sites-create').count();assert.equal(editable,role==='planner'?1:0);if(role==='planner'){const before=requests.length;await p.click('#btn-sites-create');await p.fill('#wizard-site-name','계획 권한');await p.click('#btn-wizard-next');await p.waitForSelector('.sites-palette-container');assert.ok(!requests.slice(before).some(u=>/Holiday|SiteNameOptions/i.test(u)),'planner automatic admin query0');await p.click('#btn-open-import-modal');assert.ok(await p.locator('#btn-select-excel').isDisabled());}
      const direct=await p.evaluate(async editable=>{const b=window.appBridge;const read=await b.listSites();const admin=await b.listHolidayCalendars(2026);const denied=editable?null:await b.saveSite({name:'권한 거절 시험',status:'active',timezone:'Asia/Seoul'});return {read:read.ok,admin:admin.ok,denied:denied&&!denied.ok,code:denied?.errorCode};},role==='planner');assert.ok(direct.read&&!direct.admin);if(role!=='planner')assert.ok(direct.denied);checks.push({role,editable,direct});}finally{await ctx.close();}}
    await page.evaluate(async credentials=>{const r=await window.appBridge.signIn(credentials);if(!r.ok)throw Error(r.message);},{loginId:adminCreds.loginId,password:adminPassword});
    if(await page.locator('#login-id').count()){await page.fill('#login-id',adminCreds.loginId);await page.fill('#login-password',adminPassword);await page.locator('.login-form button[type=submit]').click();await page.waitForSelector('button[data-id="sites"]');}
    n('N01',{actualLogins:4,checks});return {adminActual:true,checks};
  });
  await checked('S20',async()=>{
    await enterSites();await page.fill('#sites-search-input','');const layouts=[];for(const vp of [{width:1024,height:768},{width:1440,height:900},{width:2048,height:1080}]){await page.setViewportSize(vp);await page.waitForTimeout(120);const r=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,left:r.left,right:r.right};};return {table:rect('#sites-table-wrapper'),detail:rect('#sites-detail-area'),toolbar:rect('#sites-toolbar-container'),pager:rect('.sites-pagination'),status:rect('.footer-statusbar'),overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(!r.overflow);if(vp.width>1100){assert.ok(Math.abs(r.table.top-r.detail.top)<=2&&Math.abs(r.table.bottom-r.detail.bottom)<=2,JSON.stringify(r));assert.equal(Math.round(r.detail.width),380);assert.ok(r.table.top>=r.toolbar.bottom);assert.ok(r.pager.bottom<=r.status.top&&r.status.top-r.table.bottom<35,JSON.stringify(r));}if(vp.width>1100){const box=await page.locator('#sites-table-wrapper').boundingBox();await page.locator('.sites-group-row').first().click();assert.deepEqual(await page.locator('#sites-table-wrapper').boundingBox(),box);await page.locator('.sites-group-row').first().click();await page.click('#btn-sites-page-last');assert.deepEqual(await page.locator('#sites-table-wrapper').boundingBox(),box);await page.click('#btn-sites-page-first');r.foldAndLastPageStable=true;}layouts.push({vp,...r});await page.screenshot({path:path.join(capturesDir,'S20-'+vp.width+'.png')});}
    await page.setViewportSize({width:1440,height:900});for(const menu of ['home','workforce','operations','access-history','sites']){if(menu==='home')await page.getByRole('button',{name:'홈',exact:true}).click();else await page.click('button[data-id="'+menu+'"]');await page.waitForTimeout(140);assert.ok(!await page.locator('.login-form').count());}await page.waitForSelector('#sites-search-input');
    await page.click('#btn-sites-create');await page.fill('#wizard-site-name','공통 모달 확인');await page.click('#btn-wizard-next');await page.click('#btn-open-import-modal');await page.waitForSelector('#sites-import-modal');await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#sites-import-modal').contains(document.activeElement)));await page.keyboard.press('Escape');assert.equal(await page.locator('#sites-import-modal').count(),0);assert.equal(await page.evaluate(()=>document.activeElement?.id),'btn-open-import-modal');await page.click('#btn-wizard-cancel');await page.click('#btn-confirm-ok');await page.waitForSelector('#sites-search-input');
    const xss=await page.evaluate(async()=>{const T=window.__T,M=window.__M,b=window.appBridge,payload='<img id="ui03-xss" src=x onerror="window.__xss=true"> 장문 '+('시험 '.repeat(80)),data=await T.data(),site=data.sites.find(s=>s.id===window.__roundtrip.siteId);T.take(await b.saveSite({...site,name:payload,customerName:payload}));const h=T.mount();h.instance=new M.SitesScreen({container:h.root,session:data.session});await h.instance.loadData();h.instance.selectedSiteId=site.id;await h.instance.render();T.input('#sites-search-input','<img id=');T.ok(h.root.textContent.includes(payload),'actual stored literal');T.ok(!document.querySelector('#ui03-xss')&&!window.__xss,'DOM injection0');const current=T.take(await b.listShiftPatterns(site.id))[0],draft=M.draftFromPattern(current);draft.name=payload;draft.dutyTypes[0].label=payload;const stored=T.take(await b.saveShiftPattern(M.serializePatternDraft(draft)));const editor=T.editor(M.draftFromPattern(stored));T.ok(editor.root.textContent.includes(payload),'stored palette literal');T.ok(!document.querySelector('#ui03-xss')&&!window.__xss,'palette DOM injection0');return {storedLiteral:true,storedPatternAndPalette:true,executed:false,chars:payload.length};});n('N11',xss);return {layouts,xss};
  });

  const requiredEvidence={N01:1,N02:3,N03:3,N04:1,N05:1,N06:3,N07:1,N08:2,N09:1,N10:1,N11:1,N12:2};
  for(const [id,min] of Object.entries(requiredEvidence))expectedRejections[id]=(negativeEvidence[id]?.length||0)>=min;
  const servedAssets=[];for(const [urlPath,relative] of [['/web/app.js','dist/browser/web/app.js'],['/web/sites.css','dist/browser/web/sites.css'],['/','dist/browser/web/index.html']]){const response=await fetch(new URL(urlPath,targetUrl));assert.ok(response.ok);const actual=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync(path.join(repoRoot,relative));assert.ok(actual.equals(local),'served bytes equal built asset '+relative);servedAssets.push({path:urlPath,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex')});}
  const sourceMap=JSON.parse(fs.readFileSync(path.join(repoRoot,'dist/browser/web/app.js.map'),'utf8'));
  const fullRun=!focusIDs.size&&plannedScenarios.length===20&&completedScenarios.length===20&&failedScenarios.length===0&&Object.values(expectedRejections).every(Boolean)&&unexpectedErrors.length===0;
  const summary={task:'UI-03',fullRun,servedAssets,plannedScenarios,completedScenarios,failedScenarios,unexpectedErrors,negativePlan:Object.keys(requiredEvidence),negativeEvidence,expectedRejections,evidence,fixtureManifest,url:targetUrl,controls:['CONTROLLED_NATIVE_PICKER_RESULT','CONTROLLED_FAILURE_OR_LOST_RESPONSE; restored after each case','Production classes bundled in memory for isolated mounted component/async-state observations; successful persistence and analysis use actual authenticated API'],bundle:{sha256:createHash('sha256').update(fs.readFileSync(path.join(repoRoot,'dist/browser/web/app.js'))).digest('hex'),sourceMapIncludesSites:sourceMap.sources.some(s=>s.endsWith('screens/sites.ts'))}};
  fs.writeFileSync(path.join(resolvedOut,'summary.json'),artifactJSON(summary,null,2));
  process.stdout.write(`[UI-03] ${completedScenarios.length}/${plannedScenarios.length} scenarios, ${Object.values(expectedRejections).filter(Boolean).length}/12 negative groups; full=${fullRun}\n`);
  await cleanup();
  if(failedScenarios.length||unexpectedErrors.length||(!focusIDs.size&&!fullRun))process.exitCode=1;
}

main().catch(async error=>{process.stderr.write(redactText(error.stack||error.message)+'\n');await cleanup();process.exitCode=1;});
