// 활동 이력 UI 검증 공통 모듈: 외부 계약 로더, 엄격 비교기, 도메인 정본 픽스처, IPC 가드 및 Contract-Core 실행기
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findChrome } from "../lib/find-chrome.mjs";
import { waitForFontsReady } from "../lib/ui-check.mjs";

export const CONTRACT_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-v1\\contract.json";
export const CONTRACT_SHA256 = "014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE";
export const EXECUTION_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-v1\\execution.json";
export const EXECUTION_SHA256 = "FDBBC4B9A93E58B1AE50AEE2925BC1CA676AE34503EB7BA6147F0C523C09619D";

function sha(d) {
  return crypto.createHash("sha256").update(d).digest("hex").toUpperCase();
}

export function loadContract() {
  if (!fs.existsSync(CONTRACT_PATH)) throw new Error(`Missing: ${CONTRACT_PATH}`);
  const b = fs.readFileSync(CONTRACT_PATH), h = sha(b);
  if (h !== CONTRACT_SHA256) throw new Error(`Hash mismatch: ${h}`);
  return JSON.parse(b.toString("utf8"));
}

export function loadExecution() {
  if (!fs.existsSync(EXECUTION_PATH)) throw new Error(`Missing: ${EXECUTION_PATH}`);
  const b = fs.readFileSync(EXECUTION_PATH), h = sha(b);
  if (h !== EXECUTION_SHA256) throw new Error(`Hash mismatch: ${h}`);
  return JSON.parse(b.toString("utf8"));
}

export const CANONICAL_8_ACTIONS = [
  { actionType: "performance-approve", label: "실적 승인", badgeClass: "badge-approved" },
  { actionType: "performance-reapprove", label: "실적 승인 확정", badgeClass: "badge-approved" },
  { actionType: "performance-hide-approved", label: "승인완료 목록삭제", badgeClass: "badge-danger" },
  { actionType: "schedule-publish", label: "근무표 배포", badgeClass: "badge-info" },
  { actionType: "sign-in", label: "로그인", badgeClass: "badge-neutral" },
  { actionType: "route-view", label: "화면 이동", badgeClass: "badge-neutral" },
  { actionType: "performance-reject", label: "실적 반려", badgeClass: "badge-danger" },
  { actionType: "site-save", label: "근무지 저장", badgeClass: "badge-info" },
];

/** 모의 활동 이력 픽스처 생성 (고유 201행, 정본 라벨 사용) */
export function createMockAccessLogs(count = 201) {
  const baseTime = Date.parse("2026-09-15T12:00:00.000Z");
  const logs = [];
  for (let i = 0; i < count; i++) {
    const act = CANONICAL_8_ACTIONS[i % 8];
    logs.push({
      id: `log-record-${i + 1}`,
      userId: `user-${(i % 10) + 1}`,
      loginId: `user${(i % 10) + 1}`,
      displayName: `사용자${(i % 10) + 1}`,
      role: i % 4 === 0 ? "admin" : i % 4 === 1 ? "operator" : i % 4 === 2 ? "planner" : "reviewer",
      actionType: act.actionType,
      actionLabel: act.label,
      routeKey: `route-${(i % 5) + 1}`,
      routeLabel: `화면 ${(i % 5) + 1}`,
      details: i === 0 ? "상세 활동 내용 1 - 긴 텍스트 유지 확인용" : `상세 활동 내용 ${i + 1}`,
      occurredAt: new Date(baseTime - i * 60000).toISOString(),
    });
  }
  return logs;
}

/** 공통 로그인 도우미 */
export async function performLogin(page, targetUrl, creds) {
  await page.goto(targetUrl);
  await page.locator("#login-id").fill(creds.loginId);
  await page.locator("#login-password").fill(creds.password);
  await page.locator("#login-btn").click();
  await page.locator(".shell-container, .home-container, #header-current-title").first().waitFor({ timeout: 15000 });
}

/** Bridge 요청 바디 인자 배열 파싱 */
export function parseBridgeQuery(body) {
  if (!Array.isArray(body)) {
    throw new Error("Bridge body는 배열이어야 합니다.");
  }
  return body[0] || {};
}

/** 비동기 요청 지연 제어기 (A08) */
export class HeldRouteController {
  constructor(timeoutMs = 15000) {
    this.timeoutMs = timeoutMs;
    this.releaseFn = null;
    this.startedPromise = new Promise((resolve, reject) => {
      this.markStarted = resolve;
      this.startTimeout = setTimeout(() => reject(new Error("HeldRouteController start timeout")), timeoutMs);
    });
    this.releasePromise = new Promise((resolve) => {
      this.releaseFn = resolve;
    });
    this.completedPromise = new Promise((resolve, reject) => {
      this.markCompleted = resolve;
      this.completeTimeout = setTimeout(() => reject(new Error("HeldRouteController complete timeout")), timeoutMs);
    });
  }

  async waitForStart() {
    await this.startedPromise;
    clearTimeout(this.startTimeout);
  }

  release() {
    if (this.releaseFn) {
      this.releaseFn();
    }
  }

  async waitForCompletion() {
    await this.completedPromise;
    clearTimeout(this.completeTimeout);
  }
}

/** 엄격한 Assertion 컨테이너 */
export class AssertionCollector {
  constructor(caseName, contract) {
    this.caseName = caseName;
    this.contract = contract;
    this.checks = [];
    this.seenIds = new Set();
  }

  expectEqual(id, pointer, actual, expected) {
    if (this.seenIds.has(id)) {
      throw new Error(`[중복 Assertion ID] '${id}' 가 이미 기록되었습니다.`);
    }
    this.seenIds.add(id);

    if (actual === undefined || expected === undefined) {
      throw new Error(`[Assertion 실패: ${id}] expected 또는 actual이 undefined입니다.`);
    }
    if (typeof actual === "number" && !Number.isFinite(actual)) {
      throw new Error(`[Assertion 실패: ${id}] actual이 유한한 숫자가 아닙니다.`);
    }
    if (typeof expected === "number" && !Number.isFinite(expected)) {
      throw new Error(`[Assertion 실패: ${id}] expected가 유한한 숫자가 아닙니다.`);
    }

    assert.deepStrictEqual(actual, expected);
    this.checks.push({
      id,
      sourceArtifact: "core-observations",
      pointer,
      actual,
    });
  }

  expectNear(id, pointer, actual, expected, tolerance = 1) {
    if (this.seenIds.has(id)) {
      throw new Error(`[중복 Assertion ID] '${id}' 가 이미 기록되었습니다.`);
    }
    this.seenIds.add(id);

    if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
      throw new Error(`[Assertion 실패: ${id}] tolerance는 유한하고 <= 1이어야 합니다 (actual tolerance=${tolerance}).`);
    }
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      throw new Error(`[Assertion 실패: ${id}] actual이 유한한 숫자가 아닙니다.`);
    }
    if (typeof expected !== "number" || !Number.isFinite(expected)) {
      throw new Error(`[Assertion 실패: ${id}] expected가 유한한 숫자가 아닙니다.`);
    }

    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
      throw new Error(`[Assertion 실패: ${id}] expected=${expected}, actual=${actual}, diff=${diff} > tolerance=${tolerance}`);
    }

    this.checks.push({
      id,
      sourceArtifact: "core-observations",
      pointer,
      actual,
    });
  }

  validateCoverage(requiredIds) {
    if (!Array.isArray(requiredIds)) {
      throw new Error(`[커버리지 오류: ${this.caseName}] requiredIds가 배열이 아닙니다.`);
    }
    const checkIds = this.checks.map((c) => c.id);
    const checkSet = new Set(checkIds);
    const requiredSet = new Set(requiredIds);

    const missing = requiredIds.filter((id) => !checkSet.has(id));
    const extra = checkIds.filter((id) => !requiredSet.has(id));

    if (missing.length > 0 || extra.length > 0 || checkIds.length !== requiredIds.length) {
      throw new Error(
        `[커버리지 불일치: ${this.caseName}] missing=[${missing.join(",")}], extra=[${extra.join(",")}], count=${checkIds.length}/${requiredIds.length}`
      );
    }
  }

  validateRequiredCoverage() {
    const required = this.contract?.fullUi?.requiredIds?.[this.caseName] || [];
    this.validateCoverage(required);
  }

  toJSON() {
    return this.checks;
  }
}

/** Private Worker IPC Handshake 검문 (A03, A-N03, A-N05, A-N06) */
export async function performWorkerIpcHandshake(expectedCase, contract) {
  let execution;
  try { execution = loadExecution(); } catch (e) { throw new Error(`[IPC] lock: ${e.message}`); }
  const ipcSet = new Set(execution.ipcCases || ["contract-core"]);
  if (!ipcSet.has(expectedCase)) throw new Error(`[IPC] unsupported: '${expectedCase}'`);
  if (typeof process.send !== "function" || !process.connected) throw new Error("[IPC] not connected");

  const fail = (code, violation, msg) => {
    process.stderr.write(JSON.stringify({
      status: "FAIL", code, phase: "preflight", case: expectedCase, runId: null,
      error: { name: "Error", message: msg, stack: new Error(msg).stack },
      ...(violation ? { violation } : {})
    }) + "\n");
    process.exit(1);
  };
  const exactKeys = (o, k) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === k.length && k.every(x => Object.hasOwn(o, x));
  const REJ = "A1_IPC_REJECTED";

  return new Promise((resolve) => {
    let ackSent = false, savedCtx = null, savedNonce = null, savedCtxSha = null;
    let timer = setTimeout(() => fail(REJ, null, "context timeout"), 5000);

    const onMsg = (msg) => {
      if (!msg) return;
      if (!ackSent) {
        if (msg.type !== "owner-context") return;
        clearTimeout(timer);
        try {
          for (const [cond, k] of [
            [!exactKeys(msg, ["type", "protocol", "case", "ownerPid", "workerPid", "nonce", "contextSha256", "context"]), "packetKeys"],
            [msg.protocol !== 2, "protocol"],
            [msg.ownerPid !== process.ppid, "ownerPid"],
            [msg.workerPid !== process.pid, "workerPid"],
            [msg.case !== expectedCase, "case"],
            [typeof msg.nonce !== "string" || msg.nonce.length < 64, "nonce"]
          ]) if (cond) return fail(REJ, k, k);

          const ctx = msg.context;
          if (!exactKeys(ctx, ["repository", "url", "runDir", "tempDir", "bootstrapFile", "contractPath", "contractSha256", "executionPath", "executionSha256"])) return fail(REJ, "contextKeys", "contextKeys");
          if (ctx.url !== "http://127.0.0.1:18741/") return fail(REJ, "url", "url");
          const repo = fs.realpathSync(ctx.repository);
          if (repo !== fs.realpathSync(process.cwd())) return fail(REJ, null, "repo");

          let realRun, realTemp;
          try { realRun = fs.realpathSync(ctx.runDir); } catch { return fail(REJ, "runDir", "runDir"); }
          const expRunBase = path.resolve(repo, "artifacts/captures/phase3", `access-history-${expectedCase}`);
          if (path.dirname(realRun) !== expRunBase || !path.basename(realRun).startsWith("run-")) return fail(REJ, "runDir", "runDir");

          try { realTemp = fs.realpathSync(ctx.tempDir); } catch { return fail(REJ, "tempDir", "tempDir"); }
          if (path.dirname(realTemp) !== fs.realpathSync(os.tmpdir()) || !path.basename(realTemp).startsWith(contract.tempPrefix)) return fail(REJ, "tempDir", "tempDir");

          let realBoot, realData;
          try { realBoot = fs.realpathSync(ctx.bootstrapFile); realData = fs.realpathSync(path.dirname(ctx.bootstrapFile)); } catch { return fail(REJ, "bootstrapFile", "bootstrapFile"); }
          const expBoot = path.resolve(realTemp, "data/bootstrap-credentials.json"), expData = path.resolve(realTemp, "data");
          if (!fs.existsSync(ctx.bootstrapFile) || path.resolve(ctx.bootstrapFile) !== expBoot || realBoot !== expBoot || realData !== expData) {
            return fail(REJ, "bootstrapFile", "bootstrapFile");
          }

          if (path.resolve(ctx.contractPath) !== path.resolve(CONTRACT_PATH)) return fail(REJ, "contractPath", "contractPath");
          if (ctx.contractSha256 !== CONTRACT_SHA256) return fail(REJ, "contractSha256", "contractSha256");
          if (path.resolve(ctx.executionPath) !== path.resolve(EXECUTION_PATH)) return fail(REJ, "executionPath", "executionPath");
          if (ctx.executionSha256 !== EXECUTION_SHA256) return fail(REJ, "executionSha256", "executionSha256");
          if (msg.contextSha256 !== sha(JSON.stringify(ctx))) return fail(REJ, null, "contextSha");

          const regPath = path.join(ctx.runDir, "owner-registration.json");
          if (!fs.existsSync(regPath)) return fail(REJ, null, "registration missing");
          const reg = JSON.parse(fs.readFileSync(regPath, "utf-8"));
          for (const [cond, k] of [
            [!exactKeys(reg, ["protocol", "case", "ownerPid", "workerPid", "nonceSha256", "contextSha256", "context"]), "registrationKeys"],
            [reg.protocol !== 2, "protocol"],
            [reg.case !== expectedCase, "case"],
            [reg.ownerPid !== process.ppid, "ownerPid"],
            [reg.workerPid !== process.pid, "workerPid"],
            [reg.nonceSha256 !== sha(msg.nonce), "nonce"]
          ]) if (cond) return fail(REJ, k, k);
          if (reg.contextSha256 !== msg.contextSha256) return fail(REJ, null, "reg contextSha");
          assert.deepStrictEqual(reg.context, ctx);

          savedCtx = ctx; savedNonce = msg.nonce; savedCtxSha = msg.contextSha256;
          const ackPkt = { type: "worker-ack", protocol: 2, case: expectedCase, ownerPid: process.ppid, workerPid: process.pid, contextSha256: msg.contextSha256 };
          if (expectedCase === "contract-core") ackPkt.nonce = msg.nonce; else ackPkt.nonceSha256 = sha(msg.nonce);
          process.send(ackPkt);
          ackSent = true;
          timer = setTimeout(() => { process.off("message", onMsg); fail("A1_RUN_TIMEOUT", null, "run timeout"); }, 5000);
        } catch (e) { process.off("message", onMsg); fail(REJ, null, e.message); }
      } else {
        if (msg.type !== "owner-run") return;
        clearTimeout(timer);
        process.off("message", onMsg);
        if (!exactKeys(msg, ["type", "protocol", "case", "ownerPid", "workerPid", "nonce", "contextSha256"])) return fail("A1_RUN_INVALID", null, "owner-run keys");
        if (msg.protocol !== 2 || msg.case !== expectedCase || msg.ownerPid !== process.ppid || msg.workerPid !== process.pid || msg.nonce !== savedNonce || msg.contextSha256 !== savedCtxSha) return fail("A1_RUN_INVALID", null, "owner-run match");
        resolve({ context: savedCtx, nonceSha256: sha(savedNonce) });
      }
    };
    process.on("message", onMsg);
  });
}
function deepFreeze(o) {
  if (o === null || typeof o !== "object") return o;
  Object.freeze(o);
  for (const k of Object.keys(o)) deepFreeze(o[k]);
  return o;
}

function checkFinite(v) {
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("non-finite"); }
  else if (Array.isArray(v)) { for (const x of v) checkFinite(x); }
  else if (v !== null && typeof v === "object") { for (const k of Object.keys(v)) checkFinite(v[k]); }
}

export function getPointer(o, p) {
  let c = o;
  for (const s of p.split("/").slice(1)) {
    if (c === null || c === undefined) return undefined;
    c = c[s.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return c;
}

export function collectAcquiredCoreChecks(raw, contract) {
  const rules = contract?.foundation?.rules || [];
  const checks = [];
  for (const r of rules) {
    const val = getPointer(raw, r.pointer);
    if (val !== null && val !== undefined) {
      checks.push({ id: r.id, sourceArtifact: "core-observations", pointer: r.pointer, actual: structuredClone(val) });
    }
  }
  return checks;
}

export function collectCoreChecks(observations) {
  if (arguments.length !== 1) throw new Error("single arg");
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) throw new Error("obs invalid");

  const allowedKeys = new Set(["viewport","origin","loginInputs","fixtureLabels","canonicalLabels","fixtureRequestCount","rawErrors","chrome","resources","captureId"]);
  const keys = Object.keys(observations);
  if (keys.length !== 10 || keys.some(k => !allowedKeys.has(k))) throw new Error("obs keys");
  checkFinite(observations);

  const c = observations.chrome;
  if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).length !== 3) throw new Error("chrome fields");
  if (!c.path || typeof c.path !== "string" || !fs.existsSync(c.path)) throw new Error("chrome path");
  const verifiedChrome = findChrome();
  if (!verifiedChrome || path.resolve(c.path) !== path.resolve(verifiedChrome.path)) throw new Error("chrome path match");
  if (!c.version || typeof c.version !== "string" || c.version !== verifiedChrome.version) throw new Error("chrome version");
  if (!c.browserVersion || typeof c.browserVersion !== "string" || c.browserVersion === "unknown" || !/^\d+\.\d+\.\d+\.\d+$/.test(c.browserVersion)) throw new Error("chrome browserVersion");

  const li = observations.loginInputs;
  if (!li || typeof li !== "object" || Array.isArray(li) || Object.keys(li).length !== 2 || !li.id || !li.password) throw new Error("loginInputs fields");
  for (const f of ["id", "password"]) {
    const item = li[f];
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 2) throw new Error("loginInputs item");
    if (typeof item.count !== "number" || !Number.isFinite(item.count) || item.count < 0) throw new Error("loginInputs count");
    if (typeof item.visible !== "boolean") throw new Error("loginInputs visible");
  }

  if (typeof observations.fixtureRequestCount !== "number" || !Number.isFinite(observations.fixtureRequestCount) || observations.fixtureRequestCount !== 0) throw new Error("fixtureRequestCount");

  const re = observations.rawErrors;
  if (!re || typeof re !== "object" || Array.isArray(re) || Object.keys(re).length !== 4) throw new Error("rawErrors fields");
  for (const k of ["console", "pageerror", "requestfailed", "badResponses"]) {
    if (!Array.isArray(re[k])) throw new Error(`rawErrors.${k}`);
  }

  const cl = observations.canonicalLabels;
  if (!cl || typeof cl !== "object" || Array.isArray(cl) || Object.keys(cl).length !== 4 || !cl.path || !cl.bytes || !cl.sha256 || !cl.labels) throw new Error("canonicalLabels fields");
  const repo = fs.realpathSync(process.cwd());
  const expCanonPath = path.resolve(repo, "dist/server/shared/domain/access-log.js");
  if (path.resolve(cl.path) !== expCanonPath) throw new Error("canonicalLabels path match");
  if (!fs.existsSync(cl.path)) throw new Error("canonicalLabels exists");
  const cBytes = fs.readFileSync(cl.path);
  if (cl.bytes !== cBytes.length || cl.sha256 !== sha(cBytes)) throw new Error("canonicalLabels sha");
  const req = createRequire(import.meta.url);
  const cMod = req(cl.path);
  const cMap = cMod.accessLogActionLabels ?? cMod.default?.accessLogActionLabels;
  assert.deepStrictEqual(cl.labels, cMap);

  const res = observations.resources;
  if (!Array.isArray(res) || res.length !== 2) throw new Error("resources length");
  const kinds = res.map(r => r.kind);
  if (kinds[0] === kinds[1] || !kinds.includes("browser") || !kinds.includes("context")) throw new Error("resources kind");
  if (typeof res[0].id !== "string" || !res[0].id || typeof res[1].id !== "string" || !res[1].id || res[0].id === res[1].id) throw new Error("resources id");
  for (const r of res) {
    if (!r || typeof r !== "object" || Array.isArray(r) || Object.keys(r).length !== 3 || !r.kind || !r.id || !Array.isArray(r.events) || r.events.length !== 3) throw new Error("resource structure");
    const exp = ["created", "close-start", "closed"];
    let prev = 0;
    for (let i = 0; i < 3; i++) {
      const ev = r.events[i];
      if (!ev || typeof ev !== "object" || Array.isArray(ev) || Object.keys(ev).length !== 2) throw new Error("event structure");
      if (typeof ev.timeMs !== "number" || !Number.isFinite(ev.timeMs) || ev.timeMs <= 0) throw new Error("event time");
      if (ev.state !== exp[i]) throw new Error("event state: " + ev.state);
      if (ev.timeMs < prev) throw new Error("event time order");
      prev = ev.timeMs;
    }
  }

  if (observations.captureId !== "core-capture") throw new Error("captureId");

  let contract;
  try { contract = loadContract(); } catch { throw new Error("contract load"); }
  const checks = [];
  for (const rule of contract.foundation.rules) {
    const actual = getPointer(observations, rule.pointer);
    if (actual === undefined || actual === null) throw new Error("actual missing: " + rule.pointer);
    if (rule.expected !== undefined) assert.deepStrictEqual(actual, rule.expected);
    checks.push({ id: rule.id, sourceArtifact: "core-observations", pointer: rule.pointer, actual: structuredClone(actual) });
  }
  return deepFreeze(checks);
}

export async function settleOwnedResources(handles, ledger, errors) {
  for (const kind of ["context", "browser"]) {
    const target = handles[kind];
    if (target) {
      const item = ledger.find(r => r.kind === kind);
      if (item) item.events.push({ state: "close-start", timeMs: Date.now() });
      try {
        await target.close();
        if (item) item.events.push({ state: "closed", timeMs: Date.now() });
      } catch (err) {
        if (item) item.events.push({ state: "close-error", timeMs: Date.now() });
        const entry = { phase: "cleanup", name: err.name || "Error", message: err.message || String(err), stack: err.stack || new Error(String(err)).stack, timeMs: Date.now() };
        if (errors?.cleanup) errors.cleanup.push(entry);
        if (errors && !errors.primary) {
          errors.primary = { code: "A1_WORKER_FAILED", phase: "cleanup", name: entry.name, message: entry.message, stack: entry.stack, timeMs: Date.now() };
        }
      }
    }
  }
}

export function publishWorkerPartial(context, nonceSha256, raw, checks, errors, acquisition) {
  const partialObj = {
    status: "FAIL", case: "contract-core", runId: path.basename(context.runDir),
    context, worker: { pid: process.pid, parentPid: process.ppid, nonceSha256 },
    raw, checks: checks || [], errors, acquisition: acquisition || { fixtureRows: null, fixtureRequests: [], routeInstalled: false },
  };
  const writeAtomic = (t) => { fs.writeFileSync(t + ".tmp", JSON.stringify(partialObj, null, 2)); fs.renameSync(t + ".tmp", t); };
  const pushEv = (e) => errors.evidence.push({ phase: "evidence", name: e.name || "Error", message: e.message || String(e), stack: e.stack || new Error(String(e)).stack, timeMs: Date.now() });
  try { writeAtomic(path.join(context.runDir, "core-partial.json")); } catch (e1) {
    pushEv(e1);
    try { writeAtomic(path.join(context.runDir, "core-partial.fallback.json")); } catch (e2) { pushEv(e2); }
  }
}

export async function runContractCore(context, nonceSha256, contract) {
  const raw = {
    viewport: null, origin: null, loginInputs: null, fixtureLabels: null,
    canonicalLabels: null, fixtureRequestCount: null,
    rawErrors: { console: [], pageerror: [], requestfailed: [], badResponses: [] },
    chrome: null, resources: [], captureId: null,
  };
  const errors = { primary: null, cleanup: [], evidence: [], unexpected: [] };
  const acquisition = { fixtureRows: null, fixtureRequests: [], routeInstalled: false };
  let browser = null, bCtx = null;

  try {
    const repo = fs.realpathSync(context.repository);
    const canonPath = path.resolve(repo, "dist/server/shared/domain/access-log.js");
    if (!fs.existsSync(canonPath)) throw new Error("SOL_CORE_CANONICAL_MISSING");
    const canonBytes = fs.readFileSync(canonPath);
    raw.canonicalLabels = { path: canonPath, bytes: canonBytes.length, sha256: sha(canonBytes), labels: null };
    const require = createRequire(import.meta.url);
    const canonMod = require(canonPath);
    const canonMap = canonMod.accessLogActionLabels ?? canonMod.default?.accessLogActionLabels;
    if (!canonMap) throw new Error("SOL_CORE_CANONICAL_MISSING");
    raw.canonicalLabels.labels = canonMap;

    acquisition.fixtureRows = createMockAccessLogs(8);
    for (const row of acquisition.fixtureRows) row.actionLabel = canonMap[row.actionType];
    raw.fixtureLabels = acquisition.fixtureRows.map(r => ({ actionType: r.actionType, label: r.actionLabel }));

    const chrome = findChrome();
    if (!chrome?.path || !fs.existsSync(chrome.path)) throw new Error("Chrome path missing");
    raw.chrome = { path: path.resolve(chrome.path), version: chrome.version || "unknown", browserVersion: null };

    browser = await chromium.launch({ executablePath: chrome.path, headless: true });
    raw.resources.push({ kind: "browser", id: "browser-1", events: [{ state: "created", timeMs: Date.now() }] });
    raw.chrome.browserVersion = browser.version();

    bCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    raw.resources.push({ kind: "context", id: "context-1", events: [{ state: "created", timeMs: Date.now() }] });

    const page = await bCtx.newPage();

    await page.route("**/api/access-logs:list", (route, req) => {
      acquisition.fixtureRequests.push({ url: req.url(), method: req.method() });
      raw.fixtureRequestCount = acquisition.fixtureRequests.length;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: acquisition.fixtureRows }) });
    });
    acquisition.routeInstalled = true;
    raw.fixtureRequestCount = 0;

    page.on("console", m => { if (m.type() === "error") raw.rawErrors.console.push(m.text()); });
    page.on("pageerror", e => raw.rawErrors.pageerror.push(e.message));
    page.on("requestfailed", r => raw.rawErrors.requestfailed.push(`${r.url()} (${r.failure()?.errorText ?? "unknown"})`));
    page.on("response", r => { if (r.status() >= 400) raw.rawErrors.badResponses.push(`${r.status()} ${r.url()}`); });

    await page.goto(context.url, { timeout: 15000 });
    await waitForFontsReady(page, 15000);
    await page.locator("#login-id").waitFor({ timeout: 15000 });

    const getInp = async (sel) => { const c = await page.locator(sel).count(); return { count: c, visible: c > 0 && await page.locator(sel).isVisible() }; };
    raw.loginInputs = { id: await getInp("#login-id"), password: await getInp("#login-password") };
    raw.origin = page.url();

    const vp = page.viewportSize();
    if (!vp) {
      raw.viewport = null;
      throw new Error("SOL_CORE_VIEWPORT_NULL");
    }
    raw.viewport = [vp.width, vp.height];

    await page.screenshot({ path: path.join(context.runDir, "core-capture.png"), fullPage: false });
    raw.captureId = "core-capture";
  } catch (err) {
    if (!errors.primary) {
      errors.primary = { code: "A1_WORKER_FAILED", phase: "execution", name: err.name || "Error", message: err.message || String(err), stack: err.stack || new Error(String(err)).stack, timeMs: Date.now() };
    }
  } finally {
    await settleOwnedResources({ context: bCtx, browser }, raw.resources, errors);
  }

  try {
    if (errors.primary) throw errors.primary;
    fs.writeFileSync(path.join(context.runDir, "core-observations.json"), JSON.stringify(raw, null, 2));
    const checks = collectCoreChecks(raw);
    const workerFinal = {
      case: "contract-core", runId: path.basename(context.runDir),
      contractSha256: CONTRACT_SHA256, pid: process.pid, parentPid: process.ppid,
      nonceSha256, checks, status: "PASS",
      measurement: {
        viewportSource: "page.viewportSize", originSource: "page.url",
        fixtureRoute: "**/api/access-logs:list", fixtureRows: acquisition.fixtureRows, fixtureRequests: acquisition.fixtureRequests,
      },
      acquisition: { ...acquisition },
    };
    fs.writeFileSync(path.join(context.runDir, "worker-final.json"), JSON.stringify(workerFinal, null, 2));
    return workerFinal;
  } catch (err) {
    if (!errors.primary) {
      errors.primary = { code: "A1_WORKER_FAILED", phase: "execution", name: err?.name || "Error", message: err?.message || String(err), stack: err?.stack || new Error(String(err)).stack, timeMs: Date.now() };
    }
    const acquired = collectAcquiredCoreChecks(raw, contract);
    publishWorkerPartial(context, nonceSha256, raw, acquired, errors, acquisition);
    const e = new Error(errors.primary.message);
    e.stack = errors.primary.stack;
    throw e;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const cliFail = (code, msg, c = null) => {
    process.stderr.write(JSON.stringify({
      status: "FAIL", code, phase: "preflight", case: c, runId: null,
      error: { name: "Error", message: msg, stack: new Error(msg).stack }
    }) + "\n");
    process.exit(1);
  };
  if (args.length !== 1 || !args[0].startsWith("--case=")) cliFail("A1_CLI_INVALID", "args");
  const rawCase = args[0].slice(7);
  if (rawCase !== "contract-core") cliFail("A1_CLI_INVALID", "case", rawCase);

  let contract = null;
  try { contract = loadContract(); } catch (e) { cliFail("A1_LOCK_MISMATCH", e.message, "contract-core"); }

  let handshake = null;
  try { handshake = await performWorkerIpcHandshake("contract-core", contract); } catch { process.exit(1); }

  try {
    await runContractCore(handshake.context, handshake.nonceSha256, contract);
    process.exit(0);
  } catch (err) {
    let partial = null;
    for (const p of [path.join(handshake.context.runDir, "core-partial.json"), path.join(handshake.context.runDir, "core-partial.fallback.json")]) {
      if (fs.existsSync(p)) { try { partial = JSON.parse(fs.readFileSync(p, "utf8")); break; } catch {} }
    }
    const pErr = partial?.errors?.primary || err;
    process.stderr.write(JSON.stringify({
      status: "FAIL", code: "A1_WORKER_FAILED", phase: pErr.phase || "execution", case: "contract-core",
      runId: path.basename(handshake.context.runDir),
      error: { name: pErr.name, message: pErr.message, stack: pErr.stack },
    }) + "\n");
    process.exit(1);
  }
}
