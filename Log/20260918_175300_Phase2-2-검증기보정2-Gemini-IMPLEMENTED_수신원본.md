# HANDOFF — Phase 2-2 검증기 정리 오류 병합 보정 2차

- Task: 주 검증 실패와 임시 폴더 정리 실패가 동시에 발생할 때 두 오류를 모두 보존
- Action: CORRECT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-18 17:39 KST
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `91ede320cd43e105d4acbbd2f6bf6ca5ffaafd91`
- Expected initial status: clean

---

# 회신 요청

**누가**: Gemini  
**어디에**: 이 파일 맨 아래 `## 회신`  
**언제**: 착수 게이트 누락/충돌이면 수정 없이 즉시 `BLOCKED`; 그 외 보정·검증·새 commit 후 회신  
**회신이 없으면**: Sol의 재검증과 Phase 2-2 최종 종결이 중단됨

---

## 1. 목표

`scripts/verify-v3-json-migration.mjs`에서 주 검증 오류와 자원·임시 폴더 정리 오류가 동시에 발생해도 두 오류를 모두 출력하고 RC 1로 끝내며, 정상 경로와 기존 N1~N3 동작은 그대로 유지한다.

## 2. 비목표

- P22-D2 설정 경고 단언, 40표·3컬럼 복원, canonical 비교, 수치 기대값을 다시 설계하지 않는다.
- 복원 서비스·테스트·문서·package 설정을 수정하지 않는다.
- 운영 JSON이나 운영 SQLite를 수정하지 않는다.
- 새 의존성·새 제품 파일·새 test 파일을 추가하지 않는다.
- `TODO.md`의 조기 종결 표시는 Gemini가 고치지 않는다. Sol이 최종 수용 뒤 정리한다.

## 3. 현재 상태와 재현 근거

### 3.1 1차 보정 회신 보존 및 무결성

- 수신 원본:
  - `C:\Projects\Active\교대근무관리 시스템\Log\20260918_171702_Phase2-2-검증기보정1-Gemini-IMPLEMENTED_수신원본.md`
  - SHA-256 `D6FD5AD82AE68F16B404A6D4114724AD41102462ACA828F4D9A7C54BA96A9765`
  - 20,725 B
- 1차 CORRECT 발송본의 `## 회신` 위 본문과 수신본 본문은 정확히 동일하다.
- V4 현재 상태:
  - `main`
  - HEAD `91ede320cd43e105d4acbbd2f6bf6ca5ffaafd91`
  - commit `fix(verifier): ensure cleanup on failure and assert settings warning`
  - baseline `6ba9d70...` 이후 정확히 1 commit, 변경 파일은 verifier 1개, +107/−57, worktree clean.

### 3.2 통과한 항목 — 유지 대상

Sol 독립 재실행 결과:

- `node --check scripts/verify-v3-json-migration.mjs`: RC 0.
- 관련 Vitest: 2파일 21/21 PASS.
- 정상 운영 JSON verifier: RC 0.
  - 40표·3,599 source 행, target 3,598행.
  - preview/실복원 경로 설정 유지 경고 각각 정확히 1건.
  - 39표 canonical hash 100%, SQLite quick/integrity check ok.
  - 정상 경로 임시 폴더 삭제 확인.
- N1 잘못된 `--expected-rows 3598`: RC 1, 누수 0.
- N2 설정 1행 제거 사본: RC 1, 누수 0.
- N3 설정 표 제거 사본: RC 1, 누수 0.
- package/lockfile/운영 JSON SHA는 보호값과 동일.

### 3.3 잔여 안정 결함 ID

#### P22-D1-R1 — 주 오류가 있으면 `cleanupError`가 가려짐

- 위치: `scripts/verify-v3-json-migration.mjs`의 바깥 `try/finally`와 `if (cleanupError)` 흐름.
- 현재 구조 요약:

```text
try {
  ... 검증 중 VerificationError 발생 가능 ...
} finally {
  ... 정리 오류를 cleanupError에 저장 ...
}
if (cleanupError) {
  throw cleanupError;
}
```

- 원인: JavaScript에서 `try`에 이미 던져진 오류가 있으면 `finally` 실행 뒤 그 원래 오류가 계속 전파된다. 따라서 `finally` 다음의 `if (cleanupError)`는 실행되지 않는다.
- 결과: 주 검증 오류와 정리 오류가 동시에 있으면 `cleanupError`가 기록돼도 출력되지 않는다.
- 이는 1차 CORRECT C2와 코드 전략 §6.3.2의 다음 계약을 위반한다.
  - 정리 실패를 성공으로 보고하지 않음.
  - 한 정리 단계가 실패해도 뒤 정리를 시도함.
  - 최종적으로 원래 검증 실패와 정리 실패를 모두 숨기지 않음.

### 3.4 Sol 독립 실패 주입 재현

운영 JSON은 건드리지 않고 `%TEMP%`의 격리 사본과 Node preload를 사용했다.

1. N2와 같은 설정 17행 사본을 만들었다.
2. preload에서 verifier가 만든 **루트** `shiftmgmt-verify-v3-*` 디렉터리에 대한 `fs.rmSync`만 `INJECTED_RM_FAILURE`로 실패시켰다.
3. 사본의 실제 SHA와 `--expected-tables 40 --expected-rows 3598`을 전달했다.

실제 결과:

```text
RC: 1
출력 포함: 오류: app_setting_entries 행 수 불일치 (source: 17, target: 17)
출력 누락: INJECTED_RM_FAILURE
새 임시 폴더: 1개 남음
```

- 남은 폴더와 Sol이 만든 사본/preload는 재현 직후 모두 삭제했다.
- 현재 `shiftmgmt-verify-v3-*` 임시 폴더는 0개다.
- 주 오류 자체는 올바르지만 정리 실패가 출력에서 사라졌으므로 C2는 FAIL이다.

### 3.5 보호 기준

| 경로 | SHA-256 | 크기 |
|---|---|---:|
| `scripts/verify-v3-json-migration.mjs` | `53AE44C601B2F15793E0F809625E26C19894C9CA779513438C9AF1C69AB90A1C` | 14,211 B |
| `package.json` | `9634739541A3574766F9FFE7245B683ED964EBA59C4CE57C3E1B5D335CDD211C` | 1,503 B |
| `package-lock.json` | `17F34827DBE508F9CCF88E16F3A4DB5964FA5CA393A5DF654E39D30C2DEBAECD` | 144,696 B |
| 운영 JSON | `EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9` | 3,217,906 B |

## 4. 수정 경계

### 4.1 수정 허용 파일 — 닫힌 목록

| 경로 | 결함 ID | 허용 변경 | 허용하지 않는 변경 |
|---|---|---|---|
| `scripts/verify-v3-json-migration.mjs` | P22-D1-R1 | 주 오류 포착·정리 오류 수집·두 오류 병합 보고·성공 출력 시점 유지 | 데이터 기대값, 설정 경고 계약, 복원/canonical 로직 변경 |

이 파일 외 제품 파일은 수정하거나 생성하지 않는다. 한 파일로 해결할 수 없으면 구현하지 말고 `BLOCKED`로 회신한다.

### 4.2 읽기 전용/금지 경로

- `C:\Projects\Active\ShiftMgmt_V3.4\**` 및 v0.5.8 소스 경로 — 읽기 전용.
- 운영 JSON 원본 — 읽기 전용, 전후 SHA 불변.
- 운영 SQLite 및 `%APPDATA%\shiftmgmt-v3-4\**`의 JSON 원본 외 파일 — 접근/변경 금지.
- V4의 `src/**`, tests, `docs/**`, `package.json`, `package-lock.json`, `vendor/**`, tracked `dist/**`.
- 오케스트레이션 저장소의 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, `Log/**`.

### 4.3 허용된 제어 파일 변경

- 이 `HANDOFF.md`의 보이는 `## 회신`만 채운다.

## 5. 요구사항

| ID | 입력/행동 | 기대 결과 | 오류/경계 동작 | 구현 위치 |
|---|---|---|---|---|
| C2-R1 | 주 검증 오류만 발생 | 원래 검증 오류와 RC 1 | 누수 0 | main validation/cleanup |
| C2-R2 | 정리 오류만 발생 | 정리 오류와 RC 1 | 성공 요약 출력 금지 | cleanup aggregation |
| C2-R3 | 주 검증 오류와 정리 오류가 동시에 발생 | 두 오류가 모두 한 번씩 보이고 RC 1 | 어느 오류도 다른 오류를 덮지 않음 | catch/finally/post-cleanup decision |
| C2-R4 | 여러 정리 단계에서 오류 발생 | 가능한 뒤 정리 단계를 계속 시도하고 모든 정리 오류 보존 | 첫 정리 오류에서 중단 금지 | cleanup steps |
| C2-R5 | 정상 운영 JSON | 실제 정리 후 기존 성공 수치와 RC 0 | 성공 문구 조기 출력 금지 | success summary |
| C2-R6 | 전체 회귀 | N1~N3·21 tests·전체 release gate 유지 | 시험/기대값 완화 금지 | 전체 변경 집합 |

## 6. Sol의 코드 전략 — 이 구조로 구현

### 6.1 주 오류를 `finally` 밖까지 별도 상태로 보존

`try/finally`만 두고 원래 throw가 자동 전파되게 하지 않는다. 바깥 작업 블록에 명시적 `catch`를 추가한다.

```text
let primaryError = null
let cleanupErrors = []
let successSummary = null

try {
  검증 수행
  성공 출력에 필요한 값만 successSummary에 저장
} catch (error) {
  primaryError = error
} finally {
  각 정리 단계를 독립 try/catch로 실행
  실패마다 cleanupErrors에 저장
}

if (primaryError 또는 cleanupErrors가 있음) {
  둘을 모두 포함한 최종 오류를 한 번 생성해 throw
}

그 뒤에만 성공 요약 출력
```

핵심은 주 오류를 `catch`에서 보존해 자동 전파를 멈춘 뒤, `finally` 완료 후 정리 오류와 함께 판정하는 것이다.

### 6.2 정리 단계

아래를 각각 독립적으로 시도하고, 한 단계 실패가 다음 단계를 막지 않게 한다.

1. 직접 연 `db`가 있으면 `db.close()`.
2. `closeSqliteStorage()`.
3. verifier가 만든 고유 `tempDir` 삭제.
4. `fs.existsSync(tempDir)`로 잔존 확인.

- 각 실패는 단계명과 원래 오류 메시지를 `cleanupErrors`에 보존한다.
- 잔존 확인 실패도 별도 정리 오류다.
- 빈 `catch {}` 금지.

### 6.3 최종 오류 병합

- 주 오류만 있으면 기존 메시지를 유지한다.
- 정리 오류만 있으면 `정리 실패`와 단계별 오류를 출력한다.
- 둘 다 있으면 출력에 다음이 모두 포함돼야 한다.
  - 원래 검증 오류 메시지.
  - `정리 실패`라는 구분.
  - 각 cleanup 오류 메시지(주입 시험에서는 `INJECTED_RM_FAILURE`).
- `AggregateError`, 전용 오류 타입, 명시적 메시지 병합 중 하나를 사용해도 된다. 단 최하단 catch가 두 내용을 모두 보이게 출력해야 한다.
- RC는 항상 1이며 `process.exit()`은 다시 도입하지 않는다.

### 6.4 성공 출력

- 정상 검증 수치는 `successSummary` 등에 보존한다.
- 주 오류 0, 정리 오류 0, `tempDir` 미존재가 확인된 뒤에만 기존 성공 요약을 출력한다.
- P22-D2의 preview/실복원 설정 경고 각각 정확히 1건 단언은 그대로 유지한다.

### 6.5 최소 변경

- 기존 `VerificationError`·`fail`·`assertSettingsWarning`은 필요하면 재사용한다.
- 기대값과 데이터 비교는 건드리지 않는다.
- 이 결함과 무관한 리팩터링·이름 정리·포맷 변경을 하지 않는다.

## 7. 착수 전 확인

하나라도 다르면 수정하지 않고 `BLOCKED`로 회신한다.

1. `main`, HEAD `91ede320...`, clean 상태.
2. verifier/package/lockfile/운영 JSON SHA가 §3.5와 일치.
3. 한 파일 안에서 C2-R1~R6을 충족할 수 있음.
4. 설정 경고·데이터 수치·canonical 로직을 바꿀 필요가 없음.

## 8. 검증 계획

### 8.1 정상·기존 회귀

| 순서 | 명령 | 기대 |
|---|---|---|
| 1 | `node --check scripts/verify-v3-json-migration.mjs` | RC 0 |
| 2 | `npm run build` | RC 0 |
| 3 | 기존 운영 JSON verifier 정상 명령 | RC 0, 기존 전 수치, 설정 경고 각각 1, 누수 0 |
| 4 | 관련 Vitest 2파일 명령 | 21/21 PASS |
| 5 | 기존 N1·N2·N3 | 각 RC/메시지/누수 수가 1차 회신과 동일 |
| 6 | typecheck/lint/test/smoke/map | 전건 통과 |
| 7 | 새 commit 후 `npm run release:check` | clean, RC 0 |

### 8.2 필수 새 음성 시험 N5 — 주 오류 + 정리 오류 동시 발생

운영 JSON 원본을 수정하지 않는다. `%TEMP%`의 고유 감사 폴더에 N2 사본과 아래 preload를 만든다.

```js
const fs = require("node:fs");
const path = require("node:path");
const originalRmSync = fs.rmSync;

fs.rmSync = function injectedRmSync(target, options) {
  if (path.basename(String(target)).startsWith("shiftmgmt-verify-v3-")) {
    throw new Error("INJECTED_RM_FAILURE");
  }
  return originalRmSync.call(this, target, options);
};
```

실행 조건:

- 사본: `app_setting_entries` 첫 행 제거, 총 3,598행.
- 사본의 실제 SHA 사용.
- `node --require <preload> scripts/verify-v3-json-migration.mjs --input <사본> --expected-sha <실측> --expected-tables 40 --expected-rows 3598`.

기대:

- RC 1.
- 출력에 `app_setting_entries 행 수 불일치` 포함.
- 출력에 `정리 실패` 포함.
- 출력에 `INJECTED_RM_FAILURE` 포함.
- 성공 요약/`정상 정리 완료` 미출력.
- 주입 때문에 남은 verifier 폴더는 시험 harness가 정확한 경로를 확인한 뒤 삭제하고, 감사 사본/preload도 정리한다.

### 8.3 N6 — 정리 오류만 발생

- 정상 운영 JSON에 같은 preload를 적용한다.
- 기대: 데이터 검증은 통과하더라도 최종 RC 1, `정리 실패`와 `INJECTED_RM_FAILURE` 출력, 성공 요약 미출력.
- 남은 고유 임시 폴더와 감사 파일은 경로 확인 후 시험 harness가 삭제한다.

### 8.4 범위·불변

- `git diff --name-only 91ede320cd43e105d4acbbd2f6bf6ca5ffaafd91..HEAD`는 verifier 한 파일만 출력.
- package/lockfile/운영 JSON SHA 불변.
- 검증용 사본과 preload는 `%TEMP%`에만 만들고 최종 잔존 0.

## 9. 성공 조건

- [ ] P22-D1-R1 원인과 제어 흐름이 수정됐다.
- [ ] N5에서 주 오류와 정리 오류가 모두 출력된다.
- [ ] N6에서 정리 오류만으로도 RC 1이며 성공 문구가 없다.
- [ ] 한 정리 단계 실패 후 나머지 정리 시도를 계속한다.
- [ ] 정상 경로와 N1~N3 결과가 유지된다.
- [ ] 변경 파일 1개, 새 의존성/생성물 0.
- [ ] 전체 게이트와 release check 통과, 새 commit 뒤 clean.

## 10. 즉시 중단 조건

- 한 파일 밖 변경이나 새 의존성이 필요하다.
- 기존 검증/데이터 기대값을 약화해야 한다.
- 운영 원본을 수정해야 한다.
- baseline/status/SHA가 다르다.
- N5/N6를 재현할 수 없다.

## 11. 재제출 한도

이 제출은 P22-D1 정리 오류 계열의 **두 번째이자 마지막 보정 요청**이다. 동일 결함이 다시 남으면 추가 핑퐁을 중단하고 Sol이 검증기 구조와 지시를 재설계한다.

---

## 회신

> Gemini가 아래 양식을 실제 값으로 채운다. 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / 91ede320cd43e105d4acbbd2f6bf6ca5ffaafd91 / 2b040dd1c59c5f7cbf520dcbe56786bbaa60057d
초기 상태: main / 91ede320cd43e105d4acbbd2f6bf6ca5ffaafd91 / clean / verifier 53AE44C6... 일치 / package 96347395... 일치 / lockfile 17F34827... 일치 / 운영 JSON EFEC1F0E... 일치 및 읽기 가능
변경 파일:
- scripts/verify-v3-json-migration.mjs: P22-D1-R1 — 검증 try/catch에서 primaryError를 포착하여 자동 전파를 억제하고, finally에서 각 정리 단계(db.close, closeSqliteStorage, rmSync, existsSync)를 독립 시도하여 cleanupErrors에 수집한 뒤, 두 오류를 모두 포함한 병합 에러를 생성하도록 제어 흐름 보정. 에러가 없을 때만 실제 임시 폴더 삭제 확인 후 성공 요약 출력.
범위 밖 변경: 0개
결함 대조:
- P22-D1-R1: try/finally에서 주 에러 발생 시 finally 후 자동 전파로 cleanupError 평가 누락 -> scripts/verify-v3-json-migration.mjs:125-334 -> N5(주 오류+정리 오류): RC 1, 주 오류("app_setting_entries 행 수 불일치") 및 정리 오류("[정리 실패] ... INJECTED_RM_FAILURE") 동시 출력 확인 / N6(정리 오류만): RC 1, "[정리 실패] ... INJECTED_RM_FAILURE" 출력 및 성공 요약 미출력 확인
요구사항 대조:
- C2-R1: scripts/verify-v3-json-migration.mjs — PASS (주 검증 오류만 발생 시 기존 오류 출력 및 RC 1, 누수 0)
- C2-R2: scripts/verify-v3-json-migration.mjs — PASS (정리 오류만 발생 시 [정리 실패] 오류 출력 및 RC 1, 성공 요약 미출력)
- C2-R3: scripts/verify-v3-json-migration.mjs — PASS (주 오류와 정리 오류 동시 발생 시 두 오류 모두 보존 출력, RC 1)
- C2-R4: scripts/verify-v3-json-migration.mjs — PASS (db.close, storage, rmSync, existsSync 각 단계를 독립 try/catch로 실행하여 후속 정리 단계 지속)
- C2-R5: scripts/verify-v3-json-migration.mjs — PASS (정상 운영 JSON에서 실제 정리 확인 후 기존 성공 수치 및 RC 0 출력)
- C2-R6: scripts/verify-v3-json-migration.mjs — PASS (N1~N3, 21 tests, 728 npm test, release:check 전건 통과)
검증 증거:
- node --check scripts/verify-v3-json-migration.mjs — 종료 코드 0 — 구문 오류 0 — 2026-09-18 17:44:10
- npm run build — 종료 코드 0 — WEB_ASSETS_OK — 2026-09-18 17:44:36
- node scripts/verify-v3-json-migration.mjs --input "C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\backups\json\shiftmgmt-backup-20260917-194251.json" --expected-sha EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9 --expected-tables 40 --expected-rows 3599 — 종료 코드 0 — 40표/3598행(target), preview/실복원 설정 경고 각각 정확히 1건, 39표 canonical hash 100%, SQLite 무결성 ok, 임시 DB 정상 정리 — 2026-09-18 17:44:57
- npx vitest run src/main/services/sqlite-storage-service.test.ts src/main/services/database-migration-service.test.ts --maxWorkers=1 --minWorkers=1 — 종료 코드 0 — 2 passed (21 tests) — 2026-09-18 17:46:27
- npm run typecheck — 종료 코드 0 — server/browser type error 0 — 2026-09-18 17:46:46
- npm run lint — 종료 코드 0 — 0 errors, 7 warnings (기존 경고 유지) — 2026-09-18 17:47:23
- npm run smoke — 종료 코드 0 — 서비스 72개 정상 로드 — 2026-09-18 17:47:47
- npm run validate:map — 종료 코드 0 — 경로 72개 모두 존재 — 2026-09-18 17:48:07
- npm run release:check (commit 2b040dd clean) — 종료 코드 0 — RELEASE_CHECK_OK 판 0.1.0 준비 완료 전건 통과 — 2026-09-18 17:52:33
음성 테스트:
- N1~N3: N1(인자 3598: RC 1, 총 행수 불일치, 누수 0) PASS / N2(설정 1행 제거: RC 1, 설정 행수 불일치, 누수 0) PASS / N3(설정 표 제거: RC 1, preview 설정 경고 0건 불일치, 누수 0) PASS — 기존 결과 유지
- N5: RC 1, 주 오류("app_setting_entries 행 수 불일치") 포함 확인, 정리 오류("[정리 실패] ... INJECTED_RM_FAILURE") 포함 확인, 성공 문구 미출력 확인 PASS
- N6: RC 1, 정리 오류("[정리 실패] ... INJECTED_RM_FAILURE") 포함 확인, 성공 문구 미출력 확인 PASS
범위/정리:
- diff 1파일(scripts/verify-v3-json-migration.mjs), package/lockfile/운영 JSON 원본 SHA 불변, 감사 사본 및 주입으로 생성된 임시 폴더 최종 잔존 수 0개 PASS
UI 증거: 해당 없음 — CLI 검증기
diff 요약: +82 / −53 줄 (1개 파일 scripts/verify-v3-json-migration.mjs), 생성물 0, 의존성 0
전체 SHA-256:
- scripts/verify-v3-json-migration.mjs 6F74B1AA3DF51FE665FE26E592F74F249A2D6AA618CD6E334E1B2C038981C6F0
- package.json 9634739541A3574766F9FFE7245B683ED964EBA59C4CE57C3E1B5D335CDD211C
- package-lock.json 17F34827DBE508F9CCF88E16F3A4DB5964FA5CA393A5DF654E39D30C2DEBAECD
- 운영 JSON EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9
최종 상태: 2b040dd1c59c5f7cbf520dcbe56786bbaa60057d / git status --short 빈 출력
미해결/가정: 없음
```
