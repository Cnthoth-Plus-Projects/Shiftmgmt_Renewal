# -*- coding: utf-8 -*-
"""Resolve a pre-relay documentation discrepancy, preserve both packet drafts."""
from datetime import datetime,timedelta,timezone
import hashlib,json,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT=Path(__file__).resolve().parent;CTRL=DOC/'.ai/contracts/phase3-2c-a1-v3'
def record(path):
 data=path.read_bytes();return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest().upper()}
def dump(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
dispatch=json.loads((REPORT/'dispatch.json').read_text(encoding='utf-8'))
assert record(DOC/'HANDOFF.md')=={key:dispatch[key] for key in ('bytes','sha256')}
assert Path(dispatch['outgoingArchive']).read_bytes()==(DOC/'HANDOFF.md').read_bytes()
baseline_path=CTRL/'baseline.json';baseline=json.loads(baseline_path.read_text(encoding='utf-8'))
assert record(baseline_path)['sha256']==dispatch['baselineSha256']
manifest=json.loads((REPORT/'control-manifest.json').read_text(encoding='utf-8'))
strategy_path=CTRL/'STRATEGY.md';old_strategy=manifest[str(strategy_path)];new_strategy=record(strategy_path)
for name,expected in baseline['control'].items():
 if Path(name)!=strategy_path:assert record(Path(name))==expected,'Unexpected control change: '+name
baseline['control'][str(strategy_path)]=new_strategy
old_baseline_sha=dispatch['baselineSha256'];old_baseline_bytes=record(baseline_path)['bytes']
dump(baseline_path,baseline);new_baseline=record(baseline_path)
packet=(DOC/'HANDOFF.md').read_text(encoding='utf-8')
old='loginInputs는 로그인 입력 DOM의 type/ID/name/autocomplete/label 등 원본 계약 속성을 실측한다.'
new='loginInputs는 실제 #login-id와 #login-password DOM 각각의 count/visible을 측정하여 정확히 `{id:{count,visible},password:{count,visible}}`만 기록한다. 원본 CORE-03 밖의 새 속성을 추가하지 않는다.'
assert packet.count(old)==1;packet=packet.replace(old,new)
packet=packet.replace(f'| `STRATEGY.md` | {old_strategy["bytes"]} | `{old_strategy["sha256"]}` |',f'| `STRATEGY.md` | {new_strategy["bytes"]} | `{new_strategy["sha256"]}` |')
packet=packet.replace(f'| `baseline.json` | {old_baseline_bytes} | `{old_baseline_sha}` |',f'| `baseline.json` | {new_baseline["bytes"]} | `{new_baseline["sha256"]}` |')
packet=packet.replace(old_baseline_sha,new_baseline['sha256'])
assert old_baseline_sha not in packet and old_strategy['sha256'] not in packet
# The original generation script contains the embedded, corrected strategy on future runs.
(DOC/'HANDOFF.md').write_text(packet,encoding='utf-8')
(REPORT/'HANDOFF.preview.md').write_bytes((DOC/'HANDOFF.md').read_bytes())
stamp=datetime.now(timezone(timedelta(hours=9)))
archive=DOC/('Log/'+stamp.strftime('%Y%m%d_%H%M%S')+'_3-2c-A1-v3-Sol-IMPLEMENT_최종발송원본.md')
with archive.open('xb') as h:h.write((DOC/'HANDOFF.md').read_bytes())
assert archive.read_bytes()==(DOC/'HANDOFF.md').read_bytes()
body=packet.split('\n## 회신\n',1)[0].encode('utf-8')
dispatch['priorPreparedPacket']={key:dispatch[key] for key in ('bytes','sha256','baselineSha256','outgoingArchive')}
dispatch.update(**record(DOC/'HANDOFF.md'),outgoingArchive=str(archive),requestBodyBytes=len(body),requestBodySha256=hashlib.sha256(body).hexdigest().upper(),baselineSha256=new_baseline['sha256'])
dispatch['preRelayClarification']='CORE-03 loginInputs exact count/visible only; no added product requirement'
dump(REPORT/'dispatch.json',dispatch)
manifest={str(p):record(p) for p in sorted(CTRL.iterdir()) if p.is_file()};dump(REPORT/'control-manifest.json',manifest)
argv=[sys.executable,'-B',str(CTRL/'gate-evidence.py'),'--execution-sha',dispatch['executionSha256'],'--baseline-sha',dispatch['baselineSha256'],'--scope']
scope=subprocess.run(argv,cwd=REPO,capture_output=True,text=True,encoding='utf-8',timeout=30);assert scope.returncode==0,scope.stderr
result=json.loads(scope.stdout);assert result['result']['changedAllowed']==[]
initial=json.loads((REPORT/'initial-evidence.json').read_text(encoding='utf-8'))
for name,expected in initial['originalControls'].items():assert record(Path(name))==expected
for name,expected in baseline['files'].items():assert record(REPO/name)==expected
final=json.loads((REPORT/'final-evidence.json').read_text(encoding='utf-8'))
final.update(scope=result,dispatch=dispatch,preRelaySpecificationCorrected=True)
dump(REPORT/'final-evidence.json',final)
print(json.dumps({'status':'READY_TO_CODE_USER_RELAY_PENDING','handoff':record(DOC/'HANDOFF.md'),'baseline':new_baseline,'source341Unchanged':True,'originalControlsUnchanged':True,'scope':result},ensure_ascii=False))
