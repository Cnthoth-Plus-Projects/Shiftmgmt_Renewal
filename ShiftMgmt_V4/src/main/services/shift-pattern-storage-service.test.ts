import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  deactivateStoredShiftPattern,
  listStoredShiftPatterns,
  resetShiftPatternStorageForTest,
  saveStoredShiftPattern
} from "./shift-pattern-storage-service";

describe("shift-pattern-storage-service", () => {
  afterEach(() => {
    resetShiftPatternStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should seed and list default shift patterns", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });

    const patterns = listStoredShiftPatterns();
    const boramaePattern = patterns.find((pattern) => pattern.name === "보라매 4조 2교대");

    expect(patterns.length).toBeGreaterThanOrEqual(2);
    expect(boramaePattern?.teamCount).toBe(4);
    expect(boramaePattern?.patternCode).toBe("DDNNXX");
    expect(boramaePattern?.patternStartDate).toBe("2024-09-01");
    expect(boramaePattern?.cycles).toHaveLength(1);
    expect(boramaePattern?.teamCycleAssignments).toEqual([
      { teamLabel: "A조", cycleKey: "cycle-1" },
      { teamLabel: "B조", cycleKey: "cycle-1" },
      { teamLabel: "C조", cycleKey: "cycle-1" },
      { teamLabel: "D조", cycleKey: "cycle-1" }
    ]);
    expect(boramaePattern?.teamCapacities).toHaveLength(4);
    expect(boramaePattern?.teamCapacities.find((item) => item.teamLabel === "A조")?.maxHeadcount).toBeUndefined();
    expect(boramaePattern?.teamIndexes).toEqual([
      { teamLabel: "A조", index: 0 },
      { teamLabel: "B조", index: 1 },
      { teamLabel: "C조", index: 2 },
      { teamLabel: "D조", index: 3 }
    ]);
    expect(boramaePattern?.steps).toHaveLength(6);
  });

  it("should save a shift pattern with multiple cycles and pool settings", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    expect(targetSite).toBeDefined();

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "인천 야간 집중조",
      teamCount: 4,
      patternCode: "NNXX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-04-01",
      status: "active",
      poolEnabled: true,
      poolStartTime: "09:00",
      poolEndTime: "18:00",
      poolBreakMinutes: 60,
      teamCapacities: [
        { teamLabel: "A조", maxHeadcount: 3 },
        { teamLabel: "B조", maxHeadcount: 3 },
        { teamLabel: "C조", maxHeadcount: 2 }
      ],
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 2 },
        { teamLabel: "C조", index: 4 },
        { teamLabel: "D조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 }
      ],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 1,
          patternCode: "NX",
          patternString: "야휴",
          patternStartDate: "2026-04-01",
          steps: [
            { stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
            { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        },
        {
          cycleKey: "cycle-2",
          name: "Cycle 2",
          order: 1,
          shiftCount: 1,
          patternCode: "DX",
          patternString: "1휴",
          patternStartDate: "2026-04-03",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: [
            { teamLabel: "C조", index: 0 },
            { teamLabel: "D조", index: 1 }
          ]
        }
      ],
      teamCycleAssignments: [
        { teamLabel: "A조", cycleKey: "cycle-1" },
        { teamLabel: "B조", cycleKey: "cycle-1" },
        { teamLabel: "C조", cycleKey: "cycle-2" },
        { teamLabel: "D조", cycleKey: "cycle-2" }
      ]
    });

    expect(saved.name).toBe("인천 야간 집중조");
    expect(saved.teamCount).toBe(4);
    expect(saved.cycleLength).toBe(2);
    expect(saved.patternStartDate).toBe("2026-04-01");
    expect(saved.teamIndexes[1]?.index).toBe(1);
    expect(saved.steps[0]?.dutyCode).toBe("N");
    expect(saved.cycles).toHaveLength(2);
    expect(saved.cycles[0]?.patternString).toBe("야휴");
    expect(saved.cycles[1]?.patternStartDate).toBe("2026-04-03");
    expect(saved.cycles[1]?.patternString).toBe("1휴");
    expect(saved.teamCycleAssignments).toEqual([
      { teamLabel: "A조", cycleKey: "cycle-1" },
      { teamLabel: "B조", cycleKey: "cycle-1" },
      { teamLabel: "C조", cycleKey: "cycle-2" },
      { teamLabel: "D조", cycleKey: "cycle-2" }
    ]);
    // Pool 조도 조 목록에 포함되므로 정원 칸이 함께 생긴다(값은 비어 있음).
    expect(saved.teamCapacities).toEqual([
      { teamLabel: "A조", maxHeadcount: 3 },
      { teamLabel: "B조", maxHeadcount: 3 },
      { teamLabel: "C조", maxHeadcount: 2 },
      { teamLabel: "D조", maxHeadcount: undefined },
      { teamLabel: "Pool", maxHeadcount: undefined }
    ]);
    // Pool 조는 명시 배정이 없으면 Cycle을 갖지 않는다(근무표 자동생성 대상에서 제외).
    expect(saved.teamCycleAssignments.some((item) => item.teamLabel === "Pool")).toBe(false);
    expect(saved.poolEnabled).toBe(true);
    expect(saved.poolStartTime).toBe("09:00");
    expect(saved.poolEndTime).toBe("18:00");
    expect(saved.poolBreakMinutes).toBe(60);
    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.cycles.map((cycle) => cycle.patternString)).toEqual(["야휴", "1휴"]);
  });

  it("should round-trip 평·휴 split holiday times and the public-holiday toggle", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    expect(targetSite).toBeDefined();

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "평휴 분리 주야조",
      teamCount: 2,
      patternCode: "DN",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "N", startTime: "21:00", endTime: "09:00", breakMinutes: 90 }
      ],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "주야 사이클",
          order: 0,
          shiftCount: 2,
          patternCode: "DN",
          patternString: "주야",
          patternStartDate: "2026-05-01",
          holidayTimeMode: "split",
          weekdayPublicHolidayAsHoliday: false,
          steps: [
            {
              stepIndex: 0,
              dutyCode: "D",
              startTime: "09:00",
              endTime: "18:00",
              breakMinutes: 60,
              holidayStartTime: "09:00",
              holidayEndTime: "21:00",
              holidayBreakMinutes: 90
            },
            {
              stepIndex: 1,
              dutyCode: "N",
              startTime: "21:00",
              endTime: "09:00",
              breakMinutes: 90,
              holidayStartTime: "21:00",
              holidayEndTime: "09:00",
              holidayBreakMinutes: 120
            }
          ],
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        }
      ]
    });

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    const cycle = reloaded?.cycles[0];

    expect(cycle?.holidayTimeMode).toBe("split");
    expect(cycle?.weekdayPublicHolidayAsHoliday).toBe(false);

    const dayStep = cycle?.steps.find((step) => step.dutyCode === "D");
    const nightStep = cycle?.steps.find((step) => step.dutyCode === "N");

    expect(dayStep?.startTime).toBe("09:00");
    expect(dayStep?.endTime).toBe("18:00");
    expect(dayStep?.breakMinutes).toBe(60);
    expect(dayStep?.holidayStartTime).toBe("09:00");
    expect(dayStep?.holidayEndTime).toBe("21:00");
    expect(dayStep?.holidayBreakMinutes).toBe(90);

    expect(nightStep?.holidayStartTime).toBe("21:00");
    expect(nightStep?.holidayEndTime).toBe("09:00");
    expect(nightStep?.holidayBreakMinutes).toBe(120);
  });

  it("should leave 평·휴 fields empty for a plain (unified) cycle so old patterns stay identical", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "단일 시간 주간조",
      teamCount: 1,
      patternCode: "D",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      steps: [{ stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "주간 사이클",
          order: 0,
          shiftCount: 1,
          patternCode: "D",
          patternString: "주",
          patternStartDate: "2026-05-01",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }
          ],
          teamIndexes: [{ teamLabel: "A조", index: 0 }]
        }
      ]
    });

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    const cycle = reloaded?.cycles[0];
    const step = cycle?.steps[0];

    expect(cycle?.holidayTimeMode).toBeUndefined();
    expect(cycle?.weekdayPublicHolidayAsHoliday).toBeUndefined();
    expect(step?.holidayStartTime).toBeUndefined();
    expect(step?.holidayEndTime).toBeUndefined();
    expect(step?.holidayBreakMinutes).toBeUndefined();
  });

  it("should default team work types by label and synthesize a pool team for legacy pool patterns", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "기본 근무유형 확인조",
      teamCount: 2,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      poolEnabled: true,
      poolStartTime: "09:00",
      poolEndTime: "18:00",
      poolBreakMinutes: 60,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ]
    });

    // 자동으로 만들어 주는 Pool 조는 목록 맨 앞에 온다(Pool → A조 → B조 …).
    expect(saved.teamSettings).toEqual([
      { teamLabel: "Pool", displayName: undefined, workType: "POOL", isActive: true, sortOrder: 0 },
      { teamLabel: "A조", displayName: undefined, workType: "ROTATING", isActive: true, sortOrder: 1 },
      { teamLabel: "B조", displayName: undefined, workType: "ROTATING", isActive: true, sortOrder: 2 }
    ]);
  });

  it("should keep the old version and add a new one when the effective date changes", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");
    const baseInput = {
      siteId: targetSite!.id,
      name: "적용기간 확인조",
      teamCount: 2,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-01-01",
      status: "active" as const,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ]
    };

    const first = saveStoredShiftPattern({ ...baseInput, effectiveFrom: "2026-01-01" });

    // 같은 날짜로 다시 저장하면 그 설정을 고친다.
    const edited = saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-01-01",
      teamCount: 3
    });

    expect(edited.id).toBe(first.id);
    expect(edited.teamCount).toBe(3);

    // 날짜를 바꿔 저장하면 예전 설정은 남고 새 버전이 하나 더 생긴다.
    const second = saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-08-01",
      teamCount: 4
    });

    expect(second.id).not.toBe(first.id);
    expect(second.effectiveFrom).toBe("2026-08-01");

    const stored = listStoredShiftPatterns(targetSite!.id);
    const keptFirst = stored.find((pattern) => pattern.id === first.id);

    expect(keptFirst?.teamCount).toBe(3);
    expect(keptFirst?.effectiveFrom).toBe("2026-01-01");

    // 같은 적용 시작일을 또 만들 수는 없다.
    expect(() =>
      saveStoredShiftPattern({ ...baseInput, id: first.id, effectiveFrom: "2026-08-01" })
    ).toThrow(/이미 있습니다/);
  });

  it("should round-trip explicit team settings including extra pool teams", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "근무유형 지정조",
      teamCount: 3,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 },
        { teamLabel: "C조", index: 2 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ],
      teamSettings: [
        { teamLabel: "A조", workType: "FIXED_DAY", displayName: "주간고정 A" },
        { teamLabel: "B조", workType: "FIXED_DAY" },
        { teamLabel: "C조", workType: "ROTATING", isActive: false },
        { teamLabel: "지원조", workType: "POOL", sortOrder: 9 }
      ]
    });

    expect(saved.teamSettings).toEqual([
      { teamLabel: "A조", displayName: "주간고정 A", workType: "FIXED_DAY", isActive: true, sortOrder: 0 },
      { teamLabel: "B조", displayName: undefined, workType: "FIXED_DAY", isActive: true, sortOrder: 1 },
      { teamLabel: "C조", displayName: undefined, workType: "ROTATING", isActive: false, sortOrder: 2 },
      { teamLabel: "지원조", displayName: undefined, workType: "POOL", isActive: true, sortOrder: 3 }
    ]);

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);

    expect(reloaded?.teamSettings).toEqual(saved.teamSettings);
  });

  it("should deactivate an active shift pattern without deleting it", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });

    const activePattern = listStoredShiftPatterns().find((pattern) => pattern.status === "active");

    expect(activePattern).toBeDefined();

    const deactivated = deactivateStoredShiftPattern(activePattern!.id);
    const stored = listStoredShiftPatterns().find((pattern) => pattern.id === activePattern!.id);

    expect(deactivated.status).toBe("inactive");
    expect(stored?.status).toBe("inactive");
    expect(listStoredShiftPatterns().some((pattern) => pattern.id === activePattern!.id)).toBe(true);
  });

  it("should save and reload custom dutyTypes catalog with dirty break preservation", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "인천 커스텀 근무유형 패턴",
      teamCount: 3,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 },
        { teamLabel: "C조", index: 2 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "08:30", endTime: "17:30", breakMinutes: 45 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ],
      dutyTypes: [
        {
          id: "custom-day",
          kind: "work",
          label: "주간(단축)",
          sortOrder: 0,
          startTime: "08:30",
          endTime: "17:30",
          breakMinutes: 45,
          isBreakDirty: true
        },
        {
          id: "custom-off",
          kind: "off",
          label: "휴무",
          sortOrder: 1
        },
        {
          id: "custom-special-off",
          kind: "off",
          label: "특별휴가",
          sortOrder: 2
        }
      ]
    });

    expect(saved.dutyTypes).toHaveLength(3);
    expect(saved.dutyTypes?.[0]?.label).toBe("주간(단축)");
    expect(saved.dutyTypes?.[0]?.isBreakDirty).toBe(true);
    expect(saved.dutyTypes?.[2]?.label).toBe("특별휴가");

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    expect(reloaded?.dutyTypes).toHaveLength(3);
    expect(reloaded?.dutyTypes?.[0]?.id).toBe("custom-day");
    expect(reloaded?.dutyTypes?.[0]?.breakMinutes).toBe(45);
    expect(reloaded?.dutyTypes?.[0]?.isBreakDirty).toBe(true);
    expect(reloaded?.dutyTypes?.[2]?.kind).toBe("off");
  });

  it("should derive default dutyTypes for legacy patterns that have no dutyTypes rows", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });

    const boramae = listStoredShiftPatterns().find((pattern) => pattern.name === "보라매 4조 2교대");
    expect(boramae).toBeDefined();
    // Default seeded pattern without explicit duty_types should derive default catalog
    expect(boramae?.dutyTypes).toBeDefined();
    expect(boramae?.dutyTypes?.length).toBeGreaterThanOrEqual(3);
    const workTypes = boramae?.dutyTypes?.filter((d) => d.kind === "work");
    expect(workTypes).toHaveLength(2); // D, N
    expect(workTypes?.[0]?.label).toBe("주간");
    expect(workTypes?.[1]?.label).toBe("야간");
  });

  it("should successfully save and reload two different patterns with identical default duty type IDs without unique constraint collision", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const defaultCatalog = [
      { id: "duty-day", kind: "work" as const, label: "주간", sortOrder: 0, startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
      { id: "duty-night", kind: "work" as const, label: "야간", sortOrder: 1, startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
      { id: "duty-off", kind: "off" as const, label: "휴무", sortOrder: 2 },
      { id: "duty-off-rest", kind: "off" as const, label: "비번", sortOrder: 3 }
    ];

    // Pattern 1 with default catalog
    const pattern1 = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "카탈로그 충돌 검증 패턴 1",
      teamCount: 2,
      patternCode: "DN",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-06-01",
      status: "active",
      teamIndexes: [{ teamLabel: "A조", index: 0 }, { teamLabel: "B조", index: 1 }],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
        { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 }
      ],
      dutyTypes: defaultCatalog
    });

    // Pattern 2 with identical default catalog IDs ("duty-day", "duty-night", ...)
    const pattern2 = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "카탈로그 충돌 검증 패턴 2",
      teamCount: 2,
      patternCode: "DN",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-07-01",
      status: "active",
      teamIndexes: [{ teamLabel: "A조", index: 0 }, { teamLabel: "B조", index: 1 }],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
        { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 }
      ],
      dutyTypes: defaultCatalog
    });

    expect(pattern1.id).not.toBe(pattern2.id);

    const reloaded1 = listStoredShiftPatterns(targetSite!.id).find((p) => p.id === pattern1.id);
    const reloaded2 = listStoredShiftPatterns(targetSite!.id).find((p) => p.id === pattern2.id);

    expect(reloaded1?.dutyTypes).toHaveLength(4);
    expect(reloaded1?.dutyTypes?.map((d) => d.id)).toEqual(["duty-day", "duty-night", "duty-off", "duty-off-rest"]);
    expect(reloaded2?.dutyTypes).toHaveLength(4);
    expect(reloaded2?.dutyTypes?.map((d) => d.id)).toEqual(["duty-day", "duty-night", "duty-off", "duty-off-rest"]);
  });

  it("should reject saving dutyTypes with more than 3 working duty types or duplicate IDs, and preserve existing data on error", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    // Initially save a valid pattern
    const validSaved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "검증 실패 원자성 보존 테스트",
      teamCount: 2,
      patternCode: "D",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-08-01",
      status: "active",
      teamIndexes: [{ teamLabel: "A조", index: 0 }, { teamLabel: "B조", index: 1 }],
      steps: [{ stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }],
      dutyTypes: [
        { id: "duty-day", kind: "work", label: "주간", sortOrder: 0, startTime: "09:00", endTime: "18:00", breakMinutes: 60 }
      ]
    });

    // Attempt 1: 4 working types (exceeds max 3) -> should throw and not corrupt pattern
    expect(() => {
      saveStoredShiftPattern({
        id: validSaved.id,
        siteId: targetSite!.id,
        name: "검증 실패 원자성 보존 테스트 (수정시도 1)",
        teamCount: 2,
        patternCode: "D",
        startIndexRule: "manual-seed",
        patternStartDate: "2026-08-01",
        status: "active",
        teamIndexes: [{ teamLabel: "A조", index: 0 }, { teamLabel: "B조", index: 1 }],
        steps: [{ stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }],
        dutyTypes: [
          { id: "d1", kind: "work", label: "근무1", sortOrder: 0 },
          { id: "d2", kind: "work", label: "근무2", sortOrder: 1 },
          { id: "d3", kind: "work", label: "근무3", sortOrder: 2 },
          { id: "d4", kind: "work", label: "근무4", sortOrder: 3 }
        ]
      });
    }).toThrow(/근무유형 카탈로그 검증 실패/);

    // Attempt 2: Duplicate duty_type_id -> should throw
    expect(() => {
      saveStoredShiftPattern({
        id: validSaved.id,
        siteId: targetSite!.id,
        name: "검증 실패 원자성 보존 테스트 (수정시도 2)",
        teamCount: 2,
        patternCode: "D",
        startIndexRule: "manual-seed",
        patternStartDate: "2026-08-01",
        status: "active",
        teamIndexes: [{ teamLabel: "A조", index: 0 }, { teamLabel: "B조", index: 1 }],
        steps: [{ stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }],
        dutyTypes: [
          { id: "same-id", kind: "work", label: "근무1", sortOrder: 0 },
          { id: "same-id", kind: "off", label: "휴무1", sortOrder: 1 }
        ]
      });
    }).toThrow(/중복된 근무유형 ID/);

    // Verify that original saved pattern remains intact after failed transactions
    const reloaded = listStoredShiftPatterns(targetSite!.id).find((p) => p.id === validSaved.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.name).toBe("검증 실패 원자성 보존 테스트");
    expect(reloaded?.dutyTypes).toHaveLength(1);
    expect(reloaded?.dutyTypes?.[0]?.id).toBe("duty-day");
    expect(reloaded?.dutyTypes?.[0]?.label).toBe("주간");
  });

  it("should preserve 5 legacy shift steps intact during a full save and reload roundtrip without truncation", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const fiveShiftSteps = [
      { stepIndex: 0, dutyCode: "1", startTime: "08:00", endTime: "12:00", breakMinutes: 30 },
      { stepIndex: 1, dutyCode: "2", startTime: "12:00", endTime: "16:00", breakMinutes: 30 },
      { stepIndex: 2, dutyCode: "3", startTime: "16:00", endTime: "20:00", breakMinutes: 30 },
      { stepIndex: 3, dutyCode: "4", startTime: "20:00", endTime: "00:00", breakMinutes: 30 },
      { stepIndex: 4, dutyCode: "5", startTime: "00:00", endTime: "08:00", breakMinutes: 60 }
    ];

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "5교대 레거시 보존 왕복 테스트",
      teamCount: 5,
      patternCode: "12345",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-09-01",
      status: "active",
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "5교대 사이클",
          order: 0,
          shiftCount: 5,
          patternCode: "12345",
          patternString: "12345",
          patternStartDate: "2026-09-01",
          steps: fiveShiftSteps,
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 },
            { teamLabel: "C조", index: 2 },
            { teamLabel: "D조", index: 3 },
            { teamLabel: "E조", index: 4 }
          ]
        }
      ],
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 },
        { teamLabel: "C조", index: 2 },
        { teamLabel: "D조", index: 3 },
        { teamLabel: "E조", index: 4 }
      ],
      steps: fiveShiftSteps
    });

    expect(saved.cycles[0]?.shiftCount).toBe(5);
    expect(saved.cycles[0]?.steps).toHaveLength(5);

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((p) => p.id === saved.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.cycles[0]?.shiftCount).toBe(5);
    expect(reloaded?.cycles[0]?.steps).toHaveLength(5);
    expect(reloaded?.cycles[0]?.steps.map((s) => s.startTime)).toEqual([
      "08:00",
      "12:00",
      "16:00",
      "20:00",
      "00:00"
    ]);
  });
});

describe("team capacity unlimited roundtrip", () => {
  it("keeps a blank capacity (unlimited) unlimited across save and reload", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const steps = [
      { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 }
    ];

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "정원 무제한 왕복 테스트",
      teamCount: 2,
      patternCode: "DN",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-09-01",
      status: "active",
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "기본",
          order: 0,
          shiftCount: 2,
          patternCode: "DN",
          patternString: "주야",
          patternStartDate: "2026-09-01",
          steps,
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        }
      ],
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps,
      // A조 has no maxHeadcount (blank stepper = unlimited), B조 is capped at 5.
      teamCapacities: [{ teamLabel: "A조" }, { teamLabel: "B조", maxHeadcount: 5 }]
    });

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((p) => p.id === saved.id);
    expect(reloaded).toBeDefined();

    const capacityByTeam = new Map(
      (reloaded?.teamCapacities ?? []).map((item) => [item.teamLabel, item.maxHeadcount])
    );

    // B조 keeps its cap; A조 stays unlimited (no stored cap row).
    expect(capacityByTeam.get("B조")).toBe(5);
    expect(capacityByTeam.get("A조")).toBeUndefined();
  });

  it("preserves painted pattern fields across save and reload equivalence chain (parity test counterpart)", () => {
    // Equivalence chain counterpart for renderer's `site-pattern-painting-parity.test.ts`.
    // Proves that saving painted cycle patternStrings ("주주야야휴휴", "주주석석야야휴휴")
    // and reloading them yields identical patternStrings, patternStartDate, teamIndexes, and teamCycleAssignments.
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");
    expect(targetSite).toBeDefined();

    const cycle1Steps = [
      { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
      { stepIndex: 2, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 },
      { stepIndex: 3, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 },
      { stepIndex: 4, dutyCode: "O", breakMinutes: 0 },
      { stepIndex: 5, dutyCode: "O", breakMinutes: 0 }
    ];

    const cycle2Steps = [
      { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "15:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "D", startTime: "07:00", endTime: "15:00", breakMinutes: 60 },
      { stepIndex: 2, dutyCode: "E", startTime: "15:00", endTime: "23:00", breakMinutes: 60 },
      { stepIndex: 3, dutyCode: "E", startTime: "15:00", endTime: "23:00", breakMinutes: 60 },
      { stepIndex: 4, dutyCode: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 60 },
      { stepIndex: 5, dutyCode: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 60 },
      { stepIndex: 6, dutyCode: "O", breakMinutes: 0 },
      { stepIndex: 7, dutyCode: "O", breakMinutes: 0 }
    ];

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "통합 패턴",
      teamCount: 4,
      patternCode: "CUSTOM",
      startIndexRule: "CUSTOM",
      patternStartDate: "2026-09-01",
      status: "active",
      teamCycleAssignments: [
        { teamLabel: "A조", cycleKey: "cycle-1" },
        { teamLabel: "B조", cycleKey: "cycle-1" },
        { teamLabel: "C조", cycleKey: "cycle-2" },
        { teamLabel: "D조", cycleKey: "cycle-2" }
      ],
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 2 },
        { teamLabel: "C조", index: 0 },
        { teamLabel: "D조", index: 4 }
      ],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "1조2조 묶음",
          order: 0,
          shiftCount: 2,
          patternCode: "CUSTOM",
          patternString: "주주야야휴휴",
          patternStartDate: "2026-09-01",
          steps: cycle1Steps,
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 2 }
          ]
        },
        {
          cycleKey: "cycle-2",
          name: "3조4조 묶음",
          order: 1,
          shiftCount: 3,
          patternCode: "CUSTOM",
          patternString: "주주석석야야휴휴",
          patternStartDate: "2026-09-05",
          steps: cycle2Steps,
          teamIndexes: [
            { teamLabel: "C조", index: 0 },
            { teamLabel: "D조", index: 4 }
          ]
        }
      ],
      steps: cycle1Steps
    });

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((p) => p.id === saved.id);
    expect(reloaded).toBeDefined();

    // Verify pattern-level parity fields
    expect(reloaded?.teamCycleAssignments).toEqual([
      { teamLabel: "A조", cycleKey: "cycle-1" },
      { teamLabel: "B조", cycleKey: "cycle-1" },
      { teamLabel: "C조", cycleKey: "cycle-2" },
      { teamLabel: "D조", cycleKey: "cycle-2" }
    ]);
    expect(reloaded?.teamIndexes).toEqual([
      { teamLabel: "A조", index: 0 },
      { teamLabel: "B조", index: 2 },
      { teamLabel: "C조", index: 2 },
      { teamLabel: "D조", index: 3 }
    ]);

    // Verify cycle-level parity fields
    expect(reloaded?.cycles).toHaveLength(2);
    const reloadedCycle1 = reloaded?.cycles.find((c) => c.cycleKey === "cycle-1");
    const reloadedCycle2 = reloaded?.cycles.find((c) => c.cycleKey === "cycle-2");

    expect(reloadedCycle1?.patternString).toBe("주주야야휴휴");
    expect(reloadedCycle1?.patternStartDate).toBe("2026-09-01");
    expect(reloadedCycle1?.teamIndexes).toEqual([
      { teamLabel: "A조", index: 0 },
      { teamLabel: "B조", index: 2 },
      { teamLabel: "C조", index: 2 },
      { teamLabel: "D조", index: 3 }
    ]);
    expect(reloadedCycle1?.teamIndexes.find((item) => item.teamLabel === "A조")?.index).toBe(0);
    expect(reloadedCycle1?.teamIndexes.find((item) => item.teamLabel === "B조")?.index).toBe(2);

    expect(reloadedCycle2?.patternString).toBe("주주석석야야휴휴");
    expect(reloadedCycle2?.patternStartDate).toBe("2026-09-05");
    expect(reloadedCycle2?.teamIndexes).toEqual([
      { teamLabel: "A조", index: 0 },
      { teamLabel: "B조", index: 1 },
      { teamLabel: "C조", index: 0 },
      { teamLabel: "D조", index: 4 }
    ]);
    expect(reloadedCycle2?.teamIndexes.find((item) => item.teamLabel === "C조")?.index).toBe(0);
    expect(reloadedCycle2?.teamIndexes.find((item) => item.teamLabel === "D조")?.index).toBe(4);
  });
});
