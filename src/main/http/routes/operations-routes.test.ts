import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANNEL_CONTRACTS,
  CORE_CHANNELS,
} from "../../../shared/bridge/channel-contracts";
import type { AuthSession } from "../../../shared/domain/model";
import type { DialogBridge } from "../api-types";
import { RouteRegistry } from "../route-registry";
import { assembleRoutes, OPERATIONS_CHANNELS } from "./index";
import { registerOperationsRoutes } from "./operations-routes";
import { SessionManager } from "../session";

const mocks = vi.hoisted(() => ({
  // app-settings-storage-service
  getStoredAppSettingsSnapshot: vi.fn(() => ({
    holidayApiBaseUrl: "https://api.test/holidays",
    scheduleExportDir: "C:/exports",
    autoBackupEnabled: true,
  })),
  saveStoredAppSettings: vi.fn((input: unknown) => input),

  // account-recovery-service
  rotateAdminAccountRecoveryKey: vi.fn(() => ({ recoveryKey: "new-key-123" })),

  // file-watch-runtime-service
  getFileWatchStatusSnapshot: vi.fn(() => ({ active: true, watchingCount: 1 })),
  restartFileWatchRuntime: vi.fn().mockResolvedValue(undefined),
  stopFileWatchRuntime: vi.fn().mockResolvedValue(undefined),

  // database-backup-service
  runDatabaseBackupNow: vi.fn().mockResolvedValue({ backupPath: "C:/backup.db" }),
  restartDatabaseBackupRuntime: vi.fn(),

  // database-migration-service
  checkDatabaseMigrationRequirements: vi.fn().mockResolvedValue({ canMigrate: true }),
  previewDatabaseMigrationUpdate: vi.fn().mockResolvedValue({ changes: [] }),
  runDatabaseMigrationUpdate: vi.fn().mockResolvedValue({ applied: true }),

  // document-template-management-service
  approveManagedDocumentTemplateVersion: vi.fn().mockResolvedValue({ approved: true }),
  deleteManagedDocumentTemplateVersion: vi.fn().mockResolvedValue(undefined),
  inspectDocumentTemplateImport: vi.fn().mockResolvedValue({ valid: true }),
  saveManagedDocumentTemplateVersion: vi.fn().mockResolvedValue({ id: "tpl-1" }),

  // document-template-preview-service
  previewDocumentTemplateFile: vi.fn().mockResolvedValue({ previewUrl: "http://preview" }),

  // holiday-api-service
  fetchHolidayApiItems: vi.fn().mockResolvedValue([{ date: "2026-01-01", name: "신정" }]),

  // operations-storage-service
  deleteStoredAllowanceRateVersion: vi.fn(),
  deleteStoredSiteNameOption: vi.fn(),
  listStoredAllowanceRateHistory: vi.fn(() => []),
  deleteStoredHolidayItem: vi.fn(),
  deleteStoredOperationUser: vi.fn(),
  listStoredAllowanceRateVersions: vi.fn(() => []),
  listStoredDocumentTemplateHistory: vi.fn(() => []),
  listStoredDocumentTemplateVersions: vi.fn(() => []),
  listStoredHolidayCalendars: vi.fn(() => []),
  listStoredOperationUsers: vi.fn(() => []),
  listStoredSiteNameOptions: vi.fn(() => []),
  renameStoredHolidayItem: vi.fn((input: unknown) => input),
  replaceStoredHolidayCalendar: vi.fn((input: unknown) => input),
  saveStoredAllowanceRateVersion: vi.fn((input: unknown) => input),
  saveStoredHolidayItem: vi.fn((input: unknown) => input),
  saveStoredOperationUser: vi.fn((input: unknown) => input),
  saveStoredSiteNameOption: vi.fn((input: unknown) => input),
  setStoredDefaultDocumentTemplateVersion: vi.fn((id: string) => ({ id, isDefault: true })),
  updateStoredDocumentTemplateOutputFileNamePattern: vi.fn((input: unknown) => input),
  findStoredOperationAuthByLoginId: vi.fn(() => null),

  // release-history-service
  listReleaseHistory: vi.fn(() => []),
}));

vi.mock("../../services/app-settings-storage-service", () => ({
  getStoredAppSettingsSnapshot: mocks.getStoredAppSettingsSnapshot,
  saveStoredAppSettings: mocks.saveStoredAppSettings,
}));

vi.mock("../../services/account-recovery-service", () => ({
  rotateAdminAccountRecoveryKey: mocks.rotateAdminAccountRecoveryKey,
}));

vi.mock("../../services/file-watch-runtime-service", () => ({
  getFileWatchStatusSnapshot: mocks.getFileWatchStatusSnapshot,
  restartFileWatchRuntime: mocks.restartFileWatchRuntime,
  stopFileWatchRuntime: mocks.stopFileWatchRuntime,
}));

vi.mock("../../services/database-backup-service", () => ({
  runDatabaseBackupNow: mocks.runDatabaseBackupNow,
  restartDatabaseBackupRuntime: mocks.restartDatabaseBackupRuntime,
}));

vi.mock("../../services/database-migration-service", () => ({
  checkDatabaseMigrationRequirements: mocks.checkDatabaseMigrationRequirements,
  previewDatabaseMigrationUpdate: mocks.previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate: mocks.runDatabaseMigrationUpdate,
}));

vi.mock("../../services/document-template-management-service", () => ({
  approveManagedDocumentTemplateVersion: mocks.approveManagedDocumentTemplateVersion,
  deleteManagedDocumentTemplateVersion: mocks.deleteManagedDocumentTemplateVersion,
  inspectDocumentTemplateImport: mocks.inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion: mocks.saveManagedDocumentTemplateVersion,
}));

vi.mock("../../services/document-template-preview-service", () => ({
  previewDocumentTemplateFile: mocks.previewDocumentTemplateFile,
}));

vi.mock("../../services/holiday-api-service", () => ({
  fetchHolidayApiItems: mocks.fetchHolidayApiItems,
}));

vi.mock("../../services/operations-storage-service", () => ({
  deleteStoredAllowanceRateVersion: mocks.deleteStoredAllowanceRateVersion,
  deleteStoredSiteNameOption: mocks.deleteStoredSiteNameOption,
  listStoredAllowanceRateHistory: mocks.listStoredAllowanceRateHistory,
  deleteStoredHolidayItem: mocks.deleteStoredHolidayItem,
  deleteStoredOperationUser: mocks.deleteStoredOperationUser,
  listStoredAllowanceRateVersions: mocks.listStoredAllowanceRateVersions,
  listStoredDocumentTemplateHistory: mocks.listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions: mocks.listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars: mocks.listStoredHolidayCalendars,
  listStoredOperationUsers: mocks.listStoredOperationUsers,
  listStoredSiteNameOptions: mocks.listStoredSiteNameOptions,
  renameStoredHolidayItem: mocks.renameStoredHolidayItem,
  replaceStoredHolidayCalendar: mocks.replaceStoredHolidayCalendar,
  saveStoredAllowanceRateVersion: mocks.saveStoredAllowanceRateVersion,
  saveStoredHolidayItem: mocks.saveStoredHolidayItem,
  saveStoredOperationUser: mocks.saveStoredOperationUser,
  saveStoredSiteNameOption: mocks.saveStoredSiteNameOption,
  setStoredDefaultDocumentTemplateVersion: mocks.setStoredDefaultDocumentTemplateVersion,
  updateStoredDocumentTemplateOutputFileNamePattern: mocks.updateStoredDocumentTemplateOutputFileNamePattern,
  findStoredOperationAuthByLoginId: mocks.findStoredOperationAuthByLoginId,
}));

vi.mock("../../services/release-history-service", () => ({
  listReleaseHistory: mocks.listReleaseHistory,
}));

const mockAdminSession: AuthSession = {
  userId: "admin-1",
  loginId: "admin",
  displayName: "관리자",
  role: "admin",
  passwordChangeRequired: false,
  issuedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-13T08:00:00.000Z",
};

const mockUserSession: AuthSession = {
  userId: "user-1",
  loginId: "user",
  displayName: "일반사용자",
  role: "operator",
  passwordChangeRequired: false,
  issuedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-13T08:00:00.000Z",
};

const createMockDialogBridge = (overrides: Partial<DialogBridge> = {}): DialogBridge => ({
  showDialog: vi.fn().mockImplementation(async (req) => {
    if (req.operation === "openFolder") {
      return { ok: true, cancelled: false, path: "C:/selected/dir" };
    }
    if (req.operation === "saveFile") {
      return { ok: true, cancelled: false, path: "C:/selected/preview.xlsx" };
    }
    if (req.title === "복원 파일 선택") {
      return { ok: true, cancelled: false, path: "C:/selected/backup.json" };
    }
    if (req.title === "Excel 파일 선택") {
      return { ok: true, cancelled: false, path: "C:/selected/sheet.xlsx" };
    }
    return { ok: true, cancelled: false, path: "C:/selected/template.xlsx" };
  }),
  dispose: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const setupTestEnv = (session: AuthSession | null = mockAdminSession) => {
  const accessLogSpy = vi.fn();
  const sessionManager = new SessionManager({
    authService: {
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ ok: true, data: session })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: session })),
      changePassword: vi.fn(),
    },
    accessLogService: {
      recordAccessLog: accessLogSpy,
    },
    findUserByLoginId: mocks.findStoredOperationAuthByLoginId,
    randomId: () => "a".repeat(64),
  });

  const cookieId = "a".repeat(64);
  const cookie = `sm_session=${cookieId}`;

  if (session) {
    (
      sessionManager as unknown as {
        sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }>;
      }
    ).sessionMap.set(cookieId, {
      session,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  }

  const dialogBridge = createMockDialogBridge();
  const dataDir = "C:/sentinel/custom/user/data/path";

  return {
    sessionManager,
    cookie,
    dialogBridge,
    dataDir,
    accessLogSpy,
  };
};

const validArgsMap: Record<string, unknown[]> = {
  "operations:get-app-settings": [],
  "operations:save-app-settings": [{ autoBackupEnabled: true }],
  "operations:select-directory": [{ title: "폴더 선택" }],
  "operations:select-migration-file": [{ title: "복원 파일 선택" }],
  "operations:select-spreadsheet-file": [{ title: "Excel 파일 선택" }],
  "operations:check-database-migration-requirements": [{ migrationFilePath: "C:/selected/backup.json" }],
  "operations:preview-database-migration-update": [{ migrationFilePath: "C:/selected/backup.json", selectedAccessTables: [] }],
  "operations:update-database-from-migration": [{ migrationFilePath: "C:/selected/backup.json", selectedAccessTables: [] }],
  "operations:run-database-backup-now": [],
  "operations:get-file-watch-status": [],
  "operations:restart-file-watch": [],
  "operations:stop-file-watch": [],
  "operations:list-holiday-calendars": [2026],
  "operations:fetch-holiday-api-items": [2026],
  "operations:add-holiday-item": [{ holidayDate: "2026-05-05", holidayName: "어린이날", isSubstitute: false }],
  "operations:rename-holiday-item": [{ holidayDate: "2026-05-05", holidayName: "어린이날(수정)" }],
  "operations:delete-holiday-item": [{ holidayDate: "2026-05-05" }],
  "operations:replace-holiday-calendar": [{ year: 2026, items: [] }],
  "operations:list-allowance-rate-versions": [2026],
  "operations:list-allowance-rate-history": [],
  "operations:list-release-history": [{ page: 1, pageSize: 10 }],
  "operations:save-allowance-rate-version": [{ versionLabel: "2026v1", changeReason: "정기조정" }],
  "operations:delete-allowance-rate-version": [{ rateVersionId: "rate-1" }],
  "operations:list-users": [],
  "operations:save-user": [{ loginId: "worker1", name: "홍길동" }],
  "operations:delete-user": [{ userId: "user-9" }],
  "operations:rotate-account-recovery-key": [],
  "operations:list-site-name-options": [],
  "operations:save-site-name-option": [{ name: "본사" }],
  "operations:delete-site-name-option": [{ name: "본사" }],
  "operations:list-document-template-history": ["schedule"],
  "operations:select-document-template-file": ["schedule"],
  "operations:inspect-document-template": [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx" }],
  "operations:preview-document-template": [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx", versionLabel: "v1" }],
  "operations:save-document-template-version": [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx", versionLabel: "v1" }],
  "operations:approve-document-template-version": ["tpl-1"],
  "operations:set-default-document-template-version": ["tpl-1"],
  "operations:update-document-template-output-file-name": [{ templateType: "schedule", pattern: "{date}_{name}" }],
  "operations:delete-document-template-version": ["tpl-1"],
  "operations:list-document-template-versions": ["schedule"],
};

describe("operations-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("C2. S2 aggregate 57 and unmapped 54 verification (CN1, CN2)", () => {
    it("verifies manifest counts and aggregate registrations accurately", () => {
      const { sessionManager } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      expect(CHANNEL_CONTRACTS).toHaveLength(111);
      expect(CORE_CHANNELS).toHaveLength(17);
      expect(OPERATIONS_CHANNELS).toHaveLength(40);

      const registered = registry.getRegisteredChannels();
      expect(registered).toHaveLength(57);
      expect(new Set(registered).size).toBe(57);

      for (const channel of CORE_CHANNELS) {
        expect(registry.has(channel)).toBe(true);
      }
      for (const channel of OPERATIONS_CHANNELS) {
        expect(registry.has(channel)).toBe(true);
      }

      const unimplementedContracts = CHANNEL_CONTRACTS.filter(
        (c) => c.group === "workforce" || c.group === "performance" || c.group === "allowance",
      );
      expect(unimplementedContracts).toHaveLength(54);

      for (const contract of unimplementedContracts) {
        expect(registry.has(contract.channel)).toBe(false);
      }
    });

    it("verifies registerOperationsRoutes registers exactly 40 channels independently", () => {
      const { sessionManager } = setupTestEnv();
      const registry = new RouteRegistry(sessionManager);
      registerOperationsRoutes(registry, sessionManager);

      const registered = registry.getRegisteredChannels();
      expect(registered).toHaveLength(40);
      expect(new Set(registered).size).toBe(40);
      for (const channel of OPERATIONS_CHANNELS) {
        expect(registry.has(channel)).toBe(true);
      }
    });
  });

  describe("C3 & C4. 40 Admin dispatch & 25 Activity delta verification (CN4, CN5, CN6)", () => {
    it("matches validArgsMap keys with OPERATIONS_CHANNELS exactly", () => {
      const definedKeys = Object.keys(validArgsMap).sort();
      const expectedKeys = [...OPERATIONS_CHANNELS].sort();
      expect(definedKeys).toEqual(expectedKeys);
    });

    it("dispatches all 40 operations channels successfully and verifies exact activity deltas (25 대상 1회, 15 비대상 0회)", async () => {
      const { sessionManager, cookie, dialogBridge, dataDir, accessLogSpy } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      const activityContracts = CHANNEL_CONTRACTS.filter(
        (c) => c.group === "operations" && c.recordsActivity,
      );
      expect(activityContracts).toHaveLength(25);
      const activityChannelSet = new Set(activityContracts.map((c) => c.channel));

      for (const channel of OPERATIONS_CHANNELS) {
        const args = validArgsMap[channel];
        const callCountBefore = accessLogSpy.mock.calls.length;

        const result = await registry.dispatch(channel, args, {
          headers: {},
          cookie,
          signal: new AbortController().signal,
          version: "0.1.0",
          dataDir,
          dialogBridge,
        });

        expect(result, `Channel ${channel} dispatch result`).not.toBeNull();
        expect(result?.status, `Channel ${channel} status`).toBe(200);
        expect((result?.body as { ok: boolean })?.ok, `Channel ${channel} body.ok`).toBe(true);

        const callCountAfter = accessLogSpy.mock.calls.length;
        const delta = callCountAfter - callCountBefore;

        if (activityChannelSet.has(channel)) {
          expect(delta, `Activity count delta for ${channel}`).toBe(1);
          const lastCall = accessLogSpy.mock.calls[accessLogSpy.mock.calls.length - 1][0];
          expect(lastCall.routeKey).toBe("operations");
          expect(lastCall.routeLabel).toBe("운영 관리");
        } else {
          expect(delta, `Activity count delta for non-tracked ${channel}`).toBe(0);
        }
      }
    });

    it("verifies activity is 0 when tracked service throws an error (C4, CN6)", async () => {
      const { sessionManager, cookie, dialogBridge, dataDir, accessLogSpy } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      mocks.runDatabaseBackupNow.mockRejectedValueOnce(new Error("Disk full"));
      accessLogSpy.mockClear();

      const result = await registry.dispatch("operations:run-database-backup-now", [], {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge,
      });

      expect(result?.status).toBe(200);
      expect((result?.body as { ok: boolean })?.ok).toBe(false);
      expect((result?.body as { errorCode: string })?.errorCode).toBe("DATABASE_BACKUP_FAILED");
      expect(accessLogSpy).toHaveBeenCalledTimes(0);
    });

    it("verifies activity is 0 when preview-document-template dialog is cancelled (C4, CN6)", async () => {
      const { sessionManager, cookie, dataDir, accessLogSpy } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      const cancelledBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: true }),
      });
      accessLogSpy.mockClear();

      const result = await registry.dispatch(
        "operations:preview-document-template",
        [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx" }],
        {
          headers: {},
          cookie,
          signal: new AbortController().signal,
          version: "0.1.0",
          dataDir,
          dialogBridge: cancelledBridge,
        },
      );

      expect(result?.status).toBe(200);
      expect(result?.body).toEqual({ ok: true, data: null });
      expect(accessLogSpy).toHaveBeenCalledTimes(0);
    });

    it("blocks unauthenticated or non-admin requests with 0 activity and 0 service calls (CN4)", async () => {
      // 1. unauthenticated
      const envUnauth = setupTestEnv(null);
      const registryUnauth = assembleRoutes(envUnauth.sessionManager);
      envUnauth.accessLogSpy.mockClear();

      const resUnauth = await registryUnauth.dispatch("operations:get-app-settings", [], {
        headers: {},
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir: envUnauth.dataDir,
        dialogBridge: envUnauth.dialogBridge,
      });
      expect(resUnauth?.status).toBe(401);
      expect(envUnauth.accessLogSpy).toHaveBeenCalledTimes(0);

      // 2. non-admin
      const envUser = setupTestEnv(mockUserSession);
      const registryUser = assembleRoutes(envUser.sessionManager);
      envUser.accessLogSpy.mockClear();

      const resUser = await registryUser.dispatch("operations:get-app-settings", [], {
        headers: {},
        cookie: envUser.cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir: envUser.dataDir,
        dialogBridge: envUser.dialogBridge,
      });
      expect(resUser?.status).toBe(200);
      expect((resUser?.body as { errorCode?: string })?.errorCode).toBe("AUTH_FORBIDDEN");
      expect(envUser.accessLogSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("C5. Dialog success, dataDir, and migration cleanup verification (CN7, CN8, CN9, CN10)", () => {
    it("verifies 5 dialog channels return cancelled null when cancelled (CN7)", async () => {
      const { sessionManager, cookie, dataDir } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      const cancelledBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: true }),
      });

      const ctx = {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge: cancelledBridge,
      };

      const r1 = await registry.dispatch("operations:select-directory", [], ctx);
      expect(r1?.body).toEqual({ ok: true, data: null });

      const r2 = await registry.dispatch("operations:select-migration-file", [], ctx);
      expect(r2?.body).toEqual({ ok: true, data: null });

      const r3 = await registry.dispatch("operations:select-spreadsheet-file", [], ctx);
      expect(r3?.body).toEqual({ ok: true, data: null });

      const r4 = await registry.dispatch("operations:select-document-template-file", ["schedule"], ctx);
      expect(r4?.body).toEqual({ ok: true, data: null });

      const r5 = await registry.dispatch(
        "operations:preview-document-template",
        [{ templateType: "schedule", sourcePath: "C:/test/src.xlsx" }],
        ctx,
      );
      expect(r5?.body).toEqual({ ok: true, data: null });
    });

    it("verifies 5 dialog channels return correct success shapes and pass options (CN7, CN8)", async () => {
      const { sessionManager, cookie, dataDir } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      // 1. select-directory
      const dirBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/my-folder" }),
      });
      const rDir = await registry.dispatch("operations:select-directory", [{ title: "사용자 폴더" }], {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge: dirBridge,
      });
      expect(rDir?.body).toEqual({ ok: true, data: "C:/my-folder" });
      expect(dirBridge.showDialog).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "openFolder", title: "사용자 폴더" }),
        expect.anything(),
      );

      // 2. select-migration-file (invalid .xlsx -> DATABASE_RESTORE_FILE_REQUIRED)
      const invalidMigBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/bad.xlsx" }),
      });
      const rMigBad = await registry.dispatch("operations:select-migration-file", [], {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge: invalidMigBridge,
      });
      expect((rMigBad?.body as { errorCode?: string })?.errorCode).toBe("DATABASE_RESTORE_FILE_REQUIRED");

      // 2b. select-migration-file (valid .json -> success)
      const validMigBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/good.json" }),
      });
      const rMigGood = await registry.dispatch("operations:select-migration-file", [], {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge: validMigBridge,
      });
      expect(rMigGood?.body).toEqual({ ok: true, data: "C:/good.json" });

      // 3. select-spreadsheet-file
      const sheetBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/data/sheet.xlsx" }),
      });
      const rSheet = await registry.dispatch("operations:select-spreadsheet-file", [], {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge: sheetBridge,
      });
      expect(rSheet?.body).toEqual({
        ok: true,
        data: { fileName: "sheet.xlsx", filePath: "C:/data/sheet.xlsx" },
      });

      // 4. select-document-template-file
      const tplBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/data/template.xlsm" }),
      });
      const rTpl = await registry.dispatch("operations:select-document-template-file", ["schedule"], {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge: tplBridge,
      });
      expect(rTpl?.body).toEqual({
        ok: true,
        data: { fileName: "template.xlsm", filePath: "C:/data/template.xlsm" },
      });

      // 5. preview-document-template
      const previewBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/preview/out.xlsx" }),
      });
      const rPrev = await registry.dispatch(
        "operations:preview-document-template",
        [{ templateType: "schedule", sourcePath: "C:/src.xlsx", versionLabel: "v2" }],
        {
          headers: {},
          cookie,
          signal: new AbortController().signal,
          version: "0.1.0",
          dataDir,
          dialogBridge: previewBridge,
        },
      );
      expect((rPrev?.body as { ok: boolean })?.ok).toBe(true);
      expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledWith(
        expect.anything(),
        { outputPath: "C:/preview/out.xlsx" },
      );
    });

    it("verifies sentinel dataDir is passed to all 12 usesDataDir services (CN9)", async () => {
      const { sessionManager, cookie, dialogBridge, dataDir } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      const dataDirContracts = CHANNEL_CONTRACTS.filter(
        (c) => c.group === "operations" && c.usesDataDir,
      );
      expect(dataDirContracts).toHaveLength(12);

      const ctx = {
        headers: {},
        cookie,
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir,
        dialogBridge,
      };

      // 1. get-app-settings
      await registry.dispatch("operations:get-app-settings", [], ctx);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 2. save-app-settings
      await registry.dispatch("operations:save-app-settings", [{ autoBackupEnabled: false }], ctx);
      expect(mocks.saveStoredAppSettings).toHaveBeenCalledWith(expect.anything(), { userDataPath: dataDir });
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: dataDir });
      expect(mocks.restartDatabaseBackupRuntime).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 3. get-file-watch-status
      await registry.dispatch("operations:get-file-watch-status", [], ctx);
      expect(mocks.getFileWatchStatusSnapshot).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 4. restart-file-watch
      await registry.dispatch("operations:restart-file-watch", [], ctx);
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 5. stop-file-watch
      await registry.dispatch("operations:stop-file-watch", [], ctx);
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 6. run-database-backup-now
      await registry.dispatch("operations:run-database-backup-now", [], ctx);
      expect(mocks.runDatabaseBackupNow).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 7. preview-database-migration-update
      await registry.dispatch("operations:preview-database-migration-update", [{ migrationFilePath: "C:/selected/backup.json" }], ctx);
      expect(mocks.previewDatabaseMigrationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userDataPath: dataDir }),
      );

      // 8. update-database-from-migration
      await registry.dispatch("operations:update-database-from-migration", [{ migrationFilePath: "C:/selected/backup.json" }], ctx);
      expect(mocks.runDatabaseMigrationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userDataPath: dataDir }),
      );

      // 9. fetch-holiday-api-items (reads settings snapshot with userDataPath)
      await registry.dispatch("operations:fetch-holiday-api-items", [2026], ctx);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 10. preview-document-template (reads settings snapshot with userDataPath)
      await registry.dispatch("operations:preview-document-template", [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx" }], ctx);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: dataDir });

      // 11. save-document-template-version
      await registry.dispatch("operations:save-document-template-version", [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx" }], ctx);
      expect(mocks.saveManagedDocumentTemplateVersion).toHaveBeenCalledWith(
        expect.anything(),
        { userDataPath: dataDir },
      );

      // 12. delete-document-template-version
      await registry.dispatch("operations:delete-document-template-version", ["tpl-del-1"], ctx);
      expect(mocks.deleteManagedDocumentTemplateVersion).toHaveBeenCalledWith(
        "tpl-del-1",
        { userDataPath: dataDir },
      );
    });

    it("verifies migration stop -> action -> restart sequence and cleanup on action failure (CN10)", async () => {
      const { sessionManager, cookie, dialogBridge, dataDir, accessLogSpy } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      const callOrder: string[] = [];
      mocks.stopFileWatchRuntime.mockImplementation(async () => {
        callOrder.push("stop");
      });
      mocks.previewDatabaseMigrationUpdate.mockImplementation(async () => {
        callOrder.push("preview");
        return { changes: [] };
      });
      mocks.restartFileWatchRuntime.mockImplementation(async () => {
        callOrder.push("restart");
      });

      // Normal success sequence
      await registry.dispatch(
        "operations:preview-database-migration-update",
        [{ migrationFilePath: "C:/selected/backup.json" }],
        {
          headers: {},
          cookie,
          signal: new AbortController().signal,
          version: "0.1.0",
          dataDir,
          dialogBridge,
        },
      );

      expect(callOrder).toEqual(["stop", "preview", "restart"]);

      // Action failure sequence
      callOrder.length = 0;
      mocks.previewDatabaseMigrationUpdate.mockImplementationOnce(async () => {
        callOrder.push("preview-fail");
        throw new Error("Migration corrupted");
      });
      accessLogSpy.mockClear();

      const failResult = await registry.dispatch(
        "operations:preview-database-migration-update",
        [{ migrationFilePath: "C:/selected/backup.json" }],
        {
          headers: {},
          cookie,
          signal: new AbortController().signal,
          version: "0.1.0",
          dataDir,
          dialogBridge,
        },
      );

      expect(callOrder).toEqual(["stop", "preview-fail", "restart"]);
      expect(failResult?.status).toBe(200);
      expect((failResult?.body as { ok: boolean })?.ok).toBe(false);
      expect((failResult?.body as { errorCode: string })?.errorCode).toBe("DATABASE_MIGRATION_PREVIEW_FAILED");
      expect(accessLogSpy).toHaveBeenCalledTimes(0);
    });
  });
});
