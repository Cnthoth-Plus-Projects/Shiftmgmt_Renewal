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
