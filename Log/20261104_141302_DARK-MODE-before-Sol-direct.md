# HANDOFF — UI-DARK-MODE · IMPLEMENT

- Task / Plan leaf / Parent implementation task: **UI-DARK-MODE** — 눈의 피로가 적은 다크 모드. 준비/구현/검수에서 동일 ID.
- Action: **IMPLEMENT** / From: Sol (Codex, 설계·독립 검수) / To: Gemini (제품 구현) / Time: 2026-11-04 23:07:23 KST
- Repository: `C:\Projects\Active\교대근무시스템` / 제품 cwd: `ShiftMgmt_V4` / Branch: `main`
- Baseline commit: `de58fe9fe8043f5ef43819e4d2950797532501d5`
- 초기 상태: 이전 운영 관리 수용 변경을 포함한 dirty 상태. `.ai/reports/dark-mode-20261104/initial-git-status.txt` 참조. Sol의 TODO/HANDOFF/장부/Log/보고 추가는 예상된 제어 변경이고, **제품512개는 baseline manifest와 byte/SHA가 같아야 한다.** 기존 수정물 초기화 금지.
- Baseline: `.ai/reports/dark-mode-20261104/baseline-source.json` / SHA256 **E42D569C51F1BA6C039B52F13AD53FAB57BA082B5ECC05D2B478C7A458BF5963**
- Gemini 시도: 최초0/1·재시도0/1·누적 실제제출0. 현재 담당 Gemini. 최초+재시도 모두 검수 실패 시 같은Task에서 Sol승계하며 전략/버전으로 횟수를 초기화하지 않는다.
- 권한: 2026-11-01 “Gemini 한도 복구…작업지시는 다시 Gemini…너가 검증” 지시 적용. 이전 공휴일의 Sol승계나10/31 직접수정 예외를 신규Task에 재사용하지 않는다. 사용자가 이 파일을 수동 중계하며 다른 AI CLI를 호출하지 않는다.
- 회신 필요: 이 파일 맨 아래 `## 회신`만 작성. 구현 제출은 Sol 수용/사용자 승인과 구분한다.

## 1. 목표·승인·비목표

사용자가 로그인 전후에 **밝게 / 어둡게 / 시스템 설정**을 선택하고, 선택이 이 브라우저에서 유지되며 모든 기존 업무 화면을 일관된 대비로 사용하게 한다. 기본은 시스템 설정이다. 순흑색/전체반전 대신 차분한 어두운 표면과 읽기 편한 본문·선택·경고를 제공한다.

사용자 “오케이 다음 작업 진행하자”로 운영관리7탭 및 요율 변경일시/양식 편집 보완을 확인했고, TODO의 다음 순서 다크 모드에 착수했다. 이전 수용: `.ai/reports/operations-uniform-20261104/editor-usability-followup/assessment.json`, SHA256 `46738FD247BC2256618101FBC8BC5F6999949380C66FDB086FB0FFD4DDEA0E8C`. 이전Task Gemini1/1/2는 역사로 보존하고 신규Task는0/0/0.

계산/시급/정책/승인/권한/세션/API/DB/백업·복원/문서 데이터/보안 헤더를 바꾸지 않는다. 기존 layout/Dense/행·버튼·카테고리 높이/페이지·검색/dirty·모달 ownership·busy 잠금을 유지한다. 출력 종이·이미지·로고는 밝은 원색을 유지한다. 엑셀/품의서/근무표 양식 변경은 다음 UI-TEMPLATE-REFINE이며 아직 시작하지 않는다. 의존성/프레임워크/원격서비스 추가·일반 리팩터링·commit/push/배포/운영PC 적용 없음.

## 2. 실제 조사·정본

- `index.html`:15개 CSS 뒤 app.js. 테마 controller/bootstrap/저장 없음. `styles.css` 공통토큰이 있으나 다른 CSS에 고정색이 많다. `css-inventory.json`:15개 CSS·hex색1875회. 원CSS를 광역 치환하지 않고 마지막 theme.css로 의미별 override.
- `shell.ts:createHeader`의 `.header-user-actions`, `login.ts:render`의 공통 `.login-container`가 제어 위치. render/destroy와 로그인 상태 전환에서 구독 정리가 필요하다. 인증·메뉴·세션 흐름은 보호.
- `dashboard-charts.ts:drawOne/trend/sites/ratio/legend`는 배경/눈금/라벨을 Canvas에 직접 그린다. CSS만 바꾸면 흰 사각형/낮은 대비가 남는다.
- `DashboardCharts.capture`는 `drawOne(key,1,false)`→PNG→finally 화면복원. `dashboard-export.ts`가 이 PNG를 실제 XLSX/PDF에 포함하므로 출력용 light palette를 분리해야 한다.
- `copy-web-assets.mjs`는 명시적 복사목록. 새 JS/CSS도 필수 등록. 정적서버는 `.js` same-origin을 지원하며 CSP `script-src 'self'; style-src 'self'`는 변경하지 않는다.
- 기존 `operations.mjs`:20/N12·7탭×3크기21측정·요율 일시/양식 초안불변 검문. `dashboard.mjs`:20/N12. 두 검증기와 fixture·기존시험 수정 금지.
- `.ai/reports/dark-mode-20261104/preflight.json`: baseline512 hash·이전 수용 증거 재판독·palette 대비 실측. 새 테마/새테스트는 없으므로 제품 성공으로 보고하지 않는다.

## 3. 닫힌 수정/생성 목록 — 정확히10개

ShiftMgmt_V4 기준, 기존512 중 수정6/보호506. 신규4 포함 최종제품516개. baseline manifest가 모든 기존 제품의 보호 정본이다.

| 경로 | 상태·허용 변경 |
|---|---|
| src/web/index.html | 기존: 외부 동기 bootstrap과 마지막 theme.css 연결 |
| src/web/screens/shell.ts | 기존: 헤더 제어/cleanup만, 메뉴·권한·dirty·세션 유지 |
| src/web/screens/login.ts | 기존: 공통 테마 제어/cleanup만, 인증·복구·L4 이후 흐름 유지 |
| src/web/screens/dashboard-charts.ts | 기존: 화면 palette/테마 redraw/cleanup·capture의 light 출력; 데이터·산식·히트 의미 유지 |
| scripts/copy-web-assets.mjs | 기존: theme-init.js/theme.css 필수 복사·존재 검문 |
| docs/codebase-map.md | 기존: 신규4경로·실제 책임 등록 |
| src/web/theme-init.js | 신규: CSP 준수 classic bootstrap·유일 상태·저장/시스템/다른 창 반영 |
| src/web/theme-controls.ts | 신규: 공통 선택 UI/타입·구독 cleanup |
| src/web/theme.css | 신규: dark 의미토큰·전체화면/공용 popup/modal·원래 기하 유지 |
| scripts/ui-checks/theme.mjs | 신규: 격리 실제 브라우저 T01~T12·결과/개인정보 제외 |

표 밖 제품 경로, 기존시험/검증기/fixture, package/lock, backend/shared와 원CSS는 읽기 전용. `TODO.md`, `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `PROTOCOL.md`, `.ai/**`, `Log/**` 수정 금지. HANDOFF 아래 회신 칸만 제어 변경 허용. 허용 밖 변경이 필수면 원인과 최소범위를 반환한다. 기존 사용자 창19251에 새 로그인해 세션을 끊거나 다른 프로세스를 종료하지 않는다.

## 4. 요구사항·코드 전략

| ID | 입력/행동 | 기대 결과·경계 |
|---|---|---|
| R01 | 첫 실행/저장 없음 | system 기본. body/app 첫 페인트 전 resolved theme 적용. invalid 저장값은 system |
| R02 | 로그인/헤더 선택 | 밝게/어둡게/시스템 설정. 즉시 적용·reload/로그아웃/재로그인 유지. “이 브라우저에서 적용돼요”처럼 간단한 안내 |
| R03 | OS/다른 창 변경 | system만 OS를 따름, manual 고정. 같은 origin의 실제 storage 이벤트 반영 |
| R04 | 저장소 읽기/쓰기 예외 | 앱·로그인 정상, 이번 창의 메모리 선택 적용. invalid값 안전처리·다른 저장키 삭제0 |
| R05 | 전체 업무/운영7탭 | 배경·패널·표·본문/보조문자·입력·상태줄·팝업/모달/tooltip 대비. 상태색 의미 유지 |
| R06 | 미저장 편집 중 전환 | 컴포넌트 재생성/재조회/업무저장0. 초안·DOM identity·페이지/검색/선택/필터/dirty·포커스·열린모달 유지 |
| R07 | 양식/실제 미리보기 | 흰 종이·텍스트·이미지 원색 유지. 앱 chrome만 dark. filter:invert 금지 |
| R08 | dashboard 전환 | 보유 model/active/hits로 같은 canvas redraw, 눈금/라벨/tooltip 가독성. 데이터 재요청0 |
| R09 | dark에서 차트/리포트 출력 | export raster light palette, 데이터/금액/행수/계약 동일. capture 후 화면 theme·active 복원 |
| R10 | 키보드·화면크기 | 공용 select의 방향키/Enter/Esc/Tab, 접근이름/선택상태.1024×768/1440×900/2048×1080 새 넘침0 |
| R11 | 반복 진입/종료 | bootstrap listener1회, control/chart 구독 cleanup, 중복 제어·끊긴 화면 callback0 |
| R12 | light 복귀/자산 | 기존 기하/기능·읽기 상태 복귀. JS/CSS404·신규CSP위반/예외0 |

1. **theme-init.js**: 의존성 없는 IIFE classic script. index head에서 body/app 전 **외부 동기 script**로 로드한다. inline/eval/CDN 금지. `data-theme=light|dark`, `data-theme-preference=light|dark|system` 갱신, color-scheme은 CSS가 담당한다. 저장키 `shiftmgmt.theme` 하나, 유효값3개만 허용. 없거나 invalid→system, matchMedia 불가→light. get/set/media 구독 예외를 경계에서 처리한다. 전역 storage/media listener1회. `window.shiftmgmtTheme`의 `getPreference/getResolvedTheme/setPreference/subscribe→unsubscribe` API가 상태의 유일 소유자이며 중복통지하지 않는다. 서버·업무설정/세션 저장 금지.
2. **theme-controls.ts + shell/login**: 공통 native select를 생성하고 기존 common-controls의 단일선택 기능을 재사용한다. 별도 dropdown 금지. login/shell별 유일label/id와 “화면 테마” 접근이름, 현재선택 표시. theme change에 shell/login render를 호출하지 않는다. 화면render/종료 시 unsubscribe. 로그인에 cleanup용 destroy를 추가해도 auth·복구·토큰 로직은 바꾸지 않는다.
3. **theme.css**: 원15CSS 뒤 로드. light는 제어 추가 외 기존 스타일 보존. dark는 `:root[data-theme="dark"]`와 명시적인 화면별 selector로 토큰/색만 override. 광역 `*` 색 통일·invert·padding/행높이/grid 변경 금지. ID selector와 body에 붙는 공용 popup/modal도 확인. D/E/N·경고·오류/성공·선택 의미를 유지한다. `.actual-canvas-board`와 생성 문서/iframe/로고/이미지는 흰 종이·원색을 명시 보존한다.
4. **제안 palette**: 바탕#151b25/패널#1d2633/높은표면#253246/본문#e5ecf5/보조#abb9cd/구분선#3b4b64/제어경계#718096/강조#9baeff/주버튼#5066c4+흰글자/선택#293d62+#c4d1ff. 실제 computed color와 유효배경/alpha/hover로 일반문자4.5:1, 조작경계/초점3:1을 확인한다. preflight의 제안색 계산만으로 실제 전체 대비를 PASS로 쓰지 않는다. [W3C 문자 대비](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [비문자 대비](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) 참조. 전제품 접근성 적합 인증이라고 쓰지 않는다.
5. **dashboard-charts.ts**: theme 구독은 보유 model로 draw만 호출해 선택/필터/순위 유지. 화면 background/축/legend는 theme palette, 밝은 palette는 원색 유지. capture는 명시적 light/export palette로 그린 후 PNG를 얻고 finally 현재 화면 palette/active로 복구. root theme/저장값을 임시로 light로 바꾸지 않는다. capture 실패도 복원. 데이터/모델/금액/그룹/출력계약 변경 금지.
6. **asset/map/검증기**: 새 JS/CSS 필수 복사, 신규4경로 map 등록. theme runner는 아래 CLI/summary와 격리시험 계약을 구현한다. 새 일반 프레임워크나 기존검증기 개편 없음.

## 5. 필수 불변조건·과거 함정

- CLAUDE.md/07: 화면은 새로·계산은 그대로, 승인+계산 트랜잭션/forward-only/근무일 기준 요율·시급/실적은 엑셀 인테이크만 보존. 이 Task는 backend/shared를 바꾸지 않는다.
- `.ai/UI_ACCEPTANCE_STANDARD.md`: 기존 공통 select/모달·Dense·개인정보 제외 유지. dirty/모달token/세션세대/늦은응답·busy에 테마가 관여하지 않는다.
- 저장 문자열은 HTML/style selector로 삽입하지 않는다. DOM 문구는 textContent. localStorage의 개발자동입력 flag나 auth 저장값을 삭제하지 않는다.
- 출력 PNG를 dark로 만드는 변경, CSS invert, 흰 바탕/흰 문자 혼합, light 복귀 후 남은 어두운 inline style은 결함이다.
- 기존 시험/ID/N집합/timeout을 줄이지 않는다. 알려진 보호된 사이트 CSP 결함은 정확한 baseline 서명/근거로 별도 보존하고 새 테마 CSP위반은0. 넓은 예외필터로 숨기지 않는다.
- PW/복구키/세션을 로그/캡처/회신에 넣지 않는다. 기존 artifact-privacy/login helper를 재사용한다.

## 6. 검증 — preflight→집중→관련→최종

새 기능/테스트의 성공은 구현 뒤 검증한다. 이전 운영20/N12·97/8·전체1476/156은 기록 증거이며 새 테마 기능 성공으로 쓰지 않는다. backend가 불변이면 기존 server build의 현재 fingerprint/실제 serving을 확인해 재사용하고 browser/assets는 새로 빌드한다.

출력 root: 저장소 밖 `C:/Users/hacke/AppData/Local/Temp/shiftmgmt-dark-mode-gemini`. 하위 폴더를 먼저 만들고 기존 증거를 덮지 않는다. 원timeout 유지. 단위 전체는 직전428초였으므로 async stream으로 유지하고 추가180s wrapper 제한으로 끊지 않는다. 구현/조정1~3h, 전체단위5~10분, 각 기존UI1~3분, 테마검사3~8분은 추정이며 수동중계 대기 제외.

| 순서 | 제품 cwd의 정확한 명령 | 기대값 |
|---|---|---|
| 1 | `node --check src/web/theme-init.js` | RC0 |
| 2 | `node --check scripts/ui-checks/theme.mjs` | RC0 |
| 3 | `npm run typecheck` | RC0 |
| 4 | `npm run lint` | 오류0·기존경고3 별도 |
| 5 | `npm run validate:map` | 새4경로 포함 누락0 |
| 6 | `npm run build:browser` | 새bundle/source-map |
| 7 | `node scripts/copy-web-assets.mjs` | init.js/theme.css/index 포함 필수복사 정상 |
| 8 | `node scripts/ui-checks/theme.mjs --port=19256 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-dark-mode-gemini/theme-focus --focus=T01,T02,T04,T09` | 대표4개 실제 PASS·집계 일치 |
| 9 | `npm test -- --reporter=json --outputFile=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-dark-mode-gemini/units-v1.json` | 원1476/156 보존, 실패/skip0 |
| 10 | `node scripts/ui-checks/theme.mjs --port=19256 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-dark-mode-gemini/theme-final` | T01~T12 전부 PASS·새오류0 |
| 11 | `node scripts/ui-checks/operations.mjs --port=19257 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-dark-mode-gemini/operations-final` | fullRun/exactScenarios true·20/20·N01~N12 true |
| 12 | `node scripts/ui-checks/dashboard.mjs --port=19258 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-dark-mode-gemini/dashboard-final` | 원20/20·N01~N12 true·실제출력 유지 |
| 13 | `git diff --check` | RC0·보호506 byte동일·신규4만 추가 |

### 신규 실제 UI 시나리오 — 정확히 T01~T12

`findChrome`, `checkServerHealth`, `artifact-privacy`, `access-history-negative.mjs:performNormalLogin`과 기존 runner의 안전한 server/TEMP DB/종료 패턴을 축소 재사용한다. 기존 `seedOperationsFixtures({page,resourcesDir})`, `seedDashboardFixtures({page,isolatedRoot})`, 필요하면 정식 엑셀 인테이크의 `seedOperationalScenarios`를 사용한다. 운영 DB·사용자 창19251·타인 프로세스는 사용/변경하지 않는다.

| ID | 실제 행동·관측 기준 |
|---|---|
| T01 | 새context OS light/dark, 저장 없음/명시light/명시dark. app.js를 지연시켜 최초페인트 전 bootstrap/root·실제CSS 적용을 관측. 최종화면만 보고 번쩍임0이라 쓰지 않음 |
| T02 | login/shell 공통UI 실제 클릭·키보드3값, reload·로그아웃/로그인 유지. 개발용 하단 자동입력 기존flag 보존 |
| T03 | system일 때만 OS media변화 추종, manual 고정. 두 실제 같은origin 창의 storage 이벤트 반영 |
| T04 | localStorage get/set 예외·invalid literal·matchMedia 부재를 분리, 앱 정상로그인·메모리선택·system/light fallback. 예외/임의키삭제0 |
| T05 | dirty 요율/양식 초안·검색·페이지·선택·열린모달 중 테마변경. DOM identity/입력/포커스/dirty 그대로, 재조회·업무쓰기/세션 API 추가0. 상태줄 정확5 read poll은 별도 집계 |
| T06 | 로그인/홈/인력/근무지/근무표 생성·현황/실적 가져오기/수당계산·품의서/활동이력/대시보드/운영7탭을 light/dark로 실제조회·캡처. 모두1440×900, 운영/수당/대시보드는1024×768/2048×1080도. 새넘침/가려진내용0·원숫자/행/컬럼 보존 |
| T07 | 표header/body/선택/hover·입력/보조문구·주/보조/위험버튼·오류/경고·공용select/date/time popup/modal의 실제 전경·유효배경 대비. 문자4.5/제어경계·초점3. 종이/이미지/disabled 예외는 selector·이유 기록 |
| T08 | dark의 양식 흰종이/블록텍스트·선택/zoom과 실제PDF/XLSX 미리보기, 종이/원색/배치·실제파일header 보존. invert 없음 |
| T09 | 실제 산출 dashboard light→dark→light: 보유모델/필터/sort/active 유지, canvas배경/축·legend/키보드/tooltip 가독성. light/dark에서 capture한 출력PNG 밝은배경/동일내용, 실제PDF/XLSX 행수·금액 확인 |
| T10 | capture 성공/강제실패·출력busy 중 theme변경. finally 후 현재theme/active 복구, 중복출력/업무저장0, 기존 오류·취소/재시도 유지 |
| T11 | 로그인/셸/대시보드·모달/팝업 반복진입/종료 후 전환. 중복control/listener·끊긴화면 callback·신규CSP/JS/404 오류0. 기존권한·세션 회귀 보존 |
| T12 | 초기light와dark→light 복귀 주요box/행높이/버튼/카테고리/페이지 기하 대조. 제공init/CSS/JS byte와dist/source-map 일치. native viewport=null 사용자확인 창에 실제light/dark·개발자동입력 제공 |

theme runner CLI는 --port/--out/--focus를 지원한다. summary는 planned/completed/failed/unexpectedErrors/checks(관측값)/captures/servedAssets/fullRun/status를 기록한다. final의 정확T01~T12 집합·실제 관측·실패0이 아니면 RC1. focus 결과를 전체12 PASS로 쓰지 않는다. 상수PASS/소스문자열 탐색만으로 런타임 성공을 만들지 않는다.

운영/대시보드 각각 원20/N12를 충족하며 합산40으로 대체하지 않는다. 명령argv/cwd·시작/종료/경과/RC·stdout/stderr·제품source 전후SHA를 남긴다. 원소스와 검증준비 후 source고정 최종전체1회 목표. 반복실행엔 변경/해결근거, 동일실패2회 또는 검증기수정2회엔 최소재현/가설 재검토.60초 이내 진행보고. 기존 .ai/VERIFICATION_WORKFLOW.md 적용.

## 7. 착수/반환·완료 조건

저장소/브랜치/전체commit·제품512 baseline·허용파일/호출점·요구/검증의 모순을 먼저 확인한다. 차이가 있거나 API/DB/권한 결정·허용밖 파일/의존성이 필수면 수정 없이 원인/최소 추가범위를 반환한다. 아직 없는 신규코드/테스트가 구현 전에 통과하지 못한다는 이유로 BLOCKED라 하지 않는다.

수용은 R01~R12 위치·새T12/원운영20N12/원대시보드20N12/원1476·보호506/신규4·실제light/dark·종이·차트출력 근거를 독립 검토한 뒤 Sol이 판정한다. 미실행은 NOT_RUN, 실패를 완료로 보고하지 않는다. 사용자 시각확인/운영 적용은 별도이며 이번Task의 구현 제출과 구분한다.

## 회신

이 아래에 `IMPLEMENTED | BLOCKED | FAILED`, 최초/재시도·누적 실제횟수, 기준commit/초기상태 gate, 변경10경로와 요구ID, 보호/최종전체SHA·diff, 정확명령argv/RC/시각/결과절대경로, 새T01~T12·원운영20N12·원대시보드20N12·1476/156 실제결과, 캡처/native크기/URL/새오류·기존제약, 실패분류·수정/재실행사유·미해결을 작성한다. 비밀값 제외. HANDOFF 본문·TODO/장부/과거Log 수정 금지.

현재 Gemini 구현 제출 없음. 제품 구현·실제다크화면·테마 runtime 검증은 **NOT_RUN**.
