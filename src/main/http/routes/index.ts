import { CORE_CHANNELS } from "../../../shared/bridge/channel-contracts";
import { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";
import { registerCoreRoutes } from "./core-routes";

export const assembleRoutes = (sessionManager: SessionManager): RouteRegistry => {
  const registry = new RouteRegistry(sessionManager);
  registerCoreRoutes(registry, sessionManager);

  const registered = registry.getRegisteredChannels();
  if (registered.length !== CORE_CHANNELS.length) {
    throw new Error(
      `S1 registered route count mismatch: expected ${CORE_CHANNELS.length}, got ${registered.length}`,
    );
  }

  for (const channel of CORE_CHANNELS) {
    if (!registry.has(channel)) {
      throw new Error(`Missing expected core channel registration: ${channel}`);
    }
  }

  return registry;
};
