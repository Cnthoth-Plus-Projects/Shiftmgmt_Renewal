import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=fs.realpathSync(process.cwd());
const sut=await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-shared.mjs')).href);
const manifest=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'current-core-path.json'),'utf8')).manifest,'utf8'));
const raw=JSON.parse(fs.readFileSync(manifest.artifacts.find(a=>a.id==='core-observations').path,'utf8'));
const valid=sut.collectCoreChecks(structuredClone(raw));
if(valid.length!==9)throw new Error('Valid actual core prerequisite failed');
const checks=sut.collectCoreChecks(structuredClone(raw));let mutationError=null;
try{checks[0].actual[0]=777;}catch(error){mutationError=error.message;}
const results=[{case:'mutable-returned-checks',acceptedMutable:mutationError===null&&checks[0].actual[0]===777,checkFrozen:Object.isFrozen(checks[0]),actualFrozen:Object.isFrozen(checks[0].actual),mutationError}];
for(const [name,change] of [
 ['resources-created-only',r=>r.resources=r.resources.map(x=>({...x,events:x.events.slice(0,1)}))],
 ['duplicate-resource-kind',r=>r.resources=[structuredClone(r.resources[0]),structuredClone(r.resources[0])]],
 ['chrome-arbitrary-file-missing-version',r=>r.chrome={path:path.join(repo,'package.json')}]
]){
 const observations=structuredClone(raw);change(observations);
 let accepted=false,error=null,count=null;
 try{count=sut.collectCoreChecks(observations).length;accepted=true;}catch(e){error=e.message;}
 results.push({case:name,acceptedInvalid:accepted,checks:count,error,observations});
}
fs.writeFileSync(path.join(import.meta.dirname,'helper-extra-results.json'),JSON.stringify({proof:'ACTUAL_SUT_COLLECTOR_DIRECT_CALLS_NOT_BROWSER_ACCEPTANCE',results},null,2));
console.log(JSON.stringify(results.map(({observations,...r})=>r)));
