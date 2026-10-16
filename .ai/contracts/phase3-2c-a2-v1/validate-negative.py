"""Completeness/hash/command ledger validation; does not certify test claims."""
from pathlib import Path
from datetime import datetime
import argparse, hashlib, json, sys, tempfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
def require(ok,message):
    if not ok:raise ValueError(message)
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def main():
    p=argparse.ArgumentParser();p.add_argument('--result',required=True);a=p.parse_args()
    path=Path(a.result).resolve(strict=True);root=path.parent
    require(root.parent==Path(tempfile.gettempdir()).resolve() and root.name.startswith('shiftmgmt-gemini-a2-tests-'),'Wrong isolated negative evidence root')
    plan=json.loads((HERE/'negative-vectors.json').read_text(encoding='utf-8'))
    result=json.loads(path.read_text(encoding='utf-8'))
    require(result['schema']==plan['resultSchema'],'Wrong negative result schema')
    require(result['planSha256']==meta(HERE/'negative-vectors.json')['sha256'],'Negative plan digest differs')
    expected={v['id']:v for g in plan['groups'] for v in g['vectors']}
    require(len(result['vectors'])==len(expected) and {v['id'] for v in result['vectors']}==set(expected),'Missing/extra/duplicate negative vectors')
    for v in result['vectors']:
        require(v['expected']==expected[v['id']]['expected'],'Expected vector altered')
        require(v['result'] in ['OBSERVED_EXPECTED','NOT_USED'],'Unresolved negative vector')
        require(v['proof'] in ['ACTUAL_SUT','ACTUAL_SOURCE_HELPER','ACTUAL_CLOSE_SDK','ACTUAL_NORMAL_RUNTIME','NOT_USED'],'Parser/canary-only cannot certify original vector')
        if v['result']=='NOT_USED':require(v['id'] in ['A-N14/owner-final-denied-sync','A-N14/owner-final-denied-async','A-N14/owner-final-denied-atomic-rename'] and v['proof']=='NOT_USED' and v['sourceEvidence'],'Unpermitted NOT_USED')
        else:
            require(v['commands'],'Actual command receipt missing')
            for c in v['commands']:
                require(type(c['pid']) is int and c['pid']>0 and Path(c['cwd']).resolve()==REPO and type(c['argv']) is list and c['argv'],'Actual command identity missing')
                start=datetime.fromisoformat(c['startUtc']);end=datetime.fromisoformat(c['endUtc']);require(start.tzinfo and end.tzinfo and end>=start,'Invalid UTC command timing')
                require(type(c['rc']) is int and c['timeout'] is False,'Command RC/timeout absent')
                require(c['suts'],'Child/helper actual observations missing')
                for s in c['suts']:
                    require(s['actual'] is not None and s['tracePath'] and s['traceMeta'],'Observed SUT outcome/trace absent')
                    trace=Path(s['tracePath']).resolve(strict=True);require(trace.is_relative_to(root) and meta(trace)==s['traceMeta'],'SUT trace hash/path differs')
                for key in ['stdout','stderr']:
                    f=Path(c[key]).resolve(strict=True);require(f.is_relative_to(root) and meta(f)==c[key+'Meta'],'Original command stream hash/path differs')
        require(v['evidence'] and v['sourceEvidence'],'Vector source/evidence binding absent')
        for item in v['evidence']:
            f=Path(item['path']).resolve(strict=True)
            require(f.is_relative_to(root) or f.is_relative_to(REPO/'artifacts/captures/phase3') or f.is_relative_to(HERE.parent),'Evidence outside permitted roots')
            require(meta(f)=={k:item[k] for k in ['bytes','sha256']},'Evidence hash differs')
    print(json.dumps({'status':'PASS','proof':'NEGATIVE_LEDGER_COMPLETE_NOT_INDEPENDENT_RUNTIME_ACCEPTANCE','groups':20,'vectors':len(expected),'resultSha256':meta(path)['sha256']}))
if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'status':'FAIL','error':str(error)}),file=sys.stderr);sys.exit(1)
