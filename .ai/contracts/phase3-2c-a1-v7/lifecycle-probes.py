"""Sol v7 controlled late callback probes; control canaries are not SUT acceptance."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, copy, hashlib, importlib.util, json, os, subprocess, sys, tempfile, uuid
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
MODES=['late-worker-child-before-remove','late-server-child-before-remove','late-worker-log-before-remove','late-server-log-before-remove','late-worker-child-gate','late-server-child-gate','late-worker-log-gate','late-server-log-gate','late-worker-child-final','late-server-child-final','late-gate-child-final','late-server-log-final','late-gate-log-final','late-server-child-double','late-server-child-gate-mismatch']
def module(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
R=module('sol_v7_runtime_lifecycle',HERE/'runtime-probes.py')
E=module('sol_v7_receipts_lifecycle',HERE/'evidence-v7.py')
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def require(ok,message):
    if not ok:raise ValueError(message)
def vectors():
    good={**E.sample_process(),'aliveAfterClose':False,'logsSettled':{'stdout':True,'stderr':True}}
    result=[{'name':'valid','record':good,'expectedReject':False}]
    bad=copy.deepcopy(good);bad['pid']=202.5
    for event in bad['callbackEvents']:
        if event['pid'] is not None:event['pid']=202.5
    result.append({'name':'noninteger-pid','record':bad,'expectedReject':True})
    for key in ('logFinishSeen','logCloseSeen','logFinishAtMs','logCloseAtMs'):
        bad=copy.deepcopy(good);bad[key]['unapproved']=bad[key]['stdout'];result.append({'name':'extra-'+key,'record':bad,'expectedReject':True})
    for v in result:
        try:E.process_receipt(v['record'],True);accepted=True
        except (ValueError,TypeError,KeyError):accepted=False
        require(accepted is not v['expectedReject'],'Fixed helper parity vector disagrees')
    return result
def guard(folder,expect_v6=False):
    input_path=folder/'guard-input.json';dump(input_path,vectors())
    code="""import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {createRequire} from 'node:module';
const ts=createRequire(path.resolve('package.json'))('typescript');
const p=process.argv[1],s=fs.readFileSync('scripts/ui-checks/access-history.mjs','utf8');
const tree=ts.createSourceFile('owner.mjs',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='validateProcessReceipt');
const helper=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)==='isObj'));
if(!node||!helper)throw Error('Self-contained guard/isObj declaration absent');
const context=vm.createContext({});vm.runInContext(helper.getText(tree)+'\\n'+node.getText(tree)+'\\nthis.guard=validateProcessReceipt;',context);
const results=JSON.parse(fs.readFileSync(p,'utf8')).map(v=>{try{context.guard(v.record);return {name:v.name,expectedReject:v.expectedReject,accepted:true};}catch(e){return {name:v.name,expectedReject:v.expectedReject,accepted:false,message:e.message};}});
console.log(JSON.stringify({results}));"""
    # Guard extraction deliberately excludes the owner's executable top level.
    argv=['node','--input-type=module','-e',code,str(input_path)]
    record,_=run(folder,'actual-pure-guard',argv,None,False)
    require(record['rc']==0 and not record['timeout'],'Actual pure guard command failed')
    result=json.loads(record['output']);require(len(result['results'])==6,'Guard vectors missing')
    for row in result['results']:
        require(row['accepted'] is (True if expect_v6 else not row['expectedReject']),'Actual guard parity mismatch: '+row['name'])
    result.update(proof='EXACT_V6_PURE_GUARD_GAPS_REDETECTED_NOT_V7_ACCEPTANCE' if expect_v6 else 'ACTUAL_PURE_GUARD_ONLY_NOT_A1_ACCEPTANCE',invalidAccepted=5 if expect_v6 else 0,invalidRejected=0 if expect_v6 else 5)
    dump(folder/'guard-result.json',result);return result
def run(folder,name,argv,mode=None,canary=False):
    env=R.safe_env();session=uuid.uuid4().hex;events=folder/(name+'.events.jsonl')
    if mode:
        env.update(SOL_A1_PROBE=mode,SOL_A1_PROBE_EVENTS=str(events),SOL_A1_PROBE_SESSION=session)
        if canary:env['SOL_A1_CANARY_GATE']=session
        argv=[argv[0],'--import',(HERE/'lifecycle-preload.mjs').as_uri(),*argv[1:]]
    out=folder/(name+'.stdout.txt');err=folder/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
    with out.open('xb') as stdout,err.open('xb') as stderr:
        child=subprocess.Popen([str(v) for v in argv],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
        try:rc=child.wait(timeout=130);timed=False
        except subprocess.TimeoutExpired:timed=True;child.kill();rc=child.wait(timeout=10)
    record={'name':name,'argv':[str(v) for v in argv],'cwd':str(REPO),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed,'session':session,'mode':mode,'stdout':str(out),'stderr':str(err),'output':out.read_text(encoding='utf-8',errors='replace'),'errors':err.read_text(encoding='utf-8',errors='replace'),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes()),'eventsPath':str(events) if mode else None,'observerHealthy':None}
    rows=[]
    if mode:
        try:rows=R.HEALTH.observer_health(events.read_text(encoding='utf-8'),child.pid,mode,session,rc);record['observerHealthy']=True
        except (ValueError,KeyError,OSError) as error:record.update(observerHealthy=False,observerError=str(error))
    dump(folder/(name+'.command.json'),record)
    print(json.dumps({'name':name,'rc':rc,'observerHealthy':record['observerHealthy'],'timeout':timed}),flush=True)
    return record,rows
def physical(rows):
    spawns=[r for r in rows if r['type']=='spawn']
    closes={r['spawnId']:r for r in rows if r['type']=='actual-child-close'}
    streams=[r for r in rows if r['type']=='log-stream-created']
    finish={r['streamId']:r for r in rows if r['type']=='actual-log-finish'}
    logclose={r['streamId']:r for r in rows if r['type']=='actual-log-close'}
    require(all(s['spawnId'] in closes for s in spawns),'Actual spawned child close missing')
    require(all(s['streamId'] in finish and s['streamId'] in logclose for s in streams),'Actual spawned log finish/close missing')
    for removed in [r for r in rows if r['type']=='owned-temp-remove-start']:
        require(all(closes[s['spawnId']]['seq']<removed['seq'] for s in spawns if s['seq']<removed['seq']),'Removal preceded child close')
        require(all(finish[s['streamId']]['seq']<removed['seq'] and logclose[s['streamId']]['seq']<removed['seq'] for s in streams if s['seq']<removed['seq']),'Removal preceded physical stream settlement')
    return spawns
def current_error_bindings(failure,deliveries):
    require(failure['status']=='FAIL','Late error may not publish successful manifest')
    for delivery in deliveries:
        target=failure[{'server':'server','worker':'worker','gate':'adjudicator'}[delivery['role']]]
        require(target is not None and target['pid']==delivery['targetPid'],'Wrong failed process identity')
        errors=[e for e in target['callbackEvents'] if e['event']==('error' if delivery['kind']=='child' else 'log-error') and e['error'] and e['error']['message']==delivery['message']]
        require(len(errors)==1 and all(errors[0]['error'][k]==delivery[k] for k in ('name','message','stack')),'Failure snapshot omits original late callback')
    first=deliveries[0];primary=failure['errors']['primary']
    require(all(primary[k]==first[k] for k in ('name','message','stack')),'Primary stack differs from first actual delivery')
    for delivery in deliveries[1:]:
        require(any(all(e.get(k)==delivery[k] for k in ('name','message','stack')) for e in failure['errors']['unexpected']),'Subsequent original error absent from unexpected ledger')
    return True
def evaluate(record,rows,failure,mode,core_required=True,run_dir=None):
    require(record['rc']==1 and not record['timeout'] and record['observerHealthy'] is True,'Expected observed RC1')
    require('PASS' not in record['output'] and failure['status']=='FAIL','Successful publication with late error')
    deliveries=[r for r in rows if r['type']=='lifecycle-error-delivery']
    expected_count=2 if mode=='late-server-child-double' else 1
    require(len(deliveries)==expected_count,'Actual delivery count differs')
    require(mode in MODES,'Unknown closed lifecycle mode')
    role,kind=mode.split('-')[1:3]
    stage='BEFORE_REMOVE' if mode.endswith('before-remove') else 'FINAL_STAGE' if mode.endswith('final') else 'GATE_RESPONSE' if mode.endswith('gate-mismatch') else 'GATE_SPAWN'
    require(all(r['role']==role and r['kind']==kind and r['stage']==stage for r in deliveries),'Delivered actor/kind/stage differs from closed mode')
    require(sum(r['type']=='lifecycle-instrumentation-loaded' for r in rows)==1,'Lifecycle instrumentation absent')
    observed=[r for r in rows if r['type']=='lifecycle-error-observed']
    caches=[r for r in rows if r['type']=='lifecycle-success-cache-copy']
    for delivery in deliveries:
        require(sum(r.get('message')==delivery['message'] and all(r.get(k)==delivery[k] for k in ('role','kind','name','stack')) for r in observed)==1,'Delivery not observed as original callback')
        matches=[r for r in caches if r['role']==delivery['role'] and r['seq']<delivery['seq']]
        require(len(matches)==1 and len(matches[0]['record']['callbackEvents'])==7,'Fault not after exactly one success cache')
    current_error_bindings(failure,deliveries)
    first=deliveries[0]
    require(failure.get('workerPartialPath') is None,'Successful core may not claim worker partial')
    for label in ('server','worker','adjudicator'):
        if failure.get(label):E.process_receipt(failure[label],False)
    if core_required:
        require(failure['raw'] is not None and len(failure['checks'])==9 and failure['acquisition'] is not None,'Acquired core proof missing')
        require(R.core_failure_binding(failure,rows),'Late failure loses first acquired core state')
    spawns=physical(rows);removes=[r for r in rows if r['type']=='owned-temp-remove-complete']
    before=mode.endswith('before-remove')
    require(failure['cleanup']['tempRemoved'] is (not before),'Actual cleanup state differs')
    require(len(removes)==(0 if before else 1),'Removal observations differ')
    temp_root=Path(tempfile.gettempdir()).resolve()
    temps=[Path(r['result']) for r in rows if r['type']=='directory-created' and Path(r['result']).parent==temp_root and Path(r['result']).name.startswith('shiftmgmt-gemini-32v-')]
    require(len(temps)==1 and temps[0].exists() is before,'Observed exact owned temporary directory preservation differs')
    require(sum(bool(s['gate']) for s in spawns)==(0 if before else 1),'Gate spawn boundary differs')
    if before:
        require(failure.get('adjudicator') is None,'Pre-removal failure must not create a gate receipt')
        require(not any(r['type']=='file-rename-complete' and Path(r['path']).name=='owner-candidate.json' for r in rows),'Pre-removal candidate publication')
    if not before:
        require(removes[0]['seq']<first['seq'],'Expected post-removal callback stage')
        candidate=[r for r in rows if r['type']=='file-rename-complete' and Path(r['path']).name=='owner-candidate.json']
        require(len(candidate)==1,'Published candidate observation absent')
        candidate_path=Path(candidate[0]['path'])
        require(candidate_path.is_file() and (run_dir is None or candidate_path.parent==run_dir),'Preserved own candidate file absent')
        staged=[r for r in rows if r['type']=='file-write' and r.get('operation')=='write' and r.get('path')==str(candidate_path)+'.tmp']
        require(len(staged)==1 and removes[0]['seq']<staged[0]['seq']<candidate[0]['seq']<first['seq'],'Candidate staging/publication order differs')
        gate=next(s for s in spawns if s['gate'])
        require(candidate[0]['seq']<gate['seq']<first['seq'],'Gate preceded candidate publication')
    if stage=='FINAL_STAGE':
        staged=[r for r in rows if r['type']=='file-write' and r.get('operation')=='write' and Path(r['path']).name=='owner-final.json.tmp']
        require(len(staged)==1 and staged[0]['seq']<first['seq'],'Final temporary write stage not observed before delivery')
        tmp=Path(staged[0]['path'])
        require(tmp.is_file() and tmp.stat().st_size>0 and (run_dir is None or tmp.parent==run_dir),'Completed own final temporary file absent')
    if mode=='late-server-child-gate-mismatch':
        require(sum(r['type']=='lifecycle-actual-gate-response' for r in rows)==1 and sum(r['type']=='lifecycle-gate-response-mismatch' for r in rows)==1,'Compound fault did not observe and mutate actual gate response')
    require(not any(r['type']=='file-rename-complete' and Path(r['path']).name=='owner-final.json' for r in rows),'Final was atomically published despite late error')
    return True
def parser_mutations(record,rows,failure,mode):
    tests=[]
    def bad(name,r=record,e=rows,m=failure):
        try:evaluate(r,e,m,mode,False)
        except (ValueError,KeyError,TypeError):tests.append(name)
        else:raise AssertionError('Invalid lifecycle receipt accepted: '+name)
    bad('rc0',r={**record,'rc':0});bad('timeout',r={**record,'timeout':True});bad('observer-unhealthy',r={**record,'observerHealthy':False})
    bad('owner-pass-output',r={**record,'output':'PASS'})
    bad('missing-delivery',e=[r for r in rows if r['type']!='lifecycle-error-delivery'])
    bad('missing-observed-error',e=[r for r in rows if r['type']!='lifecycle-error-observed'])
    bad('missing-cache-proof',e=[r for r in rows if r['type']!='lifecycle-success-cache-copy'])
    bad('wrong-delivery-stage',e=[{**r,'stage':'WRONG_STAGE'} if r['type']=='lifecycle-error-delivery' else r for r in rows])
    bad('missing-exact-owned-temp',e=[r for r in rows if not (r['type']=='directory-created' and Path(r['result']).name.startswith('shiftmgmt-gemini-32v-'))])
    m=copy.deepcopy(failure);m['errors']['primary']['stack']='wrong';bad('primary-stack',m=m)
    m=copy.deepcopy(failure);target=m['worker'];target['callbackEvents']=[e for e in target['callbackEvents'] if e['event'] not in ('error','log-error')];bad('stale-success-failure-snapshot',m=m)
    m=copy.deepcopy(failure);m['cleanup']['tempRemoved']=True;bad('false-temp-removed',m=m)
    require(len(tests)==12,'Parser mutation count differs');return tests
def main():
    p=argparse.ArgumentParser();g=p.add_mutually_exclusive_group();g.add_argument('--list',action='store_true');g.add_argument('--guard',action='store_true');g.add_argument('--guard-v6-gap',action='store_true');g.add_argument('--canaries',action='store_true')
    args=p.parse_args();root=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a1v7-lifecycle-'))
    if args.list:print(json.dumps({'proof':'PLAN_ONLY_NOT_RUN','modes':MODES,'guardInvalid':5,'parserNegative':15}));return 0
    if args.guard or args.guard_v6_gap:
        if args.guard_v6_gap:
            expected={'access-history.mjs':'9E735F3ED1C8DD46D200AED10F53FE5256DFC2459BE87CFFF6C1D5E5F73C4313','access-history-shared.mjs':'38D3AF668282BC5B184A59815D5C0726D6F296C5906E428BD7543C4E7CCF7280'}
            require(all(sha((REPO/'scripts/ui-checks'/n).read_bytes())==h for n,h in expected.items()),'Exact v6 source differs')
        result=guard(root,args.guard_v6_gap);print(json.dumps({'status':'PASS','artifact':str(root),'proof':result['proof'],'invalidRejected':result['invalidRejected'],'invalidAccepted':result['invalidAccepted']}));return 0
    records=[];parser=[]
    for mode in MODES:
        run_dir=root/mode;run_dir.mkdir()
        argv=['node',str(HERE/'lifecycle-canary.mjs'),str(run_dir)] if args.canaries else ['node','scripts/ui-checks/access-history.mjs','--case=contract-core']
        record,rows=run(root,mode,argv,mode,args.canaries)
        try:
            if not args.canaries:
                created=[Path(r['result']) for r in rows if r['type']=='directory-created' and Path(r['result']).parent==REPO/'artifacts/captures/phase3/access-history-contract-core']
                require(len(created)==1,'Exactly one real application owner run required');run_dir=created[0]
            failure_path=run_dir/'owner-failure.json';require(failure_path.is_file(),'Failure evidence absent')
            failure=load(failure_path);evaluate(record,rows,failure,mode,not args.canaries,run_dir)
            require(not (run_dir/'owner-final.json').exists(),'Owner final file exists with late error')
            if args.canaries and not parser:parser=parser_mutations(record,rows,failure,mode)
            if args.canaries and mode in ('late-worker-child-gate','late-worker-child-final','late-server-child-double'):
                bad_rows=rows;bad_failure=copy.deepcopy(failure)
                if mode=='late-worker-child-gate':
                    name='missing-post-removal-candidate';bad_rows=[r for r in rows if not (r['type']=='file-rename-complete' and Path(r['path']).name=='owner-candidate.json')]
                elif mode=='late-worker-child-final':
                    name='missing-final-stage-write';bad_rows=[r for r in rows if not (r['type']=='file-write' and r.get('operation')=='write' and Path(r['path']).name=='owner-final.json.tmp')]
                else:name='missing-second-original-error';bad_failure['errors']['unexpected']=[]
                try:evaluate(record,bad_rows,bad_failure,mode,False,run_dir)
                except (ValueError,KeyError,TypeError):parser.append(name)
                else:raise AssertionError('Invalid stage/second-error proof accepted: '+name)
            record.update(accepted=True,runDir=str(run_dir),failurePath=str(failure_path))
        except (ValueError,AssertionError,KeyError,TypeError,OSError) as error:
            record.update(accepted=False,reason=str(error),runDir=str(run_dir))
        records.append(record)
        print(json.dumps({'mode':mode,'accepted':record['accepted'],'reason':record.get('reason')}),flush=True)
    status='PASS' if len(records)==15 and all(r['accepted'] for r in records) and (not args.canaries or len(parser)==15) else 'FAIL'
    result={'status':status,'proof':'ACTUAL_CONTROL_CANARIES_ONLY_NOT_SUT_ACCEPTANCE' if args.canaries else 'ACTUAL_V7_LATE_CALLBACK_SUBSET_ONLY_NOT_A2_B','bootstrapMode':bool(args.canaries),'records':records,'requiredLateCases':15,'parserRejected':parser,'productEditsBySol':0,'A1Accepted':False,'retention':'Retain exact own run/temp artifacts, no historical/foreign cleanup'}
    dump(root/'suite-result.json',result);print(json.dumps({'status':status,'artifact':str(root),'cases':15,'proof':result['proof'],'parserRejected':len(parser)}),flush=True)
    return 0 if status=='PASS' else 1
if __name__=='__main__':sys.exit(main())
