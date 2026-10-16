async(page)=>{const base='http://127.0.0.1:8765/',out={at:new Date().toISOString(),e9:[]};
for(const method of ['click','Enter','Space']){
 await page.goto(base+encodeURI('시안/2026-09-02-2차HTML/06-employees-1.html'),{waitUntil:'networkidle'});
 const b=page.locator('#btn-e9-panel-close');
 const before=await b.evaluate(b=>{const w=b.closest('.state-wrapper'),p=b.closest('aside');return {wrapper:w.id,panelClass:p?.className,buttons:[...w.querySelectorAll('button[aria-disabled="true"]')].map(e=>({id:e.id,text:e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),rowHeights:[...new Set([...w.querySelectorAll('table tbody tr')].map(e=>e.getBoundingClientRect().height))]};});
 if(method==='click')await b.click();else {await b.focus();await page.keyboard.press(method==='Space'?'Space':'Enter');}
 const after=await b.evaluate(b=>{const w=b.closest('.state-wrapper'),a=document.activeElement;return {panelDisplay:getComputedStyle(b.closest('aside')).display,focus:{tag:a.tagName,wrapper:a.closest('.state-wrapper')?.id,emp:a.getAttribute('data-emp')||a.getAttribute('data-emp-id')||a.dataset.empId,html:a.outerHTML.slice(0,180)},e2Panel:getComputedStyle(document.querySelector('#state-e2 aside:not(.sidebar)')).display};});
 out.e9.push({method,before,after});
}
return out;
}
