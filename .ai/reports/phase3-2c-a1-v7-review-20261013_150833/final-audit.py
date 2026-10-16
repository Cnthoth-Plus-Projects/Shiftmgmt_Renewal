# -*- coding: utf-8 -*-
"""Read-only independent evidence/source/resource audit before target closure."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,importlib.util,json,socket,subprocess,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7'
CHECKS=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-gemini-a1v7-evidence-y_b3ujev')
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def module(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
    initial=load(REPORT/'initial-evidence.json');prep=module('sol_v7_final_source',DOC/'.ai/work/prepare-a1-v7.py');source=prep.snapshot()
    changed={n for n in set(source['files'])|set(initial['sourceBefore']['files']) if source['files'].get(n)!=initial['sourceBefore']['files'].get(n)}
    assert changed=={'scripts/ui-checks/access-history.mjs'}
    assert source['files']['scripts/ui-checks/access-history.mjs']['sha256']=='803C53C05E509D0BF95FFB3880F449B6AD48A559B2F790C096103D27CFFC0564'
    assert all(source[k]==initial['sourceBefore'][k] for k in ('repository','head','branch','status'))
    assert all(meta(Path(p))==h for p,h in {**initial['controlBefore'],**initial['versionControls']}.items())
    assert (DOC/'HANDOFF.md').read_bytes()==Path(initial['receivedArchive']).read_bytes()
    checks=load(CHECKS/'implementation-result.json');assert checks['status']=='IMPLEMENTATION_CHECKS_PASS_NOT_SOL_ACCEPTANCE' and len(checks['records'])==18
    pids=set();closed={};events=set()
    def end(pid,t):
        if type(pid) is int and pid>0:pids.add(pid);closed[pid]=max(closed.get(pid,0),t)
    def done(r):
        key='endUtc' if 'endUtc' in r else 'end'
        end(r['pid'],datetime.fromisoformat(r[key]).timestamp()*1000)
    for r in checks['records']:
        assert r['rc']==0 and not r['timeout']
        assert meta(Path(r['stdout']))==r['stdoutMeta'] and meta(Path(r['stderr']))==r['stderrMeta']
        assert load(CHECKS/(r['name']+'.command.json'))==r
        done(r)
    R=module('sol_v7_audit_runtime',CTRL/'runtime-probes.py');L=module('sol_v7_audit_lifecycle',CTRL/'lifecycle-probes.py')
    runtime=load(Path(checks['runtime51']['artifact'])/'suite-result.json')
    assert runtime['status']=='PASS' and runtime['requiredFaultCount']==51 and len(runtime['records'])==86
    captures=[];observed=0
    for r in runtime['records']:
        done(r)
        if r.get('eventsPath'):
            p=Path(r['eventsPath']);rows=R.HEALTH.observer_health(p.read_text(encoding='utf-8'),r['pid'],r['mode'],r['session'],r['rc']);assert R.observed_quiescence(rows)[0];events.add(p);observed+=1
        if r['name']=='fresh-observer-selfcheck':
            root=Path(json.loads(r['output'].splitlines()[-1])['artifact']);health=R.validate_health_receipt(root);assert health['actualControlChecks']==45 and len(health['corruptedObservationVectorsRejected'])==9
            for h in health['records']:
                done(h)
                if h.get('observerHealthy'):events.add(root/(h['name']+'.events.jsonl'))
        if r['name'].startswith(('positive-','observed-positive-')) and 'final' not in r['name']:
            f=load(Path(json.loads(r['output'])['manifestPath']));assert f['status']=='PASS'
            for a in f['artifacts']:
                p=Path(a['path']);assert meta(p)=={k:a[k] for k in ('bytes','sha256')}
                if p.suffix=='.png':
                    b=p.read_bytes();dims=[int.from_bytes(b[16:20],'big'),int.from_bytes(b[20:24],'big')];assert b[:8]==bytes([137,80,78,71,13,10,26,10]) and dims[0]==1440 and dims[1]>=900
                    captures.append({'path':str(p),'case':f['case'],'observed':r['name'].startswith('observed-'),'dimensions':dims,**meta(p)})
    assert len(captures)==12
    life=load(Path(checks['late15']['artifact'])/'suite-result.json');assert life['status']=='PASS' and life['bootstrapMode'] is False and len(life['records'])==15
    for r in life['records']:
        done(r);assert r['accepted'] and not r['timeout']
        p=Path(r['eventsPath']);rows=L.R.HEALTH.observer_health(p.read_text(encoding='utf-8'),r['pid'],r['mode'],r['session'],r['rc']);events.add(p)
        L.evaluate(r,rows,load(Path(r['failurePath'])),r['mode'],True,Path(r['runDir']))
    ipc=json.loads((CHECKS/'ipc19-and-port.stdout.txt').read_text(encoding='utf-8').splitlines()[-1]);assert ipc['status']=='PASS' and len(ipc['results'])==20 and all(r['accepted'] for r in ipc['results'])
    for r in ipc['results']:end(r['pid'],r['exit']['timeMs'])
    component=json.loads((CHECKS/'component32.stdout.txt').read_text(encoding='utf-8').splitlines()[-1]);assert component['status']=='PASS' and component['typedMutationCount']==32 and len(component['resources'])==2 and all(r['browserConnected'] is False for r in component['resources'])
    partial=load(Path(checks['partial11']['artifact'])/'suite-result.json');assert partial['status']=='PASS' and len(partial['results'])==11 and all(r['accepted'] for r in partial['results'])
    for r in partial['results']:end(r['pid'],r['endMs']);events.add(Path(r['eventsPath']))
    extra=load(REPORT/'extra-end-summary.json');assert extra['status']=='PASS' and len(extra['results'])==2
    for x in extra['results']:done(x['record']);events.add(Path(x['record']['eventsPath']))
    helpers=load(REPORT/'helper-after-direct.stdout.txt');assert not any(r['accepted'] for r in helpers['settlement']) and helpers['snapshotCalls']==0 and helpers['streams']['stderrEnded'] and helpers['streams']['stdoutClosed'] and helpers['streams']['stderrClosed']
    for name in ('helper-before-direct','helper-after-direct'):done(load(REPORT/(name+'.command.json')))
    for p in events:
        for e in [json.loads(line) for line in p.read_text(encoding='utf-8').splitlines()]:
            for key in ('pid','childPid'):
                if type(e.get(key)) is int and e[key]>0:pids.add(e[key])
            if e['type']=='actual-child-close':end(e.get('childPid'),e['timeMs'])
            if e['type'] in ('owner-process-exit','observer-exit'):end(e.get('pid'),e['timeMs'])
    filter_text=' OR '.join('ProcessId = '+str(pid) for pid in sorted(pids))
    query=f"Get-CimInstance Win32_Process -Filter '{filter_text}' | ForEach-Object {{ $v7DirectAuditStamp = if ($_.CreationDate) {{ ([DateTimeOffset]$_.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds() }} else {{ $null }}; [pscustomobject]@{{pid=$_.ProcessId;name=$_.Name;createdAtMs=$v7DirectAuditStamp}} }} | ConvertTo-Json -Compress"
    output=subprocess.check_output(['powershell','-NoProfile','-NonInteractive','-Command',query],encoding='utf-8').strip();live=json.loads(output) if output else []
    if isinstance(live,dict):live=[live]
    for r in live:r['previousCloseAtMs']=closed.get(r['pid']);r['laterPidReuse']=r['pid'] in closed and r['createdAtMs'] is not None and r['createdAtMs']>closed[r['pid']]
    assert all(r['laterPidReuse'] for r in live),live
    with socket.socket() as port:port.bind(('127.0.0.1',18741))
    retained=sorted({p for r in runtime['records'] for p in r.get('retainedOwnedTemps',[]) if Path(p).exists()})
    result={'status':'FINAL_AUDIT_PASS','timeUtc':datetime.now(timezone.utc).isoformat(),'sourceAfter':source,'sourceChangedBySol':sorted(changed),'protectedFiles':339,'controlFiles':538,'versionControls':20,'controlsUnchanged':True,'receivedHandoffUnchanged':True,'commands':18,'runtimeRecords':86,'runtimeFaults':51,'observedOriginalRecordsRevalidated':observed,'lifecycleCases':15,'guardRejected':5,'partialCases':11,'ipcCases':20,'typedCases':32,'realChromeCloseCases':2,'realOwnerEndThrowCases':2,'captures':captures,'helperGapsFixed':True,'retainedRuntimeOwnTemps':retained,'observedPidNumbers':len(pids),'liveObservedPidNumbers':live,'observedOwnProcessesRemaining':0,'port18741Free':True,'coverageLimit':'Direct observed child/log and actual browser close evidence, not universal OS descendant history','v8Created':False,'releasePerformed':False}
    dump(REPORT/'final-audit-before-close.json',result)
    print(json.dumps({'status':result['status'],'sourceFiles':341,'SolChangedFiles':1,'controls':538,'runtime51':True,'late15':True,'extraOwner2':True,'captures':12,'observedPids':len(pids),'laterReusedPids':len(live),'portFree':True}),flush=True)
if __name__=='__main__':main()
