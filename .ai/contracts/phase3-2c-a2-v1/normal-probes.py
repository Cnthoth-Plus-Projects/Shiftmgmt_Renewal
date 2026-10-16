"""Actual normal8 owner runs. Every expected RC1 is independently adjudicated."""
from pathlib import Path
import argparse, hashlib, importlib.util, json, sys, tempfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('a2_normal_runtime',HERE/'runtime-probes.py')
R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)
def meta(p):
    b=Path(p).read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def main():
    p=argparse.ArgumentParser();p.add_argument('--execution-sha',required=True);p.add_argument('--baseline-sha',required=True);p.add_argument('--list',action='store_true');a=p.parse_args()
    assert meta(HERE/'execution.json')['sha256']==a.execution_sha and meta(HERE/'baseline.json')['sha256']==a.baseline_sha
    e=json.loads((HERE/'execution.json').read_text(encoding='utf-8'))
    if a.list:print(json.dumps({'proof':'PLAN_ONLY_NOT_RUN','cases':e['normalCases'],'expectedOwnerRC':1,'expectedStatus':'FAIL_INCOMPLETE'}));return 0
    root=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-a2-normal-'));records=[];good=True
    gate=[sys.executable,'-X','utf8','-B',str(HERE/'gate-evidence.py'),'--execution-sha',a.execution_sha,'--baseline-sha',a.baseline_sha]
    pre,_=R.run(root,'scope-before',gate+['--scope']);records.append(pre)
    if pre['rc']!=0:return 1
    for case in e['normalCases']:
        r,rows=R.run(root,'normal-'+case,['node','scripts/ui-checks/access-history.mjs','--case='+case],'observe-positive',190);records.append(r)
        accepted=False
        try:
            assert r['rc']==1 and not r['timeout'] and not r['output'] and len(r['errors'].splitlines())==1
            terminal=json.loads(r['errors']);assert set(terminal)=={'status','code','case','runId','manifestPath','exitCode','stageSlice','acceptance'}
            assert terminal['status']=='FAIL_INCOMPLETE' and terminal['code']=='A2_COVERAGE_INCOMPLETE' and terminal['case']==case and terminal['exitCode']==1 and terminal['stageSlice']=='A2' and terminal['acceptance']=='A2_INCOMPLETE_EVIDENCE_ONLY'
            assert r['observerHealthy'] and r['quiescenceObserved']
            assert R.observed_artifact_order(rows,require_all=True)[0] and R.observed_publication(rows)
            f,_=R.run(root,'normal-final-'+case,gate+['--final',terminal['manifestPath']]);records.append(f)
            assert f['rc']==0 and not f['timeout']
            r['terminal']=terminal;accepted=True
        except (AssertionError,ValueError,KeyError,TypeError) as error:r['verificationError']=str(error)
        r['acceptedIncompleteEvidence']=accepted;good=good and accepted
        # All independent cases still run after one failure; never replace a failed record.
    post,_=R.run(root,'scope-after',gate+['--scope']);records.append(post);good=good and post['rc']==0
    result={'status':'PASS' if good else 'FAIL','proof':'ACTUAL_NORMAL8_INCOMPLETE_EVIDENCE_ONLY_NOT_UI_ACCEPTANCE','caseCount':8,'records':records,'sourceMeta':{n:meta(R.REPO/n) for n in e['allowed']},'A2Accepted':False,'BAccepted':False,'retention':'Retain this own suite and all referenced partial/raw/capture/log evidence'}
    R.dump(root/'normal-result.json',result);print(json.dumps({'status':result['status'],'artifact':str(root),'caseCount':8,'proof':result['proof']}));return 0 if good else 1
if __name__=='__main__':sys.exit(main())
