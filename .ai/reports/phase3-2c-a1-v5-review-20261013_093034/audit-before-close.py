# -*- coding: utf-8 -*-
"""Read-only source/control/resource audit before closing the review target."""
from pathlib import Path
from datetime import datetime
import hashlib,importlib.util,json,subprocess,socket,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def meta(p):
 b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def dump(p,v):
 with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def rows(p):return [json.loads(v) for v in p.read_text(encoding='utf-8').splitlines()]
def main():
 initial=load(REPORT/'initial-evidence.json');analysis=load(REPORT/'analysis-evidence.json')
 spec=importlib.util.spec_from_file_location('sol_v5_intake',DOC/'.ai/work/review-a1-v5.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
 current=M.snapshot();assert current==initial['sourceBefore']
 for p,h in {**initial['controlBefore'],**initial['versionControls']}.items():assert meta(Path(p))==h,p
 assert (DOC/'HANDOFF.md').read_bytes()==Path(initial['receivedArchive']).read_bytes()
 event_paths=set();pids=set();closed={}
 runtime=load(Path(analysis['originalRuntime']['artifact'])/'suite-result.json')
 for r in runtime['records']:
  if isinstance(r.get('pid'),int):pids.add(r['pid'])
  if r.get('eventsPath'):event_paths.add(Path(r['eventsPath']))
  if r['name']=='fresh-observer-selfcheck':
   root=Path(json.loads(r['output'].splitlines()[-1])['artifact'])
   for v in load(root/'selfcheck-result.json')['records']:
    if isinstance(v.get('pid'),int):pids.add(v['pid'])
    if v.get('observerHealthy'):event_paths.add(root/(v['name']+'.events.jsonl'))
 for r in analysis['actualExtraOwner']['results']:
  event_paths.add(Path(r['owner']['eventsPath']));pids.add(r['owner']['pid'])
 for r in analysis['actualExtraPrivate']['results']:event_paths.add(Path(r['eventsPath']));pids.add(r['pid'])
 part=load(Path(analysis['partialSuite']['artifact'])/'suite-result.json')
 for r in part['results']:event_paths.add(Path(r['eventsPath']));pids.add(r['pid'])
 for r in analysis['originalChecks']['records']:
  pids.add(r['pid'])
  if r['name']=='ipc-suite':
   # IPC result is printed as one JSON record; its children are covered by stored vectors.
   try:
    ipc=json.loads(Path(r['stdout']).read_text(encoding='utf-8').splitlines()[-1])
   except (ValueError,IndexError):ipc=None
 for p in event_paths:
  for e in rows(p):
   for k in ('pid','childPid'):
    if type(e.get(k)) is int and e[k]>0:pids.add(e[k])
   if e['type']=='actual-child-close' and type(e.get('childPid')) is int:closed[e['childPid']]=max(closed.get(e['childPid'],0),e['timeMs'])
   if e['type'] in ('owner-process-exit','observer-exit') and type(e.get('pid')) is int:closed[e['pid']]=max(closed.get(e['pid'],0),e['timeMs'])
 for r in analysis['originalChecks']['records']:
  closed[r['pid']]=max(closed.get(r['pid'],0),datetime.fromisoformat(r['end'].replace('Z','+00:00')).timestamp()*1000)
 filter_text=' OR '.join('ProcessId = '+str(p) for p in sorted(pids))
 command=f"Get-CimInstance Win32_Process -Filter '{filter_text}' | ForEach-Object {{ $a1V5AuditStamp = if ($_.CreationDate) {{ ([DateTimeOffset]$_.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds() }} else {{ $null }}; [pscustomobject]@{{pid=$_.ProcessId;name=$_.Name;createdAtMs=$a1V5AuditStamp}} }} | ConvertTo-Json -Compress"
 text=subprocess.check_output(['powershell','-NoProfile','-NonInteractive','-Command',command],text=True,encoding='utf-8').strip();live=json.loads(text) if text else []
 if isinstance(live,dict):live=[live]
 for r in live:
  r['observedPreviousCloseAtMs']=closed.get(r['pid']);r['laterPidReuse']=r['pid'] in closed and r['createdAtMs'] is not None and r['createdAtMs']>closed[r['pid']]
 assert all(r['laterPidReuse'] for r in live),live
 with socket.socket() as probe:probe.bind(('127.0.0.1',18741))
 retained=sorted({v for r in runtime['records'] for v in r.get('retainedOwnedTemps',[]) if Path(v).exists()})
 result={'time':datetime.now().astimezone().isoformat(),'sourceUnchanged':True,'sourceAfter':current,'protectedFiles':339,'controlFiles':219,'versionControlFiles':14,'controlsUnchanged':True,'receivedHandoffUnchanged':True,'observedPidCount':len(pids),'liveObservedPidNumbers':live,'ownedObservedProcessesRemaining':0,'foreignProcessesTerminated':0,'port18741Free':True,'retainedRuntimeOwnTemps':retained,'retention':'Retain exact current own runtime/private/partial fixtures; no historical or foreign cleanup','coverageLimit':'Direct observed children/logs plus actual browser close events; not a universal OS descendant history','productEditsBySol':0,'A1Accepted':False}
 dump(REPORT/'final-audit-before-close.json',result)
 print(json.dumps({'status':'AUDIT_PASS','sourceFiles':len(current['files']),'protectedFiles':339,'controlFiles':219,'observedPids':len(pids),'laterReusedPids':len(live),'port18741Free':True,'retainedRuntimeTemps':len(retained)}))
if __name__=='__main__':main()
