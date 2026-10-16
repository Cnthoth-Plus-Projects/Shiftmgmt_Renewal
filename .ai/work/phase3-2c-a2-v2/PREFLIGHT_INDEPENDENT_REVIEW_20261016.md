# A2 v2 Windows PRECHECK 독립 검토 — 보완 판정

- 검토일: 2026-10-16 (KST)
- 판정: **PRECHECK_PARTIAL / BLOCKED_DESIGN_EVIDENCE**, 제품 코드 수정 불가
- 검토 범위: GitHub branch `work/phase3-2c-a2-v2-design` @ `41923a615b3d6ae7a48ccd2778ecea3d303c326a`, 업로드된 `PREFLIGHT_REPORT.md` 및 evidence JSON, 제품 A2 v1 보존 브랜치의 `access-history-*.mjs`, 원 `negative-vectors.json`, 원 `findings.json`.
- 원본 제출 보고서·evidence 파일은 **수정하지 않음**. 본 검토는 별도 판정.
- 제약: 현재 루트 `HANDOFF.md` = CLOSED/FAILED_A2_NOT_ACCEPTED; 본 문서는 Action: IMPLEMENT가 아님. `main`, 제품4파일, 계약/로그 수정 없음.

## 1. 수용 가능한 부분

1. GitHub 설계 브랜치가 존재하며 `PREFLIGHT_REPORT.md`와 evidence 5개가 업로드된 것을 원격 readback으로 확인.
2. 보고서의 Windows Node v24.13.0 / npm 11.6.2 / Playwright 1.63.0 / Chrome 155.0.8059.41 / port FREE 환경 지문은 `evidence/env_report.json`과 서로 일치. 이는 현장 에이전트 실측 **기록**이며 이 원격 세션에서 같은 Windows 실측을 직접 재실행한 것은 아님.
3. 4개 검증기 크기/기록 SHA, shared frozen 6,575B/SHA, 보존된 미수용 변경 12개는 이전 GitHub/원 검수 기록과 일치. 제품 `main`과 A2 v1은 현재까지 별도 분기.
4. 기존 `negative-vectors.json`에서 20그룹, 정확히 112 ID 및 누락/중복0 확인. 계획 열거 성립, 실행 증거와 별개.
5. `findings.json`의 반려 사유는 A2V1-01~11 **11건**이다. A1 과거 수용, A2/전체A/B87 미수용 상태 불변.

## 2. 필수 보완 — IMPLEMENT HANDOFF 발행 차단

### R-01 [BLOCKING] 112개 실제 주입 설계가 작성되지 않음

`.ai/work/phase3-2c-a2-v2/evidence/vector_analysis_112.json`을 직접 읽음. `vectors.length=112`, 그러나 **112/112 모두 `callSite=""`, `injectionMethod=""`, `description=""`**. 각 record의 실질 내용은 원 negative-vectors 계약의 ID/expected/그룹 공통 requiredObservation 재표기뿐임.

`PREFLIGHT_REPORT.md` §8 또한 A-N01~20 그룹 요약만 기술하고 개별 112 ID의 주입 방법/호출점/고유 증거 바인딩을 제시하지 않음. 따라서 **'112개 벡터별 주입 매핑 완료' 주장은 미입증**.

**수정·제출 요구:** 원본 `negative-vectors.json`을 바꾸지 말고 새 증거 `VECTOR_INJECTION_DESIGN_112.json`과 해설 MD를 제출.
- 모든 기존 ID 112개 보존, 누락/중복0; 각 ID별 `callSite`(정확한 상대 path + symbol + 가능한 경우 위치), `injectionMethod`(실제 SUT/SDK/helper에 도달하고 fault가 발동하는 구체적 진입/계측 절차), `expectedSutOutcome`, `faultTriggeredProof`, `rawReceiptFields`, `sideEffectBounds`, `resourceTeardownProof`, `dependencyOrBlocker`가 **비어 있지 않음**.
- 호출점이 실제로 없으면 `BLOCKED_NO_CALLSITE` / 근거 및 필요한 설계 결정을 명기; 그룹 문구 자동 복사로 채우지 않음.
- 112 ID 전부 실행했다고 주장 금지. 실행 전 상태 `UNPROVEN` 유지.
- A-N03 'known'은 등록 private case **모두**, A-N04는 각각 valid private case + owned healthy stub, A-N07의 `ACCEPT_BOUNDARY` 132/133, A-N14 `NOT_USED`는 실제 사용 경로 AST 증명, A-N19 `FAIL_INCOMPLETE` vs `FAIL` 구분을 개별 적용.
- receipt는 SUT child pid/UTC/RC/전체 원 stdout·stderr SHA, fault 설치·발동 증거, own cleanup 및 run/manifest 바인딩을 요구. builder self-report는 독립 증거로 불인정.

### R-02 [BLOCKING] shared 30,000B 예산 절감 근거 오류

현 `access-history-shared.mjs`는 29,973B(여유 27B), 동결 구간 `export const CANONICAL_8_ACTIONS =`부터 `export async function performWorkerIpcHandshake` 직전까지 6,575B. 제출 보고서는 `collectCoreChecks` 내부의 `this.seenIds.add(...)` / `this.checks.push(...)` 중복 간소화로 800–1100B 절감을 주장한다.

그러나 GitHub 원본 코드 검색 결과:
- `this.seenIds.add(...)`, `this.checks.push(...)`는 **`AssertionCollector` (동결 구간 내부)** 위치.
- `collectCoreChecks(observations)`는 동결 **외부**의 다른 함수이며 해당 `this.*` 문장이 아예 없음.
- 따라서 **제안된 특정 압축 방식은 불변 구간을 손상하거나 실제 대상에 적용할 수 없는 것**으로, 예상 1500–2100B 절감량은 입증되지 않음.

**수정·제출 요구:** 동결 chunk byte/SHA를 절대 변경하지 않는 영역만 후보로 찾고 함수별 실제 위치, 절감 코드 초안/계측 **비제품 임시 복제본에서만**, before/after UTF-8 bytes, 예상 후속 추가 바이트, 최종 파일 크기 ≤30,000B를 수치로 제시. 코드 압축 시 A1 assertion 검문·실패 코드·원오류·타임아웃·로그 동작까지 동등성 증명이 가능해야 함. `collectCoreChecks` 자체가 실제로 어떤 중복을 포함하는지 원문을 근거로 다시 특정할 것. 계약 기준 완화/테스트 약화로 크기 제한 해결 금지.

### R-03 [IMPORTANT] 경로 분석 증거와 결론 불일치

`evidence/referenced_paths.json`은 절대 경로 `C:\\Projects\\Active\\교대근무관리` 를 **중간에서 자른 문자열**로 추출해 `exists_as_is:false`를 보고하고, `t:\\s*([^\\r\\n]+)/` 같은 코드 일부도 경로로 오인한다. 반면 본문 §6은 `baseline/contract/execution/gate`의 실제 파일 존재 및 SHA 일치를 주장한다.

**수정·제출 요구:** 정확한 원문 문자열 리터럴(전체 경로)과 결과, 대상별 전체 SHA-256 64자, 판정 스크립트 또는 raw 명령 receipt를 재제출. 경로 scanner 허위양성·경로 절단을 별도 구분. 현재 보고서 값이 실제 맞는지는 독립 검증 미완료로 표시.

### R-04 [IMPORTANT] 사전 실사 READ_ONLY 의미 위반

보고서 §11에 `git pull --ff-only origin main`을 수행했고, 사전실사 파일을 `work/phase3-2c-a2-v2-design`에 실제 commit/push하였다. 원 지시서에서 commit/push 및 로컬 Git 변경은 허용되지 않은 작업이었으므로 **'완전 읽기 전용' 진술은 부정확**. 다만 GitHub에서 관찰된 변경은 본 설계 브랜치의 문서/JSON 추가이고 `main` 또는 제품 코드 변형은 감지되지 않음.

**수정·제출 요구:** 수행한 Git write/fetch/pull/commit/push를 실제 UTC 시각, 대상 Git 저장소/브랜치/SHA와 함께 빠짐없이 기록; 제품/계약/기존 Log 0변경과 지시 경계 일탈을 분리 보고. 추가 push 없이 요청된 보완 분석을 먼저 제출.

### R-05 [IMPORTANT] 구현 전 정적 설계/시험 수용 기준 부족

- `node --check` RC0는 문법 정상일 뿐 A1 회귀/A2 8정상/112음성 실측의 합격이 아님.
- 과거 `execution.json`의 Windows 절대 repo 경로 `C:\\Projects\\Active\\ShiftMgmt_V4`와 새 GitHub clone 하위 `ShiftMgmt_V4/`를 무작정 동일 환경으로 취급할 수 없음. 기존 로컬 제품 경로에서 실행할지 격리 clone에서 계약 경로를 보존할지 안전한 정확한 재현 방식을 설계.
- `Chrome .40 → .41` mismatch는 외부 gate를 실패시킬 수 있으며 원 `environment-policy.json` 또는 history checker를 **임의 수정**하면 불변 계약 위반 가능. 새 v2 기준 승인 전까지 `.41` 반영을 자동 실행하지 말 것.
- Windows Chrome/SDK를 실제로 돌린 새로운 A2 합격 증거 없음. 112 벡터는 계획 전수 `UNPROVEN` 유지.

## 3. 현재 결정

**사용자에게 'READY_FOR_HANDOFF_ISSUANCE'로 보고됐으나, Sol 독립 검토에서는 실행 가능한 `Action: IMPLEMENT` HANDOFF 발행 게이트를 아직 통과하지 못함.**

- 사전실사 환경·소스 기준선: **조건부 수용(현장 기록 + GitHub 교차 대조)**.
- 112 fault injection 상세 설계: **BLOCKED_DESIGN_EVIDENCE**.
- 30,000B 보호 한도 충족: **BLOCKED_SCOPE_BUDGET**.
- 경로 scanner: **불일치/재확인 필요**.
- v2 구현·A2/B87 수용: **모두 미착수/미수용**.

다음 작업: 로컬 에이전트가 R-01~05를 **제품 수정 없이** 보완해서 제출 → Sol이 원 code/contract/manifest와 독립 대조 → 정확한 브랜치/예상 status, 허용 4개 파일, 수정 전략, 명령/RC/증거 계약을 확정 → 그때만 새로운 `HANDOFF.md` 발행·Gemini 코드 구현 지시.

본 파일 외 기존 `HANDOFF.md`, `TODO.md`, 원본 사전실사 보고서, 제품 코드, `main` 변경 없음.
