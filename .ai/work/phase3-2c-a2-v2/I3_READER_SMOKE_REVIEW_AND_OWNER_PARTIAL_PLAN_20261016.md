# A2 v2 — I3 Reader Smoke 제출 판정 및 Owner 부분 증거 추가 검토

Date: 2026-10-16 KST
Branch: work/phase3-2c-a2-v2-implementation
Baseline HEAD reported: bcd4298267a1c95c522195c20aa10f8c06d2a7e2
Decision: **I3_READER_SYNTHETIC_SMOKE_PASS (limited) / OWNER_WORKER_RUNTIME_UNVERIFIED / A2_NOT_ACCEPTED**

## 1. Windows 현장 제출 증거

- Local project root C:\Projects\Active\ShftMgmt_Renewal, branch work/phase3-2c-a2-v2-implementation; origin HEAD and local HEAD both bcd4298267a1c95c522195c20aa10f8c06d2a7e2; main ref c21aa263a02e57d57949bafc5aefe06aab582acd unchanged; final Git Clean.
- Exact five checked-out LF files and GitHub baseline all matched byte-for-byte according to reported Windows Get-FileHash:
  - owner 29,520B / 6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22
  - shared 29,973B / C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4
  - positive 25,678B / B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D
  - negative 29,898B / BEF4014A83E03FB97C1CA4886898A1787811AC25CCB75F82D7B2DF5EDD83F8FA
  - tracked smoke 4,435B / 06D349660888B183B1D6706CAC5E6CF22E7062227294ABD852FB22F3CA5D78D7
- All five \`git ls-files --eol\`: \`i/lf w/lf attr/text eol=lf\`.
- \`npm ci --ignore-scripts --no-audit --no-fund --no-progress\`, browser-download skip set: npm RC0, 256 packages; package and package-lock hashes unchanged. \`import('playwright')\` RC0.
- \`node --check\`: owner, positive, negative, smoke RC0. Actual tracked \`i3_reader_smoke_v2.mjs\` RC0 / stdout \`I3_READER_SMOKE_PASS\`, \`validAccepted=1\`, \`invalidRejected=9\`, \`source=actual-export\`, stderr 0. Nine rejections: status, exitCode, workerPid, runId, coverage, diagnostics-type, raw-hash, caller-exitCode, caller-caseName.
- Synthetic data was retained in OS temporary folder outside repository. CLI reports historical originals (outside repo) untouched.
- Note on command scope: user summary mentions \`read-tree\` as part of LF repair. **Its exact command line was not provided or previously approved in HANDOFF**; cannot independently attest exact intermediate filesystem/index touches. Post-run final Clean/Main SHA/five target hashes are verified in reported observations, but this remains an execution-provenance footnote, not a reason to claim end-to-end owner correctness.
- Evidence class \`LOCAL_AGENT_REPORTED\` with GitHub baseline independently read; Sol did not directly execute Windows process or open local temp JSON.

## 2. Exact acceptance boundary

Reader export \`readNormalWorkerEvidence\` accepted one synthetic FAIL_INCOMPLETE case and rejected nine forged/invalid fields, in the specified project with declared SHA, dependencies, and EOL. **The limited I3 Reader input-validation gate passes.**

This does NOT prove actual owner-spawned worker PID/event receipts, Playwright response drain, server lifecycle, normal eight UI flows, Python gate, original 112 fault vectors, or original A1. I3 is not fully accepted. A2 v2 and B87 stay UNVERIFIED.

## 3. Fresh independent source finding — late failure partial capture

- \`negative.mjs\` implements \`installNormalObserver().updatePartial()\` and writes \`normal-partial.json\` / fallback in \`context.runDir\`.
- Real call sites: negative.mjs normal worker start ~line 474, positive.mjs start ~line 78. **No subsequent \`state.updatePartial()\` call in either worker source during the scenario**.
- On early worker termination after the initial call, the owner catch (~lines 376–392 in \`access-history.mjs\`) can locate and hash the partial, but the bytes do NOT necessarily reflect requests, auth, responses, route failures, captures, or cleanup errors observed later.
- Owner catch links the partial by \`workerPartialPath\` and SHA; it deliberately avoids copying the full raw content into the owner failure manifest. This preserves the path/integrity but **does not guarantee latest snapshot**.
- Owner normal candidate final gate path: after worker exit, owner seals artifacts, removes tempDir, writes owner-candidate, launches the locked Python adjudicator, parses PASS:ACCEPTABLE_INCOMPLETE_CANDIDATE, then writes owner-final. Actual fault injection at those boundaries remains unavailable without authorized controlled run.
- No product files modified in this review. \`main\` and rejected A2 v1 remain untouched.

## 4. Next engineering step (Sol-owned I3b design; no delegated architecture)

1. Preserve truthful state on abnormal termination by adding minimal bounded safe checkpoints or process-boundary flush to **actual worker code**, not by editing owner error manifest to fabricate completed events. Do not flatten all event handler writes into high-frequency sync I/O without performance/feedback analysis; choose one appropriate checkpoint strategy after inspecting all scenario await boundaries.
2. Ensure changes cannot silently swallow primary errors; file write failures should remain evidenceErrors and not replace first failure. Lock SHA/frozen 6,575B range and per-verifier <=30KB remain mandatory. negative.mjs has only 102 bytes headroom, so plan whitespace-only savings or tightly scoped relocation before functional growth.
3. Design a test in the actual project for two cases: valid partial from worker mutation then thrown exception remains in OS-temp synthetic evidence; malformed partial remains traceable as bytes with integrity SHA, never forged as trusted observation. Avoid running protected owner/Chrome/port/Python gate until separate authorization and safe environment plan.
4. Distinguish a synthetic helper-only test from owner-spawned runtime proof; never claim full I3/A2 acceptance on helper results.

Status: **I3 Reader limited PASS; I3b partial-failure freshness gap identified; owner end-to-end remains UNVERIFIED.**
