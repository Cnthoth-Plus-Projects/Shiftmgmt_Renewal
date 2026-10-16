"""Filesystem parser fixtures only. No application/worker/browser acceptance.
Historical evidence is read only; copies live in newly owned ignored directories.
"""
from pathlib import Path
from datetime import datetime, timezone
import copy, hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile, time, uuid
sys.dont_write_bytecode = True
REPORT = Path(__file__).resolve().parent
ROOT = REPORT.parents[2]
NEW = ROOT / '.ai/contracts/phase3-2c-a1-v2'
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
spec = importlib.util.spec_from_file_location('a1_gate_fixture', NEW / 'gate-evidence.py')
G = importlib.util.module_from_spec(spec); spec.loader.exec_module(G)
contract = G.V1.load_json(ROOT / '.ai/contracts/phase3-2c-v1/contract.json')
execution = G.V1.load_json(NEW / 'execution.json')
execution_sha = G.sha((NEW / 'execution.json').read_bytes())
token = uuid.uuid4().hex[:12]
node = shutil.which('node')
def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
def dead_pid():
    p = subprocess.Popen([node, '-e', 'process.exit(0)'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    p.communicate(timeout=10); assert p.returncode == 0 and not G.V1.pid_alive(p.pid)
    return p.pid
def process_record(pid, now):
    return {'pid':pid, 'exitSeen':True,'closeSeen':True,'aliveAfterClose':False,
            'createdAtMs':now-10000,'exitAtMs':now+10000,'closeAtMs':now+10001,
            'logsSettled':{'stdout':True,'stderr':True}}
old = json.loads((ROOT / '.ai/reports/phase3-2c-a-review-20261001_220126/final-evidence.json').read_text(encoding='utf-8'))
core_source = Path(old['unmodifiedCore']['ownerFinal']['manifestPath']).parent
raw_source = json.loads((core_source / 'core-observations.json').read_text(encoding='utf-8'))
records=[]; manifest_paths=[]
for case in execution['enabledCases']:
    now=time.time()*1000
    run=REPO/'artifacts/captures/phase3'/('access-history-'+case)/('run-sol-parser-only-'+token)
    run.mkdir(parents=True,exist_ok=False)
    temp=Path(tempfile.gettempdir()).resolve()/(contract['tempPrefix']+'parser-only-'+token+'-'+case)
    assert not temp.exists()
    worker=process_record(dead_pid(),now);server=process_record(dead_pid(),now)
    while server['pid']==worker['pid']:server=process_record(dead_pid(),now)
    nonce=hashlib.sha256(('PARSER_ONLY:'+case).encode()).hexdigest().upper()
    context={'url':execution['url'],'runDir':str(run),'tempDir':str(temp),'bootstrapFile':str(temp/'data/bootstrap-credentials.json')}
    worker.update(parentPid=os.getpid(),nonceSha256=nonce,contextAck=case=='contract-core',
                  runAuthorized=case=='contract-core',exitCode=0,argv=[])
    health={'ok':True,'data':{'version':'PARSER_ONLY','node':'PARSER_ONLY','dataDir':str(temp)}}
    server.update(stdoutListenVerified=True,portListeningAfterClose=False,health={'status':200,'payload':health})
    candidate={'schema':contract['evidenceSchema'],'stage':'foundation','stageSlice':'A1','case':case,
        'runId':run.name,'contractSha256':G.ORIGINAL_CONTRACT_SHA,'executionSha256':execution_sha,
        'status':'READY_FOR_ADJUDICATION','exitCode':0,
        'owner':{'pid':os.getpid(),'nodePath':node,'nonceSha256':nonce,'context':context},
        'worker':worker,'server':server,'cleanup':{'tempRemoved':True},
        'errors':{'primary':None,'cleanup':[],'evidence':[],'unexpected':[]},'artifacts':[],'checks':[]}
    for name in ['server-stdout','server-stderr','worker-stdout','worker-stderr']:(run/(name+'.log')).write_bytes(b'')
    if case=='contract-core':
        raw=copy.deepcopy(raw_source)
        raw['resources']=[{'kind':kind,'id':'PARSER_ONLY_'+kind,'events':[
            {'state':state,'timeMs':now+i} for i,state in enumerate(['created','close-start','closed'])]}
            for kind in ['browser','context']]
        checks=[{'id':r['id'],'sourceArtifact':'core-observations','pointer':r['pointer'],
                 'actual':copy.deepcopy(G.V1.pointer(raw,r['pointer']))} for r in contract['foundation']['rules']]
        candidate['checks']=checks
        save(run/'core-observations.json',raw)
        save(run/'worker-final.json',{'case':case,'runId':run.name,'contractSha256':G.ORIGINAL_CONTRACT_SHA,
            'pid':worker['pid'],'parentPid':os.getpid(),'nonceSha256':nonce,'checks':checks})
        shutil.copyfile(core_source/'core-capture.png',run/'core-capture.png')
        artifact_ids=contract['foundation']['artifacts']
    else:
        policy=execution['regressions'][case]
        historical_root=REPO/policy['artifactRoot']
        original_run=historical_root/('run-sol-parser-only-'+token)
        original_run.mkdir(exist_ok=False)
        source_dir=sorted([p for p in historical_root.glob('run-*') if p.is_dir() and p!=original_run
                           and (p/'manifest.json').is_file()], key=lambda p:p.stat().st_mtime,reverse=True)[0]
        child=json.loads((source_dir/'manifest.json').read_text(encoding='utf-8'))
        child['timestamp']=datetime.now(timezone.utc).isoformat();child['serverHealth']=health
        receipts=[]
        for cap in child['captures']:
            name=cap['name'];original=original_run/(name+'.png');copied=run/('regression-capture-'+name+'.png')
            shutil.copyfile(source_dir/(name+'.png'),original);shutil.copyfile(original,copied)
            cap['path']=original.relative_to(REPO).as_posix()
            data=original.read_bytes();receipts.append({'name':name,'originalPath':str(original),'copyPath':str(copied),
                'bytes':len(data),'sha256':G.sha(data),'dimensions':G.V1.png_dimensions(data)})
        source_manifest=original_run/'manifest.json';save(source_manifest,child)
        copied_manifest=run/'regression-manifest.json';shutil.copyfile(source_manifest,copied_manifest)
        script=REPO/policy['script'];argv=[node,str(script),execution['url']]+policy['extraArgs'];worker['argv']=argv
        data=source_manifest.read_bytes()
        raw={'runner':{'script':str(script),'sha256':G.sha(script.read_bytes()),'argv':argv,'pid':worker['pid'],'exitCode':0},
            'evidence':{'manifest':{'originalPath':str(source_manifest),'copyPath':str(copied_manifest),
                                  'bytes':len(data),'sha256':G.sha(data)},'captures':receipts},
            'result':{'status':child['status'],'errors':child['errors'],'serverHealth':health}}
        save(run/'regression-observations.json',raw)
        candidate['checks']=[{'id':id,'sourceArtifact':'regression-observations','pointer':pointer,
             'actual':copy.deepcopy(G.V1.pointer(raw,pointer))} for id,pointer in zip(policy['checkIds'],['/runner','/evidence','/result'])]
        artifact_ids=policy['artifacts']
    for id in artifact_ids:
        suffix='.log' if id in ['server-stdout','server-stderr','worker-stdout','worker-stderr'] else '.png' if id=='core-capture' or id.startswith('regression-capture-') else '.json'
        path=run/(id+suffix);data=path.read_bytes();candidate['artifacts'].append({'id':id,'path':str(path),'bytes':len(data),'sha256':G.sha(data)})
    path=run/'owner-candidate.json';save(path,candidate);manifest_paths.append(str(path))
    positive=G.candidate(path,contract,execution,execution_sha)
    records.append({'case':case,'check':'filesystem-parser-positive','result':positive,'proof':'PARSER_ONLY_NO_RUNTIME_ACCEPTANCE'})
    mutations=[('worker-close',lambda c:c['worker'].update(closeSeen=False)),
               ('server-close',lambda c:c['server'].update(closeSeen=False)),
               ('duplicate-id',lambda c:c['checks'].append(copy.deepcopy(c['checks'][0]))),
               ('caller-expected',lambda c:c['checks'][0].update(expected=True))]
    if case!='contract-core':mutations.append(('fake-regression-IPC',lambda c:c['worker'].update(contextAck=True)))
    for label,mutate in mutations:
        bad=copy.deepcopy(candidate);mutate(bad);save(path,bad)
        try:G.candidate(path,contract,execution,execution_sha)
        except (ValueError,KeyError,TypeError) as e:records.append({'case':case,'check':label,'rejected':True,'reason':str(e)})
        else:raise AssertionError('Filesystem mutation survived: '+case+'/'+label)
    save(path,candidate)
save(REPORT/'filesystem-parser-validation.json',{'proof':'PARSER_ONLY_NO_RUNTIME_ACCEPTANCE','fixtureCandidates':manifest_paths,
    'positiveCases':3,'rejectedMutations':sum(1 for r in records if r.get('rejected')),'records':records,
    'retention':'New ignored parser-only fixture copies retained. Historical artifacts unchanged. No app/worker/browser launched.'})
print(json.dumps({'proof':'PARSER_ONLY_NO_RUNTIME_ACCEPTANCE','positiveCases':3,'rejectedMutations':sum(1 for r in records if r.get('rejected'))}))
