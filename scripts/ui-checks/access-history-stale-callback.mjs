import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";
const CONTRACT_DIR="C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u6-stale";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex").toUpperCase();
function need(v,c){if(!v)throw Error(c);}
function read(p){const a=fs.lstatSync(p,{bigint:true});need(a.isFile()&&!a.isSymbolicLink()&&a.nlink===1n&&fs.realpathSync(p)===path.resolve(p),"CALLBACK_FILE_OWNERSHIP");const b=fs.readFileSync(p),z=fs.lstatSync(p,{bigint:true});need(["dev","ino","size","mtimeNs","ctimeNs"].every(k=>a[k]===z[k])&&BigInt(b.length)===z.size,"CALLBACK_CHANGED_DURING_READ");return b;}
export async function installCompiledCallbackProbe(options){
 need(options&&Object.getPrototypeOf(options)===Object.prototype&&!util.types.isProxy(options),"CALLBACK_OPTIONS");
 const ds=Object.getOwnPropertyDescriptors(options);need(Reflect.ownKeys(ds).length===3&&["context","page","runDir"].every(k=>ds[k]&&Object.hasOwn(ds[k],"value")),"CALLBACK_OPTIONS");
 const {context,page,runDir}=options;need(page.context()===context,"CALLBACK_CONTEXT_PAGE");
 const lockPath=path.join(CONTRACT_DIR,"compiled-callback-lock.json"),lockBytes=read(lockPath),lock=JSON.parse(lockBytes),hookBytes=read(path.join(CONTRACT_DIR,"canonical-callback-hook.mjs")),bundleBytes=read(path.join(CONTRACT_DIR,"compiled-callback-bundle.js"));
 for(const r of [lock.hook,lock.bundle,...lock.originalSources,...lock.compilerFiles]){const b=read(r.path);need(b.length===r.bytes&&sha(b)===r.sha256,"CALLBACK_INPUT_FINGERPRINT_MISMATCH");}
 const files={hook:["normal-stale-callback-hook.mjs",hookBytes],bundle:["normal-stale-callback-bundle.js",bundleBytes],buildReceipt:["normal-stale-callback-build.json",lockBytes]},refs={};
 for(const[k,[name,b]]of Object.entries(files)){const p=path.join(runDir,name);fs.writeFileSync(p,b,{flag:"wx"});refs[k]={path:p,bytes:b.length,sha256:sha(b)};}
 const events=[],pending=new Set(),requests=new WeakMap(),served=[],contextId="context-"+crypto.randomUUID(),pageId="page-"+crypto.randomUUID();let failure=null,closed=false,instances=null;
 const track=p=>{pending.add(p);p.then(()=>pending.delete(p),e=>{failure??=e;pending.delete(p);});return p;};
 context.once("close",()=>{closed=true;});
 await page.exposeBinding("__solStaleCallbackEvent",async(source,event)=>{
  const node={atMs:Date.now(),hrNs:process.hrtime.bigint().toString()};
  try{
   need(source.context===context&&source.page===page&&source.frame===page.mainFrame(),"CALLBACK_FOREIGN_SOURCE");
   const actual=await page.evaluate(i=>window.__u6Audit?.callbacks?.find(e=>e.eventIndex===i)??null,event.eventIndex);
   need(actual&&util.isDeepStrictEqual(actual,event)&&event.eventIndex===events.length+1,"CALLBACK_CLASS_EVENT_BINDING");
   events.push({eventIndex:event.eventIndex,instanceId:event.instanceId,generation:event.generation,destroyed:event.destroyed,node,browser:{atMs:event.atMs,perfMs:event.perfMs,timeOriginMs:event.timeOriginMs},browserCompletedAtMs:event.completedAtMs,browserCompletedPerfMs:event.completedPerfMs,threw:event.threw});return true;
  }catch(e){failure??=e;throw e;}
 });
 const URL="http://127.0.0.1:18741/web/app.js";
 const owns=req=>req.url()===URL&&req.method()==="GET"&&req.frame()===page.mainFrame()&&req.frame().page()===page&&page.context()===context;
 page.on("response",response=>{const r=requests.get(response.request());if(!r)return;track((async()=>{need(owns(response.request())&&response.status()===200,"CALLBACK_RESPONSE_OWNER");const b=await response.body();need(b.equals(bundleBytes),"CALLBACK_SERVED_BYTES");r.response=true;r.bytes=b.length;r.sha256=sha(b);})());});
 await page.route(URL,async route=>{const req=route.request();if(!owns(req)){await route.continue();return;}const r={url:req.url(),method:req.method(),fulfilled:false,response:false,bytes:0,sha256:null};requests.set(req,r);served.push(r);try{await route.fulfill({status:200,contentType:"application/javascript; charset=utf-8",body:bundleBytes});r.fulfilled=true;}catch(e){failure??=e;throw e;}});
 const drain=async()=>{while(pending.size)await Promise.allSettled([...pending]);if(failure)throw failure;};
 return{
  events,get failure(){return failure;},
  async drain(){if(!closed)await page.evaluate(async()=>{if(window.__u6Audit?.drain)await window.__u6Audit.drain();});await drain();},
  async snapshot(){await this.drain();instances=await page.evaluate(()=>window.__u6Audit?.instances??null);need(Array.isArray(instances)&&instances.length>0&&instances.every((x,i)=>x.id===i+1),"CALLBACK_CLASS_INSTANCES");need(events.every(e=>e.instanceId>=1&&e.instanceId<=instances.length),"CALLBACK_INSTANCE_EVENT");},
  dispose(){need(closed,"CALLBACK_CONTEXT_NOT_CLOSED");},
  getData(){const r=served.length&&served.every(x=>x.fulfilled&&x.response)?served[served.length-1]:null;return{...refs,originalSources:lock.originalSources,compilerFiles:lock.compilerFiles,servedResource:r?r.url:null,servedMethod:r?r.method:null,servedBytes:r?r.bytes:0,servedSha256:r?r.sha256:null,contextId,pageId,instanceCount:instances?.length??0,events:events.map(e=>structuredClone(e)),disposedWithOwnedContext:closed};}
 };
}
