// Sol control canary; never an application scenario or an acceptance substitute.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const [kind,root]=process.argv.slice(2);
if(!kind||!root||!path.isAbsolute(root)||!fs.realpathSync(root).includes('shiftmgmt-sol-a1v7-selfcheck-'))throw new Error('Wrong owned canary root');
if(kind==='idle')process.exitCode=0;
else if(kind==='gate'){
 const good={status:'PASS',result:{status:'ACCEPTABLE_CANDIDATE',acceptance:'A1_PREREQUISITE_ONLY',case:'contract-core',runId:'run-canary',candidateSha256:'A'.repeat(64),executionSha256:'B'.repeat(64),checks:9,artifacts:7}};
 const child=spawn(process.execPath,['-e','process.stdout.write(process.argv[1]+"\\n")',JSON.stringify(good),'SOL_A1_GATE_CANARY'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
 const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
 if(result!==0||errors)throw new Error('Actual canary gate failed');
 process.stdout.write(output);
}else if(kind==='ack'||kind==='clock'){
 const temp=fs.mkdtempSync(path.join(root,'shiftmgmt-sol-a1v7-'));
 try{
  const source=kind==='ack'?"process.send({type:'worker-ack',protocol:2,case:'contract-core',ownerPid:process.ppid,workerPid:process.pid,nonce:'a'.repeat(64),contextSha256:'B'.repeat(64)})":"process.stdout.write('actual clock child')";
  const child=spawn(process.execPath,['-e',source],{windowsHide:true,stdio:kind==='ack'?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();let ack;child.on('message',value=>ack=value);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0)throw new Error('Actual canary child failed');
  if(kind==='ack'){if(ack?.unapproved!==true)throw new Error('ACK mutation missing');console.log(JSON.stringify(ack));}
  else{
   const stream=fs.createWriteStream(path.join(temp,'worker-stdout.log'));let supplied;
   await new Promise((resolve,reject)=>{stream.once('finish',()=>supplied=Date.now());stream.once('close',resolve);stream.once('error',reject);stream.end('actual clock stream');});
   console.log(JSON.stringify({supplied}));
  }
 }finally{fs.rmSync(temp,{recursive:true});}
}else if(['clock-server','clock-gate','ledger-worker','ledger-gate','candidate-denied','ordered-artifact'].includes(kind)){
 const temp=fs.mkdtempSync(path.join(root,'shiftmgmt-sol-a1v7-'));
 try{
  if(kind==='candidate-denied'){
   fs.writeFileSync(path.join(temp,'owner-candidate.json.tmp'),'actual staged candidate');
   fs.renameSync(path.join(temp,'owner-candidate.json.tmp'),path.join(temp,'owner-candidate.json'));
   throw new Error('Candidate denial not delivered');
  }
  const role=kind==='clock-server'?'server':['clock-gate','ledger-gate'].includes(kind)?'adjudicator':'worker';
  const argv=['-e','process.stdout.write("actual controlled child")'];
  if(role==='server')argv.push('./dist/server/main/server.js');
  if(role==='adjudicator'){process.env.SOL_A1_CANARY_GATE=process.env.SOL_A1_PROBE_SESSION;argv.push('SOL_A1_GATE_CANARY');}
  const child=spawn(process.execPath,argv,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();const events=[];
  const add=(event,timeMs,stream,pid,code,signal)=>events.push({event,timeMs,stream,pid,code,signal,error:null});
  child.once('spawn',()=>add('spawn',Date.now(),null,child.pid,null,null));
  child.once('exit',(code,signal)=>add('exit',Date.now(),null,child.pid,code,signal));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{add('close',Date.now(),null,child.pid,code,signal);resolve(code);});});
  if(code!==0)throw new Error('Actual canary child failed');
  for(const streamName of ['stdout','stderr']){
   const stream=fs.createWriteStream(path.join(temp,role+'-'+streamName+'.log'));
   await new Promise((resolve,reject)=>{stream.once('finish',()=>add('log-finish',Date.now(),streamName,null,null,null));stream.once('close',()=>{add('log-close',Date.now(),streamName,null,null,null);resolve();});stream.once('error',reject);stream.end('actual owned control stream');});
  }
  if(events.length!==7)throw new Error('Actual callback count differs');
  if(kind.startsWith('clock-')){
   console.log(JSON.stringify({supplied:events.find(e=>e.event==='log-finish'&&e.stream==='stdout').timeMs,closeTime:events.find(e=>e.event==='close').timeMs}));
  }else if(kind.startsWith('ledger-')){
   const first=structuredClone(events),second=structuredClone(events);
   console.log(JSON.stringify({source:events,first,second}));
  }else{
   fs.readFileSync(path.join(temp,role+'-stdout.log'));
   await fs.promises.readFile(path.join(temp,role+'-stderr.log'));
   const rawPath=path.join(temp,'core-observations.json'),workerPath=path.join(temp,'worker-final.json');
   fs.writeFileSync(rawPath,JSON.stringify({actual:'original'}));fs.readFileSync(rawPath);
   fs.writeFileSync(workerPath,JSON.stringify({checks:[],acquisition:{fixtureRows:[],fixtureRequests:[],routeInstalled:true}}));await fs.promises.readFile(workerPath);
   fs.writeFileSync(rawPath,JSON.stringify({actual:'later mutation'}));await fs.promises.readFile(rawPath);
   for(const name of ['owner-candidate.json','owner-final.json']){fs.writeFileSync(path.join(temp,name+'.tmp'),'actual staged control');fs.renameSync(path.join(temp,name+'.tmp'),path.join(temp,name));}
   console.log(JSON.stringify({actualChildCode:code,actualCallbackCount:events.length}));
  }
 }catch(error){process.stderr.write(error.stack+'\n');process.exitCode=1;}
 finally{fs.rmSync(temp,{recursive:true});}
}else{
 const temp=fs.mkdtempSync(path.join(root,'shiftmgmt-sol-a1v7-'));
 try{
  if(kind==='denied')fs.writeFileSync(path.join(temp,'owner-final.json'),'must be denied');
  else{
   fs.mkdirSync(path.join(temp,'sync'));
   await fs.promises.mkdir(path.join(temp,'async'));
   fs.writeFileSync(path.join(temp,'a.txt'),'actual synchronous data');
   fs.renameSync(path.join(temp,'a.txt'),path.join(temp,'b.txt'));
   await fs.promises.writeFile(path.join(temp,'c.txt'),'actual asynchronous data');
   await fs.promises.rename(path.join(temp,'c.txt'),path.join(temp,'d.txt'));
   const stream=fs.createWriteStream(path.join(temp,kind==='logdenied'?'server-stdout.log':'worker-stdout.log'));
   const finished=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SOL_CANARY_FINISH_NOT_SEEN')),1000);stream.once('finish',()=>{clearTimeout(timer);resolve();});stream.once('error',error=>{clearTimeout(timer);reject(error);});});
   const streamClosed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SOL_CANARY_CLOSE_NOT_SEEN')),1000);stream.once('close',()=>{clearTimeout(timer);resolve();});stream.once('error',error=>{clearTimeout(timer);reject(error);});});
   // Join both immediately so deliberate denial never creates an unhandled promise.
   const settled=Promise.all([finished,streamClosed]);stream.end('actual stream data');await settled;
   const child=spawn(process.execPath,['-e','process.stdout.write("actual child\\n")'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   child.stdout.resume();child.stderr.resume();
   const closed=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
   if(closed!==0)throw new Error('Canary child failed');
   const server=http.createServer((request,response)=>response.end('owned canary response'));
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
   try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/');if(await response.text()!=='owned canary response')throw new Error('Canary HTTP mismatch');}
   finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
   const asyncTemp=await fs.promises.mkdtemp(path.join(root,'shiftmgmt-sol-a1v7-'));
   await fs.promises.rm(asyncTemp,{recursive:true});
  }
 }catch(error){process.stderr.write(error.stack+'\n');process.exitCode=1;}
 finally{fs.rmSync(temp,{recursive:true});}
}
