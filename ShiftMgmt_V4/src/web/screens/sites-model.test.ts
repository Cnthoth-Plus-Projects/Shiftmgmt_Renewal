import { describe, it, expect } from "vitest";
import {
  buildEmployeeIdentityMap,
  buildSiteListItems,
  calculateSiteKpis,
  filterAndPaginateSites,
  validateTeamCapacities,
  isValidDateString,
  resolvePatternVersionStatus,
  type SiteListItem
} from "./sites-model";
import {
  create4Team3ShiftTemplate,
  create2Team2ShiftTemplate,
  togglePerTeamPattern,
  PatternHistoryManager,
  validatePatternDraft
} from "./sites-pattern-model";
import type { SiteRecord, ShiftPatternRecord, EmployeeRecord } from "../../shared/domain/model";
import { getDutyCodes, setDraftTeamCount, applyImportSuggestion, serializePatternDraft } from "./sites-pattern-model";
import { planAssignmentMoves } from "./sites-model";
import { draftToPatternRecord } from "./sites-simulation";
import type { SitePatternImportAnalysis } from "../../shared/bridge/contracts";

describe("Sol review regressions", () => {
  it("keeps immutable duty identities when labels change", () => {
    const d = create4Team3ShiftTemplate("s");
    const before = getDutyCodes(d.dutyTypes);
    d.dutyTypes[1].label = "주간 이름을 포함한 석간";
    d.dutyTypes[2].label = "새 주간 이름";
    expect(getDutyCodes(d.dutyTypes)).toEqual(before);
    expect(new Set(Object.values(before).filter(c => c !== "O")).size).toBe(3);
  });
  it("restores multiple shared mappings and keeps inactive mappings through toggles", () => {
    const d = create4Team3ShiftTemplate("s");
    d.cycles.push({ ...structuredClone(d.cycles[0]), cycleKey: "shared-two", order: 1 });
    d.teamCycleAssignments[1].cycleKey = "shared-two";
    d.teamSettings[3].isActive = false;
    const mapping = structuredClone(d.teamCycleAssignments);
    expect(togglePerTeamPattern(d, true).success).toBe(true);
    expect(d.teamCycleAssignments.find(a => a.teamLabel === "D조")).toEqual(mapping[3]);
    d.cycles.find(c => c.cycleKey.startsWith("team:"))!.steps[0].breakMinutes = 17;
    expect(togglePerTeamPattern(d, false).success).toBe(true);
    expect(d.teamCycleAssignments).toEqual(mapping);
    expect(d.cycles.some(c => c.cycleKey.startsWith("team:") && c.steps[0].breakMinutes === 17)).toBe(true);
    expect(togglePerTeamPattern(d, true).success).toBe(true);
    expect(d.cycles.some(c => c.cycleKey.startsWith("team:") && c.steps[0].breakMinutes === 17)).toBe(true);
  });
  it("rejects stale undo after an unrecorded date or structure edit", () => {
    const d = create4Team3ShiftTemplate("s"), h = new PatternHistoryManager();
    h.record(d); d.cycles[0].steps[0].dutyCode = "O"; h.record(d);
    d.effectiveFrom = "2027-06-01";
    expect(h.undo(d)).toBeNull(); expect(d.effectiveFrom).toBe("2027-06-01");
    d.effectiveFrom = "2026-01-01"; d.teamCount = 3;
    expect(h.undo(d)).toBeNull();
  });
  it("retains disabled teams when changing count and leaves invalid counts invalid", () => {
    const d = create4Team3ShiftTemplate("s");
    setDraftTeamCount(d, 2);
    expect(d.teamSettings.find(t => t.teamLabel === "D조")?.isActive).toBe(false);
    expect(serializePatternDraft(d).teamCycleAssignments!.some(t => t.teamLabel === "D조")).toBe(true);
    setDraftTeamCount(d, 9); expect(d.teamCount).toBe(9); expect(validatePatternDraft(d, "사업장").isValid).toBe(false);
  });
  it("rejects missing cycle, index, unknown code and conflicting version date", () => {
    const d = create4Team3ShiftTemplate("s");
    d.cycles[0].shiftCount=2;
    expect(validatePatternDraft(d,"사업장").issues.some(i=>i.message.includes("교대 횟수가 적습니다"))).toBe(true);
    d.cycles[0].shiftCount=3;
    d.teamCycleAssignments[0].cycleKey = "missing";
    d.cycles[0].teamIndexes[1].index = 999;
    d.cycles[0].steps[2].dutyCode = "unknown";
    const other = draftToPatternRecord(create4Team3ShiftTemplate("s")); other.id = "other";
    const errors = validatePatternDraft(d, "사업장", [other]);
    expect(errors.isValid).toBe(false); expect(errors.issues.length).toBeGreaterThanOrEqual(4);
  });
  it("blocks full-team swaps and orders feasible moves using live occupancy", () => {
    const people = ["A조", "B조"].map((team, i) => ({ id: String(i), employeeCode: String(i), name: String(i), employmentType: "정규", status: "active", currentSiteId: "s", currentShiftGroup: team, createdAt: "", updatedAt: "" } as EmployeeRecord));
    const moves = [{ employeeId: "0", fromTeam: "A조", toTeam: "B조" }, { employeeId: "1", fromTeam: "B조", toTeam: "A조" }];
    expect(() => planAssignmentMoves(people, "s", { "A조": 1, "B조": 1 }, moves)).toThrow();
    expect(planAssignmentMoves(people, "s", { "A조": 1, "B조": 2 }, moves).map(m => m.employeeId)).toEqual(["0", "1"]);
  });
  it("parses compressed imported codes and time ranges with the production parser", () => {
    const d = create2Team2ShiftTemplate("s");
    const analysis = { suggestion: { teamCount: 2, cycleCount: 1, poolEnabled: true, poolTimeRange: "09:00 - 18:00", poolBreakMinutes: 60, cycles: [{ cycleKey: "import", name: "추출", shiftCount: 2, patternString: "주주휴휴야야", patternStartDate: "2026-01-01", breakMinutes: 60, shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"], teamIndexes: [{ teamLabel: "A조", index: 0 }, { teamLabel: "B조", index: 2 }] }], teams: [{ teamLabel: "A조", cycleKey: "import", index: 0, maxHeadcount: 2, memberNames: [] }, { teamLabel: "B조", cycleKey: "import", index: 2, maxHeadcount: 2, memberNames: [] }] } } as SitePatternImportAnalysis;
    const result = applyImportSuggestion(d, analysis);
    expect(result.cycles[0].steps).toHaveLength(6);
    expect(result.cycles[0].steps[0].startTime).toBe("07:00");
    expect(result.cycles[0].steps[4].endTime).toBe("07:00");
    expect(result.poolStartTime).toBe("09:00"); expect(result.poolEndTime).toBe("18:00");
    expect(validatePatternDraft(result, "추출 근무지").isValid).toBe(true);
    expect(d.cycles[0].steps.length).toBe(4);
  });
});

describe("sites-model", () => {
  const dummySites: SiteRecord[] = [
    {
      id: "site-1",
      siteCode: "SITE-001",
      name: "보라매 사업장",
      customerName: "㈜한빛에프엠",
      status: "active",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    },
    {
      id: "site-2",
      siteCode: "SITE-002",
      name: "성수물류센터",
      customerName: "성수로지스",
      status: "active",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-02T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z"
    },
    {
      id: "site-3",
      siteCode: "SITE-003",
      name: "판교데이터센터",
      customerName: "㈜한빛에프엠",
      status: "inactive",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-03T00:00:00Z",
      updatedAt: "2026-01-03T00:00:00Z"
    }
  ];

  const dummyPatterns: ShiftPatternRecord[] = [
    {
      id: "pat-1",
      siteId: "site-1",
      name: "4조 3교대 기본",
      teamCount: 4,
      cycleLength: 4,
      patternCode: "D-E-N-O",
      startIndexRule: "manual",
      effectiveFrom: "2026-01-01",
      status: "active",
      steps: [],
      teamIndexes: [],
      cycles: [],
      teamCycleAssignments: [],
      teamCapacities: [],
      teamSettings: [],
      poolEnabled: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }
  ];

  const dummyEmployees: EmployeeRecord[] = [
    {
      id: "emp-1",
      employeeCode: "EMP001",
      name: "홍길동",
      employmentType: "정규직",
      status: "active",
      currentSiteId: "site-1",
      currentShiftGroup: "A",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    },
    {
      id: "emp-2",
      employeeCode: "EMP002",
      name: "이순신",
      employmentType: "정규직",
      status: "active",
      currentSiteId: "site-1",
      currentShiftGroup: "B",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }
  ];

  it("buildEmployeeIdentityMap은 동일 employeeId에 대해 단일 객체 매핑을 생성한다", () => {
    const map = buildEmployeeIdentityMap(dummyEmployees);
    expect(map.size).toBe(2);
    expect(map.get("emp-1")).toMatchObject({
      employeeId: "emp-1",
      name: "홍길동",
      currentSiteId: "site-1"
    });
  });

  it("buildSiteListItems 및 calculateSiteKpis가 올바른 집계를 계산한다", () => {
    const items = buildSiteListItems(dummySites, dummyPatterns, dummyEmployees);
    expect(items.length).toBe(3);

    const site1 = items.find((s) => s.id === "site-1");
    expect(site1?.teamCount).toBe(4);
    expect(site1?.assignedCount).toBe(2);
    expect(site1?.activePatternName).toBe("4조 3교대 기본");

    const kpis = calculateSiteKpis(items);
    expect(kpis.totalSites).toBe(3);
    expect(kpis.activeSites).toBe(2);
    expect(kpis.inactiveSites).toBe(1);
    expect(kpis.totalAssignedEmployees).toBe(2);
  });

  it("filterAndPaginateSites는 단일 목록을 10개씩 페이징한다", () => {
    // 15개 가상 사이트 생성
    const manySites: SiteListItem[] = [];
    for (let i = 1; i <= 15; i++) {
      manySites.push({
        id: `site-${i}`,
        siteCode: `SITE-${String(i).padStart(3, "0")}`,
        name: `사업장 ${i}`,
        customerName: i <= 8 ? "고객사 A" : "고객사 B",
        status: i % 2 === 0 ? "active" : "inactive",
        timezone: "Asia/Seoul",
        teamCount: 4,
        assignedCount: 5,
        activePatternName: "패턴",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01"
      });
    }

    // 1페이지 (10개)
    const page1 = filterAndPaginateSites(
      manySites,
      { keyword: "", status: "ALL", patternFilter: "ALL" },
      1,
      10
    );
    expect(page1.totalCount).toBe(15);
    expect(page1.totalPages).toBe(2);
    expect(page1.items.length).toBe(10);
    expect(page1.startRange).toBe(1);
    expect(page1.endRange).toBe(10);

    // 2페이지 (5개)
    const page2 = filterAndPaginateSites(
      manySites,
      { keyword: "", status: "ALL", patternFilter: "ALL" },
      2,
      10
    );
    expect(page2.items.length).toBe(5);
    expect(page2.startRange).toBe(11);
    expect(page2.endRange).toBe(15);
    const mixed = [
      { ...manySites[0], name: "하늘", siteCode: "SITE-003", customerName: "가 고객사", assignedCount: 2 },
      { ...manySites[1], name: "가람", siteCode: "SITE-001", customerName: "나 고객사", assignedCount: 12 },
      { ...manySites[2], name: "나무", siteCode: "SITE-002", customerName: "가 고객사", assignedCount: 7 },
    ];
    for (const sortBy of ["name", "code", "employees"] as const) {
      const sorted = filterAndPaginateSites(mixed, { keyword: "", status: "ALL", patternFilter: "ALL", sortBy }, 1, 10);
      expect(sorted.items.map(s => s.id)).toEqual(["site-2", "site-3", "site-1"]);
    }
  });

  it("validateTeamCapacities는 정원 초과를 정확히 감지한다", () => {
    const capacities = { A: 2, B: 2 };
    const currentCounts = { A: 2, B: 1 };

    // B조로 1명 추가 -> A(1), B(2) -> 정원 만족
    const validMove = validateTeamCapacities(capacities, currentCounts, [
      { employeeId: "e1", fromTeam: "A", toTeam: "B" }
    ]);
    expect(validMove.isValid).toBe(true);

    // B조로 2명 추가 -> B(3) -> 정원 초과
    const invalidMove = validateTeamCapacities(capacities, currentCounts, [
      { employeeId: "e1", fromTeam: "A", toTeam: "B" },
      { employeeId: "e2", toTeam: "B" }
    ]);
    expect(invalidMove.isValid).toBe(false);
    expect(invalidMove.error).toContain("정원(2명)을 초과");
  });

  it("isValidDateString은 올바른 YYYY-MM-DD 날짜를 검증하고 비정상 날짜를 거절한다", () => {
    expect(isValidDateString("2026-01-01")).toBe(true);
    expect(isValidDateString("2026-12-31")).toBe(true);
    expect(isValidDateString("2026-99-99")).toBe(false);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("invalid-date")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("resolvePatternVersionStatus는 과거/현재/예정/비활성 버전을 정확히 판정한다", () => {
    const patterns: ShiftPatternRecord[] = [
      {
        id: "p-past",
        siteId: "s1",
        name: "과거버전",
        effectiveFrom: "2025-01-01",
        status: "active",
        teamCount: 4,
        cycleLength: 4,
        patternCode: "D-E-N-O",
        startIndexRule: "manual",
        steps: [],
        teamIndexes: [],
        cycles: [],
        teamCycleAssignments: [],
        teamCapacities: [],
        teamSettings: [],
        poolEnabled: false,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01"
      },
      {
        id: "p-current",
        siteId: "s1",
        name: "현재버전",
        effectiveFrom: "2026-01-01",
        status: "active",
        teamCount: 4,
        cycleLength: 4,
        patternCode: "D-E-N-O",
        startIndexRule: "manual",
        steps: [],
        teamIndexes: [],
        cycles: [],
        teamCycleAssignments: [],
        teamCapacities: [],
        teamSettings: [],
        poolEnabled: false,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01"
      },
      {
        id: "p-future",
        siteId: "s1",
        name: "예정버전",
        effectiveFrom: "2027-01-01",
        status: "active",
        teamCount: 4,
        cycleLength: 4,
        patternCode: "D-E-N-O",
        startIndexRule: "manual",
        steps: [],
        teamIndexes: [],
        cycles: [],
        teamCycleAssignments: [],
        teamCapacities: [],
        teamSettings: [],
        poolEnabled: false,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01"
      },
      {
        id: "p-inactive",
        siteId: "s1",
        name: "비활성버전",
        effectiveFrom: "2026-05-01",
        status: "inactive",
        teamCount: 4,
        cycleLength: 4,
        patternCode: "D-E-N-O",
        startIndexRule: "manual",
        steps: [],
        teamIndexes: [],
        cycles: [],
        teamCycleAssignments: [],
        teamCapacities: [],
        teamSettings: [],
        poolEnabled: false,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01"
      }
    ];

    const refDate = "2026-06-01";
    expect(resolvePatternVersionStatus(patterns[0], patterns, refDate)).toBe("past");
    expect(resolvePatternVersionStatus(patterns[1], patterns, refDate)).toBe("current");
    expect(resolvePatternVersionStatus(patterns[2], patterns, refDate)).toBe("scheduled");
    expect(resolvePatternVersionStatus(patterns[3], patterns, refDate)).toBe("inactive");
  });
});

describe("sites-pattern-model", () => {
  it("기본 템플릿 생성 및 DTO 직렬화가 정상 동작한다", () => {
    const draft4 = create4Team3ShiftTemplate("site-1", "4조 3교대");
    expect(draft4.teamCount).toBe(4);
    expect(draft4.dutyTypes.length).toBe(4);
    expect(draft4.cycles[0].steps.length).toBe(4);
    expect(draft4.cycles[0].shiftCount).toBe(3); // 3교대

    const draft2 = create2Team2ShiftTemplate("site-1", "2조 2교대");
    expect(draft2.teamCount).toBe(2);
    expect(draft2.cycles[0].steps.length).toBe(4);
    expect(draft2.cycles[0].shiftCount).toBe(2); // 2교대
  });

  it("개별 패턴 토글 전환 시 전용 묶음 분리 및 복귀가 비파괴적으로 유지된다", () => {
    const draft = create4Team3ShiftTemplate("site-1");
    expect(draft.isPerTeamPattern).toBe(false);

    // ON 전환
    const onResult = togglePerTeamPattern(draft, true);
    expect(onResult.success).toBe(true);
    expect(draft.isPerTeamPattern).toBe(true);
    expect(draft.cycles.length >= 4).toBe(true);

    // OFF 전환
    const offResult = togglePerTeamPattern(draft, false);
    expect(offResult.success).toBe(true);
    expect(draft.isPerTeamPattern).toBe(false);
  });

  it("PatternHistoryManager는 Undo/Redo 스택을 올바르게 제어한다", () => {
    const history = new PatternHistoryManager();
    const draft = create4Team3ShiftTemplate("site-1");

    history.record(draft);
    expect(history.canUndo()).toBe(false);

    // 변경 후 기록
    const draft2 = { ...draft, name: "수정된 패턴" };
    history.record(draft2);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Undo
    const undone = history.undo();
    expect(undone?.name).toBe("4조 3교대 패턴");
    expect(history.canRedo()).toBe(true);

    // Redo
    const redone = history.redo();
    expect(redone?.name).toBe("수정된 패턴");
  });

  it("validatePatternDraft는 필수값 누락 및 잘못된 날짜를 정확히 감지한다", () => {
    const draft = create4Team3ShiftTemplate("site-1");
    const valid = validatePatternDraft(draft, "보라매 사업장");
    expect(valid.isValid).toBe(true);

    // 근무지 이름 누락
    const invalidName = validatePatternDraft(draft, "");
    expect(invalidName.isValid).toBe(false);
    expect(invalidName.issues.some((i) => i.field === "siteName")).toBe(true);

    // 비정상 날짜(2026-99-99)
    const invalidDateDraft = { ...draft, effectiveFrom: "2026-99-99" };
    const invalidDate = validatePatternDraft(invalidDateDraft, "보라매 사업장");
    expect(invalidDate.isValid).toBe(false);
    expect(invalidDate.issues.some((i) => i.field === "effectiveFrom")).toBe(true);

    // 조 수 9개
    const invalidTeamsDraft = { ...draft, teamCount: 9 };
    const invalidTeams = validatePatternDraft(invalidTeamsDraft, "보라매 사업장");
    expect(invalidTeams.isValid).toBe(false);
    expect(invalidTeams.issues.some((i) => i.field === "teamCount")).toBe(true);
  });
});
