# 창구 규약 (화면 ↔ 서버)

> 이 문서가 1-3(창구 구현)의 기준이다. Phase 1-3 S1에서 공통 통신 기반, 세션 관리, 다이얼로그 브리지, 브라우저 브리지, Core 17개 라우트가 확정·구현되었다.
> 근거: Phase 1-1 셋업 지시서 v1.3 §5 · S12 · Phase 1-3 S1 지시서 · 별첨 계약표 111행 v0.2(아래 부록 = 원본 파일 사본).
> 화면 코드가 바뀌지 않도록 **채널 이름·인수·반환형(계약 111개)은 원본 0.5.4 그대로** 둔다.

## 1. 주소

- **`POST /api/<채널명>`** 1:1. 채널명은 아래 부록 계약표의 111행 그대로다(예: `employees:list`).
  - 111 = 원본 `src/preload/index.ts` 의 `ipcRenderer.invoke` 111개 = `src/main/ipc/register-*.ts` 의 `ipcMain.handle` 111개.
- `GET /api/health` 하나만 GET을 허용한다(주소창으로 서버가 살아 있는지 확인하는 용도).
- 그 밖의 `GET /api/*` 는 404다.
- **S1 상태**: S1 단계에서는 **core 17개 채널만 서버에 등록**되어 있으며, 나머지 94개 채널은 성공 스텁 없이 404 `NOT_FOUND`로 유지된다.

## 2. 요청

- `Content-Type: application/json`(`; charset=utf-8` 허용). **다른 형식은 받지 않는다** — 대화상자 채널도 JSON이다(§6).
- 본문 = **인수 JSON 배열**. 선택 인수(`query?`)를 안 넘길 때는 **배열에서 생략**한다(`[]`).
  화면 껍데기(`src/web/bridge/app-bridge.ts`)는 뒤쪽 `undefined` 를 잘라내고 보낸다(JSON `null` 로 바뀌어 원본과 달라지는 것을 막는다).
- **본문이 비었거나 최상위가 배열이 아니면 400 `BAD_REQUEST`** 다. 인수 0개도 반드시 `[]` 로 보낸다.
  - 거절 대상: 빈 본문(0바이트) · JSON 문법 오류 · 문법은 맞지만 최상위가 **객체 `{}` · 문자열 `"x"` · 숫자 `1` · `null` · `true`/`false`** 인 것.
  - **빈 본문을 `[]`(인수 0개)로 봐주지 않는다.** 봐주면 인수를 빠뜨린 호출이 조용히 「인수 없음」으로 실행돼 원본과 다른 결과가 나온다.
  - 1-3 S1 테스트에 **빈 본문 · `{}` · `"x"` · `1` · `null` · 불리언 표본**을 두어 못박았다.
- 본문 상한 **1 MB**(초과 = 413).
- 요청은 이 프로그램 화면에서 온 것만 받는다: `Origin` 헤더가 있으면 `http://127.0.0.1:<포트>`·`http://localhost:<포트>` 와 정확히 같아야 하고,
  `Sec-Fetch-Site` 헤더가 있으면 `same-origin`·`none` 이어야 한다. 각 헤더는 있으면 독립으로 검사하고(하나라도 불신 값이면 403), 둘 다 없으면 403이다.
- `Host` 헤더가 `127.0.0.1:<포트>`·`localhost:<포트>` 와 정확히 같지 않으면 400이다.
- **「정확 일치」는 글자 그대로다 — 대소문자를 접어 비교하지 않는다.** `LOCALHOST:<포트>` · `HTTP://127.0.0.1:<포트>` 는 거절이다
  (크롬은 언제나 소문자로 보내므로 실제 화면 요청은 막히지 않는다).
- **같은 헤더가 두 번 이상 오면 거절한다** — `Host` 2개 이상 = 400, `Content-Type` 2개 이상 = 415. **순서와 무관**하다.
  Node 는 같은 헤더가 여럿이면 첫 값만 남기므로, 이 검사가 없으면 `Host: 정확` + `Host: evil.example` 이 통과한다.
  검사는 합쳐진 값이 아니라 **`req.rawHeaders` 에서 이름 등장 횟수**로 센다.

> ⚠️ 위 세 줄(정확 일치 · 중복 헤더 · 빈/비배열 본문)은 1-1 및 1-3 S1 구현에서 실제 사고로 확인해 넣은 것이다.
> **지우거나 느슨하게 바꾸지 않는다.**

## 3. 응답과 오류 코드

- 응답 본문은 **계약 반환형 JSON 그대로**다.
  - 110개 = `BridgeResult<T>` — `{ ok: true, data }` 또는 `{ ok: false, errorCode, message }`(원본 `src/shared/bridge/contracts.ts:869-880`).
  - **예외 1개 = `app:get-version`** → JSON 문자열(`"0.1.0"`, 원본 `contracts.ts:883`).
- 계약이 만든 결과는 실패 결과라도 **HTTP 200** 으로 보낸다(업무 실패 ≠ 통신 실패).
  - 단, **D3 결정**: `auth:change-password`는 세션 없이 호출된 경우 가드 수준 거절이므로 HTTP 401 `AUTH_PASSWORD_CHANGE_SESSION_REQUIRED`를 반환하고, 세션이 있는 상태에서 비밀번호 틀림 등 업무 실패는 HTTP 200 `{ ok: false, errorCode: "AUTH_PASSWORD_CHANGE_FAILED", ... }`를 반환한다.
- 통신·검문 단계의 오류는 아래 상태로 보내되 **본문은 항상 `BridgeFailure`** 다.

| HTTP | errorCode | 언제 |
|---|---|---|
| 400 | `BAD_REQUEST` | Host 위조 · `Host` 헤더 2개 이상 · 본문이 JSON이 아님 · **빈 본문 · 최상위가 배열이 아닌 JSON** |
| 401 | `AUTH_SESSION_REQUIRED` / `AUTH_PASSWORD_CHANGE_SESSION_REQUIRED` | 세션 가드 채널에 세션 쿠키 없음 · 만료 · 위조 세션 |
| 403 | `FORBIDDEN` / `AUTH_ACTION_FORBIDDEN` / `AUTH_ADMIN_REQUIRED` / `AUTH_ACCESS_HISTORY_REQUIRED` | Origin·Sec-Fetch-Site 검사 실패 또는 권한 가드 불충족 |
| 404 | `NOT_FOUND` | 없는 채널 · 미구현 채널(94개) · 없는 파일 |
| 413 | `PAYLOAD_TOO_LARGE` | 본문 1 MB 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `application/json` 이 아님 · `Content-Type` 헤더 2개 이상 |
| 500 | `INTERNAL_ERROR` | 처리 중 예외(원본 `getErrorMessage`) |

- 모든 응답에는 보안 헤더 4종이 붙는다: `Content-Security-Policy`(인라인 스크립트·스타일 금지) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store`. CORS 헤더는 두지 않는다.

## 4. 세션 (1-3a / S1)

- `auth:sign-in` 이 성공하면 서버가 `crypto.randomBytes(32).toString("hex")` 로 64자리 hex 세션 id를 새로 발급하고
  `Set-Cookie: sm_session=<id>; HttpOnly; SameSite=Strict; Path=/` 로 내려 준다(로그인마다 새로).
- 서버 메모리에 단일 세션 인스턴스(`activeSession`)로 보관한다(단일 사용자 원칙).
- 만료(30분 무활동)·갱신(세션 접근 시마다 `lastSeenAt` 갱신)·로그아웃 판정은 원본 `auth-service.ts`·`ipc-auth-guard-service.ts` 의 규칙을 **그대로** 옮겼다.
- `auth:sign-out` 이 세션을 파기하고 만료 쿠키(`Max-Age=0`)를 발행한다. 프로그램을 다시 켜면 전부 로그아웃이다(단일 프로세스 메모리 수명).

## 5. 가드와 활동 기록 (1-3a / S1)

- 원본 `withSession` · `withActionPermission` · `withAdmin` · `withAccessHistory` 와 `recordSuccessfulActivity` 를 `src/main/http/session.ts`에 완전 구현.
- `src/main/http/route-registry.ts`에서 111 메타계약(`CHANNEL_CONTRACTS`)을 참조하여 각 채널의 가드를 자동 강제한다.
- 활동 기록은 계약표 「활동 기록」 열 63채널 대상. 세션이 유효할 때 `recordAccessLog`를 호출하여 안전하게 기록한다.
- 원본 `src/main/ipc/ipc-handler-helpers.ts`의 `runIpcAction`, `createIpcSuccess`, `createIpcFailure` 등을 안전하게 재사용한다.

## 6. 대화상자 채널 8개 (S12 / S1)

파일·폴더를 고르는 창은 **서버가 같은 PC의 Windows 창으로 띄운다**(0.5.4에서 보던 그 창이다).
브라우저 업로드·다운로드로 바꾸지 않는다 — 고른 경로를 서버가 계속 쓰기 때문이다.

- 실행기(`scripts/windows-dialog.ps1` 및 `src/main/http/dialog-bridge.ts`):
  - `powershell.exe -NoProfile -STA` (Windows PowerShell 5.1) 프로세스를 단일 FIFO 큐로 실행.
  - 대화상자 요청 명세를 UTF-8 JSON 표준입력(stdin)으로 넘기고, 결과 JSON 1줄을 표준출력(stdout)으로 받는다.
  - 지원 operation: `openFile`, `openFolder`, `saveFile`, `openPath`.
  - 취소 시: `{ cancelled: true, path: null }`.
  - 프로세스 비정상 종료, 타임아웃, AbortSignal 발생 시 자식 프로세스를 즉시 강제 종료(kill)하고 리소스를 안전하게 해제.
- **D6 결정**: S1의 `dashboard:export-chart-data` 및 `dashboard:export-report`는 다이얼로그 브리지를 통해 실제 파일 저장 창을 띄운다. 사용자가 취소하면 `{ ok: false, errorCode: "EXPORT_CANCELLED", message: "차트/대시보드 내보내기를 취소했습니다." }`를 반환하고, 경로를 선택하면 현재 단계에서는 기능 미지원 실패(`DASHBOARD_CHART_EXPORT_FAILED` / `DASHBOARD_REPORT_EXPORT_FAILED`)를 HTTP 200 본문으로 반환한다.
- **D5 결정**: `app:get-update-state`, `app:check-for-update`, `app:download-update`, `app:install-update`, `app:dismiss-update-notice`는 일관되게 `enabled: false`, `status: "idle"`, `currentVersion: version`, `availableManifest: null`, `releaseNotesToShow: null`의 비활성화 스냅샷을 반환한다.

## 7. 브라우저 브리지 (1-3b / S1)

`src/web/bridge/app-bridge.ts` 가 `window.appBridge` 에 111개 메서드를 **같은 이름·같은 반환형**으로 올린다.

- 메타 계약 111개 배열을 기반으로 자동 합성되며, 호출 시 인자의 후행 `undefined`를 제거하여 `POST /api/<channel>`로 JSON 배열을 전송한다.
- `credentials: "same-origin"`으로 쿠키를 자동 동봉한다.
- 네트워크 오류 시 `NETWORK_ERROR`, 응답 형식 이상 시 `INVALID_RESPONSE`를 일관되게 반환한다.
- `getAppVersion` 은 순수 문자열(`string`)을 반환하며 비정상 시 reject한다.

---

# 부록 — 창구 계약표 111행 v0.2 (원본 파일 사본)

> 아래는 `교대근무관리 시스템/Phase1/02-창구-계약표-111-v0.2.md` 의 사본이다(글자 단위로 같다).
> 표를 고쳐야 하면 원본 파일에서 판본을 올리고 이 사본을 다시 만든다.

# Phase 1-3 창구 계약표 111 — v0.2 (2026-09-07, 원본 0.5.4에서 스크립트 추출 · v0.1 Codex ③ DISAGREE → 활동 기록 판별식 수정 · 대화상자/데이터 폴더 열 분리)

- 추출 원본(읽기만): `src/preload/index.ts`(메서드→채널) · `src/shared/bridge/contracts.ts`(인수 타입·반환형) · `src/main/ipc/register-*.ts`(가드·활동 기록·대화상자·데이터 폴더). 추출 스크립트 = `Phase1/extract-contract-table-v0.2.py`(같은 스크립트를 다시 돌리면 같은 표가 나온다).
- 행 수 111 = preload invoke 111 = 핸들러 111(preload에만/핸들러에만 있는 채널 0). 반환형이 `BridgeResult<…>`가 **아닌** 채널 1개(★ = `app:get-version` → `string`, 원본 문자열 반환 유지).
- 가드 분포: withAdmin 40 · withSession 35 · withActionPermission 22 · withAccessHistory 1 · 없음 13 = 111 (`12-능력-매트릭스.md` §4.1 검산 7+6+35+22+40+1과 일치). **활동 기록 63행**(판별식 = `recordSuccessfulActivity` · `recordActivity` · `activity: trackSuccess(` — 마지막 것은 `ipc-handler-helpers.ts:102,118,157,237`의 `activity.recordSuccessfulActivity` 경로) · 대화상자 8행(열기(파일) 3 · 열기(폴더) 1 · 저장 3 · 경로 열기 1) · 데이터 폴더 27행.
- 「가드」 = 핸들러 블록에 등장하는 가드 이름(중첩 포함). 「권한 동작」 = `withActionPermission`의 첫 문자열 인수. 「활동 기록」 = 성공 시 활동 기록을 남기는 채널(1-3에서 같은 이름·같은 판정으로 옮긴다).
- 「대화상자」 = 원본이 Electron `dialog.showOpenDialog`(열기(파일)·열기(폴더)) · `dialog.showSaveDialog`(저장) · `shell.openPath`(경로 열기)를 쓰는 채널. **형태 ①에서도 서버가 같은 PC의 Windows 대화상자를 띄우고(지시서 v1.2 S12) 계약 인수·반환형·취소 시 값·활동 기록을 원본과 똑같이 유지한다** — 브라우저 업로드·다운로드로 바꾸지 않는다. 요청·응답 형식도 다른 채널과 같다(`POST /api/<채널>` · `application/json` · 계약 반환형 JSON). 취소 시 값 = 원본 핸들러 그대로(열기 4 = `{ ok: true, data: null }` · `dashboard:export-chart-data`·`dashboard:export-report` = `{ ok: false, errorCode: "EXPORT_CANCELLED" }`(`register-core-handlers.ts:235,282`) · `operations:preview-document-template` = `{ ok: true, data: null }`(`register-operations-handlers.ts:737`)). `buttonLabel` 인수는 Windows 대화상자가 지원하지 않아 받되 무시한다. 구현 스크립트(PowerShell 대화상자·OS 열기)는 1-3c 지시서에서 고정.
- 「데이터 폴더」 = 핸들러가 `getUserDataPath()`를 쓰는 채널(실행 의존성 — 서버는 `SHIFTMGMT_USER_DATA_DIR` 또는 기본 폴더를 같은 이름으로 넘긴다). 전송 방식과 무관.
- 1-3 구현 규칙: 모든 채널은 `POST /api/<채널>`(인수 = JSON 배열, 선택 인수는 **생략**(뒤쪽 undefined는 배열에서 잘라냄)), 응답 = 계약 반환형 JSON 그대로. 화면 쪽 `window.appBridge`는 아래 111 메서드를 같은 이름·같은 반환형으로 제공한다.

| # | 채널 | 메서드 | 계약 인수(타입) | 계약 반환형 | 가드 | 권한 동작 | 활동 기록 | 대화상자 | 데이터 폴더 | 핸들러 파일 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `access-logs:list` | `listAccessLogs` | `query?: AccessLogListQuery` | `BridgeResult<AccessLogRecord[]>` | withAccessHistory |  |  |  |  | `register-core-handlers.ts` |
| 2 | `access-logs:record` | `recordAccessLog` | `input: AccessLogRecordInput` | `BridgeResult<null>` | withSession |  |  |  |  | `register-core-handlers.ts` |
| 3 | `allowance:approve-proposal` | `approveAllowanceProposal` | `input: AllowanceProposalApprovalInput` | `BridgeResult<AllowanceProposalApprovalRecord>` | withActionPermission | allowance-approval | 예 |  | 예 | `register-allowance-handlers.ts` |
| 4 | `allowance:export-documents` | `exportAllowanceDocuments` | `input: AllowanceDocumentExportInput` | `BridgeResult<AllowanceDocumentExportRecord>` | withSession |  | 예 |  | 예 | `register-allowance-handlers.ts` |
| 5 | `allowance:list-approval-history` | `listAllowanceApprovalHistory` | `(없음)` | `BridgeResult<AllowanceApprovalRecord[]>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 6 | `allowance:list-approved-targets` | `listApprovedTargets` | `(없음)` | `BridgeResult<PerformanceEntryRecord[]>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 7 | `allowance:list-document-exports` | `listAllowanceDocumentExports` | `(없음)` | `BridgeResult<AllowanceDocumentExportRecord[]>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 8 | `allowance:list-history` | `listCalculationHistory` | `(없음)` | `BridgeResult<AllowanceCalculationResultRecord[]>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 9 | `allowance:list-proposal-approvals` | `listAllowanceProposalApprovals` | `(없음)` | `BridgeResult<AllowanceProposalApprovalRecord[]>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 10 | `allowance:list-results` | `listCalculationResults` | `(없음)` | `BridgeResult<AllowanceCalculationResultRecord[]>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 11 | `allowance:preview-calculation` | `previewCalculation` | `input: AllowancePreviewInput` | `BridgeResult<AllowanceCalculationSnapshot>` | withSession |  |  |  |  | `register-allowance-handlers.ts` |
| 12 | `allowance:preview-proposal` | `previewAllowanceProposal` | `input: AllowanceProposalPreviewInput` | `BridgeResult<AllowanceProposalPreview>` | withSession |  | 예 |  |  | `register-allowance-handlers.ts` |
| 13 | `allowance:review-calculations` | `reviewAllowanceCalculations` | `input: AllowanceReviewActionInput` | `BridgeResult<AllowanceApprovalRecord[]>` | withActionPermission | allowance-approval | 예 |  | 예 | `register-allowance-handlers.ts` |
| 14 | `allowance:run-approved-calculation` | `runApprovedCalculation` | `input: AllowanceApprovedCalculationInput` | `BridgeResult<AllowanceCalculationResultRecord>` | withSession |  | 예 |  |  | `register-allowance-handlers.ts` |
| 15 | `allowance:set-early-payout` | `setCalculationEarlyPayout` | `input: AllowanceEarlyPayoutInput` | `BridgeResult<AllowanceCalculationResultRecord>` | withSession |  | 예 |  |  | `register-allowance-handlers.ts` |
| 16 | `app:check-for-update` | `checkForAppUpdate` | `(없음)` | `BridgeResult<UpdateStateSnapshot>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 17 | `app:dismiss-update-notice` | `dismissUpdateNotice` | `version: string` | `BridgeResult<UpdateStateSnapshot>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 18 | `app:download-update` | `downloadAppUpdate` | `(없음)` | `BridgeResult<UpdateStateSnapshot>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 19 | `app:get-health` | `getAppHealth` | `(없음)` | `BridgeResult<AppHealth>` | 없음 |  |  |  | 예 | `register-core-handlers.ts` |
| 20 | `app:get-update-state` | `getUpdateState` | `(없음)` | `BridgeResult<UpdateStateSnapshot>` | 없음 |  |  |  |  | `register-core-handlers.ts` |
| 21 | `app:get-version` | `getAppVersion` | `(없음)` | ★ `string` | 없음 |  |  |  |  | `register-core-handlers.ts` |
| 22 | `app:install-update` | `installDownloadedUpdate` | `(없음)` | `BridgeResult<UpdateStateSnapshot>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 23 | `auth:change-password` | `changePassword` | `input: AuthPasswordChangeInput` | `BridgeResult<AuthSession>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 24 | `auth:get-account-recovery-availability` | `getAccountRecoveryAvailability` | `(없음)` | `BridgeResult<AccountRecoveryAvailability>` | 없음 |  |  |  |  | `register-core-handlers.ts` |
| 25 | `auth:get-session` | `getSession` | `(없음)` | `BridgeResult<AuthSession \| null>` | 없음 |  |  |  |  | `register-core-handlers.ts` |
| 26 | `auth:recover-admin-account` | `recoverAdminAccount` | `input: AccountRecoveryInput` | `BridgeResult<AccountRecoveryResult>` | 없음 |  |  |  |  | `register-core-handlers.ts` |
| 27 | `auth:sign-in` | `signIn` | `input: SignInInput` | `BridgeResult<AuthSession>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 28 | `auth:sign-out` | `signOut` | `(없음)` | `BridgeResult<null>` | 없음 |  | 예 |  |  | `register-core-handlers.ts` |
| 29 | `dashboard:export-chart-data` | `exportDashboardChartData` | `input: DashboardChartExportInput` | `BridgeResult<DashboardChartExportRecord>` | withSession |  | 예 | 저장 | 예 | `register-core-handlers.ts` |
| 30 | `dashboard:export-report` | `exportDashboardReport` | `input: DashboardReportExportInput` | `BridgeResult<DashboardReportExportRecord>` | withSession |  | 예 | 저장 | 예 | `register-core-handlers.ts` |
| 31 | `employees:apply-wage-bulk-update` | `applyWorkforceWageBulkUpdate` | `input: WorkforceWageBulkUpdateApplyInput` | `BridgeResult<WorkforceWageBulkUpdateApplySummary>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 32 | `employees:close-assignment` | `closeEmployeeAssignment` | `input: EmployeeAssignmentCloseInput` | `BridgeResult<EmployeeSiteAssignment>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 33 | `employees:close-wage-rate` | `closeEmployeeWageRate` | `input: EmployeeWageRateCloseInput` | `BridgeResult<WageRateRecord>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 34 | `employees:delete` | `deleteEmployee` | `input: EmployeeDeleteInput` | `BridgeResult<EmployeeRecord>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 35 | `employees:list` | `listEmployees` | `query?: EmployeeListQuery` | `BridgeResult<EmployeeRecord[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 36 | `employees:list-assignments` | `listEmployeeAssignments` | `employeeId: string` | `BridgeResult<EmployeeSiteAssignment[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 37 | `employees:list-wage-rates` | `listEmployeeWageRates` | `employeeId: string` | `BridgeResult<WageRateRecord[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 38 | `employees:preview-wage-bulk-update` | `previewWorkforceWageBulkUpdate` | `input: WorkforceWageBulkUpdatePreviewInput` | `BridgeResult<WorkforceWageBulkUpdatePreview>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 39 | `employees:reorder-assignment` | `reorderEmployeeAssignment` | `input: EmployeeAssignmentReorderInput` | `BridgeResult<EmployeeSiteAssignment[]>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 40 | `employees:save` | `saveEmployee` | `input: EmployeeUpsertInput` | `BridgeResult<EmployeeRecord>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 41 | `employees:save-assignment` | `saveEmployeeAssignment` | `input: EmployeeAssignmentInput` | `BridgeResult<EmployeeSiteAssignment>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 42 | `employees:save-wage-rate` | `saveEmployeeWageRate` | `input: EmployeeWageRateInput` | `BridgeResult<WageRateRecord>` | withActionPermission | employee-write | 예 |  |  | `register-workforce-handlers.ts` |
| 43 | `monthly-schedules:export-plan` | `exportMonthlySchedulePlan` | `scheduleId: string` | `BridgeResult<SchedulePlanExportRecord \| null>` | withActionPermission | schedule-deploy | 예 |  | 예 | `register-workforce-handlers.ts` |
| 44 | `monthly-schedules:list` | `listMonthlySchedules` | `siteId?: string` | `BridgeResult<MonthlyScheduleRecord[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 45 | `monthly-schedules:list-exports` | `listSchedulePlanExports` | `scheduleId?: string` | `BridgeResult<SchedulePlanExportRecord[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 46 | `monthly-schedules:preview-plan` | `previewMonthlySchedulePlan` | `scheduleId: string` | `BridgeResult<SchedulePlanPreviewRecord \| null>` | withSession |  | 예 |  |  | `register-workforce-handlers.ts` |
| 47 | `monthly-schedules:publish-export` | `publishSchedulePlanExport` | `exportId: string` | `BridgeResult<SchedulePlanExportRecord \| null>` | withActionPermission | schedule-deploy | 예 |  | 예 | `register-workforce-handlers.ts` |
| 48 | `monthly-schedules:save` | `saveMonthlySchedule` | `input: MonthlyScheduleUpsertInput` | `BridgeResult<MonthlyScheduleRecord>` | withActionPermission | schedule-deploy | 예 |  |  | `register-workforce-handlers.ts` |
| 49 | `operations:add-holiday-item` | `addHolidayItem` | `input: HolidayItemUpsertInput` | `BridgeResult<HolidayCalendar>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 50 | `operations:approve-document-template-version` | `approveDocumentTemplateVersion` | `templateId: string` | `BridgeResult<DocumentTemplateVersion>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 51 | `operations:check-database-migration-requirements` | `checkDatabaseMigrationRequirements` | `input: DatabaseMigrationRunInput` | `BridgeResult<DatabaseMigrationRequirementCheck>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 52 | `operations:delete-allowance-rate-version` | `deleteAllowanceRateVersion` | `input: AllowanceRateVersionDeleteInput` | `BridgeResult<null>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 53 | `operations:delete-document-template-version` | `deleteDocumentTemplateVersion` | `templateId: string` | `BridgeResult<null>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 54 | `operations:delete-holiday-item` | `deleteHolidayItem` | `input: HolidayItemDeleteInput` | `BridgeResult<HolidayCalendar>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 55 | `operations:delete-site-name-option` | `deleteSiteNameOption` | `input: SiteNameOptionDeleteInput` | `BridgeResult<null>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 56 | `operations:delete-user` | `deleteOperationUser` | `input: OperationUserDeleteInput` | `BridgeResult<null>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 57 | `operations:fetch-holiday-api-items` | `fetchHolidayApiItems` | `year: number` | `BridgeResult<HolidayItem[]>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 58 | `operations:get-app-settings` | `getAppSettings` | `(없음)` | `BridgeResult<AppSettingsSnapshot>` | withAdmin |  |  |  | 예 | `register-operations-handlers.ts` |
| 59 | `operations:get-file-watch-status` | `getFileWatchStatus` | `(없음)` | `BridgeResult<FileWatchStatusSnapshot>` | withAdmin |  |  |  | 예 | `register-operations-handlers.ts` |
| 60 | `operations:inspect-document-template` | `inspectDocumentTemplate` | `input: DocumentTemplateInspectInput` | `BridgeResult<DocumentTemplateValidationSnapshot & { profile: DocumentTemplateProfile }>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 61 | `operations:list-allowance-rate-history` | `listAllowanceRateHistory` | `(없음)` | `BridgeResult<AllowanceRateHistoryRecord[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 62 | `operations:list-allowance-rate-versions` | `listAllowanceRateVersions` | `year?: number` | `BridgeResult<AllowanceRateVersion[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 63 | `operations:list-document-template-history` | `listDocumentTemplateHistory` | `templateType?: TemplateType` | `BridgeResult<DocumentTemplateHistoryRecord[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 64 | `operations:list-document-template-versions` | `listDocumentTemplateVersions` | `templateType?: TemplateType` | `BridgeResult<DocumentTemplateVersion[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 65 | `operations:list-holiday-calendars` | `listHolidayCalendars` | `year?: number` | `BridgeResult<HolidayCalendar[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 66 | `operations:list-release-history` | `listReleaseHistory` | `query?: ReleaseHistoryListQuery` | `BridgeResult<ReleaseManifest[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 67 | `operations:list-site-name-options` | `listSiteNameOptions` | `(없음)` | `BridgeResult<SiteNameOptionRecord[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 68 | `operations:list-users` | `listOperationUsers` | `(없음)` | `BridgeResult<UserRecord[]>` | withAdmin |  |  |  |  | `register-operations-handlers.ts` |
| 69 | `operations:preview-database-migration-update` | `previewDatabaseMigrationUpdate` | `input: DatabaseMigrationRunInput` | `BridgeResult<DatabaseMigrationPreview>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 70 | `operations:preview-document-template` | `previewDocumentTemplate` | `input: DocumentTemplatePreviewInput` | `BridgeResult<DocumentTemplatePreviewRecord \| null>` | withAdmin |  | 예 | 저장 | 예 | `register-operations-handlers.ts` |
| 71 | `operations:rename-holiday-item` | `renameHolidayItem` | `input: HolidayItemRenameInput` | `BridgeResult<HolidayCalendar>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 72 | `operations:replace-holiday-calendar` | `replaceHolidayCalendar` | `input: HolidayCalendarReplaceInput` | `BridgeResult<HolidayCalendar>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 73 | `operations:restart-file-watch` | `restartFileWatch` | `(없음)` | `BridgeResult<FileWatchStatusSnapshot>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 74 | `operations:rotate-account-recovery-key` | `rotateAccountRecoveryKey` | `(없음)` | `BridgeResult<AccountRecoveryKeyRotationResult>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 75 | `operations:run-database-backup-now` | `runDatabaseBackupNow` | `(없음)` | `BridgeResult<DatabaseBackupSummary>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 76 | `operations:save-allowance-rate-version` | `saveAllowanceRateVersion` | `input: AllowanceRateVersionSaveInput` | `BridgeResult<AllowanceRateVersion>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 77 | `operations:save-app-settings` | `saveAppSettings` | `input: AppSettingsUpdateInput` | `BridgeResult<AppSettingsSnapshot>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 78 | `operations:save-document-template-version` | `saveDocumentTemplateVersion` | `input: DocumentTemplateSaveInput` | `BridgeResult<DocumentTemplateVersion>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 79 | `operations:save-site-name-option` | `saveSiteNameOption` | `input: SiteNameOptionSaveInput` | `BridgeResult<SiteNameOptionRecord>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 80 | `operations:save-user` | `saveOperationUser` | `input: OperationUserSaveInput` | `BridgeResult<UserRecord>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 81 | `operations:select-directory` | `selectDirectory` | `input?: DirectorySelectionInput` | `BridgeResult<string \| null>` | withAdmin |  |  | 열기(폴더) |  | `register-operations-handlers.ts` |
| 82 | `operations:select-document-template-file` | `selectDocumentTemplateFile` | `templateType?: TemplateType` | `BridgeResult<DocumentTemplateFileSelection \| null>` | withAdmin |  |  | 열기(파일) |  | `register-operations-handlers.ts` |
| 83 | `operations:select-migration-file` | `selectMigrationFile` | `input?: FileSelectionInput` | `BridgeResult<string \| null>` | withAdmin |  |  | 열기(파일) |  | `register-operations-handlers.ts` |
| 84 | `operations:select-spreadsheet-file` | `selectSpreadsheetFile` | `input?: FileSelectionInput` | `BridgeResult<LocalFileSelection \| null>` | withAdmin |  |  | 열기(파일) |  | `register-operations-handlers.ts` |
| 85 | `operations:set-default-document-template-version` | `setDefaultDocumentTemplateVersion` | `templateId: string` | `BridgeResult<DocumentTemplateVersion>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 86 | `operations:stop-file-watch` | `stopFileWatch` | `(없음)` | `BridgeResult<FileWatchStatusSnapshot>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 87 | `operations:update-database-from-migration` | `updateDatabaseFromMigration` | `input: DatabaseMigrationRunInput` | `BridgeResult<DatabaseMigrationSummary>` | withAdmin |  | 예 |  | 예 | `register-operations-handlers.ts` |
| 88 | `operations:update-document-template-output-file-name` | `updateDocumentTemplateOutputFileName` | `input: DocumentTemplateOutputFileNameUpdateInput` | `BridgeResult<DocumentTemplateVersion>` | withAdmin |  | 예 |  |  | `register-operations-handlers.ts` |
| 89 | `performance:approve` | `approvePendingFile` | `input: PerformanceApprovalActionInput` | `BridgeResult<PerformanceApprovalRecord>` | withActionPermission | performance-approval | 예 |  | 예 | `register-performance-handlers.ts` |
| 90 | `performance:finalize-reapproved-file` | `finalizeReapprovedFile` | `input: PerformanceReapprovalFinalizeInput` | `BridgeResult<PerformanceFileDetail>` | withActionPermission | performance-approval | 예 |  | 예 | `register-performance-handlers.ts` |
| 91 | `performance:get-comparison` | `getPerformanceComparison` | `query: PerformanceComparisonQuery` | `BridgeResult<PerformanceComparisonDetail \| null>` | withSession |  |  |  |  | `register-performance-handlers.ts` |
| 92 | `performance:get-file-detail` | `getPerformanceFileDetail` | `query: PerformanceFileDetailQuery` | `BridgeResult<PerformanceFileDetail \| null>` | withSession |  |  |  | 예 | `register-performance-handlers.ts` |
| 93 | `performance:get-pending-file-detail` | `getPendingFileDetail` | `fileId: string` | `BridgeResult<PerformanceFileDetail \| null>` | withSession |  |  |  |  | `register-performance-handlers.ts` |
| 94 | `performance:get-startup-recovery-status` | `getPerformanceStartupRecoveryStatus` | `(없음)` | `BridgeResult<PerformanceStartupRecoveryStatusSnapshot>` | withSession |  |  |  |  | `register-performance-handlers.ts` |
| 95 | `performance:get-sync-state` | `getPerformanceSyncState` | `(없음)` | `BridgeResult<PerformanceFileSyncStateSnapshot>` | withSession |  |  |  |  | `register-performance-handlers.ts` |
| 96 | `performance:hide-approved-row` | `hideApprovedRow` | `input: PerformanceApprovedRowHideInput` | `BridgeResult<PerformanceApprovedRowHiddenResult>` | withActionPermission | performance-approval | 예 |  |  | `register-performance-handlers.ts` |
| 97 | `performance:list-approval-history` | `listApprovalHistory` | `(없음)` | `BridgeResult<PerformanceApprovalRecord[]>` | withSession |  |  |  |  | `register-performance-handlers.ts` |
| 98 | `performance:list-files` | `listPerformanceFiles` | `query?: PerformanceFileListQuery` | `BridgeResult<PerformanceQueueItem[]>` | withSession |  |  |  | 예 | `register-performance-handlers.ts` |
| 99 | `performance:list-overview` | `listPerformanceOverview` | `query?: PerformanceOverviewQuery` | `BridgeResult<PerformanceOverviewSnapshot>` | withSession |  |  |  | 예 | `register-performance-handlers.ts` |
| 100 | `performance:list-pending-files` | `listPendingFiles` | `(없음)` | `BridgeResult<PerformanceQueueItem[]>` | withSession |  |  |  |  | `register-performance-handlers.ts` |
| 101 | `performance:open-source-file` | `openPerformanceSourceFile` | `fileId: string` | `BridgeResult<null>` | withSession |  | 예 | 경로 열기 |  | `register-performance-handlers.ts` |
| 102 | `performance:reject` | `rejectPendingFile` | `input: PerformanceRejectionInput` | `BridgeResult<PerformanceApprovalRecord>` | withActionPermission | performance-approval | 예 |  |  | `register-performance-handlers.ts` |
| 103 | `performance:retry-startup-recovery` | `retryPerformanceStartupRecovery` | `(없음)` | `BridgeResult<PerformanceStartupRecoveryStatusSnapshot>` | withSession |  |  |  | 예 | `register-performance-handlers.ts` |
| 104 | `performance:return-to-pending` | `returnApprovedFileToPending` | `input: PerformanceReapprovalFinalizeInput` | `BridgeResult<PerformanceFileDetail>` | withActionPermission | performance-approval | 예 |  | 예 | `register-performance-handlers.ts` |
| 105 | `shift-patterns:analyze-import` | `analyzeSitePatternImport` | `input: SitePatternImportAnalyzeInput` | `BridgeResult<SitePatternImportAnalysis>` | withSession |  | 예 |  |  | `register-workforce-handlers.ts` |
| 106 | `shift-patterns:deactivate` | `deactivateShiftPattern` | `input: ShiftPatternDeactivateInput` | `BridgeResult<ShiftPatternRecord>` | withActionPermission | shift-pattern-write | 예 |  |  | `register-workforce-handlers.ts` |
| 107 | `shift-patterns:list` | `listShiftPatterns` | `siteId?: string` | `BridgeResult<ShiftPatternRecord[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 108 | `shift-patterns:save` | `saveShiftPattern` | `input: ShiftPatternUpsertInput` | `BridgeResult<ShiftPatternRecord>` | withActionPermission | shift-pattern-write | 예 |  |  | `register-workforce-handlers.ts` |
| 109 | `sites:delete` | `deleteSite` | `input: SiteDeleteInput` | `BridgeResult<SiteRecord>` | withActionPermission | site-write | 예 |  |  | `register-workforce-handlers.ts` |
| 110 | `sites:list` | `listSites` | `(없음)` | `BridgeResult<SiteRecord[]>` | withSession |  |  |  |  | `register-workforce-handlers.ts` |
| 111 | `sites:save` | `saveSite` | `input: SiteUpsertInput` | `BridgeResult<SiteRecord>` | withActionPermission | site-write | 예 |  |  | `register-workforce-handlers.ts` |
