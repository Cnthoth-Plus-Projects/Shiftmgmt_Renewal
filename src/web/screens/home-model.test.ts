import { describe, expect, it } from "vitest";
import {
  calculateOperationsProgress,
  calculatePerformanceOverviewKpis,
  calculatePreparationProgress,
  calculateSettlementProgress,
  determineHomeTodos,
  getSeoulMonthContext,
} from "./home-model";
import type {
  EmployeeRecord,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord,
} from "../../shared/domain/model";
import type {
  AllowanceCalculationResultRecord,
} from "../../shared/domain/allowance-service";
import type {
  AllowanceBackupSummary,
  AllowanceProposalApprovalRecord,
  AllowanceProposalPreview,
} from "../../shared/domain/allowance-workflow";
import type { AllowanceCalculationSnapshot } from "../../shared/domain/calculation";
import type {
  AllowanceDocumentExportRecord,
} from "../../shared/domain/allowance-document";
import type {
  PerformanceOverviewSnapshot,
} from "../../shared/domain/performance-file";

describe("home-model", () => {
  // 1. 서울 시간대 날짜 및 월 시작/말일 계산
  it("getSeoulMonthContext: 한국 표준시 기준 YYYY-MM, 1일 및 말일 계산", () => {
    // 2026-09-29 17:00 UTC -> 2026-09-30 02:00 KST
    const dateKstNextDay = new Date("2026-09-29T17:00:00Z");
    const ctx = getSeoulMonthContext(dateKstNextDay);

    expect(ctx.year).toBe(2026);
    expect(ctx.month).toBe(9);
    expect(ctx.yearMonth).toBe("2026-09");
    expect(ctx.monthFirstDay).toBe("2026-09-01");
    expect(ctx.monthLastDay).toBe("2026-09-30");

    // 윤년 2월 테스트
    const leapFeb = new Date("2024-02-15T00:00:00Z");
    const ctxLeap = getSeoulMonthContext(leapFeb);
    expect(ctxLeap.monthLastDay).toBe("2024-02-29");
  });

  // 2. N1: 준비 단계 반례 테스트 (패턴 미적용, 퇴사/휴직, 1일 종료, 익월 시작 배정 제외)
  it("calculatePreparationProgress [N1]: 패턴/배정 불충족 시 준비 미완료 판정", () => {
    const siteA: SiteRecord = {
      id: "site-a",
      siteCode: "SA",
      name: "근무지A",
      status: "active",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };

    // 1) 패턴이 없거나 effectiveFrom이 9월 1일보다 뒤인 경우
    const latePattern: ShiftPatternRecord = {
      id: "pat-1",
      siteId: "site-a",
      name: "늦은 패턴",
      teamCount: 4,
      cycleLength: 4,
      patternCode: "4T4C",
      startIndexRule: "A",
      effectiveFrom: "2026-09-02", // 9월 1일 이후
      status: "active",
      steps: [],
      teamIndexes: [],
      cycles: [],
      teamCycleAssignments: [],
      teamCapacities: [],
      teamSettings: [],
      poolEnabled: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };

    const validEmployee: EmployeeRecord = {
      id: "emp-1",
      employeeCode: "E001",
      name: "홍길동",
      employmentType: "regular",
      status: "active",
      currentSiteId: "site-a",
      currentAssignmentStartDate: "2026-09-01",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };

    const res1 = calculatePreparationProgress({
      sites: [siteA],
      patterns: [latePattern],
      siteEmployeesMap: { "site-a": [validEmployee] },
      monthFirstDay: "2026-09-01",
      monthLastDay: "2026-09-30",
    });
    expect(res1.completedCount).toBe(0);
    expect(res1.targetCount).toBe(1);

    // 2) 유효 패턴이 있으나 직원이 retired/leave 이거나 배정일 조건 불충족
    const validPattern: ShiftPatternRecord = {
      ...latePattern,
      id: "pat-2",
      effectiveFrom: "2026-09-01",
    };

    const retiredEmp: EmployeeRecord = {
      ...validEmployee,
      id: "emp-2",
      status: "retired",
    };

    const endedOnFirstEmp: EmployeeRecord = {
      ...validEmployee,
      id: "emp-3",
      currentAssignmentEndDate: "2026-09-01", // 1일 종료는 배타(>)로 제외
    };

    const nextMonthEmp: EmployeeRecord = {
      ...validEmployee,
      id: "emp-4",
      currentAssignmentStartDate: "2026-10-01", // 9월 말일 초과
    };

    const res2 = calculatePreparationProgress({
      sites: [siteA],
      patterns: [validPattern],
      siteEmployeesMap: { "site-a": [retiredEmp, endedOnFirstEmp, nextMonthEmp] },
      monthFirstDay: "2026-09-01",
      monthLastDay: "2026-09-30",
    });
    expect(res2.completedCount).toBe(0);
    expect(res2.targetCount).toBe(1);
  });

  // 3. 준비 단계 정상 완료 및 라벨 검증
  it("calculatePreparationProgress: 정상 완료 시 정확한 라벨 및 문구 반환", () => {
    const siteA: SiteRecord = {
      id: "site-a",
      siteCode: "SA",
      name: "근무지A",
      status: "active",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    const pattern: ShiftPatternRecord = {
      id: "pat-1",
      siteId: "site-a",
      name: "기본 패턴",
      teamCount: 4,
      cycleLength: 4,
      patternCode: "4T4C",
      startIndexRule: "A",
      patternStartDate: "2026-08-01", // fallback to patternStartDate
      status: "active",
      steps: [],
      teamIndexes: [],
      cycles: [],
      teamCycleAssignments: [],
      teamCapacities: [],
      teamSettings: [],
      poolEnabled: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    const emp: EmployeeRecord = {
      id: "emp-1",
      employeeCode: "E001",
      name: "김철수",
      employmentType: "regular",
      status: "active",
      currentSiteId: "site-a",
      currentAssignmentStartDate: "2026-08-15",
      currentAssignmentEndDate: "2026-09-15", // 9월 1일 초과
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };

    const res = calculatePreparationProgress({
      sites: [siteA],
      patterns: [pattern],
      siteEmployeesMap: { "site-a": [emp] },
      monthFirstDay: "2026-09-01",
      monthLastDay: "2026-09-30",
    });

    expect(res.completedCount).toBe(1);
    expect(res.targetCount).toBe(1);
    expect(res.ratioPercent).toBe(100);
    expect(res.label).toBe("준비 1/1 근무지 (현재 배정 기준)");
    expect(res.subtext).toContain("이번 달 중간에 배정이 끝난 인원은 이 숫자에 들어가지 않습니다");
  });

  // 4. 준비 단계 빈 상태 (대상 0개)
  it("calculatePreparationProgress: 대상 근무지 0개 시 빈 상태 반환", () => {
    const res = calculatePreparationProgress({
      sites: [],
      patterns: [],
      siteEmployeesMap: {},
      monthFirstDay: "2026-09-01",
      monthLastDay: "2026-09-30",
    });

    expect(res.isEmpty).toBe(true);
    expect(res.completedCount).toBe(0);
    expect(res.targetCount).toBe(0);
    expect(res.ratioPercent).toBe(0);
    expect(res.label).toBe("준비 0/0 근무지 (현재 배정 기준)");
  });

  // 5. N2: 운영 단계 반례 테스트 (비활성 근무지 당월 포함, draft/불일치 export 제외)
  it("calculateOperationsProgress [N2]: 비활성 근무지 당월 포함 및 export 일치성 검증", () => {
    const activeSite: SiteRecord = {
      id: "site-active",
      siteCode: "S1",
      name: "활성근무지",
      status: "active",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    const _inactiveSite: SiteRecord = {
      id: "site-inactive",
      siteCode: "S2",
      name: "비활성근무지",
      status: "inactive",
      timezone: "Asia/Seoul",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };

    // 비활성 근무지의 당월 근무표 존재
    const sch1: MonthlyScheduleRecord = {
      id: "sch-1",
      siteId: "site-active",
      scheduleMonth: "2026-09",
      patternId: "p1",
      generatedAt: "2026-09-01",
      generatedBy: "admin",
      items: [],
    };
    const sch2: MonthlyScheduleRecord = {
      id: "sch-2",
      siteId: "site-inactive",
      scheduleMonth: "2026-09",
      patternId: "p2",
      generatedAt: "2026-09-01",
      generatedBy: "admin",
      items: [],
    };

    // exports: sch-1은 draft, sch-2는 published, 지난달 published 하나
    const expDraft: SchedulePlanExportRecord = {
      id: "exp-1",
      scheduleId: "sch-1",
      scheduleMonth: "2026-09",
      siteName: "활성근무지",
      patternName: "P1",
      outputFileName: "f1.xlsx",
      outputPath: "/out/f1.xlsx",
      updateCount: 1,
      publishStatus: "draft", // draft라 미완료
      exportedAt: "2026-09-01",
    };
    const expPublished: SchedulePlanExportRecord = {
      id: "exp-2",
      scheduleId: "sch-2",
      scheduleMonth: "2026-09",
      siteName: "비활성근무지",
      patternName: "P2",
      outputFileName: "f2.xlsx",
      outputPath: "/out/f2.xlsx",
      updateCount: 1,
      publishStatus: "published",
      exportedAt: "2026-09-01",
    };
    const expLastMonth: SchedulePlanExportRecord = {
      id: "exp-3",
      scheduleId: "sch-old",
      scheduleMonth: "2026-08",
      siteName: "활성근무지",
      patternName: "P1",
      outputFileName: "old.xlsx",
      outputPath: "/out/old.xlsx",
      updateCount: 1,
      publishStatus: "published",
      exportedAt: "2026-08-01",
    };

    const res = calculateOperationsProgress({
      activeSites: [activeSite], // inactiveSite는 activeSites에 없지만 sch2로 인해 대상에 포함
      monthlySchedules: [sch1, sch2],
      schedulePlanExports: [expDraft, expPublished, expLastMonth],
      scheduleMonth: "2026-09",
    });

    // 분모: 2개 근무지 x 2 = 4단계
    expect(res.totalSteps).toBe(4);
    // sch-1: 생성(1) + 배포실패(0) = 1
    // sch-2: 생성(1) + 배포완료(1) = 2
    // 총 완료 = 3
    expect(res.completedSteps).toBe(3);
    expect(res.label).toBe("운영 3/4 단계");
    expect(res.unassignedSites).toEqual([
      { siteId: "site-active", siteName: "활성근무지" },
    ]);
  });

  // 6. N3: 대기 실적 및 이름 매칭 경고 분리 검증
  it("calculatePerformanceOverviewKpis [N3]: 미연결/중복 경고 및 sites 실패 격리", () => {
    const overview: PerformanceOverviewSnapshot = {
      groups: [
        {
          siteName: "알수없는곳",
          rowCount: 10,
          approvedCount: 0,
          pendingCount: 5,
          rejectedCount: 0,
          approvableCount: 5,
          needsReapprovalCount: 1,
          changeLockedCount: 0,
          alertCount: 2,
          rows: [],
        },
        {
          siteName: "강남센터",
          rowCount: 20,
          approvedCount: 10,
          pendingCount: 10,
          rejectedCount: 0,
          approvableCount: 10,
          needsReapprovalCount: 0,
          changeLockedCount: 0,
          alertCount: 0,
          rows: [],
        },
      ],
      reapprovalFiles: [],
      syncIssues: [],
      siteCount: 2,
      rowCount: 30,
      approvedCount: 10,
      pendingCount: 15,
      rejectedCount: 0,
      approvableCount: 15,
      needsReapprovalCount: 1,
      changeLockedCount: 0,
    };

    const allSites: SiteRecord[] = [
      { id: "s1", siteCode: "C1", name: "강남센터", status: "active", timezone: "Asia/Seoul", createdAt: "", updatedAt: "" },
      { id: "s2", siteCode: "C2", name: "강남센터", status: "inactive", timezone: "Asia/Seoul", createdAt: "", updatedAt: "" },
    ];

    // sites 조회 성공 시: "알수없는곳"은 0건 일치(미연결), "강남센터"는 2건 일치(중복)
    const kpisOk = calculatePerformanceOverviewKpis({
      overview,
      allSites,
    });
    expect(kpisOk.groupsCount).toBe(2);
    expect(kpisOk.pendingCount).toBe(15);
    expect(kpisOk.needsReapprovalCount).toBe(1);
    expect(kpisOk.alertCount).toBe(2);
    expect(kpisOk.unconnectedSiteNames).toEqual(["알수없는곳"]);
    expect(kpisOk.duplicateSiteNames).toEqual(["강남센터"]);
    expect(kpisOk.siteMatchingStatus).toBe("ok");

    // sites 조회 실패(null) 시: KPI는 표시되고 이름 경고는 failed 처리
    const kpisFailed = calculatePerformanceOverviewKpis({
      overview,
      allSites: null,
    });
    expect(kpisFailed.groupsCount).toBe(2);
    expect(kpisFailed.pendingCount).toBe(15);
    expect(kpisFailed.siteMatchingStatus).toBe("failed");
    expect(kpisFailed.unconnectedSiteNames).toEqual([]);
    expect(kpisFailed.duplicateSiteNames).toEqual([]);
  });

  // 7. N4: 정산 단계 반례 테스트 (결과 0건, 미승인 1건, 조기지급도 workDate 기준)
  it("calculateSettlementProgress [N4]: 결과 0건/미승인 건 존재 시 0단계 처리", () => {
    // 1) 당월 결과 0건
    const resEmpty = calculateSettlementProgress({
      calculationResults: [],
      proposalApprovals: [],
      documentExports: [],
      scheduleMonth: "2026-09",
    });
    expect(resEmpty.completedSteps).toBe(0);
    expect(resEmpty.step1Passed).toBe(false);

    // 2) 미승인(pending) 1건 존재, 조기지급은 9월 일자
    const calcPending: AllowanceCalculationResultRecord = {
      id: "calc-1",
      fileId: "f-1",
      fileName: "f.xlsx",
      entryId: "e-1",
      employeeCode: "E001",
      employeeName: "홍길동",
      siteName: "강남",
      workDate: "2026-09-10",
      workType: "day",
      hourlyRate: 10000,
      rateVersionId: "rv-1",
      rateVersionLabel: "v1",
      status: "pending", // 미승인
      earlyPayoutDate: "2026-09-15",
      signature: "sig",
      snapshot: {} as unknown as AllowanceCalculationSnapshot,
    };

    const resPending = calculateSettlementProgress({
      calculationResults: [calcPending],
      proposalApprovals: [],
      documentExports: [],
      scheduleMonth: "2026-09",
    });
    expect(resPending.completedSteps).toBe(0);
    expect(resPending.unapprovedCount).toBe(1);
    expect(resPending.step1Passed).toBe(false);
  });

  // 8. N5: 정산 단계 반례 테스트 (최신 승인 행 불완전/오래된 출력 제외/파일명 누락)
  it("calculateSettlementProgress [N5]: 최신 품의 승인 행 기준 출력 파일 완전성 검증", () => {
    const calcApproved: AllowanceCalculationResultRecord = {
      id: "calc-1",
      fileId: "f-1",
      fileName: "f.xlsx",
      entryId: "e-1",
      employeeCode: "E001",
      employeeName: "홍길동",
      siteName: "강남",
      workDate: "2026-09-10",
      workType: "day",
      hourlyRate: 10000,
      rateVersionId: "rv-1",
      rateVersionLabel: "v1",
      status: "approved",
      signature: "sig",
      snapshot: {} as unknown as AllowanceCalculationSnapshot,
    };

    // 승인 행 2개: 과거 승인(appOld), 최신 승인(appLatest)
    const appOld: AllowanceProposalApprovalRecord = {
      id: "app-1",
      workMonth: "2026-09",
      calculationIds: ["calc-1"],
      calculationCount: 1,
      employeeCount: 1,
      totalAllowanceAmount: 10000,
      regularTotalAllowanceAmount: 10000,
      earlyPayoutTotalAllowanceAmount: 0,
      exportRecordId: "doc-old",
      outputFormat: "xlsx",
      approvedAt: "2026-09-10T10:00:00Z",
      approvedBy: "admin",
      approvedByName: "관리자",
      previewSnapshot: {} as unknown as AllowanceProposalPreview,
      backupSummary: {} as unknown as AllowanceBackupSummary,
    };
    const appLatest: AllowanceProposalApprovalRecord = {
      ...appOld,
      id: "app-2",
      approvedAt: "2026-09-12T10:00:00Z",
      exportRecordId: "doc-latest",
    };

    // doc-old는 파일 3개 완비되었으나 오래된 승인 건임
    const docOld: AllowanceDocumentExportRecord = {
      id: "doc-old",
      workMonth: "2026-09",
      outputFormat: "xlsx",
      calculationIds: ["calc-1"],
      calculationCount: 1,
      employeeCount: 1,
      totalAllowanceAmount: 10000,
      proposalFileName: "prop.xlsx",
      proposalPath: "/p/prop.xlsx",
      attachment1FileName: "att1.xlsx",
      attachment1Path: "/p/att1.xlsx",
      attachment2FileName: "att2.xlsx",
      attachment2Path: "/p/att2.xlsx",
      exportedAt: "2026-09-10T11:00:00Z",
    };

    // 최신 승인에 대응하는 docLatest는 attachment2 누락
    const docLatestIncomplete: AllowanceDocumentExportRecord = {
      ...docOld,
      id: "doc-latest",
      attachment2FileName: "", // 누락!
    };

    const res = calculateSettlementProgress({
      calculationResults: [calcApproved],
      proposalApprovals: [appOld, appLatest],
      documentExports: [docOld, docLatestIncomplete],
      scheduleMonth: "2026-09",
    });

    // 단계 ① 참, 단계 ② 참(최신 승인 존재), 단계 ③ 거짓(최신 문서 파일 불완전) -> 2/3
    expect(res.step1Passed).toBe(true);
    expect(res.step2Passed).toBe(true);
    expect(res.step3Passed).toBe(false);
    expect(res.completedSteps).toBe(2);
    expect(res.label).toBe("월 정산 2/3 단계");
  });

  // 9. 정산 단계 3/3 전체 완료
  it("calculateSettlementProgress: 문서 출력 3개 파일 완비 시 3/3 완료", () => {
    const calcApproved: AllowanceCalculationResultRecord = {
      id: "calc-1",
      fileId: "f-1",
      fileName: "f.xlsx",
      entryId: "e-1",
      employeeCode: "E001",
      employeeName: "홍길동",
      siteName: "강남",
      workDate: "2026-09-10",
      workType: "day",
      hourlyRate: 10000,
      rateVersionId: "rv-1",
      rateVersionLabel: "v1",
      status: "proposal-approved",
      signature: "sig",
      snapshot: {} as unknown as AllowanceCalculationSnapshot,
    };
    const app: AllowanceProposalApprovalRecord = {
      id: "app-1",
      workMonth: "2026-09",
      calculationIds: ["calc-1"],
      calculationCount: 1,
      employeeCount: 1,
      totalAllowanceAmount: 10000,
      regularTotalAllowanceAmount: 10000,
      earlyPayoutTotalAllowanceAmount: 0,
      exportRecordId: "doc-1",
      outputFormat: "xlsx",
      approvedAt: "2026-09-12T10:00:00Z",
      approvedBy: "admin",
      approvedByName: "관리자",
      previewSnapshot: {} as unknown as AllowanceProposalPreview,
      backupSummary: {} as unknown as AllowanceBackupSummary,
    };
    const doc: AllowanceDocumentExportRecord = {
      id: "doc-1",
      workMonth: "2026-09",
      outputFormat: "xlsx",
      calculationIds: ["calc-1"],
      calculationCount: 1,
      employeeCount: 1,
      totalAllowanceAmount: 10000,
      proposalFileName: "p.xlsx",
      proposalPath: "/p/p.xlsx",
      attachment1FileName: "a1.xlsx",
      attachment1Path: "/p/a1.xlsx",
      attachment2FileName: "a2.xlsx",
      attachment2Path: "/p/a2.xlsx",
      exportedAt: "2026-09-12T11:00:00Z",
    };

    const res = calculateSettlementProgress({
      calculationResults: [calcApproved],
      proposalApprovals: [app],
      documentExports: [doc],
      scheduleMonth: "2026-09",
    });

    expect(res.step1Passed).toBe(true);
    expect(res.step2Passed).toBe(true);
    expect(res.step3Passed).toBe(true);
    expect(res.completedSteps).toBe(3);
    expect(res.ratioPercent).toBe(100);
    expect(res.label).toBe("월 정산 3/3 단계");
  });

  // 10. N6 & N7: 할 일 생성 및 권한 격리 (동기화 오류 문구, 비admin 감시 중단 배제)
  it("determineHomeTodos [N6, N7]: sync error 0건 실패 방지 및 비관리자 watch 배제", () => {
    // 1) issueCount=0, status=error -> "0건 실패"가 아닌 오류 문구
    const todosOperator = determineHomeTodos({
      userRole: "operator",
      scheduleMonth: "2026-09",
      kpis: null,
      operations: null,
      syncState: {
        status: "error",
        totalCount: 5,
        processedCount: 5,
        parsedCount: 5,
        skippedCount: 0,
        issueCount: 0, // 0건 이슈!
        message: "네트워크 단절",
      },
      recoveryStatus: null,
      settlement: null,
      fileWatchStatus: {
        isRunning: false, // 감시 중단 상태
        pendingDir: "/p",
        approvedDir: "/a",
        recentEvents: [],
      },
    });

    const syncTodo = todosOperator.find((t) => t.type === "sync-error");
    expect(syncTodo).toBeDefined();
    expect(syncTodo?.title).not.toContain("0건 실패");
    expect(syncTodo?.title).toBe("파일 해석 동기화 오류 발생");

    // operator이므로 감시 중단 todo는 없어야 함 (N7)
    const watchTodoOperator = todosOperator.find((t) => t.type === "watch-stopped");
    expect(watchTodoOperator).toBeUndefined();

    // 2) admin 역할인 경우 감시 중단 todo 생성 및 restart action 제공
    const todosAdmin = determineHomeTodos({
      userRole: "admin",
      scheduleMonth: "2026-09",
      kpis: null,
      operations: null,
      syncState: null,
      recoveryStatus: null,
      settlement: null,
      fileWatchStatus: {
        isRunning: false,
        pendingDir: "/p",
        approvedDir: "/a",
        recentEvents: [],
      },
    });

    const watchTodoAdmin = todosAdmin.find((t) => t.type === "watch-stopped");
    expect(watchTodoAdmin).toBeDefined();
    expect(watchTodoAdmin?.actionKind).toBe("restart-watch");
    expect(watchTodoAdmin?.actionLabel).toBe("다시 시작");
  });

  // 11. 할 일: 자동 복구 실패 retry action 제공
  it("determineHomeTodos: 자동 복구 이슈 존재 시 retry 액션 제공", () => {
    const todos = determineHomeTodos({
      userRole: "planner",
      scheduleMonth: "2026-09",
      kpis: null,
      operations: null,
      syncState: null,
      recoveryStatus: {
        hasRun: true,
        completedAt: "2026-09-01T00:00:00Z",
        restoredScheduleCount: 0,
        skippedScheduleCount: 1,
        approvedSyncIssueCount: 0,
        issues: ["4월"],
      },
      settlement: null,
      fileWatchStatus: null,
    });

    const recoveryTodo = todos.find((t) => t.type === "startup-recovery");
    expect(recoveryTodo).toBeDefined();
    expect(recoveryTodo?.title).toContain("시작 시 자동 복구 실패 — 4월");
    expect(recoveryTodo?.actionKind).toBe("retry-recovery");
    expect(recoveryTodo?.actionLabel).toBe("다시 복구");
  });

  // 12. N10: 할 일 0개 시 빈 배열 반환
  it("determineHomeTodos [N10]: 모든 조건 만족 및 이상 없을 때 할 일 0개", () => {
    const todos = determineHomeTodos({
      userRole: "admin",
      scheduleMonth: "2026-09",
      kpis: {
        groupsCount: 1,
        pendingCount: 0,
        needsReapprovalCount: 0,
        alertCount: 0,
        unconnectedSiteNames: [],
        duplicateSiteNames: [],
        siteMatchingStatus: "ok",
      },
      operations: {
        completedSteps: 2,
        totalSteps: 2,
        ratioPercent: 100,
        isEmpty: false,
        label: "운영 2/2 단계",
        unassignedSites: [],
      },
      syncState: {
        status: "idle",
        totalCount: 0,
        processedCount: 0,
        parsedCount: 0,
        skippedCount: 0,
        issueCount: 0,
        message: "",
      },
      recoveryStatus: {
        hasRun: true,
        completedAt: "2026-09-01T00:00:00Z",
        restoredScheduleCount: 1,
        skippedScheduleCount: 0,
        approvedSyncIssueCount: 0,
        issues: [],
      },
      settlement: {
        completedSteps: 3,
        totalSteps: 3,
        ratioPercent: 100,
        label: "월 정산 3/3 단계",
        unapprovedCount: 0,
        step1Passed: true,
        step2Passed: true,
        step3Passed: true,
      },
      fileWatchStatus: {
        isRunning: true,
        pendingDir: "/p",
        approvedDir: "/a",
        recentEvents: [],
      },
    });

    expect(todos).toHaveLength(0);
  });
});
