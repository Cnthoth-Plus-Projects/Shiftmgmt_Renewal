# -*- coding: utf-8 -*-
from pathlib import Path
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');NEW=DOC/'.ai/contracts/phase3-2c-a1-v6'
def edit(name,pairs):
 p=NEW/name;s=p.read_text(encoding='utf-8')
 for old,new in pairs:
  assert old in s,(name,old[:80]);s=s.replace(old,new)
 p.write_text(s,encoding='utf-8')

edit('gate-evidence.py',[
 ('evidence-v5.py','evidence-v6.py'),('sol_v5_receipts','sol_v6_receipts'),("execution['executionVersion'] == 5","execution['executionVersion'] == 6"),
 ("    measured = worker_final.get('measurement')","    EXTRA.acquisition_checks(raw, worker_final.get('acquisition'))\n    require(worker_final['acquisition']['routeInstalled'] is True, 'Successful worker route installation absent')\n    measured = worker_final.get('measurement')"),
 ("    rows = measured['fixtureRows']","    exact(measured['fixtureRows'], worker_final['acquisition']['fixtureRows'], 'Acquired fixture rows differ from measurement')\n    exact(measured['fixtureRequests'], worker_final['acquisition']['fixtureRequests'], 'Acquired fixture requests differ from measurement')\n    rows = measured['fixtureRows']")])

edit('runtime-preload.mjs',[
 ('let actualWorkerCloseMs=null;','let actualWorkerCloseMs=null,actualServerCloseMs=null,actualGateCloseMs=null,actualWorkerPid=null,actualGatePid=null,cloneFaultDelivered=false;'),
 ("note('file-write',{path:String(file)});\n if(mode===", "note('file-write',{path:String(file),operation:'write'});\n if(mode==='owner-candidate-write-denied'&&path.basename(String(file))==='owner-candidate.json'){trigger({path:String(file)});throw new Error('SOL_A1_CANDIDATE_WRITE_DENIED');}\n if(mode==="),
 ("note('file-write',{path:String(to)});\n if(mode===", "note('file-write',{path:String(to),operation:'rename',from:String(from)});\n if(mode==='owner-candidate-write-denied'&&path.basename(String(to))==='owner-candidate.json'){trigger({path:String(to)});throw new Error('SOL_A1_CANDIDATE_WRITE_DENIED');}\n if(mode==="),
 ("return original.rename(from,to,...args);", "const result=original.rename(from,to,...args);note('file-rename-complete',{from:String(from),path:String(to)});return result;"),
 ("return renamePromise(from,to,...args);", "const result=await renamePromise(from,to,...args);note('file-rename-complete',{from:String(from),path:String(to)});return result;"),
 ("if(path.basename(streamPath)==='worker-stdout.log'&&mode==='timestamp-regression'){", "if((path.basename(streamPath)==='worker-stdout.log'&&mode==='timestamp-regression')||(path.basename(streamPath)==='server-stdout.log'&&mode==='server-timestamp-regression')||(path.basename(streamPath)==='adjudicator-stdout.log'&&mode==='gate-timestamp-regression')){"),
 ("if(event==='finish'&&actualWorkerCloseMs!==null){\n     const supplied=actualWorkerCloseMs-250,previous=Date.now;", "const closeMs=mode==='server-timestamp-regression'?actualServerCloseMs:mode==='gate-timestamp-regression'?actualGateCloseMs:actualWorkerCloseMs;\n    if(event==='finish'&&closeMs!==null){\n     const supplied=closeMs-250,previous=Date.now;"),
 ('actualChildCloseTimeMs:actualWorkerCloseMs','actualChildCloseTimeMs:closeMs'),
 ('const spawnId=++spawnNumber;', 'const spawnId=++spawnNumber;\n  if(!server&&!gate&&!regression)actualWorkerPid=child.pid??null;if(gate)actualGatePid=child.pid??null;'),
 ('if(!server&&!gate&&!regression)actualWorkerCloseMs=realClock();','if(!server&&!gate&&!regression)actualWorkerCloseMs=realClock();if(server)actualServerCloseMs=realClock();if(gate)actualGateCloseMs=realClock();')])
p=NEW/'runtime-preload.mjs';s=p.read_text(encoding='utf-8');s+='''
// Actual log read attempt sequence, and one-shot successful receipt clone corruption.
const instrumentedRead=fs.readFileSync.bind(fs);
fs.readFileSync=function(file,...args){if(/^(worker|server|adjudicator)-(stdout|stderr)\\.log$/.test(path.basename(String(file))))note('log-artifact-read',{path:String(file)});return instrumentedRead(file,...args);};
const actualClone=globalThis.structuredClone;
globalThis.structuredClone=function(value,...options){
 const cloned=actualClone(value,...options),target=mode==='worker-ledger-scalar-mismatch'?actualWorkerPid:mode==='gate-ledger-scalar-mismatch'?actualGatePid:null;
 if(!cloneFaultDelivered&&target!==null&&Array.isArray(value)&&value.length===7&&value[0]?.event==='spawn'&&value[0].pid===target){
  const index=value.findIndex(e=>e.event==='log-finish'&&e.stream==='stdout');
  if(index>=0){cloneFaultDelivered=true;cloned[index].timeMs=value[index].timeMs+1000;trigger({marker:'SOL_A1_RECEIPT_CLONE_CORRUPTION',targetPid:target,actualValue:value[index].timeMs,deliveredValue:cloned[index].timeMs});}
 }
 return cloned;
};
syncBuiltinESMExports();
''';p.write_text(s,encoding='utf-8')

edit('runtime-probes.py',[
 ('evidence-v5.py','evidence-v6.py'),('sol_v5_receipts','sol_v6_receipts'),
 ("'worker-close-receipt':'worker close not confirmed',\n    'server-close-receipt':'server close not confirmed'", "'worker-close-receipt':'Observation flag differs from callback ledger',\n    'server-close-receipt':'Observation flag differs from callback ledger'"),
 ('assert len(FAULT_CODES)==46',"FAULT_CODES.update({'server-timestamp-regression':'A1_LIFECYCLE_INVALID','gate-timestamp-regression':'A1_LIFECYCLE_INVALID','worker-ledger-scalar-mismatch':'A1_LIFECYCLE_INVALID','gate-ledger-scalar-mismatch':'A1_LIFECYCLE_INVALID','owner-candidate-write-denied':'A1_CANDIDATE_WRITE_FAILED'})\nassert len(FAULT_CODES)==51"),
 ("'raw','checks','workerPartialPath','errors','cleanup'", "'raw','checks','workerPartialPath','errors','cleanup','acquisition'"),
 ("try:EXTRA.acquired_checks(partial['raw'],partial['checks'])", "try:\n            EXTRA.acquired_checks(partial['raw'],partial['checks'])\n            EXTRA.acquisition_checks(partial['raw'],partial['acquisition'])"),
 ("    if mode=='timestamp-regression':", "    if mode in ('timestamp-regression','server-timestamp-regression','gate-timestamp-regression'):"),
 ("if len(delivered)!=1 or partial['worker']['logFinishAtMs']['stdout']!=delivered[0]:return False\n        if partial['cleanup'].get('tempRemoved') is not False:return False", "name='server' if mode.startswith('server-') else 'adjudicator' if mode.startswith('gate-') else 'worker'\n        if len(delivered)!=1 or partial[name]['logFinishAtMs']['stdout']!=delivered[0]:return False\n        if name!='adjudicator' and partial['cleanup'].get('tempRemoved') is not False:return False\n    if mode=='worker-ledger-scalar-mismatch':\n        if partial['cleanup'].get('tempRemoved') is not False or any(r.get('gate') for r in rows if r['type']=='spawn'):return False\n    if mode in ('server-spawn-error','worker-spawn-error','gate-spawn-error'):\n        name='server' if mode.startswith('server-') else 'worker' if mode.startswith('worker-') else 'adjudicator'\n        actual=[e['error'] for e in partial[name]['callbackEvents'] if e['event']=='error']\n        if len(actual)!=1 or partial['errors'].get('primary',{}).get('stack')!=actual[0]['stack']:return False"),
 ("'workerPartialPath':None,'errors':{},'cleanup':{}", "'workerPartialPath':None,'errors':{},'cleanup':{},'acquisition':None"),
 ("health_receipt['actualControlChecks']==39 and len(health_receipt['records'])==39", "health_receipt['actualControlChecks']==45 and len(health_receipt['records'])==45"),
 ("'requiredFaultCount':46", "'requiredFaultCount':51"), ("'faults':46", "'faults':51"),
 ("r['acceptedNegative']=ok;good=good and ok", "if any(x.get('gate') for x in rows if x['type']=='spawn') and not observed_artifact_order(rows)[0]:ok=False\n        if mode=='owner-candidate-write-denied':ok=ok and 'SOL_A1_CANDIDATE_WRITE_DENIED' in r['errors']\n        r['acceptedNegative']=ok;good=good and ok"),
 ("not r.get('quiescenceObserved') or len(r['output'].splitlines())", "not r.get('quiescenceObserved') or not observed_artifact_order(rows)[0] or not observed_publication(rows) or len(r['output'].splitlines())")])
p=NEW/'runtime-probes.py';s=p.read_text(encoding='utf-8');marker='def run(folder,name,argv,mode=None,limit=310):'
assert marker in s
extra='''def observed_artifact_order(rows):
    streams={r['path']:r for r in rows if r['type']=='log-stream-created'}
    close_by_role={('server' if r.get('server') else 'adjudicator' if r.get('gate') else 'worker'):r for r in rows if r['type']=='actual-child-close'}
    for read in (r for r in rows if r['type']=='log-artifact-read'):
        stream=streams.get(read['path'])
        role=Path(read['path']).name.split('-')[0]
        child=close_by_role.get(role)
        if not stream or not child or child['seq']>=read['seq']:return False,'Log hash read before actual child close'
        for event in ('actual-log-finish','actual-log-close'):
            values=[r for r in rows if r['type']==event and r.get('streamId')==stream['streamId']]
            if len(values)!=1 or values[0]['seq']>=read['seq']:return False,'Log hash read before actual stream settlement'
    return True,None

def observed_publication(rows):
    for name in ('owner-candidate.json','owner-final.json'):
        writes=[r for r in rows if r['type']=='file-write' and Path(r.get('path','')).name==name]
        complete=[r for r in rows if r['type']=='file-rename-complete' and Path(r['path']).name==name]
        if len(writes)!=1 or writes[0].get('operation')!='rename' or len(complete)!=1:return False
        if Path(complete[0]['from'])!=Path(complete[0]['path']+'.tmp'):return False
        stages=[r for r in rows if r['type']=='file-write' and r.get('operation')=='write' and r.get('path')==complete[0]['from']]
        if len(stages)!=1 or not stages[0]['seq']<writes[0]['seq']<complete[0]['seq']:return False
    return True

'''
s=s.replace(marker,extra+marker);p.write_text(s,encoding='utf-8')

edit('observer-selfcheck.py',[
 ('--bootstrap-v4','--bootstrap-v5'),
 ('642340EDC48A1F7D25EC220BB811EC823402E2A1E434CF8461D58A70BD21875B','A47421706CCBEB6AED76002A88177E592FF743F72A4CED8FE21A7AAD718BE435'),
 ('FC963E330B6290C3E89FDE5ED989A5CE1545F676EC9CEB7D367801BEC59D69DC','9813475D58FB5474C9533F532A2E171AB0DFB7977877EB783B3088C0A475069F'),
 ('BOOTSTRAP_V4_CONTROL_ONLY_NOT_V5_ACCEPTANCE','BOOTSTRAP_V5_CONTROL_ONLY_NOT_V6_ACCEPTANCE')])
print('V6_BASE_CONTROLS_UPGRADED')
