# -*- coding: utf-8 -*-
"""Validate Sol controls; never runs enabled public owner against expired v4 locks."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess,sys,os,importlib.util
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v5';REPORT=DOC/'.ai/reports/phase3-2c-a1-v5-replan-20261012_231342'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
HEALTH_ROOT=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v5-selfcheck-oqzxy2wm')
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def fresh(path,data):
 with path.open('xb') as f:f.write(data)
def dump(path,value):fresh(path,(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def command(name,args,cwd=REPO,limit=60):
 if (REPORT/(name+'.stdout.txt')).exists():name=datetime.now().strftime('%Y%m%d_%H%M%S_')+name
 out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
 env=dict(os.environ)
 for key in list(env):
  if key.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or key in ('NODE_OPTIONS','NODE_DEBUG'):del env[key]
 env['PYTHONIOENCODING']='utf-8'
 with out.open('xb') as stdout,err.open('xb') as stderr:
  child=subprocess.Popen([str(v) for v in args],cwd=cwd,env=env,stdout=stdout,stderr=stderr)
  try:rc=child.wait(timeout=limit)
  except subprocess.TimeoutExpired:child.kill();child.wait();raise
 dump(REPORT/(name+'.command.json'),{'argv':[str(v) for v in args],'cwd':str(cwd),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'stdout':str(out),'stderr':str(err),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes())})
 assert rc==0,(name,err.read_text(encoding='utf-8',errors='replace'))
 return out.read_text(encoding='utf-8')
def main():
 syntax=[]
 for p in CTRL.glob('*.py'):compile(p.read_bytes(),str(p),'exec');syntax.append(p.name)
 for p in CTRL.glob('*.mjs'):command('syntax-'+p.stem,['node','--check',p]);syntax.append(p.name)
 exe=load(CTRL/'execution.json');h=sha((CTRL/'execution.json').read_bytes());zero='0'*64
 gate=json.loads(command('gate-parser',[PY,'-X','utf8','-B',CTRL/'gate-evidence.py','--execution-sha',h,'--self-test']))
 assert len(gate['result']['extraRejectedMutations'])==35 and gate['result']['v5ReceiptRules']['rejectedCount']==33
 parser=json.loads(command('runtime-parser',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',h,'--baseline-sha',zero,'--self-test']))
 plans={}
 plans['runtime']=json.loads(command('runtime-plan',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',h,'--baseline-sha',zero,'--list']))
 for name in ('ipc','component','partial'):plans[name]=json.loads(command(name+'-plan',['node',CTRL/(name+'-probes.mjs'),'--list']))
 assert len(plans['runtime']['faults'])==46 and len(plans['ipc']['cases'])==19 and plans['component']['additionalTypedMutations']==32 and len(plans['partial']['modes'])==7
 health=load(HEALTH_ROOT/'selfcheck-result.json');assert health['status']=='PASS' and health['bootstrapMode'] is True and health['proof']=='BOOTSTRAP_V4_CONTROL_ONLY_NOT_V5_ACCEPTANCE' and health['actualControlChecks']==len(health['records'])==39 and len(health['corruptedObservationVectorsRejected'])==9
 for name,expected in health['controlFiles'].items():assert sha((CTRL/name).read_bytes())==expected
 spec=importlib.util.spec_from_file_location('sol_v5_runtime',CTRL/'runtime-probes.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 for item in health['records']:
  assert item['acceptedControlCheck']
  if item['observerHealthy']:module.HEALTH.observer_health((HEALTH_ROOT/(item['name']+'.events.jsonl')).read_text(encoding='utf-8'),item['pid'],item['mode'],item['session'],item['rc'])
 try:module.validate_health_receipt(HEALTH_ROOT)
 except AssertionError:bootstrap_rejected=True
 else:raise AssertionError('Bootstrap receipt accepted as v5 runtime health')
 replay=json.loads(command('actual-v4-partial-coverage',['node',CTRL/'partial-probes.mjs','--bootstrap-v4'],limit=60).splitlines()[-1]);assert replay['status']=='EXPECTED_V4_REGRESSIONS_DETECTED' and replay['modes']==7
 red=load(Path(replay['artifact'])/'suite-result.json');assert all(r['detectedRegression'] and r['physical'] and not r['timedOut'] for r in red['results'])
 # Verify exact causes, not just any rc1 or assertion failure.
 for row in red['results']:
  if row['mode'] in plans['partial']['modes'][:5]:assert 'Acquired checks' in row['reason'] and row['partial']['checks']==[]
  elif row['mode']=='viewport-null':
   assert row['exit']['code']==0
   final=load(Path(row['runDir'])/'worker-final.json');assert final['status']=='PASS'
   events=[json.loads(v) for v in Path(row['eventsPath']).read_text(encoding='utf-8').splitlines()]
   assert any(e.get('marker')=='SOL_CORE_VIEWPORT_NULL' for e in events)
  else:assert row['partial'] is None and 'ENOENT' in row['reason']
 result={'status':'PASS','proof':'SOL_V5_CONTROL_VALIDATION_ONLY_NOT_PRODUCT_ACCEPTANCE','A1Accepted':False,'productEditsBySol':0,'syntax':syntax,'gateParser':gate['result'],'runtimeParser':parser,'plans':plans,'observerSummary':{'artifact':str(HEALTH_ROOT),'actualControlChecks':39,'rejectedCorruptions':9,'bootstrapMode':True,'runtimeRejectsBootstrap':bootstrap_rejected},'partialReplay':replay,'partialReplayReceipt':str(Path(replay['artifact'])/'suite-result.json'),'controlHashes':{p.name:sha(p.read_bytes()) for p in CTRL.iterdir() if p.is_file()}}
 target=REPORT/'control-validation.json'
 if target.exists():target=REPORT/'control-validation-final.json'
 dump(target,result);print(json.dumps({'status':'PASS','syntaxFiles':len(syntax),'observer':39,'recordCorruptions':9,'parserNewNegative':33,'actualV4Regressions':7,'report':str(REPORT)},ensure_ascii=False))
if __name__=='__main__':main()
