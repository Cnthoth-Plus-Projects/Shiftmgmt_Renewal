import { buildHealthPayload, type HealthContext } from "./health";
import type { BridgeResult } from "./json";
import type { RouteRegistry } from "./route-registry";

export type ApiContext = HealthContext & {
  routeRegistry?: RouteRegistry;
};

/** GET 창구: /api/health 만 허용(§5-8) */
export type ApiGetHandler = (context: ApiContext) => BridgeResult<unknown>;

/** POST 창구: 인수 JSON 배열 → 계약 반환형 JSON */
export type ApiPostHandler = (args: unknown[], context: ApiContext) => Promise<unknown>;

export const GET_ROUTES: Readonly<Record<string, ApiGetHandler>> = {
  "/api/health": (context) => buildHealthPayload(context),
};

export const POST_ROUTES: Record<string, ApiPostHandler> = {};

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function resolveGetRoute(pathname: string): ApiGetHandler | undefined {
  return Object.prototype.hasOwnProperty.call(GET_ROUTES, pathname) ? GET_ROUTES[pathname] : undefined;
}

export function resolvePostRoute(pathname: string): ApiPostHandler | undefined {
  return Object.prototype.hasOwnProperty.call(POST_ROUTES, pathname) ? POST_ROUTES[pathname] : undefined;
}
