// scripts/ui-checks/access-history-list-observer.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { inspectG1Properties } from "./access-history-g1.mjs";
import { selectEvidenceMode } from "./access-history-list-evidence.mjs";

const CASE = "list-fixture";
const MODE = "canonical-list-v1";
const LIST_PATH = "/api/access-logs:list";

const ACTIONS = [
  "performance-approve", "performance-reapprove", "performance-hide-approved",
  "schedule-publish", "sign-in", "route-view", "performance-reject", "site-save"
];
const ACTION_LABELS = {
  "performance-approve": "실적 승인",
  "performance-reapprove": "실적 승인 확정",
  "performance-hide-approved": "승인완료 목록삭제",
  "schedule-publish": "근무표 배포",
  "sign-in": "로그인",
  "route-view": "화면 이동",
  "performance-reject": "실적 반려",
  "site-save": "근무지 저장"
};
const PAYLOAD = '<img src=x onerror="window.__listXss++"><script>window.__listXss++</script>';

function buildFixture(labels) {
  const rows = Array.from({ length: 201 }, (_, i) => ({
    id: `list-u2-${i + 1}`,
    userId: `user-${i % 10 + 1}`,
    loginId: `user${i % 10 + 1}`,
    displayName: `사용자${i % 10 + 1}`,
    role: ["admin", "operator", "planner", "reviewer"][i % 4],
    actionType: ACTIONS[i % 8],
    actionLabel: labels[ACTIONS[i % 8]],
    routeKey: `route-${i % 5 + 1}`,
    routeLabel: `화면 ${i % 5 + 1}`,
    details: `상세 활동 내용 ${i + 1}`,
    occurredAt: new Date(Date.parse("2026-09-15T12:00:00.000Z") - i * 60000).toISOString()
  }));
  rows[0].displayName = "긴 사용자 이름 ".repeat(16);
  rows[0].details = "상세 활동 내용 원문 ".repeat(80);
  rows[8].occurredAt = "invalid-time-original";
  rows[9].occurredAt = "";
  rows[10].routeLabel = "  화면 양끝 공백  ";
  rows[10].details = "  상세 양끝 공백  ";
  rows[11].routeLabel = "  ";
  rows[11].details = "";
  rows[12].displayName = "";
  rows[13].displayName = PAYLOAD;
  rows[13].details = PAYLOAD;
  rows[14].routeLabel = PAYLOAD;
  return rows;
}

function sha(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function requireFact(cond, code = "CANONICAL_INPUT") {
  if (!cond) {
    const e = new Error(code);
    e.code = code;
    throw e;
  }
}

export function createListRun(options) {
  try{inspectG1Properties(options,"options",{isRecord:true,keys:["argv"]});inspectG1Properties(options.argv,"argv",{isArray:true});}catch{requireFact(false,"CANONICAL_INPUT");}
  const argv=options.argv;
  requireFact(argv.length>=1&&argv.length<=2&&argv.every(x=>typeof x==="string"),"CANONICAL_INPUT");
  const match = /^--case=([a-z0-9-]+)$/.exec(argv[0]);
  requireFact(match && match[1] === CASE, "CANONICAL_INPUT");
  const canonical = argv.length === 2;
  requireFact(!canonical || argv[1] === "--evidence=" + MODE, "CANONICAL_INPUT");

  let state, context, runScreenCheck, withNormalBrowserObservation, performLogin, HeldRouteController;
  let pageContext = null;
  let b2 = null;
  let activePage = null;
  let activeRouteHandler = null;
  let activeRouteUrl = null;
  let actualFixtureResponse = null;
  const errors = [];
  const patches = [];
  const pending = new Set();
  const requestMap = new WeakMap();
  const publicRequests = [];
  let collectedFacts = null;

  let cleaning=null,life=null,failed=false,reason=null,keyListenerPage=null,routeFacts=null;
  const failure=(value,kind="execution")=>{
    if(!failed){failed=true;reason=value;}
    errors.push({type:kind,message:String(value?.message||value)});
    if(life)life.recordFailure(value,kind==="cleanup"?"observer-dispose":"scenario",kind);
  };
  const healthy=()=>{if(failed)throw reason;};
  const patch=(object,key,value)=>{
    const before=Object.getOwnPropertyDescriptor(object,key);
    Object.defineProperty(object,key,{value,writable:true,configurable:true,enumerable:before?.enumerable??false});
    patches.push(()=>{requireFact(Object.getOwnPropertyDescriptor(object,key)?.value===value,"CANONICAL_PATCH_REPLACED");if(before)Object.defineProperty(object,key,before);else delete object[key];});
  };
  const track=promise=>{const p=Promise.resolve(promise);pending.add(p);p.then(()=>pending.delete(p),e=>{pending.delete(p);failure(e);});return p;};
  const until=async predicate=>{const end=Date.now()+5000;while(!predicate()){requireFact(Date.now()<end,"CANONICAL_OBSERVATION_TIMEOUT");await new Promise(r=>setTimeout(r,5));}};
  const drain=async()=>{for(;;){await until(()=>state.requests.every(r=>r.endedAtMs!==null));if(!pending.size)break;await Promise.allSettled([...pending]);}healthy();};
  const rawFor=async req=>{await until(()=>requestMap.has(req));return requestMap.get(req);};
  const onRequest=(req,start)=>{
    try{
      if(!new URL(req.url()).pathname.startsWith("/api/"))return;
      const appended=state.requests.slice(start).filter(r=>r.source==="page");
      requireFact(appended.length===1&&appended[0].url===req.url()&&appended[0].method===req.method(),"CANONICAL_REQUEST_IDENTITY");
      const r=appended[0];requestMap.set(req,r);
      publicRequests.push({id:r.id,source:r.source,phase:r.phase,method:r.method,path:new URL(r.url).pathname,atMs:r.startedAtMs,responseAtMs:null,finishedAtMs:null,status:null,ok:null,args:new URL(r.url).pathname===LIST_PATH?req.postDataJSON():null,body:null,finishedError:null});
    }catch(e){failure(e);}
  };
  const onResponse=res=>{
    if(!new URL(res.url()).pathname.startsWith("/api/"))return;
    const responseAtMs=Date.now();
    track((async()=>{
      const r=await rawFor(res.request()),q=publicRequests.find(q=>q.id===r.id);requireFact(q,"CANONICAL_REQUEST_IDENTITY");
      q.responseAtMs=Math.max(responseAtMs,r.startedAtMs);
      let body=null;
      try{body=await res.json();}catch(e){failure(e,"response-json");}
      let finishFailed=false;
      try{const e=await res.finished();if(e)throw e;}catch(e){finishFailed=true;q.finishedError=String(e?.message||e);failure(e,"response-finished");}
      await until(()=>r.endedAtMs!==null);
      q.status=r.status;q.ok=r.ok;
      if(!finishFailed)q.finishedAtMs=Date.now();
      if(q.path===LIST_PATH){q.body=body;if(body&&Array.isArray(body.data))actualFixtureResponse=body.data;}
    })());
  };
  const cleanup=()=>{
    if(cleaning)return cleaning;
    cleaning=(async()=>{
      const failures=[];
      const attempt=async task=>{try{await task();}catch(e){failures.push(e);failure(e,"cleanup");}};
      await attempt(async()=>{if(activePage&&activeRouteHandler&&activeRouteUrl){await activePage.unroute(activeRouteUrl,activeRouteHandler);activeRouteHandler=null;if(routeFacts){routeFacts.disposed=true;routeFacts.disposedAtMs=Date.now();}}});
      await attempt(async()=>{if(keyListenerPage){await keyListenerPage.evaluate(()=>{document.removeEventListener("keydown",window.__listKeyHandler,true);delete window.__listKeyHandler;});keyListenerPage=null;}});
      await attempt(drain);
      await attempt(async()=>{if(b2)await b2.drain();});
      await attempt(async()=>{if(pageContext)pageContext.removeListener("response",onResponse);});
      if(failures.length)throw failures[0];
    })();cleaning.catch(()=>{});return cleaning;
  };

  const validate = (execution, contract) => {
    requireFact(contract&&typeof contract.evidenceSchema==="string","CANONICAL_INPUT");
    if(canonical)requireFact(selectEvidenceMode(argv,execution)===MODE,"CANONICAL_REGISTRY");
  };

  const publication = {
    mode: MODE,
    readFacts() {
      requireFact(collectedFacts !== null, "CANONICAL_INTEGRITY");
      collectedFacts.fixtureResponse=actualFixtureResponse;
      collectedFacts.requests.sort((a,b)=>a.id-b.id);
      if (state && Array.isArray(state.captures) && state.captures.length > 0) {
        const origCap = state.captures[0];
        if (origCap && typeof origCap.path === "string") {
          const runDir = path.dirname(origCap.path);
          const copiedPath = path.join(runDir, "normal-capture-list-fixture.png");
          if (fs.existsSync(origCap.path) && !fs.existsSync(copiedPath)) {
            fs.copyFileSync(origCap.path, copiedPath);
          }
          origCap.id = "normal-capture-list-fixture";
          origCap.path = copiedPath;
        }
      }
      return structuredClone({
        ...collectedFacts,
        collectedAtMs: Date.now()
      });
    }
  };

  const run = async ({ page, capture, waitForFontsReady, observation, life:currentLife }, adminCreds) => {
    life=currentLife;healthy();
    const fixture = buildFixture(ACTION_LABELS);
    collectedFacts={primaryViewport:{width:1440,height:900},fixture,fixtureResponse:null,route:null,requests:publicRequests,observations:{initial:null,xss:null,more:null,keyboard:null,fonts:null},capture:null,errors};
    const fixtureBody = JSON.stringify({ ok: true, data: fixture });

    await page.addInitScript(() => { window.__listXss = 0; });

    const measured = () => page.evaluate(() => {
      const one = s => document.querySelector(s);
      const rect = e => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const style = e => {
        const s = getComputedStyle(e);
        return {
          fontSize: parseFloat(s.fontSize),
          fontWeight: Number(s.fontWeight),
          color: s.color,
          backgroundColor: s.backgroundColor,
          borderColor: s.borderTopColor,
          borderRadius: parseFloat(s.borderRadius) || 0,
          minWidth: parseFloat(s.minWidth) || 0,
          padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat)
        };
      };
      const t = one("#table-access-logs");
      const more = one("#btn-load-more-logs");
      return {
        atMs: Date.now(),
        tagName: t.tagName,
        ariaLabel: t.getAttribute("aria-label"),
        tableRect: rect(t),
        countText: one("#access-history-count-label").textContent,
        headers: [...t.querySelectorAll("th")].map(e => ({ text: e.textContent, scope: e.scope, rect: rect(e), style: style(e) })),
        rows: [...t.querySelectorAll("tbody tr")].map(e => ({
          id: e.id,
          rect: rect(e),
          cells: [...e.cells].map(c => ({
            text: c.textContent,
            title: c.getAttribute("title"),
            rect: rect(c),
            style: style(c),
            clientWidth: c.clientWidth,
            scrollWidth: c.scrollWidth
          })),
          badge: {
            text: e.querySelector(".access-history-badge").textContent,
            style: style(e.querySelector(".access-history-badge"))
          }
        })),
        more: { count: more ? 1 : 0, text: more?.textContent ?? null },
        fields: {
          ...Object.fromEntries([["from", "#filter-date-from"], ["to", "#filter-date-to"], ["keyword", "#filter-keyword-input"]].map(([k, s]) => [k, { rect: rect(one(s)), style: style(one(s)) }])),
          labels: [...document.querySelectorAll(".access-history-field-label")].map(style)
        },
        surfaces: {
          card: style(one("#state-g1-table")),
          filter: style(one(".access-history-filter-card"))
        }
      };
    });

    state.setPhase("signin");
    await performLogin(page, context.url, adminCreds, null, life.registerSecret);
    await drain();

    const routeInfo = {
      url: "**/api/access-logs:list",
      registeredAtMs: Date.now(),
      fulfilled: [],
      disposed: false
    };
    routeFacts=routeInfo;collectedFacts.route=routeInfo;
    state.environment.routes.push({ url: routeInfo.url, timeMs: routeInfo.registeredAtMs });

    const fixtureHandler = async route => {
      const req = route.request();
      const r = requestMap.get(req);
      requireFact(r, "CANONICAL_REQUEST_IDENTITY");
      routeInfo.fulfilled.push({
        requestId: r.id,
        atMs: Date.now(),
        bodySha256: sha(fixtureBody)
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: fixtureBody
      });
    };

    activePage = page;
    activeRouteHandler = fixtureHandler;
    activeRouteUrl = routeInfo.url;
    await page.route(routeInfo.url, fixtureHandler);

    state.setPhase("fixture-initial");
    const responseReady = page.waitForResponse(r => new URL(r.url()).pathname === "/api/access-logs:list");
    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    const finishedError=await (await responseReady).finished();if(finishedError)throw finishedError;

    await page.waitForFunction(() => document.querySelectorAll("#table-access-logs-body tr").length === 200 && !document.querySelector("#btn-refresh-logs").disabled);
    await drain();

    await page.evaluate(() => document.fonts.ready);
    const initialObs = await measured();
    initialObs.nativeRoleCount = await page.getByRole("table", { name: "활동 이력 목록", exact: true }).count();
    const xssObs = { before: await page.evaluate(() => window.__listXss) };

    collectedFacts.observations.initial=initialObs;collectedFacts.observations.xss=xssObs;

    state.setPhase("more");
    const moreClickAtMs = Date.now();
    await page.locator("#btn-load-more-logs").click();
    await page.waitForFunction(() => document.querySelectorAll("#table-access-logs-body tr").length === 201);
    await drain();

    const moreObs = await measured();
    moreObs.nativeRoleCount = await page.getByRole("table", { name: "활동 이력 목록", exact: true }).count();
    Object.assign(xssObs, await page.evaluate(() => ({
      after: window.__listXss,
      imageElements: document.querySelectorAll("#table-access-logs img").length,
      payloadScripts: [...document.querySelectorAll("#table-access-logs script")].filter(s => s.textContent.includes("__listXss")).length
    })));

    collectedFacts.observations.more=moreObs;
    state.setPhase("real-keyboard");
    await page.setViewportSize({ width: 640, height: 900 });
    await page.locator("#btn-refresh-logs").focus();
    keyListenerPage=page;
    await page.evaluate(() => {
      window.__listKeyEvents = [];
      window.__listKeyHandler = e => window.__listKeyEvents.push({ key: e.key, trusted: e.isTrusted, atMs: Date.now(), target: e.target.className });
      document.addEventListener("keydown", window.__listKeyHandler, true);
    });

    const beforeFocus = await page.evaluate(() => document.activeElement.id);
    await page.keyboard.press("Tab");

    const scroll = () => page.evaluate(() => {
      const w = document.querySelector(".access-history-table-wrapper");
      return { clientWidth: w.clientWidth, scrollWidth: w.scrollWidth, scrollLeft: w.scrollLeft };
    });

    const tabFocusedWrapper = await page.evaluate(() => document.activeElement === document.querySelector(".access-history-table-wrapper"));
    const beforeScroll = await scroll();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const afterScroll = await scroll();

    const keyFacts = await page.evaluate(() => {
      const w = document.querySelector(".access-history-table-wrapper");
      const s = getComputedStyle(w);
      document.removeEventListener("keydown", window.__listKeyHandler, true);
      return {
        events: window.__listKeyEvents,
        outline: { width: parseFloat(s.outlineWidth), style: s.outlineStyle },
        titlesAccessible: [...document.querySelectorAll("#table-access-logs-body tr")].every(r => {
          const c = r.cells[4];
          return c.textContent === "-" ? c.getAttribute("title") === null : c.title === c.textContent;
        })
      };
    });

    const keyboardObs = {
      viewport: { width: 640, height: 900 },
      beforeFocus,
      tabFocusedWrapper,
      before: beforeScroll,
      after: afterScroll,
      ...keyFacts
    };

    keyListenerPage=null;collectedFacts.observations.keyboard=keyboardObs;
    state.setPhase("capture");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.getElementById("main-content").scrollTop = 0;
      window.scrollTo(0, 0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    await waitForFontsReady(15000);
    const fontsTimeMs = Date.now();
    state.environment.fontsReadyAtMs = fontsTimeMs;
    const fontsObs = await page.evaluate(tm => ({ status: document.fonts.status, timeMs: tm }), fontsTimeMs);

    collectedFacts.observations.fonts=fontsObs;
    const origCapPath = await capture("list-fixture-201");
    const capBytes = fs.readFileSync(origCapPath);
    const copyCapPath = path.join(context.runDir, "normal-capture-list-fixture.png");
    const captureObs = {
      path: copyCapPath,
      bytes: capBytes.length,
      sha256: sha(capBytes),
      atMs: Date.now(),
      width: capBytes.readUInt32BE(16),
      height: capBytes.readUInt32BE(20)
    };

    collectedFacts.capture=captureObs;
    await page.unroute(routeInfo.url, fixtureHandler);
    activeRouteHandler = null;
    routeInfo.disposed = true;
    routeInfo.disposedAtMs = Date.now();
    await drain();

    collectedFacts = {
      collectedAtMs: routeInfo.disposedAtMs + 1,
      primaryViewport: { width: 1440, height: 900 },
      fixture,
      fixtureResponse: actualFixtureResponse,
      route: routeInfo,
      requests: publicRequests,
      observations: {
        initial: initialObs,
        xss: xssObs,
        more: moreObs,
        keyboard: keyboardObs,
        fonts: fontsObs
      },
      capture: captureObs,
      errors
    };
  };

  const controller = {
    caseName: CASE,
    canonical,
    validate,
    bind: (s, ctx, sdk, observer, login, held) => {
      state = s;
      context = ctx;
      runScreenCheck = sdk;
      withNormalBrowserObservation = observer;
      performLogin = login;
      HeldRouteController = held;
      controller.sdkRunner = sdk;
      controller.browserObserver = (s, task) => observer(s, async original => {
        b2 = original;
        try{return await task(original);}catch(e){failure(e);throw e;}finally{
          try{await cleanup();}catch(e){failure(e,"cleanup");}
          for(const restore of patches.reverse())try{restore();}catch(e){failure(e,"cleanup");}
          patches.length=0;healthy();
        }
      });
      if (!canonical) return;
      controller.publication = publication;
      controller.run = run;

      const installLaunch=()=>{
      const launch = chromium.launch;
      patch(chromium, "launch", async function(...args) {
        const browser = await launch.apply(this, args);
        const newContext = browser.newContext;
        patch(browser, "newContext", async function(...cArgs) {
          const bCtx = await newContext.apply(this, cArgs);
          requireFact(!pageContext,"CANONICAL_DUPLICATE_CONTEXT");pageContext = bCtx;
          const emit = bCtx.emit;
          patch(bCtx, "emit", function(event, ...eArgs) {
            const start = state.requests.length;
            const res = emit.call(this, event, ...eArgs);
            if (event === "request" && eArgs[0].url().startsWith(context.url + "api/")) {
              onRequest(eArgs[0], start);
            }
            return res;
          });
          bCtx.on("response",onResponse);
          const close=bCtx.close;let closing=null;
          patch(bCtx,"close",function(...args){if(!closing)closing=(async()=>{let closeFailed=false,first;try{await cleanup();}catch(e){closeFailed=true;first=e;}try{await close.apply(this,args);}catch(e){failure(e,"cleanup");if(!closeFailed){closeFailed=true;first=e;}}if(closeFailed)throw first;})();return closing;});
          return bCtx;
        });
        return browser;
      });
      };
      controller.sdkRunner=config=>{installLaunch();return sdk({...config,steps:async(...args)=>{await drain();return config.steps(...args);}});};
    },
    sdkRunner: null,
    browserObserver: null,
    run: null,
    publication: null
  };

  return controller;
}
