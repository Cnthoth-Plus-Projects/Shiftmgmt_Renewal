async(page)=>{
const results=[]; const files=[{"file":"03-home-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"03-home-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-3.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-4.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-3.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-4.html","dir":"시안/2026-08-31-1차HTML/"}];
for(const {file,dir} of files){
await page.goto('http://127.0.0.1:8765/'+dir+file+'?codex_r2_sides=202609071508',{waitUntil:'networkidle'});
const ids=await page.locator('.state-wrapper').evaluateAll(es=>es.filter(w=>{let s=w.querySelector('.sidebar');return s&&!s.closest('[aria-hidden="true"]')}).map(w=>w.id));
for(const id of ids){
const w=page.locator('#'+id),s=w.locator('.sidebar'),toggle=w.locator('.btn-sidebar-toggle');
const measure=async()=>({data:await w.evaluate(w=>{const s=w.querySelector('.sidebar'),m=w.querySelector('.main-wrapper'),t=w.querySelector('.btn-sidebar-toggle');return {sidebarWidth:s.getBoundingClientRect().width,mainWidth:m.getBoundingClientRect().width,hidden:s.getAttribute('aria-hidden'),expanded:t.getAttribute('aria-expanded'),current:s.querySelectorAll('[aria-current="page"]').length,groups:[...s.querySelectorAll('.nav-group-header')].map(g=>({hidden:g.getAttribute('aria-hidden'),height:g.getBoundingClientRect().height,font:getComputedStyle(g).fontSize})),badges:[...s.querySelectorAll('.nav-badge')].map(b=>({text:b.textContent,title:b.title,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))};}),links:(await w.locator('nav').ariaSnapshot()).split('\n').filter(l=>l.includes('link ')).map(l=>l.trim())});
const before=await measure();await toggle.click();await page.waitForFunction(id=>document.querySelector('#'+id+' .sidebar').getBoundingClientRect().width===64,id);const collapsed=await measure();
await toggle.click();await page.waitForFunction(id=>document.querySelector('#'+id+' .sidebar').getBoundingClientRect().width===220,id);const restored=await measure();
results.push({file,id,before,collapsed,restored,menuNamesSame:JSON.stringify(before.links)===JSON.stringify(collapsed.links)&&JSON.stringify(before.links)===JSON.stringify(restored.links)});
}}
return {testedAt:new Date().toISOString(),results};
}
