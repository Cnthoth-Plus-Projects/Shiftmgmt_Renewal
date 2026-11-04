# Project Harness Bridge — 교대근무관리 시스템 (ShiftMgmt 리뉴얼)

Project Harness Version: **4.0.0 (2026-09-13)**

Installed Global Harness: **5.1.0 (2026-09-30)**
Pinned commit: `8ebab0087b228c0203a202bead8fb56853d9cb27`

프로젝트 운영 오버레이는 v4.0.0이며, 위 버전은 연결된 Global Runtime의 설치 버전이다.

GLOBAL HARNESS ROOT:
`C:\Users\pangyo\AppData\Local\AI-Harness`

이 프로젝트는 Global AI Harness를 사용한다.

---

## 0. 프로젝트 운영 오버레이 (사용자 확정)

Global Harness의 일반 라우팅 위에 다음 고정 역할을 적용한다.

| Tier / Actor | 고정 역할 | 책임 |
|---|---|---|
| **frontier — Sol(xhigh, Codex)** | **유일한 오케스트레이터** | 범위·요구사항·설계·아키텍처·코드 전략·지시·검증·통합·완료 판정·사용자 보고 |
| **balanced — Terra** | 내부 보조 | 범위가 닫힌 조사·시험 계획 검토·집중 디버깅 가설·근거 교차검토 |
| **economy — Luna** | 내부 보조 | 탐색·추출·목록·해시·로그 요약·단순 시험 실행 |
| **external — Gemini** | 구현 코더 | 사용자가 중계한 Sol의 상세 HANDOFF 범위 안에서 제품 코드 구현 |

- Claude와 Fable은 현재 운영에서 폐기됐다. 과거 기록의 이름은 이력일 뿐이다.
- 이 매핑은 이 프로젝트에 대한 사용자의 명시적 결정이므로 Global Harness의 “구체 모델명을 정책에 고정하지 않는다”는 기본값보다 우선한다.
- 고정 모델을 쓸 수 없으면 같은 capability tier의 가용 모델로 한 번 대체하고 그 사실을 기록한다. Sol의 최종 권한은 대체하지 않는다.
- Sol은 필요할 때 Luna/Terra에 직접 위임한다. 보조자는 tracked 파일을 바꾸지 않는 닫힌 작업만 수행하고, Sol이 원문과 실행 증거를 재검증한다. 시험/빌드가 출력을 만들면 지시서에 지정한 저장소 밖 임시 경로만 사용하고 보존·정리 규칙을 함께 적는다.
- 제품 코드·테스트·마이그레이션·빌드/실행 설정의 정상 수정 주체는 Gemini뿐이다. Sol의 직접 구현은 해당 작업에 대한 새 사용자 명시 지시가 있을 때만 예외다.
- Gemini는 외부 세션이므로 사용자가 `HANDOFF.md`를 직접 중계한다. Sol이나 Gemini가 상대 AI CLI를 임의 호출하지 않는다.

### 0.1 작업 상태기계

**2026-10-21 사용자 결정(아래 과거 재시도 규칙보다 우선):** 작업당 Gemini 최초 1회 + 재시도 1회만 허용한다. 두 번 모두 Sol 검수에서 실패하면 사용자 상시 승인에 따라 Sol이 직접 구현을 승계한다. 동일 미완료 작업의 버전·전략 변경으로 횟수를 초기화하지 않는다. 매 작업 보고에 최초/재시도/누적/현재 담당을 적고 HANDOFF 및 시도 장부에 보존한다. 이전 이력은 소급해서 바꾸지 않는다. 범위·검증·배포 승인 경계는 유지한다.

```text
INTAKE
  -> SOL_SPEC          목표·비목표·정본·위험·불변조건 확정
  -> INTERNAL_CHECK    Luna/Terra 선택 위임 및 Sol 재검증
  -> READY_TO_CODE     파일 allowlist·코드 전략·검증·음성 시험이 모두 닫힘
  -> USER_RELAY        Sol HANDOFF를 사용자가 Gemini에 전달
  -> GEMINI_IMPLEMENT  Gemini 구현 및 증거 회신
  -> SOL_VERIFY        Sol이 diff·해시·명령·UI를 독립 검증
  -> ACCEPTED | CORRECT | BLOCKED
```

- `READY_TO_CODE` 전에 Gemini에 구현을 보내지 않는다.
- `CORRECT`는 발견된 결함을 한 번에 묶은 단일 수정 지시다. 같은 결함군은 최대 2회만 재제출한다.
- 2회 실패하면 핑퐁을 중단하고 Sol이 지시서·전략·범위를 다시 설계하거나 사용자 결정을 받는다.

### 0.2 지시서 품질 게이트

2026-10-26 사용자 승인 Task 계획: 현재 실행은 TODO.md의 다음 leaf Task 하나로 제한한다. `.ai/task-plan.json`은 같은 TODO의 색인이다. 목록 밖 작업 자동 착수·별도 검증 프레임워크 확장·작은 준비 단계의 반복 승인은 하지 않는다. 필요한 결함은 같은 Task/허용목록에서 해결하고, 구현 후에야 가능한 검증을 구현 전 착수 조건으로 두지 않는다. 과거 장문 TODO는 Log 원문으로 보존한다.

Gemini용 HANDOFF에는 다음이 전부 있어야 한다.

1. 목표/비목표와 요구사항 ID.
2. 저장소·브랜치·기준 커밋·초기 상태.
3. 수정 허용 파일과 보호 경로.
4. 파일별 코드 전략, 재사용 호출점, 데이터 흐름, 상태 전이, 오류 처리.
5. 관련 불변조건과 과거 함정.
6. 검증 명령·기대값·음성 시험·UI 실측 기준.
7. 범위 이탈·모순·검증 실패 시 중단 조건.
8. full hash, diff, 명령 종료 코드, 캡처를 포함한 회신 양식.

상세 계약은 `PROTOCOL.md` 활성 v4 절과 `GEMINI.md`를 따르고, 실제 발송문은 `.ai/GEMINI_HANDOFF_TEMPLATE.md`에서 시작한다.

---

## 1. Runtime 기준

일반 Task 시작 시 26개 정책 원문을 전부 읽지 않는다.

먼저 다음 세 파일만 Runtime 기준으로 사용한다.

1. `C:\Users\pangyo\AppData\Local\AI-Harness\CORE.md`
2. `C:\Users\pangyo\AppData\Local\AI-Harness\ROUTER.md`
3. `C:\Users\pangyo\AppData\Local\AI-Harness\POLICY_INDEX.yaml`

Task routing 전에 Root, CORE, ROUTER, Index parse, `policy_count`, `policies/` 디렉터리만
Fast Health Check한다. 일반 Task에서 P01~P26 원문 전체를 검사하지 않는다.

상세 Policy Precedence는 `ROUTER.md`를 따른다.
핵심 Runtime을 신뢰할 수 없거나 현재 Task의 Critical Policy가 없으면 `BLOCKED`,
현재 Task와 무관한 비핵심 결함만 있으면 제한적으로 `DEGRADED`로 동작한다.
없는 정책 내용을 추측하거나, 검증하지 않은 상태를 `HEALTHY`라고 하지 않는다.

그 후 현재 Task를 Task / Phase / Risk / Boundary로 분류하고,
POLICY_INDEX와 ROUTER를 사용해 현재 행동에 실제 필요한 정책만
`<HARNESS_ROOT>/policies/`에서 JIT로 읽는다.

기본 목표는 보통 2~5개의 전문 정책이며 강제 상한은 아니다.

v5.1의 번들 Skill은 `<HARNESS_ROOT>/skills/<skill-id>/SKILL.md`에서 현재 작업에
필요한 것만 JIT로 읽는다. Skill 지침에도 프로젝트 역할·제품 수정 경계·정본 규칙이 우선한다.
선택 기능인 Jev Decision Advisor는 현재 미설정·비활성이므로 기존 Router 경로를 사용한다.

---

## 2. 새 Boundary 발견 시 재라우팅

- Database / Schema / Migration → P16
- Auth / Permission / Tenant / Secret / IAM → P17
- Package / SDK / External API → P15
- Durable Architecture Decision → P18
- Scope Drift → P23
- Existing Plan Invalidated → P25
- Repeated Failure → P08 / P13

P01은 Codebase Map / Indexer / MCP 자체를 구축·수정할 때 주로 사용한다.
일반 Coding Task의 코드 탐색은 P26을 사용한다.

P02 전체를 일반 Subagent마다 반복 전달하지 않는다.
Subagent에는 필요한 Role, Objective, Constraints, Context Refs, Output Contract만 전달한다.

P03 전체는 Router를 설계·디버깅할 때 주로 사용한다.
정상 Runtime에서는 `ROUTER.md`가 Compact Router 역할을 한다.

---

## 3. 이 프로젝트의 Boundary 매핑 (작업 방향 반영)

리뉴얼 방침은 **"화면은 새로, 계산은 그대로"** 다.
따라서 이 프로젝트에서는 아래 Boundary가 평소보다 자주, 그리고 더 강하게 걸린다.

| 이 프로젝트에서 실제로 자주 발생하는 상황 | Boundary | 추가 로드 |
|---|---|---|
| 기존 SQLite 표 36개 구조·컬럼·제약을 건드리는 모든 작업, 운영 DB 이어받기 검증 | DATABASE | P16 |
| `src/shared/domain/` · `src/main/services/` 등 **이관 대상(수정 금지) 코드**를 고치려는 시도 | SHARED_CODE + SCOPE_DRIFT | P04, P23 |
| 수당 계산·승인 규칙·정책 적용 시작일을 바꾸는 판단 | ARCHITECTURE_DECISION | P18 (+ P16 재계산 영향 시) |
| 엑셀 파싱·문서 출력 양식(`exceljs`, 품의서/별첨 양식) 계약 변경 | EXTERNAL_SERVICE / 계약 | P15 |
| 권한 4단계(operator/planner/reviewer/admin)·main측 IPC 권한 가드 | AUTHORIZATION | P17 |
| 새 UX/UI 시안 해석, "깔끔하게/모던하게" 같은 주관적 표현 | DESIGN | P07, P12, P14 |
| 화면 재구축 순서·단계 진행 (08 문서 0~5단계) | 장기 프로젝트 | P20, P21, P24 |
| 실제 앱을 띄워 캡처·클릭 검증 없이 "됐다"고 판단하려는 순간 | VERIFICATION | P06 |

`03-data-model.md`·`07-invariants-and-pitfalls.md`에 적힌 **프로젝트 확정 규칙**은
Harness의 일반 권고보다 우선한다(ROUTER §9 Precedence 3). 단, Secret Protection,
Data Loss 방지, Destructive Guard는 Local Rule만으로 약화하지 않는다.

에이전트 운영 규칙은 루트 `AGENTS.md`·이 파일·`PROTOCOL.md`가 소유한다.
프로젝트 제품 규칙 원문은 legacy filename인 `CLAUDE.md`와 `00~09` 리뉴얼 문서가 소유한다.
`CLAUDE.md`라는 파일명은 호환성용이며 Claude의 운영 권한을 뜻하지 않는다.
이 파일에 그 내용을 복제하지 않는다.

---

## 4. Context / Trace 규칙

2026-10-26 사용자 요청에 따른 검증 실행·재시도·시간·보고 기준은 [VERIFICATION_WORKFLOW.md](VERIFICATION_WORKFLOW.md)를 따른다. 긴 전체 검증 전에 사전 확인과 집중 재현을 끝내고, 같은 실패 반복 시 접근 방법을 바꾼다. 기존 필수 검문과 실행 제한 시간은 유지한다.

작업이 끝난 Phase의 전문 정책 원문은 계속 재로드하지 않고
필요한 Decision / Evidence / Blocker만 `.ai/current-state.md`에 압축 보존한다.

Policy Load Trace의 기본 모드는 `record_only`다.
State에는 Policy ID, Load Reason, New Boundary Trigger, Released Policy만 짧게 기록한다.
사용자 요청 또는 Harness Debug / Doctor / Router 분석 때만 display한다.

`.ai` 상태, Plan, Spec, Decision, Map, Learning, Trace, Checkpoint, Handoff에는
Secret이나 Credential 실제 값을 저장하지 않는다.
필요하면 환경변수명 또는 승인된 Secret Store 참조만 기록한다.

---

## 5. Doctor

사용자가 Harness Doctor를 요청하면
`C:\Users\pangyo\AppData\Local\AI-Harness\HARNESS_DOCTOR.md`를 읽고 기본 Read-only 진단을 수행한다.
이 문서는 P27이 아니며 전문 정책 수에 포함하지 않는다.

---

## 6. 최상위 우선순위

실제 Source / Runtime / Test Evidence가 AI의 추측이나 오래된 Map보다 우선한다.
검증하지 않은 것을 완료라고 주장하지 않는다.
