import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import { types } from "node:util";

export const G1_CONTRACT_SHA256 = "014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE";
export const G1_EXECUTION_SHA256 = "41AF3F6966D4D067F7A8788A8ABC9C3A3897E7BD0DD0657AA768C149D2A5F2F2";
export const RAW_KEYS = Object.freeze([
  "schema", "case", "runId", "contractSha256", "executionSha256", "contextSha256",
  "workerPid", "phase", "steps", "environment", "auth", "requests", "rawErrors",
  "expectedErrors", "diagnostics", "resources", "captures", "runner", "errors"
]);
const KNOWN_METHODS = new Set(["setPhase", "nextRequestId", "recordAuth", "fetch", "updatePartial"]);

const CONTEXT_DESCRIPTOR_FIELDS = Object.freeze(Object.assign(Object.create(null), {
  runDir: "context.runDir",
  contractSha256: "context.contractSha256",
  executionSha256: "context.executionSha256"
}));

const EXECUTION_DESCRIPTOR_FIELDS = Object.freeze(Object.assign(Object.create(null), {
  normalCaptures: "caller.normalCaptures"
}));

const CONTRACT_DESCRIPTOR_FIELDS = Object.freeze(Object.assign(Object.create(null), {
  evidenceSchema: "caller.evidenceSchema"
}));

export function rejectG1(field, message = "A2_G1_REJECTED") {
  const error = new Error(message);
  error.code = "A2_G1_REJECTED";
  error.field = field;
  throw error;
}

export function inspectG1Properties(value, field, options = {}) {
  if (types.isProxy(value)) rejectG1(field);
  if (value === null || typeof value !== "object") rejectG1(field);

  const isArr = Array.isArray(value);
  if (options.isArray && !isArr) rejectG1(field);
  if (options.isRecord && isArr) rejectG1(field);

  const proto = Object.getPrototypeOf(value);
  if (isArr) {
    if (proto !== Array.prototype) rejectG1(field);
  } else {
    if (proto !== Object.prototype && proto !== null) rejectG1(field);
  }

  if (Object.getOwnPropertySymbols(value).length > 0) rejectG1(field);

  const oDesc = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  if (oDesc) rejectG1(field);
  const aDesc = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON");
  if (aDesc) rejectG1(field);

  if (isArr) {
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1) rejectG1(field);
    const descLen = Object.getOwnPropertyDescriptor(value, "length");
    if (!descLen || descLen.get || descLen.set || descLen.enumerable) rejectG1(field);
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !d.enumerable || d.get || d.set) rejectG1(field);
    }
  } else {
    const names = Object.getOwnPropertyNames(value);
    names.sort();
    for (const k of names) {
      if (k === "toJSON") rejectG1(field);
      const d = Object.getOwnPropertyDescriptor(value, k);
      if (!d || !d.enumerable || d.get || d.set) {
        let mappedField = field;
        if (options.descriptorFields && Object.hasOwn(options.descriptorFields, k)) {
          const mv = Object.getOwnPropertyDescriptor(options.descriptorFields, k)?.value;
          if (typeof mv === "string" && mv) {
            mappedField = mv;
          }
        }
        rejectG1(mappedField);
      }
    }
    if (options.keys) {
      if (options.allowMethods) {
        for (const k of names) {
          const d = Object.getOwnPropertyDescriptor(value, k);
          const isFn = typeof d.value === "function";
          if (options.keys.includes(k)) {
            if (isFn) rejectG1(field);
          } else if (!options.allowMethods.has(k) || !isFn) {
            rejectG1(field);
          }
        }
        for (const k of options.keys) {
          if (!Object.hasOwn(value, k)) rejectG1(field);
        }
      } else {
        if (names.length !== options.keys.length) rejectG1(field);
        for (const k of names) {
          if (!options.keys.includes(k)) rejectG1(field);
        }
        for (const k of options.keys) {
          if (!Object.hasOwn(value, k)) rejectG1(field);
        }
      }
    }
  }
  return value;
}

export function exactKeys(value, keys, field) {
  inspectG1Properties(value, field, { keys, isRecord: true });
}

export function validateJsonData(value, field, ancestors = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) rejectG1(field);
    return;
  }
  if (types.isProxy(value)) rejectG1(field);
  if (!value || typeof value !== "object" || ancestors.has(value)) rejectG1(field);
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    inspectG1Properties(value, field, { isArray: true });
    for (let i = 0; i < value.length; i++) {
      validateJsonData(value[i], field, next);
    }
    return;
  }
  inspectG1Properties(value, field, { isRecord: true });
  const names = Object.getOwnPropertyNames(value);
  names.sort();
  for (const k of names) {
    validateJsonData(value[k], field, next);
  }
}

function validateCallerContext(context) {
  inspectG1Properties(context, "context", {
    isRecord: true,
    descriptorFields: CONTEXT_DESCRIPTOR_FIELDS
  });

  if (!Object.hasOwn(context, "runDir")) rejectG1("context.runDir");
  const dRun = Object.getOwnPropertyDescriptor(context, "runDir");
  if (typeof dRun.value !== "string" || !path.isAbsolute(dRun.value)) {
    rejectG1("context.runDir");
  }

  if (!Object.hasOwn(context, "contractSha256")) rejectG1("context.contractSha256");
  const dCont = Object.getOwnPropertyDescriptor(context, "contractSha256");
  if (dCont.value !== G1_CONTRACT_SHA256) rejectG1("context.contractSha256");

  if (!Object.hasOwn(context, "executionSha256")) rejectG1("context.executionSha256");
  const dExec = Object.getOwnPropertyDescriptor(context, "executionSha256");
  if (dExec.value !== G1_EXECUTION_SHA256) rejectG1("context.executionSha256");

  validateJsonData(context, "context");
}

function validateCallerExecutionAndCase(container, caseName, isReader) {
  const caseField = isReader ? "caller.caseName" : "raw.case";
  if (typeof caseName !== "string" || !caseName) rejectG1(caseField);

  if (!Object.hasOwn(container, "execution")) rejectG1(caseField);
  const execution = Object.getOwnPropertyDescriptor(container, "execution").value;
  inspectG1Properties(execution, caseField, {
    isRecord: true,
    descriptorFields: isReader ? EXECUTION_DESCRIPTOR_FIELDS : null
  });

  if (!Object.hasOwn(execution, "normalCases")) rejectG1(caseField);
  const dCases = Object.getOwnPropertyDescriptor(execution, "normalCases");
  const normalCases = dCases.value;
  inspectG1Properties(normalCases, caseField, { isArray: true });
  if (normalCases.length === 0) rejectG1(caseField);

  for (let i = 0; i < normalCases.length; i++) {
    const item = Object.getOwnPropertyDescriptor(normalCases, String(i))?.value;
    if (typeof item !== "string" || !item) rejectG1(caseField);
  }

  if (!Array.prototype.includes.call(normalCases, caseName)) {
    rejectG1(caseField);
  }
}

function validateCallerRegistry(container, caseName, isReader) {
  if (!Object.hasOwn(container, "contract")) rejectG1("registry.requiredIds");
  const contract = Object.getOwnPropertyDescriptor(container, "contract").value;
  inspectG1Properties(contract, "registry.requiredIds", {
    isRecord: true,
    descriptorFields: isReader ? CONTRACT_DESCRIPTOR_FIELDS : null
  });

  if (!Object.hasOwn(contract, "fullUi")) rejectG1("registry.requiredIds");
  const fullUi = Object.getOwnPropertyDescriptor(contract, "fullUi").value;
  inspectG1Properties(fullUi, "registry.requiredIds", { isRecord: true });

  if (!Object.hasOwn(fullUi, "rules")) rejectG1("registry.requiredIds");
  const rules = Object.getOwnPropertyDescriptor(fullUi, "rules").value;
  inspectG1Properties(rules, "registry.requiredIds", { isRecord: true });

  if (!Object.hasOwn(rules, caseName)) rejectG1("registry.requiredIds");
  const caseRules = Object.getOwnPropertyDescriptor(rules, caseName);
  const caseRulesVal = caseRules.value;
  inspectG1Properties(caseRulesVal, "registry.requiredIds", { isArray: true });
  if (caseRulesVal.length === 0) rejectG1("registry.requiredIds");

  const requiredIds = [];
  const seenIds = new Set();
  for (let i = 0; i < caseRulesVal.length; i++) {
    const dRule = Object.getOwnPropertyDescriptor(caseRulesVal, String(i));
    const rule = dRule.value;
    inspectG1Properties(rule, "registry.requiredIds", { isRecord: true });
    if (!Object.hasOwn(rule, "id")) rejectG1("registry.requiredIds");
    const idVal = Object.getOwnPropertyDescriptor(rule, "id").value;
    if (typeof idVal !== "string" || !idVal || seenIds.has(idVal)) rejectG1("registry.requiredIds");
    seenIds.add(idVal);
    requiredIds.push(idVal);
  }

  return { requiredIds, contract };
}

function validateReaderMetadata(contract, execution, args) {
  if (Object.hasOwn(contract, "evidenceSchema")) {
    const dSchema = Object.getOwnPropertyDescriptor(contract, "evidenceSchema");
    const sVal = dSchema.value;
    if (sVal !== null && sVal !== "shiftmgmt.verifier.evidence.v1") {
      rejectG1("caller.evidenceSchema");
    }
  }

  const caseName = Object.getOwnPropertyDescriptor(args, "caseName")?.value;
  if (Object.hasOwn(execution, "normalCaptures")) {
    const dCaps = Object.getOwnPropertyDescriptor(execution, "normalCaptures");
    const caps = dCaps.value;
    if (caps !== null) {
      inspectG1Properties(caps, "caller.normalCaptures", { isRecord: true });
      if (Object.hasOwn(caps, caseName)) {
        const dCaseCaps = Object.getOwnPropertyDescriptor(caps, caseName);
        const caseCaps = dCaseCaps.value;
        if (caseCaps !== null) {
          inspectG1Properties(caseCaps, "caller.normalCaptures", { isArray: true });
          for (let i = 0; i < caseCaps.length; i++) {
            const dItem = Object.getOwnPropertyDescriptor(caseCaps, String(i));
            const itemVal = dItem.value;
            if (typeof itemVal !== "string") {
              rejectG1("caller.normalCaptures");
            }
          }
        }
      }
    }
  }

  const workerPid = Object.getOwnPropertyDescriptor(args, "workerPid")?.value;
  if (!Number.isInteger(workerPid) || workerPid <= 0) rejectG1("caller.workerPid");

  const exitCode = Object.getOwnPropertyDescriptor(args, "exitCode")?.value;
  if (exitCode !== 1) rejectG1("caller.exitCode");
}

export function validateNormalCallerInputs(args) {
  if (types.isProxy(args)) rejectG1("caller");
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    rejectG1("caller");
  }
  inspectG1Properties(args, "caller", { isRecord: true });

  const readerVal = Object.getOwnPropertyDescriptor(args, "reader")?.value;
  if (readerVal !== undefined && typeof readerVal !== "boolean") {
    rejectG1("caller.reader");
  }
  const isReader = readerVal === true;

  if (!Object.hasOwn(args, "context")) rejectG1("context");
  const context = Object.getOwnPropertyDescriptor(args, "context").value;
  validateCallerContext(context);

  const caseName = Object.getOwnPropertyDescriptor(args, "caseName")?.value;
  validateCallerExecutionAndCase(args, caseName, isReader);

  const { requiredIds, contract } = validateCallerRegistry(args, caseName, isReader);

  if (isReader) {
    const execution = Object.getOwnPropertyDescriptor(args, "execution").value;
    validateReaderMetadata(contract, execution, args);
  }

  return { requiredIds };
}

export function validateNormalEvidenceState(raw, options = {}) {
  // R0: mode와 무관한 raw root 구조 검사
  if (types.isProxy(raw)) rejectG1("raw");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) rejectG1("raw");
  const protoRaw = Object.getPrototypeOf(raw);
  if (protoRaw !== Object.prototype && protoRaw !== null) rejectG1("raw");
  if (Object.getOwnPropertySymbols(raw).length > 0) rejectG1("raw");

  inspectG1Properties(raw, "raw", { isRecord: true });

  for (const k of RAW_KEYS) {
    if (!Object.hasOwn(raw, k)) rejectG1("raw");
    const d = Object.getOwnPropertyDescriptor(raw, k);
    if (typeof d.value === "function") rejectG1("raw");
  }
  const rawNames = Object.getOwnPropertyNames(raw);
  for (const k of rawNames) {
    if (!RAW_KEYS.includes(k)) {
      if (!KNOWN_METHODS.has(k)) rejectG1("raw");
      const d = Object.getOwnPropertyDescriptor(raw, k);
      if (typeof d.value !== "function") rejectG1("raw");
    }
  }

  // O1: options 구조 및 mode 검사
  if (types.isProxy(options)) rejectG1("caller");
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    rejectG1("caller");
  }
  inspectG1Properties(options, "caller", { isRecord: true });

  let mode = "raw";
  if (Object.hasOwn(options, "mode")) {
    const dMode = Object.getOwnPropertyDescriptor(options, "mode");
    if (dMode.value !== undefined) {
      if (dMode.value !== "raw" && dMode.value !== "publisher") {
        rejectG1("caller.mode");
      }
      mode = dMode.value;
    }
  }

  // R1: 검문된 mode의 root 제한
  if (mode === "raw") {
    if (rawNames.length !== 19) rejectG1("raw");
  }

  // O2: 선택적 expectedPid 자료형 검사
  let expectedPid;
  if (Object.hasOwn(options, "expectedPid")) {
    const dPid = Object.getOwnPropertyDescriptor(options, "expectedPid");
    if (dPid.value !== undefined) {
      if (!Number.isInteger(dPid.value) || dPid.value <= 0) {
        rejectG1("raw.workerPid");
      }
      expectedPid = dPid.value;
    }
  }

  // C: context 검사
  if (!Object.hasOwn(options, "context")) rejectG1("context");
  const context = Object.getOwnPropertyDescriptor(options, "context").value;
  validateCallerContext(context);

  // K/E: execution & raw.case 검사
  validateCallerExecutionAndCase(options, raw.case, false);

  // options.caseName 검사 (G 검사 전에 수행!)
  if (Object.hasOwn(options, "caseName")) {
    const dOptCase = Object.getOwnPropertyDescriptor(options, "caseName");
    if (dOptCase.value !== undefined) {
      if (typeof dOptCase.value !== "string" || !dOptCase.value || raw.case !== dOptCase.value) {
        rejectG1("raw.case");
      }
    }
  }

  // G: registry 검사
  const { requiredIds } = validateCallerRegistry(options, raw.case, false);

  if (expectedPid !== undefined && raw.workerPid !== expectedPid) rejectG1("raw.workerPid");

  if (raw.schema !== "shiftmgmt.normal.raw.v1") rejectG1("raw.schema");
  if (raw.contractSha256 !== G1_CONTRACT_SHA256) rejectG1("raw.contractSha256");
  if (raw.executionSha256 !== G1_EXECUTION_SHA256) rejectG1("raw.executionSha256");
  if (context) {
    const ctxHash = crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex").toUpperCase();
    if (raw.contextSha256 !== ctxHash) rejectG1("raw.contextSha256");
    if (raw.runId !== path.basename(context.runDir)) rejectG1("raw.runId");
  }
  if (!Number.isInteger(raw.workerPid) || raw.workerPid <= 0) {
    rejectG1("raw.workerPid");
  }

  // steps
  exactKeys(raw.steps, ["enteredAtMs", "completedAtMs"], "raw.steps");
  const dEn = Object.getOwnPropertyDescriptor(raw.steps, "enteredAtMs");
  const dCm = Object.getOwnPropertyDescriptor(raw.steps, "completedAtMs");
  if (!dEn || !dEn.enumerable || dEn.get || dEn.set) rejectG1("raw.steps");
  if (!dCm || !dCm.enumerable || dCm.get || dCm.set) rejectG1("raw.steps");
  const en = dEn.value, cm = dCm.value;
  if (typeof en !== "number" || !Number.isFinite(en) || en <= 0) rejectG1("raw.steps.enteredAtMs");
  if (typeof cm !== "number" || !Number.isFinite(cm) || cm < en) rejectG1("raw.steps.completedAtMs");

  // errors
  exactKeys(raw.errors, ["primary", "cleanup", "evidence", "unexpected"], "raw.errors");
  const dPri = Object.getOwnPropertyDescriptor(raw.errors, "primary");
  if (dPri.value !== null) rejectG1("raw.errors.primary");
  for (const k of ["cleanup", "evidence", "unexpected"]) {
    const f = "raw.errors." + k;
    const v = raw.errors[k];
    inspectG1Properties(v, f, { isArray: true });
    if (v.length !== 0) rejectG1(f);
  }

  // resources
  exactKeys(raw.resources, ["context", "browser"], "raw.resources");
  for (const rk of ["context", "browser"]) {
    const resObj = raw.resources[rk], p = "raw.resources." + rk + ".";
    exactKeys(resObj, ["acquiredAtMs", "closeAttemptAtMs", "closedAtMs", "error"], "raw.resources");
    const da = Object.getOwnPropertyDescriptor(resObj, "acquiredAtMs");
    const db = Object.getOwnPropertyDescriptor(resObj, "closeAttemptAtMs");
    const dc = Object.getOwnPropertyDescriptor(resObj, "closedAtMs");
    const de = Object.getOwnPropertyDescriptor(resObj, "error");
    const a = da.value, b = db.value, c = dc.value, err = de.value;
    if (typeof a !== "number" || !Number.isFinite(a) || a <= 0) rejectG1(p + "acquiredAtMs");
    if (typeof b !== "number" || !Number.isFinite(b) || b < a) rejectG1(p + "closeAttemptAtMs");
    if (typeof c !== "number" || !Number.isFinite(c) || c < b) rejectG1(p + "closedAtMs");
    if (err !== null) rejectG1(p + "error");
  }

  // runner
  inspectG1Properties(raw.runner, "raw.runner", { isRecord: true });
  const dRet = Object.getOwnPropertyDescriptor(raw.runner, "returned");
  if (!dRet || dRet.value !== true) rejectG1("raw.runner.returned");
  validateJsonData(raw.runner, "raw.runner");

  // phase
  if (typeof raw.phase !== "string" || !raw.phase) rejectG1("raw.phase");

  // environment
  inspectG1Properties(raw.environment, "raw.environment", { isRecord: true });
  validateJsonData(raw.environment, "raw.environment");

  // auth, captures, expectedErrors
  for (const k of ["auth", "captures", "expectedErrors"]) {
    const f = "raw." + k;
    inspectG1Properties(raw[k], f, { isArray: true });
    validateJsonData(raw[k], f);
  }

  // requests
  inspectG1Properties(raw.requests, "raw.requests", { isArray: true });
  const REQ_KEYS = ["id", "source", "method", "url", "phase", "startedAtMs", "endedAtMs", "status", "ok", "errorCode", "query"];
  for (let i = 0; i < raw.requests.length; i++) {
    const q = raw.requests[i];
    inspectG1Properties(q, "raw.requests", { keys: REQ_KEYS, isRecord: true });
    if (q.id !== i + 1) rejectG1("raw.requests");
    if (typeof q.source !== "string" || typeof q.method !== "string" || typeof q.url !== "string" || typeof q.phase !== "string") {
      rejectG1("raw.requests");
    }
    if (typeof q.startedAtMs !== "number" || !Number.isFinite(q.startedAtMs) || q.startedAtMs <= 0) rejectG1("raw.requests");
    if (typeof q.endedAtMs !== "number" || !Number.isFinite(q.endedAtMs) || q.endedAtMs < q.startedAtMs) rejectG1("raw.requests");
    if (!Number.isInteger(q.status) || q.status < 100 || q.status > 599) rejectG1("raw.requests");
    if (typeof q.ok !== "boolean" && q.ok !== null) rejectG1("raw.requests");
    if (typeof q.errorCode !== "string" && q.errorCode !== null) rejectG1("raw.requests");
    validateJsonData(q.query, "raw.requests");
  }

  // rawErrors
  exactKeys(raw.rawErrors, ["console", "pageerror", "requestfailed", "badResponses"], "raw.rawErrors");
  for (const k of ["pageerror", "requestfailed"]) {
    const f = "raw.rawErrors." + k;
    inspectG1Properties(raw.rawErrors[k], f, { isArray: true });
    if (raw.rawErrors[k].length !== 0) rejectG1(f);
  }
  inspectG1Properties(raw.rawErrors.console, "raw.rawErrors.console", { isArray: true });
  const CONSOLE_KEYS = ["text", "url", "timeMs"];
  for (const e of raw.rawErrors.console) {
    inspectG1Properties(e, "raw.rawErrors.console", { keys: CONSOLE_KEYS, isRecord: true });
    if (typeof e.text !== "string" || typeof e.url !== "string" || typeof e.timeMs !== "number" || !Number.isFinite(e.timeMs) || e.timeMs <= 0) {
      rejectG1("raw.rawErrors.console");
    }
  }
  inspectG1Properties(raw.rawErrors.badResponses, "raw.rawErrors.badResponses", { isArray: true });
  const BAD_KEYS = ["requestId", "status", "url", "method", "errorCode", "timeMs"];
  const reqIds = new Set(raw.requests.map(r => r.id));
  for (const b of raw.rawErrors.badResponses) {
    inspectG1Properties(b, "raw.rawErrors.badResponses", { keys: BAD_KEYS, isRecord: true });
    if (!Number.isInteger(b.requestId) || b.requestId <= 0 || !reqIds.has(b.requestId)) rejectG1("raw.rawErrors.badResponses");
    if (!Number.isInteger(b.status) || b.status < 100 || b.status > 599) rejectG1("raw.rawErrors.badResponses");
    if (typeof b.url !== "string" || typeof b.method !== "string") rejectG1("raw.rawErrors.badResponses");
    if (typeof b.errorCode !== "string" && b.errorCode !== null) rejectG1("raw.rawErrors.badResponses");
    if (typeof b.timeMs !== "number" || !Number.isFinite(b.timeMs) || b.timeMs <= 0) rejectG1("raw.rawErrors.badResponses");
  }

  // diagnostics
  inspectG1Properties(raw.diagnostics, "raw.diagnostics", { isArray: true });
  const DIAG_KEYS = ["id", "pointer", "operator", "actual", "expected", "tolerance", "trusted"];
  const seenDiag = new Set();
  for (const d of raw.diagnostics) {
    inspectG1Properties(d, "raw.diagnostics", { keys: DIAG_KEYS, isRecord: true });
    if (typeof d.id !== "string" || !d.id || seenDiag.has(d.id)) rejectG1("raw.diagnostics");
    seenDiag.add(d.id);
    if (d.pointer !== null && (typeof d.pointer !== "string" || !d.pointer.startsWith("/"))) rejectG1("raw.diagnostics");
    if (d.trusted !== false) rejectG1("raw.diagnostics");
    validateJsonData(d.actual, "raw.diagnostics");
    validateJsonData(d.expected, "raw.diagnostics");
    if (d.operator === "equal") {
      if (d.tolerance !== null) rejectG1("raw.diagnostics");
      try {
        assert.deepStrictEqual(d.actual, d.expected);
      } catch (error) {
        if (!(error instanceof assert.AssertionError)) throw error;
        rejectG1("raw.diagnostics");
      }
    } else if (d.operator === "near") {
      const { actual: a, expected: e, tolerance: t } = d;
      if (typeof a !== "number" || typeof e !== "number" || typeof t !== "number" || !Number.isFinite(a) || !Number.isFinite(e) || !Number.isFinite(t) || t < 0 || t > 1 || Math.abs(a - e) > t) {
        rejectG1("raw.diagnostics");
      }
    } else {
      rejectG1("raw.diagnostics");
    }
  }

  return { requiredIds, missing: [...requiredIds], extra: raw.diagnostics.map(d => d.id), duplicates: [] };
}
