import type {
  EmployeeRecord,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord,
  UserRole
} from "../../shared/domain/model";
import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import type {
  AllowanceCalculationResultRecord
} from "../../shared/domain/allowance-service";
import type {
  AllowanceProposalApprovalRecord
} from "../../shared/domain/allowance-workflow";
import type {
  AllowanceDocumentExportRecord
} from "../../shared/domain/allowance-document";
import type {
  PerformanceFileSyncStateSnapshot,
  PerformanceOverviewSnapshot,
  PerformanceStartupRecoveryStatusSnapshot
} from "../../shared/domain/performance-file";
import type {
  FileWatchStatusSnapshot
} from "../../shared/bridge/contracts";

export interface SeoulMonthContext {
  year: number;
  month: number;
  yearMonth: string; // YYYY-MM
  monthFirstDay: string; // YYYY-MM-01
  monthLastDay: string; // YYYY-MM-DD
}

export function getSeoulMonthContext(dateInput: Date = new Date()): SeoulMonthContext {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(dateInput);
  let yearStr = "";
  let monthStr = "";

  for (const part of parts) {
    if (part.type === "year") {
      yearStr = part.value;
    } else if (part.type === "month") {
      monthStr = part.value;
    }
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  const monthFirstDay = `${yearMonth}-01`;

  // Calculate last day of this month in UTC
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDayNum = lastDayDate.getUTCDate();
  const monthLastDay = `${yearMonth}-${String(lastDayNum).padStart(2, "0")}`;

  return {
    year,
    month,
    yearMonth,
    monthFirstDay,
    monthLastDay,
  };
}

export interface PreparationProgress {
  completedCount: number;
  targetCount: number;
  ratioPercent: number;
  isEmpty: boolean;
  label: string;
  subtext: string;
}

export function calculatePreparationProgress(params: {
  sites: SiteRecord[];
  patterns: ShiftPatternRecord[];
  siteEmployeesMap: Record<string, EmployeeRecord[]>;
  monthFirstDay: string;
  monthLastDay: string;
}): PreparationProgress {
  const { sites, patterns, siteEmployeesMap, monthFirstDay, monthLastDay } = params;

  // 대상: status === "active"
  const activeSites = sites.filter((s) => s.status === "active");
  const targetCount = activeSites.length;

  if (targetCount === 0) {
    return {
      completedCount: 0,
      targetCount: 0,
      ratioPercent: 0,
      isEmpty: true,
      label: "준비 0/0 근무지 (현재 배정 기준)",
      subtext: "이번 달 중간에 배정이 끝난 인원은 이 숫자에 들어가지 않습니다. 월 전체 배정 이력은 인력 관리에서 확인하세요.",
    };
  }

  let completedCount = 0;

  for (const site of activeSites) {
    // 조건 1: status === "active" 이고 effectiveFrom (fallback patternStartDate) <= monthFirstDay 인 shiftPattern 존재
    const hasValidPattern = patterns.some((p) => {
      if (p.siteId !== site.id || p.status !== "active") {
        return false;
      }
      const effectiveDate = p.effectiveFrom || p.patternStartDate;
      return Boolean(effectiveDate && effectiveDate <= monthFirstDay);
    });

    if (!hasValidPattern) {
      continue;
    }

    // 조건 2: site의 직원 중 status === "active" (leave/retired 제외) AND
    // currentSiteId === site.id AND
    // currentAssignmentStartDate <= monthLastDay AND
    // (!currentAssignmentEndDate || currentAssignmentEndDate > monthFirstDay) 인 인원 >= 1
    const employees = siteEmployeesMap[site.id] || [];
    const hasActiveEmployee = employees.some((emp) => {
      if (emp.status !== "active") {
        return false;
      }
      if (emp.currentSiteId !== site.id) {
        return false;
      }
      if (!emp.currentAssignmentStartDate || emp.currentAssignmentStartDate > monthLastDay) {
        return false;
      }
      if (emp.currentAssignmentEndDate && emp.currentAssignmentEndDate <= monthFirstDay) {
        return false;
      }
      return true;
    });

    if (hasActiveEmployee) {
      completedCount++;
    }
  }

  const ratioPercent = Math.round((completedCount / targetCount) * 100);

  return {
    completedCount,
    targetCount,
    ratioPercent,
    isEmpty: false,
    label: `준비 ${completedCount}/${targetCount} 근무지 (현재 배정 기준)`,
    subtext: "이번 달 중간에 배정이 끝난 인원은 이 숫자에 들어가지 않습니다. 월 전체 배정 이력은 인력 관리에서 확인하세요.",
  };
}

export interface OperationsProgress {
  completedSteps: number;
  totalSteps: number;
  ratioPercent: number;
  isEmpty: boolean;
  label: string;
  unassignedSites: Array<{ siteId: string; siteName: string }>;
}

export function calculateOperationsProgress(params: {
  activeSites: SiteRecord[];
  monthlySchedules: MonthlyScheduleRecord[];
  schedulePlanExports: SchedulePlanExportRecord[];
  scheduleMonth: string;
}): OperationsProgress {
  const { activeSites, monthlySchedules, schedulePlanExports, scheduleMonth } = params;

  // 운영 대상 siteId = active sites U 당월 schedules의 siteId
  const targetSiteIdSet = new Set<string>();
  const siteNameMap = new Map<string, string>();

  for (const s of activeSites) {
    if (s.status === "active") {
      targetSiteIdSet.add(s.id);
      siteNameMap.set(s.id, s.name);
    }
  }

  const currentMonthSchedules = monthlySchedules.filter((sch) => sch.scheduleMonth === scheduleMonth);
  for (const sch of currentMonthSchedules) {
    targetSiteIdSet.add(sch.siteId);
    if (!siteNameMap.has(sch.siteId) && sch.siteName) {
      siteNameMap.set(sch.siteId, sch.siteName);
    }
  }

  const targetSiteIds = Array.from(targetSiteIdSet);
  const targetCount = targetSiteIds.length;
  const totalSteps = targetCount * 2;

  if (totalSteps === 0) {
    return {
      completedSteps: 0,
      totalSteps: 0,
      ratioPercent: 0,
      isEmpty: true,
      label: "운영 0/0 단계",
      unassignedSites: [],
    };
  }

  let completedSteps = 0;
  const unassignedSites: Array<{ siteId: string; siteName: string }> = [];

  for (const siteId of targetSiteIds) {
    const siteSchedules = currentMonthSchedules.filter((sch) => sch.siteId === siteId);
    const hasSchedule = siteSchedules.length > 0;

    if (!hasSchedule) {
      // 단계 ① 미완료 -> 단계 ②도 불가
      continue;
    }

    // 단계 ① 완료 (+1)
    completedSteps++;

    // 단계 ② 완료 여부: 해당 scheduleId에 일치하는 publishStatus === "published" export 존재
    const scheduleIds = new Set(siteSchedules.map((sch) => sch.id));
    const hasPublishedExport = schedulePlanExports.some(
      (exp) => scheduleIds.has(exp.scheduleId) && exp.publishStatus === "published"
    );

    if (hasPublishedExport) {
      completedSteps++;
    } else {
      unassignedSites.push({
        siteId,
        siteName: siteNameMap.get(siteId) || siteId,
      });
    }
  }

  const ratioPercent = Math.round((completedSteps / totalSteps) * 100);

  return {
    completedSteps,
    totalSteps,
    ratioPercent,
    isEmpty: false,
    label: `운영 ${completedSteps}/${totalSteps} 단계`,
    unassignedSites,
  };
}

export interface PerformanceOverviewKpis {
  groupsCount: number;
  pendingCount: number;
  needsReapprovalCount: number;
  alertCount: number;
  unconnectedSiteNames: string[];
  duplicateSiteNames: string[];
  siteMatchingStatus: "ok" | "failed";
}

export function calculatePerformanceOverviewKpis(params: {
  overview: PerformanceOverviewSnapshot;
  allSites: SiteRecord[] | null;
}): PerformanceOverviewKpis {
  const { overview, allSites } = params;

  let pendingCount = 0;
  let needsReapprovalCount = 0;
  let alertCount = 0;

  for (const grp of overview.groups) {
    pendingCount += grp.pendingCount || 0;
    needsReapprovalCount += grp.needsReapprovalCount || 0;
    alertCount += grp.alertCount || 0;
  }

  const groupsCount = overview.groups.length;

  if (allSites === null) {
    return {
      groupsCount,
      pendingCount,
      needsReapprovalCount,
      alertCount,
      unconnectedSiteNames: [],
      duplicateSiteNames: [],
      siteMatchingStatus: "failed",
    };
  }

  const unconnectedSiteNames: string[] = [];
  const duplicateSiteNames: string[] = [];

  for (const grp of overview.groups) {
    const matched = allSites.filter((s) => s.name === grp.siteName);
    if (matched.length === 0) {
      unconnectedSiteNames.push(grp.siteName);
    } else if (matched.length >= 2) {
      duplicateSiteNames.push(grp.siteName);
    }
  }

  return {
    groupsCount,
    pendingCount,
    needsReapprovalCount,
    alertCount,
    unconnectedSiteNames,
    duplicateSiteNames,
    siteMatchingStatus: "ok",
  };
}

export interface SettlementProgress {
  completedSteps: number;
  totalSteps: 3;
  ratioPercent: number;
  label: string;
  unapprovedCount: number;
  step1Passed: boolean;
  step2Passed: boolean;
  step3Passed: boolean;
}

export function calculateSettlementProgress(params: {
  calculationResults: AllowanceCalculationResultRecord[];
  proposalApprovals: AllowanceProposalApprovalRecord[];
  documentExports: AllowanceDocumentExportRecord[];
  scheduleMonth: string;
}): SettlementProgress {
  const { calculationResults, proposalApprovals, documentExports, scheduleMonth } = params;

  // 당월 workDate 결과 필터 (조기지급도 workDate 기준)
  const currentMonthResults = calculationResults.filter(
    (res) => res.workDate && res.workDate.startsWith(scheduleMonth)
  );

  const unapprovedResults = currentMonthResults.filter(
    (res) => res.status !== "approved" && res.status !== "proposal-approved"
  );
  const unapprovedCount = unapprovedResults.length;

  // 단계 ①: 당월 workDate 결과 >= 1 이고 전건 approved 또는 proposal-approved
  const step1Passed = currentMonthResults.length > 0 && unapprovedCount === 0;

  if (!step1Passed) {
    return {
      completedSteps: 0,
      totalSteps: 3,
      ratioPercent: 0,
      label: "월 정산 0/3 단계",
      unapprovedCount,
      step1Passed: false,
      step2Passed: false,
      step3Passed: false,
    };
  }

  // 단계 ②: 단계 ① 참 AND 당월 최신 품의 승인 행 존재 (approvedAt DESC, id DESC 정렬 첫 번째)
  const currentMonthApprovals = proposalApprovals.filter(
    (app) => app.workMonth === scheduleMonth
  );

  currentMonthApprovals.sort((a, b) => {
    const timeA = new Date(a.approvedAt).getTime();
    const timeB = new Date(b.approvedAt).getTime();
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return b.id.localeCompare(a.id);
  });

  const latestApproval = currentMonthApprovals[0] || null;
  const step2Passed = Boolean(latestApproval);

  if (!step2Passed) {
    return {
      completedSteps: 1,
      totalSteps: 3,
      ratioPercent: 33,
      label: "월 정산 1/3 단계",
      unapprovedCount,
      step1Passed: true,
      step2Passed: false,
      step3Passed: false,
    };
  }

  // 단계 ③: 단계 ② 참 AND 최신 품의 승인 행의 exportRecordId와 일치하는 당월 문서 출력 행이 존재하고,
  // 품의서, 별첨1, 별첨2 파일명이 셋 다 채워져 있을 것
  const matchingExport = documentExports.find((exp) => {
    if (exp.workMonth !== scheduleMonth) {
      return false;
    }
    if (exp.id !== latestApproval.exportRecordId) {
      return false;
    }
    return Boolean(
      exp.proposalFileName?.trim() &&
      exp.attachment1FileName?.trim() &&
      exp.attachment2FileName?.trim()
    );
  });

  const step3Passed = Boolean(matchingExport);
  const completedSteps = step3Passed ? 3 : 2;
  const ratioPercent = step3Passed ? 100 : 67;

  return {
    completedSteps,
    totalSteps: 3,
    ratioPercent,
    label: `월 정산 ${completedSteps}/3 단계`,
    unapprovedCount,
    step1Passed: true,
    step2Passed: true,
    step3Passed,
  };
}

export interface HomeTodoItem {
  id: string;
  type:
    | "pending-performance"
    | "unreleased-schedule"
    | "sync-error"
    | "startup-recovery"
    | "unapproved-calculation"
    | "unapproved-proposal"
    | "unconnected-site"
    | "duplicate-site"
    | "watch-stopped";
  title: string;
  icon: string;
  iconColor: string;
  actionKind?: "retry-recovery" | "restart-watch";
  actionLabel?: string;
}

export function determineHomeTodos(params: {
  userRole: UserRole;
  scheduleMonth: string;
  kpis: PerformanceOverviewKpis | null;
  operations: OperationsProgress | null;
  syncState: PerformanceFileSyncStateSnapshot | null;
  recoveryStatus: PerformanceStartupRecoveryStatusSnapshot | null;
  settlement: SettlementProgress | null;
  fileWatchStatus: FileWatchStatusSnapshot | null;
}): HomeTodoItem[] {
  const {
    userRole,
    scheduleMonth,
    kpis,
    operations,
    syncState,
    recoveryStatus,
    settlement,
    fileWatchStatus,
  } = params;

  const todos: HomeTodoItem[] = [];

  // 1. pending 실적 (대기 실적 > 0)
  if (kpis && kpis.pendingCount > 0) {
    todos.push({
      id: "todo-pending-perf",
      type: "pending-performance",
      title: `대기 실적 ${kpis.pendingCount}건`,
      icon: "fact_check",
      iconColor: "#3E56B6",
    });
  }

  // 2. 미배포 schedule (운영 ①=참, ②=거짓인 근무지)
  if (operations && operations.unassignedSites.length > 0) {
    const monthNum = parseInt(scheduleMonth.split("-")[1], 10);
    for (const site of operations.unassignedSites) {
      todos.push({
        id: `todo-unreleased-${site.siteId}`,
        type: "unreleased-schedule",
        title: `${monthNum}월 근무표 미배포 — ${site.siteName}`,
        icon: "calendar_month",
        iconColor: "#A05200",
      });
    }
  }

  // 3. sync error / issues (status === "error" 또는 issueCount > 0)
  // issueCount === 0 이면 "0건 실패" 표현 금지
  if (syncState) {
    if (syncState.issueCount > 0) {
      todos.push({
        id: "todo-sync-error",
        type: "sync-error",
        title: `파일 해석 실패 ${syncState.issueCount}건`,
        icon: "error",
        iconColor: "#C0392B",
      });
    } else if (syncState.status === "error") {
      todos.push({
        id: "todo-sync-error",
        type: "sync-error",
        title: "파일 해석 동기화 오류 발생",
        icon: "error",
        iconColor: "#C0392B",
      });
    }
  }

  // 4. startup recovery issues (issues.length > 0 또는 approvedSyncIssueCount > 0)
  if (recoveryStatus && ((recoveryStatus.issues && recoveryStatus.issues.length > 0) || recoveryStatus.approvedSyncIssueCount > 0)) {
    const issueSummary = recoveryStatus.issues && recoveryStatus.issues.length > 0
      ? ` — ${recoveryStatus.issues.join(", ")}`
      : "";
    todos.push({
      id: "todo-startup-recovery",
      type: "startup-recovery",
      title: `시작 시 자동 복구 실패${issueSummary}`,
      icon: "refresh",
      iconColor: "#1E7A46",
      actionKind: "retry-recovery",
      actionLabel: "다시 복구",
    });
  }

  // 5. 미승인 계산 (정산 결과 중 미승인 > 0)
  if (settlement && settlement.unapprovedCount > 0) {
    todos.push({
      id: "todo-unapproved-calc",
      type: "unapproved-calculation",
      title: `대기 수당 ${settlement.unapprovedCount}건`,
      icon: "payments",
      iconColor: "#4B5563",
    });
  }

  // 6. 품의 미승인 (정산 ①=참, ②=거짓)
  if (settlement && settlement.step1Passed && !settlement.step2Passed) {
    todos.push({
      id: "todo-unapproved-proposal",
      type: "unapproved-proposal",
      title: "품의 미승인",
      icon: "description",
      iconColor: "#A05200",
    });
  }

  // 7. 이름 미연결 (overview group name match 0)
  if (kpis && kpis.unconnectedSiteNames.length > 0) {
    const count = kpis.unconnectedSiteNames.length;
    const detail = count === 1 ? ` (${kpis.unconnectedSiteNames[0]})` : "";
    todos.push({
      id: "todo-unconnected-site",
      type: "unconnected-site",
      title: `근무지 연결 불가 ${count}개${detail}`,
      icon: "warning",
      iconColor: "#8A6D00",
    });
  }

  // 8. 이름 중복 (overview group name match >= 2)
  if (kpis && kpis.duplicateSiteNames.length > 0) {
    const count = kpis.duplicateSiteNames.length;
    const detail = count === 1 ? ` (${kpis.duplicateSiteNames[0]})` : "";
    todos.push({
      id: "todo-duplicate-site",
      type: "duplicate-site",
      title: `중복 이름으로 연결 불확정 ${count}개${detail}`,
      icon: "warning",
      iconColor: "#8A6D00",
    });
  }

  // 9. admin watch stopped (admin 에게만 표시, isRunning === false)
  if (userRole === "admin" && fileWatchStatus && !fileWatchStatus.isRunning) {
    todos.push({
      id: "todo-watch-stopped",
      type: "watch-stopped",
      title: "폴더 감시 중단됨",
      icon: "warning",
      iconColor: "#C0392B",
      actionKind: "restart-watch",
      actionLabel: "다시 시작",
    });
  }

  return todos;
}
