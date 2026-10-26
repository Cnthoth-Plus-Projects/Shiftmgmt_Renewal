import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";
import { chromium } from "playwright";
import { selectEvidenceMode, publishEmptyTerminal } from "./access-history-empty-evidence.mjs";
import { inspectG1Properties } from "./access-history-g1.mjs";
import { CONTRACT_PATH, CONTRACT_SHA256, EXECUTION_PATH, EXECUTION_SHA256 } from "./access-history-shared.mjs";

const CASE = "empty-fixture";
const MODE = "canonical-empty-v1";
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

export function createEmptyRun(options) {
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
  let activeRouteHandler = null;
  let activeRouteUrl = null;
  const errors = [];
  const patches = [];
  const pending = new Set();
  const requestMap = new WeakMap();
  const publicRequests = [];
  let collectedFacts = null;

  let cleaning = null;
  let life = null;
  let failed = false;
  let reason = null;
  let keyListenerPage = null;
  let routeFacts = null;

  const failure = (value, kind = "execution") => {
    if (!failed) {
      failed = true;
      reason = value;
    }
    errors.push({ type: kind, message: String(value?.message || value) });
    if (life) life.recordFailure(value, kind === "cleanup" ? "observer-dispose" : "scenario", kind);
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
      if (!new URL(req.url()).pathname.startsWith("/api/")) return;
      const appended = state.requests.slice(start).filter(r => r.source === "page");
      requireFact(appended.length === 1 && appended[0].url === req.url() && appended[0].method === req.method(), "CANONICAL_REQUEST_IDENTITY");
      const r = appended[0];
      requestMap.set(req, r);
      publicRequests.push({
        id: r.id,
        source: r.source,
        phase: r.phase,
        method: r.method,
        path: new URL(r.url).pathname,
        atMs: r.startedAtMs,
        responseAtMs: null,
        finishedAtMs: null,
        status: null,
        ok: null,
        args: new URL(r.url).pathname === LIST_PATH ? req.postDataJSON() : null,
        body: null
      });
    } catch (e) {
      failure(e);
    }
  };

  const onResponse = res => {
    if (!new URL(res.url()).pathname.startsWith("/api/")) return;
    const responseAtMs = Date.now();
    track((async () => {
      const r = await rawFor(res.request());
      const q = publicRequests.find(item => item.id === r.id);
      requireFact(q, "CANONICAL_REQUEST_IDENTITY");
      q.responseAtMs = Math.max(responseAtMs, r.startedAtMs);
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
      const attempt = async task => { try { await task(); } catch(e) { failure(e, "cleanup"); first ??= e; } };
      await attempt(async () => {
        if (activePage && activeRouteHandler && activeRouteUrl) {
          await activePage.unroute(activeRouteUrl, activeRouteHandler);
          activeRouteHandler = null;
          if (routeFacts) routeFacts.disposedAtMs = Date.now();
        }
      });
      await attempt(async () => {
        if (keyListenerPage) {
          await keyListenerPage.evaluate(() => {
            document.removeEventListener("keydown", window.__emptyKeyHandler, true);
            delete window.__emptyKeyHandler;
          });
          keyListenerPage = null;
        }
      });
      await attempt(() => { if (pageContext) pageContext.removeListener("response", onResponse); });
      for (const restore of patches.reverse()) await attempt(restore);
      patches.length = 0;
      if(first) throw first;
    })();
    return cleaning;
  };

  const validate = (execution, contract) => {
    requireFact(contract && typeof contract.evidenceSchema === "string", "CANONICAL_INPUT");
    if (canonical) requireFact(selectEvidenceMode(argv, execution) === MODE, "CANONICAL_REGISTRY");
  };

  const publication = {
    mode: MODE,
    readFacts() {
      requireFact(collectedFacts !== null, "CANONICAL_INTEGRITY");
      collectedFacts.requests.sort((a, b) => a.id - b.id);
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

    const emptySnapshot = async () => {
      const snap = await page.evaluate(() => {
        const one = s => document.querySelector(s);
        const many = s => [...document.querySelectorAll(s)];
        const box = (e, isTitle = false, isDesc = false) => {
          if (!e) return null;
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          const w = (isTitle || e.id === "btn-empty-reset") ? r.width : Math.round(r.width);
          return {
            width: w,
            height: Math.round(r.height),
            maxWidth: s.maxWidth,
            borderRadius: Math.round(parseFloat(s.borderRadius) || 0),
            padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(v => Math.round(parseFloat(v) || 0)),
            gap: (isTitle || isDesc) ? null : Math.round(parseFloat(s.gap) || 0),
            fontSize: Math.round(parseFloat(s.fontSize) || 0),
            fontWeight: Number(s.fontWeight) || 0,
            outlineWidth: Math.round(parseFloat(s.outlineWidth) || 0),
            outlineStyle: s.outlineStyle
          };
        };
        const makeTitle = el => {
          const s = box(el, true, false);
          if (!s) return { style: null };
          return { text: el?.textContent || "", style: s };
        };
        const makeDesc = el => {
          const s = box(el, false, true);
          if (!s) return { style: null };
          return { text: el?.textContent || "", style: s };
        };
        const makeButton = el => {
          const s = box(el, false, false);
          const focused = el === document.activeElement;
          if (!s) return { focused, style: null };
          return { text: el?.textContent || "", focused, style: s };
        };
        const ids = ["filter-date-from", "filter-date-to", "filter-user-select", "filter-action-select", "filter-keyword-input"];
        const d = new Date();
        const sampledAtMs = d.getTime();
        const ymd = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
        return {
          atMs: sampledAtMs,
          localDefaults: {
            dateFrom: ymd.slice(0, 8) + "01",
            dateTo: ymd,
            user: "all",
            action: "all",
            keyword: ""
          },
          emptyCount: many("#state-g2-empty").length,
          tableCount: many("#table-access-logs").length,
          loading: many(".access-history-loading-banner").map(e => ({ role: e.getAttribute("role") || "status", text: e.textContent || "" })),
          countText: one("#access-history-count-label")?.textContent || null,
          alerts: many('[role="alert"]').map(e => e.textContent || "").filter(Boolean),
          filters: Object.fromEntries(ids.map(id => [id, {
            count: many("#" + id).length,
            value: one("#" + id)?.value || "",
            enabled: one("#" + id) ? !one("#" + id).disabled : false
          }])),
          card: box(one("#state-g2-empty")),
          parentWidth: Math.round(one(".access-history-body-container")?.getBoundingClientRect().width || 0),
          title: makeTitle(one(".access-history-empty-title")),
          description: makeDesc(one(".access-history-empty-desc")),
          button: makeButton(one("#btn-empty-reset")),
          localClock: {
            sampledAtMs,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate(),
            timezoneOffsetMinutes: d.getTimezoneOffset()
          }
        };
      });
      snap.atMs = Math.max(snap.localClock.sampledAtMs, Date.now());
      return snap;
    };

    const listRows = () => publicRequests.filter(q => q.path === LIST_PATH);
    const settled = async () => {
      await page.waitForFunction(() => !document.querySelector("#btn-refresh-logs")?.disabled);
      await drain();
    };

    let responseMode = "empty";
    let heldStarted = null;
    let releaseHold = null;
    const heldReady = new Promise(resolve => { heldStarted = resolve; });
    const heldRelease = new Promise(resolve => { releaseHold = resolve; });

    const routeRegistry = {
      registeredAtMs: Date.now(),
      url: "**/api/access-logs:list",
      events: [],
      releaseAtMs: null,
      disposedAtMs: null
    };
    routeFacts = routeRegistry;
    activeRouteUrl = routeRegistry.url;

    const routeHandler = async route => {
      const row = await rawFor(route.request());
      if (!row) throw new Error("Exact request mapping unavailable");
      const event = {
        requestId: row.id,
        mode: responseMode,
        atMs: Date.now(),
        releasedAtMs: null,
        body: null,
        terminal: null,
        completedAtMs: null
      };
      routeRegistry.events.push(event);

      if (responseMode === "hold") {
        heldStarted();
        event.releasedAtMs = await heldRelease;
      }

      if (responseMode === "network") {
        event.terminal = "abort";
        await route.abort("failed");
        event.completedAtMs = Date.now();
        return;
      }

      const body = responseMode === "bridge"
        ? { ok: false, errorCode: "EMPTY_CONTROL_REJECTED", message: "조회 요청을 처리하지 못했습니다. 다시 조회해 주세요." }
        : { ok: true, data: [] };

      event.body = body;
      event.terminal = "fulfill";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      event.completedAtMs = Date.now();
    };

    activeRouteHandler = routeHandler;
    await page.route(routeRegistry.url, routeHandler);
    state.environment.routes.push({ url: routeRegistry.url, timeMs: routeRegistry.registeredAtMs });

    const change = async (name, action) => {
      state.setPhase(name);
      const count = listRows().length;
      const r = page.waitForResponse(res => new URL(res.url()).pathname === LIST_PATH);
      await action();
      const response = await r;
      const error = await response.finished();
      if (error) throw error;
      await settled();
      return {
        before: count,
        after: listRows().length,
        requestIds: listRows().slice(count).map(item => item.id),
        snapshot: await emptySnapshot()
      };
    };

    // 1. Signin
    state.setPhase("signin");
    await performLogin(page, context.url, adminCreds, null, life.registerSecret);
    await drain();

    // 2. EMPTY-02 loading hold
    state.setPhase("held-initial");
    responseMode = "hold";
    let holdTimer = setTimeout(() => { if (releaseHold) releaseHold(Date.now()); }, 20000);
    const initialResponse = page.waitForResponse(res => new URL(res.url()).pathname === LIST_PATH);
    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    await heldReady;

    const loadingObs = await emptySnapshot();
    routeRegistry.releaseAtMs = Date.now();
    responseMode = "empty";
    if (releaseHold) releaseHold(routeRegistry.releaseAtMs);
    clearTimeout(holdTimer);
    holdTimer = null;

    const first = await initialResponse;
    const finishedError = await first.finished();
    if (finishedError) throw finishedError;
    await settled();

    // EMPTY-01 & 04 initial
    const initialObs = await emptySnapshot();

    // 3. EMPTY-03 Bridge failure & recovery
    responseMode = "bridge";
    const bridgeObs = await change("bridge-failure", () => page.locator("#btn-refresh-logs").click());
    responseMode = "empty";
    await change("bridge-recovery", () => page.locator("#btn-refresh-logs").click());

    // 4. EMPTY-05 Past filter
    const pastObs = await change("past-period", () => page.locator("#filter-date-from").fill("2000-01-01"));

    // 5. Populate filters for Reset
    await change("prepare-past-end", () => page.locator("#filter-date-to").fill("2000-12-31"));
    const userOption = await page.locator("#filter-user-select option").evaluateAll(xs => xs.find(x => x.value !== "all")?.value ?? null);
    if (!userOption) throw new Error("No real user filter option");
    await change("prepare-user", () => page.locator("#filter-user-select").selectOption(userOption));

    const actionOption = await page.locator("#filter-action-select option").evaluateAll(xs => xs.find(x => x.value !== "all")?.value ?? null);
    if (!actionOption) throw new Error("No real action filter option");
    await change("prepare-action", () => page.locator("#filter-action-select").selectOption(actionOption));

    keyListenerPage = page;
    await page.evaluate(() => {
      window.__emptyKeys = [];
      window.__emptyKeyHandler = e => window.__emptyKeys.push({ key: e.key, trusted: e.isTrusted, target: e.target.id, atMs: Date.now() });
      document.addEventListener("keydown", window.__emptyKeyHandler, true);
    });

    await change("prepare-keyword", () => page.locator("#filter-keyword-input").fill("빈목록 초기화 검증"));

    // 6. EMPTY-06 & 07 Keyboard Reset
    state.setPhase("empty-keyboard-reset");
    const beforeResetCount = listRows().length;
    const beforeResetSnapshot = await emptySnapshot();

    await page.locator("#btn-refresh-logs").focus();
    await page.keyboard.press("Tab");

    const focusedSnapshot = await emptySnapshot();
    const resetResponse = page.waitForResponse(res => new URL(res.url()).pathname === LIST_PATH);
    const enterAtMs = Date.now();
    await page.keyboard.press("Enter");

    const reset = await resetResponse;
    const resetFinished = await reset.finished();
    if (resetFinished) throw resetFinished;
    await settled();

    const settledAtMs = Date.now();
    await page.waitForTimeout(300);
    await drain();

    const resetObs = {
      enterAtMs,
      settledAtMs,
      checkedAtMs: Date.now(),
      beforeCount: beforeResetCount,
      afterCount: listRows().length,
      requestIds: listRows().slice(beforeResetCount).map(item => item.id),
      before: beforeResetSnapshot,
      focused: focusedSnapshot,
      after: await emptySnapshot(),
      events: await page.evaluate(() => {
        document.removeEventListener("keydown", window.__emptyKeyHandler, true);
        delete window.__emptyKeyHandler;
        return window.__emptyKeys;
      })
    };
    keyListenerPage = null;

    // 7. EMPTY-06 Pending Keyword Toolbar Reset
    state.setPhase("pending-toolbar-reset");
    const pendingBeforeCount = listRows().length;
    await page.locator("#filter-keyword-input").fill("미실행 검색 취소 검증");
    const pendingAtMs = Date.now();

    const pendingSnapshot = await emptySnapshot();
    const pendingResponse = page.waitForResponse(res => new URL(res.url()).pathname === LIST_PATH);
    const resetAtMs = Date.now();
    await page.locator("#btn-filter-reset").click();

    const pendingResult = await pendingResponse;
    const pendingError = await pendingResult.finished();
    if (pendingError) throw pendingError;
    await settled();

    const pendingSettledAtMs = Date.now();
    await page.waitForTimeout(300);
    await drain();

    const pendingResetObs = {
      pendingAtMs,
      resetAtMs,
      settledAtMs: pendingSettledAtMs,
      checkedAtMs: Date.now(),
      beforeCount: pendingBeforeCount,
      afterCount: listRows().length,
      requestIds: listRows().slice(pendingBeforeCount).map(item => item.id),
      before: pendingSnapshot,
      after: await emptySnapshot()
    };

    // 8. EMPTY-08 Fonts & Capture (Network Failure 이전에 수집)
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
    const fontsObs = await page.evaluate(tm => ({
      status: document.fonts.status,
      timeMs: tm,
      viewport: [1440, 900]
    }), fontsTimeMs);

    const origCapPath = await capture("empty-fixture-g2");
    const capBytes = fs.readFileSync(origCapPath);
    const copyCapPath = path.join(context.runDir, "normal-capture-empty-fixture.png");
    const captureObs = {
      path: copyCapPath,
      originalPath: origCapPath,
      bytes: capBytes.length,
      sha256: sha(capBytes),
      atMs: Date.now(),
      width: capBytes.readUInt32BE(16),
      height: capBytes.readUInt32BE(20)
    };

    // 9. Terminal Network Failure (마지막 list 요청 1건을 route.abort('failed')로 유발)
    state.setPhase("network-failure");
    responseMode = "network";
    const networkBeforeCount = listRows().length;
    const failedEventPromise = page.waitForEvent("requestfailed", {
      predicate: r => new URL(r.url()).pathname === LIST_PATH
    });

    // G2 초기화 버튼(#btn-empty-reset)을 클릭하여 loadData(false)를 유발 (users 요청 없이 list만 1건 발생)
    await page.locator("#btn-empty-reset").click();
    const failedReq = await failedEventPromise;
    await page.waitForTimeout(100);

    const netRow = await rawFor(failedReq);
    await until(() => netRow.endedAtMs !== null);
    const netQ = publicRequests.find(q => q.id === netRow.id);
    if (netQ) {
      netQ.status = netRow.status;
      netQ.ok = netRow.ok;
      netQ.responseAtMs = null;
      netQ.body = null;
      netQ.finishedAtMs = netRow.endedAtMs;
    }

    const networkObs = {
      before: networkBeforeCount,
      after: listRows().length,
      requestId: netRow.id,
      errorText: failedReq.failure()?.errorText,
      snapshot: await emptySnapshot()
    };

    life.snapshot();
    state.steps.completedAtMs = Math.max(
      Date.now(),
      networkObs.snapshot?.atMs || 0,
      ...publicRequests.map(q => q.finishedAtMs || 0)
    );

    collectedFacts = {
      collectedAtMs: Date.now(),
      primaryViewport: { width: 1440, height: 900 },
      requests: publicRequests,
      route: routeRegistry,
      observations: {
        loading: loadingObs,
        initial: initialObs,
        past: pastObs,
        reset: resetObs,
        pendingReset: pendingResetObs,
        bridge: bridgeObs,
        network: networkObs,
        fonts: fontsObs
      },
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
      controller.browserObserver = (s, task) => observer(s, async original => {
        b2 = original;
        let first, result;
        try { result = await task(original); } catch(e) { first = e; }
        try { await cleanup(); } catch(e) { first ??= e; }
        for (const restore of patches.reverse()) {
          try { restore(); } catch(e) { failure(e, "cleanup"); first ??= e; }
        }
        patches.length = 0;
        if(first) throw first;
        return result;
      });

      if (!canonical) return;
      controller.publication = publication;
      controller.run = run;

      // Observe the protected worker's actual failure exit. Do not change it.
      process.once("exit", code => {
        if(code !== 2) return;
        try { publishEmptyTerminal(state, publication, { context, caseName: CASE }, code); }
        catch(e) { process.stderr.write(`[publishEmptyTerminal error] ${e.message}\n`); }
      });

      const installLaunch = () => {
        const launch = chromium.launch;
        patch(chromium, "launch", async function(...args) {
          const browser = await launch.apply(this, args);
          const newContext = browser.newContext;
          patch(browser, "newContext", async function(...cArgs) {
            const bCtx = await newContext.apply(this, cArgs);
            requireFact(!pageContext, "CANONICAL_DUPLICATE_CONTEXT");
            pageContext = bCtx;
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
                    failure(e, "cleanup");
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
