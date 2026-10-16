# -*- coding: utf-8 -*-
"""Prepare new Sol controls from immutable v6; product source is read-only."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib, json, subprocess, yaml
DOC = Path(r'C:\Projects\Active\교대근무관리 시스템')
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
OLD = DOC / '.ai/contracts/phase3-2c-a1-v6'
NEW = DOC / '.ai/contracts/phase3-2c-a1-v7'
REVIEW = DOC / '.ai/reports/phase3-2c-a1-v6-review-20261013_122600'
REPORT = DOC / '.ai/reports/phase3-2c-a1-v7-replan'
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def fresh(p,b):
    with p.open('xb') as f:f.write(b)
def dump(p,v):fresh(p,(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def snapshot():
    def git(*a):return subprocess.check_output(['git',*a],cwd=REPO).decode('utf-8')
    names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
    return {'repository':str(REPO),'head':git('rev-parse','HEAD').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain','--untracked-files=all').splitlines(),'files':{n:meta(REPO/n) for n in sorted(names)}}
def main():
    assert not NEW.exists() and not REPORT.exists()
    final=json.loads((REVIEW/'final-evidence.json').read_text(encoding='utf-8'))
    source=snapshot();assert source==final['sourceAfter']
    received=(DOC/'HANDOFF.md').read_bytes()
    assert meta(DOC/'HANDOFF.md')==final['currentHandoff'] and received==Path(final['closingArchive']['path']).read_bytes()
    stamp=datetime.now(timezone(timedelta(hours=9))).strftime('%Y%m%d_%H%M%S')
    archive=DOC/'Log'/(stamp+'_3-2c-A1-v6-Sol-FAILED_v7재설계전보존.md')
    fresh(archive,received);assert archive.read_bytes()==received
    REPORT.mkdir();NEW.mkdir();(REPORT/'received-product').mkdir()
    for name in ('access-history.mjs','access-history-shared.mjs'):
        fresh(REPORT/'received-product'/name,(REPO/'scripts/ui-checks'/name).read_bytes())
    historical={str(p):meta(p) for root in (DOC/'.ai/contracts').glob('phase3-2c*') for p in root.iterdir() if p.is_file()}
    assert len(historical)==69
    for p in OLD.iterdir():
        if p.is_file() and p.name not in ('baseline.json','execution.json','STRATEGY.md'):
            b=p.read_bytes()
            if p.suffix in ('.py','.mjs'):b=b.replace(b'a1v6',b'a1v7').replace(b'evidence-v6.py',b'evidence-v7.py')
            name='evidence-v7.py' if p.name=='evidence-v6.py' else p.name
            if name=='gate-evidence.py':b=b.replace(b"execution['executionVersion'] == 6",b"execution['executionVersion'] == 7").replace(b"'v6ReceiptRules'",b"'v7ReceiptRules'")
            if name=='observer-selfcheck.py':
                b=b.replace(b'--bootstrap-v5',b'--bootstrap-v6').replace(b'BOOTSTRAP_V5_CONTROL_ONLY_NOT_V6_ACCEPTANCE',b'BOOTSTRAP_V6_CONTROL_ONLY_NOT_V7_ACCEPTANCE')
                b=b.replace(b'A47421706CCBEB6AED76002A88177E592FF743F72A4CED8FE21A7AAD718BE435',b'9E735F3ED1C8DD46D200AED10F53FE5256DFC2459BE87CFFF6C1D5E5F73C4313').replace(b'9813475D58FB5474C9533F532A2E171AB0DFB7977877EB783B3088C0A475069F',b'38D3AF668282BC5B184A59815D5C0726D6F296C5906E428BD7543C4E7CCF7280')
            fresh(NEW/name,b)
    execution=json.loads((OLD/'execution.json').read_text(encoding='utf-8'))
    execution.update(executionVersion=7,frozenSharedPath=str(NEW/'frozen-shared.json'),lateCallbackProbesRequired=15,guardParityInvalidRequired=5,lateCallbackBarriersRequired=['AFTER_CACHE','AFTER_PORT_AWAIT_BEFORE_REMOVE','AFTER_REMOVE','CANDIDATE_STAGE_BEFORE_RENAME','BEFORE_GATE_SPAWN','AFTER_GATE_AWAITS','FINAL_STAGE_BEFORE_RENAME'],failureUsesCurrentProcessSnapshot=True)
    dump(NEW/'execution.json',execution)
    harness=Path(r'C:\Users\pangyo\AppData\Local\AI-Harness')
    index=yaml.safe_load((harness/'POLICY_INDEX.yaml').read_text(encoding='utf-8-sig'))
    assert index['policy_count']==len(index['policies'])==26 and (harness/index['paths']['policies_dir']).is_dir()
    policies=[{'id':p['id'],'path':str(harness/'policies'/p['file'])} for p in index['policies'] if p['id'] in ('P04','P06','P13','P25')]
    assert all(Path(p['path']).is_file() for p in policies)
    dump(REPORT/'initial-evidence.json',{'time':datetime.now(timezone.utc).isoformat(),'sourceBefore':source,'historicalControls':historical,'receivedArchive':str(archive),'received':meta(archive),'previousReview':str(REVIEW/'final-evidence.json'),'requiredPolicies':policies,'counterReset':0,'productEditsBySol':0,'McpSurfaceInspected':True})
    print(json.dumps({'status':'V7_PREPARED_NOT_SEALED','historicalControls':len(historical),'sourceFiles':len(source['files']),'archive':str(archive)},ensure_ascii=False))
if __name__=='__main__':main()
