"""Sol independent incomplete-evidence parser. Parser PASS is never UI PASS."""
import copy, hashlib, json, math, re, socket, tempfile
from pathlib import Path
from urllib.parse import urlsplit

RAW_KEYS=set('schema case runId contractSha256 executionSha256 contextSha256 workerPid phase steps environment auth requests rawErrors expectedErrors diagnostics resources captures runner errors'.split())
WF_KEYS=set('schema stageSlice case runId contractSha256 executionSha256 contextSha256 workerPid status exitCode checks coverage rawSha256'.split())
REQ_KEYS=set('id source method url phase startedAtMs endedAtMs status ok errorCode query'.split())
ERRORS={'primary':None,'cleanup':[],'evidence':[],'unexpected':[]}
ORIGIN='http://127.0.0.1:18741'
FORBIDDEN={'password','currentPassword','nextPassword','sessionToken','cookie','cookies','authorization','nonce','headers'}

def require(ok,message):
    if not ok: raise ValueError(message)
def exact_keys(v,keys,message):
    require(type(v) is dict and set(v)==set(keys),message)
def same(a,b):
    return type(a) is type(b) and (set(a)==set(b) and all(same(a[k],b[k]) for k in a) if isinstance(a,dict) else len(a)==len(b) and all(same(x,y) for x,y in zip(a,b)) if isinstance(a,list) else a==b)
def sha(b): return hashlib.sha256(b).hexdigest().upper()
def time(v): return type(v) in (int,float) and math.isfinite(v) and v>0
def finite(v):
    if type(v) is float: require(math.isfinite(v),'Nonfinite value')
    elif type(v) is dict:
        require(not any(k.lower() in {s.lower() for s in FORBIDDEN} for k in v),'Secret field in normal evidence')
        for x in v.values():finite(x)
    elif type(v) is list:
        for x in v:finite(x)
def required_ids(contract,case):
    require(case in contract['fullUi']['rules'],'Unknown normal case')
    ids=[r['id'] for r in contract['fullUi']['rules'][case]]
    require(ids and len(set(ids))==len(ids),'Empty/duplicate required registry')
    return ids
def coverage(contract,case,diagnostics):
    ids=[];duplicate=[]
    for d in diagnostics:
        exact_keys(d,{'id','pointer','operator','actual','expected','tolerance','trusted'},'Diagnostic fields differ')
        require(type(d['id']) is str and d['id'] and d['trusted'] is False,'Invalid diagnostic identity/trust')
        require(d['pointer'] is None or type(d['pointer']) is str and d['pointer'].startswith('/'),'Diagnostic pointer invalid')
        require(d['operator'] in ['equal','near'],'Unknown diagnostic operator')
        finite(d)
        if d['operator']=='near':
            require(all(type(d[k]) in (int,float) and math.isfinite(d[k]) for k in ['actual','expected','tolerance']),'Near nonfinite/type')
            require(0<=d['tolerance']<=1,'Near tolerance >1')
            require(abs(d['actual']-d['expected'])<=d['tolerance'],'Actual near assertion failed')
        else: require(d['tolerance'] is None and same(d['actual'],d['expected']),'Actual equal assertion failed')
        if d['id'] in ids:
            if d['id'] not in duplicate:duplicate.append(d['id'])
        else:ids.append(d['id'])
    require(not duplicate,'Duplicate diagnostic IDs')
    required=required_ids(contract,case)
    # No legacy claim becomes a canonical observation in A2.
    return {'requiredIds':required,'missing':required[:],'extra':ids,'duplicates':duplicate}

def expected_errors(raw):
    """Recompute correlations; never trust caller expected-error/pass labels."""
    case=raw['case'];requests=raw['requests'];seen={};classified=[]
    require(type(requests) is list,'Requests absent')
    for n,r in enumerate(requests,1):
        exact_keys(r,REQ_KEYS,'Request fields differ')
        require(type(r['id']) is int and r['id']==n,'Request identity/order differs')
        require(r['source'] in ['page','node-fetch'] and r['method']=='POST','API request source/method differs')
        parsed=urlsplit(r['url']);require(parsed.scheme+'://'+parsed.netloc==ORIGIN and parsed.path.startswith('/api/'),'Foreign request origin/path')
        require(time(r['startedAtMs']) and time(r['endedAtMs']) and r['endedAtMs']>=r['startedAtMs'],'Request not drained')
        require(type(r['status']) is int and 100<=r['status']<=599,'HTTP status invalid')
        require(type(r['ok']) is bool or r['ok'] is None,'Response ok invalid')
        require(r['errorCode'] is None or type(r['errorCode']) is str,'Response errorCode invalid')
        if parsed.path=='/api/access-logs:list' and case not in ['role-guard','session-expired']:
            q=r['query'];require(type(q) is dict and set(q)<=set('dateFrom dateTo loginId actionType keyword'.split()) and all(type(x) is str for x in q.values()),'List query is not exact allowed bridge args')
        else:require(r['query'] is None,'Non-list/auth/role/session body persisted')
        if r['status']<400:
            if case=='errors' and parsed.path=='/api/access-logs:list':
                require(r['status']==200 and r['source']=='page' and r['ok'] is False and r['errorCode']=='DATABASE_ERROR','Wrong intentional fixture error')
                classified.append({'kind':'requests','index':n-1,'requestId':n,'reason':'DATABASE_ERROR_FIXTURE'})
            else:require(r['ok'] is True and r['errorCode'] is None,'Unexpected Bridge error in HTTP200')
        seen[r['id']]=r
    raw_errors=raw['rawErrors'];exact_keys(raw_errors,{'console','pageerror','requestfailed','badResponses'},'Raw errors absent')
    require(all(type(v) is list for v in raw_errors.values()),'Raw error arrays invalid')
    require(not raw_errors['pageerror'] and not raw_errors['requestfailed'],'Unexpected runtime error')
    high=[r for r in requests if r['status']>=400]
    bad=raw_errors['badResponses'];require(len(bad)==len(high),'HTTP raw event lost')
    used=set();counts={}
    signouts=[a for a in raw['auth'] if a['operation']=='sign-out' and a['ok'] is True]
    for i,b in enumerate(bad):
        exact_keys(b,{'requestId','status','url','method','errorCode','timeMs'},'Bad response fields differ')
        require(b['requestId'] in seen and b['requestId'] not in used,'Bad response identity duplicated/missing')
        r=seen[b['requestId']];used.add(r['id'])
        require(all(same(b[k],r[k]) for k in ['status','url','method','errorCode']) and time(b['timeMs']),'Bad response raw mismatch')
        path=urlsplit(r['url']).path
        if case=='role-guard':
            require(r['source']=='node-fetch' and r['phase'] in ['role-operator-direct','role-planner-direct','role-reviewer-direct'] and path in ['/api/access-logs:list','/api/operations:list-users'] and r['status']==403 and r['errorCode']=='AUTH_FORBIDDEN' and r['ok'] is False,'Unrelated role error')
            key=(r['phase'],path);reason='ROLE_FORBIDDEN'
        elif case=='session-expired':
            require(signouts and any(a['timeMs']<=r['startedAtMs'] for a in signouts),'401 before actual sign-out')
            require(r['status']==401 and r['errorCode']=='AUTH_SESSION_REQUIRED' and r['ok'] is False,'Unrelated session error')
            if r['source']=='page':require(r['phase']=='session-refresh' and path in ['/api/access-logs:list','/api/operations:list-users'],'Unrelated page401')
            else:require(r['phase']=='session-no-cookie' and path=='/api/access-logs:list','Unrelated direct401')
            key=(r['source'],path);reason='SESSION_REQUIRED'
        else:raise ValueError('Unexpected HTTP response')
        counts[key]=counts.get(key,0)+1;require(counts[key]==1,'Duplicate expected HTTP response')
        classified.append({'kind':'badResponses','index':i,'requestId':r['id'],'reason':reason})
    if case=='role-guard':require(len(high)==6,'Expected six actual nonadmin403 receipts')
    if case=='session-expired':
        require(counts.get(('page','/api/access-logs:list'))==1 and counts.get(('node-fetch','/api/access-logs:list'))==1,'Required session401 absent')
    console_used=set()
    for i,c in enumerate(raw_errors['console']):
        exact_keys(c,{'text','url','timeMs'},'Console fields differ')
        require(case=='session-expired' and c['text']=='Failed to load resource: the server responded with a status of 401 (Unauthorized)' and time(c['timeMs']),'Unrelated console error')
        match=[r for r in high if r['source']=='page' and r['url']==c['url'] and r['startedAtMs']<=c['timeMs']+1000 and c['timeMs']<=r['endedAtMs']+1000]
        require(len(match)==1 and match[0]['id'] not in console_used,'Console has no unique expected request/phase')
        console_used.add(match[0]['id'])
        classified.append({'kind':'console','index':i,'requestId':match[0]['id'],'reason':'SESSION_RESOURCE_401'})
    return classified

def validate_raw(raw,contract):
    exact_keys(raw,RAW_KEYS,'Normal raw fields differ');finite(raw)
    require(raw['schema']=='shiftmgmt.normal.raw.v1','Normal raw schema invalid')
    required_ids(contract,raw['case'])
    exact_keys(raw['steps'],{'enteredAtMs','completedAtMs'},'Step timing fields differ')
    require(time(raw['steps']['enteredAtMs']) and time(raw['steps']['completedAtMs']) and raw['steps']['completedAtMs']>=raw['steps']['enteredAtMs'],'Body not actually complete')
    require(same(raw['errors'],ERRORS),'Actual errors cannot become coverage-only')
    env=raw['environment'];exact_keys(env,{'viewport','origin','chrome','fontsReadyAtMs','routes'},'Environment absent')
    require(same(env['viewport'],[1440,900]) and env['origin']==ORIGIN and time(env['fontsReadyAtMs']),'Actual viewport/origin/fonts invalid')
    exact_keys(env['chrome'],{'path','version'},'Chrome receipt invalid')
    require(Path(env['chrome']['path']).is_file() and type(env['chrome']['version']) is str and env['chrome']['version'],'Installed Chrome absent')
    policy=json.loads((Path(__file__).resolve().parent/'environment-policy.json').read_text(encoding='utf-8'))
    require(Path(env['chrome']['path']).resolve()==Path(policy['chrome']['path']).resolve() and env['chrome']['version']==policy['chrome']['version'],'Chrome differs from inspected installed environment')
    require(type(env['routes']) is list,'Route receipt absent')
    for route in env['routes']:
        pattern='**/api/access-logs:list*' if raw['case']=='stale-response' else '**/api/access-logs:list'
        exact_keys(route,{'url','timeMs'},'Route fields differ');require(route['url']==pattern and time(route['timeMs']),'Auth/foreign fixture route')
    if raw['case'] in ['live-admin','filters','role-guard','session-expired']:require(not env['routes'],'Live/filter case cannot mock API')
    else:require(env['routes'],'Fixture route not installed')
    require(type(raw['auth']) is list and raw['auth'],'Genuine auth receipts absent')
    for auth in raw['auth']:
        exact_keys(auth,{'operation','loginId','userId','role','ok','passwordChangeRequired','timeMs'},'Auth whitelist differs')
        require(auth['operation'] in ['sign-in','change-password','get-session','sign-out'] and type(auth['ok']) is bool and time(auth['timeMs']),'Auth receipt invalid')
        require(all(auth[k] is None or type(auth[k]) is str and auth[k] for k in ['loginId','userId','role']) and (auth['passwordChangeRequired'] is None or type(auth['passwordChangeRequired']) is bool),'Auth field types differ')
    require(any(a['operation']=='sign-in' and a['ok'] and a['role']=='admin' and a['userId'] and a['loginId'] for a in raw['auth']),'Actual admin sign-in absent')
    require(any(a['operation']=='get-session' and a['ok'] and a['role']=='admin' and a['userId'] and a['loginId'] for a in raw['auth']),'Actual admin session absent')
    for a in raw['auth']:
        require(any(r['url']==ORIGIN+'/api/auth:'+a['operation'] and r['ok'] is a['ok'] and r['startedAtMs']<=a['timeMs']<=r['endedAtMs']+1000 for r in raw['requests']),'Auth observation has no actual API response')
    if raw['case']=='role-guard':
        for role in ['operator','planner','reviewer']:
            require(any(a['operation']=='sign-in' and a['ok'] and a['role']==role and a['userId'] and a['loginId'] for a in raw['auth']),'Missing genuine nonadmin sign-in: '+role)
    for a in [a for a in raw['auth'] if a['operation']=='sign-in' and a['ok'] and a['passwordChangeRequired'] is True]:
        require(any(c['operation']=='change-password' and c['ok'] and c['userId']==a['userId'] and c['timeMs']>=a['timeMs'] for c in raw['auth']),'L4 bypass')
    require(same(raw['expectedErrors'],expected_errors(raw)),'Expected HTTP classification differs')
    exact_keys(raw['resources'],{'context','browser'},'Resources absent')
    for r in raw['resources'].values():
        exact_keys(r,{'acquiredAtMs','closeAttemptAtMs','closedAtMs','error'},'Resource fields differ')
        require(r['error'] is None and all(time(r[k]) for k in ['acquiredAtMs','closeAttemptAtMs','closedAtMs']) and r['acquiredAtMs']<=r['closeAttemptAtMs']<=r['closedAtMs'],'Real resource close not verified')
    return coverage(contract,raw['case'],raw['diagnostics'])

def candidate(path,contract,execution,execution_sha,G):
    path=Path(path).resolve(strict=True);m=G.V1.load_json(path);G.V1.finite_tree(m)
    exact_keys(m,set('schema stage stageSlice case runId contractSha256 executionSha256 status exitCode owner worker server cleanup sealedAtMs errors artifacts checks coverage'.split()),'Normal candidate extra/missing fields')
    require(m['case'] in execution['normalCases'],'Wrong normal case')
    require(m['stage']=='normal-integration' and m['stageSlice']=='A2' and m['schema']==contract['evidenceSchema'],'Wrong A2 stage')
    require(m['status']=='FAIL_INCOMPLETE' and type(m['exitCode']) is int and m['exitCode']==1 and m['checks']==[] and 'adjudication' not in m,'Premature case PASS/check claim')
    require(m['contractSha256']==G.ORIGINAL_CONTRACT_SHA and m['executionSha256']==execution_sha,'Normal lock differs')
    o,w,s=m['owner'],m['worker'],m['server'];exact_keys(o,{'pid','nodePath','nonceSha256','context'},'Owner fields differ');ctx=o['context'];run=Path(ctx['runDir']).resolve(strict=True)
    exact_keys(ctx,set('repository url runDir tempDir bootstrapFile contractPath contractSha256 executionPath executionSha256'.split()),'Normal context fields differ')
    require(path==run/'owner-candidate.json' and m['runId']==run.name and run.name.startswith('run-'),'Candidate path/run differs')
    require(run.parent==(G.REPO/'artifacts/captures/phase3'/('access-history-'+m['case'])).resolve() and G.V1.within(run,G.REPO),'Normal run escapes repository')
    require(ctx['repository']==str(G.REPO) and ctx['url']==execution['url']==contract['url'],'Owned context differs')
    require(Path(ctx['contractPath']).resolve()==G.ORIGINAL/'contract.json' and ctx['contractSha256']==G.ORIGINAL_CONTRACT_SHA and Path(ctx['executionPath']).resolve()==G.HERE/'execution.json' and ctx['executionSha256']==execution_sha,'IPC context contract differs')
    temp=Path(ctx['tempDir']).resolve();require(temp.parent==Path(tempfile.gettempdir()).resolve() and temp.name.startswith(contract['tempPrefix']) and not temp.exists(),'Normal temp ownership/removal differs')
    require(Path(ctx['bootstrapFile']).resolve()==temp/'data/bootstrap-credentials.json','Bootstrap path differs')
    require(type(o['pid']) is int and o['pid']>0 and Path(o['nodePath']).is_file() and len({o['pid'],w['pid'],s['pid']})==3 and w['parentPid']==o['pid'],'Owner/child identity differs')
    for label,process in [('worker',w),('server',s)]:G.process_closed(label,process);G.finished_logs(label,process)
    require(w['exitCode']==1 and w['closeCode']==1 and w['exitSignal'] is None and w['closeSignal'] is None,'Actual normal child exit differs')
    require(w['contextAck'] is True and w['runAuthorized'] is True,'Normal IPC not authorized')
    require(re.fullmatch('[0-9A-F]{64}',o['nonceSha256']) and w['nonceSha256']==o['nonceSha256'],'Nonce hash differs')
    ack=w['ackReceipt'];exact_keys(ack,{'packet','receivedAtMs'},'Normal ACK fields differ')
    expected={'type':'worker-ack','protocol':2,'case':m['case'],'ownerPid':o['pid'],'workerPid':w['pid'],'nonceSha256':o['nonceSha256'],'contextSha256':sha(json.dumps(ctx,ensure_ascii=False,separators=(',',':')).encode('utf-8'))}
    require(same(ack['packet'],expected) and time(ack['receivedAtMs']) and w['createdAtMs']<=ack['receivedAtMs']<=w['exitAtMs'],'Actual normal ACK binding differs')
    script=G.REPO/execution['normalWorkerScripts'][m['case']]
    require(w['argv']==[o['nodePath'],str(script),'--case='+m['case']],'Actual worker argv differs')
    require(s['stdoutListenVerified'] is True and s['portListeningAfterClose'] is False and s['health']['status']==200 and s['health']['payload']['ok'] is True and Path(s['health']['payload']['data']['dataDir']).resolve()==temp,'Owned readiness absent')
    require(same(m['errors'],ERRORS),'Owner errors cannot become coverage-only')
    last=max(G.finished_logs('worker',w),G.finished_logs('server',s))
    require(m['cleanup']['tempRemoved'] is True and time(m['cleanup']['tempRemovedAtMs']) and m['cleanup']['tempRemovedAtMs']>=last and time(m['sealedAtMs']) and m['sealedAtMs']>=m['cleanup']['tempRemovedAtMs'],'Normal publication before quiescence')
    with socket.socket() as probe:probe.bind(('127.0.0.1',contract['port']))
    captures=['normal-capture-'+n for n in execution['normalCaptures'][m['case']]]
    positive=m['case'] not in ['errors','session-expired']
    required=['server-stdout','server-stderr','worker-stdout','worker-stderr','normal-observations','worker-final']+(['normal-protected-manifest'] if positive else [])+captures
    G.V1.coverage(m['artifacts'],required);loaded={}
    for item in m['artifacts']:
        exact_keys(item,{'id','path','bytes','sha256'},'Artifact fields differ')
        suffix='.log' if item['id'].endswith(('stdout','stderr')) else '.png' if item['id'] in captures else '.json'
        p=G.owned_file(item['path'],run);require(p==run/(item['id']+suffix),'Artifact ID/path differs')
        b=p.read_bytes();require(type(item['bytes']) is int and item['bytes']==len(b) and item['sha256']==sha(b),'Artifact bytes/hash differs')
        if suffix=='.png':require(G.V1.png_dimensions(b)[0]==1440 and G.V1.png_dimensions(b)[1]>=900,'Normal PNG dimensions differ')
        loaded[item['id']]=item
    raw=G.V1.load_json(loaded['normal-observations']['path']);cov=validate_raw(raw,contract)
    require(raw['steps']['enteredAtMs']>=ack['receivedAtMs'] and raw['steps']['completedAtMs']<=w['exitAtMs'],'Normal body/authorization timeline differs')
    wf=G.V1.load_json(loaded['worker-final']['path']);exact_keys(wf,WF_KEYS,'Worker final fields differ');finite(wf)
    require(wf['schema']==contract['evidenceSchema'] and wf['stageSlice']=='A2' and wf['status']=='FAIL_INCOMPLETE' and type(wf['exitCode']) is int and wf['exitCode']==1 and wf['checks']==[],'Worker final falsely passes')
    for key in ['case','runId','contractSha256','executionSha256']:
        require(same(raw[key],m[key]) and same(wf[key],m[key]),'Worker/raw/owner binding differs: '+key)
    require(raw['workerPid']==wf['workerPid']==w['pid'] and raw['contextSha256']==wf['contextSha256']==expected['contextSha256'],'Worker context binding differs')
    require(wf['rawSha256']==loaded['normal-observations']['sha256'] and same(m['coverage'],cov) and same(wf['coverage'],cov),'Raw hash/independent coverage differs')
    require([c['id'] for c in raw['captures']]==captures,'Actual captures missing/extra')
    for c in raw['captures']:
        exact_keys(c,{'id','path','originalPath','bytes','sha256'},'Capture fields differ')
        require(all(same(c[k],loaded[c['id']][k]) for k in ['id','path','bytes','sha256']),'Capture raw/hash binding differs')
        original=Path(c['originalPath']).resolve(strict=True)
        require(G.V1.within(original,G.REPO/'artifacts/captures/phase3') and sha(original.read_bytes())==c['sha256'],'Original capture ownership/hash differs')
    runner=raw['runner'];exact_keys(runner,{'kind','script','scriptSha256','returned','manifest'},'Runner fields differ')
    expected_script=G.REPO/('scripts/lib/ui-check.mjs' if positive else execution['normalWorkerScripts'][m['case']])
    require(Path(runner['script']).resolve()==expected_script and runner['scriptSha256']==sha(expected_script.read_bytes()) and runner['returned'] is True,'Actual runner invocation absent')
    require(runner['kind']==('protected-ui-check' if positive else 'owned-negative'),'Runner kind differs')
    if positive:
        receipt=runner['manifest'];exact_keys(receipt,{'originalPath','path','bytes','sha256'},'Protected manifest receipt differs')
        require(all(same(receipt[k],loaded['normal-protected-manifest'][k]) for k in ['path','bytes','sha256']),'Protected copied receipt differs')
        original=Path(receipt['originalPath']).resolve(strict=True);require(G.V1.within(original,G.REPO/'artifacts/captures/phase3'/('access-history-'+m['case'])) and original.parent!=run and original.parent.name.startswith('run-') and original.name=='manifest.json','Original protected path escapes owned scenario')
        require(original.read_bytes()==Path(receipt['path']).read_bytes(),'Protected manifest bytes differ')
        protected=G.V1.load_json(original);require(protected['status']=='PASS' and protected['id']=='access-history-'+m['case'] and protected['url']==execution['url'],'Protected helper did not return success')
        G.common_errors(protected['errors']);require(protected['viewport']=={'width':1440,'height':900},'Protected viewport differs')
        require(len(protected['captures'])==len(captures),'Protected captures differ')
        for p,c in zip(protected['captures'],raw['captures']):require((G.REPO/p['path']).resolve()==Path(c['originalPath']).resolve(),'Original protected capture pointer differs')
    else:require(runner['manifest'] is None,'Negative cannot forge protected manifest')
    return {'status':'ACCEPTABLE_INCOMPLETE_CANDIDATE','acceptance':'A2_INCOMPLETE_EVIDENCE_ONLY','case':m['case'],'runId':m['runId'],'candidateSha256':sha(path.read_bytes()),'executionSha256':execution_sha,'checks':0,'artifacts':len(required)}

def final(path,contract,execution,execution_sha,G):
    path=Path(path).resolve(strict=True);published=G.V1.load_json(path)
    require(path.name=='owner-final.json' and published['status']=='FAIL_INCOMPLETE','No published incomplete evidence')
    draft=path.parent/'owner-candidate.json';result=candidate(draft,contract,execution,execution_sha,G)
    normalized=copy.deepcopy(published);receipt=normalized.pop('adjudication')
    exact_keys(receipt,set('result candidateSha256 gatePath gateSha256 process stdoutPath stderrPath stdoutSha256 stderrSha256'.split()),'Adjudication fields differ')
    require(same(normalized,G.V1.load_json(draft)) and same(receipt['result'],result),'Published data/receipt changed')
    require(receipt['candidateSha256']==result['candidateSha256'] and receipt['gateSha256']==sha((G.HERE/'gate-evidence.py').read_bytes()) and Path(receipt['gatePath']).resolve()==G.HERE/'gate-evidence.py','Normal gate lock differs')
    G.process_closed('adjudicator',receipt['process']);G.finished_logs('adjudicator',receipt['process']);require(receipt['process']['exitCode']==0,'Normal gate did not exit0')
    require(receipt['process']['createdAtMs']>=published['sealedAtMs'],'Adjudicator spawned before candidate was sealed')
    require(Path(receipt['stdoutPath']).resolve()==path.parent/'adjudicator-stdout.log' and Path(receipt['stderrPath']).resolve()==path.parent/'adjudicator-stderr.log','Adjudicator log paths differ')
    out=G.owned_file(receipt['stdoutPath'],path.parent).read_bytes();err=G.owned_file(receipt['stderrPath'],path.parent).read_bytes()
    require(sha(out)==receipt['stdoutSha256'] and sha(err)==receipt['stderrSha256'] and not err and same(json.loads(out),{'status':'PASS','result':result}),'Normal gate original logs differ')
    return {**result,'status':'VERIFIED_INCOMPLETE_EVIDENCE_NOT_UI_ACCEPTANCE'}

def self_test(contract):
    good={'id':'legacy-example','pointer':None,'operator':'equal','actual':True,'expected':True,'tolerance':None,'trusted':False}
    cov=coverage(contract,'live-admin',[good]);require(cov['missing']==required_ids(contract,'live-admin'),'Coverage falsely complete')
    rejected=[]
    def reject(name,fn):
        try:fn()
        except (ValueError,TypeError,KeyError):rejected.append(name)
        else:raise AssertionError('Parser accepted invalid '+name)
    reject('unknown-case',lambda:required_ids(contract,'unknown'))
    reject('duplicate-legacy',lambda:coverage(contract,'live-admin',[good,good]))
    for tol in [2,4,float('nan')]:
        d={**good,'operator':'near','actual':132,'expected':132,'tolerance':tol};reject('tolerance-'+str(tol),lambda d=d:coverage(contract,'live-admin',[d]))
    for actual in [float('nan'),float('inf'),133.5]:
        d={**good,'operator':'near','actual':actual,'expected':132,'tolerance':1};reject('actual-'+str(actual),lambda d=d:coverage(contract,'live-admin',[d]))
    for actual in [132,133]:coverage(contract,'live-admin',[{**good,'operator':'near','actual':actual,'expected':132,'tolerance':1}])
    for k in FORBIDDEN:reject('secret-'+k,lambda k=k:finite({k:'secret'}))
    reject('trusted-selfpass',lambda:coverage(contract,'live-admin',[{**good,'trusted':True}]))
    reject('wrong-actual',lambda:coverage(contract,'live-admin',[{**good,'actual':False}]))
    def request(n,source,path,phase,status,code):return {'id':n,'source':source,'method':'POST','url':ORIGIN+path,'phase':phase,'startedAtMs':2,'endedAtMs':4,'status':status,'ok':False,'errorCode':code,'query':None}
    def error(r):return {k:r[k] for k in ['status','url','method','errorCode']}|{'requestId':r['id'],'timeMs':3}
    r1=request(1,'page','/api/access-logs:list','session-refresh',401,'AUTH_SESSION_REQUIRED')
    r2=request(2,'node-fetch','/api/access-logs:list','session-no-cookie',401,'AUTH_SESSION_REQUIRED')
    raw={'case':'session-expired','requests':[r1,r2],'auth':[{'operation':'sign-out','ok':True,'timeMs':1}],'rawErrors':{'console':[{'text':'Failed to load resource: the server responded with a status of 401 (Unauthorized)','url':r1['url'],'timeMs':3}],'pageerror':[],'requestfailed':[],'badResponses':[error(r1),error(r2)]}}
    require(len(expected_errors(raw))==3,'Valid session classification rejected')
    bad=copy.deepcopy(raw);bad['rawErrors']['console'][0]['text']='SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401';reject('unrelated-401',lambda:expected_errors(bad))
    bad=copy.deepcopy(raw);bad['rawErrors']['console'][0]['url']='';reject('401-location-absent',lambda:expected_errors(bad))
    bad=copy.deepcopy(raw);bad['rawErrors']['console']*=2;reject('duplicate-401-console',lambda:expected_errors(bad))
    bad=copy.deepcopy(raw);bad['auth']=[];reject('401-before-signout',lambda:expected_errors(bad))
    bad=copy.deepcopy(raw);bad['requests'][0]['errorCode']='OTHER';bad['rawErrors']['badResponses'][0]['errorCode']='OTHER';reject('401-wrong-errorCode',lambda:expected_errors(bad))
    r3=request(3,'page','/api/operations:list-users','session-refresh',401,'AUTH_SESSION_REQUIRED')
    optional=copy.deepcopy(raw);optional['requests'].append(r3);optional['rawErrors']['badResponses'].append(error(r3));require(len(expected_errors(optional))==4,'Actual optional users401 rejected')
    role=[request(n,'node-fetch',path,'role-'+role+'-direct',403,'AUTH_FORBIDDEN') for n,(role,path) in enumerate([(role,path) for role in ['operator','planner','reviewer'] for path in ['/api/access-logs:list','/api/operations:list-users']],1)]
    role_raw={'case':'role-guard','requests':role,'auth':[],'rawErrors':{'console':[],'pageerror':[],'requestfailed':[],'badResponses':[error(r) for r in role]}};require(len(expected_errors(role_raw))==6,'Actual six role403 rejected')
    reject('pageerror',lambda:expected_errors({**raw,'case':'live-admin','rawErrors':{**raw['rawErrors'],'console':[],'pageerror':['real']}}))
    return {'proof':'PARSER_ONLY_NOT_SUT_EXECUTION','validCoverageIncomplete':1,'validNumericBoundary':2,'validHTTPClassifications':3,'rejected':rejected,'count':len(rejected)}
