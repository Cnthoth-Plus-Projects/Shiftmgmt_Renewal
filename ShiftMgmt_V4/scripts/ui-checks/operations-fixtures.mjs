// 운영 관리 UI 검증용 TEMP 격리 55개 픽스처 생성기 (HANDOFF §6)
import fs from "node:fs";
import path from "node:path";

export async function seedOperationsFixtures({ page, resourcesDir }) {
  // 1. 브라우저 컨텍스트에서 window.appBridge를 통해 55개 데이터 생성
  const browserResults = await page.evaluate(async () => {
    const b = window.appBridge;
    const settings = await b.getAppSettings();
    if (!settings.ok || !(await b.saveAppSettings(settings.data)).ok) throw new Error("Fixture settings initialization failed");
    const res = {
      usersCount: 0,
      siteNamesCount: 0,
      holidaysCount: 0,
      rateVersionsCount: 0,
      layoutHistoryCount: 0,
      releasesCount: 0
    };

    // 1-1. 사용자 55개
    for (let i = 1; i <= 55; i++) {
      const num = String(i).padStart(2, "0");
      const role = i % 3 === 0 ? "reviewer" : i % 2 === 0 ? "planner" : "operator";
      const r = await b.saveOperationUser({
        loginId: `opuser${num}`,
        displayName: `시험사용자${num}`,
        role,
        status: "active",
        contact: `010-8888-${num}00`,
        email: `opuser${num}@test.local`,
        password: `Password${num}!@#`
      });
      if (r.ok) res.usersCount++;
    }

    // 1-2. 근무지 이름 55개 맞춤
    const existingSites = await b.listSiteNameOptions();
    const existingCount = (existingSites.ok && existingSites.data) ? existingSites.data.length : 0;
    const targetCount = 55;
    for (let i = 1; i <= Math.max(0, targetCount - existingCount); i++) {
      const num = String(i).padStart(2, "0");
      const r = await b.saveSiteNameOption({ name: `시험근무지_${num}` });
      if (r.ok) res.siteNamesCount++;
    }
    res.siteNamesCount += existingCount;

    // 1-3. 공휴일 55개
    let curM = 1;
    let curD = 2;
    for (let i = 1; i <= 55; i++) {
      const num = String(i).padStart(2, "0");
      const dStr = `2026-${String(curM).padStart(2, "0")}-${String(curD).padStart(2, "0")}`;
      const r = await b.addHolidayItem({
        year: 2026,
        holidayDate: dStr,
        name: `시험공휴일_${num}`,
        isSubstitute: i % 5 === 0
      });
      if (r.ok) res.holidaysCount++;
      curD++;
      if (curD > 28) {
        curD = 1;
        curM++;
      }
    }

    // 1-4. 요율 버전 55개
    for (let i = 1; i <= 55; i++) {
      const num = String(i).padStart(2, "0");
      const r = await b.saveAllowanceRateVersion({
        year: 2026,
        versionLabel: `시험요율_v${num}`,
        status: "draft",
        effectiveFrom: "2026-01-01",
        changeReason: `시험용 55개 요율 버전 등록 #${num}`,
        items: []
      });
      if (r.ok) res.rateVersionsCount++;
    }

    // 1-5. 양식 이력 55개
    const snap = await b.getDocumentLayout({ documentKind: "schedule-xlsx", variant: "template1" });
    if (snap.ok && snap.data) {
      let expRev = snap.data.activeRevisionId;
      const def = snap.data.definition;
      for (let i = 1; i <= 55; i++) {
        const num = String(i).padStart(2, "0");
        const sr = await b.saveDocumentLayout({
          definition: def,
          expectedRevisionId: expRev,
          changeReason: `시험용 양식 이력 #${num}`
        });
        if (sr.ok) {
          expRev = sr.data?.activeRevisionId || null;
          res.layoutHistoryCount++;
        }
      }
    }

    const otherLayoutKeys = [{documentKind:'schedule-xlsx',variant:'template2'},...['proposal-xlsx','attachment1-xlsx','attachment2-xlsx','proposal-pdf','dashboard-report-pdf'].map(documentKind=>({documentKind}))];
    for (const key of otherLayoutKeys) {
      let current=await b.getDocumentLayout(key);if(!current.ok)throw new Error('Layout fixture read failed');
      for(let i=0;i<3;i++) {current=await b.saveDocumentLayout({definition:current.data.definition,expectedRevisionId:current.data.activeRevisionId,changeReason:`시험용 이력 ${i+1}`});if(!current.ok)throw new Error('Layout fixture write failed');}
    }
    return res;
  });

  // 2. 릴리즈 manifest 55개 파일 생성 (TEMP resourcesPath/release-history)
  if (resourcesDir) {
    const relHistDir = path.join(resourcesDir, "release-history");
    fs.mkdirSync(relHistDir, { recursive: true });

    for (let i = 1; i <= 55; i++) {
      const num = String(i).padStart(2, "0");
      const vStr = `4.1.${i}`;
      const manifest = {
        version: vStr,
        required: i % 4 === 0,
        headline: `시험용 릴리즈 ${vStr} 업데이트`,
        summary: `운영 관리 테스트를 위한 시험용 릴리즈 manifest #${num}`,
        notes: [
          `테스트 항목 1: 버전 ${vStr} 기능 점검`,
          `테스트 항목 2: 안정성 개선 #${num}`
        ],
        sections: [
          {
            title: "주요 변경점",
            items: [{ title: `운영 모듈 최적화 #${num}`, detail: "세부 성능 개선" }],
            tables: [
              {
                title: "영향 테이블",
                columns: ["테이블명", "변경유형"],
                rows: [["operations_log", "인덱스 추가"]]
              }
            ]
          }
        ],
        requiresDbBackup: i % 3 === 0,
        publishedAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`
      };

      const vSubDir = path.join(relHistDir, `v${vStr}`);
      fs.mkdirSync(vSubDir, { recursive: true });
      fs.writeFileSync(
        path.join(vSubDir, "RELEASE_MANIFEST.json"),
        JSON.stringify(manifest, null, 2),
        "utf8"
      );
      browserResults.releasesCount++;
    }
  }

  return browserResults;
}
