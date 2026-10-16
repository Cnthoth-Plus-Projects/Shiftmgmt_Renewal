# -*- coding: utf-8 -*-
"""Sol v6 control bootstrap; all product and historical targets read-only."""
from pathlib import Path
from datetime import datetime
import hashlib,json,subprocess,yaml
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
OLD=DOC/'.ai/contracts/phase3-2c-a1-v5';NEW=DOC/'.ai/contracts/phase3-2c-a1-v6'
REPORT=DOC/'.ai/reports/phase3-2c-a1-v6-replan-20261013_100555'
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def meta(p):
 b=p.read_bytes();return {'bytes':len(b),'sha256':sha(b)}
def fresh(p,b):
 with p.open('xb') as f:f.write(b)
def dump(p,d):fresh(p,(json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def snapshot():
 def git(*args):return subprocess.check_output(['git',*args],cwd=REPO).decode('utf-8')
 names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
 return {'repository':str(REPO),'head':git('rev-parse','HEAD').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain','--untracked-files=all').splitlines(),'files':{n:meta(REPO/n) for n in sorted(names)}}
def main():
 assert not NEW.exists() and not REPORT.exists()
 final=json.loads((DOC/'.ai/reports/phase3-2c-a1-v5-review-20261013_093034/final-evidence.json').read_text(encoding='utf-8'));source=snapshot();assert source==final['sourceAfter']
 received=(DOC/'HANDOFF.md').read_bytes();assert sha(received)==final['currentHandoff']['sha256'] and received==Path(final['closingArchive']['path']).read_bytes()
 REPORT.mkdir();NEW.mkdir();archive=DOC/'Log'/(datetime.now().strftime('%Y%m%d_%H%M%S')+'_3-2c-A1-v5-Sol-FAILED_v6재설계전보존.md');fresh(archive,received);assert archive.read_bytes()==received
 historical={str(p):meta(p) for name in ['phase3-2c-v1','phase3-2c-a1-v2','phase3-2c-a1-v3','phase3-2c-a1-v4','phase3-2c-a1-v5'] for p in (DOC/'.ai/contracts'/name).iterdir() if p.is_file()};assert len(historical)==55
 snapshots=REPORT/'received-product';snapshots.mkdir()
 for n in ['access-history.mjs','access-history-shared.mjs']:fresh(snapshots/n,(REPO/'scripts/ui-checks'/n).read_bytes())
 for p in OLD.iterdir():
  if p.is_file() and p.name not in ('baseline.json','execution.json','STRATEGY.md'):
   b=p.read_bytes();b=b.replace(b'a1v5',b'a1v6') if p.suffix in ('.py','.mjs') else b;fresh(NEW/p.name,b)
 execution=json.loads((OLD/'execution.json').read_text(encoding='utf-8'))
 execution.update(executionVersion=6,frozenSharedPath=str(NEW/'frozen-shared.json'),runtimeFaultsRequired=51,partialProbesRequired=execution['partialProbesRequired']+['repository-realpath-failure','request-then-viewport-null','canonical-import-failure','route-install-failure'],guardedProcessReceiptRequired=True,atomicCandidateRequired=True,settledLogHashOrderRequired=True,partialAcquisitionRequired=True)
 execution['ownerFailureCodes'].append('A1_CANDIDATE_WRITE_FAILED')
 execution['ownerProcessFlow']=['WORKER_SETTLED','SERVER_SETTLED','PROCESS_RECEIPTS_VALID','ARTIFACTS_HASHED','TEMP_REMOVE_COMPLETED','CANDIDATE_ATOMIC','GATE_SETTLED','GATE_RECEIPT_VALID','GATE_RESPONSE_BOUND','FINAL_ATOMIC','PASS']
 execution['partialAcquisition']={'exactKeys':['fixtureRows','fixtureRequests','routeInstalled'],'initial':{'fixtureRows':None,'fixtureRequests':[],'routeInstalled':False},'count':'null until route installation succeeds; actual length updated in handler before fulfill'}
 execution['observerSelfcheckRequired']['actualControlChecks']=45
 dump(NEW/'execution.json',execution)
 h=Path(r'C:\Users\pangyo\AppData\Local\AI-Harness');idx=yaml.safe_load((h/'POLICY_INDEX.yaml').read_text(encoding='utf-8-sig'));assert idx['policy_count']==len(idx['policies'])==26
 pol=[{'id':p['id'],'path':str(h/'policies'/p['file'])} for p in idx['policies'] if p['id'] in ['P04','P06','P13','P25']];assert all(Path(p['path']).is_file() for p in pol)
 dump(REPORT/'initial-evidence.json',{'time':datetime.now().astimezone().isoformat(),'sourceBefore':source,'historicalControls':historical,'receivedArchive':str(archive),'received':meta(archive),'priorReview':str(DOC/'.ai/reports/phase3-2c-a1-v5-review-20261013_093034'),'McpSurfaceInspected':True,'requiredPolicies':pol,'retryHistory':final['counterReset'],'originalRetryHistory':json.loads((OLD/'baseline.json').read_text(encoding='utf-8'))['retryHistory'],'productEditsBySol':0})
 print(json.dumps({'status':'V6_BOOTSTRAPPED','sourceFiles':len(source['files']),'historicalControls':55,'received':meta(archive),'report':str(REPORT)},ensure_ascii=False))
if __name__=='__main__':main()
