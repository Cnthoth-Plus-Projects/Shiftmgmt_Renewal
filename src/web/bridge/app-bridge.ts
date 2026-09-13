import { CHANNEL_CONTRACTS } from "../../shared/bridge/channel-contracts";
import type {
  AccessLogBridge,
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  BridgeResult,
  DashboardBridge,
  OperationsBridge,
  PerformanceBridge,
  WorkforceBridge,
} from "../../shared/bridge/contracts";

export type BrowserAppBridge = AppBridge &
  AuthBridge &
  AccessLogBridge &
  WorkforceBridge &
  OperationsBridge &
  DashboardBridge &
  PerformanceBridge &
  AllowanceBridge;

// Compile-time check: Ensure manifest methods and BrowserAppBridge methods match identically both ways
type ManifestMethod = (typeof CHANNEL_CONTRACTS)[number]["method"];
type BridgeMethod = keyof BrowserAppBridge;
type AssertExactMethodsA = Exclude<ManifestMethod, BridgeMethod>;
type AssertExactMethodsB = Exclude<BridgeMethod, ManifestMethod>;
const _assertMethodsA: AssertExactMethodsA = null as never;
const _assertMethodsB: AssertExactMethodsB = null as never;
void _assertMethodsA;
void _assertMethodsB;

export const trimTrailingUndefined = (args: unknown[]): unknown[] => {
  const copy = [...args];
  while (copy.length > 0 && copy[copy.length - 1] === undefined) {
    copy.pop();
  }
  return copy;
};

const isValidBridgeResult = (val: unknown): val is BridgeResult<unknown> => {
  if (typeof val !== "object" || val === null) {
    return false;
  }
  if ("ok" in val) {
    if ((val as { ok: unknown }).ok === true) {
      return Object.prototype.hasOwnProperty.call(val, "data");
    }
    if ((val as { ok: unknown }).ok === false) {
      return (
        typeof (val as { errorCode?: unknown }).errorCode === "string" &&
        typeof (val as { message?: unknown }).message === "string"
      );
    }
  }
  return false;
};

export const createBrowserAppBridge = (
  customFetch: typeof fetch = fetch,
): BrowserAppBridge => {
  const bridge = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;

  for (const contract of CHANNEL_CONTRACTS) {
    const { method, channel } = contract;

    if (method === "getAppVersion") {
      bridge[method] = async (...args: unknown[]): Promise<string> => {
        const trimmedArgs = trimTrailingUndefined(args);
        let response: Response;
        try {
          response = await customFetch(`/api/${channel}`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(trimmedArgs),
          });
        } catch (error) {
          throw new Error(
            `Failed to fetch app version: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch app version: HTTP status ${response.status}`);
        }

        let parsed: unknown;
        try {
          parsed = await response.json();
        } catch (error) {
          throw new Error(
            `Failed to parse app version as JSON: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (typeof parsed !== "string") {
          throw new Error(`Expected app version string, received ${typeof parsed}`);
        }

        return parsed;
      };
      continue;
    }

    bridge[method] = async (...args: unknown[]): Promise<BridgeResult<unknown>> => {
      const trimmedArgs = trimTrailingUndefined(args);
      let response: Response;
      try {
        response = await customFetch(`/api/${channel}`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(trimmedArgs),
        });
      } catch {
        return {
          ok: false,
          errorCode: "NETWORK_ERROR",
          message: "서버에 연결할 수 없습니다. 프로그램이 켜져 있는지 확인하세요.",
        };
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        return {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "서버 응답을 읽을 수 없습니다.",
        };
      }

      if (!isValidBridgeResult(parsed)) {
        return {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "서버 응답을 읽을 수 없습니다.",
        };
      }

      return parsed;
    };
  }

  return bridge as unknown as BrowserAppBridge;
};

export const installBrowserAppBridge = (
  customFetch?: typeof fetch,
): BrowserAppBridge => {
  if (typeof window !== "undefined") {
    if (!window.appBridge) {
      window.appBridge = createBrowserAppBridge(customFetch);
    }
    return window.appBridge;
  }
  return createBrowserAppBridge(customFetch);
};

installBrowserAppBridge();

declare global {
  interface Window {
    appBridge?: BrowserAppBridge;
  }
}
