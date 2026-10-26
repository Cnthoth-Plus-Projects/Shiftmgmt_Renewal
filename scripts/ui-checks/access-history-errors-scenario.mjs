// Actual DOM/actions and original Bridge settlements; Sol takeover.
export async function runErrorScenario({page,result,setPhase,drain,requestMap,probe,context,capture,routes,waitForFontsReady}) {
 const LIST='/api/access-logs:list',USERS='/api/operations:list-users',plans=new Map([[LIST,[]],[USERS,[]]]),holds=new Set();
 result.routeJournal=[];
 const requireFact=(b,m)=>{if(!b)throw Error(m);};
 const wait=async(fn,label)=>{const end=Date.now()+6000;while(!fn()){if(Date.now()>end)throw Error('WAIT:'+label);await new Promise(r=>setTimeout(r,5));}};
 const rows=(p=LIST)=>result.requests.filter(r=>r.path===p);
 const phase=async name=>{setPhase(name);await probe.phase(name);};
 const stamp=()=>({atMs:Date.now(),hrNs:process.hrtime.bigint().toString()});
 const snap=async()=>{const begin=stamp();const value=await page.evaluate(()=>{
  const one=s=>document.querySelector(s),many=s=>[...document.querySelectorAll(s)],button=s=>{const b=one(s);return{count:many(s).length,disabled:b?.disabled??null,ariaDisabled:b?.getAttribute('aria-disabled')??null,text:b?.textContent??null,connected:b?.isConnected??false};};
  return{atMs:Date.now(),perfMs:performance.now(),timeOriginMs:performance.timeOrigin,alerts:many('.access-history-alert-banner').map(e=>({text:e.textContent,role:e.getAttribute('role')})),warnings:many('.access-history-users-warning').map(e=>({text:e.textContent,role:e.getAttribute('role')})),retryLogs:button('#btn-retry-logs'),retryUsers:button('#btn-retry-users'),refresh:button('#btn-refresh-logs'),reset:button('#btn-filter-reset'),loading:many('.access-history-loading-banner').length,g2:many('#state-g2-empty,.access-history-empty-state').length,table:many('#table-access-logs').length,rows:many('#table-access-logs-body tr').map(e=>e.id),count:one('#access-history-count-label')?.textContent??null,loginId:one('#filter-user-select')?.value??null,userOptions:many('#filter-user-select option').map(e=>({value:e.value,text:e.textContent})),from:one('#filter-date-from')?.value??null,to:one('#filter-date-to')?.value??null,keyword:one('#filter-keyword-input')?.value??null,dateError:one('#filter-date-error-desc')?.textContent??null,xssCounter:window.__u5Xss??null,injectedImages:many('.access-history-alert-container img').length};
 });const end=stamp();return{...value,nodeStartedAtMs:begin.atMs,nodeStartedHrNs:begin.hrNs,nodeReadAtMs:end.atMs,nodeReadHrNs:end.hrNs};};
 const ready=async()=>{await page.waitForFunction(()=>!document.querySelector('.access-history-loading-banner')&&!document.querySelector('#btn-refresh-logs')?.disabled);await drain();};
 const screenshot=async()=>capture();
 const requestDone=async h=>{await wait(()=>{const r=result.requests.find(r=>r.id===h.requestId);return r?.finishedAtMs||r?.failedAtMs;},'actual request completion');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const newHold=label=>{let release;const h={label,startedAtMs:null,releasedAtMs:null,continuedAtMs:null,requestId:null,gate:new Promise(r=>release=r)};h.release=()=>{if(h.releasedAtMs===null){h.releasedAtMs=Date.now();h.releasedHrNs=process.hrtime.bigint().toString();release();}};holds.add(h);return h;};
 const put=(p,...actions)=>{requireFact(plans.get(p).length===0,'unconsumed route plan');plans.set(p,actions);};
 const handle=async route=>{
  const request=route.request(),endpoint=new URL(request.url()).pathname;
  requireFact(request.method()==='POST'&&new URL(request.url()).origin===new URL(context.url).origin,'route ownership');
  await wait(()=>requestMap.has(request),'exact Request identity');const row=requestMap.get(request),action=plans.get(endpoint).shift()??{kind:'continue'};
  const event={id:'route-'+(result.routeJournal.length+1),requestId:row.id,phase:row.phase,path:endpoint,method:request.method(),kind:action.kind,atMs:Date.now(),completedAtMs:null};result.routeJournal.push(event);
  if(action.hold){const h=action.hold;h.requestId=row.id;h.startedAtMs=Date.now();h.startedHrNs=process.hrtime.bigint().toString();await h.gate;h.continuedAtMs=Date.now();h.continuedHrNs=process.hrtime.bigint().toString();}
  if(action.kind==='failure'){
   event.response=action.response;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(action.response)});
  }else if(action.kind==='abort'){event.abortCode='aborted';await route.abort('aborted');}
  else await route.continue();
  event.completedAtMs=Date.now();
 };
 const mouse=async id=>{const b=await page.locator('#'+id).boundingBox();requireFact(b,'missing native button '+id);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);};
 const counts=()=>({list:rows().length,users:rows(USERS).length,lastRequestId:result.requests.at(-1)?.id??null,...stamp()});
 const duplicate=async id=>{
  const before=counts(),count=await page.locator('#'+id).count(),actions=[];
  if(count===1)for(const mode of ['mouse1','mouse2','element-click','dispatch-click']){
   const native=await page.locator('#'+id).evaluate(b=>({connected:b.isConnected,disabled:b.disabled})),a=counts();
   if(mode.startsWith('mouse'))await mouse(id);else if(mode==='element-click')await page.locator('#'+id).evaluate(b=>b.click());else await page.locator('#'+id).evaluate(b=>b.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   await page.evaluate(async()=>{await Promise.resolve();});await drain();const b=counts();actions.push({mode,target:id,atMs:a.atMs,startedAtMs:a.atMs,startedHrNs:a.hrNs,endedAtMs:b.atMs,endedHrNs:b.hrNs,beforeLastRequestId:a.lastRequestId,afterLastRequestId:b.lastRequestId,listBefore:a.list,usersBefore:a.users,listAfter:b.list,usersAfter:b.users,...native});
  }
  await page.waitForTimeout(300);await drain();return{before,after:counts(),buttonExisted:count===1,actions};
 };
 const input=async(field,value)=>{
  const index=await page.evaluate(()=>window.__u5Inputs.length),begin=stamp();await page.locator('#'+field).fill(value);
  const info=await page.evaluate(({index,field,value})=>{const events=window.__u5Inputs.slice(index).filter(e=>e.field===field&&e.value===value);if(events.length!==1)throw Error('OWNED_INPUT_EVENT_COUNT');return events[0];},{index,field,value});const end=stamp();return{...info,nodeStartedAtMs:begin.atMs,nodeStartedHrNs:begin.hrNs,nodeReadAtMs:end.atMs,nodeReadHrNs:end.hrNs};
 };
 const stable=async()=>{await ready();await page.waitForTimeout(320);await drain();};
 const hdata=h=>Object.fromEntries(Object.entries(h).filter(([k])=>!['gate','release'].includes(k)));
 const payload={ok:false,errorCode:'DATABASE_ERROR',message:'데이터베이스 연결 실패 <img src=x onerror="window.__u5Xss=(window.__u5Xss||0)+1">'};
 const userPayload={ok:false,errorCode:'DATABASE_ERROR',message:'사용자 목록을 불러오지 못했습니다.'};
 let originalFrom;
 try{
 await page.evaluate(()=>{window.__u5Xss=0;window.__u5Inputs=[];window.__u8InputListener=e=>{if(['filter-keyword-input','filter-date-from'].includes(e.target.id))window.__u5Inputs.push({atMs:Date.now(),perfMs:performance.now(),timeOriginMs:performance.timeOrigin,field:e.target.id,value:e.target.value});};document.addEventListener('input',window.__u8InputListener,true);});
 for(const url of ['**/api/access-logs:list','**/api/operations:list-users']){await page.route(url,handle);routes.push({url,registeredAtMs:Date.now(),disposedAtMs:null});}
 await page.getByRole('button',{name:'활동 이력',exact:true}).click();
  await stable();result.observations.initial=await snap();originalFrom=result.observations.initial.from;
  const selected=result.observations.initial.userOptions.find(o=>o.value!=='all');requireFact(selected,'actual selectable user absent');
  await phase('select-existing-user');await page.locator('#filter-user-select').selectOption(selected.value);await stable();result.observations.selected=await snap();
  await phase('database-failure');put(LIST,{kind:'failure',response:payload});await page.locator('#btn-refresh-logs').click();await stable();result.observations.database={payload,snapshot:await snap(),requests:rows().map(r=>r.id)};

  await phase('logs-retry-held');const retryHold=newHold('logs-retry');put(LIST,{kind:'failure',response:payload,hold:retryHold});
  const retryBefore=counts();await page.locator('#btn-retry-logs').click();await wait(()=>retryHold.startedAtMs,'held retry');
  const retryBusy=await snap(),retryDup=await duplicate('btn-retry-logs');retryHold.release();await requestDone(retryHold);await stable();
  result.observations.logsRetry={before:retryBefore,busy:retryBusy,duplicates:retryDup,hold:hdata(retryHold),after:await snap()};

  await phase('users-independent-failure');put(USERS,{kind:'failure',response:userPayload});await page.locator('#btn-refresh-logs').click();await stable();
  result.observations.usersFailure={expectedLoginId:selected.value,snapshot:await snap(),listRequestId:rows().at(-1).id,usersRequestId:rows(USERS).at(-1).id};
  await phase('users-retry-held');const usersHold=newHold('users-retry'),listHold=newHold('list-with-users-retry');put(USERS,{kind:'continue',hold:usersHold});put(LIST,{kind:'continue',hold:listHold});
  const usersBefore=counts();await page.locator('#btn-retry-users').click();await wait(()=>usersHold.startedAtMs&&listHold.startedAtMs,'two held channels');
  const usersBusy=await snap(),usersDup=await duplicate('btn-retry-users');usersHold.release();listHold.release();await requestDone(usersHold);await requestDone(listHold);await stable();
  result.observations.usersRetry={before:usersBefore,busy:usersBusy,duplicates:usersDup,usersHold:hdata(usersHold),listHold:hdata(listHold),after:await snap()};

  await phase('invalid-during-held');const invalidHold=newHold('invalid-old');put(LIST,{kind:'continue',hold:invalidHold});await page.locator('#btn-refresh-logs').click();await wait(()=>invalidHold.startedAtMs,'invalid old hold');
  const invalidCalls=await probe.emitted('invalid-during-held'),invalidOldIds=invalidCalls.map(c=>c.id);const invalidBefore=counts(),invalidInput=await input('filter-date-from','2099-12-31');await page.waitForTimeout(350);await drain();const invalidDuring=await snap();
  invalidHold.release();await probe.settled(invalidOldIds);await requestDone(invalidHold);await page.waitForTimeout(320);await drain();result.observations.invalid={before:invalidBefore,oldCallIds:invalidOldIds,input:invalidInput,during:invalidDuring,after:await snap(),afterCounts:counts(),hold:hdata(invalidHold)};
  await phase('manual-valid-recovery');await page.locator('#filter-date-from').fill(originalFrom);await stable();

  result.observations.generations=[];
  for(const variant of ['before250','afterNewHeld']){
   const oldPhase='generation-'+variant+'-old';await phase(oldPhase);const oldHold=newHold(variant+'-old'),newHoldCase=newHold(variant+'-new');put(LIST,{kind:'continue',hold:oldHold},{kind:'continue',hold:newHoldCase});
   await page.locator('#btn-refresh-logs').click();await wait(()=>oldHold.startedAtMs,'generation old');const oldCalls=await probe.emitted(oldPhase),oldCallIds=oldCalls.map(c=>c.id);
   await phase('generation-'+variant+'-new');const inputFact=await input('filter-keyword-input','실제 경합 '+variant);let beforeNew=null;
   if(variant==='before250'){oldHold.release();await probe.settled(oldCallIds);beforeNew=await snap();requireFact(beforeNew.perfMs-inputFact.perfMs<250&&!newHoldCase.startedAtMs,'before250 branch not exercised');}
   await wait(()=>newHoldCase.startedAtMs,'new generation actual request');const newBusy=await snap();
   if(variant==='afterNewHeld'){oldHold.release();await probe.settled(oldCallIds);}
   const afterOld=await snap();newHoldCase.release();await requestDone(newHoldCase);await stable();
   result.observations.generations.push({variant,input:inputFact,oldCallIds,beforeNew,newBusy,afterOld,oldHold:hdata(oldHold),newHold:hdata(newHoldCase),after:await snap()});
  }
  await phase('prepare-network');await page.locator('#filter-keyword-input').fill('');await stable();
  await phase('network-terminal');put(LIST,{kind:'abort'});await page.locator('#filter-date-from').fill('2000-01-01');await stable();
  const abort=result.routeJournal.find(e=>e.kind==='abort');requireFact(abort,'real abort missing');await wait(()=>result.requests.find(r=>r.id===abort.requestId)?.failedAtMs,'actual requestfailed');
  result.observations.network={requestId:abort.requestId,route:abort,snapshot:await snap()};await probe.drain();const fontBegin=stamp();await waitForFontsReady(page,15000);const font=await page.evaluate(async()=>{await document.fonts.ready;return{status:document.fonts.status,atMs:Date.now(),perfMs:performance.now(),timeOriginMs:performance.timeOrigin};}),fontEnd=stamp();result.observations.fonts={...font,nodeStartedAtMs:fontBegin.atMs,nodeStartedHrNs:fontBegin.hrNs,nodeReadAtMs:fontEnd.atMs,nodeReadHrNs:fontEnd.hrNs};result.capture=await screenshot('errors-network');
 }finally{
  const errors=[];const attempt=async f=>{try{await f();}catch(e){errors.push(String(e.message),...(e.cleanupErrors??[]).map(x=>String(x.message)));}};
  for(const h of holds)await attempt(()=>h.release());
  for(const r of routes)await attempt(async()=>{await page.unroute(r.url,handle);r.disposedAtMs=Date.now();});
  let restored={};await attempt(async()=>{restored=await probe.restore();});await attempt(()=>page.evaluate(()=>document.removeEventListener('input',window.__u8InputListener,true)));await attempt(drain);result.observations.cleanup={errors,atMs:Date.now(),hrNs:process.hrtime.bigint().toString(),...restored,pendingHolds:[...holds].filter(h=>h.releasedAtMs===null).length};
 }
}

// Appended to the existing allowed errors-scenario module; no imports or IO.
export function ownerCodec(privacy,execution,baseline){
 if(typeof privacy!=='function'||![execution,baseline].every(v=>typeof v==='string'&&/^[A-F0-9]{64}$/.test(v)))throw Error('OWNER_PUBLIC_PROOF');
 const raw=v=>JSON.rawJSON(JSON.stringify(v));
 return{
  r:o=>function(k,v){return this===o.adjudication?.process?.argv&&((k==3&&v===execution)||(k==5&&v===baseline))?raw(v):v},
  s(base,candidate){
   const pending=[],masked=[];let size=0,overflow=false,ended=false;
   return{
    push(chunk){const safe=base.push(chunk);if(overflow)return safe;masked.push(safe);size+=chunk.length;if(size>1048576){overflow=true;pending.length=0;return Buffer.concat(masked.splice(0));}pending.push(Buffer.from(chunk));return Buffer.alloc(0)},
    flush(){
     const tail=base.flush();if(ended)return tail;ended=true;if(overflow)return tail;masked.push(tail);
     try{
      const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(pending)),o=JSON.parse(text);let compact='',quoted=false,escaped=false;
      for(const c of text){if(quoted){compact+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"'){quoted=true;compact+=c;}else if(!' \t\r\n'.includes(c))compact+=c;}
      // Comparing lexical JSON to its parse preserves duplicate-key, number,
      // escape and trailing-data failures instead of normalizing them away.
      if(compact!==JSON.stringify(o)||!o||Object.keys(o).sort().join(',')!=='result,status'||o.status!=='PASS'||!o.result||Array.isArray(o.result)||typeof o.result!=='object')throw Error('OWNER_PUBLIC_LOG');
      const r=o.result,c=r.candidateSha256===candidate,e=r.executionSha256===execution;if(!c&&!e)throw Error('OWNER_PUBLIC_LOG');
      const result=privacy(o,function(k,v){return this===r&&((k==='candidateSha256'&&c&&v===candidate)||(k==='executionSha256'&&e&&v===execution))?raw(v):v});return Buffer.from(result);
     }catch{return Buffer.concat(masked)}
     finally{pending.length=0;masked.length=0;}
    }
   };
  }
 };
}
