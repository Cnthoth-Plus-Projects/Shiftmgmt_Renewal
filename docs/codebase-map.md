# 코드 지도 (무슨 파일이 무슨 일을 하는가)

> 파일을 옮기거나 지우면 `npm run validate:map` 이 이 문서를 먼저 잡는다(없는 경로를 가리키면 실패).
> 업무 로직(src/shared, src/main/services, src/main/ipc)은 1-2에서 원본 0.5.4에서 **복사해 들어왔다** — 아래 「업무 로직」 절. 그 파일들은 고치지 않는다.

## 뿌리

정식 Windows 배포: `scripts/package-windows.mjs`는 Node24·프로덕션 의존성·라이선스·해시 ZIP을 생성한다. `scripts/verify-windows-package.mjs`는 모든 파일을 대조하고 `build/fresh-install.ps1`는 새 PC 설치/바로가기를 담당한다. `scripts/start-installed.mjs`는 설치본 서버·첫 관리자 안내·정상 종료를 담당한다. `scripts/release-install-smoke.mjs`는 TEMP 설치와 실제 Chrome 첫 로그인/거절 검문이다. 사용 안내는 `docs/fresh-install.md`, 버전별 설명은 `docs/release-1.0.0.md`다. `scripts/build-browser.mjs`는 개발 전용 자동입력을 정식 빌드에서 제외한다.

| 파일 | 하는 일 |
|---|---|
| `package.json` | 실행·빌드·검사 명령(스크립트)과 도구 목록. 실행 의존성은 3개뿐이다 — 엑셀 읽기·쓰기(exceljs), 폴더 감시(chokidar), 브라우저 자동화(playwright) |
| `package-lock.json` | 실행 의존성과 개발 도구의 정확한 판 번호 고정(`npm ci` 가 이 파일을 본다) |
| `./VERSION` | 이 프로그램의 판 번호 한 줄. 「적용」 스크립트와 `npm run release:check` 가 이 값을 본다 |
| `./.gitignore` | 저장소에 담지 않을 것(설치 폴더·빌드 결과·데이터·캡처) |
| `README.md` | 처음 여는 사람이 3줄로 실행하는 법 |
| `tsconfig.server.json` | 서버 쪽 컴파일 조건(원본 0.5.4의 electron 설정과 같은 조건 — 1-2에서 서비스를 그대로 복사하기 위해) |
| `tsconfig.browser.json` | 화면 쪽 **타입 검사 전용** 설정(파일을 만들지 않는다. 실제 묶기는 esbuild가 한다) |
| `eslint.config.mjs` | 코드 규칙 검사 설정(원본 0.5.4 복사본 — 검사 대상 범위만 바꿨다) |
| `vitest.config.ts` | 테스트 실행 설정(node 환경)과 테스트 전용 resource 경로 초기화 연결 |
| `vitest.setup.ts` | 원본 릴리스 이력 시험이 격리 fixture만 읽도록 `process.resourcesPath`를 테스트 안에서 지정 |

## 문서

| 파일 | 하는 일 |
|---|---|
| `src/main/services/document-layout-print-service.ts` | 품의서·별첨1·별첨2의 A4 인쇄 영역·표 가로 맞춤·빈 끝쪽 제외. 근무표/대시보드 Excel 원형 보존 |
| `src/main/services/document-layout-print-service.test.ts` | 세 서류 A4·추가 행/열·이동 로고·실제 저장 보존 및 인쇄 비대상 무개입 검증 |

| 파일 | 하는 일 |
|---|---|
| `docs/codebase-map.md` | 이 문서 |
| `docs/api-convention.md` | 화면과 서버가 주고받는 규약(창구 111개 계약표 사본 포함) — 1-3 구현의 기준 |

## 스크립트

### 대시보드 UI-07

| 파일 | 하는 일 |
|---|---|
| `src/web/dashboard.css` | 대시보드 필터·KPI·차트·순위 반응형 스타일 |
| `src/web/screens/dashboard.ts` | 저장 계산 조회·필터·화면 수명·출력 작업 조정 |
| `src/web/screens/dashboard-model.ts` | 저장 금액·분·사번 기반 집계와 내보내기 원값 |
| `src/web/screens/dashboard-model.test.ts` | 집계·기간·신원·원값 보존 경계 시험 |
| `src/web/screens/dashboard-view.ts` | 필터·요약·차트 카드와 데이터 표 골격 |
| `src/web/screens/dashboard-charts.ts` | CSP를 유지하는 Canvas 차트3종과 PNG 캡처 |
| `src/web/screens/dashboard-ranking.ts` | 전체 인원 순위와 실측 공통 페이지 |
| `src/web/screens/dashboard-export.ts` | 기존 API로 차트/보고서 출력·취소·오류 처리 |
| `scripts/ui-checks/dashboard-fixtures.mjs` | 기존 실제 API fixture 재사용·독립 기대 집계 |
| `scripts/ui-checks/dashboard.mjs` | 실제 대시보드 UI·파일·권한·CSP 검증과 확인창 |

| 파일 | 하는 일 |
|---|---|
| `scripts/dev.mjs` | 개발 실행 조정기: 빌드 → 서버 시작 → 서버 응답 확인 → 설치된 크롬으로 화면 열기. 크롬 창을 닫아도 서버는 남는다 |
| `scripts/lib/find-chrome.mjs` | 이 PC에 설치된 크롬을 찾는다(내려받지 않는다). 개발 실행·캡처·PDF 출력이 함께 쓴다 |
| `scripts/copy-web-assets.mjs` | 화면 파일과 글꼴을 빌드 폴더로 복사한다(Pretendard는 woff2만, 폴더 구조 그대로) |
| `scripts/capture-screen.mjs` | 실제 크롬으로 화면을 열어 PNG로 찍는다. 콘솔 오류나 400 이상 응답이 있으면 실패로 끝난다 |
| `scripts/validate-codebase-map.mjs` | 이 지도가 가리키는 파일이 실제로 있는지 확인한다(원본 0.5.4 복사본, 수정 없음) |
| `scripts/release-check.mjs` | 내보내기 전 점검: 판 번호 일치·작업 트리 깨끗·같은 판 태그 없음·검사 3종 통과·빌드 산출물 확인 |
| `scripts/clean-server-build.mjs` | 서버 빌드 전 `dist/server` 생성물만 안전하게 청소한다 |
| `scripts/smoke-require.mjs` | 빌드 결과의 서비스가 정확히 79개이고 전부 불러와지는지 확인한다(`npm run smoke`) |
| `scripts/verify-v3-json-migration.mjs` | 실제 운영 v0.5.8 JSON 백업의 스키마 40표·행 무손실 복원 및 정합성을 격리 임시 DB에서 검증한다 |
| `scripts/windows-dialog.ps1` | Windows Forms 기반 파일·폴더 선택 및 경로 열기 PowerShell 스크립트 (UTF-8 JSON stdin/stdout) |
| `scripts/issue-account-recovery-key.mjs` | 원본 계정 복구 유지보수 시험이 실행하는 바이트 동일 스크립트(제품 자동 실행 없음) |
| `scripts/lib/release-publish-helpers.cjs` | 원본 릴리스 게시 helper 시험 전용 바이트 동일 모듈(제품 게시 흐름에는 연결하지 않음) |
| `build/installer-update-data.ps1` | 원본 설치 데이터 백업·복원 시험 전용 바이트 동일 스크립트(새 패치 방식에는 연결하지 않음) |
| `scripts/lib/ui-check.mjs` | 설치 Chrome 기반 공통 UI 검증 실행기: localhost 검문·서버 건강 상태·브라우저 계측·시나리오 실행·캡처·manifest 생성 |
| `scripts/ui-checks/ready.mjs` | 실제 준비 화면 접속·상태 확인→캡처→재로드→재확인·캡처 시나리오 |
| `scripts/ui-checks/login.mjs` | 실제 Chrome 기반 로그인 흐름 및 L1~L5 검증 시나리오 스크립트 |
| `scripts/ui-checks/shell.mjs` | 실제 Chrome 기반 역할별 셸 메뉴, 사이드바 접힘, 상태줄 검증 시나리오 스크립트 |
| `scripts/ui-checks/access-history.mjs` | 실제 Chrome 기반 활동 이력 화면 G1(목록)·G2(빈 상태) 및 필터·권한 검증 시나리오 스크립트 |
| `scripts/ui-checks/access-history-shared.mjs` | 활동 이력 검증 공통 모듈: 엄격 비교기, 고정 커버리지 계약, 도메인 정본 픽스처 및 Held 생명주기 관리 |
| `scripts/ui-checks/access-history-positive.mjs` | 실제 Chrome 및 runScreenCheck 기반 활동 이력 정상 6개 케이스(목록·빈상태·필터·경합·권한가드 등) 실행 스크립트 |
| `scripts/ui-checks/access-history-negative.mjs` | 실제 Chrome 기반 활동 이력 예상 오류 2개 케이스(조회 실패·세션 만료) 정밀 드라이버 스크립트 |
| `scripts/ui-checks/access-history-lifecycle.mjs` | 음성 검증기의 자원 획득·정리·최초 오류와 현재 부분 증거 저장 |
| `scripts/ui-checks/access-history-sdk-lifecycle.mjs` | 양성 SDK의 선택적 오류·환경 관측, 실제 자원 정리 및 worker 부분 증거 읽기 |
| `scripts/ui-checks/access-history-held.mjs` | 지연 요청의 대기·해제·취소와 상태별 정리 소유권 관리 |
| `scripts/lib/artifact-privacy.mjs` | 검증 자격값의 메모리 등록·IPC 확인, 저장 전 로그/JSON 가림 및 owner 프로세스 로그 수명 관리 |

## 서버 (`src/main`)

| 파일 | 하는 일 |
|---|---|
| `src/main/server.ts` | 서버 진입점. 데이터 폴더를 만들고 127.0.0.1 에만 귀를 연다. 요청마다 기록 한 줄을 남긴다 |
| `src/main/runtime.ts` | 앱 수명주기 및 런타임 백그라운드 서비스 관리 |
| `src/main/http/router.ts` | 어떤 주소를 누가 처리할지 정하는 표(창구 111개는 1-3에서 여기에 등록된다) |
| `src/main/http/guards.ts` | 요청 검문 — 주소(Host) 위조·다른 곳에서 온 요청·JSON이 아닌 형식을 막는다 |
| `src/main/http/security-headers.ts` | 모든 응답에 붙는 보안 헤더(인라인 스크립트·스타일 금지 규칙 포함) |
| `src/main/http/static-files.ts` | 화면 파일 내주기. 폴더 밖으로 나가려는 요청을 파일에 손대기 전에 막는다 |
| `src/main/http/json.ts` | 요청 본문 읽기(1 MB 상한, JSON 배열 강제)와 JSON 응답 보내기, 오류 코드 표 |
| `src/main/http/health.ts` | 화면이 「서버 연결됨」을 확인하는 창구 |
| `src/main/http/api-types.ts` | HTTP 요청 컨텍스트, 라우트 핸들러 및 다이얼로그 브리지 타입 정의 |
| `src/main/http/session.ts` | 단일 세션 수명주기, 무활동 만료, 권한 가드 검사 및 활동 기록 관리 |
| `src/main/http/route-registry.ts` | 메타계약 기반 가드 자동 강제 및 채널 라우트 등록/디스패치 |
| `src/main/http/dialog-bridge.ts` | PowerShell 단일 FIFO 큐 기반 Windows 대화상자 브리지 |
| `src/main/http/routes/core-routes.ts` | Core 그룹 17개 창구 라우트 핸들러 구현 |
| `src/main/http/routes/operations-routes.ts` | Operations 그룹 40개 창구 라우트 핸들러 구현 |
| `src/main/http/routes/workforce-routes.ts` | Workforce 그룹 26개 창구 라우트 핸들러 구현 (monthly-schedules:preparation-context 포함) |
| `src/main/http/routes/performance-routes.ts` | Performance 그룹 16개 창구와 Windows 원본 파일 열기 구현 |
| `src/main/http/routes/allowance-routes.ts` | Allowance 그룹 13개 창구 라우트 핸들러 구현 |
| `src/main/http/routes/index.ts` | 라우트 레지스트리 조립 및 111개 전체 라우트 등록 검증 |
| `src/main/server.test.ts` | 검문 규칙 시험 12건 |
| `src/main/runtime.test.ts` | 런타임 수명주기 시험 |
| `src/main/http/static-files.test.ts` | 경로 탈출·형식 시험 5건 |
| `src/main/http/session.test.ts` | 세션 수명주기 및 권한 가드 시험 |
| `src/main/http/account-lifecycle.integration.test.ts` | 실제 HTTP·SQLite 계정 상태/권한 변경·활성 관리자·JSON 복원 후 세션 검증 |
| `src/main/http/route-registry.test.ts` | 라우트 레지스트리 가드 및 등록 시험 |
| `src/main/http/dialog-bridge.test.ts` | 다이얼로그 브리지 단일 큐 및 실패 격리 시험 |
| `src/main/http/routes/core-routes.test.ts` | Core 라우트 17개 및 비활성 업데이트·내보내기 시험 |
| `src/main/http/routes/operations-routes.test.ts` | Operations 라우트 40개 및 권한·대화상자 시험 |
| `src/main/http/routes/workforce-routes.test.ts` | Workforce 25개 서비스 호출·권한·활동·데이터 폴더 시험 |
| `src/main/http/routes/performance-routes.test.ts` | Performance 16개 승인·복구·원본 파일 열기·실패 시험 |
| `src/main/http/routes/allowance-routes.test.ts` | Allowance 13개 계산·승인·문서 출력·권한·활동 시험 |

## 업무 로직 (1-2에서 원본 0.5.4에서 복사해 왔다 — 고치지 않는다)

| 폴더 | 하는 일 |
|---|---|
| `src/shared/domain` | 계산·판정 규칙 32개(수당 요율·근무표·권한 등). 화면과 서버가 함께 보는 순수 계산 코드다 |
| `src/shared/lib` | 작은 공용 도구 3개(엑셀 열 글자·금액 표기·날짜 계산) |
| `src/shared/config` | 고정 설정 4개(제품 이름·비밀번호 규칙·로그인 유지 규칙·주소 목록). 위 규칙 파일들이 불러 쓴다 |
| `src/shared/bridge` | 창구 111개의 계약표 1개(`src/shared/bridge/contracts.ts`) 및 111 메타 계약(`src/shared/bridge/channel-contracts.ts`) |
| `src/shared/bridge/channel-contracts.test.ts` | 111 메타 계약 불변조건 및 정합성 시험 |
| `src/main/services` | 실제 업무를 처리하는 서비스 72개(엑셀 회수·승인·수당 계산·품의서 출력). 1-3에서 창구가 여기에 연결된다 |
| `src/main/services/*.test.ts` | 원본 서비스 로직 시험 81파일·447개. 제외 서비스 2개의 시험은 이관하지 않는다 |
| `src/shared/domain/*.test.ts` | 원본 순수 계산·판정 시험 26파일·177개 |
| `src/shared/lib/*.test.ts` | 원본 공용 도구 시험 2파일·7개 |
| `src/main/ipc` | 창구가 서비스를 부를 때 쓰는 공통 도움 함수 1개와 원본 시험 1파일·15개 |
| `src/renderer/assets/brand-logo-clean.png` | 문서 출력 로직과 원본 시험이 읽는 로고 원본(옛 화면 코드는 이관하지 않음) |
| `양식샘플` | 원본에서 가져온 엑셀 양식·실제 산출물 견본 9개(근무표 템플릿·샘플, 품의서, 별첨1·2). 출력 모양을 맞출 때 대조용으로 쓴다 |
| `test-fixtures/legacy-resources/release-history` | 원본 릴리스 이력 시험 3개만을 위한 v0.4.5·v0.4.6 manifest 격리본. 빌드·제품 릴리스 이력에는 포함하지 않는다 |

## 화면 (`src/web`)

| 파일 | 하는 일 |
|---|---|
| `src/web/index.html` | 준비 화면(제목·부제·상태 줄). 버튼이나 메뉴는 없다 — 눌러서 일어나는 일이 아직 없기 때문이다 |
| `src/web/app.ts` | 서버가 살아 있는지 물어보고 상태 줄을 바꾼다. 브라우저 브리지(`src/web/bridge/app-bridge.ts`)를 전역 바인딩한다 |
| `src/web/styles.css` | 준비 화면의 최소 스타일(글꼴·색 3개). 디자인 시스템은 Phase 3-1에서 들어온다 |
| `src/web/bridge/app-bridge.ts` | `window.appBridge` 에 111개 메서드를 계약 그대로 합성하여 노출하는 브라우저 브리지 |
| `src/web/bridge/app-bridge.test.ts` | 브라우저 브리지 메서드 합성, 후행 undefined 제거 및 통신 검증 시험 |
| `src/web/login.css` | 로그인 L1~L5 화면 전용 스타일시트 |
| `src/web/shell.css` | 앱 셸, 사이드바, 헤더, 상태줄 레이아웃 스타일시트 |
| `src/web/screens/login.ts` | 로그인 L1~L5 화면 렌더링, 폼 입력, 규칙 검증, 계정복구 처리 |
| `src/web/screens/self-account.ts` | 모든 역할의 내 계정 비밀번호 변경 대화상자, 현재 작업 유지·응답 손실 확인 |
| `src/web/screens/shell.ts` | 역할별 앱 셸, 메뉴 네비게이션, 사이드바 토글, 로그아웃 화면 |
| `src/web/screens/status-bar.ts` | DB·동기화·대기파일·감시·업데이트 실제 API 상태줄 컴포넌트 |
| `src/web/access-history.css` | 활동 이력 화면 전용 스타일시트(필터·테이블·빈 상태) |
| `src/web/screens/access-history.ts` | 관리자 활동 이력 화면 렌더링, 필터링, G1 목록 및 G2 빈 상태 처리 |
| `src/web/screens/access-history-model.ts` | 활동 이력 날짜 범위 검증, 배지 톤 매핑, 쿼리 구성 순수 모델 함수 |
| `src/web/screens/access-history-model.test.ts` | 활동 이력 모델 날짜·윤년·정렬·배지 단위 시험 |
| `src/web/workforce.css` | 인력 관리 화면 전용 스타일시트(테이블·패널·모달) |
| `src/web/screens/workforce.ts` | 인력 관리 화면 본체(목록·상세·모달 조율) |
| `src/web/screens/workforce-model.ts` | 인력 관리 모델(공유 서울 날짜·입사일 정정 검증/오늘 시급·예정/필터/R08 대기 영향/사번 열 미리보기 무효화) |
| `src/main/services/employee-history-service.ts` | 시급·배정 이력. 같은 적용일 시급 정정 전 값을 기존 wage_rate_history에 원자적으로 보관하고 조회에 연결 |
| `src/web/screens/workforce-model.test.ts` | 인력 관리 모델 단위 시험 |
| `src/web/data-table.ts` | 공통 10개 페이지네이션, 전체 정렬/필터, 그룹화 데이터 테이블 컴포넌트 |
| `src/web/data-table.css` | 공통 데이터 테이블 전용 스타일시트 (고정 컬럼, 조밀한 행, 페이지네이션) |
| `src/web/operations.css` | 운영 관리 전용 스타일시트 (7개 탭, 매트릭스 표, 캔버스 뷰포트, 상세 패널) |
| `src/web/screens/operations.ts` | 운영 관리 메인 화면 (7개 탭 조율 및 관리자 권한 가드) |
| `src/web/screens/operations-model.ts` | 운영 관리 순수 비즈니스 검증 모델 (설정, 공휴일, 요율 매트릭스, 토큰 경로) |
| `src/web/screens/operations-model.test.ts` | 운영 관리 순수 모델 단위 검증 시험 |
| `src/web/screens/operations-ui.ts` | 운영 관리 UI 헬퍼 및 WorkforceDialog 기반 대화상자/메시지 모듈 |
| `src/web/screens/operations-settings.ts` | 환경 및 운영 설정 탭 조율 (4개 영역 폼, 변경 상태 계산, 저장/되돌리기/감시) |
| `src/web/screens/operations-settings-view.ts` | 운영 설정 4개 영역 UI 헬퍼 (영역 탭 내비게이션, Dense 패널, 고정 액션 바, 6개 기준 상세 설명, 시스템 서비스 카드, 접근성) |
| `src/web/screens/operations-backup.ts` | DB 백업 및 JSON 마이그레이션 교체 흐름 모듈 |
| `src/web/screens/operations-holidays.ts` | 공휴일 관리 탭 (운영 관리 공통 화면 규격, 등록/외부 연동·비교/교체 안내·조회/CRUD/수명 보호) |
| `src/web/screens/operations-holidays-model.ts` | 공휴일 순수 도메인/비교/필터 모델 (요약 통계, 검색/정렬, API 비교 및 지문 직렬화) |
| `src/web/screens/operations-holidays-model.test.ts` | 공휴일 순수 모델 단위 검증 시험 (불변성, 비교 매칭, 유효성 검증, 대량 스트레스) |
| `src/web/screens/operations-rates.ts` | 수당 요율 버전 관리 탭 (5x3 매트릭스, 영향도 읽기전용 분석, 활성화 확인) |
| `src/web/screens/operations-users.ts` | 운영 사용자 관리 탭 (계정 등록/수정/삭제, 내 복구키 재발급) |
| `src/web/screens/operations-site-names.ts` | 근무지 이름 관리 탭 (55개 목록, 등록/수정/삭제) |
| `src/web/screens/operations-releases.ts` | 시스템 릴리즈 이력 탭 (55개 매니페스트, 필터/정렬/상세 뷰) |
| `src/web/screens/operations-layout.ts` | 문서 양식 및 레이아웃 편집 탭 (7개 키 관리, 초안 저장, 기본값 복원) |
| `src/web/screens/operations-layout-canvas.ts` | 양식 편집 캔버스: 문서 비율 자동 맞춤·보기 확대/축소·블록 선택과 속성 편집 (보기 변경은 초안 불변) |
| `src/web/theme-init.js` | 최초 페인트 전 테마 상태·선호 저장·시스템/다른 창 동기화 |
| `src/web/theme-controls.ts` | 로그인·셸 공통 테마 선택과 구독 정리 |
| `src/web/theme.css` | 전체 업무 화면의 다크 색상·대비·문서 종이 보존 |
| `scripts/ui-checks/theme.mjs` | 격리 실제 브라우저 테마 T01~T12·저장/초안/차트 출력 보존 검문 |
| `src/web/screens/operations-layout-preview.ts` | 양식 실제 생성물(PDF/XLSX) 바이너리 Blob 미리보기 모듈 |
| `scripts/ui-checks/operations-fixtures.mjs` | 운영 관리 UI 검증용 TEMP 격리 55개 픽스처 생성기 |
| `scripts/ui-checks/operations.mjs` | 운영 관리 화면 UI 시나리오(S01~S20) 및 음성 검문(N01~N12) 자동화 러너 |
| `src/web/sites.css` | 근무지 관리 전용 scoped dense 스타일시트 (목록·상세·마법사·조직구성·시뮬레이션) |
| `src/web/pagination.ts` | 모든 목록 메뉴의 공통 번호형 페이지 이동·주변 번호/생략·처음/이전/다음/마지막 제어 |
| `src/web/pagination.test.ts` | 공통 페이지 번호 범위·경계·대량 번호·축소·빈 결과 회귀 시험 |
| `src/web/screens/sites.ts` | 근무지 관리 메인 화면 (목록/마법사 화면 조율, 조회/세션/권한 수명주기) |
| `src/web/screens/sites-model.ts` | 근무지 목록·정렬·그룹·페이징·KPI·신원매핑 및 조 정원 검증 순수 모델 |
| `src/web/screens/sites-model.test.ts` | 근무지 모델 단위 시험 (페이징·KPI·정원검사·템플릿·비파괴토글·실행취소) |
| `src/web/screens/sites-pattern-model.ts` | 패턴·팔레트·비파괴 전이·DTO 직렬화 및 Undo/Redo 순수 모델 |
| `src/web/screens/sites-list.ts` | 근무지 목록 화면 (고정 열, 고객사 그룹핑, 검색·필터, 페이징, KPI) |
| `src/web/screens/sites-detail.ts` | 근무지 우측 상세 패널 (버전 이력 페이징, 조별 명단 요약, 수정·삭제·비활성화) |
| `src/web/screens/sites-wizard.ts` | 근무지 등록/수정 2단계 마법사 조율 컨테이너 (초안·스텝퍼·이탈경고) |
| `src/web/screens/sites-wizard-basics.ts` | 마법사 1-A 기본 설정 및 빠른 시작 (템플릿·설정 복사) |
| `src/web/screens/sites-wizard-palette.ts` | 마법사 1-B 근무/휴무 유형 및 근무·휴게시간 팔레트 |
| `src/web/screens/sites-wizard-pattern.ts` | 마법사 1-B 교대 패턴 스트립 페인팅, 개별/공휴일 토글 및 3개월 달력 연결 |
| `src/web/screens/sites-wizard-review.ts` | 마법사 1-C 입력 유효성 종합 검토, 오류 위치 바로가기 및 요약표 |
| `src/web/screens/sites-organization.ts` | 마법사 2단계 조직 구성 (대기 인력 풀, 조별 보드, 정원 검사, 드래그앤드롭) |
| `src/web/screens/sites-import.ts` | 엑셀 패턴 역추출 모달 (관리자 전용 대화상자, 패턴 분석 및 초안 반영) |
| `src/web/screens/sites-simulation.ts` | 기존 도메인 생성기 기반 3개월 시뮬레이션 어댑터 및 조별 가상 대표 생성기 |
| `src/web/screens/sites-simulation.test.ts` | 시뮬레이션 어댑터와 실제 도메인 월간 근무표 생성 결과 패리티 시험 |
| `src/web/screens/sites-commit.ts` | 근무지·패턴·배정 순차 저장 실행기 (부분 실패 보존 및 재개) |
| `scripts/ui-checks/sites-fixtures.mjs` | 근무지 관리 UI 검증용 TEMP 격리 55곳/55명/55버전 픽스처 생성기 |
| `scripts/ui-checks/sites.mjs` | 근무지 관리 화면 UI 시나리오(S01~S20) 및 음성 검문(N01~N12) 자동화 러너 |
| `src/web/schedule.css` | 근무표 생성·조회 화면 Scoped 스타일시트 |
| `src/web/screens/schedule.ts` | 근무표 관리 메인 화면 (캘린더/이력 탭 조율, 조회/세션/세대/수명주기) |
| `src/web/screens/schedule-model.ts` | 근무표 로스터·기간별 배정 어댑터·규칙경고 통계·이력 필터링 순수 모델 |
| `src/web/screens/schedule-model.test.ts` | 근무표 모델 단위 시험 (윤년·주차분할·중복배정차단·순서정렬·이력필터) |
| `src/web/screens/schedule-view.ts` | 근무표 화면 KPI 스트립, 툴바, 탭/검색/상태 표시 컴포넌트 |
| `src/web/screens/schedule-calendar.ts` | 근무표 날짜×인력 캘린더 표, 우측 상세 카드(주차 요약 및 4종 규칙 경고) |
| `src/web/screens/schedule-history.ts` | 근무표 생성·게시 이력 표, 검색/페이지네이션 및 우측 상세 카드 |
| `src/web/screens/schedule-actions.ts` | 근무표 신규 저장, 엑셀 파일 생성, 배포 폴더 게시 비동기 액션 조율기 |
| `scripts/ui-checks/schedule-fixtures.mjs` | 근무표 관리 UI 검증용 TEMP 격리 55+직원/55+이력/5+게시 픽스처 생성기 |
| `scripts/ui-checks/schedule.mjs` | 근무표 관리 화면 UI 시나리오(S01~S16) 및 음성 검문(N01~N12) 자동화 러너 |
| `src/web/performance.css` | 실적 가져오기·검토·승인 화면 Scoped 스타일시트 |
| `src/web/screens/performance.ts` | 실적 관리 메인 화면 (조회/필터/세대/수명주기/액션 조율) |
| `src/web/screens/performance-model.ts` | 실적 필터·전역정렬·8상태배지·KPI통계·그룹화 순수 모델 |
| `src/web/screens/performance-model.test.ts` | 실적 모델 단위 시험 (8배지병기·정렬·필터·KPI·그룹화·0원구분) |
| `src/web/screens/performance-view.ts` | 실적 화면 전체폭 KPI, 툴바, 탭/검색/밀도 및 상태 박스 컴포넌트 |
| `src/web/screens/performance-table.ts` | 실적 근무지 그룹 표, 가용높이 측정 및 공통 페이지네이션 연동 |
| `src/web/screens/performance-detail.ts` | 실적 380px 우측 상세 패널 (시간/시급/저장수당/증적 및 액션 버튼) |
| `src/web/screens/performance-comparison.ts` | 실적 현재 행 vs 기승인본 vs 계산결과 차이 비교 모달 |
| `src/main/services/workforce-wage-performance-service.ts` | 단건·일괄 시급 저장 후 대상 대기 파일 재읽기, 시급/파일 검문·실패 캐시 보존·실제 결과 요약 |
| `src/main/services/workforce-wage-performance-service.test.ts` | 실제 XLSX 재읽기·금융 보존·기간/중복·실패 롤백·동시 승인/원본변경 시험 |
| `src/main/services/performance-approval-resolution-service.ts` | 원본 실적 동등성·재승인 판정(후속 시급 변경 제외, 승인 스냅샷 보존) |
| `src/main/services/performance-return-history-service.ts` | 승인대기 복귀 전 원문·계산·판정·검토 스냅샷의 원자 보관, 무결성 검증과 읽기 전용 이력 조회 |
| `src/main/services/performance-return-history-service.test.ts` | 실제 엑셀 승인·취소·재승인, 보관 실패 롤백·권한·중복·JSON 보존 회귀 |
| `src/main/services/performance-approval-flow-service.ts` | 실적 승인·재승인·명시 시급 정정·대기복귀 근무일 시급 적용 및 중복/잠금 차단 |
| `src/main/services/performance-file-archive-service.ts` | 승인 원본 보관·명시적 대기 복귀·실패 시 원본 위치 배타적 복원 |
| `src/main/services/performance-management-service.ts` | 실적 목록·재승인 요약·기승인 시급 표시와 현재/승인 비교 조회 |
| `src/web/screens/performance-history.ts` | 실적 승인 및 반려 이력 표/모달 |
| `src/web/screens/performance-actions.ts` | 실적 승인/확정/되돌리기/숨김/원본 액션 조율기. 오류 수정은 원본 엑셀 수정·다시 읽기 안내 |
| `src/web/screens/performance-intake.ts` | 실적 폴더 감시 상태, 대기 엑셀 목록, 시작 복구 상태 모달 |
| `scripts/ui-checks/performance-fixtures.mjs` | 실적 관리 UI 검증용 TEMP 격리 50+실적/상태별 픽스처 생성기 |
| `scripts/ui-checks/performance.mjs` | 실적 관리 화면 UI 시나리오(S01~S20) 및 음성 검문(N01~N12) 자동화 러너 |
| `src/web/allowance.css` | 수당 관리 화면 Scoped 스타일시트 |
| `src/web/screens/allowance.ts` | 수당 관리 메인 화면 (조회/필터/세대/수명주기/액션 조율) |
| `src/web/screens/allowance-model.ts` | 수당 필터·정렬·상태배지·KPI통계·그룹화·지문생성 순수 모델 |
| `src/web/screens/allowance-model.test.ts` | 수당 모델 단위 시험 (배지·정렬·필터·KPI·그룹화·지문불변성) |
| `src/web/screens/allowance-view.ts` | 수당 화면 KPI 바, 툴바, 탭/검색/밀도 컴포넌트 |
| `src/web/screens/allowance-table.ts` | 수당 근무지 그룹 표, 가용높이 측정 및 공통 페이지네이션 연동 |
| `src/web/screens/allowance-detail.ts` | 수당 380px 우측 상세 패널 (근로시간/항목별수당/지급일/액션버튼) |
| `src/web/screens/allowance-actions.ts` | 수당 승인/반려/조기지급일/문서출력 공용 모달 액션 조율기 |
| `src/web/screens/allowance-proposal.ts` | 수당 품의 미리보기/확인/승인 및 지문검증 모달 |
| `src/web/screens/allowance-history.ts` | 수당 계산/검토/품의/출력 이력 표 및 경로 복사 컴포넌트 |
| `scripts/ui-checks/allowance-fixtures.mjs` | 수당 관리 UI 검증용 TEMP 격리 55+계산/상태별 픽스처 생성기 |
| `scripts/ui-checks/allowance.mjs` | 수당 관리 화면 UI 시나리오(S01~S20) 및 음성 검문(N01~N12) 자동화 러너 |

## 만들어지는 폴더(저장소에는 담지 않는다)

- dist/server, dist/browser — 빌드 결과. 서버는 dist/browser 아래 화면 파일을 내준다.
- artifacts/captures — 화면 캡처 PNG 출력 자리(`npm run capture` 가 필요할 때 만든다).
- 데이터 폴더(기본값은 사용자 폴더 아래 ShiftMgmt_V4) — 설정·DB가 쌓이는 곳. 저장소 안이 아니다.

### U1-E canonical live evidence

- `scripts/ui-checks/access-history-live-observer.mjs`: canonical live-admin observation and SDK bootstrap/cleanup adapters.
- `scripts/ui-checks/access-history-live-evidence.mjs`: typed evidence, original LIVE-01..08 evaluation, publication and independent reading.
- Owner selection: exact `--case=live-admin --evidence=canonical-live-v1`; default single-case invocation preserves legacy evidence.

- `scripts/ui-checks/access-history-evidence-dispatch.mjs`: canonical case dispatch.
- `scripts/ui-checks/access-history-list-evidence.mjs`: original LIST14 evidence.
- `scripts/ui-checks/access-history-list-observer.mjs`: list fixture observation.

- `scripts/ui-checks/access-history-empty-evidence.mjs` — EMPTY8 strict RAW/typed/SDK/PNG verification and owned atomic publication.
- `scripts/ui-checks/access-history-empty-observer.mjs` — Actual EMPTY8 browser facts, request identity and checked lifecycle cleanup.
- `scripts/ui-checks/access-history-filters-semantic.mjs` — FILTER15 pure wire parser and evaluation semantics.
- `scripts/ui-checks/access-history-filters-scenario.mjs` — Actual FILTER15 user input scenario and observation collection without route mocking.
- `scripts/ui-checks/access-history-filters-evidence.mjs` — FILTER15 canonical evidence publication, reading, and gate result validation.
- `scripts/ui-checks/access-history-filters-observer.mjs` — FILTER15 Playwright browser observation runner and lifecycle adapter.
- scripts/ui-checks/access-history-errors-semantic.mjs — ERROR01..08 pure wire parser and evaluation semantics.
- scripts/ui-checks/access-history-errors-scenario.mjs — Actual ERROR01..08 user interaction scenario and observation collection without fake routes.
- scripts/ui-checks/access-history-errors-evidence.mjs — ERROR01..08 canonical evidence publication, reading, and gate result validation.
- scripts/ui-checks/access-history-errors-observer.mjs — ERROR01..08 Playwright browser observation runner and lifecycle adapter.

- U6 stale-response: access-history-stale-{semantic,observer,scenario,callback,evidence}.mjs; positive worker controller, original STALE-01..12, canonical-stale-v1.

- `src/web/common-controls.ts` / `src/web/common-controls.css`: shared select popovers and bounded date calendar for all menus and dialogs; initialized by app.ts.

### UI03 GUI pattern and PC preset library

- `src/shared/bridge/pattern-presets.ts` — preset contracts and bounded validation.
- `src/main/services/pattern-preset-storage-service.ts` — PC SQLite setting entry, revisions and transactions.
- `src/main/services/pattern-preset-storage-service.test.ts` — persistence, conflicts and damaged JSON protection.
- `src/web/screens/sites-team-pattern.ts` — non-mutating legacy projection, equal-length GUI rows and draft serialization.
- `src/web/screens/sites-team-pattern.test.ts` — generation parity, inactive data and eight-team limits.
- `src/web/screens/sites-pattern-library.ts` — named preset save/load/delete dialogs.
- `src/shared/domain/holiday-pattern.ts` — optional calendar-date holiday rules, category priority and catalog codes.
- `src/shared/domain/holiday-pattern.test.ts` — date phase, holiday applicability and strict policy validation.
- `src/web/screens/sites-holiday-policy.ts` — per-category holiday times and GUI team cycles with cancel-safe editing.

- `src/web/screens/development-login.ts` — explicit local development preview test-account autofill banner; remove at development completion.

- `src/web/screens/sites-pattern-dialog.ts` — detached per-team long-cycle editor, range/repeat/copy, undo and atomic draft apply.

| `src/shared/domain/wage-rate.ts` | 근무일 시급 타임라인 조회·무효 기간 차단 공통 판정 |
| `src/web/screens/workforce-wage-revision.ts` | 행별 시급 금액 정정·무효 확인·처리 결과 모달 |

| `src/main/services/employee-retirement-service.ts` | 퇴사 시급·배정 종료·자동 종료 원본/적용 상태 보존·퇴사일 정정 |
| `src/web/screens/workforce-retirement.ts` | 퇴사 첫 제외일 안내·실제 종료/예정 제외/대기 반영 결과 |
| `src/main/services/employee-hire-date-review.ts` | JSON 원본 입사일·빈 값·달력 형식 검토, 실제 입사일 추정 금지 |
| `src/main/services/employee-hire-date-review.test.ts` | 이관 날짜 원본 보존·누락/형식/시계 독립성 검문 |
| `src/web/screens/employee-hire-date-review.ts` | 복원 전후 입사일 건수·전체 검색/필터·기본정보 정정 안내 |
| `src/shared/domain/employee-employment.ts` | 재직기간·예약 취소·날짜별 근무 대상 공통 판정 |
| `src/shared/domain/employee-employment.test.ts` | 재직기간 경계·취소·과거 미래 시급 배제 회귀 |
| `src/main/services/employee-employment-service.ts` | 기간별 조회·예약 상태·보관 승인/계산 증빙 검문 |
| `src/main/services/employee-rehire-service.ts` | 같은 사번 재입사·미래 예약 변경/취소 원자 저장 |
| `src/main/services/employee-rehire-service.test.ts` | 재입사·예약·SQL 실패 롤백·보관 금액 보호 회귀 |
| `src/web/screens/workforce-rehire.ts` | 재입사 입력·확인·저장·예약 변경/취소 흐름 |
| `src/web/screens/workforce-rehire-view.ts` | 재직기간 안내·변경/보존 요약·실제 결과 표시 |

### POLICY-HISTORY-01 기간별 정책 버전 및 적용 이력 관리

| `src/shared/domain/policy-history.ts` | 정책 리비전·이벤트 도메인 모델, 지문 계산, 근무일 타임라인 투영 및 검증 |
| `src/shared/domain/policy-history.test.ts` | 정책 도메인 모델 무결성, 날짜 순서, 불변성 보존 검증 |
| `src/main/services/policy-history-service.ts` | SQLite 영속 저장소 연동 정책 부트스트랩, 리비전/이벤트 조회, 등록, 정정, 취소, 사용 기록 |
| `src/main/services/policy-history-service.test.ts` | 정책 서비스 생명주기, 변경 잠금, used 보호 단위 검증 |
| `src/main/services/policy-history-impact-service.ts` | 정책 변경 5분 토큰 영향 미리보기(대기 파일/행 집계) 및 원자적 확정 반영 |
| `src/main/services/policy-history-impact-service.test.ts` | 영향 미리보기 토큰 발급, 만료, 불변성, 확정 반영 단위 검증 |
| `src/main/services/policy-history-integration.test.ts` | 부트스트랩→실적파싱→미리보기→확정→승인연동 E2E 통합 검증 |
| `src/web/screens/operations-policy-history.ts` | 운영 관리 Dense 정책 버전 및 이벤트 이력 모달과 페이지네이션 |
| `src/web/screens/operations-policy-dialog.ts` | 정책 등록·정정·취소 및 실시간 영향 미리보기/확정 다이얼로그 |
| `src/web/policy-history.css` | 정책 요약 카드, Dense 이력 테이블, 영향 미리보기 반응형 스타일 |
