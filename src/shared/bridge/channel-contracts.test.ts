import { describe, expect, it } from "vitest";
import {
  CHANNEL_CONTRACTS,
  CORE_CHANNELS,
  getChannelContract,
  getChannelContractByMethod,
  isCoreChannel,
} from "./channel-contracts";

describe("channel-contracts", () => {
  it("defines exactly 107 channel contracts with unique channels and methods", () => {
    expect(CHANNEL_CONTRACTS).toHaveLength(107);

    const channels = CHANNEL_CONTRACTS.map((contract) => contract.channel);
    const methods = CHANNEL_CONTRACTS.map((contract) => contract.method);

    expect(new Set(channels).size).toBe(107);
    expect(new Set(methods).size).toBe(107);
  });

  it("matches expected group distributions (17 core, 36 operations, 25 workforce, 16 performance, 13 allowance)", () => {
    const counts = CHANNEL_CONTRACTS.reduce(
      (acc, contract) => {
        acc[contract.group] = (acc[contract.group] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(counts).toEqual({
      core: 17,
      operations: 36,
      workforce: 25,
      performance: 16,
      allowance: 13,
    });
  });

  it("matches expected guard distributions (36 admin, 35 session, 22 action, 1 accessHistory, 13 none)", () => {
    const counts = CHANNEL_CONTRACTS.reduce(
      (acc, contract) => {
        acc[contract.guard] = (acc[contract.guard] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(counts).toEqual({
      admin: 36,
      session: 35,
      action: 22,
      accessHistory: 1,
      none: 13,
    });
  });

  it("enforces actionPermission constraints", () => {
    for (const contract of CHANNEL_CONTRACTS) {
      if (contract.guard === "action") {
        expect(contract.actionPermission).toBeDefined();
        expect(typeof contract.actionPermission).toBe("string");
      } else {
        expect(contract.actionPermission).toBeUndefined();
      }
    }
  });

  it("matches expected counts for recordsActivity (59), dialog (6), usesDataDir (24)", () => {
    const activityCount = CHANNEL_CONTRACTS.filter(
      (contract) => contract.recordsActivity,
    ).length;
    const dialogCount = CHANNEL_CONTRACTS.filter(
      (contract) => contract.dialog !== undefined,
    ).length;
    const dataDirCount = CHANNEL_CONTRACTS.filter(
      (contract) => contract.usesDataDir,
    ).length;

    expect(activityCount).toBe(59);
    expect(dialogCount).toBe(6);
    expect(dataDirCount).toBe(24);
  });

  it("derives CORE_CHANNELS with exactly 17 channels", () => {
    expect(CORE_CHANNELS).toHaveLength(17);
    expect(new Set(CORE_CHANNELS).size).toBe(17);

    for (const channel of CORE_CHANNELS) {
      expect(isCoreChannel(channel)).toBe(true);
      const contract = getChannelContract(channel);
      expect(contract).toBeDefined();
      expect(contract?.group).toBe("core");
    }

    expect(isCoreChannel("operations:select-directory")).toBe(false);
  });

  it("looks up contracts by channel and by method", () => {
    const byChannel = getChannelContract("app:get-version");
    expect(byChannel?.method).toBe("getAppVersion");

    const byMethod = getChannelContractByMethod("getAppVersion");
    expect(byMethod?.channel).toBe("app:get-version");

    expect(getChannelContract("unknown-channel")).toBeUndefined();
    expect(getChannelContractByMethod("unknownMethod")).toBeUndefined();

    // J3: operations:select-json-backup-file 1:1 replacement check
    const backupContract = getChannelContract("operations:select-json-backup-file");
    expect(backupContract).toBeDefined();
    expect(backupContract?.method).toBe("selectJsonBackupFile");
    expect(backupContract?.guard).toBe("admin");
    expect(backupContract?.dialog).toBe("openFile");

    expect(getChannelContract("operations:select-migration-file")).toBeUndefined();
    expect(getChannelContractByMethod("selectMigrationFile")).toBeUndefined();
  });
});
