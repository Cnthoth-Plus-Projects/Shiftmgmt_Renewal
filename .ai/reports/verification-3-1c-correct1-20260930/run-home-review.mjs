// Verification only. Reads product source and uses its real browser bridge.
// Synthetic session + HTTP response fixtures do not certify backend authentication.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL,fileURLToPath} from 'node:url';
const output=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Projects/Active/ShiftMgmt_V4';
const {build,stop}=await import(pathToFileURL(repo+'/node_modules/esbuild/lib/main.js'));
const {chromium}=await import(pathToFileURL(repo+'/node_modules/playwright/index.mjs'));
const {findChrome}=await import(pathToFileURL(repo+'/scripts/lib/find-chrome.mjs'));
const {CHANNEL_CONTRACTS}=await import(pathToFileURL(repo+'/dist/server/shared/bridge/channel-contracts.js'));
const methodByChannel=new Map(CHANNEL_CONTRACTS.map(c=>[c.channel,c.method]));
const entry='import { HomeScreen } from "C:/Projects/Active/ShiftMgmt_V4/src/web/screens/home";\nimport { installBrowserAppBridge } from "C:/Projects/Active/ShiftMgmt_V4/src/web/bridge/app-bridge";\ninstallBrowserAppBridge();\n(window as any).expiredCalls=0;\n(window as any).reviewHome=new HomeScreen({container:document.getElementById("main-content")!,session:{role:"admin",userId:"fixture-admin",displayName:"검증용 관리자"} as any,onSessionExpired:()=>{(window as any).expiredCalls++;}});\n(window as any).reviewHome.render();\n';
fs.writeFileSync(path.join(output,'probe-entry.ts'),entry);
await build({entryPoints:[path.join(output,'probe-entry.ts')],outfile:path.join(output,'probe-bundle.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!DOCTYPE html><meta charset="utf-8"><link rel="stylesheet" href="/web/styles.css"><link rel="stylesheet" href="/web/home.css"><main id="main-content"></main><script type="module" src="/probe-bundle.mjs"></script>');return;}
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=url.pathname==='/probe-bundle.mjs'?path.join(output,'probe-bundle.mjs'):url.pathname.startsWith('/web/')&&!url.pathname.includes('..')?path.join(repo,'dist/browser',url.pathname):null;
 if(file&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(fs.readFileSync(file));return;}
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';
const cases=['employees-fail','sites-fail','sync-fail','recovery-fail','watch-fail','late-retry-auth','late-watch-auth','pending-refresh-retry','pending-refresh-watch','timer-refresh-retry','timer-refresh-watch','h4-refresh-pending'];
const results=[];
let browser;
try{
 browser=await chromium.launch({executablePath:findChrome().path,headless:true});
 for(const name of cases){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
  let releaseHeld;const held=new Promise(r=>releaseHeld=r);let actionStarted=false;let siteCalls=0;
  const data={listSites:name==='employees-fail'?[{id:'site-a',name:'검증 근무지',status:'active'}]:[],listShiftPatterns:[],listEmployees:[],listMonthlySchedules:[],listSchedulePlanExports:[],listPerformanceOverview:{groups:[]},getPerformanceSyncState:{status:'idle',issueCount:0},getPerformanceStartupRecoveryStatus:{issues:[],approvedSyncIssueCount:0},listCalculationResults:[],listAllowanceProposalApprovals:[],listAllowanceDocumentExports:[],getFileWatchStatus:{isRunning:true}};
  if(name==='employees-fail')data.listShiftPatterns=[{id:'pattern-a',siteId:'site-a',status:'active',effectiveFrom:month+'-01'}];
  if(name==='sites-fail'){data.listMonthlySchedules=[{id:'schedule-a',siteId:'site-a',scheduleMonth:month}];data.listSchedulePlanExports=[{id:'export-a',scheduleId:'schedule-a',publishStatus:'published'}];}
  if(/retry/.test(name))data.getPerformanceStartupRecoveryStatus={issues:['검증용 복구 실패'],approvedSyncIssueCount:1};
  if(/watch/.test(name)&&name!=='watch-fail')data.getFileWatchStatus={isRunning:false};
  const targetMethod=/retry/.test(name)?'retryPerformanceStartupRecovery':'restartFileWatch';
  await page.route('**/api/**',async route=>{
   const method=methodByChannel.get(decodeURIComponent(new URL(route.request().url()).pathname.slice(5)));
   const faulty={'employees-fail':'listEmployees','sites-fail':'listSites','sync-fail':'getPerformanceSyncState','recovery-fail':'getPerformanceStartupRecoveryStatus','watch-fail':'getFileWatchStatus'}[name];
   let response={ok:true,data:data[method]??null};
   if(method===faulty)response={ok:false,errorCode:'FIXTURE_READ_FAILURE',message:'검증용 조회 실패'};
   if(method==='listSites'){siteCalls++;if(name==='h4-refresh-pending'&&siteCalls>1){await held;response={ok:false,errorCode:'FIXTURE_READ_FAILURE',message:'검증용 새로고침 실패'};}}
   if(method===targetMethod&&/^(late|pending|timer)/.test(name)){
    actionStarted=true;
    if(name.startsWith('timer'))response={ok:false,errorCode:'FIXTURE_ACTION_FAILURE',message:'검증용 액션 실패'};
    else{await held;response={ok:false,errorCode:'AUTH_SESSION_REQUIRED',message:'검증용 늦은 만료 응답'};}
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
  await page.goto(url);await page.locator('#card-progress-prep').waitFor();
  let observed, passed, kind;
  if(name==='employees-fail'||name==='sites-fail'){
   const selector=name==='employees-fail'?'#card-progress-prep':'#card-progress-ops';
   observed={text:await page.locator(selector).innerText(),errorBanner:await page.locator(selector+' .section-error-banner').count()};
   passed=observed.errorBanner===1&&!/\d+\/\d+/.test(observed.text);kind='previous-defect-fixed';
  }else if(name.endsWith('-fail')){
   observed={emptyTodos:await page.locator('#section-empty-todos').count(),errorRows:await page.locator('#todo-item-'+name.split('-')[0]+'-error').count()};
   passed=observed.emptyTodos===0&&observed.errorRows===1;kind='previous-defect-fixed';
  }else if(name==='h4-refresh-pending'){
   await page.locator('#section-empty-todos').waitFor();
   await page.evaluate(()=>{void window.reviewHome.refresh();});
   for(let i=0;siteCalls<2&&i<30;i++)await page.waitForTimeout(20);
   if(siteCalls<2)throw new Error('Refresh request not observed');
   observed={emptyTodosWhilePending:await page.locator('#section-empty-todos').count(),ariaBusyWhilePending:await page.locator('[aria-busy="true"]').count()};
   passed=observed.emptyTodosWhilePending===0;kind='remaining-defect';
   await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
   releaseHeld();await page.locator('#card-progress-ops .section-error-banner').waitFor();
  }else{
   const selector=/retry/.test(name)?'#btn-retry-recovery':'#home-btn-restart-watch';
   await page.locator(selector).click();
   for(let i=0;!actionStarted&&i<30;i++)await page.waitForTimeout(20);
   if(!actionStarted)throw new Error('Action request not observed');
   if(name.startsWith('late')){
    await page.evaluate(()=>{window.reviewHome.destroy();document.getElementById('main-content').textContent='홈 이탈 후 새 화면';});
    releaseHeld();await page.waitForTimeout(400);
    observed=await page.evaluate(()=>({expiredCalls:window.expiredCalls,text:document.getElementById('main-content').innerText}));
    passed=observed.expiredCalls===0&&observed.text==='홈 이탈 후 새 화면';kind='previous-defect-fixed';
   }else{
    if(name.startsWith('timer'))await page.waitForFunction(s=>document.querySelector(s)?.textContent==='실패: 재시도',selector);
    await page.evaluate(()=>window.reviewHome.refresh());
    const disabledBeforeRelease=await page.locator(selector).isDisabled();
    if(name.startsWith('timer'))await page.waitForTimeout(2300);else{releaseHeld();await page.waitForTimeout(400);}
    observed={disabledBeforeRelease,disabledAfterSettled:await page.locator(selector).isDisabled(),text:await page.locator(selector).innerText(),...(await page.evaluate(isRetry=>({expiredCalls:window.expiredCalls,busy:isRetry?window.reviewHome.isRetryingRecovery:window.reviewHome.isRestartingWatch}),/retry/.test(name)))};
    passed=!observed.disabledAfterSettled;kind='remaining-defect';
   }
  }
  if(name!=='h4-refresh-pending')await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
  const result={name,kind,requirementSatisfied:passed,observed,consoleOrPageErrors:errors};results.push(result);console.log(JSON.stringify(result));
  await context.close();
 }
 const result={chromeVersion:await browser.version(),viewport:'1440x900',fixtureBoundary:'HTTP responses via actual browser bridge',backendAuthVerified:false,sourceProductWrites:0,previousFixed:results.filter(r=>r.kind==='previous-defect-fixed'&&r.requirementSatisfied).length,remainingFailures:results.filter(r=>r.kind==='remaining-defect'&&!r.requirementSatisfied).length,results};
 fs.writeFileSync(path.join(output,'browser-reproduction.json'),JSON.stringify(result,null,2));
 if(result.previousFixed!==7||result.remainingFailures!==5||results.some(r=>r.consoleOrPageErrors.length))process.exitCode=1;
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));stop();}
