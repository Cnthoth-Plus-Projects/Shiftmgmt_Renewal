import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const output=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Projects/Active/ShiftMgmt_V4';
const {DEFAULT_ADMIN_BOOTSTRAP_PASSWORD}=await import(pathToFileURL(path.join(repo,'dist/server/shared/config/auth-password-policy.js')));
const home=['empty-fixture','stale-retry-action','stale-watch-action','live-admin','operator-fixture','loading-error','stale-response','admin-action','employees-error','sites-error','sync-error','recovery-error','watch-error'];
const login=['flow','locked','recovery','session-error','post-change-null','post-change-error','post-change-race-success','post-change-race-null','post-change-race-error','post-change-race-login','post-change-first-held'];
const jobs=[...home.map(c=>['home',c]),...login.map(c=>['login',c]),['shell',null],['ready',null]];
const filter=process.argv.slice(2);
const results=[];
const runLabel=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const selected=filter.length?jobs.filter(([s,c])=>filter.includes(s+':'+(c||'default'))):jobs;
const baseEnv={...process.env};for(const name of Object.keys(baseEnv))if(name.startsWith('SHIFTMGMT_'))delete baseEnv[name];
for(const [screen,scenario] of selected){
 const label=screen+'-'+(scenario||'default');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-ui-'));
 if(path.dirname(fs.realpathSync(temp))!==fs.realpathSync(os.tmpdir()))throw new Error('Temporary path boundary mismatch');
 const bootstrap=path.join(temp,'data/bootstrap-credentials.json');
 const env={...baseEnv,SHIFTMGMT_USER_DATA_DIR:temp,SHIFTMGMT_PORT:'18739',SHIFTMGMT_UI_BOOTSTRAP_FILE:bootstrap};
 const before=new Set(fs.existsSync(path.join(repo,'artifacts/captures/phase3'))?fs.readdirSync(path.join(repo,'artifacts/captures/phase3'),{recursive:true}).filter(p=>p.endsWith('manifest.json')):[]);
 const started=new Date().toISOString();
 const server=spawn(process.execPath,[path.join(repo,'dist/server/main/server.js')],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let serverOutput='';server.stdout.on('data',d=>serverOutput+=d);server.stderr.on('data',d=>serverOutput+=d);
 let script;
 try{
  let healthy=false;
  for(let attempt=0;attempt<100;attempt++){
   if(server.exitCode!==null)throw new Error('Isolated server exited before readiness');
   try{const response=await fetch('http://127.0.0.1:18739/api/health',{signal:AbortSignal.timeout(1000)});if(response.ok){if(!fs.existsSync(bootstrap))await fetch('http://127.0.0.1:18739/api/auth:sign-in',{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://127.0.0.1:18739'},body:JSON.stringify([{loginId:'admin',password:DEFAULT_ADMIN_BOOTSTRAP_PASSWORD}]),signal:AbortSignal.timeout(10000)});if(fs.existsSync(bootstrap)){healthy=true;break;}}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  if(!healthy){fs.writeFileSync(path.join(output,'ui-setup-failure.json'),JSON.stringify({started,serverExit:server.exitCode,bootstrapExists:fs.existsSync(bootstrap),files:fs.readdirSync(temp,{recursive:true}),serverOutput:serverOutput.split('\n').filter(line=>!/password|Recovery key|credentials/i.test(line)).slice(-15)},null,2));throw new Error('Isolated server did not become healthy');}
  if(screen==='login'&&scenario==='recovery'){
   const issued=spawnSync(process.execPath,[path.join(repo,'scripts/issue-account-recovery-key.mjs'),'--db',path.join(temp,'data/shiftmgmt.sqlite'),'--no-backup'],{cwd:repo,env,encoding:'utf-8',windowsHide:true});
   const key=issued.stdout.match(/Recovery key: (SMR(?:-[A-F0-9]{4}){10})/)?.[1];
   if(issued.status!==0||!key)throw new Error('Isolated recovery-key setup failed');
   const secret=path.join(temp,'recovery-secret.txt');fs.writeFileSync(secret,key);env.SHIFTMGMT_UI_RECOVERY_SECRET_FILE=secret;
  }
  const args=[path.join(repo,'scripts/ui-checks',screen+'.mjs'),'http://127.0.0.1:18739/'];if(scenario)args.push('--case='+scenario);
  const child=spawn(process.execPath,args,{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const timeout=setTimeout(()=>child.kill(),120000);
  const exit=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  clearTimeout(timeout);fs.writeFileSync(path.join(output,'ui-'+label+'-'+runLabel+'.log'),log);
  script={command:['node','scripts/ui-checks/'+screen+'.mjs','http://127.0.0.1:18739/',...(scenario?['--case='+scenario]:[])],exitCode:exit.code,signal:exit.signal};
 }finally{
  server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));
  if(path.dirname(fs.realpathSync(temp))!==fs.realpathSync(os.tmpdir())||!path.basename(temp).startsWith('shiftmgmt-sol-ui-'))throw new Error('Refusing temporary cleanup outside verified boundary');
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
 const capturesRoot=path.join(repo,'artifacts/captures/phase3');
 const newManifests=fs.readdirSync(capturesRoot,{recursive:true}).filter(p=>p.endsWith('manifest.json')&&!before.has(p)).map(p=>({path:'artifacts/captures/phase3/'+p.replaceAll('\\','/'),...JSON.parse(fs.readFileSync(path.join(capturesRoot,p),'utf-8'))}));
 const result={label,started,finished:new Date().toISOString(),...script,tempCleaned:true,manifests:newManifests.map(m=>({path:m.path,status:m.status,captures:m.captures?.length||0}))};
 results.push(result);
 const record=path.join(output,'ui-results-'+(filter.length?filter.join('_').replaceAll(':','-'):'all')+'-'+runLabel+'.json');fs.writeFileSync(record,JSON.stringify(results,null,2));
 console.log(JSON.stringify(result));
 if(script.exitCode!==0||newManifests.some(m=>m.status!=='PASS')){process.exitCode=1;break;}
}
