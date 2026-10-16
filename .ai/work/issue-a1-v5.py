# -*- coding: utf-8 -*-
"""Sol seals control material and issues a manual Gemini IMPLEMENT packet. No product writes."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess,os,socket,sys
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v5';REPORT=DOC/'.ai/reports/phase3-2c-a1-v5-replan-20261012_231342'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
ALLOWED=['scripts/ui-checks/access-history.mjs','scripts/ui-checks/access-history-shared.mjs']
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def meta(path):
 b=path.read_bytes();return {'bytes':len(b),'sha256':sha(b)}
def fresh(path,data):
 with path.open('xb') as f:f.write(data)
def dump(path,value):fresh(path,(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def snapshot():
 def git(*args):return subprocess.check_output(['git',*args],cwd=REPO).decode('utf-8')
 names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
 return {'repository':str(REPO),'head':git('rev-parse','HEAD').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain','--untracked-files=all').splitlines(),'files':{n:meta(REPO/n) for n in sorted(names)}}
def command(name,args):
 out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
 env=dict(os.environ)
 for k in list(env):
  if k.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or k in ('NODE_OPTIONS','NODE_DEBUG'):del env[k]
 env['PYTHONIOENCODING']='utf-8'
 with out.open('xb') as stdout,err.open('xb') as stderr:
  child=subprocess.Popen([str(a) for a in args],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
  try:rc=child.wait(timeout=30)
  except subprocess.TimeoutExpired:child.kill();child.wait();raise
 dump(REPORT/(name+'.command.json'),{'argv':[str(a) for a in args],'cwd':str(REPO),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'stdout':str(out),'stderr':str(err),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes())})
 assert rc==0,(name,err.read_text(encoding='utf-8',errors='replace'))
 text=out.read_text(encoding='utf-8');return json.loads(text) if text else None
def main():
 assert not (CTRL/'baseline.json').exists(),'Already sealed; never reseal an active target'
 initial=load(REPORT/'initial-evidence.json');before=snapshot();assert before==initial['sourceBefore']
 for path,expected in initial['historicalControls'].items():assert meta(Path(path))==expected,path
 received=(DOC/'HANDOFF.md').read_bytes();archive=Path(initial['receivedArchive']);assert received==archive.read_bytes() and meta(archive)==initial['received']
 prior_logs={str(p):meta(p) for p in (DOC/'Log').iterdir() if p.is_file()}
 validation=load(REPORT/'control-validation-final.json');assert validation['status']=='PASS' and validation['A1Accepted'] is False
 changed=[n for n,h in validation['controlHashes'].items() if sha((CTRL/n).read_bytes())!=h]
 assert changed==['component-probes.mjs'],changed
 command('final-component-syntax',['node','--check',CTRL/'component-probes.mjs'])
 plan=command('final-component-plan',['node',CTRL/'component-probes.mjs','--list']);assert plan['additionalTypedMutations']==32
 replay=command('actual-v4-collector-gap-vectors',['node',REPORT/'component-gap-replay.mjs']);assert replay['status']=='EXPECTED_V4_COLLECTOR_GAPS_DETECTED' and len(replay['results'])==7 and all(r['invalidRawAcceptedByV4'] for r in replay['results'])
 validation['plans']['component']=plan;validation['collectorGapReplay']=replay;validation['controlHashes']={p.name:sha(p.read_bytes()) for p in CTRL.iterdir() if p.is_file()}
 validation['finalAmendment']='State-only reversal preserves original timestamps; seven exact new vectors reproduce v4 helper gaps. Syntax/plan/replay rechecked. All other validated controls unchanged.'
 dump(REPORT/'control-validation-sealed.json',validation)
 assert validation['gateParser']['v5ReceiptRules']['rejectedCount']==33
 with socket.socket() as probe:probe.bind(('127.0.0.1',18741))
 when=datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S KST')
 fresh(REPORT/'TODO.before-seal.md',(DOC/'TODO.md').read_bytes());fresh(REPORT/'current-state.before-seal.md',(DOC/'.ai/current-state.md').read_bytes())
 latest=(f'> **최신 정본({when})**: 사용자 「응 다음 작업 진행해줘」에 따라 **3-2c-A1 v5 전략 대체 IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기**. '
 '콜백원문/scalar exact·ACK 원문/닫힌키·viewportnull FAIL·원본규칙 collector·초기partial/획득checks 보존을 고정. '
 'Sol 제어구문10/parser신규33거절·observer39/기록변조9거절·정확v4대상 partial7/collector7 결함감지 확인은 control proof. '
 '새v5제품 구현/수용은 미실행, **A1_NOT_ACCEPTED 유지**. source341/보호339/main/HEAD/status12 불변·Sol제품변경0. '
 'Gemini·Sol 실제검수 의무 runtime46+lock3/양성6/final6/12PNG/IPC19+port/typed32/partial7. '
 'R32C-06 두CORRECT소진/초기화0·A2/B/전체3-2/배포대기. 현재 `HANDOFF.md`, 정본 `.ai/contracts/phase3-2c-a1-v5/`, 근거 `.ai/reports/phase3-2c-a1-v5-replan-20261012_231342/`. 아래 이전 정본은 이력.')
 todo=(DOC/'TODO.md').read_bytes().decode('utf-8');nl='\r\n' if '\r\n' in todo else '\n';marker='## 지금 위치와 다음 행동'+nl+nl;assert todo.count(marker)==1;todo=todo.replace(marker,marker+latest+nl+nl,1)
 old='**Phase3-2c-A1 v4 독립검수 FAILED / A1_NOT_ACCEPTED·관측값/ACK/collector/partial 및 검수 조건 재설계 필요.**';assert todo.count(old)==1;todo=todo.replace(old,'**Phase3-2c-A1 v5 IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기. A1_NOT_ACCEPTED 유지.**',1)
 lines=todo.splitlines(keepends=True);changed_lines=0
 for i,line in enumerate(lines):
  if line.startswith('| **다음 행동** |'):
   lines[i]='| **다음 행동** | 사용자가 현재 HANDOFF를 Gemini에 수동 전달→허용2파일 v5 구현·필수실제시험·회신→Sol 독립검수. A1 미수용·A2/B는 계속 대기. |'+nl;changed_lines+=1
  elif line.startswith('  - 🔄 3-2c. A1 v4 독립검수 FAILED'):
   lines[i]='  - 🔄 3-2c. A1 v5 전략대체 IMPLEMENT READY_TO_CODE / Gemini 수동중계 대기. A1_NOT_ACCEPTED·원본CORE9/fullUI87·R32C-06 소진/초기화0 유지. A2/B/전체3-2수용·배포대기. 현재 `HANDOFF.md`, 정본 `.ai/contracts/phase3-2c-a1-v5/`.'+nl;changed_lines+=1
  elif line.startswith('    - ⏸ 3-2c-A. A1 v4 제출 FAILED'):
   lines[i]=f'    - 🔄 3-2c-A. A1 v5 IMPLEMENT 준비 완료 ({when}). E5-01..08/원문ledger·ACK·null측정·strictcollector·초기partial/획득checks 기준고정. 제어39/변조9/parser신규33·정확v4 partial7/collector7누락감지; v5제품 구현·실제수용 미실행. 허용2/보호339/제품341 불변·CORRECT2소진/초기화0·A2정상8/남은A-N01~20/B87 대기. 근거 `.ai/reports/phase3-2c-a1-v5-replan-20261012_231342/`.'+nl;changed_lines+=1
 assert changed_lines==3; (DOC/'TODO.md').write_bytes(''.join(lines).encode('utf-8'))
 state=(DOC/'.ai/current-state.md').read_bytes().decode('utf-8');nl='\r\n' if '\r\n' in state else '\n';old_status='Status: PHASE_3_2C_A1_V4_FAILED_REPLAN_REQUIRED_NOT_ACCEPTED';assert state.count(old_status)==1
 section=f'''Status: PHASE_3_2C_A1_V5_READY_TO_CODE_USER_RELAY_PENDING_NOT_ACCEPTED

## Current task — A1 v5 strategy sealed; manual Gemini relay pending ({when})

- User 「응 다음 작업 진행해줘」 authorizes Sol's closed-review replan and next IMPLEMENT packet. Gemini remains sole product writer; Sol writes controls only. Received HANDOFF17400bytes/SHA {initial['received']['sha256']} archived byte-identically at {archive}.
- E5-01..08 retain full preflight/fixture/IPC/gate/cleanup and close callback value rewriting, fabricated spawn exit0, extra ACK acceptance, null viewport fallback, open resource/canonical collector, early partial loss and empty acquired checks. Exact process callback ledger plus scalar/ACK raw receipt comparison; original contract rules own expectations; first raw/partial state precedes all fallible preparation.
- Control proof only: Python4/Node6 syntax, original parser19+legacy extra35+new receipt33 negatives, observer39/hash-chain corruptions9, exact current v4 real private partial7 regression detection, seven new invalid collector vectors accepted by v4 helper. Bootstrap health receipt explicitly rejected by default v5 runtime. Actual v5 product/runtime acceptance NOT RUN; A1_NOT_ACCEPTED remains.
- Pending Gemini/Sol actual v5 evidence: runtime46+lock3/CLI9/deferred8/positive6/final6/12PNG; privateIPC19+port; semantic6/top4/typed32/realChromeclose2; partial7; static/build/map90/related11; independent source review. Current v4 public enabled owner refuses expired old baseline; no old state/control restoration, no v5 SUT success claim.
- Allowlist2 <=30000bytes each/frozen6575bytes/protected339/source341/main/fullHEAD/status12 retained. Historical41 version controls and existing logs unchanged. R32C-06 priorCORRECT2 exhausted/reset0; no CORRECT3. A2normal8/login/remainingA-N01..20/B87/full3-2/release remain pending.
- Evidence {REPORT}; new authority {CTRL}; current HANDOFF only final visible reply writable by Gemini. TODO/state/control target frozen after issuance. Frontier Sol; unavailableTerra -> balanced gpt-6-sol read-only evidence review, independently checked and integrated. MCP surface checked/no failure; P04/P06/P13/P25 applied. Sol product edits/otherAI CLI/commit/push/deploy0.

Earlier entries below are historical and do not override this entry.
'''
 state=state.replace(old_status,section.replace('\n',nl),1);(DOC/'.ai/current-state.md').write_bytes(state.encode('utf-8'))
 assert snapshot()==before
 dump(REPORT/'pre-seal-evidence.json',{'time':when,'sourceUnchanged':True,'sourceFiles':341,'protectedFiles':339,'productEditsBySol':0,'receivedArchive':{'path':str(archive),**meta(archive)},'routing':{'primary':'frontier','reason':'verification redesign and integration','internal':'Terra unavailable -> balanced gpt-6-sol read-only evidence'},'policyTrace':['P04','P06','P13','P25'],'McpSurfaceInspected':True,'A1Accepted':False,'resetAllowed':False,'validation':meta(REPORT/'control-validation-sealed.json')})
 oldbaseline=load(DOC/'.ai/contracts/phase3-2c-a1-v4/baseline.json')
 paths={Path(p) for p in oldbaseline['control']}
 paths.update(Path(p) for p in initial['historicalControls'])
 paths.update(p for p in CTRL.iterdir() if p.is_file())
 paths.update(p for p in REPORT.rglob('*') if p.is_file())
 paths.update(DOC/'.ai/work'/n for n in ['prepare-a1-v5.py','upgrade-a1-v5.py','validate-a1-v5.py','issue-a1-v5.py'])
 paths.update([archive,DOC/'.ai/reports/phase3-2c-a1-v4-review-20261012_175305/final-evidence.json',DOC/'.ai/reports/phase3-2c-a1-v4-review-20261012_175305/findings.json'])
 paths.discard(CTRL/'baseline.json');paths.discard(DOC/'HANDOFF.md')
 baseline={**before,'time':datetime.now().astimezone().isoformat(),'allowed':ALLOWED,'control':{str(p):meta(p) for p in sorted(paths)},'previousReview':str(DOC/'.ai/reports/phase3-2c-a1-v4-review-20261012_175305/final-evidence.json'),'stageSlice':'A1','acceptance':'A1 prerequisite only; A2/B remain unaccepted','retryHistory':initial['retryHistory']}
 dump(CTRL/'baseline.json',baseline);eh=sha((CTRL/'execution.json').read_bytes());bh=sha((CTRL/'baseline.json').read_bytes());gh=sha((CTRL/'gate-evidence.py').read_bytes())
 gate=[PY,'-X','utf8','-B',CTRL/'gate-evidence.py','--execution-sha',eh,'--baseline-sha',bh]
 scope=command('scope-before-dispatch',gate+['--scope'])
 assert scope['status']=='PASS'
 hashpaths=list(sorted(CTRL.iterdir()))+[DOC/'.ai/contracts/phase3-2c-v1/contract.json',DOC/'.ai/contracts/phase3-2c-v1/verify-evidence.py']
 table='\n'.join(f"| `{p}` | {meta(p)['bytes']} | `{meta(p)['sha256']}` |" for p in hashpaths if p.is_file())
 source_table='\n'.join(f"| `{n}` | {before['files'][n]['bytes']} | `{before['files'][n]['sha256']}` |" for n in ALLOWED)
 strategy=(CTRL/'STRATEGY.md').read_text(encoding='utf-8');status='\n'.join(before['status'])
 packet=f'''# HANDOFF — 3-2c A1 v5 관측 원문·초기 부분 증거 전략 구현

- Task: A1 성공 판정을 actual callback/ACK/측정과 대조하고 모든 초기·후기 실패의 획득증거를 보존하는 v5 전략 구현
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — sole orchestrator
- To: Gemini — implementation coder
- Time: {when}
- 회신: 필요
- Repository: {REPO}
- Branch: main
- Baseline commit: {before['head']}
- Expected initial status: 아래 정확한12경로/source341/허용2/보호339
- 사용자 승인: 「응 다음 작업 진행해줘」. 제품작성자 Gemini·사용자 수동중계 유지.
- 상태: READY_TO_CODE / A1_NOT_ACCEPTED. IMPLEMENTED는 제출이며 수용결정은 Sol 독립검수 뒤다.

# 회신 요청

누가 Gemini, 어디 맨 아래 보이는 `## 회신`, 언제 착수게이트 충돌이면 수정 없이 BLOCKED·그 외 구현과 필수 실제시험 뒤. 본문/정본/TODO/.ai/Log 수정 금지. 회신 없이 다음 단계는 진행되지 않는다. 다른 AI CLI를 호출하지 않는다.

## 1. 목표 / 2. 비목표

목표: CORE9 및 보호 shell/home을 통과해도 실제 시각 보정/미관측 exit0/ACK추가키/측정부재/잘못된resource·canonical/부분증거 소실에는 PASS를 게시하지 않는 A1 실행기를 구현한다.

대기: A2 정상8/login/남은A-N01~20, B전체UI87, 활동이력 제품UI·모델/API/DB/계산/설정, 새제품파일·의존성, commit/push/배포. 원본v1 CORE9/fullUI87 불변. R32C-06 CORRECT2소진/초기화0 유지, 이번 IMPLEMENT는 전략대체이며 CORRECT3이 아니다.

## 3. 현재 상태와 근거

TODO 3-2c-A: v4 IMPLEMENTED 독립검수 FAILED/A1_NOT_ACCEPTED. 정해진44/IPC19/typed25/partial5 PASS에도 실제 owner timestamp250ms보정 및 ACK추가키는 고정gate도 허위통과했고, private nullviewport 허위PASS·helper부정raw7수용·earlypartial부재·획득raw8/9의checks0이 재현됐다. 정확한 실패 근거 `{initial['priorReview']}`의 findings.json/final-evidence.json 및 원문 `{archive}`({initial['received']['bytes']}bytes/SHA `{initial['received']['sha256']}`).

Sol v5 제어 검증: Python4/Node6 구문, 원parser19/legacy추가35/신규receipt33음성거절, actualobserver39·기록변조9거절, exact현재v4 private partial7결함감지 및 신규collector7부정값수용 재현. 근거 `{REPORT/'control-validation-sealed.json'}`. 이는 **control proof**다. 새v5제품 구현/수용은 아직없다. oldv4baseline은 TODO/state 종결갱신 때문에 만료됐으며 복원/수정하지 않는다. default실제v5 runtime은 bootstrapMode=true receipt를 거절한다.

초기 git status 원문:

```text
{status}
```

수정 전 두 허용파일 실제값:

| 제품파일 | bytes | SHA-256 |
|---|---:|---|
{source_table}

봉인된 제어 정본(실제bytes에서 계산, 임의값/축약금지):

| 경로 | bytes | SHA-256 |
|---|---:|---|
{table}

## 4. 수정 경계

| 허용제품파일 | 요구사항 | 범위 |
|---|---|---|
| scripts/ui-checks/access-history.mjs | E5-01/02/03/06/07/08 | existing owner preflight·ProcessRecord/manifest·ACK·failure·gate/publish 대상hunk만 |
| scripts/ui-checks/access-history-shared.mjs | E5-03/04/05/06/08 | frozen 밖 existing collector·measurement·corestate/partial 대상hunk만 |

각30000bytes 이하. baseline.files 나머지339/full source집합341/dirty12/frozen6575bytes를 보존. shared frozen marker/전체SHA는 아래전략에 명시. 새제품파일/광역포맷/전체재생성 금지. `C:\\Projects\\Active\\ShiftMgmt_V3.4`는 읽기전용. 모든 DOC정본·.ai·Log·TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI는 읽기전용, HANDOFF의 마지막 보이는 회신만 허용. 실행은 자기 새artifact/temp/fixture만 생성·필요정리하며 과거run/foreignPID/기존Chromeprofile/운영DB에 쓰거나 정리하지 않는다.

existing shared EXECUTION_PATH/SHA는 `{CTRL/'execution.json'}` / `{eh}`, owner BASELINE_PATH/SHA는 `{CTRL/'baseline.json'}` / `{bh}`, owner GATE_PATH/SHA는 `{CTRL/'gate-evidence.py'}` / `{gh}`로 교체. 원본v1경로/SHA·fixedPython `{PY}` 유지. 대체gate/env override 금지. `evidence-v5.py`를 포함한 baseline.control 전부 owner 사전검문의 대상이다.

## 5. 요구사항 / 6. Sol 코드 전략

아래는 `{CTRL/'STRATEGY.md'}` 정본 전문이며 동일하게 따라야 한다. strategy와 test 모순 또는 두파일/크기/frozen 범위 안에서 불가하면 BLOCKED, 스스로 설계를 바꾸지 않는다.

{strategy}

## 7. 필수 불변조건과 과거 함정

CLAUDE.md/07-invariants-and-pitfalls.md의 공통 절대규칙: 정본·보호경로 보존, 기존역할/계산/API/DB/UI 변경금지, 추정완료/검증약화/허위SHA·RC 금지. frozen normal8 헬퍼는 A2로 남긴다. positive/probe/canary·순수parser 증거를 섞지 않는다. canonical 동일bytes의 다른경로는 actualcompiled정본이 아니다. nullviewport는 실제 화면크기 변경시험이 아니라 측정부재다. callbackledger와scalar 모두 함께 만든 기록만으로 실제관측을 증명했다고 주장하지 않는다. Sol source/독립실행검수가 필요하다. preflight fullhashloop는 v4에서 확인된 정상기능이며 유지한다.

## 8. 착수 전 게이트

AGENTS→.ai/HARNESS→PROTOCOL→GEMINI, TODO/currentstate, CLAUDE/07-invariants, 이 HANDOFF/정본 모두 읽는다. REPO/main/fullHEAD/status12/source341/두 초기SHA·크기/frozen·보호339/control표일치 및 요구/test 모순0을 확인. 아래 --scope가 rc0이어야 제품수정 착수. 실패면 수정 없이 BLOCKED, oldbaseline/기준문서 고치지 않는다. HANDOFF본문을 정리/재작성하지 않는다.

## 9. 정확한 검증 계획

PowerShell, REPO에서 실행. 아래값은 이미 봉인된 실측값이며 대체값 허용없음:

```powershell
Set-Location -LiteralPath '{REPO}'
$a1Control = '{CTRL}'
$a1Python = '{PY}'
$a1ExecutionSha = '{eh}'
$a1BaselineSha = '{bh}'
& $a1Python -X utf8 -B "$a1Control\\gate-evidence.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha --scope
```

1. 위scope→rc0, 허용2/보호339/control/fullHEAD/status12/frozen 일치. 구현 후도 반복.
2. `node --check scripts/ui-checks/access-history.mjs`, `node --check scripts/ui-checks/access-history-shared.mjs`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run validate:map`, `git diff --check`, `npm.cmd run build`→각rc0. 기존lint5warning/map90과 실제값을 구분해 보고.
3. `npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1`→rc0·3파일11시험. 전체919는 실제실행했을 때만 보고.
4. `& $a1Python -X utf8 -B "$a1Control\\gate-evidence.py" --execution-sha $a1ExecutionSha --self-test`, `& $a1Python -X utf8 -B "$a1Control\\runtime-probes.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha --self-test`→각rc0, 원19/추가35/신규33 및 strictreceipt parser. SUT 수용대체 아님.
5. 아래실제runtime 명령→rc0·PASS. default freshobserver39·eventcorruption9·무계측양성3+관측양성3/final6/12PNG·fault46/lock3/CLI9/deferred8 필수. 마지막실제artifact에서 core양성 manifest를 추출:

```powershell
$a1RuntimeLines = & $a1Python -X utf8 -B "$a1Control\\runtime-probes.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha
if ($LASTEXITCODE -ne 0) {{ throw 'A1 actual runtime failed; preserve evidence and stop' }}
$a1RuntimeLines
$a1RuntimeSummary = $a1RuntimeLines[-1] | ConvertFrom-Json
if ($a1RuntimeSummary.status -ne 'PASS') {{ throw 'Actual runtime PASS absent' }}
$a1RuntimeRoot = $a1RuntimeSummary.artifact
$a1RuntimeReceipt = Get-Content -LiteralPath (Join-Path $a1RuntimeRoot 'suite-result.json') -Raw | ConvertFrom-Json
$a1CoreRecord = @($a1RuntimeReceipt.records | Where-Object {{ $_.name -eq 'positive-contract-core' }})
if ($a1CoreRecord.Count -ne 1) {{ throw 'Actual core positive receipt differs' }}
$a1CoreFinal = ($a1CoreRecord[0].output | ConvertFrom-Json).manifestPath
```

6. `node "$a1Control\\ipc-probes.mjs"`→rc0·private19/actualoccupiedport PASS, protocol1/추가packet·context·registration은 ACK0, 추가RUN은 validACK 뒤 거절, HTTP/Chrome/workerwrite0.
7. `node "$a1Control\\component-probes.mjs" --core-manifest $a1CoreFinal --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha`→rc0·semantic6/top4/typed32/actualChromeclose2. inputfinal도 고정gate 먼저 검문.
8. `node "$a1Control\\partial-probes.mjs"`→rc0·actualpartial7 PASS. firststack/secondary/raw10/acquiredchecks exact/actualresource·atomicfallback 검문. nullviewport/canonicalmissing actualtrigger 필수. **--bootstrap-v4는 제품수용명령에 금지**.
9. 위scope다시→rc0. 두파일 bytes/fullSHA, snapshots대비실제diff의 추가/삭제/각hunk, frozen/protected339/control/fullHEAD/status12를 보고.

음성요약: E5-02 callbackfinish250ms역전→A1_LIFECYCLE_INVALID/원문시각/temp보존; E5-03 ACK extra→A1_ACK_INVALID/RUN0; E5-04 nullviewport→workerFAIL/nullpartial; E5-05 state-onlyreverse·repeat·extra/ID3/canonicalclone7 포함32부정 raw 모두 helper거절; E5-06 초기canonical실패→earlyatomicpartial/Chrome0, 확보raw가있으면checks[]금지. 기존44의 gate/png/ID/raw/close/log/ACK/spawn/회귀증거없음 및 lock3도 모두 유지한다. observer불건강/fault未발생/timeout/다른code는 UNVERIFIED_STOP·수용실패다.

실제 UI/런타임: owned앱 `http://127.0.0.1:18741/`, installedChrome1440x900, CORE입력id/password 각각1/visible·capture1, 기존shell 관리자펼침/접힘/watch중단/operator4capture·home-live-admin1capture를 2회로 총12PNG. 실제events/console·network오류0·분리tempDB·자기listener만 사용. 정상8/login동작의A2완료를 주장하지 않는다. 각명령 argv/cwd/PID/시각/RC/stdoutstderr/fullSHA 및 generatedrun/temp/capture 경로를 회신한다.

## 10. 성공 조건

E5-01..08/직전stabledefectID 전부 원인→수정위치→실제검증 대조, allowlist2/각30k/frozen/보호339/control/source341 보존, static/build/관련11·runtime46/lock3/CLI9/deferred8/양성6/final6/12PNG·IPC19+port·semantic6/top4/typed32/actualclose2·partial7 모두 실제PASS 및 증거. 원본v1/회수소진/A2/B대기 유지. Gemini IMPLEMENTED후 Sol 독립검수까지 A1_NOT_ACCEPTED다.

## 11. 즉시 중단 조건

요구/소스/control모순, 허용외/신규의존성 필요, 기준hash/status drift, 새API/DB/계산/권한/설계결정필요, 검사완화/fallback/placeholder 필요, 필수환경 부재→BLOCKED 또는 UNVERIFIED_STOP. 기존증거/자기temp 보존, foreignPID·과거경로 정리금지. failed검사누락을 PASS로 채우지 않는다. 본문/제어정본/TODO 수정하거나 실패회수 초기화 금지.

---

## 회신

> Gemini가 이 마지막 칸만 실제값으로 채운다. 본문은 그대로 유지. 요구사항/결함과 실제diff를 정확히 대조한다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: 저장소 / branch / 전체HEAD / 최종commit(있으면)
초기상태: 실제 git status12 / scope 착수검문 / 두초기SHA / frozen
변경파일: 허용2의 목적·실제bytes/fullSHA / 범위밖0
요구대조: E5-01..08 각각 구현심볼·행 / exact명령·RC·결과
결함대조: A1V4-01..05 / A1V4-T01 / A1V4-R01 각각 원인→수정→재현→결과
정적/빌드/시험: 각 exactargv/cwd/PID/start/end/RC/stdoutstderrartifact
actualruntime: 실제suite artifact / observer39·변조9 / 46fault+3lock / CLI9·deferred8 / 6positive·6final·12PNG
IPC/component/partial: private19+port / typed32·semantic6·top4·realclose2 / partial7 각각결과 및 원문artifact
음성: ACKextra/RUN0 / callback원문250ms·temp보존 / nullviewportFAIL / earlycanonicalpartial / acquiredchecks exact
UI: URL/실제Chrome/실제captures·bytes·fullSHA/console·network/분리temp
diff: 각 허용파일 실제추가/삭제줄·hunk / snapshot대조 / 생성물·의존성 변화
보호: 보호339/control표/frozen6575bytes·SHA/source341/HEAD/status12 전후동일
전체SHA: 명령으로 얻은 각제품 및 정본64자리hash와bytes
미해결/가정: 없음 또는 구체목록 / retain할 own artifacts·temps
TODO 제안: Sol이 실제검수후 갱신할 상태만 제안; 직접수정0
```
'''
 assert '<Task' not in packet and '{eh}' not in packet
 (DOC/'HANDOFF.md').write_bytes(packet.encode('utf-8'));sent=(DOC/'HANDOFF.md').read_bytes()
 outgoing=DOC/'Log'/(datetime.now().strftime('%Y%m%d_%H%M%S')+'_3-2c-A1-v5-Sol-IMPLEMENT_발송본.md');fresh(outgoing,sent);assert outgoing.read_bytes()==sent
 afterscope=command('scope-after-dispatch',gate+['--scope']);assert afterscope['status']=='PASS'
 after=snapshot();assert after==before
 for p,h in initial['historicalControls'].items():assert meta(Path(p))==h
 for p,h in prior_logs.items():assert meta(Path(p))==h
 for p,h in baseline['control'].items():assert meta(Path(p))==h
 dump(REPORT/'dispatch.json',{'status':'READY_TO_CODE_USER_RELAY_PENDING','time':when,'action':'IMPLEMENT','A1Accepted':False,'sourceBefore':before,'sourceAfter':after,'sourceFiles':341,'protectedFiles':339,'controlFiles':len(baseline['control']),'historicalControlFiles':41,'receivedArchive':{'path':str(archive),**meta(archive)},'sentArchive':{'path':str(outgoing),**meta(outgoing)},'currentHandoff':meta(DOC/'HANDOFF.md'),'baseline':meta(CTRL/'baseline.json'),'execution':meta(CTRL/'execution.json'),'gate':meta(CTRL/'gate-evidence.py'),'controlValidation':meta(REPORT/'control-validation-sealed.json'),'scopeBefore':scope,'scopeAfter':afterscope,'productEditsBySol':0,'AI_CLI':0,'counterReset':0,'pending':'Manual user relay to Gemini; real v5 implementation and independent Sol review remain'})
 print(json.dumps({'status':'READY_TO_CODE_USER_RELAY_PENDING','A1Accepted':False,'sourceFiles':341,'protectedFiles':339,'controlFiles':len(baseline['control']),'HANDOFF':meta(DOC/'HANDOFF.md'),'sentArchive':str(outgoing),'report':str(REPORT)},ensure_ascii=False))
if __name__=='__main__':main()
