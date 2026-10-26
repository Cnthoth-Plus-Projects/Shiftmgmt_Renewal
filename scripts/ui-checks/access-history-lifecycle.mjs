import { evidenceJSON as aj, registerArtifactSecret, redactText } from "../lib/artifact-privacy.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RAW_KEYS, validateJsonData } from "./access-history-g1.mjs";
import { disposeHeldRoutes } from "./access-history-held.mjs";

const BINDING_KEYS = new Set([
  "runId", "workerPid", "contextSha256", "contractSha256", "executionSha256", "schema", "case"
]);

export async function withNegativeLifecycle(state, context, task, secrets = []) {
  if (typeof task !== "function") throw new Error("Task must be function");
  if (!context?.runDir || !path.isAbsolute(context.runDir)) throw new Error("Invalid runDir");

  const expectedSha256 = crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex").toUpperCase();
  const contextSha = state?.contextSha256;

  if (
    !state ||
    state.runId !== path.basename(context.runDir) ||
    state.workerPid !== process.pid ||
    contextSha !== expectedSha256
  ) {
    const bindingErr = new Error("Invalid lifecycle binding");
    bindingErr.code = "G3_LIFECYCLE_BINDING_INVALID";
    throw bindingErr;
  }

  const runDir = context.runDir;
  const primaryPath = path.join(runDir, "normal-partial.json");
  const primaryTmp = path.join(runDir, "normal-partial.json.tmp");
  const fallbackPath = path.join(runDir, "normal-partial.fallback.json");
  const fallbackTmp = path.join(runDir, "normal-partial.fallback.json.tmp");

  const secretSet = new Set();
  function registerSecret(val) {
    if (typeof val === "string" && val.length > 0) {
      secretSet.add(val);
    }
    return registerArtifactSecret(val, context);
  }

  const initialRegistrations = Array.isArray(secrets) ? secrets.map(registerSecret) : [];

  function redactString(str) {
    if (typeof str !== "string" || !secretSet.size) return str;
    const sorted = [...secretSet].filter(s => typeof s === "string" && s.length > 0).sort((a, b) => b.length - a.length);
    let res = str;
    for (const s of sorted) {
      res = res.replaceAll(s, "[REDACTED]");
    }
    return redactText(res);
  }

  function safeString(val, fallback = "Unknown error") {
    try {
      return String(val) || fallback;
    } catch {
      return fallback;
    }
  }

  function readErrorField(err, key) {
    try {
      return err?.[key];
    } catch {
      return undefined;
    }
  }

  function makeErrorInfo(err, phase, kind) {
    const rawCode = readErrorField(err, "code");
    const rawName = readErrorField(err, "name");
    const rawMessage = readErrorField(err, "message");
    const rawStack = readErrorField(err, "stack");
    const name = redactString(typeof rawName === "string" && rawName ? rawName : "Error");
    const code = redactString(typeof rawCode === "string" && rawCode ? rawCode : name);
    const message = redactString(safeString(rawMessage === undefined ? err : rawMessage, "Error"));
    const stack = typeof rawStack === "string" ? redactString(rawStack) : null;

    return {
      code,
      phase,
      kind,
      name,
      message,
      stack,
      timeMs: Date.now()
    };
  }

  let hasPrimaryError = false;
  let originalPrimaryReason = undefined;

  function recordPrimaryError(reason, phase, kind, info = null) {
    if (!hasPrimaryError) {
      hasPrimaryError = true;
      originalPrimaryReason = reason;
      state.errors.primary = info || makeErrorInfo(reason, phase, kind);
    }
  }

  function redactTree(val, seen = new WeakMap()) {
    if (typeof val === "string") return redactString(val);
    if (val === null || typeof val !== "object") {
      return val;
    }
    if (seen.has(val)) return seen.get(val);
    const out = Array.isArray(val) ? [] : Object.create(Object.getPrototypeOf(val));
    if (Array.isArray(val)) out.length = val.length;
    seen.set(val, out);
    for (const k of Reflect.ownKeys(val)) {
      if (Array.isArray(val) && k === "length") continue;
      Object.defineProperty(out, k, {
        value: redactTree(val[k], seen),
        enumerable: Object.getOwnPropertyDescriptor(val, k).enumerable,
        writable: true,
        configurable: true
      });
    }
    return out;
  }

  function partialPayload() {
    const proj = {};
    for (const k of RAW_KEYS) {
      proj[k] = BINDING_KEYS.has(k) ? state[k] : redactTree(state[k]);
    }
    validateJsonData(proj, "normal.partial");
    return aj(proj) + "\n";
  }

  function writeSnapshot() {
    try {
      fs.writeFileSync(primaryTmp, partialPayload(), "utf8");
      fs.renameSync(primaryTmp, primaryPath);
    } catch (errPrimary) {
      const infoPrimary = makeErrorInfo(errPrimary, "partial-primary", "evidence");
      state.errors.evidence.push(infoPrimary);
      recordPrimaryError(errPrimary, "partial-primary", "evidence", infoPrimary);

      try {
        fs.writeFileSync(fallbackTmp, partialPayload(), "utf8");
        fs.renameSync(fallbackTmp, fallbackPath);
      } catch (errFallback) {
        const infoFallback = makeErrorInfo(errFallback, "partial-fallback", "evidence");
        state.errors.evidence.push(infoFallback);

        try {
          const diag = aj({
            diagnostic: "G3_PARTIAL_WRITE_FAILED",
            primary: infoPrimary.stack ?? infoPrimary.message,
            fallback: infoFallback.stack ?? infoFallback.message
          });
          process.stderr.write(diag + "\n");
        } catch {}
      }
    }
  }

  try { await Promise.all(initialRegistrations); } catch (error) {
    const info = makeErrorInfo(error, "secret-register", "evidence");
    state.errors.evidence.push(info);
    recordPrimaryError(error, "secret-register", "evidence", info);
  }
  // 초기 스냅샷
  writeSnapshot();
  if (hasPrimaryError) {
    throw originalPrimaryReason;
  }

  let browserInst = null;
  let contextInst = null;
  let pageInst = null;
  let observerInst = null;

  const life = {
    registerSecret,
    snapshot: writeSnapshot,
    assertHealthy() { if (hasPrimaryError) throw originalPrimaryReason; },
    recordFailure(reason, phase, kind = "execution") {
      const info = makeErrorInfo(reason, phase, kind);
      if (kind === "cleanup") state.errors.cleanup.push(info);
      else if (kind === "evidence") state.errors.evidence.push(info);
      recordPrimaryError(reason, phase, kind, info);
      writeSnapshot();
      return info;
    },
    async disposeHeld() {
      for (const failure of await disposeHeldRoutes(state)) {
        this.recordFailure(failure.reason, failure.kind === "execution" ? "scenario" : "held-dispose", failure.kind);
      }
      writeSnapshot();
    },
    enterSteps() {
      state.steps.enteredAtMs = Date.now();
      writeSnapshot();
      if (hasPrimaryError) throw originalPrimaryReason;
    },
    async acquire(kind, operation) {
      if (typeof operation !== "function") throw new Error("Operation must be function");
      const currentPhase = kind + "-acquire";
      let res;
      try {
        res = await operation();
      } catch (err) {
        recordPrimaryError(err, currentPhase, "execution");
        writeSnapshot();
        throw err;
      }
      if (kind === "browser") {
        browserInst = res;
        state.resources.browser.acquiredAtMs = Date.now();
      } else if (kind === "context") {
        contextInst = res;
        state.resources.context.acquiredAtMs = Date.now();
      } else if (kind === "page") {
        pageInst = res;
      } else if (kind === "observer") {
        observerInst = res;
      }
      writeSnapshot();
      if (hasPrimaryError) throw originalPrimaryReason;
      return res;
    }
  };

  let taskResult;
  try {
    taskResult = await task(life);
  } catch (err) {
    recordPrimaryError(err, "scenario", "execution");
    writeSnapshot();
  } finally {
    if (observerInst) {
      try {
        if (typeof observerInst.dispose === "function") {
          observerInst.dispose();
        }
      } catch (err) {
        const info = makeErrorInfo(err, "observer-dispose", "cleanup");
        state.errors.cleanup.push(info);
        recordPrimaryError(err, "observer-dispose", "cleanup", info);
      }
      writeSnapshot();
    }

    await life.disposeHeld();

    if (contextInst) {
      state.resources.context.closeAttemptAtMs = Date.now();
      try {
        await contextInst.close();
        state.resources.context.closedAtMs = Date.now();
      } catch (err) {
        state.resources.context.closedAtMs = null;
        const info = makeErrorInfo(err, "context-close", "cleanup");
        state.resources.context.error = info.stack ?? info.message;
        state.errors.cleanup.push(info);
        recordPrimaryError(err, "context-close", "cleanup", info);
      }
      writeSnapshot();
    }

    if (browserInst) {
      state.resources.browser.closeAttemptAtMs = Date.now();
      try {
        await browserInst.close();
        state.resources.browser.closedAtMs = Date.now();
      } catch (err) {
        state.resources.browser.closedAtMs = null;
        const info = makeErrorInfo(err, "browser-close", "cleanup");
        state.resources.browser.error = info.stack ?? info.message;
        state.errors.cleanup.push(info);
        recordPrimaryError(err, "browser-close", "cleanup", info);
      }
      writeSnapshot();
    }
  }

  if (hasPrimaryError) {
    throw originalPrimaryReason;
  }
  return taskResult;
}
