"""Sol-owned read-only evidence adjudicator. Parser proof is not SUT acceptance.

This execution slice preserves the original core rules and all later A2/B obligations.
It never starts the application, Chrome, or an implementation AI.
"""
import argparse
import copy
from datetime import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import socket
import subprocess
import sys
sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4').resolve()
ORIGINAL = HERE.parent / 'phase3-2c-v1'
ORIGINAL_CONTRACT_SHA = '014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE'
ORIGINAL_CHECKER_SHA = '24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954'

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def require(value, message):
    if not value:
        raise ValueError(message)

def original_module():
    source = ORIGINAL / 'verify-evidence.py'
    require(sha(source.read_bytes()) == ORIGINAL_CHECKER_SHA, 'Original checker changed')
    spec = importlib.util.spec_from_file_location('locked_v1_evidence', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

V1 = original_module()

def locked(path, expected):
    require(sha(path.read_bytes()) == expected, 'Locked digest differs: ' + str(path))
    result = V1.load_json(path)
    V1.finite_tree(result)
    return result

def frozen_shared(execution):
    path = HERE / 'frozen-shared.json'
    require(Path(execution['frozenSharedPath']).resolve() == path.resolve(), 'Wrong frozen fragment path')
    record = locked(path, execution['frozenSharedSha256'])
    text = (REPO / record['path']).read_bytes().decode('utf-8')
    start = text.index(record['startMarker'])
    end = text.index(record['endMarker'], start)
    fragment = text[start:end].encode('utf-8')
    require(len(fragment) == record['bytes'] and sha(fragment) == record['sha256'], 'Frozen A2 shared helpers changed')

def exact(value, expected, message):
    require(V1.exact(value, expected), message)

def owned_file(path, root):
    result = Path(path).resolve(strict=True)
    require(result.is_file() and V1.within(result, root.resolve()), 'Evidence outside permitted root')
    return result

def artifact_set(manifest, expected_ids, run_dir):
    V1.coverage(manifest['artifacts'], expected_ids)
    loaded = {}
    for item in manifest['artifacts']:
        require(set(item) == {'id', 'path', 'bytes', 'sha256'}, 'Unexpected artifact fields')
        source = owned_file(item['path'], run_dir)
        suffix = '.log' if item['id'] in ['server-stdout', 'server-stderr', 'worker-stdout', 'worker-stderr'] else '.png' if item['id'] == 'core-capture' or item['id'].startswith('regression-capture-') else '.json'
        require(source == run_dir / (item['id'] + suffix), 'Artifact ID/path binding differs')
        data = source.read_bytes()
        require(type(item['bytes']) is int and item['bytes'] == len(data) and sha(data) == item['sha256'], 'Artifact bytes/hash differ')
        loaded[item['id']] = {'path': source, 'bytes': data, 'meta': item}
    return loaded

def process_closed(label, process):
    require(type(process['pid']) is int and process['pid'] > 0, label + ' invalid PID')
    require(process['exitSeen'] is True and process['closeSeen'] is True and process['aliveAfterClose'] is False, label + ' close not confirmed')
    times = [process[key] for key in ('createdAtMs', 'exitAtMs', 'closeAtMs')]
    require(all(type(t) in (int, float) and math.isfinite(t) and t > 0 for t in times), label + ' timestamp absent')
    require(times == sorted(times), label + ' lifecycle order differs')
    require(not V1.pid_alive(process['pid']), label + ' PID live or reused; do not kill a foreign PID')

def finished_logs(label, process):
    exact(process['logsSettled'], {'stdout': True, 'stderr': True}, label + ' log finish missing')
    times = process['logFinishAtMs']
    require(set(times) == {'stdout', 'stderr'}, label + ' log finish fields differ')
    require(all(type(value) in (int, float) and math.isfinite(value) and value >= process['closeAtMs']
                for value in times.values()), label + ' log finish timestamp absent/before child close')
    exact(process.get('logFinishSeen'), {'stdout': True, 'stderr': True}, label + ' actual log finish observation absent')
    exact(process.get('logCloseSeen'), {'stdout': True, 'stderr': True}, label + ' actual log close observation absent')
    close_times = process.get('logCloseAtMs')
    require(isinstance(close_times, dict) and set(close_times) == {'stdout', 'stderr'}, label + ' log close timestamp fields differ')
    require(all(type(value) in (int, float) and math.isfinite(value) and value > 0 and value >= times[key]
                for key, value in close_times.items()), label + ' log close timestamp absent/before actual finish')
    return max(close_times.values())

def common_errors(errors):
    expected = {'executionError': None, 'manifestWriteError': None, 'consoleErrors': [], 'pageErrors': [],
                'requestFailed': [], 'badResponses': [], 'cleanupErrors': []}
    exact(errors, expected, 'Protected runner errors remain')

def measured_core(raw, worker_final):
    require(isinstance(raw, dict) and set(raw) == {'viewport', 'origin', 'loginInputs', 'fixtureLabels',
            'canonicalLabels', 'fixtureRequestCount', 'rawErrors', 'chrome', 'resources', 'captureId'}, 'Core raw fields differ')
    require(isinstance(raw['canonicalLabels'], dict) and set(raw['canonicalLabels']) == {'path', 'bytes', 'sha256', 'labels'}, 'Canonical fields differ')
    require(type(raw['canonicalLabels']['bytes']) is int and raw['canonicalLabels']['bytes'] > 0, 'Canonical bytes type differs')
    for resource in raw['resources']:
        require(set(resource) == {'kind', 'id', 'events'}, 'Resource fields differ')
        require(all(set(event) == {'state', 'timeMs'} for event in resource['events']), 'Resource event fields differ')
    measured = worker_final.get('measurement')
    require(isinstance(measured, dict) and set(measured) == {'viewportSource', 'originSource', 'fixtureRoute', 'fixtureRows', 'fixtureRequests'}, 'Measurement receipt absent/fields differ')
    require(measured['viewportSource'] == 'page.viewportSize' and measured['originSource'] == 'page.url'
            and measured['fixtureRoute'] == '**/api/access-logs:list', 'Wrong measurement source')
    rows = measured['fixtureRows']
    require(isinstance(rows, list) and len(rows) == 8 and all(isinstance(row, dict) for row in rows), 'Actual prepared fixture rows absent')
    exact([{'actionType': row['actionType'], 'label': row['actionLabel']} for row in rows], raw['fixtureLabels'], 'Prepared fixture differs from raw labels')
    require(isinstance(measured['fixtureRequests'], list) and type(raw['fixtureRequestCount']) is int
            and len(measured['fixtureRequests']) == raw['fixtureRequestCount'], 'Actual fixture request count differs')

def validate_regression(raw, manifest, loaded, execution, run_dir):
    case = manifest['case']
    policy = execution['regressions'][case]
    worker = manifest['worker']
    runner = raw['runner']
    script = (REPO / policy['script']).resolve(strict=True)
    exact(runner['script'], str(script), 'Wrong protected runner')
    require(runner['sha256'] == sha(script.read_bytes()), 'Protected runner hash differs')
    expected_argv = [manifest['owner']['nodePath'], str(script), execution['url']] + policy['extraArgs']
    exact(runner['argv'], expected_argv, 'Protected runner argv differs')
    exact(worker['argv'], expected_argv, 'Worker dispatch argv differs')
    require(runner['pid'] == worker['pid'] and type(runner['exitCode']) is int and runner['exitCode'] == worker['exitCode'] == 0, 'Protected runner exit differs')
    evidence = raw['evidence']
    original_root = REPO / policy['artifactRoot']
    source_manifest = owned_file(evidence['manifest']['originalPath'], original_root)
    child_dir = source_manifest.parent
    require(source_manifest.name == 'manifest.json' and child_dir.parent.resolve() == original_root.resolve()
            and child_dir.name.startswith('run-'), 'Protected runner run directory differs')
    original_bytes = source_manifest.read_bytes()
    copied = loaded['regression-manifest']
    exact(original_bytes, copied['bytes'], 'Copied child manifest differs')
    require(evidence['manifest']['bytes'] == len(original_bytes) and evidence['manifest']['sha256'] == sha(original_bytes)
            and Path(evidence['manifest']['copyPath']).resolve() == copied['path'], 'Child manifest receipt differs')
    child = V1.load_json(source_manifest)
    V1.finite_tree(child)
    require(child['status'] == 'PASS' and child['id'] == policy['id'] and child['url'] == execution['url'], 'Protected runner identity/status differs')
    exact(child['viewport'], {'width': 1440, 'height': 900}, 'Protected viewport differs')
    require(Path(child['chrome']['path']).is_file() and child['chrome']['version'], 'Protected installed Chrome absent')
    health = child['serverHealth']
    require(health['ok'] is True, 'Protected health evidence differs')
    exact(health, manifest['server']['health']['payload'], 'Protected health differs from owner readiness response')
    common_errors(child['errors'])
    timestamp = datetime.fromisoformat(child['timestamp'].replace('Z', '+00:00')).timestamp() * 1000
    require(worker['createdAtMs'] <= timestamp <= worker['closeAtMs'], 'Historical child manifest substituted')
    require(source_manifest.stat().st_mtime * 1000 >= worker['createdAtMs'] - 2000, 'Child manifest predates dispatch')
    captures = child['captures']
    require(len(captures) == len(policy['captures']), 'Protected capture count differs')
    exact([item['name'] for item in captures], policy['captures'], 'Protected capture set/order differs')
    require(len(evidence['captures']) == len(captures), 'Capture receipts absent')
    for source_item, receipt in zip(captures, evidence['captures']):
        name = source_item['name']
        original_png = owned_file(REPO / source_item['path'], child_dir)
        require(original_png == child_dir / (name + '.png') and source_item['filename'] == name + '.png', 'Protected capture path differs')
        data = original_png.read_bytes()
        copied_png = loaded['regression-capture-' + name]
        exact(data, copied_png['bytes'], 'Copied capture differs')
        exact(receipt['name'], name, 'Capture receipt name differs')
        require(Path(receipt['originalPath']).resolve() == original_png and Path(receipt['copyPath']).resolve() == copied_png['path'], 'Capture provenance differs')
        require(receipt['bytes'] == len(data) and receipt['sha256'] == sha(data), 'Capture receipt hash differs')
        dimensions = V1.png_dimensions(data)
        require(dimensions[0] == 1440 and dimensions[1] >= 900, 'Protected fullPage capture dimensions differ')
        exact(receipt['dimensions'], dimensions, 'Capture dimensions receipt differs')
    exact(raw['result'], {'status': child['status'], 'errors': child['errors'], 'serverHealth': health}, 'Protected result differs from actual manifest')
    V1.coverage(manifest['checks'], policy['checkIds'])
    for check, check_id, pointer in zip(manifest['checks'], policy['checkIds'], ['/runner', '/evidence', '/result']):
        require(set(check) == {'id', 'sourceArtifact', 'pointer', 'actual'}, 'Caller verdict/expected/tolerance forbidden')
        require(check['id'] == check_id and check['sourceArtifact'] == 'regression-observations' and check['pointer'] == pointer, 'Wrong protected observation source')
        exact(check['actual'], V1.pointer(raw, pointer), 'Protected actual differs from raw observation')

def candidate(path, contract, execution, execution_sha):
    path = Path(path).resolve(strict=True)
    manifest = V1.load_json(path)
    V1.finite_tree(manifest)
    require('adjudication' not in manifest, 'Candidate prematurely claims adjudication')
    case = manifest['case']
    require(case in execution['enabledCases'], 'A2/B case not authorized')
    require(manifest['schema'] == contract['evidenceSchema'] and manifest['stage'] == 'foundation'
            and manifest['stageSlice'] == 'A1', 'Wrong foundation slice/schema')
    require(manifest['status'] == 'READY_FOR_ADJUDICATION' and type(manifest['exitCode']) is int and manifest['exitCode'] == 0, 'Candidate is not ready')
    require(manifest['contractSha256'] == ORIGINAL_CONTRACT_SHA and manifest['executionSha256'] == execution_sha, 'Candidate lock differs')
    owner, worker, server = manifest['owner'], manifest['worker'], manifest['server']
    context = owner['context']
    run_dir = Path(context['runDir']).resolve(strict=True)
    run_root = REPO / 'artifacts/captures/phase3' / ('access-history-' + case)
    require(V1.within(run_root.resolve(), REPO), 'Artifact root escapes repository')
    require(run_dir.parent == run_root.resolve() and run_dir.name.startswith('run-'), 'Wrong exact owner run root')
    require(path == run_dir / 'owner-candidate.json' and manifest['runId'] == run_dir.name, 'Candidate path/run identity differs')
    require(context['url'] == execution['url'] == contract['url'], 'Wrong owned URL')
    temp = Path(context['tempDir']).resolve()
    import tempfile
    require(temp.parent == Path(tempfile.gettempdir()).resolve() and temp.name.startswith(contract['tempPrefix']), 'Wrong isolated temp')
    require(Path(context['bootstrapFile']).resolve() == temp / 'data/bootstrap-credentials.json', 'Wrong bootstrap binding')
    require(not temp.exists() and manifest['cleanup']['tempRemoved'] is True, 'Temp not removed after quiescence')
    require(len({owner['pid'], worker['pid'], server['pid']}) == 3 and worker['parentPid'] == owner['pid'], 'Wrong distinct owner/child PIDs')
    nonce = owner['nonceSha256']
    require(isinstance(nonce, str) and len(nonce) == 64 and all(c in '0123456789ABCDEF' for c in nonce)
            and worker['nonceSha256'] == nonce, 'Nonce receipt differs')
    if case == 'contract-core':
        require(worker['contextAck'] is True and worker['runAuthorized'] is True, 'Core ACK/run authorization absent')
    else:
        require(worker['contextAck'] is False and worker['runAuthorized'] is False, 'Protected runner falsely claims IPC authorization')
    require(type(owner['pid']) is int and owner['pid'] > 0 and Path(owner['nodePath']).is_file(), 'Owner PID/node executable absent')
    process_closed('worker', worker)
    process_closed('server', server)
    require(type(worker['exitCode']) is int and worker['exitCode'] == 0, 'Worker did not succeed')
    require(server['stdoutListenVerified'] is True and server['portListeningAfterClose'] is False, 'Owned server/port evidence absent')
    require(type(server['health']['status']) is int and server['health']['status'] == 200
            and server['health']['payload']['ok'] is True, 'Owned readiness HTTP200/ok proof absent')
    require(Path(server['health']['payload']['data']['dataDir']).resolve() == temp, 'Readiness response belongs to another temp')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', contract['port']))
    exact(manifest['errors'], {'primary': None, 'cleanup': [], 'evidence': [], 'unexpected': []}, 'Owner errors remain')
    for item in (worker, server):
        exact(item['logsSettled'], {'stdout': True, 'stderr': True}, 'Log finish missing')
    last_finish = max(finished_logs('worker', worker), finished_logs('server', server))
    removed = manifest['cleanup']['tempRemovedAtMs']
    sealed = manifest['sealedAtMs']
    require(type(removed) in (int, float) and math.isfinite(removed) and removed >= last_finish,
            'Temp removal before all child/log closure')
    require(type(sealed) in (int, float) and math.isfinite(sealed) and sealed >= removed,
            'Candidate sealed before cleanup')
    if case == 'contract-core':
        expected_artifacts = contract['foundation']['artifacts']
    else:
        expected_artifacts = execution['regressions'][case]['artifacts']
    loaded = artifact_set(manifest, expected_artifacts, run_dir)
    if case == 'contract-core':
        raw = V1.load_json(loaded['core-observations']['path'])
        wf = V1.load_json(loaded['worker-final']['path'])
        V1.finite_tree(raw)
        V1.finite_tree(wf)
        for key in ('case', 'runId', 'contractSha256', 'checks'):
            exact(wf[key], manifest[key], 'Worker receipt differs: ' + key)
        require(wf['pid'] == worker['pid'] and wf['parentPid'] == owner['pid'] and wf['nonceSha256'] == nonce, 'Worker binding differs')
        V1.check_rules(contract, manifest['checks'], raw)
        measured_core(raw, wf)
        chrome_js = "import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);process.stdout.write(JSON.stringify(m.findChrome()));"
        env = dict(__import__('os').environ)
        for key in list(env):
            if key.startswith(('SHIFT_', 'SHIFTMGMT_', 'SOL_A1_')) or key in ('NODE_OPTIONS', 'NODE_DEBUG'):
                del env[key]
        installed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', chrome_js,
            str(REPO / 'scripts/lib/find-chrome.mjs')], cwd=REPO, env=env, timeout=10).decode('utf-8'))
        require(Path(raw['chrome']['path']).resolve() == Path(installed['path']).resolve()
                and raw['chrome']['version'] == installed['version'], 'Chrome metadata differs from protected installed-Chrome finder')
        require(len({resource['id'] for resource in raw['resources']}) == 2, 'Core resource IDs must be distinct')
        for resource in raw['resources']:
            require(all(worker['createdAtMs'] <= event['timeMs'] <= worker['closeAtMs'] for event in resource['events']), 'Core resource timeline outside actual worker lifetime')
        canonical = raw['canonicalLabels']
        compiled = (REPO / 'dist/server/shared/domain/access-log.js').resolve(strict=True)
        require(Path(canonical['path']).resolve() == compiled and canonical['sha256'] == sha(compiled.read_bytes())
                and canonical['bytes'] == compiled.stat().st_size, 'Compiled canonical metadata differs')
        js = "import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);process.stdout.write(JSON.stringify(m.accessLogActionLabels??m.default?.accessLogActionLabels));"
        labels = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js, str(compiled)], cwd=REPO, timeout=10).decode('utf-8'))
        exact(canonical['labels'], labels, 'Actual compiled canonical labels differ')
        require(all(labels[item['actionType']] == item['label'] for item in raw['fixtureLabels']), 'Fixture differs from actual compiled labels')
        exact(V1.png_dimensions(loaded['core-capture']['bytes']), [1440, 900], 'Core PNG dimensions differ')
    else:
        raw = V1.load_json(loaded['regression-observations']['path'])
        V1.finite_tree(raw)
        validate_regression(raw, manifest, loaded, execution, run_dir)
    return {'status': 'ACCEPTABLE_CANDIDATE', 'acceptance': 'A1_PREREQUISITE_ONLY', 'case': case,
            'runId': manifest['runId'], 'candidateSha256': sha(path.read_bytes()),
            'executionSha256': execution_sha, 'checks': len(manifest['checks']), 'artifacts': len(manifest['artifacts'])}

def final(path, contract, execution, execution_sha):
    path = Path(path).resolve(strict=True)
    published = V1.load_json(path)
    require(path.name == 'owner-final.json' and published['status'] == 'PASS', 'No published PASS')
    draft_path = path.parent / 'owner-candidate.json'
    result = candidate(draft_path, contract, execution, execution_sha)
    draft = V1.load_json(draft_path)
    normalized = copy.deepcopy(published)
    receipt = normalized.pop('adjudication')
    normalized['status'] = 'READY_FOR_ADJUDICATION'
    exact(normalized, draft, 'Published data changed after adjudication')
    exact(receipt['result'], result, 'Adjudication result differs')
    require(receipt['candidateSha256'] == result['candidateSha256']
            and receipt['gateSha256'] == sha(Path(__file__).read_bytes()), 'Adjudication lock differs')
    require(Path(receipt['gatePath']).resolve() == Path(__file__).resolve(), 'Wrong adjudicator path')
    process_closed('adjudicator', receipt['process'])
    require(type(receipt['process']['exitCode']) is int and receipt['process']['exitCode'] == 0, 'Adjudicator did not succeed')
    exact(receipt['process']['logsSettled'], {'stdout': True, 'stderr': True}, 'Adjudicator logs did not settle')
    finished_logs('adjudicator', receipt['process'])
    output = owned_file(receipt['stdoutPath'], path.parent).read_bytes()
    errors = owned_file(receipt['stderrPath'], path.parent).read_bytes()
    require(receipt['stdoutSha256'] == sha(output) and receipt['stderrSha256'] == sha(errors), 'Adjudicator log receipt differs')
    exact(json.loads(output.decode('utf-8')), {'status': 'PASS', 'result': result}, 'Actual adjudicator stdout differs')
    require(errors == b'', 'Adjudicator stderr error remains')
    return {**result, 'status': 'VERIFIED_A1_EVIDENCE'}

def self_test(contract):
    result = V1.self_test(contract)
    mutations = []
    def rejects(label, fn):
        try:
            fn()
        except (ValueError, KeyError, TypeError, IndexError):
            mutations.append(label)
            return
        raise AssertionError('Mutation survived: ' + label)
    good = {'executionError': None, 'manifestWriteError': None, 'consoleErrors': [], 'pageErrors': [],
            'requestFailed': [], 'badResponses': [], 'cleanupErrors': []}
    common_errors(good)
    for key in good:
        bad = copy.deepcopy(good)
        bad[key] = ['fault'] if isinstance(good[key], list) else 'fault'
        rejects('protected-' + key, lambda bad=bad: common_errors(bad))
    rejects('protected-extra-error-field', lambda: common_errors({**good, 'ignored': True}))
    rejects('recursive-nan', lambda: V1.finite_tree({'raw': [{'actual': float('nan')}]}))
    rejects('numeric-bool', lambda: V1.compare_numeric(True, 1, 1))
    positive_process = {'closeAtMs': 1000, 'logsSettled': {'stdout': True, 'stderr': True}, 'logFinishSeen': {'stdout': True, 'stderr': True}, 'logCloseSeen': {'stdout': True, 'stderr': True}, 'logCloseAtMs': {'stdout': 1003, 'stderr': 1004},
                        'logFinishAtMs': {'stdout': 1001, 'stderr': 1002}}
    finished_logs('parser', positive_process)
    for label, value in [('before-close', {'stdout': 999, 'stderr': 1002}),
                         ('boolean-time', {'stdout': True, 'stderr': 1002}),
                         ('missing-stderr', {'stdout': 1001}),
                         ('extra-finish', {'stdout': 1001, 'stderr': 1002, 'extra': 1003})]:
        rejects('log-' + label, lambda value=value: finished_logs('parser', {**positive_process, 'logFinishAtMs': value}))
    for stream in ('stdout', 'stderr'):
        for key in ('logFinishSeen', 'logCloseSeen'):
            missing = copy.deepcopy(positive_process)
            del missing[key]
            rejects(stream + '-' + key + '-missing', lambda missing=missing: finished_logs('parser', missing))
            denied = copy.deepcopy(positive_process)
            denied[key][stream] = False
            rejects(stream + '-' + key + '-false', lambda denied=denied: finished_logs('parser', denied))
        for label, value in [('null', None), ('bool', True), ('zero', 0), ('before-finish', 1000), ('nan', float('nan'))]:
            denied = copy.deepcopy(positive_process)
            denied['logCloseAtMs'][stream] = value
            rejects(stream + '-close-' + label, lambda denied=denied: finished_logs('parser', denied))
    for key in ('logFinishSeen', 'logCloseSeen', 'logCloseAtMs'):
        denied = copy.deepcopy(positive_process)
        denied[key]['extra'] = True
        rejects(key + '-extra', lambda denied=denied: finished_logs('parser', denied))
    return {'proof': 'PARSER_ONLY_NO_RUNTIME_ACCEPTANCE', 'original': result, 'extraRejectedMutations': mutations}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execution-sha', required=True)
    parser.add_argument('--baseline-sha')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--scope', action='store_true')
    group.add_argument('--candidate')
    group.add_argument('--final')
    group.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    contract = locked(ORIGINAL / 'contract.json', ORIGINAL_CONTRACT_SHA)
    execution = locked(HERE / 'execution.json', args.execution_sha)
    require(execution['executionVersion'] == 4, 'Wrong execution version')
    frozen_shared(execution)
    if args.self_test:
        result = self_test(contract)
    else:
        require(args.baseline_sha, 'Baseline hash required')
        baseline = locked(HERE / 'baseline.json', args.baseline_sha)
        scope = V1.check_scope(baseline)
        if args.scope:
            result = scope
        elif args.candidate:
            result = candidate(args.candidate, contract, execution, args.execution_sha)
        else:
            result = final(args.final, contract, execution, args.execution_sha)
    print(json.dumps({'status': 'PASS', 'result': result}, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'FAIL', 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
