# HANDOFF — Phase3-2c A1 실행 전략 v3

- Task: 검증기 실제 관측·종료·gate 판정 결합을 구현하여 A1의 허위 성공을 차단한다.
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-10-12 11:40:59 KST
- 상태: READY_TO_CODE / 사용자 수동 중계 대기
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `160940f9aaeb6696538447f83b44658073e382f0`
- Expected initial status: 아래 정확한12경로. 기존 사용자 변경을 보존한다.

```text
 M docs/codebase-map.md
 M scripts/copy-web-assets.mjs
 M src/web/index.html
 M src/web/screens/shell.ts
?? scripts/ui-checks/access-history-negative.mjs
?? scripts/ui-checks/access-history-positive.mjs
?? scripts/ui-checks/access-history-shared.mjs
?? scripts/ui-checks/access-history.mjs
?? src/web/access-history.css
?? src/web/screens/access-history-model.test.ts
?? src/web/screens/access-history-model.ts
?? src/web/screens/access-history.ts
```

# 회신 요청

누가: Gemini. 어디에: 이 파일 맨 아래 `## 회신` 칸만. 언제: 착수 게이트 충돌이면 수정 없이 즉시 BLOCKED, 그 외 구현·검증 후. 회신 없으면 Sol 검수와 다음 단계가 중단된다. 본문·TODO·정본·Log를 수정하지 않는다.

## 1. 목표

원본 CORE-01~09와 보호 shell/home 회귀가 실측 증거·실제 child/log 종료·고정 외부 Python 판정을 모두 만족한 경우에만 owner가 단일 PASS를 게시하게 한다. 오류 주입은 정확한 원인/사건/첫 오류를 확인한 FAIL이어야 한다.

## 2. 비목표

- A2 정상8 로그인/legacy collector/남은 A-N01~20 구현, B 전체UI87/전체3-2 수용, 배포와 커밋.
- UI·모델·API·권한·DB·의존성·빌드 설정·새 제품 파일 변경. 보호 회귀 runner의 재작성.
- 같은 R32C-06의 CORRECT3 또는 재제출 회수 초기화.

## 3. 현재 상태와 근거

TODO의 최신 상태는 A1 v3 IMPLEMENT 준비다. 기존 A1_NOT_ACCEPTED 판정은 유지한다. Oct2 제출은 Sol preload의 append 재귀 때문에 일부 검증이 막혔고, Sol이 결함을 재현해 인정했다. 검수 복사본의 기존24 fault가 통과해도 원 구현은 gate case 변조에 RC0/PASS, wrong ACK에서 worker close보다 temp 삭제가4,917ms 빠른 동작, 부정 raw 수용/가변 checks, viewport/origin/requestcount 상수, 생성 전 created, 미관측 log finish, partial 누락을 보였다.

추적 ID: A1T01 observer 재귀, A1T02 건강하지 않은 rc1 수용, A1F01 gate 전체 응답 미결합, A1F02 정리 순서, A1F03 실제 관측/자원, A1F04 collector, A1F05 log finish, A1F06 partial/primary, A1F07 hash/privateCLI. 원 실패 근거 `.ai/reports/phase3-2c-a1-review-20261002_103904/final-evidence.json` 및 Oct2 종결 Log. R32C-06 두 CORRECT 소진/초기화0 이력을 보존한다. 이번은 새 실행 전략 IMPLEMENT다.

실제 source341/main/HEAD/status12는 Oct2 검수본과 전부 동일하다. Sol은 이번에 제품 코드를 변경하지 않았다. 제어 도구의 실제35 시험·기록 변조9 거절 및 parser/구문은 확인했다. 이것은 새 구현 합격 증거가 아니다. received HANDOFF는 변경 전에 `C:\Projects\Active\교대근무관리 시스템\Log\20261012_110625_3-2c-A1-Sol-REPLAN_수신검수결과보존본.md`에 19905 bytes/SHA `F437B387C5F8F0EA33EBCF0BF4C1FE9558F33FDBE31F86348358572953311007` 그대로 보존했고 byte 일치를 확인했다.

잠금 정본 폴더: `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v3`. 전체339 보호제품/최초341파일 SHA는 `baseline.json`에 있다. 아래는 각 파일의 실측 전체 SHA다. 각 제어 파일은 Gemini 읽기 전용이다.

| 제어 파일 | bytes | SHA-256 |
|---|---:|---|
| `baseline.json` | 68576 | `8E24BC378E4FCA093A36AB902F04C92BD09567B78F7995AA030A60B5634C22E6` |
| `component-probes.mjs` | 6384 | `7A5C242D0EE6429743D38D923ACF053D6D746D43EF889D9AB9B40942691942EC` |
| `execution.json` | 5092 | `B2D297394AF8FA7C3D2C72A881B2BD4F713032DB48E905058C9E6257658AE86C` |
| `frozen-shared.json` | 7433 | `5EEC6E933B2A555D42CBC31E31FF0A8F8C46239F192011C9FCB7076513C7ECDA` |
| `gate-evidence.py` | 21988 | `0464704230DE376908ADB910F821E3F015870733347A5C749ED2930C734FAA4A` |
| `ipc-probes.mjs` | 13805 | `DCC854B033C134017D1135B5C07FD6DBEE162B4393958B1B0A76400AC1B50F7E` |
| `observer-canary.mjs` | 3307 | `91436F247FD06E4A05936CCBB4A630B44B613ABDEC032C74294F41862EE6E299` |
| `observer-selfcheck.py` | 11866 | `0B5D754F4A61B4004E77F64F84C466109C99E6922DA5DB8BA05E77C287E6EDE0` |
| `runtime-preload.mjs` | 14396 | `B2E4FCA5ABCB47506658786BCA0261359E444437E6D8D7954429DFC8FDAB5A8F` |
| `runtime-probes.py` | 19264 | `41256EBDC133F549B47FC5E80547861722A9446F0AF2C15C7B08173319D53247` |
| `STRATEGY.md` | 14207 | `636B31777C98D75757184A4491E45C8BD9C416C1146539A3051EC34272E1F86C` |

원본 contract: `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\contract.json` / SHA `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE`.
원본 checker: `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\verify-evidence.py` / SHA `24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954`.

## 4. 수정 경계

### 4.1 수정 허용 — 닫힌 두 파일

| 제품 경로 | ID | 허용 변경 | 보호 영역 |
|---|---|---|---|
| scripts/ui-checks/access-history.mjs | E3-01/02/05/06 | lock/owner registry/정리/gate response/실패증거 | 정상8 실행·UI·보호 runner·새파일 금지 |
| scripts/ui-checks/access-history-shared.mjs | E3-01/03/04/06 | header lock/IPC/core collector·관측·정리/privateCLI | frozen 기존 정상8 helper 구간 보존 |

두 파일 각각30,000bytes 이하, 필요한 hunk만 변경. 전체재생성/무관 포맷/이름정리 금지. 두 파일의 초기 실측 SHA:

| 경로 | bytes | SHA-256 |
|---|---:|---|
| `scripts/ui-checks/access-history.mjs` | 28113 | `B8C9351C6C7B8256C4D907BBB8947C29A76DBDAC026105106798C90C9678B7B7` |
| `scripts/ui-checks/access-history-shared.mjs` | 26717 | `81DACB5B8F03BF7AECDA5A497EB63571EA725BA8A5823F2C48F280E20D47A346` |

### 4.2 읽기 전용

다른339 제품파일 전부, V3.4 전부, TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/07-invariants, `.ai/**`, `Log/**`. 기존 dirty12를 revert/삭제/commit하지 않는다. shared frozen fragment는 start `export const CANONICAL_8_ACTIONS =`, end `export async function performWorkerIpcHandshake` 직전, 6,575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`이다. 해당 helper의 알려진 정상8 결함은 A2에 남긴다.

### 4.3 제어 변경과 실행 산출물

HANDOFF의 맨 아래 회신 칸만 작성 가능. 기존 ignored `dist/`는 명시된 build에서 재생성 가능. 자기 `artifacts/captures/phase3/access-history-CASE/run-*`의 증거/partial/로그/PNG, 보호 regression runner의 자기 신규 ignored capture만 생성한다. Sol probe는 OS temp의 `shiftmgmt-sol-a1v3-*`와 자기 IPC probe artifact를 생성하며 그대로 보존한다. 신규 비ignored 파일/소스/테스트/정본 생성 금지. 이미 존재하는 Log/report/temp/artifact/PID/profile은 건드리지 않는다.

## 5. 요구사항 대조

| ID | 기대 결과 | 실패/경계 | 위치/결함 추적 |
|---|---|---|---|
| E3-01 | 원문 CLI·실제 정본 hash·frozen·port preflight | CLI/lock/port/deferred는 부작용0·정확 code | owner/shared / A1F07,A1T02 |
| E3-02 | 실제 child close→log finish/close→temp 제거 | 모든실패에서도 자기 child 종료, 관측없으면 temp보존 | owner registry / A1F02,A1F05 |
| E3-03 | DOM/route/실제Chrome/compiled map 및 immutable typed CORE9 | 부정 raw·중복자원·unknown/NaN 거절, partial 첫 오류 유지 | shared / A1F03,A1F04,A1F06 |
| E3-04 | protocol2 context/ACK/RUN 엄밀 검문 | field별12거절+noRUN/wrongRUN, HTTP/Chrome/파일쓰기0 | shared / A1F07 |
| E3-05 | 고정 Python의 실제 전체 응답과 candidate SHA 결합 | gate 응답10변조/rc/error/로그/finalwrite는 FAIL | owner / A1F01,A1F05 |
| E3-06 | 단일 terminal receipt와 actual partial primary stack | generic rc1/비건강 observer/partial유실은 수용불가 | owner/shared / A1F06,A1T01~02 |

## 6. Sol의 코드 전략 — 아래 순서대로 구현

기존 `loadContract/loadExecution`, owner runner/child 관리, shared frozen 구간 뒤 helper를 재사용한다. 보호 `scripts/ui-checks/shell.mjs`, `home.mjs --case=live-admin`, `scripts/lib/find-chrome.mjs`, 기존 createUniqueRunDir 호출을 유지한다. 데이터 정본은 원본v1 contract/rules·compiled accessLogActionLabels·v3 execution이다.

owner BASELINE/GATE와 shared EXECUTION 상수 경로를 v3로 바꾼다. BASELINE_SHA256=`8E24BC378E4FCA093A36AB902F04C92BD09567B78F7995AA030A60B5634C22E6`, GATE_SHA256=`0464704230DE376908ADB910F821E3F015870733347A5C749ED2930C734FAA4A`, EXECUTION_SHA256=`B2D297394AF8FA7C3D2C72A881B2BD4F713032DB48E905058C9E6257658AE86C`. Python 절대경로는 `C:\Users\pangyo\anaconda3\python.exe`. source 안에 fault별 조건을 넣지 않는다. 최소 수정으로 기존 중복 child정리 부분을 한 등록부에 모은다.

### E3-01: 진입 검문과 잠금

owner의 공개 CLI는 정확히 인수 하나 `--case=<execution.publicCases의 원문 case>`다. trim, 별칭, URL/추가 인수, 중복 case 금지. shared 직접 CLI는 정확히 `--case=contract-core` 하나다. 잘못된 입력은 먼저 A1_CLI_INVALID, 부작용 없이 종료한다. 정상8은 A1_DEFERRED/BLOCKED_STAGE로 종료한다.

유효하고 enabled인 입력은 run 생성 전에 CONTRACT, EXECUTION, BASELINE, GATE의 실제 bytes/SHA와 잠금 JSON, frozen-shared 파일 및 실제 fragment를 확인한다. 경로·버전·repository·allowlist·slice가 다르면 A1_LOCK_MISMATCH. 원본 v1 checker hash도 확인한다. 상수 export만 만들고 확인을 생략하지 않는다. baseline control 항목은 read-only 파일 해시로 확인하되 허용 두 제품 파일의 baseline SHA는 구현 뒤 같을 수 없으므로 강제하지 않는다. 보호339 파일은 baseline SHA를 유지한다. preflight를 위해 외부 프로그램·앱·Chrome을 시작하지 않는다.

실제 18741 점유 확인 후에만 owner run과 isolated temp를 만든다. 기존 listener를 사용하거나 닫지 않는다. 점유면 A1_PORT_BUSY, temp/spawn/request/log 생성 없음. 세 case만 enabled: contract-core/regression-shell/regression-home. 모든 Sol_주입 환경과 NODE_OPTIONS는 child env에서 제외하며 제품 코드에서 SOL_A1_PROBE 등의 fault 이름을 읽지 않는다.

### E3-02: 하나의 owner 자원 등록부

owner 내부의 기존 child 관리 부분을 하나의 등록부로 통합한다. 생성 성공 뒤에만 레코드를 등록하며 server, core worker, 보호 regression worker, Python adjudicator에 동일 규칙을 적용한다. 각 레코드는 실제 child handle/PID, created/exit/close 시각, signal/code, 두 log stream의 finish/close/error 및 시각을 보존한다. spawn 직후 error/exit/close와 log error/finish/close listener를 먼저 붙인다. 성공 flags와 시간이 기본 true/현재시각으로 채워지면 안 된다.

`child.exit`와 `child.close`는 별개다. `close`가 관측되기 전에는 stdout/stderr log `.end()` 또는 temp 삭제를 하지 않는다. close 이후 pipe 입력이 더 없음을 확인하고 `.end()`한다. 각 log에 실제 finish와 close가 모두 필요하다. stream error이면 actual close까지 기다리고 A1_LOG_WRITE_FAILED로 실패한다. finish 누락은 5초 후 A1_LOG_FINISH_UNVERIFIED다. finish 직후 도착한 error도 수집하여 seal 전/최종 publish 직전 오류 없음으로 다시 확인한다. Promise resolve가 listener 해제를 의미해서는 안 된다.

정리 순서: 작업 자식 중단 요청 → 자기 handle의 graceful 5초/forced 5초 → 실제 close 확인 → 모든 log finish 또는 error 및 close 확인 → 자기 temp만 삭제 → sealed candidate → Python gate → gate 실제 close/log finish/close → atomic final → 단일 PASS. wrong ACK/no ACK/no RUN/spawn 실패/로그 실패에서도 동일 정리를 수행한다. close 관측이 없으면 A1_CLOSE_UNVERIFIED와 temp 보존. log finish 관측이 없으면 temp 보존. 이미 실제 close된 child에 불필요한 kill을 호출하지 않는다. foreign PID, 역사적 temp, 기존 Chrome profile, listener를 종료하지 않는다.

생성에 실패하여 PID 없는 child는 actual error+close를 보존하고 그 child의 로그도 정리한다. spawn 실패에 exit 증거를 창작하지 않는다. 실패 분기에는 성공 candidate를 만들지 않는다. 첫 오류를 primary로 고정하고 뒤 정리/evidence/unexpected 오류는 별도 배열에 추가한다.

### E3-03: 실제 core 관측과 닫힌 collector

shared의 frozen 구간 뒤에 있는 `collectCoreChecks`, `settleOwnedResources`, core 실행, IPC, 직접 CLI만 수정한다. CORE-01~09 조건과 expected는 원본 contract.foundation.rules에서 온다. caller expected/unknown field/추가 인수를 받지 않는다. 반환 체크는 정확히 `{id,sourceArtifact:'core-observations',pointer,actual}`이며 raw의 실제 pointer 값을 deep clone하고 배열·객체 전체를 deep freeze한다. finite tree를 재귀 검증하고 NaN/Infinity/boolean 시각, unknown/누락 필드를 거절한다.

정상 raw의 최상위 key는 viewport, origin, loginInputs, fixtureLabels, canonicalLabels, fixtureRequestCount, rawErrors, chrome, resources, captureId다. 기존 v1 각 pointer의 typed schema와 정확한 field 집합을 유지한다. collector는 path 존재만으로 Chrome을 인정하지 않는다. 보호 `scripts/lib/find-chrome.mjs`가 반환한 실제 executable/version과 비교하고 browser.version() 실측도 보존한다. package.json 같은 임의 파일 또는 비정상 버전은 거절한다.

viewport는 page.viewportSize(), origin은 실제 page URL/DOM location에서 얻는다. loginInputs는 실제 #login-id와 #login-password DOM 각각의 count/visible을 측정하여 정확히 `{id:{count,visible},password:{count,visible}}`만 기록한다. 원본 CORE-03 밖의 새 속성을 추가하지 않는다. fixtureLabels는 실제 fixture route 응답에 넣은 배열, canonicalLabels는 실제 compiled domain bytes/SHA/완전한 labels map이다. fixtureRequestCount는 route handler가 실제 받은 요청 수다. 준비됐다는 이유로 0을 넣지 않는다. captureId는 실제 PNG 작성 후만 참조하고 1440x900은 PNG/DOM에서 검증한다. console/pageerror/requestfailed/HTTP 오류를 전부 rawErrors에 수집하며 문자열 401 포함 등으로 광역 무시하지 않는다.

browser launch 성공 뒤 browser-created, context 생성 성공 뒤 context-created를 각각 등록한다. 자원은 kind browser/context 정확히 하나씩, ID 중복 없이 두 개다. 성공 events는 created→close-start→closed, 실제 Date.now() 시각이 단조다. 정상 raw는 자원 close 성공 뒤 고정한다. close throw면 close-error를 partial에 남기고 기존 primary를 유지하면서 다른 자원도 닫는다. created-only ledger, duplicate kind/ID, unknown resource field, 순서 역전은 collector에서 거절한다.

성공 worker-final은 실제 owner context/nonce/PID/checks를 담는다. 실패도 확보한 raw/checks/errors/resources를 core-partial.json에 남기며 이미 실패한 생성의 created/closed를 넣지 않는다. 파일 쓰기 실패 자체를 evidence 배열에 기록하고 최초 오류를 덮어쓰지 않는다.

### E3-04: IPC와 private CLI

기존 IPC protocol2 메시지 모양을 유지한다. context의 ownerPid=process.ppid, workerPid=process.pid, case, nonce, URL, runDir/tempDir/bootstrapFile, contract/execution path/SHA 모두 실제 잠금/자기 경로와 엄밀히 비교한다. sibling run이나 상위 폴더도 허용하지 않는다. invalid packet은 ACK 없이 A1_IPC_REJECTED와 violation을 반환하며 HTTP/Chrome/파일 쓰기 부작용은 없다. violation은 ownerPid/workerPid/case/nonce/url/runDir/tempDir/bootstrapFile/contractPath/contractSha256/executionPath/executionSha256 중 실제 거절한 필드다.

유효 context는 ACK하고 RUN 승인을 5초 안에 받아야 한다. 무승인 A1_RUN_TIMEOUT, 잘못된 RUN nonce A1_RUN_INVALID. raw case를 trim하지 않는다. private terminal 실패는 stdout 비우고 stderr에 한 JSON을 쓴다. 공통 FAIL 모양에 `violation`만 IPC_REJECTED일 때 추가한다. phase는 preflight, runId는 null, case는 contract-core. Node 진단 채널은 제어 도구가 실제 Chrome을 먼저 관측한 뒤 검사한다.

### E3-05: 외부 gate 전체 응답 결합

worker/server close와 실제 log finish/close 및 temp 제거 뒤 READY_FOR_ADJUDICATION owner-candidate.json을 atomic write하고 byte SHA를 고정한다. 현재 v3 gate-evidence.py에 Python의 고정 절대경로로 실제 실행을 요청한다. 실행 인수는 --execution-sha/--baseline-sha/--candidate다. fake gate, in-process 대체, parser selftest 결과 또는 worker verdict를 승인으로 사용하지 않는다.

gate child 자체도 동일 등록부로 actual close/log settlement를 기다린다. stdout는 정확히 JSON 객체 하나, stderr는 비어야 한다. rc=0 외에 아래 전체 객체와 key 집합까지 deep exact 비교한다: outer `{status:'PASS',result}`; result의 status='ACCEPTABLE_CANDIDATE', acceptance='A1_PREREQUISITE_ONLY', case=selectedCase, runId=실제 runDir.name, candidateSha256=sealed bytes hash, executionSha256=잠금 hash, checks=정확한 case 필수개수, artifacts=정확한 case 필수개수. case/runId/hash/count/status/acceptance/extra field/extra JSON 중 하나라도 다르면 A1_GATE_RESPONSE_MISMATCH. stderr가 gate의 실제 거절이면 A1_GATE_REJECTED. gate spawn 실패는 A1_GATE_SPAWN_FAILURE.

최종 owner-final은 candidate 그대로에서 status만 PASS로 바꾸고 adjudication receipt만 추가한다. candidateSha/gatePath/gateSha, gate process actual lifecycle/finish timestamps, stdout/stderr path/bytes SHA를 보존한다. 기존 gate.final()이 normalized final==candidate 및 receipt==actual gate stdout를 독립 확인한다. final write/rename 실패는 A1_FINAL_WRITE_FAILED, 성공 출력 금지. owner는 manifestPath를 포함한 단일 PASS JSON을 stdout에 쓴다.

### E3-06: 첫 실패·partial·터미널 결과

owner FAIL은 rc1, stdout 빈 문자열, stderr 정확히 JSON 한 줄이다. key 집합 `{status:'FAIL',code,phase,case,runId,error:{name,message,stack}}`. preflight에서는 runId=null, CLI invalid case=null; 유효 case의 port/lock 거절은 actual case. run 생성 후에는 runId=runDir.name이며 실제 throw의 name/message/stack과 primary code를 보존한다. multi-line stack은 JSON escape로 담고 별도 stderr stack을 추가하지 않는다. private worker의 IPC_REJECTED만 violation을 추가한다.

deferred는 rc1, stderr 빈 문자열, stdout JSON 한 줄 `{status:'BLOCKED_STAGE',code:'A1_DEFERRED',case,reason:'A2_PENDING',stageSlice:'A1'}`. PASS는 rc0, stdout JSON 한 줄이며 실패 진단을 앞뒤에 섞지 않는다. 관련 앱/worker stdout은 자기 log 파일에 들어간다.

owner run 생성 뒤 모든 실패에서 owner-failure.json을 atomic write한다. status/case/runId/errors.primary에 최소 code/phase/name/message/stack을 남겨 terminal receipt와 동일 first error임을 확인할 수 있어야 한다. 확보된 context, raw/checks, 자식 lifecycle, log 상태, temp 보존/제거 상태 및 cleanup/evidence/unexpected 오류를 모두 남긴다. 실패 원인이 증거 파일 쓰기여도 primary를 바꾸지 말고 가능한 다른 자기 run 파일에 진단을 남긴다. 관측 불능/강제 timeout은 검수에서 UNVERIFIED_STOP이다. generic rc1, empty event, unrelated code, canary PASS가 실제 결함 거절로 인정되지 않는다.



## 7. 적용 불변조건과 과거 함정

CLAUDE/07-invariants의 의미 있는 오류·가짜UI 금지·실제 화면 검증·원본 V3/운영 데이터 보호를 유지한다. production DB/JSON에 테스트 insert 금지. 자기 bootstrap·temp만 쓴다. 실제 Chrome과1440x900, compiled 정본 map, fixture route와 raw 오류를 확인한다. worker verdict/존재만 하는 PNG/상수flags/generic rc1은 증명이 아니다. 전체 SHA는 명령으로 실측한다. 최초 오류를 다음 정리 실패로 덮어쓰지 않는다. 보호 shell/home 원본을 손보거나 expected를 완화하지 않는다.

## 8. 착수 전 확인

저장소/branch/fullHEAD/dirty12, source341 초기 SHA와 allowlist2/frozen fragment, 정본/control 전체 SHA를 확인하고 요구사항/소스/명령의 일관성을 읽는다. v3 baseline의 control 항목은 전부 실측 일치해야 한다. 현재 새 구현 전에는 source341 모두 baseline과 같아야 한다. 구현 뒤에는 허용2만 달라질 수 있다. 필수 Node24/Python/installedChrome/Playwright/npm이 없거나 gate --scope가 실패하면 수정 없이 BLOCKED다.

## 9. 검증 계획 — 제품 저장소에서 PowerShell로 실행

### 9.1 초기화와 범위 검사

```powershell
Set-Location -LiteralPath 'C:\Projects\Active\ShiftMgmt_V4'
$a1Ctrl = 'C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v3'
$a1Py = 'C:\Users\pangyo\anaconda3\python.exe'
$a1ExeSha = 'B2D297394AF8FA7C3D2C72A881B2BD4F713032DB48E905058C9E6257658AE86C'
$a1BaseSha = '8E24BC378E4FCA093A36AB902F04C92BD09567B78F7995AA030A60B5634C22E6'
$env:PYTHONIOENCODING = 'utf-8'
& $a1Py -B "$a1Ctrl\gate-evidence.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha --scope
```

기대rc0/PASS/files341/protected339/dirtyPaths12. 착수전 changedAllowed=[]; 구현뒤 두 허용파일만 바뀌고 보호SHA/control/status/HEAD 불변. 명령마다 `$LASTEXITCODE`와 시각/stdout/stderr를 실제 기록하고 실패면 후속수용을 중단한다.

### 9.2 정적·빌드·관련 시험

| 정확한 명령 | 기대 |
|---|---|
| `node --check scripts/ui-checks/access-history.mjs` | rc0 |
| `node --check scripts/ui-checks/access-history-shared.mjs` | rc0 |
| `npm.cmd run typecheck` | rc0 |
| `npm.cmd run lint` | rc0, 기존5경고만 기록, 신규경고0 |
| `npm.cmd run validate:map` | rc0, 기존90항목 |
| `git diff --check` | rc0 |
| `npm.cmd run build` | rc0, ignored dist만 |
| `npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | rc0, 3파일11시험 |

### 9.3 제어 parser와 실제 런타임

```powershell
& $a1Py -B "$a1Ctrl\gate-evidence.py" --execution-sha $a1ExeSha --self-test
& $a1Py -B "$a1Ctrl\runtime-probes.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha --self-test
$a1RuntimeLines = & $a1Py -B "$a1Ctrl\runtime-probes.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha
$a1RuntimeRc = $LASTEXITCODE
$a1RuntimeLines
if ($a1RuntimeRc -ne 0) { throw 'A1 actual runtime suite failed or UNVERIFIED_STOP' }
$a1RuntimeResult = $a1RuntimeLines[-1] | ConvertFrom-Json
$a1Suite = Get-Content -LiteralPath (Join-Path $a1RuntimeResult.artifact 'suite-result.json') -Raw | ConvertFrom-Json
$a1Core = (($a1Suite.records | Where-Object name -eq 'positive-contract-core').output | ConvertFrom-Json).manifestPath
node "$a1Ctrl\ipc-probes.mjs"
node "$a1Ctrl\component-probes.mjs" --core-manifest $a1Core --execution-sha $a1ExeSha --baseline-sha $a1BaseSha
& $a1Py -B "$a1Ctrl\gate-evidence.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha --scope
```

gate parser는 원본2양성/19거절+추가14거절, runtime parser는 정상입력/10변조+earlytemp/unsettledlog 거절을 요구한다. 이는 제어/parser 증거다. 실제 runtime은 scope→새 observer-selfcheck 자체 실행(35/변조9·record/event/hash검증)→무계측양성3/final3→관측양성3/final3→deferred8/CLI9→fault38→scope다. 시간초과 또는 observer 불건강이면 UNVERIFIED_STOP, rc1을 목표 결함 차단으로 세지 않는다. IPC는 actual14+port 및 독립 offlineChrome 진단이 모두 PASS여야 한다. component는 실제 양성core manifest 입력, 기존6+typed18+top-level4 및 실제 소유Chrome cleanup2를 요구한다.

### 9.4 실제 음성 조건과 오류 코드

`runtime-probes.py --list`의38개 이름/코드가 읽기 전용 정본이다. 원본 candidate 증거 변조14(png header/CRC, check ID 누락·중복·추가/expected/constant actual, raw4/canonical/worker·server close receipt)는 A1_GATE_REJECTED와 각 실제 gate reason이어야 한다. 서버·작업자 spawn/error, ACK/noACK/noRUN, gate spawn/log, 증거없는 회귀, final write, 실제 child close 비관측, log finish 비관측, late log error를 개별 확인한다. gate-response-case/runId/candidateSha256/executionSha256/checks/artifacts/acceptance/status/extra/extra-output10은 실제 original gate PASS 뒤 변조돼 A1_GATE_RESPONSE_MISMATCH여야 한다.

owner code 정본: `A1_CLI_INVALID`, `A1_LOCK_MISMATCH`, `A1_PORT_BUSY`, `A1_SERVER_SPAWN_FAILURE`, `A1_WORKER_SPAWN_FAILURE`, `A1_ACK_INVALID`, `A1_ACK_TIMEOUT`, `A1_WORKER_FAILED`, `A1_GATE_REJECTED`, `A1_GATE_SPAWN_FAILURE`, `A1_GATE_RESPONSE_MISMATCH`, `A1_LOG_WRITE_FAILED`, `A1_LOG_FINISH_UNVERIFIED`, `A1_CLOSE_UNVERIFIED`, `A1_FINAL_WRITE_FAILED`, `A1_DEFERRED`.
private worker code: `A1_IPC_REJECTED`, `A1_RUN_TIMEOUT`, `A1_RUN_INVALID`.
각 실패는 단일JSON·정확code/case/runId·partial primary stack·trigger·건강한observer·actual quiescence를 함께 확인한다. private IPC context12 필드거절 및 noRUN/wrongRUN은 부작용0. private case 공백/추가args도 trim 없이 거절하는 소스를 확인한다.

### 9.5 UI·회귀·관측 출처 확인

실제 URL `http://127.0.0.1:18741/`, Chrome/1440x900. contract-core는 실제 로그인 DOM/compiled labels와 fixture 미요청 여부·PNG1·오류0·browser/context 생성/종료를 측정한다. 보호 shell 기존4capture와 home-live-admin1capture를 같은 owner 서버/worker 범위에서 재사용한다. 총 무계측3케이스6PNG와 별도 관측3케이스6PNG다. 원본 runner 실제 errors/checks/manifest를 엄밀히 gate가 판정한다. 원본 fullUI87을 축소하거나 정상8 완료로 주장하지 않는다.

Sol은 반환 raw값이 어디서 측정됐는지, 성공 전 created가 없는지, 모든 실패 분기에서 child/log/partial가 정리되는지 실제 소스와 추가 실제 실행으로 확인한다. observer의 직접child/FS 관측은 브라우저 모든 내부 분기를 증명하지 않는다. shell/home 기존 앱 동작 및339보호SHA를 보존한다.

## 10. 성공 조건

- [ ] E3-01~06과 A1T01~02/A1F01~07 각각 구현 위치/명령/실제 결과가 있다.
- [ ] 두 허용파일만 변경, 각30,000bytes 이하, frozen6575bytes/339보호파일/전체control/HEAD/status12 보존.
- [ ] 정적·build·관련11시험과 actual uninstrumented3/observed3·최종 gate6·fault38·CLI9/deferred8·IPC14+port·component 전부통과.
- [ ] late log error는 실제 owner A1_LOG_WRITE_FAILED, 잘못된 ACK는 실제 childclose/logsettlement 전 temp삭제 없음.
- [ ] 한 실패 code만 맞추거나 parser/canary PASS로 runtime을 대체하지 않는다. 첫 오류/partial/모든 raw 값 출처를 검증한다.
- [ ] 회신은 IMPLEMENTED/BLOCKED/FAILED로만 제출한다. A1/A2/B/전체3-2 수용 결정은 Sol 독립 검수까지 대기.

## 11. 즉시 중단 조건

기준HEAD/status/source/control이 다르거나 도구가 없으면 BLOCKED. 범위 밖 수정/의존성/새파일/expected 완화/새제품결정이 필요하면 구현하지 않고 질문을 회신한다. actual child close 또는 관측건강성을 확인할 수 없으면 자기 증거와 temp를 보존하고 UNVERIFIED_STOP/FAILED로 회신한다. foreign/historical PID/path를 정리해서 통과시키지 않는다. 자동 다른AI CLI 호출/commit/push/deploy 금지.

## 회신

Gemini는 아래를 실제 값으로 작성한다. 위 요청 본문은 수정하지 않는다.

```text
판정: 작성 대기 — IMPLEMENTED | BLOCKED | FAILED 중 실제 판정
기준: repository / branch / fullHEAD / 최종 commit 없음
초기 상태: 정확한 git status12 / source341 SHA / control 및 frozen 검문
변경 파일: 허용2 각각 E3 ID·변경 목적·bytes
범위 밖 변경: 실제 개수와 경로
요구사항 대조: E3-01~06 각각 함수/행/명령/결과
결함 추적: A1T01~02/A1F01~07 각각 해소·미해결 근거
검증 증거: 모든 명령/실행시각/rc/stdout/stderr/외부 artifact/actual count
음성 증거:38fault·9CLI·8deferred·14IPC+port의 case/code/first stack/trigger/quiescence
UI 증거:3양성+3관측양성 manifest/PNG/Chrome/DOM/fixture/rawerror
partial 증거: owner-failure/core-partial 경로·최초 오류·cleanup/evidence
보호 증거:339/frozen/controls/HEAD/status12 일치, 전체64자SHA
diff 요약: 허용hunk/추가삭제줄/byte수/새deps0
자원 증거: 자기child close/log finish·close/temp제거·보존경로/foreign정리0
미해결/가정: 실제 목록 또는 없음
```
