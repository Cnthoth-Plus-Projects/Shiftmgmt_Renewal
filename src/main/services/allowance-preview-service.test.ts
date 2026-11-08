import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredAllowanceRateVersions, saveStoredAllowanceRateVersion, saveStoredHolidayItem } from "./operations-storage-service";
import { createAllowanceRateItems, allowanceRateDefaultMatrix } from "../../shared/domain/allowance-rate-matrix";

import { previewAllowanceCalculation } from "./allowance-preview-service";

describe("previewAllowanceCalculation", () => {
  beforeEach(()=>initializeSqliteStorage({dbPath:path.resolve(process.cwd(),"artifacts/tests/allowance-preview.test.sqlite")}));
  afterEach(()=>{vi.useRealTimers();resetSqliteStorageForTest();});
  it("should return a successful preview result for a valid input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T06:00:00.000Z"));

    const result = previewAllowanceCalculation({
      workDate: "2026-03-03",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      hourlyRate: 10000,
      workType: "substitute"
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.breakdown.totalWorkMinutes).toBe(480);
      expect(result.data.businessCategoryCode).toBe("weekday-substitute");
      expect(result.data.totalAllowanceAmount).toBe(120000);
      expect(result.data.createdAt).toBe("2026-03-11T06:00:00.000Z");
    }

    vi.useRealTimers();
  });

  it("should return a failure result for an invalid time input", () => {
    const result = previewAllowanceCalculation({
      workDate: "2026-03-03",
      startTime: "99:00",
      endTime: "18:00",
      breakMinutes: 60,
      hourlyRate: 10000
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "ALLOWANCE_PREVIEW_FAILED"
    });
  });
  it("CALC-03: uses the saved applicable holiday overtime rates instead of default preview rates", () => {
    const version=listStoredAllowanceRateVersions().find(v=>v.id==="rate-2026-1")!;
    saveStoredAllowanceRateVersion({...version,status:"active",changeReason:"시험 요율 정정",items:createAllowanceRateItems(version.id,{...allowanceRateDefaultMatrix,"holiday-overtime":{base:0,overtime:2,night:2.5}})});
    saveStoredHolidayItem({year:2026,holidayDate:"2026-03-03",name:"시험 공휴일"});
    const result=previewAllowanceCalculation({workDate:"2026-03-03",startTime:"20:00",endTime:"01:00",breakMinutes:30,hourlyRate:14100,workType:"overtime"});
    expect(result.ok).toBe(true);
    if(result.ok){expect(result.data.businessCategoryCode).toBe("holiday-overtime");expect(result.data.totalAllowanceAmount).toBe(144525);}
  });
  it("CALC-03: fails when the work date has no published rate",()=>{
    expect(previewAllowanceCalculation({workDate:"2025-03-03",startTime:"20:00",endTime:"21:00",breakMinutes:0,hourlyRate:14100,workType:"overtime"})).toMatchObject({ok:false,errorCode:"ALLOWANCE_RATE_NOT_FOUND"});
  });
});
