# HANDOFF — A2 v2 I3 환경 차단 해제 및 Reader Smoke

- **Action: VERIFY_ONLY (명시적으로 허가된 환경 복구 포함, 제품 소스 구현 금지)**
- Date: 2026-10-16 KST
- From: Sol / GPT-6 — 설계·허용 범위·판정
- To: Windows 로컬 CLI — 기계적인 점검·설치·실행·측정만
- Repository: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- **유일한 프로젝트 루트:** C:\Projects\Active\ShftMgmt_Renewal
- Branch: work/phase3-2c-a2-v2-implementation
- 사용자로부터 확인된 초기 상태: Git 루트 일치, 브랜치 전환 성공, local HEAD 4cef82cd5a91dd8a5a0e28addd007b2a78681caf, Git Clean, main SHA c21aa263a02e57d57949bafc5aefe06aab582acd (불변).
- 사용자 보고 환경 문제: 글로벌 core.autocrlf=true에 따른 검증기/스크립트 checkout CRLF, node_modules 부재로 "Cannot find package 'playwright'".
- 해당 이슈의 **교정 목적:** 실제 프로젝트의 검증기 5파일을 Git HEAD LF 원문 바이트로 복구하고, 잠금 파일에 고정된 npm 패키지를 **제품 프로젝트 내부의 Git-ignored node_modules에만** 설치해 단일 I3 Reader Smoke 실행.
- 기존 금지였던 npm 설치 / 프로젝트 working-tree 파일 재체크아웃은 **본 지시서에 적힌 정확한 방법과 5개 경로에 한해서만 새로 허가**. 나머지는 여전히 금지.
- 이전 차단 당시 HANDOFF: Log/20261016_I3_BLOCKED_DEPENDENCY_EOL_before_ENV_REPAIR.md (원문 동일 Git blob 보관)
- 제출 판정: **I3_RUNTIME_UNVERIFIED**, 이번 검증이 통과하기 전 PASS 선언 금지.

## 1. 절대 보호

- **GitHub main, 기존 A2 v1 보존 브랜치** 변경/merge/push 금지. 로컬 refs/heads/main SHA도 전후 동일이어야 함.
- 외부 원본 C:\Projects\Active\ShiftMgmt_V4 및 C:\Projects\Active\교대근무관리 시스템, V3.4, 기존 dirty 12파일은 **읽기/쓰기/overlay 금지**.
- \`.ai/contracts/**\` 및 실제 운영 파일, 재료 데이터·DB·계정·원 계약은 재체크아웃/변환/수정 금지. 원래 CRLF SHA 계약을 LF로 바꾸는 행위 금지.
- Node 설치 파일, npm 또는 Git 버전 업데이트 금지. npm 패키지 임의 버전 변경, \`npm install\`, \`npm audit fix\`, \`npx playwright install\`, Chrome 다운로드/브라우저 실행 금지.
- \`git reset\`, \`git clean\`, \`git stash\`, \`git rebase\`, \`git commit\`, \`git push\`, force, 기존 프로세스 kill, 18741 HTTP/서버 접근 금지.
- source patch/refactor/테스트 코드 수정 금지. 후속 단계에 필요한 승인 없는 광범위 \`git restore .\`/전체 repo checkout 금지.
- 중간에 실패하면 자동 복구, 재설치/재실행 반복 없이 \`BLOCKED\`로 종료하고 원 명령/RC/stderr/실측을 회신.

## 2. 준비 및 GitHub 발행 HEAD 확인

아래 명령은 Windows PowerShell 사용. \`$Expected\`에 **사용자가 전달한 이번 HANDOFF 발행 HEAD 전체 40자리**를 실제로 넣어야 한다. 원격과 다르면 중단한다.

~~~powershell
$Root = 'C:\Projects\Active\ShftMgmt_Renewal'
$Branch = 'work/phase3-2c-a2-v2-implementation'
$Expected = '<이번 발행 HEAD 40자리>'
$Product = Join-Path $Root 'ShiftMgmt_V4'
$Probe = Join-Path $Root '.ai\work\phase3-2c-a2-v2\probes\i3_reader_smoke_v2.mjs'
$MainBefore = 'c21aa263a02e57d57949bafc5aefe06aab582acd'
$ActualRoot = (git -C $Root rev-parse --show-toplevel) -replace '\\','/'
if ($ActualRoot -ne ($Root -replace '\\','/')) { throw "BLOCKED: Git root $ActualRoot" }
$Origin = git -C $Root remote get-url origin
if ($Origin -notmatch 'github\.com[:/]Cnthoth-Plus-Projects/Shiftmgmt_Renewal(\.git)?$') { throw "BLOCKED: origin $Origin" }
if ((git -C $Root branch --show-current) -ne $Branch) { throw 'BLOCKED: branch' }
if ((git -C $Root rev-parse refs/heads/main) -ne $MainBefore) { throw 'BLOCKED: main moved' }
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: initial dirty worktree' }
git -C $Root fetch origin
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: fetch failed' }
$RemoteHead = git -C $Root rev-parse "refs/remotes/origin/$Branch"
if ($LASTEXITCODE -ne 0 -or $RemoteHead -ne $Expected) { throw "BLOCKED: remote HEAD $RemoteHead" }
git -C $Root pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: fast-forward failed' }
if ((git -C $Root rev-parse HEAD) -ne $Expected) { throw 'BLOCKED: current HEAD' }
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: post-pull dirty' }
~~~

## 3. CRLF 차단 해제 (오직 다섯 파일만)

기준: repo에 \`.gitattributes\` 없음(원격 조회 기준); 로컬 글로벌 core.autocrlf=true가 Git **working-tree**만 CRLF로 만들었다. Git HEAD blob들은 LF이고 정상 Git diff는 Clean이다. 이 단계는 코드 변경이 아니라 **원래 HEAD 내용의 5개 파일을 LF로 재물질화**한다. 파일 bytes는 변하므로 이를 반드시 회신에 명시한다.

허용하는 **닫힌 목록**:
1. ShiftMgmt_V4/scripts/ui-checks/access-history.mjs
2. ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs
3. ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs
4. ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs
5. .ai/work/phase3-2c-a2-v2/probes/i3_reader_smoke_v2.mjs

위 다섯 파일 외에는 checkout 또는 전자서명·개행 변환 금지.

~~~powershell
$Paths = @(
  'ShiftMgmt_V4/scripts/ui-checks/access-history.mjs',
  'ShiftMgmt_V4/scripts/ui-checks/access-history-shared.mjs',
  'ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs',
  'ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs',
  '.ai/work/phase3-2c-a2-v2/probes/i3_reader_smoke_v2.mjs'
)
foreach($p in $Paths) {
  $attr = git -C $Root check-attr eol -- $p
  if ($attr -match 'eol: crlf') { throw "BLOCKED: EOL attribute forces CRLF: $p" }
  if (-not (Test-Path -LiteralPath (Join-Path $Root $p) -PathType Leaf)) { throw "BLOCKED: missing $p" }
}
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: dirty before LF restore' }
git -C $Root config --local core.autocrlf false
if ($LASTEXITCODE -ne 0 -or (git -C $Root config --local --get core.autocrlf) -ne 'false') { throw 'BLOCKED: local autocrlf config' }
git -C $Root -c core.autocrlf=false restore --source=HEAD --worktree -- $Paths
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: 5-file LF restore failed' }
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: tracked diff after LF restore' }
git -C $Root ls-files --eol -- $Paths
~~~

**정확한 5개 LF 바이트 SHA** (각각 모두 일치해야 다음으로):
- owner: 29,520B / 6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22
- shared: 29,973B / C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4
- positive: 25,678B / B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D
- negative: 29,898B / BEF4014A83E03FB97C1CA4886898A1787811AC25CCB75F82D7B2DF5EDD83F8FA
- I3 smoke: 4,435B / 06D349660888B183B1D6706CAC5E6CF22E7062227294ABD852FB22F3CA5D78D7

~~~powershell
$ExpectedFiles = @(
 @{p=$Paths[0];bytes=29520;sha='6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22'},
 @{p=$Paths[1];bytes=29973;sha='C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4'},
 @{p=$Paths[2];bytes=25678;sha='B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D'},
 @{p=$Paths[3];bytes=29898;sha='BEF4014A83E03FB97C1CA4886898A1787811AC25CCB75F82D7B2DF5EDD83F8FA'},
 @{p=$Paths[4];bytes=4435;sha='06D349660888B183B1D6706CAC5E6CF22E7062227294ABD852FB22F3CA5D78D7'}
)
foreach ($f in $ExpectedFiles) {
  $full = Join-Path $Root $f.p
  $gotBytes = (Get-Item -LiteralPath $full).Length
  $gotSha = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
  "$($f.p) | $gotBytes | $gotSha"
  if ($gotBytes -ne $f.bytes -or $gotSha -ne $f.sha) { throw "BLOCKED: LF byte/hash mismatch $($f.p)" }
}
~~~

## 4. Playwright 잠금 버전 설치 (오직 Git-ignored 제품 node_modules)

GitHub source 확인: \`ShiftMgmt_V4/package.json\`에 \`playwright: ^1.58\`; \`ShiftMgmt_V4/package-lock.json\`에 **정확히 playwright 1.63.0**, lockfile v3; Node engines >=24 <25. \`ShiftMgmt_V4/.gitignore\`는 \`node_modules/\`를 무시함. Node v24.13.0 / npm 11.6.2 사용자 실측과 호환.

**이 단계에서는 npm ci 1회만 허가**. package.json/lock 변경 허용하지 않음. 기존 node_modules가 없다라는 사용자 실측을 다시 확인하여 없을 때만 진행 (존재 시 npm ci는 해당 트리를 삭제할 수 있으므로 BLOCKED). \`--ignore-scripts\`와 browser-download skip으로 설치 훅·Playwright Browser 다운로드 금지. 원격 레지스트리 연결 불가/다운로드 실패면 다른 패키지 매니저·사용자 원본 node_modules 복사로 우회 금지.

~~~powershell
if (Test-Path -LiteralPath (Join-Path $Product 'node_modules')) { throw 'BLOCKED: node_modules already exists; npm ci could delete it' }
$PackagePath = Join-Path $Product 'package.json'
$LockPath = Join-Path $Product 'package-lock.json'
$PackageBefore = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash
$LockBefore = (Get-FileHash -LiteralPath $LockPath -Algorithm SHA256).Hash
$Version = node --version
if ($LASTEXITCODE -ne 0 -or $Version -notmatch '^v24\.') { throw "BLOCKED: Node version $Version" }
$PrevSkip = $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
try {
  Push-Location -LiteralPath $Product
  try {
    npm ci --ignore-scripts --no-audit --no-fund --no-progress
    $NpmRC = $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  if ($null -eq $PrevSkip) { Remove-Item Env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD -ErrorAction SilentlyContinue }
  else { $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = $PrevSkip }
}
"npm_ci_RC=$NpmRC"
if ($NpmRC -ne 0) { throw 'BLOCKED: npm ci failed' }
if ((Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash -ne $PackageBefore) { throw 'BLOCKED: package.json changed' }
if ((Get-FileHash -LiteralPath $LockPath -Algorithm SHA256).Hash -ne $LockBefore) { throw 'BLOCKED: package-lock.json changed' }
if (@(git -C $Root status --porcelain=v1).Count -ne 0) { throw 'BLOCKED: npm changed tracked files' }
Push-Location -LiteralPath $Product
try {
  node --input-type=module -e "import('playwright').then(()=>console.log('PLAYWRIGHT_PACKAGE_RESOLVES'))"
  $ImportRC = $LASTEXITCODE
} finally { Pop-Location }
if ($ImportRC -ne 0) { throw 'BLOCKED: playwright import failed' }
~~~

## 5. 실행 — 기존 I3 smoke만 1회

~~~powershell
Push-Location -LiteralPath $Root
try {
  foreach($n in @('access-history.mjs','access-history-positive.mjs','access-history-negative.mjs')) {
    node --check (Join-Path $Product "scripts/ui-checks/$n")
    "SYNTAX_RC[$n]=$LASTEXITCODE"
    if ($LASTEXITCODE -ne 0) { throw "BLOCKED: syntax $n" }
  }
  node --check $Probe
  "PROBE_SYNTAX_RC=$LASTEXITCODE"
  if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: probe syntax' }
  node $Probe
  $ProbeRC = $LASTEXITCODE
  "PROBE_RUNTIME_RC=$ProbeRC"
  if ($ProbeRC -ne 0) { throw 'BLOCKED: I3 runtime error' }
} finally { Pop-Location }
git -C $Root status --porcelain=v1
git -C $Root rev-parse HEAD
git -C $Root rev-parse refs/heads/main
~~~

기대: \`I3_READER_SMOKE_PASS\`, \`validAccepted=1\`, \`invalidRejected=9\`, \`source=actual-export\`, \`PROBE_RUNTIME_RC=0\`, final Git Clean, \`main=c21aa263...\` 불변. Smoke는 제품 소스 모듈을 가져오지만 실제 브라우저/HTTP를 시작하지 않고 합성 JSON을 Windows OS TEMP(프로젝트 밖)에 작성함.

## 6. 최소 결과 회신

- \`SETUP_PASS / EOL_PASS / DEPENDENCY_PASS / I3_SMOKE_PASS\` 또는 \`BLOCKED\`.
- 프로젝트 루트, local/remote HEAD 40자리, branch, main 전후 SHA, Git Clean 시작/끝, \`core.autocrlf\` local/global 최종값.
- LF로 복구된 5개 소스/스크립트의 bytes/전체 SHA, \`git ls-files --eol\` 결과.
- \`npm ci\` RC, 설치 후 \`playwright\` import RC, package/lock 해시 불변 확인. **node_modules 자체는 Git-ignored**.
- \`node --check\` 4개 RC, smoke RC/stdout JSON/stderr, 임시 evidence 경로.
- 기존 I1/I2/I2b/I2c 시험 재실행 NO. 기존 외부 제품 dirty12/계약/Chrome/Python gate/8 normal/112 negative 미변경·미실행.
- 오류 시 코드·계약·패키지 lock을 수정하지 말고 실제 RC/stderr를 보고. 전체 I3/A2 수용 선언 금지.

---

## 회신

실제 실행값만 이 대화에 붙여넣고 GitHub \`HANDOFF.md\`는 수정하지 않는다.
