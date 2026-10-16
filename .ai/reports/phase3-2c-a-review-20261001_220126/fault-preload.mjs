// Sol review-only fault injection. Never installed in product source.
import fs from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const fault = process.env.SOL_A_REVIEW_FAULT || 'timer-only';
const eventFile = process.env.SOL_A_REVIEW_EVENT_FILE;
const write = fs.writeFileSync.bind(fs);
const read = fs.readFileSync.bind(fs);
const append = fs.appendFileSync.bind(fs);
const event = (type, data = {}) => append(eventFile, JSON.stringify({time:Date.now(),pid:process.pid,fault,type,...data})+'\n');
const timerSet = new Map();
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  const timer = originalSetTimeout(callback, delay, ...args);
  if ([90000,120000,180000].includes(delay)) {
    timerSet.set(timer, delay);
    event('owner-uncleared-timeout-observed', {delay});
  }
  return timer;
};
const originalSpawn = cp.spawn;
cp.spawn = (command, args, options) => {
  let actualArgs = args;
  const isServer = args?.some(a => String(a).endsWith('/main/server.js') || String(a).endsWith('\\main\\server.js'));
  const isRegression = args?.some(a => /[\\/]ui-checks[\\/](shell|home)\.mjs$/.test(String(a)));
  if (fault === 'regression-no-evidence' && isRegression) {
    actualArgs = ['--input-type=module','-e','process.stdout.write("SOL_REGRESSION_ZERO_EXIT_WITHOUT_MANIFEST_OR_CAPTURE\\n");'];
    event('regression-child-replaced', {originalArgs:args, actualArgs});
  }
  const child = originalSpawn(command, actualArgs, options);
  event('owned-child-spawn', {childPid:child.pid,isServer,isRegression,args:actualArgs});
  child.on('close', (code, signal) => {
    event('owned-child-really-closed', {childPid:child.pid,isServer,code,signal});
    if (!isServer) {
      for (const [timer,delay] of timerSet) {
        clearTimeout(timer);
        event('review-only-keepalive-timer-cleared-after-real-child-close',{delay,childPid:child.pid});
      }
      timerSet.clear();
    }
  });
  if (fault === 'server-close-not-observed' && isServer) {
    const once = child.once.bind(child);
    child.once = (name, callback) => name === 'close'
      ? once(name, (...values) => event('server-close-handler-suppressed-after-real-close',{childPid:child.pid,values}))
      : once(name, callback);
  }
  return child;
};
const changed = new Set();
fs.readFileSync = (file, ...args) => {
  const name = String(file);
  if (!changed.has(name)) {
    if (fault === 'png-24-byte-header' && name.endsWith('core-capture.png')) {
      const data = read(file);
      const truncated = data.subarray(0,24);
      write(file,truncated);
      changed.add(name);
      event('capture-truncated-on-disk',{path:name,originalBytes:data.length,actualBytes:truncated.length});
    } else if (fault === 'duplicate-core-ids' && name.endsWith('worker-final.json')) {
      const val=JSON.parse(read(file,'utf8'));
      val.checks=Array.from({length:9},()=>structuredClone(val.checks[0]));
      write(file,JSON.stringify(val,null,2));changed.add(name);
      event('worker-checks-replaced',{path:name,count:9,ids:val.checks.map(x=>x.id)});
    } else if (fault === 'unexpected-raw-error' && name.endsWith('core-observations.json')) {
      const val=JSON.parse(read(file,'utf8'));
      val.rawErrors.console.push('SOL_A_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401');
      write(file,JSON.stringify(val,null,2));changed.add(name);
      event('raw-error-injected-on-disk',{path:name,rawErrors:val.rawErrors});
    }
  }
  return read(file,...args);
};
fs.writeFileSync = (file,...args) => {
  if (fault === 'owner-final-write' && String(file).endsWith('owner-final.json')) {
    event('owner-final-write-rejected',{path:String(file)});
    throw new Error('SOL_A_INJECTED_OWNER_FINAL_WRITE_FAILURE');
  }
  return write(file,...args);
};
syncBuiltinESMExports();
