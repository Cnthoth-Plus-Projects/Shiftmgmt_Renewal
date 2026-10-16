import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const output=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Projects/Active/ShiftMgmt_V4';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-32-'));
const bootstrap=path.join(temp,'data/bootstrap-credentials.json');
const port='18742';
const url='http://127.0.0.1:'+port+'/';
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('SHIFTMGMT_'))delete env[key];
Object.assign(env,{SHIFTMGMT_USER_DATA_DIR:temp,SHIFTMGMT_PORT:port});
const {DEFAULT_ADMIN_BOOTSTRAP_PASSWORD}=await import(pathToFileURL(path.join(repo,'dist/server/shared/config/auth-password-policy.js')));
const server=spawn(process.execPath,[path.join(repo,'dist/server/main/server.js')],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let closed=false;let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
async function cleanup(){
 if(closed)return;closed=true;
 server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));
 const resolved=fs.realpathSync(temp);
 if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('shiftmgmt-sol-32-'))throw new Error('Temporary cleanup boundary mismatch');
 fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 fs.writeFileSync(path.join(output,'server-cleanup.json'),JSON.stringify({time:new Date().toISOString(),tempDataCleaned:true,serverStopped:true},null,2));
 console.log('ISOLATED_SERVER_CLEANED');
}
process.on('SIGINT',async()=>{await cleanup();process.exit(0);});
process.on('SIGTERM',async()=>{await cleanup();process.exit(0);});
const stopFile=path.join(temp,'sol-verification-stop');
const stopPoll=setInterval(async()=>{if(fs.existsSync(stopFile)){clearInterval(stopPoll);await cleanup();process.exit(0);}},250);
try{
 let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  if(server.exitCode!==null)throw new Error('Isolated server exited');
  try{
   const health=await fetch(url+'api/health',{signal:AbortSignal.timeout(1000)});
   if(health.ok){
    if(!fs.existsSync(bootstrap))await fetch(url+'api/auth:sign-in',{method:'POST',headers:{'Content-Type':'application/json',Origin:url.slice(0,-1)},body:JSON.stringify([{loginId:'admin',password:DEFAULT_ADMIN_BOOTSTRAP_PASSWORD}]),signal:AbortSignal.timeout(10000)});
    if(fs.existsSync(bootstrap)){ready=true;break;}
   }
  }catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 if(!ready)throw new Error('Readiness failed');
 const info={url,port:Number(port),dataDir:temp,bootstrapPath:bootstrap,stopFile,serverPid:server.pid,started:new Date().toISOString()};
 fs.writeFileSync(path.join(output,'server-info.json'),JSON.stringify(info,null,2));
 console.log('ISOLATED_SERVER_READY '+url);
 await new Promise(r=>server.once('exit',r));
 await cleanup();
}catch(error){await cleanup();throw error;}
