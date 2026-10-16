# HANDOFF — A2 v2 I3b 최신 partial 상태 검증

- **Action: VERIFY_ONLY** — Sol이 작성한 소스 및 검증 스크립트를 Windows에서 측정만 함
- From: Sol / GPT-6 (설계·패치·검증 판단)
- To: Local Windows CLI (코드 수정·해석·설계 금지)
- Date: 2026-10-16 KST
- **Project root: C:\Projects\Active\ShftMgmt_Renewal**
- Branch: work/phase3-2c-a2-v2-implementation
- GitHub expected HEAD: 이 HANDOFF 발행 후 사용자가 중계하는 SHA 전체 40자리
- Product: 프로젝트 내부 ShiftMgmt_V4
- Probe (Git-tracked): .ai/work/phase3-2c-a2-v2/probes/i3b_partial_checkpoint_smoke.mjs
- Previous I3 READER 1+9 Smoke = user-reported PASS; 본 작업에서 반복하지 않음
- Old handoff byte-exact archive: Log/20261016_I3_READER_SMOKE_COMPLETED_before_I3B.md
- Status: I3B_STATIC_SOURCE_READY / WINDOWS_RUNTIME_PENDING / A2_NOT_ACCEPTED

## 1. 목적과 범위

실제 worker source의 초기/종료시 partial checkpoint 구조와 실제 exported `installNormalObserver().updatePartial()` 동작만 검증. 프로젝트 루트에서 스크립트 1회 실행. 합성 state 두 케이스에서 초기 JSON 작성→실패 요청/오류·종료 시각 변이→다시 JSON 작성 후 원본 SHA 변경과 변경된 내용 보존을 확인함.

**절대 금지:** 다른 작업 폴더, legacy C:\Projects\Active\ShiftMgmt_V4의 기존 dirty 12, C:\Projects\Active\교대근무관리 시스템 계약, V3.4 접근/수정, 코드/계약/프로브 edit, package.json/lock 수정, npm install/ci 재실행, Git commit/push/switch/reset/clean/stash/read-tree/rebase, Chrome/18741 서버/HTTP, Python gate, 기존 I1/I2/I3 smoke 재시험. 글로벌·로컬 Git 설정 변경 금지. 임시 synthetic JSON은 이미 스크립트가 Windows OS temp에 새 디렉터리로 기록하므로 제품/프로젝트 안 파일 쓰기 금지.

## 2. 환경/브랜치/Git 경계 확인

PowerShell:

~~~powershell
$Root = 'C:\Projects\Active\ShftMgmt_Renewal'
$Branch = 'work/phase3-2c-a2-v2-implementation'
$Product = Join-Path $Root 'ShiftMgmt_V4'
$Probe = Join-Path $Root '.ai\work\phase3-2c-a2-v2\probes\i3b_partial_checkpoint_smoke.mjs'
$Expected = '<사용자 중계 이번 발행 HEAD 40자리>'
$MainExpected = 'c21aa263a02e57d57949bafc5aefe06aab582acd'
$Actual = (git -C $Root rev-parse --show-toplevel) -replace '\\','/'
if ($Actual -ne ($Root -replace '\\','/')) { throw "BLOCKED: wrong repo root $Actual" }
$Origin = git -C $Root remote get-url origin
if ($Origin -notmatch 'github\.com[:/]Cnthoth-Plus-Projects/Shiftmgmt_Renewal(\.git)?$') { throw 'BLOCKED: origin' }
if ((git -C $Root branch --show-current) -ne $Branch) { throw 'BLOCKED: branch' }
if ((git -C $Root rev-parse refs/heads/main) -ne $MainExpected) { throw 'BLOCKED: main changed' }
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: starting worktree dirty' }
git -C $Root fetch origin
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: fetch failure' }
$RemoteHead = git -C $Root rev-parse "refs/remotes/origin/$Branch"
if ($RemoteHead -ne $Expected) { throw "BLOCKED: remote head $RemoteHead" }
git -C $Root pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: ff-only pull failure' }
if ((git -C $Root rev-parse HEAD) -ne $Expected) { throw 'BLOCKED: local HEAD differs' }
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: worktree dirty after pull' }
~~~

기존 성공한 I3 설치 환경을 그대로 이용한다. **node_modules가 없거나 필요 패키지가 resolve되지 않으면 BLOCKED**. 자체 npm 설치/다른 클론 사용 금지. `git ls-files --eol`로 아래 6개 파일이 `i/lf w/lf attr/text eol=lf`인지 확인하고, 하나라도 다르면 다시 restore/checkout-index/read-tree하지 말고 BLOCKED.

## 3. SHA·구문 검문

다음 파일의 실제 Windows working-tree bytes와 SHA-256을 `Get-Item .Length`, `Get-FileHash -Algorithm SHA256`으로 전수 확인:

| File (프로젝트 상대 경로) | Bytes | SHA-256 |
|---|---:|---|
| ShiftMgmt_V4/scripts/ui-checks/access-history.mjs | 29520 | 6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22 |
| ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs | 29973 | C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4 |
| ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs | 25725 | 5E76A04AFD4BB661E438C234921C53EE431530298564C1A5F524A37B26D9FE9E |
| ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs | 29923 | 0677F5D94EE04A5144C8555EE717938DBCD1D4C2C18764DD2E98109ECFE87F57 |
| .ai/work/phase3-2c-a2-v2/probes/i3_reader_smoke_v2.mjs | 4435 | 06D349660888B183B1D6706CAC5E6CF22E7062227294ABD852FB22F3CA5D78D7 |
| .ai/work/phase3-2c-a2-v2/probes/i3b_partial_checkpoint_smoke.mjs | 3556 | 4BC25171515E1A8F5A9A9C9F3C4A4374A807411F957099F4D70966DECAB3779B |

하나라도 불일치면 다음으로 진행하지 말고 BLOCKED.

~~~powershell
$Check = @(
  'ShiftMgmt_V4/scripts/ui-checks/access-history.mjs',
  'ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs',
  'ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs',
  'ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs',
  '.ai/work/phase3-2c-a2-v2/probes/i3_reader_smoke_v2.mjs',
  '.ai/work/phase3-2c-a2-v2/probes/i3b_partial_checkpoint_smoke.mjs'
)
git -C $Root ls-files --eol -- $Check
foreach ($p in $Check) {
 $full = Join-Path $Root $p
 "$p | $((Get-Item -LiteralPath $full).Length) | $((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash)"
}
~~~

모든 SHA/EOL 일치가 **확인된 후에만**:

~~~powershell
Push-Location -LiteralPath $Root
try {
  foreach($n in @('access-history-positive.mjs','access-history-negative.mjs')) {
    node --check (Join-Path $Product "scripts/ui-checks/$n")
    "SYNTAX_RC[$n]=$LASTEXITCODE"
    if ($LASTEXITCODE -ne 0) { throw "BLOCKED: syntax $n" }
  }
  node --check $Probe
  "PROBE_SYNTAX_RC=$LASTEXITCODE"
  if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: smoke syntax' }
  node $Probe
  $rc = $LASTEXITCODE
  "PROBE_RUNTIME_RC=$rc"
  if ($rc -ne 0) { throw 'BLOCKED: smoke runtime' }
} finally { Pop-Location }
git -C $Root status --porcelain=v1
git -C $Root rev-parse HEAD
git -C $Root rev-parse refs/heads/main
~~~

기대 stdout: `result=I3B_PARTIAL_CHECKPOINT_HELPER_PASS`, `casesPassed=2`, `sourceCheckpoints=initial-and-finally`, `actualExportUsed=true`, synthetic TEMP dir 경로와 case별 서로 다른 SHA. stderr 0, RC0, Git Clean. **이는 helper·정적 source 위치의 합성 시험이지 실제 worker 비정상 종료/Owner 원 실행이 아니다.**

## 4. 결과 회신 (간단하고 정확하게)

SETUP_PASS | SHA_PASS | SYNTAX_PASS | I3B_HELPER_PASS 또는 BLOCKED; 로컬/원격 SHA 전체 40자리/branch/main 불변/Git Clean; 6개 파일 전체 SHA와 bytes, EOL 상태, 3개 구문 RC, smoke RC/stdout JSON/stderr 및 OS temp 경로. `read-tree` 등의 승인되지 않은 Git 명령은 **이번 작업에서 사용하지 말 것**. 이전 현장 실행에서 `read-tree`를 수행했다는 보고는 변경하지 않고 이력 그대로 유지.

**I3 전체/A2 전체 ACCEPTED 판정 금지.**

---

## 회신

루트 HANDOFF.md/GitHub 파일을 로컬에서 수정하지 말고 본 대화로 실행 결과만 보고.
