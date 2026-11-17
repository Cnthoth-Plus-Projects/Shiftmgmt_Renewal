import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("restore completion feedback", () => {
  let saved: Map<string, string>;
  const summary = { completedAt: "2026-11-10T11:00:00.000Z", tableResults: [{ tableName: "employees", currentRowCount: 1, nextRowCount: 2 }] };
  beforeEach(() => {
    vi.resetModules();
    saved = new Map();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
      removeItem: (key: string) => { saved.delete(key); }
    } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("retains successful restore feedback across a page/module reload until explicitly cleared", async () => {
    const first = await import("./restore-feedback");
    first.rememberRestoreCompletion(summary);
    vi.resetModules();
    const reloaded = await import("./restore-feedback");
    expect(reloaded.getRestoreCompletion()).toEqual({ completedAt: summary.completedAt, tableCount: 1 });
    expect(reloaded.getRestoreCompletion()).not.toBeNull();
    reloaded.clearRestoreCompletion();
    vi.resetModules();
    expect((await import("./restore-feedback")).getRestoreCompletion()).toBeNull();
    expect(saved.size).toBe(0);
  });

  it("persists only completion time and table count, excluding other restore details", async () => {
    const feedback = await import("./restore-feedback");
    feedback.rememberRestoreCompletion({ ...summary, ...{ backupFilePath: "private-path", secret: "private-value" } });
    expect([...saved.values()]).toEqual([JSON.stringify({ completedAt: summary.completedAt, tableCount: 1 })]);
  });

  it.each(["not-json", "null", "[]", '{"completedAt":"bad","tableCount":43}', '{"completedAt":"2026-11-10T11:00:00Z","tableCount":-1}'])("rejects damaged or invalid persisted notice: %s", async raw => {
    saved.set("shiftmgmt.restore-completed", raw);
    expect((await import("./restore-feedback")).getRestoreCompletion()).toBeNull();
    expect(saved.size).toBe(0);
  });

  it("keeps feedback in memory when browser storage is unavailable and clears it safely", async () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("storage unavailable"); } });
    const feedback = await import("./restore-feedback");
    feedback.rememberRestoreCompletion(summary);
    expect(feedback.getRestoreCompletion()?.tableCount).toBe(1);
    feedback.clearRestoreCompletion();
    expect(feedback.getRestoreCompletion()).toBeNull();
  });
});
