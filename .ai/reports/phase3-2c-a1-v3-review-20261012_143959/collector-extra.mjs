// Actual SUT helper calls on a real validated core observation; no product edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1');
const report=path.resolve(decodeURIComponent(root));
const source=process.argv[2];
const raw=JSON.parse(fs.readFileSync(source,'utf8'));
const sut=await import(pathToFileURL(path.resolve('scripts/ui-checks/access-history-shared.mjs')).href);
assert.equal(sut.collectCoreChecks(structuredClone(raw)).length,9);
const changes=[
 ['resource-close-error',r=>r.resources[0].events[2].state='close-error'],
 ['resource-unrelated-states',r=>r.resources.forEach(v=>v.events.forEach(e=>e.state='UNOBSERVED'))],
 ['chrome-unverified-version',r=>r.chrome.version='SOL_INVALID_VERSION'],
 ['chrome-invalid-browser-version',r=>r.chrome.browserVersion='SOL_INVALID_BROWSER_VERSION'],
 ['canonical-extra-field',r=>r.canonicalLabels.callerVerdict='PASS'],
 ['canonical-invalid-sha',r=>r.canonicalLabels.sha256='0'.repeat(64)],
 ['canonical-unmeasured-labels',r=>r.canonicalLabels.labels={invented:'SOL_FAKE_LABEL'}],
];
const records=[];
for(const[name,change]of changes){
 const observation=structuredClone(raw);change(observation);
 try{const checks=sut.collectCoreChecks(observation);records.push({name,rejected:false,observations:observation,checks});}
 catch(error){records.push({name,rejected:true,error:error.message});}
}
fs.writeFileSync(path.join(report,'collector-extra.json'),JSON.stringify({proof:'ACTUAL_SUT_HELPER_MUTATIONS_NOT_PRODUCT_UI_FAILURE',source,records},null,2));
console.log(JSON.stringify({source,actualHelperCalls:records.length,acceptedInvalid:records.filter(r=>!r.rejected).map(r=>r.name)}));
