# -*- coding: utf-8 -*-
"""Review-only copies; canonical controls and product files are never patched."""
from pathlib import Path
import hashlib
import json

REPORT = Path(__file__).resolve().parent
CTRL = REPORT.parent.parent.parent / '.ai/contracts/phase3-2c-a1-v4'

def change(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new, 1)

def fresh(name, text):
    with (REPORT/name).open('x', encoding='utf-8', newline='\n') as out:
        out.write(text)

owner = (CTRL/'runtime-preload.mjs').read_text(encoding='utf-8')
owner = change(owner, "const session=process.env.SOL_A1_PROBE_SESSION;", "const session=process.env.SOL_A1_PROBE_SESSION;\nconst realClock=Date.now.bind(Date);let actualWorkerCloseMs=null;")
owner = change(owner, 'timeMs:Date.now(),pid:process.pid,seq:++eventSeq', 'timeMs:realClock(),pid:process.pid,seq:++eventSeq')
owner = change(owner, "stream.on('error',error=>note('actual-log-error',{streamId,path:streamPath,message:error.message}));", """stream.on('error',error=>note('actual-log-error',{streamId,path:streamPath,message:error.message}));
  if(path.basename(streamPath)==='worker-stdout.log'&&mode==='timestamp-regression'){
   const emit=stream.emit.bind(stream);
   stream.emit=function(event,...values){
    if(event==='finish'&&actualWorkerCloseMs!==null){
     const supplied=actualWorkerCloseMs-250,previous=Date.now;
     trigger({streamId,path:streamPath,suppliedTimeMs:supplied,actualChildCloseTimeMs:actualWorkerCloseMs});
     note('clock-value-delivered-to-sut',{streamId,path:streamPath,value:supplied});
     Date.now=()=>supplied;
     try{return emit(event,...values);}finally{Date.now=previous;}
    }
    return emit(event,...values);
   };
  }""")
owner = change(owner, "child.once('close',(code,signal)=>note('actual-child-close',{spawnId,childPid:child.pid??null,server,gate,code,signal}));", "child.once('close',(code,signal)=>{if(!server&&!gate&&!regression)actualWorkerCloseMs=realClock();note('actual-child-close',{spawnId,childPid:child.pid??null,server,gate,code,signal});});")
owner = change(owner, "['owner-bad-ack','worker-no-ack','worker-no-run'].includes(mode)", "['owner-bad-ack','owner-extra-ack','worker-no-ack','worker-no-run'].includes(mode)")
owner = change(owner, "if(mode==='owner-bad-ack'){", "if(mode==='owner-bad-ack'||mode==='owner-extra-ack'){")
owner = change(owner, "return fn({...message,nonce:'0'.repeat(64)});", "return fn(mode==='owner-extra-ack'?{...message,unapproved:true}:{...message,nonce:'0'.repeat(64)});")
fresh('runtime-preload.mjs', owner)

partial = (CTRL/'partial-preload.mjs').read_text(encoding='utf-8')
partial = change(partial, "note('observer-start');", """note('observer-start');
const realExists=fs.existsSync.bind(fs);
fs.existsSync=function(file){
 if(mode==='canonical-missing'&&path.resolve(String(file))===path.resolve(process.cwd(),'dist/server/shared/domain/access-log.js')){
  note('fault-triggered',{marker:'SOL_CORE_CANONICAL_VIRTUAL_MISSING',path:String(file)});return false;
 }
 return realExists(file);
};""")
partial = change(partial, "return mode==='measured-viewport'?{width:1439,height:900}:actual;", "if(mode==='measured-viewport'){note('null-viewport-delivered',{actual});return null;}return actual;")
fresh('partial-preload.mjs', partial)
driver = (CTRL/'partial-probes.mjs').read_text(encoding='utf-8')
driver = change(driver, "const modes=['capture-failure','context-close-failure','partial-write-failure','measured-viewport','measured-origin'];", "const modes=['measured-viewport','canonical-missing'];")
driver = change(driver, "const repo=fs.realpathSync(process.cwd()),ctrl=import.meta.dirname;", "const repo=fs.realpathSync(process.cwd()),ctrl="+json.dumps(str(CTRL))+";")
driver = change(driver, "path.join(ctrl,'partial-preload.mjs')", "path.join(import.meta.dirname,'partial-preload.mjs')")
fresh('partial-extra-probes.mjs', driver)
files = {p.name:hashlib.sha256(p.read_bytes()).hexdigest().upper() for p in [REPORT/'runtime-preload.mjs',REPORT/'partial-preload.mjs',REPORT/'partial-extra-probes.mjs']}
fresh('extra-control-hashes.json', json.dumps({'sourceControls':str(CTRL),'copies':files,'immutableOriginalEdits':0},indent=2))
print(json.dumps({'status':'REVIEW_COPIES_PREPARED','copies':files}))
