# HANDOFF — Phase 2-2 운영 JSON 검증기 실패 경로 보정

- Task: 실제 운영 JSON 검증기의 임시 폴더 정리와 설정 경고 검증을 계약대로 보정
- Action: CORRECT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: 2026-09-18 16:53 KST
- 회신: 필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `6ba9d70f5f4f54a1384a608221e4219c99fd5a0f`
- Expected initial status: clean

---

# 회신 요청

**누가**: Gemini  
**어디에**: 이 파일 맨 아래 `## 회신`  
**언제**: 착수 게이트 누락/충돌이면 수정 없이 즉시 `BLOCKED`; 그 외 보정·검증·커밋 후 회신  
**회신이 없으면**: Sol의 재검증과 Phase 2-2 최종 종결이 중단됨

---

## 1. 목표

`scripts/verify-v3-json-migration.mjs`가 임시 DB를 만든 뒤 어떤 검증 실패가 발생해도 자신이 만든 임시 폴더를 반드시 정리하고 RC 1로 끝나며, 정상 운영 JSON에서는 `app_setting_entries`의 현행 경로 유지 경고가 preview와 실복원 각각 정확히 1개인지 실제로 검증하게 한다.

## 2. 비목표

- 이미 통과한 40표·3컬럼 스키마, 백필, JSON 복원 순서, 서비스 코드와 두 테스트 파일을 다시 설계하지 않는다.
- `app_setting_entries`의 현재 환경 경로 유지 정책을 바꾸지 않는다.
- 운영 JSON이나 운영 SQLite를 수정·교체하지 않는다.
- 새 의존성, package script, API, DB 스키마, 문서 지도 항목을 추가하지 않는다.
- `TODO.md`의 현재 조기 종결 표시는 이 구현자가 고치지 않는다. Sol이 보정 회신을 검증한 뒤 정리한다.

## 3. 현재 상태와 독립 재현 근거

### 3.1 수신 원본과 기존 기록

- Gemini 구현 회신 원본은 이미 다음 경로에 바이트 동일하게 보존돼 있다.
  - `C:\Projects\Active\교대근무관리 시스템\Log\20260918_142747_Phase2-2-Gemini-구현회신_수신원본.md`
  - SHA-256 `BD7632D401A5E99B371B1693130A817603F6F6F705FB21033050EBCC20E0AA12`
  - 31,003 B
- 현재까지의 긍정 증거:
  - V4 `main`, HEAD `6ba9d70f5f4f54a1384a608221e4219c99fd5a0f`, 작업 트리 clean.
  - baseline `e88cb92f4d711f6142e6efafea88938bc6a5a1a3` 이후 정확히 1 commit, 허용된 6파일만 +893/−2.
  - 관련 시험 재실행: RC 0, 2파일 21/21 PASS.
  - 정상 운영 JSON 검증기 재실행: RC 0, 40표·3,599행, target 3,598행, 39표 canonical hash 100%, SQLite 무결성 ok.
  - `npm run release:check` 재실행: RC 0, `RELEASE_CHECK_OK`.
- `Log/20260918_150000_Phase2-2-Sol-종결기록.md`의 과거 ACCEPTED 판정은 아래 새 재현 증거 때문에 최종 종결 근거로 사용할 수 없다. `Log/`는 append-only이므로 수정하지 않는다.

### 3.2 보호 기준

| 경로 | SHA-256 | 크기 |
|---|---|---:|
| `scripts/verify-v3-json-migration.mjs` | `01C2123F840455F39288DFFF5EC84276DE8176D145C9FD692C81354CACEE52EE` | 12,632 B |
| `package.json` | `9634739541A3574766F9FFE7245B683ED964EBA59C4CE57C3E1B5D335CDD211C` | 1,503 B |
| `package-lock.json` | `17F34827DBE508F9CCF88E16F3A4DB5964FA5CA393A5DF654E39D30C2DEBAECD` | 144,696 B |
| 운영 JSON | `EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9` | 3,217,906 B |

### 3.3 안정 결함 ID

#### P22-D1 — 임시 DB 생성 뒤 실패하면 정리 `finally`를 건너뜀

- 위치: `scripts/verify-v3-json-migration.mjs:117-329`.
- 원인:
  - 임시 폴더 생성은 `:108`.
  - 그 뒤 검증 실패 분기 다수가 `process.exit(1)`을 직접 호출한다(`:150-299`).
  - Node의 `process.exit()`는 `:319-329`의 `finally`를 실행하지 않고 프로세스를 즉시 끝낼 수 있다.
  - 정리 실패도 `:326-328`에서 빈 `catch {}`로 숨긴다.
  - `:314`는 실제 삭제보다 먼저 “정상 정리 완료”를 출력한다.
- Sol 재현:
  - 운영 JSON의 격리 사본에서 `app_setting_entries` 한 행만 제거해 17행·총 3,598행으로 만든 뒤, 그 사본의 실제 SHA/40표/3,598행을 인자로 전달했다.
  - 실제 결과: RC 1, `오류: app_setting_entries 행 수 불일치 (source: 17, target: 17)`.
  - 실행 전 `shiftmgmt-verify-v3-*` 0개 → 실행 후 새 폴더 1개 `shiftmgmt-verify-v3-dW9lkA`가 남았다.
  - Sol이 만든 격리 사본과 누수 폴더는 재현 직후 모두 삭제했고, 현재 해당 prefix 임시 폴더는 0개다.
- 원래 계약: 기존 패킷 R7·§9.4·N7은 검증기가 `finally`에서 자신이 만든 고유 임시 폴더만 정리하도록 요구했다.

#### P22-D2 — 설정 경고 1개를 검사하지 않고 성공 문구만 출력

- 위치: `scripts/verify-v3-json-migration.mjs:137-190,245-250,301-315`.
- 원인:
  - 현재 코드는 네 표·세 컬럼 이름이 들어간 경고만 0건인지 필터링한다.
  - `app_setting_entries`는 source 18행/target 17행만 확인한다.
  - preview와 실복원의 `warningMessages`에 정확한 경로 유지 경고가 각각 1개인지 확인하지 않는다.
  - 그럼에도 `:309`는 `정책 경고 1건`을 하드코딩해 출력한다.
- 검사해야 할 정확한 문구:
  - `백업 JSON의 경로 설정은 무시하고 현재 환경 경로를 유지했습니다.`
- 원래 계약: 기존 패킷 §9.4는 실제 운영 JSON 검증기가 이 정책 경고 1개를 스스로 assert하도록 요구했다.

## 4. 수정 경계

### 4.1 수정 허용 파일 — 닫힌 목록

| 경로 | 결함 ID | 허용 변경 | 허용하지 않는 변경 |
|---|---|---|---|
| `scripts/verify-v3-json-migration.mjs` | P22-D1, P22-D2 | 검증 실패 전달, 자원 정리, 설정 경고 단언, 성공 출력 시점 보정 | 복원 서비스 동작·기대 데이터 수치·canonical 비교·입력 JSON 변경 |

이 파일 외 제품 파일은 수정하거나 생성하지 않는다. 새 테스트 파일, 새 helper, package script가 필요해 보이면 구현하지 말고 `BLOCKED`로 질문한다.

### 4.2 읽기 전용/금지 경로

- `C:\Projects\Active\ShiftMgmt_V3.4\**` — 읽기 전용.
- `C:\Users\pangyo\orca\workspaces\ShiftMgmt_V3.4\tropicbird\**` — 읽기 전용.
- 운영 JSON 원본 — 읽기 전용, 전후 SHA 동일 필수.
- 운영 SQLite 및 `%APPDATA%\shiftmgmt-v3-4\**`의 JSON 원본 외 모든 파일 — 접근/변경 금지.
- V4의 `src/**`, 기존 test 파일, `docs/**`, `package.json`, `package-lock.json`, `vendor/**`, tracked `dist/**`.
- 오케스트레이션 저장소의 `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, `Log/**`.

### 4.3 허용된 제어 파일 변경

- 이 `HANDOFF.md`의 보이는 `## 회신` 칸만 채운다. 본문은 수정하지 않는다.

## 5. 요구사항

| ID | 입력/행동 | 기대 결과 | 오류/경계 동작 | 구현 위치 |
|---|---|---|---|---|
| C1 | 임시 폴더 생성 뒤 검증 조건 불일치 | 검증 실패 메시지와 RC 1 | DB·storage를 닫고 자신이 만든 임시 폴더 삭제; `finally` 우회 금지 | verifier main/cleanup |
| C2 | 임시 폴더 삭제 또는 자원 정리가 실패 | 성공으로 보고하지 않음 | 정리 실패를 보이는 오류로 출력하고 RC 1; 빈 `catch {}` 금지 | verifier cleanup |
| C3 | 정상 운영 JSON preview와 실복원 | 각각 설정 경고가 정확히 1개이고 문구도 정확히 일치 | 0개·2개 이상·다른/추가 경고면 RC 1 | warning assertion helper |
| C4 | 정상 운영 JSON 검증 | 기존 §9.4 수치 전부 동일, RC 0 | 성공 요약은 실제 임시 폴더 삭제 확인 뒤 출력 | verifier summary |
| C5 | 잘못된 기대 행 수처럼 임시 폴더 생성 전 실패 | 기존처럼 RC 1 | 생성한 임시 폴더가 없으므로 누수 0 | preflight validation |
| C6 | 전체 회귀 게이트 | 관련 시험·typecheck·lint·build·test·smoke·map·release 통과 | 시험 약화·기대 수치 완화·fallback 금지 | 전체 변경 집합 |

## 6. Sol의 코드 전략 — 이 순서대로 구현

### 6.1 실패 전달을 정상적인 예외 흐름으로 통일

1. 검증 실패 전용 오류 타입 또는 동등한 한 가지 helper를 이 스크립트 안에 둔다.
2. `main()` 안의 `console.error(...); process.exit(1)` 분기를 모두 이 실패 흐름으로 바꾼다.
3. `main()` 내부, 특히 임시 폴더 생성 뒤에는 `process.exit()`을 호출하지 않는다.
4. 최하단 catch는 오류를 한 번만 보이게 출력하고 `process.exitCode = 1`을 설정한다. `process.exit(1)`로 `finally`를 우회하지 않는다.

### 6.2 설정 경고를 실제 단언

1. 정확한 기대 문구를 상수로 둔다.
2. preview의 `warningMessages`와 실복원의 `warningMessages`를 각각 검사한다.
3. 각 배열은 정확히 한 항목이며 그 항목이 기대 문구와 완전히 같아야 한다. 예상 밖 추가 경고도 실패다.
4. 기존 네 표·세 컬럼 exclusion warning 0건 검사와 console warning 수집은 유지한다.

### 6.3 정리를 검증 결과의 일부로 처리

1. `db.close()`, `closeSqliteStorage()`, `rmSync(tempDir, { recursive: true, force: true })`를 임시 작업의 종료 경로에서 실행한다.
2. 한 정리 단계가 실패해도 뒤의 정리 단계는 시도하고, 최종적으로 원래 검증 실패와 정리 실패를 숨기지 않는다.
3. 임시 폴더가 실제로 없어졌는지 확인한다. 남아 있으면 RC 1이다.
4. `격리 임시 DB ... 정상 정리 완료`는 삭제 성공이 확인된 뒤에만 출력한다. 실패 중에는 출력하지 않는다.
5. 입력 파일 SHA 전후 동일 검사는 그대로 유지한다.

### 6.4 최소 변경

- 기대값 40/3,599/3,598/32/87/84와 39표 canonical 비교를 완화하거나 제거하지 않는다.
- 검증 실패를 경고로 낮추지 않는다.
- 복원 서비스나 테스트를 바꾸지 않는다.
- 스크립트 한 파일의 필요한 hunk만 수정한다.

## 7. 적용할 불변조건과 과거 함정

- 운영 데이터는 원본을 쓰지 않고 격리 사본·고유 임시 DB에서만 검증한다.
- `app_setting_entries`만 현재 환경 경로 유지 정책 예외다. 이 정책 자체는 이번에 바꾸지 않는다.
- 데이터 무손실은 표/행 수뿐 아니라 39표 canonical content와 SQLite 무결성으로 계속 확인한다.
- 빈 `catch {}`와 성공 문구 하드코딩으로 정리 실패나 미검증 경고를 숨기지 않는다.
- `process.exit()`은 비동기/정리 흐름을 건너뛸 수 있으므로 `main()`의 정리 범위 안에서 사용하지 않는다.
- 검증용 사본을 만들 때 운영 JSON을 직접 수정하지 않는다.

## 8. 착수 전 확인

아래가 하나라도 다르면 제품 파일을 수정하지 않고 `BLOCKED`로 회신한다.

1. 저장소·브랜치·baseline commit이 머리말과 일치한다.
2. 초기 `git status --short`가 빈 출력이다.
3. verifier SHA와 package/lockfile SHA가 §3.2와 일치한다.
4. 운영 JSON SHA가 §3.2와 같고 읽기 가능하다.
5. 수정 파일을 한 파일로 제한해 C1~C6을 만족할 수 있다.
6. 요구사항·코드 전략·검증 기준 사이 모순이 없다.

## 9. 검증 계획

### 9.1 정적·정상 경로

| 순서 | 정확한 명령 | 기대 종료 코드 | 기대 핵심 값 |
|---|---|---:|---|
| 1 | `node --check scripts/verify-v3-json-migration.mjs` | 0 | 구문 오류 0 |
| 2 | `npm run build` | 0 | server/browser/assets build PASS |
| 3 | `node scripts/verify-v3-json-migration.mjs --input "C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\backups\json\shiftmgmt-backup-20260917-194251.json" --expected-sha EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9 --expected-tables 40 --expected-rows 3599` | 0 | 기존 §9.4 전 수치 + preview/restore 설정 경고 각각 1개 + 실제 정리 완료 |
| 4 | `npx vitest run src/main/services/sqlite-storage-service.test.ts src/main/services/database-migration-service.test.ts --maxWorkers=1 --minWorkers=1` | 0 | 2파일 21/21 PASS |
| 5 | `npm run typecheck` | 0 | 오류 0 |
| 6 | `npm run lint` | 0 | 오류 0, 기존 경고 증가 없음 |
| 7 | `npm test` | 0 | 123파일 728개 이상 전건 PASS |
| 8 | `npm run smoke` | 0 | 서비스 72개 로드 PASS |
| 9 | `npm run validate:map` | 0 | 경로 누락 0 |
| 10 | 한 개 보정 commit 뒤 `npm run release:check` | 0 | clean, `RELEASE_CHECK_OK` |

### 9.2 필수 음성 시험

#### N1 — 임시 폴더 생성 전 실패

- 정상 운영 JSON에 `--expected-rows 3598`을 전달한다.
- 기대: RC 1, 총 행 수 불일치 메시지, 새 `shiftmgmt-verify-v3-*` 폴더 0개.

#### N2 — 임시 폴더 생성 뒤 실패와 정리

1. `%TEMP%` 아래 고유 감사 폴더를 만든다.
2. 운영 JSON을 그 폴더에 복사하고 **사본에서만** `app_setting_entries` 첫 행 1개를 제거한다.
3. 사본의 실제 SHA를 계산하고 `--expected-tables 40 --expected-rows 3598`로 실행한다.
4. 실행 전후 `%TEMP%\shiftmgmt-verify-v3-*` 폴더 집합을 비교한다.
- 기대: RC 1, 설정 행 수 불일치 메시지, 새 verifier 임시 폴더 0개.
- 실패: RC 0, 누수 1개 이상, “정상 정리 완료” 성공 문구 출력.

#### N3 — 설정 경고 누락을 실제 차단

1. 별도 격리 사본에서 `app_setting_entries` 표 속성 전체를 제거한다.
2. 사본의 실제 SHA·표 39·행 3,581을 인자로 전달한다.
- 기대: preview 설정 경고 0개 불일치로 RC 1, 새 verifier 임시 폴더 0개.
- 실패: 설정 경고를 검사하지 않고 뒤 단계로 진행하거나 RC 0.

#### N4 — 범위·원본 불변

- `git diff --name-only 6ba9d70f5f4f54a1384a608221e4219c99fd5a0f..HEAD`는 verifier 한 파일만 출력한다.
- 운영 JSON SHA before/after 동일.
- `package.json`, `package-lock.json` SHA 동일.
- 모든 감사 사본은 자신이 만든 고유 `%TEMP%` 폴더에서만 만들고 시험 뒤 제거한다.

### 9.3 UI/런타임

- 해당 없음 — CLI 검증기 보정이다.

## 10. 성공 조건

- [ ] P22-D1과 P22-D2의 원인·수정 위치·재현 명령·결과가 모두 회신에 있다.
- [ ] 임시 폴더 생성 뒤 실패 N2에서 RC 1이고 누수 0이다.
- [ ] 설정 경고 누락 N3을 정확히 RC 1로 차단한다.
- [ ] 정상 운영 JSON에서 preview/restore 설정 경고를 각각 정확히 1개로 검증하고 RC 0이다.
- [ ] 성공 문구는 실제 정리 확인 뒤에만 출력된다.
- [ ] 기존 40표·3컬럼·39표 canonical·무결성 수치가 변하지 않는다.
- [ ] 변경 파일은 verifier 1개뿐이고 의존성·원본·보호 파일 변화가 없다.
- [ ] 전체 게이트와 release check가 통과하고 한 개 보정 commit 뒤 clean이다.

## 11. 즉시 중단 조건

- 한 파일 밖의 제품 변경이나 새 의존성이 필요하다.
- 운영 JSON 또는 운영 SQLite를 수정해야 한다.
- 기존 데이터 기대값이나 시험을 완화해야만 통과한다.
- 정리 실패를 숨기지 않고 표현할 방법에 새 제품/아키텍처 결정이 필요하다.
- baseline, 초기 status, 보호 SHA가 다르다.
- 필수 검증 환경이나 도구가 없어 N1~N4를 재현할 수 없다.

---

## 회신

> Gemini가 아래 양식을 실제 값으로 채운다. HANDOFF 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: C:\Projects\Active\ShiftMgmt_V4 / main / 6ba9d70f5f4f54a1384a608221e4219c99fd5a0f / <최종 commit>
초기 상태: <branch/HEAD/status/보호 SHA/운영 JSON SHA>
변경 파일:
- scripts/verify-v3-json-migration.mjs: P22-D1, P22-D2 — <실제 변경 요약>
범위 밖 변경: 0개 | <정확한 경로>
결함 대조:
- P22-D1: <원인> -> <변경 위치> -> <재현 명령> -> <RC/누수 수>
- P22-D2: <원인> -> <변경 위치> -> <재현 명령> -> <경고 개수/RC>
요구사항 대조:
- C1~C6: <구현 위치와 PASS/FAIL>
검증 증거:
- <정확한 명령> — 종료 코드 <n> — <핵심 개수/결과> — <실행 시각>
음성 테스트:
- N1: <입력/기대/실제 RC와 누수 수>
- N2: <입력/기대/실제 RC와 누수 수>
- N3: <입력/기대/실제 경고 불일치와 RC>
- N4: <diff/원본 SHA/감사 사본 정리>
UI 증거: 해당 없음 — CLI 검증기 보정
diff 요약: <추가/삭제 줄, 생성물, 의존성 변화>
전체 SHA-256:
- scripts/verify-v3-json-migration.mjs <64자>
- package.json 9634739541A3574766F9FFE7245B683ED964EBA59C4CE57C3E1B5D335CDD211C
- package-lock.json 17F34827DBE508F9CCF88E16F3A4DB5964FA5CA393A5DF654E39D30C2DEBAECD
- 운영 JSON EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9
최종 상태: <전체 commit> / git status --short 빈 출력
미해결/가정: 없음 | <목록>
```
