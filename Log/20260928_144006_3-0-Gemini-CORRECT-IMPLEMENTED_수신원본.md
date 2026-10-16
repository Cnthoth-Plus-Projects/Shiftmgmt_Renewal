# HANDOFF — Phase 3-0 공통 UI 검증기 1차 수정

- Task: 3-0 제출물의 실패 판정·증거 보존 결함 C30-01~C30-05 일괄 수정
- Action: CORRECT
- From: Sol(xhigh, Codex) — 독립 검증·수정 범위 확정
- To: Gemini — 외부 구현 코더(사용자 수동 중계)
- Time: 2026-09-28 13:46 KST
- 회신: 필요 — 이 파일 맨 아래 `## 회신`에 작성
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch / baseline HEAD: `main` / `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283`
- Final commit: 만들지 않는다. Sol 검증 뒤 결정한다.
- Expected initial status: §3의 정확한 72경로, LF 결합 UTF-8 SHA-256 `48FDD56F221A5C295F11E3A15C57BA819171FD372AF3C0FC465FC3B095117A6D`

---

# 회신 요청

**판정: CORRECT — 3-0 아직 미수용.** 정상 준비 화면 캡처는 성공했으나, 검증 도구가 일부 실패를 `PASS`로 보고한다. 아래 C30-01~C30-05를 한 번에 고쳐 다시 회신한다. 초기 상태·보호 SHA·허용 파일 중 하나라도 다르면 수정 없이 `BLOCKED`로 회신한다. Gemini의 `IMPLEMENTED`는 제출이지 Sol 수용 판정이 아니다.

## 1. Sol 독립 검증 결과

### 통과한 부분 — 유지

- `main`/HEAD와 제출 해시 일치. 기존 70경로 status는 신규 2파일을 뺀 후 SHA-256 `B5839888300943B976D4F0C1092D4D3753FED3FA75863D5838945860B4956C9A`로 원본과 동일. `docs/codebase-map.md`에서 신규 2행을 제거한 바이트의 SHA-256은 원래 값 `BBA69B862339C5ABFFE9D38527D4E503E7B28C1BD4B7973CF2683083E316C002`와 일치. 범위 밖 제품 변경 0.
- `node --check` 2파일, `npm run validate:map`(75경로), `npm run typecheck`, `npm run build`, `git diff --check` 모두 RC 0.
- Sol 격리 서버(`SHIFTMGMT_PORT=18738`, 별도 데이터 폴더)에서 `node scripts/ui-checks/ready.mjs http://127.0.0.1:18738/` RC 0. 설치 Chrome 153.0.8010.53, 1440×900, `ready.png`·`after-reload.png` 두 장을 직접 열어 정상 준비 화면과 재로드 후 `서버 연결됨`을 확인했다. Sol 산출물 `artifacts/captures/phase3/ready/run-20260928-134026/manifest.json`은 PASS·캡처 2·계측 오류 0. 서버 PID 22592와 뒤의 시험용 PID 15640은 포트·명령줄 대조 후 각각 종료했고 18738 포트 해제를 확인했다.
- 원격 URL `https://example.com/` RC 1, 빈 로컬 포트 18736 RC 2를 Sol도 재현했다. 기존 `scripts/capture-screen.mjs`, `scripts/lib/find-chrome.mjs`, `src/web/**`, package/lockfile 보호 SHA는 유지됐다.

### 수정이 필요한 결함 — stable IDs 전건

| ID | 원인·위치 | Sol 재현과 영향 | 반드시 고칠 결과 |
|---|---|---|---|
| **C30-01** | `scripts/lib/ui-check.mjs:287-315` `writeFileSync(manifestPath,...)` 오류를 출력만 하고 이어서 무조건 `PASS` | Sol이 캡처 후 실행 폴더에 `manifest.json`이라는 **디렉터리**를 만들어 쓰기 실패(EISDIR)를 유발했다. 출력은 `manifest.json 작성 실패` 다음 `PASS`, **RC 0**, 유효한 manifest 파일 없음. 검증 증거가 없는데 성공 판정이 나온다. | manifest 생성이 실패하면 RC 2, `PASS` 문구 0, 실패 이유 stderr. 캡처 폴더 준비 실패도 실행 실패 RC 2로 판정. manifest 쓰기 성공 전에는 절대 PASS 출력 금지. |
| **C30-02** | `scripts/lib/ui-check.mjs:238-247` context/browser 종료 예외를 빈 `catch {}`로 버림 | Sol 시험에서 `page.context().close`가 `CLOSE_PROBE` 오류를 내도록 주입했는데 **RC 0/PASS**와 manifest PASS. 브라우저 정리 실패가 성공으로 둔갑한다. | context가 실패해도 browser 종료는 시도하고, 어느 정리 오류든 manifest `cleanupErrors` 또는 명확한 실패 필드·stderr에 남겨 RC 2/FAIL. 빈 `catch {}` 금지. |
| **C30-03** | `scripts/lib/ui-check.mjs:69-96` 10초 타이머를 `fetch()`가 헤더를 반환한 직후 해제해 `response.json()` 본문 대기에는 상한이 없음 | `fetch`는 HTTP 200 객체를 주되 `json()`이 끝나지 않게 만든 Sol 시험에서 `timeoutMs=50` 후 **250ms가 지나도 pending**. 끝나지 않는 응답이 검증 작업을 멈출 수 있다. | `/api/health`의 헤더 수신·본문 읽기·JSON 파싱을 합쳐 설정한 전체 상한으로 종료. 본문이 끝나지 않아도 명확한 시간 초과 오류/RC 2. 타이머·abort는 정상/오류 모두 정리. |
| **C30-04** | `scripts/lib/ui-check.mjs:193-195`의 `pageerror` 리스너가 `consoleErrors`에 넣고 `pageErrors` 배열은 끝까지 비어 있음 | 실제 페이지 예외 `PAGE_ERROR_PROBE` 주입 시 전체 FAIL/RC 2이지만 manifest는 **pageErrors 0, consoleErrors 1**로 잘못 분류했다. 회신의 계측 범주가 재현되지 않는다. | 페이지 예외는 `pageErrors`에 기록하고 manifest·stderr에서 그 범주로 표시. 콘솔 오류는 별도 수집. |
| **C30-05** | `scripts/lib/ui-check.mjs:160-168` 초 단위 `runId`와 `mkdirSync(...,recursive:true)` | 같은 ID가 같은 초에 두 번 시작하면 같은 폴더·PNG·manifest를 사용해 먼저 실행한 증거를 덮어쓸 수 있다. 이는 코드에서 확인된 충돌 경로이며 아직 실행 충돌 시험은 하지 않았다. | 기존 산출물과 충돌하지 않는 고유 `run-*` 디렉터리를 원자적으로 만든다. 같은 초 두 호출도 서로 다른 경로. 기존 캡처를 덮어쓰지 않음. |

C30-01·02·04는 Sol이 별도 실행으로 실제 재현했고, C30-03은 응답 본문 미완료 모의 호출로 재현했다. C30-05는 소스 흐름으로 확인한 추론이므로 수정 뒤 동시/동초 생성 시험으로 검증한다. 업무 화면 클릭과 이탈 확인 기능은 여전히 UNVERIFIED이며 이번 수정의 대상이 아니다.

## 2. 목표·비목표와 정본

**목표:** 위 다섯 결함을 `scripts/lib/ui-check.mjs` 한 파일에서 고쳐, 성공 판정이 manifest·브라우저 정리·건강 상태 시간 제한·오류 분류·증거 경로와 모순되지 않게 한다.

**비목표:** 화면/서버/API/DB/계산/권한 구현, 다른 화면 시나리오 추가, 자동 픽셀 비교, 기존 정상 캡처 의미 변경, 새 의존성·설정 추가. `scripts/ui-checks/ready.mjs`의 제목·연결 상태·두 PNG 확인 흐름은 그대로 유지한다. 승인 시안과 V3.4는 읽기 전용이다.

제품 불변조건: 실제 앱을 띄운 캡처와 주요 동작 검증 없이 UI 완료라고 하지 않는다(`CLAUDE.md`, `07-invariants-and-pitfalls.md`). 테스트를 약화하거나 실패를 숨기지 않는다. V3.4 원본·운영 데이터는 건드리지 않는다. 가짜 UI·실적 직접 입력·`window.confirm/alert`를 만들지 않는다. 이번 파일은 검증 스크립트이며 제품 화면 코드를 고치지 않는다.

## 3. 착수 기준·수정 경계

`git status --short --untracked-files=all`의 정확한 72줄이다. LF로 결합하고 끝 LF를 붙이지 않은 UTF-8 SHA-256이 머리말 값이어야 한다. 제출 후 초기 70경로가 보존된 상태에 신규 두 파일만 추가됐다.

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
?? scripts/lib/ui-check.mjs
?? scripts/ui-checks/ready.mjs
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

| 경로 | 권한 | 이유 |
|---|---|---|
| `scripts/lib/ui-check.mjs` | **수정 허용 — 유일한 제품 파일** | C30-01~C30-05 수정 |
| `HANDOFF.md` | 보이는 `## 회신` 칸만 | 결과 보고 |
| `scripts/ui-checks/ready.mjs` | 읽기 전용 | 첫 실제 시나리오와 해시 보호 |
| `docs/codebase-map.md` | 읽기 전용 | 이번 수정에 신규 파일 없음 |
| `C:\Projects\Active\ShiftMgmt_V3.4\**`와 다른 모든 V4 파일 | 읽기 전용 | 범위 밖 변경 금지 |

시작 SHA-256: `scripts/lib/ui-check.mjs` `F382C2A4FDDF59173567F83E226A29C8CADA4DD682B5DE2EA55C6B027173B169`; 보호 `scripts/ui-checks/ready.mjs` `2EE0B97ED1ADC9A5C6B1484DFAE07B2A0655D215606A7CB70E933FAF0237C37C`; `docs/codebase-map.md` `7CBE40E0716A2D2AABBFABC62D13E7A532CAE7B67161C4CB2C62E7CD8BA7CA12`; `scripts/capture-screen.mjs` `D594E7529F2B7653642D004B0765E6721B68817ED5A74134F47E9C8F2559F4E1`; `scripts/lib/find-chrome.mjs` `0EF7158EF9657BA3246E05C0662F2A60729C43F75E2E975E0A5C6591AC4A34D9`; `src/web/index.html` `D153075DAE67C3FFE8E569AD612C6B59F61775F6C43BF2078B663B64B9E684B0`; `src/web/app.ts` `80EF03B9CE689895E884DE393C78729532F70A56E5F5A86E81D935A15FCAB32E`; `package.json` `162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9`.

프로젝트 제어 파일 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, 기존 `Log/**`는 변경 금지. 초기 상태·해시·소스와 지시가 충돌하거나 새 파일이 필요하면 수정 없이 `BLOCKED`로 반환한다.

## 4. Sol의 순서 있는 수정 전략

1. **C30-03:** `checkServerHealth()`에서 전체 작업(`fetch`→본문→JSON)을 하나의 기한 안에 묶는다. `AbortController`만으로 `json()`의 임의 대기 구현이 끝나지 않을 수 있으므로 시간 초과가 실제 Promise 결과를 reject하도록 한다. 예외 메시지에 `/api/health`와 시간 초과를 포함하고, 기존 HTTP 비200/`ok!==true` 판단은 보존한다.
2. **C30-04:** `page.on('pageerror')`는 `pageErrors`에 기록한다. `console`의 `error`만 `consoleErrors`에 넣는다. 명확한 범주가 manifest·stderr·최종 집계에 일치하도록 한다.
3. **C30-02:** `finally`에서 context/browser를 모두 닫으려 시도한다. 정리 예외는 `cleanupErrors`로 수집하고 `hasErrors`, manifest, stderr에 포함한다. context 종료에 실패해도 browser 종료를 건너뛰지 않는다.
4. **C30-01:** 실행 폴더 생성 실패와 manifest 쓰기 실패를 RC 2로 전파한다. manifest를 쓸 수 있으면 FAIL로 기록하고, 아예 쓸 수 없다면 stderr에 원인을 남기되 PASS를 출력하지 않는다. `PASS`는 정상 단계·오류 0·브라우저 정리 성공·manifest 파일 작성 성공이 모두 참인 뒤에만 표시한다.
5. **C30-05:** `artifacts/captures/phase3/{시나리오 ID}/` 아래에 원자적으로 고유 `run-*` 폴더를 만들고 그 상대 경로를 캡처·manifest·출력에 동일하게 쓴다. 예를 들어 `mkdtempSync`로 초 단위 시간 접두어에 고유 접미어를 붙일 수 있다. 기존 출력물을 삭제/덮어쓰지 않는다. 필요한 작은 생성 함수를 같은 파일에서 export해 동초 경로 시험에 사용해도 된다.

기존 성공 경로, localhost 검문(RC 1), 빈 포트 실패(RC 2), 설치 Chrome 사용, 1440×900·`fullPage`·기본 폰트 대기, `ready.png`/`after-reload.png` 의미를 보존한다. 별도 expected HTTP 4xx 예외는 현재 준비 화면에 없어 이번 수정의 합격 조건이 아니다. 이후 업무 화면에서 정확한 URL·status별 거절 테스트가 필요할 때 별도 지시서로 추가한다.

## 5. 검증 명령과 실패 시험

모든 검증은 V4 루트에서 한다. 서버는 포트 18738이 빈 것을 확인하고 **저장소 밖 고유한** `SHIFTMGMT_USER_DATA_DIR`로 숨긴 창에 실행한다(`Start-Process -WindowStyle Hidden`). PID·포트·명령줄을 기록하고 종료 시 같은 PID만 중지한다. 기존 운영 기본 데이터 폴더 사용 금지. `dist/`와 `artifacts/captures/`는 gitignore 산출물이며 캡처·manifest는 Sol 재검증까지 보존한다.

PowerShell에서 `npm run build` 뒤 격리 서버를 아래처럼 시작한다. 건강 상태 200을 확인한 뒤 시험한다. 끝나면 18738 포트 소유 PID와 `$serverProc.Id` 및 명령줄의 `dist/server/main/server.js`를 대조해 해당 PID만 중지한다. 포트 해제도 확인한다.

```powershell
$repo = 'C:\Projects\Active\ShiftMgmt_V4'
if (Get-NetTCPConnection -LocalPort 18738 -State Listen -ErrorAction SilentlyContinue) { throw '18738 포트 사용 중' }
$isolated = Join-Path $env:TEMP ('shiftmgmt-ui-c30-' + (Get-Date -Format 'yyyyMMddHHmmss'))
New-Item -ItemType Directory -Path $isolated -ErrorAction Stop | Out-Null
$env:SHIFTMGMT_USER_DATA_DIR = $isolated
$env:SHIFTMGMT_PORT = '18738'
$serverProc = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist/server/main/server.js' -WorkingDirectory $repo -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $isolated 'server.stdout.log') -RedirectStandardError (Join-Path $isolated 'server.stderr.log')
```

| 순서 | 명령·시나리오 | 기대값 |
|---|---|---|
| 0 | `git branch --show-current`, `git rev-parse HEAD`, `git status --short --untracked-files=all`, §3 해시 검증 | main/HEAD/72줄·SHA 일치, 다르면 BLOCKED |
| 1 | `node --check scripts/lib/ui-check.mjs`; `node --check scripts/ui-checks/ready.mjs`; `npm run validate:map`; `npm run typecheck`; `npm run build` | 모두 RC 0, map 75경로 |
| 2 | 격리 서버에서 `node scripts/ui-checks/ready.mjs http://127.0.0.1:18738/` | RC 0, 새 고유 run 폴더의 manifest PASS·PNG 2개·오류 0, 실제 두 화면 직접 확인 |
| 3 | `node scripts/ui-checks/ready.mjs https://example.com/` 및 빈 포트 18736에 `node scripts/ui-checks/ready.mjs http://127.0.0.1:18736/` | 각각 RC 1·RC 2, 외부 접속/Chrome/PNG 없음·빈 포트 PASS 없음 |
| 4 | C30-03: `fetch`를 HTTP 200 객체로 대체하고 `json()`을 끝나지 않는 Promise로 둔 뒤 `checkServerHealth(new URL('http://127.0.0.1:18738/'),50)` 호출 | 250ms 안에 시간 초과 reject. `STILL_PENDING_AFTER_250MS`면 실패 |
| 5 | C30-01: 테스트 전용 `runScreenCheck({id:'manifest-write-probe',url:'http://127.0.0.1:18738/',steps:async({capture})=>{const f=await capture('probe'); mkdirSync(path.join(path.dirname(f),'manifest.json'));}})` | 쓰기 EISDIR, RC 2, PASS 0. 유효한 manifest 파일이 없음을 오류로 보고. 시험용 artifact만 생성 |
| 6 | C30-02: 테스트 전용 steps에서 `page.context().close=async()=>{throw new Error('CLOSE_PROBE')}`로 종료 실패 주입 | context 실패 후 browser 종료 시도, RC 2/FAIL, manifest·stderr에 `CLOSE_PROBE` 기록 |
| 7 | C30-04: 테스트 전용 steps에서 `page.evaluate(()=>setTimeout(()=>{throw new Error('PAGE_ERROR_PROBE')},0))` 후 잠깐 대기 | RC 2/FAIL, manifest `pageErrors`에 `PAGE_ERROR_PROBE`, 범주별 보고 일치 |
| 8 | C30-05: 같은 초에 같은 ID로 실행 폴더를 두 번 만들기(또는 동일 시나리오 두 개 동시 시작) | 생성 함수만 시험하면 두 경로가 서로 달라야 한다. 전체 시나리오를 동시 실행하면 두 manifest/PNG가 덮어쓰기 없이 보존돼야 한다 |
| 9 | `git diff --check`, status 72줄, 보호 SHA 재확인 | RC 0, `scripts/lib/ui-check.mjs`만 수정; 다른 제품·설정·문서 변경 0 |

4~7의 PowerShell 실행 예시는 아래와 같다. 각 명령 직후 `$LASTEXITCODE`를 따로 기록한다. 4번은 `TIMEOUT_OK`/RC 0이어야 하고, 5~7번은 실패를 의도했으므로 RC 2여야 한다. `manifest-write-probe`의 `manifest.json` 경로는 시험용 디렉터리라 정상 JSON 파일이 아니다.

```powershell
node --input-type=module -e 'globalThis.fetch=async()=>({status:200,json:()=>new Promise(()=>{})}); const {checkServerHealth}=await import("./scripts/lib/ui-check.mjs"); const r=await Promise.race([checkServerHealth(new URL("http://127.0.0.1:18738/"),50).then(()=>"UNEXPECTED_RESOLVE",e=>/시간 초과/.test(e.message)?"TIMEOUT_OK":"WRONG_ERROR:"+e.message),new Promise(resolve=>setTimeout(()=>resolve("STILL_PENDING_AFTER_250MS"),250))]); console.log(r); if(r!=="TIMEOUT_OK")process.exitCode=1;'
node --input-type=module -e 'import {mkdirSync} from "node:fs"; import path from "node:path"; import {runScreenCheck} from "./scripts/lib/ui-check.mjs"; await runScreenCheck({id:"manifest-write-probe",url:"http://127.0.0.1:18738/",steps:async({capture})=>{const f=await capture("probe");mkdirSync(path.join(path.dirname(f),"manifest.json"));}});'
node --input-type=module -e 'import {runScreenCheck} from "./scripts/lib/ui-check.mjs"; await runScreenCheck({id:"cleanup-failure-probe",url:"http://127.0.0.1:18738/",steps:async({page,capture})=>{await capture("probe");page.context().close=async()=>{throw new Error("CLOSE_PROBE")};}});'
node --input-type=module -e 'import {runScreenCheck} from "./scripts/lib/ui-check.mjs"; await runScreenCheck({id:"page-error-probe",url:"http://127.0.0.1:18738/",steps:async({page})=>{await page.evaluate(()=>{setTimeout(()=>{throw new Error("PAGE_ERROR_PROBE")},0)});await page.waitForTimeout(150)}});'
```

5~7의 시험은 **실제 UI에 테스트용 오류만 주입**한다. 제품 파일·DB·시안은 고치지 않는다. 테스트용 출력은 `artifacts/captures/phase3/` 아래에만 두고 경로를 회신한다. 검증 실패를 재실행으로 숨기지 말고 첫 실패와 수정 후 결과를 함께 기록한다. 필요한 명령을 inline Node로 실행해도 되며, 인용/이스케이프 문제로 실행하지 못했다면 `UNVERIFIED`라고 적는다. `npm run release:check`는 초기부터 72경로가 변경된 작업 트리이므로 이번 게이트가 아니다.

## 6. 수신 원본·회신 계약

이번 Gemini IMPLEMENTED 수신 파일은 교체 전에 `Log/20260928_133817_3-0-Gemini-IMPLEMENTED_수신원본.md`에 **24,925바이트**, SHA-256 `6767DBA480FFDC3419AB4F9F4B9C430BAB1D49DEB83D368A47138FCA1921174B`로 원본 그대로 보존하고 바이트 일치를 확인했다. 원본에 기록된 기존 통과 증거는 이 수정 요청의 정상 경로 회귀 기준이다.

## 회신

판정: IMPLEMENTED

기준: C:\Projects\Active\ShiftMgmt_V4 / main / 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283 / 커밋 없음(작업 트리 유지)

초기 상태:
- HEAD: 2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283
- git status: 정확히 72개 경로, LF 결합 UTF-8 SHA-256 48FDD56F221A5C295F11E3A15C57BA819171FD372AF3C0FC465FC3B095117A6D
- 보호 파일 6종 및 시작 파일 SHA-256 기준 실측 100% 일치:
  * scripts/lib/ui-check.mjs: F382C2A4FDDF59173567F83E226A29C8CADA4DD682B5DE2EA55C6B027173B169
  * scripts/ui-checks/ready.mjs: 2EE0B97ED1ADC9A5C6B1484DFAE07B2A0655D215606A7CB70E933FAF0237C37C
  * docs/codebase-map.md: 7CBE40E0716A2D2AABBFABC62D13E7A532CAE7B67161C4CB2C62E7CD8BA7CA12
  * scripts/capture-screen.mjs: D594E7529F2B7653642D004B0765E6721B68817ED5A74134F47E9C8F2559F4E1
  * scripts/lib/find-chrome.mjs: 0EF7158EF9657BA3246E05C0662F2A60729C43F75E2E975E0A5C6591AC4A34D9
  * src/web/index.html: D153075DAE67C3FFE8E569AD612C6B59F61775F6C43BF2078B663B64B9E684B0
  * src/web/app.ts: 80EF03B9CE689895E884DE393C78729532F70A56E5F5A86E81D935A15FCAB32E
  * package.json: 162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9

변경 파일:
- scripts/lib/ui-check.mjs: 유일한 수정 파일 (382줄, 12,592바이트). C30-01~C30-05 결함 일괄 수정.
  * C30-01: manifest 파일 작성 실패 시(EISDIR 등) 오류 전파 및 PASS 출력 차단
  * C30-02: finally 정리 시 context 오류 발생 시에도 browser 종료 시도 보장 및 cleanupErrors 기록
  * C30-03: checkServerHealth에서 fetch부터 json() 파싱까지 전체 Promise.race 시간 초과 제어
  * C30-04: pageerror 이벤트 수집을 consoleErrors 대신 pageErrors에 정확히 분리 기록
  * C30-05: mkdtempSync 기반 run-YYYYMMDD-HHmmss-XXXXXX 원자적 고유 실행 폴더 생성
- 범위 밖 변경: 0개 (다른 모든 소스·문서·설정 읽기 전용 유지)

결함별 원인→위치→재현→수정 후 결과:
- C30-01:
  * 원인: writeFileSync 예외 발생 시 stderr 출력만 하고 다음 줄의 PASS 출력 및 RC 0으로 종료됨
  * 위치: scripts/lib/ui-check.mjs manifest 파일 작성 및 판정부
  * 재현: steps 내에서 manifest.json 디렉터리를 사전 생성하여 EISDIR 유발
  * 수정 후: manifestWriteError를 최종 오류 집계에 반영하여 PASS 문구 출력 금지, stderr 에러 출력 후 RC 2로 정상 종료 (실측 RC 2 확인)
- C30-02:
  * 원인: finally 블록에서 context.close()와 browser.close()의 오류를 빈 catch {}로 무시함
  * 위치: scripts/lib/ui-check.mjs runScreenCheck finally 블록
  * 재현: steps 내에서 page.context().close에 CLOSE_PROBE 예외 주입
  * 수정 후: context 실패 시에도 browser.close()를 시도하며, cleanupErrors 배열에 기록하여 manifest errors.cleanupErrors에 수집 및 RC 2/FAIL 종료 (실측 RC 2 확인)
- C30-03:
  * 원인: AbortController 타이머가 fetch 종료 직후 해제되어 response.json() 본문 대기에는 상한이 없었음
  * 위치: scripts/lib/ui-check.mjs checkServerHealth 함수
  * 재현: 모의 fetch로 HTTP 200 반환 후 끝나지 않는 json() Promise 주입 (timeoutMs=50)
  * 수정 후: Promise.race로 fetch/body/json 전체를 묶어 250ms 이내에 '서버 건강 상태 확인 시간 초과' reject 발생 (실측 TIMEOUT_OK, RC 0 확인)
- C30-04:
  * 원인: page.on('pageerror') 리스너에서 consoleErrors에 push하여 pageErrors가 비어 있었음
  * 위치: scripts/lib/ui-check.mjs 이벤트 계측 리스너
  * 재현: steps 내에서 evaluate로 PAGE_ERROR_PROBE 예외 발생
  * 수정 후: pageErrors에 수집되어 manifest errors.pageErrors에 PAGE_ERROR_PROBE 기록 및 RC 2/FAIL 종료 (실측 RC 2 확인)
- C30-05:
  * 원인: 초 단위 타임스탬프로 인해 동일 초 동시 호출 시 디렉터리 덮어쓰기 위험 존재
  * 위치: scripts/lib/ui-check.mjs createUniqueRunDir 함수
  * 재현: 동일 초에 createUniqueRunDir을 연속 호출
  * 수정 후: mkdtempSync로 run-YYYYMMDD-HHmmss-XXXXXX 원자적 생성, 두 경로가 서로 다른 고유 경로로 생성 확인 (실측 UNIQUE_DIRS_OK, RC 0 확인)

검증 증거:
- 게이트 0 (14:12 KST): git branch(main), git rev-parse HEAD(2d97d9b...), 72줄 상태 및 LF SHA-256(48FDD56F...) 실측 일치
- 게이트 1 (14:13 KST): node --check 2파일(RC 0), npm run validate:map(RC 0, 75경로 확인), npm run typecheck(RC 0), npm run build(RC 0)
- 게이트 2 (14:13 KST): 격리 서버(포트 18738, PID 28076, 격리 폴더 C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-ui-c30-20260928141336) 기동 후 node scripts/ui-checks/ready.mjs http://127.0.0.1:18738/ 실행 -> RC 0, manifest PASS, 캡처 2개, 오류 0건
- 게이트 3 (14:13 KST):
  * 3a: node scripts/ui-checks/ready.mjs https://example.com/ -> RC 1 ([URL 검증 실패] http 프로토콜만 허용됩니다)
  * 3b: node scripts/ui-checks/ready.mjs http://127.0.0.1:18736/ (빈 포트 확인 후 실행) -> RC 2 ([서버 확인 실패] 서버 연결 실패 ... fetch failed)
- 게이트 4 (14:13 KST): C30-03 시간 초과 모의 테스트 -> TIMEOUT_OK, RC 0 (250ms 이내 시간 초과 reject 확인)
- 게이트 5 (14:13 KST): C30-01 manifest-write-probe -> RC 2, PASS 출력 0건, [manifest 작성 오류] EISDIR 출력 확인
- 게이트 6 (14:13 KST): C30-02 cleanup-failure-probe -> RC 2, PASS 출력 0건, 정리 오류: 브라우저 컨텍스트 종료 실패: CLOSE_PROBE 확인
- 게이트 7 (14:13 KST): C30-04 page-error-probe -> RC 2, PASS 출력 0건, 페이지 오류: PAGE_ERROR_PROBE 확인
- 게이트 8 (14:13 KST): C30-05 동초 고유 생성 검증 -> p1(...-rGF2ja), p2(...-W3bVbT), UNIQUE_DIRS_OK, RC 0 확인
- 게이트 9 (14:14 KST): git diff --check(RC 0), git status(72줄, LF SHA 일치), 모든 보호 파일 SHA 일치 확인
- 서버 종료: PID 28076 프로세스 중지 및 18738 포트 해제(비어 있음) 확인. 격리 폴더 보존

UI 증거:
- URL: http://127.0.0.1:18738/
- Chrome: C:\Program Files\Google\Chrome\Application\chrome.exe (판 153.0.8010.53)
- 뷰포트: 1440x900
- 캡처 산출물 (직접 뷰어로 육안 검사 완료):
  * ready: artifacts/captures/phase3/ready/run-20260928-141338-Ckq27w/ready.png (h1 제목 '교대근무관리 시스템', 부제목, 상태 줄 '서버 연결됨 · 판 0.1.0 · Node v24.13.0 · 데이터 폴더: ...' 정상 표시)
  * after-reload: artifacts/captures/phase3/ready/run-20260928-141338-Ckq27w/after-reload.png (재로드 후 제목 및 연결됨 상태 정상 유지)
- manifest: artifacts/captures/phase3/ready/run-20260928-141338-Ckq27w/manifest.json (status: PASS, manifestWriteError: null, cleanupErrors: [], errors 0건)
- 오류 건수: 콘솔 오류 0, 페이지 오류 0, 요청 실패 0, HTTP >= 400 0, 정리 오류 0

음성 시험:
- C30-01: manifest-write-probe — 기대 RC 2 / 실제 RC 2 (PASS 출력 0건, EISDIR 오류 출력, artifact: artifacts/captures/phase3/manifest-write-probe/run-20260928-141342-MZcRHM/)
- C30-02: cleanup-failure-probe — 기대 RC 2 / 실제 RC 2 (PASS 출력 0건, manifest cleanupErrors에 CLOSE_PROBE 기록, artifact: artifacts/captures/phase3/cleanup-failure-probe/run-20260928-141343-t4lBjE/manifest.json)
- C30-03: 모의 시간 초과 — 기대 250ms 이내 TIMEOUT_OK / 실제 TIMEOUT_OK, RC 0
- C30-04: page-error-probe — 기대 RC 2 / 실제 RC 2 (manifest pageErrors에 PAGE_ERROR_PROBE 기록, artifact: artifacts/captures/phase3/page-error-probe/run-20260928-141345-4itsAm/manifest.json)
- C30-05: 동초 고유 디렉터리 생성 — 기대 서로 다른 경로 생성 / 실제 UNIQUE_DIRS_OK (run-20260928-141346-rGF2ja, run-20260928-141346-W3bVbT), RC 0
- 원격 URL: https://example.com/ — 기대 RC 1 차단 / 실제 RC 1 (외부 통신 및 브라우저 미호출)
- 빈 포트: http://127.0.0.1:18736/ — 기대 RC 2 연결 실패 / 실제 RC 2 (PASS 없음, PNG 0개)

diff·전체 SHA-256:
- scripts/lib/ui-check.mjs: 91921E353C05ADEE41D4AA725164146F058A02831EDFE77C919E3B68B897266E (382줄, 12,592바이트)
- scripts/ui-checks/ready.mjs: 2EE0B97ED1ADC9A5C6B1484DFAE07B2A0655D215606A7CB70E933FAF0237C37C (보호 일치)
- docs/codebase-map.md: 7CBE40E0716A2D2AABBFABC62D13E7A532CAE7B67161C4CB2C62E7CD8BA7CA12 (보호 일치)
- scripts/capture-screen.mjs: D594E7529F2B7653642D004B0765E6721B68817ED5A74134F47E9C8F2559F4E1 (보호 일치)
- scripts/lib/find-chrome.mjs: 0EF7158EF9657BA3246E05C0662F2A60729C43F75E2E975E0A5C6591AC4A34D9 (보호 일치)
- src/web/index.html: D153075DAE67C3FFE8E569AD612C6B59F61775F6C43BF2078B663B64B9E684B0 (보호 일치)
- src/web/app.ts: 80EF03B9CE689895E884DE393C78729532F70A56E5F5A86E81D935A15FCAB32E (보호 일치)
- package.json: 162CDF6506031A846F6489BDF35CBDB86B099A659761472EFB1DE191045860E9 (보호 일치)
- 작업 트리 상태 줄 수: 정확히 72줄 (status_lf_hash: 48FDD56F221A5C295F11E3A15C57BA819171FD372AF3C0FC465FC3B095117A6D)

미해결/가정:
- 없음. C30-01~C30-05 결함 일괄 수정 및 정상 경로/실패 주입 검증 전건 통과 완료.
- 각 업무 화면별(로그인, 교대관리, 조직/인력관리, 실적가져오기, 수당계산 등) 버튼 클릭 및 화면 전환 시나리오는 향후 Phase 3-1~3-9 구현 단계에서 순차 검증 예정(현재 시점 UNVERIFIED).

