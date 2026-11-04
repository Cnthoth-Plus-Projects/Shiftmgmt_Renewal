// 근무표 생성·조회·엑셀·게시 UI 검증용 TEMP 격리 55+직원/55+이력/5+게시 픽스처 생성기 (HANDOFF R14)
export async function seedScheduleFixtures({ page, resourcesDir }) {
  const browserResults = await page.evaluate(async () => {
    const b = window.appBridge;
    const take = (r, label) => {
      if (!r.ok) throw new Error(label + ": " + (r.message || "failed"));
      return r.data;
    };

    const settings = take(await b.getAppSettings(), "settings");
    take(await b.saveAppSettings({ ...settings, scheduleConsecutiveNightLimit: 1, scheduleMinimumRestMinutes: 900, scheduleRequireWeeklyHoliday: true, scheduleWeeklyMaxMinutes: 1800 }), "non-default warnings");
    const holidays = take(await b.listHolidayCalendars(2026), "fixture holidays");
    if (!holidays.some(c => c.items.some(i => i.holidayDate === "2026-05-05"))) take(await b.addHolidayItem({ year: 2026, holidayDate: "2026-05-05", name: "어린이날" }), "holiday");
    // 1. 기본 사이트 확인
    const initialSites = take(await b.listSites(), "listSites");

    // 2. 주요 근무지 확보 (새 고유 사이트 생성)
    const mainSite = take(
      await b.saveSite({
        name: "UI-04 표준 데이터센터 관제사업소",
        customerName: "알파시큐리티",
        timezone: "Asia/Seoul",
        status: "active",
      }),
      "create main site",
    );

    // 보조 근무지 1개 추가
    let subSite = initialSites.find((s) => s.id !== mainSite.id && s.status === "active");
    if (!subSite) {
      subSite = take(
        await b.saveSite({
          name: "영남 물류관제센터",
          customerName: "베타로지스",
          timezone: "Asia/Seoul",
          status: "active",
        }),
        "create sub site",
      );
    }

    // 3. 주요 근무지에 4조2교대 패턴 등록 (sites-fixtures의 표준 검증 패턴 구조 적용)
    const teams = ["A조", "B조", "C조", "D조"];
    const steps = [
      { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 120 },
      { stepIndex: 2, dutyCode: "O", breakMinutes: 0 },
      { stepIndex: 3, dutyCode: "OFF", breakMinutes: 0 },
    ];
    const indexes = teams.map((teamLabel, index) => ({ teamLabel, index }));

    const mainPattern = take(
      await b.saveShiftPattern({
        siteId: mainSite.id,
        name: "데이터센터 4조2교대 표준안",
        teamCount: 4,
        patternCode: "D-N-O-OFF",
        startIndexRule: "manual",
        patternStartDate: "2025-01-01",
        effectiveFrom: "2025-01-01",
        status: "active",
        steps,
        teamIndexes: indexes,
        cycles: [
          {
            cycleKey: "cycle-main",
            name: "기본 순환",
            order: 0,
            shiftCount: 2,
            patternCode: "D-N-O-OFF",
            patternStartDate: "2025-01-01",
            steps,
            teamIndexes: indexes,
          },
        ],
        teamCycleAssignments: teams.map((teamLabel) => ({ teamLabel, cycleKey: "cycle-main" })),
        teamCapacities: teams.map((teamLabel) => ({ teamLabel, maxHeadcount: 14 })),
        teamSettings: teams.map((teamLabel, sortOrder) => ({
          teamLabel,
          displayName: teamLabel,
          workType: "ROTATING",
          isActive: true,
          sortOrder,
        })),
        dutyTypes: [
          { id: "duty-D", code: "D", label: "주간", kind: "work", sortOrder: 0, startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
          { id: "duty-N", code: "N", label: "야간", kind: "work", sortOrder: 1, startTime: "19:00", endTime: "07:00", breakMinutes: 120 },
          { id: "duty-O", code: "O", label: "비번", kind: "off", sortOrder: 2 },
          { id: "duty-OFF", code: "OFF", label: "휴무", kind: "off", sortOrder: 3 },
        ],
      }),
      "create pattern for main site",
    );

    // 4. 주요 근무지에 56명 직원 생성 및 배정 (4개 조에 각 14명씩 균등 배정)
    // 직급은 허용된 사원/대리/과장/차장/부장만 사용 (UI04-D07 요구사항)
    const allowedRanks = ["사원", "대리", "과장", "차장", "부장"];
    const familyNames = ["김", "이", "박", "최", "정", "강", "조", "윤"];
    const givenNames = ["민준", "서연", "지호", "수빈", "도윤", "하린", "유진"];
    const targetEmployees = [];
    for (let i = 0; i < 56; i++) {
      const idx = i + 1;
      const num = String(idx).padStart(3, "0");
      const team = teams[i % 4];
      const rank = allowedRanks[i % allowedRanks.length];
      const name = `${familyNames[i % familyNames.length]}${givenNames[Math.floor(i / familyNames.length)]}`;

      const emp = take(
        await b.saveEmployee({
          employeeCode: `EMP${num}`,
          name,
          role: "worker",
          rank,
          status: "active",
          employmentType: i % 5 === 0 ? "BP" : "정규",
          hireDate: "2025-01-01",
          contact: `010-1234-${num}0`,
          email: `emp${num}@test.local`,
        }),
        `create employee ${num}`,
      );

      // 사이트 배정
      take(
        await b.saveEmployeeAssignment({
          employeeId: emp.id,
          siteId: mainSite.id,
          shiftGroup: team,
          startDate: "2025-01-01",
          sortOrder: Math.floor(i / 4),
        }),
        `assign employee ${num} to ${team}`,
      );

      targetEmployees.push({ ...emp, shiftGroup: team, sortOrder: Math.floor(i / 4) });
    }

    // 5. 55개 이상 저장 근무표 및 엑셀 생성 이력, 5개 이상 게시 픽스처 생성
    const targetMonth = "2026-05";
    const sampleItems = [];
    for (let day = 1; day <= 31; day++) {
      const dStr = `${targetMonth}-${String(day).padStart(2, "0")}`;
      for (let i = 0; i < targetEmployees.length; i++) {
        const emp = targetEmployees[i];
        const team = emp.shiftGroup;
        const duty = (day + (i % 4)) % 4 === 0 ? "O" : (day + (i % 4)) % 4 === 1 ? "D" : (day + (i % 4)) % 4 === 2 ? "N" : "OFF";
        sampleItems.push({
          employeeCode: emp.employeeCode,
          teamLabel: team,
          sortOrder: emp.sortOrder,
          workDate: dStr,
          dutyCode: duty,
          startTime: duty === "D" ? "07:00" : duty === "N" ? "19:00" : undefined,
          endTime: duty === "D" ? "19:00" : duty === "N" ? "07:00" : undefined,
          breakMinutes: duty === "O" || duty === "OFF" ? 0 : 60,
        });
      }
    }

    // 메인 대상월 근무표 저장
    const mainSchedule = take(
      await b.saveMonthlySchedule({
        siteId: mainSite.id,
        scheduleMonth: targetMonth,
        patternId: mainPattern.id,
        generatedBy: "시스템관리자(admin)",
        items: sampleItems,
      }),
      "save main 2026-05 schedule",
    );

    const representativePreview = take(await b.previewMonthlySchedulePlan(mainSchedule.id), "representative preview");
    const representativeExport = take(await b.exportMonthlySchedulePlan(mainSchedule.id), "representative export");
    const representativePublished = take(await b.publishSchedulePlanExport(representativeExport.id), "representative publish");
    if (typeof window.__ui04VerifyRepresentative !== "function") throw new Error("representative file verifier missing");
    await window.__ui04VerifyRepresentative({ preview: representativePreview, record: representativePublished });
    // 55개 이력 생성 (배치)
    let publishedCount = 0;
    const totalTarget = 56;
    for (let i = 1; i <= totalTarget; i++) {
      const m = ((i % 12) + 1);
      const mStr = `2026-${String(m).padStart(2, "0")}`;
      const miniItems = [
        {
          employeeCode: targetEmployees[0].employeeCode,
          teamLabel: "A조",
          sortOrder: 0,
          workDate: `${mStr}-01`,
          dutyCode: "D",
          startTime: "07:00",
          endTime: "19:00",
          breakMinutes: 60,
        },
      ];
      const sched = take(
        await b.saveMonthlySchedule({
          siteId: mainSite.id,
          scheduleMonth: mStr,
          patternId: mainPattern.id,
          generatedBy: i % 2 === 0 ? "플래너A" : "관리자B",
          items: miniItems,
        }),
        `save schedule batch ${i}`,
      );

      const prev = take(await b.previewMonthlySchedulePlan(sched.id), `preview ${sched.id}`);
      if (prev) {
        const exp = take(await b.exportMonthlySchedulePlan(sched.id), `export ${sched.id}`);
        if (exp) {
          // 최소 5개 이상 게시(publish)
          if (publishedCount < 6 && (i % 2 === 1 || i <= 5)) {
            const pub = take(await b.publishSchedulePlanExport(exp.id), `publish ${exp.id}`);
            if (pub) publishedCount++;
          }
        }
      }
    }

    const finalSchedules = take(await b.listMonthlySchedules(), "final listMonthlySchedules");
    const finalExports = take(await b.listSchedulePlanExports(), "final listSchedulePlanExports");
    const finalEmps = take(await b.listEmployees(), "final listEmployees");

    return {
      expectedContext: { exportDirectory: settings.scheduleExportDir, publishDirectory: settings.approvedDir, warningSettings: { consecutiveNightLimit: 1, minimumRestMinutes: 900, requireWeeklyHoliday: true, weeklyMaxMinutes: 1800 } },
      mainPatternId: mainPattern.id,
      mainEmployeeIds: targetEmployees.map(e => e.id),
      mainEmployeeCodes: targetEmployees.map(e => e.employeeCode),
      mainSiteId: mainSite.id,
      mainSiteName: mainSite.name,
      subSiteId: subSite.id,
      mainScheduleId: mainSchedule.id,
      targetMonth,
      employeeCount: finalEmps.length,
      scheduleCount: finalSchedules.length,
      exportCount: finalExports.length,
      publishedCount,
      verified: finalEmps.length >= 55 && finalExports.length >= 55 && publishedCount >= 5,
    };
  });

  return browserResults;
}
