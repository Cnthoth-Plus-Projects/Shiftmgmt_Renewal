import assert from "node:assert/strict";
import { seedAllowanceFixtures } from "./allowance-fixtures.mjs";

/** Normal existing API/workbook fixture; expectations independently reduce saved records. */
export async function seedDashboardFixtures({ page, isolatedRoot }) {
  const existing = await seedAllowanceFixtures({ page, isolatedRoot });
  const records = await page.evaluate(async () => { const r = await window.appBridge.listCalculationResults(); if (!r.ok) throw Error(r.message); return r.data; });
  assert.equal(records.length, 127);
  const expected = dashboardExpected(records, "2026-05");
  assert.equal(expected.count, 97); assert.equal(dashboardExpected(records, "2026-04").count, 30);
  assert.equal(new Set(records.map(r => r.status)).size, 4);
  assert.ok(records.every(r => r.employeeCode && r.snapshot && Number.isFinite(r.snapshot.totalAllowanceAmount)));
  return { ...existing, records, expected, sourceKind: "NORMAL_API_TEMP_WORKBOOKS" };
}
export function dashboardExpected(records, month = "2026-05", { site = "all", employee = "all", category = "all" } = {}) {
  const categoryOf = r => r.snapshot.businessCategoryCode === "legal-holiday" ? "legalHoliday" : ["weekday-substitute", "holiday-substitute"].includes(r.snapshot.businessCategoryCode) ? "substitute" : "overtime";
  const selected = records.filter(r => (month.length === 4 ? r.workDate.startsWith(month) : r.workDate.startsWith(month)) && (site === "all" || r.siteName === site) && (employee === "all" || r.employeeCode === employee) && (category === "all" || categoryOf(r) === category));
  return { amount: selected.reduce((n,r) => n+r.snapshot.totalAllowanceAmount,0), minutes: selected.reduce((n,r)=>n+r.snapshot.breakdown.totalWorkMinutes,0), count:selected.length, employees:new Set(selected.map(r=>r.employeeCode)).size, codes:[...new Set(selected.map(r=>r.employeeCode))].sort(), selected };
}
