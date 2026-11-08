import { describe, expect, it } from "vitest";

import type { AllowanceRateVersion } from "../../shared/domain/model";
import { selectRateVersionForWorkDate } from "./approved-allowance-calculation-service";

const makeVersion = (
  overrides: Partial<AllowanceRateVersion> & { id: string }
): AllowanceRateVersion => ({
  year: 2026,
  versionLabel: overrides.id,
  status: "active",
  effectiveFrom: "2026-01-01",
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [],
  ...overrides
});

describe("selectRateVersionForWorkDate", () => {
  it("uses the version effective on the work date even when a newer version is also active", () => {
    const oldVersion = makeVersion({
      id: "rate-old",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-05-31",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const newVersion = makeVersion({
      id: "rate-new",
      effectiveFrom: "2026-06-01",
      // 가장 최근에 수정된 버전. 과거 버그 코드는 날짜와 무관하게 이 버전을 먼저 골랐다.
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-10T00:00:00.000Z"
    });

    // 두 버전이 모두 활성이어도 3월 근무는 그 시점에 유효했던 옛 요율로 계산되어야 한다.
    expect(selectRateVersionForWorkDate([oldVersion, newVersion], "2026-03-15")?.id).toBe(
      "rate-old"
    );
    // 8월 근무는 새 요율.
    expect(selectRateVersionForWorkDate([oldVersion, newVersion], "2026-08-15")?.id).toBe(
      "rate-new"
    );
  });

  it("CALC-01: refuses a same-year future version when no range covers the work date", () => {
    const version = makeVersion({
      id: "rate-2026",
      effectiveFrom: "2026-06-01",
      effectiveTo: "2026-12-31"
    });

    expect(selectRateVersionForWorkDate([version], "2026-02-01")).toBeNull();
  });

  it("returns null when there is no active version", () => {
    const retired = makeVersion({ id: "rate-retired", status: "retired" });

    expect(selectRateVersionForWorkDate([retired], "2026-03-15")).toBeNull();
  });
  it("CALC-01: uses an explicitly bounded retired period and never a different-year fallback", () => {
    const past=makeVersion({id:"past",status:"retired",effectiveFrom:"2026-01-01",effectiveTo:"2026-06-30"});
    const future=makeVersion({id:"future",year:2027,effectiveFrom:"2027-01-01"});
    expect(selectRateVersionForWorkDate([past,future],"2026-03-15")?.id).toBe("past");
    expect(selectRateVersionForWorkDate([future],"2026-03-15")).toBeNull();
  });
});
