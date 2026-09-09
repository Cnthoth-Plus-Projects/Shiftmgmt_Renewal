# 창구 규약 (화면 ↔ 서버)

> 이 문서가 1-3(창구 구현)의 기준이다. 1-1에서는 이 문서와 헬퍼 뼈대만 만든다.
> 근거: Phase 1-1 셋업 지시서 v1.3 §5 · S12 · 별첨 계약표 111행 v0.2(아래 부록 = 원본 파일 사본).
> 화면 코드가 바뀌지 않도록 **채널 이름·인수·반환형(계약 111개)은 원본 0.5.4 그대로** 둔다.

## 1. 주소

- **`POST /api/<채널명>`** 1:1. 채널명은 아래 부록 계약표의 111행 그대로다(예: `employees:list`).
  - 111 = 원본 `src/preload/index.ts` 의 `ipcRenderer.invoke` 111개 = `src/main/ipc/register-*.ts` 의 `ipcMain.handle` 111개.
- `GET /api/health` 하나만 GET을 허용한다(주소창으로 서버가 살아 있는지 확인하는 용도).
- 그 밖의 `GET /api/*` 는 404다.

## 2. 요청

- `Content-Type: application/json`(`; charset=utf-8` 허용). **다른 형식은 받지 않는다** — 대화상자 채널도 JSON이다(§6).
- 본문 = **인수 JSON 배열**. 선택 인수(`query?`)를 안 넘길 때는 **배열에서 생략**한다(`[]`).
  화면 껍데기는 뒤쪽 `undefined` 를 잘라내고 보낸다(JSON `null` 로 바뀌어 원본과 달라지는 것을 막는다).
- 본문 상한 **1 MB**(초과 = 413).
- 요청은 이 프로그램 화면에서 온 것만 받는다: `Origin` 헤더가 있으면 `http://127.0.0.1:<포트>`·`http://localhost:<포트>` 와 정확히 같아야 하고,
  `Sec-Fetch-Site` 헤더가 있으면 `same-origin`·`none` 이어야 한다. 각 헤더는 있으면 독립으로 검사하고(하나라도 불신 값이면 403), 둘 다 없으면 403이다.
- `Host` 헤더가 `127.0.0.1:<포트>`·`localhost:<포트>` 와 정확히 같지 않으면 400이다.

## 3. 응답과 오류 코드

- 응답 본문은 **계약 반환형 JSON 그대로**다.
  - 110개 = `BridgeResult<T>` — `{ ok: true, data }` 또는 `{ ok: false, errorCode, message }`(원본 `src/shared/bridge/contracts.ts:869-880`).
  - **예외 1개 = `app:get-version`** → JSON 문자열(`"0.1.0"`, 원본 `contracts.ts:883`).
- 계약이 만든 결과는 실패 결과라도 **HTTP 200** 으로 보낸다(업무 실패 ≠ 통신 실패).
- 통신·검문 단계의 오류는 아래 상태로 보내되 **본문은 항상 `BridgeFailure`** 다.

| HTTP | errorCode | 언제 |
|---|---|---|
| 400 | `BAD_REQUEST` | Host 위조 · 본문이 JSON이 아님 |
| 401 | `UNAUTHORIZED` | 세션 없음 · 만료(1-3) |
| 403 | `FORBIDDEN` | Origin·Sec-Fetch-Site 검사 실패 |
| 404 | `NOT_FOUND` | 없는 채널 · 없는 파일 |
| 413 | `PAYLOAD_TOO_LARGE` | 본문 1 MB 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `application/json` 이 아님 |
| 500 | `INTERNAL_ERROR` | 처리 중 예외(원본 `getErrorMessage`) |

- 모든 응답에는 보안 헤더 4종이 붙는다: `Content-Security-Policy`(인라인 스크립트·스타일 금지) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store`. CORS 헤더는 두지 않는다.

## 4. 세션 (1-3a)

- `auth:sign-in` 이 성공하면 서버가 `crypto.randomBytes(32).toString("hex")` 로 세션 id를 새로 발급하고
  `Set-Cookie: sm_session=<id>; HttpOnly; SameSite=Strict; Path=/` 로 내려 준다(로그인마다 새로).
- 서버 메모리에 `Map<id, { session, issuedAt, lastSeenAt }>` 로 보관한다.
- 만료·갱신·로그아웃 판정은 원본 `auth-service.ts`·`ipc-auth-guard-service.ts` 의 규칙을 **그대로** 옮긴다(1-3a 지시서에서 줄 번호로 고정).
- `auth:sign-out` 이 지운다. 프로그램을 다시 켜면 전부 로그아웃이다(원본과 같은 단일 프로세스 의미).

## 5. 가드와 활동 기록 (1-3a)

- 원본 `withSession` · `withActionPermission` · `withAdmin` · `withAccessHistory`(`main.ts:78-119`)와
  `recordSuccessfulActivity`(`main.ts:126-170`)를 **같은 이름·같은 판정**으로 서버 한 곳(`src/main/http/session.ts`)에 옮긴다.
- 채널별 가드는 부록 계약표의 열이 정본이다: withAdmin 40 · withSession 35 · withActionPermission 22 · withAccessHistory 1 · 없음 13.
- 활동 기록은 계약표 「활동 기록」 열 **63채널**(핸들러가 직접 부르는 12 + `activity: trackSuccess(` 경유 51).
- 원본 `src/main/ipc/ipc-handler-helpers.ts` 는 electron 의존이 없고(import 가 shared 타입 3개뿐) 그 테스트 15개가 1-4 이관 대상이므로 **그대로 복사**해서 쓴다.
  복사 대상 헬퍼 6개와 원본 줄 번호: `runIpcAction`(:89) · `runIpcResultAction`(:108) · `runIpcActionWithCleanup`(:121) ·
  `runIpcSaveDialogAction`(:160) · `runIpcSaveDialogResultAction`(:186) · `runIpcOpenPathAction`(:210). 어느 채널이 어느 헬퍼를 쓰는지는 **1-3a 지시서에서 확정**한다.

## 6. 대화상자 채널 8개 (S12)

파일·폴더를 고르는 창은 **서버가 같은 PC의 Windows 창으로 띄운다**(0.5.4에서 보던 그 창이다).
브라우저 업로드·다운로드로 바꾸지 않는다 — 고른 경로를 서버가 계속 쓰기 때문이다.

- 요청·응답 형식은 다른 채널과 같다(`POST /api/<채널>` · `application/json` · 계약 반환형 JSON). 별도 endpoint 없음.
- 계약 인수·반환형·**취소했을 때의 값**·활동 기록은 원본 그대로다.
  - 열기(파일) 3 · 열기(폴더) 1 → 취소 = `{ ok: true, data: null }`
  - `dashboard:export-chart-data` · `dashboard:export-report` → 취소 = `{ ok: false, errorCode: "EXPORT_CANCELLED" }`
  - `operations:preview-document-template` → 취소 = `{ ok: true, data: null }`
- 실행기(1-3c에서 구현): 서버가 `powershell.exe -NoProfile -STA`(Windows PowerShell 5.1)로 `System.Windows.Forms` 의
  `OpenFileDialog`·`FolderBrowserDialog`·`SaveFileDialog` 를 띄우고(TopMost 소유 창으로 사용자 앞에 보이게), 고른 경로를 **표준출력 1줄**로 받는다.
  경로 열기는 `Start-Process <경로>`(OS 기본 연결 프로그램).
- 한 번에 창 하나(동시 호출은 앞의 것이 끝날 때까지 **차례로 하나씩**).
- `buttonLabel` 인수는 Windows 창이 지원하지 않아 **받되 무시**한다. `title`·`defaultPath`·`filters` 는 대응한다.
- **시험 방법**: 테스트에서는 대화상자 함수를 **주입**한다(원본 `runIpcOpenPathAction` 의 `openPath` 주입과 같은 방식).
  실제로 창이 뜨는 모습은 검토 단계(⑤)에서 사람이 **1회** 눈으로 확인한다.
- **아직 안 정한 것**(둘 다 1-3c 지시서에서 확정):
  ① 채널 8개 각각의 창 옵션(`title`·`filters`·`defaultPath`) 값 — **원본 핸들러의 줄 번호로 못박는다**.
  ② 폴더 선택 창의 모양(PowerShell 5.1 의 구형 트리 창 vs 7 의 신형 창) — **실측해 고정**한다.
- 1-3c 구현 필수 조건: 경로·옵션을 명령 문자열에 끼워 넣지 말고 **JSON 표준입력**으로 넘긴다 · 표준출력 UTF-8 명시 · 표준오류 분리 ·
  비정상 종료는 채널별 `BridgeFailure` 로 변환 · 서버 종료·요청 중단 시 창 프로세스 정리 · 대기열 1개 · `FolderBrowserDialog` 의 `title` 은 `Description` 으로 · `Start-Process` 도 변수의 `-FilePath` 로.

## 7. 화면 껍데기 (1-3b)

`src/web/bridge/app-bridge.ts` 가 `window.appBridge` 에 111개 메서드를 **같은 이름·같은 반환형**으로 올린다.

- 네트워크 실패 → `{ ok: false, errorCode: "NETWORK_ERROR", message: "서버에 연결할 수 없습니다. 프로그램이 켜져 있는지 확인하세요." }`
- 응답이 JSON이 아니거나 형태가 어긋남 → `{ ok: false, errorCode: "INVALID_RESPONSE", message: "서버 응답을 읽을 수 없습니다." }`
- `getAppVersion` 은 문자열을 그대로 돌려준다(실패하면 빈 문자열이 아니라 **거부**한다 — 원본과 같은 형태).

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
