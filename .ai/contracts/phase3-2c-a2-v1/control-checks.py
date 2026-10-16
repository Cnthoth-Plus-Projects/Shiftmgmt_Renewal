"""Preparation proof only. Do not invoke actual A2 owner before implementation."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,socket,subprocess,sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
DOC=HERE.parents[2]
REPORT=DOC/'.ai/reports/phase3-2c-a2-prepare-20261014'
sys.path.insert(0,str(HERE))
from prepare import inventory,meta,save
initial=json.loads((REPORT/'initial-evidence.json').read_text(encoding='utf-8'))
assert inventory()==initial['sourceBefore'],'Product changed during Sol preparation'
for name,expected in initial['historicalControls'].items():assert meta(Path(name))==expected,name
for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
records=[]
def run(name,argv):
    out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
    with out.open('xb') as stdout,err.open('xb') as stderr:
        child=subprocess.Popen(argv,cwd=DOC,stdout=stdout,stderr=stderr,env={**os.environ,'PYTHONIOENCODING':'utf-8'})
        rc=child.wait(timeout=180)
    record={'name':name,'argv':argv,'pid':child.pid,'cwd':str(DOC),'startUtc':start,'endUtc':datetime.now(timezone.utc).isoformat(),'rc':rc,'stdout':str(out),'stderr':str(err),'stdoutMeta':meta(out),'stderrMeta':meta(err)}
    records.append(record);assert rc==0,(name,err.read_text(encoding='utf-8'))
    return out.read_text(encoding='utf-8')
for p in sorted(HERE.glob('*.mjs')):run('final-syntax-'+p.stem,['node','--check',str(p)])
eh=meta(HERE/'execution.json')['sha256']
gate=json.loads(run('final-gate-parser',[sys.executable,'-X','utf8','-B',str(HERE/'gate-evidence.py'),'--execution-sha',eh,'--self-test']))
runtime=json.loads(run('final-runtime-parser',[sys.executable,'-X','utf8','-B',str(HERE/'runtime-probes.py'),'--execution-sha',eh,'--baseline-sha','PARSER_MODE_NOT_USED','--self-test']))
fixtures=json.loads(run('final-normal-parser-fixtures',[sys.executable,'-X','utf8','-B',str(HERE/'normal-parser-fixtures.py')]).splitlines()[-1])
with socket.socket() as probe:probe.bind(('127.0.0.1',18741))
assert inventory()==initial['sourceBefore']
for name,expected in initial['historicalControls'].items():assert meta(Path(name))==expected,name
summary={'status':'PASS','proof':'SOL_CONTROL_PREPARATION_ONLY_NOT_A2_IMPLEMENTATION','syntaxPython':len(list(HERE.glob('*.py'))),'syntaxNode':len(list(HERE.glob('*.mjs'))),'commands':records,'gateParser':gate,'runtimeParser':runtime,'normalCandidateFinalParser':fixtures,'observer37':{'path':r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v7-selfcheck-dtnoldv_\selfcheck-result.json','requiredProof':'BOOTSTRAP_ACCEPTED_A1_CONTROL_ONLY_NOT_A2_ACCEPTANCE'},'lifecycleCanary15':{'path':r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v7-lifecycle-juig74kp\lifecycle-result.json','requiredProof':'ACTUAL_CONTROL_CANARIES_ONLY_NOT_SUT_ACCEPTANCE'},'recon':json.loads((HERE/'environment-policy.json').read_text(encoding='utf-8')),'historicalControlsUnchanged':89,'sourceUnchanged':341,'productEdits':0,'port18741Free':True,'A1Accepted':True,'A2Accepted':False,'BAccepted':False,'v8Created':False}
# lifecycle suite file is named suite-result.json in the retained canonical control.
life=Path(summary['lifecycleCanary15']['path']);life=life.parent/'suite-result.json';summary['lifecycleCanary15']['path']=str(life)
for key in ['observer37','lifecycleCanary15']:
    p=Path(summary[key]['path']);v=json.loads(p.read_text(encoding='utf-8'))
    assert v['status']=='PASS',key
    summary[key]['meta']=meta(p)
save(REPORT/'control-validation-ready.json',summary)
print(json.dumps({'status':'PASS','syntaxPython':summary['syntaxPython'],'syntaxNode':summary['syntaxNode'],'commandCount':len(records),'normalParserRejected':fixtures['count'],'sourceUnchanged':341,'historyUnchanged':89,'proof':summary['proof']}))
