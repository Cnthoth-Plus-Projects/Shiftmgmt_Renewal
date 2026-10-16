# -*- coding: utf-8 -*-
"""Timed actual owner runs with explicit controlled callback faults; no OS-error claim."""
from pathlib import Path
import importlib.util,json,tempfile,sys,hashlib
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;CTRL=REPORT.parent.parent.parent/'.ai/contracts/phase3-2c-a1-v6'
spec=importlib.util.spec_from_file_location('sol_v6_runtime',CTRL/'runtime-probes.py');R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest().upper()
def dump(path,value):
 with path.open('x',encoding='utf-8') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
 root=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a1v6-extra-owner-'));R.HERE=REPORT;results=[]
 for mode in ('late-child-before-removal','late-child-gate','late-log-gate','late-child-gate-failure'):
  record,rows=R.run(root,mode,['node','scripts/ui-checks/access-history.mjs','--case=contract-core'],mode,120)
  assert not record['timeout'] and record['observerHealthy'] and record['quiescenceObserved'] and record['faultTriggered']
  deliveries=[v for v in rows if v['type']=='controlled-late-error-delivery'];assert len(deliveries)==1
  runs=[Path(v['result']) for v in rows if v['type']=='directory-created' and Path(v['result']).parent==R.REPO/'artifacts/captures/phase3/access-history-contract-core'];assert len(runs)==1
  directory=runs[0];candidate=load(directory/'owner-candidate.json');kind=deliveries[0]['kind']
  actual=[v for v in rows if v['type']==('actual-child-error' if kind=='child' else 'actual-log-error') and v.get('message')==deliveries[0]['message']];assert len(actual)==1
  removal=next(v for v in rows if v['type']=='owned-temp-remove-complete');assert candidate['server']['callbackEvents'] and len(candidate['server']['callbackEvents'])==7
  if mode=='late-child-before-removal':assert deliveries[0]['seq']<removal['seq']
  else:assert removal['seq']<deliveries[0]['seq']
  if mode!='late-child-gate-failure':
   assert record['rc']==0 and json.loads(record['output'])['status']=='PASS';final_path=Path(json.loads(record['output'])['manifestPath']);final=load(final_path)
   assert final['errors']['primary'] is None and len(final['server']['callbackEvents'])==7
   gate=[str(PY),'-X','utf8','-B',str(CTRL/'gate-evidence.py'),'--execution-sha',sha(CTRL/'execution.json'),'--baseline-sha',sha(CTRL/'baseline.json'),'--final',str(final_path)]
   fixed,_=R.run(root,mode+'-fixed-final',gate,None,30);assert fixed['rc']==0
   results.append({'mode':mode,'finding':'LATE_CONTROLLED_ERROR_IGNORED_OWNER_AND_FIXED_FINAL_PASS','delivery':deliveries[0],'actualErrorEvent':actual[0],'tempRemoval':removal,'owner':record,'candidatePath':str(directory/'owner-candidate.json'),'finalPath':str(final_path),'cachedServerEvents':7,'fixedFinal':fixed})
  else:
   assert record['rc']==1;failure_path=directory/'owner-failure.json';failure=load(failure_path)
   assert failure['errors']['primary']['stack']==deliveries[0]['stack'] and len(failure['server']['callbackEvents'])==7
   assert any('adjudicator-response'==e.get('phase') for e in failure['errors']['unexpected'])
   results.append({'mode':mode,'finding':'FAILURE_REUSES_STALE_SUCCESS_CACHE_AND_OMITS_LATE_CALLBACK','delivery':deliveries[0],'actualErrorEvent':actual[0],'owner':record,'failurePath':str(failure_path),'failure':failure,'cachedServerEvents':7})
 result={'status':'ACTUAL_LATE_ERROR_GAPS_REPRODUCED','proof':'Real unchanged owner with explicitly injected child/log EventEmitter callbacks; these are controlled faults, not spontaneous OS errors','results':results,'productEditsBySol':0,'retention':'Retain own exact runs; no foreign/historical cleanup'}
 dump(root/'extra-result.json',result);dump(REPORT/'extra-owner-summary.json',{'status':result['status'],'artifact':str(root),'count':len(results),'findings':[r['finding'] for r in results]})
 print(json.dumps({'status':result['status'],'artifact':str(root),'count':len(results)}))
if __name__=='__main__':main()
