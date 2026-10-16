# -*- coding: utf-8 -*-
"""Sol-owned versioned controls only. Never write product or historical controls."""
import hashlib, json, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
sys.dont_write_bytecode = True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템')
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT=Path(__file__).resolve().parent
OLD=DOC/'.ai/contracts/phase3-2c-a1-v3'
NEW=DOC/'.ai/contracts/phase3-2c-a1-v4'
def sha(data): return hashlib.sha256(data).hexdigest().upper()
def dump(path,value): path.write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def snapshot():
    def git(*args): return subprocess.check_output(['git',*args],cwd=REPO).decode('utf-8')
    names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
    files={name:{'bytes':len(data),'sha256':sha(data)} for name in sorted(names) for data in [(REPO/name).read_bytes()]}
    return {'repository':str(REPO),'head':git('rev-parse','HEAD').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain','--untracked-files=all').splitlines(),'files':files}
def main():
    assert not NEW.exists(),'Refuse existing version directory'
    before=snapshot()
    previous=json.loads((DOC/'.ai/reports/phase3-2c-a1-v3-review-20261012_143959/final-evidence.json').read_text(encoding='utf-8'))
    assert before==previous['sourceBefore']
    received=(DOC/'HANDOFF.md').read_bytes()
    archived=DOC/'Log/20261012_154142_3-2c-A1-v3-Sol-FAILED_次패킷전보존본.md'
    with archived.open('xb') as handle: handle.write(received)
    assert archived.read_bytes()==received
    historical={str(p):{'bytes':len(data),'sha256':sha(data)} for folder in (DOC/'.ai/contracts/phase3-2c-v1',DOC/'.ai/contracts/phase3-2c-a1-v2',OLD) for p in sorted(folder.iterdir()) if p.is_file() for data in [p.read_bytes()]}
    NEW.mkdir()
    for p in OLD.iterdir():
        if p.is_file() and p.name not in ('baseline.json','execution.json','STRATEGY.md'):
            data=p.read_bytes()
            if p.suffix in ('.py','.mjs'): data=data.replace(b'a1v3',b'a1v4')
            (NEW/p.name).write_bytes(data)
    execution=json.loads((OLD/'execution.json').read_text(encoding='utf-8'))
    execution.update(executionVersion=4,frozenSharedPath=str(NEW/'frozen-shared.json'),runtimeFaultsRequired=40)
    execution['ownerFailureCodes'].append('A1_LOG_CLOSE_UNVERIFIED')
    execution['observerSelfcheckRequired']['actualControlChecks']=37
    execution['preflightLockProbesRequired']=3
    execution['partialProbesRequired']=['capture-failure','context-close-failure','partial-write-failure']
    execution['processReceiptExtension']={'logCloseSeen':{'stdout':True,'stderr':True},'logCloseAtMs':'actual per-stream finite positive timestamp; >= own finish; never fabricated','logFinishSeen':{'stdout':True,'stderr':True}}
    dump(NEW/'execution.json',execution)
    dump(REPORT/'initial-evidence.json',{'time':datetime.now(timezone.utc).isoformat(),'archive':str(archived),'receivedBytes':len(received),'receivedSha256':sha(received),'sourceBefore':before,'historicalControls':historical,'productEditsBySol':0})
    print(json.dumps({'status':'INITIALIZED','archive':str(archived),'receivedBytes':len(received),'receivedSha256':sha(received),'sourceFiles':len(before['files'])},ensure_ascii=False))
if __name__=='__main__': main()
