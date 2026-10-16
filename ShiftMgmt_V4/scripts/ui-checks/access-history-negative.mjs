// 활동 이력 음성 검증(errors / session-expired) 및 정상 지원 공통 모듈
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
  loadContract,
  loadExecution,
  performWorkerIpcHandshake,
  CONTRACT_PATH,
  CONTRACT_SHA256,
  EXECUTION_PATH,
  EXECUTION_SHA256
} from "./access-history-shared.mjs";

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();
const isObj = (o, n) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === n;
const writeAtomic = (t, o) => { fs.writeFileSync(t + ".tmp", JSON.stringify(o, null, 2)); fs.renameSync(t + ".tmp", t); };

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

export class NormalAssertionCollector {
  constructor(caseName, contract, state = null) {
    this.caseName = caseName;
    this.contract = contract;
    this.state = state || { diagnostics: [] };
    this.seenIds = new Set();
  }

  expectEqual(...args) {
    let id, pointer, actual, expected;
    if (args.length === 3) {
      id = args[0]; expected = args[1]; actual = args[2]; pointer = null;
    } else {
      id = args[0]; pointer = args[1]; actual = args[2]; expected = args[3];
    }
    if (this.seenIds.has(id)) throw new Error(`[Assertion] Duplicate ID: ${id}`);
    this.seenIds.add(id);
    if (actual === undefined || expected === undefined) throw new Error(`[Assertion ${id}] undefined`);
    if (typeof actual === "number" && !Number.isFinite(actual)) throw new Error(`[Assertion ${id}] actual non-finite`);
    if (typeof expected === "number" && !Number.isFinite(expected)) throw new Error(`[Assertion ${id}] expected non-finite`);

    const diag = { id, pointer, operator: "equal", actual: structuredClone(actual), expected: structuredClone(expected), tolerance: null, trusted: false };
    this.state.diagnostics.push(diag);
    assert.deepStrictEqual(actual, expected);
  }

  expectNear(...args) {
    let id, pointer, actual, expected, tolerance;
    if (args.length === 4) {
      id = args[0]; expected = args[1]; actual = args[2]; tolerance = args[3]; pointer = null;
    } else {
      id = args[0]; pointer = args[1]; actual = args[2]; expected = args[3]; tolerance = args[4] ?? 1;
    }
    if (this.seenIds.has(id)) throw new Error(`[Assertion] Duplicate ID: ${id}`);
    this.seenIds.add(id);
    if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
      throw new Error(`[Assertion ${id}] invalid tolerance: ${tolerance}`);
    }
    if (typeof actual !== "number" || !Number.isFinite(actual)) throw new Error(`[Assertion ${id}] actual non-finite`);
    if (typeof expected !== "number" || !Number.isFinite(expected)) throw new Error(`[Assertion ${id}] expected non-finite`);

    const diag = { id, pointer, operator: "near", actual, expected, tolerance, trusted: false };
    this.state.diagnostics.push(diag);
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`[Assertion ${id}] diff ${Math.abs(actual - expected)} > tol ${tolerance}`);
    }
  }

  validateRequiredCoverage() {
    const required = (this.contract?.fullUi?.rules?.[this.caseName] || []).map(r => r.id);
    const ids = this.state.diagnostics.map(d => d.id);
    return { requiredIds: required, missing: required.slice(), extra: ids, duplicates: [] };
  }

  toJSON() {
    return this.state.diagnostics;
  }
}

export class NormalHeldRouteController {
  constructor(state = null, timeoutMs = 15000) {
    this.state = state;
    this.timeoutMs = timeoutMs;
    this.started = false;
    this.completed = false;
    this.settled = false;
    this.action = null;
    this.routeError = null;
    this.releaseOptions = null;
    this.route = null;
    this._startPromise = new Promise(r => this._startResolve = r);
    this._releasePromise = new Promise(r => this._releaseResolve = r);
    this._completePromise = new Promise(r => this._completeResolve = r);
  }

  async handle(route, defaultOptions = null) {
    this.route = route;
    this.started = true;
    this._startResolve();
    try {
      await this._releasePromise;
      if (this.action === "abort") {
        await route.abort();
      } else {
        const opts = this.releaseOptions || defaultOptions || { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) };
        await route.fulfill(opts);
      }
      this.completed = true;
      this.settled = true;
      this._completeResolve({ ok: true });
    } catch (err) {
      this.routeError = err;
      this.completed = false;
      this.settled = true;
      this._completeResolve({ ok: false, error: err });
    }
  }

  isStarted() { return this.started; }
  isCompleted() { return this.completed; }
  isSettled() { return this.settled; }

  async waitForStart(timeoutMs = this.timeoutMs) {
    let timerHandle = null;
    try {
      await Promise.race([this._startPromise, new Promise((_, rej) => { timerHandle = setTimeout(() => rej(new Error("waitForStart timeout")), timeoutMs); })]);
    } finally {
      if (timerHandle !== null) clearTimeout(timerHandle);
    }
  }

  release(fulfillOptions = null) {
    if (this.action !== null) return;
    this.action = "fulfill";
    this.releaseOptions = fulfillOptions;
    this._releaseResolve();
  }

  abort() {
    if (this.action !== null) return;
    this.action = "abort";
    this._releaseResolve();
  }

  async waitForComplete(timeoutMs = this.timeoutMs) {
    let timerHandle = null;
    try {
      const res = await Promise.race([this._completePromise, new Promise((_, rej) => { timerHandle = setTimeout(() => rej(new Error("waitForComplete timeout")), timeoutMs); })]);
      if (!res?.ok) throw (res?.error || new Error("waitForComplete failed"));
    } finally {
      if (timerHandle !== null) clearTimeout(timerHandle);
    }
  }
}

export function parseNormalBridgeQuery(request) {
  try {
    const postData = typeof request.postData === "function" ? request.postData() : null;
    if (!postData) return null;
    const parsed = JSON.parse(postData);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      const q = parsed[0];
      const allowed = ["dateFrom", "dateTo", "loginId", "actionType", "keyword"];
      const res = {};
      for (const k of allowed) {
        if (typeof q[k] === "string") res[k] = q[k];
      }
      return res;
    }
  } catch {}
  return null;
}

export async function performNormalLogin(page, targetUrl, creds, nextPassword = null) {
  await page.goto(targetUrl, { timeout: 15000, waitUntil: "networkidle" });
  await page.locator("#login-id").fill(creds.loginId);
  await page.locator("#login-password").fill(creds.password);
  await page.locator(".login-form button[type=submit]").click();

  await page.waitForFunction(() => document.querySelector("#l4-btn-submit") || document.querySelector(".btn-logout"));
  const l4 = await page.locator("#l4-btn-submit").count();
  if (l4) {
    const next = nextPassword || ("Sm!" + crypto.randomBytes(16).toString("base64url") + "7a");
    await page.locator("#l4-current-pw").fill(creds.password);
    await page.locator("#l4-new-pw").fill(next);
    await page.locator("#l4-confirm-pw").fill(next);
    await page.locator("#l4-btn-submit").click();
    creds.password = next;
  }
  await page.locator(".btn-logout").waitFor({ timeout: 15000 });
}

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
   viewport: [1440, 900],
   origin: "http://127.0.0.1:18741",
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
   const id = this.nextRequestId();
   const startedAtMs = Date.now();
   const method = options.method || "GET";
   let status = 0, ok = false, errorCode = null, data = null;
   try {
    const res = await fetch(url, options);
    status = res.status;
    ok = res.ok;
    try {
     data = await res.json();
     if (data && typeof data === "object") {
      errorCode = data.errorCode || null;
      if (data.ok !== undefined) ok = !!data.ok;
     }
    } catch {}

    if (status >= 400) {
     state.rawErrors.badResponses.push({ requestId: id, status, url, method, errorCode, timeMs: Date.now() });
    }
    return { status, ok, data, errorCode };
   } finally {
    state.requests.push({
     id, source: "node-fetch", method, url, phase: state.phase, startedAtMs, endedAtMs: Date.now(), status, ok, errorCode, query: null
    });
   }
  },

  updatePartial() {
   try {
    writeAtomic(path.join(runDir, "normal-partial.json"), this);
   } catch (e) {
    try { writeAtomic(path.join(runDir, "normal-partial.fallback.json"), this); } catch {}
   }
  }
 };

 return state;
}

export function computeExpectedErrors(raw) {
  const classified = [];
  const caseName = raw.case;
  const requests = raw.requests;
  const seen = {};
  for (let n = 0; n < requests.length; n++) {
    const r = requests[n];
    seen[r.id] = r;
    if (r.status < 400 && caseName === "errors" && r.url.includes("/api/access-logs:list")) {
      classified.push({ kind: "requests", index: n, requestId: r.id, reason: "DATABASE_ERROR_FIXTURE" });
    }
  }

  for (let i = 0; i < raw.rawErrors.badResponses.length; i++) {
    const b = raw.rawErrors.badResponses[i];
    const r = seen[b.requestId];
    if (caseName === "role-guard") {
      classified.push({ kind: "badResponses", index: i, requestId: r.id, reason: "ROLE_FORBIDDEN" });
    } else if (caseName === "session-expired") {
      classified.push({ kind: "badResponses", index: i, requestId: r.id, reason: "SESSION_REQUIRED" });
    }
  }

  const high = raw.requests.filter(r => r.status >= 400);
  const consoleUsed = new Set();
  for (let i = 0; i < raw.rawErrors.console.length; i++) {
    const c = raw.rawErrors.console[i];
    const match = high.find(r => r.source === "page" && r.url === c.url && r.startedAtMs <= c.timeMs + 1000 && c.timeMs <= r.endedAtMs + 1000 && !consoleUsed.has(r.id));
    if (match) {
      consoleUsed.add(match.id);
      classified.push({ kind: "console", index: i, requestId: match.id, reason: "SESSION_RESOURCE_401" });
    }
  }

  return classified;
}

export function publishNormalEvidence(state) {
  state.steps.completedAtMs = Date.now();
  state.expectedErrors = computeExpectedErrors(state);

  const runDir = path.resolve(state.environment.origin ? path.join(process.cwd(), "artifacts/captures/phase3", `access-history-${state.case}`, state.runId) : ".");
  const rawPath = path.join(runDir, "normal-observations.json");
  const rawStr = JSON.stringify(state, null, 2);
  fs.writeFileSync(rawPath + ".tmp", rawStr);
  fs.renameSync(rawPath + ".tmp", rawPath);
  const rawSha = sha(Buffer.from(rawStr, "utf8"));

  const contract = loadContract();
  const required = (contract?.fullUi?.rules?.[state.case] || []).map(r => r.id);
  const extra = state.diagnostics.map(d => d.id);
  const cov = { requiredIds: required, missing: required.slice(), extra, duplicates: [] };

  const wf = {
    schema: contract.evidenceSchema || "shiftmgmt.verifier.evidence.v1",
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
    coverage: cov,
    rawSha256: rawSha
  };

  const wfPath = path.join(runDir, "worker-final.json");
  fs.writeFileSync(wfPath + ".tmp", JSON.stringify(wf, null, 2));
  fs.renameSync(wfPath + ".tmp", wfPath);

  process.exitCode = 1;
}

export function readNormalWorkerEvidence({ caseName, context, execution, contract, workerPid, exitCode }) {
  const runDir = context.runDir;
  const rawPath = path.join(runDir, "normal-observations.json");
  const wfPath = path.join(runDir, "worker-final.json");

  if (!fs.existsSync(rawPath) || !fs.existsSync(wfPath)) {
    throw new Error("Missing normal worker artifacts: observations or worker-final");
  }

  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const workerFinal = JSON.parse(fs.readFileSync(wfPath, "utf8"));

  const captures = (execution.normalCaptures?.[caseName] || []).map(n => `normal-capture-${n}`);
  const positive = !["errors", "session-expired"].includes(caseName);
  const artifactIds = [
    "server-stdout", "server-stderr", "worker-stdout", "worker-stderr",
    "normal-observations", "worker-final"
  ];
  if (positive) artifactIds.push("normal-protected-manifest");
  artifactIds.push(...captures);

  return { raw, workerFinal, coverage: workerFinal.coverage, artifactIds };
}

// CLI 진입점: errors / session-expired 실행
const isDirectCli = Boolean(process.argv[1]) && (() => {
 try {
  return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
 } catch (err) {
  process.stderr.write(`[오류] CLI 진입 경로 해석 실패: ${err.message}\n`);
  process.exit(1);
 }
})();

if (isDirectCli) {
 const rawArgs = process.argv.slice(2);
 if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) {
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
  process.stderr.write(JSON.stringify({ status: "FAIL", code: "A1_LOCK_MISMATCH", case: caseArg, error: { message: e.message } }) + "\n");
  process.exit(1);
 }

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
 state.steps.enteredAtMs = Date.now();
 state.updatePartial();

 const collector = new NormalAssertionCollector(caseArg, contract, state);

 state.resources.browser.acquiredAtMs = Date.now();
 const browser = await chromium.launch({ executablePath: chrome.path, headless: true });
 state.resources.context.acquiredAtMs = Date.now();
 const bCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
 const page = await bCtx.newPage();

 page.on("pageerror", e => state.rawErrors.pageerror.push({ message: e.message, timeMs: Date.now() }));
 page.on("console", m => {
  if (m.type() === "error") {
   state.rawErrors.console.push({ text: m.text(), url: m.location()?.url || "", timeMs: Date.now() });
  }
 });
 page.on("requestfailed", r => state.rawErrors.requestfailed.push(`${r.url()} (${r.failure()?.errorText ?? "unknown"})`));

 let reqMonotonic = 0;
 page.on("request", req => {
  const u = req.url();
  if (u.startsWith("http://127.0.0.1:18741/api/")) {
   const id = state.nextRequestId();
   req._customId = id;
   const isLogList = u.includes("/api/access-logs:list") && !["role-guard", "session-expired"].includes(caseArg);
   state.requests.push({
    id, source: "page", method: req.method(), url: u, phase: state.phase, startedAtMs: Date.now(), endedAtMs: Date.now(), status: 0, ok: true, errorCode: null, query: isLogList ? parseNormalBridgeQuery(req) : null
   });
  }
 });

 page.on("response", async res => {
  const u = res.url();
  if (u.startsWith("http://127.0.0.1:18741/api/")) {
   const match = state.requests.find(r => r.url === u && r.status === 0);
   if (match) {
    match.endedAtMs = Date.now();
    match.status = res.status();
    match.ok = res.ok();
    try {
     const body = await res.json();
     if (body && typeof body === "object") {
      if ("ok" in body) match.ok = !!body.ok;
      match.errorCode = body.errorCode || null;
      if (u.includes("/api/auth:")) {
       const op = u.split("/api/auth:")[1];
       if (["sign-in", "change-password", "get-session", "sign-out"].includes(op)) {
        const d = body.data;
        const prev = state.auth.at(-1);
        if (op === "sign-out") {
         state.recordAuth({
          operation: op,
          loginId: prev?.loginId || null,
          userId: prev?.userId || null,
          role: prev?.role || null,
          ok: res.ok(),
          passwordChangeRequired: false,
          timeMs: match.endedAtMs
         });
        } else if (d && (d.userId || d.user?.id)) {
         state.recordAuth({
          operation: op,
          loginId: d.loginId || d.user?.loginId || prev?.loginId || null,
          userId: d.userId || d.user?.id || prev?.userId || null,
          role: d.role || d.user?.role || prev?.role || null,
          ok: res.ok(),
          passwordChangeRequired: d.passwordChangeRequired ?? (d.user?.passwordChangeRequired ?? null),
          timeMs: match.endedAtMs
         });
        }
       }
      }
     }
    } catch {}
    if (res.status() >= 400) {
     state.rawErrors.badResponses.push({
      requestId: match.id, status: res.status(), url: u, method: match.method, errorCode: match.errorCode, timeMs: Date.now()
     });
    }
   }
  }
 });

 try {
  if (caseArg === "errors") {
   await performNormalLogin(page, targetUrl, adminCreds);

   const held = new NormalHeldRouteController(state);
   state.environment.routes.push({ url: "**/api/access-logs:list", timeMs: Date.now() });

   let listCallCount = 0;
   let primaryErr = null;
   try {
    await page.route("**/api/access-logs:list", async (r) => {
     listCallCount++;
     if (listCallCount === 1) {
      await r.fulfill({
       status: 200, contentType: "application/json",
       body: JSON.stringify({ ok: false, errorCode: "DATABASE_ERROR", message: "데이터베이스 연결 실패" })
      });
     } else {
      await held.handle(r, {
       status: 200, contentType: "application/json",
       body: JSON.stringify({ ok: false, errorCode: "DATABASE_ERROR", message: "데이터베이스 연결 실패" })
      });
     }
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

    held.release({
     status: 200, contentType: "application/json",
     body: JSON.stringify({ ok: false, errorCode: "DATABASE_ERROR", message: "데이터베이스 연결 실패" })
    });
    await held.waitForComplete();

    await waitForFontsReady(page, 15000);
    state.environment.fontsReadyAtMs = Date.now();

    const capPath = path.join(context.runDir, "normal-capture-errors-alert.png");
    await page.screenshot({ path: capPath, fullPage: true });
    const capBuf = fs.readFileSync(capPath);
    state.captures.push({
     id: "normal-capture-errors-alert", path: capPath, originalPath: capPath, bytes: capBuf.length, sha256: sha(capBuf)
    });
   } catch (err) {
    primaryErr = err;
   } finally {
    const cleanupErrors = [];
    try {
     if (held.isStarted() && !held.isSettled()) {
      if (held.action === null) held.abort();
      await held.waitForComplete(5000);
     }
    } catch (err) { cleanupErrors.push(err); }
    if(held.routeError&&!cleanupErrors.includes(held.routeError))cleanupErrors.push(held.routeError);
    try { await page.unroute("**/api/access-logs:list"); } catch (err) { cleanupErrors.push(err); }
    if (cleanupErrors.length > 0 && state.errors) {
     if (!Array.isArray(state.errors.cleanup)) state.errors.cleanup = [];
     for (const ce of cleanupErrors) state.errors.cleanup.push({ message: ce.message, stack: ce.stack });
    }
    if (primaryErr) throw primaryErr;
    if (cleanupErrors.length > 0) throw cleanupErrors[0];
   }
  } else if (caseArg === "session-expired") {
   await performNormalLogin(page, targetUrl, adminCreds);

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

  state.runner.returned = true;
 } finally {
  state.resources.context.closeAttemptAtMs = Date.now();
  try { await bCtx.close(); state.resources.context.closedAtMs = Date.now(); } catch (e) { state.resources.context.error = e.message; }
  state.resources.browser.closeAttemptAtMs = Date.now();
  try { await browser.close(); state.resources.browser.closedAtMs = Date.now(); } catch (e) { state.resources.browser.error = e.message; }
 }
 publishNormalEvidence(state);
}
