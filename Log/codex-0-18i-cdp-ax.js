async(page)=>{
await page.setViewportSize({width:1440,height:900});const base='http://127.0.0.1:8765/';
const files=[{"file":"03-home-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"03-home-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-3.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"05-sites-wizard-4.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-1.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-2.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-3.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"08-performance-4.html","dir":"시안/2026-08-31-1차HTML/"},{"file":"00-shell-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"00-shell-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"04-sites-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"04-sites-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"06-employees-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"06-employees-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"06-employees-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"07-schedule-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"07-schedule-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"07-schedule-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"09-allowance-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"09-allowance-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"09-allowance-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"10-dashboard-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-1.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-2.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-3.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"11-operations-4.html","dir":"시안/2026-09-02-2차HTML/"},{"file":"12-access-logs-1.html","dir":"시안/2026-09-02-2차HTML/"}];
const cdp=await page.context().newCDPSession(page),results=[];
for(const f of files){
 await page.goto(base+encodeURI(f.dir+f.file),{waitUntil:'networkidle'});
 const ax=await cdp.send('Accessibility.getFullAXTree');
 results.push({...f,links:ax.nodes.filter(n=>!n.ignored&&n.role?.value==='link'&&n.name?.value?.startsWith('실적 관리')).map(n=>({name:n.name.value,backendDOMNodeId:n.backendDOMNodeId}))});
}
const shell=[];
for(const file of ['00-shell-1.html','00-shell-2.html']){
 await page.goto(base+encodeURI('시안/2026-09-02-2차HTML/'+file),{waitUntil:'networkidle'});
 const ids=await page.locator('main').evaluateAll(es=>es.map(e=>e.id));
 for(const id of ids){
  await page.goto(base+encodeURI('시안/2026-09-02-2차HTML/'+file),{waitUntil:'networkidle'});
  const warnings=[];const h=m=>{if(m.type()==='warning')warnings.push(m.text())};page.on('console',h);
  const doc=await cdp.send('DOM.getDocument'),q=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#'+id});
  const ax0=await cdp.send('Accessibility.getPartialAXTree',{nodeId:q.nodeId,fetchRelatives:false});
  await page.locator('a.skip-link[href="#'+id+'"]').focus();await page.keyboard.press('Enter');
  const ax1=await cdp.send('Accessibility.getPartialAXTree',{nodeId:q.nodeId,fetchRelatives:false});
  const focused=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,hidden:document.activeElement.getAttribute('aria-hidden')}));
  await page.keyboard.press('Tab');const afterTab=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,cls:document.activeElement.className,nav:!!document.activeElement.closest('nav,.sidebar')}));
  page.off('console',h);const compact=t=>t.nodes.map(n=>({ignored:n.ignored,role:n.role?.value,name:n.name?.value,ignoredReasons:n.ignoredReasons}));
  shell.push({file,id,axBeforeFocus:compact(ax0),axAfterFocus:compact(ax1),focused,afterTab,warnings});
 }
}
await cdp.detach();return {at:new Date().toISOString(),results,shell};
}
