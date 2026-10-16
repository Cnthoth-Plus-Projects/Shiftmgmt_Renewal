# -*- coding: utf-8 -*-
import hashlib,json,pathlib,re,subprocess
C=pathlib.Path(r'C:/Projects/Active/교대근무관리 시스템')
R=pathlib.Path(r'C:/Projects/Active/ShiftMgmt_V4')
O=C/'.ai/reports/verification-3-1c-correct1-20260930'
text=(C/'HANDOFF.md').read_text(encoding='utf-8-sig')
body,reply=re.split(r'^## 회신\s*$',text,maxsplit=1,flags=re.M)
sent=(C/'Log/20260930_131505_3-1c-Sol-CORRECT1_발송본.md').read_text(encoding='utf-8-sig')
sentBody=re.split(r'^## 회신\s*$',sent,maxsplit=1,flags=re.M)[0]
sh=lambda data:hashlib.sha256(data).hexdigest().upper()
fsh=lambda p:sh(p.read_bytes()) if p.is_file() else 'ABSENT'
rows=[x.split('\t') for x in body.split('## 12.')[1].split('## 13.')[0].splitlines() if re.match(r'^[ MADRCU?!]{2} .+\t(?:[A-F0-9]{64}|ABSENT)$',x)]
allowed={'src/web/screens/home.ts','scripts/ui-checks/home.mjs'}
protected=[{'path':x[0][3:],'expected':x[1],'actual':fsh(R/x[0][3:])} for x in rows if x[0][3:] not in allowed]
status=subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4','-c','core.quotepath=false','status','--short','--untracked-files=all'],cwd=R).decode('utf-8').splitlines()
controls=[{'path':p,'expected':s,'actual':fsh(C/p)} for p,s in re.findall(r'^\| `([^`]+)` \| `([A-F0-9]{64}|ABSENT)` \|$',body.split('## 13.')[1],re.M)]
docs=[{'path':p,'expectedBytes':int(size),'bytes':(C/p).stat().st_size,'expectedSHA':s,'sha256':fsh(C/p)} for p,size,s in re.findall(r'^\| `([^`]+)` \| (\d+) \| `([A-F0-9]{64})` \|$',body.split('## 3.')[1].split('## 4.')[0],re.M)]
reported=set(re.findall(r'artifacts/captures/phase3/[^\s)]+/manifest.json',reply))
manifest_results=[]
for relative in sorted(reported):
 p=R/relative
 d=json.loads(p.read_text(encoding='utf-8-sig'))
 captures=d.get('captures',[])
 checks=[]
 for item in captures:
  val=item.get('path',item.get('file')) if isinstance(item,dict) else item
  if isinstance(val,str):
   q=pathlib.Path(val)
   choices=[q] if q.is_absolute() else [R/q,p.parent/q]
   checks.append(any(q.is_file() for q in choices))
 manifest_results.append({'path':relative,'status':d.get('status'),'captureCount':len(captures),'captureExistence':checks,'assertionFields':sorted(k for k in d if 'assert' in k.lower())})
recent=[]
for p in (R/'artifacts/captures/phase3').rglob('manifest.json'):
 if not re.match(r'run-20260930-13\d{4}-',p.parent.name):continue
 d=json.loads(p.read_text(encoding='utf-8-sig'))
 recent.append({'path':p.relative_to(R).as_posix(),'status':d.get('status'),'mentioned':p.parent.name in reply})
files=[]
backup=pathlib.Path(r'C:/Users/pangyo/AppData/Local/Temp/pre-edit-backup-31c-correct1')
for relative in sorted(allowed):
 p=R/relative;q=backup/p.name
 original=dict((x[0][3:],x[1]) for x in rows)[relative]
 diff=subprocess.run(['git','diff','--no-index','--numstat',str(q),str(p)],capture_output=True,text=True)
 counts=diff.stdout.strip().split('\t')[:2]
 files.append({'path':relative,'bytes':p.stat().st_size,'sha256':fsh(p),'beforeBytes':q.stat().st_size,'beforeSHA':fsh(q),'beforeSHAMatchesPacket':fsh(q)==original,'diffExit':diff.returncode,'diffLineCounts':counts})
result={'requestBodyTextUnchanged':body==sentBody,'baselineRows':len(rows),'currentRows':len(status),'statusSHA':sh('\n'.join(status).encode()),'statusRowsMatch':status==[x[0] for x in rows],'protectedCount':len(protected),'protectedMismatch':[x for x in protected if x['expected']!=x['actual']],'controlCount':len(controls),'controlMismatch':[x for x in controls if x['expected']!=x['actual']],'sourceDocs':docs,'files':files,'reportedManifestCount':len(reported),'reportedManifests':manifest_results,'recentRuns':recent,'unreportedRecentRuns':[x for x in recent if not x['mentioned']]}
(O/'scope-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in {'reportedManifests','recentRuns','sourceDocs'}},ensure_ascii=False))
assert len(rows)==92 and len(protected)==90 and len(controls)==9
assert body==sentBody and status==[x[0] for x in rows]
assert not result['protectedMismatch'] and not result['controlMismatch']
assert len(reported)==26 and all(x['status']=='PASS' for x in manifest_results)
assert all(x['bytes']==x['expectedBytes'] and x['sha256']==x['expectedSHA'] for x in docs)
assert all(x['beforeSHAMatchesPacket'] for x in files)
