# HANDOFF — Phase 1-3 S2 Operations 라우트 40개 구현

- Task: Phase 1-3 S2 — Operations 그룹 40개 채널 라우트 및 대화상자 연동 구현
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-13 17:35 KST
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `7acd06e8162777804b05c6f8f72cabdd652a9d17`
- Expected initial status: clean (`git status --short` 빈 출력)

---

# 회신 요청

**누가**: Gemini  
**어디에**: 루트 `HANDOFF.md`의 본문은 고치지 말고 맨 아래 `## 회신`만 채운다.  
**언제**: 착수 게이트 누락/충돌이면 수정 없이 즉시 `BLOCKED`; 그 외 구현·검증·커밋 후 회신.  
**회신이 없으면**: Sol 검증과 S3가 중단된다.

---

## 1. 단일 목표와 비목표

### 목표
Phase 1-3 전체 세 단계 중 두 번째 슬라이스(S2)다. S1에서 구축된 HTTP 전송 계층 및 세션/대화상자 브리지 기반 위에 **Operations 그룹 40개 채널**을 완전히 등록·연동한다.
- `src/main/http/routes/operations-routes.ts` 신규 구현: Operations 40개 채널 라우트 등록.
- 대화상자 채널 5종(`operations:select-directory`, `operations:select-migration-file`, `operations:select-spreadsheet-file`, `operations:select-document-template-file`, `operations:preview-document-template`)을 `context.dialogBridge`와 연동.
- `src/main/http/routes/index.ts` 조립: Core 17개 + Operations 40개 = **총 57개 채널 등록 및 검증**.
- `src/main/http/routes/operations-routes.test.ts` 신규 구현: 40개 채널 등록, admin 가드, 대화상자 동작, 서비스 호출 단위/통합 테스트 전건 통과.
- S2 완료 시 서버 등록 POST 채널은 **Core 17개 + Operations 40개 = 57개**이며, 미구현 54개 채널(workforce 25, performance 16, allowance 13)은 성공 스텁 없이 기존 **404 NOT_FOUND**를 정확히 유지한다.

### 비목표
- Workforce(25), Performance(16), Allowance(13) 업무 라우트 구현 (S3 대상).
- 도메인/서비스/계약 로직 변경 (`src/shared/domain/**`, `src/main/services/**`, `src/shared/bridge/contracts.ts` 등 절대 수정 금지).
- S1 기반 코드(`src/main/http/session.ts`, `src/main/http/route-registry.ts`, `src/main/http/dialog-bridge.ts`, `src/main/server.ts`, `scripts/windows-dialog.ps1` 등) 변경.
- 새 npm dependency 추가 또는 package/lock 변경.
- 브라우저 화면 UI 변경.

---

## 2. 저장소 및 기준 커밋

- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `7acd06e8162777804b05c6f8f72cabdd652a9d17` (Phase 1-3 S1 완료 커밋)
- 초기 git status: clean (`git status --short` 빈 출력)

---

## 3. 수정 허용 파일과 읽기 전용/금지 경로

### 3.1 수정/생성 허용 파일 — 닫힌 목록 (정확히 4개)

| 경로 | 요구사항 ID | 허용 변경 |
|---|---|---|
| `src/main/http/routes/operations-routes.ts` (신규) | O1, O2, O3 | Operations 40개 채널 라우트 등록 함수 구현 |
| `src/main/http/routes/operations-routes.test.ts` (신규) | O5 | Operations 라우트 단위/통합 테스트 |
| `src/main/http/routes/index.ts` (수정) | O4 | `registerOperationsRoutes` 조립 및 57개 등록 수 검증 |
| `docs/codebase-map.md` (수정) | O7 | 신규 operations routes 파일 책임 추가 |

위 4개 파일 외 제품 코드, 설정 파일, 스크립트 수정·추가는 일절 금지한다.

### 3.2 읽기 전용 / 보호 경로
- `C:\Projects\Active\ShiftMgmt_V3.4\**` (절대 읽기 전용)
- V4 `src/shared/domain/**`, `src/shared/config/**`, `src/shared/bridge/contracts.ts`, `src/shared/bridge/channel-contracts.ts`
- V4 `src/main/services/**`, `src/main/ipc/**`
- V4 `src/main/http/api-types.ts`, `src/main/http/json.ts`, `src/main/http/route-registry.ts`, `src/main/http/session.ts`, `src/main/http/dialog-bridge.ts`, `src/main/http/router.ts`, `src/main/http/routes/core-routes.ts`, `src/main/server.ts`, `src/main/runtime.ts`
- V4 `src/web/**`, `scripts/**`, `양식샘플/**`, `vendor/**`
- V4 `package.json`, `package-lock.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`
- 문서 저장소 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, `Log/**`, `Phase1/**`

---

## 4. 요구사항 ID별 대상 파일 및 세부 사양

### O1: Operations 40개 채널 라우트 등록 (`src/main/http/routes/operations-routes.ts`)
정본: 원본 V3 `src/main/ipc/register-operations-handlers.ts`
함수: `export const registerOperationsRoutes = (registry: RouteRegistry, sessionManager: SessionManager): void`
40개 채널 전수를 등록한다:

1. `operations:get-app-settings`: `getStoredAppSettingsSnapshot({ userDataPath: context.dataDir })`
2. `operations:save-app-settings`: `saveStoredAppSettings`, `restartFileWatchRuntime`, `restartDatabaseBackupRuntime` (활동: `app-settings-save` / `운영 관리` / `앱 운영 설정 저장`)
3. `operations:select-directory`: (O2 대화상자 참조)
4. `operations:select-migration-file`: (O2 대화상자 참조)
5. `operations:select-spreadsheet-file`: (O2 대화상자 참조)
6. `operations:check-database-migration-requirements`: `assertSupportedDatabaseRestoreFile`, `checkDatabaseMigrationRequirements`
7. `operations:preview-database-migration-update`: `stopFileWatchRuntime` 후 `runIpcActionWithCleanup` (`previewDatabaseMigrationUpdate`, cleanup `restartFileWatchRuntime`) (활동: `database-migration-preview` / `운영 관리` / `DB 복원 미리보기`)
8. `operations:update-database-from-migration`: `stopFileWatchRuntime` 후 `runIpcActionWithCleanup` (`runDatabaseMigrationUpdate`, cleanup `restartFileWatchRuntime`) (활동: `database-migration-update` / `운영 관리` / `DB 복원 반영`)
9. `operations:run-database-backup-now`: `runDatabaseBackupNow` (활동: `database-backup-run` / `운영 관리` / `DB 수동 백업`)
10. `operations:get-file-watch-status`: `getFileWatchStatusSnapshot({ userDataPath: context.dataDir })`
11. `operations:restart-file-watch`: `restartFileWatchRuntime` (활동: `file-watch-restart` / `운영 관리` / `파일 감시 재시작`)
12. `operations:stop-file-watch`: `stopFileWatchRuntime` (활동: `file-watch-stop` / `운영 관리` / `파일 감시 중지`)
13. `operations:list-holiday-calendars`: `listStoredHolidayCalendars(year)`
14. `operations:fetch-holiday-api-items`: `fetchHolidayApiItems({ baseUrl: settings.holidayApiBaseUrl, year })` (활동: `holiday-fetch` / `운영 관리` / `${year}년 공휴일 불러오기`)
15. `operations:add-holiday-item`: `saveStoredHolidayItem(input)` (활동: `holiday-save` / `운영 관리` / `${input.holidayDate} 공휴일 등록`)
16. `operations:rename-holiday-item`: `renameStoredHolidayItem(input)` (활동: `holiday-rename` / `운영 관리` / `공휴일명 수정`)
17. `operations:delete-holiday-item`: `deleteStoredHolidayItem(input)` (활동: `holiday-delete` / `운영 관리` / `공휴일 삭제`)
18. `operations:replace-holiday-calendar`: `replaceStoredHolidayCalendar(input)` (활동: `holiday-replace` / `운영 관리` / `${input.year}년 공휴일 일괄 반영`)
19. `operations:list-allowance-rate-versions`: `listStoredAllowanceRateVersions(year)`
20. `operations:list-allowance-rate-history`: `listStoredAllowanceRateHistory()`
21. `operations:list-release-history`: `listReleaseHistory(query)`
22. `operations:save-allowance-rate-version`: `saveStoredAllowanceRateVersion(input)` (활동: `allowance-rate-save` / `운영 관리` / input.changeReason에 따른 details)
23. `operations:delete-allowance-rate-version`: `deleteStoredAllowanceRateVersion(input.rateVersionId)` (활동: `allowance-rate-delete` / `운영 관리` / `요율 버전 삭제`)
24. `operations:list-users`: `listStoredOperationUsers()`
25. `operations:save-user`: `saveStoredOperationUser(input)` (활동: `user-save` / `운영 관리` / `${input.loginId} 사용자 저장`)
26. `operations:delete-user`: `deleteStoredOperationUser(input.userId)` (활동: `user-delete` / `운영 관리` / `사용자 삭제`)
27. `operations:rotate-account-recovery-key`: `rotateAdminAccountRecoveryKey` (활동: `account-recovery-key-rotate` / `운영 관리` / `admin 계정복구키 발급`, session: context.session)
28. `operations:list-site-name-options`: `listStoredSiteNameOptions()`
29. `operations:save-site-name-option`: `saveStoredSiteNameOption(input)` (활동: `site-name-save` / `운영 관리` / `${input.name} 사이트 명 저장`)
30. `operations:delete-site-name-option`: `deleteStoredSiteNameOption(input)` (활동: `site-name-delete` / `운영 관리` / `사이트 명 삭제`)
31. `operations:list-document-template-history`: `listStoredDocumentTemplateHistory(templateType)`
32. `operations:select-document-template-file`: (O2 대화상자 참조)
33. `operations:inspect-document-template`: `inspectDocumentTemplateImport(input)` (활동: `template-inspect` / `운영 관리` / `${documentTemplateLabelByType[input.templateType]} 양식 검증`)
34. `operations:preview-document-template`: (O2 대화상자 참조)
35. `operations:save-document-template-version`: `saveManagedDocumentTemplateVersion(input, { userDataPath: context.dataDir })` (활동: `template-save` / `운영 관리` / `${documentTemplateLabelByType[input.templateType]} 양식 등록`)
36. `operations:approve-document-template-version`: `approveManagedDocumentTemplateVersion(templateId)` (활동: `template-approve` / `운영 관리` / `양식 승인`)
37. `operations:set-default-document-template-version`: `setStoredDefaultDocumentTemplateVersion(templateId)` (활동: `template-set-default` / `운영 관리` / `기본 양식 지정`)
38. `operations:update-document-template-output-file-name`: `updateStoredDocumentTemplateOutputFileNamePattern(input)` (활동: `template-file-name-update` / `운영 관리` / `출력 파일명 규칙 저장`)
39. `operations:delete-document-template-version`: `deleteManagedDocumentTemplateVersion(templateId, { userDataPath: context.dataDir })` (활동: `template-delete` / `운영 관리` / `양식 삭제`)
40. `operations:list-document-template-versions`: `listStoredDocumentTemplateVersions(templateType)`

### O2: 대화상자 채널 5종 연동 (`src/main/http/routes/operations-routes.ts`)
`context.dialogBridge`를 사용하여 플랫폼 독립적 Windows 대화상자를 호출한다:
1. `operations:select-directory`:
   - `operation: "openFolder"`, `title: input?.title ?? "폴더 선택"`, `defaultPath: input?.defaultPath`
   - 취소 시 `{ ok: true, data: null }`
   - 선택 시 `{ ok: true, data: dialogResult.path }`
2. `operations:select-migration-file`:
   - `operation: "openFile"`, `title: input?.title ?? "복원 파일 선택"`, `defaultPath: input?.defaultPath`, `filters: [{ name: "복원 파일", extensions: ["json", "accdb"] }]`
   - 취소 시 `{ ok: true, data: null }`
   - 선택 시 `!isSupportedDatabaseMigrationFilePath(selectedFilePath)`이면 `createIpcFailure("DATABASE_RESTORE_FILE_REQUIRED", "DB복구는 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 선택할 수 있습니다.")` 반환
   - 유효 파일이면 `{ ok: true, data: selectedFilePath }`
3. `operations:select-spreadsheet-file`:
   - `operation: "openFile"`, `title: input?.title ?? "Excel 파일 선택"`, `defaultPath: input?.defaultPath`, `filters: [{ name: "Excel Workbook", extensions: ["xlsx", "xlsm"] }]`
   - 취소 시 `{ ok: true, data: null }`
   - 선택 시 `{ ok: true, data: { fileName: path.basename(filePath), filePath } }`
4. `operations:select-document-template-file`:
   - `operation: "openFile"`, `title: "양식 파일 선택"`, `filters: [{ name: templateType === "schedule" ? "근무표 Excel 양식" : "Excel 양식 파일", extensions: ["xlsx", "xlsm"] }]`
   - 취소 시 `{ ok: true, data: null }`
   - 선택 시 `{ ok: true, data: { fileName: path.basename(filePath), filePath } }`
5. `operations:preview-document-template`:
   - 저장 경로 계산: `settings.scheduleExportDir` 하위 `template-previews/${input.templateType}`에 `${label}_${versionSegment}_preview.xlsx`
   - `operation: "saveFile"`, `title: "양식 미리보기 저장"`, `defaultPath`, `filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }]`, `showOverwriteConfirmation: true`
   - `runIpcSaveDialogAction`을 사용하여 취소 시 `{ ok: true, data: null }`, 경로 선택 시 `previewDocumentTemplateFile(input, { outputPath })` 실행 및 활동 기록(`template-preview`) 1회.

### O3: 세션/가드 및 활동 기록 보존
- 40개 채널은 이미 `CHANNEL_CONTRACTS`에 `guard: "admin"`으로 선언되어 있으므로, `RouteRegistry.dispatch`에서 `sessionManager.requireRoleSession("admin", cookie)` 검사가 자동으로 선행된다.
- 성공 활동 기록이 필요한 27개 채널은 원본과 동일하게 `sessionManager.recordSuccessfulActivity`를 통해 `actionType`, `routeKey: "operations"`, `routeLabel: "운영 관리"`, `details`를 기록한다.

### O4: 전체 라우트 조립 (`src/main/http/routes/index.ts`)
- `registerOperationsRoutes(registry, sessionManager)` 호출 추가.
- 등록 수 검증:
  ```typescript
  const expectedTotal = CORE_CHANNELS.length + OPERATIONS_CHANNELS.length; // 17 + 40 = 57
  if (registered.length !== expectedTotal) {
    throw new Error(`S2 registered route count mismatch: expected ${expectedTotal}, got ${registered.length}`);
  }
  ```
- `CORE_CHANNELS` 및 `OPERATIONS_CHANNELS` 전수 등록 확인 루프.
- 미등록 채널 54개(workforce, performance, allowance)는 등록하지 않으므로 HTTP 요청 시 404 `NOT_FOUND` 유지.

### O5: 테스트 작성 (`src/main/http/routes/operations-routes.test.ts`)
- 40개 채널이 `registry.has(channel)`로 모두 등록되었는지 확인.
- 미인증 요청(쿠키 없음) 시 401 `AUTH_SESSION_REQUIRED` 반환 확인.
- 비admin 역할 세션(예: role: "user") 요청 시 200 `AUTH_FORBIDDEN` 반환 확인.
- admin 세션 시 각 채널 정상 dispatch 확인 (주요 서비스 mocking/stubbing).
- 대화상자 채널 5종의 취소(null 반환) 및 선택 시 동작 확인.
- `operations:select-migration-file` 확장자 검증 음성 테스트 통과 확인.

### O6: 전체 게이트 통과
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run validate:map`, `npm run smoke`, `npm run release:check` 전건 종료 코드 0.

### O7: 코드베이스 맵 갱신 (`docs/codebase-map.md`)
- `src/main/http/routes/operations-routes.ts`, `src/main/http/routes/operations-routes.test.ts` 항목 추가.

---

## 5. 순서 있는 구현 전략

1. **1단계 (`operations-routes.ts` 구현)**:
   - `register-operations-handlers.ts`를 바탕으로 `src/main/http/routes/operations-routes.ts` 작성.
   - `getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "처리 중 오류가 발생했습니다."` 정의.
   - `trackSuccess` 헬퍼 작성: `sessionManager.recordSuccessfulActivity` 호출 래퍼.
   - 40개 채널 순차 등록.
2. **2단계 (`routes/index.ts` 갱신)**:
   - `registerOperationsRoutes`를 `assembleRoutes`에 연결.
   - 채널 수 57개 검증 로직 추가.
3. **3단계 (`operations-routes.test.ts` 작성)**:
   - 등록 전수 검증, 권한 차단 검증, 대화상자 취소/선택 검증, 주요 라우트 성공 응답 검증.
4. **4단계 (`docs/codebase-map.md` 갱신)**:
   - 신규 파일 추가 및 설명 기재.
5. **5단계 (전체 게이트 검증 및 커밋)**:
   - 전체 검증 명령어 순차 실행.
   - 커밋 메시지: `feat: add phase 1-3 operations routes`

---

## 6. 불변조건 및 과거 함정 주의사항

1. **보호 경로 절대 수정 금지**: `src/shared/domain/**`, `src/shared/config/**`, `src/shared/bridge/contracts.ts`, `src/main/services/**`, `src/main/ipc/**`, `package.json` 등은 diff 0이어야 한다.
2. **중간 성공 스텁 금지**: 아직 구현하지 않은 54개 채널(workforce, performance, allowance)을 위해 가짜 응답을 만들지 않는다. 반드시 404가 나와야 한다.
3. **대화상자 취소 값 정합**: 대화상자 5개 채널은 취소 시 예외를 던지거나 실패 객체를 반환하는 것이 아니라 `{ ok: true, data: null }`을 반환한다.
4. **`context.dataDir` 사용**: 원본의 `app.getPath("userData")`를 `context.dataDir`로 치환한다.
5. **JSON parse/배열 보존**: 본문 검증은 이미 S1 서버 레이어에서 수행하므로, 라우트 핸들러에서는 `args[0]`을 올바른 타입으로 캐스팅하여 사용한다.

---

## 7. 실행할 명령 및 검증 게이트

아래 명령을 순서대로 실행하고 결과를 기록한다:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:map
npm run smoke
npm run release:check
git status --short
```

기대 결과:
- 모든 명령 종료 코드 0.
- `npm test`: 기존 46개 테스트 통과 + 신규 operations 테스트 통과.
- `git status --short`: clean (커밋 완료 후 빈 출력).

### 반드시 확인할 음성 테스트 (Negative Tests)
- **ON1 (무인증 차단)**: 쿠키 없이 `operations:get-app-settings` 호출 -> HTTP 401 `AUTH_SESSION_REQUIRED`.
- **ON2 (비admin 권한 차단)**: `role: "user"`인 쿠키로 `operations:get-app-settings` 호출 -> HTTP 200 `{ ok: false, errorCode: "AUTH_FORBIDDEN" }`.
- **ON3 (복원 파일 확장자 거절)**: `operations:select-migration-file`에서 `.xlsx` 파일 선택 시뮬레이션 -> `{ ok: false, errorCode: "DATABASE_RESTORE_FILE_REQUIRED" }`.
- **ON4 (대화상자 취소 보존)**: `operations:select-directory`, `operations:select-migration-file`, `operations:select-spreadsheet-file`, `operations:select-document-template-file`, `operations:preview-document-template` 5종 취소 시 `{ ok: true, data: null }`.
- **ON5 (미구현 채널 404 유지)**: `workforce:list-users`, `performance:get-overtime-summary`, `allowance:list-history` 등 54개 미구현 채널 호출 -> HTTP 404 `NOT_FOUND`.
- **ON6 (비배열 본문 400 거절)**: `operations:get-app-settings`에 `{}` 전달 -> HTTP 400 `BAD_REQUEST`.

---

## 8. UI 작업 여부
- 해당 없음 (전송 계층 백엔드 라우트 구현).

---

## 9. 회신 증거 형식

`HANDOFF.md`의 `## 회신` 칸에 아래 형식으로 작성한다 (HTML 주석 금지):

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / 7acd06e8162777804b05c6f8f72cabdd652a9d17 / <최종커밋>
초기 상태: clean
변경 파일:
- src/main/http/routes/operations-routes.ts: O1, O2, O3 Operations 40개 채널 라우트 구현
- src/main/http/routes/operations-routes.test.ts: O5 Operations 라우트 단위/통합 테스트
- src/main/http/routes/index.ts: O4 57개 채널 조립 및 검증
- docs/codebase-map.md: O7 코드베이스 맵 갱신
범위 밖 변경: 0개
요구사항 대조:
- O1: operations-routes.ts 40개 채널 등록 — PASS
- O2: 대화상자 채널 5종 연동 — PASS
- O3: withAdmin 가드 및 활동 기록 보존 — PASS
- O4: routes/index.ts 총 57개 검증 — PASS
- O5: operations-routes.test.ts 테스트 — PASS
- O6: 전체 게이트 7종 RC 0 — PASS
- O7: docs/codebase-map.md 최신화 — PASS
검증 증거:
- npm run typecheck — 종료 코드 0 — <시각>
- npm run lint — 종료 코드 0 — <시각>
- npm test — 종료 코드 0 — <테스트 통과 수> — <시각>
- npm run build — 종료 코드 0 — <시각>
- npm run validate:map — 종료 코드 0 — <시각>
- npm run smoke — 종료 코드 0 — <시각>
- npm run release:check — 종료 코드 0 — <시각>
음성 테스트:
- ON1 (무인증 401): 기대 401 — 실제 <결과>
- ON2 (권한부족 200 AUTH_FORBIDDEN): 기대 AUTH_FORBIDDEN — 실제 <결과>
- ON3 (복원 파일 확장자 오류): 기대 DATABASE_RESTORE_FILE_REQUIRED — 실제 <결과>
- ON4 (대화상자 5종 취소): 기대 ok: true, data: null — 실제 <결과>
- ON5 (54개 채널 404): 기대 404 NOT_FOUND — 실제 <결과>
- ON6 (비배열 400): 기대 400 BAD_REQUEST — 실제 <결과>
diff 요약: <추가/삭제 줄 수>
전체 SHA-256:
- src/main/http/routes/operations-routes.ts: <64자 해시>
- src/main/http/routes/operations-routes.test.ts: <64자 해시>
- src/main/http/routes/index.ts: <64자 해시>
- docs/codebase-map.md: <64자 해시>
보호 경로 diff:
- git diff --exit-code 7acd06e... HEAD -- src/shared/domain src/shared/config src/shared/bridge/contracts.ts src/shared/bridge/channel-contracts.ts src/main/services src/main/ipc package.json: RC 0
미해결/가정: 없음
```

---

## 10. 즉시 중단 조건

- baseline 커밋이 `7acd06e8162777804b05c6f8f72cabdd652a9d17`과 다름.
- 보호 경로(`src/shared/domain/**`, `src/shared/config/**`, `src/shared/bridge/contracts.ts`, `src/shared/bridge/channel-contracts.ts`, `src/main/services/**`, `src/main/ipc/**`, `package.json` 등) 수정이 필요하다고 판단됨.
- 닫힌 허용 목록 4개 외 파일 수정이 필요함.
- 미구현 54개 채널을 404가 아닌 임의 스텁으로 등록해야 한다고 판단됨.
- 대화상자 처리에 브라우저 upload/download가 필요하다고 판단됨.
- 테스트를 임의 완화하거나 skip해야 통과된다고 판단됨.
위 조건 발생 시 파일 수정을 중단하고 즉시 `BLOCKED`로 회신할 것.

---

## 회신

(Gemini는 이 아래 칸만 채우고 위 본문은 절대 수정하지 않는다)
