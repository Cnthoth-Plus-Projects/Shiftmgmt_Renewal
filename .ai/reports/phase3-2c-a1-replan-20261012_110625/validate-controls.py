"""Sol control validation only. No product implementation or A1 runtime acceptance."""
from datetime import datetime,timezone
import hashlib,importlib.util,json,os,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템')
HERE=DOC/'.ai/contracts/phase3-2c-a1-v3'
REPORT=Path(__file__).resolve().parent
ENV=dict(os.environ);ENV['PYTHONIOENCODING']='utf-8'
for key in list(ENV):
    if key.startswith(('SOL_A1_','SHIFT_','SHIFTMGMT_')) or key in ('NODE_OPTIONS','NODE_DEBUG'):del ENV[key]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
records=[]
for p in sorted(HERE.glob('*.py')):compile(p.read_text(encoding='utf-8'),str(p),'exec')
commands=[['node','--check',str(p)] for p in sorted(HERE.glob('*.mjs'))]
execution_sha=sha(HERE/'execution.json')
commands += [[sys.executable,'-B',str(HERE/'gate-evidence.py'),'--execution-sha',execution_sha,'--self-test'],
 [sys.executable,'-B',str(HERE/'runtime-probes.py'),'--execution-sha',execution_sha,'--baseline-sha','PARSER_ONLY','--self-test'],
 [sys.executable,'-B',str(HERE/'runtime-probes.py'),'--execution-sha',execution_sha,'--baseline-sha','PLAN_ONLY','--list'],
 ['node',str(HERE/'ipc-probes.mjs'),'--list'],['node',str(HERE/'component-probes.mjs'),'--list']]
for argv in commands:
    result=subprocess.run(argv,cwd=DOC,env=ENV,capture_output=True,text=True,encoding='utf-8',timeout=30)
    records.append({'argv':argv,'cwd':str(DOC),'time':datetime.now(timezone.utc).isoformat(),'rc':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
    if result.returncode:raise AssertionError(records[-1])
health_path=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v3-selfcheck-824exbx3\selfcheck-result.json')
health=json.loads(health_path.read_text(encoding='utf-8'))
assert health['status']=='PASS' and health['actualControlChecks']==35 and len(health['corruptedObservationVectorsRejected'])==9
for name,expected in health['controlFiles'].items():assert sha(HERE/name)==expected
spec=importlib.util.spec_from_file_location('runtime_control',HERE/'runtime-probes.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.validate_health_receipt(health_path.parent)
copy=REPORT/'observer-selfcheck-result.json'
if copy.exists():assert copy.read_bytes()==health_path.read_bytes()
else:copy.write_bytes(health_path.read_bytes())
result={'status':'PASS','time':datetime.now(timezone.utc).isoformat(),'proof':'CONTROL_SYNTAX_PARSER_PLANS_AND_ACTUAL_OBSERVER_HEALTH_ONLY_NOT_A1_ACCEPTANCE',
 'pythonCompiled':len(list(HERE.glob('*.py'))),'commands':records,'observerReceipt':str(copy),'observerReceiptSha256':sha(copy),
 'observerExternalArtifact':str(health_path.parent),'actualControlChecks':35,'rejectedObservationCorruptions':9,
 'A1ImplementationExecuted':False,'A1Accepted':False,'productEditsBySol':0}
(REPORT/'control-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'PASS','commands':len(records),'pythonCompiled':result['pythonCompiled'],'actualControlChecks':35,'rejectedCorruptions':9,'proof':result['proof']}))
