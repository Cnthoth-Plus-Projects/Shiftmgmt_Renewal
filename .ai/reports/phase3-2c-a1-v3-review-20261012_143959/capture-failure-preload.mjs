// Independent SUT partial-evidence probe: fail after actual page/DOM acquisition.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json');
const {chromium}=require('playwright');
const events=process.env.SOL_CAPTURE_EVENTS;
const note=(type,data={})=>fs.appendFileSync(events,JSON.stringify({type,timeMs:Date.now(),pid:process.pid,...data})+'\n');
const original=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await original(...args);note('actual-browser-created');
 const context=browser.newContext.bind(browser);
 browser.newContext=async(...values)=>{
  const ctx=await context(...values);note('actual-context-created');
  const page=ctx.newPage.bind(ctx);
  ctx.newPage=async(...values)=>{
   const p=await page(...values);const screenshot=p.screenshot.bind(p);
   p.screenshot=async()=>{note('capture-fault-triggered',{actualViewport:p.viewportSize(),actualUrl:p.url(),idCount:await p.locator('#login-id').count(),passwordCount:await p.locator('#login-password').count()});throw new Error('SOL_CORE_CAPTURE_FAILURE_AFTER_DOM');};
   return p;
  };
  const close=ctx.close.bind(ctx);ctx.close=async(...values)=>{note('context-close-start');await close(...values);note('actual-context-closed');};
  return ctx;
 };
 const close=browser.close.bind(browser);browser.close=async(...values)=>{note('browser-close-start');await close(...values);note('actual-browser-closed');};
 return browser;
};
