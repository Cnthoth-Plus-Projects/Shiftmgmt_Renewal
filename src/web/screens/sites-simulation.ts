import { resolveShiftPatternForMonth } from "../../shared/domain/shift-pattern-version";
// sites-simulation.ts — 3개월 시뮬레이션 캘린더 계산 어댑터
import type {
  ShiftPatternRecord,
  EmployeeRecord,
  PatternStatus,
  EmploymentStatus
} from "../../shared/domain/model";
import type { TeamWorkType } from "../../shared/domain/team-work-type";
import {
  buildMonthlyScheduleDraft,
  type MonthlyScheduleDraftItem
} from "../../shared/domain/monthly-schedule-draft";
import type { PatternDraft } from "./sites-pattern-model";

export interface MonthSimulationResult {
  scheduleMonth: string; // YYYY-MM
  items: MonthlyScheduleDraftItem[];
  teamDailyDuty: Map<string, Map<string, string>>; // teamLabel -> (YYYY-MM-DD -> dutyCode)
  dates: string[]; // YYYY-MM-DD 목록
}

export interface ThreeMonthSimulation {
  months: MonthSimulationResult[];
  allDates: string[];
}

/**
 * PatternDraft를 MonthlyScheduleDraftInput에서 요구하는 ShiftPatternRecord 형태로 어댑팅한다.
 */
export function draftToPatternRecord(draft: PatternDraft): ShiftPatternRecord {
  const primaryCycle = draft.cycles[0];
  const steps = (primaryCycle?.steps || []).map((s) => ({
    id: `step-${s.stepIndex}`,
    stepIndex: s.stepIndex,
    dutyCode: s.dutyCode,
    startTime: s.startTime,
    endTime: s.endTime,
    breakMinutes: s.breakMinutes,
    holidayStartTime: s.holidayStartTime,
    holidayEndTime: s.holidayEndTime,
    holidayBreakMinutes: s.holidayBreakMinutes
  }));

  const teamIndexes = (primaryCycle?.teamIndexes || []).map((t) => ({
    id: `ti-${t.teamLabel}`,
    teamLabel: t.teamLabel,
    index: t.index
  }));

  const cycles = draft.cycles.map((c, idx) => ({
    id: `cycle-${c.cycleKey || idx}`,
    cycleKey: c.cycleKey,
    name: c.name,
    order: c.order,
    shiftCount: c.shiftCount,
    cycleLength: c.steps.length || 4,
    patternCode: c.patternCode,
    patternString: c.patternString,
    patternStartDate: c.patternStartDate || draft.patternStartDate || draft.effectiveFrom,
    steps: c.steps.map((s) => ({
      id: `c-step-${s.stepIndex}`,
      stepIndex: s.stepIndex,
      dutyCode: s.dutyCode,
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes,
      holidayStartTime: s.holidayStartTime,
      holidayEndTime: s.holidayEndTime,
      holidayBreakMinutes: s.holidayBreakMinutes
    })),
    teamIndexes: c.teamIndexes.map((t) => ({
      id: `c-ti-${t.teamLabel}`,
      teamLabel: t.teamLabel,
      index: t.index
    })),
    holidayTimeMode: c.holidayTimeMode,
    weekdayPublicHolidayAsHoliday: c.weekdayPublicHolidayAsHoliday
  }));

  const teamCycleAssignments = draft.teamCycleAssignments.map((a) => ({
    id: `tca-${a.teamLabel}`,
    teamLabel: a.teamLabel,
    cycleKey: a.cycleKey
  }));

  const teamCapacities = draft.teamCapacities.map((c) => ({
    id: `tc-${c.teamLabel}`,
    teamLabel: c.teamLabel,
    maxHeadcount: c.maxHeadcount
  }));

  const teamSettings = draft.teamSettings.map((s) => ({
    id: `ts-${s.teamLabel}`,
    teamLabel: s.teamLabel,
    displayName: s.displayName,
    workType: (s.workType as TeamWorkType) || "ROTATING",
    isActive: s.isActive !== false,
    sortOrder: s.sortOrder ?? 0
  }));

  return {
    id: draft.patternId || "draft-pattern",
    siteId: draft.siteId,
    name: draft.name,
    teamCount: draft.teamCount,
    cycleLength: primaryCycle?.steps.length || 4,
    patternCode: draft.patternCode || "D-E-N-O",
    startIndexRule: draft.startIndexRule || "manual",
    patternStartDate: draft.patternStartDate || draft.effectiveFrom,
    effectiveFrom: draft.effectiveFrom,
    status: (draft.status === "inactive" ? "inactive" : "active") as PatternStatus,
    steps,
    teamIndexes,
    cycles,
    teamCycleAssignments,
    teamCapacities,
    teamSettings,
    dutyTypes: draft.dutyTypes.map((d) => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      sortOrder: d.sortOrder ?? 0,
      startTime: d.startTime,
      endTime: d.endTime,
      breakMinutes: d.breakMinutes,
      isBreakDirty: d.isBreakDirty,
      holidayStartTime: d.holidayStartTime,
      holidayEndTime: d.holidayEndTime,
      holidayBreakMinutes: d.holidayBreakMinutes,
      isHolidayBreakDirty: d.isHolidayBreakDirty
    })),
    poolEnabled: draft.poolEnabled,
    poolStartTime: draft.poolStartTime,
    poolEndTime: draft.poolEndTime,
    poolBreakMinutes: draft.poolBreakMinutes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 조별 가상 대표 직원을 생성한다 (실제 배정 인원이 없는 경우 조별 순환 패리티 검증용).
 */
export function buildVirtualTeamEmployees(
  source: PatternDraft | ShiftPatternRecord
): EmployeeRecord[] {
  const activeTeams = (source.teamSettings || []).filter((t) => t.isActive !== false);
  return activeTeams.map((team, idx) => ({
    id: `virtual-emp-${team.teamLabel}`,
    employeeCode: `V-${team.teamLabel}`,
    name: `${team.displayName || team.teamLabel} 대표`,
    employmentType: "정규직",
    status: "active" as EmploymentStatus,
    currentSiteId: source.siteId,
    currentShiftGroup: team.teamLabel,
    currentAssignmentOrder: idx,
    currentAssignmentStartDate: source.effectiveFrom || "2026-01-01",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

export interface ThreeMonthSimulationOptions {
  draft: PatternDraft;
  startMonth: string; // YYYY-MM
  assignedEmployees?: EmployeeRecord[];
  publicHolidayDates?: ReadonlySet<string>;
  existingPatterns?: ShiftPatternRecord[];
}

/**
 * 특정 월(YYYY-MM) 1일 기준 유효한 ShiftPatternRecord를 탐색한다 (월별 버전 resolver).
 */
export function resolveMonthlyPattern(month: string, draft: PatternDraft, existingPatterns: ShiftPatternRecord[] = []): ShiftPatternRecord | null {
  const p=draftToPatternRecord(draft);return resolveShiftPatternForMonth([...existingPatterns.filter(v=>v.siteId===draft.siteId && v.id!==draft.patternId),p],month);
}

/**
 * 지정된 시작월부터 3개월간의 일별 시뮬레이션을 실행한다 (월별 버전 resolver 적용).
 */
export function runThreeMonthSimulation(
  draftOrOptions: PatternDraft | ThreeMonthSimulationOptions,
  startMonth?: string,
  assignedEmployees?: EmployeeRecord[],
  publicHolidayDates?: ReadonlySet<string>
): ThreeMonthSimulation {
  let draft: PatternDraft;
  let targetMonth: string;
  let emps: EmployeeRecord[] | undefined;
  let holDates: ReadonlySet<string> | undefined;
  let existingPatterns: ShiftPatternRecord[] | undefined;

  if ("draft" in draftOrOptions) {
    draft = draftOrOptions.draft;
    targetMonth = draftOrOptions.startMonth;
    emps = draftOrOptions.assignedEmployees;
    holDates = draftOrOptions.publicHolidayDates;
    existingPatterns = draftOrOptions.existingPatterns;
  } else {
    draft = draftOrOptions;
    targetMonth = startMonth || "2026-01";
    emps = assignedEmployees;
    holDates = publicHolidayDates;
  }

  const months: MonthSimulationResult[] = [];
  const allDates: string[] = [];

  const [yearStr, monthStr] = targetMonth.split("-");
  let currentYear = parseInt(yearStr, 10);
  let currentMonth = parseInt(monthStr, 10);

  for (let m = 0; m < 3; m++) {
    const formattedMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    // 월별 유효 버전 패턴 결정 (UI03-D06 월별 resolver)
    const activePatternForMonth = resolveMonthlyPattern(
      formattedMonth,
      draft,
      existingPatterns
    );

    const employeesForMonth =
      emps !== undefined ? emps : activePatternForMonth ? buildVirtualTeamEmployees(activePatternForMonth) : [];

    const items = activePatternForMonth ? buildMonthlyScheduleDraft({
      scheduleMonth: formattedMonth,
      pattern: activePatternForMonth,
      employees: employeesForMonth,
      publicHolidayDates: holDates
    }) : [];

    const teamDailyDuty = new Map<string, Map<string, string>>();
    const dateSet = new Set<string>();

    for (const item of items) {
      dateSet.add(item.workDate);
      const teamLabel = item.teamLabel || "";
      let teamMap = teamDailyDuty.get(teamLabel);
      if (!teamMap) {
        teamMap = new Map<string, string>();
        teamDailyDuty.set(teamLabel, teamMap);
      }
      teamMap.set(item.workDate, item.dutyCode);
    }

    const sortedDates = Array.from(dateSet).sort();
    sortedDates.forEach((d) => allDates.push(d));

    months.push({
      scheduleMonth: formattedMonth,
      items,
      teamDailyDuty,
      dates: sortedDates
    });

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return {
    months,
    allDates
  };
}
