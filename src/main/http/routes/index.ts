import {
  CHANNEL_CONTRACTS,
  CORE_CHANNELS,
} from "../../../shared/bridge/channel-contracts";
import { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";
import { registerCoreRoutes } from "./core-routes";
import { registerOperationsRoutes } from "./operations-routes";

export const OPERATIONS_CHANNELS = CHANNEL_CONTRACTS.filter(
  (contract) => contract.group === "operations",
).map((contract) => contract.channel);

export const assembleRoutes = (sessionManager: SessionManager): RouteRegistry => {

  const registry = new RouteRegistry(sessionManager);
  registerCoreRoutes(registry, sessionManager);
  registerOperationsRoutes(registry, sessionManager);

  const expectedTotal = CORE_CHANNELS.length + OPERATIONS_CHANNELS.length;
  const registered = registry.getRegisteredChannels();
  if (registered.length !== expectedTotal) {
    throw new Error(
      `S2 registered route count mismatch: expected ${expectedTotal}, got ${registered.length}`,
    );
  }

  for (const channel of CORE_CHANNELS) {
    if (!registry.has(channel)) {
      throw new Error(`Missing expected core channel registration: ${channel}`);
    }
  }

  for (const channel of OPERATIONS_CHANNELS) {
    if (!registry.has(channel)) {
      throw new Error(`Missing expected operations channel registration: ${channel}`);
    }
  }

  return registry;
};
