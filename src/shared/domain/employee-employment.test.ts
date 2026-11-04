import { describe, expect, it } from "vitest";
import { assignmentEmploymentBounds, employmentPhaseOnDate, isEmployeeEmployedOnDate, matchesEmployeeEmploymentStatus } from "./employee-employment";
import { resolveWageRateForDate } from "./wage-rate";
import type { EmployeeRecord, EmployeeSiteAssignment, WageRateRecord } from "./model";

const periods=[{id:"old",startDate:"2024-01-01",endDate:"2026-03-16"},{id:"cancelled",startDate:"2026-04-01",endDate:"2026-04-01",cancelled:true},{id:"new",startDate:"2026-04-10"}];
describe("W10 employment boundaries",()=>{
  it.each([["2024-01-01",true],["2026-03-15",true],["2026-03-16",false],["2026-04-01",false],["2026-04-09",false],["2026-04-10",true]])("uses half-open periods on %s",(day,expected)=>expect(isEmployeeEmployedOnDate({employmentPeriods:periods},day)).toBe(expected));
  it("an explicit empty managed timeline fails closed",()=>expect(isEmployeeEmployedOnDate({employmentPeriods:[]},"2026-04-10")).toBe(false));
  it("scheduled phase changes on the actual start date without changing the saved periods",()=>{
    expect(employmentPhaseOnDate(periods,"2026-04-09")).toBe("scheduled");expect(employmentPhaseOnDate(periods,"2026-04-10")).toBe("employed");
    const employee={status:"active",employmentPeriods:periods,scheduledRehire:{startDate:"2026-04-10"}} as EmployeeRecord;
    expect(matchesEmployeeEmploymentStatus(employee,"active","2026-04-09")).toBe(false);expect(matchesEmployeeEmploymentStatus(employee,"scheduled","2026-04-09")).toBe(true);expect(matchesEmployeeEmploymentStatus(employee,"active","2026-04-10")).toBe(true);
  });
  it("clamps schedule assignments to their own period and excludes a cancelled booking",()=>{
    const assignment={startDate:"2024-01-01",retirementDate:"2026-03-16"} as EmployeeSiteAssignment;
    expect(assignmentEmploymentBounds(assignment)).toMatchObject({endDate:"2026-03-16",excluded:false});
    expect(assignmentEmploymentBounds({...assignment,startDate:"2026-04-01"}).excluded).toBe(true);
    expect(assignmentEmploymentBounds({...assignment,employmentPeriodCancelled:true}).excluded).toBe(true);
  });
  it("filters prior-period future rates before applying an invalidation barrier",()=>{
    const rates=[{id:"prior-future",effectiveFrom:"2026-05-01",hourlyRate:99000,retirementDate:"2026-03-16",invalidation:{}},{id:"new",effectiveFrom:"2026-04-10",hourlyRate:15000,employmentPeriodStart:"2026-04-10"}] as WageRateRecord[];
    expect(resolveWageRateForDate(rates,"2026-05-01")?.hourlyRate).toBe(15000);
    expect(resolveWageRateForDate([{...rates[1],invalidation:{} as NonNullable<WageRateRecord["invalidation"]>}],"2026-05-01")).toBeUndefined();
  });
});
