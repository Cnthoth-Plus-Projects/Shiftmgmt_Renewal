"""One-time explicit A1 control migration. Historical files never change."""
from pathlib import Path
import hashlib, json, sys
sys.dont_write_bytecode = True
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'phase3-2c-a1-v7'
DOC=HERE.parents[2]
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')

def save(p,v):
    if p.exists():
        assert json.loads(p.read_text(encoding='utf-8'))==v,str(p)
        return
    with p.open('x',encoding='utf-8') as f: json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def replace(text,a,b):
    assert a in text,a
    return text.replace(a,b)

names=['evidence-v7.py','gate-evidence.py','runtime-probes.py','runtime-preload.mjs',
       'observer-selfcheck.py','observer-canary.mjs','ipc-probes.mjs','component-probes.mjs',
       'partial-probes.mjs','partial-preload.mjs','lifecycle-probes.py','lifecycle-preload.mjs',
       'lifecycle-extension.mjs','lifecycle-canary.mjs','frozen-shared.json']
changes={}
for name in names:
    text=(OLD/name).read_text(encoding='utf-8')
    if name=='gate-evidence.py':
        text=replace(text,'V1 = original_module()',"V1 = original_module()\nspec_normal = importlib.util.spec_from_file_location('sol_normal_evidence', HERE / 'normal-evidence.py')\nNORMAL = importlib.util.module_from_spec(spec_normal)\nspec_normal.loader.exec_module(NORMAL)")
        text=replace(text,"case = manifest['case']\n    require(case in execution['enabledCases']", "case = manifest['case']\n    if case in execution['normalCases']:\n        return NORMAL.candidate(path, contract, execution, execution_sha, sys.modules[__name__])\n    require(case in execution['a1Cases']")
        text=replace(text,"published = V1.load_json(path)\n    require(path.name", "published = V1.load_json(path)\n    if published['case'] in execution['normalCases']:\n        return NORMAL.final(path, contract, execution, execution_sha, sys.modules[__name__])\n    require(path.name")
        text=replace(text,"require(execution['executionVersion'] == 7, 'Wrong execution version')", "require(execution['executionVersion'] == 1 and execution['executionFamily'] == 'A2', 'Wrong A2 execution version')")
        text=replace(text,'result = self_test(contract)',"result = self_test(contract)\n        result['normalParser'] = NORMAL.self_test(contract)")
    elif name=='runtime-probes.py':
        text=replace(text,"for case in execution['enabledCases']:","for case in execution['a1Cases']:")
        text=replace(text,"['actualControlChecks']==45 and len(health_receipt['records'])==45", "['actualControlChecks']==37 and len(health_receipt['records'])==37")
    elif name=='lifecycle-probes.py':
        text=replace(text,"fs.readFileSync('scripts/ui-checks/access-history.mjs','utf8')", "fs.readFileSync('scripts/ui-checks/access-history-negative.mjs','utf8')")
        text=replace(text,"node.getText(tree)+'\\\\nthis.guard", "node.getText(tree).replace(/^export\\s+/,'')+'\\\\nthis.guard")
    elif name=='observer-selfcheck.py':
        text=replace(text,"--bootstrap-v6","--bootstrap-accepted-a1")
        text=replace(text,'9E735F3ED1C8DD46D200AED10F53FE5256DFC2459BE87CFFF6C1D5E5F73C4313','803C53C05E509D0BF95FFB3880F449B6AD48A559B2F790C096103D27CFFC0564')
        text=replace(text,'38D3AF668282BC5B184A59815D5C0726D6F296C5906E428BD7543C4E7CCF7280','FA30EA3CB60A4F7A6FDADFFB626C365FBDA1A12B0D38C66C9C551A89BBB0DA25')
        text=replace(text,'BOOTSTRAP_V6_CONTROL_ONLY_NOT_V7_ACCEPTANCE','BOOTSTRAP_ACCEPTED_A1_CONTROL_ONLY_NOT_A2_ACCEPTANCE')
    data=text.encode('utf-8')
    if (HERE/name).exists(): assert (HERE/name).read_bytes()==data,name
    else:
        with (HERE/name).open('xb') as f:f.write(data)
    changes[name]={'from':str(OLD/name),'beforeSha256':hashlib.sha256((OLD/name).read_bytes()).hexdigest().upper(),'afterSha256':hashlib.sha256(data).hexdigest().upper(),'adapted':(OLD/name).read_bytes()!=data}

e=json.loads((OLD/'execution.json').read_text(encoding='utf-8'))
normal=e['deferredCases'];e['executionVersion']=1;e['executionFamily']='A2'
e['stageSlice']='A2';e['acceptance']='Normal8 incomplete evidence only; fullUI87/A/B/release acceptance separate'
e['a1Cases']=e['enabledCases'];e['normalCases']=normal;e['enabledCases']=e['publicCases'];e['deferredCases']=[]
e['allowed']=[f'scripts/ui-checks/{n}' for n in ['access-history.mjs','access-history-shared.mjs','access-history-positive.mjs','access-history-negative.mjs']]
e['ipcCases']=['contract-core']+normal
e['normalWorkerScripts']={c:'scripts/ui-checks/access-history-'+('negative' if c in ['errors','session-expired'] else 'positive')+'.mjs' for c in normal}
e['deadlinesMs']['normal']=120000
e['frozenSharedPath']=str(HERE/'frozen-shared.json');e['frozenSharedSha256']=hashlib.sha256((HERE/'frozen-shared.json').read_bytes()).hexdigest().upper()
e['observerSelfcheckRequired']['actualControlChecks']=37
e['observerMigration']={'old45':45,'retainedGeneric':37,'replacedDeferredByActualNormalCases':normal,'rejectedCorruptions':9,'historicalFilesEdited':0}
e['normalCaptures']={'live-admin':['live-admin'],'list-fixture':['list-fixture-201'],'empty-fixture':['empty-fixture-g2'],'filters':['filters-validation-lock'],'errors':['errors-alert'],'stale-response':['stale-response-prevented'],'role-guard':['role-guard-operator-planner'],'session-expired':['session-expired-login']}
e['terminalReceiptContract']='A1 PASS stdout one JSON/RC0; normal incomplete stderr one JSON/RC1/stdout0; real failures stderr one JSON/RC1'
save(HERE/'execution.json',e)
save(HERE/'migration.json',{'proof':'EXPLICIT_CONTROL_MIGRATION_NOT_IMPLEMENTATION','files':changes,'observerMigration':e['observerMigration'],'A1FaultsRetained':51,'partialRetained':11,'lateRetained':15,'guardInvalidRetained':5})
source=(REPO/'scripts/ui-checks/access-history.mjs').read_bytes()
start=source.index(b'function validateProcessReceipt(r) {');end=source.index(b'const waitChild',start)
body=source[start:end].rstrip(b'\r\n')
save(HERE/'guard-preserved.json',{'function':'validateProcessReceipt','allowedProvider':'scripts/ui-checks/access-history-negative.mjs','bytes':len(body),'sha256':hashlib.sha256(body).hexdigest().upper(),'allowedDelta':'export prefix plus file movement only; original internal newline bytes exact'})
print(json.dumps({'copied':len(names),'faults':51,'observerGeneric':37,'normalCases':len(normal)}))
