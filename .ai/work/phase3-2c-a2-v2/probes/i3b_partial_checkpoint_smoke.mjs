import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = fs.realpathSync(process.cwd());
assert.ok(fs.existsSync(path.join(root, '.git')), 'Run from tracked project root');
const product = path.join(root, 'ShiftMgmt_V4');
const directory = path.join(product, 'scripts/ui-checks');
const sourcePositive = fs.readFileSync(path.join(directory, 'access-history-positive.mjs'), 'utf8');
const sourceNegative = fs.readFileSync(path.join(directory, 'access-history-negative.mjs'), 'utf8');
assert.equal((sourcePositive.match(/state\.updatePartial\(\)/g) || []).length, 2, 'positive checkpoints must be initial+finally');
assert.match(sourcePositive, /}\s*finally\s*{\s*state\.updatePartial\(\);\s*}\s*state\.resources\.context\.closedAtMs/, 'positive checkpoint must follow runScreenCheck in finally');
assert.equal((sourceNegative.match(/state\.updatePartial\(\)/g) || []).length, 2, 'negative checkpoints must be initial+finally');
assert.match(sourceNegative, /await browser\.close\(\)[\s\S]{0,180}\n\s*state\.updatePartial\(\);\s*\n\s*}\s*\n\s*publishNormalEvidence/, 'negative checkpoint must follow cleanup in finally');

const { installNormalObserver } = await import(
  pathToFileURL(path.join(directory, 'access-history-negative.mjs')).href
);
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shiftmgmt-i3b-partial-'));
const digest = x => crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
const proof = [];
for (const caseName of ['list-fixture', 'errors']) {
  const subDir = path.join(runDir, caseName);
  fs.mkdirSync(subDir, { recursive: false });
  const context = { repository: product, runDir: subDir };
  const state = installNormalObserver({
    context, caseName, contract: {}, execution: {},
    nonceSha256: 'ISOLATED_SYNTHETIC_NONCE', chromeInfo: { path: '', version: '' }
  });
  state.updatePartial();
  const partialPath = path.join(subDir, 'normal-partial.json');
  const firstBytes = fs.readFileSync(partialPath);
  const before = JSON.parse(firstBytes);
  assert.equal(before.case, caseName);
  assert.equal(before.requests.length, 0);

  const t = Date.now();
  state.requests.push({
    id: 101, source: 'synthetic', method: 'GET',
    url: 'http://invalid.local/synthetic-only', phase: 'scenario',
    startedAtMs: t, endedAtMs: t + 1, status: 503, ok: false,
    errorCode: 'SYNTHETIC_FAILURE', query: null
  });
  state.rawErrors.badResponses.push({
    requestId: 101, status: 503, code: 'SYNTHETIC_FAILURE', timeMs: t + 1
  });
  state.resources.context.closedAtMs = t + 2;
  state.updatePartial();

  const lastBytes = fs.readFileSync(partialPath);
  const after = JSON.parse(lastBytes);
  assert.notEqual(digest(firstBytes), digest(lastBytes), caseName + ': checkpoint SHA must change');
  assert.equal(after.requests[0].status, 503);
  assert.equal(after.requests[0].errorCode, 'SYNTHETIC_FAILURE');
  assert.equal(after.rawErrors.badResponses[0].requestId, 101);
  assert.equal(after.resources.context.closedAtMs, t + 2);
  assert.equal(after.workerPid, process.pid);
  assert.equal(after.runId, path.basename(subDir));
  proof.push({ caseName, shaBefore: digest(firstBytes), shaAfter: digest(lastBytes) });
}
console.log(JSON.stringify({
  result: 'I3B_PARTIAL_CHECKPOINT_HELPER_PASS',
  casesPassed: proof.length,
  sourceCheckpoints: 'initial-and-finally',
  actualExportUsed: true,
  projectRoot: root,
  scratchRunDir: runDir,
  proof
}));
