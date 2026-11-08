import type { AllowanceRateVersion } from "./model";

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isDateInRange = (
  targetDate: string,
  effectiveFrom: string,
  effectiveTo?: string
) => {
  if (targetDate < effectiveFrom) {
    return false;
  }

  if (effectiveTo && targetDate > effectiveTo) {
    return false;
  }

  return true;
};

export const selectActiveAllowanceRateVersion = (input: {
  targetDate: string;
  versions: AllowanceRateVersion[];
}) => {
  const candidates = input.versions
    .filter((version) => version.status === "active")
    .filter((version) =>
      isDateInRange(input.targetDate, version.effectiveFrom, version.effectiveTo)
    )
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));

  return candidates[0] ?? null;
};

/** 현재 활성 표시와 과거 근무일의 적용 근거를 분리한다. 종료 이력은 확정된 기간만 인정한다. */
export const selectApplicableAllowanceRateVersion = (input: {
  targetDate: string;
  versions: AllowanceRateVersion[];
}): AllowanceRateVersion | null => {
  if (!isValidDate(input.targetDate)) return null;
  const candidates = [...new Map(input.versions.map(version => [version.id, version])).values()]
    .filter(version => version.status === "active" || version.status === "retired" && Boolean(version.effectiveTo))
    .filter(version => isValidDate(version.effectiveFrom) && (!version.effectiveTo ||
      isValidDate(version.effectiveTo) && version.effectiveFrom <= version.effectiveTo))
    .filter(version => isDateInRange(input.targetDate, version.effectiveFrom, version.effectiveTo))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  if (candidates.length > 1 && candidates[0]!.effectiveFrom === candidates[1]!.effectiveFrom) {
    throw new Error("같은 적용 시작일의 요율이 중복되어 있습니다. 요율 관리에서 기간을 확인해 주세요.");
  }
  return candidates[0] ?? null;
};

export const selectAppliedAllowanceRateVersion = (versions: AllowanceRateVersion[]) =>
  versions
    .filter((version) => version.status === "active")
    .sort((left, right) => {
      const leftUpdatedAt = left.updatedAt ?? left.createdAt;
      const rightUpdatedAt = right.updatedAt ?? right.createdAt;

      return (
        rightUpdatedAt.localeCompare(leftUpdatedAt) ||
        right.effectiveFrom.localeCompare(left.effectiveFrom)
      );
    })[0] ?? null;
