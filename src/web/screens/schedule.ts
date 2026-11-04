import type { BridgeResult, SchedulePreparationContext } from "../../shared/bridge/contracts";
import type { AuthSession, EmployeeRecord, MonthlyScheduleRecord, ShiftPatternRecord, SiteRecord } from "../../shared/domain/model";
import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { executeCreateSchedule, executeExportExcel, executePublishSchedule, type ActionSnapshot, type ScheduleActionsContext } from "./schedule-actions";
import { ScheduleCalendar } from "./schedule-calendar";
import { ScheduleHistory } from "./schedule-history";
import { buildRosterFromStoredSchedule, filterScheduleHistory, generateSchedulePreview, isValidYearMonth, joinSchedulePlanExports, labelSchedulePreview, prepareRosterEmployees, type ScheduleHistoryRow, type SchedulePreviewResult } from "./schedule-model";
import { ScheduleView, type ScheduleToolbarState } from "./schedule-view";

export interface ScheduleScreenOptions {
  container: HTMLElement;
  session: AuthSession | null;
  onSessionExpired?: () => void;
  initialTab?: "calendar" | "history";
  onNavigate?: (menuId: string) => void;
}

export class ScheduleScreen {
  private container: HTMLElement;
  private session: AuthSession | null;
  private onSessionExpired?: () => void;
  private currentTab: "calendar" | "history";
  private isDestroyed = false;
  private sessionEnded = false;
  private generationId = 0;
  private busy = false;
  private loading = false;
  private initialDataLoaded = false;
  private loadError: string | null = null;
  private operationSequence = 0;
  private activeOperation: number | null = null;
  private sites: SiteRecord[] = [];
  private shiftPatterns: ShiftPatternRecord[] = [];
  private employees: EmployeeRecord[] = [];
  private storedSchedules: MonthlyScheduleRecord[] = [];
  private exportsList: SchedulePlanExportRecord[] = [];
  private prepContext: SchedulePreparationContext | null = null;
  private selectedSiteId = "";
  private selectedYear = new Date().getFullYear();
  private selectedMonth = new Date().getMonth() + 1;
  private selectedScheduleId = "new";
  private currentExportRecord: SchedulePlanExportRecord | null = null;
  private calendarPreviewData: SchedulePreviewResult | null = null;
  private selectedRowKey: string | null = null;
  private historyRows: ScheduleHistoryRow[] = [];
  private filteredHistoryRows: ScheduleHistoryRow[] = [];
  private selectedExportId: string | null = null;
  private historyFilter = { siteId: "all", scheduleMonth: "all", status: "all" as "all" | "published" | "draft", keyword: "" };
  private view!: ScheduleView;
  private calendar!: ScheduleCalendar;
  private history!: ScheduleHistory;
  private beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (this.busy) { e.preventDefault(); e.returnValue = "처리 중입니다. 완료될 때까지 이 화면을 유지해 주세요."; }
  };

  constructor(options: ScheduleScreenOptions) {
    this.container = options.container; this.session = options.session;
    this.onSessionExpired = options.onSessionExpired; this.currentTab = options.initialTab || "calendar";
  }
  public isBusy(): boolean { return this.busy; }
  public isDirty(): boolean { return this.busy; }
  public destroy(): void {
    this.isDestroyed = true; this.generationId++; this.activeOperation = null; this.busy = false;
    window.removeEventListener("beforeunload", this.beforeUnloadHandler);
    this.calendar?.destroy(); this.history?.destroy(); this.container.innerHTML = "";
  }
  public render(): HTMLElement {
    if (this.isDestroyed) return this.container;
    this.container.innerHTML = `<div class="schedule-screen" id="schedule-screen">
      <div id="schedule-kpi-container" class="schedule-kpi-strip"></div>
      <div id="schedule-toolbar-container" class="schedule-toolbar"></div>
      <div id="schedule-message" class="schedule-status-message" hidden></div>
      <div class="schedule-layout-body"><div id="schedule-table-pane" class="schedule-table-pane"></div><div id="schedule-detail-pane" class="schedule-detail-pane"></div></div></div>`;
    this.view = new ScheduleView(this.container, {
      onTabChange: tab => this.switchTab(tab), onSiteChange: id => this.changeSite(id),
      onYearChange: year => this.changeYear(year), onMonthChange: month => this.changeMonth(month),
      onScheduleChange: id => this.changeSchedule(id), onPreviewClick: () => this.loadData(),
      onCreateScheduleClick: () => this.handleCreateSchedule(), onExportExcelClick: () => this.handleExportExcel(), onPublishClick: () => this.handlePublishSchedule(),
      onHistoryFilterChange: filters => this.changeHistoryFilter(filters),
    });
    this.calendar = new ScheduleCalendar(this.container, { onSelectEmployee: key => { this.selectedRowKey = key; },onMoveMonth: delta=>this.moveCalendarMonth(delta) });
    this.history = new ScheduleHistory(this.container, {
      onSelectHistoryRow: id => { this.selectedExportId = id; },
      onNavigateToStoredSchedule: (id, site, month) => { void this.navigateToStoredSchedule(id, site, month); },
    });
    this.updateView(); return this.container;
  }
  private current(generation: number): boolean { return !this.isDestroyed && !this.sessionEnded && this.generationId === generation; }
  private expireSession(): void {
    if (this.isDestroyed || this.sessionEnded) return;
    this.sessionEnded = true; this.session = null; this.currentExportRecord = null;
    this.destroy(); this.onSessionExpired?.();
  }
  private readResult<T>(result: BridgeResult<T>, label: string): T {
    if (!result.ok) {
      if (["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED", "AUTH_SESSION_EXPIRED"].includes(result.errorCode)) this.expireSession();
      const message = /[가-힣]/.test(result.message || "") ? result.message : "자료와 폴더 설정을 확인하고 다시 조회해 주세요.";
      throw new Error(`${label}: ${message}`);
    }
    return result.data;
  }
  private readArray<T>(result: BridgeResult<T[]>, label: string): T[] {
    const data = this.readResult(result, label);
    if (!Array.isArray(data)) throw new Error(`${label}: 조회 결과가 올바르지 않습니다. 다시 조회해 주세요.`);
    return data;
  }
  private failure(message: string): SchedulePreviewResult {
    return { pattern: null, items: [], rows: [], dates: [], issues: [message], fatalIssues: [message], warnings: [], warningStats: { total: 0, consecutiveNight: 0, minRest: 0, weeklyHoliday: 0, weeklyMax: 0 } };
  }
  public async loadData(): Promise<void> {
    if (this.isDestroyed || this.busy) return;
    const generation = ++this.generationId, bridge = window.appBridge;
    this.loading = true; this.loadError = null; this.currentExportRecord = null; this.calendarPreviewData = null; this.updateView();
    try {
      if (!bridge) throw new Error("연결을 확인하고 다시 조회해 주세요.");
      const [sites, patterns, people, schedules, exports] = await Promise.all([bridge.listSites(), bridge.listShiftPatterns(), bridge.listEmployees(), bridge.listMonthlySchedules(), bridge.listSchedulePlanExports()]);
      if (!this.current(generation)) return;
      // Validate every required response before replacing any successful data.
      for (const result of [sites, patterns, people, schedules, exports]) {
        if (!result.ok && ["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED", "AUTH_SESSION_EXPIRED"].includes(result.errorCode)) this.readResult(result, "세션 확인");
      }
      const nextSites = this.readArray(sites, "근무지 조회"), nextPatterns = this.readArray(patterns, "패턴 조회"), nextPeople = this.readArray(people, "인력 조회"), nextSchedules = this.readArray(schedules, "저장본 조회"), nextExports = this.readArray(exports, "이력 조회");
      this.sites = nextSites; this.shiftPatterns = nextPatterns; this.employees = nextPeople;
      this.storedSchedules = nextSchedules; this.exportsList = nextExports; this.initialDataLoaded = true;
      if (!this.sites.some(s => s.id === this.selectedSiteId)) this.selectedSiteId = this.sites.find(s => s.status === "active")?.id || this.sites[0]?.id || "";
      if (this.selectedScheduleId !== "new" && !this.storedSchedules.some(s => s.id === this.selectedScheduleId && s.siteId === this.selectedSiteId && s.scheduleMonth === this.getTargetMonthStr())) this.selectedScheduleId = "new";
      this.updateHistoryList(); await this.loadScheduleData();
    } catch (error) {
      if (this.current(generation)) { this.loadError = error instanceof Error ? error.message : "자료 조회에 실패했습니다. 다시 조회해 주세요."; this.calendarPreviewData = this.failure(this.loadError); }
    } finally {
      if (this.current(generation)) { this.loading = false; this.updateView(); }
    }
  }
  private async loadScheduleData(): Promise<void> {
    if (this.isDestroyed) return;
    const generation = ++this.generationId, bridge = window.appBridge, month = this.getTargetMonthStr(), site = this.selectedSiteId;
    this.loading = true; this.loadError = null; this.calendarPreviewData = null; this.updateView();
    try {
      if (!isValidYearMonth(month)) throw new Error("연월을 확인해 주세요. 연도는1900~9999, 월은1~12로 입력해 주세요.");
      if (!bridge) throw new Error("연결을 확인하고 다시 조회해 주세요.");
      if (!site) { this.calendarPreviewData = null; return; }
      const response = await bridge.getSchedulePreparationContext(this.selectedYear);
      if (!this.current(generation)) return;
      const context = this.readResult(response, "공휴일·경고 기준 조회");
      if (!context || context.year !== this.selectedYear || !Array.isArray(context.publicHolidayDates) || !context.warningSettings) throw new Error("선택 연도의 준비 자료를 확인하지 못했습니다. 다시 조회해 주세요.");
      this.prepContext = context;
      if (this.selectedScheduleId !== "new") {
        const saved = this.storedSchedules.find(s => s.id === this.selectedScheduleId && s.siteId === site && s.scheduleMonth === month);
        if (!saved) throw new Error("선택한 저장본이 없습니다. 목록을 새로고침해 주세요.");
        this.calendarPreviewData = labelSchedulePreview(buildRosterFromStoredSchedule(saved, context.warningSettings, context.publicHolidayDates), this.shiftPatterns.find(p => p.id === saved.patternId) || null);
      } else {
        const roster = await prepareRosterEmployees(this.employees, month, site, async id => {
          if (!this.current(generation)) throw new Error("조회 대상이 변경되었습니다.");
          const assignments = await bridge.listEmployeeAssignments(id);
          if (!this.current(generation)) throw new Error("조회 대상이 변경되었습니다.");
          return this.readArray(assignments, "배정 이력 조회");
        });
        if (!this.current(generation)) return;
        this.calendarPreviewData = roster.fatalIssues.length ? this.failure(roster.fatalIssues.join("\n")) : generateSchedulePreview(this.shiftPatterns.filter(p => p.siteId === site), roster.rosterEmployees, month, context.publicHolidayDates, context.warningSettings);
        this.calendarPreviewData = labelSchedulePreview(this.calendarPreviewData, this.calendarPreviewData.pattern);
      }
    } catch (error) {
      if (this.current(generation)) { this.loadError = error instanceof Error ? error.message : "조회에 실패했습니다. 다시 조회해 주세요."; this.prepContext = null; this.calendarPreviewData = this.failure(this.loadError); }
    } finally {
      if (this.current(generation)) { this.loading = false; this.updateView(); }
    }
  }
  private updateView(): void {
    if (this.isDestroyed || !this.view) return;
    this.container.querySelector("#schedule-screen")?.classList.toggle("is-calendar-view",this.currentTab==="calendar");
    const month = this.getTargetMonthStr(), site = this.sites.find(s => s.id === this.selectedSiteId);
    const usable = !this.busy && !this.loading && !this.loadError;
    const canWrite = usable && !!this.session && (this.session.role === "admin" || this.session.role === "planner");
    const saved = this.storedSchedules.find(s => s.id === this.selectedScheduleId && s.siteId === this.selectedSiteId && s.scheduleMonth === month);
    const state: ScheduleToolbarState = {
      currentTab: this.currentTab, selectedSiteId: this.selectedSiteId, selectedYear: this.selectedYear, selectedMonth: this.selectedMonth, selectedScheduleId: this.selectedScheduleId,
      isBusy: this.busy, canWrite, hasValidPreview: usable && !!this.calendarPreviewData?.pattern && !!this.calendarPreviewData.items.length && !this.calendarPreviewData.fatalIssues.length,
      hasStoredSchedule: usable && !!saved, hasExportIdForCurrentTarget: usable && !!saved && this.currentExportRecord?.scheduleId === saved.id && this.currentExportRecord.scheduleMonth === month, historyFilter: this.historyFilter,
    };
    this.view.renderKpi(state, this.calendarPreviewData, this.filteredHistoryRows, site?.name || "", month);
    if (this.session) this.view.renderToolbar(state, this.sites, this.storedSchedules.filter(s => s.siteId === this.selectedSiteId && s.scheduleMonth === month), this.session, [...new Set(this.historyRows.map(h => h.scheduleMonth))].sort().reverse());
    const message = this.container.querySelector<HTMLElement>("#schedule-message");
    if (message) {
      message.replaceChildren(); message.hidden = !this.loading && !this.loadError;
      message.setAttribute("role", this.loadError ? "alert" : "status");
      message.append(document.createTextNode(this.loading ? "자료를 불러오는 중입니다…" : this.loadError || ""));
      if (this.loadError) { const retry = document.createElement("button"); retry.id = "btn-schedule-retry"; retry.type = "button"; retry.textContent = "다시 조회"; retry.addEventListener("click", () => { void this.loadData(); }); message.append(retry); }
    }
    this.container.querySelector("#schedule-table-pane")?.setAttribute("aria-busy", String(this.loading));
    if (this.currentTab === "calendar") this.calendar.setData(this.calendarPreviewData, this.selectedRowKey, this.prepContext?.warningSettings.weeklyMaxMinutes ?? 3120, this.prepContext?.publicHolidayDates || [],this.busy||this.loading);
    else this.history.setData(this.filteredHistoryRows, this.selectedExportId);
  }
  private moveCalendarMonth(delta:number):void {
    if(this.busy||this.loading||this.isDestroyed||this.sessionEnded)return;
    const date=new Date(this.selectedYear,this.selectedMonth-1+delta,1,12),year=date.getFullYear();if(year<1900||year>9999)return;
    this.selectedYear=year;this.selectedMonth=date.getMonth()+1;this.selectedScheduleId="new";this.currentExportRecord=null;void this.loadScheduleData();
  }
  private switchTab(tab: "calendar" | "history"): void {
    if (this.busy || this.currentTab === tab) return;
    this.currentTab = tab;
    if (!this.initialDataLoaded) { this.updateView(); if (!this.loading) void this.loadData(); return; }
    this.generationId++; this.loading = false;
    if (tab === "calendar") void this.loadScheduleData(); else this.updateView();
  }
  private async changeSite(id: string): Promise<void> { if (this.busy || this.selectedSiteId === id) return; this.selectedSiteId = id; await this.newTarget(); }
  private async changeYear(year: number): Promise<void> { if (this.busy || this.selectedYear === year) return; this.selectedYear = year; await this.newTarget(); }
  private async changeMonth(month: number): Promise<void> { if (this.busy || this.selectedMonth === month) return; this.selectedMonth = month; await this.newTarget(); }
  private async changeSchedule(id: string): Promise<void> { if (this.busy || this.selectedScheduleId === id) return; this.selectedScheduleId = id; this.currentExportRecord = null; this.selectedRowKey = null; await this.loadScheduleData(); }
  private async newTarget(): Promise<void> { this.selectedScheduleId = "new"; this.currentExportRecord = null; this.selectedRowKey = null; await this.loadScheduleData(); }
  private changeHistoryFilter(filters: typeof this.historyFilter): void { if (this.busy) return; this.historyFilter = filters; this.updateHistoryList(); this.history.setData(this.filteredHistoryRows, this.selectedExportId); this.view.renderKpi({ currentTab: "history" } as ScheduleToolbarState, null, this.filteredHistoryRows, "", this.getTargetMonthStr()); }
  private async navigateToStoredSchedule(id: string, site: string, month: string): Promise<void> {
    if (this.busy) return;
    this.currentTab = "calendar"; this.selectedSiteId = site;
    [this.selectedYear, this.selectedMonth] = month.split("-").map(Number);
    this.selectedScheduleId = id; this.currentExportRecord = null; this.selectedRowKey = null; await this.loadScheduleData();
  }
  private actorKey(): string { return this.session ? `${this.session.userId}|${this.session.role}|${this.session.expiresAt}` : ""; }
  private createActionSnapshot(): ActionSnapshot { return { generationId: this.generationId, siteId: this.selectedSiteId, targetMonth: this.getTargetMonthStr(), selectedScheduleId: this.selectedScheduleId, actorKey: this.actorKey(), exportId: this.currentExportRecord?.id || null }; }
  private isActionCurrent(s: ActionSnapshot): boolean { return this.current(s.generationId) && !!this.session && this.actorKey() === s.actorKey && this.selectedSiteId === s.siteId && this.getTargetMonthStr() === s.targetMonth && this.selectedScheduleId === s.selectedScheduleId && (this.currentExportRecord?.id || null) === s.exportId; }
  private getActionsContext(): ScheduleActionsContext {
    const snapshot = this.createActionSnapshot(), current = () => this.isActionCurrent(snapshot);
    const bridge = window.appBridge;
    return {
      snapshot, isCurrent: s => this.isActionCurrent(s), isAlive: () => !this.isDestroyed && !!this.session && this.actorKey() === snapshot.actorKey,
      beginAction: () => {
        if (!current() || this.busy || this.loading || this.loadError || !this.session || !["admin", "planner"].includes(this.session.role)) return null;
        const lease = ++this.operationSequence; this.activeOperation = lease; this.busy = true;
        window.addEventListener("beforeunload", this.beforeUnloadHandler); this.updateView(); return lease;
      },
      endAction: lease => {
        if (this.isDestroyed || this.activeOperation !== lease) return;
        this.activeOperation = null; this.busy = false; window.removeEventListener("beforeunload", this.beforeUnloadHandler); this.updateView();
      },
      readResult: <T>(result: BridgeResult<T>, label: string) => this.readResult(result, label),
      refreshContext: async () => {
        if (!bridge || !current()) return null;
        const response = await bridge.getSchedulePreparationContext(Number(snapshot.targetMonth.slice(0, 4)));
        if (!current()) return null;
        const context = this.readResult(response, "게시 폴더 조회");
        if (!context || context.year !== Number(snapshot.targetMonth.slice(0, 4)) || !context.publishDirectory) throw new Error("게시 폴더를 확인하지 못했습니다. 설정을 확인하고 다시 조회해 주세요.");
        return context;
      },
      site: this.sites.find(s => s.id === this.selectedSiteId) || null, targetMonth: snapshot.targetMonth, session: this.session,
      previewData: this.calendarPreviewData, selectedScheduleId: this.selectedScheduleId, storedSchedules: this.storedSchedules, currentExportRecord: this.currentExportRecord,
      onScheduleCreated: async record => {
        if (!bridge || !current()) return false;
        const response = await bridge.listMonthlySchedules();
        if (!current()) return false;
        const all = this.readArray(response, "저장 후 확인. 다시 저장하지 말고 목록을 새로고침해 주세요"), saved = all.find(s => s.id === record.id);
        const expected = this.calendarPreviewData?.items || [];
        const signature = (it: Pick<MonthlyScheduleRecord["items"][number], "employeeCode" | "teamLabel" | "workDate" | "dutyCode" | "startTime" | "endTime" | "breakMinutes" | "sortOrder">) => JSON.stringify([it.employeeCode, it.teamLabel || "", it.workDate, it.dutyCode, it.startTime || "", it.endTime || "", it.breakMinutes, it.sortOrder ?? 0]);
        if (!saved || saved.siteId !== snapshot.siteId || saved.scheduleMonth !== snapshot.targetMonth || saved.patternId !== record.patternId || JSON.stringify(saved.items.map(signature).sort()) !== JSON.stringify(expected.map(signature).sort())) throw new Error("저장 후 조회 내용이 다릅니다. 다시 저장하지 말고 목록을 새로고침해 확인해 주세요.");
        this.storedSchedules = all; this.selectedScheduleId = saved.id; this.currentExportRecord = null; this.generationId++;
        this.calendarPreviewData = labelSchedulePreview(buildRosterFromStoredSchedule(saved, this.prepContext!.warningSettings, this.prepContext!.publicHolidayDates), this.shiftPatterns.find(p => p.id === saved.patternId) || null);
        this.updateHistoryList(); this.updateView(); return true;
      },
      onExportCompleted: async record => {
        if (!bridge || !current()) return false;
        const response = await bridge.listSchedulePlanExports();
        if (!current()) return false;
        const all = this.readArray(response, "생성 이력 조회"), found = all.find(e => e.id === record.id);
        if (!found || found.scheduleId !== snapshot.selectedScheduleId || found.scheduleMonth !== snapshot.targetMonth || found.outputPath !== record.outputPath) throw new Error("생성 이력과 파일 대상을 확인하지 못했습니다. 새로고침해 확인해 주세요.");
        this.currentExportRecord = found; this.exportsList = all; this.updateHistoryList(); this.updateView(); return true;
      },
      onPublishCompleted: async record => {
        if (!bridge || !current()) return false;
        const response = await bridge.listSchedulePlanExports();
        if (!current()) return false;
        const all = this.readArray(response, "게시 이력 조회"), found = all.find(e => e.id === record.id);
        if (!found || found.scheduleId !== snapshot.selectedScheduleId || found.publishStatus !== "published" || found.publishedPath !== record.publishedPath) throw new Error("게시 이력과 실제 경로를 확인하지 못했습니다. 다시 게시하지 말고 새로고침해 확인해 주세요.");
        this.exportsList = all; this.currentExportRecord = found; this.updateHistoryList(); this.updateView(); return true;
      },
    };
  }
  private async handleCreateSchedule(): Promise<void> { await executeCreateSchedule(this.getActionsContext()); }
  private async handleExportExcel(): Promise<void> { await executeExportExcel(this.getActionsContext()); }
  private async handlePublishSchedule(): Promise<void> { await executePublishSchedule(this.getActionsContext()); }
  private updateHistoryList(): void { this.historyRows = joinSchedulePlanExports(this.exportsList, this.storedSchedules, this.sites); this.filteredHistoryRows = filterScheduleHistory(this.historyRows, this.historyFilter); }
  private getTargetMonthStr(): string { return `${this.selectedYear}-${String(this.selectedMonth).padStart(2, "0")}`; }
}
