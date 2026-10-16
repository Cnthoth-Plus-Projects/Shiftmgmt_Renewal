import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { isDeepStrictEqual as same } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createUniqueRunDir } from "../lib/ui-check.mjs";
import { loadContract, loadExecution, CONTRACT_PATH, CONTRACT_SHA256, EXECUTION_PATH, EXECUTION_SHA256 } from "./access-history-shared.mjs";
import { validateProcessReceipt, readNormalWorkerEvidence } from "./access-history-negative.mjs";

const repoRoot = fs.realpathSync(process.cwd());
if (repoRoot !== fs.realpathSync(path.resolve(fileURLToPath(import.meta.url), "../../.."))) { process.stderr.write("repo mismatch\n"); process.exit(1); }

export const BASELINE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-v1\\baseline.json";
export const BASELINE_SHA256 = "D305FE700885F4F3BD640FC021E6F545B684E46E2630CDB993A4A8173E7C1A03";
export const GATE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-v1\\gate-evidence.py";
export const GATE_SHA256 = "0BD49A425F026D37EF861E4EB70EAC237733EC7D847E7164933B7BEA01F2E622";
export const PYTHON_PATH = "C:\\Users\\pangyo\\anaconda3\\python.exe";

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();
const writeAtomic = (t, o, beforeCommit = null) => { fs.writeFileSync(t + ".tmp", JSON.stringify(o, null, 2)); if (beforeCommit) beforeCommit(); fs.renameSync(t + ".tmp", t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (o, n) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === n;
const errInfo = (e, m = "Error") => { const msg = (typeof e === "string" ? e : e?.message) || m; return { name: e?.name || "Error", message: msg, stack: e?.stack || new Error(msg).stack || "Error" }; };

const failPreflight = (code, c, msg, err) => {
  const m = msg || err?.message || code;
  process.stderr.write(JSON.stringify({ status: "FAIL", code, phase: "preflight", case: c, runId: null, error: errInfo(err, m) }) + "\n");
  process.exit(1);
};

const rawArgs = process.argv.slice(2);
if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) failPreflight("A1_CLI_INVALID", null, "args");
const selectedCase = rawArgs[0].slice(7);
if (!selectedCase || selectedCase.trim() !== selectedCase) failPreflight("A1_CLI_INVALID", null, "case");

let contract, execution;
try { contract = loadContract(); execution = loadExecution(); } catch (e) { failPreflight("A1_LOCK_MISMATCH", selectedCase, e.message, e); }

const pubCases = new Set(execution.publicCases), enCases = new Set(execution.enabledCases), defCases = new Set(execution.deferredCases);
if (!pubCases.has(selectedCase)) failPreflight("A1_CLI_INVALID", null, "case");
if (defCases.has(selectedCase)) {
  process.stdout.write(JSON.stringify({ status: "BLOCKED_STAGE", code: "A1_DEFERRED", case: selectedCase, reason: "A2_PENDING", stageSlice: "A1" }) + "\n");
  process.exit(1);
}
if (!enCases.has(selectedCase)) failPreflight("A1_CLI_INVALID", selectedCase, "case");

try {
  const baseBytes = fs.readFileSync(BASELINE_PATH);
  if (sha(baseBytes) !== BASELINE_SHA256) throw new Error("baseline");
  const baseline = JSON.parse(baseBytes.toString("utf8")), allowed = new Set(execution.allowed);
  for (const [rP, info] of Object.entries({ ...baseline.files, ...baseline.control })) {
    const fP = path.resolve(repoRoot, rP);
    if (fP === path.resolve(BASELINE_PATH)) continue;
    const st = fs.existsSync(fP) && fs.statSync(fP);
    if (!st || (allowed.has(rP) ? st.size > 30000 : st.size !== info.bytes || sha(fs.readFileSync(fP)) !== info.sha256)) throw new Error("lock");
  }
  const sharedBuf = fs.readFileSync(path.resolve(repoRoot, "scripts/ui-checks/access-history-shared.mjs"));
  const sIdx = sharedBuf.indexOf(Buffer.from("export const CANONICAL_8_ACTIONS =")), eIdx = sharedBuf.indexOf(Buffer.from("export async function performWorkerIpcHandshake"));
  if (sIdx === -1 || eIdx === -1 || sIdx >= eIdx) throw new Error("frag");
  const frag = sharedBuf.subarray(sIdx, eIdx);
  if (frag.length !== 6575 || sha(frag) !== "502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1") throw new Error("frag");
} catch (lockErr) { failPreflight("A1_LOCK_MISMATCH", selectedCase, lockErr.message, lockErr); }

const PORT = Number(contract.port), BASE_URL = execution.url;
const checkPortFree = (port) => new Promise((res, rej) => net.createServer().once("error", (e) => rej(e)).once("listening", function() { this.close(() => res(true)); }).listen(port, "127.0.0.1"));
try { await checkPortFree(PORT); } catch (portErr) { failPreflight("A1_PORT_BUSY", selectedCase, portErr.message, portErr); }

const runDir = createUniqueRunDir(path.join(repoRoot, "artifacts", "captures", "phase3"), `access-history-${selectedCase}`);
const runId = path.basename(runDir);

let primaryError = null, primaryCode = "A1_WORKER_FAILED", primaryPhase = "execution";
const cleanupErrors = [], evidenceErrors = [], unexpectedErrors = [];
const recordError = (phase, err, code = null) => { const entry = { code: code || primaryCode, phase, ...errInfo(err), timeMs: Date.now() }; if (!primaryError) { primaryError = entry; primaryCode = code || primaryCode; primaryPhase = phase; } else unexpectedErrors.push(entry); return entry; };
const fail = (ph, msg, cd) => { const e = new Error(msg); recordError(ph, e, cd); throw e; };
const cleanProc = async r => { if (r) for (const k of ["stop", "settleLogs"]) try { await r[k](1000); } catch (e) { cleanupErrors.push({ phase: "cleanup", ...errInfo(e), timeMs: Date.now() }); } };
const isPidAlive = (pid) => { if (!pid || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const buildChildEnv = (d, b) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("SHIFT") && k !== "NODE_OPTIONS" && !k.startsWith("SOL_A1_PROBE"))), SHIFTMGMT_USER_DATA_DIR: d, SHIFTMGMT_PORT: String(PORT), SHIFTMGMT_UI_BOOTSTRAP_FILE: b });
const validatePng = (p) => {
  const b = fs.readFileSync(p), w = b.length >= 24 ? b.readUInt32BE(16) : 0, h = b.length >= 24 ? b.readUInt32BE(20) : 0;
  if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || w !== 1440 || h < 900) throw new Error();
  return [w, h];
};

class ProcessRecord {
  constructor(name, outP, errP) {
    this.name = name; this.stdoutPath = outP; this.stderrPath = errP;
    this.streams = { stdout: fs.createWriteStream(outP, { flags: "a" }), stderr: fs.createWriteStream(errP, { flags: "a" }) };
    this.child = this.pid = this.createdAtMs = this.exitAtMs = this.closeAtMs = this.exitCode = this.exitSignal = this.closeCode = this.closeSignal = this.logError = this.spawnPromise = null;
    this.exitSeen = this.closeSeen = this.settled = false;
    this.logFinishSeen = { stdout: false, stderr: false }; this.logCloseSeen = { stdout: false, stderr: false };
    this.logFinishAtMs = { stdout: null, stderr: null }; this.logCloseAtMs = { stdout: null, stderr: null };
    this.logErrors = { stdout: null, stderr: null }; this.callbackEvents = [];
    for (const s of ["stdout", "stderr"]) {
      this.streams[s].on("error", (e) => { this.logErrors[s] = this.logError = e; this.addEv("log-error", Date.now(), s, null, null, null, errInfo(e)); recordError(`${name}-log-error`, e, "A1_LOG_WRITE_FAILED"); });
      for (const ev of ["finish", "close"]) { const cap = ev[0].toUpperCase() + ev.slice(1); this.streams[s].once(ev, () => { const t = Date.now(); this[`log${cap}Seen`][s] = true; this[`log${cap}AtMs`][s] = t; this.addEv(`log-${ev}`, t, s, null, null, null, null); }); }
    }
  }

  addEv(event, timeMs, stream, pid, code, signal, error) { this.callbackEvents.push({ event, timeMs, stream, pid, code, signal, error }); }

  attachChild(child, onStdout = null) {
    this.child = child; this.pid = child.pid ?? null;
    child.stdout.on("data", (d) => { this.streams.stdout.write(d); onStdout?.(d); });
    child.stderr.on("data", (d) => this.streams.stderr.write(d));
    this.spawnPromise = new Promise((resolve, reject) => {
      child.once("spawn", () => { const t = Date.now(); this.pid = child.pid ?? null; this.createdAtMs = t; this.addEv("spawn", t, null, child.pid ?? null, null, null, null); resolve(true); });
      child.on("error", (err) => { const t = Date.now(); this.addEv("error", t, null, this.pid, null, null, errInfo(err)); recordError(`${this.name}-spawn-error`, err, this.name === "server" ? "A1_SERVER_SPAWN_FAILURE" : this.name === "worker" ? "A1_WORKER_SPAWN_FAILURE" : "A1_GATE_SPAWN_FAILURE"); reject(err); });
    });
    for (const ev of ["exit", "close"]) { child.once(ev, (code, signal) => { const t = Date.now(); this[`${ev}Seen`] = true; this[`${ev}Code`] = code ?? null; this[`${ev}Signal`] = signal ?? null; this[`${ev}AtMs`] = t; this.addEv(ev, t, null, this.pid, code ?? null, signal ?? null, null); }); }
  }

  async stop(timeoutMs = 5000) { if (this.child && !this.closeSeen) { if (this.child.exitCode === null && !this.exitSeen) { try { this.child.kill(); } catch {} } const dl = Date.now() + timeoutMs; while (Date.now() < dl && !this.closeSeen) await sleep(50); } }

  async settleLogs(timeoutMs = 5000) {
    if (this.settled) return;
    for (const s of ["stdout", "stderr"]) try { this.streams[s].end(); } catch (e) { this.logErrors[s] = this.logError = e; recordError(this.name + "-log-end", e, "A1_LOG_WRITE_FAILED"); try { this.streams[s].destroy(e); } catch (d) { cleanupErrors.push({ phase: "cleanup", ...errInfo(d), timeMs: Date.now() }); } }
    const dl = Date.now() + timeoutMs;
    while (Date.now() < dl && (!this.logCloseSeen.stdout && !this.logErrors.stdout || !this.logCloseSeen.stderr && !this.logErrors.stderr)) await sleep(20);
    await new Promise((r) => setImmediate(r)); if (this.logError) { recordError(`${this.name}-log-error`, this.logError, "A1_LOG_WRITE_FAILED"); throw this.logError; }
    for (const ev of ["Finish", "Close"]) if (!this[`log${ev}Seen`].stdout || !this[`log${ev}Seen`].stderr) fail(`${this.name}-log-${ev.toLowerCase()}`, "unverified", `A1_LOG_${ev.toUpperCase()}_UNVERIFIED`);
    this.settled = true;
  }

  toManifestRecord() { return { pid: this.pid, exitCode: this.exitCode, exitSignal: this.exitSignal, closeCode: this.closeCode, closeSignal: this.closeSignal, exitSeen: this.exitSeen, closeSeen: this.closeSeen, aliveAfterClose: isPidAlive(this.pid), createdAtMs: this.createdAtMs, exitAtMs: this.exitAtMs, closeAtMs: this.closeAtMs, logsSettled: { stdout: this.settled, stderr: this.settled }, logFinishSeen: { ...this.logFinishSeen }, logCloseSeen: { ...this.logCloseSeen }, logFinishAtMs: { ...this.logFinishAtMs }, logCloseAtMs: { ...this.logCloseAtMs }, callbackEvents: structuredClone(this.callbackEvents) }; }
}

const deepFreeze = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v); return o; };



const waitChild = (rec, child, ms, ev = "exit") => new Promise((res, rej) => {
  if (rec[ev + "Seen"]) return res(true);
  const timer = setTimeout(() => { try { child.kill(); } catch {} rej(new Error("timeout")); }, ms);
  child.once(ev, () => { clearTimeout(timer); res(true); });
});

function spawnChild(rec, bin, args, env, ipc = false, onStdout = null) {
  const child = spawn(bin, args, { cwd: repoRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", ...(ipc ? ["ipc"] : [])] });
  rec.attachChild(child, onStdout);
  return child;
}

let serverReg, workerReg, gateReg, tempDir, bootstrapFile, nonce, nonceSha256, context, contextSha256, checks = [], artifacts = [], tempRemoved = false, tempRemovedAtMs = null, sealedAtMs = null, workerAckReceipt = null, contextAck = false, runAuthorized = false, workerArgv = [], acquiredRaw = null, acquiredChecks = null, acquiredAcquisition = null, workerCached = null, serverCached = null, gateCached = null;

const wrapWorker = (r) => r ? { ...r, parentPid: process.pid, nonceSha256, contextAck, runAuthorized, ackReceipt: (selectedCase === "contract-core" || execution.normalCases.includes(selectedCase)) ? workerAckReceipt : null, argv: workerArgv } : null;
const errObj = (p) => ({ primary: p, cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors });
const cacheProc = (r) => { try { const s = r.toManifestRecord(); validateProcessReceipt(s); return deepFreeze(structuredClone(s)); } catch (e) { recordError("lifecycle-clock", e, "A1_LIFECYCLE_INVALID"); throw e; } };
const checkBarrier = () => { if (primaryError) throw primaryError; for (const a of [unexpectedErrors, cleanupErrors, evidenceErrors]) if (a.length) throw a[0]; for (const [r, c] of [[workerReg, workerCached], [serverReg, serverCached], [gateReg, gateCached]]) if (r && c) for (const k of Object.keys(c)) { const v = k === "aliveAfterClose" ? isPidAlive(r.pid) : k === "logsSettled" ? { stdout: r.settled, stderr: r.settled } : r[k]; if (!same(v, c[k])) fail(r.name + "-barrier", k, "A1_LIFECYCLE_INVALID"); } };
const isNormal = execution.normalCases.includes(selectedCase);
const makeBaseManifest = (st, rc) => ({ schema: contract?.evidenceSchema || "shiftmgmt.verifier.evidence.v1", stage: isNormal ? "normal-integration" : "foundation", stageSlice: isNormal ? "A2" : "A1", case: selectedCase, runId, contractSha256: CONTRACT_SHA256, executionSha256: EXECUTION_SHA256, status: st, exitCode: rc, owner: { pid: process.pid, nodePath: process.execPath, nonceSha256, context: context || {} } });

try {
  const osTemp = fs.realpathSync(os.tmpdir());
  tempDir = fs.mkdtempSync(path.join(osTemp, contract.tempPrefix));
  bootstrapFile = path.join(tempDir, "data", "bootstrap-credentials.json");
  fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });

  nonce = crypto.randomBytes(32).toString("hex").toUpperCase();
  nonceSha256 = sha(nonce);

  context = { repository: repoRoot, url: BASE_URL, runDir, tempDir, bootstrapFile, contractPath: CONTRACT_PATH, contractSha256: CONTRACT_SHA256, executionPath: EXECUTION_PATH, executionSha256: EXECUTION_SHA256 };
  contextSha256 = sha(JSON.stringify(context));

  const { ensureAuthBootstrapCredentials } = await import(pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js")).href);
  ensureAuthBootstrapCredentials({ userDataPath: tempDir });

  serverReg = new ProcessRecord("server", path.join(runDir, "server-stdout.log"), path.join(runDir, "server-stderr.log"));
  let serverStdoutVerified = false, healthPayload = null;

  try {
    spawnChild(serverReg, process.execPath, [path.join(repoRoot, "dist/server/main/server.js")], buildChildEnv(tempDir, bootstrapFile), false, (chunk) => {
      if (chunk.toString().includes(`http://127.0.0.1:${PORT}`) && chunk.toString().includes(tempDir)) serverStdoutVerified = true;
    });
    await serverReg.spawnPromise;
  } catch (sErr) {
    await cleanProc(serverReg); throw sErr;
  }

  const sDeadline = Date.now() + execution.deadlinesMs.readiness;
  let ready = false;
  while (Date.now() < sDeadline) {
    if (serverReg.child.exitCode !== null || serverReg.exitSeen) fail("server-early-exit", "", "A1_SERVER_SPAWN_FAILURE");
    if (serverStdoutVerified) {
      try {
        const res = await fetch(`${BASE_URL}api/health`, { signal: AbortSignal.timeout(1000) });
        if (res.status === 200) {
          const body = await res.json();
          if (body?.ok === true && fs.realpathSync(body.data?.dataDir || "") === fs.realpathSync(tempDir)) {
            healthPayload = body; ready = true; break;
          }
        }
      } catch {}
    }
    await sleep(100);
  }
  if (!ready) fail("server-readiness", "", "A1_SERVER_SPAWN_FAILURE");

  workerReg = new ProcessRecord("worker", path.join(runDir, "worker-stdout.log"), path.join(runDir, "worker-stderr.log"));

  let normalEvidence = null;
  const isIpc = selectedCase === "contract-core" || isNormal;
  if (isIpc) {
    const script = selectedCase === "contract-core" ? "scripts/ui-checks/access-history-shared.mjs" : execution.normalWorkerScripts[selectedCase];
    workerArgv = [process.execPath, path.resolve(repoRoot, script), "--case=" + selectedCase];
    let wChild;
    try {
      wChild = spawnChild(workerReg, workerArgv[0], workerArgv.slice(1), buildChildEnv(tempDir, bootstrapFile), true);
      await workerReg.spawnPromise;
    } catch (wErr) {
      await cleanProc(workerReg); throw wErr;
    }

    const marker = { protocol: 2, case: selectedCase, ownerPid: process.pid, workerPid: wChild.pid, nonceSha256, contextSha256, context };
    fs.writeFileSync(path.join(runDir, "owner-registration.json"), JSON.stringify(marker));

    const sendMsg = (t) => {
      try { wChild.send({ type: t, protocol: 2, case: selectedCase, ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256, ...(t === "owner-context" ? { context } : {}) }); }
      catch (sErr) { recordError("worker-send", sErr, "A1_WORKER_FAILED"); throw sErr; }
    };
    sendMsg("owner-context");

    const ackPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error()), execution.deadlinesMs.contextAck);
      wChild.on("message", (msg) => {
        if (msg?.type !== "worker-ack") return;
        clearTimeout(timer);
        workerAckReceipt = { packet: structuredClone(msg), receivedAtMs: Date.now() };
        const k = Object.keys(msg);
        const expNonce = selectedCase === "contract-core" ? nonce : undefined;
        const expNonceSha = isNormal ? nonceSha256 : undefined;
        const bad = !isObj(msg, 7) || ["type", "protocol", "case", "ownerPid", "workerPid", "contextSha256"].some(x => !k.includes(x)) ||
          msg.protocol !== 2 || msg.case !== selectedCase || msg.ownerPid !== process.pid || msg.workerPid !== wChild.pid ||
          (expNonce !== undefined && msg.nonce !== expNonce) || (expNonceSha !== undefined && msg.nonceSha256 !== expNonceSha) ||
          msg.contextSha256 !== contextSha256;
        if (bad) {
          const err = new Error("ACK"); recordError("worker-ack-invalid", err, "A1_ACK_INVALID"); return reject(err);
        }
        contextAck = true; resolve(true);
      });
    });

    try { await ackPromise; } catch (ackErr) {
      if (primaryCode !== "A1_ACK_INVALID") recordError("worker-ack", ackErr, "A1_ACK_TIMEOUT");
      throw ackErr;
    }

    sendMsg("owner-run");
    runAuthorized = true;

    const timeout = selectedCase === "contract-core" ? execution.deadlinesMs.contractCore : execution.deadlinesMs.normal;
    try { await waitChild(workerReg, wChild, timeout); } catch (wErr) { recordError("worker-timeout", wErr, "A1_WORKER_FAILED"); throw wErr; }
    const expCode = isNormal ? 1 : 0;
    if (workerReg.exitCode !== expCode) { const err = new Error("exit mismatch"); recordError("worker-exit", err, "A1_WORKER_FAILED"); throw err; }

    if (isNormal) {
      normalEvidence = readNormalWorkerEvidence({ caseName: selectedCase, context, execution, contract, workerPid: wChild.pid, exitCode: workerReg.exitCode });
      checks = [];
    } else {
      const wf = JSON.parse(fs.readFileSync(path.join(runDir, "worker-final.json"), "utf8"));
      acquiredRaw = JSON.parse(fs.readFileSync(path.join(runDir, "core-observations.json"), "utf8"));
      acquiredChecks = wf.checks; acquiredAcquisition = wf.acquisition; checks = acquiredChecks;
    }
  } else {
    const regPolicy = execution.regressions[selectedCase], scriptPath = path.resolve(repoRoot, regPolicy.script);
    workerArgv = [process.execPath, scriptPath, BASE_URL, ...regPolicy.extraArgs];
    let wChild, stdoutBuffer = "";
    try {
      wChild = spawnChild(workerReg, workerArgv[0], workerArgv.slice(1), buildChildEnv(tempDir, bootstrapFile), false, (d) => stdoutBuffer += d);
      await workerReg.spawnPromise;
    } catch (wErr) {
      await cleanProc(workerReg); throw wErr;
    }

    const regTimeout = selectedCase === "regression-home" ? execution.deadlinesMs.regressionHome : execution.deadlinesMs.regressionShell;
    try { await waitChild(workerReg, wChild, regTimeout); } catch (wErr) { recordError("regression-worker", wErr, "A1_WORKER_FAILED"); throw wErr; }
    if (workerReg.exitCode !== 0) { const err = new Error(); recordError("regression-worker", err, "A1_WORKER_FAILED"); throw err; }

    const match = stdoutBuffer.match(/- manifest:\s*([^\r\n]+)/);
    if (!match) fail("regression-evidence", "", "A1_WORKER_FAILED");
    const origP = path.resolve(repoRoot, match[1].trim()), origB = fs.readFileSync(origP), childM = JSON.parse(origB), copyP = path.join(runDir, "regression-manifest.json");
    fs.copyFileSync(origP, copyP);
    const caps = childM.captures.map((c) => {
      const oP = path.resolve(path.dirname(origP), c.filename || `${c.name}.png`), cP = path.join(runDir, `regression-capture-${c.name}.png`);
      fs.copyFileSync(oP, cP);
      const b = fs.readFileSync(cP);
      return { name: c.name, originalPath: oP, copyPath: cP, bytes: b.length, sha256: sha(b), dimensions: validatePng(cP) };
    });
    const obs = { runner: { script: scriptPath, sha256: sha(fs.readFileSync(scriptPath)), argv: workerArgv, pid: wChild.pid, exitCode: workerReg.exitCode }, evidence: { manifest: { originalPath: origP, copyPath: copyP, bytes: origB.length, sha256: sha(origB) }, captures: caps }, result: { status: childM.status, errors: childM.errors, serverHealth: childM.serverHealth } };
    fs.writeFileSync(path.join(runDir, "regression-observations.json"), JSON.stringify(obs));
    checks = regPolicy.checkIds.map((id, i) => ({ id, sourceArtifact: "regression-observations", pointer: ["/runner", "/evidence", "/result"][i], actual: structuredClone([obs.runner, obs.evidence, obs.result][i]) }));
  }

  await workerReg.stop(execution.deadlinesMs.forcedClose);
  await serverReg.stop(execution.deadlinesMs.forcedClose);
  await workerReg.settleLogs(execution.deadlinesMs.logFinish);
  await serverReg.settleLogs(execution.deadlinesMs.logFinish);

  if (!workerReg.closeSeen || isPidAlive(workerReg.pid)) fail("close-worker", "worker close", "A1_CLOSE_UNVERIFIED");
  if (!serverReg.closeSeen || isPidAlive(serverReg.pid)) fail("close-server", "server close", "A1_CLOSE_UNVERIFIED");

  workerCached = cacheProc(workerReg); serverCached = cacheProc(serverReg); checkBarrier();

  artifacts = (selectedCase === "contract-core" ? contract.foundation.artifacts : isNormal ? normalEvidence.artifactIds : execution.regressions[selectedCase].artifacts).map((id) => {
    const p = path.join(runDir, id + (id.includes("std") ? ".log" : id.includes("capture") ? ".png" : ".json")), d = fs.readFileSync(p);
    return { id, path: p, bytes: d.length, sha256: sha(d) };
  });
  checkBarrier();

  let portFreed = false;
  try { await checkPortFree(PORT); portFreed = true; } catch { portFreed = false; }
  checkBarrier();

  const realTemp = fs.realpathSync(tempDir);
  fs.rmSync(realTemp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  tempRemoved = !fs.existsSync(realTemp); tempRemovedAtMs = sealedAtMs = Date.now();
  if (!tempRemoved) throw new Error();
  checkBarrier();

  const candidateManifest = { ...makeBaseManifest(isNormal ? "FAIL_INCOMPLETE" : "READY_FOR_ADJUDICATION", isNormal ? 1 : 0), worker: wrapWorker(workerCached), server: { ...serverCached, stdoutListenVerified: serverStdoutVerified, portListeningAfterClose: !portFreed, health: { status: 200, payload: healthPayload } }, cleanup: { tempRemoved: true, tempRemovedAtMs }, sealedAtMs, errors: errObj(null), artifacts, checks, ...(isNormal ? { coverage: normalEvidence.coverage } : {}) };

  const candidatePath = path.join(runDir, "owner-candidate.json");
  try { writeAtomic(candidatePath, candidateManifest, checkBarrier); } catch (cErr) {
    if (primaryError) throw primaryError;
    recordError("candidate-write", cErr, "A1_CANDIDATE_WRITE_FAILED"); throw cErr;
  }
  const candidateBytes = fs.readFileSync(candidatePath), candidateSha256 = sha(candidateBytes);
  checkBarrier();

  gateReg = new ProcessRecord("adjudicator", path.join(runDir, "adjudicator-stdout.log"), path.join(runDir, "adjudicator-stderr.log"));
  let adjStdout = "", adjStderr = "";
  const gateArgv = [PYTHON_PATH, GATE_PATH, "--execution-sha", EXECUTION_SHA256, "--baseline-sha", BASELINE_SHA256, "--candidate", candidatePath];

  try {
    const gChild = spawnChild(gateReg, gateArgv[0], gateArgv.slice(1), undefined, false, (d) => adjStdout += d);
    gChild.stderr.on("data", (d) => adjStderr += d);
    await gateReg.spawnPromise; checkBarrier();
  } catch (gSpawnErr) {
    await cleanProc(gateReg); if (primaryError) throw primaryError;
    recordError("gate-spawn", gSpawnErr, "A1_GATE_SPAWN_FAILURE"); throw gSpawnErr;
  }

  try { await waitChild(gateReg, gateReg.child, execution.deadlinesMs.adjudicator, "close"); checkBarrier(); } catch (gErr) {
    if (primaryError) throw primaryError; recordError("gate-run", gErr, "A1_GATE_REJECTED"); throw gErr;
  }
  await gateReg.stop(execution.deadlinesMs.forcedClose); checkBarrier();
  await gateReg.settleLogs(execution.deadlinesMs.logFinish); checkBarrier();

  gateCached = cacheProc(gateReg); checkBarrier();

  if (gateReg.exitCode !== 0 || adjStderr.trim() !== "") fail("adjudicator-verdict", `gate reject: ${adjStderr.trim()}`, "A1_GATE_REJECTED");

  let parsedGate;
  try {
    const lines = adjStdout.trim().split(/\r?\n/).filter(Boolean); if (lines.length !== 1) throw new Error();
    parsedGate = JSON.parse(lines[0]); const r = parsedGate?.result;
    if (isNormal) {
      if (parsedGate?.status !== "PASS" || !isObj(parsedGate, 2) || !isObj(r, 8) || r.status !== "ACCEPTABLE_INCOMPLETE_CANDIDATE" || r.acceptance !== "A2_INCOMPLETE_EVIDENCE_ONLY" || r.case !== selectedCase || r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 || r.checks !== 0 || r.artifacts !== artifacts.length) throw new Error();
    } else {
      if (parsedGate?.status !== "PASS" || !isObj(parsedGate, 2) || !isObj(r, 8) || r.status !== "ACCEPTABLE_CANDIDATE" || r.acceptance !== "A1_PREREQUISITE_ONLY" || r.case !== selectedCase || r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 || r.checks !== checks.length || r.artifacts !== artifacts.length) throw new Error();
    }
  } catch (parseErr) { recordError("adjudicator-response", parseErr, "A1_GATE_RESPONSE_MISMATCH"); throw parseErr; }

  const finalManifest = { ...candidateManifest, status: isNormal ? "FAIL_INCOMPLETE" : "PASS", adjudication: { result: parsedGate.result, candidateSha256, gatePath: GATE_PATH, gateSha256: GATE_SHA256, process: gateCached, stdoutPath: gateReg.stdoutPath, stderrPath: gateReg.stderrPath, stdoutSha256: sha(fs.readFileSync(gateReg.stdoutPath)), stderrSha256: sha(fs.readFileSync(gateReg.stderrPath)) } };
  const finalPath = path.join(runDir, "owner-final.json");
  try { writeAtomic(finalPath, finalManifest, checkBarrier); } catch (fErr) { if (primaryError) throw primaryError; recordError("final-write", fErr, "A1_FINAL_WRITE_FAILED"); throw fErr; }
  if (isNormal) {
    process.stderr.write(JSON.stringify({ status: "FAIL_INCOMPLETE", code: "A2_COVERAGE_INCOMPLETE", case: selectedCase, runId, manifestPath: finalPath, exitCode: 1, stageSlice: "A2", acceptance: "A2_INCOMPLETE_EVIDENCE_ONLY" }) + "\n");
    process.exit(1);
  } else {
    process.stdout.write(JSON.stringify({ status: "PASS", case: selectedCase, runId, manifestPath: finalPath, exitCode: 0, stageSlice: "A1", acceptance: "A1_PREREQUISITE_ONLY" }) + "\n");
    process.exit(0);
  }
} catch (err) {
  if (!primaryError) recordError("execution", err, primaryCode);
  for (const reg of [workerReg, serverReg, gateReg]) await cleanProc(reg);
  let workerPartial = null, workerPartialPath = null;
  for (const n of ["core-partial.json", "core-partial.fallback.json"]) { const p = path.join(runDir, n); if (fs.existsSync(p)) { try { workerPartial = JSON.parse(fs.readFileSync(p, "utf8")); workerPartialPath = p; break; } catch {} } }
  const gfr = (r) => r?.child ? r.toManifestRecord() : null;
  const failureManifest = {
    ...makeBaseManifest("FAIL", 1), server: gfr(serverReg), worker: wrapWorker(gfr(workerReg)), adjudicator: gfr(gateReg),
    acquisition: acquiredAcquisition || workerPartial?.acquisition || null,
    raw: acquiredRaw || (selectedCase === "contract-core" && workerPartial?.raw ? workerPartial.raw : null),
    checks: acquiredChecks || (selectedCase === "contract-core" && workerPartial?.checks ? workerPartial.checks : checks),
    workerPartialPath: workerPartialPath || null, cleanup: { tempRemoved }, errors: errObj({ code: primaryCode, phase: primaryPhase, ...errInfo(primaryError) }),
  };
  const pushEv = (fe) => evidenceErrors.push({ phase: "evidence", ...errInfo(fe), timeMs: Date.now() });
  try { writeAtomic(path.join(runDir, "owner-failure.json"), failureManifest); } catch (fe1) { pushEv(fe1); try { writeAtomic(path.join(runDir, "owner-failure.fallback.json"), failureManifest); } catch (fe2) { pushEv(fe2); } }
  process.stderr.write(JSON.stringify({ status: "FAIL", code: primaryCode, phase: primaryPhase, case: selectedCase, runId, error: errInfo(primaryError) }) + "\n");
  process.exit(1);
}
