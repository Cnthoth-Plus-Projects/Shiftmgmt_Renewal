# -*- coding: utf-8 -*-
from pathlib import Path
DOC=Path(r'C:\Projects\Active\교대근무관리 시스템');NEW=DOC/'.ai/contracts/phase3-2c-a1-v6'
p=NEW/'partial-preload.mjs';s=p.read_text(encoding='utf-8')
s=s.replace("import path from 'node:path';","import path from 'node:path';\nimport crypto from 'node:crypto';")
old="const page=await newPage(...values),screenshot=page.screenshot.bind(page),viewport=page.viewportSize.bind(page),url=page.url.bind(page);"
assert old in s
s=s.replace(old,"""const page=await newPage(...values),screenshot=page.screenshot.bind(page),viewport=page.viewportSize.bind(page),url=page.url.bind(page);
   const route=page.route.bind(page),goto=page.goto.bind(page);
   page.route=async(pattern,handler,...rest)=>{
    note('actual-route-install-start',{pattern:String(pattern)});
    if(mode==='route-install-failure'){note('fault-triggered',{marker:'SOL_CORE_ROUTE_INSTALL_FAILURE_AFTER_ROWS'});throw new Error('SOL_CORE_ROUTE_INSTALL_FAILURE_AFTER_ROWS');}
    const result=await route(pattern,(r,q)=>{note('actual-fixture-handler-invoked',{url:q.url(),method:q.method()});return handler(r,q);},...rest);
    note('actual-route-installed',{pattern:String(pattern)});return result;
   };
   if(mode==='request-then-viewport-null')page.goto=async(...args)=>{const response=await goto(...args);const data=await page.evaluate(async()=>{const r=await fetch('/api/access-logs:list');return {status:r.status,body:await r.json()};});note('actual-fixture-fetch-completed',{status:data.status,rows:data.body?.data?.length});return response;};""")
assert "mode==='viewport-null'" in s;s=s.replace("mode==='viewport-null'","['viewport-null','request-then-viewport-null'].includes(mode)")
s+='''
let authorized=false;process.on('message',m=>{if(m?.type==='owner-run'&&m.protocol===2){authorized=true;note('actual-owner-run-received');}});
const realpath=fs.realpathSync.bind(fs);
fs.realpathSync=function(file,...args){if(authorized&&mode==='repository-realpath-failure'&&String(file)===process.cwd()){note('fault-triggered',{marker:'SOL_CORE_REPOSITORY_REALPATH_FAILURE_AFTER_RUN',path:String(file)});throw new Error('SOL_CORE_REPOSITORY_REALPATH_FAILURE_AFTER_RUN');}return realpath(file,...args);};
const capturedRead=fs.readFileSync.bind(fs);
fs.readFileSync=function(file,...args){const value=capturedRead(file,...args);if(authorized&&mode==='canonical-import-failure'&&String(file).replaceAll('\\\\','/').endsWith('/dist/server/shared/domain/access-log.js')){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);note('actual-canonical-bytes-acquired',{bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),path:String(file)});}return value;};
const Module=require('node:module'),load=Module._load;
Module._load=function(request,...args){if(authorized&&mode==='canonical-import-failure'&&String(request).replaceAll('\\\\','/').endsWith('/dist/server/shared/domain/access-log.js')){note('fault-triggered',{marker:'SOL_CORE_CANONICAL_IMPORT_FAILURE_AFTER_BYTES',path:String(request)});throw new Error('SOL_CORE_CANONICAL_IMPORT_FAILURE_AFTER_BYTES');}return load.call(this,request,...args);};
syncBuiltinESMExports();
'''
p.write_text(s,encoding='utf-8');print('V6_PRIVATE_PRELOAD_UPGRADED')
