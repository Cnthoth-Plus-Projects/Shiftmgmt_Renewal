// Sol-only fault instrumentation. Never forwarded by the product owner to children.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
const mode=process.env.SOL_A1_PROBE;
const eventPath=process.env.SOL_A1_PROBE_EVENTS;
const session=process.env.SOL_A1_PROBE_SESSION;
const realClock=Date.now.bind(Date);let actualWorkerCloseMs=null,actualServerCloseMs=null,actualGateCloseMs=null,actualWorkerPid=null,actualGatePid=null,cloneFaultDelivered=false;
if(!mode||!eventPath||!session||!/^[0-9a-f]{32}$/.test(session))throw new Error('Sol probe mode/events/session missing');
const original={spawn:cp.spawn,write:fs.writeFileSync,rename:fs.renameSync,read:fs.readFileSync,mkdtemp:fs.mkdtempSync,stream:fs.createWriteStream,open:fs.openSync,writeFd:fs.writeSync,closeFd:fs.closeSync,remove:fs.rmSync};
const digest=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
// A captured descriptor writer bypasses every high-level fs monkeypatch.
// wx refuses old event files; the supervisor owns this one path and nonce.
const eventFd=original.open(eventPath,'wx');
let eventSeq=0,previousEventSha='0'.repeat(64);
const note=(type,data={})=>{
 const payload={...data,type,schema:3,mode,session,timeMs:realClock(),pid:process.pid,seq:++eventSeq,previousEventSha};
 const canonical=JSON.stringify(payload),eventSha256=digest(Buffer.from(canonical));
 const output=Buffer.from(JSON.stringify({...payload,canonical,eventSha256})+'\n');
 let position=0;while(position<output.length)position+=original.writeFd(eventFd,output,position,output.length-position);
 previousEventSha=eventSha256;
};
note('observer-initializing');
let triggered=false;
const createdRuns=new Set();
const trigger=data=>{triggered=true;note('fault-triggered',data);};
const realFetch=globalThis.fetch;
globalThis.fetch=function(input,options){note('http-attempt',{url:String(input),method:options?.method??'GET'});return realFetch(input,options);};
const mkdir=fs.mkdirSync;
fs.mkdirSync=function(target,...args){note('directory-write',{path:String(target)});return mkdir(target,...args);};
const mkdirPromise=fs.promises.mkdir.bind(fs.promises);
fs.promises.mkdir=async function(target,...args){note('directory-write',{path:String(target)});return mkdirPromise(target,...args);};
function ownedCandidate(candidatePath){
 const p=path.resolve(candidatePath);
 const root=path.resolve(process.cwd(),'artifacts/captures/phase3');
 const relative=path.relative(root,p);
 if(relative.startsWith('..')||path.isAbsolute(relative)||path.basename(p)!=='owner-candidate.json')throw new Error('Probe target outside own product artifact root');
 if(!createdRuns.has(path.dirname(p)))throw new Error('Probe refuses historical/noncreated run');
 const value=JSON.parse(original.read(p,'utf8'));
 if(value.owner.pid!==process.pid||path.resolve(value.owner.context.runDir)!==path.dirname(p))throw new Error('Probe owner/run identity differs');
 return value;
}
function rewriteArtifact(m,id,change){
 const item=m.artifacts.find(a=>a.id===id);if(!item)throw new Error('Probe artifact missing: '+id);
 const p=path.resolve(item.path),rel=path.relative(path.resolve(m.owner.context.runDir),p);
 if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Probe artifact outside own run');
 const value=change(original.read(p));original.write(p,value);
 item.bytes=value.length;item.sha256=digest(value);
}
function mutate(candidatePath){
 const m=ownedCandidate(candidatePath);
 if(mode==='png-header-only')rewriteArtifact(m,'core-capture',b=>b.subarray(0,24));
 else if(mode==='png-crc')rewriteArtifact(m,'core-capture',b=>{const out=Buffer.from(b);out[29]^=1;return out;});
 else if(mode==='duplicate-id'||mode==='missing-id'||mode==='extra-id'||mode==='caller-expected'||mode==='constant-actual'){
  if(mode==='duplicate-id')m.checks=m.checks.map(()=>structuredClone(m.checks[0]));
  if(mode==='missing-id')m.checks=m.checks.slice(1);
  if(mode==='extra-id')m.checks.push({...structuredClone(m.checks[0]),id:'CORE-EXTRA'});
  if(mode==='caller-expected')m.checks[0].expected=m.checks[0].actual;
  if(mode==='constant-actual')m.checks[0].actual=[777,555];
  rewriteArtifact(m,'worker-final',b=>Buffer.from(JSON.stringify({...JSON.parse(b),checks:m.checks})));
 } else if(mode.startsWith('raw-')){
  const key={'raw-console':'console','raw-pageerror':'pageerror','raw-requestfailed':'requestfailed','raw-http':'badResponses'}[mode];
  if(!key)throw new Error('Unknown raw probe');
  rewriteArtifact(m,'core-observations',b=>{const raw=JSON.parse(b);raw.rawErrors[key].push('SOL_A1_UNRELATED_401_'+mode);m.checks.find(c=>c.id==='CORE-06').actual=structuredClone(raw.rawErrors);return Buffer.from(JSON.stringify(raw));});
  rewriteArtifact(m,'worker-final',b=>Buffer.from(JSON.stringify({...JSON.parse(b),checks:m.checks})));
 } else if(mode==='canonical-drift'){
  rewriteArtifact(m,'core-observations',b=>{const raw=JSON.parse(b);raw.fixtureLabels[3].label='근무편성공개';m.checks.find(c=>c.id==='CORE-04').actual=structuredClone(raw.fixtureLabels);return Buffer.from(JSON.stringify(raw));});
  rewriteArtifact(m,'worker-final',b=>Buffer.from(JSON.stringify({...JSON.parse(b),checks:m.checks})));
 } else if(mode==='worker-close-receipt')m.worker.closeSeen=false;
 else if(mode==='server-close-receipt')m.server.closeSeen=false;
 else return;
 original.write(candidatePath,JSON.stringify(m,null,2));trigger({candidatePath});
}
fs.mkdtempSync=function(prefix,...args){const result=original.mkdtemp(prefix,...args);createdRuns.add(path.resolve(result));note('directory-created',{prefix,result});return result;};
const tempPromise=fs.promises.mkdtemp.bind(fs.promises);
fs.promises.mkdtemp=async function(prefix,...args){const result=await tempPromise(prefix,...args);createdRuns.add(path.resolve(result));note('directory-created',{prefix:String(prefix),result});return result;};
fs.writeFileSync=function(file,...args){
 note('file-write',{path:String(file),operation:'write'});
 if(mode==='owner-candidate-write-denied'&&path.basename(String(file))==='owner-candidate.json'){trigger({path:String(file)});throw new Error('SOL_A1_CANDIDATE_WRITE_DENIED');}
 if(mode==='final-write-denied'&&path.basename(String(file))==='owner-final.json'){trigger({path:String(file)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 return original.write(file,...args);
};
fs.renameSync=function(from,to,...args){
 note('file-write',{path:String(to),operation:'rename',from:String(from)});
 if(mode==='owner-candidate-write-denied'&&path.basename(String(to))==='owner-candidate.json'){trigger({path:String(to)});throw new Error('SOL_A1_CANDIDATE_WRITE_DENIED');}
 if(mode==='final-write-denied'&&path.basename(String(to))==='owner-final.json'){trigger({path:String(to)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 const result=original.rename(from,to,...args);note('file-rename-complete',{from:String(from),path:String(to)});return result;
};
const writePromise=fs.promises.writeFile.bind(fs.promises),renamePromise=fs.promises.rename.bind(fs.promises);
fs.promises.writeFile=async function(file,...args){
 note('file-write',{path:String(file),operation:'write'});
 if(mode==='owner-candidate-write-denied'&&path.basename(String(file))==='owner-candidate.json'){trigger({path:String(file)});throw new Error('SOL_A1_CANDIDATE_WRITE_DENIED');}
 if(mode==='final-write-denied'&&path.basename(String(file))==='owner-final.json'){trigger({path:String(file)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 return writePromise(file,...args);
};
fs.promises.rename=async function(from,to,...args){
 note('file-write',{path:String(to),operation:'rename',from:String(from)});
 if(mode==='owner-candidate-write-denied'&&path.basename(String(to))==='owner-candidate.json'){trigger({path:String(to)});throw new Error('SOL_A1_CANDIDATE_WRITE_DENIED');}
 if(mode==='final-write-denied'&&path.basename(String(to))==='owner-final.json'){trigger({path:String(to)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 const result=await renamePromise(from,to,...args);note('file-rename-complete',{from:String(from),path:String(to)});return result;
};
fs.createWriteStream=function(file,...args){
 note('file-write',{path:String(file)});
  let streamFile=file;
 if((mode==='log-write-denied'&&path.basename(String(file))==='server-stdout.log')||(mode==='gate-log-write-denied'&&path.basename(String(file))==='adjudicator-stdout.log')){
  trigger({path:String(file)});streamFile=path.join(path.dirname(String(file)),'sol-a1-missing-log-dir','denied.log');
 }
  const stream=original.stream(streamFile,...args);
  const streamId=++streamNumber,streamPath=String(file);
  note('log-stream-created',{streamId,path:streamPath,actualPath:String(streamFile)});
  stream.once('finish',()=>note('actual-log-finish',{streamId,path:streamPath}));
  stream.once('close',()=>note('actual-log-close',{streamId,path:streamPath}));
  stream.on('error',error=>note('actual-log-error',{streamId,path:streamPath,message:error.message}));
  if((path.basename(streamPath)==='worker-stdout.log'&&mode==='timestamp-regression')||(path.basename(streamPath)==='server-stdout.log'&&mode==='server-timestamp-regression')||(path.basename(streamPath)==='adjudicator-stdout.log'&&mode==='gate-timestamp-regression')){
   const emit=stream.emit.bind(stream);
   stream.emit=function(event,...values){
    const closeMs=mode==='server-timestamp-regression'?actualServerCloseMs:mode==='gate-timestamp-regression'?actualGateCloseMs:actualWorkerCloseMs;
    if(event==='finish'&&closeMs!==null){
     const supplied=closeMs-250,previous=Date.now;
     trigger({streamId,path:streamPath,suppliedTimeMs:supplied,actualChildCloseTimeMs:closeMs});
     note('clock-value-delivered-to-sut',{streamId,path:streamPath,value:supplied});
     Date.now=()=>supplied;
     try{return emit(event,...values);}finally{Date.now=previous;}
    }
    return emit(event,...values);
   };
  }
  const hiddenStreams={
   'log-finish-not-observed':['worker-stdout.log','finish'],
   'server-log-finish-not-observed':['server-stdout.log','finish'],
   'gate-log-finish-not-observed':['adjudicator-stdout.log','finish'],
   'log-close-not-observed':['worker-stdout.log','close'],
   'server-log-close-not-observed':['server-stdout.log','close'],
   'gate-log-close-not-observed':['adjudicator-stdout.log','close']};
  const hidden=hiddenStreams[mode];
  if((hidden&&path.basename(streamPath)===hidden[0])||(path.basename(streamPath)==='worker-stdout.log'&&mode==='late-log-error')){ 
   const emit=stream.emit.bind(stream);
   stream.emit=function(event,...values){
    if(hidden&&event===hidden[1]){
     note(event==='finish'?'actual-log-finish':'actual-log-close',{streamId,path:streamPath,hiddenFromSut:true});
     trigger({streamId,path:streamPath});return true;
    }
    const result=emit(event,...values);
    if(event==='finish'&&mode==='late-log-error')setImmediate(()=>{trigger({streamId,path:streamPath});emit('error',new Error('SOL_A1_LATE_LOG_ERROR'));});
    return result;
   };
  }
  return stream;
};
let streamNumber=0,spawnNumber=0;
cp.spawn=function(command,args=[],options={}){
 const server=args.some(a=>String(a).replaceAll('\\','/').endsWith('/dist/server/main/server.js'));
  const gate=args.some(a=>String(a).endsWith('gate-evidence.py'))||(process.env.SOL_A1_CANARY_GATE===session&&args.includes('SOL_A1_GATE_CANARY'));
 const regression=args.some(a=>String(a).replaceAll('\\','/').endsWith('/ui-checks/shell.mjs'));
 if(gate){const pos=args.indexOf('--candidate');if(pos>=0)mutate(args[pos+1]);}
 let launchCommand=command,launchArgs=args;
 if(server&&mode==='server-spawn-error'){launchCommand=path.join(process.cwd(),'artifacts','sol-a1-no-such-executable.exe');trigger({requested:command});}
 if(gate&&mode==='gate-spawn-error'){launchCommand=path.join(process.cwd(),'artifacts','sol-a1-no-such-gate.exe');trigger({requested:command});}
  if(!server&&!gate&&!regression&&mode==='worker-spawn-error'){launchCommand=path.join(process.cwd(),'artifacts','sol-a1-no-such-worker.exe');trigger({requested:command});}
 if(regression&&mode==='regression-no-evidence'){launchArgs=['-e',"process.stdout.write('SOL_A1_NO_CHILD_EVIDENCE\\n')"];trigger({requestedArgs:args});}
 const child=original.spawn(launchCommand,launchArgs,options);
  const spawnId=++spawnNumber;
  if(!server&&!gate&&!regression)actualWorkerPid=child.pid??null;if(gate)actualGatePid=child.pid??null;
  note('spawn',{spawnId,childPid:child.pid??null,server,gate,args:launchArgs,command:launchCommand});
  child.once('spawn',()=>note('actual-child-spawn',{spawnId,childPid:child.pid,server,gate}));
  child.once('error',error=>note('actual-child-error',{spawnId,childPid:child.pid??null,message:error.message,code:error.code}));
  child.once('exit',(code,signal)=>note('actual-child-exit',{spawnId,childPid:child.pid??null,server,gate,code,signal}));
  child.once('close',(code,signal)=>{if(!server&&!gate&&!regression)actualWorkerCloseMs=realClock();if(server)actualServerCloseMs=realClock();if(gate)actualGateCloseMs=realClock();note('actual-child-close',{spawnId,childPid:child.pid??null,server,gate,code,signal});});
  if((server&&mode==='server-close-not-observed')||(!server&&!gate&&!regression&&mode==='worker-close-not-observed')){
  const on=child.on.bind(child),once=child.once.bind(child);
  child.on=function(event,fn){if(event==='close'){trigger({childPid:child.pid});return on(event,()=>{});}return on(event,fn);};
  child.once=function(event,fn){if(event==='close'){trigger({childPid:child.pid});return once(event,()=>{});}return once(event,fn);};
 }
 if(!server&&!gate&&!regression&&['owner-bad-ack','owner-extra-ack','worker-no-ack','worker-no-run'].includes(mode)){
  const send=child.send.bind(child),on=child.on.bind(child),once=child.once.bind(child);
  if(mode==='worker-no-ack'||mode==='worker-no-run')child.send=function(message,...rest){
   if(message?.type===(mode==='worker-no-ack'?'owner-context':'owner-run')){trigger({childPid:child.pid,messageType:message.type});const callback=rest.find(value=>typeof value==='function');if(callback)queueMicrotask(()=>callback(null));return true;}return send(message,...rest);
  };
  if(mode==='owner-bad-ack'||mode==='owner-extra-ack'){
   const wrapped=fn=>message=>{if(message?.type==='worker-ack'){trigger({childPid:child.pid,messageType:message.type});return fn(mode==='owner-extra-ack'?{...message,unapproved:true}:{...message,nonce:'0'.repeat(64)});}return fn(message);};
   child.on=function(event,fn){return on(event,event==='message'?wrapped(fn):fn);};
   child.once=function(event,fn){return once(event,event==='message'?wrapped(fn):fn);};
  }
 }
  if(gate&&mode.startsWith('gate-response-')){
   const emit=child.stdout.emit.bind(child.stdout),chunks=[];
   child.stdout.emit=function(event,...values){
    if(event==='data'){chunks.push(Buffer.from(values[0]));return true;}
    if(event==='end'){
     const actual=Buffer.concat(chunks).toString('utf8');
     let replacement=actual;
     try{
      const parsed=JSON.parse(actual);
      if(parsed.status==='PASS'&&parsed.result){
       note('actual-gate-response',{spawnId,stdout:actual});
       const field=mode.slice('gate-response-'.length);
       if(field==='case')parsed.result.case='regression-home';
       else if(field==='runId')parsed.result.runId='run-sol-wrong';
       else if(field==='candidateSha256'||field==='executionSha256')parsed.result[field]='0'.repeat(64);
       else if(field==='checks'||field==='artifacts')parsed.result[field]+=1;
       else if(field==='acceptance')parsed.result.acceptance='WHOLE_PROJECT_ACCEPTED';
       else if(field==='status')parsed.result.status='VERIFIED_A1_EVIDENCE';
       else if(field==='extra')parsed.result.unapproved=true;
       else if(field==='outer-extra')parsed.unapproved=true;
       else if(field!=='extra-output')throw new Error('Unknown gate response fault');
       replacement=JSON.stringify(parsed)+'\n'+(field==='extra-output'?'{}\n':'');
       trigger({spawnId,field,originalGateStatus:'PASS'});
      }else note('probe-not-triggered',{spawnId,reason:'Real gate did not PASS'});
     }catch(error){note('probe-observer-error',{spawnId,message:error.message});}
     emit('data',Buffer.from(replacement));
    }
    return emit(event,...values);
   };
  }
 return child;
};
fs.rmSync=function(target,...args){
 const absolute=path.resolve(String(target));
 const owned=createdRuns.has(absolute)&&(path.basename(absolute).startsWith('shiftmgmt-gemini-32v-')||path.basename(absolute).startsWith('shiftmgmt-sol-a1v7-'));
 if(owned)note('owned-temp-remove-start',{path:absolute});
 const result=original.remove(target,...args);
 if(owned)note('owned-temp-remove-complete',{path:absolute});
 return result;
};
const removePromise=fs.promises.rm.bind(fs.promises);
fs.promises.rm=async function(target,...args){
 const absolute=path.resolve(String(target));
 const owned=createdRuns.has(absolute)&&(path.basename(absolute).startsWith('shiftmgmt-gemini-32v-')||path.basename(absolute).startsWith('shiftmgmt-sol-a1v7-'));
 if(owned)note('owned-temp-remove-start',{path:absolute});
 const result=await removePromise(target,...args);
 if(owned)note('owned-temp-remove-complete',{path:absolute});
 return result;
};
const lockTargets={
 'lock-protected-read':path.resolve(process.cwd(),'src/shared/domain/access-log.ts'),
 'lock-frozen-read':path.resolve(process.cwd(),'scripts/ui-checks/access-history-shared.mjs'),
 'lock-control-read':path.resolve(import.meta.dirname,'STRATEGY.md')};
const lockTarget=lockTargets[mode];
function virtualLockRead(file,options,value){
 if(lockTarget&&path.resolve(String(file))===lockTarget){
  trigger({path:lockTarget,virtualReadOnly:true});
  const text=Buffer.isBuffer(value)?value.toString('utf8'):value;
  const changed=mode==='lock-frozen-read'?text.replace('export const CANONICAL_8_ACTIONS =','export const CANONICAL_8_ACTIONS = /* SOL_LOCK_DRIFT */'):text+'\nSOL_LOCK_DRIFT';
  return Buffer.isBuffer(value)?Buffer.from(changed):changed;
 }
 return value;
}
fs.readFileSync=function(file,options){return virtualLockRead(file,options,original.read(file,options));};
const readPromise=fs.promises.readFile.bind(fs.promises);
fs.promises.readFile=async function(file,options){return virtualLockRead(file,options,await readPromise(file,options));};
syncBuiltinESMExports();
note('instrumentation-loaded');
process.once('exit',code=>{note('owner-process-exit',{code,triggered});original.closeFd(eventFd);});

// Actual log read attempt sequence, and one-shot successful receipt clone corruption.
const instrumentedRead=fs.readFileSync.bind(fs);
function readAttempt(file){if(/^(worker|server|adjudicator)-(stdout|stderr)\.log$/.test(path.basename(String(file))))note('log-artifact-read',{path:String(file)});}
function acquiredRead(file,value){
 const absolute=path.resolve(String(file)),name=path.basename(absolute);
 if(createdRuns.has(path.dirname(absolute))&&['core-observations.json','worker-final.json','core-partial.json','core-partial.fallback.json'].includes(name)){
  const parsed=JSON.parse(Buffer.isBuffer(value)?value.toString('utf8'):value);
  note('core-evidence-acquired',{path:absolute,value:parsed});
 }
 return value;
}
fs.readFileSync=function(file,...args){readAttempt(file);return acquiredRead(file,instrumentedRead(file,...args));};
const instrumentedAsyncRead=fs.promises.readFile.bind(fs.promises);
fs.promises.readFile=async function(file,...args){readAttempt(file);return acquiredRead(file,await instrumentedAsyncRead(file,...args));};
const actualClone=globalThis.structuredClone;
globalThis.structuredClone=function(value,...options){
 const cloned=actualClone(value,...options),target=mode==='worker-ledger-scalar-mismatch'?actualWorkerPid:mode==='gate-ledger-scalar-mismatch'?actualGatePid:null;
 if(!cloneFaultDelivered&&target!==null&&Array.isArray(value)&&value.length===7&&value[0]?.event==='spawn'&&value[0].pid===target){
  const index=value.findIndex(e=>e.event==='log-finish'&&e.stream==='stdout');
  if(index>=0){cloneFaultDelivered=true;cloned[index].timeMs=value[index].timeMs+1000;trigger({marker:'SOL_A1_RECEIPT_CLONE_CORRUPTION',targetPid:target,actualValue:value[index].timeMs,deliveredValue:cloned[index].timeMs});}
 }
 return cloned;
};
syncBuiltinESMExports();

// Sol control appendix: explicit callback deliveries after observed success caches.
// Combined with runtime-preload.mjs before sealing; not imported into children.
import net from 'node:net';
const lateModes = {
 'late-worker-child-before-remove':['worker','child','BEFORE_REMOVE'],
 'late-server-child-before-remove':['server','child','BEFORE_REMOVE'],
 'late-worker-log-before-remove':['worker','log','BEFORE_REMOVE'],
 'late-server-log-before-remove':['server','log','BEFORE_REMOVE'],
 'late-worker-child-gate':['worker','child','GATE_SPAWN'],
 'late-server-child-gate':['server','child','GATE_SPAWN'],
 'late-worker-log-gate':['worker','log','GATE_SPAWN'],
 'late-server-log-gate':['server','log','GATE_SPAWN'],
 'late-worker-child-final':['worker','child','FINAL_STAGE'],
 'late-server-child-final':['server','child','FINAL_STAGE'],
 'late-gate-child-final':['gate','child','FINAL_STAGE'],
 'late-server-log-final':['server','log','FINAL_STAGE'],
 'late-gate-log-final':['gate','log','FINAL_STAGE'],
 'late-server-child-double':['server','child','GATE_SPAWN'],
 'late-server-child-gate-mismatch':['server','child','GATE_RESPONSE']
};
const latePlan=lateModes[mode],lateChildren={},lateStreams={},lateClosed=new Set(),lateCaches={};
let lateDelivered=false;
const lateClone=globalThis.structuredClone;
globalThis.structuredClone=function(value,...args){
 const cloned=lateClone(value,...args);
 if(value&&Array.isArray(value.callbackEvents)&&value.callbackEvents.length===7){
  const role=Object.keys(lateChildren).find(k=>lateChildren[k].pid===value.pid);
  if(role){lateCaches[role]=(lateCaches[role]||0)+1;note('lifecycle-success-cache-copy',{role,childPid:value.pid,record:cloned});}
 }
 return cloned;
};
function deliverLate(stage){
 if(!latePlan||lateDelivered)throw new Error('Sol lifecycle duplicate/unknown delivery');
 const [role,kind,expected]=latePlan;
 if(stage!==expected||!lateClosed.has(role)||lateCaches[role]!==1)throw new Error('Sol lifecycle target not exactly once cached and physically closed');
 const target=kind==='child'?lateChildren[role]:lateStreams[role];
 if(!target)throw new Error('Sol lifecycle target absent');
 lateDelivered=true;
 for(let index=0;index<(mode==='late-server-child-double'?2:1);index++){
  const error=new Error('SOL_V7_LATE_'+role.toUpperCase()+'_'+kind.toUpperCase()+'_'+stage+'_'+index);
  note('lifecycle-error-delivery',{role,kind,stage,index,targetPid:lateChildren[role].pid,name:error.name,message:error.message,stack:error.stack});
  trigger({role,kind,stage,index});
  target.emit('error',error);
 }
}
const lateStream=fs.createWriteStream;
fs.createWriteStream=function(file,...args){
 const stream=lateStream(file,...args),name=path.basename(String(file));
 const role={'server-stdout.log':'server','worker-stdout.log':'worker','adjudicator-stdout.log':'gate'}[name];
 if(role){lateStreams[role]=stream;stream.on('error',error=>note('lifecycle-error-observed',{role,kind:'log',name:error.name,message:error.message,stack:error.stack}));}
 return stream;
};
const lateSpawn=cp.spawn;
cp.spawn=function(command,args=[],options={}){
 const server=args.some(a=>String(a).replaceAll('\\','/').endsWith('/dist/server/main/server.js'));
 const gate=args.includes('--candidate')||(process.env.SOL_A1_CANARY_GATE===session&&args.includes('SOL_A1_GATE_CANARY'));
 const role=server?'server':gate?'gate':'worker';
 const child=lateSpawn(command,args,options);
 lateChildren[role]=child;
 child.once('close',()=>lateClosed.add(role));
 child.on('error',error=>note('lifecycle-error-observed',{role,kind:'child',targetPid:child.pid,name:error.name,message:error.message,stack:error.stack}));
 if(gate&&latePlan?.[2]==='GATE_SPAWN')child.once('spawn',()=>deliverLate('GATE_SPAWN'));
 if(gate&&latePlan?.[2]==='GATE_RESPONSE'){
  const emit=child.stdout.emit.bind(child.stdout),chunks=[];
  child.stdout.emit=function(event,...values){
   if(event==='data'){chunks.push(Buffer.from(values[0]));return true;}
   if(event==='end'){
    const actual=Buffer.concat(chunks).toString('utf8'),parsed=JSON.parse(actual);
    if(parsed.status!=='PASS'||!parsed.result)throw new Error('Sol lifecycle expected actual PASS gate response');
    note('lifecycle-actual-gate-response',{stdout:actual});
    deliverLate('GATE_RESPONSE');
    parsed.result.candidateSha256='0'.repeat(64);
    note('lifecycle-gate-response-mismatch',{field:'candidateSha256'});
    emit('data',Buffer.from(JSON.stringify(parsed)+'\n'));
   }
   return emit(event,...values);
  };
 }
 return child;
};
const lateNetClose=net.Server.prototype.close;
net.Server.prototype.close=function(callback,...args){
 const wrapped=typeof callback==='function'?function(...values){
  if(latePlan?.[2]==='BEFORE_REMOVE'&&!lateDelivered&&lateCaches.worker===1&&lateCaches.server===1)deliverLate('BEFORE_REMOVE');
  return callback.apply(this,values);
 }:callback;
 return lateNetClose.call(this,wrapped,...args);
};
const lateWrite=fs.writeFileSync;
fs.writeFileSync=function(file,...args){
 const result=lateWrite(file,...args);
 if(latePlan?.[2]==='FINAL_STAGE'&&path.basename(String(file))==='owner-final.json.tmp')deliverLate('FINAL_STAGE');
 return result;
};
syncBuiltinESMExports();
note('lifecycle-instrumentation-loaded',{knownModes:Object.keys(lateModes).length});
