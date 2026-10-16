# HANDOFF — A2 v2 I1: 직접 실행 우회 및 보류 요청 정리

- Task: A2 v2 첫 구현 단위 — A2V1-09 / A2V1-07에 한정한 두 결함군 수정
- Action: IMPLEMENT
- From: Sol (GPT-6) — 설계·범위·검증·최종판정 담당
- To: Gemini — 허용한 코드만 구현
- Time: 2026-10-16 KST (날짜 기준; 임의 시각 미기재)
- 회신: **필요**
- Repository: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- Local authoring root: `C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal`
- Product root under authoring clone: `ShiftMgmt_V4/`
- Branch: `work/phase3-2c-a2-v2-implementation`
- **제품 기준 부모 커밋:** `fa9b63744e9b4c21c38fab5c57974c73368c7fea` (제품 검증기 4파일의 기준)
- **실행 전 원격 HEAD:** 이 HANDOFF를 받은 직후 `origin/work/phase3-2c-a2-v2-implementation`의 **전체 40자 SHA**를 조회하여, 사용자 중계 프롬프트에 지정된 HEAD와 일치할 것. 이 HANDOFF 자체를 출판하는 새 커밋 때문에 HEAD는 위 제품 기준 부모보다 앞설 수 있음. 예상하지 못한 추가 변경은 `BLOCKED`.
- Expected initial Git state **after authorized fast-forward pull:** clean; 정상 차이인 `Log/20261016_A2V1_CLOSED_before_A2V2_I1.md` 기록 추가와 이 `HANDOFF.md` 발행만 제품 기준 부모 이후에 허용. `ShiftMgmt_V4/**` 변경 0이어야 착수.
- Local original `C:\Projects\Active\ShiftMgmt_V4`: 기존 미커밋 12 경로 보존, **읽기 전용**. 원본 계약 `C:\Projects\Active\교대근무관리 시스템`, `ShiftMgmt_V3.4`도 **읽기 전용**.
- **판정 범위:** I1 제출은 A2 v2 전체 구현/수용이 아님. A1 과거 ACCEPTED, A2 v1 CLOSED/FAILED, 전체 A/B87 미수용을 유지.

---

## 회신 요청

**누가:** Gemini  
**어디에:** 이 파일 맨 아래 `## 회신`에만 작성  
**무엇을:** 변경 코드, 실제 diff/테스트/원 SHA·PID/RC/시각, 실패 또는 차단 여부  
**언제:** 범위·SHA·경로·의존성·검증 환경 충돌 시 수정 전 `BLOCKED`; 정상이라면 아래 I1 구현과 실측 뒤 제출  
**회신 없으면:** Sol 검토 및 후속 A2 v2 I2 착수 불가.

## 1. 단일 목표

기존 2개 검증기에서 (R-I1-09) Windows junction 경로로 직접 호출했을 때 CLI 진입 검문을 건너뛰어 RC0이 되는 문제와 (R-I1-07) 성공한 `waitForStart`/`waitForComplete` 후 타이머가 살아 있고 시나리오 실패 시 held route가 남는 문제를 **실제 함수 동작 기준으로 해결**한다.

이번 범위는 A2V1-09/A2V1-07 두 결함군뿐이다. 둘 모두 정상 owner↔IPC 및 Playwright 경로의 기존 의미를 보존해야 한다.

## 2. 명시적 비목표

- 나머지 9개 A2 v1 결함(A2V1-01~06,08,10,11), 원 112벡터 전체, 기존 B87·UI 기능 완성 **처리하지 않음**.
- owner `access-history.mjs`, shared `access-history-shared.mjs`, `scripts/lib/ui-check.mjs`, `src/`, 데이터·API·DB·승인/계산·환경 정책, V3.4 수정 불가.
- 정상 8개를 `PASS` 처리하거나 `FAIL_INCOMPLETE`를 `FAIL`로 위장하지 않음. 전체 수용은 Sol 재판정.
- 원본 legacy 제품의 파일 overlay 및 실제 18741 서버/브라우저 실행 **이번 패킷에서 금지**. 다른 프로세스 또는 포트 사용에 간섭 금지.
- 해당 2파일 이외 새 테스트/스크립트/의존성/CI 파일을 **저장소에 추가하지 않음**. 실험용 스크립트가 필요하면 저장소 밖 새로운 scratch 경로에만 생성하고 원문을 회신 증거로 보존.

## 3. 코드 원본 및 직전 결함 증거

정본 A2 미수용 소스: `2f51c11710f46c75a49f5715cc68d4752b53f8ca`. 새 개발 브랜치는 동일 제품 소스에서 출발함.

| 파일 | 기준 bytes | 전체 SHA-256 | 이번 허용 심볼 |
|---|---:|---|---|
| `ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs` | 22,530 | `77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01` | 직접 CLI 진입 guard (기준 24행), `stale-response` held route 호출 및 해당 route 소유 정리(기준 300~342행) |
| `ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs` | 27,848 | `F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6` | `NormalHeldRouteController` (101~139행), CLI guard (388행), `errors` held route 소유 정리(518~570행) |

추가 보호 기준:
- `access-history.mjs` 29,351B / `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` — 무변경.
- `access-history-shared.mjs` 29,973B / `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` — 무변경.
- shared frozen 6,575B / `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` — 무변경.
- 각 허용 파일 최종 30,000B 이하. 인코딩과 LF 줄바꿈 불변, 제품 경로 외 내용 변경 없음.
- 정본 반려 근거: `.ai/reports/phase3-2c-a2-v1-review-20261014_131126/findings.json`의 A2V1-07, A2V1-09.
- `.ai/contracts/phase3-2c-a2-v1/negative-vectors.json`의 A-N03/A-N04는 **Junction 실제 우회 시험과 구별**. 본 구현은 112 전수 증거를 대체하지 않음.

### 이미 확인한 현재 결함

- positive/negative의 `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])` lexical 비교는 junction을 통해 direct 실행될 경우 `false`가 되어 전체 CLI guard를 건너뛰고 RC0로 종료할 수 있다.
- `NormalHeldRouteController.waitForStart/waitForComplete`의 `Promise.race`에서 `setTimeout` 핸들을 만들지만 성공해도 clear하지 않는다.
- `stale-response`와 `errors` 시나리오는 `heldController.release()/waitForComplete()`를 happy-path에서만 호출하며 그 전에 click/assert/route가 실패할 때 pending route를 명시적으로 abort/release/unroute하지 않는다.

## 4. 변경 경계 (닫힌 목록)

| 경로 | 요구사항 ID | 변경 허용 | 금지 |
|---|---|---|---|
| `ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs` | R-I1-09, R-I1-07 | direct guard canonical realpath; `stale-response` held 구간의 idempotent finally 정리 | 다른 시나리오 assertion/fixture/캡처/요청 관측 수정 |
| `ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs` | R-I1-09, R-I1-07 | direct guard canonical realpath; NormalHeldRouteController의 타이머/abort; `errors` held 구간 finally 정리 | reader, raw publisher, auth, IPC, CLI private case 목록, 기존 assertion 의미 변경 |

**보호:** 나머지 모든 tracked 제품 경로, root TODO/AGENTS/GEMINI/PROTOCOL/CLAUDE, `.ai/**`, `Log/**`, 원본 `HANDOFF.md`의 `## 회신` 위 본문, 예전 계약 파일. `## 회신`만 Gemini가 작성할 수 있음.

## 5. Sol 코드 전략 (순서 고정)

### 5.1 R-I1-09: canonical path CLI guard (positive, negative)

1. 기존 import `fs`, `path`, `fileURLToPath`를 재사용한다. 신규 패키지 불필요.
2. `process.argv[1]`이 지정된 경우 main script 여부를 비교할 때 **두 경로 모두 `fs.realpathSync`를 적용**: `fs.realpathSync(fileURLToPath(import.meta.url))` vs `fs.realpathSync(path.resolve(process.argv[1]))`.
3. Windows junction·기본 경로 모두 같은 실제 JS 파일이면 `true`; import-only(다른 entry script)가 실제로 이 모듈을 가져왔을 때는 `false`가 되어 top-level worker 실행이 발생하지 않아야 함.
4. realpath 오류(경로/접근 불가)를 `false`로 삼켜 **RC0로 조용히 빠지지 말 것**. 실제 CLI 진입 중 오류는 실패 종료·오류 자료를 내야 한다. `process.argv[1]`이 비어 있는 import-only 상태의 정상 import는 유지한다.
5. 기존 CLI 인수 검문 및 private case 검문/IPC handshake의 순서·기대 반환·A1 오류코드/환경값 변경 금지. fake IPC를 허용하거나 fallback 성공 처리 금지.

### 5.2 R-I1-07: owned timer lifecycle (negative)

1. `waitForStart`, `waitForComplete`의 각 `setTimeout` 핸들을 보유하고, **성공·타임아웃·예외 모두 `finally`에서 `clearTimeout`**. 기존 timeout 조건과 오류 문구는 유지한다. 이전 timer의 reject가 뒤늦게 다른 시나리오에 전파되지 않게 한다.
2. `NormalHeldRouteController`에서 idempotent `release()`를 보장한다. 실패 정리용 `abort()`를 제공해 `_releasePromise`를 깨우며 보유한 route가 `route.abort()`를 실제 수행하게 하고, 완료/실패 transition 및 cleanup error를 구분한다. 이미 성공한 release를 실패 abort로 소급 덮지 않는다.
3. `handle(route)`는 실제 `route.fulfill` 또는 `route.abort` **완료 확인 후** completed를 기록한다. 실패를 완료 성공으로 조작하지 않는다. 모든 성공·실패 경로에서 `waitForComplete` 또는 대체 정리 관측이 끝나며 응답/abort callback 이벤트를 남긴다.
4. 실패한 route cleanup이 새 오류를 내더라도 기존 step/assertion의 **첫 오류를 덮어쓰지 말 것**. 서로 다른 primary 및 cleanup 오류를 구분하는 것은 추후 A2V1-04 범위지만, I1 단계에서도 cleanup 예외를 빈 `catch{}`로 숨기지 않음. 자체 리소스 정리 실패 시 제출 상태는 `FAILED`.
5. 30,000B 조건 때문에 기존 오류 문자열을 제거하거나 테스트를 완화하지 않는다.

### 5.3 R-I1-07: 시나리오 finally (positive/negative)

1. positive의 `stale-response` 분기에서 held route 생성 전/후의 try/finally를 원 소유 구간에 맞춰 설치. 정상 흐름에서는 현재 `release()/waitForComplete()` 결과를 유지한다.
2. 해당 시나리오에서 click, wait, assertion, screenshot 중 예외가 나면 보류된 본인 route를 실제 abort/release하고 `page.unroute` 하여 다음 리소스 정리를 방해하지 않게 한다. 아직 route 미발생 시 완료 promise를 무작정 기다리거나 timeout을 성공으로 꾸미지 말 것.
3. negative의 `errors` 분기에도 동일 소유권 보호를 적용. 원 `DATABASE_ERROR` 응답 내용, error fixture 및 최종 캡처 이름 불변.
4. 미완료 request/HTTP status를 200으로 가공하는 현 과거 결함(A2V1-02)은 **본 패킷에서 수정하지 않음**. 해당 결함이 남으므로 I1 성공을 전체 A2 정상 통과로 보고하지 않는다.
5. `NormalHeldRouteController`는 positive와 negative가 공유해 쓰되, frozen shared의 `HeldRouteController`로 교체하거나 그 코드를 변경하지 않는다.

## 6. 검증: 단계별 실제 명령/기대 종료

### 6.1 작업 시작

PowerShell (사용자 제공 현재 clone 폴더):

```powershell
$Root = 'C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
$P = Join-Path $Root 'ShiftMgmt_V4'
git -C $Root fetch origin
git -C $Root pull --ff-only
git -C $Root branch --show-current
git -C $Root rev-parse HEAD
git -C $Root status --porcelain=v1
git -C $Root config --local --get core.autocrlf
```

위 전체 HEAD가 **사용자 중계 메시지의 발행 커밋**과 일치해야 하고, 제품 기준 부모 `fa9b63744e9b4c21c38fab5c57974c73368c7fea` 이후 제품 4개 변경은 없어야 한다. clean/false가 아니면 `BLOCKED`.

### 6.2 변경 후 필수 정적 검사

제품 루트 `$P`에서:

```powershell
node --check (Join-Path $P 'scripts/ui-checks/access-history-positive.mjs')
node --check (Join-Path $P 'scripts/ui-checks/access-history-negative.mjs')
git -C $Root diff --check
git -C $Root diff --name-only
Get-Item (Join-Path $P 'scripts/ui-checks/access-history-positive.mjs'), (Join-Path $P 'scripts/ui-checks/access-history-negative.mjs') | Select-Object FullName,Length
```

기대: 두 node syntax RC0, git diff --check RC0, 코드 변경 파일 2개만(회신 기록 변경은 별도), 각 파일 30,000B 이하. 원 owner/shared 및 contract/lock/control SHA unchanged.

### 6.3 별도 새 clone 안의 직접 실행 부정 시험

- **실제 Node 런타임에 Playwright가 import 가능한 환경일 때만** 원격 clone `$P` 제품 cwd에서 수행. 의존성 미설치라면 lockfile을 변경하지 않는 `npm ci --no-audit --no-fund`를 **이 새 clone 제품 경로에서만** 허용한다. 설치 후 package.json/package-lock.json SHA 및 git diff 불변, 새 의존성 버전 업 금지. 설치가 실패하면 `BLOCKED_RUNTIME`으로 보고하고 제품 원본 폴더를 사용해 우회하지 말 것.
- `node <positive script> --case=live-admin`, `node <negative script> --case=errors`를 **일반 직접경로 및 외부 전용 스크래치 아래 Windows junction 별칭**에서 각각 실행. owner IPC 없이 수행하므로 정상이라면 모두 비영(非0) RC, stdout PASS0, bootstrap read/browser/HTTP0. 각각 실제 실행 PID/UTC start/end/RC/stdout/stderr 원 SHA 기록.
- junction은 **자기 전용 새 scratch만** 만들고 `ShiftMgmt_V4/scripts/ui-checks`를 target으로 링크. 기존 디렉터리/junction 제거 금지; 정리 시 만든 alias만 대상으로 한다. PowerShell/Junction 명령이 권한 문제로 실패하면 `UNVERIFIED`로 보고하고 fake success 금지.
- `node --input-type=module`를 사용한 별도 scratch-only test에서 negative 모듈을 import해 `NormalHeldRouteController` 실함수를 호출한다: (a) start→release→fulfill→complete 후 registered timers 0, (b) timeout rejection 후 registered timers 0, (c) mid-failure abort 시 owned `route.abort` 실제 호출 1회, completion settlement 1회, (d) 정상 release 후 중복 abort/callback 0. test 구현은 저장소 밖에 보존하고 원 소스 SHA 및 raw 출력·RC를 함께 남김.
- 인수 거절 `A-N03/A-N04` 전체 증빙, 8 normal live UI, 112 원 fault 모두 이번에는 **미실행/미수용**. `node --check`를 A1/A2 PASS로 승격 금지.

### 6.4 원본 환경을 건드리는 시험 금지

- `C:\Projects\Active\ShiftMgmt_V4`의 4파일 overlay·빌드·서버·Chrome UI/18741 테스트를 **이번 구현 패킷에서는 절대 실행하지 않는다**. `WORKSPACE_VALIDATION_PROTOCOL.md`에는 향후 별도 승인/rollback 가드만 설계되어 있다.
- 기존 historical A1 `contract-core`, regressions, 8 normal과 full 112 음성 실측은 **UNVERIFIED**로 남기고 별도의 승인된 검증 단계에 전달한다.

## 7. 완료 범위/즉시 중단 조건

완료란 **I1 두 결함의 코드 수정 및 격리된 정적·부정/selftest 증거 제출**이다. *전체 A2 acceptance 아님*.

즉시 `BLOCKED` 또는 `FAILED`로 반환:
- 발행 후 원격 branch HEAD가 중계 값과 다르거나 제품 파일 해시·크기가 시작 기준과 다름.
- 2개 허용 제품 파일 외 변경이 불가피/의존성 lock 변동.
- direct CLI import-only vs realpath 충돌 또는 junction realpath가 실제 file canonical과 다르게 해석되어 우회가 계속 재현됨.
- held route 실패 정리가 timeout/누락/타프로세스 개입 없이 보장 불가능.
- 30,000B 초과나 shared frozen/A1 보호 값 변경 없이는 개선 불가능.
- 각 실제 검사 RC 미수집 또는 runtime 미설치를 PASS로 표기할 필요가 생김.
- 원본 legacy 폴더를 덮거나 main/A2 v1 branch merge/reset/stash/force-push가 필요함.

## 8. 제출/Push

- 개발 clone 내 두 파일만 수정, `HANDOFF.md`는 맨 아래 `## 회신`에만 작성.
- 최소 자가 검사가 실제로 가능하면 구현 커밋은 **이 구현 브랜치에만** 허용. 추가 GitHub branch 생성/merge/main 변경 금지.
- `git push origin work/phase3-2c-a2-v2-implementation`는 실제 변경 파일과 증거를 확인하고 I1 범위만 유지될 때 허용; Push 실패시 강제Push 금지.
- git 초기/최종 HEAD 전체40자, 각 원/변경 SHA-256 전체64자, git diff --stat/name-status, 명령/시간/종료 코드, 어느 항목이 **STATIC_PASS / RUNTIME_PASS / UNVERIFIED / BLOCKED**인지 구분.
- user가 ChatGPT에 회신 전문을 전달하면 Sol이 실제 GitHub diff/계약/수용 경계를 독립 검증한다. Sol 검토 전 `I1_ACCEPTED` 또는 `A2_ACCEPTED` 주장 금지.

---

## 회신

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: <저장소 / branch / 제품 부모 fa9b... / 사용자가 중계한 발행 commit / 실제 최종 commit 40자>
초기 상태: <git status; 4 원 SHA; core.autocrlf; Node, npm>
수정 파일(정확히 2):
- access-history-positive.mjs: R-I1-09 / R-I1-07 변경 근거
- access-history-negative.mjs: R-I1-09 / R-I1-07 변경 근거
범위 밖 제품 변경: 0 | <문제>
정적 검사: <node --check 2개 실제 RC, git diff --check RC, 최종 파일 크기>
CLI 직접실행: <normal/junction 각각 script/argv, 실제 PID/RC, raw 로그 SHA>
Held selftest: <4조건 실제 RC, checked source/실제 fault, 원 로그 SHA>
원본 보호: <owner/shared + 계약 SHA 변화 0; legacy 12 원본 미접촉>
미실행: <A1 gate/UI/정상8/원 negative112 각각 UNVERIFIED>
최종 상태: <git status; 수정/추가 파일; push 결과>
실제 전체 SHA-256: <파일·원 증거만; 추측금지>
미해결/차단: <있으면 리스트>
```
