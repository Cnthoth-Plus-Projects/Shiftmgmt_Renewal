# HANDOFF — Phase 3-0 실제 화면 캡처·클릭 검증 기반 구현

- Task: 3-0 — 실제 V4 화면을 반복 검증할 공통 실행기와 현재 준비 화면의 실행 가능한 첫 시나리오
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — 범위·전략·검증 설계
- To: Gemini — 외부 구현 코더(사용자 수동 중계)
- Time: 2026-09-28 13:14 KST
- 회신: 필요 — 이 파일 맨 아래 `## 회신`에 작성
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283`
- Expected initial status: §3.1의 정확한 70경로, UTF-8/LF 결합 SHA-256 `B5839888300943B976D4F0C1092D4D3753FED3FA75863D5838945860B4956C9A`
- Final commit: 만들지 않는다. Sol 검증 뒤 커밋 여부를 결정한다.

---

# 회신 요청

**누가:** Gemini. **어디에:** 이 파일의 보이는 `## 회신` 칸. **언제:** 착수 게이트가 다르면 수정 없이 `BLOCKED`; 구현·검증 후 `IMPLEMENTED` 또는 `FAILED`. 회신이 없으면 Sol의 독립 검증과 다음 단계가 중단된다.

## 1. 목표와 단계 경계

V4의 **실제 Chrome 화면**을 동일한 방식으로 열어 상태를 확인하고, 조작하고, PNG·결과 기록을 남길 수 있는 재사용 실행기와 현재 존재하는 준비 화면의 첫 실행 시나리오를 만든다. `TODO.md:256`의 “화면마다 1개”는 화면이 생길 때 3-1~3-9 각 Task에서 해당 화면별 스크립트 하나씩 이어 만드는 규칙으로 적용한다. 현재 없는 로그인·업무 화면의 빈 시나리오나 가짜 클릭을 만들지 않는다. 이 제출로 확인할 수 있는 범위는 **공통 기반 + 준비 화면의 실제 캡처·재로드**이며, 업무 화면 클릭 검증은 아직 `UNVERIFIED`다.

### 비목표

- 로그인·앱 껍데기 등 Phase 3 제품 화면 구현, 미저장 이탈 확인 구현, 시안 HTML 수정.
- V3.4 Electron 실행기를 V4에 이식하거나 실제 운영 DB·계정·엑셀 파일을 사용한 시험.
- 승인된 34개 시안의 정적 HTML을 실제 앱 검증의 대용으로 삼거나 자동 픽셀 일치라고 주장하기.
- 새 의존성·package script 추가, API/DB/계산/권한 규칙 변경, UI 요소 주입.

## 2. 근거와 정본

- 현재 V4 `src/web/index.html`·`src/web/app.ts`에는 `h1`, `#health[role=status]`를 가진 준비 화면만 있다. `/api/health` 성공 뒤 상태가 `서버 연결됨`으로 바뀐다. 업무 버튼이 없어 현재 클릭 시나리오는 만들 수 없다.
- `scripts/capture-screen.mjs`는 설치 Chrome 탐색, 건강 상태·글꼴 대기, PNG, 콘솔/HTTP 오류 감지를 이미 한다. **기존 CLI는 변경하지 않는다.** `scripts/lib/find-chrome.mjs`의 `findChrome()`을 새 실행기에서 재사용한다.
- V3.4 `C:\Projects\Active\ShiftMgmt_V3.4\artifacts\scripts\capture-wizard-screens.cjs`는 단계별 클릭→상태 확인→캡처의 참고 패턴이다. Electron 실행·고정 계정·실제 DB 접근·오류 삼키기는 가져오지 않는다. V3.4 전체는 읽기 전용이다.
- `05-screen-spec.md` 공통 규칙은 실제 화면의 로딩/빈/오류/권한 없음/처리 중 상태와 모달 행동을 요구한다. 승인 시안은 `시안/2026-09-02-2차검토/스냅샷19차/`의 1차 10파일+2차 24파일이며, 실제 화면 구현 때 상태별 대조 기준으로 사용한다. 디자인 기준은 `시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md`다.
- `CLAUDE.md`와 `07-invariants-and-pitfalls.md`의 UI 완료 기준은 타입·규칙·테스트 뒤 **실제 앱 캡처와 주요 동작 클릭 검증**이다. 실적 직접 입력·가짜 UI·`window.confirm/alert`는 금지한다.
- 직전 0-15 결과는 `Phase0/0-15-창닫기-앱종료-이탈확인-검증-v1.0.md`: Chrome 닫기 경고는 조건부 가능하나 현재 미구현이다. 이 3-0 스크립트가 그 기능을 구현하거나 통과했다고 쓰지 않는다.

## 3. 착수 기준과 변경 경계

### 3.1 예상 초기 작업 트리

아래는 `git status --short --untracked-files=all`의 **정확한 순서와 내용**이다. 각 줄을 LF로 결합하고 끝에 LF를 붙이지 않은 UTF-8 문자열의 SHA-256이 머리말 값이다. 기존 70경로는 이 Task의 작업물이 아니므로 되돌리거나 재생성하지 않는다.

```text
 M docs/codebase-map.md
 M package-lock.json
 M package.json
 M scripts/smoke-require.mjs
 M scripts/verify-v3-json-migration.mjs
 M src/main/http/routes/core-routes.test.ts
 M src/main/http/routes/core-routes.ts
 M src/main/http/routes/operations-routes.test.ts
 M src/main/http/routes/operations-routes.ts
 M src/main/server.test.ts
 M src/main/server.ts
 M src/main/services/allowance-document-export-service.test.ts
 M src/main/services/allowance-document-export-service.ts
 M src/main/services/allowance-document-pdf-service.test.ts
 M src/main/services/allowance-document-pdf-service.ts
 M src/main/services/database-backup-service.test.ts
 M src/main/services/database-backup-service.ts
 M src/main/services/database-file-policy-service.test.ts
 M src/main/services/database-file-policy-service.ts
 M src/main/services/database-migration-service.test.ts
 M src/main/services/database-migration-service.ts
D  src/main/services/database-powershell-diagnostic-service.test.ts
D  src/main/services/database-powershell-diagnostic-service.ts
 M src/main/services/document-brand-logo-service.ts
 M src/main/services/operations-storage-service.ts
 M src/main/services/performance-file-intake-service.test.ts
 M src/main/services/schedule-plan-adapter.test.ts
 M src/main/services/schedule-plan-adapter.ts
 M src/main/services/schedule-plan-export-service.test.ts
 M src/main/services/schedule-plan-export-service.ts
 M src/main/services/schedule-plan-template-service.ts
 M src/main/services/schedule-return-performance-parser.test.ts
 M src/main/services/schedule-return-performance-parser.ts
 M src/shared/bridge/channel-contracts.test.ts
 M src/shared/bridge/channel-contracts.ts
 M src/shared/bridge/contracts.ts
 M src/shared/domain/access-log.ts
 M src/shared/domain/allowance-workflow.ts
 M src/shared/domain/database-migration.test.ts
 M src/shared/domain/database-migration.ts
 M src/web/bridge/app-bridge.test.ts
 D vendor/electron-compat/index.d.ts
 D vendor/electron-compat/index.js
 D vendor/electron-compat/package.json
?? scripts/clean-server-build.mjs
?? scripts/generate-built-in-excel-layouts.mjs
?? src/main/services/built-in-excel-layout-service.test.ts
?? src/main/services/built-in-excel-layout-service.ts
?? src/main/services/dashboard-chart-export-service.test.ts
?? src/main/services/dashboard-chart-export-service.ts
?? src/main/services/document-brand-logo-service.test.ts
?? src/main/services/document-layout-definition-service.test.ts
?? src/main/services/document-layout-definition-service.ts
?? src/main/services/document-layout-excel-render-service.test.ts
?? src/main/services/document-layout-excel-render-service.ts
?? src/main/services/document-layout-preview-artifact-service.test.ts
?? src/main/services/document-layout-preview-artifact-service.ts
?? src/main/services/document-layout-preview-service.test.ts
?? src/main/services/document-layout-preview-service.ts
?? src/main/services/document-layout-storage-service.test.ts
?? src/main/services/document-layout-storage-service.ts
?? src/main/services/document-layouts/attachment1.json
?? src/main/services/document-layouts/attachment2.json
?? src/main/services/document-layouts/proposal.json
?? src/main/services/document-layouts/schedule-template1.json
?? src/main/services/document-layouts/schedule-template2.json
?? src/main/services/installed-chrome-pdf-service.test.ts
?? src/main/services/installed-chrome-pdf-service.ts
?? src/shared/domain/document-layout.ts
?? src/test-utils/document-layout-semantic-snapshot.ts
```

착수 전에 저장소·브랜치·HEAD·70줄·상태 해시를 다시 확인한다. 어느 하나라도 다르거나 아래 허용 파일이 이미 있으면 제품 파일을 수정하지 말고 `BLOCKED`로 회신한다. `npm run validate:map`의 현재 기준은 RC 0, `CODEBASE_MAP_OK — 경로 73개 모두 존재합니다.`다.

### 3.2 수정/생성 허용 파일 — 닫힌 목록

| 경로 | 요구사항 | 허용 변경 |
|---|---|---|
| `scripts/lib/ui-check.mjs` (신규) | R30-1·R30-3 | 설치 Chrome 기반 공통 실행기: localhost 검문·서버 건강 상태·브라우저 계측·시나리오 실행·캡처·manifest·실패 판정 |
| `scripts/ui-checks/ready.mjs` (신규) | R30-2 | 현재 실제 준비 화면의 상태 확인→캡처→재로드→재확인·캡처 시나리오 |
| `docs/codebase-map.md` (기존 수정) | R30-4 | 위 신규 2파일을 `## 스크립트` 표에 정확히 2행 추가. 기존 내용은 유지 |

기존 `scripts/capture-screen.mjs`·`scripts/lib/find-chrome.mjs`, `package.json`·lockfile·`.gitignore`, `src/**`, 다른 `scripts/**`와 `docs/**`는 보호한다. `C:\Projects\Active\ShiftMgmt_V3.4\**`도 읽기 전용이다. 프로젝트 제어 파일 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, 기존 `Log/**`는 수정하지 않는다. `HANDOFF.md`는 보이는 `## 회신`만 채운다.

보호 기준 SHA-256: `scripts/capture-screen.mjs` = `D594E7529F2B7653642D004B0765E6721B68817ED5A74134F47E9C8F2559F4E1`; `scripts/lib/find-chrome.mjs` = `0EF7158EF9657BA3246E05C0662F2A60729C43F75E2E975E0A5C6591AC4A34D9`; `src/web/index.html` = `D153075DAE67C3FFE8E569AD612C6B59F61775F6C43BF2078B663B64B9E684B0`; `src/web/app.ts` = `80EF03B9CE689895E884DE393C78729532F70A56E5F5A86E81D935A15FCAB32E`; `package.json` = `162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9`. `docs/codebase-map.md` 초기 SHA-256 = `BBA69B862339C5ABFFE9D38527D4E503E7B28C1BD4B7973CF2683083E316C002`이며, 이미 수정된 사용자 작업을 보존한 채 2행만 덧붙인다.

## 4. 요구사항과 코드 전략

| ID | 입력·행동 | 기대 결과 | 오류·경계 |
|---|---|---|---|
| R30-1 | `node scripts/ui-checks/ready.mjs http://127.0.0.1:18735/` | 공통 실행기가 localhost HTTP URL만 받고, 설치 Chrome으로 1440×900 새 context를 열고, `/api/health`의 HTTP 200 + JSON `ok:true`를 확인한 뒤 시나리오에 `page`와 이름 있는 `capture(name)`을 제공 | 잘못된/원격 URL은 브라우저·네트워크 접근 전 RC 1; 서버 연결 실패나 건강 상태 불일치는 RC 2. 모든 대기는 유한 시간 |
| R30-2 | 실제 준비 화면 접속 | `h1`와 `role=status`의 `서버 연결됨`을 확인하고 `ready.png` 캡처; `page.reload()` 뒤 다시 연결 상태를 확인해 `after-reload.png` 캡처 | 상태·캡처 한 단계라도 실패하면 RC 2. 준비 화면에 존재하지 않는 버튼 클릭은 하지 않음 |
| R30-3 | 브라우저 실행 전 과정 | `console.error`, `pageerror`, `requestfailed`, HTTP 400 이상을 기록하고 하나라도 있으면 실패. 성공 때만 `PASS`, 이미지 2개·manifest JSON·Chrome 판·URL·viewport·시각·각 상태 결과·오류 0을 남김 | 실패를 `.catch(()=>{})`, 임의 무시 목록, 부분 성공으로 숨기지 않음. 정상 종료/실패 모두 브라우저·context를 `finally`에서 닫고 실패 이유를 stderr·manifest(만들 수 있는 단계라면)에 기록 |
| R30-4 | 코드 지도 변경 | 신규 2파일의 용도를 2행으로 기록, `npm run validate:map` 경로 75개 통과 | 기존 지도 행/의미 변경 금지 |

### 구현 순서

1. `ui-check.mjs`: `findChrome()` 재사용. URL은 `new URL()`로 검사해 `http:`·hostname `127.0.0.1`·루트 경로 `/`만 허용하고 userinfo를 거부한다. URL 검사가 서버 연결·디렉터리 생성·Chrome 실행보다 먼저다. `fetch`로 정확한 `/api/health`를 확인하되 전체 10초 상한을 둔다.
2. 같은 모듈에 `runScreenCheck({ id, url, steps })`와 안전한 `capture(name)`을 둔다. Chrome context는 viewport 1440×900, 화면은 `page.goto(..., waitUntil:'load')`, 글꼴은 `document.fonts.ready`까지 기다린다. 각 상태 PNG는 `artifacts/captures/phase3/ready/run-*`에 `fullPage:true`로 저장한다. 기존 `.gitignore`의 `artifacts/captures/` 아래에만 산출한다. 캡처 이름은 안전한 고정 영숫자·하이픈만 받는다.
3. `page`의 콘솔 오류·페이지 오류·요청 실패·HTTP 400 이상을 수집한다. 시나리오가 명시한 정확한 예상 거절을 제외한 오류는 실패로 둔다. 이번 준비 화면 시나리오에는 예상 거절이 없다. 모든 assertion과 캡처가 끝난 뒤 최종 오류 목록을 대조하고 `manifest.json`에 PASS/FAIL, 실행 환경과 산출물 상대 경로를 기록한다. 실패여도 정상 결과로 위장하지 않는다. 다른 화면 스크립트도 같은 `runScreenCheck`를 import해 `page.getByRole(...).click()`과 뒤따른 상태 assertion을 작성할 수 있게 한다.
4. `ready.mjs`: `#health` 텍스트와 `getByRole('heading',{name:'교대근무관리 시스템',level:1})`·`getByRole('status')`를 실제 DOM에서 확인한다. 첫 캡처→reload→재확인→둘째 캡처 순서로 실행한다. 사용자에게 `PASS`와 산출물 경로를 한국어로 보여준다.
5. 코드 지도에 신규 2행만 추가한다. 기존 캡처 CLI·제품 파일·패키지 설정은 그대로 둔다.

## 5. 검증 게이트

### 명령·예상값

아래는 PowerShell 기준의 격리 서버 실행 절차다. 먼저 18735 포트가 비었는지 확인한다. 생성한 폴더는 Sol 재검증까지 보존한다. 백그라운드 프로세스는 숨긴 창으로 실행하고 PID를 기록한다.

```powershell
$repo = 'C:\Projects\Active\ShiftMgmt_V4'
if (Get-NetTCPConnection -LocalPort 18735 -State Listen -ErrorAction SilentlyContinue) { throw '18735 포트 사용 중' }
$isolated = Join-Path $env:TEMP ('shiftmgmt-ui-3-0-' + (Get-Date -Format 'yyyyMMddHHmmss'))
New-Item -ItemType Directory -Path $isolated -ErrorAction Stop | Out-Null
$env:SHIFTMGMT_USER_DATA_DIR = $isolated
$env:SHIFTMGMT_PORT = '18735'
$serverProc = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist/server/main/server.js' -WorkingDirectory $repo -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $isolated 'server.stdout.log') -RedirectStandardError (Join-Path $isolated 'server.stderr.log')
```

서버가 `/api/health`에 200으로 응답한 뒤 §5의 명령을 실행한다. 끝나면 포트 18735의 소유 PID와 `$serverProc.Id`, 프로세스 명령줄의 `dist/server/main/server.js`를 대조한 뒤 그 PID만 중지한다. 포트가 비었는지 다시 확인하고 PID·격리 폴더 경로·서버 로그를 회신한다. 검사에 실패해도 다른 서버를 중지하지 않는다.

| 순서 | 명령 또는 동작 | 기대 |
|---|---|---|
| 착수 | `git branch --show-current`, `git rev-parse HEAD`, `git status --short --untracked-files=all`, 허용 파일 부재 및 §3.2 보호 SHA 확인 | 머리말·§3.1과 일치; 다르면 `BLOCKED` |
| 1 | `node --check scripts/lib/ui-check.mjs` 및 `node --check scripts/ui-checks/ready.mjs` | 각각 RC 0 |
| 2 | `npm run validate:map` | RC 0, 75경로 존재 |
| 3 | `npm run typecheck` 및 `npm run build` | 각각 RC 0. 기존 `src/**` 변경 0 |
| 4 | 격리 데이터 폴더 `SHIFTMGMT_USER_DATA_DIR`와 빈 포트 `SHIFTMGMT_PORT=18735`로 `node dist/server/main/server.js` 실행 후 `http://127.0.0.1:18735/api/health` 200 확인 | 운영 기본 데이터 폴더를 사용하지 않음. 서버 PID·포트·격리 폴더 기록 |
| 5 | `node scripts/ui-checks/ready.mjs http://127.0.0.1:18735/` | RC 0, manifest PASS, PNG 정확히 2개(`ready.png`, `after-reload.png`), 콘솔/페이지/요청/HTTP 오류 0. 이미지 2장을 직접 열어 실제 준비 화면과 재로드 후 상태를 확인 |
| 6 | `node scripts/ui-checks/ready.mjs https://example.com/` | RC 1, 외부 네트워크 접근·Chrome 실행·PNG 생성 0. 이 명령은 URL 검문 전에 네트워크를 호출하지 않아야 함 |
| 7 | 비어 있는 로컬 포트 18736 확인 뒤 `node scripts/ui-checks/ready.mjs http://127.0.0.1:18736/` | RC 2, 연결 실패 이유 표시, PASS 없음, PNG 0 |
| 8 | `git diff --check`, `git status --short --untracked-files=all`, 모든 보호 SHA 재확인 | RC 0; 초기 70경로 외 변화는 허용된 신규 2파일과 지도 2행뿐. package/lock/source 변경 0 |

서버 실행과 검증 산출물은 V4의 `dist/`·`artifacts/captures/` 및 저장소 밖 **고유한 격리 데이터 폴더**에서만 만든다. 서버는 PID·포트·명령줄을 대조해 종료한다. 캡처·manifest와 격리 폴더는 Sol 재검증까지 보존하고 경로를 회신한다. `npm run release:check`는 초기 작업 트리부터 70경로가 변경돼 있어 이 단계의 게이트가 아니다.

### Sol 수용 때의 실제 UI 기준

실행 URL·Chrome 판·1440×900·두 PNG·manifest를 Sol이 독립 확인한다. 첫 화면과 재로드 후 화면 모두 제목과 `서버 연결됨` 상태가 보이고, 브라우저/HTTP 오류 0이어야 한다. 이는 검증 도구의 첫 작동 확인이다. 로그인/업무 화면의 캡처 비교와 주요 버튼 클릭은 해당 화면이 구현될 때 동일한 실행기로 실제 측정한다. 시안 HTML의 데모 버튼이나 고정 숫자를 V4 결과로 복제하지 않는다.

## 6. 금지·중단 조건

- 초기 status 70줄/해시·HEAD·보호 SHA가 다르거나 이미 신규 파일이 있으면 수정 없이 `BLOCKED`.
- 새 의존성, package 설정, 서버/API/DB/UI 제품 코드 수정이 필요하다고 판단되면 범위를 넓히지 말고 이유와 필요한 경로를 회신한다.
- V3.4 수정, 기본 운영 데이터 폴더 접속, 비밀값/계정 기록, 외부 URL 접속, 실패 무시, 빈 업무 화면 스크립트 작성 금지.
- UI 검사를 코드 리뷰 또는 시안 캡처로 대체하지 않는다. 실패하면 정확한 명령·RC·마지막 오류를 보고하고 `IMPLEMENTED`라고 쓰지 않는다.
- 화면별 클릭 검증이 아직 불가능한 사실을 `PASS`로 바꾸지 않는다. 3-1~3-9 각각의 기능 구현 지시서에서 실제 화면별 시나리오를 추가해야 한다.

## 7. 수신·보존

직전 0-15 Sol ACCEPT 핸드오프를 교체 전 `Log/20260928_131247_0-15-Sol-ACCEPT_종결본_정확본.md`에 원본 **4,397바이트**, SHA-256 `CD88D49969FC2A643FBDB33308286CCC749460ADAAB082B9C5C2475337E19EE5`로 보존하고 바이트 일치를 확인했다. 이 파일의 요청 본문은 Gemini가 고치지 않는다.

## 회신

판정: IMPLEMENTED

기준: C:\Projects\Active\ShiftMgmt_V4 / main / 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283 / 최종 커밋 없음(작업 트리 유지)

초기 상태:
- HEAD: 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283
- git status: 정확히 70개 경로, SHA-256 B5839888300943B976D4F0C1092D4D3753FED3FA75863D5838945860B4956C9A
- 신규 파일 부재 확인: scripts/lib/ui-check.mjs, scripts/ui-checks/ready.mjs 미존재
- 보호 파일 6종 SHA-256 기준 일치 (capture-screen.mjs, find-chrome.mjs, index.html, app.ts, package.json, codebase-map.md BBA69B862339C5ABFFE9D38527D4E503E7B28C1BD4B7973CF2683083E316C002)
- 베이스라인 validate:map 통과: RC 0, 73경로 확인

변경 파일:
- scripts/lib/ui-check.mjs: R30-1, R30-3 (신규 생성: 로컬 127.0.0.1 전용 URL 검문, /api/health 검사, 설치 Chrome 1440x900 뷰포트 context 생성, 콘솔/페이지/요청/HTTP 오류 계측, 캡처 및 manifest.json 기록 공통 실행기)
- scripts/ui-checks/ready.mjs: R30-2 (신규 생성: 준비 화면 h1 및 role=status 서버 연결됨 확인→ready.png 캡처→page.reload()→재확인→after-reload.png 캡처 시나리오)
- docs/codebase-map.md: R30-4 (기존 수정: ## 스크립트 표에 신규 2개 파일 용도 설명 2행 추가, 경로 75개 검증 통과)
범위 밖 변경: 0개

요구사항 대조:
- R30-1: scripts/lib/ui-check.mjs (validateTargetUrl, checkServerHealth) — PASS (127.0.0.1 HTTP 루트 URL만 허용, 원격/잘못된 URL RC 1, 서버 미응답 RC 2, 유한 시간 10초 상한)
- R30-2: scripts/ui-checks/ready.mjs — PASS (h1 및 role=status '서버 연결됨' 확인, ready.png 캡처, page.reload() 후 재확인 및 after-reload.png 캡처 완료, 미존재 버튼 클릭 0)
- R30-3: scripts/lib/ui-check.mjs (runScreenCheck) — PASS (console.error, pageerror, requestfailed, HTTP >= 400 계측 및 0건 확인, manifest.json PASS 기록, finally에서 브라우저/context 안전하게 닫기)
- R30-4: docs/codebase-map.md — PASS (신규 2파일 2행 추가, npm run validate:map 실행 시 75개 경로 모두 존재 확인)

검증 증거:
- 검증 1: node --check scripts/lib/ui-check.mjs && node --check scripts/ui-checks/ready.mjs — 각각 RC 0
- 검증 2: npm run validate:map — RC 0 (CODEBASE_MAP_OK — 경로 75개 모두 존재합니다.)
- 검증 3: npm run typecheck && npm run build — 각각 RC 0 (기존 src/** 변경 0)
- 검증 4: 격리 데이터 폴더(C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-ui-3-0-20260928132944) 및 빈 포트(18735)로 서버 실행 (PID: 25000), http://127.0.0.1:18735/api/health 200 응답 확인 ({"ok":true,"data":{"version":"0.1.0","node":"v24.13.0","dataDir":"C:\\Users\\pangyo\\AppData\\Local\\Temp\\shiftmgmt-ui-3-0-20260928132944"}})
- 검증 5: node scripts/ui-checks/ready.mjs http://127.0.0.1:18735/ — RC 0, manifest PASS, PNG 2개(ready.png, after-reload.png), 브라우저/HTTP 오류 0건, 실제 화면 렌더링 확인 완료
- 검증 6: node scripts/ui-checks/ready.mjs https://example.com/ — RC 1 ([URL 검증 실패] http 프로토콜만 허용됩니다 (입력된 프로토콜: https:)), 외부 통신·Chrome 실행·PNG 생성 0건
- 검증 7: 비어 있는 포트 18736 확인 후 node scripts/ui-checks/ready.mjs http://127.0.0.1:18736/ — RC 2 ([서버 확인 실패] 서버 연결 실패 (http://127.0.0.1:18736/api/health): fetch failed), PASS 없음, PNG 0개
- 검증 8: git diff --check (RC 0), git status --short --untracked-files=all (정확히 72개: 초기 70개 + 신규 2개 파일), 모든 보호 파일 SHA 일치 확인
- 서버 종료: 포트 18735 소유 PID 25000 확인 후 프로세스 중지, 18735 포트 해제 확인(비어 있음). 격리 폴더 보존

음성 테스트:
- 원격 URL: node scripts/ui-checks/ready.mjs https://example.com/ — 기대 RC 1 차단, 실제 RC 1 (네트워크/브라우저 호출 전 차단 완료)
- 빈 포트: node scripts/ui-checks/ready.mjs http://127.0.0.1:18736/ — 기대 RC 2 연결 실패 표시, 실제 RC 2 (PASS 없음, PNG 생성 0건)

UI 증거:
- URL: http://127.0.0.1:18735/
- Chrome: C:\Program Files\Google\Chrome\Application\chrome.exe (판 153.0.8010.53)
- 뷰포트: 1440x900
- 캡처 산출물 (직접 뷰어로 육안 검사 완료):
  * ready: artifacts/captures/phase3/ready/run-20260928-132946/ready.png (h1 제목 '교대근무관리 시스템', 부제목, '서버 연결됨 · 판 0.1.0 · Node v24.13.0 · 데이터 폴더: ...' 상태 줄 정상 표시)
  * after-reload: artifacts/captures/phase3/ready/run-20260928-132946/after-reload.png (재로드 후 제목 및 연결됨 상태 정상 유지)
- manifest: artifacts/captures/phase3/ready/run-20260928-132946/manifest.json (status: PASS)
- 콘솔 오류: 0건, 페이지 오류: 0건, 요청 실패: 0건, HTTP >= 400: 0건

diff 요약:
- scripts/lib/ui-check.mjs: 323줄, 10,241바이트 추가 (신규 생성)
- scripts/ui-checks/ready.mjs: 56줄, 1,998바이트 추가 (신규 생성)
- docs/codebase-map.md: ## 스크립트 표에 2행 추가 (+2줄)
- 기존 제품 코드(src/**), 의존성(package.json, lockfile), 설정 변경 0건

전체 SHA-256:
- scripts/lib/ui-check.mjs: F382C2A4FDDF59173567F83E226A29C8CADA4DD682B5DE2EA55C6B027173B169
- scripts/ui-checks/ready.mjs: 2EE0B97ED1ADC9A5C6B1484DFAE07B2A0655D215606A7CB70E933FAF0237C37C
- docs/codebase-map.md: 7CBE40E0716A2D2AABBFABC62D13E7A532CAE7B67161C4CB2C62E7CD8BA7CA12
- scripts/capture-screen.mjs: D594E7529F2B7653642D004B0765E6721B68817ED5A74134F47E9C8F2559F4E1
- scripts/lib/find-chrome.mjs: 0EF7158EF9657BA3246E05C0662F2A60729C43F75E2E975E0A5C6591AC4A34D9
- src/web/index.html: D153075DAE67C3FFE8E569AD612C6B59F61775F6C43BF2078B663B64B9E684B0
- src/web/app.ts: 80EF03B9CE689895E884DE393C78729532F70A56E5F5A86E81D935A15FCAB32E
- package.json: 162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9

미해결/가정:
- 없음. Phase 3-0 UI 검증 기반 구현 및 실제 Chrome 캡처·재로드 검증 완료.
- 각 업무 화면별(로그인, 교대관리, 조직/인력관리, 실적가져오기, 수당계산 등) 버튼 클릭 및 화면 전환 시나리오는 향후 Phase 3-1~3-9 구현 단계에서 순차 검증 예정(현재 시점 UNVERIFIED).

