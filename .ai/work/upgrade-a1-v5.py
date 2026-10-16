# -*- coding: utf-8 -*-
from pathlib import Path
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템')
NEW=DOC/'.ai/contracts/phase3-2c-a1-v5'
REVIEW=DOC/'.ai/reports/phase3-2c-a1-v4-review-20261012_175305'
def edit(name,pairs):
 p=NEW/name;s=p.read_text(encoding='utf-8')
 for old,new in pairs:
  assert old in s,(name,old[:90]);s=s.replace(old,new)
 p.write_text(s,encoding='utf-8')

# Reuse instrumentation whose delivery was independently proven during v4 review.
s=(REVIEW/'runtime-preload.mjs').read_text(encoding='utf-8').replace('a1v4','a1v5')
s=s.replace("child.once('error',error=>note", "child.once('spawn',()=>note('actual-child-spawn',{spawnId,childPid:child.pid,server,gate}));\n  child.once('error',error=>note")
(NEW/'runtime-preload.mjs').write_text(s,encoding='utf-8')

edit('gate-evidence.py',[
 ('def process_closed(label, process):',"_extra_spec = importlib.util.spec_from_file_location('sol_v5_receipts', HERE / 'evidence-v5.py')\n+EXTRA = importlib.util.module_from_spec(_extra_spec); _extra_spec.loader.exec_module(EXTRA)\n+\n+def process_closed(label, process):\n+    EXTRA.process_receipt(process, success=True)".replace('\n+','\n')),
 ("require(worker['contextAck'] is True and worker['runAuthorized'] is True, 'Core ACK/run authorization absent')","require(worker['contextAck'] is True and worker['runAuthorized'] is True, 'Core ACK/run authorization absent')\n        EXTRA.ack_receipt(worker.get('ackReceipt'), owner['pid'], worker['pid'], nonce, context)"),
 ("require(worker['contextAck'] is False and worker['runAuthorized'] is False, 'Protected runner falsely claims IPC authorization')","require(worker['contextAck'] is False and worker['runAuthorized'] is False, 'Protected runner falsely claims IPC authorization')\n        require(worker.get('ackReceipt') is None and 'ackReceipt' in worker, 'Protected runner must have null ACK receipt')"),
 ("'extraRejectedMutations': mutations}","'extraRejectedMutations': mutations, 'v5ReceiptRules': EXTRA.self_test()}"),
 ("execution['executionVersion'] == 4","execution['executionVersion'] == 5")])

edit('runtime-probes.py',[
 ("assert len(FAULT_CODES)==44","FAULT_CODES.update({'owner-extra-ack':'A1_ACK_INVALID','timestamp-regression':'A1_LIFECYCLE_INVALID'})\nassert len(FAULT_CODES)==46\nspec5=importlib.util.spec_from_file_location('sol_v5_receipts',HERE/'evidence-v5.py')\nEXTRA=importlib.util.module_from_spec(spec5);spec5.loader.exec_module(EXTRA)"),
 ("        if value['pid']!=spawns[-1]['childPid']:return False","        if value['pid']!=spawns[-1]['childPid']:return False\n        try:EXTRA.process_receipt(value,success=False)\n        except (ValueError,KeyError,TypeError):return False"),
 ("    return True\n\ndef parser_self_test", "    if partial['raw'] is not None:\n        try:EXTRA.acquired_checks(partial['raw'],partial['checks'])\n        except (ValueError,KeyError,TypeError):return False\n    if mode=='owner-extra-ack' and partial['worker'].get('ackReceipt',{}).get('unapproved') is not True:return False\n    if mode=='timestamp-regression':\n        delivered=[r['value'] for r in rows if r['type']=='clock-value-delivered-to-sut']\n        if len(delivered)!=1 or partial['worker']['logFinishAtMs']['stdout']!=delivered[0]:return False\n        if partial['cleanup'].get('tempRemoved') is not False:return False\n    return True\n\ndef parser_self_test"),
 ("    partial={'owner':", "    process.update(EXTRA.sample_process())\n    partial={'owner':"),
 ("health_receipt['actualControlChecks']==37 and len(health_receipt['records'])==37", "health_receipt['actualControlChecks']==39 and len(health_receipt['records'])==39"),
 ("    assert health_receipt['proof']==", "    assert health_receipt.get('bootstrapMode') is False\n    assert health_receipt['proof']=="),
 ("'requiredFaultCount':44", "'requiredFaultCount':46"),
 ("'faults':44", "'faults':46")])

edit('observer-canary.mjs',[("}else{\n const temp=", "}else if(kind==='ack'||kind==='clock'){\n const temp=fs.mkdtempSync(path.join(root,'shiftmgmt-sol-a1v5-'));\n try{\n  const source=kind==='ack'?\"process.send({type:'worker-ack',protocol:2,case:'contract-core',ownerPid:process.ppid,workerPid:process.pid,nonce:'a'.repeat(64),contextSha256:'B'.repeat(64)})\":\"process.stdout.write('actual clock child')\";\n  const child=spawn(process.execPath,['-e',source],{windowsHide:true,stdio:kind==='ack'?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});\n  child.stdout.resume();child.stderr.resume();let ack;child.on('message',value=>ack=value);\n  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});\n  if(code!==0)throw new Error('Actual canary child failed');\n  if(kind==='ack'){if(ack?.unapproved!==true)throw new Error('ACK mutation missing');console.log(JSON.stringify(ack));}\n  else{\n   const stream=fs.createWriteStream(path.join(temp,'worker-stdout.log'));let supplied;\n   await new Promise((resolve,reject)=>{stream.once('finish',()=>supplied=Date.now());stream.once('close',resolve);stream.once('error',reject);stream.end('actual clock stream');});\n   console.log(JSON.stringify({supplied}));\n  }\n }finally{fs.rmSync(temp,{recursive:true});}\n}else{\n const temp=")])

edit('observer-selfcheck.py',[
 ("def main():\n    folder=", "def main():\n    bootstrap=sys.argv[1:]==['--bootstrap-v4']\n    if sys.argv[1:] and not bootstrap:raise ValueError('Only explicit --bootstrap-v4 control mode allowed')\n    if bootstrap:\n        for name,expected in [('access-history.mjs','642340EDC48A1F7D25EC220BB811EC823402E2A1E434CF8461D58A70BD21875B'),('access-history-shared.mjs','FC963E330B6290C3E89FDE5ED989A5CE1545F676EC9CEB7D367801BEC59D69DC')]:\n            assert sha((REPO/'scripts/ui-checks'/name).read_bytes())==expected\n    folder="),
 ("    fields=['case'", "    r,rows=run(folder,'actual-extra-ack-delivery','owner-extra-ack',[str(HERE/'observer-canary.mjs'),'ack',str(folder)],cwd=folder)\n    add(r,r['rc']==0 and r['observerHealthy'] and json.loads(r['output']).get('unapproved') is True and any(x['type']=='fault-triggered' for x in rows) and any(x['type']=='actual-child-close' for x in rows))\n    r,rows=run(folder,'actual-clock-regression-delivery','timestamp-regression',[str(HERE/'observer-canary.mjs'),'clock',str(folder)],cwd=folder)\n    delivered=[x for x in rows if x['type']=='clock-value-delivered-to-sut']\n    closed=[x for x in rows if x['type']=='actual-child-close']\n    add(r,r['rc']==0 and r['observerHealthy'] and len(delivered)==1 and len(closed)==1 and json.loads(r['output']).get('supplied')==delivered[0]['value'] and delivered[0]['value']<closed[0]['timeMs'] and any(x['type']=='fault-triggered' for x in rows))\n    fields=['case'"),
 ("('[포트 점유 거부]' in r['errors'] or coded_error(r['errors'],'A1_PORT_BUSY'))", "coded_error(r['errors'],'A1_LOCK_MISMATCH' if bootstrap else 'A1_PORT_BUSY')"),
 ("'proof':'CONTROL_CANARIES_AND_CURRENT_SUT_PREFLIGHT_ONLY_NOT_A1_ACCEPTANCE'", "'bootstrapMode':bootstrap,'proof':'BOOTSTRAP_V4_CONTROL_ONLY_NOT_V5_ACCEPTANCE' if bootstrap else 'CONTROL_CANARIES_AND_CURRENT_SUT_PREFLIGHT_ONLY_NOT_A1_ACCEPTANCE'")])

edit('partial-preload.mjs',[
 ("const launch=chromium.launch.bind(chromium);", "const exists=fs.existsSync.bind(fs);\nfs.existsSync=function(file){if(mode==='canonical-missing'&&String(file).replaceAll('\\\\','/').endsWith('/dist/server/shared/domain/access-log.js')){note('fault-triggered',{marker:'SOL_CORE_CANONICAL_MISSING',path:String(file)});return false;}return exists(file);};\nconst launch=chromium.launch.bind(chromium);"),
 ("return mode==='measured-viewport'?{width:1439,height:900}:actual;", "if(mode==='viewport-null'){note('fault-triggered',{marker:'SOL_CORE_VIEWPORT_NULL'});return null;}return mode==='measured-viewport'?{width:1439,height:900}:actual;")])

edit('partial-probes.mjs',[
 ("{spawn} from 'node:child_process'", "{spawn,spawnSync} from 'node:child_process'"),
 ("'measured-origin'];", "'measured-origin','viewport-null','canonical-missing'];"),
 ("const legacyControlCheck=process.argv.slice(2).join(' ')==='--legacy-control-check';", "const legacyControlCheck=process.argv.slice(2).join(' ')==='--bootstrap-v4';"),
 ('EDAD35833644B900A729588504FAB1FE36B447EC09AD3AA8D46C731FB8DFD7FD','642340EDC48A1F7D25EC220BB811EC823402E2A1E434CF8461D58A70BD21875B'),
 ('1F76243755359C0BC5F4A3FC8C5EA1144C3E2216946AF80AF321B7756E5A5C9B','FC963E330B6290C3E89FDE5ED989A5CE1545F676EC9CEB7D367801BEC59D69DC'),
 ("../phase3-2c-a1-v3", "../phase3-2c-a1-v4"),
 ("const dom=events.find(e=>e.type==='actual-dom-acquired');assert.ok(dom);", "const dom=events.find(e=>e.type==='actual-dom-acquired');if(mode!=='canonical-missing')assert.ok(dom);"),
 ("   assert.deepEqual(partial.raw.loginInputs", "   if(mode==='canonical-missing'){\n    assert.ok(events.some(e=>e.marker==='SOL_CORE_CANONICAL_MISSING'));\n    assert.ok(!events.some(e=>e.type==='actual-browser-created'));\n    assert.equal(partial.raw.canonicalLabels,null);assert.equal(partial.raw.viewport,null);assert.equal(partial.raw.origin,null);assert.equal(partial.raw.loginInputs,null);assert.equal(partial.raw.captureId,null);assert.deepEqual(partial.raw.resources,[]);\n   }else{\n   assert.deepEqual(partial.raw.loginInputs"),
 ("   if(mode==='measured-origin'){assert.equal(partial.raw.origin,'http://127.0.0.1:18741/sol-observation-drift');assert.ok(events.some(e=>e.type==='actual-url-read'));}", "   if(mode==='measured-origin'){assert.equal(partial.raw.origin,'http://127.0.0.1:18741/sol-observation-drift');assert.ok(events.some(e=>e.type==='actual-url-read'));}\n   if(mode==='viewport-null'){assert.equal(partial.raw.viewport,null);assert.ok(events.some(e=>e.marker==='SOL_CORE_VIEWPORT_NULL'));}\n   }\n   assert.ok(events.some(e=>e.type==='evidence-rename'&&path.resolve(e.path)===partialPath),'Failure evidence must publish atomically');\n   const measured=spawnSync(execution.pythonExecutable,['-X','utf8','-B',path.join(ctrl,'evidence-v5.py'),'--partial',partialPath],{cwd:folder,windowsHide:true,encoding:'utf8',timeout:10000});\n   assert.equal(measured.status,0,measured.stderr);"),
 ("const physical=events[0]", "const physical=events[0]"),
 ("&&['actual-browser-created','actual-context-created','actual-dom-acquired','actual-browser-closed','actual-context-closed'].every(type=>events.some(e=>e.type===type));", "&&(mode==='canonical-missing'?events.some(e=>e.marker==='SOL_CORE_CANONICAL_MISSING')&&!events.some(e=>e.type==='actual-browser-created'):['actual-browser-created','actual-context-created','actual-dom-acquired','actual-browser-closed','actual-context-closed'].every(type=>events.some(e=>e.type===type)));"),
 ("const expectedLegacyExit=['capture-failure','partial-write-failure'].includes(mode)?1:0;", "const expectedLegacyExit=mode==='viewport-null'?0:1;"),
 ("results.length===5", "results.length===7"),
 ("EXPECTED_LEGACY_REGRESSIONS_DETECTED", "EXPECTED_V4_REGRESSIONS_DETECTED"),
 ("CONTROL_COVERAGE_REPLAYS_ONLY_NOT_V4_SUT_ACCEPTANCE", "BOOTSTRAP_V4_CONTROL_ONLY_NOT_V5_ACCEPTANCE")])

edit('component-probes.mjs',[
 ("import {spawnSync}", "import os from 'node:os';\nimport {spawnSync}"),
 ("additionalTypedMutations:25", "additionalTypedMutations:32"),
 ("const typedMutations=[", "const copyRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-a1v5-canonical-copy-'));\nconst canonicalCopy=path.join(copyRoot,'access-log.js');fs.copyFileSync(observations.canonicalLabels.path,canonicalCopy);\nconst typedMutations=[\n ['repeated-created',r=>r.resources[0].events.forEach(e=>e.state='created')],\n ['reversed-states',r=>r.resources[0].events.reverse()],\n ['extra-closed',r=>r.resources[0].events.push(structuredClone(r.resources[0].events.at(-1)))],\n ['numeric-resource-id',r=>r.resources[0].id=7],\n ['boolean-resource-id',r=>r.resources[0].id=true],\n ['array-resource-id',r=>r.resources[0].id=['browser']],\n ['same-bytes-alternate-canonical-path',r=>r.canonicalLabels.path=canonicalCopy],"),
 ("typedMutationCount:typedMutations.length,resources", "typedMutationCount:typedMutations.length,canonicalCopy,retention:'Retain exact external canonical copy',resources")])
print('V5_CONTROL_UPGRADED')
