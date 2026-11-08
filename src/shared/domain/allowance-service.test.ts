import { describe, expect, it } from "vitest";

import { allowanceRateDefaultMatrix, buildAllowanceRateTable } from "./allowance-rate-matrix";
import {
  calculateRoundedAllowanceLineAmounts,
  createAllowanceCalculationSignature,
  createAllowanceCalculationSnapshot,
  getAllowanceRateCoverageError
} from "./allowance-service";

describe("createAllowanceCalculationSnapshot", () => {
  it("CALC-04: 소수 배율의 정수 결과에 1원을 더하지 않는다", () => {
    expect(calculateRoundedAllowanceLineAmounts(14100,[{workMinutes:60,multiplier:1.1}])).toEqual({lineAmounts:[15510],totalAmount:15510});
    expect(calculateRoundedAllowanceLineAmounts(10001,[{workMinutes:1,multiplier:1.5},{workMinutes:1,multiplier:2}])).toEqual({lineAmounts:[250,334],totalAmount:584});
  });
  it("CALC-04: 소수 시급·동률 배분·아주 작은 양수도 정확히 처리한다", () => {
    expect(calculateRoundedAllowanceLineAmounts(17457.07,[{workMinutes:90,multiplier:1.5},{workMinutes:150,multiplier:1.5},{workMinutes:390,multiplier:1.5}])).toEqual({lineAmounts:[39278,65464,170207],totalAmount:274949});
    expect(calculateRoundedAllowanceLineAmounts(1,[1,2,3].map(()=>({workMinutes:30,multiplier:1})))).toEqual({lineAmounts:[1,1,0],totalAmount:2});
    expect(calculateRoundedAllowanceLineAmounts(Number.MIN_VALUE,[{workMinutes:60,multiplier:1}])).toEqual({lineAmounts:[1],totalAmount:1});
    expect(calculateRoundedAllowanceLineAmounts(1e308,[{workMinutes:60,multiplier:1e-308}])).toEqual({lineAmounts:[1],totalAmount:1});
  });
  it("CALC-04: 최종 안전 정수 범위를 넘으면 거부한다", () => {
    expect(()=>calculateRoundedAllowanceLineAmounts(Number.MAX_SAFE_INTEGER,[{workMinutes:60,multiplier:1},{workMinutes:Number.MIN_VALUE,multiplier:1}])).toThrow("범위");
  });
  const baseInput = {
    calculationId: "calc-01",
    performanceApprovalId: "approval-01",
    calculationVersion: 1,
    createdAt: "2026-03-11T15:00:00+09:00",
    approvedSnapshot: {
      performanceFileId: "file-01",
      approvalStatus: "approved" as const,
      approvedAt: "2026-03-11T14:00:00+09:00",
      approvedBy: "user-01",
      holidayCalendarId: "holiday-2026",
      allowanceRateVersionId: "rate-2026-1",
      sourceFileChecksum: "abc123"
    },
    workDate: "2026-03-03",
    timeRange: {
      startTime: "09:00",
      endTime: "20:00",
      breakMinutes: 60
    },
    hourlyRate: 10000,
    rateTable: buildAllowanceRateTable()
  };

  it.each(["base", "overtime", "night"] as const)("Z01: occupied %s at zero is rejected while pure what-if remains calculable", axis => {
    const category = axis === "base" ? "weekday-substitute" : "holiday-overtime";
    const row = {...allowanceRateDefaultMatrix[category], overtime: 2, night: 2.5, [axis]: 0};
    const rateTable = {...allowanceRateDefaultMatrix, [category]: row};
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput, rateTable, allowanceCategoryCode: category,
      workType: axis === "base" ? "substitute" : "overtime",
      timeRange: axis === "base" ? baseInput.timeRange : {startTime:"20:00",endTime:"01:00",breakMinutes:30}
    });
    expect(snapshot.totalAllowanceAmount).toBeGreaterThan(0);
    const issue = getAllowanceRateCoverageError(snapshot, rateTable);
    expect(issue?.errorCode).toBe("ALLOWANCE_RATE_INCOMPLETE");
    expect(issue?.message).toContain(axis === "base" ? "기본 480분" : axis === "overtime" ? "연장 120분" : "야간 150분");
  });

  it("Z01: zero-minute axes permit zero rates; completely zero pay retains its error", () => {
    const rateTable = {...allowanceRateDefaultMatrix,"holiday-overtime":{base:0,overtime:2,night:0}};
    const input = {...baseInput,workType:"overtime" as const,allowanceCategoryCode:"holiday-overtime" as const,timeRange:{startTime:"20:00",endTime:"21:00",breakMinutes:0}};
    expect(getAllowanceRateCoverageError(createAllowanceCalculationSnapshot({...input,rateTable}),rateTable)).toBeNull();
    expect(getAllowanceRateCoverageError(createAllowanceCalculationSnapshot({...input,rateTable:allowanceRateDefaultMatrix}),allowanceRateDefaultMatrix)?.errorCode).toBe("ALLOWANCE_RATE_ZERO_AMOUNT");
    expect(getAllowanceRateCoverageError(createAllowanceCalculationSnapshot({...input,rateTable,timeRange:{...input.timeRange,breakMinutes:60}}),rateTable)).toBeNull();
  });

  it("should apply weekday overtime rates to overtime and night lines", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });

    expect(snapshot.businessCategoryCode).toBe("weekday-overtime");
    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 600,
      baseWorkMinutes: 480,
      overtimeMinutes: 120,
      nightMinutes: 0,
      holidayMinutes: 0,
      substituteMinutes: 0
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 120,
        multiplier: 1.5,
        amount: 30000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(30000);
  });

  it("should pay the full non-night span as overtime for standalone overtime rows", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-01-overtime-short",
      performanceApprovalId: "approval-01-overtime-short",
      allowanceCategoryCode: "weekday-overtime",
      workType: "overtime",
      timeRange: {
        startTime: "20:00",
        endTime: "22:00",
        breakMinutes: 30
      }
    });

    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 90,
      baseWorkMinutes: 0,
      overtimeMinutes: 90,
      nightMinutes: 0
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 90,
        multiplier: 1.5,
        amount: 22500
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(22500);
  });

  it("should round a single allowance line up to the next won when decimals occur", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-round-up",
      performanceApprovalId: "approval-round-up",
      allowanceCategoryCode: "weekday-overtime",
      hourlyRate: 10001,
      workType: "overtime",
      timeRange: {
        startTime: "20:00",
        endTime: "20:01",
        breakMinutes: 0
      }
    });

    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 1,
        multiplier: 1.5,
        amount: 251
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(251);
  });

  it("should round the raw allowance total once regardless of line split", () => {
    const hourlyRate = 17457.07;
    const threeLineCase = calculateRoundedAllowanceLineAmounts(hourlyRate, [
      {
        workMinutes: 90,
        multiplier: 1.5
      },
      {
        workMinutes: 150,
        multiplier: 1.5
      },
      {
        workMinutes: 390,
        multiplier: 1.5
      }
    ]);
    const twoLineCase = calculateRoundedAllowanceLineAmounts(hourlyRate, [
      {
        workMinutes: 480,
        multiplier: 1.5
      },
      {
        workMinutes: 150,
        multiplier: 1.5
      }
    ]);

    expect(threeLineCase.totalAmount).toBe(274949);
    expect(twoLineCase.totalAmount).toBe(274949);
    expect(threeLineCase.lineAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(
      threeLineCase.totalAmount
    );
    expect(twoLineCase.lineAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(
      twoLineCase.totalAmount
    );
  });

  it("should apply legal holiday rates across base overtime and night lines", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-02",
      performanceApprovalId: "approval-02",
      workDate: "2026-03-01",
      allowanceCategoryCode: "legal-holiday",
      isHoliday: true,
      timeRange: {
        startTime: "20:00",
        endTime: "06:00",
        breakMinutes: 60
      }
    });

    expect(snapshot.businessCategoryCode).toBe("legal-holiday");
    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 540,
      baseWorkMinutes: 60,
      overtimeMinutes: 60,
      nightMinutes: 420,
      holidayMinutes: 540
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "base",
        workMinutes: 60,
        multiplier: 1.5,
        amount: 15000
      },
      {
        allowanceCode: "overtime",
        workMinutes: 60,
        multiplier: 1.5,
        amount: 15000
      },
      {
        allowanceCode: "night",
        workMinutes: 420,
        multiplier: 1.5,
        amount: 105000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(135000);
  });

  it("should apply weekday substitute rates to all three axes", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-03",
      performanceApprovalId: "approval-03",
      allowanceCategoryCode: "weekday-substitute",
      workType: "substitute",
      timeRange: {
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    });

    expect(snapshot.businessCategoryCode).toBe("weekday-substitute");
    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 480,
      substituteMinutes: 480
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "base",
        workMinutes: 480,
        multiplier: 1.5,
        amount: 120000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(120000);
  });

  it("should create the same signature for the same input", () => {
    const left = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });
    const right = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });

    expect(createAllowanceCalculationSignature(left)).toBe(
      createAllowanceCalculationSignature(right)
    );
  });

  it("should change the signature when the business category changes", () => {
    const left = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });
    const right = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-substitute"
    });

    expect(createAllowanceCalculationSignature(left)).not.toBe(
      createAllowanceCalculationSignature(right)
    );
  });
});
