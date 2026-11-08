import { describe, expect, it } from "vitest";

import { allowanceRateVersionFixtures } from "./allowance-rate-fixtures";
import {
  selectActiveAllowanceRateVersion,
  selectApplicableAllowanceRateVersion,
  selectAppliedAllowanceRateVersion
} from "./allowance-rate-service";

describe("selectActiveAllowanceRateVersion", () => {
  it("should select the active version that matches the target date", () => {
    const result = selectActiveAllowanceRateVersion({
      targetDate: "2026-08-01",
      versions: allowanceRateVersionFixtures
    });

    expect(result?.id).toBe("rate-2026-2");
  });

  it("should ignore retired versions for new calculations", () => {
    const result = selectActiveAllowanceRateVersion({
      targetDate: "2026-03-15",
      versions: allowanceRateVersionFixtures
    });

    expect(result).toBeNull();
  });

  it("should select the currently applied version by active status", () => {
    const result = selectAppliedAllowanceRateVersion(allowanceRateVersionFixtures);

    expect(result?.id).toBe("rate-2026-2");
  });
});

describe("근무일에 유효한 요율", () => {
  it("CALC-01: 종료 이력도 확정된 과거 기간에는 사용한다", () => {
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-03-15",versions:allowanceRateVersionFixtures})?.id).toBe("rate-2026-1");
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-06-30",versions:allowanceRateVersionFixtures})?.id).toBe("rate-2026-1");
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-07-01",versions:allowanceRateVersionFixtures})?.id).toBe("rate-2026-2");
  });
  it("CALC-01: 공백·미래·초안·기간 미상 종료 버전은 대체하지 않는다", () => {
    const future={...allowanceRateVersionFixtures[1]!,effectiveFrom:"2027-01-01"};
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-03-15",versions:[future]})).toBeNull();
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-03-15",versions:[{...future,status:"draft",effectiveFrom:"2026-01-01"}]})).toBeNull();
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-03-15",versions:[{...future,status:"retired",effectiveFrom:"2026-01-01"}]})).toBeNull();
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-02-30",versions:allowanceRateVersionFixtures})).toBeNull();
  });
  it("CALC-01: 최신 시작일 우선이며 동일 시작일의 모호한 중복은 거부한다", () => {
    const first={...allowanceRateVersionFixtures[1]!,effectiveFrom:"2026-01-01"};
    const next={...first,id:"next",effectiveFrom:"2026-02-01"};
    expect(selectApplicableAllowanceRateVersion({targetDate:"2026-03-15",versions:[first,next]})?.id).toBe("next");
    expect(()=>selectApplicableAllowanceRateVersion({targetDate:"2026-03-15",versions:[first,{...first,id:"ambiguous"}]})).toThrow("중복");
  });
});
