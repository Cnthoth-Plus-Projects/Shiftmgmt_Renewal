"""Root actual owner/SDK probes. Keeps all evidence and never edits SUT."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,socket,subprocess,sys,tempfile
from urllib.parse import urlencode
HERE=Path(__file__).resolve().parent
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CONTROL=HERE.parents[1]/'contracts/phase3-2c-a2-v1'
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def main():
    root=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a2-review-runtime-'));records=[]
    env={k:v for k,v in os.environ.items() if not k.startswith(('SOL_','SHIFT_','SHIFTMGMT_','AUTH_BOOTSTRAP_')) and k not in ('NODE_OPTIONS','NODE_DEBUG')}
    env['PYTHONIOENCODING']='utf-8'
    for name,case,mode in [('viewport901-errors','errors','viewport901'),('both-close-throw-errors','errors','both-close-throw'),('context-close-throw-live','live-admin','context-close-throw')]:
        with socket.socket() as probe:probe.bind(('127.0.0.1',18741))
        out=root/(name+'.stdout.txt');err=root/(name+'.stderr.txt');trace=root/(name+'.owner.jsonl');child_trace=root/(name+'.sdk.jsonl')
        uri=(HERE/'owner-review-preload.mjs').as_uri()+'?'+urlencode({'mode':mode,'trace':str(trace),'childTrace':str(child_trace)})
        argv=['node','--import',uri,'scripts/ui-checks/access-history.mjs','--case='+case];start=datetime.now(timezone.utc).isoformat()
        with out.open('xb') as stdout,err.open('xb') as stderr:
            child=subprocess.Popen(argv,cwd=REPO,env=env,stdout=stdout,stderr=stderr)
            try:rc=child.wait(timeout=190);timed=False
            except subprocess.TimeoutExpired:timed=True;child.kill();rc=child.wait(timeout=10)
        record={'name':name,'case':case,'mode':mode,'argv':argv,'cwd':str(REPO),'pid':child.pid,'startUtc':start,'endUtc':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed,'stdout':str(out),'stderr':str(err),'stdoutMeta':meta(out),'stderrMeta':meta(err),'ownerTrace':str(trace),'sdkTrace':str(child_trace)}
        terminal=json.loads(err.read_text(encoding='utf-8').strip());record['terminal']=terminal
        if terminal.get('manifestPath'):run=Path(terminal['manifestPath']).parent
        else:
            candidates=[]
            for p in (REPO/'artifacts/captures/phase3'/('access-history-'+case)).glob('run-*/owner-failure.json'):
                v=json.loads(p.read_text(encoding='utf-8'))
                if v['owner']['pid']==child.pid:candidates.append(p)
            assert len(candidates)==1,candidates
            run=candidates[0].parent
        record['runDir']=str(run)
        record['artifactMeta']={p.name:meta(p) for p in run.iterdir() if p.is_file()}
        for n in ['owner-final.json','owner-failure.json','worker-final.json','normal-observations.json','normal-partial.json']:
            p=run/n
            if p.exists():
                v=json.loads(p.read_text(encoding='utf-8'))
                record[n]={'status':v.get('status'),'exitCode':v.get('exitCode'),'rawViewport':v.get('environment',{}).get('viewport'),'resources':v.get('resources'),'errors':v.get('errors'),'steps':v.get('steps'),'workerPartialPath':v.get('workerPartialPath'),'rawIsNull':v.get('raw') is None,'tempRemoved':v.get('cleanup',{}).get('tempRemoved')}
        sdk=[json.loads(line) for line in child_trace.read_text(encoding='utf-8').splitlines()]
        owner=[json.loads(line) for line in trace.read_text(encoding='utf-8').splitlines()]
        record['sdkObservations']=sdk
        record['allObservedChildrenClosed']=all(any(c['kind']=='actual-close' and c['childPid']==p['childPid'] for c in owner) for p in owner if p['kind']=='actual-spawn')
        record['allActualSdkCloseReturns']=sum(e['kind'] in ['actual-context-close-return','actual-browser-close-return'] for e in sdk)
        records.append(record)
        (root/(name+'.result.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'name':name,'rc':rc,'status':terminal['status'],'code':terminal.get('code'),'runDir':str(run),'observedChildrenClosed':record['allObservedChildrenClosed'],'actualSdkCloseReturns':record['allActualSdkCloseReturns']}),flush=True)
    result={'proof':'ACTUAL_OWNER_AND_REAL_SDK_CONTROLLED_PROBES_NOT_A2_ACCEPTANCE','records':records,'productEdits':0,'retention':'Retain this own evidence root and all own SUT runs/temp; foreign cleanup forbidden'}
    (root/'review-runtime-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'artifact':str(root),'cases':len(records),'proof':result['proof']}))
if __name__=='__main__':main()
