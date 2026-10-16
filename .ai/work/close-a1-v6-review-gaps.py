# -*- coding: utf-8 -*-
"""Close Sol control review gaps before v6 sealing; no product changes."""
from pathlib import Path
CTRL=Path(r'C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a1-v6')
def replace(name,old,new):
 p=CTRL/name;s=p.read_text(encoding='utf-8');assert s.count(old)==1,(name,old);p.write_bytes(s.replace(old,new).encode('utf-8'))
replace('runtime-preload.mjs',"fs.readFileSync=function(file,...args){if(/^(worker|server|adjudicator)-(stdout|stderr)\\.log$/.test(path.basename(String(file))))note('log-artifact-read',{path:String(file)});return instrumentedRead(file,...args);};",r"""function readAttempt(file){if(/^(worker|server|adjudicator)-(stdout|stderr)\.log$/.test(path.basename(String(file))))note('log-artifact-read',{path:String(file)});}
function acquiredRead(file,value){
 const absolute=path.resolve(String(file)),name=path.basename(absolute);
 if(createdRuns.has(path.dirname(absolute))&&['core-observations.json','worker-final.json','core-partial.json','core-partial.fallback.json'].includes(name)){
  const parsed=JSON.parse(Buffer.isBuffer(value)?value.toString('utf8'):value);
  note('core-evidence-acquired',{path:absolute,value:parsed});
 }
 return value;
}
fs.readFileSync=function(file,...args){readAttempt(file);return acquiredRead(file,instrumentedRead(file,...args));};
const instrumentedAsyncRead=fs.promises.readFile.bind(fs.promises);
fs.promises.readFile=async function(file,...args){readAttempt(file);return acquiredRead(file,await instrumentedAsyncRead(file,...args));};""")
replace('runtime-probes.py','def observed_artifact_order(rows):','def observed_artifact_order(rows, require_all=False):')
replace('runtime-probes.py',"    for read in (r for r in rows if r['type']=='log-artifact-read'):","""    reads=[r for r in rows if r['type']=='log-artifact-read']
    required={role+'-'+stream+'.log' for role in ('worker','server','adjudicator') for stream in ('stdout','stderr')}
    if require_all and {Path(r['path']).name for r in reads}!=required:return False,'Required six actual log artifact reads absent'
    for read in reads:""")
replace('runtime-probes.py','not observed_artifact_order(rows)[0] or not observed_publication(rows)','not observed_artifact_order(rows,require_all=True)[0] or not observed_publication(rows)')
replace('runtime-probes.py','def run(folder,name,argv,mode=None,limit=310):',"""def core_failure_binding(partial,rows,run_dir=None):
    if partial.get('case')!='contract-core':return True
    acquired={}
    for row in rows:
        if row['type']=='core-evidence-acquired':acquired.setdefault(Path(row['path']).name,(row['path'],row['value']))
    if run_dir is not None:
        for name in ('core-partial.json','core-partial.fallback.json','core-observations.json','worker-final.json'):
            path=run_dir/name
            if path.is_file() and name not in acquired:acquired[name]=(str(path),json.loads(path.read_text(encoding='utf-8')))
    worker_partial=next((acquired[n] for n in ('core-partial.json','core-partial.fallback.json') if n in acquired),None)
    if worker_partial:
        path,value=worker_partial
        return partial.get('workerPartialPath')==path and all(partial.get(k)==value.get(k) for k in ('raw','checks','acquisition')) and value.get('raw') is not None and value.get('acquisition') is not None
    if 'worker-final.json' in acquired or 'core-observations.json' in acquired:
        if not {'worker-final.json','core-observations.json'}<=set(acquired):return False
        raw=acquired['core-observations.json'][1];worker=acquired['worker-final.json'][1]
        return partial.get('raw')==raw and partial.get('checks')==worker.get('checks') and partial.get('acquisition')==worker.get('acquisition') and raw is not None and worker.get('acquisition') is not None and partial.get('workerPartialPath') is None
    return partial.get('raw') is None and partial.get('checks')==[] and partial.get('acquisition') is None and partial.get('workerPartialPath') is None

def observation_self_test():
    rows=[]
    def add(kind,**data):rows.append({'type':kind,'seq':len(rows)+1,**data})
    for actor,role in enumerate(('server','worker','adjudicator'),1):
        add('actual-child-close',server=role=='server',gate=role=='adjudicator')
        for stream in ('stdout','stderr'):
            ident=str(actor)+stream;file='run/'+role+'-'+stream+'.log'
            add('log-stream-created',streamId=ident,path=file)
            add('actual-log-finish',streamId=ident);add('actual-log-close',streamId=ident)
            add('log-artifact-read',path=file)
    for name in ('owner-candidate.json','owner-final.json'):
        file='run/'+name;add('file-write',path=file+'.tmp',operation='write')
        add('file-write',path=file,operation='rename',**{'from':file+'.tmp'})
        add('file-rename-complete',path=file,**{'from':file+'.tmp'})
    assert observed_artifact_order(rows,True)[0] and observed_publication(rows)
    rejected=[]
    for label,bad in [
        ('no-reads',[r for r in rows if r['type']!='log-artifact-read']),
        ('missing-stderr-read',[r for r in rows if not (r['type']=='log-artifact-read' and r['path']=='run/worker-stderr.log')]),
        ('missing-child-close',[r for r in rows if not (r['type']=='actual-child-close' and r['server'])]),
        ('missing-log-close',[r for r in rows if r['type']!='actual-log-close']),
        ('early-read',[{**r,'seq':0} if r['type']=='log-artifact-read' else r for r in rows])]:
        assert not observed_artifact_order(bad,True)[0];rejected.append(label)
    for label,bad in [
        ('direct-candidate-write',[{**r,'operation':'write'} if r['type']=='file-write' and r.get('path')=='run/owner-candidate.json' else r for r in rows]),
        ('missing-rename-completion',[r for r in rows if r['type']!='file-rename-complete']),
        ('early-rename',[{**r,'seq':0} if r['type']=='file-write' and r.get('operation')=='rename' else r for r in rows]),
        ('wrong-stage',[{**r,'from':'other.tmp'} if r['type']=='file-rename-complete' else r for r in rows])]:
        assert not observed_publication(bad);rejected.append(label)
    raw={'captured':'actual'};checks=[{'id':'CORE-01'}];acq={'fixtureRows':[],'fixtureRequests':[],'routeInstalled':True}
    owner={'case':'contract-core','raw':raw,'checks':checks,'acquisition':acq,'workerPartialPath':None}
    evidence=[{'type':'core-evidence-acquired','path':'run/core-observations.json','value':raw},{'type':'core-evidence-acquired','path':'run/worker-final.json','value':{'checks':checks,'acquisition':acq}}]
    assert core_failure_binding(owner,evidence)
    for key,value in [('raw',None),('checks',[]),('acquisition',None)]:
        assert not core_failure_binding({**owner,key:value},evidence);rejected.append('lost-'+key)
    part={**owner,'workerPartialPath':'run/core-partial.json'}
    partial_rows=[{'type':'core-evidence-acquired','path':'run/core-partial.json','value':part}]
    assert core_failure_binding(part,partial_rows)
    assert not core_failure_binding({**part,'workerPartialPath':None},partial_rows);rejected.append('lost-partial-path')
    return {'proof':'PARSER_ONLY_NOT_SUT_EXECUTION','orderingPublicationPositive':1,'coreBindingPositives':2,'rejectedCount':len(rejected),'rejected':rejected}

def run(folder,name,argv,mode=None,limit=310):""")
replace('runtime-probes.py','rich_failure(partial,r,rows,mode) and Path','rich_failure(partial,r,rows,mode) and core_failure_binding(partial,rows,run_roots[0]) and Path')
replace('runtime-probes.py',"'richFailureRejected':rich_rejected}","'richFailureRejected':rich_rejected,'observationRules':observation_self_test()}")
replace('gate-evidence.py',"'v5ReceiptRules'","'v6ReceiptRules'")
replace('STRATEGY.md','v1期待값','v1 기대값')
replace('STRATEGY.md','관측양성3에서는actualchildclose와양logfinish/close 뒤log-artifact-read,','관측양성3에서는 worker/server/adjudicator의 stdout/stderr 실제log읽기6종을 모두 요구한다. sync/async read를관측하며 미관측읽기는통과시키지않는다. actualchildclose와양logfinish/close 뒤log-artifact-read,')
replace('STRATEGY.md','artifact/publish관측validator의순수양성·순서/직접write음성도검문한다.','artifact/publish관측validator 및 CORE실패획득증거binding의순수양성3/음성13도검문한다. 후반실패 raw/checks/acquisition은 worker파일의 최초실제읽기 관측값과exact대조하고 core-partial경로도보존한다. fault에 의한사후artifact변조는 최초읽기값을대체하지않는다.')
print('Sol v6 control gaps closed; product writes 0')
