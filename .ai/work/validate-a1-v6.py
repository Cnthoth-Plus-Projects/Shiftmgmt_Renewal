# -*- coding: utf-8 -*-
"""Validate v6 Sol controls and exact v5 bootstrap evidence; no product acceptance."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess,sys,os,importlib.util
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
CTRL=DOC/'.ai/contracts/phase3-2c-a1-v6';REPORT=DOC/'.ai/reports/phase3-2c-a1-v6-replan-20261013_100555'
PY=Path(r'C:\Users\pangyo\anaconda3\python.exe')
HEALTH_ROOT=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v6-selfcheck-vm84rdbr')
PARTIAL_ROOT=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v6-partial-V5XVZ7')
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def fresh(path,data):
 with path.open('xb') as f:f.write(data)
def dump(path,value):fresh(path,(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def command(name,args,limit=60):
 out=REPORT/(name+'.stdout.txt');err=REPORT/(name+'.stderr.txt');start=datetime.now(timezone.utc).isoformat()
 receipt=REPORT/(name+'.command.json')
 if receipt.exists():
  previous=load(receipt);assert previous['argv']==[str(a) for a in args] and previous['rc']==0 and previous['stdoutSha256']==sha(out.read_bytes()) and previous['stderrSha256']==sha(err.read_bytes())
  return out.read_text(encoding='utf-8')
 env=dict(os.environ)
 for key in list(env):
  if key.startswith(('SOL_','SHIFT_','SHIFTMGMT_')) or key in ('NODE_OPTIONS','NODE_DEBUG'):del env[key]
 env['PYTHONIOENCODING']='utf-8'
 with out.open('xb') as stdout,err.open('xb') as stderr:
  child=subprocess.Popen([str(a) for a in args],cwd=REPO,env=env,stdout=stdout,stderr=stderr)
  try:rc=child.wait(timeout=limit)
  except subprocess.TimeoutExpired:child.kill();child.wait();raise
 dump(REPORT/(name+'.command.json'),{'argv':[str(a) for a in args],'cwd':str(REPO),'pid':child.pid,'start':start,'end':datetime.now(timezone.utc).isoformat(),'rc':rc,'stdout':str(out),'stderr':str(err),'stdoutSha256':sha(out.read_bytes()),'stderrSha256':sha(err.read_bytes())})
 assert rc==0,(name,err.read_text(encoding='utf-8',errors='replace'))
 return out.read_text(encoding='utf-8')
def main():
 syntax=[]
 for path in sorted(CTRL.glob('*.py')):compile(path.read_bytes(),str(path),'exec');syntax.append(path.name)
 for path in sorted(CTRL.glob('*.mjs')):command('syntax-'+path.stem,['node','--check',path]);syntax.append(path.name)
 exe=load(CTRL/'execution.json');h=sha((CTRL/'execution.json').read_bytes());zero='0'*64
 gate=json.loads(command('gate-parser',[PY,'-X','utf8','-B',CTRL/'gate-evidence.py','--execution-sha',h,'--self-test']))
 assert len(gate['result']['extraRejectedMutations'])==35 and gate['result']['v6ReceiptRules']['rejectedCount']==43
 parser=json.loads(command('runtime-parser',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',h,'--baseline-sha',zero,'--self-test']))
 assert parser['observationRules']['rejectedCount']==13
 plans={}
 plans['runtime']=json.loads(command('runtime-plan',[PY,'-X','utf8','-B',CTRL/'runtime-probes.py','--execution-sha',h,'--baseline-sha',zero,'--list']))
 for name in ('ipc','component','partial'):plans[name]=json.loads(command(name+'-plan',['node',CTRL/(name+'-probes.mjs'),'--list']))
 assert exe['executionVersion']==6 and len(plans['runtime']['faults'])==51 and len(plans['ipc']['cases'])==19 and plans['component']['additionalTypedMutations']==32 and len(plans['partial']['modes'])==11
 health=load(HEALTH_ROOT/'selfcheck-result.json');assert health['status']=='PASS' and health['bootstrapMode'] is True and health['proof']=='BOOTSTRAP_V5_CONTROL_ONLY_NOT_V6_ACCEPTANCE' and health['actualControlChecks']==len(health['records'])==45 and len(health['corruptedObservationVectorsRejected'])==9
 for name,expected in health['controlFiles'].items():assert sha((CTRL/name).read_bytes())==expected,name
 spec=importlib.util.spec_from_file_location('sol_v6_runtime',CTRL/'runtime-probes.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 for item in health['records']:
  assert item['acceptedControlCheck']
  if item['observerHealthy']:module.HEALTH.observer_health((HEALTH_ROOT/(item['name']+'.events.jsonl')).read_text(encoding='utf-8'),item['pid'],item['mode'],item['session'],item['rc'])
 try:module.validate_health_receipt(HEALTH_ROOT)
 except AssertionError:bootstrap_rejected=True
 else:raise AssertionError('Bootstrap accepted as product runtime health')
 red=load(PARTIAL_ROOT/'suite-result.json');assert red['status']=='EXPECTED_V5_REGRESSIONS_DETECTED' and red['proof']=='BOOTSTRAP_V5_CONTROL_ONLY_NOT_V6_ACCEPTANCE' and len(red['results'])==4
 for row in red['results']:assert row['bootstrap'] and row['baselineGap'] and row['physical'] and not row['accepted'] and not row['timedOut']
 # Preserve full actual control/worker receipts and hashes in the immutable replan report.
 dump(REPORT/'observer-control-receipt.json',health);dump(REPORT/'partial-bootstrap-receipt.json',red)
 result={'status':'PASS','proof':'SOL_V6_CONTROL_VALIDATION_ONLY_NOT_PRODUCT_ACCEPTANCE','A1Accepted':False,'productEditsBySol':0,'syntax':syntax,'gateParser':gate['result'],'runtimeParser':parser,'plans':plans,'observerSummary':{'artifact':str(HEALTH_ROOT),'actualControlChecks':45,'rejectedCorruptions':9,'bootstrapMode':True,'runtimeRejectsBootstrap':bootstrap_rejected},'partialReplay':{'artifact':str(PARTIAL_ROOT),'status':red['status'],'actualV5Regressions':4},'controlHashes':{p.name:sha(p.read_bytes()) for p in CTRL.iterdir() if p.is_file()},'initialObserverFailure':{'artifact':r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v6-selfcheck-6j_wvxie','cause':'server sentinel lacked ./ role discriminator; Sol control corrected and full45 rerun; failed run retained'}}
 dump(REPORT/'control-validation.json',result)
 print(json.dumps({'status':'PASS','syntaxFiles':len(syntax),'observer':45,'recordCorruptions':9,'parserNewNegative':43,'observationParserNegative':13,'actualV5Regressions':4,'report':str(REPORT)},ensure_ascii=False))
if __name__=='__main__':main()
