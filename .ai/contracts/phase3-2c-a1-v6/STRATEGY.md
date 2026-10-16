# A1 v6 — 단일 process 검문과 단계별 증거 소유

Sol 소유 / Gemini 읽기 전용. Action IMPLEMENT는 v5 FAILED 후 실행 전략을 대체한다. R32C-06 두 CORRECT 소진/초기화0 유지, CORRECT3이 아니다. v1 CORE9/fullUI87 불변. A1_NOT_ACCEPTED는 v6 실제 구현을 Sol이 독립 수용할 때까지 유지한다. A2 정상8/login/남은 A-N01~20와 B87은 별도다.

## 범위와 재사용

REPO `C:\Projects\Active\ShiftMgmt_V4`, main, HEAD `160940f9aaeb6696538447f83b44658073e382f0`, source341/기존dirty12. 수정은 owner `scripts/ui-checks/access-history.mjs` 및 shared `scripts/ui-checks/access-history-shared.mjs` 기존2파일, 각각30000bytes 이하. 보호339·frozen6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 유지. frozen은 `export const CANONICAL_8_ACTIONS =`부터 `export async function performWorkerIpcHandshake` 직전까지이며 그 안의 normal8 헬퍼는 A2 대상이다.

이미 확인한 전체 preflight hash/frozen loop, exact ACK/context/registration/RUN, contract-derived immutable collector, actualChrome/DOM/viewport/origin/fixture route, partial checks/cleanup/fallback을 유지한다. HEAD/main/status/source집합은 외부 --scope가 검문, owner는 baseline.files 중339와 baseline.control 전체를 bytes/SHA 검문한 뒤에만 port/run/temp/child/HTTP로 간다. baseline 자체는 상단고정digest, 표에서는 자기자신 제외. CLI/deferred는 기존 exactreceipt로 잠금검문 전 종료. 새 제품파일/설정/패키지/테스트/DB/API/UI/계산 변경·광역포맷·전체재생성은 금지다.

## 요구사항 / 실제 실패 연결

| ID | v5 finding | v6 동작 |
|---|---|---|
| E6-01 | 유지할 정상검문 | CLI→deferred→전체잠금→port→run/temp→spawn, 보호339/control/frozen 검문·lock3 부작용0. |
| E6-02 | A1V5-01/06 | owner 안의 단일 순수 `validateProcessReceipt`를 server/worker/adjudicator 모두 사용. 성공snapshot을1회 검문·복제·동결·캐시해 그 객체만 candidate/final에 연결. 삭제 전 및 final 전 검문 우회 금지. |
| E6-03 | A1V5-05 | ChildProcess 실제 spawn/error를 기다리고 첫 원 spawn error 객체/stack을 primary로보존. pid없음 즉시 synthetic error를 만들지 않는다. close/logphysical settlement와 null/noexit 원문 유지. |
| E6-04 | A1V5-07 | process guard→settled artifact bytes/SHA→temp삭제→atomic candidate→gate guard/응답binding→atomic final→단일PASS. 늦은callback오류를 유지·재검문하며 directcandidate write 금지. |
| E6-05 | A1V5-02/04 | core raw/errors/context/acquisition을 첫fs호출 전에 소유. repository realpath도 try안, actualcompiled bytes/hash는 require 전에 즉시 raw에 보존. 모든 early 실패 partial/fallback. |
| E6-06 | A1V5-03/04 | 준비rows와 실제requests를 단일 acquisition state에 유지. count는 route설치 성공 전 null, 성공 직후0, handler에서 push한 실제length로 즉시갱신. 실패에도 acquisitions·non-null rulechecks 보존. |
| E6-07 | A1V5-T01 | 원본46 보존+추가5=runtime51, partial11, observer45/변조9, logread/atomicpublication 실제순서, originalspawnstack3 검문. 기대close문자열2를 실제earlierledger거절과 일치시킨다. |
| E6-08 | A1V5-R01 | fullSHA/bytes/모든diff추가·삭제/hunk/명령별PID·UTCstart/end·RC·원문artifact·요구/결함대조를 회신. IMPLEMENTED는 제출이며 수용이 아니다. |

## owner 상태 전이 — 순서를 바꾸지 않는다

```text
WORKER_SETTLED → SERVER_SETTLED → PROCESS_RECEIPTS_VALID → ARTIFACTS_HASHED
 → TEMP_REMOVE_COMPLETED → CANDIDATE_ATOMIC → GATE_SETTLED
 → GATE_RECEIPT_VALID → GATE_RESPONSE_BOUND → FINAL_ATOMIC → PASS
```

1. HANDOFF 고정 v6 execution/baseline/gate path/SHA로 상단constant 변경. originalv1/fixedPython 유지. case/경로/env override 또는 다른gate 금지.
2. 기존 ProcessRecord를 재사용하고 callback마다 원문7키 event/timeMs/stream/pid/code/signal/error를 한번 기록한다. error={name,message,stack}는 원오류. `.spawn/.exit/.close`와 stream finish/close는 once, error는 추가발생분 전부 보존. 어떤 timestamp/clamp/fallback/exitCode??0도 금지. noexit→exitSeen=false/exitAtMs·exitCode·exitSignal=null, 실제closeCode·closeSignal은 독립 원문이다. currentseen/maps는 기다림용으로 유지할 수 있지만 snapshot은 callback과 exact 일치해야 한다.
3. owner에 **하나의 validateProcessReceipt(record)**를 둔다. 세process 모두 같은함수를 호출한다. 다른프로세스용 축약검문/복사guard를 추가하지 않는다. 아래 규약 및 고정 `evidence-v6.py:process_receipt(success=True)`와 동작 일치: 정확한event7keys/type/finitepositive, callback count7/errors0, 각singles spawn/exit/close1회·각streamfinish/close1회, first3 spawn→exit→close, 전체arraytime비감소·각stream finish→close, scalar/flag/time/code/signal exact대조, PIDpositive integer/closeSeen/exitSeen/양streamsettled/실제childclose, originalcode/type. worker/gate exit0은 별도 actor결과 검문, server actualsignal/nullcode는 보존. localguard 실패는 원내용을 담아 **A1_LIFECYCLE_INVALID**로 기록한다. 외부Python을 이 guard 대용으로 실행하지 않는다.
4. 실패snapshot에는 성공guard를 강제하지 않는다. 실제관측된부분/null/역전시각/원error를 보존한다. 성공receipt는 실제settlement 뒤 **snapshot1회→guard→deepclone/deepfreeze→cache**하고 이후manifest에는 이 정확한객체를 사용한다. guard한뒤 다시 toManifestRecord를호출해새snapshot으로교체하지 않는다. failure에는 현재 실제state를별도snapshot한다. 일반 JSON serialization이 원문값을 보정하지 않도록 한다.
5. spawn 즉시 attach하고 actualspawn/error Promise를먼저구독한다. positivepid가있어도 actualspawn을 기다린뒤 identity/registration을쓴다. pid없음은 기다림의상태일뿐 primaryerror 생성근거로전용하지 않는다. actualerror callback의 같은객체/stack이 primary, parentcatch는 primary를덮지않는다. failedspawn도 실제ChildProcessclose와 양logsettlement를 기다려 failure증거로 남긴다. 자기ChildProcess.kill만 사용, 숫자PID살아있음검문은close대용이 아니다.
6. worker/server stop 및actualclose→양logfinish/close→lateerror drain→둘의cachedguard를 완료한다. 기존 graceful/forced 각5초/log각5초/gate15초 deadline 유지. close없음 A1_CLOSE_UNVERIFIED, finish없음 A1_LOG_FINISH_UNVERIFIED, close없음 A1_LOG_CLOSE_UNVERIFIED, logerror A1_LOG_WRITE_FAILED. 실패cleanup은 두stream/자기child를 독립시도, primary유지·temp보존한다.
7. **이후에만** 모든candidate artifact bytes/SHA/PNG metadata를 읽는다. 아직쓰는logfile을읽어snapshot하지않는다. 성공core의 raw/worker-final/checks/acquisition을 owner mutable state에도 즉시저장해 이후gate/candidate/final실패에서 raw획득분이null이되지않게한다. 실패worker는 core-partial/fallback의같은state를읽어참조/값/획득checks를보존. 회귀metadata는기존보호script/checks정본그대로다.
8. callbackerror listener는 final 직전까지 유지. 각후속단계에서 primary/errors0 및cachedreceipt 뒤 추가callbackerror없음을검문한다. 삭제직전 worker/server guard에실패하면 gate를spawn하지않고temp보존. 실제rm완료시 tempRemovedAtMs, candidate봉인시 sealedAtMs를 Date.now 그대로찍고역전/미관측은FAIL. gate단계오류는이미삭제된temp를복구했다고주장하지않는다.
9. sibling `owner-candidate.json.tmp` write+rename→owner-candidate.json으로atomic publish. write/rename오류는 **A1_CANDIDATE_WRITE_FAILED**와최초stack, owner-failure/fallback으로보존. candidate가생성됐다는것은PASS가아니다. errors/receipt는mutable객체의별도snapshot, candidate파일hash는게시뒤실제bytes로계산한다.
10. 고정gate 실제rc0/close/양logfinish+close/drain 후 **동일validateProcessReceipt로 adjudicator guard/cache**를먼저완료. 여기서clock/ledger이상이면A1_LIFECYCLE_INVALID·final/PASS0. 그뒤actual stdout outerexact{status,result}, innerexact8키/값(candidateSHA/execSHA/case/runId/checks/artifact/acceptance/status)·stderr0을 검문한다. atomic owner-final→단일stdout PASS. late error/receipt 불일치/원음성조건은PASS를게시하지않는다.

실제ACK 원문receipt={packet,receivedAtMs}를 callback에서복제하고원7키/type/value/contextSHA/nonceSHA를 RUN 전에검문한다. invalidunknownkey를제거하지않으며failure에도원packet을보존. core 아닌보호회귀는ackReceipt=null/contextAck=false/runAuthorized=false.

## shared 상태 소유 — 모든 fallible 준비를 감싼다

1. `runContractCore` 첫단계는 **I/O 없는state초기화**다. raw 정확한10키, 미획득null, resources=[], rawErrors4빈array. errors={primary:null,cleanup:[],evidence:[],unexpected:[]}, context/workeridentity, checks=[], acquisition={fixtureRows:null,fixtureRequests:[],routeInstalled:false}. `fs.realpathSync(context.repository)` 및findChrome/exists/read/createRequire/import/fixtureprep도모두try안이다. finally→획득checks→atomicpartial/fallback 단일실패게시경로를 모든준비단계가공유한다.
2. repositoryrealpath성공후 실제compiled `REPO/dist/server/shared/domain/access-log.js`를 읽는다. read성공즉시 raw.canonicalLabels={path:actualpath,bytes:actualbuffer.length,sha256:actualbufferSHA,labels:null}; **그뒤** require/map검문, map획득시 labels만실제map으로갱신. read실패는canonicalLabels=null. import실패는이미획득path/bytes/SHA를null로되돌리지않는다. labels=null의partial은정상불완전증거이며successcollector는fullmap을요구한다.
3. frozen createMockAccessLogs(8)을호출해실제rows를acquisition.fixtureRows에저장하고actualcompiledmap으로actionLabel설정한다. 임의fallbacklabel금지. 실제준비한row labels를raw.fixtureLabels로보존한다. route미설치시에도준비rows/labels획득분은partial에남기며성공을주장하지않는다. fixtureRequestCount는여전히null이다. 준비중오류에서도실제state를보존한다.
4. actualChrome path/version확인성공직후 raw.chrome획득분, launch/newContext 성공직후 createdevent를기록. create前created금지. 실제browserVersion을획득시만채운다. errorhooks는goto보다앞선다. page.route가**실제로성공한후** acquisition.routeInstalled=true 및 raw.fixtureRequestCount=0을대입한다.
5. handler진입시 actualrequest {url:req.url(),method:req.method()}를acquisition.fixtureRequests에push하고 **동일함수에서즉시 raw.fixtureRequestCount=array.length**로갱신한뒤 actualprepared8rows를fulfill한다. viewport/DOM/PNG완료까지갱신을미루지않는다. route설치실패는count=null/requests=[]/routeInstalled=false, CORE-05check미획득이다.
6. actualpage.url/viewportSize/loginDOM을획득즉시raw에보존. viewportnull은null과원failurestack·alreadyacquiredDOM을보존, 1440x900대입금지. captureId는실제PNG성공후만 core-capture. success는v1 기대값/각resource3states/IDsstring/actualcanonicalpath/types/finite 전부검문.
7. context→browsercleanup은실제있는각handle을독립적으로닫는다. firstcleanupthrow는primary 및cleanup에도같은원stack, 이미primary있으면보존. 실제close-error를closed로바꾸지않는다. acquisition과raw mutable state는cleanup후snapshot한다. partialchecks는원본rules순서에서actual이null아닌 모든pointer(빈array/0/false 포함)의exactclone이며expected/verdict를채우지않는다. rawErrors/resources 초기knownempty는CORE-06/08에포함한다.
8. core-partial/fallback에 기존status/case/runId/context/worker/raw/checks/errors와 **acquisition정확한3키**를추가. 성공worker-final에도같은acquisition을추가하고 기존measurement exact5키와fixtureRows/fixtureRequests가same실제array값이어야한다. routeInstalled는실제설치성공값. raw10키와v1rules는늘리거나바꾸지않는다. fixedv6helper acquisition_checks는count/requests/route-state 및partialcanonical metadata를대조한다.
9. owner-failure의acquisition은corestate를획득했으면원값, 아직corestate없거나회귀case면null. raw가있으면그state와checks/acquisition이exact다. earlyownerfailedspawn의raw/checks/acquisition이미획득이면null/[]/null이맞다. lateownerfailure에서획득한core raw를버리지않는다. primary terminal.error stack은artifactprimary와byte동일, cleanup/evidence오류는secondaryarrays. primary게시실패는지정fallback atomic1회, 둘다실패하면own증거/temp보존·기존단일stderrreceipt유지.

## 유지할 독립 계약

collectCoreChecks는동기/단일인수·originallocked foundation.rules ID/pointer/expected·actualdeepclone/freezing을유지한다. raw/nestedexactkeys/type/finite/resourceexact3상태·distinctstringID·actualcompiled경로/fullmap·installedfinderpath/version을검문. CORE-03은count/visible만. caller expected/tolerance/verdict/추가argument금지. successviewport/origin/fixtures8/count0/rawErrors/capture는원본기대값그대로다.

resource/process 실패증거는진짜미관측null/false를허용하고순서를보정하지않는다. 원raw10/checks구조·IPC19·normal8 frozen·protected shell/home metadata·fullUI87/A2 의무는불변이다. 새metadata acquisition은partial/worker-final/owner-failure에만추가되며정상raw키나원본rule수를바꾸지않는다.

## 검증과 실행 중단

- runtime51=원본v5의46 + server-timestamp-regression/gate-timestamp-regression/worker-ledger-scalar-mismatch/gate-ledger-scalar-mismatch/owner-candidate-write-denied5. 각faulthealthyobserver/actualtrigger/rc1/exactterminal/firststack/quiescence/partial필수. worker/server clock·workerledger는삭제前FAIL/temp보존/gate0. gateclock/ledger는final/PASS0·이미삭제된temp복구주장0. candidatewrite오류는A1_CANDIDATE_WRITE_FAILED.
- ledgerfault는**1회만** 성공snapshot clone을1000ms손상시켜사전guard를시험한다. 실제callback원문과failure의다음snapshot은바꾸지않는다. 원spawn-error3의primary.stack을actualerrorcallback.stack과직접대조한다.
- 관측양성3에서는 worker/server/adjudicator의 stdout/stderr 실제log읽기6종을 모두 요구한다. sync/async read를관측하며 미관측읽기는통과시키지않는다. actualchildclose와양logfinish/close 뒤log-artifact-read, candidate/final stagingwrite→실제rename완료를observerseq로검문. old46반드시유지, close-receipt2 expected를actualearlierledgermessage에일치시키되FAIL/유형/관측검문을완화하지않는다.
- partial11=기존7 + repository-realpath-failure/request-then-viewport-null/canonical-import-failure/route-install-failure4. validACK/RUN/actualChrome·stub/raw/acquisition/checks/atomicfallback·firststack 검문. 실제요청1→partialcount1/CORE-05actual1, import실패→actualpath/bytes/SHA·labelsnull, 설치실패→countnull/CORE-05없음/준비8rows보존.
- observer45=기존39+server/gateclock delivery2/worker/gateone-shotclone delivery2/candidateatomicdenial1/settledlogread+atomicpublish1. hash-chain변조9거절. typed32/semantic6/top4/실제Chromeclose2와privateIPC19+port 유지. parser기존19+35/새receipt43음성은control proof다. artifact/publish관측validator 및 CORE실패획득증거binding의순수양성3/음성13도검문한다. 후반실패 raw/checks/acquisition은 worker파일의 최초실제읽기 관측값과exact대조하고 core-partial경로도보존한다. fault에 의한사후artifact변조는 최초읽기값을대체하지않는다.
- `--bootstrap-v5`는initial현재v5두fullSHA에서만허용. expiredoldbaseline 때문에enabledownerpublic은실행검문하지않고occupiedport의A1_LOCK_MISMATCH·부작용0을확인한다. defaultruntime은bootstrapreceipt거절. privatebootstrap4는exactv5의확인된결함을실제다시감지하는control proof이며v6제품수용이아니다. 원v5controls/TODO/state를복원하지않는다.
- static/build/map90/관련3파일11 및actual무계측3+관측3/final6/12PNG·CLI9/deferred8/lock3·runtime51/private19+port/typed32/partial11 전부필수. Sol은자료만으로끝내지않고source의공유guard/획득단계/원자게시순서와actual실행을독립검수한다.

모순/두파일·30k·frozen내불가/보호SHA·branch/status drift/필수환경없음이면BLOCKED 또는UNVERIFIED_STOP, 범위확장/검사완화/추정PASS/회수초기화금지. 필요한짧은helper는owner의기존ProcessRecord/guard대상영역에두고중복검문을대체한다. 기존frozen밖의반복/사라진legacyguard/comments는요구사항과직접연결된hunk에서만축소할수있으며파일전체포맷을허용하는뜻이아니다. Gemini제품writer·사용자수동relay유지. 자기child/정확ownfixture만다루고foreignPID/과거run/운영DB/기존profile정리금지.
