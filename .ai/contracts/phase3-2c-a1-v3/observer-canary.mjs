// Sol control canary; never an application scenario or an acceptance substitute.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const [kind,root]=process.argv.slice(2);
if(!kind||!root||!path.isAbsolute(root)||!fs.realpathSync(root).includes('shiftmgmt-sol-a1v3-selfcheck-'))throw new Error('Wrong owned canary root');
if(kind==='idle')process.exitCode=0;
else if(kind==='gate'){
 const good={status:'PASS',result:{status:'ACCEPTABLE_CANDIDATE',acceptance:'A1_PREREQUISITE_ONLY',case:'contract-core',runId:'run-canary',candidateSha256:'A'.repeat(64),executionSha256:'B'.repeat(64),checks:9,artifacts:7}};
 const child=spawn(process.execPath,['-e','process.stdout.write(process.argv[1]+"\\n")',JSON.stringify(good),'SOL_A1_GATE_CANARY'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
 const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
 if(result!==0||errors)throw new Error('Actual canary gate failed');
 process.stdout.write(output);
}else{
 const temp=fs.mkdtempSync(path.join(root,'shiftmgmt-sol-a1v3-'));
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
   stream.end('actual stream data');await finished;
   const child=spawn(process.execPath,['-e','process.stdout.write("actual child\\n")'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   child.stdout.resume();child.stderr.resume();
   const closed=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
   if(closed!==0)throw new Error('Canary child failed');
   const server=http.createServer((request,response)=>response.end('owned canary response'));
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
   try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/');if(await response.text()!=='owned canary response')throw new Error('Canary HTTP mismatch');}
   finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
   const asyncTemp=await fs.promises.mkdtemp(path.join(root,'shiftmgmt-sol-a1v3-'));
   await fs.promises.rm(asyncTemp,{recursive:true});
  }
 }catch(error){process.stderr.write(error.stack+'\n');process.exitCode=1;}
 finally{fs.rmSync(temp,{recursive:true});}
}
