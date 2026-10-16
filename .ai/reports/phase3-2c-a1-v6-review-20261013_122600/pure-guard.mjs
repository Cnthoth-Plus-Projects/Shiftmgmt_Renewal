// Sol control: evaluate only the current pure guard extracted from unchanged source.
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const source=fs.readFileSync('C:/Projects/Active/ShiftMgmt_V4/scripts/ui-checks/access-history.mjs','utf8');
const begin=source.indexOf('function validateProcessReceipt(r) {'),end=source.indexOf('\nconst waitChild =',begin);
if(begin<0||end<begin)throw new Error('Pure guard boundaries differ');
const isObj=source.split('\n').find(line=>line.startsWith('const isObj = '));
const context=vm.createContext({});vm.runInContext(isObj+'\n'+source.slice(begin,end)+'\nthis.validate=validateProcessReceipt;',context);
const results=input.map(({name,record,expectedReject})=>{try{return {name,expectedReject,accepted:true,eventCount:context.validate(record)};}catch(error){return {name,expectedReject,accepted:false,message:error.message,stack:error.stack};}});
console.log(JSON.stringify({proof:'ACTUAL_PURE_GUARD_ONLY_NOT_RUNTIME_ACCEPTANCE',results}));
