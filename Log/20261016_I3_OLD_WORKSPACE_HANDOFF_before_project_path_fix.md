# HANDOFF — A2 v2 I3 Reader 격리 검증

- **Action: VERIFY_ONLY**
- From: Sol (GPT-6): 분석·구현·검증 설계·수용 결정
- To: Windows 로컬 CLI: 정해진 명령 실행·실측 결과 회신만
- Date: 2026-10-16 KST
- Repo: `Cnthoth-Plus-Projects/Shiftmgmt_Renewal`
- Branch: `work/phase3-2c-a2-v2-implementation`
- Local clone: `C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal`
- Product: clone 내부 `ShiftMgmt_V4`
- **발행 HEAD:** 사용자가 중계하는 전체 40자 GitHub 커밋과 origin이 일치할 때만 시작
- Source I3: normal reader에서 실제 raw SHA/PID/case/runId/context/contract/coverage 검문, 잘못된 case/diagnostics 구조 거부, normal partial 경로/해시 보존.
- 이전 `Action: HOLD` 지시서는 `Log/20261016_A2V2_I3_HOLD_before_VERIFY_ONLY.md`에 원문 보존.
- 상태: **I3_STATIC_READY / WIN_TEST_NOT_RUN / A2_NOT_ACCEPTED**

## 절대 보호/중단

- 원본 `C:\Projects\Active\ShiftMgmt_V4`의 12 dirty 파일, `교대근무관리 시스템` 원 계약, `ShiftMgmt_V3.4` 수정 금지.
- 별도 개발 clone의 제품/계약/HANDOFF/Log/package/lock 변경 금지.
- Git reset/stash/clean/rebase/commit/push/merge 금지. Clean 확인 후 `git fetch`와 `git pull --ff-only`만 허용.
- npm install, localhost:18741 HTTP 요청, Chrome/서버 가동, 과거 제품 코드 임시 overlay, 타 PID 종료 금지.
- 기존 I1, I2, I2b, I2c 검사 **반복 금지**.
- 안전한 독립 시험 스크립트는 **이 대화에서 Sol이 제공한 `i3_reader_smoke_v1.mjs`(3902B, SHA-256 `06F4B9DF8B767CF1C6F8E58FE3E231216540ECF0412E07A7B8C8EB92740F7003`)**만 사용. 로컬 `C:\Projects\Active\_a2_v2_scratch`에 새 파일로 저장; 기존 파일이 있으면 덮어쓰지 않고 BLOCKED. 스크립트 원문 변형/테스트 약화 금지.

## 1. 사전확인 / ff-only

PowerShell 명령:

```powershell
$Root='C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
$Product=Join-Path $Root 'ShiftMgmt_V4'
$Scratch='C:\Projects\Active\_a2_v2_scratch'
$Probe=Join-Path $Scratch 'i3_reader_smoke_v1.mjs'
git -C $Root fetch origin
git -C $Root branch --show-current
git -C $Root status --porcelain=v1
git -C $Root rev-parse origin/work/phase3-2c-a2-v2-implementation
git -C $Root config --local --get core.autocrlf
```

원격 HEAD = 사용자 중계 40자, branch 정확, git Clean, `core.autocrlf=false` 확인 후에만:

```powershell
git -C $Root pull --ff-only
git -C $Root rev-parse HEAD
git -C $Root status --porcelain=v1
$N=@('access-history.mjs','access-history-shared.mjs','access-history-positive.mjs','access-history-negative.mjs')
foreach($n in $N) {
  $p=Join-Path $Product "scripts/ui-checks/$n"
  "$n | $((Get-Item -LiteralPath $p).Length) bytes | $((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash)"
}
foreach($n in @('access-history.mjs','access-history-positive.mjs','access-history-negative.mjs')) {
  node --check (Join-Path $Product "scripts/ui-checks/$n")
  "NODE_SYNTAX_$n=$LASTEXITCODE"
}
```

### 고정 SHA·크기 (모두 일치해야 다음으로)

- owner `29,520B / 6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22`
- shared `29,973B / C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4`
- positive `25,678B / B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D`
- negative `29,898B / BEF4014A83E03FB97C1CA4886898A1787811AC25CCB75F82D7B2DF5EDD83F8FA`

3개 구문 검사 RC0, 모든 크기·SHA 일치가 아니면 **BLOCKED** 보고 후 중단.

## 2. 신규 isolated Reader smoke

아래 명령은 사용자가 공유한 원본 변경 없는 `i3_reader_smoke_v1.mjs` 파일이 **새 scratch 위치에 배치된 뒤에만** 실행. 없음/기존 덮어쓰기 충돌/스크립트 SHA 불일치 시 BLOCKED.

```powershell
(Get-Item -LiteralPath $Probe).Length
(Get-FileHash -LiteralPath $Probe -Algorithm SHA256).Hash
node --check $Probe
"SMOKE_SYNTAX_RC=$LASTEXITCODE"
node $Probe $Product $Scratch
"SMOKE_RUNTIME_RC=$LASTEXITCODE"
git -C $Root status --porcelain=v1
```

기대: 스크립트 3902B/고정 SHA, syntax RC0, runtime RC0, JSON `result=I3_READER_SMOKE_PASS`, `validAccepted=1`, `invalidRejected=9`, `source=actual-export`, git Clean. 발생 오류는 실제 stderr 및 RC만 제출. 실패한 테스트 코드/제품 코드를 CLI가 자체 수정하면 안 됨.

**한계:** 이 probe는 합성 원시 JSON과 실제 Reader export의 입력 검증만 확인. 실제 owner/worker 서명·Chrome/SDK 관측, Python gate, 원 112 음성벡터, 정상 8개·A1 회귀는 여전히 **UNVERIFIED**. I3 전체 PASS/A2 수용 선언 금지.

## 3. 결과 회신

SETUP_PASS/STATIC_PASS/SMOKE_PASS 또는 BLOCKED; origin/HEAD 전체 40자/브랜치/Clean/core.autocrlf; 4파일 전체 SHA/bytes; node --check 3개 RC; 스크립트 SHA/size/RC/JSON stdout/stderr; scratch 생성한 경로; Git push/원본 Windows 수정 0; 기존 시험 재실행 NO.

---

## 회신

명령 출력만 본 대화에 반환하고 GitHub의 HANDOFF를 직접 변경하지 않음.
