import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=process.cwd();
const parent=path.join(root,'artifacts/captures/phase3/access-history-foundation-probes');
const artifact=fs.mkdtempSync(path.join(parent,'run-sol-port-'));
const events=path.join(artifact,'temp-events.jsonl');
const preload=path.join(artifact,'temp-observer.mjs');
fs.writeFileSync(preload,`import fs from 'node:fs';import {syncBuiltinESMExports}from'node:module';const original=fs.mkdtempSync.bind(fs);const append=fs.appendFileSync.bind(fs);fs.mkdtempSync=(prefix,...args)=>{const result=original(prefix,...args);append(${JSON.stringify(events)},JSON.stringify({prefix,result,time:Date.now()})+'\\n');return result;};syncBuiltinESMExports();`);
const requests=[];
const server=http.createServer((req,res)=>{requests.push({method:req.method,path:req.url});res.end('SOL_OWNED_PORT_OCCUPANCY_STUB');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(18741,'127.0.0.1',resolve);});
let output='',errors='';let child;
try {
  const {pathToFileURL}=await import('node:url');
  child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'scripts/ui-checks/access-history.mjs','--case=contract-core'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
  const exit=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  const created=fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
  const value={artifact,exit,requests,created,isolatedTempsCreated:created.filter(e=>e.prefix.includes('shiftmgmt-gemini-32v-')).length,stdout:output,stderr:errors,serverClosedByHarness:true};
  fs.writeFileSync(path.join(artifact,'result.json'),JSON.stringify(value,null,2));console.log(JSON.stringify(value));
} finally {
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill();
  await new Promise(resolve=>server.close(resolve));
}
