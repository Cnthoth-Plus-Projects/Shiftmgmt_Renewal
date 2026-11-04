# Project Codex Guidance

<!-- AI_HARNESS_VERSION: 4.0.0 -->

## Session Bootstrap

- Start with `.ai/HARNESS.md`, `TODO.md`, the current `HANDOFF.md`, and the relevant product rules named under `Source of Truth and Safety` below.
- `TODO.md` remains the top-level work plan. Read it to find the current phase, but do not treat its legacy Claude/Fable role labels as current authority.
- Inspect the available MCP surface once, then use only capabilities relevant to the task.
- Classify every substantial task as `economy`, `balanced`, or `frontier`, and report the tier and reason in one concise line.

## Fixed Operating Roles (user decision, 2026-09-13)

- **Sol with xhigh reasoning (Codex)** is the sole orchestrator. Sol owns scope, requirements, design, architecture, implementation strategy, delegation, verification, integration, completion decisions, and user reporting.
- **Gemini** is the external implementation coder. Gemini changes product code, tests, build configuration, or migrations only from a detailed Sol-authored `HANDOFF.md` relayed manually by the user.
- **Luna** is the economy internal subagent for mechanical discovery, extraction, hashes, inventories, log summaries, and straightforward test execution.
- **Terra** is the balanced internal subagent for bounded investigation, test-plan review, focused debugging hypotheses, and independent evidence review.
- Luna and Terra provide evidence only. They do not make design decisions, change product code, replace `HANDOFF.md`, update `TODO.md`, declare completion, or report directly to the user.
- Claude and Fable are retired from the active workflow. Historical references in `Log/`, old decisions, and the legacy filename `CLAUDE.md` are not active role assignments.
- This fixed project mapping is the user's explicit exception to the global model-name-independent routing default. If a named model is unavailable, use the nearest available capability tier and record the fallback; never transfer Sol's final authority.

## Routing and Delegation

- `frontier`: Sol handles orchestration, ambiguous cross-system reasoning, requirements, architecture, security/auth, database or migration decisions, release decisions, and final integration.
- `balanced`: normally Terra, for bounded review or investigation with a precise hypothesis and output contract.
- `economy`: normally Luna, for mechanical read-only work and routine command execution.
- Prefer no more than two concurrent internal subagents. Parallelize only independent work and do not duplicate the same investigation.
- Every delegation packet must include: objective, current state, exact inputs, read/write boundary, required checks, forbidden actions, output format, and completion criteria.
- Sol independently checks cited files, diffs, hashes, and command evidence before relying on a subagent result.

## Verification Efficiency (user request, 2026-10-26)

- Apply `.ai/VERIFICATION_WORKFLOW.md` to implementation and verification tasks. Read its short execution/retry rules before launching a long suite.
- Use preflight -> focused reproduction -> affected checks -> required final suite. Check command identities/counts, result parsing, and a representative actual path before the full suite.
- Every additional full run needs a concrete source/control/environment change or invalidated evidence, plus a recorded reason. Two identical failures under unchanged inputs require a different diagnostic approach before another full run.
- After 20 minutes without narrowing a diagnosis, or two validator corrections in one task, Sol revisits the strategy. These are diagnostic review triggers; preserve required tests, original deadlines, scope, and coding authority.
- Report verified progress within 60 seconds during work, including elapsed time for long commands. Read terminal results and process status before claiming completion. Distinguish recorded evidence revalidation from a fresh execution.

## Approved Task Queue and Scope Lock (user decision, 2026-10-26)

- `TODO.md` is the only active work queue. `.ai/task-plan.json` is its derived index; its TODO hash and Task IDs must match. Archived historical TODO text is evidence, not an active queue.
- Execute only the next authorized leaf Task. Before work, identify its ID, objective, file boundary, required checks, and concrete completion output. Internal evidence delegation stays within that Task.
- Do not start unlisted features, general refactors, dependency changes, extra documentation projects, or new verification frameworks. If an active Task cannot finish within its scope, report the minimal gap and proposed change; add new scope only after explicit user authorization.
- Necessary fixes/checks inside the active Task and its allowlist use the same Task/defect IDs. Do not ask again for routine authorized work, manufacture preparation phases, or reset Gemini attempts.
- Before IMPLEMENT, validate verifier self-tests/fixtures and baseline feasibility. Actual new producer/reader integration, changed-binding verification, and candidate regressions occur after implementation. Never require nonexistent product code to pass before authorizing its implementation.
- Reuse/group required checks with explicit coverage and actual rejection evidence; preserve original criteria and deadlines. Repeated rebuilds of unchanged protected source/hook/compiler are not default work; reuse only independently verified, locked proof with fresh fingerprints and actual served-byte checks, documented in a successor authority.
- Task completion reports distinguish preparation, product implementation, and formal acceptance. Keep status in TODO/HANDOFF/existing ledgers, and avoid redundant report bundles. Operational deployment still requires the separate explicit authorization already specified.

## Standing Direct Implementation Exception (user, 2026-10-31)

- User: “응 진행해줘 별도 명시 할때까지는 너가 직접 작업해줘 Gemini 한도 초과”. Until explicitly changed, Sol directly implements the currently authorized TODO leaf Task, including product code/tests/config necessary inside its allowlist. This supersedes the normal Gemini-only writer boundary below and earlier UI-07-only exception. It does not authorize unlisted work, simultaneous Tasks, commit, or deployment. Gemini attempts remain actual submissions only; quota does not count as an attempt.

## Code Ownership Boundary

- Gemini is the only normal product-code writer. Product code includes application source, tests, migrations, package/build/runtime configuration, and generated implementation artifacts.
- Sol writes and maintains orchestration material: requirements, design decisions, implementation strategy, verification plans, harness/control documents, and final assessments.
- Sol may directly change product code only after a new explicit user instruction for that specific exception. A Gemini quota failure does not silently transfer coding authority.
- Internal subagents (Luna and Terra) must not alter tracked repository files unless the user explicitly changes this rule for a named task. A test/build command may write only to an ephemeral location named in the delegation packet, with an explicit cleanup or retention rule.

## Top-Level Plan Document

- `TODO.md` is the top-level plan document. Product direction and current phase follow it; the absolute product rules still win on conflict.
- Under the new operating model, only Sol may update `TODO.md`, and only when the user has approved the underlying plan or status change. Gemini, Luna, and Terra propose updates in their result; they never edit it.
- The active handoff currently validates a specific `TODO.md` state. Do not alter `TODO.md` until that handoff is closed or the user explicitly replaces its validation target.
- Do not retroactively rewrite historical author or agent names in completed records.

## Handoff Protocol

### Gemini attempt limit — user decision, 2026-10-21

- Report Gemini attempts for every task: initial submission, retry submission, cumulative total, and current implementation owner.
- A task permits **one initial Gemini attempt plus one retry**. If both fail Sol verification, **Sol takes over implementation directly** under the user's standing authorization; do not request permission again.
- A new version, strategy, or defect label within the same unresolved task does not reset the count. Preserve historical counts; do not rewrite earlier records to fit the new policy.
- Record each attempt and result in HANDOFF.md and the task ledger. The limit does not permit weaker acceptance checks, expanded file scope, or release actions.

- The user manually relays work between Sol and Gemini. Do not invoke another AI through `codex`, `gemini`, or similar CLI commands unless the user explicitly asks for that invocation.
- On a handoff check, read `HANDOFF.md`, validate its claims against the named sources, and put the complete response in `HANDOFF.md`, not only in chat.
- Before replacing `HANDOFF.md`, preserve the received file unchanged under `Log/`, calculate SHA-256 and byte count, and verify that the archived bytes match the received file.
- `Log/` is append-only. Never edit or delete an existing log.
- Do not modify the validation target or source repository unless the handoff explicitly authorizes implementation.
- Gemini implementation packets and response evidence must follow `PROTOCOL.md`, `GEMINI.md`, and `.ai/GEMINI_HANDOFF_TEMPLATE.md`.

## Source of Truth and Safety

- Agent-operation authority: this file -> `.ai/HARNESS.md` -> `PROTOCOL.md` -> role-specific guidance.
- Product invariants: the legacy-named `CLAUDE.md` and `07-invariants-and-pitfalls.md`. The filename remains for compatibility; it does not restore a Claude role.
- Actual source, runtime, tests, and reproducible evidence override stale summaries.
- `C:\Projects\Active\ShiftMgmt_V3.4` is read-only unless the user explicitly changes that boundary.
- Never weaken tests, invent missing requirements, expand file scope, or call unverified work complete.

## MCP Defaults

- Prefer an exposed, relevant MCP tool over an ad-hoc shell or web lookup when it is the more direct or authoritative path.
- Treat `Auth: Unsupported` for a stdio MCP server as normal when that server does not use OAuth or bearer authentication.
- If a relevant MCP call fails, report the server and failure, then use the safest local or web fallback.
