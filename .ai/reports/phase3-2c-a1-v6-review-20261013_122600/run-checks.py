# -*- coding: utf-8 -*-
"""Independent Sol checks. Original product/control bytes are never edited."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,subprocess,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent
DOC=REPORT.parent.parent.parent;REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v6'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def dump(p,v):
 with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def command(name,argv,timeout=60,required=True):
 env=dict(os.environ)
 for k in list(env):
  if k.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or k in ('NODE_OPTIONS','NODE_DEBUG'):del env[k]
 env['PYTHONIOENCODING']='utf-8'
 out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
 with out.open('xb') as stdout,err.open('xb') as stderr:
  child=subprocess.Popen([str(a) for a in argv],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
  try:rc=child.wait(timeout=timeout);timed=False
  except subprocess.TimeoutExpired:timed=True;child.kill();rc=child.wait(timeout=10)
 record={'name':name,'argv':[str(a) for a in argv],'cwd':str(REPO),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'timeout':timed,'stdout':str(out),'stderr':str(err),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes())}
 dump(REPORT/(name+'.command.json'),record);print(json.dumps({'name':name,'rc':rc,'timeout':timed}),flush=True)
 if required:assert rc==0 and not timed,(name,err.read_text(encoding='utf-8',errors='replace'))
 return record
def main():
 eh=sha((CTRL/'execution.json').read_bytes());bh=sha((CTRL/'baseline.json').read_bytes())
 gate=[PY,'-X','utf8','-B',CTRL/'gate-evidence.py','--execution-sha',eh,'--baseline-sha',bh]
 records=[]
 records.append(command('scope-before',gate+['--scope']))
 for name in ('owner','shared'):records.append(command('syntax-'+name,['node','--check','scripts/ui-checks/access-history'+('-shared' if name=='shared' else '')+'.mjs']))
 for name,argv in [('typecheck',['cmd','/d','/c','npm.cmd','run','typecheck']),('lint',['cmd','/d','/c','npm.cmd','run','lint']),('map',['cmd','/d','/c','npm.cmd','run','validate:map']),('diff-check',['git','diff','--check']),('build',['cmd','/d','/c','npm.cmd','run','build']),('focused-tests',['cmd','/d','/c','npx.cmd','vitest','run','src/web/screens/access-history-model.test.ts','src/main/services/access-log-service.test.ts','src/main/http/route-registry.test.ts','--maxWorkers=1','--minWorkers=1'])]:records.append(command(name,argv,180))
 records.append(command('gate-parser',gate+['--self-test']))
 records.append(command('runtime-parser',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',eh,'--baseline-sha',bh,'--self-test']))
 runtime=command('actual-runtime-original-controls',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',eh,'--baseline-sha',bh],1500,False);records.append(runtime)
 assert not runtime['timeout'],'Runtime timeout; retain evidence, no negative acceptance'
 summary=json.loads(Path(runtime['stdout']).read_text(encoding='utf-8').splitlines()[-1]);dump(REPORT/'runtime-original-summary.json',summary)
 receipt=json.loads((Path(summary['artifact'])/'suite-result.json').read_text(encoding='utf-8'));assert summary['status'] in ('PASS','FAIL') and receipt['requiredFaultCount']==51
 core=[r for r in receipt['records'] if r['name']=='positive-contract-core'];assert len(core)==1 and core[0]['rc']==0
 final=json.loads(core[0]['output'])['manifestPath']
 records.append(command('ipc-suite',['node',CTRL/'ipc-probes.mjs'],120))
 records.append(command('component-suite',['node',CTRL/'component-probes.mjs','--core-manifest',final,'--execution-sha',eh,'--baseline-sha',bh],120))
 records.append(command('partial-suite',['node',CTRL/'partial-probes.mjs'],120))
 records.append(command('scope-after',gate+['--scope']))
 dump(REPORT/'check-results.json',{'status':'ORIGINAL_CONTROLS_COMPLETE','records':records,'runtimeSummary':summary,'runtimeAcceptance':summary['status']=='PASS','productEditsBySol':0,'A1Accepted':False})
 print(json.dumps({'status':'CHECKS_COMPLETE','runtime':summary,'recordCount':len(records),'report':str(REPORT)}),flush=True)
if __name__=='__main__':main()
