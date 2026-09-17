# 코드 지도 (무슨 파일이 무슨 일을 하는가)

> 파일을 옮기거나 지우면 `npm run validate:map` 이 이 문서를 먼저 잡는다(없는 경로를 가리키면 실패).
> 업무 로직(src/shared, src/main/services, src/main/ipc)은 1-2에서 원본 0.5.4에서 **복사해 들어왔다** — 아래 「업무 로직」 절. 그 파일들은 고치지 않는다.

## 뿌리

| 파일 | 하는 일 |
|---|---|
| `package.json` | 실행·빌드·검사 명령(스크립트)과 도구 목록. 실행 의존성은 3개뿐이다 — 엑셀 읽기·쓰기, 폴더 감시, 그리고 PDF 자리 패키지(`vendor/electron-compat`) |
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
| `docs/codebase-map.md` | 이 문서 |
| `docs/api-convention.md` | 화면과 서버가 주고받는 규약(창구 111개 계약표 사본 포함) — 1-3 구현의 기준 |

## 스크립트

| 파일 | 하는 일 |
|---|---|
| `scripts/dev.mjs` | 개발 실행 조정기: 빌드 → 서버 시작 → 서버 응답 확인 → 설치된 크롬으로 화면 열기. 크롬 창을 닫아도 서버는 남는다 |
| `scripts/lib/find-chrome.mjs` | 이 PC에 설치된 크롬을 찾는다(내려받지 않는다). 개발 실행·캡처가 함께 쓴다 |
| `scripts/copy-web-assets.mjs` | 화면 파일과 글꼴을 빌드 폴더로 복사한다(Pretendard는 woff2만, 폴더 구조 그대로) |
| `scripts/capture-screen.mjs` | 실제 크롬으로 화면을 열어 PNG로 찍는다. 콘솔 오류나 400 이상 응답이 있으면 실패로 끝난다 |
| `scripts/validate-codebase-map.mjs` | 이 지도가 가리키는 파일이 실제로 있는지 확인한다(원본 0.5.4 복사본, 수정 없음) |
| `scripts/release-check.mjs` | 내보내기 전 점검: 판 번호 일치·작업 트리 깨끗·같은 판 태그 없음·검사 3종 통과·빌드 산출물 확인 |
| `scripts/smoke-require.mjs` | 빌드 결과의 서비스가 정확히 72개이고 전부 불러와지는지 확인한다(`npm run smoke`) |
| `scripts/windows-dialog.ps1` | Windows Forms 기반 파일·폴더 선택 및 경로 열기 PowerShell 스크립트 (UTF-8 JSON stdin/stdout) |
| `scripts/issue-account-recovery-key.mjs` | 원본 계정 복구 유지보수 시험이 실행하는 바이트 동일 스크립트(제품 자동 실행 없음) |
| `scripts/lib/release-publish-helpers.cjs` | 원본 릴리스 게시 helper 시험 전용 바이트 동일 모듈(제품 게시 흐름에는 연결하지 않음) |
| `build/installer-update-data.ps1` | 원본 설치 데이터 백업·복원 시험 전용 바이트 동일 스크립트(새 패치 방식에는 연결하지 않음) |

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
| `src/main/http/routes/workforce-routes.ts` | Workforce 그룹 25개 창구 라우트 핸들러 구현 |
| `src/main/http/routes/performance-routes.ts` | Performance 그룹 16개 창구와 Windows 원본 파일 열기 구현 |
| `src/main/http/routes/allowance-routes.ts` | Allowance 그룹 13개 창구 라우트 핸들러 구현 |
| `src/main/http/routes/index.ts` | 라우트 레지스트리 조립 및 111개 전체 라우트 등록 검증 |
| `src/main/server.test.ts` | 검문 규칙 시험 12건 |
| `src/main/runtime.test.ts` | 런타임 수명주기 시험 |
| `src/main/http/static-files.test.ts` | 경로 탈출·형식 시험 5건 |
| `src/main/http/session.test.ts` | 세션 수명주기 및 권한 가드 시험 |
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
| `vendor/electron-compat` | PDF 자리 패키지 3개 — 복사본이 부르는 `electron` 이름만 풀어 준다. Phase 2.5-5 에서 실제 방식으로 대체된다 |
| `test-fixtures/legacy-resources/release-history` | 원본 릴리스 이력 시험 3개만을 위한 v0.4.5·v0.4.6 manifest 격리본. 빌드·제품 릴리스 이력에는 포함하지 않는다 |

## 화면 (`src/web`)

| 파일 | 하는 일 |
|---|---|
| `src/web/index.html` | 준비 화면(제목·부제·상태 줄). 버튼이나 메뉴는 없다 — 눌러서 일어나는 일이 아직 없기 때문이다 |
| `src/web/app.ts` | 서버가 살아 있는지 물어보고 상태 줄을 바꾼다. 브라우저 브리지(`src/web/bridge/app-bridge.ts`)를 전역 바인딩한다 |
| `src/web/styles.css` | 준비 화면의 최소 스타일(글꼴·색 3개). 디자인 시스템은 Phase 3-1에서 들어온다 |
| `src/web/bridge/app-bridge.ts` | `window.appBridge` 에 111개 메서드를 계약 그대로 합성하여 노출하는 브라우저 브리지 |
| `src/web/bridge/app-bridge.test.ts` | 브라우저 브리지 메서드 합성, 후행 undefined 제거 및 통신 검증 시험 |

## 만들어지는 폴더(저장소에는 담지 않는다)

- dist/server, dist/browser — 빌드 결과. 서버는 dist/browser 아래 화면 파일을 내준다.
- artifacts/captures — 화면 캡처 PNG 출력 자리(`npm run capture` 가 필요할 때 만든다).
- 데이터 폴더(기본값은 사용자 폴더 아래 ShiftMgmt_V4) — 설정·DB가 쌓이는 곳. 저장소 안이 아니다.
