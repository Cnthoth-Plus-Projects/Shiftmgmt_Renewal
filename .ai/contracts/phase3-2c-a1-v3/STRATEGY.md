# Phase 3-2c A1 — 실행 전략 v3

Sol 작성, Gemini 읽기 전용. 이 문서는 구현 설계와 독립 검증 계획이다. 제품 코드와 신규 테스트 파일을 제공하는 문서가 아니다. 현재 구현은 A1_NOT_ACCEPTED이며 본 전략의 런타임 합격 증거는 아직 없다.

## 적용 범위

사용자 2026-10-12 「응 다음 작업 진행하자」에 따른 IMPLEMENT 전략 교체. R32C-06 동일 결함군 CORRECT 두 번 소진 이력을 유지한다. CORRECT3 또는 회수 초기화가 아니다. A1의 원본 CORE-01~09, 보호 shell/home 회귀와 검증기 신뢰성을 구현한다. A2 정상8·남은 원본 A-N01~20 및 B 전체UI87은 별도 수용이 필요하다.

제품 허용 파일은 `scripts/ui-checks/access-history.mjs`, `scripts/ui-checks/access-history-shared.mjs` 둘뿐이다. 각각 30,000 bytes 이하. 새 제품 파일·의존성·설정·테스트·UI·모델·API·DB 수정 금지. shared의 `export const CANONICAL_8_ACTIONS =`부터 `export async function performWorkerIpcHandshake` 직전까지 6,575 bytes/SHA 502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1은 그대로 보존한다. 해당 구간의 알려진 정상8 로그인/legacy collector 문제는 A2에서 처리한다. 정본 v1/v2와 Log는 변경하지 않는다.

## E3-01: 진입 검문과 잠금

owner의 공개 CLI는 정확히 인수 하나 `--case=<execution.publicCases의 원문 case>`다. trim, 별칭, URL/추가 인수, 중복 case 금지. shared 직접 CLI는 정확히 `--case=contract-core` 하나다. 잘못된 입력은 먼저 A1_CLI_INVALID, 부작용 없이 종료한다. 정상8은 A1_DEFERRED/BLOCKED_STAGE로 종료한다.

유효하고 enabled인 입력은 run 생성 전에 CONTRACT, EXECUTION, BASELINE, GATE의 실제 bytes/SHA와 잠금 JSON, frozen-shared 파일 및 실제 fragment를 확인한다. 경로·버전·repository·allowlist·slice가 다르면 A1_LOCK_MISMATCH. 원본 v1 checker hash도 확인한다. 상수 export만 만들고 확인을 생략하지 않는다. baseline control 항목은 read-only 파일 해시로 확인하되 허용 두 제품 파일의 baseline SHA는 구현 뒤 같을 수 없으므로 강제하지 않는다. 보호339 파일은 baseline SHA를 유지한다. preflight를 위해 외부 프로그램·앱·Chrome을 시작하지 않는다.

실제 18741 점유 확인 후에만 owner run과 isolated temp를 만든다. 기존 listener를 사용하거나 닫지 않는다. 점유면 A1_PORT_BUSY, temp/spawn/request/log 생성 없음. 세 case만 enabled: contract-core/regression-shell/regression-home. 모든 Sol_주입 환경과 NODE_OPTIONS는 child env에서 제외하며 제품 코드에서 SOL_A1_PROBE 등의 fault 이름을 읽지 않는다.

## E3-02: 하나의 owner 자원 등록부

owner 내부의 기존 child 관리 부분을 하나의 등록부로 통합한다. 생성 성공 뒤에만 레코드를 등록하며 server, core worker, 보호 regression worker, Python adjudicator에 동일 규칙을 적용한다. 각 레코드는 실제 child handle/PID, created/exit/close 시각, signal/code, 두 log stream의 finish/close/error 및 시각을 보존한다. spawn 직후 error/exit/close와 log error/finish/close listener를 먼저 붙인다. 성공 flags와 시간이 기본 true/현재시각으로 채워지면 안 된다.

`child.exit`와 `child.close`는 별개다. `close`가 관측되기 전에는 stdout/stderr log `.end()` 또는 temp 삭제를 하지 않는다. close 이후 pipe 입력이 더 없음을 확인하고 `.end()`한다. 각 log에 실제 finish와 close가 모두 필요하다. stream error이면 actual close까지 기다리고 A1_LOG_WRITE_FAILED로 실패한다. finish 누락은 5초 후 A1_LOG_FINISH_UNVERIFIED다. finish 직후 도착한 error도 수집하여 seal 전/최종 publish 직전 오류 없음으로 다시 확인한다. Promise resolve가 listener 해제를 의미해서는 안 된다.

정리 순서: 작업 자식 중단 요청 → 자기 handle의 graceful 5초/forced 5초 → 실제 close 확인 → 모든 log finish 또는 error 및 close 확인 → 자기 temp만 삭제 → sealed candidate → Python gate → gate 실제 close/log finish/close → atomic final → 단일 PASS. wrong ACK/no ACK/no RUN/spawn 실패/로그 실패에서도 동일 정리를 수행한다. close 관측이 없으면 A1_CLOSE_UNVERIFIED와 temp 보존. log finish 관측이 없으면 temp 보존. 이미 실제 close된 child에 불필요한 kill을 호출하지 않는다. foreign PID, 역사적 temp, 기존 Chrome profile, listener를 종료하지 않는다.

생성에 실패하여 PID 없는 child는 actual error+close를 보존하고 그 child의 로그도 정리한다. spawn 실패에 exit 증거를 창작하지 않는다. 실패 분기에는 성공 candidate를 만들지 않는다. 첫 오류를 primary로 고정하고 뒤 정리/evidence/unexpected 오류는 별도 배열에 추가한다.

## E3-03: 실제 core 관측과 닫힌 collector

shared의 frozen 구간 뒤에 있는 `collectCoreChecks`, `settleOwnedResources`, core 실행, IPC, 직접 CLI만 수정한다. CORE-01~09 조건과 expected는 원본 contract.foundation.rules에서 온다. caller expected/unknown field/추가 인수를 받지 않는다. 반환 체크는 정확히 `{id,sourceArtifact:'core-observations',pointer,actual}`이며 raw의 실제 pointer 값을 deep clone하고 배열·객체 전체를 deep freeze한다. finite tree를 재귀 검증하고 NaN/Infinity/boolean 시각, unknown/누락 필드를 거절한다.

정상 raw의 최상위 key는 viewport, origin, loginInputs, fixtureLabels, canonicalLabels, fixtureRequestCount, rawErrors, chrome, resources, captureId다. 기존 v1 각 pointer의 typed schema와 정확한 field 집합을 유지한다. collector는 path 존재만으로 Chrome을 인정하지 않는다. 보호 `scripts/lib/find-chrome.mjs`가 반환한 실제 executable/version과 비교하고 browser.version() 실측도 보존한다. package.json 같은 임의 파일 또는 비정상 버전은 거절한다.

viewport는 page.viewportSize(), origin은 실제 page URL/DOM location에서 얻는다. loginInputs는 실제 #login-id와 #login-password DOM 각각의 count/visible을 측정하여 정확히 `{id:{count,visible},password:{count,visible}}`만 기록한다. 원본 CORE-03 밖의 새 속성을 추가하지 않는다. fixtureLabels는 실제 fixture route 응답에 넣은 배열, canonicalLabels는 실제 compiled domain bytes/SHA/완전한 labels map이다. fixtureRequestCount는 route handler가 실제 받은 요청 수다. 준비됐다는 이유로 0을 넣지 않는다. captureId는 실제 PNG 작성 후만 참조하고 1440x900은 PNG/DOM에서 검증한다. console/pageerror/requestfailed/HTTP 오류를 전부 rawErrors에 수집하며 문자열 401 포함 등으로 광역 무시하지 않는다.

browser launch 성공 뒤 browser-created, context 생성 성공 뒤 context-created를 각각 등록한다. 자원은 kind browser/context 정확히 하나씩, ID 중복 없이 두 개다. 성공 events는 created→close-start→closed, 실제 Date.now() 시각이 단조다. 정상 raw는 자원 close 성공 뒤 고정한다. close throw면 close-error를 partial에 남기고 기존 primary를 유지하면서 다른 자원도 닫는다. created-only ledger, duplicate kind/ID, unknown resource field, 순서 역전은 collector에서 거절한다.

성공 worker-final은 실제 owner context/nonce/PID/checks를 담는다. 실패도 확보한 raw/checks/errors/resources를 core-partial.json에 남기며 이미 실패한 생성의 created/closed를 넣지 않는다. 파일 쓰기 실패 자체를 evidence 배열에 기록하고 최초 오류를 덮어쓰지 않는다.

## E3-04: IPC와 private CLI

기존 IPC protocol2 메시지 모양을 유지한다. context의 ownerPid=process.ppid, workerPid=process.pid, case, nonce, URL, runDir/tempDir/bootstrapFile, contract/execution path/SHA 모두 실제 잠금/자기 경로와 엄밀히 비교한다. sibling run이나 상위 폴더도 허용하지 않는다. invalid packet은 ACK 없이 A1_IPC_REJECTED와 violation을 반환하며 HTTP/Chrome/파일 쓰기 부작용은 없다. violation은 ownerPid/workerPid/case/nonce/url/runDir/tempDir/bootstrapFile/contractPath/contractSha256/executionPath/executionSha256 중 실제 거절한 필드다.

유효 context는 ACK하고 RUN 승인을 5초 안에 받아야 한다. 무승인 A1_RUN_TIMEOUT, 잘못된 RUN nonce A1_RUN_INVALID. raw case를 trim하지 않는다. private terminal 실패는 stdout 비우고 stderr에 한 JSON을 쓴다. 공통 FAIL 모양에 `violation`만 IPC_REJECTED일 때 추가한다. phase는 preflight, runId는 null, case는 contract-core. Node 진단 채널은 제어 도구가 실제 Chrome을 먼저 관측한 뒤 검사한다.

## E3-05: 외부 gate 전체 응답 결합

worker/server close와 실제 log finish/close 및 temp 제거 뒤 READY_FOR_ADJUDICATION owner-candidate.json을 atomic write하고 byte SHA를 고정한다. 현재 v3 gate-evidence.py에 Python의 고정 절대경로로 실제 실행을 요청한다. 실행 인수는 --execution-sha/--baseline-sha/--candidate다. fake gate, in-process 대체, parser selftest 결과 또는 worker verdict를 승인으로 사용하지 않는다.

gate child 자체도 동일 등록부로 actual close/log settlement를 기다린다. stdout는 정확히 JSON 객체 하나, stderr는 비어야 한다. rc=0 외에 아래 전체 객체와 key 집합까지 deep exact 비교한다: outer `{status:'PASS',result}`; result의 status='ACCEPTABLE_CANDIDATE', acceptance='A1_PREREQUISITE_ONLY', case=selectedCase, runId=실제 runDir.name, candidateSha256=sealed bytes hash, executionSha256=잠금 hash, checks=정확한 case 필수개수, artifacts=정확한 case 필수개수. case/runId/hash/count/status/acceptance/extra field/extra JSON 중 하나라도 다르면 A1_GATE_RESPONSE_MISMATCH. stderr가 gate의 실제 거절이면 A1_GATE_REJECTED. gate spawn 실패는 A1_GATE_SPAWN_FAILURE.

최종 owner-final은 candidate 그대로에서 status만 PASS로 바꾸고 adjudication receipt만 추가한다. candidateSha/gatePath/gateSha, gate process actual lifecycle/finish timestamps, stdout/stderr path/bytes SHA를 보존한다. 기존 gate.final()이 normalized final==candidate 및 receipt==actual gate stdout를 독립 확인한다. final write/rename 실패는 A1_FINAL_WRITE_FAILED, 성공 출력 금지. owner는 manifestPath를 포함한 단일 PASS JSON을 stdout에 쓴다.

## E3-06: 첫 실패·partial·터미널 결과

owner FAIL은 rc1, stdout 빈 문자열, stderr 정확히 JSON 한 줄이다. key 집합 `{status:'FAIL',code,phase,case,runId,error:{name,message,stack}}`. preflight에서는 runId=null, CLI invalid case=null; 유효 case의 port/lock 거절은 actual case. run 생성 후에는 runId=runDir.name이며 실제 throw의 name/message/stack과 primary code를 보존한다. multi-line stack은 JSON escape로 담고 별도 stderr stack을 추가하지 않는다. private worker의 IPC_REJECTED만 violation을 추가한다.

deferred는 rc1, stderr 빈 문자열, stdout JSON 한 줄 `{status:'BLOCKED_STAGE',code:'A1_DEFERRED',case,reason:'A2_PENDING',stageSlice:'A1'}`. PASS는 rc0, stdout JSON 한 줄이며 실패 진단을 앞뒤에 섞지 않는다. 관련 앱/worker stdout은 자기 log 파일에 들어간다.

owner run 생성 뒤 모든 실패에서 owner-failure.json을 atomic write한다. status/case/runId/errors.primary에 최소 code/phase/name/message/stack을 남겨 terminal receipt와 동일 first error임을 확인할 수 있어야 한다. 확보된 context, raw/checks, 자식 lifecycle, log 상태, temp 보존/제거 상태 및 cleanup/evidence/unexpected 오류를 모두 남긴다. 실패 원인이 증거 파일 쓰기여도 primary를 바꾸지 말고 가능한 다른 자기 run 파일에 진단을 남긴다. 관측 불능/강제 timeout은 검수에서 UNVERIFIED_STOP이다. generic rc1, empty event, unrelated code, canary PASS가 실제 결함 거절로 인정되지 않는다.

## 독립 검증 순서

1. 형식/구문과 gate parser selftest/runtime parser selftest 및 plan list는 제어 도구 검증이다. 실제 SUT 증거로 계산하지 않는다.
2. observer-selfcheck.py의 실제 IO/child/stream/HTTP, fault 전달, gate stdout 변조, legacy preload crash 감지, current SUT public CLI/정상8/occupied port를 확인한다. 35 control checks/9 event corruption 거절 및 observer/preload/canary SHA 결합을 요구한다. late-log canary rc0은 주입이 실제 전달됐다는 증거일 뿐 owner rejection이 아니다.
3. static/build/관련 시험 후 먼저 무계측 양성3+독립 final3을 실행한다. 이어 관측 양성3+독립 final3에서 child close/log finish/close/temp 제거 순서를 actual observer로 교차 확인한다. JSON timestamp만으로 실제 이벤트를 증명하지 않는다.
4. current SUT runtime 음성38은 각 fault trigger, observer startup/loaded/exit hash chain, rc1, 한 terminal receipt의 정확한 code/case/runId/실제 partial primary stack, 실제 모든 child/log 종료를 요구한다. 원본 gate 거절14는 의도한 reason 문자열도 확인한다. gate 응답 변조10은 원래 실제 gate PASS 이후 하나의 값만 변조한다. 관측 누락 close/finish fault는 자기 temp를 하나 보존해야 한다.
5. IPC14+actual occupied port, collector 기존6+추가 typed18+invalid top-level4, 실제 소유 Chrome close throw2를 확인한다. private malformed CLI도 원문 비교/부작용없음을 소스로 확인한다. helper 목록만 출력한 것은 실행 증거가 아니다.
6. 보호339/전체341/status12/HEAD/frozen/모든 control SHA를 재확인하고 Sol이 소스의 값 출처·생성/종료 listener·primary/partial 분기를 독립 읽는다. observer는 owner 프로세스의 직접 child/FS 사건만 감시하므로 브라우저 모든 내부 분기를 증명한다고 주장하지 않는다.

전체 검증 통과 후에도 A1 prerequisite만 수용 가능하다. A2/B/전체3-2/배포 완료로 승격하지 않는다.
