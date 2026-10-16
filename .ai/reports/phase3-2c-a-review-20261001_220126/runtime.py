# -*- coding: utf-8 -*-
import importlib.util,json,sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
REPORT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("rr", REPORT/"review-runner.py");rr=importlib.util.module_from_spec(spec);spec.loader.exec_module(rr)
CONTROL=REPORT.parents[2];CHECKER=CONTROL/".ai/contracts/phase3-2c-v1/verify-evidence.py"
ARGS=["python",str(CHECKER),"--contract-sha","014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE","--baseline-sha","E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50"]
if sys.argv[1]=="claimed":
 results=[rr.run("scope-check",ARGS+["--scope"]),rr.run("submitted-core-check",ARGS+["--core",str(rr.PRODUCT/"artifacts/captures/phase3/access-history-contract-core/run-20261001-174842-f2iqH8/owner-final.json")]),rr.run("parser-self-test",ARGS[:-2]+["--self-test"])]
 (REPORT/"claimed-check-results.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
elif sys.argv[1]=="core":
 r=rr.run("actual-core",["node","scripts/ui-checks/access-history.mjs","--case=contract-core"],timeout=115)
 for line in Path(r["stdout"]).read_text(encoding="utf-8").splitlines():
  try:
   val=json.loads(line)
   if "manifestPath"in val:r["ownerFinal"]=val; r["checker"]=rr.run("actual-core-check",ARGS+["--core",val["manifestPath"]])
  except json.JSONDecodeError: pass
 (REPORT/"actual-core-result.json").write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding="utf-8");rr.snapshot("scope-after-core")
else:raise ValueError(sys.argv[1])
