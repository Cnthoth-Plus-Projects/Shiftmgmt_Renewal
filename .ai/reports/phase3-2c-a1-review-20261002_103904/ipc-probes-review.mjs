// Actual SUT worker boundary tests, using only a Sol-owned stub and owned fixtures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const repo=fs.realpathSync(process.cwd());
const folder="C:\\Projects\\Active\\\uad50\ub300\uadfc\ubb34\uad00\ub9ac \uc2dc\uc2a4\ud15c\\.ai\\contracts\\phase3-2c-a1-v2";
const execution=JSON.parse(fs.readFileSync(path.join(folder,'execution.json'),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const safeEnv={};for(const key of ['SystemRoot','WINDIR','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','ProgramFiles','PROGRAMFILES','ProgramFiles(x86)','PATH','Path'])if(process.env[key])safeEnv[key]=process.env[key];
safeEnv.NODE_DEBUG='child_process';
const chromeAttempts=text=>(text.match(/file:\s*['"][^'"\r\n]*chrome\.exe['"]/gi)||[]).length;
async function confirmAfterTimeout(closed){let timer;try{return await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve({closeUnverified:true}),1500);})]);}finally{clearTimeout(timer);}}
async function closedWithin(child,limit){let timer;const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,timeMs:Date.now()})));const timeout=new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve({timeout:true});},limit);});let result=await Promise.race([closed,timeout]);clearTimeout(timer);if(result.timeout)result={...result,confirmedClose:await confirmAfterTimeout(closed)};return result;}
const cases=['wrong-owner-pid','wrong-worker-pid','wrong-case','wrong-nonce','wrong-url','sibling-run','wrong-temp-root','wrong-bootstrap','wrong-contract-path','wrong-contract-digest','wrong-execution-path','wrong-execution-digest','no-run-approval','wrong-run-nonce'];
if(process.argv.slice(2).join(' ')==='--list'){console.log(JSON.stringify({proof:'PLAN_ONLY_NOT_RUN',cases}));process.exit(0);}
const parent=path.join(repo,'artifacts/captures/phase3/access-history-foundation-probes');fs.mkdirSync(parent,{recursive:true});
const artifact=fs.mkdtempSync(path.join(parent,'run-sol-a1-ipc-'));
const requests=[];let active='port-probe';
const stub=http.createServer((request,response)=>{requests.push({case:active,method:request.method,path:request.url,timeMs:Date.now()});response.writeHead(200,{'Content-Type':'text/html'});response.end('<input id="login-id"><input id="login-password" type="password">');});
await new Promise((resolve,reject)=>{stub.once('error',reject);stub.listen(18741,'127.0.0.1',resolve);});
const results=[];
try{
 // Validate the observation channel with real owned offline Chrome first.
 const diagnosticCode="import{createRequire}from'node:module';import{pathToFileURL}from'node:url';import path from'node:path';const require=createRequire(process.argv[1]);const{chromium}=require('playwright');const{findChrome}=await import(pathToFileURL(path.join(path.dirname(process.argv[1]),'scripts/lib/find-chrome.mjs')).href);let browser;try{browser=await chromium.launch({executablePath:findChrome().path,headless:true});}finally{if(browser)await browser.close();}";
 const diagnostic=spawn(process.execPath,['--input-type=module','-e',diagnosticCode,path.join(repo,'package.json')],{cwd:repo,windowsHide:true,env:safeEnv,stdio:['ignore','pipe','pipe']});let diagnosticErrors='';diagnostic.stderr.on('data',d=>diagnosticErrors+=d);diagnostic.stdout.resume();const diagnosticExit=await closedWithin(diagnostic,20000);
 const diagnosticReceipt={exit:diagnosticExit,chromeAttempts:chromeAttempts(diagnosticErrors),stderr:diagnosticErrors,proof:'REAL_OWNED_OFFLINE_CHROME_DIAGNOSTIC_CHANNEL'};fs.writeFileSync(path.join(artifact,'chrome-diagnostic.json'),JSON.stringify(diagnosticReceipt,null,2));
 if(diagnosticExit.timeout||diagnosticExit.code!==0||diagnosticReceipt.chromeAttempts<1)throw new Error('Chrome spawn observation unavailable; IPC acceptance blocked');
 // Occupied port: the product owner must exit before temp/spawn/network side effects.
 const eventPath=path.join(artifact,'port-preflight.events.jsonl');
 const portChild=spawn(process.execPath,['--import',pathToFileURL("C:\\Projects\\Active\\\uad50\ub300\uadfc\ubb34\uad00\ub9ac \uc2dc\uc2a4\ud15c\\.ai\\reports\\phase3-2c-a1-review-20261002_103904\\runtime-preload-review.mjs").href,'scripts/ui-checks/access-history.mjs','--case=contract-core'],{cwd:repo,windowsHide:true,env:{...safeEnv,SOL_A1_PROBE:'port-preflight',SOL_A1_PROBE_EVENTS:eventPath},stdio:['ignore','pipe','pipe']});
 let portOutput='',portErrors='';portChild.stdout.on('data',d=>portOutput+=d);portChild.stderr.on('data',d=>portErrors+=d);
 const portExit=await closedWithin(portChild,12000);
 const events=fs.existsSync(eventPath)?fs.readFileSync(eventPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const forbidden=events.filter(e=>['spawn','directory-created','directory-write','file-write','http-attempt'].includes(e.type));
 results.push({case:'port-preflight',argv:portChild.spawnargs,pid:portChild.pid,exit:portExit,stdout:portOutput,stderr:portErrors,events,chromeAttempts:chromeAttempts(portErrors),accepted:!portExit.timeout&&portExit.code!==0&&forbidden.length===0&&requests.length===0&&chromeAttempts(portErrors)===0});
 if(portExit.timeout)throw new Error('Port preflight timed out; child cleanup unverified, STOP');
 for(const name of cases){
  active=name;const start=Date.now(),requestStart=requests.length;
  const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shiftmgmt-gemini-32v-'));
  const runRoot=path.join(repo,'artifacts/captures/phase3/access-history-contract-core');fs.mkdirSync(runRoot,{recursive:true});
  const runDir=fs.mkdtempSync(path.join(runRoot,'run-sol-ipc-'));
  const bootstrap=path.join(temp,'data/bootstrap-credentials.json');fs.mkdirSync(path.dirname(bootstrap),{recursive:true});fs.writeFileSync(bootstrap,'{}');
  const nonce=crypto.randomBytes(32).toString('hex');
  const context={repository:repo,url:execution.url,runDir,tempDir:temp,bootstrapFile:bootstrap,
   contractPath:execution.originalContractPath,contractSha256:execution.originalContractSha256,
   executionPath:path.join(folder,'execution.json'),executionSha256:sha(fs.readFileSync(path.join(folder,'execution.json')))};
  let sibling=null;
  if(name==='wrong-url')context.url='http://127.0.0.1:18742/';
  if(name==='sibling-run'){sibling=fs.mkdtempSync(path.join(repo,'artifacts/captures/phase3/access-history-contract-core-sol-sibling-'));context.runDir=sibling;}
  if(name==='wrong-temp-root'){context.tempDir=path.join(artifact,'shiftmgmt-gemini-32v-outside-temp');context.bootstrapFile=path.join(context.tempDir,'data/bootstrap-credentials.json');fs.mkdirSync(path.dirname(context.bootstrapFile),{recursive:true});fs.writeFileSync(context.bootstrapFile,'{}');}
  if(name==='wrong-bootstrap'){context.bootstrapFile=path.join(artifact,'foreign-bootstrap.json');fs.writeFileSync(context.bootstrapFile,'{}');}
  if(name==='wrong-contract-path'){context.contractPath=path.join(artifact,'same-bytes-other-contract.json');fs.copyFileSync(execution.originalContractPath,context.contractPath);}
  if(name==='wrong-contract-digest')context.contractSha256='0'.repeat(64);
  if(name==='wrong-execution-path'){context.executionPath=path.join(artifact,'same-bytes-other-execution.json');fs.copyFileSync(path.join(folder,'execution.json'),context.executionPath);}
  if(name==='wrong-execution-digest')context.executionSha256='0'.repeat(64);
  const contextSha256=sha(JSON.stringify(context));
  const child=spawn(process.execPath,['scripts/ui-checks/access-history-shared.mjs','--case=contract-core'],{cwd:repo,windowsHide:true,env:safeEnv,stdio:['ignore','pipe','pipe','ipc']});
  let stdout='',stderr='',ack=null;child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const marker={protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonceSha256:sha(nonce),contextSha256,context};
  // Consistent marker/context mutations test fixed invariants, not just digest mismatch.
  fs.writeFileSync(path.join(context.runDir,'owner-registration.json'),JSON.stringify(marker));
  const initialFiles=fs.readdirSync(context.runDir).sort();
  child.on('message',message=>{
   if(message.type==='worker-ack'){
    ack={protocol:message.protocol,case:message.case,ownerPid:message.ownerPid,workerPid:message.workerPid,contextSha256:message.contextSha256,nonceMatches:message.nonce===nonce,timeMs:Date.now()};
    if(name==='wrong-run-nonce')child.send({type:'owner-run',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce:'0'.repeat(64),contextSha256});
   }
  });
  const packet={type:'owner-context',protocol:2,case:name==='wrong-case'?'regression-shell':'contract-core',ownerPid:name==='wrong-owner-pid'?process.pid+1:process.pid,
   workerPid:name==='wrong-worker-pid'?child.pid+1:child.pid,nonce:name==='wrong-nonce'?'0'.repeat(64):nonce,contextSha256,context};
  let timer;const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,timeMs:Date.now()})));
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve({timeout:true});},9000);});
  child.send(packet);let exit=await Promise.race([closed,timeout]);clearTimeout(timer);if(exit.timeout){
   exit={...exit,confirmedClose:await confirmAfterTimeout(closed)};
   results.push({case:name,argv:child.spawnargs,pid:child.pid,startMs:start,endMs:Date.now(),exit,ack,stdout,stderr,accepted:false,ownedTemp:temp,runDir:context.runDir});
   throw new Error('Worker supervisor timeout; child cleanup unverified, retained own fixtures, STOP');
  }
  const finalFiles=fs.readdirSync(context.runDir).sort();
  const requestsForCase=requests.slice(requestStart);
  const validAck=ack!==null&&ack.protocol===2&&ack.case==='contract-core'&&ack.ownerPid===process.pid&&ack.workerPid===child.pid&&ack.nonceMatches&&ack.contextSha256===contextSha256;
  const needsAck=['no-run-approval','wrong-run-nonce'].includes(name);
  const runWaitMs=needsAck&&ack?exit.timeMs-ack.timeMs:null;
  const deadlineOk=name!=='no-run-approval'||(runWaitMs!==null&&runWaitMs<=execution.deadlinesMs.runAuthorization+1000);
  const accepted=!exit.timeout&&exit.code!==0&&deadlineOk&&requestsForCase.length===0&&chromeAttempts(stderr)===0&&JSON.stringify(initialFiles)===JSON.stringify(finalFiles)&&(needsAck?validAck:ack===null);
  results.push({case:name,argv:child.spawnargs,pid:child.pid,startMs:start,endMs:Date.now(),exit,ack,runWaitMs,deadlineOk,chromeAttempts:chromeAttempts(stderr),requests:requestsForCase,initialFiles,finalFiles,stdout,stderr,accepted,ownedTemp:temp,runDir:context.runDir});
  // The exact spawned handle closed; all pre-RUN cases must create no browser.
  // Preserve any violation temp for independent inspection rather than assume quiescence.
  if(accepted&&path.dirname(fs.realpathSync(temp))===fs.realpathSync(os.tmpdir()))fs.rmSync(temp,{recursive:true});
 }
 const all=results.every(r=>r.accepted);fs.writeFileSync(path.join(artifact,'suite-result.json'),JSON.stringify({status:all?'PASS':'FAIL',proof:'ACTUAL_SUT_IPC_PORT_SUBSET',results,requests},null,2));
 console.log(JSON.stringify({status:all?'PASS':'FAIL',artifact,results}));process.exitCode=all?0:1;
}catch(error){
 fs.writeFileSync(path.join(artifact,'suite-result.json'),JSON.stringify({status:'UNVERIFIED_STOP',error:{message:error.message,stack:error.stack},results,requests,retention:'retain exact owned fixtures; child cleanup not assumed'},null,2));
 console.error(JSON.stringify({status:'UNVERIFIED_STOP',artifact,error:error.message}));process.exitCode=1;
}finally{stub.closeAllConnections();await new Promise(resolve=>stub.close(resolve));}
