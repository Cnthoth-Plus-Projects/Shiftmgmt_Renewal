# HANDOFF — 3-2c A1 v4 실측·종료·부분 증거 실행 전략 구현

- Task: A1 검증기가 실제 관측·실제 종료·확보 증거·고정 외부 판정으로만 성공을 게시하도록 v4 전략 구현
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-10-12 16:30:41 KST
- 회신: 필요
- Repository: C:\Projects\Active\ShiftMgmt_V4
- Branch: main
- Baseline commit: 160940f9aaeb6696538447f83b44658073e382f0
- Expected initial status: 아래 정확한12경로와 일치, source341/허용2/보호339
- 현재 수용: **A1_NOT_ACCEPTED**. IMPLEMENTED는 제출이며 수용은 Sol 독립검수 뒤에만 결정.
- 사용자 승인: 「하던 작업 이어서 진행해줘」 — 중단된 Sol 재설계의 후속 실행. 제품 작성자는 Gemini로 유지.

# 회신 요청

누가: Gemini. 어디: 맨 아래 보이는 `## 회신`. 언제: 착수 게이트 충돌 시 제품 수정 없이 BLOCKED; 그 외 구현·모든 필수 검증 후 회신. 회신이 없으면 Sol 독립검수와 A2/B 진행이 멈춘다. 다른 AI CLI를 호출하지 않는다. 이 본문을 바꾸지 않는다.

## 1. 목표 / 2. 비목표

목표: CORE9와 기존 shell/home 회귀를 통과하더라도 잘못된 측정·종료 미관측·증거 소실·메시지 변조에는 성공을 게시하지 않는 A1 실행기를 구현한다.

비목표: A2 정상8/login/남은원본 A-N01~20, B전체UI87, 활동이력 UI/모델/API/계산/DB, 새 제품파일/의존성/설정, commit/push/배포. 원본 v1 계약을 완화하지 않는다. 기존 R32C-06 두 CORRECT 소진·초기화0을 유지하며 CORRECT3으로 표시하지 않는다.

## 3. 현재 상태와 근거

TODO 3-2c-A: 이전 v3 제출 FAILED/A1_NOT_ACCEPTED. 지정38fault·양성6 통과에도 추가 실제 outer gate/log.close 허위PASS2, raw7수용, protocol1 ACK, DOM 확보 후 partial 소실. 상수 관측/생성 전 created/사전 잠금 누락은 소스 근거였다. 독립 원문은 `C:\Projects\Active\교대근무관리 시스템\Log\20261012_154142_3-2c-A1-v3-Sol-FAILED_次패킷전보존본.md`, 검수 `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-a1-v3-review-20261012_143959`.

Sol은 중단된 v4 제어 준비를 이어받아 실제 selfcheck37·event corruption9·parser35추가거절 및 Python3/Node6 구문을 재검증했다. 현재 정확한 v3 제품을 대상으로 실제 partial/측정 제어5건이 기존 결함을 감지하는 것도 확인했다(`C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v4-partial-cC3Vsu`). 이 결과는 **제어 도구 검증만**이며 새 제품 구현/실제v4 runtime44/IPC19/partial5 수용 증거는 아직 없다. 주입된 page API 값을 구현이 읽지 않는 시험은 실제 화면이 바뀌었다는 주장으로 쓰지 않는다.

초기 git status는 정렬·정리하지 말고 원문 그대로 대조:

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

초기 허용2 실제 bytes/SHA (수정 전 일치, 수정 후 변경 허용):

| 파일 | bytes | SHA-256 |
|---|---:|---|
| `scripts/ui-checks/access-history.mjs` | 29269 | `EDAD35833644B900A729588504FAB1FE36B447EC09AD3AA8D46C731FB8DFD7FD` |
| `scripts/ui-checks/access-history-shared.mjs` | 26372 | `1F76243755359C0BC5F4A3FC8C5EA1144C3E2216946AF80AF321B7756E5A5C9B` |

이번 고정 제어 값(실제 bytes에서 계산):

| 경로 | bytes | SHA-256 |
|---|---:|---|
| `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v4\execution.json` | 5544 | `BF35D6B048B436DCEDEB297E2751A2ED5E5F4804C2546FEBAB5EB19BBF76B280` |
| `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v4\baseline.json` | 71400 | `86F9EEF2D499B88CD9717BE40C2E14139B57422A69C7CDEF5B5476F2D063B208` |
| `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v4\gate-evidence.py` | 25751 | `21D88C1662D2EE87D89BFA22332255466BEBE6E3C84F2B15E57AB4BB64314B84` |
| `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v4\frozen-shared.json` | 7433 | `5EEC6E933B2A555D42CBC31E31FF0A8F8C46239F192011C9FCB7076513C7ECDA` |
| `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\contract.json` | 29515 | `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE` |
| `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\verify-evidence.py` | 19880 | `24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954` |

## 4. 수정 경계

허용 제품 파일은 `scripts/ui-checks/access-history.mjs`(owner: E4-01/02/05/06/07) 및 `scripts/ui-checks/access-history-shared.mjs`(shared: E4-03/04/05/07) 둘뿐이다. 각각 30,000bytes 이하. 기존 두 파일의 대상 함수·분기에만 필요한 hunk를 적용한다. 광역 포맷·전체 재생성·기타 제품파일 생성 금지.

보호: baseline.files 중 위2 제외339 전부, shared frozen fragment6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`, v1/v2/v3/v4 정본·검수 도구, TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/.ai/Log. `C:\Projects\Active\ShiftMgmt_V3.4`는 읽기 전용. Gemini는 HANDOFF의 최종 `## 회신`만 작성할 수 있다. 실행 산출물은 새 own run/분리 temp와 검수 suite artifact만 허용하며 기존 산출물/foreign PID/Chrome profile/운영DB를 정리하지 않는다.

shared의 EXECUTION_PATH/SHA는 위 v4 execution 경로/hash로, owner의 BASELINE_PATH/SHA 및 GATE_PATH/SHA는 위 v4 경로/hash로 교체한다. PYTHON_PATH는 `C:\Users\pangyo\anaconda3\python.exe`. 원본 CONTRACT_PATH/SHA와 v1 checker는 그대로다. 경로/env override/다른 gate 사용 금지.

## 5. 요구사항 / 6. Sol 코드 전략

아래는 잠근 STRATEGY의 본문이다. E4-01..08을 모두 구현하며 A1V3-01..07/T01 대조와 위치를 회신한다.

# A1 v4 — 실측·실제 종료·부분 증거를 먼저 소유하는 실행 전략

Sol 소유 / Gemini 읽기 전용. Action IMPLEMENT: 실패한 v3 전략의 대체다. R32C-06 CORRECT2 소진·초기화 금지는 유지한다. 제품 작성자는 Gemini, Sol은 제어 파일만 작성한다. 원본 v1 CORE9/fullUI87 정본은 불변이다. A1 prerequisite만 대상이며 A2 정상8/login/남은 A-N01~20 및 B87은 수용하지 않는다.

## 닫힌 범위

저장소 `C:\Projects\Active\ShiftMgmt_V4`, main, HEAD `160940f9aaeb6696538447f83b44658073e382f0`. source341 중 수정은 `scripts/ui-checks/access-history.mjs` 및 `access-history-shared.mjs` 두 파일만, 각각 30,000bytes 이하. 나머지339 및 기존 dirty12 보존. 새 제품 파일/패키지/DB/UI/API/계산 변경 금지. shared의 `export const CANONICAL_8_ACTIONS =`부터 `export async function performWorkerIpcHandshake` 직전까지는 6,575bytes / SHA256 `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 그대로 유지한다. 그 안의 normal8 헬퍼 결함은 A2에서 다룬다. v1/v2/v3 역사 제어 파일도 불변.

## 요구사항과 결함 연결

| ID | 결함 | 필수 동작 / 검문 |
|---|---|---|
| E4-01 | A1V3-06 | CLI→deferred→read-only 전체 잠금 검문→port→run/temp→child. 실제 frozen fragment·baseline.files의339 보호제품·baseline.control 전부 bytes/SHA 검문을 어떤 쓰기/자식/HTTP보다 먼저 완료. 실제 변경파일2는 허용하되 크기 제한·frozen 검문. 가상 read drift3은 A1_LOCK_MISMATCH, side effect0, runId null. 외부 --scope가 HEAD/main/파일집합/status12도 먼저 검문. |
| E4-02 | A1V3-02 | ProcessRecord는 실제 child error/exit/close와 각 stdout/stderr finish/close/error를 한 번만 등록하고 실제 콜백에서만 시각 기록. 미관측 값은 null/false, 종료 코드 null 허용은 실패 증거에서만. stop은 실제 child.close까지 기다리고 numeric PID 사망을 close 대용으로 쓰지 않는다. owned ChildProcess.kill만 사용. |
| E4-03 | A1V3-03 | 실제 성공한 Chrome/context 생성 직후 created 등록; page.viewportSize()/page.url()/DOM 실측, 실제 prepared fixture 응답·route 요청 누적에서 raw 생성. 상수 actual과 생성 전 created 금지. 캡처 성공 직후만 captureId 기록. |
| E4-04 | A1V3-04 | collectCoreChecks(observations) 동기/단일 인수: 원본 v1 foundation.rules에서 ID/pointer/expected 읽기, 정확한 nested field/type/state/canonical/Chrome 검문, 복제·재귀 동결. 부정 raw25+top4/기존 semantic6 거절. |
| E4-05 | A1V3-07 / A1V3-T01 | 첫 owner-context의 msg.protocol===2와 registration.protocol===2를 각각 ACK 이전에 검문. protocol1→A1_IPC_REJECTED, violation protocol, ACK/HTTP/Chrome/workerwrite0. packet/context/registration/RUN/ACK의 정확한 키 집합도 검문하며 추가 키를 수용하지 않는다. 기존 RUN nonce/timeout 검문 유지. |
| E4-06 | A1V3-01 | 고정 Python의 실제 rc0/close/로그 finish+close 뒤 JSON 단일 응답, outer 정확히 status/result, inner 정확히8필드와 실측값. outer-extra→A1_GATE_RESPONSE_MISMATCH. 다른 JSON/bytes/필드 추가/순서 외 의미 변화는 수용 금지. |
| E4-07 | A1V3-05 | core와 owner의 mutable run 증거를 처음부터 소유, 실패 후 획득 raw/checks/ledger/context/child/log 상태 및 최초 error 전체 stack 보존. cleanup/evidence 실패는 별도 추가, 원 primary 교체 금지. partial atomic publish 실패도 보조 evidence로 남기고 지정 fallback atomic publish. 둘 다 실패 시 primary terminal 유지와 stderr 규약 유지, temp 보존·검증 미완료로 처리. |
| E4-08 | A1V3-T01 | 독립 v4 control이 outer key/모든3종process logclose/추가 logfinish/typed7/context protocol/partial3/measurement2/preflight3을 검문. fresh observer actual37+event corruption9; runtime44 기존38 보존. control proof를 제품 수용으로 바꾸지 않는다. |

## 구현 순서 / 호출점

1. shared 바깥 상단의 EXECUTION_PATH/SHA를 v4로 변경. owner BASELINE/GATE 경로·SHA도 v4로 변경한다. original v1 path/hash는 유지. 모든 정본 숫자/hash는 HANDOFF 표의 full값을 사용하고 임의 env override/대체 gate 금지.
2. owner 기존 preflight loop에 baseline JSON을 읽어339 보호제품과 baseline.control 모든 항목 bytes/SHA를 검사하고 실제 shared byte fragment를 marker 경계로 잘라 frozen JSON bytes/SHA와 비교한다. 두 허용 파일을 제외한 모든 baseline.files가 대상이다. 보호 대상 누락·hash 비교 skip 금지. baseline 자신의 digest는 상단 고정값, control 표는 자기파일을 제외하여 순환하지 않는다. CLI/deferred는 이 검문 전에 기존 exact terminal로 종료한다. 폴더/파일 생성과 child spawn은 검문 뒤에만 둔다.
3. owner ProcessRecord의 등록부와 settlement를 수정한다. run/temp 생성 뒤 첫 server spawn 전에 full owner context(repository/url/runDir/tempDir/bootstrapFile/contractPath·SHA/executionPath·SHA)를 구성해 failure에도 보유한다. 실제 child.close 전에는 성공 경로의 log.end를 부르지 않는다. spawn error도 실제 ChildProcess close를 기다리며 원 spawn error가 primary다. 정상 worker 자연 종료 / server graceful→forced 각5초→close 확인, gate deadline15초. PID가 사라져도 close callback 없으면 A1_CLOSE_UNVERIFIED. close 미관측에서는 temp를 보존하되 pipe 실제 종료 후 자기가 만든 로그만 끝내어 물리 정리를 시도하고 실패 ledger에 미관측을 남긴다. 이 실패 cleanup은 성공 settlement로 바꾸지 않는다. numeric process.kill(pid) 대용 금지.
4. 각 stream end 뒤 finish/close/error를 기다린다(각5초; existing logFinish deadline을 양 이벤트에 적용). 처음 기록된 오류가 없는 경우 missing finish→A1_LOG_FINISH_UNVERIFIED, finish 있으나 missing close→A1_LOG_CLOSE_UNVERIFIED. 실제 error→A1_LOG_WRITE_FAILED. 두 stream을 모두 시도하고 setImmediate/기존 late-error drain 유지. `settled=true`는 성공 시에만. stream listeners는 settlement 뒤 final 직전까지 유지한다.
5. 성공 toManifestRecord는 실제 ledger만 복제한다. 기존 logsSettled와 logFinishAtMs를 유지하고 **logFinishSeen/logCloseSeen/logCloseAtMs**를 추가한다. 각각 stdout/stderr 정확한 두 키. 어떤 fallback Date.now/Math.max/exitCode??0도 금지. 실제 created≤exit≤close≤각 finish≤각 close. candidate의 tempRemovedAtMs는 worker/server 양 stream actual close 이후, gate receipt/final 게시도 gate 양 stream actual close 이후. 미관측 값은 failure snapshot에서 null로만 보존한다.
6. shared core 실행 시작에서 `raw`의 정확한10키를 만들되 미획득 actual은 null, resources=[]; errors={primary:null,cleanup:[],evidence:[],unexpected:[]}, checks=[], context/worker identity를 같은 run state에 보유한다. finally 후에야 관측을 만드는 현재 구조를 바꾼다. `settleOwnedResources`는 실제 있는 context→browser를 독립적으로 닫고, created 없이 close events를 만들지 않는다. 첫 cleanup throw가 최초 실패면 primary로도 등록하고 cleanup 배열에도 원 stack을 넣는다. 기존 errors.primary가 있으면 객체/stack을 유지한다. cleanup throw를 삼켜 success 반환 금지; 호출자가 errors를 검사해 실패로 종료한다.
7. compiled `dist/server/shared/domain/access-log.js`(현재 CommonJS)를 createRequire로 실제 읽어 bytes/SHA/full accessLogActionLabels를 구한다. 새 private fixture-preparation helper(두 파일 안)를 사용: frozen createMockAccessLogs(8)으로 actionType/기타 행을 재사용하고 actionLabel을 실제 compiled map에서 설정한다. 존재하지 않는 actionType/라벨은 실패. 준비한8행 자체로 route `{ok:true,data:rows}` 응답을 등록한다(`**/api/access-logs:list`); handler 호출 때 request 배열/count를 누적한다. CORE 실행은 로그인 화면만 방문하므로 route 호출0이 양성이다. request를 만들어0 기대값을 깨지 않는다. fixtureLabels는 route에 연결한 실제8행 actionType/actionLabel에서 추출한다. frozen CANONICAL_8_ACTIONS 라벨을 관측값으로 직접 복제하지 않는다.
8. Chrome 실제 launch 성공 뒤 browser created, newContext 성공 뒤 context created 기록. page.viewportSize()의 width/height와 page.url()의 실제 URL, #login-id/#login-password 각각 count/isVisible을 raw에 즉시 저장한다. 준비8행/요청 누적은 raw 및 worker measurement에 연결한다. error hooks는 goto 전에 등록한다. screenshot은 실제1440x900 core PNG, 실패해도 이미 획득한 raw는 보존한다. 실제 screenshot 성공 때만 captureId='core-capture'. source/failure/data source가 잠금 기대값과 다르면 첫 실패를 유지한다.
9. collectCoreChecks는 `loadContract().foundation.rules`를 재사용하고 JSON pointer로 actual을 가져온다. CORE-03은 **id/password 각각 count/visible 두 필드만**; name/type/label 추가 요구 없음. CORE expected viewport[1440,900]/origin기존URL/fixture8/request0/rawErrors4빈배열/captureId는 원본에서 가져온다. Chrome 필드 정확히 path/version/browserVersion, path/version은 findChrome() 실측값과 동일, browserVersion은 실제4부숫자 형식. canonicalLabels 정확히 path/bytes/sha256/labels, 실제 compiled 경로/bytes/SHA/full map과 deepStrictEqual. positive resource 정확히 browser/context 각각 kind/id/events, 고유 nonempty string id, events 정확히 created→close-start→closed 각 state/timeMs뿐, finite nonboolean 양수·비감소. 모든 object의 누락/추가 키·배열 오용·NaN/Infinity·숫자 bool을 거절한다. caller expected/verdict/tolerance/추가인수 금지. 반환 checks는 실제 raw 복제9개/순서·ID·pointer 고정, deepFreeze. partial은 획득된 actual만 contract ID/pointer로 checks 배열에 남기되 미획득 체크/성공 verdict를 채우지 않는다.
10. IPC protocol과 키 집합을 ACK 전에 검사하고 existing owner/context/run guard를 유지한다. owner-context 키는 type/protocol/case/ownerPid/workerPid/nonce/contextSha256/context, context 키는 repository/url/runDir/tempDir/bootstrapFile/contractPath/contractSha256/executionPath/executionSha256, registration 키는 protocol/case/ownerPid/workerPid/nonceSha256/contextSha256/context다. registration.context는 수신 context와 deep exact 일치해야 한다. RUN 및 ACK 키는 type/protocol/case/ownerPid/workerPid/nonce/contextSha256다. 누락/추가 키·배열/비객체를 거절한다. 추가 packet/context/registration 키는 A1_IPC_REJECTED와 violation packetKeys/contextKeys/registrationKeys를 각각 반환하고 ACK0; 추가 RUN 키는 valid ACK 뒤 A1_RUN_INVALID, HTTP/Chrome/write0이다. owner도 ACK 추가 키는 A1_ACK_INVALID로 거절한다. regression-shell/home은 기존 보호 스크립트 실행을 재사용하며 IPC=false를 유지한다. 오류 code/첫 stack·기존 log 오류 우선순위는 그대로다.
11. owner worker rc1일 때 core-partial 또는 core-partial.fallback을 읽어 failure evidence reference와 raw/checks를 owner state에 넣는다. 정상 candidate/gate는 오류·미관측이0일 때만 준비한다. 실제 gate 응답을 outer와 inner 모두 exact keyset/type/value로 닫아 검문한다. candidate READY_FOR_ADJUDICATION은 PASS가 아니다. fixedgate 통과 후 gate 실제close/log finish/close 확인→atomic owner-final→단일 stdout PASS 순서. 터미널 FAIL은 기존 **stderr 한 줄 정확한6키 status/code/phase/case/runId/error**, stdout empty를 유지한다.

## 실패 artifact 계약 — terminal과 구분

core 실패 정본 `runDir/core-partial.json`(temporary sibling + rename). 정확한 공통 필수 필드: status='FAIL', case, runId, context(전달 받은 그대로), worker={pid,parentPid,nonceSha256}, raw(정확한10키, 미획득값 null), checks(획득 actual만), errors={primary,cleanup,evidence,unexpected}. primary에는 code='A1_WORKER_FAILED', phase, name/message/stack, timeMs; terminal.error stack과 byte 동일. raw.resources는 실제 존재한 자원만/실제 lifecycle, close 실패는 close-error, closed로 덮어쓰지 않는다. context-close throw가 첫 실패면 그 오류를 primary 및 cleanup에 보존한다.

worker-final에는 기존 필드에 measurement={viewportSource:'page.viewportSize',originSource:'page.url',fixtureRoute:'**/api/access-logs:list',fixtureRows:실제8행,fixtureRequests:실제handler요청배열}를 더한다. 정상 raw10키를 늘리지 않는다. 독립gate가 fixtureLabels/count와 measurement 행/요청을 대조하고 Sol은 소스 및 실제API변조2로 상수 actual 부재를 확인한다.

owner 실패 정본 `runDir/owner-failure.json`: 기존 case/runId/status/exitCode/contractSha256/executionSha256/errors/cleanup 유지; owner={pid,nodePath,context,nonceSha256}, server/worker/adjudicator 각 실제 ProcessRecord snapshot 또는 생성 안 됐으면 null, raw/checks(획득분), workerPartialPath(없으면 null) 추가. 부분 기록의 process는 실제 true/false/null/time/error를 보존하며 성공용 strict receipt로 위조하지 않는다. 오류 발생 이후 child/log settlement와 cleanup 상태를 갱신한 최종 snapshot을 atomic publish한다. error callbacks가 늦게 발생해도 원 primary를 바꾸지 않는다.

primary 기록은 최초 실패에서1회, 모든 secondary를 arrays에 유지한다. core/owner primary artifact write/rename 실패를 errors.evidence에 원 stack/time으로 추가하고 같은 state를 각각 **core-partial.fallback.json / owner-failure.fallback.json**으로 sibling-temp+rename1회 시도한다. 최종 fallback도 실패하면 오류 arrays에 추가하고 생성했던 `.tmp` 증거와 own temp를 보존한다. stderr에 보조 JSON/로그를 덧붙여 terminal을 깨지 않는다. fallback 둘 다 실패는 acceptance 실패이며 숨긴 성공 아님. control은 core primary publish 실패1건을 직접 강제한다. 기존 owner final-write-denied는 owner-failure atomic publish/primary 보존으로 검문한다.

## 독립 검수 정본

- v4 gate는 기존 v1 규칙/PNG CRC/보호 회귀/실제 artifact bytes/SHA/실제scope 검문을 유지하고 logFinishSeen/logCloseSeen/actual logCloseAtMs를 필수로 추가한다. 기존 v3 receipt는 새 close증거가 없어 거절하는 것이 정상이다.
- runtime44=원38+gate outer-extra+worker/server/gate stdout logclose 미관측3+server/gate stdout logfinish 미관측2. 양 stream의 일반 schema/시각 검문은 gate parser 양성 및 부정21추가로 확인한다. finish/close 미관측은 기존정본물리종료 observer가 건강하고 fault 실제 발생해야 유효하다.
- fresh observer actual37=원35+outer mutation+actual stream close delivery suppression. event corruption9 및 old crashed preload 거절은 유지한다. 이것은 control proof다.
- preflight lock3은 실제 보호제품/실제 frozen fragment/실제 v4 STRATEGY.md read 결과만 메모리에서 변경한다. 원본 바이트는 전혀 수정하지 않는다. owner가 해당 reads를 하지 않으면 trigger 없음/검문 실패이며 음성 PASS 금지.
- IPC19=기존14+protocol1(ACK0)+packet/context/registration/RUN 추가 키4. component는 기존semantic6/topinvalid4/typed18+직전 빠졌던7=typed25 및 실제 ownedChrome close2. partial5=실제Chrome/stub의 capture failure/context close failure/core partial publish failure 및 page API viewport/origin 값 변조2. stub은 검증기 경계 시험이며 실제앱 양성3을 대체하지 않는다. 외부 suite가 각각 원문stdout/stderr/argv/cwd/PID/time/RC/events/partial을 보존한다.
- Sol 최종 source review가 실제 생긴 resource만 ledger 생성, 실제 route연결/실측 API, preflight 전체파일검문, atomic partial, first-error 우선순위, frozen fragment와2파일30k를 직접 확인한다. runtime PASS만으로 acceptance를 선언하지 않는다.

## 중단 / 증거 보존

control 실패·observer 불건강·fault未발생·timeout·환경 없음은 UNVERIFIED_STOP, 음성 수용 아님. exact ChildProcess handle만 종료한다. 실제 close 이후 PID 재사용은 OS creation time 등 읽기전용으로 구분하고 foreign PID를 kill하지 않는다. 모든 suite artifact/정확히생성한 temporary fixture를 보존, 역사 폴더 정리 금지. branch/status/보호SHA/기준문서가 달라지거나2파일/30k/frozen 안에서 구현 불가하면 수정 중단 BLOCKED. 새설계 추정·CORE완화·CORRECT회수초기화 금지.


## 7. 불변조건과 과거 함정

승인·계산 원자성, forward-only, 근무일 기준 요율, DB36구조, 엑셀 인테이크, UNIQUE 중복 방지, 조→sort_order→사번 순서, 내부 식별자, 비Pool·비BP 사번 신원 게이트를 건드리지 않는다. 미측정 수치/동작 없는 UI 금지. 화면·계산 이관 규칙을 그대로 보존한다. 운영 PC 패치는 그 턴 사용자 명시 승인·판 번호 대조·백업이 필요한 별도 작업이다.

실제 닫힘과 SUT의 close 관측은 구분한다. 자가보고 true/현재시각/Math.max는 종료 증거가 아니다. fixed gate rc0만으로 PASS를 만들지 않는다. 첫 실패를 cleanup/write 오류로 덮지 않는다. checker/selfcheck/list를 SUT 런타임 합격으로 보고하지 않는다. CORE9 성공은 전체3-2 완료가 아니다.

## 8. 착수 전 확인

저장소/main/fullHEAD/초기 status12/초기2파일 SHA/보호339/frozen/정본 hash와 요구사항을 대조한다. 아래 scope 명령이 rc0이어야 한다. 모순·경로/범위/환경 불일치면 제품 수정 없이 BLOCKED. 중간에 TODO/state/control을 바꿔 scope를 통과시키지 않는다.

## 9. 검증 계획 — 순서대로 실제 실행

모든 명령의 cwd는 `C:\Projects\Active\ShiftMgmt_V4`. PowerShell 초기 변수(그대로 사용):

```powershell
Set-Location -LiteralPath 'C:\Projects\Active\ShiftMgmt_V4'
$a1Python = 'C:\Users\pangyo\anaconda3\python.exe'
$a1Control = 'C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v4'
$a1ExecutionSha = 'BF35D6B048B436DCEDEB297E2751A2ED5E5F4804C2546FEBAB5EB19BBF76B280'
$a1BaselineSha = '86F9EEF2D499B88CD9717BE40C2E14139B57422A69C7CDEF5B5476F2D063B208'
```

1. `& $a1Python -X utf8 -B "$a1Control\gate-evidence.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha --scope` → rc0, source341/allowed2/protected339/control62 잠금 불변.
2. `node --check scripts/ui-checks/access-history.mjs`, `node --check scripts/ui-checks/access-history-shared.mjs` → 각각rc0. `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run validate:map`, `git diff --check`, `npm.cmd run build` → 모두rc0, 기존lint5warnings/지도90과 구분해 보고.
3. `npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` → rc0, 3파일11시험. 전체919 재실행을 했다는 주장은 실제 실행했을 때만.
4. `& $a1Python -X utf8 -B "$a1Control\gate-evidence.py" --execution-sha $a1ExecutionSha --self-test`, `& $a1Python -X utf8 -B "$a1Control\runtime-probes.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha --self-test` → 각각rc0, gate35추가거절 및 runtime receipt parser 검사. 형식 검사이며 SUT 수용을 대체하지 않는다.
5. `& $a1Python -X utf8 -B "$a1Control\runtime-probes.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha` → rc0. 이 driver가 새 observer-selfcheck37/event변조9/control SHA 검문을 직접 수행한다. 무계측양성3+관측양성3·독립final6·실제PNG12, CLI9/deferred8, runtime fault44, preflight lock3 전부 통과. 마지막stdout JSON의 artifact 경로를 `$a1RuntimeRoot`로 실제 기록하고 내부 selfcheck receipt도 보존. list/parser/canary만 실행한 것은 대체 증거가 아니다.
6. `node "$a1Control\ipc-probes.mjs"` → rc0, 실제 offline Chrome 진단과 private19+occupiedport 전부PASS. protocol1/추가packet/context/registration은 ACK0, RUN추가키는 validACK 뒤 거절, HTTP/Chrome/workerwrite0.
7. runtime 양성 contract-core의 실제 PASS manifestPath를 `$a1CoreFinal`에 대입. `node "$a1Control\component-probes.mjs" --core-manifest $a1CoreFinal --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha` → rc0, semantic6/typed25/topinvalid4/실제 소유Chrome closethrow2. 입력도 고정gate로 먼저 검문한다.
8. `node "$a1Control\partial-probes.mjs"` → rc0, actual v4 partial5. 캡처 실패/close 실패/primary partial publish 실패/viewport·origin API값 변조의 first stack·획득 raw·실제 ledger·atomic fallback 검문. `--legacy-control-check`는 이 실행의 대체가 아니며 v3 exact-source 제어확인 전용이다.
9. scope 명령을 다시 실행→rc0. 두 허용 파일 fullSHA/bytes, 전체diff, 각 source snapshot 대비diff, frozen/339/control hash, HEAD/status12 재확인. runtime timeout/observer불건강/fault미발생/다른오류code는 UNVERIFIED_STOP으로 남긴다.

UI/런타임은 실제 own 앱 `http://127.0.0.1:18741/`, Chrome 1440x900. core는 로그인 입력 id/password 각1/visible, CORE-01..09 정확한9ID·raw값·정상 캡처1. 기존 shell 관리자펼침/접힘/watch중단/operator4캡처 및 home-live-admin1캡처/원래동작 유지. owner가 부트스트랩하는 분리DB/temp만 사용하고 실제 운영 계정/DB/기존listener에 연결하지 않는다. 음성 close/finish 미관측에서는 own temp 보존이 필수이고 성공 출력 금지다. 캡처는 실행이 만든 실제 경로/bytes/fullSHA로 보고한다.

## 10. 성공 조건

E4-01..08 원인→수정위치→재현→실제결과 대조, 허용2/frozen/보호339/control 불변, static/build/관련11, runtime44/lock3/양성6/final6/12PNG, private19+port, typed25/top4/semantic6/ownedclose2, partial5, exact terminal/first failure 모두 증거를 남긴다. 실패 결과도 보존한다. IMPLEMENTED 이후 Sol의 소스/증거/실제UI 독립검수까지 A1_NOT_ACCEPTED 상태다. A2/B 착수 금지.

## 11. 즉시 중단 조건

기준/잠금 불일치, 원문 전략과 실제 소스 모순, 두파일/30k/frozen 경계 안에서 구현 불가, 새파일/의존성/API/DB/권한/계산 변경 필요, 시험 약화나 상수/fallback 성공으로만 통과, 실제 Chrome/검수 환경 없음이면 BLOCKED/FAILED로 회신한다. 외부 서비스 메시지/AI CLI/commit/push/배포는 수행하지 않는다.

---

## 회신

Gemini가 이 칸만 작성한다. 미실행 명령·미측정 hash·성공을 창작하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED 중 실제 상태
기준: 저장소 / main / 전체 baseline commit / 최종 commit 해당없음
초기 상태: git status 원문과 착수 gate/scope 결과
변경 파일: 허용2 각각 목적과 E4 ID
범위 밖 변경: 실제 개수/경로
요구사항 대조: E4-01..08 및 A1V3-01..07/T01별 원인 -> 파일:행/심볼 -> 재현 명령 -> 실제 결과
검증 증거: exact argv/cwd/PID/start/end/rc/timeout/stdout/stderr 및 suite artifact 경로
음성 시험: CLI9/deferred8/runtime44/lock3/private19+port/typed25/top4/semantic6/realclose2/partial5 각 결과
UI 증거: 양성3+관측3/final6/core1+shell4+home1씩12PNG, 실제 URL/화면/동작/console
첫 실패·partial: 원 stack과 raw/checks/resource/child/log/cleanup/fallback 결과
diff: 받은2원문 snapshot 대비 모든hunk, added/deletedlines, 생성제품파일0, 의존성변경0
fullSHA-256: 두 제품파일 및 실제 manifest/candidate/PNG/raw/로그/receipt 각각 bytes/fullSHA
정본·보호 확인: source341/protected339/control 잠금/frozen/HEAD/status 초기→최종 대조
미해결/가정: 없음 또는 검증하지 못한 조건 전부
```
