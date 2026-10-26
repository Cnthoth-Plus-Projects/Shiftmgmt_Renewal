import fs from "node:fs";
import { createHash } from "node:crypto";

const MAX_SECRET_BYTES = 65536, MAX_SECRETS = 256;
const privacyError = () => Object.assign(new Error("Artifact secret registration failed"), { code: "G3_SECRET_REGISTRATION_FAILED" });

// Values live only in this process. Artifact serialization never mutates input data.
export function createSecretRegistry() {
  const values = new Set();
  let tokens = [], texts = [], longest = 0;
  const register = value => {
    if (typeof value !== "string" || !value.length || values.has(value)) return;
    if (Buffer.byteLength(value) > MAX_SECRET_BYTES || values.size >= MAX_SECRETS) throw privacyError();
    const variants = new Set([value]);
    let escaped = value;
    for (let i = 0; i < 2; i++) { escaped = JSON.stringify(escaped).slice(1, -1); variants.add(escaped); }
    try { const uri = encodeURIComponent(value); variants.add(uri); variants.add(uri.replace(/%[0-9A-F]{2}/g, s => s.toLowerCase())); } catch {}
    values.add(value);
    const all = new Map(tokens.map(t => [t.toString("hex"), t]));
    for (const v of variants) { const b = Buffer.from(v); all.set(b.toString("hex"), b); }
    tokens = [...all.values()].sort((a, b) => b.length - a.length);
    texts = [...new Set([...texts, ...variants])].sort((a, b) => b.length - a.length);
    longest = tokens[0]?.length || 0;
  };
  function stream() {
    let pending = Buffer.alloc(0), ended = false;
    const consume = final => {
      const safeEnd = final ? pending.length : Math.max(0, pending.length - longest + 1);
      const parts = [];
      let at = 0;
      while (at < safeEnd) {
        let found = -1, match = null;
        for (const token of tokens) {
          const index = pending.indexOf(token, at);
          if (index >= 0 && (found < 0 || index < found)) { found = index; match = token; }
        }
        if (found < 0 || found >= safeEnd) { parts.push(pending.subarray(at, safeEnd)); at = safeEnd; break; }
        parts.push(pending.subarray(at, found), Buffer.from("[REDACTED]"));
        at = found + match.length;
      }
      pending = pending.subarray(at);
      return Buffer.concat(parts);
    };
    return {
      push(chunk) {
        if (ended) throw new Error("Artifact stream already ended");
        pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        return consume(false);
      },
      flush() { if (ended) return Buffer.alloc(0); ended = true; return consume(true); }
    };
  }
  const redact = value => {
    if (typeof value !== "string" || !texts.length) return value;
    const parts = []; let at = 0;
    while (at < value.length) {
      let found = -1, match = null;
      for (const text of texts) { const index = value.indexOf(text, at); if (index >= 0 && (found < 0 || index < found)) { found = index; match = text; } }
      if (found < 0) { parts.push(value.slice(at)); break; }
      parts.push(value.slice(at, found), "[REDACTED]"); at = found + match.length;
    }
    return parts.join("");
  };
  const stringify = (value, replacer = null, space, identities = null) => JSON.stringify(value, function(key, item) {
    const v = typeof replacer === "function" ? replacer.call(this, key, item) : item;
    if (typeof v !== "string") return v;
    const role = identities?.get(this);
    if (role === "health" && key === "dataDir" && /^(?:[a-z]:[\\/]|\/)/i.test(v)) return v;
    if (role && role !== "health" && (
      /sha256$/i.test(key) && /^[a-f0-9]{64}$/i.test(v) ||
      role === "handshake" && key === "nonce" && /^[a-f0-9]{64}$/i.test(v) ||
      role === "handshake" && key === "type" && v === "worker-ack" ||
      ["root", "handshake"].includes(role) && ["case", "schema", "runId"].includes(key) ||
      /(?:path|file|dir|repository|script)$/i.test(key) && /^(?:[a-z]:[\\/]|\/)/i.test(v) ||
      ["url", "origin"].includes(key) && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(v) ||
      role === "origin-check" && key === "actual" && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(v) ||
      role === "argv" && /^(?:[a-z]:[\\/]|\/)/i.test(v)
    )) return v;
    return redact(v);
  }, space);
  const json = (value, replacer = null, space) => stringify(value, replacer, space);
  // Opt-in only for the fixed evidence producers below. Payload/error subtrees
  // are never tagged merely because they contain a binding-like property name.
  const evidence = (value, replacer = null, space) => stringify(value, replacer, space, evidenceIdentities(value));
  return { register, stream, redact, json, evidence };
}

function evidenceIdentities(value) {
  const roles = new WeakMap(), visited = new WeakSet();
  const mark = (v, role = "metadata") => { if (v && typeof v === "object") roles.set(v, role); };
  const artifacts = array => { if (Array.isArray(array)) for (const item of array) mark(item); };
  const runner = v => { mark(v); mark(v?.manifest); mark(v?.argv, "argv"); };
  const evidence = v => { mark(v?.manifest); artifacts(v?.captures); };
  const root = v => {
    if (!v || typeof v !== "object" || visited.has(v)) return;
    visited.add(v); mark(v, "root");
    mark(v.context); mark(v.owner); mark(v.owner?.context);
    mark(v.worker); mark(v.worker?.argv, "argv");
    if (trustedAck(v)) mark(v.worker.ackReceipt.packet, "handshake");
    runner(v.runner); evidence(v.evidence);
    mark(v.adjudication); mark(v.adjudication?.result, "root"); mark(v.canonicalLabels);
    mark(v.chrome); mark(v.environment); mark(v.environment?.chrome);
    mark(v.server?.health?.payload?.data, "health");
    artifacts(v.artifacts); artifacts(v.captures);
    if (v.raw) root(v.raw);
    if (Array.isArray(v.checks)) for (const check of v.checks) {
      if (check?.sourceArtifact === "core-observations") {
        if (check.pointer === "/chrome") mark(check.actual);
        if (check.pointer === "/origin") mark(check, "origin-check");
      }
      if (check?.sourceArtifact !== "regression-observations") continue;
      if (check.pointer === "/runner") runner(check.actual);
      if (check.pointer === "/evidence") evidence(check.actual);
    }
  };
  root(value);
  return roles;
}

function trustedAck(value) {
  const worker = value?.worker, owner = value?.owner, packet = worker?.ackReceipt?.packet;
  if (!worker?.contextAck || !owner?.context || !packet || typeof packet !== "object" || Array.isArray(packet)) return false;
  const nonceKey = Object.hasOwn(packet, "nonce") ? "nonce" : "nonceSha256";
  const keys = ["type", "protocol", "case", "ownerPid", "workerPid", "contextSha256", nonceKey];
  if (Object.keys(packet).length !== 7 || !keys.every(key => Object.hasOwn(packet, key)) ||
      packet.type !== "worker-ack" || packet.protocol !== 2 || packet.case !== value.case ||
      packet.ownerPid !== owner.pid || packet.workerPid !== worker.pid) return false;
  const sha = text => createHash("sha256").update(text).digest("hex").toUpperCase();
  try {
    if (packet.contextSha256 !== sha(JSON.stringify(owner.context))) return false;
    return nonceKey === "nonce" ? /^[a-f0-9]{64}$/i.test(packet.nonce) && sha(packet.nonce) === owner.nonceSha256 :
      packet.nonceSha256 === owner.nonceSha256 && /^[a-f0-9]{64}$/i.test(packet.nonceSha256);
  } catch { return false; }
}

export const artifactRegistry = createSecretRegistry();
export const artifactJSON = (...args) => artifactRegistry.json(...args);
export const evidenceJSON = (...args) => artifactRegistry.evidence(...args);
export const redactText = text => artifactRegistry.redact(text);
export function seedBootstrapSecrets(file, registry = artifactRegistry) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const credential of Object.values(data.credentials || {})) registry.register(credential?.password);
}

const BASE = ["type", "protocol", "case", "ownerPid", "workerPid", "nonce", "contextSha256"];
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const bound = (msg, binding) => BASE.slice(1).every(k => msg[k] === binding[k]);
const packet = (type, binding, requestId) => ({ type, ...Object.fromEntries(BASE.slice(1).map(k => [k, binding[k]])), requestId });

// Separate capability: the existing owner-context / worker-ack / owner-run shapes stay intact.
export function bindOwnerPrivacy(channel, binding, authorized, onError, registry = artifactRegistry) {
  let lastRequest = 0;
  const report = () => onError(privacyError());
  const receive = msg => {
    if (msg?.type !== "worker-secret") return;
    if (!exact(msg, [...BASE, "requestId", "value"]) || !bound(msg, binding) || !authorized() ||
        !Number.isSafeInteger(msg.requestId) || msg.requestId !== lastRequest + 1 ||
        typeof msg.value !== "string" || !msg.value.length || Buffer.byteLength(msg.value) > MAX_SECRET_BYTES) { report(); return; }
    try {
      registry.register(msg.value);
      lastRequest = msg.requestId;
      channel.send(packet("owner-secret-ack", binding, msg.requestId), error => { if (error) report(); });
    } catch { report(); }
  };
  channel.on("message", receive);
  const dispose = () => channel.off("message", receive);
  channel.once("close", dispose);
  return dispose;
}

export function createSecretClient(channel, binding, registry = artifactRegistry, timeoutMs = 5000) {
  let sequence = 0, failed = false;
  const pending = new Map(), registered = new Map();
  const idle = () => { if (!pending.size) channel.channel?.unref?.(); };
  const rejectAll = () => {
    failed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(privacyError()); }
    pending.clear(); idle();
  };
  channel.on("message", msg => {
    if (msg?.type !== "owner-secret-ack") return;
    if (!exact(msg, [...BASE, "requestId"]) || !bound(msg, binding) || !pending.has(msg.requestId)) { rejectAll(); return; }
    const request = pending.get(msg.requestId);
    pending.delete(msg.requestId); clearTimeout(request.timer); request.resolve(); idle();
  });
  channel.once("disconnect", rejectAll);
  channel.once("close", rejectAll);
  idle();
  return value => {
    registry.register(value);
    if (typeof value !== "string" || !value.length) return Promise.resolve();
    if (failed || channel.connected === false) return Promise.reject(privacyError());
    if (registered.has(value)) return registered.get(value);
    const requestId = ++sequence;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(rejectAll, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      channel.channel?.ref?.();
      try { channel.send({ ...packet("worker-secret", binding, requestId), value }, error => { if (error) rejectAll(); }); }
      catch { rejectAll(); }
    });
    registered.set(value, promise);
    return promise;
  };
}

const workerClients = new WeakMap();
export function openWorkerPrivacy(context, ownerRun) {
  seedBootstrapSecrets(context.bootstrapFile);
  workerClients.set(context, createSecretClient(process, ownerRun));
}
export async function registerArtifactSecret(value, context) {
  artifactRegistry.register(value);
  const client = workerClients.get(context);
  if (client) await client(value);
}

// ProcessRecord is appended from the received owner with only explicit masking glue.
export function createProcessRecord({ recordError, errInfo, sleep, fail, isPidAlive, cleanupErrors }) {
class ProcessRecord {
  constructor(name, outP, errP) {
    this.name = name; this.stdoutPath = outP; this.stderrPath = errP;
    this.streams = { stdout: fs.createWriteStream(outP, { flags: "a" }), stderr: fs.createWriteStream(errP, { flags: "a" }) };
    this.maskers = { stdout: artifactRegistry.stream(), stderr: artifactRegistry.stream() };
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
    child.stdout.on("data", (d) => { this.streams.stdout.write(this.maskers.stdout.push(d)); onStdout?.(d); });
    child.stderr.on("data", (d) => this.streams.stderr.write(this.maskers.stderr.push(d)));
    this.spawnPromise = new Promise((resolve, reject) => {
      child.once("spawn", () => { const t = Date.now(); this.pid = child.pid ?? null; this.createdAtMs = t; this.addEv("spawn", t, null, child.pid ?? null, null, null, null); resolve(true); });
      child.on("error", (err) => { const t = Date.now(); this.addEv("error", t, null, this.pid, null, null, errInfo(err)); recordError(`${this.name}-spawn-error`, err, this.name === "server" ? "A1_SERVER_SPAWN_FAILURE" : this.name === "worker" ? "A1_WORKER_SPAWN_FAILURE" : "A1_GATE_SPAWN_FAILURE"); reject(err); });
    });
    for (const ev of ["exit", "close"]) { child.once(ev, (code, signal) => { const t = Date.now(); this[`${ev}Seen`] = true; this[`${ev}Code`] = code ?? null; this[`${ev}Signal`] = signal ?? null; this[`${ev}AtMs`] = t; this.addEv(ev, t, null, this.pid, code ?? null, signal ?? null, null); }); }
  }

  async stop(timeoutMs = 5000) { if (this.child && !this.closeSeen) { if (this.child.exitCode === null && !this.exitSeen) { try { this.child.kill(); } catch {} } const dl = Date.now() + timeoutMs; while (Date.now() < dl && !this.closeSeen) await sleep(50); } }

  async settleLogs(timeoutMs = 5000) {
    if (this.settled) return;
    for (const s of ["stdout", "stderr"]) try { this.streams[s].end(this.maskers[s].flush()); } catch (e) { this.logErrors[s] = this.logError = e; recordError(this.name + "-log-end", e, "A1_LOG_WRITE_FAILED"); try { this.streams[s].destroy(e); } catch (d) { cleanupErrors.push({ phase: "cleanup", ...errInfo(d), timeMs: Date.now() }); } }
    const dl = Date.now() + timeoutMs;
    while (Date.now() < dl && (!this.logCloseSeen.stdout && !this.logErrors.stdout || !this.logCloseSeen.stderr && !this.logErrors.stderr)) await sleep(20);
    await new Promise((r) => setImmediate(r)); if (this.logError) { recordError(`${this.name}-log-error`, this.logError, "A1_LOG_WRITE_FAILED"); throw this.logError; }
    for (const ev of ["Finish", "Close"]) if (!this[`log${ev}Seen`].stdout || !this[`log${ev}Seen`].stderr) fail(`${this.name}-log-${ev.toLowerCase()}`, "unverified", `A1_LOG_${ev.toUpperCase()}_UNVERIFIED`);
    this.settled = true;
  }

  toManifestRecord() { return { pid: this.pid, exitCode: this.exitCode, exitSignal: this.exitSignal, closeCode: this.closeCode, closeSignal: this.closeSignal, exitSeen: this.exitSeen, closeSeen: this.closeSeen, aliveAfterClose: isPidAlive(this.pid), createdAtMs: this.createdAtMs, exitAtMs: this.exitAtMs, closeAtMs: this.closeAtMs, logsSettled: { stdout: this.settled, stderr: this.settled }, logFinishSeen: { ...this.logFinishSeen }, logCloseSeen: { ...this.logCloseSeen }, logFinishAtMs: { ...this.logFinishAtMs }, logCloseAtMs: { ...this.logCloseAtMs }, callbackEvents: structuredClone(this.callbackEvents) }; }
}

return ProcessRecord;
}
