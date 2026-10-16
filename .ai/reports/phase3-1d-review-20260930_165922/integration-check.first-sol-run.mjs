import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Projects/Active/ShiftMgmt_V4';
const require=createRequire(path.join(repo,'package.json'));
const {chromium}=require('playwright');
const {findChrome}=await import(pathToFileURL(path.join(repo,'scripts/lib/find-chrome.mjs')));
const info=JSON.parse(fs.readFileSync(path.join(dir,'server-info.json'),'utf8'));
const bootstrap=JSON.parse(fs.readFileSync(info.bootstrapPath,'utf8'));
const chrome=findChrome();
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(dir,'run-'+stamp);fs.mkdirSync(out);
const report={started:new Date().toISOString(),chrome,viewport:{width:1440,height:900},url:info.url,checks:[],measurements:{},captures:[],unexpected:[],expectedHttp:[],groups:[],sourceEdits:false};
report.script='integration-check.mjs';
let phase='startup',expectedUrls=new Set();
let browser;const pages=[];
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
function check(id,pass,actual,expected){report.checks.push({id,pass:!!pass,actual,expected});save();}
function watch(page){
 pages.push(page);page.setDefaultTimeout(12000);
 page.on('pageerror',e=>{report.unexpected.push({phase,type:'page',message:e.message});save();});
 page.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (401|403)/.test(m.text())){report.unexpected.push({phase,type:'console',message:m.text()});save();}});
 page.on('requestfailed',r=>{report.unexpected.push({phase,type:'request',url:r.url(),message:r.failure()?.errorText});save();});
 page.on('response',r=>{if(r.status()>=400){const item={phase,url:r.url(),status:r.status()};if(expectedUrls.has(r.url())&&[401,403].includes(r.status()))report.expectedHttp.push(item);else report.unexpected.push({...item,type:'http'});save();}});
}
async function group(name,fn){phase=name;try{await fn();report.groups.push({name,completed:true});}catch(e){report.groups.push({name,completed:false,error:e.message});}save();console.log('GROUP '+name+' '+report.groups.at(-1).completed);}
async function capture(page,name){
 await page.locator('input').evaluateAll(els=>els.forEach(e=>{if(e.type==='password')e.setAttribute('data-capture-mask','1');}));
 const filename=name+'.png';await page.screenshot({path:path.join(out,filename),fullPage:true,mask:[page.locator('[data-capture-mask]')]});report.captures.push(filename);save();
}
async function metrics(page,selectors){return page.evaluate(selectors=>Object.fromEntries(selectors.map(sel=>{const e=document.querySelector(sel);if(!e)return[sel,null];const s=getComputedStyle(e),r=e.getBoundingClientRect();return[sel,{x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundColor,color:s.color,border:s.borderColor,radius:s.borderRadius,fontSize:s.fontSize,fontWeight:s.fontWeight,padding:s.padding,shadow:s.boxShadow,outline:s.outline,hidden:s.display==='none',text:e.textContent.trim().slice(0,160)}];})),selectors);}
async function focused(page){return page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return{tag:e.tagName,id:e.id,label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,50),class:e.className,outline:s.outline,insideMain:!!e.closest('main')};});}
async function waitHome(page){await page.locator('.header-bar').waitFor();await page.waitForFunction(()=>document.querySelector('.home-container')?.getAttribute('aria-busy')!=='true'&&document.querySelector('.progress-card')&&document.querySelector('#sb-pending')?.textContent.includes('개'));}
const nextPasswords={};
async function login(page,cred,role){
 await page.goto(info.url);await page.locator('#login-id').waitFor();
 await page.locator('#login-id').fill(cred.loginId);await page.locator('#login-password').fill(nextPasswords[role]||cred.password);
 await page.locator('#login-password').press('Enter');
 await page.waitForFunction(()=>!!document.querySelector('#l4-btn-submit')||!!document.querySelector('.header-bar'));
 if(await page.locator('#l4-btn-submit').count()){
  const next='SolVerify9!'+randomBytes(9).toString('hex');
  if(role==='admin'){
   const desc=await page.locator('#l4-btn-submit').getAttribute('aria-describedby');
   check('L4-lock-described',!!desc,desc,'aria-describedby -> visible reason');
   await page.locator('#l4-confirm-pw').focus();await page.keyboard.press('Tab');await page.keyboard.press('Tab');const tabLock=await page.locator('#l4-btn-submit').evaluate(el=>({nativeDisabled:el.disabled,focused:document.activeElement===el,outline:getComputedStyle(el).outline}));check('L4-lock-focusable',!tabLock.nativeDisabled&&tabLock.focused,tabLock,'native disabled=false; actual Tab -> button, accent 2px ring');
   let changeRequests=0;const onChange=r=>{if(r.url().endsWith('/api/auth:change-password'))changeRequests++;};page.on('request',onChange);
   const probeLock=async()=>{const start=changeRequests;const btn=page.locator('#l4-btn-submit'),box=await btn.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);if(!await btn.evaluate(el=>el.disabled)){await btn.focus();await page.keyboard.press('Space');await page.keyboard.press('Enter');}await page.locator('#l4-confirm-pw').press('Enter');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return{newRequests:changeRequests-start,ariaDisabled:await btn.getAttribute('aria-disabled'),nativeDisabled:await btn.evaluate(el=>el.disabled)};};
   await page.locator('#l4-current-pw').fill(cred.password);await page.locator('#l4-new-pw').fill('short');await page.locator('#l4-confirm-pw').fill('short');
   const weak=await probeLock();check('L4-weak-password-blocked',weak.newRequests===0&&weak.ariaDisabled==='true',weak,'weak input: click/Space/Enter/form Enter cannot call change API; native-disabled keyboard activation unavailable is recorded separately');
   await page.locator('#l4-new-pw').fill(next);await page.locator('#l4-confirm-pw').fill(next+'x');
   const mismatch=await probeLock();check('L4-mismatch-blocked',mismatch.newRequests===0&&mismatch.ariaDisabled==='true',mismatch,'mismatch: zero change API requests');page.off('request',onChange);
   await capture(page,'admin-L4-lock');
  }
  await page.locator('#l4-current-pw').fill(cred.password);await page.locator('#l4-new-pw').fill(next);await page.locator('#l4-confirm-pw').fill(next);
  check(role+'-L4-valid-enabled',!await page.locator('#l4-btn-submit').isDisabled(),await page.locator('#l4-btn-submit').isDisabled(),false);
  if(role==='admin'){const label=phase;let requests=0;const onChange=r=>{if(r.url().endsWith('/api/auth:change-password'))requests++;};page.on('request',onChange);let release;const held=new Promise(r=>release=r);let entered;const reached=new Promise(r=>entered=r);await page.route('**/api/auth:change-password',async route=>{entered();await held;await route.continue();});await page.locator('#l4-confirm-pw').press('Enter');await reached;const pending=await page.locator('#l4-btn-submit').evaluate(el=>({nativeDisabled:el.disabled,ariaDisabled:el.getAttribute('aria-disabled'),empty:[...document.querySelectorAll('#l4-current-pw,#l4-new-pw,#l4-confirm-pw')].every(i=>i.value==='')}));await page.locator('#l4-confirm-pw').press('Enter');await page.evaluate(()=>document.querySelector('#l4-btn-submit').click());check('L4-pending-single-submit',pending.nativeDisabled&&pending.empty&&requests===1,{...pending,requests},'native disabled, fields cleared, double submit count1');release();await page.unroute('**/api/auth:change-password');await page.waitForSelector('.header-bar');page.off('request',onChange);}else{await page.locator('#l4-confirm-pw').press('Enter');}nextPasswords[role]=next;
 }
 await waitHome(page);
}
try{
 browser=await chromium.launch({executablePath:chrome.path,headless:true});report.actualChrome=browser.version();
 const context=await browser.newContext({viewport:report.viewport});const page=await context.newPage();watch(page);
 await group('login-design-keyboard',async()=>{
  await page.goto(info.url);await page.locator('#login-id').waitFor();await page.evaluate(()=>document.fonts.ready);
  const m=await metrics(page,['body','.login-container','.login-card','.form-input','.btn-primary','.login-title','.btn-eye-toggle']);report.measurements.login=m;
  check('L1-background',m['.login-container'].background==='rgb(229, 231, 235)',m['.login-container'].background,'#E5E7EB');
  check('L1-card-width',m['.login-card'].width===460,m['.login-card'].width,460);
  check('L1-card-border',m['.login-card'].border==='rgb(226, 229, 234)',m['.login-card'].border,'#E2E5EA');
  check('L1-card-variant',m['.login-card'].radius==='8px'&&m['.login-card'].padding==='36px 32px'&&m['.login-card'].shadow==='rgba(0, 0, 0, 0.06) 0px 4px 16px 0px',m['.login-card'],'8px / 36px32px / approved shadow');
  check('L1-input-radius',m['.form-input'].radius==='6px',m['.form-input'].radius,'6px canonical wins older HTML');
  check('L1-button-font',m['.btn-primary'].fontSize==='14px',m['.btn-primary'].fontSize,'14px login approved variant');
  await page.locator('#login-id').focus();const tab=[];
  for(let i=0;i<4;i++){tab.push(await focused(page));await page.keyboard.press('Tab');}
  report.measurements.loginTab=tab;
  check('L1-tab-order',tab[0].id==='login-id'&&tab[1].id==='login-password'&&tab[2].label==='비밀번호 표시'&&tab[3].tag==='BUTTON',tab,'ID -> password -> eye -> submit');
  check('L1-focus-ring',tab.every(f=>f.outline==='rgb(62, 86, 182) solid 2px'),tab.map(f=>f.outline),'accent solid2px');
  const eye=page.getByRole('button',{name:'비밀번호 표시',exact:true});await eye.focus();await page.keyboard.press('Space');
  check('L1-eye-space',await page.locator('#login-password').getAttribute('type')==='text',await page.locator('#login-password').getAttribute('type'),'text');
  await page.keyboard.press('Enter');check('L1-eye-enter',await page.locator('#login-password').getAttribute('type')==='password',await page.locator('#login-password').getAttribute('type'),'password');
  await page.keyboard.press('Escape');check('L1-escape-stable',await page.locator('#login-id').isVisible(),true,'full-page stays mounted; no dialog');
  const eyeStyle=m['.btn-eye-toggle'];check('static-eye-radius',eyeStyle.radius==='6px',eyeStyle.radius,'6px');report.measurements.iconFont=await page.locator('.btn-eye-toggle .material-symbols-outlined').evaluate(el=>({font:getComputedStyle(el).fontFamily,width:el.getBoundingClientRect().width,loaded:document.fonts.check('24px "Material Symbols Outlined"'),text:el.textContent}));await capture(page,'login-L1');
  await page.locator('#login-id').fill('sol-nonexistent-account');await page.locator('#login-password').fill('invalid');await page.locator('#login-password').press('Enter');
  await page.getByRole('alert').waitFor();check('L2-enter-error-alert',true,await page.getByRole('alert').innerText(),'visible login failure alert');await capture(page,'login-L2');
 });
 await group('admin-login-shell-home',async()=>{
  await login(page,bootstrap.credentials['user-admin'],'admin');
  const m=await metrics(page,['body','.sidebar','.header-bar','.footer-statusbar','.page-content','.progress-card','.section-card','.role-badge','.header-title','.btn-sidebar-toggle']);report.measurements.admin=m;
  check('shell-sidebar-expanded',m['.sidebar'].width===220,m['.sidebar'].width,220);
  check('shell-header-height',m['.header-bar'].height===56,m['.header-bar'].height,56);
  check('shell-footer-height',m['.footer-statusbar'].height===32,m['.footer-statusbar'].height,32);
  check('shell-main-height',m['.page-content'].height===812,m['.page-content'].height,812);
  const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--bg','--line','--text','--text-sub','--accent-hover','--success-bg'].map(k=>[k,s.getPropertyValue(k).trim()]));});report.measurements.rootTokens=tokens;
  for(const[k,v]of Object.entries({'--bg':'#F4F5F7','--line':'#E2E5EA','--text':'#1F2430','--text-sub':'#4B5563','--accent-hover':'#32479B','--success-bg':'#E8F5EE'}))check('token-'+k,tokens[k]?.toUpperCase()===v,tokens[k],v);
  check('home-cards-flat',m['.progress-card'].radius==='6px'&&m['.progress-card'].shadow==='none'&&m['.section-card'].radius==='6px'&&m['.section-card'].shadow==='none',{progress:m['.progress-card'],section:m['.section-card']},'6px/no shadow');
  check('static-sidebar-radius',m['.btn-sidebar-toggle'].radius==='6px',m['.btn-sidebar-toggle'].radius,'6px');check('static-header-title',m['.header-title'].fontSize==='20px'&&m['.header-title'].fontWeight==='600',m['.header-title'],'20px/600');await capture(page,'admin-home');
  await page.reload();await waitHome(page);await page.keyboard.press('Tab');const first=await focused(page);
  check('shell-first-tab-skip',first.class==='skip-link',first,'본문 바로가기');
  await page.keyboard.press('Enter');const enter=await focused(page);await page.keyboard.press('Tab');const next=await focused(page);report.measurements.skip={first,enter,next};
  report.measurements.skip.initialNote='No focusable main/footer controls at this point; test again when a real action exists.';
  const toggle=page.getByRole('button',{name:'사이드바 접기/펼치기'});await toggle.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width===64);
  check('shell-collapse-space',true,(await metrics(page,['.sidebar']))['.sidebar'].width,64);await capture(page,'admin-shell-collapsed');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width===220);check('shell-expand-enter',true,220,220);
  const nav=page.locator('nav[aria-label="주 메뉴"]');const labels=await nav.locator('button').allTextContents();report.measurements.adminMenus=labels.map(x=>x.trim());
  check('admin-nine-menus',labels.length===9,labels.length,'home + eight existing menus');
  for(const name of ['근무표 생성','실적 가져오기','근무 현황','근무표 조정','수당 계산','품의서 출력','조직 관리','사용자 관리']){
   const btn=nav.getByRole('button',{name:new RegExp(name)});await btn.focus();await page.keyboard.press(name==='실적 가져오기'?'Space':'Enter');
   await page.waitForFunction(n=>document.querySelector('#header-current-title')?.textContent===n,name);
   check('nav-'+name,await btn.getAttribute('aria-current')==='page'&&(await page.locator('.notice-banner').innerText()).includes('화면 준비 중'),{current:await btn.getAttribute('aria-current'),notice:await page.locator('.notice-banner').innerText()},'current page + honest placeholder');
  }
  const placeholder=(await metrics(page,['.content-card']))['.content-card'];report.measurements.placeholder=placeholder;check('placeholder-card-flat',placeholder.radius==='6px'&&placeholder.shadow==='none',placeholder,'6px/no shadow');await capture(page,'admin-menu-placeholder');
  await nav.getByRole('button',{name:/홈/}).click();await waitHome(page);check('nav-home-return',true,'home mounted','home mounted');
  check('home-no-horizontal-overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),await page.evaluate(()=>document.documentElement.scrollWidth),1440);
  const smaller={width:1024,height:768};await page.setViewportSize(smaller);check('home-1024-no-horizontal-overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),await page.evaluate(()=>document.documentElement.scrollWidth),1024);await capture(page,'admin-home-1024');await page.setViewportSize(report.viewport);
  const icons=await page.locator('.material-symbols-outlined').evaluateAll(els=>els.filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&!e.closest('[aria-hidden="true"]');}).map(e=>({text:e.textContent,parent:e.parentElement.tagName})));report.measurements.icons=icons;
  check('shell-home-icons-hidden',icons.length===0,icons,'decorative icons aria-hidden=true');
 });
 await group('admin-watch-and-users',async()=>{
  const stopped=await page.evaluate(()=>window.appBridge.stopFileWatch());check('admin-can-stop-watch',stopped.ok,stopped.ok,true);
  await page.evaluate(()=>window.statusBar.refresh());await page.locator('#btn-restart-watch').waitFor();
  await page.reload();await waitHome(page);await page.locator('#btn-restart-watch').waitFor();
  await page.keyboard.press('Tab');const first=await focused(page);await page.keyboard.press('Enter');await page.waitForURL('**/#main-content');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const enter=await focused(page);await page.keyboard.press('Tab');const next=await focused(page);report.measurements.skip.withAction={first,enter,next};
  check('shell-skip-passes-nav-header',enter.id==='main-content'||next.insideMain||next.id==='btn-restart-watch',{enter,next},'Tab after skip reaches main action or footer, bypassing sidebar/header');
  const m=(await metrics(page,['#btn-restart-watch']))['#btn-restart-watch'];report.measurements.restart=m;check('watch-restart-font-min12',parseFloat(m.fontSize)>=12,m.fontSize,'>=12px');check('static-restart-radius',m.radius==='6px',m.radius,'6px');await capture(page,'admin-watch-stopped');
  const restart=page.locator('#btn-restart-watch');await restart.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#sb-watch')?.textContent.includes('폴더 감시 중'));
  check('admin-watch-enter-restarted',true,'폴더 감시 중','actual API success');
  for(const role of ['planner','reviewer']){
   const cred={loginId:'sol-test-'+role,password:'SolInitial8!'+randomBytes(9).toString('hex')};
   const created=await page.evaluate(async({role,cred})=>{const r=await window.appBridge.saveOperationUser({...cred,displayName:'검수 '+role,role,status:'active'});return{ok:r.ok,code:r.code};},{role,cred});
   if(!created.ok)throw new Error('temporary role creation failed '+role+' '+created.code);bootstrap.credentials[role]=cred;check(role+'-created-real-api',true,true,true);
  }
 });
 await group('actual-session-invalidation',async()=>{
  expectedUrls=new Set([info.url+'api/performance:get-sync-state',info.url+'api/performance:list-pending-files']);
  const expired=page.waitForResponse(r=>r.url().endsWith('/api/performance:get-sync-state')&&r.status()===401);
  await page.evaluate(async()=>{const status=window.statusBar;await window.appBridge.signOut();await status.refresh();});
  await expired;await page.locator('#login-id').waitFor();check('expired-session-returns-login',true,'L1','server invalidation -> refresh -> login');
  check('expired-shell-destroyed',await page.locator('.header-bar').count()===0,await page.locator('.header-bar').count(),0);await capture(page,'session-expired');expectedUrls=new Set();await context.close();
 });
 for(const role of ['operator','planner','reviewer'])await group('role-'+role,async()=>{
  const ctx=await browser.newContext({viewport:report.viewport});const p=await ctx.newPage();watch(p);let naturalWatch=0;
  p.on('request',r=>{if(r.url().endsWith('/api/operations:get-file-watch-status'))naturalWatch++;});
  await login(p,bootstrap.credentials[role==='operator'?'user-operator':role],role);await p.evaluate(()=>window.statusBar.refresh());
  const menus=await p.locator('nav[aria-label="주 메뉴"] button').allTextContents();report.measurements[role]={menus:menus.map(x=>x.trim()),watchCellCount:await p.locator('#sb-watch').count(),naturalWatch};
  check(role+'-seven-menus',menus.length===7,menus.length,'home + six work menus');check(role+'-no-admin-menus',!menus.some(x=>/조직 관리|사용자 관리/.test(x)),menus.map(x=>x.trim()),'management not rendered');
  check(role+'-no-watch-cell',await p.locator('#sb-watch').count()===0,await p.locator('#sb-watch').count(),0);check(role+'-no-watch-api',naturalWatch===0,naturalWatch,0);
  await capture(p,role+'-home');
  expectedUrls=new Set([info.url+'api/operations:get-file-watch-status',info.url+'api/operations:list-users']);
  const denied=await p.evaluate(async()=>{const a=await window.appBridge.getFileWatchStatus();const b=await window.appBridge.listOperationUsers();return{watch:{ok:a.ok,errorCode:a.errorCode},users:{ok:b.ok,errorCode:b.errorCode}};});
  check(role+'-watch-denied',!denied.watch.ok&&denied.watch.errorCode==='AUTH_FORBIDDEN',denied.watch,'AUTH_FORBIDDEN (existing HTTP200 BridgeFailure contract)');check(role+'-users-denied',!denied.users.ok&&denied.users.errorCode==='AUTH_FORBIDDEN',denied.users,'AUTH_FORBIDDEN (existing HTTP200 BridgeFailure contract)');expectedUrls=new Set();
  const logout=p.getByRole('button',{name:'로그아웃',exact:true});await logout.focus();await p.keyboard.press('Enter');await p.locator('#login-id').waitFor();check(role+'-logout-enter',true,'L1','L1');await ctx.close();
 });
 await group('approved-reference-render',async()=>{
  const control=path.resolve(dir,'../../..');
  const refs={login:path.join(control,'시안/2026-09-02-2차검토/스냅샷19차/2차/01-login-1.html'),shell:path.join(control,'시안/2026-09-02-2차검토/스냅샷19차/2차/00-shell-1.html'),home:path.join(control,'시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-1.html')};
  for(const[name,file]of Object.entries(refs)){
   const p=await browser.newPage({viewport:report.viewport});await p.goto(pathToFileURL(file).href,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);
   report.measurements['reference-'+name]=await metrics(p,['body','.login-card','.sidebar','.header-bar','.footer-statusbar','.progress-card','.section-card']);await capture(p,'reference-'+name);await p.close();
  }
  check('approved-html-rendered',true,Object.keys(refs),'login/shell/home comparison artifacts');
 });
}finally{
 if(browser)await browser.close();report.finished=new Date().toISOString();report.browserClosed=true;
 report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,groupsCompleted:report.groups.filter(g=>g.completed).length,groupsFailed:report.groups.filter(g=>!g.completed).length,unexpectedErrors:report.unexpected.length,captures:report.captures.length};save();
 fs.writeFileSync(path.join(dir,'latest-run.json'),JSON.stringify({directory:out,summary:report.summary},null,2));console.log(JSON.stringify(report.summary));
}
