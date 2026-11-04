import { listStoredPatternPresets, saveStoredPatternPreset, deleteStoredPatternPreset } from "../../services/pattern-preset-storage-service";
import type {
  EmployeeDeleteInput,
  EmployeeListQuery,
  EmployeeUpsertInput,
  MonthlyScheduleUpsertInput,
  SchedulePreparationContext,
  ShiftPatternUpsertInput,
  SiteUpsertInput,
} from "../../../shared/bridge/contracts";
import { defaultScheduleRuleWarningSettings } from "../../../shared/domain/schedule-rule-warning";
import { getStoredAppSettingsSnapshot } from "../../services/app-settings-storage-service";
import { listStoredHolidayCalendars } from "../../services/operations-storage-service";
import {
  closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  reorderStoredEmployeeAssignment,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate,
} from "../../services/employee-history-service";
import {
  deleteStoredEmployee,
  listStoredEmployees,
  saveStoredEmployee,
} from "../../services/employee-storage-service";
import {
  listStoredMonthlySchedules,
  saveStoredMonthlySchedule,
} from "../../services/monthly-schedule-storage-service";
import { exportMonthlySchedulePlan } from "../../services/schedule-plan-export-service";
import { listStoredSchedulePlanExports } from "../../services/schedule-plan-export-history-service";
import { publishSchedulePlanExport } from "../../services/schedule-plan-publish-service";
import { previewMonthlySchedulePlan } from "../../services/schedule-plan-preview-service";
import {
  deactivateStoredShiftPattern,
  listStoredShiftPatterns,
  saveStoredShiftPattern,
} from "../../services/shift-pattern-storage-service";
import { analyzeSitePatternImport } from "../../services/site-pattern-extraction-service";
import {
  deleteStoredSite,
  listStoredSites,
  saveStoredSite,
} from "../../services/site-storage-service";
import {
  applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate,
} from "../../services/workforce-wage-bulk-update-service";
import {
  createIpcSuccess,
  runIpcAction,
  type IpcActivityInput,
} from "../../ipc/ipc-handler-helpers";
import type { RequestContext } from "../api-types";
import type { RouteRegistry } from "../route-registry";
import type { SessionManager } from "../session";
import { refreshPendingPerformanceForWageChanges } from "../../services/workforce-wage-performance-service";

function isValidIsoDateForYear(dateStr: string, expectedYear: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parts = dateStr.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y !== expectedYear || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const trackSuccess = (
  context: RequestContext,
  sessionManager: SessionManager,
  input: Omit<IpcActivityInput, "session">,
) => ({
  input: {
    ...input,
    session: context.session,
  },
  recordSuccessfulActivity: <T extends { ok: boolean }>(result: T, activity: IpcActivityInput) =>
    sessionManager.recordSuccessfulActivity(result, activity),
});

export const registerWorkforceRoutes = (
  registry: RouteRegistry,
  sessionManager: SessionManager,
): void => {
  // 1. employees:list
  registry.register("employees:list", (args) => {
    const query = args[0] as EmployeeListQuery | undefined;
    return createIpcSuccess(listStoredEmployees(query));
  });

  // 2. employees:list-wage-rates
  registry.register("employees:list-wage-rates", (args) =>
    createIpcSuccess(listStoredEmployeeWageRates(args[0] as string)),
  );

  // 3. employees:list-assignments
  registry.register("employees:list-assignments", (args) =>
    createIpcSuccess(listStoredEmployeeAssignments(args[0] as string)),
  );

  // 4. employees:save-wage-rate
  registry.register("employees:save-wage-rate", async (args, context) => {
    const input = args[0] as Parameters<typeof saveStoredEmployeeWageRate>[0];
    return runIpcAction({
      action: async () => {
        const record = saveStoredEmployeeWageRate(input, context.session ?? undefined);
        const pendingPerformanceRefresh = await refreshPendingPerformanceForWageChanges([record]);
        return { ...record, pendingPerformanceRefresh };
      },
      errorCode: "EMPLOYEE_WAGE_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-wage-save",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: input.revision?.operation === "invalidate" ? "직원 시급 이력 무효 처리" : input.revision ? "직원 시급 금액 정정" : "직원 시급 기준 저장",
      }),
    });
  });

  // 5. employees:close-wage-rate
  registry.register("employees:close-wage-rate", async (args, context) => {
    const input = args[0] as Parameters<typeof closeStoredEmployeeWageRate>[0];
    return runIpcAction({
      action: () => closeStoredEmployeeWageRate(input),
      errorCode: "EMPLOYEE_WAGE_CLOSE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-wage-close",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: "직원 시급 이력 종료",
      }),
    });
  });

  // 6. employees:save-assignment
  registry.register("employees:save-assignment", async (args, context) => {
    const input = args[0] as Parameters<typeof saveStoredEmployeeAssignment>[0];
    return runIpcAction({
      action: () => saveStoredEmployeeAssignment(input),
      errorCode: "EMPLOYEE_ASSIGNMENT_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-assignment-save",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: "직원 근무지 배정 저장",
      }),
    });
  });

  // 7. employees:close-assignment
  registry.register("employees:close-assignment", async (args, context) => {
    const input = args[0] as Parameters<typeof closeStoredEmployeeAssignment>[0];
    return runIpcAction({
      action: () => closeStoredEmployeeAssignment(input),
      errorCode: "EMPLOYEE_ASSIGNMENT_CLOSE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-assignment-close",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: "직원 근무지 배정 종료",
      }),
    });
  });

  // 8. employees:reorder-assignment
  registry.register("employees:reorder-assignment", async (args, context) => {
    const input = args[0] as Parameters<typeof reorderStoredEmployeeAssignment>[0];
    return runIpcAction({
      action: () => reorderStoredEmployeeAssignment(input),
      errorCode: "EMPLOYEE_ASSIGNMENT_REORDER_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-assignment-reorder",
        routeKey: "sites",
        routeLabel: "근무지 관리",
        details: "직원 근무지 배정 순서 변경",
      }),
    });
  });

  // 9. employees:save
  registry.register("employees:save", async (args, context) => {
    const input = args[0] as EmployeeUpsertInput;
    return runIpcAction({
      action: async () => {
        const record = saveStoredEmployee(input, context.session ?? undefined);
        if (!record.retirementChange && !record.rehireChange) return record;
        const dates = (record.rehireChange ? [record.rehireChange.startDate,record.rehireChange.previousStartDate,record.rehireChange.previousRetireDate] : [record.retirementChange!.retireDate,record.retirementChange!.previousRetireDate]).filter((d): d is string => Boolean(d)).sort();
        const pendingPerformanceRefresh = await refreshPendingPerformanceForWageChanges([{ employeeId:record.id,effectiveFrom:dates[0],employmentFrom:dates[0] }]);
        return record.rehireChange ? { ...record,rehireChange:{ ...record.rehireChange,pendingPerformanceRefresh } } : { ...record,retirementChange:{ ...record.retirementChange!,pendingPerformanceRefresh } };
      },
      errorCode: "EMPLOYEE_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-save",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: "인력 기본 정보 저장",
      }),
    });
  });

  // 10. employees:delete
  registry.register("employees:delete", async (args, context) => {
    const input = args[0] as EmployeeDeleteInput;
    return runIpcAction({
      action: () => deleteStoredEmployee(input.employeeId, context.session ?? undefined),
      errorCode: "EMPLOYEE_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-delete",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: "인력 삭제",
      }),
    });
  });

  // 11. employees:preview-wage-bulk-update
  registry.register("employees:preview-wage-bulk-update", async (args) => {
    const input = args[0] as Parameters<typeof previewWorkforceWageBulkUpdate>[0];
    return runIpcAction({
      action: () => previewWorkforceWageBulkUpdate(input),
      errorCode: "WORKFORCE_WAGE_BULK_PREVIEW_FAILED",
      getErrorMessage,
    });
  });

  // 12. employees:apply-wage-bulk-update
  registry.register("employees:apply-wage-bulk-update", async (args, context) => {
    const input = args[0] as Parameters<typeof applyWorkforceWageBulkUpdate>[0];
    return runIpcAction({
      action: async () => {
        const summary = await applyWorkforceWageBulkUpdate(input, context.session ?? undefined);
        const changes = summary.rows.filter(row => row.status === "applied" && row.employeeId).map(row => ({ employeeId: row.employeeId!, effectiveFrom: summary.effectiveFrom }));
        const pendingPerformanceRefresh = await refreshPendingPerformanceForWageChanges(changes);
        return { ...summary, pendingPerformanceRefresh };
      },
      errorCode: "WORKFORCE_WAGE_BULK_APPLY_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "employee-wage-bulk-apply",
        routeKey: "workforce",
        routeLabel: "인력 관리",
        details: "시급 일괄 업데이트 적용",
      }),
    });
  });

  // 13. sites:save
  registry.register("sites:save", async (args, context) => {
    const input = args[0] as SiteUpsertInput;
    return runIpcAction({
      action: () => saveStoredSite(input),
      errorCode: "SITE_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "site-save",
        routeKey: "sites",
        routeLabel: "근무지 관리",
        details: "근무지 정보 저장",
      }),
    });
  });

  // 14. sites:list
  registry.register("sites:list", () => createIpcSuccess(listStoredSites()));

  // 15. sites:delete
  registry.register("sites:delete", async (args, context) => {
    const input = args[0] as Parameters<typeof deleteStoredSite>[0] extends string
      ? { siteId: string }
      : never;
    return runIpcAction({
      action: () => deleteStoredSite(input.siteId),
      errorCode: "SITE_DELETE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "site-delete",
        routeKey: "sites",
        routeLabel: "근무지 관리",
        details: "근무지 삭제",
      }),
    });
  });

  registry.register("shift-pattern-presets:list", () => createIpcSuccess(listStoredPatternPresets()));
  registry.register("shift-pattern-presets:save", (args, context) => runIpcAction({action:()=>saveStoredPatternPreset(args[0] as Parameters<typeof saveStoredPatternPreset>[0]),errorCode:"PATTERN_PRESET_SAVE_FAILED",getErrorMessage,activity:trackSuccess(context,sessionManager,{actionType:"app-settings-save",routeKey:"sites",routeLabel:"근무지 관리",details:"반복 패턴 보관함 저장"})}));
  registry.register("shift-pattern-presets:delete", (args, context) => runIpcAction({action:()=>deleteStoredPatternPreset(args[0] as Parameters<typeof deleteStoredPatternPreset>[0]),errorCode:"PATTERN_PRESET_DELETE_FAILED",getErrorMessage,activity:trackSuccess(context,sessionManager,{actionType:"app-settings-save",routeKey:"sites",routeLabel:"근무지 관리",details:"반복 패턴 보관함 삭제"})}));

  // 16. shift-patterns:list
  registry.register("shift-patterns:list", (args) =>
    createIpcSuccess(listStoredShiftPatterns(args[0] as string | undefined)),
  );

  // 17. shift-patterns:analyze-import
  registry.register("shift-patterns:analyze-import", async (args, context) => {
    const input = args[0] as Parameters<typeof analyzeSitePatternImport>[0];
    return runIpcAction({
      action: () => analyzeSitePatternImport(input),
      errorCode: "SITE_PATTERN_IMPORT_ANALYZE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "shift-pattern-import",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무패턴 분석",
      }),
    });
  });

  // 18. shift-patterns:save
  registry.register("shift-patterns:save", async (args, context) => {
    const input = args[0] as ShiftPatternUpsertInput;
    return runIpcAction({
      action: () => saveStoredShiftPattern(input),
      errorCode: "SHIFT_PATTERN_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "shift-pattern-save",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무패턴 저장",
      }),
    });
  });

  // 19. shift-patterns:deactivate
  registry.register("shift-patterns:deactivate", async (args, context) => {
    const input = args[0] as { patternId: string };
    return runIpcAction({
      action: () => deactivateStoredShiftPattern(input.patternId),
      errorCode: "SHIFT_PATTERN_DEACTIVATE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "shift-pattern-deactivate",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무패턴 비활성화",
      }),
    });
  });

  // 20. monthly-schedules:list
  registry.register("monthly-schedules:list", (args) =>
    createIpcSuccess(listStoredMonthlySchedules(args[0] as string | undefined)),
  );

  // 21. monthly-schedules:save
  registry.register("monthly-schedules:save", async (args, context) => {
    const input = args[0] as MonthlyScheduleUpsertInput;
    return runIpcAction({
      action: () => saveStoredMonthlySchedule(input),
      errorCode: "MONTHLY_SCHEDULE_SAVE_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "schedule-save",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무표 저장",
      }),
    });
  });

  // 22. monthly-schedules:preview-plan
  registry.register("monthly-schedules:preview-plan", async (args, context) => {
    const scheduleId = args[0] as string;
    return runIpcAction({
      action: () => previewMonthlySchedulePlan(scheduleId),
      errorCode: "MONTHLY_SCHEDULE_PREVIEW_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "schedule-preview",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무표 미리보기",
      }),
    });
  });

  // 23. monthly-schedules:export-plan
  registry.register("monthly-schedules:export-plan", async (args, context) => {
    const scheduleId = args[0] as string;
    return runIpcAction({
      action: () =>
        exportMonthlySchedulePlan({
          scheduleId,
          userDataPath: context.dataDir,
        }),
      errorCode: "MONTHLY_SCHEDULE_EXPORT_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "schedule-export",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무표 생성",
      }),
    });
  });

  // 24. monthly-schedules:list-exports
  registry.register("monthly-schedules:list-exports", (args) =>
    createIpcSuccess(listStoredSchedulePlanExports(args[0] as string | undefined)),
  );

  // 25. monthly-schedules:publish-export
  registry.register("monthly-schedules:publish-export", async (args, context) => {
    const exportId = args[0] as string;
    return runIpcAction({
      action: () =>
        publishSchedulePlanExport({
          exportId,
          userDataPath: context.dataDir,
        }),
      errorCode: "MONTHLY_SCHEDULE_PUBLISH_FAILED",
      getErrorMessage,
      activity: trackSuccess(context, sessionManager, {
        actionType: "schedule-publish",
        routeKey: "schedule",
        routeLabel: "근무표 배포",
        details: "근무표 배포",
      }),
    });
  });

  // 26. monthly-schedules:preparation-context
  registry.register("monthly-schedules:preparation-context", async (args, context) => {
    const year = args[0] as number;
    return runIpcAction({
      action: async () => {
        if (
          typeof year !== "number" ||
          !Number.isFinite(year) ||
          !Number.isInteger(year) ||
          year < 1900 ||
          year > 9999
        ) {
          throw new Error("유효한 연도(1900~9999)를 입력해 주세요.");
        }

        const appSettings = getStoredAppSettingsSnapshot({ userDataPath: context.dataDir });
        const calendars = listStoredHolidayCalendars(year);
        const holidayDatesSet = new Set<string>();

        for (const cal of calendars) {
          if (Array.isArray(cal.items)) {
            for (const item of cal.items) {
              if (
                typeof item.holidayDate === "string" &&
                isValidIsoDateForYear(item.holidayDate, year)
              ) {
                holidayDatesSet.add(item.holidayDate);
              }
            }
          }
        }

        const publicHolidayDates = Array.from(holidayDatesSet).sort();

        const warningSettings = {
          consecutiveNightLimit:
            appSettings.scheduleConsecutiveNightLimit ??
            defaultScheduleRuleWarningSettings.consecutiveNightLimit,
          minimumRestMinutes:
            appSettings.scheduleMinimumRestMinutes ??
            defaultScheduleRuleWarningSettings.minimumRestMinutes,
          requireWeeklyHoliday:
            appSettings.scheduleRequireWeeklyHoliday ??
            defaultScheduleRuleWarningSettings.requireWeeklyHoliday,
          weeklyMaxMinutes:
            appSettings.scheduleWeeklyMaxMinutes ??
            defaultScheduleRuleWarningSettings.weeklyMaxMinutes,
        };

        const result: SchedulePreparationContext = {
          year,
          publicHolidayDates,
          warningSettings,
          exportDirectory: appSettings.scheduleExportDir,
          publishDirectory: appSettings.approvedDir,
        };

        return result;
      },
      errorCode: "MONTHLY_SCHEDULE_CONTEXT_FAILED",
      getErrorMessage,
    });
  });
};
