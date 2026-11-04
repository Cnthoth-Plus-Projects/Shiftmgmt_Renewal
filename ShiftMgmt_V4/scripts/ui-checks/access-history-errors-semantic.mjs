// scripts/ui-checks/access-history-errors-semantic.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";

const SHAPES_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u5-public\\errors-wire-shapes.json";
const SHAPES_LEN = 256608;
const SHAPES_SHA = "0B8B5C6F3A4F4D13ACF4EE6FC724F0108395E01C559BA8B9DC31A67BAF09C1A3";
const IDS = ["ERROR-01", "ERROR-02", "ERROR-03", "ERROR-04", "ERROR-05", "ERROR-06", "ERROR-07", "ERROR-08"];

let cachedSchema = null;
function getSchema() {
  if (cachedSchema) return cachedSchema;
  const b = fs.readFileSync(SHAPES_PATH);
  if (b.length !== SHAPES_LEN || crypto.createHash("sha256").update(b).digest("hex").toUpperCase() !== SHAPES_SHA) {
    throw new Error("CANONICAL_BINDING");
  }
  cachedSchema = JSON.parse(b.toString("utf-8"));
  return cachedSchema;
}

function checkByteView(bytes) {
  if (!bytes || typeof bytes !== "object") throw new Error("WIRE_BYTES");
  if (util.types.isProxy(bytes)) throw new Error("WIRE_BYTES");
  const proto = Object.getPrototypeOf(bytes);
  if (proto !== Uint8Array.prototype && proto !== Buffer.prototype) throw new Error("WIRE_BYTES");
  for (const k of ["byteLength", "byteOffset", "buffer"]) {
    const d = Object.getOwnPropertyDescriptor(bytes, k);
    if (d) throw new Error("WIRE_BYTES");
  }
  for (const k of Object.getOwnPropertyNames(bytes)) {
    if (isNaN(k)) {
      const d = Object.getOwnPropertyDescriptor(bytes, k);
      if (d && (d.get || d.set)) throw new Error("WIRE_BYTES");
    }
  }
  if (Object.getOwnPropertySymbols(bytes).length > 0) throw new Error("WIRE_BYTES");
}

function safeBuffer(bytes) {
  checkByteView(bytes);
  const proto = Object.getPrototypeOf(Uint8Array.prototype);
  const getByteLength = Object.getOwnPropertyDescriptor(proto, "byteLength").get;
  const getByteOffset = Object.getOwnPropertyDescriptor(proto, "byteOffset").get;
  const getBuffer = Object.getOwnPropertyDescriptor(proto, "buffer").get;
  const len = getByteLength.call(bytes);
  if (len > 8388608) throw new Error("WIRE_BYTES");
  const offset = getByteOffset.call(bytes);
  const arrBuf = getBuffer.call(bytes);
  return Buffer.from(arrBuf, offset, len);
}

function parseJsonStrict(bytes) {
  const buf = safeBuffer(bytes);
  if (buf.length >= 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) throw new Error("WIRE_JSON");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
  let pos = 0;
  const skip = () => { while (pos < text.length && /[ \t\r\n]/.test(text[pos])) pos++; };
  const readString = () => {
    pos++;
    let out = "";
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '"') return out;
      if (c === "\\") {
        if (pos >= text.length) throw new Error("WIRE_JSON");
        const esc = text[pos++];
        const m = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }[esc];
        if (m) out += m;
        else if ('"\\/'.includes(esc)) out += esc;
        else if (esc === "u") {
          const hex = text.slice(pos, pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("WIRE_JSON");
          pos += 4;
          out += String.fromCharCode(parseInt(hex, 16));
        } else throw new Error("WIRE_JSON");
      } else {
        if (c.charCodeAt(0) < 32) throw new Error("WIRE_JSON");
        out += c;
      }
    }
    throw new Error("WIRE_JSON");
  };

  const scanVal = depth => {
    if (depth > 64) throw new Error("WIRE_DEPTH");
    skip();
    if (pos >= text.length) throw new Error("WIRE_JSON");
    const c = text[pos];
    if (c === '"') return readString();
    if (c === "{") {
      pos++;
      skip();
      const obj = {};
      let count = 0;
      if (pos < text.length && text[pos] === "}") { pos++; return obj; }
      while (pos < text.length) {
        skip();
        if (pos >= text.length || text[pos] !== '"') throw new Error("WIRE_JSON");
        const key = readString();
        if (Object.hasOwn(obj, key)) throw new Error("DUPLICATE_JSON_KEY");
        if (key.length > 200000) throw new Error("WIRE_KEY");
        skip();
        if (pos >= text.length || text[pos] !== ":") throw new Error("WIRE_JSON");
        pos++;
        Object.defineProperty(obj,key,{value:scanVal(depth+1),enumerable:true,writable:true,configurable:true});
        count++;
        if (count > 4096) throw new Error("WIRE_OBJECT_SIZE");
        skip();
        if (pos < text.length && text[pos] === "}") { pos++; return obj; }
        if (pos >= text.length || text[pos] !== ",") throw new Error("WIRE_JSON");
        pos++;
      }
      throw new Error("WIRE_JSON");
    }
    if (c === "[") {
      pos++;
      skip();
      const arr = [];
      if (pos < text.length && text[pos] === "]") { pos++; return arr; }
      while (pos < text.length) {
        arr.push(scanVal(depth + 1));
        if (arr.length > 4096) throw new Error("WIRE_ARRAY_SIZE");
        skip();
        if (pos < text.length && text[pos] === "]") { pos++; return arr; }
        if (pos >= text.length || text[pos] !== ",") throw new Error("WIRE_JSON");
        pos++;
      }
      throw new Error("WIRE_JSON");
    }
    if (c === "t" && text.slice(pos, pos + 4) === "true") { pos += 4; return true; }
    if (c === "f" && text.slice(pos, pos + 5) === "false") { pos += 5; return false; }
    if (c === "n" && text.slice(pos, pos + 4) === "null") { pos += 4; return null; }
    const numMatch = text.slice(pos).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numMatch) {
      const s = numMatch[0];
      pos += s.length;
      const num = Number(s);
      if (!Number.isFinite(num) || Math.abs(num) >= 9007199254740992) throw new Error("WIRE_NUMBER");
      return num;
    }
    throw new Error("WIRE_JSON");
  };

  const res = scanVal(0);
  skip();
  if (pos !== text.length) throw new Error("WIRE_JSON");
  return res;
}

function shape(v, s, p = "wire") {
  if (s.anyOf) {
    for (const q of s.anyOf) {
      try { shape(v, q, p); return; } catch {}
    }
    throw new Error("WIRE_UNION:" + p);
  }
  const t = s.type;
  if (t === "json") return;
  if (t === "null") {
    if (v !== null) throw new Error("WIRE_NULL:" + p);
  } else if (t === "boolean") {
    if (typeof v !== "boolean") throw new Error("WIRE_BOOLEAN:" + p);
  } else if (t === "number") {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("WIRE_NUMBER:" + p);
  } else if (t === "integer") {
    if (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) >= 9007199254740992) throw new Error("WIRE_INTEGER:" + p);
  } else if (t === "string") {
    if (typeof v !== "string" || v.length > 200000) throw new Error("WIRE_STRING:" + p);
  } else if (t === "array") {
    if (!Array.isArray(v) || v.length > (s.maxItems || 4096)) throw new Error("WIRE_ARRAY:" + p);
    for (let i = 0; i < v.length; i++) shape(v[i], s.items, p + "." + i);
  } else if (t === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("WIRE_FIELDS:" + p);
    const props = s.properties || {};
    const keys = Object.keys(v);
    const propKeys = Object.keys(props);
    if (keys.length !== propKeys.length || !keys.every(k => Object.hasOwn(props, k))) {
      throw new Error("WIRE_FIELDS:" + p);
    }
    for (const k of keys) shape(v[k], props[k], p + "." + k);
  } else {
    throw new Error("WIRE_SCHEMA:" + p);
  }
}

export function parseErrorObservation(bytes) {
  const o = parseJsonStrict(bytes);
  shape(o, getSchema());
  if (o.schema !== "shiftmgmt-errors-observation-v2" || o.case !== "errors" || o.mode !== "canonical-errors-v1") {
    throw new Error("WIRE_MODE");
  }
  return o;
}

function validatePlainObservation(val) {
  const seen = new Set();
  function walk(v) {
    if (v === null || typeof v !== "object") {
      if (typeof v === "number" && !Number.isFinite(v)) throw new Error("CANONICAL_INPUT");
      if (typeof v === "function") throw new Error("CANONICAL_INPUT");
      return;
    }
    if (util.types.isProxy(v)) throw new Error("CANONICAL_INPUT");
    const proto = Object.getPrototypeOf(v);
    if (Array.isArray(v)) {
      if (proto !== Array.prototype) throw new Error("CANONICAL_INPUT");
    } else {
      if (proto !== Object.prototype && proto !== null) throw new Error("CANONICAL_INPUT");
    }
    if (Object.getOwnPropertySymbols(v).length > 0) throw new Error("CANONICAL_INPUT");
    if (seen.has(v)) throw new Error("CANONICAL_INPUT");
    seen.add(v);
    const descs = Object.getOwnPropertyDescriptors(v);
    for (const k of Object.keys(descs)) {
      const d = descs[k];
      if (d.get || d.set) throw new Error("CANONICAL_INPUT");
      if (!Array.isArray(v) && !d.enumerable) throw new Error("CANONICAL_INPUT");
      walk(d.value);
    }
  }
  walk(val);
  if (!val || val.schema !== "shiftmgmt-errors-observation-v2") {
    throw new Error("CANONICAL_INPUT");
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.hasOwn(b, k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// Clock helper functions matching errors-clock.py
function need(cond, msg) {
  if (!cond) throw new Error(msg);
}
function integer(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v < 9007199254740992;
}
function hr(v) {
  need(typeof v === "string" && /^[1-9][0-9]{0,24}$/.test(v), "CLOCK_HR_STRING");
  return BigInt(v);
}
function browserCheck(v, origin) {
  need(integer(v.atMs) && typeof v.perfMs === "number" && Number.isFinite(v.perfMs) && v.perfMs >= 0 && typeof v.timeOriginMs === "number" && v.timeOriginMs === origin, "CLOCK_BROWSER_DOMAIN");
}
function span(v, start, end) {
  const a = v[start + "AtMs"], b = v[end + "AtMs"];
  const ha = hr(v[start + "HrNs"]), hb = hr(v[end + "HrNs"]);
  need(integer(a) && integer(b) && a <= b && ha <= hb, "CLOCK_NODE_SPAN");
  return [ha, hb];
}
function snapshot(v, origin) {
  browserCheck(v, origin);
  return span(v, "nodeStarted", "nodeRead");
}
function hold(h) {
  const hs = hr(h.startedHrNs), release = hr(h.releasedHrNs), cont = hr(h.continuedHrNs);
  need(["startedAtMs", "releasedAtMs", "continuedAtMs"].every(k => integer(h[k])) && h.startedAtMs <= h.releasedAtMs && h.releasedAtMs <= h.continuedAtMs && hs <= release && release <= cont, "CLOCK_HOLD_LIFETIME");
  return [hs, release, cont];
}
function heldSnapshot(s, h, origin) {
  const [start, end] = snapshot(s, origin);
  const [hs, release] = hold(h);
  need(hs <= start && start <= end && end < release, "CLOCK_SNAPSHOT_INSIDE_HOLD");
  return true;
}
function callCheck(c, origin) {
  browserCheck(c, origin);
  need(integer(c.settledAtMs) && typeof c.settledPerfMs === "number" && Number.isFinite(c.settledPerfMs) && c.perfMs <= c.settledPerfMs, "CLOCK_BROWSER_SETTLEMENT");
  return span(c, "nodeBegin", "nodeSettled");
}
function pairCheck(ids, requestId, phase, calls, origin) {
  need(Array.isArray(ids) && ids.length === 2 && new Set(ids).size === 2, "CLOCK_OLD_CALL_IDS");
  const indexed = new Map(calls.map(c => [c.id, c]));
  const selected = ids.map(x => indexed.get(x));
  need(selected.every(Boolean), "CLOCK_OLD_CALL_PAIR");
  need(new Set(selected.map(c => c.method)).size === 2 && new Set(selected.map(c => c.method)).has("listAccessLogs") && new Set(selected.map(c => c.method)).has("listOperationUsers") && selected.every(c => c.phase === phase && c.settledStatus === "fulfilled"), "CLOCK_OLD_CALL_PAIR");
  need(selected.find(c => c.method === "listAccessLogs").requestId === requestId, "CLOCK_OLD_LIST_BINDING");
  for (const c of selected) callCheck(c, origin);
  return selected;
}
function invalidCheck(g, calls, origin) {
  browserCheck(g.input, origin);
  span(g.input, "nodeStarted", "nodeRead");
  heldSnapshot(g.during, g.hold, origin);
  snapshot(g.after, origin);
  const selected = pairCheck(g.oldCallIds, g.hold.requestId, "invalid-during-held", calls, origin);
  need(selected.every(c => c.perfMs <= g.input.perfMs && hr(c.nodeSettledHrNs) <= hr(g.after.nodeStartedHrNs) && c.settledPerfMs <= g.after.perfMs), "CLOCK_INVALID_OLD_PAIR_SETTLED");
  return true;
}
function generationCheck(g, calls, origin) {
  const inp = g.input;
  browserCheck(inp, origin);
  span(inp, "nodeStarted", "nodeRead");
  need(inp.field === "filter-keyword-input", "CLOCK_GENERATION_INPUT");
  const selected = pairCheck(g.oldCallIds, g.oldHold.requestId, "generation-" + g.variant + "-old", calls, origin);
  const oldList = selected.find(c => c.method === "listAccessLogs");
  const [hs, release] = hold(g.oldHold);
  const [ns] = hold(g.newHold);
  need(g.oldHold.requestId !== g.newHold.requestId && hs <= hr(inp.nodeStartedHrNs) && hr(inp.nodeStartedHrNs) <= hr(inp.nodeReadHrNs) && hr(inp.nodeReadHrNs) <= release, "CLOCK_INPUT_BEFORE_OLD_RELEASE");
  const newCall = calls.find(c => c.requestId === g.newHold.requestId);
  need(newCall, "CLOCK_GENERATION_CALL_PHASES");
  callCheck(newCall, origin);
  need(newCall.method === "listAccessLogs" && newCall.phase === "generation-" + g.variant + "-new" && selected.every(c => c.perfMs <= inp.perfMs) && inp.perfMs <= newCall.perfMs, "CLOCK_GENERATION_CALL_PHASES");
  heldSnapshot(g.newBusy, g.newHold, origin);
  heldSnapshot(g.afterOld, g.newHold, origin);
  need(selected.every(c => hr(c.nodeSettledHrNs) <= hr(g.afterOld.nodeStartedHrNs) && c.settledPerfMs <= g.afterOld.perfMs), "CLOCK_ALL_OLD_SETTLED_BEFORE_DOM");
  if (g.variant === "before250") {
    const before = g.beforeNew;
    need(before !== null && before !== undefined, "CLOCK_BEFORE250_SNAPSHOT");
    snapshot(before, origin);
    need(inp.perfMs <= oldList.settledPerfMs && oldList.settledPerfMs <= before.perfMs && before.perfMs < inp.perfMs + 250 && selected.every(c => c.settledPerfMs <= before.perfMs && hr(c.nodeSettledHrNs) <= hr(before.nodeStartedHrNs)) && hr(before.nodeReadHrNs) < ns && release < ns, "CLOCK_BEFORE250_CAUSAL_BRANCH");
  } else if (g.variant === "afterNewHeld") {
    need(ns <= release, "CLOCK_AFTER_NEW_HELD_BRANCH");
  } else {
    throw new Error("CLOCK_VARIANT");
  }
  return true;
}

const DEPENDENCIES = {
  1: ["database"],
  2: ["network"],
  3: ["logsRetry"],
  4: ["usersFailure"],
  5: ["usersRetry", "usersFailure"],
  6: ["invalid"],
  7: ["generations"],
  8: ["network", "fonts", "cleanup"]
};

export function evaluateErrors(observation) {
  validatePlainObservation(observation);
  const d = observation;
  const o = d.observations;
  const requests = new Map(d.requests.map(r => [r.id, r]));
  const disabled = b => b && b.count === 1 && b.connected && b.disabled === true;
  const origin = d.clock?.browserTimeOriginMs;

  const rows = [];
  for (let i = 1; i <= 8; i++) {
    const id = IDS[i - 1];
    const missing = DEPENDENCIES[i].some(k => o[k] === null || o[k] === undefined) || (i === 7 && (!o.generations || o.generations.length === 0));
    if (missing) {
      rows.push({ id, status: "MISSING" });
      continue;
    }
    let condition = false;
    try {
      if (i === 1) {
        const db = o.database;
        const s = db.snapshot;
        const q = d.requests.filter(x => x.phase === "database-failure" && x.path === "/api/access-logs:list");
        condition = deepEqual(db.payload, { ok: false, errorCode: "DATABASE_ERROR", message: '데이터베이스 연결 실패 <img src=x onerror="window.__u5Xss=(window.__u5Xss||0)+1">' }) &&
          q.length === 1 && q[0].status === 200 && deepEqual(q[0].body, db.payload) &&
          s.alerts.length === 1 && s.alerts[0].role === "alert" && s.alerts[0].text.includes(db.payload.message) &&
          s.retryLogs.count === 1 && s.g2 === 0 && s.xssCounter === 0 && s.injectedImages === 0;
      } else if (i === 2) {
        const n = o.network;
        const s = n.snapshot;
        const q = requests.get(n.requestId);
        const aborts = d.routeJournal.filter(e => e.kind === "abort");
        const failed = d.errors.filter(e => e.type === "requestfailed");
        const call = d.ledger.calls.find(c => c.requestId === n.requestId);
        condition = call && call.settledStatus === "fulfilled" && deepEqual(call.settledResult, { ok: false, errorCode: "NETWORK_ERROR", message: "서버에 연결할 수 없습니다. 프로그램이 켜져 있는지 확인하세요." }) &&
          aborts.length === 1 && failed.length === 1 && aborts[0].requestId === n.requestId && failed[0].requestId === n.requestId &&
          q && q.method === "POST" && q.path === "/api/access-logs:list" && q.phase === "network-terminal" && q.failureText === "net::ERR_ABORTED" && q.failedAtMs !== null && q.failedAtMs !== undefined &&
          s.alerts.length === 1 && s.retryLogs.count === 1 && s.g2 === 0;
      } else if (i === 3) {
        const r = o.logsRetry;
        const h = r.hold;
        const du = r.duplicates;
        const q = requests.get(h.requestId);
        const increment = du.before.list === r.before.list + 1 && du.before.users === r.before.users + 1 && deepEqual(d.requests.filter(x => x.source === "page" && x.path === "/api/access-logs:list" && r.before.lastRequestId < x.id && x.id <= du.before.lastRequestId).map(x => x.id), [h.requestId]);
        condition = increment && disabled(r.busy.retryLogs) && r.busy.loading === 1 && du.buttonExisted &&
          du.before.list === du.after.list && du.before.users === du.after.users &&
          heldSnapshot(r.busy, h, origin) && h.releasedAtMs <= h.continuedAtMs && (q ? h.continuedAtMs <= q.finishedAtMs : true) &&
          r.after.retryLogs.count === 1 && r.after.retryLogs.disabled === false &&
          du.actions && du.actions.length === 4 && new Set(du.actions.map(a => a.mode)).size === 4 &&
          ["mouse1", "mouse2", "element-click", "dispatch-click"].every(m => du.actions.some(a => a.mode === m)) &&
          du.actions.every(a => a.connected && a.disabled && a.listBefore === a.listAfter && a.usersBefore === a.usersAfter);
      } else if (i === 4) {
        const u = o.usersFailure;
        const s = u.snapshot;
        const l = requests.get(u.listRequestId);
        const v = requests.get(u.usersRequestId);
        const expected = (l?.body?.data?.slice(0, 200) || []).map(row => "log-row-" + row.id);
        condition = l?.ok === true && v?.ok === false && l.phase === "users-independent-failure" && v.phase === "users-independent-failure" &&
          s.warnings.length === 1 && s.warnings[0].role === "status" && (!s.alerts || s.alerts.length === 0) &&
          s.table === 1 && deepEqual(s.rows, expected) &&
          s.loginId === u.expectedLoginId && u.expectedLoginId === o.selected.loginId &&
          u.expectedLoginId !== "all" && o.initial.userOptions.some(opt => opt.value === u.expectedLoginId) &&
          l.args?.[0]?.loginId === u.expectedLoginId;
      } else if (i === 5) {
        const u = o.usersRetry;
        const du = u.duplicates;
        const s = u.busy;
        const ph = d.requests.filter(q => q.phase === "users-retry-held");
        const lists = ph.filter(q => q.path === "/api/access-logs:list");
        const users = ph.filter(q => q.path === "/api/operations:list-users");
        if (du.before.list === u.before.list + 1 && du.before.users === u.before.users + 1) {
          condition = disabled(s.retryUsers) && s.loading === 1 &&
            lists.length === 1 && users.length === 1 && lists[0].id === u.listHold.requestId && users[0].id === u.usersHold.requestId &&
            du.buttonExisted && du.before.list === du.after.list && du.before.users === du.after.users &&
            du.actions && du.actions.length === 4 && new Set(du.actions.map(a => a.mode)).size === 4 &&
            ["mouse1", "mouse2", "element-click", "dispatch-click"].every(m => du.actions.some(a => a.mode === m)) &&
            du.actions.every(a => a.connected && a.disabled && a.listBefore === a.listAfter && a.usersBefore === a.usersAfter) &&
            (!u.after.warnings || u.after.warnings.length === 0) && u.after.loginId === o.usersFailure.expectedLoginId &&
            u.after.loginId === o.selected.loginId && lists[0].args?.[0]?.loginId === o.selected.loginId;
        }
      } else if (i === 6) {
        const v = o.invalid;
        const s = v.during;
        const a = v.after;
        condition = invalidCheck(v, d.ledger.calls, origin) &&
          s.loading === 0 && a.loading === 0 && s.table === 0 && a.table === 0 &&
          (!s.rows || s.rows.length === 0) && (!a.rows || a.rows.length === 0) &&
          Boolean(s.dateError) && Boolean(a.dateError) && s.g2 === 0 && a.g2 === 0 &&
          v.before.list === v.afterCounts.list && v.before.users === v.afterCounts.users;
      } else if (i === 7) {
        const generations = o.generations;
        const checks = generations.map(g => {
          const h = g.oldHold;
          const newH = g.newHold;
          const after = g.afterOld;
          const busy = g.newBusy;
          const before = g.beforeNew;
          let ok = generationCheck(g, d.ledger.calls, origin) &&
            busy.loading === 1 && after.loading === 1 &&
            disabled(busy.refresh) && disabled(after.refresh) && disabled(after.reset) && (!after.rows || after.rows.length === 0);
          if (g.variant === "before250") {
            ok = ok && before !== null && before !== undefined && before.loading === 1 && (!before.rows || before.rows.length === 0);
          }
          return ok;
        });
        condition = generations.length === 2 && new Set(generations.map(g => g.variant)).size === 2 &&
          new Set(generations.map(g => g.variant)).has("before250") && new Set(generations.map(g => g.variant)).has("afterNewHeld") &&
          checks.every(Boolean);
      } else if (i === 8) {
        const failed = d.errors.filter(e => e.type === "requestfailed");
        const expectedFailure = failed.length === 1 ? failed[0] : null;
        condition = expectedFailure !== null && d.errors.length === 1 && d.errors[0] === expectedFailure &&
          (!o.cleanup.errors || o.cleanup.errors.length === 0) &&
          d.lifecycle.contextClosed === true && d.lifecycle.browserClosed === true &&
          o.fonts.status === "loaded" &&
          d.capture && typeof d.capture === "object" && d.capture.bytes > 0;
      }
    } catch {
      condition = false;
    }
    rows.push({ id, status: condition ? "MET" : "FAILED" });
  }

  const failed = rows.filter(r => r.status === "FAILED").map(r => r.id);
  const missing = rows.filter(r => r.status === "MISSING").map(r => r.id);
  const overall = failed.length > 0 ? "FAILED" : missing.length > 0 ? "INCOMPLETE" : "COMPLETE";

  return {
    status: overall,
    scope: "SEMANTIC_ONLY_NOT_PRODUCTION_ADMISSION",
    rules: rows,
    missing,
    failed,
    canonicalAccepted: 0,
    productionAdmitted: false
  };
}
