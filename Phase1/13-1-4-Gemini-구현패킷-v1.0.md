# HANDOFF — Phase 1-4 원본 로직 테스트 이관 IMPLEMENT

- Task: 원본 V3.4 로직 시험 110파일·646개를 V4에 바이트 동일하게 이관하고 전체 725개 회귀 시험을 통과시킨다.
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-17 15:34 KST
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `df1f0c8bc00b282a87fcd739d33eed43d2eecb97`
- Expected initial status: `git status --short` 빈 출력

---

# 회신 요청

**누가**: Gemini  
**어디에**: 이 파일 맨 아래 `## 회신`  
**언제**: 착수 게이트 누락·충돌이면 수정 없이 즉시 `BLOCKED`; 그 외 구현·검증·단일 commit 후 회신  
**회신이 없으면**: Sol의 독립 검증과 Phase 1-4 종결이 중단됨

---

## 1. 목표

원본 `C:\Projects\Active\ShiftMgmt_V3.4` commit `112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e`의 이관 대상 로직 시험 110파일을 **한 글자도 고치지 않고** V4에 복사하고, 필요한 지원 자산만 격리해 대상 646/646 및 V4 전체 725/725를 통과시킨다.

## 2. 비목표

- 제품 로직·계약·HTTP route·권한·DB·계산 규칙을 수정하지 않는다.
- 원본 시험의 기대값, mock, timeout, skip/todo/only를 수정하지 않는다.
- 제외 서비스 `app-update-service.ts`, `dashboard-chart-export-service.ts` 또는 그 시험을 복원하지 않는다.
- 옛 Electron 화면, 자동업데이트, 게시 흐름을 V4 제품 기능으로 되살리지 않는다.
- 새 의존성, package script, tsconfig, ESLint 규칙, 빌드 방식을 변경하지 않는다.
- UI 구현·브라우저 실측은 하지 않는다. 이번 작업은 Node 로직 시험 이관이다.

## 3. 현재 상태와 근거

- 현재 단계: `TODO.md` Phase 1-4 — 110파일·646개.
- V4 baseline: `df1f0c8bc00b282a87fcd739d33eed43d2eecb97`, Phase 1-3 111채널 종결, 기존 시험 13파일·79개.
- V3 원본 HEAD: `112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e`.
- V3는 기존 사용자 자료 때문에 dirty가 정상이다. `git status --porcelain=v1`의 LF 직렬화는 135줄·10,656 bytes·SHA-256 `D05CFCC0B3D16FB8AE286D44525DE973D52E44DA59565612DF964B49A610E403`이다. 원본을 clean/reset/stash하지 않는다.
- 정본 목록: `C:\Projects\Active\교대근무관리 시스템\Phase1\12-1-4-테스트복사-목록-v1.0.md`, SHA-256 `C37355C58DA26D6F0FD79726AAEDCBEB512AAAE746F91A4A1CB231A5E639CF75`, 10,244 bytes.
- 읽기 전용 검증기: `C:\Projects\Active\교대근무관리 시스템\Phase1\verify-logic-test-copy.py`, SHA-256 `6E5DC47964AE99445E7C7CD711F60E40B7707BFF772A11587A29DE4BAEC39D5F`, 12,716 bytes.
- 110파일 canonical manifest SHA-256: `D3740A5F69474D20846F0BB7635AC84BE48C3BC6D15A5881951C91C26913E5DA`; 테스트 파일 합계 1,011,497 bytes.
- Sol 사전실증: 지원 자산 없이 110파일만 복사하면 104파일 통과·6파일 실패. 아래 설계 적용 뒤 대상 110파일·646/646, 전체 123파일·725/725, release check PASS.
- 실증 clone commit `8f193d1cd23570186f0f158f1d85c1654a0b64c3`은 증거일 뿐이다. 실제 V4에 cherry-pick하거나 baseline으로 쓰지 않는다.

착수 전 baseline 파일 SHA-256:

| 경로 | SHA-256 | bytes |
|---|---|---:|
| `.gitignore` | `9B3D96B93DA190241F1675151D03F4BD3715E173F0B542564DEE3BA2B7E01C0C` | 74 |
| `vitest.config.ts` | `F8CCFA9D6D92991E478ABAE38BBA55846080CA93C3FDD3A5F49BC444BE48687B` | 482 |
| `docs/codebase-map.md` | `638F0CE67C4D95A5857E1A46863E48AEBDA2FFF43F497C60CB7FDB37F09321C8` | 9,035 |
| `package.json` | `9634739541A3574766F9FFE7245B683ED964EBA59C4CE57C3E1B5D335CDD211C` | 1,503 |
| `package-lock.json` | `17F34827DBE508F9CCF88E16F3A4DB5964FA5CA393A5DF654E39D30C2DEBAECD` | 144,696 |
| `tsconfig.server.json` | `7D87224B9914AEB7B8BE8FC9E4ED228E55479F25D600D098A0F8A15F3C11B7B5` | 487 |
| `tsconfig.browser.json` | `44972CFA55468D3DBA24C7F7E507907E5A3252DCD4B4B5E48033D3477FBEAF3F` | 512 |
| `eslint.config.mjs` | `DDE60037BCFA2382793E8F6702B819239CB0E28080A9D7CE3C62DC2C5BD3E744` | 1,819 |

## 4. 수정 경계

### 4.1 수정/생성 허용 파일 — 닫힌 목록

최종 diff는 **정확히 120파일 = A 117 + M 3**이어야 한다.

| 상태 | 경로/집합 | 요구사항 | 허용 변경 |
|---|---|---|---|
| `A` 110 | §4.1.1의 원본 시험 집합 | R1 | V3 working file을 같은 상대 경로에 바이트 단위 복사 |
| `A` 6 | §4.1.2 지원 자산 | R2 | V3 working file을 지정 대상에 바이트 단위 복사 |
| `A` 1 | `vitest.setup.ts` | R3 | §6.2의 exact content만 |
| `M` 1 | `vitest.config.ts` | R3 | `globals` 다음에 setupFiles 한 줄 추가만 |
| `M` 1 | `.gitignore` | R4 | `artifacts/tests/` 한 줄 추가만 |
| `M` 1 | `docs/codebase-map.md` | R5 | 새 시험·지원 자산·격리 fixture 설명만 |

#### 4.1.1 시험 110파일의 정확한 집합

원본 commit에서 아래 네 범위를 재귀 열거해 `.test.ts`만 고르고, 정확히 두 파일을 제외한 집합이다. 결과는 정본 목록 §3의 110행과 정확히 같아야 한다.

- 포함 범위: `src/shared/domain`, `src/shared/lib`, `src/main/services`, `src/main/ipc/ipc-handler-helpers.test.ts`
- 제외: `src/main/services/app-update-service.test.ts`, `src/main/services/dashboard-chart-export-service.test.ts`
- 기대 분포: domain 26 · lib 2 · services 81 · ipc 1 = 110
- 기대 시험 수: 177 + 7 + 447 + 15 = 646

목록 확인 명령:

```powershell
$originRepo = "C:\Projects\Active\ShiftMgmt_V3.4"
$originRef = "112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e"
$tests = @(& git -C $originRepo ls-tree -r --name-only $originRef -- src/shared/domain src/shared/lib src/main/services src/main/ipc/ipc-handler-helpers.test.ts) | Where-Object {
  $_ -like "*.test.ts" -and $_ -notin @(
    "src/main/services/app-update-service.test.ts",
    "src/main/services/dashboard-chart-export-service.test.ts"
  )
} | Sort-Object
if ($tests.Count -ne 110) { throw "expected 110 tests, got $($tests.Count)" }
```

#### 4.1.2 지원 자산 6개

| V3 원본 | V4 대상 | SHA-256 |
|---|---|---|
| `scripts/issue-account-recovery-key.mjs` | 같은 경로 | `36B0526C6754252BFDDB5C93B134C54BAB5F9C1B1AE7C9A2469C6CBDD935053D` |
| `build/installer-update-data.ps1` | 같은 경로 | `F61AB24D11B98518BC0C53FFD2591D94CE87AD0C6146FC7D3D2C7181592869A4` |
| `scripts/lib/release-publish-helpers.cjs` | 같은 경로 | `5ABA70811610F78D2E7DDF32C4C427E3C45DB7037C438C8B00D55CAAA8EE035B` |
| `src/renderer/assets/brand-logo-clean.png` | 같은 경로 | `48D24D72B6360738B30BBCB324914F20867993A4DA2B571C2138A521266CFA85` |
| `artifacts/releases/v0.4.5/RELEASE_MANIFEST.json` | `test-fixtures/legacy-resources/release-history/v0.4.5/RELEASE_MANIFEST.json` | `B65F333A937D77F1C70756C6246495F63EB144D7E7B1D8A28A995D5EF31BA9D8` |
| `artifacts/releases/v0.4.6/RELEASE_MANIFEST.json` | `test-fixtures/legacy-resources/release-history/v0.4.6/RELEASE_MANIFEST.json` | `D37E306A7363D6392EB6F728E6FD9A4327C16EF3F65E6197D112BC5A9AA9995B` |

이 표에 없는 제품 파일은 수정하거나 생성하지 않는다. 새 파일이 더 필요해 보이면 만들지 말고 `BLOCKED`로 질문한다.

### 4.2 읽기 전용/금지 경로

- `C:\Projects\Active\ShiftMgmt_V3.4\**` — 읽기만. clean/reset/stash/checkout/add/commit 금지.
- V4의 `src/shared/domain/**`, `src/shared/lib/**`, `src/main/services/**`, `src/main/ipc/**`에서 §4.1.1의 신규 시험 이외 기존 파일 전부 수정 금지.
- V4의 `src/shared/config/**`, `src/shared/bridge/**`, `src/main/http/**`, `src/main/server.ts`, `src/main/runtime.ts`, `src/web/**`, `양식샘플/**`, `vendor/**` 수정 금지.
- `package.json`, `package-lock.json`, `tsconfig.*`, `eslint.config.mjs`, `scripts/release-check.mjs`, `scripts/smoke-require.mjs` 수정 금지.
- 루트 제어 저장소의 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, `Phase1/**`, `Log/**` 수정 금지.
- 기존 `Log/`는 append-only다.

### 4.3 허용된 제어 파일 변경

- 루트 `HANDOFF.md`의 보이는 `## 회신` 칸만 채운다.

## 5. 요구사항

| ID | 입력/행동 | 기대 결과 | 오류/경계 동작 | 구현 위치 |
|---|---|---|---|---|
| R1 | V3 정본에서 대상 시험 선택 | 정확히 110파일을 같은 상대 경로에 byte copy | 109/111 또는 제외 2개 포함이면 중단 | §4.1.1 |
| R2 | 원본 시험의 파일 경로 의존성 | 지원 자산 6개만 byte copy | 추가 레거시 자산·전체 release history 복사 금지 | §4.1.2 |
| R3 | 릴리스 이력 시험 | fixture v0.4.5/0.4.6만 test resources로 노출 | V4 제품의 `artifacts/releases`나 build에 옛 이력 노출 금지 | `vitest.setup.ts`, `vitest.config.ts` |
| R4 | 원본 시험이 `artifacts/tests`에 출력 | test output만 git 무시, 시험 뒤 clean 유지 | 제품 output 또는 광역 `artifacts/` ignore 금지 | `.gitignore` |
| R5 | 코드 지도 | 110/646, 지원 스크립트, 로고, 격리 fixture를 사실대로 기록 | 존재하지 않는 경로·제품 기능 과장 금지 | `docs/codebase-map.md` |
| R6 | 대상 시험 실행 | 110 files · 646/646 · failed/skipped/todo 0 | 테스트 수정·완화로 통과 금지 | Vitest |
| R7 | 전체 회귀 | 123 files · 725/725 · failed/skipped/todo 0 | 기존 79개 손상 금지 | Vitest |
| R8 | 범위·무결성 | changed 120(A117/M3), copied bytes/blob 116/116, clean | 범위 밖 1개라도 있으면 FAILED | 검증기·git |

## 6. Sol의 코드 전략 — 이 순서대로 구현

### 6.1 기존 구조 재사용

- 테스트 runner는 기존 Vitest 3.2와 node environment를 그대로 쓴다.
- 업무 코드는 Phase 1-2 복사본을 그대로 쓴다. 시험에 맞춰 업무 코드를 고치지 않는다.
- Excel fixture는 이미 V4에 복사된 `양식샘플` 9개를 그대로 쓴다.
- PDF 시험은 기존 `vendor/electron-compat`를 그대로 쓴다.
- 릴리스 이력 2개만 test-only `process.resourcesPath`로 주입한다.

### 6.2 파일별 변경 순서

1. 착수 게이트를 통과한 뒤 §4.1.1의 110파일을 `Copy-Item -LiteralPath`로 같은 상대 경로에 복사한다. 편집기로 열어 저장하지 않는다.
2. §4.1.2의 6개 지원 자산을 지정 대상에 `Copy-Item -LiteralPath`로 복사한다.
3. `.gitignore`의 `artifacts/captures/` 다음에 정확히 `artifacts/tests/` 한 줄을 추가한다.
4. `vitest.config.ts`의 `globals: true,` 다음에 정확히 `setupFiles: "./vitest.setup.ts",` 한 줄을 추가한다.
5. 루트 `vitest.setup.ts`를 아래 exact content로 추가한다.
6. `docs/codebase-map.md`에 다음 사실만 반영한다: setup 역할, 지원 스크립트 3개가 시험용이며 제품 자동 실행이 아님, domain 26/177, lib 2/7, services 81/447, ipc 1/15, 로고 자산, test fixture 2개가 제품 이력에 포함되지 않음.
7. §9 게이트를 실행한다. 실패하면 테스트나 제품 코드를 고치지 말고 누락된 지정 자산·경로만 대조한다.
8. 최종 diff가 120파일 exact일 때 한 commit을 만든다. commit message는 `test: restore phase 1-4 logic suite`로 고정한다.
9. commit 뒤 읽기 전용 검증기와 release check를 실행하고 clean 상태로 회신한다.

`vitest.setup.ts` exact content:

```ts
import path from "node:path";

Object.defineProperty(process, "resourcesPath", {
  configurable: true,
  value: path.resolve(process.cwd(), "test-fixtures", "legacy-resources")
});
```

`vitest.config.ts` 허용 diff:

```diff
     environment: "node",
     globals: true,
+    setupFiles: "./vitest.setup.ts",
     include: ["src/**/*.test.ts"],
```

`.gitignore` 허용 diff:

```diff
 artifacts/captures/
+artifacts/tests/
 .DS_Store
```

### 6.3 최소 변경 원칙

- 110개 시험과 6개 지원 자산은 바이트 복사다. 줄바꿈·인코딩·주석·정렬도 바꾸지 않는다.
- 기존 파일 3개는 지정 hunk만 수정한다.
- repository-wide formatter, lint fix, import 정리, 이름 변경을 하지 않는다.
- package/lockfile 변경은 0이어야 한다.

## 7. 적용할 불변조건과 과거 함정

### 7.1 필수 불변조건

- “화면은 새로, 계산은 그대로.” 로직과 원본 로직 시험은 수정하지 않는다.
- 승인+계산 원자성, forward-only와 두 명시 예외, 근무일 기준 요율, 데이터 절단 금지, 중복 계산 차단, 내부 teamLabel 사용을 그대로 보증한다.
- 원본 990개 중 화면 시험은 이관하지 않는다. D-10의 110파일·646개만 대상이다.
- `app-update` 7개와 `dashboard-chart-export` 4개 시험은 서비스가 이관되지 않았으므로 반드시 제외한다.
- V3는 운영 원본이며 읽기 전용이다.

### 7.2 반드시 피할 과거 실패

- 시험 파일만 복사하면 6파일이 실패한다. 실패를 기대값 수정으로 덮지 말고 지정 지원 자산 6개를 쓴다.
- v0.4.5/v0.4.6 manifest를 `artifacts/releases`에 두면 V4 제품의 이력처럼 노출될 수 있다. 반드시 `test-fixtures/legacy-resources`에 격리한다.
- 원본 시험은 `artifacts/tests`에 SQLite/xlsx/WAL을 남긴다. 시험 뒤 clean을 위해 정확히 그 하위만 ignore한다.
- `src/renderer/assets/brand-logo-clean.png`만 복사한다. 옛 renderer 코드나 다른 asset을 따라오지 않는다.
- V3 dirty 상태는 사용자 자료다. 정리하거나 기준 상태로 착각하지 않는다.
- 짧은 SHA, 추측한 해시, 실행하지 않은 명령을 회신하지 않는다.

## 8. 착수 전 확인

아래가 하나라도 다르면 제품 파일을 수정하지 않고 `BLOCKED`로 회신한다.

1. V4 저장소·branch·HEAD가 머리말과 일치하고 `git status --short`가 빈 출력이다.
2. V3 HEAD가 `112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e`이며, 기존 status 직렬화가 135줄·10,656 bytes·지정 SHA와 일치한다.
3. 정본 목록과 검증기 SHA-256/bytes가 §3과 일치한다.
4. baseline 파일 8개의 SHA-256/bytes가 §3 표와 일치한다.
5. 원본 집합이 110파일, 분포 26/2/81/1이고 제외 2파일이 집합에 없다.
6. 요구사항·코드 전략·검증 기준 사이 모순이 없다.

## 9. 검증 계획

### 9.1 정적·빌드·시험

| 순서 | 정확한 명령 | 기대 |
|---:|---|---|
| 1 | `npm run typecheck` | RC 0 |
| 2 | `npm run lint` | RC 0 · error 0 · 기존 warning 7 |
| 3 | `npx vitest run src/shared/domain src/shared/lib src/main/services src/main/ipc/ipc-handler-helpers.test.ts --maxWorkers=1 --minWorkers=1` | RC 0 · 110 files · 646/646 · skipped/todo 0 |
| 4 | `npm test` | RC 0 · 123 files · 725/725 · skipped/todo 0 |
| 5 | `npm run build` | RC 0 · `WEB_ASSETS_OK` |
| 6 | `npm run validate:map` | RC 0 · 71 paths |
| 7 | `npm run smoke` | RC 0 · 72 services |
| 8 | `git diff --cached --check` | commit 전 RC 0 |
| 9 | `git commit -m "test: restore phase 1-4 logic suite"` | exactly one commit on baseline |
| 10 | 아래 검증기 명령 | RC 0 · `LOGIC_TEST_VERIFY_OK`와 110/116/120 수치 exact |
| 11 | `git diff --check df1f0c8bc00b282a87fcd739d33eed43d2eecb97 HEAD` | RC 0 |
| 12 | `npm run release:check` | RC 0 · `RELEASE_CHECK_OK` |
| 13 | `git status --short` | 빈 출력 |

검증기 명령:

```powershell
python "C:\Projects\Active\교대근무관리 시스템\Phase1\verify-logic-test-copy.py" "C:\Projects\Active\ShiftMgmt_V4" --baseline df1f0c8bc00b282a87fcd739d33eed43d2eecb97 --origin "C:\Projects\Active\ShiftMgmt_V3.4" --origin-ref 112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e
```

기대 핵심 출력:

```text
LOGIC_TEST_VERIFY_OK
tests=110 domain=26 lib=2 services=81 ipc=1
copied_worktree_bytes=116/116
copied_git_blob_mode=116/116
changed_paths=120 added=117 modified=3
excluded_tests=2 absent=2
target_worktree=clean
```

### 9.2 음성 시험

| ID | 조작/검사 | 기대 차단 | 실패 판정 |
|---|---|---|---|
| N1 | final tree에서 제외 2시험 존재 여부 확인 | 둘 다 absent | 하나라도 존재 |
| N2 | 검증기로 116개 copy bytes/blob 대조 | 116/116 | 시험·지원 자산 한 바이트라도 수정 |
| N3 | baseline 대비 changed path 대조 | 120 exact(A117/M3) | 범위 밖·누락·상태 차이 |
| N4 | full test 뒤 `git status --short` | 빈 출력 | `artifacts/tests` 산출물이 untracked로 노출 |
| N5 | `rg -n "0\.4\.6|GitHub Releases 기반 자동업데이트" dist` | match 0, `rg` RC 1 | 옛 이력이 제품 build에 포함 |
| N6 | V3 status LF 직렬화 재계산 | SHA/lines/bytes 착수 전과 동일 | 원본 변경 |

### 9.3 회귀·불변 확인

- 제품 코드 diff 0.
- package/lockfile/tsconfig/eslint diff 0.
- 기존 13파일·79개 시험이 전체 725개 안에서 그대로 통과.
- 원본 V3 status fingerprint가 전후 동일.
- test fixture 2개는 `dist`에 포함되지 않는다.

### 9.4 UI/런타임 확인

- 해당 없음 — 화면이나 HTTP 동작을 변경하지 않는 로직 시험 이관이다.
- native dialog와 브라우저 111채널은 Phase 1-3 종결 증거를 재사용한다.

## 10. 성공 조건

- [ ] R1~R8 전부 구현 위치와 실행 증거가 있다.
- [ ] V3 시험 110파일과 지원 자산 6개가 worktree bytes 및 git blob/mode 116/116 exact다.
- [ ] target 646/646, full 725/725가 failed/skipped/todo 0으로 통과한다.
- [ ] 변경은 120파일 exact(A117/M3), 한 commit, parent baseline exact다.
- [ ] 제품 코드·의존성·계약·DB·계산 변경은 0이다.
- [ ] release check가 통과하고 최종 worktree가 clean이다.
- [ ] 아래 회신 양식에 전체 40자 commit과 재현 가능한 증거가 있다.

## 11. 즉시 중단 조건

- 기준 commit·초기 status·보호 SHA가 다르다.
- 원본 test 집합이 110이 아니거나 source status fingerprint가 다르다.
- 110개 시험 또는 6개 지원 자산을 편집해야만 통과한다.
- 허용 목록 밖 파일, 새 의존성, 제품 로직 변경이 필요하다.
- 646/725 개수가 다르거나 skip/todo가 생긴다.
- 검증기가 실패하거나 release check를 clean commit에서 재현할 수 없다.
- 지시·정본·실제 소스가 충돌한다.

---

## 회신

> Gemini가 아래 양식을 실제 값으로 채운다. 이 위 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / baseline 전체 40자 / 최종 commit 전체 40자
초기 상태: V4 HEAD·status·보호 SHA / V3 HEAD·status fingerprint / 목록·검증기 SHA
변경 파일:
- 110 test files: byte-copy, groups 26/2/81/1
- 6 support assets: source -> target별 목적
- vitest.setup.ts / vitest.config.ts / .gitignore / docs/codebase-map.md
범위 밖 변경: 0개 | 정확한 경로와 사유
요구사항 대조:
- R1~R8: 구현 위치 — PASS | FAIL | BLOCKED
검증 증거:
- 정확한 명령 — 종료 코드 — 핵심 개수/결과 — 실행 시각 KST
음성 테스트:
- N1~N6 — 기대 — 실제
UI 증거: 해당 없음 — 화면/HTTP 변경 없음
diff 요약: 120 files · A117/M3 · 추가/삭제 줄 · 의존성 변화 0
전체 SHA-256:
- 변경 120파일 전부(명령으로 얻은 64자 해시)
- 목록 문서·검증기 해시 재확인
원본 무변경: status fingerprint 전/후
미해결/가정: 없음 | 목록
```
