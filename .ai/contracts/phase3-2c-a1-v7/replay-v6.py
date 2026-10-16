"""Read-only retained exact-v6 artifact replay, not a new SUT execution."""
from pathlib import Path
import hashlib, importlib.util, json
HERE=Path(__file__).resolve().parent
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
ARTIFACT=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a1v6-extra-owner-resume2-5au8312e')
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def main():
    expected={'access-history.mjs':'9E735F3ED1C8DD46D200AED10F53FE5256DFC2459BE87CFFF6C1D5E5F73C4313','access-history-shared.mjs':'38D3AF668282BC5B184A59815D5C0726D6F296C5906E428BD7543C4E7CCF7280'}
    assert all(hashlib.sha256((REPO/'scripts/ui-checks'/n).read_bytes()).hexdigest().upper()==h for n,h in expected.items())
    s=importlib.util.spec_from_file_location('sol_v7_retained_replay',HERE/'lifecycle-probes.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
    result=load(ARTIFACT/'extra-result.json');rejected=[]
    for r in result['results']:
        owner=r['owner'];rows=m.R.HEALTH.observer_health(Path(owner['eventsPath']).read_text(encoding='utf-8'),owner['pid'],owner['mode'],owner['session'],owner['rc'])
        delivery=r['delivery'];assert delivery in rows and r['actualErrorEvent'] in rows
        assert len([v for v in rows if v['type']=='controlled-late-error-delivery'])==1
        subject=load(Path(r.get('finalPath') or r['failurePath']))
        # Explicit projection from stored original delivery, not fabricated events.
        original={'role':'server','kind':delivery['kind'],'targetPid':delivery['targetPid'],**{k:delivery[k] for k in ('name','message','stack')}}
        try:m.current_error_bindings(subject,[original])
        except (ValueError,KeyError,TypeError) as error:rejected.append({'mode':r['mode'],'reason':str(error),'originalOwnerRc':owner['rc'],'manifestPath':r.get('finalPath') or r['failurePath']})
        else:raise AssertionError('Retained v6 gap incorrectly accepted')
    assert len(rejected)==4
    print(json.dumps({'status':'PASS','proof':'RETAINED_EXACT_V6_ARTIFACT_REPLAY_NOT_NEW_RUNTIME_NOT_V7_ACCEPTANCE','rejected':rejected,'currentSourceHashes':expected},ensure_ascii=False))
if __name__=='__main__':main()
