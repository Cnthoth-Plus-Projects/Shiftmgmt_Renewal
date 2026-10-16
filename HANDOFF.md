# HANDOFF — A2 v2 I3 Reader 프로젝트 내 검증 (경로 정정본)

- **Action: VERIFY_ONLY**
- From: Sol (GPT-6): 설계·구현·검수
- To: Windows CLI: 현장 측정 및 결과 회신만
- 작업 등급: economy — 기존 구현의 SHA·syntax 및 격리 Reader 검증
- Date: 2026-10-16 KST
- Repository: `Cnthoth-Plus-Projects/Shiftmgmt_Renewal`
- **유일한 로컬 프로젝트 루트: `C:\Projects\Active\ShftMgmt_Renewal`**
- Branch: `work/phase3-2c-a2-v2-implementation`
- GitHub 발행 HEAD: 사용자 중계 메시지에 기재된 정확한 40자리 SHA와 비교
- Product: `C:\Projects\Active\ShftMgmt_Renewal\ShiftMgmt_V4`
- **검증 스크립트 (프로젝트에 tracked): `C:\Projects\Active\ShftMgmt_Renewal\.ai\work\phase3-2c-a2-v2\probes\i3_reader_smoke_v2.mjs`**
- 과거 잘못된 별도 clone / 외부 scratch **스크립트 경로는 폐기**. 기존 HANDOFF 전체는 `Log/20261016_I3_OLD_WORKSPACE_HANDOFF_before_project_path_fix.md`에 원 blob으로 보존.
- 상태: I3_STATIC_READY / PROJECT_WINDOWS_RUNTIME_UNVERIFIED / A2_NOT_ACCEPTED.

## 1. 작업 경계

- 실행은 **정확히 위 프로젝트의 Git 루트에서** 진행. 루트가 아닌 곳에서 상대경로로 Node 시작 금지.
- CLI는 구현/분석/테스트 설계 하지 않음. 원본 제공 스크립트 그대로 실행하고 오류 발생 시 보고.
- 코드·계약·HANDOFF·Log·package/lock·GitHub 원격 직접 수정 금지; Git push/reset/clean/stash/rebase/merge/npm install 금지.
- 원본 `C:\Projects\Active\ShiftMgmt_V4`와 `C:\Projects\Active\교대근무관리 시스템`, V3.4 및 기존 12 dirty 파일은 모두 무변경.
- 실제 Chrome, 18741 서버/HTTP, 제품 overlay, 다른 PID 종료 금지.
- 스크립트는 **프로젝트 안에 이미 버전관리된 파일**이다. 별도로 다운로드/복사/덮어쓰기/생성할 필요 없음.
- **스크립트의 합성 결과**만 Windows OS 임시 디렉터리(프로젝트 Git worktree 바깥)에 남긴다. 테스트가 Git 작업 트리에 파일을 만들면 STOP, 제거·clean하지 말고 보고.

## 2. 선행 검사 및 동기화

PowerShell:

```powershell
$Root = 'C:\Projects\Active\ShftMgmt_Renewal'
$Branch = 'work/phase3-2c-a2-v2-implementation'
$Product = Join-Path $Root 'ShiftMgmt_V4'
$Probe = Join-Path $Root '.ai\work\phase3-2c-a2-v2\probes\i3_reader_smoke_v2.mjs'
# 반드시 먼저 확인: Test-Path $Root, git -C $Root rev-parse --show-toplevel
git -C $Root branch --show-current
git -C $Root status --porcelain=v1
git -C $Root rev-parse HEAD
git -C $Root config --local --get core.autocrlf
git -C $Root fetch origin
git -C $Root rev-parse "origin/$Branch"
```

실행 조건 전부 필수:
1. `git rev-parse --show-toplevel`가 정확히 `$Root`를 가리킴.
2. 현재 브랜치가 정확히 `$Branch`, 시작 `git status --porcelain=v1`가 **비어 있음**.
3. 원격 HEAD 전체 40자리 SHA가 사용자가 중계한 이 HANDOFF 발행 SHA와 정확히 같음.
4. Git 이력이 fast-forward로만 적용 가능.
5. `core.autocrlf=false`이거나 소스 파일의 실제 checkout 바이트가 아래 고정 SHA와 같음. 설정 임의 변경 금지.

조건 실패 시 **BLOCKED** 및 실제 출력만 회신. 기존 프로젝트의 브랜치·dirty 파일을 자동으로 switch/reset/stash/clean하지 말 것.

조건 통과 후에만:

```powershell
git -C $Root pull --ff-only
git -C $Root rev-parse HEAD
git -C $Root status --porcelain=v1
```

## 3. 소스 및 스크립트 검문

고정 기준 SHA-256/bytes (기존 I3 제품 기준 변함없음):

| 실제 프로젝트 내부 파일 | Bytes | SHA-256 |
|---|---:|---|
| `ShiftMgmt_V4/scripts/ui-checks/access-history.mjs` | 29,520 | `6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22` |
| `ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs` | 29,973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` |
| `ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs` | 25,678 | `B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D` |
| `ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs` | 29,898 | `BEF4014A83E03FB97C1CA4886898A1787811AC25CCB75F82D7B2DF5EDD83F8FA` |
| `.ai/work/phase3-2c-a2-v2/probes/i3_reader_smoke_v2.mjs` | 4,435 | `06D349660888B183B1D6706CAC5E6CF22E7062227294ABD852FB22F3CA5D78D7` |

직접 측정:

```powershell
$SourceNames = @('access-history.mjs','access-history-shared.mjs','access-history-positive.mjs','access-history-negative.mjs')
foreach ($n in $SourceNames) {
  $p = Join-Path $Product "scripts/ui-checks/$n"
  "$n | $((Get-Item -LiteralPath $p).Length) bytes | $((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash)"
}
"PROBE_SIZE=$((Get-Item -LiteralPath $Probe).Length)"
"PROBE_SHA=$((Get-FileHash -LiteralPath $Probe -Algorithm SHA256).Hash)"
```

모든 5개 실제 bytes/SHA가 고정값과 일치하지 않으면 STOP. 임의 CRLF/LF 변환·재저장 금지.

## 4. 실행 — 반드시 해당 프로젝트에서

```powershell
Push-Location -LiteralPath $Root
try {
  foreach ($n in @('access-history.mjs','access-history-positive.mjs','access-history-negative.mjs')) {
    node --check (Join-Path $Product "scripts/ui-checks/$n")
    "SYNTAX_RC[$n]=$LASTEXITCODE"
  }
  node --check $Probe
  "PROBE_SYNTAX_RC=$LASTEXITCODE"
  # 위 node --check 4개 모두 RC0인 경우에만 다음을 실행
  node $Probe
  "PROBE_RUNTIME_RC=$LASTEXITCODE"
} finally {
  Pop-Location
}
git -C $Root status --porcelain=v1
```

기대: syntax 검사 4개 RC0, 실행 RC0, `I3_READER_SMOKE_PASS`, `validAccepted=1`, `invalidRejected=9`, `source=actual-export`, stdout의 `projectRoot` = `$Root`, 결과 디렉터리는 Windows OS 임시 폴더.

**기능 설명:** 스크립트는 프로젝트 안의 실제 `readNormalWorkerEvidence`를 호출하고 합성 raw/worker-final 1개 정상·9개 오류를 검증한다. 계약 JSON 구조는 **같은 프로젝트의 `.ai/contracts/`에서 읽기만 한다**. A1 잠금 계약의 CRLF/SHA 검증 자체는 이 smoke 시험 범위가 아니며, 고정 원본 계약이나 Shared 모듈을 수정하지 않는다.

## 5. 결과 제출

원격/로컬 HEAD 전체 SHA, 시작/종료 브랜치·git clean, core.autocrlf, 4개 제품 파일+스크립트 bytes/SHA, 4개 syntax RC, 실행 RC/stdout/stderr, 결과 JSON에 포함된 synthetic 임시 디렉터리 경로를 원문 그대로 전달.

- 이전 I1/I2/I2b/I2c 시험 반복하지 않음.
- 기존 원본/계약/로컬 프로젝트 파일을 수동 수정하지 않음.
- 이번 격리 시험은 실제 Owner↔Worker IPC, Chrome, A1 게이트, 정상 8개, 원 음성 112개를 검증하지 않음. 그 결과는 모두 **UNVERIFIED**.
- STOP 발생 시 코드를 임의 수정/재실행하여 PASS로 만들지 말고 `BLOCKED`와 원 오류를 보고.

---

## 회신

현재 작업은 GitHub 문서 수정이 아닌 Windows 실행 결과만 채팅으로 제출.
