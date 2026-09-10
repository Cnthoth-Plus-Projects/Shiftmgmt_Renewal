export type DutyTypeKind = "work" | "off";

export const MAX_WORKING_DUTY_TYPE_COUNT = 3;
export const MIN_WORKING_DUTY_TYPE_COUNT = 1;

export interface DutyTypeDefinition {
  id: string;
  kind: DutyTypeKind;
  label: string;
  sortOrder: number;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  isBreakDirty?: boolean;
  holidayStartTime?: string;
  holidayEndTime?: string;
  holidayBreakMinutes?: number;
  isHolidayBreakDirty?: boolean;
}

/**
 * Calculates statutory auto-break duration: 30 minutes per full 4 hours (240 minutes) of work.
 * Formula: floor(workMinutes / 240) * 30
 */
export const autoBreakMinutes = (workMinutes: number): number => {
  if (workMinutes < 240) {
    return 0;
  }

  return Math.floor(Math.max(0, workMinutes) / 240) * 30;
};

/**
 * Parses "HH:mm" time string into total minutes from midnight (0~1439).
 */
const parseTimeToMinutes = (timeString: string): number => {
  const parts = timeString.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;

  return hours * 60 + minutes;
};

/**
 * Calculates work duration in minutes between startTime and endTime ("HH:mm").
 * Safely handles overnight shifts (endTime < startTime) by adding 24 hours.
 */
export const calculateDutyWorkMinutes = (startTime?: string, endTime?: string): number => {
  if (!startTime || !endTime || !startTime.trim() || !endTime.trim()) {
    return 0;
  }

  const start = parseTimeToMinutes(startTime.trim());
  const end = parseTimeToMinutes(endTime.trim());

  if (end < start) {
    return 24 * 60 - start + end;
  }

  return end - start;
};

export interface ResolveBreakMinutesInput {
  workMinutes: number;
  currentBreakMinutes?: number;
  isBreakDirty?: boolean;
}

/**
 * Resolves break minutes: preserves user-modified break minutes when isBreakDirty is true,
 * or recalculates auto break minutes when isBreakDirty is false or undefined.
 */
export const resolveBreakMinutes = (
  input: ResolveBreakMinutesInput
): { breakMinutes: number; isDirty: boolean } => {
  if (input.isBreakDirty && typeof input.currentBreakMinutes === "number") {
    return {
      breakMinutes: Math.max(0, input.currentBreakMinutes),
      isDirty: true
    };
  }

  return {
    breakMinutes: autoBreakMinutes(input.workMinutes),
    isDirty: false
  };
};

/**
 * Clamps shiftCount to the supported range [1, 3] (max 3 working duty types).
 */
export const clampShiftCount = (value: number): number => {
  if (Number.isNaN(value) || typeof value !== "number") {
    return 2;
  }

  return Math.min(Math.max(Math.round(value), MIN_WORKING_DUTY_TYPE_COUNT), MAX_WORKING_DUTY_TYPE_COUNT);
};

/**
 * Creates default duty catalog matching the specified shiftCount (1, 2, or 3).
 * Working duty types are capped at 3, off duty types (휴무, 비번) are unlimited.
 */
export const createDefaultDutyCatalog = (shiftCount = 2): DutyTypeDefinition[] => {
  const safeShiftCount = clampShiftCount(shiftCount);

  const workDuties: DutyTypeDefinition[] = [];

  if (safeShiftCount === 1) {
    const workMin = calculateDutyWorkMinutes("09:00", "18:00");
    workDuties.push({
      id: "duty-day",
      kind: "work",
      label: "주간",
      sortOrder: 0,
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: autoBreakMinutes(workMin),
      isBreakDirty: false
    });
  } else if (safeShiftCount === 2) {
    const dayMin = calculateDutyWorkMinutes("07:00", "19:00");
    const nightMin = calculateDutyWorkMinutes("19:00", "07:00");
    workDuties.push(
      {
        id: "duty-day",
        kind: "work",
        label: "주간",
        sortOrder: 0,
        startTime: "07:00",
        endTime: "19:00",
        breakMinutes: autoBreakMinutes(dayMin),
        isBreakDirty: false
      },
      {
        id: "duty-night",
        kind: "work",
        label: "야간",
        sortOrder: 1,
        startTime: "19:00",
        endTime: "07:00",
        breakMinutes: autoBreakMinutes(nightMin),
        isBreakDirty: false
      }
    );
  } else {
    // safeShiftCount === 3
    const morningMin = calculateDutyWorkMinutes("06:00", "14:00");
    const afternoonMin = calculateDutyWorkMinutes("14:00", "22:00");
    const nightMin = calculateDutyWorkMinutes("22:00", "06:00");
    workDuties.push(
      {
        id: "duty-day",
        kind: "work",
        label: "주간",
        sortOrder: 0,
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: autoBreakMinutes(morningMin),
        isBreakDirty: false
      },
      {
        id: "duty-evening",
        kind: "work",
        label: "석간",
        sortOrder: 1,
        startTime: "14:00",
        endTime: "22:00",
        breakMinutes: autoBreakMinutes(afternoonMin),
        isBreakDirty: false
      },
      {
        id: "duty-night",
        kind: "work",
        label: "야간",
        sortOrder: 2,
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: autoBreakMinutes(nightMin),
        isBreakDirty: false
      }
    );
  }

  const offDuties: DutyTypeDefinition[] = [
    {
      id: "duty-off",
      kind: "off",
      label: "휴무",
      sortOrder: workDuties.length
    },
    {
      id: "duty-off-rest",
      kind: "off",
      label: "비번",
      sortOrder: workDuties.length + 1
    }
  ];

  return [...workDuties, ...offDuties];
};

export interface ValidateDutyCatalogResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a duty type catalog:
 * - Work-kind duty types must not exceed MAX_WORKING_DUTY_TYPE_COUNT (3).
 * - Off-kind duty types have no count limit.
 * - IDs must be unique and non-empty.
 * - Labels must be non-empty.
 */
export const validateDutyCatalog = (items: DutyTypeDefinition[]): ValidateDutyCatalogResult => {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  let workCount = 0;

  for (const item of items) {
    if (!item.id || !item.id.trim()) {
      errors.push("근무유형 ID가 비어 있습니다.");
    } else if (seenIds.has(item.id.trim())) {
      errors.push(`중복된 근무유형 ID가 존재합니다: ${item.id}`);
    } else {
      seenIds.add(item.id.trim());
    }

    if (!item.label || !item.label.trim()) {
      errors.push(`근무유형 라벨이 비어 있습니다 (ID: ${item.id}).`);
    }

    if (item.kind === "work") {
      workCount++;
    }
  }

  if (workCount > MAX_WORKING_DUTY_TYPE_COUNT) {
    errors.push(
      `시간이 있는 근무형은 최대 ${MAX_WORKING_DUTY_TYPE_COUNT}개까지만 설정할 수 있습니다 (현재: ${workCount}개).`
    );
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const OFF_DUTY_CODE_SET = new Set<string>(["X", "OFF", "O", "휴", "비", "휴무", "비번"]);

/**
 * Checks whether a given duty code represents an off/leave/rest slot.
 */
export const isOffDutyCode = (dutyCode?: string | null): boolean => {
  if (dutyCode === undefined || dutyCode === null) {
    return true;
  }
  const trimmed = dutyCode.trim();
  if (trimmed === "") {
    return true;
  }
  const normalized = trimmed.toUpperCase();
  return OFF_DUTY_CODE_SET.has(normalized) || OFF_DUTY_CODE_SET.has(trimmed);
};

export interface ShiftPatternStepLike {
  stepIndex: number;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  holidayStartTime?: string;
  holidayEndTime?: string;
  holidayBreakMinutes?: number;
}

/**
 * Derives a backward-compatible duty catalog from a legacy pattern or shiftCount/steps.
 * If steps contain timing information, it will be reflected in the generated catalog.
 */
export const deriveDefaultCatalogFromShiftPattern = (
  pattern: {
    shiftCount?: number;
    cycles?: Array<{
      shiftCount?: number;
      steps?: ShiftPatternStepLike[];
    }>;
    steps?: ShiftPatternStepLike[];
  }
): DutyTypeDefinition[] => {
  const primaryCycle = pattern.cycles?.[0];
  const shiftCount = primaryCycle?.shiftCount ?? pattern.shiftCount ?? 2;
  const defaultCatalog = createDefaultDutyCatalog(shiftCount);

  const steps = primaryCycle?.steps ?? pattern.steps ?? [];
  if (steps.length === 0) {
    return defaultCatalog;
  }

  // Extract distinct working steps (preserve first occurrence order, max 3 working types)
  const seenWorkingCodes = new Set<string>();
  const workingSteps: ShiftPatternStepLike[] = [];

  for (const step of steps) {
    const rawCode = step.dutyCode ?? "";
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!isOffDutyCode(rawCode) && !seenWorkingCodes.has(normalizedCode)) {
      seenWorkingCodes.add(normalizedCode);
      workingSteps.push(step);
      if (workingSteps.length >= MAX_WORKING_DUTY_TYPE_COUNT) {
        break;
      }
    }
  }

  if (workingSteps.length === 0) {
    return defaultCatalog;
  }

  const result: DutyTypeDefinition[] = defaultCatalog.map((item, index) => {
    if (item.kind === "work") {
      const step = workingSteps[index];
      if (step) {
        return {
          ...item,
          startTime: step.startTime ?? item.startTime,
          endTime: step.endTime ?? item.endTime,
          breakMinutes: typeof step.breakMinutes === "number" ? step.breakMinutes : item.breakMinutes,
          isBreakDirty: typeof step.breakMinutes === "number",
          holidayStartTime: step.holidayStartTime,
          holidayEndTime: step.holidayEndTime,
          holidayBreakMinutes: step.holidayBreakMinutes,
          isHolidayBreakDirty: typeof step.holidayBreakMinutes === "number"
        };
      }
    }
    return item;
  });

  return result;
};
