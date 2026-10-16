"""Sol control preparation. Product and all existing contracts/logs are read-only."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
DOC = Path(r'C:\Projects\Active\교대근무관리 시스템')
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT = Path(__file__).resolve().parent
OLD = DOC / '.ai/contracts/phase3-2c-a1-v2'
NEW = DOC / '.ai/contracts/phase3-2c-a1-v3'

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def product_snapshot():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=REPO).decode('utf-8')
    names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').rstrip('\0').split('\0')
    files = {name: {'bytes': len((data := (REPO / name).read_bytes())), 'sha256': sha(data)} for name in sorted(names)}
    return {'repository': str(REPO), 'head': git('rev-parse', 'HEAD').strip(),
            'branch': git('branch', '--show-current').strip(),
            'status': git('status', '--porcelain', '--untracked-files=all').splitlines(), 'files': files}

def initialize():
    if NEW.exists():
        raise ValueError('New control directory already exists; refuse replacement')
    snapshot = product_snapshot()
    previous = json.loads((DOC / '.ai/reports/phase3-2c-a1-review-20261002_103904/final-evidence.json').read_text(encoding='utf-8'))
    assert snapshot['files'] == previous['sourceBefore']['files']
    assert snapshot['head'] == previous['sourceBefore']['head']
    assert snapshot['status'] == previous['sourceBefore']['status']
    assert len(snapshot['files']) == 341
    received = (DOC / 'HANDOFF.md').read_bytes()
    archive = DOC / 'Log/20261012_110625_3-2c-A1-Sol-REPLAN_수신검수결과보존본.md'
    with archive.open('xb') as handle:
        handle.write(received)
    assert archive.read_bytes() == received
    old_controls = {str(p): {'bytes': len((data := p.read_bytes())), 'sha256': sha(data)}
                    for folder in (OLD, DOC / '.ai/contracts/phase3-2c-v1') for p in sorted(folder.iterdir()) if p.is_file()}
    NEW.mkdir()
    for name in ('frozen-shared.json', 'gate-evidence.py', 'runtime-preload.mjs', 'ipc-probes.mjs', 'component-probes.mjs'):
        (NEW / name).write_bytes((OLD / name).read_bytes())
    execution = json.loads((OLD / 'execution.json').read_text(encoding='utf-8'))
    execution.update(executionVersion=3, ipcProtocol=2, runtimeFaultsRequired=38,
                     frozenSharedPath=str(NEW / 'frozen-shared.json'),
                     controlHealthRequired=True, exactFailureCodesRequired=True)
    execution['acceptance'] = 'A1 prerequisite only; all A2 normal8/A-N obligations and B87 remain unaccepted'
    execution['ownerFailureCodes'] = ['A1_CLI_INVALID','A1_LOCK_MISMATCH','A1_PORT_BUSY',
        'A1_SERVER_SPAWN_FAILURE','A1_WORKER_SPAWN_FAILURE','A1_ACK_INVALID','A1_ACK_TIMEOUT',
        'A1_WORKER_FAILED','A1_GATE_REJECTED','A1_GATE_SPAWN_FAILURE','A1_GATE_RESPONSE_MISMATCH',
        'A1_LOG_WRITE_FAILED','A1_LOG_FINISH_UNVERIFIED','A1_CLOSE_UNVERIFIED','A1_FINAL_WRITE_FAILED']
    dump(NEW / 'execution.json', execution)
    dump(REPORT / 'initial-evidence.json', {'time': datetime.now(timezone.utc).isoformat(),
        'archive': str(archive), 'receivedBytes': len(received), 'receivedSha256': sha(received),
        'sourceBefore': snapshot, 'originalControls': old_controls,
        'productEditsBySol': 0, 'sameClassCorrectionsExhausted': 2, 'counterReset': False})
    print(json.dumps({'status':'CONTROL_INITIALIZED','sourceFiles':341,'dirtyPaths':len(snapshot['status']),
        'archive':str(archive),'receivedBytes':len(received),'receivedSha256':sha(received)},ensure_ascii=False))

if __name__ == '__main__':
    initialize()
