# -*- coding: utf-8 -*-
"""Close the immutable validation target, then update only factual control state."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import socket
import subprocess
import sys
sys.dont_write_bytecode = True
REPORT = Path(__file__).resolve().parent
DOC = REPORT.parent.parent.parent
CTRL = DOC / '.ai/contracts/phase3-2c-a1-v4'
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def meta(path):
    b = path.read_bytes()
    return {'bytes': len(b), 'sha256': sha(b)}

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def fresh(path, data):
    with path.open('xb') as out:
        out.write(data)

def dump(path, obj):
    fresh(path, (json.dumps(obj, ensure_ascii=False, indent=2)+'\n').encode('utf-8'))

def snapshot():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=REPO).decode('utf-8')
    names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').rstrip('\0').split('\0')
    return {'repository': str(REPO), 'head': git('rev-parse','HEAD').strip(),
            'branch': git('branch','--show-current').strip(),
            'status': git('status','--porcelain','--untracked-files=all').splitlines(),
            'files': {n: meta(REPO/n) for n in sorted(names)}}

def module(name, p):
    s=importlib.util.spec_from_file_location(name,p)
    m=importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m

def main():
    initial=load(REPORT/'initial-evidence.json')
    assert snapshot()==initial['sourceBefore']
    for p,m in initial['controlBefore'].items():
        assert meta(Path(p))==m,p
    for p,m in initial['ownControls'].items():
        assert meta(Path(p))==m,p
    assert meta(DOC/'HANDOFF.md')=={'bytes':initial['receivedBytes'],'sha256':initial['receivedSha256']}
    assert (DOC/'HANDOFF.md').read_bytes()==Path(initial['archive']).read_bytes()
    commands=module('independent_review_commands',REPORT/'review-commands.py')
    scoped=commands.run('scope-final-before-close',commands.GATE+['--scope'],30)
    assert scoped['rc']==0
    for name in ['scope-before','syntax-owner','syntax-shared','typecheck','lint','map','diff-check','build',
                 'focused-tests','runtime-suite','ipc-suite','component-suite','partial-suite']:
        rec=load(REPORT/(name+'.command.json'))
        assert rec['rc']==0 and not rec['timeout'],name
    runtime_summary=json.loads((REPORT/'runtime-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    runtime_root=Path(runtime_summary['artifact'])
    runtime=load(runtime_root/'suite-result.json')
    assert runtime['status']=='PASS' and len(runtime['records'])==79 and runtime['requiredFaultCount']==44
    v1=module('fixed_original_v1',DOC/'.ai/contracts/phase3-2c-v1/verify-evidence.py')
    captures=[]
    temp_refs=set()
    for rec in runtime['records']:
        for p in rec.get('retainedOwnedTemps',[]):temp_refs.add(p)
        if rec['name'] in ['positive-contract-core','positive-regression-shell','positive-regression-home',
                           'observed-positive-contract-core','observed-positive-regression-shell','observed-positive-regression-home']:
            manifest=load(Path(json.loads(rec['output'])['manifestPath']))
            for a in manifest['artifacts']:
                if a['path'].endswith('.png'):
                    p=Path(a['path']);assert meta(p)=={'bytes':a['bytes'],'sha256':a['sha256']}
                    captures.append({'case':rec['name'],'path':str(p),'dimensions':v1.png_dimensions(p.read_bytes()),**meta(p)})
    assert len(captures)==12
    ipc=json.loads((REPORT/'ipc-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    assert ipc['status']=='PASS' and len(ipc['results'])==20 and all(r['accepted'] for r in ipc['results'])
    comp=json.loads((REPORT/'component-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    assert comp['status']=='PASS' and comp['typedMutationCount']==25 and len(comp['resources'])==2
    part_summary=json.loads((REPORT/'partial-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    part=load(Path(part_summary['artifact'])/'suite-result.json')
    assert part['status']=='PASS' and len(part['results'])==5 and all(r['accepted'] for r in part['results'])
    for r in part['results']:temp_refs.add(r['tempDir'])
    extra=load(REPORT/'extra-owner-results.json')
    assert all(r['owner']['rc']==0 and r['owner']['observerHealthy'] and r['owner']['faultTriggered']
               and r['fixedFinal']['rc']==0 and r['owner']['quiescenceObserved'] for r in extra['results'])
    clock=extra['results'][1]['timestampChanged']
    assert clock['changed'] and clock['publishedValue']-clock['suppliedValue']==250
    private=load(REPORT/'extra-private-evidence.json')
    a,b=private['records'];assert a['mode']=='measured-viewport' and b['mode']=='canonical-missing'
    assert a['workerRc']==0 and a['workerFinal']['status']=='PASS' and a['raw']['viewport']==[1440,900]
    assert 'null-viewport-delivered' in a['eventTypes']
    assert b['workerRc']==1 and b['partialExists'] is False and 'fault-triggered' in b['eventTypes']
    for r in private['records']:temp_refs.add(r['tempDir'])
    helper=load(REPORT/'collector-extra.json')
    assert len(helper['records'])==7 and all(r['rejected'] is False for r in helper['records'])
    coverage=load(REPORT/'partial-check-coverage.json')
    assert all(len(r['availableIds'])>=8 and r['actualChecks']==[] for r in coverage)
    pid_audit=load(REPORT/'pid-audit.json');pid_records=load(REPORT/'observed-pids.json')
    reused=[]
    for live in pid_audit['live']:
        created=datetime.strptime(live['createdUtc'][:26],'%Y-%m-%dT%H:%M:%S.%f').replace(tzinfo=timezone.utc)
        ended=[]
        for r in pid_records[str(live['pid'])]:
            if isinstance(r['ended'],(int,float)):ended.append(datetime.fromtimestamp(r['ended']/1000,tz=timezone.utc))
            else:ended.append(datetime.fromisoformat(r['ended']))
        assert created>max(ended),'Unexpected observed process still live'
        reused.append({**live,'previousObservedCloseUtc':max(ended).isoformat(),'identity':'LATER_FOREIGN_PID_REUSE_NOT_TERMINATED'})
    with socket.socket() as port:port.bind(('127.0.0.1',18741))
    findings=[
       {'id':'A1V4-01','requirement':'E4-02','proof':'ACTUAL_OWNER_FALSE_PASS_AND_SOURCE_GAP',
        'source':'access-history.mjs:215-233,493-496',
        'finding':'Observed timestamps clamped; null exitCode becomes0. Injected finish timestamp is increased250ms; owner and immutable final gate both rc0.',
        'evidence':['extra-owner-results.json','extra-timestamp-regression.command.json']},
       {'id':'A1V4-02','requirement':'E4-05','proof':'ACTUAL_OWNER_FALSE_PASS',
        'source':'access-history.mjs:341-354',
        'finding':'Valid ACK plus unapproved:true accepted despite exact ACK key contract; owner and fixed final both rc0.',
        'evidence':['extra-owner-results.json','extra-owner-extra-ack.command.json']},
       {'id':'A1V4-03','requirement':'E4-03','proof':'ACTUAL_PRIVATE_WORKER_FALSE_PASS',
        'source':'access-history-shared.mjs:507-509',
        'finding':'Actual API return null is replaced by [1440,900]; real private worker rc0/worker-final PASS. Actual screen remains1440x900; experiment targets missing measurement.',
        'evidence':['extra-private-evidence.json','extra-private-null-and-early.command.json']},
       {'id':'A1V4-04','requirement':'E4-04','proof':'ACTUAL_HELPER_REJECTION_FAILURE_AND_SOURCE_GAP',
        'source':'access-history-shared.mjs:338-347,384-418',
        'finding':'Seven invalid raw mutations accepted: repeated/reversed/extra resource states, numeric/bool/array IDs, self-supplied canonical path. Original typed rule rejects first6; hardcoded rules remain.',
        'evidence':['collector-extra.json','diff-and-helper-comparison.json']},
       {'id':'A1V4-05','requirement':'E4-07','proof':'ACTUAL_PARTIAL_LOSS_AND_SOURCE_GAP',
        'source':'access-history-shared.mjs:457-480,545,575-583',
        'finding':'Canonical virtual read failure after valid ACK/RUN produces no core-partial/fallback. All5 accepted partial tests contain8/9 acquired rule values but checks=[]; raw/context are preserved for those later failures.',
        'evidence':['extra-private-evidence.json','partial-check-coverage.json']},
       {'id':'A1V4-T01','requirement':'Sol independent control coverage','proof':'ACTUAL_CONTROL_COVERAGE_GAP',
        'source':'.ai/contracts/phase3-2c-a1-v4/runtime-probes.py/component-probes.mjs/partial-probes.mjs/gate-evidence.py',
        'finding':'Original44/IPC19/typed25/partial5 PASS yet extra ACK, clamped time, null viewport, resource sequence/ID and acquired-check omissions escape. Original gates remain unchanged.',
        'evidence':['extra-owner-results.json','collector-extra.json','partial-check-coverage.json']},
       {'id':'A1V4-R01','requirement':'Reproducible reply evidence','proof':'INDEPENDENT_DIFF_AND_REPLY_COMPARISON',
        'source':'Received HANDOFF reply diff and requirement matrix',
        'finding':'Actual owner215added/285deleted/23hunks and shared180added/125deleted/13hunks differ from reply counts. E4-03/E4-05 reply labels mismatch locked requirements. Source SHA claims are correct.',
        'evidence':['diff-and-helper-comparison.json','received-product']}]
    dump(REPORT/'findings.json',findings)
    audit={'time':datetime.now().astimezone().isoformat(),'sourceBeforeEqualsAfter':True,
           'scopeFinal':scoped,'lockedControlsBeforeClose':62,'baselineAndAll13V4FilesUnchanged':True,
           'captures':captures,'pids':{'observed':pid_audit['queried'],'nonLive':pid_audit['queried']-len(reused),'reused':reused},
           'port18741Free':True,'retainedOwnedProductTemps':[p for p in sorted(temp_refs) if Path(p).exists()],
           'runtimeRoot':str(runtime_root),'ipcRoot':ipc['artifact'],'partialRoot':part_summary['artifact'],
           'extraPrivateRoot':private['suiteRoot'],'limits':['Direct owned process callbacks/PID identity only, not every historical/internal Chrome process',
               'Actual private stub tests are not full owner/app acceptance','No full919 rerun','Existing UI source untouched; inspected actual core/home captures2 only'],
           'productSourceEditsBySol':0,'aiCliInvocations':0,'commitPushDeploy':0,'immutableControlsEdited':0}
    dump(REPORT/'final-audit-before-close.json',audit)
    closed_at=datetime.now().astimezone();when=closed_at.strftime('%Y-%m-%d %H:%M:%S KST')
    dump(REPORT/'review-target-closed.json',{'time':when,'verdict':'FAILED / A1_NOT_ACCEPTED',
          'reason':'Five product finding families plus control/reply gaps','scopePassedBeforeClosure':True,
          'oldBaselineNowHistorical':True,'productEditsBySol':0,'newImplementationAuthorization':False})
    existing_logs={str(p):meta(p) for p in (DOC/'Log').iterdir() if p.is_file()}
    source=initial['sourceBefore']
    head=source['head']
    products='\n'.join(f"- `{n}`: {m['bytes']}bytes / `{m['sha256']}`" for n,m in source['files'].items() if n in ['scripts/ui-checks/access-history.mjs','scripts/ui-checks/access-history-shared.mjs'])
    table='\n'.join(f"| {f['id']} | {f['requirement']} | {f['proof']} | {f['finding']} |" for f in findings)
    review=f'''# HANDOFF — 3-2c A1 v4 구현 제출 독립 검수 결과

- Task: Gemini A1 v4 IMPLEMENTED 회신 검수
- Action: REVIEW / CLOSED
- From: Sol(xhigh, Codex)
- To: 사용자 / Gemini 참고
- Time: {when}
- 판정: **FAILED / A1_NOT_ACCEPTED — 수용 보류**
- 회신: 불필요
- Repository: `{REPO}` / main
- HEAD: `{head}`
- 제품 소스 수정·commit·push·배포·다른 AI CLI 호출: Sol 0건

## 결론

허용 범위/보호 hash/static/build/관련11시험, 지정 runtime44+preflightlock3/CLI9/deferred8, 무계측3+관측3/final6/실제12PNG, IPC19+port, typed25/top4/semantic6/실제Chrome close2, partial5는 Sol의 실제 독립 실행에서도 통과했다.

그러나 추가 시험은 **owner 허위PASS2건(추가 ACK 키·관측 시각250ms 보정)**, **private worker 허위PASS1건(null viewport→상수1440x900)**, 부정raw7개 수용, 초기 실패 partial 부재 및 획득한8~9개 검사 기록을 비운 partial을 확인했다. 고정 final gate도 owner 추가2건을 통과시켜 Sol 검수 조건의 빈틈도 확인됐다. 지정 시험 PASS와 A1 수용은 같지 않다. 이번 제출은 **A1 prerequisite로도 수용하지 않는다**.

기존 R32C-06 동일 결함군 두 CORRECT 소진/초기화0을 유지한다. 이번 IMPLEMENT 검수 대상은 종결했으며 CORRECT3/새 Gemini 제품 구현 지시는 발행하지 않았다. 다음은 Sol이 실제 관측값 보존·ACK 경계·초기부터의 partial·닫힌 collector와 누락된 검수 조건을 다시 닫는 단계다. 원본 v1 CORE9/fullUI87, A2정상8/login/remainingA-N01~20 및 B 전체 검수·전체3-2·배포 의무는 대기한다.

## 1. 수신·범위·정본

- 수신 원문 `{initial['archive']}`: {initial['receivedBytes']}bytes / `{initial['receivedSha256']}`. 검수 전 보존, 수신과 보존 bytes 동일.
- 발송 원본 요청 본문29145bytes와 실제 회신 heading 경계에서 비교: **byte 동일**. `## 회신`만 변경됐다.
- 제품 source341/허용2/보호339, main/fullHEAD/status12 검수 전후 불변. baseline 대비 변경은 허용2뿐이고 제출 bytes/SHA와 실제값이 일치한다.
{products}
- shared frozen fragment6575bytes / `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 불변. baseline.control62 및 baseline 포함 v4 파일13, 역사 v1/v2/v3 정본 검수 중 불변.
- 이전2파일의 받은 원문 `{DOC / '.ai/reports/phase3-2c-a1-v4-replan-20261012_154142/received-product'}`, 이번 원문 `{REPORT / 'received-product'}`으로 실제 hunk 비교. HEAD에 없는 untracked 검증파일도 snapshot diff로 검문했다.
- 실제 diff: owner +215/-285·23hunks·708→638줄, shared +180/-125·13hunks·532→587줄. 회신의 +56/변경18 및 +40/변경14와 다르다. 회신 E4-03/E4-05 설명 연결도 정본과 어긋난다. 이는 회신 증거의 정확성 문제이며 범위 밖 제품 변경으로 판정하지 않는다.

## 2. 독립 실행과 제출 증거

| 항목 | 실제 결과 |
|---|---|
| 범위·구문2/typecheck/lint/map/diff/build | 전부rc0, 기존lint5warnings/지도90 |
| 관련 시험 | 3파일11시험 PASS |
| fresh observer 자기검증 | 실제37 / event변조9 거절, control SHA binding 검문 |
| 무계측양성3+관측양성3 / fixed final6 | 전부rc0; 실제core1/shell4/home1씩 총12PNG bytes/SHA/PNG CRC·크기 확인 |
| 원본 runtime | fault44/preflightlock3/CLI9/deferred8 PASS, 79command records |
| 실제 IPC | private19+occupiedport PASS, 실제offlineChrome 진단 |
| component | semantic6/typed25/topinvalid4/실제 소유Chrome closethrow2 PASS |
| 원본 partial |5종 모두rc0/accepted=true, 뒤에서 checks 누락 확인 |
| 추가 ACK key | ownerrc0/PASS, observer healthy/trigger true, immutable final도rc0 |
| 추가 관측 clock 역전 | 실제SUT에 준 finish 값 {clock['suppliedValue']}→게시값 {clock['publishedValue']} (250ms 보정), owner/final 모두rc0 |
| 추가 viewport null | 실제Chrome/DOM, page API 반환null, private workerrc0/worker-final.PASS, raw.viewport=[1440,900] |
| 추가 helper raw7 |7개 전부 수용; 원본v1 typed checker는 그중6개 거절 |
| 추가 초기 canonical read 실패 | validACK/RUN 뒤 workerrc1, core-partial 및 fallback 없음, Chrome/DOM 생성 전 실패 |
| 획득 checks 대조 |원본partial5에서 실제 raw의8/9개 rule 값 확보했으나 checks=[] 전부0 |

실제 Sol runtime `{runtime_root}`, IPC `{ipc['artifact']}`, partial `{part_summary['artifact']}`, 추가 private `{private['suiteRoot']}`. Gemini 제출 runtime `C:\\Users\\pangyo\\AppData\\Local\\Temp\\shiftmgmt-sol-a1v4-runtime-5tdcspny`도 PASS/79records/44fault 및 artifact 존재를 읽어 대조했다. 제출한 fullSHA는 실제2제품과 일치했다. root는 제출 주장에만 의존하지 않고 모든 필수 suite를 재실행했다.

실제 로그인/home 캡처2개를 직접 열어 확인했다. UI 소스339는 원래 보호되어 그대로다. 정상8/활동이력 전체UI87·시안 전부의 시각 수용으로 확대하지 않는다. 전체919시험은 이번에 재실행하지 않았다.

## 3. 미해결 결함 / 근거 구분

| ID | 연결 요구 | 증거 종류 | 미해결 |
|---|---|---|---|
{table}

### A1V4-01 — 관측값 보정과 없는 exitCode

`scripts/ui-checks/access-history.mjs:215-233`은 exit/close/finish/close 시각을 순서에 맞춰 고치고 null exitCode를0으로 만든다. `:493-496`도 제거/seal 시각을 Math.max로 보정한다. actual worker stdout finish callback에서 Date.now 반환을 child close보다250ms 이전으로 한 번만 바꿨다. 독립 observer는 캡처한 실제 clock으로 사건을 기록하여 건강한 hash chain을 유지했다. owner는 실제 받은 값에250ms를 더해 게시했고 원본 v4 final도 PASS했다. 이는 실제 열린 자원 누수나 실제 화면 변경 실험이 아니라 **잘못된 관측값을 보정해 성공 증거로 만든 실제 시험**이다.

원본 worker-spawn-error의 owner-failure도 pid=null/exitSeen=false인데 exitCode=0이다. exit 미관측과 child.close는 별개이며 0을 실제 exit 결과로 주장할 수 없다. 근거 `extra-owner-results.json`, `extra-timestamp-regression.command.json`/events/원본final검문, runtime의 spawn-error snapshot.

### A1V4-02 — owner ACK 추가 키 수용

`access-history.mjs:341-354`는 protocol/case/PIDs/nonce/context SHA만 검사하며 ACK key 집합을 닫지 않는다. 실제 worker의 유효 ACK에 unapproved:true 한 키만 추가하여 owner로 전달했다. owner는 RUN을 허용하고 실제core를 수행해 rc0/PASS, 원본 final도rc0이다. private19의 packet/context/registration/RUN 추가 키는 통과했지만 owner ACK는 그19개에 없다. 근거 `extra-owner-results.json`/`extra-owner-extra-ack.*`.

### A1V4-03 — 미측정 viewport를 상수로 게시

`access-history-shared.mjs:507-509`는 page.viewportSize()가null이면[1440,900]으로 바꾼다. 실제Chrome/stub/validACK/RUN 후 해당 API 반환만null로 바꿨다. 실제화면은1440x900 그대로이며 SUT는 측정하지 못한 값을 상수로 채워 raw/checks/worker-final.PASS(rc0)를 만들었다. private worker의 실제 허위PASS이며 이 시험을 전체 owner/app gate 실행으로 주장하지 않는다. `extra-private-evidence.json` 및 이벤트의 null-viewport-delivered가 정본이다.

### A1V4-04 — 닫히지 않은 collector

`shared:398-406`은 허용 state 각각만 검사해 created 반복·상태 역전·closed 추가를 수용한다. ID는 number/bool/array도 수용했다. 이6개는 원본 typed check_rules가 모두 거절한다. `:384-392`의 canonical 경로는 caller가 같은 실제 파일을 report에 복제한 경로로 바꿔도 자체 bytes/SHA/map만 일치하면 수용한다. 마지막 경로 변조는 full gate가 별도 정본 경로를 검사하므로 전체 owner 허위PASS로 확대하지 않는다. `:338-347,411-418`의 CORE_POINTERS/expected도 계약에서 읽지 않고 상수로 남아 있다. 근거 `collector-extra.json`, `diff-and-helper-comparison.json`; 실제helper7 호출, 제품변경0.

### A1V4-05 — 초기 실패 partial과 획득 checks

`shared:457-480`에서 Chrome/canonical 준비가 run state/try-catch 이전에 실패할 수 있다. canonical exists read 결과만false로 한 번 주입했다. 실제 validACK/RUN 후 원 error stack을 가진 workerrc1이지만 core-partial/fallback 둘 다 없다. source/compiled 파일은 수정하지 않았다.

`shared:545`는 뒤에서 확보한 raw를 남기면서 checks는 무조건[]로 보낸다. 독립 원본 partial5는 모두 PASS했지만 캡처 실패에는8개, close/API값 실패에는9개 실제 rule 값이 raw에 존재해도 검사 기록0이다. 이전 v3처럼 뒤의 raw/context 전체가 소실됐다는 주장으로 확대하지 않으며, **획득 checks 소실과 초기 partial 부재**로 판정한다. 근거 `partial-check-coverage.json`/원본partial5 및 `extra-private-evidence.json`.

### A1V4-T01 — Sol 검수 조건 보강 필요

원본44/IPC19/typed25/partial5를 전부 통과하는 구현에 추가3종 허위PASS와7helper거절 실패가 공존했다. 원본 final도2owner 변조를 통과했다. existing partial control은 checks가배열인지까지만 확인하므로[]가통과한다. 이번 검수에서 고정 검사기를 수정해 제출을 통과시키지 않았고, 새 report copy의 실제 오류 주입만 사용했다. 다음 전략에는 누락 ACK/관측값 동일성/null/정확state·ID/초기 및 획득checks 검문을 포함해야 한다.

사전잠금은 실제 baseline.files+baseline.control 전체를 검사했고 frozen/control read-drift3도 실제거절했다. 보조검토의 "strategy/frozen을 읽지 않는다"는 초기 주장은 Sol이 for-loop 및 lock3 결과로 정정했다. 그 주장은 결함에 포함하지 않는다.

## 4. 재현 명령 / 원문 보존

정본 cwd `{REPO}`, Python `{sys.executable}`, control `{CTRL}`. 모든 exact argv/cwd/PID/start/end/rc/timeout/stdout/stderr/hash는 이번 report `*.command.json`에 있다.

```powershell
# 이번 실제 실행 명령. 기존 증거를 덮어쓰지 않으므로 재실행에는 새 report 경로가 필요.
python -X utf8 -B "{REPORT / 'review-commands.py'}" static
python -X utf8 -B "{REPORT / 'review-commands.py'}" runtime
python -X utf8 -B "{REPORT / 'review-commands.py'}" ipc
python -X utf8 -B "{REPORT / 'review-commands.py'}" component
python -X utf8 -B "{REPORT / 'review-commands.py'}" partial
python -X utf8 -B "{REPORT / 'extra-owner.py'}"
node "{REPORT / 'collector-extra.mjs'}" "C:\\Projects\\Active\\ShiftMgmt_V4\\artifacts\\captures\\phase3\\access-history-contract-core\\run-20261012-174854-GklWdI\\core-observations.json"
node "{REPORT / 'partial-extra-probes.mjs'}"
```

追加 private controlのrc1は予期した失敗検出で、SUT viewport-null workerのrc0/early canonical workerのrc1を分けて記録した。通常のsuite PASSに数えない。実行root/receipt/partial/event原文は保全し、原検査器/製品には変更0。

## 5. 자원·정리·수용 범위

관측 PID238개를 읽기 전용 CIM으로 조회했다.237 non-live,46432는 실제 child.close 뒤101초 후 생성된conhost.exe로 재사용됐다. 해당 외부PID는 종료하지 않았다. own18741은bind가성공해비어있다. 직접 관측된 child/자기Chrome API close와 PID identity 확인이며 역사적 모든Chrome/모든실패분기 종료로 확대하지 않는다.

이번 fault/private 실행에서 자기 생성 product temp{len(audit['retainedOwnedProductTemps'])}개를 증거로 보존했다. 정확한 경로는 `final-audit-before-close.json`에 있다. runtime/selfcheck/IPC/partial/report 산출물도 보존한다. 이전/foreign/운영DB/V3.4/Chrome profile/역사temp에 쓰기·삭제0. source341/보호339/control62는 검수 내내 불변이다.

## 6. 종결 / 다음 행동

**FAILED / A1_NOT_ACCEPTED**. IMPLEMENTED 회신은 제출이고 수용은 아니다. 검수대상을 먼저 종결한 뒤 TODO/current-state의 사실 상태만 갱신한다. old v4 baseline은 닫힌 검수의 역사 자료이며 변경된 상태를 검증하는 새 승인으로 재사용하지 않는다.

R32C-06 두회수소진/회수초기화0 유지. 새 Gemini 구현허가/자동CORRECT3/A2/B 실행허가0. Sol은 관측값 불변·닫힌 ACK/collector·최초 단계 partial·획득 checks 및 추가control조건을 다시 닫아야 한다. 사용자 요청 없이 제품 소스를 직접 수정하거나 다른AI를 호출하지 않는다.

전체 기계증거 `{REPORT / 'final-evidence.json'}`, `findings.json`, `final-audit-before-close.json`, 각command와raw artifact. 수신원본은 위Log에 보존, 이검수종결본도Log에원문으로추가한다.

## 회신

Sol 독립검수 종결. 사용자 보고 FAILED / A1_NOT_ACCEPTED. 새 제품 구현 지시 없음.
'''
    # Keep the report Korean; avoid accidental mixed-language template remnants.
    review=review.replace('追加 private controlのrc1は予期した失敗検出で、SUT viewport-null workerのrc0/early canonical workerのrc1を分けて記録した。通常のsuite PASSに数えない。実行root/receipt/partial/event原文は保全し、原検査器/製品には変更0。',
        '추가 private control의 rc1은 예상된 실패 검출이다. SUT viewport-null worker rc0와 early canonical worker rc1을 각각 구분하여 기록했다. 정상 suite PASS에 더하지 않는다. 실행 root/receipt/partial/event 원문 보존, 원 검사기/제품 수정0.')
    received=(DOC/'HANDOFF.md').read_bytes()
    assert sha(received)==initial['receivedSha256']
    close_archive=DOC/'Log'/(closed_at.strftime('%Y%m%d_%H%M%S')+'_3-2c-A1-v4-Sol-FAILED_독립검수종결본.md')
    fresh(close_archive,review.encode('utf-8'))
    (DOC/'HANDOFF.md').write_bytes(close_archive.read_bytes())
    assert (DOC/'HANDOFF.md').read_bytes()==close_archive.read_bytes()
    # The target is now closed. Only factual TODO/state updates follow.
    fresh(REPORT/'TODO.before-status-update.md',(DOC/'TODO.md').read_bytes())
    fresh(REPORT/'current-state.before-status-update.md',(DOC/'.ai/current-state.md').read_bytes())
    todo=(DOC/'TODO.md').read_bytes().decode('utf-8');nl='\r\n' if '\r\n' in todo else '\n'
    marker='## 지금 위치와 다음 행동'+nl+nl
    assert todo.count(marker)==1
    entry=(f'> **최신 정본({when})**: A1 v4 IMPLEMENTED 제출 독립검수 **FAILED / A1_NOT_ACCEPTED, 수용 보류**. '
       '지정runtime44/lock3/CLI9/deferred8·양성6/final6/12PNG·IPC19+port/typed25/partial5·static/build/관련11 모두PASS. '
       '추가 실제owner 허위PASS2(ACK추가키·시각250ms보정)/private viewportnull 허위PASS1·부정raw7수용·초기partial부재·획득8/9값의checks0 재현. '
       '고정gate도owner2통과하여Sol검수커버리지보강필요. source341/허용2/보호339/control62 검수중불변·Sol소스수정0·종결뒤사실상태갱신. '
       'R32C-06 기존두CORRECT소진/초기화0·새Gemini구현허가0·A2/B/전체3-2배포대기. '
       f'종결 `Log/{close_archive.name}`, 현재 `HANDOFF.md`. 아래 이전정본은이력.')
    todo=todo.replace(marker,marker+entry+nl+nl,1)
    todo=todo.replace('**Phase3-2c-A1 v4 재설계·IMPLEMENT READY_TO_CODE / 수동 중계 대기. A1_NOT_ACCEPTED 유지.**',
        '**Phase3-2c-A1 v4 독립검수 FAILED / A1_NOT_ACCEPTED·관측값/ACK/collector/partial 및 검수 조건 재설계 필요.**',1)
    todo=todo.replace('| **다음 행동** | 사용자가 현재 HANDOFF를 Gemini에 수동 전달→허용2파일 v4 구현·실제 검증 회신→Sol 독립검수. A1 미수용·A2/B는 계속 대기. |',
        '| **다음 행동** | Sol이 관측값 불변·닫힌 ACK/collector·초기 partial·획득 checks와 누락 검수 조건을 재설계한다. 현재 HANDOFF는 종결 검수 결과이며 새 Gemini 구현 허가 없음. A1/A2/B 수용 대기. |',1)
    lines=todo.splitlines(keepends=True);updated=0
    for index,line in enumerate(lines):
        if line.startswith('  - 🔄 3-2c. A1 v4 재설계 마무리'):
            lines[index]='  - 🔄 3-2c. A1 v4 독립검수 FAILED / A1_NOT_ACCEPTED. 원본CORE9/fullUI87·R32C-06 소진 이력 유지. Sol 관측값/ACK/collector/partial와검수조건재설계필요. A2/B/전체3-2수용·배포대기. 현재 `HANDOFF.md`, 종결 `Log/'+close_archive.name+'`.'+nl;updated+=1
        elif line.startswith('    - 🔄 3-2c-A. A1 v4 IMPLEMENT 준비 완료'):
            lines[index]=f'    - ⏸ 3-2c-A. A1 v4 제출 FAILED / A1_NOT_ACCEPTED ({when}). 지정44/lock3/양성6/IPC19/typed25/partial5 PASS에도실제추가허위PASS3·부정raw7·초기partial없음·획득checks0 미해결. 보호339/control62검수중불변. 기존CORRECT2소진/초기화0·새구현허가0·A2정상8/남은A-N01~20/B87 보존. 근거 `Log/{close_archive.name}`.'+nl;updated+=1
    assert updated==2
    (DOC/'TODO.md').write_bytes(''.join(lines).encode('utf-8'))
    state=(DOC/'.ai/current-state.md').read_bytes().decode('utf-8');snl='\r\n' if '\r\n' in state else '\n'
    old='Status: PHASE_3_2C_A1_V4_READY_TO_CODE_USER_RELAY_PENDING_NOT_ACCEPTED';assert state.count(old)==1
    new=f'''Status: PHASE_3_2C_A1_V4_FAILED_REPLAN_REQUIRED_NOT_ACCEPTED

## Current task — A1 v4 independently not accepted ({when})

- User 「핸드오프 확인해」. Received IMPLEMENTED37055bytes/SHA{initial['receivedSha256']} archived unchanged at {initial['archive']}; request body29145bytes exact against sent archive, reply only changed. Product2 source SHA/bytes claims match.
- Verdict FAILED/A1_NOT_ACCEPTED; review target closed before factual TODO/state update. Source341/allowed2/protected339/main/fullHEAD/status12 and frozen6575bytes unchanged through review. baseline.control62 and all13v4 files/oldv1-v3 controls immutable. Sol product-source edits/AI CLI/commit/push/deploy0; V3.4 read-only.
- Independent static/map90/build/focused3files11 PASS(existing5lintwarnings). Actual runtime79records/44fault/lock3/CLI9/deferred8/observer37+corruptions9 PASS; uninstrumented3+observed3/final6/12PNG. IPC19+port/typed25+top4+semantic6+actualChrome close2/partial5 PASS. Opened actual core/home capture2; full919 not rerun, A2/B/full UI acceptance not claimed.
- Additional actual ownerfalsePASS2: extraACK key accepted, raw log finish observation increased250ms; original fixed final alsoPASS2. Actual private workernullviewport -> hardcoded[1440,900]/workerfinalPASS(rc0). Actual helper7invalidraw accepted; originaltyped6reject, canonical path fullgate anchor separate. Early canonical virtual-read failure aftervalidACK/RUN rc1 but partial/fallback absent; all5accepted partials contain8/9 acquired raw rule values butchecks=[]. Hardcoded CORE rules/receipt timestamps remain source gaps. Stable A1V4-01..05/T01/R01; source-only and executed findings separated.
- Replydiff counts/requirement labels inaccurate; actualowner+215/-285/23hunks, shared+180/-125/13hunks; allowed scope maintained. Preflight source/evidence recheck confirmed full339/control/frozen and actuallock3; discarded initial subagent no-read claim rather than recording it as defect.
- Resourceaudit238observedPIDs:237nonlive,1laterforeignconhostPIDreuse afterobservedclose, noforeigntermination; own18741free. Exactown retained producttemps{len(audit['retainedOwnedProductTemps'])} plus runtime/selfcheck/IPC/partial/reports preserved; no historical/foreign cleanup or productionDB/profile writes. Directcallbacks/PIDidentity proof only, not universalChrome history.
- ExistingR32C-06 twoCORRECTs exhausted/reset0 retained. Currentpacketclosed/noCORRECT3/newGeminiimplementationauthorization0. Sol must replan observation equality/exactACK/closedcollector/earlypartial/acquiredchecks and independent coverage. A2normal8/login/remainingA-N01..20/B87/full3-2/release pending.
- Evidence {REPORT/'final-evidence.json'}, findings.json, final-audit-before-close.json, exactcommands/raw/events; closeout {close_archive}. Oldv4baseline is historical after targetclosure, not authority for modifiedTODO/state.
- FrontierSol; unavailableTerra -> balancedgpt-6-sol read-onlysourceevidence; Sol independently checked sources and actual counterexamples, including correcting erroneous preflight claim. MCPsurface inspected/noMCPfailure; fasthealth26/P04/P06/P13 applied; code_review skill applied, noJev/otherAI invocation.

Earlier entries below are historical and do not override this entry.
'''
    state=state.replace(old,new.replace('\n',snl),1)
    (DOC/'.ai/current-state.md').write_bytes(state.encode('utf-8'))
    assert snapshot()==initial['sourceBefore']
    assert all(meta(Path(p))==m for p,m in initial['ownControls'].items())
    mutated=[p for p,m in initial['controlBefore'].items() if meta(Path(p))!=m]
    assert set(mutated)=={str(DOC/'TODO.md'),str(DOC/'.ai/current-state.md')}
    assert all(meta(Path(p))==m for p,m in existing_logs.items())
    dump(REPORT/'final-evidence.json',{'time':when,'verdict':'FAILED / A1_NOT_ACCEPTED','receivedArchive':initial['archive'],
        'closingArchive':str(close_archive),'closingHandoff':meta(close_archive),'initialEvidence':str(REPORT/'initial-evidence.json'),
        'sourceAfter':initial['sourceBefore'],'sourceBeforeEqualsAfter':True,'audit':audit,'findings':findings,
        'runtime79':runtime,'ipc':ipc,'component':comp,'partial5Summary':part_summary,
        'additionalOwner':extra,'additionalPrivate':private,'partialCheckCoverage':coverage,
        'factualStateUpdatedAfterClosure':mutated,'existingLogsUnchangedOnClosure':len(existing_logs),
        'A1Accepted':False,'newImplementationAuthorization':False,'priorCorrectionsExhausted':2,'counterReset':0,
        'skillUsed':'C:/Users/pangyo/.agents/skills/code_review/SKILL.md'})
    print(json.dumps({'status':'REVIEW_CLOSED','verdict':'FAILED / A1_NOT_ACCEPTED','sourceUnchanged':True,
        'closingArchive':str(close_archive),'runtimeRecords':79,'ownerFalsePass':2,'privateFalsePass':1,
        'invalidHelperAccepted':7,'retainedProductTemps':len(audit['retainedOwnedProductTemps'])},ensure_ascii=False))

if __name__=='__main__':
    main()
