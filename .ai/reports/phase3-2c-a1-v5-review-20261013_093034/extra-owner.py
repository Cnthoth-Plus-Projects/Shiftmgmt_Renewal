# -*- coding: utf-8 -*-
"""Extra actual owner probes; immutable originals remain unchanged."""
from pathlib import Path
import hashlib,importlib.util,json,tempfile,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;CTRL=DOC/'.ai/contracts/phase3-2c-a1-v5'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
spec=importlib.util.spec_from_file_location('sol_v5_runtime',CTRL/'runtime-probes.py');SUT=importlib.util.module_from_spec(spec);spec.loader.exec_module(SUT)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def dump(p,v):
 with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
 root=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a1v5-extra-owner-'));SUT.HERE=REPORT
 results=[]
 for mode in ('gate-timestamp-regression','worker-ledger-scalar-mismatch'):
  r,rows=SUT.run(root,mode,['node','scripts/ui-checks/access-history.mjs','--case=contract-core'],mode,120)
  assert not r['timeout'] and r['observerHealthy'] and r['faultTriggered'] and r['quiescenceObserved']
  if mode=='gate-timestamp-regression':
   assert r['rc']==0;terminal=json.loads(r['output']);assert terminal['status']=='PASS';path=Path(terminal['manifestPath']);final=json.loads(path.read_text(encoding='utf-8'))
   delivered=[v['value'] for v in rows if v['type']=='clock-value-delivered-to-sut'];assert len(delivered)==1
   process=final['adjudication']['process'];assert process['logFinishAtMs']['stdout']==delivered[0] and delivered[0]<process['closeAtMs']
   try:SUT.EXTRA.process_receipt(process,True)
   except ValueError as error:rejection=str(error)
   else:raise AssertionError('Invalid adjudicator clock accepted by receipt validator')
   gate=[str(PY),'-X','utf8','-B',str(CTRL/'gate-evidence.py'),'--execution-sha',sha(CTRL/'execution.json'),'--baseline-sha',sha(CTRL/'baseline.json'),'--final',str(path)]
   fixed,_=SUT.run(root,'gate-timestamp-regression-fixed-final',gate,None,30);assert fixed['rc']==1
   results.append({'mode':mode,'finding':'OWNER_PUBLISHES_PASS_WITH_INVALID_GATE_CLOCK_FIXED_FINAL_REJECTS','owner':r,'actualFinal':str(path),'callbackScalarTime':delivered[0],'closeTime':process['closeAtMs'],'independentReceiptError':rejection,'fixedFinal':fixed})
  else:
   assert r['rc']==1 and r['failureCode']=='A1_GATE_REJECTED'
   dirs=[Path(v['result']) for v in rows if v['type']=='directory-created' and Path(v['result']).parent==SUT.REPO/'artifacts/captures/phase3/access-history-contract-core'];assert len(dirs)==1
   partial=json.loads((dirs[0]/'owner-failure.json').read_text(encoding='utf-8'));assert partial['cleanup']['tempRemoved'] is True
   temps=[Path(v['result']) for v in rows if v['type']=='directory-created' and 'shiftmgmt-gemini-32v-' in str(v.get('prefix',''))];assert len(temps)==1 and not temps[0].exists()
   assert any(v.get('marker')=='SOL_V5_CALLBACK_LEDGER_CLONE_CORRUPTION' for v in rows)
   try:SUT.EXTRA.process_receipt(partial['worker'],False)
   except ValueError as error:rejection=str(error)
   else:raise AssertionError('Corrupted ledger accepted')
   results.append({'mode':mode,'finding':'PRE_REMOVAL_LEDGER_MISMATCH_NOT_DETECTED_TEMP_DELETED_BEFORE_GATE_REJECTION','owner':r,'failurePath':str(dirs[0]/'owner-failure.json'),'failure':partial,'independentReceiptError':rejection,'deletedOwnedTemp':str(temps[0])})
 dump(root/'extra-result.json',{'status':'ACTUAL_OWNER_FAILURES_REPRODUCED','results':results,'retention':'Keep exact controlled run and own fixtures; no foreign cleanup'})
 dump(REPORT/'extra-owner-summary.json',{'status':'ACTUAL_OWNER_FAILURES_REPRODUCED','artifact':str(root),'findings':[r['finding'] for r in results]})
 print(json.dumps({'status':'ACTUAL_OWNER_FAILURES_REPRODUCED','artifact':str(root),'count':len(results)}))
if __name__=='__main__':main()
