# HANDOFF — Phase3-2c-A 검증 기반 IMPLEMENT / 독립계약 v1

- Task: 허위 PASS를 차단하는 owner·IPC·고정coverage·정리/증거 기반만 구현
- Action: IMPLEMENT — 새 단계 전략 A, 이전 CORRECT 회수 초기화 아님
- From: Sol(frontier/xhigh, Codex) — sole orchestrator
- To: Gemini — implementation coder / 사용자 수동 중계
- Time: 2026-10-01 17:24:01 KST
- 회신: 필요
- State: READY_TO_CODE(A only) / USER_RELAY_PENDING
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: main
- Baseline commit: `160940f9aaeb6696538447f83b44658073e382f0`
- Product source: 341 files / dirty paths12 / 허용4 / 보호337 / 새제품파일0
- 이번 결과가 수용해도 전체3-2c/Phase3-2 완료·commit·3-3 착수로 확대하지 않는다.

# 회신 요청

Gemini는 착수 게이트 불일치면 제품을 수정하지 않고 이 파일 맨 아래 정확한 단독행 `## 회신`에 BLOCKED로 답한다. 구현·검증 후 IMPLEMENTED 또는 FAILED와 원증거를 같은 칸에 기록한다. 본문 수정0; `## 회신 요청`을 회신 경계로 오인하지 않는다. 회신이 없으면 Sol 독립 검수/A수용/B 발송이 진행되지 않는다.

## 1. 목표와 비목표

**목표**: 외부에서 고정한 계약을 사용하여 검증 누락·잘못된 관측·worker 우회·정리 및 파일쓰기 실패가 RC0/PASS로 보고되는 경로를 차단한다. 실제 소유 서버와 Chrome 로그인 화면을 읽는 contract-core와 보호 회귀2를 실행하고, 기존 화면8case는 coverage가 미완성이면 정확히 실패한다.

**비목표**: A에서 기존 화면8case 본문 재작성/전체87ID 채우기, UI/CSS/셸/모델/권한/API/DB/양식/계산 수정, 새 제품파일/의존성/설정, 공통helper/map 수정, 운영자료 사용, SQL직접삽입, 전체완료/commit/push/deploy. B는 A를 Sol이 독립수용한 뒤 별도 새 패킷으로 허용한다. Sol을 대신한 요구사항/수용 판정0.

## 2. 현재 상태·실패 근거·동결 기준

현재 TODO 3-2c는 FAILED/REPLAN 후 사용자 「오케이 진행해」 승인으로 A 구현준비/B대기이다. 직전 검수 static/build/관련11·전체133파일919시험/실Chrome10case13캡처 PASS였지만7개 변조 중6개 falsePASS, zeroargs와 unknownworker도RC0였다. 근거 `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-review-20261001_160642\final-evidence.json` 및 immutable `Log/20261001_163756_3-2c-Sol-FAILED-REPLAN_독립검증종결본.md`. 이는 화면 결함 전체 재발 판정이 아니라 검증기 수용 실패다.

| 결함 | 이번 A 대조 | B에 남는 고정 검증 |
|---|---|---|
| V32F-01/R32C-06 | 외부ID·exact set·raw provenance·unknown 거부 | 8화면의 실제 전체 행동과87ID |
| V32F-02 | numeric<=1·nonfinite거부·canonical8fixture라벨 수정 | ID/순서/count/title/badge computed style 변조 |
| V32F-03 | core 예상외오류0·raw정밀형식·broad401 소거 | real401/status/code/data/phase/count 전체행동 |
| V32F-04 | 실제exit/close/PID·cleanup/write 실패전파 | 모든normal/negative 실행에서 독립재확인 |
| V32F-05 | 정확CLI·atomicdir·IPC PID/nonce/path/contractguard | 전체case정상호출 재확인 |
| V32F-06 | stdout/stderr/partial/capture·firststack·manifest 연결 | 모든8case full raw/action/trace |

현재 예상 git status는 아래12행과 정확히 같아야 한다. 기존 사용자 변경을 정리/복원하지 않는다.

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

baseline의341파일 전체 bytes/fullSHA가 현재실측과 닫힌review sourceManifest와 일치했다. 독립검수전후 변경파일337개 보호를 machine scope gate로 검사한다. 허용4개 착수 기준:

| path | bytes | SHA-256 |
|---|---:|---|
| `scripts/ui-checks/access-history.mjs` | 9320 | `D2DD49C2AFA7AA1C39D8E799CF84BDD794167F0E9F9BB2F448337F06AB28910E` |
| `scripts/ui-checks/access-history-shared.mjs` | 11162 | `D1B984D420F4F8A95003AC16F3D56E3906EEBE43D0429ABFBC610A1A741DF3C5` |
| `scripts/ui-checks/access-history-positive.mjs` | 17523 | `2B6D9713E09B4CABC09912E96F023907D3998FB3A5192CB5B9EC3ADB13370C60` |
| `scripts/ui-checks/access-history-negative.mjs` | 7521 | `89EB001A64FB37BFF55F3D638AA61E851E675D6E440FA13F62798FA2EF25AA7C` |

외부 잠금 디렉터리 `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1`. 아래4파일은 실측 bytes/fullSHA 일치가 필수이고 Gemini 수정0. `baseline.json`은 source341와 기존정본15+계약/전략/checker3=Control18의 정확한 시작값을 포함한다.

| control file | bytes | SHA-256 |
|---|---:|---|
| `contract.json` | 29515 | `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE` |
| `STRATEGY.md` | 26069 | `0A6136FD23F989F7065993449F8A705CD4047FA358248218BB0719497B9F12D1` |
| `verify-evidence.py` | 19880 | `24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954` |
| `baseline.json` | 61201 | `E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50` |

## 3. 수정 경계 — 닫힌 목록

| 제품경로 | 요구사항 | 허용 변경 | 금지 |
|---|---|---|---|
| scripts/ui-checks/access-history.mjs | A01~A10 | 정확CLI·atomic owner dir·server/child lifecycle·IPCdispatch·고정coverage/실제회귀수집·최종증거 | 제품UI/DB/외부server/범위확장 |
| scripts/ui-checks/access-history-shared.mjs | A02~A09 | 순수계약loader/비교기/collector·IPCguard·error/lifecycle helper·fixture 정본라벨·directcore진입 | import시실행·별도module생성·상수actual |
| scripts/ui-checks/access-history-positive.mjs | A03/A05~A09 | guard·partial collector·capture/manifest 연결·outer integration | 기존6case 행동본문 전면변경·B시나리오 구현 |
| scripts/ui-checks/access-history-negative.mjs | A03/A05~A09 | guard·raw event 정밀수집·부분증거·finally·broad401예외제거 | errors/session full B시나리오 재작성·authmock |

4 .mjs 각각30,000bytes 이하. source파일 집합341, dirty12 유지(새tracked/untracked source0·삭제/rename0). 그외337파일, 현재 docs/codebase-map.md(90paths), src/web 전체, tests/config/package/lock/build, scripts/lib/ui-check.mjs, find-chrome, shell/home 검증기 보호. `C:\Projects\Active\교대근무관리 시스템`의 TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/.ai/기존Log 전부읽기전용, 이 HANDOFF의 `## 회신`만쓰기. V3.4 전체읽기전용.

시험/빌드 산출물만 기존 ignored dist/node_modules/artifacts를 사용한다. fault·시험harness는 `artifacts/captures/phase3/access-history-foundation-probes/` 아래 mkdtemp `run-` 자기디렉터리의 ignored `.mjs`/JSON/log/PNG로 생성해 보존한다. 이것은 검증용 artifact 허용이며 제품source신규 허용이 아니다. 이전Sol report/Log/output을 실행해서 덮지 않는다. 과거temp·타PID·브라우저프로필/운영자료 정리0. 시험기자체가 누수를 남기면 자기 PID/경로만 명확히 식별하여 정리하고 증거를 기록한다.

## 4. 요구사항

| ID | 입력/동작 | 기대 결과 / 실패 | 구현 |
|---|---|---|---|
| A01 | public argv | 정확1개 --case=등록값만. 0/2+/empty/공백/unknown/URL즉시RC1, temp/spawn/network0 | owner+sharedpureparser |
| A02 | 외부contract/baseline | bytes/fullSHA·case/ID exact·expected외부읽기·no finite/tolerance bypass | shared/owner |
| A03 | privateentry | actualIPC+ppid/childpid/nonce/case/ownedrealpath/contract검문 뒤만 ack·bootstrap/network/browser/mkdir | shared/positive/negative |
| A04 | ownedserver | 포트사전점유이면foreignHTTP0/temp0/spawn0; sourceanchored repository·mkdtemp격리·actualPID/listenlog/temp/health 일치 | owner |
| A05 | actual관측/collector | raw source와actual연결·partial기록·ID누락/중복/추가FAIL·numericfinite<=1·원값immutability | shared+workerwrappers |
| A06 | cleanup | created→close-start→closed 실제await; child/server exit+close확인후own temp삭제;timeout/kill요청=성공0 | owner/shared/negative |
| A07 | 증거 | stdout/stderr·원event·capture실경로/hash·부분/최종·firststack·원manifest 연결; 모든쓰기실패nonzero | 네파일 |
| A08 | errorledger | console/page/requestfailed/HTTP 이벤트전부원형; 예상예외exact상관만·문자열401예외0; core expected0 | shared/negative/core |
| A09 | contract-core | 실제owned서버/Chrome/fonts/loginDOM/fixture정본9ID/7artifact·리소스종료; core only PASS | shareddirectentry+owner |
| A10 | regression/normalgate | 보호shell/home 실제argv/manifest/capture/RC·3ID각. 기존normal8는fullcoverage누락FAIL_INCOMPLETE·phase전체완료0 | owner+minimalwrappers |

## 5. Sol 코드 전략 — 순서와 상태

1. **순수shared 계약/비교기부터**: static import는 sideeffects0. contract.json exactpath와 본문SHA를 loader로 읽는다. knowncase가 없으면 required=[] 반환0, throw. exact IDset·duplicate/extra/missing·callerexpected/tolerance/pass 거부를 구현한다. numeric에서 finite/type(booleans≠numbers)와 tolerance<=1. collector는 append-only snapshot이며 바깥 배열 수정으로 판정값이 바뀌지 않는다. 오래된 normal의 legacyID도 원값기록은 보존하되 최종fullcoverage에서거부한다.
2. **shared fixture 정본 수정**: 현재 schedule-publish=근무편성공개를 compiled `dist/server/shared/domain/access-log.js`의 accessLogActionLabels에서 근무표 배포로 가져온다. 고정8actions와 순서·canonical전체map을 매번 실제import해 대조한다. source map/type/도메인파일 수정0. core는 `createMockAccessLogs`의 생성라벨을 직접관측하고 임의 기대배열을 actual로 복제하지 않는다.
3. **owner 상태관리**: script URL에서repo root를정하고 현재cwd/expectedrepo를검문한다. CLI beforetemp/network. createUniqueRunDir(base,caseid) 재사용 atomic run 생성. 18741bind 사전검문(타serverhealth0) 뒤 temp mkdtemp/register, 모든SHIFT_/SHIFTMGMT_ 및NODE_OPTIONS 오염삭제·ownedenv만설정. DEFAULT_ADMIN_BOOTSTRAP_PASSWORD 등 기존본계약 재사용하되 비밀번호/쿠키/nonce원문로그0.
4. **서버/worker IPC**: 소유spawnPID를즉시등록, 원stdout/stderr파일을보존. listening 원로그에 정확URL+own temp 경로 및 생존PID를확인하기전health0. bootstrap exact ownpath와health status200/body.ok=true를 bounded관측. owner가 `stdio:['ignore','pipe','pipe','ipc']`로 workerspawn하며 process.execArgv 자동전달0. 보호regression은원stdout/stderrpipe와ownedenv/argv만, IPC새계약을그코드에추가0.
5. **private context packet**: owner전송 `{type:'owner-context',protocol:1,case,ownerPid,workerPid,nonce,context:{repository,url,runDir,tempDir,bootstrapFile,contractPath,contractSha256}}`. worker는process.send/connected+exactcase+process.ppid/actualpid+nonce형태(32 randombytes이상)와exactfixedpaths/realpath/SHA를확인한뒤 `{type:'worker-ack',case,pid,parentPid,nonce}`. owner가자신의소유child와fullpacket일치를재확인한뒤실행지시. env는검문근거가아니다. 전송5초timeout은fail+kill+close확인. nonce는통신내부만,receipt는SHA만. 이계약은우발적우회방지이며 임의악성native부모에대한OS인증으로주장0.
6. **core direct entry**: shared는fileURLToPath(import.meta.url)와process.argv[1] exact resolved path가 같을때만guard 후core실행. 순수import는guard/process.exit0. core는설치 findChrome, chromium.launch,newContext1440x900,newPage,브라우저이벤트beforegoto,fontsready<=15초,실제 input count/isVisible 및viewport/origin을읽고fullPage:false캡처. fixture route.fulfill/network0, sign-in0. context/browser 생성/close시작/실제완료시각과id를기록하며contextclose실패후에도browserclose시도. core-observations/worker-final은모든정리후쓰기,문제면partial+nonzero.
7. **positive wrapper**: guard후runScreenCheck 실제호출은유지. step내try/finally에서action/raw/firsterror/capture반환절대경로를실측저장. 보호helper가별도runDir에원manifest를만드는점을고려해stdout의정확manifestpath+capture return을owner evidence에연결한다. preflight process.exit는outerfinally를실행하지않으므로owner가partial없음/childRC/stdout/stderr를수집해FAIL. helper파일 수정·timestamp추측·globalprocess.exit패치로숨김0.
8. **negative wrapper**: guard→try부터resource등록→rawevent수집→기존case본문→finally context/browser 각각명시적close+오류보존→partial/final쓰기→exit. 현재 PASS파일쓰기뒤close와.catch(()=>{})소거를제거. 기존broadincludes401/!ok는성공근거에서제거하고exact상관이없으면오류로기록. A에서부족한fullcoverage와원런타임실패를둘다보존한다.
9. **owner adjudication**: workerRC0/PASS만으로성공0. 각실제artifact존재/귀속/hash·외부contract exact ID·rawerrors/cleanup검증. corePNG는signature/IHDR1440x900/chunk길이·CRC/IEND를직접검사하며깨진PNG가새hash와일치해도SUTparentnonzero;standalonechecker의거부만으로parent허위PASS를대신0. protectedshell/home은실제공통manifest·원캡처전수로REG*3ID를구성한다. childtimeout/kill뒤close/PID,serverstop뒤exit/close/PID/port를확인하고그뒤자기temp삭제. firstfailure유지·cleanup/evidence오류누적. finalmanifest쓰기/확인까지성공후single parentJSON/RC0. write실패는stderr대상경로/첫stack/nonzero·parentPASS0. 실패해도가능한부분증거를보존한다.

상태순서·exactfield/schema·B87ID와원관측/negative는아래self-contained핵심과 read-only `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\STRATEGY.md`에확정되어있다. 새파일/상반된설계가필요하면구현전BLOCKED. sharedcore작업을다른module로빼거나scope임의확대0.

## 6. foundation 증거 계약

owner-final schema=shiftmgmt.verifier.evidence.v1, stage=foundation, case=contract-core, runId=atomicdir.name,contractSha256=위fullSHA,status=PASS/FAIL,exitCode=actual. owner:pid/nonceSha256/context(url,runDir,tempDir,bootstrapFile). worker:pid,parentPid,nonceSha256,contextAck,exitCode,exitSeen,closeSeen,aliveAfterClose,createdAtMs,exitAtMs,closeAtMs. server:pid,stdoutListenVerified,exitSeen,closeSeen,aliveAfterClose,portListeningAfterClose,createdAtMs,exitAtMs,closeAtMs. cleanup:tempRemoved. errors:primary/null,cleanup[],evidence[],unexpected[]. 실패시첫message/stack/phase와누락필드는실제값/null로남기고true기본값0.

정확7artifact ID=server-stdout,server-stderr,worker-stdout,worker-stderr,worker-final,core-observations,core-capture. 각id/path(ownrun아래absolute)/bytes/sha256uppercase실측. 최종ownermanifest자기해시등록0. stdout/stderr빈파일도존재. worker-final:case/runId/contractSha256/pid/parentPid/nonceSha256/checks 및오류/정리상세. checks 각record는정확키{id,sourceArtifact:'core-observations',pointer,actual}이며 expected/tolerance/pass추가0;rawpointer와완전일치하고worker/owner복사본일치. 아래정확9IDset:

| ID | raw pointer | independent expectation |
|---|---|---|
| CORE-01 | `/viewport` | [1440, 900] |
| CORE-02 | `/origin` | "http://127.0.0.1:18741/" |
| CORE-03 | `/loginInputs` | {"id": {"count": 1, "visible": true}, "password": {"count": 1, "visible": true}} |
| CORE-04 | `/fixtureLabels` | [{"actionType": "performance-approve", "label": "실적 승인"}, {"actionType": "performance-reapprove", "label": "실적 승인 확정"}, {"actionType": "performance-hide-approved", "label": "승인완료 목록삭제"}, {"actionType": "schedule-publish", "label": "근무표 배포"}, {"actionType": "sign-in", "label": "로그인"}, {"actionType": "route-view", "label": "화면 이동"}, {"actionType": "performance-reject", "label": "실적 반려"}, {"actionType": "site-save", "label": "근무지 저장"}] |
| CORE-05 | `/fixtureRequestCount` | 0 |
| CORE-06 | `/rawErrors` | {"console": [], "pageerror": [], "requestfailed": [], "badResponses": []} |
| CORE-07 | `/chrome` | installed-chrome |
| CORE-08 | `/resources` | resources |
| CORE-09 | `/captureId` | "core-capture" |

raw chrome={path,version(findChrome폴더판),browserVersion(실제browser.version4자리)}. 옆폴더정보와실제판동일을강요하지않고실행파일존재/실제판기록한다. raw resources는context/browser각1,kind/id/events(created→close-start→closed,timeMs각양수/비감소),성공한await뒤만closed. raw canonicalLabels={path:dist/server/shared/domain/access-log.js 절대경로,bytes,sha256,labels:실제전체map}를추가한다. checker가actualfilebytes/hash/Nodeimport map을대조한다. core-capture는PNG1440x900·fullPage:false·fonts후실제로그인화면. core 예상 console/page/request/HTTP/fixture오류0,raw모든원문보존.

read-only checker는--core로A만수용한다. sourceaudit·실Chrome·독립오류주입없이는JSON만으로실제행동을증명했다고주장0. --self-test는parser경계만증명한다. B rawschema와callbackharness는별도B패킷에서구체화한다. B구현지시를이A패킷에서추정0.

## 7. 적용할 불변조건 / 과거 함정

CLAUDE.md/07의 승인+계산원자성·forward-only·DB불변·사번신원게이트·copy-only영역·실적엑셀인테이크·영문오류/가짜UI/조용한데이터절단 금지는유지한다. 이번실서버는자기격리자료만,계정생성은기존API만사용한다. 실제상태/요청/값을구한후비교,상수true/부분문구/클래스이름만검사로성공0. 예상오류는method/path/channel/status/errorCode/requestId/phase/횟수/location전부정확상관,없는정보를추정0. timeout/kill요청/빈cleanupErrors를종료증거로쓰지않는다. map90/공통helper/UI/모델/테스트정본수정0.

이전수신본문의2hunk는마지막실제중계해시가없어귀속UNVERIFIED였다. 이번발송은정확bytes와단독행회신경계digest를dispatch.json에보존한다. Gemini는본문을보정하거나기준값을수정하지않는다.

## 8. 착수 게이트

1. AGENTS→.ai/HARNESS→PROTOCOL→GEMINI와legacy-named productinvariants를읽는다. exactrepo/main/fullHEAD/status12/341/4/337·필수Chrome/Node24/Python·ownedport조건을확인한다.
2. contract/strategy/checker/baseline4files의bytes/fullSHA를명령으로대조한다. 아래scope명령RC0,protected337/control18 불변이필수. allowed4 현재SHA까지처음에는위표와동일. 시작이달라졌으면수정없이BLOCKED.
3. 소스와계약/caseflow/증거/검증명령간모순·누락이면BLOCKED. 외부fixedcontract를인라인복제로대체0. protectedmodule나추가source없이는안되면BLOCKED.

## 9. 검증 계획 — 제품 cwd에서 순서대로

각명령 argv/cwd/start/end/PID/RC/stdout/stderr는자기원자ignoredtestdir에JSON/원로그로보존한다. 명령체인을쓰지말고각RC를개별확인한다. npm testfull은A제품src/test불변이므로이번에는필수재실행아님;기존Sol919PASS는이력이며새실행주장0. 새로운실패/보호이탈이생기면중단·보고한다.

### 9.1 정적/관련/빌드

| 정확명령 | expected |
|---|---|
| `python "C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\verify-evidence.py" --contract-sha 014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE --baseline-sha E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50 --scope` | RC0;341/337/status12/control18불변 |
| `node --check scripts/ui-checks/access-history.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-shared.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-positive.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-negative.mjs` | RC0 |
| `npm run typecheck` | RC0 |
| `npm run lint` | RC0/errors0·기존warnings5초과새경고0 |
| `npm run validate:map` | RC0/map90 |
| `git diff --check` | RC0 |
| `npx vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | RC0/3files11tests |
| `npm run build` | RC0·ignoreddist만쓰기 |
| `python "C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\verify-evidence.py" --contract-sha 014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE --self-test` | RC0/positive2,rejected19/parseronly |
| `node scripts/ui-checks/access-history.mjs --case=contract-core` | RC0/Acore9/7artifact/실제정리 |
| `node scripts/ui-checks/access-history.mjs --case=regression-shell` | RC0/REGSHELL3ID/원manifest와실제캡처 |
| `node scripts/ui-checks/access-history.mjs --case=regression-home` | RC0/REGHOME3ID/원manifest와실제캡처 |

core exact실제owner-finalpath는owner stdout에출력하고회신에absolute를기록한다. 독립checker에는그값만넘긴다. PowerShell `Get-ChildItem artifacts/captures/phase3/access-history-contract-core -Filter owner-final.json -Recurse`로추측한latest를선택하지않는다. 실행직후stdout의onefinal JSON을파싱해path를보관한변수 `$coreManifest`를사용하는정확검사:

```powershell
python "C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\verify-evidence.py" --contract-sha 014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE --baseline-sha E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50 --core $coreManifest
```

### 9.2 정상 화면8case의 미완성 coverage fail-closed

아래각명령은RC1/FAIL_INCOMPLETE와외부requiredId 누락/legacyextra의구체목록,원관측/첫error/정리/partial을반환해야한다. A에서각시나리오를다완성하려하지않는다. 실제오류/정리실패도있으면모두기록,coverage오류로덮지않는다. 보호helper의childRC2는가능하나parent최종RC1;그직접원RC를증거로보존한다.

```text
node scripts/ui-checks/access-history.mjs --case=live-admin
node scripts/ui-checks/access-history.mjs --case=list-fixture
node scripts/ui-checks/access-history.mjs --case=empty-fixture
node scripts/ui-checks/access-history.mjs --case=filters
node scripts/ui-checks/access-history.mjs --case=errors
node scripts/ui-checks/access-history.mjs --case=stale-response
node scripts/ui-checks/access-history.mjs --case=role-guard
node scripts/ui-checks/access-history.mjs --case=session-expired
```

### 9.3 기반 음성20그룹 — 각그룹의 모든열거입력을독립실행

동일product파일을수정해서시험하지않는다. 자기ignoredtestdir의외부preload/probe만사용하며관측로그로주입이실제발생했음을증명한다. 새제품bypassenv/faultflag/--test특례 금지. probe `foundation-probes.mjs`를같은원자testdir에만생성,실제argv를회신에기록한다. 예시exact실행형식 `node --import $faultUri scripts/ui-checks/access-history.mjs --case=contract-core`, `$faultUri`는자기probe의pathToFileURL결과를회신에literalfileURI로기록. owner가execArgv를자동전달하지않으므로childfault는testpreload가자기소유spawn을instrument하여명시주입하고각actualpid/path를원로그에남긴다. source/runtime설정변경0. 시험driver는expectednonzero를확인하면driverRC0를반환하되각SUT의실제nonzero와주입증거를개별기록한다.

| ID | 입력/주입 | 반드시관측할거부 |
|---|---|---|
| A-N01 | owner 인수0 / --case= / unknowncase | 각RC1; temp/server/worker/network0 |
| A-N02 | owner 중복case / --case와 별도값 / --url / positional URL / case 앞뒤공백 | 각RC1; 외부 요청0; 자동trim/default0 |
| A-N03 | positive/negative/shared direct CLI: knowncase·unknowncase·인수0·2개 | 각RC1; bootstrapread/network/browser/mkdir0 |
| A-N04 | direct worker에 forged SHIFT_*/SHIFTMGMT_* URL/run/bootstrap와 가짜 healthy stub | IPC 없으면 RC1, stub request0, 원worker unknown-case우회0 |
| A-N05 | IPC 있음/packet없음·timeout / nonce·ownerPid·workerPid·ppid·case 불일치 | 각nonzero; dispatch전 sideeffects0; 자기child kill뒤close확인 |
| A-N06 | IPC contractPath/digest 누락·불일치 / run/temp/bootstrap realpath 외부·형제경로·symlink | 각nonzero; outside read/write/network0; source변경0 |
| A-N07 | caller tolerance2·4·NaN / actualNaN·Infinity / numeric133.5 기대132 오차1 | 모두거부;132와133은경계정상;상수actual/provenance불일치거부 |
| A-N08 | core receipt ID 하나누락·중복·unknown·extra / caseunknown | 각nonzero; 누락/중복/추가 실제목록기록; 빈required집합0 |
| A-N09 | fixture schedule-publish 근무편성공개 / canonical compiled label/hash drift | 각nonzero;canonical fullmap/bytes 실측; 실제정본변경0 |
| A-N10 | core raw console SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401 또는 pageerror | 각nonzero;raw원문보존;문자열401예외0 |
| A-N11 | context.close 실제종료후throw / browser.close 실제종료후throw | 각nonzero;다른자원close시도·첫실패/cleanup보존;누수0 |
| A-N12 | worker timeout·kill요청 / kill했지만close이벤트미관측 / server stop timeout | 각nonzero;timer=close0;PIDs/close/잔여temp실측;타PIDkill0 |
| A-N13 | worker spawn error / server spawn error / listening 로그확인전 server종료 | 각nonzero;bootstrap/health순서우회0;partial/log/정리기록 |
| A-N14 | owner-final 쓰기거부(동기/async/atomicrename 실제사용API) / worker-final 쓰기거부 | 각nonzero;parent PASS출력0;실패경로/첫stack stderr;자원종료확인 |
| A-N15 | stdout/stderr 로그쓰기 또는capture/core-observations 쓰기거부 | 각nonzero;stdoutPASS0;가능한partial보존;close/cleanup완료 |
| A-N16 | owner final에서 capture 누락·hash불일치·외부경로·깨진PNG / worker-final없음 | 각nonzero;파일존재/bytes/hash/path정확확인 |
| A-N17 | protected ui-check preflight health/Chrome 실패로 steps전 process.exit | parentnonzero;원stdout/stderr/childRC·미실행/partial미생성표시;finally가정0 |
| A-N18 | 18741 사전점유 자기stub / inherited SHIFT_*,SHIFTMGMT_*,NODE_OPTIONS 오염 | 포트점유시foreignHTTP0/server0/temp0;정상owned실행은오염0·execArgv자동전달0 |
| A-N19 | 정상8case의 requiredfull ID 누락 / legacy extraID | RC1/FAIL_INCOMPLETE,missing/extra/duplicate및모든실제오류보존;case/전체PASS0 |
| A-N20 | core 관측 actual과raw pointer 불일치 / caller expected/pass/tolerance 필드 | 각nonzero;record의자기PASS를믿지않음 |

IPC5초/startup30초/health·font15초/context·browser·child·serverclose각5초및강제종료추가5초/core90초/normal120초/home180초. Owner상한=case+startup30+cleanup20초. 시험이주입한timeout단축은외부testinstrumentation으로만기록하며제품상한을바꾸지않는다. 살아있는소유PID를종료못하면FAIL·temp보존·PID/경로명시,타PID정리0. 무한sleep/timeout성공0.

### 9.4 최종 범위/해시/증거

scope명령다시RC0·341files/dirty12/protected337/control18 동일. 각4파일<=30,000bytes와fullSHA/bytes. git diff원문(기존tracked4의누적diff와이번allow4hunk 구별),untracked4 mjs원문hash/diff,기존UI4신규파일보호증거. artifact전체실제path/bytes/hash·sourceMap90·각childrawoutput·actualcleanup·portfree·nonce/cookie/password비노출. oldLog/reportbytes불변.

## 10. A 성공/중단 조건

- A01~10 구현 및정확source위치·원증거,core9/7artifact→standalonecheckerRC0.
- static/focused/build/회귀2PASS·normal8정확FAIL_INCOMPLETE·20음성그룹의모든열거입력거부와주입실제증거.
- scope341/337/12/control18·4mjs크기·제품정본/기존사용자수정/V3.4 불변.
- cleanup/write/누락/unknowncase가어느가지에서도parentRC0/PASS가되지않음,실패원로그/partial보존.
- 새source/새의존성/공통helper변경·계약기대완화·B본문작성없이구현가능해야함. 충돌/범위이탈/필수도구없음/검증못함이면수정중단하고BLOCKED/FAILED로명시. Gemini IMPLEMENTED는제출만,Sol A수용대기. A미수용이면B진행0.

## 11. 회신에필수인증거

초기게이트·final341/337/12·4filefullSHA/bytes·별도source바이트비교·명령별literalargv/cwd/time/PID/RC/stdout/stderr·coreManifestabsolute/checker원결과·회귀2원manifest/capture·normal8missing/extra/errors·20음성subcase별입력/실제주입/expectedRC/actualRC/partial/cleanup·첫실패stack및cleanup/write에러·unresolved없음또는명시. 실패를재실행성공으로덮지말고모든시도원본보존. TODO변경안은제안만,직접수정0.

## 회신

판정: 대기 — Gemini가 IMPLEMENTED / BLOCKED / FAILED 중 실제값으로 채움
기준: repository / main / 전체 baseline commit / 최종 commit 없음
초기 상태·착수 게이트: 미실행
변경 파일·A요구사항/기존 V32F 결함 대조: 미제출
범위 밖 변경: 미검증
정적/관련/빌드 명령·RC·counts·원로그·시각: 미제출
core9/7artifact·absolute owner-final·독립checker 결과: 미제출
회귀2 원manifest/원출력/실제캡처: 미제출
normal8 FAIL_INCOMPLETE/missing/extra/실제오류: 미제출
기반 음성20그룹과모든subcase 실제주입/RC/cleanup: 미제출
diff·전체 SHA-256/bytes·341/337/12/control18: 미제출
미해결/가정·TODO 상태변경 제안: 미제출
