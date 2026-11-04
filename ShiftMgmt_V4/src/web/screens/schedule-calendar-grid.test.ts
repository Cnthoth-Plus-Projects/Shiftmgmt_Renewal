import { describe,it,expect } from "vitest";
import { monthCalendarCells,calendarTeamDays } from "./schedule-calendar-grid";
import { getDaysInMonth, type ScheduleRosterRow } from "./schedule-model";
const person=(id:string,team:string,days:ScheduleRosterRow["days"]):ScheduleRosterRow=>({rowKey:`${team}:${id}`,employeeId:id,employeeCode:id,name:id,shiftGroup:team,displayName:team,assignmentOrder:0,days,weeklySummary:[],totalWorkMinutes:0,totalWorkDays:0,nightDaysCount:0});
const duty=(date:string,code:string,label=code)=>({date,dayNumber:Number(date.slice(8)),dayOfWeek:"월",dutyCode:code,dutyLabel:label,isHoliday:false});
describe("actual Sunday-first schedule calendar",()=>{
  it.each([["2026-02",28,4],["2028-02",29,5],["2026-04",30,5],["2026-05",31,6]] as const)("aligns every date in %s without dropping any day",(month,count,weeks)=>{
    const dates=getDaysInMonth(month),cells=monthCalendarCells(dates);expect(cells.length).toBe(weeks*7);expect(cells.filter(c=>c.inMonth).map(c=>c.date)).toEqual(dates);expect(cells.filter(c=>c.inMonth)).toHaveLength(count);expect(new Date(`${cells[0].date}T12:00:00Z`).getUTCDay()).toBe(0);expect(new Date(`${cells.at(-1)!.date}T12:00:00Z`).getUTCDay()).toBe(6);
  });
  it("handles December year rollover and no-date input",()=>{const cells=monthCalendarCells(getDaysInMonth("2026-12"));expect(cells.at(-1)?.date.startsWith("2027-01")).toBe(true);expect(monthCalendarCells([])).toEqual([]);});
  it("uses all supplied people, respects inactive assignment segments and preserves custom types",()=>{
    const date="2026-05-05",rows=[person("same","A조",{}),person("same","B조",{[date]:duty(date,"N","심야 운영")}),person("two","B조",{[date]:duty(date,"O","휴무")}),...Array.from({length:55},(_,i)=>person(`worker-${i}`,"C조",{[date]:duty(date,"D","1근")}))],before=structuredClone(rows),groups=calendarTeamDays(rows,date);
    expect(groups.map(g=>g.team)).toEqual(["B조","C조"]);expect(groups[0].workers.map(r=>r.employeeId)).toEqual(["same"]);expect(groups[0].duties.map(d=>d.label)).toEqual(["심야 운영","휴무"]);expect(groups[1].workers).toHaveLength(55);expect(rows).toEqual(before);
  });
  it("keeps personal timing exceptions visible even when the team's duty code is identical",()=>{
    const date="2026-05-05",base={...duty(date,"D","주간"),startTime:"07:00",endTime:"19:00",unpaidBreakMinutes:60};
    const groups=calendarTeamDays([person("one","A조",{[date]:base}),person("two","A조",{[date]:{...base,startTime:"08:00"}}),person("three","A조",{[date]:{...base,unpaidBreakMinutes:30}})],date);
    expect(groups).toHaveLength(1);expect(groups[0].duties).toHaveLength(3);expect(groups[0].workers).toHaveLength(3);expect(groups[0].duties.map(d=>d.timeLabel)).toEqual(["07:00–19:00","08:00–19:00","07:00–19:00"]);
  });
});
