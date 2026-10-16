"""Independent review driver. Product source and all locked controls remain read-only."""
from datetime import datetime,timezone
import json,os,subprocess,sys,time
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;DOC=HERE.parents[2];REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v3'
dispatch=json.loads((DOC/'.ai/reports/phase3-2c-a1-replan-20261012_110625/dispatch.json').read_text(encoding='utf-8'))
env=dict(os.environ);env['PYTHONIOENCODING']='utf-8'
for key in list(env):
 if key.startswith(('SHIFT_','SHIFTMGMT_','SOL_A1_')) or key in ('NODE_OPTIONS','NODE_DEBUG'):del env[key]
def run(name,argv,timeout=300):
 start=datetime.now(timezone.utc).isoformat();t=time.monotonic();out=HERE/(name+'.stdout.txt');err=HERE/(name+'.stderr.txt')
 with out.open('xb') as stdout,err.open('xb') as stderr:
  child=subprocess.Popen(argv,cwd=REPO,env=env,stdout=stdout,stderr=stderr);timed_out=False
  try:rc=child.wait(timeout=timeout)
  except subprocess.TimeoutExpired:timed_out=True;child.kill();rc=child.wait(timeout=10)
 record={'name':name,'argv':argv,'cwd':str(REPO),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-t,'rc':rc,'timeout':timed_out,'stdout':str(out),'stderr':str(err)}
 (HERE/(name+'.command.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(record,ensure_ascii=False),flush=True)
 if timed_out:raise RuntimeError('STOP: only driver child was killed, descendant closure unverified, retain own output')
 return record
gate=[sys.executable,'-B',str(CTRL/'gate-evidence.py'),'--execution-sha',dispatch['executionSha256'],'--baseline-sha',dispatch['baselineSha256']]
mode=sys.argv[1]
if mode=='static':
 commands=[('scope-before',gate+['--scope']),('syntax-owner',['node','--check','scripts/ui-checks/access-history.mjs']),('syntax-shared',['node','--check','scripts/ui-checks/access-history-shared.mjs']),('typecheck',['npm.cmd','run','typecheck']),('lint',['npm.cmd','run','lint']),('map',['npm.cmd','run','validate:map']),('diff-check',['git','diff','--check']),('build',['npm.cmd','run','build']),('focused-tests',['npx.cmd','vitest','run','src/web/screens/access-history-model.test.ts','src/main/services/access-log-service.test.ts','src/main/http/route-registry.test.ts','--maxWorkers=1','--minWorkers=1'])]
 for name,argv in commands:
  if run(name,argv)['rc']:break
elif mode=='runtime':run('runtime-suite',[sys.executable,'-B',str(CTRL/'runtime-probes.py'),'--execution-sha',dispatch['executionSha256'],'--baseline-sha',dispatch['baselineSha256']],1500)
elif mode=='ipc':run('ipc-suite',['node',str(CTRL/'ipc-probes.mjs')],150)
elif mode=='component':
 values=[json.loads(l) for l in (HERE/'runtime-suite.stdout.txt').read_text(encoding='utf-8').splitlines() if l.startswith('{')]
 result=values[-1];suite=json.loads((Path(result['artifact'])/'suite-result.json').read_text(encoding='utf-8'))
 core=json.loads(next(row['output'] for row in suite['records'] if row['name']=='positive-contract-core'))['manifestPath']
 run('component-suite',['node',str(CTRL/'component-probes.mjs'),'--core-manifest',core,'--execution-sha',dispatch['executionSha256'],'--baseline-sha',dispatch['baselineSha256']],90)
elif mode=='extra':run('extra-runtime',[sys.executable,'-B',str(HERE/'review-extra.py')],220)
elif mode=='protocol':run('extra-protocol',['node',str(HERE/'protocol-ipc-probe.mjs')],50)
elif mode=='partial':run('extra-partial',['node',str(HERE/'core-partial-probe.mjs')],60)
else:raise ValueError('Unknown review mode')
