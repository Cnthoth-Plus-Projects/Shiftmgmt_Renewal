import { describe, expect, it, vi } from "vitest";
import { CORE_CHANNELS } from "../../../shared/bridge/channel-contracts";
import type { AuthSession } from "../../../shared/domain/model";
import type { DialogBridge } from "../api-types";
import { RouteRegistry } from "../route-registry";
import { registerCoreRoutes } from "./core-routes";
import { assembleRoutes } from "./index";
import { SessionManager } from "../session";

interface BridgeResponseShape {
  ok: boolean;
  data?: {
    enabled?: boolean;
    status?: string;
    currentVersion?: string;
    [key: string]: unknown;
  };
  errorCode?: string;
  message?: string;
}

describe("core-routes", () => {
  it("registerCoreRoutes registers exactly the 17 core channels independently", () => {
    const sessionManager = new SessionManager();
    const registry = new RouteRegistry(sessionManager);
    registerCoreRoutes(registry, sessionManager);

    expect(CORE_CHANNELS).toHaveLength(17);
    const registered = registry.getRegisteredChannels();
    expect(registered).toHaveLength(CORE_CHANNELS.length);
    expect(new Set(registered).size).toBe(CORE_CHANNELS.length);

    for (const coreChannel of CORE_CHANNELS) {
      expect(registry.has(coreChannel)).toBe(true);
    }
  });


  it("handles D5 update state channels and records activity only for check-for-update (R5, N6)", async () => {
    const mockSession: AuthSession = {
      userId: "u1",
      loginId: "op",
      displayName: "운영자",
      role: "operator",
      passwordChangeRequired: false,
      issuedAt: "2026-09-13T00:00:00.000Z",
      expiresAt: "2026-09-13T08:00:00.000Z",
    };

    const recorded: Array<{ actionType: string; details?: string }> = [];
    const sessionManager = new SessionManager({
      authService: {
        signIn: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(() => ({ ok: true, data: mockSession })),
        getSessionWithRenewal: vi.fn(() => ({ ok: true, data: mockSession })),
        changePassword: vi.fn(),
      },
      accessLogService: {
        recordAccessLog: (input) => {
          recorded.push({ actionType: input.actionType, details: input.details });
        },
      },
      randomId: () => "a".repeat(64),
    });

    const cookie = "sm_session=" + "a".repeat(64);
    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set("a".repeat(64), {
      session: mockSession,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const registry = assembleRoutes(sessionManager);

    const baseCtx = {
      headers: {},
      cookie,
      signal: new AbortController().signal,
      version: "0.1.0",
      dataDir: "C:/test-data",
      dialogBridge: { showDialog: vi.fn(), dispose: vi.fn() },
    };

    // 1. getUpdateState
    const getStateRes = await registry.dispatch("app:get-update-state", [], baseCtx);
    expect(getStateRes?.status).toBe(200);
    const getStateBody = getStateRes?.body as BridgeResponseShape;
    expect(getStateBody.ok).toBe(true);
    expect(getStateBody.data?.enabled).toBe(false);
    expect(getStateBody.data?.status).toBe("idle");
    expect(getStateBody.data?.currentVersion).toBe("0.1.0");

    // 2. checkForAppUpdate -> records 1 activity
    const checkRes = await registry.dispatch("app:check-for-update", [], baseCtx);
    expect(checkRes?.status).toBe(200);
    const checkBody = checkRes?.body as BridgeResponseShape;
    expect(checkBody.ok).toBe(true);
    expect(checkBody.data?.enabled).toBe(false);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actionType).toBe("app-update-check");

    // 3. downloadAppUpdate -> records 0 activity
    const downloadRes = await registry.dispatch("app:download-update", [], baseCtx);
    expect(downloadRes?.status).toBe(200);
    expect(recorded).toHaveLength(1);

    // 4. installDownloadedUpdate -> records 0 activity
    const installRes = await registry.dispatch("app:install-update", [], baseCtx);
    expect(installRes?.status).toBe(200);
    expect(recorded).toHaveLength(1);

    // 5. dismissUpdateNotice -> records 0 activity
    const dismissRes = await registry.dispatch("app:dismiss-update-notice", ["0.1.0"], baseCtx);
    expect(dismissRes?.status).toBe(200);
    expect(recorded).toHaveLength(1);
  });

  it("handles D6 dashboard export cancel and unsupported failure (R6, N6)", async () => {
    const mockSession: AuthSession = {
      userId: "u1",
      loginId: "op",
      displayName: "운영자",
      role: "operator",
      passwordChangeRequired: false,
      issuedAt: "2026-09-13T00:00:00.000Z",
      expiresAt: "2026-09-13T08:00:00.000Z",
    };

    const recorded: Array<{ actionType: string }> = [];
    const sessionManager = new SessionManager({
      authService: {
        signIn: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(() => ({ ok: true, data: mockSession })),
        getSessionWithRenewal: vi.fn(() => ({ ok: true, data: mockSession })),
        changePassword: vi.fn(),
      },
      accessLogService: {
        recordAccessLog: (input) => {
          recorded.push({ actionType: input.actionType });
        },
      },
      randomId: () => "f".repeat(64),
    });

    const cookie = "sm_session=" + "f".repeat(64);
    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set("f".repeat(64), {
      session: mockSession,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const registry = assembleRoutes(sessionManager);

    let dialogCancelled = true;
    const mockDialogBridge: DialogBridge = {
      showDialog: vi.fn(async () => {
        if (dialogCancelled) {
          return { ok: true, cancelled: true };
        }
        return { ok: true, cancelled: false, path: "C:/exports/chart.xlsx" };
      }),
      dispose: vi.fn(),
    };

    const baseCtx = {
      headers: {},
      cookie,
      signal: new AbortController().signal,
      version: "0.1.0",
      dataDir: "C:/test-data",
      dialogBridge: mockDialogBridge,
    };

    // 1. Chart export cancelled -> 0 activity
    dialogCancelled = true;
    const cancelRes = await registry.dispatch(
      "dashboard:export-chart-data",
      [{ chartKey: "k", chartTitle: "t", outputFormat: "xlsx", columns: [{ key: "k", header: "h" }], rows: [] }],
      baseCtx,
    );
    expect(cancelRes?.status).toBe(200);
    const cancelBody = cancelRes?.body as BridgeResponseShape;
    expect(cancelBody.ok).toBe(false);
    expect(cancelBody.errorCode).toBe("EXPORT_CANCELLED");
    expect(recorded).toHaveLength(0);

    // 2. Chart export selected with invalid columns (failure) -> 0 activity
    dialogCancelled = false;
    const failRes = await registry.dispatch(
      "dashboard:export-chart-data",
      [{ chartKey: "k", chartTitle: "t", outputFormat: "xlsx", columns: [], rows: [] }],
      baseCtx,
    );
    expect(failRes?.status).toBe(200);
    const failBody = failRes?.body as BridgeResponseShape;
    expect(failBody.ok).toBe(false);
    expect(failBody.errorCode).toBe("DASHBOARD_CHART_EXPORT_FAILED");
    expect(recorded).toHaveLength(0);

    // 3. Chart export selected valid (success) -> exactly 1 activity
    const successRes = await registry.dispatch(
      "dashboard:export-chart-data",
      [
        {
          chartKey: "k",
          chartTitle: "차트 타이틀",
          sheetName: "차트",
          outputFormat: "xlsx",
          filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
          columns: [{ key: "k", header: "h" }],
          rows: []
        }
      ],
      baseCtx,
    );
    expect(successRes?.status).toBe(200);
    const successBody = successRes?.body as BridgeResponseShape;
    expect(successBody.ok).toBe(true);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actionType).toBe("dashboard-export");

    // 4. Report export cancelled -> activity stays 1
    dialogCancelled = true;
    const reportCancelRes = await registry.dispatch(
      "dashboard:export-report",
      [{ title: "r", outputFormat: "xlsx", filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" }, sections: [] }],
      baseCtx,
    );
    expect(reportCancelRes?.status).toBe(200);
    const reportCancelBody = reportCancelRes?.body as BridgeResponseShape;
    expect(reportCancelBody.errorCode).toBe("EXPORT_CANCELLED");
    expect(recorded).toHaveLength(1);

    // 5. Report export selected with empty sections (failure) -> activity stays 1
    dialogCancelled = false;
    const reportFailRes = await registry.dispatch(
      "dashboard:export-report",
      [{ title: "r", outputFormat: "xlsx", filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" }, sections: [] }],
      baseCtx,
    );
    expect(reportFailRes?.status).toBe(200);
    const reportFailBody = reportFailRes?.body as BridgeResponseShape;
    expect(reportFailBody.errorCode).toBe("DASHBOARD_REPORT_EXPORT_FAILED");
    expect(recorded).toHaveLength(1);

    // 6. Report export selected valid (success) -> activity becomes 2
    const reportSuccessRes = await registry.dispatch(
      "dashboard:export-report",
      [
        {
          title: "보고서 타이틀",
          outputFormat: "xlsx",
          filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
          sections: [
            {
              sectionKey: "s",
              chartTitle: "섹션1",
              sheetName: "섹션1",
              columns: [{ key: "c", header: "h" }],
              rows: []
            }
          ]
        }
      ],
      baseCtx,
    );
    expect(reportSuccessRes?.status).toBe(200);
    const reportSuccessBody = reportSuccessRes?.body as BridgeResponseShape;
    expect(reportSuccessBody.ok).toBe(true);
    expect(recorded).toHaveLength(2);
    expect(recorded[1].actionType).toBe("dashboard-export");
  });
});
