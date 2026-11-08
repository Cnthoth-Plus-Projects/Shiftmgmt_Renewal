import {
  calculateWorkBreakdown,
  type AllowanceCalculationLine,
  type AllowanceCalculationSnapshot,
  type ApprovedPerformanceSnapshot,
  type TimeRange
} from "./calculation";
import {
  resolveAllowanceRateCategoryCode,
  resolveAllowanceRateCategoryLabel,
  type AllowanceRateCategoryCode,
  type AllowanceRateMatrix
} from "./allowance-rate-matrix";
import type { AllowanceCalculationStatus } from "./allowance-workflow";
import type { EmployeeRank } from "./employee-rank";
import type { WorkType } from "./model";

export type AllowanceRateTable = AllowanceRateMatrix;

export interface ApprovedPerformanceCalculationInput {
  calculationId: string;
  performanceApprovalId: string;
  calculationVersion: number;
  createdAt: string;
  approvedSnapshot: ApprovedPerformanceSnapshot;
  workDate: string;
  timeRange: TimeRange;
  hourlyRate: number;
  isHoliday?: boolean;
  workType?: WorkType;
  allowanceCategoryCode?: AllowanceRateCategoryCode;
  rateTable: AllowanceRateTable;
}

export interface AllowanceCalculationResultRecord {
  id: string;
  fileId: string;
  fileName: string;
  entryId: string;
  employeeCode: string;
  employeeName: string;
  employeeRank?: EmployeeRank;
  siteName: string;
  workDate: string;
  workType: WorkType;
  hourlyRate: number;
  rateVersionId: string;
  rateVersionLabel: string;
  status: AllowanceCalculationStatus;
  earlyPayoutDate?: string;
  signature: string;
  snapshot: AllowanceCalculationSnapshot;
}

export interface AllowanceLineAmountInput {
  workMinutes: number;
  multiplier: number;
}

export interface RoundedAllowanceLineAmounts {
  lineAmounts: number[];
  totalAmount: number;
}

type AllowanceCalculationLineDraft = Omit<AllowanceCalculationLine, "amount">;

interface ExactAmount { numerator: bigint; denominator: bigint }
const gcd = (left: bigint, right: bigint): bigint => {
  while (right) [left, right] = [right, left % right];
  return left;
};
const reduceAmount = (numerator: bigint, denominator: bigint): ExactAmount => {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
};
const decimalFraction = (value: number): ExactAmount => {
  const [mantissa, exponentText] = Math.abs(value).toString().toLowerCase().split("e");
  const [whole, fractional = ""] = mantissa!.split(".");
  const exponent = Number(exponentText ?? 0) - fractional.length;
  const digits = BigInt(whole! + fractional);
  return exponent >= 0
    ? { numerator: digits * 10n ** BigInt(exponent), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-exponent) };
};
const toExactAllowanceAmount = (hourlyRate: number, workMinutes: number, multiplier: number): ExactAmount => {
  const factors = [hourlyRate, workMinutes, multiplier];
  if (factors.some(value => !Number.isFinite(value) || value === 0) || factors.filter(value => value < 0).length % 2) {
    return { numerator: 0n, denominator: 1n };
  }
  let numerator = 1n, denominator = 60n;
  for (const factor of factors) {
    const part = decimalFraction(factor);
    numerator *= part.numerator;
    denominator *= part.denominator;
  }
  return reduceAmount(numerator, denominator);
};
const toSafeWon = (value: bigint) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("계산 금액이 정확하게 처리할 수 있는 범위를 넘었습니다. 시급과 요율을 확인해 주세요.");
  }
  return Number(value);
};

export const calculateRoundedAllowanceLineAmounts = (
  hourlyRate: number,
  lines: AllowanceLineAmountInput[]
): RoundedAllowanceLineAmounts => {
  const rawAmounts = lines.map((line) =>
    toExactAllowanceAmount(hourlyRate, line.workMinutes, line.multiplier)
  );
  const total = rawAmounts.reduce((sum, amount) => reduceAmount(
    sum.numerator * amount.denominator + amount.numerator * sum.denominator,
    sum.denominator * amount.denominator
  ), { numerator: 0n, denominator: 1n });
  const totalWon = (total.numerator + total.denominator - 1n) / total.denominator;
  const totalAmount = toSafeWon(totalWon);
  const lineWon = rawAmounts.map(amount => amount.numerator / amount.denominator);
  let remainingAmount = totalWon - lineWon.reduce((sum, amount) => sum + amount, 0n);

  const allocationOrder = rawAmounts
    .map((amount, index) => ({
      index,
      remainder: amount.numerator % amount.denominator,
      denominator: amount.denominator
    }))
    .sort((left, right) => {
      const difference = right.remainder * left.denominator - left.remainder * right.denominator;
      return difference === 0n ? left.index - right.index : difference > 0n ? 1 : -1;
    });

  for (const allocation of allocationOrder) {
    if (remainingAmount <= 0n) {
      break;
    }

    lineWon[allocation.index] = lineWon[allocation.index]! + 1n;
    remainingAmount -= 1n;
  }

  return {
    lineAmounts: lineWon.map(toSafeWon),
    totalAmount
  };
};

const createLine = (
  allowanceCode: AllowanceCalculationLine["allowanceCode"],
  workMinutes: number,
  multiplier: number
): AllowanceCalculationLineDraft | null => {
  if (workMinutes <= 0 || multiplier <= 0) {
    return null;
  }

  return {
    allowanceCode,
    workMinutes,
    multiplier
  };
};

export const createAllowanceCalculationSnapshot = (
  input: ApprovedPerformanceCalculationInput
): AllowanceCalculationSnapshot => {
  const businessCategoryCode =
    input.allowanceCategoryCode ??
    resolveAllowanceRateCategoryCode({
      rawCategory: undefined,
      isHoliday: input.isHoliday,
      workType: input.workType
    });
  const isHolidayCategory =
    businessCategoryCode === "legal-holiday" ||
    businessCategoryCode === "holiday-substitute" ||
    businessCategoryCode === "holiday-overtime";
  const isSubstituteCategory =
    businessCategoryCode === "weekday-substitute" || businessCategoryCode === "holiday-substitute";
  const breakdown = calculateWorkBreakdown({
    isHoliday: isHolidayCategory,
    workType: isSubstituteCategory ? "substitute" : input.workType,
    timeRange: input.timeRange
  });
  const activeRate = input.rateTable[businessCategoryCode] ?? input.rateTable["weekday-overtime"];

  const lineDrafts = [
    createLine("base", breakdown.baseWorkMinutes, activeRate.base),
    createLine("overtime", breakdown.overtimeMinutes, activeRate.overtime),
    createLine("night", breakdown.nightMinutes, activeRate.night)
  ].filter((line): line is AllowanceCalculationLineDraft => line !== null);
  const roundedAmounts = calculateRoundedAllowanceLineAmounts(input.hourlyRate, lineDrafts);
  const lines = lineDrafts.map((line, index) => ({
    ...line,
    amount: roundedAmounts.lineAmounts[index] ?? 0
  }));

  const totalAllowanceAmount = roundedAmounts.totalAmount;

  return {
    id: input.calculationId,
    performanceApprovalId: input.performanceApprovalId,
    calculationVersion: input.calculationVersion,
    businessCategoryCode,
    businessCategoryLabel: resolveAllowanceRateCategoryLabel(businessCategoryCode),
    breakdown,
    lines,
    totalAllowanceAmount,
    createdAt: input.createdAt
  };
};

export const createAllowanceCalculationSignature = (
  snapshot: AllowanceCalculationSnapshot
) => JSON.stringify({
  performanceApprovalId: snapshot.performanceApprovalId,
  calculationVersion: snapshot.calculationVersion,
  businessCategoryCode: snapshot.businessCategoryCode,
  breakdown: snapshot.breakdown,
  lines: snapshot.lines.map((line) => ({
    allowanceCode: line.allowanceCode,
    workMinutes: line.workMinutes,
    multiplier: line.multiplier,
    amount: line.amount
  })),
  totalAllowanceAmount: snapshot.totalAllowanceAmount
});

/** 실제 지급/미리보기 검문. 순수 계산과 영향도 비교는 0배 가정도 계산할 수 있다. */
export const getAllowanceRateCoverageError = (
  snapshot: AllowanceCalculationSnapshot,
  rateTable: AllowanceRateTable
): { errorCode: "ALLOWANCE_RATE_ZERO_AMOUNT" | "ALLOWANCE_RATE_INCOMPLETE"; message: string } | null => {
  const rate = rateTable[snapshot.businessCategoryCode];
  const axes = [
    { label: "기본", minutes: snapshot.breakdown.baseWorkMinutes, multiplier: rate.base },
    { label: "연장", minutes: snapshot.breakdown.overtimeMinutes, multiplier: rate.overtime },
    { label: "야간", minutes: snapshot.breakdown.nightMinutes, multiplier: rate.night }
  ];
  const missing = axes.filter(axis => axis.minutes > 0 && (!Number.isFinite(axis.multiplier) || axis.multiplier <= 0));
  if (!missing.length) return null;
  if (snapshot.totalAllowanceAmount <= 0) {
    return {
      errorCode: "ALLOWANCE_RATE_ZERO_AMOUNT",
      message: `실제 근무시간에 적용할 요율이 모두 0입니다. ${snapshot.businessCategoryLabel}: ${missing.map(axis => `${axis.label} ${axis.minutes}분`).join(", ")}. 요율 관리에서 해당 근무일의 ${missing.map(axis => axis.label).join("·")} 배율을 확인한 뒤 다시 승인해 주세요.`
    };
  }
  return {
    errorCode: "ALLOWANCE_RATE_INCOMPLETE",
    message: `${snapshot.businessCategoryLabel}의 ${missing.map(axis => `${axis.label} ${axis.minutes}분`).join(", ")}에 적용할 배율이 0이거나 올바르지 않습니다. 일부 수당이 빠지지 않도록 요율 관리에서 해당 근무일의 ${missing.map(axis => axis.label).join("·")} 배율을 설정한 뒤 다시 확인해 주세요.`
  };
};
