# -*- coding: utf-8 -*-
"""DEC-002 authorized v7 direct repair; one product file, no v8 packet."""
from pathlib import Path
from datetime import datetime,timezone
import difflib, hashlib, json, subprocess, sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
P=REPO/'scripts/ui-checks/access-history.mjs'
def meta(b):return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def dump(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
    initial=json.loads((REPORT/'initial-evidence.json').read_text(encoding='utf-8'))
    old=P.read_bytes();assert meta(old)==initial['sourceBefore']['files']['scripts/ui-checks/access-history.mjs']
    decision=DOC/'.ai/decisions/DEC-002.md';assert 'Sol(Codex)이 직접 수정' in decision.read_text(encoding='utf-8')
    out=REPORT/'helper-before-direct.stdout.txt';err=REPORT/'helper-before-direct.stderr.txt';start=datetime.now(timezone.utc).isoformat()
    with out.open('xb') as stdout,err.open('xb') as stderr:
        child=subprocess.Popen(['node',str(REPORT/'helper-probes.mjs')],cwd=REPO,stdout=stdout,stderr=stderr);rc=child.wait(timeout=30)
    assert rc==0
    proof=json.loads(out.read_text(encoding='utf-8'))
    assert all(r['accepted'] for r in proof['settlement']) and proof['cleanup']['calls']==['stop'] and not proof['cleanup']['errors'] and proof['snapshotCalls']==1 and not proof['streams']['stderrEnded']
    dump(REPORT/'helper-before-direct.command.json',{'argv':['node',str(REPORT/'helper-probes.mjs')],'pid':child.pid,'startUtc':start,'endUtc':datetime.now(timezone.utc).isoformat(),'rc':rc,'stdout':str(out),'stderr':str(err),'source':meta(old)})
    dump(REPORT/'direct-fix-authorization-trigger.json',{'status':'V7_REQUIREMENT_GAPS_REPRODUCED_DIRECT_FIX_AUTHORIZED','decision':str(decision),'decisionMeta':meta(decision.read_bytes()),'productBefore':meta(old),'findings':['A1V7-01 repeated success snapshot in barrier','A1V7-02 four unsettled receipts accepted by success guard','A1V7-03 stop rejection skips settle and cleanup errors vanish; first stream end exception skips second stream','A1V7-04 stream finish/close on instead of once'],'proof':'Actual extracted helpers with explicit controlled fixtures, not an owner runtime false PASS','v8Created':False})
    newline='\r\n' if b'\r\n' in old else '\n';s=old.decode('utf-8')
    def replace(a,b):
        nonlocal s
        assert s.count(a)==1,a
        s=s.replace(a,b)
    replace('import crypto from "node:crypto";','import crypto from "node:crypto";'+newline+'import { isDeepStrictEqual as same } from "node:util";')
    replace('const cleanProc = async (r) => { if (r) { try { await r.stop(1000); await r.settleLogs(1000); } catch {} } };','const cleanProc = async r => { if (r) for (const k of ["stop", "settleLogs"]) try { await r[k](1000); } catch (e) { cleanupErrors.push({ phase: "cleanup", ...errInfo(e), timeMs: Date.now() }); } };')
    replace('this.streams[s].on(ev, () =>','this.streams[s].once(ev, () =>')
    replace('if (this.settled) return; this.streams.stdout.end(); this.streams.stderr.end(); const dl = Date.now() + timeoutMs;', 'if (this.settled) return;'+newline+'    for (const s of ["stdout", "stderr"]) try { this.streams[s].end(); } catch (e) { this.logErrors[s] = this.logError = e; recordError(this.name + "-log-end", e, "A1_LOG_WRITE_FAILED"); try { this.streams[s].destroy(e); } catch (d) { cleanupErrors.push({ phase: "cleanup", ...errInfo(d), timeMs: Date.now() }); } }'+newline+'    const dl = Date.now() + timeoutMs;')
    a=s.index('function validateProcessReceipt(r) {');z=s.index(newline+'const waitChild =',a)
    guard='''function validateProcessReceipt(r) {
  const q = ok => { if (!ok) throw new Error("process receipt invalid"); }, ev = r?.callbackEvents, K = ["stdout", "stderr"];
  q(Array.isArray(ev) && ev.length === 7 && Number.isInteger(r.pid) && r.pid > 0);
  q(isObj(r.logsSettled, 2) && K.every(k => Object.hasOwn(r.logsSettled, k) && r.logsSettled[k] === true));
  const sg = {}, lg = {}, EK = ["event", "timeMs", "stream", "pid", "code", "signal", "error"];
  for (const e of ev) {
    q(isObj(e, 7) && EK.every(k => Object.hasOwn(e, k)) && Number.isFinite(e.timeMs) && e.timeMs > 0 && e.error === null);
    const k = e.event;
    q(["spawn", "exit", "close", "log-finish", "log-close"].includes(k));
    if (k.startsWith("log-")) { q(K.includes(e.stream) && e.pid === null && e.code === null && e.signal === null && !lg[k + e.stream]); lg[k + e.stream] = e; }
    else { q(e.stream === null && e.pid === r.pid && !sg[k]); sg[k] = e; q(e.code === null || Number.isInteger(e.code)); q(e.signal === null || typeof e.signal === "string" && !!e.signal); if (k === "spawn") q(e.code === null && e.signal === null); }
  }
  for (const [k, sn, tm, ck, sk] of [["spawn", null, "createdAtMs", null, null], ["exit", "exitSeen", "exitAtMs", "exitCode", "exitSignal"], ["close", "closeSeen", "closeAtMs", "closeCode", "closeSignal"]]) { const e = sg[k]; q(!!e && r[tm] === e.timeMs); if (sn) q(r[sn] === true && r[ck] === e.code && r[sk] === e.signal); }
  for (const [k, p] of [["log-finish", "logFinish"], ["log-close", "logClose"]]) { q(isObj(r[p + "Seen"], 2) && isObj(r[p + "AtMs"], 2)); for (const t of K) { const e = lg[k + t]; q(!!e && Object.hasOwn(r[p + "Seen"], t) && Object.hasOwn(r[p + "AtMs"], t) && r[p + "Seen"][t] === true && r[p + "AtMs"][t] === e.timeMs); } }
  q(ev[0].event === "spawn" && ev[1].event === "exit" && ev[2].event === "close" && r.aliveAfterClose === false);
  for (let i = 1; i < ev.length; i++) q(ev[i].timeMs >= ev[i - 1].timeMs);
  for (const t of K) { const e = ev.filter(e => e.stream === t); q(e.length === 2 && e[0].event === "log-finish" && e[1].event === "log-close" && r.closeAtMs <= r.logFinishAtMs[t] && r.logFinishAtMs[t] <= r.logCloseAtMs[t]); }
  q(r.createdAtMs <= r.exitAtMs && r.exitAtMs <= r.closeAtMs); return 7;
}
'''
    s=s[:a]+guard.replace('\n',newline)+s[z:]
    start=s.index('const checkBarrier =');end=s.index(newline,start)
    barrier='const checkBarrier = () => { if (primaryError) throw primaryError; for (const a of [unexpectedErrors, cleanupErrors, evidenceErrors]) if (a.length) throw a[0]; for (const [r, c] of [[workerReg, workerCached], [serverReg, serverCached], [gateReg, gateCached]]) if (r && c) for (const k of Object.keys(c)) { const v = k === "aliveAfterClose" ? isPidAlive(r.pid) : k === "logsSettled" ? { stdout: r.settled, stderr: r.settled } : r[k]; if (!same(v, c[k])) fail(r.name + "-barrier", k, "A1_LIFECYCLE_INVALID"); } };'
    s=s[:start]+barrier+s[end:]
    new=s.encode('utf-8');assert len(new)<=30000,('budget',len(new))
    assert (b'\r\n' in new)==(b'\r\n' in old)
    lines=list(difflib.unified_diff(old.decode('utf-8').splitlines(),s.splitlines(),fromfile='Gemini-v7/access-history.mjs',tofile='Sol-direct-v7/access-history.mjs',lineterm=''))
    with (REPORT/'sol-direct.diff').open('x',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
    dump(REPORT/'direct-change-plan.json',{'before':meta(old),'after':meta(new),'bytesDelta':len(new)-len(old),'changedProductFiles':['scripts/ui-checks/access-history.mjs'],'hunks':sum(l.startswith('@@') for l in lines),'added':sum(l.startswith('+') and not l.startswith('+++') for l in lines),'removed':sum(l.startswith('-') and not l.startswith('---') for l in lines),'lineEndingsPreserved':True,'v8Created':False})
    P.write_bytes(new)
    print(json.dumps({'status':'SOL_DIRECT_V7_CHANGED','before':meta(old),'after':meta(new),'bytesDelta':len(new)-len(old),'sourceFilesChanged':1,'v8Created':False}),flush=True)
if __name__=='__main__':main()
