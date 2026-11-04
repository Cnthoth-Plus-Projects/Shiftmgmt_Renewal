import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeUpsertInput } from "../../shared/bridge/contracts";
import { listStoredEmployees, listStoredEmployeesForSiteMonth, resetEmployeeStorageForTest, saveStoredEmployee } from "./employee-storage-service";
import { listStoredEmployeeAssignments, listStoredEmployeeWageRates } from "./employee-history-service";
import { closeSqliteStorage, getSqliteDatabase, initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredShiftPatterns, saveStoredShiftPattern } from "./shift-pattern-storage-service";
import { prepareReturnedScheduleFixture, syncPreparedReturnedSchedule, testAdminSession } from "./performance-test-helpers";
import { saveStoredEmployeeWageRate } from "./employee-history-service";
import { listEmploymentPeriods, reservationRevision } from "./employee-employment-service";
import { resolveWageRateForDate } from "../../shared/domain/wage-rate";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import type { EmployeeRecord } from "../../shared/domain/model";

const db=()=>getSqliteDatabase()!;
const raw=()=>["employees","employee_employment_periods","employee_employment_period_events","wage_rates","employee_site_assignments"].map(table=>db().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
const retire=(employee=listStoredEmployees().find(e=>e.employeeCode==="EMP-001")!,date="2026-03-16")=>saveStoredEmployee({...employee,status:"retired",retireDate:date,hourlyRate:undefined},testAdminSession);
const start=(employee:EmployeeRecord,startDate="2026-04-01",extra:Record<string,unknown>={})=>saveStoredEmployee({...employee,rehire:{operation:"start",startDate,siteId:listStoredEmployeeAssignments(employee.id)[0].siteId,shiftGroup:"A조",hourlyRate:15000,expectedUpdatedAt:employee.updatedAt,expectedRetireDate:employee.retireDate!,...extra}},testAdminSession);
const manage=(employee:EmployeeRecord,operation:"cancel"|"reschedule",extra:Record<string,unknown>={})=>saveStoredEmployee({...employee,rehire:{operation,periodId:employee.scheduledRehire!.periodId,expectedRevision:employee.scheduledRehire!.revisionToken,startDate:"2026-11-15",siteId:employee.scheduledRehire!.siteId,shiftGroup:"B조",hourlyRate:16000,...extra}},testAdminSession);
const clock=(iso="2026-11-01T00:00:00Z")=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date(iso));};

describe("W-10 same-code rehire", () => {
  let root: string;
  beforeEach(() => { root=mkdtempSync(path.join(os.tmpdir(),"shiftmgmt-w10-rehire-"));initializeSqliteStorage({dbPath:path.join(root,"test.sqlite")});listStoredShiftPatterns(); });
  afterEach(() => { vi.useRealTimers();resetPerformanceApprovalStateForTest();resetPerformanceFileStorageForTest();resetEmployeeStorageForTest();resetSqliteStorageForTest();if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith("shiftmgmt-w10-rehire-"))throw new Error("Unexpected W10 fixture path");rmSync(root,{recursive:true,force:true}); });

  it("explicit rehire keeps the same employee and starts only new period-bound histories", () => {
    const employee=listStoredEmployees().find(e=>e.employeeCode==="EMP-001")!;
    const siteId=employee.currentSiteId!,count=listStoredEmployees().length;
    const retired=saveStoredEmployee({...employee,hourlyRate:undefined,status:"retired",retireDate:"2026-03-16"},testAdminSession);
    const result=saveStoredEmployee({...retired,status:"active",retireDate:undefined,rehire:{operation:"start",startDate:"2026-04-01",siteId,shiftGroup:"A조",hourlyRate:15000,expectedUpdatedAt:retired.updatedAt,expectedRetireDate:retired.retireDate}} as unknown as EmployeeUpsertInput,testAdminSession);
    expect(result.id).toBe(employee.id);expect(result.employeeCode).toBe(employee.employeeCode);expect(result.hireDate).toBe(employee.hireDate);
    expect(listStoredEmployees()).toHaveLength(count);expect(listStoredEmployeeWageRates(employee.id)).toHaveLength(2);expect(listStoredEmployeeAssignments(employee.id)).toHaveLength(2);
    expect(result).toHaveProperty("rehireChange.kind","rehire");
  });

  it("future booking changes phase, wage and current assignment at Seoul midnight",()=>{
    clock();const retired=retire(),booked=start(retired,"2026-11-10");
    expect(booked).toMatchObject({employmentPhase:"scheduled",scheduledRehire:{startDate:"2026-11-10",canManage:true}});expect(booked.currentHourlyRate).toBeUndefined();expect(booked.currentSiteId).toBeUndefined();
    expect(listStoredEmployees({status:"active"}).some(e=>e.id===booked.id)).toBe(false);expect(listStoredEmployees({status:"scheduled"}).some(e=>e.id===booked.id)).toBe(true);
    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));const active=listStoredEmployees().find(e=>e.id===booked.id)!;
    expect(active).toMatchObject({employmentPhase:"employed",currentHourlyRate:15000,currentShiftGroup:"A조"});expect(active.scheduledRehire).toBeUndefined();expect(()=>manage(booked,"cancel")).toThrow(/이미 도래/);
  });
  it("old future raw histories remain unchanged and never override the new period, including after restart",()=>{
    clock();const employee=listStoredEmployees().find(e=>e.employeeCode==="EMP-001")!;
    saveStoredEmployeeWageRate({employeeId:employee.id,effectiveFrom:"2026-12-01",hourlyRate:99000,reason:"old future"});
    const retired=retire(employee),beforeWages=db().prepare("SELECT id,hourly_rate,effective_from,effective_to,reason FROM wage_rates WHERE employee_id=? ORDER BY rowid").all(employee.id);
    const booked=start(retired,"2026-11-10");expect(db().prepare("SELECT id,hourly_rate,effective_from,effective_to,reason FROM wage_rates WHERE employee_id=? ORDER BY rowid").all(employee.id).slice(0,beforeWages.length)).toEqual(beforeWages);
    expect(resolveWageRateForDate(listStoredEmployeeWageRates(employee.id),"2026-12-05")?.hourlyRate).toBe(15000);
    closeSqliteStorage();initializeSqliteStorage({dbPath:path.join(root,"test.sqlite")});expect(resolveWageRateForDate(listStoredEmployeeWageRates(employee.id),"2026-12-05")?.hourlyRate).toBe(15000);
    expect(listStoredEmployeeWageRates(employee.id).find(w=>w.hourlyRate===99000)?.employmentPeriodId).not.toBe(booked.rehireChange!.employmentPeriodId);
  });
  it("reschedule and cancel preserve planned wage/assignment rows and previous retirement",()=>{
    clock();const retired=retire(),booked=start(retired,"2026-11-10");const wages=db().prepare("SELECT * FROM wage_rates WHERE employment_period_id=?").all(booked.scheduledRehire!.periodId),assignments=db().prepare("SELECT * FROM employee_site_assignments WHERE employment_period_id=?").all(booked.scheduledRehire!.periodId);
    const moved=manage(booked,"reschedule");expect(moved.scheduledRehire?.startDate).toBe("2026-11-15");expect(listEmploymentPeriods(booked.id).find(p=>p.id===booked.scheduledRehire!.periodId)).toMatchObject({endDate:"2026-11-10",cancelled:true});
    expect(db().prepare("SELECT * FROM wage_rates WHERE employment_period_id=?").all(booked.scheduledRehire!.periodId)).toEqual(wages);expect(db().prepare("SELECT * FROM employee_site_assignments WHERE employment_period_id=?").all(booked.scheduledRehire!.periodId)).toEqual(assignments);
    expect(manage(moved,"cancel")).toMatchObject({status:"retired",retireDate:retired.retireDate,employmentPhase:"retired",rehireChange:{kind:"reservation-cancelled"}});
    expect(start(listStoredEmployees().find(e=>e.id===retired.id)!,"2026-11-20").scheduledRehire?.startDate).toBe("2026-11-20");
  });
  it("supports repeated actual rehire cycles without reviving the first period",()=>{
    clock();const first=start(retire()),again=retire(first,"2026-05-01"),second=start(again,"2026-06-01",{hourlyRate:18000});
    expect(second.hireDate).toBe(first.hireDate);expect(listEmploymentPeriods(first.id).filter(p=>!p.cancelled)).toHaveLength(3);
    expect(resolveWageRateForDate(listStoredEmployeeWageRates(first.id),"2026-05-15")).toBeUndefined();expect(resolveWageRateForDate(listStoredEmployeeWageRates(first.id),"2026-06-01")?.hourlyRate).toBe(18000);
  });
  it("site-month lookup excludes a whole gap month and includes the new period month",()=>{
    clock();const retired=retire(),siteId=listStoredEmployeeAssignments(retired.id)[0].siteId;start(retired,"2026-06-01");expect(listStoredEmployeesForSiteMonth(siteId,"2026-05").some(e=>e.id===retired.id)).toBe(false);expect(listStoredEmployeesForSiteMonth(siteId,"2026-03").some(e=>e.id===retired.id)).toBe(true);expect(listStoredEmployeesForSiteMonth(siteId,"2026-06").some(e=>e.id===retired.id)).toBe(true);
  });
  it.each(["2026-02-30","1989-12-31","2027-11-02","2026-03-15"])("rejects invalid/out-of-policy date %s atomically",date=>{clock();const retired=retire(),before=raw();expect(()=>start(retired,date)).toThrow();expect(raw()).toEqual(before);});
  it("allows equality with the previous retirement boundary",()=>{clock();expect(start(retire(),"2026-03-16").rehireChange?.startDate).toBe("2026-03-16");});
  it("rejects duplicates and stale retirement metadata",()=>{
    clock();const retired=retire();expect(()=>start({...retired,updatedAt:"stale"})).toThrow(/바뀌었습니다/);start(retired);const before=raw();expect(()=>start(retired)).toThrow(/이미 재직/);expect(raw()).toEqual(before);
  });
  it("rejects wrong identity, missing actor and unusable site/team",()=>{
    clock();const retired=retire(),before=raw();expect(()=>start({...retired,employeeCode:"other"})).toThrow(/사원번호/);expect(()=>start({...retired,name:"other"})).toThrow(/이름/);
    expect(()=>saveStoredEmployee({...retired,rehire:{operation:"start",startDate:"2026-04-01",siteId:"x",shiftGroup:"A조",hourlyRate:15000,expectedRetireDate:retired.retireDate!}})).toThrow(/권한/);
    expect(()=>start(retired,"2026-04-01",{siteId:"missing"})).toThrow(/근무지/);expect(()=>start(retired,"2026-04-01",{shiftGroup:"99조"})).toThrow(/근무조/);expect(raw()).toEqual(before);
  });
  it("does not let a basic edit change managed first-hire or bypass a reservation",()=>{
    clock();const booked=start(retire(),"2026-11-10");expect(()=>saveStoredEmployee({...booked,hireDate:"2025-01-01"},testAdminSession)).toThrow(/최초|입사일/);expect(()=>saveStoredEmployee({...booked,status:"retired",retireDate:"2026-11-02"},testAdminSession)).toThrow(/예약/);
    expect(()=>saveStoredEmployeeWageRate({employeeId:booked.id,effectiveFrom:"2026-11-10",hourlyRate:22000})).toThrow(/예약/);expect(()=>saveStoredEmployeeWageRate({employeeId:booked.id,effectiveFrom:"2026-05-01",hourlyRate:22000})).toThrow(/재직기간/);
  });
  it("detects stale reservation revisions and a separately appended wage event",()=>{
    clock();const booked=start(retire(),"2026-11-10"),scheduled=booked.scheduledRehire!;const wage=listStoredEmployeeWageRates(booked.id).find(w=>w.employmentPeriodId===scheduled.periodId)!;
    db().prepare("INSERT INTO wage_rate_history(id,wage_rate_id,employee_id,employment_period_id,employee_code,action_type,hourly_rate,effective_from,change_reason,actor_user_id,actor_login_id,actor_display_name,actor_role,occurred_at) VALUES('w10-event',?,?,?,?, 'invalidated',?,?, 'independent event','u','admin','관리자','admin','2026-11-01')").run(wage.id,booked.id,scheduled.periodId,booked.employeeCode,wage.hourlyRate,wage.effectiveFrom);
    expect(reservationRevision(booked.id,scheduled.periodId)).not.toBe(scheduled.revisionToken);expect(()=>manage(booked,"cancel")).toThrow(/바뀌었습니다/);
  });
  it("cancelling a booking before a future retirement preserves today's existing employment",()=>{
    clock();const retired=retire(undefined,"2026-11-05"),booked=start(retired,"2026-11-10"),cancelled=manage(booked,"cancel");expect(cancelled).toMatchObject({status:"retired",retireDate:"2026-11-05",employmentPhase:"employed"});expect(listStoredEmployees({status:"active"}).some(e=>e.id===cancelled.id)).toBe(true);expect(listStoredEmployees({status:"retired"}).some(e=>e.id===cancelled.id)).toBe(false);
  });
  it("BP rehire creates an assignment without a payable wage and rejects an explicit wage",()=>{
    clock();const siteId=listStoredEmployees()[0].currentSiteId!,employee=saveStoredEmployee({employeeCode:"W10-BP",name:"외부 직원",employmentType:"BP",status:"active",hireDate:"2024-01-01",siteId,shiftGroup:"A조"});const retired=retire(employee);expect(()=>start(retired,"2026-04-01")).toThrow(/BP/);const result=start(retired,"2026-04-01",{hourlyRate:undefined});expect(result.rehireChange).toMatchObject({newWageCount:0,newAssignmentCount:1});expect(listStoredEmployeeWageRates(employee.id)).toEqual([]);
  });
  it("checks the configured team capacity on the requested rehire day",()=>{
    clock();const employee=listStoredEmployees().find(e=>e.employeeCode==="EMP-001")!,siteId=employee.currentSiteId!;
    saveStoredEmployee({employeeCode:"W10-CAPACITY",name:"정원 점유 직원",employmentType:"정규",status:"active",hireDate:"2024-01-01",siteId,shiftGroup:"A조",hourlyRate:12000});
    const pattern=listStoredShiftPatterns(siteId)[0];saveStoredShiftPattern({...pattern,teamCapacities:[{teamLabel:"A조",maxHeadcount:1}]});const retired=retire(employee),before=raw();expect(()=>start(retired,"2026-11-10")).toThrow(/정원/);expect(raw()).toEqual(before);
  });
  it("rejects ambiguous NULL history links after multiple periods",()=>{
    clock();const again=retire(start(retire()),"2026-05-01");db().prepare("UPDATE wage_rates SET employment_period_id=NULL WHERE employee_id=?").run(again.id);const before=raw();expect(()=>start(again,"2026-06-01")).toThrow(/어느 기간/);expect(raw()).toEqual(before);
  });
  it.each(["reschedule","cancel"] as const)("rolls back an existing booking intact when %s cannot finish",operation=>{
    clock();const booked=start(retire(),"2026-11-10"),before=raw();
    db().exec(operation==="reschedule"?"CREATE TEMP TRIGGER w10_reschedule_failure BEFORE INSERT ON wage_rates BEGIN SELECT RAISE(ABORT,'replacement rejected'); END":"CREATE TEMP TRIGGER w10_cancel_failure BEFORE UPDATE ON employees BEGIN SELECT RAISE(IGNORE); END");
    expect(()=>manage(booked,operation)).toThrow();expect(raw()).toEqual(before);
  });
  it("rejects overlapping stored historical periods before creating another",()=>{
    clock();const retired=retire();db().prepare("INSERT INTO employee_employment_periods(id,employee_id,start_date,end_date,closure_provenance_complete,created_at) VALUES('w10-overlap',?,'2025-01-01','2026-03-16',0,'x')").run(retired.id);const before=raw();expect(()=>start(retired)).toThrow(/겹치/);expect(raw()).toEqual(before);
  });
  for(const table of ["employee_employment_periods","wage_rates","employee_site_assignments","employees","employee_employment_period_events"]){
    it.each(["ABORT","ROLLBACK","IGNORE"])(`rolls back the entire rehire when ${table} uses RAISE(%s)`,mode=>{
      clock();const retired=retire(),before=raw(),operation=table==="employees"?"UPDATE":"INSERT",guard=table==="employee_employment_period_events"?" WHEN NEW.event_type='rehired'":"";
      db().exec(`CREATE TEMP TRIGGER w10_failure BEFORE ${operation} ON ${table}${guard} BEGIN SELECT RAISE(${mode}${mode==="IGNORE"?"":", 'W10 injected failure'"}); END`);
      expect(()=>start(retired)).toThrow();expect(raw()).toEqual(before);
    });
  }
  it.each(["covered","calculation-only","nullable-columns","missing-snapshot","conflicting-date"])("preserves archives and blocks reservation management with %s financial proof",async mode=>{
    clock("2026-03-01T00:00:00Z");const fixture=await prepareReturnedScheduleFixture({rootDir:path.join(root,"returned")}),detail=await syncPreparedReturnedSchedule(fixture),target=detail.entries.find(e=>e.section==="overtime")!,employee=listStoredEmployees().find(e=>e.employeeCode===target.employeeCode)!;
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);
    const retired=retire(employee,target.workDate),booked=start(retired,target.workDate,{siteId:employee.currentSiteId,shiftGroup:employee.currentShiftGroup});
    if(mode==="calculation-only")db().prepare("DELETE FROM performance_approvals WHERE employee_code=?").run(employee.employeeCode);
    if(mode==="nullable-columns")db().prepare("UPDATE performance_approvals SET employee_code=NULL,work_date=NULL WHERE employee_code=?").run(employee.employeeCode);
    if(mode==="missing-snapshot"||mode==="conflicting-date"){
      db().prepare("DELETE FROM allowance_calculation_items WHERE calculation_id IN (SELECT id FROM allowance_calculations WHERE employee_code=?)").run(employee.employeeCode);db().prepare("DELETE FROM allowance_calculations WHERE employee_code=?").run(employee.employeeCode);
      if(mode==="missing-snapshot")db().prepare("UPDATE performance_approvals SET work_date='2026-02-01',snapshot_json='broken' WHERE employee_code=?").run(employee.employeeCode);
      else{const row=db().prepare("SELECT snapshot_json FROM performance_approvals WHERE employee_code=?").get(employee.employeeCode) as {snapshot_json:string};const snapshot=JSON.parse(row.snapshot_json);snapshot.entry.workDate="2026-02-02";db().prepare("UPDATE performance_approvals SET work_date='2026-02-01',snapshot_json=? WHERE employee_code=?").run(JSON.stringify(snapshot),employee.employeeCode);}
    }
    await syncPreparedReturnedSchedule(fixture);const archives=db().prepare("SELECT * FROM performance_approvals ORDER BY rowid").all(),before=raw();const current=listStoredEmployees().find(e=>e.id===booked.id)!;
    expect(current.scheduledRehire?.canManage).toBe(false);expect(()=>manage(current,"cancel")).toThrow(/승인|계산/);expect(raw()).toEqual(before);expect(db().prepare("SELECT * FROM performance_approvals ORDER BY rowid").all()).toEqual(archives);
  });
  it("rescheduling earlier cannot newly cover an archived approved work date",async()=>{
    clock("2026-03-01T00:00:00Z");const fixture=await prepareReturnedScheduleFixture({rootDir:path.join(root,"returned")}),detail=await syncPreparedReturnedSchedule(fixture),target=detail.entries.find(entry=>entry.section==="overtime")!,employee=listStoredEmployees().find(e=>e.employeeCode===target.employeeCode)!;
    expect((await approvePerformanceFile({fileId:detail.id,entryId:target.id},testAdminSession,{userDataPath:fixture.userDataPath})).ok).toBe(true);
    const shift=(days:number)=>new Date(Date.parse(target.workDate+"T00:00:00Z")+days*86400000).toISOString().slice(0,10),retired=retire(employee,shift(-1)),booked=start(retired,shift(2),{siteId:employee.currentSiteId,shiftGroup:employee.currentShiftGroup});expect(booked.scheduledRehire?.canManage).toBe(true);const before=raw();expect(()=>manage(booked,"reschedule",{startDate:target.workDate,siteId:employee.currentSiteId,shiftGroup:employee.currentShiftGroup})).toThrow(/승인|계산/);expect(raw()).toEqual(before);
  });
});
