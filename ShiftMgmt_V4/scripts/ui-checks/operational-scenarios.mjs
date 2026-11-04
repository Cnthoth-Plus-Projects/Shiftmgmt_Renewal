// User-review data: small, fully staffed sites. Large pagination fixtures stay in their own test runner.
export const operationalSites = [
  { name: "보라매DC", customer: "새빛FM", kind: "4조2교대", sizes: [2, 2, 2, 2] },
  { name: "동탄센터", customer: "한결로지스", kind: "4조2교대", sizes: [3, 3, 3, 3] },
  { name: "인천허브", customer: "다온유통", kind: "3조3교대", sizes: [2, 2, 2] },
  { name: "판교연구센터", customer: "라온연구운영", kind: "4조3교대", sizes: [2, 2, 2, 2] },
  { name: "강서통합관제센터", customer: "가온시큐리티", kind: "4조2교대", sizes: [2, 3, 2, 3] },
  { name: "성남바이오생산동", customer: "온누리바이오", kind: "3조3교대", sizes: [3, 3, 3] },
  { name: "구로오피스관제센터", customer: "이음자산관리", kind: "4조3교대", sizes: [3, 2, 3, 2], holidayTwoShift: true },
  { name: "평택설비운영센터", customer: "누리엔지니어링", kind: "4조2교대", sizes: [2, 2, 3, 3] },
  { name: "수원부품공장", customer: "푸른정밀", kind: "3조3교대", sizes: [2, 3, 2] },
  { name: "송도데이터센터", customer: "솔빛인프라", kind: "4조3교대", sizes: [3, 3, 3, 3] },
];

const sampleNames = [
  "김현우", "이도윤", "박서준", "최민서", "정하은", "강지호", "조수빈", "윤재현",
  "장서연", "임도현", "한지민", "오준서", "서예린", "신우진", "권다은", "황민재",
  "안서진", "송하준", "류예은", "전시우", "홍유진", "고지후", "문채원", "양건우",
  "손서윤", "배현준", "백나연", "허성민", "유지안", "남동현", "심예원", "노태준",
  "하소연", "곽정우", "성하린", "차민규", "주서현", "우지훈", "구다인", "민승우",
  "진보람", "지승현", "엄수연", "채도원", "원민정", "천재원", "방은서", "공태민",
  "강예지", "김성훈", "이채린", "박준영", "최소민", "정태윤", "조은우", "윤하영",
  "장민호", "임가은", "한준혁", "오수아", "서진우", "신소율", "권민석", "황다현",
  "안재민", "송예림", "류진호", "전하늘", "홍성우", "고유나", "문지혁", "양서희",
  "손태현", "배지은", "백도겸", "허예진", "유민찬", "남아린", "심주원", "노수정",
  "하승민", "곽다영", "성윤호", "차은채", "주영민", "우서영", "구현서", "민재윤",
  "진아영", "지호준", "엄지수", "채성준",
];

export async function seedOperationalScenarios({ page, isolatedRoot }) {
  if (!isolatedRoot) throw new Error("A newly created isolated review directory is required.");
  const expected = operationalSites.reduce((n, s) => n + s.sizes.reduce((a, b) => a + b, 0), 0);
  if (expected !== 92 || sampleNames.length !== expected || new Set(sampleNames).size !== expected) throw new Error("Scenario name/headcount contract failed.");
  return page.evaluate(async ({ sites, names, isolatedRoot }) => {
    const b = window.appBridge, model = window.__SCENARIO_MODEL;
    const take = (r, label) => { if (!r?.ok || r.data == null) throw new Error(`${label}: ${r?.message || "no result"}`); return r.data; };
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const settings = take(await b.getAppSettings(), "settings"), normalize = p => p.replaceAll("\\", "/").toLowerCase().replace(/\/$/, "");
    check(normalize(settings.databasePath).startsWith(normalize(isolatedRoot) + "/"), "Refusing to seed another database.");
    check(model?.prepareRosterEmployees && model?.generateSchedulePreview, "Actual schedule model must be supplied.");
    const initialSites = take(await b.listSites(), "initial sites"), initialPeople = take(await b.listEmployees(), "initial people");
    check(initialSites.length === 3 && initialPeople.length === 3 && take(await b.listMonthlySchedules(), "initial schedules").length === 0, "This seeder accepts a fresh default database only; repeated seeding is refused.");
    const activeStarter = initialPeople.find(e => e.employeeCode === "EMP-001");
    check(activeStarter?.status === "active" && activeStarter.name === names[0], "Unexpected starter identity.");
    // Existing leave/retirement records remain useful history, but must not add a hidden extra team member.
    for (const e of initialPeople.filter(e => e.status !== "active")) {
      const assignments = take(await b.listEmployeeAssignments(e.id), "starter history");
      for (const a of assignments.filter(a => a.status === "active")) take(await b.closeEmployeeAssignment({ assignmentId: a.id, endDate: "2026-03-31" }), "leave assignment end");
    }
    const holidays = take(await b.listHolidayCalendars(2026), "holidays");
    for (const [date, name] of [["2026-05-05", "어린이날"], ["2026-06-06", "현충일"]]) {
      if (!holidays.some(c => c.items.some(i => i.holidayDate === date))) take(await b.addHolidayItem({ year: 2026, holidayDate: date, name }), "sample public holiday");
    }
    const records = [];
    for (const s of sites) {
      const old = initialSites.find(x => x.name === s.name);
      const site = take(await b.saveSite({ id: old?.id, siteCode: old?.siteCode || "", name: s.name, customerName: s.customer, status: "active", timezone: "Asia/Seoul" }), "site " + s.name);
      records.push({ ...s, id: site.id, siteCode: site.siteCode, teams: s.sizes.map((_, i) => `${String.fromCharCode(65 + i)}조`), members: [], schedules: [] });
    }
    for (const s of records) {
      const two = s.kind === "4조2교대", threeTeams = s.kind === "3조3교대";
      const motif = two ? ["D", "D", "O", "O", "N", "N", "O", "O"] : threeTeams ? [...Array(6).fill("D"), "O", ...Array(6).fill("E"), "O", ...Array(6).fill("N"), "O"] : ["D", "E", "N", "O"];
      const times = two ? { D: ["07:00", "19:00", 120], N: ["19:00", "07:00", 120] } : { D: ["07:00", "15:00", 60], E: ["15:00", "23:00", 60], N: ["23:00", "07:00", 60] };
      const steps = motif.map((dutyCode, stepIndex) => ({ stepIndex, dutyCode, startTime: times[dutyCode]?.[0], endTime: times[dutyCode]?.[1], breakMinutes: times[dutyCode]?.[2] || 0 }));
      const teamIndexes = s.teams.map((teamLabel, i) => ({ teamLabel, index: i * (two ? 2 : threeTeams ? 7 : 1) }));
      const policy = { version: 1, rules: {} };
      if (threeTeams) policy.rules.public = { mode: "off", excludedDutyCodes: [] };
      if (s.holidayTwoShift) {
        const teamPatterns = Object.fromEntries(s.teams.map((t, i) => [t, Array.from({ length: 4 }, (_, j) => ["D", "N", "O", "O"][(j + i) % 4])]));
        const rule = { mode: "separate", excludedDutyCodes: [], startDate: "2026-01-01", teamPatterns, times: { D: { startTime: "08:00", endTime: "20:00", breakMinutes: 120 }, N: { startTime: "20:00", endTime: "08:00", breakMinutes: 120 } } };
        policy.rules = { saturday: rule, sunday: rule, public: rule };
      }
      const prior = take(await b.listShiftPatterns(s.id), "starter patterns");
      check(prior.length <= 1, "Unexpected pre-existing pattern versions.");
      s.patternIds = [];
      for (const year of [2025, 2026, 2027]) {
        const patternStartDate = threeTeams ? `${year}-01-${year === 2025 ? "06" : year === 2026 ? "05" : "04"}` : `${year}-01-01`;
        const definition = { id: year === 2025 ? prior[0]?.id : undefined, siteId: s.id, name: `${s.kind}${threeTeams ? " · 일요일/공휴일 휴무" : s.holidayTwoShift ? " · 휴일 2교대" : " · 연중 운영"} (${year}${year === 2027 ? "년 예정" : "년"})`, teamCount: s.teams.length, patternCode: motif.join("-"), startIndexRule: "manual", patternStartDate, effectiveFrom: `${year}-01-01`, status: "active", steps, teamIndexes, cycles: [{ cycleKey: "main", name: threeTeams ? "주6일 운영 · 일요일 휴무" : "기본 순환", order: 0, shiftCount: two ? 2 : 3, patternCode: motif.join("-"), patternStartDate, steps, teamIndexes }], teamCycleAssignments: s.teams.map(teamLabel => ({ teamLabel, cycleKey: "main" })), teamSettings: s.teams.map((teamLabel, sortOrder) => ({ teamLabel, displayName: teamLabel, workType: "ROTATING", isActive: true, sortOrder })), teamCapacities: s.teams.map((teamLabel, i) => ({ teamLabel, maxHeadcount: s.sizes[i] })), dutyTypes: [...Object.entries(times).map(([code, t], sortOrder) => ({ id: "duty-" + code, kind: "work", label: { D: "주간", E: "석간", N: "야간" }[code], sortOrder, startTime: t[0], endTime: t[1], breakMinutes: t[2] })), { id: "duty-O", kind: "off", label: "휴무", sortOrder: 3 }], holidayPolicy: policy, poolEnabled: false };
        const saved = take(await b.saveShiftPattern(definition), "pattern " + s.name + year);
        s.patternIds.push(saved.id); if (year === 2026) s.patternId = saved.id;
      }
      s.operation = threeTeams ? "월~토 24시간 · 일요일/공휴일 휴무" : s.holidayTwoShift ? "평일 3교대 · 토/일/공휴일 2교대" : "연중 24시간";
    }
    let index = 0;
    for (let siteIndex = 0; siteIndex < records.length; siteIndex++) {
      const s = records[siteIndex];
      for (let teamIndex = 0; teamIndex < s.teams.length; teamIndex++) for (let member = 0; member < s.sizes[teamIndex]; member++) {
        const starter = index === 0, hireDate = starter ? activeStarter.hireDate : `${2022 + index % 3}-${String(index % 12 + 1).padStart(2, "0")}-01`, baseRate = starter ? 12800 : 11600 + (siteIndex % 4) * 200 + (member === 0 ? 500 : 0);
        const emp = take(await b.saveEmployee({ id: starter ? activeStarter.id : undefined, employeeCode: starter ? activeStarter.employeeCode : `EMP-${1000 + index}`, name: names[index], contact: `010-0000-${String(2000 + index)}`, email: `staff${String(index + 1).padStart(3, "0")}@example.invalid`, rank: member === 0 ? ["대리", "과장", "대리"][teamIndex % 3] : "사원", employmentType: index % 7 === 0 ? "계약" : "정규", status: "active", hireDate, hourlyRate: starter ? undefined : baseRate }), "employee " + names[index]);
        for (const [effectiveFrom, hourlyRate] of [["2026-01-01", baseRate + 400], ["2027-01-01", baseRate + 800]]) take(await b.saveEmployeeWageRate({ employeeId: emp.id, hourlyRate, effectiveFrom, reason: effectiveFrom.startsWith("2027") ? "다음 연도 시급 개정 예정(가상)" : "연간 시급 개정(가상)" }), "wage history");
        s.members.push({ id: emp.id, employeeCode: emp.employeeCode, name: emp.name, team: s.teams[teamIndex], index, sortOrder: member }); index++;
      }
    }
    // Close historical postings before filling current teams: the existing API checks active capacity.
    for (let siteIndex = 0; siteIndex < records.length; siteIndex++) for (const emp of records[siteIndex].members.filter(e => e.index > 0 && e.index % 8 === 0)) {
      const previous = take(await b.saveEmployeeAssignment({ employeeId: emp.id, siteId: records[(siteIndex + 9) % 10].id, shiftGroup: "A조", startDate: "2025-01-01", sortOrder: emp.index }), "previous assignment");
      take(await b.closeEmployeeAssignment({ assignmentId: previous.id, endDate: "2025-12-31" }), "close previous assignment");
    }
    for (const s of records) for (const emp of s.members.filter(e => e.index > 0)) take(await b.saveEmployeeAssignment({ employeeId: emp.id, siteId: s.id, shiftGroup: emp.team, startDate: "2026-01-01", sortOrder: emp.sortOrder }), "current assignment");
    const people = take(await b.listEmployees(), "all people"), patterns = take(await b.listShiftPatterns(), "all patterns"), context = take(await b.getSchedulePreparationContext(2026), "shared holiday preparation");
    const assignmentMap = new Map();
    for (const e of people) assignmentMap.set(e.id, take(await b.listEmployeeAssignments(e.id), "assignment verification"));
    let exports = 0, published = 0;
    for (const s of records) for (const month of ["2026-04", "2026-05", "2026-06"]) {
      const roster = await model.prepareRosterEmployees(people, month, s.id, async id => assignmentMap.get(id));
      check(!roster.fatalIssues.length, `${s.name} roster: ${roster.fatalIssues.join(",")}`);
      const preview = model.generateSchedulePreview(patterns.filter(p => p.siteId === s.id), roster.rosterEmployees, month, context.publicHolidayDates, context.warningSettings);
      check(!preview.fatalIssues.length, `${s.name} preview: ${preview.fatalIssues.join(",")}`);
      check(preview.rows.length === s.members.length, `${s.name}: unexpected extra/missing member`);
      check(preview.items.length === s.members.length * preview.dates.length, `${s.name}: incomplete full-month schedule`);
      for (const date of preview.dates) {
        const daily = preview.items.filter(i => i.workDate === date), groupDuties = new Map();
        for (const team of s.teams) {
          const members = daily.filter(i => i.teamLabel === team);
          check(members.length === s.sizes[s.teams.indexOf(team)], `${s.name} ${date}: team headcount`);
          check(new Set(members.map(i => i.dutyCode)).size === 1, `${s.name}: inconsistent team duties`);
          groupDuties.set(team, members[0].dutyCode);
        }
        const dow = new Date(date + "T12:00:00Z").getUTCDay(), holiday = context.publicHolidayDates.includes(date), closed = s.kind === "3조3교대" && (dow === 0 || holiday), two = s.kind === "4조2교대" || (s.holidayTwoShift && (holiday || dow === 0 || dow === 6));
        const codes = [...groupDuties.values()].filter(c => !["O", "OFF", "X"].includes(c)).sort();
        check(JSON.stringify(codes) === JSON.stringify(closed ? [] : two ? ["D", "N"] : ["D", "E", "N"]), `${s.name} ${date}: incomplete/duplicated shift coverage (${codes})`);
      }
      const saved = take(await b.saveMonthlySchedule({ siteId: s.id, scheduleMonth: month, patternId: preview.pattern.id, generatedBy: "운영 시나리오", items: preview.items }), "save full monthly schedule");
      const normalizeItem = i => [i.employeeCode, i.teamLabel, i.workDate, i.dutyCode, i.startTime || "", i.endTime || "", i.breakMinutes].join("|");
      check(JSON.stringify(saved.items.map(normalizeItem).sort()) === JSON.stringify(preview.items.map(normalizeItem).sort()), `${s.name}: saved schedule differs from actual generator`);
      s.schedules.push({ id: saved.id, month, items: saved.items.length, warnings: preview.warnings.length });
      if (month !== "2026-06") {
        const exp = take(await b.exportMonthlySchedulePlan(saved.id), "export real monthly schedule"); exports++;
        if (month === "2026-04") { const pub = take(await b.publishSchedulePlanExport(exp.id), "publish previous month"); published++; await window.__scenarioVerifyFile({ outputPath: exp.outputPath, publishedPath: pub.publishedPath }); }
        else await window.__scenarioVerifyFile({ outputPath: exp.outputPath });
      }
    }
    const finalSites = take(await b.listSites(), "final sites"), active = people.filter(e => e.status === "active");
    check(finalSites.length === 10 && new Set(finalSites.map(s => s.name)).size === 10, "Exactly10 distinct worksites required.");
    check(active.length === 92 && people.length === 94 && new Set(people.map(e => e.name)).size === people.length, "Names/headcounts must be realistic and distinct.");
    return { sites: records, activePeople: active.length, totalPeople: people.length, onLeave: people.filter(e => e.status === "leave").length, retired: people.filter(e => e.status === "retired").length, schedules: records.reduce((n, s) => n + s.schedules.length, 0), exports, published, publicHolidayDates: context.publicHolidayDates, databasePath: settings.databasePath, verified: true };
  }, { sites: operationalSites, names: sampleNames, isolatedRoot });
}
