# HANDOFF — Phase 1-3 S2 보정 2차: Operations 시험 거짓 통과 제거

**From:** Sol xhigh (유일 오케스트레이터)  
**To:** Gemini (제품 코드 작성자)  
**날짜:** 2026-09-13 KST  
**판정:** 보정 1차 `REJECT` — 런타임 구현은 유지하고 시험 증거만 보정  
**현재 기준:** `C:\Projects\Active\ShiftMgmt_V4` / `main` / `43532a63d52150b01ed10add4b0de0127ea65d61` / clean  
**수정 허용:** `src/main/http/routes/operations-routes.test.ts` 정확히 1개  
**금지:** route·service·shared·HTTP·문서·설정·dependency 수정, reset/stash/checkout, 테스트 약화

# 회신 요청

1. 이 파일을 끝까지 읽고 §2의 HEAD·상태·SHA를 수정 전에 대조한다.
2. 불일치하면 어떤 파일도 수정하지 말고 `BLOCKED`로 회신한다.
3. 일치하면 §4를 순서대로 구현한다. 작업 위치는 V4 저장소뿐이다.
4. `HANDOFF.md`의 이 줄 위 요청 본문은 고치지 말고 맨 아래 `## 회신` 코드블록만 실제 값으로 채운다.
5. 이 라운드는 같은 S2 시험-증거 결함군의 두 번째이자 마지막 Gemini 보정이다. 같은 결함군이 다시 남으면 Sol이 핑퐁을 중단하고 직접 재설계한다.

---

## 1. 보정 1차 판정과 수정 목적

보정 1차 커밋 `43532a63d52150b01ed10add4b0de0127ea65d61`은 다음 기계 상태를 통과했다.

- branch `main`, parent `7acd06e8162777804b05c6f8f72cabdd652a9d17`, 최종 worktree clean.
- 최종 6경로와 SHA는 회신 값과 일치.
- `typecheck`, `lint`, 전체 `test` 57/57, `build`, `validate:map`, `smoke`, `release:check` 전부 RC 0.
- `operations-routes.ts` SHA `80463BDF909B65E02A8496A062050A709826F40251F5F7CF37BC17FE66AE67D9`는 첫 S2 제출과 바이트 단위 동일하다. V3↔V4 40개 handler 의미 전수대조도 유지된다.
- C1 core 17 분리, aggregate 57/미등록 54, 실제 HTTP Operations `{}` 400, 실제 S3 계약 `allowance:list-history` 404는 충족했다.

그러나 보정의 목적은 단순한 녹색 실행이 아니라 요구한 회귀를 실제로 잡는 시험이다. 현재 `operations-routes.test.ts`에는 다음 거짓 통과 구멍이 있어 보정 1차를 승인하지 않는다.

| ID | 현재 시험 | 결함과 재현 가능한 거짓 통과 |
|---|---|---|
| R2-1 | `:328-366` 40개 dispatch | status/body와 activity 횟수만 검사한다. handler가 기대 service를 부르지 않고 success를 반환해도 여러 채널이 통과한다. |
| R2-2 | `:328-366` activity | 25개 대상의 `routeKey`·`routeLabel`만 검사한다. `actionType`이나 동적 `details`가 틀려도 통과한다. 독립 literal expected map도 없다. |
| R2-3 | `:491-596` dialog 성공 | directory의 `operation/title`만 부분 검사한다. migration·spreadsheet·template·preview request의 title/defaultPath/filter/overwrite 회귀를 잡지 못한다. |
| R2-4 | `:598-675` dataDir | 같은 spy의 과거 호출을 공유한다. 예를 들어 holiday/template settings lookup이나 직접 restart가 사라져도 앞선 호출이 `toHaveBeenCalledWith`를 만족시킬 수 있다. |
| R2-5 | `:677-735` migration cleanup | preview만 성공/실패 순서를 검사한다. update 경로의 `stop → action → restart`, 실패 cleanup/error/activity 0은 미검증이다. |
| R2-6 | `:418-450` CN4 | 시험명은 service 0을 주장하지만 실제 assertion은 activity 0뿐이다. 권한 guard 뒤 handler service가 실행돼도 검출하지 못한다. |
| R2-7 | 보정 1차 회신 `:313-319` | ‘시작 SHA-256’ 6개 중 4개가 발송본 §2.2 필수 착수 SHA와 다르다. 해시 불일치 시 BLOCKED해야 한다는 프로토콜도 지키지 않았다. |

R2-7은 **회신/증거 정확성 결함**이다. 보존 자료만으로 불일치 원인·의도 또는 그 시점의 파일 내용을 판정할 수 없으므로 거짓말이나 런타임 제품 결함으로 단정하지 않는다.

이번 목적은 R2-1~R2-6의 시험 증거를 `operations-routes.test.ts` 하나에서 닫고, R2-7은 회신에서 사실로 ACK하여 기록을 정정하는 것이다. 새 시험이 실제 handler 의미 결함을 드러내면 제품 코드를 고치지 말고 `BLOCKED`로 회신한다.

---

## 2. 착수 게이트 — 수정 전에 그대로 대조

### 2.1 Git 상태

```text
repository C:\Projects\Active\ShiftMgmt_V4
branch main
HEAD 43532a63d52150b01ed10add4b0de0127ea65d61
parent 7acd06e8162777804b05c6f8f72cabdd652a9d17
git status --short = 빈 출력
```

실행:

```powershell
git branch --show-current
git rev-parse HEAD
git rev-parse HEAD^
git status --short
```

하나라도 다르면 중단한다. 현재 clean commit을 reset, amend, rebase, stash, checkout하지 않는다.

### 2.2 현재 6파일 고정 해시

| 파일 | SHA-256 | 바이트 | 이번 처리 |
|---|---|---:|---|
| `docs/codebase-map.md` | `9A45CC4621EA9F8E47387CC6A8EECE292B52D189F8BC3EA593FE733AE1B7E61D` | 8,341 | 불변 |
| `src/main/http/routes/index.ts` | `25FDE07B0C73464CEE2E22CF21921E4D9C9F2DE34E48FB8E18B0817E014695B8` | 1,380 | 불변 |
| `src/main/http/routes/operations-routes.ts` | `80463BDF909B65E02A8496A062050A709826F40251F5F7CF37BC17FE66AE67D9` | 27,791 | 불변 |
| `src/main/http/routes/operations-routes.test.ts` | `989BED674C7CDF9B7D8DAFA5749F763B72EFF25139AAD346780AE3062712730E` | 30,787 | 유일한 수정 대상 |
| `src/main/http/routes/core-routes.test.ts` | `56375D5B1D30FED2118EF86B2FCA3CEBA9F7C5E0D988178101F47653F1899635` | 8,304 | 불변 |
| `src/main/server.test.ts` | `2893471DFCDBA4DED191C9E61A667F5133E6FD76B16FA501FCB6EA911711EE5A` | 14,564 | 불변 |

PowerShell의 `Get-FileHash -Algorithm SHA256`과 `(Get-Item ...).Length`로 확인한다. 1개라도 다르면 중단한다.

### 2.3 정본과 수신 기록

- S2 원 패킷: `Phase1/07-1-3-S2-Gemini-구현패킷-v1.0.md`, SHA `FBDF1159B62A7CAE300BB8BFCFCDDCD7E5A762890B57A40CE97D016218FBAFF5`, 21,513 B.
- 보정 1차 패킷: `Phase1/08-1-3-S2-Gemini-보정패킷-v1.0.md`, SHA `417D3E78AC873D26334D23FD4E3CB700B2C3AAAA944034106C5036126F6AD4D9`, 18,118 B.
- 보정 1차 수신원본: `Log/20260913_193843_1-3-S2-보정1-Gemini-IMPLEMENTED_수신원본.md`, SHA `377C407690E72F20D85DB81F8ADE608C4D49569F813BEE00D7CB8AB854016CA5`, 23,997 B.
- 수신 요청 본문은 보정 1차 정본의 `## 회신` 위 본문과 글자 단위 동일했다.

보정 1차 회신의 착수 해시 불일치 4건은 다음과 같다.

| 파일 | 발송본의 필수 착수 SHA | 보정 1차 회신이 적은 ‘시작 SHA’ |
|---|---|---|
| `index.ts` | `7D6481370279B03F37BBD19BBF281FAA4F9AF62A8B5B6ECFDC483C95DC4BEE76` | `3C2237F02888EC0BF70A065406FA211BEBA840DF641E7A31C824E31665D4EEAA` |
| `operations-routes.test.ts` | `EAED7176C04013C89F16D8E0798823F0FE1E62A92B71187FEFB64008AF67F2C3` | `51221D39CDBC6E1CDDF9DAA6D0251F41029DE029FEF0B2384C626C153B8EB82E` |
| `core-routes.test.ts` | `C6514941F803D8A5CC378E3EB03692D1F644BF938712E67DE1088D3A3BE570DD` | `F1FFBF2FFFC4101DC46ED2C833076E4B1CDDCE6B8470AFBEA6E6A266EE5E5681` |
| `server.test.ts` | `BF149A7DF8B57428685A0CA76FBD46F438102272CD91EA6D956772A4C50A1463` | `BFDE378619DF37DA099EAC01B79CDA7DC4DBFEA02A44B237C5DF783AF8B62BF8` |

회신에는 이 표를 `ACK`하고, 원인을 입증할 수 없으면 추측하지 말고 `원인 확인 불가`라고 적는다. 이것은 파일 수정 과제가 아니다.

---

## 3. 닫힌 수정 경계

최종 commit의 parent `43532a63d52150b01ed10add4b0de0127ea65d61` 대비 변경 경로는 정확히 하나여야 한다.

```text
M src/main/http/routes/operations-routes.test.ts
```

특히 아래는 전부 불변이다.

```text
docs/codebase-map.md
src/main/http/routes/index.ts
src/main/http/routes/operations-routes.ts
src/main/http/routes/core-routes.test.ts
src/main/server.test.ts
src/shared/**
src/main/services/**
src/main/ipc/**
src/main/http/{session,route-registry,dialog-bridge,router,json,api-types}.ts
src/web/**
scripts/**
package.json
package-lock.json
tsconfig*.json
vitest.config.ts
eslint.config.mjs
```

`.skip`, `.todo`, `.only`, 조건부 bypass, snapshot 갱신, 새 dependency, 실제 DB/사용자 데이터/파일 감시 사용은 금지한다. unrelated formatting·import 일괄정렬·이름 일괄변경도 하지 않는다.

---

## 4. 구현 전략 — 순서대로 수행

### R2-0. mock 안전 규칙

- 기존 `vi.hoisted` mock reference, `setupTestEnv`, `validArgsMap`을 재사용한다.
- 호출 격리는 `vi.clearAllMocks()` 또는 각 spy의 `mockClear()`로 한다. `mockReset()`, `vi.resetAllMocks()`, `restoreAllMocks()`는 쓰지 않는다. hoisted mock의 기본 return implementation을 잃으면 다른 case가 가짜 실패/성공할 수 있다.
- 실패·순서 시험의 임시 동작은 `mockRejectedValueOnce` 또는 `mockImplementationOnce`만 쓴다. 영구 `mockImplementation`을 남기지 않는다.
- 독립 case마다 새 `setupTestEnv()`와 새 registry/context를 만든다.
- 공통 `dispatchAsAdmin` helper를 만들어 cookie, signal, version, dataDir, dialogBridge가 매번 같은 방식으로 주입되게 한다. dialog request의 두 번째 인수는 그 case에서 만든 `signal`과 동일 객체인지 검사한다.
- 기대값은 production route 객체나 `recordsActivity` 값을 복사해 런타임에 생성하지 않는다. key 집합 대조에 manifest를 쓰는 것은 허용하지만 `actionType/details/service args/dialog request`는 아래 literal 정본으로 둔다.

### R2-1. 40/40 service/effect 전수 증거

`validArgsMap`과 별개로 Operations 40개 각각에 `args`와 관찰할 effect spy/정확한 인수를 갖는 descriptor map을 만든다. 두 map의 key 집합을 각각 `OPERATIONS_CHANNELS`와 exact sort-equal로 검사한다.

각 loop는 다음 순서를 지킨다.

1. `vi.clearAllMocks()`.
2. 새 env와 registry 생성.
3. 해당 channel dispatch.
4. status 200, `body.ok === true`.
5. descriptor에 적은 각 spy가 정확히 1회 호출되고 정확한 인수를 받았는지 검사.
6. activity 대상이면 R2-2의 exact log 한 건, 비대상이면 0건 검사.

필수 effect 표:

| # | 채널 | 반드시 증명할 effect와 인수 |
|---:|---|---|
| 1 | `get-app-settings` | `getStoredAppSettingsSnapshot({userDataPath:dataDir})` |
| 2 | `save-app-settings` | `saveStoredAppSettings(input,{userDataPath:dataDir})`, watch restart, backup restart 각각 1회 |
| 3 | `select-directory` | 해당 case의 `showDialog` 1회; exact request는 R2-3 |
| 4 | `select-migration-file` | `showDialog` 1회; `.json` success |
| 5 | `select-spreadsheet-file` | `showDialog` 1회; `{fileName,filePath}` exact |
| 6 | `check-database-migration-requirements` | `checkDatabaseMigrationRequirements({migrationFilePath})` |
| 7 | `preview-database-migration-update` | stop, `previewDatabaseMigrationUpdate({userDataPath,migrationFilePath,selectedAccessTables})`, restart 각각 1회 |
| 8 | `update-database-from-migration` | stop, `runDatabaseMigrationUpdate({userDataPath,migrationFilePath,selectedAccessTables})`, restart 각각 1회 |
| 9 | `run-database-backup-now` | `runDatabaseBackupNow({userDataPath:dataDir})` |
| 10 | `get-file-watch-status` | `getFileWatchStatusSnapshot({userDataPath:dataDir})` |
| 11 | `restart-file-watch` | `restartFileWatchRuntime({userDataPath:dataDir})` |
| 12 | `stop-file-watch` | `stopFileWatchRuntime({userDataPath:dataDir})` |
| 13 | `list-holiday-calendars` | `listStoredHolidayCalendars(2026)` |
| 14 | `fetch-holiday-api-items` | settings lookup 1회 + `fetchHolidayApiItems({baseUrl:"https://api.test/holidays",year:2026})` |
| 15 | `add-holiday-item` | `saveStoredHolidayItem(input)` |
| 16 | `rename-holiday-item` | `renameStoredHolidayItem(input)` |
| 17 | `delete-holiday-item` | `deleteStoredHolidayItem(input)` |
| 18 | `replace-holiday-calendar` | `replaceStoredHolidayCalendar(input)` |
| 19 | `list-allowance-rate-versions` | `listStoredAllowanceRateVersions(2026)` |
| 20 | `list-allowance-rate-history` | `listStoredAllowanceRateHistory()` |
| 21 | `list-release-history` | `listReleaseHistory({page:1,pageSize:10})` |
| 22 | `save-allowance-rate-version` | `saveStoredAllowanceRateVersion(input)` |
| 23 | `delete-allowance-rate-version` | `deleteStoredAllowanceRateVersion("rate-1")` |
| 24 | `list-users` | `listStoredOperationUsers()` |
| 25 | `save-user` | `saveStoredOperationUser(input)` |
| 26 | `delete-user` | `deleteStoredOperationUser("user-9")` |
| 27 | `rotate-account-recovery-key` | `rotateAdminAccountRecoveryKey()` |
| 28 | `list-site-name-options` | `listStoredSiteNameOptions()` |
| 29 | `save-site-name-option` | `saveStoredSiteNameOption(input)` |
| 30 | `delete-site-name-option` | `deleteStoredSiteNameOption(input)` |
| 31 | `list-document-template-history` | `listStoredDocumentTemplateHistory("schedule")` |
| 32 | `select-document-template-file` | `showDialog` 1회 + `{fileName,filePath}` exact |
| 33 | `inspect-document-template` | `inspectDocumentTemplateImport(input)` |
| 34 | `preview-document-template` | settings lookup 1회, `showDialog` 1회, `previewDocumentTemplateFile(input,{outputPath})` 1회 |
| 35 | `save-document-template-version` | `saveManagedDocumentTemplateVersion(input,{userDataPath:dataDir})` |
| 36 | `approve-document-template-version` | `approveManagedDocumentTemplateVersion("tpl-1")` |
| 37 | `set-default-document-template-version` | `setStoredDefaultDocumentTemplateVersion("tpl-1")` |
| 38 | `update-document-template-output-file-name` | `updateStoredDocumentTemplateOutputFileNamePattern(input)` |
| 39 | `delete-document-template-version` | `deleteManagedDocumentTemplateVersion("tpl-1",{userDataPath:dataDir})` |
| 40 | `list-document-template-versions` | `listStoredDocumentTemplateVersions("schedule")` |

인수의 `input`은 반드시 `validArgsMap[channel][0]`과 exact equal이어야 한다. `expect.anything()`이나 넓은 `objectContaining`만으로 primary service 인수를 덮지 않는다. 반환 shape가 계약상 의미 있는 dialog 4개와 failure 별도 case는 exact body도 검사한다.

### R2-2. activity 25개 literal exact map

아래 25개를 시험 코드에 독립 literal map으로 둔다. 공통 기대는 `routeKey: "operations"`, `routeLabel: "운영 관리"`다.

```ts
const expectedActivities = {
  "operations:save-app-settings": ["app-settings-save", "앱 운영 설정 저장"],
  "operations:preview-database-migration-update": ["database-migration-preview", "DB 복원 미리보기"],
  "operations:update-database-from-migration": ["database-migration-update", "DB 복원 반영"],
  "operations:run-database-backup-now": ["database-backup-run", "DB 수동 백업"],
  "operations:restart-file-watch": ["file-watch-restart", "파일 감시 재시작"],
  "operations:stop-file-watch": ["file-watch-stop", "파일 감시 중지"],
  "operations:fetch-holiday-api-items": ["holiday-fetch", "2026년 공휴일 불러오기"],
  "operations:add-holiday-item": ["holiday-save", "2026-05-05 공휴일 등록"],
  "operations:rename-holiday-item": ["holiday-rename", "공휴일명 수정"],
  "operations:delete-holiday-item": ["holiday-delete", "공휴일 삭제"],
  "operations:replace-holiday-calendar": ["holiday-replace", "2026년 공휴일 일괄 반영"],
  "operations:save-allowance-rate-version": ["allowance-rate-save", "2026v1 요율 저장 · 사유: 정기조정"],
  "operations:delete-allowance-rate-version": ["allowance-rate-delete", "요율 버전 삭제"],
  "operations:save-user": ["user-save", "worker1 사용자 저장"],
  "operations:delete-user": ["user-delete", "사용자 삭제"],
  "operations:rotate-account-recovery-key": ["account-recovery-key-rotate", "admin 계정복구키 발급"],
  "operations:save-site-name-option": ["site-name-save", "본사 사이트 명 저장"],
  "operations:delete-site-name-option": ["site-name-delete", "사이트 명 삭제"],
  "operations:inspect-document-template": ["template-inspect", "근무표 양식 검증"],
  "operations:preview-document-template": ["template-preview", "근무표 양식 미리보기"],
  "operations:save-document-template-version": ["template-save", "근무표 양식 등록"],
  "operations:approve-document-template-version": ["template-approve", "양식 승인"],
  "operations:set-default-document-template-version": ["template-set-default", "기본 양식 지정"],
  "operations:update-document-template-output-file-name": ["template-file-name-update", "출력 파일명 규칙 저장"],
  "operations:delete-document-template-version": ["template-delete", "양식 삭제"],
} as const;
```

검사:

- `Object.keys(expectedActivities).sort()`는 manifest의 Operations `recordsActivity:true` 25개 key와 exact equal.
- tracked case마다 access log 호출 증분이 정확히 1, non-tracked 15개는 0.
- tracked 호출 첫 번째 인수는 `{actionType, actionLabel, routeKey, routeLabel, details}` 전체를 `toEqual`로 검사한다. `actionLabel`은 canonical `accessLogActionLabels[expectedActionType]`를 써도 되지만 `actionType/details` 자체는 위 literal이어야 한다.
- 첫 번째 인수 key 집합도 위 5개와 exact equal이며, 두 번째 인수는 `mockAdminSession`과 exact equal.
- tracked service throw와 preview dialog cancel 때 activity 0인 기존 시험은 유지한다.

### R2-3. dialog 5개 request 전체 외형

취소 시험과 선택 성공 시험을 분리한다. 각 선택 case는 새 dialog spy·signal·env·registry를 쓰고 다음을 검사한다.

```text
showDialog 호출 정확히 1회
showDialog 첫 번째 인수 전체 toEqual(expectedRequest)
showDialog 두 번째 인수 === 해당 context.signal
응답 body exact
```

`expect.objectContaining`만 쓰지 않는다. 정확한 expected request:

directory·migration·spreadsheet의 `defaultPath:<input sentinel>`은 R2-3 전용 literal args에 실제 sentinel을 넣어 검사한다. 현재 `validArgsMap` 기본 fixture에 `defaultPath`가 없으므로 두 map을 혼동하지 않는다.

| 채널 | 첫 번째 인수 exact |
|---|---|
| `select-directory` | `{operation:"openFolder", title:<input title>, defaultPath:<input sentinel>}` |
| `select-migration-file` | `{operation:"openFile", title:<input title 또는 기본 "복원 파일 선택">, defaultPath:<input sentinel>, filters:[{name:"복원 파일",extensions:["json","accdb"]}]}` |
| `select-spreadsheet-file` | `{operation:"openFile", title:<input title 또는 기본 "Excel 파일 선택">, defaultPath:<input sentinel>, filters:[{name:"Excel Workbook",extensions:["xlsx","xlsm"]}]}` |
| `select-document-template-file` with `schedule` | `{operation:"openFile", title:"양식 파일 선택", filters:[{name:"근무표 Excel 양식",extensions:["xlsx","xlsm"]}]}`; `proposal`의 filter 이름 `Excel 양식 파일`도 별도 assertion |
| `preview-document-template` | `{operation:"saveFile", title:"양식 미리보기 저장", defaultPath:path.resolve("C:/exports","template-previews","schedule","근무표_v2_preview.xlsx"), filters:[{name:"Excel Workbook",extensions:["xlsx"]}], showOverwriteConfirmation:true}` |

preview 선택 성공은 `previewDocumentTemplateFile`이 exact input과 `{outputPath:"C:/preview/out.xlsx"}`로 1회 호출되고 activity exact 1회인지 함께 검사한다. preview 취소는 service 0, activity 0을 명시한다. migration `.xlsx` 거절과 `.json` 성공 body exact도 유지한다.

### R2-4. dataDir 12개 독립 증거

manifest의 Operations `usesDataDir:true` key 집합을 아래 12개 literal key 집합과 exact equal로 먼저 검사한다.

```text
get-app-settings
save-app-settings
preview-database-migration-update
update-database-from-migration
run-database-backup-now
get-file-watch-status
restart-file-watch
stop-file-watch
fetch-holiday-api-items
preview-document-template
save-document-template-version
delete-document-template-version
```

각 channel 직전에 모든 mock 호출 이력을 clear하고 새 env/registry를 만든다. dispatch 뒤 해당 case의 service를 `toHaveBeenCalledTimes(1)` + exact args로 검사한다. 특히 공유 spy는 다음을 지켜야 한다.

- `save-app-settings`: save, watch restart, backup restart를 모두 정확히 1회.
- DB preview/update: 각 case 안에서 stop, 해당 migration action, restart를 각각 정확히 1회.
- `fetch-holiday-api-items`: 그 case에서 settings lookup 1회와 holiday API 1회. 앞선 get-settings 호출에 기대지 않는다.
- `preview-document-template`: 그 case에서 settings lookup 1회, dialog 1회, preview service 1회.
- 직접 `restart-file-watch`: 그 case에서 restart 1회. 앞선 save/migration 호출에 기대지 않는다.

12개를 한 누적 흐름으로 dispatch한 뒤 단순 `toHaveBeenCalledWith`만 검사하는 현재 구조는 제거하거나 위 독립 구조로 바꾼다.

### R2-5. migration preview와 update 각각 success/failure cleanup

재사용 helper 또는 table로 아래 두 행을 각각 검사한다.

| 채널 | action spy | failure errorCode |
|---|---|---|
| `operations:preview-database-migration-update` | `previewDatabaseMigrationUpdate` | `DATABASE_MIGRATION_PREVIEW_FAILED` |
| `operations:update-database-from-migration` | `runDatabaseMigrationUpdate` | `DATABASE_MIGRATION_FAILED` |

각 행에서 독립적으로 두 번 dispatch한다.

1. 성공: one-shot mock이 `order`에 `stop`, `action`, `restart`를 넣고 결과 success, 순서 exact, 세 spy 각 1회, activity exact 1회.
2. action 실패: one-shot action이 `action`을 기록하고 throw. 결과 status 200 + `body.ok:false` + 해당 errorCode, 순서가 여전히 `stop, action, restart`, restart 1회, activity 0.

`await dispatch`가 끝난 다음 순서를 검사한다. stop 자체 실패 의미는 바꾸거나 새 제품 동작을 요구하지 않는다.

### R2-6. CN4 service/activity 0을 실제 assertion

`operations:get-app-settings`를 표본으로 무쿠키와 non-admin을 서로 독립 실행한다. 각 case 직전 `vi.clearAllMocks()`, 새 env/registry를 쓴다.

- 무쿠키: status 401, `getStoredAppSettingsSnapshot` 0회, dialog 0회, activity 0회.
- operator cookie: status 200 + `AUTH_FORBIDDEN`, `getStoredAppSettingsSnapshot` 0회, dialog 0회, activity 0회.

시험 이름만 `service calls 0`으로 두고 service spy assertion을 생략하지 않는다.

### R2-7. 회신 증거 정정

보정 1차의 시작 SHA 4건 불일치를 회신에 정확히 적는다.

```text
보정1 착수 SHA 증거: 4/6 불일치 ACK
성격: 회신/증거 정확성 결함; runtime defect 판정 아님
원인: <입증한 사실 또는 원인 확인 불가>
이번 착수: HEAD 43532a63... clean에서 §2.2 6개 SHA 전건 일치 확인
```

이번 회신의 시작 SHA는 수정 **전**에 기록한 실제 값이어야 한다. 수정 뒤 중간/최종 해시를 시작 해시라고 부르지 않는다.

---

## 5. 검증과 커밋

### 5.1 수정 전

```powershell
npm test -- src/main/http/routes/operations-routes.test.ts
```

현재 기준은 녹색이다. 실제 파일/시험 수와 시각을 기록한다. 녹색이라는 사실이 §1의 거짓 통과 결함을 해소하지는 않는다.

### 5.2 수정 뒤, commit 전

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:map
npm run smoke
git diff --check
git diff --name-status 43532a63d52150b01ed10add4b0de0127ea65d61
git diff --exit-code 43532a63d52150b01ed10add4b0de0127ea65d61 -- . ':(exclude)src/main/http/routes/operations-routes.test.ts'
git status --short
```

합격:

- 나열한 10개 명령은 모두 RC 0이어야 하며, 각 출력은 아래 조건대로 확인한다. lint는 error 0, 기존 warning 7, 신규 warning 0.
- 전체 test failed/skipped/todo 0. 실제 파일/시험 수를 보고한다.
- map 유효 경로 60 이상·누락 0, smoke 72 services.
- parent 대비 diff와 status가 `M src/main/http/routes/operations-routes.test.ts` 하나뿐.
- allowlist 제외 diff RC 0.
- Operations 40 effect case key exact, activity literal 25 exact, dataDir literal 12 exact, dialog 5 취소/선택 exact, migration 2경로×성공/실패, CN4 service/activity 0.
- skip/todo/only 0, dependency 0.

### 5.3 commit과 최종 release gate

정확히 한 파일만 stage한다. `git add .`, `git add -A`, amend는 금지한다.

```powershell
git add -- src/main/http/routes/operations-routes.test.ts
git diff --cached --name-status
git commit -m "test: close operations route coverage gaps"
npm run release:check
git status --short
git rev-parse HEAD
git rev-parse HEAD^
```

합격:

- staged/commit 경로 정확히 1개.
- 새 commit의 parent가 정확히 `43532a63d52150b01ed10add4b0de0127ea65d61`.
- `release:check` RC 0, 최종 status 빈 출력.
- §2.2의 불변 5파일 SHA가 그대로이며, 수정 시험 파일 최종 SHA/바이트를 보고.

---

## 6. 반드시 보고할 음성 시험

| ID | 기대 |
|---|---|
| RN1 | 40개 descriptor key = Operations 40, 각 channel success + 기대 service/effect exact 1회 |
| RN2 | activity literal key = meta 25, 대상 25개 `actionType/routeKey/routeLabel/details` exact, 비대상 15개 0 |
| RN3 | tracked service throw와 preview cancel은 activity 0; preview cancel service 0 |
| RN4 | dialog 5종 취소 null + 선택 request 전체 외형/반환 exact; template filter schedule/proposal 분기 |
| RN5 | dataDir literal/meta 12/12, 각 case 격리 후 sentinel exact 전달 |
| RN6 | migration preview/update 각각 성공·action 실패에서 stop→action→restart; 실패 errorCode exact/activity 0 |
| RN7 | 무쿠키 401·operator AUTH_FORBIDDEN, handler service/dialog/activity 모두 0 |
| RN8 | 보정1 시작 SHA 4/6 불일치 ACK, 이번 시작 HEAD/clean/SHA 전건 정확 |
| RN9 | allowlist 1개, 불변 5파일 SHA 유지, dependency/skip/todo/only 0 |
| RN10 | 전체 게이트와 release gate RC 0, 최종 clean |

---

## 7. 즉시 중단 조건

- §2 HEAD/status/SHA 중 하나라도 다름.
- 시험 파일 밖 수정이 필요함.
- 새 시험이 `operations-routes.ts` 또는 다른 제품 코드의 실제 의미 결함을 드러냄.
- 실제 DB·실제 사용자 데이터·실제 파일 감시·실제 OS dialog 없이는 시험할 수 없음.
- dependency/설정 변경, 시험 삭제·완화, `mockReset` 계열이 필요함.
- allowlist 제외 diff가 0이 아님.

중단 시 제품 파일을 더 고치거나 commit하지 말고, 원인·최소 재현 명령·실제/기대·필요한 설계 결정을 `BLOCKED`로 적는다.

---

## 회신

> Gemini가 아래 양식을 실제 값으로 채운다. 이 줄 위 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / 43532a63d52150b01ed10add4b0de0127ea65d61 / 최종 commit <40자>
착수 상태:
- branch/HEAD/parent/status: <수정 전 원문>
- 시작 SHA-256/바이트: <§2.2 6개 수정 전 실측>
보정1 증거 정정:
- 시작 SHA 4/6 불일치: ACK | 불일치
- 성격/원인: <회신 증거 결함, runtime defect 아님 / 입증 사실 또는 원인 확인 불가>
변경 파일:
- src/main/http/routes/operations-routes.test.ts: <R2 ID와 한 줄 목적>
범위 밖 변경: 0개 | <경로와 사유>
결함 대조:
- R2-0~R2-7: <시험/보조 구조 위치> — PASS | FAIL | BLOCKED
정량:
- operation effect/activity/dataDir/dialog: <40/25/12/5>
- migration matrix: <2 channels x success/failure = 4 cases>
- auth guard: <2 cases, service/dialog/activity 0>
검증 증거:
- <명령 원문> — RC <n> — <핵심 값> — <KST 시각>
음성 시험:
- RN1~RN10 — 기대 <값> — 실제 <시험명/값>
allowlist 제외 diff: <명령 원문> — RC <n> — 출력 <없음>
staged/commit 경로: <정확히 1개 name-status>
diff 요약: <1 file, 추가/삭제, dependency 0>
불변 SHA-256:
- <§2.2의 5개 불변 파일 각각>
수정 파일 최종 SHA-256/바이트:
- src/main/http/routes/operations-routes.test.ts: <64자> / <bytes>
commit: <40자> / parent 43532a63d52150b01ed10add4b0de0127ea65d61 / message "test: close operations route coverage gaps"
release:check: RC <n> / <핵심 출력>
최종 상태: <git status --short 빈 출력>
skip/todo/only: <0/0/0>
미해결/가정: 없음 | <목록>
```
