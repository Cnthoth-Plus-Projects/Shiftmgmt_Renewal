# -*- coding: utf-8 -*-
"""Publish Sol-owned IMPLEMENT packet; preserve the received HANDOFF first."""
from datetime import datetime,timedelta,timezone
import hashlib,importlib.util,json,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT=Path(__file__).resolve().parent;CTRL=DOC/'.ai/contracts/phase3-2c-a1-v3'
spec=importlib.util.spec_from_file_location('prepare_controls',REPORT/'prepare-controls.py');PREP=importlib.util.module_from_spec(spec);spec.loader.exec_module(PREP)
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def record(path):
 data=path.read_bytes();return {'bytes':len(data),'sha256':sha(data)}
def dump(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
initial=json.loads((REPORT/'initial-evidence.json').read_text(encoding='utf-8'))
source=PREP.product_snapshot();assert source==initial['sourceBefore'],'Product drift; stop'
for name,expected in initial['originalControls'].items():assert record(Path(name))==expected,'Original control drift: '+name
received=(DOC/'HANDOFF.md').read_bytes();assert sha(received)==initial['receivedSha256'] and len(received)==initial['receivedBytes']
assert Path(initial['archive']).read_bytes()==received
validation=json.loads((REPORT/'control-validation.json').read_text(encoding='utf-8'));assert validation['status']=='PASS'
# Repeat cheap control checks before locking. No product tests/build are run here.
for p in CTRL.glob('*.py'):compile(p.read_text(encoding='utf-8'),str(p),'exec')
for p in CTRL.glob('*.mjs'):subprocess.run(['node','--check',str(p)],check=True,capture_output=True)
stamp=datetime.now(timezone(timedelta(hours=9)));display=stamp.strftime('%Y-%m-%d %H:%M:%S KST');file_stamp=stamp.strftime('%Y%m%d_%H%M%S')
plan=f'> **최신 정본({display})**: 사용자 「응 다음 작업 진행하자」에 따라 **3-2c-A1 실행 전략 v3 IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기**. 제어 도구 실제35·기록변조9 거절, 구문/판정 parser 확인. 두 검증파일만 수정 허용·339파일/frozen helper/원본v1·v2 보호. 정확 gate 응답·실측 raw·child/log 종료·partial 첫 실패를 새 지시서로 고정했다. Sol제품수정0·source341/main/HEAD/status12 불변. Gemini 새 구현/실제A1 수용은 아직미실행; 기존 A1_NOT_ACCEPTED·R32C-06 두 회수 소진/초기화0 유지. A2/B/배포완료는 대기. 정본 `.ai/contracts/phase3-2c-a1-v3/`, 현재 `HANDOFF.md`. 아래이전정본은이력.'
todo_path=DOC/'TODO.md';old_todo=todo_path.read_text(encoding='utf-8');todo=old_todo
todo=todo.replace('> 최종 갱신: 2026-10-01 · 관리:', '> 최종 갱신: 2026-10-12 · 관리:',1)
anchor='## 지금 위치와 다음 행동\n\n';assert anchor in todo;todo=todo.replace(anchor,anchor+plan+'\n\n',1)
todo=todo.replace('**Phase3-2c-A1 독립검수 FAILED / A1_NOT_ACCEPTED·Sol 검수도구 결함 확인·재설계 필요.**','**Phase3-2c-A1 v3 IMPLEMENT READY_TO_CODE·Gemini 중계 대기 / A1_NOT_ACCEPTED 유지.**',1)
lines=todo.splitlines()
for i,line in enumerate(lines):
 if line.startswith('| **다음 행동** |'):lines[i]='| **다음 행동** | 현재 HANDOFF를 Gemini에 수동 전달→허용된 검증기2파일 구현→Sol 독립 검수. A1 수용 후 A2 정상8/남은음성조건, 이후 B87을 별도 진행. |'
 elif line.startswith('  - 🔄 3-2c.'):lines[i]='  - 🔄 3-2c. 기존 FAILED/REPLAN/R32C-06 이력 유지. 사용자 진행 승인(2026-10-12)→A1 실행 전략 v3 IMPLEMENT READY_TO_CODE. CORE9/fullUI87 원계약 유지, 제품341/보호339/검증기2파일만 허용. A2/B/전체3-2 수용 대기. 근거 `.ai/contracts/phase3-2c-a1-v3/STRATEGY.md` / 현재 `HANDOFF.md`.'
 elif line.startswith('    - ⏸ 3-2c-A.'):lines[i]='    - 🔄 3-2c-A. A1 v3 전략·검수 도구 준비 / Gemini 중계 대기. 제어35/변조9 검증은 도구 증거이며 A1_NOT_ACCEPTED 유지. 새 구현/양성3+관측양성3/음성38/IPC14+port/typed collector/partial·생성종료 소스 검수는 앞으로 수행. R32C-06 기존2회 소진·초기화0; A2 정상8/남은A-N01~20/B87 보존. 직전 실패 근거 `Log/20261002_105849_3-2c-A1-Sol-FAILED_독립검수종결본.md`.'
todo='\n'.join(lines)+'\n';todo_path.write_text(todo,encoding='utf-8')
state_path=DOC/'.ai/current-state.md';state=state_path.read_text(encoding='utf-8')
assert state.startswith('# Current Project State\n\nStatus: ')
old_section=state.split('\n\n',2)[2]
current=f'''# Current Project State

Status: PHASE_3_2C_A1_V3_IMPLEMENT_READY_FOR_USER_RELAY_NOT_ACCEPTED

## Current task — A1 v3 IMPLEMENT packet ready ({display})

- User 「응 다음 작업 진행하자」 authorizes the next A1 replan/packet. Sol owns strategy/control documents; Gemini remains sole product writer/manual relay. No product edits, AI CLI, commit, push or deployment by Sol.
- Received closed A1 review HANDOFF archived unchanged at {initial['archive']}; {initial['receivedBytes']} bytes/{initial['receivedSha256']}, byte verification PASS. Existing Log and v1/v2 controls unchanged.
- New control folder .ai/contracts/phase3-2c-a1-v3: observer isolated FD/nonce/hash chain, exact failure receipts, measured core/typed immutable collector, actual child/log settlement before temp deletion, complete gate-response binding, partial first-error evidence. Closed allowlist2; all other339 product files and shared frozen6575bytes remain protected.
- Actual control canaries/current-SUT public preflight35 and corrupt event rejection9 PASS. Python compile3/Node syntax4/parser and plan commands PASS. These prove control readiness only. Full new SUT suite38 faults, uninstrumented3+observed3 positive cases, IPC14+port and expanded component tests are future Gemini/Sol verification, not accepted today.
- Source341/main/HEAD {source['head']}/status12 unchanged vs Oct2 independent review. Existing A1_NOT_ACCEPTED, R32C-06 two exhausted corrections and reset0 retained. New packet is IMPLEMENT strategy replacement. A2 normal8/login/partial/remaining original A-N01~20, B87, full3-2 and release remain pending.
- Exact controls/initial hashes, command outputs and observer receipt: .ai/reports/phase3-2c-a1-replan-20261012_110625. New baseline locks this approved TODO/state and controls for Gemini. Do not update validation targets while the outgoing request is open.
- Routing frontier Sol; Luna inventory evidence and balanced gpt-6-sol fallback review for unavailable Terra independently checked. MCP surface inspected, no MCP call failure. Required verification/replan policies applied. No skill/other AI invocation.

Earlier entries below are historical and do not override this entry.

'''
state_path.write_text(current+old_section,encoding='utf-8')
execution=json.loads((CTRL/'execution.json').read_text(encoding='utf-8'))
old_baseline=json.loads((DOC/'.ai/contracts/phase3-2c-a1-v2/baseline.json').read_text(encoding='utf-8'))
control_paths={Path(name) for name in old_baseline['control']}
control_paths.update(Path(name) for name in initial['originalControls'])
control_paths.update(p for p in CTRL.iterdir() if p.is_file() and p.name!='baseline.json')
control_paths.add(REPORT/'observer-selfcheck-result.json')
baseline={**source,'time':stamp.isoformat(),'allowed':execution['allowed'],
 'control':{str(p):record(p) for p in sorted(control_paths)},'previousReview':str(DOC/'.ai/reports/phase3-2c-a1-review-20261002_103904/final-evidence.json'),
 'stageSlice':'A1','acceptance':execution['acceptance'],'retryHistory':execution['retryHistory']}
assert not (CTRL/'baseline.json').exists();dump(CTRL/'baseline.json',baseline)
baseline_sha=record(CTRL/'baseline.json')['sha256'];execution_sha=record(CTRL/'execution.json')['sha256'];gate_sha=record(CTRL/'gate-evidence.py')['sha256']
manifest={str(p):record(p) for p in sorted(CTRL.iterdir()) if p.is_file()}
dump(REPORT/'control-manifest.json',manifest)
status_text='\n'.join(source['status'])
control_table='\n'.join(f'| `{Path(name).name}` | {v["bytes"]} | `{v["sha256"]}` |' for name,v in manifest.items())
allowed_table='\n'.join(f'| `{name}` | {source["files"][name]["bytes"]} | `{source["files"][name]["sha256"]}` |' for name in execution['allowed'])
# Sol-authored code strategy is embedded so the handoff remains self-contained.
strategy=(CTRL/'STRATEGY.md').read_text(encoding='utf-8').split('## E3-01:',1)[1].split('## 독립 검증 순서',1)[0]
strategy='### E3-01:'+strategy.replace('\n## E3-','\n### E3-')
packet=rf'''# HANDOFF — Phase3-2c A1 실행 전략 v3

- Task: 검증기 실제 관측·종료·gate 판정 결합을 구현하여 A1의 허위 성공을 차단한다.
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: {display}
- 상태: READY_TO_CODE / 사용자 수동 중계 대기
- 회신: 필요
- Repository: `{REPO}`
- Branch: `{source['branch']}`
- Baseline commit: `{source['head']}`
- Expected initial status: 아래 정확한12경로. 기존 사용자 변경을 보존한다.

```text
{status_text}
```

# 회신 요청

누가: Gemini. 어디에: 이 파일 맨 아래 `## 회신` 칸만. 언제: 착수 게이트 충돌이면 수정 없이 즉시 BLOCKED, 그 외 구현·검증 후. 회신 없으면 Sol 검수와 다음 단계가 중단된다. 본문·TODO·정본·Log를 수정하지 않는다.

## 1. 목표

원본 CORE-01~09와 보호 shell/home 회귀가 실측 증거·실제 child/log 종료·고정 외부 Python 판정을 모두 만족한 경우에만 owner가 단일 PASS를 게시하게 한다. 오류 주입은 정확한 원인/사건/첫 오류를 확인한 FAIL이어야 한다.

## 2. 비목표

- A2 정상8 로그인/legacy collector/남은 A-N01~20 구현, B 전체UI87/전체3-2 수용, 배포와 커밋.
- UI·모델·API·권한·DB·의존성·빌드 설정·새 제품 파일 변경. 보호 회귀 runner의 재작성.
- 같은 R32C-06의 CORRECT3 또는 재제출 회수 초기화.

## 3. 현재 상태와 근거

TODO의 최신 상태는 A1 v3 IMPLEMENT 준비다. 기존 A1_NOT_ACCEPTED 판정은 유지한다. Oct2 제출은 Sol preload의 append 재귀 때문에 일부 검증이 막혔고, Sol이 결함을 재현해 인정했다. 검수 복사본의 기존24 fault가 통과해도 원 구현은 gate case 변조에 RC0/PASS, wrong ACK에서 worker close보다 temp 삭제가4,917ms 빠른 동작, 부정 raw 수용/가변 checks, viewport/origin/requestcount 상수, 생성 전 created, 미관측 log finish, partial 누락을 보였다.

추적 ID: A1T01 observer 재귀, A1T02 건강하지 않은 rc1 수용, A1F01 gate 전체 응답 미결합, A1F02 정리 순서, A1F03 실제 관측/자원, A1F04 collector, A1F05 log finish, A1F06 partial/primary, A1F07 hash/privateCLI. 원 실패 근거 `.ai/reports/phase3-2c-a1-review-20261002_103904/final-evidence.json` 및 Oct2 종결 Log. R32C-06 두 CORRECT 소진/초기화0 이력을 보존한다. 이번은 새 실행 전략 IMPLEMENT다.

실제 source341/main/HEAD/status12는 Oct2 검수본과 전부 동일하다. Sol은 이번에 제품 코드를 변경하지 않았다. 제어 도구의 실제35 시험·기록 변조9 거절 및 parser/구문은 확인했다. 이것은 새 구현 합격 증거가 아니다. received HANDOFF는 변경 전에 `{initial['archive']}`에 {initial['receivedBytes']} bytes/SHA `{initial['receivedSha256']}` 그대로 보존했고 byte 일치를 확인했다.

잠금 정본 폴더: `{CTRL}`. 전체339 보호제품/최초341파일 SHA는 `baseline.json`에 있다. 아래는 각 파일의 실측 전체 SHA다. 각 제어 파일은 Gemini 읽기 전용이다.

| 제어 파일 | bytes | SHA-256 |
|---|---:|---|
{control_table}

원본 contract: `{execution['originalContractPath']}` / SHA `{execution['originalContractSha256']}`.
원본 checker: `{DOC / '.ai/contracts/phase3-2c-v1/verify-evidence.py'}` / SHA `24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954`.

## 4. 수정 경계

### 4.1 수정 허용 — 닫힌 두 파일

| 제품 경로 | ID | 허용 변경 | 보호 영역 |
|---|---|---|---|
| scripts/ui-checks/access-history.mjs | E3-01/02/05/06 | lock/owner registry/정리/gate response/실패증거 | 정상8 실행·UI·보호 runner·새파일 금지 |
| scripts/ui-checks/access-history-shared.mjs | E3-01/03/04/06 | header lock/IPC/core collector·관측·정리/privateCLI | frozen 기존 정상8 helper 구간 보존 |

두 파일 각각30,000bytes 이하, 필요한 hunk만 변경. 전체재생성/무관 포맷/이름정리 금지. 두 파일의 초기 실측 SHA:

| 경로 | bytes | SHA-256 |
|---|---:|---|
{allowed_table}

### 4.2 읽기 전용

다른339 제품파일 전부, V3.4 전부, TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/07-invariants, `.ai/**`, `Log/**`. 기존 dirty12를 revert/삭제/commit하지 않는다. shared frozen fragment는 start `export const CANONICAL_8_ACTIONS =`, end `export async function performWorkerIpcHandshake` 직전, 6,575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`이다. 해당 helper의 알려진 정상8 결함은 A2에 남긴다.

### 4.3 제어 변경과 실행 산출물

HANDOFF의 맨 아래 회신 칸만 작성 가능. 기존 ignored `dist/`는 명시된 build에서 재생성 가능. 자기 `artifacts/captures/phase3/access-history-CASE/run-*`의 증거/partial/로그/PNG, 보호 regression runner의 자기 신규 ignored capture만 생성한다. Sol probe는 OS temp의 `shiftmgmt-sol-a1v3-*`와 자기 IPC probe artifact를 생성하며 그대로 보존한다. 신규 비ignored 파일/소스/테스트/정본 생성 금지. 이미 존재하는 Log/report/temp/artifact/PID/profile은 건드리지 않는다.

## 5. 요구사항 대조

| ID | 기대 결과 | 실패/경계 | 위치/결함 추적 |
|---|---|---|---|
| E3-01 | 원문 CLI·실제 정본 hash·frozen·port preflight | CLI/lock/port/deferred는 부작용0·정확 code | owner/shared / A1F07,A1T02 |
| E3-02 | 실제 child close→log finish/close→temp 제거 | 모든실패에서도 자기 child 종료, 관측없으면 temp보존 | owner registry / A1F02,A1F05 |
| E3-03 | DOM/route/실제Chrome/compiled map 및 immutable typed CORE9 | 부정 raw·중복자원·unknown/NaN 거절, partial 첫 오류 유지 | shared / A1F03,A1F04,A1F06 |
| E3-04 | protocol2 context/ACK/RUN 엄밀 검문 | field별12거절+noRUN/wrongRUN, HTTP/Chrome/파일쓰기0 | shared / A1F07 |
| E3-05 | 고정 Python의 실제 전체 응답과 candidate SHA 결합 | gate 응답10변조/rc/error/로그/finalwrite는 FAIL | owner / A1F01,A1F05 |
| E3-06 | 단일 terminal receipt와 actual partial primary stack | generic rc1/비건강 observer/partial유실은 수용불가 | owner/shared / A1F06,A1T01~02 |

## 6. Sol의 코드 전략 — 아래 순서대로 구현

기존 `loadContract/loadExecution`, owner runner/child 관리, shared frozen 구간 뒤 helper를 재사용한다. 보호 `scripts/ui-checks/shell.mjs`, `home.mjs --case=live-admin`, `scripts/lib/find-chrome.mjs`, 기존 createUniqueRunDir 호출을 유지한다. 데이터 정본은 원본v1 contract/rules·compiled accessLogActionLabels·v3 execution이다.

owner BASELINE/GATE와 shared EXECUTION 상수 경로를 v3로 바꾼다. BASELINE_SHA256=`{baseline_sha}`, GATE_SHA256=`{gate_sha}`, EXECUTION_SHA256=`{execution_sha}`. Python 절대경로는 `{execution['pythonExecutable']}`. source 안에 fault별 조건을 넣지 않는다. 최소 수정으로 기존 중복 child정리 부분을 한 등록부에 모은다.

{strategy}

## 7. 적용 불변조건과 과거 함정

CLAUDE/07-invariants의 의미 있는 오류·가짜UI 금지·실제 화면 검증·원본 V3/운영 데이터 보호를 유지한다. production DB/JSON에 테스트 insert 금지. 자기 bootstrap·temp만 쓴다. 실제 Chrome과1440x900, compiled 정본 map, fixture route와 raw 오류를 확인한다. worker verdict/존재만 하는 PNG/상수flags/generic rc1은 증명이 아니다. 전체 SHA는 명령으로 실측한다. 최초 오류를 다음 정리 실패로 덮어쓰지 않는다. 보호 shell/home 원본을 손보거나 expected를 완화하지 않는다.

## 8. 착수 전 확인

저장소/branch/fullHEAD/dirty12, source341 초기 SHA와 allowlist2/frozen fragment, 정본/control 전체 SHA를 확인하고 요구사항/소스/명령의 일관성을 읽는다. v3 baseline의 control 항목은 전부 실측 일치해야 한다. 현재 새 구현 전에는 source341 모두 baseline과 같아야 한다. 구현 뒤에는 허용2만 달라질 수 있다. 필수 Node24/Python/installedChrome/Playwright/npm이 없거나 gate --scope가 실패하면 수정 없이 BLOCKED다.

## 9. 검증 계획 — 제품 저장소에서 PowerShell로 실행

### 9.1 초기화와 범위 검사

```powershell
Set-Location -LiteralPath '{REPO}'
$a1Ctrl = '{CTRL}'
$a1Py = '{execution['pythonExecutable']}'
$a1ExeSha = '{execution_sha}'
$a1BaseSha = '{baseline_sha}'
$env:PYTHONIOENCODING = 'utf-8'
& $a1Py -B "$a1Ctrl\gate-evidence.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha --scope
```

기대rc0/PASS/files341/protected339/dirtyPaths12. 착수전 changedAllowed=[]; 구현뒤 두 허용파일만 바뀌고 보호SHA/control/status/HEAD 불변. 명령마다 `$LASTEXITCODE`와 시각/stdout/stderr를 실제 기록하고 실패면 후속수용을 중단한다.

### 9.2 정적·빌드·관련 시험

| 정확한 명령 | 기대 |
|---|---|
| `node --check scripts/ui-checks/access-history.mjs` | rc0 |
| `node --check scripts/ui-checks/access-history-shared.mjs` | rc0 |
| `npm.cmd run typecheck` | rc0 |
| `npm.cmd run lint` | rc0, 기존5경고만 기록, 신규경고0 |
| `npm.cmd run validate:map` | rc0, 기존90항목 |
| `git diff --check` | rc0 |
| `npm.cmd run build` | rc0, ignored dist만 |
| `npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | rc0, 3파일11시험 |

### 9.3 제어 parser와 실제 런타임

```powershell
& $a1Py -B "$a1Ctrl\gate-evidence.py" --execution-sha $a1ExeSha --self-test
& $a1Py -B "$a1Ctrl\runtime-probes.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha --self-test
$a1RuntimeLines = & $a1Py -B "$a1Ctrl\runtime-probes.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha
$a1RuntimeRc = $LASTEXITCODE
$a1RuntimeLines
if ($a1RuntimeRc -ne 0) {{ throw 'A1 actual runtime suite failed or UNVERIFIED_STOP' }}
$a1RuntimeResult = $a1RuntimeLines[-1] | ConvertFrom-Json
$a1Suite = Get-Content -LiteralPath (Join-Path $a1RuntimeResult.artifact 'suite-result.json') -Raw | ConvertFrom-Json
$a1Core = (($a1Suite.records | Where-Object name -eq 'positive-contract-core').output | ConvertFrom-Json).manifestPath
node "$a1Ctrl\ipc-probes.mjs"
node "$a1Ctrl\component-probes.mjs" --core-manifest $a1Core --execution-sha $a1ExeSha --baseline-sha $a1BaseSha
& $a1Py -B "$a1Ctrl\gate-evidence.py" --execution-sha $a1ExeSha --baseline-sha $a1BaseSha --scope
```

gate parserは原本2陽性/19拒否+追加14拒否、runtime parserは正常入力/10変造+earlytemp/unsettledlog拒否を要求する（제어/parser 증거만）. 실제 runtime은 scope→새 observer-selfcheck 자체 실행(35/변조9·record/event/hash검증)→무계측양성3/final3→관측양성3/final3→deferred8/CLI9→fault38→scope다. 시간초과 또는 observer 불건강이면 UNVERIFIED_STOP, rc1을 목표 결함 차단으로 세지 않는다. IPC는 actual14+port 및 독립 offlineChrome 진단이 모두 PASS여야 한다. component는 실제 양성core manifest 입력, 기존6+typed18+top-level4 및 실제 소유Chrome cleanup2를 요구한다.

### 9.4 실제 음성 조건과 오류 코드

`runtime-probes.py --list`의38개 이름/코드가 읽기 전용 정본이다. 원본 candidate 증거 변조14(png header/CRC, check ID 누락·중복·추가/expected/constant actual, raw4/canonical/worker·server close receipt)는 A1_GATE_REJECTED와 각 실제 gate reason이어야 한다. 서버·작업자 spawn/error, ACK/noACK/noRUN, gate spawn/log, 증거없는 회귀, final write, 실제 child close 비관측, log finish 비관측, late log error를 개별 확인한다. gate-response-case/runId/candidateSha256/executionSha256/checks/artifacts/acceptance/status/extra/extra-output10은 실제 original gate PASS 뒤 변조돼 A1_GATE_RESPONSE_MISMATCH여야 한다.

owner code 정본: {', '.join('`'+code+'`' for code in execution['ownerFailureCodes'])}.
private worker code: {', '.join('`'+code+'`' for code in execution['privateWorkerFailureCodes'])}.
각 실패는 단일JSON·정확code/case/runId·partial primary stack·trigger·건강한observer·actual quiescence를 함께 확인한다. private IPC context12 필드거절 및 noRUN/wrongRUN은 부작용0. private case 공백/추가args도 trim 없이 거절하는 소스를 확인한다.

### 9.5 UI·회귀·관측 출처 확인

실제 URL `{execution['url']}`, Chrome/1440x900. contract-core는 실제 로그인 DOM/compiled labels와 fixture 미요청 여부·PNG1·오류0·browser/context 생성/종료를 측정한다. 보호 shell 기존4capture와 home-live-admin1capture를 같은 owner 서버/worker 범위에서 재사용한다. 총 무계측3케이스6PNG와 별도 관측3케이스6PNG다. 원본 runner 실제 errors/checks/manifest를 엄밀히 gate가 판정한다. 원본 fullUI87을 축소하거나 정상8 완료로 주장하지 않는다.

Sol은 반환 raw값이 어디서 측정됐는지, 성공 전 created가 없는지, 모든 실패 분기에서 child/log/partial가 정리되는지 실제 소스와 추가 실제 실행으로 확인한다. observer의 직접child/FS 관측은 브라우저 모든 내부 분기를 증명하지 않는다. shell/home 기존 앱 동작 및339보호SHA를 보존한다.

## 10. 성공 조건

- [ ] E3-01~06과 A1T01~02/A1F01~07 각각 구현 위치/명령/실제 결과가 있다.
- [ ] 두 허용파일만 변경, 각30,000bytes 이하, frozen6575bytes/339보호파일/전체control/HEAD/status12 보존.
- [ ] 정적·build·관련11시험과 actual uninstrumented3/observed3·최종 gate6·fault38·CLI9/deferred8·IPC14+port·component 전부통과.
- [ ] late log error는 실제 owner A1_LOG_WRITE_FAILED, 잘못된 ACK는 실제 childclose/logsettlement 전 temp삭제 없음.
- [ ] 한 실패 code만 맞추거나 parser/canary PASS로 runtime을 대체하지 않는다. 첫 오류/partial/모든 raw 값 출처를 검증한다.
- [ ] 회신은 IMPLEMENTED/BLOCKED/FAILED로만 제출한다. A1/A2/B/전체3-2 수용 결정은 Sol 독립 검수까지 대기.

## 11. 즉시 중단 조건

기준HEAD/status/source/control이 다르거나 도구가 없으면 BLOCKED. 범위 밖 수정/의존성/새파일/expected 완화/새제품결정이 필요하면 구현하지 않고 질문을 회신한다. actual child close 또는 관측건강성을 확인할 수 없으면 자기 증거와 temp를 보존하고 UNVERIFIED_STOP/FAILED로 회신한다. foreign/historical PID/path를 정리해서 통과시키지 않는다. 자동 다른AI CLI 호출/commit/push/deploy 금지.

## 회신

Gemini는 아래를 실제 값으로 작성한다. 위 요청 본문은 수정하지 않는다.

```text
판정: 작성 대기 — IMPLEMENTED | BLOCKED | FAILED 중 실제 판정
기준: repository / branch / fullHEAD / 최종 commit 없음
초기 상태: 정확한 git status12 / source341 SHA / control 및 frozen 검문
변경 파일: 허용2 각각 E3 ID·변경 목적·bytes
범위 밖 변경: 실제 개수와 경로
요구사항 대조: E3-01~06 각각 함수/행/명령/결과
결함 추적: A1T01~02/A1F01~07 각각 해소·미해결 근거
검증 증거: 모든 명령/실행시각/rc/stdout/stderr/외부 artifact/actual count
음성 증거:38fault·9CLI·8deferred·14IPC+port의 case/code/first stack/trigger/quiescence
UI 증거:3양성+3관측양성 manifest/PNG/Chrome/DOM/fixture/rawerror
partial 증거: owner-failure/core-partial 경로·최초 오류·cleanup/evidence
보호 증거:339/frozen/controls/HEAD/status12 일치, 전체64자SHA
diff 요약: 허용hunk/추가삭제줄/byte수/새deps0
자원 증거: 자기child close/log finish·close/temp제거·보존경로/foreign정리0
미해결/가정: 실제 목록 또는 없음
```
'''
packet=packet.replace('gate parserは原本2陽性/19拒否+追加14拒否、runtime parserは正常入力/10変造+earlytemp/unsettledlog拒否を要求する（제어/parser 증거만）.','gate parser는 원본2양성/19거절+추가14거절, runtime parser는 정상입력/10변조+earlytemp/unsettledlog 거절을 요구한다. 이는 제어/parser 증거다.')
assert '<!--' not in packet and packet.count('\n## 회신\n')==1
(REPORT/'HANDOFF.preview.md').write_text(packet,encoding='utf-8')
# Scope must pass with the fresh locked TODO/state before replacing HANDOFF.
argv=[sys.executable,'-B',str(CTRL/'gate-evidence.py'),'--execution-sha',execution_sha,'--baseline-sha',baseline_sha,'--scope']
scope=subprocess.run(argv,cwd=REPO,capture_output=True,text=True,encoding='utf-8',timeout=30)
dump(REPORT/'scope-before-dispatch.json',{'argv':argv,'rc':scope.returncode,'stdout':scope.stdout,'stderr':scope.stderr})
assert scope.returncode==0,scope.stderr
assert (DOC/'HANDOFF.md').read_bytes()==received
(DOC/'HANDOFF.md').write_bytes((REPORT/'HANDOFF.preview.md').read_bytes())
outgoing=DOC/('Log/'+file_stamp+'_3-2c-A1-v3-Sol-IMPLEMENT_발송원본.md')
with outgoing.open('xb') as h:h.write((DOC/'HANDOFF.md').read_bytes())
assert outgoing.read_bytes()==(DOC/'HANDOFF.md').read_bytes()
body=packet.split('\n## 회신\n',1)[0].encode('utf-8')
dispatch={'time':stamp.isoformat(),'action':'IMPLEMENT','status':'READY_TO_CODE_USER_RELAY_PENDING',
 'handoff':str(DOC/'HANDOFF.md'),**record(DOC/'HANDOFF.md'),'requestBodyBytes':len(body),'requestBodySha256':sha(body),
 'receivedArchive':initial['archive'],'receivedBytes':initial['receivedBytes'],'receivedSha256':initial['receivedSha256'],
 'outgoingArchive':str(outgoing),'baselinePath':str(CTRL/'baseline.json'),'baselineSha256':baseline_sha,
 'executionSha256':execution_sha,'gateSha256':gate_sha,'sourceFiles':341,'protectedFiles':339,'allowed':execution['allowed'],
 'controlFilesLocked':len(baseline['control']),'productEditsBySol':0,'implementationExecuted':False,'A1Accepted':False,'A2Accepted':False,'BAuthorized':False,
 'retryHistory':execution['retryHistory'],'controlValidation':str(REPORT/'control-validation.json')}
dump(REPORT/'dispatch.json',dispatch)
assert PREP.product_snapshot()==source
for name,expected in initial['originalControls'].items():assert record(Path(name))==expected
for name,expected in baseline['control'].items():assert record(Path(name))==expected
post=subprocess.run(argv,cwd=REPO,capture_output=True,text=True,encoding='utf-8',timeout=30);assert post.returncode==0,post.stderr
dump(REPORT/'final-evidence.json',{'time':datetime.now(timezone.utc).isoformat(),'verdict':'CONTROL_READY_AND_IMPLEMENT_PACKET_PREPARED_NOT_A1_ACCEPTED',
 'sourceBeforeAfterEqual':True,'oldControlsUnchanged':True,'handoffArchiveVerified':True,'scope':json.loads(post.stdout),'dispatch':dispatch,
 'actualControlChecks':35,'rejectedObservationCorruptions':9,'newImplementationExecuted':False,'productEditsBySol':0,
 'remaining':'Gemini implementation then Sol actual independent A1 review; A2/B/full release not accepted'})
print(json.dumps({'status':dispatch['status'],'handoffBytes':dispatch['bytes'],'handoffSha256':dispatch['sha256'],'controlsLocked':len(baseline['control']),
 'baselineSha256':baseline_sha,'sourceFiles':341,'protectedFiles':339,'oldControlsUnchanged':True,'scope':json.loads(post.stdout)},ensure_ascii=False))
