import { randomUUID } from "node:crypto";
import type { AuthSession, EmployeeRecord } from "../../shared/domain/model";
import type { EmployeeRetirementChange } from "../../shared/bridge/contracts";
import { getSeoulTodayDateString } from "../../shared/lib/local-date";
import { getSqliteDatabase } from "./sqlite-storage-service";

type Employee = Pick<EmployeeRecord, "id" | "employeeCode" | "name" | "status" | "hireDate" | "retireDate">;
type Actor = Pick<AuthSession, "userId" | "loginId" | "displayName" | "role">;
interface Binding { kind: "wage" | "assignment"; id: string; start: string; end: string | null; status: string | null }
interface Baseline { history_kind: Binding["kind"]; history_id: string; previous_end_date: string | null; previous_status: string | null }

const dayBefore = (date: string) => new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
const isValidDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
const requireOne = (result: { changes: number | bigint }, message: string) => { if (Number(result.changes) !== 1) throw new Error(message); };

/** Called inside employee save/delete's transaction. Retains original bounds and exact applied bindings. */
export const synchronizeEmployeeRetirement = (previous: Employee | undefined, employee: Employee, actor?: Actor, force = false): EmployeeRetirementChange | undefined => {
  if (employee.status !== "retired" || (!force && previous?.status === "retired" && previous.retireDate === employee.retireDate)) return;
  const date = employee.retireDate;
  if (!date || !isValidDateString(date)) throw new Error("퇴사일을 올바르게 입력해 주세요.");
  if (!employee.hireDate || !isValidDateString(employee.hireDate)) throw new Error("퇴사 처리 전에 입사일을 확인해 주세요.");
  if (date < employee.hireDate) throw new Error("퇴사일은 입사일보다 빠를 수 없습니다.");
  const db = getSqliteDatabase(); if (!db) throw new Error("직원 저장소가 연결되지 않았습니다.");
  const now = new Date().toISOString(), today = getSeoulTodayDateString(), wageEnd = dayBefore(date);
  let period = db.prepare(`SELECT * FROM employee_employment_periods WHERE employee_id=?
    AND NOT EXISTS(SELECT 1 FROM employee_employment_period_events ec WHERE ec.employment_period_id=employee_employment_periods.id AND ec.event_type='rehire-cancelled')
    ORDER BY (end_date IS NULL) DESC,start_date DESC,created_at DESC LIMIT 1`).get(employee.id) as { id: string; start_date: string; closure_provenance_complete: number } | undefined;
  if (!period) {
    period = { id: randomUUID(), start_date: employee.hireDate, closure_provenance_complete: previous?.status === "retired" ? 0 : 1 };
    requireOne(db.prepare("INSERT INTO employee_employment_periods(id,employee_id,start_date,end_date,closure_provenance_complete,created_at) VALUES(?,?,?,?,?,?)")
      .run(period.id,employee.id,period.start_date,null,period.closure_provenance_complete,now),"재직기간을 보존하지 못했습니다.");
  }
  if (date < period.start_date) throw new Error("퇴사일이 기존 재직기간 시작일보다 빠릅니다. 재직기간 정보를 확인해 주세요.");
  const baselines = db.prepare("SELECT history_kind,history_id,previous_end_date,previous_status FROM employee_retirement_history_closures WHERE employment_period_id=?")
    .all(period.id) as unknown as Baseline[];
  const baselineById = new Map(baselines.map(b => [b.history_kind + ":" + b.history_id,b]));
  const last = db.prepare(`SELECT reason FROM employee_employment_period_events WHERE employment_period_id=?
    AND event_type IN ('retired','retirement-date-corrected','retirement-synchronized') ORDER BY rowid DESC LIMIT 1`).get(period.id) as { reason: string } | undefined;
  let priorBindings: Binding[] = [];
  if (last) {
    try { const data = JSON.parse(last.reason); if (data.version === 1 && Array.isArray(data.bindings)) priorBindings = data.bindings; }
    catch { throw new Error("자동 종료 이력의 적용 상태를 확인하지 못했습니다. 기존 이력을 확인해 주세요."); }
  }
  const bindingsById = new Map(priorBindings.map(b => [b.kind + ":" + b.id,b]));
  const bindings: Binding[] = [];
  const seen = new Set<string>();
  const result: EmployeeRetirementChange = { kind: previous?.status === "retired" ? "date-correction" : "retirement", retireDate: date,
    previousRetireDate: previous?.retireDate, closedWageCount: 0, closedAssignmentCount: 0, excludedFutureWageCount: 0,
    excludedFutureAssignmentCount: 0, adjustedHistoryCount: 0, legacyProvenanceIncomplete: !period.closure_provenance_complete };
  const remember = (kind: Binding["kind"], id: string, end: string | null, status: string | null): Baseline => {
    const key = kind + ":" + id, saved = baselineById.get(key);
    if (saved) return saved;
    const baseline = { history_kind: kind, history_id: id, previous_end_date: end, previous_status: status };
    requireOne(db.prepare(`INSERT INTO employee_retirement_history_closures(id,employment_period_id,history_kind,history_id,previous_status,previous_end_date,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(randomUUID(),period!.id,kind,id,status,end,now),"자동 종료 전 상태를 보존하지 못했습니다.");
    baselineById.set(key,baseline); return baseline;
  };
  for (const kind of ["wage", "assignment"] as const) {
    const table = kind === "wage" ? "wage_rates" : "employee_site_assignments";
    const rows = db.prepare(`SELECT * FROM ${table} WHERE employee_id=? AND (employment_period_id IS NULL OR employment_period_id=?) ORDER BY rowid`)
      .all(employee.id,period.id) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const id = String(row.id), key = kind + ":" + id;
      seen.add(key);
      if (kind === "wage" && db.prepare("SELECT 1 FROM wage_rate_history WHERE wage_rate_id=? AND action_type='invalidated'").get(id)) continue;
      const start = String(kind === "wage" ? row.effective_from : row.start_date);
      const currentEnd = (kind === "wage" ? row.effective_to : row.end_date) as string | null;
      const currentStatus = kind === "assignment" ? String(row.status) : null;
      const known = baselineById.get(key), prior = bindingsById.get(key);
      if (known && (!prior || prior.start !== start || prior.end !== currentEnd || prior.status !== currentStatus)) throw new Error("자동 종료 후 개별 변경된 이력이 있습니다. 기간을 확인한 뒤 다시 처리해 주세요.");
      if (!known && kind === "assignment" && currentStatus !== "active" && (!currentEnd || currentEnd <= date)) continue;
      const originalEnd = known ? known.previous_end_date : currentEnd;
      const originalStatus = known ? known.previous_status : currentStatus;
      const future = start >= date;
      const nextEnd = future ? originalEnd : originalEnd && originalEnd < (kind === "wage" ? wageEnd : date) ? originalEnd : kind === "wage" ? wageEnd : date;
      const nextStatus = kind === "assignment" ? future || date <= today ? "ended" : originalStatus : null;
      if (!known && !future && nextEnd === currentEnd && nextStatus === currentStatus) continue;
      remember(kind,id,currentEnd,currentStatus);
      const changed = currentEnd !== nextEnd || currentStatus !== nextStatus;
      if (kind === "wage" && (changed || future && !known)) {
        requireOne(db.prepare(`INSERT INTO wage_rate_history(id,wage_rate_id,employee_id,employment_period_id,employee_code,employee_name,action_type,
          hourly_rate,effective_from,effective_to,wage_reason,change_reason,actor_user_id,actor_login_id,actor_display_name,actor_role,occurred_at)
          SELECT ?,w.id,w.employee_id,w.employment_period_id,?,?,?,w.hourly_rate,w.effective_from,w.effective_to,w.reason,?,?,?,?,?,? FROM wage_rates w WHERE w.id=?`)
          .run(randomUUID(),employee.employeeCode,employee.name,future ? "retirement-excluded" : known ? "retirement-adjusted" : "retirement-closed",
            "퇴사일 " + date + " 기준 자동 종료 전 기록",actor?.userId ?? "system",actor?.loginId ?? "system",actor?.displayName ?? "시스템",actor?.role ?? "system",now,id),"퇴사 전 시급 이력을 보존하지 못했습니다.");
      }
      if (changed) {
        if (kind === "wage") requireOne(db.prepare("UPDATE wage_rates SET effective_to=? WHERE id=?").run(nextEnd,id),"시급 종료에 실패했습니다.");
        else requireOne(db.prepare("UPDATE employee_site_assignments SET end_date=?,status=? WHERE id=?").run(nextEnd,nextStatus!,id),"배정 종료에 실패했습니다.");
      }
      bindings.push({ kind,id,start,end:nextEnd,status:nextStatus });
      if (future) { if (kind === "wage") result.excludedFutureWageCount++; else result.excludedFutureAssignmentCount++; }
      else if (changed) { if (kind === "wage") result.closedWageCount++; else result.closedAssignmentCount++; }
      if (known && changed) result.adjustedHistoryCount++;
    }
  }
  for (const baseline of baselines) {
    if (!seen.has(baseline.history_kind + ":" + baseline.history_id)) throw new Error("자동 종료한 이력의 원본 행이 없거나 다른 재직기간으로 이동했습니다. 이력을 확인해 주세요.");
  }
  requireOne(db.prepare("UPDATE employee_employment_periods SET end_date=?,updated_at=? WHERE id=?").run(date,now,period.id),"재직기간 종료일을 저장하지 못했습니다.");
  requireOne(db.prepare(`INSERT INTO employee_employment_period_events(id,employee_id,employment_period_id,event_type,event_date,previous_event_date,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(),employee.id,period.id,force ? "retirement-synchronized" : result.kind === "date-correction" ? "retirement-date-corrected" : "retired",date,previous?.retireDate ?? null,
      JSON.stringify({ version:1,actor:{ userId:actor?.userId ?? "system",loginId:actor?.loginId ?? "system",displayName:actor?.displayName ?? "시스템",role:actor?.role ?? "system" },bindings }),now),"퇴사 처리 이력을 저장하지 못했습니다.");
  return result;
};
