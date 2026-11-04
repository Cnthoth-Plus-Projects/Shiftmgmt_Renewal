import { describe, expect, it } from "vitest";

import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternTeamCapacity,
  ShiftPatternTeamCycleAssignment,
  ShiftPatternTeamIndex,
  ShiftPatternTeamSetting
} from "./model";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues,
  resolveStepTimesForDate,
  shouldUseHolidayTimes
} from "./monthly-schedule-draft";

const createPattern = (
  steps: ShiftPatternRecord["steps"],
  options?: {
    teamCount?: number;
    teamIndexes?: ShiftPatternTeamIndex[];
    cycles?: ShiftPatternCycle[];
    teamCycleAssignments?: ShiftPatternTeamCycleAssignment[];
    teamCapacities?: ShiftPatternTeamCapacity[];
    teamSettings?: ShiftPatternTeamSetting[];
    poolEnabled?: boolean;
  }
): ShiftPatternRecord => ({
  id: "pattern-1",
  siteId: "site-1",
  name: "테스트 패턴",
  teamCount: options?.teamCount ?? 3,
  cycleLength: steps.length,
  patternCode: steps.map((step) => step.dutyCode).join(""),
  startIndexRule: "team-sequence",
  patternStartDate: "2026-04-01",
  status: "active",
  createdAt: "2026-03-12T00:00:00.000Z",
  steps,
  teamIndexes:
    options?.teamIndexes ??
    Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      index
    })),
  cycles:
    options?.cycles ??
    [
      {
        id: "cycle-1",
        cycleKey: "cycle-1",
        name: "Cycle 1",
        order: 0,
        shiftCount: Math.max(
          new Set(
            steps.map((step) => step.dutyCode).filter((dutyCode) => dutyCode !== "X" && dutyCode !== "O")
          ).size,
          1
        ),
        cycleLength: steps.length,
        patternCode: steps.map((step) => step.dutyCode).join(""),
        patternStartDate: "2026-04-01",
        steps,
        teamIndexes:
          options?.teamIndexes ??
          Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
            teamLabel: `${String.fromCharCode(65 + index)}조`,
            index
          }))
      }
    ],
  teamCycleAssignments:
    options?.teamCycleAssignments ??
    Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      cycleKey: "cycle-1"
    })),
  teamCapacities:
    options?.teamCapacities ??
    Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`
    })),
  teamSettings: options?.teamSettings ?? [],
  poolEnabled: options?.poolEnabled ?? false,
  poolBreakMinutes: 0
});

const createEmployee = (input: {
  id: string;
  employeeCode: string;
  employmentType?: string;
  name: string;
  hireDate?: string;
  currentAssignmentOrder?: number;
  currentShiftGroup?: string;
  status?: EmployeeRecord["status"];
  retireDate?: string;
  currentAssignmentStartDate?: string;
  currentAssignmentEndDate?: string;
}): EmployeeRecord => ({
  id: input.id,
  employeeCode: input.employeeCode,
  name: input.name,
  employmentType: input.employmentType ?? "정규",
  status: input.status ?? "active",
  hireDate: input.hireDate,
  retireDate: input.retireDate,
  currentSiteId: "site-1",
  currentSiteName: "테스트 센터",
  currentAssignmentOrder: input.currentAssignmentOrder,
  currentShiftGroup: input.currentShiftGroup,
  currentAssignmentStartDate: input.currentAssignmentStartDate,
  currentAssignmentEndDate: input.currentAssignmentEndDate,
  createdAt: "2026-03-12T00:00:00.000Z"
});

describe("monthly-schedule-draft", () => {
  it("should generate a two-shift draft using team offsets", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "N",
        startTime: "18:00",
        endTime: "06:00",
        breakMinutes: 90
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "N",
        startTime: "18:00",
        endTime: "06:00",
        breakMinutes: 90
      },
      {
        id: "step-5",
        stepIndex: 4,
        dutyCode: "X",
        breakMinutes: 0
      },
      {
        id: "step-6",
        stepIndex: 5,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(items).toHaveLength(60);
    expect(
      items
        .filter((item) => item.employeeCode === "EMP-001")
        .slice(0, 6)
        .map((item) => item.dutyCode)
    ).toEqual(["D", "D", "N", "N", "O", "O"]);
    expect(
      items
        .filter((item) => item.employeeCode === "EMP-002")
        .slice(0, 4)
        .map((item) => item.dutyCode)
    ).toEqual(["D", "N", "N", "O"]);
  });

  it("should remap custom three-shift duty codes to export-compatible codes", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: 30
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "B",
        startTime: "14:00",
        endTime: "22:00",
        breakMinutes: 30
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "C",
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 60
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      }),
      createEmployee({
        id: "employee-3",
        employeeCode: "EMP-003",
        name: "박정호",
        currentShiftGroup: "C조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.dutyCode)).toEqual(["D", "E", "N"]);
    expect(firstDayItems[1]?.startTime).toBe("14:00");
    expect(firstDayItems[2]?.endTime).toBe("06:00");
  });

  it("should preserve canonical three-shift slot meanings when cycle order is mixed", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: 30
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "C",
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 60
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "B",
        startTime: "14:00",
        endTime: "22:00",
        breakMinutes: 30
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    })
      .filter((item) => item.employeeCode === "EMP-001")
      .slice(0, 4);

    expect(items.map((item) => item.dutyCode)).toEqual(["D", "N", "E", "O"]);
    expect(items[1]).toMatchObject({
      dutyCode: "N",
      startTime: "22:00",
      endTime: "06:00",
      breakMinutes: 60
    });
    expect(items[2]).toMatchObject({
      dutyCode: "E",
      startTime: "14:00",
      endTime: "22:00",
      breakMinutes: 30
    });
  });

  it("should honor saved team indexes when calculating cycle offsets", () => {
    const pattern = createPattern(
      [
        {
          id: "step-1",
          stepIndex: 0,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          id: "step-2",
          stepIndex: 1,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          id: "step-3",
          stepIndex: 2,
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        },
        {
          id: "step-4",
          stepIndex: 3,
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        },
        {
          id: "step-5",
          stepIndex: 4,
          dutyCode: "X",
          breakMinutes: 0
        },
        {
          id: "step-6",
          stepIndex: 5,
          dutyCode: "X",
          breakMinutes: 0
        }
      ],
      {
        teamCount: 4,
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 2 },
          { teamLabel: "C조", index: 4 },
          { teamLabel: "D조", index: 1 }
        ]
      }
    );
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.dutyCode)).toEqual(["D", "N"]);
  });

  it("should roll retired employees out from the retirement date", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조",
        status: "retired",
        retireDate: "2026-04-15"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(items.some((item) => item.employeeCode === "EMP-001" && item.workDate === "2026-04-14")).toBe(true);
    expect(items.some((item) => item.employeeCode === "EMP-001" && item.workDate === "2026-04-15")).toBe(false);
    expect(items.some((item) => item.employeeCode === "EMP-001" && item.workDate === "2026-04-30")).toBe(false);
    expect(items.some((item) => item.employeeCode === "EMP-002" && item.workDate === "2026-04-30")).toBe(true);
  });

  it("should exclude days before the hire date when building a draft", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "08:00",
        endTime: "20:00",
        breakMinutes: 60
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "홍길동",
        currentShiftGroup: "A조",
        hireDate: "2026-03-01",
        currentAssignmentStartDate: "2026-03-15"
      })
    ];

    const februaryItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-02",
      pattern,
      employees
    });
    const marchItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-03",
      pattern,
      employees
    });

    expect(februaryItems).toHaveLength(0);
    expect(marchItems.some((item) => item.workDate === "2026-03-01")).toBe(true);
    expect(marchItems.some((item) => item.workDate === "2026-03-10")).toBe(true);
  });

  it("should use cycle-specific patterns based on team assignments", () => {
    const cycleOneSteps: ShiftPatternRecord["steps"] = [
      {
        id: "cycle-1-step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "cycle-1-step-2",
        stepIndex: 1,
        dutyCode: "X",
        breakMinutes: 0
      }
    ];
    const cycleTwoSteps: ShiftPatternRecord["steps"] = [
      {
        id: "cycle-2-step-1",
        stepIndex: 0,
        dutyCode: "N",
        startTime: "18:00",
        endTime: "06:00",
        breakMinutes: 90
      },
      {
        id: "cycle-2-step-2",
        stepIndex: 1,
        dutyCode: "X",
        breakMinutes: 0
      }
    ];
    const pattern = createPattern(cycleOneSteps, {
      teamCount: 4,
      cycles: [
        {
          id: "cycle-1",
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 1,
          cycleLength: cycleOneSteps.length,
          patternCode: "DX",
          patternStartDate: "2026-04-01",
          steps: cycleOneSteps,
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        },
        {
          id: "cycle-2",
          cycleKey: "cycle-2",
          name: "Cycle 2",
          order: 1,
          shiftCount: 1,
          cycleLength: cycleTwoSteps.length,
          patternCode: "NX",
          patternStartDate: "2026-04-01",
          steps: cycleTwoSteps,
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
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "C조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.dutyCode)).toEqual(["D", "N"]);
    expect(firstDayItems[0]?.startTime).toBe("06:00");
    expect(firstDayItems[1]?.startTime).toBe("18:00");
  });

  it("should exclude pool employees from generated schedules", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "박수빈",
        currentShiftGroup: "Pool"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(items.some((item) => item.employeeCode === "EMP-001")).toBe(true);
    expect(items.some((item) => item.employeeCode === "EMP-002")).toBe(false);
  });

  it("should preserve assignment order within the same team", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-002",
        name: "이수민",
        currentAssignmentOrder: 1,
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-001",
        name: "홍길동",
        currentAssignmentOrder: 0,
        currentShiftGroup: "A조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.employeeCode)).toEqual(["EMP-001", "EMP-002"]);
    expect(firstDayItems.map((item) => item.sortOrder)).toEqual([0, 1]);
  });

  it("should format BP employees for schedule display names while keeping their employee code", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "BP-0001",
        employmentType: "BP",
        name: "외부인력",
        currentShiftGroup: "A조"
      })
    ];

    const firstItem = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    })[0];

    expect(firstItem?.employeeCode).toBe("BP-0001");
    expect(firstItem?.employeeName).toBe("BP(외부인력)");
  });

  it("should report draft issues for missing shift groups and unsupported duty counts", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "12:00",
        breakMinutes: 30
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "B",
        startTime: "12:00",
        endTime: "18:00",
        breakMinutes: 30
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "C",
        startTime: "18:00",
        endTime: "00:00",
        breakMinutes: 30
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "D",
        startTime: "00:00",
        endTime: "06:00",
        breakMinutes: 30
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우"
      })
    ];

    const issues = getMonthlyScheduleDraftIssues({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "missing-shift-group",
      "unsupported-duty-count"
    ]);
  });

  it("should keep generation byte-identical when a cycle is unified even if holiday fields are present", () => {
    // 평·휴를 켜지 않은(unified) 사이클은 step에 휴일 칸이 들어 있어도 토·일에 평일 시간을 그대로 써야 한다(기존 동작 보존).
    const step = {
      id: "step-1",
      stepIndex: 0,
      dutyCode: "D",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const pattern = createPattern([step], {
      teamCount: 1,
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      teamCapacities: [{ teamLabel: "A조" }]
    });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" })
    ];

    const items = buildMonthlyScheduleDraft({ scheduleMonth: "2026-04", pattern, employees });
    const saturday = items.find((item) => item.workDate === "2026-04-04");

    // 2026-04-04 = 토요일이지만 unified 사이클이라 평일 시간 유지
    expect(saturday).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });

  it("should apply holiday times on weekends for a 평·휴 split cycle", () => {
    const step = {
      id: "step-1",
      stepIndex: 0,
      dutyCode: "D",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const pattern = createPattern([step], {
      teamCount: 1,
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      teamCapacities: [{ teamLabel: "A조" }],
      cycles: [
        {
          id: "cycle-1",
          cycleKey: "cycle-1",
          name: "주간 사이클",
          order: 0,
          shiftCount: 1,
          cycleLength: 1,
          patternCode: "D",
          patternStartDate: "2026-04-01",
          holidayTimeMode: "split",
          weekdayPublicHolidayAsHoliday: false,
          steps: [step],
          teamIndexes: [{ teamLabel: "A조", index: 0 }]
        }
      ]
    });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" })
    ];

    const items = buildMonthlyScheduleDraft({ scheduleMonth: "2026-04", pattern, employees });
    const wednesday = items.find((item) => item.workDate === "2026-04-01"); // 평일(수)
    const saturday = items.find((item) => item.workDate === "2026-04-04"); // 토
    const sunday = items.find((item) => item.workDate === "2026-04-05"); // 일

    expect(wednesday).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    expect(saturday).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
    expect(sunday).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
  });

  it("should honor the weekday-public-holiday toggle for a 평·휴 split cycle", () => {
    const step = {
      id: "step-1",
      stepIndex: 0,
      dutyCode: "D",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const buildPattern = (weekdayPublicHolidayAsHoliday: boolean) =>
      createPattern([step], {
        teamCount: 1,
        teamIndexes: [{ teamLabel: "A조", index: 0 }],
        teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
        teamCapacities: [{ teamLabel: "A조" }],
        cycles: [
          {
            id: "cycle-1",
            cycleKey: "cycle-1",
            name: "주간 사이클",
            order: 0,
            shiftCount: 1,
            cycleLength: 1,
            patternCode: "D",
            patternStartDate: "2026-04-01",
            holidayTimeMode: "split",
            weekdayPublicHolidayAsHoliday,
            steps: [step],
            teamIndexes: [{ teamLabel: "A조", index: 0 }]
          }
        ]
      });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" })
    ];
    // 2026-04-01(수)을 공휴일로 가정
    const publicHolidayDates = new Set<string>(["2026-04-01"]);

    const asHoliday = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: buildPattern(true),
      employees,
      publicHolidayDates
    }).find((item) => item.workDate === "2026-04-01");
    const asWeekday = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: buildPattern(false),
      employees,
      publicHolidayDates
    }).find((item) => item.workDate === "2026-04-01");

    // 토글 ON → 휴일 시간, 토글 OFF → 평일 시간
    expect(asHoliday).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
    expect(asWeekday).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });

  it("shouldUseHolidayTimes classifies day types correctly", () => {
    const unified = { holidayTimeMode: "unified" as const };
    const split = { holidayTimeMode: "split" as const, weekdayPublicHolidayAsHoliday: true };
    const splitNoPublic = { holidayTimeMode: "split" as const, weekdayPublicHolidayAsHoliday: false };
    const holidays = new Set<string>(["2026-04-01"]); // 수요일 공휴일

    // unified는 언제나 false
    expect(shouldUseHolidayTimes(unified, "2026-04-04", holidays)).toBe(false);
    // split: 토·일은 항상 true
    expect(shouldUseHolidayTimes(split, "2026-04-04", holidays)).toBe(true); // 토
    expect(shouldUseHolidayTimes(split, "2026-04-05", holidays)).toBe(true); // 일
    // split: 평일 비공휴일은 false
    expect(shouldUseHolidayTimes(split, "2026-04-02", holidays)).toBe(false); // 목, 비공휴일
    // split: 평일 공휴일은 토글에 따름
    expect(shouldUseHolidayTimes(split, "2026-04-01", holidays)).toBe(true);
    expect(shouldUseHolidayTimes(splitNoPublic, "2026-04-01", holidays)).toBe(false);
  });

  it("resolveStepTimesForDate falls back to weekday times when holiday cells are empty", () => {
    const full = {
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const partial = { startTime: "09:00", endTime: "18:00", breakMinutes: 60 };

    expect(resolveStepTimesForDate(full, false)).toEqual({
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    });
    expect(resolveStepTimesForDate(full, true)).toEqual({
      startTime: "09:00",
      endTime: "21:00",
      breakMinutes: 90
    });
    // 휴일 칸이 비면 평일 칸으로 폴백
    expect(resolveStepTimesForDate(partial, true)).toEqual({
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    });
  });

  it("should report missing cycle assignments for regular teams only", () => {
    const pattern = createPattern(
      [
        {
          id: "step-1",
          stepIndex: 0,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ],
      {
        teamCount: 2,
        teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }]
      }
    );
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "B조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "박수빈",
        currentShiftGroup: "Pool"
      })
    ];

    const issues = getMonthlyScheduleDraftIssues({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(issues.map((issue) => issue.code)).toContain("missing-cycle-assignment");
  });

  it("should keep pool teams out of the draft until a cycle is assigned, then generate them", () => {
    const steps: ShiftPatternRecord["steps"] = [
      { id: "step-1", stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
      { id: "step-2", stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
    ];
    const poolTeamSettings: ShiftPatternTeamSetting[] = [
      { teamLabel: "A조", workType: "ROTATING", isActive: true, sortOrder: 0 },
      { teamLabel: "Pool", workType: "POOL", isActive: true, sortOrder: 1 }
    ];
    const cycle: ShiftPatternCycle = {
      id: "cycle-1",
      cycleKey: "cycle-1",
      name: "Cycle 1",
      order: 0,
      shiftCount: 1,
      cycleLength: 2,
      patternCode: "DX",
      patternStartDate: "2026-04-01",
      steps,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "Pool", index: 1 }
      ]
    };
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" }),
      createEmployee({ id: "e2", employeeCode: "EMP-002", name: "박수빈", currentShiftGroup: "Pool" })
    ];
    const unassignedPoolPattern = createPattern(steps, {
      teamCount: 1,
      cycles: [cycle],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      teamSettings: poolTeamSettings
    });
    const assignedPoolPattern = createPattern(steps, {
      teamCount: 1,
      cycles: [cycle],
      teamCycleAssignments: [
        { teamLabel: "A조", cycleKey: "cycle-1" },
        { teamLabel: "Pool", cycleKey: "cycle-1" }
      ],
      teamSettings: poolTeamSettings
    });

    const withoutPool = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: unassignedPoolPattern,
      employees
    });
    const withPool = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: assignedPoolPattern,
      employees
    });

    // Cycle 배정 전에는 기존과 동일하게 Pool 인원이 근무표에 나오지 않는다.
    expect(withoutPool.some((item) => item.employeeCode === "EMP-002")).toBe(false);
    expect(
      getMonthlyScheduleDraftIssues({
        scheduleMonth: "2026-04",
        pattern: unassignedPoolPattern,
        employees
      })
    ).toHaveLength(0);

    // Cycle을 배정하면 다른 조와 똑같이 생성된다.
    const poolItems = withPool.filter((item) => item.employeeCode === "EMP-002");

    expect(poolItems.length).toBeGreaterThan(0);
    expect(poolItems.find((item) => item.workDate === "2026-04-01")?.dutyCode).toBe("O");
    expect(poolItems.find((item) => item.workDate === "2026-04-02")?.dutyCode).toBe("D");
  });

  it("should drop employees of a deactivated team from the draft", () => {
    const steps: ShiftPatternRecord["steps"] = [
      { id: "step-1", stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }
    ];
    const pattern = createPattern(steps, {
      teamCount: 2,
      teamSettings: [
        { teamLabel: "A조", workType: "ROTATING", isActive: true, sortOrder: 0 },
        { teamLabel: "B조", workType: "ROTATING", isActive: false, sortOrder: 1 }
      ]
    });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" }),
      createEmployee({ id: "e2", employeeCode: "EMP-002", name: "박수빈", currentShiftGroup: "B조" })
    ];

    const items = buildMonthlyScheduleDraft({ scheduleMonth: "2026-04", pattern, employees });

    expect(items.some((item) => item.employeeCode === "EMP-001")).toBe(true);
    expect(items.some((item) => item.employeeCode === "EMP-002")).toBe(false);
  });

  it("guarantees 100% backward compatibility: schedule output for legacy patterns is identical before and after dutyTypes introduction", () => {
    // Standard 4-team 2-shift pattern (DDNNXX)
    const steps: ShiftPatternRecord["steps"] = [
      { id: "s1", stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
      { id: "s2", stepIndex: 1, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
      { id: "s3", stepIndex: 2, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
      { id: "s4", stepIndex: 3, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
      { id: "s5", stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
      { id: "s6", stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
    ];

    const legacyPatternWithoutDutyTypes = createPattern(steps, { teamCount: 4 });
    delete (legacyPatternWithoutDutyTypes as Partial<ShiftPatternRecord>).dutyTypes;

    const patternWithExplicitDutyTypes: ShiftPatternRecord = {
      ...legacyPatternWithoutDutyTypes,
      dutyTypes: [
        { id: "duty-day", kind: "work", label: "주간", sortOrder: 0, startTime: "07:00", endTime: "19:00", breakMinutes: 90 },
        { id: "duty-night", kind: "work", label: "야간", sortOrder: 1, startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { id: "duty-off", kind: "off", label: "휴무", sortOrder: 2 },
        { id: "duty-off-rest", kind: "off", label: "비번", sortOrder: 3 }
      ]
    };

    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김철수", currentShiftGroup: "A조" }),
      createEmployee({ id: "e2", employeeCode: "EMP-002", name: "이영희", currentShiftGroup: "B조" }),
      createEmployee({ id: "e3", employeeCode: "EMP-003", name: "박민수", currentShiftGroup: "C조" }),
      createEmployee({ id: "e4", employeeCode: "EMP-004", name: "정지원", currentShiftGroup: "D조" })
    ];

    const legacyResult = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-05",
      pattern: legacyPatternWithoutDutyTypes,
      employees
    });

    const newResult = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-05",
      pattern: patternWithExplicitDutyTypes,
      employees
    });

    expect(legacyResult.length).toBeGreaterThan(0);
    expect(legacyResult.length).toBe(31 * 4); // 31 days * 4 employees
    expect(newResult).toEqual(legacyResult);

    // Verify key fields
    const day1A = legacyResult.find((item) => item.workDate === "2026-05-01" && item.employeeCode === "EMP-001");
    expect(day1A?.dutyCode).toBe("D");
    expect(day1A?.startTime).toBe("07:00");
    expect(day1A?.endTime).toBe("19:00");
    expect(day1A?.breakMinutes).toBe(90);
  });
});

describe("holiday generation integration",()=>{
  const employees=[createEmployee({id:"holiday-emp",employeeCode:"H01",name:"휴일 시험",currentShiftGroup:"A조"})];
  const steps=["D","E","N"].map((dutyCode,i)=>({id:dutyCode,dutyCode,stepIndex:i,startTime:["07:00","15:00","23:00"][i],endTime:["15:00","23:00","07:00"][i],breakMinutes:30}));
  it("generates weekday3 and holiday2 shifts with longer times; Monday base phase never pauses",()=>{
    const pattern=createPattern(steps);pattern.holidayPolicy={version:1,rules:{saturday:{mode:"separate",excludedDutyCodes:[],startDate:"2026-04-01",teamPatterns:{"A조":["D","N"]},times:{N:{startTime:"19:00",endTime:"08:00",breakMinutes:60}}},sunday:{mode:"off",excludedDutyCodes:[]}}};
    const items=buildMonthlyScheduleDraft({pattern,employees,scheduleMonth:"2026-04"});
    expect(items.find(i=>i.workDate==="2026-04-04")).toMatchObject({dutyCode:"N",startTime:"19:00",endTime:"08:00",breakMinutes:60});
    expect(items.find(i=>i.workDate==="2026-04-05")).toMatchObject({dutyCode:"O",startTime:undefined,breakMinutes:0});
    expect(items.find(i=>i.workDate==="2026-04-06")).toMatchObject({dutyCode:"N",startTime:"23:00"});
  });
  it("keeps empty-policy generation equal to legacy split including public holidays",()=>{
    const pattern=createPattern(steps);pattern.cycles[0].holidayTimeMode="split";pattern.cycles[0].steps.forEach(s=>s.holidayEndTime="09:00");
    const input={pattern,employees,scheduleMonth:"2026-04",publicHolidayDates:new Set(["2026-04-01"])};
    const legacy=buildMonthlyScheduleDraft(input);pattern.holidayPolicy={version:1,rules:{}};expect(buildMonthlyScheduleDraft(input)).toEqual(legacy);
  });
  it("resolves holiday-only third duty timings from the catalog and custom legacy labels once",()=>{
    const pattern=createPattern([steps[0],steps[2]]);pattern.dutyTypes=steps.map((s,i)=>({id:["duty-day","duty-evening","duty-night"][i],kind:"work",label:`${i+1}근`,sortOrder:i,startTime:s.startTime,endTime:s.endTime,breakMinutes:30}));
    pattern.holidayPolicy={version:1,rules:{public:{mode:"separate",excludedDutyCodes:[],startDate:"2026-04-01",teamPatterns:{"A조":["E"]}}}};
    expect(buildMonthlyScheduleDraft({pattern,employees,scheduleMonth:"2026-04",publicHolidayDates:new Set(["2026-04-01"])}).find(i=>i.workDate==="2026-04-01")).toMatchObject({dutyCode:"E",startTime:"15:00"});
    const canonicalTwo=createPattern(steps.slice(0,2)),legacyTwo=buildMonthlyScheduleDraft({pattern:canonicalTwo,employees,scheduleMonth:"2026-04"});canonicalTwo.holidayPolicy={version:1,rules:{}};expect(buildMonthlyScheduleDraft({pattern:canonicalTwo,employees,scheduleMonth:"2026-04"})).toEqual(legacyTwo);
    const old=createPattern(steps.slice(0,2).map((s,i)=>({...s,dutyCode:["custom-first","custom-second"][i]})));old.holidayPolicy={version:1,rules:{}};expect(buildMonthlyScheduleDraft({pattern:old,employees,scheduleMonth:"2026-04"})[0].dutyCode).toBe("D");
  });
  it("applies selected overlap priority to the actual monthly timing and retains the following base day",()=>{
    const pattern=createPattern([steps[0]]);pattern.holidayPolicy={version:1,rules:{public:{mode:"off",excludedDutyCodes:[]},saturday:{mode:"normal",excludedDutyCodes:[],times:{D:{startTime:"09:00",endTime:"19:00",breakMinutes:60}}}}};
    const input={pattern,employees,scheduleMonth:"2026-04",publicHolidayDates:new Set(["2026-04-04"])};
    expect(buildMonthlyScheduleDraft(input).find(i=>i.workDate==="2026-04-04")).toMatchObject({dutyCode:"O",breakMinutes:0});
    pattern.holidayPolicy.overlapPriority="weekend";
    const items=buildMonthlyScheduleDraft(input);expect(items.find(i=>i.workDate==="2026-04-04")).toMatchObject({dutyCode:"D",startTime:"09:00",endTime:"19:00",breakMinutes:60});
    expect(items.find(i=>i.workDate==="2026-04-05")).toMatchObject({dutyCode:"D",startTime:"07:00",endTime:"15:00"});
  });
  it("materializes site/team/person exceptions after holiday rules and keeps base phase and other people",()=>{
    const pattern=createPattern(steps),person=employees[0];pattern.holidayPolicy={version:1,rules:{public:{mode:"off",excludedDutyCodes:[]}},dateExceptions:[{id:"site",from:"2026-04-04",to:"2026-04-04",scope:"site",reason:"점검",dutyCode:"O"},{id:"team",from:"2026-04-04",to:"2026-04-04",scope:"team",teamLabel:"A조",reason:"행사 지원",dutyCode:"N",timing:{startTime:"20:00",endTime:"07:00",breakMinutes:60}},{id:"person",from:"2026-04-04",to:"2026-04-04",scope:"employee",employeeId:person.id,reason:"개인 휴무",dutyCode:"O"}]};
    const second={...person,id:"second",employeeCode:"H02",name:"대체 인원"},input={pattern,employees:[person,second],scheduleMonth:"2026-04",publicHolidayDates:new Set(["2026-04-04"])};
    const rows=buildMonthlyScheduleDraft(input);expect(rows.find(i=>i.workDate==="2026-04-04"&&i.employeeCode===person.employeeCode)).toMatchObject({dutyCode:"O",startTime:undefined,breakMinutes:0});expect(rows.find(i=>i.workDate==="2026-04-04"&&i.employeeCode==="H02")).toMatchObject({dutyCode:"N",startTime:"20:00",endTime:"07:00"});
    const baseline=buildMonthlyScheduleDraft({...input,pattern:{...pattern,holidayPolicy:undefined}});expect(rows.filter(i=>i.workDate==="2026-04-05")).toEqual(baseline.filter(i=>i.workDate==="2026-04-05"));
    expect(buildMonthlyScheduleDraft({...input,employees:[{...person,currentAssignmentStartDate:"2026-04-05"}]}).some(i=>i.workDate==="2026-04-04")).toBe(false);
  });
});
