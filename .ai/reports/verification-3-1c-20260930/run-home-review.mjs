// Read-only source review: actual HomeScreen + actual browser bridge; fixtures only at HTTP responses.
// This fixture does not certify backend authentication or replace the required real login regression.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL, fileURLToPath} from 'node:url';
const output=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Projects/Active/ShiftMgmt_V4';
const esbuild=await import(pathToFileURL(repo+'/node_modules/esbuild/lib/main.js'));
const {chromium}=await import(pathToFileURL(repo+'/node_modules/playwright/index.mjs'));
const {findChrome}=await import(pathToFileURL(repo+'/scripts/lib/find-chrome.mjs'));
const {CHANNEL_CONTRACTS}=await import(pathToFileURL(repo+'/dist/server/shared/bridge/channel-contracts.js'));
const methodByChannel=new Map(CHANNEL_CONTRACTS.map(c=>[c.channel,c.method]));
await esbuild.build({entryPoints:[path.join(output,'probe-entry.ts')],outfile:path.join(output,'probe-bundle.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/') {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!DOCTYPE html><meta charset="utf-8"><link rel="stylesheet" href="/web/styles.css"><link rel="stylesheet" href="/web/home.css"><main id="main-content"></main><script type="module" src="/probe-bundle.mjs"></script>'); return;
  }
  let file;
  if(url.pathname==='/probe-bundle.mjs') file=path.join(output,'probe-bundle.mjs');
  else if(url.pathname.startsWith('/web/')&&!url.pathname.includes('..')) file=path.join(repo,'dist/browser',url.pathname);
  if(file&&fs.existsSync(file)&&fs.statSync(file).isFile()) {
    const type=file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/octet-stream';
    res.setHeader('Content-Type',type); res.end(fs.readFileSync(file)); return;
  }
  if(url.pathname==='/favicon.ico') {res.writeHead(204);res.end();return;}
  res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';
const chrome=findChrome();
let browser;
const results=[];
try {
 browser=await chromium.launch({executablePath:chrome.path,headless:true});
 for(const name of ['employees-fail','sites-fail','sync-fail','recovery-fail','watch-fail','late-retry-auth','late-watch-auth']) {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
  let releaseHeld;const held=new Promise(r=>releaseHeld=r);let actionStarted=false;
  const data={
   listSites:name==='employees-fail'?[{id:'site-a',name:'검증 근무지',status:'active'}]:[],
   listShiftPatterns:[],listEmployees:[],listMonthlySchedules:[],listSchedulePlanExports:[],
   listPerformanceOverview:{groups:[]},getPerformanceSyncState:{status:'idle',issueCount:0},
   getPerformanceStartupRecoveryStatus:{issues:[],approvedSyncIssueCount:0},
   listCalculationResults:[],listAllowanceProposalApprovals:[],listAllowanceDocumentExports:[],
   getFileWatchStatus:{isRunning:true}
  };
  if(name==='employees-fail') data.listShiftPatterns=[{id:'pattern-a',siteId:'site-a',status:'active',effectiveFrom:month+'-01'}];
  if(name==='sites-fail') {
    data.listMonthlySchedules=[{id:'schedule-a',siteId:'site-a',scheduleMonth:month}];
    data.listSchedulePlanExports=[{id:'export-a',scheduleId:'schedule-a',publishStatus:'published'}];
  }
  if(name==='late-retry-auth') data.getPerformanceStartupRecoveryStatus={issues:['검증용 복구 실패'],approvedSyncIssueCount:1};
  if(name==='late-watch-auth') data.getFileWatchStatus={isRunning:false};
  await page.route('**/api/**',async route=>{
    const channel=decodeURIComponent(new URL(route.request().url()).pathname.slice(5));
    const method=methodByChannel.get(channel);
    const faulty={ 'employees-fail':'listEmployees','sites-fail':'listSites','sync-fail':'getPerformanceSyncState','recovery-fail':'getPerformanceStartupRecoveryStatus','watch-fail':'getFileWatchStatus'}[name];
    let response={ok:true,data:data[method]??null};
    if(method===faulty) response={ok:false,errorCode:'FIXTURE_READ_FAILURE',message:'검증용 조회 실패'};
    if((name==='late-retry-auth'&&method==='retryPerformanceStartupRecovery')||(name==='late-watch-auth'&&method==='restartFileWatch')) {
      actionStarted=true;await held;response={ok:false,errorCode:'AUTH_SESSION_REQUIRED',message:'검증용 늦은 만료 응답'};
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
  await page.goto(url);
  await page.locator('#card-progress-prep').waitFor();
  let observed, violation;
  if(name==='employees-fail') {
    observed=await page.locator('#card-progress-prep').innerText();
    violation=/0\/1/.test(observed)&&!(await page.locator('#card-progress-prep .section-error-banner').count());
  } else if(name==='sites-fail') {
    observed=await page.locator('#card-progress-ops').innerText();
    violation=!(await page.locator('#card-progress-ops .section-error-banner').count());
  } else if(name.endsWith('-fail')) {
    observed=await page.locator('#main-content').innerText();
    violation=(await page.locator('#section-empty-todos').count())===1;
  } else {
    const selector=name==='late-retry-auth'?'#btn-retry-recovery':'#home-btn-restart-watch';
    await page.locator(selector).click();
    await page.waitForTimeout(100);
    if(!actionStarted) throw new Error('Fixture action was not started: '+name);
    await page.evaluate(()=>{window.reviewHome.destroy();document.getElementById('main-content').textContent='홈 이탈 후 새 화면';});
    releaseHeld();
    await page.waitForFunction(()=>window.expiredCalls>0,{},{timeout:2000});
    observed=await page.evaluate(()=>({expiredCalls:window.expiredCalls,text:document.getElementById('main-content').innerText}));
    violation=observed.expiredCalls===1;
  }
  await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
  const result={name,violatedRequirement:violation,observed,consoleOrPageErrors:errors};
  results.push(result);console.log(JSON.stringify(result));
  await context.close();
 }
 fs.writeFileSync(path.join(output,'browser-reproduction.json'),JSON.stringify({chromeVersion:await browser.version(),viewport:'1440x900',fixtureBoundary:'HTTP responses via actual browser bridge',backendAuthVerified:false,sourceProductWrites:0,results},null,2));
 if(results.length!==7||results.some(r=>!r.violatedRequirement||r.consoleOrPageErrors.length)) process.exitCode=1;
} finally {
 if(browser) await browser.close();
 await new Promise(r=>server.close(r));
 esbuild.stop();
}
