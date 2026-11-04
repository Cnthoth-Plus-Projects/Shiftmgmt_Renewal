import { randomUUID } from "node:crypto";
import type { EmployeeSaveResult, EmployeeUpsertInput, EmployeeRehireChange } from "../../shared/bridge/contracts";
import type { AuthSession, EmployeeRecord } from "../../shared/domain/model";
import { canPerformAction } from "../../shared/domain/authorization";
import { isBpEmploymentType } from "../../shared/domain/employment-type";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import { resolveShiftPatternForDate } from "../../shared/domain/shift-pattern-version";
import { getSeoulTodayDateString, validateHireDate } from "../../shared/lib/local-date";
import { getSqliteDatabase } from "./sqlite-storage-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { historyEmploymentSql, listEmploymentPeriods, readScheduledRehire, reservationMoneyBlock } from "./employee-employment-service";

const one = (result: {changes:number|bigint}, message: string) => { if(Number(result.changes)!==1)throw new Error(message); };
const validDate = (value: unknown): value is string => typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;

/** Existing save channel calls this synchronous transaction; readSaved avoids a storage-module cycle. */
export const saveEmployeeRehire = (input: EmployeeUpsertInput, actor: AuthSession | undefined, readSaved: (id:string)=>EmployeeRecord|undefined): EmployeeSaveResult => {
  if(!actor?.userId || !actor.loginId || !canPerformAction(actor.role,"employee-write"))throw new Error("재입사 처리 권한이 없습니다.");
  const request=input.rehire;if(!request || !["start","reschedule","cancel"].includes(request.operation))throw new Error("재입사 요청 내용을 확인해 주세요.");
  if(!input.id)throw new Error("퇴사 직원 상세에서 재입사 처리를 시작해 주세요.");
  const db=getSqliteDatabase();if(!db)throw new Error("직원 저장소가 연결되지 않았습니다.");
  const reason=typeof request.reason==="string"?request.reason.trim():"";if(reason.length>500)throw new Error("처리 사유는 500자 이내로 입력해 주세요.");
  const now=new Date().toISOString(),today=getSeoulTodayDateString();
  const trustedActor={userId:actor.userId,loginId:actor.loginId,displayName:actor.displayName,role:actor.role};
  db.exec("SAVEPOINT w10_employee_rehire");
  try {
    const employee=db.prepare("SELECT * FROM employees WHERE id=?").get(input.id) as Record<string,unknown>|undefined;
    if(!employee || employee.deleted_at)throw new Error("재입사 대상 직원이 없거나 보관된 직원입니다. 인력 목록에서 직원 기록을 확인해 주세요.");
    const id=String(employee.id),code=String(employee.employee_code);
    if(input.employeeCode!==code)throw new Error("선택한 직원의 사원번호가 변경되었습니다. 직원을 다시 선택해 주세요.");
    if(input.name!==employee.name || input.employmentType!==employee.employment_type)throw new Error("입력 중 직원의 이름이나 고용형태가 바뀌었습니다. 최신 직원 정보를 다시 확인해 주세요.");
    const knownPeriods=listEmploymentPeriods(id).filter(period=>!period.cancelled);
    knownPeriods.forEach((period,index)=>{const prior=knownPeriods[index-1];if(!validDate(period.startDate)||period.endDate!==undefined&&(!validDate(period.endDate)||period.endDate<period.startDate)||prior&&(!prior.endDate||prior.endDate>period.startDate))throw new Error("기존 재직기간의 날짜가 겹치거나 올바르지 않습니다. 직원의 과거 재직기간을 먼저 확인해 주세요.");});
    if(knownPeriods.length&&knownPeriods[0].startDate!==employee.hire_date)throw new Error("기존 입사일과 보관된 재직기간 시작일이 다릅니다. 과거 재직기간 정보를 먼저 확인해 주세요.");
    let previousRetireDate:string,previousPeriodId:string,previousStartDate:string|undefined,cancelledPeriodId:string|undefined;
    const linkedHistories:Array<{kind:string;id:string;previousPeriodId:null}>=[];
    const event=(periodId:string,type:string,date:string,previousDate:string|null,body:Record<string,unknown>)=>one(db.prepare(`INSERT INTO employee_employment_period_events(id,employee_id,employment_period_id,event_type,event_date,previous_event_date,reason,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(),id,periodId,type,date,previousDate,JSON.stringify({version:1,actor:trustedActor,...body}),now),"재입사 처리 이력을 보존하지 못했습니다.");
    if(request.operation==="start"){
      if(employee.status!=="retired")throw new Error("이미 재직 중이거나 재입사 예약이 있습니다. 최신 직원 정보를 확인해 주세요.");
      if(!validDate(employee.hire_date)||!validDate(employee.retire_date))throw new Error("재입사 전에 기존 입사일과 퇴사일을 확인해 주세요. 확인되지 않은 날짜로 과거 재직기간을 만들지 않습니다.");
      previousRetireDate=employee.retire_date;
      const updated=employee.updated_at==null?undefined:String(employee.updated_at);
      if(request.expectedRetireDate!==previousRetireDate||request.expectedUpdatedAt!==updated)throw new Error("입력 중 직원 정보나 퇴사일이 바뀌었습니다. 직원을 다시 불러온 뒤 확인해 주세요.");
      const periods=knownPeriods;
      const previous=periods.at(-1);
      if(previous){
        if(previous.startDate>previousRetireDate||previous.endDate&&previous.endDate!==previousRetireDate)throw new Error("기존 퇴사일과 마지막 재직기간이 일치하지 않습니다. 과거 재직기간을 확인해 주세요.");
        previousPeriodId=previous.id;
        if(!previous.endDate)one(db.prepare("UPDATE employee_employment_periods SET end_date=?,updated_at=? WHERE id=? AND end_date IS NULL").run(previousRetireDate,now,previous.id),"이전 재직기간을 종료하지 못했습니다.");
      }else{
        previousPeriodId=randomUUID();one(db.prepare("INSERT INTO employee_employment_periods(id,employee_id,start_date,end_date,closure_provenance_complete,created_at) VALUES(?,?,?,?,?,?)").run(previousPeriodId,id,employee.hire_date,previousRetireDate,0,now),"이전 재직기간을 보존하지 못했습니다.");
      }
      for(const [kind,table] of [["wage","wage_rates"],["assignment","employee_site_assignments"]] as const){
        const rows=db.prepare(`SELECT id,employment_period_id FROM ${table} WHERE employee_id=?`).all(id) as Array<{id:string;employment_period_id:string|null}>;
        for(const row of rows){
          if(row.employment_period_id){if(!db.prepare("SELECT 1 FROM employee_employment_periods WHERE id=? AND employee_id=?").get(row.employment_period_id,id))throw new Error("다른 직원 또는 확인되지 않은 재직기간에 연결된 이력이 있습니다. 기존 이력을 확인해 주세요.");}
          else{if(periods.length>1)throw new Error("여러 재직기간 중 어느 기간의 시급·배정인지 확인되지 않는 이력이 있습니다. 임의로 연결하지 않았습니다. 과거 이력을 먼저 확인해 주세요.");one(db.prepare(`UPDATE ${table} SET employment_period_id=? WHERE id=? AND employee_id=? AND employment_period_id IS NULL`).run(previousPeriodId,row.id,id),"과거 이력의 재직기간 연결에 실패했습니다.");linkedHistories.push({kind,id:row.id,previousPeriodId:null});}
        }
      }
    }else{
      const scheduled=readScheduledRehire(id,code);
      if(!scheduled||scheduled.periodId!==request.periodId)throw new Error("변경할 예약이 없거나 재입사일이 이미 도래했습니다. 최신 직원 정보를 확인해 주세요.");
      if(scheduled.revisionToken!==request.expectedRevision)throw new Error("입력 중 예약이나 시급·배정 이력이 바뀌었습니다. 예약 내용을 다시 확인해 주세요.");
      if(!scheduled.canManage)throw new Error(scheduled.blockedReason||"예약 변경·취소 조건을 확인할 수 없습니다.");
      previousRetireDate=scheduled.previousRetireDate;previousStartDate=scheduled.startDate;cancelledPeriodId=scheduled.periodId;
      const prior=listEmploymentPeriods(id).filter(p=>!p.cancelled&&p.id!==scheduled.periodId&&p.endDate===previousRetireDate).at(-1);
      if(!prior)throw new Error("예약 전 퇴사 재직기간을 확인할 수 없습니다. 기존 이력을 확인해 주세요.");previousPeriodId=prior.id;
      one(db.prepare("UPDATE employee_employment_periods SET end_date=start_date,updated_at=? WHERE id=? AND employee_id=? AND end_date IS NULL").run(now,scheduled.periodId,id),"기존 예약을 취소 이력으로 보존하지 못했습니다.");
      event(scheduled.periodId,"rehire-cancelled",scheduled.startDate,scheduled.startDate,{cause:request.operation,previousRetireDate,previousPeriodId,reason,wageCount:scheduled.wageCount,assignmentCount:scheduled.assignmentCount});
      if(request.operation==="cancel"){
        one(db.prepare("UPDATE employees SET status='retired',retire_date=?,updated_at=? WHERE id=?").run(previousRetireDate,now,id),"직원 퇴사 상태를 복원하지 못했습니다.");
        const saved=readSaved(id);if(!saved)throw new Error("저장한 직원 정보를 확인하지 못했습니다.");
        const rehireChange:EmployeeRehireChange={kind:"reservation-cancelled",startDate:scheduled.startDate,previousStartDate:scheduled.startDate,previousRetireDate,employmentPeriodId:scheduled.periodId,newWageCount:0,newAssignmentCount:0};
        db.exec("RELEASE SAVEPOINT w10_employee_rehire");return {...saved,rehireChange};
      }
    }
    if(!validDate(request.startDate))throw new Error("올바른 재입사일을 입력해 주세요.");
    const dateValidation=validateHireDate(request.startDate,today);if(!dateValidation.valid)throw new Error(dateValidation.message?.replace(/입사일/g,"재입사일"));
    if(request.startDate<previousRetireDate)throw new Error(`재입사일은 이전 퇴사일(${previousRetireDate})보다 빠를 수 없습니다.`);
    if(request.operation==="reschedule"){const blocked=reservationMoneyBlock(code,request.startDate);if(blocked)throw new Error(blocked);}
    const site=db.prepare("SELECT id,status,deleted_at FROM sites WHERE id=?").get(request.siteId) as {id:string;status:string;deleted_at:string|null}|undefined;
    if(!site||site.deleted_at||site.status!=="active")throw new Error("사용 가능한 근무지를 선택해 주세요.");
    if(!db.prepare("SELECT 1 FROM shift_patterns LIMIT 1").get())throw new Error("근무조 정보가 아직 준비되지 않았습니다. 재입사 화면에서 근무지와 근무조를 먼저 불러와 주세요.");
    const group=normalizeTeamLabel(request.shiftGroup);const pattern=resolveShiftPatternForDate(listStoredShiftPatterns(site.id),request.startDate);
    if(!group||!pattern?.teamSettings.some(t=>t.isActive&&normalizeTeamLabel(t.teamLabel)===group))throw new Error("재입사일에 사용 가능한 근무조를 선택해 주세요.");
    const bp=isBpEmploymentType(String(employee.employment_type));
    if(bp && request.hourlyRate!==undefined)throw new Error("BP는 수당 지급 대상이 아니므로 재입사 시급을 등록하지 않습니다.");
    if(!bp && (typeof request.hourlyRate!=="number"||!Number.isFinite(request.hourlyRate)||request.hourlyRate<0||request.hourlyRate>Number.MAX_SAFE_INTEGER))throw new Error("새 시급을 0 이상의 유효한 숫자로 입력해 주세요. 0원과 미입력은 다릅니다.");
    const daySql="'"+request.startDate+"'";
    const capacity=pattern.teamCapacities?.find(t=>normalizeTeamLabel(t.teamLabel)===group)?.maxHeadcount;
    const count=db.prepare(`SELECT COUNT(DISTINCT a.employee_id) AS n FROM employee_site_assignments a JOIN employees e ON e.id=a.employee_id
      WHERE a.site_id=? AND a.shift_group=? AND a.employee_id<>? AND a.status='active' AND a.start_date<=? AND (a.end_date IS NULL OR a.end_date>?)
      AND (e.status<>'retired' OR e.retire_date IS NULL OR e.retire_date>?) AND ${historyEmploymentSql("a",daySql)}`).get(site.id,group,id,request.startDate,request.startDate,request.startDate) as {n:number};
    if(capacity&&capacity>0&&Number(count.n)>=capacity)throw new Error(`재입사일 기준 ${group} 정원(${capacity}명)을 초과합니다. 근무조를 다시 확인해 주세요.`);
    const order=db.prepare(`SELECT COALESCE(MAX(a.sort_order),0) AS n FROM employee_site_assignments a JOIN employees e ON e.id=a.employee_id WHERE a.site_id=? AND a.shift_group=? AND a.status='active'
      AND (a.end_date IS NULL OR a.end_date>?) AND (e.status<>'retired' OR e.retire_date IS NULL OR e.retire_date>?)
      AND NOT EXISTS(SELECT 1 FROM employee_employment_periods pp WHERE pp.id=a.employment_period_id AND pp.end_date IS NOT NULL AND pp.end_date<=?)`).get(site.id,group,request.startDate,request.startDate,request.startDate) as {n:number};
    const periodId=randomUUID(),wageId=bp?undefined:randomUUID(),assignmentId=randomUUID();
    one(db.prepare("INSERT INTO employee_employment_periods(id,employee_id,start_date,end_date,closure_provenance_complete,created_at) VALUES(?,?,?,NULL,1,?)").run(periodId,id,request.startDate,now),"새 재직기간을 저장하지 못했습니다.");
    if(wageId)one(db.prepare("INSERT INTO wage_rates(id,employee_id,employment_period_id,hourly_rate,effective_from,effective_to,reason,created_at) VALUES(?,?,?,?,?,NULL,?,?)").run(wageId,id,periodId,request.hourlyRate!,request.startDate,reason||"재입사 시급",now),"새 시급을 저장하지 못했습니다.");
    one(db.prepare("INSERT INTO employee_site_assignments(id,employee_id,employment_period_id,site_id,team_name,shift_group,sort_order,start_date,end_date,status,created_at) VALUES(?,?,?,?,?,?,?,?,NULL,'active',?)").run(assignmentId,id,periodId,site.id,group,group,Number(order.n)+1,request.startDate,now),"새 근무 배정을 저장하지 못했습니다.");
    one(db.prepare("UPDATE employees SET status='active',retire_date=NULL,updated_at=? WHERE id=?").run(now,id),"직원 재입사 상태를 저장하지 못했습니다.");
    event(periodId,"rehired",request.startDate,previousRetireDate,{operation:request.operation,previousRetireDate,previousPeriodId,cancelledPeriodId,wageId,assignmentId,linkedHistories,reason});
    const saved=readSaved(id);if(!saved)throw new Error("저장한 재입사 정보를 확인하지 못했습니다.");
    const rehireChange:EmployeeRehireChange={kind:request.operation==="reschedule"?"reservation-updated":"rehire",startDate:request.startDate,previousStartDate,previousRetireDate,employmentPeriodId:periodId,newWageCount:wageId?1:0,newAssignmentCount:1};
    db.exec("RELEASE SAVEPOINT w10_employee_rehire");return {...saved,rehireChange};
  }catch(error){try{db.exec("ROLLBACK TO SAVEPOINT w10_employee_rehire");db.exec("RELEASE SAVEPOINT w10_employee_rehire");}catch{/* An explicit SQLite ROLLBACK already removed the savepoint. Keep original failure. */}throw error;}
};
