// 공휴일 관리 탭 (R05 / UI-ADMIN-02-HOLIDAYS)
import type { HolidayCalendar, HolidayItem } from "../../shared/domain/model";
import type { BridgeResult } from "../../shared/bridge/contracts";
import {
  el,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  sharedDialog
} from "./operations-ui";
import { validateHolidayItem } from "./operations-model";
import {
  filterHolidayItems,
  buildHolidaySyncComparison,
  holidayCalendarFingerprint,
  computeHolidaySummary,
  formatHolidayDateWithDay,
  type HolidayTypeFilter,
  type HolidaySortField,
  type HolidaySortOrder
} from "./operations-holidays-model";
import {
  renderPagination,
  paginateGroupsForHeight,
  measurePaginationBody,
  type PageRange
} from "../pagination";

interface HolidayOperationContext {
  generation: number;
  loadRequestId: number;
  year: number;
  modalToken: number;
}

type HolidayArea = "calendar" | "import";
const HOLIDAY_AREAS = [
  { id: "calendar", label: "등록 공휴일", hint: "연도별 목록과 직접 관리", icon: "event_available", description: "공휴일을 검색하거나 직접 추가·수정합니다. 외부 자료는 ‘외부 공휴일 연동’에서 먼저 비교하세요." },
  { id: "import", label: "외부 공휴일 연동", hint: "변경 내용을 비교한 뒤 적용", icon: "sync", description: "선택한 연도의 외부 공휴일을 불러와 등록 자료와 비교합니다. 불러오기만으로 저장된 목록은 바뀌지 않습니다." }
] as const;

function holidayIcon(name: string): HTMLElement {
  const icon = el("span", "material-symbols-outlined ops-holiday-icon", name);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

/** 라벨과 입력 필드에 id-for 접근성 연결을 보장하는 헬퍼 (HOL-D06) */
function createAccessibleFormGroup(
  labelText: string,
  inputEl: HTMLElement,
  id: string,
  helpText?: string
): HTMLElement {
  inputEl.id = id;
  const group = createFormGroup(labelText, inputEl, helpText);
  const lbl = group.querySelector<HTMLLabelElement>("label");
  if (lbl) {
    lbl.htmlFor = id;
  }
  return group;
}

export class OperationsHolidaysTab {
  private activeArea: HolidayArea = "calendar";
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private operationGeneration = 0;
  private activeOperation: "idle" | "loading" | "fetching" | "editing" | "comparing" | "saving" = "idle";
  private ownedModalToken: number | null = null;
  private readonly controlStates = new WeakMap<HTMLButtonElement | HTMLInputElement | HTMLSelectElement, boolean>();
  private selectedYear: number;
  private currentCalendar: HolidayCalendar | null = null;
  private holidayPreview: { year: number; items: HolidayItem[]; initialFingerprint: string; applied?: boolean; stale?: boolean } | null = null;
  private previewPage = 1;
  private syncError = "";

  // 상태 관리
  private selectedId: string | null = null;
  private searchQuery = "";
  private typeFilter: HolidayTypeFilter = "all";
  private sortField: HolidaySortField = "holidayDate";
  private sortOrder: HolidaySortOrder = "asc";
  private currentPage = 1;
  private pageRanges: PageRange[] = [];
  private bodyHeight = 0;
  private rowHeight = 34;

  // 반응형 및 타이머
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private searchDebounceTimer: number | null = null;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
    this.selectedYear = new Date().getFullYear();
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    this.container.innerHTML = "";
    await this.loadYear(this.selectedYear);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    this.operationGeneration++;
    this.activeOperation = "idle";
    this.closeOwnedDialog();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.container.innerHTML = "";
  }

  private async loadYear(year: number): Promise<void> {
    if (this.isDestroyed) return;
    this.closeOwnedDialog();
    this.operationGeneration++;
    const reqId = ++this.loadRequestId;
    this.selectedYear = year;
    this.holidayPreview = null;
    this.syncError = "";
    this.previewPage = 1;
    this.activeOperation = "loading";
    this.container.innerHTML = "";

    const loading = el("div", "loading-spinner", `${year}년 공휴일 목록을 불러오는 중...`);
    this.container.appendChild(loading);

    const bridge = window.appBridge;
    if (!bridge) {
      loading.remove();
      this.activeOperation = "idle";
      this.container.appendChild(el("div", "alert-danger", "브리지 연결을 찾을 수 없습니다."));
      return;
    }

    try {
      const res = await bridge.listHolidayCalendars(year);
      if (this.isDestroyed || this.loadRequestId !== reqId) return;

      loading.remove();

      if (!res.ok) {
        this.activeOperation = "idle";
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
          return;
        }
        const errCard = el("div", "ops-holidays-error-card alert-danger");
        errCard.textContent = formatErrorMessage(res, "공휴일 목록을 불러오지 못했습니다.");
        const retryBtn = createButton("다시 시도", "secondary", () => this.loadYear(year));
        retryBtn.id = "btn-retry-load-holidays";
        errCard.appendChild(retryBtn);
        this.container.appendChild(errCard);
        return;
      }

      if (!res.data) {
        this.activeOperation = "idle";
        return;
      }

      // HOL-D01: DB에 없는 연도는 가짜 객체 대신 실제 null을 보존하여 첫 가져오기 최신성 불일치 방지
      const calendars: HolidayCalendar[] = res.data;
      this.currentCalendar = calendars.find((c) => c.year === year) || null;

      // 선택 초기화 및 페이지 리셋
      const items = this.getFilteredItems();
      this.currentPage = 1;
      this.selectedId = items.length > 0 ? items[0].id : null;
      this.activeOperation = "idle";

      this.render();
    } catch (e) {
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      this.activeOperation = "idle";
      loading.remove();
      const errCard = el("div", "ops-holidays-error-card alert-danger");
      errCard.textContent = `공휴일 조회 오류: ${String(e)}`;
      const retryBtn = createButton("다시 시도", "secondary", () => this.loadYear(year));
      retryBtn.id = "btn-retry-load-holidays";
      errCard.appendChild(retryBtn);
      this.container.appendChild(errCard);
    }
  }

  private getFilteredItems(): HolidayItem[] {
    const rawItems = this.currentCalendar?.items || [];
    return filterHolidayItems(rawItems, {
      query: this.searchQuery,
      typeFilter: this.typeFilter,
      sortField: this.sortField,
      sortOrder: this.sortOrder
    });
  }

  private updateToolbarLock(): void {
    if (this.isDestroyed) return;
    const isLocked = this.activeOperation !== "idle";
    for (const control of Array.from(this.container.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(".ops-holidays-workspace button, .ops-holidays-workspace input, .ops-holidays-workspace select"))) {
      if (isLocked) {
        if (!this.controlStates.has(control)) this.controlStates.set(control, control.disabled);
        control.disabled = true;
      } else if (this.controlStates.has(control)) {
        control.disabled = this.controlStates.get(control)!;
        this.controlStates.delete(control);
      }
    }
    for (const row of Array.from(this.container.querySelectorAll<HTMLElement>(".holidays-table-row, .th-sortable"))) {
      row.tabIndex = isLocked ? -1 : 0;
      row.setAttribute("aria-disabled", String(isLocked));
    }
    const workspace = this.container.querySelector<HTMLElement>(".ops-holidays-workspace");
    workspace?.setAttribute("aria-busy", String(this.activeOperation === "fetching" || this.activeOperation === "saving"));
    const status = this.container.querySelector<HTMLElement>("#holiday-operation-status");
    if (status) status.textContent = this.activeOperation === "fetching" ? "외부 공휴일을 불러오는 중입니다. 잠시 기다려 주세요."
      : this.activeOperation === "saving" ? "저장 중입니다. 완료될 때까지 기다려 주세요." : "";
  }

  private openOwnedDialog(options: Parameters<typeof sharedDialog.open>[0], state: "editing" | "comparing" = "editing"): HTMLElement {
    this.closeOwnedDialog();
    let token = -1;
    const overlay = sharedDialog.open({
      ...options,
      onClose: () => {
        if (this.ownedModalToken !== token) return;
        this.ownedModalToken = null;
        this.operationGeneration++;
        if (!this.isDestroyed) {
          this.activeOperation = "idle";
          this.updateToolbarLock();
          options.onClose?.();
        }
      }
    });
    token = sharedDialog.captureToken();
    this.ownedModalToken = token;
    this.operationGeneration++;
    this.activeOperation = state;
    this.updateToolbarLock();
    overlay.classList.add("ops-holiday-owned-dialog");
    return overlay;
  }

  private closeOwnedDialog(): void {
    if (!this.isDestroyed && this.activeOperation === "saving") return;
    if (this.ownedModalToken !== null && sharedDialog.isCurrent(this.ownedModalToken)) sharedDialog.close();
    this.ownedModalToken = null;
  }

  private beginOperation(state: "fetching" | "saving"): HolidayOperationContext {
    const context = {
      generation: ++this.operationGeneration,
      loadRequestId: this.loadRequestId,
      year: this.selectedYear,
      modalToken: sharedDialog.captureToken()
    };
    this.activeOperation = state;
    this.updateToolbarLock();
    return context;
  }

  private ownsOperation(context: HolidayOperationContext): boolean {
    return !this.isDestroyed && this.operationGeneration === context.generation &&
      this.loadRequestId === context.loadRequestId && this.selectedYear === context.year;
  }

  private isCurrentOperation(context: HolidayOperationContext): boolean {
    return this.ownsOperation(context) && sharedDialog.captureToken() === context.modalToken;
  }

  private finishOperation(context: HolidayOperationContext): void {
    if (!this.ownsOperation(context)) return;
    this.operationGeneration++;
    this.activeOperation = "idle";
    this.updateToolbarLock();
  }

  private async saveDialog(
    action: (context: HolidayOperationContext) => Promise<BridgeResult<HolidayCalendar> | null>,
    fields: HTMLInputElement[],
    errorBox: HTMLElement,
    successMessage: string,
    selectedDate?: string,
    resumeState: "editing" | "comparing" = "editing"
  ): Promise<void> {
    if (this.isDestroyed || !errorBox.isConnected || (this.activeOperation !== "editing" && this.activeOperation !== "comparing") || this.ownedModalToken === null || !sharedDialog.isCurrent(this.ownedModalToken)) return;
    const context = this.beginOperation("saving");
    errorBox.style.display = "none";
    const previousFields = fields.map(field => field.disabled);
    fields.forEach(field => { field.disabled = true; });
    sharedDialog.setProcessing(true, "저장 결과를 확인하는 중...", context.modalToken);
    try {
      const result = await action(context);
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      if (!result) { this.finishOperation(context); return; }
      if (!result.ok && (result.errorCode === "AUTH_SESSION_REQUIRED" || result.errorCode === "SESSION_EXPIRED")) {
        this.finishOperation(context);
        this.closeOwnedDialog();
        this.onSessionExpired?.();
        return;
      }
      if (result.ok && result.data) {
        this.finishOperation(context);
        this.closeOwnedDialog();
        this.currentCalendar = result.data;
        if (selectedDate) this.selectedId = result.data.items.find(item => item.holidayDate === selectedDate)?.id ?? null;
        this.render();
        showNotice("저장 완료", successMessage, "info");
        return;
      }
      errorBox.textContent = result.ok ? "저장 결과를 확인하지 못했습니다. 다시 조회해 주세요." : formatErrorMessage(result, "저장하지 못했습니다.");
      errorBox.style.display = "block";
      sharedDialog.setProcessing(false, undefined, context.modalToken);
      fields.forEach((field, index) => { field.disabled = previousFields[index]; });
      this.activeOperation = resumeState;
      this.updateToolbarLock();
      if (!result.ok && result.errorCode === "STALE_REVISION") {
        const confirm = document.getElementById("btn-confirm-ok") as HTMLButtonElement | null;
        if (confirm) confirm.disabled = true;
      }
    } catch (error) {
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      errorBox.textContent = String(error);
      errorBox.style.display = "block";
      sharedDialog.setProcessing(false, undefined, context.modalToken);
      fields.forEach((field, index) => { field.disabled = previousFields[index]; });
      this.activeOperation = resumeState;
      this.updateToolbarLock();
    }
  }

  private selectArea(area: HolidayArea, focus = false): void {
    if (this.isDestroyed || this.activeOperation !== "idle") return;
    this.activeArea = area;
    this.updateArea();
    if (focus) this.container.querySelector<HTMLButtonElement>(`#holiday-area-${area}`)?.focus();
    this.fitToHeight();
  }

  private updateArea(): void {
    const area = HOLIDAY_AREAS.find(item => item.id === this.activeArea)!;
    for (const item of HOLIDAY_AREAS) {
      const button = this.container.querySelector<HTMLButtonElement>(`#holiday-area-${item.id}`);
      const panel = this.container.querySelector<HTMLElement>(item.id === "calendar" ? "#holidays-detail-container" : "#holiday-panel-import");
      button?.setAttribute("aria-selected", String(item.id === area.id));
      if (button) button.tabIndex = item.id === area.id ? 0 : -1;
      if (panel) panel.hidden = item.id !== area.id;
    }
    const title = this.container.querySelector<HTMLElement>("#holiday-area-title");
    const description = this.container.querySelector<HTMLElement>("#holiday-area-description");
    if (title) title.textContent = area.label;
    if (description) description.textContent = area.description;
  }

  private render(): void {
    if (this.isDestroyed) return;
    this.container.innerHTML = "";

    const wrap = el("div", "operations-holidays-wrap ops-holidays-workspace ops-menu-workspace");
    wrap.dataset.opsMenu = "holidays";

    const nav = el("div", "ops-holiday-category-nav ops-category-nav");
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "공휴일 세부 카테고리");
    for (const [index, area] of HOLIDAY_AREAS.entries()) {
      const button = createButton("", "secondary", () => this.selectArea(area.id));
      button.id = `holiday-area-${area.id}`;
      button.className = "ops-holiday-category ops-category-button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", area.id === "calendar" ? "holidays-detail-container" : "holiday-panel-import");
      const copy = el("span", "ops-holiday-category-copy");
      copy.append(el("strong", "", area.label), el("small", "", area.hint));
      button.append(holidayIcon(area.icon), copy);
      button.addEventListener("keydown", event => {
        const horizontal = window.innerWidth <= 1100;
        const forward = horizontal ? "ArrowRight" : "ArrowDown";
        const backward = horizontal ? "ArrowLeft" : "ArrowUp";
        const next = event.key === "Home" ? 0 : event.key === "End" ? HOLIDAY_AREAS.length - 1
          : event.key === forward ? (index + 1) % HOLIDAY_AREAS.length
          : event.key === backward ? (index + HOLIDAY_AREAS.length - 1) % HOLIDAY_AREAS.length : -1;
        if (next >= 0) { event.preventDefault(); this.selectArea(HOLIDAY_AREAS[next].id, true); }
      });
      nav.appendChild(button);
    }
    const content = el("div", "ops-holiday-content ops-menu-main");
    const heading = el("div", "ops-holiday-heading ops-menu-heading");
    const intro = el("div", "ops-holiday-intro");
    const title = el("h3", "ops-menu-title"); title.id = "holiday-area-title";
    const description = el("p", "ops-menu-description"); description.id = "holiday-area-description";
    intro.append(title, description);
    const yearField = el("div", "ops-holiday-year-field");
    const yearLabel = el("label", "", "대상 연도"); yearLabel.htmlFor = "holiday-year-select";
    yearField.appendChild(yearLabel);
    heading.append(intro, yearField);
    const calendarPanel = el("div", "ops-holiday-calendar-panel");
    calendarPanel.id = "holiday-panel-calendar";
    calendarPanel.setAttribute("role", "region");
    calendarPanel.setAttribute("aria-label", "등록 공휴일 목록과 공휴일 관리");

    // 1. 전체 폭 요약 KPI 카드 (등록 공휴일 / 일반 공휴일 / 대체공휴일)
    const summary = computeHolidaySummary(this.currentCalendar?.items || []);
    const kpiBar = el("div", "ops-holidays-kpi-bar");

    const createKpiCard = (id: string, label: string, count: number, badgeClass?: string) => {
      const card = el("div", "ops-holidays-kpi-card");
      card.id = id;
      const lbl = el("span", "ops-holidays-kpi-label", label);
      const valWrap = el("div", "ops-holidays-kpi-val-wrap");
      const val = el("span", "ops-holidays-kpi-val", `${count}건`);
      valWrap.appendChild(val);
      if (badgeClass) {
        valWrap.appendChild(el("span", badgeClass));
      }
      card.appendChild(lbl);
      card.appendChild(valWrap);
      return card;
    };

    kpiBar.appendChild(createKpiCard("holidays-kpi-total", "등록 공휴일", summary.totalCount));
    kpiBar.appendChild(createKpiCard("holidays-kpi-regular", "일반 공휴일", summary.regularCount));
    kpiBar.appendChild(createKpiCard("holidays-kpi-substitute", "대체공휴일", summary.substituteCount));
    calendarPanel.appendChild(kpiBar);

    // 2. 전체 폭 도구 모음: 연도 · 검색 · 구분 · 새로고침 | 직접 추가 · 연동 공휴일 불러오기
    const toolbar = el("div", "ops-holidays-toolbar");

    const toolLeft = el("div", "ops-holidays-tool-left");

    // 연도 선택
    const yearSelect = el("select", "form-control year-select") as HTMLSelectElement;
    yearSelect.id = "holiday-year-select";
    yearSelect.setAttribute("aria-label", "공휴일 연도 선택");
    const curYear = new Date().getFullYear();
    for (let y = curYear - 3; y <= curYear + 4; y++) {
      const opt = el("option", "", `${y}년`) as HTMLOptionElement;
      opt.value = String(y);
      if (y === this.selectedYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
    yearSelect.addEventListener("change", () => {
      if (this.activeOperation !== "idle") return;
      this.loadYear(parseInt(yearSelect.value, 10));
    });
    yearField.appendChild(yearSelect);

    // 검색어 입력
    const searchInput = el("input", "form-control holiday-search-input") as HTMLInputElement;
    searchInput.id = "holiday-search-input";
    searchInput.placeholder = "공휴일명 또는 날짜 검색...";
    searchInput.value = this.searchQuery;
    searchInput.setAttribute("aria-label", "공휴일 검색");
    searchInput.addEventListener("input", () => {
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = window.setTimeout(() => {
        this.searchQuery = searchInput.value;
        this.currentPage = 1;
        this.rebuildPagesAndRender();
      }, 150);
    });
    toolLeft.appendChild(searchInput);

    // 구분 필터
    const typeSelect = el("select", "form-control holiday-type-select") as HTMLSelectElement;
    typeSelect.id = "holiday-type-select";
    typeSelect.setAttribute("aria-label", "공휴일 구분 필터");
    const typeOpts: Array<{ value: HolidayTypeFilter; label: string }> = [
      { value: "all", label: "전체 구분" },
      { value: "regular", label: "일반 공휴일" },
      { value: "substitute", label: "대체공휴일" }
    ];
    for (const t of typeOpts) {
      const opt = el("option", "", t.label) as HTMLOptionElement;
      opt.value = t.value;
      if (t.value === this.typeFilter) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener("change", () => {
      this.typeFilter = typeSelect.value as HolidayTypeFilter;
      this.currentPage = 1;
      this.rebuildPagesAndRender();
    });
    toolLeft.appendChild(typeSelect);

    // 새로고침 버튼 (HOL-D05: 줄바꿈 없이 한 줄 유지)
    const refreshBtn = createButton("새로고침", "secondary", () => {
      if (this.activeOperation === "idle") this.loadYear(this.selectedYear);
    });
    refreshBtn.id = "btn-refresh-holidays";
    refreshBtn.title = "현재 연도 공휴일 새로고침";
    refreshBtn.prepend(holidayIcon("refresh"));
    toolLeft.appendChild(refreshBtn);

    toolbar.appendChild(toolLeft);

    const toolRight = el("div", "ops-holidays-tool-right");
    const btnAdd = createButton("공휴일 직접 추가", "primary", () => this.openAddModal());
    btnAdd.id = "btn-add-holiday";
    btnAdd.prepend(holidayIcon("add"));
    toolRight.appendChild(btnAdd);
    const fetchButton = createButton("한국 공휴일 동기화", "secondary", () => { this.selectArea("import"); void this.handleFetchApi(); });
    fetchButton.id = "btn-fetch-holiday-api";
    fetchButton.prepend(holidayIcon("sync"));
    toolRight.appendChild(fetchButton);

    toolbar.appendChild(toolRight);
    calendarPanel.appendChild(toolbar);

    // 3. 본문: 좌측 공휴일 표 (가용 너비) + 우측 선택 공휴일 상세 (380px)
    const body = el("div", "ops-holidays-body");

    // --- 좌측: 표 카드 ---
    const tablePanel = el("div", "ops-holidays-table-panel");

    const viewport = el("div", "ops-holidays-table-viewport");
    viewport.id = "holidays-table-viewport";

    const table = el("table", "ops-holidays-table");
    table.id = "holidays-table";

    const thead = el("thead");
    const headerRow = el("tr");

    const thDate = el("th", "th-sortable th-sticky-date", "날짜·요일");
    thDate.id = "th-holiday-date";
    thDate.setAttribute("role", "button");
    thDate.tabIndex = 0;
    thDate.addEventListener("click", () => this.toggleSort("holidayDate"));
    thDate.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.toggleSort("holidayDate");
      }
    });

    const thName = el("th", "th-sortable", "공휴일 명칭");
    thName.id = "th-holiday-name";
    thName.setAttribute("role", "button");
    thName.tabIndex = 0;
    thName.addEventListener("click", () => this.toggleSort("name"));
    thName.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.toggleSort("name");
      }
    });

    const thType = el("th", "th-center", "구분");
    const thActions = el("th", "th-right", "관리");

    headerRow.appendChild(thDate);
    headerRow.appendChild(thName);
    headerRow.appendChild(thType);
    headerRow.appendChild(thActions);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    tbody.id = "holidays-table-body";
    table.appendChild(tbody);
    viewport.appendChild(table);
    tablePanel.appendChild(viewport);

    // 페이지네이션 바
    const paginationBar = el("div", "ops-holidays-pagination-bar");
    paginationBar.id = "holidays-pagination-container";
    tablePanel.appendChild(paginationBar);

    body.appendChild(tablePanel);

    // --- 우측: 상세 카드 (380px) ---
    const detailPanel = el("div", "ops-holidays-detail-panel");
    detailPanel.id = "holidays-detail-container";
    detailPanel.setAttribute("role", "tabpanel");
    detailPanel.setAttribute("aria-labelledby", "holiday-area-calendar");
    body.appendChild(detailPanel);

    calendarPanel.appendChild(body);
    const importPanel = this.renderImportPanel(summary.totalCount);
    body.appendChild(importPanel);
    const status = el("p", "ops-holiday-operation-status");
    status.id = "holiday-operation-status";
    status.setAttribute("role", "status");
    const footer = el("div", "ops-menu-footer");
    footer.appendChild(el("p", "ops-menu-footnote", "동기화는 오른쪽 미리보기만 불러옵니다. ‘적용하기’를 누르면 선택 연도에 추가·변경하며, 기존 목록에만 있는 날짜는 유지합니다."));
    content.append(heading, calendarPanel, status, footer);
    wrap.append(nav, content);
    this.container.appendChild(wrap);
    this.rebuildPagesAndRender(true);
    this.updateArea();
    this.updateToolbarLock();

    // 높이 측정 및 행 렌더링
    this.setupResizeObserver(viewport);
    this.fitToHeight();
  }

  private renderImportPanel(totalCount: number): HTMLElement {
    const panel = el("section", "ops-holiday-import-panel");
    panel.id = "holiday-panel-import";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "holiday-area-import");
    const previewTitle = el("h4", "", this.selectedYear + "년 한국 공휴일 미리보기");
    previewTitle.title = "기본 연동은 Nager와 Google 대한민국 공휴일을 대조합니다. 기념일은 제외합니다. 사용자 지정 API는 해당 자료를 사용합니다. 임시공휴일 등 최신 지정 내용을 확인한 뒤 적용하세요.";
    panel.appendChild(previewTitle);
    if (this.syncError) {
      const error = el("div", "alert-danger", this.syncError);
      error.setAttribute("role", "alert");
      panel.appendChild(error);
    }
    const preview = this.holidayPreview;
    if (!preview) {
      panel.appendChild(el("p", "ops-holiday-import-help", "한국 공휴일 동기화 → 목록 확인 → 적용하기 순서로 진행하세요. 기존 목록에만 있는 날짜는 유지됩니다."));
      panel.appendChild(el("p", "ops-holiday-import-context", this.selectedYear + "년 · 등록 " + totalCount + "건"));
      panel.appendChild(el("p", "ops-holidays-preview-empty", "‘한국 공휴일 동기화’를 누르면 이곳에 목록이 표시됩니다. 불러오기만으로 저장되지는 않습니다."));
      return panel;
    }
    const comparison = buildHolidaySyncComparison(this.currentCalendar?.items ?? [], preview.items, preview.year);
    const fetchedDates = new Set(preview.items.map(item => item.holidayDate));
    const retained = (this.currentCalendar?.items ?? []).filter(item => !fetchedDates.has(item.holidayDate)).length;
    const summary = el("p", "ops-holiday-import-context", "불러온 " + preview.items.length + "건 · 추가 " + comparison.addedCount + "건 · 변경 " + comparison.modifiedCount + "건 · 기존 전용 날짜 유지 " + retained + "건");
    summary.id = "holiday-import-context";
    panel.appendChild(summary);
    const previewHeading = el("div", "ops-holiday-preview-heading");
    previewHeading.append(...Array.from(panel.childNodes));
    panel.appendChild(previewHeading);
    const viewport = el("div", "ops-holiday-preview-viewport compare-table-wrap");
    const table = el("table", "compare-diff-table");
    const thead = el("thead");
    const header = el("tr");
    for (const label of ["날짜·요일", "공휴일 명칭", "구분", "변경"]) header.appendChild(el("th", "", label));
    thead.appendChild(header); table.appendChild(thead);
    const tbody = el("tbody");
    const totalPages = Math.max(1, Math.ceil(preview.items.length / 10));
    this.previewPage = Math.min(this.previewPage, totalPages);
    for (const item of preview.items.slice((this.previewPage - 1) * 10, this.previewPage * 10)) {
      const change = comparison.rows.find(row => row.holidayDate === item.holidayDate)?.changeType ?? "unchanged";
      const row = el("tr", "diff-row diff-" + change);
      row.append(el("td", "", formatHolidayDateWithDay(item.holidayDate)), el("td", "", item.name), el("td", "th-center", item.isSubstitute ? "대체" : "일반"), el("td", "th-center", change === "added" ? "추가" : change === "modified" ? "변경" : "동일"));
      tbody.appendChild(row);
    }
    table.appendChild(tbody); viewport.appendChild(table); panel.appendChild(viewport);
    const pager = el("div", "compare-pagination-bar");
    pager.appendChild(el("span", "compare-pagination-info", `전체 ${preview.items.length}건 · ${this.previewPage}/${totalPages}페이지`));
    pager.appendChild(renderPagination({ currentPage: this.previewPage, totalPages, totalCount: preview.items.length, idPrefix: "compare-holidays", label: "불러온 공휴일 목록 페이지 이동", onPageChange: page => {
      if (this.activeOperation !== "idle") return;
      this.previewPage = page; this.render();
    } }));
    panel.appendChild(pager);
    const actions = el("div", "ops-holiday-import-actions");
    const apply = createButton(preview.applied ? "적용 완료" : "적용하기", "primary", () => this.handleApplyPreview());
    apply.id = "btn-apply-holiday-preview";
    apply.disabled = !!preview.applied || !!preview.stale || !comparison.hasChanges || !!comparison.validationErrors.length;
    const cancel = createButton("미리보기 닫기", "secondary", () => {
      if (this.activeOperation !== "idle") return;
      this.holidayPreview = null; this.syncError = ""; this.render();
    });
    cancel.id = "btn-cancel-holiday-preview";
    actions.append(apply, cancel); panel.appendChild(actions);
    if (preview.applied || !comparison.hasChanges) panel.appendChild(el("p", "ops-holiday-import-help", preview.applied ? "선택 연도의 공휴일에 적용했습니다." : "추가하거나 변경할 내용이 없습니다."));
    return panel;
  }

  private toggleSort(field: HolidaySortField): void {
    if (this.isDestroyed || this.activeOperation !== "idle") return;
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    } else {
      this.sortField = field;
      this.sortOrder = "asc";
    }
    this.currentPage = 1;
    this.rebuildPagesAndRender();
  }

  private setupResizeObserver(viewport: HTMLElement): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.fitToHeight();
      });
    });
    this.resizeObserver.observe(viewport);
    this.resizeObserver.observe(this.container);
  }

  private fitToHeight(): void {
    if (this.isDestroyed) return;
    this.container.querySelector(".ops-holiday-category-nav")?.setAttribute("aria-orientation", window.innerWidth <= 1100 ? "horizontal" : "vertical");
    const viewport = this.container.querySelector<HTMLElement>("#holidays-table-viewport");
    const head = this.container.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head || !viewport.getClientRects().length) return;

    const row = this.container.querySelector<HTMLElement>(".holidays-table-row");
    const measuredHeight = measurePaginationBody(viewport, head);
    const measuredRowHeight = row?.getBoundingClientRect().height || this.rowHeight;

    this.bodyHeight = measuredHeight;
    this.rowHeight = measuredRowHeight;

    this.rebuildPagesAndRender(true);
  }

  private rebuildPagesAndRender(preserveSelection = false): void {
    if (this.isDestroyed) return;
    const items = this.getFilteredItems();

    // 페이지 분할 (HOL-D05: 32~36px 기준 행 높이로 온전한 행 채움)
    this.pageRanges = paginateGroupsForHeight(
      items,
      this.bodyHeight,
      this.rowHeight,
      0,
      () => ""
    );

    if (preserveSelection && this.selectedId) {
      const selectedIndex = items.findIndex(item => item.id === this.selectedId);
      const pageIndex = this.pageRanges.findIndex(range => selectedIndex >= range.start && selectedIndex < range.end);
      if (pageIndex >= 0) this.currentPage = pageIndex + 1;
    }

    // 유효 페이지 보정
    const maxPage = Math.max(1, this.pageRanges.length);
    if (this.currentPage > maxPage) {
      this.currentPage = maxPage;
    }

    // 선택 항목 유효성 점검
    const currentRange = this.pageRanges[this.currentPage - 1];
    const pageItems = currentRange ? items.slice(currentRange.start, currentRange.end) : [];

    const isSelectedInPage = pageItems.some((i) => i.id === this.selectedId);
    if (!isSelectedInPage && pageItems.length > 0) {
      this.selectedId = pageItems[0].id;
    } else if (pageItems.length === 0) {
      this.selectedId = null;
    }

    this.renderTableRows(items, pageItems);
    this.renderPaginationBar(items.length);
    this.renderDetailPanel();
    this.updateToolbarLock();
  }

  private renderTableRows(allItems: HolidayItem[], pageItems: HolidayItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>("#holidays-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    // 빈 상태 분기
    if (allItems.length === 0) {
      const tr = el("tr", "ops-holidays-empty-row");
      const td = el("td", "ops-holidays-empty-cell");
      td.setAttribute("colspan", "4");

      if (this.searchQuery || this.typeFilter !== "all") {
        td.textContent = "검색 조건에 일치하는 공휴일이 없습니다.";
      } else {
        const emptyMsg = el("div", "ops-empty-content");
        emptyMsg.appendChild(el("p", "", `${this.selectedYear}년에 등록된 공휴일이 없습니다.`));
        const btnAdd = createButton("+ 첫 공휴일 직접 추가", "primary", () => this.openAddModal());
        emptyMsg.appendChild(btnAdd);
        td.appendChild(emptyMsg);
      }

      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const item of pageItems) {
      const tr = el("tr", `holidays-table-row ${item.id === this.selectedId ? "selected" : ""}`);
      tr.dataset.id = item.id;
      tr.tabIndex = 0;
      tr.setAttribute("role", "row");
      tr.setAttribute("aria-selected", item.id === this.selectedId ? "true" : "false");

      const selectRow = () => {
        if (this.isDestroyed || this.activeOperation !== "idle") return;
        this.selectedId = item.id;
        this.updateSelection();
        this.renderDetailPanel();
        if (window.innerWidth <= 1100) {
          this.openDetailModal(item);
        }
      };

      tr.addEventListener("click", (e) => {
        // 자식 버튼 클릭 시에는 행 선택을 중복 실행하지 않음
        if ((e.target as HTMLElement).closest("button")) return;
        selectRow();
      });

      // HOL-D06: 자식 버튼의 Enter/Space가 행 선택으로 가로채지지 않도록 분리
      tr.addEventListener("keydown", (e) => {
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectRow();
        }
      });

      // 1. 날짜 및 요일 (HOL-D05: 좌측 고정 sticky)
      const tdDate = el("td", "cell-date cell-sticky-date", formatHolidayDateWithDay(item.holidayDate));
      tr.appendChild(tdDate);

      // 2. 명칭 (HOL-D05: 말줄임 + 안전한 텍스트 렌더링)
      const tdName = el("td", "cell-name");
      tdName.textContent = item.name;
      tdName.title = item.name;
      tr.appendChild(tdName);

      // 3. 구분 배지
      const tdType = el("td", "cell-type th-center");
      if (item.isSubstitute) {
        tdType.appendChild(el("span", "badge-substitute", "대체공휴일"));
      } else {
        tdType.appendChild(el("span", "badge-regular", "일반"));
      }
      tr.appendChild(tdType);

      // 4. 관리 액션 버튼 (HOL-D05: 26px 높이 컴팩트 버튼)
      const tdActions = el("td", "cell-actions th-right");
      const actWrap = el("div", "table-action-btns");

      const btnRename = createButton("수정", "secondary", (e) => {
        e.stopPropagation();
        this.openRenameModal(item);
      });
      btnRename.classList.add("btn-sm", "btn-rename-holiday");
      btnRename.id = `btn-rename-${item.id}`;
      btnRename.setAttribute("aria-label", `${item.name} 명칭 수정`);

      const btnDelete = createButton("삭제", "danger", (e) => {
        e.stopPropagation();
        this.handleDelete(item);
      });
      btnDelete.classList.add("btn-sm", "btn-delete-holiday");
      btnDelete.id = `btn-delete-${item.id}`;
      btnDelete.setAttribute("aria-label", `${item.name} 삭제`);

      actWrap.appendChild(btnRename);
      actWrap.appendChild(btnDelete);
      tdActions.appendChild(actWrap);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    }
  }

  private updateSelection(): void {
    const rows = this.container.querySelectorAll<HTMLTableRowElement>(".holidays-table-row");
    rows.forEach((row) => {
      const isSel = row.dataset.id === this.selectedId;
      row.classList.toggle("selected", isSel);
      row.setAttribute("aria-selected", isSel ? "true" : "false");
    });
  }

  private renderPaginationBar(totalCount: number): void {
    const pager = this.container.querySelector<HTMLElement>("#holidays-pagination-container");
    if (!pager) return;
    pager.replaceChildren();

    const pages = this.pageRanges.length;
    const range = this.pageRanges[this.currentPage - 1];

    const description = el("span", "ops-holidays-pagination-info");
    description.setAttribute("role", "status");
    description.setAttribute("aria-live", "polite");

    if (totalCount > 0 && range) {
      description.textContent = `전체 ${totalCount}건 · ${range.start + 1}–${range.end}건 · ${this.currentPage}/${pages}페이지`;
    } else {
      description.textContent = `전체 0건`;
    }
    pager.appendChild(description);

    if (totalCount > 0) {
      pager.appendChild(
        renderPagination({
          currentPage: this.currentPage,
          totalPages: pages,
          totalCount,
          idPrefix: "holidays",
          label: "공휴일 목록 페이지 이동",
          onPageChange: (page) => {
            if (this.isDestroyed || this.activeOperation !== "idle") return;
            this.currentPage = page;
            const items = this.getFilteredItems();
            const r = this.pageRanges[this.currentPage - 1];
            const pageItems = r ? items.slice(r.start, r.end) : [];
            if (pageItems.length > 0) {
              this.selectedId = pageItems[0].id;
            }
            this.renderTableRows(items, pageItems);
            this.renderPaginationBar(items.length);
            this.renderDetailPanel();
          }
        })
      );
    }
  }

  private renderDetailPanel(): void {
    const panel = this.container.querySelector<HTMLElement>("#holidays-detail-container");
    if (!panel) return;
    panel.innerHTML = "";

    const selectedItem = (this.currentCalendar?.items || []).find((i) => i.id === this.selectedId);

    const heading = el("h4", "ops-detail-title", "공휴일 상세 정보");
    panel.appendChild(heading);

    if (!selectedItem) {
      const emptyState = el("div", "ops-detail-empty");
      emptyState.textContent = "목록에서 공휴일을 선택하면 상세 정보를 확인하고 수정할 수 있습니다.";
      panel.appendChild(emptyState);
      return;
    }

    const detailList = el("div", "ops-detail-field-list");

    const addField = (label: string, value: string | HTMLElement) => {
      const row = el("div", "ops-detail-field-row");
      row.appendChild(el("span", "ops-detail-field-label", label));
      if (typeof value === "string") {
        const valEl = el("span", "ops-detail-field-value");
        valEl.textContent = value;
        row.appendChild(valEl);
      } else {
        row.appendChild(value);
      }
      detailList.appendChild(row);
    };

    addField("날짜", formatHolidayDateWithDay(selectedItem.holidayDate));
    addField("공휴일 명칭", selectedItem.name);
    addField(
      "구분",
      selectedItem.isSubstitute
        ? el("span", "badge-substitute", "대체공휴일")
        : el("span", "badge-regular", "일반 공휴일")
    );
    addField("적용 연도", `${this.selectedYear}년`);
    addField("목록 출처", this.currentCalendar?.sourceName || "수동 등록");

    panel.appendChild(detailList);

    // 하단 작업 버튼
    const actionGroup = el("div", "ops-detail-actions");
    const btnRename = createButton("명칭 수정", "secondary", () => this.openRenameModal(selectedItem));
    btnRename.id = "btn-detail-rename";

    const btnDelete = createButton("공휴일 삭제", "danger", () => this.handleDelete(selectedItem));
    btnDelete.id = "btn-detail-delete";

    actionGroup.appendChild(btnRename);
    actionGroup.appendChild(btnDelete);
    panel.appendChild(actionGroup);
  }

  private openDetailModal(item: HolidayItem): void {
    if (this.isDestroyed || this.activeOperation !== "idle" || sharedDialog.isOpen()) return;
    const content = el("div", "ops-holidays-detail-modal-body");
    const list = el("div", "ops-detail-field-list");

    const addField = (label: string, value: string | HTMLElement) => {
      const row = el("div", "ops-detail-field-row");
      row.appendChild(el("span", "ops-detail-field-label", label));
      if (typeof value === "string") {
        const valEl = el("span", "ops-detail-field-value");
        valEl.textContent = value;
        row.appendChild(valEl);
      } else {
        row.appendChild(value);
      }
      list.appendChild(row);
    };

    addField("날짜", formatHolidayDateWithDay(item.holidayDate));
    addField("공휴일 명칭", item.name);
    addField(
      "구분",
      item.isSubstitute
        ? el("span", "badge-substitute", "대체공휴일")
        : el("span", "badge-regular", "일반 공휴일")
    );
    addField("적용 연도", `${this.selectedYear}년`);
    addField("목록 출처", this.currentCalendar?.sourceName || "수동 등록");
    content.appendChild(list);

    this.openOwnedDialog({
      id: "modal-holiday-detail",
      title: "공휴일 상세",
      width: "420px",
      content,
      buttons: [
        {
          id: "btn-modal-detail-delete",
          label: "삭제",
          variant: "danger",
          onClick: () => {
            sharedDialog.close();
            this.handleDelete(item);
          }
        },
        {
          id: "btn-modal-detail-rename",
          label: "수정",
          variant: "secondary",
          onClick: () => {
            sharedDialog.close();
            this.openRenameModal(item);
          }
        },
        {
          id: "btn-modal-detail-close",
          label: "닫기",
          variant: "primary",
          onClick: () => sharedDialog.close()
        }
      ]
    });
  }

  private openAddModal(): void {
    if (this.isDestroyed || this.activeOperation !== "idle" || sharedDialog.isOpen()) return;
    const year = this.selectedYear;
    const content = el("div", "modal-form");
    const dateInput = el("input", "form-control") as HTMLInputElement;
    dateInput.type = "date";
    dateInput.value = `${year}-01-01`;
    dateInput.min = `${year}-01-01`;
    dateInput.max = `${year}-12-31`;
    content.appendChild(createAccessibleFormGroup("공휴일 날짜", dateInput, "input-add-holiday-date"));
    const nameInput = el("input", "form-control") as HTMLInputElement;
    nameInput.placeholder = "공휴일 명칭 입력 (예: 어린이날)";
    content.appendChild(createAccessibleFormGroup("공휴일 명칭", nameInput, "input-add-holiday-name"));
    const group = el("fieldset", "form-group holiday-type-fieldset");
    group.appendChild(el("legend", "form-label", "구분"));
    const subCheck = el("input", "form-checkbox") as HTMLInputElement;
    subCheck.type = "checkbox";
    subCheck.id = "input-add-holiday-substitute";
    const subLabel = el("label", "checkbox-label", "대체공휴일 여부") as HTMLLabelElement;
    subLabel.htmlFor = subCheck.id;
    group.append(subCheck, subLabel);
    content.appendChild(group);
    const errorBox = el("div", "alert-danger");
    errorBox.style.display = "none";
    errorBox.setAttribute("role", "alert");
    content.appendChild(errorBox);
    this.openOwnedDialog({
      id: "modal-add-holiday", title: "공휴일 추가", width: "440px", content,
      buttons: [
        { id: "btn-modal-cancel", label: "취소", variant: "secondary", onClick: () => this.closeOwnedDialog() },
        { id: "btn-modal-submit", label: "추가", variant: "primary", onClick: async () => {
          const bridge = window.appBridge;
          if (!bridge || !content.isConnected) return;
          const date = dateInput.value.trim(), name = nameInput.value.trim(), isSubstitute = subCheck.checked;
          const check = validateHolidayItem(date, name, year, this.currentCalendar?.items || []);
          if (!check.isValid) {
            errorBox.textContent = check.error || "입력값을 확인해 주세요.";
            errorBox.style.display = "block";
            return;
          }
          await this.saveDialog(() => bridge.addHolidayItem({ year, holidayDate: date, name, isSubstitute }),
            [dateInput, nameInput, subCheck], errorBox, `공휴일 '${name}'이(가) 추가되었습니다.`, date);
        } }
      ]
    });
  }

  private openRenameModal(item: HolidayItem): void {
    if (this.isDestroyed || this.activeOperation !== "idle" || sharedDialog.isOpen()) return;
    const content = el("div", "modal-form");
    const dateInput = el("input", "form-control") as HTMLInputElement;
    dateInput.value = formatHolidayDateWithDay(item.holidayDate);
    dateInput.readOnly = true;
    content.appendChild(createAccessibleFormGroup("날짜 (수정 불가)", dateInput, "input-rename-holiday-date"));
    const nameInput = el("input", "form-control") as HTMLInputElement;
    nameInput.value = item.name;
    content.appendChild(createAccessibleFormGroup("공휴일 명칭", nameInput, "input-rename-holiday-name"));
    const errorBox = el("div", "alert-danger");
    errorBox.style.display = "none";
    errorBox.setAttribute("role", "alert");
    content.appendChild(errorBox);
    this.openOwnedDialog({
      id: "modal-rename-holiday", title: "공휴일 명칭 수정", width: "440px", content,
      buttons: [
        { id: "btn-modal-cancel", label: "취소", variant: "secondary", onClick: () => this.closeOwnedDialog() },
        { id: "btn-modal-submit", label: "수정 저장", variant: "primary", onClick: async () => {
          const bridge = window.appBridge, name = nameInput.value.trim();
          if (!bridge || !content.isConnected) return;
          if (!name) {
            errorBox.textContent = "공휴일 명칭을 입력해 주세요.";
            errorBox.style.display = "block";
            return;
          }
          await this.saveDialog(() => bridge.renameHolidayItem({ holidayItemId: item.id, name }),
            [nameInput], errorBox, "공휴일 명칭이 변경되었습니다.");
        } }
      ]
    });
  }

  private handleDelete(item: HolidayItem): void {
    if (this.isDestroyed || this.activeOperation !== "idle" || sharedDialog.isOpen()) return;
    const content = el("div", "modal-form");
    content.appendChild(el("p", "delete-confirm-message", `'${formatHolidayDateWithDay(item.holidayDate)} (${item.name})' 공휴일을 삭제하시겠습니까?`));
    content.appendChild(el("p", "text-muted delete-confirm-submessage", "선택한 공휴일 한 건을 목록에서 삭제합니다. 취소하면 유지되며, 삭제 후 되돌리기 기능은 없습니다. 기존 승인 금액을 이 화면에서 다시 계산하지 않습니다."));
    const errorBox = el("div", "alert-danger");
    errorBox.style.display = "none";
    errorBox.setAttribute("role", "alert");
    content.appendChild(errorBox);
    this.openOwnedDialog({
      id: "modal-delete-holiday", title: "공휴일 삭제 확인", width: "440px", content,
      buttons: [
        { id: "btn-confirm-cancel", label: "취소", variant: "secondary", onClick: () => this.closeOwnedDialog() },
        { id: "btn-confirm-ok", label: "삭제", variant: "danger", onClick: async () => {
          const bridge = window.appBridge;
          if (!bridge || !content.isConnected) return;
          await this.saveDialog(() => bridge.deleteHolidayItem({ holidayItemId: item.id }), [], errorBox, "공휴일이 삭제되었습니다.");
        } }
      ]
    });
  }

  private async handleFetchApi(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isDestroyed || this.activeOperation !== "idle" || sharedDialog.isOpen() || !bridge) return;
    this.holidayPreview = null; this.syncError = ""; this.previewPage = 1;
    this.render();
    const initialFingerprint = holidayCalendarFingerprint(this.currentCalendar);
    const context = this.beginOperation("fetching");
    try {
      const result = await bridge.fetchHolidayApiItems(context.year);
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      if (!result.ok && (result.errorCode === "AUTH_SESSION_REQUIRED" || result.errorCode === "SESSION_EXPIRED")) {
        this.finishOperation(context); this.onSessionExpired?.(); return;
      }
      if (!result.ok || !result.data) throw new Error(result.ok ? "공휴일 목록을 확인하지 못했습니다." : formatErrorMessage(result, "공휴일을 불러오지 못했습니다."));
      const items = result.data.map(item => ({ ...item }));
      const comparison = buildHolidaySyncComparison(this.currentCalendar?.items ?? [], items, context.year);
      if (comparison.validationErrors.length) throw new Error(comparison.validationErrors.join("\n"));
      this.holidayPreview = { year: context.year, items, initialFingerprint };
      this.finishOperation(context); this.render();
    } catch (error) {
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      this.syncError = "기존 공휴일은 유지됩니다. " + String(error);
      this.finishOperation(context); this.render();
    }
  }

  private async handleApplyPreview(): Promise<void> {
    const bridge = window.appBridge, preview = this.holidayPreview;
    if (!bridge || !preview || preview.applied || preview.stale || preview.year !== this.selectedYear || this.isDestroyed || this.activeOperation !== "idle" || sharedDialog.isOpen()) return;
    const comparison = buildHolidaySyncComparison(this.currentCalendar?.items ?? [], preview.items, preview.year);
    if (!comparison.hasChanges || comparison.validationErrors.length) return;
    const selectedDate = this.currentCalendar?.items.find(item => item.id === this.selectedId)?.holidayDate;
    const context = this.beginOperation("saving");
    this.syncError = "";
    try {
      const latest = await bridge.listHolidayCalendars(preview.year);
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      if (!latest.ok) {
        if (latest.errorCode === "AUTH_SESSION_REQUIRED" || latest.errorCode === "SESSION_EXPIRED") { this.finishOperation(context); this.onSessionExpired?.(); return; }
        throw new Error(formatErrorMessage(latest, "최신 공휴일을 조회하지 못했습니다."));
      }
      if (!latest.data) throw new Error("최신 공휴일 목록을 확인하지 못했습니다.");
      if (holidayCalendarFingerprint(latest.data.find(item => item.year === preview.year) ?? null) !== preview.initialFingerprint) {
        preview.stale = true;
        throw new Error("공휴일 목록이 변경되었습니다. 새로고침한 뒤 다시 동기화해 주세요.");
      }
      const result = await bridge.replaceHolidayCalendar({ year: preview.year, sourceName: "한국 공휴일 동기화", preserveExisting: true, expectedFingerprint: preview.initialFingerprint, items: preview.items.map(({ holidayDate, name, isSubstitute }) => ({ holidayDate, name, isSubstitute })) });
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      if (!result.ok) {
        if (result.errorCode === "AUTH_SESSION_REQUIRED" || result.errorCode === "SESSION_EXPIRED") { this.finishOperation(context); this.onSessionExpired?.(); return; }
        // A server-side fingerprint rejection requires a new preview as well.
        if (result.message?.includes("목록이 변경")) preview.stale = true;
        throw new Error(formatErrorMessage(result, "공휴일을 저장하지 못했습니다."));
      }
      if (!result.data) throw new Error("저장 결과를 확인하지 못했습니다. 새로고침해 주세요.");
      this.currentCalendar = result.data;
      this.selectedId = result.data.items.find(item => item.holidayDate === selectedDate)?.id ?? null;
      preview.applied = true;
      this.finishOperation(context); this.render();
      showNotice("저장 완료", preview.year + "년 공휴일을 적용했습니다. 기존 목록에만 있는 날짜는 유지했습니다.", "info");
    } catch (error) {
      if (!this.isCurrentOperation(context)) { this.finishOperation(context); return; }
      this.syncError = "적용하지 못했습니다. " + String(error);
      this.finishOperation(context); this.render();
    }
  }
}
