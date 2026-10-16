# A2 v2 I3b — 최신 실패 관측 partial checkpoint

Date: 2026-10-16 KST
Branch: work/phase3-2c-a2-v2-implementation
Classification: **I3_READER_SYNTHETIC_SMOKE_PASS / I3B_STATIC_SOURCE_READY / I3B_NODE_RUNTIME_UNVERIFIED / A2_NOT_ACCEPTED**.

## Baseline evidence from user Windows CLI

The previous I3 Reader smoke was run from C:\Projects\Active\ShftMgmt_Renewal at exact HEAD bcd4298267a1c95c522195c20aa10f8c06d2a7e2. User reports clean Git, main c21aa263a02e57d57949bafc5aefe06aab582acd unchanged, five source/probe LF bytes and SHA all matched, Playwright import RC0, four Node syntax checks RC0. Actual exported readNormalWorkerEvidence synthetic test RC0, validAccepted=1, invalidRejected=9, stderr=0. This supports **the nine Reader field guards only**, not an owner-spawned worker execution or adversarial raw provenance.

The user summary also mentioned a \`read-tree\` command during LF repair; that exact command was not supplied. Post-run Clean/main SHA/source SHA are reported, but exact command provenance cannot be independently reconstructed from the summary; do not rewrite history as though \`read-tree\` was specifically authorized.

## Newly discovered remaining evidence gap

Source inspection found only **one** \`state.updatePartial()\` call in each worker before scenario actions: positive.mjs near line 78, negative.mjs near line 474. On scenario failure long after start, \`normal-partial.json\` could remain stale, despite parent owner catch referencing it by path and SHA. The parent catch does **not** reconstruct missing events; an old snapshot is not proof of an event's state at failure.

## Sol's bounded I3b source fix

- positive.mjs: wrap the existing awaited \`runScreenCheck\` call in \`try { ... } finally { state.updatePartial(); }\`, preserving original exception propagation while checkpointing the latest collected state if runScreenCheck throws. No changes to protected \`runScreenCheck\`, route logic, adjudicator, or original validation.
- negative.mjs: add \`state.updatePartial();\` to the existing worker scenario \`finally\` after context/browser close attempts and before original \`publishNormalEvidence\` line. Existing close errors and normal output remain in their original order.
- Both workers already make their initial partial before scenario; they now have exactly two callsites (initial + finally). \`updatePartial\` is a preexisting actual export-state method, writing normal-partial.json with fallback on write failure. Neither fix invents HTTP evidence or converts abnormal failure into PASS. An abrupt process kill, browser launch error before the negative \`try\`, blocked file IO, a rejected \`finally\` before update, or parent lifecycle failure can still leave a stale/missing partial. These cases remain UNVERIFIED.
- Explicit source/byte-level guard: 4 immutable/shared ownership boundaries untouched; 30KB per owner/shared/positive/negative still enforced; \`.ai/contracts\`, main, v1 failed, Windows external original dirty12 untouched.

## Current source SHA-256 and bytes from GitHub UTF-8 contents

| File | Bytes | SHA-256 |
|---|---:|---|
| owner.mjs | 29,520 | 6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22 |
| shared.mjs | 29,973 | C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4 |
| positive.mjs | 25,725 | 5E76A04AFD4BB661E438C234921C53EE431530298564C1A5F524A37B26D9FE9E |
| negative.mjs | 29,923 | 0677F5D94EE04A5144C8555EE717938DBCD1D4C2C18764DD2E98109ECFE87F57 |

## New isolated test asset

Tracked \`.ai/work/phase3-2c-a2-v2/probes/i3b_partial_checkpoint_smoke.mjs\`, 3,556B, SHA-256 4BC25171515E1A8F5A9A9C9F3C4A4374A807411F957099F4D70966DECAB3779B, \`text eol=lf\` from scoped .gitattributes.

The test runs with project root as CWD, imports the real \`installNormalObserver\` export, creates two new synthetic worker states (list-fixture/errors) under OS temp outside Git worktree, writes initial partial then mutates request/error/context timestamps and writes a second partial, verifies byte SHA changed and the later fields persisted. It additionally checks both worker sources for initial + finally checkpoint placement. **This tests the actual partial writer and static placement**, not a real browser failure/Owner catch.

Windows next gate: clean/branch/HEAD/source SHA; Node --check positive/negative/new smoke RC0; real exported partial writer probe RC0/2 scenarios; final Git Clean; NO npm ci repeat, NO browser/18741/A1/8 normal/112 faults. The source code and test were authored by Sol; local CLI executes only.

## Limits

Even if this smoke passes, **I3b is not accepted end-to-end**, as actual worker abnormal termination, parent cleanup, and Python adjudicator faults have not been triggered. No A2 whole acceptance.
