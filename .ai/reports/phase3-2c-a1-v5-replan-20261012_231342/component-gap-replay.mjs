// Control-only replay against exactly received v4. No v5 product acceptance.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const repo=fs.realpathSync(process.cwd()),report=import.meta.dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
assert.equal(sha(fs.readFileSync(path.join(repo,'scripts/ui-checks/access-history-shared.mjs'))),'FC963E330B6290C3E89FDE5ED989A5CE1545F676EC9CEB7D367801BEC59D69DC');
const old=JSON.parse(fs.readFileSync(path.join(report,'../phase3-2c-a1-v4-review-20261012_175305/component-suite.command.json'),'utf8'));assert.equal(old.rc,0);
const manifest=JSON.parse(fs.readFileSync(old.argv[old.argv.indexOf('--core-manifest')+1],'utf8'));
const item=manifest.artifacts.find(v=>v.id==='core-observations'),bytes=fs.readFileSync(item.path);assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);
const observations=JSON.parse(bytes),sut=await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-shared.mjs')).href);
assert.equal(sut.collectCoreChecks(structuredClone(observations)).length,9);
const copyRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-a1v5-canonical-copy-')),canonicalCopy=path.join(copyRoot,'access-log.js');fs.copyFileSync(observations.canonicalLabels.path,canonicalCopy);
const source=fs.readFileSync(path.join(report,'../../contracts/phase3-2c-a1-v5/component-probes.mjs'),'utf8');
const start=source.indexOf('const typedMutations=[')+'const typedMutations=['.length,end=source.indexOf(" ['created-only-resources'",start);assert.ok(start>0&&end>start);
// Execute only the seven Sol-authored control mutation expressions, never product input.
const mutations=Function('canonicalCopy','return ['+source.slice(start,end)+'];')(canonicalCopy);assert.equal(mutations.length,7);
const results=[];for(const [name,change] of mutations){const raw=structuredClone(observations);change(raw);let accepted=false;try{accepted=sut.collectCoreChecks(raw).length===9;}catch{}results.push({name,invalidRawAcceptedByV4:accepted});}
assert.ok(results.every(v=>v.invalidRawAcceptedByV4));
console.log(JSON.stringify({status:'EXPECTED_V4_COLLECTOR_GAPS_DETECTED',proof:'CONTROL_VECTORS_ONLY_NOT_V5_ACCEPTANCE',sourceSha256:sha(fs.readFileSync(path.join(repo,'scripts/ui-checks/access-history-shared.mjs'))),observationsPath:item.path,observationsSha256:item.sha256,canonicalCopy,results,retention:'Retain exact external canonical copy; source read-only'}));
