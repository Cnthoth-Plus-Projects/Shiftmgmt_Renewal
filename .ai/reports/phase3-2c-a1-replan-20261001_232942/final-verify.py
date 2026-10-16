# -*- coding: utf-8 -*-
"""Final packet transport/scope validation and parser-only filesystem CLI checks."""
from datetime import datetime, timezone
from pathlib import Path
import copy, hashlib, json, subprocess, sys, time
ROOT=Path.cwd().resolve();REPORT=ROOT/'.ai/reports/phase3-2c-a1-replan-20261001_232942'
NEW=ROOT/'.ai/contracts/phase3-2c-a1-v2';REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def load(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def save(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
dispatch=load(REPORT/'dispatch.json');init=load(REPORT/'init.json');baseline=load(NEW/'baseline.json')
assert sha((NEW/'baseline.json').read_bytes())==dispatch['baseline']['sha256']
packet=(ROOT/'HANDOFF.md').read_bytes();assert len(packet)==dispatch['bytes'] and sha(packet)==dispatch['sha256']
assert Path(dispatch['archive']).read_bytes()==packet
boundary=packet.index(b'## '+ '회신'.encode('utf-8')+b'\r\n')
assert boundary==dispatch['requestBodyBytes'] and sha(packet[:boundary])==dispatch['requestBodySha256']
assert packet.count(b'\r\n## '+ '회신'.encode('utf-8')+b'\r\n')==1
text=packet.decode('utf-8');assert '- Action: IMPLEMENT\r\n' in text and '<!--' not in text
for n in range(1,12):assert f'## {n}. ' in text
for n in range(1,10):assert f'E2-{n:02}' in text
assert len(baseline['files'])==341 and len(baseline['allowed'])==2 and len(baseline['control'])==27
records=[]
base=[sys.executable,str(NEW/'gate-evidence.py'),'--execution-sha',dispatch['execution']['sha256'],
      '--baseline-sha',dispatch['baseline']['sha256']]
def run(name,argv,stdout_path=None,stderr_path=None):
    begin=time.time()*1000
    child=subprocess.Popen(argv,cwd=REPO,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    output,error=child.communicate(timeout=25);end=time.time()*1000
    out=stdout_path or REPORT/(name+'.stdout.txt');err=stderr_path or REPORT/(name+'.stderr.txt')
    out.write_bytes(output);err.write_bytes(error)
    record={'name':name,'argv':argv,'cwd':str(REPO),'pid':child.pid,'createdAtMs':begin,'exitAtMs':end,
            'closeAtMs':time.time()*1000,'rc':child.returncode,'stdout':str(out),'stderr':str(err),
            'stdoutSha256':sha(output),'stderrSha256':sha(error)}
    records.append(record);assert child.returncode==0,error.decode('utf-8',errors='replace')
    return record,output
scope,_=run('final-scope',base+['--scope'])
parser_fixtures=load(REPORT/'filesystem-parser-validation.json')
for index,candidate_path in enumerate(parser_fixtures['fixtureCandidates']):
    path=Path(candidate_path);candidate=load(path)
    receipt,stdout=run(f'parser-candidate-{index+1}',base+['--candidate',str(path)],
        path.parent/'adjudicator-stdout.log',path.parent/'adjudicator-stderr.log')
    published=copy.deepcopy(candidate);published['status']='PASS'
    published['adjudication']={'result':json.loads(stdout)['result'],'candidateSha256':sha(path.read_bytes()),
      'gatePath':str(NEW/'gate-evidence.py'),'gateSha256':sha((NEW/'gate-evidence.py').read_bytes()),
      'process':{'pid':receipt['pid'],'exitCode':receipt['rc'],'exitSeen':True,'closeSeen':True,'aliveAfterClose':False,
                 'createdAtMs':receipt['createdAtMs'],'exitAtMs':receipt['exitAtMs'],'closeAtMs':receipt['closeAtMs'],
                 'logsSettled':{'stdout':True,'stderr':True}},
      'stdoutPath':receipt['stdout'],'stderrPath':receipt['stderr'],'stdoutSha256':receipt['stdoutSha256'],
      'stderrSha256':receipt['stderrSha256']}
    final=path.parent/'owner-final.json';save(final,published)
    run(f'parser-final-{index+1}',base+['--final',str(final)])
source=init['source'];names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=REPO).decode('utf-8').rstrip('\0').split('\0')
assert set(names)==set(source['files'])
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO).decode().strip()==source['head']
assert subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=REPO).decode('utf-8').splitlines()==source['status']
for name,expected in source['files'].items():
    data=(REPO/name).read_bytes();assert len(data)==expected['bytes'] and sha(data)==expected['sha256'],name
for name,expected in baseline['control'].items():
    data=Path(name).read_bytes();assert len(data)==expected['bytes'] and sha(data)==expected['sha256'],name
assert (ROOT/'HANDOFF.md').read_bytes()==packet and Path(dispatch['archive']).read_bytes()==packet
evidence={'time':datetime.now(timezone.utc).isoformat(),'status':'PACKET_READY_VERIFIED','implementationStatus':'NOT_RUN_GEMINI_RELAY_PENDING',
    'dispatch':dispatch,'sourceUnchanged':True,'sourceFiles':341,'allowed':2,'protectedFiles':339,'controlFiles':27,
    'currentSourceHead':source['head'],'branch':source['branch'],'dirtyPaths':source['status'],
    'packetSelfContainedSections':11,'exactReplyBoundary':True,'outgoingArchiveExactMatch':True,
    'controlValidation':load(REPORT/'control-validation-final.json'),
    'filesystemParserOnly':{'positiveCases':3,'mutationsRejected':14,'candidateCliRcZero':3,'finalCliRcZero':3,
        'proof':'PARSER_ONLY_NO_PRODUCT_RUNTIME_ACCEPTANCE','historicalArtifactsEdited':False},
    'records':records,'runtimeAcceptance':'UNVERIFIED_NOT_RUN','productEditsBySol':0,
    'A2B':'PENDING_UNAUTHORIZED','retryHistoryReset':False,'commitPushDeployAiCli':0,
    'limitations':['A1 implementation and real fault/IPC/component suites require Gemini submission and independent Sol review',
                   'Known normal8 login/partial and remaining original A negative obligations retained for A2',
                   'Filesystem parser fixtures cannot prove actual Chrome/UI/process cleanup']}
save(REPORT/'final-evidence.json',evidence)
print(json.dumps({'status':evidence['status'],'scopeRc':scope['rc'],'sourceUnchanged':True,'sourceFiles':341,
    'protectedFiles':339,'controlFiles':27,'parserCliChecks':6,'productEditsBySol':0,'archive':dispatch['archive'],
    'runtimeAcceptance':'NOT_RUN'},ensure_ascii=False))
