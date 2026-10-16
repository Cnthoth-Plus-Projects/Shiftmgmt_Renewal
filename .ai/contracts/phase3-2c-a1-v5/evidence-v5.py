# -*- coding: utf-8 -*-
"""Sol's immutable v5 receipt rules. Parser proof never implies SUT acceptance."""
import copy
import hashlib
import json
import math
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
CONTRACT = HERE.parent / 'phase3-2c-v1/contract.json'
CONTRACT_SHA = '014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE'
RAW_KEYS = {'viewport','origin','loginInputs','fixtureLabels','canonicalLabels','fixtureRequestCount','rawErrors','chrome','resources','captureId'}
EVENT_KEYS = {'event','timeMs','stream','pid','code','signal','error'}
ACK_KEYS = {'type','protocol','case','ownerPid','workerPid','nonce','contextSha256'}

def require(ok, message):
    if not ok: raise ValueError(message)

def same(a, b):
    return type(a) is type(b) and (set(a) == set(b) and all(same(a[k],b[k]) for k in a) if isinstance(a,dict) else len(a)==len(b) and all(same(x,y) for x,y in zip(a,b)) if isinstance(a,list) else a==b)

def finite_time(value):
    return type(value) in (int,float) and math.isfinite(value) and value > 0

def pointer(raw, value):
    for part in value.split('/')[1:]: raw = raw[part.replace('~1','/').replace('~0','~')]
    return raw

def rules():
    data = CONTRACT.read_bytes()
    require(hashlib.sha256(data).hexdigest().upper()==CONTRACT_SHA,'Original contract drift')
    return json.loads(data)['foundation']['rules']

def acquired_checks(raw, checks):
    require(isinstance(raw,dict) and set(raw)==RAW_KEYS,'Partial raw must contain exact ten fields')
    expected = [{'id':r['id'],'sourceArtifact':'core-observations','pointer':r['pointer'],'actual':copy.deepcopy(pointer(raw,r['pointer']))}
                for r in rules() if pointer(raw,r['pointer']) is not None]
    require(same(checks,expected),'Acquired checks must exactly preserve every non-null rule value in contract order')
    return len(expected)

def ack_receipt(ack, owner_pid, worker_pid, nonce_sha, context):
    require(isinstance(ack,dict) and set(ack)=={'packet','receivedAtMs'} and finite_time(ack['receivedAtMs']),'Actual ACK receipt absent/fields differ')
    packet=ack['packet']
    require(isinstance(packet,dict) and set(packet)==ACK_KEYS,'ACK packet exact keys differ')
    require(isinstance(packet['nonce'],str) and hashlib.sha256(packet['nonce'].encode()).hexdigest().upper()==nonce_sha,'Actual ACK nonce differs')
    context_sha=hashlib.sha256(json.dumps(context,ensure_ascii=False,separators=(',',':')).encode()).hexdigest().upper()
    require(same({k:v for k,v in packet.items() if k!='nonce'},{'type':'worker-ack','protocol':2,'case':'contract-core','ownerPid':owner_pid,
                     'workerPid':worker_pid,'contextSha256':context_sha}),'Actual ACK binding differs')

def process_receipt(record, success=False):
    """Preserve callback payloads without assuming observed wall-clock order on failure."""
    events=record.get('callbackEvents')
    require(isinstance(events,list),'Actual callbackEvents missing')
    singles={}; logs={}; errors=[]
    for event in events:
        require(isinstance(event,dict) and set(event)==EVENT_KEYS and finite_time(event['timeMs']),'Callback event schema/time differs')
        kind=event['event']
        require(kind in {'spawn','exit','close','error','log-finish','log-close','log-error'},'Unknown callback event')
        if kind.startswith('log-'):
            require(event['stream'] in ('stdout','stderr') and all(event[k] is None for k in ('pid','code','signal')),'Log callback payload differs')
            if kind=='log-error': errors.append(event)
            else:
                key=(kind,event['stream']);require(key not in logs,'Duplicate log callback');logs[key]=event
        else:
            require(event['stream'] is None,'Child callback stream must be null')
            if kind=='error':
                require(event['pid']==record['pid'] and event['code'] is None and event['signal'] is None,'Child error payload differs');errors.append(event)
            else:
                require(kind not in singles,'Duplicate child callback');singles[kind]=event
                require(type(event['pid']) is int and event['pid']>0 and event['pid']==record['pid'] if kind=='spawn' else event['pid']==record['pid'],'Child callback PID differs')
                require(event['code'] is None or type(event['code']) is int,'Callback code must be actual integer or null')
                require(event['signal'] is None or isinstance(event['signal'],str) and bool(event['signal']),'Callback signal differs')
                if kind=='spawn':require(event['code'] is None and event['signal'] is None,'Spawn has no exit payload')
        if kind in ('error','log-error'):
            error=event['error'];require(isinstance(error,dict) and set(error)=={'name','message','stack'} and all(isinstance(v,str) and v for v in error.values()),'Actual callback error absent')
        else: require(event['error'] is None,'Non-error callback error must be null')
    for kind, seen_key, time_key in [('spawn',None,'createdAtMs'),('exit','exitSeen','exitAtMs'),('close','closeSeen','closeAtMs')]:
        found=singles.get(kind)
        if seen_key:require(record.get(seen_key) is bool(found),'Observation flag differs from callback ledger')
        require(same(record.get(time_key),found['timeMs'] if found else None),'Published callback timestamp differs from original')
    for kind, code_key, signal_key in [('exit','exitCode','exitSignal'),('close','closeCode','closeSignal')]:
        found=singles.get(kind)
        require(code_key in record and signal_key in record,'Missing actual exit/close fields')
        require(same(record[code_key],found['code'] if found else None) and same(record[signal_key],found['signal'] if found else None),'Published callback code/signal differs')
    for kind,prefix in [('log-finish','logFinish'),('log-close','logClose')]:
        seen=record.get(prefix+'Seen');times=record.get(prefix+'AtMs')
        require(isinstance(seen,dict) and set(seen)=={'stdout','stderr'} and isinstance(times,dict) and set(times)=={'stdout','stderr'},'Actual stream receipt missing')
        for stream in ('stdout','stderr'):
            found=logs.get((kind,stream))
            require(seen[stream] is bool(found) and same(times[stream],found['timeMs'] if found else None),'Published stream observation differs from callback')
    if success:
        require(set(singles)=={'spawn','exit','close'} and len(logs)==4 and not errors and len(events)==7,'Successful callback ledger incomplete')
        require([e['event'] for e in events[:3]]==['spawn','exit','close'],'Actual callback sequence differs')
        require([e['timeMs'] for e in events]==sorted(e['timeMs'] for e in events),'Actual callback array order invalid')
        for stream in ('stdout','stderr'):
            require([e['event'] for e in events if e['stream']==stream]==['log-finish','log-close'],'Actual stream callback order invalid')
        require(record['createdAtMs']<=record['exitAtMs']<=record['closeAtMs'],'Actual child clock order invalid')
        require(all(record['closeAtMs']<=record['logFinishAtMs'][s]<=record['logCloseAtMs'][s] for s in ('stdout','stderr')),'Actual log clock order invalid')
    return len(events)

def sample_process():
    record={'pid':202,'exitSeen':True,'closeSeen':True,'createdAtMs':1,'exitAtMs':2,'closeAtMs':3,'exitCode':0,'exitSignal':None,'closeCode':0,'closeSignal':None,
            'logFinishSeen':{'stdout':True,'stderr':True},'logCloseSeen':{'stdout':True,'stderr':True},'logFinishAtMs':{'stdout':4,'stderr':5},'logCloseAtMs':{'stdout':5,'stderr':6},'callbackEvents':[]}
    for kind,t,stream in [('spawn',1,None),('exit',2,None),('close',3,None),('log-finish',4,'stdout'),('log-close',5,'stdout'),('log-finish',5,'stderr'),('log-close',6,'stderr')]:
        record['callbackEvents'].append({'event':kind,'timeMs':t,'stream':stream,'pid':202 if stream is None else None,'code':0 if kind in ('exit','close') else None,'signal':None,'error':None})
    return record

def self_test():
    good=sample_process();process_receipt(good,True);process_receipt(good,False);rejected=[]
    def rejects(name,fn):
        try: fn()
        except (ValueError,KeyError,TypeError):rejected.append(name)
        else:raise AssertionError('Invalid evidence accepted: '+name)
    for key in ['callbackEvents','exitCode','exitSignal','closeCode','closeSignal','createdAtMs','exitAtMs','closeAtMs','logFinishSeen','logCloseSeen','logFinishAtMs','logCloseAtMs']:
        bad=copy.deepcopy(good);del bad[key];rejects('missing-'+key,lambda bad=bad:process_receipt(bad,True))
    for key in ['createdAtMs','exitAtMs','closeAtMs']:
        bad=copy.deepcopy(good);bad[key]+=250;rejects('rewritten-'+key,lambda bad=bad:process_receipt(bad,True))
    for key in ['logFinishAtMs','logCloseAtMs']:
        for stream in ('stdout','stderr'):
            bad=copy.deepcopy(good);bad[key][stream]+=250;rejects('rewritten-'+key+'-'+stream,lambda bad=bad:process_receipt(bad,True))
    for code in (False,1,'0'):
        bad=copy.deepcopy(good);bad['exitCode']=code;rejects('rewritten-exit-'+str(code),lambda bad=bad:process_receipt(bad,True))
    bad=copy.deepcopy(good);bad['callbackEvents'][0]['unapproved']=True;rejects('event-extra',lambda:process_receipt(bad,True))
    bad=copy.deepcopy(good);bad['callbackEvents']+=bad['callbackEvents'][:1];rejects('event-duplicate',lambda:process_receipt(bad,True))
    for first,second in [(0,1),(3,4)]:
        bad=copy.deepcopy(good);bad['callbackEvents'][first],bad['callbackEvents'][second]=bad['callbackEvents'][second],bad['callbackEvents'][first];rejects('event-order-'+str(first),lambda bad=bad:process_receipt(bad,True))
    bad=copy.deepcopy(good);bad['callbackEvents'][3]['timeMs']=bad['logFinishAtMs']['stdout']=2;process_receipt(bad,False);rejects('clock-regression-success',lambda:process_receipt(bad,True))
    failed=copy.deepcopy(good);failed.update(pid=None,createdAtMs=None,exitSeen=False,exitAtMs=None,exitCode=None,exitSignal=None,closeCode=-4058);failed['callbackEvents']=[e for e in failed['callbackEvents'] if e['event'] not in ('spawn','exit')];failed['callbackEvents'][0].update(pid=None,code=-4058);process_receipt(failed,False)
    failed['exitCode']=0;rejects('spawn-error-fabricated-zero',lambda:process_receipt(failed,False))
    raw={key:None for key in RAW_KEYS};raw.update(resources=[],rawErrors={'console':[],'pageerror':[],'requestfailed':[],'badResponses':[]})
    checks=[{'id':r['id'],'sourceArtifact':'core-observations','pointer':r['pointer'],'actual':pointer(raw,r['pointer'])} for r in rules() if pointer(raw,r['pointer']) is not None]
    acquired_checks(raw,checks);rejects('acquired-empty',lambda:acquired_checks(raw,[]));rejects('acquired-extra',lambda:acquired_checks(raw,checks+checks[:1]))
    raw['viewport']=[1439,900];checks.insert(0,{'id':'CORE-01','sourceArtifact':'core-observations','pointer':'/viewport','actual':[1439,900]});acquired_checks(raw,checks)
    bad=copy.deepcopy(checks);bad[0]['actual']=[1440,900];rejects('acquired-value-rewritten',lambda:acquired_checks(raw,bad))
    context={'repository':'actual'};nonce=hashlib.sha256(b'actual-nonce').hexdigest().upper();ack={'packet':{'type':'worker-ack','protocol':2,'case':'contract-core','ownerPid':101,'workerPid':202,'nonce':'actual-nonce','contextSha256':hashlib.sha256(b'{"repository":"actual"}').hexdigest().upper()},'receivedAtMs':2};ack_receipt(ack,101,202,nonce,context)
    rejects('ack-extra',lambda:ack_receipt({**ack,'packet':{**ack['packet'],'unapproved':True}},101,202,nonce,context));rejects('ack-bad-binding',lambda:ack_receipt(ack,999,202,nonce,context))
    return {'proof':'PARSER_ONLY_NO_RUNTIME_ACCEPTANCE','positives':7,'rejected':rejected,'rejectedCount':len(rejected)}

if __name__=='__main__':
    try:
        if sys.argv[1:]==['--self-test']:result=self_test()
        elif len(sys.argv)==3 and sys.argv[1]=='--partial':
            value=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'));result={'acquiredCount':acquired_checks(value['raw'],value['checks'])}
        else: raise ValueError('Only --self-test or --partial exact-file accepted')
        print(json.dumps({'status':'PASS','result':result}))
    except (ValueError,KeyError,TypeError,OSError) as error:
        print(str(error),file=sys.stderr);sys.exit(1)
