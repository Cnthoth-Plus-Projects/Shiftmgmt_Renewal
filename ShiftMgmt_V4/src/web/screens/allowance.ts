import type { AuthSession } from "../../shared/domain/model";
import { canPerformAction } from "../../shared/domain/authorization";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceProposalApprovalRecord,
} from "../../shared/domain/allowance-workflow";
import type { AllowanceDocumentExportRecord } from "../../shared/domain/allowance-document";
import type { BrowserAppBridge } from "../bridge/app-bridge";
import {
  type AllowanceFilterState,
  type AllowanceTabId,
  calculateAllowanceKpi,
  compareAllowanceRows,
  computeAllowanceDataFingerprint,
  matchAllowanceRow,
} from "./allowance-model";
import {
  escapeHtml,
  renderAllowanceKpiBar,
  renderAllowanceToolbar,
} from "./allowance-view";
import { AllowanceTable } from "./allowance-table";
import { AllowanceDetailPanel } from "./allowance-detail";
import { AllowanceActionManager } from "./allowance-actions";
import { AllowanceProposalManager } from "./allowance-proposal";
import { AllowanceHistoryView } from "./allowance-history";

export interface AllowanceScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
  initialTab?: AllowanceTabId;
  onTabChange?: (tab: AllowanceTabId) => void;
}

export class AllowanceScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;
  private onTabChange?: AllowanceScreenOptions["onTabChange"];
  private sessionExpiredHandled = false;

  private bridge: BrowserAppBridge;
  private actionManager: AllowanceActionManager;
  private proposalManager: AllowanceProposalManager;
  private historyView = new AllowanceHistoryView();

  private table: AllowanceTable | null = null;
  private detailPanel: AllowanceDetailPanel | null = null;

  private isDestroyed = false;
  private generationId = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private loadingPromise: Promise<void> | null = null;
  private hasInitialRender = false;
  private initialMonthResolved = false;
  private lastFingerprint = "";

  private activeTab: AllowanceTabId = "results";
  private filter: AllowanceFilterState = {
    scheduleMonth: "",
    workMonth: "",
    siteName: "all",
    statusFilter: "all",
    status: "all",
    workType: "all",
    payoutType: "all",
    searchQuery: "",
    density: "normal",
  };

  private allRows: AllowanceCalculationResultRecord[] = [];
  private historyRows: AllowanceCalculationResultRecord[] = [];
  private approvalHistory: AllowanceApprovalRecord[] = [];
  private proposalHistory: AllowanceProposalApprovalRecord[] = [];
  private exportHistory: AllowanceDocumentExportRecord[] = [];

  private loadError?: string;
  private secondaryErrorMessage?: string;
  private selectedRowId: string | null = null;
  private checkedRowIds: Set<string> = new Set();
  private availableSites: string[] = [];
  private availableMonths: string[] = [];

  constructor(options: AllowanceScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
    this.onTabChange = options.onTabChange;
    if (options.initialTab) {
      this.activeTab = options.initialTab;
    }

    const rawBridge = (window as unknown as { appBridge: BrowserAppBridge }).appBridge;
    this.bridge = new Proxy(rawBridge, {
      get: (target: BrowserAppBridge, prop: string | symbol) => {
        const member = Reflect.get(target, prop);
        if (typeof member !== "function") return member;
        return async (...args: unknown[]) => {
          if (this.isDestroyed) {
            return { ok: false, errorCode: "SCREEN_CLOSED", message: "화면이 닫혔습니다." };
          }
          const result = (await Reflect.apply(member, target, args)) as {
            ok?: boolean;
            errorCode?: string;
          };
          if (
            !this.isDestroyed &&
            !this.sessionExpiredHandled &&
            result?.ok === false &&
            result.errorCode === "AUTH_SESSION_REQUIRED"
          ) {
            this.sessionExpiredHandled = true;
            this.destroy();
            this.onSessionExpired?.();
          }
          return result;
        };
      },
    });

    this.actionManager = new AllowanceActionManager(this.bridge);
    this.proposalManager = new AllowanceProposalManager(this.bridge);
    this.historyView.setOnNavigateCalculation(calcId => this.handleNavigateToCalculation(calcId));
  }

  public isBusy(): boolean {
    return this.actionManager.getBusy() || this.proposalManager.getBusy();
  }

  private closeOwnedDialogs(): void {
    this.historyView.deactivate();
    if (!this.actionManager.getBusy()) {
      this.actionManager.closeAll();
    }
    if (!this.proposalManager.getBusy()) {
      this.proposalManager.closeAll();
    }
  }

  private isUserInteractingWithInput(): boolean {
    const active = document.activeElement;
    if (!active || !this.container.contains(active)) return false;
    const tag = active.tagName;
    return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
  }

  public render(): void {
    if (this.isDestroyed) return;

    this.container.innerHTML = `
      <div class="allowance-screen" id="allowance-screen-root" aria-busy="false">
        <div id="allowance-kpi-container"></div>
        <div id="allowance-toolbar-container"></div>
        <div id="allowance-body-container"></div>
      </div>
    `;

    const canReview = canPerformAction(this.session.role, "allowance-approval");

    this.table = new AllowanceTable({
      onSelectRow: (rowId: string) => this.handleSelectRow(rowId),
      onToggleRow: (rowId: string, checked: boolean) => this.handleToggleRow(rowId, checked),
      onToggleAll: (checked: boolean) => this.handleToggleAll(checked),
      onPageChange: () => this.handleTablePageChange(),
    });

    this.detailPanel = new AllowanceDetailPanel({
      canReview,
      onApprove: (row: AllowanceCalculationResultRecord) => void this.handleApproveSingle(row),
      onReject: (row: AllowanceCalculationResultRecord) => void this.handleRejectSingle(row),
      onSetEarlyPayout: (row: AllowanceCalculationResultRecord) =>
        void this.handleSetEarlyPayout(row),
      onExportDocuments: (row: AllowanceCalculationResultRecord) =>
        void this.handleExportSingle(row),
    });

    // 5초 자동 조회 (입력·모달·공용팝업·처리 중이 아닐 때만 수행)
    this.poll = setInterval(() => {
      if (
        !this.isDestroyed &&
        !this.loadingPromise &&
        !this.isBusy() &&
        !this.actionManager.isOpen() &&
        !this.proposalManager.isOpen() &&
        !document.querySelector(".workforce-modal-overlay") &&
        !document.querySelector(".ui-control-popup") &&
        !this.isUserInteractingWithInput()
      ) {
        void this.loadData(false);
      }
    }, 5000);

    void this.loadData(true);
  }

  public async loadData(forceRefresh = false): Promise<void> {
    if (this.isDestroyed) return;
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = this.fetchDataInternal(forceRefresh);
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async fetchDataInternal(forceRefresh: boolean): Promise<void> {
    const currentGen = ++this.generationId;
    const rootEl = this.container.querySelector<HTMLElement>("#allowance-screen-root");
    if (rootEl && forceRefresh) rootEl.setAttribute("aria-busy", "true");

    try {
      // 5개 API 병렬 조회 (UI06-D07, S16, N08: 각 오류를 개별 보존, ok:false를 []로 은폐 금지)
      const [resResults, resHistory, resApprovals, resProposals, resExports] =
        await Promise.all([
          this.bridge.listCalculationResults(),
          this.bridge.listCalculationHistory(),
          this.bridge.listAllowanceApprovalHistory(),
          this.bridge.listAllowanceProposalApprovals(),
          this.bridge.listAllowanceDocumentExports(),
        ]);

      if (this.isDestroyed || currentGen !== this.generationId) return;

      const secondaryErrors: string[] = [];

      if (!resResults.ok) {
        this.loadError = resResults.message || "수당 계산 결과를 불러오지 못했습니다.";
      } else {
        this.loadError = undefined;
        this.allRows = resResults.data || [];
      }

      if (!resHistory.ok) {
        secondaryErrors.push(`계산 이력: ${resHistory.message || "조회 실패"}`);
      } else {
        this.historyRows = resHistory.data || [];
      }

      if (!resApprovals.ok) {
        secondaryErrors.push(`검토 이력: ${resApprovals.message || "조회 실패"}`);
      } else {
        this.approvalHistory = resApprovals.data || [];
      }

      if (!resProposals.ok) {
        secondaryErrors.push(`품의 이력: ${resProposals.message || "조회 실패"}`);
      } else {
        this.proposalHistory = resProposals.data || [];
      }

      if (!resExports.ok) {
        secondaryErrors.push(`출력 이력: ${resExports.message || "조회 실패"}`);
      } else {
        this.exportHistory = resExports.data || [];
      }

      this.secondaryErrorMessage =
        secondaryErrors.length > 0 ? secondaryErrors.join(" / ") : undefined;

      const freshIds = new Set(this.allRows.map(r => r.id));

      this.historyView.updateData({
        currentResultIds: freshIds,
        calculations: {
          data: resHistory.ok ? resHistory.data || [] : undefined,
          error: !resHistory.ok ? resHistory.message || "계산 이력 조회 실패" : undefined,
        },
        reviews: {
          data: resApprovals.ok ? resApprovals.data || [] : undefined,
          error: !resApprovals.ok ? resApprovals.message || "검토 이력 조회 실패" : undefined,
        },
        proposals: {
          data: resProposals.ok ? resProposals.data || [] : undefined,
          error: !resProposals.ok ? resProposals.message || "품의 이력 조회 실패" : undefined,
        },
        exports: {
          data: resExports.ok ? resExports.data || [] : undefined,
          error: !resExports.ok ? resExports.message || "출력 이력 조회 실패" : undefined,
        },
      });

      if (resResults.ok) {
        // 재조회 시 유효 ID 교집합 유지 (R05)
        for (const checkedId of Array.from(this.checkedRowIds)) {
          if (!freshIds.has(checkedId)) {
            this.checkedRowIds.delete(checkedId);
          }
        }

        // 근무월 및 근무지 옵션 갱신 (오류 시 월 자동추정을 성공처럼 덮어쓰지 않음 — §6.1 item 1)
        this.collectAvailableOptions();

        if (!this.initialMonthResolved && this.availableMonths.length > 0) {
          this.filter.workMonth = this.availableMonths[0];
          this.filter.scheduleMonth = this.availableMonths[0];
          this.initialMonthResolved = true;
        }
      }

      const errorsKey = `${this.loadError || ""}::${this.secondaryErrorMessage || ""}`;
      const fingerprint = computeAllowanceDataFingerprint({
        results: this.allRows,
        historyCount: this.historyRows.length,
        reviewCount: this.approvalHistory.length,
        proposalCount: this.proposalHistory.length,
        exportCount: this.exportHistory.length,
        errorsKey,
      });

      if (!forceRefresh && this.hasInitialRender && fingerprint === this.lastFingerprint) {
        return;
      }

      this.lastFingerprint = fingerprint;
      this.hasInitialRender = true;
      this.updateScreen();
    } catch (err: unknown) {
      if (this.isDestroyed || currentGen !== this.generationId) return;
      this.loadError = err instanceof Error ? err.message : "데이터 조회 중 예외가 발생했습니다.";
      this.lastFingerprint = "";
      this.updateScreen();
    } finally {
      if (!this.isDestroyed && rootEl) {
        rootEl.setAttribute("aria-busy", "false");
      }
    }
  }

  private collectAvailableOptions(): void {
    const monthsSet = new Set<string>();
    const sitesSet = new Set<string>();

    for (const r of this.allRows) {
      if (r.workDate) monthsSet.add(r.workDate.slice(0, 7));
      if (r.siteName) sitesSet.add(r.siteName);
    }
    for (const h of this.approvalHistory) {
      if (h.workMonth) monthsSet.add(h.workMonth);
      if (h.siteName) sitesSet.add(h.siteName);
    }

    this.availableMonths = Array.from(monthsSet).sort().reverse();
    this.availableSites = Array.from(sitesSet).sort((a, b) =>
      a.localeCompare(b, "ko", { numeric: true })
    );

    if (this.availableMonths.length === 0) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      this.availableMonths = [currentMonth];
    }
  }

  private updateScreen(): void {
    if (this.isDestroyed) return;

    const kpiContainer = this.container.querySelector<HTMLElement>("#allowance-kpi-container");
    const toolbarContainer = this.container.querySelector<HTMLElement>(
      "#allowance-toolbar-container"
    );
    const bodyContainer = this.container.querySelector<HTMLElement>("#allowance-body-container");

    if (!toolbarContainer || !bodyContainer) return;

    const canReview = canPerformAction(this.session.role, "allowance-approval");

    const filtered = this.loadError
      ? []
      : this.allRows
          .filter(r => matchAllowanceRow(r, this.filter))
          .sort(compareAllowanceRows);

    if (kpiContainer) {
      const kpi = calculateAllowanceKpi(filtered, this.checkedRowIds);
      renderAllowanceKpiBar(kpiContainer, kpi);
    }

    renderAllowanceToolbar(toolbarContainer, {
      filter: this.filter,
      availableMonths: this.availableMonths,
      availableSites: this.availableSites,
      activeTab: this.activeTab,
      hasError: !!this.loadError,
      errorMessage: this.loadError,
      secondaryErrorMessage: this.secondaryErrorMessage,
      canReview,
      checkedCount: this.checkedRowIds.size,
      onFilterChange: (newFilter: Partial<AllowanceFilterState>) => {
        if (this.isBusy()) return;
        this.closeOwnedDialogs();
        this.filter = { ...this.filter, ...newFilter };
        if (newFilter.workMonth !== undefined) {
          this.filter.scheduleMonth = newFilter.workMonth;
        } else if (newFilter.scheduleMonth !== undefined) {
          this.filter.workMonth = newFilter.scheduleMonth;
        }
        this.checkedRowIds.clear();
        this.table?.resetPage();
        this.updateScreen();
      },
      onTabChange: (tabId: AllowanceTabId) => {
        if (this.isBusy()) return;
        this.closeOwnedDialogs();
        this.activeTab = tabId;
        this.onTabChange?.(tabId);
        this.updateScreen();
      },
      onRefresh: () => void this.loadData(true),
      onOpenProposalModal: () => void this.handleOpenProposalModal(),
      onBatchApprove: () => void this.handleBatchApprove(),
      onBatchReject: () => void this.handleBatchReject(),
      onBatchExport: () => void this.handleBatchExport(),
    });

    if (this.activeTab === "results" || this.activeTab === "overview") {
      this.historyView.deactivate();
      this.renderResultsTab(bodyContainer, filtered);
    } else if (this.activeTab === "calculations") {
      this.historyView.renderCalculationsTab(bodyContainer);
    } else if (this.activeTab === "reviews" || this.activeTab === "history") {
      this.historyView.renderReviewsTab(bodyContainer);
    } else if (this.activeTab === "exports" || this.activeTab === "proposals") {
      this.historyView.renderExportsTab(bodyContainer);
    }
  }

  private renderResultsTab(
    container: HTMLElement,
    filtered: AllowanceCalculationResultRecord[]
  ): void {
    // S16: 주조회 실패 시 정상 0건 빈 표로 위장하지 않고 명확한 오류 및 재시도 카드 표시
    if (this.loadError) {
      container.innerHTML = `
        <div class="allowance-history-wrapper" id="allowance-results-error-state">
          <div class="allowance-alert error alert-spaced" role="alert">
            <div><strong>수당 산출 내역을 불러오지 못했습니다.</strong> (정상 0건이 아닌 조회 오류 상태입니다.)</div>
            <div class="mt-4">${escapeHtml(this.loadError)}</div>
            <div class="mt-8">
              <button type="button" class="allowance-btn primary" id="btn-retry-primary-load">다시 조회</button>
            </div>
          </div>
        </div>
      `;
      container
        .querySelector<HTMLButtonElement>("#btn-retry-primary-load")
        ?.addEventListener("click", () => void this.loadData(true));
      return;
    }

    const grid = container.querySelector<HTMLElement>(".allowance-content-grid");
    if (!grid) {
      container.innerHTML = `
        <div class="allowance-content-grid">
          <div class="allowance-left-col" id="allowance-table-container"></div>
          <div class="allowance-right-col" id="allowance-detail-container"></div>
        </div>
      `;
    }

    const tableContainer = container.querySelector<HTMLElement>("#allowance-table-container");
    const detailContainer = container.querySelector<HTMLElement>("#allowance-detail-container");

    if (!tableContainer || !detailContainer || !this.table || !this.detailPanel) return;

    if (this.selectedRowId && !filtered.some(r => r.id === this.selectedRowId)) {
      this.selectedRowId = null;
    }
    if (!this.selectedRowId && filtered.length > 0) {
      this.selectedRowId = filtered[0].id;
    }

    this.table.render(tableContainer, {
      rows: filtered,
      selectedId: this.selectedRowId,
      checkedIds: this.checkedRowIds,
      density: this.filter.density,
    });

    // 페이지 범위 밖 선택 앵커를 현재 가시행과 일치시킴 (§6.1 item 3)
    const tableSelectedId = this.table.getSelectedId();
    if (tableSelectedId && tableSelectedId !== this.selectedRowId) {
      this.selectedRowId = tableSelectedId;
    }

    const selectedRecord = this.allRows.find(r => r.id === this.selectedRowId) || null;
    this.detailPanel.render(detailContainer, selectedRecord);
  }

  private handleNavigateToCalculation(calcId: string): void {
    if (this.isDestroyed || this.isBusy()) return;
    const target = this.allRows.find(r => r.id === calcId);
    if (!target) {
      void this.actionManager.promptNotice(
        "현재 산출 목록 없음",
        "선택한 항목은 과거 대체 버전이거나 최신 수당 산출 목록에 존재하지 않습니다."
      );
      return;
    }

    const targetMonth = target.workDate ? target.workDate.slice(0, 7) : "";
    if (!matchAllowanceRow(target, this.filter)) {
      this.filter = {
        ...this.filter,
        workMonth: targetMonth,
        scheduleMonth: targetMonth,
        siteName: "all",
        status: "all",
        statusFilter: "all",
        workType: "all",
        payoutType: "all",
        searchQuery: "",
      };
    }

    this.closeOwnedDialogs();
    this.activeTab = "results";
    this.selectedRowId = calcId;
    this.updateScreen();
    this.table?.focusRowById(calcId);
    this.handleSelectRow(calcId);
  }

  private handleSelectRow(rowId: string): void {
    if (this.isDestroyed || this.isBusy()) return;
    if (rowId !== this.selectedRowId && !this.isBusy()) {
      this.closeOwnedDialogs();
    }
    this.selectedRowId = rowId;
    const detailContainer = this.container.querySelector<HTMLElement>(
      "#allowance-detail-container"
    );
    if (detailContainer && this.detailPanel) {
      const selectedRecord = this.allRows.find(r => r.id === rowId) || null;
      this.detailPanel.render(detailContainer, selectedRecord);
    }
  }

  private handleToggleRow(rowId: string, checked: boolean): void {
    if (this.isDestroyed || this.isBusy()) return;
    if (this.isDestroyed) return;
    if (checked) {
      this.checkedRowIds.add(rowId);
    } else {
      this.checkedRowIds.delete(rowId);
    }
    this.updateScreen();
  }

  /** D04: 헤더 체크 시 현재 페이지의 가시 행만 토글하고 타 페이지 체크 상태는 보존 */
  private handleToggleAll(checked: boolean): void {
    if (this.isDestroyed || this.isBusy() || !this.table) return;
    const visibleIds = this.table.getVisibleRowIds();

    if (checked) {
      for (const id of visibleIds) {
        this.checkedRowIds.add(id);
      }
    } else {
      for (const id of visibleIds) {
        this.checkedRowIds.delete(id);
      }
    }

    this.table.toggleAllVisibleCheckboxes(checked);
    this.updateScreen();
  }

  private handleTablePageChange(): void {
    if (!this.table) return;
    const nextSel = this.table.getSelectedId() || this.table.getFirstVisibleRowId();
    if (nextSel) {
      this.handleSelectRow(nextSel);
    }
  }

  private async handleApproveSingle(row: AllowanceCalculationResultRecord): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    if (!canPerformAction(this.session.role, "allowance-approval")) {
      await this.actionManager.promptNotice(
        "권한 부족",
        "수당 검토 승인은 승인자(reviewer) 또는 관리자(admin)만 수행할 수 있습니다."
      );
      return;
    }
    await this.actionManager.promptApprove([row], async () => {
      await this.loadData(true);
    });
  }

  private async handleRejectSingle(row: AllowanceCalculationResultRecord): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    if (!canPerformAction(this.session.role, "allowance-approval")) {
      await this.actionManager.promptNotice(
        "권한 부족",
        "수당 검토 반려는 승인자(reviewer) 또는 관리자(admin)만 수행할 수 있습니다."
      );
      return;
    }
    await this.actionManager.promptReject([row], async () => {
      await this.loadData(true);
    });
  }

  private async handleSetEarlyPayout(row: AllowanceCalculationResultRecord): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    await this.actionManager.promptEarlyPayout(row, async () => {
      await this.loadData(true);
    });
  }

  private async handleExportSingle(row: AllowanceCalculationResultRecord): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    await this.actionManager.promptExportDocuments([row], async exported => {
      this.historyView.recordExportWarnings(exported.id, exported.rankMissingEmployeeNames);
      await this.loadData(true);
    });
  }

  private async validateBatchSelection(options: {
    emptyTitle: string;
    emptyMsg: string;
    actionName: string;
    requireReviewRole?: boolean;
    blockLocked?: boolean;
  }): Promise<AllowanceCalculationResultRecord[] | null> {
    if (options.requireReviewRole && !canPerformAction(this.session.role, "allowance-approval")) {
      await this.actionManager.promptNotice(
        "권한 부족",
        `${options.actionName}은 승인자(reviewer) 또는 관리자(admin)만 수행할 수 있습니다.`
      );
      return null;
    }
    if (this.checkedRowIds.size === 0) {
      await this.actionManager.promptNotice(options.emptyTitle, options.emptyMsg);
      return null;
    }
    const targets = this.allRows.filter(r => this.checkedRowIds.has(r.id));
    if (targets.length !== this.checkedRowIds.size) {
      await this.actionManager.promptNotice(
        "최신 목록 재확인 필요",
        "선택한 항목 중 최신 산출 목록에서 제외된 건이 있습니다. 새로고침 후 다시 선택해 주십시오."
      );
      return null;
    }
    if (options.blockLocked) {
      const locked = targets.filter(r => r.status === "proposal-approved");
      if (locked.length > 0) {
        await this.actionManager.promptNotice(
          "품의 마감 항목 포함",
          `선택된 항목 중 이미 품의 완료(마감)된 건이 ${locked.length}건 포함되어 있어 처리할 수 없습니다.`
        );
        return null;
      }
    }
    const months = Array.from(new Set(targets.map(r => r.workDate.slice(0, 7))));
    if (months.length > 1) {
      await this.actionManager.promptNotice(
        "근무월 불일치",
        `서로 다른 근무월(${months.join(", ")})의 항목이 함께 선택되었습니다. 동일한 근무월 항목만 처리할 수 있습니다.`
      );
      return null;
    }
    return targets;
  }

  /** 선택 항목 묶음 승인 (D04, R08, §6.1 item 6, N03, N04) */
  private async handleBatchApprove(): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    const targets = await this.validateBatchSelection({
      emptyTitle: "선택 항목 없음",
      emptyMsg: "승인할 수당 산출 항목을 먼저 체크해 주십시오.",
      actionName: "수당 검토 승인",
      requireReviewRole: true,
      blockLocked: true,
    });
    if (!targets) return;

    const changeable = targets.filter(r => r.status !== "approved");
    if (changeable.length === 0) {
      await this.actionManager.promptNotice(
        "변경 대상 없음",
        "선택된 모든 항목이 이미 '검토 승인' 상태입니다."
      );
      return;
    }

    await this.actionManager.promptApprove(
      changeable,
      async () => {
        this.checkedRowIds.clear();
        await this.loadData(true);
      },
      targets.length - changeable.length
    );
  }

  /** 선택 항목 묶음 반려 (D04, R08, §6.1 item 6, N03, N04) */
  private async handleBatchReject(): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    const targets = await this.validateBatchSelection({
      emptyTitle: "선택 항목 없음",
      emptyMsg: "반려할 수당 산출 항목을 먼저 체크해 주십시오.",
      actionName: "수당 검토 반려",
      requireReviewRole: true,
      blockLocked: true,
    });
    if (!targets) return;

    const changeable = targets.filter(r => r.status !== "rejected");
    if (changeable.length === 0) {
      await this.actionManager.promptNotice(
        "변경 대상 없음",
        "선택된 모든 항목이 이미 '반려' 상태입니다."
      );
      return;
    }

    await this.actionManager.promptReject(
      changeable,
      async () => {
        this.checkedRowIds.clear();
        await this.loadData(true);
      },
      targets.length - changeable.length
    );
  }

  /** 선택 항목 묶음 문서 출력 (R13, S14, N03, N04) */
  private async handleBatchExport(): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    const targets = await this.validateBatchSelection({
      emptyTitle: "선택 항목 없음",
      emptyMsg: "문서를 출력할 수당 산출 항목을 먼저 체크해 주십시오.",
      actionName: "수당 문서 출력",
    });
    if (!targets) return;

    const invalid = targets.filter(
      r => r.status !== "approved" && r.status !== "proposal-approved"
    );
    if (invalid.length > 0) {
      await this.actionManager.promptNotice(
        "문서 출력 불가 항목 포함",
        `선택된 ${targets.length}건 중 '검토 승인' 또는 '품의 완료' 상태가 아닌 항목이 ${invalid.length}건 포함되어 있습니다. 승인된 항목만 선택해 주십시오.`
      );
      return;
    }

    await this.actionManager.promptExportDocuments(targets, async exported => {
      this.historyView.recordExportWarnings(exported.id, exported.rankMissingEmployeeNames);
      await this.loadData(true);
    });
  }

  /** 품의서 미리보기 및 결재 (D04, R10, R11, N02, N03, N04) */
  private async handleOpenProposalModal(): Promise<void> {
    if (this.isDestroyed || this.isBusy()) return;
    if (this.loadError || this.secondaryErrorMessage) {
      await this.actionManager.promptNotice(
        "조회 오류 상태",
        `목록 또는 이력 조회 오류가 해결되지 않아 품의 절차를 진행할 수 없습니다: ${this.loadError || this.secondaryErrorMessage}`
      );
      return;
    }

    const nonApprovedEarlyCheck = () => {
      const rows = this.allRows.filter(r => this.checkedRowIds.has(r.id));
      return rows.filter(r => r.status !== "approved");
    };
    if (this.checkedRowIds.size > 0 && nonApprovedEarlyCheck().length > 0) {
      const checkedRows = this.allRows.filter(r => this.checkedRowIds.has(r.id));
      const nonApproved = nonApprovedEarlyCheck();
      await this.actionManager.promptNotice(
        "품의 불가 항목 포함",
        `선택된 ${checkedRows.length}건 중 '검토 승인' 상태가 아닌 항목(대기·반려·마감)이 ${nonApproved.length}건 포함되어 있습니다. 검토 승인 항목만 다시 선택해 주십시오.`
      );
      return;
    }

    const checkedRows = await this.validateBatchSelection({
      emptyTitle: "품의 대상 없음",
      emptyMsg: "품의를 진행할 수당 산출 내역을 먼저 체크해 주십시오.",
      actionName: "품의 미리보기",
    });
    if (!checkedRows) return;

    await this.proposalManager.show({
      workMonth: checkedRows[0].workDate.slice(0, 7),
      initialTargets: checkedRows,
      latestAllRowsProvider: () => this.allRows,
      canReview: canPerformAction(this.session.role, "allowance-approval"),
      onProposalApproved: async () => {
        this.checkedRowIds.clear();
        await this.loadData(true);
        this.activeTab = "exports";
        this.updateScreen();
      },
    });
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }

    this.actionManager.destroy();
    this.proposalManager.destroy();
    this.historyView.destroy();
    this.table?.destroy();
    this.table = null;
    this.detailPanel = null;
    this.container.innerHTML = "";
  }
}
