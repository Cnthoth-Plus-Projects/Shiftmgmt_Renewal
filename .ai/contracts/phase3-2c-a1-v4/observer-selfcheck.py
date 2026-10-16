"""Actual observer canaries and current-SUT preflight only, never A1 acceptance."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import uuid

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
FORBIDDEN = {'spawn','directory-created','directory-write','file-write','http-attempt','owned-temp-remove-start'}

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def observer_health(text, pid, mode, session, rc):
    if not text.endswith('\n'):
        raise ValueError('Observer log missing final newline')
    rows = [json.loads(line) for line in text.splitlines()]
    if len(rows) < 3:
        raise ValueError('Observer lifecycle absent')
    previous = '0' * 64
    for number, row in enumerate(rows, 1):
        canonical = row['canonical']
        payload = {key:value for key,value in row.items() if key not in ('canonical','eventSha256')}
        if json.loads(canonical) != payload or sha(canonical.encode('utf-8')) != row['eventSha256']:
            raise ValueError('Observer event contents/hash differ')
        if row['schema'] != 3 or row['seq'] != number or row['previousEventSha'] != previous:
            raise ValueError('Observer sequence/chain differs')
        if row['pid'] != pid or row['mode'] != mode or row['session'] != session:
            raise ValueError('Observer run identity differs')
        previous = row['eventSha256']
    if rows[0]['type'] != 'observer-initializing' or rows[-1]['type'] != 'owner-process-exit' or rows[-1]['code'] != rc:
        raise ValueError('Observer start/exit identity differs')
    if sum(row['type']=='instrumentation-loaded' for row in rows) != 1:
        raise ValueError('Observer startup not confirmed')
    if any(row['type']=='probe-observer-error' for row in rows):
        raise ValueError('Observer fault-injection error')
    return rows

def run(folder, name, mode, tail, cwd=REPO, canary=False, preload=None):
    event = folder / (name+'.events.jsonl')
    session = uuid.uuid4().hex
    env = dict(os.environ)
    env.pop('NODE_OPTIONS',None)
    env.pop('NODE_DEBUG',None)
    for key in list(env):
        if key.startswith('SOL_A1_'):
            del env[key]
    env.update(SOL_A1_PROBE=mode,SOL_A1_PROBE_EVENTS=str(event),SOL_A1_PROBE_SESSION=session)
    if canary:
        env['SOL_A1_CANARY_GATE']=session
    argv=['node','--import',(preload or HERE/'runtime-preload.mjs').as_uri(),*tail]
    stdout,stderr=folder/(name+'.stdout.txt'),folder/(name+'.stderr.txt')
    started=datetime.now(timezone.utc).isoformat()
    with stdout.open('wb') as out,stderr.open('wb') as err:
        child=subprocess.Popen(argv,cwd=cwd,env=env,stdout=out,stderr=err)
        try:
            rc=child.wait(timeout=12)
        except subprocess.TimeoutExpired:
            child.kill();child.wait(timeout=5)
            raise ValueError('Canary timeout; retained exact owned run, no descendants presumed closed')
    record={'name':name,'argv':argv,'cwd':str(cwd),'pid':child.pid,'session':session,'mode':mode,'rc':rc,
        'start':started,'end':datetime.now(timezone.utc).isoformat(),'stdout':str(stdout),'stderr':str(stderr),'events':str(event)}
    record['output']=stdout.read_text(encoding='utf-8',errors='replace')
    record['errors']=stderr.read_text(encoding='utf-8',errors='replace')
    try:
        rows=observer_health(event.read_text(encoding='utf-8'),child.pid,mode,session,rc)
        record.update(observerHealthy=True,eventCount=len(rows),sideEffectFree=not any(row['type'] in FORBIDDEN for row in rows))
    except (ValueError,KeyError,FileNotFoundError,json.JSONDecodeError) as error:
        rows=[];record.update(observerHealthy=False,observerError=str(error),sideEffectFree=False)
    (folder/(name+'.command.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    return record,rows

def coded_error(text, expected):
    for line in text.splitlines():
        try:
            value=json.loads(line)
            if value.get('status')=='FAIL' and value.get('code')==expected:
                return True
        except (ValueError,AttributeError):pass
    return False

def main():
    folder=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a1v4-selfcheck-'))
    results=[]
    def add(record,condition):
        record['acceptedControlCheck']=bool(condition)
        results.append(record)
        print(json.dumps({'name':record['name'],'rc':record['rc'],'observerHealthy':record['observerHealthy'],'accepted':bool(condition)}),flush=True)
    r,rows=run(folder,'observer-idle','preflight',[str(HERE/'observer-canary.mjs'),'idle',str(folder)],cwd=folder)
    add(r,r['rc']==0 and r['observerHealthy'] and r['sideEffectFree'])
    good_rows=rows;good_record=r
    r,rows=run(folder,'actual-io-child-stream-http','canary-io',[str(HERE/'observer-canary.mjs'),'io',str(folder)],cwd=folder)
    required={'file-write','directory-created','directory-write','spawn','actual-child-exit','actual-child-close','actual-log-finish','actual-log-close','http-attempt','owned-temp-remove-complete'}
    remove_positions=[row['seq'] for row in rows if row['type']=='owned-temp-remove-complete']
    closes=[row['seq'] for row in rows if row['type']=='actual-child-close']
    add(r,r['rc']==0 and r['observerHealthy'] and required <= {row['type'] for row in rows} and min(remove_positions)>max(closes))
    r,rows=run(folder,'actual-sync-write-denial','final-write-denied',[str(HERE/'observer-canary.mjs'),'denied',str(folder)],cwd=folder)
    add(r,r['rc']==1 and r['observerHealthy'] and 'SOL_A1_FINAL_WRITE_DENIED' in r['errors'] and any(row['type']=='fault-triggered' for row in rows))
    r,rows=run(folder,'actual-unseen-stream-finish','log-finish-not-observed',[str(HERE/'observer-canary.mjs'),'io',str(folder)],cwd=folder)
    add(r,r['rc']==1 and r['observerHealthy'] and 'SOL_CANARY_FINISH_NOT_SEEN' in r['errors'] and any(row.get('hiddenFromSut') for row in rows))
    r,rows=run(folder,'actual-unseen-stream-close','log-close-not-observed',[str(HERE/'observer-canary.mjs'),'io',str(folder)],cwd=folder)
    add(r,r['rc']==1 and r['observerHealthy'] and 'SOL_CANARY_CLOSE_NOT_SEEN' in r['errors'] and any(row.get('hiddenFromSut') for row in rows))
    r,rows=run(folder,'actual-log-write-error','log-write-denied',[str(HERE/'observer-canary.mjs'),'logdenied',str(folder)],cwd=folder)
    add(r,r['rc']==1 and r['observerHealthy'] and 'sol-a1-missing-log-dir' in r['errors'] and any(row['type']=='actual-log-error' for row in rows) and any(row['type']=='actual-log-close' for row in rows))
    r,rows=run(folder,'actual-late-log-error','late-log-error',[str(HERE/'observer-canary.mjs'),'io',str(folder)],cwd=folder)
    finishes=[row['seq'] for row in rows if row['type']=='actual-log-finish']
    late=[row['seq'] for row in rows if row['type']=='actual-log-error' and row.get('message')=='SOL_A1_LATE_LOG_ERROR']
    add(r,r['rc']==1 and r['observerHealthy'] and 'SOL_A1_LATE_LOG_ERROR' in r['errors'] and bool(finishes) and bool(late) and min(late)>min(finishes))
    fields=['case','runId','candidateSha256','executionSha256','checks','artifacts','acceptance','status','extra','extra-output','outer-extra']
    for field in fields:
        r,rows=run(folder,'actual-gate-tamper-'+field,'gate-response-'+field,[str(HERE/'observer-canary.mjs'),'gate',str(folder)],cwd=folder,canary=True)
        lines=r['output'].splitlines()
        parsed=json.loads(lines[0]) if lines else {}
        changed=(len(lines)==2) if field=='extra-output' else (parsed.get('result',{}).get('unapproved') is True) if field=='extra' else (parsed.get('unapproved') is True) if field=='outer-extra' else parsed.get('result',{}).get(field)!={'case':'contract-core','runId':'run-canary','candidateSha256':'A'*64,'executionSha256':'B'*64,'checks':9,'artifacts':7,'acceptance':'A1_PREREQUISITE_ONLY','status':'ACCEPTABLE_CANDIDATE'}[field]
        add(r,r['rc']==0 and r['observerHealthy'] and changed and any(row['type']=='fault-triggered' for row in rows) and any(row['type']=='actual-child-close' and row['code']==0 for row in rows))
    # The old preload is intentionally executed with no SUT to prove a crash is unhealthy.
    r,rows=run(folder,'old-preload-crash-not-a-valid-rejection','preflight',['-e','process.exit(0)'],preload=HERE.parent/'phase3-2c-a1-v2/runtime-preload.mjs')
    add(r,r['rc']!=0 and not r['observerHealthy'] and 'RangeError' in r['errors'])
    malformed=[[],['--case='],['--case=sol-unknown'],['--case=contract-core','--case=contract-core'],['--case=contract-core','extra'],['--url=http://127.0.0.1:18741/'],['http://127.0.0.1:18741/'],['--case= contract-core '],['--case=contract-core','--url=http://127.0.0.1:18741/']]
    for index,args in enumerate(malformed,1):
        r,rows=run(folder,'current-sut-cli-'+str(index),'preflight',['scripts/ui-checks/access-history.mjs',*args])
        add(r,r['rc']==1 and r['observerHealthy'] and r['sideEffectFree'] and ('[CLI 인수 오류]' in r['errors'] or coded_error(r['errors'],'A1_CLI_INVALID')) and not r['output'])
    execution=json.loads((HERE/'execution.json').read_text(encoding='utf-8'))
    for case in execution['deferredCases']:
        r,rows=run(folder,'current-sut-deferred-'+case,'preflight',['scripts/ui-checks/access-history.mjs','--case='+case])
        value=json.loads(r['output']) if r['output'] else {}
        required={'status':'BLOCKED_STAGE','case':case,'reason':'A2_PENDING','stageSlice':'A1'}
        add(r,r['rc']==1 and r['observerHealthy'] and r['sideEffectFree'] and all(value.get(key)==expected for key,expected in required.items()) and set(value)<=set(required)|{'code'} and value.get('code','A1_DEFERRED')=='A1_DEFERRED')
    with socket.socket() as stub:
        stub.bind(('127.0.0.1',18741));stub.listen()
        r,rows=run(folder,'current-sut-real-occupied-port','port-preflight',['scripts/ui-checks/access-history.mjs','--case=contract-core'])
        add(r,r['rc']==1 and r['observerHealthy'] and r['sideEffectFree'] and ('[포트 점유 거부]' in r['errors'] or coded_error(r['errors'],'A1_PORT_BUSY')) and not r['output'])
    rejected=[]
    # Test in-memory corruptions. The original event files remain untouched.
    text=(folder/'observer-idle.events.jsonl').read_text(encoding='utf-8')
    values=[('empty',''),('truncated-newline',text.rstrip('\n')),('missing-start','\n'.join(text.splitlines()[1:])+'\n'),('missing-exit','\n'.join(text.splitlines()[:-1])+'\n')]
    for key,value in [('seq',77),('session','0'*32),('pid',good_record['pid']+1),('eventSha256','0'*64),('previousEventSha','F'*64)]:
        clone=json.loads(json.dumps(good_rows));clone[1][key]=value
        values.append(('corrupt-'+key,'\n'.join(json.dumps(row,ensure_ascii=False) for row in clone)+'\n'))
    for name,corruption in values:
        try:observer_health(corruption,good_record['pid'],'preflight',good_record['session'],0)
        except (ValueError,KeyError,json.JSONDecodeError):rejected.append(name)
        else:raise AssertionError('Unhealthy observation accepted: '+name)
    successful=all(row['acceptedControlCheck'] for row in results)
    control_files={name:hashlib.sha256((HERE/name).read_bytes()).hexdigest().upper() for name in ('observer-selfcheck.py','observer-canary.mjs','runtime-preload.mjs')}
    result={'status':'PASS' if successful else 'FAIL','proof':'CONTROL_CANARIES_AND_CURRENT_SUT_PREFLIGHT_ONLY_NOT_A1_ACCEPTANCE','controlFiles':control_files,
        'actualControlChecks':len(results),'corruptedObservationVectorsRejected':rejected,'records':results,
        'retention':'Retain this exact external temporary directory and all receipts; no old/foreign path cleanup',
        'productEdits':0,'A1Acceptance':False,'A2Acceptance':False,'BAuthorization':False}
    (folder/'selfcheck-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'artifact':str(folder),'actualControlChecks':len(results),'rejectedCorruptions':len(rejected),'proof':result['proof']}),flush=True)
    return 0 if successful else 1

if __name__=='__main__':
    sys.exit(main())
