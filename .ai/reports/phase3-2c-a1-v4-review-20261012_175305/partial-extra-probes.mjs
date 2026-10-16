// Real private worker, owned local stub/Chrome, fixed v4 failure artifact contract.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import crypto from 'node:crypto';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const modes=['measured-viewport','canonical-missing'];
if(process.argv.slice(2).join(' ')==='--list'){console.log(JSON.stringify({proof:'PLAN_ONLY_NOT_RUN',modes}));process.exit(0);}
const legacyControlCheck=process.argv.slice(2).join(' ')==='--legacy-control-check';
assert.ok(process.argv.length===2||legacyControlCheck,'No alternate controls/paths accepted');
const repo=fs.realpathSync(process.cwd()),ctrl="C:\\Projects\\Active\\\uad50\ub300\uadfc\ubb34\uad00\ub9ac \uc2dc\uc2a4\ud15c\\.ai\\contracts\\phase3-2c-a1-v4";
const sha=v=>crypto.createHash('sha256').update(v).digest('hex').toUpperCase();
if(legacyControlCheck){
 assert.equal(sha(fs.readFileSync(path.join(repo,'scripts/ui-checks/access-history.mjs'))),'EDAD35833644B900A729588504FAB1FE36B447EC09AD3AA8D46C731FB8DFD7FD');
 assert.equal(sha(fs.readFileSync(path.join(repo,'scripts/ui-checks/access-history-shared.mjs'))),'1F76243755359C0BC5F4A3FC8C5EA1144C3E2216946AF80AF321B7756E5A5C9B');
}
const executionDir=legacyControlCheck?path.join(ctrl,'../phase3-2c-a1-v3'):ctrl;
const execution=JSON.parse(fs.readFileSync(path.join(executionDir,'execution.json'),'utf8'));
const folder=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shiftmgmt-sol-a1v4-partial-'));
const requestLog=[],results=[];let active='none';
const stub=http.createServer((req,res)=>{requestLog.push({mode:active,url:req.url,timeMs:Date.now()});res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><input id="login-id"><input id="login-password" type="password">');});
await new Promise((resolve,reject)=>{stub.once('error',reject);stub.listen(18741,'127.0.0.1',resolve);});
let all=true;
try{
 for(const mode of modes){
  active=mode;
  const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shiftmgmt-gemini-32v-'));
  const root=path.join(repo,'artifacts/captures/phase3/access-history-contract-core');fs.mkdirSync(root,{recursive:true});
  const runDir=fs.mkdtempSync(path.join(root,'run-sol-a1v4-partial-'));
  const bootstrapFile=path.join(temp,'data/bootstrap-credentials.json');fs.mkdirSync(path.dirname(bootstrapFile),{recursive:true});fs.writeFileSync(bootstrapFile,'{}');
  const nonce=crypto.randomBytes(32).toString('hex'),context={repository:repo,url:execution.url,runDir,tempDir:temp,bootstrapFile,contractPath:execution.originalContractPath,contractSha256:execution.originalContractSha256,executionPath:path.join(executionDir,'execution.json'),executionSha256:sha(fs.readFileSync(path.join(executionDir,'execution.json')))};
  const contextSha256=sha(JSON.stringify(context)),eventPath=path.join(folder,mode+'.events.jsonl');
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('SOL_')||key.startsWith('SHIFT_')||key.startsWith('SHIFTMGMT_')||['NODE_OPTIONS','NODE_DEBUG'].includes(key))delete env[key];
  env.SOL_A1_PARTIAL_MODE=mode;env.SOL_A1_PARTIAL_EVENTS=eventPath;
  const argv=['--import',pathToFileURL(path.join(import.meta.dirname,'partial-preload.mjs')).href,'scripts/ui-checks/access-history-shared.mjs','--case=contract-core'];
  const startMs=Date.now();
  const child=spawn(process.execPath,argv,{cwd:repo,windowsHide:true,env,stdio:['ignore','pipe','pipe','ipc']});
  let stdout='',stderr='',ack=null,timedOut=false;
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const closed=new Promise(resolve=>{child.once('error',e=>stderr+=e.stack);child.once('close',(code,signal)=>resolve({code,signal,timeMs:Date.now()}));});
  fs.writeFileSync(path.join(runDir,'owner-registration.json'),JSON.stringify({protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonceSha256:sha(nonce),contextSha256,context}));
  child.on('message',msg=>{if(msg.type==='worker-ack'){ack=msg;child.send({type:'owner-run',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce,contextSha256});}});
  let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(async()=>{
   timedOut=true;child.kill();let closeTimer;
   const confirmed=await Promise.race([closed,new Promise(done=>{closeTimer=setTimeout(()=>done({closeUnverified:true}),1500);})]);
   clearTimeout(closeTimer);resolve({...confirmed,timeout:true});
  },30000);});
  child.send({type:'owner-context',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce,contextSha256,context});
  const exit=await Promise.race([closed,timeout]);clearTimeout(timer);
  const events=fs.existsSync(eventPath)?fs.readFileSync(eventPath,'utf8').trim().split(/\r?\n/).map(v=>JSON.parse(v)):[];
  const fallback=mode==='partial-write-failure';
  const partialPath=path.join(runDir,fallback?'core-partial.fallback.json':'core-partial.json');
  let partial=null,accepted=false,reason=null;
  try{
   assert.equal(timedOut,false);assert.equal(exit.code,1);assert.equal(stdout,'');
   assert.equal(ack?.protocol,2);assert.equal(ack?.contextSha256,contextSha256);assert.equal(ack?.nonce,nonce);
   assert.equal(events[0].type,'observer-start');assert.equal(events.at(-1).type,'observer-exit');assert.equal(events.at(-1).code,1);
   assert.ok(events.every((e,i)=>e.pid===child.pid&&e.mode===mode&&e.seq===i+1));
   const dom=events.find(e=>e.type==='actual-dom-acquired');assert.ok(dom);
   if(['capture-failure','partial-write-failure','context-close-failure'].includes(mode)){
    const marker=mode==='context-close-failure'?'SOL_CORE_CONTEXT_CLOSE_FAILURE':'SOL_CORE_CAPTURE_FAILURE_AFTER_DOM';
    const fault=events.find(e=>e.type==='fault-triggered'&&e.marker===marker);assert.ok(fault);assert.ok(dom.seq<fault.seq);
   }
   partial=JSON.parse(fs.readFileSync(partialPath,'utf8'));
   assert.equal(partial.status,'FAIL');assert.equal(partial.case,'contract-core');assert.equal(partial.runId,path.basename(runDir));
   assert.deepEqual(partial.context,context);assert.equal(partial.worker.pid,child.pid);assert.equal(partial.worker.parentPid,process.pid);
   assert.equal(partial.worker.nonceSha256,sha(nonce));
   assert.ok(partial.errors.primary?.stack);assert.equal(partial.errors.primary.code,'A1_WORKER_FAILED');
   const terminal=JSON.parse(stderr);assert.equal(terminal.error.stack,partial.errors.primary.stack);assert.equal(terminal.code,'A1_WORKER_FAILED');
   assert.deepEqual(Object.keys(terminal).sort(),['status','code','phase','case','runId','error'].sort());
   assert.deepEqual(partial.raw.loginInputs,{id:{count:1,visible:true},password:{count:1,visible:true}});
   assert.deepEqual(partial.raw.rawErrors,{console:[],pageerror:[],requestfailed:[],badResponses:[]});
   assert.equal(partial.raw.fixtureRequestCount,0);assert.equal(partial.raw.fixtureLabels.length,8);
   assert.ok(Array.isArray(partial.checks));assert.ok(Array.isArray(partial.errors.cleanup));assert.ok(Array.isArray(partial.errors.evidence));
   assert.equal(partial.raw.resources.length,2);
   for(const resource of partial.raw.resources){
    assert.ok(['browser','context'].includes(resource.kind));
    const expected=mode==='context-close-failure'&&resource.kind==='context'?['created','close-start','close-error']:['created','close-start','closed'];
    assert.deepEqual(resource.events.map(e=>e.state),expected);assert.ok(resource.events.every(e=>typeof e.timeMs==='number'&&Number.isFinite(e.timeMs)&&e.timeMs>0));
    const observed=events.find(e=>e.type==='actual-'+resource.kind+'-created');assert.ok(observed);assert.ok(resource.events[0].timeMs>=observed.timeMs);
   }
   assert.ok(events.some(e=>e.type==='actual-browser-closed'));assert.ok(events.some(e=>e.type==='actual-context-closed'));
   assert.ok(events.some(e=>e.type==='evidence-rename'&&path.resolve(e.path)===partialPath),'Failure evidence must publish atomically');
   if(['capture-failure','partial-write-failure'].includes(mode))assert.ok(partial.errors.primary.stack.includes('SOL_CORE_CAPTURE_FAILURE_AFTER_DOM'));
   if(mode==='context-close-failure'){assert.ok(partial.errors.primary.stack.includes('SOL_CORE_CONTEXT_CLOSE_FAILURE'));assert.ok(partial.errors.cleanup.some(e=>e.stack.includes('SOL_CORE_CONTEXT_CLOSE_FAILURE')));}
   if(fallback){assert.ok(events.some(e=>e.type==='evidence-write-denied'));assert.ok(partial.errors.evidence.some(e=>e.stack.includes('SOL_CORE_PARTIAL_WRITE_FAILURE')));}
   if(mode==='measured-viewport'){assert.deepEqual(partial.raw.viewport,[1439,900]);assert.ok(events.some(e=>e.type==='actual-viewport-read'));}
   if(mode==='measured-origin'){assert.equal(partial.raw.origin,'http://127.0.0.1:18741/sol-observation-drift');assert.ok(events.some(e=>e.type==='actual-url-read'));}
   accepted=true;
  }catch(error){reason=error.stack;all=false;}
  const physical=events[0]?.type==='observer-start'&&events.at(-1)?.type==='observer-exit'&&events.every((e,i)=>e.pid===child.pid&&e.mode===mode&&e.seq===i+1)&&['actual-browser-created','actual-context-created','actual-dom-acquired','actual-browser-closed','actual-context-closed'].every(type=>events.some(e=>e.type===type));
  const expectedLegacyExit=['capture-failure','partial-write-failure'].includes(mode)?1:0;
  const detectedRegression=legacyControlCheck&&!accepted&&physical&&!timedOut&&ack?.protocol===2&&exit.code===expectedLegacyExit;
  const record={mode,legacyControlCheck,detectedRegression,physical,argv:child.spawnargs,cwd:repo,startMs,endMs:Date.now(),pid:child.pid,exit,timedOut,ack,stdout,stderr,eventsPath:eventPath,partialPath,partial,runDir,tempDir:temp,accepted,reason};
  results.push(record);fs.writeFileSync(path.join(folder,mode+'.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({mode,accepted,detectedRegression,exit,reason:reason?.split('\n')[0]}));
  if(exit.closeUnverified||timedOut)break;
  // Retain exact own test fixtures; physical child/browser close does not prove SUT-observed closure.
 }
}finally{stub.closeAllConnections();await new Promise(resolve=>stub.close(resolve));}
const legacyDetected=legacyControlCheck&&results.length===5&&results.every(r=>r.detectedRegression);
const status=legacyControlCheck?(legacyDetected?'EXPECTED_LEGACY_REGRESSIONS_DETECTED':'CONTROL_CHECK_FAILED'):(all&&results.length===5?'PASS':'FAIL');
fs.writeFileSync(path.join(folder,'suite-result.json'),JSON.stringify({status,proof:legacyControlCheck?'CONTROL_COVERAGE_REPLAYS_ONLY_NOT_V4_SUT_ACCEPTANCE':'ACTUAL_SUT_PARTIAL_AND_MEASUREMENT_ONLY_NOT_A1_ACCEPTANCE',results,requestLog,retention:'Retain exact created folders/fixtures; no foreign or historical cleanup'},null,2));
console.log(JSON.stringify({status,artifact:folder,modes:results.length}));process.exitCode=legacyControlCheck?(legacyDetected?0:1):(all&&results.length===5?0:1);
