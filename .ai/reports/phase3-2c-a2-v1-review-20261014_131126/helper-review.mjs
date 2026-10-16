// Actual exported-helper calls. These are helper/CLI proofs, not whole-owner PASS claims.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const repo='C:/Projects/Active/ShiftMgmt_V4';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-a2-helper-review-'));
const {installNormalObserver,publishNormalEvidence,readNormalWorkerEvidence,parseNormalBridgeQuery,performNormalLogin,NormalHeldRouteController}=await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-negative.mjs')).href);
const {loadContract,loadExecution}=await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-shared.mjs')).href);
const contract=loadContract(),execution=loadExecution();
const results=[];

// Both actual fs.writeFileSync calls fail with ENOENT; updatePartial returns silently.
const missing=path.join(root,'not-created');
const state=installNormalObserver({context:{repository:repo,runDir:missing},caseName:'live-admin',contract,execution,nonceSha256:'A'.repeat(64)});
const write=fs.writeFileSync;let denied=[];
fs.writeFileSync=function(file,...args){try{return write.call(fs,file,...args);}catch(e){if(String(file).startsWith(missing))denied.push({path:String(file),code:e.code});throw e;}}
let threw=false;try{state.updatePartial();}catch{threw=true;}finally{fs.writeFileSync=write;}
results.push({name:'both-real-partial-writes-fail',threw,actualFsErrors:denied,stateErrors:structuredClone(state.errors)});

// Invalid state and pending status0 reach real atomic raw/worker-final publication.
const base=path.join(repo,'artifacts/captures/phase3/access-history-live-admin');
fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'run-sol-helper-invalid-'));
const invalid=installNormalObserver({context:{repository:repo,runDir:run},caseName:'live-admin',contract,execution,nonceSha256:'B'.repeat(64)});
invalid.requests.push({id:1,source:'page',method:'POST',url:'http://127.0.0.1:18741/api/access-logs:list',phase:'scenario',startedAtMs:Date.now(),endedAtMs:null,status:0,ok:true,errorCode:null,query:{}});
invalid.resources.context.error='SOL_HELPER_CLOSE_ERROR';invalid.errors.cleanup.push({name:'Error',message:'SOL_HELPER_CLOSE_ERROR',stack:'SOL_HELPER_CLOSE_ERROR',phase:'cleanup'});
const oldExit=process.exitCode;publishNormalEvidence(invalid);process.exitCode=oldExit;
const wf=JSON.parse(fs.readFileSync(path.join(run,'worker-final.json'),'utf8'));
const raw=JSON.parse(fs.readFileSync(path.join(run,'normal-observations.json'),'utf8'));
results.push({name:'invalid-state-published',run,status:wf.status,exitCode:wf.exitCode,pendingRewritten:raw.requests[0],steps:raw.steps,resources:raw.resources,errors:raw.errors});

// readNormalWorkerEvidence is an existence/JSON loader; it accepts forged case, status and digest.
const readRun=path.join(root,'forged-reader');fs.mkdirSync(readRun);
write(path.join(readRun,'normal-observations.json'),JSON.stringify({case:'unknown',workerPid:-1}));
write(path.join(readRun,'worker-final.json'),JSON.stringify({status:'PASS',exitCode:0,rawSha256:'BAD',coverage:{requiredIds:[]}}));
let accepted;try{accepted=readNormalWorkerEvidence({caseName:'live-admin',context:{runDir:readRun},execution,contract,workerPid:12345,exitCode:7});}catch(e){accepted={rejected:e.message};}
results.push({name:'forged-reader-fields',returned:accepted});

// The strict Request.postDataJSON API is never called and disallowed query fields are silently dropped.
let jsonCalls=0;
const query=parseNormalBridgeQuery({postDataJSON(){jsonCalls++;return [{keyword:'real'}];},postData(){return JSON.stringify([{keyword:'real',forbiddenField:'discarded'}]);}});
results.push({name:'request-query-not-strict',postDataJSONCalls:jsonCalls,returned:query});

// Harmless marker demonstrates no secret-aware error redaction in the login helper.
const fakeSecret='SOL_FAKE_SECRET_FOR_REDACTION_TEST';let loginError;
const fakePage={async goto(){},locator(selector){return {async fill(){if(selector==='#login-password')throw new Error(fakeSecret);}};}};
try{await performNormalLogin(fakePage,'http://127.0.0.1:18741/',{loginId:'test',password:fakeSecret});}catch(e){loginError={markerStillPresent:e.message.includes(fakeSecret),name:e.name};}
results.push({name:'login-error-no-redaction',error:loginError,proof:'SOURCE_HELPER_WITH_HARMLESS_TEST_MARKER_NOT_REAL_CREDENTIAL'});

// A successful wait leaves its original referenced timeout alive.
const nativeTimer=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;const timers=[];let clears=0;
globalThis.setTimeout=(fn,ms,...args)=>{const id=nativeTimer(fn,ms,...args);timers.push(id);return id;};
globalThis.clearTimeout=(id)=>{clears++;return nativeClear(id);};
const held=new NormalHeldRouteController(null,10000);const handled=held.handle({async fulfill(){}});await held.waitForStart();held.release({status:200,json:{ok:true,data:[]}});await held.waitForComplete();await handled;
globalThis.setTimeout=nativeTimer;globalThis.clearTimeout=nativeClear;
const timerProof={created:timers.length,clearedBySut:clears,stillReferenced:timers.filter(t=>t.hasRef()).length};for(const t of timers)nativeClear(t);
results.push({name:'held-success-timer-leak',...timerProof});

// A directory junction is owned here and read-only targets the existing verifier directory.
const link=path.join(root,'verifier-junction');fs.symlinkSync(path.join(repo,'scripts/ui-checks'),link,'junction');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(SOL_|SHIFT_|SHIFTMGMT_|AUTH_BOOTSTRAP_)/.test(k)&&!['NODE_OPTIONS','NODE_DEBUG'].includes(k)));
for(const [file,caseName]of[['positive','live-admin'],['negative','errors']]){
 const argv=[path.join(link,'access-history-'+file+'.mjs'),'--case='+caseName];const r=spawnSync(process.execPath,argv,{cwd:repo,env,windowsHide:true,encoding:'utf8'});
 results.push({name:'junction-direct-'+file,pid:r.pid,argv,rc:r.status,stdout:r.stdout,stderr:r.stderr,actualEntryRealpath:fs.realpathSync(argv[0])});
}
const document={proof:'ACTUAL_SOURCE_HELPER_AND_JUNCTION_CLI_PROOFS_NOT_WHOLE_OWNER_ACCEPTANCE',root,results,productEdits:0,retention:'Keep own evidence/junction/invalid helper run; no foreign path cleanup'};
write(path.join(root,'helper-result.json'),JSON.stringify(document,null,2));
console.log(JSON.stringify({artifact:root,results,proof:document.proof}));
