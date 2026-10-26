const groups = new WeakMap();
const error = code => Object.assign(new Error(code), { code });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  promise.catch(() => {});
  return { promise, resolve, reject };
};

export class NormalHeldRouteController {
  constructor(state = null, timeoutMs = 15000) {
    this.state = state;
    this.timeoutMs = timeoutMs;
    this.started = false;
    this.completed = false;
    this.releaseOptions = null;
    this._start = deferred();
    this._release = deferred();
    this._complete = deferred();
    this._terminal = deferred();
    this._timers = new Set();
    this._active = new Set();
    this._handles = new WeakMap();
    this._operations = [];
    this._reportedOperations = new Set();
    this._reportedDisposals = [];
    this._executionReported = false;
    this._released = false;
    this._failed = false;
    this._reason = undefined;
    this._cancelled = false;
    this._disposed = false;
    this._disposedReason = error("G3_HELD_DISPOSED");
    this._disposePromise = null;
    if (state && typeof state === "object") {
      let group = groups.get(state);
      if (!group) { group = { controllers: new Set(), closed: false, cleanup: null }; groups.set(state, group); }
      if (group.closed) throw this._disposedReason;
      group.controllers.add(this);
    }
  }

  _track(action, operation) {
    let promise;
    try { promise = Promise.resolve(operation()); }
    catch (reason) { promise = Promise.reject(reason); }
    promise.catch(() => {});
    const record = { action, promise, settled: false, rejected: false, reason: undefined };
    this._operations.push(record);
    promise.then(() => { record.settled = true; }, reason => { record.settled = true; record.rejected = true; record.reason = reason; });
    return promise;
  }

  _fail(reason) {
    if (!this._failed) {
      this._failed = true;
      this._reason = reason;
    }
    this.dispose();
  }

  handle(route, defaultOptions = null) {
    if (this._handles.has(route)) return this._handles.get(route);
    const job = { route, action: null };
    const unavailable = this._disposed || this.completed || this._failed;
    if (!unavailable) {
      this._active.add(job);
      this.started = true;
      this._start.resolve();
    }
    const pending = (async () => {
      try {
        if (unavailable) {
          job.action = "abort";
          let timer;
          try {
            await Promise.race([this._track("abort", () => route.abort()), new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(error("G3_HELD_DISPOSE_TIMEOUT")), Number.isFinite(this.timeoutMs) ? Math.max(0, this.timeoutMs) : 15000);
            })]);
          } catch (reason) { this._fail(reason); } finally { clearTimeout(timer); }
          throw this._failed ? this._reason : this._disposedReason;
        }
        await this._release.promise;
        if (this._disposed || this._failed) throw this._failed ? this._reason : this._disposedReason;
        const options = this.releaseOptions || defaultOptions || { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) };
        job.action = "fulfill";
        await Promise.race([this._track("fulfill", () => route.fulfill(options)), this._terminal.promise]);
        if (this._disposed || this._failed) throw this._failed ? this._reason : this._disposedReason;
      } catch (reason) {
        this._fail(reason);
        throw this._failed ? this._reason : reason;
      } finally {
        this._active.delete(job);
        if (!unavailable && !this._disposed && !this._failed && this._released && this._active.size === 0) {
          this.completed = true;
          this._complete.resolve();
        }
      }
    })();
    pending.catch(() => {});
    this._handles.set(route, pending);
    return pending;
  }

  isStarted() { return this.started; }
  isCompleted() { return this.completed; }

  _wait(target, code, timeoutMs) {
    if (this._failed) return Promise.reject(this._reason);
    let timer;
    const limit = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 15000;
    const timed = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        this._fail(error(code));
        reject(this._reason);
      }, limit);
      this._timers.add(timer);
    });
    return Promise.race([target.promise, timed]).finally(() => {
      clearTimeout(timer);
      this._timers.delete(timer);
    });
  }

  async waitForStart(timeoutMs = this.timeoutMs) { return this._wait(this._start, "G3_HELD_START_TIMEOUT", timeoutMs); }
  async waitForComplete(timeoutMs = this.timeoutMs) { return this._wait(this._complete, "G3_HELD_COMPLETE_TIMEOUT", timeoutMs); }

  release(fulfillOptions = null) {
    if (this._released || this._disposed || this._failed || this.completed) return;
    this._released = true;
    this.releaseOptions = fulfillOptions;
    this._release.resolve();
  }

  async _drainOperations() {
    for (;;) {
      const count = this._operations.length;
      await Promise.allSettled(this._operations.map(op => op.promise));
      if (count === this._operations.length) return;
    }
  }

  _boundedDrain() {
    let timer;
    const limit = Number.isFinite(this.timeoutMs) ? Math.max(0, this.timeoutMs) : 15000;
    return Promise.race([this._drainOperations(), new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(error("G3_HELD_DISPOSE_TIMEOUT")), limit);
    })]).finally(() => { clearTimeout(timer); });
  }

  dispose() {
    if (this._disposePromise) return this._disposePromise;
    const disposed = deferred();
    this._disposePromise = disposed.promise;
    const jobs = [...this._active];
    this._disposed = true;
    if (!this.completed && !this._failed) {
      this._failed = true;
      this._cancelled = true;
      this._reason = this._disposedReason;
    }
    const reason = this._failed ? this._reason : this._disposedReason;
    this._start.reject(reason);
    this._release.reject(reason);
    this._complete.reject(reason);
    this._terminal.reject(reason);
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    for (const job of jobs) {
      if (job.action !== null) continue;
      job.action = "abort";
      this._track("abort", () => job.route.abort());
    }
    this._boundedDrain().then(() => {
      const failed = this._operations.find(op => op.rejected && op.action === "abort");
      if (failed) throw failed.reason;
    }).then(disposed.resolve, disposed.reject);
    return this._disposePromise;
  }
}

export async function disposeHeldRoutes(state) {
  const group = groups.get(state);
  if (!group) return [];
  group.closed = true;
  if (!group.cleanup) {
    const batch = { promise: null, delivered: false };
    group.cleanup = batch;
    batch.promise = (async () => {
      const results = await Promise.all([...group.controllers].map(async controller => {
        const failures = [], unsettled = controller._active.size > 0 && !controller.completed && !controller._failed;
        const disposalReasons = [];
        try { await controller.dispose(); } catch (reason) { disposalReasons.push(reason); }
        if (controller._operations.some(op => !op.settled)) {
          try { await controller._boundedDrain(); } catch (reason) { disposalReasons.push(reason); }
        }
        if (controller._failed && !controller._cancelled && !controller._executionReported) {
          controller._executionReported = true;
          failures.push({ reason: controller._reason, kind: "execution" });
        }
        for (const op of controller._operations) {
          if (op.action !== "abort" || !op.rejected || controller._reportedOperations.has(op)) continue;
          controller._reportedOperations.add(op);
          failures.push({ reason: op.reason, kind: "cleanup" });
        }
        for (const disposeReason of disposalReasons) {
          if (controller._operations.some(op => op.action === "abort" && op.rejected && Object.is(op.reason, disposeReason)) || controller._reportedDisposals.some(reason => Object.is(reason, disposeReason))) continue;
          controller._reportedDisposals.push(disposeReason);
          failures.push({ reason: disposeReason, kind: "cleanup" });
        }
        if (unsettled) failures.push({ reason: error("G3_HELD_UNSETTLED"), kind: "cleanup" });
        return failures;
      }));
      return results.flat();
    })().finally(() => { if (group.cleanup === batch) group.cleanup = null; });
  }
  const batch = group.cleanup, failures = await batch.promise;
  if (batch.delivered) return [];
  batch.delivered = true;
  return failures;
}
