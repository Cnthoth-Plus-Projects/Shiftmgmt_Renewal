import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url));
const evidence={synthetic:true,purpose:'test verifier rejection of unexpected browser errors',temps:[],serverPid:null,consoleErrors:[],pageErrors:[]};
const save=()=>fs.writeFileSync(path.join(out,'injected-errors.json'),JSON.stringify(evidence,null,2));
const originalTemp=fs.mkdtempSync.bind(fs);
fs.mkdtempSync=(prefix,...rest)=>{const result=originalTemp(prefix,...rest);if(String(prefix).includes('shiftmgmt-gemini-32-')){evidence.temps.push(result);save();}return result;};
const originalSpawn=cp.spawn.bind(cp);
cp.spawn=(command,args,options)=>{const child=originalSpawn(command,args,options);if(args?.some(x=>String(x).endsWith('dist/server/main/server.js'))){evidence.serverPid=child.pid;save();}return child;};
syncBuiltinESMExports();
const require=createRequire('C:/Projects/Active/ShiftMgmt_V4/package.json');
const {chromium}=require('playwright');
const originalLaunch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await originalLaunch(...args);
 const originalContext=browser.newContext.bind(browser);
 browser.newContext=async(...contextArgs)=>{
  const context=await originalContext(...contextArgs);
  await context.addInitScript(()=>{
   console.error('SOL_VERIFIER_FAULT_CONSOLE');
   setTimeout(()=>{throw new Error('SOL_VERIFIER_FAULT_PAGE');},0);
  });
  context.on('page',page=>{
   page.on('console',message=>{if(message.type()==='error'){evidence.consoleErrors.push(message.text());save();}});
   page.on('pageerror',error=>{evidence.pageErrors.push(error.message);save();});
  });
  return context;
 };
 return browser;
};
process.on('exit',save);
