# HANDOFF — A2 v2 I2 관측값 무결성: 실행 확인 전용

- Task: I2 원 HTTP 상태 및 요청-응답 연결 패치에 대한 **최소 Windows 실행 확인**
- **Action: VERIFY_ONLY** (제품 코드 구현·수정 불허)
- From: Sol / GPT-6 (코드 수정·설계·판정 담당)
- To: 로컬 CLI (기계적 실행·측정만 담당)
- Date: 2026-10-16 KST
- Repository: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- Branch: `work/phase3-2c-a2-v2-implementation`
- Local development clone: `C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal`
- Product path: clone 안 `ShiftMgmt_V4`
- **발행 HEAD:** 사용자에게 전달되는 새 HANDOFF 발행 커밋의 전체 40자를 별도 프롬프트로 확인.
- 변경 소스 기준: Sol이 제출한 `I2_RAW_OBSERVATION_STATIC_REVIEW_20261016.md`와 아래 고정 SHA.
- 이전 `Action: CORRECT` 응답은 `Log/20261016_A2V2_I1_CORRECT1_before_I2_VERIFY.md`에 Git blob 동일하게 봉인.
- **보호:** 과거 `C:\Projects\Active\ShiftMgmt_V4`의 dirty12, `교대근무관리 시스템` 기획 계약, `ShiftMgmt_V3.4`, GitHub main/old A2 v1 분기 모두 변경 금지.

## 1. 금지

- 새 GitHub Clone 안의 제품·계약 코드 편집, lint auto-fix, npm upgrade, package.json/lockfile 수정 금지.
- 원 Windows 제품/계약 폴더 파일 덮어쓰기, 서버 시작, 18741 포트 강제 점유, 타 프로세스 종료, 112 벡터 통과 선언 금지.
- git commit/push/merge/reset/clean/stash 금지. **예외: clean clone 상태에서 이 HANDOFF를 가져오는 `git fetch`와 `git pull --ff-only`만 허용.**
- 이전 I1 T1~T9 전체 재실행 불필요; 이번에는 원 HTTP pending 보존 probe 1개 및 syntax·SHA만 실행.

## 2. 시작 상태·원격 HEAD 확인

Windows PowerShell:

```powershell
$Root = 'C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
$Product = Join-Path $Root 'ShiftMgmt_V4'
git -C $Root fetch origin
git -C $Root branch --show-current
git -C $Root status --porcelain=v1
git -C $Root rev-parse HEAD
git -C $Root rev-parse origin/work/phase3-2c-a2-v2-implementation
git -C $Root config --local --get core.autocrlf
```

확인 조건:
- 원격 전체 HEAD는 사용자 메시지에 있는 **발행 커밋**과 일치해야 함.
- 브랜치는 정확히 `work/phase3-2c-a2-v2-implementation`, 초기 status Clean, `core.autocrlf=false`.
- 위 조건이 충족된 경우에만 `git -C $Root pull --ff-only`; 이후 HEAD·Clean 재검증. 다르면 `BLOCKED`와 측정값만 반환.

## 3. SHA·크기·구문만 측정

```powershell
$Files = @(
  'scripts/ui-checks/access-history.mjs',
  'scripts/ui-checks/access-history-shared.mjs',
  'scripts/ui-checks/access-history-positive.mjs',
  'scripts/ui-checks/access-history-negative.mjs'
)
foreach ($n in $Files) {
  $p = Join-Path $Product $n
  $f = Get-Item -LiteralPath $p
  "$n | $($f.Length) bytes | $((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash)"
}
node --check (Join-Path $Product 'scripts/ui-checks/access-history-positive.mjs')
"POSITIVE_CHECK_RC=$LASTEXITCODE"
node --check (Join-Path $Product 'scripts/ui-checks/access-history-negative.mjs')
"NEGATIVE_CHECK_RC=$LASTEXITCODE"
git -C $Root status --porcelain=v1
```

Sol GitHub 기준 (단 한 글자라도 다르면 중단):
- owner: `29,351B / 2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7`
- shared: `29,973B / C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4`
- positive: `23,830B / E9D668F40D11EB5597B018A67BB9A07BE40251E63AE7CCFCF549A72AAFE39DB0`
- negative: `28,618B / 8735993CF111922294EB9D4963194242EFA174FCFC77F1141C0A85E42859D21D`
- **구문 검사 기대 RC0**. 이는 문법 검증이며 제품 실동작 PASS는 아님.

 - **I2 추가 완료:** `computeExpectedErrors`는 미응답 status0을 완료된 DATABASE_ERROR fixture로 분류하지 않도록 `status>0`을 요구한다. 해당 조건 또한 실제 Windows 런타임 검증 전에는 STATIC_ONLY.

## 4. 단일 격리 pending 관측 probe

- 아래 **기입된 코드 그대로** 새 scratch `C:\Projects\Active\_a2_v2_scratch\i2_probe.mjs`에 작성.
- 기존 같은 파일이 존재하면 덮어쓰지 말고 `BLOCKED_SCRATCH_EXISTS` 보고.
- 해당 probe는 실제 `access-history-negative.mjs`의 `publishNormalEvidence` export를 import해 호출한다.
- 실제 제품 또는 역사적 원본에는 쓰지 않음. own scratch 아래 새 RUN_ID의 JSON 2개만 기록.
- 계약 로더가 참조하는 **기존 CRLF exact-locked 계약은 읽기만 가능**. 파일이 없거나 SHA가 틀리면 BLOCKED, 계약을 수정하지 말 것.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [productRoot, scratchRoot] = process.argv.slice(2);
if (!productRoot || !scratchRoot) throw new Error('I2 probe args missing');
fs.mkdirSync(scratchRoot, { recursive: true });
process.chdir(scratchRoot);
const { publishNormalEvidence } = await import(
  pathToFileURL(path.join(productRoot, 'scripts/ui-checks/access-history-negative.mjs')).href
);
const runId = `run-i2-${process.pid}-${Date.now()}`;
const dir = path.join(scratchRoot, 'artifacts/captures/phase3', 'access-history-list-fixture', runId);
if (fs.existsSync(dir)) throw new Error('runDir collision');
fs.mkdirSync(dir, { recursive: true });
const time = Date.now();
const common = { source: 'page', method: 'GET', url: 'http://127.0.0.1:18741/api/i2-probe', startedAtMs: time, ok: false, errorCode: null };
const state = {
  case: 'list-fixture',
  runId,
  environment: { origin: 'http://127.0.0.1:18741' },
  steps: { enteredAtMs: time, completedAtMs: null },
  requests: [
    { ...common, id: 1, status: 0, endedAtMs: null },
    { ...common, id: 2, status: 403, endedAtMs: time + 1 }
  ],
  rawErrors: { console: [], pageerror: [], requestfailed: [], badResponses: [] },
  diagnostics: [],
  contextSha256: 'I2_SCRATCH_ONLY_NOT_REAL_CONTEXT'
};
publishNormalEvidence(state);
const rawPath = path.join(dir, 'normal-observations.json');
const wfPath = path.join(dir, 'worker-final.json');
const rawBytes = fs.readFileSync(rawPath);
const raw = JSON.parse(rawBytes);
const wf = JSON.parse(fs.readFileSync(wfPath));
assert.equal(raw.requests[0].status, 0);
assert.equal(raw.requests[0].endedAtMs, null);
assert.equal(raw.requests[1].status, 403);
assert.equal(raw.requests[1].endedAtMs, time + 1);
assert.equal(wf.status, 'FAIL_INCOMPLETE');
assert.equal(wf.rawSha256, crypto.createHash('sha256').update(rawBytes).digest('hex').toUpperCase());
console.log(JSON.stringify({
  result: 'I2_PENDING_PRESERVED',
  runId,
  pendingStatus: raw.requests[0].status,
  pendingEndedAtMs: raw.requests[0].endedAtMs,
  realStatus: raw.requests[1].status,
  workerFinalStatus: wf.status,
  rawSha256: wf.rawSha256,
  localEvidenceDir: dir
}, null, 2));
process.exitCode = 0;
```

PowerShell에서 원본 붙여넣기는 `@' ... '@` here-string 사용. 파일 작성 직후 probe 자체 SHA-256 전체값을 기록. 실행:

```powershell
$Scratch = 'C:\Projects\Active\_a2_v2_scratch'
$Probe = Join-Path $Scratch 'i2_probe.mjs'
# 새 Probe 파일을 위 JavaScript 코드로 정확히 작성한 뒤
node $Probe $Product $Scratch
"PROBE_RC=$LASTEXITCODE"
Get-FileHash -LiteralPath $Probe -Algorithm SHA256
git -C $Root status --porcelain=v1
```

기대 출력 `I2_PENDING_PRESERVED`, `pendingStatus=0`, `pendingEndedAtMs=null`, `realStatus=403`, `workerFinalStatus=FAIL_INCOMPLETE`, `PROBE_RC=0`. output이 다르면 PASS로 바꾸지 말고 실제 stdout/stderr 출력만 보고.

주의: 이 probe는 helper의 원 pending 값을 유지하는지만 확인한다. Playwright의 Request 객체 중복 URL, async drain, 실제 Chrome viewport, 원 A1 gate, 8 normal, 원 112벡터 실행 **안 함**.

## 5. 회신

**필수 보고만**:
- `SETUP_PASS | STATIC_PASS | PROBE_PASS | BLOCKED` 개별 상태
- 원격 발행 HEAD와 로컬 HEAD 각각 40자, 시작/종료 git status clean, `core.autocrlf=false`
- 4개 source 정확한 bytes/64자리 SHA
- 두 `node --check` RC
- probe 실행 정확한 Node RC, 대표 JSON stdout, scratch script/evidence 경로와 SHA
- 실제 오류가 있으면 stderr를 비밀·개인정보 없이 원문 그대로
- GitHub에 쓰기/Push 하지 않음, 원본 Windows 두 폴더·legacy12 미변경
- `I1 T10 / 원 A1 / Chrome / 8normal / 112negative` = **UNVERIFIED** 유지
- 자가 분석·디자인 수정·문서 장문 반복 작성 불필요

**Sol 판정 전 `I2_ACCEPTED`, `A2_ACCEPTED` 주장 금지.**

---

## 회신

(로컬 실행 뒤 사용자 대화로만 결과를 제출. 본 파일 또는 GitHub 수정 금지.)
