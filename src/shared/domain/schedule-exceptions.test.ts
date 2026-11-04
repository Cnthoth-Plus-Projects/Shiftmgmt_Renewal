import { describe,it,expect } from "vitest";
import { parseDateScheduleExceptions, validateDateScheduleExceptions, resolveDateScheduleExceptions } from "./schedule-exceptions";
import type { DateScheduleException, ExceptionShift } from "./schedule-exceptions";
const base:ExceptionShift={dutyCode:"D",startTime:"07:00",endTime:"15:00",breakMinutes:60};
const catalog=[base,{dutyCode:"N",startTime:"23:00",endTime:"07:00",breakMinutes:60}];
const entry=(extra:Partial<DateScheduleException>={}):DateScheduleException=>({id:"one",from:"2026-12-31",to:"2027-01-02",scope:"site",reason:"시설 점검",dutyCode:"O",...extra});
describe("dated schedule exceptions",()=>{
  it("keeps absent legacy policy and unselected dates unchanged",()=>{expect(parseDateScheduleExceptions(undefined)).toBeUndefined();expect(resolveDateScheduleExceptions([entry()],"2026-12-30","A조","e1",base,catalog)).toBe(base);});
  it("applies inclusive ranges across a year without changing later normal work",()=>{for(const date of ["2026-12-31","2027-01-01","2027-01-02"])expect(resolveDateScheduleExceptions([entry()],date,"A조","e1",base,catalog)).toEqual({dutyCode:"O",breakMinutes:0});expect(resolveDateScheduleExceptions([entry()],"2027-01-03","A조","e1",base,catalog)).toBe(base);});
  it("layers site, team and employee independent of registration order",()=>{
    const rows=[entry({id:"p",scope:"employee",employeeId:"e1",dutyCode:"D",timing:{startTime:"10:00",endTime:"14:00",breakMinutes:0}}),entry(),entry({id:"t",scope:"team",teamLabel:"A조",dutyCode:"N"})];
    expect(resolveDateScheduleExceptions(rows,"2027-01-01","A조","e1",base,catalog)).toMatchObject({dutyCode:"D",startTime:"10:00"});expect(resolveDateScheduleExceptions(rows,"2027-01-01","A조","e2",base,catalog)).toMatchObject({dutyCode:"N",startTime:"23:00"});expect(resolveDateScheduleExceptions(rows,"2027-01-01","B조","e1-other",base,catalog)).toEqual({dutyCode:"O",breakMinutes:0});
  });
  it("leaves off-duty unchanged for time-only changes, explicit work can replace off",()=>{
    const timing={startTime:"10:00",endTime:"19:00",breakMinutes:60};expect(resolveDateScheduleExceptions([entry(),entry({id:"time",scope:"team",teamLabel:"A조",dutyCode:undefined,timing})],"2027-01-01","A조","e1",base,catalog)).toEqual({dutyCode:"O",breakMinutes:0});
    expect(resolveDateScheduleExceptions([entry({dutyCode:undefined,timing})],"2027-01-01","A조","e1",base,catalog)).toMatchObject({dutyCode:"D",...timing});
  });
  it("rejects invalid dates, reverse ranges, duplicate ids, unknown types and empty changes",()=>{
    for(const rows of [[entry({from:"2026-02-30"})],[entry({from:"2027-01-03"})],[entry(),entry()],[entry({dutyCode:"Z" as "D"})],[entry({dutyCode:undefined})]])expect(()=>parseDateScheduleExceptions(rows)).toThrow();
  });
  it("rejects ambiguous overlaps on the same target but permits specificity and adjacent ranges",()=>{
    expect(validateDateScheduleExceptions([entry(),entry({id:"two",from:"2027-01-02",to:"2027-01-03"})],["A조"],["D"])).toContain("겹칩니다");
    expect(validateDateScheduleExceptions([entry(),entry({id:"two",scope:"team",teamLabel:"A조"})],["A조"],["D"])).toBeUndefined();
    expect(validateDateScheduleExceptions([entry(),entry({id:"two",from:"2027-01-03",to:"2027-01-04"})],["A조"],["D"])).toBeUndefined();
  });
  it("validates available teams/types, effective date and overnight break",()=>{
    expect(validateDateScheduleExceptions([entry({scope:"team",teamLabel:"gone"})],["A조"],["D"])).toContain("조");expect(validateDateScheduleExceptions([entry({dutyCode:"N"})],["A조"],["D"])).toContain("근무 유형");expect(validateDateScheduleExceptions([entry()],["A조"],["D"],"2027-01-01")).toContain("시작일");
    const row=entry({dutyCode:"N",timing:{startTime:"23:00",endTime:"07:00",breakMinutes:481}});expect(validateDateScheduleExceptions([row],["A조"],["N"])).toContain("휴게");row.timing!.endTime="23:00";expect(validateDateScheduleExceptions([row],["A조"],["N"])).toBeUndefined();
  });
  it("preserves private identity exactly and does not match a similarly named person",()=>{const r=entry({scope:"employee",employeeId:"employee-id-1"});expect(parseDateScheduleExceptions([r])).toEqual([r]);expect(resolveDateScheduleExceptions([r],"2027-01-01","A조","employee-id-2",base,catalog)).toBe(base);});
});
