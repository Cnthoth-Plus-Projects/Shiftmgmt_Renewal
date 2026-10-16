# A2 v2 — GitHub 개발 공간과 Windows 고정경로 검증 안전 절차

> **2026-10-16 사용자 경로 정정 — 현재 적용 우선 지침:** 실제 로컬 프로젝트와 작업·검증 스크립트 실행 기준은 `C:\Projects\Active\ShftMgmt_Renewal`이다. 아래 원래 계획의 `C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal` 별도 clone 생성·사용 지시는 **더 이상 현재 작업 절차가 아니다**. I3 스크립트는 현재 구현 브랜치의 `.ai/work/phase3-2c-a2-v2/probes/i3_reader_smoke_v2.mjs`에 포함되며 프로젝트 Git 루트에서 직접 실행한다. 기존 `C:\Projects\Active\ShiftMgmt_V4` 및 `C:\Projects\Active\교대근무관리 시스템`의 고정 계약·legacy 원본은 계속 보호한다. 실행 전 실제 로컬 repo 브랜치 및 Clean 상태를 확인하고, 안전이 입증되지 않은 브랜치 전환/overwrite는 금지한다. 이 지침은 외부 fixed-path gate의 특성이나 승인 없는 legacy overlay 금지를 변경하지 않는다.


- 상태: SOL_WORKFLOW_DESIGN / NO_PRODUCT_MUTATION / RUNTIME_UNPROVEN
- 등급: frontier (고정 절대경로·바이트 잠금·dirty12 보호·실행 증거 신뢰가 모두 충돌할 수 있음)
- 공식 저장소: Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- 기준 main: c21aa263a02e57d57949bafc5aefe06aab582acd (안정 기준)
- 원본 A2 v1 미수용: work/phase3-2c-a2-v1-not-accepted @ 2f51c11710f46c75a49f5715cc68d4752b53f8ca
- 설계: work/phase3-2c-a2-v2-design
- 별도 구현 브랜치: work/phase3-2c-a2-v2-implementation (설계 HEAD에서 파생; 생성만으로 제품 수정 허가 아님)
- 현재 Windows 제품 원본: C:\Projects\Active\ShiftMgmt_V4 (HEAD 160940f9aaeb6696538447f83b44658073e382f0; 기존 4 tracked modified + 8 untracked)
- 현재 Windows 계약 원본: C:\Projects\Active\교대근무관리 시스템\.ai\contracts\...
- 절대 읽기 전용: C:\Projects\Active\ShiftMgmt_V3.4
- 이 문서는 IMPLEMENT HANDOFF가 아니며, 임시 overwrite/overlay 실행도 승인하지 않는다.

## 1. 기술 판단: 두 작업 장소를 분리한다

원 execution.json의 repository 값은 C:\Projects\Active\ShiftMgmt_V4로 고정되어 있다. owner access-history.mjs는 process.cwd()가 자기 파일의 제품 root와 일치하는지 확인하고, gate-evidence.py 역시 execution.repository를 기준으로 시험 소스를 검증한다. GitHub 통합 clone 내부 ShiftMgmt_V4/ 하위 위치에서 이 old locked gate를 곧바로 실행하면 실제 A2 결함이 아닌 경로 차이로 먼저 실패할 수 있다.

- AUTHORING: C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal 에 별도 새 GitHub clone을 만들고, 새 구현 브랜치에서 4파일만 개발/커밋/Push한다.
- RUNTIME: 이미 Windows 계약이 잠긴 C:\Projects\Active\ShiftMgmt_V4 실제 물리경로에서만 old locked gate의 runtime을 수행한다.
- CONTRACT: 교대근무관리 시스템 폴더에 있는 CRLF historical A1/A2 v1 계약 파일을 그대로 참조한다. 두 계약 파일의 GitHub LF -> Windows CRLF 변환이 잠긴 전체 SHA와 맞는 것은 EOL_LOCK_RESOLUTION.md에서 해결됐다.

**원본 제품 폴더에 임시 overlay를 넣는 행위는 별도 명시적 허가가 필요하다.** 나중에 허가하더라도 12개 dirty paths를 바이트 단위로 원상복구한다.

## 2. GitHub 별도 개발 Clone 생성 (명시된 구현 HANDOFF 후만)

제품·계약 원본 두 폴더를 clone이나 checkout 대상으로 지정하지 말 것. 새 폴더가 존재하지 않는 경우에만 PowerShell에서 다음과 같이 수행한다.

    $Root = 'C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
    $Remote = 'https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal.git'
    git -c core.autocrlf=false clone -c core.autocrlf=false $Remote $Root
    git -C $Root fetch origin
    git -C $Root switch --track origin/work/phase3-2c-a2-v2-implementation
    git -C $Root status --porcelain=v1
    git -C $Root rev-parse HEAD
    git -C $Root config --local --get core.autocrlf

**필수 STOP:** 폴더 이미 존재, origin/브랜치/HEAD 예상치 다름, 초기 status dirty, git clone EOL이 4파일 SHA와 다름. 이 경우 reset/clean/reclone으로 해결하지 말고 사실만 보고.

core.autocrlf=false는 이 새 clone에만 적용한다. historical 계약은 Windows 원본 CRLF 바이트가 기준이며 clone의 Git blob LF 해시와 혼동하지 않는다.

새 브랜치 구현 허용 제품 파일은 정확히 4개:
1. ShiftMgmt_V4/scripts/ui-checks/access-history.mjs
2. ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs
3. ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs
4. ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs

나머지 src/, scripts/, package.json/lock, .ai/, TODO, AGENTS, PROTOCOL, old HANDOFF, Log, 계약·V3.4는 읽기 전용. main과 A2 v1 미수용 브랜치는 변경/병합하지 않는다. 원 HANDOFF 교체가 필요해지면 PROTOCOL.md의 기존 HANDOFF Log 원문 byte/SHA 보존 절차를 먼저 거쳐 별도 발행한다.

## 3. 고정경로 Runtime 안전성: 네 파일 임시 overlay는 트랜잭션이어야 한다

별도 구현 브랜치의 후보 4파일을 실제 Windows 계약 고정 제품경로에서 검증하려면 불가피하게 원본 제품 4파일을 잠시 교체해야 할 수 있다. **이 계획만으로 교체를 실행하지 않으며, 구현 HANDOFF에 시험시간 한정 overlay가 명시·승인된 뒤에만 실행할 수 있다.**

### 사전 점검과 복구 준비

1. 원본 제품 repo Git root, branch, HEAD, 전체 git status 및 12 dirty 파일의 path/바이트수/SHA-256을 기록. 12개가 과거 알려진 경로와 다르면 중단.
2. 원본 검증기 4 SHA-256과 크기:
   - owner 29,351B / 2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7
   - shared 29,973B / C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4
   - positive 22,530B / 77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01
   - negative 27,848B / F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6
3. 후보 파일 4개 각각 30,000B 이하, shared frozen 6,575B 및 SHA-256 502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1 동일. 4개 이외 제품 변경 0, Git diff --check RC0, node --check 전부 RC0.
4. 계약 원본 contract/execution/baseline/gate의 전체 SHA와 실제 경로/현재 Node/Chrome/Playwright/Python 확인. 원 계약 복제, 재해시, 전체 core.autocrlf 변경 금지.
5. 타인이 쓰는 Windows 서버/브라우저/테스트 세션이 없는지, 127.0.0.1:18741 포트 FREE인지, 다른 검증 세션 lock이 없는지 확인. 타 PID를 종료해서 점유를 해소하는 행위 금지.
6. 원본 4파일의 byte-for-byte 백업을 제품 밖 C:\Projects\Active\_a2_v2_validation\RUN_ID\backup에 보존하고 **원본과 백업 SHA·byte를 직접 대조**. 만약 한 항목이라도 불일치하면 중단.
7. PowerShell 오류·예기치 않은 프로세스 종료·전원손실을 대비하여 제품 밖에 recovery manifest(원본/백업 경로, 전체 해시, 실행 시각, 복원 전 수동 판단법)와 실제 복구용 명령을 먼저 저장. scratch에 대한 백업 복사/복원 dry-run으로 byte roundtrip을 확인하되 제품 파일은 아직 수정하지 않는다. 복구 가능성이 입증되지 않으면 중단.
8. 초기 12 dirty 파일 해시 중 외부 원본 보호 테스트에 직접 필요한 로그·DB·고객 비밀값을 업로드하거나 공유하지 않는다.

### 승인된 단일 Runtime 시험 창

1. 명시적 구현 HANDOFF에 범위가 허용된 후에만 후보 4 mjs 바이트를 원본 제품 파일에 임시 overlay. 원본 나머지 8 untracked와 .git, 계약, Log, src 등은 변경하지 않는다.
2. 실행 cwd는 C:\Projects\Active\ShiftMgmt_V4. 별도 GitHub clone 제품 경로를 원 gate 실행 장소로 바꾸지 않는다.
3. 기존 A1 정본 contract-core + regression-shell + regression-home 회귀, 8 normal, 112 원 negative vector를 각 실제 source helper/SDK/owner 호출로 시험. 112 전부 사전 상태 UNPROVEN, CLI reject/예상값 복사 receipt로 실측 대체 금지.
4. 실제 PID, UTC/시각, timeout, RC, stdout/stderr raw bytes/SHA, underlying Chrome/browser/page/request callbacks, worker/owner/port cleanup 및 gate 결과를 기록. 실제 오류 FAIL/RC1과 coverage-only FAIL_INCOMPLETE/RC1을 구분.
5. 새 owned runId의 임시·캡처 생성 이력만 기록하고 기존 artifacts/captures/Log는 삭제하지 않는다. 호출한 자식 PID만 정리하며 타 프로세스 영향 금지.

### 항상 원상복구

- 테스트 성공/실패에 관계없이 가능한 경우 PowerShell try/finally로 모든 own 자식 process 종료와 로그 settle을 **실제로 확인한 뒤**, 원본 백업 4파일을 byte-exact 복구.
- 중간 전원손실에서는 자동 원상복구를 보장할 수 없다. 보존한 recovery manifest와 원본 SHA를 이용해 사용자의 통제하에 복구한다. 타 프로세스가 그 파일을 열고 있거나 충돌이 있으면 자동 덮어쓰기 중단.
- 원본 12개 경로 전체 SHA, HEAD, branch, git status, worktree list를 시험 전/후 비교해 완전 일치해야 성공. 1바이트라도 다르면 BLOCKED_ROLLBACK, 새로운 실험/commit/수용 금지.
- 실험 후보가 통과한 경우에도 commit/push는 **별도 GitHub clone 구현 분기**에서만. 기존 ShiftMgmt_V4 로컬 원본에 git commit/stash/clean/reset/pull/push 절대 금지.
- 제품 runtime에서 테스트가 추가 빌드나 dist 재생성이 필수라면 protected 원본에 무단 빌드하지 말고 STOP하여 별도 전용 스크래치/검증 공간을 설계.

## 4. 단계 및 STOP 게이트

| 단계 | 통과 기준 | 허가 범위 |
|---|---|---|
| G0 설계 | 기존 A2 11결함, 원 112 ID 실제 호출점/주입 방법, 4파일 용량 후보, 계약 CRLF SHA 확인 | 구현 지시/브랜치 준비 |
| G1 개발 | 별도 GitHub clone clean + 정확한 branch/commit + 4파일 원 기준 SHA | 사용자 중계된 IMPLEMENT HANDOFF가 있을 때만 4파일 구현 |
| G2 런타임 준비 | 12 dirty 전수 스냅샷, 4파일 백업/복구 dry-run, 원 계약 해시, 타 세션 없음 | 사용자 승인된 시험시간 한정 overlay |
| G3 실제 시험 | A1 회귀, 8 normal, 112 실제 fault 및 프로세스·raw evidence | 결과 제출 (제품 수용 아님) |
| G4 복구 | 시작/종료 12해시+status+HEAD+branch 비교 완전 일치 | Sol 독립 검토 가능 |
| G5 수용 | Sol 실측 재검증 + 실패0 + 전체 증거 확인 | 이후 명시적 PR/merge 결정; main 자동 병합 금지 |

## 5. 남은 위험

- 새 테스트 fault injector/receipt tool 구현을 4제품 파일만으로 불가능하면 별도 외부 scratch 도구가 필요하다. 비제품 스크래치 도구 자체도 영수증 출처/원 호출/테스트 대상으로 신뢰할 수 있는 설계가 필요하다. 새 제품 파일/새 의존성/테스트 수정은 무단 추가 금지.
- 30KB shared는 처음부터 여유 27B. frozen 영역 밖 선행 공백 제거 시뮬레이션의 잠재 1,562B 절감량은 실제 patch 바이트 예측·A1 런타임 동등성 증명과 구별한다.
- GitHub 원 계약 LF가 Windows CRLF와 다르다는 이유로 역사의 SHA 또는 계약 내용을 덮지 않는다.
- v1 acceptance는 A1 ACCEPTED, A2 v1 FAILED; A2 v2, 전체 A, B87은 현재 미수용. 본 문서는 G2 overlay 승인이나 코드 수정 허가가 아님.
