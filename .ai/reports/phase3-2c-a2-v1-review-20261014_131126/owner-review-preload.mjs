// Inject only into the exact private worker spawned by the reviewed owner.
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const cfg=new URL(import.meta.url).searchParams;
const mode=cfg.get('mode'),trace=cfg.get('trace'),childTrace=cfg.get('childTrace');
const nativeSpawn=cp.spawn;
cp.spawn=function(command,args=[],options={}){
 const worker=args.find(a=>typeof a==='string'&&/access-history-(positive|negative)\.mjs$/.test(a));
 let next=args;
 if(worker){
  const preload=new URL('./child-review-preload.mjs',import.meta.url);preload.search='';
  preload.searchParams.set('mode',mode);preload.searchParams.set('trace',childTrace);
  next=['--import',preload.href,...args];
 }
 const child=nativeSpawn(command,next,options);
 const note=(kind,value={})=>fs.appendFileSync(trace,JSON.stringify({kind,ownerPid:process.pid,childPid:child.pid??null,timeMs:Date.now(),worker:!!worker,...value})+'\n');
 note('spawn-request',{command,args:next});
 child.once('spawn',()=>note('actual-spawn'));
 child.once('error',e=>note('actual-error',{name:e.name,message:e.message}));
 child.once('exit',(code,signal)=>note('actual-exit',{code,signal}));
 child.once('close',(code,signal)=>note('actual-close',{code,signal}));
 return child;
}
syncBuiltinESMExports();
