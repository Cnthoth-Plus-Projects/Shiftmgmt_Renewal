async (page) => {
await page.setViewportSize({width:1440,height:900});
const base='http://127.0.0.1:8765/';
const dirs=['시안/2026-08-31-1차HTML/','시안/2026-09-02-2차HTML/'];
const files=[
['03-home-1','03-home-2','05-sites-wizard-1','05-sites-wizard-2','05-sites-wizard-3','05-sites-wizard-4','08-performance-1','08-performance-2','08-performance-3','08-performance-4'],
['00-shell-1','00-shell-2','01-login-1','01-login-2','02-common-1','02-common-2','02-common-3','04-sites-1','04-sites-2','06-employees-1','06-employees-2','06-employees-3','07-schedule-1','07-schedule-2','07-schedule-3','09-allowance-1','09-allowance-2','09-allowance-3','10-dashboard-1','11-operations-1','11-operations-2','11-operations-3','11-operations-4','12-access-logs-1']];
const results=[];
const focusInfo=()=>{const e=document.activeElement;return {tag:e.tagName,id:e.id,cls:e.className,main:e.closest('main')?.id||null,nav:!!e.closest('nav,.sidebar'),dialog:e.closest('[role="dialog"]')?.id||null,text:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,75)}};
for(let batch=0;batch<2;batch++)for(const name of files[batch]){
 const errors=[],consoleErrors=[];const onerror=e=>errors.push(e.message),onconsole=m=>{if(m.type()==='error')consoleErrors.push(m.text())};
 page.on('pageerror',onerror);page.on('console',onconsole);
 await page.goto(base+encodeURI(dirs[batch]+name+'.html'),{waitUntil:'networkidle'});
 const ax=await page.locator('body').ariaSnapshot();
 const perfNames=ax.split('\n').filter(l=>/^\s*- link "실적 관리/.test(l)).map(l=>l.trim());
 const staticData=await page.evaluate(()=>{
 const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
 const badRefs=[];for(const e of document.querySelectorAll('[aria-labelledby],[aria-describedby],[for]'))for(const a of ['aria-labelledby','aria-describedby','for'])for(const id of (e.getAttribute(a)||'').split(/\s+/).filter(Boolean))if(!document.getElementById(id))badRefs.push({el:e.id,attr:a,id});
 return {wrappers:document.querySelectorAll('.state-wrapper').length,duplicateIds:ids.filter((x,i)=>ids.indexOf(x)!==i),badRefs,
 icons:document.querySelectorAll('.material-symbols-outlined').length,iconLeaks:[...document.querySelectorAll('.material-symbols-outlined')].filter(e=>!e.closest('[aria-hidden="true"],[aria-label]')).map(e=>e.textContent),
 badges:[...document.querySelectorAll('.nav-badge,.nav-badge-dot')].map(b=>({state:b.closest('.state-wrapper')?.id,text:b.textContent.trim(),title:b.title,linkLabel:b.closest('a')?.getAttribute('aria-label'),hidden:!!b.closest('[aria-hidden="true"]')})),
 skips:[...document.querySelectorAll('a.skip-link')].map(a=>{const id=a.getAttribute('href').slice(1),m=document.getElementById(id),s=getComputedStyle(a);return {state:a.closest('.state-wrapper')?.id,target:id,tag:m?.tagName,tabindex:m?.getAttribute('tabindex'),nav:!!m?.querySelector('nav'),hidden:!!m?.closest('[aria-hidden="true"]'),text:m?.textContent.trim().length,clip:s.clip,controls:m?[...m.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(e=>e.getClientRects().length&&!e.disabled&&e.tabIndex>=0).length:0}})};
 });
 let firstTab=null; if(staticData.skips.length){await page.keyboard.press('Tab');firstTab=await page.evaluate(focusInfo)}
 const skipResults=[];
 for(const item of staticData.skips){
  if(name==='05-sites-wizard-3' && item.state==='state-w7') { await page.keyboard.press('Escape'); }
  const a=page.locator('a.skip-link[href="#'+item.target+'"]');
  await a.focus(); await page.keyboard.press('Shift+Tab'); const prior=await page.evaluate(focusInfo); await page.keyboard.press('Tab'); const tab=await page.evaluate(focusInfo);
  const reached=await a.evaluate(a=>document.activeElement===a);
  if(!reached)await a.focus();
  await page.keyboard.press('Enter');const enter=await page.evaluate(focusInfo);
  await page.keyboard.press('Tab');const after=await page.evaluate(focusInfo);
  skipResults.push({...item,closedW7BeforeTest:name==='05-sites-wizard-3'&&item.state==='state-w7',prior,tab,reachedByTab:reached,enter,after});
 }
 page.off('pageerror',onerror);page.off('console',onconsole);
 results.push({batch:batch+1,file:name+'.html',at:new Date().toISOString(),perfNames,staticData,firstTab,skipResults,errors,consoleErrors});
}
return {viewport:{width:1440,height:900},results};
}
