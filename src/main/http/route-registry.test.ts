import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../shared/domain/model";
import type { DialogBridge } from "./api-types";
import { RouteRegistry } from "./route-registry";
import { SessionManager } from "./session";

const mockDialogBridge: DialogBridge = {
  showDialog: vi.fn(),
  dispose: vi.fn(),
};

describe("RouteRegistry", () => {
  it("rejects unknown channels and duplicate registration", () => {
    const sessionManager = new SessionManager();
    const registry = new RouteRegistry(sessionManager);

    expect(() => {
      registry.register("invalid:channel", async () => ({ ok: true, data: null }));
    }).toThrow(/Unknown channel/);

    registry.register("app:get-version", async () => "1.0.0");
    expect(() => {
      registry.register("app:get-version", async () => "2.0.0");
    }).toThrow(/Duplicate handler/);
  });

  it("enforces guards automatically during dispatch", async () => {
    let mockSession: AuthSession | null = null;
    const sessionManager = new SessionManager({
      authService: {
        signIn: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(() => ({ ok: true, data: mockSession })),
        getSessionWithRenewal: vi.fn(() => ({ ok: true, data: mockSession })),
        changePassword: vi.fn(),
      },
      randomId: () => "e".repeat(64),
    });

    const registry = new RouteRegistry(sessionManager);

    // 1. None guard channel
    registry.register("app:get-version", async () => "0.1.0");

    // 2. Session guard channel
    registry.register("access-logs:record", async () => ({ ok: true, data: null }));

    // 3. Admin guard channel
    registry.register("operations:get-app-settings", async () => ({ ok: true, data: {} }));

    const baseCtx = {
      headers: {},
      signal: new AbortController().signal,
      version: "0.1.0",
      dataDir: "C:/test",
      dialogBridge: mockDialogBridge,
    };

    // None guard passes without cookie
    const versionRes = await registry.dispatch("app:get-version", [], baseCtx);
    expect(versionRes).toEqual({ status: 200, body: "0.1.0" });

    // Session guard fails without cookie -> 401
    const unauthSessionRes = await registry.dispatch("access-logs:record", [{}], baseCtx);
    expect(unauthSessionRes?.status).toBe(401);

    // Register operator session in sessionManager
    const cookie = "sm_session=" + "e".repeat(64);
    mockSession = {
      userId: "u1",
      loginId: "op1",
      displayName: "운영자",
      role: "operator",
      passwordChangeRequired: false,
      issuedAt: "2026-09-13T00:00:00.000Z",
      expiresAt: "2026-09-13T08:00:00.000Z",
    };
    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set("e".repeat(64), {
      session: mockSession,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    // Session guard passes with operator cookie
    const authSessionRes = await registry.dispatch("access-logs:record", [{}], {
      ...baseCtx,
      cookie,
    });
    expect(authSessionRes?.status).toBe(200);

    // Admin guard fails with operator cookie -> 200 AUTH_FORBIDDEN
    const adminRes = await registry.dispatch("operations:get-app-settings", [], {
      ...baseCtx,
      cookie,
    });
    expect(adminRes?.status).toBe(200);
    expect((adminRes?.body as { errorCode?: string })?.errorCode).toBe("AUTH_FORBIDDEN");

    // Unregistered channel returns null
    const unreg = await registry.dispatch("operations:delete-user", [], baseCtx);
    expect(unreg).toBeNull();
  });
});
