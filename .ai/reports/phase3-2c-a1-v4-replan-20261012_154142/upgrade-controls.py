# -*- coding: utf-8 -*-
"""Upgrade only new v4 control copies; historical inputs/product are immutable."""
import json,sys
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
CTRL=HERE.parent.parent/'contracts/phase3-2c-a1-v4'
def edit(name,changes):
    p=CTRL/name;s=p.read_text(encoding='utf-8')
    for old,new in changes:
        assert old in s,(name,old[:90]);s=s.replace(old,new)
    p.write_bytes(s.encode('utf-8'))
def main():
    execution=json.loads((CTRL/'execution.json').read_text(encoding='utf-8'))
    execution['runtimeFaultsRequired']=44
    (CTRL/'execution.json').write_bytes((json.dumps(execution,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    edit('gate-evidence.py',[("def finished_logs(label, process):", "def finished_logs(label, process):"),
        ("    return max(times.values())", """    exact(process.get('logFinishSeen'), {'stdout': True, 'stderr': True}, label + ' actual log finish observation absent')
    exact(process.get('logCloseSeen'), {'stdout': True, 'stderr': True}, label + ' actual log close observation absent')
    close_times = process.get('logCloseAtMs')
    require(isinstance(close_times, dict) and set(close_times) == {'stdout', 'stderr'}, label + ' log close timestamp fields differ')
    require(all(type(value) in (int, float) and math.isfinite(value) and value > 0 and value >= times[key]
                for key, value in close_times.items()), label + ' log close timestamp absent/before actual finish')
    return max(close_times.values())"""),
        ("positive_process = {'closeAtMs': 1000, 'logsSettled': {'stdout': True, 'stderr': True},", "positive_process = {'closeAtMs': 1000, 'logsSettled': {'stdout': True, 'stderr': True}, 'logFinishSeen': {'stdout': True, 'stderr': True}, 'logCloseSeen': {'stdout': True, 'stderr': True}, 'logCloseAtMs': {'stdout': 1003, 'stderr': 1004},"),
        ("    contract = locked(ORIGINAL / 'contract.json', ORIGINAL_CONTRACT_SHA)","    contract = locked(ORIGINAL / 'contract.json', ORIGINAL_CONTRACT_SHA)"),
        ("    frozen_shared(execution)\n    if args.self_test:","    require(execution['executionVersion'] == 4, 'Wrong execution version')\n    frozen_shared(execution)\n    if args.self_test:")])
    # The supplemental self-test runs through the same actual gate functions.
    edit('gate-evidence.py',[("    return {'original': result, 'extraRejected': rejected}","    return {'original': result, 'extraRejected': rejected}")]) if "    return {'original': result, 'extraRejected': rejected}" in (CTRL/'gate-evidence.py').read_text() else None
    edit('runtime-preload.mjs',[
        ("else if(field==='extra')parsed.result.unapproved=true;", "else if(field==='extra')parsed.result.unapproved=true;\n       else if(field==='outer-extra')parsed.unapproved=true;"),
        ("if(path.basename(streamPath)==='worker-stdout.log'&&['log-finish-not-observed','late-log-error'].includes(mode)){", """const hiddenStreams={
   'log-finish-not-observed':['worker-stdout.log','finish'],
   'server-log-finish-not-observed':['server-stdout.log','finish'],
   'gate-log-finish-not-observed':['adjudicator-stdout.log','finish'],
   'log-close-not-observed':['worker-stdout.log','close'],
   'server-log-close-not-observed':['server-stdout.log','close'],
   'gate-log-close-not-observed':['adjudicator-stdout.log','close']};
  const hidden=hiddenStreams[mode];
  if((hidden&&path.basename(streamPath)===hidden[0])||(path.basename(streamPath)==='worker-stdout.log'&&mode==='late-log-error')){ """),
        ("if(event==='finish'&&mode==='log-finish-not-observed'){\n     note('actual-log-finish'", "if(hidden&&event===hidden[1]){\n     note(event==='finish'?'actual-log-finish':'actual-log-close'")])
    # Virtual read mutations leave every source/control byte untouched.
    edit('runtime-preload.mjs',[("syncBuiltinESMExports();", """const lockTargets={
 'lock-protected-read':path.resolve(process.cwd(),'src/shared/domain/access-log.ts'),
 'lock-frozen-read':path.resolve(process.cwd(),'scripts/ui-checks/access-history-shared.mjs'),
 'lock-control-read':path.resolve(import.meta.dirname,'STRATEGY.md')};
const lockTarget=lockTargets[mode];
function virtualLockRead(file,options,value){
 if(lockTarget&&path.resolve(String(file))===lockTarget){
  trigger({path:lockTarget,virtualReadOnly:true});
  const text=Buffer.isBuffer(value)?value.toString('utf8'):value;
  const changed=mode==='lock-frozen-read'?text.replace('export const CANONICAL_8_ACTIONS =','export const CANONICAL_8_ACTIONS = /* SOL_LOCK_DRIFT */'):text+'\\nSOL_LOCK_DRIFT';
  return Buffer.isBuffer(value)?Buffer.from(changed):changed;
 }
 return value;
}
fs.readFileSync=function(file,options){return virtualLockRead(file,options,original.read(file,options));};
const readPromise=fs.promises.readFile.bind(fs.promises);
fs.promises.readFile=async function(file,options){return virtualLockRead(file,options,await readPromise(file,options));};
syncBuiltinESMExports();""")])
    edit('runtime-probes.py',[
        ("assert len(FAULT_CODES)==38", """FAULT_CODES.update({'gate-response-outer-extra':'A1_GATE_RESPONSE_MISMATCH',
    'log-close-not-observed':'A1_LOG_CLOSE_UNVERIFIED',
    'server-log-close-not-observed':'A1_LOG_CLOSE_UNVERIFIED',
    'gate-log-close-not-observed':'A1_LOG_CLOSE_UNVERIFIED',
    'server-log-finish-not-observed':'A1_LOG_FINISH_UNVERIFIED',
    'gate-log-finish-not-observed':'A1_LOG_FINISH_UNVERIFIED'})
assert len(FAULT_CODES)==44"""),
        ("'requiredFaultCount':38", "'requiredFaultCount':44"),
        ("'faults':38", "'faults':44"),
        ("('server-close-not-observed','worker-close-not-observed','log-finish-not-observed')", "('server-close-not-observed','worker-close-not-observed','log-finish-not-observed','log-close-not-observed','server-log-close-not-observed','server-log-finish-not-observed')"),
        ("    post,_=run(folder,'scope-after'", """    for mode in ('lock-protected-read','lock-frozen-read','lock-control-read'):
        r,rows=run(folder,mode,['node','scripts/ui-checks/access-history.mjs','--case=contract-core'],mode,15);records.append(r)
        r['acceptedNegative']=strict_preflight(r,'A1_LOCK_MISMATCH','contract-core') and r['faultTriggered']
        good=good and r['acceptedNegative']
        if not r.get('observerHealthy') or r['timeout']:return stop('Lock observation unhealthy: '+mode)
    post,_=run(folder,'scope-after'""")])
    edit('observer-canary.mjs',[("stream.end('actual stream data');await finished;", """const streamClosed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SOL_CANARY_CLOSE_NOT_SEEN')),1000);stream.once('close',()=>{clearTimeout(timer);resolve();});stream.once('error',error=>{clearTimeout(timer);reject(error);});});
   // Join both immediately so deliberate denial never creates an unhandled promise.
   const settled=Promise.all([finished,streamClosed]);stream.end('actual stream data');await settled;""")])
    edit('observer-selfcheck.py',[("fields=['case','runId','candidateSha256','executionSha256','checks','artifacts','acceptance','status','extra','extra-output']", "fields=['case','runId','candidateSha256','executionSha256','checks','artifacts','acceptance','status','extra','extra-output','outer-extra']"),
        ("else parsed.get('result',{}).get(field)!=", "else (parsed.get('unapproved') is True) if field=='outer-extra' else parsed.get('result',{}).get(field)!="),
        ("    r,rows=run(folder,'actual-log-write-error'", """    r,rows=run(folder,'actual-unseen-stream-close','log-close-not-observed',[str(HERE/'observer-canary.mjs'),'io',str(folder)],cwd=folder)
    add(r,r['rc']==1 and r['observerHealthy'] and 'SOL_CANARY_CLOSE_NOT_SEEN' in r['errors'] and any(row.get('hiddenFromSut') for row in rows))
    r,rows=run(folder,'actual-log-write-error'""")])
    edit('runtime-probes.py',[("actualControlChecks']==35 and len(health_receipt['records'])==35", "actualControlChecks']==37 and len(health_receipt['records'])==37")])
    edit('ipc-probes.mjs',[("const cases=['wrong-owner-pid'", "const cases=['wrong-protocol','wrong-owner-pid'"),
        ("const packet={type:'owner-context',protocol:2", "const packet={type:'owner-context',protocol:name==='wrong-protocol'?1:2"),
        ("const expectedViolation={'wrong-owner-pid'", "const expectedViolation={'wrong-protocol':'protocol','wrong-owner-pid'")])
    edit('component-probes.mjs',[("additionalTypedMutations:18", "additionalTypedMutations:25"),
        (" ['missing-canonical-metadata',r=>delete r.canonicalLabels],", """ ['missing-canonical-metadata',r=>delete r.canonicalLabels],
 ['resource-close-error',r=>r.resources[0].events[2].state='close-error'],
 ['resource-unobserved-states',r=>r.resources.forEach(resource=>resource.events.forEach(ev=>ev.state='UNOBSERVED'))],
 ['fabricated-chrome-version',r=>r.chrome.version='0.0.0.0'],
 ['malformed-browser-version',r=>r.chrome.browserVersion='invalid-browser-version'],
 ['unknown-canonical-field',r=>r.canonicalLabels.expected='fake'],
 ['fabricated-canonical-sha',r=>r.canonicalLabels.sha256='0'.repeat(64)],
 ['fabricated-canonical-map',r=>r.canonicalLabels.labels['schedule-publish']='근무편성공개'],""")])
    print('UPGRADED_V4_CONTROLS_ONLY')
if __name__=='__main__':main()
