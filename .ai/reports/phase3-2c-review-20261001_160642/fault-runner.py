import json
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
from datetime import datetime, timezone

REPORT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('review_runner', REPORT / 'review-runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
PRODUCT = runner.PRODUCT
artifact = Path(tempfile.mkdtemp(prefix='sol-review-32c-', dir=PRODUCT / 'artifacts/captures/phase3'))
preload = artifact / 'fault-preload.mjs'
shutil.copyfile(REPORT / 'fault-preload.mjs', preload)
(REPORT / 'fault-artifact-location.json').write_text(json.dumps({'path':str(artifact),'retention':'retain test evidence; no historical artifact modification'},indent=2),encoding='utf-8')
faults = [('date-90x24','list-fixture'),('date-tolerance','list-fixture'),('list-values','list-fixture'),('unexpected-console-401','session-expired'),('no-cookie-500','session-expired'),('negative-context-close','errors'),('owner-manifest-write','empty-fixture')]
results = []
for fault, case in faults:
    eventFile = artifact / (fault + '.events.jsonl')
    result = runner.run('fault-' + fault, ['node','--import',preload.as_uri(),'scripts/ui-checks/access-history.mjs','--case=' + case], env_changes={'SOL_REVIEW_FAULT':fault,'SOL_REVIEW_EVENTS':str(eventFile)})
    result['expectedRcNonzero'] = True
    result['rejected'] = result['rc'] != 0
    result['events'] = [json.loads(line) for line in eventFile.read_text(encoding='utf-8').splitlines()] if eventFile.exists() else []
    result['artifact'] = str(artifact)
    result['createdEvidence'] = [str(file) for file in (PRODUCT / ('artifacts/captures/phase3/access-history-' + case)).rglob('*') if file.is_file() and datetime.fromtimestamp(file.stat().st_mtime,timezone.utc).isoformat() >= result['start']]
    results.append(result)
    (REPORT / 'fault-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'fault':fault,'actualRc':result['rc'],'injectionEvents':len(result['events']),'falsePass':not result['rejected']}),flush=True)
result = runner.run('fault-cli-zero-args',['node','scripts/ui-checks/access-history.mjs'])
result['expectedRcNonzero'] = True
results.append(result)
(REPORT / 'fault-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
runner.snapshot('scope-after-faults')
