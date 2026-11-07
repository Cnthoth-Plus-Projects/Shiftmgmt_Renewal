import { randomUUID } from "node:crypto";

import type {
  AuthPasswordChangeInput,
  BridgeResult,
  SignInInput
} from "../../shared/bridge/contracts";
import { AUTH_SESSION_DURATION_MS } from "../../shared/config/auth-session-policy";
import type { AuthSession } from "../../shared/domain/model";
import { isPasswordHashValid } from "./auth-password-service";
import { retireAuthBootstrapCredential } from "./auth-bootstrap-service";
import {
  changeStoredOperationAuthPassword,
  clearStoredOperationAuthFailures,
  findStoredOperationAuthByLoginId,
  findStoredOperationAuthByUserId,
  readStoredOperationAuthByUserId,
  recordStoredOperationAuthFailure
} from "./operations-storage-service";
import { getSqliteDatabase, getSqliteStorageContext } from "./sqlite-storage-service";

let currentSession: AuthSession | null = null;
let sessionIdentity: { database: ReturnType<typeof getSqliteDatabase>; passwordHash: string } | null = null;

const clearCurrentSession = () => {
  currentSession = null;
  sessionIdentity = null;
};

const matchesSessionUser = (
  user: ReturnType<typeof readStoredOperationAuthByUserId>,
  session: AuthSession,
  passwordHash: string
): user is NonNullable<ReturnType<typeof readStoredOperationAuthByUserId>> =>
  Boolean(user && user.status === "active" && user.role === session.role &&
    user.loginId === session.loginId && user.passwordHash === passwordHash &&
    user.mustChangePassword === session.passwordChangeRequired);

// Preview synchronously opens a temporary DB then reopens the unchanged live DB.
// Only that trusted operation may retain its session across a connection change.
export const preserveSessionForDatabasePreview = <T>(
  action: () => T,
  expectedSessionToken: string | undefined
): T => {
  const session = currentSession;
  const identity = sessionIdentity;
  const databasePath = getSqliteStorageContext()?.dbPath;
  try {
    return action();
  } finally {
    if (session && identity && expectedSessionToken && session.sessionToken === expectedSessionToken &&
        currentSession === session && sessionIdentity === identity && databasePath &&
        getSqliteStorageContext()?.dbPath === databasePath && getSqliteDatabase()) {
      const user = readStoredOperationAuthByUserId(session.userId);
      if (matchesSessionUser(user, session, identity.passwordHash)) {
        sessionIdentity = { ...identity, database: getSqliteDatabase() };
      }
    }
  }
};

const createSessionExpiration = (now: number) =>
  new Date(now + AUTH_SESSION_DURATION_MS).toISOString();

const buildInvalidCredentialsFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_INVALID_CREDENTIALS",
  message: "로그인 ID 또는 비밀번호가 올바르지 않습니다."
});

const buildAccountLockedFailure = (lockedUntil: string): BridgeResult<AuthSession> => {
  const remainingMs = Date.parse(lockedUntil) - Date.now();
  const remainingMinutes = Number.isNaN(remainingMs) ? 15 : Math.max(1, Math.ceil(remainingMs / 60000));

  return {
    ok: false,
    errorCode: "AUTH_ACCOUNT_LOCKED",
    message: `비밀번호를 여러 번 잘못 입력해 계정이 잠겼습니다. 약 ${remainingMinutes}분 후에 다시 시도해 주세요.`
  };
};

// 잠금 만료 시각이 아직 지나지 않았으면 그 값을 돌려준다(이미 지났거나 없으면 null).
const resolveActiveSignInLock = (lockedUntil: string | undefined, now: number): string | null => {
  if (!lockedUntil) {
    return null;
  }

  const lockedUntilMs = Date.parse(lockedUntil);

  return Number.isNaN(lockedUntilMs) || lockedUntilMs <= now ? null : lockedUntil;
};

const buildSessionRequiredFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_SESSION_REQUIRED",
  message: "로그인 세션이 필요합니다."
});

const buildCurrentPasswordFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_INVALID_CREDENTIALS",
  message: "현재 비밀번호가 올바르지 않습니다."
});

const buildPasswordReuseFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_PASSWORD_REUSED",
  message: "새 비밀번호는 현재 비밀번호와 달라야 합니다."
});

const buildPasswordPolicyFailure = (message: string): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_PASSWORD_POLICY_FAILED",
  message
});

const parseSessionExpiration = (session: AuthSession) => {
  const expiresAt = Date.parse(session.expiresAt);

  return Number.isNaN(expiresAt) ? null : expiresAt;
};

const resolveActiveSession = (input?: {
  now?: number;
  renew?: boolean;
}) => {
  if (!currentSession) {
    return null;
  }

  const now = input?.now ?? Date.now();
  const expiresAt = parseSessionExpiration(currentSession);

  if (expiresAt === null || expiresAt <= now) {
    clearCurrentSession();
    return null;
  }

  // A replacement/reopened database invalidates even otherwise identical restored credentials.
  if (!sessionIdentity?.database || sessionIdentity.database !== getSqliteDatabase()) {
    clearCurrentSession();
    return null;
  }
  const user = readStoredOperationAuthByUserId(currentSession.userId);
  if (!matchesSessionUser(user, currentSession, sessionIdentity.passwordHash)) {
    clearCurrentSession();
    return null;
  }

  if (currentSession.displayName !== user.displayName) {
    currentSession = { ...currentSession, displayName: user.displayName };
  }

  if (input?.renew) {
    currentSession = {
      ...currentSession,
      expiresAt: createSessionExpiration(now)
    };
  }

  return currentSession;
};

const createSession = (input: {
  userId: string;
  loginId: string;
  role: AuthSession["role"];
  displayName: string;
  passwordChangeRequired: boolean;
}): AuthSession => ({
  userId: input.userId,
  loginId: input.loginId,
  role: input.role,
  displayName: input.displayName,
  expiresAt: createSessionExpiration(Date.now()),
  sessionToken: randomUUID(),
  passwordChangeRequired: input.passwordChangeRequired
});

export const signIn = (input: SignInInput): BridgeResult<AuthSession> => {
  const user = findStoredOperationAuthByLoginId(input.loginId);

  // 반복 실패로 잠긴 계정은 비밀번호 검사 전에 차단한다(잠금 동안은 추측 시도 자체를 막음).
  if (user && user.status === "active" && user.passwordHash) {
    const activeLock = resolveActiveSignInLock(user.signInLockedUntil, Date.now());

    if (activeLock) {
      return buildAccountLockedFailure(activeLock);
    }
  }

  if (
    !user ||
    user.status !== "active" ||
    !user.passwordHash ||
    !isPasswordHashValid(input.password, user.passwordHash)
  ) {
    if (user && user.status === "active" && user.passwordHash) {
      recordStoredOperationAuthFailure(user.id);
    }

    return buildInvalidCredentialsFailure();
  }

  clearStoredOperationAuthFailures(user.id);

  currentSession = createSession({
    userId: user.id,
    loginId: user.loginId,
    role: user.role,
    displayName: user.displayName,
    passwordChangeRequired: user.mustChangePassword
  });
  sessionIdentity = { database: getSqliteDatabase(), passwordHash: user.passwordHash };

  return {
    ok: true,
    data: currentSession
  };
};

export const changePassword = (
  input: AuthPasswordChangeInput
): BridgeResult<AuthSession> => {
  const activeSession = resolveActiveSession();

  if (!activeSession) {
    return buildSessionRequiredFailure();
  }

  const user = findStoredOperationAuthByUserId(activeSession.userId);

  if (!user || user.status !== "active" || !user.passwordHash) {
    clearCurrentSession();
    return buildSessionRequiredFailure();
  }

  if (!isPasswordHashValid(input.currentPassword, user.passwordHash)) {
    return buildCurrentPasswordFailure();
  }

  if (input.currentPassword === input.nextPassword) {
    return buildPasswordReuseFailure();
  }

  try {
    const updatedUser = changeStoredOperationAuthPassword({
      userId: user.id,
      nextPassword: input.nextPassword,
      mustChangePassword: false
    });

    if (user.mustChangePassword) {
      try {
        retireAuthBootstrapCredential(getSqliteStorageContext() ?? {}, user.id);
      } catch (error) {
        console.error("Failed to retire bootstrap credential after password change.", error);
      }
    }

    currentSession = createSession({
      userId: updatedUser.id,
      loginId: updatedUser.loginId,
      role: updatedUser.role,
      displayName: updatedUser.displayName,
      passwordChangeRequired: false
    });
    sessionIdentity = { database: getSqliteDatabase(), passwordHash: updatedUser.passwordHash ?? "" };

    return {
      ok: true,
      data: currentSession
    };
  } catch (error) {
    return buildPasswordPolicyFailure(error instanceof Error ? error.message : String(error));
  }
};

export const signOut = (): BridgeResult<null> => {
  clearCurrentSession();

  return {
    ok: true,
    data: null
  };
};

export const getSession = (): BridgeResult<AuthSession | null> => ({
  ok: true,
  data: resolveActiveSession()
});

export const getSessionWithRenewal = (): BridgeResult<AuthSession | null> => ({
  ok: true,
  data: resolveActiveSession({
    renew: true
  })
});

export const resetAuthStateForTest = () => {
  clearCurrentSession();
};
