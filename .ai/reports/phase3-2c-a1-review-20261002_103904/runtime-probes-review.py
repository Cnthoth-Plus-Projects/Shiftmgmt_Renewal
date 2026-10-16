"""Real SUT negative suite; requires all three uninstrumented positives first.
No model invocation, source edits, historical artifact mutation, or foreign PID kill.
Runs are retained with commands, bytes, stdout/stderr, events, and exit status.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

HERE = Path('C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\contracts\\phase3-2c-a1-v2')
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
CORE_FAULTS = ['png-header-only','png-crc','duplicate-id','missing-id','extra-id','caller-expected','constant-actual',
               'raw-console','raw-pageerror','raw-requestfailed','raw-http','canonical-drift','worker-close-receipt',
               'server-close-receipt','server-close-not-observed','final-write-denied','server-spawn-error','log-write-denied',
               'owner-bad-ack','worker-no-ack','worker-no-run','gate-spawn-error','gate-log-write-denied']
REASONS = {'png-header-only':'Truncated PNG','png-crc':'PNG CRC','duplicate-id':'Duplicate check ID',
           'missing-id':'Missing/unknown/extra check ID','extra-id':'Missing/unknown/extra check ID',
           'caller-expected':'Unexpected check fields','constant-actual':'Actual differs from raw observation',
           'raw-console':'CORE-06 comparison failed','raw-pageerror':'CORE-06 comparison failed',
           'raw-requestfailed':'CORE-06 comparison failed','raw-http':'CORE-06 comparison failed',
           'canonical-drift':'CORE-04 comparison failed','worker-close-receipt':'worker close not confirmed',
           'server-close-receipt':'server close not confirmed'}

def events_from(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()] if path.exists() else []

def instrumented(folder,name,extra):
    path=folder/(name+'.events.jsonl');environment=dict(os.environ)
    environment.update(SOL_A1_PROBE='preflight',SOL_A1_PROBE_EVENTS=str(path))
    result=run(folder,name,['node','--import',Path('C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\reports\\phase3-2c-a1-review-20261002_103904\\runtime-preload-review.mjs').as_uri(),'scripts/ui-checks/access-history.mjs']+extra,environment,limit=12)
    events=events_from(path)
    result['events']=events
    result['sideEffectFree']=not any(e['type'] in ['spawn','directory-created','directory-write','file-write','http-attempt'] for e in events)
    return result

def run(folder, name, argv, env=None, limit=215):
    started = datetime.now(timezone.utc).isoformat()
    stdout, stderr = folder / (name+'.stdout.txt'), folder / (name+'.stderr.txt')
    begin=time.monotonic()
    environment=dict(os.environ) if env is None else dict(env)
    environment.pop('NODE_DEBUG', None)
    with stdout.open('wb') as out, stderr.open('wb') as err:
        child=subprocess.Popen(argv,cwd=REPO,env=environment,stdout=out,stderr=err)
        timeout=False
        try:
            rc=child.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            timeout=True
            child.kill()  # This exact Popen handle only; never PID discovery/foreign process.
            rc=child.wait(timeout=10)
    record={'name':name,'argv':argv,'cwd':str(REPO),'pid':child.pid,'start':started,
            'end':datetime.now(timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-begin,3),
            'rc':rc,'timeout':timeout,'stdout':str(stdout),'stderr':str(stderr)}
    values=[]
    for line in stdout.read_text(encoding='utf-8',errors='replace').splitlines():
        try:
            value=json.loads(line)
            if isinstance(value,dict):values.append(value)
        except ValueError:
            pass
    record['jsonOutput']=values
    (folder/(name+'.command.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'name':name,'rc':rc,'elapsedSeconds':record['elapsedSeconds'],'timeout':timeout}),flush=True)
    return record

def last_owner(record):
    candidates=[value for value in record['jsonOutput'] if 'status' in value]
    return candidates[-1] if candidates else None

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--execution-sha',required=True)
    parser.add_argument('--baseline-sha',required=True)
    parser.add_argument('--list',action='store_true')
    args=parser.parse_args()
    execution=json.loads((HERE/'execution.json').read_text(encoding='utf-8'))
    assert hashlib.sha256((HERE/'execution.json').read_bytes()).hexdigest().upper()==args.execution_sha
    if args.list:
        print(json.dumps({'proof':'PLAN_ONLY_NOT_RUN','positiveCases':execution['enabledCases'],
              'deferredCases':execution['deferredCases'],'coreFaults':CORE_FAULTS,
              'regressionFaults':['regression-no-evidence'],'malformedPublicCases':9},ensure_ascii=False));return
    folder=REPO/'artifacts/captures/phase3/access-history-foundation-probes'/('run-sol-a1-'+uuid.uuid4().hex[:12])
    folder.mkdir(parents=True)
    records=[]
    locked_scope=['python',str(HERE/'gate-evidence.py'),'--execution-sha',args.execution_sha,'--baseline-sha',args.baseline_sha]
    pre=run(folder,'scope-before',locked_scope+['--scope']);records.append(pre)
    positives_ok=pre['rc']==0
    def stop_unverified(reason):
        result={'status':'UNVERIFIED_STOP','reason':reason,'records':records,
          'runtimeNegativeAcceptance':'NOT_CLAIMED',
          'retention':'retain own run and possible child resources; no historical/foreign cleanup'}
        (folder/'suite-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'status':result['status'],'artifact':str(folder),'reason':reason}));return 1
    if not positives_ok:
        return stop_unverified('Preflight scope failed; application was not started')
    for case in execution['enabledCases']:
        r=run(folder,'positive-'+case,['node','scripts/ui-checks/access-history.mjs','--case='+case]);records.append(r)
        if r['timeout']:
            return stop_unverified('Positive supervisor timeout; child cleanup unverified')
        owner=last_owner(r)
        ok=r['rc']==0 and owner is not None and owner.get('status')=='PASS' and not r['timeout']
        if ok:
            proof=run(folder,'positive-final-'+case,locked_scope+['--final',owner['manifestPath']]);records.append(proof);ok=proof['rc']==0
        positives_ok=positives_ok and ok
    if not positives_ok:
        (folder/'suite-result.json').write_text(json.dumps({'status':'FAIL_POSITIVE_PREREQUISITE','records':records,
         'runtimeNegativeAcceptance':'NOT_CLAIMED','retention':'retain own run; no historical/foreign cleanup'},ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'status':'FAIL_POSITIVE_PREREQUISITE','artifact':str(folder)}));return 1
    all_ok=True
    for case in execution['deferredCases']:
        r=instrumented(folder,'stage-block-'+case,['--case='+case]);records.append(r)
        if r['timeout']:
            return stop_unverified('Deferred-case supervisor timeout; child cleanup unverified')
        owner=last_owner(r)
        ok=r['rc']!=0 and not r['timeout'] and r['sideEffectFree'] and owner is not None and owner.get('status')=='BLOCKED_STAGE' and owner.get('case')==case
        r['acceptedNegative']=ok;all_ok=all_ok and ok
    malformed=[[],['--case='],['--case=sol-unknown'],['--case=contract-core','--case=contract-core'],
      ['--case=contract-core','extra'],['--url=http://127.0.0.1:18741/'],['http://127.0.0.1:18741/'],
      ['--case= contract-core '],['--case=contract-core','--url=http://127.0.0.1:18741/']]
    for index,extra in enumerate(malformed):
        r=instrumented(folder,'malformed-'+str(index+1),extra);records.append(r)
        if r['timeout']:
            return stop_unverified('Malformed-CLI supervisor timeout; child cleanup unverified')
        r['acceptedNegative']=r['rc']!=0 and not r['timeout'] and r['sideEffectFree'];all_ok=all_ok and r['acceptedNegative']
    for mode,case in [(mode,'contract-core') for mode in CORE_FAULTS]+[('regression-no-evidence','regression-shell')]:
        events=folder/(mode+'.events.jsonl')
        env=dict(os.environ);env.update(SOL_A1_PROBE=mode,SOL_A1_PROBE_EVENTS=str(events))
        argv=['node','--import',Path('C:\\Projects\\Active\\교대근무관리 시스템\\.ai\\reports\\phase3-2c-a1-review-20261002_103904\\runtime-preload-review.mjs').as_uri(),'scripts/ui-checks/access-history.mjs','--case='+case]
        r=run(folder,'fault-'+mode,argv,env);records.append(r)
        rows=events_from(events)
        triggered=any(row['type']=='fault-triggered' for row in rows)
        owner=last_owner(r)
        emitted_pass=any(value.get('status')=='PASS' for value in r['jsonOutput'])
        ok=triggered and r['rc']!=0 and not emitted_pass and not r['timeout']
        candidate_events=[e for e in rows if e['type']=='fault-triggered' and e.get('candidatePath')]
        gate_events=[e for e in rows if e['type']=='spawn' and e.get('gate')]
        if mode in REASONS:
            gate_error=''
            for event in candidate_events:
                error_path=Path(event['candidatePath']).parent/'adjudicator-stderr.log'
                if error_path.is_file():gate_error+=error_path.read_text(encoding='utf-8',errors='replace')
            ok=ok and bool(gate_events) and REASONS[mode] in gate_error
            r['intendedRejectionObserved']=REASONS[mode] in gate_error
        failure_proof=Path(r['stderr']).read_text(encoding='utf-8',errors='replace')
        if owner and owner.get('manifestPath') and Path(owner['manifestPath']).is_file():failure_proof+=Path(owner['manifestPath']).read_text(encoding='utf-8')
        if mode=='final-write-denied':ok=ok and 'SOL_A1_FINAL_WRITE_DENIED' in failure_proof
        if mode=='log-write-denied':ok=ok and 'sol-a1-missing-log-dir' in failure_proof
        if mode=='gate-log-write-denied':ok=ok and 'sol-a1-missing-log-dir' in failure_proof
        if mode=='regression-no-evidence':ok=ok and 'regression-evidence' in failure_proof
        if mode=='server-close-not-observed':ok=ok and 'close-server' in failure_proof and any(e['type']=='actual-child-close' and e.get('server') for e in rows)
        if mode=='server-spawn-error':
            ok=ok and 'ENOENT' in failure_proof
        if mode=='gate-spawn-error':ok=ok and 'ENOENT' in failure_proof and 'adjudicator-start' in failure_proof
        if mode in ['owner-bad-ack','worker-no-ack']:ok=ok and 'core-ack' in failure_proof and not gate_events
        if mode=='worker-no-run':ok=ok and 'core-worker' in failure_proof and not gate_events
        # A missing close observation intentionally retains the exact owned temp.
        # Preserve it for independent Sol verification; do not infer safe deletion.
        created=[row['result'] for row in rows if row['type']=='directory-created' and 'shiftmgmt-gemini-32v-' in row['prefix']]
        r['retainedOwnedTemps']=[temp for temp in created if Path(temp).exists()]
        if mode=='server-close-not-observed':ok=ok and len(r['retainedOwnedTemps'])==1
        r.update(acceptedNegative=ok,faultTriggered=triggered,events=rows)
        all_ok=all_ok and ok
        if r['timeout']:
            print('UNVERIFIED child cleanup after supervisor timeout; retained run, STOP.',file=sys.stderr)
            break
    post=run(folder,'scope-after',locked_scope+['--scope']);records.append(post);all_ok=all_ok and post['rc']==0
    result={'status':'PASS' if all_ok else 'FAIL','acceptance':'RUNTIME_PROBE_SUBSET_ONLY_A1_NOT_A2_B',
      'records':records,'retention':'retain own artifacts and explicitly listed fault temps; no foreign PID/temp/profile touched',
      'additionalRequired':'IPC packet matrix/occupied-port/component cleanup tests and independent Sol review remain mandatory'}
    (folder/'suite-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'artifact':str(folder),'acceptance':result['acceptance']}));return 0 if all_ok else 1

if __name__=='__main__':
    sys.exit(main() or 0)
