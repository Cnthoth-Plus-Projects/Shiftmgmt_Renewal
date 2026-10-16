import { CHANNEL_CONTRACTS } from "../../../shared/bridge/channel-contracts";
import { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";
import { registerAllowanceRoutes } from "./allowance-routes";
import { registerCoreRoutes } from "./core-routes";
import { registerOperationsRoutes } from "./operations-routes";
import { registerPerformanceRoutes } from "./performance-routes";
import { registerWorkforceRoutes } from "./workforce-routes";

export const OPERATIONS_CHANNELS = CHANNEL_CONTRACTS.filter(
  (contract) => contract.group === "operations",
).map((contract) => contract.channel);

export const WORKFORCE_CHANNELS = CHANNEL_CONTRACTS.filter(
  (contract) => contract.group === "workforce",
).map((contract) => contract.channel);

export const PERFORMANCE_CHANNELS = CHANNEL_CONTRACTS.filter(
  (contract) => contract.group === "performance",
).map((contract) => contract.channel);

export const ALLOWANCE_CHANNELS = CHANNEL_CONTRACTS.filter(
  (contract) => contract.group === "allowance",
).map((contract) => contract.channel);

export const assembleRoutes = (sessionManager: SessionManager): RouteRegistry => {
  const registry = new RouteRegistry(sessionManager);
  registerCoreRoutes(registry, sessionManager);
  registerOperationsRoutes(registry, sessionManager);
  registerWorkforceRoutes(registry, sessionManager);
  registerPerformanceRoutes(registry, sessionManager);
  registerAllowanceRoutes(registry, sessionManager);

  const expectedTotal = CHANNEL_CONTRACTS.length;
  const registered = registry.getRegisteredChannels();
  if (registered.length !== expectedTotal) {
    throw new Error(
      `S3 registered route count mismatch: expected ${expectedTotal}, got ${registered.length}`,
    );
  }

  for (const contract of CHANNEL_CONTRACTS) {
    if (!registry.has(contract.channel)) {
      throw new Error(
        `Missing expected ${contract.group} channel registration: ${contract.channel}`,
      );
    }
  }

  return registry;
};
