// scripts/ui-checks/access-history-filters-semantic.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import util from 'node:util';

const CONTRACT_DIR = 'C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a2-u4-retry';
const IDS = ["FILTER-01", "FILTER-02", "FILTER-03", "FILTER-04", "FILTER-05", "FILTER-06", "FILTER-07", "FILTER-08", "FILTER-09", "FILTER-10", "FILTER-11", "FILTER-12", "FILTER-13", "FILTER-14", "FILTER-15"];

const sha = data => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();

let cachedSchema = null;
function getSchema() {
  if (cachedSchema) return cachedSchema;
  const p = path.join(CONTRACT_DIR, 'filters-wire-shapes.json');
  const b = fs.readFileSync(p);
  if (b.length !== 812386 || sha(b) !== 'E736999BCC8A293688C2A8BE628A1928ABE98B3183398AB6295C5EBDCF22795D') {
    throw new Error('CANONICAL_BINDING');
  }
  cachedSchema = JSON.parse(b.toString('utf-8'));
  return cachedSchema;
}

function shape(v, s, p = 'wire') {
  if (s.anyOf) {
    for (const q of s.anyOf) {
      try { shape(v, q, p); return; } catch {}
    }
    throw new Error('WIRE_UNION:' + p);
  }
  const t = s.type;
  if (t === 'null') {
    if (v !== null) throw new Error('WIRE_NULL:' + p);
  } else if (t === 'boolean') {
    if (typeof v !== 'boolean') throw new Error('WIRE_BOOLEAN:' + p);
  } else if (t === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('WIRE_NUMBER:' + p);
  } else if (t === 'integer') {
    if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) >= 9007199254740992) throw new Error('WIRE_INTEGER:' + p);
  } else if (t === 'string') {
    if (typeof v !== 'string' || v.length > 200000) throw new Error('WIRE_STRING:' + p);
  } else if (t === 'array') {
    if (!Array.isArray(v) || v.length > (s.maxItems || 4096)) throw new Error('WIRE_ARRAY:' + p);
    for (let i = 0; i < v.length; i++) shape(v[i], s.items, p + '.' + i);
  } else if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('WIRE_FIELDS:' + p);
    const req = s.required || [];
    const props = s.properties || {};
    const keys = Object.keys(v);
    const propKeys = Object.keys(props);
    if (!req.every(k => keys.includes(k))) throw new Error('WIRE_FIELDS:' + p);
    if (!keys.every(k => propKeys.includes(k))) throw new Error('WIRE_FIELDS:' + p);
    for (const k of keys) shape(v[k], props[k], p + '.' + k);
  } else {
    throw new Error('WIRE_SCHEMA');
  }
}

function checkByteView(bytes) {
  if (!bytes || typeof bytes !== 'object') throw new Error('WIRE_BYTES');
  if (util.types.isProxy(bytes)) throw new Error('WIRE_BYTES');
  const proto = Object.getPrototypeOf(bytes);
  if (proto !== Uint8Array.prototype && proto !== Buffer.prototype) throw new Error('WIRE_BYTES');
  for (const k of ['byteLength', 'byteOffset', 'buffer']) {
    const d = Object.getOwnPropertyDescriptor(bytes, k);
    if (d) throw new Error('WIRE_BYTES');
  }
  for (const k of Object.getOwnPropertyNames(bytes)) {
    if (isNaN(k)) {
      const d = Object.getOwnPropertyDescriptor(bytes, k);
      if (d && (d.get || d.set)) throw new Error('WIRE_BYTES');
    }
  }
  if (Object.getOwnPropertySymbols(bytes).length > 0) throw new Error('WIRE_BYTES');
}

function safeBuffer(bytes) {
  checkByteView(bytes);
  const proto = Object.getPrototypeOf(Uint8Array.prototype);
  const getByteLength = Object.getOwnPropertyDescriptor(proto, 'byteLength').get;
  const getByteOffset = Object.getOwnPropertyDescriptor(proto, 'byteOffset').get;
  const getBuffer = Object.getOwnPropertyDescriptor(proto, 'buffer').get;
  const len = getByteLength.call(bytes);
  if (len > 8388608) throw new Error('WIRE_BYTES');
  const offset = getByteOffset.call(bytes);
  const arrBuf = getBuffer.call(bytes);
  return Buffer.from(arrBuf, offset, len);
}

function parseJsonStrict(bytes) {
  const buf = safeBuffer(bytes);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  let pos = 0;
  const skip = () => { while (pos < text.length && /[ \t\r\n]/.test(text[pos])) pos++; };
  const readString = () => {
    pos++;
    let out = '';
    while (pos < text.length) {
      const ch = text[pos++];
      if (ch === '"') return out;
      if (ch === '\\') {
        if (pos >= text.length) throw new Error('CANONICAL_JSON');
        const esc = text[pos++];
        const m = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[esc];
        if (m) out += m;
        else if ('"\\/'.includes(esc)) out += esc;
        else if (esc === 'u') {
          const hex = text.slice(pos, pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('CANONICAL_JSON');
          pos += 4;
          out += String.fromCharCode(parseInt(hex, 16));
        } else throw new Error('CANONICAL_JSON');
      } else {
        if (ch.charCodeAt(0) < 32) throw new Error('CANONICAL_JSON');
        out += ch;
      }
    }
    throw new Error('CANONICAL_JSON');
  };
  const scanVal = depth => {
    if (depth > 64) throw new Error('CANONICAL_JSON');
    skip();
    if (pos >= text.length) throw new Error('CANONICAL_JSON');
    const ch = text[pos];
    if (ch === '"') readString();
    else if (ch === '{') {
      pos++;
      skip();
      const seen = new Set();
      if (text[pos] === '}') { pos++; return; }
      while (true) {
        skip();
        if (text[pos] !== '"') throw new Error('CANONICAL_JSON');
        const key = readString();
        if (seen.has(key)) throw new Error('DUPLICATE_JSON_KEY');
        seen.add(key);
        skip();
        if (text[pos++] !== ':') throw new Error('CANONICAL_JSON');
        scanVal(depth + 1);
        skip();
        if (text[pos] === '}') { pos++; break; }
        if (text[pos++] !== ',') throw new Error('CANONICAL_JSON');
      }
    } else if (ch === '[') {
      pos++;
      skip();
      if (text[pos] === ']') { pos++; return; }
      while (true) {
        scanVal(depth + 1);
        skip();
        if (text[pos] === ']') { pos++; break; }
        if (text[pos++] !== ',') throw new Error('CANONICAL_JSON');
      }
    } else {
      const start = pos;
      while (pos < text.length && !/[\s,\}\]]/.test(text[pos])) pos++;
      const tok = text.slice(start, pos);
      if (tok === 'true' || tok === 'false' || tok === 'null') return;
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(tok)) throw new Error('NONFINITE_JSON');
      const num = Number(tok);
      if (!Number.isFinite(num)) throw new Error('NONFINITE_JSON');
    }
  };
  scanVal(0);
  skip();
  if (pos !== text.length) throw new Error('CANONICAL_JSON');
  return JSON.parse(text);
}

export function parseFilterObservation(bytes) {
  const o = parseJsonStrict(bytes);
  shape(o, getSchema());
  if (o.schema !== 'shiftmgmt-filters-observation-v1' || o.case !== 'filters' || o.mode !== 'canonical-filters-v1') {
    throw new Error('WIRE_IDENTITY');
  }
  if (!o.primaryViewport || o.primaryViewport.width !== 1440 || o.primaryViewport.height !== 900) {
    throw new Error('WIRE_VIEWPORT_TIME');
  }
  if (typeof o.collectedAtMs !== 'number' || o.collectedAtMs <= 0 || o.collectedAtMs >= 9007199254740992) {
    throw new Error('WIRE_VIEWPORT_TIME');
  }
  return o;
}

function validatePlainObservation(val) {
  const seen = new Set();
  function walk(v) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('CANONICAL_INPUT');
      if (typeof v === 'function') throw new Error('CANONICAL_INPUT');
      return;
    }
    if (util.types.isProxy(v)) throw new Error('CANONICAL_INPUT');
    const proto = Object.getPrototypeOf(v);
    if (Array.isArray(v)) {
      if (proto !== Array.prototype) throw new Error('CANONICAL_INPUT');
    } else {
      if (proto !== Object.prototype && proto !== null) throw new Error('CANONICAL_INPUT');
    }
    if (Object.getOwnPropertySymbols(v).length > 0) throw new Error('CANONICAL_INPUT');
    if (seen.has(v)) throw new Error('CANONICAL_INPUT');
    seen.add(v);
    const descs = Object.getOwnPropertyDescriptors(v);
    for (const k of Object.keys(descs)) {
      const d = descs[k];
      if (d.get || d.set) throw new Error('CANONICAL_INPUT');
      if (!Array.isArray(v) && !d.enumerable) throw new Error('CANONICAL_INPUT');
      walk(d.value);
    }
  }
  walk(val);
  if (val.schema !== 'shiftmgmt-filters-observation-v1') {
    throw new Error('CANONICAL_INPUT');
  }
}

function hydrate(o) {
  const reqMap = new Map(o.requests.map(q => [q.id, q]));
  function walk(v) {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const res = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'requestIds') {
        res.requests = val.map(id => reqMap.get(id));
      } else {
        res[k] = walk(val);
      }
    }
    return res;
  }
  const facts = walk(o.observations);
  facts.finalState = o.ledger;
  return facts;
}

function query(s) {
  const pairs = [
    ['dateFrom', 'filter-date-from'],
    ['dateTo', 'filter-date-to'],
    ['loginId', 'filter-user-select'],
    ['actionType', 'filter-action-select'],
    ['keyword', 'filter-keyword-input']
  ];
  const q = {};
  for (const [k, v] of pairs) {
    const val = s?.filters?.[v]?.value?.trim?.() ?? '';
    if (val && !((k === 'loginId' || k === 'actionType') && val === 'all')) {
      q[k] = val;
    }
  }
  return q;
}

export function evaluateFilters(observation) {
  validatePlainObservation(observation);
  const o = hydrate(observation);
  const ledger = observation.ledger;
  const rows = [];

  const calls = phase => (ledger?.calls || []).filter(x => x.phase === phase);
  const events = (phase, kind = null) => (ledger?.events || []).filter(x => x.phase === phase && (kind === null || x.type === kind));

  const one = v => {
    if (!v || !Array.isArray(v.requests) || v.requests.length !== 1) return false;
    if (v.afterCount - v.beforeCount !== 1) return false;
    return util.isDeepStrictEqual(v.requests[0].args, [query(v.snapshot)]);
  };

  const quiet = (v, snapshot = null) => {
    const s = snapshot || v?.snapshot;
    if (!v?.requests || !v.requests.length || !s) return false;
    const maxFinished = Math.max(...v.requests.map(q => q.finishedAtMs));
    return s.atMs - maxFinished >= 250;
  };

  const cancel = (key, phase) => {
    const v = o[key];
    if (!v || !v.requests || v.requests.length !== 1) return false;
    const cs = calls(phase + '-trigger');
    const es = events(phase, 'input');
    if (v.afterCount - v.beforeCount !== 1) return false;
    if (cs.length !== 1 || cs[0].eventId === null || !es.length) return false;
    const diff = cs[0].perfMs - es[es.length - 1].perfMs;
    if (diff < 0 || diff >= 250) return false;
    const qExpected = [query(v.trigger?.snapshot)];
    if (!util.isDeepStrictEqual(cs[0].args, qExpected)) return false;
    if (!util.isDeepStrictEqual(v.requests[0].args, qExpected)) return false;
    return quiet(v, v.trigger?.snapshot);
  };

  const defaults = s => {
    const d = s?.localDefaults;
    if (!d || !d.dateTo) return false;
    const dtFirst = d.dateTo.slice(0, 8) + '01';
    const expectedD = {
      dateFrom: dtFirst,
      dateTo: d.dateTo,
      loginId: 'all',
      actionType: 'all',
      keyword: ''
    };
    if (!util.isDeepStrictEqual(d, expectedD)) return false;
    const actualValues = ['filter-date-from', 'filter-date-to', 'filter-user-select', 'filter-action-select', 'filter-keyword-input'].map(k => s.filters?.[k]?.value);
    return util.isDeepStrictEqual(actualValues, [d.dateFrom, d.dateTo, 'all', 'all', '']);
  };

  const described = (item, err) => {
    if (!item || !err || !err.id) return false;
    const list = (item.describedBy || '').trim().split(/\s+/);
    return list.includes(err.id);
  };

  const attempts = (group, button, prefix) => {
    const vs = o[group];
    if (!Array.isArray(vs) || vs.length !== 3) return false;
    const modes = new Set(vs.map(v => v.mode));
    if (modes.size !== 3 || !modes.has('click') || !modes.has('Space') || !modes.has('Enter')) return false;
    for (const v of vs) {
      const key = v.mode === 'Space' ? ' ' : 'Enter';
      const es = events(prefix + v.mode);
      if (v.afterCount !== v.beforeCount) return false;
      const ok = es.some(e => e.trusted && e.target === button && (
        (v.mode === 'click' && e.type === 'click') ||
        (v.mode !== 'click' && e.type === 'keydown' && e.key === key)
      ));
      if (!ok) return false;
    }
    return true;
  };

  const f01 = () => {
    const v = o.fullQuery;
    if (!v || !v.snapshot) return false;
    const q = query(v.snapshot);
    const cs = calls('full-five-fields');
    const qKeys = Object.keys(q);
    const expectedKeys = ['dateFrom', 'dateTo', 'loginId', 'actionType', 'keyword'];
    const hasAllKeys = qKeys.length === 5 && expectedKeys.every(k => k in q);
    return one(v) && hasAllKeys && cs.length === 1 && util.isDeepStrictEqual(cs[0].args, [q]) && cs[0].requestId === v.requests[0].id;
  };

  const f02 = () => {
    const v = o.debounce;
    if (!v) return false;
    const es = events('debounce', 'input');
    const cs = calls('debounce');
    if (!one(v) || !quiet(v) || cs.length !== 1 || es.length <= 1) return false;
    if (!es.every(e => e.trusted)) return false;
    for (let i = 0; i < es.length - 1; i++) {
      const diff = es[i + 1].perfMs - es[i].perfMs;
      if (diff < 0 || diff >= 250) return false;
    }
    return (cs[0].perfMs - es[es.length - 1].perfMs >= 250) && cs[0].args?.[0]?.keyword === '연속검색';
  };

  const f03 = () => {
    const es = events('immediate', 'input');
    if (!es.length || !o.immediate?.old) return false;
    if (o.immediate.old.rows <= 0) return false;
    return es.every(e => (
      e.trusted &&
      e.after?.rows === 0 &&
      e.after?.count === '조회 중…' &&
      Array.isArray(e.after?.status) && e.after.status.length === 1 &&
      e.after.status[0].role === 'status' &&
      typeof e.after.status[0].text === 'string' && e.after.status[0].text.includes('불러오는 중') &&
      e.before?.active === 'filter-keyword-input' &&
      e.after?.active === 'filter-keyword-input' &&
      util.isDeepStrictEqual(e.before?.caret, e.after?.caret)
    ));
  };

  const f07 = () => cancel('resetCancel', 'reset-cancel') && defaults(o.resetCancel?.trigger?.snapshot);

  const f08 = () => {
    const v = o.invalid;
    if (!v || !v.snapshot) return false;
    const s = v.snapshot;
    const e = s.error;
    if (!e) return false;
    return v.afterCount === v.beforeCount &&
      e.visible === true &&
      Boolean(e.text) &&
      s.filters?.['filter-date-from']?.value > s.filters?.['filter-date-to']?.value &&
      ['filter-date-from', 'filter-date-to'].every(id => described(s.filters[id], e));
  };

  const f09 = () => {
    const s = o.invalid?.snapshot;
    if (!s || !s.error || !s.buttons) return false;
    const e = s.error;
    const btnValues = Object.values(s.buttons);
    const btnsOk = btnValues.length > 0 && btnValues.every(b => (
      b.disabled === false && b.ariaDisabled === 'true' && described(b, e)
    ));
    return e.visible === true && btnsOk && attempts('invalidResetAttempts', 'btn-filter-reset', 'invalid-reset-');
  };

  const f11 = () => {
    const vs = o.invalidEnter;
    const ids = ['filter-keyword-input', 'filter-date-from', 'filter-date-to'];
    if (!Array.isArray(vs) || vs.length !== 3) return false;
    const seenIds = new Set(vs.map(v => v.id));
    if (seenIds.size !== 3 || !ids.every(id => seenIds.has(id))) return false;
    return vs.every(v => (
      v.afterCount === v.beforeCount &&
      v.snapshot?.forms === 0 &&
      events('invalid-input-enter-' + v.id, 'keydown').some(e => e.trusted && e.target === v.id && e.key === 'Enter')
    ));
  };

  const f12 = () => {
    for (const [name, key] of [['tabReset', 'reset'], ['tabRefresh', 'refresh']]) {
      const v = o[name];
      if (!v || !v.steps || !v.snapshot?.buttons) return false;
      const b = v.snapshot.buttons[key];
      if (!b || !b.focused || v.snapshot.active !== b.id || b.outlineWidth !== '2px' || b.outlineStyle !== 'solid') {
        return false;
      }
    }
    const tabEvents = events('invalid-native-tab', 'keydown').filter(e => e.trusted && e.key === 'Tab');
    return tabEvents.length >= 2;
  };

  const f13 = () => {
    const modelReceiptPath = path.join(CONTRACT_DIR, 'filters-model-receipt.json');
    const modelBytes = fs.readFileSync(modelReceiptPath);
    if (modelBytes.length !== 897 || sha(modelBytes) !== '576211D0BD79043F276387EAA58BB755F2B5F901008D242BD1789BE27EFFCAF7') {
      return false;
    }
    const model = JSON.parse(modelBytes.toString('utf-8'));
    const norm = o.normalizationInput;
    if (!norm) return false;
    return one(o.emptyFrom) &&
      !('dateFrom' in (o.emptyFrom?.requests?.[0]?.args?.[0] || {})) &&
      one(o.emptyTo) &&
      !('dateTo' in (o.emptyTo?.requests?.[0]?.args?.[0] || {})) &&
      model.emptyFrom?.valid === true &&
      model.emptyTo?.valid === true &&
      model.impossible?.valid === false &&
      observation.binding?.modelSourceSha256 === model.source?.sha256 &&
      norm.raw === '2026-02-30' &&
      norm.normalized === '' &&
      norm.trusted === false &&
      one(o.normalized) &&
      !('dateFrom' in (o.normalized?.requests?.[0]?.args?.[0] || {}));
  };

  const f14 = () => {
    const v = o.held;
    const h = ledger?.hold;
    if (!v || !h || !v.busy?.buttons || !v.during?.snapshot?.buttons || !v.after?.buttons) return false;
    const busy = s => Object.values(s.buttons).every(b => b.disabled === true && b.ariaDisabled === null && b.describedBy === null);
    const idle = s => Object.values(s.buttons).every(b => b.disabled === false && b.ariaDisabled === null && b.describedBy === null);
    return busy(v.busy) &&
      busy(v.during.snapshot) &&
      (v.during.requestCount - v.beforeCount === 1) &&
      (v.afterCount - v.beforeCount === 1) &&
      idle(v.after) &&
      h.upstreamOk === true &&
      h.sameUpstreamReference === true &&
      !h.safetyReleased &&
      (h.startedAtMs <= h.upstreamAtMs && h.upstreamAtMs <= h.releaseAtMs && h.releaseAtMs <= h.deliveredAtMs && h.deliveredAtMs <= v.after.atMs);
  };

  const f15 = () => {
    const c = o.immediate;
    const p = o.past;
    if (!c || !p || !p.requests || !p.requests.length || !p.snapshot) return false;
    const r = p.requests[p.requests.length - 1];
    const leftEvents = events('immediate', 'keydown').filter(e => e.key === 'ArrowLeft' && e.trusted);
    return c.caretBefore?.active === 'filter-keyword-input' &&
      c.after?.active === 'filter-keyword-input' &&
      util.isDeepStrictEqual(c.caretBefore?.caret, c.after?.caret) &&
      leftEvents.length === 2 &&
      util.isDeepStrictEqual(r.args, [{ dateFrom: '2000-01-01', dateTo: '2000-12-31' }]) &&
      util.isDeepStrictEqual(r.body, { ok: true, data: [] }) &&
      p.snapshot.rows === 0 &&
      (!observation.errors || observation.errors.length === 0) &&
      observation.capture?.bytes > 0 &&
      o.fonts?.status === 'loaded';
  };

  const specs = [
    [['fullQuery'], f01],
    [['debounce'], f02],
    [['immediate'], f03],
    [['refreshCancel'], () => cancel('refreshCancel', 'refresh-cancel')],
    [['dateCancel'], () => cancel('dateCancel', 'date-cancel')],
    [['userCancel', 'actionCancel'], () => cancel('userCancel', 'user-cancel') && cancel('actionCancel', 'action-cancel')],
    [['resetCancel'], f07],
    [['invalid'], f08],
    [['invalid', 'invalidResetAttempts'], f09],
    [['invalidAttempts'], () => attempts('invalidAttempts', 'btn-refresh-logs', 'invalid-refresh-')],
    [['invalidEnter'], f11],
    [['tabReset', 'tabRefresh'], f12],
    [['emptyFrom', 'emptyTo', 'normalizationInput', 'normalized'], f13],
    [['held'], f14],
    [['immediate', 'past', 'fonts'], f15]
  ];

  for (let i = 0; i < 15; i++) {
    const id = IDS[i];
    const [groups, predicate] = specs[i];
    let state = groups.some(k => o[k] === null || o[k] === undefined) ? 'MISSING' : null;
    if (state === null) {
      try {
        state = predicate() === true ? 'MET' : 'FAILED';
      } catch {
        state = 'FAILED';
      }
    }
    rows.push({ id, status: state });
  }

  const failed = rows.filter(r => r.status === 'FAILED').map(r => r.id);
  const missing = rows.filter(r => r.status === 'MISSING').map(r => r.id);
  return {
    scope: 'SEMANTIC_ONLY_NOT_PRODUCTION_ADMISSION',
    status: failed.length > 0 ? 'FAILED' : missing.length > 0 ? 'INCOMPLETE' : 'COMPLETE',
    rules: rows,
    failed,
    missing,
    canonicalAccepted: 0,
    productionAdmitted: false
  };
}
