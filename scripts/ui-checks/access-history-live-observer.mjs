// The canonical adapter observes real traffic; the protected SDK/B2 own execution.
import fs from "node:fs";
import crypto from "node:crypto";
import { types } from "node:util";
import { chromium } from "playwright";
import { selectEvidenceMode } from "./access-history-live-evidence.mjs";

const LIST = "/api/access-logs:list", USERS = "/api/operations:list-users", AUTH = "/api/auth:";
const PUBLIC = ["/api/access-logs:list","/api/operations:list-users","/api/auth:sign-in","/api/auth:change-password","/api/auth:get-session","/api/auth:sign-out"];
const error = code => Object.assign(Error(code),{code});
const requireFact = (v,code="CANONICAL_OBSERVATION") => {if(!v)throw error(code);};
function response(path,body) {
 requireFact(body&&typeof body.ok==="boolean");
 if(!body.ok)return{kind:"failure",errorCode:body.errorCode,message:body.message,dataPresent:false};
 if(path===LIST){requireFact(Array.isArray(body.data));return{kind:"list",rows:body.data.map(r=>Object.fromEntries(["id","userId","loginId","displayName","actionType","actionLabel","role","routeKey","routeLabel","details","occurredAt"].map(k=>[k,r[k]??null]))),responseCount:body.data.length};}
 if(path===USERS){requireFact(Array.isArray(body.data));return{kind:"users",users:body.data.map(r=>Object.fromEntries(["id","loginId","displayName","role","status","createdAt","updatedAt","extensionNumber","contact","email"].map(k=>[k,r[k]??null]))),responseCount:body.data.length};}
 if(path===AUTH+"sign-out"){requireFact(body.data===null);return{kind:"null-success",dataKind:"null"};}
 const s=body.data;return{kind:"auth",dataKind:s===null?"null":"session",...Object.fromEntries(["userId","loginId","displayName","role","passwordChangeRequired"].map(k=>[k,s===null?null:s[k]]))};
}
function executableVersion(filename) {
 const b=fs.readFileSync(filename),key=Buffer.from("VS_VERSION_INFO\0","utf16le"),versions=[];
 for(let at=b.indexOf(key);at>=0;at=b.indexOf(key,at+2)){
  const fixed=(at+key.length+3)&~3;
  if(at>=6&&fixed+52<=b.length&&b.readUInt16LE(at-6)>=fixed+52-(at-6)&&at-6+b.readUInt16LE(at-6)<=b.length&&b.readUInt16LE(at-4)===52&&b.readUInt16LE(at-2)===0&&b.readUInt32LE(fixed)===0xfeef04bd&&b.readUInt32LE(fixed+4)===0x10000){const a=b.readUInt32LE(fixed+8),c=b.readUInt32LE(fixed+12);versions.push([a>>>16,a&65535,c>>>16,c&65535].join('.'));}
 }
 requireFact(new Set(versions).size===1,"CANONICAL_CHROME_VERSION");return versions[0];
}
export function createLiveRun(options) {
 requireFact(options&&!types.isProxy(options)&&Object.getPrototypeOf(options)===Object.prototype&&Object.keys(options).join(',')==="argv","CANONICAL_INPUT");
 const d=Object.getOwnPropertyDescriptor(options,"argv");requireFact(d&&Object.hasOwn(d,"value")&&Array.isArray(d.value),"CANONICAL_INPUT");
 const argv=d.value;requireFact(argv.length>=1&&argv.length<=2&&argv.every(x=>typeof x==="string"),"CANONICAL_INPUT");
 const match=/^--case=([a-z0-9-]+)$/.exec(argv[0]);requireFact(match,"CANONICAL_INPUT");
 const caseName=match[1],canonical=argv.length===2;requireFact(!canonical||caseName==="live-admin"&&argv[1]==="--evidence=canonical-live-v1","CANONICAL_INPUT");
 let state,context,login,Held,b2,pageContext,browserVersion,life;
 let failed=false,reason,cleaning=null,patches=[],heldController=null,heldPage=null,heldHandler=null,heldRows=[],disposedRoutes=0;
 const pending=new Set(),requestRows=new WeakMap(),waiters=new WeakMap(),publicRows=new Map();
 const facts={initial:null,refresh:null,navigation:null,logout:null,visual:null,content:null,frame:null,cleanup:null};
 const failure=(value,kind="execution")=>{if(!failed){failed=true;reason=value;}if(life)life.recordFailure(value,kind==="cleanup"?"observer-dispose":"scenario",kind);};
 const healthy=()=>{if(failed)throw reason;};
 const track=promise=>{
  const p=Promise.resolve(promise);pending.add(p);p.then(()=>pending.delete(p),e=>{pending.delete(p);failure(e);});return p;
 };
 const patch=(object,key,value)=>{const before=Object.getOwnPropertyDescriptor(object,key);Object.defineProperty(object,key,{value,writable:true,configurable:true,enumerable:before?.enumerable??false});patches.push(()=>{if(Object.getOwnPropertyDescriptor(object,key)?.value!==value)throw error("CANONICAL_PATCH_REPLACED");if(before)Object.defineProperty(object,key,before);else delete object[key];});};
 const until=async(predicate)=>{const end=Date.now()+5000;while(!predicate()){healthy();requireFact(Date.now()<end,"CANONICAL_OBSERVATION_TIMEOUT");await new Promise(r=>setTimeout(r,5));}};
 // B2.drain is terminal. Quiescence before/within steps uses the exact RAW rows
 // and actual response-body promises; terminal B2 drain is reserved for the end.
 const drain=async()=>{for(;;){await until(()=>state.requests.every(r=>r.endedAtMs!==null));if(!pending.size)break;await Promise.allSettled([...pending]);}healthy();};
 const rawFor=async request=>{await until(()=>requestRows.has(request));return requestRows.get(request);};
 const makePublic=(r,args,body)=>{
  const p=new URL(r.url).pathname;if(!PUBLIC.includes(p))return;
  requireFact(r.endedAtMs!==null&&r.ok!==null);
  const row={requestId:r.id,source:r.source,method:r.method,path:p,phase:r.phase,startedAtMs:r.startedAtMs,completedAtMs:Date.now(),status:r.status,ok:r.ok,args:p===LIST&&r.source==="page"?args:null,response:response(p,body)};
  publicRows.set(r,row);for(const h of heldRows)if(h.requestId===r.id&&h.completedAtMs===null)h.completedAtMs=row.completedAtMs;
 };
 const onRequest=(request,start)=>{
  if(!new URL(request.url()).pathname.startsWith('/api/'))return;
  try{const appended=state.requests.slice(start),pages=appended.filter(r=>r.source==="page"),r=pages[0];requireFact(pages.length===1&&r.url===request.url()&&r.method===request.method(),"CANONICAL_REQUEST_IDENTITY");requestRows.set(request,r);waiters.get(request)?.resolve(r);}catch(e){failure(e);}
 };
 const onResponse=res=>{
  const p=new URL(res.url()).pathname;if(!PUBLIC.includes(p))return;
  track((async()=>{const r=await rawFor(res.request()),body=await res.json(),ended=await res.finished();requireFact(!ended);await until(()=>r.endedAtMs!==null);makePublic(r,p===LIST?res.request().postDataJSON():null,body);})());
 };
 const cleanup=()=>{
  if(cleaning)return cleaning;
  cleaning=(async()=>{
   const errors=[];
   try{if(heldPage&&heldHandler){await heldPage.unroute('**/api/access-logs:list',heldHandler);heldHandler=null;disposedRoutes++;}if(heldController)await heldController.dispose();}catch(e){errors.push(e);failure(e,"cleanup");}
   const pauseDisposedAtMs=Date.now();try{await drain();await b2.drain();}catch(e){errors.push(e);failure(e,"cleanup");}
   facts.cleanup={pauseDisposedAtMs,observerDrainedAtMs:Date.now(),disposedRoutes,unsettledRoutes:heldController?heldController._active.size:0,unexpectedFulfillCount:0};
   if(pageContext){pageContext.removeListener("request",onRequest);pageContext.removeListener("response",onResponse);}
   if(errors.length)throw errors[0];
  })();cleaning.catch(()=>{});return cleaning;
 };
 const phase=name=>{state.setPhase(name);healthy();};
 const requestIds=()=>state.requests.filter(r=>new URL(r.url).pathname===LIST).map(r=>r.id);
 const publicFor=(phase,p)=>[...publicRows.values()].filter(r=>r.phase===phase&&r.path===p);
 const snapshot=async(page,requestPhase)=>{
  await drain();const l=publicFor(requestPhase,LIST).at(-1),u=publicFor(requestPhase,USERS).at(-1);requireFact(l&&u);
  const dom=await page.evaluate(()=>({atMs:Date.now(),activityDomCount:document.querySelectorAll('.access-history-container').length,tableCount:document.querySelectorAll('#table-access-logs').length,title:document.querySelector('#header-current-title')?.textContent??'',countText:document.querySelector('#access-history-count-label')?.textContent??'',rows:[...document.querySelectorAll('#table-access-logs-body tr')].map(r=>({id:r.id,cells:[...r.querySelectorAll('td')].map(c=>({text:c.textContent,title:c.getAttribute('title')}))})),headers:[...document.querySelectorAll('#table-access-logs th')].map(e=>({text:e.textContent,scope:e.scope}))}));
  return{...dom,listRequestId:l.requestId,usersRequestId:u.requestId};
 };
 const frame=page=>page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};},t=getComputedStyle(document.querySelector('#header-current-title')),c=getComputedStyle(document.querySelector('#main-content'));
  return{atMs:Date.now(),sidebar:rect('.sidebar'),header:rect('.header-bar'),footer:rect('.footer-statusbar'),title:{fontSize:parseFloat(t.fontSize),fontWeight:Number(t.fontWeight)},content:{paddingTop:parseFloat(c.paddingTop),paddingRight:parseFloat(c.paddingRight),paddingBottom:parseFloat(c.paddingBottom),paddingLeft:parseFloat(c.paddingLeft),gap:parseFloat(c.gap)},activityGap:parseFloat(getComputedStyle(document.querySelector('.access-history-container')).gap)};
 });
 const readFacts=()=>{
  healthy();requireFact(facts.cleanup,"CANONICAL_CLEANUP");
  return structuredClone({collectedAtMs:Date.now(),requests:[...publicRows.values()].filter(r=>r.startedAtMs>=state.steps.enteredAtMs).sort((a,b)=>a.requestId-b.requestId),...facts});
 };
 const controller={caseName,canonical,validate(execution,contract){requireFact(selectEvidenceMode(argv,execution)===(canonical?"canonical-live-v1":"legacy")&&contract&&typeof contract.evidenceSchema==="string");},bind(s,ctx,sdk,observer,performLogin,HeldRouteController){
  state=s;context=ctx;login=performLogin;Held=HeldRouteController;
  controller.sdkRunner=sdk;controller.browserObserver=observer;
  if(!canonical)return;
  const originalFetch=state.fetch;
  patch(state,"fetch",function(...args){const index=state.requests.length,promise=originalFetch.apply(this,args),r=state.requests[index];requireFact(r&&r.source==="node-fetch","CANONICAL_NODE_IDENTITY");return track(Promise.resolve(promise).then(result=>{makePublic(r,null,result.data);return result;}));});
  const installLaunch=()=>{const launch=chromium.launch;
   patch(chromium,"launch",async function(...args){const browser=await launch.apply(this,args);browserVersion=browser.version();const newContext=browser.newContext;
    patch(browser,"newContext",async function(...args){const ctx=await newContext.apply(this,args);requireFact(!pageContext,"CANONICAL_DUPLICATE_CONTEXT");pageContext=ctx;
     // B2 appends synchronously during this exact request emission. Observe the
     // append range after its listeners finish; node rows may interleave safely.
     const emit=ctx.emit;patch(ctx,"emit",function(event,...args){const start=state.requests.length,result=emit.call(this,event,...args);if(event==="request"&&args[0].url().startsWith(context.url+"api/"))onRequest(args[0],start);return result;});ctx.on("response",onResponse);
     const close=ctx.close;let closing=null;patch(ctx,"close",function(...args){if(!closing)closing=(async()=>{let failed=false,reason;try{await cleanup();}catch(e){failed=true;reason=e;}try{await close.apply(this,args);}catch(e){if(!failed){failed=true;reason=e;}}if(failed)throw reason;})();return closing;});return ctx;
    });return browser;
   });
  };
  controller.sdkRunner=config=>{installLaunch();return sdk({...config,steps:async(...args)=>{await drain();return config.steps(...args);}});};
  controller.browserObserver=(s,task)=>observer(s,async original=>{
   b2=original;
   try{return await task(original);}finally{
    try{await cleanup();}catch(e){failure(e,"cleanup");}
    for(const restore of patches.reverse())try{restore();}catch(e){failure(e,"cleanup");}
    patches=[];healthy();
   }
  });
 },sdkRunner:null,browserObserver:null,async run({page,capture,waitForFontsReady,observation,life:currentLife},adminCreds){
  requireFact(canonical&&state&&pageContext,"CANONICAL_MODE");life=currentLife;healthy();
  const settled=async()=>{await page.locator('#table-access-logs').waitFor();await page.waitForFunction(()=>!document.querySelector('#btn-refresh-logs')?.disabled);await drain();};
  const enter=async()=>{await page.getByRole('button',{name:'활동 이력',exact:true}).click();await settled();};
  phase("signin");await login(page,context.url,adminCreds,null,life.registerSecret);await drain();
  phase("initial");await enter();facts.initial=await snapshot(page,"initial");
  phase("refresh");heldPage=page;heldController=new Held(state);const adapters=new WeakMap();
  heldHandler=route=>{
   let adapter=adapters.get(route);if(!adapter){const record={requestId:null,heldAtMs:null,releasedAtMs:null,continuedAtMs:null,completedAtMs:null,terminal:"continue"};heldRows.push(record);
    adapter={fulfill:async()=>{requireFact(facts.refresh&&record.releasedAtMs!==null);await route.continue();record.continuedAtMs=Date.now();},abort:async()=>{record.terminal="abort";await route.abort();}};adapters.set(route,adapter);
    return track((async()=>{const raw=await rawFor(route.request());record.requestId=raw.id;record.heldAtMs=Date.now();await heldController.handle(adapter);})());
   }return heldController.handle(adapter);
  };
  await page.route('**/api/access-logs:list',heldHandler);const before=requestIds(),clickAtMs=Date.now();
  await page.locator('#btn-refresh-logs').click();await heldController.waitForStart();
  const disabled=await page.evaluate(()=>({atMs:Date.now(),refresh:document.querySelector('#btn-refresh-logs').disabled,reset:document.querySelector('#btn-filter-reset').disabled})),attempts=[];
  for(const[target,id]of [["refresh","btn-refresh-logs"],["reset","btn-filter-reset"]])for(const kind of ["mouse","dispatch"]){const requestIdsBefore=requestIds(),atMs=Date.now();
   if(kind==="mouse"){const box=await page.locator('#'+id).boundingBox();requireFact(box);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);}else await page.locator('#'+id).evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));attempts.push({atMs,target,kind,requestIdsBefore,requestIdsAfter:requestIds()});
  }
  // Monotonic phase boundary: observe a fresh clock tick before releasing the route.
  await page.waitForTimeout(2);const releaseAtMs=Date.now();for(const h of heldRows)if(h.releasedAtMs===null)h.releasedAtMs=releaseAtMs;
  facts.refresh={clickAtMs,firstRequestId:heldRows[0].requestId,held:heldRows,disabledAtMs:disabled.atMs,refreshNativeDisabled:disabled.refresh,resetNativeDisabled:disabled.reset,attempts,releaseAtMs,settledAtMs:null,refreshEnabledAfter:false,resetEnabledAfter:false,requestIdsBefore:before,requestIdsDuring:requestIds(),requestIdsAfter:[]};
  heldController.release();await heldController.waitForComplete();await settled();
  const enabled=await page.evaluate(()=>({refresh:!document.querySelector('#btn-refresh-logs').disabled,reset:!document.querySelector('#btn-filter-reset').disabled}));Object.assign(facts.refresh,{settledAtMs:Date.now(),refreshEnabledAfter:enabled.refresh,resetEnabledAfter:enabled.reset,requestIdsAfter:requestIds()});
  await page.unroute('**/api/access-logs:list',heldHandler);heldHandler=null;disposedRoutes++;await heldController.dispose();
  phase("home");const homeClickAtMs=Date.now();await page.getByRole('button',{name:'홈',exact:true}).click();await page.locator('.home-container').waitFor();await drain();
  const home=await page.evaluate(()=>({homeActivityDomCount:document.querySelectorAll('.access-history-container').length,homeTableCount:document.querySelectorAll('#table-access-logs').length}));home.homeAtMs=Date.now();
  phase("reentry");const reentryClickAtMs=Date.now();await enter();facts.navigation={homeClickAtMs,...home,reentryClickAtMs,reentry:await snapshot(page,"reentry")};
  const expanded=await frame(page),keyboard=[];const toggle=page.getByRole('button',{name:'사이드바 접기/펼치기',exact:true});
  await toggle.focus();keyboard.push({key:"Enter",target:"sidebar-toggle",atMs:Date.now()});await page.keyboard.press('Enter');await page.waitForFunction(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width-64)<=1);const collapsed=await frame(page);
  keyboard.push({key:"Space",target:"sidebar-toggle",atMs:Date.now()});await page.keyboard.press('Space');await page.waitForFunction(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width-220)<=1);facts.frame={expanded,collapsed,restored:await frame(page),keyboard};
  phase("auxiliary-content");await page.setViewportSize({width:640,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const wrapper=page.getByLabel('활동 이력 목록 표 가로 스크롤 영역',{exact:true});await wrapper.focus();const focusAtMs=Date.now();
  const scroll=()=>wrapper.evaluate(e=>({clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft}));const scrollBefore=await scroll();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('.access-history-table-wrapper').scrollLeft>0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const scrollAfter=await scroll(),focused=await wrapper.evaluate(e=>e===document.activeElement),contentTable=await snapshot(page,"reentry");facts.content={atMs:Date.now(),table:contentTable,scroll:{focusAtMs,focused,key:"ArrowRight",before:scrollBefore,after:scrollAfter},overflowScenario:{kind:"auxiliary-real",viewport:page.viewportSize(),dataRequestId:contentTable.listRequestId}};
  await page.setViewportSize({width:1440,height:900});await waitForFontsReady(15000);state.environment.fontsReadyAtMs=Date.now();
  const fonts=await page.evaluate(()=>({status:document.fonts.status,atMs:Date.now(),activityDomCount:document.querySelectorAll('.access-history-container').length,title:document.querySelector('#header-current-title')?.textContent??''})),capturePath=await capture('live-admin'),bytes=fs.readFileSync(capturePath);
  facts.visual={chromePath:state.environment.chrome.path,chromeFileVersion:executableVersion(state.environment.chrome.path),chromeRuntimeVersion:browserVersion,viewport:page.viewportSize(),fontsReadyAtMs:fonts.atMs,fontsStatus:fonts.status,capture:{artifactId:"normal-capture-live-admin",atMs:Date.now(),sha256:crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),activityDomCount:fonts.activityDomCount,title:fonts.title}};
  const cookie=(await pageContext.cookies()).find(c=>c.name==="sm_session");requireFact(cookie,"CANONICAL_OLD_SESSION");await life.registerSecret(cookie.value);
  const headers={Origin:context.url.slice(0,-1),Cookie:cookie.name+'='+cookie.value,"Content-Type":"application/json"};
  const probe=async(endpoint,args)=>{const result=await state.fetch(context.url.slice(0,-1)+endpoint,{method:"POST",headers,body:JSON.stringify(args)});await drain();return result;};
  phase("before-logout-probe");await probe(AUTH+"get-session",[]);const beforeSession=publicFor("before-logout-probe",AUTH+"get-session").at(-1);
  phase("logout");const signOutClickAtMs=Date.now();await page.locator('.btn-logout').click();await page.locator('#login-id').waitFor();await drain();
  const dom=await page.evaluate(()=>({loginCount:document.querySelectorAll('#login-id').length,activityDomCount:document.querySelectorAll('.access-history-container').length,tableCount:document.querySelectorAll('#table-access-logs').length}));dom.loginAtMs=Date.now();
  phase("after-logout-probe");await probe(AUTH+"get-session",[]);await probe(LIST,[{}]);
  facts.logout={signOutClickAtMs,signOutRequestId:publicFor("logout",AUTH+"sign-out").at(-1).requestId,...dom,sessionBeforeRequestId:beforeSession.requestId,sessionAfterRequestId:publicFor("after-logout-probe",AUTH+"get-session").at(-1).requestId,protectedAfterRequestId:publicFor("after-logout-probe",LIST).at(-1).requestId,replayedSameSession:true};
  await drain();await observation.drain();healthy();
 },publication:canonical?{mode:"canonical-live-v1",readFacts}:null};
 return controller;
}
