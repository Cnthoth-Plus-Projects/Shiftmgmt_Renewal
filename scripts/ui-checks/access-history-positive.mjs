// 활동 이력 정상 6개 시나리오 공통 실행기 (runScreenCheck 실제 호출)
import { createEvidenceRun as createLiveRun } from "./access-history-evidence-dispatch.mjs";
import { withPositiveLifecycle } from "./access-history-sdk-lifecycle.mjs";
import path from "node:path";
import { evidenceJSON as aj } from "../lib/artifact-privacy.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runScreenCheck } from "../lib/ui-check.mjs";
import assert from "node:assert/strict";
import {
  performNormalLogin as performLogin,
  parseNormalBridgeQuery as parseBridgeQuery,
  NormalHeldRouteController as HeldRouteController,
  installNormalObserver,
  publishNormalEvidence,
  withNormalBrowserObservation
} from "./access-history-negative.mjs";
import {
  inspectG1Properties,
  rejectG1,
  exactKeys,
  validateJsonData,
  validateNormalCallerInputs,
  validateNormalEvidenceState
} from "./access-history-g1.mjs";
export { rejectG1, exactKeys, validateJsonData };
import {
  createMockAccessLogs,
  loadContract,
  loadExecution,
  performWorkerIpcHandshake,
  CONTRACT_PATH,
  CONTRACT_SHA256,
  EXECUTION_PATH,
  EXECUTION_SHA256
} from "./access-history-shared.mjs";

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();

export class NormalAssertionCollector {
  constructor(caseName, contract, state = null) {
    this.caseName = caseName;
    this.contract = contract;
    this.state = state || { diagnostics: [] };
    this.seenIds = new Set();
  }

  expectEqual(...args) {
    let id, pointer, actual, expected;
    if (args.length === 3) {
      id = args[0]; expected = args[1]; actual = args[2]; pointer = null;
    } else {
      id = args[0]; pointer = args[1]; actual = args[2]; expected = args[3];
    }
    if (this.seenIds.has(id)) throw new Error(`[Assertion] Duplicate ID: ${id}`);
    this.seenIds.add(id);
    if (actual === undefined || expected === undefined) throw new Error(`[Assertion ${id}] undefined`);
    if (typeof actual === "number" && !Number.isFinite(actual)) throw new Error(`[Assertion ${id}] actual non-finite`);
    if (typeof expected === "number" && !Number.isFinite(expected)) throw new Error(`[Assertion ${id}] expected non-finite`);

    const diag = { id, pointer, operator: "equal", actual: structuredClone(actual), expected: structuredClone(expected), tolerance: null, trusted: false };
    this.state.diagnostics.push(diag);
    assert.deepStrictEqual(actual, expected);
  }

  expectNear(...args) {
    let id, pointer, actual, expected, tolerance;
    if (args.length === 4) {
      id = args[0]; expected = args[1]; actual = args[2]; tolerance = args[3]; pointer = null;
    } else {
      id = args[0]; pointer = args[1]; actual = args[2]; expected = args[3]; tolerance = args[4] ?? 1;
    }
    if (this.seenIds.has(id)) throw new Error(`[Assertion] Duplicate ID: ${id}`);
    this.seenIds.add(id);
    if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
      throw new Error(`[Assertion ${id}] invalid tolerance: ${tolerance}`);
    }
    if (typeof actual !== "number" || !Number.isFinite(actual)) throw new Error(`[Assertion ${id}] actual non-finite`);
    if (typeof expected !== "number" || !Number.isFinite(expected)) throw new Error(`[Assertion ${id}] expected non-finite`);

    const diag = { id, pointer, operator: "near", actual, expected, tolerance, trusted: false };
    this.state.diagnostics.push(diag);
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`[Assertion ${id}] diff ${Math.abs(actual - expected)} > tol ${tolerance}`);
    }
  }

  validateRequiredCoverage() {
    const required = (this.contract?.fullUi?.rules?.[this.caseName] || []).map(r => r.id);
    const ids = this.state.diagnostics.map(d => d.id);
    return { requiredIds: required, missing: required.slice(), extra: ids, duplicates: [] };
  }

  toJSON() {
    return this.state.diagnostics;
  }
}


const AssertionCollector = NormalAssertionCollector;
export function readNormalWorkerEvidence(args) {
  inspectG1Properties(args, "caller", { isRecord: true });

  const context = Object.getOwnPropertyDescriptor(args, "context")?.value;
  const caseName = Object.getOwnPropertyDescriptor(args, "caseName")?.value;
  const contract = Object.getOwnPropertyDescriptor(args, "contract")?.value;
  const execution = Object.getOwnPropertyDescriptor(args, "execution")?.value;
  const workerPid = Object.getOwnPropertyDescriptor(args, "workerPid")?.value;
  const exitCode = Object.getOwnPropertyDescriptor(args, "exitCode")?.value;

  validateNormalCallerInputs({ context, caseName, contract, execution, workerPid, exitCode, reader: true });

  const expectedSchema = (Object.hasOwn(contract, "evidenceSchema") && Object.getOwnPropertyDescriptor(contract, "evidenceSchema").value !== null)
    ? Object.getOwnPropertyDescriptor(contract, "evidenceSchema").value
    : "shiftmgmt.verifier.evidence.v1";

  let captureNames = [];
  if (Object.hasOwn(execution, "normalCaptures")) {
    const dCaps = Object.getOwnPropertyDescriptor(execution, "normalCaptures");
    if (dCaps.value !== null && Object.hasOwn(dCaps.value, caseName)) {
      const dCaseCaps = Object.getOwnPropertyDescriptor(dCaps.value, caseName);
      if (dCaseCaps.value !== null) {
        const arr = dCaseCaps.value;
        captureNames = [];
        for (let i = 0; i < arr.length; i++) {
          captureNames.push(Object.getOwnPropertyDescriptor(arr, String(i)).value);
        }
      }
    }
  }

  const rd = context.runDir;
  const rp = path.join(rd, "normal-observations.json"), wp = path.join(rd, "worker-final.json");
  if (!fs.existsSync(rp) || !fs.existsSync(wp)) throw Error("Missing normal worker artifacts");

  const rawBytes = fs.readFileSync(rp), raw = JSON.parse(rawBytes + ""), wf = JSON.parse(fs.readFileSync(wp) + "");
  const cov = validateNormalEvidenceState(raw, { context, caseName, contract, execution, expectedPid: workerPid, mode: "raw" });

  exactKeys(wf, ["schema", "stageSlice", "case", "runId", "contractSha256", "executionSha256", "contextSha256", "workerPid", "status", "exitCode", "checks", "coverage", "rawSha256"], "workerFinal");

  if (wf.exitCode !== 1) rejectG1("caller.exitCode");
  for (const [a, b, k] of [
    [wf.schema, expectedSchema, "schema"],
    [wf.stageSlice, "A2", "stageSlice"],
    [wf.case, caseName, "case"],
    [wf.case, raw.case, "case"],
    [wf.runId, raw.runId, "runId"],
    [wf.contractSha256, CONTRACT_SHA256, "contractSha256"],
    [wf.executionSha256, EXECUTION_SHA256, "executionSha256"],
    [wf.contextSha256, raw.contextSha256, "contextSha256"],
    [wf.workerPid, workerPid, "workerPid"],
    [wf.workerPid, raw.workerPid, "workerPid"],
    [wf.status, "FAIL_INCOMPLETE", "status"],
    [wf.rawSha256, sha(rawBytes), "rawSha256"]
  ]) if (a !== b) rejectG1("workerFinal." + k);

  if (!Array.isArray(wf.checks) || wf.checks.length) rejectG1("workerFinal.checks");
  try {
    assert.deepStrictEqual(wf.coverage, cov);
  } catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    rejectG1("workerFinal.coverage");
  }

  const arts = ["server-stdout", "server-stderr", "worker-stdout", "worker-stderr", "normal-observations", "worker-final"];
  if (!["errors", "session-expired"].includes(caseName)) arts.push("normal-protected-manifest");
  for (const n of captureNames) {
    arts.push("normal-capture-" + n);
  }
  return { raw, workerFinal: wf, coverage: cov, artifactIds: arts };
}
// B2_PAGE_OBSERVER_BEGIN
export function createNormalPageObserver(n,q,j=0){const B=new URL(loadExecution().url).origin,_=B+"/api/",k=e=>e?.startsWith?.(_),G=new WeakMap,i=new Set,w=e=>Object.assign(Error(e),{code:e}),v=(e,r)=>({code:e,kind:"page",phase:r?.r?.phase||n.phase,requestId:r?.r?.id||null}),a=Date.now,P="G2_PAGE_OBSERVER_DISPOSED",O="G2_PAGE_DRAIN_TIMEOUT";let g=0,d=null,s=!1,l=null,N,x,c=0,M=[],f=new Set,R=null,$=null;const m=()=>$||=w(d||P),L=e=>{f.forEach(r=>r.b(e)),f.clear()},W=()=>{s=!0,c&&(clearTimeout(c),c=0);for(const[e,r]of b)q.removeListener(e,r);for(const e of M)try{e()}catch{}M=[]};function p(e,r,o){if(s)return;d||=(R=o,r),e&&!e.t&&(e.t=1,e.r.endedAtMs=a(),e.reason=o,i.delete(e)),r&&n.errors.unexpected.push(v(r,e)),W();const t=m();L(t),x?.(t)}const F=()=>{if(s)return;d||=(R=w(O),O);const e=a();i.forEach(r=>{r.t||(r.t=1,r.r.endedAtMs=e,r.reason||=w(O),n.errors.unexpected.push(v(O,r)))}),i.clear(),p()};function E(){if(!s){if(d)return p();if((i.size||g)&&(l||f.size)?c||=setTimeout(F,5e3):c&&(clearTimeout(c),c=0),!i.size&&!g){if(l){W(),L(w(P)),N?.();return}if(f.size){const e=[...f];f.clear();for(const r of e){if(s){r.b(m());continue}try{r.a(r.op())}catch(o){r.b(o)}}}}}}function Q(e){return s||l&&!d?Promise.reject(s?m():w(P)):!i.size&&!g&&!d?new Promise(r=>r(e())):new Promise((r,o)=>{f.add({op:e,a:r,b:o}),E()})}typeof j=="function"&&M.push(j(Q));function Y(e){if(s)return;const r=e.url();if(!k(r))return;const o=r.includes("logs:list")&&!/^(role-guard|session-expired)$/.test(n.case),t={id:n.nextRequestId(),source:"page",method:e.method(),url:r,phase:n.phase,startedAtMs:a(),endedAtMs:null,status:0,ok:null,errorCode:null,query:o?parseBridgeQuery(e):null};n.requests.push(t);const h={r:t,t:!1,b:!1,s:!1,reason:null};G.set(e,h),i.add(h),E()}function J(e){if(s)return;const r=e.url();if(!k(r))return;const o=e.request?.(),t=o?G.get(o):null;if(!t)return p(null,"G2_PAGE_REQUEST_UNKNOWN");if(t.t||t.s)return;t.s=1;const h=e.status?.()||0;t.r.status=h,h>=400&&!t.b&&(t.b=1,n.rawErrors.badResponses.push({requestId:t.r.id,status:h,url:r,method:t.r.method,errorCode:null,timeMs:a()}));const y=r===_+"app:get-version"&&t.r.method==="POST"&&h===200;g++,Promise.resolve().then(()=>e.json()).then(u=>{if(g--,s||t.t)return E();if(!(y?typeof u=="string":u&&typeof u=="object"&&!Array.isArray(u)&&typeof u.ok=="boolean"&&(u.errorCode==null||typeof u.errorCode=="string")))return p(t,"G2_PAGE_BODY_INVALID",u);if(t.t=1,t.r.ok=y?null:u.ok,t.r.errorCode=y?null:u.errorCode??null,t.r.endedAtMs=a(),i.delete(t),t.b){const A=n.rawErrors.badResponses.find(I=>I.requestId===t.r.id);A&&(A.errorCode=t.r.errorCode)}if(r.startsWith(_+"auth:")){const A=r.slice(_.length+5);if(/^(sign-(in|out)|change-password|get-session)$/.test(A)){const I=u.data,z=I?.user,U=n.auth.at(-1),T=A==="sign-out",C=(D,H)=>T?U?.[D]:I?.[D]||z?.[H||D]||U?.[D]||null,V=C("userId","id");(T||V)&&n.recordAuth({operation:A,loginId:C("loginId"),userId:V,role:C("role"),ok:u.ok,passwordChangeRequired:!T&&(I?.passwordChangeRequired??z?.passwordChangeRequired??null),timeMs:t.r.endedAtMs})}}E()}).catch(u=>{g--,!s&&!t.t?p(t,"G2_PAGE_BODY_INVALID",u):E()})}function K(e){if(s)return;const r=e.url?.()||"",o=G.get(e);o&&o.t||(n.rawErrors.requestfailed.push(`${r} (${e.failure?.()?.errorText??"unknown"})`),k(r)&&o&&p(o,"G2_PAGE_REQUEST_FAILED",e.failure?.()??"failed"))}const X=e=>{!s&&e?.type?.()==="error"&&n.rawErrors.console.push({text:e.text?.()||"",url:e.location?.()?.url||"",timeMs:a()})},Z=e=>{!s&&n.rawErrors.pageerror.push({message:e?.error?.()?.message||e?.message||String(e),timeMs:a()})},b=[["request",Y],["response",J],["requestfailed",K],["console",X],["weberror",Z]];for(const[e,r]of b)q.on(e,r);return{drain(){return l||(l=s?Promise.reject(m()):new Promise((e,r)=>(N=e,x=r)),l.catch(Object),s||E(),l)},dispose(){s||(d||=(R=w(P),P),p(0,0,R))}}}
// B2_PAGE_OBSERVER_END
const selfReal = fs.realpathSync(fileURLToPath(import.meta.url));
const entryReal = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : "";
if (entryReal && selfReal === entryReal) {
  const live=createLiveRun({argv:process.argv.slice(2)}),caseArg=live.caseName;
  let contract, execution;
  try {
    contract = loadContract();
    execution = loadExecution();
  } catch (e) {
    process.stderr.write(aj({ status: "FAIL", code: "A1_LOCK_MISMATCH", case: caseArg, error: { message: e.message } }) + "\n");
    process.exit(1);
  }

  live.validate(execution,contract);
  const POSITIVE_CASES = new Set(contract.privateCases?.["access-history-positive.mjs"] || [
    "live-admin", "list-fixture", "empty-fixture", "filters", "stale-response", "role-guard"
  ]);

  if (!POSITIVE_CASES.has(caseArg)) {
    process.stderr.write(`[오류] 등록되지 않은 케이스: '${caseArg}'\n`);
    process.exit(1);
  }

  const { context, nonceSha256 } = await performWorkerIpcHandshake(caseArg, contract);
  const targetUrl = context.url;
  const bootstrapFile = context.bootstrapFile;
  const credentials = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
  const adminCreds = { ...credentials.credentials["user-admin"] };

  const repoRoot = fs.realpathSync(context.repository);
  const chrome = null;

  const state = installNormalObserver({ context, caseName: caseArg, contract, execution, nonceSha256, chromeInfo: chrome });
  state.runner.script = path.join(repoRoot, "scripts/lib/ui-check.mjs");
  state.runner.scriptSha256 = sha(fs.readFileSync(state.runner.script));

  const collector = new AssertionCollector(caseArg, contract, state);


  live.bind(state,context,runScreenCheck,withNormalBrowserObservation,performLogin,HeldRouteController);
  let lastCaptureOriginalPath = null;

  await withPositiveLifecycle(state,context,live.sdkRunner,live.browserObserver,(observation,life)=>({
    id: `access-history-${caseArg}`,
    url: targetUrl,
    steps: async ({ page, capture: originalCapture, waitForFontsReady }) => {
      const capture = async (name) => {
        const p = await originalCapture(name);
        lastCaptureOriginalPath = p;
        return p;
      };
      const vp = page.viewportSize();
      state.environment.viewport = vp ? [vp.width, vp.height] : [1440, 900];
      state.environment.origin = "http://127.0.0.1:18741";
      if (!state.environment.fontsReadyAtMs) state.environment.fontsReadyAtMs = Date.now();

      if(live.canonical)await live.run({page,capture,waitForFontsReady,observation,life},adminCreds);else
      if (caseArg === "live-admin") {
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("#header-current-title")?.textContent === "활동 이력");
        await page.locator("#table-access-logs").waitFor({ timeout: 5000 });

        const rowCount = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("live-admin-rows-positive", true, rowCount > 0);

        const countLabel = await page.locator("#access-history-count-label").textContent();
        collector.expectEqual("live-admin-count-label", true, countLabel.includes("전체") && countLabel.includes("건 중"));

        let refCount = 0;
        page.on("request", (req) => {
          if (req.url().includes("api/access-logs:list")) refCount++;
        });
        await page.locator("#btn-refresh-logs").click();
        await page.waitForTimeout(400);
        collector.expectEqual("live-admin-refresh-single-request", 1, refCount);

        await page.getByRole("button", { name: "홈", exact: true }).click();
        await page.locator(".home-container").waitFor();
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#table-access-logs").waitFor();
        const reentryTableCount = await page.locator("#table-access-logs").count();
        collector.expectEqual("live-admin-home-reentry-ok", 1, reentryTableCount);

        await page.locator(".btn-logout").click();
        await page.locator("#login-id").waitFor();
        const logoutLoginCount = await page.locator("#login-id").count();
        const logoutTableCount = await page.locator("#table-access-logs").count();
        collector.expectEqual("live-admin-logout-ok", 1, (logoutLoginCount === 1 && logoutTableCount === 0) ? 1 : 0);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("live-admin");
      } else if (caseArg === "list-fixture") {
        state.environment.routes.push({ url: "**/api/access-logs:list", timeMs: Date.now() });
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);

        const mockLogs = createMockAccessLogs(201);
        await page.route("**/api/access-logs:list", async (r) => {
          await r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, data: mockLogs }),
          });
        });

        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#table-access-logs").waitFor();

        const xssCount = await page.locator("script").evaluateAll((es) => es.filter((e) => e.textContent.includes("xss-test")).length);
        collector.expectEqual("list-fixture-xss-blocked", 0, xssCount);

        const tableLabel = await page.locator("#table-access-logs").getAttribute("aria-label");
        collector.expectEqual("list-fixture-table-aria-label", "활동 이력 목록", tableLabel);

        const dBox = await page.locator("#filter-date-from").boundingBox();
        collector.expectNear("list-fixture-date-width-132", 132, dBox.width, 1);
        collector.expectNear("list-fixture-date-height-34", 34, dBox.height, 1);

        const firstRowBox = await page.locator("#table-access-logs-body tr").first().boundingBox();
        collector.expectNear("list-fixture-row-height-40", 40, firstRowBox.height, 1);

        const ths = await page.locator("#table-access-logs thead th").all();
        collector.expectNear("list-fixture-th-width-130", 130, (await ths[0].boundingBox()).width, 1);
        collector.expectNear("list-fixture-th-width-140", 140, (await ths[1].boundingBox()).width, 1);
        collector.expectNear("list-fixture-th-width-100", 100, (await ths[2].boundingBox()).width, 1);
        collector.expectNear("list-fixture-th-width-160", 160, (await ths[3].boundingBox()).width, 1);

        const badgeClassOf = async (rowId) => {
          return await page.locator(`#log-row-${rowId} .access-history-badge`).getAttribute("class");
        };
        collector.expectEqual("list-fixture-badge-approve-approved", true, (await badgeClassOf("log-record-1")).includes("badge-approved"));
        collector.expectEqual("list-fixture-badge-reapprove-approved", true, (await badgeClassOf("log-record-2")).includes("badge-approved"));
        collector.expectEqual("list-fixture-badge-hide-approved-danger", true, (await badgeClassOf("log-record-3")).includes("badge-danger"));
        collector.expectEqual("list-fixture-badge-publish-info", true, (await badgeClassOf("log-record-4")).includes("badge-info"));
        collector.expectEqual("list-fixture-badge-sign-in-neutral", true, (await badgeClassOf("log-record-5")).includes("badge-neutral"));
        collector.expectEqual("list-fixture-badge-route-view-neutral", true, (await badgeClassOf("log-record-6")).includes("badge-neutral"));
        collector.expectEqual("list-fixture-badge-reject-danger", true, (await badgeClassOf("log-record-7")).includes("badge-danger"));
        collector.expectEqual("list-fixture-badge-site-save-info", true, (await badgeClassOf("log-record-8")).includes("badge-info"));

        const rows200 = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("list-fixture-initial-rows-200", 200, rows200);

        await page.locator("#btn-load-more-logs").click();
        const rows201 = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("list-fixture-load-more-rows-201", 201, rows201);

        const titleAttr = await page.locator("#log-row-log-record-1 td").nth(4).getAttribute("title");
        collector.expectEqual("list-fixture-fulltext-title-retained", true, titleAttr.includes("상세 활동 내용"));

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("list-fixture-201");
      } else if (caseArg === "empty-fixture") {
        state.environment.routes.push({ url: "**/api/access-logs:list", timeMs: Date.now() });
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);
        await page.route("**/api/access-logs:list", async (r) => {
          await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) });
        });

        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#state-g2-empty").waitFor();

        collector.expectEqual("empty-fixture-g2-rendered", 1, await page.locator("#state-g2-empty").count());
        collector.expectEqual("empty-fixture-table-hidden", 0, await page.locator("#table-access-logs").count());

        const emptyMsg = await page.locator("#state-g2-empty-message, #state-g2-empty").textContent();
        collector.expectEqual("empty-fixture-korean-text", true, emptyMsg.includes("활동 이력이 없습니다") || emptyMsg.includes("이력이 없습니다"));

        await page.locator("#btn-empty-reset, #btn-filter-reset").first().click();
        await page.waitForTimeout(300);
        collector.expectEqual("empty-fixture-reset-retains-g2", 1, await page.locator("#state-g2-empty").count());

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("empty-fixture-g2");
      } else if (caseArg === "filters") {
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#table-access-logs").waitFor();

        let lastQuery = null;
        page.on("request", (req) => {
          if (req.url().includes("api/access-logs:list")) {
              lastQuery = parseBridgeQuery(req);
          }
        });

        await page.locator("#filter-keyword-input, #filter-keyword").first().fill("단일키워드검색어");
        await page.locator("#btn-refresh-logs").click();
        await page.waitForTimeout(400);

        collector.expectEqual("filters-keyword-query-exact", "단일키워드검색어", lastQuery?.keyword);

        await page.locator("#filter-date-from").fill("2026-09-20");
        await page.locator("#filter-date-to").fill("2026-09-10");
        try { await page.locator("#btn-refresh-logs").click({ timeout: 500 }); } catch {}

        const isLockDisabled = (await page.locator("#btn-refresh-logs").getAttribute("aria-disabled")) === "true" || await page.locator("#btn-refresh-logs").isDisabled();
        const alertCount = await page.locator(".alert-danger, [role='alert']").count();
        collector.expectEqual("filters-date-order-locked", true, isLockDisabled || alertCount > 0);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("filters-validation-lock");
      } else if (caseArg === "stale-response") {
        state.environment.routes.push({ url: "**/api/access-logs:list*", timeMs: Date.now() });
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);

        const heldController = new HeldRouteController(state);
        let listInvocation = 0;

        await page.route("**/api/access-logs:list*", async (r) => {
          listInvocation++;
          if (listInvocation === 1) {
            await heldController.handle(r, {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true, data: createMockAccessLogs(5) }),
            }).catch(() => {});
          } else {
            await r.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true, data: createMockAccessLogs(10) }),
            });
          }
        });

        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await heldController.waitForStart();

        await page.locator("#filter-keyword-input, #filter-keyword").first().fill("빠른조회");
        await page.locator("#btn-refresh-logs").click();
        await page.waitForTimeout(500);

        heldController.release();
        await heldController.waitForComplete();

        const finalRows = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("stale-response-second-wins", 10, finalRows);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("stale-response-prevented");
      } else if (caseArg === "role-guard") {
        const testRole = async (roleName, roleCreds) => {
          let autoCall = 0;
          const autoListener = (req) => {
            if (req.url().includes("api/access-logs:list") || req.url().includes("api/operations:list-users")) autoCall++;
          };
          page.on("request", autoListener);


          await performLogin(page, targetUrl, roleCreds, `SolVerify9!${roleName}Pass`, life.registerSecret);
          const navCount = await page.getByRole("button", { name: "활동 이력", exact: true }).count();
          collector.expectEqual(`role-${roleName}-menu-zero`, 0, navCount);

          await page.waitForTimeout(200);
          page.off("request", autoListener);
          collector.expectEqual(`role-${roleName}-auto-call-zero`, 0, autoCall);

          const cookies = await page.context().cookies();
          const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

          state.setPhase(`role-${roleName}-direct`);
          const listRes = await state.fetch(`${targetUrl}api/access-logs:list`, {
            method: "POST",
            headers: { Cookie: cookieHdr, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
            body: JSON.stringify([{}]),
          });
          collector.expectEqual(`role-${roleName}-logs-forbidden`, "AUTH_FORBIDDEN", listRes.errorCode);

          const usersRes = await state.fetch(`${targetUrl}api/operations:list-users`, {
            method: "POST",
            headers: { Cookie: cookieHdr, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
            body: JSON.stringify([]),
          });
          collector.expectEqual(`role-${roleName}-users-forbidden`, "AUTH_FORBIDDEN", usersRes.errorCode);

          state.setPhase("scenario");
          await page.locator(".btn-logout").click();
          await page.locator("#login-id").waitFor();
        };

        // 1. operator
        await testRole("operator", credentials.credentials["user-operator"]);

        // 2. admin으로 planner1 & reviewer1 생성
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);
        const rolePassword = "InitialPassword123!";
        await life.registerSecret(rolePassword);
        await page.evaluate(async password => {
          await window.appBridge.saveOperationUser({ loginId: "planner1", displayName: "플래너1", role: "planner", status: "active", password });
          await window.appBridge.saveOperationUser({ loginId: "reviewer1", displayName: "리뷰어1", role: "reviewer", status: "active", password });
        }, rolePassword);
        await page.locator(".btn-logout").click();
        await page.locator("#login-id").waitFor();

        // 3. planner
        await testRole("planner", { loginId: "planner1", password: "InitialPassword123!" });

        // 4. reviewer
        await testRole("reviewer", { loginId: "reviewer1", password: "InitialPassword123!" });

        // 5. admin 재로그인
        await performLogin(page, targetUrl, adminCreds, null, life.registerSecret);
        collector.expectEqual("role-admin-menu-present", 1, await page.getByRole("button", { name: "활동 이력", exact: true }).count());

        const adminDirect = await page.evaluate(async () => {
          return await window.appBridge.listAccessLogs({});
        });
        collector.expectEqual("role-admin-logs-ok", true, adminDirect.ok);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("role-guard-operator-planner");
      }
      await observation.drain();
      state.steps.completedAtMs = Date.now();
    },
  }), [adminCreds.password]);

  // 현재 actual page.screenshot 호출의 디렉터리에서 protected manifest 및 capture 복사
  if (lastCaptureOriginalPath) {
    const latestDir = path.dirname(lastCaptureOriginalPath);
    const origMPath = path.join(latestDir, "manifest.json");
    if (fs.existsSync(origMPath)) {
      const origMBytes = fs.readFileSync(origMPath);
      const copyMPath = path.join(context.runDir, "normal-protected-manifest.json");
      fs.writeFileSync(copyMPath, origMBytes);
      state.runner.manifest = {
        originalPath: origMPath,
        path: copyMPath,
        bytes: origMBytes.length,
        sha256: sha(origMBytes)
      };

      const mJson = JSON.parse(origMBytes.toString("utf8"));
      for (const cap of mJson.captures || []) {
        const origCapPath = path.join(latestDir, cap.filename || `${cap.name}.png`);
        const copyCapPath = path.join(context.runDir, `normal-capture-${cap.name}.png`);
        if (fs.existsSync(origCapPath)) {
          const capB = fs.readFileSync(origCapPath);
          fs.writeFileSync(copyCapPath, capB);
          state.captures.push({
            id: `normal-capture-${cap.name}`,
            path: copyCapPath,
            originalPath: origCapPath,
            bytes: capB.length,
            sha256: sha(capB)
          });
        }
      }
    }
  }

  state.runner.returned = true;
  await publishNormalEvidence(state,live.publication);
}
