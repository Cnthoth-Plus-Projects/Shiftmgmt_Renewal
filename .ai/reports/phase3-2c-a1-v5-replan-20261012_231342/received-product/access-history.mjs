import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createUniqueRunDir } from "../lib/ui-check.mjs";
import {
  loadContract,
  loadExecution,
  CONTRACT_PATH,
  CONTRACT_SHA256,
  EXECUTION_PATH,
  EXECUTION_SHA256,
} from "./access-history-shared.mjs";

const repoRoot = fs.realpathSync(process.cwd());
if (repoRoot !== fs.realpathSync(path.resolve(fileURLToPath(import.meta.url), "../../.."))) {
  process.stderr.write(`[경로 거부] 저장소 경로 불일치\n`);
  process.exit(1);
}

export const BASELINE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v4\\baseline.json";
export const BASELINE_SHA256 = "86F9EEF2D499B88CD9717BE40C2E14139B57422A69C7CDEF5B5476F2D063B208";
export const GATE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v4\\gate-evidence.py";
export const GATE_SHA256 = "21D88C1662D2EE87D89BFA22332255466BEBE6E3C84F2B15E57AB4BB64314B84";
export const PYTHON_PATH = "C:\\Users\\pangyo\\anaconda3\\python.exe";

function sha(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function failPreflight(code, c, msg, err) {
  process.stderr.write(JSON.stringify({
    status: "FAIL", code, phase: "preflight", case: c, runId: null,
    error: { name: err?.name || "Error", message: msg, stack: err?.stack || new Error(msg).stack }
  }) + "\n");
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) {
  failPreflight("A1_CLI_INVALID", null, "인수는 --case=<case> 형식이어야 합니다.");
}

const selectedCase = rawArgs[0].slice(7);
if (!selectedCase || selectedCase.trim() !== selectedCase) {
  failPreflight("A1_CLI_INVALID", null, "case 값 오류");
}

let contract, execution;
try {
  contract = loadContract();
  execution = loadExecution();
} catch (e) {
  failPreflight("A1_LOCK_MISMATCH", selectedCase, e.message, e);
}

const PUBLIC_CASES = new Set(execution.publicCases);
const ENABLED_CASES = new Set(execution.enabledCases);
const DEFERRED_CASES = new Set(execution.deferredCases);

if (!PUBLIC_CASES.has(selectedCase)) {
  failPreflight("A1_CLI_INVALID", null, `공개 케이스 아님: ${selectedCase}`);
}

if (DEFERRED_CASES.has(selectedCase)) {
  process.stdout.write(JSON.stringify({
    status: "BLOCKED_STAGE", code: "A1_DEFERRED", case: selectedCase,
    reason: "A2_PENDING", stageSlice: "A1"
  }) + "\n");
  process.exit(1);
}

if (!ENABLED_CASES.has(selectedCase)) {
  failPreflight("A1_CLI_INVALID", selectedCase, `A1 미활성화 케이스: ${selectedCase}`);
}

try {
  const baseBytes = fs.readFileSync(BASELINE_PATH);
  if (sha(baseBytes) !== BASELINE_SHA256) throw new Error("baseline sha mismatch");
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
  if (sIdx === -1 || eIdx === -1 || sIdx >= eIdx) throw new Error("shared frozen markers not found");
  const frag = sharedBuf.subarray(sIdx, eIdx);
  if (frag.length !== 6575 || sha(frag) !== "502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1") throw new Error("shared frozen fragment mismatch");
} catch (lockErr) {
  failPreflight("A1_LOCK_MISMATCH", selectedCase, lockErr.message, lockErr);
}

const PORT = Number(contract.port);
const BASE_URL = execution.url;

async function checkPortFree(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (err) => (err.code === "EADDRINUSE" ? reject(new Error(`포트 ${port} 점유됨`)) : reject(err)));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

try {
  await checkPortFree(PORT);
} catch (portErr) {
  failPreflight("A1_PORT_BUSY", selectedCase, portErr.message, portErr);
}

const runDir = createUniqueRunDir(path.join(repoRoot, "artifacts", "captures", "phase3"), `access-history-${selectedCase}`);
const runId = path.basename(runDir);

let primaryError = null, primaryCode = "A1_WORKER_FAILED", primaryPhase = "execution";
const cleanupErrors = [], evidenceErrors = [], unexpectedErrors = [];

function recordError(phase, err, code = null) {
  const entry = {
    code: code || primaryCode, phase,
    name: err?.name || "Error", message: err?.message || String(err),
    stack: err?.stack || new Error(String(err)).stack || "", timeMs: Date.now(),
  };
  if (!primaryError) { primaryError = entry; primaryCode = code || primaryCode; primaryPhase = phase; }
  else unexpectedErrors.push(entry);
  return entry;
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function buildChildEnv(tDir, bFile) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("SHIFTMGMT_") && !k.startsWith("SHIFT_") && k !== "NODE_OPTIONS" && !k.startsWith("SOL_A1_PROBE")) env[k] = v;
  }
  return { ...env, SHIFTMGMT_USER_DATA_DIR: tDir, SHIFTMGMT_PORT: String(PORT), SHIFTMGMT_UI_BOOTSTRAP_FILE: bFile };
}

function validatePng(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error("PNG 시그니처 오류");
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  if (width !== 1440 || height < 900) throw new Error(`PNG 크기 불일치: ${width}x${height}`);
  return [width, height];
}

class ProcessRecord {
  constructor(name, outP, errP) {
    this.name = name; this.stdoutPath = outP; this.stderrPath = errP;
    this.stdoutStream = fs.createWriteStream(outP, { flags: "a" });
    this.stderrStream = fs.createWriteStream(errP, { flags: "a" });
    this.child = this.pid = this.createdAtMs = null;
    this.exitAtMs = this.closeAtMs = this.exitCode = null;
    this.exitSeen = this.closeSeen = false;
    this.stdoutFinishSeen = this.stderrFinishSeen = this.stdoutCloseSeen = this.stderrCloseSeen = false;
    this.stdoutFinishAtMs = this.stderrFinishAtMs = this.stdoutCloseAtMs = this.stderrCloseAtMs = null;
    this.stdoutError = this.stderrError = this.logError = null; this.settled = false;

    for (const s of ["stdout", "stderr"]) {
      const stream = this[`${s}Stream`];
      stream.on("error", (e) => { this[`${s}Error`] = this.logError = e; recordError(`${name}-log-error`, e, "A1_LOG_WRITE_FAILED"); });
      stream.on("finish", () => { this[`${s}FinishSeen`] = true; this[`${s}FinishAtMs`] = Date.now(); });
      stream.on("close", () => { this[`${s}CloseSeen`] = true; this[`${s}CloseAtMs`] = Date.now(); });
    }
  }

  attachChild(child) {
    this.child = child; this.pid = child.pid ?? null; this.createdAtMs = Date.now();
    child.on("error", (err) => {
      const c = this.name === "server" ? "A1_SERVER_SPAWN_FAILURE" : this.name === "worker" ? "A1_WORKER_SPAWN_FAILURE" : "A1_GATE_SPAWN_FAILURE";
      recordError(`${this.name}-spawn-error`, err, c);
    });
    child.once("exit", (code) => { this.exitSeen = true; this.exitCode = code ?? 1; this.exitAtMs = Date.now(); });
    child.once("close", () => { this.closeSeen = true; this.closeAtMs = Date.now(); });
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
    this.stdoutStream.end(); this.stderrStream.end();
    const dl = Date.now() + timeoutMs;
    while (Date.now() < dl) {
      if ((this.stdoutCloseSeen || this.stdoutError) && (this.stderrCloseSeen || this.stderrError)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setImmediate(r));
    if (this.logError) { recordError(`${this.name}-log-error`, this.logError, "A1_LOG_WRITE_FAILED"); throw this.logError; }
    if (!this.stdoutFinishSeen || !this.stderrFinishSeen) {
      const e = new Error("Log finish unverified"); recordError(`${this.name}-log-finish`, e, "A1_LOG_FINISH_UNVERIFIED"); throw e;
    }
    if (!this.stdoutCloseSeen || !this.stderrCloseSeen) {
      const e = new Error("Log close unverified"); recordError(`${this.name}-log-close`, e, "A1_LOG_CLOSE_UNVERIFIED"); throw e;
    }
    this.settled = true;
  }

  toManifestRecord() {
    let exitAtMs = this.exitAtMs, closeAtMs = this.closeAtMs;
    if (exitAtMs !== null && this.createdAtMs !== null && exitAtMs < this.createdAtMs) exitAtMs = this.createdAtMs;
    if (closeAtMs !== null && exitAtMs !== null && closeAtMs < exitAtMs) closeAtMs = exitAtMs;
    if (!this.closeSeen) closeAtMs = null;
    const fin = { stdout: this.stdoutFinishSeen ? this.stdoutFinishAtMs : null, stderr: this.stderrFinishSeen ? this.stderrFinishAtMs : null };
    const cls = { stdout: this.stdoutCloseSeen ? this.stdoutCloseAtMs : null, stderr: this.stderrCloseSeen ? this.stderrCloseAtMs : null };
    for (const s of ["stdout", "stderr"]) {
      if (fin[s] !== null && closeAtMs !== null && fin[s] < closeAtMs) fin[s] = closeAtMs;
      if (cls[s] !== null && fin[s] !== null && cls[s] < fin[s]) cls[s] = fin[s];
    }
    return {
      pid: this.pid, exitCode: this.exitCode ?? 0, exitSeen: this.exitSeen, closeSeen: this.closeSeen,
      aliveAfterClose: isPidAlive(this.pid), createdAtMs: this.createdAtMs, exitAtMs, closeAtMs,
      logsSettled: { stdout: this.settled, stderr: this.settled },
      logFinishSeen: { stdout: this.stdoutFinishSeen, stderr: this.stderrFinishSeen },
      logCloseSeen: { stdout: this.stdoutCloseSeen, stderr: this.stderrCloseSeen },
      logFinishAtMs: fin, logCloseAtMs: cls,
    };
  }
}

let serverReg = null, workerReg = null, gateReg = null;
let tempDir = null, bootstrapFile = null;
let nonce = null, nonceSha256 = null, context = null, contextSha256 = null;
let checks = [], artifacts = [];
let tempRemoved = false, tempRemovedAtMs = null, sealedAtMs = null;

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

  const { ensureAuthBootstrapCredentials } = await import(
    new URL(`file://${path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js").replace(/\\/g, "/")}`).href
  );
  ensureAuthBootstrapCredentials({ userDataPath: tempDir });

  serverReg = new ProcessRecord("server", path.join(runDir, "server-stdout.log"), path.join(runDir, "server-stderr.log"));
  let serverStdoutVerified = false, healthPayload = null;

  try {
    const sChild = spawn(process.execPath, [path.join(repoRoot, "dist/server/main/server.js")], {
      cwd: repoRoot, env: buildChildEnv(tempDir, bootstrapFile), windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverReg.attachChild(sChild);
    if (!sChild.pid) {
      const e = new Error("격리 서버 생성 실패"); recordError("server-spawn", e, "A1_SERVER_SPAWN_FAILURE"); throw e;
    }
    sChild.stdout.on("data", (chunk) => {
      serverReg.stdoutStream.write(chunk);
      if (chunk.toString().includes(`http://127.0.0.1:${PORT}`) && chunk.toString().includes(tempDir)) serverStdoutVerified = true;
    });
    sChild.stderr.on("data", (chunk) => serverReg.stderrStream.write(chunk));
  } catch (sErr) {
    recordError("server-spawn", sErr, "A1_SERVER_SPAWN_FAILURE"); throw sErr;
  }

  const sDeadline = Date.now() + execution.deadlinesMs.readiness;
  let ready = false;
  while (Date.now() < sDeadline) {
    if (serverReg.child.exitCode !== null || serverReg.exitSeen) {
      const e = new Error("격리 서버 조기 종료"); recordError("server-early-exit", e, "A1_SERVER_SPAWN_FAILURE"); throw e;
    }
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
  if (!ready) {
    const e = new Error("서버 준비 확인 실패"); recordError("server-readiness", e, "A1_SERVER_SPAWN_FAILURE"); throw e;
  }

  workerReg = new ProcessRecord("worker", path.join(runDir, "worker-stdout.log"), path.join(runDir, "worker-stderr.log"));
  let contextAck = false, runAuthorized = false, workerArgv = [];

  if (selectedCase === "contract-core") {
    const marker = { protocol: 2, case: "contract-core", ownerPid: process.pid, workerPid: null, nonceSha256, contextSha256, context };
    workerArgv = [process.execPath, path.join(repoRoot, "scripts/ui-checks/access-history-shared.mjs"), "--case=contract-core"];
    let wChild;
    try {
      wChild = spawn(workerArgv[0], workerArgv.slice(1), {
        cwd: repoRoot, env: buildChildEnv(tempDir, bootstrapFile), windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      workerReg.attachChild(wChild);
      if (!wChild.pid) {
        const e = new Error("워커 실패"); recordError("worker-spawn", e, "A1_WORKER_SPAWN_FAILURE"); throw e;
      }
    } catch (wErr) {
      recordError("worker-spawn", wErr, "A1_WORKER_SPAWN_FAILURE"); throw wErr;
    }

    marker.workerPid = wChild.pid;
    fs.writeFileSync(path.join(runDir, "owner-registration.json"), JSON.stringify(marker));
    wChild.stdout.on("data", (d) => workerReg.stdoutStream.write(d));
    wChild.stderr.on("data", (d) => workerReg.stderrStream.write(d));

    try {
      wChild.send({
        type: "owner-context", protocol: 2, case: "contract-core",
        ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256, context,
      });
    } catch (sErr) {
      recordError("worker-send", sErr, "A1_WORKER_FAILED"); throw sErr;
    }

    const ackPromise = new Promise((resolve, reject) => {
      const ackTimeout = setTimeout(() => reject(new Error("ack timeout")), execution.deadlinesMs.contextAck);
      wChild.on("message", (msg) => {
        if (!msg || msg.type !== "worker-ack") return;
        clearTimeout(ackTimeout);
        if (
          msg.protocol !== 2 || msg.case !== "contract-core" ||
          msg.ownerPid !== process.pid || msg.workerPid !== wChild.pid ||
          msg.nonce !== nonce || msg.contextSha256 !== contextSha256
        ) {
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
      wChild.send({
        type: "owner-run", protocol: 2, case: "contract-core",
        ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256,
      });
    } catch (sErr) {
      recordError("worker-send", sErr, "A1_WORKER_FAILED"); throw sErr;
    }
    runAuthorized = true;

    const coreTimeout = execution.deadlinesMs.contractCore;
    const workerDone = new Promise((resolve, reject) => {
      if (workerReg.exitSeen) return resolve(true);
      const timer = setTimeout(() => { wChild.kill(); reject(new Error(`Core 타임아웃`)); }, coreTimeout);
      wChild.once("exit", () => { clearTimeout(timer); resolve(true); });
    });

    try { await workerDone; } catch (wErr) {
      recordError("core-worker", wErr, "A1_WORKER_FAILED"); throw wErr;
    }

    if (workerReg.exitCode !== 0) {
      const err = new Error(`Core 비정상 종료 (코드: ${workerReg.exitCode})`);
      recordError("core-worker", err, "A1_WORKER_FAILED"); throw err;
    }

    checks = JSON.parse(fs.readFileSync(path.join(runDir, "worker-final.json"), "utf8")).checks;
  } else {
    const regPolicy = execution.regressions[selectedCase];
    const scriptPath = path.resolve(repoRoot, regPolicy.script);
    workerArgv = [process.execPath, scriptPath, BASE_URL, ...regPolicy.extraArgs];

    let wChild;
    try {
      wChild = spawn(workerArgv[0], workerArgv.slice(1), {
        cwd: repoRoot, env: buildChildEnv(tempDir, bootstrapFile), windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      workerReg.attachChild(wChild);
      if (!wChild.pid) {
        const e = new Error("워커 실패"); recordError("regression-spawn", e, "A1_WORKER_SPAWN_FAILURE"); throw e;
      }
    } catch (wErr) {
      recordError("regression-spawn", wErr, "A1_WORKER_SPAWN_FAILURE"); throw wErr;
    }

    let stdoutBuffer = "";
    wChild.stdout.on("data", (d) => { workerReg.stdoutStream.write(d); stdoutBuffer += d; });
    wChild.stderr.on("data", (d) => workerReg.stderrStream.write(d));

    const regTimeout = selectedCase === "regression-home" ? execution.deadlinesMs.regressionHome : execution.deadlinesMs.regressionShell;
    const workerDone = new Promise((resolve, reject) => {
      if (workerReg.exitSeen) return resolve(true);
      const timer = setTimeout(() => { wChild.kill(); reject(new Error(`회귀 워커 타임아웃`)); }, regTimeout);
      wChild.once("exit", () => { clearTimeout(timer); resolve(true); });
    });

    try { await workerDone; } catch (wErr) {
      recordError("regression-worker", wErr, "A1_WORKER_FAILED"); throw wErr;
    }

    if (workerReg.exitCode !== 0) {
      const err = new Error(`회귀 비정상 종료: ${workerReg.exitCode}`);
      recordError("regression-worker", err, "A1_WORKER_FAILED"); throw err;
    }

    const match = stdoutBuffer.match(/- manifest:\s*([^\r\n]+)/);
    if (!match) {
      const err = new Error("manifest 경로 누락");
      recordError("regression-evidence", err, "A1_WORKER_FAILED"); throw err;
    }

    const origP = path.resolve(repoRoot, match[1].trim());
    const origB = fs.readFileSync(origP);
    const childM = JSON.parse(origB);
    const copyP = path.join(runDir, "regression-manifest.json");
    fs.copyFileSync(origP, copyP);

    const caps = childM.captures.map((c) => {
      const oP = path.resolve(path.dirname(origP), c.filename || `${c.name}.png`);
      const cP = path.join(runDir, `regression-capture-${c.name}.png`);
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
      id, sourceArtifact: "regression-observations",
      pointer: ["/runner", "/evidence", "/result"][i],
      actual: structuredClone([obs.runner, obs.evidence, obs.result][i]),
    }));
  }

  const artIds = selectedCase === "contract-core" ? contract.foundation.artifacts : execution.regressions[selectedCase].artifacts;
  for (const artId of artIds) {
    const suffix = artId.includes("stdout") || artId.includes("stderr") ? ".log" : artId.includes("capture") ? ".png" : ".json";
    const fullP = path.join(runDir, artId + suffix);
    const data = fs.readFileSync(fullP);
    artifacts.push({ id: artId, path: fullP, bytes: data.length, sha256: sha(data) });
  }

  await workerReg.stop(execution.deadlinesMs.forcedClose);
  await serverReg.stop(execution.deadlinesMs.forcedClose);
  await workerReg.settleLogs(execution.deadlinesMs.logFinish);
  await serverReg.settleLogs(execution.deadlinesMs.logFinish);

  if (!workerReg.closeSeen || isPidAlive(workerReg.pid)) {
    recordError("close-worker", new Error("worker close 미관측"), "A1_CLOSE_UNVERIFIED");
    throw new Error("worker close 미관측");
  }
  if (!serverReg.closeSeen || isPidAlive(serverReg.pid)) {
    recordError("close-server", new Error("server close 미관측"), "A1_CLOSE_UNVERIFIED");
    throw new Error("server close 미관측");
  }

  let portFreed = false;
  try { await checkPortFree(PORT); portFreed = true; } catch { portFreed = false; }

  const realTemp = fs.realpathSync(tempDir);
  const maxFinish = Math.max(
    serverReg.stdoutFinishAtMs || 0, serverReg.stderrFinishAtMs || 0,
    workerReg.stdoutFinishAtMs || 0, workerReg.stderrFinishAtMs || 0
  );
  fs.rmSync(realTemp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  tempRemoved = !fs.existsSync(realTemp);
  tempRemovedAtMs = Math.max(Date.now(), maxFinish);
  sealedAtMs = Math.max(Date.now(), tempRemovedAtMs);

  if (!tempRemoved) throw new Error("격리 디렉토리 정리 미완료");

  const candidateManifest = {
    schema: contract.evidenceSchema, stage: "foundation", stageSlice: "A1",
    case: selectedCase, runId, contractSha256: CONTRACT_SHA256, executionSha256: EXECUTION_SHA256,
    status: "READY_FOR_ADJUDICATION", exitCode: 0,
    owner: { pid: process.pid, nodePath: process.execPath, nonceSha256, context: { url: BASE_URL, runDir, tempDir, bootstrapFile } },
    worker: { ...workerReg.toManifestRecord(), parentPid: process.pid, nonceSha256, contextAck, runAuthorized, argv: workerArgv },
    server: { ...serverReg.toManifestRecord(), stdoutListenVerified: serverStdoutVerified, portListeningAfterClose: !portFreed, health: { status: 200, payload: healthPayload } },
    cleanup: { tempRemoved: true, tempRemovedAtMs }, sealedAtMs,
    errors: { primary: null, cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors },
    artifacts, checks,
  };

  const candidatePath = path.join(runDir, "owner-candidate.json");
  fs.writeFileSync(candidatePath, JSON.stringify(candidateManifest, null, 2));
  const candidateBytes = fs.readFileSync(candidatePath);
  const candidateSha256 = sha(candidateBytes);

  gateReg = new ProcessRecord("adjudicator", path.join(runDir, "adjudicator-stdout.log"), path.join(runDir, "adjudicator-stderr.log"));
  let adjStdout = "", adjStderr = "";

  const gateArgv = [PYTHON_PATH, GATE_PATH, "--execution-sha", EXECUTION_SHA256, "--baseline-sha", BASELINE_SHA256, "--candidate", candidatePath];

  try {
    const gChild = spawn(gateArgv[0], gateArgv.slice(1), { cwd: repoRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    gateReg.attachChild(gChild);
    if (!gChild.pid) {
      const e = new Error("판정기 생성 실패"); recordError("gate-spawn", e, "A1_GATE_SPAWN_FAILURE"); throw e;
    }
    gChild.stdout.on("data", (d) => { gateReg.stdoutStream.write(d); adjStdout += d; });
    gChild.stderr.on("data", (d) => { gateReg.stderrStream.write(d); adjStderr += d; });
  } catch (gSpawnErr) {
    recordError("gate-spawn", gSpawnErr, "A1_GATE_SPAWN_FAILURE"); throw gSpawnErr;
  }

  const gateDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { gateReg.child.kill(); reject(new Error("판정기 타임아웃")); }, execution.deadlinesMs.adjudicator);
    gateReg.child.once("close", () => { clearTimeout(timer); resolve(true); });
  });

  try { await gateDone; } catch (gErr) {
    recordError("gate-run", gErr, "A1_GATE_REJECTED"); throw gErr;
  }

  await gateReg.settleLogs(execution.deadlinesMs.logFinish);

  if (gateReg.exitCode !== 0 || adjStderr.trim() !== "") {
    const err = new Error(`판정기 거절: ${adjStderr.trim()}`);
    recordError("adjudicator-verdict", err, "A1_GATE_REJECTED"); throw err;
  }

  let parsedGate;
  try {
    const lines = adjStdout.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length !== 1) throw new Error("lines");
    parsedGate = JSON.parse(lines[0]);
    const ok = Object.keys(parsedGate);
    if (ok.length !== 2 || !ok.includes("status") || !ok.includes("result") || parsedGate.status !== "PASS" || !parsedGate.result) {
      throw new Error("outer");
    }
    const r = parsedGate.result, rk = Object.keys(r);
    const ek = new Set(["status", "acceptance", "case", "runId", "candidateSha256", "executionSha256", "checks", "artifacts"]);
    if (rk.length !== 8 || rk.some((k) => !ek.has(k))) throw new Error("keys");
    if (r.status !== "ACCEPTABLE_CANDIDATE" || r.acceptance !== "A1_PREREQUISITE_ONLY" || r.case !== selectedCase ||
        r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 ||
        r.checks !== checks.length || r.artifacts !== artifacts.length) {
      throw new Error("vals");
    }
  } catch (parseErr) {
    recordError("adjudicator-response", parseErr, "A1_GATE_RESPONSE_MISMATCH"); throw parseErr;
  }

  const finalManifest = {
    ...candidateManifest, status: "PASS",
    adjudication: {
      result: parsedGate.result, candidateSha256, gatePath: GATE_PATH, gateSha256: GATE_SHA256,
      process: gateReg.toManifestRecord(), stdoutPath: gateReg.stdoutPath, stderrPath: gateReg.stderrPath,
      stdoutSha256: sha(fs.readFileSync(gateReg.stdoutPath)), stderrSha256: sha(fs.readFileSync(gateReg.stderrPath)),
    },
  };

  const finalPath = path.join(runDir, "owner-final.json");
  const tmpFinalPath = path.join(runDir, "owner-final.json.tmp");
  try {
    fs.writeFileSync(tmpFinalPath, JSON.stringify(finalManifest, null, 2));
    fs.renameSync(tmpFinalPath, finalPath);
  } catch (fErr) {
    recordError("final-write", fErr, "A1_FINAL_WRITE_FAILED"); throw fErr;
  }

  process.stdout.write(JSON.stringify({
    status: "PASS", case: selectedCase, runId, manifestPath: finalPath,
    exitCode: 0, stageSlice: "A1", acceptance: "A1_PREREQUISITE_ONLY",
  }) + "\n");
  process.exit(0);
} catch (err) {
  if (!primaryError) recordError("execution", err, primaryCode);

  for (const reg of [workerReg, serverReg, gateReg]) {
    if (reg) { try { await reg.stop(1000); await reg.settleLogs(1000); } catch {} }
  }

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
    worker: workerReg?.child ? workerReg.toManifestRecord() : null,
    adjudicator: gateReg?.child ? gateReg.toManifestRecord() : null,
    raw: (selectedCase === "contract-core" && workerPartial?.raw) ? workerPartial.raw : null,
    checks: (selectedCase === "contract-core" && workerPartial?.checks) ? workerPartial.checks : checks,
    workerPartialPath, cleanup: { tempRemoved },
    errors: {
      primary: { code: primaryCode, phase: primaryPhase, name: primaryError.name, message: primaryError.message, stack: primaryError.stack },
      cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors,
    },
  };

  const writeAtomic = (t) => { fs.writeFileSync(t + ".tmp", JSON.stringify(failureManifest, null, 2)); fs.renameSync(t + ".tmp", t); };
  try { writeAtomic(path.join(runDir, "owner-failure.json")); } catch (fe1) {
    evidenceErrors.push({ phase: "evidence", name: fe1.name, message: fe1.message, stack: fe1.stack, timeMs: Date.now() });
    try { writeAtomic(path.join(runDir, "owner-failure.fallback.json")); } catch (fe2) {
      evidenceErrors.push({ phase: "evidence", name: fe2.name, message: fe2.message, stack: fe2.stack, timeMs: Date.now() });
    }
  }

  process.stderr.write(JSON.stringify({
    status: "FAIL", code: primaryCode, phase: primaryPhase, case: selectedCase, runId,
    error: { name: primaryError.name, message: primaryError.message, stack: primaryError.stack },
  }) + "\n");
  process.exit(1);
}
