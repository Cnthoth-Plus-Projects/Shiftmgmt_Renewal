import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";
import { chromium } from "playwright";
import { inspectG1Properties } from "./access-history-g1.mjs";
import { selectEvidenceMode, publishCanonicalEvidence, publishErrorsTerminal } from "./access-history-errors-evidence.mjs";
import { runErrorScenario } from "./access-history-errors-scenario.mjs";
const assert=(v,m='U5_OBSERVATION')=>{if(!v)throw Error(m);};

const stamp=()=>({atMs:Date.now(),hrNs:process.hrtime.bigint().toString()}),hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
async function installBridgeClock(page,context,getPhase){
 assert.equal=(a,b,m)=>assert(a===b,m);assert.deepEqual=(a,b,m)=>assert(util.isDeepStrictEqual(a,b),m);
 const calls=[],byToken=new Map(),armed=new Map(),queues=new Map(),paths={'/api/access-logs:list':'listAccessLogs','/api/operations:list-users':'listOperationUsers'};let failure=null;
 const stamp=()=>({atMs:Date.now(),hrNs:process.hrtime.bigint().toString()}),fail=e=>{failure??=e;return e;},owned=s=>assert(s.context===context&&s.page===page&&s.frame===page.mainFrame(),'NATIVE_BINDING_OWNER');
 const wait=async(fn,label)=>{const end=Date.now()+6000;while(!fn()){const browserFailure=await page.evaluate(()=>window.__solU5?.failure??null);if(browserFailure)throw Error(browserFailure);if(failure)throw failure;if(Date.now()>end)throw Error('NATIVE_CLOCK_WAIT:'+label);await new Promise(r=>setTimeout(r,2));}};
 let begin=null,end=null;try{begin=await page.exposeBinding('__solU5Begin',async(source,token,p)=>{
  try{owned(source);assert(paths[p]&&!byToken.has(token),'NATIVE_BEGIN_TOKEN');const at=stamp();const info=await page.evaluate(t=>{const c=window.__solU5.calls.find(c=>c.token===t);if(!c)throw Error('MISSING_BROWSER_CALL');return c;},token);assert.equal(info.method,paths[p]);assert.equal(info.phase,getPhase());assert(info.token===token&&info.id===token&&Array.isArray(info.args));const row={...info,requestId:null,nodeBeginAtMs:at.atMs,nodeBeginHrNs:at.hrNs,nodeSettledAtMs:null,nodeSettledHrNs:null,settledAtMs:null,settledPerfMs:null,settledStatus:null,settledResult:null};calls.push(row);byToken.set(token,row);
   await wait(()=>{if(armed.has(p))return false;armed.set(p,token);return true;},'emission lane');return true;
  }catch(e){throw fail(e);}
 });
 end=await page.exposeBinding('__solU5End',async(source,info)=>{
  try{owned(source);const at=stamp(),row=byToken.get(info.token);const originalFailure=await page.evaluate(()=>window.__solU5.failure);if(originalFailure)throw Error(originalFailure);assert(row&&row.requestId&&row.nodeSettledHrNs===null,'NATIVE_END_TOKEN');for(const k of['id','token','method','phase','timeOriginMs'])assert.equal(info[k],row[k]);assert.deepEqual(info.args,row.args);Object.assign(row,{settledAtMs:info.settledAtMs,settledPerfMs:info.settledPerfMs,settledStatus:info.settledStatus,settledResult:info.settledResult,nodeSettledAtMs:at.atMs,nodeSettledHrNs:at.hrNs});return true;
  }catch(e){throw fail(e);}
 });
 await page.addInitScript(()=>{
  const original=Object.getOwnPropertyDescriptor(window,'fetch'),fetch=window.fetch,env={active:null,seq:0,calls:[],phase:'setup',original,fetch,methods:[],stopped:false,failure:null};window.__solU5=env;
  window.fetch=function(...args){const p=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href).pathname,token=env.active;if(!env.stopped&&['/api/access-logs:list','/api/operations:list-users'].includes(p)){if(!token)throw Error('NATIVE_FETCH_WITHOUT_CALL');const receiver=this;return(async()=>{try{await window.__solU5Begin(token,p);}catch(e){env.failure=String(e.message);throw e;}return fetch.apply(receiver,args);})();}return fetch.apply(this,args);};
 });
 }catch(error){error.cleanupErrors=[];for(const binding of[begin,end])if(binding)try{await binding.dispose();}catch(e){error.cleanupErrors.push(e);}throw error;}
 return{
  calls,get failure(){return failure?.message??null;},check(){if(failure)throw failure;},
  onRequest(req,row){if(!paths[row.path])return;try{const token=armed.get(row.path),call=byToken.get(token);assert(call&&!call.requestId,'NATIVE_REQUEST_ARM');assert.equal(call.phase,row.phase);assert.deepEqual(call.args,req.postDataJSON());call.requestId=row.id;row.callId=call.id;row.emittedHrNs=process.hrtime.bigint().toString();armed.delete(row.path);}catch(e){fail(e);}},
  async attachBridge(){await page.evaluate(()=>{const env=window.__solU5;for(const name of['listAccessLogs','listOperationUsers']){const original=Object.getOwnPropertyDescriptor(window.appBridge,name);if(!original||typeof original.value!=='function')throw Error('NATIVE_BRIDGE_DESCRIPTOR');const fn=original.value;env.methods.push([name,original]);const wrapper=function(...args){const token='u5-call-'+(++env.seq),normalized=args.slice();while(normalized.length&&normalized.at(-1)===undefined)normalized.pop();const row={id:token,token,method:name,phase:env.phase,args:JSON.parse(JSON.stringify(normalized)),atMs:Date.now(),perfMs:performance.now(),timeOriginMs:performance.timeOrigin};env.calls.push(row);const previous=env.active;env.active=token;let promise;try{promise=fn.apply(this,args);}finally{env.active=previous;}const note=(status,value)=>{const out={...row,settledAtMs:Date.now(),settledPerfMs:performance.now(),settledStatus:status,settledResult:value};window.__solU5End(out).catch(e=>{env.failure=String(e.message);});};promise.then(value=>note('fulfilled',value),error=>note('rejected',{name:error?.name,message:error?.message}));return promise;};Object.defineProperty(wrapper,'length',{value:fn.length});Object.defineProperty(window.appBridge,name,{...original,value:wrapper});}});},
  async phase(name){await page.evaluate(n=>{window.__solU5.phase=n;},name);},
  async emitted(phase){await wait(()=>calls.filter(c=>c.phase===phase&&c.requestId).length===2,'old pair emission');const pair=calls.filter(c=>c.phase===phase);assert.equal(pair.length,2);assert.deepEqual(new Set(pair.map(c=>c.method)),new Set(['listAccessLogs','listOperationUsers']));return pair;},
  async settled(ids){await wait(()=>ids.every(id=>calls.find(c=>c.id===id)?.nodeSettledHrNs),'actual Bridge settlement');await page.evaluate(async()=>{await Promise.resolve();});},
  async drain(){await wait(()=>calls.every(c=>c.nodeSettledHrNs!==null),'all Bridge settlements');if(failure)throw failure;},
  async restore(){const errors=[],flags={bridgeRestored:false,fetchRestored:false};const attempt=async fn=>{try{await fn();}catch(e){errors.push(e);}};await attempt(()=>this.drain());await attempt(async()=>{await page.evaluate(()=>{const e=window.__solU5;e.stopped=true;for(const[n,d]of e.methods)Object.defineProperty(window.appBridge,n,d);Object.defineProperty(window,'fetch',e.original);});flags.bridgeRestored=flags.fetchRestored=true;});for(const binding of[begin,end])await attempt(()=>binding.dispose());if(armed.size)errors.push(Error('U5_PENDING_BINDING_LANE'));if(errors.length){const e=errors[0];e.cleanupErrors=errors.slice(1);e.restoration=flags;throw e;}return flags;}

 };
}

export function createErrorsRun(options){
 inspectG1Properties(options,'options',{isRecord:true,keys:['argv']});inspectG1Properties(options.argv,'argv',{isArray:true});const argv=[...options.argv];assert(argv.length===1||argv.length===2,'CANONICAL_INPUT');assert(argv[0]==='--case=errors'&&(argv.length===1||argv[1]==='--evidence=canonical-errors-v1'),'CANONICAL_INPUT');let validated=false;
 return {validate(execution,contract){assert(selectEvidenceMode(argv,execution)===(argv.length===2?'canonical-errors-v1':'legacy'),'CANONICAL_INPUT');assert(contract.fullUi.rules.errors.length===8,'CANONICAL_REGISTRY');validated=true;return true;},async run(deps){
  assert(validated,'CANONICAL_REGISTRATION');const {state,context,adminCreds,withNegativeLifecycle,createNormalPageObserver,performNormalLogin,waitForFontsReady}=deps,canonical=argv.length===2;
  const result={requests:[],observations:{},routeJournal:[],routes:[],phases:[],errors:[]},requestMap=new WeakMap(),pending=new Set(),rawRows=new Map(),acquisition={browser:false,context:false,page:false,observer:false,bindings:false,routes:false,capture:false},lifecycle={contextClosed:false,browserClosed:false,context:null,browser:null};let facts=null,probe=null,page=null,bc=null,lifeRef=null,observer=null,stopObserve=null,published=false,failure=null,start=null,captureReceipt=null;
  const registration=Object.freeze({context:Object.freeze({...context}),caseName:'errors'}),publication=Object.freeze({mode:'canonical-errors-v1',readFacts(){assert(facts,'U5_FACTS_NOT_READY');return facts;}});
  if(canonical){await publishCanonicalEvidence(state,publication,registration);process.once('exit',code=>{published=publishErrorsTerminal(state,publication,registration,code);});}
  const note=(type,message,row=null,atMs=Date.now())=>{const e={type,phase:row?.phase??state.phase,requestId:row?.id??null,path:row?.path??null,message:String(message),atMs};result.errors.push(e);return e;};
  const fail=e=>{failure??=e instanceof Error?e:Error(String(e));return failure;};
  const monitor=(resource,name)=>{const own=Object.getOwnPropertyDescriptor(resource,'close'),original=resource.close;resource.close=function(...args){const s=stamp(),r={attemptAtMs:s.atMs,attemptHrNs:s.hrNs,closedAtMs:null,closedHrNs:null,error:null};lifecycle[name]=r;const p=original.apply(this,args);p.then(()=>{const e=stamp();r.closedAtMs=e.atMs;r.closedHrNs=e.hrNs;lifecycle[name+'Closed']=true;if(own)Object.defineProperty(resource,'close',own);else delete resource.close;},e=>{r.error=String(e.message);note('cleanup',e.message);});return p;};};
  const sync=()=>{for(const [id,q]of rawRows){const r=state.requests.find(r=>r.id===id);for(const[k,v]of Object.entries({atMs:r.startedAtMs,finishedAtMs:r.endedAtMs,status:r.status,ok:r.ok,errorCode:r.errorCode}))q[k]=v;}};
  const track=promise=>{pending.add(promise);promise.catch(e=>fail(e)).finally(()=>pending.delete(promise));};
  const drain=async()=>{while(pending.size)await Promise.all([...pending]);sync();if(failure)throw failure;probe?.check();};
  try{await withNegativeLifecycle(state,context,async life=>{
   lifeRef=life;life.enterSteps();start=stamp();state.setPhase('setup');
   const browser=await life.acquire('browser',()=> (deps.chromium??chromium).launch({executablePath:state.environment.chrome.path,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=1440,900']}));acquisition.browser=true;monitor(browser,'browser');
   bc=await life.acquire('context',()=>browser.newContext({viewport:{width:1440,height:900}}));acquisition.context=true;monitor(bc,'context');state.environment.viewport=[1440,900];state.environment.origin=new URL(context.url).origin;
   observer=await life.acquire('observer',()=>createNormalPageObserver(state,bc));acquisition.observer=true;
   const originalEmit=bc.emit;bc.emit=function(event,...args){const before=state.requests.length,value=originalEmit.call(this,event,...args);if(event==='request'&&args[0].url().startsWith(state.environment.origin+'/api/')){try{const req=args[0];assert(state.requests.length===before+1,'U5_RAW_EMIT_ROW');const r=state.requests[before];assert(r.url===req.url()&&r.method===req.method()&&r.source==='page','U5_RAW_EMIT_IDENTITY');const q={id:r.id,source:r.source,phase:r.phase,method:r.method,path:new URL(r.url).pathname,atMs:r.startedAtMs,responseAtMs:null,finishedAtMs:null,failedAtMs:null,status:r.status,ok:r.ok,errorCode:r.errorCode,args:null,body:null,failureText:null,emittedHrNs:process.hrtime.bigint().toString(),responseHrNs:null,observedDoneHrNs:null,failedHrNs:null};result.requests.push(q);requestMap.set(req,q);rawRows.set(q.id,q);if(['/api/access-logs:list','/api/operations:list-users'].includes(q.path)){q.args=req.postDataJSON();probe.onRequest(req,q);delete q.callId;}}catch(e){fail(e);}}return value;};
   const response=res=>{const q=requestMap.get(res.request());if(!q)return;q.responseAtMs=Date.now();q.responseHrNs=process.hrtime.bigint().toString();track((async()=>{const b=await res.json();if(q.args!==null)q.body=b;while(!state.requests.find(r=>r.id===q.id).endedAtMs)await new Promise(r=>setTimeout(r,1));sync();q.observedDoneHrNs=process.hrtime.bigint().toString();if(res.status()>=400)throw Error('U5_HTTP_'+res.status());})());};
   const requestfailed=req=>{const q=requestMap.get(req);if(!q){fail(Error('U5_FAILED_UNKNOWN_REQUEST'));return;}q.failedAtMs=Date.now();q.failedHrNs=process.hrtime.bigint().toString();q.failureText=req.failure()?.errorText??'unknown';sync();note('requestfailed',q.failureText,q,q.failedAtMs);};
   const consoleError=m=>{if(m.type()==='error')note('console',m.text());},pageerror=e=>note('pageerror',e.error?.()?.message??e.message??String(e));bc.on('response',response);bc.on('requestfailed',requestfailed);bc.on('console',consoleError);bc.on('weberror',pageerror);
   stopObserve=()=>{for(const[e,f]of[['response',response],['requestfailed',requestfailed],['console',consoleError],['weberror',pageerror]])bc.off(e,f);bc.emit=originalEmit;};
   page=await life.acquire('page',()=>bc.newPage());acquisition.page=true;probe=await installBridgeClock(page,bc,()=>state.phase);acquisition.bindings=true;
   const loaded=await page.goto(context.url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.appBridge);await probe.attachBridge();await probe.phase(state.phase);const origin=await page.evaluate(()=>performance.timeOrigin);result.clock={profile:'u5-monotonic-brackets-v1',nodePid:process.pid,browserTimeOriginMs:origin,startedAtMs:start.atMs,startedHrNs:start.hrNs,endedAtMs:null,endedHrNs:null};
   const goto=page.goto;let duplicates=0;page.goto=async function(url){assert(++duplicates===1&&url===context.url&&page.url()===url,'U5_LOGIN_NAVIGATION');return loaded;};try{await performNormalLogin(page,context.url,adminCreds,null,life.registerSecret);}finally{page.goto=goto;}assert(duplicates===1,'U5_LOGIN_GOTO_COUNT');
   const capture=async()=>{state.environment.fontsReadyAtMs=result.observations.fonts.nodeReadAtMs;const s=stamp(),file=path.join(context.runDir,'errors-alert.png');await page.screenshot({path:file,fullPage:true});const b=fs.readFileSync(file),e=stamp();acquisition.capture=true;captureReceipt={path:file,originalPath:file,bytes:b.length,sha256:hash(b),atMs:e.atMs,width:1440,height:900,startedAtMs:s.atMs,startedHrNs:s.hrNs,completedAtMs:e.atMs,completedHrNs:e.hrNs};return captureReceipt;};
   const routes=[];result.routes=routes;const setPhase=p=>{state.setPhase(p);result.phases.push({phase:p,atMs:Date.now()});};
   // Record exact original route registrations in the RAW observer's environment.
   const route=page.route;page.route=async function(url,...args){const value=await route.call(this,url,...args);const originalPush=routes.push;routes.push=function(r){state.environment.routes.push({url:r.url,timeMs:r.registeredAtMs});delete routes.push;return originalPush.call(this,r);};acquisition.routes=true;return value;};
   try{await runErrorScenario({page,result,setPhase,drain,requestMap,probe,context,capture,routes,waitForFontsReady});}finally{page.route=route;}
   await drain();await observer.drain();throw Error('U5_EXPECTED_ORIGINAL_TERMINAL_MISSING');
  },[adminCreds.password]);}catch(e){failure??=e;for(const x of e.cleanupErrors??[])lifeRef?.recordFailure(x,'binding-cleanup','cleanup');throw e;}finally{
   try{await drain();}catch(e){if(e!==failure)note('evidence',e.message);failure??=e;}
   stopObserve?.();sync();const end=stamp();
   // Non-page metadata is copied from original B2, never response/call guesses.
   for(const r of state.requests)if(r.source==='node-fetch')result.requests.push({id:r.id,source:r.source,phase:r.phase,method:r.method,path:new URL(r.url).pathname,atMs:r.startedAtMs,responseAtMs:r.endedAtMs,finishedAtMs:r.endedAtMs,failedAtMs:null,status:r.status,ok:r.ok,errorCode:r.errorCode,args:null,body:null,failureText:null,emittedHrNs:null,responseHrNs:null,observedDoneHrNs:null,failedHrNs:null});
   result.requests.sort((a,b)=>a.id-b.id);if(result.observations.fonts)state.environment.fontsReadyAtMs=result.observations.fonts.nodeReadAtMs;
   facts={collectedAtMs:end.atMs,primaryViewport:{width:1440,height:900},terminalRequestId:result.observations.network?.requestId??null,requests:result.requests,observations:result.observations,ledger:{startedAtMs:start?.atMs??null,startedHrNs:start?.hrNs??null,calls:probe?.calls??[]},routeJournal:result.routeJournal,routes:result.routes,errors:result.errors,lifecycle,clock:result.clock?{...result.clock,endedAtMs:end.atMs,endedHrNs:end.hrNs}:null,capture:captureReceipt,acquisition};
  }
 }};
}
