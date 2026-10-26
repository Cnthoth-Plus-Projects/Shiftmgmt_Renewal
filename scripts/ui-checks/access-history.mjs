import{ownerCodec as oc}from"./access-history-errors-scenario.mjs";
import{ownerTerminal as ot}from"./access-history-stale-semantic.mjs";
import { selectEvidenceMode, readCanonicalEvidence, validateCanonicalGateResult } from "./access-history-evidence-dispatch.mjs";
import { readWorkerPartial } from "./access-history-sdk-lifecycle.mjs";
import { evidenceJSON as aj, bindOwnerPrivacy, seedBootstrapSecrets, createProcessRecord } from "../lib/artifact-privacy.mjs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { isDeepStrictEqual as same } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createUniqueRunDir } from "../lib/ui-check.mjs";
import { loadContract, loadExecution, CONTRACT_PATH, CONTRACT_SHA256 } from "./access-history-shared.mjs";
import { validateProcessReceipt, readNormalWorkerEvidence } from "./access-history-negative.mjs";

const repoRoot = fs.realpathSync(process.cwd());
if (repoRoot !== fs.realpathSync(path.resolve(fileURLToPath(import.meta.url), "../../.."))) { process.stderr.write("repo mismatch\n"); process.exit(1); }

export const EXECUTION_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u6-stale\\execution.json";
export const EXECUTION_SHA256 = "41AF3F6966D4D067F7A8788A8ABC9C3A3897E7BD0DD0657AA768C149D2A5F2F2";
export const BASELINE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u6-stale\\baseline.json";
export const BASELINE_SHA256 = "AE656A6437C7DEDEBB4FCCAEE987B0560E9C51BC5B9FA3352AE5802C6E8EB8B1";
export const GATE_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u6-stale\\gate-evidence.py";
export const GATE_SHA256 = "E99E0D1C985E550E174AD5CD1C155FBC856632B7C7D5A21D4DEE306CF3749753";
export const PYTHON_PATH = "C:\\Users\\pangyo\\anaconda3\\python.exe";
const q=oc(aj,EXECUTION_SHA256,BASELINE_SHA256);

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();
const writeAtomic = (t, o, beforeCommit = null) => { fs.writeFileSync(t + ".tmp", aj(o, q.r(o), 2)); if (beforeCommit) beforeCommit(); fs.renameSync(t + ".tmp", t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (o, n) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === n;
const errInfo = (e, m = "Error") => { const msg = (typeof e === "string" ? e : e?.message) || m; return { name: e?.name || "Error", message: msg, stack: e?.stack || new Error(msg).stack || "Error" }; };

const failPreflight = (code, c, msg, err) => {
  const m = msg || err?.message || code;
  process.stderr.write(aj({ status: "FAIL", code, phase: "preflight", case: c, runId: null, error: errInfo(err, m) }) + "\n");
  process.exit(1);
};

const rawArgs = process.argv.slice(2);
const evidenceFlags = {"live-admin":"--evidence=canonical-live-v1","list-fixture":"--evidence=canonical-list-v1","empty-fixture":"--evidence=canonical-empty-v1","filters":"--evidence=canonical-filters-v1","errors":"--evidence=canonical-errors-v1","stale-response":"--evidence=canonical-stale-v1"};
if (rawArgs.length < 1 || rawArgs.length > 2 || !/^--case=[a-z0-9-]+$/.test(rawArgs[0]) || (rawArgs.length === 2 && (!Object.hasOwn(evidenceFlags,rawArgs[0].slice(7)) || rawArgs[1] !== evidenceFlags[rawArgs[0].slice(7)]))) failPreflight("A1_CLI_INVALID", null, "args");
const selectedCase = rawArgs[0].slice(7);
let contract, execution;
try { contract = loadContract(); execution = loadExecution(); } catch (e) { failPreflight("A1_LOCK_MISMATCH", selectedCase, e.message, e); }
try { if (execution.publicCases.includes(selectedCase)) selectEvidenceMode(rawArgs, execution); } catch (e) { failPreflight("A1_CLI_INVALID", selectedCase, "mode", e); }
const pubCases = new Set(execution.publicCases), enCases = new Set(execution.enabledCases), defCases = new Set(execution.deferredCases);
if (!pubCases.has(selectedCase)) failPreflight("A1_CLI_INVALID", null, "case");
if (defCases.has(selectedCase)) {
  process.stdout.write(aj({ status: "BLOCKED_STAGE", code: "A1_DEFERRED", case: selectedCase, reason: "A2_PENDING", stageSlice: "A1" }) + "\n");
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
const sanitizeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => {
  const u = k.toUpperCase();
  return !u.startsWith("SHIFT") && !u.startsWith("SOL_") && !u.startsWith("AUTH_BOOTSTRAP_") && u !== "NODE_OPTIONS" && u !== "NODE_DEBUG";
}));
const buildChildEnv = (d, b) => ({ ...sanitizeEnv(), SHIFTMGMT_USER_DATA_DIR: d, SHIFTMGMT_PORT: String(PORT), SHIFTMGMT_UI_BOOTSTRAP_FILE: b });
const validatePng = (p) => {
  const b = fs.readFileSync(p), w = b.length >= 24 ? b.readUInt32BE(16) : 0, h = b.length >= 24 ? b.readUInt32BE(20) : 0;
  if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || w !== 1440 || h < 900) throw new Error();
  return [w, h];
};

const ProcessRecord = createProcessRecord({ recordError, errInfo, sleep, fail, isPidAlive, cleanupErrors });

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
const canonical = rawArgs.length === 2;
const isListCase = selectedCase === "list-fixture";
const isEmptyCase = selectedCase === "empty-fixture", isErrorsCase = selectedCase === "errors";
const isFiltersCase = selectedCase === "filters";
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
  ensureAuthBootstrapCredentials({ userDataPath: tempDir, env: buildChildEnv(tempDir, bootstrapFile) });
  seedBootstrapSecrets(bootstrapFile);

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
    workerArgv = [process.execPath, path.resolve(repoRoot, script), "--case=" + selectedCase, ...(canonical ? [evidenceFlags[selectedCase]] : [])];
    let wChild;
    try {
      wChild = spawnChild(workerReg, workerArgv[0], workerArgv.slice(1), buildChildEnv(tempDir, bootstrapFile), true);
      await workerReg.spawnPromise;
    } catch (wErr) {
      await cleanProc(workerReg); throw wErr;
    }

    bindOwnerPrivacy(wChild, { protocol: 2, case: selectedCase, ownerPid: process.pid, workerPid: wChild.pid, nonce, contextSha256 }, () => runAuthorized, e => recordError("secret-register", e, "A1_WORKER_FAILED"));
    const marker = { protocol: 2, case: selectedCase, ownerPid: process.pid, workerPid: wChild.pid, nonceSha256, contextSha256, context };
    fs.writeFileSync(path.join(runDir, "owner-registration.json"), aj(marker));

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
        const k = Object.keys(msg);
        const bad = !isObj(msg, 7) || ["type", "protocol", "case", "ownerPid", "workerPid", "nonce", "contextSha256"].some(x => !k.includes(x)) ||
          msg.protocol !== 2 || msg.case !== selectedCase || msg.ownerPid !== process.pid || msg.workerPid !== wChild.pid ||
          msg.nonce !== nonce || msg.contextSha256 !== contextSha256;
        const savedPacket = structuredClone(msg);
        if (isNormal) { delete savedPacket.nonce; savedPacket.nonceSha256 = nonceSha256; }
        workerAckReceipt = { packet: savedPacket, receivedAtMs: Date.now() };
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
    const p = isNormal && !(canonical && (isEmptyCase || isErrorsCase)) && workerReg.exitCode > 0 && Number.isInteger(workerReg.exitCode) && !primaryError && readWorkerPartial({runDir,context,caseName:selectedCase,workerPid:workerReg.pid}).primary;
    if(p){primaryError=p;primaryCode=p.code;primaryPhase=p.phase;}
    if (canonical ? (isEmptyCase ? workerReg.exitCode !== 2 : isErrorsCase ? workerReg.exitCode !== 1 : ![0, 1].includes(workerReg.exitCode)) : workerReg.exitCode !== expCode) { const err = new Error("exit mismatch"); recordError("worker-exit", err, "A1_WORKER_FAILED"); throw err; }
    if(p)throw p;

    if (isNormal) {
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
    fs.writeFileSync(path.join(runDir, "regression-observations.json"), aj(obs));
    checks = regPolicy.checkIds.map((id, i) => ({ id, sourceArtifact: "regression-observations", pointer: ["/runner", "/evidence", "/result"][i], actual: structuredClone([obs.runner, obs.evidence, obs.result][i]) }));
  }

  await workerReg.stop(execution.deadlinesMs.forcedClose);
  await serverReg.stop(execution.deadlinesMs.forcedClose);
  await workerReg.settleLogs(execution.deadlinesMs.logFinish);
  await serverReg.settleLogs(execution.deadlinesMs.logFinish);

  if (!workerReg.closeSeen || isPidAlive(workerReg.pid)) fail("close-worker", "worker close", "A1_CLOSE_UNVERIFIED");
  if (!serverReg.closeSeen || isPidAlive(serverReg.pid)) fail("close-server", "server close", "A1_CLOSE_UNVERIFIED");

  workerCached = cacheProc(workerReg); serverCached = cacheProc(serverReg); checkBarrier();

  if (canonical) {
    normalEvidence = readCanonicalEvidence({ caseName: selectedCase, context, execution, contract, workerPid: workerReg.pid, ownerPid: process.pid, workerArgv, exitCode: workerReg.exitCode });
    checks = normalEvidence.semantic.rules; acquiredRaw = normalEvidence.raw; acquiredChecks = checks;
  } else if (isNormal) {
    normalEvidence = readNormalWorkerEvidence({ caseName: selectedCase, context, execution, contract, workerPid: workerReg.pid, exitCode: workerReg.exitCode });
  }
  artifacts = (selectedCase === "contract-core" ? contract.foundation.artifacts : isNormal ? normalEvidence.artifactIds : execution.regressions[selectedCase].artifacts).map((id) => {
    const p = path.join(runDir, id + (id.includes("std") ? ".log" : id.includes("capture") ? ".png" : id.endsWith("hook")?".mjs":id.endsWith("bundle")?".js":".json")), d = fs.readFileSync(p);
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

  const candidateManifest = { ...makeBaseManifest(canonical ? normalEvidence.workerFinal.status : isNormal ? "FAIL_INCOMPLETE" : "READY_FOR_ADJUDICATION", canonical ? normalEvidence.workerFinal.exitCode : isNormal ? 1 : 0), worker: wrapWorker(workerCached), server: { ...serverCached, stdoutListenVerified: serverStdoutVerified, portListeningAfterClose: !portFreed, health: { status: 200, payload: healthPayload } }, cleanup: { tempRemoved: true, tempRemovedAtMs }, sealedAtMs, errors: errObj(null), artifacts, checks, ...(isNormal ? { coverage: normalEvidence.coverage } : {}) };

  const candidatePath = path.join(runDir, "owner-candidate.json");
  try { writeAtomic(candidatePath, candidateManifest, checkBarrier); } catch (cErr) {
    if (primaryError) throw primaryError;
    recordError("candidate-write", cErr, "A1_CANDIDATE_WRITE_FAILED"); throw cErr;
  }
  const candidateBytes = fs.readFileSync(candidatePath), candidateSha256 = sha(candidateBytes);
  checkBarrier();

  gateReg = new ProcessRecord("adjudicator", path.join(runDir, "adjudicator-stdout.log"), path.join(runDir, "adjudicator-stderr.log"));
  gateReg.maskers.stdout=q.s(gateReg.maskers.stdout,candidateSha256);
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
    if (canonical) {
      if (parsedGate?.status !== "PASS" || !isObj(parsedGate, 2)) throw new Error("canonical gate response");
      validateCanonicalGateResult(r, { phase: "candidate", caseName: selectedCase, runId, candidateSha256, executionSha256: EXECUTION_SHA256, semanticStatus: normalEvidence.semantic.status, artifacts: artifacts.length });
    } else
    if (isNormal) {
      if (parsedGate?.status !== "PASS" || !isObj(parsedGate, 2) || !isObj(r, 8) || r.status !== "ACCEPTABLE_INCOMPLETE_CANDIDATE" || r.acceptance !== "A2_INCOMPLETE_EVIDENCE_ONLY" || r.case !== selectedCase || r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 || r.checks !== 0 || r.artifacts !== artifacts.length) throw new Error();
    } else {
      if (parsedGate?.status !== "PASS" || !isObj(parsedGate, 2) || !isObj(r, 8) || r.status !== "ACCEPTABLE_CANDIDATE" || r.acceptance !== "A1_PREREQUISITE_ONLY" || r.case !== selectedCase || r.runId !== runId || r.candidateSha256 !== candidateSha256 || r.executionSha256 !== EXECUTION_SHA256 || r.checks !== checks.length || r.artifacts !== artifacts.length) throw new Error();
    }
  } catch (parseErr) { recordError("adjudicator-response", parseErr, "A1_GATE_RESPONSE_MISMATCH"); throw parseErr; }

  const finalManifest = { ...candidateManifest, status: canonical ? normalEvidence.workerFinal.status : isNormal ? "FAIL_INCOMPLETE" : "PASS", adjudication: { result: parsedGate.result, candidateSha256, gatePath: GATE_PATH, gateSha256: GATE_SHA256, process: gateCached, stdoutPath: gateReg.stdoutPath, stderrPath: gateReg.stderrPath, stdoutSha256: sha(fs.readFileSync(gateReg.stdoutPath)), stderrSha256: sha(fs.readFileSync(gateReg.stderrPath)) } };
  const finalPath = path.join(runDir, "owner-final.json");
  try { writeAtomic(finalPath, finalManifest, checkBarrier); } catch (fErr) { if (primaryError) throw primaryError; recordError("final-write", fErr, "A1_FINAL_WRITE_FAILED"); throw fErr; }
  if (canonical) {
    finalManifest.adjudication.process = { ...gateCached, argv: gateArgv };
    writeAtomic(finalPath, finalManifest, checkBarrier);
    const w = normalEvidence.workerFinal, s = normalEvidence.semantic.status;
    let a, c;
    if (isEmptyCase) {
      a = s === "COMPLETE" ? "EMPTY_FIXTURE_ORIGINAL8_ONLY" : s === "FAILED" ? "EMPTY_FIXTURE_FAILURE_EVIDENCE_ONLY" : "EMPTY_FIXTURE_INCOMPLETE_EVIDENCE_ONLY";
      c = s === "COMPLETE" ? "EMPTY_FIXTURE_ORIGINAL8_MET" : s === "FAILED" ? "EMPTY_FIXTURE_ORIGINAL8_FAILED" : "A2_COVERAGE_INCOMPLETE";
    } else
    if(isErrorsCase||selectedCase==="stale-response"){[a,c]=ot(selectedCase,s);}else     if (isFiltersCase) {
      a = s === "COMPLETE" ? "FILTERS_FIXTURE_ORIGINAL15_ONLY" : s === "FAILED" ? "FILTERS_FIXTURE_FAILURE_EVIDENCE_ONLY" : "FILTERS_FIXTURE_INCOMPLETE_EVIDENCE_ONLY";
      c = s === "COMPLETE" ? "FILTERS_FIXTURE_ORIGINAL15_MET" : s === "FAILED" ? "FILTERS_FIXTURE_ORIGINAL15_FAILED" : "A2_COVERAGE_INCOMPLETE";
    } else
    if (isListCase) {
      a = s === "COMPLETE" ? "LIST_FIXTURE_ORIGINAL14_ONLY" : s === "FAILED" ? "LIST_FIXTURE_FAILURE_EVIDENCE_ONLY" : "LIST_FIXTURE_INCOMPLETE_EVIDENCE_ONLY";
      c = s === "COMPLETE" ? "LIST_FIXTURE_ORIGINAL14_MET" : s === "FAILED" ? "LIST_FIXTURE_ORIGINAL14_FAILED" : "A2_COVERAGE_INCOMPLETE";
    } else {
      a = s === "COMPLETE" ? "LIVE_ADMIN_ORIGINAL8_ONLY" : s === "FAILED" ? "LIVE_ADMIN_FAILURE_EVIDENCE_ONLY" : "A2_INCOMPLETE_EVIDENCE_ONLY";
      c = s === "COMPLETE" ? "LIVE_ADMIN_ORIGINAL8_MET" : s === "FAILED" ? "LIVE_ADMIN_ORIGINAL8_FAILED" : "A2_COVERAGE_INCOMPLETE";
    }
    const ownerExitCode = (isEmptyCase || isErrorsCase) ? (s === "COMPLETE" ? 0 : 1) : w.exitCode;
    process[ownerExitCode === 0 ? "stdout" : "stderr"].write(aj({ status: w.status, code: c, case: selectedCase, runId, manifestPath: finalPath, exitCode: ownerExitCode, stageSlice: "A2", acceptance: a }) + "\n");
    process.exit(ownerExitCode);
  }
  if (isNormal) {
    process.stderr.write(aj({ status: "FAIL_INCOMPLETE", code: "A2_COVERAGE_INCOMPLETE", case: selectedCase, runId, manifestPath: finalPath, exitCode: 1, stageSlice: "A2", acceptance: "A2_INCOMPLETE_EVIDENCE_ONLY" }) + "\n");
    process.exit(1);
  } else {
    process.stdout.write(aj({ status: "PASS", case: selectedCase, runId, manifestPath: finalPath, exitCode: 0, stageSlice: "A1", acceptance: "A1_PREREQUISITE_ONLY" }) + "\n");
    process.exit(0);
  }
} catch (err) {
  if (!primaryError) recordError("execution", err, primaryCode);
  for (const reg of [workerReg, serverReg, gateReg]) await cleanProc(reg);
  const {raw:workerPartial,partialPath:workerPartialPath} = readWorkerPartial({runDir,context,caseName:selectedCase,workerPid:workerReg?.pid});
  const gfr = (r) => r?.child ? r.toManifestRecord() : null;
  const failureManifest = {
    ...makeBaseManifest("FAIL", 1), server: gfr(serverReg), worker: wrapWorker(gfr(workerReg)), adjudicator: gfr(gateReg),
    acquisition: acquiredAcquisition || workerPartial?.acquisition || null,
    raw: acquiredRaw || (isNormal ? workerPartial : workerPartial?.raw || null),
    checks: acquiredChecks || (selectedCase === "contract-core" && workerPartial?.checks ? workerPartial.checks : checks),
    workerPartialPath: workerPartialPath || null, cleanup: { tempRemoved }, errors: errObj(primaryError),
  };
  const pushEv = (fe) => evidenceErrors.push({ phase: "evidence", ...errInfo(fe), timeMs: Date.now() });
  try { writeAtomic(path.join(runDir, "owner-failure.json"), failureManifest); } catch (fe1) { pushEv(fe1); try { writeAtomic(path.join(runDir, "owner-failure.fallback.json"), failureManifest); } catch (fe2) { pushEv(fe2); } }
  process.stderr.write(aj({ status: "FAIL", code: primaryCode, phase: primaryPhase, case: selectedCase, runId, error: errInfo(primaryError) }) + "\n");
  process.exit(1);
}
