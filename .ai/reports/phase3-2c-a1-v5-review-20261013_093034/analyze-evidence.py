# -*- coding: utf-8 -*-
"""Consolidate actual review evidence without changing validation targets."""
from pathlib import Path
import hashlib,importlib.util,json,sys,socket
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;CTRL=DOC/'.ai/contracts/phase3-2c-a1-v5'
spec=importlib.util.spec_from_file_location('sol_v5_runtime',CTRL/'runtime-probes.py');R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def dump(p,v):
 with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def events(r):return [json.loads(v) for v in Path(r['eventsPath']).read_text(encoding='utf-8').splitlines()] if r.get('eventsPath') else []
def failure(r):
 rows=events(r);receipt=R.terminal_receipt(r);root=R.REPO/'artifacts/captures/phase3'/('access-history-'+receipt['case'])
 paths=[Path(v['result']) for v in rows if v['type']=='directory-created' and Path(v['result']).parent==root]
 assert len(paths)==1;return load(paths[0]/'owner-failure.json'),paths[0]
def main():
 checks=load(REPORT/'check-results.json');runtime_root=Path(checks['runtimeSummary']['artifact']);runtime=load(runtime_root/'suite-result.json');records=runtime['records'];faults=[r for r in records if r['name'].startswith('fault-')]
 assert runtime['status']=='FAIL' and len(records)==81 and len(faults)==46
 failed=[r for r in faults if r.get('acceptedNegative') is False];assert {r['name'] for r in failed}=={'fault-worker-close-receipt','fault-server-close-receipt'}
 messages=[]
 for r in failed:
  rows=events(r);partial,run=failure(r);mode=r['mode'];stderr=(run/'adjudicator-stderr.log').read_text(encoding='utf-8')
  assert r['rc']==1 and r['failureCode']=='A1_GATE_REJECTED' and r['observerHealthy'] and r['faultTriggered'] and r['quiescenceObserved']
  assert R.rich_failure(partial,r,rows,mode) and partial['errors']['primary']['stack']==R.terminal_receipt(r)['error']['stack']
  assert 'Observation flag differs from callback ledger' in stderr and R.GATE_REASONS[mode] not in stderr
  messages.append({'case':r['name'],'code':r['failureCode'],'expected':R.GATE_REASONS[mode],'actual':'Observation flag differs from callback ledger','path':str(run/'adjudicator-stderr.log'),'allOtherOriginalNegativeChecksPass':True,'rejectedByActualGate':True})
 spawn=[]
 for kind in ('server','worker','gate'):
  r=next(x for x in faults if x['name']=='fault-'+kind+'-spawn-error');partial,run=failure(r);process=partial['adjudicator' if kind=='gate' else kind]
  actual=[e['error'] for e in process['callbackEvents'] if e['event']=='error'];assert len(actual)==1
  primary=partial['errors']['primary'];assert primary['stack']!=actual[0]['stack'] and primary['message']!=actual[0]['message']
  assert process['pid'] is None and process['createdAtMs'] is None and process['exitCode'] is None and process['exitSeen'] is False
  spawn.append({'kind':kind,'failurePath':str(run/'owner-failure.json'),'primary':primary,'actualSpawnError':actual[0],'actualSpawnErrorLostAsPrimary':True,'actualMissingExitPreserved':True})
 positives=[r for r in records if r['name'].startswith(('positive-','observed-positive-')) and '-final-' not in r['name']];assert len(positives)==6
 captures=[];candidate_writes=[]
 for r in positives:
  manifest=load(Path(json.loads(r['output'])['manifestPath']));run=Path(manifest['owner']['context']['runDir'])
  for item in manifest['artifacts']:
   if item['path'].endswith('.png'):
    path=Path(item['path']);data=path.read_bytes();assert len(data)==item['bytes'] and sha(path)==item['sha256'];dimensions=R.EXTRA if False else None
    specg=importlib.util.spec_from_file_location('sol_v5_gate',CTRL/'gate-evidence.py');G=importlib.util.module_from_spec(specg);specg.loader.exec_module(G)
    dims=G.V1.png_dimensions(data);assert dims[0]==1440 and dims[1]>=900
    captures.append({'case':manifest['case'],'observed':r['mode'] is not None,'path':str(path),'bytes':len(data),'sha256':item['sha256'],'dimensions':dims})
  if r.get('mode'):
   rows=events(r);path=str(run/'owner-candidate.json');candidate_writes.append({'case':manifest['case'],'events':[v for v in rows if v.get('path')==path or v.get('to')==path or v.get('destination')==path]})
 assert len(captures)==12
 partial_summary=json.loads(Path(next(r['stdout'] for r in checks['records'] if r['name']=='partial-suite')).read_text(encoding='utf-8').splitlines()[-1]);partial_root=Path(partial_summary['artifact']);part=load(partial_root/'suite-result.json');assert part['status']=='PASS' and len(part['results'])==7 and all(r['accepted'] for r in part['results'])
 owner=load(Path(load(REPORT/'extra-owner-summary.json')['artifact'])/'extra-result.json')
 private_summary=json.loads((REPORT/'extra-actual-private.stdout.txt').read_text(encoding='utf-8').splitlines()[-1]);private=load(Path(private_summary['artifact'])/'suite-result.json')
 submitted=load(Path(load(REPORT/'initial-evidence.json')['submittedRuntime'])/'suite-result.json');assert submitted['status']=='FAIL' and len(submitted['records'])==81
 with socket.socket() as probe:probe.bind(('127.0.0.1',18741))
 summary={'verdict':'FAILED','A1Accepted':False,'originalRuntime':{'artifact':str(runtime_root),'status':'FAIL','records':81,'faults':46,'acceptedByUnchangedSuite':44,'messageMismatchCases':messages,'semanticActualGateRejections':46,'semanticRejectionsAreNotOriginalSuitePass':True},'submittedRuntime':{'status':submitted['status'],'records':len(submitted['records']),'failedNegatives':[r['name'] for r in submitted['records'] if r.get('acceptedNegative') is False]},'originalChecks':checks,'spawnErrorFirstStack':spawn,'captures':captures,'observedCandidateWriteEvents':candidate_writes,'actualExtraOwner':owner,'actualExtraPrivate':private,'partialSuite':{'artifact':str(partial_root),'status':'PASS','modes':7},'port18741Free':True,'productEditsBySol':0,'full919Rerun':False,'A2Accepted':False,'BAuthorized':False,'retention':'Retain own current artifacts/fault fixtures; no foreign/historical deletion'}
 dump(REPORT/'analysis-evidence.json',summary)
 print(json.dumps({'verdict':'FAILED','runtimeOriginal':'FAIL','faults':46,'acceptedOriginal':44,'controlMessageMismatches':2,'actualOwnerExtra':2,'actualPrivateExtra':3,'actualSyntheticSpawnPrimaries':3,'positiveCaptures':12,'dimensions':sorted(set(tuple(c['dimensions']) for c in captures))}))
if __name__=='__main__':main()
