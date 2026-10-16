"""Focused actual-SUT probes through new Sol control copies; no source/control edits."""
from datetime import datetime,timezone
import importlib.util,json,os,subprocess,sys,uuid
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;DOC=HERE.parents[2];REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v3'
spec=importlib.util.spec_from_file_location('health',CTRL/'observer-selfcheck.py');HEALTH=importlib.util.module_from_spec(spec);spec.loader.exec_module(HEALTH)
dispatch=json.loads((DOC/'.ai/reports/phase3-2c-a1-replan-20261012_110625/dispatch.json').read_text(encoding='utf-8'))
def run(name,preload,mode):
 env=dict(os.environ)
 for k in list(env):
  if k.startswith(('SOL_A1_','SHIFT_','SHIFTMGMT_')) or k in ('NODE_OPTIONS','NODE_DEBUG'):del env[k]
 session=uuid.uuid4().hex;event=HERE/(name+'.events.jsonl');out=HERE/(name+'.stdout.txt');err=HERE/(name+'.stderr.txt')
 env.update(SOL_A1_PROBE=mode,SOL_A1_PROBE_SESSION=session,SOL_A1_PROBE_EVENTS=str(event),PYTHONIOENCODING='utf-8')
 argv=['node','--import',preload.as_uri(),'scripts/ui-checks/access-history.mjs','--case=contract-core']
 with out.open('xb') as stdout,err.open('xb') as stderr:
  child=subprocess.Popen(argv,cwd=REPO,env=env,stdout=stdout,stderr=stderr);start=datetime.now(timezone.utc).isoformat()
  try:rc=child.wait(timeout=90)
  except subprocess.TimeoutExpired:
   child.kill();child.wait(timeout=10);raise RuntimeError('STOP timeout/descendants unverified; retain all')
 rows=HEALTH.observer_health(event.read_text(encoding='utf-8'),child.pid,mode,session,rc)
 record={'name':name,'argv':argv,'cwd':str(REPO),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'observerHealthy':True,'triggered':any(r['type']=='fault-triggered' for r in rows),'stdout':str(out),'stderr':str(err),'events':str(event),'output':out.read_text(encoding='utf-8'),'errors':err.read_text(encoding='utf-8'),'hiddenLogClose':sum(r['type']=='actual-log-close' and r.get('hiddenFromSut') is True for r in rows)}
 assert record['triggered'],'Required fault not actually delivered'
 if rc==0:
  result=json.loads(record['output']);manifest=result['manifestPath'];record['manifestPath']=manifest
  gate=[sys.executable,'-B',str(CTRL/'gate-evidence.py'),'--execution-sha',dispatch['executionSha256'],'--baseline-sha',dispatch['baselineSha256'],'--final',manifest]
  checked=subprocess.run(gate,cwd=REPO,capture_output=True,text=True,encoding='utf-8',timeout=30)
  record['independentFinal']={'argv':gate,'rc':checked.returncode,'stdout':checked.stdout,'stderr':checked.stderr}
 (HERE/(name+'.command.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in record.items() if k not in ('argv','independentFinal','errors')},ensure_ascii=False),flush=True)
 return record
records=[]
for name,file,mode in [('gate-outer-extra','outer-gate-preload.mjs','gate-response-extra'),('log-close-unobserved','unobserved-log-close-preload.mjs','log-finish-not-observed')]:records.append(run(name,HERE/file,mode))
(HERE/'extra-runtime-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
