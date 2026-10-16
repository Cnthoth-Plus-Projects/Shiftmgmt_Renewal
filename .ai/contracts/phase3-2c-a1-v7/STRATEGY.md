# A1 v7 — 관측 오류 차단과 현재 실패 기록

Sol 정본 / Gemini 읽기 전용. v6 FAILED 후 전략을 대체하는 IMPLEMENT이며 기존 R32C-06 두 CORRECT 소진/회수 초기화0 유지. A1_NOT_ACCEPTED, A2 정상8/login/남은A-N01~20·B87·전체3-2·배포 대기. v1 CORE9/fullUI87 불변.

## 목표와 닫힌 경계

실제 오류 콜백을 한 번이라도 받은 실행은 PASS를 게시하지 않는다. 실패 기록은 성공 캐시 이후의 원 오류도 포함한다. 정상 receipt는 한 번 검문·복제·동결한 객체로 계속 연결한다.

제품 저장소 `C:\Projects\Active\ShiftMgmt_V4`, main, HEAD `160940f9aaeb6696538447f83b44658073e382f0`, source341/기존dirty12. 허용은 기존 `scripts/ui-checks/access-history.mjs`, `scripts/ui-checks/access-history-shared.mjs` 2개뿐, 각각30000bytes 이하. shared는 execution path/SHA constant만 v7로 바꾼다. worker core/collector/fixture/partial의 정상 v6 수정은 그대로 재사용한다. owner는 아래 지정한 함수와 호출 hunk만 수정한다. 보호339, shared frozen6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 유지.

다른제품파일/패키지/DB/API/권한/UI/계산/테스트 신설·광역포맷·전체재생성·commit/push 금지. 원본V3.4 및 모든 .ai/Log/TODO/AGENTS/PROTOCOL/GEMINI/CLAUDE 읽기 전용. 단 회신칸과 own fresh artifact/temp만 쓴다.

## 요구사항 대조

| ID | v6 finding | 구현과 기대값 |
|---|---|---|
| E7-01 | 유지 | CLI→deferred→fullbaseline/control/frozen→port→run/temp→spawn, 기존 preflight/ACK/등록/RUN/전체339검문 유지. v7 고정anchors만 교체. |
| E7-02 | A1V6-01/T01 | primary/cleanup/evidence/unexpected 및 live receipt/cache 동일성을 삭제전·각후속await뒤·원자게시전 검문. 원 오류가 있으면 같은 primary/stack으로 FAIL. |
| E7-03 | A1V6-02 | 실패manifest는 현재 ProcessRecord의 새 실패snapshot 사용. 성공cache를 실패경로에서 선택하지 않는다. late child/log/multiple errors 원문 전수 보존. |
| E7-04 | A1V6-03 | 단일 validateProcessReceipt가 고정 evidence-v7 process_receipt(success=True)와 PIDinteger 및 exactstreammaps까지 일치. 세actors 동일함수, 정상7·errors0·scalar/event exact 유지. |
| E7-05 | A1V6-01/T01 | candidate/final `.tmp` 직렬화·write뒤 rename전에도 동일barrier. 실패하면 target final/PASS 없음, tmp와 실제cleanup상태 보존. |
| E7-06 | 유지 | canonical/fixture/realpath/core raw/checks/acquisition·actual spawn 원stack·로그settledhash·정리·고정gate/응답binding 기존PASS 유지. |
| E7-07 | A1V6-T01 | 원runtime51/partial11/observer45 그대로 + lifecycle15 + pureguard 정상1/음성5 실제 검문. actual event 발생·failure 현재ledger·최초stack·정리순서·core binding 모두 확인. |
| E7-08 | A1V6-R01 | fullSHA/bytes/정확diff±/hunks/명령PID·UTCstart/end·RC·stdout/stderr/events·요구별실제범위·실패원문 전수 회신. IMPLEMENTED≠수용. |

## owner 최소 변경 전략

guard 추출 계약: 함수선언 `validateProcessReceipt`는 기존 `isObj` 외 외부helper/실행상태에 의존하지 않는 순수함수로 유지한다. 기존 설치 TypeScript parser로 두 선언을 추출하여 실제 함수를 검문한다. 새 의존성을 설치하지 않는다.

1. fixed v7 execution/baseline/gate path/fullSHA는 HANDOFF 실측표에서 그대로 사용한다. originalv1/fixedPython 유지, env/CLI로 gate나정본을 바꾸지 않는다. 기존 전수 preflight를 축약하지 않는다.
2. `validateProcessReceipt`만 국소 수정한다. positive integer PID, event7keys/types, array7/events spawn→exit→close·양streamfinish→close, times finitepositive/비감소, scalar/flags/code/signal exact, stream seen/time maps는 정확히 stdout/stderr 두키, errors0, closeSeen/exitSeen/실제logsettlement을 요구한다. 실패는 A1_LIFECYCLE_INVALID로 원 cause를 보존한다. empty synthetic error로 원 observed error를 대체하지 않는다. gate/worker exit0은 actor 결과검문으로 유지하고 server nullcode/actualsignal은 고치지 않는다.
3. 성공cache 생성은 현재방식 `toManifestRecord` 1회→단일guard→structuredClone→deepFreeze. 각 actor 성공cache를 한 번만 만든다. 반복guard용 새 success snapshot이나 cache 재생성은 금지한다. 같은receipt를 바인딩하는 candidate/final 기존schema는 유지한다. 새 manifest 필드나 외부gate호출로 localguard를 대체하지 않는다.
4. owner 안에 작은 **단일 success barrier**를 둔다. 먼저 primaryError/cleanupErrors/evidenceErrors/unexpectedErrors를 확인한다. 최초 observed primary가 있으면 그 오류/stack을 그대로 throw하여 catch로 간다. secondary 때문에 primary를 덮지 않는다. 그뒤 해당단계에서 이미 캐시된 각 actor의 live `callbackEvents` 전체원문과 frozen cache array를 exact 비교한다. pid/createdAtMs/exitSeen/closeSeen/exitAtMs/closeAtMs/exitCode/exitSignal/closeCode/closeSignal/log seen/time maps/settled 등의 현재scalar도 비교한다. 아직spawn/settlement 중인 gate를 성공cache와 비교하지 않는다. 동일성이 깨졌고 원오류가 없을 때만 구체원인과 A1_LIFECYCLE_INVALID를 기록한다. 성공cache를 바꾸거나 timestamp를 보정하지 않는다.
5. listener는 계속 유지한다. child spawn/exit/close 및 log finish/close는 once, error/log-error는 모든 발생을 기록한다. `recordError`가 이미 첫 원error를 갖고 있다는 사실만으로 success 흐름이 중단된다고 가정하지 않는다. `settleLogs`가 settled=true로 빨리 반환한 뒤에도 barrier가 추가error와 live/cache차이를 반드시 본다. 실패cleanup은 각 child/stream에 독립시도하고 실패기록을 남긴다.
6. worker/server settle→cache1회→barrier→artifacthash→checkPortFree await→barrier→temp삭제 순서다. 특히 await 뒤가 삭제전의 마지막 검문이다. pre-removal 오류는 temp를 보존하고 candidate/gate/final을 만들지 않는다. rm 뒤 다시 barrier를 확인한다. 그 뒤 생긴 오류는 이미삭제된temp를 복구하거나 `tempRemoved=false`로 조작하지 않는다.
7. 기존 `writeAtomic`에 **선택적인 동기 beforeCommit callback**을 추가한다. stringify/임시write 완료→callback→rename 순서. candidate/final만 같은 success barrier를 전달한다. failure/fallback write에는 success barrier를 전달하지 않는다. candidate/final serialization 또는 임시write 중 실제오류가 들어오면 rename을 하지 않는다. success barrier가 원오류 때문에 throw한 것을 CANDIDATE/FINAL_WRITE_FAILED synthetic으로 덮지 않는다. 실제write/rename I/O오류는 기존 A1_CANDIDATE_WRITE_FAILED/A1_FINAL_WRITE_FAILED 코드·원stack으로 보고한다.
8. candidate atomic 게시뒤/before gate spawn에 barrier. gate spawnPromise 및 close/stop/logsettle의 각 await 뒤에도 기존 캐시worker/server와 오류배열을 검문한다. 오류발생시 자기 gate를 안전정리하고FAIL. gate가 settled된 뒤 단일guard/cache1회, 그후 세actor barrier→실제stdout/stderr 및 exactgate응답binding→final 준비→beforeCommit barrier→rename→동일턴 단일stdout PASS/processexit. 마지막 drain/barrier 이후 final rename/PASS 사이에는 await·timer·listener제거를 넣지 않는다. 고정gate는 누락된callback을 복원할 수 없으므로 localbarrier와 독립observer 검문이 필수다.
9. catch는 cleanup시도 뒤 **각 현재 reg.toManifestRecord() 실패snapshot**을 따로 취득한다. `getRec(c,r)`의 cache우선 경로는 제거한다. 실패snapshot에는 성공guard를 강제하지 않고 actual partial/null/noexit/clock역전/lateerror를 그대로 보존한다. 캐시된기록을 과거의 성공receipt로 보존할 필요가 있어도 현재실패기록을 대체하지 않는다. 추가 manifest 필드 없이 기존 server/worker/adjudicator 위치에 현재state를 넣는다. primary원stack/multiple errorledger/core raw/checks/acquisition/workerPartialPath/actualtempRemoved는 기존 계약대로 연결한다.
10. 파일30k 제약 때문에 무관한 hunk를 압축하지 않는다. 중복cache 검문 try/catch를 작은공통helper로 재사용하고 변경대상guard/atomic/barrier/error/failure 함수와 직접호출hunk 안에서만 중복을 줄인다. shared 본문을압축/재작성하지 않는다. 닫힌2파일/30k 안에서 불가능하거나 지시모순이면 제품수정 없이BLOCKED로 돌려보낸다.

## 상태 전이와 예외

정상: CLI/deferred/full잠금→port→ownrun/temp→actualspawn/ACK/RUN→worker/server settle→성공cache·barrier→settledartifacthash→portawait·barrier→temp삭제·barrier→atomiccandidate beforeCommit→beforegate barrier→gateawait마다barrier→gatesettle/cache→gate응답binding·세actorbarrier→atomicfinal beforeCommit→같은동기턴PASS.

실패: 최초actualerror→독립child/log cleanup→현재failure snapshots+최초core획득binding→atomicfailure/fallback→stderrFAIL RC1. cache뒤오류는 성공증거를 없었던것처럼지우지않으며 live error도 빠뜨리지 않는다. candidate가이미있으면보존, final은아직rename되지않아PASS가없어야한다. beforeCommit의후속동기단계에서는 자연 비동기콜백이 실행되지않는다; 유한 drain으로 미래의 모든OS오류까지 없어졌다고 주장하지 않는다.

## 검증과 통과범위

기존 필수 전부: 구문2/typecheck/lint(existing5)/map90/diff-check/build/관련3files11, gate/parser43/ordering13, runtime86records/51fault/lock3/CLI9/deferred8/positive6/final6/PNG12, freshobserver45/변조9, IPC19+port, component semantic6/top4/typed32/realChromeclose2, partial11, source341/control전체/frozen/HEAD/status12.

추가 `lifecycle-probes.py`: before-removal worker/server의 child/log4, gate 실행중 worker/server의 child/log4, final `.tmp` write 뒤 worker/server/gate child3 및 server/gate log2, late server child2연속1, 실제gate응답mismatch+latechild1 =15. 모든 조건에서 실제 trigger/observer healthy/원primarystack/현재callbackledger/실제로spawn된actor별종료/logfinishclose(삭제전4는gateabsence필수)/core획득binding/RC1·final/PASS없음을 검문한다. 삭제전4는관측한exacttemp 실제보존·candidate/gatespawn0, 이후11은actualtemp삭제·owncandidate파일 및 `.tmp` staging→rename완료→gatespawn 순서 보존을 검문한다. final-stage는 실제파일write가delivery전이고 완성된owner-final.json.tmp파일이존재해야한다. multiple2 원오류는callbackledger전수와secondary unexpected에도 모두 남는다. mode별actor/kind/stage가정확하지않거나오류가실제발생하지않은정본거절을latefault검문통과로인정하지않는다.

실행 `lifecycle-probes.py --guard`는 실제제품guard 추출만: 정상1수용/음성5거절. `--canaries`는실제Node child/stream15 controlcanaries+parser음성15, SUT수용아님. v6받은4faultartifact재검문은sourceSHA결부된보존artifact replay, 새v7runtime아님. `observer-selfcheck.py --bootstrap-v6`도exactv6 SHA와현재preflight/control45검문일뿐이다. defaultv7runtime은bootstrapreceipt를거절한다. Gemini 구현후에는 `--canaries`/bootstrap으로 필수실제검수를 대신하지 않는다.

## 회신과 중단

HANDOFF의 정확 명령을 실행하고 PID/UTCstart/end/RC/원문file/fullSHA를 적는다. 각 run의 성공/음성실패와suite완료를 구분한다. control파일전체와owner/shared 수정전후fullSHA·byte·전체diff/hunks/음성조건·actualUI PNG12·console/pageerror/requestfailed0·자기resource정리를 보고한다. 자체설계/범위/정본변경·테스트완화·기존Log/운영DB/foreignPID/기존Chromeprofile정리 금지. 구현제출IMPLEMENTED는Sol수용과다르다.
