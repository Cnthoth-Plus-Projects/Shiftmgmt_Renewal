# 코드 지도 (무슨 파일이 무슨 일을 하는가)

> 파일을 옮기거나 지우면 `npm run validate:map` 이 이 문서를 먼저 잡는다(없는 경로를 가리키면 실패).
> 1-1 시점의 저장소에는 아래 파일이 전부다. 업무 로직(src/shared, src/main/services)은 1-2에서 원본 0.5.4에서 복사해 들어온다.

## 뿌리

| 파일 | 하는 일 |
|---|---|
| `package.json` | 실행·빌드·검사 명령(스크립트)과 개발 도구 목록. 실행 의존성은 없다(프로그램은 Node만으로 돈다) |
| `package-lock.json` | 개발 도구의 정확한 판 번호 고정(`npm ci` 가 이 파일을 본다) |
| `./VERSION` | 이 프로그램의 판 번호 한 줄. 「적용」 스크립트와 `npm run release:check` 가 이 값을 본다 |
| `./.gitignore` | 저장소에 담지 않을 것(설치 폴더·빌드 결과·데이터·캡처) |
| `README.md` | 처음 여는 사람이 3줄로 실행하는 법 |
| `tsconfig.server.json` | 서버 쪽 컴파일 조건(원본 0.5.4의 electron 설정과 같은 조건 — 1-2에서 서비스를 그대로 복사하기 위해) |
| `tsconfig.browser.json` | 화면 쪽 **타입 검사 전용** 설정(파일을 만들지 않는다. 실제 묶기는 esbuild가 한다) |
| `eslint.config.mjs` | 코드 규칙 검사 설정(원본 0.5.4 복사본 — 검사 대상 범위만 바꿨다) |
| `vitest.config.ts` | 테스트 실행 설정(1-1은 서버 테스트뿐이라 node 환경) |

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

## 서버 (`src/main`)

| 파일 | 하는 일 |
|---|---|
| `src/main/server.ts` | 서버 진입점. 데이터 폴더를 만들고 127.0.0.1 에만 귀를 연다. 요청마다 기록 한 줄을 남긴다 |
| `src/main/http/router.ts` | 어떤 주소를 누가 처리할지 정하는 표(창구 111개는 1-3에서 여기에 등록된다) |
| `src/main/http/guards.ts` | 요청 검문 — 주소(Host) 위조·다른 곳에서 온 요청·JSON이 아닌 형식을 막는다 |
| `src/main/http/security-headers.ts` | 모든 응답에 붙는 보안 헤더(인라인 스크립트·스타일 금지 규칙 포함) |
| `src/main/http/static-files.ts` | 화면 파일 내주기. 폴더 밖으로 나가려는 요청을 파일에 손대기 전에 막는다 |
| `src/main/http/json.ts` | 요청 본문 읽기(1 MB 상한)와 JSON 응답 보내기, 오류 코드 표 |
| `src/main/http/health.ts` | 화면이 「서버 연결됨」을 확인하는 창구 |
| `src/main/server.test.ts` | 검문 규칙 시험 8건 |
| `src/main/http/static-files.test.ts` | 경로 탈출·형식 시험 5건 |

## 화면 (`src/web`)

| 파일 | 하는 일 |
|---|---|
| `src/web/index.html` | 준비 화면(제목·부제·상태 줄). 버튼이나 메뉴는 없다 — 눌러서 일어나는 일이 아직 없기 때문이다 |
| `src/web/app.ts` | 서버가 살아 있는지 물어보고 상태 줄을 바꾼다. 실패하면 2초 간격으로 열 번까지 다시 물어본다 |
| `src/web/styles.css` | 준비 화면의 최소 스타일(글꼴·색 3개). 디자인 시스템은 Phase 3-1에서 들어온다 |

## 만들어지는 폴더(저장소에는 담지 않는다)

- dist/server, dist/browser — 빌드 결과. 서버는 dist/browser 아래 화면 파일을 내준다.
- artifacts/captures — 화면 캡처 PNG 출력 자리(`npm run capture` 가 필요할 때 만든다).
- 데이터 폴더(기본값은 사용자 폴더 아래 ShiftMgmt_V4) — 설정·DB가 쌓이는 곳. 저장소 안이 아니다.
