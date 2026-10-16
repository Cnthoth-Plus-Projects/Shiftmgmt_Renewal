# HANDOFF — A2 v2 I1 CORRECT1: 요청 종료 증거 및 오류 정리

- Task: A2 v2 I1 결함 교정 **1회차** (I1-C01~I1-C04 통합)
- **Action: CORRECT**
- From: Sol / GPT-6 — 설계·독립 검증 및 수용 판단
- To: Gemini — 코드 변경은 아래 닫힌 목록에 한정
- Date: 2026-10-16 KST
- **회신: 필요**
- Repository: `https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal`
- Branch: `work/phase3-2c-a2-v2-implementation`
- Local Git clone root: `C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal`
- 제품 디렉터리: 위 clone의 `ShiftMgmt_V4/`
- **제품 기준 커밋:** `0131a9366cf985a7d06e53d39033ef08e30a06fd` — 최초 I1 구현 제출, 원본 코드 기준
- **원격 HANDOFF 발행 커밋:** 사용자 중계 메시지에서 정확한 40자 SHA를 확인. 이 파일 발행에 따른 문서-only 추가 커밋이 제품 기준보다 앞설 수 있으므로 GitHub clone의 원격 HEAD가 중계 SHA와 동일할 때만 fast-forward pull 후 시작.
- 기대 초기 Git status: **Clean**, `core.autocrlf=false`. 기준 제품 SHA가 아래와 다르면 코드 수정 없이 BLOCKED.
- 과거 원본 `C:\Projects\Active\ShiftMgmt_V4`, `교대근무관리 시스템`, `ShiftMgmt_V3.4`: 모두 읽기 전용 / 12개 기존 dirty 파일 보존.
- **정본 독립 검토:** `.ai/work/phase3-2c-a2-v2/I1_INDEPENDENT_REVIEW_20261016.md` (Sol 작성)
- 이 교정은 A2 I1 일부 수정이며, A1 historical accepted / A2 v1 failed / 전체 A2 v2 및 B87 미수용을 유지.

---

## 회신 요구

누가: Gemini. 어디에: 본 문서 맨 아래 `## 회신`만 채움. 언제: 충돌/용량 부족/검증 불가 시 즉시 BLOCKED, 구현 가능한 경우 4개 stable defect 항목과 실행 원자료/정확한 명령 RC/최종 SHA/변경경로를 모두 보고. 회신이 없으면 Sol 다음 단계 중단.

## 1. 수정 목표 및 비목표

이번 교정에서 신규 기능은 추가하지 않는다. **R-I1-07의 종료 성공·실패 판정을 진실하게 만들고, 기존 첫 오류를 보존하면서, R-I1-09의 실제 거절 이유를 증명**한다. 코드는 기존 `0131a...` I1 결과에서 필요한 부분만 변경.

비목표: 새로운 UI/서버 코드, 원 112벡터 전수 구현/실행, A1 locked contract 재봉인, 8 normal UI 실행, API/DB/급여/승인·B87 수용, 신규 패키지·새 제품 테스트 파일·CI 변경.

## 2. 결함의 원인과 교정 요구

| ID | 실제 원인 | 필수 교정 및 증거 |
|---|---|---|
| **I1-C01** | `NormalHeldRouteController.handle()`의 `finally`에서 `route.fulfill()/abort()`가 실패해도 `completed=true`; `waitForComplete()`가 성공처럼 반환 | 완료는 실제 Playwright route 동작 await 성공에서만 기록. 실패는 원 Error/실패 outcome과 별도 settled 상태로 전달. 실제 실패한 route에 completed=true 또는 PASS 쓰지 말 것. |
| **I1-C02** | `positive stale-response`와 `negative errors`의 finally에서 `held.abort()`만 신호 보낸 뒤 정리 완료를 await하지 않음. `page.unroute(...).catch(()=>{})`로 cleanup 오류 숨김. `release`는 했지만 fulfill pending이면 abort가 무반응 | started/settled/action 상태를 나눠 실제 owned route callback settle을 deadline 내 await. unroute 오류를 기록하고 실제 오류 발생 시 FAIL; primary와 cleanup 원 stack을 구분. 기존 첫 오류를 cleanup 오류로 덮지 말 것. |
| **I1-C03** | CLI `## 회신`의 **초기 4파일 SHA·bytes**가 원격 정본과 전부 불일치, 특히 보호 owner/shared | 현재 구현 브랜치의 Git blob/source와 checkout 파일의 각각 path·realpath·byte·SHA를 실제 측정해서 출처와 시점 구분. 기존 잘못된 초기 수치를 조용히 바꾸지 말고 오기로 보고. 원본 원격 기준 아래 고정값 적용. |
| **I1-C04** | direct/junction 4개 명령은 RC1·stdout0과 stderr SHA만 제시해 `[IPC] not connected`인지 다른 환경/모듈 오류인지 검증 불가. held selftest 실제 파일/원 stdout도 외부에 없음 | direct/junction stderr **비밀 제거한 내용/오류 타입**, 실제 PID/RC/로그 sha 및 unit test script 원문/해시를 제출. 아래 fault 테스트 5개 추가, 실제 exported helper 호출 확인. |

## 3. 허용 파일, 기준 파일 SHA

제품 **수정 허용 정확히 2개**:

| 파일 | I1 소스 기준 크기/전체 SHA-256 | 허용 영역 |
|---|---|---|
| `ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs` | **23,071B** / `2902D1B0D1D3957D398A73C83EF7A4BAACDE4099F0E57EB75800A09090963A56` | `stale-response`의 owned route try/catch/finally 종료·unroute handling. direct guard는 기존 동작 유지 |
| `ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs` | **29,282B** / `2F6BDDE6628BE8254C86730F1E2C6D78ABEDAAF8E8ADC7034225BE26C43B222D` | `NormalHeldRouteController`의 실패/settle state 및 timer ownership, `errors` 시나리오 try/catch/finally. direct guard는 기존 동작 유지 |

완전 보호, **수정 0**:
- `access-history.mjs` **29,351B / `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7`**.
- `access-history-shared.mjs` **29,973B / `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4`**.
- Shared frozen 6,575B / `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`.
- 모든 `.ai/contracts/`, 루트 `TODO.md`, `PROTOCOL.md`, `AGENTS.md`, `GEMINI.md`, 과거 `Log/`, `src/`, `package.json`, `package-lock.json`, `scripts/lib/`.
- 이 `HANDOFF.md`의 `## 회신` 위 본문도 수정 금지.

두 허용 제품 파일 각각 최종 UTF-8 **≤30,000 bytes**, LF 원 줄바꿈 유지. 현재 negative headroom **718B** — 설계상 작은 변경으로 어렵다면 변경 허용 파일 안에서 기존 미동결 들여쓰기만 국소적으로 정리 가능하나, 계약 문구 단축·assert 삭제·test weakening·새 제품파일 추가 금지. 어려우면 `BLOCKED_SCOPE` 회신. shared frozen 접근 금지.

## 4. 반드시 지킬 코드 전략

### 4.1 Controller의 두 상태를 구별

`NormalHeldRouteController`는 최소 아래 상태를 명시적으로 구분:
- `started`: 실제 route.handle 진입.
- `action`: 아직 선택 전 / fulfill / abort; 하나의 route에 이중 action 금지.
- `completed`: **선택한 Playwright route 작업이 실제 `await route.fulfill()` 또는 `await route.abort()` 성공했을 때만 true**.
- `settled`: callback이 성공·실패 중 어떤 결과로든 종료; `completed=false && settled=true`는 실제 오류 실패/취소의 일부.
- `routeError` 또는 동등 원인: 실제 Playwright callback이 reject한 Error, 첫 stack 유지.
- `_completePromise`는 실패 시 **성공 resolve로 위장하지 말 것**. 실수로 unhandled rejection이 새로 생기지 않도록 **결과(discriminated settlement) resolve 후 `waitForComplete`에서 error 재throw**하거나 동일하게 안전한 방법을 선택. 관측 오류를 잃지 말 것.

`abort()`는 시작 전에 호출되어도 가짜 `completed=true`를 만들지 않는다. 아직 route가 없으면 cancellationRequested/outcome을 구분한다. 시작됐으면 자기가 보유한 route만 abort하도록 release 신호를 깨운다. 이미 `release()`가 선택됐고 `fulfill()`이 진행 중일 때는 임의 두 번째 Playwright API를 던져 무조건 성공 처리하지 말 것. 제한 시간 내 실제 settle을 관측하고, 그 시점에 실패/timeout이면 cleanup 실패로 보고.

`waitForStart()`, `waitForComplete()`의 timer handle은 완료/timeout/오류 전부 finally clear. 기존 timeout 오류 문자열 및 기간 계약 변경 금지.

### 4.2 시나리오-owned try/catch/finally

**positive의 stale-response**는 negative의 `NormalHeldRouteController as HeldRouteController`를 import해서 사용 중이다. **동결 shared의 별도 `HeldRouteController`가 아니다.** import 대상 혼동 금지.

두 시나리오의 실행 단계에서 오류가 나면 먼저 primary Error를 기억하고, 마지막 cleanup은:
1. route가 아예 시작되지 않았다면 불필요한 완료 Promise를 기다리지 않는다. 설치된 own `page.route` handler는 실패 포함 등록·제거 결과 확인.
2. started&&!settled이고 action이 아직 선택되지 않았다면 `abort()`로 owned route만 실제 abort 요청.
3. started&&!settled이고 action=fulfill 등 이미 선택됐다면 `waitForComplete`를 **bounded await** 후 결과 판정; 지연이나 실패를 성공으로 간주 금지.
4. 어떤 경우든 `page.unroute`는 실제 Promise 결과를 관측. `.catch(() => {})` 금지. cleanup 실패는 `state.errors.cleanup` 등에 보존하되, scenario primary의 Error message/stack을 잃지 않는다.
5. primary error 1개 + cleanup error 1개 이상이면 **최초 primary를 최종 throw하고 cleanup 자료는 별도 기록**. 원 primary가 없고 cleanup만 실패했으면 그 cleanup 오류로 FAIL. 원래 완료되지 않은 request를 200으로 조작하지 않으며, 다른 I1 범위 밖 상태 보정도 금지.
6. try/finally에서 시나리오 이후 전체 Playwright browser/context 소유/종료 제어를 바꾸지 않는다.

### 4.3 Junction 진입 guard 증거 (추가 코드 수정 불필요)

기존 `fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))` 코드는 유지. 인수 없이 직접실행, 등록 case 직접실행, Windows owned junction direct, 다른 파일에서 import-only를 분리해 검사. 이 코드 검사에서 실패하면 구현 문제와 실행환경 문제를 분리해 보고.

`loadContract/loadExecution`은 Windows 원본 CRLF 경로를 참조한다. GitHub LF blob과 해시를 직접 같다고 주장 금지; EOL 차이는 `EOL_LOCK_RESOLUTION.md` 기준. 외부 historical 계약 수정 금지.

## 5. 실제 시험 증거 및 기대값

아래 시험은 **새 개발 clone 및 scratch에서만**, original Windows `C:\Projects\Active\ShiftMgmt_V4` 덮어쓰기 없이 수행.

### 착수 조건

PowerShell:
```powershell
$Root = 'C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
$Product = Join-Path $Root 'ShiftMgmt_V4'
git -C $Root fetch origin
git -C $Root branch --show-current
git -C $Root rev-parse HEAD
git -C $Root status --porcelain=v1
git -C $Root config --local --get core.autocrlf
```

expected branch = `work/phase3-2c-a2-v2-implementation`; 원격 현재 HEAD가 **사용자 중계 SHA와 정확히 일치**하며 initial clean이면 `git -C $Root pull --ff-only`, 이후 clean, 4 기준 SHA. 예상과 다르면 중단하고 값 그대로 회신. `git reset --hard`, `clean`, `stash`, `force push`, 기타 브랜치 checkout 금지.

### 정적 검사

```powershell
node --check (Join-Path $Product 'scripts/ui-checks/access-history-positive.mjs')
node --check (Join-Path $Product 'scripts/ui-checks/access-history-negative.mjs')
git -C $Root diff --check
git -C $Root diff --name-only
```

expected RC0; 두 개 source만 diff, 두 파일 최종 ≤30,000B, owner/shared SHA 전후 같음. `node --check`는 runtime PASS가 아님.

### 실제 exported-helper 자가 시험 (저장소 밖 scratch)

`C:\Projects\Active\_a2_v2_scratch\`의 별도 새 파일과 로그를 사용해 **실제 negative.mjs의 export된 class**를 import. 기존 첫 selftest 4조건과 추가 다섯 결함 시나리오 모두 시행:

- **T1 success:** start→release→실제 stub `route.fulfill` await→completed true; timer0; fulfill 1.
- **T2 timeout:** wait start/complete timeout reject; timer0, 늦은 가짜 성공 없음.
- **T3 abort:** start→abort→실제 stub `route.abort` await→completed true, abort 1, 중복0.
- **T4 fulfill fault:** `route.fulfill`이 harmless sentinel Error를 실제 throw → `completed=false`, `settled=true`, waiter FAIL, 원 sentinel/stack 보존.
- **T5 abort fault:** `route.abort` throw → `completed=false`, waiter FAIL, 원 오류 보존.
- **T6 primary + cleanup:** scenario primary Error를 고의 발생시킨 다음 own abort 오류도 발생 → 최종 primary Error/stack 유지, cleanup 오류는 별도 증거.
- **T7 released but pending:** release 후 `route.fulfill` Promise를 의도적으로 pending → bounded wait가 timeout/FAIL, completed=false; 외부 임시 deferred를 finally resolve해서 own task hang 방지.
- **T8 before-start:** route 시작 전 abort가 실제 route 완료 성공을 위조하지 않고, timer 누수/미해결 타이머 0.
- **T9 unroute fault:** harmless stub `page.unroute` throw → cleanup 결과가 FAIL/원 stack·오류 기록. 단순 catch swallowed 금지.

각 T에는 source SHA+actually invoked source export+test PID+RC+raw stdout/stderr byte SHA+event counts+관측 outcome 기록. JS test 스크립트 원문/전체 SHA를 보고하여 Sol 재검증 가능하도록 함. 위 T5~T9가 조건상 새 helper를 쓰는 경우도 **제품 모듈 함수를 실제 import해 호출**해야 함. 코드와 무관한 자체 장난감 클래스 시험은 인정하지 않음.

### CLI guard 시험

- direct positive/negative와 Windows scratch-only junction positive/negative 각 1회, 필요시 import-only 1회. 각 **실제 Node worker**의 argv·PID·시작/종료 시간·RC·raw stdout/stderr bytes/SHA와, 비밀값 제거한 정확한 오류 타입/원 메시지/문제 파일을 기록.
- 정상 direct/junction은 `RC=1`, `stdout=0B`, 실패가 **`[IPC] not connected` 등 인증된 direct worker가 도달하는 IPC preflight 경로 때문**임이 관측되어야 함. Module not found, lock mismatch, syntax error, missing Playwright 등으로 RC1이면 `BLOCKED_RUNTIME`, 진입 guard PASS 금지.
- original direct 및 junction의 오류 원인 일치 여부를 검사. 단순 RC1/로그 SHA만으로 PASS 선언하지 않는다.

**이번에 실행하지 않는 항목:** original locked A1 contract-core, 실제 Windows 18741 서버/Chrome UI, 정상 8개, negative112 전수 → 각각 `UNVERIFIED`. 실행 안 한 것을 PASS로 표기 금지.

## 6. 회귀 및 STOP

- 과거 Windows 제품 12 dirty 경로·계약은 변경 0. 테스트 목적이라도 원본에 candidate 4파일 임시 덮어쓰기/빌드/서버 실행 불가.
- 새 source/테스트/패키지 파일을 제품 repository에 생성 금지, 외부 scratch만 허용.
- 기존 normal raw/publisher/reader/observer·예상 판정·fullUi·capture/fixture 등 I1 관련 없는 코드 리팩터 금지.
- 용량 제한, 초기 SHA, protected shared frozen, GitHub remote SHA, dependency/Node/Playwright, cleanup 소유권 중 하나라도 충돌하면 손대지 않고 `BLOCKED`.
- 어떤 route 실제 오류도 `completed=true`로 위장해서는 안 되고, 실패한 `unroute`도 조용히 삼키면 안 됨.
- 이 작업은 I1 첫 **CORRECT 1회**. Sol 독립 수용 전 `I1_ACCEPTED`, `A2_ACCEPTED` 선언 금지.

## 7. 커밋·Push와 결과 양식

- 변경은 source 2개 + 본 `HANDOFF.md`의 `## 회신` 칸만.
- 본문 변경, 다른 .ai 또는 Log 변경 금지. 완료 시 이 구현 브랜치에만 커밋/일반 push 허가 (자동 merge·force push 금지).
- 제출: 제품 부모 `0131a936...`, 발행 HEAD 40자, 결과 HEAD 40자, 전체 변경 경로, 실제 파일 before/after 64자 SHA, 2개 크기, owner/shared SHA, node syntax RC, 9자체 테스트 원자료/실패 주입 증거, direct/junction stderr 내용, 미실행 항목, 초기 보고서 SHA 기재 불일치에 대한 사실만 명시한 수정 설명.
- 추가로 긴 원자료는 저장소 밖 scratch에 보관; 사용자에게 비밀값/자격증명/운영 DB 내용을 공유하지 않음.

---

## 회신

```text
판정: CORRECTED | BLOCKED | FAILED
기준: <GitHub/branch/제품 부모 full SHA/발행 full SHA/수정 full SHA>
초기 상태: <git status/원 source 4개 actual bytes+full SHA; LF config>
결함 I1-C01: <원인 -> 변경 심볼 -> T4/T5 실측>
결함 I1-C02: <primary/cleanup error 처리 -> T6/T7/T8/T9 실측>
결함 I1-C03: <이전 잘못된 initial SHA/bytes 사실관계와 이번 raw 측정/출처>
결함 I1-C04: <4 direct/junction 오류 실제 내용·PID/RC/log SHA; T1~T9 스크립트 원자료>
변경 제품 파일: positive/negative 2개만
범위 밖 제품 변경: 0 | <문제>
파일별 최종 bytes/SHA: <전체 64자>
보호 owner/shared/frozen/contract: <불변 실제 재검문>
node --check 2개 RC / git diff --check RC:
자가시험 T1~T9: <실제 호출·expected·observed·실패 신호·source>
Junction CLI direct 4회: <argv,PID,RC,stdout/stderr SHA, redacted stderr message>
UI/A1/8normal/negative112: UNVERIFIED
최종 HEAD/Push/Working tree status: <전체 값>
미해결/차단: <사실만>
```
