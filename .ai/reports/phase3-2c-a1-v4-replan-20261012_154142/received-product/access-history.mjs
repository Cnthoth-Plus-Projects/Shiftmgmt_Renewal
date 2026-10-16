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
const expectedRepoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
if (repoRoot !== fs.realpathSync(expectedRepoRoot)) {
  process.stderr.write(`[경로 거부] 저장소 경로 불일치\n`);
  process.exit(1);
}

export const BASELINE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v3\\baseline.json";
export const BASELINE_SHA256 = "8E24BC378E4FCA093A36AB902F04C92BD09567B78F7995AA030A60B5634C22E6";
export const GATE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v3\\gate-evidence.py";
export const GATE_SHA256 = "0464704230DE376908ADB910F821E3F015870733347A5C749ED2930C734FAA4A";
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
  failPreflight("A1_CLI_INVALID", null, "인수는 정확히 --case=<case> 하나여야 합니다.");
}

const selectedCase = rawArgs[0].slice(7);
if (!selectedCase || selectedCase.trim() !== selectedCase) {
  failPreflight("A1_CLI_INVALID", null, "case 값에 공백이 있거나 비어있습니다.");
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
  for (const [p, exp] of [
    [CONTRACT_PATH, CONTRACT_SHA256], [EXECUTION_PATH, EXECUTION_SHA256],
    [BASELINE_PATH, BASELINE_SHA256], [GATE_PATH, GATE_SHA256],
    [execution.frozenSharedPath, execution.frozenSharedSha256],
    [path.resolve(path.dirname(CONTRACT_PATH), "verify-evidence.py"), "24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954"]
  ]) {
    if (sha(fs.readFileSync(p)) !== exp) throw new Error("hash mismatch: " + p);
  }
} catch (lockErr) {
  failPreflight("A1_LOCK_MISMATCH", selectedCase, lockErr.message, lockErr);
}

const PORT = Number(contract.port);
const BASE_URL = execution.url;

async function checkPortFree(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (err) => {
      if (err.code === "EADDRINUSE") reject(new Error(`포트 ${port} 점유됨`));
      else reject(err);
    });
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

try {
  await checkPortFree(PORT);
} catch (portErr) {
  failPreflight("A1_PORT_BUSY", selectedCase, portErr.message, portErr);
}

const baseCapturesDir = path.join(repoRoot, "artifacts", "captures", "phase3");
const runDir = createUniqueRunDir(baseCapturesDir, `access-history-${selectedCase}`);
const runId = path.basename(runDir);

let primaryError = null, primaryCode = "A1_WORKER_FAILED", primaryPhase = "execution";
const cleanupErrors = [], evidenceErrors = [], unexpectedErrors = [];

function recordError(phase, err, code = null) {
  const entry = {
    code: code || primaryCode, phase,
    name: err?.name || "Error", message: err?.message || String(err),
    stack: err?.stack || new Error(String(err)).stack || "", timeMs: Date.now(),
  };
  if (!primaryError) {
    primaryError = entry;
    if (code) primaryCode = code;
    primaryPhase = phase;
  } else {
    unexpectedErrors.push(entry);
  }
  return entry;
}

function isPidAlive(pid) {
  if (typeof pid !== "number" || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function buildChildEnv(tDir, bFile) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("SHIFTMGMT_") && !k.startsWith("SHIFT_") && k !== "NODE_OPTIONS" && !k.startsWith("SOL_A1_PROBE")) {
      env[k] = v;
    }
  }
  env.SHIFTMGMT_USER_DATA_DIR = tDir;
  env.SHIFTMGMT_PORT = String(PORT);
  env.SHIFTMGMT_UI_BOOTSTRAP_FILE = bFile;
  return env;
}

function validatePng(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error("PNG 시그니처 오류");
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  if (width !== 1440 || height < 900) throw new Error(`PNG 크기 불일치: ${width}x${height}`);
  return [width, height];
}

class ProcessRecord {
  constructor(name, stdoutPath, stderrPath) {
    this.name = name;
    this.stdoutPath = stdoutPath;
    this.stderrPath = stderrPath;
    this.stdoutStream = fs.createWriteStream(stdoutPath, { flags: "a" });
    this.stderrStream = fs.createWriteStream(stderrPath, { flags: "a" });
    this.child = null; this.pid = null; this.createdAtMs = null;
    this.exitAtMs = null; this.closeAtMs = null; this.exitCode = null;
    this.exitSeen = false; this.closeSeen = false;
    this.stdoutFinishSeen = false; this.stderrFinishSeen = false;
    this.stdoutCloseSeen = false; this.stderrCloseSeen = false;
    this.stdoutFinishAtMs = null; this.stderrFinishAtMs = null;
    this.logError = null; this.settled = false;

    this.stdoutStream.on("error", (e) => { this.logError = e; recordError(`${name}-log-error`, e, "A1_LOG_WRITE_FAILED"); });
    this.stderrStream.on("error", (e) => { this.logError = e; recordError(`${name}-log-error`, e, "A1_LOG_WRITE_FAILED"); });
    this.stdoutStream.on("finish", () => { this.stdoutFinishSeen = true; this.stdoutFinishAtMs = Date.now(); });
    this.stderrStream.on("finish", () => { this.stderrFinishSeen = true; this.stderrFinishAtMs = Date.now(); });
    this.stdoutStream.on("close", () => { this.stdoutCloseSeen = true; });
    this.stderrStream.on("close", () => { this.stderrCloseSeen = true; });
  }

  attachChild(child) {
    this.child = child; this.pid = child.pid ?? null; this.createdAtMs = Date.now();
    child.on("error", (err) => {
      const code = this.name === "server" ? "A1_SERVER_SPAWN_FAILURE"
        : (this.name === "gate" || this.name === "adjudicator") ? "A1_GATE_SPAWN_FAILURE"
        : "A1_WORKER_SPAWN_FAILURE";
      recordError(`${this.name}-spawn-error`, err, code);
    });
    child.once("exit", (code) => { this.exitSeen = true; this.exitCode = code ?? 1; this.exitAtMs = Date.now(); });
    child.once("close", () => { this.closeSeen = true; this.closeAtMs = Date.now(); });
  }

  async stop(timeoutMs = 5000) {
    if (this.child && !this.closeSeen) {
      if (this.child.exitCode === null && !this.exitSeen) {
        try { this.child.kill(); } catch {}
      }
      for (let i = 0; i < timeoutMs / 100; i++) {
        if (this.closeSeen || (this.pid && !isPidAlive(this.pid))) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!this.closeSeen && this.pid && isPidAlive(this.pid)) {
        try { process.kill(this.pid, "SIGKILL"); } catch {}
        for (let i = 0; i < 50; i++) {
          if (this.closeSeen || !isPidAlive(this.pid)) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    }
  }

  async settleLogs(timeoutMs = 5000) {
    if (this.settled) return;
    this.stdoutStream.end();
    this.stderrStream.end();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.stdoutCloseSeen && this.stderrCloseSeen && (this.stdoutFinishSeen || this.logError) && (this.stderrFinishSeen || this.logError)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));
    this.settled = true;
    if (this.logError) {
      recordError(`${this.name}-log-error`, this.logError, "A1_LOG_WRITE_FAILED");
      throw this.logError;
    }
    if (!this.stdoutFinishSeen || !this.stderrFinishSeen) {
      const err = new Error("Log finish unverified");
      recordError(`${this.name}-log-finish`, err, "A1_LOG_FINISH_UNVERIFIED");
      throw err;
    }
  }

  toManifestRecord() {
    const closeTime = this.closeAtMs || Date.now();
    return {
      pid: this.pid, exitCode: this.exitCode ?? 0,
      exitSeen: this.exitSeen, closeSeen: this.closeSeen,
      aliveAfterClose: isPidAlive(this.pid),
      createdAtMs: this.createdAtMs, exitAtMs: this.exitAtMs || closeTime, closeAtMs: closeTime,
      logsSettled: { stdout: true, stderr: true },
      logFinishAtMs: {
        stdout: Math.max(this.stdoutFinishAtMs || Date.now(), closeTime),
        stderr: Math.max(this.stderrFinishAtMs || Date.now(), closeTime),
      },
    };
  }
}

let serverReg = null, workerReg = null, gateReg = null;
let tempDir = null, bootstrapFile = null;
let checks = [], artifacts = [];
let tempRemoved = false, tempRemovedAtMs = null, sealedAtMs = null;

try {
  const osTemp = fs.realpathSync(os.tmpdir());
  tempDir = fs.mkdtempSync(path.join(osTemp, contract.tempPrefix));
  bootstrapFile = path.join(tempDir, "data", "bootstrap-credentials.json");
  fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });

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
      const e = new Error("격리 서버 생성 실패");
      recordError("server-spawn", e, "A1_SERVER_SPAWN_FAILURE");
      throw e;
    }

    sChild.stdout.on("data", (chunk) => {
      serverReg.stdoutStream.write(chunk);
      if (chunk.toString().includes(`http://127.0.0.1:${PORT}`) && chunk.toString().includes(tempDir)) {
        serverStdoutVerified = true;
      }
    });
    sChild.stderr.on("data", (chunk) => serverReg.stderrStream.write(chunk));
  } catch (sErr) {
    recordError("server-spawn", sErr, "A1_SERVER_SPAWN_FAILURE");
    throw sErr;
  }

  const sDeadline = Date.now() + execution.deadlinesMs.readiness;
  let ready = false;
  while (Date.now() < sDeadline) {
    if (serverReg.child.exitCode !== null || serverReg.exitSeen) {
      const e = new Error("격리 서버 조기 종료");
      recordError("server-early-exit", e, "A1_SERVER_SPAWN_FAILURE");
      throw e;
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
    const e = new Error("서버 준비 확인 실패");
    recordError("server-readiness", e, "A1_SERVER_SPAWN_FAILURE");
    throw e;
  }

  const nonce = crypto.randomBytes(32).toString("hex").toUpperCase();
  const nonceSha256 = sha(nonce);
  const context = {
    repository: repoRoot, url: BASE_URL, runDir, tempDir, bootstrapFile,
    contractPath: CONTRACT_PATH, contractSha256: CONTRACT_SHA256,
    executionPath: EXECUTION_PATH, executionSha256: EXECUTION_SHA256,
  };
  const contextSha256 = sha(JSON.stringify(context));

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
        const e = new Error("워커 생성 실패");
        recordError("worker-spawn", e, "A1_WORKER_SPAWN_FAILURE");
        throw e;
      }
    } catch (wErr) {
      recordError("worker-spawn", wErr, "A1_WORKER_SPAWN_FAILURE");
      throw wErr;
    }

    marker.workerPid = wChild.pid;
    fs.writeFileSync(path.join(runDir, "owner-registration.json"), JSON.stringify(marker, null, 2));

    wChild.stdout.on("data", (d) => workerReg.stdoutStream.write(d));
    wChild.stderr.on("data", (d) => workerReg.stderrStream.write(d));

    try {
      wChild.send({
        type: "owner-context", protocol: 2, case: "contract-core",
        ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256, context,
      });
    } catch (sErr) {
      recordError("worker-send", sErr, "A1_WORKER_FAILED");
      throw sErr;
    }

    const ackPromise = new Promise((resolve, reject) => {
      const ackTimeout = setTimeout(() => reject(new Error("worker-ack 타임아웃")), execution.deadlinesMs.contextAck);
      wChild.on("message", (msg) => {
        if (!msg || msg.type !== "worker-ack") return;
        clearTimeout(ackTimeout);
        if (
          msg.protocol !== 2 || msg.case !== "contract-core" ||
          msg.ownerPid !== process.pid || msg.workerPid !== wChild.pid ||
          msg.nonce !== nonce || msg.contextSha256 !== contextSha256
        ) {
          const err = new Error("Ack validation mismatch");
          recordError("worker-ack-invalid", err, "A1_ACK_INVALID");
          return reject(err);
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
      recordError("worker-send", sErr, "A1_WORKER_FAILED");
      throw sErr;
    }
    runAuthorized = true;

    const coreTimeout = execution.deadlinesMs.contractCore;
    const workerDone = new Promise((resolve, reject) => {
      if (workerReg.exitSeen) return resolve(true);
      const timer = setTimeout(() => { wChild.kill(); reject(new Error(`Core 타임아웃`)); }, coreTimeout);
      wChild.once("exit", () => { clearTimeout(timer); resolve(true); });
    });

    try { await workerDone; } catch (wErr) {
      recordError("core-worker", wErr, "A1_WORKER_FAILED");
      throw wErr;
    }

    if (workerReg.exitCode !== 0) {
      const err = new Error(`Core 비정상 종료 (코드: ${workerReg.exitCode})`);
      recordError("core-worker", err, "A1_WORKER_FAILED");
      throw err;
    }

    const wf = JSON.parse(fs.readFileSync(path.join(runDir, "worker-final.json"), "utf8"));
    checks = wf.checks;

    for (const artId of contract.foundation.artifacts) {
      const suffix = artId.includes("stdout") || artId.includes("stderr") ? ".log" : artId.endsWith("capture") ? ".png" : ".json";
      const fullP = path.join(runDir, artId + suffix);
      const data = fs.readFileSync(fullP);
      artifacts.push({ id: artId, path: fullP, bytes: data.length, sha256: sha(data) });
    }
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
        const e = new Error("회귀 워커 생성 실패");
        recordError("regression-spawn", e, "A1_WORKER_SPAWN_FAILURE");
        throw e;
      }
    } catch (wErr) {
      recordError("regression-spawn", wErr, "A1_WORKER_SPAWN_FAILURE");
      throw wErr;
    }

    let stdoutBuffer = "";
    wChild.stdout.on("data", (d) => { workerReg.stdoutStream.write(d); stdoutBuffer += d.toString(); });
    wChild.stderr.on("data", (d) => workerReg.stderrStream.write(d));

    const regTimeout = selectedCase === "regression-home" ? execution.deadlinesMs.regressionHome : execution.deadlinesMs.regressionShell;
    const workerDone = new Promise((resolve, reject) => {
      if (workerReg.exitSeen) return resolve(true);
      const timer = setTimeout(() => { wChild.kill(); reject(new Error(`회귀 워커 타임아웃`)); }, regTimeout);
      wChild.once("exit", () => { clearTimeout(timer); resolve(true); });
    });

    try { await workerDone; } catch (wErr) {
      recordError("regression-worker", wErr, "A1_WORKER_FAILED");
      throw wErr;
    }

    if (workerReg.exitCode !== 0) {
      const err = new Error(`회귀 워커 비정상 종료 (코드: ${workerReg.exitCode})`);
      recordError("regression-worker", err, "A1_WORKER_FAILED");
      throw err;
    }

    const match = stdoutBuffer.match(/- manifest:\s*([^\r\n]+)/);
    if (!match) {
      const err = new Error("stdout에서 regression-evidence manifest 경로 누락");
      recordError("regression-evidence", err, "A1_WORKER_FAILED");
      throw err;
    }

    const origManifestPath = path.resolve(repoRoot, match[1].trim());
    const origManifestBytes = fs.readFileSync(origManifestPath);
    const childManifest = JSON.parse(origManifestBytes.toString("utf8"));
    const copyManifestPath = path.join(runDir, "regression-manifest.json");
    fs.copyFileSync(origManifestPath, copyManifestPath);

    const captureReceipts = [];
    for (const cap of childManifest.captures) {
      const origPng = path.resolve(path.dirname(origManifestPath), cap.filename || `${cap.name}.png`);
      const copyPng = path.join(runDir, `regression-capture-${cap.name}.png`);
      fs.copyFileSync(origPng, copyPng);
      const pngData = fs.readFileSync(copyPng);
      captureReceipts.push({
        name: cap.name, originalPath: origPng, copyPath: copyPng,
        bytes: pngData.length, sha256: sha(pngData), dimensions: validatePng(copyPng),
      });
    }

    const observations = {
      runner: { script: scriptPath, sha256: sha(fs.readFileSync(scriptPath)), argv: workerArgv, pid: wChild.pid, exitCode: workerReg.exitCode },
      evidence: {
        manifest: { originalPath: origManifestPath, copyPath: copyManifestPath, bytes: origManifestBytes.length, sha256: sha(origManifestBytes) },
        captures: captureReceipts,
      },
      result: { status: childManifest.status, errors: childManifest.errors, serverHealth: childManifest.serverHealth },
    };

    fs.writeFileSync(path.join(runDir, "regression-observations.json"), JSON.stringify(observations, null, 2));
    const checkIds = regPolicy.checkIds;
    checks = [
      { id: checkIds[0], sourceArtifact: "regression-observations", pointer: "/runner", actual: structuredClone(observations.runner) },
      { id: checkIds[1], sourceArtifact: "regression-observations", pointer: "/evidence", actual: structuredClone(observations.evidence) },
      { id: checkIds[2], sourceArtifact: "regression-observations", pointer: "/result", actual: structuredClone(observations.result) },
    ];

    for (const artId of regPolicy.artifacts) {
      const suffix = artId.includes("stdout") || artId.includes("stderr") ? ".log" : artId.includes("capture") ? ".png" : ".json";
      const fullP = path.join(runDir, artId + suffix);
      const data = fs.readFileSync(fullP);
      artifacts.push({ id: artId, path: fullP, bytes: data.length, sha256: sha(data) });
    }
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
    owner: {
      pid: process.pid, nodePath: process.execPath, nonceSha256,
      context: { url: BASE_URL, runDir, tempDir, bootstrapFile },
    },
    worker: {
      ...workerReg.toManifestRecord(), parentPid: process.pid,
      nonceSha256, contextAck, runAuthorized, argv: workerArgv,
    },
    server: {
      ...serverReg.toManifestRecord(), stdoutListenVerified: serverStdoutVerified,
      portListeningAfterClose: !portFreed, health: { status: 200, payload: healthPayload },
    },
    cleanup: { tempRemoved: true, tempRemovedAtMs },
    sealedAtMs,
    errors: { primary: null, cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors },
    artifacts, checks,
  };

  const candidatePath = path.join(runDir, "owner-candidate.json");
  fs.writeFileSync(candidatePath, JSON.stringify(candidateManifest, null, 2));
  const candidateBytes = fs.readFileSync(candidatePath);
  const candidateSha256 = sha(candidateBytes);

  gateReg = new ProcessRecord("adjudicator", path.join(runDir, "adjudicator-stdout.log"), path.join(runDir, "adjudicator-stderr.log"));
  let adjStdout = "", adjStderr = "";

  const gateArgv = [
    PYTHON_PATH, GATE_PATH, "--execution-sha", EXECUTION_SHA256,
    "--baseline-sha", BASELINE_SHA256, "--candidate", candidatePath,
  ];

  try {
    const gChild = spawn(gateArgv[0], gateArgv.slice(1), { cwd: repoRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    gateReg.attachChild(gChild);
    if (!gChild.pid) {
      const e = new Error("판정기 생성 실패");
      recordError("gate-spawn", e, "A1_GATE_SPAWN_FAILURE");
      throw e;
    }
    gChild.stdout.on("data", (d) => { gateReg.stdoutStream.write(d); adjStdout += d.toString(); });
    gChild.stderr.on("data", (d) => { gateReg.stderrStream.write(d); adjStderr += d.toString(); });
  } catch (gSpawnErr) {
    recordError("gate-spawn", gSpawnErr, "A1_GATE_SPAWN_FAILURE");
    throw gSpawnErr;
  }

  const gateDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { gateReg.child.kill(); reject(new Error("판정기 타임아웃")); }, execution.deadlinesMs.adjudicator);
    gateReg.child.once("close", () => { clearTimeout(timer); resolve(true); });
  });

  try { await gateDone; } catch (gErr) {
    recordError("gate-run", gErr, "A1_GATE_REJECTED");
    throw gErr;
  }

  await gateReg.settleLogs(execution.deadlinesMs.logFinish);

  if (gateReg.exitCode !== 0 || adjStderr.trim() !== "") {
    const err = new Error(`판정기 거절: ${adjStderr.trim()}`);
    recordError("adjudicator-verdict", err, "A1_GATE_REJECTED");
    throw err;
  }

  let parsedGate;
  try {
    const stdoutLines = adjStdout.trim().split(/\r?\n/).filter(Boolean);
    if (stdoutLines.length !== 1) throw new Error("Gate stdout line mismatch");
    parsedGate = JSON.parse(stdoutLines[0]);
    if (parsedGate.status !== "PASS" || !parsedGate.result) throw new Error("Gate status not PASS");
    const r = parsedGate.result;
    const expectedKeys = new Set(["status", "acceptance", "case", "runId", "candidateSha256", "executionSha256", "checks", "artifacts"]);
    const actualKeys = Object.keys(r);
    if (actualKeys.length !== 8 || actualKeys.some((k) => !expectedKeys.has(k))) throw new Error("Gate keys mismatch");
    if (r.status !== "ACCEPTABLE_CANDIDATE" || r.acceptance !== "A1_PREREQUISITE_ONLY" || r.case !== selectedCase ||
        r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 ||
        r.checks !== checks.length || r.artifacts !== artifacts.length) {
      throw new Error("Gate values mismatch");
    }
  } catch (parseErr) {
    recordError("adjudicator-response", parseErr, "A1_GATE_RESPONSE_MISMATCH");
    throw parseErr;
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
    recordError("final-write", fErr, "A1_FINAL_WRITE_FAILED");
    throw fErr;
  }

  process.stdout.write(JSON.stringify({
    status: "PASS", case: selectedCase, runId, manifestPath: finalPath,
    exitCode: 0, stageSlice: "A1", acceptance: "A1_PREREQUISITE_ONLY",
  }) + "\n");
  process.exit(0);
} catch (err) {
  if (!primaryError) {
    recordError("execution", err, primaryCode);
  }

  if (workerReg) {
    try { await workerReg.stop(1000); await workerReg.settleLogs(1000); } catch {}
  }
  if (serverReg) {
    try { await serverReg.stop(1000); await serverReg.settleLogs(1000); } catch {}
  }
  if (gateReg) {
    try { await gateReg.stop(1000); await gateReg.settleLogs(1000); } catch {}
  }

  try {
    const failureManifest = {
      schema: contract?.evidenceSchema || "shiftmgmt.verifier.evidence.v1",
      stage: "foundation", stageSlice: "A1", case: selectedCase, runId,
      contractSha256: CONTRACT_SHA256, executionSha256: EXECUTION_SHA256,
      status: "FAIL", exitCode: 1, cleanup: { tempRemoved },
      errors: {
        primary: {
          code: primaryCode, phase: primaryPhase,
          name: primaryError.name, message: primaryError.message, stack: primaryError.stack,
        },
        cleanup: cleanupErrors, evidence: evidenceErrors, unexpected: unexpectedErrors,
      },
    };
    fs.writeFileSync(path.join(runDir, "owner-failure.json"), JSON.stringify(failureManifest, null, 2));
  } catch {}

  process.stderr.write(JSON.stringify({
    status: "FAIL", code: primaryCode, phase: primaryPhase, case: selectedCase, runId,
    error: { name: primaryError.name, message: primaryError.message, stack: primaryError.stack },
  }) + "\n");
  process.exit(1);
}
