# Phase3-2c 독립 검증 계약 v1 / 단계 전략

사용자 「오케이 진행해」(2026-10-01)는 FAILED/REPLAN 이후 Sol의 계약 선고정과 새 Gemini 패킷 준비를 승인했다. 제품 수정 권한은 Gemini에 유지한다. 이 문서는 Sol의 제어 문서이며 제품 구현물이 아니다.

## 1. 수용 단위를 분리한다

A: 부모 소유권·관측 출처·고정 coverage·종료/저장 실패 판정 기반. 실제 owned 서버와 설치된 Chrome의 로그인 화면을 읽는 contract-core 9ID 및 기반 음성 게이트를 통과하면 A만 수용할 수 있다. 로그인 성공이나 활동 이력 전체 시나리오를 증명한 것으로 확대하지 않는다.

B: A를 Sol이 독립 수용한 후 별도 새 HANDOFF로 화면 8case 전체 행동과 회귀2case를 구현한다. 이 문서의 fullUi ID/원기준은 미래 검증 조건으로 고정되어 있으나 B 구현은 아직 허용하지 않는다. source/source-map/test/deps 추가 허용0. B의 compiled 읽기 전용 class harness, callback 관측과 실제 query별 정확 증거 schema는 Sol이 B 패킷에서 닫는다.

전체 3-2c 수용, 3-2d commit, 3-3 인력 관리 착수는 이번 A 결과와 별개다. 기존 R32C-06과 V32F-01~06 실패 이력·두 회 CORRECT 제한은 초기화하지 않는다. 같은 지시 반복이 아닌 고정된 외부 판정과 단계 분리로 전략을 교체한다.

## 2. 신뢰와 판정 경계

contract.json, baseline.json, verify-evidence.py와 이 문서는 Gemini 수정 금지. HANDOFF에 기록된 full SHA와 실측 bytes를 검사한다. 제품 내부 비교기는 기대값·ID를 이 계약에서 읽으며 caller tolerance/expected/pass로 완화할 수 없다. 수치만 <=1px, 문자열/색상/ID/순서/건수/역할/에러코드는 완전일치. 색상은 approved HEX→브라우저 rgb 정규화만 허용한다.

IPC guard는 잘못된 CLI/env·우발적 direct worker 우회 차단을 위한 운영 소유권 계약이다. 임의 native 부모 프로그램이 같은 protocol을 흉내 내는 악의적 공격에 대한 OS 인증이라고 주장하지 않는다. process.execArgv/NODE_OPTIONS 자동 전달 금지. 실제 owner/child PID·ppid·case·nonce hash·owned realpath·contract SHA를 서로 확인한다.

JSON 자기보고만으로 실제 클릭·종료를 증명할 수 없으므로 Sol은 원소스, 설치 Chrome, 실제 fault injection, PID/파일/캡처와 cross-check한다. verify-evidence.py --self-test는 parser의 합격·거부 경계 증거일 뿐 실제 Chrome 수용 증거가 아니다.

## 3. 고정 증거 형태 — foundation core

owner-final.json의 schema=shiftmgmt.verifier.evidence.v1, stage=foundation, case=contract-core, runId=atomic run 디렉터리명, contractSha256=핸드오프 정본 해시, status/exitCode=최종 실제 결과. 아래 필드명과 형태는 실행 가능한 verify-evidence.py가 정본이다. 오류 발생 시에도 가능한 필드와 첫 stack, cleanup/evidence 실패를 보존하며 부족한 필드를 success 기본값으로 만들지 않는다.

- owner: pid, nonceSha256(64자 uppercase), context:{url,runDir,tempDir,bootstrapFile}. nonce 원문/쿠키/비밀번호 기록0.
- worker: pid,parentPid,nonceSha256,contextAck,exitCode,exitSeen,closeSeen,aliveAfterClose,createdAtMs,exitAtMs,closeAtMs.
- server: pid,stdoutListenVerified,exitSeen,closeSeen,aliveAfterClose,portListeningAfterClose,createdAtMs,exitAtMs,closeAtMs. 정상 Windows terminate의 server exitCode0을 요구하지 않고 실제 종료를 요구한다.
- cleanup:{tempRemoved}; errors:{primary:null|{message,stack,phase},cleanup:[],evidence:[],unexpected:[]}.
- artifacts: 정확한7개 id. 각{id,path(absolute),bytes,SHA는 sha256(64 uppercase)}. server/worker stdout/stderr는 빈파일이라도 존재. worker-final/core-observations/PNG는 own runDir 안, 각 실측 hash. final manifest는 자기해시 순환을 피하도록 artifact로 자기 자신을 등록하지 않는다.
- checks: 정확한CORE-01~09, 각{id,sourceArtifact:'core-observations',pointer:계약값,actual:raw JSON pointer값}. expected/tolerance/pass 필드 금지. worker-final의 checks와 owner 복사본이 완전일치해야 한다.
- worker-final:{case,runId,contractSha256,pid,parentPid,nonceSha256,checks} 및 실패/정리 상세를 포함할 수 있다.
- core-observations:{viewport:[1440,900],origin:정확URL,loginInputs:{id:{count:1,visible:true},password:{count:1,visible:true}},fixtureLabels:고정8action 실제 shared fixture와 compiled canonical 대조 결과,canonicalLabels:{path:실제 compiled module 절대경로,bytes,sha256,labels:module 전체 accessLogActionLabels},fixtureRequestCount:0,rawErrors:{console:[],pageerror:[],requestfailed:[],badResponses:[]},chrome:{path:실제설치경로,version:findChrome 폴더판정보,browserVersion:실제browser.version() 4자리판},resources:[2resource],captureId:'core-capture'}. checker가 actual compiled module bytes/hash와 Node import한 전체map을 raw canonicalLabels와 별도 대조한다. findChrome 폴더판정보는 관측으로 남기되 stale 옆폴더 때문에 실제 browserVersion과 일치를 강요하지 않는다.
- resources는 context/browser 각1, 각{kind,id,events:[{state:'created',timeMs},{state:'close-start',timeMs},{state:'closed',timeMs}]} 순서. 성공한 await 뒤에만 closed 기록. close-error/없음/역전은 FAIL. 기본값 true 또는 상수 resource ledger 금지.

core screenshot은 fullPage:false, 1440x900 PNG. document.fonts.ready를15초로 bounded await하고 실제 #login-id/#login-password 표시를 관측한다. 건강 GET /api/health status200·body.ok=true는 owner health 원응답/로그에 보존한다. core에는 route fulfill, sign-in, 로그 조회 fixture 네트워크0; 기존 fixture 생성 함수 반환 라벨 대조만 수행한다.

owner는 core PNG도 직접 읽어 signature/IHDR/크기1440x900/chunk길이·CRC/IEND를 확인한다. 깨진 PNG가 자기 주장 hash와 일치해도 SUT parent nonzero이다. standalone checker만 거부하는 것으로 owner의 허위 PASS를 대신하지 않는다.

## 4. 실행과 종료 상태

owner: CLI_VALID→RUN_CREATED→SERVER_SPAWNED→LISTEN_LOG_MATCH→HEALTH_OK→WORKER_SPAWNED→CONTEXT_ACK→CASE_DONE→WORKER_EXIT→WORKER_CLOSE→SERVER_EXIT→SERVER_CLOSE→TEMP_REMOVED→FINAL_WRITTEN→single final stdout/exitCode.

실패는 발생 위치에서 first failure를 유지하고 모든 자기 자원을 정리한다. timeout/kill 요청은 EXIT/CLOSE의 대체 증거가 아니다. 5초 IPC guard,30초 startup,15초 health/font,각 close5초 및 강제종료후추가5초,core90초·normal120초·home180초,총owner budget case시간+startup30+cleanup20초. timeout branch는 실제 close/PID를 확인하고 항상 FAIL. 소유 PID 종료를 확인하지 못하면 temp삭제0·alive/PID/경로를 남기며 타프로세스 일괄kill0.

private worker는 채널 존재→정확단일case/등록목록→challenge/actual ppid+pid+nonce→own realpath/contract SHA 검문→ack 뒤 bootstrap read/network/browser/mkdir. 공유모듈 import는 순수하며 core direct entry만 guard/run. regression 보호 runner는 IPC를 새로 구현하지 않으며 owner만 실제 고정argv/ownedenv로 자식을 시작한다.

protected ui-check.mjs는 실패경로에서 process.exit(2)를 호출하고 별도 atomic dir을 만든다. positive wrapper는 steps 내부 try/finally에서 collector/partial records를 저장하고 capture 반환절대경로를 기록한다. helper preflight에서 step 자체가 시작되지 않아도 owner는 원stdout/stderr/RC와 실제 manifest 경로를 보존하고 missing partial을 FAIL로 판정한다. asynchronous outerfinally 실행을 가정하지 않는다.

owner는 parent final 쓰기까지 성공해야 PASS를 출력한다. write 실패면 stderr에 first/evidence failure와 대상경로, exit nonzero, PASSstdout0. owner-final 없다는 사실 자체도 FAIL이다. provisional childPASS는 원worker로그에만 있으며 부모 status의 근거로 단독 사용0. temp 삭제는 confirmed child/server exit+close 뒤, 자기 mkdtemp 경로만 대상으로 수행한다.

## 5. A에서 normal8case와 regression2case

existing8 화면 scenario 본문은 A에서 재작성하지 않는다. 알려진 broad error/cleanup 소거는 outer collector/finally 경계에서 제거하고 entry guard·부분증거·contract fullId coverage 접합만 한다. 각ID가 없거나 legacy extraID가 있으면 status=FAIL_INCOMPLETE·exitCode1이며 missing/extra/duplicates를 그대로 남긴다. 잠정UI PASS나 Acore PASS를 전체10casePASS로 쓰지 않는다. 모든8case를 정상 data run으로 실행해 실제 partial/cleanup을 확인하되 의도한 불완전 coverage 실패를 product regression으로 오해하지 않는다. 다른 런타임/정리/저장 실패가 함께 있으면 coverage 탓으로 숨기지 않는다.

regression2는 case당3개의 고정ID를 owner의 실제 보호 runner 실행/원manifest/캡처/종료에서 생성할 수 있다. A에서 그 얇은 integration을 구현해 RC0를 검증한다. core checker는 regression 또는fullUI를 승인하지 않으며 Sol은 별도 source/manifest/capture 검토한다. 공통case unknown은 빈 required집합을 반환하지 않고 즉시 FAIL.

## 6. Full UI coverage registry — B의 고정 기준

각 ID마다 expected, raw observation, negative가 contract.json에 있다. 숫자ID 추가/삭제/통합·expected 약화는 Gemini 권한이 아니다. 아래 표의 행이 최소 단위이며 '각각'이라고 지정한 다중 outcome/행동은 row 내부 독립 subtrace로 모두 관측한다. B의 packet에서 정확값과 데이터/시각 선택을 닫으며 기존 화면/권한 불변조건을 창작하지 않는다.

| case | 고정 ID 수 | A 판정 |
|---|---:|---|
| live-admin | 8 | coverage 미완성 FAIL_INCOMPLETE |
| list-fixture | 14 | coverage 미완성 FAIL_INCOMPLETE |
| empty-fixture | 8 | coverage 미완성 FAIL_INCOMPLETE |
| filters | 15 | coverage 미완성 FAIL_INCOMPLETE |
| errors | 8 | coverage 미완성 FAIL_INCOMPLETE |
| stale-response | 12 | coverage 미완성 FAIL_INCOMPLETE |
| role-guard | 9 | coverage 미완성 FAIL_INCOMPLETE |
| session-expired | 7 | coverage 미완성 FAIL_INCOMPLETE |
| regression-shell | 3 | 보호 회귀 실제 실행 |
| regression-home | 3 | 보호 회귀 실제 실행 |

### live-admin

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| LIVE-01 | 실제 관리자 signin/list/users 모두 ok, fixture route 0 | 실제 Bridge 응답·method/path/args·cookie 비노출 requestId; list/users 독립 건수 | mock auth/list/users 또는 응답 누락 거부 |
| LIVE-02 | 실제 응답 전체 ID와 표시 첫200 ID 순서 동일·최신순·총수 정확 | 원응답 전체 ID/occurredAt 및 DOM ID/텍스트/count; 동일 시간은 원순서 유지 | ID 교환·count999·응답 절단 각각 거부 |
| LIVE-03 | 유효 새로고침 held 중 refresh/reset native disabled·동일 액션 중복 요청0·해제 뒤 정상 | click/held start/release/complete 시각과 요청 delta 및 DOM disabled | held 중 두 번째 실제 클릭·DOM dispatch는 extra0 |
| LIVE-04 | 홈 이동 activity DOM0·재진입 실제 list/users와 화면1 | 전후 DOM counts/실제 network | 상수true나 제목만 확인 거부 |
| LIVE-05 | logout 뒤 login1·activity DOM0·실세션 해제 | 실제 UI 클릭·auth 결과·DOM | 상수true 또는 UI만 숨김 거부 |
| LIVE-06 | Chrome·fonts·1440x900·콘솔/page/request/HTTP 예상외0·capture 실제존재 | raw events/실제 screenshot/경로hash | 오류 또는 capture 누락 거부 |
| LIVE-07 | 원셀/스크롤의 전체 값 접근과 한국어 표시 | DOM fulltext/title·실제 키보드 scroll | substring만 검사 거부 |
| LIVE-08 | 화면 프레임 sidebar220/64·header56·footer32·title20/600·padding16x20·gap14 | computed style/bounding rect/keyboard sidebar 축소·복원 | <=1px 수치 오차 초과 거부 |

### list-fixture

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| LIST-01 | 고유 ID201개·전체 원응답 저장·의도한 정확한 순서 | fixture JSON와 DOM row ID 배열 | 중복ID·첫두 ID 교환 각각 거부 |
| LIST-02 | 최초200개 ID·200건표시/전체201, more 후201개·남은0·more 제거 | 실제 배열·count 완전문구·more DOM | 건수999·마지막행누락 각각 거부 |
| LIST-03 | native table role/name 활동 이력 목록·th scope=col 5개·정확한 제목 | DOM tag/accessibility role/aria-label/scope/header 배열 | name 변조 거부 |
| LIST-04 | th12/600/#F8F9FA·body14/400·padding8x12 | computed style 각값 | class만 검사 거부 |
| LIST-05 | from/to 날짜132x34·keyword160x34·label12·border#848A93 | 두 date/keyword/label computed style+rect | date90x24·133.5x34 각각 거부 |
| LIST-06 | 보통·긴값 행 모두40·최초4열130/140/100/160·detail남은폭/min200 | 실제 정상/긴값 row와 각열 rect/scrollWidth | row/column >1px 오차 거부 |
| LIST-07 | 8대표 action의 문구가 compiled accessLogActionLabels와 정확일치 | 각 actionType·canonical map·DOM badge text | schedule-publish 근무편성공개 거부 |
| LIST-08 | 8배지 색/font12/600/radius4/padding2x8(info2x6허용) 정확 | 각 badge computed color/background/font/padding/radius | magenta color 거부 |
| LIST-09 | 전체 user/action/time/detail text와 title 원문 일치 | 원fixture·DOM textContent/title 전값 | detail title 잘림/substring 검사 거부 |
| LIST-10 | invalid occurredAt은 원문·empty는-·route/details trim 결합 규칙 정확 | fixture와 실제 time/detail | invalidtime 숨김 거부 |
| LIST-11 | HTML/XSS payload 문자는 그대로 표시·script 실행0 | addInitScript counter·원payload·DOM fulltext | 실행 또는 escaped텍스트 재해석 거부 |
| LIST-12 | 가로스크롤 Tab 초점·실제 Arrow 키 이동·title 전체접근·outline2px | focus·scrollLeft 전후·computed outline | dispatch 이벤트만으로 키보드 통과 거부 |
| LIST-13 | table card/filter surface white·border#E2E5EA·radius6·filterpadding12x16 | computed style 카드/필터 | class만 검사 거부 |
| LIST-14 | console/page/request/HTTP 예상외0·fonts·capture | raw events와 PNG | unrelated401도 거부 |

### empty-fixture

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| EMPTY-01 | 실제 성공 []에서만 G2 1·table0 | 원응답·DOM counts | loading/error G2 나타나면 거부 |
| EMPTY-02 | held loading G2 0·로딩 status/count 실제표시 | held start/release/complete·DOM | settled만 관측 거부 |
| EMPTY-03 | Bridge 실패·network 실패 G2 0 | 원실패 응답/DOM | 빈목록으로 실패숨김 거부 |
| EMPTY-04 | G2 width600(max100%)·radius8·padding48x24·gap16·title18/700·desc13 | computed style와 rect | >1px 수치 오차 거부 |
| EMPTY-05 | 5필터 계속 접근 가능·과거기간 조회 요청 정확1 | 실제 date/input/select·query JSON배열 | G2가 필터차단하면 거부 |
| EMPTY-06 | empty-reset local 월초/today/all/all/emptykeyword 정확·요청1·잔여debounce0 | 브라우저 local시계/모델 defaults·DOM5값·250ms후 counts | UTC 날짜로 대체/추가조회 거부 |
| EMPTY-07 | G2 reset 실제키보드·focus2px·한국어 문구 | 실제 Tab/Enter·DOM | 동작없는 버튼 거부 |
| EMPTY-08 | 예상외 오류0·capture·fonts | raw events/PNG | 누락 거부 |

### filters

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| FILTER-01 | dateFrom/dateTo/loginId/actionType/trim keyword 5필드 실제 Bridge args [query] 일치 | postDataJSON 전체배열·DOM5값·requestId | body객체로 오독/필드누락 거부 |
| FILTER-02 | 연속 keyword 입력 latest value250ms뒤 list 정확1 | 입력/요청 timestamps·실제body·counts | 중간값/중복요청 거부 |
| FILTER-03 | 입력 즉시 old행0·count조회중·status로딩·focus/caret 유지 | 입력전후 DOM·activeElement·selectionStart/End | old행잔존/상수focus 거부 |
| FILTER-04 | keyword 직후 수동 refresh는 즉시 최신조건1·250ms잔여0 | actions/request timestamps·args | 두 번째 debounce 거부 |
| FILTER-05 | keyword 직후 날짜 변경 timer취소·최신조건1·잔여0 | 실제 date change·body·counts | 잔여timer 거부 |
| FILTER-06 | keyword 직후 user/action 변경 각각 timer취소·최신조건1·잔여0 | 두 select 각각 실행 로그/body | 한 select 생략 거부 |
| FILTER-07 | keyword 직후 reset timer취소·local기본5값·요청1·잔여0 | local시계·DOM5값·body | reset 일부값/추가요청 거부 |
| FILTER-08 | 역전 from/to 모두 aria-describedby·error 실제표시·logs0 | 두 input 속성·DOM·requestdelta | 날짜 하나만 연결 거부 |
| FILTER-09 | invalid refresh/reset native disabled=false·aria-disabled=true·사유 | 실제 DOM속성 | native disabled로 Tab불가 거부 |
| FILTER-10 | invalid refresh click·Space·Enter 각 요청0 | 실제 click/키보드·독립 counts | event.dispatch만 키보드증거 거부 |
| FILTER-11 | invalid 입력에서 Enter implicit-submit 요청0 | 실제 keyword/date Enter·DOM form count0 | 존재하지않는 form 창작 거부 |
| FILTER-12 | invalid refresh/reset 실제 Tab 도달·outline2px | keyboard Tab·activeElement·computed outline | programmatic focus만 거부 |
| FILTER-13 | 빈 from/to 각 유효 조회·불가능일 HTML정규화와 순수model판정 구분 | 원입력/실제input.value·compiled model·query | native가 비운 값을 impossible retained라고 주장 거부 |
| FILTER-14 | 유효 held 중 native disabled=true·aria잔존없음·중복0·완료후해제 | held start/release/complete와 DOM상태 | finally busy 조기해제 거부 |
| FILTER-15 | 실제 focus/caret 유지·과거기간 결과·오류0·capture | DOM/network/events | 개별검사 누락 거부 |

### errors

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| ERROR-01 | HTTP200 BridgeFailure alert 한국어·retry1·G2 0·XSS 실행0 | 원응답·DOM fulltext·counter | alert 존재만 상수true 거부 |
| ERROR-02 | network throw alert/retry·G2 0·정확한 abort1만 expected | method/path/requestId/phase/times/errorCode | broad 오류무시 거부 |
| ERROR-03 | logs retry held native disabled·두 번 클릭/dispatch 추가0·완료해제 | held lifecycle·requestdelta·DOM | sleep후 요청만 세기 거부 |
| ERROR-04 | users 실패+logs성공은 별도 warning·표유지·선택 loginId 보존 | users/list 원응답·warning/표/select | 전체표를 오류로 대체 거부 |
| ERROR-05 | users retry held 중 users1/logs1·두 번 클릭 추가0·busy 실제 | 두채널 requestId·held lifecycle·DOM | users중복/로그 누락 거부 |
| ERROR-06 | 이전 요청 held 상태에서 날짜invalid 변경은로딩해제·표0·예약0 | generation/actions·DOM·counts | invalid loading 잔류 거부 |
| ERROR-07 | old finally는 new held busy 해제0 | oldrelease/newheld/DOM disabled 시각 | before250ms 분기 생략 거부 |
| ERROR-08 | 예상 abort외 console/page/request/HTTP0·close오류0·capture | 상관된 raw event와 cleanup | unrelated401/cleanup catch 거부 |

### stale-response

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| STALE-01 | old success query변경후 새debounce250ms전 release·old DOM0 | querychanged/release/250ms/newrequest times·DOM | old after new 한분기만 거부 |
| STALE-02 | old error 같은250ms전 release·alert0·newquery 정상 | 원실패/시각/DOM | olderror 미실행 거부 |
| STALE-03 | old AUTH_SESSION_REQUIRED 같은250ms전 release·callback/login0 | 원AUTH·시각·callbackinstrument·DOM | session 만료로 이동하면 거부 |
| STALE-04 | new success 후 old success/error/AUTH 각각 release·new ID 유지 | 3독립 timeline/DOM/request | 하나 outcome으로 대체 거부 |
| STALE-05 | old finally release 때 new held refresh/reset native lock 유지 | hold/release times·DOM | oldfinally newbusy 해제 거부 |
| STALE-06 | keyword후manualrefresh 최신 query 정확1·250ms잔여0 | actual body/counts/times | 중복요청 거부 |
| STALE-07 | home destroy 이전 held success/error/AUTH 각각 DOM0·callback0·debounce0 | home click/destroy·release·counts | 늦은render/login 거부 |
| STALE-08 | placeholder destroy 이전 held success/error/AUTH 각각 DOM0·callback0·debounce0 | 실제 placeholder 메뉴·release·DOM | home으로만 대체 거부 |
| STALE-09 | logout destroy 이전 held success/error/AUTH 각각 DOM0·추가callback0·debounce0 | 실제logout·release·loginDOM·counts | logout 자체 login과 oldAUTH callback 혼동 거부 |
| STALE-10 | 현재 generation AUTH_SESSION_REQUIRED callback 정확1·shell login1 | 실제 class callback counter(읽기전용 compiled harness)·shell DOM | loginDOM만 callback 횟수 주장 거부 |
| STALE-11 | held마다 start/release/complete 각1·유한timeout·unroute는complete뒤 | 원requestId/args/timestamps/lifecycle | unresolved handler·timeout=완료 거부 |
| STALE-12 | 예상외 오류0·정리오류0·capture | raw events/cleanup/PNG | 누락 거부 |

### role-guard

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| ROLE-01 | operator 로그인전 instrumentation·menu0·automatic logs/users각0 | 실제cookie세션·login전listener·DOM·requestdelta | 로그인후listener 또는 한채널만 거부 |
| ROLE-02 | operator cookie direct logs/users AUTH_FORBIDDEN·data 필드없음 | 실제 Bridge 두응답 | ok=false만/빈data[] 포함 거부 |
| ROLE-03 | planner 로그인전 instrumentation·menu0·automatic logs/users각0 | 실제account/cookie·DOM/network | UI mock권한 거부 |
| ROLE-04 | planner cookie direct 두 API AUTH_FORBIDDEN·data없음 | 실제 Bridge 두응답 | code/data 누락 거부 |
| ROLE-05 | reviewer 로그인전 instrumentation·menu0·automatic logs/users각0 | 실제account/cookie·DOM/network | role 생략 거부 |
| ROLE-06 | reviewer cookie direct 두 API AUTH_FORBIDDEN·data없음 | 실제 Bridge 두응답 | code/data 누락 거부 |
| ROLE-07 | admin 두 API 실제 ok/data·menu1 | 원logs/users응답·DOM | users검사 누락 거부 |
| ROLE-08 | planner/reviewer는 admin saveOperationUser 실제 API 생성·SQL0/authfixture0 | API원응답·account별signin | DB 직접insert/rolemock 거부 |
| ROLE-09 | 세션별 독립계수·한국어·예상외오류0·capture | rolephase·requestId·PNG | 역할사이 계수누적 혼동 거부 |

### session-expired

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| SESSION-01 | realadmin 실제 cookie 획득·외부 context signOut ok/data 계약 | credential비노출·cookie비노출 hash와 auth원응답 | auth fixture 거부 |
| SESSION-02 | refresh 실제 list401/AUTH_SESSION_REQUIRED/data필드없음 정확1 | HTTPstatus·Bridgecode·method/path/requestId·UIphase | nonOK500을401로 인정 거부 |
| SESSION-03 | users401 있으면 정확한 실제동시요청ID/count로만예외 | 두채널 독립요청·raw response | broad401/path substring 거부 |
| SESSION-04 | callback/login1·activity/table DOM0 | callback증거+실제 DOM | 상수true 거부 |
| SESSION-05 | no-cookie direct POST list body[{}] 실제401/code/data없음 | cookie없는 Nodefetch 정확body와 응답 | 500·다른errorCode·data존재 각각 거부 |
| SESSION-06 | expected console/HTTP는 정확request와location·phase·count 전부상관 | console.location·response.request 객체ID·raw event | unrelated 문자열401/중복error 각각 거부 |
| SESSION-07 | 그외 console/page/request/HTTP0·context/browser close0·capture | 원raw events와finally ledger | cleanup catch 또는 broadallow 거부 |

### regression-shell

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| REGSHELL-01 | owned URL에서 보호 shell.mjs 실제 child RC0·run manifest PASS | owner argv/pid/rc·stdout/stderr·원common manifest hash | stdoutPASS만 인정 거부 |
| REGSHELL-02 | 원manifest 캡처전부 실제존재·자기run귀속·원오류/정리0 | 실제manifest/capture return경로/hash | directory 추측/누락 거부 |
| REGSHELL-03 | child/server exit+close·PID종료·temp삭제 확인 | owner lifecycle/파일실측 | timeout을close로 인정 거부 |

### regression-home

| ID | 기대 결과 | 실제 관측 | 실패 주입/거부 |
|---|---|---|---|
| REGHOME-01 | ownedenv/bootstrap/URL에서 보호 home.mjs --case=live-admin RC0 | owner exactargv/pid/rc/stdout/stderr | 외부URL/env오염 거부 |
| REGHOME-02 | 원manifest PASS·캡처전부·원오류/정리0 | 실제common manifest/capture path/hash | stdout만/누락 거부 |
| REGHOME-03 | child/server exit+close·PID종료·temp삭제 확인 | lifecycle/실측 | cleanup 오류소거 거부 |

## 7. 기존 실패에서 유지하는 교훈

V32F-01 누락/상수actual → 외부고정ID·raw pointer와 exact set. V32F-02 tolerance2/4와 fixture drift → 수치<=1·canonical8label. V32F-03 broad401/nonOK → 정확method/path/requestId/phase/status/code/count/data없음 상관, 모호한 console location은 거부. V32F-04 cleanup/write swallowing → 실제close와finalwrite가성공필수. V32F-05 zeroargs/worker 우회 → 선행정확CLI+IPC. V32F-06 evidence 분리 → 모든partial/log/capture 실제경로와fullhash 연결.

일반 검증 A가 받아들여져도 tolerance변조·잘못된 ID/count/title/color·no-cookie500·stale/destroy/callback 전체동작은 B 독립주입까지 완료라고 말하지 않는다. 제품src/CSS/API/DB/auth/schema/dependencies/commonhelper/map 변경0, V3.4 읽기전용, 가짜UI·데이터절단·SQL삽입·영문오류·숨긴실패 금지.
