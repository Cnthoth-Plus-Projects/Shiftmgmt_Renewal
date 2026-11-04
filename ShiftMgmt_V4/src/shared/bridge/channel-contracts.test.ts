import { describe, expect, it } from "vitest";
import {
  CHANNEL_CONTRACTS,
  CORE_CHANNELS,
  getChannelContract,
  getChannelContractByMethod,
  isCoreChannel,
} from "./channel-contracts";

describe("channel-contracts", () => {
  it("defines exactly 114 channel contracts with unique channels and methods", () => {
    expect(CHANNEL_CONTRACTS).toHaveLength(114);

    const channels = CHANNEL_CONTRACTS.map((contract) => contract.channel);
    const methods = CHANNEL_CONTRACTS.map((contract) => contract.method);

    expect(new Set(channels).size).toBe(114);
    expect(new Set(methods).size).toBe(114);
  });

  it("matches expected group distributions (17 core, 39 operations, 29 workforce, 16 performance, 13 allowance)", () => {
    const counts = CHANNEL_CONTRACTS.reduce(
      (accumulator, contract) => {
        accumulator[contract.group] = (accumulator[contract.group] || 0) + 1;
        return accumulator;
      },
      {} as Record<string, number>,
    );

    expect(counts).toEqual({
      core: 17,
      operations: 39,
      workforce: 29,
      performance: 16,
      allowance: 13,
    });
  });

  it("matches expected guard distributions (39 admin, 37 session, 24 action, 1 accessHistory, 13 none)", () => {
    const counts = CHANNEL_CONTRACTS.reduce(
      (accumulator, contract) => {
        accumulator[contract.guard] = (accumulator[contract.guard] || 0) + 1;
        return accumulator;
      },
      {} as Record<string, number>,
    );

    expect(counts).toEqual({
      admin: 39,
      session: 37,
      action: 24,
      accessHistory: 1,
      none: 13,
    });
  });

  it("enforces actionPermission constraints", () => {
    for (const contract of CHANNEL_CONTRACTS) {
      if (contract.guard === "action") {
        expect(contract.actionPermission).toBeDefined();
      } else {
        expect(contract.actionPermission).toBeUndefined();
      }
    }
  });

  it("matches expected counts for recordsActivity (62), dialog (6), usesDataDir (25)", () => {
    const activityCount = CHANNEL_CONTRACTS.filter(
      (contract) => contract.recordsActivity,
    ).length;
    const dialogCount = CHANNEL_CONTRACTS.filter(
      (contract) => contract.dialog !== undefined,
    ).length;
    const dataDirCount = CHANNEL_CONTRACTS.filter(
      (contract) => contract.usesDataDir,
    ).length;

    expect(activityCount).toBe(62);
    expect(dialogCount).toBe(6);
    expect(dataDirCount).toBe(25);
  });

  it("guards preset writes with existing planner permission", () => {
    expect(getChannelContractByMethod("listPatternPresets")?.guard).toBe("session");
    for (const method of ["savePatternPreset", "deletePatternPreset"]) {
      const contract = getChannelContractByMethod(method);
      expect(contract?.guard).toBe("action");
      expect(contract?.actionPermission).toBe("shift-pattern-write");
      expect(contract?.recordsActivity).toBe(true);
    }
  });

  it("derives CORE_CHANNELS with exactly 17 channels", () => {
    expect(CORE_CHANNELS).toHaveLength(17);
    expect(new Set(CORE_CHANNELS).size).toBe(17);

    for (const channel of CORE_CHANNELS) {
      expect(isCoreChannel(channel)).toBe(true);
      const contract = getChannelContract(channel);
      expect(contract?.group).toBe("core");
    }
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

    expect(getChannelContractByMethod("listPolicyHistory")?.channel).toBe("operations:list-policy-history");
    expect(getChannelContractByMethod("previewPolicyChange")?.channel).toBe("operations:preview-policy-change");
    expect(getChannelContractByMethod("applyPolicyChange")?.channel).toBe("operations:apply-policy-change");
  });
});
