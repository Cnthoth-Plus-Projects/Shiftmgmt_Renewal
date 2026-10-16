// Independent calls to the actual exported helper on an actual core observation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const report=import.meta.dirname;
const input=process.argv[2];
const raw=JSON.parse(fs.readFileSync(input,'utf8'));
const sut=await import(pathToFileURL(path.resolve('scripts/ui-checks/access-history-shared.mjs')).href);
if(sut.collectCoreChecks(structuredClone(raw)).length!==9)throw new Error('Positive actual observation invalid');
const copied=path.join(report,'same-bytes-canonical.cjs');
fs.writeFileSync(copied,fs.readFileSync(raw.canonicalLabels.path),{flag:'wx'});
const mutations=[
 ['repeated-created',r=>r.resources[0].events[1].state='created'],
 ['reversed-states',r=>{r.resources[0].events[0].state='closed';r.resources[0].events[2].state='created';}],
 ['extra-closed',r=>r.resources[0].events.push(structuredClone(r.resources[0].events.at(-1)))],
 ['numeric-resource-id',r=>r.resources[0].id=101],
 ['boolean-resource-id',r=>r.resources[0].id=true],
 ['array-resource-id',r=>r.resources[0].id=['browser-1']],
 ['caller-canonical-path',r=>r.canonicalLabels.path=copied],
];
const records=[];
for(const[name,change]of mutations){
 const observation=structuredClone(raw);change(observation);
 try{const checks=sut.collectCoreChecks(observation);records.push({name,rejected:false,observation,checks});}
 catch(error){records.push({name,rejected:true,error:{message:error.message,stack:error.stack},observation});}
}
const result={proof:'ACTUAL_SUT_HELPER_ONLY_NOT_WHOLE_GATE_ACCEPTANCE',input,
 sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.resolve('scripts/ui-checks/access-history-shared.mjs'))).digest('hex').toUpperCase(),records};
fs.writeFileSync(path.join(report,'collector-extra.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({actualCalls:records.length,acceptedInvalid:records.filter(r=>!r.rejected).map(r=>r.name)}));
