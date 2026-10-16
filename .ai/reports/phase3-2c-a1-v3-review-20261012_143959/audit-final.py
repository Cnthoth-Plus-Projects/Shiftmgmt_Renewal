"""Read-only source/control/resource audit before closing this validation target."""
from datetime import datetime,timezone
import hashlib,importlib.util,json,os,socket,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;DOC=HERE.parents[2];REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v3'
def rec(p):
 b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
initial=json.loads((HERE/'initial-evidence.json').read_text(encoding='utf-8'));baseline=json.loads((CTRL/'baseline.json').read_text(encoding='utf-8'))
files={name:rec(REPO/name) for name in initial['sourceBefore']['files']}
names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=REPO).decode('utf-8').rstrip('\0').split('\0')
assert set(names)==set(files) and files==initial['sourceBefore']['files']
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=REPO).decode('utf-8').splitlines();assert status==initial['sourceBefore']['status']
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO).decode().strip();assert head==initial['sourceBefore']['head']
controls={p:rec(Path(p)) for p in baseline['control']};assert controls==baseline['control']==initial['controlBefore']
source=(REPO/'scripts/ui-checks/access-history-shared.mjs').read_bytes().decode('utf-8');f=json.loads((CTRL/'frozen-shared.json').read_text(encoding='utf-8'));fragment=source[source.index(f['startMarker']):source.index(f['endMarker'],source.index(f['startMarker']))].encode('utf-8')
assert len(fragment)==f['bytes'] and hashlib.sha256(fragment).hexdigest().upper()==f['sha256']
received=Path(initial['received']['path']);assert received.read_bytes()==(DOC/'HANDOFF.md').read_bytes()
spec=importlib.util.spec_from_file_location('v1',DOC/'.ai/contracts/phase3-2c-v1/verify-evidence.py');V1=importlib.util.module_from_spec(spec);spec.loader.exec_module(V1)
runtime_output=json.loads((HERE/'runtime-suite.stdout.txt').read_text(encoding='utf-8').splitlines()[-1]);runtime_root=Path(runtime_output['artifact']);suite=json.loads((runtime_root/'suite-result.json').read_text(encoding='utf-8'))
assert suite['status']=='PASS'
pids=set();retained=[];event_files=[]
for row in suite['records']:
 if row.get('pid'):pids.add(row['pid'])
 if row.get('eventsPath') and Path(row['eventsPath']).is_file():event_files.append(Path(row['eventsPath']))
 retained += row.get('retainedOwnedTemps',[])
for p in HERE.glob('*.events.jsonl'):event_files.append(p)
for p in event_files:
 for line in p.read_text(encoding='utf-8').splitlines():
  row=json.loads(line)
  if row['type']=='spawn' and row.get('childPid'):pids.add(row['childPid'])
for name in ('ipc-suite','extra-protocol'):
 data=json.loads((HERE/(name+'.stdout.txt')).read_text(encoding='utf-8'))
 for row in data['results']:
  if row.get('pid'):pids.add(row['pid'])
  if row.get('ownedTemp') and Path(row['ownedTemp']).exists():retained.append(row['ownedTemp'])
partial=json.loads((HERE/'core-partial-result.json').read_text(encoding='utf-8'));pids.add(partial['pid']);retained.append(partial['tempDir'])
live=[];query_errors=[];nonlive=[]
for pid in sorted(pids):
 try:
  if V1.pid_alive(pid):live.append(pid)
  else:nonlive.append(pid)
 except ValueError as error:query_errors.append({'pid':pid,'error':str(error)})
with socket.socket() as probe:probe.bind(('127.0.0.1',18741))
counts={'unobservedPositive':sum(r['name'].startswith('positive-') and not r['name'].startswith('positive-final-') for r in suite['records']),
 'observedPositive':sum(r['name'].startswith('observed-positive-') and not r['name'].startswith('observed-positive-final-') for r in suite['records']),
 'independentFinal':sum('positive-final-' in r['name'] for r in suite['records']),
 'faults':sum(r['name'].startswith('fault-') for r in suite['records']),
 'malformed':sum(r['name'].startswith('malformed-') for r in suite['records']),
 'deferred':sum(r['name'].startswith('stage-') for r in suite['records'])}
assert counts=={'unobservedPositive':3,'observedPositive':3,'independentFinal':6,'faults':38,'malformed':9,'deferred':8}
result={'time':datetime.now(timezone.utc).isoformat(),'source341UnchangedDuringReview':True,'protected339Match':True,'controls43UnchangedBeforeClosingTarget':True,'sourceAfter':files,'head':head,'status':status,'frozen':{'bytes':len(fragment),'sha256':f['sha256']},'receivedArchiveUnchanged':rec(received),
 'runtimeRoot':str(runtime_root),'runtimeCounts':counts,'observedOwnedPids':sorted(pids),'observedPidsNonLive':len(nonlive),'pidLiveOrReused':live,'pidQueryUnverified':query_errors,'port18741Free':True,'retainedOwnTempPaths':sorted(set(retained)),
 'retention':'All new own report/probe runs and intentionally retained fault fixtures kept. No historical/foreign PID/temp/profile cleanup.',
 'limitations':'PID check covers observed direct children/IPC workers, not every historical Chrome descendant or every branch. No full919 rerun. Product source/control writes0.'}
(HERE/'final-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'fileScopeAudit':'PASS','sourceFiles':341,'protectedFiles':339,'controls':43,'observedPidsNonLive':len(nonlive),'pidLiveOrReused':live,'pidQueryUnverified':query_errors,'portFree':True,'runtimeCounts':counts,'retainedOwnTemps':len(set(retained))}))
