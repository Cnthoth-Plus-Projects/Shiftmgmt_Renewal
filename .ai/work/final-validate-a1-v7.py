# -*- coding: utf-8 -*-
"""Final lifecycle delta check; reuse immutable unchanged observer/parser evidence."""
from pathlib import Path
import importlib.util,json,hashlib,sys
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7';REPORT=DOC/'.ai/reports/phase3-2c-a1-v7-replan'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def module(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
    previous=load(REPORT/'control-validation-v2.json')
    expected_changes={'lifecycle-probes.py','STRATEGY.md'}
    changed={p.name for p in CTRL.iterdir() if p.is_file() and previous['controlHashes'].get(p.name)!=sha(p)}
    assert changed<=expected_changes,changed
    for p in CTRL.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
    validator=module('sol_v7_final_delta',DOC/'.ai/work/validate-a1-v7.py')
    life=module('sol_v7_current_lifecycle',CTRL/'lifecycle-probes.py')
    plan=json.loads(validator.command('final-lifecycle-plan',[validator.PY,'-X','utf8','-B',CTRL/'lifecycle-probes.py','--list']))
    assert len(plan['modes'])==15 and plan['parserNegative']==15
    summary=json.loads(validator.command('final-lifecycle-canaries',[validator.PY,'-X','utf8','-B',CTRL/'lifecycle-probes.py','--canaries']).splitlines()[-1])
    root=Path(summary['artifact']);receipt=load(root/'suite-result.json')
    assert receipt['status']=='PASS' and receipt['bootstrapMode'] and len(receipt['records'])==len(receipt['parserRejected'])==15
    for r in receipt['records']:
        assert r['accepted'] and not r['timeout']
        rows=life.R.HEALTH.observer_health(Path(r['eventsPath']).read_text(encoding='utf-8'),r['pid'],r['mode'],r['session'],r['rc'])
        life.evaluate(r,rows,load(Path(r['failurePath'])),r['mode'],False,Path(r['runDir']))
    initial=load(REPORT/'initial-evidence.json')
    prep=module('sol_v7_final_prepare',DOC/'.ai/work/prepare-a1-v7.py')
    assert prep.snapshot()==initial['sourceBefore']
    for p,h in initial['historicalControls'].items():assert prep.meta(Path(p))==h
    result={**previous,'status':'PASS','proof':'SOL_V7_FINAL_CONTROL_VALIDATION_ONLY_NOT_PRODUCT_ACCEPTANCE','lifecycleSummary':summary,'lifecyclePlan':plan,'lifecycleParserRejected':receipt['parserRejected'],'deltaChanges':sorted(changed),'unchangedEvidenceReused':['observer45/corruptions9','gate parser43/legacy35/original19','runtime parser13','pure actualv6 gap5','retained actualv6 replay4'],'controlHashes':{p.name:sha(p) for p in CTRL.iterdir() if p.is_file()}}
    with (REPORT/'control-validation-final.json').open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
    print(json.dumps({'status':'PASS','lifecycle15':True,'parser15':True,'controlsOnly':True,'sourceUnchanged':True,'artifact':str(root)}),flush=True)
if __name__=='__main__':main()
