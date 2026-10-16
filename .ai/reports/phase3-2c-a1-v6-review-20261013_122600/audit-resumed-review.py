# -*- coding: utf-8 -*-
"""Verify retained evidence and immutable review targets before closing v6."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, importlib.util, json, socket, subprocess, sys
sys.dont_write_bytecode = True
REPORT = Path(__file__).resolve().parent
DOC = REPORT.parent.parent.parent
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL = DOC / '.ai/contracts/phase3-2c-a1-v6'

def load(p): return json.loads(p.read_text(encoding='utf-8'))
def meta(p):
    b = p.read_bytes()
    return {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest().upper()}
def dump(p, v):
    with p.open('x', encoding='utf-8') as f:
        json.dump(v, f, ensure_ascii=False, indent=2)
        f.write('\n')
def module(name, p):
    spec = importlib.util.spec_from_file_location(name, p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

def main():
    initial = load(REPORT / 'initial-evidence.json')
    intake = module('sol_v6_intake_resume', DOC / '.ai/work/intake-a1-v6.py')
    current = intake.snapshot()
    assert current == initial['sourceBefore']
    for p, h in {**initial['controlBefore'], **initial['versionControls']}.items():
        assert meta(Path(p)) == h, p
    archive = Path(initial['receivedArchive'])
    assert meta(archive) == initial['received']
    assert (DOC / 'HANDOFF.md').read_bytes() == archive.read_bytes()
    shared = (REPO / 'scripts/ui-checks/access-history-shared.mjs').read_bytes()
    start = shared.index(b'export const CANONICAL_8_ACTIONS =')
    end = shared.index(b'export async function performWorkerIpcHandshake', start)
    fragment = shared[start:end]
    assert {'bytes': len(fragment), 'sha256': hashlib.sha256(fragment).hexdigest().upper()} == initial['frozen']
    runner = module('sol_v6_checks_resume', REPORT / 'run-checks.py')
    eh = meta(CTRL / 'execution.json')['sha256']
    bh = meta(CTRL / 'baseline.json')['sha256']
    runner.command('scope-before-close-resumed', [runner.PY, '-X', 'utf8', '-B', CTRL / 'gate-evidence.py', '--execution-sha', eh, '--baseline-sha', bh, '--scope'])
    pure = runner.command('pure-guard-resume-confirm', ['node', REPORT / 'pure-guard.mjs', REPORT / 'pure-guard-input.json'])
    pure_result = json.loads(Path(pure['stdout']).read_text(encoding='utf-8'))
    assert len(pure_result['results']) == 6 and all(r['accepted'] for r in pure_result['results'])
    receipts = load(REPORT / 'check-results.json')
    assert len(receipts['records']) == 16
    for r in receipts['records']:
        assert r['rc'] == 0 and not r['timeout']
        assert meta(Path(r['stdout']))['sha256'] == r['stdoutSha256']
        assert meta(Path(r['stderr']))['sha256'] == r['stderrSha256']
    runtime_root = Path(receipts['runtimeSummary']['artifact'])
    runtime = load(runtime_root / 'suite-result.json')
    assert runtime['status'] == 'PASS' and runtime['requiredFaultCount'] == 51 and len(runtime['records']) == 86
    submitted = load(Path(initial['submittedRuntime']) / 'suite-result.json')
    assert submitted['status'] == 'PASS' and submitted['requiredFaultCount'] == 51 and len(submitted['records']) == 86
    R = module('sol_v6_runtime_audit', CTRL / 'runtime-probes.py')
    observed = []
    pids, closed, event_paths = set(), {}, set()
    def completed(pid, end_ms):
        if type(pid) is int and pid > 0:
            pids.add(pid)
            closed[pid] = max(closed.get(pid, 0), end_ms)
    def command_done(r):
        completed(r.get('pid'), datetime.fromisoformat(r['end'].replace('Z', '+00:00')).timestamp() * 1000)
    for r in runtime['records']:
        command_done(r)
        if r.get('eventsPath'):
            p = Path(r['eventsPath'])
            rows = R.HEALTH.observer_health(p.read_text(encoding='utf-8'), r['pid'], r['mode'], r['session'], r['rc'])
            assert R.observed_quiescence(rows)[0]
            event_paths.add(p)
            observed.append(r['name'])
        if r['name'] == 'fresh-observer-selfcheck':
            health_root = Path(json.loads(r['output'].splitlines()[-1])['artifact'])
            health = R.validate_health_receipt(health_root)
            assert health['actualControlChecks'] == 45
            for h in health['records']:
                command_done(h)
                if h.get('observerHealthy'): event_paths.add(health_root / (h['name'] + '.events.jsonl'))
    captures = []
    for r in runtime['records']:
        if r['name'].startswith(('positive-', 'observed-positive-')) and 'final' not in r['name']:
            manifest = Path(json.loads(r['output'])['manifestPath'])
            final = load(manifest)
            assert final['status'] == 'PASS'
            for artifact in final['artifacts']:
                p = Path(artifact['path'])
                assert meta(p) == {k: artifact[k] for k in ('bytes', 'sha256')}
                if p.suffix == '.png':
                    b = p.read_bytes()
                    dims = [int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')]
                    assert b[:8] == bytes([137,80,78,71,13,10,26,10]) and dims[0] == 1440 and dims[1] >= 900
                    captures.append({'case': final['case'], 'observed': r['name'].startswith('observed-'), 'path': str(p), **meta(p), 'dimensions': dims})
    assert len(captures) == 12
    ipc = json.loads((REPORT / 'ipc-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    assert ipc['status'] == 'PASS' and len(ipc['results']) == 20 and all(r['accepted'] for r in ipc['results'])
    for r in ipc['results']:
        completed(r['pid'], r['exit']['timeMs'])
    partial_summary = json.loads((REPORT / 'partial-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    partial = load(Path(partial_summary['artifact']) / 'suite-result.json')
    assert partial['status'] == 'PASS' and len(partial['results']) == 11 and all(r['accepted'] for r in partial['results'])
    for r in partial['results']:
        completed(r['pid'], r['endMs'])
        event_paths.add(Path(r['eventsPath']))
    component = json.loads((REPORT / 'component-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
    assert component['status'] == 'PASS' and component['typedMutationCount'] == 32 and len(component['resources']) == 2
    assert all(r['browserConnected'] is False for r in component['resources'])
    extra_summary = load(REPORT / 'extra-owner-resume2-summary.json')
    extra = load(Path(extra_summary['artifact']) / 'extra-result.json')
    assert len(extra['results']) == 4
    for r in extra['results']:
        command_done(r['owner'])
        event_paths.add(Path(r['owner']['eventsPath']))
        if r.get('fixedFinal'): command_done(r['fixedFinal'])
    first_extra = Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v6-extra-owner-mo6z1rpi')
    for p in first_extra.glob('*.command.json'):
        r = load(p)
        command_done(r)
        if r.get('eventsPath'): event_paths.add(Path(r['eventsPath']))
    for p in REPORT.glob('*.command.json'): command_done(load(p))
    for p in event_paths:
        for e in [json.loads(v) for v in p.read_text(encoding='utf-8').splitlines()]:
            for key in ('pid', 'childPid'):
                if type(e.get(key)) is int and e[key] > 0: pids.add(e[key])
            if e['type'] == 'actual-child-close': completed(e.get('childPid'), e['timeMs'])
            if e['type'] in ('owner-process-exit', 'observer-exit'): completed(e.get('pid'), e['timeMs'])
    filter_text = ' OR '.join('ProcessId = ' + str(pid) for pid in sorted(pids))
    query = f"Get-CimInstance Win32_Process -Filter '{filter_text}' | ForEach-Object {{ $a1V6ResumeStamp = if ($_.CreationDate) {{ ([DateTimeOffset]$_.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds() }} else {{ $null }}; [pscustomobject]@{{pid=$_.ProcessId;name=$_.Name;createdAtMs=$a1V6ResumeStamp}} }} | ConvertTo-Json -Compress"
    output = subprocess.check_output(['powershell', '-NoProfile', '-NonInteractive', '-Command', query], encoding='utf-8').strip()
    live = json.loads(output) if output else []
    if isinstance(live, dict): live = [live]
    for r in live:
        r['observedPreviousCloseAtMs'] = closed.get(r['pid'])
        r['laterPidReuse'] = r['pid'] in closed and r['createdAtMs'] is not None and r['createdAtMs'] > closed[r['pid']]
    assert all(r['laterPidReuse'] for r in live), live
    with socket.socket() as probe: probe.bind(('127.0.0.1', 18741))
    retained = sorted({v for r in runtime['records'] for v in r.get('retainedOwnedTemps', []) if Path(v).exists()})
    result = {'timeUtc': datetime.now(timezone.utc).isoformat(), 'sourceUnchanged': True, 'sourceAfter': current, 'controlsUnchanged': True, 'controlFiles': 289, 'versionControlFiles': 14, 'frozen': initial['frozen'], 'receivedHandoffUnchanged': True, 'originalCommandCount': 16, 'originalRuntimeRecords': 86, 'runtimeFaults': 51, 'observedOriginalRecordsRevalidated': len(observed), 'submittedRuntimeStatus': submitted['status'], 'captures': captures, 'ipcCases': 19, 'portPreflightCases': 1, 'partialModes': 11, 'typedMutations': 32, 'actualChromeCloseThrowCases': 2, 'extraFalsePasses': 3, 'extraStaleFailureReceipts': 1, 'pureGuardInvalidAccepted': 5, 'observedPidCount': len(pids), 'liveObservedPidNumbers': live, 'ownedObservedProcessesRemaining': 0, 'port18741Free': True, 'retainedRuntimeOwnTemps': retained, 'productEditsBySol': 0, 'A1Accepted': False, 'coverageLimit': 'Direct observed children/logs and actual browser close events; not a universal OS descendant history. Late error callbacks are controlled injections, not spontaneous OS failures.'}
    dump(REPORT / 'final-audit-before-close.json', result)
    print(json.dumps({'status': 'AUDIT_PASS', 'sourceFiles': len(current['files']), 'controlFiles': 289, 'observedPids': len(pids), 'reusedPids': len(live), 'portFree': True, 'captures': len(captures)}), flush=True)

if __name__ == '__main__': main()
