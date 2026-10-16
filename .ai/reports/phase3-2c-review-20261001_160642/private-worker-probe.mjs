import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const report = path.dirname(fileURLToPath(import.meta.url));
const ownDirectory = fs.mkdtempSync(path.join(report,'worker-probe-'));
const bootstrap = path.join(ownDirectory,'test-only-bootstrap.json');
// These are deliberately fake values; the unregistered case never logs in.
fs.writeFileSync(bootstrap,JSON.stringify({credentials:{'user-admin':{loginId:'synthetic-unused-user',password:'synthetic-unused-value'}}}));
const requests = [];
const server = http.createServer((request,response) => {
  requests.push({method:request.method,url:request.url});
  if(request.url === '/api/health') {
    response.writeHead(200,{'Content-Type':'application/json'});
    response.end(JSON.stringify({ok:true,probe:'Sol-owned synthetic health stub'}));
  } else {
    response.writeHead(200,{'Content-Type':'text/html'});
    response.end('<!doctype html><html><head><title>Sol-owned verification stub</title></head><body>검수용 임시 페이지</body></html>');
  }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url = `http://127.0.0.1:${server.address().port}/`;
let result;
try {
  const child = spawn(process.execPath,['scripts/ui-checks/access-history-positive.mjs','--case=sol-unregistered-case'],{
    cwd:process.cwd(),windowsHide:true,
    env:{...process.env,SHIFT_TARGET_URL:url,SHIFT_RUN_DIR:ownDirectory,SHIFTMGMT_UI_BOOTSTRAP_FILE:bootstrap},
    stdio:['ignore','pipe','pipe'],
  });
  let stdout='',stderr='';
  child.stdout.on('data',data=>stdout+=data);
  child.stderr.on('data',data=>stderr+=data);
  const timer=setTimeout(()=>child.kill(),30000);
  const rc=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  clearTimeout(timer);
  fs.writeFileSync(path.join(ownDirectory,'stdout.txt'),stdout);
  fs.writeFileSync(path.join(ownDirectory,'stderr.txt'),stderr);
  result={rc,url,childPid:child.pid,requests,assertions:JSON.parse(fs.readFileSync(path.join(ownDirectory,'action-assertions.json'),'utf8')),stdout,stderr,ownDirectory};
} finally {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  fs.unlinkSync(bootstrap);
}
result.ownServerClosed = !server.listening;
result.bootstrapRemoved = !fs.existsSync(bootstrap);
fs.writeFileSync(path.join(report,'private-worker-probe.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({rc:result.rc,requests:result.requests,assertions:result.assertions,ownServerClosed:result.ownServerClosed,bootstrapRemoved:result.bootstrapRemoved}));
