// Sol-owned local stub/worker; no app server, production DB or source writes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import http from 'node:http';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';import {fileURLToPath} from 'node:url';
const repo=fs.realpathSync(process.cwd()),report=path.dirname(fileURLToPath(import.meta.url));
const ctrl=path.resolve(report,'../../contracts/phase3-2c-a1-v3');
const execution=JSON.parse(fs.readFileSync(path.join(ctrl,'execution.json'),'utf8'));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex').toUpperCase();
const requests=[];
const stub=http.createServer((req,res)=>{requests.push({url:req.url,timeMs:Date.now()});res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><input id="login-id"><input id="login-password" type="password">');});
await new Promise((resolve,reject)=>{stub.once('error',reject);stub.listen(18741,'127.0.0.1',resolve);});
const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shiftmgmt-gemini-32v-'));
const runRoot=path.join(repo,'artifacts/captures/phase3/access-history-contract-core');
const runDir=fs.mkdtempSync(path.join(runRoot,'run-sol-partial-'));
const bootstrap=path.join(temp,'data/bootstrap-credentials.json');fs.mkdirSync(path.dirname(bootstrap),{recursive:true});fs.writeFileSync(bootstrap,'{}');
const nonce=crypto.randomBytes(32).toString('hex');
const context={repository:repo,url:execution.url,runDir,tempDir:temp,bootstrapFile:bootstrap,contractPath:execution.originalContractPath,contractSha256:execution.originalContractSha256,executionPath:path.join(ctrl,'execution.json'),executionSha256:sha(fs.readFileSync(path.join(ctrl,'execution.json')))};
const contextSha256=sha(JSON.stringify(context));
const env={...process.env,SOL_CAPTURE_EVENTS:path.join(report,'capture-failure-events.jsonl')};delete env.NODE_OPTIONS;delete env.NODE_DEBUG;
let child;
try{
 child=spawn(process.execPath,['--import',pathToFileURL(path.join(report,'capture-failure-preload.mjs')).href,'scripts/ui-checks/access-history-shared.mjs','--case=contract-core'],{cwd:repo,windowsHide:true,env,stdio:['ignore','pipe','pipe','ipc']});
 let output='',errors='',ack=null;child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
 fs.writeFileSync(path.join(runDir,'owner-registration.json'),JSON.stringify({protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonceSha256:sha(nonce),contextSha256,context}));
 child.on('message',msg=>{if(msg.type==='worker-ack'){ack=msg;child.send({type:'owner-run',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce,contextSha256});}});
 let timer;const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,timeMs:Date.now()})));
 timer=setTimeout(()=>child.kill(),25000);
 child.send({type:'owner-context',protocol:2,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce,contextSha256,context});
 const exit=await closed;clearTimeout(timer);
 const partialPath=path.join(runDir,'core-partial.json');const partial=fs.existsSync(partialPath)?JSON.parse(fs.readFileSync(partialPath,'utf8')):null;
 const events=fs.existsSync(env.SOL_CAPTURE_EVENTS)?fs.readFileSync(env.SOL_CAPTURE_EVENTS,'utf8').trim().split(/\r?\n/).map(v=>JSON.parse(v)):[];
 const result={proof:'ACTUAL_SUT_CAPTURE_FAILURE_AFTER_REAL_DOM_AND_RESOURCE_CREATION',argv:child.spawnargs,pid:child.pid,exit,validAck:ack?.protocol===2,output,errors,requests,runDir,tempDir:temp,partialPath,partial,actualEvents:events,acquiredEvidenceLost:partial!==null&&!('raw' in partial)&&!('resources' in partial)&&!('checks' in partial)};
 // Retain these exact owned fixtures and receipts. No historical/foreign cleanup.
 fs.writeFileSync(path.join(report,'core-partial-result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({exit,validAck:result.validAck,partialKeys:partial?Object.keys(partial):null,acquiredEvidenceLost:result.acquiredEvidenceLost,actualEvents:events,partialPath}));
}finally{await new Promise(resolve=>stub.close(resolve));}
