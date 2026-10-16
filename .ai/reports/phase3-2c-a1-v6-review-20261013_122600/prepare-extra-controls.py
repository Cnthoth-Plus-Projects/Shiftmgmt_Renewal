# -*- coding: utf-8 -*-
"""Create Sol-only timed callback probes in fresh report; originals remain unchanged."""
from pathlib import Path
REPORT=Path(__file__).resolve().parent;CTRL=REPORT.parent.parent.parent/'.ai/contracts/phase3-2c-a1-v6'
source=(CTRL/'runtime-preload.mjs').read_text(encoding='utf-8')
source+="""
// Explicit controlled error delivery after original successful receipts have been cached.
import net from 'node:net';
let lateServer=null,lateServerClosed=false,lateServerLog=null,lateDelivered=false;
function deliverLate(stage,kind='child'){
 if(lateDelivered||!lateServer||!lateServerClosed)throw new Error('Sol extra delivery outside settled server phase');
 lateDelivered=true;const error=new Error('SOL_V6_LATE_'+kind.toUpperCase()+'_'+stage);
 note('controlled-late-error-delivery',{stage,kind,targetPid:lateServer.pid,name:error.name,message:error.message,stack:error.stack});
 trigger({marker:error.message,stage,kind,targetPid:lateServer.pid});
 if(kind==='log')lateServerLog.emit('error',error);else lateServer.emit('error',error);
}
const timedStream=fs.createWriteStream.bind(fs);
fs.createWriteStream=function(file,...args){const stream=timedStream(file,...args);if(path.basename(String(file))==='server-stdout.log')lateServerLog=stream;return stream;};
const timedSpawn=cp.spawn;
cp.spawn=function(command,args,options){
 const server=args.some(a=>String(a).replaceAll('\\\\','/').endsWith('/dist/server/main/server.js'));
 const gate=args.includes('--candidate');const child=timedSpawn(command,args,options);
 if(server){lateServer=child;child.once('close',()=>lateServerClosed=true);}
 if(gate&&['late-child-gate','late-log-gate','late-child-gate-failure'].includes(mode)){
  child.once('spawn',()=>deliverLate('GATE_SPAWN',mode==='late-log-gate'?'log':'child'));
  if(mode==='late-child-gate-failure'){
   const emit=child.stdout.emit.bind(child.stdout);
   child.stdout.emit=function(event,...values){
    if(event==='data'){
     try{const actual=JSON.parse(String(values[0]));if(actual.status==='PASS'){note('controlled-gate-response-mismatch',{actual:String(values[0])});actual.result.candidateSha256='0'.repeat(64);values[0]=Buffer.from(JSON.stringify(actual)+'\\n');}}
     catch{}
    }
    return emit(event,...values);
   };
  }
 }
 return child;
};
const timedNetClose=net.Server.prototype.close;
net.Server.prototype.close=function(callback,...args){
 const wrapped=typeof callback==='function'?function(...values){if(mode==='late-child-before-removal'&&lateServerClosed&&!lateDelivered)deliverLate('PORT_CHECK_CLOSE');return callback.apply(this,values);}:callback;
 return timedNetClose.call(this,wrapped,...args);
};
syncBuiltinESMExports();
"""
with (REPORT/'runtime-preload.mjs').open('xb') as f:f.write(source.encode('utf-8'))
print('Created controlled late child/log callback probes; product and sealed control writes 0')
