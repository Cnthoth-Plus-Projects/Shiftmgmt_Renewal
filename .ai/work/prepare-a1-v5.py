# -*- coding: utf-8 -*-
"""Sol control-only replan bootstrap. Product and historical controls are read-only."""
from pathlib import Path
from datetime import datetime
import json
import hashlib
import subprocess
import yaml

DOC=Path(r'C:\Projects\Active\교대근무관리 시스템')
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT=DOC/'.ai/reports/phase3-2c-a1-v5-replan-20261012_231342'
OLD=DOC/'.ai/contracts/phase3-2c-a1-v4'
NEW=DOC/'.ai/contracts/phase3-2c-a1-v5'
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def meta(p):
 b=p.read_bytes();return {'bytes':len(b),'sha256':sha(b)}
def fresh(p,b):
 with p.open('xb') as f:f.write(b)
def dump(p,o):fresh(p,(json.dumps(o,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def snapshot():
 def git(*args):return subprocess.check_output(['git',*args],cwd=REPO).decode('utf-8')
 names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
 return {'repository':str(REPO),'head':git('rev-parse','HEAD').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain','--untracked-files=all').splitlines(),'files':{n:meta(REPO/n) for n in sorted(names)}}
def main():
 assert not NEW.exists() and not REPORT.exists(),'Refuse overwrite'
 final=json.loads((DOC/'.ai/reports/phase3-2c-a1-v4-review-20261012_175305/final-evidence.json').read_text(encoding='utf-8'))
 source=snapshot();assert source==final['sourceAfter']
 harness=Path(r'C:\Users\pangyo\AppData\Local\AI-Harness');index=yaml.safe_load((harness/'POLICY_INDEX.yaml').read_text(encoding='utf-8-sig'))
 assert index['policy_count']==len(index['policies'])==26
 assert all((harness/p).is_file() for p in ['CORE.md','ROUTER.md']) and (harness/'policies').is_dir()
 required=[p for p in index['policies'] if p['id'] in ['P04','P06','P13','P25']]
 assert all((harness/'policies'/p['file']).is_file() for p in required)
 REPORT.mkdir();NEW.mkdir()
 received=(DOC/'HANDOFF.md').read_bytes()
 archive=DOC/'Log'/(datetime.now().strftime('%Y%m%d_%H%M%S')+'_3-2c-A1-v4-FAILED再확인본_v5재설계전보존.md')
 fresh(archive,received);assert archive.read_bytes()==received
 historical={str(p):meta(p) for name in ['phase3-2c-v1','phase3-2c-a1-v2','phase3-2c-a1-v3','phase3-2c-a1-v4'] for p in (DOC/'.ai/contracts'/name).iterdir() if p.is_file()}
 snap=REPORT/'received-product';snap.mkdir()
 for n in ['access-history.mjs','access-history-shared.mjs']:fresh(snap/n,(REPO/'scripts/ui-checks'/n).read_bytes())
 for p in OLD.iterdir():
  if p.is_file() and p.name not in ['baseline.json','execution.json','STRATEGY.md']:
   b=p.read_bytes()
   if p.suffix in ['.py','.mjs']:b=b.replace(b'a1v4',b'a1v5')
   fresh(NEW/p.name,b)
 execution=json.loads((OLD/'execution.json').read_text(encoding='utf-8'))
 execution.update(executionVersion=5,frozenSharedPath=str(NEW/'frozen-shared.json'),runtimeFaultsRequired=46,
  componentTypedMutationsRequired=32,partialProbesRequired=['capture-failure','context-close-failure','partial-write-failure','measured-viewport','measured-origin','viewport-null','canonical-missing'],
  callbackEventsRequired=True,exactAckReceiptRequired=True,acquiredPartialChecksRequired=True)
 execution['ownerFailureCodes'].append('A1_LIFECYCLE_INVALID')
 execution['observerSelfcheckRequired']['actualControlChecks']=39
 dump(NEW/'execution.json',execution)
 dump(REPORT/'initial-evidence.json',{'time':datetime.now().astimezone().isoformat(),'sourceBefore':source,'historicalControls':historical,
  'receivedArchive':str(archive),'received':meta(archive),'requiredPolicies':[p['id'] for p in required],'McpSurfaceInspected':True,
  'productEditsBySol':0,'retryHistory':execution['retryHistory'],'priorReview':str(DOC/'.ai/reports/phase3-2c-a1-v4-review-20261012_175305')})
 print(json.dumps({'status':'V5_BOOTSTRAPPED','sourceFiles':len(source['files']),'historicalControls':len(historical),'received':meta(archive)},ensure_ascii=False))
if __name__=='__main__':main()
