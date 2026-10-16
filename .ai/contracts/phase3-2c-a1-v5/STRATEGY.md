# A1 v5 — 관측 원문을 보존하고 독립 판정과 대조하는 실행 전략

Sol 소유, Gemini 읽기 전용. Action IMPLEMENT는 실패한 v4 전략을 대체한다. R32C-06 두 CORRECT 소진·초기화0을 유지한다. A1_NOT_ACCEPTED는 실제 v5 구현을 Sol이 독립 검수할 때까지 유지한다. v1 CORE9/fullUI87 정본과 A2/B 의무는 불변이다.

## 범위와 재사용

REPO `C:\Projects\Active\ShiftMgmt_V4`, main, HEAD `160940f9aaeb6696538447f83b44658073e382f0`, source341/기존dirty12. 수정은 `scripts/ui-checks/access-history.mjs` 및 `access-history-shared.mjs` 두 파일뿐이며 각각30000bytes 이하. 나머지339는 bytes/SHA 그대로다. shared의 `export const CANONICAL_8_ACTIONS =`부터 `export async function performWorkerIpcHandshake` 직전까지6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 그대로 유지한다. 그 안의 정상8 헬퍼 결함은 A2에서 다룬다. 새로운 제품 파일·의존성·설정·DB/UI/API/계산 변경은 허용하지 않는다.

v4에서 확인된 전체 preflight 해시 loop, exact context/registration/RUN, 실제 fixture route, 실제 Chrome/DOM API, child/log close 대기, strict gate outer schema, first error/partial/fallback을 재사용한다. 없는 preflight 결함을 만들지 않는다. HEAD/branch/status/source집합은 외부 `--scope`가 검문하며 owner는339 보호제품과 baseline.control 전체 및 frozen bytes/SHA를 쓰기·child·HTTP보다 먼저 검사한다. baseline 자신은 상단고정digest로 검문하고 control표에서는 제외하여 순환을 피한다.

## 요구사항과 실패 연결

| ID | v4 근거 | 필수 동작 |
|---|---|---|
| E5-01 | 유지할 검문 | CLI→deferred→전체잠금→port→run/temp→child 순서, 보호339/control/frozen 전부 bytes/SHA. lock drift3은 A1_LOCK_MISMATCH·runId null·부작용0. |
| E5-02 | A1V4-01 / E4-02 | 실제 spawn/exit/close/log callback 원문 ledger를 그대로 게시. ledger와 scalar exact 대조, Math.max/fallback/exitCode??0 제거. 시각 역전은 A1_LIFECYCLE_INVALID·PASS0·temp보존. |
| E5-03 | A1V4-02 / E4-05 | owner의 ACK exact7keys 검문, 원문 ACK receipt 보존, 추가키→A1_ACK_INVALID·RUN0. 기존 IPC19 유지. |
| E5-04 | A1V4-03 / E4-03 | page.viewportSize()/page.url()/DOM 실제값만 raw에 기록. viewport null은 raw.viewport=null·workerFAIL·partial, 1440x900 대입 금지. |
| E5-05 | A1V4-04 / E4-04 | original foundation.rules에서 ID/pointer/expected 로드. 자원 정확한3상태/문자열ID/실제compiled canonical경로. typed32 전부 거절·deepclone/deepfreeze 유지. |
| E5-06 | A1V4-05 / E4-07 | fallible 준비 전 raw/errors/checks/identity 초기화. early canonical/Chrome/import/fixture 실패도 atomic partial. 모든 non-null rule actual을 acquiredchecks로 보존하며 최초stack 유지. |
| E5-07 | A1V4-T01 | 독립gate receipt exact비교, actualfault46/partial7/typed32/observer39. bootstrap 제어증거는 제품 수용으로 사용하지 않는다. |
| E5-08 | A1V4-R01 | 요구/실패 ID별 실제diff·정확명령·PID/시각/RC·전체SHA·원문artifact 회신. IMPLEMENTED는 제출이다. |

## 구현 순서와 owner 데이터 흐름

1. HANDOFF에 봉인된 v5 execution/baseline/gate 경로·full SHA를 existing constants에 반영한다. 원본v1과 fixed Python은 유지한다. alternate gate/env override 금지. CLI/deferred는 잠금 전에 기존 exactterminal로 종료한다.
2. run/temp 생성 직후, 첫 server spawn 전에 owner context와 failure state를 보유한다. ProcessRecord 생성 직후 ChildProcess의 spawn/error/exit/close 및 각 stdout/stderr finish/close/error listener를 한번씩 등록한다. createdAtMs는 실제 spawn callback에서만 기록한다. failed spawn도 ChildProcess handle을 보유하여 실제 close를 기다린다.
3. 아래 callbackEvents 원문과 scalar를 같은 callback에서 기록한다. success/failure snapshot 모두 같은 clone 규칙을 사용한다. 실제 close code를 exitCode로 전용하지 않는다. 실패한 spawn의 pid/createdAtMs/exitAtMs/exitCode/exitSignal은 null, exitSeen=false다. 실제 close callback의 code/signal은 closeCode/closeSignal에 별도로 기록한다.
4. server/worker actual close 뒤 양 stream end와 실제 finish+close를 기다리고 late error drain을 유지한다. owned ChildProcess.kill만 사용. existing graceful/forced 각5초·log 각5초·gate15초 deadline 유지. close 미관측→A1_CLOSE_UNVERIFIED, finish 미관측→A1_LOG_FINISH_UNVERIFIED, close 미관측→A1_LOG_CLOSE_UNVERIFIED, log error→A1_LOG_WRITE_FAILED. missing 값은 null/false다. 첫 primary는 교체하지 않는다.
5. temp 삭제 **전에** actual timestamp order와 ledger/scalar 일치를 검문한다. created≤exit≤close≤각logfinish≤각logclose여야 한다. 위반 시 A1_LIFECYCLE_INVALID로 최초 실패를 만들고 temp를 보존한다. 실시간 Date.now 값은 그대로이며 Math.max·가정값·현재시각 대체 금지. tempRemovedAtMs는 실제 rm 완료 직후, sealedAtMs는 candidate 봉인 직전의 실제 값이다. 이것들도 역전이면 성공하지 않는다. gate clock 오류는 이미 삭제된 temp를 복구했다고 주장하지 않고 실패를 보존한다.
6. worker actual ACK callback에서 packet 전체를 deepclone하여 아래 ackReceipt를 저장하고, 원 ACK object exact7keys/type/값을 검문한 뒤에만 owner-run을 보낸다. unknown key를 제거한 후 검문하지 않는다. invalid ACK 원문은 failure snapshot에 남긴다. 값 binding 검문·nonce timeout·RUN guard는 유지한다. 회귀 shell/home은 IPC=false, ackReceipt=null이다.
7. workerFAIL의 core-partial 또는 지정fallback을 읽어 acquired raw/checks/path를 owner-failure에 보존한다. owner failure ledger도 current state 그대로다. workerPartialPath가 있는데 checks를 []로 치환하면 실패다. core raw가 아예 획득되지 않은 경우만 owner.raw=null/checks=[]이다.
8. 정상 worker/server settlement·error0·raw/checks·temp삭제가 모두 충족되면 READY_FOR_ADJUDICATION candidate를 atomic publish. 고정 Python actual rc0/close/로그finish+close 및 stdout outer 정확히 status/result, inner 정확히8필드의 일치 후 owner-final atomic publish·단일 stdout PASS. final에는 adjudicator actual ledger도 포함한다. PASS 전에 missing/오류/clock역전이 있으면 FAIL이다.

## ProcessRecord 원문 계약

기존 pid/exitSeen/closeSeen/aliveAfterClose/createdAtMs/exitAtMs/closeAtMs/exitCode/logsSettled/logFinishSeen/logFinishAtMs/logCloseSeen/logCloseAtMs를 유지하고 **exitSignal, closeCode, closeSignal, callbackEvents**를 추가한다. 모든 stream map은 stdout/stderr 정확히2키다. exit/close code는 실제 integer 또는 null, signal은 실제 nonempty string 또는 null이다.

callbackEvents는 실제 전달된 callback 순서의 배열. 각 이벤트는 정확히7키:

```text
{event, timeMs, stream, pid, code, signal, error}
```

- event는 spawn/exit/close/error/log-finish/log-close/log-error 중 하나, timeMs는 콜백에서 한번 읽은 실제 finite positive Date.now이다.
- child event의 stream=null, pid는 actual child.pid 또는 null. spawn의 code/signal/error=null, exit/close의 code/signal은 실제 callback 인수이며 error=null. error의 code/signal=null, error={name,message,stack}는 원 오류3문자열이다.
- log event의 stream=stdout 또는 stderr, pid/code/signal=null. finish/close의 error=null, log-error는 원 error3문자열.
- spawn/exit/close/각stream finish/close는 각각1회, error는 실제 추가 발생분 전부 보존. 없는 event를 생성하지 않는다. 성공은 실제7event, error0. 실패는 관측된 부분만, 역전 시각도 원문대로 보존한다.
- scalar는 해당 event의 동일한 timeMs/code/signal이어야 한다. exitSeen/closeSeen/logSeen은 event 존재와 exact 일치. 성공 배열의 첫3event는 spawn→exit→close, 전체timeMs 비감소, 각stream finish→close여야 한다. 실패 배열은 역전도 그대로 보존한다. aliveAfterClose는 실제 close 관측을 따른 기존 규약이며 숫자 PID probe를 close 대용으로 쓰지 않는다.
- gate는 ledger와 scalar의 동일성을 검사할 수 있지만, 두 쪽을 함께 조작한 기록의 진위를 혼자 증명하지는 못한다. Sol 소스 검토와 독립 actual fault/관측이 필수다.

worker.ackReceipt는 ACK 미관측 시 null, 관측 시 정확히 `{packet,receivedAtMs}`다. packet은 실제 수신 ACK 전체의 deepclone이며 추가키도 failure에서 보존한다. receivedAtMs는 그 callback의 실제 양수시각이다. 정상 packet은 type/protocol/case/ownerPid/workerPid/nonce/contextSha256 정확히7키, 각값은 기존 handshake binding과 일치한다. gate는 nonce SHA와 owner context JSON SHA도 검문한다.

## shared 데이터 획득·collector·부분 증거

1. valid ACK/RUN 이후 core 실행 진입의 첫 단계에서 raw의 정확한10키(viewport/origin/loginInputs/fixtureLabels/canonicalLabels/fixtureRequestCount/rawErrors/chrome/resources/captureId), errors={primary:null,cleanup:[],evidence:[],unexpected:[]}, context/worker identity/checks를 만든다. **findChrome/exists/read/createRequire/import/fixture 준비도 모두 try 안**이다. raw의 미획득값은 null, resources=[], rawErrors={console:[],pageerror:[],requestfailed:[],badResponses:[]}는 이미 관측하기 시작한 빈 collections다. fixtureLabels/fixtureRequestCount는 실제 route rows/handler가 준비된 뒤에만 각각 실제값/0을 기록한다.
2. actual findChrome 성공 후 chrome의 acquired path/version을 보존, browserVersion은 실제 browser.version 후 보완한다. actual compiled `REPO/dist/server/shared/domain/access-log.js` bytes/hash/full accessLogActionLabels를 읽은 단계별로 canonical metadata를 보존한다. read 자체가 실패하면 canonicalLabels=null. canonical helper는 caller가 제공한 same-bytes 다른 경로를 정본으로 받아들이지 않는다.
3. frozen createMockAccessLogs(8)을 재사용해 실제 compiled map으로 actionLabel을 채운 실제8행을 route `**/api/access-logs:list`에 연결한다. rows가 연결된 뒤 fixtureLabels/요청count를 보존. 호출 때 실제 요청배열/count 증가. CORE 로그인 방문에서 요청0이 양성이다. fabricated request나 CANONICAL_8_ACTIONS의 label을 actual로 복제하지 않는다.
4. Chrome launch/newContext 성공 직후 실제 browser/context created 기록. error hooks를 goto 전에 등록한다. page viewport/origin/각 login DOM 측정값을 raw에 보존한 뒤 viewport null/type 등을 검사한다. null은 그대로 남기고 실패, 상수 대체 금지. null probe는 DOM 측정 후 screenshot 전에 실패할 수 있다. captureId는 실제 screenshot 성공 후에만 core-capture다.
5. finally에서 실제 존재하는 context→browser를 독립적으로 닫고 created 없이 lifecycle을 만들지 않는다. primary가 없는 첫 cleanup throw는 primary와 cleanup에 모두 원 stack으로 보존한다. 이미 primary가 있으면 교체하지 않는다. close-error는 closed로 바꾸지 않는다. 성공 raw.resources는 각각 kind/id/events 정확한3키, kind browser/context 각1개, id는 distinct nonempty string, events는 **정확히3개 created→close-start→closed**, 각 state/timeMs만, actual positive finite/nondecreasing 시각이다.
6. collectCoreChecks(raw)는 동기·단일인수, original locked foundation.rules의 ID/pointer/op/expected에서 검사와 checks를 구성한다. hardcoded CORE_POINTERS/expected 제거. top raw10 및 모든 nested exact key/type/finite, finder path/version 일치·browserVersion4부숫자, canonical actualcompiled경로/bytes/SHA/fullmap, resource strictsequence/ID, expected actual값을 모두 검문. checks exact9개/contract순서/각 `{id,sourceArtifact:'core-observations',pointer,actual}`이며 actual structuredClone 및 반환 전체재귀freeze. caller expected/verdict/tolerance/추가인수 금지. CORE-03은 count/visible만이며 name/type/label 요구를 추가하지 않는다.
7. 실패 partial의 checks는 **그 시점 raw의 rule.pointer actual이 null이 아닌 모든 규칙**을 contract 순서로 기록한다. null은 미획득, 빈array/빈object/0/false는 획득값이다. rawErrors와 resources 초기빈collection도 CORE-06/08 획득값에 포함한다. partial expected검문/성공판정은 하지 않으며 잘못된1439viewport/부분chrome도 그대로 보존한다. CORE-09는 capture 성공 전 null이라 제외한다. canonicalLabels는 별도metadata이므로9rule checks 대상은 아니다. contract ID/pointer를 재사용하고 deepclone한다. 선택적으로 existing shared 안에 collectAcquiredCoreChecks helper를 두어 중복을 줄일 수 있다.
8. canonical 준비 실패도 core-partial.json을 siblingtmp+rename으로 게시한다. exact common필드 status=FAIL/case/runId/context/worker={pid,parentPid,nonceSha256}/raw/checks/errors. raw10은 항상 존재. errors.primary는 code=A1_WORKER_FAILED/phase/name/message/stack/timeMs, terminal.error의 stack과 byte동일. cleanup/evidence/unexpected는 arrays이며 초기 실패에도 존재한다. primary publish 실패는 errors.evidence에 원stack을 추가하고 core-partial.fallback.json에1회 atomic 시도. owner도 owner-failure/fallback을 동일규약으로 처리한다. 양쪽 실패 시 firstterminal 유지·own temp/증거보존·미검증이며 추가stderrJSON/PASS 금지.

worker-final의 measurement exact5키 viewportSource='page.viewportSize'/originSource='page.url'/fixtureRoute/실제fixtureRows/실제fixtureRequests는 유지한다. raw10키를 늘리지 않는다. owner.failure의 owner/context/세process또는null/raw/checks/workerPartialPath/errors/cleanup는 유지한다.

## 검증 정본과 수용 기준

- runtime46=기존v4의44 + owner-extra-ack(A1_ACK_INVALID) + timestamp-regression(A1_LIFECYCLE_INVALID). 실제 worker stdout finish callback에 child.close보다250ms 작은 Date.now를 전달하며 failure ledger/scalar 모두 그 supplied값을 그대로 보존하고 temp를 삭제하지 않아야 한다. observer는 별도 realClock을 사용한다. actual회귀2+core3무계측 및 동일3관측, final6/12PNG, CLI9/deferred8/lock3를 유지한다. 각 fault는 observer healthy/fault 실제발생/rc1/exactterminal/firststack/failureledger/actualquiescence가 있어야 한다.
- observer fresh default39=기존37+실제ACK추가키 전달/clock값 전달 canary2, eventcorruption9거절. canary는 control delivery proof다. runtime suite는 default selfcheck를 새로 실행하고 **bootstrapMode=true receipt를 거절**한다.
- IPC19+actualoccupiedport를 유지. component semantic6/top4/typed32(기존25+repeated-created/reversed-states/extra-closed/ID number·bool·array/same-bytes alternatecanonical7)/실제Chrome close2. 모든 typed변형은 실제 shared helper가 거절해야 한다.
- partial7=기존capture/contextclose/publishfailure/measuredviewport/measuredorigin5 + viewport-null + canonical-missing. real private worker/validIPC/owned localstub/Chrome, actual events/rc/stdoutstderr/primary·secondary/atomicpartial/acquiredchecks exact대조. canonical-missing은 canonical read만 가상 실패, 파일변경0/Chrome0/earlypartial필수다. viewport-null은 actual 화면 변경을 주장하는 시험이 아니라 측정 부재 거절 시험이다.
- gate 기존PNG CRC/v1rules/protectedregression/actualartifactbytesSHA와 typed검문 유지, v5 evidence-v5.py의 process/ACK exact대조를 추가한다. 기존v4 manifest는 ledger/ACK부재로 거절되는 것이 정상이다. parser 기존19+35와 새receipt33음성은 control proof이며 실제 SUT PASS와 구분한다.
- bootstrap 전용 `--bootstrap-v4`는 정확한 현재v4 owner/shared SHA에만 사용하며 expiredv4baseline 때문에 occupiedport의 A1_LOCK_MISMATCH·부작용0을 확인한다. oldbaseline/TODO/state를 복원하거나 oldcontrols를 고치지 않는다. 현재v4 partial7 결함 감지와39 control 검증을 v5 제품 수용으로 쓰지 않는다. Gemini 실제수용명령에는 bootstrap flag를 사용하지 않는다.

## 중단과 회신

모순/허용2·30000bytes·frozen 내 불가/보호SHA·branch/status drift/필수환경없음→BLOCKED 또는 UNVERIFIED_STOP, 새제품쓰기중단·확보증거보존. 테스트완화·추정PASS·CORRECT3/회수초기화 금지. exact ownedChildProcess만 종료하고 foreignPID/과거산출물/기존Chromeprofile/운영DB는 정리하지 않는다. A2 정상8/login/남은A-N01~20 및 B87은 별도 Sol패킷까지 대기한다.
