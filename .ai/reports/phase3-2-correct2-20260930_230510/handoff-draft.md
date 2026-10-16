# HANDOFF — Phase3-2b CORRECT2 / R32C-01·06 잔여 / 마지막 재제출

- From: Sol(frontier,유일한오케스트레이터)
- To: Gemini(제품구현코더,사용자수동중계)
- Date: 2026-09-30 23:05:10 KST
- Action: CORRECT
- 회신: 필요
- Correction attempt: 2 / 마지막 같은결함군 재제출. 실패하면반복지시서를추가발행하지않고Sol이재설계.
- Repository: `C:\Projects\Active\ShiftMgmt_V4` · Branch: main
- Baseline commit: `160940f9aaeb6696538447f83b44658073e382f0` · Expected initial worktree: 아래9dirty 유지
- Control root: `C:\Projects\Active\교대근무관리 시스템`
- 수신원본: `C:\Projects\Active\교대근무관리 시스템\Log\20260930_230510_3-2b-CORRECT1-Gemini_CORRECT2전환보존.md` · 44538bytes · SHA-256 `35C5D75650FEE1E99FFEC731CB7921B8B096E93AF7BAE5763D2CCDD7C8E97E8C`
- 독립검증종결: `C:\Projects\Active\교대근무관리 시스템\Log\20260930_230510_3-2b-CORRECT1-Sol-CORRECT2_독립검증종결본.md`

## 회신 요청

Gemini는본문착수기준에맞으면 **두파일만** 최소수정하고원필수게이트전부실행한뒤맨아래보이는 `## 회신`만채운다. body수정/다른AI CLI/commit/push/TODO·.ai·Log변경0. 착수모순/범위필요면수정없이BLOCKED. 첫검증기재작성에서누락했던검문·정리·행동검사를모두실제assertion으로닫아야Sol수용을진행할수있다.

## 1. 목표

새keyword입력순간currentquery의pending본문으로전환해old행을숨기고,검증기가예상외오류·누락된필수동작·정리실패를진짜실패로판정하게수정한다. R32C-01/06 잔여가최종목표이며전체3-2수용은Sol독립재검증후결정한다.

## 2. 비목표

R32C-02~05해소된model/modeltest/CSS와기존4통합파일수정0. 새source/testfile/의존성/DB/API/인증정책/계산/공통CSS/공통runner변경0. 다음화면/리팩터링/전체재생성/원본V3변경/운영패치/배포0. 제품작성권한은Gemini,Sol은검증/전략/Control만작성.

## 3. 현재 상태와 직전 실패 — stable ID 유지

수신본문/5수정범위/보호333/정본14/9회신hash일치. 독립static/build/map87/관련3파일11시험PASS. full133파일919시험은Gemini보고값이며Sol은이번반려에서전체를재실행하지않았다. Chrome154/1440×900/fonts.ready 최종9그룹8PASS/1FAIL,제품자연실행의예상외오류0. 실제3역할서버차단은PASS. 제품소스/HEAD/status338/9은Sol동안불변.

| ID | 상태 / 원인·위치 | 이번 완료 기준 |
|---|---|---|
| R32C-01 | PARTIAL. oldsuccess/auth/refreshdup해소. screen240–255에서keyword/generation/count만갱신하고renderBody를갱신하지않아새query입력뒤oldsettledrow1/loading0. | 모든input직후oldrow0/pendingrole=status,currentcount;stablefilterfocus/caret유지;actualpending/debounce구분;manualrefresh1회/oldfinally영향0. |
| R32C-02 | RESOLVED. invalid날짜held요청전후loading0/사유/실제키보드잠금PASS. | 제품수정0,회귀검사유지. |
| R32C-03 | RESOLVED. usersretry nativebusy/강제eventguard/users1+logs1PASS. | 제품수정0,검증기의pending·requestcountassertions로입증. |
| R32C-04 | RESOLVED. hide-approvedred/publishinfo/approval배타분류model시험PASS. | model/modeltest제품수정0,배지8대표정본검사유지. |
| R32C-05 | RESOLVED. normal/긴row40/date132×34/열130·140·100·160/name/fulltexttitle1216PASS. | CSS제품수정0,실측과title/전체값회귀검사유지. |
| R32C-06 | PARTIAL/BLOCKER. CLI7음성RC1은해소. runner236–240 rawErrors를558–560에서무시→합성console1/pageerror2인데RC0/PASS. catch567 process.exit는finally를막음;PASS/cleanuptrue먼저출력;공통helper/HTTP/request/font누락;role reviewer·필수경합누락. | 아래06-A~E를모두충족. exact10case/actionmanifest/정리후판정·fault거부·실제3역할/401검사. |

독립재현: Control `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2-correct1-review-20260930_224512/probe.mjs`,probe-results.json/PNG. 현재rows잔존스크린샷 `settled-old-rows-during-debounce.png`. 합성검증기재현 `inject-ui-errors.mjs`,`injected-runner-result.json`,`injected-errors.json` — 기존제품파일을바꾸지않고runtime에시험용오류를주입했다. 이합성오류는제품결함이아니라검증기가거부해야할조건이다. 제공manifest/action검사근거 `provided-action-evidence.json`. 첫Sol검수도구의disabledclicktimeout/--import경로오류는제품판정에서제외하고.first-pass/control-first-failures.md에보존했다.

## 4. 닫힌 수정 경계 및 착수 기준

수정허용기존2파일(신규·삭제·rename0,각30,000bytes이하):

| 경로 | 현재 bytes | 전체 SHA-256 |
|---|---:|---|
| `src/web/screens/access-history.ts` | 29386 | `4763CB40F3F90F5673CEFCD05DFB8ACC99EB29748C727BCEA3A629FB958A4A0F` |
| `scripts/ui-checks/access-history.mjs` | 26436 | `7D6449026E6CB3865097B3BD057AE367DC6D73CEA0E2B8282C4B3744BE698FF0` |

다음7개의수신본은바이트그대로보호한다. 전체나머지336파일도동일하다.

| 경로 | bytes | 전체 SHA-256 |
|---|---:|---|
| `src/web/screens/access-history-model.ts` | 6786 | `03C511282B010774CBEFAE9C0CC0377A8A5CBBEB4C70168663E1695E48765265` |
| `src/web/screens/access-history-model.test.ts` | 10177 | `29ED9EA2CC5637B36A475753F523EAD180F09BA029C7A3E9F681862F66871F3E` |
| `src/web/access-history.css` | 7261 | `286A0DF91BB3B0EEDEEE7B21A01CA26521BB441051B23F3FF8C10F3381B1E8A1` |
| `src/web/screens/shell.ts` | 16334 | `27750E549BCACDFFD90C9404491C5D4DFC0301B37C10787ECE9D06BD483F2130` |
| `src/web/index.html` | 601 | `1E3AAE08F0D97B2D1F41E65A63E761180DA10BDE7C7BD0683462B629F41C8CE2` |
| `scripts/copy-web-assets.mjs` | 4292 | `68147FF528AF9C8C6606B31E348554DC48C433549EA330B2EF464AA6F2AF0115` |
| `docs/codebase-map.md` | 12228 | `6CE07350177776DB638BCEBDA0F7211C4EA50C497B1E9C5B012B961B5AD865E9` |

baseline: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2-correct2-20260930_230510\baseline.json` — 142898bytes / SHA-256 `EFC540FF593B76D55784BD578B40FEEB4D1CA838A797749FF9928CFEE70E5DDE`.338전체(양식샘플9포함),editableExisting2/protected336/canonical14,신규허용0. TODO/current-state는CORRECT1검증종결후Sol이갱신한새기준이다. 원CORRECT1 baseline은이력,현재착수에사용하지않는다.

예상상태:

```text
 M docs/codebase-map.md
 M scripts/copy-web-assets.mjs
 M src/web/index.html
 M src/web/screens/shell.ts
?? scripts/ui-checks/access-history.mjs
?? src/web/access-history.css
?? src/web/screens/access-history-model.test.ts
?? src/web/screens/access-history-model.ts
?? src/web/screens/access-history.ts
```

common scripts/lib/ui-check.mjs/find-chrome,기존shell/home/login runner·시험/package/config/shared/main/API/auth/DB/전역CSS는보호. V3전체읽기전용. Control정본/AGENTS/PROTOCOL/GEMINI/CLAUDE/07/TODO/.ai/Log보호,rootHANDOFF회신만허용. dist/ignored artifacts의고유실행산출물만허용. credentials/password/cookie/recoverykey/stdout/capture노출0.

정본: Control05-screen-spec§8/11-디자인-요청서/12-능력-매트릭스§4.5,시안2026-09-02-2차HTML/12-access-logs-1.html G1/G2와2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md. 승인G1:573 schedule-publish info. actualsrc/shared/bridge/contracts.ts의listAccessLogs/query와src/shared/domain/access-log 옵션/actionLabel,access-log-service의ISO날짜inclusive/최신정렬,route-registry의admin guard를재사용하며전부읽기전용.

## 5. 유지할 원 요구사항 및 불변조건

| ID | 행동 | 기대 결과·오류 경계 |
|---|---|---|
| R32-01 | admin 관리 메뉴 진입 | `활동 이력`, icon `history`, id `access-history`, 활성 항목/aria-current/page 및 헤더h1 갱신. 다른3역할은 메뉴0·관련 API 자동 호출0. Screen 자체도 admin 확인 후 읽는다 |
| R32-02 | 최초조회·필터·초기화 | 운영 PC 로컬 월초~오늘; 사용자/액션 `all`, 검색 빈값. `createTodayDateInputValue` 재사용, UTC today 생성 금지. 날짜·선택 변경 즉시 조회, 검색250ms 후 최신 keyword만 조회; 초기화/필터 초기화는 debounce 취소 후 기본값으로1회 조회 |
| R32-03 | 날짜 오류·새로고침 | 빈 날짜는 해당 경계 생략. 존재하지 않는 날짜/시작>종료면 사유를 표시하고 list 요청0; 예전 in-flight 결과도 무효화. 새로고침은 현재 유효조건으로1회, 처리 중 native disabled로 중복0. 조건잠금은 native disabled=false/aria-disabled=true/연결된사유·키보드포커스 유지, click/Space/Enter guard로 요청0 |
| R32-04 | 정상 목록 G1 | native table5열 `활동시간/사용자/권한/액션내용/상세`, `th scope=col`, 실제응답 최신순 유지. 사용자 displayName·loginId, 권한 `getRoleLabel`, actionLabel, routeLabel + ` / ` + details 또는 실제 한 값/없으면 `-`. 시간은 기존 ko-KR 로컬 표시, invalid 값은 안전한 원문 표시.200행씩 더 보기/전체 N건 중 M건 표시; 더 보기마다 추가200, 원본 배열 삭제·절단0 |
| R32-05 | 로딩·G2·조회 실패 | 최초/재조회 로딩 안내는 role=status. G2는 **성공 빈 배열일 때만**. 제목·안내·필터 초기화는 승인 G2. 목록 실패/예외는 role=alert·한국어 오류·재시도, 빈 데이터 성공으로 위장0. users 실패는 목록 성공과 분리해 오류/재시도, 선택한 loginId를 조용히 바꾸지 않는다 |
| R32-06 | 세션·권한·이탈·경합 | AUTH_SESSION_REQUIRED는 current 요청일 때 기존 onSessionExpired 콜백을1회 호출해 로그인으로. AUTH_FORBIDDEN은 권한 오류/데이터0, 자동 로그인·우회0. query 변경/refresh/mount 세대와 destroyed 확인; old success/error/auth/finally는 새 상태·잠금·현재 화면을 바꾸지 않는다. destroy는 debounce 취소·세대무효·listener 정리 |
| R32-07 | 디자인·접근성·안전 | 아래수치 및 G1/G2 캡처. 사용자/서버 문자열은 textContent 또는 검증된 escape로, HTML 실행0. inline style/onclick/external font/network 추가0; CSS scope 밖 영향0. keyboard로 날짜/두select/검색/초기화/새로고침/더보기/메뉴이동 가능 |
| R32-08 | 실제 Chrome 시험 | 아래8case+기존2회귀, 각 입력→기대→실제값·요청수·captures·manifest. 인증/인가 판정은 실제 서버/cookie로 확인; response fixture는 UI 상태 시험에만 표시하여 사용 |
| R32-09 | 통합 증거 | typecheck/lint/map/build/full tests, changed9경로/보호hash/전체diff/신규파일 크기/정리 결과. 구현제출은 수용과 다름 |

### 원 IMPLEMENT의 재사용 계약

1. model helper: 월초/오늘 문자열, query snapshot/trim/date validation, 사용자 옵션은 loginId identity·한국어 이름 정렬, 날짜/role/detail/action 표시. 서버 정렬/필터를 프런트에서 재구현하지 않는다.
2. screen은 HomeScreen와 같은 `{container,session,onSessionExpired}`와 `render()/destroy()` 계약. 최초 admin guard, local state, `destroyed/generation/debounce/sessionExpiredTriggered` 보유. 화면 본문/필터 DOM은 안정적으로 유지하여 검색 시 focus/caret를 잃지 않는다.
3. 최초에는 logs와users를 병렬로 읽되 `Promise.allSettled` 등으로 각각의 실패를 분리. users는 최초/명시 재시도/새로고침 때 읽고 단순 keyword마다 중복 조회하지 않는다. list는 immutable query snapshot을 사용. 모든 async resolve/reject/finally 반영 전에 현재 세대·수명을 확인한다.
4. 조건 변경은 이전 debounce/조회세대를 무효화하고 loading→success/error. invalid 조건은 화면사유+조회0. count/rows는 현재 성공 query 데이터만 가리킨다. 처리 중 reset/유효 필터 변경은 새세대이며 이전 finally가 잠금을 해제하지 않는다.
5. 5열표는 안정적인 record.id로 표시, 통째로 row state를 복제/캐시하지 않는다. 더 보기는200행씩 로컬 표시만 확장한다. textarea/내용경로/사용자 문자열이 HTML을 만들지 않도록 한다. 선택·편집·행 click 동작이 없으므로 가짜 selectable-grid/cursor:pointer를 붙이지 않는다.
6. G2 본문은 승인 시안. **빈 월에도 과거 날짜로 검색할 수 있어야 하므로 동일한5필터는 G1/G2에서 계속 접근 가능하게 유지한다.** G2 시안의 축약검색줄은 완전한 필터 제거 지시가 아니다(`05`§8/기존실제화면 기능 우선). 이 조정과 캡처를 회신에 명시한다. 실제 데이터·더보기·로딩/오류는 정적 시안의 샘플과 구분한다.
7. shell에 활동항목/필드/mount 추가. HomeScreen 수명관리 위치3곳(`destroy`, `refreshMain`, 로그아웃 시작)에서 활동화면도 destroy; 상태줄은 유지. 홈복귀·다른준비메뉴 진입·logout·session expiry 후 활동응답이 DOM을 덮지 못하게 한다. 현재의 다른 placeholder메뉴는 그대로. 기존 callback/wrapper권한 변경0.
8. CSS/index/copy 연동. 공용 스타일 수정 없이 screen scope에서 토큰/부품 구현. docs 작은 갱신. 신규model시험과 UI runner를 쓰고 아래명령 순서대로 검증.

### 유지할 디자인 수치

- 셸 유지: 1440×900, sidebar220↔64, header56, footer32, title20/600. 본문 padding16px20px/gap14px.
- 표 본문14px/400, **머리12px/600**(HTML의13보다 디자인 정본이 우선), 머리#F8F9FA, 기본 행40px/padding8px12px. 긴 내용은 가로 스크롤/명시적 제목·전체 텍스트 접근으로 보존하고 값 절단0; 가짜 줄내림으로 행40을 과장하지 않는다.
- 기본열 폭130/140/100/160px, 마지막 상세는 남는 폭. overflow-x:auto, 가로스크롤 키보드 접근. 길이가 긴 데이터의 전체값은 title/접근 가능한 텍스트로 유지한다.
- 필터/표 표면흰색, 경계#E2E5EA/radius6, 필터 padding12px16px. 날짜 input34px높이/132px폭, keyword160px, label12px, input기능선#848A93. 버튼13px/radius6, secondary padding6px12px. empty body:폭600px(작은viewport에max-width100%)/padding48px24px/간격16px/radius8(승인 G2 변형)/제목18px700/안내13px.
- 배지는12px600/radius4/padding2px8px(정보만 승인HTML의2px6px 변형 허용). G1처럼 sign-in/route-view는 **대기 neutral #F1F2F4/#4B5563**, 승인·재승인확정은 #E8F5EE/#1E7A46, 기타 정보는 #EEF1FB/#3E56B6. 실패/반려/삭제는 #FCEBE9/#C0392B. 예전React helper의 sign-in초록은 시안과 충돌하므로 복사하지 않는다. 동작 정책을 바꾸는 것이 아니라 표시색만 정본을 따른다.
- 초점2px --accent, 정보의 색+문구 병기. th scope, 표 accessible name, filter label/name, status/alert. 처리중 disabled와 조건잠금 aria-disabled를 구분하며 isDisabled()만으로 native값을 판단하지 않는다.

### 유지할 불변조건과 과거 함정

- 화면은 새로, 계산은 그대로. API/DB/정책/승인스냅샷/이관원본/기존시험 바이트 수정0.
- 관리자 UI 숨김은 서버 권한 보증의 대체가 아니다. HTTP200의 BridgeFailure도 실패이며 AUTH_FORBIDDEN/AUTH_SESSION_REQUIRED를 empty로 바꾸지 않는다.
- id/loginId를 식별자로 사용; 동명이인을 displayName으로 합치거나 별도 숫자 식별자를 표시하지 않는다.200행은 표시 단위이며 전체 count·더보기로 데이터 전부 접근.
- UI 오류를 fallback 0건으로 감추지 않는다. 예전조회 success/error/auth/finally, 이탈 후 늦은 응답, debounce초기화 잔여 호출을 각각 검증한다.
- Playwright isDisabled()는 aria-disabled도 포함한다. 잠금은 DOM `.disabled` 실값, actual Tab/document.activeElement/outline, actual Space/Enter/click 요청수로 검사한다.
- held route를 unroute하기 전에 handler 완료를 기다린다. fixture 도구 실패는 제품 실패와 분리하되 원 실패 로그를 보존한다. mock 성공을 실제 API/권한/데이터 시험으로 주장하지 않는다.
- credentials/신규암호/cookie/복구키를 stdout·로그·JSON·HANDOFF·캡처에 남기지 않는다. 기존 실패/skip를 누락하거나 전체시스템용 토큰을 읽지 않는다.


위 원 계약은 유지하며, R32C-01~06과 아래 수정 전략이 이번 결함의 구현 순서를 구체화한다. 새 착수 기준은 원 clean/333/신규부재가 아닌 이 패킷의 dirty9/338/기존2 기준이다.




## 6. 이번 수정의 Sol 전략 — 최소 변경으로 모든 게이트 닫기

### R32C-01 — 입력 순간 본문·잠금의 owner 정합성

현재240–255에서value/save·timer취소·세대무효화는유지. 바로oldquery표를제거하고새query를기다리는role=status본문으로렌더링한다. stablefilter DOM/focus/caret를다시만들지않는다. count만변경한채oldrows를currentquery와나란히두지않는다. isLoading을pending표시에사용하고필요한renderBody/updateControls를한번씩호출;debounce대기와실제currentrequest isSubmitting를구분해pendingold세대가currentrefresh/retry잠금을소유하지않도록한다. timer가null로끝나고currentgen/destroyed대조된뒤loadData1회,manualrefresh/date/select/reset/retry는타이머를취소/소비하고최신query1회. 이미통과한invalidrender/usersguard/staleauth/badge/table행을바꾸지않는다. oldfinally는currentpending을해제0. 입력직후row0/status·focus와끝의latestrow를각assertion으로검증.

### R32C-06-A — 공통 실행기·오류 검문

정상/live/UIfixture/role경로는보호된 `runScreenCheck`/`validateTargetUrl`/`waitForFontsReady`/`findChrome`를실제호출. 공통runner는실패에process.exit하므로 **동일runner파일의별도childworker를outerowner가실행**하고child비0에도외부finally가server/temp정리. worker의내부모드는publicCLI우회flag로열지않고owner가준고정URL/ownedtemp/explicitprivateenv만허용;다른AI CLI가아닌Node시험worker다.

actual401/networkabort cases는별도완전계측negativeChrome경로(동일runner파일)로공통URL/health/font/Chrome도구재사용. console/pageerror/requestfailed/HTTP≥400/CSP원목록을모두저장하고정확한APIpath·phase·status·예상횟수만expected분류;그외1개라도FAIL/RC비0. rawErrors배열을읽지않는코드/401문자열포괄제외/200재작성/authmock0. 합성unexpectedconsole/page/HTTP/요청실패거부시험에서실제실패하는지확인한다. 기존code/tempcredentials를출력하지않는다.

### R32C-06-B — cleanup 이후 한 번만 최종 판정

runnercatch의process.exit제거. error저장→finally에서Chrome/context·childserver exit·temp경계확인삭제→cleanupErrors합산→최종manifest/result작성→process.exitCode로종료한다. earlyreturn에서도ownerfinally완료전PASS/tempCleaned출력0. kill전exit/error listener등록,이미exited상태처리,boundedtimeout,cleanup각항목은다른cleanup실패와독립실행. 초기mkdtemp/boot/serverstart/Chrome찾기/launch오류도외부ownerfinally경계안. 공통workerexit와기존회귀childexit의stdout/stderr를보존하고parent정리를막지않게boundedtimeout을설정.

### R32C-06-C — 미소유 서버 접근 0

start74의foreign일수있는healthprobe를포트소유확인으로대체. read-only OS socket/PID조사또는임시bind검사로충돌을거부하며다른PID에health/sign-in/kill0. spawned childPID·listener연결/ownedbootstrap준비를확인한뒤에만네트워크·admin초기화. race/EADDRINUSE/childspawnerror는BLOCKED/FAIL+owncleanup,절대다른기존서버를재사용하지않는다. shadow서버/운영DB/과거temp를건드리는시험0. env SHIFTMGMT_*는제거후explicit ownedtemp/18741/bootstrap만주입.

### R32C-06-D — 실제 누락된 모든 필수 행동 assert

아래10case표의각행동을실제로실행하고input/action/expected/actual/requestcounts/PASS·FAIL/캡처를action-assertions에남긴다. reviewer없음,got401미사용,literaltrue assertion,메시지밖에없는retry시험을이전회신대로PASS라고하지않는다.특히:

- role: freshrealoperator/planner/reviewer(bootstrap미존재면기존admin saveOperationUser API로생성/ok확인),각menu0/auto list·users0/direct cookie AUTH_FORBIDDEN/data없음,admin허용. plannerusers도직접확인.
- session: 별도APIRequestContext또는현재개선된nativefetch에realcookie로server signOut→actual401/AUTH_SESSION_REQUIRED를assert→login전환1/activityDOM0→무cookie directlist거부/data0. got401같은수집값은정확한숫자와본문으로판정하고literaltrue제거.브라우저401console/HTTP의expected는각path/횟수/phase로대조.
- stale: pre250ms old success/error/auth각release,latest후release,oldfinally가newpending잠금해제0,home/placeholder/logoutdestroy와debounce취소,currentAUTH1회. pendingroute완료를bounded하게기다리고unroute는handler끝뒤. fixedsleep으로전체흐름성공을추정0.
- filters/errors: 각filterHTTPbody/keywordlatest1/reset·immediateactions중복0,invalidrawmodel/빈경계/nativefocus·clickSpaceEnter폼Enter0/pendingdisable;listnetworkthrow/G2위장0/users선택loginId보존/heldretry2회추가0/requestcount/native값/XSS실행0.
- live/G1/G2: realresponse행/count/정렬/refreshdouble0;대표8배지·rowid/order·201전체보존·normal/long40·fulltexttitle/invalidtime/XSS/font/name/th/5열;G2성공빈배열만/600/radius8/padding48×24/title18/700/5필터/과거기간/defaultreset1.

### R32C-06-E — 진짜 원본 산출물과 회신

`createUniqueRunDir` 등공통의원자적고유경로를재사용. fontready뒤capture실제파일존재확인. action-assertions/manifest는rawchannels/expected분류차이/실행URL/Chrome/version/viewport/시각/각동작requestcount/firstfailure/stdoutstderr/cleanup과연결한다. saveCapture에서미리PASS를쓰지않고최종owner의일관된status로마감한다. 회귀child의공통manifest는해당부분결과이며소유서버/temp cleanup뒤owner전체PASS가결정됨을명시. 실패는처음로그와최종로그를같이보존. 권한검사3역할중2만실행하거나unused401flag를두고실측완료로회신0. 소유자와경로를입증하지못한cleanup은true로보고0.

## 7. 착수 전 확인 / 최소 변경

repository/main/fullHEAD/status9,이baselinebytes/hash/전체338/허용2현재hash/보호336/정본14일치확인후수정. received변경5위에추가수정2만허용,model/modeltest/CSS/frozen7은현재수용된제출byte보호. 코드증분만고치고전체sourcefile재생성/포맷0. 제품2파일각30k상한.불가능하면먼저필요exact경로/이유/대안과BLOCKED를회신;기존시험완화/추가파일로은밀히범위확대0.

## 8. 검증 계획 / 성공 조건

### 8.1 정적·빌드·관련·전체시험 — 제품 저장소에서 순서대로

| 명령 | 기대 |
|---|---|
| `npm run typecheck` | RC0 |
| `node --check scripts/ui-checks/access-history.mjs` | RC0 |
| `npm run lint` | RC0,신규오류/경고0,기존5경고공개 |
| `npm run validate:map` | RC0,기존87경로 유지 |
| `npm run build` | RC0,CSS dist/browser/web·indexlink/font/CSP 정상 |
| `npx vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | RC0,관련기존11시험 유지+의미있는badge회귀,skip/fail0,실제개수기록 |
| `npm test` | RC0,133파일/919시험 이상 유지+추가실제집계,fail/skip0.신규scope밖시험수정0 |
| `git -c safe.directory=C:/Projects/Active/ShiftMgmt_V4 diff --check` | RC0;untracked5file후행공백/EOF여분별도검사 |

### 8.2 실제 Chrome10case — 각각 명령/RC/원출력/실측/캡처

각case를 `node scripts/ui-checks/access-history.mjs --case=CASE`로별도실행. 각실행자기소유fresh `os.tmpdir()/shiftmgmt-gemini-32-*`,port18741,1440×900,Chrome/font준비,기존SHIFTMGMT_*제거후명시ownedenv 설정. 무권한/만료거부는실제servercookie,UI상태fixture는fixture로명시.역할planner/reviewer bootstrap이없으면기존admin `saveOperationUser`로격리계정생성;directSQL0.

| CASE | 반드시 실제로 검사할 동작·값 |
|---|---|
| live-admin | real sign-in/L4→활동→real list/users와행/count/순서대조→refresh1회/pendingdouble0→홈/재진입→logout. fixture0,필요audit는existing authenticated recordAccessLog로시험임을표시. |
| list-fixture |8대표액션(approve/reapprove/hide-approved/publish/sign-in/route/reject/info)G1색/font/table역할name/th/5열/normal40px/날짜132×34/130·140·100·160수치.201record응답ID/순서/전체N=201보존,처음200→more201/남은0.긴텍스트/invalidtimestamp/특수HTML 원문title·40px·XSS실행0.|
| empty-fixture |successful[]만G2,loading/error는G2아님.600/radius8/padding48×24/title18/700/font실측.5필터접근유지→pastdates→reset/currentdefaultquery1회/debounce0/capture. |
| filters | HTTP query body dateFrom/dateTo/loginId/actionType/trimkeyword정확.연속keyword250ms latest1회,keyword후refresh/date/select/reset timer중복0.두날짜를모두설정한역전·model불가능일·빈경계 각각실제값확인. invalid에서click/Space/Enter/formEnter requests0,DOMdisabled=false/aria=true/actualTabfocus/outline2px.실제requestpending native disabled/refreshdouble0. |
| errors |list HTTP200BridgeFailure/networkthrow별도alert/retry/G2위장0/오류문자열XSS0. usersfail+listok분리/선택loginId유지/usersretryheld두click추가0/실제requestcount.처리중disable/finally새owner보호.지정 network abort의raw오류만정확히expected분류.|
| stale-response |heldold success/error/auth 각query변경후 **250ms timer발화전** release에도화면/권한불변.새query성공뒤old release불변.별도old finally가newpending을해제0. keyword→manualrefresh1회.홈/placeholder/logoutdestroy→oldrelease/activityDOM0/debounce0. currentAUTH전환은1회.각request/releasehandler완료를boundedwait하고unroute는완료뒤. |
| role-guard |realoperator/planner/reviewer 각login세션 menu0/auto list·users0/direct cookie API AUTH_FORBIDDEN/data없음,admin허용.인증fixture0. |
| session-expired |realadmincookie를별도APIRequestContext로전달하고signOut을실행해 **서버세션무효화**→UI refresh→actual401/AUTH_SESSION_REQUIRED→login1/activityDOM0.별도무cookie directlist실제거부/data0.같은page signOut을별도context라고보고0,TTL경과주장0,expected401정확channel/count기록.|
| regression-shell |같은ownedenv/bootstrap/URL로기존 `node scripts/ui-checks/shell.mjs http://127.0.0.1:18741/` childRC0.기존소스/기대값수정0.|
| regression-home |같은ownedenv/bootstrap/URL로기존 `node scripts/ui-checks/home.mjs http://127.0.0.1:18741/ --case=live-admin` childRC0.기존소스/기대값수정0.|

### 8.3 필수 CLI 음성 게이트 / 범위 / 정리

- `node scripts/ui-checks/access-history.mjs --case=sol-unknown-case`: RC비0,unknown설명,시나리오PASS0,temp/artifact/spawn/network0.수정전falsePASS원출력은보존.
- `node scripts/ui-checks/access-history.mjs --case=` 및 duplicatecase/추가flag/임의URL/localhostURL/외부URL문자열각거부. URL문자열은preflight만하며실제foreignnetwork접근0. 거절시점과자원생성0의근거기록.
- startup/Chrome초기화/시나리오/정리실패모두outerfinally도달·RC비0·truthfulFAIL. 이미있는다른포트/PID서버를조회/종료하지않는다. controlled ownedstartup실패에서exit/temp정리도확인하고테스트목적때문에public검문우회옵션을추가하지않는다.
- capture/manifest/action-assertions실제파일존재/경로일치·실행시각·첫실패+최종증거보존. `tempCleaned:true`는실제realpath경계/exit/삭제완료후만쓴다.기존거부temp `shiftmgmt-sol-31d-2Kh5fr`등historicaltemp건드리지않는다.
- currentgitfile집합338/status9/HEAD불변,허용2만새baseline에서변경,protected336/canonical14 SHA·bytes불변.각변경2≤30k/new/delete/rename/deps0.전체diff원문·9현재크기/sha·생성물/temp/Chrome/childexit 결과기록.원4통합파일보호유지.

위 R32C-01~06/원R32-01~09/경계/10case/full시험/음성CLI/정리가모두충족돼야 IMPLEMENTED. 불충족시FAILED 또는환경/설계경계BLOCKED로회신한다. 고친한결함만보고다른게이트생략0.



## 9. 중단 조건 / 마지막 재제출

baseline/HEAD/status/hash모순,2파일외수정/새파일·dependency·API·auth·DB·공통helper변경필요,30k안에필수검증불가,실제Chrome/realcookie/expected401검사불가면BLOCKED. 실행실패는처음실패와정리결과를숨기지않고FAILED/BLOCKED. CORRECT2뒤같은결함군실패면Sol이전략/범위를재설계한다. 최종수용·커밋·사용자확인·배포는이번구현회신으로추정하지않는다.

## 회신

판정: IMPLEMENTED | BLOCKED | FAILED
기준: repository / main / fullHEAD / finalcommit없음
착수: status9/전체338/허용2/protected336/canonical14/fullbaselinehash 대조
변경: exact2paths / R32C-01 또는06 / 최소증분목적
stable결함: 01잔여/06-A~E 각 원인→심볼→실제재현명령→expected/actual/requestcount→PASS/FAIL/BLOCKED;02~05보호/회귀
원R32-01~09: 각구현/검증근거,누락0
검증: exact명령/시작끝/RC/rawlog/실제files·tests·fail·skip·기존경고
10Chromecase: 실제URL/version/viewport/fonts/realvsfixture/각input-action-expected-actual-requestcounts/manifest/capture전체경로
음성CLI/오류주입/초기화실패: 기대비0/실제RC/원 실패·최종근거/오류raw/정리결과
diff: 2파일증분/전체9status/보호336·정본14불변/deps0/dist·고유artifacts
전체9hash: eachpath bytes/full64SHA;허용2vs보호7 구분
정리: ownChrome/context/childPIDexit/temp realpath삭제;최종status와cleanuperrors
미해결/가정: 없음 | exact목록
TODO제안: 구현제출/수용대기만,완료·커밋·사용자확인추정0
