# HANDOFF — Phase 1-3 S2 보정 1차: 테스트 책임 분리·증거 완성

- Task: Phase 1-3 S2 correction 1 — Operations 40개 구현의 차단 해소와 누락 시험 보강
- Action: CORRECT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-13 18:57 KST
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `7acd06e8162777804b05c6f8f72cabdd652a9d17`
- Expected initial state: 아래 4개 파일만 미커밋이며 그 밖 변경 0

---

# 회신 요청

**누가**: Gemini  
**어디에**: 루트 `HANDOFF.md`의 이 요청 본문은 고치지 말고 맨 아래 `## 회신`만 채운다.  
**언제**: 착수 해시·상태가 다르면 수정하지 말고 즉시 `BLOCKED`; 일치하면 아래 보정·전체 검증·커밋 뒤 회신.  
**회신이 없으면**: Sol의 S2 수용과 S3 지시가 중단된다.

---

## 1. 이번 보정의 결론

Gemini가 보고한 차단은 사실이다. `core-routes.test.ts`가 전체 `assembleRoutes()`를 호출하면서 S1 총수 17을 고정했기 때문에 S2 총수 57과 충돌한다. 이 파일은 기존 S2 allowlist에 빠져 있었다.

하지만 차단만 풀고 끝내지 않는다. Sol이 전체 제출을 검토해 아래 세 결함군을 한 번에 확정했다.

| ID | 등급 | 확인된 사실 | 이번 조치 |
|---|---|---|---|
| C1 | BLOCKER | `core-routes.test.ts:26` 기대 17, 실제 57 | core 등록 함수 단위 시험으로 책임 분리 |
| C2 | MAJOR — Sol 지시 결함 | 기존 S2 패킷의 activity `27개`는 오기. V3·V4·메타 모두 정확히 `25개` | 제품 activity를 늘리지 않고 문서·시험 기준을 25로 고정 |
| C3 | MAJOR | 현재 Operations 시험 6개는 40개 admin 정상 dispatch, 선택 성공 5종, activity 성공/실패, dataDir, migration cleanup을 검증하지 않음 | table-driven mock 시험과 위험 경로 시험 보강 |
| C4 | MAJOR | 미구현 54개 시험은 `registry.has=false`만 보며 실제 HTTP 404가 아님. 기존 server 시험은 존재하지 않는 옛 경로를 사용 | 실제 S3 계약 채널 404와 Operations 비배열 400을 HTTP로 검증 |

현재 `operations-routes.ts`의 40개 handler는 Sol과 Terra가 V3 원본을 전수 대조했고 service/args/dataDir/cleanup/dialog/activity 의미가 일치했다. 따라서 이 파일을 재작성하지 않는다. 새 시험이 실제 구현 결함을 드러내면 임의 수정하지 말고 정확한 실패와 필요한 변경을 `BLOCKED`로 반환한다.

---

## 2. 착수 게이트 — 수정 전에 그대로 대조

### 2.1 Git 상태

```text
HEAD 7acd06e8162777804b05c6f8f72cabdd652a9d17
branch main
 M docs/codebase-map.md
 M src/main/http/routes/index.ts
?? src/main/http/routes/operations-routes.test.ts
?? src/main/http/routes/operations-routes.ts
```

위 4개 외 출력이 있으면 중단한다. 기존 변경을 reset, stash, checkout, 삭제 또는 재생성하지 않는다.

### 2.2 현재 4파일 고정 해시

| 파일 | SHA-256 | 바이트 | 처리 |
|---|---|---:|---|
| `src/main/http/routes/operations-routes.ts` | `80463BDF909B65E02A8496A062050A709826F40251F5F7CF37BC17FE66AE67D9` | 27,791 | 의미 구현 고정; 시험이 실제 결함을 드러낼 때만 BLOCKED |
| `src/main/http/routes/operations-routes.test.ts` | `EAED7176C04013C89F16D8E0798823F0FE1E62A92B71187FEFB64008AF67F2C3` | 6,995 | 보강 대상 |
| `src/main/http/routes/index.ts` | `7D6481370279B03F37BBD19BBF281FAA4F9AF62A8B5B6ECFDC483C95DC4BEE76` | 1,381 | 57 조립 의미 고정; 파일 끝 과잉 빈 줄 1개만 제거 |
| `docs/codebase-map.md` | `9A45CC4621EA9F8E47387CC6A8EECE292B52D189F8BC3EA593FE733AE1B7E61D` | 8,341 | 현재 S2 지도 변경 보존 |

새로 수정 허용하는 기존 시험의 시작 해시:

| 파일 | SHA-256 | 바이트 |
|---|---|---:|
| `src/main/http/routes/core-routes.test.ts` | `C6514941F803D8A5CC378E3EB03692D1F644BF938712E67DE1088D3A3BE570DD` | 8,040 |
| `src/main/server.test.ts` | `BF149A7DF8B57428685A0CA76FBD46F438102272CD91EA6D956772A4C50A1463` | 14,119 |

정본/수신 기록:

- S2 원 패킷: `Phase1/07-1-3-S2-Gemini-구현패킷-v1.0.md`, SHA-256 `FBDF1159B62A7CAE300BB8BFCFCDDCD7E5A762890B57A40CE97D016218FBAFF5`, 21,513 B.
- BLOCKED 수신원본: `Log/20260913_185017_1-3-S2-Gemini-BLOCKED_수신원본.md`, SHA-256 `2CC723C9CA7B8D7A5800B370E572CD2515199CB7C15A5010FA6815E3EFF5B197`, 25,207 B.
- 수신 요청 본문은 원 패킷의 `## 회신` 위 본문과 글자 단위로 동일하다.

---

## 3. 수정 경계 — 닫힌 목록 정확히 6개

최종 커밋의 baseline 대비 변경 경로는 아래 6개뿐이어야 한다.

| 경로 | 허용 조치 |
|---|---|
| `src/main/http/routes/operations-routes.ts` | 현재 신규 구현을 그대로 커밋. 새 시험이 실제 결함을 드러내면 수정하지 말고 BLOCKED |
| `src/main/http/routes/operations-routes.test.ts` | C2~C4 시험 보강 |
| `src/main/http/routes/index.ts` | Core 17 + Operations 40 조립 로직은 그대로 유지하고 `git diff --check`가 지적한 파일 끝 과잉 빈 줄 1개만 제거 |
| `src/main/http/routes/core-routes.test.ts` | C1 첫 시험만 core 단위 책임으로 수정 |
| `src/main/server.test.ts` | 실제 S3 채널 404와 Operations 비배열 400으로 기존 시험 보강 |
| `docs/codebase-map.md` | 현재 S2 지도 변경을 보존. 시험 개수 하드코딩은 늘리지 않음 |

그 밖 파일은 수정·생성·삭제 금지다. 특히 `src/shared/**`, `src/main/services/**`, `src/main/ipc/**`, `src/main/http/{session,route-registry,dialog-bridge,router,json,api-types}.ts`, `src/main/server.ts`, `src/web/**`, `scripts/**`, `package*.json`, 설정 파일은 baseline 대비 diff 0이어야 한다. 새 dependency도 0개다.

---

## 4. 순서 있는 보정 전략

### C1. core 시험을 aggregate에서 분리

`src/main/http/routes/core-routes.test.ts`의 첫 시험만 다음 책임으로 바꾼다.

1. `RouteRegistry`와 `registerCoreRoutes`를 import한다.
2. 첫 시험에서는 `assembleRoutes(sessionManager)`를 쓰지 않는다.
3. `const registry = new RouteRegistry(sessionManager)` 뒤 `registerCoreRoutes(registry, sessionManager)`를 호출한다.
4. 다음 네 가지를 검사한다.
   - `CORE_CHANNELS.length === 17`
   - `registered.length === CORE_CHANNELS.length`
   - `new Set(registered).size === CORE_CHANNELS.length`
   - `CORE_CHANNELS` 전수 `registry.has(channel) === true`
5. 나머지 D5/D6 시험은 전체 조립 안에서도 core가 작동함을 보므로 기존 `assembleRoutes()` 사용을 유지한다.

시험 이름은 S1 시점 문구 대신 `registerCoreRoutes registers exactly the 17 core channels independently`처럼 현재 책임이 드러나게 한다.

### C2. S2 aggregate 57과 미구현 54를 정확히 검증

`operations-routes.test.ts` 첫 등록 시험을 다음까지 강화한다.

- `CHANNEL_CONTRACTS.length === 111`, `CORE_CHANNELS.length === 17`, `OPERATIONS_CHANNELS.length === 40`.
- `assembleRoutes()`의 `getRegisteredChannels()` 길이와 unique 수가 모두 57.
- core 17 + operations 40 전수가 등록됨.
- `group`이 workforce/performance/allowance인 실제 계약 54개 전수가 등록되지 않음.

`workforce:list-users`와 `performance:get-overtime-summary`는 실제 계약 채널이 아니므로 새 시험·회신에 쓰지 않는다. HTTP 표본은 실제 계약인 `allowance:list-history`를 사용한다.

### C3. 서비스 mock 기반 40개 admin 정상 dispatch

실제 DB·데이터 폴더·파일 감시를 건드리지 않는다. `operations-routes.ts`가 import하는 아래 모듈을 Vitest에서 mock한다.

```text
app-settings-storage-service
account-recovery-service
file-watch-runtime-service
database-backup-service
database-migration-service
document-template-management-service
document-template-preview-service
holiday-api-service
operations-storage-service
release-history-service
```

권장 구조:

- `vi.hoisted(() => ({ ...vi.fn() mocks... }))`로 mock reference를 만든다.
- 각 `vi.mock(...)` factory는 route가 import하는 이름을 빠짐없이 반환한다. `operations-storage-service`에는 `SessionManager`가 읽는 `findStoredOperationAuthByLoginId`도 포함한다.
- `SessionManager` 생성 시 `accessLogService: { recordAccessLog: accessLogSpy }`를 명시 주입한다. 기본 실제 access-log service를 시험에서 호출하지 않는다.
- 저장/목록/service mock은 결정적인 작은 객체·배열 또는 `Promise.resolve(...)`를 반환한다.
- `getStoredAppSettingsSnapshot`은 최소 `{ holidayApiBaseUrl, scheduleExportDir }`를 반환한다.
- 대화상자는 title/operation에 따라 `C:/selected`, `C:/backup.json`, `C:/sheet.xlsx`, `C:/template.xlsx`, `C:/preview.xlsx`를 반환하도록 한다.
- 40개 channel -> valid args의 명시적 case map을 만든 뒤, `Object.keys(caseMap).sort()`가 `OPERATIONS_CHANNELS`와 정확히 같은지 먼저 검사한다. 누락·잉여 case를 허용하지 않는다.
- admin cookie로 40개를 각각 dispatch하고 `result !== null`, `status === 200`, business body가 success임을 확인한다.

인수 fixture에서 구현이 직접 읽는 필드는 반드시 채운다: migration의 `migrationFilePath`, holiday의 `year/holidayDate`, rate의 `versionLabel/changeReason/rateVersionId`, user의 `loginId/userId`, site의 `name`, template의 `templateType/sourcePath/versionLabel/templateId`.

### C4. activity 정본 25와 실패 시 0

🔴 기존 패킷의 27은 잘못이다. 아래 세 근거가 모두 정확히 25다.

```text
V3 register-operations-handlers.ts  activity: trackSuccess = 25
V4 operations-routes.ts            activity: trackSuccess = 25
CHANNEL_CONTRACTS operations recordsActivity:true       = 25
```

- `CHANNEL_CONTRACTS.filter(group === "operations" && recordsActivity)` 길이를 25로 검사한다.
- 40개 admin dispatch case마다 access-log spy 호출 증가량을 확인한다: meta `recordsActivity:true`면 정확히 1, false면 0. case 직전 count와 직후 count의 delta를 쓰거나 case마다 mock을 clear하여 누적 호출을 잘못 세지 않는다.
- 25개 대상은 literal expected map으로 `actionType`, `routeKey: "operations"`, `routeLabel: "운영 관리"`, fixture에 따른 `details`까지 V3와 대조한다. map key 집합은 meta의 25개 channel 집합과 정확히 같아야 한다.
- tracked service 한 개가 throw하는 경우 해당 errorCode의 BridgeFailure이며 activity 0.
- `operations:preview-document-template` dialog 취소는 success/null이며 activity 0.
- 권한 거절은 handler/service 호출 0, activity 0.
- 제품 코드에 근거 없는 activity 두 개를 추가하지 않는다.

### C5. dialog 선택 성공·dataDir·cleanup 위험 경로

기존 5종 취소 시험은 유지하고 선택 성공을 전부 추가한다.

| 채널 | 선택 결과/호출 검증 |
|---|---|
| `operations:select-directory` | 선택 path 문자열 그대로 success |
| `operations:select-migration-file` | `.json` success, `.xlsx`는 `DATABASE_RESTORE_FILE_REQUIRED` |
| `operations:select-spreadsheet-file` | `{ fileName, filePath }` |
| `operations:select-document-template-file` | templateType별 filter 이름과 `{ fileName, filePath }` |
| `operations:preview-document-template` | `template-previews/<type>` defaultPath, xlsx filter, overwrite true, 선택 outputPath로 service 1회, activity 1회 |

각 request의 `operation`, `title`, `defaultPath`, `filters`, `showOverwriteConfirmation`을 요구된 값과 대조한다.

고유 sentinel `dataDir`을 주입하고 meta의 Operations `usesDataDir:true`가 정확히 12인지 검사한다. 다음 경로의 service 인수에서 그 sentinel이 `userDataPath`로 전달됐는지 spy로 확인한다: get/save settings, DB preview/update, backup, file-watch get/restart/stop, holiday fetch의 settings lookup, template preview의 settings lookup, template save/delete.

DB preview와 update는 각각 다음 순서를 검사한다.

```text
stopFileWatchRuntime -> migration service -> restartFileWatchRuntime
```

action이 throw해도 cleanup restart가 1회 실행되고 원래 action errorCode가 반환되며 activity는 0이어야 한다. stop 단계 자체가 실패하는 경우는 V3처럼 helper 진입 전 reject되는 현재 의미를 바꾸지 않는다.

### C6. 실제 HTTP ON5·ON6

`src/main/server.test.ts`의 기존 시험 두 곳을 늘리되 시험 총수 12는 유지한다.

1. 비배열 본문 400 시험에서 기존 core endpoint뿐 아니라 등록된 `operations:get-app-settings`에도 `{}`를 보내 `400 BAD_REQUEST`인지 확인한다. 본문 검사가 auth보다 먼저 적용되는 증거다.
2. 기존 `S1 구현 범위 밖` 404 시험은 존재하지 않는 `/api/operations:list-runs`를 쓰지 않는다. 실제 manifest에 있으나 S3까지 미등록인 `/api/allowance:list-history`를 호출해 `404 NOT_FOUND`를 검사하고 시험 이름을 `S2 구현 범위 밖의 실제 계약 채널`로 바꾼다.

### C7. 정리 금지와 최소 diff

- unrelated formatting, import 재정렬, 이름 일괄 변경, route 재생성 금지. 유일한 formatting 허용은 `index.ts` 마지막 `};` 뒤의 두 번째 LF 1개 제거다.
- `.skip`, `.todo`, `.only`, 조건부 test bypass, snapshot 덮어쓰기 금지.
- 기존 4개 변경을 보존하고 위 시험 책임만 추가한다.
- 새 시험이 현재 40개 route의 실제 의미 결함을 드러내면 route를 추측 수정하지 말고 `BLOCKED`로 회신한다.

---

## 5. 검증 순서와 합격 조건

### 5.1 보정 전 재현

```powershell
npm test -- src/main/http/routes/core-routes.test.ts src/main/http/routes/operations-routes.test.ts
```

기대: core 첫 시험만 기대 17/실제 57로 실패, Operations 6개 통과. 다르면 중단한다.

### 5.2 보정 뒤, 커밋 전

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:map
npm run smoke
git diff --check
git diff --exit-code 7acd06e8162777804b05c6f8f72cabdd652a9d17 -- src/shared src/main/services src/main/ipc package.json package-lock.json tsconfig.server.json tsconfig.browser.json vitest.config.ts eslint.config.mjs
git status --short
```

합격:

- `git status --short`를 제외한 앞 8개 명령 RC 0. lint는 기존 warning 7, 신규 warning 0.
- test failed/skipped/todo 0. 실제 통과 파일/시험 수를 회신한다.
- map은 현재 60개 이상이며 누락 0, smoke는 서비스 72개.
- 보호 diff RC 0.
- status는 닫힌 목록 6개만 표시한다.
- S2 route 57, 미등록 54, operations activity 25, dataDir 12, dialog 5.

### 5.3 커밋과 최종 release gate

정확히 6개 파일만 stage한다. `git add .` 또는 `git add -A`를 쓰지 않는다.

```powershell
git add -- docs/codebase-map.md src/main/http/routes/index.ts src/main/http/routes/operations-routes.ts src/main/http/routes/operations-routes.test.ts src/main/http/routes/core-routes.test.ts src/main/server.test.ts
git diff --cached --name-status
git commit -m "feat: add phase 1-3 operations routes"
npm run release:check
git status --short
```

합격:

- staged/commit 경로 정확히 6개.
- commit 성공 후 `release:check` RC 0. 이 검사는 clean worktree를 요구하므로 반드시 commit 뒤 실행한다.
- 최종 `git status --short` 빈 출력.
- 최종 커밋 40자와 부모가 각각 새 commit / `7acd06e8162777804b05c6f8f72cabdd652a9d17`.

---

## 6. 반드시 보고할 음성 시험

| ID | 기대 |
|---|---|
| CN1 | core 단위 등록 17, aggregate 등록 57, unique 57 |
| CN2 | 실제 미구현 계약 54개 미등록 + `allowance:list-history` HTTP 404 `NOT_FOUND` |
| CN3 | `operations:get-app-settings` 비배열 `{}` HTTP 400 `BAD_REQUEST` |
| CN4 | 무쿠키 operations HTTP 의미 401, 비admin 200 `AUTH_FORBIDDEN`, service/activity 호출 0 |
| CN5 | admin valid case 40/40 dispatch success |
| CN6 | operations activity meta/V3/V4 25/25/25, 대상 성공 1회·비대상/실패/취소 0회 |
| CN7 | dialog 5종 취소 success/null, 선택 성공 반환·request option 일치 |
| CN8 | migration `.xlsx` 선택 거절, `.json` 선택 성공 |
| CN9 | dataDir 대상 12와 sentinel 전달 전건 |
| CN10 | migration stop→action→restart, action failure에도 cleanup·activity 0 |
| CN11 | allowlist 밖 diff 0, 새 dependency 0, skip/todo/only 0 |

---

## 7. 즉시 중단 조건

- §2 상태나 SHA가 하나라도 다름.
- 닫힌 6개 밖 수정이 필요함.
- `operations-routes.ts` 40개 의미 또는 activity 25개를 바꿔야 시험이 통과함.
- 실제 데이터 폴더/DB/파일 감시를 쓰지 않고는 시험할 수 없음.
- 새 dependency, 설정 변경, 시험 약화가 필요함.
- 보호 diff가 0이 아님.

중단 시 파일을 더 고치거나 commit하지 말고 원인·재현 명령·필요한 설계 결정을 `BLOCKED`로 적는다.

---

## 회신

> Gemini가 아래 양식을 실제 값으로 채운다. 이 줄 위 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / 7acd06e8162777804b05c6f8f72cabdd652a9d17 / 최종 commit <40자>
착수 상태: <status 4개와 시작 SHA 6개 원문>
변경 파일:
- <정확히 6개 경로>: <C ID와 한 줄 목적>
범위 밖 변경: 0개 | <경로와 사유>
결함 대조:
- C1~C7: <구현/시험 위치> — PASS | FAIL | BLOCKED
정량:
- contracts/core/operations/aggregate/unregistered: <111/17/40/57/54>
- activity V3/V4/meta: <25/25/25>
- dataDir/dialog: <12/5>
검증 증거:
- <명령> — RC <n> — <핵심 값> — <KST 시각>
음성 시험:
- CN1~CN11 — 기대 <값> — 실제 <시험명/값>
보호 diff: <명령 원문> — RC <n> — 출력 <없음>
staged 경로: <6개 name-status>
diff 요약: <6 files, 추가/삭제, dependency 0>
전체 SHA-256:
- <6개 각각 경로와 64자>
commit: <40자> / parent <40자> / message <문구>
release:check: RC <n> / <핵심 출력>
최종 상태: <git status --short 빈 출력>
skip/todo/only: <0/0/0>
미해결/가정: 없음 | <목록>
```
