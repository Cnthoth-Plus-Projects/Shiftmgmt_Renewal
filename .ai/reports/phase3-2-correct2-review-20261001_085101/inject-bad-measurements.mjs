import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url));
const data={pid:process.pid,synthetic:true,description:'DOM measurement and accessible name faults to check assertions',measurements:[]};
const save=()=>fs.writeFileSync(path.join(out,`bad-measurements-${process.pid}.json`),JSON.stringify(data,null,2));
const {chromium}=createRequire('C:/Projects/Active/ShiftMgmt_V4/package.json')('playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...a)=>{
  const context=await newContext(...a);
  await context.addInitScript(()=>{
   const patch=()=>{
    const date=document.getElementById('filter-date-from');
    if(date){date.style.width='90px';date.style.height='24px';}
    const table=document.getElementById('table-access-logs');
    if(table)table.setAttribute('aria-label','SOL_BAD_ACCESSIBLE_NAME');
   };
   new MutationObserver(patch).observe(document,{childList:true,subtree:true});patch();
  });
  const newPage=context.newPage.bind(context);
  context.newPage=async(...p)=>{
   const page=await newPage(...p);
   const screenshot=page.screenshot.bind(page);
   page.screenshot=async(...s)=>{
    data.measurements.push(await page.evaluate(()=>{
     const date=document.getElementById('filter-date-from'),table=document.getElementById('table-access-logs');
     return{dateWidth:date?.getBoundingClientRect().width,dateHeight:date?.getBoundingClientRect().height,tableName:table?.getAttribute('aria-label')};
    }));save();return screenshot(...s);
   };
   return page;
  };
  return context;
 };
 return browser;
};
process.on('exit',save);
