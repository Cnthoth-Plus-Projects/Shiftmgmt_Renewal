import { assignmentEmploymentBounds } from "../../shared/domain/employee-employment";
import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord,
} from "../../shared/domain/model";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues,
  type MonthlyScheduleDraftItem,
} from "../../shared/domain/monthly-schedule-draft";
import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import {
  buildScheduleRuleWarnings,
  defaultScheduleRuleWarningSettings,
  type ScheduleRuleWarningItem,
  type ScheduleRuleWarningSettings,
  type ScheduleRuleWarningSourceItem,
} from "../../shared/domain/schedule-rule-warning";
import { compareTeamLabels, normalizeTeamLabel } from "../../shared/domain/team-label";
import { resolveShiftPatternForMonth } from "../../shared/domain/shift-pattern-version";
import { buildShiftPatternDutySlotMap } from "../../shared/domain/shift-pattern-compression";
import { calculateDurationMinutes } from "../../shared/domain/calculation";

export interface DayDutyInfo {
  workDate: string;
  dayNumber: number;
  dayOfWeek: string;
  dutyCode: string;
  dutyLabel: string;
  isHoliday: boolean;
  startTime?: string;
  endTime?: string;
  unpaidBreakMinutes?: number;
  actualWorkMinutes?: number;
}

export interface WeekSummary {
  weekIndex: number;
  label: string;
  dateRange: string;
  totalWorkMinutes: number;
  workDaysCount: number;
  nightDaysCount: number;
}

export interface ScheduleRosterRow {
  rowKey: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  shiftGroup: string;
  displayName?: string;
  assignmentOrder: number;
  days: Record<string, DayDutyInfo>;
  weeklySummary: WeekSummary[];
  totalWorkMinutes: number;
  totalWorkDays: number;
  nightDaysCount: number;
}

export interface ScheduleHistoryRow {
  exportId: string;
  scheduleId: string;
  siteId: string;
  siteName: string;
  scheduleMonth: string;
  fileName: string;
  outputPath: string;
  publishedPath: string | null;
  exportedAt: string;
  generatedBy: string;
  status: "게시 완료" | "생성 완료";
  publishStatus: "draft" | "published";
  itemCount: number;
  employeeCount?: number;
}

export interface SchedulePreviewResult {
  pattern: ShiftPatternRecord | null;
  items: MonthlyScheduleDraftItem[];
  rows: ScheduleRosterRow[];
  dates: string[];
  issues: string[];
  fatalIssues: string[];
  warnings: ScheduleRuleWarningItem[];
  warningStats: {
    total: number;
    consecutiveNight: number;
    minRest: number;
    weeklyHoliday: number;
    weeklyMax: number;
  };
}

export type ScheduleItemLike = {
  employeeId?: string;
  employeeCode?: string;
  employeeName?: string;
  teamLabel?: string;
  shiftGroup?: string;
  sortOrder?: number;
  assignmentOrder?: number;
  workDate: string;
  dutyCode: string;
  dutyLabel?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  unpaidBreakMinutes?: number;
};

// 연월 유효성 검사 (1900~9999-01~12)
export const isValidYearMonth = (ym: string): boolean => {
  if (!/^\d{4}-\d{2}$/.test(ym)) return false;
  const [yearStr, monthStr] = ym.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  return year >= 1900 && year <= 9999 && month >= 1 && month <= 12;
};

// 달의 전체 일자 계산
export const getDaysInMonth = (yearMonth: string): string[] => {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(year, month, 0).getDate();

  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${yearStr}-${monthStr.padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
};

// 달의 다음달 1일 반환 (반개구간 계산용)
export const getMonthNextFirstDay = (yearMonth: string): string => {
  const [yearStr, monthStr] = yearMonth.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year++;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
};

// 요일 반환 (월~일 한국어)
export const getDayOfWeekLabel = (dateStr: string): string => {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  return labels[dow];
};

// 주차 계산
export const calculateWeeksInMonth = (dates: string[]): Array<{ weekIndex: number; label: string; dates: string[] }> => {
  if (dates.length === 0) return [];

  const weeks: Array<{ weekIndex: number; label: string; dates: string[] }> = [];
  let currentWeek: string[] = [];
  let weekIdx = 1;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const dow = new Date(d + "T00:00:00").getDay();
    currentWeek.push(d);

    if (dow === 0 || i === dates.length - 1) {
      const first = currentWeek[0].slice(8);
      const last = currentWeek[currentWeek.length - 1].slice(8);
      weeks.push({
        weekIndex: weekIdx,
        label: `${weekIdx}주차 (${parseInt(first, 10)}일~${parseInt(last, 10)}일)`,
        dates: [...currentWeek],
      });
      weekIdx++;
      currentWeek = [];
    }
  }

  return weeks;
};

// 시간 차이(분) 계산 - shared domain calculation helper 재사용
export const parseWorkMinutes = (startTime?: string, endTime?: string, breakMinutes?: number): number => {
  if (!startTime || !endTime) return 0;
  return calculateDurationMinutes({
    startTime,
    endTime,
    breakMinutes: breakMinutes ?? 0,
  });
};

export const buildRosterRowFromItems = (
  employeeId: string,
  employeeCode: string,
  name: string,
  shiftGroup: string,
  assignmentOrder: number,
  items: ScheduleItemLike[],
  dates: string[],
  holidaySet: Set<string>,
): ScheduleRosterRow => {
  const itemMap = new Map<string, ScheduleItemLike>();
  for (const it of items) {
    itemMap.set(it.workDate, it);
  }

  const days: Record<string, DayDutyInfo> = {};
  let totalWorkMinutes = 0;
  let totalWorkDays = 0;
  let nightDaysCount = 0;

  for (const date of dates) {
    const item = itemMap.get(date);
    const dayNum = parseInt(date.slice(8), 10);
    const dow = getDayOfWeekLabel(date);
    const isHoliday = holidaySet.has(date) || dow === "토" || dow === "일";

    if (item) {
      const isOff = item.dutyCode === "O" || item.dutyCode === "OFF" || (item.dutyLabel && item.dutyLabel.includes("휴무"));
      if (!isOff && item.startTime && item.endTime) {
        const bMin = item.breakMinutes ?? item.unpaidBreakMinutes ?? 0;
        const workMin = parseWorkMinutes(item.startTime, item.endTime, bMin);
        const isNight = item.dutyCode.includes("N") || (item.dutyLabel && item.dutyLabel.includes("야간"));
        days[date] = {
          workDate: date,
          dayNumber: dayNum,
          dayOfWeek: dow,
          dutyCode: item.dutyCode,
          dutyLabel: item.dutyLabel || item.dutyCode,
          isHoliday,
          startTime: item.startTime,
          endTime: item.endTime,
          unpaidBreakMinutes: bMin,
          actualWorkMinutes: workMin,
        };
        totalWorkMinutes += workMin;
        totalWorkDays++;
        if (isNight) {
          nightDaysCount++;
        }
      } else {
        days[date] = {
          workDate: date,
          dayNumber: dayNum,
          dayOfWeek: dow,
          dutyCode: item.dutyCode || "O",
          dutyLabel: item.dutyLabel || (item.dutyCode === "OFF" ? "휴무" : "비번"),
          isHoliday,
          startTime: item.startTime,
          endTime: item.endTime,
          unpaidBreakMinutes: item.breakMinutes ?? item.unpaidBreakMinutes ?? 0,
          actualWorkMinutes: 0,
        };
      }
    } else {
      // 배정 없는 날은 — 로 명확히 표시 (가짜 휴무 금지)
      days[date] = {
        workDate: date,
        dayNumber: dayNum,
        dayOfWeek: dow,
        dutyCode: "—",
        dutyLabel: "—",
        isHoliday,
        startTime: undefined,
        endTime: undefined,
        unpaidBreakMinutes: 0,
        actualWorkMinutes: 0,
      };
    }
  }

  // 주차 요약 계산
  const weeks = calculateWeeksInMonth(dates);
  const weeklySummary: WeekSummary[] = weeks.map((w) => {
    let weekMinutes = 0;
    let weekWorkDays = 0;
    let weekNightDays = 0;

    for (const d of w.dates) {
      const dayInfo = days[d];
      if (dayInfo && dayInfo.actualWorkMinutes && dayInfo.actualWorkMinutes > 0) {
        weekMinutes += dayInfo.actualWorkMinutes;
        weekWorkDays++;
        if (dayInfo.dutyCode.includes("N") || dayInfo.dutyLabel.includes("야간")) {
          weekNightDays++;
        }
      }
    }

    const first = w.dates[0].slice(8);
    const last = w.dates[w.dates.length - 1].slice(8);
    return {
      weekIndex: w.weekIndex,
      label: `${w.weekIndex}주차`,
      dateRange: `${parseInt(first, 10)}일~${parseInt(last, 10)}일`,
      totalWorkMinutes: weekMinutes,
      workDaysCount: weekWorkDays,
      nightDaysCount: weekNightDays,
    };
  });

  return {
    rowKey: `${employeeCode}_${shiftGroup}`,
    employeeId,
    employeeCode,
    name,
    shiftGroup,
    assignmentOrder,
    days,
    weeklySummary,
    totalWorkMinutes,
    totalWorkDays,
    nightDaysCount,
  };
};

export const sortRosterRows = (rows: ScheduleRosterRow[]): ScheduleRosterRow[] => {
  return [...rows].sort((a, b) => {
    // 1. 조 순서
    const groupCmp = compareTeamLabels(a.shiftGroup, b.shiftGroup);
    if (groupCmp !== 0) return groupCmp;

    // 2. 실제 배정 순서
    if (a.assignmentOrder !== b.assignmentOrder) {
      return a.assignmentOrder - b.assignmentOrder;
    }

    // 3. 사번 자연숫자 정렬
    return a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true });
  });
};

// 최대 4개 병렬 제한 도우미
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const cur = index++;
      results[cur] = await fn(items[cur]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const prepareRosterEmployees = async (
  employees: EmployeeRecord[],
  targetMonth: string,
  siteId: string,
  fetchAssignments: (empId: string) => Promise<EmployeeSiteAssignment[]>,
): Promise<{ rosterEmployees: EmployeeRecord[]; fatalIssues: string[] }> => {
  const fatalIssues: string[] = [];
  const monthDays = getDaysInMonth(targetMonth);
  const monthStart = monthDays[0];
  const monthEnd = monthDays[monthDays.length - 1];
  const monthEndNext = getMonthNextFirstDay(targetMonth);

  // 최대 4개 동시 요청으로 배정 이력 조회
  let allEmpAssignments: Array<{ emp: EmployeeRecord; assignments: EmployeeSiteAssignment[] }>;
  try {
    allEmpAssignments = await mapWithConcurrencyLimit(employees, 4, async (emp) => {
      const asgns = await fetchAssignments(emp.id);
      return { emp, assignments: asgns };
    });
  } catch (err) {
    return {
      rosterEmployees: [],
      fatalIssues: [
        `인력 배정 이력 조회 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const roster: EmployeeRecord[] = [];

  for (const { emp, assignments: allAsgns } of allEmpAssignments) {
    // 퇴사자 필터링 (퇴사일이 대상 월 시작 이전이면 제외)
    const retire = emp.retireDate || (emp as { resignationDate?: string }).resignationDate;
    if (retire && retire < monthStart) {
      continue;
    }
    // 입사일 필터링 (입사일이 대상 월 말일 이후이면 제외)
    if (emp.hireDate && emp.hireDate > monthEnd) {
      continue;
    }

    const siteAsgns = allAsgns.filter(a=>a.siteId===siteId).flatMap(a=>{
      const bounds=assignmentEmploymentBounds(a);return bounds.excluded ? [] : [{...a,startDate:bounds.startDate,endDate:bounds.endDate}];
    });
    if (siteAsgns.length === 0) continue;

    // 반개구간 [startDate, endDate) 기준으로 겹치는 배정 구간 검사
    if (siteAsgns.length > 1) {
      for (let i = 0; i < siteAsgns.length; i++) {
        for (let j = i + 1; j < siteAsgns.length; j++) {
          const a1 = siteAsgns[i];
          const a2 = siteAsgns[j];
          const start1 = a1.startDate;
          const end1 = a1.endDate || "9999-12-31";
          const start2 = a2.startDate;
          const end2 = a2.endDate || "9999-12-31";

          if (start1 < end2 && start2 < end1) {
            fatalIssues.push(
              `사번 ${emp.employeeCode}: 동일 근무지에 유효 기간이 겹치는 중복 배정 구간이 존재합니다 (${a1.shiftGroup} ${start1}~${a1.endDate || "무기한"} vs ${a2.shiftGroup} ${start2}~${a2.endDate || "무기한"}).`,
            );
          }
        }
      }
    }

    if (fatalIssues.length > 0) continue;

    // 해당 월에 유효한 배정들 찾기: 반개구간 [start, end)
    // start < monthEndNext && (!end || end > monthStart)
    const activeAsgns = siteAsgns.filter((a) => {
      const aStart = a.startDate;
      const aEnd = a.endDate;
      return aStart < monthEndNext && (!aEnd || aEnd > monthStart);
    });

    for (const asgn of activeAsgns) {
      const asgnStart = asgn.startDate;
      const asgnOrder = asgn.sortOrder ?? 0;
      // 생성기 복사본의 hireDate는 max(실입사일, 배정시작일)
      const effectiveHireDate = emp.hireDate && emp.hireDate > asgnStart ? emp.hireDate : asgnStart;

      roster.push({
        ...emp,
        hireDate: effectiveHireDate,
        currentSiteId: siteId,
        currentShiftGroup: normalizeTeamLabel(asgn.shiftGroup),
        currentAssignmentOrder: asgnOrder,
        currentAssignmentStartDate: asgnStart,
        currentAssignmentEndDate: asgn.endDate,
      });
    }
  }

  if (fatalIssues.length > 0) {
    return { rosterEmployees: [], fatalIssues };
  }

  return { rosterEmployees: roster, fatalIssues: [] };
};

export const generateSchedulePreview = (
  patterns: ShiftPatternRecord[],
  rosterEmployees: EmployeeRecord[],
  targetMonth: string,
  publicHolidayDates: string[] = [],
  warningSettings: ScheduleRuleWarningSettings = defaultScheduleRuleWarningSettings,
): SchedulePreviewResult => {
  const dates = getDaysInMonth(targetMonth);
  const holidaySet = new Set(publicHolidayDates);

  // 1. 유효 패턴 확인 (resolveShiftPatternForMonth 사용)
  const pattern = resolveShiftPatternForMonth(patterns, targetMonth);
  if (!pattern) {
    return {
      pattern: null,
      items: [],
      rows: [],
      dates,
      issues: ["선택한 대상월에 유효한 근무패턴이 없습니다."],
      fatalIssues: ["유효한 근무패턴 없음"],
      warnings: [],
      warningStats: { total: 0, consecutiveNight: 0, minRest: 0, weeklyHoliday: 0, weeklyMax: 0 },
    };
  }

  // 2. 배정 인력 확인
  if (rosterEmployees.length === 0) {
    return {
      pattern,
      items: [],
      rows: [],
      dates,
      issues: ["근무지에 배정된 인력이 없습니다."],
      fatalIssues: ["배정된 인력이 없습니다."],
      warnings: [],
      warningStats: { total: 0, consecutiveNight: 0, minRest: 0, weeklyHoliday: 0, weeklyMax: 0 },
    };
  }

  // 3. 초안 생성 전 이슈 검사
  const draftIssues = getMonthlyScheduleDraftIssues({
    pattern,
    employees: rosterEmployees,
    scheduleMonth: targetMonth,
    publicHolidayDates: holidaySet,
  });

  const fatalIssues = draftIssues.map((i) => i.message);

  if (fatalIssues.length > 0) {
    return {
      pattern,
      items: [],
      rows: [],
      dates,
      issues: draftIssues.map((i) => i.message),
      fatalIssues,
      warnings: [],
      warningStats: { total: 0, consecutiveNight: 0, minRest: 0, weeklyHoliday: 0, weeklyMax: 0 },
    };
  }

  // 초안 생성
  const items = buildMonthlyScheduleDraft({
    pattern,
    employees: rosterEmployees,
    scheduleMonth: targetMonth,
    publicHolidayDates: holidaySet,
  });

  // 고유 직원+일자 중복 검사 (동일 직원이 같은 날짜에 2개 이상 아이템을 가지면 차단)
  const seenEmpDates = new Set<string>();
  for (const it of items) {
    const key = `${it.employeeCode}_${it.workDate}`;
    if (seenEmpDates.has(key)) {
      fatalIssues.push(`사번 ${it.employeeCode}: ${it.workDate} 일자에 중복 배정 항목이 생성되었습니다.`);
    }
    seenEmpDates.add(key);
  }

  if (fatalIssues.length > 0) {
    return {
      pattern,
      items: [],
      rows: [],
      dates,
      issues: fatalIssues,
      fatalIssues,
      warnings: [],
      warningStats: { total: 0, consecutiveNight: 0, minRest: 0, weeklyHoliday: 0, weeklyMax: 0 },
    };
  }

  // (employeeCode + teamLabel) 별로 아이템 그룹화하여 행 생성
  const itemsByEmpGroup = new Map<string, MonthlyScheduleDraftItem[]>();
  for (const it of items) {
    const groupKey = `${it.employeeCode}_${(normalizeTeamLabel(it.teamLabel || "A조") || "A조")}`;
    const list = itemsByEmpGroup.get(groupKey) || [];
    list.push(it);
    itemsByEmpGroup.set(groupKey, list);
  }

  const rawRows: ScheduleRosterRow[] = [];
  for (const emp of rosterEmployees) {
    const empGroupKey = `${emp.employeeCode}_${(normalizeTeamLabel(emp.currentShiftGroup || "A조") || "A조")}`;
    const empItems = itemsByEmpGroup.get(empGroupKey) || [];
    // 생성기가 아예 제외한 경우 제외
    if (empItems.length === 0) continue;

    const row = buildRosterRowFromItems(
      emp.id,
      emp.employeeCode,
      emp.name,
      emp.currentShiftGroup || "A조",
      emp.currentAssignmentOrder || 0,
      empItems,
      dates,
      holidaySet,
    );
    rawRows.push(row);
  }

  const rows = sortRosterRows(rawRows);

  // 규칙 경고 계산
  const warningSourceItems: ScheduleRuleWarningSourceItem[] = items.map((it) => ({
    employeeCode: it.employeeCode,
    employeeName: it.employeeName || "",
    workDate: it.workDate,
    dutyCode: it.dutyCode,
    startTime: it.startTime,
    endTime: it.endTime,
    breakMinutes: it.breakMinutes,
  }));

  const warningSummary = buildScheduleRuleWarnings(warningSourceItems, warningSettings);
  const warnings = warningSummary.warnings;

  const warningStats = {
    total: warningSummary.warningCount,
    consecutiveNight: warningSummary.byRule["consecutive-night"] || 0,
    minRest: warningSummary.byRule["minimum-rest"] || 0,
    weeklyHoliday: warningSummary.byRule["weekly-holiday"] || 0,
    weeklyMax: warningSummary.byRule["weekly-max-minutes"] || 0,
  };

  return {
    pattern,
    items,
    rows,
    dates,
    issues: draftIssues.map((i) => i.message),
    fatalIssues: [],
    warnings,
    warningStats,
  };
};

export const buildRosterFromStoredSchedule = (
  schedule: MonthlyScheduleRecord,
  warningSettings: ScheduleRuleWarningSettings = defaultScheduleRuleWarningSettings,
  publicHolidayDates: string[] = [],
): SchedulePreviewResult => {
  const dates = getDaysInMonth(schedule.scheduleMonth);
  const holidaySet = new Set(publicHolidayDates);

  const rawItems = schedule.items as unknown as ScheduleItemLike[];
  const itemsByEmpGroup = new Map<string, ScheduleItemLike[]>();
  for (const it of rawItems) {
    const code = it.employeeCode || it.employeeId || "unknown";
    const group = (normalizeTeamLabel(it.teamLabel || it.shiftGroup || "A조") || "A조");
    const key = `${code}_${group}`;
    const list = itemsByEmpGroup.get(key) || [];
    list.push(it);
    itemsByEmpGroup.set(key, list);
  }

  const rawRows: ScheduleRosterRow[] = [];
  for (const empItems of itemsByEmpGroup.values()) {
    const first = empItems[0];
    const empCode = first.employeeCode || first.employeeId || "unknown";
    const group = (normalizeTeamLabel(first.teamLabel || first.shiftGroup || "A조") || "A조");
    const row = buildRosterRowFromItems(
      first.employeeId || empCode,
      empCode,
      first.employeeName || empCode,
      group,
      first.sortOrder ?? first.assignmentOrder ?? 0,
      empItems,
      dates,
      holidaySet,
    );
    rawRows.push(row);
  }

  const rows = sortRosterRows(rawRows);

  const warningSourceItems: ScheduleRuleWarningSourceItem[] = rawItems.map((it) => ({
    employeeCode: it.employeeCode || it.employeeId || "unknown",
    employeeName: it.employeeName || "",
    workDate: it.workDate,
    dutyCode: it.dutyCode,
    startTime: it.startTime,
    endTime: it.endTime,
    breakMinutes: it.breakMinutes ?? it.unpaidBreakMinutes ?? 0,
  }));

  const warningSummary = buildScheduleRuleWarnings(warningSourceItems, warningSettings);
  const warnings = warningSummary.warnings;

  const warningStats = {
    total: warningSummary.warningCount,
    consecutiveNight: warningSummary.byRule["consecutive-night"] || 0,
    minRest: warningSummary.byRule["minimum-rest"] || 0,
    weeklyHoliday: warningSummary.byRule["weekly-holiday"] || 0,
    weeklyMax: warningSummary.byRule["weekly-max-minutes"] || 0,
  };

  const draftItems: MonthlyScheduleDraftItem[] = rawItems.map((it) => ({
    teamLabel: it.teamLabel || it.shiftGroup,
    employeeCode: it.employeeCode || it.employeeId || "unknown",
    employeeName: it.employeeName,
    workDate: it.workDate,
    dutyCode: it.dutyCode,
    startTime: it.startTime,
    endTime: it.endTime,
    breakMinutes: it.breakMinutes ?? it.unpaidBreakMinutes ?? 0,
    sortOrder: it.sortOrder ?? it.assignmentOrder,
  }));

  return {
    pattern: null,
    items: draftItems,
    rows,
    dates,
    issues: [],
    fatalIssues: [],
    warnings,
    warningStats,
  };
};

export const joinSchedulePlanExports = (
  exportsList: SchedulePlanExportRecord[],
  schedules: MonthlyScheduleRecord[],
  sites: SiteRecord[] = [],
): ScheduleHistoryRow[] => {
  const scheduleMap = new Map<string, MonthlyScheduleRecord>();
  for (const s of schedules) {
    scheduleMap.set(s.id, s);
  }

  const siteMap = new Map<string, SiteRecord>();
  for (const st of sites) {
    siteMap.set(st.id, st);
  }

  return exportsList.map((exp) => {
    const sched = scheduleMap.get(exp.scheduleId);
    const siteObj = sched ? siteMap.get(sched.siteId) : undefined;
    const siteName = siteObj?.name || exp.siteName || sched?.siteName || "-";
    const fileName = exp.outputFileName || (exp as { fileName?: string }).fileName || "-";
    const isPublished = Boolean(exp.publishedPath);

    return {
      exportId: exp.id,
      scheduleId: exp.scheduleId,
      siteId: sched?.siteId || "",
      siteName,
      scheduleMonth: exp.scheduleMonth || sched?.scheduleMonth || "-",
      fileName,
      outputPath: exp.outputPath,
      publishedPath: exp.publishedPath || null,
      exportedAt: exp.exportedAt,
      generatedBy: sched?.generatedBy || "-",
      status: isPublished ? "게시 완료" : "생성 완료",
      publishStatus: isPublished ? "published" : "draft",
      itemCount: exp.updateCount ?? sched?.items?.length ?? 0,
      employeeCount: sched ? new Set(sched.items.map(i => i.employeeCode || i.employeeId)).size : undefined,
    };
  });
};

export const filterScheduleHistory = (
  history: ScheduleHistoryRow[],
  filters: {
    siteId?: string;
    scheduleMonth?: string;
    status?: "all" | "published" | "draft";
    keyword?: string;
  },
): ScheduleHistoryRow[] => {
  return history.filter((row) => {
    if (filters.siteId && filters.siteId !== "all" && row.siteId !== filters.siteId) {
      return false;
    }
    if (filters.scheduleMonth && filters.scheduleMonth !== "all" && row.scheduleMonth !== filters.scheduleMonth) {
      return false;
    }
    if (filters.status && filters.status !== "all" && row.publishStatus !== filters.status) {
      return false;
    }
    if (filters.keyword && filters.keyword.trim() !== "") {
      const q = filters.keyword.trim().toLowerCase();
      const match =
        row.siteName.toLowerCase().includes(q) ||
        row.fileName.toLowerCase().includes(q) ||
        row.generatedBy.toLowerCase().includes(q) ||
        row.scheduleMonth.includes(q);
      if (!match) return false;
    }
    return true;
  }).sort((a, b) => b.scheduleMonth.localeCompare(a.scheduleMonth) ||
    (Number.isFinite(Date.parse(b.exportedAt)) ? Date.parse(b.exportedAt) : 0) - (Number.isFinite(Date.parse(a.exportedAt)) ? Date.parse(a.exportedAt) : 0) || a.exportId.localeCompare(b.exportId, undefined, { numeric: true }));
};

// Presentation labels only: saved items, codes and times remain untouched.
export const labelSchedulePreview = (data: SchedulePreviewResult, pattern: ShiftPatternRecord | null): SchedulePreviewResult => {
  const labels = new Map<string, string>([["D", "주간"], ["E", "석간"], ["N", "야간"], ["O", "비번"], ["OFF", "휴무"]]);
  if (pattern) {
    const cycles = pattern.cycles.length ? pattern.cycles : [{ steps: pattern.steps }];
    const codes = [...new Set(cycles.flatMap(c => c.steps.slice().sort((a, b) => a.stepIndex - b.stepIndex).map(s => s.dutyCode.trim().toUpperCase())).filter(c => !["O", "OFF", "REST", "휴무", "비번"].includes(c)))];
    const count = Math.max(1, Math.min(codes.length, 3));
    const targets = count === 1 ? ["D"] : count === 2 ? ["D", "N"] : ["D", "E", "N"];
    const duties = (pattern.dutyTypes || []).filter(d => d.kind === "work").slice().sort((a, b) => a.sortOrder - b.sortOrder);
    for (const [code, slot] of buildShiftPatternDutySlotMap(codes, count)) {
      const matching = duties.find(d => d.id.toUpperCase() === code || d.id.toUpperCase() === `DUTY-${code}`) || duties[slot];
      if (matching?.label) labels.set(targets[slot], matching.label);
    }
  }
  return { ...data, rows: data.rows.map(row => ({ ...row,
    displayName: pattern?.teamSettings.find(t => normalizeTeamLabel(t.teamLabel) === row.shiftGroup)?.displayName || row.shiftGroup,
    days: Object.fromEntries(Object.entries(row.days).map(([date, day]) => [date, { ...day, dutyLabel: day.dutyLabel && day.dutyLabel !== day.dutyCode ? day.dutyLabel : labels.get(day.dutyCode) || day.dutyCode }]))
  })) };
};
