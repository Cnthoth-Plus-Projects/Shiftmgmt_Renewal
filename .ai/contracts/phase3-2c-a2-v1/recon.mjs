// Sol isolated real UI reconnaissance, not an A2 verifier implementation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const repo = 'C:/Projects/Active/ShiftMgmt_V4';
const require = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');
const { findChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/find-chrome.mjs')));
const { ensureAuthBootstrapCredentials } = await import(pathToFileURL(path.join(repo, 'dist/server/main/services/auth-bootstrap-service.js')));
const probe = net.createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(18741,'127.0.0.1',resolve);});
await new Promise(resolve=>probe.close(resolve));
const root = fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-a2-recon-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/^(SOL_|SHIFT_|SHIFTMGMT_|AUTH_BOOTSTRAP_)/.test(k) && !['NODE_OPTIONS','NODE_DEBUG'].includes(k)));
Object.assign(env,{SHIFTMGMT_USER_DATA_DIR:root,SHIFTMGMT_PORT:'18741'});
ensureAuthBootstrapCredentials({userDataPath:root,env});
const creds=JSON.parse(fs.readFileSync(path.join(root,'data/bootstrap-credentials.json'),'utf8')).credentials['user-admin'];
const secret=[creds.password];
const redact=s=>secret.reduce((text,value)=>text.split(value).join('[RAM_SECRET_REDACTED]'),String(s));
const out=fs.createWriteStream(path.join(root,'server-stdout.log'));
const err=fs.createWriteStream(path.join(root,'server-stderr.log'));
const child=spawn(process.execPath,[path.join(repo,'dist/server/main/server.js')],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(out,{end:false});child.stderr.pipe(err,{end:false});
const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,timeMs:Date.now()})));
const result={proof:'RECON_ONLY_NOT_A2_IMPLEMENTATION',root,serverPid:child.pid,observations:{},events:[],cleanup:[]};
let browser,context;
try {
  const deadline=Date.now()+30000;
  let health;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error('server exited before readiness');
    try{const r=await fetch('http://127.0.0.1:18741/api/health',{signal:AbortSignal.timeout(1000)});health=await r.json();if(r.status===200&&health?.ok&&fs.realpathSync(health.data.dataDir)===fs.realpathSync(root))break;}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  if(!health?.ok||fs.realpathSync(health.data.dataDir)!==fs.realpathSync(root))throw new Error('owned health not verified');
  result.healthOwned=true;
  const chrome=findChrome();result.chrome=chrome;
  browser=await chromium.launch({executablePath:chrome.path,headless:true});
  context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')result.events.push({kind:'console',text:redact(m.text()),location:m.location()});});
  page.on('pageerror',e=>result.events.push({kind:'pageerror',text:redact(e.stack)}));
  page.on('requestfailed',r=>result.events.push({kind:'requestfailed',url:r.url(),error:r.failure()}));
  const responses=[];
  page.on('response',r=>{if(r.url().includes('/api/'))responses.push({url:r.url(),status:r.status()});});
  await page.goto('http://127.0.0.1:18741/',{waitUntil:'networkidle'});
  result.observations.login={oldSelectorCount:await page.locator('#login-btn').count(),submitCount:await page.locator('.login-form button[type=submit]').count()};
  await page.locator('#login-id').fill(creds.loginId);await page.locator('#login-password').fill(creds.password);
  await page.locator('.login-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#l4-btn-submit')||document.querySelector('.btn-logout'));
  const l4=await page.locator('#l4-btn-submit').count();
  result.observations.login.firstChangeRequired=l4===1;
  if(l4){const next='Sm!'+crypto.randomBytes(16).toString('base64url')+'7a';secret.push(next);
    await page.locator('#l4-current-pw').fill(creds.password);await page.locator('#l4-new-pw').fill(next);await page.locator('#l4-confirm-pw').fill(next);await page.locator('#l4-btn-submit').click();creds.password=next;}
  await page.locator('.btn-logout').waitFor({timeout:15000});
  result.observations.login.session=await page.evaluate(async()=>{const r=await window.appBridge.getSession();return {ok:r.ok,userId:r.data?.user?.id,role:r.data?.user?.role};});
  await page.getByRole('button',{name:'활동 이력',exact:true}).click();await page.locator('#table-access-logs').waitFor({timeout:15000});
  result.observations.live={rows:await page.locator('#table-access-logs-body tr').count(),label:await page.locator('#access-history-count-label').textContent()};
  result.observations.geometry=await page.evaluate(()=>Object.fromEntries(['filter-date-from','filter-date-to','filter-keyword-input'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return[id,{width:r.width,height:r.height}];})));
  await page.screenshot({path:path.join(root,'live.png'),fullPage:true});
  await page.route('**/api/access-logs:list',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})}));
  await page.locator('#btn-refresh-logs').click();await page.locator('#state-g2-empty').waitFor();
  result.observations.empty={resetCount:await page.locator('#btn-empty-reset').count()};
  await page.screenshot({path:path.join(root,'empty.png'),fullPage:true});
  await page.unroute('**/api/access-logs:list');await page.locator('#btn-refresh-logs').click();await page.locator('#table-access-logs').waitFor();
  const signout=await page.evaluate(async()=>{const r=await window.appBridge.signOut();return {ok:r.ok};});
  result.observations.signout=signout;
  await page.locator('#btn-refresh-logs').click();await page.locator('#login-id').waitFor();
  result.observations.expired={loginCount:await page.locator('#login-id').count(),activityCount:await page.locator('#access-history-screen').count()};
  result.responses=responses;result.status='PASS';
} catch(e){result.status='FAIL';result.error={name:e.name,message:redact(e.message),stack:redact(e.stack)};}
finally {
  for(const[name,obj]of[['context',context],['browser',browser]])if(obj){try{await obj.close();result.cleanup.push({name,closed:true});}catch(e){result.cleanup.push({name,closed:false,error:redact(e.stack)});}}
  if(child.exitCode===null)child.kill();
  result.serverClose=await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),5000))]);
  for(const stream of[out,err])await new Promise((resolve,reject)=>{stream.once('close',resolve);stream.once('error',reject);stream.end();});
  result.retention='Own reconnaissance temp retained locally; bootstrap contains secrets and is not an evidence artifact';
  fs.writeFileSync(path.join(root,'recon.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({status:result.status,proof:result.proof,root,observations:result.observations,events:result.events,cleanup:result.cleanup,serverClose:result.serverClose}));
process.exitCode=result.status==='PASS'&&result.cleanup.every(x=>x.closed)&&!result.serverClose.timeout?0:1;
