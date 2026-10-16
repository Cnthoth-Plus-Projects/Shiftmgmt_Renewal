# -*- coding: utf-8 -*-
"""Create fresh Sol runner from historical read-only command scaffold."""
from pathlib import Path
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템')
prior=DOC/'.ai/reports/phase3-2c-a1-v5-review-20261013_093034/run-checks.py'
target=DOC/'.ai/reports/phase3-2c-a1-v6-review-20261013_122600/run-checks.py'
source=prior.read_text(encoding='utf-8').replace('phase3-2c-a1-v5','phase3-2c-a1-v6').replace("receipt['requiredFaultCount']==46","receipt['requiredFaultCount']==51")
with target.open('xb') as f:f.write(source.encode('utf-8'))
print(str(target))
