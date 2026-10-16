# -*- coding: utf-8 -*-
"""Archive received v7 unchanged and inspect immutable targets, no product writes."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import difflib, hashlib, importlib.util, json, sys
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7';PREP=DOC/'.ai/reports/phase3-2c-a1-v7-replan'
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
    now=datetime.now(timezone(timedelta(hours=9)));stamp=now.strftime('%Y%m%d_%H%M%S')
    report=DOC/'.ai/reports'/('phase3-2c-a1-v7-review-'+stamp);report.mkdir()
    received=(DOC/'HANDOFF.md').read_bytes();archive=DOC/'Log'/(stamp+'_3-2c-A1-v7-Gemini_수신원본.md')
    with archive.open('xb') as f:f.write(received)
    assert archive.read_bytes()==received
    dispatch=json.loads((PREP/'dispatch.json').read_text(encoding='utf-8'));sent=Path(dispatch['sentArchive']['path']).read_bytes()
    marker='\r\n## 회신\r\n'.encode('utf-8');assert sent.count(marker)==received.count(marker)==1
    assert sent.split(marker)[0]==received.split(marker)[0]
    s=importlib.util.spec_from_file_location('v7_prepare_intake',DOC/'.ai/work/prepare-a1-v7.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
    source=m.snapshot();baseline=json.loads((CTRL/'baseline.json').read_text(encoding='utf-8'))
    assert all(source[k]==baseline[k] for k in ('repository','head','branch','status'))
    changes={n:{'before':baseline['files'].get(n),'after':source['files'].get(n)} for n in set(source['files'])|set(baseline['files']) if source['files'].get(n)!=baseline['files'].get(n)}
    assert set(changes)==set(baseline['allowed'])
    for p,h in baseline['control'].items():assert meta(Path(p))==h,p
    assert all(v['after']['bytes']<=30000 for v in changes.values())
    shared=(REPO/'scripts/ui-checks/access-history-shared.mjs').read_bytes();a=shared.index(b'export const CANONICAL_8_ACTIONS =');z=shared.index(b'export async function performWorkerIpcHandshake',a)
    frozen=shared[a:z];assert len(frozen)==6575 and hashlib.sha256(frozen).hexdigest().upper()=='502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1'
    copies=report/'received-product';copies.mkdir();diffs={}
    for name in ('access-history.mjs','access-history-shared.mjs'):
        b=(REPO/'scripts/ui-checks'/name).read_bytes()
        with (copies/name).open('xb') as f:f.write(b)
        lines=list(difflib.unified_diff((PREP/'received-product'/name).read_text(encoding='utf-8').splitlines(),b.decode('utf-8').splitlines(),fromfile='received-v6/'+name,tofile='received-v7/'+name,lineterm=''))
        with (report/(Path(name).stem+'.diff')).open('x',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
        diffs[name]={'added':sum(l.startswith('+') and not l.startswith('+++') for l in lines),'removed':sum(l.startswith('-') and not l.startswith('---') for l in lines),'hunks':sum(l.startswith('@@') for l in lines)}
    evidence={'time':now.isoformat(),'receivedArchive':str(archive),'received':meta(archive),'requestUnchanged':True,'requestBytes':len(received.split(marker)[0]),'sourceBefore':source,'changedSource':changes,'controlBefore':baseline['control'],'versionControls':{str(p):meta(p) for p in CTRL.iterdir() if p.is_file()},'frozen':{'bytes':len(frozen),'sha256':hashlib.sha256(frozen).hexdigest().upper()},'diffs':diffs,'submittedEvidence':r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-gemini-a1v7-evidence-n52y76tx\implementation-result.json','directFixDecision':{'path':str(DOC/'.ai/decisions/DEC-002.md'),**meta(DOC/'.ai/decisions/DEC-002.md')},'productEditsBySol':0,'counterReset':0}
    dump(report/'initial-evidence.json',evidence)
    print(json.dumps({'status':'INTAKE_PASS','report':str(report),'received':meta(archive),'changed':list(changes),'controls':len(baseline['control']),'diffs':diffs},ensure_ascii=False))
if __name__=='__main__':main()
