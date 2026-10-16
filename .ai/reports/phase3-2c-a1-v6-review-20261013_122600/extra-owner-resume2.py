# -*- coding: utf-8 -*-
"""Resume timed fault investigation; preserve earlier failed control run unchanged."""
from pathlib import Path
import importlib.util, json, tempfile, sys, hashlib
sys.dont_write_bytecode = True
REPORT = Path(__file__).resolve().parent
CTRL = REPORT.parent.parent.parent / '.ai/contracts/phase3-2c-a1-v6'
spec = importlib.util.spec_from_file_location('sol_v6_runtime', CTRL / 'runtime-probes.py')
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)
PY = Path(r'C:\Users\pangyo\anaconda3\python.exe')

def load(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def dump(p, v):
    with p.open('x', encoding='utf-8') as f:
        json.dump(v, f, ensure_ascii=False, indent=2)
        f.write('\n')

def main():
    root = Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a1v6-extra-owner-resume2-'))
    print(json.dumps({'artifact': str(root)}), flush=True)
    R.HERE = REPORT
    results = []
    for mode in ('late-child-before-removal', 'late-child-gate', 'late-log-gate', 'late-child-gate-failure'):
        record, rows = R.run(root, mode, ['node', 'scripts/ui-checks/access-history.mjs', '--case=contract-core'], mode, 120)
        assert not record['timeout'] and record['observerHealthy'] and record['faultTriggered']
        deliveries = [v for v in rows if v['type'] == 'controlled-late-error-delivery']
        assert len(deliveries) == 1
        delivery = deliveries[0]
        runs = [Path(v['result']) for v in rows if v['type'] == 'directory-created' and Path(v['result']).parent == R.REPO / 'artifacts/captures/phase3/access-history-contract-core']
        assert len(runs) == 1
        directory = runs[0]
        candidate = load(directory / 'owner-candidate.json')
        kind = delivery['kind']
        actual = [v for v in rows if v['type'] == ('actual-child-error' if kind == 'child' else 'actual-log-error') and v.get('message') == delivery['message']]
        assert len(actual) == 1
        removal = next(v for v in rows if v['type'] == 'owned-temp-remove-complete')
        assert len(candidate['server']['callbackEvents']) == 7
        if mode == 'late-child-before-removal':
            assert delivery['seq'] < removal['seq']
        else:
            assert removal['seq'] < delivery['seq']
        # The original quiescence checker deliberately rejects a log error after
        # removal. Do not claim this controlled late fault is clean quiescence.
        if kind == 'log':
            assert record['quiescenceObserved'] is False
            assert record['quiescenceError'] == 'Owned temp removal before actual log settlement'
        else:
            assert record['quiescenceObserved'] is True
        spawns = [v for v in rows if v['type'] == 'spawn']
        assert all(any(e['type'] == 'actual-child-close' and e['spawnId'] == s['spawnId'] for e in rows) for s in spawns)
        streams = [v for v in rows if v['type'] == 'log-stream-created']
        assert all(all(any(e['type'] == k and e['streamId'] == s['streamId'] for e in rows) for k in ('actual-log-finish', 'actual-log-close')) for s in streams)
        result = {'mode': mode, 'delivery': delivery, 'actualErrorEvent': actual[0], 'tempRemoval': removal, 'owner': record, 'candidatePath': str(directory / 'owner-candidate.json'), 'cachedServerEvents': 7, 'allActualChildCloses': True, 'allActualStreamFinishClose': True}
        if mode != 'late-child-gate-failure':
            assert record['rc'] == 0 and json.loads(record['output'])['status'] == 'PASS'
            final_path = Path(json.loads(record['output'])['manifestPath'])
            final = load(final_path)
            assert final['errors']['primary'] is None and len(final['server']['callbackEvents']) == 7
            assert not any(e.get('error', {}).get('message') == delivery['message'] for e in final['server']['callbackEvents'] if e.get('error'))
            gate = [str(PY), '-X', 'utf8', '-B', str(CTRL / 'gate-evidence.py'), '--execution-sha', sha(CTRL / 'execution.json'), '--baseline-sha', sha(CTRL / 'baseline.json'), '--final', str(final_path)]
            fixed, _ = R.run(root, mode + '-fixed-final', gate, None, 30)
            assert fixed['rc'] == 0
            result.update(finding='LATE_CONTROLLED_ERROR_IGNORED_OWNER_AND_FIXED_FINAL_PASS', finalPath=str(final_path), fixedFinal=fixed)
        else:
            assert record['rc'] == 1
            failure_path = directory / 'owner-failure.json'
            failure = load(failure_path)
            assert failure['errors']['primary']['stack'] == delivery['stack']
            assert len(failure['server']['callbackEvents']) == 7
            assert any('adjudicator-response' == e.get('phase') for e in failure['errors']['unexpected'])
            result.update(finding='FAILURE_REUSES_STALE_SUCCESS_CACHE_AND_OMITS_LATE_CALLBACK', failurePath=str(failure_path), failure=failure)
        results.append(result)
        dump(root / (mode + '.finding.json'), result)
    result = {'status': 'ACTUAL_LATE_ERROR_GAPS_REPRODUCED', 'proof': 'Real unchanged owner with explicitly injected child/log EventEmitter callbacks; controlled faults, not spontaneous OS errors', 'results': results, 'productEditsBySol': 0, 'retention': 'Retain exact own runs and earlier RC1; no foreign/historical cleanup', 'earlierControlFailure': 'extra-owner-resumed RC1: original quiescence checker rejects deliberate post-removal log error. Original evidence and sealed controls unchanged.'}
    dump(root / 'extra-result.json', result)
    dump(REPORT / 'extra-owner-resume2-summary.json', {'status': result['status'], 'artifact': str(root), 'count': len(results), 'findings': [r['finding'] for r in results]})
    print(json.dumps({'status': result['status'], 'artifact': str(root), 'count': len(results)}), flush=True)

if __name__ == '__main__': main()
