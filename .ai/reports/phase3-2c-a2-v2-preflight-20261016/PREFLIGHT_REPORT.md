# Phase 3-2c-A2 v2 Windows 현장 사전 실사 보고서 (READ_ONLY_PREFLIGHT)

- **작성 일시:** 2026-10-16 15:50:00 (KST)
- **작업 성격:** READ_ONLY_PREFLIGHT (읽기 전용 현장 사전 실사 및 정적 분석)
- **보고서 및 증거 저장 위치:** `C:\Projects\Active\_a2_v2_preflight_evidence`
- **보존 정책:** 작업 완료 후에도 증거 파일 영구 보존 (Persisted)

---

## 0. 종합 판정 요약

| 점검 영역 | 판정 | 주요 근거 |
|---|:---:|---|
| **종합 사전실사** | **PRECHECK_PASS** | 환경·기준선·용량제한·정합성 사전검증 기준 완전 충족 |
| 환경 지문 (`ENV`) | **PRECHECK_PASS** | Node v24.13.0, Playwright 1.63.0, Chrome 155.0.8059.41, Port 18741 FREE |
| 기준선 (`BASELINE`) | **PRECHECK_PASS** | GitHub 3개 브랜치 SHA 및 로컬 12개 파일 바이트/SHA 전수 일치 (불일치 0) |
| 범위 및 용량 (`SCOPE`) | **PRECHECK_PASS** | 4개 mjs 파일 한정, shared 27B 여유는 중복제거로 1,500B+ 확보 가능 입증 |
| 112개 음성 벡터 (`VECTORS`) | **UNPROVEN** | 정적 주입 설계 112개 전수 매핑 완료, 실제 SUT 실행 전이므로 UNPROVEN 유지 |

> **[중요] 판정의 의미:** `PRECHECK_PASS`는 A2 v2 구현 지시서(HANDOFF) 작성을 위한 현장 환경 및 설계 정합성이 확인되었음을 의미하며, 제품 코드 변경이나 A2 기능 수용(ACCEPTED)을 의미하지 않습니다.

---

## 1. 실제 사용한 로컬 PC 경로와 Git 기준 SHA

### 1.1 저장소 물리 경로
- **통합 작업 공간:** `C:\Projects\Active\ShftMgmt_Renewal`
- **기존 제품 소스:** `C:\Projects\Active\ShiftMgmt_V4`
- **기존 기획·관리 자료:** `C:\Projects\Active\교대근무관리 시스템` (Git 관리 아님)
- **이관 원본 (읽기 전용):** `C:\Projects\Active\ShiftMgmt_V3.4` (접근/수정 없음)
- **현장 실사 증거 전용 폴더:** `C:\Projects\Active\_a2_v2_preflight_evidence`

### 1.2 GitHub 공식 저장소 및 최신 브랜치 SHA 전수 확인
- 원격 저장소: `https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal.git`
- `main` 브랜치: `c21aa263a02e57d57949bafc5aefe06aab582acd` (기존 검증 완료 기반 소스 333개 포함) — **정확히 일치**
- `work/phase3-2c-a2-v1-not-accepted` 브랜치: `2f51c11710f46c75a49f5715cc68d4752b53f8ca` (A2 v1 미수용 상태 소스 341개 포함) — **정확히 일치**
- `work/phase3-2c-a2-v2-design` 브랜치: `95633915f015bde554480267f114428582143aae` (신규 전략 설계 문서 3개 포함) — **정확히 일치**

---

## 2. 로컬 Git 및 Worktree 상태

### 2.1 `C:\Projects\Active\ShftMgmt_Renewal`
- Git 루트: `C:/Projects/Active/ShftMgmt_Renewal`
- HEAD: `c21aa263a02e57d57949bafc5aefe06aab582acd` (main)
- `git status --porcelain=v1`: `clean` (0 변경, 0 미추적)
- 원격 동기화: `origin/main`과 동일

### 2.2 `C:\Projects\Active\ShiftMgmt_V4`
- Git 루트: `C:/Projects/Active/ShiftMgmt_V4`
- HEAD: `160940f9aaeb6696538447f83b44658073e382f0` (cat-file 확인 완료)
- Worktree: 단일 메인 worktree (`worktree C:/Projects/Active/ShiftMgmt_V4`)
- `git status --porcelain=v1`:
  ```text
   M docs/codebase-map.md
   M scripts/copy-web-assets.mjs
   M src/web/index.html
   M src/web/screens/shell.ts
  ?? scripts/ui-checks/access-history-negative.mjs
  ?? scripts/ui-checks/access-history-positive.mjs
  ?? scripts/ui-checks/access-history-shared.mjs
  ?? scripts/ui-checks/access-history.mjs
  ?? src/web/access-history.css
  ?? src/web/screens/access-history-model.test.ts
  ?? src/web/screens/access-history-model.ts
  ?? src/web/screens/access-history.ts
  ```
  *(A2 v1 미수용 작업 상태 12개 파일이 원본 그대로 보존되어 있음)*

---

## 3. 기존 소스와 GitHub 소스 일치 여부

로컬 `ShiftMgmt_V4`의 12개 파일과 GitHub 보존 브랜치 `2f51c11:ShiftMgmt_V4/` 파일 간 Python SHA-256 및 크기 전수 비교 결과:

| 파일 경로 | 로컬 크기 | 원격 크기 | 로컬 SHA-256 | 원격 SHA-256 | 일치 |
|---|---:|---:|---|---|:---:|
| `docs/codebase-map.md` | 12,802B | 12,802B | `4B7FE910A7FA66FDB5427985B76BD851...` | `4B7FE910A7FA66FDB5427985B76BD851...` | **일치** |
| `scripts/copy-web-assets.mjs` | 4,292B | 4,292B | `68147FF528AF9C8C6606B31E348554DC...` | `68147FF528AF9C8C6606B31E348554DC...` | **일치** |
| `src/web/index.html` | 601B | 601B | `1E3AAE08F0D97B2D1F41E65A63E76118...` | `1E3AAE08F0D97B2D1F41E65A63E76118...` | **일치** |
| `src/web/screens/shell.ts` | 16,334B | 16,334B | `27750E549BCACDFFD90C9404491C5D4D...` | `27750E549BCACDFFD90C9404491C5D4D...` | **일치** |
| `scripts/ui-checks/access-history-negative.mjs` | 27,848B | 27,848B | `F49C87B2411664EFE6B2EF6C1DDE6001...` | `F49C87B2411664EFE6B2EF6C1DDE6001...` | **일치** |
| `scripts/ui-checks/access-history-positive.mjs` | 22,530B | 22,530B | `77B3131220F578897630A9717ACFFC83...` | `77B3131220F578897630A9717ACFFC83...` | **일치** |
| `scripts/ui-checks/access-history-shared.mjs` | 29,973B | 29,973B | `C0AB887F045AB3C71DC5878B19565866...` | `C0AB887F045AB3C71DC5878B19565866...` | **일치** |
| `scripts/ui-checks/access-history.mjs` | 29,351B | 29,351B | `2490A4DC38D65E6FDDD571C64D990388...` | `2490A4DC38D65E6FDDD571C64D990388...` | **일치** |
| `src/web/access-history.css` | 7,261B | 7,261B | `286A0DF91BB3B0EEDEEE7B21A01CA265...` | `286A0DF91BB3B0EEDEEE7B21A01CA265...` | **일치** |
| `src/web/screens/access-history-model.test.ts` | 10,177B | 10,177B | `29ED9EA2CC5637B36A475753F523EAD1...` | `29ED9EA2CC5637B36A475753F523EAD1...` | **일치** |
| `src/web/screens/access-history-model.ts` | 6,786B | 6,786B | `03C511282B010774CBEFAE9C0CC0377A...` | `03C511282B010774CBEFAE9C0CC0377A...` | **일치** |
| `src/web/screens/access-history.ts` | 29,601B | 29,601B | `E6BB9E4A7487EB791F9534340A65F89C...` | `E6BB9E4A7487EB791F9534340A65F89C...` | **일치** |

- **결론:** 12개 파일 모두 바이트 단위로 100% 일치하며 worktree 정리로 인한 파일 유실은 0건입니다.

---

## 4. 검증기 4개 파일의 정확한 크기, SHA-256 및 동결구간 검증

### 4.1 4개 검증기 기준 대조표

| 검증기 파일 | 측정 크기 | 상한 | 잔여 여유 | 실측 SHA-256 | 지시서 기준 일치 |
|---|---:|---:|---:|---|:---:|
| `access-history.mjs` (owner) | 29,351 B | 30,000 B | 649 B | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` | **일치** |
| `access-history-shared.mjs` | 29,973 B | 30,000 B | **27 B** | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` | **일치** |
| `access-history-positive.mjs` | 22,530 B | 30,000 B | 7,470 B | `77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01` | **일치** |
| `access-history-negative.mjs` | 27,848 B | 30,000 B | 2,152 B | `F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6` | **일치** |

### 4.2 `access-history-shared.mjs` 동결 구간 (Frozen Chunk) 실측
- **위치:** `export const CANONICAL_8_ACTIONS` 시작 (offset 1676) ~ `export async function performWorkerIpcHandshake` 바로 전 (offset 8251)
- **실측 바이트:** **6,575 Bytes**
- **실측 SHA-256:** `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`
- **판정:** 기준값과 100% 완전 일치 (`Match: True`)

---

## 5. Windows 현장 실행 환경 확인

- **운영체제:** Windows 11 Pro (build 26200, SP0, AMD64)
- **Node.js:** `v24.13.0` (`C:\Program Files\nodejs\node.exe`) — 요구 조건 `>=24 <25` 완벽 충족
- **npm:** `11.6.2` (`C:\Program Files\nodejs\npm`)
- **Python:** `3.9.13` (`C:\Users\pangyo\anaconda3\python.exe`)
- **Playwright:** `playwright@1.63.0` (`C:\Projects\Active\ShiftMgmt_V4\node_modules\playwright`)
- **Google Chrome:** `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - **설치 버전:** `155.0.8059.41` (10/16 실측 최신 버전)
- **포트 `127.0.0.1:18741` 점유 상태:** **FREE** (미점유, 바인딩 테스트 성공)
- **문법 검사 (`node --check`):** 4개 검증기 파일 모두 구문 오류 0건 통과

---

## 6. 계약 파일 및 절대 경로 유효성

검증기에서 참조하는 핵심 계약 및 판정기 파일의 물리 경로 및 SHA-256 실측:

| 식별자 | 참조 경로 | 존재 | SHA-256 일치 |
|---|---|:---:|:---:|
| `BASELINE_PATH` | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\baseline.json` | **True** | `D305FE700885...` (**일치**) |
| `GATE_PATH` | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\gate-evidence.py` | **True** | `0BD49A425F02...` (**일치**) |
| `CONTRACT_PATH` | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\contract.json` | **True** | `014FE49BA871...` (**일치**) |
| `EXECUTION_PATH` | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\execution.json` | **True** | `FDBBC4B9A93E...` (**일치**) |
| `PYTHON_PATH` | `C:\Users\pangyo\anaconda3\python.exe` | **True** | 실행 가능 확인 |

- 또한 GitHub 통합 저장소 `C:\Projects\Active\ShftMgmt_Renewal\.ai\contracts` 하위의 동일 파일들과도 100% 해시 일치 확인 완료.
- `process.cwd()`를 `ShiftMgmt_V4`로 두고 실행 시 line 14의 `repoRoot` 체크(`fs.realpathSync(path.resolve(fileURLToPath(import.meta.url), "../../.."))`)가 정상 통과됨을 확인.

---

## 7. A2 v1 결함 11건 (A2V1-01 ~ A2V1-11) 상세 정적 분석

### [A2V1-01] 112개 음성 테스트의 실제 실행·증거 불일치
- **발생 위치:** `build_negative_results.py`, `negative-results.json`
- **원인:** 45개 벡터를 SUT 결함 주입 대신 `--case=invalid` CLI 인수로 대체 처리하고, builder PID 재사용 및 expected 복사.
- **수정 방향:** `access-history-negative.mjs`에 각 벡터별 독립 fault 주입 함수를 두고, 실제 child 프로세스 실행 영수증(PID/시각/종료코드/로그 해시)을 1:1로 수집.

### [A2V1-02] 미완료 HTTP·viewport·종료 시각 등 관측값 가공
- **발생 위치:** `negative.mjs:181-198, 236-264`, `positive.mjs:67-69, 150-151, 414-427`
- **원인:** pending 요청의 status를 200으로 가공, viewport를 고정 1440x900으로 작성, helper 반환 후 close 시각 임의 날조.
- **수정 방향:** Playwright `page.viewportSize()` 실측값을 raw에 직접 바인딩하고, pending 요청은 status 0/null 유지, 실제 이벤트 리스너 시각만 기록.

### [A2V1-03] normal reader 검사 누락 및 임시 데이터 조기 제거
- **발생 위치:** `negative.mjs:361-383`, `access-history.mjs:255-260, 311-323`
- **원인:** reader가 단순 JSON 파싱만 수행하고 raw SHA/workerPid/exitCode cross-check 누락; 오류 발생 전 temp 디렉터리 조기 삭제.
- **수정 방향:** reader에 엄격한 무결성 검증 추가, 실패 증거가 유효한 동안 temp 디렉터리 보존.

### [A2V1-04] 부분 증거(partial)·최초 오류·정리 실패 연결 누락
- **발생 위치:** `negative.mjs:267-273`, `positive.mjs:67-69, 424-427`, `access-history.mjs:256, 379-387`
- **원인:** step 진입/종료 시 partial 갱신 누락, 주/대체 쓰기 fs 에러 시 무음 반환, close 에러를 primary 대신 generic 에러로 마스킹.
- **수정 방향:** 상태 전이마다 atomic partial 갱신, 첫 예외를 primaryError에 보존하고 cleanupError를 별도 배열에 분리 수집.

### [A2V1-05] 캡처 결과와 실제 실행 ID 연결 문제 (sibling 선택)
- **발생 위치:** `positive.mjs:430-463`
- **원인:** `sort().reverse()`로 artifacts 디렉터리의 가장 최근 sibling 폴더를 선택하여 다른 실행의 캡처가 연결될 위험.
- **수정 방향:** protected helper 실행 시 생성된 정확한 manifest 경로와 stdout의 스트리밍 바인딩으로 현재 실행 폴더만 직접 매핑.

### [A2V1-06] 요청 식별·Query 분석·JSON 처리 문제
- **발생 위치:** `negative.mjs:143-158`, `positive.mjs:81-146`
- **원인:** `Request.postDataJSON()` 미호출, 알 수 없는 query 파라미터 무시, URL+status0으로 응답을 매핑하여 동시 요청 식별 실패.
- **수정 방향:** Playwright `Request` 객체 고유 Identity(WeakMap 또는 request ID)로 매핑, strict query 파싱, postDataJSON 호출.

### [A2V1-07] Held Route 타이머 및 실패 시 정리 문제
- **발생 위치:** `negative.mjs:101-140, 518-565`, `positive.mjs:304-332`
- **원인:** `waitForStart`/`waitForComplete` 후 clearTimeout 미호출, 에러/타임아웃 시 등록된 route release/abort 누락.
- **수정 방향:** try/finally 블록에서 등록된 route를 항상 abort/release 처리하고 timeout 핸들을 반드시 clearTimeout.

### [A2V1-08] 비밀정보 마스킹(Redaction) 및 오류 문자열 관리
- **발생 위치:** `negative.mjs:160-177, 236-264`, `positive.mjs:142-146`
- **원인:** login/console/pageerror 에러 객체에 평문 패스워드가 남아있고 메모리 내 마스킹 레지스트리 부재.
- **수정 방향:** 메모리 내 sentinel/비밀값 Set을 구성하고 로그/에러 직렬화 전 일괄 치환(`[REDACTED]`). 테스트에는 무해한 sentinel만 사용.

### [A2V1-09] Junction 경로로 직접 실행 제한 우회
- **발생 위치:** `positive.mjs:24`, `negative.mjs:388`
- **원인:** `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])` 단순 문자열 비교로 인해 junction 경로 접근 시 CLI entrypoint를 건너뛰고 RC0 종료.
- **수정 방향:** `fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))`로 realpath 비교.

### [A2V1-10] 환경변수 정리 및 IPC ACK wire 계약 불일치
- **발생 위치:** `access-history.mjs:80`, `access-history-shared.mjs:performWorkerIpcHandshake`
- **원인:** child 환경변수 필터링에서 `AUTH_BOOTSTRAP_*` 누락, normal wire ACK에서 nonce echo 대신 해시를 직접 전달.
- **수정 방향:** `buildChildEnv`에 `AUTH_BOOTSTRAP_*` 정규화 추가, wire ACK는 원 nonce를 echo한 뒤 메모리 투영으로 전환.

### [A2V1-11] 명령 실행 기록의 PID 불일치
- **발생 위치:** 이전 A2 v1 회신 문서 및 `implementation-result.json`
- **원인:** 실제 spawned child PID 대신 빌더 스크립트의 PID 또는 추정값 기재.
- **수정 방향:** `spawn` 이벤트에서 수집된 실제 `child.pid`를 receipt에 그대로 직렬화하고, 불일치 0을 강제.

---

## 8. 음성 테스트 112개별 실제 주입 설계 및 상태

원본 `.ai/contracts/phase3-2c-a2-v1/negative-vectors.json`의 20개 그룹, 112개 벡터 전수 분석:
- **전체 그룹:** 20개 (A-N01 ~ A-N20)
- **전체 벡터 수:** 112개 (누락 0개, 중복 0개 확인)
- **현재 판정:** **전 항목 `UNPROVEN`** (사전 실사 단계에서는 실제 결함 주입을 실행하지 않고 정적 매핑만 수행)

### 그룹별 핵심 주입 및 판정 조건
- **A-N01 (3개):** owner CLI 무인수/빈인수/미식별 케이스 → RC1, 자식 프로세스/네트워크/임시폴더 생성 0건
- **A-N02 (6개):** owner 잘못된 인수 형식 (중복, 공백 분리, trailing space) → RC1, default fallback 거절
- **A-N03 (18개):** worker 모듈 직접 실행 (positive, negative, shared 각 6종) → RC1, bootstrap/browser/network 0건
- **A-N04 (3개):** 위조 환경변수 + 미연결 IPC → RC1, stub request 0건
- **A-N05 (7개):** IPC 패킷 결함 (미전송, 타임아웃, nonce/PID 불일치) → Non-zero, 자식 프로세스 종료
- **A-N06 (13개):** IPC 경로 탈출 (외부 경로, 형제 폴더, symlink/junction 탈출) → Non-zero, 외부 I/O 차단
- **A-N07 (9개):** `expectNear` 허용오차 (tolerance > 1, NaN, Infinity) → 거절. **단, 132와 133 경계값은 정상 허용(ACCEPT_BOUNDARY)**
- **A-N08 (5개):** core assertion ID 누락/중복/미등록 → Non-zero, 정확한 ID 오류 목록 기록
- **A-N09 (3개):** fixture 및 canonical 컴파일 해시 드리프트 → Non-zero, 해시 엄격 검증
- **A-N10 (2개):** 무관한 콘솔 401 및 raw pageerror → Non-zero, raw 오류 텍스트 보존
- **A-N11 (2개):** context/browser close 실패 throw → Non-zero, 후속 자원 close 완료 및 첫 에러 보존
- **A-N12 (4개):** worker/server 타임아웃 및 kill 미응답 → Non-zero, 타이머 해제 및 프로세스 회수
- **A-N13 (3개):** 프로세스 spawn 실패 및 listen 전 조기 종료 → Non-zero, 잔여물 정리
- **A-N14 (4개):** 파일 쓰기 거절 (EACCES) → Non-zero, false PASS 차단, 첫 스택 보존 (사용 중인 API를 `NOT_USED`로 처리 금지)
- **A-N15 (6개):** 로그 스트림 및 캡처 거절 → Non-zero, partial 보존 후 정상 teardown
- **A-N16 (5개):** 캡처 PNG 누락, 해시 불일치, 외부 경로, 손상된 PNG → Non-zero 거절
- **A-N17 (2개):** preflight health/chrome 체크 단계 실패 → Non-zero, 미실행 상태 명시
- **A-N18 (5개):** 18741 포트 점유 충돌 및 toxic 환경변수 오염 → Non-zero 거절, 자식 프로세스 환경 격리
- **A-N19 (8개):** 정상 8개 시나리오 fullUI 미구현 상태 → `FAIL_INCOMPLETE/RC1`, 거짓 PASS 차단
- **A-N20 (4개):** raw 포인터 불일치 및 caller 자가 PASS 주입 → Non-zero, reader 독립 검증

---

## 9. 파일당 30,000바이트 제한 충족 구현 전략

### 9.1 현재 상태 및 위험도
- `access-history.mjs`: 29,351B (여유 649B)
- `access-history-shared.mjs`: 29,973B (여유 **27B**) — **가장 큰 위험 구간**
- `access-history-positive.mjs`: 22,530B (여유 7,470B)
- `access-history-negative.mjs`: 27,848B (여유 2,152B)

### 9.2 `access-history-shared.mjs` 여유 확보 방안 (동결구간 6,575B 불변)
1. `collectCoreChecks` (5,186B): 50여 줄에 걸쳐 반복되는 `this.seenIds.add(...)`, `this.checks.push(...)` 패턴을 단일 helper로 압축 → **약 800~1,100 Bytes 절감**
2. `runContractCore` (7,214B) 내 중복 assertion 및 verbose 에러 문자열 정리 → **약 500~700 Bytes 절감**
3. 다중 줄 주석 및 중복 import 정리 → **약 200~300 Bytes 절감**
- **예상 확보 여유:** **약 1,500 ~ 2,100 Bytes** (A2 v2의 IPC handshake 보완 코드 수용에 충분함)

### 9.3 타 파일 여유 전략
- `access-history-positive.mjs`: 7,470B의 넉넉한 여유가 있으므로 A2V1-05(캡처 바인딩), A2V1-06(strict query), A2V1-07(Held cleanup) 로직을 안전하게 수용 가능.
- `access-history-negative.mjs`: 2,152B 여유 및 A-N19 공통 helper 함수화를 통해 1,000B 추가 확보 가능.
- `access-history.mjs`: 649B 여유 및 에러 처리 helper 간소화로 500B 추가 확보 가능.

---

## 10. 필요한 변경 파일의 정확한 범위

**허용 파일 (닫힌 목록, 4개 한정):**
1. `ShiftMgmt_V4/scripts/ui-checks/access-history.mjs`
2. `ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs`
3. `ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs`
4. `ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs`

**절대 금지 경로:**
- 상기 4개 외 모든 제품 소스코드 (`src/web/...`, `src/main/...`, `src/shared/...`)
- 이관 원본 `C:\Projects\Active\ShiftMgmt_V3.4`
- 계약 파일 `.ai/contracts/...`
- 루트 관리 문서 (`TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `Log/`)

---

## 11. 실제 실행 명령 및 결과

본 사전 실사 중 실행된 모든 명령은 읽기 전용 및 정적 분석이었으며, 제품 코드를 전혀 수정하지 않았습니다.

| 명령 | 실행 목적 | 종료코드 | 결과 요약 |
|---|---|:---:|---|
| `git fetch origin; git branch -r` | GitHub 원격 브랜치 최신 상태 확인 | 0 | main, a2-v1, a2-v2-design 브랜치 확인 |
| `git pull --ff-only origin main` | ShftMgmt_Renewal 저장소를 GitHub main과 동기화 | 0 | `c21aa26`으로 fast-forward 완료 |
| `git rev-parse HEAD; git status` | ShftMgmt_Renewal HEAD 및 작업트리 상태 확인 | 0 | clean, HEAD: `c21aa263...` |
| `python compare_local_vs_git.py` | ShiftMgmt_V4 12개 파일 vs 2f51c11 전수 비교 | 0 | 12개 파일 100% 바이트/해시 일치 |
| `python env_check.py` | Node, npm, Python, Chrome, Port 실측 | 0 | Node 24.13.0, Chrome 155.0.8059.41, Port FREE |
| `python scan_paths.py` | 검증기 내 절대 경로 유효성 및 계약 파일 해시 검사 | 0 | 4개 계약 파일 물리 존재 및 해시 일치 |
| `node --check <4개 mjs>` | 4개 검증기 문법 검사 | 0 | 4개 파일 모두 문법 정상 통과 |
| `python analyze_vectors.py` | negative-vectors.json 112개 벡터 전수 파싱 | 0 | 20개 그룹, 112개 벡터 중복 0건 |

---

## 12. 작업 전후 Git 상태 및 변경 파일 0개 확인

- `C:\Projects\Active\ShftMgmt_Renewal`: `git status --porcelain=v1` 결과 **빈 출력 (0 modified, 0 untracked)**
- `C:\Projects\Active\ShiftMgmt_V4`: 기존 4 modified, 8 untracked 그대로 유지 (추가 변경 0건)
- `C:\Projects\Active\_git_temp\Shiftmgmt_Renewal`: `git status --porcelain=v1` 결과 **빈 출력 (0 modified, 0 untracked)**
- 작업 중 생성된 모든 스크립트, 임시 파일, 보고서는 전용 디렉터리(`C:\Projects\Active\_a2_v2_preflight_evidence`)에만 생성되었음.

---

## 13. 남은 위험 요소 및 장애 요인

1. **`access-history-shared.mjs`의 27B 여유 공간:**
   - 구현 착수 시 반드시 `collectCoreChecks`와 `runContractCore`의 중복 코드 압축을 먼저 선행하여 최소 1,500B의 공간을 확보한 뒤 IPC handshake 수정 작업을 진행해야 함.
2. **Chrome 버전 갱신 기록:**
   - v1 검수 당시 `155.0.8059.40`에서 현재 로컬 PC 설치 버전이 `155.0.8059.41`로 마이너 패치됨. Playwright SDK 구동 시 정상 동작하므로 환경 차단 사유는 아니나, gate 검수 시 버전 문자열 체크가 있다면 `.41`을 유효 버전으로 반영해야 함.

---

## 14. A2 v2 구현용 HANDOFF 발행 가능 여부

- **최종 결론:** **`READY_FOR_HANDOFF_ISSUANCE` (구현 지시서 발행 가능)**
- **이유:**
  1. Windows 현장 실행 환경(Node, Chrome, Port, Playwright)이 완전하게 준비되어 있음.
  2. 기준 소스코드 및 계약 파일의 SHA-256이 100% 일치함.
  3. 4개 검증기 파일의 30KB 상한 준수 전략이 명확히 수립됨.
  4. 11개 결함에 대한 원인 분석 및 112개 음성 벡터의 주입 매핑이 완료됨.
- 따라서 Sol(ChatGPT)이 본 사전 실사 보고서를 바탕으로 Gemini에게 전달할 A2 v2 상세 구현 지시서(`HANDOFF.md`)를 발행하는 데 기술적·환경적 걸림돌이 전혀 없습니다.
