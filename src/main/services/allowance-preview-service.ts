import { createAllowanceCalculationSnapshot, getAllowanceRateCoverageError } from "../../shared/domain/allowance-service";
import { buildAllowanceRateTable, resolveAllowanceRateCategoryCode } from "../../shared/domain/allowance-rate-matrix";
import { selectApplicableAllowanceRateVersion } from "../../shared/domain/allowance-rate-service";
import { listStoredAllowanceRateVersions, listStoredHolidayCalendars } from "./operations-storage-service";
import type {
  AllowancePreviewInput,
  BridgeResult
} from "../../shared/bridge/contracts";

export const previewAllowanceCalculation = (
  input: AllowancePreviewInput
): BridgeResult<ReturnType<typeof createAllowanceCalculationSnapshot>> => {
  try {
    const rateVersion = selectApplicableAllowanceRateVersion({targetDate: input.workDate, versions: listStoredAllowanceRateVersions()});
    if (!rateVersion) return {ok: false, errorCode: "ALLOWANCE_RATE_NOT_FOUND", message: "해당 근무일에 적용할 요율이 없습니다. 요율 관리에서 적용 기간을 확인해 주세요."};
    const isHoliday = input.isHoliday ?? listStoredHolidayCalendars(Number(input.workDate.slice(0,4)))
      .some(calendar => calendar.items.some(item => item.holidayDate === input.workDate));
    const workType = input.workType ?? "overtime";
    const rateTable = buildAllowanceRateTable(rateVersion);
    const result = createAllowanceCalculationSnapshot({
      calculationId: "preview-calculation",
      performanceApprovalId: "preview-approval",
      calculationVersion: 1,
      createdAt: new Date().toISOString(),
      approvedSnapshot: {
        performanceFileId: "preview-file",
        approvalStatus: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "system-preview",
        holidayCalendarId: "preview-holiday-calendar",
        allowanceRateVersionId: rateVersion.id,
        sourceFileChecksum: "preview-checksum"
      },
      workDate: input.workDate,
      timeRange: {
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes
      },
      hourlyRate: input.hourlyRate,
      isHoliday,
      workType,
      allowanceCategoryCode: resolveAllowanceRateCategoryCode({
        rawCategory: workType === "holiday" ? "법정휴일근무" : workType === "substitute" ? "대체근무" : "연장근무",
        isHoliday,
        workType
      }),
      rateTable
    });
    const coverageError = getAllowanceRateCoverageError(result, rateTable);
    if (coverageError) return { ok: false, ...coverageError };

    return {
      ok: true,
      data: result
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_PREVIEW_FAILED",
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
