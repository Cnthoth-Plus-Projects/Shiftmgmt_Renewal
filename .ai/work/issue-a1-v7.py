# -*- coding: utf-8 -*-
"""Seal user-authorized Sol v7 strategy and issue manual Gemini IMPLEMENT."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib, importlib.util, json, socket, subprocess, sys
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7';REPORT=DOC/'.ai/reports/phase3-2c-a1-v7-replan';REVIEW=DOC/'.ai/reports/phase3-2c-a1-v6-review-20261013_122600'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
ALLOWED=['scripts/ui-checks/access-history.mjs','scripts/ui-checks/access-history-shared.mjs']
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':sha(b)}
def fresh(p,b):
    with p.open('xb') as f:f.write(b)
def dump(p,v):fresh(p,(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def module(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
    assert not (CTRL/'baseline.json').exists(),'Never reseal an issued target'
    initial=load(REPORT/'initial-evidence.json');validation=load(REPORT/'control-validation-ready.json')
    prep=module('sol_v7_issue_prepare',DOC/'.ai/work/prepare-a1-v7.py');before=prep.snapshot()
    assert before==initial['sourceBefore'] and len(before['files'])==341 and len(before['status'])==12
    assert validation['status']=='PASS' and not validation['A1Accepted'] and validation['plans']['lifecycle']['parserNegative']==15
    for p,h in initial['historicalControls'].items():assert meta(Path(p))==h,p
    for name,h in validation['controlHashes'].items():assert sha((CTRL/name).read_bytes())==h,name
    assert meta(DOC/'HANDOFF.md')==initial['received'] and (DOC/'HANDOFF.md').read_bytes()==Path(initial['receivedArchive']).read_bytes()
    with socket.socket() as port:port.bind(('127.0.0.1',18741))
    now=datetime.now(timezone(timedelta(hours=9)));when=now.strftime('%Y-%m-%d %H:%M:%S KST');stamp=now.strftime('%Y%m%d_%H%M%S')
    archived=DOC/'Log'/(stamp+'_3-2c-A1-v6-Sol-FAILED_v7발송전보존.md')
    fresh(archived,(DOC/'HANDOFF.md').read_bytes());assert meta(archived)==initial['received']
    # Underlying plan approved by user; update factual next phase before sealing.
    todo=(DOC/'TODO.md').read_bytes().decode('utf-8');nl='\r\n' if '\r\n' in todo else '\n'
    marker='## 지금 위치와 다음 행동'+nl+nl;assert todo.count(marker)==1
    entry=f'> **최신 정본({when})**: 사용자 「다음 작업 진행해줘」에 따라 **A1 v7 전략대체 IMPLEMENT READY_TO_CODE / Gemini 수동중계 대기**. 원오류 hardbarrier·live/cache동일성·현재실패snapshot·PID/streammap정본검문·atomic beforeCommit 전략고정. 원51/partial11/observer45 유지+actual late15/pureguard5검문. Solcontrol구문16/observer45·변조9/lifecyclecanary15·parser15/Python판정parser43+순서13/정확v6pure5gap·보존runtime4결함재검문PASS는control proof이며v7제품수용미실행. source341/보호339/old69/main/HEAD/status12불변·Sol제품수정0. R32C-06 CORRECT2소진/초기화0·A1_NOT_ACCEPTED·A2/B대기. 현재 `HANDOFF.md`, 정본 `.ai/contracts/phase3-2c-a1-v7/`, 근거 `.ai/reports/phase3-2c-a1-v7-replan/`. 아래이전정본은이력.'+nl+nl
    todo=todo.replace(marker,marker+entry)
    old='**Phase3-2c-A1 v6 IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기. A1_NOT_ACCEPTED 유지.**'
    assert todo.count(old)==1;todo=todo.replace(old,'**Phase3-2c-A1 v7 IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기. A1_NOT_ACCEPTED 유지.**')
    lines=todo.splitlines(keepends=True);changed=0
    for i,line in enumerate(lines):
        if line.startswith('| **다음 행동** |'):
            lines[i]='| **다음 행동** | 사용자가 현재 HANDOFF를 Gemini에 수동전달→기존2파일 v7구현·고정implementation-checks.py의실제필수검수(원51+late15/guard5)·회신→Sol 독립검수. A1 미수용·A2/B대기. |'+nl;changed+=1
        elif line.lstrip().startswith('- 🔄 3-2c. '):
            indent=line[:len(line)-len(line.lstrip())];lines[i]=indent+'- 🔄 3-2c. A1 v7 전략대체 IMPLEMENT READY_TO_CODE / Gemini 수동중계 대기. v6FAILED이력·A1_NOT_ACCEPTED·원CORE9/fullUI87·R32C-06 소진/초기화0 유지. A2/B/전체3-2수용·배포대기. 현재 `HANDOFF.md`, 정본 `.ai/contracts/phase3-2c-a1-v7/`.'+nl;changed+=1
        elif line.lstrip().startswith('- 🔄 3-2c-A. '):
            indent=line[:len(line)-len(line.lstrip())];lines[i]=indent+f'- 🔄 3-2c-A. A1 v7 IMPLEMENT 준비 완료 ({when}). E7-01..08/lateerror barrier·livecache대조·현재failuresnapshot·exactguard·atomicstage검문/실제late15·guard5 기준고정. controlobserver45/lifecyclecanary15/parser15/v6puregap5/보존runtime4결함재검문PASS는v7수용아님. 허용2/각30k/보호339/source341불변·CORRECT2소진/초기화0·A2/B대기. 근거 `.ai/reports/phase3-2c-a1-v7-replan/`.'+nl;changed+=1
    assert changed==3;(DOC/'TODO.md').write_bytes(''.join(lines).encode('utf-8'))
    state_path=DOC/'.ai/current-state.md';state=state_path.read_bytes().decode('utf-8');start=state.index('## Current task')
    new_state=f'''# Current Project State

Status: PHASE_3_2C_A1_V7_READY_TO_CODE_USER_RELAY_PENDING_NOT_ACCEPTED

## Current task — A1 v7 delta strategy sealed; manual Gemini relay pending ({when})

- User 「다음 작업 진행해줘」 authorizes closed-v6-review replan and next IMPLEMENT packet. Gemini remains sole product writer. Closed-v6 HANDOFF14555bytes/SHA{initial['received']['sha256']} archived byte-identically at {archived}; initial replan archive {initial['receivedArchive']}. No old baseline restoration or old control edits.
- E7-01..08 preserve fullpreflight/IPC/raw/acquisitions/settledhash/atomicpublication and add first-error hard barriers, live callback/scalar vs once-frozen success cache equality after subsequent awaits and before temp removal/staged candidate/final rename, current actual failure snapshots and exact integerPID/streammaps. No new manifest fields; shared anchors only. Owner30000byte fit remains implementation gate, local reuse within touched functions only.
- Sol control proof only: syntax16, original parser19/legacy35/receipt43/ordering13, freshobserver45/corruptions9 bootstrapexactv6 rejected by defaultv7 runtime; actualNodechild/logcanaries15 and forgedparser15; currentv6 actualpureguard5 gaps detected; retainedsourcebound v6runtime4 gaps rejected by same errorbinding helper (artifactreplay, not freshSUT execution). Initialdevelopment15/10 and interim15/14 evidence retained; final15/15 has exacttemp/candidate publication/final-stage-file/second-error checks. No v7 product/runtime acceptance yet.
- Gemini actual obligations: fixed implementation-checks.py runs scope/syntax/typecheck/lint(existing5)/map90/diff/build/focused3files11, parser tests, originalruntime86/51fault/lock3/CLI9/deferred8/positive6/final6/PNG12/freshhealth45+9, IPC19+port, componentsemantic6/top4/typed32/realChromeclose2, partial11, actualpureguardvalid1/reject5 and defaultactual-lifecycle15. Canaries/bootstrap/replay cannot substitute for actual implementation proof. Driver syntax validated; driver execution deferred until Gemini implements.
- Source341/main/HEAD160940f9aaeb6696538447f83b44658073e382f0/status12/protected339/frozen6575bytes/history69 unchanged. Allowowner/shared2 <=30000bytes each. ExistingR32C-06 CORRECT2exhausted/reset0/noCORRECT3. A1_NOT_ACCEPTED and A2normal8/login/remainingA-N01..20/B87/full3-2/release pending. Solproductedits/AI CLI/commit/push/deploy0,V3.4readonly.
- Evidence {REPORT}/control-validation-ready.json, initial-evidence.json, commandreceipts and control artifacts; new authority {CTRL}; TODO/state/control target frozen after issuance, HANDOFF only final reply writable byGemini. FrontierSol; Terra unavailable -> balancedgpt-6-sol read-only strategy/control evidence reviewed, root checked and fixed3 acceptance gaps. MCPsurfaceinspected/noMCPfailure; P04/P06/P13 compactcore/P25 replan applied.

Earlier entries below are historical and do not override this entry.


'''
    state_path.write_bytes(new_state.replace('\n','\r\n').encode('utf-8')+state[start:].encode('utf-8'))
    assert prep.snapshot()==before
    dump(REPORT/'pre-seal-evidence.json',{'time':when,'sourceUnchanged':True,'sourceFiles':341,'protectedFiles':339,'historicalControlsUnchanged':69,'productEditsBySol':0,'receivedArchive':{'path':str(archived),**meta(archived)},'validation':meta(REPORT/'control-validation-ready.json'),'routingFallback':'Terra unavailable -> balanced gpt-6-sol read-only evidence review','policyTrace':['P04','P06','P13','P25'],'A1Accepted':False,'counterReset':0})
    oldbaseline=load(DOC/'.ai/contracts/phase3-2c-a1-v6/baseline.json')
    paths={Path(p) for p in oldbaseline['control']};paths.update(Path(p) for p in initial['historicalControls'])
    paths.update(p for p in CTRL.iterdir() if p.is_file());paths.update(p for p in REPORT.rglob('*') if p.is_file());paths.update(p for p in REVIEW.rglob('*') if p.is_file())
    paths.update(DOC/'.ai/work'/name for name in ('prepare-a1-v7.py','validate-a1-v7.py','final-validate-a1-v7.py','issue-a1-v7.py'))
    paths.update([archived,Path(initial['receivedArchive'])]);paths.discard(CTRL/'baseline.json');paths.discard(DOC/'HANDOFF.md')
    baseline={**before,'timeUtc':datetime.now(timezone.utc).isoformat(),'allowed':ALLOWED,'control':{str(p):meta(p) for p in sorted(paths)},'previousReview':str(REVIEW/'final-evidence.json'),'stageSlice':'A1','acceptance':'A1 prerequisite only; A2/B remain unaccepted','retryHistory':0}
    dump(CTRL/'baseline.json',baseline)
    eh=meta(CTRL/'execution.json')['sha256'];bh=meta(CTRL/'baseline.json')['sha256'];gh=meta(CTRL/'gate-evidence.py')['sha256']
    gate=[PY,'-X','utf8','-B',CTRL/'gate-evidence.py','--execution-sha',eh,'--baseline-sha',bh]
    validate=module('sol_v7_issue_validate',DOC/'.ai/work/validate-a1-v7.py')
    scope=json.loads(validate.command('scope-before-dispatch',gate+['--scope']));assert scope['status']=='PASS'
    all_paths=sorted(p for p in CTRL.iterdir() if p.is_file())+[DOC/'.ai/contracts/phase3-2c-v1/contract.json',DOC/'.ai/contracts/phase3-2c-v1/verify-evidence.py']
    table='\n'.join(f"| `{p}` | {meta(p)['bytes']} | `{meta(p)['sha256']}` |" for p in all_paths)
    source_table='\n'.join(f"| `{name}` | {before['files'][name]['bytes']} | `{before['files'][name]['sha256']}` |" for name in ALLOWED)
    strategy=(CTRL/'STRATEGY.md').read_text(encoding='utf-8')
    status='\n'.join(before['status'])
    packet=f'''# HANDOFF — 3-2c A1 v7 실제 오류 차단·현재 실패 증거 구현

- Task: 늦은 child/log 오류를 성공에서 차단하고 실패 기록에 현재 실제콜백을 보존하는 v7 구현
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — sole orchestrator
- To: Gemini — implementation coder
- Time: {when}
- 회신: 필요
- Repository: `{REPO}`
- Branch: main
- Baseline commit: `{before['head']}`
- Expected initial status: 아래 dirty12 정확히 유지
- Status: READY_TO_CODE / USER_MANUAL_RELAY_PENDING / A1_NOT_ACCEPTED

## 회신 요청

Gemini는 전체 착수게이트를 읽고 구현과 아래 필수실제검수 후 맨 아래 보이는 `## 회신`만 채운다. 모순/불일치/30k내구현불가이면 제품수정 없이 BLOCKED. 본문·정본·TODO/state는 읽기전용. IMPLEMENTED는 제출이며 Sol 수용이 아니다. 사용자 수동중계로만 진행하며 다른 AI CLI를 호출하지 않는다.

## 1. 목표·비목표·현재 근거

목표: 단일 성공barrier가 원오류/현재callback·scalar와동결cache차이를 실제삭제전·후속await뒤·atomicrename전까지 확인하여 오류있는실행의PASS를 차단한다. 실패는현재실제process snapshot과최초획득core증거를 남긴다.

비목표: A2 정상8/login/남은A-N01~20·B87·전체3-2/제품수용/커밋/배포. DB/API/계산/권한/UI/패키지/설정/제품테스트/새제품파일/광역포맷/전체재생성은허용하지않는다. R32C-06 두CORRECT소진/초기화0 유지. v7은검수실패뒤전략대체이며 CORRECT3/회수초기화가 아니다.

v6 독립검수 FAILED: `{REVIEW}/findings.json`, `final-evidence.json`. 지정16명령/원runtime86records·51fault/partial11/IPC19+port/typed32/observer45+변조9/양성6·final6·PNG12는PASS였으나, 추가actual controlled lateerror3에서owner와고정finalgate모두RC0/PASS, 실패1은현재8thcallback대신과거7events를게시했다. 실제추출guard는고정helper가거절한5조건을수용했고회신diff/명령receipt가미충족이었다. A1V6-01..03/T01/R01 그대로이어받는다. Sol은latecache검수커버리지누락T01을소유하며기존51PASS를FAIL로다시쓰지않는다.

직전HANDOFF14555bytes/SHA `{initial['received']['sha256']}` 보존 `{archived}`. 이번Solcontrol검증 `{REPORT}/control-validation-ready.json`: 구문16, 판정parser19+35+43/순서13, 실제observer45/변조9, 실제Nodechild/logcanary15와위조parser15, 현재v6pure5gap, 보존runtime4결함재거절PASS. canary/control/artifactreplay는v7제품실행·수용이아니다. v7제품코드/실제runtime수용은 아직미실행. Sol제품수정0.

## 2. 정확 초기 상태와 수정 경계

```text
{status}
```

| 수정전 제품파일 | bytes | SHA-256 |
|---|---:|---|
{source_table}

허용2파일만: owner의constant/단일guard/barrier/cache재사용/atomic/failure와직접호출hunk, shared의execution path/SHA constant2줄만. 각30000bytes 이하. owner여유101bytes/shared93bytes이며중복제거는위지정함수안에서만한다. 제품source341/보호339/dirty12집합 유지. 구현중어느hunk도E7-01..08중ID없이추가하지않는다.

frozen helper6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`, CANONICAL_8_ACTIONS export부터performWorkerIpcHandshake export직전까지수정금지. A2 normal8 helper는보호다. V3.4/제품339/모든정본문서/.ai/Log/TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/패키지/빌드/테스트는읽기전용. 새생성은exactown freshrun/temp/fixture와HANDOFF회신뿐이다. 테스트실행으로생기는정상build산출물은기존build명령만쓰고별도수정하지않는다.

## 3. 봉인정본과 고정 anchor

| 절대경로 | bytes | SHA-256 |
|---|---:|---|
{table}

shared EXECUTION_PATH/SHA = `{CTRL/'execution.json'}` / `{eh}`.
owner BASELINE_PATH/SHA = `{CTRL/'baseline.json'}` / `{bh}`.
owner GATE_PATH/SHA = `{CTRL/'gate-evidence.py'}` / `{gh}`.
fixed Python `{PY}`, originalv1 contract/checker 유지. 다른env/CLI/path/gateoverride 금지. baseline.files341중허용2제외339 및 baseline.control전체{len(baseline['control'])}를owner preflight에서bytes/fullSHA전수검문한뒤에만port/run/temp/child/HTTP로진행한다. baseline자기자신은fixedSHA로검문하고control표에서제외했다. external--scope는source집합/branch/fullHEAD/status12까지검문한다.

## 4. 요구사항과 Sol 파일별 구현 전략

다음은 `{CTRL/'STRATEGY.md'}` 전문이다. 별도설계가필요하거나기준모순/누락이있으면수정없이BLOCKED한다.

{strategy}

## 5. 프로젝트 불변조건

- 승인·계산원자성/forward-only/근무일기준요율·시급/중복signature UNIQUE/DB스키마를 변경하지 않는다.
- 실적은엑셀인테이크만, DB직접insert/실적직접입력/가짜UI/임의fallback값/조용한데이터절단/window.confirm·alert 금지.
- protected domain/services/bridge/양식/기존tests/설정·계산·API는수정하지않는다. 화면은새로계산은그대로원칙유지.
- 실제callbacks/null/false/code/signal/time/originalstack를수정·추정하지않는다. observederror를synthetic으로덮지않는다.
- 자기ChildProcess 및 자기temp만정리하고숫자PID를실제close대신사용하지않는다. foreignPID·과거run·운영DB·기존Chromeprofile은정리하지않는다.
- 실패검사를삭제/완화/skip/기대값변경해서통과시키지않는다. 최신실패원문도전수보존한다.
- UI는실제Chrome실행/캡처/클릭·키보드·console/network검문이필수다. 이번UI범위는A1core로그인DOM/설치Chrome1440x900/회귀shell·home다. 전체87화면수용이아니다.

## 6. 착수 게이트 — 하나라도 불일치하면 수정 금지

1. AGENTS/.ai/HARNESS/PROTOCOL/GEMINI 및위정본·source호출점을읽는다.
2. repository/main/fullHEAD/status12 및수정전2제품SHA/bytes를실측대조한다. 범위밖기존변경을정리하지않는다.
3. 모든새정본fullSHA/bytes와frozen을실측대조한다. 미누락도구·기존TypeScript/Node/Python/npm/Chrome/Playwright를확인한다. 새의존성설치금지.
4. 아래착수scope 명령을 실행해source341/protected339/status12 PASS를확인한다.
5. REQUIREMENTS/STRATEGY/두파일30k/음성기준이닫혀있고서로모순없음을확인한다. 구조변경·더넓은수정없이불가능하면BLOCKED.

## 7. 정확 검증 명령과 기대값

작업디렉터리는모든명령 `{REPO}`. 아래실측hash를문자그대로사용한다.

```powershell
& '{PY}' -X utf8 -B '{CTRL/'gate-evidence.py'}' --execution-sha {eh} --baseline-sha {bh} --scope
```

수정후다음고정driver를실행한다. driver는새OS임시evidence폴더에명령별PID/UTCstart/end/RC/stdout/stderr/fullSHA/±diff·hunks를저장하며제품코드/정본을수정하지않는다. 명령목록은해당file의닫힌배열로고정돼있다. driver자체실행은Sol이번제어검증에서미실행이고Gemini구현후필수다.

```powershell
& '{PY}' -X utf8 -B '{CTRL/'implementation-checks.py'}'
```

| driver 내부 exact 명령/단계 | 기대값 |
|---|---|
| node --check scripts/ui-checks/access-history.mjs 및 access-history-shared.mjs | RC0, 2구문PASS |
| npm.cmd run typecheck / lint / validate:map; git diff --check; npm.cmd run build | RC0, lint기존warning5/map90 |
| npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1 | RC0, 3files/11tests |
| 위gate 동일args --self-test; runtime-probes.py --execution-sha {eh} --baseline-sha {bh} --self-test | RC0, original19/legacy35/new43 및순서·획득13거절 |
| runtime-probes.py --execution-sha {eh} --baseline-sha {bh} | RC0/suitePASS, 원86records/51fault/CLI9/deferred8/lock3/positive6/final6/PNG12/freshobserver45·변조9 |
| node ipc-probes.mjs | RC0, IPC19+actualoccupiedport1=20조건 |
| node component-probes.mjs --core-manifest (driver가원runtime양성core의실제manifestPath추출) --execution-sha {eh} --baseline-sha {bh} | RC0, semantic6/top4/typed32/actualChromeclose2 |
| node partial-probes.mjs | RC0, actual11; v7는옛partialbootstrapCLI허용0 |
| lifecycle-probes.py --guard | RC0, actualpureguard 정상1/거절5 |
| lifecycle-probes.py (옵션없음) | RC0, actuallate15/suitePASS, canaries아님 |
| 위gate 동일args --scope | RC0, source341/protected339/dirty12/control{len(baseline['control'])}/frozen/HEAD불변 |

driver 안의 `.mjs/.py`는모두위fullpath `{CTRL}`로확정된다. component actualmanifest를임의guess/기존run으로대체하지않는다. driver summary `IMPLEMENTATION_CHECKS_PASS_NOT_SOL_ACCEPTANCE`는제출준비일뿐A1수용이아니다. 하나라도명령이실패하면실패receipt와원문을보존하고FAILED로회신하며기준/test/control을고치지않는다.

### 필수 음성/실측 판정

- 삭제전late4: cache뒤실제오류·첫stack/currentledger확인, RC1/PASS없음, exacttemp실제보존, candidate/gate/final0.
- gate중late4·double1·gateactualresponse/mismatch1: 실제owncandidate staging/rename→gatespawn→오류순서, actualtemp삭제상태/currentfailurecallback/첫stack/secondary원오류/CORE최초획득binding, final/PASS0.
- final-stage5: 실제final.tmp write완료파일존재→오류→beforeCommit차단, targetfinalrename/PASS0, 세process현재failure기록.
- pureinvalid5는ownerguard가모두거절. guard추출은fixedhelper와비교하며새외부helper의숨은의존성금지.
- runtime51/partial11 등의기대음성RC1과상위suite RC0/PASS를구분한다. actualtrigger없음·wrongprimary·staleledger·정본거절을음성통과로쓰지않는다.
- canary/--bootstrap-v6/--guard-v6-gap/replay-v6를Gemini의actualv7시험대용으로쓰지않는다.
- capture12개파일의bytes/fullSHA/PNG규격1440x900이상, 실제core DOM/회귀click·keyboard/consoleErrors0/pageErrors0/requestFailed0을확인한다. 사용자직접시각확인3-1e는별도대기다.

## 8. 종결·성공 조건·즉시 중단

전E7-01..08은source위치와실제증거로대조하고빠진검문은UNVERIFIED로기록한다. 정상·음성·scope·UI·diff/receipt전부통과해야IMPLEMENTED제출가능하며Sol독립검수후에만수용된다. 최초실패/가정/미검증을숨기지않는다.

범위밖수정/30k초과/새API·DB·권한·계산판단/새패키지·제품파일/시험완화/정본·baseline수정/도구부재/foreignport·foreignprocess정리가필요하면즉시BLOCKED. 이전quota실패가Sol직접코딩권한으로바뀌지않는다. existingLog는append-only, TODO/state는Sol의사용자승인된계획관리만갱신가능하다.

## 회신

Gemini는다음양식을보이는본문으로채운다. 본문/정본파일은변경하지않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: repository / branch / fullbaselineHEAD
초기 상태: status12/착수게이트/scope결과
변경 파일: 각E7-ID/실제symbol/줄번호/byte/fullSHA
범위 밖 변경: 0개 | 정확경로·사유
요구사항 대조: E7-01..08 각각 PASS/FAIL/BLOCKED/UNVERIFIED와근거
결함 대조: A1V6-01..03/T01/R01 원인->변경위치->정확재현명령->실제결과
implementation-result.json: 실제fullpath/fullSHA/bytes
명령 증거: 모든actualargv/cwd/PID/UTCstart/end/RC/stdout/stderr/fullSHA·핵심개수
음성: 원51+late15+guard5/partial11의actualtrigger·첫stack/현재ledger/temp/게시차단/corebinding
UI: URL/실제Chrome viewport/12PNGfullpath·bytes·SHA/click·keyboard/console·network
diff: received-product대비±줄/hunks/전체diffpath/fullSHA/byte/생성물·의존성변경
보호: source341/protected339/control{len(baseline['control'])}/frozen/main/fullHEAD/status12
자원: exactownchild/log/Chromeclose·port18741·retainedownartifact/temp경로
미해결/가정/실패原文: 없음 | 전수목록
TODO제안: 직접수정0; Sol검수에따른제안만
```
'''
    packet_bytes=packet.replace('\n','\r\n').encode('utf-8')
    sent=DOC/'Log'/(stamp+'_3-2c-A1-v7-Sol-IMPLEMENT_발송본.md');fresh(sent,packet_bytes)
    assert sent.read_bytes()==packet_bytes
    (DOC/'HANDOFF.md').write_bytes(packet_bytes);assert (DOC/'HANDOFF.md').read_bytes()==sent.read_bytes()
    assert prep.snapshot()==before
    for p,h in baseline['control'].items():assert meta(Path(p))==h,p
    for p,h in initial['historicalControls'].items():assert meta(Path(p))==h,p
    scope_after=json.loads(validate.command('scope-after-dispatch',gate+['--scope']));assert scope_after['status']=='PASS'
    dump(REPORT/'dispatch.json',{'status':'READY_TO_CODE_USER_MANUAL_RELAY_PENDING','time':when,'sourceBefore':before,'sourceAfter':prep.snapshot(),'productEditsBySol':0,'historicalControlsUnchanged':69,'controlFiles':len(baseline['control']),'versionControlFiles':len([p for p in CTRL.iterdir() if p.is_file()]),'baseline':meta(CTRL/'baseline.json'),'execution':meta(CTRL/'execution.json'),'gate':meta(CTRL/'gate-evidence.py'),'receivedArchive':{'path':str(archived),**meta(archived)},'sentArchive':{'path':str(sent),**meta(sent)},'currentHandoff':meta(DOC/'HANDOFF.md'),'scopeBefore':scope,'scopeAfter':scope_after,'validation':meta(REPORT/'control-validation-ready.json'),'counterReset':0,'A1Accepted':False,'implementationDriverExecuted':False,'next':'User manually relays current HANDOFF to Gemini; then Sol independent verification'})
    print(json.dumps({'status':'READY_TO_CODE','time':when,'controlFiles':len(baseline['control']),'versionControls':len([p for p in CTRL.iterdir() if p.is_file()]),'sent':meta(sent),'sourceUnchanged':True,'A1Accepted':False},ensure_ascii=False))
if __name__=='__main__':main()
