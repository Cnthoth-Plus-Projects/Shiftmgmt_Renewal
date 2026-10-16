// ../ShiftMgmt_V4/src/web/screens/home-model.ts
function getSeoulMonthContext(dateInput = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(dateInput);
  let yearStr = "";
  let monthStr = "";
  for (const part of parts) {
    if (part.type === "year") {
      yearStr = part.value;
    } else if (part.type === "month") {
      monthStr = part.value;
    }
  }
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  const monthFirstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDayNum = lastDayDate.getUTCDate();
  const monthLastDay = `${yearMonth}-${String(lastDayNum).padStart(2, "0")}`;
  return {
    year,
    month,
    yearMonth,
    monthFirstDay,
    monthLastDay
  };
}
function calculatePreparationProgress(params) {
  const { sites, patterns, siteEmployeesMap, monthFirstDay, monthLastDay } = params;
  const activeSites = sites.filter((s) => s.status === "active");
  const targetCount = activeSites.length;
  if (targetCount === 0) {
    return {
      completedCount: 0,
      targetCount: 0,
      ratioPercent: 0,
      isEmpty: true,
      label: "\uC900\uBE44 0/0 \uADFC\uBB34\uC9C0 (\uD604\uC7AC \uBC30\uC815 \uAE30\uC900)",
      subtext: "\uC774\uBC88 \uB2EC \uC911\uAC04\uC5D0 \uBC30\uC815\uC774 \uB05D\uB09C \uC778\uC6D0\uC740 \uC774 \uC22B\uC790\uC5D0 \uB4E4\uC5B4\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC6D4 \uC804\uCCB4 \uBC30\uC815 \uC774\uB825\uC740 \uC778\uB825 \uAD00\uB9AC\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694."
    };
  }
  let completedCount = 0;
  for (const site of activeSites) {
    const hasValidPattern = patterns.some((p) => {
      if (p.siteId !== site.id || p.status !== "active") {
        return false;
      }
      const effectiveDate = p.effectiveFrom || p.patternStartDate;
      return Boolean(effectiveDate && effectiveDate <= monthFirstDay);
    });
    if (!hasValidPattern) {
      continue;
    }
    const employees = siteEmployeesMap[site.id] || [];
    const hasActiveEmployee = employees.some((emp) => {
      if (emp.status !== "active") {
        return false;
      }
      if (emp.currentSiteId !== site.id) {
        return false;
      }
      if (!emp.currentAssignmentStartDate || emp.currentAssignmentStartDate > monthLastDay) {
        return false;
      }
      if (emp.currentAssignmentEndDate && emp.currentAssignmentEndDate <= monthFirstDay) {
        return false;
      }
      return true;
    });
    if (hasActiveEmployee) {
      completedCount++;
    }
  }
  const ratioPercent = Math.round(completedCount / targetCount * 100);
  return {
    completedCount,
    targetCount,
    ratioPercent,
    isEmpty: false,
    label: `\uC900\uBE44 ${completedCount}/${targetCount} \uADFC\uBB34\uC9C0 (\uD604\uC7AC \uBC30\uC815 \uAE30\uC900)`,
    subtext: "\uC774\uBC88 \uB2EC \uC911\uAC04\uC5D0 \uBC30\uC815\uC774 \uB05D\uB09C \uC778\uC6D0\uC740 \uC774 \uC22B\uC790\uC5D0 \uB4E4\uC5B4\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC6D4 \uC804\uCCB4 \uBC30\uC815 \uC774\uB825\uC740 \uC778\uB825 \uAD00\uB9AC\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694."
  };
}
function calculateOperationsProgress(params) {
  const { activeSites, monthlySchedules, schedulePlanExports, scheduleMonth } = params;
  const targetSiteIdSet = /* @__PURE__ */ new Set();
  const siteNameMap = /* @__PURE__ */ new Map();
  for (const s of activeSites) {
    if (s.status === "active") {
      targetSiteIdSet.add(s.id);
      siteNameMap.set(s.id, s.name);
    }
  }
  const currentMonthSchedules = monthlySchedules.filter((sch) => sch.scheduleMonth === scheduleMonth);
  for (const sch of currentMonthSchedules) {
    targetSiteIdSet.add(sch.siteId);
    if (!siteNameMap.has(sch.siteId) && sch.siteName) {
      siteNameMap.set(sch.siteId, sch.siteName);
    }
  }
  const targetSiteIds = Array.from(targetSiteIdSet);
  const targetCount = targetSiteIds.length;
  const totalSteps = targetCount * 2;
  if (totalSteps === 0) {
    return {
      completedSteps: 0,
      totalSteps: 0,
      ratioPercent: 0,
      isEmpty: true,
      label: "\uC6B4\uC601 0/0 \uB2E8\uACC4",
      unassignedSites: []
    };
  }
  let completedSteps = 0;
  const unassignedSites = [];
  for (const siteId of targetSiteIds) {
    const siteSchedules = currentMonthSchedules.filter((sch) => sch.siteId === siteId);
    const hasSchedule = siteSchedules.length > 0;
    if (!hasSchedule) {
      continue;
    }
    completedSteps++;
    const scheduleIds = new Set(siteSchedules.map((sch) => sch.id));
    const hasPublishedExport = schedulePlanExports.some(
      (exp) => scheduleIds.has(exp.scheduleId) && exp.publishStatus === "published"
    );
    if (hasPublishedExport) {
      completedSteps++;
    } else {
      unassignedSites.push({
        siteId,
        siteName: siteNameMap.get(siteId) || siteId
      });
    }
  }
  const ratioPercent = Math.round(completedSteps / totalSteps * 100);
  return {
    completedSteps,
    totalSteps,
    ratioPercent,
    isEmpty: false,
    label: `\uC6B4\uC601 ${completedSteps}/${totalSteps} \uB2E8\uACC4`,
    unassignedSites
  };
}
function calculatePerformanceOverviewKpis(params) {
  const { overview, allSites } = params;
  let pendingCount = 0;
  let needsReapprovalCount = 0;
  let alertCount = 0;
  for (const grp of overview.groups) {
    pendingCount += grp.pendingCount || 0;
    needsReapprovalCount += grp.needsReapprovalCount || 0;
    alertCount += grp.alertCount || 0;
  }
  const groupsCount = overview.groups.length;
  if (allSites === null) {
    return {
      groupsCount,
      pendingCount,
      needsReapprovalCount,
      alertCount,
      unconnectedSiteNames: [],
      duplicateSiteNames: [],
      siteMatchingStatus: "failed"
    };
  }
  const unconnectedSiteNames = [];
  const duplicateSiteNames = [];
  for (const grp of overview.groups) {
    const matched = allSites.filter((s) => s.name === grp.siteName);
    if (matched.length === 0) {
      unconnectedSiteNames.push(grp.siteName);
    } else if (matched.length >= 2) {
      duplicateSiteNames.push(grp.siteName);
    }
  }
  return {
    groupsCount,
    pendingCount,
    needsReapprovalCount,
    alertCount,
    unconnectedSiteNames,
    duplicateSiteNames,
    siteMatchingStatus: "ok"
  };
}
function calculateSettlementProgress(params) {
  const { calculationResults, proposalApprovals, documentExports, scheduleMonth } = params;
  const currentMonthResults = calculationResults.filter(
    (res) => res.workDate && res.workDate.startsWith(scheduleMonth)
  );
  const unapprovedResults = currentMonthResults.filter(
    (res) => res.status !== "approved" && res.status !== "proposal-approved"
  );
  const unapprovedCount = unapprovedResults.length;
  const step1Passed = currentMonthResults.length > 0 && unapprovedCount === 0;
  if (!step1Passed) {
    return {
      completedSteps: 0,
      totalSteps: 3,
      ratioPercent: 0,
      label: "\uC6D4 \uC815\uC0B0 0/3 \uB2E8\uACC4",
      unapprovedCount,
      step1Passed: false,
      step2Passed: false,
      step3Passed: false
    };
  }
  const currentMonthApprovals = proposalApprovals.filter(
    (app) => app.workMonth === scheduleMonth
  );
  currentMonthApprovals.sort((a, b) => {
    const timeA = new Date(a.approvedAt).getTime();
    const timeB = new Date(b.approvedAt).getTime();
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return b.id.localeCompare(a.id);
  });
  const latestApproval = currentMonthApprovals[0] || null;
  const step2Passed = Boolean(latestApproval);
  if (!step2Passed) {
    return {
      completedSteps: 1,
      totalSteps: 3,
      ratioPercent: 33,
      label: "\uC6D4 \uC815\uC0B0 1/3 \uB2E8\uACC4",
      unapprovedCount,
      step1Passed: true,
      step2Passed: false,
      step3Passed: false
    };
  }
  const matchingExport = documentExports.find((exp) => {
    if (exp.workMonth !== scheduleMonth) {
      return false;
    }
    if (exp.id !== latestApproval.exportRecordId) {
      return false;
    }
    return Boolean(
      exp.proposalFileName?.trim() && exp.attachment1FileName?.trim() && exp.attachment2FileName?.trim()
    );
  });
  const step3Passed = Boolean(matchingExport);
  const completedSteps = step3Passed ? 3 : 2;
  const ratioPercent = step3Passed ? 100 : 67;
  return {
    completedSteps,
    totalSteps: 3,
    ratioPercent,
    label: `\uC6D4 \uC815\uC0B0 ${completedSteps}/3 \uB2E8\uACC4`,
    unapprovedCount,
    step1Passed: true,
    step2Passed: true,
    step3Passed
  };
}
function determineHomeTodos(params) {
  const {
    userRole,
    scheduleMonth,
    kpis,
    operations,
    syncState,
    recoveryStatus,
    settlement,
    fileWatchStatus
  } = params;
  const todos = [];
  if (kpis && kpis.pendingCount > 0) {
    todos.push({
      id: "todo-pending-perf",
      type: "pending-performance",
      title: `\uB300\uAE30 \uC2E4\uC801 ${kpis.pendingCount}\uAC74`,
      icon: "fact_check",
      iconColor: "#3E56B6"
    });
  }
  if (operations && operations.unassignedSites.length > 0) {
    const monthNum = parseInt(scheduleMonth.split("-")[1], 10);
    for (const site of operations.unassignedSites) {
      todos.push({
        id: `todo-unreleased-${site.siteId}`,
        type: "unreleased-schedule",
        title: `${monthNum}\uC6D4 \uADFC\uBB34\uD45C \uBBF8\uBC30\uD3EC \u2014 ${site.siteName}`,
        icon: "calendar_month",
        iconColor: "#A05200"
      });
    }
  }
  if (syncState) {
    if (syncState.issueCount > 0) {
      todos.push({
        id: "todo-sync-error",
        type: "sync-error",
        title: `\uD30C\uC77C \uD574\uC11D \uC2E4\uD328 ${syncState.issueCount}\uAC74`,
        icon: "error",
        iconColor: "#C0392B"
      });
    } else if (syncState.status === "error") {
      todos.push({
        id: "todo-sync-error",
        type: "sync-error",
        title: "\uD30C\uC77C \uD574\uC11D \uB3D9\uAE30\uD654 \uC624\uB958 \uBC1C\uC0DD",
        icon: "error",
        iconColor: "#C0392B"
      });
    }
  }
  if (recoveryStatus && (recoveryStatus.issues && recoveryStatus.issues.length > 0 || recoveryStatus.approvedSyncIssueCount > 0)) {
    const issueSummary = recoveryStatus.issues && recoveryStatus.issues.length > 0 ? ` \u2014 ${recoveryStatus.issues.join(", ")}` : "";
    todos.push({
      id: "todo-startup-recovery",
      type: "startup-recovery",
      title: `\uC2DC\uC791 \uC2DC \uC790\uB3D9 \uBCF5\uAD6C \uC2E4\uD328${issueSummary}`,
      icon: "refresh",
      iconColor: "#1E7A46",
      actionKind: "retry-recovery",
      actionLabel: "\uB2E4\uC2DC \uBCF5\uAD6C"
    });
  }
  if (settlement && settlement.unapprovedCount > 0) {
    todos.push({
      id: "todo-unapproved-calc",
      type: "unapproved-calculation",
      title: `\uB300\uAE30 \uC218\uB2F9 ${settlement.unapprovedCount}\uAC74`,
      icon: "payments",
      iconColor: "#4B5563"
    });
  }
  if (settlement && settlement.step1Passed && !settlement.step2Passed) {
    todos.push({
      id: "todo-unapproved-proposal",
      type: "unapproved-proposal",
      title: "\uD488\uC758 \uBBF8\uC2B9\uC778",
      icon: "description",
      iconColor: "#A05200"
    });
  }
  if (kpis && kpis.unconnectedSiteNames.length > 0) {
    const count = kpis.unconnectedSiteNames.length;
    const detail = count === 1 ? ` (${kpis.unconnectedSiteNames[0]})` : "";
    todos.push({
      id: "todo-unconnected-site",
      type: "unconnected-site",
      title: `\uADFC\uBB34\uC9C0 \uC5F0\uACB0 \uBD88\uAC00 ${count}\uAC1C${detail}`,
      icon: "warning",
      iconColor: "#8A6D00"
    });
  }
  if (kpis && kpis.duplicateSiteNames.length > 0) {
    const count = kpis.duplicateSiteNames.length;
    const detail = count === 1 ? ` (${kpis.duplicateSiteNames[0]})` : "";
    todos.push({
      id: "todo-duplicate-site",
      type: "duplicate-site",
      title: `\uC911\uBCF5 \uC774\uB984\uC73C\uB85C \uC5F0\uACB0 \uBD88\uD655\uC815 ${count}\uAC1C${detail}`,
      icon: "warning",
      iconColor: "#8A6D00"
    });
  }
  if (userRole === "admin" && fileWatchStatus && !fileWatchStatus.isRunning) {
    todos.push({
      id: "todo-watch-stopped",
      type: "watch-stopped",
      title: "\uD3F4\uB354 \uAC10\uC2DC \uC911\uB2E8\uB428",
      icon: "warning",
      iconColor: "#C0392B",
      actionKind: "restart-watch",
      actionLabel: "\uB2E4\uC2DC \uC2DC\uC791"
    });
  }
  return todos;
}

// ../ShiftMgmt_V4/src/web/screens/home.ts
var HomeScreen = class {
  container;
  session;
  onSessionExpired;
  destroyed = false;
  loadGeneration = 0;
  sessionExpiredTriggered = false;
  // 상태 데이터
  monthContext = null;
  isLoading = true;
  // 섹션별 데이터 및 오류 상태
  prepData = null;
  prepError = null;
  opsData = null;
  opsError = null;
  kpiData = null;
  kpiError = null;
  settleData = null;
  settleError = null;
  syncState = null;
  recoveryStatus = null;
  fileWatchStatus = null;
  todos = [];
  // 작업 실행 중 상태 (중복 클릭 방지)
  isRetryingRecovery = false;
  isRestartingWatch = false;
  constructor(options) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
  }
  render() {
    this.renderSkeleton();
    void this.loadData();
  }
  destroy() {
    this.destroyed = true;
    this.loadGeneration++;
    this.container.innerHTML = "";
  }
  async refresh() {
    if (this.destroyed) return;
    await this.loadData();
  }
  handleSessionExpired() {
    if (this.sessionExpiredTriggered) return;
    this.sessionExpiredTriggered = true;
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
  }
  async loadData() {
    const currentGen = ++this.loadGeneration;
    this.isLoading = true;
    this.monthContext = getSeoulMonthContext();
    const scheduleMonth = this.monthContext.yearMonth;
    const monthFirstDay = this.monthContext.monthFirstDay;
    const monthLastDay = this.monthContext.monthLastDay;
    const bridge = window.appBridge;
    if (!bridge) {
      this.isLoading = false;
      this.renderError("\uBE0C\uB9AC\uC9C0 \uC778\uD130\uD398\uC774\uC2A4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    try {
      const [
        sitesRes,
        patternsRes,
        schedulesRes,
        exportsRes,
        overviewRes,
        syncStateRes,
        recoveryRes,
        calcResultsRes,
        proposalApprovalsRes,
        docExportsRes,
        watchStatusRes
      ] = await Promise.all([
        bridge.listSites(),
        bridge.listShiftPatterns(),
        bridge.listMonthlySchedules(),
        bridge.listSchedulePlanExports(),
        bridge.listPerformanceOverview({ scheduleMonth, approvalScope: "pending" }),
        bridge.getPerformanceSyncState(),
        bridge.getPerformanceStartupRecoveryStatus(),
        bridge.listCalculationResults(),
        bridge.listAllowanceProposalApprovals(),
        bridge.listAllowanceDocumentExports(),
        this.session.role === "admin" ? bridge.getFileWatchStatus() : Promise.resolve({ ok: true, data: null })
      ]);
      if (this.destroyed || currentGen !== this.loadGeneration) {
        return;
      }
      const allResults = [
        sitesRes,
        patternsRes,
        schedulesRes,
        exportsRes,
        overviewRes,
        syncStateRes,
        recoveryRes,
        calcResultsRes,
        proposalApprovalsRes,
        docExportsRes,
        watchStatusRes
      ];
      for (const res of allResults) {
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") {
          this.handleSessionExpired();
          return;
        }
      }
      this.syncState = syncStateRes.ok ? syncStateRes.data : null;
      this.recoveryStatus = recoveryRes.ok ? recoveryRes.data : null;
      this.fileWatchStatus = watchStatusRes.ok ? watchStatusRes.data : null;
      let allSites = null;
      let activeSites = [];
      const siteEmployeesMap = {};
      if (sitesRes.ok) {
        allSites = sitesRes.data;
        activeSites = allSites.filter((s) => s.status === "active");
        const empResults = await Promise.all(
          activeSites.map((s) => bridge.listEmployees({ siteId: s.id, status: "active" }))
        );
        if (this.destroyed || currentGen !== this.loadGeneration) {
          return;
        }
        for (let i = 0; i < activeSites.length; i++) {
          const empRes = empResults[i];
          if (empRes.ok) {
            siteEmployeesMap[activeSites[i].id] = empRes.data;
          } else if (empRes.errorCode === "AUTH_SESSION_REQUIRED") {
            this.handleSessionExpired();
            return;
          }
        }
        if (patternsRes.ok) {
          this.prepData = calculatePreparationProgress({
            sites: activeSites,
            patterns: patternsRes.data,
            siteEmployeesMap,
            monthFirstDay,
            monthLastDay
          });
          this.prepError = null;
        } else {
          this.prepError = "\uADFC\uBB34 \uC124\uC815 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
          this.prepData = null;
        }
      } else {
        this.prepError = "\uADFC\uBB34\uC9C0 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
        this.prepData = null;
      }
      if (schedulesRes.ok && exportsRes.ok) {
        this.opsData = calculateOperationsProgress({
          activeSites,
          monthlySchedules: schedulesRes.data,
          schedulePlanExports: exportsRes.data,
          scheduleMonth
        });
        this.opsError = null;
      } else {
        this.opsError = "\uADFC\uBB34\uD45C \uBC0F \uBC30\uD3EC \uC774\uB825\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
        this.opsData = null;
      }
      if (overviewRes.ok) {
        this.kpiData = calculatePerformanceOverviewKpis({
          overview: overviewRes.data,
          allSites
          // allSites가 null이면 이름 경고는 failed로 격리
        });
        this.kpiError = null;
      } else {
        this.kpiError = "\uB300\uAE30 \uC2E4\uC801 \uD604\uD669\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
        this.kpiData = null;
      }
      if (calcResultsRes.ok && proposalApprovalsRes.ok && docExportsRes.ok) {
        this.settleData = calculateSettlementProgress({
          calculationResults: calcResultsRes.data,
          proposalApprovals: proposalApprovalsRes.data,
          documentExports: docExportsRes.data,
          scheduleMonth
        });
        this.settleError = null;
      } else {
        this.settleError = "\uC815\uC0B0 \uACC4\uC0B0 \uBC0F \uD488\uC758 \uC774\uB825\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
        this.settleData = null;
      }
      this.todos = determineHomeTodos({
        userRole: this.session.role,
        scheduleMonth,
        kpis: this.kpiData,
        operations: this.opsData,
        syncState: this.syncState,
        recoveryStatus: this.recoveryStatus,
        settlement: this.settleData,
        fileWatchStatus: this.fileWatchStatus
      });
      this.isLoading = false;
      this.renderContent();
    } catch (err) {
      if (this.destroyed || currentGen !== this.loadGeneration) {
        return;
      }
      this.isLoading = false;
      const message = err instanceof Error ? err.message : String(err);
      this.renderError(message || "\uB370\uC774\uD130 \uC870\uD68C \uC911 \uC608\uC0C1\uCE58 \uBABB\uD55C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  // --------------------------------------------------------------------------
  // DOM 렌더링
  // --------------------------------------------------------------------------
  renderSkeleton() {
    this.container.innerHTML = `
      <div class="home-container" aria-busy="true" aria-label="\uB370\uC774\uD130 \uB85C\uB529 \uC911">
        <div class="info-card-blue">
          <span class="material-symbols-outlined icon-spin home-spin-accent" aria-hidden="true">progress_activity</span>
          <div>
            <div class="info-card-title">\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4</div>
            <div class="info-card-desc">\uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824 \uC8FC\uC138\uC694. \uD544\uC694\uD55C \uC815\uBCF4\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.</div>
          </div>
        </div>

        <section class="progress-cards-grid" aria-label="\uC9C4\uD589 \uD604\uD669 \uB85C\uB529 \uC911">
          <div class="progress-card">
            <div class="home-skeleton-row">
              <div class="skeleton skeleton-circle-40"></div>
              <div class="home-skeleton-col">
                <div class="skeleton skeleton-text w-50"></div>
                <div class="skeleton skeleton-text w-30 h-16"></div>
              </div>
            </div>
            <div class="skeleton home-skeleton-bar"></div>
            <div class="skeleton skeleton-text w-80 mt-4"></div>
          </div>
          <div class="progress-card">
            <div class="home-skeleton-row">
              <div class="skeleton skeleton-circle-40"></div>
              <div class="home-skeleton-col">
                <div class="skeleton skeleton-text w-50"></div>
                <div class="skeleton skeleton-text w-30 h-16"></div>
              </div>
            </div>
            <div class="skeleton home-skeleton-bar"></div>
          </div>
          <div class="progress-card">
            <div class="home-skeleton-row">
              <div class="skeleton skeleton-circle-40"></div>
              <div class="home-skeleton-col">
                <div class="skeleton skeleton-text w-50"></div>
                <div class="skeleton skeleton-text w-30 h-16"></div>
              </div>
            </div>
            <div class="skeleton home-skeleton-bar"></div>
          </div>
        </section>

        <section class="section-card" aria-label="\uB300\uAE30 \uC2E4\uC801 \uD604\uD669 \uB85C\uB529 \uC911">
          <div class="section-header">
            <h2 class="section-title">\uC774\uBC88 \uB2EC \uB300\uAE30 \uC2E4\uC801 \uD604\uD669</h2>
          </div>
          <div class="kpi-grid">
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
          </div>
        </section>

        <section class="section-card" aria-label="\uD560 \uC77C \uB85C\uB529 \uC911">
          <div class="section-header">
            <h2 class="section-title">\uC9C0\uAE08 \uD574\uC57C \uD560 \uC77C</h2>
          </div>
          <div>
            <div class="skeleton skeleton-row"></div>
            <div class="skeleton skeleton-row"></div>
            <div class="skeleton skeleton-row"></div>
          </div>
        </section>
      </div>
    `;
  }
  renderError(message) {
    this.container.innerHTML = `
      <div class="home-container">
        <div class="section-error-banner" role="alert">
          <div class="section-error-message">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">error</span>
            <span>${this.escape(message)}</span>
          </div>
          <button type="button" class="btn-secondary btn-sm" id="btn-home-retry">\uB2E4\uC2DC \uC2DC\uB3C4</button>
        </div>
      </div>
    `;
    const retryBtn = this.container.querySelector("#btn-home-retry");
    retryBtn?.addEventListener("click", () => {
      void this.loadData();
    });
  }
  renderContent() {
    this.container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "home-container";
    if (this.syncState && (this.syncState.status === "scanning" || this.syncState.status === "parsing")) {
      const h3Banner = document.createElement("div");
      h3Banner.className = "info-card-blue";
      h3Banner.id = "home-sync-progress-banner";
      h3Banner.innerHTML = `
        <span class="material-symbols-outlined icon-spin icon-18 text-accent" aria-hidden="true">progress_activity</span>
        <div>
          <div class="info-card-title">\uB370\uC774\uD130 \uB3D9\uAE30\uD654 \uC9C4\uD589 \uC911 (${this.syncState.status === "scanning" ? "\uD3F4\uB354 \uAC80\uC0C9 \uC911" : "\uD30C\uC77C \uD574\uC11D \uC911"})</div>
          <div class="info-card-desc">${this.escape(this.syncState.message || "\uC0C8\uB85C\uC6B4 \uC2E4\uC801 \uD30C\uC77C\uC744 \uC77D\uACE0 \uC788\uC2B5\uB2C8\uB2E4.")}</div>
        </div>
      `;
      wrap.appendChild(h3Banner);
    }
    const progressGrid = document.createElement("section");
    progressGrid.className = "progress-cards-grid";
    progressGrid.setAttribute("aria-label", "\uC6D4\uBCC4 \uC5C5\uBB34 \uC9C4\uD589 \uD604\uD669");
    const prepCard = document.createElement("div");
    prepCard.className = "progress-card";
    prepCard.id = "card-progress-prep";
    if (this.prepError) {
      prepCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">domain</span></div>
          <span class="progress-card-title">\uC900\uBE44 (\uD604\uC7AC \uBC30\uC815 \uAE30\uC900)</span>
        </div>
        <div class="section-error-banner mt-8">
          <span>${this.escape(this.prepError)}</span>
        </div>
      `;
    } else if (this.prepData) {
      const { completedCount, targetCount, ratioPercent, isEmpty, label, subtext } = this.prepData;
      prepCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">domain</span></div>
          <span class="progress-card-title">\uC900\uBE44 (\uD604\uC7AC \uBC30\uC815 \uAE30\uC900)</span>
        </div>
        <div class="progress-num-row">
          <span class="stat-num-hero">${completedCount}/${targetCount}</span>
          <span class="stat-unit">\uADFC\uBB34\uC9C0</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${isEmpty ? 0 : ratioPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
          <div class="progress-bar"></div>
        </div>
        <p class="progress-card-subtext">${this.escape(subtext)}</p>
      `;
      const bar = prepCard.querySelector(".progress-bar");
      if (bar) {
        bar.style.width = `${isEmpty ? 0 : ratioPercent}%`;
      }
    }
    progressGrid.appendChild(prepCard);
    const opsCard = document.createElement("div");
    opsCard.className = "progress-card";
    opsCard.id = "card-progress-ops";
    if (this.opsError) {
      opsCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-green" aria-hidden="true"><span class="material-symbols-outlined">calendar_month</span></div>
          <span class="progress-card-title">\uC6B4\uC601</span>
        </div>
        <div class="section-error-banner mt-8">
          <span>${this.escape(this.opsError)}</span>
        </div>
      `;
    } else if (this.opsData) {
      const { completedSteps, totalSteps, ratioPercent, isEmpty, label } = this.opsData;
      opsCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-green" aria-hidden="true"><span class="material-symbols-outlined">calendar_month</span></div>
          <span class="progress-card-title">\uC6B4\uC601</span>
        </div>
        <div class="progress-num-row">
          <span class="stat-num-hero">${completedSteps}/${totalSteps}</span>
          <span class="stat-unit">\uB2E8\uACC4</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${isEmpty ? 0 : ratioPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
          <div class="progress-bar"></div>
        </div>
      `;
      const bar = opsCard.querySelector(".progress-bar");
      if (bar) {
        bar.style.width = `${isEmpty ? 0 : ratioPercent}%`;
      }
    }
    progressGrid.appendChild(opsCard);
    const settleCard = document.createElement("div");
    settleCard.className = "progress-card";
    settleCard.id = "card-progress-settle";
    if (this.settleError) {
      settleCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-orange" aria-hidden="true"><span class="material-symbols-outlined">payments</span></div>
          <span class="progress-card-title">\uC6D4 \uC815\uC0B0</span>
        </div>
        <div class="section-error-banner mt-8">
          <span>${this.escape(this.settleError)}</span>
        </div>
      `;
    } else if (this.settleData) {
      const { completedSteps, totalSteps, ratioPercent, label } = this.settleData;
      settleCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-orange" aria-hidden="true"><span class="material-symbols-outlined">payments</span></div>
          <span class="progress-card-title">\uC6D4 \uC815\uC0B0</span>
        </div>
        <div class="progress-num-row">
          <span class="stat-num-hero">${completedSteps}/${totalSteps}</span>
          <span class="stat-unit">\uB2E8\uACC4</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${ratioPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
          <div class="progress-bar"></div>
        </div>
      `;
      const bar = settleCard.querySelector(".progress-bar");
      if (bar) {
        bar.style.width = `${ratioPercent}%`;
      }
    }
    progressGrid.appendChild(settleCard);
    wrap.appendChild(progressGrid);
    const kpiSection = document.createElement("section");
    kpiSection.className = "section-card";
    kpiSection.id = "section-performance-kpi";
    kpiSection.setAttribute("aria-labelledby", "kpi-heading");
    if (this.kpiError) {
      kpiSection.innerHTML = `
        <div class="section-header">
          <h2 id="kpi-heading" class="section-title">\uC774\uBC88 \uB2EC \uB300\uAE30 \uC2E4\uC801 \uD604\uD669</h2>
        </div>
        <div class="section-error-banner">
          <span>${this.escape(this.kpiError)}</span>
        </div>
      `;
    } else if (this.kpiData) {
      const {
        groupsCount,
        pendingCount,
        needsReapprovalCount,
        alertCount,
        unconnectedSiteNames,
        duplicateSiteNames,
        siteMatchingStatus
      } = this.kpiData;
      let warningsHtml = "";
      if (siteMatchingStatus === "failed") {
        warningsHtml = `
          <div class="warnings-container">
            <div class="warning-item">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">warning</span>
              <span>\uADFC\uBB34\uC9C0 \uBAA9\uB85D \uD655\uC778 \uC2E4\uD328\uB85C \uC774\uB984 \uC5F0\uACB0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</span>
            </div>
          </div>
        `;
      } else if (unconnectedSiteNames.length > 0 || duplicateSiteNames.length > 0) {
        const warningLines = [];
        for (const name of unconnectedSiteNames) {
          warningLines.push(`
            <div class="warning-item">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">warning</span>
              <span>\uADFC\uBB34\uC9C0 \uC5F0\uACB0 \uBD88\uAC00 1\uAC1C (${this.escape(name)})</span>
            </div>
          `);
        }
        for (const name of duplicateSiteNames) {
          warningLines.push(`
            <div class="warning-item">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">warning</span>
              <span>\uC911\uBCF5 \uC774\uB984\uC73C\uB85C \uC5F0\uACB0 \uBD88\uD655\uC815 1\uAC1C (${this.escape(name)})</span>
            </div>
          `);
        }
        warningsHtml = `<div class="warnings-container">${warningLines.join("")}</div>`;
      }
      kpiSection.innerHTML = `
        <div class="section-header">
          <h2 id="kpi-heading" class="section-title">\uC774\uBC88 \uB2EC \uB300\uAE30 \uC2E4\uC801 \uD604\uD669</h2>
        </div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">folder</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">\uB300\uAE30 \uC2E4\uC801 \uADF8\uB8F9</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${groupsCount}</span>
                <span class="stat-unit">\uAC1C</span>
              </div>
            </div>
          </div>
          <div class="kpi-box">
            <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">fact_check</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">\uC2B9\uC778 \uB300\uAE30 \uC2E4\uC801</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${pendingCount}</span>
                <span class="stat-unit">\uAC74</span>
              </div>
            </div>
          </div>
          <div class="kpi-box">
            <div class="icon-circle icon-circle-orange" aria-hidden="true"><span class="material-symbols-outlined">refresh</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">\uC7AC\uC2B9\uC778 \uD544\uC694</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${needsReapprovalCount}</span>
                <span class="stat-unit">\uAC74</span>
              </div>
            </div>
          </div>
          <div class="kpi-box">
            <div class="icon-circle icon-circle-yellow" aria-hidden="true"><span class="material-symbols-outlined">warning</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">\uD655\uC778 \uD544\uC694</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${alertCount}</span>
                <span class="stat-unit">\uAC74</span>
              </div>
            </div>
          </div>
        </div>
        ${warningsHtml}
      `;
    }
    wrap.appendChild(kpiSection);
    const allSuccessful = !this.prepError && !this.opsError && !this.kpiError && !this.settleError;
    if (allSuccessful && this.todos.length === 0) {
      const emptyCard = document.createElement("section");
      emptyCard.className = "empty-state-card";
      emptyCard.id = "section-empty-todos";
      emptyCard.setAttribute("aria-label", "\uD560 \uC77C \uC5C6\uC74C");
      emptyCard.innerHTML = `
        <div class="empty-illustration" aria-hidden="true">
          <span class="deco-dot-1"></span>
          <span class="material-symbols-outlined main-icon">description</span>
          <span class="deco-dot-2"></span>
        </div>
        <h2 class="empty-state-title">\uC774\uBC88 \uB2EC \uCC98\uB9AC\uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</h2>
        <p class="empty-state-desc">\uC900\uBE44\uC640 \uC6B4\uC601\uC744 \uC798 \uC9C4\uD589\uD574 \uC8FC\uC168\uC2B5\uB2C8\uB2E4. \uB2E4\uAC00\uC624\uB294 \uC77C\uC815\uACFC \uC2E4\uC801\uC740 \uC2E4\uC801 \uAD00\uB9AC\uC5D0\uC11C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
      `;
      wrap.appendChild(emptyCard);
    } else {
      const todoSection = document.createElement("section");
      todoSection.className = "section-card";
      todoSection.id = "section-todo-list";
      todoSection.setAttribute("aria-labelledby", "todo-heading");
      const todoHeader = document.createElement("div");
      todoHeader.className = "section-header";
      todoHeader.innerHTML = `<h2 id="todo-heading" class="section-title">\uC9C0\uAE08 \uD574\uC57C \uD560 \uC77C</h2>`;
      todoSection.appendChild(todoHeader);
      const todoList = document.createElement("div");
      todoList.className = "todo-list";
      for (const item of this.todos) {
        const itemEl = document.createElement("div");
        itemEl.className = "todo-item";
        itemEl.id = item.id;
        const titleEl = document.createElement("span");
        titleEl.className = "todo-title";
        titleEl.innerHTML = `
          <span class="material-symbols-outlined icon-18 ${this.getIconColorClass(item.iconColor)}" aria-hidden="true">${item.icon}</span>
          <span>${this.escape(item.title)}</span>
        `;
        itemEl.appendChild(titleEl);
        const actionsEl = document.createElement("div");
        actionsEl.className = "todo-actions";
        if (item.actionKind === "retry-recovery") {
          const actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = "btn-secondary btn-sm";
          actionBtn.id = "btn-retry-recovery";
          actionBtn.textContent = this.isRetryingRecovery ? "\uCC98\uB9AC \uC911\u2026" : item.actionLabel || "\uB2E4\uC2DC \uBCF5\uAD6C";
          actionBtn.disabled = this.isRetryingRecovery;
          actionBtn.addEventListener("click", () => {
            void this.handleRetryRecovery(actionBtn);
          });
          actionsEl.appendChild(actionBtn);
        } else if (item.actionKind === "restart-watch" && this.session.role === "admin") {
          const actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = "btn-secondary btn-sm";
          actionBtn.id = "home-btn-restart-watch";
          actionBtn.textContent = this.isRestartingWatch ? "\uCC98\uB9AC \uC911\u2026" : item.actionLabel || "\uB2E4\uC2DC \uC2DC\uC791";
          actionBtn.disabled = this.isRestartingWatch;
          actionBtn.addEventListener("click", () => {
            void this.handleRestartWatch(actionBtn);
          });
          actionsEl.appendChild(actionBtn);
        }
        itemEl.appendChild(actionsEl);
        todoList.appendChild(itemEl);
      }
      todoSection.appendChild(todoList);
      wrap.appendChild(todoSection);
    }
    this.container.appendChild(wrap);
  }
  // --------------------------------------------------------------------------
  // 실제 액션 핸들러 (중복 클릭 방지)
  // --------------------------------------------------------------------------
  async handleRetryRecovery(button) {
    if (this.isRetryingRecovery) return;
    this.isRetryingRecovery = true;
    button.disabled = true;
    button.textContent = "\uCC98\uB9AC \uC911\u2026";
    const bridge = window.appBridge;
    if (!bridge) {
      this.isRetryingRecovery = false;
      button.disabled = false;
      button.textContent = "\uB2E4\uC2DC \uBCF5\uAD6C";
      return;
    }
    try {
      const res = await bridge.retryPerformanceStartupRecovery();
      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED") {
          this.handleSessionExpired();
          return;
        }
        button.textContent = "\uC2E4\uD328: \uC7AC\uC2DC\uB3C4";
        setTimeout(() => {
          this.isRetryingRecovery = false;
          button.disabled = false;
          button.textContent = "\uB2E4\uC2DC \uBCF5\uAD6C";
        }, 2e3);
        return;
      }
      this.isRetryingRecovery = false;
      await this.refresh();
    } catch {
      button.textContent = "\uC624\uB958: \uC7AC\uC2DC\uB3C4";
      setTimeout(() => {
        this.isRetryingRecovery = false;
        button.disabled = false;
        button.textContent = "\uB2E4\uC2DC \uBCF5\uAD6C";
      }, 2e3);
    }
  }
  async handleRestartWatch(button) {
    if (this.isRestartingWatch) return;
    this.isRestartingWatch = true;
    button.disabled = true;
    button.textContent = "\uCC98\uB9AC \uC911\u2026";
    const bridge = window.appBridge;
    if (!bridge) {
      this.isRestartingWatch = false;
      button.disabled = false;
      button.textContent = "\uB2E4\uC2DC \uC2DC\uC791";
      return;
    }
    try {
      const res = await bridge.restartFileWatch();
      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED") {
          this.handleSessionExpired();
          return;
        }
        button.textContent = "\uC2E4\uD328: \uC7AC\uC2DC\uB3C4";
        setTimeout(() => {
          this.isRestartingWatch = false;
          button.disabled = false;
          button.textContent = "\uB2E4\uC2DC \uC2DC\uC791";
        }, 2e3);
        return;
      }
      this.isRestartingWatch = false;
      await this.refresh();
    } catch {
      button.textContent = "\uC624\uB958: \uC7AC\uC2DC\uB3C4";
      setTimeout(() => {
        this.isRestartingWatch = false;
        button.disabled = false;
        button.textContent = "\uB2E4\uC2DC \uC2DC\uC791";
      }, 2e3);
    }
  }
  escape(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  getIconColorClass(hex) {
    switch (String(hex).toUpperCase()) {
      case "#3E56B6":
        return "icon-color-blue";
      case "#A05200":
        return "icon-color-orange";
      case "#C0392B":
        return "icon-color-red";
      case "#1E7A46":
        return "icon-color-green";
      case "#4B5563":
        return "icon-color-gray";
      case "#8A6D00":
        return "icon-color-yellow";
      default:
        return "icon-color-gray";
    }
  }
};

// ../ShiftMgmt_V4/src/shared/bridge/channel-contracts.ts
var CHANNEL_CONTRACTS = [
  {
    method: "listAccessLogs",
    channel: "access-logs:list",
    group: "core",
    guard: "accessHistory",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "recordAccessLog",
    channel: "access-logs:record",
    group: "core",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "approveAllowanceProposal",
    channel: "allowance:approve-proposal",
    group: "allowance",
    guard: "action",
    actionPermission: "allowance-approval",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "exportAllowanceDocuments",
    channel: "allowance:export-documents",
    group: "allowance",
    guard: "session",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "listAllowanceApprovalHistory",
    channel: "allowance:list-approval-history",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listApprovedTargets",
    channel: "allowance:list-approved-targets",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listAllowanceDocumentExports",
    channel: "allowance:list-document-exports",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listCalculationHistory",
    channel: "allowance:list-history",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listAllowanceProposalApprovals",
    channel: "allowance:list-proposal-approvals",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listCalculationResults",
    channel: "allowance:list-results",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "previewCalculation",
    channel: "allowance:preview-calculation",
    group: "allowance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "previewAllowanceProposal",
    channel: "allowance:preview-proposal",
    group: "allowance",
    guard: "session",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "reviewAllowanceCalculations",
    channel: "allowance:review-calculations",
    group: "allowance",
    guard: "action",
    actionPermission: "allowance-approval",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "runApprovedCalculation",
    channel: "allowance:run-approved-calculation",
    group: "allowance",
    guard: "session",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "setCalculationEarlyPayout",
    channel: "allowance:set-early-payout",
    group: "allowance",
    guard: "session",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "checkForAppUpdate",
    channel: "app:check-for-update",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "dismissUpdateNotice",
    channel: "app:dismiss-update-notice",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "downloadAppUpdate",
    channel: "app:download-update",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "getAppHealth",
    channel: "app:get-health",
    group: "core",
    guard: "none",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "getUpdateState",
    channel: "app:get-update-state",
    group: "core",
    guard: "none",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "getAppVersion",
    channel: "app:get-version",
    group: "core",
    guard: "none",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "installDownloadedUpdate",
    channel: "app:install-update",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "changePassword",
    channel: "auth:change-password",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "getAccountRecoveryAvailability",
    channel: "auth:get-account-recovery-availability",
    group: "core",
    guard: "none",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "getSession",
    channel: "auth:get-session",
    group: "core",
    guard: "none",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "recoverAdminAccount",
    channel: "auth:recover-admin-account",
    group: "core",
    guard: "none",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "signIn",
    channel: "auth:sign-in",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "signOut",
    channel: "auth:sign-out",
    group: "core",
    guard: "none",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "exportDashboardChartData",
    channel: "dashboard:export-chart-data",
    group: "core",
    guard: "session",
    recordsActivity: true,
    dialog: "saveFile",
    usesDataDir: true
  },
  {
    method: "exportDashboardReport",
    channel: "dashboard:export-report",
    group: "core",
    guard: "session",
    recordsActivity: true,
    dialog: "saveFile",
    usesDataDir: true
  },
  {
    method: "applyWorkforceWageBulkUpdate",
    channel: "employees:apply-wage-bulk-update",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "closeEmployeeAssignment",
    channel: "employees:close-assignment",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "closeEmployeeWageRate",
    channel: "employees:close-wage-rate",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "deleteEmployee",
    channel: "employees:delete",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "listEmployees",
    channel: "employees:list",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listEmployeeAssignments",
    channel: "employees:list-assignments",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listEmployeeWageRates",
    channel: "employees:list-wage-rates",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "previewWorkforceWageBulkUpdate",
    channel: "employees:preview-wage-bulk-update",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "reorderEmployeeAssignment",
    channel: "employees:reorder-assignment",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "saveEmployee",
    channel: "employees:save",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "saveEmployeeAssignment",
    channel: "employees:save-assignment",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "saveEmployeeWageRate",
    channel: "employees:save-wage-rate",
    group: "workforce",
    guard: "action",
    actionPermission: "employee-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "exportMonthlySchedulePlan",
    channel: "monthly-schedules:export-plan",
    group: "workforce",
    guard: "action",
    actionPermission: "schedule-deploy",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "listMonthlySchedules",
    channel: "monthly-schedules:list",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listSchedulePlanExports",
    channel: "monthly-schedules:list-exports",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "previewMonthlySchedulePlan",
    channel: "monthly-schedules:preview-plan",
    group: "workforce",
    guard: "session",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "publishSchedulePlanExport",
    channel: "monthly-schedules:publish-export",
    group: "workforce",
    guard: "action",
    actionPermission: "schedule-deploy",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "saveMonthlySchedule",
    channel: "monthly-schedules:save",
    group: "workforce",
    guard: "action",
    actionPermission: "schedule-deploy",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "addHolidayItem",
    channel: "operations:add-holiday-item",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "checkDatabaseMigrationRequirements",
    channel: "operations:check-database-migration-requirements",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "deleteAllowanceRateVersion",
    channel: "operations:delete-allowance-rate-version",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "deleteHolidayItem",
    channel: "operations:delete-holiday-item",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "deleteSiteNameOption",
    channel: "operations:delete-site-name-option",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "deleteOperationUser",
    channel: "operations:delete-user",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "fetchHolidayApiItems",
    channel: "operations:fetch-holiday-api-items",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "getAppSettings",
    channel: "operations:get-app-settings",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "getDocumentLayout",
    channel: "operations:get-document-layout",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "getFileWatchStatus",
    channel: "operations:get-file-watch-status",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "listAllowanceRateHistory",
    channel: "operations:list-allowance-rate-history",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listAllowanceRateVersions",
    channel: "operations:list-allowance-rate-versions",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listDocumentLayoutHistory",
    channel: "operations:list-document-layout-history",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listDocumentLayouts",
    channel: "operations:list-document-layouts",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listHolidayCalendars",
    channel: "operations:list-holiday-calendars",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listReleaseHistory",
    channel: "operations:list-release-history",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listSiteNameOptions",
    channel: "operations:list-site-name-options",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listOperationUsers",
    channel: "operations:list-users",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "previewDatabaseMigrationUpdate",
    channel: "operations:preview-database-migration-update",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "previewDocumentLayout",
    channel: "operations:preview-document-layout",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "renameHolidayItem",
    channel: "operations:rename-holiday-item",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "replaceHolidayCalendar",
    channel: "operations:replace-holiday-calendar",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "resetDocumentLayout",
    channel: "operations:reset-document-layout",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "restartFileWatch",
    channel: "operations:restart-file-watch",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "rotateAccountRecoveryKey",
    channel: "operations:rotate-account-recovery-key",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "runDatabaseBackupNow",
    channel: "operations:run-database-backup-now",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "saveAllowanceRateVersion",
    channel: "operations:save-allowance-rate-version",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "saveAppSettings",
    channel: "operations:save-app-settings",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "saveDocumentLayout",
    channel: "operations:save-document-layout",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "saveSiteNameOption",
    channel: "operations:save-site-name-option",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "saveOperationUser",
    channel: "operations:save-user",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "selectDirectory",
    channel: "operations:select-directory",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    dialog: "openFolder",
    usesDataDir: false
  },
  {
    method: "selectJsonBackupFile",
    channel: "operations:select-json-backup-file",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    dialog: "openFile",
    usesDataDir: false
  },
  {
    method: "selectSpreadsheetFile",
    channel: "operations:select-spreadsheet-file",
    group: "operations",
    guard: "admin",
    recordsActivity: false,
    dialog: "openFile",
    usesDataDir: false
  },
  {
    method: "stopFileWatch",
    channel: "operations:stop-file-watch",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "updateDatabaseFromMigration",
    channel: "operations:update-database-from-migration",
    group: "operations",
    guard: "admin",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "approvePendingFile",
    channel: "performance:approve",
    group: "performance",
    guard: "action",
    actionPermission: "performance-approval",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "finalizeReapprovedFile",
    channel: "performance:finalize-reapproved-file",
    group: "performance",
    guard: "action",
    actionPermission: "performance-approval",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "getPerformanceComparison",
    channel: "performance:get-comparison",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "getPerformanceFileDetail",
    channel: "performance:get-file-detail",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "getPendingFileDetail",
    channel: "performance:get-pending-file-detail",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "getPerformanceStartupRecoveryStatus",
    channel: "performance:get-startup-recovery-status",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "getPerformanceSyncState",
    channel: "performance:get-sync-state",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "hideApprovedRow",
    channel: "performance:hide-approved-row",
    group: "performance",
    guard: "action",
    actionPermission: "performance-approval",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "listApprovalHistory",
    channel: "performance:list-approval-history",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "listPerformanceFiles",
    channel: "performance:list-files",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "listPerformanceOverview",
    channel: "performance:list-overview",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "listPendingFiles",
    channel: "performance:list-pending-files",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "openPerformanceSourceFile",
    channel: "performance:open-source-file",
    group: "performance",
    guard: "session",
    recordsActivity: true,
    dialog: "openPath",
    usesDataDir: false
  },
  {
    method: "rejectPendingFile",
    channel: "performance:reject",
    group: "performance",
    guard: "action",
    actionPermission: "performance-approval",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "retryPerformanceStartupRecovery",
    channel: "performance:retry-startup-recovery",
    group: "performance",
    guard: "session",
    recordsActivity: false,
    usesDataDir: true
  },
  {
    method: "returnApprovedFileToPending",
    channel: "performance:return-to-pending",
    group: "performance",
    guard: "action",
    actionPermission: "performance-approval",
    recordsActivity: true,
    usesDataDir: true
  },
  {
    method: "analyzeSitePatternImport",
    channel: "shift-patterns:analyze-import",
    group: "workforce",
    guard: "session",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "deactivateShiftPattern",
    channel: "shift-patterns:deactivate",
    group: "workforce",
    guard: "action",
    actionPermission: "shift-pattern-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "listShiftPatterns",
    channel: "shift-patterns:list",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "saveShiftPattern",
    channel: "shift-patterns:save",
    group: "workforce",
    guard: "action",
    actionPermission: "shift-pattern-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "deleteSite",
    channel: "sites:delete",
    group: "workforce",
    guard: "action",
    actionPermission: "site-write",
    recordsActivity: true,
    usesDataDir: false
  },
  {
    method: "listSites",
    channel: "sites:list",
    group: "workforce",
    guard: "session",
    recordsActivity: false,
    usesDataDir: false
  },
  {
    method: "saveSite",
    channel: "sites:save",
    group: "workforce",
    guard: "action",
    actionPermission: "site-write",
    recordsActivity: true,
    usesDataDir: false
  }
];
var CORE_CHANNELS = CHANNEL_CONTRACTS.filter(
  (contract) => contract.group === "core"
).map((contract) => contract.channel);
var channelMap = new Map(
  CHANNEL_CONTRACTS.map((contract) => [contract.channel, contract])
);
var methodMap = new Map(
  CHANNEL_CONTRACTS.map((contract) => [contract.method, contract])
);

// ../ShiftMgmt_V4/src/web/bridge/app-bridge.ts
var trimTrailingUndefined = (args) => {
  const copy = [...args];
  while (copy.length > 0 && copy[copy.length - 1] === void 0) {
    copy.pop();
  }
  return copy;
};
var isValidBridgeResult = (val) => {
  if (typeof val !== "object" || val === null) {
    return false;
  }
  if ("ok" in val) {
    if (val.ok === true) {
      return Object.prototype.hasOwnProperty.call(val, "data");
    }
    if (val.ok === false) {
      return typeof val.errorCode === "string" && typeof val.message === "string";
    }
  }
  return false;
};
var createBrowserAppBridge = (customFetch = fetch) => {
  const bridge = {};
  for (const contract of CHANNEL_CONTRACTS) {
    const { method, channel } = contract;
    if (method === "getAppVersion") {
      bridge[method] = async (...args) => {
        const trimmedArgs = trimTrailingUndefined(args);
        let response;
        try {
          response = await customFetch(`/api/${channel}`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(trimmedArgs)
          });
        } catch (error) {
          throw new Error(
            `Failed to fetch app version: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        if (!response.ok) {
          throw new Error(`Failed to fetch app version: HTTP status ${response.status}`);
        }
        let parsed;
        try {
          parsed = await response.json();
        } catch (error) {
          throw new Error(
            `Failed to parse app version as JSON: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        if (typeof parsed !== "string") {
          throw new Error(`Expected app version string, received ${typeof parsed}`);
        }
        return parsed;
      };
      continue;
    }
    bridge[method] = async (...args) => {
      const trimmedArgs = trimTrailingUndefined(args);
      let response;
      try {
        response = await customFetch(`/api/${channel}`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(trimmedArgs)
        });
      } catch {
        return {
          ok: false,
          errorCode: "NETWORK_ERROR",
          message: "\uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD504\uB85C\uADF8\uB7A8\uC774 \uCF1C\uC838 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694."
        };
      }
      let parsed;
      try {
        parsed = await response.json();
      } catch {
        return {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "\uC11C\uBC84 \uC751\uB2F5\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
        };
      }
      if (!isValidBridgeResult(parsed)) {
        return {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "\uC11C\uBC84 \uC751\uB2F5\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
        };
      }
      return parsed;
    };
  }
  return bridge;
};
var installBrowserAppBridge = (customFetch) => {
  if (typeof window !== "undefined") {
    if (!window.appBridge) {
      window.appBridge = createBrowserAppBridge(customFetch);
    }
    return window.appBridge;
  }
  return createBrowserAppBridge(customFetch);
};
installBrowserAppBridge();

// .ai/reports/verification-3-1c-20260930/probe-entry.ts
installBrowserAppBridge();
window.expiredCalls = 0;
window.reviewHome = new HomeScreen({
  container: document.getElementById("main-content"),
  session: { role: "admin", userId: "fixture-admin", displayName: "\uAC80\uC99D\uC6A9 \uAD00\uB9AC\uC790" },
  onSessionExpired: () => {
    window.expiredCalls++;
  }
});
window.reviewHome.render();
