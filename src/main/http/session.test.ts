import { describe, expect, it, vi } from "vitest";
import type { AuthPasswordChangeInput, BridgeResult, SignInInput } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import {
  createClearCookieHeader,
  createSetCookieHeader,
  parseSessionCookie,
  SessionManager,
} from "./session";

const createMockSession = (overrides?: Partial<AuthSession>): AuthSession => ({
  userId: "user-1",
  loginId: "planner1",
  displayName: "기획자",
  role: "planner",
  passwordChangeRequired: false,
  issuedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-13T08:00:00.000Z",
  ...overrides,
});

describe("session cookie helpers", () => {
  it("parses valid 64-character hex session cookie", () => {
    const hex = "a".repeat(64);
    expect(parseSessionCookie(`sm_session=${hex}`)).toBe(hex);
    expect(parseSessionCookie(`other=123; sm_session=${hex}; foo=bar`)).toBe(hex);
    expect(parseSessionCookie(`sm_session=${hex.toUpperCase()}`)).toBe(hex.toLowerCase());
  });

  it("rejects invalid session cookies", () => {
    expect(parseSessionCookie(undefined)).toBeNull();
    expect(parseSessionCookie("")).toBeNull();
    expect(parseSessionCookie("sm_session=")).toBeNull();
    expect(parseSessionCookie(`sm_session=${"a".repeat(63)}`)).toBeNull();
    expect(parseSessionCookie(`sm_session=${"g".repeat(64)}`)).toBeNull();
    expect(parseSessionCookie(`other_session=${"a".repeat(64)}`)).toBeNull();
  });

  it("creates set-cookie and clear-cookie headers", () => {
    const hex = "b".repeat(64);
    expect(createSetCookieHeader(hex)).toBe(
      `sm_session=${hex}; HttpOnly; SameSite=Strict; Path=/`,
    );
    expect(createClearCookieHeader()).toBe(
      "sm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
  });
});

describe("SessionManager", () => {
  it("manages sign-in, renewal, and single active session", () => {
    let globalSession: AuthSession | null = null;
    const loggedActivities: Array<{ actionType: string; details?: string }> = [];

    const mockAuthService = {
      signIn: vi.fn((input: SignInInput): BridgeResult<AuthSession> => {
        if (input.password === "secret") {
          globalSession = createMockSession({ loginId: input.loginId });
          return { ok: true, data: globalSession };
        }
        return { ok: false, errorCode: "AUTH_INVALID_CREDENTIALS", message: "실패" };
      }),
      signOut: vi.fn(() => {
        globalSession = null;
        return { ok: true, data: null };
      }),
      getSession: vi.fn(() => ({ ok: true, data: globalSession })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: globalSession })),
      changePassword: vi.fn(),
    };

    const mockAccessLogService = {
      recordAccessLog: vi.fn((input) => {
        loggedActivities.push({ actionType: input.actionType, details: input.details });
      }),
    };

    let counter = 0;
    const sessionManager = new SessionManager({
      authService: mockAuthService,
      accessLogService: mockAccessLogService,
      randomId: () => (++counter).toString(16).padStart(64, "0"),
    });

    // 1. Sign in failure does not affect store
    const failResult = sessionManager.handleSignIn({ loginId: "test", password: "wrong" });
    expect(failResult.result.ok).toBe(false);
    expect(failResult.setCookie).toBeUndefined();
    expect(sessionManager.getMapSize()).toBe(0);
    expect(loggedActivities.some((a) => a.actionType === "sign-in-failed")).toBe(true);

    // 2. Sign in success issues cookie and stores session
    const successResult = sessionManager.handleSignIn({ loginId: "test", password: "secret" });
    expect(successResult.result.ok).toBe(true);
    const cookie1 = successResult.setCookie;
    expect(cookie1).toBeDefined();
    expect(sessionManager.getMapSize()).toBe(1);

    // 3. Operational session lookup succeeds
    const operational = sessionManager.requireOperationalSession(cookie1);
    expect(operational.ok).toBe(true);
    if (operational.ok) {
      expect(operational.session.loginId).toBe("test");
    }

    // 4. Second sign-in clears first session (N4)
    const secondResult = sessionManager.handleSignIn({ loginId: "test2", password: "secret" });
    expect(secondResult.result.ok).toBe(true);
    const cookie2 = secondResult.setCookie;
    expect(cookie2).not.toBe(cookie1);
    expect(sessionManager.getMapSize()).toBe(1);

    // First cookie is now invalid (401)
    const oldLookup = sessionManager.requireOperationalSession(cookie1);
    expect(oldLookup.ok).toBe(false);
    if (!oldLookup.ok) {
      expect(oldLookup.status).toBe(401);
      expect(oldLookup.body.errorCode).toBe("AUTH_SESSION_REQUIRED");
    }

    // Old cookie sign-out is a success no-op and does not clear session2
    const oldSignOut = sessionManager.handleSignOut(cookie1);
    expect(oldSignOut.result.ok).toBe(true);
    expect(sessionManager.getMapSize()).toBe(1);
    expect(sessionManager.requireOperationalSession(cookie2).ok).toBe(true);

    // Second cookie sign-out clears active session
    const secondSignOut = sessionManager.handleSignOut(cookie2);
    expect(secondSignOut.result.ok).toBe(true);
    expect(sessionManager.getMapSize()).toBe(0);
  });

  it("handles passwordChangeRequired session (N3)", () => {
    const sessionWithMustChange = createMockSession({ passwordChangeRequired: true });
    const mockAuthService = {
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ ok: true, data: sessionWithMustChange })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: sessionWithMustChange })),
      changePassword: vi.fn((_input: AuthPasswordChangeInput): BridgeResult<AuthSession> => ({
        ok: true,
        data: { ...sessionWithMustChange, passwordChangeRequired: false },
      })),
    };

    const sessionManager = new SessionManager({
      authService: mockAuthService,
      randomId: () => "c".repeat(64),
    });

    // Manually register a session entry
    const cookie = createSetCookieHeader("c".repeat(64));
    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set("c".repeat(64), {
      session: sessionWithMustChange,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    // Normal operational guard fails with status 200 and AUTH_PASSWORD_CHANGE_REQUIRED
    const op = sessionManager.requireOperationalSession(cookie);
    expect(op.ok).toBe(false);
    if (!op.ok) {
      expect(op.status).toBe(200);
      expect(op.body.errorCode).toBe("AUTH_PASSWORD_CHANGE_REQUIRED");
    }

    // Authenticated guard succeeds so changePassword can proceed
    const auth = sessionManager.requireAuthenticatedSession(cookie);
    expect(auth.ok).toBe(true);

    // Without cookie, changePassword fails with 401
    const unauthChange = sessionManager.handleChangePassword({
      currentPassword: "old",
      nextPassword: "new",
    });
    expect(unauthChange.status).toBe(401);

    // With cookie, changePassword succeeds
    const changeRes = sessionManager.handleChangePassword(
      { currentPassword: "old", nextPassword: "new" },
      cookie,
    );
    expect(changeRes.status).toBe(200);
    expect(changeRes.result.ok).toBe(true);
  });

  it("handles role permissions (N5)", () => {
    const operatorSession = createMockSession({ role: "operator" });
    const mockAuthService = {
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ ok: true, data: operatorSession })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: operatorSession })),
      changePassword: vi.fn(),
    };

    const sessionManager = new SessionManager({
      authService: mockAuthService,
      randomId: () => "d".repeat(64),
    });

    const cookie = createSetCookieHeader("d".repeat(64));
    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set("d".repeat(64), {
      session: operatorSession,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    // Operator accessing admin role fails with HTTP 200 + AUTH_FORBIDDEN
    const adminCheck = sessionManager.requireRoleSession("admin", cookie);
    expect(adminCheck.ok).toBe(false);
    if (!adminCheck.ok) {
      expect(adminCheck.status).toBe(200);
      expect(adminCheck.body.errorCode).toBe("AUTH_FORBIDDEN");
    }

    // Operator accessing operator role succeeds
    const opCheck = sessionManager.requireRoleSession("operator", cookie);
    expect(opCheck.ok).toBe(true);
  });

  it("A31-01: handleGetSession validates session freshness, identity, and prunes stale map entries", () => {
    let globalSession: AuthSession | null = createMockSession({
      userId: "u-1",
      sessionToken: "tok-1",
    });

    const mockAuthService = {
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ ok: true, data: globalSession })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: globalSession })),
      changePassword: vi.fn(),
    };

    const sessionManager = new SessionManager({
      authService: mockAuthService,
      randomId: () => "e".repeat(64),
    });

    const cookieHex = "e".repeat(64);
    const cookieHeader = createSetCookieHeader(cookieHex);

    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set(cookieHex, {
      session: globalSession,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    expect(sessionManager.getMapSize()).toBe(1);

    // 1. 유효한 세션 조회: authService.getSession()과 일치 -> 세션 반환
    const validLookup = sessionManager.handleGetSession(cookieHeader);
    expect(validLookup.ok).toBe(true);
    expect(validLookup.data?.userId).toBe("u-1");
    expect(sessionManager.getMapSize()).toBe(1);

    // 2. 만료된 세션: authService.getSession()이 null 반환 -> null 반환 및 맵에서 제거
    globalSession = null;
    const expiredLookup = sessionManager.handleGetSession(cookieHeader);
    expect(expiredLookup.ok).toBe(true);
    expect(expiredLookup.data).toBeNull();
    expect(sessionManager.getMapSize()).toBe(0);

    // 3. 다른 토큰/다른 사용자 세션: 맵의 정보와 authService의 activeSession이 불일치 -> null 및 맵 제거
    globalSession = createMockSession({ userId: "u-2", sessionToken: "tok-2" });
    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set(cookieHex, {
      session: createMockSession({ userId: "u-1", sessionToken: "tok-1" }),
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    expect(sessionManager.getMapSize()).toBe(1);

    const mismatchedLookup = sessionManager.handleGetSession(cookieHeader);
    expect(mismatchedLookup.ok).toBe(true);
    expect(mismatchedLookup.data).toBeNull();
    expect(sessionManager.getMapSize()).toBe(0);

    // 4. 비밀번호 변경 후 갱신된 세션(동일 userId/새 sessionToken):
    globalSession = createMockSession({
      userId: "u-3",
      sessionToken: "tok-old",
      passwordChangeRequired: true,
    });
    mockAuthService.changePassword = vi.fn((_input: AuthPasswordChangeInput): BridgeResult<AuthSession> => {
      globalSession = createMockSession({
        userId: "u-3",
        sessionToken: "tok-new",
        passwordChangeRequired: false,
      });
      return { ok: true, data: globalSession };
    });

    (sessionManager as unknown as { sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }> }).sessionMap.set(cookieHex, {
      session: globalSession,
      issuedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const changeRes = sessionManager.handleChangePassword(
      { currentPassword: "old", nextPassword: "new" },
      cookieHeader,
    );
    expect(changeRes.result.ok).toBe(true);
    expect(changeRes.result.data.sessionToken).toBe("tok-new");

    const afterChangeLookup = sessionManager.handleGetSession(cookieHeader);
    expect(afterChangeLookup.ok).toBe(true);
    expect(afterChangeLookup.data?.sessionToken).toBe("tok-new");
    expect(afterChangeLookup.data?.passwordChangeRequired).toBe(false);
    expect(sessionManager.getMapSize()).toBe(1);
  });
});
