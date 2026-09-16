import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANNEL_CONTRACTS,
  CORE_CHANNELS,
} from "../../../shared/bridge/channel-contracts";
import { accessLogActionLabels } from "../../../shared/domain/access-log";
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

const dispatchAsAdmin = async (
  registry: RouteRegistry,
  channel: string,
  args: unknown[],
  env: ReturnType<typeof setupTestEnv>,
  options?: {
    signal?: AbortSignal;
    dialogBridge?: DialogBridge;
  },
) => {
  const signal = options?.signal ?? new AbortController().signal;
  const dialogBridge = options?.dialogBridge ?? env.dialogBridge;
  const result = await registry.dispatch(channel, args, {
    headers: {},
    cookie: env.cookie,
    signal,
    version: "0.1.0",
    dataDir: env.dataDir,
    dialogBridge,
  });
  return { result, signal, dialogBridge };
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

const expectedActivities = {
  "operations:save-app-settings": ["app-settings-save", "앱 운영 설정 저장"],
  "operations:preview-database-migration-update": ["database-migration-preview", "DB 복원 미리보기"],
  "operations:update-database-from-migration": ["database-migration-update", "DB 복원 반영"],
  "operations:run-database-backup-now": ["database-backup-run", "DB 수동 백업"],
  "operations:restart-file-watch": ["file-watch-restart", "파일 감시 재시작"],
  "operations:stop-file-watch": ["file-watch-stop", "파일 감시 중지"],
  "operations:fetch-holiday-api-items": ["holiday-fetch", "2026년 공휴일 불러오기"],
  "operations:add-holiday-item": ["holiday-save", "2026-05-05 공휴일 등록"],
  "operations:rename-holiday-item": ["holiday-rename", "공휴일명 수정"],
  "operations:delete-holiday-item": ["holiday-delete", "공휴일 삭제"],
  "operations:replace-holiday-calendar": ["holiday-replace", "2026년 공휴일 일괄 반영"],
  "operations:save-allowance-rate-version": ["allowance-rate-save", "2026v1 요율 저장 · 사유: 정기조정"],
  "operations:delete-allowance-rate-version": ["allowance-rate-delete", "요율 버전 삭제"],
  "operations:save-user": ["user-save", "worker1 사용자 저장"],
  "operations:delete-user": ["user-delete", "사용자 삭제"],
  "operations:rotate-account-recovery-key": ["account-recovery-key-rotate", "admin 계정복구키 발급"],
  "operations:save-site-name-option": ["site-name-save", "본사 사이트 명 저장"],
  "operations:delete-site-name-option": ["site-name-delete", "사이트 명 삭제"],
  "operations:inspect-document-template": ["template-inspect", "근무표 양식 검증"],
  "operations:preview-document-template": ["template-preview", "근무표 양식 미리보기"],
  "operations:save-document-template-version": ["template-save", "근무표 양식 등록"],
  "operations:approve-document-template-version": ["template-approve", "양식 승인"],
  "operations:set-default-document-template-version": ["template-set-default", "기본 양식 지정"],
  "operations:update-document-template-output-file-name": ["template-file-name-update", "출력 파일명 규칙 저장"],
  "operations:delete-document-template-version": ["template-delete", "양식 삭제"],
} as const;

type ChannelEffectDescriptor = {
  args: unknown[];
  assertEffects: (
    env: ReturnType<typeof setupTestEnv>,
    args: unknown[],
    signal: AbortSignal,
    body: { ok: boolean; data?: unknown },
  ) => void;
};

const channelEffectDescriptors: Record<string, ChannelEffectDescriptor> = {
  "operations:get-app-settings": {
    args: [],
    assertEffects: (env) => {
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:save-app-settings": {
    args: [{ autoBackupEnabled: true }],
    assertEffects: (env, args) => {
      expect(mocks.saveStoredAppSettings).toHaveBeenCalledTimes(1);
      expect(mocks.saveStoredAppSettings).toHaveBeenCalledWith(args[0], { userDataPath: env.dataDir });
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
      expect(mocks.restartDatabaseBackupRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.restartDatabaseBackupRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:select-directory": {
    args: [{ title: "폴더 선택" }],
    assertEffects: (env, _args, signal, body) => {
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(1);
      expect(env.dialogBridge.showDialog).toHaveBeenCalledWith(
        { operation: "openFolder", title: "폴더 선택", defaultPath: undefined },
        signal,
      );
      expect(body).toEqual({ ok: true, data: "C:/selected/dir" });
    },
  },
  "operations:select-migration-file": {
    args: [{ title: "복원 파일 선택" }],
    assertEffects: (env, _args, signal, body) => {
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(1);
      expect(env.dialogBridge.showDialog).toHaveBeenCalledWith(
        {
          operation: "openFile",
          title: "복원 파일 선택",
          defaultPath: undefined,
          filters: [{ name: "복원 파일", extensions: ["json", "accdb"] }],
        },
        signal,
      );
      expect(body).toEqual({ ok: true, data: "C:/selected/backup.json" });
    },
  },
  "operations:select-spreadsheet-file": {
    args: [{ title: "Excel 파일 선택" }],
    assertEffects: (env, _args, signal, body) => {
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(1);
      expect(env.dialogBridge.showDialog).toHaveBeenCalledWith(
        {
          operation: "openFile",
          title: "Excel 파일 선택",
          defaultPath: undefined,
          filters: [{ name: "Excel Workbook", extensions: ["xlsx", "xlsm"] }],
        },
        signal,
      );
      expect(body).toEqual({
        ok: true,
        data: { fileName: "sheet.xlsx", filePath: "C:/selected/sheet.xlsx" },
      });
    },
  },
  "operations:check-database-migration-requirements": {
    args: [{ migrationFilePath: "C:/selected/backup.json" }],
    assertEffects: (_env, args) => {
      expect(mocks.checkDatabaseMigrationRequirements).toHaveBeenCalledTimes(1);
      expect(mocks.checkDatabaseMigrationRequirements).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:preview-database-migration-update": {
    args: [{ migrationFilePath: "C:/selected/backup.json", selectedAccessTables: [] }],
    assertEffects: (env, args) => {
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
      expect(mocks.previewDatabaseMigrationUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.previewDatabaseMigrationUpdate).toHaveBeenCalledWith({
        userDataPath: env.dataDir,
        ...(args[0] as object),
      });
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:update-database-from-migration": {
    args: [{ migrationFilePath: "C:/selected/backup.json", selectedAccessTables: [] }],
    assertEffects: (env, args) => {
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
      expect(mocks.runDatabaseMigrationUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.runDatabaseMigrationUpdate).toHaveBeenCalledWith({
        userDataPath: env.dataDir,
        ...(args[0] as object),
      });
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:run-database-backup-now": {
    args: [],
    assertEffects: (env) => {
      expect(mocks.runDatabaseBackupNow).toHaveBeenCalledTimes(1);
      expect(mocks.runDatabaseBackupNow).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:get-file-watch-status": {
    args: [],
    assertEffects: (env) => {
      expect(mocks.getFileWatchStatusSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.getFileWatchStatusSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:restart-file-watch": {
    args: [],
    assertEffects: (env) => {
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:stop-file-watch": {
    args: [],
    assertEffects: (env) => {
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
      expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
    },
  },
  "operations:list-holiday-calendars": {
    args: [2026],
    assertEffects: (_env, args) => {
      expect(mocks.listStoredHolidayCalendars).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredHolidayCalendars).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:fetch-holiday-api-items": {
    args: [2026],
    assertEffects: (env) => {
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
      expect(mocks.fetchHolidayApiItems).toHaveBeenCalledTimes(1);
      expect(mocks.fetchHolidayApiItems).toHaveBeenCalledWith({
        baseUrl: "https://api.test/holidays",
        year: 2026,
      });
    },
  },
  "operations:add-holiday-item": {
    args: [{ holidayDate: "2026-05-05", holidayName: "어린이날", isSubstitute: false }],
    assertEffects: (_env, args) => {
      expect(mocks.saveStoredHolidayItem).toHaveBeenCalledTimes(1);
      expect(mocks.saveStoredHolidayItem).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:rename-holiday-item": {
    args: [{ holidayDate: "2026-05-05", holidayName: "어린이날(수정)" }],
    assertEffects: (_env, args) => {
      expect(mocks.renameStoredHolidayItem).toHaveBeenCalledTimes(1);
      expect(mocks.renameStoredHolidayItem).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:delete-holiday-item": {
    args: [{ holidayDate: "2026-05-05" }],
    assertEffects: (_env, args) => {
      expect(mocks.deleteStoredHolidayItem).toHaveBeenCalledTimes(1);
      expect(mocks.deleteStoredHolidayItem).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:replace-holiday-calendar": {
    args: [{ year: 2026, items: [] }],
    assertEffects: (_env, args) => {
      expect(mocks.replaceStoredHolidayCalendar).toHaveBeenCalledTimes(1);
      expect(mocks.replaceStoredHolidayCalendar).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:list-allowance-rate-versions": {
    args: [2026],
    assertEffects: (_env, args) => {
      expect(mocks.listStoredAllowanceRateVersions).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredAllowanceRateVersions).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:list-allowance-rate-history": {
    args: [],
    assertEffects: () => {
      expect(mocks.listStoredAllowanceRateHistory).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredAllowanceRateHistory).toHaveBeenCalledWith();
    },
  },
  "operations:list-release-history": {
    args: [{ page: 1, pageSize: 10 }],
    assertEffects: (_env, args) => {
      expect(mocks.listReleaseHistory).toHaveBeenCalledTimes(1);
      expect(mocks.listReleaseHistory).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:save-allowance-rate-version": {
    args: [{ versionLabel: "2026v1", changeReason: "정기조정" }],
    assertEffects: (_env, args) => {
      expect(mocks.saveStoredAllowanceRateVersion).toHaveBeenCalledTimes(1);
      expect(mocks.saveStoredAllowanceRateVersion).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:delete-allowance-rate-version": {
    args: [{ rateVersionId: "rate-1" }],
    assertEffects: () => {
      expect(mocks.deleteStoredAllowanceRateVersion).toHaveBeenCalledTimes(1);
      expect(mocks.deleteStoredAllowanceRateVersion).toHaveBeenCalledWith("rate-1");
    },
  },
  "operations:list-users": {
    args: [],
    assertEffects: () => {
      expect(mocks.listStoredOperationUsers).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredOperationUsers).toHaveBeenCalledWith();
    },
  },
  "operations:save-user": {
    args: [{ loginId: "worker1", name: "홍길동" }],
    assertEffects: (_env, args) => {
      expect(mocks.saveStoredOperationUser).toHaveBeenCalledTimes(1);
      expect(mocks.saveStoredOperationUser).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:delete-user": {
    args: [{ userId: "user-9" }],
    assertEffects: () => {
      expect(mocks.deleteStoredOperationUser).toHaveBeenCalledTimes(1);
      expect(mocks.deleteStoredOperationUser).toHaveBeenCalledWith("user-9");
    },
  },
  "operations:rotate-account-recovery-key": {
    args: [],
    assertEffects: () => {
      expect(mocks.rotateAdminAccountRecoveryKey).toHaveBeenCalledTimes(1);
      expect(mocks.rotateAdminAccountRecoveryKey).toHaveBeenCalledWith();
    },
  },
  "operations:list-site-name-options": {
    args: [],
    assertEffects: () => {
      expect(mocks.listStoredSiteNameOptions).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredSiteNameOptions).toHaveBeenCalledWith();
    },
  },
  "operations:save-site-name-option": {
    args: [{ name: "본사" }],
    assertEffects: (_env, args) => {
      expect(mocks.saveStoredSiteNameOption).toHaveBeenCalledTimes(1);
      expect(mocks.saveStoredSiteNameOption).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:delete-site-name-option": {
    args: [{ name: "본사" }],
    assertEffects: (_env, args) => {
      expect(mocks.deleteStoredSiteNameOption).toHaveBeenCalledTimes(1);
      expect(mocks.deleteStoredSiteNameOption).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:list-document-template-history": {
    args: ["schedule"],
    assertEffects: () => {
      expect(mocks.listStoredDocumentTemplateHistory).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredDocumentTemplateHistory).toHaveBeenCalledWith("schedule");
    },
  },
  "operations:select-document-template-file": {
    args: ["schedule"],
    assertEffects: (env, _args, signal, body) => {
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(1);
      expect(env.dialogBridge.showDialog).toHaveBeenCalledWith(
        {
          operation: "openFile",
          title: "양식 파일 선택",
          filters: [{ name: "근무표 Excel 양식", extensions: ["xlsx", "xlsm"] }],
        },
        signal,
      );
      expect(body).toEqual({
        ok: true,
        data: { fileName: "template.xlsx", filePath: "C:/selected/template.xlsx" },
      });
    },
  },
  "operations:inspect-document-template": {
    args: [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx" }],
    assertEffects: (_env, args) => {
      expect(mocks.inspectDocumentTemplateImport).toHaveBeenCalledTimes(1);
      expect(mocks.inspectDocumentTemplateImport).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:preview-document-template": {
    args: [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx", versionLabel: "v1" }],
    assertEffects: (env, args, _signal, body) => {
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(1);
      expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledTimes(1);
      expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledWith(args[0], {
        outputPath: "C:/selected/preview.xlsx",
      });
      expect(body).toEqual({
        ok: true,
        data: { previewUrl: "http://preview" },
      });
    },
  },
  "operations:save-document-template-version": {
    args: [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx", versionLabel: "v1" }],
    assertEffects: (env, args) => {
      expect(mocks.saveManagedDocumentTemplateVersion).toHaveBeenCalledTimes(1);
      expect(mocks.saveManagedDocumentTemplateVersion).toHaveBeenCalledWith(args[0], {
        userDataPath: env.dataDir,
      });
    },
  },
  "operations:approve-document-template-version": {
    args: ["tpl-1"],
    assertEffects: () => {
      expect(mocks.approveManagedDocumentTemplateVersion).toHaveBeenCalledTimes(1);
      expect(mocks.approveManagedDocumentTemplateVersion).toHaveBeenCalledWith("tpl-1");
    },
  },
  "operations:set-default-document-template-version": {
    args: ["tpl-1"],
    assertEffects: () => {
      expect(mocks.setStoredDefaultDocumentTemplateVersion).toHaveBeenCalledTimes(1);
      expect(mocks.setStoredDefaultDocumentTemplateVersion).toHaveBeenCalledWith("tpl-1");
    },
  },
  "operations:update-document-template-output-file-name": {
    args: [{ templateType: "schedule", pattern: "{date}_{name}" }],
    assertEffects: (_env, args) => {
      expect(mocks.updateStoredDocumentTemplateOutputFileNamePattern).toHaveBeenCalledTimes(1);
      expect(mocks.updateStoredDocumentTemplateOutputFileNamePattern).toHaveBeenCalledWith(args[0]);
    },
  },
  "operations:delete-document-template-version": {
    args: ["tpl-1"],
    assertEffects: (env) => {
      expect(mocks.deleteManagedDocumentTemplateVersion).toHaveBeenCalledTimes(1);
      expect(mocks.deleteManagedDocumentTemplateVersion).toHaveBeenCalledWith("tpl-1", {
        userDataPath: env.dataDir,
      });
    },
  },
  "operations:list-document-template-versions": {
    args: ["schedule"],
    assertEffects: () => {
      expect(mocks.listStoredDocumentTemplateVersions).toHaveBeenCalledTimes(1);
      expect(mocks.listStoredDocumentTemplateVersions).toHaveBeenCalledWith("schedule");
    },
  },
};

const expectedDataDirChannels = [
  "operations:get-app-settings",
  "operations:save-app-settings",
  "operations:preview-database-migration-update",
  "operations:update-database-from-migration",
  "operations:run-database-backup-now",
  "operations:get-file-watch-status",
  "operations:restart-file-watch",
  "operations:stop-file-watch",
  "operations:fetch-holiday-api-items",
  "operations:preview-document-template",
  "operations:save-document-template-version",
  "operations:delete-document-template-version",
].sort();

describe("operations-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("C2 & RN1/RN2 contract counts (CN1, CN2)", () => {
    it("verifies the final 111-contract aggregate registration accurately", () => {
      const { sessionManager } = setupTestEnv();
      const registry = assembleRoutes(sessionManager);

      expect(CHANNEL_CONTRACTS).toHaveLength(111);
      expect(CORE_CHANNELS).toHaveLength(17);
      expect(OPERATIONS_CHANNELS).toHaveLength(40);

      const registered = registry.getRegisteredChannels();
      expect(registered).toHaveLength(111);
      expect(new Set(registered).size).toBe(111);

      for (const channel of CORE_CHANNELS) {
        expect(registry.has(channel)).toBe(true);
      }
      for (const channel of OPERATIONS_CHANNELS) {
        expect(registry.has(channel)).toBe(true);
      }

      for (const contract of CHANNEL_CONTRACTS) {
        expect(registry.has(contract.channel)).toBe(true);
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

  describe("R2-1 & R2-2. 40 Channel service/effect and 25 activity verification (RN1, RN2, RN3, CN5, CN6)", () => {
    it("matches validArgsMap and descriptor keys with OPERATIONS_CHANNELS exactly", () => {
      const expectedKeys = [...OPERATIONS_CHANNELS].sort();
      expect(Object.keys(validArgsMap).sort()).toEqual(expectedKeys);
      expect(Object.keys(channelEffectDescriptors).sort()).toEqual(expectedKeys);

      // Verify input consistency between validArgsMap and channelEffectDescriptors
      for (const channel of OPERATIONS_CHANNELS) {
        expect(channelEffectDescriptors[channel].args).toEqual(validArgsMap[channel]);
      }
    });

    it("matches expectedActivities keys with recordsActivity manifest channels exactly", () => {
      const activityContracts = CHANNEL_CONTRACTS.filter(
        (c) => c.group === "operations" && c.recordsActivity,
      );
      expect(activityContracts).toHaveLength(25);
      const manifestActivityKeys = activityContracts.map((c) => c.channel).sort();
      const literalActivityKeys = Object.keys(expectedActivities).sort();
      expect(literalActivityKeys).toEqual(manifestActivityKeys);
    });

    it("dispatches all 40 operations channels independently, verifying exact service effects and activity logs (25 tracked, 15 untracked)", async () => {
      for (const channel of OPERATIONS_CHANNELS) {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const descriptor = channelEffectDescriptors[channel];
        const args = descriptor.args;

        const { result, signal } = await dispatchAsAdmin(registry, channel, args, env);

        expect(result, `Channel ${channel} dispatch result`).not.toBeNull();
        expect(result?.status, `Channel ${channel} status`).toBe(200);
        expect((result?.body as { ok: boolean })?.ok, `Channel ${channel} body.ok`).toBe(true);

        // Verify primary service effect and exact arguments
        descriptor.assertEffects(
          env,
          args,
          signal,
          result?.body as { ok: boolean; data?: unknown },
        );

        // Verify activity logging
        const isTracked = channel in expectedActivities;
        if (isTracked) {
          expect(env.accessLogSpy).toHaveBeenCalledTimes(1);
          const [expectedActionType, expectedDetails] =
            expectedActivities[channel as keyof typeof expectedActivities];
          const [firstArg, secondArg] = env.accessLogSpy.mock.calls[0];

          expect(Object.keys(firstArg).sort()).toEqual(
            ["actionLabel", "actionType", "details", "routeKey", "routeLabel"].sort(),
          );
          expect(firstArg).toEqual({
            actionType: expectedActionType,
            actionLabel: accessLogActionLabels[expectedActionType as keyof typeof accessLogActionLabels],
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: expectedDetails,
          });
          expect(secondArg).toEqual(mockAdminSession);
        } else {
          expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
        }
      }
    });

    it("verifies activity is 0 when tracked service throws an error (RN3, CN6)", async () => {
      vi.clearAllMocks();
      const env = setupTestEnv();
      const registry = assembleRoutes(env.sessionManager);

      mocks.runDatabaseBackupNow.mockRejectedValueOnce(new Error("Disk full"));

      const { result } = await dispatchAsAdmin(
        registry,
        "operations:run-database-backup-now",
        [],
        env,
      );

      expect(result?.status).toBe(200);
      expect((result?.body as { ok: boolean })?.ok).toBe(false);
      expect((result?.body as { errorCode: string })?.errorCode).toBe("DATABASE_BACKUP_FAILED");
      expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
    });

    it("verifies activity is 0 and service calls are 0 when preview-document-template dialog is cancelled (RN3, CN6)", async () => {
      vi.clearAllMocks();
      const env = setupTestEnv();
      const registry = assembleRoutes(env.sessionManager);

      const cancelledBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: true }),
      });

      const { result } = await dispatchAsAdmin(
        registry,
        "operations:preview-document-template",
        [{ templateType: "schedule", sourcePath: "C:/tpl.xlsx" }],
        env,
        { dialogBridge: cancelledBridge },
      );

      expect(result?.status).toBe(200);
      expect(result?.body).toEqual({ ok: true, data: null });
      expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledTimes(0);
      expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("R2-6. CN4 unauthenticated and non-admin request rejection (RN7)", () => {
    it("blocks unauthenticated requests with 401, 0 service calls, 0 dialog calls, 0 activity", async () => {
      vi.clearAllMocks();
      const env = setupTestEnv(null);
      const registry = assembleRoutes(env.sessionManager);

      const result = await registry.dispatch("operations:get-app-settings", [], {
        headers: {},
        signal: new AbortController().signal,
        version: "0.1.0",
        dataDir: env.dataDir,
        dialogBridge: env.dialogBridge,
      });

      expect(result?.status).toBe(401);
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(0);
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(0);
      expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
    });

    it("blocks non-admin requests with 200 AUTH_FORBIDDEN, 0 service calls, 0 dialog calls, 0 activity", async () => {
      vi.clearAllMocks();
      const env = setupTestEnv(mockUserSession);
      const registry = assembleRoutes(env.sessionManager);

      const { result } = await dispatchAsAdmin(
        registry,
        "operations:get-app-settings",
        [],
        env,
      );

      expect(result?.status).toBe(200);
      expect((result?.body as { errorCode?: string })?.errorCode).toBe("AUTH_FORBIDDEN");
      expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(0);
      expect(env.dialogBridge.showDialog).toHaveBeenCalledTimes(0);
      expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("R2-3. Dialog 5 channels cancellation and full request shape verification (RN4, CN7, CN8)", () => {
    it("verifies 5 dialog channels return cancelled null when cancelled (RN4, CN7)", async () => {
      const dialogChannels: Array<{ channel: string; args: unknown[] }> = [
        { channel: "operations:select-directory", args: [] },
        { channel: "operations:select-migration-file", args: [] },
        { channel: "operations:select-spreadsheet-file", args: [] },
        { channel: "operations:select-document-template-file", args: ["schedule"] },
        {
          channel: "operations:preview-document-template",
          args: [{ templateType: "schedule", sourcePath: "C:/test/src.xlsx" }],
        },
      ];

      for (const { channel, args } of dialogChannels) {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const cancelledBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: true }),
        });

        const { result } = await dispatchAsAdmin(registry, channel, args, env, {
          dialogBridge: cancelledBridge,
        });

        expect(result?.status).toBe(200);
        expect(result?.body).toEqual({ ok: true, data: null });
        expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
      }
    });

    it("verifies 5 dialog channels request full options, signal identity, and return exact shapes (RN4, CN7)", async () => {
      // 1. select-directory
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const dirBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/dir" }),
        });
        const signal = new AbortController().signal;

        const { result } = await dispatchAsAdmin(
          registry,
          "operations:select-directory",
          [{ title: "사용자 폴더", defaultPath: "C:/sentinel/dir" }],
          env,
          { signal, dialogBridge: dirBridge },
        );

        expect(result?.body).toEqual({ ok: true, data: "C:/selected/dir" });
        expect(dirBridge.showDialog).toHaveBeenCalledTimes(1);
        expect(dirBridge.showDialog).toHaveBeenCalledWith(
          { operation: "openFolder", title: "사용자 폴더", defaultPath: "C:/sentinel/dir" },
          signal,
        );
      }

      // 2. select-migration-file (.json success)
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const migBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/backup.json" }),
        });
        const signal = new AbortController().signal;

        const { result } = await dispatchAsAdmin(
          registry,
          "operations:select-migration-file",
          [{ title: "DB 복원 파일", defaultPath: "C:/sentinel/mig" }],
          env,
          { signal, dialogBridge: migBridge },
        );

        expect(result?.body).toEqual({ ok: true, data: "C:/selected/backup.json" });
        expect(migBridge.showDialog).toHaveBeenCalledTimes(1);
        expect(migBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "openFile",
            title: "DB 복원 파일",
            defaultPath: "C:/sentinel/mig",
            filters: [{ name: "복원 파일", extensions: ["json", "accdb"] }],
          },
          signal,
        );
      }

      // 2b. select-migration-file default title fallback
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const migBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/backup.json" }),
        });
        const signal = new AbortController().signal;

        await dispatchAsAdmin(registry, "operations:select-migration-file", [], env, {
          signal,
          dialogBridge: migBridge,
        });

        expect(migBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "openFile",
            title: "복원 파일 선택",
            defaultPath: undefined,
            filters: [{ name: "복원 파일", extensions: ["json", "accdb"] }],
          },
          signal,
        );
      }

      // 3. select-spreadsheet-file
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const sheetBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/sheet.xlsx" }),
        });
        const signal = new AbortController().signal;

        const { result } = await dispatchAsAdmin(
          registry,
          "operations:select-spreadsheet-file",
          [{ title: "엑셀 파일", defaultPath: "C:/sentinel/sheet" }],
          env,
          { signal, dialogBridge: sheetBridge },
        );

        expect(result?.body).toEqual({
          ok: true,
          data: { fileName: "sheet.xlsx", filePath: "C:/selected/sheet.xlsx" },
        });
        expect(sheetBridge.showDialog).toHaveBeenCalledTimes(1);
        expect(sheetBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "openFile",
            title: "엑셀 파일",
            defaultPath: "C:/sentinel/sheet",
            filters: [{ name: "Excel Workbook", extensions: ["xlsx", "xlsm"] }],
          },
          signal,
        );
      }

      // 3b. select-spreadsheet-file default title fallback
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const sheetBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/sheet.xlsx" }),
        });
        const signal = new AbortController().signal;

        await dispatchAsAdmin(registry, "operations:select-spreadsheet-file", [], env, {
          signal,
          dialogBridge: sheetBridge,
        });

        expect(sheetBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "openFile",
            title: "Excel 파일 선택",
            defaultPath: undefined,
            filters: [{ name: "Excel Workbook", extensions: ["xlsx", "xlsm"] }],
          },
          signal,
        );
      }

      // 4. select-document-template-file (schedule)
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const tplBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/template.xlsx" }),
        });
        const signal = new AbortController().signal;

        const { result } = await dispatchAsAdmin(
          registry,
          "operations:select-document-template-file",
          ["schedule"],
          env,
          { signal, dialogBridge: tplBridge },
        );

        expect(result?.body).toEqual({
          ok: true,
          data: { fileName: "template.xlsx", filePath: "C:/selected/template.xlsx" },
        });
        expect(tplBridge.showDialog).toHaveBeenCalledTimes(1);
        expect(tplBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "openFile",
            title: "양식 파일 선택",
            filters: [{ name: "근무표 Excel 양식", extensions: ["xlsx", "xlsm"] }],
          },
          signal,
        );
      }

      // 4b. select-document-template-file (proposal filter distinction)
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const tplBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/proposal.xlsx" }),
        });
        const signal = new AbortController().signal;

        const { result } = await dispatchAsAdmin(
          registry,
          "operations:select-document-template-file",
          ["proposal"],
          env,
          { signal, dialogBridge: tplBridge },
        );

        expect(result?.body).toEqual({
          ok: true,
          data: { fileName: "proposal.xlsx", filePath: "C:/selected/proposal.xlsx" },
        });
        expect(tplBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "openFile",
            title: "양식 파일 선택",
            filters: [{ name: "Excel 양식 파일", extensions: ["xlsx", "xlsm"] }],
          },
          signal,
        );
      }

      // 5. preview-document-template
      {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const previewBridge = createMockDialogBridge({
          showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/preview/out.xlsx" }),
        });
        const signal = new AbortController().signal;
        const input = { templateType: "schedule", sourcePath: "C:/test/src.xlsx", versionLabel: "v2" };

        const { result } = await dispatchAsAdmin(
          registry,
          "operations:preview-document-template",
          [input],
          env,
          { signal, dialogBridge: previewBridge },
        );

        expect(result?.status).toBe(200);
        expect(result?.body).toEqual({ ok: true, data: { previewUrl: "http://preview" } });

        const expectedDefaultPath = path.resolve(
          "C:/exports",
          "template-previews",
          "schedule",
          "근무표_v2_preview.xlsx",
        );

        expect(previewBridge.showDialog).toHaveBeenCalledTimes(1);
        expect(previewBridge.showDialog).toHaveBeenCalledWith(
          {
            operation: "saveFile",
            title: "양식 미리보기 저장",
            defaultPath: expectedDefaultPath,
            filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
            showOverwriteConfirmation: true,
          },
          signal,
        );

        expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledTimes(1);
        expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledWith(input, {
          outputPath: "C:/preview/out.xlsx",
        });

        expect(env.accessLogSpy).toHaveBeenCalledTimes(1);
        const [firstArg] = env.accessLogSpy.mock.calls[0];
        expect(firstArg).toEqual({
          actionType: "template-preview",
          actionLabel: accessLogActionLabels["template-preview"],
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "근무표 양식 미리보기",
        });
      }
    });

    it("verifies select-migration-file rejects .xlsx selection with DATABASE_RESTORE_FILE_REQUIRED (RN4, CN8)", async () => {
      vi.clearAllMocks();
      const env = setupTestEnv();
      const registry = assembleRoutes(env.sessionManager);
      const invalidBridge = createMockDialogBridge({
        showDialog: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "C:/selected/invalid.xlsx" }),
      });

      const { result } = await dispatchAsAdmin(
        registry,
        "operations:select-migration-file",
        [],
        env,
        { dialogBridge: invalidBridge },
      );

      expect(result?.status).toBe(200);
      expect(result?.body).toEqual({
        ok: false,
        errorCode: "DATABASE_RESTORE_FILE_REQUIRED",
        message: "DB복구는 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 선택할 수 있습니다.",
      });
      expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("R2-4. dataDir 12 channels isolated propagation verification (RN5, CN9)", () => {
    it("matches dataDir literal channels with manifest usesDataDir channels exactly", () => {
      const dataDirContracts = CHANNEL_CONTRACTS.filter(
        (c) => c.group === "operations" && c.usesDataDir,
      );
      expect(dataDirContracts).toHaveLength(12);
      const manifestDataDirKeys = dataDirContracts.map((c) => c.channel).sort();
      expect(expectedDataDirChannels).toEqual(manifestDataDirKeys);
    });

    it("verifies sentinel dataDir is passed to all 12 usesDataDir channels in isolated runs", async () => {
      for (const channel of expectedDataDirChannels) {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);
        const args = validArgsMap[channel];

        const { result } = await dispatchAsAdmin(registry, channel, args, env);
        expect(result?.status).toBe(200);
        expect((result?.body as { ok: boolean })?.ok).toBe(true);

        // Check channel-specific isolated service invocation with sentinel dataDir
        switch (channel) {
          case "operations:get-app-settings":
            expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(1);
            expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:save-app-settings":
            expect(mocks.saveStoredAppSettings).toHaveBeenCalledTimes(1);
            expect(mocks.saveStoredAppSettings).toHaveBeenCalledWith(args[0], { userDataPath: env.dataDir });
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            expect(mocks.restartDatabaseBackupRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.restartDatabaseBackupRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:preview-database-migration-update":
            expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            expect(mocks.previewDatabaseMigrationUpdate).toHaveBeenCalledTimes(1);
            expect(mocks.previewDatabaseMigrationUpdate).toHaveBeenCalledWith({
              userDataPath: env.dataDir,
              migrationFilePath: "C:/selected/backup.json",
              selectedAccessTables: [],
            });
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:update-database-from-migration":
            expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            expect(mocks.runDatabaseMigrationUpdate).toHaveBeenCalledTimes(1);
            expect(mocks.runDatabaseMigrationUpdate).toHaveBeenCalledWith({
              userDataPath: env.dataDir,
              migrationFilePath: "C:/selected/backup.json",
              selectedAccessTables: [],
            });
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:run-database-backup-now":
            expect(mocks.runDatabaseBackupNow).toHaveBeenCalledTimes(1);
            expect(mocks.runDatabaseBackupNow).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:get-file-watch-status":
            expect(mocks.getFileWatchStatusSnapshot).toHaveBeenCalledTimes(1);
            expect(mocks.getFileWatchStatusSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:restart-file-watch":
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.restartFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:stop-file-watch":
            expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
            expect(mocks.stopFileWatchRuntime).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            break;
          case "operations:fetch-holiday-api-items":
            expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(1);
            expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            expect(mocks.fetchHolidayApiItems).toHaveBeenCalledTimes(1);
            expect(mocks.fetchHolidayApiItems).toHaveBeenCalledWith({
              baseUrl: "https://api.test/holidays",
              year: 2026,
            });
            break;
          case "operations:preview-document-template":
            expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledTimes(1);
            expect(mocks.getStoredAppSettingsSnapshot).toHaveBeenCalledWith({ userDataPath: env.dataDir });
            expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledTimes(1);
            expect(mocks.previewDocumentTemplateFile).toHaveBeenCalledWith(args[0], {
              outputPath: "C:/selected/preview.xlsx",
            });
            break;
          case "operations:save-document-template-version":
            expect(mocks.saveManagedDocumentTemplateVersion).toHaveBeenCalledTimes(1);
            expect(mocks.saveManagedDocumentTemplateVersion).toHaveBeenCalledWith(args[0], {
              userDataPath: env.dataDir,
            });
            break;
          case "operations:delete-document-template-version":
            expect(mocks.deleteManagedDocumentTemplateVersion).toHaveBeenCalledTimes(1);
            expect(mocks.deleteManagedDocumentTemplateVersion).toHaveBeenCalledWith("tpl-1", {
              userDataPath: env.dataDir,
            });
            break;
        }
      }
    });
  });

  describe("R2-5. Migration preview and update sequence and cleanup matrix (RN6, CN10)", () => {
    const migrationMatrix = [
      {
        channel: "operations:preview-database-migration-update",
        actionSpy: mocks.previewDatabaseMigrationUpdate,
        errorCode: "DATABASE_MIGRATION_PREVIEW_FAILED",
        activityType: "database-migration-preview",
        activityDetails: "DB 복원 미리보기",
      },
      {
        channel: "operations:update-database-from-migration",
        actionSpy: mocks.runDatabaseMigrationUpdate,
        errorCode: "DATABASE_MIGRATION_FAILED",
        activityType: "database-migration-update",
        activityDetails: "DB 복원 반영",
      },
    ] as const;

    for (const matrixItem of migrationMatrix) {
      it(`verifies success sequence stop -> action -> restart for ${matrixItem.channel}`, async () => {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);

        const order: string[] = [];
        mocks.stopFileWatchRuntime.mockImplementationOnce(async () => {
          order.push("stop");
        });
        matrixItem.actionSpy.mockImplementationOnce(async () => {
          order.push("action");
          return { ok: true };
        });
        mocks.restartFileWatchRuntime.mockImplementationOnce(async () => {
          order.push("restart");
        });

        const { result } = await dispatchAsAdmin(
          registry,
          matrixItem.channel,
          [{ migrationFilePath: "C:/selected/backup.json", selectedAccessTables: [] }],
          env,
        );

        expect(result?.status).toBe(200);
        expect((result?.body as { ok: boolean })?.ok).toBe(true);
        expect(order).toEqual(["stop", "action", "restart"]);
        expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
        expect(matrixItem.actionSpy).toHaveBeenCalledTimes(1);
        expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);

        expect(env.accessLogSpy).toHaveBeenCalledTimes(1);
        const [firstArg] = env.accessLogSpy.mock.calls[0];
        expect(firstArg).toEqual({
          actionType: matrixItem.activityType,
          actionLabel: accessLogActionLabels[matrixItem.activityType as keyof typeof accessLogActionLabels],
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: matrixItem.activityDetails,
        });
      });

      it(`verifies action failure rollback stop -> action -> restart and 0 activity for ${matrixItem.channel}`, async () => {
        vi.clearAllMocks();
        const env = setupTestEnv();
        const registry = assembleRoutes(env.sessionManager);

        const order: string[] = [];
        mocks.stopFileWatchRuntime.mockImplementationOnce(async () => {
          order.push("stop");
        });
        matrixItem.actionSpy.mockImplementationOnce(async () => {
          order.push("action");
          throw new Error("Migration corruption detected");
        });
        mocks.restartFileWatchRuntime.mockImplementationOnce(async () => {
          order.push("restart");
        });

        const { result } = await dispatchAsAdmin(
          registry,
          matrixItem.channel,
          [{ migrationFilePath: "C:/selected/backup.json", selectedAccessTables: [] }],
          env,
        );

        expect(result?.status).toBe(200);
        expect(result?.body).toEqual({
          ok: false,
          errorCode: matrixItem.errorCode,
          message: "Migration corruption detected",
        });
        expect(order).toEqual(["stop", "action", "restart"]);
        expect(mocks.stopFileWatchRuntime).toHaveBeenCalledTimes(1);
        expect(matrixItem.actionSpy).toHaveBeenCalledTimes(1);
        expect(mocks.restartFileWatchRuntime).toHaveBeenCalledTimes(1);
        expect(env.accessLogSpy).toHaveBeenCalledTimes(0);
      });
    }
  });
});
