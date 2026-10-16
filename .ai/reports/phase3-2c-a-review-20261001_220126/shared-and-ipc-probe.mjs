// Sol validation only, own ignored artifacts, no product source edits.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const {AssertionCollector,loadContract}=await import(pathToFileURL(path.join(root,'scripts/ui-checks/access-history-shared.mjs')).href);
const contract=loadContract();
const artifactParent=path.join(root,'artifacts/captures/phase3/access-history-foundation-probes');
const artifact=fs.mkdtempSync(path.join(artifactParent,'run-sol-shared-ipc-'));
const probes=[];
const probe=(id,call)=>{try{const value=call();probes.push({id,accepted:true,value});}catch(error){probes.push({id,accepted:false,message:error.message});}};
probe('caller-overrides-fixed-expectation',()=>{const c=new AssertionCollector('contract-core',contract);c.expectEqual('CORE-01','/viewport',[777,555],[777,555]);return c.toJSON();});
probe('unknown-case-empty-coverage',()=>{const c=new AssertionCollector('sol-unregistered-case',contract);c.validateRequiredCoverage();return c.toJSON();});
probe('nested-nonfinite',()=>{const c=new AssertionCollector('contract-core',contract);c.expectEqual('CORE-01','/viewport',{x:NaN},{x:NaN});return {recordedNaN:Number.isNaN(c.toJSON()[0].actual.x)};});
probe('mutable-observation-snapshot',()=>{const c=new AssertionCollector('contract-core',contract);const value={x:1};c.expectEqual('CORE-01','/viewport',value,{x:1});value.x=999;return c.toJSON()[0].actual;});
probe('numeric-tolerance-2',()=>{const c=new AssertionCollector('contract-core',contract);c.expectNear('CORE-01','/viewport',133.5,132,2);});
const requests=[];
const server=http.createServer((req,res)=>{
  requests.push({method:req.method,path:req.url,time:Date.now()});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>Sol 소유 IPC 검문 시험</title><body><input id="login-id"><input id="login-password" type="password"></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const stubUrl=`http://127.0.0.1:${server.address().port}/`;
const wrongTemp=path.join(artifact,'shiftmgmt-gemini-32v-probe');fs.mkdirSync(wrongTemp);
const wrongRun=fs.mkdtempSync(path.join(root,'artifacts/captures/phase3/access-history-contract-core-sol-sibling-'));
let child;
let output='';let errors='';let ack=null;let exited=null;
try {
  child=spawn(process.execPath,['scripts/ui-checks/access-history-shared.mjs','--case=contract-core'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
  child.on('message',message=>{if(message.type==='worker-ack')ack={case:message.case,pid:message.pid,parentPid:message.parentPid,nonceMatches:message.nonce==='a'.repeat(64),time:Date.now()};});
  const context={repository:root,url:stubUrl,runDir:wrongRun,tempDir:wrongTemp,bootstrapFile:path.join(artifact,'missing-foreign-bootstrap.json'),contractPath:path.join(artifact,'missing-foreign-contract.json'),contractSha256:'014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE'};
  child.send({type:'owner-context',protocol:1,case:'contract-core',ownerPid:process.pid,workerPid:child.pid,nonce:'a'.repeat(64),context});
  let timer;
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,time:Date.now()})));
  const limit=new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve({timeout:true});},20000);});
  exited=await Promise.race([closed,limit]);clearTimeout(timer);
  if(exited.timeout)exited={...exited,confirmedClose:await closed};
  const result={artifact,probes,ipc:{stubUrl,workerPid:child.pid,context,ack,secondExecutionInstructionSent:false,requests,exit:exited,stdout:output,stderr:errors,wrongRunFiles:fs.readdirSync(wrongRun),guardViolation:requests.length>0,retention:'retain own ignored stub artifacts; no secrets or source writes'}};
  fs.writeFileSync(path.join(artifact,'probe-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill();
  await new Promise(resolve=>server.close(resolve));
}
