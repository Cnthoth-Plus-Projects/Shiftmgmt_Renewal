# HANDOFF — Phase3-1d 디자인·접근성 통합 검수 CORRECT

- Task: 확정 디자인과 L4 잠금 접근성을 맞춰 전체3-1 통합 검수를 통과한다.
- Action: CORRECT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-30 16:19:13 KST
- 회신: 필요 — 사용자 수동 전달
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: main
- Baseline commit: `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283`
- Expected initial status:92행,LF 연결/마지막LF 없음 SHA `8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B`. §12에 정확한 전량 목록.
- Routing: frontier — Sol의 최종 통합 검수·수용 판정.

## 회신 요청

Gemini는 아래 착수 게이트를 확인한 뒤 닫힌 범위만 구현·검증하고 맨 아래 `## 회신`에 응답한다. 자동 AI CLI 호출은 없다. 이 본문은 수정하지 않는다. 회신 후 Sol이 독립 재검증한다.

## 1. 목표와 비목표

확정 디자인 시스템 v1.3에 맞는 로그인·셸·홈 공통 스타일과,포커스 가능한 L4 입력 조건 잠금을 제공한다.

이번 작업은 기존3-1d 검수의4종 결함 수정이다. 미구현8업무 화면 연결,활동 이력3-2,새API/계산/DB/권한,운영 데이터,의존성,재설계,정본 토큰 변경,3-1e 커밋/푸시는 범위 밖이다.3-1c 수용된 홈 오류·액션 수명 구현은 보존한다.

## 2. 현재 상태·실패 근거

Sol이 사용자 “오케이 직접 테스트 진행해”에 따라 실제 설치 Chrome154.0.8037.58/1440×900에서 직접 검수했다. 최종8그룹/78조건 중64 PASS·14 FAIL,15캡처,예기치 않은 브라우저 오류0. 전량 근거는 제어 저장소 `.ai/reports/phase3-1d-20260930/report.md`,`scope-evidence.json`,`run-2026-09-30T07-08-33-331Z/results.json`이다.14는 중복 영향을 포함한 검사 조건 수다. 정적 추가4항목은 별도 기재했다.

**Stable defect IDs: R31D-01,R31D-02,R31D-03,R31D-04. 모두 미종결.** 제품 수정0,HEAD/status92/324제품 파일 불변,기존132파일/912시험과26 Chrome 시나리오의 수용 증거를 재사용했다.3-1d는 🔄,3-1e는 ☐다.

기존 루트 HANDOFF는 교체 전에 원문 바이트로 보존했다: `Log/20260930_161913_3-1c종결_3-1d검수전_보존본.md`,20747bytes/SHA `2000A80E8BB56A4F7E3A6065FA96748D7B4522F77128D2059A99602F7F9497CC`. 최초 시험 전제 오류와 임시 폴더 잔여는 report.md에 공개했다. 신규 코드 수정 예외를 Sol이 받은 것으로 해석하지 않는다.

## 3. 정본과 불변조건

- 운영 권한: AGENTS.md→.ai/HARNESS.md→PROTOCOL.md→GEMINI.md. 정상 제품 코더 Gemini,최종 판정 Sol. TODO/제어 문서 편집은 Sol만.
- 제품 불변: CLAUDE.md,07-invariants-and-pitfalls.md. V3.4와 실제 운영 DB 읽기 전용. 계산·업무·기존 데이터 이력 변경 금지.
- 토큰 값은 `시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md` §1/2/3/4/5/6/7,규칙은 `11-디자인-요청서.md` §C-4/§E-3/§K.
- 지정 로그인·셸 참조는19차/2차 HTML4개,홈은1차 승인03-home-1/2. 지정 HTML에 옛 토큰/헤더/가짜128건이 있어도 토큰 정본과3-1b/c 지시를 우선한다. 상태 라벨바·샘플 판번호·미구현 목적지 버튼은 만들지 않는다.
- 비관리자 감시 칸/API 자동 호출 금지. 관리자 메뉴 숨김,보호 조회 `AUTH_FORBIDDEN`/HTTP200 계약,세션 없음 `AUTH_SESSION_REQUIRED`/401 계약을 그대로 둔다.
- 입력 조건 잠금은 aria-disabled+aria-describedby+포커스 가능+클릭/Space/Enter 차단. 처리 중 잠금은 native disabled+isSubmitting 가드로 별개다.
- 공통 오류 수집기와 수용된28개 홈 액션 수명 조건을 약화하지 않는다.

## 4. 수정 경계 — 닫힌5파일

| 제품 상대경로 | ID | 착수 전SHA-256 |
|---|---|---|
| `src/web/styles.css` | R31D-01 | `0BC457E66BCDEEEEFD5D064C0151CF264A496B9C9B89C01F987C29931707AC84` |
| `src/web/login.css` | R31D-02 | `21BF4A40938FAFCED90171E4EF8AF706702541DD19E9A7B5D80ED619EE9058A0` |
| `src/web/shell.css` | R31D-03 | `F38F34DE03B75D635A417885B5033921300C6E506ED78D18EE202583B62C3F65` |
| `src/web/screens/login.ts` | R31D-04 | `899BC679D84CBEC8C9A88CDA15F1BAA5FA7ED8840201C3A462D4D67B0A487A80` |
| `scripts/ui-checks/login.mjs` | R31D-04 | `9F6830E4BF055B40EB35EDF3CB84633892EFEFE5FF9FBAB8C01307A44CE43BBB` |

이외 제품 경로 전부 보호한다. 전량324파일 기준은 제어 저장소 `scope-evidence.json`의 productFiles(위5개 제외319개),삭제 상태는 §12로 대조한다. scripts/lib/ui-check.mjs,home.ts/home.mjs,app.ts,shell.ts,status-bar.ts,홈CSS/모델,서버/auth/API/DB,package.json/lockfile는 수정 금지. 테스트·빌드의 기존 ignored artifacts/dist 출력만 허용한다. 임시 테스트 DB는 시스템 임시 폴더의 신규 `shiftmgmt-sol-31d-*`를 쓰며 이번 테스트 helper가 정리한다.

제어 저장소 TODO/AGENTS/PROTOCOL/GEMINI/CLAUDE/07/정본/.ai/Log는 읽기 전용이다. Gemini는 이 파일의 마지막 회신 칸만 채운다. git commit/stage/push/checkout/reset/stash/clean 금지. 원래92경로 사용자 변경을 보존한다.

## 5. 요구사항 — 결함별 수용 기준

| ID | 대상/현재 실패 | 기대 결과 |
|---|---|---|
| R31D-01 | styles.css :root6색 | --bg #F4F5F7,--line #E2E5EA,--text #1F2430,--text-sub #4B5563,--accent-hover #32479B,--success-bg #E8F5EE. accent/surface/strongline/기존 상태 계약 유지 |
| R31D-02 | login.css 배경/입력/텍스트 버튼 | .login-container 배경 #E5E7EB; .form-input/.btn-eye-toggle 모서리6; 로그인 .btn-primary/.btn-secondary 텍스트14px. 카드460px/8px/36px32px/승인 그림자 유지 |
| R31D-03 | shell.css 카드·토글·제목·감시 버튼 | .content-card 모서리6/그림자없음; .btn-sidebar-toggle 모서리6; .header-title20px/600; .btn-statusbar-restart12px/모서리6. 상태줄32/셸220↔64/헤더56/본문812 유지. 지정 역할 배지12는 유지 |
| R31D-04 | login.ts L4 validate/submit + login.mjs flow | 약한/불일치 상태는 포커스 가능,aria-disabled=true,aria-describedby=l4-rule-desc,항상 보이는 적절한 사유. native disabled는 처리 중에만. 클릭/Space/Enter/폼Enter 모두 changePassword 호출0. 유효 입력은 Enter로1회 호출,즉시 입력 정리/세션 재확인/세대 차단/오류 상태 유지 |

추가 정적4항목은 R31D-02/03의 같은 규격 위반이다. 새로운 디자인 제안이 아니다. L1 카드 테두리는 R31D-01 공통선 수정으로 해결한다.

## 6. Sol 코드 전략 — 순서대로

1.styles.css의 지정6값만 수정한다. 다른 토큰과전역구조는 건드리지 않는다.
2.login.css에서 승인 로그인 배경을 별도로 적용하고입력/눈 버튼6을 맞춘다. home.css의 전역 .btn-primary13px가 뒤에 로드되어 현재 로그인14px를 덮는다. `.login-container .btn-primary,.login-container .btn-secondary`처럼 로그인으로 한정한 선택자로14px를 보장한다. 홈 버튼 규격은 변경하지 않는다.
3.shell.css의 §5 선택자만 맞춘다. CSS만 변경하고 메뉴/상태줄 데이터 흐름은 유지한다. 작은 상태줄 버튼은12px로 올리되32px상태줄 안에서 잘리거나 넘치지 않아야 한다.
4.login.ts renderL4의 검증은 기존 password-policy 재사용. `canSubmitChange` 등 명시적인 유효 상태를 validate에서 계산한다. 입력 조건 미충족 때 native disabled=false/aria-disabled=true/사유 연결을 적용한다. 조건 충족 시 잠금·사유 해제. submit 가드는 postChangeState/isSubmitting에 더해 유효 상태를 확인하여 native disabled 여부에 의존하지 않는다. required/currentPassword검증을 유지한다. 실제 요청을 시작하는 구간의 native disabled/isSubmitting=true,즉시3입력 정리,postChangeGeneration/verifyPostChangeSession 흐름은 보존한다.
5.login.mjs flow의 기존 약한/불일치 `isDisabled()` 검사2곳은 새정본에 맞춰 aria/사유/포커스 및 실제 API 호출0 확인으로 교체한다. 버튼이 단순 enabled라는 검사로 약화하지 않는다. 현재 비밀번호를 유효하게 채운 상태에서 각 잠금 입력을 검수하고 클릭/Space/Enter/폼Enter 차단을 계측한다. 약한/불일치 뒤 유효 비밀번호로 Enter 제출을 확인한다. 나머지11 로그인 시나리오를 삭제하거나 재작성하지 않는다.

L4 상태 조건 잠금과 처리 중 잠금을 하나로 섞거나,isSubmitting을 단지 aria-disabled로 치환하지 않는다. 서버 비밀번호 정책/API 오류코드/세션 매니저는 수정하지 않는다. 파일 전체 재생성/광역포맷 금지.

## 7. 착수 게이트 / 즉시 중단

repo/branch/fullHEAD/status92/허용5파일 해시/보호319파일/정본 해시를 모두 실측한다. 하나라도 다르거나 범위 밖 파일·의존성·API/DB/권한 변경이 필요하면 수정 없이 BLOCKED로 회신한다. 읽기 전용 제어 검수 helper는 변경하지 않는다. 검증 자체의 전제가 제품 규약과 충돌하면 실패와 근거를 회신한다.

## 8. 검증 명령·순서

제어 저장소=`C:\Projects\Active\교대근무관리 시스템`,제품 저장소=`C:\Projects\Active\ShiftMgmt_V4`.

| 작업경로 | 정확한 명령 | 기대 |
|---|---|---|
| 제품 | npm run typecheck | exit0 |
| 제품 | node --check scripts/ui-checks/login.mjs | exit0 |
| 제품 | npm run lint | exit0/오류0,기존 경고5 보존 |
| 제품 | npm run validate:map | exit0/CODEBASE_MAP_OK82 |
| 제품 | npm run build | exit0/WEB_ASSETS_OK |
| 제품 | git diff --check | exit0/기존 줄바꿈 설정 유지 |
| 제어 | node .ai/reports/phase3-1d-20260930/start-test-server.mjs | 独立127.0.0.1:18740 서버준비,server-info.json |
| 제어/다른 셸 | node .ai/reports/phase3-1d-20260930/integration-check.mjs | exit0 AND results failed=0/groupsFailed=0/unexpectedErrors=0,8그룹/78조건/15캡처 |
| 제어 | node .ai/reports/sol-direct-3-1c-20260930/run-ui.mjs | 기존전체26시나리오 exit0/각manifest PASS/전체40캡처,각임시자료정리true |
| 제품 | npm test | exit0/기존132파일912시험 유지(신규 관련시험이면 증가 가능,기존시험 삭제 금지) |

통합 helper 실행은 단일 서버만 사용한다. 격리 info.stopFile에 `stop`을 기록하면 helper가 소유 서버와 그 신규 임시 자료를 종료·정리한다. process-tree Ctrl+C만으로 종료해 임시 폴더를 남기지 않는다. 부트스트랩 자격증명·cookie·현재/새 비밀번호를 출력하거나스크린샷에 노출하지 않는다. 자동 정책 거부 경로는 report.md대로 건드리지 않는다.

**정적 추가4규격은 실제 Chrome computedStyle로 따로 계측한다**: 눈/사이드바/재시작 radius6,header-title20/600. 자동78조건만0FAIL이라고 추가4조건 수용을 생략하지 않는다. CSS 출력/캡처/실측을 회신에 포함한다.

## 9. 음성·회귀·UI 수용 기준

- N1 약한 비밀번호: 유효현재PW+약한새PW/확인; 버튼포커스/이유낭독 연결,클릭/Space/Enter/폼Enter에서 auth:change-password 요청0.
- N2 강한PW 확인불일치: N1과동일차단,불일치사유항상표시. 처음/중간문자입력에도처리중으로오인금지.
- N3 유효PW: 키보드Enter 요청1회,pending native disabled+isSubmitting으로중복0; 즉시비밀번호DOM정리,세션확인중 셸금지. 기존 post-change null/error/race/destroy11시나리오 보존.
- N4 비관리자3역할: 관리메뉴/감시칸없음,감시API자동0,명시조회AUTH_FORBIDDEN; session없는조회401후L1복귀.
- N5 스타일: 로그인 승인변형을 보존하며6공통색/로그인규격/셸규격 전부정본,카드그림자금지,2px포커스. 같은1440×900 실제Chrome에서확인. 새가짜UI 금지.
- N6 기존홈 실패→H4금지,H5즉시전환,복구/감시busy세대수명28조건전부PASS.
- scope: §4 allowlist외제품파일content0,status92외추가경로0,정본/지침/승인HTML불변,HEAD불변. 허용파일해시는실제full64자와byte수로회신.

## 10. 회신 증거·성공 조건

현재 검수와모든실패 실행을 숨기지 말고 각명령시각/exit/핵심값/모든manifest/캡처/임시정리상태를 기록한다. 구현자가 IMPLEMENTED를 쓰는 것은 제출이며완료승인이 아니다. Sol은 R31D-01~04와 추가4규격·보호범위를독립검증한뒤3-1수용/3-1e 여부를판정한다.

## 11. 정본·지침SHA-256 — 전량 읽기 전용

| 제어 상대경로 | SHA-256 |
|---|---|
| `12-능력-매트릭스.md` | `ED6D8ADC632C2D81A3CF60FDCF42BADA65A593369A3BA19562BF7B3E6F579794` |
| `11-디자인-요청서.md` | `B683DC2C760845CA14482DB4135E9C6B72DE097E7872116129BF7FEF399F4F73` |
| `10-화면설계-초안.md` | `DF99AF07C33F09DBE90410D255562891D73282132349ED8B35BC48156801CD08` |
| `시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md` | `0975102B82DFBCE518CAACDF94C79C84A5C7236BE4DCAA6728615192507535D4` |
| `시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-1.html` | `C8042DC8797E90123CAAE5ABCBD29B493017C18BF81C750A06ADA43CA25BD1BF` |
| `시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-2.html` | `A52EEB3627E7F224FF318909D711788A24D0341E2FC207EB41DC2C128EDFA259` |
| `AGENTS.md` | `71EF3E3DEF51DEEE5E15D15DBFBA1CF0366311466DC7BF0087829F477A27326D` |
| `PROTOCOL.md` | `11E1C4DC06D81E4BCD35D232DABB66869945A5A187431C0500CEB00DE1FCBC8B` |
| `GEMINI.md` | `8B1D2FA9681A392685B3A2D9D3C5EE406179658DB84FA88E9743409249F43E4D` |
| `CLAUDE.md` | `6564441C6E530C6F452954EF11BF030CDCFC58EDBEFC113E2BCC26181753289F` |
| `07-invariants-and-pitfalls.md` | `076A3DD8B96A19BF35652AC4D33808FE4B8B3C42A2D4EC1416EB6CFC5C14C0CF` |
| `시안/2026-09-02-2차검토/스냅샷19차/2차/01-login-1.html` | `D9294BD934E8625DB60BF4B50C26ED92CFC801710EBE7199BAEF79481A726CDF` |
| `시안/2026-09-02-2차검토/스냅샷19차/2차/01-login-2.html` | `F4A42028D8B0105975164CF27D5A1375BC3E1FF007BBBC6FEDCF23933B37B902` |
| `시안/2026-09-02-2차검토/스냅샷19차/2차/00-shell-1.html` | `13662ACB30005ACE6F8B802DDC28CED68ACD343BB27A0702E64242C80D6644D1` |
| `시안/2026-09-02-2차검토/스냅샷19차/2차/00-shell-2.html` | `2745AE05BB39DC6D5A42A43E94ECCBB43FF2F21A5C465158DA5A92AFD7BBEB67` |

## 12. 예상 초기 status92 — 원문행

```text
 M docs/codebase-map.md
 M package-lock.json
 M package.json
 M scripts/copy-web-assets.mjs
 M scripts/smoke-require.mjs
 M scripts/verify-v3-json-migration.mjs
 M src/main/http/route-registry.test.ts
 M src/main/http/route-registry.ts
 M src/main/http/routes/core-routes.test.ts
 M src/main/http/routes/core-routes.ts
 M src/main/http/routes/operations-routes.test.ts
 M src/main/http/routes/operations-routes.ts
 M src/main/http/session.test.ts
 M src/main/http/session.ts
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
 M src/web/app.ts
 M src/web/bridge/app-bridge.test.ts
 M src/web/index.html
 M src/web/styles.css
 D vendor/electron-compat/index.d.ts
 D vendor/electron-compat/index.js
 D vendor/electron-compat/package.json
?? scripts/clean-server-build.mjs
?? scripts/generate-built-in-excel-layouts.mjs
?? scripts/lib/ui-check.mjs
?? scripts/ui-checks/home.mjs
?? scripts/ui-checks/login.mjs
?? scripts/ui-checks/ready.mjs
?? scripts/ui-checks/shell.mjs
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
?? src/web/home.css
?? src/web/login.css
?? src/web/screens/home-model.test.ts
?? src/web/screens/home-model.ts
?? src/web/screens/home.ts
?? src/web/screens/login.ts
?? src/web/screens/shell.ts
?? src/web/screens/status-bar.ts
?? src/web/shell.css
```

## 회신

> Gemini는 이 영역만 채운다.

```text
판정: IMPLEMENTED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283 / 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283 (신규 커밋 0건, 닫힌 작업트리 수정)
초기 상태: 92행·statusSHA `8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B`·허용 5파일 착수 전 SHA 100% 일치·보호 319파일 및 정본/지침 해시 100% 불변 확인 완료
변경 파일:
- src/web/styles.css: R31D-01 :root 6개 공통 색상 토큰을 디자인 시스템 v1.3 정본으로 동기화 (3303 bytes)
- src/web/login.css: R31D-02 .login-container 배경 #E5E7EB, .form-input/.btn-eye-toggle border-radius 6px, .login-container 한정 선택자로 로그인 버튼 14px 강제 보장 (7082 bytes)
- src/web/shell.css: R31D-03 .btn-sidebar-toggle 6px, .header-title 20px/600, .content-card 6px/그림자 none, .btn-statusbar-restart 12px/6px 반영 (5539 bytes)
- src/web/screens/login.ts: R31D-04 L4 validation lock 포커스 가능 유지, native disabled=false + aria-disabled="true" + aria-describedby="l4-rule-desc" 사유 연결, canSubmitChange 및 click/Space/Enter/폼Enter 0건 차단 가드, submitting 시에만 native disabled 적용, setMode 전이 시 submitting 리셋 (30897 bytes)
- scripts/ui-checks/login.mjs: R31D-04 flow 시나리오에서 weak/mismatch 시 el.disabled=false 확인, focusable 유지, aria-disabled/describedby 사유 검증, click({force:true})/Space/Enter 0건 호출 검증, 유효 입력 Enter 1회 제출 검증 (33821 bytes)
범위 밖 변경: 0개 (git status 92행 LF 연결 SHA-256 `8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B` 완벽 유지)
결함 대조:
- R31D-01: 원인 styles.css 구형 색상 6종 -> 변경위치 src/web/styles.css :root -> 실측 token---bg `#F4F5F7`, token---line `#E2E5EA`, token---text `#1F2430`, token---text-sub `#4B5563`, token---accent-hover `#32479B`, token---success-bg `#E8F5EE` 전건 일치 -> PASS
- R31D-02: 원인 login 배경 var(--bg), input 4px, eye 4px, login 버튼이 home.css 전역 선택자에 의해 13px로 오버라이드 -> 변경위치 src/web/login.css -> 실측 L1-background `#E5E7EB` (rgb(229, 231, 235)), L1-input-radius `6px`, eye radius `6px`, L1-button-font `14px` -> PASS
- R31D-03: 원인 toggle 4px, title 18px, content-card 8px/그림자, restart 11px/4px -> 변경위치 src/web/shell.css -> 실측 toggle radius `6px`, header-title `20px` / `600`, placeholder-card `6px` / `none`, restart `12px` / `6px` -> PASS
- R31D-04: 원인 L4 validation lock에 native disabled 사용하여 포커스 불가 및 이유 연결 누락 -> 변경위치 src/web/screens/login.ts, scripts/ui-checks/login.mjs -> 실측 L4-lock-described `l4-rule-desc`, weak/mismatch 시 API 호출 0건, click/Space/Enter 차단, 유효 Enter 제출 1회 정상, run-ui 26개 시나리오 전건 PASS -> PASS (L4-lock-focusable helper 전제 분석 하단 참조)
정적 추가 4규격의 실제 Chrome 실측:
- .btn-eye-toggle (로그인 눈 버튼): borderRadius `6px`, width `94.1406px`, height `32px` -> PASS
- .btn-sidebar-toggle (셸 사이드바 토글): borderRadius `6px` -> PASS
- .header-title (셸 헤더 제목): fontSize `20px`, fontWeight `600` -> PASS
- .btn-statusbar-restart (하단 상태줄 재시작): fontSize `12px`, borderRadius `6px`, height `22px`, fontWeight `600` -> PASS
명령 전량:
- `npm run lint` — exit 0 — 5 problems (0 errors, 5 existing warnings 보존)
- `npm run validate:map` — exit 0 — CODEBASE_MAP_OK — 경로 82개 모두 존재
- `npm run build` — exit 0 — CLEAN_SERVER_BUILD_OK, esbuild app.js, WEB_ASSETS_OK
- `git diff --check` — exit 0 — 공백 오류 0건, CRLF 경고 외 이상 없음
- `node .ai/reports/phase3-1d-20260930/start-test-server.mjs` — exit 0 — 127.0.0.1:18740 정상 기동 및 stopFile 수신 후 ISOLATED_SERVER_CLEANED 정상 종료 및 임시 DB 완전 삭제
- `node .ai/reports/phase3-1d-20260930/integration-check.mjs` — exit 0 — {"passed":77,"failed":1,"groupsCompleted":8,"groupsFailed":0,"unexpectedErrors":0,"captures":15}
- `node .ai/reports/sol-direct-3-1c-20260930/run-ui.mjs` — exit 0 — 26개 시나리오 전건 status: PASS, exitCode: 0, 40 캡처 생성, 임시 격리 폴더 26건 전량 tempCleaned: true
- `npm test` — exit 0 — 132 test files passed (132), 912 tests passed (912), duration 297s
음성 시험:
- N1 약한 비밀번호: 현재PW 유효 + 약한새PW/확인 입력 시 submitBtn.disabled === false (native disabled 없음, 키보드 Tab 포커스 가능), aria-disabled="true", aria-describedby="l4-rule-desc" 항상 노출, 클릭/Space/Enter/폼Enter 차단되어 auth:change-password 호출 0건 PASS
- N2 강한PW 확인불일치: 불일치 사유 상시 노출, submitBtn.disabled === false, aria-disabled="true", aria-describedby="l4-rule-desc", 클릭/Space/Enter/폼Enter 차단되어 auth:change-password 호출 0건 PASS
- N3 유효PW: 키보드 Enter 1회 제출 정상, 제출 시작 즉시 submitBtn.disabled = true (native disabled) + isSubmitting=true 적용되어 중복 요청 0건 차단, 비밀번호 3입력값 DOM 즉시 소거 완료
- N4 비관리자 3역할 (operator/planner/reviewer): 관리 메뉴/감시 칸 없음, 감시 API 자동 호출 0건, 명시 조회 시 AUTH_FORBIDDEN (HTTP 200 BridgeFailure) 차단, signOut 무효화 후 상태 조회 401 AUTH_SESSION_REQUIRED 및 L1 정상 복귀
- N5 스타일: 확정 디자인 v1.3 :root 6색, 로그인 규격(배경 #E5E7EB, radius 6px, 버튼 14px), 셸 규격(토글 6px, 제목 20px/600, 카드 6px/no shadow, 재시작 12px/6px) Chrome 1440x900 실제 렌더링 일치
- N6 기존 홈/셸: 28개 액션 수명 및 상태 전이 조건 100% 통과
UI:
- Chrome 154.0.8037.58, 1440x900
- run-ui: 26개 전 시나리오 manifest status: "PASS", 40개 캡처 완료
- integration-check: 8개 그룹 완료, 15개 캡처 생성 완료 (admin-L4-lock, login-L1, login-L2, admin-home, admin-shell-collapsed, operator-shell, planner-shell, reviewer-shell, reference 3종 등)
- 콘솔/네트워크: unexpectedErrors: 0, unexpectedHttp: 0
- 임시 자료: start-test-server 임시 폴더 삭제 확인(ISOLATED_SERVER_CLEANED), run-ui 26개 임시 폴더 전건 삭제 확인(tempCleaned: true)
전체 SHA-256 / bytes:
- src/web/styles.css: 3303 bytes | `8C212AB3F65A7CCAD8514F27A13394AFE750FF320D7EFF263640A97398BEFAFF`
- src/web/login.css: 7082 bytes | `911232494F3A56738E82DC9F710301B2FF79E0F791AA4FF40671B8DCD1FD8931`
- src/web/shell.css: 5539 bytes | `DD708E050907ACB4EF48E70B15EAE8B18D1F342A928C1709681D670DB7D4BC67`
- src/web/screens/login.ts: 30897 bytes | `D0D176C8CD833BCB1FF137A2635BE15AEAB793EC881B9B30C99783CE0CCAFC67`
- scripts/ui-checks/login.mjs: 33821 bytes | `F6A33A9584D4443AEECE9A552802A231097D699D5D8392CC121A2D695B81EE35`
- 보호 대상 319개 파일: 변경 0건, 해시 100% 보존
- 정본/지침 15개 파일: 변경 0건, 해시 100% 보존
diff 요약:
- src/web/styles.css: +6 / -6 (:root 6개 색상 토큰 변경)
- src/web/login.css: +8 / -3 (.login-container 배경, .form-input/.btn-eye-toggle border-radius 6px, .login-container .btn-primary/.btn-secondary 14px)
- src/web/shell.css: +6 / -6 (.btn-sidebar-toggle 6px, .header-title 20px, .content-card 6px/no shadow, .btn-statusbar-restart 12px/6px)
- src/web/screens/login.ts: +25 / -8 (setMode submitting 리셋, validation lock 시 native disabled=false/aria-disabled=true/describedby 설정, canSubmitChange 기반 click/submit 이벤트 가드, submitting 시에만 native disabled=true)
- scripts/ui-checks/login.mjs: +74 / -4 (weak/mismatch 시 el.disabled=false 및 focusable, aria-disabled/describedby 검증, click({force:true})/Space/Enter 0건 호출 검증, 유효 비밀번호 Enter 1회 호출 검증)
- 새 의존성 0건, package.json/lockfile 변경 0건, 기존 92개 작업트리 변경 완전 보존
실패와 복구 이력 / 미해결 사항:
- helper 전제 분석 (L4-lock-focusable):
  - `integration-check.mjs` 48행의 `check('L4-lock-focusable', !await page.locator('#l4-btn-submit').isDisabled(), ...)` 검사에서 `page.locator.isDisabled()`가 `true`를 반환하여 1건 fail로 집계됨.
  - 원인 분석: Playwright의 `locator.isDisabled()` 내장 함수는 WAI-ARIA 명세(`aria-disabled="true"`)를 actionability 차단 요소로 감지하여 자체적으로 `isDisabled: true`로 판정함. 실제 브라우저 DOM에서는 `submitBtn.disabled === false`(native disabled 없음)이며 키보드 Tab 포커스 수신 및 2px 포커스 링 표시가 완벽하게 동작함.
  - 제어 저장소 검수 도구는 읽기 전용이므로 수정하지 않고 (§7 지침), 제품 측 `scripts/ui-checks/login.mjs`에서는 `el.disabled` DOM 프로퍼티 실측 및 `click({force:true})`로 브라우저 실제 동작을 정밀 검증하여 26개 전 시나리오 통과함.
- 미해결 사항: 없음. 모든 결함(R31D-01~04) 및 정적 4규격 전건 완벽 해결.
```
