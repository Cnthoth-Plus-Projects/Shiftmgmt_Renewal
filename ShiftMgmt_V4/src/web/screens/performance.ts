import type { AuthSession } from "../../shared/domain/model";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import { canPerformAction } from "../../shared/domain/authorization";
import type {
  PerformanceApprovalRecord,
  PerformanceFileSyncStateSnapshot,
  PerformanceOverviewRow,
  PerformanceQueueItem,
  PerformanceReapprovalFileSummary,
  PerformanceStartupRecoveryStatusSnapshot
} from "../../shared/domain/performance-file";
import type { BrowserAppBridge } from "../bridge/app-bridge";
import { PerformanceActionManager } from "./performance-actions";
import { PerformanceComparisonModal } from "./performance-comparison";
import { PerformanceDetailPanel } from "./performance-detail";
import { PerformanceHistoryModal } from "./performance-history";
import {
  PerformanceIntakeModal,
  type PerformanceWatchStatusInfo
} from "./performance-intake";
import {
  calculatePerformanceKpi,
  comparePerformanceRows,
  matchPerformanceRow,
  type PerformanceFilterState,
  type PerformanceDutyContext
} from "./performance-model";
import { PerformanceTable } from "./performance-table";
import {
  renderPerformanceKpiBar,
  renderPerformanceStateBox,
  renderPerformanceToolbar
} from "./performance-view";

export interface PerformanceScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
}

export class PerformanceScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;

  private bridge: BrowserAppBridge;
  private actionManager: PerformanceActionManager;
  private comparisonModal = new PerformanceComparisonModal();
  private historyModal = new PerformanceHistoryModal();
  private intakeModal = new PerformanceIntakeModal();

  private table: PerformanceTable | null = null;
  private detailPanel: PerformanceDetailPanel | null = null;

  private isDestroyed = false;
  private generationId = 0;
  private isInitialRendered = false;

  // 상태 (D02: approvalScope 기본값 pending)
  private filter: PerformanceFilterState = {
    workDate: "",
    scheduleMonth: "",
    siteName: "all",
    section: "all",
    approvalScope: "pending",
    statusFilter: "all",
    searchQuery: "",
    density: "normal"
  };

  private allRows: PerformanceOverviewRow[] = [];
  private filteredRows: PerformanceOverviewRow[] = [];
  private availableSites: string[] = [];

  private selectedRowId: string | null = null;
  private collapsedSites: Set<string> = new Set();

  private syncState: PerformanceFileSyncStateSnapshot | null = null;
  private recoveryStatus: PerformanceStartupRecoveryStatusSnapshot | null = null;
  private pendingFiles: PerformanceQueueItem[] = [];
  private reapprovalFiles: PerformanceReapprovalFileSummary[] = [];
  private approvalHistory: PerformanceApprovalRecord[] = [];
  private calculationsMap: Map<string, AllowanceCalculationResultRecord> = new Map();
  private watchStatus: PerformanceWatchStatusInfo | null = null;
  private fileRows: PerformanceOverviewRow[] = [];
  private dutyContext: PerformanceDutyContext = { sites: [], patterns: [], schedules: [] };
  private loading: Promise<void> | null = null;
  private queued = false;
  private queuedForce = false;
  private poll: ReturnType<typeof setInterval> | null = null;

  constructor(options: PerformanceScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
    const source = window.appBridge as BrowserAppBridge;
    this.bridge = new Proxy(source, { get: (target, key) => {
      const member = Reflect.get(target, key);
      if (typeof member !== "function") return member;
      return async (...args: unknown[]) => {
        if (this.isDestroyed) return {ok:false,errorCode:"SCREEN_CLOSED",message:"화면이 닫혔습니다."};
        const result = await Reflect.apply(member, target, args) as {ok?:boolean;errorCode?:string};
        if (!this.isDestroyed && result?.ok === false && result.errorCode === "AUTH_SESSION_REQUIRED") {
          this.destroy(); this.onSessionExpired?.();
        }
        return result;
      };
    }});
    this.actionManager = new PerformanceActionManager(this.bridge);
  }

  public render(): void {
    if (this.isDestroyed) return;
    this.container.innerHTML = `
      <div class="performance-screen" id="perf-screen-root">
        <div class="perf-kpi-bar" id="perf-kpi-container"></div>
        <div class="perf-toolbar" id="perf-toolbar-container"></div>
        <div class="perf-content-grid" id="perf-content-grid">
          <div class="perf-table-card" id="perf-table-container"></div>
          <div class="perf-detail-card" id="perf-detail-container"></div>
        </div>
      </div>
    `;

    const tableEl = this.container.querySelector<HTMLElement>("#perf-table-container")!;
    const detailEl = this.container.querySelector<HTMLElement>("#perf-detail-container")!;
    const kpiEl = this.container.querySelector<HTMLElement>("#perf-kpi-container")!;
    const toolbarEl = this.container.querySelector<HTMLElement>("#perf-toolbar-container")!;

    renderPerformanceKpiBar(kpiEl, calculatePerformanceKpi([]));
    this.renderToolbar(toolbarEl);

    this.table = new PerformanceTable(tableEl, {
      onSelectRow: row => this.handleRowSelect(row),
      onToggleSiteCollapse: siteName => this.handleToggleCollapse(siteName),
      onPageChange: () => this.handlePageChange()
    });

    this.detailPanel = new PerformanceDetailPanel(detailEl, {
      onApprove: row => this.handleApprove(row),
      onCompare: row => this.handleCompare(row),
      onHistory: row => this.handleHistory(row),
      onHideRow: row => this.handleHideRow(row),
      onOpenSourceFile: row => this.handleOpenSourceFile(row),
      onFinalizeFile: fileId => this.handleFinalizeFile(fileId),
      onReturnToPending: fileId => this.handleReturnToPending(fileId)
    });

    this.isInitialRendered = true;
    this.poll = setInterval(() => { if (!this.loading && !this.actionManager.getBusy() && !document.querySelector(".perf-modal-backdrop")) void this.loadData(); }, 5000);
  }

  public async loadData(forceReparse = false): Promise<void> {
    if (this.isDestroyed) return;
    this.container.querySelector(".performance-screen")?.setAttribute("aria-busy", "true");
    if (this.loading) { this.generationId++; this.queued = true; this.queuedForce ||= forceReparse; await this.loading; return; }
    this.loading = this.readData(forceReparse);
    try { await this.loading; } finally {
      this.loading = null;
      if (this.queued && !this.isDestroyed) { const force = this.queuedForce; this.queued = false; this.queuedForce = false; await this.loadData(force); }
      if (!this.isDestroyed) this.container.querySelector(".performance-screen")?.setAttribute("aria-busy", "false");
    }
  }

  private async readData(forceReparse = false): Promise<void> {
    if (this.isDestroyed) return;
    const currentGen = ++this.generationId;

    const tableCard = this.container.querySelector<HTMLElement>("#perf-table-container");
    if (tableCard && !this.allRows.length) {
      renderPerformanceStateBox(tableCard, "loading");
    }

    try {
      // 1. Overview 실적 조회 (D02: approvalScope 전달)
      const overviewRes = await this.bridge.listPerformanceOverview({
        scheduleMonth: this.filter.scheduleMonth || undefined,
        section: this.filter.section,
        approvalScope: this.filter.approvalScope,
        forceReparse
      });

      if (this.isDestroyed || currentGen !== this.generationId) return;

      if (!overviewRes.ok) {
        this.allRows = []; this.filteredRows = []; this.selectedRowId = null;
        this.detailPanel?.setData(null, null, false);
        if (tableCard) {
          renderPerformanceStateBox(
            tableCard,
            "error",
            overviewRes.message,
            () => void this.loadData(true)
          );
        }
        return;
      }

      const snapshot = overviewRes.data;
      this.reapprovalFiles = snapshot.reapprovalFiles || [];

      // Admin-only paths are not requested for other roles.
      const [calcRes, syncRes, recoveryRes, pendingRes, historyRes, watchRes, fileRes, sitesRes, patternsRes, schedulesRes] = await Promise.all([
        this.bridge.listCalculationResults(), this.bridge.getPerformanceSyncState(),
        this.bridge.getPerformanceStartupRecoveryStatus(),
        this.bridge.listPerformanceFiles({scheduleMonth:this.filter.scheduleMonth || undefined,status:this.filter.approvalScope}),
        this.bridge.listApprovalHistory(),
        this.session.role === "admin" ? this.bridge.getFileWatchStatus() : Promise.resolve(null),
        this.filter.section === "all" ? Promise.resolve(overviewRes) : this.bridge.listPerformanceOverview({scheduleMonth:this.filter.scheduleMonth || undefined,approvalScope:this.filter.approvalScope,section:"all"}),
        this.bridge.listSites(), this.bridge.listShiftPatterns(), this.bridge.listMonthlySchedules()
      ]);
      if (this.isDestroyed || currentGen !== this.generationId) return;
      for (const [label, result] of [["수당",calcRes],["읽기 진행",syncRes],["복구",recoveryRes],["파일",pendingRes],["승인 이력",historyRes],["파일 잠금",fileRes],["감시",watchRes],["근무지",sitesRes],["근무 유형",patternsRes],["근무표",schedulesRes]] as const) {
        if (result && !result.ok) throw new Error(`${label} 조회에 실패했습니다. 다시 조회해 주세요.`);
      }
      if (!calcRes.ok || !syncRes.ok || !recoveryRes.ok || !pendingRes.ok || !historyRes.ok || !fileRes.ok || !sitesRes.ok || !patternsRes.ok || !schedulesRes.ok) return;
      this.dutyContext = { sites: sitesRes.data, patterns: patternsRes.data, schedules: schedulesRes.data };
      this.calculationsMap.clear();
      for (const calc of calcRes.data) this.calculationsMap.set(`${calc.fileId}_${calc.entryId}`,calc);
      this.syncState = syncRes.data; this.recoveryStatus = recoveryRes.data;
      this.pendingFiles = pendingRes.data; this.approvalHistory = historyRes.data;
      this.fileRows = fileRes.data.groups.flatMap(g=>g.rows);
      this.watchStatus = watchRes?.ok ? {isWatching:watchRes.data.isRunning,watchFolder:watchRes.data.pendingDir,message:watchRes.data.lastErrorMessage} : {isWatching:null,message:"감시 상태는 관리자만 조회할 수 있습니다"};
      this.watchStatus.issues = snapshot.syncIssues.map(i=>`${i.fileName}: ${i.message}`);

      // 3. 행 추출 및 정렬
      const extractedRows: PerformanceOverviewRow[] = [];
      const sitesSet = new Set<string>();

      for (const group of snapshot.groups) {
        if (group.siteName) sitesSet.add(group.siteName);
        for (const row of group.rows) {
          extractedRows.push(row);
          if (row.entry.siteName) sitesSet.add(row.entry.siteName);
        }
      }

      extractedRows.sort(comparePerformanceRows);
      this.allRows = extractedRows;
      this.availableSites = Array.from(sitesSet).sort((a, b) =>
        a.localeCompare(b, "ko", { numeric: true })
      );

      // D08: 월 감지 및 일치
      if (!this.filter.scheduleMonth && extractedRows.length > 0) {
        const detected = extractedRows[0].entry.workDate?.slice(0, 7);
        if (detected) {
          this.filter.scheduleMonth = detected;
        }
      }

      // 4. 필터링 및 뷰 업데이트 (단순 재조회 시 페이지 보존)
      this.applyFilterAndRender(true);
    } catch (err: unknown) {
      if (this.isDestroyed || currentGen !== this.generationId) return;
      this.allRows = []; this.filteredRows = []; this.selectedRowId = null;
      this.detailPanel?.setData(null, null, false);
      if (tableCard) {
        renderPerformanceStateBox(
          tableCard,
          "error",
          err instanceof Error && /[가-힣]/.test(err.message) ? err.message : "실적 조회에 실패했습니다. 연결 상태를 확인하고 다시 조회해 주세요.",
          () => void this.loadData(true)
        );
      }
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.generationId++;
    if (this.poll) clearInterval(this.poll); this.poll = null;
    this.actionManager.destroy(); // D04: 액션 매니저 및 열려있는 모달/대기 완전 정리
    this.table?.destroy();
    this.table = null;
    this.detailPanel?.destroy();
    this.detailPanel = null;
    this.comparisonModal.close();
    this.historyModal.close();
    this.intakeModal.close();
    this.container.innerHTML = "";
  }

  private renderToolbar(toolbarEl: HTMLElement): void {
    const syncText = this.watchStatus?.isWatching === true ? `감시 중 · 파일 ${this.pendingFiles.length}건` : this.watchStatus?.isWatching === false ? `감시 중지 · 파일 ${this.pendingFiles.length}건` : this.watchStatus?.message || "감시 상태 조회 중";

    renderPerformanceToolbar(toolbarEl, this.filter, this.availableSites, syncText, {
      onTabChange: sec => {
        this.filter.section = sec;
        this.applyFilterAndRender(false);
        this.voidSafeLoadData();
      },
      onFilterChange: changed => {
        const previousMonth = this.filter.scheduleMonth;
        if (changed.workDate) changed.scheduleMonth = changed.workDate.slice(0, 7);
        if (changed.scheduleMonth !== undefined && (changed.workDate ?? this.filter.workDate)?.slice(0, 7) !== changed.scheduleMonth) {
          changed.workDate = "";
        }
        Object.assign(this.filter, changed);
        if (this.filter.scheduleMonth !== previousMonth || changed.approvalScope !== undefined) {
          this.applyFilterAndRender(false);
          this.voidSafeLoadData();
        } else {
          this.applyFilterAndRender(false); // 필터 검색 변경 시 1페이지로
        }
      },
      onForceReparse: () => {
        void this.loadData(true);
      },
      onOpenIntakeModal: () => {
        this.intakeModal.show(
          this.syncState,
          this.recoveryStatus,
          this.pendingFiles,
          this.watchStatus,
          {
            onRetryRecovery: async () => {
              const gen = this.generationId;
              const res = await this.bridge.retryPerformanceStartupRecovery();
              if (this.isDestroyed || gen !== this.generationId) return;
              if (!res.ok) { await this.actionManager.promptNotice("복구 실패",res.message); return; }
              await this.loadData(true);
            },
            onSelectFile: file => { void this.selectFile(file); }
          }
        );
      }
    });
  }

  private applyFilterAndRender(preservePage = false): void {
    if (!this.isInitialRendered || this.isDestroyed) return;

    const focused = document.activeElement as HTMLInputElement | null;
    const caret = focused?.id === "perf-filter-search" ? focused.selectionStart : null;
    // 필터링 적용 (D08: scheduleMonth 필터링 포함)
    this.filteredRows = this.allRows.filter(row => matchPerformanceRow(row, this.filter));

    // KPI 갱신 (전체 조회 행 기준 통계)
    const kpi = calculatePerformanceKpi(this.filteredRows);
    const kpiEl = this.container.querySelector<HTMLElement>("#perf-kpi-container");
    if (kpiEl) {
      renderPerformanceKpiBar(kpiEl, kpi);
    }

    // 툴바 갱신
    const toolbarEl = this.container.querySelector<HTMLElement>("#perf-toolbar-container");
    if (toolbarEl) {
      this.renderToolbar(toolbarEl);
    }

    // 선택 행 보정
    let selected = this.filteredRows.find(r => r.rowId === this.selectedRowId);
    if (!selected && this.filteredRows.length > 0) {
      selected = this.filteredRows[0];
      this.selectedRowId = selected.rowId;
    } else if (this.filteredRows.length === 0) {
      this.selectedRowId = null;
      selected = undefined;
    }

    // 테이블 갱신 (D08: preservePage가 true이면 현재 페이지 보존)
    const targetPage = preservePage ? this.table?.getCurrentPage() : 1;
    this.table?.setData(
      this.filteredRows,
      this.collapsedSites,
      this.selectedRowId,
      this.filter.density,
      targetPage ?? 1,
      this.dutyContext
    );

    // 상세 패널 갱신
    this.selectedRowId = this.table?.getSelectedRowId() || null;
    this.updateDetailPanel(this.filteredRows.find(row => row.rowId === this.selectedRowId) || null);
    if (caret !== null) { const input = this.container.querySelector<HTMLInputElement>("#perf-filter-search"); input?.focus(); input?.setSelectionRange(caret,caret); }
  }

  private voidSafeLoadData(): void {
    void this.loadData(false);
  }

  private updateDetailPanel(row: PerformanceOverviewRow | null): void {
    if (!row) {
      this.detailPanel?.setData(null, null, false, false);
      return;
    }

    const calcKey = `${row.fileId}_${row.entryId}`;
    const calc = this.calculationsMap.get(calcKey) || null;
    const canAction = canPerformAction(this.session.role, "performance-approval");

    // D02: 현재 파일의 재승인 확정 가능 여부 확인
    const reapprovalFile = this.reapprovalFiles.find(f => f.fileId === row.fileId);
    const fileCanFinalize = reapprovalFile ? Boolean(reapprovalFile.canFinalize) : false;

    this.detailPanel?.setData(row, calc, canAction, fileCanFinalize, this.fileRows.some(r=>r.fileId===row.fileId && r.isChangeLocked), this.dutyContext);
  }

  private handleRowSelect(row: PerformanceOverviewRow): void {
    if (this.isDestroyed) return;
    if (this.selectedRowId !== row.rowId) { this.actionManager.closeAll(); this.comparisonModal.close(); this.historyModal.close(); }
    this.selectedRowId = row.rowId;
    this.updateDetailPanel(row);
  }

  private handleToggleCollapse(siteName: string): void {
    if (this.isDestroyed) return;
    if (this.collapsedSites.has(siteName)) {
      this.collapsedSites.delete(siteName);
    } else {
      this.collapsedSites.add(siteName);
    }
    this.table?.setData(
      this.filteredRows,
      this.collapsedSites,
      this.selectedRowId,
      this.filter.density,
      this.table?.getCurrentPage()
    );
    this.handlePageChange();
  }

  private handlePageChange(): void {
    if (this.isDestroyed) return;
    const selId = this.table?.getSelectedRowId() || null;
    if (selId !== this.selectedRowId) {
      this.actionManager.closeAll(); this.comparisonModal.close(); this.historyModal.close();
      this.selectedRowId = selId;
      this.updateDetailPanel(this.filteredRows.find(row => row.rowId === selId) || null);
    }
  }

  private async handleApprove(row: PerformanceOverviewRow): Promise<void> {
    if (this.isDestroyed) return;
    await this.actionManager.promptApprove(row, async () => {
      if (this.isDestroyed) return;
      await this.loadData(false);
    });
  }

  private async handleCompare(row: PerformanceOverviewRow): Promise<void> {
    if (this.isDestroyed) return;
    const gen = this.generationId;
    const selected = this.selectedRowId;
    const res = await this.bridge.getPerformanceComparison({
      fileId: row.fileId,
      entryId: row.entryId
    });

    if (this.isDestroyed || gen !== this.generationId || selected !== this.selectedRowId) return;

    if (res.ok) {
      if (res.data) {
        this.comparisonModal.show(res.data);
      } else {
        await this.actionManager.promptNotice(
          "비교 안내",
          "기존 승인본 실적이 없어 비교할 수 없습니다."
        );
      }
    } else {
      await this.actionManager.promptNotice(
        "차이 비교 오류",
        res.message || "차이 비교 데이터를 불러올 수 없습니다."
      );
    }
  }

  private handleHistory(row: PerformanceOverviewRow): void {
    if (this.isDestroyed) return;
    this.historyModal.show(
      `${row.entry.employeeName} (${row.entry.employeeCode})`,
      this.approvalHistory,
      row.logicalKey,
      { fileId: row.fileId, load: () => this.bridge.getPerformanceFileDetail({ fileId: row.fileId }), currentCalculation: this.calculationsMap.get(`${row.fileId}_${row.entryId}`) || null }
    );
  }

  private async handleHideRow(row: PerformanceOverviewRow): Promise<void> {
    if (this.isDestroyed) return;
    await this.actionManager.promptHideRow(row, async () => {
      if (this.isDestroyed) return;
      await this.loadData(false);
    });
  }

  private async handleOpenSourceFile(row: PerformanceOverviewRow): Promise<void> {
    if (this.isDestroyed) return;
    await this.actionManager.openSourceFile(row.fileId);
  }

  private async selectFile(file: PerformanceQueueItem): Promise<void> {
    const gen=this.generationId;
    const res=await this.bridge.getPerformanceFileDetail({fileId:file.id});
    if(this.isDestroyed || gen!==this.generationId)return;
    if(!res.ok || !res.data) { await this.actionManager.promptNotice("원본 조회 실패",!res.ok?res.message:"파일을 찾을 수 없습니다. 다시 조회해 주세요.");return; }
    if(file.scheduleMonth)this.filter.scheduleMonth=file.scheduleMonth;
    if(file.siteName)this.filter.siteName=file.siteName;
    this.filter.section="all";this.filter.statusFilter="all";this.filter.searchQuery="";this.filter.workDate="";
    await this.loadData();
    if(this.isDestroyed)return;
    const row=this.filteredRows.find(r=>r.fileId===file.id);
    if(row){this.selectedRowId=row.rowId;this.updateDetailPanel(row);}else{await this.actionManager.promptNotice("실적 확인",res.data.errorMessage || "해석된 실적이 없습니다. 원본과 접수 오류를 확인해 주세요.");}
  }

  private async handleFinalizeFile(fileId: string): Promise<void> {
    if (this.isDestroyed) return;
    if (!this.reapprovalFiles.find(f=>f.fileId===fileId)?.canFinalize) return;
    const file = this.pendingFiles.find(f => f.id === fileId);
    const fileName = file ? file.fileName : "실적 엑셀 파일";
    await this.actionManager.promptFinalizeReapproval(fileId, fileName, async () => {
      if (this.isDestroyed) return;
      await this.loadData(false);
    });
  }

  private async handleReturnToPending(fileId: string): Promise<void> {
    if (this.isDestroyed || this.fileRows.some(r=>r.fileId===fileId && r.isChangeLocked)) return;
    const file = this.pendingFiles.find(f => f.id === fileId);
    const fileName = file ? file.fileName : "실적 엑셀 파일";
    await this.actionManager.promptReturnToPending(fileId, fileName, async () => {
      if (this.isDestroyed) return;
      await this.loadData(false);
    });
  }
}
