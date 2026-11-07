import type { AuthSession, MonthlyScheduleRecord, SiteRecord } from "../../shared/domain/model";
import type { ScheduleHistoryRow, SchedulePreviewResult } from "./schedule-model";

export interface ScheduleToolbarState {
  currentTab: "calendar" | "history";
  selectedSiteId: string;
  selectedYear: number;
  selectedMonth: number;
  selectedScheduleId: string | "new";
  isBusy: boolean;
  canWrite: boolean;
  hasValidPreview: boolean;
  hasStoredSchedule: boolean;
  hasExportIdForCurrentTarget: boolean;
  historyFilter: {
    siteId: string;
    scheduleMonth: string;
    status: "all" | "published" | "draft";
    keyword: string;
  };
}

export interface ScheduleViewCallbacks {
  onTabChange: (tab: "calendar" | "history") => void;
  onSiteChange: (siteId: string) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onScheduleChange: (scheduleId: string | "new") => void;
  onPreviewClick: () => void;
  onCreateScheduleClick: () => void;
  onExportExcelClick: () => void;
  onPublishClick: () => void;
  onHistoryFilterChange: (filters: {
    siteId: string;
    scheduleMonth: string;
    status: "all" | "published" | "draft";
    keyword: string;
  }) => void;
}

export class ScheduleView {
  private container: HTMLElement;
  private callbacks: ScheduleViewCallbacks;

  constructor(container: HTMLElement, callbacks: ScheduleViewCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  // 1. KPI 스트립 렌더링 (인라인 스타일 완전 제거)
  public renderKpi(
    state: ScheduleToolbarState,
    calendarData: SchedulePreviewResult | null,
    historyData: ScheduleHistoryRow[],
    selectedSiteName: string,
    selectedMonthStr: string,
  ): void {
    const container = this.container.querySelector<HTMLElement>("#schedule-kpi-container");
    if (!container) return;

    if (state.currentTab === "calendar") {
      const totalEmps = calendarData ? new Set(calendarData.rows.map(r => r.employeeCode)).size : 0;
      const warningCount = calendarData ? calendarData.warningStats.total : 0;
      const fatalCount = calendarData ? calendarData.fatalIssues.length : 0;
      const ready = !!calendarData?.items.length && !fatalCount;
      const isStored = calendarData && calendarData.pattern === null;

      container.innerHTML = `
        <div class="schedule-kpi-card" id="kpi-target-info">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">선택 근무지 / 대상 월</div>
            <div class="schedule-kpi-sub">${this.escape(selectedMonthStr)} (${isStored ? "저장본 조회" : "새 미리보기"})</div>
          </div>
          <div class="schedule-kpi-val">${this.escape(selectedSiteName || "근무지 선택")}</div>
        </div>
        <div class="schedule-kpi-card" id="kpi-roster-count">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">배정 인력</div>
            <div class="schedule-kpi-sub">대상 월 ${calendarData?.dates.length || 0}일 · ${calendarData?.rows.length || 0}개 근무 행</div>
          </div>
          <div class="schedule-kpi-val">${totalEmps}명</div>
        </div>
        <div class="schedule-kpi-card" id="kpi-warning-count">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">규칙 경고</div>
            <div class="schedule-kpi-sub">연속야간 / 최소휴식 등 참고 지표</div>
          </div>
          <div class="schedule-kpi-val ${warningCount > 0 ? "text-warning" : "text-success"}">${warningCount}건</div>
        </div>
        <div class="schedule-kpi-card" id="kpi-status-info">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">생성 가능 여부</div>
            <div class="schedule-kpi-sub">${fatalCount > 0 ? "설정 오류 해소 필요" : ready ? "미리보기 확인 완료" : "자료 조회 필요"}</div>
          </div>
          <div class="schedule-kpi-val ${fatalCount > 0 ? "text-danger" : "text-success"}">
            ${fatalCount > 0 ? `불가 (${fatalCount}건)` : ready ? "가능" : "조회 전"}
          </div>
        </div>
      `;
    } else {
      const totalCount = historyData.length;
      const publishedCount = historyData.filter((h) => h.status === "게시 완료").length;
      const draftCount = historyData.filter((h) => h.status === "생성 완료").length;

      container.innerHTML = `
        <div class="schedule-kpi-card" id="kpi-history-total">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">전체 생성 이력</div>
            <div class="schedule-kpi-sub">조회된 엑셀 생성 목록</div>
          </div>
          <div class="schedule-kpi-val">${totalCount}건</div>
        </div>
        <div class="schedule-kpi-card" id="kpi-history-published">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">배포 폴더 게시 완료</div>
            <div class="schedule-kpi-sub">승인 폴더 전송 완료</div>
          </div>
          <div class="schedule-kpi-val text-success">${publishedCount}건</div>
        </div>
        <div class="schedule-kpi-card" id="kpi-history-draft">
          <div class="schedule-kpi-text">
            <div class="schedule-kpi-lbl">미게시 (생성 완료)</div>
            <div class="schedule-kpi-sub">게시 대기 중인 엑셀 파일</div>
          </div>
          <div class="schedule-kpi-val text-warning">${draftCount}건</div>
        </div>
      `;
    }
  }

  // 2. 툴바 렌더링
  public renderToolbar(
    state: ScheduleToolbarState,
    sites: SiteRecord[],
    storedSchedules: MonthlyScheduleRecord[],
    session: AuthSession,
    historyMonths: string[] = [],
  ): void {
    const toolbar = this.container.querySelector<HTMLElement>("#schedule-toolbar-container");
    if (!toolbar) return;

    const canWrite = state.canWrite && (session.role === "admin" || session.role === "planner");

    if (state.currentTab === "calendar") {
      const siteOptions = sites
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === state.selectedSiteId ? "selected" : ""}>${this.escape(
              s.name,
            )}</option>`,
        )
        .join("");

      const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
        .map(
          (m) =>
            `<option value="${m}" ${m === state.selectedMonth ? "selected" : ""}>${m}월</option>`,
        )
        .join("");

      const versionOptions = [
        `<option value="new" ${state.selectedScheduleId === "new" ? "selected" : ""}>새 근무표 초안 (미리보기)</option>`,
        ...storedSchedules.map(
          (s) =>
            `<option value="${s.id}" ${s.id === state.selectedScheduleId ? "selected" : ""}>저장본 (${this.escape(
              s.generatedAt && Number.isFinite(Date.parse(s.generatedAt)) ? new Date(s.generatedAt).toLocaleString("ko-KR", { hour12: false }) : "생성일시 미등록",
            )} ${this.escape(s.generatedBy)} · ${this.escape(s.id.slice(0, 8))})</option>`,
        ),
      ].join("");

      toolbar.innerHTML = `
        <div class="schedule-toolbar-left">
          <div class="schedule-tab-group" role="tablist">
            <button type="button" class="schedule-tab-btn active" id="tab-btn-calendar" role="tab" ${state.isBusy ? "disabled" : ""} aria-selected="true">월간 근무표</button>
            <button type="button" class="schedule-tab-btn" id="tab-btn-history" role="tab" ${state.isBusy ? "disabled" : ""} aria-selected="false">생성/게시 이력</button>
          </div>
          <select id="select-schedule-site" class="schedule-site-select" aria-label="근무지 선택" ${state.isBusy ? "disabled" : ""}>
            ${siteOptions}
          </select>
          <input type="number" id="input-schedule-year" class="schedule-year-input" aria-label="연도 입력" min="1900" max="9999" value="${Number.isFinite(state.selectedYear) ? state.selectedYear : ""}" ${state.isBusy ? "disabled" : ""} />
          <select id="select-schedule-month" class="schedule-month-select" aria-label="월 선택" ${state.isBusy ? "disabled" : ""}>
            ${monthOptions}
          </select>
          <select id="select-schedule-version" class="schedule-version-select" aria-label="근무표 버전 선택" ${state.isBusy ? "disabled" : ""}>
            ${versionOptions}
          </select>
          <button type="button" class="btn-action-secondary" id="btn-schedule-preview" ${state.isBusy ? "disabled" : ""}>
            미리보기 조회
          </button>
        </div>
        <div class="schedule-toolbar-right">
          <button type="button" class="btn-action-secondary" id="btn-schedule-create"
            ${!canWrite || !state.hasValidPreview || state.isBusy ? "disabled" : ""}
            title="${canWrite ? "초안을 근무표로 저장합니다." : "작성 권한(관리자/플래너)이 필요합니다."}">
            근무표 생성
          </button>
          <button type="button" class="btn-action-primary" id="btn-schedule-export"
            ${!canWrite || !state.hasStoredSchedule || state.isBusy ? "disabled" : ""}
            title="${canWrite ? "저장된 근무표로 엑셀 파일을 생성합니다." : "작성 권한이 필요합니다."}">
            엑셀 생성
          </button>
          <button type="button" class="btn-action-success" id="btn-schedule-publish"
            ${!canWrite || !state.hasExportIdForCurrentTarget || state.isBusy ? "disabled" : ""}
            title="${canWrite ? "생성된 엑셀 파일을 배포 폴더로 게시합니다." : "작성 권한이 필요합니다."}">
            배포 폴더로 게시
          </button>
        </div>
      `;

      this.arrangeToolbar(toolbar);
      this.bindCalendarEvents();
    } else {
      // 이력 탭 툴바
      const siteFilterOptions = [
        `<option value="all">전체 근무지</option>`,
        ...sites.map(
          (s) =>
            `<option value="${s.id}" ${s.id === state.historyFilter.siteId ? "selected" : ""}>${this.escape(
              s.name,
            )}</option>`,
        ),
      ].join("");

      toolbar.innerHTML = `
        <div class="schedule-toolbar-left">
          <div class="schedule-tab-group" role="tablist">
            <button type="button" class="schedule-tab-btn" id="tab-btn-calendar" role="tab" ${state.isBusy ? "disabled" : ""} aria-selected="false">월간 근무표</button>
            <button type="button" class="schedule-tab-btn active" id="tab-btn-history" role="tab" ${state.isBusy ? "disabled" : ""} aria-selected="true">생성/게시 이력</button>
          </div>
          <select id="select-history-site" class="schedule-site-select" aria-label="이력 근무지 필터">
            ${siteFilterOptions}
          </select>
          <select id="select-history-month" aria-label="이력 대상 월 필터">
            <option value="all">전체 월</option>
            ${historyMonths.map(m => `<option value="${this.escape(m)}" ${m === state.historyFilter.scheduleMonth ? "selected" : ""}>${this.escape(m)}</option>`).join("")}
          </select>
          <select id="select-history-status" aria-label="게시 상태 필터">
            <option value="all" ${state.historyFilter.status === "all" ? "selected" : ""}>전체 상태</option>
            <option value="published" ${state.historyFilter.status === "published" ? "selected" : ""}>게시 완료</option>
            <option value="draft" ${state.historyFilter.status === "draft" ? "selected" : ""}>생성 완료</option>
          </select>
          <input type="text" id="input-history-keyword" placeholder="파일명/생성자/월 검색" value="${this.escape(
            state.historyFilter.keyword,
          )}" aria-label="이력 검색어" />
        </div>
        <div class="schedule-toolbar-right">
          <span class="schedule-pagination-info">과거 이력의 재게시는 해당 근무표 선택 후 새 엑셀 생성을 통해 진행됩니다.</span>
        </div>
      `;

      this.arrangeToolbar(toolbar);
      this.bindHistoryEvents();
    }
  }

  private arrangeToolbar(toolbar: HTMLElement): void {
    const tabs = toolbar.querySelector(".schedule-tab-group");
    const actions = toolbar.querySelector(".schedule-toolbar-right");
    if (!tabs || !actions) return;
    const top = document.createElement("div");
    top.className = "schedule-toolbar-top";
    top.append(tabs, actions);
    toolbar.prepend(top);
  }

  private bindCalendarEvents(): void {
    const tabCal = this.container.querySelector("#tab-btn-calendar");
    const tabHist = this.container.querySelector("#tab-btn-history");
    const siteSel = this.container.querySelector<HTMLSelectElement>("#select-schedule-site");
    const yearInp = this.container.querySelector<HTMLInputElement>("#input-schedule-year");
    const monthSel = this.container.querySelector<HTMLSelectElement>("#select-schedule-month");
    const verSel = this.container.querySelector<HTMLSelectElement>("#select-schedule-version");
    const btnPrev = this.container.querySelector("#btn-schedule-preview");
    const btnCreate = this.container.querySelector("#btn-schedule-create");
    const btnExport = this.container.querySelector("#btn-schedule-export");
    const btnPublish = this.container.querySelector("#btn-schedule-publish");

    tabCal?.addEventListener("click", () => this.callbacks.onTabChange("calendar"));
    tabHist?.addEventListener("click", () => this.callbacks.onTabChange("history"));

    siteSel?.addEventListener("change", () => {
      if (siteSel.value) this.callbacks.onSiteChange(siteSel.value);
    });

    yearInp?.addEventListener("change", () => {
      const y = parseInt(yearInp.value, 10);
      this.callbacks.onYearChange(y);
    });

    monthSel?.addEventListener("change", () => {
      const m = parseInt(monthSel.value, 10);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        this.callbacks.onMonthChange(m);
      }
    });

    verSel?.addEventListener("change", () => {
      this.callbacks.onScheduleChange(verSel.value);
    });

    btnPrev?.addEventListener("click", () => this.callbacks.onPreviewClick());
    btnCreate?.addEventListener("click", () => this.callbacks.onCreateScheduleClick());
    btnExport?.addEventListener("click", () => this.callbacks.onExportExcelClick());
    btnPublish?.addEventListener("click", () => this.callbacks.onPublishClick());
  }

  private bindHistoryEvents(): void {
    const tabCal = this.container.querySelector("#tab-btn-calendar");
    const tabHist = this.container.querySelector("#tab-btn-history");
    const siteSel = this.container.querySelector<HTMLSelectElement>("#select-history-site");
    const statusSel = this.container.querySelector<HTMLSelectElement>("#select-history-status");
    const monthSel = this.container.querySelector<HTMLSelectElement>("#select-history-month");
    const kwInp = this.container.querySelector<HTMLInputElement>("#input-history-keyword");

    tabCal?.addEventListener("click", () => this.callbacks.onTabChange("calendar"));
    tabHist?.addEventListener("click", () => this.callbacks.onTabChange("history"));

    const triggerFilter = () => {
      this.callbacks.onHistoryFilterChange({
        siteId: siteSel?.value || "all",
        scheduleMonth: monthSel?.value || "all",
        status: (statusSel?.value as "all" | "published" | "draft") || "all",
        keyword: kwInp?.value || "",
      });
    };

    siteSel?.addEventListener("change", triggerFilter);
    statusSel?.addEventListener("change", triggerFilter);
    monthSel?.addEventListener("change", triggerFilter);
    kwInp?.addEventListener("input", triggerFilter);
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
