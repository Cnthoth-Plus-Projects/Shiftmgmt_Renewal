# -*- coding: utf-8 -*-
"""Actual current owner, review instrumentation copies, fixed original final gate."""
from pathlib import Path
import importlib.util
import json
import sys
sys.dont_write_bytecode = True
REPORT = Path(__file__).resolve().parent
CTRL = REPORT.parent.parent.parent / '.ai/contracts/phase3-2c-a1-v4'

def module(name, source):
    spec = importlib.util.spec_from_file_location(name, source)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

runtime = module('locked_runtime_functions', CTRL/'runtime-probes.py')
commands = module('review_commands', REPORT/'review-commands.py')
# run() uses this path only for --import; health verification remains the original.
runtime.HERE = REPORT
results = []
for mode in ['owner-extra-ack', 'timestamp-regression']:
    record, rows = runtime.run(REPORT, 'extra-'+mode,
        ['node', 'scripts/ui-checks/access-history.mjs', '--case=contract-core'], mode, 120)
    result = {'mode': mode, 'owner': record, 'events': rows,
              'fixedFinal': None, 'timestampChanged': None}
    if record['rc'] == 0 and record['observerHealthy'] and record['faultTriggered']:
        receipt = json.loads(record['output'])
        path = Path(receipt['manifestPath'])
        final = commands.run('extra-'+mode+'-fixed-final', commands.GATE+['--final', str(path)], 30)
        result['fixedFinal'] = final
        if mode == 'timestamp-regression':
            supplied = next(r for r in rows if r['type']=='clock-value-delivered-to-sut')
            published = json.loads(path.read_text(encoding='utf-8'))
            finish = published['worker']['logFinishAtMs']['stdout']
            result['timestampChanged'] = {'suppliedValue': supplied['value'],
                'publishedValue': finish, 'changed': finish != supplied['value'],
                'manifest': str(path), 'actualFault': next(r for r in rows if r['type']=='fault-triggered')}
    results.append(result)
    print(json.dumps({'mode':mode,'ownerRc':record['rc'],'observerHealthy':record['observerHealthy'],
         'faultTriggered':record['faultTriggered'],'fixedFinalRc':result['fixedFinal']['rc'] if result['fixedFinal'] else None,
         'timestampChanged':result['timestampChanged']}),flush=True)
with (REPORT/'extra-owner-results.json').open('x',encoding='utf-8') as out:
    json.dump({'proof':'ACTUAL_SUT_OWNER_AND_FIXED_ORIGINAL_FINAL', 'results':results,
               'immutableControlsChanged':False},out,ensure_ascii=False,indent=2)
assert all(r['owner']['rc']==0 and r['owner']['observerHealthy'] and r['owner']['faultTriggered']
           and r['fixedFinal']['rc']==0 for r in results)
assert results[1]['timestampChanged']['changed'] is True
print('ACTUAL_FALSE_PASS_COUNTEREXAMPLES_REPRODUCED')
