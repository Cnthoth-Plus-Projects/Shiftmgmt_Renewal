async(page)=>{
const base='http://127.0.0.1:8765/';const out={at:new Date().toISOString(),p6:[],w7:[],shell:[]};
await page.setViewportSize({width:1440,height:900});
const cdp=await page.context().newCDPSession(page);
const axLinks=async()=>{const t=await cdp.send('Accessibility.getFullAXTree');return t.nodes.filter(n=>!n.ignored&&n.role?.value==='link'&&n.name?.value?.startsWith('실적 관리')).map(n=>n.name.value)};
const badge=async stage=>{const dom=await page.locator('#p6-sidebar-badge').evaluate(b=>({text:b.textContent.trim(),title:b.title,label:b.closest('a').getAttribute('aria-label'),chip:document.getElementById('p6-chip-pending').textContent.trim(),sideWidth:b.closest('.sidebar').getBoundingClientRect().width}));out.p6.push({stage,dom,names:await axLinks()})};
await page.goto(base+encodeURI('시안/2026-08-31-1차HTML/08-performance-3.html'),{waitUntil:'networkidle'});
await badge('initial');
await page.locator('#p6-row-2').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');
await page.locator('#btn-approve-single').click();await page.locator('#btn-single-confirm').click();await badge('single');
await page.locator('#btn-approve-file').click();await page.locator('#btn-file-confirm').click();await page.locator('#btn-file-done').click();await badge('file');
await page.locator('#btn-approve-file').click();await badge('reopened');await page.keyboard.press('Escape');
await page.locator('#state-p6 .btn-sidebar-toggle').click();await page.waitForFunction(()=>document.querySelector('#state-p6 .sidebar').getBoundingClientRect().width===64);await badge('collapsed');
await page.screenshot({path:'C:/Projects/Active/교대근무관리 시스템/Log/codex-0-18i-p6-collapsed.png',fullPage:false});
const scan=()=>{const w=document.getElementById('state-w7'),m=w.querySelector('main');const small=[],exceptions=[],heads=[],cells=[];
const walker=document.createTreeWalker(w,NodeFilter.SHOW_TEXT);let n;
while(n=walker.nextNode()){const e=n.parentElement,t=n.textContent.trim();if(!t||!e||!e.getClientRects().length||e.closest('script,style,[aria-hidden="true"]')||getComputedStyle(e).visibility==='hidden')continue;const fs=parseFloat(getComputedStyle(e).fontSize);
if(e.closest('.pattern-day-box'))continue;
if(e.matches('#state-w7 .c-cell b')&&fs===10){exceptions.push({t,fs});continue;}
if(fs<12)small.push({t,fs,tag:e.tagName,cls:e.className});}
for(const e of w.querySelectorAll('.c-head'))heads.push({fs:getComputedStyle(e).fontSize,h:e.getBoundingClientRect().height});
for(const e of w.querySelectorAll('.c-cell'))cells.push({fs:getComputedStyle(e).fontSize,bfs:getComputedStyle(e.querySelector('b')).fontSize,h:e.getBoundingClientRect().height});
return {dialogDisplay:getComputedStyle(document.getElementById('modal-leave-w7')).display,hidden:w.querySelector('.app-body').getAttribute('aria-hidden'),small,exceptions,heads,cells,main:{width:m.clientWidth,scroll:m.scrollWidth},active:document.activeElement.id,overflowers:[...w.querySelectorAll('*')].filter(e=>e.getClientRects().length&&!/auto|scroll/.test(getComputedStyle(e).overflowX+getComputedStyle(e).overflowY)&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)&&!e.matches('table,tbody,thead,tr,td,th,.sr-only,.skip-link')).map(e=>({tag:e.tagName,cls:e.className,w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight}))}};
for(const how of ['Escape','계속 편집','변경 버리고 나가기']){
 await page.goto(base+encodeURI('시안/2026-08-31-1차HTML/05-sites-wizard-3.html'),{waitUntil:'networkidle'});
 const before=await page.evaluate(scan);
 if(how==='Escape'){await page.locator('#btn-leave-stay').focus();await page.keyboard.press('Escape');}else await page.locator('#modal-leave-w7').getByRole('button',{name:how,exact:true}).click();
 const after=await page.evaluate(scan);out.w7.push({how,before,after});
 if(how==='Escape'){await page.locator('#state-w7').screenshot({path:'C:/Projects/Active/교대근무관리 시스템/Log/codex-0-18i-w7-after-close.png'});}
}
for(const file of ['00-shell-1','00-shell-2']){
 await page.goto(base+encodeURI('시안/2026-09-02-2차HTML/'+file+'.html'),{waitUntil:'networkidle'});
 const ids=await page.locator('main').evaluateAll(es=>es.map(e=>e.id));const local=[];
 for(const id of ids){
  const a=page.locator('a.skip-link[href="#'+id+'"]');await a.focus();await page.keyboard.press('Enter');
  const tree=await cdp.send('Accessibility.getFullAXTree');const focused=tree.nodes.filter(n=>!n.ignored&&n.properties?.some(p=>p.name==='focused'&&p.value?.value===true)).map(n=>({role:n.role?.value,name:n.name?.value}));
  const before=await page.locator('#'+id).evaluate(e=>({id:e.id,hidden:e.getAttribute('aria-hidden'),tabindex:e.getAttribute('tabindex'),focused:document.activeElement===e,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}}));
  const dom=await cdp.send('DOM.getDocument');const node=await cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#'+id});const axBefore=await cdp.send('Accessibility.getPartialAXTree',{nodeId:node.nodeId,fetchRelatives:false});
  await page.locator('#'+id).evaluate(e=>e.removeAttribute('aria-hidden'));
  const axAfter=await cdp.send('Accessibility.getPartialAXTree',{nodeId:node.nodeId,fetchRelatives:false});
  const after=await page.locator('#'+id).evaluate(e=>({hidden:e.getAttribute('aria-hidden'),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}}));
  local.push({before,focused,axBefore:axBefore.nodes.map(n=>({ignored:n.ignored,role:n.role?.value,name:n.name?.value,ignoredReasons:n.ignoredReasons})),after,axAfter:axAfter.nodes.map(n=>({ignored:n.ignored,role:n.role?.value,name:n.name?.value}))});
 }
 out.shell.push({file,states:local,inMemoryOnly:true});
}
await cdp.detach();return out;
}
