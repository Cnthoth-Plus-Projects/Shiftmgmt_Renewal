// Sol external SDK observation/fault control; no product file changes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const cfg=new URL(import.meta.url).searchParams;
const mode=cfg.get('mode'), trace=cfg.get('trace');
if(!mode||!trace||!path.isAbsolute(trace))throw new Error('Invalid owned review preload context');
const log=(kind,value={})=>fs.appendFileSync(trace,JSON.stringify({kind,pid:process.pid,timeMs:Date.now(),...value})+'\n');
const {chromium}=createRequire('C:/Projects/Active/ShiftMgmt_V4/package.json')('playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=async function(options){
 const browser=await launch(options);log('actual-browser-acquired');
 const browserClose=browser.close.bind(browser);
 browser.close=async function(...args){log('browser-close-attempt');await browserClose(...args);log('actual-browser-close-return',{isConnected:browser.isConnected()});
  if(mode==='both-close-throw'){log('fault-delivered',{marker:'SOL_A2_BROWSER_CLOSE_AFTER_ACTUAL'});throw new Error('SOL_A2_BROWSER_CLOSE_AFTER_ACTUAL');}}
 const newContext=browser.newContext.bind(browser);
 browser.newContext=async function(options={}){
  const requested=options.viewport;
  const effective=mode==='viewport901'?{...options,viewport:{width:1440,height:901}}:options;
  const context=await newContext(effective);log('actual-context-acquired',{requestedViewport:requested,effectiveViewport:effective.viewport});
  const newPage=context.newPage.bind(context);
  context.newPage=async function(...args){const page=await newPage(...args);log('actual-page-viewport',{viewport:page.viewportSize()});return page;}
  const contextClose=context.close.bind(context);
  context.close=async function(...args){log('context-close-attempt');await contextClose(...args);log('actual-context-close-return');
   if(mode==='context-close-throw'||mode==='both-close-throw'){log('fault-delivered',{marker:'SOL_A2_CONTEXT_CLOSE_AFTER_ACTUAL'});throw new Error('SOL_A2_CONTEXT_CLOSE_AFTER_ACTUAL');}}
  return context;
 }
 return browser;
}
log('review-preload-start',{mode});
