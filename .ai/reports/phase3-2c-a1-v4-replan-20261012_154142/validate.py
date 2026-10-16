# -*- coding: utf-8 -*-
"""Control syntax, parser proof, actual observer health. No product acceptance."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent
CTRL=REPORT.parent.parent/'contracts/phase3-2c-a1-v4'
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
ATTEMPT=datetime.now().strftime('%Y%m%d_%H%M%S')
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def command(name,argv,cwd=REPO,limit=180):
    env=dict(os.environ);env['PYTHONIOENCODING']='utf-8'
    for key in list(env):
        if key.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or key in ('NODE_OPTIONS','NODE_DEBUG'):del env[key]
    start=datetime.now(timezone.utc).isoformat()
    name=ATTEMPT+'-'+name
    out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt')
    with out.open('wb') as stdout,err.open('wb') as stderr:
        child=subprocess.Popen(argv,cwd=cwd,env=env,stdout=stdout,stderr=stderr)
        rc=child.wait(timeout=limit)
    record={'argv':argv,'cwd':str(cwd),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'stdout':str(out),'stderr':str(err),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes())}
    (REPORT/(name+'.command.json')).write_bytes((json.dumps(record,indent=2)+'\n').encode())
    print(json.dumps({'name':name,'rc':rc}),flush=True)
    assert rc==0,(name,err.read_text(encoding='utf-8',errors='replace')[-2000:])
    return out.read_text(encoding='utf-8')
def main():
    syntax=[]
    for p in sorted(CTRL.glob('*.py')):compile(p.read_bytes(),str(p),'exec');syntax.append(p.name)
    for p in sorted(CTRL.glob('*.mjs')):command('syntax-'+p.stem,['node','--check',str(p)])
    ex=sha((CTRL/'execution.json').read_bytes())
    gate=json.loads(command('gate-parser',[sys.executable,'-B',str(CTRL/'gate-evidence.py'),'--execution-sha',ex,'--self-test']))
    assert gate['status']=='PASS'
    assert len(gate['result']['extraRejectedMutations'])==35
    runtime=json.loads(command('runtime-parser',[sys.executable,'-B',str(CTRL/'runtime-probes.py'),'--execution-sha',ex,'--baseline-sha','0'*64,'--self-test']))
    plans={}
    plans['runtime']=json.loads(command('runtime-list',[sys.executable,'-B',str(CTRL/'runtime-probes.py'),'--execution-sha',ex,'--baseline-sha','0'*64,'--list']))
    assert len(plans['runtime']['faults'])==44
    for name in ('ipc','component','partial'):
        plans[name]=json.loads(command(name+'-list',['node',str(CTRL/(name+'-probes.mjs')),'--list']))
    assert len(plans['ipc']['cases'])==19 and plans['component']['additionalTypedMutations']==25 and len(plans['partial']['modes'])==5
    text=command('actual-observer-selfcheck',[sys.executable,'-B',str(CTRL/'observer-selfcheck.py')],limit=180)
    summary=json.loads(text.splitlines()[-1]);assert summary['status']=='PASS' and summary['actualControlChecks']==37 and summary['rejectedCorruptions']==9
    folder=Path(summary['artifact']);receipt=json.loads((folder/'selfcheck-result.json').read_text(encoding='utf-8'))
    assert len(receipt['records'])==37 and all(r['acceptedControlCheck'] for r in receipt['records'])
    for name,digest in receipt['controlFiles'].items():assert sha((CTRL/name).read_bytes())==digest
    # Validate chain identity using the exact future runtime receipt validator.
    import importlib.util
    spec=importlib.util.spec_from_file_location('v4runtime',CTRL/'runtime-probes.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.validate_health_receipt(folder)
    result={'status':'PASS','proof':'V4_CONTROL_SYNTAX_PARSER_AND_ACTUAL_OBSERVER_ONLY_NOT_SUT_ACCEPTANCE','pythonSyntax':syntax,'nodeSyntax':len(list(CTRL.glob('*.mjs'))),'gateParser':gate,'runtimeParser':runtime,'plans':plans,'observerSummary':summary,'controlHashes':{p.name:sha(p.read_bytes()) for p in sorted(CTRL.iterdir()) if p.is_file()},'A1Accepted':False,'productChanges':0}
    (REPORT/'control-validation.json').write_bytes((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'status':'CONTROL_VALIDATED','parserRejects':35,'actualObserver':37,'corruptionsRejected':9,'A1Accepted':False}),flush=True)
if __name__=='__main__':main()
