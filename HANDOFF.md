# HANDOFF — A2 v2 I2c async HTTP 기록 최소 실행 검증

- Action: VERIFY_ONLY
- From: Sol / GPT-6 (기술 판단·패치 작성·최종 검토)
- To: 로컬 CLI (명령 실행·실측·원 오류 회신만)
- 날짜: 2026-10-16 KST
- GitHub: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
- 브랜치: work/phase3-2c-a2-v2-implementation
- 개발 clone: C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal
- Product: clone 내 ShiftMgmt_V4/
- **발행 commit 40자리**: 사용자 중계 메시지에 제공되는 정확한 원격 GitHub HEAD.
- 원본 상태: 본 실행 전에 사용자 CLI가 제출한 I2b exported-parser 9조건 PASS/RC0 인정. I2b probe **재실행 금지**.
- 허용 작업: clean clone fast-forward pull, 읽기/해시/Node 구문 검사, clone 외부 새 스크래치 파일에 적힌 아래 단일 Node stub 테스트.
- 완료 정의: 새 I2c 소스 4개 SHA/bytes 일치, node --check 2건 RC0, 실제 negative export installNormalObserver().fetch의 정상/JSON실패/네트워크실패 3조건 RC0 또는 있는 그대로 BLOCKED.
- 실제 browser runScreenCheck callback, 8 normal, A1 gate, 112 real fault, I1 T10는 모두 UNVERIFIED 유지.

## 1. 원본과 범위 보호

제품 코드, 계약, 로그, 원래 Windows 고정 제품 디렉터리 C:\Projects\Active\ShiftMgmt_V4 (기존 dirty12), 교대근무관리 시스템, ShiftMgmt_V3.4는 전부 쓰기 금지. npm install/update, Git commit/push/reset/clean/stash/rebase, 원 코드 개조/테스트 약화 금지.

원래 서비스 또는 127.0.0.1:18741 포트에 요청하거나 서버를 시작하지 않는다. 테스트 URL은 가짜 fetch 객체에 **문자열로만** 전달한다. 실제 타 프로세스 종료 불가.

## 2. Git HEAD와 SHA 확인

PowerShell:

~~~powershell
$Root='C:\Projects\Active\_a2_v2_workspace\Shiftmgmt_Renewal'
$Product=Join-Path $Root 'ShiftMgmt_V4'
git -C $Root fetch origin
git -C $Root branch --show-current
git -C $Root status --porcelain=v1
git -C $Root rev-parse origin/work/phase3-2c-a2-v2-implementation
git -C $Root config --local --get core.autocrlf
~~~

원격 HEAD가 사용자 중계 발행 SHA와 동일하고 clone status clean, branch 정확, core.autocrlf=false인 경우에만:

~~~powershell
git -C $Root pull --ff-only
git -C $Root rev-parse HEAD
git -C $Root status --porcelain=v1
$Files=@('access-history.mjs','access-history-shared.mjs','access-history-positive.mjs','access-history-negative.mjs')
foreach($n in $Files) {
  $f=Join-Path $Product "scripts/ui-checks/$n"
  "$n | $((Get-Item -LiteralPath $f).Length) bytes | $((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash)"
}
node --check (Join-Path $Product 'scripts/ui-checks/access-history-positive.mjs')
"POSITIVE_SYNTAX_RC=$LASTEXITCODE"
node --check (Join-Path $Product 'scripts/ui-checks/access-history-negative.mjs')
"NEGATIVE_SYNTAX_RC=$LASTEXITCODE"
~~~

예상 source (각 30,000B 이하):
- owner 29,351B / 2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7
- shared 29,973B / C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4
- positive 25,678B / B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D
- negative 28,986B / D1334B357B927DA4A4671E2A32D5B5005E8FFC53CFF54396D9B8F503F555BB0E

위 4개 SHA/크기 중 하나라도 다르거나 syntax RC != 0면 이후 작업 없이 BLOCKED 출력.

## 3. 격리 stub 시험 — 실제 exported 함수만 호출

**새 파일** C:\Projects\Active\_a2_v2_scratch\i2c_fetch_stub_probe.mjs 에 아래 JavaScript를 정확히 기록. 기존 파일이 존재하면 덮어쓰지 말고 BLOCKED_SCRATCH_EXISTS. 제품 clone 폴더 안에는 스크래치 파일 생성 금지.

~~~javascript
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const product = process.argv[2];
assert.ok(product, 'missing product root');
const moduleUrl = pathToFileURL(path.join(product, 'scripts/ui-checks/access-history-negative.mjs')).href;
const { installNormalObserver } = await import(moduleUrl);
const state = installNormalObserver({
  context: {
    repository: product,
    runDir: path.join(path.dirname(product), '_i2c_owned_scratch_only')
  },
  caseName: 'errors',
  contract: {},
  execution: {},
  nonceSha256: 'OWNED_TEST_VALUE',
  chromeInfo: { path: '', version: '' }
});

const previousFetch = globalThis.fetch;
const URL = 'http://127.0.0.1:18741/api/i2c-owned-string-only';
try {
  globalThis.fetch = async () => ({
    status: 200, ok: true,
    json: async () => { throw new SyntaxError('HARMLESS_INVALID_JSON_BODY'); }
  });
  const bad = await state.fetch(URL);
  assert.equal(bad.status, 200);
  assert.equal(bad.ok, false);
  assert.equal(bad.errorCode, 'A2_INVALID_JSON_BODY');
  assert.equal(state.errors.unexpected.at(-1)?.code, 'A2_INVALID_JSON_BODY');
  assert.equal(state.requests[0].status, 200);

  globalThis.fetch = async () => ({
    status: 403, ok: false,
    json: async () => ({ ok: false, errorCode: 'FORBIDDEN' })
  });
  const forbidden = await state.fetch(URL);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.errorCode, 'FORBIDDEN');
  assert.equal(state.rawErrors.badResponses.at(-1)?.requestId, state.requests[1].id);

  globalThis.fetch = async () => { throw new Error('HARMLESS_NETWORK_FAILURE'); };
  await assert.rejects(state.fetch(URL), /HARMLESS_NETWORK_FAILURE/);
  assert.equal(state.requests[2].status, 0);
  assert.equal(state.requests[2].ok, false);
  assert.ok(state.requests[2].endedAtMs >= state.requests[2].startedAtMs);

  console.log(JSON.stringify({
    result: 'I2C_NODE_FETCH_PROBE_PASS',
    casesPassed: 3,
    actualExportUsed: true,
    pid: process.pid,
    firstBodyFailureCode: bad.errorCode,
    secondRealStatus: forbidden.status,
    thirdNoResponseStatus: state.requests[2].status,
    errorsRecorded: state.errors.unexpected.length
  }));
} finally {
  globalThis.fetch = previousFetch;
}
~~~

실행:

~~~powershell
$Probe='C:\Projects\Active\_a2_v2_scratch\i2c_fetch_stub_probe.mjs'
node --check $Probe
"PROBE_SYNTAX_RC=$LASTEXITCODE"
node $Probe $Product
"PROBE_RUNTIME_RC=$LASTEXITCODE"
Get-FileHash -LiteralPath $Probe -Algorithm SHA256
git -C $Root status --porcelain=v1
~~~

기대: probe syntax RC0, runtime RC0, stdout result=I2C_NODE_FETCH_PROBE_PASS, casesPassed=3, git clean. 세 번째 가짜 network 실패는 원 함수의 비정상 응답을 정상 성공으로 오인하지 않는지만 검증함. **실제 localhost로 HTTP 요청하면 범위 위반**.

## 4. 보고 — 간결하게

- SETUP_PASS / STATIC_PASS / NODE_FETCH_PROBE_PASS 또는 BLOCKED
- origin/head 전체 40자리, branch, Git clean 전후 및 core.autocrlf
- 4개 source bytes/SHA 전체64자리, node check 2개 RC
- probe source SHA/Node RC/stdout JSON/stderr 원인만
- 기존 parser9 및 pending probe 재실행: NO
- 원본 Windows 12파일·계약·source/서버/브라우저 및 GitHub 미변경: YES/NO
- **Positive 응답 이벤트/JSON 완료와 브라우저 계측은 이번에 실행하지 않았으므로 UNVERIFIED.** A1/8normal/112negative/전체 A2도 UNVERIFIED.

문제 발생 시 추론·자가수정·fallback PASS 금지. 원 stderr와 오류 코드/경로를 그대로 보고. GitHub push 금지.

---

## 회신

본 채팅을 통해 결과만 전달하며 HANDOFF.md 파일은 편집하지 않는다.
