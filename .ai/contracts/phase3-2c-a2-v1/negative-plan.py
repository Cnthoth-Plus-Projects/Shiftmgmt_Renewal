"""Emit the original A-N20 closed vector inventory; no SUT execution."""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
groups={
'A-N01':['owner-noargs','owner-empty','owner-unknown'],
'A-N02':['owner-duplicate-case','owner-separate-value','owner-url-option','owner-positional-url','owner-case-leading-space','owner-case-trailing-space'],
'A-N03':[f'direct-{file}-{v}' for file in ['positive','negative','shared'] for v in ['known','unknown','noargs','twoargs','leading-space','trailing-space']],
'A-N04':[f'forged-env-no-ipc-{file}' for file in ['positive','negative','shared']],
'A-N05':['ipc-no-packet','ipc-context-timeout','ipc-nonce-mismatch','ipc-owner-pid-mismatch','ipc-worker-pid-mismatch','ipc-ppid-mismatch','ipc-case-mismatch'],
'A-N06':['ipc-contract-path-missing','ipc-contract-path-mismatch','ipc-contract-digest-missing','ipc-contract-digest-mismatch']+[f'ipc-{where}-{kind}' for where in ['run','temp','bootstrap'] for kind in ['external','sibling','symlink']],
'A-N07':['near-tolerance2','near-tolerance4','near-toleranceNaN','near-actualNaN','near-actualInfinity','near133.5-vs132-tol1','near132-boundary','near133-boundary','constant-provenance-mismatch'],
'A-N08':['core-id-missing','core-id-duplicate','core-id-unknown','core-id-extra','unknown-case-required-nonempty'],
'A-N09':['fixture-publish-wrong-label','canonical-compiled-label-drift','canonical-compiled-hash-drift'],
'A-N10':['unrelated-console-401','raw-pageerror'],
'A-N11':['actual-context-close-then-throw','actual-browser-close-then-throw'],
'A-N12':['worker-timeout','worker-kill-request','kill-without-close-observed','server-stop-timeout'],
'A-N13':['worker-spawn-error','server-spawn-error','server-exit-before-listen'],
'A-N14':['owner-final-denied-sync','owner-final-denied-async','owner-final-denied-atomic-rename','worker-final-denied'],
'A-N15':['worker-stdout-denied','worker-stderr-denied','server-stdout-denied','server-stderr-denied','capture-denied','core-observations-denied'],
'A-N16':['capture-missing','capture-hash-mismatch','capture-outside-path','capture-broken-png','worker-final-absent'],
'A-N17':['protected-preflight-health-exit-before-steps','protected-preflight-chrome-exit-before-steps'],
'A-N18':['owned-stub-port-busy','inherited-SHIFT-poison','inherited-SHIFTMGMT-poison','inherited-NODE_OPTIONS-poison','execArgv-no-auto-forward'],
'A-N19':[f'normal-incomplete-{c}' for c in ['live-admin','list-fixture','empty-fixture','filters','errors','stale-response','role-guard','session-expired']],
'A-N20':['actual-raw-pointer-mismatch','caller-expected-field','caller-pass-field','caller-tolerance-field'],
}
old=HERE.parent/'phase3-2c-v1/HANDOFF.preview.md'
source=old.read_text(encoding='utf-8');start=source.index('| A-N01 |');end=source.index('\n\n',start)
rules={line.split('|')[1].strip():{'input':line.split('|')[2].strip(),'requiredObservation':line.split('|')[3].strip()} for line in source[start:end].splitlines()}
v={'proof':'PLAN_ONLY_NOT_RUN','authority':'Sol; Gemini read-only','groups':[],
   'resultSchema':'shiftmgmt.a2.negative-results.v1','allGroupsRequired':20,
   'special':{'A-N03':'known means EVERY registered private case for that file, separate own subreceipts. Other variants separate invocations.',
              'A-N04':'Every valid known private case, each with forged env and an owned healthy stub. No IPC. Stub request0.',
              'A-N06':'Metadata realpath is allowed; outside payload read/write/network0. Use owned junctions if file symlink privilege unavailable; every listed run/temp/bootstrap escape still tested.',
              'A-N07':'Boundary132/133 expected success; others reject; actual helper and original canonical parser both tested.',
              'A-N14':'NOT_USED only sync/async/rename API demonstrably not used by actual final publication; provide AST path/hash/line. At least one real final denial and worker denial mandatory.',
              'retention':'Only own isolated temp/testdir writes. Retain failed evidence. No source/control/foreign cleanup.'}}
for gid,names in groups.items():v['groups'].append({'id':gid,**rules[gid],'vectors':[{'id':gid+'/'+n,'expected':'ACCEPT_BOUNDARY' if n in ['near132-boundary','near133-boundary'] else 'INCOMPLETE' if gid=='A-N19' else 'REJECT','requiredProof':'ACTUAL_NORMAL_RUNTIME' if gid=='A-N19' else 'ACTUAL_CLOSE_SDK' if gid=='A-N11' else 'ACTUAL_SUT_OR_SOURCE_HELPER_NOT_PARSER_ONLY'} for n in names]})
v['vectorCount']=sum(len(g['vectors']) for g in v['groups'])
with (HERE/'negative-vectors.json').open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'groups':len(v['groups']),'vectors':v['vectorCount'],'proof':v['proof']}))
