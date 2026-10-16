// Sol control: real owned Chrome, actual APIs, forced failure after DOM acquisition.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire,syncBuiltinESMExports} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {chromium}=require('playwright');
const mode=process.env.SOL_A1_PARTIAL_MODE,events=process.env.SOL_A1_PARTIAL_EVENTS;
const write=fs.appendFileSync.bind(fs),originalWrite=fs.writeFileSync.bind(fs),originalRename=fs.renameSync.bind(fs);
if(!mode||!events||!path.isAbsolute(events))throw new Error('Partial observer configuration missing');
let seq=0;
const note=(type,data={})=>write(events,JSON.stringify({type,mode,pid:process.pid,seq:++seq,timeMs:Date.now(),...data})+'\n');
note('observer-start');
const realExists=fs.existsSync.bind(fs);
fs.existsSync=function(file){
 if(mode==='canonical-missing'&&path.resolve(String(file))===path.resolve(process.cwd(),'dist/server/shared/domain/access-log.js')){
  note('fault-triggered',{marker:'SOL_CORE_CANONICAL_VIRTUAL_MISSING',path:String(file)});return false;
 }
 return realExists(file);
};
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args);note('actual-browser-created',{browserVersion:browser.version()});
 const newContext=browser.newContext.bind(browser);
 browser.newContext=async(...values)=>{
  const context=await newContext(...values);note('actual-context-created');
  const newPage=context.newPage.bind(context);
  context.newPage=async(...values)=>{
   const page=await newPage(...values),screenshot=page.screenshot.bind(page),viewport=page.viewportSize.bind(page),url=page.url.bind(page);
   page.viewportSize=()=>{const actual=viewport();note('actual-viewport-read',{actual});if(mode==='measured-viewport'){note('null-viewport-delivered',{actual});return null;}return actual;};
   page.url=()=>{const actual=url();note('actual-url-read',{actual});return mode==='measured-origin'?'http://127.0.0.1:18741/sol-observation-drift':actual;};
   page.screenshot=async(...values)=>{
    note('actual-dom-acquired',{actualViewport:viewport(),actualUrl:url(),idCount:await page.locator('#login-id').count(),passwordCount:await page.locator('#login-password').count()});
    if(['capture-failure','partial-write-failure'].includes(mode)){note('fault-triggered',{marker:'SOL_CORE_CAPTURE_FAILURE_AFTER_DOM'});throw new Error('SOL_CORE_CAPTURE_FAILURE_AFTER_DOM');}
    return screenshot(...values);
   };
   return page;
  };
  const close=context.close.bind(context);context.close=async(...values)=>{
   note('context-close-start');await close(...values);note('actual-context-closed');
   if(mode==='context-close-failure'){note('fault-triggered',{marker:'SOL_CORE_CONTEXT_CLOSE_FAILURE'});throw new Error('SOL_CORE_CONTEXT_CLOSE_FAILURE');}
  };
  return context;
 };
 const close=browser.close.bind(browser);browser.close=async(...values)=>{note('browser-close-start');await close(...values);note('actual-browser-closed');};
 return browser;
};
const deny=file=>mode==='partial-write-failure'&&path.basename(String(file))==='core-partial.json';
fs.writeFileSync=function(file,...args){if(deny(file)){note('evidence-write-denied',{path:String(file)});throw new Error('SOL_CORE_PARTIAL_WRITE_FAILURE');}return originalWrite(file,...args);};
fs.renameSync=function(from,to,...args){if(deny(to)){note('evidence-write-denied',{path:String(to)});throw new Error('SOL_CORE_PARTIAL_WRITE_FAILURE');}note('evidence-rename',{path:String(to)});return originalRename(from,to,...args);};
const writePromise=fs.promises.writeFile.bind(fs.promises),renamePromise=fs.promises.rename.bind(fs.promises);
fs.promises.writeFile=async function(file,...args){if(deny(file)){note('evidence-write-denied',{path:String(file)});throw new Error('SOL_CORE_PARTIAL_WRITE_FAILURE');}return writePromise(file,...args);};
fs.promises.rename=async function(from,to,...args){if(deny(to)){note('evidence-write-denied',{path:String(to)});throw new Error('SOL_CORE_PARTIAL_WRITE_FAILURE');}note('evidence-rename',{path:String(to)});return renamePromise(from,to,...args);};
syncBuiltinESMExports();
process.once('exit',code=>note('observer-exit',{code}));
