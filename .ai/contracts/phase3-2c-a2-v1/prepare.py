"""Sol control preparation. Never edits product source or historical logs."""
from pathlib import Path
import hashlib, json, subprocess, sys
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
DOC = HERE.parents[2]
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT = DOC / '.ai/reports/phase3-2c-a2-prepare-20261014'
ALLOWED = ['scripts/ui-checks/access-history.mjs', 'scripts/ui-checks/access-history-shared.mjs',
           'scripts/ui-checks/access-history-positive.mjs', 'scripts/ui-checks/access-history-negative.mjs']

def meta(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest().upper()}

def save(path, value):
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, indent=2, ensure_ascii=False); f.write('\n')

def inventory():
    def git(*args): return subprocess.check_output(['git', *args], cwd=REPO).decode('utf-8')
    names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').rstrip('\0').split('\0')
    return {'repository': str(REPO), 'head': git('rev-parse', 'HEAD').strip(),
            'branch': git('branch', '--show-current').strip(),
            'status': git('status', '--porcelain', '--untracked-files=all').splitlines(),
            'files': {n: meta(REPO/n) for n in sorted(names)}}

if __name__ == '__main__':
    assert sys.argv[1:] == ['--intake']
    REPORT.mkdir(parents=True, exist_ok=False)
    (REPORT/'received-product').mkdir()
    before = inventory()
    previous = json.loads((DOC/'.ai/reports/phase3-2c-a1-v7-review-20261013_150833/final-evidence.json').read_text(encoding='utf-8'))
    assert before == previous['sourceAfter'], 'Product changed since accepted A1 closure'
    hand = DOC/'HANDOFF.md'
    archive = DOC/'Log/20261014_A1-v7-ACCEPTED_A2준비전보존.md'
    with archive.open('xb') as f: f.write(hand.read_bytes())
    assert archive.read_bytes() == hand.read_bytes()
    for n in ALLOWED:
        with (REPORT/'received-product'/Path(n).name).open('xb') as f: f.write((REPO/n).read_bytes())
    histories = {str(p): meta(p) for d in sorted((DOC/'.ai/contracts').iterdir())
                 if d.is_dir() and (d.name == 'phase3-2c-v1' or d.name.startswith('phase3-2c-a1-'))
                 for p in sorted(d.iterdir()) if p.is_file()}
    save(REPORT/'initial-evidence.json', {'proof': 'PREPARATION_ONLY_NOT_A2_IMPLEMENTATION',
         'sourceBefore': before, 'allowed': ALLOWED, 'protected': len(before['files'])-len(ALLOWED),
         'receivedHandoff': {'path': str(hand), **meta(hand)},
         'archive': {'path': str(archive), **meta(archive)}, 'historicalControls': histories,
         'A1Accepted': True, 'A2Accepted': False, 'BAccepted': False, 'v8Created': False})
    print(json.dumps({'files': len(before['files']), 'protected': len(before['files'])-4,
          'dirtyPaths': len(before['status']), 'historicalControls': len(histories), 'archive': meta(archive)}))
