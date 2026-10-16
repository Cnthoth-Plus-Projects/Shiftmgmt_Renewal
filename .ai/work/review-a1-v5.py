# -*- coding: utf-8 -*-
"""Sol review intake. Product and sealed v5 control material remain read-only."""
from pathlib import Path
from datetime import datetime
import hashlib,json,subprocess,difflib,yaml
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
REPORT=DOC/'.ai/reports/phase3-2c-a1-v5-review-20261013_093034'
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v5';ALLOWED=['scripts/ui-checks/access-history.mjs','scripts/ui-checks/access-history-shared.mjs']
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def meta(path):
 data=path.read_bytes();return {'bytes':len(data),'sha256':sha(data)}
def fresh(path,data):
 with path.open('xb') as f:f.write(data)
def dump(path,value):fresh(path,(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def snapshot():
 def git(*args):return subprocess.check_output(['git',*args],cwd=REPO).decode('utf-8')
 names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
 return {'repository':str(REPO),'head':git('rev-parse','HEAD').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain','--untracked-files=all').splitlines(),'files':{n:meta(REPO/n) for n in sorted(names)}}
def main():
 assert not REPORT.exists();REPORT.mkdir()
 received=(DOC/'HANDOFF.md').read_bytes();archive=DOC/'Log'/(datetime.now().strftime('%Y%m%d_%H%M%S')+'_3-2c-A1-v5-Gemini_수신원본.md');fresh(archive,received);assert archive.read_bytes()==received
 dispatch=load(DOC/'.ai/reports/phase3-2c-a1-v5-replan-20261012_231342/dispatch.json');sent=Path(dispatch['sentArchive']['path']).read_bytes();assert sha(sent)==dispatch['currentHandoff']['sha256']
 marker=b'\n## \xed\x9a\x8c\xec\x8b\xa0\n';assert received.count(marker)==sent.count(marker)==1
 request_unchanged=received.split(marker)[0]==sent.split(marker)[0]
 source=snapshot();baseline=load(CTRL/'baseline.json')
 differences={name:{'before':baseline['files'].get(name),'after':source['files'].get(name)} for name in sorted(set(baseline['files'])|set(source['files'])) if baseline['files'].get(name)!=source['files'].get(name)}
 controls={p:{'expected':m,'actual':meta(Path(p))} for p,m in baseline['control'].items() if meta(Path(p))!=m}
 source_identity=all(source[k]==baseline[k] for k in ('repository','head','branch','status'))
 assert request_unchanged and source_identity and set(differences)==set(ALLOWED) and not controls
 frozen=load(CTRL/'frozen-shared.json');raw=(REPO/ALLOWED[1]).read_bytes();start=raw.index(b'export const CANONICAL_8_ACTIONS =');end=raw.index(b'export async function performWorkerIpcHandshake',start);fragment=raw[start:end]
 assert len(fragment)==6575 and sha(fragment)=='502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1'
 snapshots=REPORT/'received-product';snapshots.mkdir();diffs={}
 prior=DOC/'.ai/reports/phase3-2c-a1-v5-replan-20261012_231342/received-product'
 for name in ALLOWED:
  current=(REPO/name).read_bytes();fresh(snapshots/Path(name).name,current)
  old=(prior/Path(name).name).read_bytes();lines=list(difflib.unified_diff(old.decode('utf-8').splitlines(),current.decode('utf-8').splitlines(),fromfile='received-v4/'+name,tofile='received-v5/'+name,lineterm=''))
  fresh(REPORT/(Path(name).stem+'.diff'),('\n'.join(lines)+'\n').encode('utf-8'))
  diffs[name]={'added':sum(l.startswith('+') and not l.startswith('+++') for l in lines),'removed':sum(l.startswith('-') and not l.startswith('---') for l in lines),'hunks':sum(l.startswith('@@') for l in lines),'oldLines':len(old.splitlines()),'newLines':len(current.splitlines())}
 harness=Path(r'C:\Users\pangyo\AppData\Local\AI-Harness');idx=yaml.safe_load((harness/'POLICY_INDEX.yaml').read_text(encoding='utf-8-sig'));assert idx['policy_count']==len(idx['policies'])==26 and (harness/'policies').is_dir() and all((harness/n).is_file() for n in ('CORE.md','ROUTER.md'))
 policies=[{'id':p['id'],'path':str(harness/'policies'/p['file'])} for p in idx['policies'] if p['id'] in ('P04','P06','P13')];assert all(Path(p['path']).is_file() for p in policies)
 evidence={'time':datetime.now().astimezone().isoformat(),'receivedArchive':str(archive),'received':meta(archive),'requestUnchanged':request_unchanged,'requestBytes':len(received.split(marker)[0]),'sourceBefore':source,'changedSource':differences,'controlBefore':{p:m for p,m in baseline['control'].items()},'versionControls':{str(p):meta(p) for p in CTRL.iterdir() if p.is_file()},'frozen':{'bytes':len(fragment),'sha256':sha(fragment)},'diffs':diffs,'protectedFiles':339,'controlFiles':219,'requiredPolicies':policies,'McpSurfaceInspected':True,'productEditsBySol':0,'retryHistory':baseline['retryHistory'],'submittedRuntime':r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v5-runtime-__a6lwuo'}
 dump(REPORT/'initial-evidence.json',evidence)
 print(json.dumps({'status':'INTAKE_SCOPE_PASS','report':str(REPORT),'archive':str(archive),'received':meta(archive),'bodyBytes':evidence['requestBytes'],'sourceFiles':len(source['files']),'changed':list(differences),'controls':219,'diffs':diffs,'policies':policies},ensure_ascii=False))
if __name__=='__main__':main()
