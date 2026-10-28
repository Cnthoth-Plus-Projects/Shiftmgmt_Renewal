import { describe, it, expect } from "vitest";
import {
  draftToPatternRecord,
  buildVirtualTeamEmployees,
  runThreeMonthSimulation
} from "./sites-simulation";
import { create4Team3ShiftTemplate, create2Team2ShiftTemplate } from "./sites-pattern-model";
import { buildMonthlyScheduleDraft } from "../../shared/domain/monthly-schedule-draft";
import { resolveMonthlyPattern } from "./sites-simulation";
import { resolveShiftPatternForMonth } from "../../shared/domain/shift-pattern-version";

describe("Sol simulation regressions", () => {
  it("does not replace an explicitly empty actual workforce with virtual people", () => {
    const d = create4Team3ShiftTemplate("site");
    expect(runThreeMonthSimulation(d, "2026-11", []).months.every(m => m.items.length === 0)).toBe(true);
  });
  it("selects each month with the existing resolver including a later saved version", () => {
    const d = create4Team3ShiftTemplate("site"); d.patternId = "edit"; d.effectiveFrom = "2026-11-15";
    const old = draftToPatternRecord(create2Team2ShiftTemplate("site")); old.id = "old";
    const later = structuredClone(old); later.id = "later"; later.effectiveFrom = "2027-01-01";
    for (const month of ["2026-11", "2026-12", "2027-01"]) {
      expect(resolveMonthlyPattern(month, d, [old, later])?.id).toBe(resolveShiftPatternForMonth([old, later, draftToPatternRecord(d)], month)?.id);
    }
    expect(resolveMonthlyPattern("2027-01", d, [old, later])?.id).toBe("later");
  });
  it("preserves actual weekday holiday time and overnight break through the adapter", () => {
    const d = create2Team2ShiftTemplate("site"); d.effectiveFrom = "2028-02-01";
    d.cycles[0].patternStartDate = "2028-02-01"; d.cycles[0].holidayTimeMode = "split"; d.cycles[0].weekdayPublicHolidayAsHoliday = true;
    for (const s of d.cycles[0].steps) if (s.dutyCode !== "O") { s.holidayStartTime = "22:00"; s.holidayEndTime = "06:00"; s.holidayBreakMinutes = 75; }
    const holidays = new Set(["2028-02-02"]), people = buildVirtualTeamEmployees(d);
    const sim = runThreeMonthSimulation(d, "2028-02", people, holidays);
    const expected = buildMonthlyScheduleDraft({ scheduleMonth: "2028-02", pattern: draftToPatternRecord(d), employees: people, publicHolidayDates: holidays });
    expect(sim.months[0].items).toEqual(expected);
    expect(sim.months[0].dates.length).toBe(29);
    const worked = sim.months[0].items.find(i => i.workDate === "2028-02-02" && i.dutyCode !== "O");
    expect(worked?.startTime).toBe("22:00"); expect(worked?.breakMinutes).toBe(75);
  });
});

describe("sites-simulation", () => {
  it("draftToPatternRecord가 유효한 ShiftPatternRecord를 생성한다", () => {
    const draft = create4Team3ShiftTemplate("site-test-1");
    const record = draftToPatternRecord(draft);

    expect(record.siteId).toBe("site-test-1");
    expect(record.teamCount).toBe(4);
    expect(record.cycles.length).toBe(1);
    expect(record.steps.length).toBe(4);
  });

  it("가상 대표 직원을 통해 3개월 시뮬레이션이 조×일자별 dutyCode를 생성한다", () => {
    const draft = create4Team3ShiftTemplate("site-test-1");
    const sim = runThreeMonthSimulation(draft, "2026-11");

    expect(sim.months.length).toBe(3);
    expect(sim.months[0].scheduleMonth).toBe("2026-11");
    expect(sim.months[1].scheduleMonth).toBe("2026-12");
    expect(sim.months[2].scheduleMonth).toBe("2027-01");

    // 2026-11월 30일
    expect(sim.months[0].dates.length).toBe(30);
    // 각 조별 일별 dutyCode가 존재하는지 확인
    const aTeamMap = sim.months[0].teamDailyDuty.get("A조") || sim.months[0].teamDailyDuty.get("A");
    expect(aTeamMap).toBeDefined();
    expect(aTeamMap?.get("2026-11-01")).toBeDefined();
  });

  it("실제 buildMonthlyScheduleDraft 직접 호출과 시뮬레이션 어댑터의 결과가 100% 일치한다 (Parity)", () => {
    const draft = create2Team2ShiftTemplate("site-test-2");
    const patternRecord = draftToPatternRecord(draft);
    const virtualEmployees = buildVirtualTeamEmployees(draft);

    // 직접 buildMonthlyScheduleDraft 호출
    const directItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-11",
      pattern: patternRecord,
      employees: virtualEmployees
    });

    // runThreeMonthSimulation 어댑터를 통한 호출
    const sim = runThreeMonthSimulation(draft, "2026-11", virtualEmployees);
    const simItems = sim.months[0].items;

    expect(simItems.length).toBe(directItems.length);
    for (let i = 0; i < directItems.length; i++) {
      expect(simItems[i].workDate).toBe(directItems[i].workDate);
      expect(simItems[i].teamLabel).toBe(directItems[i].teamLabel);
      expect(simItems[i].dutyCode).toBe(directItems[i].dutyCode);
      expect(simItems[i].startTime).toBe(directItems[i].startTime);
      expect(simItems[i].endTime).toBe(directItems[i].endTime);
    }
  });

  it("resolveMonthlyPattern은 월별 유효 버전을 올바르게 탐색한다", () => {
    const draft = create4Team3ShiftTemplate("site-test-3");
    draft.effectiveFrom = "2026-06-01"; // 미래 버전

    const existingPattern = draftToPatternRecord(create2Team2ShiftTemplate("site-test-3"));
    existingPattern.effectiveFrom = "2026-01-01";
    existingPattern.status = "active";

    // 2026-03월 기준: draft(2026-06-01)는 아직 발효 전이므로 기존 2026-01-01 버전이 선택되어야 함
    const sim = runThreeMonthSimulation({
      draft,
      startMonth: "2026-03",
      existingPatterns: [existingPattern]
    });

    expect(sim.months[0].scheduleMonth).toBe("2026-03");
    // 2조 2교대 패턴(팀 2개)이 적용되었는지 확인
    expect(sim.months[0].teamDailyDuty.size).toBe(2);
  });
});
