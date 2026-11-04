import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { seedPerformanceFixtures } from "./performance-fixtures.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * 수당 관리 UI 검증용 TEMP 격리 픽스처 생성기 (HANDOFF R16 / UI-06 §6.2)
 * - operational-scenarios.mjs 실행 -> 10개 근무지, 92명 인력, 2026-04/05/06 근무표 배포
 * - performance-fixtures.mjs 실행 -> 2026-05 회수 실적, 과거 재승인 대체 버전, Pool(P) 미지급 사례 생성
 * - 실제 배포된 2026-04 근무표 엑셀 10개 + 2026-05 추가 연장 행 기입 -> 최신 계산 55건 이상(2026-05 단독 55건 이상 + 2026-04 포함 총 85건 이상, 10개 사이트, 2개 월, 상태 4종, 정규/조기) 생성
 * - 정상 API 개별 검토 처리로 검토 이력(approvalHistory) 55건 이상 확보
 * - 직급 미입력 인원(rankMissing) 및 사후 시급 개정(forward-only 보존) 검증 대상 확보
 */
export async function seedAllowanceFixtures({ page, isolatedRoot }) {
  const { seedOperationalScenarios } = await import(
    pathToFileURL(path.resolve(repoRoot, "scripts/ui-checks/operational-scenarios.mjs")).href
  );
  await seedOperationalScenarios({ page, isolatedRoot });

  await seedPerformanceFixtures({ page, isolatedRoot });

  const prep = await page.evaluate(async () => {
    const b = window.appBridge;
    const take = (r, label) => {
      if (!r?.ok || r.data == null) throw new Error(`${label}: ${r?.message || "failed"}`);
      return r.data;
    };
    const settings = take(await b.getAppSettings(), "settings");
    const employees = take(await b.listEmployees(), "listEmployees");
    const sites = take(await b.listSites(), "listSites");
    const exports = take(await b.listSchedulePlanExports(), "listSchedulePlanExports");
    const schedules = take(await b.listMonthlySchedules(), "listMonthlySchedules");
    return { settings, employees, sites, exports, schedules };
  });

  const { settings, employees, sites, exports, schedules } = prep;
  const pendingDir = settings.pendingDir;
  fs.mkdirSync(pendingDir, { recursive: true });

  const siteIdByName = new Map(sites.map(s => [s.name, s.id]));
  const employeesBySiteId = new Map();
  for (const emp of employees) {
    const sId = emp.currentSiteId || emp.siteId;
    if (!sId) continue;
    const list = employeesBySiteId.get(sId) || [];
    list.push(emp);
    employeesBySiteId.set(sId, list);
  }

  // 1) 2026-05 미승인 사업소(index 4..9) 회수 파일에 연장근무 3건씩 추가하여 2026-05 단일 월만으로도 55건 이상 보장
  const exports05 = exports.filter(e => e.scheduleMonth === "2026-05");
  for (let idx = 4; idx < Math.min(10, exports05.length); idx++) {
    const exp = exports05[idx];
    const siteId = siteIdByName.get(exp.siteName) || "";
    const siteEmps = employeesBySiteId.get(siteId) || employees;
    const pendingPath = path.join(pendingDir, `2026_05_${exp.siteName}.xlsx`);
    const sourcePath = fs.existsSync(pendingPath) ? pendingPath : exp.outputPath;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(sourcePath);
    const ws = wb.getWorksheet("교대 근무 계획표") ?? wb.worksheets[0];

    const extraRows = [
      { row: 36, date: "2026-05-14", sh: 18, eh: 21, emp: siteEmps[0], desc: "5월 중순 정기 점검 연장" },
      { row: 37, date: "2026-05-22", sh: 19, eh: 22, emp: siteEmps[1] || siteEmps[0], desc: "5월 야간 설비 보강 연장" },
      { row: 38, date: "2026-05-27", sh: 18, eh: 22, emp: siteEmps[2] || siteEmps[0], desc: "5월 말 마감 정산 연장" },
    ];
    for (const r of extraRows) {
      ws.getCell(`BA${r.row}`).value = r.date;
      ws.getCell(`BC${r.row}`).value = r.sh;
      ws.getCell(`BD${r.row}`).value = 0;
      ws.getCell(`BE${r.row}`).value = r.eh;
      ws.getCell(`BF${r.row}`).value = 0;
      ws.getCell(`BG${r.row}`).value = r.emp.name;
      ws.getCell(`BH${r.row}`).value = r.desc;
      ws.getCell(`BJ${r.row}`).value = "작업 확인서";
    }
    await wb.xlsx.writeFile(pendingPath);
  }

  // 2) 실제 배포된 2026-04 근무표 엑셀 10개 전체에 회수 실적(대체 1 + 연장 2) 기입 -> 10개 근무지 모두 포함 및 2개 월 보장
  const exports04 = exports.filter(e => e.scheduleMonth === "2026-04");
  for (const exp of exports04) {
    const siteId = siteIdByName.get(exp.siteName) || "";
    const siteEmps = employeesBySiteId.get(siteId) || employees;
    if (siteEmps.length === 0) continue;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(exp.outputPath);
    const ws = wb.getWorksheet("교대 근무 계획표") ?? wb.worksheets[0];

    const e1 = siteEmps[0];
    const e2 = siteEmps[1] || siteEmps[0];
    const schedule04 = schedules.find(
      s => s.siteId === siteId && s.scheduleMonth === "2026-04"
    );
    const workedItem = schedule04?.items.find(
      i =>
        i.employeeCode === e1.employeeCode &&
        i.startTime &&
        i.endTime &&
        !["O", "OFF", "X"].includes(i.dutyCode)
    );

    if (workedItem && e2.employeeCode !== e1.employeeCode) {
      ws.getCell("BA11").value = workedItem.workDate;
      ws.getCell("BC11").value = e1.name;
      ws.getCell("BE11").value = e2.name;
      ws.getCell("BG11").value = "4월 정기 교육 대체";
      ws.getCell("BJ11").value = "교육 수료증";
    }

    ws.getCell("BA34").value = "2026-04-10";
    ws.getCell("BC34").value = 18;
    ws.getCell("BD34").value = 0;
    ws.getCell("BE34").value = 22;
    ws.getCell("BF34").value = 0;
    ws.getCell("BG34").value = e1.name;
    ws.getCell("BH34").value = "4월 분기 설비 정기점검 연장";
    ws.getCell("BJ34").value = "점검 일지";

    ws.getCell("BA35").value = "2026-04-21";
    ws.getCell("BC35").value = 19;
    ws.getCell("BD35").value = 0;
    ws.getCell("BE35").value = 22;
    ws.getCell("BF35").value = 0;
    ws.getCell("BG35").value = e2.name;
    ws.getCell("BH35").value = "4월 보안 패치 야간 지원";
    ws.getCell("BJ35").value = "보안 작업서";

    const outPath04 = path.join(pendingDir, `2026_04_${exp.siteName}.xlsx`);
    await wb.xlsx.writeFile(outPath04);
  }

  // 3) 브라우저에서 정상 인테이크 -> 실적 행 승인 -> 수당 검토 배분(검토 이력 55건 이상) -> 조기지급일 -> 직급미설정/시급개정 준비
  const summary = await page.evaluate(async () => {
    const b = window.appBridge;
    const take = (r, label) => {
      if (!r?.ok || r.data == null) throw new Error(`${label}: ${r?.message || "failed"}`);
      return r.data;
    };

    take(
      await b.listPerformanceOverview({ scheduleMonth: "2026-05", forceReparse: true }),
      "reparse 2026-05"
    );
    const ov05 = take(
      await b.listPerformanceOverview({ scheduleMonth: "2026-05", approvalScope: "pending" }),
      "pending 2026-05"
    );
    for (const r of ov05.groups.flatMap(g => g.rows)) {
      if (r.canApprove) {
        await b.approvePendingFile({
          fileId: r.fileId,
          entryId: r.entryId,
          expectedPolicyFingerprint: r.entry?.appliedPolicies?.fingerprint,
          comment: "수당 관리 픽스처 2026-05 정상 실적 승인",
        });
      }
    }

    // S14 직급 미설정(rankMissing) 시나리오 준비: 2026-04 실적 승인 전에 2026-04 대상 직원 1명의 rank를 해제해
    // 계산 레코드 스냅샷과 인력 마스터 양쪽 모두 직급 미설정 상태가 되도록 구성 (2026-05 기산출 건에는 영향 없음)
    const ov04Init = take(
      await b.listPerformanceOverview({ scheduleMonth: "2026-04", forceReparse: true }),
      "reparse 2026-04 initial"
    );
    const allPeopleBefore04 = take(await b.listEmployees(), "listEmployees before 04 approve");
    let clearedRankEmpCode = null;
    for (const r of ov04Init.groups.flatMap(g => g.rows)) {
      if (!r.canApprove) continue;
      const entryCode = r.entry?.employeeCode || r.employeeCode;
      const entryName = r.entry?.employeeName || r.employeeName;
      const emp = allPeopleBefore04.find(
        p => (entryCode && p.employeeCode === entryCode) || (entryName && p.name === entryName)
      );
      if (emp) {
        const savedEmp = await b.saveEmployee({
          id: emp.id,
          employeeCode: emp.employeeCode,
          name: emp.name,
          contact: emp.contact,
          email: emp.email,
          rank: undefined,
          employmentType: emp.employmentType,
          status: emp.status,
          hireDate: emp.hireDate,
        });
        if (savedEmp.ok && !savedEmp.data?.rank) {
          clearedRankEmpCode = emp.employeeCode;
          break;
        }
      }
    }

    const ov04 = take(
      await b.listPerformanceOverview({
        scheduleMonth: "2026-04",
        approvalScope: "pending",
        forceReparse: true,
      }),
      "pending 2026-04 after rank clear"
    );
    for (const r of ov04.groups.flatMap(g => g.rows)) {
      if (r.canApprove) {
        await b.approvePendingFile({
          fileId: r.fileId,
          entryId: r.entryId,
          expectedPolicyFingerprint: r.entry?.appliedPolicies?.fingerprint,
          comment: "수당 관리 픽스처 2026-04 정상 실적 승인",
        });
      }
    }

    const allCalcs = take(await b.listCalculationResults(), "listCalculationResults");
    const calcs05Pending = allCalcs.filter(
      c => c.workDate.startsWith("2026-05") && c.status === "pending"
    );
    const calcs04Pending = allCalcs.filter(
      c => c.workDate.startsWith("2026-04") && c.status === "pending"
    );

    // 2026-05: 24건 개별 승인 + 5건 개별 반려 (나머지 25건+ pending 유지)
    const approve05Targets = calcs05Pending.slice(0, 24);
    for (const c of approve05Targets) {
      take(
        await b.reviewAllowanceCalculations({
          calculationIds: [c.id],
          decision: "approved",
          comment: `2026-05 정기 수당 개별 검토 승인 (${c.siteName})`,
          syncPerformanceSiteReject: false,
        }),
        "individual approve 05"
      );
    }

    const reject05Targets = calcs05Pending.slice(24, 29);
    for (const c of reject05Targets) {
      take(
        await b.reviewAllowanceCalculations({
          calculationIds: [c.id],
          decision: "rejected",
          comment: `2026-05 증빙 보완 요청 반려 (${c.siteName})`,
          syncPerformanceSiteReject: false,
        }),
        "individual reject 05"
      );
    }

    // 2026-04: 직급 미설정 건을 우선 포함해 22건 개별 승인 + 5건 개별 반려 -> 총 검토 이력 58건 이상 확보
    const rankMissingPending04 = calcs04Pending.find(
      c => (clearedRankEmpCode && c.employeeCode === clearedRankEmpCode) || !c.employeeRank
    );
    const ordered04 = rankMissingPending04
      ? [rankMissingPending04, ...calcs04Pending.filter(c => c.id !== rankMissingPending04.id)]
      : calcs04Pending;
    const approve04Targets = ordered04.slice(0, 22);
    for (const c of approve04Targets) {
      take(
        await b.reviewAllowanceCalculations({
          calculationIds: [c.id],
          decision: "approved",
          comment: `2026-04 정기 수당 개별 검토 승인 (${c.siteName})`,
          syncPerformanceSiteReject: false,
        }),
        "individual approve 04"
      );
    }

    const reject04Targets = ordered04.slice(22, 27);
    for (const c of reject04Targets) {
      take(
        await b.reviewAllowanceCalculations({
          calculationIds: [c.id],
          decision: "rejected",
          comment: `2026-04 시간 확인 반려 (${c.siteName})`,
          syncPerformanceSiteReject: false,
        }),
        "individual reject 04"
      );
    }

    // 조기지급일 지정 (2026-05 approved 중 앞 3건)
    for (const ec of approve05Targets.slice(0, 3)) {
      take(
        await b.setCalculationEarlyPayout({
          calculationId: ec.id,
          earlyPayoutDate: "2026-05-15",
        }),
        "set early payout"
      );
    }

    // 직급 미설정(rankMissing) 시나리오(S14) 대상 확정
    const allPeople = take(await b.listEmployees(), "listEmployees after approve");
    const rankCandidateCalc =
      approve04Targets.find(
        c => (clearedRankEmpCode && c.employeeCode === clearedRankEmpCode) || !c.employeeRank
      ) || null;
    const rankMissingCalcId = rankCandidateCalc ? rankCandidateCalc.id : null;
    const rankMissingEmployeeName = rankCandidateCalc ? rankCandidateCalc.employeeName : null;

    // Forward-only 시급 보존 시나리오(S06/N07)용: 기저장 계산이 있는 직원 1명의 시급을 사후 인상해도 기존 snapshot 불변 확인
    let forwardOnlyCalcId = null;
    let savedSnapshotHourlyRate = null;
    let updatedCurrentHourlyRate = null;
    const rateCandidateCalc = approve05Targets[5];
    if (rateCandidateCalc) {
      const emp = allPeople.find(p => p.employeeCode === rateCandidateCalc.employeeCode);
      if (emp) {
        savedSnapshotHourlyRate = rateCandidateCalc.hourlyRate;
        updatedCurrentHourlyRate = savedSnapshotHourlyRate + 2300;
        take(
          await b.saveEmployeeWageRate({
            employeeId: emp.id,
            hourlyRate: updatedCurrentHourlyRate,
            effectiveFrom: "2026-05-28",
            reason: "사후 시급 개정 (기산출 스냅샷 불변 검증용)",
          }),
          "saveEmployeeWageRate forward-only"
        );
        forwardOnlyCalcId = rateCandidateCalc.id;
      }
    }

    const finalCalcs = take(await b.listCalculationResults(), "final listCalculationResults");
    const calcHistory = take(await b.listCalculationHistory(), "final listCalculationHistory");
    const approvals = take(await b.listAllowanceApprovalHistory(), "final approvalHistory");
    const proposals = take(await b.listAllowanceProposalApprovals(), "final proposalHistory");
    const docExports = take(await b.listAllowanceDocumentExports(), "final exportHistory");

    const latestIds = new Set(finalCalcs.map(c => c.id));
    const pastVersionCount = calcHistory.filter(h => !latestIds.has(h.id)).length;

    return {
      totalCalculations: finalCalcs.length,
      calculations202605: finalCalcs.filter(c => c.workDate.startsWith("2026-05")).length,
      calculations202604: finalCalcs.filter(c => c.workDate.startsWith("2026-04")).length,
      pastVersionCount,
      months: Array.from(new Set(finalCalcs.map(c => c.workDate.slice(0, 7)))).sort(),
      sites: Array.from(new Set(finalCalcs.map(c => c.siteName))),
      statuses: Array.from(new Set(finalCalcs.map(c => c.status))).sort(),
      earlyPayoutCount: finalCalcs.filter(c => !!c.earlyPayoutDate).length,
      approvalHistoryCount: approvals.length,
      proposalCount: proposals.length,
      exportCount: docExports.length,
      rankMissingCalcId,
      rankMissingEmployeeName,
      forwardOnlyCalcId,
      savedSnapshotHourlyRate,
      updatedCurrentHourlyRate,
    };
  });

  assert.ok(
    summary.totalCalculations >= 55,
    `Expected >= 55 latest calculations, got ${summary.totalCalculations}`
  );
  assert.ok(
    summary.calculations202605 >= 55,
    `Expected >= 55 calculations in 2026-05, got ${summary.calculations202605}`
  );
  assert.ok(
    summary.sites.length >= 10,
    `Expected 10 sites in calculations, got ${summary.sites.length}`
  );
  assert.ok(
    summary.months.length >= 2,
    `Expected >= 2 months in calculations, got ${summary.months.join(",")}`
  );
  assert.equal(
    summary.statuses.length,
    4,
    `Expected all 4 statuses, got ${summary.statuses.join(",")}`
  );
  assert.ok(
    summary.approvalHistoryCount >= 55,
    `Expected >= 55 review history records, got ${summary.approvalHistoryCount}`
  );
  assert.ok(
    summary.pastVersionCount >= 1,
    `Expected >= 1 past calculation version in history, got ${summary.pastVersionCount}`
  );

  return summary;
}
