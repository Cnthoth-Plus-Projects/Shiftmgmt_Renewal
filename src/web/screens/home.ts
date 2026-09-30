import type { AuthSession, EmployeeRecord, SiteRecord } from "../../shared/domain/model";
import type {
  PerformanceFileSyncStateSnapshot,
  PerformanceStartupRecoveryStatusSnapshot,
} from "../../shared/domain/performance-file";
import type { FileWatchStatusSnapshot } from "../../shared/bridge/contracts";
import {
  calculateOperationsProgress,
  calculatePerformanceOverviewKpis,
  calculatePreparationProgress,
  calculateSettlementProgress,
  determineHomeTodos,
  getSeoulMonthContext,
  type HomeTodoItem,
  type OperationsProgress,
  type PerformanceOverviewKpis,
  type PreparationProgress,
  type SeoulMonthContext,
  type SettlementProgress,
} from "./home-model";

export interface HomeScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
}

export class HomeScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;
  private destroyed = false;
  private loadGeneration = 0;
  private sessionExpiredTriggered = false;

  // 상태 데이터
  private monthContext: SeoulMonthContext | null = null;
  private isLoading = true;

  // 섹션별 데이터 및 오류 상태
  private prepData: PreparationProgress | null = null;
  private prepError: string | null = null;

  private opsData: OperationsProgress | null = null;
  private opsError: string | null = null;

  private kpiData: PerformanceOverviewKpis | null = null;
  private kpiError: string | null = null;

  private settleData: SettlementProgress | null = null;
  private settleError: string | null = null;

  private syncState: PerformanceFileSyncStateSnapshot | null = null;
  private syncError: string | null = null;
  private recoveryStatus: PerformanceStartupRecoveryStatusSnapshot | null = null;
  private recoveryError: string | null = null;
  private fileWatchStatus: FileWatchStatusSnapshot | null = null;
  private watchError: string | null = null;

  private todos: HomeTodoItem[] = [];

  // 각 요청이 자신의 잠금만 정리하며, 결과 반영은 현재 조회 세대에서만 허용한다.
  private homeActions = {
    "retry-recovery": { busy: false, ticket: 0, error: null as string | null },
    "restart-watch": { busy: false, ticket: 0, error: null as string | null },
  };

  constructor(options: HomeScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
  }

  public render(): void {
    void this.loadData();
  }

  public destroy(): void {
    this.destroyed = true;
    this.loadGeneration++;
    for (const action of Object.values(this.homeActions)) {
      action.ticket++;
      action.busy = false;
    }
    this.container.innerHTML = "";
  }

  public async refresh(): Promise<void> {
    if (this.destroyed) return;
    await this.loadData();
  }

  private handleSessionExpired(): void {
    if (this.sessionExpiredTriggered) return;
    this.sessionExpiredTriggered = true;
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
  }

  private async loadData(): Promise<void> {
    const currentGen = ++this.loadGeneration;
    this.isLoading = true;
    this.renderSkeleton();
    this.monthContext = getSeoulMonthContext();

    const scheduleMonth = this.monthContext.yearMonth;
    const monthFirstDay = this.monthContext.monthFirstDay;
    const monthLastDay = this.monthContext.monthLastDay;

    const bridge = window.appBridge;
    if (!bridge) {
      this.isLoading = false;
      this.renderError("브리지 인터페이스를 찾을 수 없습니다.");
      return;
    }

    try {
      // 1. 1차 병렬 조회
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
        watchStatusRes,
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
        this.session.role === "admin" ? bridge.getFileWatchStatus() : Promise.resolve({ ok: true as const, data: null }),
      ]);

      if (this.destroyed || currentGen !== this.loadGeneration) {
        return;
      }

      // 세션 만료 검사
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
        watchStatusRes,
      ];

      for (const res of allResults) {
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") {
          this.handleSessionExpired();
          return;
        }
      }

      // 동기화 상태 및 복구 상태 보관 (성공/오류 구분)
      if (syncStateRes.ok) {
        this.syncState = syncStateRes.data;
        this.syncError = null;
      } else {
        this.syncState = null;
        this.syncError = "동기화 상태를 불러오지 못했습니다.";
      }

      if (recoveryRes.ok) {
        this.recoveryStatus = recoveryRes.data;
        this.recoveryError = null;
      } else {
        this.recoveryStatus = null;
        this.recoveryError = "자동 복구 상태를 불러오지 못했습니다.";
      }

      if (this.session.role === "admin") {
        if (watchStatusRes.ok) {
          this.fileWatchStatus = watchStatusRes.data;
          this.watchError = null;
        } else {
          this.fileWatchStatus = null;
          this.watchError = "파일 감시 상태를 불러오지 못했습니다.";
        }
      } else {
        this.fileWatchStatus = null;
        this.watchError = null;
      }

      // 2. 준비 섹션 계산을 위한 활성 근무지별 직원 조회
      let allSites: SiteRecord[] | null = null;
      let activeSites: SiteRecord[] = [];
      const siteEmployeesMap: Record<string, EmployeeRecord[]> = {};

      if (sitesRes.ok) {
        allSites = sitesRes.data;
        activeSites = allSites.filter((s) => s.status === "active");

        // active site별 listEmployees 병렬 조회
        const empResults = await Promise.all(
          activeSites.map((s) => bridge.listEmployees({ siteId: s.id, status: "active" }))
        );

        if (this.destroyed || currentGen !== this.loadGeneration) {
          return;
        }

        let hasEmpFailure = false;
        for (let i = 0; i < activeSites.length; i++) {
          const empRes = empResults[i];
          if (empRes.ok) {
            siteEmployeesMap[activeSites[i].id] = empRes.data;
          } else if (empRes.errorCode === "AUTH_SESSION_REQUIRED") {
            this.handleSessionExpired();
            return;
          } else {
            hasEmpFailure = true;
          }
        }

        if (hasEmpFailure) {
          this.prepError = "근무지별 재직 인원을 불러오지 못했습니다.";
          this.prepData = null;
        } else if (patternsRes.ok) {
          this.prepData = calculatePreparationProgress({
            sites: activeSites,
            patterns: patternsRes.data,
            siteEmployeesMap,
            monthFirstDay,
            monthLastDay,
          });
          this.prepError = null;
        } else {
          this.prepError = "근무 설정 목록을 불러오지 못했습니다.";
          this.prepData = null;
        }
      } else {
        this.prepError = "근무지 목록을 불러오지 못했습니다.";
        this.prepData = null;
      }

      // 3. 운영 섹션 계산 (sites, schedules, exports 모두 성공해야 집계)
      if (sitesRes.ok && schedulesRes.ok && exportsRes.ok) {
        this.opsData = calculateOperationsProgress({
          activeSites,
          monthlySchedules: schedulesRes.data,
          schedulePlanExports: exportsRes.data,
          scheduleMonth,
        });
        this.opsError = null;
      } else {
        this.opsError = !sitesRes.ok
          ? "근무지 목록을 불러오지 못해 운영 현황을 확인할 수 없습니다."
          : "근무표 및 배포 이력을 불러오지 못했습니다.";
        this.opsData = null;
      }

      // 4. 대기 실적 현황 계산
      if (overviewRes.ok) {
        this.kpiData = calculatePerformanceOverviewKpis({
          overview: overviewRes.data,
          allSites, // allSites가 null이면 이름 경고는 failed로 격리
        });
        this.kpiError = null;
      } else {
        this.kpiError = "대기 실적 현황을 불러오지 못했습니다.";
        this.kpiData = null;
      }

      // 5. 정산 섹션 계산
      if (calcResultsRes.ok && proposalApprovalsRes.ok && docExportsRes.ok) {
        this.settleData = calculateSettlementProgress({
          calculationResults: calcResultsRes.data,
          proposalApprovals: proposalApprovalsRes.data,
          documentExports: docExportsRes.data,
          scheduleMonth,
        });
        this.settleError = null;
      } else {
        this.settleError = "정산 계산 및 품의 이력을 불러오지 못했습니다.";
        this.settleData = null;
      }

      // 6. 할 일 목록 판정
      this.todos = determineHomeTodos({
        userRole: this.session.role,
        scheduleMonth,
        kpis: this.kpiData,
        operations: this.opsData,
        syncState: this.syncState,
        recoveryStatus: this.recoveryStatus,
        settlement: this.settleData,
        fileWatchStatus: this.fileWatchStatus,
      });

      this.isLoading = false;
      this.renderContent();
    } catch (err: unknown) {
      if (this.destroyed || currentGen !== this.loadGeneration) {
        return;
      }
      this.isLoading = false;
      const message = err instanceof Error ? err.message : String(err);
      this.renderError(message || "데이터 조회 중 예상치 못한 오류가 발생했습니다.");
    }
  }

  // --------------------------------------------------------------------------
  // DOM 렌더링
  // --------------------------------------------------------------------------

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <div class="home-container" aria-busy="true" aria-label="데이터 로딩 중">
        <div class="info-card-blue">
          <span class="material-symbols-outlined icon-spin home-spin-accent" aria-hidden="true">progress_activity</span>
          <div>
            <div class="info-card-title">데이터를 불러오는 중입니다</div>
            <div class="info-card-desc">잠시만 기다려 주세요. 필요한 정보를 준비하고 있습니다.</div>
          </div>
        </div>

        <section class="progress-cards-grid" aria-label="진행 현황 로딩 중">
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

        <section class="section-card" aria-label="대기 실적 현황 로딩 중">
          <div class="section-header">
            <h2 class="section-title">이번 달 대기 실적 현황</h2>
          </div>
          <div class="kpi-grid">
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
          </div>
        </section>

        <section class="section-card" aria-label="할 일 로딩 중">
          <div class="section-header">
            <h2 class="section-title">지금 해야 할 일</h2>
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

  private renderError(message: string): void {
    this.container.innerHTML = `
      <div class="home-container">
        <div class="section-error-banner" role="alert">
          <div class="section-error-message">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">error</span>
            <span>${this.escape(message)}</span>
          </div>
          <button type="button" class="btn-secondary btn-sm" id="btn-home-retry">다시 시도</button>
        </div>
      </div>
    `;
    const retryBtn = this.container.querySelector("#btn-home-retry");
    retryBtn?.addEventListener("click", () => {
      void this.loadData();
    });
  }

  private renderContent(): void {
    this.container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "home-container";

    // 1. H3: 실제 해석/동기화 진행 중 배너 (scanning 또는 parsing)
    if (this.syncState && (this.syncState.status === "scanning" || this.syncState.status === "parsing")) {
      const h3Banner = document.createElement("div");
      h3Banner.className = "info-card-blue";
      h3Banner.id = "home-sync-progress-banner";
      h3Banner.innerHTML = `
        <span class="material-symbols-outlined icon-spin icon-18 text-accent" aria-hidden="true">progress_activity</span>
        <div>
          <div class="info-card-title">데이터 동기화 진행 중 (${this.syncState.status === "scanning" ? "폴더 검색 중" : "파일 해석 중"})</div>
          <div class="info-card-desc">${this.escape(this.syncState.message || "새로운 실적 파일을 읽고 있습니다.")}</div>
        </div>
      `;
      wrap.appendChild(h3Banner);
    }

    // 2. 3대 진행률 카드 그리드 (준비, 운영, 정산)
    const progressGrid = document.createElement("section");
    progressGrid.className = "progress-cards-grid";
    progressGrid.setAttribute("aria-label", "월별 업무 진행 현황");

    // 2-A. 준비 카드
    const prepCard = document.createElement("div");
    prepCard.className = "progress-card";
    prepCard.id = "card-progress-prep";
    if (this.prepError) {
      prepCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">domain</span></div>
          <span class="progress-card-title">준비 (현재 배정 기준)</span>
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
          <span class="progress-card-title">준비 (현재 배정 기준)</span>
        </div>
        <div class="progress-num-row">
          <span class="stat-num-hero">${completedCount}/${targetCount}</span>
          <span class="stat-unit">근무지</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${isEmpty ? 0 : ratioPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
          <div class="progress-bar"></div>
        </div>
        <p class="progress-card-subtext">${this.escape(subtext)}</p>
      `;
      const bar = prepCard.querySelector<HTMLElement>(".progress-bar");
      if (bar) {
        bar.style.width = `${isEmpty ? 0 : ratioPercent}%`;
      }
    }
    progressGrid.appendChild(prepCard);

    // 2-B. 운영 카드
    const opsCard = document.createElement("div");
    opsCard.className = "progress-card";
    opsCard.id = "card-progress-ops";
    if (this.opsError) {
      opsCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-green" aria-hidden="true"><span class="material-symbols-outlined">calendar_month</span></div>
          <span class="progress-card-title">운영</span>
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
          <span class="progress-card-title">운영</span>
        </div>
        <div class="progress-num-row">
          <span class="stat-num-hero">${completedSteps}/${totalSteps}</span>
          <span class="stat-unit">단계</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${isEmpty ? 0 : ratioPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
          <div class="progress-bar"></div>
        </div>
      `;
      const bar = opsCard.querySelector<HTMLElement>(".progress-bar");
      if (bar) {
        bar.style.width = `${isEmpty ? 0 : ratioPercent}%`;
      }
    }
    progressGrid.appendChild(opsCard);

    // 2-C. 정산 카드
    const settleCard = document.createElement("div");
    settleCard.className = "progress-card";
    settleCard.id = "card-progress-settle";
    if (this.settleError) {
      settleCard.innerHTML = `
        <div class="progress-card-header">
          <div class="icon-circle icon-circle-orange" aria-hidden="true"><span class="material-symbols-outlined">payments</span></div>
          <span class="progress-card-title">월 정산</span>
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
          <span class="progress-card-title">월 정산</span>
        </div>
        <div class="progress-num-row">
          <span class="stat-num-hero">${completedSteps}/${totalSteps}</span>
          <span class="stat-unit">단계</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${ratioPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
          <div class="progress-bar"></div>
        </div>
      `;
      const bar = settleCard.querySelector<HTMLElement>(".progress-bar");
      if (bar) {
        bar.style.width = `${ratioPercent}%`;
      }
    }
    progressGrid.appendChild(settleCard);

    wrap.appendChild(progressGrid);

    // 3. 이번 달 대기 실적 현황 섹션 (버튼 0개 엄수)
    const kpiSection = document.createElement("section");
    kpiSection.className = "section-card";
    kpiSection.id = "section-performance-kpi";
    kpiSection.setAttribute("aria-labelledby", "kpi-heading");

    if (this.kpiError) {
      kpiSection.innerHTML = `
        <div class="section-header">
          <h2 id="kpi-heading" class="section-title">이번 달 대기 실적 현황</h2>
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
        siteMatchingStatus,
      } = this.kpiData;

      let warningsHtml = "";
      if (siteMatchingStatus === "failed") {
        warningsHtml = `
          <div class="warnings-container">
            <div class="warning-item">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">warning</span>
              <span>근무지 목록 확인 실패로 이름 연결 상태를 확인할 수 없습니다.</span>
            </div>
          </div>
        `;
      } else if (unconnectedSiteNames.length > 0 || duplicateSiteNames.length > 0) {
        const warningLines: string[] = [];
        for (const name of unconnectedSiteNames) {
          warningLines.push(`
            <div class="warning-item">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">warning</span>
              <span>근무지 연결 불가 1개 (${this.escape(name)})</span>
            </div>
          `);
        }
        for (const name of duplicateSiteNames) {
          warningLines.push(`
            <div class="warning-item">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">warning</span>
              <span>중복 이름으로 연결 불확정 1개 (${this.escape(name)})</span>
            </div>
          `);
        }
        warningsHtml = `<div class="warnings-container">${warningLines.join("")}</div>`;
      }

      kpiSection.innerHTML = `
        <div class="section-header">
          <h2 id="kpi-heading" class="section-title">이번 달 대기 실적 현황</h2>
        </div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">folder</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">대기 실적 그룹</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${groupsCount}</span>
                <span class="stat-unit">개</span>
              </div>
            </div>
          </div>
          <div class="kpi-box">
            <div class="icon-circle icon-circle-blue" aria-hidden="true"><span class="material-symbols-outlined">fact_check</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">승인 대기 실적</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${pendingCount}</span>
                <span class="stat-unit">건</span>
              </div>
            </div>
          </div>
          <div class="kpi-box">
            <div class="icon-circle icon-circle-orange" aria-hidden="true"><span class="material-symbols-outlined">refresh</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">재승인 필요</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${needsReapprovalCount}</span>
                <span class="stat-unit">건</span>
              </div>
            </div>
          </div>
          <div class="kpi-box">
            <div class="icon-circle icon-circle-yellow" aria-hidden="true"><span class="material-symbols-outlined">warning</span></div>
            <div class="kpi-text-wrap">
              <span class="kpi-label">확인 필요</span>
              <div class="kpi-val-wrap">
                <span class="stat-num-hero">${alertCount}</span>
                <span class="stat-unit">건</span>
              </div>
            </div>
          </div>
        </div>
        ${warningsHtml}
      `;
    }
    wrap.appendChild(kpiSection);

    // 4. 지금 해야 할 일 섹션 or H4 빈 상태
    const allSuccessful =
      !this.prepError &&
      !this.opsError &&
      !this.kpiError &&
      !this.settleError &&
      !this.syncError &&
      !this.recoveryError &&
      (this.session.role !== "admin" || !this.watchError);

    if (allSuccessful && this.todos.length === 0) {
      // H4: 진짜 할 일 없음 (버튼 0개)
      const emptyCard = document.createElement("section");
      emptyCard.className = "empty-state-card";
      emptyCard.id = "section-empty-todos";
      emptyCard.setAttribute("aria-label", "할 일 없음");
      emptyCard.innerHTML = `
        <div class="empty-illustration" aria-hidden="true">
          <span class="deco-dot-1"></span>
          <span class="material-symbols-outlined main-icon">description</span>
          <span class="deco-dot-2"></span>
        </div>
        <h2 class="empty-state-title">이번 달 처리할 일이 없습니다</h2>
        <p class="empty-state-desc">준비와 운영을 잘 진행해 주셨습니다. 다가오는 일정과 실적은 실적 관리에서 확인할 수 있습니다.</p>
      `;
      wrap.appendChild(emptyCard);
    } else {
      // H1/H2: 할 일 목록 섹션
      const todoSection = document.createElement("section");
      todoSection.className = "section-card";
      todoSection.id = "section-todo-list";
      todoSection.setAttribute("aria-labelledby", "todo-heading");

      const todoHeader = document.createElement("div");
      todoHeader.className = "section-header";
      todoHeader.innerHTML = `<h2 id="todo-heading" class="section-title">지금 해야 할 일</h2>`;
      todoSection.appendChild(todoHeader);

      const todoList = document.createElement("div");
      todoList.className = "todo-list";

      // 조회 실패 오류 안내 항목 표출 (R31C-03)
      if (this.syncError) {
        const errEl = document.createElement("div");
        errEl.className = "todo-item";
        errEl.id = "todo-item-sync-error";
        errEl.innerHTML = `
          <span class="todo-title">
            <span class="material-symbols-outlined icon-18 icon-color-red" aria-hidden="true">error</span>
            <span>${this.escape(this.syncError)}</span>
          </span>
          <div class="todo-actions">
            <span class="todo-reason">동기화 상태 확인 실패</span>
          </div>
        `;
        todoList.appendChild(errEl);
      }

      if (this.recoveryError) {
        const errEl = document.createElement("div");
        errEl.className = "todo-item";
        errEl.id = "todo-item-recovery-error";
        errEl.innerHTML = `
          <span class="todo-title">
            <span class="material-symbols-outlined icon-18 icon-color-red" aria-hidden="true">error</span>
            <span>${this.escape(this.recoveryError)}</span>
          </span>
          <div class="todo-actions">
            <span class="todo-reason">자동 복구 상태 확인 실패</span>
          </div>
        `;
        todoList.appendChild(errEl);
      }

      if (this.session.role === "admin" && this.watchError) {
        const errEl = document.createElement("div");
        errEl.className = "todo-item";
        errEl.id = "todo-item-watch-error";
        errEl.innerHTML = `
          <span class="todo-title">
            <span class="material-symbols-outlined icon-18 icon-color-red" aria-hidden="true">error</span>
            <span>${this.escape(this.watchError)}</span>
          </span>
          <div class="todo-actions">
            <span class="todo-reason">파일 감시 상태 확인 실패</span>
          </div>
        `;
        todoList.appendChild(errEl);
      }

      if (this.todos.length === 0 && !this.syncError && !this.recoveryError && !(this.session.role === "admin" && this.watchError)) {
        const noticeEl = document.createElement("div");
        noticeEl.className = "todo-item";
        noticeEl.id = "todo-item-pending-section-error";
        noticeEl.innerHTML = `
          <span class="todo-title">
            <span class="material-symbols-outlined icon-18 icon-color-orange" aria-hidden="true">info</span>
            <span>일부 업무 현황을 불러오지 못해 할 일 목록을 확정할 수 없습니다.</span>
          </span>
          <div class="todo-actions">
            <span class="todo-reason">상단 섹션 오류 확인 필요</span>
          </div>
        `;
        todoList.appendChild(noticeEl);
      }

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

        // 실제 액션 버튼이 있는 항목 (복구 재시도, 관리자 감시 재시작)
        if (item.actionKind === "retry-recovery") {
          const actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = "btn-secondary btn-sm";
          actionBtn.id = "btn-retry-recovery";
          actionBtn.textContent = this.homeActionLabel("retry-recovery");
          actionBtn.disabled = this.homeActions["retry-recovery"].busy;

          actionBtn.addEventListener("click", () => {
            void this.handleHomeAction("retry-recovery");
          });
          actionsEl.appendChild(actionBtn);
        } else if (item.actionKind === "restart-watch" && this.session.role === "admin") {
          const actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = "btn-secondary btn-sm";
          actionBtn.id = "home-btn-restart-watch";
          actionBtn.textContent = this.homeActionLabel("restart-watch");
          actionBtn.disabled = this.homeActions["restart-watch"].busy;

          actionBtn.addEventListener("click", () => {
            void this.handleHomeAction("restart-watch");
          });
          actionsEl.appendChild(actionBtn);
        }
        // 미구현 화면으로 향하는 버튼은 일체 렌더링하지 않음 (버튼 0개)

        itemEl.appendChild(actionsEl);
        todoList.appendChild(itemEl);
      }

      todoSection.appendChild(todoList);
      wrap.appendChild(todoSection);
    }

    this.container.appendChild(wrap);
  }

  // --------------------------------------------------------------------------
  // 실제 액션 핸들러 (수명 관리 및 중복 클릭 방지 - R31C-04)
  // --------------------------------------------------------------------------

  private homeActionLabel(kind: "retry-recovery" | "restart-watch"): string {
    const action = this.homeActions[kind];
    return action.busy ? "처리 중…" : action.error || (kind === "retry-recovery" ? "다시 복구" : "다시 시작");
  }

  private syncHomeActionButton(kind: "retry-recovery" | "restart-watch"): void {
    if (this.destroyed) return;
    const selector = kind === "retry-recovery" ? "#btn-retry-recovery" : "#home-btn-restart-watch";
    const button = this.container.querySelector<HTMLButtonElement>(selector);
    if (button) {
      button.disabled = this.homeActions[kind].busy;
      button.textContent = this.homeActionLabel(kind);
    }
  }

  private async handleHomeAction(kind: "retry-recovery" | "restart-watch"): Promise<void> {
    const action = this.homeActions[kind];
    if (this.destroyed || action.busy || (kind === "restart-watch" && this.session.role !== "admin")) return;
    action.busy = true;
    action.error = null;
    const ticket = ++action.ticket;
    const generation = this.loadGeneration;
    this.syncHomeActionButton(kind);
    let refresh = false;

    try {
      const bridge = window.appBridge;
      if (!bridge) {
        action.error = "오류: 재시도";
        return;
      }
      const result = await (kind === "retry-recovery"
        ? bridge.retryPerformanceStartupRecovery()
        : bridge.restartFileWatch());
      if (this.destroyed || ticket !== action.ticket || generation !== this.loadGeneration) return;
      if (!result.ok) {
        if (result.errorCode === "AUTH_SESSION_REQUIRED") this.handleSessionExpired();
        else action.error = "실패: 재시도";
        return;
      }
      refresh = true;
    } catch {
      if (!this.destroyed && ticket === action.ticket && generation === this.loadGeneration) {
        action.error = "오류: 재시도";
      }
    } finally {
      // 세대가 바뀌어도 완료된 요청의 잠금은 현재 컨트롤에서 해제한다.
      if (ticket === action.ticket) {
        action.busy = false;
        this.syncHomeActionButton(kind);
      }
    }
    if (refresh && !this.destroyed && ticket === action.ticket && generation === this.loadGeneration) {
      await this.refresh();
    }
  }

  private escape(str: string): string {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private getIconColorClass(hex: string): string {
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
}
