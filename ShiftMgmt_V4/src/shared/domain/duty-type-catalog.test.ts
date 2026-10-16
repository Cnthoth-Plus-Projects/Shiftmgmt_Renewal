import { describe, expect, it } from "vitest";
import {
  autoBreakMinutes,
  calculateDutyWorkMinutes,
  clampShiftCount,
  createDefaultDutyCatalog,
  deriveDefaultCatalogFromShiftPattern,
  isOffDutyCode,
  resolveBreakMinutes,
  validateDutyCatalog,
  MAX_WORKING_DUTY_TYPE_COUNT,
  type DutyTypeDefinition
} from "./duty-type-catalog";

describe("duty-type-catalog domain module", () => {
  describe("autoBreakMinutes", () => {
    it("calculates 30 minutes of break per 4 full hours (240 minutes) of work", () => {
      // Boundaries around 0 ~ 239 min -> 0
      expect(autoBreakMinutes(0)).toBe(0);
      expect(autoBreakMinutes(60)).toBe(0);
      expect(autoBreakMinutes(180)).toBe(0);
      expect(autoBreakMinutes(239)).toBe(0);

      // Boundaries around 240 ~ 479 min -> 30
      expect(autoBreakMinutes(240)).toBe(30);
      expect(autoBreakMinutes(300)).toBe(30);
      expect(autoBreakMinutes(479)).toBe(30);

      // Boundaries around 480 ~ 719 min -> 60
      expect(autoBreakMinutes(480)).toBe(60);
      expect(autoBreakMinutes(540)).toBe(60);
      expect(autoBreakMinutes(719)).toBe(60);

      // Boundaries around 720 min (12 hours) -> 90
      expect(autoBreakMinutes(720)).toBe(90);

      // Negative values are guarded to 0
      expect(autoBreakMinutes(-60)).toBe(0);
    });
  });

  describe("calculateDutyWorkMinutes", () => {
    it("computes same-day work duration in minutes", () => {
      expect(calculateDutyWorkMinutes("09:00", "18:00")).toBe(540); // 9 hours
      expect(calculateDutyWorkMinutes("06:00", "14:00")).toBe(480); // 8 hours
    });

    it("computes overnight (next-day) work duration in minutes", () => {
      expect(calculateDutyWorkMinutes("19:00", "07:00")).toBe(720); // 12 hours (overnight)
      expect(calculateDutyWorkMinutes("22:00", "06:00")).toBe(480); // 8 hours (overnight)
    });

    it("returns 0 for empty or invalid times", () => {
      expect(calculateDutyWorkMinutes("", "")).toBe(0);
      expect(calculateDutyWorkMinutes(undefined, undefined)).toBe(0);
      expect(calculateDutyWorkMinutes("09:00", undefined)).toBe(0);
    });
  });

  describe("resolveBreakMinutes", () => {
    it("recalculates auto break minutes when isBreakDirty is false or undefined", () => {
      const result = resolveBreakMinutes({
        workMinutes: 540, // 9h -> 60m
        currentBreakMinutes: 0,
        isBreakDirty: false
      });
      expect(result.breakMinutes).toBe(60);
      expect(result.isDirty).toBe(false);
    });

    it("preserves custom user-modified break minutes when isBreakDirty is true", () => {
      const result = resolveBreakMinutes({
        workMinutes: 540, // would auto-calculate to 60
        currentBreakMinutes: 45, // user explicitly typed 45
        isBreakDirty: true
      });
      expect(result.breakMinutes).toBe(45);
      expect(result.isDirty).toBe(true);
    });
  });

  describe("clampShiftCount", () => {
    it("clamps shiftCount within [1, 3] range (aligning with MAX_WORKING_DUTY_TYPE_COUNT = 3)", () => {
      expect(MAX_WORKING_DUTY_TYPE_COUNT).toBe(3);
      expect(clampShiftCount(0)).toBe(1);
      expect(clampShiftCount(1)).toBe(1);
      expect(clampShiftCount(2)).toBe(2);
      expect(clampShiftCount(3)).toBe(3);
      expect(clampShiftCount(4)).toBe(3); // Upper bound clamped to 3
      expect(clampShiftCount(6)).toBe(3); // Upper bound clamped to 3
      expect(clampShiftCount(NaN)).toBe(2);
    });
  });

  describe("createDefaultDutyCatalog", () => {
    it("creates catalog for 1-shift with 1 work duty and unlimited off duties", () => {
      const catalog = createDefaultDutyCatalog(1);
      const workDuties = catalog.filter((item) => item.kind === "work");
      const offDuties = catalog.filter((item) => item.kind === "off");

      expect(workDuties).toHaveLength(1);
      expect(workDuties[0]?.id).toBe("duty-day");
      expect(workDuties[0]?.label).toBe("주간");
      expect(workDuties[0]?.startTime).toBe("09:00");
      expect(workDuties[0]?.endTime).toBe("18:00");
      expect(workDuties[0]?.breakMinutes).toBe(60);
      expect(workDuties[0]?.isBreakDirty).toBe(false);

      expect(offDuties.length).toBeGreaterThanOrEqual(2);
      expect(offDuties.map((d) => d.label)).toContain("휴무");
      expect(offDuties.map((d) => d.label)).toContain("비번");
    });

    it("creates catalog for 2-shift with day/night work duties and off duties", () => {
      const catalog = createDefaultDutyCatalog(2);
      const workDuties = catalog.filter((item) => item.kind === "work");

      expect(workDuties).toHaveLength(2);
      expect(workDuties[0]?.id).toBe("duty-day");
      expect(workDuties[0]?.label).toBe("주간");
      expect(workDuties[1]?.id).toBe("duty-night");
      expect(workDuties[1]?.label).toBe("야간");
      expect(workDuties[1]?.startTime).toBe("19:00");
      expect(workDuties[1]?.endTime).toBe("07:00");
      expect(workDuties[1]?.breakMinutes).toBe(90); // 720 min -> 90 min auto break
    });

    it("creates catalog for 3-shift with day/evening/night work duties and off duties", () => {
      const catalog = createDefaultDutyCatalog(3);
      const workDuties = catalog.filter((item) => item.kind === "work");

      expect(workDuties).toHaveLength(3);
      expect(workDuties.map((d) => d.label)).toEqual(["주간", "석간", "야간"]);
    });

    it("separates stable ID and display label", () => {
      const catalog = createDefaultDutyCatalog(2);
      catalog.forEach((duty) => {
        expect(duty.id).toBeDefined();
        expect(duty.label).toBeDefined();
        expect(typeof duty.id).toBe("string");
        expect(typeof duty.label).toBe("string");
      });
    });
  });

  describe("validateDutyCatalog", () => {
    it("accepts valid catalogs with up to 3 working duties", () => {
      const catalog = createDefaultDutyCatalog(3);
      const result = validateDutyCatalog(catalog);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects catalog with more than 3 working duties (MAX_WORKING_DUTY_TYPE_COUNT = 3)", () => {
      const catalog: DutyTypeDefinition[] = [
        { id: "d1", kind: "work", label: "주간", sortOrder: 0, startTime: "08:00", endTime: "16:00" },
        { id: "d2", kind: "work", label: "석간", sortOrder: 1, startTime: "16:00", endTime: "24:00" },
        { id: "d3", kind: "work", label: "야간", sortOrder: 2, startTime: "00:00", endTime: "08:00" },
        { id: "d4", kind: "work", label: "심야", sortOrder: 3, startTime: "02:00", endTime: "10:00" },
        { id: "off1", kind: "off", label: "휴무", sortOrder: 4 }
      ];

      const result = validateDutyCatalog(catalog);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes("최대 3개"))).toBe(true);
    });

    it("allows unlimited off-duty (non-working) items", () => {
      const catalog: DutyTypeDefinition[] = [
        { id: "d1", kind: "work", label: "주간", sortOrder: 0 },
        { id: "d2", kind: "work", label: "야간", sortOrder: 1 },
        { id: "off1", kind: "off", label: "휴무", sortOrder: 2 },
        { id: "off2", kind: "off", label: "비번", sortOrder: 3 },
        { id: "off3", kind: "off", label: "연차", sortOrder: 4 },
        { id: "off4", kind: "off", label: "공가", sortOrder: 5 },
        { id: "off5", kind: "off", label: "병가", sortOrder: 6 }
      ];

      const result = validateDutyCatalog(catalog);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects duplicate IDs", () => {
      const catalog: DutyTypeDefinition[] = [
        { id: "same-id", kind: "work", label: "주간", sortOrder: 0 },
        { id: "same-id", kind: "off", label: "휴무", sortOrder: 1 }
      ];

      const result = validateDutyCatalog(catalog);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes("ID"))).toBe(true);
    });

    it("rejects empty labels", () => {
      const catalog: DutyTypeDefinition[] = [
        { id: "d1", kind: "work", label: "  ", sortOrder: 0 }
      ];

      const result = validateDutyCatalog(catalog);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes("라벨"))).toBe(true);
    });
  });

  describe("deriveDefaultCatalogFromShiftPattern (Backward Compatibility)", () => {
    it("derives default catalog from legacy pattern without duty types", () => {
      const legacyPattern = {
        teamCount: 4,
        cycles: [
          {
            shiftCount: 2,
            steps: [
              { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
              { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
              { stepIndex: 2, dutyCode: "O", breakMinutes: 0 }
            ]
          }
        ]
      };

      const catalog = deriveDefaultCatalogFromShiftPattern(legacyPattern);
      const workDuties = catalog.filter((item) => item.kind === "work");
      const offDuties = catalog.filter((item) => item.kind === "off");

      expect(workDuties).toHaveLength(2);
      expect(workDuties[0]?.startTime).toBe("07:00");
      expect(workDuties[0]?.endTime).toBe("19:00");
      expect(workDuties[0]?.breakMinutes).toBe(90);
      expect(workDuties[1]?.startTime).toBe("19:00");
      expect(workDuties[1]?.endTime).toBe("07:00");

      expect(offDuties.length).toBeGreaterThanOrEqual(1);
    });

    it("correctly extracts distinct working steps for standard DDNNXX pattern (preserves D -> day, N -> night timing without duplication)", () => {
      // 4-team 2-shift standard pattern with duplicates: D, D, N, N, X, X
      const pattern = {
        cycles: [
          {
            shiftCount: 2,
            steps: [
              { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
              { stepIndex: 1, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
              { stepIndex: 2, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
              { stepIndex: 3, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
              { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
              { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
            ]
          }
        ]
      };

      const catalog = deriveDefaultCatalogFromShiftPattern(pattern);
      const workDuties = catalog.filter((item) => item.kind === "work");

      expect(workDuties).toHaveLength(2);
      // First working duty slot (duty-day) must have D timing
      expect(workDuties[0]?.id).toBe("duty-day");
      expect(workDuties[0]?.label).toBe("주간");
      expect(workDuties[0]?.startTime).toBe("07:00");
      expect(workDuties[0]?.endTime).toBe("19:00");
      expect(workDuties[0]?.breakMinutes).toBe(90);

      // Second working duty slot (duty-night) must have N timing (NOT D timing from second step)
      expect(workDuties[1]?.id).toBe("duty-night");
      expect(workDuties[1]?.label).toBe("야간");
      expect(workDuties[1]?.startTime).toBe("19:00");
      expect(workDuties[1]?.endTime).toBe("07:00");
      expect(workDuties[1]?.breakMinutes).toBe(90);
    });

    it("does not classify X, OFF, O, 휴, or 비 as working steps", () => {
      const patternWithVariousOffCodes = {
        shiftCount: 1,
        steps: [
          { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
          { stepIndex: 1, dutyCode: "X", startTime: "00:00", endTime: "00:00", breakMinutes: 0 },
          { stepIndex: 2, dutyCode: "OFF", startTime: "00:00", endTime: "00:00", breakMinutes: 0 },
          { stepIndex: 3, dutyCode: "O", startTime: "00:00", endTime: "00:00", breakMinutes: 0 },
          { stepIndex: 4, dutyCode: "휴", startTime: "00:00", endTime: "00:00", breakMinutes: 0 },
          { stepIndex: 5, dutyCode: "비", startTime: "00:00", endTime: "00:00", breakMinutes: 0 }
        ]
      };

      const catalog = deriveDefaultCatalogFromShiftPattern(patternWithVariousOffCodes);
      const workDuties = catalog.filter((item) => item.kind === "work");

      expect(workDuties).toHaveLength(1);
      expect(workDuties[0]?.label).toBe("주간");
      expect(workDuties[0]?.startTime).toBe("09:00");
      expect(workDuties[0]?.endTime).toBe("18:00");
    });

    it("handles 3-shift D, E, N with duplicates correctly (e.g. DDEENNXX)", () => {
      const pattern3Shift = {
        cycles: [
          {
            shiftCount: 3,
            steps: [
              { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "15:00", breakMinutes: 60 },
              { stepIndex: 1, dutyCode: "D", startTime: "07:00", endTime: "15:00", breakMinutes: 60 },
              { stepIndex: 2, dutyCode: "E", startTime: "15:00", endTime: "23:00", breakMinutes: 60 },
              { stepIndex: 3, dutyCode: "E", startTime: "15:00", endTime: "23:00", breakMinutes: 60 },
              { stepIndex: 4, dutyCode: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 60 },
              { stepIndex: 5, dutyCode: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 60 },
              { stepIndex: 6, dutyCode: "X", breakMinutes: 0 },
              { stepIndex: 7, dutyCode: "X", breakMinutes: 0 }
            ]
          }
        ]
      };

      const catalog = deriveDefaultCatalogFromShiftPattern(pattern3Shift);
      const workDuties = catalog.filter((item) => item.kind === "work");

      expect(workDuties).toHaveLength(3);
      expect(workDuties[0]?.label).toBe("주간");
      expect(workDuties[0]?.startTime).toBe("07:00");
      expect(workDuties[0]?.endTime).toBe("15:00");

      expect(workDuties[1]?.label).toBe("석간");
      expect(workDuties[1]?.startTime).toBe("15:00");
      expect(workDuties[1]?.endTime).toBe("23:00");

      expect(workDuties[2]?.label).toBe("야간");
      expect(workDuties[2]?.startTime).toBe("23:00");
      expect(workDuties[2]?.endTime).toBe("07:00");
    });
  });

  describe("isOffDutyCode helper", () => {
    it("recognizes all standard off duty codes and aliases", () => {
      expect(isOffDutyCode("X")).toBe(true);
      expect(isOffDutyCode("x")).toBe(true);
      expect(isOffDutyCode("OFF")).toBe(true);
      expect(isOffDutyCode("off")).toBe(true);
      expect(isOffDutyCode("O")).toBe(true);
      expect(isOffDutyCode("o")).toBe(true);
      expect(isOffDutyCode("휴")).toBe(true);
      expect(isOffDutyCode("비")).toBe(true);
      expect(isOffDutyCode("휴무")).toBe(true);
      expect(isOffDutyCode("비번")).toBe(true);
      expect(isOffDutyCode("")).toBe(true);
      expect(isOffDutyCode("   ")).toBe(true);
      expect(isOffDutyCode(null)).toBe(true);
      expect(isOffDutyCode(undefined)).toBe(true);

      expect(isOffDutyCode("D")).toBe(false);
      expect(isOffDutyCode("N")).toBe(false);
      expect(isOffDutyCode("E")).toBe(false);
      expect(isOffDutyCode("A")).toBe(false);
    });
  });
});
