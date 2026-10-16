async(page)=>{
const base='http://127.0.0.1:8765/',out={at:new Date().toISOString(),skip:[],e9:[]};
const files=[{"file":"03-home-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"03-home-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-3.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-4.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-3.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-4.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"00-shell-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"00-shell-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"04-sites-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"04-sites-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"06-employees-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"06-employees-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"06-employees-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"07-schedule-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"07-schedule-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"07-schedule-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"09-allowance-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"09-allowance-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"09-allowance-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"10-dashboard-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-4.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"12-access-logs-1.html","dir":"시안/2026-09-02-2차HTML/"}];
const focus=()=>{const e=document.activeElement;return {tag:e.tagName,id:e.id,cls:e.className,main:e.closest('main')?.id||null,nav:!!e.closest('nav,.sidebar'),dialog:e.closest('[role="dialog"]')?.id||null,href:e.getAttribute('href')}};
for(const f of files){
 await page.goto(base+encodeURI(f.dir+f.file),{waitUntil:'networkidle'});
 let closedW7=null;
 if(f.file==='05-sites-wizard-3.html'){await page.locator('#btn-leave-stay').focus();await page.keyboard.press('Escape');closedW7=await page.locator('#modal-leave-w7').evaluate(e=>getComputedStyle(e).display)}
 const targets=await page.locator('a.skip-link').evaluateAll(es=>es.map(a=>a.getAttribute('href')));
 for(const href of targets){
  const a=page.locator('a.skip-link[href="'+href+'"]');
  await a.focus();await page.keyboard.press('Shift+Tab');
  const pre=await page.evaluate(focus);let tabs=0,reached=false;
  while(tabs<3&&!reached){await page.keyboard.press('Tab');tabs++;reached=await a.evaluate(e=>e===document.activeElement)}
  const tab=await page.evaluate(focus);await page.keyboard.press('Enter');const enter=await page.evaluate(focus);await page.keyboard.press('Tab');const after=await page.evaluate(focus);
  out.skip.push({...f,target:href.slice(1),closedW7,pre,tabs,reached,tab,enter,after});
 }
}
for(const method of ['click','Enter','Space']){
 await page.goto(base+encodeURI('시안/2026-09-02-2차HTML/06-employees-1.html'),{waitUntil:'networkidle'});
 const b=page.locator('#btn-e9-panel-close');
 const before=await b.evaluate(b=>{const w=b.closest('.state-wrapper'),p=b.closest('aside');return {wrapper:w.id,panelClass:p?.className,buttons:[...w.querySelectorAll('button[aria-disabled="true"]')].map(e=>({id:e.id,text:e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),rowHeights:[...new Set([...w.querySelectorAll('table tbody tr')].map(e=>e.getBoundingClientRect().height))]};});
 if(method==='click')await b.click();else {await b.focus();await page.keyboard.press(method==='Space'?'Space':'Enter');}
 const after=await b.evaluate(b=>{const w=b.closest('.state-wrapper'),a=document.activeElement;return {panelDisplay:getComputedStyle(b.closest('aside')).display,focus:{tag:a.tagName,wrapper:a.closest('.state-wrapper')?.id,emp:a.getAttribute('data-emp')||a.getAttribute('data-emp-id')||a.dataset.empId,html:a.outerHTML.slice(0,180)},e2Panel:getComputedStyle(document.querySelector('#state-e2 aside.side-panel')).display};});
 out.e9.push({method,before,after});
}
return out;
}
