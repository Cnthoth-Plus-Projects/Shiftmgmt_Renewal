# -*- coding: utf-8 -*-
"""Validate Sol v7 controls; never report application acceptance."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, importlib.util, json, os, subprocess, sys
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7';REPORT=DOC/'.ai/reports/phase3-2c-a1-v7-replan'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def command(name,args,limit=180):
    name='v2-'+name
    env=dict(os.environ)
    for k in list(env):
        if k.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or k in ('NODE_OPTIONS','NODE_DEBUG'):del env[k]
    env['PYTHONIOENCODING']='utf-8'
    out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
    with out.open('xb') as stdout,err.open('xb') as stderr:
        child=subprocess.Popen([str(a) for a in args],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
        try:rc=child.wait(timeout=limit);timed=False
        except subprocess.TimeoutExpired:timed=True;child.kill();rc=child.wait(timeout=10)
    receipt={'argv':[str(a) for a in args],'cwd':str(REPO),'pid':child.pid,'startUtc':start,'endUtc':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed,'stdout':str(out),'stderr':str(err),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes())}
    dump(REPORT/(name+'.command.json'),receipt);print(json.dumps({'name':name,'rc':rc,'timeout':timed}),flush=True)
    assert rc==0 and not timed,(name,err.read_text(encoding='utf-8',errors='replace'))
    return out.read_text(encoding='utf-8')
def main():
    syntax=[]
    for p in sorted(CTRL.glob('*.py')):compile(p.read_bytes(),str(p),'exec');syntax.append(p.name)
    for p in sorted(CTRL.glob('*.mjs')):command('syntax-'+p.stem,['node','--check',p]);syntax.append(p.name)
    assert (CTRL/'lifecycle-preload.mjs').read_bytes()==(CTRL/'runtime-preload.mjs').read_bytes()+b'\n'+(CTRL/'lifecycle-extension.mjs').read_bytes()
    eh=sha((CTRL/'execution.json').read_bytes());zero='0'*64
    gate=json.loads(command('gate-parser',[PY,'-X','utf8','-B',CTRL/'gate-evidence.py','--execution-sha',eh,'--self-test']))
    assert len(gate['result']['extraRejectedMutations'])==35 and gate['result']['v7ReceiptRules']['rejectedCount']==43
    parser=json.loads(command('runtime-parser',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',eh,'--baseline-sha',zero,'--self-test']))
    assert parser['observationRules']['rejectedCount']==13
    plans={}
    plans['runtime']=json.loads(command('runtime-plan',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',eh,'--baseline-sha',zero,'--list']))
    for name in ('ipc','component','partial'):plans[name]=json.loads(command(name+'-plan',['node',CTRL/(name+'-probes.mjs'),'--list']))
    plans['lifecycle']=json.loads(command('lifecycle-plan',[PY,'-X','utf8','-B',CTRL/'lifecycle-probes.py','--list']))
    assert len(plans['runtime']['faults'])==51 and len(plans['ipc']['cases'])==19 and plans['component']['additionalTypedMutations']==32 and len(plans['partial']['modes'])==11 and len(plans['lifecycle']['modes'])==15
    health_summary=json.loads(command('observer-bootstrap-v6',[PY,'-X','utf8','-B',CTRL/'observer-selfcheck.py','--bootstrap-v6']).splitlines()[-1])
    health_root=Path(health_summary['artifact']);health=load(health_root/'selfcheck-result.json')
    assert health['status']=='PASS' and health['bootstrapMode'] is True and health['actualControlChecks']==45 and len(health['corruptedObservationVectorsRejected'])==9
    assert health['proof']=='BOOTSTRAP_V6_CONTROL_ONLY_NOT_V7_ACCEPTANCE'
    spec=importlib.util.spec_from_file_location('sol_v7_runtime_validate',CTRL/'runtime-probes.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    for r in health['records']:
        assert r['acceptedControlCheck']
        if r['observerHealthy']:m.HEALTH.observer_health((health_root/(r['name']+'.events.jsonl')).read_text(encoding='utf-8'),r['pid'],r['mode'],r['session'],r['rc'])
    try:m.validate_health_receipt(health_root)
    except AssertionError:rejected_bootstrap=True
    else:raise AssertionError('Bootstrap accepted as v7 runtime proof')
    guard_summary=json.loads(command('actual-v6-guard-gaps',[PY,'-X','utf8','-B',CTRL/'lifecycle-probes.py','--guard-v6-gap']).splitlines()[-1])
    assert guard_summary['status']=='PASS' and guard_summary['invalidAccepted']==5
    replay=json.loads(command('retained-v6-replay',[PY,'-X','utf8','-B',CTRL/'replay-v6.py']))
    assert replay['status']=='PASS' and len(replay['rejected'])==4
    canaries_summary=json.loads(command('lifecycle-canaries',[PY,'-X','utf8','-B',CTRL/'lifecycle-probes.py','--canaries']).splitlines()[-1])
    canaries=load(Path(canaries_summary['artifact'])/'suite-result.json')
    assert canaries['status']=='PASS' and canaries['bootstrapMode'] and len(canaries['records'])==15 and len(canaries['parserRejected'])==14
    assert all(r['accepted'] and r['observerHealthy'] and not r['timeout'] for r in canaries['records'])
    dump(REPORT/'observer-control-receipt-v2.json',health)
    dump(REPORT/'lifecycle-control-receipt-v2.json',canaries)
    initial=load(REPORT/'initial-evidence.json')
    for p,h in initial['historicalControls'].items():
        b=Path(p).read_bytes();assert {'bytes':len(b),'sha256':sha(b)}==h,p
    s=importlib.util.spec_from_file_location('prepare_v7_validate',DOC/'.ai/work/prepare-a1-v7.py');intake=importlib.util.module_from_spec(s);s.loader.exec_module(intake)
    assert intake.snapshot()==initial['sourceBefore']
    result={'status':'PASS','proof':'SOL_V7_CONTROL_VALIDATION_ONLY_NOT_PRODUCT_ACCEPTANCE','A1Accepted':False,'productEditsBySol':0,'syntax':syntax,'plans':plans,'gateParser':gate['result'],'runtimeParser':parser,'observerSummary':{**health_summary,'bootstrapMode':True,'runtimeRejectsBootstrap':rejected_bootstrap},'guardReplay':guard_summary,'retainedV6Replay':replay,'lifecycleSummary':canaries_summary,'currentSourceUnchanged':True,'historicalControlsUnchanged':69,'balancedReview':'Terra unavailable -> gpt-6-sol read-only review; root applied spawned-actor wording and self-contained guard extraction contract','initialDevelopmentCanaries':r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v7-lifecycle-8jrmuhyi','controlHashes':{p.name:sha(p.read_bytes()) for p in CTRL.iterdir() if p.is_file()}}
    result['independentControlReviewFixes']=['post-removal preserved candidate publication','completed final temporary write before delivery','second original error in unexpected ledger','closed actor/kind/stage exact','old partial bootstrap disabled; actual11 unchanged']
    dump(REPORT/'control-validation-v2.json',result)
    print(json.dumps({'status':'PASS','syntaxFiles':len(syntax),'observer':45,'lifecycle':15,'parserNegative':14,'actualV6GuardGaps':5,'retainedV6DefectsRejected':4,'proof':result['proof']}),flush=True)
if __name__=='__main__':main()
