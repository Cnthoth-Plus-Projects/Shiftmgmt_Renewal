import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const project = fs.realpathSync(process.cwd());
assert.ok(fs.existsSync(path.join(project, '.git')), 'Run from Git project root');
const product = path.join(project, 'ShiftMgmt_V4');
assert.ok(fs.existsSync(path.join(product, 'scripts/ui-checks/access-history-negative.mjs')), 'Product tree missing');
const neg = await import(pathToFileURL(path.join(product, 'scripts/ui-checks/access-history-negative.mjs')).href);
const shared = await import(pathToFileURL(path.join(product, 'scripts/ui-checks/access-history-shared.mjs')).href);
// Read the repository-local JSON structure without rewriting locked Windows CRLF contracts.
// This isolated reader smoke is not an A1 contract SHA acceptance test.
const contract = JSON.parse(fs.readFileSync(path.join(project, '.ai/contracts/phase3-2c-v1/contract.json'), 'utf8'));
const execution = JSON.parse(fs.readFileSync(path.join(project, '.ai/contracts/phase3-2c-a2-v1/execution.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
const caseName = 'list-fixture';
// Script executes from this project; synthetic evidence is retained outside Git worktree.
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shiftmgmt-i3-smoke-'));
const runId = path.basename(runDir);
const context = { repository: product, runDir };
const workerPid = process.pid;
const requiredIds = contract.fullUi.rules[caseName].map(x => x.id);
assert.ok(requiredIds.length > 0, 'Contract contains no list-fixture rule IDs');
const raw0 = {
  schema: 'shiftmgmt.normal.raw.v1', case: caseName, runId, workerPid,
  contextSha256: hash(JSON.stringify(context)),
  contractSha256: shared.CONTRACT_SHA256, executionSha256: shared.EXECUTION_SHA256,
  diagnostics: [], requests: [], rawErrors: { console: [], pageerror: [], requestfailed: [], badResponses: [] }
};
const wf0 = {
  schema: contract.evidenceSchema, stageSlice: 'A2', case: caseName, runId, workerPid,
  contextSha256: raw0.contextSha256,
  contractSha256: shared.CONTRACT_SHA256, executionSha256: shared.EXECUTION_SHA256,
  status: 'FAIL_INCOMPLETE', exitCode: 1, checks: [],
  coverage: { requiredIds, missing: [...requiredIds], extra: [], duplicates: [] }
};
const rawFile = path.join(runDir, 'normal-observations.json');
const finalFile = path.join(runDir, 'worker-final.json');
function writePair(raw, wf) {
  const bytes = Buffer.from(JSON.stringify(raw, null, 2));
  wf.rawSha256 = hash(bytes);
  fs.writeFileSync(rawFile, bytes);
  fs.writeFileSync(finalFile, JSON.stringify(wf, null, 2));
}
const args = { caseName, context, execution, contract, workerPid, exitCode: 1 };
writePair(structuredClone(raw0), structuredClone(wf0));
const valid = neg.readNormalWorkerEvidence(args);
assert.equal(valid.workerFinal.status, 'FAIL_INCOMPLETE');
assert.deepEqual(valid.coverage.requiredIds, requiredIds);
const rejected = [];
function reject(label, edit, afterWrite) {
  const raw = structuredClone(raw0), wf = structuredClone(wf0);
  edit(raw, wf);
  writePair(raw, wf);
  if (afterWrite) afterWrite(raw, wf);
  assert.throws(() => neg.readNormalWorkerEvidence(args), /A2_NORMAL_EVIDENCE_INVALID:/, label);
  rejected.push(label);
}
reject('status', (_r, wf) => { wf.status = 'PASS'; });
reject('exitCode', (_r, wf) => { wf.exitCode = 0; });
reject('workerPid', (raw, _wf) => { raw.workerPid = -1; });
reject('runId', (_raw, wf) => { wf.runId = 'run-other'; });
reject('coverage', (_raw, wf) => { wf.coverage.missing = []; });
reject('diagnostics-type', (raw, _wf) => { raw.diagnostics = null; });
reject('raw-hash', () => {}, (_raw, wf) => {
  wf.rawSha256 = 'BAD';
  fs.writeFileSync(finalFile, JSON.stringify(wf, null, 2));
});
writePair(structuredClone(raw0), structuredClone(wf0));
assert.throws(() => neg.readNormalWorkerEvidence({ ...args, exitCode: 7 }), /A2_NORMAL_EVIDENCE_INVALID:/);
rejected.push('caller-exitCode');
assert.throws(() => neg.readNormalWorkerEvidence({ ...args, caseName: 'not-a-normal-case' }), /A2_NORMAL_EVIDENCE_INVALID:/);
rejected.push('caller-caseName');
console.log(JSON.stringify({
  result: 'I3_READER_SMOKE_PASS', validAccepted: 1, invalidRejected: rejected.length,
  rejected, workerPid, source: 'actual-export', projectRoot: project, scratchRunDir: runDir
}));
