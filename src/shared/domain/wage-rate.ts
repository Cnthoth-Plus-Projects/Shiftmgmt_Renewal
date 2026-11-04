import type { WageRateRecord } from "./model";

/** Select the timeline row first: a voided interval must never expose an older overlapping rate. */
export const getWageTimelineRowForDate = (rates: WageRateRecord[], day: string): WageRateRecord | undefined =>
  [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))
    .find(r => !r.employmentPeriodCancelled && (!r.employmentPeriodStart || r.employmentPeriodStart <= day) && (!r.retirementDate || day < r.retirementDate) && r.effectiveFrom <= day && (!r.effectiveTo || day <= r.effectiveTo));

export const resolveWageRateForDate = (rates: WageRateRecord[], day: string): WageRateRecord | undefined => {
  const row = getWageTimelineRowForDate(rates, day);
  return row && (!row.retirementDate || day < row.retirementDate) && !row.invalidation && Number.isFinite(row.hourlyRate) && row.hourlyRate > 0 ? row : undefined;
};
