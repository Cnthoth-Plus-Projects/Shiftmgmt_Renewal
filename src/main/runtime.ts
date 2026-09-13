import fs from "node:fs";
import path from "node:path";
import {
  closeSqliteStorage,
  initializeSqliteStorage,
} from "./services/sqlite-storage-service";
import { repairStoredOvertimePerformanceData } from "./services/performance-overtime-repair-service";
import {
  restartDatabaseBackupRuntime,
  stopDatabaseBackupRuntime,
} from "./services/database-backup-service";
import {
  closeFileWatchRuntime,
  restartFileWatchRuntime,
} from "./services/file-watch-runtime-service";
import { recoverPerformanceDataOnStartup } from "./services/performance-startup-recovery-service";
import { assembleRoutes } from "./http/routes";
import { RouteRegistry } from "./http/route-registry";
import { SessionManager } from "./http/session";
import { WindowsDialogBridge } from "./http/dialog-bridge";
import type { DialogBridge } from "./http/api-types";

export interface StorageServices {
  initializeSqliteStorage: (opts: { userDataPath: string }) => void;
  closeSqliteStorage: () => void;
  repairStoredOvertimePerformanceData: () => void;
  restartDatabaseBackupRuntime: (opts: { userDataPath: string }) => void;
  stopDatabaseBackupRuntime: () => void;
  restartFileWatchRuntime: (opts: { userDataPath: string; env?: NodeJS.ProcessEnv }) => Promise<unknown>;
  closeFileWatchRuntime: () => Promise<void>;
  recoverPerformanceDataOnStartup: (opts: { userDataPath: string }) => Promise<unknown>;
}

export interface AppRuntimeOptions {
  dataDir: string;
  version: string;
  scriptPath?: string;
  sessionManager?: SessionManager;
  dialogBridge?: DialogBridge;
  registry?: RouteRegistry;
  storageServices?: Partial<StorageServices>;
}

export class AppRuntime {
  public readonly dataDir: string;
  public readonly version: string;
  public readonly sessionManager: SessionManager;
  public readonly dialogBridge: DialogBridge;
  public readonly registry: RouteRegistry;

  private readonly storageServices: StorageServices;
  private fileWatchTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private isBackgroundStarted = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(options: AppRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.version = options.version;

    this.sessionManager = options.sessionManager ?? new SessionManager();
    const defaultScriptPath =
      options.scriptPath ??
      path.resolve(process.cwd(), "scripts/windows-dialog.ps1");
    this.dialogBridge =
      options.dialogBridge ?? new WindowsDialogBridge(defaultScriptPath);
    this.registry = options.registry ?? assembleRoutes(this.sessionManager);

    this.storageServices = {
      initializeSqliteStorage:
        options.storageServices?.initializeSqliteStorage ?? initializeSqliteStorage,
      closeSqliteStorage:
        options.storageServices?.closeSqliteStorage ?? closeSqliteStorage,
      repairStoredOvertimePerformanceData:
        options.storageServices?.repairStoredOvertimePerformanceData ??
        repairStoredOvertimePerformanceData,
      restartDatabaseBackupRuntime:
        options.storageServices?.restartDatabaseBackupRuntime ??
        restartDatabaseBackupRuntime,
      stopDatabaseBackupRuntime:
        options.storageServices?.stopDatabaseBackupRuntime ??
        stopDatabaseBackupRuntime,
      restartFileWatchRuntime:
        options.storageServices?.restartFileWatchRuntime ?? restartFileWatchRuntime,
      closeFileWatchRuntime:
        options.storageServices?.closeFileWatchRuntime ?? closeFileWatchRuntime,
      recoverPerformanceDataOnStartup:
        options.storageServices?.recoverPerformanceDataOnStartup ??
        recoverPerformanceDataOnStartup,
    };
  }

  public initialize(): void {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    fs.mkdirSync(this.dataDir, { recursive: true });
    this.storageServices.initializeSqliteStorage({ userDataPath: this.dataDir });
    this.storageServices.repairStoredOvertimePerformanceData();
  }

  public startBackground(): void {
    if (this.isBackgroundStarted) {
      return;
    }
    this.isBackgroundStarted = true;

    this.storageServices.restartDatabaseBackupRuntime({ userDataPath: this.dataDir });

    this.fileWatchTimer = setTimeout(() => {
      void this.storageServices
        .restartFileWatchRuntime({ userDataPath: this.dataDir })
        .catch((error) => {
          console.error("[file-watch-runtime] failed to start", error);
        });
    }, 1200);

    this.recoveryTimer = setTimeout(() => {
      void this.storageServices
        .recoverPerformanceDataOnStartup({ userDataPath: this.dataDir })
        .catch((error) => {
          console.error("[performance-startup-recovery] failed", error);
        });
    }, 3000);
  }

  public shutdownOnce(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      if (this.fileWatchTimer) {
        clearTimeout(this.fileWatchTimer);
        this.fileWatchTimer = null;
      }
      if (this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
      }

      await this.dialogBridge.dispose();

      try {
        await this.storageServices.closeFileWatchRuntime();
      } catch (err) {
        console.error("Error closing file watch runtime:", err);
      }

      try {
        this.storageServices.stopDatabaseBackupRuntime();
      } catch (err) {
        console.error("Error stopping database backup runtime:", err);
      }

      this.sessionManager.clear();

      try {
        this.storageServices.closeSqliteStorage();
      } catch (err) {
        console.error("Error closing sqlite storage:", err);
      }
    })();

    return this.shutdownPromise;
  }
}
