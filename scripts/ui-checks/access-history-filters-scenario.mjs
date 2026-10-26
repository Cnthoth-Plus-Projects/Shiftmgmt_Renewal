// scripts/ui-checks/access-history-filters-scenario.mjs
import { CONTRACT_SHA256 } from "./access-history-shared.mjs";

export async function runFilterScenario({ page, result, setPhase, drain, tokenToRequestId, failure, startCollection, check = p => p }) {
  const endpoint = "/api/access-logs:list";
  const kw = page.locator("#filter-keyword-input");

  await check(page.waitForFunction(() => { const b = document.querySelector("#btn-refresh-logs"); return !document.querySelector(".access-history-loading-banner") && b && !b.disabled; }));
  await drain();

  await page.evaluate(() => {
    const one = id => document.getElementById(id);
    const many = s => [...document.querySelectorAll(s)];
    const snap = () => {
      const d = new Date();
      const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
      const item = id => {
        const e = one(id);
        if (!e) return null;
        const c = getComputedStyle(e);
        return {
          id,
          value: e.value ?? null,
          disabled: e.disabled ?? null,
          ariaDisabled: e.getAttribute("aria-disabled"),
          describedBy: e.getAttribute("aria-describedby"),
          outlineWidth: c.outlineWidth,
          outlineStyle: c.outlineStyle,
          focused: document.activeElement === e,
          caretStart: e.selectionStart ?? null,
          caretEnd: e.selectionEnd ?? null,
          pointerEvents: c.pointerEvents
        };
      };
      const e = one("filter-date-error-desc");
      const k = one("filter-keyword-input");
      return {
        atMs: Date.now(),
        perfMs: Math.round(performance.now()),
        localClock: {
          sampledAtMs: Date.now(),
          timezoneOffsetMinutes: d.getTimezoneOffset(),
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate()
        },
        rows: many("#table-access-logs-body tr").length,
        count: one("access-history-count-label")?.textContent,
        status: many(".access-history-loading-banner").map(el => ({ role: el.getAttribute("role"), text: el.textContent })),
        filters: Object.fromEntries(["filter-date-from", "filter-date-to", "filter-user-select", "filter-action-select", "filter-keyword-input"].map(id => [id, item(id)])),
        buttons: { refresh: item("btn-refresh-logs"), reset: item("btn-filter-reset") },
        error: { visible: !!e && getComputedStyle(e).display !== "none", text: e?.textContent, id: e?.id },
        active: document.activeElement?.id,
        caret: [k?.selectionStart, k?.selectionEnd],
        forms: many("form").length,
        localDefaults: { dateFrom: today.slice(0, 8) + "01", dateTo: today, loginId: "all", actionType: "all", keyword: "" }
      };
    };

    const bridge = window.appBridge;
    const original = Object.getOwnPropertyDescriptor(bridge, "listAccessLogs");
    if (!original || typeof original.value !== "function") throw Error("Exact bridge method descriptor unavailable");
    const s = { phase: "setup", events: [], calls: [], hold: null, snapshot: snap, original, tokenSeq: 0 };
    window.__u4FilterRecon = s;
    let active = null;
    const capture = ev => {
      if (!ev.target?.closest?.(".access-history-container")) return;
      const row = {
        id: "event-" + (s.events.length + 1),
        phase: s.phase,
        type: ev.type,
        target: ev.target.id,
        key: ev.key ?? null,
        trusted: ev.isTrusted,
        atMs: Date.now(),
        perfMs: Math.round(performance.now()),
        before: snap()
      };
      s.events.push(row);
      active = row;
    };
    const bubble = ev => {
      if (active && active.type === ev.type) {
        active.after = snap();
        active = null;
      }
    };
    const events = ["input", "change", "click", "keydown", "keyup"];
    for (const type of events) {
      document.addEventListener(type, capture, true);
      document.addEventListener(type, bubble, false);
    }

    function listAccessLogs(...args) {
      if (window.__u4InFlightToken !== null) {
        if (typeof window.__solFilterOverlapV1 === "function") {
          window.__solFilterOverlapV1("CANONICAL_CORRELATION_OVERLAP").catch(() => {});
        }
        throw new Error("CANONICAL_CORRELATION_OVERLAP");
      }
      const token = "token-" + (++s.tokenSeq);
      const row = {
        id: "call-" + (s.calls.length + 1),
        token,
        phase: s.phase,
        args: JSON.parse(JSON.stringify(args)),
        atMs: Date.now(),
        perfMs: Math.round(performance.now()),
        eventId: active?.id ?? null,
        requestId: null
      };
      s.calls.push(row);
      window.__u4ActiveToken = token;
      let promise;
      try { promise = Reflect.apply(original.value, this, args); }
      finally { if (window.__u4ActiveToken === token) window.__u4ActiveToken = null; }
      if (!s.armHold) return promise;
      s.armHold = false;
      const h = { startedAtMs: Date.now(), startedPerfMs: Math.round(performance.now()), callId: row.id, upstreamDone: false, released: false };
      s.hold = h;
      return new Promise((resolve, reject) => {
        let value, finished = false;
        const deliver = () => {
          if (!finished || !h.released) return;
          h.deliveredAtMs = Date.now();
          h.sameUpstreamReference = true;
          resolve(value);
        };
        h.release = () => {
          if (h.released) return;
          h.released = true;
          h.releaseAtMs = Date.now();
          clearTimeout(h.safety);
          deliver();
        };
        h.safety = setTimeout(() => {
          h.safetyReleased = true;
          h.release();
        }, 12000);
        promise.then(
          v => {
            value = v;
            finished = true;
            h.upstreamDone = true;
            h.upstreamAtMs = Date.now();
            h.upstreamOk = v?.ok === true;
            h.upstreamRows = Array.isArray(v?.data) ? v.data.length : null;
            deliver();
          },
          e => {
            h.error = String(e);
            clearTimeout(h.safety);
            reject(e);
          }
        );
      });
    }

    Object.defineProperty(listAccessLogs, "length", { value: original.value.length });
    Object.defineProperty(bridge, "listAccessLogs", { ...original, value: listAccessLogs });
    window.__u4CollectionActive = true;
    s.cleanup = () => {
      const errors = [];
      const attempt = f => { try { f(); } catch (e) { errors.push(String(e?.message || e)); } };
      attempt(() => s.hold?.release?.());
      attempt(() => { if (s.hold?.safety) clearTimeout(s.hold.safety); });
      for (const type of events) {
        attempt(() => document.removeEventListener(type, capture, true));
        attempt(() => document.removeEventListener(type, bubble, false));
      }
      attempt(() => Object.defineProperty(bridge, "listAccessLogs", original));
      attempt(() => { if (window.__u4FetchDescriptor) Object.defineProperty(window, "fetch", window.__u4FetchDescriptor); });
      window.__u4CollectionActive = false;
      return {
        descriptorRestored: Object.getOwnPropertyDescriptor(bridge, "listAccessLogs")?.value === original.value,
        fetchRestored: Object.getOwnPropertyDescriptor(window, "fetch")?.value === window.__u4NativeFetch,
        errors,
        closedAtMs: Date.now()
      };
    };
  });
  startCollection?.();

  const snap = () => page.evaluate(() => window.__u4FilterRecon.snapshot());
  const records = () => result.requests.filter(x => x.source === "page" && x.path === endpoint);
  const ready = async () => {
    await check(page.waitForFunction(() => { const b = document.querySelector("#btn-refresh-logs"); return !document.querySelector(".access-history-loading-banner") && b && !b.disabled; }));
    await drain();
  };
  const quiet = async () => {
    await page.waitForTimeout(320);
    await drain();
  };
  const begin = async name => {
    setPhase(name);
    await page.evaluate(p => { window.__u4FilterRecon.phase = p; }, name);
  };
  const state = () => page.evaluate(() => {
    const s = window.__u4FilterRecon;
    return {
      events: s.events,
      calls: s.calls,
      hold: s.hold ? Object.fromEntries(Object.entries(s.hold).filter(([k]) => !["release", "safety"].includes(k))) : null
    };
  });

  const changed = async (name, action) => {
    await begin(name);
    const before = records().length;
    const waiting = page.waitForResponse(r => new URL(r.url()).pathname === endpoint);
    waiting.catch(() => {});
    await check(action());
    const response = await check(waiting);
    const error = await check(response.finished());
    if (error) throw error;
    await ready();
    await quiet();
    const after = records().length;
    return {
      beforeCount: before,
      afterCount: after,
      requestIds: records().slice(before).map(x => x.id),
      snapshot: await snap()
    };
  };

  const setValue = async (id, value, name) => {
    const el = page.locator("#" + id);
    if (await el.inputValue() === value) return null;
    return changed(name, () => id.includes("select") ? el.selectOption(value) : el.fill(value));
  };

  const reset = async name => changed(name, () => page.locator("#btn-filter-reset").click());
  const mouse = async id => {
    const b = await page.locator("#" + id).boundingBox();
    if (!b) throw Error("Missing box:" + id);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  const tabTo = async id => {
    await mouse("filter-keyword-input");
    const steps = [];
    for (let n = 0; n < 16; n++) {
      await page.keyboard.press("Tab");
      const v = await snap();
      steps.push({ active: v.active, buttons: v.buttons });
      if (v.active === id) return steps;
    }
    throw Error("Native Tab did not reach " + id);
  };

  const obs = result.observations;
  let primaryError = null;
  try {
    obs.initial = await snap();
    await setValue("filter-date-from", "2000-01-01", "prepare-full-from");
    await setValue("filter-date-to", "2099-12-31", "prepare-full-to");
    const user = await page.locator("#filter-user-select option").evaluateAll(es => es.find(e => e.value !== "all")?.value);
    const action = await page.locator("#filter-action-select option").evaluateAll(es => es.find(e => e.value !== "all")?.value);
    if (!user || !action) throw Error("Actual user/action options unavailable");
    await setValue("filter-user-select", user, "prepare-full-user");
    await setValue("filter-action-select", action, "prepare-full-action");
    obs.fullQuery = await changed("full-five-fields", () => kw.fill("  전체필터검증  "));

    await reset("prepare-debounce-reset");
    await begin("debounce");
    const beforeDebounce = records().length;
    await mouse("filter-keyword-input");
    await page.keyboard.type("연속검색", { delay: 20 });
    await ready();
    await quiet();
    obs.debounce = {
      beforeCount: beforeDebounce,
      afterCount: records().length,
      requestIds: records().slice(beforeDebounce).map(x => x.id),
      snapshot: await snap()
    };

    await reset("prepare-immediate-reset");
    await begin("immediate");
    const old = await snap();
    await mouse("filter-keyword-input");
    await page.keyboard.type("즉시검색", { delay: 15 });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const caretBefore = await snap();
    await ready();
    await quiet();
    obs.immediate = { old, caretBefore, after: await snap() };

    const cancel = async (name, trigger) => {
      await reset("prepare-" + name);
      await begin(name);
      const before = records().length;
      await kw.fill("  " + name + "  ");
      const input = await snap();
      const triggerVal = await changed(name + "-trigger", trigger);
      return {
        beforeCount: before,
        afterCount: records().length,
        input,
        trigger: triggerVal,
        requestIds: records().slice(before).map(x => x.id)
      };
    };

    obs.refreshCancel = await cancel("refresh-cancel", () => page.locator("#btn-refresh-logs").click());
    obs.dateCancel = await cancel("date-cancel", () => page.locator("#filter-date-from").fill("2000-01-01"));
    obs.userCancel = await cancel("user-cancel", () => page.locator("#filter-user-select").selectOption(user));
    obs.actionCancel = await cancel("action-cancel", () => page.locator("#filter-action-select").selectOption(action));
    obs.resetCancel = await cancel("reset-cancel", () => page.locator("#btn-filter-reset").click());

    await setValue("filter-date-from", "2000-01-01", "prepare-invalid-from");
    await setValue("filter-date-to", "2000-01-10", "prepare-invalid-to");
    await begin("invalid");
    const invalidBefore = records().length;
    await page.locator("#filter-date-from").fill("2000-01-20");
    await quiet();
    obs.invalid = { beforeCount: invalidBefore, afterCount: records().length, snapshot: await snap() };

    obs.invalidAttempts = [];
    for (const mode of ["click", "Space", "Enter"]) {
      await begin("invalid-refresh-" + mode);
      const n = records().length;
      if (mode === "click") await mouse("btn-refresh-logs");
      else { await tabTo("btn-refresh-logs"); await page.keyboard.press(mode); }
      await quiet();
      obs.invalidAttempts.push({ mode, beforeCount: n, afterCount: records().length, snapshot: await snap() });
    }

    obs.invalidEnter = [];
    for (const id of ["filter-keyword-input", "filter-date-from", "filter-date-to"]) {
      await begin("invalid-input-enter-" + id);
      const n = records().length;
      if (await page.locator("#" + id).count() > 0) {
        await mouse(id);
        await page.keyboard.press("Enter");
        await page.keyboard.press("Escape");
        await quiet();
      }
      obs.invalidEnter.push({ id, beforeCount: n, afterCount: records().length, snapshot: await snap() });
    }

    await begin("invalid-native-tab");
    obs.tabReset = { steps: await tabTo("btn-filter-reset"), snapshot: await snap() };
    obs.tabRefresh = { steps: await tabTo("btn-refresh-logs"), snapshot: await snap() };

    obs.invalidResetAttempts = [];
    for (const mode of ["click", "Space", "Enter"]) {
      await changed("reset-attempt-recover-" + mode, () => page.locator("#filter-date-from").fill("1999-01-01"));
      await reset("reset-attempt-defaults-" + mode);
      await setValue("filter-date-from", "2000-01-01", "reset-attempt-from-" + mode);
      await setValue("filter-date-to", "2000-01-10", "reset-attempt-to-" + mode);
      await begin("reset-attempt-invalid-" + mode);
      await page.locator("#filter-date-from").fill("2000-01-20");
      await quiet();
      await begin("invalid-reset-" + mode);
      const n = records().length;
      const beforeSnap = await snap();
      if (mode === "click") await mouse("btn-filter-reset");
      else { await tabTo("btn-filter-reset"); await page.keyboard.press(mode); }
      await quiet();
      obs.invalidResetAttempts.push({ mode, beforeCount: n, afterCount: records().length, before: beforeSnap, snapshot: await snap() });
    }

    await setValue("filter-date-from", "1999-01-01", "recover-valid-from");
    await reset("prepare-empty-from");
    obs.emptyFrom = await changed("empty-from", () => page.locator("#filter-date-from").fill(""));

    await reset("prepare-empty-to");
    obs.emptyTo = await changed("empty-to", () => page.locator("#filter-date-to").fill(""));

    await reset("prepare-native-normalization");
    obs.normalized = await changed("native-normalization", async () => {
      obs.normalizationInput = await page.evaluate(() => {
        const e = document.getElementById("filter-date-from");
        const raw = "2026-02-30";
        const before = e.value;
        e.value = raw;
        const normalized = e.value;
        e.dispatchEvent(new Event("input", { bubbles: true }));
        return { raw, before, normalized, method: "HTMLInputElement.value setter then explicit synthetic input", trusted: false, atMs: Date.now() };
      });
    });

    await reset("prepare-held");
    await begin("held-real-bridge-result");
    const holdBefore = records().length;
    await page.evaluate(() => { window.__u4FilterRecon.armHold = true; });
    await page.locator("#btn-refresh-logs").click();
    await check(page.waitForFunction(() => window.__u4FilterRecon.hold?.upstreamDone));
    const busy = await snap();

    await mouse("btn-refresh-logs");
    await mouse("btn-filter-reset");
    await quiet();
    const during = { snapshot: await snap(), requestCount: records().length };

    await page.evaluate(() => { window.__u4FilterRecon.hold.release(); });
    await ready();
    await quiet();
    obs.held = {
      beforeCount: holdBefore,
      afterCount: records().length,
      busy,
      during,
      after: await snap(),
      requestIds: records().slice(holdBefore).map(x => x.id),
      transport: "actual upstream Promise value withheld; no API route or response substitution"
    };

    await setValue("filter-date-from", "2000-01-01", "past-from");
    obs.past = await changed("past-to", () => page.locator("#filter-date-to").fill("2000-12-31"));

    await page.evaluate(() => document.fonts.ready);
    obs.final = await snap();
    obs.fonts = await page.evaluate(() => ({ status: document.fonts.status, atMs: Date.now() }));
  } catch (err) {
    primaryError = err;
    if (typeof failure === "function") {
      failure(err, "scenario", "scenario");
    }
    throw err;
  } finally {
    try {
      const rawLedger = await state();
      if (rawLedger && Array.isArray(rawLedger.calls)) {
        for (const c of rawLedger.calls) {
          if (c.token && tokenToRequestId && tokenToRequestId.has(c.token)) {
            c.requestId = tokenToRequestId.get(c.token);
          }
          delete c.token;
        }
      }
      result.ledger = rawLedger;
    } catch (err) {
      if (typeof failure === "function") {
        failure(err, "ledger", "ledger");
      }
    }

    try {
      const closed = await page.evaluate(() => window.__u4FilterRecon?.cleanup?.());
      obs.cleanup = { descriptorRestored: closed?.descriptorRestored, closedAtMs: closed?.closedAtMs };
      for (const message of closed?.errors || []) failure(new Error(message), "cleanup", "cleanup");
      if (closed?.fetchRestored !== true) failure(new Error("Fetch descriptor restoration failed"), "cleanup", "cleanup");
    } catch (err) {
      if (typeof failure === "function") {
        failure(err, "cleanup", "cleanup");
      }
    }
  }
}
