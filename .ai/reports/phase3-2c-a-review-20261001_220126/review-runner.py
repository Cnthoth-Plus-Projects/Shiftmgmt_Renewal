import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

REPORT = Path(__file__).resolve().parent
PRODUCT = Path(r'C:\Projects\Active\ShiftMgmt_V4')
CONTROL = REPORT.parents[2]

def snapshot(name):
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=PRODUCT).decode().split('\0')
    manifest = {}
    for rel in sorted(set(files)):
        file = PRODUCT / rel
        if rel and file.is_file():
            data = file.read_bytes()
            manifest[rel] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest().upper()}
    result = {
        'time': datetime.now(timezone.utc).isoformat(),
        'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=PRODUCT).decode().strip(),
        'branch': subprocess.check_output(['git', 'branch', '--show-current'], cwd=PRODUCT).decode().strip(),
        'status': subprocess.check_output(['git', 'status', '--short'], cwd=PRODUCT).decode().splitlines(),
        'files': manifest,
    }
    (REPORT / (name + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'snapshot': name, 'files': len(manifest), 'dirty': len(result['status']), 'head': result['head']}), flush=True)
    return result

def run(name, command, timeout=180, env_changes=None):
    environment = dict(os.environ)
    environment['PYTHONIOENCODING'] = 'utf-8'
    environment.update(env_changes or {})
    result = {'name': name, 'command': command, 'cwd': str(PRODUCT), 'start': datetime.now(timezone.utc).isoformat()}
    start = time.monotonic()
    with (REPORT / (name + '.stdout.txt')).open('wb') as stdout, (REPORT / (name + '.stderr.txt')).open('wb') as stderr:
        try:
            process = subprocess.Popen(command, cwd=PRODUCT, env=environment, stdout=stdout, stderr=stderr)
            result['pid'] = process.pid
            result['rc'] = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
            result.update(rc=-1, timeout=True)
        except Exception as error:
            result.update(rc=-2, harnessError=str(error))
    result['end'] = datetime.now(timezone.utc).isoformat()
    result['elapsedSeconds'] = round(time.monotonic() - start, 3)
    result['stdout'] = str(REPORT / (name + '.stdout.txt'))
    result['stderr'] = str(REPORT / (name + '.stderr.txt'))
    (REPORT / (name + '.command.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'name': name, 'rc': result['rc'], 'elapsed': result['elapsedSeconds']}), flush=True)
    if result['rc']:
        print((REPORT / (name + '.stderr.txt')).read_text(encoding='utf-8', errors='replace')[-1800:], flush=True)
    return result

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'static':
        snapshot('scope-before')
        checks = [('typecheck', ['npm.cmd', 'run', 'typecheck']), ('lint', ['npm.cmd', 'run', 'lint']), ('map', ['npm.cmd', 'run', 'validate:map']), ('diff-check', ['git', '-c', 'safe.directory=C:/Projects/Active/ShiftMgmt_V4', 'diff', '--check'])]
        for module in ['access-history', 'access-history-shared', 'access-history-positive', 'access-history-negative']:
            checks.append(('syntax-' + module, ['node', '--check', 'scripts/ui-checks/' + module + '.mjs']))
        checks.extend([('build', ['npm.cmd', 'run', 'build']), ('focused-tests', ['npx.cmd', 'vitest', 'run', 'src/web/screens/access-history-model.test.ts', 'src/main/services/access-log-service.test.ts', 'src/main/http/route-registry.test.ts', '--maxWorkers=1', '--minWorkers=1'])])
        results = [run(name, command) for name, command in checks]
        (REPORT / 'static-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        snapshot('scope-after-static')
        sys.exit(any(x['rc'] for x in results))
    elif mode == 'cases':
        cases = ['live-admin', 'list-fixture', 'empty-fixture', 'filters', 'stale-response', 'role-guard', 'errors', 'session-expired', 'regression-shell', 'regression-home']
        results = [run('case-' + case, ['node', 'scripts/ui-checks/access-history.mjs', '--case=' + case]) for case in cases]
        (REPORT / 'case-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        snapshot('scope-after-cases')
        sys.exit(any(x['rc'] for x in results))
    elif mode == 'full':
        sys.exit(run('full-tests', ['npm.cmd', 'test'], timeout=600)['rc'])
    else:
        raise ValueError(mode)
