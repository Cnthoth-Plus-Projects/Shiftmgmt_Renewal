import { describe, expect, it } from "vitest";
import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord,
} from "../../shared/domain/model";
import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import {
  buildRosterFromStoredSchedule,
  calculateWeeksInMonth,
  filterScheduleHistory,
  generateSchedulePreview,
  getDaysInMonth,
  isValidYearMonth,
  joinSchedulePlanExports,
  labelSchedulePreview,
  prepareRosterEmployees,
  sortRosterRows,
  type ScheduleRosterRow,
} from "./schedule-model";

import { create4Team3ShiftTemplate } from "./sites-pattern-model";
import { draftToPatternRecord } from "./sites-simulation";

const samplePattern: ShiftPatternRecord = {
  id: "pattern-1",
  siteId: "site-1",
  name: "4조2교대 기본형",
  shiftCount: 2,
  teamCount: 4,
  cycleLength: 4,
  patternCode: "4T2S",
  startIndexRule: "fixed",
  status: "active",
  patternStartDate: "2026-01-01",
  effectiveFrom: "2026-01-01",
  steps: [
    { stepIndex: 0, dutyCode: "D" },
    { stepIndex: 1, dutyCode: "N" },
    { stepIndex: 2, dutyCode: "O" },
    { stepIndex: 3, dutyCode: "OFF" },
  ],
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 1 },
          { teamLabel: "C조", index: 2 },
          { teamLabel: "D조", index: 3 },
        ],
  teamCycleAssignments: [
    { teamLabel: "A조", cycleKey: "A조" },
    { teamLabel: "B조", cycleKey: "B조" },
    { teamLabel: "C조", cycleKey: "C조" },
    { teamLabel: "D조", cycleKey: "D조" },
  ],
  dutyTypes: [
    { id: "D", code: "D", label: "주간", kind: "work", startTime: "09:00", endTime: "18:00", unpaidBreakMinutes: 60 },
    { id: "N", code: "N", label: "야간", kind: "work", startTime: "18:00", endTime: "09:00", unpaidBreakMinutes: 120 },
    { id: "O", code: "O", label: "비번", kind: "off" },
    { id: "OFF", code: "OFF", label: "휴무", kind: "off" },
  ],
  cycles: [
    {
      id: "c-1",
      cycleKey: "A조", shiftGroup: "A조",
      steps: [
        { stepIndex: 0, dutyCode: "D" },
        { stepIndex: 1, dutyCode: "N" },
        { stepIndex: 2, dutyCode: "O" },
        { stepIndex: 3, dutyCode: "OFF" },
      ],
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 1 },
          { teamLabel: "C조", index: 2 },
          { teamLabel: "D조", index: 3 },
        ],
    },
    {
      id: "c-2",
      cycleKey: "B조", shiftGroup: "B조",
      steps: [
        { stepIndex: 0, dutyCode: "N" },
        { stepIndex: 1, dutyCode: "O" },
        { stepIndex: 2, dutyCode: "OFF" },
        { stepIndex: 3, dutyCode: "D" },
      ],
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 1 },
          { teamLabel: "C조", index: 2 },
          { teamLabel: "D조", index: 3 },
        ],
    },
    {
      id: "c-3",
      cycleKey: "C조", shiftGroup: "C조",
      steps: [
        { stepIndex: 0, dutyCode: "O" },
        { stepIndex: 1, dutyCode: "OFF" },
        { stepIndex: 2, dutyCode: "D" },
        { stepIndex: 3, dutyCode: "N" },
      ],
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 1 },
          { teamLabel: "C조", index: 2 },
          { teamLabel: "D조", index: 3 },
        ],
    },
    {
      id: "c-4",
      cycleKey: "D조", shiftGroup: "D조",
      steps: [
        { stepIndex: 0, dutyCode: "OFF" },
        { stepIndex: 1, dutyCode: "D" },
        { stepIndex: 2, dutyCode: "N" },
        { stepIndex: 3, dutyCode: "O" },
      ],
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 1 },
          { teamLabel: "C조", index: 2 },
          { teamLabel: "D조", index: 3 },
        ],
    },
  ],
};

const makeEmp = (id: string, code: string, name: string, group: string, order = 0, hireDate?: string): EmployeeRecord => ({
  id,
  employeeCode: code,
  name,
  currentSiteId: "site-1",
  currentShiftGroup: group,
  currentAssignmentOrder: order,
  employmentType: "regular",
  jobTitle: "사원",
  hireDate: hireDate || "2020-01-01",
  status: "active",
});

describe("schedule-model", () => {
  it("validates yearMonth correctly", () => {
    expect(isValidYearMonth("2026-05")).toBe(true);
    expect(isValidYearMonth("1900-01")).toBe(true);
    expect(isValidYearMonth("9999-12")).toBe(true);
    expect(isValidYearMonth("2026-13")).toBe(false);
    expect(isValidYearMonth("2026-00")).toBe(false);
    expect(isValidYearMonth("1899-12")).toBe(false);
    expect(isValidYearMonth("abc")).toBe(false);
  });

  it("calculates exact days in month for leap and non-leap years", () => {
    expect(getDaysInMonth("2024-02")).toHaveLength(29);
    expect(getDaysInMonth("2026-02")).toHaveLength(28);
    expect(getDaysInMonth("2026-05")).toHaveLength(31);
    expect(getDaysInMonth("2026-04")).toHaveLength(30);
  });

  it("calculates weeks in month partitioned by Sunday", () => {
    const dates = getDaysInMonth("2026-05");
    const weeks = calculateWeeksInMonth(dates);
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    expect(weeks[0].weekIndex).toBe(1);
    expect(weeks[0].dates[0]).toBe("2026-05-01");
  });

  describe("UI04-D04: sortRosterRows ordering without title guessing", () => {
    it("orders by teamLabel -> assignmentOrder -> employeeCode natural sort, ignoring name titles", () => {
      const rows: ScheduleRosterRow[] = [
        {
          rowKey: "r1",
          employeeId: "e1",
          employeeCode: "EMP-10",
          name: "사원1",
          cycleKey: "A조", shiftGroup: "A조",
          assignmentOrder: 0,
          days: {},
          weeklySummary: [],
          totalWorkMinutes: 0,
          totalWorkDays: 0,
          nightDaysCount: 0,
        },
        {
          rowKey: "r2",
          employeeId: "e2",
          employeeCode: "EMP-2",
          name: "사원2",
          cycleKey: "A조", shiftGroup: "A조",
          assignmentOrder: 0,
          days: {},
          weeklySummary: [],
          totalWorkMinutes: 0,
          totalWorkDays: 0,
          nightDaysCount: 0,
        },
        {
          rowKey: "r3",
          employeeId: "e3",
          employeeCode: "EMP-1",
          name: "김조장",
          cycleKey: "A조", shiftGroup: "A조",
          assignmentOrder: 9,
          days: {},
          weeklySummary: [],
          totalWorkMinutes: 0,
          totalWorkDays: 0,
          nightDaysCount: 0,
        },
        {
          rowKey: "r4",
          employeeId: "e4",
          employeeCode: "EMP-0",
          name: "이조장",
          cycleKey: "B조", shiftGroup: "B조",
          assignmentOrder: 0,
          days: {},
          weeklySummary: [],
          totalWorkMinutes: 0,
          totalWorkDays: 0,
          nightDaysCount: 0,
        },
      ];

      const sorted = sortRosterRows(rows);
      // A조 order 0인 EMP-2가 먼저 나오고, 그 다음 EMP-10, 그 다음 order 9인 김조장이 나와야 함
      expect(sorted[0].employeeCode).toBe("EMP-2");
      expect(sorted[1].employeeCode).toBe("EMP-10");
      expect(sorted[2].employeeCode).toBe("EMP-1");
      expect(sorted[3].employeeCode).toBe("EMP-0");
    });
  });

  describe("UI04-D03: prepareRosterEmployees with half-open intervals and clones", () => {
    it("properly clamps hireDate to assignment start for late-joiner (5/16 start)", async () => {
      const emp = makeEmp("e1", "EMP-1", "홍길동", "A조", 0, "2020-01-01");
      const assignments: EmployeeSiteAssignment[] = [
        {
          id: "asgn-1",
          employeeId: "e1",
          siteId: "site-1",
          cycleKey: "A조", shiftGroup: "A조",
          startDate: "2026-05-16",
          sortOrder: 0,
        },
      ];

      const result = await prepareRosterEmployees([emp], "2026-05", "site-1", async () => assignments);
      expect(result.fatalIssues).toHaveLength(0);
      expect(result.rosterEmployees).toHaveLength(1);
      // 생성 전용 복사본의 hireDate는 max(실입사일, 배정시작일) = 2026-05-16
      expect(result.rosterEmployees[0].hireDate).toBe("2026-05-16");
      expect(result.rosterEmployees[0].currentAssignmentStartDate).toBe("2026-05-16");
    });

    it("excludes assignment ending on month start (5/1 end)", async () => {
      const emp = makeEmp("e1", "EMP-1", "홍길동", "A조", 0, "2020-01-01");
      const assignments: EmployeeSiteAssignment[] = [
        {
          id: "asgn-1",
          employeeId: "e1",
          siteId: "site-1",
          cycleKey: "A조", shiftGroup: "A조",
          startDate: "2026-01-01",
          endDate: "2026-05-01", // 5/1 종료 -> 5월에 미포함
          sortOrder: 0,
        },
      ];

      const result = await prepareRosterEmployees([emp], "2026-05", "site-1", async () => assignments);
      expect(result.fatalIssues).toHaveLength(0);
      expect(result.rosterEmployees).toHaveLength(0);
    });

    it("handles mid-month team change seamlessly (5/16 end in A, 5/16 start in B)", async () => {
      const emp = makeEmp("e1", "EMP-1", "홍길동", "A조", 0, "2020-01-01");
      const assignments: EmployeeSiteAssignment[] = [
        {
          id: "asgn-1",
          employeeId: "e1",
          siteId: "site-1",
          cycleKey: "A조", shiftGroup: "A조",
          startDate: "2026-05-01",
          endDate: "2026-05-16",
          sortOrder: 0,
        },
        {
          id: "asgn-2",
          employeeId: "e1",
          siteId: "site-1",
          cycleKey: "B조", shiftGroup: "B조",
          startDate: "2026-05-16",
          endDate: "2026-06-01",
          sortOrder: 0,
        },
      ];

      const result = await prepareRosterEmployees([emp], "2026-05", "site-1", async () => assignments);
      expect(result.fatalIssues).toHaveLength(0);
      expect(result.rosterEmployees).toHaveLength(2);
      expect(result.rosterEmployees[0].currentShiftGroup).toBe("A조");
      expect(result.rosterEmployees[0].currentAssignmentEndDate).toBe("2026-05-16");
      expect(result.rosterEmployees[1].currentShiftGroup).toBe("B조");
      expect(result.rosterEmployees[1].currentAssignmentStartDate).toBe("2026-05-16");
    });

    it("blocks overlapping assignments with fatal error", async () => {
      const emp = makeEmp("e1", "EMP-1", "홍길동", "A조", 0, "2020-01-01");
      const assignments: EmployeeSiteAssignment[] = [
        {
          id: "asgn-1",
          employeeId: "e1",
          siteId: "site-1",
          cycleKey: "A조", shiftGroup: "A조",
          startDate: "2026-05-01",
          endDate: "2026-05-20",
          sortOrder: 0,
        },
        {
          id: "asgn-2",
          employeeId: "e1",
          siteId: "site-1",
          cycleKey: "B조", shiftGroup: "B조",
          startDate: "2026-05-15",
          endDate: "2026-05-31",
          sortOrder: 0,
        },
      ];

      const result = await prepareRosterEmployees([emp], "2026-05", "site-1", async () => assignments);
      expect(result.fatalIssues.length).toBeGreaterThan(0);
      expect(result.fatalIssues[0]).toContain("중복 배정 구간");
      expect(result.rosterEmployees).toHaveLength(0);
    });

    it("blocks and returns fatalIssue when fetchAssignments throws", async () => {
      const emp = makeEmp("e1", "EMP-1", "홍길동", "A조", 0);
      const result = await prepareRosterEmployees([emp], "2026-05", "site-1", async () => {
        throw new Error("네트워크 타임아웃");
      });
      expect(result.fatalIssues.length).toBe(1);
      expect(result.fatalIssues[0]).toContain("네트워크 타임아웃");
    });
  });

  describe("UI04-D03 & UI04-D04: generateSchedulePreview with version resolving, days and rows", () => {
    it("selects correct version via resolveShiftPatternForMonth", () => {
      const pOld: ShiftPatternRecord = { ...samplePattern, id: "p-old", effectiveFrom: "2026-01-01" };
      const pMay: ShiftPatternRecord = { ...samplePattern, id: "p-may", effectiveFrom: "2026-05-01" };
      const pFuture: ShiftPatternRecord = { ...samplePattern, id: "p-future", effectiveFrom: "2026-06-01" };

      const emp = makeEmp("e1", "EMP-1", "김사원", "A조", 0);
      const preview = generateSchedulePreview([pOld, pMay, pFuture], [emp], "2026-05");
      expect(preview.pattern?.id).toBe("p-may");
      expect(preview.fatalIssues).toHaveLength(0);
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0].days["2026-05-01"].dutyCode).not.toBe("—");
    });

    it("generates separate rows for mid-month team change without unassigned dates becoming fake off days", () => {
      const empA: EmployeeRecord = {
        ...makeEmp("e1", "EMP-1", "김사원", "A조", 0, "2026-05-01"),
        hireDate: "2026-05-01",
        currentAssignmentStartDate: "2026-05-01",
        currentAssignmentEndDate: "2026-05-16",
      };
      const empB: EmployeeRecord = {
        ...makeEmp("e1", "EMP-1", "김사원", "B조", 0, "2026-05-16"),
        hireDate: "2026-05-16",
        currentAssignmentStartDate: "2026-05-16",
        currentAssignmentEndDate: "2026-06-01",
      };

      const preview = generateSchedulePreview([samplePattern], [empA, empB], "2026-05");
      expect(preview.fatalIssues).toHaveLength(0);
      expect(preview.rows).toHaveLength(2);

      const rowA = preview.rows.find((r) => r.shiftGroup === "A조");
      const rowB = preview.rows.find((r) => r.shiftGroup === "B조");
      expect(rowA).toBeDefined();
      expect(rowB).toBeDefined();

      // rowA: 5/1~5/15는 실제 dutyCode, 5/16 이후는 배정 없는 날 —
      expect(rowA?.days["2026-05-01"].dutyCode).not.toBe("—");
      expect(rowA?.days["2026-05-15"].dutyCode).not.toBe("—");
      expect(rowA?.days["2026-05-16"].dutyCode).toBe("—");
      expect(rowA?.days["2026-05-31"].dutyCode).toBe("—");

      // rowB: 5/1~5/15는 —, 5/16 이후는 실제 dutyCode
      expect(rowB?.days["2026-05-01"].dutyCode).toBe("—");
      expect(rowB?.days["2026-05-15"].dutyCode).toBe("—");
      expect(rowB?.days["2026-05-16"].dutyCode).not.toBe("—");
      expect(rowB?.days["2026-05-31"].dutyCode).not.toBe("—");
    });
  });

  describe("buildRosterFromStoredSchedule & history join", () => {
    it("builds roster correctly from stored monthly schedule", () => {
      const stored: MonthlyScheduleRecord = {
        id: "sched-1",
        siteId: "site-1",
        scheduleMonth: "2026-05",
        patternId: "p-1",
        generatedBy: "admin",
        items: [
          {
            employeeId: "e1",
            employeeCode: "EMP-1",
            employeeName: "김사원",
            teamLabel: "A조",
            workDate: "2026-05-01",
            dutyCode: "D",
            startTime: "09:00",
            endTime: "18:00",
            breakMinutes: 60,
          },
          {
            employeeId: "e1",
            employeeCode: "EMP-1",
            employeeName: "김사원",
            teamLabel: "A조",
            workDate: "2026-05-02",
            dutyCode: "O",
          },
        ],
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
      };

      const roster = buildRosterFromStoredSchedule(stored);
      expect(roster.rows).toHaveLength(1);
      expect(roster.rows[0].days["2026-05-01"].dutyCode).toBe("D");
      expect(roster.rows[0].days["2026-05-01"].actualWorkMinutes).toBe(480);
      expect(roster.rows[0].days["2026-05-02"].dutyCode).toBe("O");
      // 5/3 이후 배정 없는 날은 —
      expect(roster.rows[0].days["2026-05-03"].dutyCode).toBe("—");
    });

    it("joins history exports with schedules and sites", () => {
      const exportsList: SchedulePlanExportRecord[] = [
        {
          id: "exp-1",
          scheduleId: "sched-1",
          outputFileName: "2026년05월_근무표.xlsx",
          outputPath: "C:/exports/2026년05월_근무표.xlsx",
          publishedPath: null,
          exportedAt: "2026-05-01T10:00:00Z",
        },
      ];
      const schedules: MonthlyScheduleRecord[] = [
        {
          id: "sched-1",
          siteId: "site-1",
          scheduleMonth: "2026-05",
          patternId: "p-1",
          generatedBy: "planner",
          items: [],
          createdAt: "2026-05-01T00:00:00Z",
          updatedAt: "2026-05-01T00:00:00Z",
        },
      ];
      const sites: SiteRecord[] = [
        {
          id: "site-1",
          name: "여의도 본사",
          address: "서울",
          status: "active",
        },
      ];

      const history = joinSchedulePlanExports(exportsList, schedules, sites);
      expect(history).toHaveLength(1);
      expect(history[0].siteName).toBe("여의도 본사");
      expect(history[0].status).toBe("생성 완료");

      const filtered = filterScheduleHistory(history, { keyword: "여의도" });
      expect(filtered).toHaveLength(1);
    });
  });
});

describe("Sol regression: complete roster and saved presentation", () => {
  const person = (id: string): EmployeeRecord => ({ id, employeeCode: id, name: id, role: "worker", status: "active", employmentType: "정규", hireDate: "2020-01-01", createdAt: "" });
  const assignment = (id: string, group = "A조", start = "2025-01-01", end?: string): EmployeeSiteAssignment => ({ id: `a-${id}-${start}`, employeeId: id, siteId: "s", shiftGroup: group, startDate: start, endDate: end, sortOrder: 0, createdAt: "" });
  const pattern = (): ShiftPatternRecord => {
    const draft = create4Team3ShiftTemplate("s"); draft.effectiveFrom = "2025-01-01";
    return { ...draftToPatternRecord(draft), id: "p", siteId: "s", effectiveFrom: "2025-01-01", status: "active" };
  };
  it("does not invent a group for an assignment and blocks all generation", async () => {
    const roster = await prepareRosterEmployees([person("e")], "2026-05", "s", async () => [assignment("e", "")]);
    expect(roster.rosterEmployees[0].currentShiftGroup).toBeUndefined();
    const preview = generateSchedulePreview([pattern()], roster.rosterEmployees, "2026-05");
    expect(preview.fatalIssues.length).toBeGreaterThan(0); expect(preview.items).toEqual([]);
  });
  it("fails the whole preview when one assignment read fails", async () => {
    const roster = await prepareRosterEmployees([person("good"), person("bad")], "2026-05", "s", async id => { if (id === "bad") throw new Error("배정 조회 실패"); return [assignment(id)]; });
    expect(roster.rosterEmployees).toEqual([]); expect(roster.fatalIssues.join()).toContain("배정 조회 실패");
  });
  it("bounds concurrent assignment reads at four and retains every employee", async () => {
    let pending = 0, max = 0;
    const roster = await prepareRosterEmployees(Array.from({ length: 13 }, (_, i) => person(`e${i}`)), "2026-05", "s", async id => {
      pending++; max = Math.max(max, pending); await new Promise(resolve => setTimeout(resolve, 1)); pending--; return [assignment(id)];
    });
    expect(max).toBe(4); expect(roster.rosterEmployees).toHaveLength(13);
  });
  it("generates adjacent team moves once per date and respects hire date", async () => {
    const employee = { ...person("e"), hireDate: "2026-05-03" };
    const roster = await prepareRosterEmployees([employee], "2026-05", "s", async () => [assignment("e", "A조", "2026-05-01", "2026-05-16"), assignment("e", "B조", "2026-05-16")]);
    const preview = generateSchedulePreview([pattern()], roster.rosterEmployees, "2026-05");
    expect(preview.fatalIssues).toEqual([]); expect(preview.rows).toHaveLength(2); expect(new Set(preview.rows.map(r => r.rowKey)).size).toBe(2);
    expect(preview.items).toHaveLength(29); expect(new Set(preview.items.map(i => i.workDate)).size).toBe(29);
    expect(preview.items.find(i => i.workDate === "2026-05-15")?.teamLabel).toBe("A조"); expect(preview.items.find(i => i.workDate === "2026-05-16")?.teamLabel).toBe("B조");
  });
  it("W10 generates two same-month employment periods once per day and excludes the gap, old future and cancelled histories",async()=>{
    const employee={...person("e"),employmentPeriods:[{id:"old",startDate:"2020-01-01",endDate:"2026-05-10"},{id:"new",startDate:"2026-05-20"}]};
    const roster=await prepareRosterEmployees([employee],"2026-05","s",async()=>[
      {...assignment("e","A조"),employmentPeriodId:"old",retirementDate:"2026-05-10"},
      {...assignment("e","C조","2026-05-11"),employmentPeriodId:"old",retirementDate:"2026-05-10",retirementExcluded:true},
      {...assignment("e","D조","2026-05-15"),employmentPeriodCancelled:true},
      {...assignment("e","B조","2026-05-20"),employmentPeriodId:"new",employmentPeriodStart:"2026-05-20"}
    ]);
    const preview=generateSchedulePreview([pattern()],roster.rosterEmployees,"2026-05");expect(preview.fatalIssues).toEqual([]);expect(preview.items).toHaveLength(21);expect(new Set(preview.items.map(i=>i.workDate)).size).toBe(21);expect(preview.items.filter(i=>i.workDate>="2026-05-10"&&i.workDate<"2026-05-20")).toEqual([]);expect(preview.items.find(i=>i.workDate==="2026-05-09")?.teamLabel).toBe("A조");expect(preview.items.find(i=>i.workDate==="2026-05-20")?.teamLabel).toBe("B조");
  });
  it("labels duties and teams without changing saved codes, items or times", () => {
    const source = buildRosterFromStoredSchedule({ id: "saved", siteId: "s", patternId: "p", scheduleMonth: "2026-05", generatedBy: "과거", createdAt: "", items: [{ employeeCode: "e", teamLabel: "A조", workDate: "2026-05-01", dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 }] } as MonthlyScheduleRecord);
    const before = JSON.stringify(source), p = pattern(); p.teamSettings[0].displayName = "관제 1팀";
    const result = labelSchedulePreview(source, p);
    expect(result.rows[0].days["2026-05-01"].dutyLabel).not.toBe("D"); expect(result.rows[0].displayName).toBe("관제 1팀"); expect(JSON.stringify(source)).toBe(before); expect(result.items).toBe(source.items);
  });
  it("counts distinct people rather than worksheet cell updates", () => {
    const schedules = [{ id: "s1", siteId: "s", scheduleMonth: "2026-05", items: [{ employeeCode: "e1" }, { employeeCode: "e1" }, { employeeCode: "e2" }] }] as MonthlyScheduleRecord[];
    const rows = joinSchedulePlanExports([{ id: "x", scheduleId: "s1", scheduleMonth: "2026-05", updateCount: 99 }] as SchedulePlanExportRecord[], schedules);
    expect(rows[0].employeeCount).toBe(2); expect(rows[0].itemCount).toBe(99);
    expect(joinSchedulePlanExports([{ id: "x", scheduleId: "missing" }] as SchedulePlanExportRecord[], [])[0].employeeCount).toBeUndefined();
  });
});

it("sorts history by month and newest export with invalid dates last", () => {
  const rows = [{ exportId: "old", scheduleMonth: "2026-05", exportedAt: "2026-05-01" }, { exportId: "invalid", scheduleMonth: "2026-05", exportedAt: "잘못된 날짜" }, { exportId: "june", scheduleMonth: "2026-06", exportedAt: "2026-01-01" }, { exportId: "latest", scheduleMonth: "2026-05", exportedAt: "2026-05-02" }].map(row => ({ ...row, siteId: "s", publishStatus: "draft", siteName: "시험", fileName: "표.xlsx", generatedBy: "시험" })) as Parameters<typeof filterScheduleHistory>[0];
  expect(filterScheduleHistory(rows, {}).map(r => r.exportId)).toEqual(["june", "latest", "old", "invalid"]);
});
