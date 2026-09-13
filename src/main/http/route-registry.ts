import type { ChannelContractMeta } from "../../shared/bridge/channel-contracts";
import { getChannelContract } from "../../shared/bridge/channel-contracts";
import {
  getRequiredRoleForAction,
  getRequiredRoleForRoute,
} from "../../shared/domain/authorization";
import type { AuthSession } from "../../shared/domain/model";
import type { AccessLogActionType } from "../../shared/domain/access-log";
import type { DispatchResult, RequestContext, RouteHandler } from "./api-types";
import type { SessionManager } from "./session";

export class RouteRegistry {
  private readonly handlers = new Map<
    string,
    { meta: ChannelContractMeta; handler: RouteHandler }
  >();
  private readonly sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  public register(channel: string, handler: RouteHandler): void {
    const meta = getChannelContract(channel);
    if (!meta) {
      throw new Error(`Unknown channel '${channel}'. Not found in channel contracts.`);
    }
    if (this.handlers.has(channel)) {
      throw new Error(`Duplicate handler registration for channel '${channel}'.`);
    }
    this.handlers.set(channel, { meta, handler });
  }

  public has(channel: string): boolean {
    return this.handlers.has(channel);
  }

  public getRegisteredChannels(): readonly string[] {
    return Array.from(this.handlers.keys());
  }

  public async dispatch(
    channel: string,
    args: unknown[],
    baseContext: Omit<RequestContext, "meta" | "session" | "recordActivity">,
  ): Promise<DispatchResult | null> {
    const registration = this.handlers.get(channel);
    if (!registration) {
      return null;
    }

    const { meta, handler } = registration;
    const cookieHeader = baseContext.cookie;
    let activeSession: AuthSession | null = null;

    // HTTP 전환 예외: auth:change-password
    if (channel === "auth:change-password") {
      const authResult = this.sessionManager.requireAuthenticatedSession(cookieHeader);
      if (!authResult.ok) {
        return {
          status: authResult.status,
          body: authResult.body,
        };
      }
      activeSession = authResult.session;
    } else {
      switch (meta.guard) {
        case "none": {
          activeSession = this.sessionManager.resolveSession(cookieHeader);
          break;
        }
        case "session": {
          const guardResult = this.sessionManager.requireOperationalSession(cookieHeader);
          if (!guardResult.ok) {
            return {
              status: guardResult.status,
              body: guardResult.body,
            };
          }
          activeSession = guardResult.session;
          break;
        }
        case "action": {
          if (!meta.actionPermission) {
            throw new Error(`Channel '${channel}' has guard 'action' but no actionPermission.`);
          }
          const requiredRole = getRequiredRoleForAction(meta.actionPermission);
          const guardResult = this.sessionManager.requireRoleSession(requiredRole, cookieHeader);
          if (!guardResult.ok) {
            return {
              status: guardResult.status,
              body: guardResult.body,
            };
          }
          activeSession = guardResult.session;
          break;
        }
        case "admin": {
          const guardResult = this.sessionManager.requireRoleSession("admin", cookieHeader);
          if (!guardResult.ok) {
            return {
              status: guardResult.status,
              body: guardResult.body,
            };
          }
          activeSession = guardResult.session;
          break;
        }
        case "accessHistory": {
          const requiredRole = getRequiredRoleForRoute("access-history");
          const guardResult = this.sessionManager.requireRoleSession(requiredRole, cookieHeader);
          if (!guardResult.ok) {
            return {
              status: guardResult.status,
              body: guardResult.body,
            };
          }
          activeSession = guardResult.session;
          break;
        }
      }
    }

    const context: RequestContext = {
      ...baseContext,
      meta,
      session: activeSession,
      recordActivity: async (input) => {
        this.sessionManager.recordActivity({
          ...input,
          actionType: input.actionType as AccessLogActionType,
          session: activeSession,
        });
      },
    };

    const handlerResult = await handler(args, context);

    if (
      handlerResult &&
      typeof handlerResult === "object" &&
      "body" in handlerResult &&
      "status" in handlerResult
    ) {
      return handlerResult as DispatchResult;
    }

    return {
      status: 200,
      body: handlerResult,
    };
  }
}
