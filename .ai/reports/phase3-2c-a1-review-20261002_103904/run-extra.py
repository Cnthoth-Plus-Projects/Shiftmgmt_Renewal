# -*- coding: utf-8 -*-
"""Read-only SUT extra boundary tests. Instrument only newly owned runs."""
from pathlib import Path
import json,os,subprocess,sys,time
REPORT=Path(__file__).resolve().parent;ROOT=REPORT.parents[2]
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');NEW=ROOT/'.ai/contracts/phase3-2c-a1-v2'
records=[]
for mode in ['gate-result-mismatch','owner-bad-ack']:
    events=REPORT/('extra-'+mode+'.events.jsonl');env=dict(os.environ);env.pop('NODE_DEBUG',None)
    env.update(SOL_A1_PROBE=mode,SOL_A1_PROBE_EVENTS=str(events))
    argv=['node','--import',(REPORT/'extra-preload-review.mjs').as_uri(),'scripts/ui-checks/access-history.mjs','--case=contract-core']
    out=REPORT/('extra-'+mode+'.stdout.txt');err=REPORT/('extra-'+mode+'.stderr.txt');begin=time.time()*1000
    with out.open('wb') as stdout,err.open('wb') as stderr:
        child=subprocess.Popen(argv,cwd=REPO,env=env,stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW)
        try:rc=child.wait(timeout=45)
        except subprocess.TimeoutExpired:
            child.kill();child.wait(timeout=10);raise RuntimeError('Supervisor timeout; child cleanup UNVERIFIED, STOP')
    rows=[json.loads(line) for line in events.read_text(encoding='utf-8').splitlines()]
    record={'mode':mode,'argv':argv,'cwd':str(REPO),'pid':child.pid,'createdAtMs':begin,'closedAtMs':time.time()*1000,
            'rc':rc,'stdout':str(out),'stderr':str(err),'events':rows}
    if mode=='gate-result-mismatch':
        value=json.loads(out.read_text(encoding='utf-8').strip());record['ownerOutput']=value
        if value.get('status')=='PASS':
            manifest=Path(value['manifestPath']);gate=[sys.executable,str(NEW/'gate-evidence.py'),
                '--execution-sha','66C973A13D653C7A4D745ED2DE7B72C03E96BFE793148F677A61E5CBAF2F5494',
                '--baseline-sha','189B304051EE90E94148DE3D6E3B13B1E607D3840C7FC6E47A7B6D4DE46E8933','--final',str(manifest)]
            result=subprocess.run(gate,cwd=REPO,capture_output=True,timeout=20)
            record.update(independentFinalRc=result.returncode,independentFinalStdout=result.stdout.decode('utf-8'),
                          independentFinalStderr=result.stderr.decode('utf-8'))
            record['falseOwnerPass']=rc==0 and result.returncode!=0
    else:
        worker_closes=[e for e in rows if e['type']=='actual-child-close' and not e.get('server') and not e.get('gate')]
        removals=[e for e in rows if e['type']=='owned-temp-remove-complete']
        record['tempRemovedBeforeWorkerClosed']=bool(removals and worker_closes and removals[0]['timeMs']<worker_closes[0]['timeMs'])
        record['ordering']={'tempRemove':removals,'workerActualClose':worker_closes}
    records.append(record);print(json.dumps({k:v for k,v in record.items() if k in ['mode','rc','falseOwnerPass','tempRemovedBeforeWorkerClosed','independentFinalRc']},ensure_ascii=False),flush=True)
(REPORT/'extra-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
