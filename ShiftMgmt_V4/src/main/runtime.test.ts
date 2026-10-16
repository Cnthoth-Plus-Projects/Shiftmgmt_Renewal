import { describe, expect, it, vi } from "vitest";
import { AppRuntime } from "./runtime";

describe("AppRuntime", () => {
  it("executes lifecycle in correct order and ensures shutdownOnce is idempotent (R9, N13)", async () => {
    const lifecycleSteps: string[] = [];

    const mockStorageServices = {
      initializeSqliteStorage: vi.fn(() => {
        lifecycleSteps.push("initializeSqlite");
      }),
      closeSqliteStorage: vi.fn(() => {
        lifecycleSteps.push("closeSqlite");
      }),
      repairStoredOvertimePerformanceData: vi.fn(() => {
        lifecycleSteps.push("repairData");
      }),
      restartDatabaseBackupRuntime: vi.fn(() => {
        lifecycleSteps.push("restartBackup");
      }),
      stopDatabaseBackupRuntime: vi.fn(() => {
        lifecycleSteps.push("stopBackup");
      }),
      restartFileWatchRuntime: vi.fn(async () => {
        lifecycleSteps.push("restartFileWatch");
      }),
      closeFileWatchRuntime: vi.fn(async () => {
        lifecycleSteps.push("closeFileWatch");
      }),
      recoverPerformanceDataOnStartup: vi.fn(async () => {
        lifecycleSteps.push("recoverPerformance");
      }),
    };

    const mockDialogBridge = {
      showDialog: vi.fn(),
      dispose: vi.fn(async () => {
        lifecycleSteps.push("disposeDialog");
      }),
    };

    const runtime = new AppRuntime({
      dataDir: "C:/fake/temp-data",
      version: "0.1.0",
      storageServices: mockStorageServices,
      dialogBridge: mockDialogBridge,
    });

    // 1. Initialize
    runtime.initialize();
    expect(lifecycleSteps).toEqual(["initializeSqlite", "repairData"]);

    // Calling initialize again is idempotent
    runtime.initialize();
    expect(lifecycleSteps).toEqual(["initializeSqlite", "repairData"]);

    // 2. Start background
    runtime.startBackground();
    expect(lifecycleSteps).toContain("restartBackup");

    // Calling startBackground again is idempotent
    runtime.startBackground();

    // 3. Shutdown once
    const p1 = runtime.shutdownOnce();
    const p2 = runtime.shutdownOnce();
    expect(p1).toBe(p2); // Same promise

    await p1;

    expect(lifecycleSteps).toContain("disposeDialog");
    expect(lifecycleSteps).toContain("closeFileWatch");
    expect(lifecycleSteps).toContain("stopBackup");
    expect(lifecycleSteps).toContain("closeSqlite");

    // Close calls happened exactly once
    expect(mockDialogBridge.dispose).toHaveBeenCalledTimes(1);
    expect(mockStorageServices.closeFileWatchRuntime).toHaveBeenCalledTimes(1);
    expect(mockStorageServices.stopDatabaseBackupRuntime).toHaveBeenCalledTimes(1);
    expect(mockStorageServices.closeSqliteStorage).toHaveBeenCalledTimes(1);
  });
});
