import { randomBytes } from "node:crypto";
import type {
  AuthPasswordChangeInput,
  BridgeFailure,
  BridgeResult,
  SignInInput,
} from "../../shared/bridge/contracts";
import type { AccessLogActionType } from "../../shared/domain/access-log";
import { accessLogActionLabels } from "../../shared/domain/access-log";
import {
  getRoleLabel,
  hasRequiredRole,
} from "../../shared/domain/authorization";
import type { AuthSession, UserRole } from "../../shared/domain/model";
import { recordAccessLog } from "../services/access-log-service";
import {
  changePassword,
  getSession,
  getSessionWithRenewal,
  resetAuthStateForTest,
  signIn,
  signOut,
} from "../services/auth-service";
import { findStoredOperationAuthByLoginId } from "../services/operations-storage-service";

export const SESSION_COOKIE_NAME = "sm_session";

export const parseSessionCookie = (cookieHeader?: string): string | null => {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return null;
  }

  const match = cookieHeader.match(/(?:^|;\s*)sm_session=([0-9a-fA-F]{64})(?:;|\s*$)/);
  return match ? match[1].toLowerCase() : null;
};

export const createSetCookieHeader = (sessionId: string): string =>
  `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/`;

export const createClearCookieHeader = (): string =>
  `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

export interface SessionEntry {
  session: AuthSession;
  issuedAt: number;
  lastSeenAt: number;
}

export interface SessionAuthService {
  signIn: (input: SignInInput) => BridgeResult<AuthSession>;
  signOut: () => BridgeResult<null>;
  getSession: () => BridgeResult<AuthSession | null>;
  getSessionWithRenewal: () => BridgeResult<AuthSession | null>;
  changePassword: (input: AuthPasswordChangeInput) => BridgeResult<AuthSession>;
  resetAuthStateForTest?: () => void;
}

export interface SessionAccessLogService {
  recordAccessLog: (
    input: {
      actionType: AccessLogActionType;
      actionLabel: string;
      routeKey?: string;
      routeLabel?: string;
      details?: string;
    },
    session: Pick<AuthSession, "userId" | "loginId" | "displayName" | "role">,
  ) => void;
}

export interface SessionManagerOptions {
  authService?: SessionAuthService;
  accessLogService?: SessionAccessLogService;
  findUserByLoginId?: (loginId: string) => { id: string; displayName: string; role: UserRole } | null;
  randomId?: () => string;
  now?: () => number;
}

export class SessionManager {
  private readonly sessionMap = new Map<string, SessionEntry>();
  private readonly authService: SessionAuthService;
  private readonly accessLogService: SessionAccessLogService;
  private readonly findUserByLoginId: (loginId: string) => { id: string; displayName: string; role: UserRole } | null;
  private readonly randomId: () => string;
  private readonly now: () => number;

  constructor(options: SessionManagerOptions = {}) {
    this.authService = options.authService ?? {
      signIn,
      signOut,
      getSession,
      getSessionWithRenewal,
      changePassword,
      resetAuthStateForTest,
    };
    this.accessLogService = options.accessLogService ?? { recordAccessLog };
    this.findUserByLoginId = options.findUserByLoginId ?? findStoredOperationAuthByLoginId;
    this.randomId = options.randomId ?? (() => randomBytes(32).toString("hex"));
    this.now = options.now ?? (() => Date.now());
  }

  public getMapSize(): number {
    return this.sessionMap.size;
  }

  public clear(): void {
    this.sessionMap.clear();
    this.authService.signOut();
    if (this.authService.resetAuthStateForTest) {
      this.authService.resetAuthStateForTest();
    }
  }

  public resolveSession(cookieHeader?: string): AuthSession | null {
    const cookieId = parseSessionCookie(cookieHeader);
    if (!cookieId || !this.sessionMap.has(cookieId)) {
      return null;
    }

    const renewalResult = this.authService.getSessionWithRenewal();
    const entry = this.sessionMap.get(cookieId)!;
    if (!renewalResult.ok || !renewalResult.data ||
        renewalResult.data.userId !== entry.session.userId ||
        renewalResult.data.sessionToken !== entry.session.sessionToken) {
      this.sessionMap.delete(cookieId);
      return null;
    }

    entry.session = renewalResult.data;
    entry.lastSeenAt = this.now();
    return entry.session;
  }

  public requireAuthenticatedSession(
    cookieHeader?: string,
  ): { ok: true; session: AuthSession } | { ok: false; status: 401; body: BridgeFailure } {
    const session = this.resolveSession(cookieHeader);
    if (!session) {
      return {
        ok: false,
        status: 401,
        body: {
          ok: false,
          errorCode: "AUTH_SESSION_REQUIRED",
          message: "로그인 세션이 필요합니다.",
        },
      };
    }
    return { ok: true, session };
  }

  public requireOperationalSession(
    cookieHeader?: string,
  ):
    | { ok: true; session: AuthSession }
    | { ok: false; status: 401 | 200; body: BridgeFailure } {
    const authenticated = this.requireAuthenticatedSession(cookieHeader);
    if (!authenticated.ok) {
      return authenticated;
    }

    if (authenticated.session.passwordChangeRequired) {
      return {
        ok: false,
        status: 200,
        body: {
          ok: false,
          errorCode: "AUTH_PASSWORD_CHANGE_REQUIRED",
          message: "비밀번호 변경이 필요합니다.",
        },
      };
    }

    return authenticated;
  }

  public requireRoleSession(
    requiredRole: UserRole,
    cookieHeader?: string,
  ):
    | { ok: true; session: AuthSession }
    | { ok: false; status: 401 | 200; body: BridgeFailure } {
    const operational = this.requireOperationalSession(cookieHeader);
    if (!operational.ok) {
      return operational;
    }

    if (!hasRequiredRole(operational.session.role, requiredRole)) {
      return {
        ok: false,
        status: 200,
        body: {
          ok: false,
          errorCode: "AUTH_FORBIDDEN",
          message: `${getRoleLabel(requiredRole)} 권한이 필요합니다. (현재 권한: ${getRoleLabel(operational.session.role)})`,
        },
      };
    }

    return operational;
  }

  public handleSignIn(input: SignInInput): {
    result: BridgeResult<AuthSession>;
    setCookie?: string;
  } {
    const result = this.authService.signIn(input);
    const normalizedLoginId = String(input.loginId ?? "").trim();

    if (result.ok) {
      this.sessionMap.clear();
      const id = this.randomId();
      this.sessionMap.set(id, {
        session: result.data,
        issuedAt: this.now(),
        lastSeenAt: this.now(),
      });

      this.recordActivity({
        actionType: "sign-in",
        details: `${result.data.displayName} 계정 로그인`,
        session: result.data,
      });

      return {
        result,
        setCookie: createSetCookieHeader(id),
      };
    }

    try {
      const attemptedUser = this.findUserByLoginId(normalizedLoginId);
      this.accessLogService.recordAccessLog(
        {
          actionType: "sign-in-failed",
          actionLabel: accessLogActionLabels["sign-in-failed"],
          details:
            normalizedLoginId.length > 0
              ? `${normalizedLoginId} 로그인 실패 (${result.errorCode})`
              : `빈 로그인 ID 로그인 실패 (${result.errorCode})`,
        },
        {
          userId: attemptedUser?.id ?? `auth-failed:${normalizedLoginId || "unknown"}`,
          loginId: normalizedLoginId || "(blank)",
          displayName: attemptedUser?.displayName ?? "미인증 사용자",
          role: attemptedUser?.role ?? "operator",
        },
      );
    } catch {
      // Ignore auth failure logging errors
    }

    return { result };
  }

  public handleSignOut(cookieHeader?: string): {
    result: BridgeResult<null>;
    setCookie: string;
  } {
    const cookieId = parseSessionCookie(cookieHeader);
    if (cookieId && this.sessionMap.has(cookieId)) {
      const entry = this.sessionMap.get(cookieId)!;
      this.sessionMap.delete(cookieId);
      this.authService.signOut();

      this.recordActivity({
        actionType: "sign-out",
        details: `${entry.session.displayName} 계정 로그아웃`,
        session: entry.session,
      });
    }

    return {
      result: { ok: true, data: null },
      setCookie: createClearCookieHeader(),
    };
  }

  public handleGetSession(cookieHeader?: string): BridgeResult<AuthSession | null> {
    const cookieId = parseSessionCookie(cookieHeader);
    if (!cookieId || !this.sessionMap.has(cookieId)) {
      return { ok: true, data: null };
    }

    const entry = this.sessionMap.get(cookieId)!;
    const activeResult = this.authService.getSession();
    const activeSession = activeResult.ok ? activeResult.data : null;

    if (
      !activeSession ||
      activeSession.userId !== entry.session.userId ||
      activeSession.sessionToken !== entry.session.sessionToken
    ) {
      this.sessionMap.delete(cookieId);
      return { ok: true, data: null };
    }

    return { ok: true, data: activeSession };
  }

  public handleChangePassword(
    input: AuthPasswordChangeInput,
    cookieHeader?: string,
  ): {
    result: BridgeResult<AuthSession>;
    status: number;
  } {
    const authenticated = this.requireAuthenticatedSession(cookieHeader);
    if (!authenticated.ok) {
      return {
        result: authenticated.body,
        status: authenticated.status,
      };
    }

    const result = this.authService.changePassword(input);
    if (result.ok) {
      const cookieId = parseSessionCookie(cookieHeader);
      if (cookieId && this.sessionMap.has(cookieId)) {
        this.sessionMap.get(cookieId)!.session = result.data;
      }

      this.recordActivity({
        actionType: "password-change",
        details: `${result.data.displayName} 계정 비밀번호 변경`,
        session: result.data,
      });
    }

    return {
      result,
      status: 200,
    };
  }

  public recordActivity(input: {
    actionType: AccessLogActionType;
    routeKey?: string;
    routeLabel?: string;
    details?: string;
    session?: AuthSession | null;
  }): void {
    const session = input.session ?? null;
    if (!session) {
      return;
    }

    try {
      this.accessLogService.recordAccessLog(
        {
          actionType: input.actionType,
          actionLabel: accessLogActionLabels[input.actionType],
          routeKey: input.routeKey,
          routeLabel: input.routeLabel,
          details: input.details,
        },
        session,
      );
    } catch {
      // Ignore logging failures
    }
  }

  public recordSuccessfulActivity<T extends { ok: boolean }>(
    result: T,
    input: {
      actionType: AccessLogActionType;
      routeKey?: string;
      routeLabel?: string;
      details?: string;
      session?: AuthSession | null;
    },
  ): T {
    if (result.ok) {
      this.recordActivity(input);
    }
    return result;
  }
}
