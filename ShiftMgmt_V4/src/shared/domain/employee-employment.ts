import type { EmployeeEmploymentPeriod, EmployeeRecord, EmployeeSiteAssignment } from "./model";

export const employmentPeriodContains = (period: EmployeeEmploymentPeriod, day: string): boolean =>
  !period.cancelled && period.startDate <= day && (!period.endDate || day < period.endDate);

export const isEmployeeEmployedOnDate = (employee: Pick<EmployeeRecord, "hireDate" | "retireDate" | "employmentPeriods">, day: string): boolean => {
  if (employee.employmentPeriods) return employee.employmentPeriods.some(period => employmentPeriodContains(period, day));
  return (!employee.hireDate || employee.hireDate <= day) && (!employee.retireDate || day < employee.retireDate);
};

export const employmentPhaseOnDate = (periods: EmployeeEmploymentPeriod[], day: string): "employed" | "scheduled" | "retired" =>
  periods.some(period => employmentPeriodContains(period, day)) ? "employed" :
    periods.some(period => !period.cancelled && !period.endDate && period.startDate > day) ? "scheduled" : "retired";

export const assignmentEmploymentBounds = (assignment: EmployeeSiteAssignment): { startDate: string; endDate?: string; excluded: boolean } => {
  const startDate = assignment.employmentPeriodStart && assignment.employmentPeriodStart > assignment.startDate ? assignment.employmentPeriodStart : assignment.startDate;
  const endDate = assignment.retirementDate && (!assignment.endDate || assignment.retirementDate < assignment.endDate) ? assignment.retirementDate : assignment.endDate;
  return { startDate, endDate, excluded: Boolean(assignment.employmentPeriodCancelled || assignment.retirementExcluded || endDate && endDate <= startDate) };
};

export const isManagedEmployeeEmployedOnDate = (employee: Pick<EmployeeRecord, "employmentPeriods" | "hireDate" | "retireDate">, day: string): boolean =>
  !employee.employmentPeriods || isEmployeeEmployedOnDate(employee, day);

/** Managed histories use their dated phase; scheduled filter also finds a booking while prior work is still current. */
export const matchesEmployeeEmploymentStatus = (employee: EmployeeRecord, status?: string, today?: string): boolean => {
  if(!status||status==="all")return true;
  const phase=employee.employmentPeriods && today ? employmentPhaseOnDate(employee.employmentPeriods,today) : employee.employmentPhase;
  if(status==="scheduled")return Boolean(employee.scheduledRehire && (!today || employee.scheduledRehire.startDate>today));
  if(!employee.employmentPeriods)return employee.status===status;
  if(phase==="scheduled")return false;
  if(phase==="retired")return status==="retired";
  return (employee.status==="leave"?"leave":"active")===status;
};
