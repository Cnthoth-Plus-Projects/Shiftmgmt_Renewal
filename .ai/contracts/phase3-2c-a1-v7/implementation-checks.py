"""Fixed Gemini post-implementation command receipts; no code/contract edits."""
from pathlib import Path
from datetime import datetime, timezone
import difflib, hashlib, json, os, subprocess, sys, tempfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
DOC=HERE.parent.parent.parent
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
BEFORE=DOC/'.ai/reports/phase3-2c-a1-v7-replan/received-product'
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
    assert not sys.argv[1:],'No alternate repository/controls/cases allowed'
    root=Path(tempfile.mkdtemp(prefix='shiftmgmt-gemini-a1v7-evidence-'));records=[]
    print(json.dumps({'artifact':str(root)}),flush=True)
    env=dict(os.environ)
    for k in list(env):
        if k.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or k in ('NODE_OPTIONS','NODE_DEBUG'):del env[k]
    env['PYTHONIOENCODING']='utf-8'
    def run(name,argv,limit=180):
        out=root/(name+'.stdout.txt');err=root/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
        with out.open('xb') as stdout,err.open('xb') as stderr:
            child=subprocess.Popen([str(a) for a in argv],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
            try:rc=child.wait(timeout=limit);timed=False
            except subprocess.TimeoutExpired:timed=True;child.kill();rc=child.wait(timeout=10)
        record={'name':name,'argv':[str(a) for a in argv],'cwd':str(REPO),'pid':child.pid,'startUtc':start,'endUtc':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed,'stdout':str(out),'stderr':str(err),'stdoutMeta':meta(out),'stderrMeta':meta(err)}
        records.append(record);dump(root/(name+'.command.json'),record)
        print(json.dumps({'name':name,'rc':rc,'timeout':timed}),flush=True)
        assert rc==0 and not timed,(name,str(err))
        return out.read_text(encoding='utf-8')
    try:
        eh=meta(HERE/'execution.json')['sha256'];bh=meta(HERE/'baseline.json')['sha256']
        gate=[PY,'-X','utf8','-B',HERE/'gate-evidence.py','--execution-sha',eh,'--baseline-sha',bh]
        run('scope-before',gate+['--scope'])
        for name in ('access-history.mjs','access-history-shared.mjs'):run('syntax-'+Path(name).stem,['node','--check','scripts/ui-checks/'+name])
        for name,argv in [('typecheck',['cmd','/d','/c','npm.cmd','run','typecheck']),('lint',['cmd','/d','/c','npm.cmd','run','lint']),('map',['cmd','/d','/c','npm.cmd','run','validate:map']),('diff-check',['git','diff','--check']),('build',['cmd','/d','/c','npm.cmd','run','build']),('focused-tests',['cmd','/d','/c','npx.cmd','vitest','run','src/web/screens/access-history-model.test.ts','src/main/services/access-log-service.test.ts','src/main/http/route-registry.test.ts','--maxWorkers=1','--minWorkers=1'])]:run(name,argv)
        run('gate-parser',gate+['--self-test'])
        runtime=[PY,'-X','utf8','-B',HERE/'runtime-probes.py','--execution-sha',eh,'--baseline-sha',bh]
        run('runtime-parser',runtime+['--self-test'])
        summary=json.loads(run('actual-runtime51',runtime,1500).splitlines()[-1])
        assert summary['status']=='PASS' and summary['faults']==51
        suite=json.loads((Path(summary['artifact'])/'suite-result.json').read_text(encoding='utf-8'))
        core=[r for r in suite['records'] if r['name']=='positive-contract-core'];assert len(core)==1 and core[0]['rc']==0
        core_path=json.loads(core[0]['output'])['manifestPath']
        run('ipc19-and-port',['node',HERE/'ipc-probes.mjs'])
        run('component32',['node',HERE/'component-probes.mjs','--core-manifest',core_path,'--execution-sha',eh,'--baseline-sha',bh])
        partial=json.loads(run('partial11',['node',HERE/'partial-probes.mjs']).splitlines()[-1]);assert partial['status']=='PASS' and partial['modes']==11
        parity=json.loads(run('actual-guard-parity',[PY,'-X','utf8','-B',HERE/'lifecycle-probes.py','--guard']).splitlines()[-1]);assert parity['invalidRejected']==5 and parity['invalidAccepted']==0
        late=json.loads(run('actual-late15',[PY,'-X','utf8','-B',HERE/'lifecycle-probes.py'],1500).splitlines()[-1]);assert late['status']=='PASS' and late['cases']==15
        assert late['proof']=='ACTUAL_V7_LATE_CALLBACK_SUBSET_ONLY_NOT_A2_B'
        run('scope-after',gate+['--scope'])
        diffs={}
        for name in ('access-history.mjs','access-history-shared.mjs'):
            old=(BEFORE/name).read_bytes();path=REPO/'scripts/ui-checks'/name;new=path.read_bytes()
            lines=list(difflib.unified_diff(old.decode('utf-8').splitlines(),new.decode('utf-8').splitlines(),fromfile='received-v6/'+name,tofile='implemented-v7/'+name,lineterm=''))
            diff=root/(Path(name).stem+'.diff')
            with diff.open('x',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
            diffs[name]={'before':meta(BEFORE/name),'after':meta(path),'added':sum(l.startswith('+') and not l.startswith('+++') for l in lines),'removed':sum(l.startswith('-') and not l.startswith('---') for l in lines),'hunks':sum(l.startswith('@@') for l in lines),'path':str(diff),'diffMeta':meta(diff)}
        result={'status':'IMPLEMENTATION_CHECKS_PASS_NOT_SOL_ACCEPTANCE','proof':'ACTUAL_COMMANDS_AND_SUBSETS_ONLY_NOT_A2_B','records':records,'runtime51':summary,'partial11':partial,'guard5':parity,'late15':late,'diffs':diffs,'A1Accepted':False,'retention':'Retain exact own evidence and referenced run/temp artifacts; no historical/foreign cleanup'}
        dump(root/'implementation-result.json',result)
        print(json.dumps({'status':result['status'],'artifact':str(root),'commandCount':len(records),'A1Accepted':False}),flush=True)
        return 0
    except Exception as error:
        dump(root/'implementation-result.json',{'status':'FAILED','records':records,'error':str(error),'A1Accepted':False,'retention':'Retain all evidence; never replace the failed record with PASS'})
        print(json.dumps({'status':'FAILED','artifact':str(root),'error':str(error)}),file=sys.stderr)
        return 1
if __name__=='__main__':sys.exit(main())
