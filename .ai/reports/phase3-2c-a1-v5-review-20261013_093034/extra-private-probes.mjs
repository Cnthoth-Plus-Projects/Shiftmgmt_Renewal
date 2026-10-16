// Real private v5 worker and owned Chrome/stub; no product/control mutation.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const repo=fs.realpathSync(process.cwd()),report=import.meta.dirname,ctrl=path.resolve(report,'../../contracts/phase3-2c-a1-v5');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
assert.equal(sha(fs.readFileSync(path.join(repo,'scripts/ui-checks/access-history-shared.mjs'))),'9813475D58FB5474C9533F532A2E171AB0DFB7977877EB783B3088C0A475069F');
const execution=JSON.parse(fs.readFileSync(path.join(ctrl,'execution.json'),'utf8'));
const folder=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shiftmgmt-sol-a1v5-extra-private-'));
const stub=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><input id="login-id"><input id="login-password" type="password">');});
await new Promise((resolve,reject)=>{stub.once('error',reject);stub.listen(18741,'127.0.0.1',resolve);});
const results=[];
try{
 for(const mode of ['repository-realpath-failure','request-then-viewport-null','canonical-import-failure']){
  const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shiftmgmt-gemini-32v-'));
  const root=path.join(repo,'artifacts/captures/phase3/access-history-contract-core');fs.mkdirSync(root,{recursive:true});
  const runDir=fs.mkdtempSync(path.join(root,'run-sol-a1v5-extra-'));
  const bootstrapFile=path.join(temp,'data/bootstrap-credentials.json');fs.mkdirSync(path.dirname(bootstrapFile),{recursive:true});fs.writeFileSync(bootstrapFile,'{}');
  const context={repository:repo,url:execution.url,runDir,tempDir:temp,bootstrapFile,contractPath:execution.originalContractPath,contractSha256:execution.originalContractSha256,executionPath:path.join(ctrl,'execution.json'),executionSha256:sha(fs.readFileSync(path.join(ctrl,'execution.json')))};
  const nonce=crypto.randomBytes(32).toString('hex'),contextSha256=sha(JSON.stringify(context)),eventsPath=path.join(folder,mode+'.events.jsonl');
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('SOL_')||key.startsWith('SHIFT_')||key.startsWith('SHIFTMGMT_')||['NODE_OPTIONS','NODE_DEBUG'].includes(key))delete env[key];
  env.SOL_A1_PARTIAL_MODE=mode;env.SOL_A1_PARTIAL_EVENTS=eventsPath;
  const argv=['--import',pathToFileURL(path.join(report,'partial-preload.mjs')).href,'scripts/ui-checks/access-history-shared.mjs','--case=contract-core'];
  const startMs=Date.now(),child=spawn(process.execPath,argv,{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  let stdout='',stderr='',ack=null,timedOut=false;child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const close=new Promise(resolve=>{child.once('error',e=>stderr+=e.stack);child.once('close',(code,signal)=>resolve({code,signal,timeMs:Date.now()}));});
  fs.writeFileSync(path.join(runDir,'owner-registration.json'),JSON.stringify({protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonceSha256:sha(nonce),contextSha256,context}));
  child.on('message',msg=>{if(msg?.type==='worker-ack'){ack=msg;child.send({type:'owner-run',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce,contextSha256});}});
  child.send({type:'owner-context',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce,contextSha256,context});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},30000),exit=await close;clearTimeout(timer);
  const rows=fs.readFileSync(eventsPath,'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const partialPaths=['core-partial.json','core-partial.fallback.json'].map(n=>path.join(runDir,n));
  const partialPath=partialPaths.find(p=>fs.existsSync(p)),partial=partialPath?JSON.parse(fs.readFileSync(partialPath,'utf8')):null;
  assert.equal(timedOut,false);assert.equal(exit.code,1);assert.equal(stdout,'');assert.equal(ack?.protocol,2);assert.equal(ack.contextSha256,contextSha256);assert.equal(ack.nonce,nonce);
  assert.equal(rows[0].type,'observer-start');assert.equal(rows.at(-1).type,'observer-exit');assert.ok(rows.every((r,i)=>r.pid===child.pid&&r.mode===mode&&r.seq===i+1));assert.ok(rows.some(r=>r.type==='actual-owner-run-received'));assert.ok(rows.some(r=>r.type==='fault-triggered'));
  let finding;
  if(mode==='repository-realpath-failure'){
   assert.equal(partial,null);assert.ok(!rows.some(r=>r.type==='actual-browser-created'));assert.ok(stderr.includes('SOL_CORE_REPOSITORY_REALPATH_FAILURE_AFTER_RUN'));
   finding='VALID_ACK_RUN_REPOSITORY_PREPARATION_FAILURE_WITHOUT_PARTIAL';
  }else if(mode==='request-then-viewport-null'){
   assert.ok(partial);assert.equal(partial.raw.viewport,null);assert.equal(partial.raw.fixtureRequestCount,0);assert.equal(partial.checks.find(c=>c.id==='CORE-05').actual,0);
   const requests=rows.filter(r=>r.type==='actual-fixture-handler-invoked');assert.equal(requests.length,1);assert.ok(rows.some(r=>r.type==='actual-fixture-fetch-completed'&&r.status===200&&r.rows===8));
   assert.ok(rows.some(r=>r.type==='actual-browser-closed'));assert.ok(rows.some(r=>r.type==='actual-context-closed'));finding='ONE_ACTUAL_FIXTURE_REQUEST_PUBLISHED_AS_ZERO_IN_FAILURE_RAW_AND_CHECK';
  }else{
   assert.ok(partial);assert.equal(partial.raw.canonicalLabels,null);assert.ok(rows.some(r=>r.type==='actual-canonical-bytes-acquired'&&r.bytes>0));assert.ok(stderr.includes('SOL_CORE_CANONICAL_IMPORT_FAILURE_AFTER_BYTES'));assert.ok(!rows.some(r=>r.type==='actual-browser-created'));
   finding='ACQUIRED_CANONICAL_BYTES_METADATA_LOST_AFTER_IMPORT_FAILURE';
  }
  const record={mode,finding,argv:child.spawnargs,cwd:repo,pid:child.pid,startMs,endMs:Date.now(),exit,timedOut,ack,stdout,stderr,eventsPath,partialPath:partialPath??null,partial,runDir,tempDir:temp};results.push(record);fs.writeFileSync(path.join(folder,mode+'.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({mode,finding,rc:exit.code,artifact:folder}));
 }
}finally{stub.closeAllConnections();await new Promise(resolve=>stub.close(resolve));}
fs.writeFileSync(path.join(folder,'suite-result.json'),JSON.stringify({status:'ACTUAL_V5_FAILURES_REPRODUCED',proof:'ACTUAL_PRIVATE_WORKER_WITH_HEALTHY_FAULT_DELIVERY_NOT_ACCEPTANCE',results,retention:'Retain exact created artifacts and fixtures; no foreign/historical cleanup'},null,2));
console.log(JSON.stringify({status:'ACTUAL_V5_FAILURES_REPRODUCED',artifact:folder,count:results.length}));
