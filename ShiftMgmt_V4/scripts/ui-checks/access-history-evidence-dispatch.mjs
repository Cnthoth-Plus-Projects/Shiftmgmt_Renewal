import { types } from "node:util";
import * as liveEvidence from "./access-history-live-evidence.mjs";
import * as liveObserver from "./access-history-live-observer.mjs";
import * as listEvidence from "./access-history-list-evidence.mjs";
import * as listObserver from "./access-history-list-observer.mjs";
import * as emptyEvidence from "./access-history-empty-evidence.mjs";
import * as emptyObserver from "./access-history-empty-observer.mjs";
import * as filtersEvidence from "./access-history-filters-evidence.mjs";
import * as filtersObserver from "./access-history-filters-observer.mjs";
import * as errorsEvidence from "./access-history-errors-evidence.mjs";
import * as errorsObserver from "./access-history-errors-observer.mjs";
import * as staleEvidence from "./access-history-stale-evidence.mjs";
import * as staleObserver from "./access-history-stale-observer.mjs";

function own(object, key) {
  if (object === null || typeof object !== "object" || types.isProxy(object)) return undefined;
  try {
    const d = Object.getOwnPropertyDescriptor(object, key);
    return d && Object.hasOwn(d, "value") ? d.value : undefined;
  } catch {
    return undefined;
  }
}

const VALID_MODES = {
  "live-admin": "canonical-live-v1",
  "list-fixture": "canonical-list-v1",
  "empty-fixture": "canonical-empty-v1",
  "filters": "canonical-filters-v1",
  "errors": "canonical-errors-v1",
  "stale-response": "canonical-stale-v1"
};

export function selectEvidenceMode(argv, execution) {
  if (argv === null || typeof argv !== "object" || types.isProxy(argv) || !Array.isArray(argv)) {
    throw new Error("CANONICAL_INPUT");
  }
  const dl = Object.getOwnPropertyDescriptor(argv, "length");
  if (!dl || !Object.hasOwn(dl, "value") || typeof dl.value !== "number") {
    throw new Error("CANONICAL_INPUT");
  }
  const len = dl.value;
  if (len !== 1 && len !== 2) {
    throw new Error("CANONICAL_INPUT");
  }
  const d0 = Object.getOwnPropertyDescriptor(argv, "0");
  if (!d0 || !Object.hasOwn(d0, "value") || typeof d0.value !== "string") {
    throw new Error("CANONICAL_INPUT");
  }
  const a0 = d0.value;
  if (!a0.startsWith("--case=")) {
    throw new Error("CANONICAL_INPUT");
  }
  const caseName = a0.slice("--case=".length);
  const expectedEvidence = Object.hasOwn(VALID_MODES, caseName) ? VALID_MODES[caseName] : undefined;
  if (len === 1 && (expectedEvidence || ["contract-core", "regression-shell", "regression-home", "stale-response", "role-guard", "session-expired"].includes(caseName))) {
    return "legacy";
  }
  if (!expectedEvidence) {
    throw new Error("CANONICAL_INPUT");
  }
  const d1 = Object.getOwnPropertyDescriptor(argv, "1");
  if (!d1 || !Object.hasOwn(d1, "value") || typeof d1.value !== "string") {
    throw new Error("CANONICAL_INPUT");
  }
  const a1 = d1.value;
  if (a1 !== "--evidence=" + expectedEvidence) {
    throw new Error("CANONICAL_INPUT");
  }
  return expectedEvidence;
}

export function classifyCanonicalErrors(raw, observation) {
  if (own(raw, "case") === "stale-response" || own(observation, "case") === "stale-response") return staleEvidence.classifyCanonicalErrors(raw, observation);
  if (own(raw, "case") === "errors" || own(observation, "case") === "errors") return errorsEvidence.classifyCanonicalErrors(raw, observation);
  if (own(raw, "case") === "filters" || own(observation, "case") === "filters") return filtersEvidence.classifyCanonicalErrors(raw, observation);
  if (own(raw, "case") === "empty-fixture" || own(observation, "case") === "empty-fixture") return emptyEvidence.classifyCanonicalErrors(raw, observation);
  return (own(raw, "case") === "list-fixture" || own(observation, "case") === "list-fixture" ? listEvidence : liveEvidence).classifyCanonicalErrors(raw, observation);
}

export function evaluateCanonicalEvidence(envelope) {
  let mode = "live";
  const bytes = own(envelope, "observationBytes");
  if (types.isProxy(bytes)) throw new Error("CANONICAL_INPUT");
  if (types.isUint8Array(bytes) && (![Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(bytes)) || Object.getOwnPropertySymbols(bytes).length || ["byteLength", "byteOffset", "buffer", "length", "constructor", "valueOf", "toJSON", "toString"].some(k => Object.hasOwn(bytes, k)))) throw new Error("CANONICAL_INPUT");
  try {
    if (Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) {
      const o = JSON.parse(Buffer.from(bytes).toString("utf8"));
      if (own(o, "schema") === "shiftmgmt-stale-observation-v1" || own(o, "case") === "stale-response" || own(o, "mode") === "canonical-stale-v1") mode = "stale";
      else if (own(o, "schema") === "shiftmgmt-errors-observation-v1" || own(o, "case") === "errors" || own(o, "mode") === "canonical-errors-v1") mode = "errors";
      else if (own(o, "schema") === "shiftmgmt-filters-observation-v1" || own(o, "case") === "filters" || own(o, "mode") === "canonical-filters-v1") mode = "filters";
      else if (own(o, "schema") === "shiftmgmt-empty-observation-v1" || own(o, "case") === "empty-fixture" || own(o, "mode") === "canonical-empty-v1") mode = "empty";
      else if (own(o, "schema") === "shiftmgmt-list-observation-v1" || own(o, "case") === "list-fixture" || own(o, "mode") === "canonical-list-v1") mode = "list";
    }
  } catch {}
  if (mode === "stale") return staleEvidence.evaluateCanonicalEvidence(envelope);
  if (mode === "errors") return errorsEvidence.evaluateCanonicalEvidence(envelope);
  if (mode === "filters") return filtersEvidence.evaluateCanonicalEvidence(envelope);
  if (mode === "empty") return emptyEvidence.evaluateCanonicalEvidence(envelope);
  return (mode === "list" ? listEvidence : liveEvidence).evaluateCanonicalEvidence(envelope);
}

export function readCanonicalEvidence(options) {
  if (own(options, "caseName") === "stale-response") return staleEvidence.readCanonicalEvidence(options);
  if (own(options, "caseName") === "errors") return errorsEvidence.readCanonicalEvidence(options);
  if (own(options, "caseName") === "filters") return filtersEvidence.readCanonicalEvidence(options);
  if (own(options, "caseName") === "empty-fixture") return emptyEvidence.readCanonicalEvidence(options);
  return (own(options, "caseName") === "list-fixture" ? listEvidence : liveEvidence).readCanonicalEvidence(options);
}

export async function publishCanonicalEvidence(state, publication, registration) {
  if (own(registration, "caseName") === "stale-response" || own(publication, "mode") === "canonical-stale-v1" || own(state, "case") === "stale-response") return staleEvidence.publishCanonicalEvidence(state, publication, registration);
  if (own(registration, "caseName") === "errors" || own(publication, "mode") === "canonical-errors-v1" || own(state, "case") === "errors") return errorsEvidence.publishCanonicalEvidence(state, publication, registration);
  if (own(registration, "caseName") === "filters" || own(publication, "mode") === "canonical-filters-v1" || own(state, "case") === "filters") return filtersEvidence.publishCanonicalEvidence(state, publication, registration);
  if (own(registration, "caseName") === "empty-fixture" || own(publication, "mode") === "canonical-empty-v1" || own(state, "case") === "empty-fixture") return emptyEvidence.publishCanonicalEvidence(state, publication, registration);
  return (own(registration, "caseName") === "list-fixture" || own(publication, "mode") === "canonical-list-v1" || own(state, "case") === "list-fixture" ? listEvidence : liveEvidence).publishCanonicalEvidence(state, publication, registration);
}

export function validateCanonicalGateResult(result, options) {
  if (own(options, "caseName") === "stale-response") return staleEvidence.validateCanonicalGateResult(result, options);
  if (own(options, "caseName") === "errors") return errorsEvidence.validateCanonicalGateResult(result, options);
  if (own(options, "caseName") === "filters") return filtersEvidence.validateCanonicalGateResult(result, options);
  if (own(options, "caseName") === "empty-fixture") return emptyEvidence.validateCanonicalGateResult(result, options);
  return (own(options, "caseName") === "list-fixture" ? listEvidence : liveEvidence).validateCanonicalGateResult(result, options);
}

export function createEvidenceRun(options) {
  const argv = own(options, "argv");
  if (Array.isArray(argv) && own(argv, "0") === "--case=stale-response" && own(argv, "1") === "--evidence=canonical-stale-v1") return staleObserver.createStaleRun(options);
  if (Array.isArray(argv) && own(argv, "0") === "--case=errors") return errorsObserver.createErrorsRun(options);
  if (Array.isArray(argv) && own(argv, "0") === "--case=filters") return filtersObserver.createFiltersRun(options);
  const isList = Array.isArray(argv) && own(argv, "length") === 2 && own(argv, "0") === "--case=list-fixture" && own(argv, "1") === "--evidence=canonical-list-v1";
  const isEmpty = Array.isArray(argv) && own(argv, "length") === 2 && own(argv, "0") === "--case=empty-fixture" && own(argv, "1") === "--evidence=canonical-empty-v1";
  if (isEmpty) return emptyObserver.createEmptyRun(options);
  return (isList ? listObserver.createListRun : liveObserver.createLiveRun)(options);
}
