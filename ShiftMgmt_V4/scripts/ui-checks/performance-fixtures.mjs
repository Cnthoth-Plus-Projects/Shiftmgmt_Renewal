import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

/**
 * 실적 관리 UI 검증용 TEMP 격리 픽스처 생성기 (HANDOFF R15 / UI05-D01)
 * 실제 엑셀 인테이크 및 기존 API 경로를 통해 50행 이상의 실적과
 * 8가지 상태 표현(대기, 승인, 반려, 재승인 대기, 재승인 완료, 품의 잠금, 수당 미지급, 법정휴일)과
 * 승인완료 범위(approved-scope), 파일 확정 가능(canFinalize) 상태를 실제로 생성한다.
 */
export async function seedPerformanceFixtures({ page, isolatedRoot }) {
  // 1. 브라우저에서 operational scenarios가 생성한 2026-05 엑셀 내보내기 파일 목록 및 설정 조회
  const preparation = await page.evaluate(async () => {
    const b = window.appBridge;
    const take = (r, label) => {
      if (!r?.ok || r.data == null) throw new Error(`${label}: ${r?.message || "failed"}`);
      return r.data;
    };

    const settings = take(await b.getAppSettings(), "settings");
    const sites = take(await b.listSites(), "listSites");
    const employees = take(await b.listEmployees(), "listEmployees");
    const exports = take(await b.listSchedulePlanExports(), "listExports");

    const siteIdByName = new Map(sites.map(s => [s.name, s.id]));

    const exportedFiles = exports
      .filter(exp => exp.scheduleMonth === "2026-05")
      .map(exp => ({
        siteId: siteIdByName.get(exp.siteName) || "",
        siteName: exp.siteName,
        scheduleId: exp.scheduleId,
        exportedPath: exp.outputPath
      }));

    return { settings, exportedFiles, employees, schedules: take(await b.listMonthlySchedules(), "saved schedules") };
  });

  const { settings, exportedFiles, employees, schedules } = preparation;
  const pendingDir = settings.pendingDir;

  // 2. ExcelJS로 export된 엑셀 파일들을 읽어 회수 실적 기입 후 pendingDir에 저장
  const employeesBySite = new Map();
  const employeesBySiteName = new Map();
  for (const emp of employees) {
    const sId = emp.currentSiteId || emp.siteId;
    if (sId) {
      let list = employeesBySite.get(sId);
      if (!list) {
        list = [];
        employeesBySite.set(sId, list);
      }
      list.push(emp);
    }
    const sName = emp.currentSiteName;
    if (sName) {
      let list = employeesBySiteName.get(sName);
      if (!list) {
        list = [];
        employeesBySiteName.set(sName, list);
      }
      list.push(emp);
    }
  }

  let totalGeneratedRows = 0;
  const createdExcelFiles = [];

  for (const exp of exportedFiles) {
    const siteEmps =
      employeesBySite.get(exp.siteId) ||
      employeesBySiteName.get(exp.siteName) ||
      employees;
    if (siteEmps.length === 0) continue;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exp.exportedPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    // 10개 사업소에 각각 실적(대체, 연장, 법정휴일) 기입
    const e1 = siteEmps[0];
    const e2 = siteEmps[1] || siteEmps[0];
    const e3 = siteEmps[2] || siteEmps[0];

    // 대체근무 3건 기입
    const schedule = schedules.find(x=>x.siteId===exp.siteId && x.scheduleMonth==="2026-05");
    const workedDate = emp => { const item=schedule?.items.find(i=>i.employeeCode===emp.employeeCode && i.startTime && i.endTime && !["O","OFF","X"].includes(i.dutyCode)); if(!item)throw Error("No actual working date for "+emp.employeeCode); return item.workDate; };
    worksheet.getCell("BA11").value = workedDate(e1);
    worksheet.getCell("BC11").value = e1.name;
    worksheet.getCell("BE11").value = e2.name;
    worksheet.getCell("BG11").value = "연차 휴가 대체";
    worksheet.getCell("BJ11").value = "휴가원 접수";
    totalGeneratedRows++;

    worksheet.getCell("BA12").value = workedDate(e2);
    worksheet.getCell("BC12").value = e2.name;
    worksheet.getCell("BE12").value = e3.name;
    worksheet.getCell("BG12").value = "경조사 대체";
    worksheet.getCell("BJ12").value = "청첩장 증빙";
    totalGeneratedRows++;

    // Pool 인력 대체근무 (수당 미지급 사례)
    worksheet.getCell("BA13").value = workedDate(e3);
    worksheet.getCell("BC13").value = e3.name;
    worksheet.getCell("BE13").value = `${e1.name} (P)`;
    worksheet.getCell("BG13").value = "풀 인력 긴급 투입";
    worksheet.getCell("BJ13").value = "지원 요청서";
    totalGeneratedRows++;

    // 연장근무 2건 기입 (시작/종료 시/분 기입)
    worksheet.getCell("BA34").value = "2026-05-11";
    worksheet.getCell("BC34").value = 18;
    worksheet.getCell("BD34").value = 0;
    worksheet.getCell("BE34").value = 22;
    worksheet.getCell("BF34").value = 0;
    worksheet.getCell("BG34").value = e1.name;
    worksheet.getCell("BH34").value = "월간 전산망 긴급 점검";
    worksheet.getCell("BJ34").value = "작업 일지 첨부";
    totalGeneratedRows++;

    worksheet.getCell("BA35").value = "2026-05-20";
    worksheet.getCell("BC35").value = 19;
    worksheet.getCell("BD35").value = 0;
    worksheet.getCell("BE35").value = 23;
    worksheet.getCell("BF35").value = 0;
    worksheet.getCell("BG35").value = e2.name;
    worksheet.getCell("BH35").value = "장비 교체 연장 지원";
    worksheet.getCell("BJ35").value = "작업 확인서";
    totalGeneratedRows++;

    // 법정휴일근무 1건 기입 (5월 5일 어린이날)
    worksheet.getCell("AL12").value = e1.name;
    totalGeneratedRows++;

    const outFileName = `2026_05_${exp.siteName}.xlsx`;
    const pendingFilePath = path.join(pendingDir, outFileName);
    await workbook.xlsx.writeFile(pendingFilePath);

    createdExcelFiles.push({
      siteName: exp.siteName,
      filePath: pendingFilePath,
      fileName: outFileName
    });
  }

  // 3. 브라우저에서 1차 동기화 및 사업소별 상태 분할 생성 (승인, 반려, 품의잠금)
  const syncResult = await page.evaluate(async () => {
    const b = window.appBridge;
    const take = (r, label) => {
      if (!r?.ok || r.data == null) throw new Error(`${label}: ${r?.message || "failed"}`);
      return r.data;
    };

    // 1차 인테이크
    const overview1 = take(
      await b.listPerformanceOverview({
        scheduleMonth: "2026-05",
        forceReparse: true
      }),
      "1st overview"
    );

    const rows1 = overview1.groups.flatMap(g => g.rows);

    // 각 사업소별로 연장근무 행을 1건씩 추출 (총 10개 사업소)
    const siteRowsMap = new Map();
    for (const r of rows1) {
      if (r.canApprove && r.entry.startTime && r.entry.endTime) {
        if (!siteRowsMap.has(r.entry.siteName)) {
          siteRowsMap.set(r.entry.siteName, r);
        }
      }
    }

    const distinctSiteRows = Array.from(siteRowsMap.values());
    let approvedCount = 0;
    let rejectedCount = 0;
    let lockedCount = 0;

    // 사업소 0: 반려용 행 승인 -> 수당 검토 반려
    if (distinctSiteRows.length > 0) {
      const rejectRow = distinctSiteRows[0];
      take(
        await b.approvePendingFile({
          fileId: rejectRow.fileId,
          entryId: rejectRow.entryId,
          expectedPolicyFingerprint: rejectRow.entry?.appliedPolicies?.fingerprint,
          comment: "반려 테스트 사전 승인"
        }),
        "approve for reject"
      );
      const calcs = take(await b.listCalculationResults(), "calcs for reject");
      const rCalc = calcs.find(c => c.fileId === rejectRow.fileId && c.entryId === rejectRow.entryId);
      if (rCalc) {
        take(
          await b.reviewAllowanceCalculations({
            calculationIds: [rCalc.id],
            decision: "rejected",
            comment: "증빙 서류 누락으로 실적 반려",
            syncPerformanceSiteReject: true
          }),
          "review reject"
        );
        rejectedCount++;
      }
    }

    // 사업소 1: 품의 잠금용 행 승인 -> 수당 검토 승인 -> 품의 결재 승인
    if (distinctSiteRows.length > 1) {
      const lockRow = distinctSiteRows[1];
      take(
        await b.approvePendingFile({
          fileId: lockRow.fileId,
          entryId: lockRow.entryId,
          expectedPolicyFingerprint: lockRow.entry?.appliedPolicies?.fingerprint,
          comment: "품의 결재 사전 승인"
        }),
        "approve for lock"
      );
      const calcs = take(await b.listCalculationResults(), "calcs for lock");
      const lCalc = calcs.find(c => c.fileId === lockRow.fileId && c.entryId === lockRow.entryId);
      if (lCalc) {
        take(
          await b.reviewAllowanceCalculations({
            calculationIds: [lCalc.id],
            decision: "approved",
            comment: "수당 산출 사전 검토 승인"
          }),
          "review approve before proposal"
        );
        const propRes = await b.approveAllowanceProposal({
          calculationIds: [lCalc.id],
          comment: "2026년 5월 수당 지급 품의 결재 완료",
          outputFormat: "xlsx"
        });
        if (propRes.ok) {
          lockedCount++;
        }
      }
    }

    // 사업소 2: 일반 승인 유지 행
    if (distinctSiteRows.length > 2) {
      const appRow = distinctSiteRows[2];
      take(
        await b.approvePendingFile({
          fileId: appRow.fileId,
          entryId: appRow.entryId,
          expectedPolicyFingerprint: appRow.entry?.appliedPolicies?.fingerprint,
          comment: "5월 정기 실적 정상 승인"
        }),
        "approve keep"
      );
      approvedCount++;
    }

    // 사업소 3: 재승인 대상 사전 승인
    let targetReapprovalFile = null;
    if (distinctSiteRows.length > 3) {
      const reRow = distinctSiteRows[3];
      take(
        await b.approvePendingFile({
          fileId: reRow.fileId,
          entryId: reRow.entryId,
          expectedPolicyFingerprint: reRow.entry?.appliedPolicies?.fingerprint,
          comment: "재승인 대상 사전 승인"
        }),
        "approve for reapproval"
      );
      targetReapprovalFile = {
        fileId: reRow.fileId,
        fileName: reRow.sourceFileName,
        siteName: reRow.entry.siteName
      };
      approvedCount++;
    }

    return {
      totalRows: rows1.length,
      approvedCount,
      rejectedCount,
      lockedCount,
      targetReapprovalFile
    };
  });

  if (syncResult.targetReapprovalFile) {
    const archivedPath = await page.evaluate(async info => {
      const b=window.appBridge;
      const snap=await b.listPerformanceOverview({scheduleMonth:"2026-05"}); if(!snap.ok)throw Error(snap.message);
      for(const row of snap.data.groups.flatMap(g=>g.rows).filter(r=>r.fileId===info.fileId && r.canApprove)) {
        const r=await b.approvePendingFile({fileId:row.fileId,entryId:row.entryId,expectedPolicyFingerprint:row.entry?.appliedPolicies?.fingerprint,comment:"기존 배포본 승인 완료"}); if(!r.ok)throw Error(r.message);
      }
      const detail=await b.getPerformanceFileDetail({fileId:info.fileId}); if(!detail.ok || !detail.data)throw Error("Archived source missing");return detail.data.filePath;
    },syncResult.targetReapprovalFile);
    syncResult.targetReapprovalFile.archivedPath=archivedPath;
  }

  // 4. 재승인 픽스처 생성: 사업소 3의 엑셀 파일을 수정하여 pendingDir에 신규 버전(_v2)으로 교체
  await new Promise(r => setTimeout(r, 1200));

  const targetInfo = syncResult.targetReapprovalFile;
  const targetFile =
    createdExcelFiles.find(f => f.fileName === targetInfo?.fileName) ||
    createdExcelFiles.find(f => f.siteName === targetInfo?.siteName) ||
    createdExcelFiles[3];

  if (targetFile) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(targetInfo?.archivedPath || targetFile.filePath);
    const ws = wb.getWorksheet("교대 근무 계획표") ?? wb.worksheets[0];

    // 연장근무 행의 시간 및 사유 수정하여 재승인 대기 상태 유발
    ws.getCell("BH34").value = "월간 전산망 긴급 점검 (수정본 - 연장 시간 정정)";
    ws.getCell("BC34").value = 17;
    ws.getCell("BE34").value = 23;
    ws.getCell("BH35").value = "수정된 연장근무 확인";
    ws.getCell("BC35").value = 18;

    // 새 파일명으로 저장하여 새 fileId 발급
    const v2FileName = targetFile.fileName;
    const v2FilePath = path.join(pendingDir, v2FileName);
    await wb.xlsx.writeFile(v2FilePath);

    // The archived source is retained; only a new returned version is staged.

  }

  // 5. 브라우저에서 2차 동기화 및 재승인 완료 처리
  const finalResult = await page.evaluate(async () => {
    const b = window.appBridge;
    const take = (r, label) => {
      if (!r?.ok || r.data == null) throw new Error(`${label}: ${r?.message || "failed"}`);
      return r.data;
    };

    // 수정 엑셀 재파싱
    const overview2 = take(
      await b.listPerformanceOverview({
        scheduleMonth: "2026-05",
        forceReparse: true
      }),
      "2nd overview with reapproval"
    );

    const rows2 = overview2.groups.flatMap(g => g.rows);
    const reapprovalPendingRows = rows2.filter(
      r => r.needsReapproval && r.reapprovalStatus === "pending"
    );

    let reapprovalCompletedCount = 0;
    if (reapprovalPendingRows.length > 0) {
      const reRow = reapprovalPendingRows[0];
      take(
        await b.approvePendingFile({
          fileId: reRow.fileId,
          entryId: reRow.entryId,
          expectedPolicyFingerprint: reRow.entry?.appliedPolicies?.fingerprint,
          comment: "수정 엑셀 실적 확인 후 재승인"
        }),
        "approve reapproval row"
      );
      reapprovalCompletedCount++;
    }

    // 최종 상태 재조회
    const finalOverview = take(
      await b.listPerformanceOverview({
        scheduleMonth: "2026-05"
      }),
      "final overview"
    );

    // approved scope 보관본도 확인
    const approvedOverview = take(
      await b.listPerformanceOverview({
        scheduleMonth: "2026-05",
        approvalScope: "approved"
      }),
      "approved scope overview"
    );

    const allFinalRows = finalOverview.groups.flatMap(g => g.rows);

    return {
      rowCount: finalOverview.rowCount,
      approvedScopeRowCount: approvedOverview.rowCount,
      groupsCount: finalOverview.groups.length,
      reapprovalFilesCount: finalOverview.reapprovalFiles?.length || 0,
      reapprovalPendingCount: allFinalRows.filter(
        r => r.needsReapproval && r.reapprovalStatus === "pending"
      ).length,
      reapprovalCompletedCount: allFinalRows.filter(r=>r.reapprovalStatus === "completed").length,
      changeLockedCount: allFinalRows.filter(r => r.isChangeLocked).length,
      approvedCount: allFinalRows.filter(r => r.approvalStatus === "approved").length,
      rejectedCount: allFinalRows.filter(r => r.approvalStatus === "rejected").length,
      nonPayableCount: allFinalRows.filter(r => r.approvalStatus === "non-payable").length,
      legalHolidayCount: allFinalRows.filter(r => r.entry.section === "legal-holiday").length
    };
  });

  process.stdout.write(`[Fixtures finalResult] ${JSON.stringify(finalResult)}\n`);

  return {
    totalGeneratedRows,
    createdExcelFiles,
    syncResult: finalResult
  };
}
