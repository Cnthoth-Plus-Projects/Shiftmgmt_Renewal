import { describe, expect, it, vi } from "vitest";
import type { DialogRequest, DialogResult } from "./api-types";
import { WindowsDialogBridge } from "./dialog-bridge";

describe("WindowsDialogBridge", () => {
  it("enforces FIFO execution order and only executes one request at a time (N9)", async () => {
    const executionOrder: string[] = [];
    let activeCount = 0;
    let maxConcurrent = 0;

    const mockRunner = vi.fn(async (req: DialogRequest): Promise<DialogResult> => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      executionOrder.push(`start:${req.title}`);

      await new Promise((resolve) => setTimeout(resolve, 30));

      activeCount--;
      executionOrder.push(`end:${req.title}`);
      return { ok: true, cancelled: false, path: `C:/${req.title}` };
    });

    const bridge = new WindowsDialogBridge(mockRunner);

    const [resA, resB, resC] = await Promise.all([
      bridge.showDialog({ operation: "openFile", title: "A" }),
      bridge.showDialog({ operation: "openFile", title: "B" }),
      bridge.showDialog({ operation: "openFile", title: "C" }),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(executionOrder).toEqual([
      "start:A",
      "end:A",
      "start:B",
      "end:B",
      "start:C",
      "end:C",
    ]);
    expect(resA.path).toBe("C:/A");
    expect(resB.path).toBe("C:/B");
    expect(resC.path).toBe("C:/C");
  });

  it("handles abort of queued requests without executing them (N9)", async () => {
    const executed: string[] = [];

    const mockRunner = vi.fn(async (req: DialogRequest, signal?: AbortSignal): Promise<DialogResult> => {
      executed.push(req.title!);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 50);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Operation aborted"));
        });
      });
      return { ok: true, cancelled: false };
    });

    const bridge = new WindowsDialogBridge(mockRunner);

    const abortControllerB = new AbortController();

    const promiseA = bridge.showDialog({ operation: "openFile", title: "A" });
    const promiseB = bridge.showDialog(
      { operation: "openFile", title: "B" },
      abortControllerB.signal,
    );
    const promiseC = bridge.showDialog({ operation: "openFile", title: "C" });

    // Abort B while A is still active
    abortControllerB.abort();

    await expect(promiseB).rejects.toThrow(/aborted/);

    const [resA, resC] = await Promise.all([promiseA, promiseC]);
    expect(resA.ok).toBe(true);
    expect(resC.ok).toBe(true);
    expect(executed).toEqual(["A", "C"]);
  });

  it("handles runner failures and rejection (N8)", async () => {
    const mockRunner = vi.fn(async (req: DialogRequest): Promise<DialogResult> => {
      if (req.title === "fail") {
        throw new Error("Dialog process exited with code 1");
      }
      return { ok: true, cancelled: false };
    });

    const bridge = new WindowsDialogBridge(mockRunner);

    await expect(bridge.showDialog({ operation: "openFile", title: "fail" })).rejects.toThrow(
      /exited with code 1/,
    );

    // Queue recovers after a failure
    const successRes = await bridge.showDialog({ operation: "openFile", title: "success" });
    expect(successRes.ok).toBe(true);
  });

  it("handles dispose gracefully", async () => {
    const mockRunner = vi.fn(async (): Promise<DialogResult> => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ok: true };
    });

    const bridge = new WindowsDialogBridge(mockRunner);

    const promiseA = bridge.showDialog({ operation: "openFile", title: "A" });
    const promiseB = bridge.showDialog({ operation: "openFile", title: "B" });

    const disposePromise = bridge.dispose();

    // Any new request after dispose is immediately rejected
    await expect(bridge.showDialog({ operation: "openFile", title: "C" })).rejects.toThrow(
      /disposed/,
    );

    // B was queued so it was rejected on dispose
    await expect(promiseB).rejects.toThrow(/disposed/);

    // A was active and finishes
    const resA = await promiseA;
    expect(resA.ok).toBe(true);

    await disposePromise;
  });
});
