# Sol-Orchestrated Collaboration Protocol

Version: **4.0 (2026-09-13)**

> This section is the active protocol. The former Claude/Fable/Codex/Gemini protocol is retained below only to interpret historical records and the already-issued handoff. It assigns no current authority.

---

## A. Authority and roles

| Actor | Active role | May do | Must not do |
|---|---|---|---|
| **Sol (xhigh, Codex)** | **sole orchestrator** | scope, requirements, design, strategy, delegation, verification, integration, completion decision, user report | silently transfer final authority; accept self-reports without evidence |
| **Gemini** | **external implementation coder** | edit only the implementation files authorized by a Sol handoff; run the specified checks; return evidence | decide design, expand scope, alter acceptance criteria, edit the plan, declare final completion |
| **Luna** | economy internal subagent | mechanical discovery, inventory, hashes, extraction, log summary, straightforward test runs | product-code edits, design decisions, handoff replacement, final decisions |
| **Terra** | balanced internal subagent | bounded investigation, test-plan review, focused hypotheses, evidence review | product-code edits, architecture ownership, handoff replacement, final decisions |
| **User** | external relay and approval owner | relay `HANDOFF.md` to/from Gemini; approve product direction and irreversible actions | — |

- Claude and Fable are retired. Old names in `Log/`, `TODO.md`, `.ai/current-state.md`, or completed decisions are historical metadata, not active roles.
- Gemini is the only normal product-code writer. Sol writes specifications, strategy, harness/control documents, and assessments.
- A quota limit or unavailable model does not change authority automatically. Any authority exception requires a specific user instruction.
- Luna/Terra commands must not alter tracked repository files. Ephemeral test/build output is allowed only outside the repository at a path named in the delegation packet, with an explicit cleanup or retention rule.

## B. End-to-end workflow

```text
User goal
  -> Sol: scope + source-of-truth check + risk classification
  -> Luna/Terra (optional, direct internal delegation): bounded evidence gathering
  -> Sol: decisions + code strategy + acceptance/negative tests
  -> Sol writes IMPLEMENT handoff
  -> User manually relays it to Gemini
  -> Gemini implements only the authorized scope and fills the response
  -> User manually relays the response to Sol
  -> Sol independently reproduces evidence, inspects diff, and decides
  -> ACCEPT / one consolidated CORRECT handoff / BLOCKED
  -> Sol reports to the user and updates approved control state
```

No separate designer or validator has veto authority. Sol may use specialist skills, MCP, Luna, or Terra for evidence, but Sol owns every decision and the final cross-check.

## C. Internal delegation contract

Sol delegates only concrete, bounded, independent work whose savings exceed the coordination cost. Each packet must contain:

1. **Objective** — one measurable result.
2. **Current state** — relevant phase, baseline, and known facts.
3. **Inputs** — exact files, symbols, commands, or artifacts to inspect.
4. **Boundary** — read/write permissions and paths that are out of scope.
5. **Checks** — questions to answer and required commands.
6. **Forbidden actions** — no scope expansion, no product edits, no completion decision.
7. **Output contract** — inspected sources/commands, observed facts, uncertainties, and recommendation kept separate.
8. **Completion criteria** — what makes the subtask done.

Use Luna for mechanical work and Terra for bounded reasoning. Prefer at most two concurrent internal subagents and parallelize only independent tasks. Sol rechecks material claims against the original source.

## D. Gemini IMPLEMENT handoff gate

Gemini may start implementation only when the handoff says `Action: IMPLEMENT` or `Action: CORRECT` and contains every item below. Sol starts from `.ai/GEMINI_HANDOFF_TEMPLATE.md`. If an item is missing or conflicts with the repository, Gemini returns `BLOCKED` without editing product files.

1. One task objective and explicit non-goals.
2. Exact target repository, branch, baseline commit, and expected initial worktree state.
3. Exact editable-file allowlist and protected/read-only paths.
4. Requirement IDs mapped to files, symbols, and expected behavior.
5. Sol's ordered code strategy: data flow, existing call sites to reuse, state transitions, error handling, and minimal-diff approach.
6. Applicable product invariants and known traps from past failures.
7. Exact validation commands, expected exit codes/counts, and required negative tests.
8. Runtime or UI scenario, capture/click checks, and measurable acceptance criteria where applicable.
9. Evidence and reply format.
10. Stop conditions and questions that must return to Sol.

Gemini must not:

- edit a path outside the allowlist, mass-regenerate files, or apply repository-wide formatting;
- add or upgrade dependencies, change API/DB/calculation rules, or introduce an alternate design unless explicitly authorized;
- weaken, delete, skip, or rewrite a test merely to obtain a pass;
- hide a failure behind a fallback, placeholder, mock, or invented default;
- change encoding or line endings unnecessarily;
- use shortened or invented hashes, claim a command was run without its exit code, or report a UI check without reproducible evidence;
- edit `TODO.md`, `PROTOCOL.md`, `AGENTS.md`, `.ai/`, or `Log/`; only the visible `## 회신` area of `HANDOFF.md` may be filled.

When instructions, source, or tests conflict, Gemini stops and describes the conflict. It does not make a “reasonable guess.”

## E. Gemini response contract

The visible `## 회신` section must contain:

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: <repository / branch / full baseline commit / final commit if any>
초기 상태: <git status and required preflight results>
변경 파일: <every changed file and one-line purpose>
범위 밖 변경: 0개 | <exact unexpected paths>
요구사항 대조: <requirement ID -> implementation location -> result>
검증 증거: <exact command -> exit code -> key count/result -> timestamp>
음성 테스트: <input/action -> expected rejection/failure -> actual result>
UI 증거: <URL/scenario -> clicks/keyboard -> capture paths -> console result>
diff 요약: <added/deleted lines, generated files, dependency changes>
전체 SHA-256: <only hashes produced by a command; no abbreviation>
미해결/가정: 없음 | <explicit list>
```

`IMPLEMENTED` means Gemini completed its assigned implementation. It never means the project task is accepted; only Sol can issue `ACCEPTED` after independent verification.

## F. Sol acceptance and anti-ping-pong rules

**User override — 2026-10-21:** A task allows one initial Gemini submission and one retry. Report initial/retry/cumulative attempts and current implementation owner every task. After both fail Sol verification, Sol directly takes over implementation under the user's standing authorization without another permission request. Version, strategy, or defect-label changes do not reset the same unresolved task's count. Preserve prior records and historical budgets; record actual submissions in HANDOFF.md and the task ledger. This overrides the older correction-count rule below and is the specific authorization exception in §A. Scope, validation, evidence, and deployment requirements remain applicable.

Sol checks seven gates: **scope, invariants, static checks, relevant tests, negative tests, runtime/UI behavior, and reproducible diff/evidence**. An unchecked gate is `UNVERIFIED`, not pass.

- Preflight closes design choices before Gemini receives the task. Do not ask Gemini to discover the design while coding.
- On failure, Sol first reproduces and groups all defects, then sends one consolidated `CORRECT` handoff. Do not send one defect at a time.
- Allow at most two correction submissions for the same defect class. After the second failure, stop resending, diagnose whether the strategy/specification is wrong, and replan or ask the user for the material decision.
- Each correction uses stable defect IDs and requires `cause -> changed location -> reproduction command -> result` for every ID.
- A newly introduced regression reopens the relevant full gate; a narrow fix does not erase earlier evidence requirements.

### F.1 Verification execution efficiency — 2026-10-26

- Sol applies `.ai/VERIFICATION_WORKFLOW.md`: quick preflight, focused reproduction, affected checks, then the required final suite on frozen source.
- Before issuing a packet or starting a long suite, verify explicit command/scenario identities, suite plus pre/post counts, final-result parsing, and a representative actual path. A plan check does not count as product runtime evidence.
- A full rerun requires a recorded material change or invalidated evidence. Two identical failures with unchanged inputs require a different diagnostic approach. Twenty minutes without narrowing the diagnosis or two validator corrections trigger Sol's strategy review; these triggers do not end normal long-running tests or reduce acceptance requirements.
- Keep all original failed receipts. Recorded revalidation and fresh execution must be reported separately. Exact required gates, deadlines, product boundaries, and attempt counts remain applicable.
- Sol reports progress within 60 seconds during ongoing work and verifies the terminal result/RC before reporting completion. Gemini records stage, elapsed time, failure classification, and rerun reason in its reply.

### F.2 Approved Task queue — user decision, 2026-10-26

- Sol executes only the next leaf Task in `TODO.md`; `.ai/task-plan.json` is a matching derived index. Each packet/review identifies the Plan Task ID and stable parent implementation task ID.
- New out-of-queue work is not automatically added or executed. Required fixes inside the active Task/allowlist use its existing defect IDs; only material new scope requires a concrete proposal and explicit user authorization.
- Preparation validates the verifier, fixtures and baseline feasibility. New product producer/reader integration, changed bindings and candidate regressions are implementation acceptance checks after code exists; they are not circular prerequisites to IMPLEMENT.
- Prefer reuse, grouped checks and a verified build per unchanged source/hook/compiler fingerprint. Any successor proof strategy must retain fresh source/served-byte checks, independent evidence, original negative coverage, deadlines and failure/partial behavior. Never edit a sealed prior authority or claim planned checks passed.
- Continue authorized internal steps to a concrete output without asking for repeated proceed confirmations. Product author, Gemini initial/retry limits and deployment authorization remain unchanged.

## G. Handoff transport and audit trail

1. Root `HANDOFF.md` is the only external Sol/Gemini exchange file and contains one current request.
2. The user manually relays the file. Sol and Gemini do not invoke one another through CLI tools.
3. Before replacing it, preserve the exact received bytes under `Log/YYYYMMDD_HHMMSS_<task>_<from>-to-<to>.md`.
4. Record and verify SHA-256, byte count, and timestamp. Existing `Log/` files are immutable.
5. Put `회신: 필요` or `회신: 불필요` visibly in the header. Do not hide instructions or reply forms in HTML comments.
6. A handoff must be self-contained enough to act on even if the receiver cannot open another document; include necessary excerpts, paths, baseline, constraints, and acceptance criteria without secrets.
7. The handoff body above `## 회신` is immutable to the receiver.

### In-flight transition rule

The `HANDOFF.md` already issued on 2026-09-10 remains frozen under the former protocol until Sol validates or supersedes it. “Frozen” means its request body above `## 회신` and its validation target are immutable; its old actor names and Step ⑥ references are compatibility metadata only. Do not edit its target `TODO.md` state while that validation is open.

Sol may audit that packet under the active authority. Before recording a result or issuing a replacement, Sol archives the exact received bytes with SHA-256 and byte count. Sol then either (a) appends only a clearly labeled Sol transition assessment in `## 회신`, or (b) replaces the file with a new active-protocol handoff after archival. Neither path reactivates a legacy actor.

## H. Product safety and user communication

- The product rules in the legacy-named `CLAUDE.md` and `07-invariants-and-pitfalls.md` remain active. The legacy filename carries product constraints, not agent authority.
- The migration source `C:\Projects\Active\ShiftMgmt_V3.4` remains read-only.
- Every implementation handoff includes the task-relevant invariants, not only a link to them.
- Sol explains results to the user in non-technical Korean: outcome -> reason -> concrete project example -> measured before/after values. Unmeasured claims are labeled, and “almost done” is replaced with exact verified/unverified status.

---

# [LEGACY v2 — historical compatibility only] 4자 협업 규칙 (Claude · Fable 5 · Codex · Gemini)

Version: **2.0 (2026-08-31, 사용자 정의 — Fable 5 합류, 화면 구현 파이프라인 6단계 확정)**

- **규칙(불변)**: 이 파일 `PROTOCOL.md`
- **교신 파일(덮어씀)**: 루트 `HANDOFF.md` — **오직 이 파일 하나로만 주고받는다**
- **이력(추가만)**: 루트 `Log/`

---

## 1. 역할

| Agent | 역할 | 하는 일 | 하지 않는 일 |
|---|---|---|---|
| **Claude** | **오케스트레이터** | 전체 진행 관리, 각 단계 입력 준비, 단계 간 연결, 결과 취합, **사용자 보고** | 코딩, HTML 지시서 작성, 단독 확정 |
| **Fable 5** | **디자인 담당** | ① PNG→HTML 전환 **초기 확인** ② **HTML 지시서 작성** ⑤ **결과물 검토·승인** | 코딩, 도메인 규칙 판단 |
| **Codex** | **교차검증자** | ③ **지시서 구성 검증·승인** ⑥ **웹페이지 품질 평가** | 코딩, 단독 결정 |
| **Gemini** | **코더** | ④ **코드 작성 및 웹페이지 구현** — 코드를 수정하는 **유일한** 주체 | 설계 결정, 범위 확장 |

🔴 **Claude는 HTML 지시서를 쓰지 않는다.** 그건 **Fable 5**의 몫이다.
Claude가 하는 것은 **Fable 5가 판단할 수 있도록 재료를 갖춰 주는 것**(PNG, 고칠 목록, 도메인 제약, 창구 목록)과 **단계 간 전달·취합·보고**다.

**Codex가 교차검증하는 대상**
- Fable 5의 HTML 지시서 (③)
- 완성된 웹페이지의 품질 (⑥)
- 화면설계·정보구조·사용흐름 설계
- 되돌릴 수 없는 동작(승인·배포·게시·DB 교체) 관련 설계
- 절대 규칙(`CLAUDE.md` 🔴) 위반 여부

**Codex가 반대(DISAGREE)하면 다음 단계로 넘어가지 않는다.** 수정 후 재합의한다.
**Fable 5가 ⑤에서 반려하면 ④로 되돌아간다.**

---

## 2. 🔴 교신 규칙 (사용자 지정 — 반드시 지킬 것)

1. **교신 파일은 루트 `HANDOFF.md` 단 하나다.** 다른 파일·다른 경로로 주고받지 않는다.
2. **전달은 사용자가 직접 한다.**
   Claude가 `HANDOFF.md`를 작성 → 사용자가 해당 AI 세션에 전달 → 그 AI가 `## 회신`을 갱신 → 사용자가 다시 전달.
3. **AI가 임의로 내장 CLI 명령(`codex`, `gemini` 등)을 실행해 다른 AI를 호출하지 않는다.**
   사용자가 그때그때 명시적으로 요청한 경우에만 예외.
   **뜻(2026-09-03 사용자 확인)**: 이 규칙은 **AI 상호 간 CLI 임의 호출 금지**다. 사용자가 전달한 `HANDOFF.md`는 다른 AI(Claude·Fable 5)가 작성했더라도 **수신처 AI가 그대로 수행**한다 — 작성 주체(Claude)와 전달 주체(사용자)는 분리돼 있으며, 이 규칙을 "다른 AI가 쓴 지시문을 받지 않는다"로 읽지 않는다(2026-09-03 Codex가 To: Gemini 문서를 이 규칙을 근거로 보류한 사례에서 확인).
4. **`HANDOFF.md`는 덮어쓰기로 교신한다.** 항상 최신 요청 1건만 존재한다.
5. **덮어쓰기 직전, 이전 내용을 반드시 `Log/`에 먼저 보존한다.**
   파일명: `YYYYMMDD_HHMMSS_<단계>.md` (예: `20260828_140000_AGREE-1.md`)
6. `Log/`의 파일은 수정·삭제하지 않는다(추가만).
7. 비밀값·인증정보 실제 값은 `HANDOFF.md`·`Log/`에 기록하지 않는다.
8. `HANDOFF.md`는 **그 파일만 읽어도 판단이 되게** 쓴다. 받는 AI가 다른 파일을 못 볼 수 있으므로, 필요한 제약과 배경을 본문 안에 적는다.

### 2.1 🔴 회신 요구는 반드시 눈에 보이게 (2026-08-28 추가 — 실패 사례에서 나온 규칙)

**사고**: 1차 AGREE-1 핸드오프에서 회신 양식을 HTML 주석 `<!-- ... -->` 안에 넣었다.
마크다운으로 보면 주석은 **화면에 표시되지 않는다.** 받는 쪽은 "회신하라"는 지시 자체를 보지 못했고, 회신이 오지 않았다.

**규칙**:
1. **`HANDOFF.md`에 HTML 주석을 쓰지 않는다.** 지시·양식·안내는 전부 보이는 본문으로 쓴다.
2. 회신이 필요하면 문서 **맨 위 머리말에 `회신: 필요`** 를 명시한다. 필요 없으면 `회신: 불필요`.
3. 머리말 바로 아래에 **눈에 띄는 회신 요구 블록**을 둔다. 여기에 네 가지를 적는다.
   - **누가** 회신하는가
   - **어디에** 쓰는가 (= 이 파일의 `## 회신` 칸)
   - **어떤 형식**으로 쓰는가 (빈 양식을 보이는 본문으로 제공)
   - **회신이 없으면 무엇이 멈추는가** (다음 단계 차단 사유)
4. `## 회신` 칸에는 **채워 넣을 빈 양식을 보이는 상태로** 둔다.
5. 회신을 받으면 그대로 `## 회신` 칸에 옮겨 적고, 다음 핸드오프로 넘어가기 전에 `Log/`에 보존한다.

---

## 3. 사용자 소통 규칙 (오케스트레이터 = Claude)

사용자는 **개발 전문 용어를 모른다.** Claude가 사용자에게 하는 모든 설명은:

1. **비전문가 용어**로 쓴다. 전문 용어가 꼭 필요하면 **쉬운 말 먼저, 괄호에 정확한 용어**.
   - 나쁨: "IPC 채널 계약을 유지하고 renderer만 교체합니다."
   - 좋음: "화면이 프로그램 내부에 일을 시킬 때 쓰는 **창구 111개는 그대로 두고**, 화면만 새로 만듭니다."
2. **예시를 붙인다.** 이 프로젝트의 실제 상황으로 예를 든다.
   - 예: "적용 시작일이란, 7월 1일부터 새 규칙을 쓰고 6월까지는 옛 규칙을 그대로 두는 방식입니다. 그래야 이미 지급한 6월 수당이 안 바뀝니다."
3. **결과 → 이유 → 예시 → 수치** 순서. 구현 이야기는 맨 뒤.
4. **수치는 Before/After로.** ("줄였습니다" ❌ → "24px → 16px, 약 33% 감소" ✅)
5. **측정 안 한 것을 측정한 것처럼 말하지 않는다.** 계산으로 낸 값이면 계산식을 밝힌다.
6. **파일명만 던지지 않는다.** ("`allowance-service.ts` 수정" ❌ → "수당 금액을 계산하는 부분(allowance-service.ts) 수정" ✅)
7. **"거의 다 됐습니다" 금지.** "코드 작성 완료 / 테스트 통과 / 실제 화면 확인은 아직" 처럼 나눈다.

---

## 4. 🔴 화면 구현 파이프라인 — **6단계** (2026-08-31 확정)

**PNG 시안을 실제로 동작하는 웹페이지로 만드는 흐름이다.**

```text
        [Claude: 재료 준비]
              ↓
1. 초기 확인          Fable 5   PNG를 HTML로 옮기기 위해 무엇이 필요한지 확인
              ↓                 (빠진 것·모호한 것·정할 것을 먼저 뽑는다)
2. HTML 지시서 작성    Fable 5   Gemini가 그대로 만들 수 있는 지시서를 쓴다
              ↓
3. 지시서 검증·승인    Codex     구성이 맞는지 교차검증        ← DISAGREE면 2로
              ↓
4. 코드 작성·구현      Gemini    웹페이지 구현 (코드를 만지는 유일한 주체)
              ↓
5. 결과물 검토·승인    Fable 5   시안대로 나왔는지 디자인 검토  ← 반려면 4로
              ↓
6. 품질 평가          Codex     완성된 웹페이지 품질 평가      ← DISAGREE면 4로
              ↓
        [Claude: 취합 → 사용자 보고]
```

**각 단계에서 Claude가 하는 일**

| 단계 | Claude |
|---|---|
| 1 앞 | Fable 5가 판단할 재료를 갖춘다 — PNG · 고칠 목록 · 도메인 제약 · 창구(API) 목록 · 절대 규칙 |
| 1→2 | 초기 확인 결과에서 **도메인 판단이 필요한 것**에 답을 준다 (창구 유무·계산 규칙 등) |
| 2→3 | 지시서를 `HANDOFF.md`에 실어 Codex로 넘긴다 |
| 3→4 | 승인된 지시서를 Gemini로 넘긴다. **범위 밖 파일·이관 코드 보호 제약을 붙인다** |
| 4→5 | 결과물을 Fable 5로 넘긴다 |
| 5→6 | 검토 결과를 Codex로 넘긴다 |
| 6 뒤 | 취합해 **비전문가 용어로 사용자 보고** |

- **전달은 전부 사용자가 한다** (§2 규칙 2). Claude는 `HANDOFF.md`를 쓰고 사용자가 옮긴다
- 단계마다 `HANDOFF.md`를 덮어쓰기 전 **`Log/`에 먼저 보존**한다

### 4.1 설계·문서 작업의 흐름 (화면 구현이 아닌 경우)

```text
1. PLAN      Claude가 설계 또는 문서 작성 → HANDOFF.md
2. AGREE     사용자가 Codex에게 전달 → 교차검증 → 동의?  (반대 시 수정 후 재합의)
3. CLOSED    종결. 사용자에게 비전문가 용어로 보고
```

---

## 5. HANDOFF.md 양식

````markdown
# HANDOFF
- Task: <작업 이름 한 줄>
- Step: 1-초기확인 | 2-지시서작성 | 3-지시서검증 | 4-구현 | 5-결과검토 | 6-품질평가 | CLOSED
        (설계·문서 작업이면 PLAN | AGREE | CLOSED)
- From: Claude | Fable 5 | Codex | Gemini
- To:   Claude | Fable 5 | Codex | Gemini
- Time: YYYY-MM-DD HH:MM
- **회신: 필요 / 불필요**

---

# 📌 회신 요청 — 반드시 읽어 주세요

**누가**: <To에 적힌 AI>
**어디에**: 이 파일 맨 아래 `## 회신` 칸
**형식**: `## 회신` 칸의 빈 양식을 그대로 채워 주세요
**회신이 없으면**: <무엇이 멈추는지 구체적으로>

---

## 배경
<받는 AI가 이 파일만 읽어도 판단할 수 있을 만큼의 최소 배경>

## 요청 내용
<설계안 / 지시서 / 검증 결과 / 동의 요청 본문>

## 성공 조건
<검증 가능한 완료 기준>

## 제약
<금지사항·보호 영역 — 아래 6장의 필수 제약 포함>

## 회신

> **여기에 작성해 주세요.** 아래 양식을 그대로 복사해 채우면 됩니다.

```
판정: AGREE / DISAGREE
1. ...
2. ...
```
````

**금지**: 이 문서 안에 HTML 주석 `<!-- -->`을 쓰지 않는다. 마크다운에서 보이지 않는다.

---

## 6. 모든 지시서에 넣는 필수 `## 제약`

- **이관 코드 수정 금지** — `src/shared/domain/`, `src/main/services/`, `src/main/ipc/`, `src/preload/`, `src/shared/bridge/`, 테스트 990개
- **DB 스키마 변경 금지** — 표·컬럼 이름 변경, 컬럼 삭제, 외래키 신규 부여, `allowance_calculations.signature` UNIQUE 제거 전부 금지
- **가짜 UI 금지** — 데이터·동작 없는 장식 요소는 시안에 있어도 만들지 않는다
- **실적 직접 입력 화면 금지** — 엑셀 인테이크가 유일한 경로
- **게시(`release:publish`) 금지** — 사용자 명시 승인 없이는 절대
- **forward-only** — 승인된 계산 결과 무이력 덮어쓰기 금지
- **범위 밖 파일 수정 금지** — 지시서에 적힌 파일만

---

## 7. 프로젝트 절대 규칙과의 관계

이 프로토콜도 루트 `CLAUDE.md`의 🔴 절대 규칙 아래에 있다.
하네스 정책(`.ai/HARNESS.md`)과 충돌하면 더 구체적인 프로젝트 규칙을 우선 검토하되,
안전·데이터 보호 경계는 약화하지 않는다.
