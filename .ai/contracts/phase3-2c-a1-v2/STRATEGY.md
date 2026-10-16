# Phase3-2c-A1 실행 전략 v2 — 고정 외부 판정의 필수 호출

Sol 제어 문서. 사용자의 「응 진행해줘」「작업이 멈췄네 이어서 작업해줘」는 A FAILED 이후 실행 전략 재검토와 새 패킷 준비의 승인이다. 제품 코더 Gemini/수동 중계 유지. Sol은 제어 문서와 독립 검수 도구만 작성하며 제품 source/test/config/migration 수정0.

## 1. 판단과 단계

v1의 고정 계약은 잘못된 PNG/중복ID/raw오류/close미관측을 거절했지만 제품 owner는 PASS로 처리했다. v1를 다시 설명하는 동일 CORRECT 지시를 보내지 않는다. **worker를 관측 생산자로만 두고 owner의 성공 경로에 고정 외부 판정 프로세스를 필수로 연결한다.** 동시에 화면body와 수명관리 변경의 결합을 끊는다.

고정 요구사항 매핑은 아래와 같다. 실행 증거가 없는 항목은 미검증으로 회신한다.

| ID | 구현 위치 | 필수 동작 |
|---|---|---|
| E2-01 | owner CLI/preflight | 고정 저장소·닫힌 CLI·등록 8case stage 차단·점유 port 검문을 부작용 전에 완료 |
| E2-02 | owner registry/server readiness | 생성 직후 handler, 단일 deadline, 실제 health/temp/listening 대조, 첫오류 보존 |
| E2-03 | shared performWorkerIpcHandshake/owner IPC | protocol2 등록/실제 PID/고정 경로/hash 검문, ACK 검증 뒤 별도 RUN 승인 |
| E2-04 | shared runContractCore | 실제 DOM/viewport/요청/event/Chrome/compiled labels/순수 fixture 관측과 CORE9 연결 |
| E2-05 | shared collectCoreChecks | 고정 expected/op/ID/pointer, recursive finite/type 검문, immutable actual snapshot, 추가 인수 거절 |
| E2-06 | shared settleOwnedResources/owner teardown | 독립 context→browser close, primary 보존, 실제 child exit/close/log finish, 불확실하면 temp 보존 |
| E2-07 | owner protected regression dispatch/evidence | 변경 없는 runner 실제 실행, 원 manifest/4+1 PNG/복사/수명/오류 검증과 3 raw pointer |
| E2-08 | owner seal/adjudicate/publish | 정리 후 candidate, 고정 외부 gate 실제 subprocess, gate close/log finish 뒤 atomic 최종 쓰기와 단일 PASS |
| E2-09 | 두 allowed 파일/검증 회신 | 보호339/frozen helpers/control 보존, 실제 양성/음성/IPC/close 증거, A2/B 미수용과 미검증 명시 |

- A1: owner/shared2개만 수정. 실제 core9와 기존 보호 회귀2를 실행하고, 모든 정리/로그 종료 후 sealed candidate를 외부 gate가 실제 검증한 경우에만 최종PASS. CLI/IPC/오류주입/실제Chrome close음성도 필요.
- A2: 별도 다음 패킷. 기존 normal8 로그인 회귀 복구, 실제 body와 retry/query/관측 보존, 첫오류/cleanup/partial 증거, 원래 A-N01~20의 모든 남은 하위조건. A1 성공만으로 **A 전체 수용 불가**.
- B: A1+A2를 Sol이 독립 수용한 뒤 별도 패킷.8화면/2회귀 전체87ID. 현재허용0.3-2/3-2d/3-3/3-1e 사용자직접확인도 별도다.

이것은 요구사항 삭제가 아니다. 원래 `phase3-2c-v1/contract.json` CORE9/fullUI87, STRATEGY, checker, baseline을 그대로 보존한다. v2는 실행 slice/새 기준 snapshot이다. R32C-06, V32F-01~06, A32F-01~08 및 두 번의 기존 동일군 CORRECT 소진은 유지한다. 번호를 A-CORRECT1로 바꾸거나 회수를 초기화하지 않는다. A1 실패시 자동 추가수정 요청이 아니라 Sol 진단으로 반환한다.

## 2. 수정 경계와 보존

| 파일 | 허용 변경 | 보호 |
|---|---|---|
| scripts/ui-checks/access-history.mjs | A1 owner의 explicit 상태/registry/닫힌dispatch/candidate→gate→publish 경로 | 제품파일 추가0, 인증/API/DB/의존성/설정 변경0 |
| scripts/ui-checks/access-history-shared.mjs | core 전용 관측/불변 비교/2단계IPC/독립 close집계, import와 direct-entry 분리 | frozen-shared.json의 기존 helper/legacy collector 구간은 정확히 보존. A2 body와 helper로그인 수정은 이번허용0 |

positive/negative 두 모듈을 포함한 나머지339개 제품 파일과 기존 protected helper/runner/map/UI/model/tests는 바이트 보호다. 두 allowed파일도 각각30,000bytes 이하. 파일집합341/dirty12/HEAD/main 그대로. baseline은 새 TODO/state 계획을 고정한 뒤 생성하고 Gemini read-only다.

기존 `performLogin`의 #login-btn 회귀 및 legacy AssertionCollector 결함은 frozen 상태의 **알려진 A2 미해결**이다. A1 실행경로는 그 함수/collector를 호출하지 않는다. shared의 원래 export를 제거하거나 정상body를 정리하지 않는다. core는 새 `collectCoreChecks`만 사용한다. source hunk review로 실제 호출경로를 확인한다.

제품 계산/승인forward-only/SQLite36표/API111/권한4단계/도메인/운영데이터/엑셀원본은 그대로다. V3.4 읽기전용, 운영 DB/JSON 연결금지. realowned 임시서버/설치Chrome만 사용, auth/list/users route fixture와 broad401 예외금지. corefixture는 오직 순수 생성함수의 결과를 읽는다.

## 3. 경로와 불변 입력

repository는 `fileURLToPath(import.meta.url)`에서 이 파일의 실제 위치로 계산한 `C:\Projects\Active\ShiftMgmt_V4`와 일치해야 한다. cwd도 그 realpath와 동일해야 한다. process.cwd만 기준으로 임의 저장소를 신뢰하지 않는다.

원래 계약: `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\contract.json`, SHA `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE`.
새 실행 계약/판정기: 이 디렉터리 `execution.json`, `gate-evidence.py`, `baseline.json`. HANDOFF의 full SHA/bytes를 상수로 잠근다. caller/env/IPC가 경로·hash·expected·tolerance·PASS를 바꿀 수 없다. 계약 전체를 recursive finite/type 검문하고 deep-freeze한다. 원문 duplicate JSON key는 Sol gate가 거절한다; caller 입력을 합쳐 expected를 생성하지 않는다.

public CLI는 정확한 한 인수 `--case=<등록문자열>`만 받는다. trim/빈값/중복/추가/unknown/URL/공백 우회금지. v1의11 public case등록은 유지한다. A1 enabled3만 실행한다. 등록된 나머지8은 RC1/stdout `{status:'BLOCKED_STAGE',case,reason:'A2_PENDING',stageSlice:'A1'}` 후 종료한다. **그 전에 앱temp/서버/워커/Chrome/HTTP/제품run 디렉터리 생성0**. 이를 FAIL_INCOMPLETE 또는 기존body실행완료로 표기하지 않는다.

malformed CLI/cwd/path/hash mismatch와 점유port는 부작용 전에 거절한다. 최초 free-port검문은127.0.0.1:18741에 bind후close만 하며 HTTP/프로세스/앱temp 생성이 없다. 포트가외래점유면 아무요청도 보내지 않는다. preflight 실패는 stderr의 구조화된첫오류와 RC1으로 증명하며 제품폴더파일쓰기 없어야 한다.

## 4. owner 상태, 자원 registry와 시간

```
PRECHECK -> PORT_FREE -> OWNED_DIRS -> SERVER_READY
 -> WORKER_STARTED -> CORE_ACK -> CORE_RUN (보호회귀는ACK/RUN없음)
 -> WORKER_SETTLED -> SERVER_SETTLED -> LOGS_SETTLED -> TEMP_REMOVED
 -> CANDIDATE_SEALED -> GATE_STARTED -> GATE_SETTLED -> FINAL_ATOMIC_WRITTEN -> PASS_OUTPUT
```

어떤 단계든 실패하면 firstError를 한 번만 설정하고 종료 수순으로 이동한다. primary를 cleanup/evidence오류로 덮지 않는다. error entry는 `{phase,name,message,stack,timeMs}`; primary없음은null, cleanup/evidence/unexpected는배열이다. 정상후cleanup나쓰기실패도최종FAIL/RC1. 모든 spawn/error/exit/close/pipe-error 관측은 생성 직후 registry에 연결하고, child PID없는 spawn-error도 firstError로 보존한다. spawn은반드시 windowsHide:true, cwd고정, 명시argv이며 소유 ChildProcess handle만 kill한다.

child env는 기존처럼 SHIFTMGMT_/SHIFT_ 및 NODE_OPTIONS/NODE_PATH/NODE_DEBUG/SOL_A1_PROBE/SOL_A1_PROBE_EVENTS를 제거한 뒤 **자기** `SHIFTMGMT_USER_DATA_DIR`, `SHIFTMGMT_PORT=18741`, `SHIFTMGMT_UI_BOOTSTRAP_FILE`만 설정한다. protectedrunner용 SHIFT_TARGET_URL/SHIFT_RUN_DIR는필요없음. process.execArgv 자동전달금지. core는NODE_OPTIONS빈/execArgv0을확인. owner의 검수용 --import는 child에 전달하지 않는다.

server bootstrap은 `temp/data/bootstrap-credentials.json` 존재만 검문한다. credential/cookie/nonce원문을 로그에 쓰지 않는다. server listening로그는 buffered문자열로 수집하여url과 temp경로를완전히확인한 뒤 `/api/health` status정확200/JSON.ok=true/data.dataDir==소유temp를확인한다. owner가signin요청을 추가하지 않는다. readiness전체는30,000ms **단일 deadline**이고 fetch/body/JSON/부트스트랩대기도남은시간에포함된다. controller.abort를항상finally실행하고 timeout handle을모든종료에서clear한다.300회반복×요청1초로 대체금지.

ACK5s/RUN대기5s/core90s/shell120s/home180s/normalgrace5s/forcegrace5s/logfinish5s/gate15s는 execution.json 기준이다. 성공시 타이머를 반드시clear하며 timeout을unref만하고 방치하지 않는다. timeout/조기server종료시자기worker부터terminate→실제exit/close→서버terminate→실제exit/close→로그finish. SIGKILL 요청을 실제close로 간주하지 않는다. 모든 close시간은 이벤트 발생값만 기록하며 Date.now default로 채우지 않는다.

로그 stream은error handler를 생성직후연결하고 pipe가끝난후end/finish/error/closed를 deadline내확인한다. 서버stdout/stderr를서버죽이기전에닫지않는다. hash는 close/finish뒤 실제디스크bytes로 계산한다. serverstderr의기존SQLite ExperimentalWarning은브라우저오류로분류하지않지만 I/O오류와 실제예상외브라우저events는보존한다.

temp 삭제는 **모든 소유 실행자 exit+close/PID비생존/portfree/브라우저closed**를확인한후만 한다. 관측이실패하거나 PID재사용으로애매하면 FAIL/소유temp보존/정확경로보고. foreignPID를죽여성공을만들지않는다. 이 경우 fault controller가actualclose를관측했더라도 제품owner는자신의quiescence를꾸며쓰기금지. 운영temp/oldrun/profile삭제금지.

## 5. core worker — ACK후에도 RUN까지 대기

direct-entry는 `fileURLToPath(import.meta.url)`와argv[1]의realpath가같을때만CLI검문/IPC를시작한다. import는browser/HTTP/temp/파일0. shared의 import가능한export `collectCoreChecks`/`settleOwnedResources`는 core가 실제로쓰는같은함수다.

worker case는 core만A1허용. positive/negative가호출하는 `performWorkerIpcHandshake`도normal8이면stage거절을먼저반환하여 frozen private entry가body에진입하지못하게한다. IPCchannel없음/불완전CLI/env위조만으로는실행불가. process.ppid/실제workerPID/등록case/nonce/고정paths/hashes를확인하며임의native부모의악의적공격에대한OS인증이라고주장하지않는다.

owner는실제child생성직후message/error/exit/close handler를먼저연결한다. 소유run내 `owner-registration.json`을원자적으로쓴다. 스키마:

```
{protocol:2, case:'contract-core', ownerPid, workerPid,
 nonceSha256, contextSha256, context}
context={repository,url,runDir,tempDir,bootstrapFile,
 contractPath,contractSha256,executionPath,executionSha256}
contextSha256=SHA256(UTF8(JSON.stringify(context))) upperhex
```

context key순서는위와동일하다. marker/context는같은JSON객체의복사이며nonce는marker에hash만쓴다. runDir은 `artifacts/captures/phase3/access-history-contract-core/run-*`의 **직접 자식**이고 `path.relative`/realpath로확인. prefix startsWith/sibling/junction탈출금지. temp는real os.tmpdir의직접자식/정확prefix, bootstrap은그temp/data/bootstrap-credentials.json실제파일, contract/execution은고정절대실제파일/고정SHA. URL은정확고정127.0.0.1:18741/다. JSON을읽고SHA실측하기전network/browser생성없음.

owner송신 `{type:'owner-context',protocol:2,case,ownerPid,workerPid,nonce,contextSha256,context}`. worker의marker가packet과실제process PID/ppid/noncehash/contextdigest일치해야한다. 검문이끝나면 `{type:'worker-ack',protocol:2,case,ownerPid,workerPid,nonce,contextSha256}`만보내고RUN을기다린다. owner는각필드/동일PID/nonce/digest를검증하며badACK이면즉시실패(그뒤 contextAck=true로진행금지).

owner송신 `{type:'owner-run',protocol:2,case,ownerPid,workerPid,nonce,contextSha256}`가완전히일치한경우에만coreChrome/HTTP/파일수행. wrongRUN/noRUN/duplicatecontext/replayedRUN은실패. handshake/RUN timeout의stderr구조화오류만있고worker가제품파일을쓰지않는다. 부작용0과validACK/noRUN의정상대기는ipc-probes.mjs로실제검증한다.

## 6. actual 관측과 cleanup — v1 CORE9 유지

실제 설치Chrome은protectedfindChrome,1440x900이며font완료를기다리고 **로그인페이지까지만** 읽는다. credential본문을열람/로그인하지않는다. raw event listener는goto전에연결한다. viewport는실제page/window값,origin은실제page.url,loginInputs는DOM개수/visible,fixtureRequestCount는실제로계측한access-logs:list/users요청수다. 상수0/true/고정[1440,900]를actual대신넣지않는다.

fixtureLabels는 **실제** `createMockAccessLogs(8)` 반환의actionType/actionLabel에서추출한다. compiled `dist/server/shared/domain/access-log.js`를실제로import해정본map/파일bytes/SHA를기록하고각fixturelabel을대조한다. CANONICAL_8_ACTIONS만복사해실행한척하지않는다.

core raw 형태와9pointer는v1그대로다. `collectCoreChecks(observations)`는정확1arg만받고고정 `foundation.rules`를순회한다. callerexpected/tolerance/pass/ID변경을받는API로쓰지않는다. recursivefinite/type검문,고정op판정,각pointeractual을deepclone/deepfreeze한 `{id,sourceArtifact:'core-observations',pointer,actual}`9개를만든다. unknownop/ID/중복/누락/추가/source/pointer오류는failclosed. installed-chrome/resourcesop도실제관측기준으로검증한다. legacyAssertionCollector를core에서사용하지않는다.

성공한browser/context 생성 **후즉시**각resource를registry에등록한다. 생성시작을created성공이벤트로쓸수없다. browser생성후context생성이실패해도browser를정리한다. `settleOwnedResources({context,browser}, resources, errors)`는context→browser를각각try/catch하여앞close예외가뒤close를건너뛰지않게한다. resources항목 `{kind,id,events:[{state:'created'|'close-start'|'closed'|'close-error',timeMs}]}`; error는구조화해errors.cleanup에추가하며primary는건드리지않는다. close-error는closed로위장하지않는다. 모든resourceevent시각은실제worker생성~close범위여야한다.

worker실패도이미수집한raw/부분checks/firstError/cleanup을소유run에best-effort저장한다. writing실패는추가error와stderr stack,RC1. handshake/RUN이전에는아티팩트쓰기0. 정상core는worker-final.json에case/runId/contractSha256/pid/parentPid/nonceSha256/checks를기록한다. raw오류console/pageerror/requestfailed/badResponses는수집그대로이며core예외allowlist0.

## 7. 보호 회귀 — 원래 runner와 원래 증거를 확인

변경없는보호scripts/lib/ui-check.mjs를실제로호출하는아래dispatch만허용한다.

| case | argv (첫값 실제process.execPath) | actual child output |
|---|---|---|
| regression-shell | node.exe absolute-shell.mjs http://127.0.0.1:18741/ | id=shell,original artifacts/captures/phase3/shell/run-*/manifest.json;captures admin-expanded/admin-collapsed/watch-stopped/operator |
| regression-home | node.exe absolute-home.mjs http://127.0.0.1:18741/ --case=live-admin | id=home-live-admin,original artifacts/captures/phase3/home-live-admin/run-*/manifest.json;capture home-live-admin |

원commonmanifest에는process/close/temp정보가없다. parent registry가그정보를보완한다. stdout의정확한 `- manifest: <relative-path>` 1개를읽어actual현재child출력과결합한다. historydirectory검색/가장최신폴더추측금지. path는맞는root의직접run-*자식에있어야하고timestamp/mtime은실제child생성~close범위다. 실제보호runner SHA/argv/PID/RC/exit/close,manifestPASS/errors7fields,viewport/health자기temp/설치Chrome,각PNG실제bytes/CRC/IEND/폭1440/높이>=900을확인한다.

actual manifest와PNG를owner run에복사한다(원본불변). `regression-manifest.json`, `regression-capture-<name>.png`. originalPath/copyPath/bytes/SHA/dimensions를기록하며원본과복사가실제동일해야한다. stdoutPASS/childRC0만으로는성공불가.

`regression-observations.json`:

```
{runner:{script:absolute,sha256,argv:[nodePath,script,url,...extraArgs],pid,exitCode},
 evidence:{manifest:{originalPath,copyPath,bytes,sha256},
           captures:[{name,originalPath,copyPath,bytes,sha256,dimensions}]},
 result:{status:actualCommonManifest.status,errors:actualCommonManifest.errors,
         serverHealth:actualCommonManifest.serverHealth}}
```

checks는v1의REGSHELL-01/02/03 또는REGHOME-01/02/03 정확순서로sourceArtifact='regression-observations',pointer='/runner','/evidence','/result',actual=해당raw전체값의불변복사다. stdout문자열에가짜JSONpointer를넣지않는다. original commonserverHealth는payload자체 `{ok:true,data:{...}}`이며httpStatus/payloadwrapper를발명하지않는다. owner가관측한실제readinessHTTPstatus는server.health의별도필드다.

## 8. candidate → 고정 gate → 최종 publish

성공예정의candidate는**모든 정리/로그finish/템프삭제 뒤**만만든다. status=READY_FOR_ADJUDICATION,exitCode0이며아직PASS아니다. file=`owner-candidate.json`. manifest 공통필드:

```
{schema:'shiftmgmt.verifier.evidence.v1',stage:'foundation',stageSlice:'A1',case,runId,
 contractSha256,executionSha256,status,exitCode,
 owner:{pid,nodePath,nonceSha256,context:{url,runDir,tempDir,bootstrapFile}},
 worker:{pid,parentPid,nonceSha256,contextAck,runAuthorized,argv,exitCode,
         exitSeen,closeSeen,aliveAfterClose,createdAtMs,exitAtMs,closeAtMs,
         logsSettled:{stdout:true,stderr:true}},
 server:{pid,stdoutListenVerified,exitSeen,closeSeen,aliveAfterClose,
         portListeningAfterClose,createdAtMs,exitAtMs,closeAtMs,
         health:{status:200,payload:actualHealthJson},logsSettled:{stdout:true,stderr:true}},
 cleanup:{tempRemoved:true},errors:{primary:null,cleanup:[],evidence:[],unexpected:[]},
 artifacts:[{id,path,bytes,sha256}],checks}
```

regression의contextAck/runAuthorized는false로기록한다(IPC를실행한척금지). worker.parentPid와noncehash는owner가관측한spawn등록정보다. coreartifact7는v1그대로. regression은server/worker로그4+regression-observations/manifest2+실제캡처4또는1이며execution.json이정확집합을제공한다.

owner는 `gate-evidence.py --execution-sha <locked> --baseline-sha <locked> --candidate <absolute-owner-candidate.json>`를 **Python subprocess로 실제 호출**한다. 이프로세스도registry,15s deadline,error/exit/close/logfinish검문. Pythonexecutable은착수때 `python`으로이제어프로그램실행이되는지확인한실제경로이며HANDOFF명령과같다. shell을경유하지않는다. 실행stdout/stderr는owner run의 `adjudicator-stdout.log`/`adjudicator-stderr.log`에보존한다.

gate는고정source/controlscope,COREexactID/actualpointer/PNG전체,rawerrors/compiledmap,프로세스/port/temp/log,회귀원증거/캡처를실제검사한다. gate의selftest출력을candidate판정에쓰지않는다. 성공stdout은 `{status:'PASS',result:{status:'ACCEPTABLE_CANDIDATE',acceptance:'A1_PREREQUISITE_ONLY',case,runId,candidateSha256,executionSha256,checks,artifacts}}`. exactcandidateSHA/case/runId/실제RC0/close/로그finish/빈stderr가모두필요하다. gate실패/error/timeout/stdout파싱불가/추가오류/쓰기실패면ownerRC1/FAIL이다.

final은sealed candidate와같은내용에status만PASS로바꾸고아래adjudication receipt를추가한다. candidate수정은금지. 최종 `owner-final.json.tmp`를실제write→rename하여atomicpublish한다. finalize/write/rename실패면PASSstdout0/RC1/firstError+stack+cleanup+이미작성한아티팩트를stderr/실패증거로보존. writable오류파일이없어도stderr/RC1은필수다. 성공문구/최종JSON은final쓰기완료뒤단1회만출력한다.

owner의 성공 stdout은 단일 JSON line `{status:'PASS',case,runId,manifestPath:absoluteOwnerFinalPath,exitCode:0,stageSlice:'A1',acceptance:'A1_PREREQUISITE_ONLY'}`이다. 진단과 오류는 stderr에 쓴다. 실패 stdout에 PASS를 남기지 않으며 실패 응답과 stderr에는 primary/cleanup/evidence 및 소유 경로를 실제 관측값으로 보존한다.

```
adjudication={result:actualParsedGateResult,candidateSha256,gatePath,gateSha256,
 process:{pid,exitCode,exitSeen,closeSeen,aliveAfterClose,createdAtMs,exitAtMs,closeAtMs,
          logsSettled:{stdout:true,stderr:true}},
 stdoutPath,stderrPath,stdoutSha256,stderrSha256}
```

Sol은owner종료뒤 `gate-evidence.py --final owner-final.json`으로candidate/actualgate로그/receipt/최종내용동일성을다시검사한다. historicalPID재사용이면즉시독립재실행/생성시각대조하며foreign프로세스를죽이지않는다. 파일·JSON만으로실제클릭이나자원폐쇄를완전증명할수없으므로root source/hunks/실제fault/Chrome/실제PID를독립대조한다.

## 9. 고정 검수 도구와 필수 실행

모든고정도구는이디렉터리의Sol 제어파일이며Gemini수정불가. 실행stdout/stderr/argv/cwd/PID/time/RC를수신회신에원문으로연결한다. `--list`/`--self-test`는사전형식확인으로만표시하고실제SUT PASS로쓰지않는다.

1. gate --scope, typecheck,lint(기존5warnings),validate:map90,두node--check,gitdiffcheck,build,관련3files11tests.
2. uninstrumented enabled3을각각실행하고별도gate --final RC0. 실제core1/보호회귀4+1PNG,명령/7또는10/7artifact와한manifest한run일치. fonts/설치Chrome/rawerrors를실측.
3. `runtime-probes.py --execution-sha ... --baseline-sha ...`: enabled3 양성전제부터실제검사한뒤 malformed9/deferred8와실제24fault를실행. 양성실패면음성PASS를주장하지않고중단. 후보변조는실제worker/서버가실행된자기run의파일만조작하고필요hash/workerreceipt까지일관되게갱신해**내용 자체**의거절을시험한다.
4. `node ipc-probes.mjs`: 실제parent/workerIPC,14case와실제port점유. validACK후noRUN은5s RUNdeadline으로실패하며실제프로세스close관측상한은ACK수신후6s(후속종료1s포함)다. RUNnonce오류는즉시실패. preRUN workerHTTP/Chrome실행시도/파일0. OSWMI시작이벤트권한은이환경에서거부됨을실측했으므로worker에비밀없는system-path allowlist env+NODE_DEBUG=child_process만주고표준Node spawn진단을읽는다. 도구가먼저실제소유offlineChrome을spawn/close해동일관측채널을확인해야한다. diagnostic값으로guard를완화하지않는다. wrongURL/경로/digest/PID/case/nonce각각거절. consistent marker/context 변조로외부규칙검문을독립시험한다. port점유app-temp0/server/worker/HTTP0. validnoRUN fixturebootstrap은등록된실제빈JSON파일이며검문은경로/소유권이고credential본문열람을요구하지않는다.
5. `node component-probes.mjs --core-manifest <이번A1실제coreowner-final> --execution-sha ... --baseline-sha ...`: gate --final RC0인현재core를명시해 실제core가쓰는 SUT collectCoreChecks 고정expected/recursiveNaN/Inf/불변snapshot/추가arg거절. SUT settleOwnedResources를실제소유Chrome/context에호출해context.closethrow여도browser실제close,firstError보존을검증한다. UI전체검증으로주장하지않는다.
6. source341/허용2/보호339/controls/frozen구간 재해시와전체diff/초기dirty12 일치. commit/push/deploy/패키지추가0.

actualfault24: PNGheader24/CRC,duplicate/missing/extraID,callerexpectedfield/constantactual,rawconsole/page/requestfailed/HTTP(무관한401문자열 포함),canonicaldrift,worker/serverclose receiptfalse,실제serverclose관측억제,finalwrite거부,server spawnENOENT,serverlog쓰기실패,regressionchild종료0/증거0, wrongACK, ACK누락, RUN누락, adjudicator spawnENOENT, adjudicator log쓰기거부. 모두주입trigger와양성전제증거가필수다. candidate변조는실제gate호출및해당결함의gate거절문구가필요하며다른오류의RC1로대체불가. wrongACK/ACKtimeout은phase=core-ack, RUN미승인child실패는core-worker, 보호manifest부재는regression-evidence, serverclose미관측은close-server, gate생성오류는adjudicator-start로첫실패를구조화한다. write-denial은실제IO marker/stack을보고한다. malformed/deferredcase는preload의spawn/directory/file/fetch관측을모두0으로확인한다. 실제supervisor timeout/cleanup미확인은PASS아니며잠재자원경로를retained/보고하고STOP. close미관측fault의자기temp보존은의도한failclosed이며normalcleanup성공으로위장금지.

runtime 도구들이 검사하는 것은 A1의닫힌필수subset이다. 기존 A-N12의모든kill/timeouts,로그쓰기모든조합,normal8partial/오류상관/레이스 등의A2남은의무는삭제하지않는다. A1비완료와A2/B미검증을정확히회신한다. 요구/도구/schema/기존source가모순이면파일변경없이BLOCKED. 실패후의같은군자동CORRECT는없다.

## 10. 차단 기준과 회신

허용2/보호339/control/frozenhash차이,잘못된초기상태,기준commit다름,새file필요,30k초과,Python/설치Chrome/기준compiled모듈부재,source/functionexport/schema충돌이면Gemini가임의설계/범위확대를하지않고BLOCKED로반환한다. 시험실패/새회귀는FAILED로원문보고한다. 기대JSON을직접작성한self-report를실제증거대신사용금지.

HANDOFF의원요청본문은수정하지않고단독 `## 회신` 아래에만PROTOCOL/GEMINI형식회신한다. E2-01~09/A32F-01~08 각각 cause→changedfile:line→actualcommand→result/미해결을표시한다. 원본/artifactfullSHA/bytes는명령실측으로만쓴다. list/selftest vs SUT실행을구분하고firstError/retainedtemp/현재A2미해결/아직검증하지않은조건을명시한다. TODO/정본/Log/다른AI CLI는수정·호출하지않는다.
