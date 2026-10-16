# HANDOFF — A2 v2 I2b 원 RPC 파서 확인

- Task: I2b **VERIFY_ONLY** — 실제 exported parser 호출 및 source SHA·syntax 측정
- **Action: VERIFY_ONLY / NO_PRODUCT_WRITES**
- From: Sol (GPT-6): 설계, 소스 패치, 독립 판단
- To: 로컬 CLI: 명시적 Node 명령 및 결과 수집만
- Date: 2026-10-16 KST
- Repo: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- Branch: `work/phase3-2c-a2-v2-implementation`
- Local Git clone: `C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal`
- Product: 위 clone의 `ShiftMgmt_V4`
- GitHub HEAD: 사용자 중계 프롬프트에 제시한 **발행 HEAD 40자리**와 실제 origin/branch가 같아야 함.
- 변경 내용: 실제 Playwright page.viewportSize/page.url 기록, 실제 RPC Request.postDataJSON 검증. Sol이 이미 GitHub 코드 반영.
- 기존 I2 pending probe는 사용자 실측 **PASS**를 수용. **이전 테스트를 반복하지 말 것.**
- 과거 `HANDOFF.md`는 `Log/20261016_A2V2_I2_PENDING_VERIFY_before_I2B_VERIFY.md`에 바이트 동일 보존.

## 1. 변경 금지

- 기존 Windows `C:\Projects\Active\ShiftMgmt_V4`의 dirty 12개 및 `교대근무관리 시스템`, `ShiftMgmt_V3.4` 원본 전부 read-only.
- 새로운 clone의 제품파일, 테스트파일, `.ai/contracts`, Log, HANDOFF, package/lock 변경 금지. npm update/install도 이번에는 금지. 테스트 스크립트는 **clone 바깥 전용 scratch** 한 곳에만 생성.
- Git commit/push/merge/rebase/stash/reset/clean 금지. clean일 때 이 HANDOFF 수신 목적의 `fetch`/ `pull --ff-only`만 허용.
- 기존 UI server, localhost:18741 강제 점유, 실제 브라우저 가동, 타 프로세스 kill, 과거 제품 4파일 overlay, false PASS 금지.
- 원 112 음성벡터, A1 gate, 8 normal, I1 T10, 실제 browser viewport는 모두 UNVERIFIED.

## 2. Git 및 소스 검사

PowerShell:

```powershell
$Root = 'C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
$Product = Join-Path $Root 'ShiftMgmt_V4'
git -C $Root fetch origin
git -C $Root branch --show-current
git -C $Root status --porcelain=v1
git -C $Root rev-parse origin/work/phase3-2c-a2-v2-implementation
git -C $Root config --local --get core.autocrlf
```

원격 HEAD는 user message의 **발행 HEAD**, 브랜치 일치, initial status clean, core.autocrlf=false 조건이 전부 충족될 때만:

```powershell
git -C $Root pull --ff-only
git -C $Root rev-parse HEAD
git -C $Root status --porcelain=v1
node --check (Join-Path $Product 'scripts/ui-checks/access-history-positive.mjs')
"CHECK_POSITIVE_RC=$LASTEXITCODE"
node --check (Join-Path $Product 'scripts/ui-checks/access-history-negative.mjs')
"CHECK_NEGATIVE_RC=$LASTEXITCODE"
```

필수 실제 bytes/SHA-256:
- owner: 29,351B, `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7`
- shared: 29,973B, `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4`
- positive: 24,141B, `AFD06A0E1CD11F0160E63290C72CDBF1C1235349E146CBE9603F28DF7F2DB469`
- negative: 28,753B, `3D13EBC741439ADA3F24D43797C51E525DC821A05516DEC9CD902C0AC23D47D3`

실제로 `Get-Item .Length`와 `Get-FileHash -Algorithm SHA256`를 이용해 전수 측정. 값 불일치, 구문 검사 RC!=0, status dirty면 **BLOCKED**, 원인 추정·자동 수정 금지.

## 3. 실제 export 함수 한 개에 대한 스크래치 probe

새 scratch 파일:
`C:\Projects\Active\_a2_v2_scratch\i2b_parser_probe.mjs`

이름이 이미 있으면 덮지 말고 `BLOCKED_SCRATCH_EXISTS`로 반환. 코드 아래 그대로 작성 (repo 안에 파일 생성 금지).

```javascript
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const product = process.argv[2];
assert.ok(product, 'missing product path');
const moduleUrl = pathToFileURL(path.join(product, 'scripts/ui-checks/access-history-negative.mjs')).href;
const { parseNormalBridgeQuery } = await import(moduleUrl);
let successes = 0;
function check(name, body, expected, errorPattern = null, hasMethod = true) {
  let jsonCalls = 0, rawCalls = 0;
  const req = { postData() { rawCalls++; return JSON.stringify(body); } };
  if (hasMethod) req.postDataJSON = () => {
    jsonCalls++;
    if (body === 'THROW') throw new SyntaxError('HARMLESS_PARSER_SYNTAX');
    return body;
  };
  if (errorPattern) assert.throws(() => parseNormalBridgeQuery(req), errorPattern, name);
  else assert.deepEqual(parseNormalBridgeQuery(req), expected, name);
  assert.equal(jsonCalls, hasMethod ? 1 : 0, name + ': postDataJSON calls');
  assert.equal(rawCalls, 0, name + ': raw postData calls');
  successes++;
}
const full = { dateFrom: '2026-10-01', dateTo: '2026-10-16', loginId: 'all', actionType: 'all', keyword: 'sample' };
check('valid-full', [full], full);
check('valid-zero-arg', [], null);
check('valid-empty-object', [{}], {});
check('reject-unknown-key', [{ unknown: 'x' }], null, /invalid query field/);
check('reject-invalid-type', [{ keyword: 7 }], null, /invalid query field/);
check('reject-wrong-shape', { keyword: 'a' }, null, /invalid RPC argument array/);
check('reject-extra-arg', [{ keyword: 'a' }, {}], null, /invalid RPC argument array/);
check('reject-missing-api', [{ keyword: 'a' }], null, /postDataJSON unavailable/, false);
check('reject-postDataJSON-error', 'THROW', null, /HARMLESS_PARSER_SYNTAX/);
console.log(JSON.stringify({ result: 'I2B_PARSER_PROBE_PASS', casesPassed: successes, pid: process.pid }));
```

기존 사용자 작업 내용이 없음을 확인하고 새 scratch 파일만 만든 뒤:

```powershell
$Probe = 'C:\Projects\Active\_a2_v2_scratch\i2b_parser_probe.mjs'
node --check $Probe
"PROBE_SYNTAX_RC=$LASTEXITCODE"
node $Probe $Product
"PROBE_RUNTIME_RC=$LASTEXITCODE"
Get-FileHash -LiteralPath $Probe -Algorithm SHA256
git -C $Root status --porcelain=v1
```

기대: probe 구문/실행 RC 0, JSON `result=I2B_PARSER_PROBE_PASS`, `casesPassed=9`, clean. **실제 exported 함수**를 호출해야 하며, 별도 모조 parser를 만들어 PASS하면 무효. 실패하면 raw stdout/stderr 및 RC 그대로 전달.

## 4. 최종 회신만 제출

- 구분: `SETUP_PASS / STATIC_PASS / PARSER_PROBE_PASS / BLOCKED`
- git remote/local HEAD 전체 40자·branch/status/core.autocrlf
- 4개 파일 실측 bytes/전체 SHA-256, 두 `node --check` RC
- probe 스크립트 경로/전체 SHA/RC/stdout JSON, stderr 메시지
- 기존 I2 pending probe 재실행 여부 **NO**
- clone 내부 파일 수정 0, original Windows dirty 12 및 원 계약 변경 0, GitHub commit/push 0
- 실제 Playwright viewport/async response/body drain/Chrome/A1/8 normal/112negative: **UNVERIFIED**
- 자가 기술 분석·설계·문제 수정 금지; 오류 시 BLOCKED와 실제 명령 출력만

**Sol의 별도 독립 판정 전 전체 A2 수용 선언 금지.**

---

## 회신

본 채팅에 붙여넣을 결과만 작성하며 이 HANDOFF 파일 자체는 수정하지 않는다.
