# -*- coding: utf-8 -*-
"""Independent submitted-source checks. Product and locked controls are read only.
Build/test outputs and uniquely owned runtime runs are retained, no foreign cleanup.
"""
from pathlib import Path
from datetime import datetime,timezone
import json,os,subprocess,sys,time
REPORT=Path(__file__).resolve().parent
ROOT=REPORT.parents[2];NEW=ROOT/'.ai/contracts/phase3-2c-a1-v2'
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
EXECUTION='66C973A13D653C7A4D745ED2DE7B72C03E96BFE793148F677A61E5CBAF2F5494'
BASELINE='189B304051EE90E94148DE3D6E3B13B1E607D3840C7FC6E47A7B6D4DE46E8933'
records=[]
def run(name,argv,limit=240):
    start=datetime.now(timezone.utc).isoformat();begin=time.monotonic()
    out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt')
    environment=dict(os.environ);environment.pop('NODE_DEBUG',None)
    with out.open('wb') as stdout,err.open('wb') as stderr:
        p=subprocess.Popen(argv,cwd=REPO,env=environment,stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW)
        timeout=False
        try:rc=p.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            timeout=True;p.kill();rc=p.wait(timeout=10)
    record={'name':name,'argv':argv,'cwd':str(REPO),'pid':p.pid,'start':start,
        'end':datetime.now(timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-begin,3),
        'rc':rc,'timeout':timeout,'stdout':str(out),'stderr':str(err)}
    records.append(record)
    (REPORT/'independent-commands.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'name':name,'rc':rc,'timeout':timeout,'elapsedSeconds':record['elapsedSeconds']}),flush=True)
    if timeout:raise RuntimeError('Supervisor timeout; child cleanup UNVERIFIED, STOP')
    return record
phase=sys.argv[1]
gate=[sys.executable,str(NEW/'gate-evidence.py'),'--execution-sha',EXECUTION,'--baseline-sha',BASELINE]
if phase=='static':
    for name,argv in [
      ('syntax-owner',['node','--check','scripts/ui-checks/access-history.mjs']),
      ('syntax-shared',['node','--check','scripts/ui-checks/access-history-shared.mjs']),
      ('typecheck',['npm.cmd','run','typecheck']),('lint',['npm.cmd','run','lint']),
      ('map',['npm.cmd','run','validate:map']),('diff-check',['git','diff','--check']),
      ('build',['npm.cmd','run','build']),
      ('focused-tests',['npx.cmd','vitest','run','src/web/screens/access-history-model.test.ts','src/main/services/access-log-service.test.ts','src/main/http/route-registry.test.ts','--maxWorkers=1','--minWorkers=1']),
      ('scope-before-runtime',gate+['--scope'])]:
        run(name,argv)
    (REPORT/'static-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
elif phase=='runtime':
    run('runtime-review-copy',[sys.executable,str(REPORT/'runtime-probes-review.py'),'--execution-sha',EXECUTION,'--baseline-sha',BASELINE],limit=600)
    # The copy changes only the observer's append recursion, never product guards.
    lines=(REPORT/'runtime-review-copy.stdout.txt').read_text(encoding='utf-8',errors='replace').splitlines()
    result=json.loads(lines[-1]);suite=Path(result['artifact'])/'suite-result.json'
    parsed=json.loads(suite.read_text(encoding='utf-8'));(REPORT/'runtime-suite-index.json').write_text(json.dumps({'path':str(suite),'status':parsed['status'],'records':len(parsed['records']),'originalControlStillFrozen':True,'reviewOnlyPreloadAppendFix':True},ensure_ascii=False,indent=2),encoding='utf-8')
    positive=next((r for r in parsed['records'] if r['name']=='positive-contract-core'),None)
    final=next((x['manifestPath'] for x in positive.get('jsonOutput',[]) if x.get('status')=='PASS'),None) if positive else None
    if final:
        run('component-probes',['node',str(NEW/'component-probes.mjs'),'--core-manifest',final,'--execution-sha',EXECUTION,'--baseline-sha',BASELINE],limit=60)
    else:print('Current uninstrumented core prerequisite missing, component acceptance NOT_CLAIMED',flush=True)
    # The canonical IPC tool uses the broken preload for its port subcase.
    run('ipc-original',['node',str(NEW/'ipc-probes.mjs')],limit=110)
    ipc=(NEW/'ipc-probes.mjs').read_text(encoding='utf-8')
    ipc=ipc.replace('const folder=path.resolve(import.meta.dirname);','const folder='+json.dumps(str(NEW))+';')
    needle="pathToFileURL(path.join(folder,'runtime-preload.mjs')).href"
    assert ipc.count(needle)==1
    ipc=ipc.replace(needle,'pathToFileURL('+json.dumps(str(REPORT/'runtime-preload-review.mjs'))+').href')
    (REPORT/'ipc-probes-review.mjs').write_text(ipc,encoding='utf-8')
    run('ipc-review-copy',['node',str(REPORT/'ipc-probes-review.mjs')],limit=110)
    run('scope-after-runtime',gate+['--scope'])
    (REPORT/'runtime-command-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
else:raise ValueError('Unknown phase')
