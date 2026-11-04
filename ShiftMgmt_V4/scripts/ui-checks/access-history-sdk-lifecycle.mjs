import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RAW_KEYS, validateJsonData } from "./access-history-g1.mjs";
import { withNegativeLifecycle } from "./access-history-lifecycle.mjs";

// The unchanged SDK owns its close/exit behavior. Record facts before it exits.
export async function withPositiveLifecycle(state, context, sdk, bind, options, secrets = []) {
  return withNegativeLifecycle(state, context, async life => {
    const { chromium } = await import("playwright");
    const restore = [];
    let observation = null, disposed = false, ownedContext = null;
    const patch = (object, key, replacement) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      Object.defineProperty(object, key, { value: replacement, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? false });
      restore.push(() => {
        if (Object.getOwnPropertyDescriptor(object, key)?.value !== replacement) return;
        if (descriptor) Object.defineProperty(object, key, descriptor);
        else delete object[key];
      });
    };
    const failure = (reason, phase, kind = "execution") => life.recordFailure(reason, phase, kind);
    const dispose = () => {
      if (disposed || !observation) return;
      disposed = true;
      try { observation.dispose(); }
      catch (reason) { failure(reason, "observer-dispose", "cleanup"); }
      life.snapshot();
    };
    const observeClose = (resource, kind) => {
      const original = resource.close;
      let pending = null;
      patch(resource, "close", function(...args) {
        if (pending) return pending;
        pending = (async () => {
          if (kind === "context") { dispose(); await life.disposeHeld(); }
          if (kind === "browser" && ownedContext && state.resources.context.closeAttemptAtMs === null) {
            try { await ownedContext.close(); } catch {}
          }
          const record = state.resources[kind];
          record.closeAttemptAtMs = Date.now();
          life.snapshot();
          try {
            const value = await original.apply(this, args);
            record.closedAtMs = Date.now();
            life.snapshot();
            return value;
          } catch (reason) {
            record.closedAtMs = null;
            const info = failure(reason, kind + "-close", "cleanup");
            record.error = info.stack ?? info.message;
            life.snapshot();
            throw reason;
          }
        })();
        return pending;
      });
    };
    const acquired = async (kind, operation) => {
      let value;
      try { value = await operation(); }
      catch (reason) { failure(reason, kind + "-acquire"); throw reason; }
      if (kind === "browser" || kind === "context") state.resources[kind].acquiredAtMs = Date.now();
      life.snapshot();
      return value;
    };
    const initialLaunch = chromium.launch;
    patch(chromium, "launch", async function(...args) {
      const browser = await acquired("browser", () => initialLaunch.apply(this, args));
      observeClose(browser, "browser");
      const newContext = browser.newContext;
      patch(browser, "newContext", async function(...ctxArgs) {
        const ctx = await acquired("context", () => newContext.apply(this, ctxArgs));
        ownedContext = ctx;
        observeClose(ctx, "context");
        const newPage = ctx.newPage;
        patch(ctx, "newPage", async function(...pageArgs) {
          const page = await acquired("page", () => newPage.apply(this, pageArgs));
          const goto = page.goto;
          patch(page, "goto", async function(...gotoArgs) {
            try { return await goto.apply(this, gotoArgs); }
            catch (reason) { failure(reason, "scenario"); throw reason; }
          });
          life.assertHealthy();
          return page;
        });
        life.assertHealthy();
        return ctx;
      });
      try { life.assertHealthy(); }
      catch (reason) { try { await browser.close(); } catch {} throw reason; }
      return browser;
    });
    try {
      return await bind(state, async controller => {
        observation = controller;
        const observedLaunch = chromium.launch;
        patch(chromium, "launch", async function(...args) {
          const browser = await observedLaunch.apply(this, args);
          const newContext = browser.newContext;
          patch(browser, "newContext", async function(...ctxArgs) {
            try { return await newContext.apply(this, ctxArgs); }
            catch (reason) { failure(reason, "context-acquire"); throw reason; }
          });
          return browser;
        });
        const config = options(controller, life);
        const steps = config.steps;
        return await sdk({ ...config, observe: event => {
          if (event.type === "failure") failure(event.reason, event.phase);
          else if (event.type === "chrome") {
            state.environment.chrome = { path: event.chrome.path, version: event.chrome.version };
            life.snapshot();
          }
        }, steps: async (...args) => {
          life.enterSteps();
          try { return await steps(...args); }
          catch (reason) { failure(reason, "scenario"); throw reason; }
        } });
      });
    } finally {
      dispose();
      await life.disposeHeld();
      for (const undo of restore.reverse()) {
        try { undo(); } catch (reason) { failure(reason, "observer-dispose", "cleanup"); }
      }
      life.snapshot();
    }
  }, secrets);
}

const PHASES = new Set(["browser-acquire", "context-acquire", "page-acquire", "observer-acquire", "scenario", "observer-dispose", "context-close", "browser-close", "partial-primary", "partial-fallback", "held-dispose", "secret-register", "sdk-url", "sdk-health", "sdk-chrome", "sdk-directory", "sdk-fonts", "sdk-execution", "sdk-console", "sdk-pageerror", "sdk-requestfailed", "sdk-response", "sdk-manifest"]);
const INFO_KEYS = ["code", "kind", "message", "name", "phase", "stack", "timeMs"];
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const validInfo = value => exact(value, INFO_KEYS) && ["code", "name", "message"].every(k => typeof value[k] === "string" && value[k].length > 0) && PHASES.has(value.phase) && ["execution", "cleanup", "evidence"].includes(value.kind) && (value.stack === null || typeof value.stack === "string") && Number.isFinite(value.timeMs) && value.timeMs > 0;

export function readWorkerPartial({ runDir, context, caseName, workerPid }) {
  const empty = { raw: null, partialPath: null, primary: null };
  if (caseName === "contract-core") {
    for (const name of ["core-partial.json", "core-partial.fallback.json"]) {
      try { const file = path.join(runDir, name); return { raw: JSON.parse(fs.readFileSync(file, "utf8")), partialPath: file, primary: null }; } catch {}
    }
    return empty;
  }
  const candidates = [];
  try {
    if (!context || !path.isAbsolute(runDir) || context.runDir !== runDir || !Number.isInteger(workerPid) || workerPid <= 0) return empty;
    const expectedSha = crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex").toUpperCase();
    for (const [index, name] of ["normal-partial.json", "normal-partial.fallback.json"].entries()) {
      try {
        const file = path.join(runDir, name), stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        validateJsonData(raw, "worker.partial");
        if (!exact(raw, RAW_KEYS) || raw.schema !== "shiftmgmt.normal.raw.v1" || raw.case !== caseName || raw.runId !== path.basename(runDir) || raw.workerPid !== workerPid || raw.contextSha256 !== expectedSha || raw.contractSha256 !== context.contractSha256 || raw.executionSha256 !== context.executionSha256 || raw.runner?.returned !== false) continue;
        if (!exact(raw.errors, ["primary", "cleanup", "evidence", "unexpected"]) || !validInfo(raw.errors.primary)) continue;
        if (!["cleanup", "evidence", "unexpected"].every(k => Array.isArray(raw.errors[k]) && raw.errors[k].every(validInfo))) continue;
        if (!exact(raw.resources, ["browser", "context"]) || !["browser", "context"].every(k => exact(raw.resources[k], ["acquiredAtMs", "closeAttemptAtMs", "closedAtMs", "error"]) && ["acquiredAtMs", "closeAttemptAtMs", "closedAtMs"].every(t => raw.resources[k][t] === null || Number.isFinite(raw.resources[k][t]) && raw.resources[k][t] > 0))) continue;
        const times = [raw.steps?.enteredAtMs, raw.steps?.completedAtMs, raw.errors.primary.timeMs, ...["cleanup", "evidence", "unexpected"].flatMap(k => raw.errors[k].map(e => e.timeMs)), ...Object.values(raw.resources).flatMap(r => [r.acquiredAtMs, r.closeAttemptAtMs, r.closedAtMs])].filter(Number.isFinite);
        const progress = times.length + ["cleanup", "evidence", "unexpected"].reduce((n, k) => n + raw.errors[k].length, 0);
        candidates.push({ raw, partialPath: file, primary: raw.errors.primary, observedAt: Math.max(...times), progress, modified: stat.mtimeMs, index });
      } catch {}
    }
  } catch { return empty; }
  candidates.sort((a, b) => b.observedAt - a.observedAt || b.progress - a.progress || b.modified - a.modified || b.index - a.index);
  const selected = candidates[0];
  return selected ? { raw: selected.raw, partialPath: selected.partialPath, primary: selected.primary } : empty;
}
