import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";

const SCHEMA_PATH = "C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u6-stale\\stale-wire-schema.json";
let cachedSchema = null;
function getSchema() {
  if (!cachedSchema) {
    cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  }
  return cachedSchema;
}

const VARIANTS = [
  "before250-success", "before250-error", "before250-auth",
  "afterNew-success", "afterNew-error", "afterNew-auth",
  "old-finally-new-held", "manual-refresh",
  "destroy-home-success", "destroy-home-error", "destroy-home-auth",
  "destroy-placeholder-success", "destroy-placeholder-error", "destroy-placeholder-auth",
  "destroy-logout-success", "destroy-logout-error", "destroy-logout-auth",
  "current-generation-auth"
];

function need(v, c) {
  if (!v) throw new Error(c);
}

function assertPureInput(v,depth=0){
 need(depth<=64,"STALE_DEPTH");
 if(v===null||typeof v==="string"||typeof v==="boolean")return;
 if(typeof v==="number"){need(Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER,"STALE_NUMBER");return;}
 need(typeof v==="object"&&!util.types.isProxy(v),"STALE_PURE_JSON");
 const proto=Object.getPrototypeOf(v);need(proto===(Array.isArray(v)?Array.prototype:Object.prototype)&&Object.getOwnPropertySymbols(v).length===0,"STALE_CUSTOM_PROTO");
 for(const d of Object.values(Object.getOwnPropertyDescriptors(v))){need(Object.hasOwn(d,"value"),"STALE_ACCESSOR");assertPureInput(d.value,depth+1);}
}
function parseJsonStrict(bytes){
 need(bytes&&typeof bytes==="object"&&!util.types.isProxy(bytes)&&util.types.isUint8Array(bytes),"STALE_JSON_BYTES");
 need([Buffer.prototype,Uint8Array.prototype].includes(Object.getPrototypeOf(bytes))&&Object.getOwnPropertySymbols(bytes).length===0,"STALE_JSON_BYTES");
 need(!["length","byteLength","byteOffset","buffer","constructor","valueOf","toJSON","toString"].some(k=>Object.hasOwn(bytes,k)),"STALE_JSON_BYTES");
 need(bytes.byteLength<=8388608,"STALE_JSON_BYTES");for(const k of Object.getOwnPropertyNames(bytes))need(/^(0|[1-9][0-9]*)$/.test(k),"STALE_JSON_BYTES");
 let text;try{text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error("STALE_INVALID_UTF8");}
 need(text.charCodeAt(0)!==65279,"STALE_JSON_BYTES");
 // Recognize object keys separately from array values; decode every JSON escape.
 let i=0;const ws=()=>{while(/[ \t\r\n]/.test(text[i]||"!")&&i<text.length)i++;};
 const string=()=>{const start=i++;while(i<text.length){const c=text[i++];if(c==='"')return JSON.parse(text.slice(start,i));if(c==='\\')i++;}throw Error("STALE_PURE_JSON");};
 const value=depth=>{need(depth<=64,"STALE_DEPTH");ws();const c=text[i];
  if(c==='{'){i++;ws();const seen=new Set();if(text[i]==='}'){i++;return;}while(i<text.length){need(text[i]==='"',"STALE_PURE_JSON");const k=string();need(!seen.has(k),"STALE_DUPLICATE_KEY");seen.add(k);ws();need(text[i++]===':',"STALE_PURE_JSON");value(depth+1);ws();if(text[i]==='}'){i++;return;}need(text[i++]===',',"STALE_PURE_JSON");ws();}throw Error("STALE_PURE_JSON");}
  if(c==='['){i++;ws();if(text[i]===']'){i++;return;}while(i<text.length){value(depth+1);ws();if(text[i]===']'){i++;return;}need(text[i++]===',',"STALE_PURE_JSON");}throw Error("STALE_PURE_JSON");}
  if(c==='"'){string();return;}const start=i;while(i<text.length&&!/[\s,}\]]/.test(text[i]))i++;need(i>start,"STALE_PURE_JSON");JSON.parse(text.slice(start,i));
 };value(0);ws();need(i===text.length,"STALE_PURE_JSON");const v=JSON.parse(text);assertPureInput(v);return v;
}

function validateSchema(v, s, root) {
  if (s.$ref) {
    const refKey = s.$ref.split("/").pop();
    return validateSchema(v, root.$defs[refKey], root);
  }
  if (s.anyOf) {
    for (const alt of s.anyOf) {
      try {
        validateSchema(v, alt, root);
        return;
      } catch {}
    }
    throw new Error("STALE_SCHEMA_UNION");
  }
  if (s.const !== undefined) {
    need(typeof v === typeof s.const && v === s.const, "STALE_CONST");
  }
  if (s.enum) {
    need(s.enum.includes(v), "STALE_ENUM");
  }
  const t = s.type;
  if (t === "number") {
    need(typeof v === "number" && Number.isFinite(v), "STALE_SCHEMA_TYPE");
  } else if (t === "integer") {
    need(Number.isInteger(v), "STALE_SCHEMA_TYPE");
  } else if (t === "object") {
    need(v !== null && typeof v === "object" && !Array.isArray(v), "STALE_SCHEMA_TYPE");
    if (s.required) {
      for (const req of s.required) need(Object.hasOwn(v, req), "STALE_REQUIRED");
    }
    if (s.additionalProperties === false) {
      const allowed = new Set(Object.keys(s.properties || {}));
      for (const k of Object.keys(v)) need(allowed.has(k), "STALE_UNKNOWN_FIELD");
    }
    if (s.properties) {
      for (const [k, val] of Object.entries(v)) {
        if (s.properties[k]) validateSchema(val, s.properties[k], root);
      }
    }
  } else if (t === "array") {
    need(Array.isArray(v), "STALE_SCHEMA_TYPE");
    if (s.minItems !== undefined) need(v.length >= s.minItems, "STALE_ARRAY_SIZE");
    if (s.maxItems !== undefined) need(v.length <= s.maxItems, "STALE_ARRAY_SIZE");
    if (s.items) {
      for (const item of v) validateSchema(item, s.items, root);
    }
  } else if (t === "string") {
    need(typeof v === "string", "STALE_SCHEMA_TYPE");
    if (s.maxLength !== undefined) need(v.length <= s.maxLength, "STALE_STRING_SIZE");
    if (s.pattern) need(new RegExp("^" + s.pattern + "$").test(v), "STALE_PATTERN");
  } else if (t === "boolean") {
    need(typeof v === "boolean", "STALE_SCHEMA_TYPE");
  } else if (t === "null") {
    need(v === null, "STALE_SCHEMA_TYPE");
  }
}

export function parseStaleObservation(bytes) {
  const d = parseJsonStrict(bytes);
  const schema = getSchema();
  validateSchema(d, schema, schema);
  need(Array.isArray(d.scenarios), "STALE_SCENARIOS_ARRAY");
  const actualOrder = d.scenarios.map(x => x.name);
  need(actualOrder.length === VARIANTS.length && actualOrder.every((name, i) => name === VARIANTS[i]), "STALE_VARIANT_EXACT_ORDER");
  return d;
}

function hr(p) {
  return BigInt(p.hrNs);
}

export function evaluateStale(o) {
  assertPureInput(o);
  need(o && typeof o === "object", "INVALID_OBSERVATION");
  const s = Object.fromEntries(o.scenarios.map(x => [x.name, x]));
  const q = Object.fromEntries(o.requests.map(x => [x.id, x]));
  const g = Object.fromEntries(o.generations.map(x => [x.id, x]));
  const h = Object.fromEntries(o.holds.map(x => [x.requestId, x]));
  const calls = Object.fromEntries(o.calls.map(x => [x.id, x]));

  function request(c, old = false) {
    const gid = old ? c.oldGenerationId : c.newGenerationId;
    return q[g[gid].listRequestId];
  }

  function rows(c) {
    return request(c).body.data.map(x => "log-row-" + x.id);
  }

  function point(snap) {
    return snap.clock.nodeRead;
  }

  function before(outcome) {
    const c = s["before250-" + outcome];
    const old = request(c, true);
    const newReq = request(c);
    const hold = h[old.id];
    const a = c.after;
    const b = c.before;
    const newg = g[c.newGenerationId];
    const call = calls[newg.callIds[0]];
    const code = { success: null, error: "U6_STALE_FAILURE", auth: "AUTH_SESSION_REQUIRED" }[outcome];

    const relDiff = hr(hold.release) - hr(c.inputStarted);
    return (
      relDiff > 0n &&
      relDiff < 250000000n &&
      hr(hold.release) < hr(call.nodeBegin) &&
      old.errorCode === code &&
      !a.rowIds.length &&
      !a.alerts.length &&
      !a.loginCount &&
      a.callbackCount === b.callbackCount &&
      JSON.stringify(c.final.rowIds) === JSON.stringify(rows(c)) &&
      newReq.body.ok === true
    );
  }

  function afterNew() {
    for (const outcome of ["success", "error", "auth"]) {
      const c = s["afterNew-" + outcome];
      const targetRows = JSON.stringify(rows(c));
      const oldReq = request(c, true);
      const hold = h[oldReq.id];
      if (
        JSON.stringify(c.before.rowIds) !== targetRows ||
        JSON.stringify(c.after.rowIds) !== targetRows ||
        c.after.alerts.length ||
        c.after.loginCount ||
        c.after.callbackCount !== c.before.callbackCount ||
        hr(point(c.before)) >= hr(hold.release)
      ) {
        return false;
      }
    }
    return true;
  }

  function locked() {
    const c = s["old-finally-new-held"];
    const oldHold = h[request(c, true).id];
    const newHold = h[request(c).id];
    const a = c.after;
    return (
      a.refreshDisabled === true &&
      a.resetDisabled === true &&
      a.loadingCount === 1 &&
      hr(newHold.start) < hr(oldHold.release) &&
      hr(oldHold.release) <= hr(oldHold.complete) &&
      hr(oldHold.complete) <= hr(point(a)) &&
      hr(point(a)) < hr(newHold.release)
    );
  }

  function manual() {
    const c = s["manual-refresh"];
    const a = c.after;
    const query = a.query || {};
    const args = Object.fromEntries(
      Object.entries(query)
        .filter(([k, v]) => typeof v === "string" && v.trim() && (!["loginId", "actionType"].includes(k) || v !== "all"))
        .map(([k, v]) => [k, v.trim()])
    );
    const actualArgs = request(c).args[0] || {};
    return (
      JSON.stringify(actualArgs) === JSON.stringify(args) &&
      c.listCountAfter - c.listCountBefore === 1 &&
      hr(c.countWindowEnd) - hr(c.inputStarted) >= 250000000n &&
      a.debouncePending === false &&
      JSON.stringify(a.rowIds) === JSON.stringify(rows(c))
    );
  }

  function destroy(target) {
    for (const outcome of ["success", "error", "auth"]) {
      const c = s["destroy-" + target + "-" + outcome];
      const a = c.after;
      const b = c.before;
      const hold = h[request(c, true).id];
      if (
        !(
          c.navigationTarget === target &&
          Boolean(c.navigationLabel) &&
          a.screenCount === 0 &&
          a.callbackCount === b.callbackCount &&
          c.listCountBefore === c.listCountAfter &&
          a.destroyed === true &&
          a.debouncePending === false &&
          a.loginCount === (target === "logout" ? 1 : 0) &&
          hr(point(b)) < hr(hold.release) &&
          hr(c.countWindowEnd) - hr(point(b)) >= 250000000n
        )
      ) {
        return false;
      }
    }
    return true;
  }

  function auth() {
    const c = s["current-generation-auth"];
    const a = c.after;
    const b = c.before;
    const generation = g[c.newGenerationId];
    const ev = o.callbackProbe.events;
    return (
      ev.length === 1 &&
      a.callbackCount - b.callbackCount === 1 &&
      a.loginCount === 1 &&
      a.screenCount === 0 &&
      request(c).errorCode === "AUTH_SESSION_REQUIRED" &&
      ev[0].instanceId === generation.instanceId &&
      ev[0].generation === generation.generation &&
      ev[0].destroyed === false &&
      !ev[0].threw
    );
  }

  function lifecycle() {
    const end = hr(o.cleanup.beforeUnroute);
    const holdList = Object.values(h);
    if (holdList.length !== 17 || o.holds.length !== 17) return false;
    for (const x of holdList) {
      if (
        x.startedCount !== 1 ||
        x.releasedCount !== 1 ||
        x.completedCount !== 1 ||
        x.timedOut ||
        !(hr(x.start) < hr(x.release) && hr(x.release) <= hr(x.complete) && hr(x.complete) < end) ||
        hr(x.complete) - hr(x.start) > 6000000000n
      ) {
        return false;
      }
    }
    for (const c of Object.values(calls)) {
      if (c.settledStatus !== "fulfilled" || c.nodeSettled === null || hr(c.nodeSettled) >= end) {
        return false;
      }
    }
    return true;
  }

  function clean() {
    const c = o.cleanup;
    const p = o.callbackProbe;
    return (
      !c.errors.length &&
      c.pendingHolds === 0 &&
      c.bridgeRestored === true &&
      c.fetchRestored === true &&
      c.contextClosed === true &&
      c.browserClosed === true &&
      hr(c.beforeUnroute) <= hr(c.afterUnroute) &&
      p.disposedWithOwnedContext === true &&
      o.capture.bytes > 0
    );
  }

  const tests = [
    () => before("success"),
    () => before("error"),
    () => before("auth"),
    afterNew,
    locked,
    manual,
    () => destroy("home"),
    () => destroy("placeholder"),
    () => destroy("logout"),
    auth,
    lifecycle,
    clean
  ];

  const rules = [];
  for (let i = 0; i < tests.length; i++) {
    const id = "STALE-" + String(i + 1).padStart(2, "0");
    let status;
    try {
      status = tests[i]() ? "MET" : "FAILED";
    } catch {
      status = "MISSING";
    }
    rules.push({ id, status });
  }

  const failed = rules.filter(r => r.status === "FAILED").map(r => r.id);
  const missing = rules.filter(r => r.status === "MISSING").map(r => r.id);

  return {
    scope: "SEMANTIC_ONLY_NOT_PRODUCTION_ADMISSION",
    status: failed.length ? "FAILED" : missing.length ? "INCOMPLETE" : "COMPLETE",
    rules,
    failed,
    missing,
    canonicalAccepted: 0,
    productionAdmitted: false
  };
}

export function ownerTerminal(caseName, status) {
  assertPureInput(caseName);
  assertPureInput(status);
  if (caseName === "errors") {
    if (status === "COMPLETE") return ["ERRORS_ORIGINAL8_ONLY", "ERRORS_ORIGINAL8_MET"];
    if (status === "FAILED") return ["ERRORS_FAILURE_EVIDENCE_ONLY", "ERRORS_ORIGINAL8_FAILED"];
    if (status === "INCOMPLETE") return ["ERRORS_INCOMPLETE_EVIDENCE_ONLY", "A2_COVERAGE_INCOMPLETE"];
  }
  if (caseName === "stale-response") {
    if (status === "COMPLETE") return ["STALE_ORIGINAL12_ONLY", "STALE_ORIGINAL12_MET"];
    if (status === "FAILED") return ["STALE_FAILURE_EVIDENCE_ONLY", "STALE_ORIGINAL12_FAILED"];
    if (status === "INCOMPLETE") return ["STALE_INCOMPLETE_EVIDENCE_ONLY", "A2_COVERAGE_INCOMPLETE"];
  }
  throw new Error("UNKNOWN_CASE_OR_STATUS");
}
