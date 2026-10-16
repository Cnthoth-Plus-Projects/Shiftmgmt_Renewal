# Phase 3-2c A2 v2 — Windows 현장 사전 실사 패킷

- **Action:** READ_ONLY_PREFLIGHT (코드 수정·구현·수용 승인 아님)
- **작성일:** 2026-10-16
- **작업 등급:** frontier — 손상된 검증기와 바이트 고정 계약의 재실행 가능성 진단
- **대상 저장소:** https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- **A2 미수용 정본 브랜치:** \`work/phase3-2c-a2-v1-not-accepted\` @ \`2f51c11710f46c75a49f5715cc68d4752b53f8ca\`
- **설계 문서 브랜치:** \`work/phase3-2c-a2-v2-design\` (원래 A2 미수용 기준에서 출발)
- **보호 기준:** \`main\` @ \`c21aa263a02e57d57949bafc5aefe06aab582acd\`
- **결과 분류:** 현장 조사가 끝나면 PRECHECK_PASS / BLOCKED_ENV / BLOCKED_SCOPE / BLOCKED_BASELINE / UNPROVEN 가운데 해당 항목별 표시. PRECHECK_PASS도 A2 수용·코드 작성 허용을 뜻하지 않음.

## 0. 권한 및 완전 중단 조건

이번 요청은 Windows PC에 직접 접근할 수 있는 로컬 에이전트의 **읽기 전용 조사**다. 작성 가능한 곳은 기존 제품 저장소 바깥의 본인 전용 임시 증거 디렉터리 1개뿐이며, 위치와 정리/보존 정책을 작업 전에 보고한다.

- 제품/테스트/빌드/의존성/소스/계약, 루트 \`TODO.md\`, \`HANDOFF.md\`, 원 \`Log/\` 편집 금지.
- \`C:\Projects\Active\ShiftMgmt_V3.4\` 접근은 필요한 읽기 범위 외 금지.
- 새 브랜치/커밋/PR/push, \`git reset --hard\`, \`git clean\`, \`git stash\`, 외부 프로세스 종료, 기존 artifact 정리 금지.
- 기존 테스트의 원 계약·A2 v1 checker/baseline/negative-vectors.json의 값 수정 금지.
- 실측하지 않은 시험을 PASS로 표시하지 않는다. 외부 judge/gate PASS를 SUT 실행 PASS와 혼동하지 않는다.
- 예상하지 못한 Git SHA/status 변동, A1 protected drift, Chrome/Node/Playwright 경로 불일치, 4개 허용 파일의 30KB 상한과 충돌 또는 절대 경로 미해결이면 정지하고 구체적 증거와 함께 BLOCKED.

## 1. 현재 저장소의 실제 배치 먼저 확인

GitHub 단일 저장소의 **루트**는 기획/계약/검수 자료, 제품은 \`ShiftMgmt_V4/\` 하위다. 프로젝트 과거 기록의 로컬 두 물리 경로는 독립 폴더였다.

PowerShell 읽기 전용 명령 예 (현재 존재하는 경로만 사용; 경로 추측 금지):

\`\`\`powershell
git -C "C:\Projects\Active\ShiftMgmt_V4" rev-parse --show-toplevel
git -C "C:\Projects\Active\ShiftMgmt_V4" rev-parse HEAD
git -C "C:\Projects\Active\ShiftMgmt_V4" status --porcelain=v1
git -C "C:\Projects\Active\ShiftMgmt_V4" worktree list --porcelain
git -C "C:\Projects\Active\ShiftMgmt_V4" cat-file -t 160940f9aaeb6696538447f83b44658073e382f0
git -C "C:\Projects\Active\교대근무관리 시스템" rev-parse --is-inside-work-tree
\`\`\`

위 경로가 없거나 폴더 상태가 변했다면 사용 중인 실제 GitHub clone 경로, Git 루트 및 \`ShiftMgmt_V4/\` 물리 경로를 모두 실측하고 보고한다. \`rev-parse\`가 실패해도 덮어쓰기·새 repo init을 하지 않는다.

**특별 점검:** 원 제품 검증기에서 \`process.cwd()\`는 제품 루트여야 한다. 반면 \`.ai/contracts/phase3-2c-v1/contract.json\`, \`.ai/contracts/phase3-2c-a2-v1/execution.json\`, \`baseline.json\`, \`gate-evidence.py\`는 예전 Windows 두 폴더에 걸친 **절대 경로**를 참조한다. 현재 실제 경로로 존재하는지와 해시가 같아질 수 있는지 **변경 없이** 확인한다. GitHub 레이아웃을 바꿨으므로 경로 불일치를 SUT 기능 결함으로 기록하지 않는다.

## 2. 제품 원본 및 A2 파일 전수 측정

- \`main\`에는 제품 333개 파일(원 제품 HEAD와 Git blob SHA 일치), A2-v1 분기에는 변경4/추가8을 포함해 341개다.
- 로컬 작업 파일이 과거와 다른 경우 *새 파일을 덮어쓰지 말고* diff/SHA/size를 별도 보고한다.
- 미수용 12 경로는 현재 GitHub 보존 브랜치에 있으며 본 현장 검증은 해당 정확 SHA가 가리키는 제품을 기준으로 한다.

\`\`\`powershell
# 실제 제품 root 경로를 실측 확인한 뒤 \`$P\`를 설정
$P = "C:\Projects\Active\ShiftMgmt_V4"
$files = @(
  "scripts/ui-checks/access-history.mjs",
  "scripts/ui-checks/access-history-shared.mjs",
  "scripts/ui-checks/access-history-positive.mjs",
  "scripts/ui-checks/access-history-negative.mjs"
)
foreach ($f in $files) {
  $p = Join-Path $P $f
  if (Test-Path $p) {
    $i = Get-Item $p
    $sha = (Get-FileHash $p -Algorithm SHA256).Hash
    "$f $($i.Length) bytes SHA256=$sha"
  } else { "$f MISSING" }
}
\`\`\`

기준 (정확히 일치 요구, 불일치 시 BLOCKED_BASELINE):
- owner 29,351B \`2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7\`
- shared 29,973B \`C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4\`
- positive 22,530B \`77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01\`
- negative 27,848B \`F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6\`

허용 4개 파일만, 각 **최대 30,000B**; 현재 여유 649/27/7,470/2,152B. \`CANONICAL_8_ACTIONS\` 시작 ~ \`performWorkerIpcHandshake\` 바로 전 shared frozen **6,575B**, SHA-256 \`502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1\`, 원문 불변.

파일별 중복 제거/재배치의 **구체적인 예상 바이트 절감량·함수별 위치·동작 변경 위험**을 작성한다. 상한을 맞출 수 없으면 조용한 허용 파일 추가나 제한 완화 대신 BLOCKED_SCOPE를 제출한다.

## 3. 현장 환경 지문

제품 루트 \`ShiftMgmt_V4/package.json\` 요구 Node \`>=24 <25\`, Playwright \`^1.58\`이다. 관측 시각(KST/UTC), OS, 아키텍처, 실제 실행파일 경로를 보고한다.

- \`node --version\`, \`npm --version\`, \`Get-Command node\` 실제 경로.
- Chrome 설치 파일 경로, 파일 버전, Playwright \`findChrome()\` 해석 경로 및 실행 버전 (구버전 고정 \`155.0.8059.40\`, 10/16 문서상 실측 \`155.0.8059.41\`).
- Playwright 설치 판본을 \`npm ls playwright --depth=0\`로 읽기 전용 확인.
- 외부 판정기의 경로/버전, Python 경로, 계약 JSON 및 gate 실행기의 존재·전체 SHA.
- \`http://127.0.0.1:18741/\` TCP 점유 여부(기존 서비스 중단 없이 조회); 화면의 실제 \`1440x900\` viewport와 SDK 측정값을 동일 환경에서 재현할 수 있는지 평가. 실제 UI 실행은 별도 승인된 격리 검증에서만 실시.
- 제품 소스 파일의 syntax-only \`node --check\`는 가능하나 **제품 검증 PASS로 쓰지 않는다.**

## 4. A2 v1 결함 11건의 재현 가능성 점검

실행 없이 정적 경로/예상 fault instrument 위치를 특정한다. 각 항목은 \`ID / 해당 코드 경로 / 실제 주입 가능 여부 / 필요한 임시 파일/프로세스 / 기대 실패 코드 / 위험 / BLOCKED 근거\`로 제출한다.

| ID | 정본 결함 항목 / 실사 질문 |
|---|---|
| A2V1-01 | 112 벡터를 원 SUT/SDK/helper 호출로 실제 주입할 수 있는가? |
| A2V1-02 | pending HTTP, viewport, close 시각/결과 허위 기록 경로의 실제 계측 위치? |
| A2V1-03 | reader의 위조 PASS/오류 경로와 임시 데이터 선삭제를 어떻게 차단할 것인가? |
| A2V1-04 | normal-partial 주·fallback 이중실패, 첫 오류/cleanup 전파의 검증 가능한 접점? |
| A2V1-05 | protected helper 본인이 생성한 캡처 run manifest를 식별할 실제 source binding? |
| A2V1-06 | 동일 URL 동시요청의 identity, strict postDataJSON 및 drain 경로? |
| A2V1-07 | Held timeout 타이머, own route 종료 보장 경로? |
| A2V1-08 | 무해 sentinel을 통한 오류/로그/redaction 확인 가능성? |
| A2V1-09 | realpath/junction direct 실행 우회 차단 범위? |
| A2V1-10 | owner env/bootstrap/ACK wire 계약 확인 가능한 단위? |
| A2V1-11 | 원 child PID/시간/RC/log bytes+SHA로 command receipt를 생성·검증할 방법? |

## 5. 원 음성 112개 벡터 — 개수·주입 증명 설계

GitHub \`.ai/contracts/phase3-2c-a2-v1/negative-vectors.json\`의 원본을 **읽기 전용**으로 열어 \`groups=20\`, \`vectorCount=112\`, \`sum(group.vectors.length)=112\`를 각각 검산하라. \`NEGATIVE_VECTOR_INDEX.md\`에 112 ID가 전부 전개되어 있다.

각 112 ID에 대해 실제 fault의 호출점과 **독립 주입의 구체적 방법**을 기록하라. 진행 시는 모든 case \`UNPROVEN\`이며, 현장 실제 시험을 별도 실시하기 전까지 어떤 항목도 PASS가 아니다.

정본 특별 요구:
- A-N03의 "known"은 등록된 모든 private case를 포함하고, 각각 개별 receipt.
- A-N04도 모든 유효 private case/forged env/own healthy stub, IPC 없음, stub request0.
- A-N07의 크기 경계 132/133은 **성공 기대**이며 이외 거절과 분리.
- A-N14 \`NOT_USED\`는 최종 출판 코드의 실제 미사용 API임을 AST/경로/해시로 증명. 원 소스가 사용 중인 API를 \`NOT_USED\`로 처리하면 거절.
- 파서 검문 통과·CLI 거절·자가 receipt 패키징은 SUT의 실제 fault 주입 증거가 아님.

## 6. 제출 형식 (가급적 JSON + 읽기 쉬운 Markdown)

1. **실행 장소:** 실측 물리 경로, Git top-level, 각 분기 전체 HEAD 및 예상 status.
2. **작업 결과:** PRECHECK_PASS / BLOCKED_ENV / BLOCKED_SCOPE / BLOCKED_BASELINE / UNPROVEN.
3. **4개 검증기:** 전체 bytes/SHA, shared frozen 6,575B/SHA, 변경 없음.
4. **위험/차단:** A2V1-01~11 각 fault 호출점과 예상 변경 범위, 4파일/30KB 용량 해결안(각 파일 구현 전·후 상한 추산).
5. **112 IDs:** 실제 주입 계획 ID별 관측 항목, 정본 대비 누락/중복 0.
6. **환경:** OS/Node/Chrome/Playwright/경로/port + contract/execution/baseline/gate 정본 지문.
7. **실제 수행 명령:** 전체 명령·UTC/KST 시각·RC·원 stderr/stdout 경로와 SHA. 읽기/구문 검사와 SUT 실측을 별도 섹션.
8. **원본 유지 증거:** \`git status --porcelain\` 시작과 종료 비교, 제품/계약/로그 변경 경로 0.
9. **결론:** 구현 HANDOFF 발행이 가능한지, 아직 빠진 실측·위험·별도 설계 결정 사항.

**반복 고지:** 본 문서는 새로운 구현 HANDOFF가 아니다. 제품 코드 변경, 기존 \`HANDOFF.md\` 교체, \`main\` merge/push 및 A2 수용 선언 불가.
