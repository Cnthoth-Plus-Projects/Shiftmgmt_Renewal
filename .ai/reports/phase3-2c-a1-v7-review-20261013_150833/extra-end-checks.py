# -*- coding: utf-8 -*-
"""Explicit real-owner stream.end exceptions; sealed v7 controls stay unchanged."""
from pathlib import Path
import importlib.util,json,tempfile,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7'
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
    source=(CTRL/'runtime-preload.mjs').read_bytes()+b'\n'+b'''
const solEndStream=fs.createWriteStream;
fs.createWriteStream=function(file,...args){
 const stream=solEndStream(file,...args),name=path.basename(String(file));
 const wanted=mode==='sol-direct-server-end-throw'?'server-stdout.log':'worker-stdout.log';
 if(name===wanted){const end=stream.end.bind(stream);let delivered=false;
  stream.end=function(...values){if(!delivered){delivered=true;const error=new Error('SOL_DIRECT_STREAM_END_THROW_'+name);note('sol-end-error-delivery',{path:String(file),name:error.name,message:error.message,stack:error.stack});trigger({path:String(file)});throw error;}return end(...values);};
 }
 return stream;
};
syncBuiltinESMExports();
'''
    with (REPORT/'runtime-preload.mjs').open('xb') as f:f.write(source)
    spec=importlib.util.spec_from_file_location('sol_v7_end_probes',CTRL/'runtime-probes.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r);r.HERE=REPORT
    root=Path(tempfile.mkdtemp(prefix='shiftmgmt-sol-v7-direct-end-'));results=[]
    for mode in ('sol-direct-server-end-throw','sol-direct-worker-end-throw'):
        record,rows=r.run(root,mode,['node','scripts/ui-checks/access-history.mjs','--case=contract-core'],mode,120)
        assert record['rc']==1 and not record['timeout'] and record['observerHealthy'] and record['faultTriggered'] and record['quiescenceObserved']
        delivered=[e for e in rows if e['type']=='sol-end-error-delivery'];assert len(delivered)==1
        runs=[Path(e['result']) for e in rows if e['type']=='directory-created' and Path(e['result']).parent==r.REPO/'artifacts/captures/phase3/access-history-contract-core'];assert len(runs)==1
        run=runs[0];failure=load(run/'owner-failure.json')
        assert failure['status']=='FAIL' and failure['errors']['primary']['code']=='A1_LOG_WRITE_FAILED'
        assert failure['errors']['primary']['stack']==delivered[0]['stack'] and failure['errors']['primary']['message']==delivered[0]['message']
        assert failure['cleanup']['tempRemoved'] is False and Path(failure['owner']['context']['tempDir']).exists()
        assert not (run/'owner-final.json').exists() and not (run/'owner-candidate.json').exists()
        assert r.core_failure_binding(failure,rows) and failure['raw'] is not None and len(failure['checks'])==9
        actor=failure['server' if 'server' in mode else 'worker']
        assert actor['logCloseSeen']=={'stdout':True,'stderr':True} and actor['logFinishSeen']=={'stdout':False,'stderr':True}
        assert any(e['event']=='log-error' and e['error']['stack']==delivered[0]['stack'] for e in actor['callbackEvents'])
        results.append({'mode':mode,'record':record,'runDir':str(run),'delivery':delivered[0],'failurePath':str(run/'owner-failure.json'),'bothLogsPhysicallyClosed':True,'originalStackPreserved':True,'coreStatePreserved':True,'tempPreserved':True})
    result={'status':'PASS','proof':'ACTUAL_UNCHANGED_POST_DIRECT_OWNER_WITH_EXPLICIT_STREAM_END_THROW_NOT_SPONTANEOUS_OS_ERROR','artifact':str(root),'results':results,'productEditsByProbe':0}
    dump(root/'extra-result.json',result);dump(REPORT/'extra-end-summary.json',result)
    print(json.dumps({'status':'PASS','artifact':str(root),'realOwnerCases':2}),flush=True)
if __name__=='__main__':main()
