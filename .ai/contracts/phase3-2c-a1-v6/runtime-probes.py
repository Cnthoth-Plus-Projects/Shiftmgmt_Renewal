"""Sol's A1 v3 actual-SUT suite. No parser/canary result can count as SUT PASS."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
spec=importlib.util.spec_from_file_location('sol_observer_health',HERE/'observer-selfcheck.py')
HEALTH=importlib.util.module_from_spec(spec);spec.loader.exec_module(HEALTH)
GATE_REASONS={'png-header-only':'Truncated PNG','png-crc':'PNG CRC','duplicate-id':'Duplicate check ID',
    'missing-id':'Missing/unknown/extra check ID','extra-id':'Missing/unknown/extra check ID',
    'caller-expected':'Unexpected check fields','constant-actual':'Actual differs from raw observation',
    'raw-console':'CORE-06 comparison failed','raw-pageerror':'CORE-06 comparison failed',
    'raw-requestfailed':'CORE-06 comparison failed','raw-http':'CORE-06 comparison failed',
    'canonical-drift':'CORE-04 comparison failed','worker-close-receipt':'Observation flag differs from callback ledger',
    'server-close-receipt':'Observation flag differs from callback ledger'}
FAULT_CODES={name:'A1_GATE_REJECTED' for name in GATE_REASONS}
FAULT_CODES.update({'server-close-not-observed':'A1_CLOSE_UNVERIFIED','final-write-denied':'A1_FINAL_WRITE_FAILED',
    'server-spawn-error':'A1_SERVER_SPAWN_FAILURE','log-write-denied':'A1_LOG_WRITE_FAILED',
    'owner-bad-ack':'A1_ACK_INVALID','worker-no-ack':'A1_ACK_TIMEOUT','worker-no-run':'A1_WORKER_FAILED',
    'gate-spawn-error':'A1_GATE_SPAWN_FAILURE','gate-log-write-denied':'A1_LOG_WRITE_FAILED',
    'regression-no-evidence':'A1_WORKER_FAILED', 'worker-close-not-observed':'A1_CLOSE_UNVERIFIED',
    'worker-spawn-error':'A1_WORKER_SPAWN_FAILURE','log-finish-not-observed':'A1_LOG_FINISH_UNVERIFIED',
    'late-log-error':'A1_LOG_WRITE_FAILED'})
for field in ('case','runId','candidateSha256','executionSha256','checks','artifacts','acceptance','status','extra','extra-output'):
    FAULT_CODES['gate-response-'+field]='A1_GATE_RESPONSE_MISMATCH'
FAULT_CODES.update({'gate-response-outer-extra':'A1_GATE_RESPONSE_MISMATCH',
    'log-close-not-observed':'A1_LOG_CLOSE_UNVERIFIED',
    'server-log-close-not-observed':'A1_LOG_CLOSE_UNVERIFIED',
    'gate-log-close-not-observed':'A1_LOG_CLOSE_UNVERIFIED',
    'server-log-finish-not-observed':'A1_LOG_FINISH_UNVERIFIED',
    'gate-log-finish-not-observed':'A1_LOG_FINISH_UNVERIFIED'})
FAULT_CODES.update({'owner-extra-ack':'A1_ACK_INVALID','timestamp-regression':'A1_LIFECYCLE_INVALID'})
FAULT_CODES.update({'server-timestamp-regression':'A1_LIFECYCLE_INVALID','gate-timestamp-regression':'A1_LIFECYCLE_INVALID','worker-ledger-scalar-mismatch':'A1_LIFECYCLE_INVALID','gate-ledger-scalar-mismatch':'A1_LIFECYCLE_INVALID','owner-candidate-write-denied':'A1_CANDIDATE_WRITE_FAILED'})
assert len(FAULT_CODES)==51
spec5=importlib.util.spec_from_file_location('sol_v6_receipts',HERE/'evidence-v6.py')
EXTRA=importlib.util.module_from_spec(spec5);spec5.loader.exec_module(EXTRA)

def dump(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def safe_env():
    env=dict(os.environ)
    for key in list(env):
        if key.startswith(('SHIFT_','SHIFTMGMT_','SOL_A1_')) or key in ('NODE_OPTIONS','NODE_DEBUG'):
            del env[key]
    env['PYTHONIOENCODING']='utf-8'
    return env

def json_lines(text):
    values=[]
    for line in text.splitlines():
        try:
            value=json.loads(line)
            if isinstance(value,dict):values.append(value)
        except json.JSONDecodeError:pass
    return values

def terminal_receipt(record):
    # Exactly one owner terminal record: failures on stderr, deferred on stdout.
    if record['output'] and record['errors']:return None
    text=record['errors'] or record['output']
    if len(text.splitlines())!=1:return None
    try:value=json.loads(text)
    except (ValueError,TypeError):return None
    if not isinstance(value,dict):return None
    if value.get('status')=='FAIL':
        if record['output'] or set(value)!={'status','code','phase','case','runId','error'}:return None
        error=value.get('error')
        if not isinstance(error,dict) or set(error)!={'name','message','stack'}:return None
        if any(not isinstance(error[key],str) or not error[key] for key in error):return None
        if not isinstance(value.get('phase'),str) or not value['phase']:return None
    elif value.get('status')=='BLOCKED_STAGE':
        if record['errors'] or set(value)!={'status','code','case','reason','stageSlice'} or value.get('stageSlice')!='A1' or value.get('reason')!='A2_PENDING':return None
    else:return None
    return value if isinstance(value.get('code'),str) else None

def failure_code(record):
    receipt=terminal_receipt(record)
    return receipt['code'] if receipt else None

def no_pass(record):
    return terminal_receipt(record) is not None

def observed_quiescence(rows):
    spawns=[row for row in rows if row['type']=='spawn']
    closes={row['spawnId']:row for row in rows if row['type']=='actual-child-close'}
    if any(row['spawnId'] not in closes for row in spawns):
        return False,'Actual spawned child close absent'
    finishes={row['streamId']:row for row in rows if row['type']=='actual-log-finish'}
    stream_closes={row['streamId']:row for row in rows if row['type']=='actual-log-close'}
    failed={row['streamId'] for row in rows if row['type']=='actual-log-error'}
    streams=[row for row in rows if row['type']=='log-stream-created']
    for stream in streams:
        ident=stream['streamId']
        if ident not in stream_closes or (ident not in failed and ident not in finishes):
            return False,'Actual log settlement absent, including retained-temp branches'
    for removed in (row for row in rows if row['type']=='owned-temp-remove-start'):
        if any(closes[row['spawnId']]['seq']>=removed['seq'] for row in spawns if row['seq']<removed['seq']):
            return False,'Owned temp removal before actual child close'
        for stream in (row for row in streams if row['seq']<removed['seq']):
            terminal=[stream_closes[stream['streamId']]]
            if stream['streamId'] in finishes:terminal.append(finishes[stream['streamId']])
            terminal += [row for row in rows if row['type']=='actual-log-error' and row['streamId']==stream['streamId']]
            if any(event['seq']>=removed['seq'] for event in terminal):
                return False,'Owned temp removal before actual log settlement'
    return True,None

def observed_artifact_order(rows, require_all=False):
    streams={r['path']:r for r in rows if r['type']=='log-stream-created'}
    close_by_role={('server' if r.get('server') else 'adjudicator' if r.get('gate') else 'worker'):r for r in rows if r['type']=='actual-child-close'}
    reads=[r for r in rows if r['type']=='log-artifact-read']
    required={role+'-'+stream+'.log' for role in ('worker','server','adjudicator') for stream in ('stdout','stderr')}
    if require_all and {Path(r['path']).name for r in reads}!=required:return False,'Required six actual log artifact reads absent'
    for read in reads:
        stream=streams.get(read['path'])
        role=Path(read['path']).name.split('-')[0]
        child=close_by_role.get(role)
        if not stream or not child or child['seq']>=read['seq']:return False,'Log hash read before actual child close'
        for event in ('actual-log-finish','actual-log-close'):
            values=[r for r in rows if r['type']==event and r.get('streamId')==stream['streamId']]
            if len(values)!=1 or values[0]['seq']>=read['seq']:return False,'Log hash read before actual stream settlement'
    return True,None

def observed_publication(rows):
    for name in ('owner-candidate.json','owner-final.json'):
        writes=[r for r in rows if r['type']=='file-write' and Path(r.get('path','')).name==name]
        complete=[r for r in rows if r['type']=='file-rename-complete' and Path(r['path']).name==name]
        if len(writes)!=1 or writes[0].get('operation')!='rename' or len(complete)!=1:return False
        if Path(complete[0]['from'])!=Path(complete[0]['path']+'.tmp'):return False
        stages=[r for r in rows if r['type']=='file-write' and r.get('operation')=='write' and r.get('path')==complete[0]['from']]
        if len(stages)!=1 or not stages[0]['seq']<writes[0]['seq']<complete[0]['seq']:return False
    return True

def core_failure_binding(partial,rows,run_dir=None):
    if partial.get('case')!='contract-core':return True
    acquired={}
    for row in rows:
        if row['type']=='core-evidence-acquired':acquired.setdefault(Path(row['path']).name,(row['path'],row['value']))
    if run_dir is not None:
        for name in ('core-partial.json','core-partial.fallback.json','core-observations.json','worker-final.json'):
            path=run_dir/name
            if path.is_file() and name not in acquired:acquired[name]=(str(path),json.loads(path.read_text(encoding='utf-8')))
    worker_partial=next((acquired[n] for n in ('core-partial.json','core-partial.fallback.json') if n in acquired),None)
    if worker_partial:
        path,value=worker_partial
        return partial.get('workerPartialPath')==path and all(partial.get(k)==value.get(k) for k in ('raw','checks','acquisition')) and value.get('raw') is not None and value.get('acquisition') is not None
    if 'worker-final.json' in acquired or 'core-observations.json' in acquired:
        if not {'worker-final.json','core-observations.json'}<=set(acquired):return False
        raw=acquired['core-observations.json'][1];worker=acquired['worker-final.json'][1]
        return partial.get('raw')==raw and partial.get('checks')==worker.get('checks') and partial.get('acquisition')==worker.get('acquisition') and raw is not None and worker.get('acquisition') is not None and partial.get('workerPartialPath') is None
    return partial.get('raw') is None and partial.get('checks')==[] and partial.get('acquisition') is None and partial.get('workerPartialPath') is None

def observation_self_test():
    rows=[]
    def add(kind,**data):rows.append({'type':kind,'seq':len(rows)+1,**data})
    for actor,role in enumerate(('server','worker','adjudicator'),1):
        add('actual-child-close',server=role=='server',gate=role=='adjudicator')
        for stream in ('stdout','stderr'):
            ident=str(actor)+stream;file='run/'+role+'-'+stream+'.log'
            add('log-stream-created',streamId=ident,path=file)
            add('actual-log-finish',streamId=ident);add('actual-log-close',streamId=ident)
            add('log-artifact-read',path=file)
    for name in ('owner-candidate.json','owner-final.json'):
        file='run/'+name;add('file-write',path=file+'.tmp',operation='write')
        add('file-write',path=file,operation='rename',**{'from':file+'.tmp'})
        add('file-rename-complete',path=file,**{'from':file+'.tmp'})
    assert observed_artifact_order(rows,True)[0] and observed_publication(rows)
    rejected=[]
    for label,bad in [
        ('no-reads',[r for r in rows if r['type']!='log-artifact-read']),
        ('missing-stderr-read',[r for r in rows if not (r['type']=='log-artifact-read' and r['path']=='run/worker-stderr.log')]),
        ('missing-child-close',[r for r in rows if not (r['type']=='actual-child-close' and r['server'])]),
        ('missing-log-close',[r for r in rows if r['type']!='actual-log-close']),
        ('early-read',[{**r,'seq':0} if r['type']=='log-artifact-read' else r for r in rows])]:
        assert not observed_artifact_order(bad,True)[0];rejected.append(label)
    for label,bad in [
        ('direct-candidate-write',[{**r,'operation':'write'} if r['type']=='file-write' and r.get('path')=='run/owner-candidate.json' else r for r in rows]),
        ('missing-rename-completion',[r for r in rows if r['type']!='file-rename-complete']),
        ('early-rename',[{**r,'seq':0} if r['type']=='file-write' and r.get('operation')=='rename' else r for r in rows]),
        ('wrong-stage',[{**r,'from':'other.tmp'} if r['type']=='file-rename-complete' else r for r in rows])]:
        assert not observed_publication(bad);rejected.append(label)
    raw={'captured':'actual'};checks=[{'id':'CORE-01'}];acq={'fixtureRows':[],'fixtureRequests':[],'routeInstalled':True}
    owner={'case':'contract-core','raw':raw,'checks':checks,'acquisition':acq,'workerPartialPath':None}
    evidence=[{'type':'core-evidence-acquired','path':'run/core-observations.json','value':raw},{'type':'core-evidence-acquired','path':'run/worker-final.json','value':{'checks':checks,'acquisition':acq}}]
    assert core_failure_binding(owner,evidence)
    for key,value in [('raw',None),('checks',[]),('acquisition',None)]:
        assert not core_failure_binding({**owner,key:value},evidence);rejected.append('lost-'+key)
    part={**owner,'workerPartialPath':'run/core-partial.json'}
    partial_rows=[{'type':'core-evidence-acquired','path':'run/core-partial.json','value':part}]
    assert core_failure_binding(part,partial_rows)
    assert not core_failure_binding({**part,'workerPartialPath':None},partial_rows);rejected.append('lost-partial-path')
    return {'proof':'PARSER_ONLY_NOT_SUT_EXECUTION','orderingPublicationPositive':1,'coreBindingPositives':2,'rejectedCount':len(rejected),'rejected':rejected}

def run(folder,name,argv,mode=None,limit=310):
    env=safe_env();event=folder/(name+'.events.jsonl');session=uuid.uuid4().hex
    if mode:
        env.update(SOL_A1_PROBE=mode,SOL_A1_PROBE_EVENTS=str(event),SOL_A1_PROBE_SESSION=session)
        argv=[argv[0],'--import',(HERE/'runtime-preload.mjs').as_uri(),*argv[1:]]
    stdout,stderr=folder/(name+'.stdout.txt'),folder/(name+'.stderr.txt')
    start=datetime.now(timezone.utc).isoformat()
    with stdout.open('wb') as out,stderr.open('wb') as err:
        child=subprocess.Popen(argv,cwd=REPO,env=env,stdout=out,stderr=err)
        timed_out=False
        try:rc=child.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            timed_out=True;child.kill();rc=child.wait(timeout=10)
    record={'name':name,'argv':argv,'cwd':str(REPO),'pid':child.pid,'session':session,'mode':mode,
        'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed_out,
        'stdout':str(stdout),'stderr':str(stderr),'output':stdout.read_text(encoding='utf-8',errors='replace'),
        'errors':stderr.read_text(encoding='utf-8',errors='replace')}
    rows=[]
    if mode:
        try:
            rows=HEALTH.observer_health(event.read_text(encoding='utf-8'),child.pid,mode,session,rc)
            record.update(observerHealthy=True,eventCount=len(rows),sideEffectFree=not any(row['type'] in HEALTH.FORBIDDEN for row in rows))
        except (ValueError,KeyError,OSError) as error:
            record.update(observerHealthy=False,observerError=str(error),sideEffectFree=False)
    record['failureCode']=failure_code(record)
    if rows:record['quiescenceObserved'],record['quiescenceError']=observed_quiescence(rows)
    record['eventsPath']=str(event) if mode else None
    record['faultTriggered']=any(row['type']=='fault-triggered' for row in rows)
    dump(folder/(name+'.command.json'),record)
    print(json.dumps({'name':name,'rc':rc,'timeout':timed_out,'observerHealthy':record.get('observerHealthy'),'failureCode':record['failureCode']}),flush=True)
    return record,rows

def strict_preflight(record,code,case=None):
    receipt=terminal_receipt(record)
    return record.get('observerHealthy') is True and record.get('sideEffectFree') is True and record['rc']==1 and not record['timeout'] and bool(receipt) and receipt['code']==code and receipt.get('case')==case and (code=='A1_DEFERRED' or (receipt.get('phase')=='preflight' and receipt.get('runId') is None))

def rich_failure(partial, record, rows, mode):
    required={'owner','server','worker','adjudicator','raw','checks','workerPartialPath','errors','cleanup','acquisition'}
    if not isinstance(partial,dict) or not required<=set(partial):return False
    owner=partial['owner']
    if not isinstance(owner,dict) or owner.get('pid')!=record['pid'] or not isinstance(owner.get('context'),dict):return False
    if not isinstance(partial['checks'],list) or partial['raw'] is not None and not isinstance(partial['raw'],dict):return False
    fields={'pid','exitCode','exitSeen','closeSeen','aliveAfterClose','createdAtMs','exitAtMs','closeAtMs',
            'logsSettled','logFinishAtMs','logFinishSeen','logCloseSeen','logCloseAtMs'}
    for name in ('server','worker','adjudicator'):
        value=partial[name]
        spawns=[r for r in rows if r['type']=='spawn' and (r['server'] if name=='server' else r['gate'] if name=='adjudicator' else not r['server'] and not r['gate'])]
        if not spawns:
            if value is not None:return False
            continue
        if not isinstance(value,dict) or not fields<=set(value):return False
        if value['pid']!=spawns[-1]['childPid']:return False
        try:EXTRA.process_receipt(value,success=False)
        except (ValueError,KeyError,TypeError):return False
        for prefix in ('logFinish','logClose'):
            seen=value[prefix+'Seen'];times=value[prefix+'AtMs']
            if not isinstance(seen,dict) or set(seen)!={'stdout','stderr'} or not isinstance(times,dict) or set(times)!={'stdout','stderr'}:return False
            for stream in ('stdout','stderr'):
                if type(seen[stream]) is not bool:return False
                if seen[stream] and (type(times[stream]) not in (int,float) or not __import__('math').isfinite(times[stream]) or times[stream]<=0):return False
                if not seen[stream] and times[stream] is not None:return False
    hidden={'log-close-not-observed':('worker','logClose'),'server-log-close-not-observed':('server','logClose'),
            'gate-log-close-not-observed':('adjudicator','logClose'),'log-finish-not-observed':('worker','logFinish'),
            'server-log-finish-not-observed':('server','logFinish'),'gate-log-finish-not-observed':('adjudicator','logFinish')}
    if mode in hidden:
        name,prefix=hidden[mode]
        if partial[name][prefix+'Seen']['stdout'] is not False or partial[name][prefix+'AtMs']['stdout'] is not None:return False
    if mode in ('worker-close-not-observed','server-close-not-observed'):
        value=partial['worker' if mode.startswith('worker') else 'server']
        if value['closeSeen'] is not False or value['closeAtMs'] is not None:return False
    if partial['raw'] is not None and partial.get('case')=='contract-core':
        try:
            EXTRA.acquired_checks(partial['raw'],partial['checks'])
            EXTRA.acquisition_checks(partial['raw'],partial['acquisition'])
        except (ValueError,KeyError,TypeError):return False
    if mode=='owner-extra-ack':
        ack=partial['worker'].get('ackReceipt')
        if not isinstance(ack,dict) or not isinstance(ack.get('packet'),dict) or ack['packet'].get('unapproved') is not True:return False
    if mode in ('timestamp-regression','server-timestamp-regression','gate-timestamp-regression'):
        delivered=[r['value'] for r in rows if r['type']=='clock-value-delivered-to-sut']
        name='server' if mode.startswith('server-') else 'adjudicator' if mode.startswith('gate-') else 'worker'
        if len(delivered)!=1 or partial[name]['logFinishAtMs']['stdout']!=delivered[0]:return False
        if name!='adjudicator' and partial['cleanup'].get('tempRemoved') is not False:return False
    if mode=='worker-ledger-scalar-mismatch':
        if partial['cleanup'].get('tempRemoved') is not False or any(r.get('gate') for r in rows if r['type']=='spawn'):return False
    if mode in ('server-spawn-error','worker-spawn-error','gate-spawn-error'):
        name='server' if mode.startswith('server-') else 'worker' if mode.startswith('worker-') else 'adjudicator'
        actual=[e['error'] for e in partial[name]['callbackEvents'] if e['event']=='error']
        if len(actual)!=1 or partial['errors'].get('primary',{}).get('stack')!=actual[0]['stack']:return False
    return True

def parser_self_test():
    receipt={'status':'FAIL','code':'A1_CLI_INVALID','phase':'preflight','case':None,'runId':None,'error':{'name':'Error','message':'CLI rejected','stack':'actual CLI error stack'}}
    good={'observerHealthy':True,'sideEffectFree':True,'rc':1,'timeout':False,'output':'','errors':json.dumps(receipt)+'\n','failureCode':'A1_CLI_INVALID'}
    assert strict_preflight(good,'A1_CLI_INVALID')
    rejected=[]
    for key,value in [('observerHealthy',False),('sideEffectFree',False),('rc',0),('timeout',True),('errors',''),('errors',json.dumps({**receipt,'code':'A1_LOCK_MISMATCH'})),('output','{"status":"PASS"}\n'),('errors',good['errors']+good['errors']),('errors',good['errors']+'unrelated fatal crash\n'),('output','PASS')]:
        assert not strict_preflight({**good,key:value},'A1_CLI_INVALID');rejected.append([key,value])
    assert observed_quiescence([{'type':'spawn','spawnId':1,'seq':1},{'type':'owned-temp-remove-start','seq':2},{'type':'actual-child-close','spawnId':1,'seq':3}])[0] is False
    assert observed_quiescence([{'type':'log-stream-created','streamId':1,'seq':1}])[0] is False
    process={'pid':202,'exitCode':0,'exitSeen':True,'closeSeen':True,'aliveAfterClose':False,'createdAtMs':1,'exitAtMs':2,'closeAtMs':3,
            'logsSettled':{'stdout':True,'stderr':True},'logFinishSeen':{'stdout':True,'stderr':True},'logCloseSeen':{'stdout':True,'stderr':True},
            'logFinishAtMs':{'stdout':4,'stderr':4},'logCloseAtMs':{'stdout':5,'stderr':5}}
    process.update(EXTRA.sample_process())
    partial={'owner':{'pid':101,'context':{}},'server':process,'worker':None,'adjudicator':None,'raw':None,'checks':[],'workerPartialPath':None,'errors':{},'cleanup':{},'acquisition':None}
    row={'type':'spawn','server':True,'gate':False,'childPid':202}
    assert rich_failure(partial,{'pid':101},[row],'ordinary-failure')
    rich_rejected=[]
    for key in process:
        bad=__import__('copy').deepcopy(partial);del bad['server'][key]
        assert not rich_failure(bad,{'pid':101},[row],'ordinary-failure');rich_rejected.append('missing-'+key)
    for key in ('logFinish','logClose'):
        bad=__import__('copy').deepcopy(partial);bad['server'][key+'Seen']['stdout']=False
        assert not rich_failure(bad,{'pid':101},[row],'ordinary-failure');rich_rejected.append('fabricated-'+key+'-time')
    print(json.dumps({'proof':'PARSER_ONLY_NOT_SUT_EXECUTION','validPreflight':1,'rejectedPreflightMutations':rejected,'earlyRemovalRejected':True,'unsettledRetainedLogRejected':True,'richFailurePositive':1,'richFailureRejected':rich_rejected,'observationRules':observation_self_test()}))

def validate_health_receipt(health_root):
    assert health_root.parent==Path(__import__('tempfile').gettempdir()).resolve() and health_root.name.startswith('shiftmgmt-sol-a1v6-selfcheck-')
    health_receipt=json.loads((health_root/'selfcheck-result.json').read_text(encoding='utf-8'))
    assert health_receipt.get('bootstrapMode') is False
    assert health_receipt['proof']=='CONTROL_CANARIES_AND_CURRENT_SUT_PREFLIGHT_ONLY_NOT_A1_ACCEPTANCE'
    assert health_receipt['status']=='PASS' and health_receipt['actualControlChecks']==45 and len(health_receipt['records'])==45 and all(item['acceptedControlCheck'] is True for item in health_receipt['records'])
    assert set(health_receipt['corruptedObservationVectorsRejected'])=={'empty','truncated-newline','missing-start','missing-exit','corrupt-seq','corrupt-session','corrupt-pid','corrupt-eventSha256','corrupt-previousEventSha'}
    assert set(health_receipt['controlFiles'])=={'observer-selfcheck.py','observer-canary.mjs','runtime-preload.mjs'}
    for name,expected in health_receipt['controlFiles'].items():assert hashlib.sha256((HERE/name).read_bytes()).hexdigest().upper()==expected
    for item in health_receipt['records']:
        if item['observerHealthy']:
            event=health_root/(item['name']+'.events.jsonl')
            assert event==Path(item['events']).resolve()
            HEALTH.observer_health(event.read_text(encoding='utf-8'),item['pid'],item['mode'],item['session'],item['rc'])
    return health_receipt

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--execution-sha',required=True);parser.add_argument('--baseline-sha',required=True)
    parser.add_argument('--list',action='store_true');parser.add_argument('--self-test',action='store_true');args=parser.parse_args()
    execution=json.loads((HERE/'execution.json').read_text(encoding='utf-8'))
    assert hashlib.sha256((HERE/'execution.json').read_bytes()).hexdigest().upper()==args.execution_sha
    if args.list:
        print(json.dumps({'proof':'PLAN_ONLY_NOT_RUN','positiveCases':execution['enabledCases'],'deferredCases':execution['deferredCases'],
            'faults':FAULT_CODES,'malformedPublicCases':9,'observerHealthMandatory':True}));return 0
    if args.self_test:parser_self_test();return 0
    folder=Path(__import__('tempfile').mkdtemp(prefix='shiftmgmt-sol-a1v6-runtime-'));records=[]
    gate=[sys.executable,'-B',str(HERE/'gate-evidence.py'),'--execution-sha',args.execution_sha,'--baseline-sha',args.baseline_sha]
    def stop(reason):
        dump(folder/'suite-result.json',{'status':'UNVERIFIED_STOP','reason':reason,'records':records,'runtimeAcceptance':False,'retention':'Retain exact own run; no foreign PID/path cleanup'})
        print(json.dumps({'status':'UNVERIFIED_STOP','artifact':str(folder),'reason':reason}));return 1
    pre,_=run(folder,'scope-before',gate+['--scope']);records.append(pre)
    if pre['rc']!=0:return stop('Scope preflight failed before starting SUT')
    health_run,_=run(folder,'fresh-observer-selfcheck',[sys.executable,'-B',str(HERE/'observer-selfcheck.py')],limit=180);records.append(health_run)
    if health_run['rc']!=0 or health_run['timeout']:return stop('Fresh actual observer selfcheck failed')
    try:
        health_output=json.loads(health_run['output'].splitlines()[-1])
        health_root=Path(health_output['artifact']).resolve()
        validate_health_receipt(health_root)
    except (AssertionError,ValueError,KeyError,OSError) as error:return stop('Fresh control health receipt invalid: '+str(error))
    for case in execution['enabledCases']:
        r,_=run(folder,'positive-'+case,['node','scripts/ui-checks/access-history.mjs','--case='+case]);records.append(r)
        output=json_lines(r['output'])
        if r['timeout'] or r['rc']!=0 or len(r['output'].splitlines())!=1 or len(output)!=1 or output[0].get('status')!='PASS' or output[0].get('case')!=case:
            return stop('Positive prerequisite failed; no runtime-negative acceptance')
        final,_=run(folder,'positive-final-'+case,gate+['--final',output[0]['manifestPath']]);records.append(final)
        if final['rc']!=0:return stop('Positive independent final gate failed')
    for case in execution['enabledCases']:
        r,rows=run(folder,'observed-positive-'+case,['node','scripts/ui-checks/access-history.mjs','--case='+case],'observe-positive');records.append(r)
        output=json_lines(r['output'])
        if r['timeout'] or r['rc']!=0 or not r.get('observerHealthy') or not r.get('quiescenceObserved') or not observed_artifact_order(rows,require_all=True)[0] or not observed_publication(rows) or len(r['output'].splitlines())!=1 or len(output)!=1 or output[0].get('status')!='PASS' or output[0].get('case')!=case:
            return stop('Observed positive actual child/log settlement failed')
        owned=[row['result'] for row in rows if row['type']=='directory-created' and 'shiftmgmt-gemini-32v-' in str(row.get('prefix',''))]
        removed=[row['path'] for row in rows if row['type']=='owned-temp-remove-complete']
        if len(owned)!=1 or removed!=owned or any(Path(value).exists() for value in owned):return stop('Positive own-temp removal not observed')
        final,_=run(folder,'observed-positive-final-'+case,gate+['--final',output[0]['manifestPath']]);records.append(final)
        if final['rc']!=0:return stop('Observed positive independent final failed')
    good=True
    for case in execution['deferredCases']:
        r,_=run(folder,'stage-'+case,['node','scripts/ui-checks/access-history.mjs','--case='+case],'preflight',12);records.append(r)
        values=json_lines(r['output']);r['acceptedNegative']=strict_preflight(r,'A1_DEFERRED',case) and len(values)==1 and values[0].get('status')=='BLOCKED_STAGE';good=good and r['acceptedNegative']
        if not r.get('observerHealthy') or r['timeout']:return stop('Deferred observation unhealthy/timeout')
    malformed=[[],['--case='],['--case=sol-unknown'],['--case=contract-core','--case=contract-core'],['--case=contract-core','extra'],['--url=http://127.0.0.1:18741/'],['http://127.0.0.1:18741/'],['--case= contract-core '],['--case=contract-core','--url=http://127.0.0.1:18741/']]
    for number,tail in enumerate(malformed,1):
        r,_=run(folder,'malformed-'+str(number),['node','scripts/ui-checks/access-history.mjs',*tail],'preflight',12);records.append(r)
        r['acceptedNegative']=strict_preflight(r,'A1_CLI_INVALID');good=good and r['acceptedNegative']
        if not r.get('observerHealthy') or r['timeout']:return stop('CLI observation unhealthy/timeout')
    for mode,code in FAULT_CODES.items():
        case='regression-shell' if mode=='regression-no-evidence' else 'contract-core'
        r,rows=run(folder,'fault-'+mode,['node','scripts/ui-checks/access-history.mjs','--case='+case],mode);records.append(r)
        if not r.get('observerHealthy') or r['timeout']:return stop('Fault observer unhealthy/timeout: '+mode)
        receipt=terminal_receipt(r) or {}
        ok=r['rc']==1 and no_pass(r) and r['failureCode']==code and receipt.get('case')==case and isinstance(receipt.get('runId'),str) and bool(receipt['runId']) and r['faultTriggered'] and r['quiescenceObserved']
        expected_parent=(REPO/'artifacts/captures/phase3'/('access-history-'+case)).resolve()
        run_roots=[Path(row['result']).resolve() for row in rows if row['type']=='directory-created' and Path(row['result']).resolve().parent==expected_parent]
        if len(run_roots)!=1 or run_roots[0].name!=receipt.get('runId',''):ok=False
        else:
            try:
                partial=json.loads((run_roots[0]/'owner-failure.json').read_text(encoding='utf-8'))
                ok=ok and partial['status']=='FAIL' and partial['case']==case and partial['runId']==receipt['runId'] and partial['errors']['primary']['code']==code and partial['errors']['primary']['stack']==receipt['error']['stack']
                ok=ok and rich_failure(partial,r,rows,mode) and core_failure_binding(partial,rows,run_roots[0]) and Path(partial['owner']['context']['runDir']).resolve()==run_roots[0]
            except (KeyError,OSError,ValueError):ok=False
        if mode in GATE_REASONS:
            candidates=[row['candidatePath'] for row in rows if row['type']=='fault-triggered' and row.get('candidatePath')]
            errors=''.join((Path(p).parent/'adjudicator-stderr.log').read_text(encoding='utf-8') for p in candidates if (Path(p).parent/'adjudicator-stderr.log').is_file())
            ok=ok and GATE_REASONS[mode] in errors
        if mode.startswith('gate-response-'):ok=ok and any(row['type']=='actual-gate-response' for row in rows)
        for marker_mode,marker in [('final-write-denied','SOL_A1_FINAL_WRITE_DENIED'),('late-log-error','SOL_A1_LATE_LOG_ERROR')]:
            if mode==marker_mode:ok=ok and marker in r['errors']
        owned=[row['result'] for row in rows if row['type']=='directory-created' and 'shiftmgmt-gemini-32v-' in str(row.get('prefix',''))]
        r['retainedOwnedTemps']=[value for value in owned if Path(value).exists()]
        if mode in ('server-close-not-observed','worker-close-not-observed','log-finish-not-observed','log-close-not-observed','server-log-close-not-observed','server-log-finish-not-observed'):ok=ok and len(r['retainedOwnedTemps'])==1
        if any(x.get('gate') for x in rows if x['type']=='spawn') and not observed_artifact_order(rows)[0]:ok=False
        if mode=='owner-candidate-write-denied':ok=ok and 'SOL_A1_CANDIDATE_WRITE_DENIED' in r['errors']
        r['acceptedNegative']=ok;good=good and ok
        dump(folder/(r['name']+'.command.json'),r)
        if not r['quiescenceObserved']:return stop('Actual cleanup ordering/close proof failed: '+mode)
    for mode in ('lock-protected-read','lock-frozen-read','lock-control-read'):
        r,rows=run(folder,mode,['node','scripts/ui-checks/access-history.mjs','--case=contract-core'],mode,15);records.append(r)
        r['acceptedNegative']=strict_preflight(r,'A1_LOCK_MISMATCH','contract-core') and r['faultTriggered']
        good=good and r['acceptedNegative']
        if not r.get('observerHealthy') or r['timeout']:return stop('Lock observation unhealthy: '+mode)
    post,_=run(folder,'scope-after',gate+['--scope']);records.append(post);good=good and post['rc']==0
    result={'status':'PASS' if good else 'FAIL','acceptance':'A1_RUNTIME_SUBSET_ONLY_NOT_A2_B','records':records,
        'requiredFaultCount':51,'remaining':'IPC/component/source/actual-measurement independent review remains mandatory',
        'retention':'Retain own external run, current SUT artifacts and explicitly listed fault temps; no historical/foreign cleanup'}
    dump(folder/'suite-result.json',result);print(json.dumps({'status':result['status'],'artifact':str(folder),'faults':51,'acceptance':result['acceptance']}));return 0 if good else 1

if __name__=='__main__':
    sys.exit(main())
