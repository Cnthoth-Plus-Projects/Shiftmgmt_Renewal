# -*- coding: utf-8 -*-
from pathlib import Path
import json,importlib.util,subprocess,copy,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;CTRL=REPORT.parent.parent.parent/'.ai/contracts/phase3-2c-a1-v6'
spec=importlib.util.spec_from_file_location('sol_v6_receipts',CTRL/'evidence-v6.py');E=importlib.util.module_from_spec(spec);spec.loader.exec_module(E)
base={**E.sample_process(),'aliveAfterClose':False,'logsSettled':{'stdout':True,'stderr':True}}
vectors=[{'name':'valid','record':base,'expectedReject':False}]
record=copy.deepcopy(base);record['pid']=202.5
for event in record['callbackEvents']:
 if event['pid'] is not None:event['pid']=202.5
vectors.append({'name':'noninteger-pid','record':record,'expectedReject':True})
for key in ('logFinishSeen','logCloseSeen','logFinishAtMs','logCloseAtMs'):
 record=copy.deepcopy(base);record[key]['unapproved']=record[key]['stdout'];vectors.append({'name':'extra-'+key,'record':record,'expectedReject':True})
for vector in vectors:
 try:E.process_receipt(vector['record'],True);vector['fixedHelperAccepted']=True
 except ValueError as error:vector['fixedHelperAccepted']=False;vector['fixedHelperError']=str(error)
 assert vector['fixedHelperAccepted'] is not vector['expectedReject']
with (REPORT/'pure-guard-input.json').open('x',encoding='utf-8') as f:json.dump(vectors,f,ensure_ascii=False,indent=2)
output=subprocess.check_output(['node',str(REPORT/'pure-guard.mjs'),str(REPORT/'pure-guard-input.json')],cwd=r'C:\Projects\Active\ShiftMgmt_V4',encoding='utf-8')
result=json.loads(output);assert all(v['accepted'] for v in result['results'])
result['fixedHelperResults']=vectors;result['finding']='OWNER_LOCAL_GUARD_ACCEPTS_FIVE_RECORDS_REJECTED_BY_FIXED_RECEIPT_HELPER'
with (REPORT/'pure-guard-result.json').open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'proof':result['proof'],'positive':1,'invalidAccepted':5,'fixedHelperRejected':5}))
