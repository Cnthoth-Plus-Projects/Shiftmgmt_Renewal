import { describe, expect, it } from "vitest";
import {
  calculateRotationIndex,
  calculateRotationIndexFromOffset,
  getDateDifferenceInDays
} from "./rotation-index";

describe("rotation-index domain module", () => {
  describe("getDateDifferenceInDays", () => {
    it("returns 0 for the same date", () => {
      expect(getDateDifferenceInDays("2026-08-26", "2026-08-26")).toBe(0);
    });

    it("calculates positive day difference for future target dates", () => {
      expect(getDateDifferenceInDays("2026-08-01", "2026-08-05")).toBe(4);
      expect(getDateDifferenceInDays("2026-08-01", "2026-08-31")).toBe(30);
    });

    it("calculates negative day difference for past target dates", () => {
      expect(getDateDifferenceInDays("2026-08-10", "2026-08-05")).toBe(-5);
    });

    it("handles month and leap year boundaries correctly", () => {
      // 2024 is a leap year (Feb 29 exists)
      expect(getDateDifferenceInDays("2024-02-28", "2024-03-01")).toBe(2);
      // 2025 is not a leap year
      expect(getDateDifferenceInDays("2025-02-28", "2025-03-01")).toBe(1);
      // Year boundary
      expect(getDateDifferenceInDays("2026-12-31", "2027-01-01")).toBe(1);
    });

    it("throws an Error for invalid date formats or values", () => {
      expect(() => getDateDifferenceInDays("invalid-date", "2026-08-01")).toThrow("Invalid date value");
      expect(() => getDateDifferenceInDays("2026-08-01", "2026-13-01")).toThrow("Invalid date value");
      expect(() => getDateDifferenceInDays("2026-08-01", "2026-08-35")).toThrow("Invalid date value");
      expect(() => getDateDifferenceInDays("2026-8-1", "2026-08-01")).toThrow("Invalid date value");
    });
  });

  describe("calculateRotationIndexFromOffset", () => {
    it("calculates standard index within bounds", () => {
      expect(calculateRotationIndexFromOffset(0, 0, 4)).toBe(0);
      expect(calculateRotationIndexFromOffset(1, 0, 4)).toBe(1);
      expect(calculateRotationIndexFromOffset(4, 0, 4)).toBe(0);
      expect(calculateRotationIndexFromOffset(5, 0, 4)).toBe(1);
    });

    it("applies teamIndex offset correctly", () => {
      expect(calculateRotationIndexFromOffset(0, 2, 4)).toBe(2);
      expect(calculateRotationIndexFromOffset(1, 2, 4)).toBe(3);
      expect(calculateRotationIndexFromOffset(2, 2, 4)).toBe(0);
      expect(calculateRotationIndexFromOffset(3, 2, 4)).toBe(1);
    });

    it("safely handles negative offsets", () => {
      expect(calculateRotationIndexFromOffset(-1, 0, 4)).toBe(3);
      expect(calculateRotationIndexFromOffset(-4, 0, 4)).toBe(0);
      expect(calculateRotationIndexFromOffset(-5, 0, 4)).toBe(3);
      expect(calculateRotationIndexFromOffset(-5, 2, 4)).toBe(1);
    });

    it("returns 0 for invalid cycle lengths", () => {
      expect(calculateRotationIndexFromOffset(5, 2, 0)).toBe(0);
      expect(calculateRotationIndexFromOffset(5, 2, -1)).toBe(0);
    });
  });

  describe("calculateRotationIndex", () => {
    it("computes full rotation from baseDate and targetDate", () => {
      const baseDate = "2026-08-01";
      expect(calculateRotationIndex(baseDate, "2026-08-01", 0, 4)).toBe(0);
      expect(calculateRotationIndex(baseDate, "2026-08-02", 0, 4)).toBe(1);
      expect(calculateRotationIndex(baseDate, "2026-08-05", 0, 4)).toBe(0);
      expect(calculateRotationIndex(baseDate, "2026-07-31", 0, 4)).toBe(3);
    });

    it("guarantees formula parity between generator and preview implementations", () => {
      const testCases = [
        { baseDate: "2026-08-01", targetDate: "2026-08-01", teamIndex: 0, cycleLength: 4 },
        { baseDate: "2026-08-01", targetDate: "2026-08-15", teamIndex: 1, cycleLength: 4 },
        { baseDate: "2026-08-01", targetDate: "2026-09-01", teamIndex: 2, cycleLength: 6 },
        { baseDate: "2026-08-15", targetDate: "2026-08-01", teamIndex: 3, cycleLength: 4 },
        { baseDate: "2026-01-01", targetDate: "2026-12-31", teamIndex: 0, cycleLength: 8 }
      ];

      for (const tc of testCases) {
        const offset = getDateDifferenceInDays(tc.baseDate, tc.targetDate);
        // Original generator formula
        const generatorResult =
          ((offset + tc.teamIndex) % tc.cycleLength + tc.cycleLength) % tc.cycleLength;
        // Shared module result
        const sharedResult = calculateRotationIndex(
          tc.baseDate,
          tc.targetDate,
          tc.teamIndex,
          tc.cycleLength
        );

        expect(sharedResult).toBe(generatorResult);
      }
    });
  });
});
