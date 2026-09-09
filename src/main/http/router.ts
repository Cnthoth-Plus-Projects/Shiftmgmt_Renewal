// (메서드, 경로) → 처리기 표.
// 1-1에서는 GET /api/health 하나뿐이고, 창구 111개(POST /api/<채널명>)는 1-3에서 여기에 등록된다.
// 규약은 docs/api-convention.md 가 정본이다.
import { buildHealthPayload, type HealthContext } from "./health";
import type { BridgeResult } from "./json";

export type ApiContext = HealthContext;

/** GET 창구: /api/health 만 허용(§5-8) */
export type ApiGetHandler = (context: ApiContext) => BridgeResult<unknown>;

/** POST 창구: 인수 JSON 배열 → 계약 반환형 JSON(1-3에서 111개 등록) */
export type ApiPostHandler = (args: unknown[], context: ApiContext) => Promise<unknown>;

export const GET_ROUTES: Readonly<Record<string, ApiGetHandler>> = {
  "/api/health": (context) => buildHealthPayload(context)
};

export const POST_ROUTES: Readonly<Record<string, ApiPostHandler>> = {};

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function resolveGetRoute(pathname: string): ApiGetHandler | undefined {
  return Object.prototype.hasOwnProperty.call(GET_ROUTES, pathname) ? GET_ROUTES[pathname] : undefined;
}

export function resolvePostRoute(pathname: string): ApiPostHandler | undefined {
  return Object.prototype.hasOwnProperty.call(POST_ROUTES, pathname) ? POST_ROUTES[pathname] : undefined;
}
