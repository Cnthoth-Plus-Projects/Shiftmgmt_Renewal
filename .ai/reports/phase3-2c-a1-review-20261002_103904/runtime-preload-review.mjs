// Sol-only fault instrumentation. Never forwarded by the product owner to children.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
const mode=process.env.SOL_A1_PROBE;
const eventPath=process.env.SOL_A1_PROBE_EVENTS;
if(!mode||!eventPath)throw new Error('Sol probe mode/events missing');
const original={spawn:cp.spawn,write:fs.writeFileSync,rename:fs.renameSync,read:fs.readFileSync,mkdtemp:fs.mkdtempSync,stream:fs.createWriteStream};
const note=(type,data={})=>original.write(eventPath,JSON.stringify({type,mode,timeMs:Date.now(),pid:process.pid,...data})+'\n',{flag:'a'});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
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
 note('file-write',{path:String(file)});
 if(mode==='final-write-denied'&&path.basename(String(file))==='owner-final.json'){trigger({path:String(file)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 return original.write(file,...args);
};
fs.renameSync=function(from,to,...args){
 note('file-write',{path:String(to)});
 if(mode==='final-write-denied'&&path.basename(String(to))==='owner-final.json'){trigger({path:String(to)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 return original.rename(from,to,...args);
};
const writePromise=fs.promises.writeFile.bind(fs.promises),renamePromise=fs.promises.rename.bind(fs.promises);
fs.promises.writeFile=async function(file,...args){
 note('file-write',{path:String(file)});
 if(mode==='final-write-denied'&&path.basename(String(file))==='owner-final.json'){trigger({path:String(file)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 return writePromise(file,...args);
};
fs.promises.rename=async function(from,to,...args){
 note('file-write',{path:String(to)});
 if(mode==='final-write-denied'&&path.basename(String(to))==='owner-final.json'){trigger({path:String(to)});throw new Error('SOL_A1_FINAL_WRITE_DENIED');}
 return renamePromise(from,to,...args);
};
fs.createWriteStream=function(file,...args){
 note('file-write',{path:String(file)});
 if((mode==='log-write-denied'&&path.basename(String(file))==='server-stdout.log')||(mode==='gate-log-write-denied'&&path.basename(String(file))==='adjudicator-stdout.log')){
  trigger({path:String(file)});return original.stream(path.join(path.dirname(String(file)),'sol-a1-missing-log-dir','denied.log'),...args);
 }
 return original.stream(file,...args);
};
cp.spawn=function(command,args=[],options={}){
 const server=args.some(a=>String(a).replaceAll('\\','/').endsWith('/dist/server/main/server.js'));
 const gate=args.some(a=>String(a).endsWith('gate-evidence.py'));
 const regression=args.some(a=>String(a).replaceAll('\\','/').endsWith('/ui-checks/shell.mjs'));
 if(gate){const pos=args.indexOf('--candidate');if(pos>=0)mutate(args[pos+1]);}
 let launchCommand=command,launchArgs=args;
 if(server&&mode==='server-spawn-error'){launchCommand=path.join(process.cwd(),'artifacts','sol-a1-no-such-executable.exe');trigger({requested:command});}
 if(gate&&mode==='gate-spawn-error'){launchCommand=path.join(process.cwd(),'artifacts','sol-a1-no-such-gate.exe');trigger({requested:command});}
 if(regression&&mode==='regression-no-evidence'){launchArgs=['-e',"process.stdout.write('SOL_A1_NO_CHILD_EVIDENCE\\n')"];trigger({requestedArgs:args});}
 const child=original.spawn(launchCommand,launchArgs,options);
 note('spawn',{childPid:child.pid??null,server,gate,args:launchArgs,command:launchCommand});
 child.once('error',error=>note('actual-child-error',{childPid:child.pid??null,message:error.message,code:error.code}));
 child.once('close',(code,signal)=>note('actual-child-close',{childPid:child.pid??null,server,gate,code,signal}));
 if(server&&mode==='server-close-not-observed'){
  const on=child.on.bind(child),once=child.once.bind(child);
  child.on=function(event,fn){if(event==='close'){trigger({childPid:child.pid});return on(event,()=>{});}return on(event,fn);};
  child.once=function(event,fn){if(event==='close'){trigger({childPid:child.pid});return once(event,()=>{});}return once(event,fn);};
 }
 if(!server&&!gate&&!regression&&['owner-bad-ack','worker-no-ack','worker-no-run'].includes(mode)){
  const send=child.send.bind(child),on=child.on.bind(child),once=child.once.bind(child);
  if(mode==='worker-no-ack'||mode==='worker-no-run')child.send=function(message,...rest){
   if(message?.type===(mode==='worker-no-ack'?'owner-context':'owner-run')){trigger({childPid:child.pid,messageType:message.type});const callback=rest.find(value=>typeof value==='function');if(callback)queueMicrotask(()=>callback(null));return true;}return send(message,...rest);
  };
  if(mode==='owner-bad-ack'){
   const wrapped=fn=>message=>{if(message?.type==='worker-ack'){trigger({childPid:child.pid,messageType:message.type});return fn({...message,nonce:'0'.repeat(64)});}return fn(message);};
   child.on=function(event,fn){return on(event,event==='message'?wrapped(fn):fn);};
   child.once=function(event,fn){return once(event,event==='message'?wrapped(fn):fn);};
  }
 }
 return child;
};
syncBuiltinESMExports();
note('instrumentation-loaded');
process.once('exit',code=>note('owner-process-exit',{code,triggered}));
