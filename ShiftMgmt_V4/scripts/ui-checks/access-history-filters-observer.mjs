// scripts/ui-checks/access-history-filters-observer.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { inspectG1Properties } from "./access-history-g1.mjs";
import { CONTRACT_PATH, CONTRACT_SHA256, EXECUTION_PATH, EXECUTION_SHA256 } from "./access-history-shared.mjs";
import { evidenceJSON } from "../lib/artifact-privacy.mjs";
import { selectEvidenceMode } from "./access-history-filters-evidence.mjs";
import { runFilterScenario } from "./access-history-filters-scenario.mjs";

const CASE = "filters";
const MODE = "canonical-filters-v1";
const LIST_PATH = "/api/access-logs:list";

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

export function createFiltersRun(options) {
  try {
    inspectG1Properties(options, "options", { isRecord: true, keys: ["argv"] });
    inspectG1Properties(options.argv, "argv", { isArray: true });
  } catch {
    requireFact(false, "CANONICAL_INPUT");
  }
  const argv = options.argv;
  requireFact(argv.length >= 1 && argv.length <= 2 && argv.every(x => typeof x === "string"), "CANONICAL_INPUT");
  const match = /^--case=([a-z0-9-]+)$/.exec(argv[0]);
  requireFact(match && match[1] === CASE, "CANONICAL_INPUT");
  const canonical = argv.length === 2;
  requireFact(!canonical || argv[1] === "--evidence=" + MODE, "CANONICAL_INPUT");

  let state = null;
  let context = null;
  let runScreenCheck = null;
  let withNormalBrowserObservation = null;
  let performLogin = null;
  let HeldRouteController = null;

  let pageContext = null;
  let b2 = null;
  let activePage = null;
  const errors = [];
  const patches = [];
  const pending = new Set();
  const requestMap = new WeakMap();
  const publicRequests = [];
  let collectedFacts = null;
  let collecting = false;
  const usedTokens = new Set();

  let armedToken = null;
  let inFlightToken = null;
  const tokenToRequestId = new Map();

  let cleaning = null;
  let life = null;
  let failed = false;
  let reason = null;
  let rejectFailure;
  const failureSignal = new Promise((resolve, reject) => { rejectFailure = reject; });
  failureSignal.catch(() => {});
  const check = promise => Promise.race([promise, failureSignal]);

  let captureObs = null;
  const scenarioResult = {
    requests: publicRequests,
    observations: {
      initial: null,
      fullQuery: null,
      debounce: null,
      immediate: null,
      refreshCancel: null,
      dateCancel: null,
      userCancel: null,
      actionCancel: null,
      resetCancel: null,
      invalid: null,
      invalidAttempts: null,
      invalidEnter: null,
      tabReset: null,
      tabRefresh: null,
      invalidResetAttempts: null,
      emptyFrom: null,
      emptyTo: null,
      normalizationInput: null,
      normalized: null,
      held: null,
      past: null,
      final: null,
      fonts: null
    },
    ledger: null
  };

  const failure = (value, kind = "execution", phase = "scenario") => {
    if (!failed) {
      failed = true;
      reason = value;
      rejectFailure(value);
      if (life) life.recordFailure(value, phase, kind);
    }
    errors.push({
      kind,
      message: String(value?.message || value),
      phase,
      atMs: Date.now()
    });
  };

  const healthy = () => {
    if (failed) throw reason;
  };

  const patch = (object, key, value) => {
    const before = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { value, writable: true, configurable: true, enumerable: before?.enumerable ?? false });
    patches.push(() => {
      requireFact(Object.getOwnPropertyDescriptor(object, key)?.value === value, "CANONICAL_PATCH_REPLACED");
      if (before) Object.defineProperty(object, key, before);
      else delete object[key];
    });
  };

  const track = promise => {
    const p = Promise.resolve(promise);
    pending.add(p);
    p.then(() => pending.delete(p), e => {
      pending.delete(p);
      failure(e);
    });
    return p;
  };

  const until = async predicate => {
    const end = Date.now() + 5000;
    while (!predicate()) {
      healthy();
      requireFact(Date.now() < end, "CANONICAL_OBSERVATION_TIMEOUT");
      await new Promise(r => setTimeout(r, 5));
    }
  };

  const drain = async () => {
    for (;;) {
      await until(() => state.requests.every(r => r.endedAtMs !== null));
      if (!pending.size) break;
      await Promise.allSettled([...pending]);
    }
    healthy();
  };

  const rawFor = async req => {
    await until(() => requestMap.has(req));
    return requestMap.get(req);
  };

  const onRequest = (req, start) => {
    try {
      const parsedUrl = new URL(req.url());
      if (!parsedUrl.pathname.startsWith("/api/")) return;
      if (parsedUrl.pathname === "/api/app:get-version") return;
      const appended = state.requests.slice(start).filter(r => r.source === "page");
      requireFact(appended.length === 1 && appended[0].url === req.url() && appended[0].method === req.method(), "CANONICAL_REQUEST_IDENTITY");
      const r = appended[0];
      requestMap.set(req, r);

      const isList = parsedUrl.pathname === LIST_PATH;
      if (isList) {
        requireFact(parsedUrl.origin === new URL(context.url).origin && req.method() === "POST", "CANONICAL_REQUEST_IDENTITY");
        if (collecting) requireFact(armedToken !== null && inFlightToken === null && !tokenToRequestId.has(armedToken), "CANONICAL_REQUEST_IDENTITY");
        if (armedToken !== null) {
          tokenToRequestId.set(armedToken, r.id);
          inFlightToken = armedToken;
          armedToken = null;
        }
      }

      publicRequests.push({
        id: r.id,
        source: r.source,
        phase: r.phase,
        method: r.method,
        path: parsedUrl.pathname,
        atMs: r.startedAtMs,
        responseAtMs: null,
        finishedAtMs: null,
        status: null,
        ok: false,
        args: isList ? req.postDataJSON() : null,
        body: null
      });
    } catch (e) {
      failure(e);
    }
  };

  const onResponse = res => {
    const parsedUrl = new URL(res.url());
    if (!parsedUrl.pathname.startsWith("/api/")) return;
    if (parsedUrl.pathname === "/api/app:get-version") return;
    const responseAtMs = Date.now();
    track((async () => {
      const r = await rawFor(res.request());
      const q = publicRequests.find(item => item.id === r.id);
      requireFact(q, "CANONICAL_REQUEST_IDENTITY");
      q.responseAtMs = responseAtMs;
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        failure(e, "response-json");
      }
      let finishFailed = false;
      try {
        const e = await res.finished();
        if (e) throw e;
      } catch (e) {
        finishFailed = true;
        failure(e, "response-finished");
      }
      await until(() => r.endedAtMs !== null);
      q.status = r.status;
      q.ok = r.ok;
      if (!finishFailed) q.finishedAtMs = Date.now();
      if (q.path === LIST_PATH) {
        q.body = body;
      }
    })());
  };

  const cleanup = () => {
    if (cleaning) return cleaning;
    cleaning = (async () => {
      let first;
      const attempt = async task => { try { await task(); } catch (e) { failure(e, "cleanup", "cleanup"); first ??= e; } };
      await attempt(drain);
      await attempt(async () => { if (b2) await b2.drain(); });
      await attempt(() => { if (pageContext) pageContext.removeListener("response", onResponse); });
      for (const restore of patches.reverse()) await attempt(restore);
      patches.length = 0;
      if (first) throw first;
    })();
    return cleaning;
  };

  const validate = (execution, contract) => {
    requireFact(contract && typeof contract.evidenceSchema === "string", "CANONICAL_INPUT");
    if (canonical) requireFact(selectEvidenceMode(argv, execution) === MODE, "CANONICAL_REGISTRY");
  };

  const onExit = () => {
    if (!canonical) return;
    try {
      if (!context?.runDir) return;
      const partialPath = path.join(context.runDir, "normal-filters-partial.json");
      if (fs.existsSync(partialPath)) return;

      const rawPartialPath = path.join(context.runDir, "normal-partial.json");
      if (!fs.existsSync(rawPartialPath)) return;

      const rawBytes = fs.readFileSync(rawPartialPath);
      const rawSha256 = sha(rawBytes);
      const rawObj = JSON.parse(rawBytes.toString("utf-8"));

      const formattedErrors = errors.map(e => ({ ...e }));

      const partialDoc = {
        schema: "shiftmgmt-filters-partial-v1",
        case: CASE,
        mode: "partial-filters-v1",
        binding: {
          runId: rawObj.runId,
          contractSha256: rawObj.contractSha256,
          executionSha256: rawObj.executionSha256,
          contextSha256: rawObj.contextSha256,
          workerPid: rawObj.workerPid,
          rawSha256,
          parentPid: process.ppid,
          modelSourceSha256: "03C511282B010774CBEFAE9C0CC0377A8A5CBBEB4C70168663E1695E48765265"
        },
        primaryViewport: { width: 1440, height: 900 },
        collectedAtMs: Date.now(),
        requests: [...publicRequests],
        observations: scenarioResult.observations,
        ledger: scenarioResult.ledger,
        errors: formattedErrors,
        capture: (captureObs && fs.existsSync(captureObs.path)) ? captureObs : null
      };

      const serialized = evidenceJSON(partialDoc, null, 2) + "\n";
      const tmp = partialPath + ".tmp";
      fs.writeFileSync(tmp, serialized, "utf-8");
      fs.renameSync(tmp, partialPath);
    } catch (e) {
      failure(e, "partial", "publication");
      process.stderr.write("FILTERS_PARTIAL_PUBLICATION_FAILED: " + String(e?.message || e) + "\n");
    }
  };

  const publication = {
    mode: MODE,
    readFacts() {
      requireFact(collectedFacts !== null, "CANONICAL_INTEGRITY");
      collectedFacts.requests.sort((a, b) => a.id - b.id);
      if (state && Array.isArray(state.captures) && state.captures.length > 0) {
        const origCap = state.captures[0];
        if (origCap && typeof origCap.path === "string") {
          const copiedPath = path.join(context.runDir, "normal-capture-filters.png");
          if (fs.existsSync(origCap.path) && !fs.existsSync(copiedPath)) {
            fs.copyFileSync(origCap.path, copiedPath);
          }
          origCap.id = "normal-capture-filters";
          origCap.path = copiedPath;
        }
      }
      return structuredClone({
        ...collectedFacts,
        collectedAtMs: Date.now()
      });
    }
  };

  const run = async ({ page, capture, waitForFontsReady, observation, life: currentLife }, adminCreds) => {
    life = currentLife;
    activePage = page;
    healthy();

    state.setPhase("signin");
    const origGoto = page.goto;
    page.goto = async () => {};
    try {
      await performLogin(page, context.url, adminCreds, null, life.registerSecret);
    } finally {
      page.goto = origGoto;
    }
    await drain();

    state.setPhase("navigation");
    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#header-current-title")?.textContent === "활동 이력");
    await drain();

    await runFilterScenario({
      page,
      result: scenarioResult,
      setPhase: p => {
        state.setPhase(p);
      },
      drain,
      tokenToRequestId,
      failure,
      check,
      startCollection: () => { collecting = true; }
    });

    state.setPhase("capture");
    const viewport = page.viewportSize();
    requireFact(viewport?.width === 1440 && viewport?.height === 900, "CANONICAL_ENVIRONMENT");
    state.environment.fontsReadyAtMs = scenarioResult.observations.fonts.atMs;
    let origCapPath;
    try {
      origCapPath = await capture("filters-validation-lock");
      const capBytes = fs.readFileSync(origCapPath);
      const copyCapPath = path.join(context.runDir, "normal-capture-filters.png");
      if (!fs.existsSync(copyCapPath)) {
        fs.copyFileSync(origCapPath, copyCapPath);
      }
      captureObs = {
        path: copyCapPath,
        bytes: capBytes.length,
        sha256: sha(capBytes),
        width: capBytes.readUInt32BE(16),
        height: capBytes.readUInt32BE(20),
        atMs: Date.now()
      };
    } catch (e) {
      failure(e, "capture", "capture");
      throw e;
    }

    const finalRequests = [...publicRequests];

    life.snapshot();
    await drain();
    state.steps.completedAtMs = Date.now();

    collectedFacts = {
      collectedAtMs: Date.now(),
      primaryViewport: { width: 1440, height: 900 },
      requests: finalRequests,
      observations: scenarioResult.observations,
      ledger: scenarioResult.ledger,
      errors,
      capture: captureObs
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
      controller.browserObserver = (st, task) => observer(st, async original => {
        b2 = original;
        let first, result;
        try { result = await task(original); } catch (e) { first = e; }
        try { await cleanup(); } catch (e) { first ??= e; }
        for (const restore of patches.reverse()) {
          try { restore(); } catch (e) { failure(e, "cleanup", "cleanup"); first ??= e; }
        }
        patches.length = 0;
        if (first) throw first;
        return result;
      });

      if (!canonical) return;
      process.once("uncaughtExceptionMonitor", e => failure(e, "evidence", "publication"));
      process.once("exit", onExit);
      controller.publication = publication;
      controller.run = run;

      const installLaunch = () => {
        const launch = chromium.launch;
        patch(chromium, "launch", async function(...args) {
          const browser = await launch.apply(this, args);
          const newContext = browser.newContext;
          patch(browser, "newContext", async function(...cArgs) {
            const bCtx = await newContext.apply(this, cArgs);
            requireFact(!pageContext, "CANONICAL_DUPLICATE_CONTEXT");
            pageContext = bCtx;

            const owned = source => requireFact(collecting && source.context === pageContext && source.page === activePage && source.frame === activePage.mainFrame(), "CANONICAL_CORRELATION_OWNER");
            const binding = task => async (...args) => {
              try { return await task(...args); }
              catch (e) { failure(e, "execution", "scenario"); throw e; }
            };

            await bCtx.exposeBinding("__solFilterOverlapV1", binding(async (source, msg) => {
              owned(source);
              const err = new Error(msg || "CANONICAL_CORRELATION_OVERLAP");
              throw err;
            }));

            await bCtx.exposeBinding("__solFilterFetchBeginV1", binding(async (source, token) => {
              owned(source);
              requireFact(typeof token === "string" && /^token-[1-9][0-9]*$/.test(token) && !usedTokens.has(token), "CANONICAL_CORRELATION_TOKEN");
              requireFact(armedToken === null && inFlightToken === null, "CANONICAL_CORRELATION_OVERLAP");
              const call = await source.frame.evaluate(t => {
                const s = window.__u4FilterRecon, c = s?.calls.at(-1);
                return window.__u4CollectionActive && window.__u4InFlightToken === t && c?.token === t ? { phase: c.phase, number: s.tokenSeq } : null;
              }, token);
              requireFact(call && call.phase === state.phase && token === "token-" + call.number, "CANONICAL_CORRELATION_TOKEN");
              usedTokens.add(token);
              armedToken = token;
              return true;
            }));

            await bCtx.exposeBinding("__solFilterFetchEndV1", binding(async (source, token) => {
              owned(source);
              requireFact(typeof token === "string" && usedTokens.has(token) && inFlightToken === token && armedToken === null && tokenToRequestId.has(token), "CANONICAL_REQUEST_IDENTITY");
              inFlightToken = null;
              return true;
            }));

            await bCtx.addInitScript(() => {
              const nativeFetch = window.fetch;
              window.__u4NativeFetch = nativeFetch;
              window.__u4FetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
              window.__u4ActiveToken = null;
              window.__u4InFlightToken = null;
              window.__u4CollectionActive = false;

              const observedFetch = async function(input, init) {
                const url = new URL(input instanceof Request ? input.url : String(input), location.href);
                if (url.origin === location.origin && url.pathname === "/api/access-logs:list") {
                  const token = window.__u4ActiveToken;
                  window.__u4ActiveToken = null;
                  if (!window.__u4CollectionActive) return Reflect.apply(nativeFetch, this, arguments);
                  if (typeof token !== "string" || (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() !== "POST") {
                    await window.__solFilterOverlapV1("CANONICAL_CORRELATION_TOKEN");
                    throw new Error("CANONICAL_CORRELATION_TOKEN");
                  }
                  if (window.__u4InFlightToken !== null) {
                    await window.__solFilterOverlapV1("CANONICAL_CORRELATION_OVERLAP");
                    throw new Error("CANONICAL_CORRELATION_OVERLAP");
                  }
                  window.__u4InFlightToken = token;
                  try { await window.__solFilterFetchBeginV1(token); }
                  catch (e) {
                    window.__u4InFlightToken = null;
                    throw e;
                  }
                  let primary;
                  try {
                    return await Reflect.apply(nativeFetch, this, arguments);
                  } catch (e) {
                    primary = e;
                    throw e;
                  } finally {
                    try { await window.__solFilterFetchEndV1(token); }
                    catch (e) {
                      if (!primary) throw e;
                    } finally {
                      if (window.__u4InFlightToken === token) window.__u4InFlightToken = null;
                    }
                  }
                }
                return Reflect.apply(nativeFetch, this, arguments);
              };
              Object.defineProperty(observedFetch, "length", { value: nativeFetch.length });
              Object.defineProperty(window, "fetch", { ...window.__u4FetchDescriptor, value: observedFetch });
            });

            const emit = bCtx.emit;
            patch(bCtx, "emit", function(event, ...eArgs) {
              const start = state.requests.length;
              const res = emit.call(this, event, ...eArgs);
              if (event === "request" && eArgs[0].url().startsWith(context.url + "api/")) {
                onRequest(eArgs[0], start);
              }
              return res;
            });
            bCtx.on("response", onResponse);
            const close = bCtx.close;
            let closing = null;
            patch(bCtx, "close", function(...closeArgs) {
              if (!closing) {
                closing = (async () => {
                  let closeFailed = false;
                  let first;
                  try { await cleanup(); } catch (e) { closeFailed = true; first = e; }
                  try { await close.apply(this, closeArgs); }
                  catch (e) {
                    failure(e, "cleanup", "cleanup");
                    if (!closeFailed) { closeFailed = true; first = e; }
                  }
                  if (closeFailed) throw first;
                })();
              }
              return closing;
            });
            return bCtx;
          });
          return browser;
        });
      };

      controller.sdkRunner = config => {
        installLaunch();
        return sdk({
          ...config,
          steps: async (...args) => {
            await drain();
            return config.steps(...args);
          }
        });
      };
    },
    sdkRunner: null,
    browserObserver: null,
    run: null,
    publication: null
  };

  return controller;
}
