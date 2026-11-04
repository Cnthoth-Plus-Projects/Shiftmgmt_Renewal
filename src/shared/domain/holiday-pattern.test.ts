import { describe, it, expect } from "vitest";
import { getPatternDutyCodes, holidayCategory, parseHolidayPatternPolicy, resolveHolidayStep, validateHolidayPolicy } from "./holiday-pattern";
import type { HolidayPatternPolicy } from "./holiday-pattern";
import type { ShiftPatternStep } from "./model";
const steps: ShiftPatternStep[] = ["D","E","N"].map((dutyCode,i)=>({id:dutyCode,dutyCode,stepIndex:i,startTime:["07:00","15:00","23:00"][i],endTime:["15:00","23:00","07:00"][i],breakMinutes:30}));
const policy = (): HolidayPatternPolicy => ({version:1,rules:{saturday:{mode:"separate",excludedDutyCodes:["E"],startDate:"2026-10-01",teamPatterns:{"A조":["D","N"],"B조":["N","D"]},times:{D:{startTime:"07:00",endTime:"20:00",breakMinutes:60},N:{startTime:"20:00",endTime:"07:00",breakMinutes:60}}}}});
describe("calendar-based holiday policy",()=>{
  it("uses calendar offsets across unselected weekdays; never counts holiday encounters",()=>{
    const p=policy();expect(resolveHolidayStep(p,"2026-10-03",new Set(),"A조",steps[1],steps).step.dutyCode).toBe("D");
    expect(resolveHolidayStep(p,"2026-10-10",new Set(),"A조",steps[1],steps).step.dutyCode).toBe("N");
    expect(resolveHolidayStep(p,"2026-10-10",new Set(),"B조",steps[1],steps).step.dutyCode).toBe("D");
  });
  it("preserves unselected dates and distinct per-category times",()=>{
    const p=policy(),weekday=resolveHolidayStep(p,"2026-10-05",new Set(),"A조",steps[1],steps);
    expect(weekday.step).toBe(steps[1]);expect(weekday.holiday).toBeUndefined();
    expect(resolveHolidayStep(p,"2026-10-03",new Set(),"A조",steps[0],steps).step.holidayEndTime).toBe("20:00");
  });
  it("gives selected public holiday priority over weekend and falls back when unchecked",()=>{
    const p=policy();p.rules.public={mode:"off",excludedDutyCodes:[]};const dates=new Set(["2026-10-03"]);
    expect(holidayCategory(p,"2026-10-03",dates)).toBe("public");expect(resolveHolidayStep(p,"2026-10-03",dates,"A조",steps[0],steps).step).toMatchObject({dutyCode:"O",breakMinutes:0});
    delete p.rules.public;expect(holidayCategory(p,"2026-10-03",dates)).toBe("saturday");
  });
  it("replaces an excluded type with off and clears its timing",()=>{
    const p=policy();p.rules.sunday={mode:"normal",excludedDutyCodes:["E"]};const result=resolveHolidayStep(p,"2026-10-04",new Set(),"A조",steps[1],steps);expect(result.step.dutyCode).toBe("O");expect(result.step.startTime).toBeUndefined();
  });
  it("handles dates before the alternate anchor with a positive modulo",()=>{
    const p=policy();p.rules.saturday!.startDate="2026-10-04";expect(resolveHolidayStep(p,"2026-10-03",new Set(),"A조",steps[0],steps).step.dutyCode).toBe("N");
  });
  it("rejects malformed cycles, invalid dates, missing teams and missing duty types",()=>{
    const p=policy();p.rules.saturday!.teamPatterns!["B조"]=["D"];
    expect(()=>parseHolidayPatternPolicy(p)).toThrow("같은 수");
    const q=policy();q.rules.saturday!.startDate="2026-02-30";expect(()=>parseHolidayPatternPolicy(q)).toThrow("시작일");
    expect(validateHolidayPolicy(policy(),["C조"],["D","N"])).toContain("모든 조");
    expect(validateHolidayPolicy(policy(),["A조","B조"],["D"])).toContain("없는 근무");
  });
  it("keeps legacy absence and stable named/renamed two-shift catalog codes",()=>{
    expect(parseHolidayPatternPolicy(undefined)).toBeUndefined();expect(getPatternDutyCodes([{id:"duty-day",kind:"work",sortOrder:0},{id:"duty-night",kind:"work",sortOrder:1}])).toEqual({"duty-day":"D","duty-night":"N"});
  });
  it("preserves legacy JSON and round-trips only an explicitly selected overlap priority",()=>{
    expect(parseHolidayPatternPolicy(policy())).toEqual(policy());
    const p=policy();p.overlapPriority="weekend";expect(parseHolidayPatternPolicy(p)).toEqual(p);
    expect(()=>parseHolidayPatternPolicy({...p,overlapPriority:"unknown"})).toThrow("우선순위");
  });
  it("uses team-specific holiday times, inherits untouched common codes and preserves optional data",()=>{
    const p=policy();p.rules.saturday!.teamTimes={"A조":{D:{startTime:"08:00",endTime:"21:00",breakMinutes:60}}};p.dateExceptions=[{id:"special",from:"2027-01-01",to:"2027-01-01",scope:"site",reason:"점검",dutyCode:"O"}];
    expect(parseHolidayPatternPolicy(p)).toEqual(p);expect(resolveHolidayStep(p,"2026-10-03",new Set(),"A조",steps[0],steps).step.startTime).toBe("08:00");expect(resolveHolidayStep(p,"2026-10-03",new Set(),"B조",steps[0],steps).step.startTime).toBe("20:00");
    p.rules.saturday!.teamTimes["A조"].D.breakMinutes=999;expect(validateHolidayPolicy(p,["A조","B조"],["D","N"])).toContain("근무 구간");
  });
  it("selects weekend priority only when that weekend rule is enabled",()=>{
    const p=policy();p.overlapPriority="weekend";p.rules.public={mode:"off",excludedDutyCodes:[]};p.rules.sunday={mode:"normal",excludedDutyCodes:[]};
    const dates=new Set(["2026-10-03","2026-10-04","2026-10-05"]);
    expect(holidayCategory(p,"2026-10-03",dates)).toBe("saturday");expect(holidayCategory(p,"2026-10-04",dates)).toBe("sunday");
    expect(holidayCategory(p,"2026-10-05",dates)).toBe("public");delete p.rules.saturday;expect(holidayCategory(p,"2026-10-03",dates)).toBe("public");
    delete p.rules.public;expect(holidayCategory(p,"2026-10-04",dates)).toBe("sunday");
  });
  it("continues alternate phase through consecutive public dates and the year boundary",()=>{
    const p:HolidayPatternPolicy={version:1,rules:{public:{mode:"separate",excludedDutyCodes:[],startDate:"2026-12-30",teamPatterns:{"A조":["D","N","O"]}}}};
    const dates=new Set(["2026-12-31","2027-01-01","2027-01-02"]);
    expect([...dates].map(date=>resolveHolidayStep(p,date,dates,"A조",steps[0],steps).step.dutyCode)).toEqual(["N","O","D"]);
  });
  it("validates used break lengths for daytime, overnight and 24-hour work without rejecting old read data",()=>{
    const p:HolidayPatternPolicy={version:1,rules:{public:{mode:"normal",excludedDutyCodes:[],times:{D:{startTime:"09:00",endTime:"17:00",breakMinutes:481}}}}};
    expect(parseHolidayPatternPolicy(p)).toEqual(p);expect(validateHolidayPolicy(p,["A조"],["D"])).toContain("근무 구간");
    const t=p.rules.public!.times!.D;t.startTime="23:00";t.endTime="07:00";expect(validateHolidayPolicy(p,["A조"],["D"])).toContain("근무 구간");
    t.startTime=t.endTime="00:00";t.breakMinutes=60;expect(validateHolidayPolicy(p,["A조"],["D"])).toBeUndefined();
    t.startTime="09:00";t.endTime="17:00";t.breakMinutes=481;p.rules.public!.excludedDutyCodes=["D"];expect(validateHolidayPolicy(p,["A조"],["D"])).toBeUndefined();
    p.rules.public!.excludedDutyCodes=[];p.rules.public!.mode="off";expect(validateHolidayPolicy(p,["A조"],["D"])).toBeUndefined();
  });
});
