# -*- coding: utf-8 -*-
"""Independent Sol commands. Immutable controls and product source stay read-only."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
import hashlib
sys.dont_write_bytecode = True
REPORT = Path(__file__).resolve().parent
DOC = REPORT.parent.parent.parent
CTRL = DOC / '.ai/contracts/phase3-2c-a1-v4'
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
INITIAL = json.loads((REPORT / 'initial-evidence.json').read_text(encoding='utf-8'))

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def run(name, argv, limit=900):
    env = dict(os.environ)
    env['PYTHONIOENCODING'] = 'utf-8'
    for key in list(env):
        if key.startswith(('SOL_', 'SHIFT_', 'SHIFTMGMT_')) or key in ('NODE_OPTIONS', 'NODE_DEBUG'):
            del env[key]
    stdout, stderr = REPORT / (name+'.stdout.txt'), REPORT / (name+'.stderr.txt')
    start = datetime.now(timezone.utc).isoformat()
    with stdout.open('xb') as out, stderr.open('xb') as err:
        child = subprocess.Popen(argv, cwd=REPO, env=env, stdout=out, stderr=err)
        timeout = False
        try:
            rc = child.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            timeout = True
            child.kill()
            rc = child.wait(timeout=10)
    record = {'name': name, 'argv': argv, 'cwd': str(REPO), 'pid': child.pid, 'start': start,
              'end': datetime.now(timezone.utc).isoformat(), 'rc': rc, 'timeout': timeout,
              'stdout': str(stdout), 'stderr': str(stderr),
              'stdoutSha256': sha(stdout.read_bytes()), 'stderrSha256': sha(stderr.read_bytes())}
    with (REPORT / (name+'.command.json')).open('x', encoding='utf-8') as out:
        json.dump(record, out, ensure_ascii=False, indent=2)
    print(json.dumps({'name': name, 'rc': rc, 'timeout': timeout}), flush=True)
    return record

GATE = [sys.executable, '-X', 'utf8', '-B', str(CTRL/'gate-evidence.py'),
        '--execution-sha', INITIAL['executionSha256'], '--baseline-sha', INITIAL['baselineSha256']]

def main():
    stage = sys.argv[1]
    if stage == 'static':
        commands = [('scope-before', GATE+['--scope']),
                    ('syntax-owner', ['node', '--check', 'scripts/ui-checks/access-history.mjs']),
                    ('syntax-shared', ['node', '--check', 'scripts/ui-checks/access-history-shared.mjs']),
                    ('typecheck', ['npm.cmd', 'run', 'typecheck']),
                    ('lint', ['npm.cmd', 'run', 'lint']),
                    ('map', ['npm.cmd', 'run', 'validate:map']),
                    ('diff-check', ['git', 'diff', '--check']),
                    ('build', ['npm.cmd', 'run', 'build']),
                    ('focused-tests', ['npx.cmd', 'vitest', 'run', 'src/web/screens/access-history-model.test.ts',
                       'src/main/services/access-log-service.test.ts', 'src/main/http/route-registry.test.ts',
                       '--maxWorkers=1', '--minWorkers=1'])]
        for name, argv in commands:
            result = run(name, argv, 180)
            if result['rc'] != 0 or result['timeout']:
                return 1
    elif stage == 'runtime':
        result = run('runtime-suite', [sys.executable, '-X', 'utf8', '-B', str(CTRL/'runtime-probes.py'),
                      '--execution-sha', INITIAL['executionSha256'], '--baseline-sha', INITIAL['baselineSha256']])
        return result['rc']
    elif stage == 'ipc':
        return run('ipc-suite', ['node', str(CTRL/'ipc-probes.mjs')], 240)['rc']
    elif stage == 'component':
        receipt = json.loads((REPORT/'runtime-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1])
        suite = json.loads((Path(receipt['artifact'])/'suite-result.json').read_text(encoding='utf-8'))
        core = next(r for r in suite['records'] if r['name']=='positive-contract-core')
        final = json.loads(core['output'])['manifestPath']
        return run('component-suite', ['node', str(CTRL/'component-probes.mjs'), '--core-manifest', final,
                      '--execution-sha', INITIAL['executionSha256'], '--baseline-sha', INITIAL['baselineSha256']], 120)['rc']
    elif stage == 'partial':
        return run('partial-suite', ['node', str(CTRL/'partial-probes.mjs')], 240)['rc']
    else:
        raise ValueError('Unknown stage '+stage)
    return 0

if __name__ == '__main__':
    sys.exit(main())
