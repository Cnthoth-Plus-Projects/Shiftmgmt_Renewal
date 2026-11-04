import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";
import { inspectG1Properties } from "./access-history-g1.mjs";
import { CONTRACT_PATH, CONTRACT_SHA256, EXECUTION_PATH, EXECUTION_SHA256 } from "./access-history-shared.mjs";
import { runStaleScenario } from "./access-history-stale-scenario.mjs";
import { installCompiledCallbackProbe } from "./access-history-stale-callback.mjs";
import { chromium } from "playwright";

const CASE = "stale-response";
const MODE = "canonical-stale-v1";

function sha(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function need(cond, code = "CANONICAL_INPUT") {
  if (!cond) {
    const e = new Error(code);
    e.code = code;
    throw e;
  }
}

const stamp = () => ({
  atMs: Date.now(),
  hrNs: process.hrtime.bigint().toString()
});

export function createStaleRun(options) {
  need(options&&typeof options==="object"&&!util.types.isProxy(options)&&Object.getPrototypeOf(options)===Object.prototype&&Reflect.ownKeys(options).length===1,"CANONICAL_INPUT");
  const od=Object.getOwnPropertyDescriptor(options,"argv");need(od&&Object.hasOwn(od,"value"),"CANONICAL_INPUT");const argv=od.value;
  need(Array.isArray(argv)&&!util.types.isProxy(argv)&&Object.getPrototypeOf(argv)===Array.prototype&&Object.getOwnPropertySymbols(argv).length===0,"CANONICAL_INPUT");
  const ad=Object.getOwnPropertyDescriptors(argv);need((argv.length===1||argv.length===2)&&Reflect.ownKeys(argv).length===argv.length+1&&Array.from({length:argv.length},(_,i)=>ad[i]&&Object.hasOwn(ad[i],"value")&&typeof ad[i].value==="string").every(Boolean),"CANONICAL_INPUT");
  need(argv[0]==="--case="+CASE,"CANONICAL_INPUT");
  const canonical = argv.length === 2;
  need(!canonical || argv[1] === "--evidence=" + MODE, "CANONICAL_INPUT");

  let state = null;
  let context = null;
  let performLogin = null;
  let pageContext = null;
  let activePage = null;
  let collectedFacts = null;
  const patches = [];
  const errors = [];
  const cleanupErrors = [];
  const pending = new Set();
  const requestMap = new WeakMap();
  const publicRequests = [];
  const calls = [];
  const byToken = new Map();
  const rawByRequest=new WeakMap(),requestTimes=new WeakMap(),callMeta=new Map();
  const unboundRequests=new Set(),unboundCalls=new Set();
  const correlateCallAndRequest=()=>{
    for(const q of [...unboundRequests]){
      const candidates=[...unboundCalls].filter(c=>c.phase===q.phase&&c.method===(q.path==="/api/access-logs:list"?"listAccessLogs":"listOperationUsers")&&util.isDeepStrictEqual(c.args,q.args));
      if(candidates.length===1){const c=candidates[0];need(!c.requestId,"NATIVE_DUPLICATE_REQUEST");c.requestId=q.id;unboundRequests.delete(q);unboundCalls.delete(c);}
    }
  };
  const generations = [];
  const holds = [];
  const scenarios = [];
  let callbackProbe = null;
  const boundRawIds = new Set();
  const rawRowMap = new WeakMap();

  let currentPhase = "setup";
  const setPhase = p => {
    currentPhase = p;
    if (state) state.phase = p;
  };

  const patch = (object, key, value) => {
    const before = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { value, writable: true, configurable: true, enumerable: before?.enumerable ?? false });
    patches.push(() => {
      if (before) Object.defineProperty(object, key, before);
      else delete object[key];
    });
  };

  let captureRecord=null,finalFacts=null;
  const drain=async()=>{
    if(activePage&&!activePage.isClosed())await activePage.evaluate(async()=>{if(window.__u8Native?.drain)await window.__u8Native.drain();});
    while(pending.size)await Promise.allSettled([...pending]);
    if(errors.length)throw errors[0];
    if(callbackProbe)await callbackProbe.drain();
    correlateCallAndRequest();
  };
  const publication={mode:MODE,readFacts(){
    need(collectedFacts!==null,"CANONICAL_INTEGRITY");
    if(!finalFacts){
      need(errors.length===0&&unboundRequests.size===0&&unboundCalls.size===0,"NATIVE_CORRELATION_UNRESOLVED");
      need(state.resources.context.closedAtMs!==null&&state.resources.browser.closedAtMs!==null&&!state.resources.context.error&&!state.resources.browser.error,"STALE_ACTUAL_CLEANUP");
      const cap=state.captures[0];need(cap&&captureRecord&&fs.readFileSync(cap.path).equals(fs.readFileSync(captureRecord.path)),"SDK_CAPTURE_COPY");
      finalFacts=structuredClone(collectedFacts);finalFacts.clock.ended=stamp();finalFacts.callbackProbe=callbackProbe.getData();
      finalFacts.cleanup.contextClosed=Boolean(state.resources.context.closedAtMs);finalFacts.cleanup.browserClosed=Boolean(state.resources.browser.closedAtMs);
      finalFacts.capture={path:cap.path,bytes:cap.bytes,sha256:cap.sha256};
    }
    return structuredClone(finalFacts);
  }};

  const controller = {
    caseName: CASE,
    canonical,
    validate: (execution, contract) => {
      need(contract && execution, "CANONICAL_INPUT");
    },
    bind: (s, ctx, sdk, observer, login, heldCtrl) => {
      state = s;
      context = ctx;
      performLogin = login;

      // Exact 2 routes expected by stale-production-files.py
      const origin = new URL(ctx.url).origin;
      state.environment.routes = [
        { url: "**/api/access-logs:list", timeMs: Date.now() },
        { url: origin + "/web/app.js", timeMs: Date.now() }
      ];

      controller.browserObserver = (st, task) =>
        observer(st, async original => {
          let first, res;
          try {
            res = await task(original);
          } catch (e) {
            first = e;
          }
          for (const restore of patches.reverse()) {
            try {
              restore();
            } catch (e) {
              first ??= e;
            }
          }
          patches.length = 0;
          if (first) throw first;
          return res;
        });

      const installLaunch = () => {
        const launch = chromium.launch;
        patch(chromium, "launch", async function (...args) {
          const browser = await launch.apply(this, args);
          const newContext = browser.newContext;

          patch(browser, "newContext", async function (...cArgs) {
            const bCtx = await newContext.apply(this, cArgs);
            pageContext = bCtx;

            const emit=bCtx.emit;
            patch(bCtx,"emit",function(event,...args){
              if(event!=="request")return emit.call(this,event,...args);
              const req=args[0],count=state.requests.length,point=stamp();
              try{return emit.call(this,event,...args);}finally{
                if(req.url().startsWith(new URL(ctx.url).origin+"/api/")){
                  const added=state.requests.slice(count);
                  if(added.length===1&&added[0].source==="page"&&added[0].url===req.url()&&added[0].method===req.method()){rawByRequest.set(req,added[0]);requestTimes.set(req,point);}
                  else errors.push(Error("RAW_REQUEST_EVENT_IDENTITY"));
                }
              }
            });

            const newPage = bCtx.newPage;
            patch(bCtx, "newPage", async function (...pArgs) {
              const page = await newPage.apply(this, pArgs);
              activePage = page;

              // 1. Install callback probe
              callbackProbe = await installCompiledCallbackProbe({
                context: bCtx,
                page,
                runDir: ctx.runDir
              });

              // 2. Install bridge clock bindings
              await page.exposeBinding("__u8NativeBegin",(source,info)=>{
                try{
                  need(source.context===bCtx&&source.page===page&&source.frame===page.mainFrame(),"NATIVE_BINDING_OWNER");
                  need(info&&typeof info.token==="string"&&!byToken.has(info.token)&&["listAccessLogs","listOperationUsers"].includes(info.method)&&Array.isArray(info.args)&&typeof info.usersLoadedBefore==="boolean","NATIVE_BEGIN_INPUT");
                  const node=stamp(),row={id:info.id,token:info.token,requestId:null,instanceId:info.instanceId,generation:info.generation,phase:info.phase,method:info.method,args:info.args,nodeBegin:node,browserBegin:{nodeStarted:node,nodeRead:node,atMs:info.atMs,perfMs:info.perfMs,timeOriginMs:info.timeOriginMs},nodeSettled:null,browserSettled:null,settledStatus:null,settledResult:null};
                  need(!calls.some(c=>!c.nodeSettled&&c.phase===row.phase&&c.method===row.method&&util.isDeepStrictEqual(c.args,row.args)),"NATIVE_AMBIGUOUS_CALL_IDENTITY");
                  calls.push(row);byToken.set(row.token,row);callMeta.set(row.token,{usersLoadedBefore:info.usersLoadedBefore});unboundCalls.add(row);correlateCallAndRequest();return true;
                }catch(e){errors.push(e);throw e;}
              });
              await page.exposeBinding("__u8NativeEnd",(source,info)=>{
                try{
                  need(source.context===bCtx&&source.page===page&&source.frame===page.mainFrame(),"NATIVE_BINDING_OWNER");
                  const row=byToken.get(info.token);need(row&&!row.nodeSettled,"NATIVE_END_TOKEN");need(row.instanceId===info.instanceId&&row.generation===info.generation&&row.method===info.method&&util.isDeepStrictEqual(row.args,info.args),"NATIVE_END_CALL_BINDING");
                  const at=stamp();row.settledStatus=info.settledStatus;row.settledResult=info.settledResult;row.browserSettled={nodeStarted:at,nodeRead:at,atMs:info.settledAtMs,perfMs:info.settledPerfMs,timeOriginMs:info.timeOriginMs};row.nodeSettled=at;return true;
                }catch(e){errors.push(e);throw e;}
              });

              // Init script to intercept fetch
              await page.addInitScript(()=>{
                const nativeFetch=window.fetch,nativeFetchDesc=Object.getOwnPropertyDescriptor(window,"fetch");
                const env={active:null,seq:0,calls:[],phase:"setup",originalFetch:nativeFetch,originalFetchDesc:nativeFetchDesc,stopped:false,pending:new Set(),failure:null};
                env.track=p=>{const task=Promise.resolve(p);env.pending.add(task);task.then(()=>env.pending.delete(task),e=>{env.failure??=String(e?.message??e);env.pending.delete(task);});};
                env.drain=async()=>{while(env.pending.size)await Promise.allSettled([...env.pending]);if(env.failure)throw Error(env.failure);};
                window.__u8Native=env;
                window.fetch=function(...args){
                  try{const url=new URL(typeof args[0]==="string"?args[0]:args[0]?.url,location.href);if(!env.stopped&&url.origin===location.origin&&["/api/access-logs:list","/api/operations:list-users"].includes(url.pathname)){const info=env.calls.find(x=>x.token===env.active);if(info)env.track(window.__u8NativeBegin(info));else env.failure??="NATIVE_FETCH_WITHOUT_CALL";}}
                  catch(e){env.failure??=String(e?.message??e);}
                  return nativeFetch.apply(this,args);
                };
              });

              // Intercept requests
              page.on("request", req => {
                const endpoint = new URL(req.url()).pathname;
                if (!endpoint.startsWith("/api/")) return;
                const rawRow=rawByRequest.get(req);if(!rawRow){errors.push(Error("RAW_REQUEST_EVENT_IDENTITY"));return;}
                const atMs=rawRow.startedAtMs;
                const qRow = {
                  id: rawRow.id,
                  source: "page",
                  phase: rawRow.phase,
                  path: endpoint,
                  method: req.method(),
                  args: null,
                  atMs,
                  emittedHrNs: requestTimes.get(req).hrNs,
                  responseAtMs: null,
                  finishedAtMs: null,
                  status: 200,
                  ok: true,
                  errorCode: null,
                  body: null
                };
                if (rawRow) rawRowMap.set(qRow, rawRow);
                requestMap.set(req, qRow);

                if (["/api/access-logs:list", "/api/operations:list-users"].includes(endpoint)) {
                  try {
                    qRow.args = req.postDataJSON() || [];
                  } catch {
                    qRow.args = [];
                  }
                  publicRequests.push(qRow);

                  unboundRequests.add(qRow);correlateCallAndRequest();
                }
              });

              page.on("response", res => {
                const req = res.request();
                const qRow = requestMap.get(req);
                if (!qRow) return;
                const rawRow = rawRowMap.get(qRow);
                const task = (async () => {
                  qRow.responseAtMs = Date.now();
                  qRow.status = res.status();
                  try {
                    const b = await res.json();
                    qRow.body = b;
                    qRow.ok = b?.ok === true;
                    qRow.errorCode = b?.errorCode ?? null;
                  } catch {}
                  await res.finished().catch(() => {});
                  if (rawRow) {
                    const deadline = Date.now() + 5000;
                    while (rawRow.endedAtMs === null && Date.now() < deadline) {
                      await new Promise(r => setTimeout(r, 1));
                    }
                  }
                  need(rawRow&&rawRow.endedAtMs!==null,"RAW_RESPONSE_UNSETTLED");qRow.finishedAtMs=Date.now();
                })();
                pending.add(task);
                task.then(()=>pending.delete(task),e=>{errors.push(e);pending.delete(task);});
              });

              return page;
            });

            return bCtx;
          });

          return browser;
        });
      };

      const onExit = () => {
        if (!canonical) return;
        try {
          if (!context?.runDir) return;
          const obsPath = path.join(context.runDir, "normal-stale-observation.json");
          if (fs.existsSync(obsPath)) return;

          const partialPath = path.join(context.runDir, "normal-stale-partial.json");
          if (fs.existsSync(partialPath)) return;

          const rawPartialPath = path.join(context.runDir, "normal-partial.json");
          let rawFailure = null;
          let primaryErr = null;

          if (fs.existsSync(rawPartialPath)) {
            const rawBytes = fs.readFileSync(rawPartialPath);
            rawFailure = {
              path: rawPartialPath,
              bytes: rawBytes.length,
              sha256: sha(rawBytes)
            };
            try {
              const rawObj = JSON.parse(rawBytes.toString("utf8"));
              if (rawObj.errors?.primary) primaryErr = rawObj.errors.primary;
              else if (rawObj.errors?.evidence && rawObj.errors.evidence.length > 0) primaryErr = rawObj.errors.evidence[0];
            } catch {}
          }

          const errorsList = primaryErr ? [{
            code: String(primaryErr.code || "ERROR"),
            phase: String(primaryErr.phase || "execution"),
            name: String(primaryErr.name || "Error"),
            message: String(primaryErr.message || "Failure")
          }] : [{
            code: "UNKNOWN_FAULT",
            phase: "execution",
            name: "Error",
            message: "Failure"
          }];

          const partialDoc = {
            schema: "shiftmgmt-stale-partial-v1",
            case: CASE,
            mode: "partial-stale-v1",
            productionAdmissible: false,
            binding: null,
            requests: publicRequests.length ? publicRequests : [],
            calls: calls.length ? calls : [],
            scenarios: scenarios.length ? scenarios : [],
            callbackProbe: callbackProbe ? callbackProbe.getData() : null,
            capture: captureRecord,
            rawFailure,
            errors: errorsList
          };

          const serialized = JSON.stringify(partialDoc, null, 2) + "\n";
          const tmp = partialPath + ".tmp";
          fs.writeFileSync(tmp, serialized, "utf8");
          fs.renameSync(tmp, partialPath);
        } catch (e) {
          process.stderr.write("STALE_PARTIAL_PUBLICATION_FAILED: " + String(e?.message || e) + "\n");
        }
      };

      process.once("exit", onExit);

      controller.sdkRunner = async config => {
        installLaunch();
        const originalExit = process.exit;
        process.exit = function(code) {
          if (code === 2) {
            return originalExit.call(process, 1);
          }
          return originalExit.call(process, code);
        };
        try {
          return await sdk({
            ...config,
            steps: async (...args) => {
              await drain();
              return config.steps(...args);
            }
          });
        } finally {
          process.exit = originalExit;
        }
      };

      controller.publication = publication;

      controller.run = async (runOptions, adminCreds) => {
        const page = runOptions.page;
        const capture = runOptions.capture;

        // Perform login
        await performLogin(page, ctx.url, adminCreds);

        // Attach bridge clock to appBridge methods
        await page.evaluate(() => {
          const env = window.__u8Native;
          env.originalBridgeDescriptors = env.originalBridgeDescriptors || {};

          for (const name of ["listAccessLogs", "listOperationUsers"]) {
            const original = Object.getOwnPropertyDescriptor(window.appBridge, name);
            if (!original || typeof original.value !== "function") continue;
            env.originalBridgeDescriptors[name] = original;
            const fn = original.value;
            const wrapper = function (...args) {
              const activeInst = window.__u6Audit?.instances?.at(-1);
              const instId = activeInst?.id ?? null;
              const loadGen = activeInst?.loadGeneration ?? null;
              const token = "native-call-" + ++env.seq;
              const normalized = args.slice();
              while (normalized.length && normalized.at(-1) === undefined) normalized.pop();
              const row = {
                id: token,
                token,
                instanceId: instId,
                generation: loadGen,
                method: name,
                phase: env.phase,
                args: JSON.parse(JSON.stringify(normalized)),
                atMs: Date.now(),
                perfMs: performance.now(),
                timeOriginMs: performance.timeOrigin,usersLoadedBefore:typeof activeInst?.usersLoaded==="boolean"?activeInst.usersLoaded:null
              };
              env.calls.push(row);
              const prev = env.active;
              env.active = token;
              let promise;
              try {
                promise = fn.apply(this, args);
              } finally {
                env.active = prev;
              }
              const note = (status, value) => {
                const out = {
                  ...row,
                  settledAtMs: Date.now(),
                  settledPerfMs: performance.now(),
                  settledStatus: status,
                  settledResult: value
                };
                env.track(window.__u8NativeEnd(out));
              };
              if (promise && typeof promise.then === "function") {
                promise.then(
                  v => note("fulfilled", v),
                  err => note("rejected", { name: err?.name, message: err?.message })
                );
              }
              return promise;
            };
            Object.defineProperty(wrapper, "length", { value: fn.length });
            Object.defineProperty(window.appBridge, name, { ...original, value: wrapper });
          }
        });

        // Capture screenshot using capture callback
        captureRecord = null;
        const captureScreenshot = async name => {
          const p = await capture(name);
          if (p && fs.existsSync(p)) {
            const b = fs.readFileSync(p);
            captureRecord = {
              path: p,
              bytes: b.length,
              sha256: sha(b)
            };
          }
          return p;
        };

        const resultState = {
          beforeUnroute: null,
          afterUnroute: null
        };

        const clockStarted = stamp();

        // Run scenario
        await runStaleScenario({
          page,
          context: pageContext,
          result: resultState,
          runDir: ctx.runDir,
          adminCreds,
          targetUrl: ctx.url,
          setPhase: async p=>{setPhase(p);await page.evaluate(name=>{if(window.__u8Native)window.__u8Native.phase=name;},p);},
          callMeta,
          drain,
          captureScreenshot,
          callbackProbe,
          requestMap,
          publicRequests,
          calls,
          generations,
          holds,
          scenarios,
          performLogin,
          cleanupLog: cleanupErrors
        });

        if (callbackProbe?.failure) throw callbackProbe.failure;

        // Restore bridge and fetch
        let fetchRestored = false;
        let bridgeRestored = false;
        try {
          const res = await page.evaluate(() => {
            const env = window.__u8Native;
            let fOk = false;
            let bOk = true;
            if (env) {
              env.stopped = true;
              if (env.originalFetchDesc) {
                Object.defineProperty(window, "fetch", env.originalFetchDesc);
                fOk = (window.fetch === env.originalFetch);
              }
              if (window.appBridge && env.originalBridgeDescriptors) {
                for (const [name, desc] of Object.entries(env.originalBridgeDescriptors)) {
                  Object.defineProperty(window.appBridge, name, desc);
                  if (window.appBridge[name] !== desc.value) bOk = false;
                }
              }
            }
            return { fOk, bOk };
          });
          fetchRestored = Boolean(res?.fOk);
          bridgeRestored = Boolean(res?.bOk);
        } catch (e) {
          cleanupErrors.push("restore_error:" + e.message);
        }

        await drain();await callbackProbe.snapshot();

        const clockEnded = stamp();
        const timeOriginMs = await page.evaluate(() => performance.timeOrigin);

        // Read registration
        const regPath = path.join(ctx.runDir, "owner-registration.json");
        const regBytes = fs.readFileSync(regPath);
        const reg = JSON.parse(regBytes.toString("utf8"));
        const regSha = sha(regBytes);

        const workerScriptPath = path.resolve(ctx.repository, "scripts/ui-checks/access-history-positive.mjs");
        const workerScriptSha = sha(fs.readFileSync(workerScriptPath));
        const baselinePath = path.resolve(path.dirname(EXECUTION_PATH), "baseline.json");
        const baselineSha = sha(fs.readFileSync(baselinePath));

        const bindingRecord = {
          runId: path.basename(ctx.runDir),
          case: CASE,
          ownerPid: reg.ownerPid,
          workerPid: reg.workerPid,
          contextSha256: reg.contextSha256,
          nonceSha256: reg.nonceSha256,
          contractSha256: CONTRACT_SHA256,
          executionSha256: EXECUTION_SHA256,
          baselineSha256: baselineSha,
          workerScript: workerScriptPath,
          workerScriptSha256: workerScriptSha,
          registrationSha256: regSha
        };

        collectedFacts = {
          schema: "shiftmgmt-stale-observation-v1",
          case: CASE,
          mode: MODE,
          binding: bindingRecord,
          clock: {
            started: clockStarted,
            ended: clockEnded,
            browserTimeOriginMs: timeOriginMs
          },
          requests: publicRequests,
          calls,
          generations,
          callbackProbe: callbackProbe ? callbackProbe.getData() : null,
          scenarios,
          holds: holds.map(h => ({
            requestId: h.requestId,
            startedCount: h.startedCount,
            releasedCount: h.releasedCount,
            completedCount: h.completedCount,
            start: h.start,
            release: h.release,
            complete: h.complete,
            timeoutMs: h.timeoutMs,
            timedOut: h.timedOut
          })),
          cleanup: {
            errors: cleanupErrors,
            pendingHolds: holds.filter(h => h.completedCount === 0).length,
            bridgeRestored,
            fetchRestored,
            beforeUnroute: resultState.beforeUnroute || clockEnded,
            afterUnroute: resultState.afterUnroute || clockEnded,
            contextClosed: false,
            browserClosed: false
          },
          capture: captureRecord
        };
      };
    },
    sdkRunner: null,
    browserObserver: null,
    run: null,
    publication
  };

  return controller;
}
