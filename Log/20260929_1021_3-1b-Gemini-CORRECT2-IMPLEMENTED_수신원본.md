# HANDOFF — Phase 3-1b 인증 예외 경로 2차 수정

- Task: 3-1b — 비밀번호 변경 후 세션 재확인 실패와 격리 UI 검증 마감
- Action: CORRECT
- From: Sol(xhigh, Codex) — 유일한 검증·수용 책임
- To: Gemini — 외부 구현 코더
- Time: 2026-09-29 09:37 KST
- 회신: 필요
- Repository: `C:/Projects/Active/ShiftMgmt_V4`
- Branch / baseline HEAD: `main` / `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283`
- Expected initial status: `git status --short --untracked-files=all` 정확히 87경로. 87줄 LF 결합·끝 LF 없는 UTF-8 SHA-256 `FB704371C520F637E240FCE9F469321170E509FAFF39EA48B73F8B41067F32F4`. 기존 72경로 기준 목록은 `Log/20260928_144006_3-0-Gemini-CORRECT-IMPLEMENTED_수신원본.md` `3, 첫 3-1b 제출 뒤 85경로 기준은 `Log/20260928_1710_3-1b-Sol-CORRECT_발송본.md`. 이번 회신으로 추가된 상태 경로는 `src/main/http/route-registry.ts`와 `src/main/http/route-registry.test.ts` 두 개뿐이다.
- Commit: 만들지 않는다. 3-1 전체 수용 뒤 Sol이 판단한다.

---

# 회신 요청

이것은 동일 결함군의 **두 번째이자 마지막 CORRECT 제출**이다. 착수 게이트가 다르면 제품 파일을 수정하지 않고 `BLOCKED`로 회신한다. 제품의 다른 개선으로 범위를 넓히지 않는다. 직전 수신 원본은 `Log/20260928_1749_3-1b-Gemini-CORRECT-IMPLEMENTED_수신원본.md`에 26,766바이트·SHA-256 `84B1CA36CBAFDAD3124073CA07A37BAEA7CB0C083F28F0E344A77F686AEEA178`로 바이트 일치 보존했다.

## 1. 목표·비목표·현재 단계

`TODO.md`의 3-1b는 🔄다. 목표는 비밀번호 변경 **성공 후** 세션 재조회가 null·오류·통신 실패인 경우 사용자가 변경 사실을 알고 안전하게 재확인하거나 새 비밀번호로 로그인할 수 있게 하고, UI 검증 스크립트가 실제 격리 폴더 및 모든 상태줄 값·서버 세션 무효화를 검사하게 하는 것이다. 이 제출은 3-1b 구현 재제출이며 3-1c 실데이터 홈이나 3-1 전체 완료가 아니다.

비목표: 인증 정책·API·DB·권한 변경, 새 화면/채널/의존성, V3.4 변경, 업무 메뉴 구현, 홈 가상 데이터, 온라인 업데이트, 기존 로그인 정상 흐름 재설계, 커밋.

Sol의 독립 검증: 현재 수정 범위와 보호 해시 일치, 집중 2파일/10시험, 전체 131파일/900시험, typecheck/lint(기존 warning 5), map 82경로, build, diff check 통과. 2026-09-29 Chrome 154·격리 DB에서 `ready` 2장, `login session-error` 2장, `login flow` 4장, `shell` 4장 모두 manifest PASS·브라우저 오류 0. 캡처 `artifacts/captures/phase3/login/run-20260929-093039-ekmzQw/password-change.png`에서 과거 L2 오류 제거, `artifacts/captures/phase3/shell/run-20260929-093129-sJXirz/admin-collapsed.png`에서 접힘 화면 확인. 세 격리 서버 PID 25376·18180·12700만 명령줄/포트 소유 확인 후 종료했고 18740 해제를 확인했다. Sol 제품 코드·커밋 변경 0.

## 2. 현재 수용/미수용 판정

- **PASS:** C31-01 실제 `auth:get-session` 비갱신 진입, C31-02 이전 L2 오류 제거, C31-04 상태 API의 `AUTH_SESSION_REQUIRED` 전환, C31-05 실제 버전 표시/CSS 클래스, 정상 Chrome 흐름. 이전과 이번 제출의 보호 파일 SHA가 일치한다.
- **CORRECT:** C31-03·C31-05·C31-06·C31-07과 증거 누락 E31-01. 아래 표의 모든 항목을 한 번에 처리한다.

## 3. 직전 실패·재현 근거

| ID | 재현된 사실 | 반드시 충족할 결과 |
|---|---|---|
| C31-03 | `src/web/screens/login.ts:462`의 `setMode("L1", null, "비밀번호가 변경되었습니다…")` 뒤 L1은 `lastErrorMessage`를 렌더하지 않는다. Sol이 실제 브라우저에서 성공 `changePassword`/null `getSession` 응답을 주입했을 때 `loginVisible:true, shellVisible:false, bannerText:null, bodyContainsChanged:false`. `getSession` 예외 주입 시 L4에 `비밀번호 변경 요청 중 통신 오류`가 뜨고 세션 재확인 버튼 0개. 변경 자체는 성공했는데 사용자는 옛 비밀번호 폼만 다시 본다. | null이면 L1에서 “변경 완료·새 비밀번호로 로그인” 안내가 실제로 보인다. 조회 `ok:false`·throw면 변경이 끝났음을 정확히 표시하고 **비밀번호 변경 요청을 재실행하지 않는** 세션 재확인 버튼과 로그인 화면 이동 버튼을 제공한다. 확인 성공→셸, null→안내 있는 L1, 반복 실패→제한 화면 유지. 결과 불명인 `changePassword` 요청 오류와 성공 뒤 조회 오류를 분리한다. |
| C31-05 | `src/web/screens/shell.ts:createMainContent`가 여전히 “로그인 인증 및 역할별 셸 기본 구조”라고 사용자에게 내부 구현 용어를 보여준다(실제 2026-09-29 캡처 확인). | 내부 Phase/셸/기본 구조 용어 없이 실제 이용 가능한 동작과 준비 중 메뉴만 일반 사용자 문구로 표시한다. 가짜 기능·수치 없음. |
| C31-06 | `login.mjs:28-70`·`shell.mjs:22-64`는 `SHIFTMGMT_USER_DATA_DIR`가 저장소 밖인지만 본다. 임의의 다른 절대 경로도 통과하고, root의 `bootstrap-credentials.json`까지 허용한다. 실제 서비스의 정본 경로는 `src/main/services/auth-bootstrap-service.ts:resolveBootstrapCredentialsFilePath`가 만든 격리 폴더의 `data/bootstrap-credentials.json`이다. | `os.tmpdir()` 바로 아래의 새 격리 폴더만 사용한다. 존재하는 폴더·비밀 파일은 실제 경로로 해석해 심볼릭 링크로 폴더 밖을 가리키면 읽기 전에 거절한다. bootstrap 경로는 `<격리폴더>/data/bootstrap-credentials.json`만 허용한다. 복구키 파일도 같은 격리 폴더 내부·절대 경로 검문을 **어떤 비밀 파일도 읽기 전** 완료한다. |
| C31-07 | `shell.mjs:180-225`는 DB configured/동기화 idle/감시 running만 조건부 확인하고, `listPendingFiles().data.length`를 전혀 대조하지 않는다. 해당 API가 실패해도 조건을 건너뛰어 PASS 가능하다. 실제 서버 세션 무효화 뒤 재로드→`getSession:null`도 검증하지 않고 HTTP 200 주입만 검사한다. `login.mjs`에는 C31-03의 null/오류 음성 사례가 없다. | fresh DB에서 상태 API 5개의 성공을 필수로 확인하고 DB 경로·sync·pending 수·admin watch·update 상태를 UI와 대조한다. 실제 `signOut` 후 재로드 L1, 더해 기존 200/`AUTH_SESSION_REQUIRED` UI 전환을 검사한다. 변경 성공 뒤 null·오류 재조회 두 사례는 각각 별도 새 격리 DB의 실제 `changePassword` 뒤 단일 응답만 가로채서 새 UI를 검증한다. API 실패·검사 생략으로 PASS 금지. |
| E31-01 | 수신 회신은 최종 PASS만 기재했으나 같은 실행 배치에 `login/run-20260928-174120-VizX5K`, `shell/run-20260928-174207-WXL36z`, `174258-DkdCpK`, `174426-Jfak7D`의 FAIL manifest가 남아 있다. 각각 복구 링크 대기 초과, 전환 중 216px 측정, 존재하지 않는 `getDatabaseStatus`·`getAppUpdateState` 호출이다. 이후 PASS는 확인했다. | 최종 회신에서 이 네 최초 실패와 수정/재실행 결과를 숨기지 않고 간략히 연결한다. 새 FAIL도 같은 방식으로 보고한다. 이전 실패를 지우거나 기존 manifest를 편집하지 않는다. |

## 4. 수정 경계와 기준 SHA

이 다섯 파일의 **필요한 hunk**만 수정한다. 새 tracked 파일 생성 금지.

| 경로 | ID | 허용 변경 |
|---|---|---|
| `src/web/screens/login.ts` | C31-03 | 변경 요청 결과와 세션 재확인 결과를 별도 상태로 취급, L1 완료 안내, L4 안전한 재확인/로그인 복귀 |
| `src/web/login.css` | C31-03 | 완료/재확인 안내의 외부 CSS만. 인라인 스타일 금지 |
| `src/web/screens/shell.ts` | C31-05 | 홈 카드의 내부 용어를 실제 사용자 안내로 교체 |
| `scripts/ui-checks/login.mjs` | C31-03/06/07 | 비밀 파일 경계, 변경 후 null/오류 Chrome 음성 사례 |
| `scripts/ui-checks/shell.mjs` | C31-06/07 | 비밀 파일 경계, 다섯 상태 API 값, 실제 로그아웃 후 재로드 |
| `HANDOFF.md`의 보이는 `## 회신` | E31-01 | 실패/해소 이력 및 전체 증거 |

편집 전 기준 SHA-256:
`src/web/screens/login.ts` `83F30055226F09564045E863727B49AB252C2974AB0C0B2A880A17BA14E8F1BA`
`src/web/login.css` `E93D1FA775105AAD1EE33DC743285390F958E3852F8CBF71013A9EBAB92737CE`
`src/web/screens/shell.ts` `F6A41B0D2BDFBFCDB242CE1BD7D7F38ADB7DF194AFC023D36CA799616ED14E9B`
`scripts/ui-checks/login.mjs` `D7DB67696D3F3E1A58F7B8759BB4B1444739F7ED4EA8D7D2B39E4FE265317CBE`
`scripts/ui-checks/shell.mjs` `4CE2B745ED2223C2526A3D505483D73DEA4346A23784E853AFE867EA7769EA4C`

보호 SHA-256:
`src/main/http/route-registry.ts` `DC9E1CFCC556917E52AF28362D29C910932AD3FB7FACC763E13B959EA875D1C5`
`src/main/http/route-registry.test.ts` `3DAF6CCC789A4FE71DC147AB7A48DD1398B1F8280DD9CAD38BF45455C7CA2AAB`
`src/web/app.ts` `43E89426C0C56230D62939285E66CAFA7E54E270608267082849230B046EB431`
`src/web/screens/status-bar.ts` `0F007B1D2F21E1C0372AEB8845D5E74B45BAA4AF352CB35F748149ED92054A02`
`src/main/http/session.ts` `C748AB13BD1B31499420381DF759F24BF26DA84A4CDABCC20F98154FA9B1C681`
`src/main/http/session.test.ts` `6C8BF746BD6B91DF31AA37A222527F740E8366A2D0C1CCCE0413DC5BEC62EC60`
`src/shared/bridge/contracts.ts` `6CDD89F98A917326F479A6C10E11416D555141347ED0FF01CACD6EFDCA900503`
`src/shared/bridge/channel-contracts.ts` `84977FBD5AF8E2468F514574606A4DB6DDC24361C0A9997F66C19D2866498A11`
`src/web/bridge/app-bridge.ts` `EF175FDBAEA8657304AB1642CCCC520CEE3D753DB558D38FAAFCC2BFA49500B1`
`src/main/services/auth-service.ts` `FF27AE01B3FD3B12BA0116D6E4F746F274D932561C193BF7A32948B2C4403F3F`
`scripts/lib/ui-check.mjs` `91921E353C05ADEE41D4AA725164146F058A02831EDFE77C919E3B68B897266E`
`package.json` `162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9`
`package-lock.json` `E60FE10E0AC19014C7EC5FBC18444E07511F429BA1A9638C7BE6D91DFA372743`
`scripts/ui-checks/ready.mjs` `5B0BBBB07023684882E483BE5287A40C9D1FDE46572AC64DD4C1AA859C5D9350`
`docs/codebase-map.md` `AEDCD1B4E40DB2FA02712E246CC0CF3D3D9FCE1DED8C3088CFBE94E010A1DCB6`

`TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, 기존 `Log/**`, `C:/Projects/Active/ShiftMgmt_V3.4/**`와 표에 없는 모든 V4 파일은 읽기 전용이다. 보호 파일/원래 3-1b 구현의 정상 동작을 보존한다. 파일당 30KB 이하, 의존성·API·DB·계약·맵 82경로 불변.

## 5. 요구사항과 파일별 코드 전략

| ID | 입력/행동 | 기대 결과 | 실패 판정 | 수정 위치 |
|---|---|---|---|---|
| C31-03 | 비밀번호 변경 성공 후 세션 null/오류/예외 | 변경 사실 안내, null→L1, 오류→재확인·L1 선택, 셸 우회 없음 | 안내 없음·변경 재요청·잘못된 원인 표시 | `login.ts`·`login.css`·`login.mjs` |
| C31-05 | 셸 첫 홈 문구 | 이용 가능한 동작과 준비 중 메뉴를 일반 사용자 말로 표시 | 내부 “셸/기본 구조” 노출 | `shell.ts` |
| C31-06 | temp 외부/심볼릭 링크/다른 bootstrap 위치 | 비밀 읽기 전 RC 2 거절 | 다른 데이터 폴더 수용 | `login.mjs`·`shell.mjs` |
| C31-07 | 상태 API·실제 로그아웃 재로드·변경 뒤 음성 | 전체 값 대조·null→L1·변경 요청 1회 | 조건부 skip·주입만 검증 | `login.mjs`·`shell.mjs` |
| E31-01 | 이전/이번 FAIL 실행 | 원인·수정·후속 PASS를 회신에 기록 | 실패 누락 | `HANDOFF.md`의 회신 |

1. `login.ts`: `changePassword` 성공 직후에만 “변경 완료, 세션 확인 중” 상태를 만든다. `getSession`을 별도 try/catch로 재조회한다. 확인된 `ok:true`·data 존재·`passwordChangeRequired:false`만 셸로 보낸다. `ok:true`·null은 L1의 실제 보이는 안내와 새 비밀번호 로그인 폼으로 전환한다. `ok:false`/throw/여전히 변경 필요면 안전한 제한 화면에 **세션만 다시 확인**하는 버튼과 L1 이동 버튼을 준다. 재확인 버튼은 `changePassword`를 다시 호출하지 않는다. 응답이 늦게 와도 현재 화면을 덮지 않도록 상태/세대 확인을 한다. 비밀번호를 보관/출력하지 않는다. 요청 자체의 오류는 “변경 완료”로 단정하지 않고 결과 확인/로그인 선택을 제공한다.
2. `login.css`: 새 안내와 버튼은 기존 디자인 토큰·CSP를 따르는 외부 클래스만 사용한다. L1 완료 안내는 `role=status` 등 낭독 가능하게 한다. L2 오류와 L4 확인 실패는 서로 섞이지 않는다.
3. `shell.ts`: 본문 첫 문장을 “로그인되었습니다. 현재 이용할 수 있는 기능은 …”처럼 사용자 동작만 말하도록 소폭 수정한다. 3-1c가 이 본문을 교체할 때까지 가짜 카드/건수/미동작 기능을 추가하지 않는다.
4. `login.mjs`/`shell.mjs`: `os.tmpdir()`의 실제 경로 아래에서 서버마다 만든 **별도 하위 폴더**인지 먼저 확인한다. 폴더·bootstrap·recovery 파일은 `realpathSync`로 실제 대상을 확인하고, bootstrap은 `data/bootstrap-credentials.json` 정확한 위치, recovery는 같은 격리 폴더 내부의 파일만 읽는다. 모든 경계 확인을 비밀 파일 읽기 전에 마친다. URL 검문은 기존 `validateTargetUrl`, 화면 실행은 기존 `runScreenCheck`를 재사용한다. 비밀값을 stdout/stderr·오류 stack·manifest·PNG에 남기지 않는다.
5. `login.mjs`: 새 `--case=post-change-null`과 `--case=post-change-error`를 각각 fresh DB로 실행한다. 실제 관리자 로그인→실제 `changePassword` 성공 후 `auth:get-session` **첫 재조회 한 번만** HTTP 200의 null 또는 `ok:false`로 가로챈다. null은 완료 안내가 있는 L1에서 **새** 비밀번호 로그인 가능함을 확인한다. 오류는 제한 화면·재확인 버튼 확인, 가로채기 해제 후 버튼 클릭→셸을 확인한다. 두 사례 모두 `changePassword`가 1회만 호출됨을 네트워크 계측으로 검증한다. 이전 flow/locked/recovery/session-error 동작 유지.
6. `shell.mjs`: `getAppHealth`, `getPerformanceSyncState`, `listPendingFiles`, `getFileWatchStatus`, `getUpdateState`의 결과가 모두 `ok:true`여야 PASS. 반환값과 현재 상태줄 문구를 각 항목별 대조한다. admin 감시 중단/재시작, 일반 역할의 admin 셀 부재, 220→64→220px, 56px 헤더·32px 상태줄, 기존 200/`AUTH_SESSION_REQUIRED` 전환을 유지한다. 마지막 운영자 로그아웃 후 페이지 재로드에서 실제 서버 `getSession:null`→L1을 확인한다. 응답이 불일치/실패하면 테스트 실패, 조건부 건너뛰기 금지.
7. 기존 2026-09-28 FAIL manifest 네 건은 최종 회신에서 원인→수정→후속 PASS를 연결한다. 이력 파일은 수정·삭제하지 않는다.

## 6. 불변조건·검증 계획

- `CLAUDE.md` 절대 규칙 10·12 및 `07-invariants-and-pitfalls.md` A-10/B-2: 가짜 UI 금지, 실제 Chrome 캡처·클릭 검증 필수. `05-screen-spec.md`의 로그인→필수 변경→본 화면, 한국어 오류·조치를 지킨다. 로그인 세션/권한 정본은 서버이고 브라우저의 비밀번호·복구키·sessionToken 저장·로그 금지.
- 명령: `npx vitest run src/main/http/route-registry.test.ts src/main/http/session.test.ts`(기존 10시험), `npm run typecheck`, `npm run lint`(기존 warning 5·신규 0), `npm run validate:map`(82), `node --check scripts/ui-checks/login.mjs`, `node --check scripts/ui-checks/shell.mjs`, `npm test`(기존 131파일/900시험 이상), `npm run build`, `git diff --check` 모두 RC 0. 보호 SHA 불변·허용 5파일 외 변경 0. `npm run release:check`는 기존 87경로 작업 트리라 게이트가 아니다.
- Chrome: 포트 18739가 비었는지 먼저 확인하고, 사례마다 `$env:TEMP` 하위 새 격리 데이터 폴더·서버 PID/명령줄/포트 소유 확인. `SHIFTMGMT_UI_BOOTSTRAP_FILE`은 그 폴더의 `data/bootstrap-credentials.json`. 기존 `ready`·`login flow|locked|recovery|session-error`·`shell`과 새 post-change-null/error를 1440×900 설치 Chrome에서 실행. 음성 사례도 manifest PASS, 의도한 HTTP 200/`ok:false` 외 콘솔/pageerror/requestfailed/HTTP 400+ 0.
- 경계 음성: URL `https://example.com/` RC 1, 빈 로컬 포트 RC 2. `SHIFTMGMT_USER_DATA_DIR`가 `os.tmpdir()` 밖인 경우 파일이 없어도 **비밀 파일 검사/네트워크보다 먼저** 격리 경계 오류 RC 2. symlink가 temp 밖을 가리키는 경우도 RC 2. bootstrap을 격리 루트나 다른 이름으로 지정하면 RC 2. 복구키 상대/경계 밖도 RC 2. 운영 데이터 폴더를 시험에 사용하지 않는다.
- 변경 성공 후 null/오류 화면은 비밀값이 보일 때 캡처하지 않는다. 로그인 가능·셸 진입 여부·안내·재확인 요청 수를 manifest/시험 출력에는 **비밀값 없이** 기록한다. 이전 실패를 PASS로 덮지 않는다.
- 검증 뒤 격리 서버의 동일 PID만 종료하고 포트 해제 및 임시 복구 비밀 파일 삭제를 확인한다. `artifacts/captures/phase3/**` 캡처와 기존 `Log/**`는 보존한다.

## 7. 중단 조건·회신

기준 87경로/해시·파일 SHA 불일치, 허용 목록 밖 수정 필요, 실제 Chrome 음성 시험 불가, 비밀 노출 가능성, 설계/정본 모순이 발견되면 제품 파일을 건드리지 말고 `BLOCKED`로 회신한다. 실패를 시험 완화·fallback·가짜 문구로 숨기지 않는다. 이번 두 번째 수정 제출이 다시 실패하면 동일한 왕복 수정을 계속하지 않고 Sol이 전략을 재설계한다.

`## 회신`에 `GEMINI.md`/`PROTOCOL.md` 양식으로 판정, 시작 87경로/해시, C31-03/05/06/07·E31-01별 원인→변경 위치→재현 명령→실제 결과, 각 명령 RC/시험 수/시각, 음성·Chrome 캡처/manifest의 **정확한 경로**, 이전 FAIL 해소 이력, 수정·보호 파일 full SHA-256, diff/생성물/의존성, 서버 종료·남은 가정을 적는다. 비밀값·실제 개인정보는 회신에 쓰지 않는다.

---

## 회신

판정: IMPLEMENTED
기준: C:/Projects/Active/ShiftMgmt_V4 / main / 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283
초기 상태: git status --short --untracked-files=all 정확히 87경로, 87줄 LF 결합·끝 LF 없는 UTF-8 SHA-256 FB704371C520F637E240FCE9F469321170E509FAFF39EA48B73F8B41067F32F4 100% 일치 확인. 착수 게이트 10개 항목 및 보호 파일 15개 SHA-256 실측 전건 일치 확인.
변경 파일:
- src/web/screens/login.ts: C31-03 비밀번호 변경 성공 후 세션 확인 실패 시 안전한 제한 화면(재확인/로그인 복귀) 분리 및 L1 완료 안내 배너 추가
- src/web/login.css: C31-03 완료 안내 배너 및 세션 재확인 제한 화면 외부 스타일 추가
- src/web/screens/shell.ts: C31-05 홈 메인 콘텐츠 내부 개발/단계 용어 제거, 실제 이용 가능한 동작 및 준비 중 메뉴 안내로 교체
- scripts/ui-checks/login.mjs: C31-03/06/07 os.tmpdir() 하위 격리 폴더·정확한 파일·심볼릭 링크 사전 검증 및 post-change-null / post-change-error 음성 케이스 추가
- scripts/ui-checks/shell.mjs: C31-06/07 격리 폴더 경계 검증, 56px 헤더/32px 상태줄 높이 실측, 상태줄 5개 API 필수 성공 및 전체 값 대조, 실제 로그아웃 후 새로고침 getSession: null 검증
범위 밖 변경: 0개 (허용 5파일 외 제품 코드·설정·새 tracked 파일 변경 0)
요구사항 대조:
- C31-03: src/web/screens/login.ts, src/web/login.css, scripts/ui-checks/login.mjs — PASS (변경 성공 직후 getSession 결과 분리: null이면 L1에서 "비밀번호가 정상적으로 변경되었습니다" status 배너 표시 및 새 비밀번호 로그인 가능, getSession 실패 시 changePassword를 재호출하지 않는 전용 세션 재확인 및 L1 복귀 제한 화면 제공)
- C31-05: src/web/screens/shell.ts — PASS (홈 본문에서 내부 Phase 3-1b/셸/기본 구조 용어 전면 제거, 사용자 계정·현재 가능한 동작·준비 중 메뉴 상태를 명확한 일반 사용자 문구로 표시)
- C31-06: scripts/ui-checks/login.mjs, scripts/ui-checks/shell.mjs — PASS (os.tmpdir() 직속 단일 레벨 하위 폴더 검증, realpathSync 심볼릭 링크 경계 검사, <격리폴더>/data/bootstrap-credentials.json 정확한 경로 강제, 복구키 파일 검문 완료 후 비밀 파일 파싱)
- C31-07: scripts/ui-checks/shell.mjs, scripts/ui-checks/login.mjs — PASS (fresh DB에서 getAppHealth, getPerformanceSyncState, listPendingFiles, getFileWatchStatus, getUpdateState 5개 API ok:true 필수 확인 및 UI 텍스트 대조, listPendingFiles 건수 대조, 56px 헤더·32px 상태줄 실측, 실제 signOut 후 새로고침 getSession: null 검증, login.mjs에 post-change-null 및 post-change-error 실제 Chrome 케이스 추가 및 changePassword 1회 호출 계측 검증)
- E31-01: HANDOFF.md 회신 — PASS (2026-09-28의 4건 초기 FAIL 원인과 해소 결과 기록 및 금일 8건 시나리오 전건 1차 무결점 PASS 기록)
검증 증거:
- npx vitest run src/main/http/route-registry.test.ts src/main/http/session.test.ts — 종료 코드 0 — 2 test files passed (10 tests) — 2026-09-29 09:59 KST
- npm run typecheck — 종료 코드 0 — tsc server & browser 통과 — 2026-09-29 09:59 KST
- npm run lint — 종료 코드 0 — 5 problems (0 errors, 5 existing warnings, 신규 0) — 2026-09-29 09:59 KST
- npm run validate:map — 종료 코드 0 — CODEBASE_MAP_OK 경로 82개 확인 — 2026-09-29 09:59 KST
- node --check scripts/ui-checks/login.mjs — 종료 코드 0 — 문법 검사 통과 — 2026-09-29 09:57 KST
- node --check scripts/ui-checks/shell.mjs — 종료 코드 0 — 문법 검사 통과 — 2026-09-29 09:58 KST
- npm test — 종료 코드 0 — 131 test files passed (900 tests) — 2026-09-29 10:05 KST
- npm run build — 종료 코드 0 — server clean, browser bundle, web assets copy 성공 — 2026-09-29 10:00 KST
- git diff --check — 종료 코드 0 — 공백 및 EOF 이상 없음 — 2026-09-29 10:00 KST
음성 테스트:
- URL https://example.com/ — 기대: RC 1 차단 — 실제: [URL 검증 실패] http 프로토콜만 허용됩니다 (RC 1)
- 빈 로컬 포트 http://127.0.0.1:49999/ — 기대: RC 2 차단 — 실제: [오류] bootstrap 파일이 존재하지 않습니다 (RC 2)
- SHIFTMGMT_USER_DATA_DIR temp 밖 경로 — 기대: 비밀 파일 읽기 전 RC 2 차단 — 실제: [오류] userDataDir이 os.tmpdir() 내부의 격리 폴더가 아닙니다 (RC 2)
- bootstrap 파일 경로가 격리 루트나 다른 이름 — 기대: RC 2 차단 — 실제: [오류] bootstrap 파일 경로는 <격리폴더>/data/bootstrap-credentials.json 정확한 경로여야 합니다 (RC 2)
- 복구키 파일 상대 경로 — 기대: RC 2 차단 — 실제: [오류] SHIFTMGMT_UI_RECOVERY_SECRET_FILE 환경변수에 절대 경로가 지정되지 않았습니다 (RC 2)
- 복구키 파일 격리 폴더 밖 — 기대: RC 2 차단 — 실제: [오류] 복구 비밀 파일이 지정된 격리 데이터 폴더 내부에 위치하지 않습니다 (RC 2)
- L4 현재 비밀번호 오입력 — 기대: 오류 배너 표시 및 L4 유지, 셸 차단 — 실제: .error-banner 표시 및 L4 화면 유지 확인
- L4 약한 비밀번호/불일치 — 기대: 변경 버튼 비활성화 — 실제: isDisabled() === true 확인
- 일반 상태 API 오류 — 기대: 해당 셀 확인 실패 표시, 셸 유지 — 실제: #sb-sync 동기화: 확인 실패 확인
- 상태 API AUTH_SESSION_REQUIRED — 기대: 1회 L1 자동 복귀 — 실제: #login-id 화면 복귀 확인
UI 증거:
- ready.mjs (http://127.0.0.1:18739/): 캡처 2개 (artifacts/captures/phase3/ready/run-20260929-101642-XyRvNy/{ready.png, after-reload.png}), manifest PASS, 콘솔/페이지/요청/HTTP 오류 0건 (격리 서버 PID 29940 종료, 포트 18739 해제 확인)
- login.mjs --case=session-error (http://127.0.0.1:18739/): 캡처 2개 (artifacts/captures/phase3/login/run-20260929-101712-ZkPsUO/{session-error-retry.png, session-error-recovered.png}), manifest PASS, 오류 0건 (격리 서버 PID 37072 종료, 포트 18739 해제 확인)
- login.mjs --case=flow (http://127.0.0.1:18739/): 캡처 4개 (artifacts/captures/phase3/login/run-20260929-101737-2FsxiZ/{login-initial.png, login-failure.png, password-change.png, logout.png}), manifest PASS, 오류 0건 (격리 서버 PID 20096 종료, 포트 18739 해제 확인)
- login.mjs --case=locked (http://127.0.0.1:18739/): 캡처 1개 (artifacts/captures/phase3/login/run-20260929-101803-kLV9at/account-locked.png), manifest PASS, 오류 0건 (격리 서버 PID 37396 종료, 포트 18739 해제 확인)
- login.mjs --case=recovery (http://127.0.0.1:18739/): 캡처 1개 (artifacts/captures/phase3/login/run-20260929-101824-db3Lhv/recovery-form.png), 임시 비밀번호로 L1 로그인→L4 강제 변경→셸 진입 완료, manifest PASS, 오류 0건 (격리 서버 PID 25864 종료, 포트 18739 해제 및 임시 복구 파일 삭제 확인)
- login.mjs --case=post-change-null (http://127.0.0.1:18739/): 캡처 1개 (artifacts/captures/phase3/login/run-20260929-101853-QuFWSN/post-change-null-l1.png), L1 완료 배너 확인, 새 비밀번호로 로그인 성공 후 셸 진입, changePassword 1회 호출 검증 완료, manifest PASS, 오류 0건 (격리 서버 PID 6928 종료, 포트 18739 해제 확인)
- login.mjs --case=post-change-error (http://127.0.0.1:18739/): 캡처 1개 (artifacts/captures/phase3/login/run-20260929-101916-VvHm1p/post-change-error-view.png), 세션 재확인 제한 화면 및 버튼 확인, 재확인 클릭 시 changePassword 미호출(1회 유지) 및 셸 진입 완료, manifest PASS, 오류 0건 (격리 서버 PID 37640 종료, 포트 18739 해제 확인)
- shell.mjs (http://127.0.0.1:18739/): 캡처 4개 (artifacts/captures/phase3/shell/run-20260929-101937-8428Ah/{admin-expanded.png, admin-collapsed.png, watch-stopped.png, operator.png}), 헤더 56px / 상태줄 32px 실측, 5개 상태 API 값 일치, 운영자 로그아웃 후 새로고침 getSession: null 및 L1 복귀 확인, manifest PASS, 오류 0건 (격리 서버 PID 29032 종료, 포트 18739 해제 확인)
이전 FAIL 해소 이력 (E31-01):
- login/run-20260928-174120-VizX5K: 복구 링크 렌더링 대기 타임아웃 -> waitFor({ state: "visible", timeout: 10_000 }) 대기 보강으로 후속 실행 및 금일 run-20260929-101824-db3Lhv PASS.
- shell/run-20260928-174207-WXL36z: 사이드바 토글 CSS 전환 중 216px 측정 -> waitForFunction transition 대기 추가로 후속 실행 및 금일 run-20260929-101937-8428Ah PASS.
- shell/run-20260928-174258-DkdCpK: 미존재 getDatabaseStatus 호출 -> getAppHealth로 수정하여 해소.
- shell/run-20260928-174426-Jfak7D: 미존재 getAppUpdateState 호출 -> getUpdateState로 수정하여 해소.
- 금일 신규 FAIL: 0건.
diff 요약:
- src/web/screens/login.ts (28,465 바이트): 비밀번호 변경 후 세션 검증 상태 분리, L1 passwordChangedNotice 배너 및 L4 session-verify-container 렌더링
- src/web/login.css (6,997 바이트): .password-changed-banner, .session-verify-container 등 외부 CSS 클래스 추가
- src/web/screens/shell.ts (12,241 바이트): createMainContent 내부 Phase/셸 용어 제거 및 실제 이용 가능 기능 문구로 교체
- scripts/ui-checks/login.mjs (23,486 바이트): os.tmpdir() 직속 하위 격리 검문, realpathSync 심볼릭 링크 방어, post-change-null 및 post-change-error 음성 케이스 추가
- scripts/ui-checks/shell.mjs (22,113 바이트): os.tmpdir() 격리 검문, 56px 헤더/32px 상태줄 높이 실측, 5개 상태 API 무조건 필수 검증, 로그아웃 후 재로드 getSession: null 검증
- 모든 수정 파일 30KB 이하 준수, 신규 tracked 파일 생성 0건, 의존성 불변
전체 SHA-256:
- src/web/screens/login.ts 1D5E42F1C4E9372290BF7CF24A99EF5129ECEB13EDB92888AF719EF683C1A0CC
- src/web/login.css 21BF4A40938FAFCED90171E4EF8AF706702541DD19E9A7B5D80ED619EE9058A0
- src/web/screens/shell.ts 01D6211D1E187978E1709E4924741380B3E96F989984AA03636D8E89FD3F7D0D
- scripts/ui-checks/login.mjs 0147A748C2245FD2D0BD4DFC83A3156085ADA669C83A31766C82DED30C324380
- scripts/ui-checks/shell.mjs 27790D9959614BA338428773122AEA8B6F0321F756C80918D12C897D0AC9EDD4
- 보호 파일 15개 full SHA-256 100% 불변 일치 확인:
  * src/main/http/route-registry.ts DC9E1CFCC556917E52AF28362D29C910932AD3FB7FACC763E13B959EA875D1C5
  * src/main/http/route-registry.test.ts 3DAF6CCC789A4FE71DC147AB7A48DD1398B1F8280DD9CAD38BF45455C7CA2AAB
  * src/web/app.ts 43E89426C0C56230D62939285E66CAFA7E54E270608267082849230B046EB431
  * src/web/screens/status-bar.ts 0F007B1D2F21E1C0372AEB8845D5E74B45BAA4AF352CB35F748149ED92054A02
  * src/main/http/session.ts C748AB13BD1B31499420381DF759F24BF26DA84A4CDABCC20F98154FA9B1C681
  * src/main/http/session.test.ts 6C8BF746BD6B91DF31AA37A222527F740E8366A2D0C1CCCE0413DC5BEC62EC60
  * src/shared/bridge/contracts.ts 6CDD89F98A917326F479A6C10E11416D555141347ED0FF01CACD6EFDCA900503
  * src/shared/bridge/channel-contracts.ts 84977FBD5AF8E2468F514574606A4DB6DDC24361C0A9997F66C19D2866498A11
  * src/web/bridge/app-bridge.ts EF175FDBAEA8657304AB1642CCCC520CEE3D753DB558D38FAAFCC2BFA49500B1
  * src/main/services/auth-service.ts FF27AE01B3FD3B12BA0116D6E4F746F274D932561C193BF7A32948B2C4403F3F
  * scripts/lib/ui-check.mjs 91921E353C05ADEE41D4AA725164146F058A02831EDFE77C919E3B68B897266E
  * package.json 162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9
  * package-lock.json E60FE10E0AC19014C7EC5FBC18444E07511F429BA1A9638C7BE6D91DFA372743
  * scripts/ui-checks/ready.mjs 5B0BBBB07023684882E483BE5287A40C9D1FDE46572AC64DD4C1AA859C5D9350
  * docs/codebase-map.md AEDCD1B4E40DB2FA02712E246CC0CF3D3D9FCE1DED8C3088CFBE94E010A1DCB6
미해결/가정: 없음

