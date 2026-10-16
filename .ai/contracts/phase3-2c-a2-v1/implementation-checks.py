"""Fixed Gemini commands; actual SUT results precede separate Sol acceptance."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,difflib,hashlib,json,os,subprocess,sys,tempfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
DOC=HERE.parents[2]
BEFORE=DOC/'.ai/reports/phase3-2c-a2-prepare-20261014/received-product'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
    p=argparse.ArgumentParser();p.add_argument('--negative-result',required=True);a=p.parse_args()
    # Run the remaining original vectors BEFORE this driver, under the closed plan.
    negative=Path(a.negative_result).resolve(strict=True)
    root=Path(tempfile.mkdtemp(prefix='shiftmgmt-gemini-a2-evidence-'));records=[]
    print(json.dumps({'artifact':str(root)}),flush=True)
    env={k:v for k,v in os.environ.items() if not k.startswith(('SOL_','SHIFT_','SHIFTMGMT_','AUTH_BOOTSTRAP_')) and k not in ('NODE_OPTIONS','NODE_DEBUG')}
    env['PYTHONIOENCODING']='utf-8'
    def run(name,argv,limit=240):
        out=root/(name+'.stdout.txt');err=root/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
        with out.open('xb') as stdout,err.open('xb') as stderr:
            child=subprocess.Popen([str(x) for x in argv],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
            try:rc=child.wait(timeout=limit);timed=False
            except subprocess.TimeoutExpired:timed=True;child.kill();rc=child.wait(timeout=10)
        record={'name':name,'argv':[str(x) for x in argv],'cwd':str(REPO),'pid':child.pid,'startUtc':start,'endUtc':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed,'stdout':str(out),'stderr':str(err),'stdoutMeta':meta(out),'stderrMeta':meta(err)}
        records.append(record);dump(root/(name+'.command.json'),record);print(json.dumps({'name':name,'rc':rc,'timeout':timed}),flush=True)
        assert rc==0 and not timed,(name,str(err))
        return out.read_text(encoding='utf-8')
    try:
        eh=meta(HERE/'execution.json')['sha256'];bh=meta(HERE/'baseline.json')['sha256']
        gate=[PY,'-X','utf8','-B',HERE/'gate-evidence.py','--execution-sha',eh,'--baseline-sha',bh]
        run('scope-before',gate+['--scope'])
        execution=json.loads((HERE/'execution.json').read_text(encoding='utf-8'))
        for n in execution['allowed']:run('syntax-'+Path(n).stem,['node','--check',n])
        for name,argv in [('typecheck',['cmd','/d','/c','npm.cmd','run','typecheck']),('lint',['cmd','/d','/c','npm.cmd','run','lint']),('map',['cmd','/d','/c','npm.cmd','run','validate:map']),('diff-check',['git','diff','--check']),('build',['cmd','/d','/c','npm.cmd','run','build']),('focused-tests',['cmd','/d','/c','npx.cmd','vitest','run','src/web/screens/access-history-model.test.ts','src/main/services/access-log-service.test.ts','src/main/http/route-registry.test.ts','--maxWorkers=1','--minWorkers=1'])]:run(name,argv)
        run('gate-parser',gate+['--self-test'])
        runtime=[PY,'-X','utf8','-B',HERE/'runtime-probes.py','--execution-sha',eh,'--baseline-sha',bh]
        run('runtime-parser',runtime+['--self-test'])
        summary=json.loads(run('actual-a1-runtime51',runtime,1500).splitlines()[-1]);assert summary['status']=='PASS' and summary['faults']==51
        suite=json.loads((Path(summary['artifact'])/'suite-result.json').read_text(encoding='utf-8'))
        core=[r for r in suite['records'] if r['name']=='positive-contract-core'];assert len(core)==1 and core[0]['rc']==0
        core_path=json.loads(core[0]['output'])['manifestPath']
        run('ipc19-and-port',['node',HERE/'ipc-probes.mjs'])
        run('component32',['node',HERE/'component-probes.mjs','--core-manifest',core_path,'--execution-sha',eh,'--baseline-sha',bh])
        partial=json.loads(run('partial11',['node',HERE/'partial-probes.mjs']).splitlines()[-1]);assert partial['status']=='PASS' and partial['modes']==11
        parity=json.loads(run('actual-guard-parity',[PY,'-X','utf8','-B',HERE/'lifecycle-probes.py','--guard']).splitlines()[-1]);assert parity['invalidRejected']==5 and parity['invalidAccepted']==0
        late=json.loads(run('actual-late15',[PY,'-X','utf8','-B',HERE/'lifecycle-probes.py'],1500).splitlines()[-1]);assert late['status']=='PASS' and late['cases']==15
        normal=json.loads(run('actual-normal8',[PY,'-X','utf8','-B',HERE/'normal-probes.py','--execution-sha',eh,'--baseline-sha',bh],1800).splitlines()[-1]);assert normal['status']=='PASS' and normal['caseCount']==8
        run('negative-ledger',[PY,'-X','utf8','-B',HERE/'validate-negative.py','--result',negative])
        run('scope-after',gate+['--scope'])
        preserved=json.loads((HERE/'guard-preserved.json').read_text(encoding='utf-8'))
        source=(REPO/preserved['allowedProvider']).read_bytes();start=source.index(b'function validateProcessReceipt(r) {');end=source.index(b'\n}',start)+2
        body=source[start:end];assert len(body)==preserved['bytes'] and hashlib.sha256(body).hexdigest().upper()==preserved['sha256'],'Accepted guard body changed'
        diffs={}
        for name in execution['allowed']:
            path=REPO/name;old=BEFORE/path.name;lines=list(difflib.unified_diff(old.read_text(encoding='utf-8').splitlines(),path.read_text(encoding='utf-8').splitlines(),fromfile='accepted-a1/'+path.name,tofile='implemented-a2/'+path.name,lineterm=''))
            diff=root/(path.stem+'.diff')
            with diff.open('x',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
            diffs[name]={'before':meta(old),'after':meta(path),'added':sum(l.startswith('+') and not l.startswith('+++') for l in lines),'removed':sum(l.startswith('-') and not l.startswith('---') for l in lines),'hunks':sum(l.startswith('@@') for l in lines),'path':str(diff),'diffMeta':meta(diff)}
        result={'status':'IMPLEMENTATION_CHECKS_PASS_NOT_SOL_ACCEPTANCE','proof':'ACTUAL_A1_AND_NORMAL8_INCOMPLETE_EVIDENCE_PLUS_NEGATIVE_LEDGER','records':records,'runtime51':summary,'normal8':normal,'partial11':partial,'guard5':parity,'late15':late,'negativeResult':{'path':str(negative),**meta(negative)},'diffs':diffs,'A2Accepted':False,'BAccepted':False,'retention':'Retain all own evidence and referenced raw/log/captures; foreign cleanup forbidden'}
        dump(root/'implementation-result.json',result);print(json.dumps({'status':result['status'],'artifact':str(root),'commandCount':len(records),'A2Accepted':False}));return 0
    except Exception as error:
        dump(root/'implementation-result.json',{'status':'FAILED','records':records,'error':str(error),'A2Accepted':False});print(json.dumps({'status':'FAILED','artifact':str(root),'error':str(error)}),file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
