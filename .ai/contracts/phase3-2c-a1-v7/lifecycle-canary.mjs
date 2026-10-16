// Sol observer/validator canary: real child processes and real log streams.
// This fixture is not the application or evidence of Gemini implementation.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import net from 'node:net';import {spawn} from 'node:child_process';
const runDir=process.argv[2];if(!runDir||!fs.existsSync(runDir))throw new Error('Fresh canary root required');
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-gemini-32v-'));
const records={};let primary=null;const extra=[];
const errorInfo=e=>({name:e.name,message:e.message,stack:e.stack});
const event=(r,k,s=null,code=null,signal=null,error=null)=>r.callbackEvents.push({event:k,timeMs:Date.now(),stream:s,pid:s===null?r.pid:null,code,signal,error:error?errorInfo(error):null});
function create(role){
 const name=role==='gate'?'adjudicator':role;
 const r={pid:null,createdAtMs:null,exitAtMs:null,closeAtMs:null,exitSeen:false,closeSeen:false,exitCode:null,exitSignal:null,closeCode:null,closeSignal:null,aliveAfterClose:false,logsSettled:{stdout:false,stderr:false},logFinishSeen:{stdout:false,stderr:false},logCloseSeen:{stdout:false,stderr:false},logFinishAtMs:{stdout:null,stderr:null},logCloseAtMs:{stdout:null,stderr:null},callbackEvents:[]};
 const streams={};
 const err=(e,kind,s=null)=>{event(r,kind,s,null,null,e);const entry={...errorInfo(e),code:kind==='log-error'?'A1_LOG_WRITE_FAILED':role==='server'?'A1_SERVER_SPAWN_FAILURE':role==='worker'?'A1_WORKER_SPAWN_FAILURE':'A1_GATE_SPAWN_FAILURE',phase:'canary',timeMs:Date.now()};if(!primary)primary=entry;else extra.push(entry);};
 for(const s of ['stdout','stderr']){
  const stream=streams[s]=fs.createWriteStream(path.join(runDir,name+'-'+s+'.log'));
  stream.on('error',e=>err(e,'log-error',s));
  for(const k of ['finish','close'])stream.once(k,()=>{event(r,'log-'+k,s);const suffix=k[0].toUpperCase()+k.slice(1);r['log'+suffix+'Seen'][s]=true;r['log'+suffix+'AtMs'][s]=r.callbackEvents.at(-1).timeMs;});
 }
 const script=role==='gate'?"process.stdout.write(JSON.stringify({status:'PASS',result:{candidateSha256:'A'.repeat(64)}})+'\\n')":"setTimeout(()=>process.exit(0),15)";
 const marker=role==='server'?path.join(runDir,'dist/server/main/server.js'):role==='gate'?'SOL_A1_GATE_CANARY':'SOL_A1_WORKER_CANARY';
 const child=spawn(process.execPath,['-e',script,'--',marker],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('SOL_')&&k!=='NODE_OPTIONS'))});
 r.pid=child.pid;
 child.on('error',e=>err(e,'error'));
 for(const s of ['stdout','stderr'])child[s].on('data',d=>streams[s].write(d));
 const started=new Promise(resolve=>child.once('spawn',()=>{event(r,'spawn');r.createdAtMs=r.callbackEvents.at(-1).timeMs;resolve();}));
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>{event(r,'close',null,code,signal);r.closeSeen=true;r.closeAtMs=r.callbackEvents.at(-1).timeMs;r.closeCode=code;r.closeSignal=signal;resolve();}));
 child.once('exit',(code,signal)=>{event(r,'exit',null,code,signal);r.exitSeen=true;r.exitAtMs=r.callbackEvents.at(-1).timeMs;r.exitCode=code;r.exitSignal=signal;});
 const item=records[role]={r,streams,child,started,closed};return item;
}
async function settle(item){await item.closed;for(const s of ['stdout','stderr']){const stream=item.streams[s];if(!item.r.logCloseSeen[s]){const closed=new Promise(res=>stream.once('close',res));stream.end();await closed;}item.r.logsSettled[s]=true;}}
const barrier=()=>{if(primary)throw primary;};
const atomic=(name,value,guard)=>{const p=path.join(runDir,name);fs.writeFileSync(p+'.tmp',JSON.stringify(value));guard?.();fs.renameSync(p+'.tmp',p);};
let removed=false;
try{
 const server=create('server'),worker=create('worker');await Promise.all([server.started,worker.started]);await settle(worker);await settle(server);
 for(const item of [worker,server])item.cache=structuredClone(item.r);
 for(const name of ['worker','server'])for(const s of ['stdout','stderr'])fs.readFileSync(path.join(runDir,name+'-'+s+'.log'));
 await new Promise((res,rej)=>net.createServer().once('error',rej).once('listening',function(){this.close(res);}).listen(0,'127.0.0.1'));
 barrier();fs.rmSync(tempDir,{recursive:true});removed=true;barrier();
 atomic('owner-candidate.json',{status:'CANARY_CANDIDATE'},barrier);
 const gate=create('gate');await gate.started;await settle(gate);gate.cache=structuredClone(gate.r);barrier();
 atomic('owner-final.json',{status:'CANARY_PASS'},barrier);
 throw new Error('Expected lifecycle canary fault not delivered');
}catch(error){
 if(!primary)primary={...errorInfo(error),code:'CANARY_CONTROL_ERROR',phase:'canary',timeMs:Date.now()};
 for(const item of Object.values(records)){if(!item.r.closeSeen)item.child.kill();await settle(item);}
 const failure={status:'FAIL',case:'contract-core',schema:'SOL_CONTROL_CANARY_NOT_SUT',server:records.server?.r||null,worker:records.worker?.r||null,adjudicator:records.gate?.r||null,errors:{primary,unexpected:extra,cleanup:[],evidence:[]},cleanup:{tempRemoved:removed},raw:null,checks:[],acquisition:null,workerPartialPath:null};
 atomic('owner-failure.json',failure);
 process.stderr.write(JSON.stringify({status:'FAIL',code:primary.code,error:errorInfo(primary)})+'\n');
 process.exit(1);
}
