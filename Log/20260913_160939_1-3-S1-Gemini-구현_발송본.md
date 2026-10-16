# HANDOFF — Phase 1-3 S1 통신 기반 + core 17 구현

- Task: Phase 1-3 S1 — HTTP 공통 기반·세션·111 메타계약·브라우저 브리지·core 17개 구현
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-13 15:54 KST
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `e6216958956e8bc7d207435b6577d4b5accb7f82`
- Expected initial status: clean (`git status --short` 빈 출력)

---

# 회신 요청

**누가**: Gemini  
**어디에**: 루트 `HANDOFF.md`의 이 본문은 고치지 말고 맨 아래 `## 회신`만 채운다.  
**언제**: 착수 게이트 누락/충돌이면 수정 없이 즉시 `BLOCKED`; 그 외 구현·검증·커밋 후 회신.  
**회신이 없으면**: Sol 검증과 S2가 중단된다.

---

## 1. 목표

Phase 1-3 전체를 세 번에 나눈 첫 구현이다. HTTP 요청 공통 경계, 쿠키 세션/권한 실행기, 111행 메타계약, Windows dialog 실행기, 브라우저 `window.appBridge` 111개, 원본 core handler 17개를 구현해 다음 슬라이스가 같은 구조에 업무 handler만 안전하게 추가할 수 있게 한다.

S1 완료 시 서버에 등록되는 POST channel은 **core 17개만**이다. operations/workforce/performance/allowance 94개를 성공 stub으로 만들지 않는다. 그 94개가 아직 404인 것은 S1의 의도된 중간 상태다.

## 2. 비목표

- operations 40, workforce 25, performance 16, allowance 13의 업무 route 구현.
- DB·계산·승인·인테이크·양식 로직 변경.
- 자동 업데이트 또는 dashboard export service 부활.
- PDF 대체, browser upload/download, 새 npm dependency.
- Phase 1-4 원본 테스트 이관.
- UI 디자인·새 화면.

## 3. 현재 상태와 근거

- 현재 단계: `TODO.md` 1-3 진행, 이 패킷은 S1/3.
- 전체 설계 정본: `C:\Projects\Active\교대근무관리 시스템\Phase1\05-1-3-통신담당-설계지시서-v1.0.md`, SHA-256 `682F8998B84AFA6D1CAFE978159641B0C2911F2ADD6EF918594E348DAC087FE9`, 23,904 B.
- 111 정본: `Phase1/02-창구-계약표-111-v0.2.md`, SHA-256 `EBD4FB3ED104701112EE760A06B50BA3CA1D9B2C5FB4953A39CB40552879F3EF`, 25,943 B.
- 계약 타입: V4 `src/shared/bridge/contracts.ts`, SHA-256 `9035D22139A4689AFADB39797E14C77F2F43A28EDE1A97181D766B6AF9F97A8E`, 35,445 B.
- 원본 core: V3 `src/main/ipc/register-core-handlers.ts`, SHA-256 `2449F4852B183A772D2745D72D6EFCB8B0D6D7813C7B7DEDC368C0D26549AF4A`, 13,701 B, 17 handlers.
- 원본 preload: V3 `src/preload/index.ts`, SHA-256 `42CAF5421E0B2B6BE27F44D3CC34E525A26FB4E245137C7580D111C8C3A68A51`, 19,588 B, invoke 111.
- 원본 guard/activity wiring: V3 `src/main/main.ts:68-169`, SHA-256 `CF76495DB66949E693A5BA9B8E3B5C8756BB1ABDD0DC776BD8D4AE9DFA3A9FC9`.
- 현 HTTP 경계: `src/main/server.ts`, `src/main/http/{router,guards,json}.ts`; 비배열을 현재 `[]`로 바꾸는 `server.ts` 동작은 이번에 제거한다.
- 승인된 기능 차이: Phase1 설계 D5(자동 업데이트 disabled state), D6(dashboard 선택 뒤 미지원 failure) 두 개뿐이다.

보호 시작 SHA:

| 파일 | SHA-256 |
|---|---|
| `src/main/ipc/ipc-handler-helpers.ts` | `76D0FC29E9E346F13546D38836662C3D17AAFB8AD20D46A08E0FAC4874B72554` |
| `package.json` | `9634739541A3574766F9FFE7245B683ED964EBA59C4CE57C3E1B5D335CDD211C` |
| `package-lock.json` | `17F34827DBE508F9CCF88E16F3A4DB5964FA5CA393A5DF654E39D30C2DEBAECD` |

## 4. 수정 경계

### 4.1 수정/생성 허용 파일 — 닫힌 목록

| 경로 | ID | 허용 변경 | 허용하지 않는 변경 |
|---|---|---|---|
| `src/shared/bridge/channel-contracts.ts` (신규) | R1 | 111행 실행 메타표와 타입 | 업무 타입 재정의 |
| `src/shared/bridge/channel-contracts.test.ts` (신규) | R1 | 정량·중복·분포 시험 | 정본 수치 완화 |
| `src/main/http/api-types.ts` (신규) | R3,R4 | 요청/응답/handler 문맥 타입 | domain 타입 복제 |
| `src/main/http/route-registry.ts` (신규) | R3,R4 | 등록·guard·dispatch | 업무 서비스 구현 |
| `src/main/http/route-registry.test.ts` (신규) | R3,R4 | 등록·guard·status 시험 | 실제 운영 DB 사용 |
| `src/main/http/session.ts` (신규) | R3 | cookie map, 원본 auth/role guard, activity | DB/schema 변경 |
| `src/main/http/session.test.ts` (신규) | R3 | 주입형 session/permission/activity 시험 | 시간 의존 flaky 시험 |
| `src/main/http/dialog-bridge.ts` (신규) | R6,R7 | FIFO child runner·schema·abort/dispose | shell 문자열 보간 |
| `src/main/http/dialog-bridge.test.ts` (신규) | R7 | child 주입 음성 시험 | 실제 dialog 자동 클릭 |
| `src/main/http/routes/index.ts` (신규) | R4 | S1 core 등록 조립·17 검증 | 나머지 94 stub |
| `src/main/http/routes/core-routes.ts` (신규) | R4,R5,R6 | 원본 core 17 포팅 | 제외 서비스 import/재작성 |
| `src/main/http/routes/core-routes.test.ts` (신규) | R4,R5,R6 | 17 집합·disabled update·auth·export 시험 | 위험 동작 실제 파일 생성 |
| `src/main/runtime.ts` (신규) | R9 | production lifecycle와 주입 seam | 업데이트 서비스 시작 |
| `src/main/runtime.test.ts` (신규) | R9 | 시작/종료 순서 시험 | 저장소 `data/` 사용 |
| `scripts/windows-dialog.ps1` (신규) | R7 | 고정 JSON stdin/stdout dialog/openPath | 사용자 입력 command 실행 |
| `src/web/bridge/app-bridge.ts` (신규) | R8 | 111 fetch wrapper 생성·window 설치 | method 이름/반환형 변경 |
| `src/web/bridge/app-bridge.test.ts` (신규) | R8 | fetch/trim/error/version 시험 | 외부 네트워크 |
| `src/web/app.ts` | R8 | bridge 설치 side-effect import 한 줄 | 기존 health 표시 동작 변경 |
| `src/main/http/router.ts` | R4 | 주입형 POST registry 연결 | health GET 의미 변경 |
| `src/main/http/json.ts` | R2,R3 | array/HTTP outcome 보조 | 1 MiB·오류표 약화 |
| `src/main/server.ts` | R2,R3,R4,R7,R9 | strict array, dispatch context/abort/lifecycle | bind/security/static 규칙 약화 |
| `src/main/server.test.ts` | R2,R3,R4 | 기존 8 유지 + strict body/core 통합 | 기존 시험 삭제/완화 |
| `docs/api-convention.md` | R2~R9 | 구현 확정 내용·S1 상태 갱신 | 111 부록 행 임의 수정 |
| `docs/codebase-map.md` | R10 | 실제 신규 파일/책임 추가 | 존재하지 않는 경로 |

이 표 밖 제품 파일은 수정·생성하지 않는다. 위 신규 파일을 더 잘게 나누거나 새 파일이 필요해도 임의 생성하지 말고 `BLOCKED`로 회신한다. 사용하지 않은 허용 파일은 회신에 그 이유를 적는다.

### 4.2 읽기 전용/금지 경로

- `C:\Projects\Active\ShiftMgmt_V3.4\**` — 읽기 전용. 기존 dirty 항목도 손대지 않는다.
- V4 `src/shared/domain/**`, `src/shared/config/**`, `src/shared/bridge/contracts.ts`, `src/main/services/**`, `src/main/ipc/**`, `양식샘플/**`, `vendor/**`.
- V4 `package.json`, `package-lock.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, 나머지 `scripts/**`.
- 문서 저장소 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, `Log/**`, `Phase1/**`.

### 4.3 허용된 제어 파일 변경

- 제품 구현과 커밋은 V4에서만 한다.
- 구현 뒤 문서 저장소 루트 `HANDOFF.md`의 보이는 `## 회신`만 채운다. 본문은 수정하지 않는다.

## 5. 요구사항

| ID | 입력/행동 | 기대 결과 | 오류/경계 | 구현 위치 |
|---|---|---|---|---|
| R1 | 계약표 v0.2를 읽음 | 111행 typed meta, method/channel unique, 분포 정확 | 임의 추론/누락 시 시험 실패 | `channel-contracts*` |
| R2 | POST JSON body | top-level array만 handler로 전달 | 빈/비JSON/`{}`/string/number/null/bool = 400 BAD_REQUEST | `server`,`json`,`server.test` |
| R3 | cookie/guard/activity | 원본 단일 세션·갱신·권한·성공기록 보존 | session missing/expired와 `auth:change-password` 무쿠키만 HTTP401; 업무 권한 failure는 HTTP200 | `session`,`route-registry` |
| R4 | core channel 17 호출 | 원본 service/args/result/error/activity wiring | duplicate/unknown/missing core 등록 즉시 실패 | `routes/*`,`router` |
| R5 | update 5 호출 | `enabled:false`, `idle`, 실제 VERSION의 성공 state | 서비스 부활·가짜 업데이트 금지 | `core-routes` |
| R6 | dashboard export 2 | 원본 save dialog와 cancel; 선택 뒤 고정 미지원 failure | 파일·activity 0 | `core-routes`,`dialog-bridge` |
| R7 | dialog child | JSON stdin, UTF-8 JSON stdout, stderr 분리, FIFO, abort/dispose | nonzero/malformed/noise/overflow -> 채널 failure | `dialog-bridge`,`windows-dialog.ps1` |
| R8 | `window.appBridge` | 111 method, 같은 channel/인수/return outer shape | network/invalid 분리; version 오류 reject | `app-bridge`,`app.ts` |
| R9 | production 시작/종료 | DB->repair->listen->background, 종료 cleanup 순서 | 테스트 의존성 주입·임시 dataDir | `runtime`,`server` |
| R10 | 문서·보호 | 구현 구조와 docs 일치, 금지 경로 diff 0 | 새 dependency/범위 이탈 0 | docs/검증 |

## 6. Sol의 코드 전략 — 이 순서대로 구현

### 6.1 먼저 정본을 기계적으로 옮긴다

1. `channel-contracts.ts`를 가장 먼저 만든다. 계약표 111행의 `method/channel/group/guard/actionPermission/recordsActivity/dialog/usesDataDir` 외 정보를 창작하지 않는다.
2. `satisfies`로 필드 타입을 검사한다. 별도 test에서 `length === 111`, unique 111/111, group 17/40/25/16/13, guard admin/session/action/accessHistory/none = 40/35/22/1/13, activity 63, dialog 8, dataDir 27을 고정한다.
3. action guard에는 permission이 정확히 하나, 다른 guard에는 permission이 없음을 검사한다.
4. `CORE_CHANNELS`는 group `core`에서 파생한다. 두 번째 수동 목록을 만들지 않는다.
5. `app-bridge.ts`에서 계약 meta의 method key union과 `keyof BrowserAppBridge`가 양방향 `Exclude<...>` 모두 `never`인지 type-level assertion으로 고정한다.

### 6.2 요청 결과 envelope를 작게 둔다

`api-types.ts`에는 다음 역할만 둔다.

- route handler가 받는 `args`, request headers/cookie, `AbortSignal`, version/dataDir, session/activity/dialog 의존성.
- dispatch 결과의 `status`, `body`, 선택 `setCookie`.
- transport failure와 business body를 구분할 수 있는 최소 타입.

domain DTO나 `BridgeResult`를 다시 선언하지 말고 `contracts.ts` 타입을 import한다.

### 6.3 session/guard를 구현한다

설계 정본 D3·D4를 그대로 따른다.

- cookie parser는 `sm_session` 하나만 찾고 URL decode를 하지 않아도 되는 hex id만 허용한다.
- 성공 sign-in: 원본 `signIn` 결과 -> 기존 map clear -> 64 hex id -> map 저장 -> Set-Cookie.
- sign-in 실패는 기존 유효 map/global session을 유지한다.
- request guard: cookie map lookup 성공 뒤에만 원본 `getSessionWithRenewal`; 결과로 map session/lastSeenAt 갱신.
- `withSession`은 `requireOperationalSession`, action/admin/access는 `requireRoleSession`과 `getRequiredRoleForAction/getRequiredRoleForRoute`를 재사용한다.
- `AUTH_SESSION_REQUIRED` guard failure에만 status 401 metadata를 붙인다. password change/role failure는 body status 200.
- meta에서 `auth:change-password`의 guard는 원본 표대로 `none`이지만, route registry는 이 channel 하나에만 HTTP `requireAuthenticatedSession`을 먼저 적용한다. 무쿠키·만료는 401이고 `passwordChangeRequired` 세션은 통과한다. 다른 `guard=none`에는 적용하지 않는다.
- sign-out은 현재 map에 유효한 cookie일 때만 원본 global session/map을 지우고 활동을 기록한다. 무쿠키·임의 id·두 번째 로그인 전의 옛 cookie는 성공 no-op + 해당 cookie 만료이며, 현재 다른 session을 지우거나 기록하지 않는다.
- `recordActivity`와 `recordSuccessfulActivity`는 원본 `main.ts:126-169`를 의미 그대로 옮긴다. logging throw swallow, 성공만 기록.
- auth service와 clock/random을 주입 가능하게 해 테스트가 실제 계정/시간에 의존하지 않게 한다.

### 6.4 registry가 메타 guard를 강제한다

- `register(channel, handler)`는 channel meta 존재와 중복을 검사한다.
- `dispatch`가 meta.guard를 보고 `withSession/withActionPermission/withAdmin/withAccessHistory`를 호출한다. route 파일이 guard를 선택하게 두지 않는다.
- guard 통과 session은 handler context에 제공해 activity detail에 쓴다.
- S1 조립은 core 17과 정확 일치해야 생성 성공. 나머지 94는 등록하지 않는다.
- path는 문자열 exact match; decode/대소문자 보정을 하지 않는다.

### 6.5 core 17은 원본 블록을 1:1 포팅한다

V3 `register-core-handlers.ts`를 채널 블록별로 대조한다. 다음은 보존한다.

- `app:get-version` 문자열 예외, health payload 구성과 bootstrap credentials path.
- auth sign-in 성공/실패 activity, sign-out, get-session, recovery, change-password.
- access logs list/record와 session 전달.
- update handler별 성공 활동 기록.
- dashboard 파일명 sanitize, 저장 위치, dialog 옵션, cancel 문구, activity detail.

Electron 치환 외 서비스 함수·인수·errorCode·문구·순서를 바꾸지 않는다. 단, update service import 대신 D5 provider, dashboard export service import 대신 D6 failure를 사용한다.

D5 state의 `currentVersion`은 `VERSION`/runtime 값이고 `0.0.0` 하드코딩이 아니다. update 다섯 action은 원본 disabled path처럼 성공 state다.

disabled update 활동 횟수는 `check-for-update` 성공의 `app-update-check` / `최신 버전 확인` 1회만이다. `get-update-state`, `download-update`, `install-update`, `dismiss-update-notice`는 target/release-note가 없으므로 각각 0회다.

D6 선택 뒤 고정 결과:

```text
DASHBOARD_CHART_EXPORT_FAILED / 대시보드 차트 내보내기는 현재 판에서 아직 지원하지 않습니다.
DASHBOARD_REPORT_EXPORT_FAILED / 대시보드 보고서 내보내기는 현재 판에서 아직 지원하지 않습니다.
```

cancel은 원본 `EXPORT_CANCELLED` 문구를 유지한다. 어느 failure/cancel에도 activity나 파일 생성이 없어야 한다.

### 6.6 dialog bridge와 PowerShell

설계 정본 D7의 schema·명령·64 KiB·FIFO·abort/dispose를 그대로 구현한다.

- process spawn 자체를 주입해 unit test에서는 창을 띄우지 않는다.
- request abort는 queued면 dequeue/reject, active면 child kill/await.
- dispose는 추가 enqueue를 거절하고 queued/active 전부 settle한 뒤 resolve한다.
- FIFO test는 A active, B/C queued 상태에서 A 종료 전 B spawn 0, A cleanup 뒤 B, 이어 C 순서를 본다.
- stderr 문자열만으로 실패시키지 않는다. exit 0 + valid stdout이면 stderr는 진단값으로 보존하되 성공이다. nonzero면 실패다.
- PowerShell exception은 stdout에 failure JSON을 쓰지 말고 stderr + nonzero로 끝낸다.
- `openPath`도 같은 FIFO/child cleanup 경계를 쓴다.
- Node stdin은 `Buffer.from(JSON.stringify(request), "utf8")`로 쓰고 닫는다. ps1은 `UTF8Encoding(false)` + `Console.OpenStandardInput()` `StreamReader`로 전체를 한 번 읽고, 같은 encoding을 `Console.OutputEncoding`과 `Console.OpenStandardOutput()` `StreamWriter`에 명시한다. `ConvertTo-Json -Compress` 결과 한 줄 외 stdout은 없다.
- 한글·공백이 든 title/defaultPath/filter/path가 protocol seam 왕복 뒤 글자 단위 동일한 시험을 둔다. Windows PowerShell 5.1 기본 인코딩을 신뢰하지 않는다.

### 6.7 browser bridge는 111 메타표로 합성한다

- `BrowserAppBridge`는 8개 interface의 intersection이다.
- fresh literal `method -> channel` 정본은 D1 하나뿐이어야 한다. app bridge는 그 값을 순회한다.
- trailing `undefined` 제거 함수는 복사본에서 pop하고 원본 args를 보존한다.
- 일반 응답 outer validator는 `ok:true` own `data`, 또는 `ok:false` string code/message만 인정한다. payload domain schema를 추정해 검사하지 않는다.
- HTTP 401/403/400 등의 valid BridgeFailure는 그대로 반환한다.
- network failure와 invalid response의 한국어 문구는 기존 `docs/api-convention.md` §7 그대로다.
- version은 string 200만 resolve; 그 밖은 `Error` reject. 일반 bridge failure object로 resolve하지 않는다.
- test는 fake fetch로 URL 111 매핑도 전수 확인한다.

### 6.8 runtime과 server를 연결한다

- 기존 Host/Origin/Content-Type/size/security headers/static file/log/bind 코드는 약화하지 않는다.
- body parse 성공 뒤 `Array.isArray`가 false면 즉시 400. 기존 `? body.value : []` fallback 삭제.
- IncomingMessage `aborted`, response가 finish 전 `close`, server shutdown을 AbortSignal로 dialog/route에 전달한다.
- production lifecycle은 설계 D9 순서. test에서는 fake lifecycle을 주입하고 `mkdtemp`만 쓴다.
- 기존 `startServer()` return type과 port 0 시험 가능성은 유지한다.
- signal listener가 테스트 뒤 남지 않도록 기존 시험의 cleanup 보장을 유지한다.
- 공개 API와 signal 소유자는 `server.ts` 하나다. `createServer()`는 DB/timer/signal side effect가 없고 `startServer()`만 runtime을 시작한다. `runtime.ts`는 signal/exit를 직접 만지지 않고 idempotent `initialize/startBackground/shutdownOnce`만 제공한다.
- `server.ts` composition root가 dialog script 절대 경로를 계산해 주입한다. dialog 쪽에서 server를 import해 순환시키지 않는다.
- shutdown coordinator가 socket/server close와 `shutdownOnce()`를 기다린 뒤 주입된 exit를 호출한다. SIGINT/SIGTERM 중복 등록 0, shutdown 두 번에도 각 cleanup 1회, cleanup 완료 전 exit 0회를 시험한다.

### 6.9 문서·코드 지도

- `docs/api-convention.md`는 400 비배열 목록이 구현됐음을 명시하고 D3 401/200 구분, D5/D6, dialog JSON protocol/FIFO, S1 core 17 상태를 적는다.
- 부록 111행 내용은 수정하지 않는다.
- `docs/codebase-map.md`에 실제 생성한 파일과 책임을 넣는다. 존재 검사만 하는 도구의 한계를 completeness 증거로 과장하지 않는다.

### 6.10 커밋 순서

1. 구현 및 관련 시험.
2. `typecheck`, `lint`, `test`, `build`, `validate:map`, `smoke`, `git diff --check`.
3. allowlist·보호 diff·SHA 확인.
4. `git add`는 §4.1 실제 변경만 명시 경로로 추가.
5. 커밋 메시지: `feat: add phase 1-3 transport foundation`
6. clean 상태에서 `npm run release:check`.
7. 최종 status/commit/SHA를 회신.

## 7. 적용할 불변조건과 과거 함정

### 7.1 필수 불변조건

- “화면은 새로, 계산은 그대로”: copied domain/service/helper는 수정 0.
- 승인과 계산은 하나의 트랜잭션, forward-only, 실적은 Excel intake만, 날짜 기준 요율, silent truncation 금지 등 `07-invariants-and-pitfalls.md` A 규칙을 통신층이 우회하지 않는다.
- service failure는 원본 계약 failure이고 HTTP500으로 승격하지 않는다.
- 권한 부족과 cross-origin 403을 같은 오류로 합치지 않는다.
- 같은 PC `127.0.0.1`, 실제 경로 의미, Windows native dialog를 유지한다.

### 7.2 반드시 피할 과거 실패

- 비배열 JSON을 `[]`로 조용히 보정.
- method/channel 목록을 server와 browser에 따로 복제해 한쪽만 빠짐.
- session cookie 없이 원본 global `currentSession`을 사용해 다른 요청이 세션을 빌림.
- passwordChangeRequired 사용자를 operational guard로 막아 비밀번호 변경도 불가능하게 함.
- contract failure를 HTTP500으로 바꿈.
- 활동 기록을 요청 시작이나 failure/cancel에도 남김.
- PowerShell command string에 path/title/filter 보간, stdout/stderr 혼합, FIFO cleanup 전 다음 spawn.
- excluded service를 새로 쓰거나 미지원 동작을 성공 처리.
- 자가 보고 hash 창작. 반드시 명령 출력 64자를 복사한다.

## 8. 착수 전 확인

아래가 하나라도 다르면 제품 파일을 수정하지 않고 `BLOCKED`로 회신한다.

1. V4 `main`, HEAD `e6216958956e8bc7d207435b6577d4b5accb7f82`, clean.
2. §3의 V3/V4 보호 SHA가 일치.
3. 전체 설계 v1.0과 계약표 v0.2를 읽을 수 있음.
4. §4.1만으로 구현 가능하고 새 dependency가 필요 없음.
5. 요구사항·코드 전략·시험 사이 모순 없음.

## 9. 검증 계획

### 9.1 정적·빌드·관련 시험

| 순서 | 정확한 명령 | 기대 RC | 핵심 값 |
|---|---|---:|---|
| 1 | `npm run typecheck` | 0 | server+browser strict type 통과 |
| 2 | `npm run lint` | 0 | 기존 경고 7 이외 새 오류/경고 0; 실제 요약 보고 |
| 3 | `npm test` | 0 | 기존 13 포함 전부 pass; 파일/케이스 수 원문 보고 |
| 4 | `npm run build` | 0 | server/browser build, app bridge bundle 포함 |
| 5 | `npm run validate:map` | 0 | 코드 지도 실재 경로 통과 |
| 6 | `npm run smoke` | 0 | 복사 서비스 72/72 load |
| 7 | `git diff --check` | 0 | whitespace 오류 0 |
| 8 | 보호 diff 명령(§9.3) | 0 | LOCK 코드 변화 0 |
| 9 | 구현 commit | 0 | 지정 메시지, 범위 파일만 |
| 10 | `npm run release:check` | 0 | clean 통합 검사 통과 |
| 11 | `git status --short` | 0 | 빈 출력 |

### 9.2 음성 시험

| ID | 입력/조작 | 기대 | 실패 판정 |
|---|---|---|---|
| N1 | 빈 body, `{}`, `"x"`, `5`, `null`, `true` | 각각 HTTP400 BAD_REQUEST, handler 호출 0 | 하나라도 `[]` 처리/200 |
| N2 | cookie 없음·임의 64hex·만료 | guarded core에서 HTTP401 + AUTH_SESSION_REQUIRED | global session 대여/200 |
| N3 | passwordChangeRequired/무쿠키 change-password | 일반 guarded route는 계약 실패 200, 유효 cookie의 change-password는 호출 가능, 무쿠키는 401 | 무가드 통과 또는 change-password도 차단 |
| N4 | 두 번째 로그인 뒤 첫 cookie로 guarded route/sign-out | 첫 cookie 401; 옛-cookie sign-out은 성공 no-op; 둘째 session 유지 | global session 공유/현재 session 삭제 |
| N5 | role/access-history 실패 | 원본 AUTH_* BridgeFailure + HTTP200 | transport 403로 합침 |
| N6 | disabled update 5 + failure/throw/cancel/export 미지원 | check 성공만 1회; get/download/install/dismiss 및 나머지 실패는 0 | 조건 무시·시도만으로 기록 |
| N7 | dialog payload에 한글·공백·`a b'\"&|;$()` | UTF-8 글자 그대로 stdin/stdout; 별도 명령 실행 0 | 깨진 한글/command interpolation |
| N8 | child nonzero/invalid JSON/stdout 2줄/64KiB+1 | channel failure, child/queue cleanup | hang/부분 성공 |
| N9 | A active, B/C queued, B abort | A만 active; B spawn 0; A cleanup 뒤 C | 동시 창/순서 역전 |
| N10 | fetch reject/invalid JSON/invalid outer shape | NETWORK_ERROR/INVALID_RESPONSE 구분 | 모두 같은 fallback |
| N11 | getAppVersion non-string/non-200/network | Promise reject | 빈 문자열/BridgeFailure resolve |
| N12 | operations 등 S1 밖 channel | 404 NOT_FOUND | 성공 stub/handler 등록 |
| N13 | SIGINT/SIGTERM 등록·shutdown 2회 | signal 소유자 1곳, 각 cleanup 1회, cleanup 완료 뒤 exit | 이중 listener/cleanup 전 exit |

### 9.3 회귀·불변 확인

```powershell
git diff --exit-code e6216958956e8bc7d207435b6577d4b5accb7f82 -- src/shared/domain src/shared/config src/shared/bridge/contracts.ts src/main/services src/main/ipc 양식샘플 vendor package.json package-lock.json tsconfig.server.json tsconfig.browser.json vitest.config.ts eslint.config.mjs
```

기대 RC 0, 출력 없음. `src/shared/bridge/channel-contracts*`는 이번 신규라 보호 명령에서 의도적으로 제외한다.

추가 확인:

- manifest 111, unique method/channel 111/111.
- group 17/40/25/16/13.
- guard 40/35/22/1/13, activity 63, dialog 8, dataDir 27.
- S1 server registered set = core 17 exactly.
- browser method = 111 exactly; 각 method URL이 manifest channel과 일치.
- dependency와 lockfile 변화 0.

### 9.4 UI/런타임 확인

- 실제 native dialog 눈검사는 S3 뒤 Sol이 대표 4종으로 한다. S1에서는 자동 창을 띄워 test를 멈추지 않는다.
- 대신 다음 read-only probe를 회신에 붙인다.

```powershell
$ps = (Get-Command powershell.exe -ErrorAction Stop).Source
& $ps -NoProfile -STA -Command '$PSVersionTable.PSVersion.ToString(); Add-Type -AssemblyName System.Windows.Forms; ([System.Windows.Forms.FolderBrowserDialog].GetProperties() | ForEach-Object Name) -join ","'
```

기대 핵심: PowerShell 5.1, `Description` 존재, `Title` 없음.

## 10. 성공 조건

- [ ] R1~R10 전부 구현 위치와 시험 증거가 있다.
- [ ] S1 등록은 core 17, browser/meta는 111, 나머지 94 성공 stub 0.
- [ ] strict body·session·permission·activity·dialog·bridge·lifecycle 음성 시험 N1~N13 통과.
- [ ] static/build/test/map/smoke/release gate 전부 RC0.
- [ ] §4.1 밖 변경 0, 보호 diff 0, dependency 변화 0.
- [ ] 지정 커밋 1개 후 clean.
- [ ] 아래 회신에 재현 가능한 원문·전체 hash가 있다.

## 11. 즉시 중단 조건

- baseline/status/SHA 불일치.
- allowlist 밖 파일·새 의존성·LOCK 코드 수정이 필요함.
- D5/D6 외 원본 core 의미를 바꿔야 함.
- session/HTTP status/dialog protocol 결정을 새로 해야 함.
- 시험 약화·placeholder 성공이 필요함.
- Windows PowerShell 5.1 또는 필수 도구가 없어 검증할 수 없음.

---

## 회신

> Gemini가 아래 양식을 실제 값으로 채운다. 이 줄 위 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / e6216958956e8bc7d207435b6577d4b5accb7f82 / 최종 commit <40자>
초기 상태: <git status와 착수 게이트 SHA 원문>
변경 파일:
- <경로>: <R ID와 한 줄 목적>
사용하지 않은 allowlist 파일: 없음 | <경로와 이유>
범위 밖 변경: 0개 | <경로와 사유>
요구사항 대조:
- R1~R10: <구현 위치> — PASS | FAIL | BLOCKED
정량 대조:
- manifest/method/channel: <값>
- group/guard/activity/dialog/dataDir: <값>
- S1 registered routes: <값과 목록 비교>
검증 증거:
- <정확한 명령> — 종료 코드 <n> — <핵심 값> — <KST 시각>
음성 테스트:
- N1~N13 — 기대 <값> — 실제 <값/시험명>
PowerShell probe: <version/properties 원문>
보호 diff: <정확한 명령/RC/출력>
diff 요약: <git diff --stat, 추가/삭제, 의존성 변화>
전체 SHA-256:
- <변경 파일 각각 경로와 64자>
최종 상태: <commit 40자, git status --short 빈 출력>
미해결/가정: 없음 | <목록>
```
