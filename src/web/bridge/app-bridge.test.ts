import { describe, expect, it, vi } from "vitest";
import { CHANNEL_CONTRACTS } from "../../shared/bridge/channel-contracts";
import {
  createBrowserAppBridge,
  trimTrailingUndefined,
} from "./app-bridge";

describe("app-bridge", () => {
  it("trims trailing undefined values without mutating the original array", () => {
    const original = [1, undefined, "a", undefined, undefined];
    const trimmed = trimTrailingUndefined(original);
    expect(trimmed).toEqual([1, undefined, "a"]);
    expect(original).toEqual([1, undefined, "a", undefined, undefined]);
  });

  it("exposes exactly 107 methods mapped to their contract channels (R8)", async () => {
    const calledUrls: string[] = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      calledUrls.push(urlStr);
      if (urlStr === "/api/app:get-version") {
        return new Response(JSON.stringify("0.1.0"), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, data: null }), { status: 200 });
    }) as unknown as typeof fetch;

    const bridge = createBrowserAppBridge(fakeFetch);

    expect(Object.keys(bridge)).toHaveLength(107);

    expect(typeof bridge.listDocumentLayouts).toBe("function");
    expect(typeof bridge.getDocumentLayout).toBe("function");
    expect(typeof bridge.saveDocumentLayout).toBe("function");
    expect(typeof bridge.resetDocumentLayout).toBe("function");
    expect(typeof bridge.previewDocumentLayout).toBe("function");
    expect(typeof bridge.listDocumentLayoutHistory).toBe("function");

    const rawBridge = bridge as Record<string, unknown>;
    expect(rawBridge.listDocumentTemplateVersions).toBeUndefined();
    expect(rawBridge.inspectDocumentTemplate).toBeUndefined();
    expect(rawBridge.saveDocumentTemplateVersion).toBeUndefined();
    expect(rawBridge.selectMigrationFile).toBeUndefined();
    expect(typeof bridge.selectJsonBackupFile).toBe("function");

    for (const contract of CHANNEL_CONTRACTS) {
      const fn = (bridge as Record<string, (...args: unknown[]) => Promise<unknown>>)[contract.method];
      expect(typeof fn).toBe("function");

      await fn();
      expect(calledUrls).toContain(`/api/${contract.channel}`);
    }

    expect(calledUrls).toHaveLength(107);
  });

  it("handles network failure and returns standard NETWORK_ERROR (N10)", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const bridge = createBrowserAppBridge(fakeFetch);
    const result = await bridge.signIn({ loginId: "admin", password: "pw" });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("NETWORK_ERROR");
    expect(result.message).toContain("서버에 연결할 수 없습니다");
  });

  it("handles non-JSON or invalid outer shape responses (N10)", async () => {
    // 1. Invalid JSON
    const notJsonFetch = vi.fn(async () => {
      return new Response("<html>Not found</html>", { status: 500 });
    }) as unknown as typeof fetch;

    const bridge1 = createBrowserAppBridge(notJsonFetch);
    const res1 = await bridge1.signIn({ loginId: "admin", password: "pw" });
    expect(res1.ok).toBe(false);
    expect(res1.errorCode).toBe("INVALID_RESPONSE");

    // 2. Invalid shape (e.g. missing data or string errorCode)
    const badShapeFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const bridge2 = createBrowserAppBridge(badShapeFetch);
    const res2 = await bridge2.signIn({ loginId: "admin", password: "pw" });
    expect(res2.ok).toBe(false);
    expect(res2.errorCode).toBe("INVALID_RESPONSE");
  });

  it("returns valid BridgeFailure directly even if HTTP status is non-200", async () => {
    const failureFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          errorCode: "AUTH_SESSION_REQUIRED",
          message: "로그인 세션이 필요합니다.",
        }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    const bridge = createBrowserAppBridge(failureFetch);
    const res = await bridge.recordAccessLog({
      actionType: "route-view",
      actionLabel: "화면 이동",
    });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("AUTH_SESSION_REQUIRED");
  });

  it("handles getAppVersion strictly with promise reject on error (N11)", async () => {
    // 1. Success returns string
    const okFetch = vi.fn(async () => {
      return new Response(JSON.stringify("0.1.0"), { status: 200 });
    }) as unknown as typeof fetch;
    const bridgeOk = createBrowserAppBridge(okFetch);
    await expect(bridgeOk.getAppVersion()).resolves.toBe("0.1.0");

    // 2. Network error rejects
    const netFailFetch = vi.fn(async () => {
      throw new Error("Network drop");
    }) as unknown as typeof fetch;
    const bridgeNetFail = createBrowserAppBridge(netFailFetch);
    await expect(bridgeNetFail.getAppVersion()).rejects.toThrow();

    // 3. Non-200 rejects
    const statusFailFetch = vi.fn(async () => {
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;
    const bridgeStatusFail = createBrowserAppBridge(statusFailFetch);
    await expect(bridgeStatusFail.getAppVersion()).rejects.toThrow();

    // 4. Non-string response rejects
    const nonStringFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const bridgeNonString = createBrowserAppBridge(nonStringFetch);
    await expect(bridgeNonString.getAppVersion()).rejects.toThrow();
  });
});
