# -*- coding: utf-8 -*-
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile

sys.stdout.reconfigure(encoding='utf-8')
REPORT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rr', REPORT / 'review-runner.py')
rr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rr)
parent = rr.PRODUCT / 'artifacts/captures/phase3/access-history-foundation-probes'
parent.mkdir(parents=True, exist_ok=True)
artifact = Path(tempfile.mkdtemp(prefix='run-sol-a-review-', dir=str(parent)))
preload = artifact / 'fault-preload.mjs'
shutil.copyfile(REPORT / 'fault-preload.mjs', preload)
(REPORT / 'owned-artifact.json').write_text(json.dumps({'path':str(artifact),'retention':'retain independent review evidence; own ignored validation artifacts only','sourceWrites':0},indent=2),encoding='utf-8')
CHECKER=REPORT.parents[2]/'.ai/contracts/phase3-2c-v1/verify-evidence.py'
CHECK=['python',str(CHECKER),'--contract-sha','014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE','--baseline-sha','E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50']
mode=sys.argv[1] if len(sys.argv)>1 else 'faults'
cases = [('png-24-byte-header','contract-core'),('duplicate-core-ids','contract-core'),('unexpected-raw-error','contract-core'),('server-close-not-observed','contract-core'),('regression-no-evidence','regression-shell'),('owner-final-write','contract-core')]
if mode=='cases':
    cases=[('timer-only',c) for c in ['live-admin','list-fixture','empty-fixture','filters','errors','stale-response','role-guard','session-expired','regression-shell','regression-home']]
results=[]
for fault,case in cases:
    event_file=artifact/(fault+'-'+case+'.events.jsonl')
    r=rr.run(mode+'-'+fault+'-'+case,['node','--import',preload.as_uri(),'scripts/ui-checks/access-history.mjs','--case='+case],timeout=200,env_changes={'SOL_A_REVIEW_FAULT':fault,'SOL_A_REVIEW_EVENT_FILE':str(event_file)})
    r['fault']=fault;r['case']=case;r['events']=[json.loads(x)for x in event_file.read_text(encoding='utf-8').splitlines()]if event_file.exists()else[]
    for line in Path(r['stdout']).read_text(encoding='utf-8').splitlines():
        try:
            val=json.loads(line)
            if 'manifestPath'in val:
                r['ownerFinal']=val
                if Path(val['manifestPath']).is_file():r['manifest']=json.loads(Path(val['manifestPath']).read_text(encoding='utf-8'))
                if case=='contract-core' and Path(val['manifestPath']).is_file():r['checker']=rr.run(mode+'-check-'+fault,CHECK+['--core',val['manifestPath']])
        except json.JSONDecodeError:pass
    results.append(r)
    (REPORT/(mode+'-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'fault':fault,'case':case,'actualRc':r['rc'],'status':r.get('ownerFinal',{}).get('status'),'checkerRc':r.get('checker',{}).get('rc'),'injections':len(r['events'])},ensure_ascii=False),flush=True)
rr.snapshot('scope-after-'+mode)
