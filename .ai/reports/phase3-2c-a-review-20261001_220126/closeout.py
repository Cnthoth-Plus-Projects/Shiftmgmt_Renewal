# Sol control-only closeout; no product source writes or product acceptance.
import hashlib
import importlib.util
import json
import pathlib
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding='utf-8')
REPORT = pathlib.Path(__file__).resolve().parent
CONTROL = REPORT.parents[2]
PRODUCT = pathlib.Path(r'C:\Projects\Active\ShiftMgmt_V4')
CONTRACT = CONTROL / '.ai/contracts/phase3-2c-v1'

def read(name):
    return json.loads((REPORT / name).read_text(encoding='utf-8-sig'))

def digest(data):
    return hashlib.sha256(data).hexdigest().upper()

def signature(path):
    data = pathlib.Path(path).read_bytes()
    return {'bytes': len(data), 'sha256': digest(data)}

def save(name, data):
    target = REPORT / name
    if target.exists():
        assert json.loads(target.read_text(encoding='utf-8')) == data
        return
    with target.open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)

def audit_resources(core, faults, cases):
    records = [core] + faults + cases
    owners, temps, process_intervals, closed_events = [], [], {}, []
    for record in records:
        end = datetime.fromisoformat(record['end']).timestamp() * 1000
        process_intervals[record['pid']] = max(end, process_intervals.get(record['pid'], 0))
        owner = record.get('ownerFinal')
        if owner:
            path = pathlib.Path(owner['manifestPath'])
            if path.exists():
                manifest = json.loads(path.read_text(encoding='utf-8'))
                owners.append({'path': str(path), 'status': manifest.get('status')})
                temp = manifest.get('owner', {}).get('context', {}).get('tempDir')
                if temp:
                    temps.append({'path': temp, 'exists': pathlib.Path(temp).exists()})
                for key in ('worker', 'server'):
                    info = manifest.get(key, {})
                    if info.get('pid'):
                        process_intervals[info['pid']] = max(end, process_intervals.get(info['pid'], 0))
        for event in record.get('events', []):
            if event.get('childPid'):
                pid = event['childPid']
                process_intervals[pid] = max(end, process_intervals.get(pid, 0))
            if event.get('type') == 'owned-child-really-closed':
                closed_events.append(event)
    for name in ('shared-and-ipc-probe', 'port-occupied-probe', 'submitted-ipc-probe-reproduced'):
        record = read(name + '.command.json')
        end = datetime.fromisoformat(record['end']).timestamp() * 1000
        process_intervals[record['pid']] = max(end, process_intervals.get(record['pid'], 0))
    ipc = json.loads((REPORT / 'shared-and-ipc-probe.stdout.txt').read_text(encoding='utf-8'))
    pid = ipc['ipc']['workerPid']
    process_intervals[pid] = ipc['ipc']['exit']['time']
    port_probe = json.loads((REPORT / 'port-occupied-probe.stdout.txt').read_text(encoding='utf-8'))
    for created in port_probe['created']:
        if 'shiftmgmt-gemini-32v-' in created['prefix']:
            temps.append({'path': created['result'], 'exists': pathlib.Path(created['result']).exists()})
    ids = ','.join(str(int(pid)) for pid in sorted(process_intervals))
    ps = ("$reviewIds=@(" + ids + "); $reviewProcesses=@(Get-CimInstance Win32_Process | "
          "Where-Object { $reviewIds -contains $_.ProcessId } | "
          "Select-Object ProcessId,Name,@{Name='createdUtc';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}}); "
          "ConvertTo-Json -InputObject $reviewProcesses -Compress")
    output = subprocess.check_output(['powershell.exe', '-NoProfile', '-Command', ps], encoding='utf-8').strip()
    present = json.loads(output) if output else []
    if isinstance(present, dict):
        present = [present]
    processes = []
    present_by_pid = {item['ProcessId']: item for item in present}
    for pid, end in sorted(process_intervals.items()):
        info = present_by_pid.get(pid)
        state = 'absent'
        if info:
            iso = re.sub(r'(\.\d{6})\d+(?=[+-])', r'\1', info['createdUtc'].replace('Z', '+00:00'))
            born = datetime.fromisoformat(iso).timestamp() * 1000
            state = 'reused_after_review_process_exit' if born > end else 'potential_owned_process_alive'
        processes.append({'pid': pid, 'reviewIntervalEndMs': end, 'state': state, 'currentProcess': info})
    with socket.socket() as connection:
        connection.settimeout(1)
        listening = connection.connect_ex(('127.0.0.1', 18741)) == 0
    result = {'time': datetime.now(timezone.utc).isoformat(), 'knownRunManifests': owners,
              'isolatedTemps': temps, 'processes': processes, 'realChildCloseEvents': closed_events,
              'port18741Listening': listening, 'ipcStubClosed': ipc['ipc']['exit']['code'] == 1,
              'portStubClosed': port_probe['serverClosedByHarness'],
              'boundary': 'Read-only check of observed review PIDs/temp paths; no PID killed or historical/foreign temp/profile removed. Missing final-file write probe retains real child-close events and stderr but no final manifest.'}
    save('resource-final.json', result)
    assert not any(item['exists'] for item in temps), 'Owned isolated temp remains'
    assert not any(item['state'] == 'potential_owned_process_alive' for item in processes), 'Observed review process may remain'
    assert not listening, 'Review port still listening'
    return result

def main():
    init, before = read('init.json'), read('source-before.json')
    state_preflight = (CONTROL / '.ai/current-state.md').read_bytes().decode('utf-8-sig')
    assert state_preflight.replace('\r\n', '\n').startswith('# Current Project State\n\nStatus: PHASE_3_2C_A_READY_TO_CODE_USER_RELAY_PENDING\n')
    todo_preflight = (CONTROL / 'TODO.md').read_text(encoding='utf-8-sig')
    assert todo_preflight.count('> **최신 정본(2026-10-01 17:24:01 KST)**:') == 1
    for prefix in ('| **다음 행동** |', '| 3. 화면 재구축 |', '    - 🔄 3-2c-A.'):
        assert sum(line.startswith(prefix) for line in todo_preflight.splitlines()) == 1
    contract_expectations = {
        'contract.json': (29515, '014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE'),
        'STRATEGY.md': (26069, '0A6136FD23F989F7065993449F8A705CD4047FA358248218BB0719497B9F12D1'),
        'verify-evidence.py': (19880, '24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954'),
        'baseline.json': (61201, 'E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50')}
    for name, (length, sha) in contract_expectations.items():
        assert signature(CONTRACT / name) == {'bytes': length, 'sha256': sha}
    received = (CONTROL / 'HANDOFF.md').read_bytes()
    assert len(received) == init['receivedBytes'] and digest(received) == init['receivedSha256']
    assert pathlib.Path(init['archive']).read_bytes() == received
    spec = importlib.util.spec_from_file_location('review_runner', REPORT / 'review-runner.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    final_source = module.snapshot('scope-closeout-final')
    assert all(before[key] == final_source[key] for key in ('head', 'branch', 'status', 'files'))
    baseline = json.loads((CONTRACT / 'baseline.json').read_text(encoding='utf-8'))
    controls = []
    for path, expected in baseline['control'].items():
        actual = signature(path)
        controls.append({'path': path, 'expected': expected, 'actual': actual, 'same': actual == expected})
    assert len(controls) == 18 and all(item['same'] for item in controls)
    save('control-closeout-final-before.json', controls)
    static, core = read('static-results.json'), read('actual-core-result.json')
    faults, cases, cli = read('faults-results.json'), read('cases-results.json'), read('cli-results.json')
    assert len(static) == 10 and all(item['rc'] == 0 for item in static)
    assert core['rc'] == core['checker']['rc'] == 0
    assert len(faults) == 6 and sum(item['rc'] == 0 for item in faults) == 5
    assert len(cases) == 10 and all(item['rc'] == (0 if 'regression-' in item['name'] else 1) for item in cases)
    assert len(cli) == 21 and all(item['rc'] == 1 for item in cli)
    resources = audit_resources(core, faults, cases)
    now = datetime.now(timezone(timedelta(hours=9)))
    stamp, display = now.strftime('%Y%m%d_%H%M%S'), now.strftime('%Y-%m-%d %H:%M:%S KST')
    archive_name = stamp + '_3-2c-A-Sol-FAILED_독립검수종결본.md'
    archive = CONTROL / 'Log' / archive_name
    report = REPORT / 'assessment.md'
    assessment = (REPORT / 'assessment-template.md').read_text(encoding='utf-8')
    replacements = {'@@TIME@@': display, '@@ARCHIVE@@': archive_name,
                    '@@REPORT@@': str(REPORT), '@@CORE@@': core['ownerFinal']['manifestPath'],
                    '@@TEMP_COUNT@@': str(len(resources['isolatedTemps'])),
                    '@@PID_COUNT@@': str(len(resources['processes']))}
    for old, new in replacements.items():
        assessment = assessment.replace(old, new)
    assert '@@' not in assessment
    data = assessment.encode('utf-8')
    with report.open('xb') as stream:
        stream.write(data)
    with archive.open('xb') as stream:
        stream.write(data)
    assert archive.read_bytes() == data
    # Close the received validation target first; only then update factual plan/state.
    (CONTROL / 'HANDOFF.md').write_bytes(data)
    assert (CONTROL / 'HANDOFF.md').read_bytes() == archive.read_bytes()
    save('validation-target-closed.json', {'time': display, 'verdict': 'FAILED', 'acceptance': 'A_NOT_ACCEPTED',
         'receivedArchive': init['archive'], 'received': {'bytes': len(received), 'sha256': digest(received)},
         'responseArchive': str(archive), 'response': signature(archive), 'preCloseoutControls': controls,
         'productFilesUnchanged': 341, 'newImplementationAuthorized': False, 'correctionCounterReset': False})
    todo_path = CONTROL / 'TODO.md'
    todo_bytes = todo_path.read_bytes()
    todo = todo_bytes.decode('utf-8-sig')
    eol = '\r\n' if b'\r\n' in todo_bytes else '\n'
    old_latest = '> **최신 정본(2026-10-01 17:24:01 KST)**:'
    assert todo.count(old_latest) == 1
    latest = ('> **최신 정본(' + display + ')**: 3-2c-A Gemini 구현 회신 독립 검수 **FAILED / A_NOT_ACCEPTED, 수용 보류**. '
              '원문44,403B·요청본문동일·허용4파일/보호337/정본18 PASS. static/map90/build/관련3파일11시험·무변조core9·보호회귀2 PASS. '
              '실제오류주입6건중5허위PASS(PNG/중복ID/raw오류/close미관측/회귀증거없음), 정상8case 신규로그인실패 숨김·partial없음. '
              '외부계약v1 유지, 구현의 계약이탈로 A미수용/B대기. R32C-06·기존2회수정소진 이력유지; CORRECT3/회수초기화/추가구현허가0. '
              '제품341/HEAD/status12 전과정불변, 검수종결후 사실상태만 갱신. 종결 `Log/' + archive_name + '`, 현재 `HANDOFF.md`. 아래 이전 정본은 이력.')
    todo = todo.replace(old_latest, latest + eol + eol + '> **이전 정본(2026-10-01 17:24:01 KST)**:', 1)
    lines = todo.splitlines(keepends=True)
    changed_rows = set()
    for index, line in enumerate(lines):
        ending = '\r\n' if line.endswith('\r\n') else '\n' if line.endswith('\n') else ''
        if line.startswith('| **다음 행동** |'):
            lines[index] = '| **다음 행동** | A 독립검수 FAILED 종결본 확인. Sol이 계약 이탈 원인과 구현 전략을 재검토하고 다음 패킷 조건을 닫는다. 현재 HANDOFF는 검수 결과이며 추가 Gemini 구현 허가는 없다. |' + ending
            changed_rows.add('next')
        elif line.startswith('| 3. 화면 재구축 |'):
            lines[index] = '| 3. 화면 재구축 | 1/10 | 🔄 3-0/3-1a~d 완료·3-1e 직접확인 대기. 3-2c-A 독립검수 FAILED / A_NOT_ACCEPTED·B 대기. 3-2 수용·커밋 보류 |' + ending
            changed_rows.add('phase')
        elif line.startswith('    - 🔄 3-2c-A.'):
            lines[index] = '    - ⏸ 3-2c-A. owner/IPC·외부고정coverage·정리/쓰기 실패·partial증거 기반 제출 독립검수 FAILED / A_NOT_ACCEPTED (' + display + '). 무변조core9/회귀2 통과, 오류주입6중5허위PASS·정상8로그인회귀숨김·partial없음. 계약v1유지·Sol전략재검토대기·추가구현허가0. 근거 `Log/' + archive_name + '`.' + ending
            changed_rows.add('a')
    assert changed_rows == {'next', 'phase', 'a'}
    todo_result = ''.join(lines).encode('utf-8')
    if todo_bytes.startswith(b'\xef\xbb\xbf'):
        todo_result = b'\xef\xbb\xbf' + todo_result
    todo_path.write_bytes(todo_result)
    state_path = CONTROL / '.ai/current-state.md'
    state_bytes = state_path.read_bytes()
    state = state_bytes.decode('utf-8-sig')
    assert state.replace('\r\n', '\n').startswith('# Current Project State\n\nStatus: PHASE_3_2C_A_READY_TO_CODE_USER_RELAY_PENDING\n')
    previous = state[state.index('## Current task'):]
    previous = previous.replace('## Current task — fixed independent contract and foundation IMPLEMENT prepared',
                                '## Historical task — fixed independent contract and foundation IMPLEMENT prepared', 1)
    entry = '''# Current Project State

Status: PHASE_3_2C_A_FAILED_ACCEPTANCE_WITHHELD_REPLAN_PENDING

## Current task — A submission independently rejected (@@TIME@@)

- User 「핸드오프 확인해」. Received HANDOFF44,403bytes/F408FC1DFD5368439CF48B5D94CD3047C0A5C4E96345E029A8117C22C58DBBFC archived unchanged at Log/20261001_220126_3-2c-A-Gemini-IMPLEMENTED_수신원본.md. Exact standalone reply-boundary request body unchanged vs17:24 dispatch. Submitted12source hashes/bytes match. Product source writer Gemini/manual relay retained, Sol product edits0.
- Verdict FAILED / A_NOT_ACCEPTED; A packet closed, acceptance withheld. Contract v1 retained; source implementation does not enforce it. Prior R32C-06/two-correction exhaustion retained, no CORRECT3/counter reset/new implementation authorization. B/full3-2/3-2d/3-3 pending;3-1e user direct visual confirmation pending.
- Independent typecheck/4syntax/lint(existing5 warnings)/map90/diff/build and related3files11tests RC0. Unmodified core RC0/checkerRC0/CORE9/artifacts7/real1440x900 login PNG,92.531s due to uncleared90s timer. Parser positive2/rejected19 proves only parser, not product runtime. Full133files919 historical prior independent run, not rerun this turn.
- Actual six fault probes: PNG24-byte header, duplicateCORE01x9, unrelated raw console error, serverclose-not-observed, evidence-less regression all ownerRC0/PASS; first4 independent checkerRC1. Final manifest write failure ownerRC1/FAIL. Review-only preload cleared pending90/120/180s keepalive timers only AFTER real child close; normal core uninstrumented separately, other behavior/guards/cleanup retained.
- Normal8 independently RC1/FAIL_INCOMPLETE but all real child login timeouts at new nonexistent#login-btn; owner discards first failure/errors and no partial-action-assertions8/8. Protected regression2 actualRC0, their4+1PNG exist; normal core1 totals6actual captures. Parent regression evidence adjudication remains invalid; zero-evidence stub falsePASS.
- Shared implementation accepts caller-overridden fixedexpected, unknowncaseemptycoverage, nestedNaN and mutable raw object; tolerance2 rejected. Owned actual IPC probe accepted wrongURL/contract/bootstrap/temp and sibling run prefix, performed2HTTP requests and wrotePNG/raw without second run authorization; worker laterRC1 origin mismatch. Public9/private12 malformed CLI actualRC1. Occupiedport correctlyRC1/foreignHTTP0/serverSpawn0 but isolatedtempcreated1 before port check violates preflight.
- Submitted core artifact claims5/7 hash/byte mismatch; empty workerlogs2/7 match. Submitted old checker PID-alive rejection was current Chrome PID reuse, not proven old-worker leak; no foreign PID/profile killed. Submitted IPC driver RC0 despite contract-hash subcase rejection=false. Seven negative groups substituted parser selftest; full mandatory runtime subcases not proven.
- Product main160940f9aaeb6696538447f83b44658073e382f0/source341/status12 unchanged throughout review; fourallowed changed vsA baseline, all337protected/18controls unchanged BEFORE closing validation target. After closure only TODO/current-state factual status updated; contract/schema/strategy/checker/baseline unchanged. V3.4 untouched; no commit/push/deploy/AI CLI.
- Complete findings A32F-01~08 and exact command/PID/time/RC/stdout/stderr/raw manifests: @@REPORT@@/final-evidence.json. Immutable closeout Log/@@ARCHIVE@@. Observed owned processes closed or PID-reused; known isolated temps absent/18741free; artifacts retained. No universal error-branch cleanup claim.
- Frontier orchestration; Luna read-only inventory and Terra unavailable balancedfallback gpt-6-sol review only. Sol independently checked citations/hashes and corrected evidence inventory (5/7 mismatch, existing normal regression captures). MCP inspected once; no new MCP failure; harness5.1/project4.0 unchanged; relevant JIT trace record_only/JeV not used.

Earlier entries below are historical and do not override this entry.

'''
    for old, new in replacements.items():
        entry = entry.replace(old, new)
    if b'\r\n' in state_bytes:
        entry = entry.replace('\n', '\r\n')
    state_result = (entry + previous).encode('utf-8')
    if state_bytes.startswith(b'\xef\xbb\xbf'):
        state_result = b'\xef\xbb\xbf' + state_result
    state_path.write_bytes(state_result)
    after_controls = [{'path': item['path'], 'before': item['actual'], 'after': signature(item['path'])}
                      for item in controls]
    changed_controls = [item['path'] for item in after_controls if item['before'] != item['after']]
    assert sorted(changed_controls) == sorted([str(todo_path), str(state_path)])
    final_again = module.snapshot('scope-after-closeout')
    assert all(before[key] == final_again[key] for key in ('head', 'branch', 'status', 'files'))
    hashes = read('submitted-hash-check.json')
    final = {'time': display, 'verdict': 'FAILED', 'acceptance': 'A_NOT_ACCEPTED', 'replanRetained': True,
             'newImplementationAuthorized': False, 'correctionCounterReset': False,
             'received': init, 'responseArchive': str(archive), 'response': signature(archive),
             'rootHandoffMatchesArchive': (CONTROL / 'HANDOFF.md').read_bytes() == archive.read_bytes(),
             'sourceBefore': str(REPORT / 'source-before.json'), 'sourceFinal': str(REPORT / 'scope-after-closeout.json'),
             'sourceUnchanged': True, 'sourceFiles': 341, 'protectedFiles': 337,
             'control18UnchangedBeforeValidationClose': True, 'factualControlsAfterClose': after_controls,
             'static': static, 'unmodifiedCore': core, 'runtimeFaults': faults, 'cases': cases, 'cli': cli,
             'resources': str(REPORT / 'resource-final.json'), 'submittedHashChecks': hashes,
             'sharedIpc': str(REPORT / 'shared-and-ipc-probe.stdout.txt'),
             'portPreflight': str(REPORT / 'port-occupied-probe.stdout.txt'),
             'captureIndex': str(REPORT / 'capture-index.json'), 'childEvidenceIndex': str(REPORT / 'child-evidence-index.json'),
             'submittedPidReuse': str(REPORT / 'submitted-pid-reuse.json'),
             'submittedIpcReproduced': str(REPORT / 'submitted-ipc-probe-reproduced.command.json'),
             'instrumentation': 'Fault/case preload only clears remaining owner keepalive timer after real child close; unmodified core separate. Product source unchanged.',
             'reviewGate': 'FAILED; no claim of full mandatory 20-group SUT proof or overall UI acceptance'}
    save('final-evidence.json', final)
    print(json.dumps({'closed': True, 'verdict': 'FAILED', 'response': signature(archive),
                     'archive': str(archive), 'sourceFilesUnchanged': 341, 'protected': 337,
                     'control18UnchangedBeforeClose': True, 'factualUpdates': changed_controls,
                     'knownTempsAbsent': len(resources['isolatedTemps']), 'reviewPidsChecked': len(resources['processes'])}, ensure_ascii=False))

if __name__ == '__main__':
    main()
