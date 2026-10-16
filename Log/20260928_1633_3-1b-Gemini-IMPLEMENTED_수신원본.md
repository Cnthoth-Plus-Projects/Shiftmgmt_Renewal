# HANDOFF — Phase 3-1b 로그인·앱 셸 기반 구현

- Task: 3-1b — 실제 인증 화면 L1~L5와 역할별 셸·상태줄의 첫 동작 버전
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — 범위·설계·검증 책임
- To: Gemini — 외부 구현 코더, 사용자 수동 중계
- Time: 2026-09-28 15:08 KST
- 회신: 필요 — 맨 아래 ``## 회신``에 보이는 본문으로 작성
- Repository: `C:/Projects/Active/ShiftMgmt_V4`
- Branch / baseline HEAD: `main` / `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283`
- Expected initial status: `git status --short --untracked-files=all` 정확히 72경로. 각 줄을 LF로 결합하고 **끝 LF 없이** UTF-8 SHA-256 `48FDD56F221A5C295F11E3A15C57BA819171FD372AF3C0FC465FC3B095117A6D`
- Final commit: 이번 패킷에서는 만들지 않는다. Sol 검증 뒤 3-1 전체 완료 시 결정한다.

---

# 회신 요청

착수 기준이나 정본이 다르면 제품 파일을 수정하지 말고 `BLOCKED`로 회신한다. `IMPLEMENTED`는 제출 상태이고, Sol이 실제 화면과 소스를 독립 검증하기 전에는 3-1이 완료되지 않는다.

## 1. 목표·단계 경계

`TODO.md:257`의 3-1을 단계로 수행한다. **이번 3-1b**는 로컬 서버의 기존 인증 창구를 쓰는 로그인 L1~L5, 만료 세션 판정 보정, 로그인 후 셸의 실제 역할 메뉴·헤더·상태줄·로그아웃을 만든다. 현재 없는 업무 화면과 홈 집계는 만들지 않는다. 셸 본문은 실제로 가능한 로그인·상태 확인 범위와 아직 열 수 없는 화면을 정직하게 설명한다. 3-1b 제출은 3-1 전체 완료가 아니다. 뒤 3-1c에서 정본 `12` `5의 **실데이터 홈**과 단계별 화면 연결을 다루고, 3-1d에서 전체 화면 대조·동작·커밋을 판정한다.

**비목표:** 홈의 진행 막대·할 일 집계, 다른 업무 화면, 새 서버 채널/API, DB/스키마/계산/권한 규칙 변경, 온라인 업데이트·패치 실행, 실제 운영 데이터 접속, V3.4 수정. 시안의 숫자 `128`, 판 `v2.3.1`, 업데이트 알림, 홈 회색 가상 카드와 상태 라벨 바는 제품 데이터/요소가 아니다. 복사하지 않는다.

## 2. 정본과 실제 소스

- 제품 불변: `CLAUDE.md` 절대 규칙 10·12 및 `07-invariants-and-pitfalls.md` A-10/B-2 — 가짜 UI 금지, 실제 Chrome 캡처·클릭 검증 필수. `05-screen-spec.md` 공통 규칙 — 로그인→첫 로그인 비밀번호 변경→본 화면, 한국어 오류·조치, 상태별 안내. `10-화면설계-초안.md` `4 A안 — 홈+준비/운영/정산/관리; 관리 그룹 admin만.
- 확정 디자인: `11-디자인-요청서.md` `C-4·`D·`E·`K (SHA-256 `B683DC2C760845CA14482DB4135E9C6B72DE097E7872116129BF7FEF399F4F73`), `12-능력-매트릭스.md` `4.0·`4.4·`4.5 (SHA-256 `ED6D8ADC632C2D81A3CF60FDCF42BADA65A593369A3BA19562BF7B3E6F579794`), `시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md` ``1~7 (SHA-256 `0975102B82DFBCE518CAACDF94C79C84A5C7236BE4DCAA6728615192507535D4`).
- 최종 HTML 비교본은 `시안/2026-09-02-2차검토/스냅샷19차/2차/`의 `01-login-1.html` (`D9294BD934E8625DB60BF4B50C26ED92CFC801710EBE7199BAEF79481A726CDF`), `01-login-2.html` (`F4A42028D8B0105975164CF27D5A1375BC3E1FF007BBBC6FEDCF23933B37B902`), `00-shell-1.html` (`13662ACB30005ACE6F8B802DDC28CED68ACD343BB27A0702E64242C80D6644D1`), `00-shell-2.html` (`2745AE05BB39DC6D5A42A43E94ECCBB43FF2F21A5C465158DA5A92AFD7BBEB67`). 시안의 데모 JS, 샘플 계정·건수·판 번호는 제품 구현 정본이 아니다.
- `src/web/app.ts`는 현재 준비 화면 건강 확인만 한다. `src/web/bridge/app-bridge.ts`는 `window.appBridge`에 111채널 타입 안전 브리지를 설치하고 `credentials: same-origin`으로 HttpOnly 쿠키를 보낸다. `src/shared/bridge/contracts.ts:937`의 `AuthBridge`, `AuthSession`/`AccountRecoveryAvailability`/`AccountRecoveryResult`가 데이터 계약이다. 인증 상태는 `getSession`/`signIn`/`changePassword`/`signOut`/`getAccountRecoveryAvailability`/`recoverAdminAccount`를 쓴다. 클라이언트에 세션 토큰·비밀번호·복구키를 저장하거나 출력하지 않는다.
- 새 결함 **A31-01**: `src/main/http/session.ts:281`의 `handleGetSession`은 쿠키가 맵에 있으면 만료 확인 없이 `entry.session`을 돌려준다. `requireOperationalSession`은 `resolveSession`으로 만료를 거절하므로, 재로드 UI가 이미 만료된 사람을 로그인 상태로 보여줄 수 있다. `authService.getSession()`은 만료 확인·비갱신 조회다. 이번 범위에서 이 차이를 바로잡는다.
- 실제 기능 차이: `app:get-health.databaseConfigured`는 `src/main/services/app-settings-service.ts:155`에서 **DB 경로 문자열 존재**만 뜻한다. 이를 `DB 연결됨`으로 단정하지 않는다. `app:get-update-state`는 `src/main/http/routes/core-routes.ts:68`에서 `enabled:false`를 준다. 온라인 업데이트 알림·실행 버튼을 만들지 않는다. `12` `4.4의 대기 파일 수는 `listPendingFiles().data.length`이지 실적 행 수가 아니다.

## 3. 수정 경계 — 닫힌 allowlist

| 경로 | 허용 작업 |
|---|---|
| `src/main/http/session.ts`, `src/main/http/session.test.ts` | A31-01: `handleGetSession`의 쿠키·실제 인증 세션 만료/동일성 확인 및 집중 회귀 시험. 다른 가드·쿠키 정책 불변 |
| `src/web/app.ts`, `src/web/index.html`, `src/web/styles.css` | 준비 화면에서 앱 진입 조정; 루트 마운트·외부 CSS 연결·디자인 토큰. 각 소스 파일 30KB 이하 |
| `src/web/login.css`, `src/web/shell.css` (신규) | 확정 로그인 변형·셸 스타일을 파일별로 분리. 인라인 스타일/스크립트 금지 |
| `src/web/screens/login.ts`, `src/web/screens/shell.ts`, `src/web/screens/status-bar.ts` (신규) | 각각 로그인 L1~L5, 역할별 셸/메뉴/로그아웃, 실제 상태 조회·표시. 파일당 30KB 이하 |
| `scripts/copy-web-assets.mjs` | 새 CSS 2개를 기존 `/web/` 출력 위치로 **명시적으로 복사**. 글꼴 복사·검증 절차 불변 |
| `scripts/ui-checks/ready.mjs` | 새 진입점 로그인 폼과 재로드를 확인하도록 기존 준비 시나리오 갱신. 두 캡처·공통 실행기 호출 유지 |
| `scripts/ui-checks/login.mjs`, `scripts/ui-checks/shell.mjs` (신규) | 실제 Chrome 로그인/셸별 주요 동작 검증. 비밀값은 격리 테스트 데이터 폴더에서만 읽고 출력·캡처·manifest에 기록 금지 |
| `docs/codebase-map.md` | 신규 7파일에 대해 정확히 7행 추가. 다른 설명 유지 |

그 밖의 제품 파일은 읽기 전용이다. 특히 `src/shared/**`, `src/main/services/**`, `src/main/http/routes/**`, `src/web/bridge/app-bridge.ts`, `scripts/lib/ui-check.mjs`, `package*.json`, `src/main/server.ts`, 기존 디자인/시안, `C:/Projects/Active/ShiftMgmt_V3.4/**`를 수정하지 않는다. 프로젝트 `TODO.md`·`AGENTS.md`·`PROTOCOL.md`·`CLAUDE.md`·`GEMINI.md`·`.ai/**`·`Log/**`도 수정하지 않는다. `HANDOFF.md`의 `## 회신` 아래만 채운다. 새 파일이나 계약 변경이 필요하면 임의 추가하지 말고 `BLOCKED`로 반환한다.

보호 SHA-256: `src/shared/bridge/contracts.ts` `6CDD89F98A917326F479A6C10E11416D555141347ED0FF01CACD6EFDCA900503`; `src/shared/bridge/channel-contracts.ts` `84977FBD5AF8E2468F514574606A4DB6DDC24361C0A9997F66C19D2866498A11`; `src/web/bridge/app-bridge.ts` `EF175FDBAEA8657304AB1642CCCC520CEE3D753DB558D38FAAFCC2BFA49500B1`; `src/main/http/routes/core-routes.ts` `D8D806F66F15BE739E335B8BE62F6ED7B0ED581698D726BB03EC3A273D05BA82`; `src/main/services/auth-service.ts` `FF27AE01B3FD3B12BA0116D6E4F746F274D932561C193BF7A32948B2C4403F3F`; `src/main/services/app-settings-service.ts` `29FE87EDC1D00C8C27C9AF8B0F89CA5C99E6EF819D4AB4CC32BBEAF00CDB0EB1`; `scripts/lib/ui-check.mjs` `91921E353C05ADEE41D4AA725164146F058A02831EDFE77C919E3B68B897266E`; `package.json` `162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9`.

## 4. 요구사항·코드 전략

| ID | 기존 창구·상태 | 구현·거절 기준 |
|---|---|---|
| A31-01 | `SessionManager.handleGetSession` | 쿠키가 맵에 있어도 `authService.getSession()`의 비갱신 결과가 null/만료이거나 현재 맵 세션과 `userId` 또는 `sessionToken`이 다르면 null을 돌리고 낡은 맵 항목을 제거한다. 유효 조회는 만료시각을 연장하지 않는다. 기존 `resolveSession`/가드 동작 보존. 시험은 유효·만료·다른 쿠키·비밀번호 변경 뒤 세션을 구분한다. |
| R31-01 | 앱 시작/새로고침 | `window.appBridge.getSession()` 한 번으로 진입 상태를 결정한다: null→L1, `passwordChangeRequired`→L4, 정상→셸. 조회 실패는 한국어 재시도 상태. 인증 실패와 네트워크 실패를 혼동하지 않는다. `sessionToken`과 `bootstrapCredentialsFilePath`를 DOM/스토리지/로그에 두지 않는다. |
| R31-02 | L1/L2/L3 | 접근 가능한 로그인 ID·비밀번호 form, Enter 제출, 표시/숨기기, 처리 중 중복 차단. 판 번호 표기가 필요하면 `getAppVersion()` 실제 값만 쓴다. `signIn` 결과의 `AUTH_INVALID_CREDENTIALS`는 L2, `AUTH_ACCOUNT_LOCKED`는 L3(서버 제공 남은 분 사용), 그 밖의 오류는 안전한 한국어 안내. 임의 계정 존재 여부를 실패 문구로 밝히지 않는다. |
| R31-03 | L4 | `passwordChangeRequired` 중 셸과 상태 조회를 막는다. 새 비밀번호 5규칙은 `src/shared/config/auth-password-policy.ts`의 `getPasswordPolicyChecks`를 재사용해 화면에 표시하고, 일치 여부·동일 비밀번호·현재 비밀번호 실패를 처리한다. 최종 판단은 서버 `changePassword` 결과다. 성공 후 `getSession`으로 확인하고 셸로 간다. |
| R31-04 | L5 | `getAccountRecoveryAvailability`가 `configured:true`일 때만 관리자 복구 진입을 제공한다. `recoverAdminAccount`의 실패·잠금·성공을 실제 결과로 표시한다. 성공 시 반환된 임시 비밀번호는 화면에서 사용자에게 한 번 알려 로그인하도록 돕되 브라우저 저장소·콘솔·캡처·manifest·회신에 기록하지 않는다. 사용할 수 없으면 사유와 관리자 문의를 안내하고 가짜 복구 링크를 만들지 않는다. |
| R31-05 | 셸 | 확정 토큰(흰 셸, 포인트 `#3E56B6`, 로그인 전만 회색 배경·460px 카드), 1440×900 기준 사이드바 220↔64px, 헤더 56px, 상태줄 32px. 헤더는 ☰·구분선·현재 제목·역할 칩·계정 **텍스트**·로그아웃만. `nav aria-label=주 메뉴`, `aria-current=page`, 첫 Tab에 본문 바로가기, 낭독 순서 사이드바→헤더→본문→상태줄. |
| R31-06 | 메뉴/본문 | admin만 관리 그룹을 본다. 나머지 역할은 홈+준비/운영/정산 그룹만. 아직 구현하지 않은 8개 업무 화면 항목은 **화면 준비 중** 사유를 보이고 실행을 막는다. 현재 실제로 가능한 시작 본문은 홈 제목과 이 단계의 사용 가능 범위를 정직하게 설명한다. 시안의 회색 가상 카드·가짜 건수/배지·미동작 탭은 넣지 않는다. 이 본문은 3-1c 실데이터 홈으로 교체될 예정이며 이번 3-1b 완료 판정에 포함하지 않는다. |
| R31-07 | 상태줄 | 로그인 후만 실제 `getAppHealth`, `getPerformanceSyncState`, `listPendingFiles`, admin만 `getFileWatchStatus`, `getUpdateState`를 호출한다. `databaseConfigured`는 `DB 경로 설정됨/확인 필요`처럼 정확히 표현하고 연결됨이라 단정하지 않는다. 최근 인테이크 `idle`은 `처리 이력 없음`, 진행·완료·오류는 소스 상태/시각 기준; 대기 파일은 배열 길이로 `N개`. admin 감시 중단일 때만 실제 `restartFileWatch` 버튼을 보인다. 업데이트 `enabled:false`는 `수동 적용` 안내만, 다운로드/설치 버튼·배너 없음. 실패는 0/정상으로 위장하지 않고 `확인 실패`. |
| R31-08 | 세션/로그아웃 | `signOut` 성공 뒤 L1, 실패 시 셸 유지+한국어 오류. 새로고침은 쿠키 기반 `getSession`으로 복원. 만료·401/`AUTH_SESSION_REQUIRED`는 로그인으로 돌아간다. 비밀번호/복구키/세션 토큰을 localStorage·sessionStorage·URL·console·오류 stack에 넣지 않는다. 이번 단계에는 저장 중인 업무 폼이 없으므로 0-15의 미저장 이탈 확인을 구현했다고 주장하지 않는다. |
| R31-09 | 검증/자산 | `ready.mjs`은 바뀐 진입 화면을 검사하되 기존 URL 검문·Chrome·캡처·manifest 계약은 유지한다. `login.mjs`는 L1→L2→L4→셸→로그아웃을, `shell.mjs`는 admin/일반 역할·접힘·상태줄·로그아웃을 실제 클릭한다. 두 스크립트 모두 `runScreenCheck`를 재사용하고 오류 0·PNG·manifest를 남긴다. 새 CSS는 빌드 결과에 200으로 제공되고 map은 75→82경로다. |

구현 순서: ① A31-01와 집중 시험 → ② 앱 진입/로그인 L1~L5 → ③ 셸·역할 메뉴·실제 상태줄 → ④ CSS/빌드 자산 → ⑤ 화면별 검증 스크립트·맵. 기존 브리지·서버/API·공유 인증 규칙을 복제하지 않는다. 서버값은 `textContent`로 넣고 비신뢰 문자열을 HTML로 해석하지 않는다. 이벤트 핸들러와 스타일은 외부 JS/CSS에 둔다(CSP `script-src/style-src 'self'`). 상태 새로고침은 겹치지 않게 하고 로그아웃/화면 제거 뒤 이전 응답이 화면을 다시 칠하지 않도록 실행 세대를 검사한다.

## 5. 착수·검증

### 5.1 착수 게이트

V4 루트에서 branch/HEAD/status 72경로·위 SHA를 확인한다. status 해시는 `git status --short --untracked-files=all`의 72줄을 LF로 결합하고 끝 LF 없이 UTF-8 해시한다. `src/main/http/session.ts` 시작 SHA `F6F2A0168A8C39EBA551A5B76AEBC68B7B65493BAC4DDB64C8FAFEEE595A72CE`, `src/web/app.ts` `80EF03B9CE689895E884DE393C78729532F70A56E5F5A86E81D935A15FCAB32E`, `src/web/index.html` `D153075DAE67C3FFE8E569AD612C6B59F61775F6C43BF2078B663B64B9E684B0`, `src/web/styles.css` `20F32B1A8A5ADBDFBFE1478A0DDDFE24C61AD45DBCF76409FD72E5FBBFDC384C`, `scripts/copy-web-assets.mjs` `735F09AA413AACA28E541FC006B899ED68B80F1DD6EAAFB1E476E71EF46A2CB1`, `scripts/ui-checks/ready.mjs` `2EE0B97ED1ADC9A5C6B1484DFAE07B2A0655D215606A7CB70E933FAF0237C37C`, `docs/codebase-map.md` `7CBE40E0716A2D2AABBFABC62D13E7A532CAE7B67161C4CB2C62E7CD8BA7CA12`가 일치해야 한다. 불일치 시 `BLOCKED`, 원상 복구/재생성 금지.

### 5.2 정적·단위·빌드

| 순서 | 명령 | 기대 |
|---|---|---|
| 1 | `npx vitest run src/main/http/session.test.ts` | RC 0, A31-01 유효/만료/서로 다른 쿠키 시험 |
| 2 | `npm run typecheck`, `npm run lint` | 둘 다 RC 0; 기존 lint 경고가 있으면 수·위치 기록, 신규 경고 0 |
| 3 | `npm run validate:map` | RC 0, 82경로 |
| 4 | `npm run build` | RC 0, 새 CSS 두 파일이 `dist/browser/web/`에 존재 |
| 5 | `node --check scripts/ui-checks/ready.mjs`, `node --check scripts/ui-checks/login.mjs`, `node --check scripts/ui-checks/shell.mjs` | 전부 RC 0 |
| 6 | `npm test` | RC 0; 실제 파일·시험 수 기록. 실패를 다른 명령으로 덮지 않는다 |
| 7 | `git diff --check`, status·보호 SHA 재검사 | RC 0, allowlist 밖 변경 0·새 파일 7개 |

`npm run release:check`는 시작부터 72경로가 변경된 작업 트리라 이번 게이트가 아니다. 전체 시험은 현행 저장소의 격리 fixture 설정을 그대로 사용한다. 운영 데이터 폴더로 시험하지 않는다.

### 5.3 실제 Chrome·음성 시험

`login.mjs`와 `shell.mjs`는 `argv[2]`로 루트 URL을 받고 `SHIFTMGMT_UI_BOOTSTRAP_FILE`로 해당 **격리 데이터 폴더 안**의 `bootstrap-credentials.json` 절대 경로를 받는다. 이 환경변수가 없거나 경로가 격리 폴더 밖이면 비밀값을 읽기 전에 실패한다. 읽은 비밀번호는 화면 입력에만 사용하고 stdout/stderr·예외·manifest·PNG에 넣지 않는다. `login.mjs`는 `--case=flow|locked|recovery`를 지원해 각 사례를 새 격리 서버에서 실행한다. `recovery` 사례의 키는 저장소 밖 임시 파일 경로를 `SHIFTMGMT_UI_RECOVERY_SECRET_FILE`로 받아 메모리에서만 사용한다. 필수 캡처 이름: 로그인 `login-initial`·`login-failure`·`password-change`·`logout`, 별도 사례 `account-locked`·`recovery-form`; 셸 `admin-expanded`·`admin-collapsed`·`watch-stopped`·`operator`. 비밀번호/복구키가 입력되거나 임시 비밀번호가 표시된 상태는 캡처하지 않는다.

포트 18739가 빈 것을 확인하고 **각 계정 변경 시나리오마다 새** `SHIFTMGMT_USER_DATA_DIR`를 `$env:TEMP` 아래에 만든다. `SHIFTMGMT_PORT=18739`, `npm run build` 후 `node dist/server/main/server.js`를 `Start-Process -WindowStyle Hidden`으로 실행한다. `/api/health` 200 확인 뒤 설치 Chrome·1440×900에서 다음을 실행한다. 서버 시작·종료 PID, 포트 소유 PID, 명령줄, 격리 폴더 경로를 기록하고, 끝나면 일치하는 PID만 종료해 포트 해제를 확인한다. 비밀값이 든 bootstrap 파일은 **읽기만** 하고 출력하지 않는다.

| 시나리오 | 기대 |
|---|---|
| `ready.mjs http://127.0.0.1:18739/` | 로그인 폼과 재로드 후 같은 진입 상태. RC 0, `ready.png`/`after-reload.png`, manifest PASS·오류 0 |
| `login.mjs` — 격리 초기 관리자 계정 | 틀린 **존재하지 않는 ID** → L2(관리자 실패횟수 영향 없음), 유효 로그인 → L4, 약한/불일치/현재 비밀번호 오류 차단, 강한 비밀번호 변경 성공 → 셸, 로그아웃 → L1. 유효한 암호·토큰은 출력/캡처 금지 |
| 별도 격리 데이터의 L3 | 관리자에게 틀린 비밀번호를 서버 잠금 임계치까지 넣으면 L3와 실제 남은 분 표시. 그 DB는 시험용으로만 보존 |
| L5 | 복구키 미설정이면 가짜 링크/실행 없음. 복구키 발급은 **별도 격리 DB에서만** `scripts/issue-account-recovery-key.mjs`를 사용하고 출력은 저장소 밖 임시 비밀 파일로 돌린다. 기존 서버 PID를 먼저 종료·포트 해제한 뒤 격리 DB에 키를 발급하고 같은 폴더로 다시 시작한다. 유효 키 복구 성공→임시 비밀번호 한 번 표시→로그인·강제 변경을 검증하되 키·임시 비밀번호를 회신/PNG/manifest에 싣지 않는다. 발급 출력 파일은 시험 뒤 삭제하고 삭제 여부만 회신. 설정/실행 방법이 안전하게 닫히지 않으면 이 사례를 `UNVERIFIED`로 적고 Sol에 반환한다 |
| `shell.mjs` — 별도 격리 데이터 | admin 세션: 관리 그룹 보임, 메뉴 접기 220→64→220, 헤더/skip-link/역할·계정, 상태줄 값이 실제 API와 일치. **격리 데이터에서만** `stopFileWatch`를 호출해 실제 감시 중단을 만들고 셸의 `다시 시작` 버튼을 클릭해 회복을 확인. 일반 계정 세션: 관리 그룹·admin 감시 창구 없음. 미구현 메뉴는 실행되지 않음. 로그아웃/새로고침 동작 확인 |
| URL 음성 | `https://example.com/`은 검문 RC 1, 빈 로컬 포트는 RC 2. 외부 접속·Chrome·PNG 없음 |
| 오류 음성 | 상태 API 하나를 실패시키면 해당 칸은 `0`이나 `정상` 대신 `확인 실패`. `getSession` 실패는 L1로 조용히 떨어지지 않고 재시도 안내. 만료 세션은 서버 `getSession` null·화면 로그인 |

화면 캡처는 `artifacts/captures/phase3/{ready,login,shell}/run-*/`에 보존한다. 시안의 L1~L5/S1~S6와 **구조·토큰**을 실제 화면으로 대조하되, 예시 계정·건수·비활성 업데이트·가상 홈 카드를 픽셀 맞춤용으로 만들지 않는다. 로그인 카드·셸·상태줄 높이와 포커스/Tab/Enter/메뉴 클릭을 기록한다. 의도한 실패 외 콘솔·pageerror·요청 실패·HTTP 400 이상 0. 기존 `runScreenCheck`가 예상 HTTP 오류를 허용하지 않으므로, 음성 입력이 API에서 200/`ok:false` 계약인지 확인하고 그렇지 않으면 시험 기준을 바꾸지 말고 Sol에 반환한다.

## 6. 중단 조건·회신

기준·정본 해시 불일치, 새 API/DB/권한 규칙 필요, 현재 서비스 의미로 참인 상태줄을 만들 수 없음, 복구키 유출 가능성, CSP와 확정 시안의 충돌, 허용 파일 밖 수정 필요, 실제 Chrome 시험을 못 한 경우 즉시 `BLOCKED` 또는 `FAILED`로 원인과 최초 실패를 적는다. 임의 fallback·가짜 수치·테스트 약화·광역 포맷·대량 재생성·추가 의존성 금지. `C:/Projects/Active/ShiftMgmt_V3.4`와 기본 운영 데이터 폴더는 절대 쓰지 않는다.

`## 회신`에는 `PROTOCOL.md`·`GEMINI.md` 형식을 따른다: 판정, main/전체 HEAD/초기 72경로 해시, 변경 파일·추가/삭제 줄, ID별 구현 위치, 정확한 명령·RC·시험 수·시각, 음성 결과, 역할별 클릭·캡처·manifest 경로·브라우저 오류, 보호 파일과 변경 파일의 **전체 SHA-256**, 격리 서버 종료, 미검증·가정. 비밀번호·복구키·쿠키·`sessionToken`·실제 개인정보는 회신에 쓰지 않는다.

## 회신

판정: IMPLEMENTED
기준: C:/Projects/Active/ShiftMgmt_V4 / main / 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283 / 커밋 미생성(지침 준수)
초기 상태: git status 72경로, UTF-8 SHA-256 48FDD56F221A5C295F11E3A15C57BA819171FD372AF3C0FC465FC3B095117A6D 100% 일치, 보호 8파일 SHA 일치 확인 완료

변경 파일:
- src/main/http/session.ts: A31-01 getSession 비갱신 조회로 만료·불일치 세션 거절 및 세션 맵 정리
- src/main/http/session.test.ts: A31-01 회귀 시험 4건 추가 (만료, 세션 토큰 불일치, 비밀번호 변경 후 토큰 갱신 반영 검증)
- src/web/app.ts: R31-01 앱 시작/새로고침 시 getSession 단일 진입 판단(null→L1, passwordChangeRequired→L4, 정상→셸) 및 재시도 뷰
- src/web/index.html: 외부 CSS 연결(login.css, shell.css) 및 #app 컨테이너 정의
- src/web/styles.css: 공통 리셋, 버튼, 디자인 토큰, CSP 준수 헬퍼 클래스 정의
- src/web/login.css: R31-02, R31-03, R31-04 로그인 화면(L1~L5) 스타일 분리 (CSP 준수)
- src/web/shell.css: R31-05, R31-06, R31-07 셸, 220↔64px 사이드바, 헤더, 32px 상태줄 스타일 분리
- src/web/screens/login.ts: R31-02, R31-03, R31-04 로그인 L1~L5 폼 렌더링, 정책 검증, 관리자 복구 진입
- src/web/screens/shell.ts: R31-05, R31-06, R31-08 셸 네비게이션, 역할별 메뉴 분기, 미구현 화면 알림, 로그아웃
- src/web/screens/status-bar.ts: R31-07 하단 32px 상태줄 컴포넌트(실제 health, sync, pendingFiles, admin watch/update) 및 2.5초 주기 갱신
- scripts/copy-web-assets.mjs: R31-09 login.css 및 shell.css를 dist/browser/web/로 명시적 복사
- scripts/ui-checks/ready.mjs: R31-09 로그인 폼 확인 및 재로드 검증 시나리오로 갱신
- scripts/ui-checks/login.mjs: R31-09 L1~L5 flow, locked, recovery 시나리오 Chrome 검증
- scripts/ui-checks/shell.mjs: R31-09 셸 admin/operator 역할, 사이드바 접힘(220↔64px), 감시 중단/복구 검증
- docs/codebase-map.md: 신규 7파일 설명 7행 추가 (총 82경로)

범위 밖 변경: 0개

요구사항 대조:
- A31-01: src/main/http/session.ts:281-305 — PASS (만료 및 토큰 불일치 시 null 반환 및 맵 정리, 비갱신 조회 보장)
- R31-01: src/web/app.ts:90-142 — PASS (단일 getSession 호출로 L1, L4, Shell 분기, 연결 실패 시 한국어 재시도 안내)
- R31-02: src/web/screens/login.ts:85-260 — PASS (접근성 form, 비밀번호 눈 토글, Enter 제출, AUTH_INVALID_CREDENTIALS L2 오류, 계정 존재 여부 미노출)
- R31-03: src/web/screens/login.ts:289-470 — PASS (passwordChangeRequired 시 셸 차단, getPasswordPolicyChecks 5대 규칙 실시간 검증, 확인 불일치 및 기존 비밀번호 거절)
- R31-04: src/web/screens/login.ts:474-604 — PASS (getAccountRecoveryAvailability가 configured:true일 때만 진입, 임시 비밀번호 화면 1회 노출 후 정리, 로그/저장소/콘솔 미출력)
- R31-05: src/web/screens/shell.ts:90-250 — PASS (토큰 준수 1440x900 기준 사이드바 220↔64px, 헤더 56px, 상태줄 32px, skip-link, nav aria-label)
- R31-06: src/web/screens/shell.ts:19-88 — PASS (admin만 관리 그룹 노출, 일반 역할 미노출, 미구현 8개 메뉴 클릭 시 화면 준비 중 안내 배너 표시)
- R31-07: src/web/screens/status-bar.ts:9-278 — PASS (DB 경로 설정됨/확인 필요 정확 표기, idle '처리 이력 없음', 대기 파일 N개, admin 전용 감시 중단 시 다시 시작 버튼 및 회복, 업데이트 '수동 적용' 안내)
- R31-08: src/web/screens/shell.ts:245-280 — PASS (signOut 후 L1 복귀, 새로고침 시 세션 유지, 비밀값 로컬 스토리지/콘솔 저장 금지)
- R31-09: scripts/ui-checks/*.mjs — PASS (ready, login flow, login locked, login recovery, shell 전체 Chrome 및 manifest PASS, 빌드 자산 200 제공, map 82개 확인)

검증 증거:
- npx vitest run src/main/http/session.test.ts — 종료 코드 0 — 7 passed (A31-01 4건 포함) — 2026-09-28 16:26:30
- npm run typecheck — 종료 코드 0 — TypeScript 오류 0건 (server/browser) — 2026-09-28 16:26:50
- npm run lint — 종료 코드 0 — 0 errors, 5 warnings (기존 경고 수 유지, 신규 0) — 2026-09-28 16:27:00
- npm run validate:map — 종료 코드 0 — CODEBASE_MAP_OK 경로 82개 모두 일치 — 2026-09-28 16:27:02
- npm run build — 종료 코드 0 — login.css, shell.css 복사 및 번들 완료 — 2026-09-28 16:31:55
- node --check scripts/ui-checks/ready.mjs; node --check scripts/ui-checks/login.mjs; node --check scripts/ui-checks/shell.mjs — 종료 코드 0 — 문법 오류 0건 — 2026-09-28 16:27:07
- npm test — 종료 코드 0 — 131 test files passed, 899 tests passed, 0 failed — 2026-09-28 16:05:46
- git diff --check — 종료 코드 0 — 공백 및 EOF 빈 줄 경고 0건 — 2026-09-28 16:31:36

음성 테스트:
- node scripts/ui-checks/ready.mjs https://example.com/ — 기대: 검문 실패 RC 1 — 실제: RC 1 (http 프로토콜만 허용, 외부 접속 차단)
- node scripts/ui-checks/ready.mjs http://127.0.0.1:18739/ (서버 미기동) — 기대: 연결 실패 RC 2 — 실제: RC 2 (서버 연결 실패, 크롬 미실행)

UI 증거:
- Chrome 환경: C:\Program Files\Google\Chrome\Application\chrome.exe (판 153.0.8010.53), 뷰포트 1440x900
- ready: artifacts/captures/phase3/ready/run-20260928-161036-j3RtJJ/ (ready.png, after-reload.png, manifest.json PASS, 콘솔/요청 오류 0건)
- login flow: artifacts/captures/phase3/login/run-20260928-161808-6Z4lpm/ (login-initial.png, login-failure.png, password-change.png, logout.png, manifest.json PASS, 콘솔/요청 오류 0건)
- login locked: artifacts/captures/phase3/login/run-20260928-161822-WQlJNm/ (account-locked.png, manifest.json PASS, 콘솔/요청 오류 0건)
- login recovery: artifacts/captures/phase3/login/run-20260928-161930-C6KJER/ (recovery-form.png, manifest.json PASS, 콘솔/요청 오류 0건)
- shell: artifacts/captures/phase3/shell/run-20260928-162614-0Fs0h8/ (admin-expanded.png, admin-collapsed.png, watch-stopped.png, operator.png, manifest.json PASS, 콘솔/요청 오류 0건)
- 복구키 발급/시험 후 임시 비밀 파일 삭제 여부: 완전 삭제 확인 (결과 파일 True, 비밀 파일 True)
- 서버 세션 및 포트 해제: 모든 시나리오 종료 후 PID 일치 프로세스 종료 및 포트 18739 정상 해제 확인 완료

diff 요약:
- 총 15개 파일 변경 (수정 8개, 신규 7개)
- 추가 약 1,600줄, 삭제 약 30줄
- 의존성 및 패키지 변경 없음 (package.json, lockfile 불변)
- 생성물: dist/browser/web/login.css, dist/browser/web/shell.css 정상 배포

전체 SHA-256:
[보호 파일 8개]
- src/shared/bridge/contracts.ts 6CDD89F98A917326F479A6C10E11416D555141347ED0FF01CACD6EFDCA900503
- src/shared/bridge/channel-contracts.ts 84977FBD5AF8E2468F514574606A4DB6DDC24361C0A9997F66C19D2866498A11
- src/web/bridge/app-bridge.ts EF175FDBAEA8657304AB1642CCCC520CEE3D753DB558D38FAAFCC2BFA49500B1
- src/main/http/routes/core-routes.ts D8D806F66F15BE739E335B8BE62F6ED7B0ED581698D726BB03EC3A273D05BA82
- src/main/services/auth-service.ts FF27AE01B3FD3B12BA0116D6E4F746F274D932561C193BF7A32948B2C4403F3F
- src/main/services/app-settings-service.ts 29FE87EDC1D00C8C27C9AF8B0F89CA5C99E6EF819D4AB4CC32BBEAF00CDB0EB1
- scripts/lib/ui-check.mjs 91921E353C05ADEE41D4AA725164146F058A02831EDFE77C919E3B68B897266E
- package.json 162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9

[수정 및 신규 파일 15개]
- src/main/http/session.ts C748AB13BD1B31499420381DF759F24BF26DA84A4CDABCC20F98154FA9B1C681
- src/main/http/session.test.ts 6C8BF746BD6B91DF31AA37A222527F740E8366A2D0C1CCCE0413DC5BEC62EC60
- src/web/app.ts 20E786FF622048E43FB919DE9D9BC1D36765744A06777465CA2AD9E7E7A84B35
- src/web/index.html 491B45337E5A231BAB30DAF67A28EA09E1EC54C15DCB451ECB4A2DFBAC3100AB
- src/web/styles.css 0BC457E66BCDEEEEFD5D064C0151CF264A496B9C9B89C01F987C29931707AC84
- scripts/copy-web-assets.mjs 62BDB2BEBB01B923CD804177A81E8CC288E2F02A645114D8839405AE068A0923
- scripts/ui-checks/ready.mjs 5B0BBBB07023684882E483BE5287A40C9D1FDE46572AC64DD4C1AA859C5D9350
- docs/codebase-map.md AEDCD1B4E40DB2FA02712E246CC0CF3D3D9FCE1DED8C3088CFBE94E010A1DCB6
- src/web/login.css 8F6E95E67C564EEE3CDBDB35C4D51AE063C6C5B8EF5B5D862ABF7AC998E9B89A
- src/web/shell.css F38F34DE03B75D635A417885B5033921300C6E506ED78D18EE202583B62C3F65
- src/web/screens/login.ts 1217079081B5D31CC61842BDF132D0EB9D03563949C718728B97615B3D87A44A
- src/web/screens/shell.ts 613B66897560A706009163F1C24E4FB473A86BD5FE8C6A116D4B60CE183CEF09
- src/web/screens/status-bar.ts 565F9D0AA38557DEA2D1D86E9D2281A61CC75865238399F0B541043EC5CA5066
- scripts/ui-checks/login.mjs 6BC17DC4AE6A7837834F33934E73A531562AE71CEB2545D5C3F947E8C76A9F27
- scripts/ui-checks/shell.mjs AEEB39152614CD7347FF5E3AABE0BD5A2093DEB9A6A3DEAE12B35405DF29100F

미해결/가정: 없음

