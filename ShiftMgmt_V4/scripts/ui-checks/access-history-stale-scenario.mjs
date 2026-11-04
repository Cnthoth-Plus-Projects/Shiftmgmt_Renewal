import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import util from "node:util";

function sha(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function need(v, c) {
  if (!v) throw new Error(c);
}

const stamp = () => ({
  atMs: Date.now(),
  hrNs: process.hrtime.bigint().toString()
});

export async function runStaleScenario(options) {
  const {
    page,
    context,
    result,
    runDir,
    adminCreds,
    targetUrl,
    setPhase,
    drain,
    captureScreenshot,
    callbackProbe,
    requestMap,
    publicRequests,
    calls,
    callMeta,
    generations,
    holds,
    scenarios,
    performLogin,
    cleanupLog
  } = options;

  const LIST = "/api/access-logs:list";
  const plans = [];

  const wait = async (fn, label, maxMs = 6000) => {
    const end = Date.now() + maxMs;
    while (!fn()) {
      if (Date.now() > end) throw new Error("STALE_WAIT_TIMEOUT:" + label);
      await new Promise(r => setTimeout(r, 4));
    }
  };

  const getSnapshot = async () => {
    const nodeStarted = stamp();
    const data = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#table-access-logs-body tr")].map(e => e.id);
      const alerts = [...document.querySelectorAll(".access-history-alert-banner")].map(e => e.textContent);
      const screenCount = document.querySelectorAll("#access-history-screen").length;
      const loginCount = document.querySelectorAll("#login-id").length;
      const refreshBtn = document.querySelector("#btn-refresh-logs");
      const resetBtn = document.querySelector("#btn-filter-reset");
      const loadingCount = document.querySelectorAll(".access-history-loading-banner").length;
      const callbackCount = window.__u6Audit?.callbacks?.length ?? 0;
      const activeInst = window.__u6Audit?.instances?.at(-1);

      let query = null;
      if (document.querySelector("#access-history-screen")) {
        query = {
          dateFrom: document.querySelector("#filter-date-from")?.value ?? "",
          dateTo: document.querySelector("#filter-date-to")?.value ?? "",
          loginId: document.querySelector("#filter-user-select")?.value ?? "",
          actionType: document.querySelector("#filter-action-select")?.value ?? "",
          keyword: document.querySelector("#filter-keyword-input")?.value ?? ""
        };
      }

      return {
        atMs: Date.now(),
        perfMs: performance.now(),
        timeOriginMs: performance.timeOrigin,
        rowIds: rows,
        alerts,
        screenCount,
        loginCount,
        refreshDisabled: refreshBtn ? refreshBtn.disabled : null,
        resetDisabled: resetBtn ? resetBtn.disabled : null,
        loadingCount,
        callbackCount,
        query,
        instanceId: activeInst?.id ?? null,
        generation: activeInst?.loadGeneration ?? null,
        destroyed: activeInst?.destroyed ?? null,
        debouncePending: activeInst?.debounceTimer !== null,
        usersLoaded: activeInst?.usersLoaded ?? null
      };
    });
    const nodeRead = stamp();

    return {
      clock: {
        nodeStarted,
        nodeRead,
        atMs: data.atMs,
        perfMs: data.perfMs,
        timeOriginMs: data.timeOriginMs
      },
      rowIds: data.rowIds,
      alerts: data.alerts,
      screenCount: data.screenCount,
      loginCount: data.loginCount,
      refreshDisabled: data.refreshDisabled,
      resetDisabled: data.resetDisabled,
      loadingCount: data.loadingCount,
      callbackCount: data.callbackCount,
      query: data.query,
      instanceId: data.instanceId,
      generation: data.generation,
      destroyed: data.destroyed,
      debouncePending: data.debouncePending,
      usersLoaded: data.usersLoaded
    };
  };

  const fixture = tag =>
    Array.from({ length: 2 }, (_, i) => ({
      id: `${tag}-${i}`,
      occurredAt: "2026-10-20T09:00:00.000Z",
      loginId: "u6-fixture",
      userName: "검증 사용자",
      actionType: "auth-sign-in",
      route: "활동 이력",
      details: `${tag} 응답 ${i}`
    }));

  const responseFor = (outcome, tag) => {
    if (outcome === "success") {
      return { ok: true, data: fixture(tag) };
    }
    return {
      ok: false,
      errorCode: outcome === "auth" ? "AUTH_SESSION_REQUIRED" : "U6_STALE_FAILURE",
      message: outcome === "auth" ? "로그인이 필요합니다." : "이전 요청 오류"
    };
  };

  const createHold = (label, outcome = "success") => {
    let resolver;
    const gate = new Promise(r => (resolver = r));
    const hRecord = {
      label,
      outcome,
      startedCount: 0,
      releasedCount: 0,
      completedCount: 0,
      start: null,
      release: null,
      complete: null,
      timeoutMs: 6000,
      timedOut: false,
      requestId: null,
      gate,
      doRelease: () => {
        if (!hRecord.releasedCount) {
          hRecord.releasedCount++;
          hRecord.release = stamp();
          resolver();
        }
      }
    };
    return hRecord;
  };

  const enqueue = (tag, outcome = "success", held = null) => {
    const plan = { tag, outcome, held, requestId: null, started: null, completed: null, body: null };
    plans.push(plan);
    return plan;
  };

  const onRoute = async r => {
    const req = r.request();
    await wait(() => requestMap.has(req), "Request identity binding");
    const rawReq = requestMap.get(req);
    const plan = plans.shift();
    if (!plan) {
      await r.continue();
      return;
    }
    need(req.method() === "POST", "STALE_ROUTE_METHOD");
    plan.requestId = rawReq.id;
    plan.started = stamp();

    if (plan.held) {
      const h = plan.held;
      h.requestId = rawReq.id;
      h.startedCount++;
      h.start = stamp();
      holds.push(h);

      await Promise.race([
        h.gate,
        new Promise((_, reject) => {
          const timer = setTimeout(() => {
            h.timedOut = true;
            reject(new Error("U6_HELD_TIMEOUT:" + h.label));
          }, 6000);
          h.gate.finally(() => clearTimeout(timer));
        })
      ]);
    }

    plan.body = responseFor(plan.outcome, plan.tag);
    rawReq.status = 200;
    rawReq.ok = plan.body.ok === true;
    rawReq.errorCode = plan.body.errorCode ?? null;

    const bodyBytes = Buffer.from(JSON.stringify(plan.body), "utf8");
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: bodyBytes
    });

    plan.completed = stamp();
    if (plan.held) {
      plan.held.completedCount++;
      plan.held.complete = plan.completed;
    }
  };

  const ready = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector("#table-access-logs") &&
        !document.querySelector(".access-history-loading-banner") &&
        !document.querySelector("#btn-refresh-logs")?.disabled
    );
    await drain();
  };

  const refresh = () => page.locator("#btn-refresh-logs").click();
  const enterScreen = async () => {
    await page.getByRole("button", { name: "활동 이력", exact: true }).click();
    await ready();
  };

  const syncGenerationCalls=g=>{
    const list=calls.find(c=>c.requestId===g.listRequestId);need(list&&callMeta.has(list.token),"GENERATION_CLASS_SAMPLE_MISSING");
    const users=calls.filter(c=>c.method==="listOperationUsers"&&c.instanceId===list.instanceId&&c.generation===list.generation&&c.phase===list.phase);need(users.length<=1,"GENERATION_USERS_AMBIGUOUS");
    g.instanceId=list.instanceId;g.generation=list.generation;g.phase=list.phase;g.usersLoadedBefore=callMeta.get(list.token).usersLoadedBefore;g.fetchUsers=users.length===1;g.usersRequestId=users[0]?.requestId??null;g.callIds=[list.id,...users.map(c=>c.id)];
  };

  const settledHold = async h => {
    await wait(() => h.completedCount === 1, "route complete " + h.label);
    await wait(() => calls.some(c => c.requestId === h.requestId && c.nodeSettled !== null), "bridge settle " + h.label);
    await page.evaluate(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await drain();
    for (const g of generations) syncGenerationCalls(g);
  };

  const getListCount = () => publicRequests.filter(q => q.path === LIST).length;

  let nextGenId = 1;
  const registerGeneration=(instId,loadGen,phaseName,listReqId)=>{
    const g={id:nextGenId++,instanceId:instId,generation:loadGen,phase:phaseName,fetchUsers:false,usersLoadedBefore:null,listRequestId:listReqId,usersRequestId:null,callIds:[],settledBeforeSnapshot:stamp()};syncGenerationCalls(g);need(g.phase===phaseName,"GENERATION_PHASE");generations.push(g);return g;
  };

  await page.route("**/api/access-logs:list", onRoute);

  try {
    // 1. Three outcomes before 250ms debounce window
    for (const outcome of ["success", "error", "auth"]) {
      const name = "before250-" + outcome;
      await setPhase(name);
      const oldHold = createHold(name, outcome);
      const oldPlan = enqueue("old-" + name, outcome, oldHold);

      let initialUsersLoaded = true;
      if (outcome === "success") {
        initialUsersLoaded = await page.evaluate(() => {
          const inst = window.__u6Audit?.instances?.at(-1);
          return Boolean(inst?.usersLoaded);
        }).catch(() => false);
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      } else {
        await refresh();
      }
      await wait(() => oldHold.startedCount === 1, "old started");
      const currentInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const currentGen = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const oldGen = registerGeneration(currentInstId, currentGen, name, oldPlan.requestId, null, outcome === "success" ? initialUsersLoaded : null);

      const newPlan = enqueue("new-" + name, "success", null);
      const beforeSnap = await getSnapshot();
      const inputStarted = stamp();
      await page.locator("#filter-keyword-input").fill(name);
      oldHold.doRelease();
      await settledHold(oldHold);
      oldGen.settledBeforeSnapshot = stamp();
      const afterSnap = await getSnapshot();

      await ready();
      const newInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const newGenIndex = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const newGen = registerGeneration(newInstId, newGenIndex, name, newPlan.requestId, null);
      newGen.settledBeforeSnapshot = stamp();
      const finalSnap = await getSnapshot();

      scenarios.push({
        name,
        oldGenerationId: oldGen.id,
        newGenerationId: newGen.id,
        inputStarted,
        before: beforeSnap,
        after: afterSnap,
        final: finalSnap,
        listCountBefore: 0,
        listCountAfter: 0,
        countWindowEnd: finalSnap.clock.nodeRead,
        navigationTarget: null,
        navigationLabel: null
      });
    }

    // 2. Three outcomes after New success
    for (const outcome of ["success", "error", "auth"]) {
      const name = "afterNew-" + outcome;
      await setPhase(name);
      const oldHold = createHold(name, outcome);
      const oldPlan = enqueue("old-" + name, outcome, oldHold);

      await refresh();
      await wait(() => oldHold.startedCount === 1, "old started");
      const currentInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const currentGen = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const oldGen = registerGeneration(currentInstId, currentGen, name, oldPlan.requestId, null);

      const newPlan = enqueue("new-" + name, "success", null);
      await page.locator("#filter-keyword-input").fill(name);
      await ready();
      const newInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const newGenIndex = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const newGen = registerGeneration(newInstId, newGenIndex, name, newPlan.requestId, null);
      newGen.settledBeforeSnapshot = stamp();
      const beforeSnap = await getSnapshot();

      oldHold.doRelease();
      await settledHold(oldHold);
      oldGen.settledBeforeSnapshot = stamp();
      const afterSnap = await getSnapshot();

      if (outcome === "success" && captureScreenshot) {
        await captureScreenshot("stale-response-prevented");
      }

      scenarios.push({
        name,
        oldGenerationId: oldGen.id,
        newGenerationId: newGen.id,
        inputStarted: null,
        before: beforeSnap,
        after: afterSnap,
        final: null,
        listCountBefore: 0,
        listCountAfter: 0,
        countWindowEnd: afterSnap.clock.nodeRead,
        navigationTarget: null,
        navigationLabel: null
      });
    }

    // 3. old-finally-new-held
    {
      const name = "old-finally-new-held";
      await setPhase(name);
      const oldHold = createHold("old-finally", "success");
      const freshHold = createHold("new-held", "success");
      const oldPlan = enqueue("old-finally", "success", oldHold);

      await refresh();
      await wait(() => oldHold.startedCount === 1, "old finally started");
      const currentInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const currentGen = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const oldGen = registerGeneration(currentInstId, currentGen, name, oldPlan.requestId, null);

      const freshPlan = enqueue("new-held", "success", freshHold);
      await page.locator("#filter-keyword-input").fill("new-held");
      await wait(() => freshHold.startedCount === 1, "new held started");

      oldHold.doRelease();
      await settledHold(oldHold);
      oldGen.settledBeforeSnapshot = stamp();
      const afterSnap = await getSnapshot();

      freshHold.doRelease();
      await settledHold(freshHold);
      await ready();
      const freshInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const freshGenIndex = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const freshGen = registerGeneration(freshInstId, freshGenIndex, name, freshPlan.requestId, null);
      freshGen.settledBeforeSnapshot = stamp();
      const finalSnap = await getSnapshot();

      scenarios.push({
        name,
        oldGenerationId: oldGen.id,
        newGenerationId: freshGen.id,
        inputStarted: null,
        before: null,
        after: afterSnap,
        final: finalSnap,
        listCountBefore: 0,
        listCountAfter: 0,
        countWindowEnd: finalSnap.clock.nodeRead,
        navigationTarget: null,
        navigationLabel: null
      });
    }

    // 4. manual-refresh
    {
      const name = "manual-refresh";
      await setPhase(name);
      await page.locator("#filter-keyword-input").fill("  manual-latest  ");
      const beforeSnap = await getSnapshot();
      const countBefore = getListCount();
      const inputStarted = beforeSnap.clock.nodeStarted;

      const nextPlan = enqueue("manual-latest", "success", null);
      await refresh();
      await ready();
      await page.waitForTimeout(300);

      const currentInstId = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.id)) || 1;
      const currentGen = (await page.evaluate(() => window.__u6Audit.instances.at(-1)?.loadGeneration)) || 0;
      const manualGen = registerGeneration(currentInstId, currentGen, name, nextPlan.requestId, null);
      manualGen.settledBeforeSnapshot = stamp();

      const afterSnap = await getSnapshot();
      const countAfter = getListCount();
      const countWindowEnd = afterSnap.clock.nodeRead;

      scenarios.push({
        name,
        oldGenerationId: null,
        newGenerationId: manualGen.id,
        inputStarted,
        before: beforeSnap,
        after: afterSnap,
        final: null,
        listCountBefore: countBefore,
        listCountAfter: countAfter,
        countWindowEnd,
        navigationTarget: null,
        navigationLabel: null
      });
    }

    // 5. destroy-* (9 scenarios: 3 targets x 3 outcomes)
    for (const target of ["home", "placeholder", "logout"]) {
      for (const outcome of ["success", "error", "auth"]) {
        const name = "destroy-" + target + "-" + outcome;
        await setPhase(name);
        const dHold = createHold(name, outcome);
        const dPlan = enqueue(name, outcome, dHold);

        if (target === "home" && outcome === "success") {
          await refresh();
        } else {
          await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        }
        await wait(() => dHold.startedCount === 1, "destroy held started");
        const currentInstId = (await page.evaluate(() => window.__u6Audit?.instances?.at(-1)?.id)) || 1;
        const currentGen = (await page.evaluate(() => window.__u6Audit?.instances?.at(-1)?.loadGeneration)) || 0;
        const oldGen = registerGeneration(currentInstId, currentGen, name, dPlan.requestId, null);

        const countBefore = getListCount();
        const beforeSnap = await getSnapshot();

        let navLabel = "홈";
        if (target === "home") {
          navLabel = "홈";
          await page.getByRole("button", { name: "홈", exact: true }).click();
        } else if (target === "placeholder") {
          navLabel = "사용자 관리";
          await page.getByRole("button", { name: "사용자 관리", exact: true }).click();
        } else {
          navLabel = "로그아웃";
          await page.getByRole("button", { name: "로그아웃", exact: true }).click();
        }

        dHold.doRelease();
        await settledHold(dHold);
        oldGen.settledBeforeSnapshot = stamp();
        await page.waitForTimeout(300);

        const afterSnap = await getSnapshot();
        const countAfter = getListCount();
        const countWindowEnd = afterSnap.clock.nodeRead;

        scenarios.push({
          name,
          oldGenerationId: oldGen.id,
          newGenerationId: null,
          inputStarted: null,
          before: beforeSnap,
          after: afterSnap,
          final: null,
          listCountBefore: countBefore,
          listCountAfter: countAfter,
          countWindowEnd,
          navigationTarget: target,
          navigationLabel: navLabel
        });

        if (target === "logout") {
          await page.locator("#login-id").fill(adminCreds.loginId);
          await page.locator("#login-password").fill(adminCreds.password);
          await page.locator(".login-form button[type=submit]").click();
          await page.locator(".btn-logout").waitFor({timeout:15000});
        }
      }
    }

    // 6. current-generation-auth
    {
      const name = "current-generation-auth";
      await setPhase(name);
      const priorSnap = await getSnapshot();

      const authPlan = enqueue("current-auth", "auth", null);
      await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      await page.locator("#login-id").waitFor({ timeout: 15000 });
      await wait(() => calls.some(c => c.requestId === authPlan.requestId && c.nodeSettled !== null), "auth settled");
      await page.evaluate(async () => {
        await Promise.resolve();
      });
      await drain();

      const currentInstId = (await page.evaluate(() => window.__u6Audit?.instances?.at(-1)?.id)) || 1;
      const currentGen = (await page.evaluate(() => window.__u6Audit?.instances?.at(-1)?.loadGeneration)) || 0;
      const authGen = registerGeneration(currentInstId, currentGen, name, authPlan.requestId, null);
      authGen.settledBeforeSnapshot = stamp();

      const afterSnap = await getSnapshot();

      scenarios.push({
        name,
        oldGenerationId: null,
        newGenerationId: authGen.id,
        inputStarted: null,
        before: priorSnap,
        after: afterSnap,
        final: null,
        listCountBefore: 0,
        listCountAfter: 0,
        countWindowEnd: afterSnap.clock.nodeRead,
        navigationTarget: null,
        navigationLabel: null
      });
    }
  } finally {
    for (const h of holds) {
      try {
        h.doRelease();
        await settledHold(h);
      } catch (e) {
        cleanupLog.push("hold_cleanup_error:" + e.message);
      }
    }
    result.beforeUnroute = stamp();
    await page.unroute("**/api/access-logs:list", onRoute);
    result.afterUnroute = stamp();

    try {
      if (callbackProbe?.drain) await callbackProbe.drain();
    } catch (e) {
      cleanupLog.push("callback_probe_drain_error:" + e.message);
    }
    for (const g of generations) syncGenerationCalls(g);
  }
}
