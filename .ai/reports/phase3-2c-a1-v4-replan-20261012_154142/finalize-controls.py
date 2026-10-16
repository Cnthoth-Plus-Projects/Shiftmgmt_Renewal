# -*- coding: utf-8 -*-
import json,sys
from pathlib import Path
sys.dont_write_bytecode=True
CTRL=Path(__file__).resolve().parent.parent.parent/'contracts/phase3-2c-a1-v4'
p=CTRL/'execution.json';value=json.loads(p.read_text(encoding='utf-8'))
value['partialProbesRequired']=['capture-failure','context-close-failure','partial-write-failure','measured-viewport','measured-origin']
value['componentTypedMutationsRequired']=25
value['privateIpcCasesRequired']=15
value['negativeMeasurementProbesRequired']=2
p.write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
print('EXECUTION_V4_COUNTS_CLOSED')
