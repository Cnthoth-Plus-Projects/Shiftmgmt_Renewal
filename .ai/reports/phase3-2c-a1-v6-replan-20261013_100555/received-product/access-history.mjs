import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createUniqueRunDir } from "../lib/ui-check.mjs";
import {
  loadContract, loadExecution,
  CONTRACT_PATH, CONTRACT_SHA256,
  EXECUTION_PATH, EXECUTION_SHA256,
} from "./access-history-shared.mjs";

const repoRoot = fs.realpathSync(process.cwd());
if (repoRoot !== fs.realpathSync(path.resolve(fileURLToPath(import.meta.url), "../../.."))) {
  process.stderr.write("repo mismatch\n");
  process.exit(1);
}

export const BASELINE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v5\\baseline.json";
export const BASELINE_SHA256 = "EB224ABFAC5B1898A734CEDED34336A3EA0B3ECCDC29A4DBE6F82C0FAB39CC6E";
export const GATE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v5\\gate-evidence.py";
export const GATE_SHA256 = "16E11984E3449545CBAF44BDC83C472D825CFDF2CB1F4C8C4AB2466A3C3EBC5C";
export const PYTHON_PATH = "C:\\Users\\pangyo\\anaconda3\\python.exe";

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();
const writeAtomic = (t, o) => { fs.writeFileSync(t + ".tmp", JSON.stringify(o, null, 2)); fs.renameSync(t + ".tmp", t); };

function failPreflight(code, c, msg, err) {
  process.stderr.write(JSON.stringify({
    status: "FAIL", code, phase: "preflight", case: c, runId: null,
    error: { name: err?.name || "Error", message: msg, stack: err?.stack || new Error(msg).stack }
  }) + "\n");
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) failPreflight("A1_CLI_INVALID", null, "args");
const selectedCase = rawArgs[0].slice(7);
if (!selectedCase || selectedCase.trim() !== selectedCase) failPreflight("A1_CLI_INVALID", null, "case");

let contract, execution;
try { contract = loadContract(); execution = loadExecution(); } catch (e) { failPreflight("A1_LOCK_MISMATCH", selectedCase, e.message, e); }

const pubCases = new Set(execution.publicCases), enCases = new Set(execution.enabledCases), defCases = new Set(execution.deferredCases);
if (!pubCases.has(selectedCase)) failPreflight("A1_CLI_INVALID", null, `not public: ${selectedCase}`);
if (defCases.has(selectedCase)) {
  process.stdout.write(JSON.stringify({ status: "BLOCKED_STAGE", code: "A1_DEFERRED", case: selectedCase, reason: "A2_PENDING", stageSlice: "A1" }) + "\n");
  process.exit(1);
}
if (!enCases.has(selectedCase)) failPreflight("A1_CLI_INVALID", selectedCase, `not enabled: ${selectedCase}`);

try {
  const baseBytes = fs.readFileSync(BASELINE_PATH);
  if (sha(baseBytes) !== BASELINE_SHA256) throw new Error("baseline sha");
  const baseline = JSON.parse(baseBytes.toString("utf8"));
  const allowed = new Set(["scripts/ui-checks/access-history.mjs", "scripts/ui-checks/access-history-shared.mjs"]);
  for (const [rP, info] of Object.entries({ ...baseline.files, ...baseline.control })) {
    const fP = path.resolve(repoRoot, rP);
    if (fP === path.resolve(BASELINE_PATH)) continue;
    if (!fs.existsSync(fP)) throw new Error("missing: " + rP);
    const st = fs.statSync(fP);
    if (allowed.has(rP)) { if (st.size > 30000) throw new Error("exceeded 30000: " + rP); }
    else if (st.size !== info.bytes || sha(fs.readFileSync(fP)) !== info.sha256) throw new Error("lock mismatch: " + rP);
  }
  const sharedBuf = fs.readFileSync(path.resolve(repoRoot, "scripts/ui-checks/access-history-shared.mjs"));
  const sIdx = sharedBuf.indexOf(Buffer.from("export const CANONICAL_8_ACTIONS =")), eIdx = sharedBuf.indexOf(Buffer.from("export async function performWorkerIpcHandshake"));
  if (sIdx === -1 || eIdx === -1 || sIdx >= eIdx) throw new Error("shared markers");
  const frag = sharedBuf.subarray(sIdx, eIdx);
  if (frag.length !== 6575 || sha(frag) !== "502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1") throw new Error("frozen frag");
} catch (lockErr) { failPreflight("A1_LOCK_MISMATCH", selectedCase, lockErr.message, lockErr); }

const PORT = Number(contract.port), BASE_URL = execution.url;
async function checkPortFree(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (err) => (err.code === "EADDRINUSE" ? reject(new Error("in use")) : reject(err)));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}
try { await checkPortFree(PORT); } catch (portErr) { failPreflight("A1_PORT_BUSY", selectedCase, portErr.message, portErr); }

const runDir = createUniqueRunDir(path.join(repoRoot, "artifacts", "captures", "phase3"), `access-history-${selectedCase}`);
const runId = path.basename(runDir);

let primaryError = null, primaryCode = "A1_WORKER_FAILED", primaryPhase = "execution";
const cleanupErrors = [], evidenceErrors = [], unexpectedErrors = [];

function recordError(phase, err, code = null) {
  const entry = { code: code || primaryCode, phase, name: err?.name || "Error", message: err?.message || String(err), stack: err?.stack || new Error(String(err)).stack || "", timeMs: Date.now() };
  if (!primaryError) { primaryError = entry; primaryCode = code || primaryCode; primaryPhase = phase; }
  else unexpectedErrors.push(entry);
  return entry;
}
const fail = (ph, msg, cd) => { const e = new Error(msg); recordError(ph, e, cd); throw e; };

const isPidAlive = (pid) => { if (!pid || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
function buildChildEnv(tDir, bFile) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("SHIFTMGMT_") && !k.startsWith("SHIFT_") && k !== "NODE_OPTIONS" && !k.startsWith("SOL_A1_PROBE")) env[k] = v;
  }
  return { ...env, SHIFTMGMT_USER_DATA_DIR: tDir, SHIFTMGMT_PORT: String(PORT), SHIFTMGMT_UI_BOOTSTRAP_FILE: bFile };
}

function validatePng(p) {
  const b = fs.readFileSync(p);
  if (b.length < 24 || !b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error("PNG");
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (w !== 1440 || h < 900) throw new Error("PNG dim");
  return [w, h];
}

class ProcessRecord {
  constructor(name, outP, errP) {
    this.name = name; this.stdoutPath = outP; this.stderrPath = errP;
    this.streams = { stdout: fs.createWriteStream(outP, { flags: "a" }), stderr: fs.createWriteStream(errP, { flags: "a" }) };
    this.child = this.pid = this.createdAtMs = this.exitAtMs = this.closeAtMs = this.exitCode = this.exitSignal = this.closeCode = this.closeSignal = null;
    this.exitSeen = this.closeSeen = this.settled = false;
    this.logFinishSeen = { stdout: false, stderr: false };
    this.logCloseSeen = { stdout: false, stderr: false };
    this.logFinishAtMs = { stdout: null, stderr: null };
    this.logCloseAtMs = { stdout: null, stderr: null };
    this.logErrors = { stdout: null, stderr: null };
    this.logError = null;
    this.callbackEvents = [];

    for (const s of ["stdout", "stderr"]) {
      this.streams[s].on("error", (e) => {
        const t = Date.now(); this.logErrors[s] = this.logError = e;
        this.addEv("log-error", t, s, null, null, null, { name: e.name || "Error", message: e.message || String(e), stack: e.stack || "" });
        recordError(`${name}-log-error`, e, "A1_LOG_WRITE_FAILED");
      }).on("finish", () => {
        const t = Date.now(); this.logFinishSeen[s] = true; this.logFinishAtMs[s] = t;
        this.addEv("log-finish", t, s, null, null, null, null);
      }).on("close", () => {
        const t = Date.now(); this.logCloseSeen[s] = true; this.logCloseAtMs[s] = t;
        this.addEv("log-close", t, s, null, null, null, null);
      });
    }
  }

  addEv(event, timeMs, stream, pid, code, signal, error) {
    this.callbackEvents.push({ event, timeMs, stream, pid, code, signal, error });
  }

  attachChild(child) {
    this.child = child; this.pid = child.pid ?? null;
    child.on("spawn", () => {
      const t = Date.now(); this.createdAtMs = t;
      this.addEv("spawn", t, null, child.pid ?? null, null, null, null);
    }).on("error", (err) => {
      const t = Date.now();
      this.addEv("error", t, null, this.pid, null, null, { name: err.name || "Error", message: err.message || String(err), stack: err.stack || "" });
      const c = this.name === "server" ? "A1_SERVER_SPAWN_FAILURE" : this.name === "worker" ? "A1_WORKER_SPAWN_FAILURE" : "A1_GATE_SPAWN_FAILURE";
      recordError(`${this.name}-spawn-error`, err, c);
    }).once("exit", (code, signal) => {
      const t = Date.now(); this.exitSeen = true; this.exitCode = code ?? null; this.exitSignal = signal ?? null; this.exitAtMs = t;
      this.addEv("exit", t, null, this.pid, code ?? null, signal ?? null, null);
    }).once("close", (code, signal) => {
      const t = Date.now(); this.closeSeen = true; this.closeCode = code ?? null; this.closeSignal = signal ?? null; this.closeAtMs = t;
      this.addEv("close", t, null, this.pid, code ?? null, signal ?? null, null);
    });
  }

  async stop(timeoutMs = 5000) {
    if (this.child && !this.closeSeen) {
      if (this.child.exitCode === null && !this.exitSeen) { try { this.child.kill(); } catch {} }
      const dl = Date.now() + timeoutMs;
      while (Date.now() < dl && !this.closeSeen) await new Promise((r) => setTimeout(r, 50));
    }
  }

  async settleLogs(timeoutMs = 5000) {
    if (this.settled) return;
    this.streams.stdout.end(); this.streams.stderr.end();
    const dl = Date.now() + timeoutMs;
    while (Date.now() < dl && (!this.logCloseSeen.stdout && !this.logErrors.stdout || !this.logCloseSeen.stderr && !this.logErrors.stderr)) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setImmediate(r));
    if (this.logError) { recordError(`${this.name}-log-error`, this.logError, "A1_LOG_WRITE_FAILED"); throw this.logError; }
    if (!this.logFinishSeen.stdout || !this.logFinishSeen.stderr) fail(`${this.name}-log-finish`, "fin unverified", "A1_LOG_FINISH_UNVERIFIED");
    if (!this.logCloseSeen.stdout || !this.logCloseSeen.stderr) fail(`${this.name}-log-close`, "cls unverified", "A1_LOG_CLOSE_UNVERIFIED");
    this.settled = true;
  }

  toManifestRecord() {
    return {
      pid: this.pid, exitCode: this.exitCode, exitSignal: this.exitSignal, closeCode: this.closeCode, closeSignal: this.closeSignal,
      exitSeen: this.exitSeen, closeSeen: this.closeSeen, aliveAfterClose: isPidAlive(this.pid),
      createdAtMs: this.createdAtMs, exitAtMs: this.exitAtMs, closeAtMs: this.closeAtMs,
      logsSettled: { stdout: this.settled, stderr: this.settled },
      logFinishSeen: { ...this.logFinishSeen }, logCloseSeen: { ...this.logCloseSeen },
      logFinishAtMs: { ...this.logFinishAtMs }, logCloseAtMs: { ...this.logCloseAtMs },
      callbackEvents: structuredClone(this.callbackEvents),
    };
  }
}

function validateLifecycle(name, rec) {
  if (!rec.createdAtMs || !rec.exitAtMs || !rec.closeAtMs || !(rec.createdAtMs <= rec.exitAtMs && rec.exitAtMs <= rec.closeAtMs)) throw new Error(`${name} lifecycle`);
  for (const s of ["stdout", "stderr"]) {
    const fin = rec.logFinishAtMs[s], cls = rec.logCloseAtMs[s];
    if (fin === null || cls === null || !rec.logFinishSeen[s] || !rec.logCloseSeen[s] || rec.closeAtMs > fin || fin > cls) throw new Error(`${name} log order`);
  }
}

let serverReg = null, workerReg = null, gateReg = null;
let tempDir = null, bootstrapFile = null, nonce = null, nonceSha256 = null, context = null, contextSha256 = null;
let checks = [], artifacts = [], tempRemoved = false, tempRemovedAtMs = null, sealedAtMs = null, workerAckReceipt = null;
let contextAck = false, runAuthorized = false, workerArgv = [];

try {
  const osTemp = fs.realpathSync(os.tmpdir());
  tempDir = fs.mkdtempSync(path.join(osTemp, contract.tempPrefix));
  bootstrapFile = path.join(tempDir, "data", "bootstrap-credentials.json");
  fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });

  nonce = crypto.randomBytes(32).toString("hex").toUpperCase();
  nonceSha256 = sha(nonce);

  context = {
    repository: repoRoot, url: BASE_URL, runDir, tempDir, bootstrapFile,
    contractPath: CONTRACT_PATH, contractSha256: CONTRACT_SHA256,
    executionPath: EXECUTION_PATH, executionSha256: EXECUTION_SHA256,
  };
  contextSha256 = sha(JSON.stringify(context));

  const { ensureAuthBootstrapCredentials } = await import(pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js")).href);
  ensureAuthBootstrapCredentials({ userDataPath: tempDir });

  serverReg = new ProcessRecord("server", path.join(runDir, "server-stdout.log"), path.join(runDir, "server-stderr.log"));
  let serverStdoutVerified = false, healthPayload = null;

  try {
    const sChild = spawn(process.execPath, [path.join(repoRoot, "dist/server/main/server.js")], {
      cwd: repoRoot, env: buildChildEnv(tempDir, bootstrapFile), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    serverReg.attachChild(sChild);
    if (!sChild.pid) fail("server-spawn", "server spawn", "A1_SERVER_SPAWN_FAILURE");
    sChild.stdout.on("data", (chunk) => {
      serverReg.streams.stdout.write(chunk);
      if (chunk.toString().includes(`http://127.0.0.1:${PORT}`) && chunk.toString().includes(tempDir)) serverStdoutVerified = true;
    });
    sChild.stderr.on("data", (chunk) => serverReg.streams.stderr.write(chunk));
  } catch (sErr) { recordError("server-spawn", sErr, "A1_SERVER_SPAWN_FAILURE"); throw sErr; }

  const sDeadline = Date.now() + execution.deadlinesMs.readiness;
  let ready = false;
  while (Date.now() < sDeadline) {
    if (serverReg.child.exitCode !== null || serverReg.exitSeen) fail("server-early-exit", "early exit", "A1_SERVER_SPAWN_FAILURE");
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
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) fail("server-readiness", "server readiness", "A1_SERVER_SPAWN_FAILURE");

  workerReg = new ProcessRecord("worker", path.join(runDir, "worker-stdout.log"), path.join(runDir, "worker-stderr.log"));

  if (selectedCase === "contract-core") {
    const marker = { protocol: 2, case: "contract-core", ownerPid: process.pid, workerPid: null, nonceSha256, contextSha256, context };
    workerArgv = [process.execPath, path.join(repoRoot, "scripts/ui-checks/access-history-shared.mjs"), "--case=contract-core"];
    let wChild;
    try {
      wChild = spawn(workerArgv[0], workerArgv.slice(1), {
        cwd: repoRoot, env: buildChildEnv(tempDir, bootstrapFile), windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      workerReg.attachChild(wChild);
      if (!wChild.pid) fail("worker-spawn", "worker spawn", "A1_WORKER_SPAWN_FAILURE");
    } catch (wErr) { recordError("worker-spawn", wErr, "A1_WORKER_SPAWN_FAILURE"); throw wErr; }

    marker.workerPid = wChild.pid;
    fs.writeFileSync(path.join(runDir, "owner-registration.json"), JSON.stringify(marker));
    wChild.stdout.on("data", (d) => workerReg.streams.stdout.write(d));
    wChild.stderr.on("data", (d) => workerReg.streams.stderr.write(d));

    try {
      wChild.send({ type: "owner-context", protocol: 2, case: "contract-core", ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256, context });
    } catch (sErr) { recordError("worker-send", sErr, "A1_WORKER_FAILED"); throw sErr; }

    const ackPromise = new Promise((resolve, reject) => {
      const ackTimeout = setTimeout(() => reject(new Error("ack timeout")), execution.deadlinesMs.contextAck);
      wChild.on("message", (msg) => {
        if (!msg || msg.type !== "worker-ack") return;
        clearTimeout(ackTimeout);
        workerAckReceipt = { packet: structuredClone(msg), receivedAtMs: Date.now() };
        const exact7 = ["type", "protocol", "case", "ownerPid", "workerPid", "nonce", "contextSha256"];
        if (Object.keys(msg).length !== 7 || Object.keys(msg).some((k) => !exact7.includes(k))) {
          const err = new Error("ACK keys"); recordError("worker-ack-invalid", err, "A1_ACK_INVALID"); return reject(err);
        }
        if (msg.protocol !== 2 || msg.case !== "contract-core" || msg.ownerPid !== process.pid || msg.workerPid !== wChild.pid || msg.nonce !== nonce || msg.contextSha256 !== contextSha256) {
          const err = new Error("Ack mismatch"); recordError("worker-ack-invalid", err, "A1_ACK_INVALID"); return reject(err);
        }
        contextAck = true; resolve(true);
      });
    });

    try { await ackPromise; } catch (ackErr) {
      if (primaryCode !== "A1_ACK_INVALID") recordError("worker-ack", ackErr, "A1_ACK_TIMEOUT");
      throw ackErr;
    }

    try {
      wChild.send({ type: "owner-run", protocol: 2, case: "contract-core", ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256 });
    } catch (sErr) { recordError("worker-send", sErr, "A1_WORKER_FAILED"); throw sErr; }
    runAuthorized = true;

    const workerDone = new Promise((resolve, reject) => {
      if (workerReg.exitSeen) return resolve(true);
      const timer = setTimeout(() => { wChild.kill(); reject(new Error("Core timeout")); }, execution.deadlinesMs.contractCore);
      wChild.once("exit", () => { clearTimeout(timer); resolve(true); });
    });

    try { await workerDone; } catch (wErr) { recordError("core-worker", wErr, "A1_WORKER_FAILED"); throw wErr; }
    if (workerReg.exitCode !== 0) {
      const err = new Error(`core rc: ${workerReg.exitCode}`); recordError("core-worker", err, "A1_WORKER_FAILED"); throw err;
    }
    checks = JSON.parse(fs.readFileSync(path.join(runDir, "worker-final.json"), "utf8")).checks;
  } else {
    const regPolicy = execution.regressions[selectedCase];
    const scriptPath = path.resolve(repoRoot, regPolicy.script);
    workerArgv = [process.execPath, scriptPath, BASE_URL, ...regPolicy.extraArgs];

    let wChild;
    try {
      wChild = spawn(workerArgv[0], workerArgv.slice(1), {
        cwd: repoRoot, env: buildChildEnv(tempDir, bootstrapFile), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      workerReg.attachChild(wChild);
      if (!wChild.pid) fail("regression-spawn", "reg spawn", "A1_WORKER_SPAWN_FAILURE");
    } catch (wErr) { recordError("regression-spawn", wErr, "A1_WORKER_SPAWN_FAILURE"); throw wErr; }

    let stdoutBuffer = "";
    wChild.stdout.on("data", (d) => { workerReg.streams.stdout.write(d); stdoutBuffer += d; });
    wChild.stderr.on("data", (d) => workerReg.streams.stderr.write(d));

    const workerDone = new Promise((resolve, reject) => {
      if (workerReg.exitSeen) return resolve(true);
      const timer = setTimeout(() => { wChild.kill(); reject(new Error("reg timeout")); }, selectedCase === "regression-home" ? execution.deadlinesMs.regressionHome : execution.deadlinesMs.regressionShell);
      wChild.once("exit", () => { clearTimeout(timer); resolve(true); });
    });

    try { await workerDone; } catch (wErr) { recordError("regression-worker", wErr, "A1_WORKER_FAILED"); throw wErr; }
    if (workerReg.exitCode !== 0) {
      const err = new Error(`reg rc: ${workerReg.exitCode}`); recordError("regression-worker", err, "A1_WORKER_FAILED"); throw err;
    }

    const match = stdoutBuffer.match(/- manifest:\s*([^\r\n]+)/);
    if (!match) fail("regression-evidence", "manifest path missing", "A1_WORKER_FAILED");

    const origP = path.resolve(repoRoot, match[1].trim()), origB = fs.readFileSync(origP), childM = JSON.parse(origB);
    const copyP = path.join(runDir, "regression-manifest.json");
    fs.copyFileSync(origP, copyP);

    const caps = childM.captures.map((c) => {
      const oP = path.resolve(path.dirname(origP), c.filename || `${c.name}.png`), cP = path.join(runDir, `regression-capture-${c.name}.png`);
      fs.copyFileSync(oP, cP);
      const b = fs.readFileSync(cP);
      return { name: c.name, originalPath: oP, copyPath: cP, bytes: b.length, sha256: sha(b), dimensions: validatePng(cP) };
    });

    const obs = {
      runner: { script: scriptPath, sha256: sha(fs.readFileSync(scriptPath)), argv: workerArgv, pid: wChild.pid, exitCode: workerReg.exitCode },
      evidence: { manifest: { originalPath: origP, copyPath: copyP, bytes: origB.length, sha256: sha(origB) }, captures: caps },
      result: { status: childM.status, errors: childM.errors, serverHealth: childM.serverHealth },
    };
    fs.writeFileSync(path.join(runDir, "regression-observations.json"), JSON.stringify(obs));
    checks = regPolicy.checkIds.map((id, i) => ({
      id, sourceArtifact: "regression-observations", pointer: ["/runner", "/evidence", "/result"][i], actual: structuredClone([obs.runner, obs.evidence, obs.result][i]),
    }));
  }

  const artIds = selectedCase === "contract-core" ? contract.foundation.artifacts : execution.regressions[selectedCase].artifacts;
  for (const id of artIds) {
    const ext = id.includes("std") ? ".log" : id.includes("capture") ? ".png" : ".json";
    const p = path.join(runDir, id + ext), d = fs.readFileSync(p);
    artifacts.push({ id, path: p, bytes: d.length, sha256: sha(d) });
  }

  await workerReg.stop(execution.deadlinesMs.forcedClose);
  await serverReg.stop(execution.deadlinesMs.forcedClose);
  await workerReg.settleLogs(execution.deadlinesMs.logFinish);
  await serverReg.settleLogs(execution.deadlinesMs.logFinish);

  if (!workerReg.closeSeen || isPidAlive(workerReg.pid)) fail("close-worker", "worker close", "A1_CLOSE_UNVERIFIED");
  if (!serverReg.closeSeen || isPidAlive(serverReg.pid)) fail("close-server", "server close", "A1_CLOSE_UNVERIFIED");

  try {
    validateLifecycle("server", serverReg.toManifestRecord());
    validateLifecycle("worker", workerReg.toManifestRecord());
  } catch (timeErr) {
    recordError("lifecycle-clock", timeErr, "A1_LIFECYCLE_INVALID"); throw timeErr;
  }

  let portFreed = false;
  try { await checkPortFree(PORT); portFreed = true; } catch { portFreed = false; }

  const realTemp = fs.realpathSync(tempDir);
  fs.rmSync(realTemp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  tempRemoved = !fs.existsSync(realTemp);
  tempRemovedAtMs = Date.now(); sealedAtMs = Date.now();
  if (!tempRemoved) throw new Error("temp not removed");

  const candidateManifest = {
    schema: contract.evidenceSchema, stage: "foundation", stageSlice: "A1",
    case: selectedCase, runId, contractSha256: CONTRACT_SHA256, executionSha256: EXECUTION_SHA256,
    status: "READY_FOR_ADJUDICATION", exitCode: 0,
    owner: { pid: process.pid, nodePath: process.execPath, nonceSha256, context },
    worker: { ...workerReg.toManifestRecord(), parentPid: process.pid, nonceSha256, contextAck, runAuthorized, ackReceipt: selectedCase === "contract-core" ? workerAckReceipt : null, argv: workerArgv },
    server: { ...serverReg.toManifestRecord(), stdoutListenVerified: serverStdoutVerified, portListeningAfterClose: !portFreed, health: { status: 200, payload: healthPayload } },
    cleanup: { tempRemoved: true, tempRemovedAtMs }, sealedAtMs,
    errors: { primary: null, cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors },
    artifacts, checks,
  };

  const candidatePath = path.join(runDir, "owner-candidate.json");
  fs.writeFileSync(candidatePath, JSON.stringify(candidateManifest, null, 2));
  const candidateBytes = fs.readFileSync(candidatePath), candidateSha256 = sha(candidateBytes);

  gateReg = new ProcessRecord("adjudicator", path.join(runDir, "adjudicator-stdout.log"), path.join(runDir, "adjudicator-stderr.log"));
  let adjStdout = "", adjStderr = "";
  const gateArgv = [PYTHON_PATH, GATE_PATH, "--execution-sha", EXECUTION_SHA256, "--baseline-sha", BASELINE_SHA256, "--candidate", candidatePath];

  try {
    const gChild = spawn(gateArgv[0], gateArgv.slice(1), { cwd: repoRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    gateReg.attachChild(gChild);
    if (!gChild.pid) fail("gate-spawn", "gate spawn", "A1_GATE_SPAWN_FAILURE");
    gChild.stdout.on("data", (d) => { gateReg.streams.stdout.write(d); adjStdout += d; });
    gChild.stderr.on("data", (d) => { gateReg.streams.stderr.write(d); adjStderr += d; });
  } catch (gSpawnErr) { recordError("gate-spawn", gSpawnErr, "A1_GATE_SPAWN_FAILURE"); throw gSpawnErr; }

  const gateDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { gateReg.child.kill(); reject(new Error("gate timeout")); }, execution.deadlinesMs.adjudicator);
    gateReg.child.once("close", () => { clearTimeout(timer); resolve(true); });
  });

  try { await gateDone; } catch (gErr) { recordError("gate-run", gErr, "A1_GATE_REJECTED"); throw gErr; }
  await gateReg.settleLogs(execution.deadlinesMs.logFinish);

  if (gateReg.exitCode !== 0 || adjStderr.trim() !== "") fail("adjudicator-verdict", `gate reject: ${adjStderr.trim()}`, "A1_GATE_REJECTED");

  let parsedGate;
  try {
    const lines = adjStdout.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length !== 1) throw new Error("lines");
    parsedGate = JSON.parse(lines[0]);
    const r = parsedGate?.result, ek = ["status", "acceptance", "case", "runId", "candidateSha256", "executionSha256", "checks", "artifacts"];
    if (parsedGate?.status !== "PASS" || Object.keys(parsedGate).length !== 2 || !r || Object.keys(r).length !== 8 || ek.some(k => !Object.prototype.hasOwnProperty.call(r, k))) throw new Error("outer");
    if (r.status !== "ACCEPTABLE_CANDIDATE" || r.acceptance !== "A1_PREREQUISITE_ONLY" || r.case !== selectedCase ||
        r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 ||
        r.checks !== checks.length || r.artifacts !== artifacts.length) throw new Error("vals");
  } catch (parseErr) { recordError("adjudicator-response", parseErr, "A1_GATE_RESPONSE_MISMATCH"); throw parseErr; }

  const finalManifest = {
    ...candidateManifest, status: "PASS",
    adjudication: {
      result: parsedGate.result, candidateSha256, gatePath: GATE_PATH, gateSha256: GATE_SHA256,
      process: gateReg.toManifestRecord(), stdoutPath: gateReg.stdoutPath, stderrPath: gateReg.stderrPath,
      stdoutSha256: sha(fs.readFileSync(gateReg.stdoutPath)), stderrSha256: sha(fs.readFileSync(gateReg.stderrPath)),
    },
  };

  const finalPath = path.join(runDir, "owner-final.json");
  try { writeAtomic(finalPath, finalManifest); } catch (fErr) { recordError("final-write", fErr, "A1_FINAL_WRITE_FAILED"); throw fErr; }

  process.stdout.write(JSON.stringify({ status: "PASS", case: selectedCase, runId, manifestPath: finalPath, exitCode: 0, stageSlice: "A1", acceptance: "A1_PREREQUISITE_ONLY" }) + "\n");
  process.exit(0);
} catch (err) {
  if (!primaryError) recordError("execution", err, primaryCode);
  for (const reg of [workerReg, serverReg, gateReg]) { if (reg) { try { await reg.stop(1000); await reg.settleLogs(1000); } catch {} } }

  let workerPartial = null, workerPartialPath = null;
  for (const p of [path.join(runDir, "core-partial.json"), path.join(runDir, "core-partial.fallback.json")]) {
    if (fs.existsSync(p)) {
      try { workerPartial = JSON.parse(fs.readFileSync(p, "utf8")); workerPartialPath = p; break; } catch {}
    }
  }

  const failureManifest = {
    schema: contract?.evidenceSchema || "shiftmgmt.verifier.evidence.v1",
    stage: "foundation", stageSlice: "A1", case: selectedCase, runId,
    contractSha256: CONTRACT_SHA256, executionSha256: EXECUTION_SHA256,
    status: "FAIL", exitCode: 1,
    owner: { pid: process.pid, nodePath: process.execPath, nonceSha256, context: context || {} },
    server: serverReg?.child ? serverReg.toManifestRecord() : null,
    worker: workerReg?.child ? {
      ...workerReg.toManifestRecord(), parentPid: process.pid, nonceSha256, contextAck, runAuthorized,
      ackReceipt: selectedCase === "contract-core" ? workerAckReceipt : null, argv: workerArgv,
    } : null,
    adjudicator: gateReg?.child ? gateReg.toManifestRecord() : null,
    raw: (selectedCase === "contract-core" && workerPartial?.raw) ? workerPartial.raw : null,
    checks: (selectedCase === "contract-core" && workerPartial?.checks) ? workerPartial.checks : checks,
    workerPartialPath, cleanup: { tempRemoved },
    errors: {
      primary: { code: primaryCode, phase: primaryPhase, name: primaryError.name, message: primaryError.message, stack: primaryError.stack },
      cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors,
    },
  };

  try { writeAtomic(path.join(runDir, "owner-failure.json"), failureManifest); } catch (fe1) {
    evidenceErrors.push({ phase: "evidence", name: fe1.name, message: fe1.message, stack: fe1.stack, timeMs: Date.now() });
    try { writeAtomic(path.join(runDir, "owner-failure.fallback.json"), failureManifest); } catch (fe2) {
      evidenceErrors.push({ phase: "evidence", name: fe2.name, message: fe2.message, stack: fe2.stack, timeMs: Date.now() });
    }
  }

  process.stderr.write(JSON.stringify({
    status: "FAIL", code: primaryCode, phase: primaryPhase, case: selectedCase, runId,
    error: { name: primaryError.name, message: primaryError.message, stack: primaryError.stack },
  }) + "\n");
  process.exit(1);
}
