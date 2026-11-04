import { createHash } from "node:crypto";
import type { EmployeeEmploymentPeriod, EmployeeRecord, ScheduledEmployeeRehire } from "../../shared/domain/model";
import { employmentPhaseOnDate, employmentPeriodContains } from "../../shared/domain/employee-employment";
import { getSeoulTodayDateString } from "../../shared/lib/local-date";
import { getSqliteDatabase } from "./sqlite-storage-service";

export interface StoredEmploymentPeriod extends EmployeeEmploymentPeriod { employeeId: string; provenanceComplete: boolean }
const database = () => { const db=getSqliteDatabase();if(!db)throw new Error("직원 저장소가 연결되지 않았습니다.");return db; };
const iso = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export const hasManagedEmployment = (employeeId: string): boolean => Boolean(database().prepare("SELECT 1 FROM employee_employment_period_events WHERE employee_id=? AND event_type='rehired' LIMIT 1").get(employeeId));
export const listEmploymentPeriods = (employeeId: string): StoredEmploymentPeriod[] => (database().prepare(`
  SELECT p.*, EXISTS(SELECT 1 FROM employee_employment_period_events e WHERE e.employment_period_id=p.id AND e.event_type='rehire-cancelled') AS cancelled
  FROM employee_employment_periods p WHERE p.employee_id=? ORDER BY p.start_date,p.created_at,p.rowid
`).all(employeeId) as Array<Record<string, unknown>>).map(row=>({id:String(row.id),employeeId:String(row.employee_id),startDate:String(row.start_date),...(row.end_date == null ? {} : {endDate:String(row.end_date)}),...(row.cancelled ? {cancelled:true} : {}),provenanceComplete:Boolean(row.closure_provenance_complete)}));
export const managedEmploymentPeriodOnDate = (employeeId: string, day: string): StoredEmploymentPeriod | undefined => listEmploymentPeriods(employeeId).find(period=>employmentPeriodContains(period,day));

/** All identifiers/expressions come from fixed SQL call sites; input dates use parameters or validated ISO literals. */
export const historyEmploymentSql = (alias: string, dayExpression: string): string => `(
  NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=${alias}.employee_id AND em.event_type='rehired')
  OR EXISTS(SELECT 1 FROM employee_employment_periods ep WHERE ep.id=${alias}.employment_period_id AND ep.employee_id=${alias}.employee_id
    AND ep.start_date<=${dayExpression} AND (ep.end_date IS NULL OR ${dayExpression}<ep.end_date)
    AND NOT EXISTS(SELECT 1 FROM employee_employment_period_events ec WHERE ec.employment_period_id=ep.id AND ec.event_type='rehire-cancelled'))
)`;
export const historyEmploymentOverlapSql = (alias: string, startColumn: string, endColumn: string, first: string, last: string, inclusiveEnd = false): string => `(
  NOT EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=${alias}.employee_id AND em.event_type='rehired')
  OR EXISTS(SELECT 1 FROM employee_employment_periods ep WHERE ep.id=${alias}.employment_period_id AND ep.employee_id=${alias}.employee_id
    AND ep.start_date<=${last} AND (ep.end_date IS NULL OR ep.end_date>${first})
    AND (ep.end_date IS NULL OR ${alias}.${startColumn}<ep.end_date) AND (${alias}.${endColumn} IS NULL OR ${alias}.${endColumn}${inclusiveEnd ? ">=" : ">"}ep.start_date)
    AND NOT EXISTS(SELECT 1 FROM employee_employment_period_events ec WHERE ec.employment_period_id=ep.id AND ec.event_type='rehire-cancelled'))
)`;

/** Approved snapshots and calculations survive cache replacement. Never rely on current entries alone. */
export const reservationMoneyBlock = (employeeCode: string, startDate: string): string | undefined => {
  const db=database(),target=employeeCode.trim().toLowerCase();
  const rows=[...db.prepare("SELECT 'approval' AS proof_kind,id,employee_code,work_date,snapshot_json FROM performance_approvals WHERE decision='approved'").all(),...db.prepare(`SELECT 'calculation' AS proof_kind,c.id,c.employee_code,c.work_date,c.snapshot_json,c.performance_approval_id,a.id AS linked_id,a.employee_code AS linked_code,a.work_date AS linked_date,a.snapshot_json AS linked_snapshot FROM allowance_calculations c LEFT JOIN performance_approvals a ON a.id=c.performance_approval_id`).all()] as Array<Record<string, unknown>>;
  for(const row of rows){
    const parse=(value:unknown):Record<string,unknown>|undefined=>{try{return record(JSON.parse(String(value??"null")));}catch{return undefined;}};
    const snapshot=parse(row.snapshot_json),entry=record(snapshot?.entry),linked=row.linked_id?parse(row.linked_snapshot):undefined,linkedEntry=record(linked?.entry);
    const claims=[{code:row.employee_code,date:row.work_date},{code:snapshot?.employeeCode,date:snapshot?.workDate},{code:entry?.employeeCode,date:entry?.workDate},...(row.linked_id?[{code:row.linked_code,date:row.linked_date},{code:linkedEntry?.employeeCode,date:linkedEntry?.workDate}]:[])];
    const identified=claims.filter(claim=>typeof claim.code==="string"&&claim.code.trim().length>0),codes=new Set(identified.map(claim=>(claim.code as string).trim().toLowerCase()));
    if(!codes.size)return "승인·계산 이력의 직원과 근무일을 확인할 수 없어 예약 변경·취소를 진행하지 않았습니다. 실적 관리에서 보관 이력을 확인해 주세요.";
    if(!codes.has(target))continue;
    // Calculation snapshots store their calculation/approval IDs, breakdown and amount, not employee/date.
    // Their independent archive columns provide identity/date; compare any linked approval proof as well.
    const validSnapshot=row.proof_kind==="approval"?Boolean(entry&&typeof entry.employeeCode==="string"&&entry.employeeCode.trim()&&iso(entry.workDate)):Boolean(snapshot&&snapshot.id===row.id&&snapshot.performanceApprovalId===row.performance_approval_id&&record(snapshot.breakdown)&&Array.isArray(snapshot.lines)&&typeof snapshot.totalAllowanceAmount==="number"&&Number.isFinite(snapshot.totalAllowanceAmount)&&iso(row.work_date));
    const dates=claims.map(claim=>claim.date).filter(value=>value!==undefined&&value!==null&&value!=="");
    const validLinked=!row.linked_id||Boolean(linkedEntry&&typeof linkedEntry.employeeCode==="string"&&linkedEntry.employeeCode.trim()&&iso(linkedEntry.workDate));
    if(!validSnapshot||!validLinked||codes.size>1||!dates.length||new Set(dates).size!==1||dates.some(value=>!iso(value)))return "해당 직원의 승인·계산 보관 이력이 누락·손상되었거나 직원·근무일 정보가 서로 다릅니다. 예약을 변경하지 않았습니다. 실적 관리에서 보관 이력을 먼저 확인해 주세요.";
    if(dates.some(value=>iso(value)&&value>=startDate))return "해당 재입사 기간에 승인·계산 이력이 있어 예약을 변경하거나 취소할 수 없습니다. 실적 관리에서 관련 이력을 확인해 주세요.";
  }
  return undefined;
};

export const reservationRevision = (employeeId: string, periodId: string): string => {
  const db=database();return createHash("sha256").update(JSON.stringify([
    db.prepare("SELECT id,employee_code,status,hire_date,retire_date,updated_at,deleted_at FROM employees WHERE id=?").get(employeeId),
    db.prepare("SELECT * FROM employee_employment_periods WHERE id=? AND employee_id=?").get(periodId,employeeId),
    db.prepare("SELECT * FROM wage_rates WHERE employee_id=? AND employment_period_id=? ORDER BY rowid").all(employeeId,periodId),
    db.prepare("SELECT h.* FROM wage_rate_history h JOIN wage_rates w ON w.id=h.wage_rate_id WHERE w.employee_id=? AND w.employment_period_id=? ORDER BY h.rowid").all(employeeId,periodId),
    db.prepare("SELECT * FROM employee_site_assignments WHERE employee_id=? AND employment_period_id=? ORDER BY rowid").all(employeeId,periodId),
    db.prepare("SELECT event_type,event_date,reason,created_at FROM employee_employment_period_events WHERE employment_period_id=? ORDER BY rowid").all(periodId)
  ])).digest("hex");
};

export const readScheduledRehire = (employeeId: string, employeeCode: string, periods = listEmploymentPeriods(employeeId)): ScheduledEmployeeRehire | undefined => {
  const today=getSeoulTodayDateString(),period=periods.find(p=>!p.cancelled&&!p.endDate&&p.startDate>today);if(!period)return;
  const db=database(),event=db.prepare("SELECT reason FROM employee_employment_period_events WHERE employment_period_id=? AND event_type='rehired' ORDER BY rowid DESC LIMIT 1").get(period.id) as {reason:string}|undefined;
  let proof:Record<string,unknown>|undefined;try{proof=record(JSON.parse(event?.reason ?? "null"));}catch{proof=undefined;}
  const wages=db.prepare("SELECT hourly_rate FROM wage_rates WHERE employee_id=? AND employment_period_id=? ORDER BY effective_from,rowid").all(employeeId,period.id) as Array<{hourly_rate:number}>;
  const assignments=db.prepare("SELECT a.site_id,s.name AS site_name,a.shift_group FROM employee_site_assignments a LEFT JOIN sites s ON s.id=a.site_id WHERE a.employee_id=? AND a.employment_period_id=? ORDER BY a.start_date,a.rowid").all(employeeId,period.id) as Array<{site_id:string;site_name?:string;shift_group?:string}>;
  const blockedReason=!iso(proof?.previousRetireDate)||!assignments.length ? "예약의 이전 퇴사일 또는 배정 원본을 확인할 수 없습니다. 직원 이력을 확인해 주세요." : reservationMoneyBlock(employeeCode,period.startDate);
  return {periodId:period.id,startDate:period.startDate,previousRetireDate:iso(proof?.previousRetireDate)?proof.previousRetireDate:"",hourlyRate:wages[0]?.hourly_rate,siteId:assignments[0]?.site_id ?? "",siteName:assignments[0]?.site_name ?? "확인 필요",shiftGroup:assignments[0]?.shift_group ?? "",wageCount:wages.length,assignmentCount:assignments.length,revisionToken:reservationRevision(employeeId,period.id),canManage:!blockedReason,...(blockedReason?{blockedReason}:{})};
};

export const attachEmploymentState = (employees: EmployeeRecord[]): EmployeeRecord[] => {
  if(!employees.length)return employees;const db=database();const ids=new Set((db.prepare("SELECT DISTINCT employee_id FROM employee_employment_period_events WHERE event_type='rehired'").all() as Array<{employee_id:string}>).map(r=>r.employee_id));
  return employees.map(employee=>{
    if(!ids.has(employee.id))return employee;
    const periods=listEmploymentPeriods(employee.id),scheduledRehire=readScheduledRehire(employee.id,employee.employeeCode,periods);
    const employmentPeriods=periods.map(({id,startDate,endDate,cancelled})=>({id,startDate,...(endDate?{endDate}:{}),...(cancelled?{cancelled:true}:{})}));
    return {...employee,employmentPeriods,employmentPhase:employmentPhaseOnDate(employmentPeriods,getSeoulTodayDateString()),...(scheduledRehire?{scheduledRehire}:{})};
  });
};

export const employmentHistoryColumns = (table: string): string => {
  const managed=`EXISTS(SELECT 1 FROM employee_employment_period_events em WHERE em.employee_id=employees.id AND em.event_type='rehired')`;
  const own=`ep.id=${table}.employment_period_id AND ep.employee_id=employees.id`;
  return `CASE WHEN ${managed} THEN (SELECT ep.end_date FROM employee_employment_periods ep WHERE ${own}) ELSE CASE WHEN employees.status='retired' THEN employees.retire_date END END AS retirement_date,
    ${managed} AS employment_managed,
    (SELECT ep.start_date FROM employee_employment_periods ep WHERE ${own}) AS employment_period_start,
    EXISTS(SELECT 1 FROM employee_employment_period_events ec WHERE ec.employment_period_id=${table}.employment_period_id AND ec.event_type='rehire-cancelled') AS employment_period_cancelled`;
};

export const writableEmploymentPeriod = (employeeId: string, day: string): StoredEmploymentPeriod | undefined => {
  if(!hasManagedEmployment(employeeId))return;
  const period=managedEmploymentPeriodOnDate(employeeId,day);
  if(!period)throw new Error("적용일이 재직기간에 포함되지 않습니다. 퇴사 공백 또는 취소한 예약에 시급·배정을 등록할 수 없습니다.");
  if(!period.endDate&&period.startDate>getSeoulTodayDateString())throw new Error("미래 재입사 예약의 시급·배정은 예약 변경에서 함께 확인해 주세요.");
  return period;
};
export const assertEmploymentHistoryEditable = (employeeId: string, periodId?: string|null): StoredEmploymentPeriod|undefined => {
  if(!hasManagedEmployment(employeeId))return;
  const period=listEmploymentPeriods(employeeId).find(p=>p.id===periodId);
  if(!period||period.cancelled)throw new Error("취소한 예약이거나 재직기간을 확인할 수 없는 이력입니다. 기존 이력을 보존하며 변경하지 않습니다.");
  if(!period.endDate&&period.startDate>getSeoulTodayDateString())throw new Error("미래 재입사 예약은 예약 변경 또는 예약 취소에서 처리해 주세요.");
  return period;
};
