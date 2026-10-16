// SUT helper tests and real owned Chrome close tests, separate from UI acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const repo=fs.realpathSync(process.cwd());
if(process.argv.slice(2).join(' ')==='--list'){console.log(JSON.stringify({proof:'PLAN_ONLY_NOT_RUN',semanticVectors:['fixed-expectation','unknown-id-field','recursive-nan','recursive-infinity','immutable-actual-snapshot','caller-extra-argument'],additionalTypedMutations:32,invalidTopLevelInputs:4,realResourceVectors:['context-close-throw-browser-still-closed','browser-close-throw-first-error-preserved']}));process.exit(0);}
const sut=await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-shared.mjs')).href);
assert.equal(typeof sut.collectCoreChecks,'function');assert.equal(typeof sut.settleOwnedResources,'function');
const args=process.argv.slice(2);assert.equal(args.length,6);
const options=new Map();for(let i=0;i<args.length;i+=2){assert.ok(['--core-manifest','--execution-sha','--baseline-sha'].includes(args[i]));assert.equal(options.has(args[i]),false);options.set(args[i],args[i+1]);}
const corePath=path.resolve(options.get('--core-manifest'));
const execution=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'execution.json'),'utf8'));
const verified=spawnSync(execution.pythonExecutable,['-B',path.resolve(import.meta.dirname,'gate-evidence.py'),'--execution-sha',options.get('--execution-sha'),'--baseline-sha',options.get('--baseline-sha'),'--final',corePath],{cwd:repo,windowsHide:true,encoding:'utf8',timeout:20000});
assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).result.case,'contract-core');
const candidate=JSON.parse(fs.readFileSync(corePath,'utf8'));
const observationPath=candidate.artifacts.find(a=>a.id==='core-observations').path;
const observations=JSON.parse(fs.readFileSync(observationPath,'utf8'));
const checks=sut.collectCoreChecks(structuredClone(observations));assert.equal(checks.length,9);
const input=structuredClone(observations);const immutable=sut.collectCoreChecks(input);input.viewport[0]=777;assert.deepEqual(immutable[0].actual,[1440,900]);
assert.ok(Object.isFrozen(immutable));assert.ok(Object.isFrozen(immutable[0]));assert.ok(Object.isFrozen(immutable[0].actual));
assert.throws(()=>{immutable[0].actual[0]=777;});
const mutations=[['fixed-expectation',r=>r.viewport=[777,555]],['recursive-nan',r=>r.resources[0].events[0].timeMs=NaN],['recursive-infinity',r=>r.resources[0].events[0].timeMs=Infinity]];
for(const [name,change] of mutations){const value=structuredClone(observations);change(value);assert.throws(()=>sut.collectCoreChecks(value),undefined,name);}
const copyRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shiftmgmt-sol-a1v6-canonical-copy-'));
const canonicalCopy=path.join(copyRoot,'access-log.js');fs.copyFileSync(observations.canonicalLabels.path,canonicalCopy);
const typedMutations=[
 ['repeated-created',r=>r.resources[0].events.forEach(e=>e.state='created')],
 ['reversed-states',r=>r.resources[0].events.forEach((e,i)=>e.state=['closed','close-start','created'][i])],
 ['extra-closed',r=>r.resources[0].events.push(structuredClone(r.resources[0].events.at(-1)))],
 ['numeric-resource-id',r=>r.resources[0].id=7],
 ['boolean-resource-id',r=>r.resources[0].id=true],
 ['array-resource-id',r=>r.resources[0].id=['browser']],
 ['same-bytes-alternate-canonical-path',r=>r.canonicalLabels.path=canonicalCopy],
 ['created-only-resources',r=>r.resources.forEach(resource=>resource.events=resource.events.slice(0,1))],
 ['duplicate-resource-kind',r=>r.resources[1].kind=r.resources[0].kind],
 ['duplicate-resource-id',r=>r.resources[1].id=r.resources[0].id],
 ['unordered-resource-time',r=>r.resources[0].events[2].timeMs=r.resources[0].events[0].timeMs-1],
 ['boolean-resource-time',r=>r.resources[0].events[0].timeMs=true],
 ['missing-resource',r=>r.resources.pop()],
 ['extra-resource',r=>r.resources.push(structuredClone(r.resources[0]))],
 ['fake-chrome-package-json',r=>r.chrome.path=path.join(repo,'package.json')],
 ['missing-chrome-version',r=>delete r.chrome.version],
 ['invalid-browser-version',r=>r.chrome.browserVersion='unknown'],
 ['missing-login-input',r=>delete r.loginInputs.password],
 ['unknown-login-field',r=>r.loginInputs.id.ignored=true],
 ['boolean-request-count',r=>r.fixtureRequestCount=false],
 ['unknown-error-field',r=>r.rawErrors.ignored=[]],
 ['unknown-observation-field',r=>r.expected='caller invented expectation'],
 ['unknown-chrome-field',r=>r.chrome.expectedPath=r.chrome.path],
 ['unknown-resource-field',r=>r.resources[0].pass=true],
 ['missing-canonical-metadata',r=>delete r.canonicalLabels],
 ['resource-close-error',r=>r.resources[0].events[2].state='close-error'],
 ['resource-unobserved-states',r=>r.resources.forEach(resource=>resource.events.forEach(ev=>ev.state='UNOBSERVED'))],
 ['fabricated-chrome-version',r=>r.chrome.version='0.0.0.0'],
 ['malformed-browser-version',r=>r.chrome.browserVersion='invalid-browser-version'],
 ['unknown-canonical-field',r=>r.canonicalLabels.expected='fake'],
 ['fabricated-canonical-sha',r=>r.canonicalLabels.sha256='0'.repeat(64)],
 ['fabricated-canonical-map',r=>r.canonicalLabels.labels['schedule-publish']='근무편성공개'],
];
for(const [name,change] of typedMutations){const value=structuredClone(observations);change(value);assert.throws(()=>sut.collectCoreChecks(value),undefined,name);}
for(const invalid of [null,[],true,'fake observations'])assert.throws(()=>sut.collectCoreChecks(invalid));
assert.throws(()=>sut.collectCoreChecks(observations,{expected:[777,555]}));
assert.throws(()=>sut.collectCoreChecks(observations,{id:'CORE-UNKNOWN'}));
const require=createRequire(path.join(repo,'package.json'));const {chromium}=require('playwright');
const {findChrome}=await import(pathToFileURL(path.join(repo,'scripts/lib/find-chrome.mjs')).href);
const resources=[];
for(const kind of ['context','browser']){
 const browser=await chromium.launch({executablePath:findChrome().path,headless:true});let context;
 try{
  context=await browser.newContext({viewport:{width:1440,height:900}});
  const ledger=[{kind:'browser',id:'browser-1',events:[{state:'created',timeMs:Date.now()}]},{kind:'context',id:'context-1',events:[{state:'created',timeMs:Date.now()}]}];
  const first={phase:'existing-first-failure',message:'SOL_A1_FIRST_ERROR',stack:'control-owned first failure'};
  const errors={primary:first,cleanup:[],evidence:[],unexpected:[]};
  const original=(kind==='context'?context:browser).close.bind(kind==='context'?context:browser);
  (kind==='context'?context:browser).close=async()=>{await original();throw new Error('SOL_A1_REAL_'+kind.toUpperCase()+'_CLOSE_THROW');};
  let timer;await Promise.race([sut.settleOwnedResources({context,browser},ledger,errors),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SUT cleanup timeout')),15000);})]).finally(()=>clearTimeout(timer));
  assert.equal(errors.primary,first);assert.ok(errors.cleanup.some(e=>JSON.stringify(e).includes('SOL_A1_REAL_')));assert.equal(browser.isConnected(),false);
  assert.ok(ledger.find(r=>r.kind==='browser').events.some(e=>['closed','close-error'].includes(e.state)));
  resources.push({case:kind+'-close-throw',ledger,errors,browserConnected:browser.isConnected()});
 }finally{if(context)try{await context.close();}catch{}try{await browser.close();}catch{}}
}
console.log(JSON.stringify({status:'PASS',proof:'ACTUAL_SUT_HELPERS_AND_OWNED_CHROME_CLOSE_ONLY',typedMutationCount:typedMutations.length,canonicalCopy,retention:'Retain exact external canonical copy',resources}));
