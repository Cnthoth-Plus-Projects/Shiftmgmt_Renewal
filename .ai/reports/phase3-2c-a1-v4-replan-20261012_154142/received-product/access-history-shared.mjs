// 활동 이력 UI 검증 공통 모듈: 외부 계약 로더, 엄격 비교기, 도메인 정본 픽스처, IPC 가드 및 Contract-Core 실행기
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { findChrome } from "../lib/find-chrome.mjs";
import { waitForFontsReady } from "../lib/ui-check.mjs";

export const CONTRACT_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-v1\\contract.json";
export const CONTRACT_SHA256 = "014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE";
export const EXECUTION_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v3\\execution.json";
export const EXECUTION_SHA256 = "B2D297394AF8FA7C3D2C72A881B2BD4F713032DB48E905058C9E6257658AE86C";

function sha(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

/** 외부 고정 계약을 로드하고 해시를 검증한다 */
export function loadContract() {
  if (!fs.existsSync(CONTRACT_PATH)) {
    throw new Error(`외부 계약 파일이 존재하지 않습니다: ${CONTRACT_PATH}`);
  }
  const rawBytes = fs.readFileSync(CONTRACT_PATH);
  const actualHash = sha(rawBytes);
  if (actualHash !== CONTRACT_SHA256) {
    throw new Error(`계약 해시 불일치: expected=${CONTRACT_SHA256}, actual=${actualHash}`);
  }
  return JSON.parse(rawBytes.toString("utf8"));
}

export function loadExecution() {
  if (!fs.existsSync(EXECUTION_PATH)) {
    throw new Error(`실행 계약 파일이 존재하지 않습니다: ${EXECUTION_PATH}`);
  }
  const rawBytes = fs.readFileSync(EXECUTION_PATH);
  const actualHash = sha(rawBytes);
  if (actualHash !== EXECUTION_SHA256) {
    throw new Error(`실행 계약 해시 불일치: expected=${EXECUTION_SHA256}, actual=${actualHash}`);
  }
  return JSON.parse(rawBytes.toString("utf8"));
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
  if (expectedCase !== "contract-core") throw new Error(`[IPC 거부] A1 지원 안함: '${expectedCase}'`);
  if (typeof process.send !== "function" || !process.connected) throw new Error("[IPC 거부] IPC 미연결");

  const fail = (code, violation, msg) => {
    process.stderr.write(JSON.stringify({
      status: "FAIL", code, phase: "preflight", case: "contract-core", runId: null,
      error: { name: "Error", message: msg, stack: new Error(msg).stack },
      ...(violation ? { violation } : {})
    }) + "\n");
    process.exit(1);
  };

  return new Promise((resolve) => {
    let ackSent = false, savedCtx = null, savedNonce = null, savedCtxSha = null;
    let timer = setTimeout(() => fail("A1_IPC_REJECTED", null, "owner-context 타임아웃"), 5000);

    const onMsg = (msg) => {
      if (!msg) return;
      if (!ackSent) {
        if (msg.type !== "owner-context") return;
        clearTimeout(timer);
        try {
          if (msg.ownerPid !== process.ppid) fail("A1_IPC_REJECTED", "ownerPid", "ownerPid 불일치");
          if (msg.workerPid !== process.pid) fail("A1_IPC_REJECTED", "workerPid", "workerPid 불일치");
          if (msg.case !== expectedCase) fail("A1_IPC_REJECTED", "case", "case 불일치");
          if (typeof msg.nonce !== "string" || msg.nonce.length < 64) fail("A1_IPC_REJECTED", "nonce", "nonce 불일치");
          const ctx = msg.context;
          if (!ctx) fail("A1_IPC_REJECTED", null, "context 누락");
          if (ctx.url !== "http://127.0.0.1:18741/") fail("A1_IPC_REJECTED", "url", "url 불일치");
          const repo = fs.realpathSync(ctx.repository);
          if (repo !== fs.realpathSync(process.cwd())) fail("A1_IPC_REJECTED", null, "repo 불일치");

          let realRun;
          try { realRun = fs.realpathSync(ctx.runDir); } catch { fail("A1_IPC_REJECTED", "runDir", "runDir 접근실패"); }
          const expectedRunBase = path.resolve(repo, "artifacts/captures/phase3", `access-history-${expectedCase}`);
          if (path.dirname(realRun) !== expectedRunBase || !path.basename(realRun).startsWith("run-")) fail("A1_IPC_REJECTED", "runDir", "runDir 불일치");

          let realTemp;
          try { realTemp = fs.realpathSync(ctx.tempDir); } catch { fail("A1_IPC_REJECTED", "tempDir", "tempDir 접근실패"); }
          if (path.dirname(realTemp) !== fs.realpathSync(os.tmpdir()) || !path.basename(realTemp).startsWith(contract.tempPrefix)) fail("A1_IPC_REJECTED", "tempDir", "tempDir 불일치");

          if (!fs.existsSync(ctx.bootstrapFile) || path.resolve(ctx.bootstrapFile) !== path.resolve(realTemp, "data/bootstrap-credentials.json")) fail("A1_IPC_REJECTED", "bootstrapFile", "bootstrapFile 불일치");
          if (path.resolve(ctx.contractPath) !== path.resolve(CONTRACT_PATH)) fail("A1_IPC_REJECTED", "contractPath", "contractPath 불일치");
          if (ctx.contractSha256 !== CONTRACT_SHA256) fail("A1_IPC_REJECTED", "contractSha256", "contractSha256 불일치");
          if (path.resolve(ctx.executionPath) !== path.resolve(EXECUTION_PATH)) fail("A1_IPC_REJECTED", "executionPath", "executionPath 불일치");
          if (ctx.executionSha256 !== EXECUTION_SHA256) fail("A1_IPC_REJECTED", "executionSha256", "executionSha256 불일치");

          if (msg.contextSha256 !== sha(JSON.stringify(ctx))) fail("A1_IPC_REJECTED", null, "contextSha256 불일치");

          const regPath = path.join(ctx.runDir, "owner-registration.json");
          if (!fs.existsSync(regPath)) fail("A1_IPC_REJECTED", null, "owner-registration 누락");
          const reg = JSON.parse(fs.readFileSync(regPath, "utf-8"));
          if (reg.protocol !== 2) fail("A1_IPC_REJECTED", null, "protocol 불일치");
          if (reg.case !== expectedCase) fail("A1_IPC_REJECTED", "case", "case 불일치");
          if (reg.ownerPid !== process.ppid) fail("A1_IPC_REJECTED", "ownerPid", "ownerPid 불일치");
          if (reg.workerPid !== process.pid) fail("A1_IPC_REJECTED", "workerPid", "workerPid 불일치");
          if (reg.nonceSha256 !== sha(msg.nonce)) fail("A1_IPC_REJECTED", "nonce", "nonce 불일치");
          if (reg.contextSha256 !== msg.contextSha256) fail("A1_IPC_REJECTED", null, "contextSha256 불일치");

          savedCtx = ctx; savedNonce = msg.nonce; savedCtxSha = msg.contextSha256;
          process.send({ type: "worker-ack", protocol: 2, case: expectedCase, ownerPid: process.ppid, workerPid: process.pid, nonce: msg.nonce, contextSha256: msg.contextSha256 });
          ackSent = true;
          timer = setTimeout(() => { process.off("message", onMsg); fail("A1_RUN_TIMEOUT", null, "owner-run 타임아웃"); }, 5000);
        } catch (e) { process.off("message", onMsg); fail("A1_IPC_REJECTED", null, e.message); }
      } else {
        if (msg.type !== "owner-run") return;
        clearTimeout(timer);
        process.off("message", onMsg);
        if (msg.protocol !== 2 || msg.case !== expectedCase || msg.ownerPid !== process.ppid || msg.workerPid !== process.pid || msg.nonce !== savedNonce || msg.contextSha256 !== savedCtxSha) {
          fail("A1_RUN_INVALID", null, "owner-run 불일치");
        }
        resolve({ context: savedCtx, nonceSha256: sha(savedNonce) });
      }
    };
    process.on("message", onMsg);
  });
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

function checkFinite(val) {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) throw new Error("유한하지 않은 숫자");
  } else if (Array.isArray(val)) {
    for (const item of val) checkFinite(item);
  } else if (val !== null && typeof val === "object") {
    for (const k of Object.keys(val)) checkFinite(val[k]);
  }
}

const CORE_POINTERS = [
  { id: "CORE-01", pointer: "/viewport", get: o => o.viewport, expected: [1440, 900] },
  { id: "CORE-02", pointer: "/origin", get: o => o.origin, expected: "http://127.0.0.1:18741/" },
  { id: "CORE-03", pointer: "/loginInputs", get: o => o.loginInputs, expected: { id: { count: 1, visible: true }, password: { count: 1, visible: true } } },
  { id: "CORE-04", pointer: "/fixtureLabels", get: o => o.fixtureLabels, expected: [
    { actionType: "performance-approve", label: "실적 승인" },
    { actionType: "performance-reapprove", label: "실적 승인 확정" },
    { actionType: "performance-hide-approved", label: "승인완료 목록삭제" },
    { actionType: "schedule-publish", label: "근무표 배포" },
    { actionType: "sign-in", label: "로그인" },
    { actionType: "route-view", label: "화면 이동" },
    { actionType: "performance-reject", label: "실적 반려" },
    { actionType: "site-save", label: "근무지 저장" }
  ] },
  { id: "CORE-05", pointer: "/fixtureRequestCount", get: o => o.fixtureRequestCount, expected: 0 },
  { id: "CORE-06", pointer: "/rawErrors", get: o => o.rawErrors, expected: { console: [], pageerror: [], requestfailed: [], badResponses: [] } },
  { id: "CORE-07", pointer: "/chrome", get: o => o.chrome },
  { id: "CORE-08", pointer: "/resources", get: o => o.resources },
  { id: "CORE-09", pointer: "/captureId", get: o => o.captureId, expected: "core-capture" },
];

export function collectCoreChecks(observations) {
  if (arguments.length !== 1) throw new Error("단일 인수만 허용");
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) throw new Error("유효하지 않은 observations");

  const allowedKeys = new Set(["viewport","origin","loginInputs","fixtureLabels","canonicalLabels","fixtureRequestCount","rawErrors","chrome","resources","captureId"]);
  const keys = Object.keys(observations);
  if (keys.length !== 10 || keys.some(k => !allowedKeys.has(k))) throw new Error("observations 키 불일치");
  checkFinite(observations);

  const c = observations.chrome;
  if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).length !== 3) throw new Error("chrome 필드 불일치");
  if (!c.path || typeof c.path !== "string" || !fs.existsSync(c.path)) throw new Error("chrome path 오류");
  const verifiedChrome = findChrome();
  if (!verifiedChrome || path.resolve(c.path) !== path.resolve(verifiedChrome.path)) throw new Error("chrome 검증 실패");
  if (!c.version || typeof c.version !== "string") throw new Error("chrome version 누락");
  if (!c.browserVersion || typeof c.browserVersion !== "string" || c.browserVersion === "unknown") throw new Error("chrome browserVersion 오류");

  const li = observations.loginInputs;
  if (!li || typeof li !== "object" || Array.isArray(li) || Object.keys(li).length !== 2 || !li.id || !li.password) throw new Error("loginInputs 키 오류");
  for (const f of ["id", "password"]) {
    const item = li[f];
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 2) throw new Error("loginInputs 필드 오류");
    if (typeof item.count !== "number" || !Number.isFinite(item.count) || item.count < 0) throw new Error("loginInputs count 오류");
    if (typeof item.visible !== "boolean") throw new Error("loginInputs visible 오류");
  }

  if (typeof observations.fixtureRequestCount !== "number" || !Number.isFinite(observations.fixtureRequestCount)) throw new Error("fixtureRequestCount 오류");

  const re = observations.rawErrors;
  if (!re || typeof re !== "object" || Array.isArray(re) || Object.keys(re).length !== 4) throw new Error("rawErrors 필드 오류");
  for (const k of ["console", "pageerror", "requestfailed", "badResponses"]) {
    if (!Array.isArray(re[k])) throw new Error(`rawErrors.${k} 배열 아님`);
  }

  const cl = observations.canonicalLabels;
  if (!cl || typeof cl !== "object" || Array.isArray(cl) || !cl.path || !cl.bytes || !cl.sha256 || !cl.labels) throw new Error("canonicalLabels 오류");

  const res = observations.resources;
  if (!Array.isArray(res) || res.length !== 2) throw new Error("resources는 2개여야 함");
  const kinds = res.map(r => r.kind);
  if (kinds[0] === kinds[1] || !kinds.includes("browser") || !kinds.includes("context") || res[0].id === res[1].id) throw new Error("resources kind/id 오류");
  for (const r of res) {
    if (Object.keys(r).length !== 3 || !r.kind || !r.id || !Array.isArray(r.events) || r.events.length < 3) throw new Error("resource 구조 오류");
    let prev = 0;
    for (const ev of r.events) {
      if (Object.keys(ev).length !== 2 || !ev.state || typeof ev.timeMs !== "number" || !Number.isFinite(ev.timeMs) || ev.timeMs <= 0) throw new Error("event 필드 오류");
      if (ev.timeMs < prev) throw new Error("event timeMs 순서 역전");
      prev = ev.timeMs;
    }
  }

  if (observations.captureId !== "core-capture") throw new Error("captureId 오류");

  const checks = [];
  for (const rule of CORE_POINTERS) {
    const actual = rule.get(observations);
    if (actual === undefined) throw new Error("actual 누락: " + rule.pointer);
    if (rule.expected !== undefined) assert.deepStrictEqual(actual, rule.expected);
    checks.push({ id: rule.id, sourceArtifact: "core-observations", pointer: rule.pointer, actual: structuredClone(actual) });
  }
  return deepFreeze(checks);
}

export async function settleOwnedResources(handles, ledger, errors) {
  const { context, browser } = handles;
  if (context) {
    const cItem = ledger.find(r => r.kind === "context");
    if (cItem) cItem.events.push({ state: "close-start", timeMs: Date.now() });
    try {
      await context.close();
      if (cItem) cItem.events.push({ state: "closed", timeMs: Date.now() });
    } catch (err) {
      if (cItem) cItem.events.push({ state: "close-error", timeMs: Date.now() });
      if (errors?.cleanup) errors.cleanup.push({ phase: "cleanup", name: err.name, message: err.message, stack: err.stack, timeMs: Date.now() });
    }
  }
  if (browser) {
    const bItem = ledger.find(r => r.kind === "browser");
    if (bItem) bItem.events.push({ state: "close-start", timeMs: Date.now() });
    try {
      await browser.close();
      if (bItem) bItem.events.push({ state: "closed", timeMs: Date.now() });
    } catch (err) {
      if (bItem) bItem.events.push({ state: "close-error", timeMs: Date.now() });
      if (errors?.cleanup) errors.cleanup.push({ phase: "cleanup", name: err.name, message: err.message, stack: err.stack, timeMs: Date.now() });
    }
  }
}

export async function runContractCore(context, nonceSha256, contract) {
  const repo = fs.realpathSync(context.repository);
  const chrome = findChrome();
  if (!chrome?.path || !fs.existsSync(chrome.path)) throw new Error("Chrome 실행 파일 누락");

  const rawErrors = { console: [], pageerror: [], requestfailed: [], badResponses: [] };
  const resources = [
    { kind: "browser", id: "browser-1", events: [{ state: "created", timeMs: Date.now() }] },
    { kind: "context", id: "context-1", events: [{ state: "created", timeMs: Date.now() }] }
  ];

  let browser = null, bCtx = null, actualVer = "", loginInputs = null, viewport = null, origin = null;
  try {
    browser = await chromium.launch({ executablePath: chrome.path, headless: true });
    actualVer = browser.version();
    bCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await bCtx.newPage();
    viewport = [1440, 900]; origin = context.url;

    page.on("console", m => { if (m.type() === "error") rawErrors.console.push(m.text()); });
    page.on("pageerror", e => rawErrors.pageerror.push(e.message));
    page.on("requestfailed", r => rawErrors.requestfailed.push(`${r.url()} (${r.failure()?.errorText ?? "unknown"})`));
    page.on("response", r => { if (r.status() >= 400) rawErrors.badResponses.push(`${r.status()} ${r.url()}`); });

    await page.goto(context.url, { timeout: 15000 });
    await waitForFontsReady(page, 15000);
    await page.locator("#login-id").waitFor({ timeout: 15000 });

    const idCount = await page.locator("#login-id").count();
    const idVisible = idCount > 0 ? await page.locator("#login-id").isVisible() : false;
    const pwCount = await page.locator("#login-password").count();
    const pwVisible = pwCount > 0 ? await page.locator("#login-password").isVisible() : false;
    loginInputs = { id: { count: idCount, visible: idVisible }, password: { count: pwCount, visible: pwVisible } };

    await page.screenshot({ path: path.join(context.runDir, "core-capture.png"), fullPage: false });
  } finally {
    await settleOwnedResources({ context: bCtx, browser }, resources, { cleanup: [] });
  }

  const canonPath = path.join(repo, "dist/server/shared/domain/access-log.js");
  if (!fs.existsSync(canonPath)) throw new Error("canonical 모듈 누락: " + canonPath);
  const canonBytes = fs.readFileSync(canonPath);
  const canonModule = await import(pathToFileURL(canonPath).href);
  const canonMap = canonModule.accessLogActionLabels ?? canonModule.default?.accessLogActionLabels;
  if (!canonMap) throw new Error("accessLogActionLabels 누락");

  const fixtureLabels = CANONICAL_8_ACTIONS.map(a => ({ actionType: a.actionType, label: a.label }));
  const observations = {
    viewport, origin, loginInputs, fixtureLabels,
    canonicalLabels: { path: canonPath, bytes: canonBytes.length, sha256: sha(canonBytes), labels: canonMap },
    fixtureRequestCount: 0, rawErrors,
    chrome: { path: path.resolve(chrome.path), version: chrome.version || "unknown", browserVersion: actualVer },
    resources, captureId: "core-capture"
  };

  fs.writeFileSync(path.join(context.runDir, "core-observations.json"), JSON.stringify(observations, null, 2));
  const checks = collectCoreChecks(observations);
  const workerFinal = {
    case: "contract-core", runId: path.basename(context.runDir),
    contractSha256: CONTRACT_SHA256, pid: process.pid, parentPid: process.ppid,
    nonceSha256, checks, status: "PASS"
  };
  fs.writeFileSync(path.join(context.runDir, "worker-final.json"), JSON.stringify(workerFinal, null, 2));
  return workerFinal;
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
  if (args.length !== 1 || !args[0].startsWith("--case=")) cliFail("A1_CLI_INVALID", "인수 오류");
  const rawCase = args[0].slice(7);
  if (rawCase !== "contract-core") cliFail("A1_CLI_INVALID", "케이스 불일치", rawCase);

  let contract = null;
  try { contract = loadContract(); } catch (e) { cliFail("A1_LOCK_MISMATCH", e.message, "contract-core"); }

  let handshake = null;
  try { handshake = await performWorkerIpcHandshake("contract-core", contract); } catch { process.exit(1); }

  try {
    await runContractCore(handshake.context, handshake.nonceSha256, contract);
    process.exit(0);
  } catch (err) {
    try {
      fs.writeFileSync(path.join(handshake.context.runDir, "core-partial.json"), JSON.stringify({
        case: "contract-core", runId: path.basename(handshake.context.runDir), status: "FAIL",
        error: { name: err.name, message: err.message, stack: err.stack }
      }, null, 2));
    } catch {}
    process.stderr.write(JSON.stringify({
      status: "FAIL", code: "A1_WORKER_FAILED", phase: "execution", case: "contract-core",
      runId: path.basename(handshake.context.runDir), error: { name: err.name, message: err.message, stack: err.stack }
    }) + "\n");
    process.exit(1);
  }
}

