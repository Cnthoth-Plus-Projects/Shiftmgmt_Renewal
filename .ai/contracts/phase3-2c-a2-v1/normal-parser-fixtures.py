"""Synthetic parser fixtures using retained real PNG bytes. Never SUT evidence."""
from pathlib import Path
import copy,hashlib,importlib.util,json,os,shutil,sys,tempfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('a2_fixture_gate',HERE/'gate-evidence.py')
G=importlib.util.module_from_spec(spec);sys.modules[spec.name]=G;spec.loader.exec_module(G)
def dump(path,v):path.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def meta(path):
    b=path.read_bytes();return {'bytes':len(b),'sha256':G.sha(b)}
def main():
    evidence=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a2-parser-'))
    policy=json.loads((HERE/'environment-policy.json').read_text(encoding='utf-8'))
    png=(Path(policy['reconPath']).parent/'live.png').read_bytes()
    execution=G.V1.load_json(HERE/'execution.json');contract=G.V1.load_json(G.ORIGINAL/'contract.json');eh=G.sha((HERE/'execution.json').read_bytes())
    parent=G.REPO/'artifacts/captures/phase3/access-history-live-admin';parent.mkdir(parents=True,exist_ok=True)
    run=Path(tempfile.mkdtemp(prefix='run-sol-parser-owner-',dir=parent));protected=Path(tempfile.mkdtemp(prefix='run-sol-parser-protected-',dir=parent))
    # These empty temporary directories are owned by this fixture and deliberately removed.
    temp=Path(tempfile.mkdtemp(prefix=contract['tempPrefix']));temp.rmdir()
    ctx={'repository':str(G.REPO),'url':execution['url'],'runDir':str(run),'tempDir':str(temp),'bootstrapFile':str(temp/'data/bootstrap-credentials.json'),'contractPath':str(G.ORIGINAL/'contract.json'),'contractSha256':G.ORIGINAL_CONTRACT_SHA,'executionPath':str(HERE/'execution.json'),'executionSha256':eh}
    ch=G.sha(json.dumps(ctx,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    def process(pid,code):
        r=G.EXTRA.sample_process();r.update(pid=pid,aliveAfterClose=False,logsSettled={'stdout':True,'stderr':True},exitCode=code,closeCode=code)
        for e in r['callbackEvents']:
            if e['pid'] is not None:e['pid']=pid
            if e['event'] in ['exit','close']:e['code']=code
        return r
    owner={'pid':2000000001,'nodePath':shutil.which('node'),'nonceSha256':'A'*64,'context':ctx}
    worker={**process(2000000002,1),'parentPid':owner['pid'],'nonceSha256':owner['nonceSha256'],'contextAck':True,'runAuthorized':True,'argv':[owner['nodePath'],str(G.REPO/execution['normalWorkerScripts']['live-admin']),'--case=live-admin'],'ackReceipt':{'packet':{'type':'worker-ack','protocol':2,'case':'live-admin','ownerPid':owner['pid'],'workerPid':2000000002,'nonceSha256':owner['nonceSha256'],'contextSha256':ch},'receivedAtMs':1}}
    server={**process(2000000003,0),'stdoutListenVerified':True,'portListeningAfterClose':False,'health':{'status':200,'payload':{'ok':True,'data':{'dataDir':str(temp)}}}}
    original=protected/'live-admin.png';original.write_bytes(png)
    capture=run/'normal-capture-live-admin.png';capture.write_bytes(png)
    protected_manifest={'status':'PASS','id':'access-history-live-admin','url':execution['url'],'viewport':{'width':1440,'height':900},'errors':{'executionError':None,'manifestWriteError':None,'consoleErrors':[],'pageErrors':[],'requestFailed':[],'badResponses':[],'cleanupErrors':[]},'captures':[{'name':'live-admin','filename':'live-admin.png','path':original.relative_to(G.REPO).as_posix()}]}
    dump(protected/'manifest.json',protected_manifest);(run/'normal-protected-manifest.json').write_bytes((protected/'manifest.json').read_bytes())
    auth=[{'operation':op,'loginId':'fixture-parser-admin','userId':'fixture-parser-user','role':'admin','ok':True,'passwordChangeRequired':False,'timeMs':1} for op in ['sign-in','get-session']]
    helper=G.REPO/'scripts/lib/ui-check.mjs'
    raw={'schema':'shiftmgmt.normal.raw.v1','case':'live-admin','runId':run.name,'contractSha256':G.ORIGINAL_CONTRACT_SHA,'executionSha256':eh,'contextSha256':ch,'workerPid':worker['pid'],'phase':'scenario','steps':{'enteredAtMs':1,'completedAtMs':2},'environment':{'viewport':[1440,900],'origin':G.NORMAL.ORIGIN,'chrome':policy['chrome'],'fontsReadyAtMs':1,'routes':[]},'auth':auth,'requests':[],'rawErrors':{'console':[],'pageerror':[],'requestfailed':[],'badResponses':[]},'expectedErrors':[],'diagnostics':[{'id':'legacy-fixture','pointer':None,'operator':'equal','actual':True,'expected':True,'tolerance':None,'trusted':False}],'resources':{k:{'acquiredAtMs':1,'closeAttemptAtMs':2,'closedAtMs':2,'error':None} for k in ['context','browser']},'captures':[{'id':'normal-capture-live-admin','path':str(capture),'originalPath':str(original),**meta(capture)}],'runner':{'kind':'protected-ui-check','script':str(helper),'scriptSha256':G.sha(helper.read_bytes()),'returned':True,'manifest':{'originalPath':str(protected/'manifest.json'),'path':str(run/'normal-protected-manifest.json'),**meta(run/'normal-protected-manifest.json')}},'errors':copy.deepcopy(G.NORMAL.ERRORS)}
    raw['requests']=[{'id':n,'source':'page','method':'POST','url':G.NORMAL.ORIGIN+'/api/auth:'+a['operation'],'phase':'scenario','startedAtMs':1,'endedAtMs':1,'status':200,'ok':True,'errorCode':None,'query':None} for n,a in enumerate(auth,1)]
    m={'schema':contract['evidenceSchema'],'stage':'normal-integration','stageSlice':'A2','case':'live-admin','runId':run.name,'contractSha256':G.ORIGINAL_CONTRACT_SHA,'executionSha256':eh,'status':'FAIL_INCOMPLETE','exitCode':1,'owner':owner,'worker':worker,'server':server,'cleanup':{'tempRemoved':True,'tempRemovedAtMs':7},'sealedAtMs':7,'errors':copy.deepcopy(G.NORMAL.ERRORS),'artifacts':[],'checks':[],'coverage':None}
    for role in ['worker','server']:
        for stream in ['stdout','stderr']:(run/(role+'-'+stream+'.log')).write_bytes(b'PARSER_FIXTURE_NOT_SUT_LOG\n')
    candidate=run/'owner-candidate.json'
    def publish(value,observations):
        dump(run/'normal-observations.json',observations)
        # Re-bind all raw/file hashes so intrinsic mutations reach their intended checks.
        cov={'requiredIds':G.NORMAL.required_ids(contract,'live-admin'),'missing':G.NORMAL.required_ids(contract,'live-admin'),'extra':['legacy-fixture'],'duplicates':[]}
        value['coverage']=cov
        wf={k:value[k] for k in ['schema','stageSlice','case','runId','contractSha256','executionSha256','status','exitCode','checks']}
        wf.update(contextSha256=ch,workerPid=worker['pid'],coverage=cov,rawSha256=meta(run/'normal-observations.json')['sha256']);dump(run/'worker-final.json',wf)
        ids=['server-stdout','server-stderr','worker-stdout','worker-stderr','normal-observations','worker-final','normal-protected-manifest','normal-capture-live-admin']
        value['artifacts']=[{'id':i,'path':str(run/(i+('.log' if i.endswith(('stdout','stderr')) else '.png' if i.startswith('normal-capture') else '.json'))),**meta(run/(i+('.log' if i.endswith(('stdout','stderr')) else '.png' if i.startswith('normal-capture') else '.json')))} for i in ids]
        dump(candidate,value)
    publish(m,raw);result=G.candidate(candidate,contract,execution,eh)
    require=lambda ok,msg:G.require(ok,msg)
    require(result['acceptance']=='A2_INCOMPLETE_EVIDENCE_ONLY','Fixture acceptance unexpectedly UI')
    rejected=[]
    for name,change in [('candidate-PASS',lambda v,r:v.update(status='PASS')),('owner-RC0',lambda v,r:v.update(exitCode=0)),('case-unknown',lambda v,r:v.update(case='unknown')),('candidate-caller-pass',lambda v,r:v.update(passed=True)),('worker-exit0',lambda v,r:v['worker'].update(exitCode=0)),('context-ACK-false',lambda v,r:v['worker'].update(contextAck=False)),('incomplete-steps',lambda v,r:r['steps'].update(completedAtMs=None)),('resource-not-closed',lambda v,r:r['resources']['context'].update(closedAtMs=None)),('legacy-canonical-claim',lambda v,r:v.update(checks=[{'id':'LIVE-01','actual':True}])),('raw-duplicate-legacy',lambda v,r:r['diagnostics'].append(copy.deepcopy(r['diagnostics'][0]))),('unrelated-console401',lambda v,r:r['rawErrors']['console'].append({'text':'SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401','url':G.NORMAL.ORIGIN+'/api/access-logs:list','timeMs':1})),('raw-secret-field',lambda v,r:r.update(password='forged-parser-only')),('auth-mock-route',lambda v,r:r['environment']['routes'].append({'url':'**/api/auth:*','timeMs':1})),('raw-fake-expected',lambda v,r:r['expectedErrors'].append({'kind':'console','index':0,'requestId':1,'reason':'forged'})),('wrong-browser',lambda v,r:r['environment']['chrome'].update(path=owner['nodePath'])),('runner-not-returned',lambda v,r:r['runner'].update(returned=False)),('raw-pointer-body-context',lambda v,r:r.update(contextSha256='F'*64))]:
        value=copy.deepcopy(m);observations=copy.deepcopy(raw);change(value,observations);publish(value,observations)
        try:G.candidate(candidate,contract,execution,eh)
        except (ValueError,KeyError,TypeError):rejected.append(name)
        else:raise AssertionError('Parser falsely accepted '+name)
    publish(m,raw);result=G.candidate(candidate,contract,execution,eh)
    for name,change in [('missing-artifact',lambda v:v['artifacts'].pop()),('hash-mismatch',lambda v:v['artifacts'][0].update(sha256='F'*64)),('outside-artifact',lambda v:v['artifacts'][0].update(path=str(original))),('missing-coverage',lambda v:v['coverage']['missing'].pop())]:
        value=copy.deepcopy(m);change(value);dump(candidate,value)
        try:G.candidate(candidate,contract,execution,eh)
        except (ValueError,KeyError,TypeError):rejected.append(name)
        else:raise AssertionError('Parser falsely accepted '+name)
    publish(m,raw);result=G.candidate(candidate,contract,execution,eh)
    out=run/'adjudicator-stdout.log';err=run/'adjudicator-stderr.log';out.write_text(json.dumps({'status':'PASS','result':result}),encoding='utf-8');err.write_bytes(b'')
    adjudicator=process(2000000004,0)
    for k in ['createdAtMs','exitAtMs','closeAtMs']:adjudicator[k]+=10
    for k in ['logFinishAtMs','logCloseAtMs']:
        for stream in ['stdout','stderr']:adjudicator[k][stream]+=10
    for event in adjudicator['callbackEvents']:event['timeMs']+=10
    final={**m,'adjudication':{'result':result,'candidateSha256':result['candidateSha256'],'gatePath':str(HERE/'gate-evidence.py'),'gateSha256':G.sha((HERE/'gate-evidence.py').read_bytes()),'process':adjudicator,'stdoutPath':str(out),'stderrPath':str(err),'stdoutSha256':G.sha(out.read_bytes()),'stderrSha256':G.sha(err.read_bytes())}}
    dump(run/'owner-final.json',final);G.final(run/'owner-final.json',contract,execution,eh)
    result={'status':'PASS','proof':'SYNTHETIC_CANDIDATE_FINAL_PARSER_ONLY_NOT_SUT_ACCEPTANCE','validCandidate':1,'validFinal':1,'rejected':rejected,'count':len(rejected),'fixtureRun':str(run),'protectedFixtureRun':str(protected),'retention':'Explicitly retain parser fixtures; fabricated test identities never count as runtime evidence'}
    dump(evidence/'parser-result.json',result);print(json.dumps({'status':'PASS','artifact':str(evidence),'proof':result['proof'],'count':len(rejected)}))
if __name__=='__main__':main()
