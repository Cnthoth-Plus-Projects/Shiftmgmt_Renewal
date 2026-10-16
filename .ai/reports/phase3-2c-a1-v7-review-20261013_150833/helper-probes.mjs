// Actual source helpers with explicit controlled fixtures; not full owner runtime.
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
import {createRequire} from 'node:module';import {Writable} from 'node:stream';
import {isDeepStrictEqual} from 'node:util';
const repo='C:/Projects/Active/ShiftMgmt_V4',require=createRequire(path.join(repo,'package.json')),ts=require('typescript');
const source=fs.readFileSync(path.join(repo,'scripts/ui-checks/access-history.mjs'),'utf8');
const tree=ts.createSourceFile('owner.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=['isObj','errInfo','recordError','fail','cleanProc','checkBarrier'];
const declarations=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(tree)))).map(n=>n.getText(tree));
const guard=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='validateProcessReceipt');
const cls=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='ProcessRecord');
function context(extra={}){
 const c=vm.createContext({structuredClone,setImmediate,setTimeout,fs:{createWriteStream:()=>new Writable({write(_d,_e,cb){cb();}})},same:isDeepStrictEqual,...extra});
 vm.runInContext('let primaryError=null,primaryCode="A1_WORKER_FAILED",primaryPhase="test",cleanupErrors=[],evidenceErrors=[],unexpectedErrors=[],workerReg=null,workerCached=null,serverReg=null,serverCached=null,gateReg=null,gateCached=null;const isPidAlive=()=>false;const sleep=ms=>new Promise(r=>setTimeout(r,ms));\n'+declarations.join('\n')+'\n'+guard.getText(tree)+'\n'+cls.getText(tree)+'\nthis.api={cleanProc,checkBarrier,validateProcessReceipt,ProcessRecord,errors:()=>({primaryError,cleanupErrors,unexpectedErrors})};',c);
 return c;
}
const base={pid:202,createdAtMs:1,exitAtMs:2,closeAtMs:3,exitSeen:true,closeSeen:true,exitCode:0,exitSignal:null,closeCode:0,closeSignal:null,aliveAfterClose:false,logsSettled:{stdout:true,stderr:true},logFinishSeen:{stdout:true,stderr:true},logCloseSeen:{stdout:true,stderr:true},logFinishAtMs:{stdout:4,stderr:5},logCloseAtMs:{stdout:5,stderr:6},callbackEvents:[]};
for(const [event,timeMs,stream] of [['spawn',1,null],['exit',2,null],['close',3,null],['log-finish',4,'stdout'],['log-close',5,'stdout'],['log-finish',5,'stderr'],['log-close',6,'stderr']])base.callbackEvents.push({event,timeMs,stream,pid:stream===null?202:null,code:['exit','close'].includes(event)?0:null,signal:null,error:null});
const g=context();g.api.validateProcessReceipt(base);const settlement=[];
for(const [name,change] of [['false',r=>r.logsSettled={stdout:false,stderr:false}],['missing',r=>delete r.logsSettled],['extra',r=>r.logsSettled.unapproved=true],['partial',r=>r.logsSettled.stderr=false]]){const r=structuredClone(base);change(r);let accepted=true;try{g.api.validateProcessReceipt(r);}catch{accepted=false;}settlement.push({name,accepted});}
const stopError=new Error('SOL_V7_HELPER_STOP_THROW');const calls=[];const c=context();
await c.api.cleanProc({stop:async()=>{calls.push('stop');throw stopError;},settleLogs:async()=>calls.push('settleLogs')});
const cleanup={calls,errors:c.api.errors().cleanupErrors.map(e=>({message:e.message,stack:e.stack})),originalStack:stopError.stack};
const b=context({fixture:JSON.stringify(base)});
vm.runInContext('serverCached=JSON.parse(fixture);serverReg=JSON.parse(fixture);serverReg.name="server";serverReg.settled=true;this.snapshots=0;serverReg.toManifestRecord=()=>{this.snapshots++;return serverCached;};checkBarrier();',b);
const snapshotCalls=b.snapshots;
const endError=new Error('SOL_V7_HELPER_END_THROW'),s=context(),rec=new s.api.ProcessRecord('worker','own-stdout','own-stderr');
rec.streams.stdout.end=()=>{throw endError;};let endThrown=null;
try{await rec.settleLogs(100);}catch(e){endThrown={message:e.message,stack:e.stack};}
await new Promise(r=>setImmediate(r));
const streams={stderrEnded:rec.streams.stderr.writableEnded,stdoutClosed:rec.streams.stdout.closed,stderrClosed:rec.streams.stderr.closed,error:endThrown,originalStack:endError.stack};
for(const stream of Object.values(rec.streams))stream.destroy();
await new Promise(r=>setImmediate(r));
const result={proof:'ACTUAL_EXTRACTED_SOURCE_HELPERS_WITH_EXPLICIT_FIXTURES_NOT_FULL_OWNER_RUNTIME',settlement,cleanup,snapshotCalls,streams};
console.log(JSON.stringify(result));
