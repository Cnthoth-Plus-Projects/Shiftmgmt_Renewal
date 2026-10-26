import { createErrorsRun } from "./access-history-errors-observer.mjs";
import { classifyCanonicalErrors, publishCanonicalEvidence } from "./access-history-evidence-dispatch.mjs";
import { withNegativeLifecycle } from "./access-history-lifecycle.mjs";
import { NormalHeldRouteController } from "./access-history-held.mjs";
export { NormalHeldRouteController };
// 활동 이력 음성 검증(errors / session-expired) 및 정상 지원 공통 모듈
import { evidenceJSON as aj } from "../lib/artifact-privacy.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { loadContract, loadExecution, performWorkerIpcHandshake, CONTRACT_PATH, CONTRACT_SHA256, EXECUTION_PATH, EXECUTION_SHA256 } from "./access-history-shared.mjs";
import { NormalAssertionCollector, readNormalWorkerEvidence, createNormalPageObserver } from "./access-history-positive.mjs";
import { RAW_KEYS, rejectG1, validateNormalEvidenceState } from "./access-history-g1.mjs";
export { NormalAssertionCollector, readNormalWorkerEvidence, validateNormalEvidenceState };

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();
const isObj = (o, n) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === n;
const writeAtomic = (t, o) => { fs.writeFileSync(t + ".tmp", aj(o, null, 2)); fs.renameSync(t + ".tmp", t); };

export function validateProcessReceipt(r) {
  const q = ok => { if (!ok) throw new Error("process receipt invalid"); }, ev = r?.callbackEvents, K = ["stdout", "stderr"];
  q(Array.isArray(ev) && ev.length === 7 && Number.isInteger(r.pid) && r.pid > 0);
  q(isObj(r.logsSettled, 2) && K.every(k => Object.hasOwn(r.logsSettled, k) && r.logsSettled[k] === true));
  const sg = {}, lg = {}, EK = ["event", "timeMs", "stream", "pid", "code", "signal", "error"];
  for (const e of ev) {
    q(isObj(e, 7) && EK.every(k => Object.hasOwn(e, k)) && Number.isFinite(e.timeMs) && e.timeMs > 0 && e.error === null);
    const k = e.event;
    q(["spawn", "exit", "close", "log-finish", "log-close"].includes(k));
    if (k.startsWith("log-")) { q(K.includes(e.stream) && e.pid === null && e.code === null && e.signal === null && !lg[k + e.stream]); lg[k + e.stream] = e; }
    else { q(e.stream === null && e.pid === r.pid && !sg[k]); sg[k] = e; q(e.code === null || Number.isInteger(e.code)); q(e.signal === null || typeof e.signal === "string" && !!e.signal); if (k === "spawn") q(e.code === null && e.signal === null); }
  }
  for (const [k, sn, tm, ck, sk] of [["spawn", null, "createdAtMs", null, null], ["exit", "exitSeen", "exitAtMs", "exitCode", "exitSignal"], ["close", "closeSeen", "closeAtMs", "closeCode", "closeSignal"]]) { const e = sg[k]; q(!!e && r[tm] === e.timeMs); if (sn) q(r[sn] === true && r[ck] === e.code && r[sk] === e.signal); }
  for (const [k, p] of [["log-finish", "logFinish"], ["log-close", "logClose"]]) { q(isObj(r[p + "Seen"], 2) && isObj(r[p + "AtMs"], 2)); for (const t of K) { const e = lg[k + t]; q(!!e && Object.hasOwn(r[p + "Seen"], t) && Object.hasOwn(r[p + "AtMs"], t) && r[p + "Seen"][t] === true && r[p + "AtMs"][t] === e.timeMs); } }
  q(ev[0].event === "spawn" && ev[1].event === "exit" && ev[2].event === "close" && r.aliveAfterClose === false);
  for (let i = 1; i < ev.length; i++) q(ev[i].timeMs >= ev[i - 1].timeMs);
  for (const t of K) { const e = ev.filter(e => e.stream === t); q(e.length === 2 && e[0].event === "log-finish" && e[1].event === "log-close" && r.closeAtMs <= r.logFinishAtMs[t] && r.logFinishAtMs[t] <= r.logCloseAtMs[t]); }
  q(r.createdAtMs <= r.exitAtMs && r.exitAtMs <= r.closeAtMs); return 7;
}

export function parseNormalBridgeQuery(request) {
  let postData = null;
  if (typeof request.postDataJSON === "function") {
    postData = request.postDataJSON();
  } else if (typeof request.postData === "function") {
    const raw = request.postData();
    if (raw) postData = JSON.parse(raw);
  }
  if (!postData) return null;
  if (!Array.isArray(postData) || postData.length !== 1) {
    throw new Error("Invalid query array shape");
  }
  const q = postData[0];
  if (typeof q !== "object" || q === null || Array.isArray(q)) {
    throw new Error("Query item must be plain object");
  }
  const allowed = new Set(["dateFrom", "dateTo", "loginId", "actionType", "keyword"]);
  const res = {};
  for (const k of Object.keys(q)) {
    if (!allowed.has(k)) {
      throw new Error("Unknown query field: " + k);
    }
    if (typeof q[k] !== "string") {
      throw new Error("Query field must be string: " + k);
    }
    res[k] = q[k];
  }
  return res;
}

export async function performNormalLogin(page, targetUrl, creds, nextPassword = null, registerSecret = () => {}) {
  await registerSecret(creds.password);
  await page.goto(targetUrl, { timeout: 15000, waitUntil: "networkidle" });
  await page.locator("#login-id").fill(creds.loginId);
  await page.locator("#login-password").fill(creds.password);
  await page.locator(".login-form button[type=submit]").click();

  await page.waitForFunction(() => document.querySelector("#l4-btn-submit") || document.querySelector(".btn-logout"));
  const l4 = await page.locator("#l4-btn-submit").count();
  if (l4) {
    const next = nextPassword || ("Sm!" + crypto.randomBytes(16).toString("base64url") + "7a");
    await registerSecret(next);
    await page.locator("#l4-current-pw").fill(creds.password);
    await page.locator("#l4-new-pw").fill(next);
    await page.locator("#l4-confirm-pw").fill(next);
    await page.locator("#l4-btn-submit").click();
    creds.password = next;
  }
  await page.locator(".btn-logout").waitFor({ timeout: 15000 });
}

const observerContextMap = new WeakMap();
const normalRegistrationMap = new WeakMap();

export function installNormalObserver({ context, caseName, contract, execution, nonceSha256, chromeInfo }) {
  const repoRoot = fs.realpathSync(context.repository);
  const runDir = context.runDir;
  const contextSha256 = sha(JSON.stringify(context));
  let reqSeq = 0;

  const state = {
    schema: "shiftmgmt.normal.raw.v1",
    case: caseName,
    runId: path.basename(runDir),
    contractSha256: CONTRACT_SHA256,
    executionSha256: EXECUTION_SHA256,
    contextSha256,
    workerPid: process.pid,
    phase: "scenario",
    steps: { enteredAtMs: null, completedAtMs: null },
    environment: {
      viewport: null,
      origin: null,
      chrome: { path: chromeInfo?.path || "", version: chromeInfo?.version || "" },
      fontsReadyAtMs: null,
      routes: []
    },
    auth: [],
    requests: [],
    rawErrors: { console: [], pageerror: [], requestfailed: [], badResponses: [] },
    expectedErrors: [],
    diagnostics: [],
    resources: {
      context: { acquiredAtMs: null, closeAttemptAtMs: null, closedAtMs: null, error: null },
      browser: { acquiredAtMs: null, closeAttemptAtMs: null, closedAtMs: null, error: null }
    },
    captures: [],
    runner: {
      kind: ["errors", "session-expired"].includes(caseName) ? "owned-negative" : "protected-ui-check",
      script: "",
      scriptSha256: "",
      returned: false,
      manifest: null
    },
    errors: { primary: null, cleanup: [], evidence: [], unexpected: [] },

    setPhase(p) { this.phase = p; },
    nextRequestId() { return ++reqSeq; },

    recordAuth(entry) {
      this.auth.push({
        operation: entry.operation,
        loginId: entry.loginId || null,
        userId: entry.userId || null,
        role: entry.role || null,
        ok: !!entry.ok,
        passwordChangeRequired: entry.passwordChangeRequired ?? null,
        timeMs: entry.timeMs || Date.now()
      });
    },

    async fetch(url, options = {}) {
      const id = this.nextRequestId(), startedAtMs = Date.now(), callPhase = state.phase;
      let reqMethod = options.method ? String(options.method).toUpperCase() : "GET";
      let targetUrl = String(url);
      try {
        const dummy = new Request(url, { method: reqMethod });
        targetUrl = dummy.url;
        reqMethod = dummy.method;
      } catch {}
      const req = {
        id, source: "node-fetch", method: reqMethod, url: targetUrl,
        phase: callPhase, startedAtMs, endedAtMs: null, status: 0,
        ok: null, errorCode: null, query: null
      };
      state.requests.push(req);

      if (options.signal?.aborted) {
        req.endedAtMs = Date.now();
        state.errors.unexpected.push({ code: "G2_HTTP_FAILED", kind: "node-fetch", phase: callPhase, requestId: id });
        throw options.signal.reason;
      }

      const ownedAc = new AbortController();
      let timer = null, onCallerAbort = null;
      let terminal = null;

      const settle = (term) => {
        if (!terminal) terminal = term;
      };

      const timeoutErr = new Error("G2_HTTP_TIMEOUT");
      timeoutErr.code = "G2_HTTP_TIMEOUT";

      const abortOrTimeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          settle({ kind: "OWN_TIMEOUT", val: timeoutErr });
          try { ownedAc.abort(timeoutErr); } catch {}
          reject(timeoutErr);
        }, 5000);

        if (options.signal) {
          onCallerAbort = () => {
            settle({ kind: "CALLER_ABORT", val: options.signal.reason });
            try { ownedAc.abort(options.signal.reason); } catch {}
            reject(options.signal.reason);
          };
          if (options.signal.aborted) {
            onCallerAbort();
          } else {
            options.signal.addEventListener("abort", onCallerAbort, { once: true });
          }
        }
      });
      abortOrTimeoutPromise.catch(() => {});

      const opPromise = (async () => {
        const fetchOpts = Object.assign({}, options, { signal: ownedAc.signal });
        let res;
        try {
          res = await fetch(targetUrl, fetchOpts);
        } catch (fetchErr) {
          settle({ kind: "TRANSPORT", val: fetchErr });
          throw fetchErr;
        }
        if (!terminal) req.status = res.status;
        let body;
        try {
          body = await res.json();
        } catch (jsonErr) {
          settle({ kind: "BODY_INVALID_REJECTION", val: jsonErr });
          throw jsonErr;
        }
        return { res, body };
      })();
      opPromise.catch(() => {});

      try {
        const { res, body } = await Promise.race([opPromise, abortOrTimeoutPromise]);

        if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.ok !== "boolean" ||
            (body.errorCode !== undefined && body.errorCode !== null && typeof body.errorCode !== "string")) {
          const err = new Error("G2_HTTP_BODY_INVALID");
          err.code = "G2_HTTP_BODY_INVALID";
          settle({ kind: "BODY_INVALID_SHAPE", val: err });
          throw err;
        }

        settle({ kind: "SUCCESS" });
        req.ok = body.ok;
        req.errorCode = body.errorCode ?? null;
        req.endedAtMs = Date.now();

        if (req.status >= 400) {
          state.rawErrors.badResponses.push({
            requestId: id, status: req.status, url: req.url, method: req.method,
            errorCode: req.errorCode, timeMs: Date.now()
          });
        }

        return {
          status: res.status,
          ok: res.status >= 200 && res.status <= 299,
          data: body,
          errorCode: req.errorCode
        };
      } catch (err) {
        req.endedAtMs = Date.now();
        req.ok = null;
        req.errorCode = null;

        if (req.status >= 400) {
          state.rawErrors.badResponses.push({
            requestId: id, status: req.status, url: req.url, method: req.method,
            errorCode: null, timeMs: Date.now()
          });
        }

        const terminalKind = terminal ? terminal.kind : "TRANSPORT";
        let markerCode = "G2_HTTP_FAILED";
        if (terminalKind === "OWN_TIMEOUT") {
          markerCode = "G2_HTTP_TIMEOUT";
        } else if (terminalKind === "BODY_INVALID_REJECTION" || terminalKind === "BODY_INVALID_SHAPE") {
          markerCode = "G2_HTTP_BODY_INVALID";
        } else {
          markerCode = "G2_HTTP_FAILED";
        }

        state.errors.unexpected.push({
          code: markerCode, kind: "node-fetch", phase: callPhase, requestId: id
        });

        if (terminal && "val" in terminal) {
          throw terminal.val;
        }
        throw err;
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (options.signal && onCallerAbort) {
          options.signal.removeEventListener("abort", onCallerAbort);
        }
      }
    },

    async updatePartial() {
      let err1 = null, err2 = null;
      try {
        writeAtomic(path.join(runDir, "normal-partial.json"), this);
      } catch (e) {
        err1 = e;
        this.errors.evidence.push({ kind: "partial-primary", message: e.message, stack: e.stack });
        try {
          writeAtomic(path.join(runDir, "normal-partial.fallback.json"), this);
        } catch (e2) {
          err2 = e2;
          this.errors.evidence.push({ kind: "partial-fallback", message: e2.message, stack: e2.stack });
          process.stderr.write(aj({ status: "FAIL", code: "PARTIAL_WRITE_FAILED", errors: [err1.message, err2.message] }) + "\n");
          throw new Error(`Double partial write failed: ${err1.message}; ${err2.message}`);
        }
      }
    }
  };

  normalRegistrationMap.set(state, { context: structuredClone(context), caseName }); observerContextMap.set(state, context); return state;
}

export function computeExpectedErrors(raw) {
  const classified = [], caseName = raw.case, requests = raw.requests, seen = {};
  const origin = new URL(loadExecution().url).origin;
  const u1 = origin + "/api/access-logs:list", u2 = origin + "/api/operations:list-users";
  const validPhases = new Set(["role-operator-direct", "role-planner-direct", "role-reviewer-direct"]);

  const isRole = r => (
    r.source === "node-fetch" && r.method === "POST" && r.status === 200 &&
    r.ok === false && r.errorCode === "AUTH_FORBIDDEN" && r.query === null &&
    validPhases.has(r.phase) && (r.url === u1 || r.url === u2)
  );

  const eligibleCounts = new Map();
  if (caseName === "role-guard") {
    for (const r of requests) {
      if (isRole(r)) {
        const k = r.phase + "|" + r.url;
        eligibleCounts.set(k, (eligibleCounts.get(k) || 0) + 1);
      }
    }
  }

  for (let n = 0; n < requests.length; n++) {
    const r = requests[n];
    seen[r.id] = r;
    if (caseName === "role-guard") {
      if (isRole(r) && eligibleCounts.get(r.phase + "|" + r.url) === 1) {
        classified.push({ kind: "requests", index: n, requestId: r.id, reason: "ROLE_FORBIDDEN" });
      }
    } else if (caseName === "errors") {
      if (r.status < 400 && r.url.includes("/api/access-logs:list")) {
        classified.push({ kind: "requests", index: n, requestId: r.id, reason: "DATABASE_ERROR_FIXTURE" });
      }
    }
  }

  if (caseName === "session-expired") {
    for (let i = 0; i < raw.rawErrors.badResponses.length; i++) {
      const b = raw.rawErrors.badResponses[i], r = seen[b.requestId];
      if (r) classified.push({ kind: "badResponses", index: i, requestId: r.id, reason: "SESSION_REQUIRED" });
    }

    const high = requests.filter(r => r.status >= 400), consoleUsed = new Set();
    for (let i = 0; i < raw.rawErrors.console.length; i++) {
      const c = raw.rawErrors.console[i];
      const match = high.find(r => r.source === "page" && r.url === c.url && r.startedAtMs <= c.timeMs + 1000 && c.timeMs <= r.endedAtMs + 1000 && !consoleUsed.has(r.id));
      if (match) {
        consoleUsed.add(match.id);
        classified.push({ kind: "console", index: i, requestId: match.id, reason: "SESSION_RESOURCE_401" });
      }
    }
  }

  return classified;
}

export async function publishNormalEvidence(state, publication = null) {
  if (!normalRegistrationMap.has(state)) rejectG1("registration");
  const { context: ctx, caseName: cn } = normalRegistrationMap.get(state);
  const contract = loadContract();
  const execution = loadExecution();
  const P = { context: ctx, caseName: cn, contract, execution, expectedPid: process.pid, mode: "publisher" };
  validateNormalEvidenceState(state, P);
  state.expectedErrors=publication?classifyCanonicalErrors(state,{case:state.case,...publication.readFacts()}).expectedErrors:computeExpectedErrors(state);
  const coverage = validateNormalEvidenceState(state, P);
  const rawProj = {};
  for (const k of RAW_KEYS) rawProj[k] = state[k];
  const rd = ctx.runDir;
  const rs = aj(rawProj, null, 2);
  const w = (f, d) => writeAtomic(path.join(rd, f), d);
  w("normal-observations.json", rawProj);
  if(publication)return publishCanonicalEvidence(state,publication,normalRegistrationMap.get(state));
  w("worker-final.json", {
    schema: contract.evidenceSchema,
    stageSlice: "A2",
    case: state.case,
    runId: state.runId,
    contractSha256: CONTRACT_SHA256,
    executionSha256: EXECUTION_SHA256,
    contextSha256: state.contextSha256,
    workerPid: process.pid,
    status: "FAIL_INCOMPLETE",
    exitCode: 1,
    checks: [],
    coverage,
    rawSha256: sha(rs)
  });
  process.exitCode = 1;
}
// B2_BROWSER_BINDING_BEGIN
export async function withNormalBrowserObservation(state, task) {
  const PW = await import("playwright");
  const capturedLaunch = PW.chromium.launch;
  let activeObservation = null, browserInstance = null, capturedNewContext = null, runGate = null, targetContext = null, onPageHandler = null;
  const pages = [];
  const cleanup = () => {
    runGate = null;
    if (targetContext && onPageHandler) {
      try { targetContext.removeListener("page", onPageHandler); } catch {}
    }
    for (const item of pages) {
      try {
        if (item.hadOwn) Object.defineProperty(item.page, "goto", item.origDesc);
        else delete item.page.goto;
      } catch {}
    }
    pages.length = 0;
  };
  const regHook = (g) => {
    runGate = g;
    return cleanup;
  };

  const injectedLaunch = async function(...args) {
    const browser = await capturedLaunch.apply(this, args);
    browserInstance = browser;
    capturedNewContext = browser.newContext;
    browser.newContext = async function(...ctxArgs) {
      const bCtx = await capturedNewContext.apply(this, ctxArgs);
      targetContext = bCtx;
      activeObservation = createNormalPageObserver(state, bCtx, regHook);
      onPageHandler = (page) => {
        const origGoto = page.goto;
        const hadOwn = Object.prototype.hasOwnProperty.call(page, "goto");
        const origDesc = hadOwn ? Object.getOwnPropertyDescriptor(page, "goto") : null;
        pages.push({ page, origGoto, hadOwn, origDesc });
        page.goto = function(...gArgs) {
          return runGate ? runGate(() => origGoto.apply(this, gArgs)) : origGoto.apply(this, gArgs);
        };
      };
      bCtx.on("page", onPageHandler);
      return bCtx;
    };
    return browser;
  };

  PW.chromium.launch = injectedLaunch;

  const controller = {
    drain: () => activeObservation ? activeObservation.drain() : Promise.reject(Object.assign(new Error("G2_PAGE_BINDING_INVALID"), { code: "G2_PAGE_BINDING_INVALID" })),
    dispose: () => { cleanup(); if (activeObservation) activeObservation.dispose(); }
  };

  try {
    return await task(controller);
  } finally {
    PW.chromium.launch = capturedLaunch;
    if (browserInstance && capturedNewContext) browserInstance.newContext = capturedNewContext;
    cleanup();
    if (activeObservation) activeObservation.dispose();
  }
}
// B2_BROWSER_BINDING_END
const selfReal = fs.realpathSync(fileURLToPath(import.meta.url));
const entryReal = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : "";
if (entryReal && selfReal === entryReal) {
  const rawArgs = process.argv.slice(2);
  const canonicalErrors = rawArgs.length === 2 && rawArgs[0] === "--case=errors" && rawArgs[1] === "--evidence=canonical-errors-v1";
  if ((!canonicalErrors && rawArgs.length !== 1) || !rawArgs[0].startsWith("--case=")) {
    process.stderr.write("[오류] 정확히 단일 --case=<케이스> 인수가 필요합니다.\n");
    process.exit(1);
  }

  const caseArg = rawArgs[0].slice(7);
  if (!caseArg || caseArg.trim() !== caseArg) {
    process.stderr.write("[오류] 유효하지 않은 케이스명입니다.\n");
    process.exit(1);
  }

  let contract, execution;
  try {
    contract = loadContract();
    execution = loadExecution();
  } catch (e) {
    process.stderr.write(aj({ status: "FAIL", code: "A1_LOCK_MISMATCH", case: caseArg, error: { message: e.message } }) + "\n");
    process.exit(1);
  }

  const errorsRun = canonicalErrors ? createErrorsRun({argv:rawArgs}) : null;
  if(errorsRun) errorsRun.validate(execution,contract);
  const NEGATIVE_CASES = new Set(contract.privateCases?.["access-history-negative.mjs"] || ["errors", "session-expired"]);
  if (!NEGATIVE_CASES.has(caseArg)) {
    process.stderr.write(`[오류] 등록되지 않은 케이스: '${caseArg}'\n`);
    process.exit(1);
  }

  const { context, nonceSha256 } = await performWorkerIpcHandshake(caseArg, contract);
  const targetUrl = context.url;
  const bootstrapFile = context.bootstrapFile;
  const credentials = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
  const adminCreds = { ...credentials.credentials["user-admin"] };

  const repoRoot = fs.realpathSync(context.repository);
  const { findChrome } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/find-chrome.mjs")).href);
  const { waitForFontsReady } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/ui-check.mjs")).href);
  const chrome = findChrome();

  const state = installNormalObserver({ context, caseName: caseArg, contract, execution, nonceSha256, chromeInfo: chrome });
  state.runner.script = fileURLToPath(import.meta.url);
  state.runner.scriptSha256 = sha(fs.readFileSync(state.runner.script));

  if(errorsRun){
    await errorsRun.run({state,context,adminCreds,withNegativeLifecycle,chromium,createNormalPageObserver,performNormalLogin,waitForFontsReady});
  }else{
  const collector = new NormalAssertionCollector(caseArg, contract, state);

  await withNegativeLifecycle(state, context, async (life) => {
    const browser = await life.acquire("browser", () => chromium.launch({ executablePath: chrome.path, headless: true }));
    const bCtx = await life.acquire("context", () => browser.newContext({ viewport: { width: 1440, height: 900 } }));
    const observation = await life.acquire("observer", () => createNormalPageObserver(state, bCtx));
    const page = await life.acquire("page", () => bCtx.newPage());
    const vp = page.viewportSize();
    state.environment.viewport = vp ? [vp.width, vp.height] : [1440, 900];
    state.environment.origin = "http://127.0.0.1:18741";

    life.enterSteps();
    if (caseArg === "errors") {
      await performNormalLogin(page, targetUrl, adminCreds, null, life.registerSecret);

      const held = new NormalHeldRouteController(state);
      state.environment.routes.push({ url: "**/api/access-logs:list", timeMs: Date.now() });

      const dbErr = { status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, errorCode: "DATABASE_ERROR", message: "데이터베이스 연결 실패" }) };
      let listCallCount = 0;
      await page.route("**/api/access-logs:list", async (r) => {
        listCallCount++;
        if (listCallCount === 1) await r.fulfill(dbErr);
        else await held.handle(r, dbErr).catch(() => {});
      });

      await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      await page.locator(".access-history-alert-container").waitFor();

      const bannerCount = await page.locator(".access-history-alert-container .alert-danger, .access-history-alert-container [role='alert']").count();
      collector.expectEqual("errors-alert-banner-rendered", "/errors/banner", bannerCount > 0, true);

      const g2Count = await page.locator("#state-g2-empty").count();
      collector.expectEqual("errors-g2-not-rendered", "/errors/g2", g2Count, 0);

      const retryBtn = page.locator("#btn-retry-logs, #btn-retry-load-logs, .access-history-alert-container button").first();
      await retryBtn.click();
      await held.waitForStart();

      const isDisabled = await retryBtn.evaluate(b => b.disabled).catch(() => true);
      collector.expectEqual("errors-retry-native-disabled-true", "/errors/retryDisabled", isDisabled, true);

      const beforeReqCount = state.requests.filter(r => r.url.includes("api/access-logs:list")).length;
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      try { await retryBtn.evaluate(b => b.click()); } catch {}
      const afterReqCount = state.requests.filter(r => r.url.includes("api/access-logs:list")).length;

      collector.expectEqual("errors-retry-duplicate-clicks-single-request", "/errors/retryCount", afterReqCount - beforeReqCount <= 0, true);

      held.release(dbErr);
      await held.waitForComplete();

      await waitForFontsReady(page, 15000);
      state.environment.fontsReadyAtMs = Date.now();

      const capPath = path.join(context.runDir, "normal-capture-errors-alert.png");
      await page.screenshot({ path: capPath, fullPage: true });
      const capBuf = fs.readFileSync(capPath);
      state.captures.push({
        id: "normal-capture-errors-alert", path: capPath, originalPath: capPath, bytes: capBuf.length, sha256: sha(capBuf)
      });
    } else if (caseArg === "session-expired") {
      await performNormalLogin(page, targetUrl, adminCreds, null, life.registerSecret);

      await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      await page.locator("#table-access-logs").waitFor();

      const cookies = await bCtx.cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

      const signOutRes = await state.fetch(`${targetUrl}api/auth:sign-out`, {
        method: "POST",
        headers: { Cookie: cookieHeader, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
        body: JSON.stringify([])
      });
      collector.expectEqual("session-server-signout-ok", "/session/signOutOk", signOutRes.ok, true);
      state.recordAuth({ operation: "sign-out", loginId: adminCreds.loginId, userId: "user-admin", role: "admin", ok: true, timeMs: Date.now() });

      state.setPhase("session-refresh");
      await page.locator("#btn-refresh-logs").click();
      await page.locator("#login-id").waitFor({ timeout: 15000 });

      const count401 = state.requests.filter(r => r.phase === "session-refresh" && r.status === 401 && r.url.includes("api/access-logs:list")).length;
      collector.expectEqual("session-actual-401-count-exact-1", "/session/count401", count401, 1);
      collector.expectEqual("session-login-screen-rendered", "/session/loginRendered", await page.locator("#login-id").count(), 1);
      collector.expectEqual("session-table-dom-cleared", "/session/tableCleared", await page.locator("#table-access-logs").count(), 0);

      state.setPhase("session-no-cookie");
      const noCookieRes = await state.fetch(`${targetUrl}api/access-logs:list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
        body: JSON.stringify([{}])
      });
      collector.expectEqual("session-no-cookie-rejected-401", "/session/noCookie401", noCookieRes.status === 401 && noCookieRes.errorCode === "AUTH_SESSION_REQUIRED", true);

      await waitForFontsReady(page, 15000);
      state.environment.fontsReadyAtMs = Date.now();

      const capPath = path.join(context.runDir, "normal-capture-session-expired-login.png");
      await page.screenshot({ path: capPath, fullPage: true });
      const capBuf = fs.readFileSync(capPath);
      state.captures.push({
        id: "normal-capture-session-expired-login", path: capPath, originalPath: capPath, bytes: capBuf.length, sha256: sha(capBuf)
      });
    }

    await observation.drain();
    state.steps.completedAtMs = Date.now();
  }, [adminCreds.password]);

  state.runner.returned = true;
  await publishNormalEvidence(state);
  }
}
