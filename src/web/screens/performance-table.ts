import {
  measurePaginationBody,
  paginateGroupsForHeight,
  renderPagination,
  type PageRange
} from "../pagination";
import type { PerformanceOverviewRow } from "../../shared/domain/performance-file";
import {
  deriveRowBadges,
  formatSectionLabel,
  getPerformanceDuty,
  getPerformancePageSelection,
  getDensityHeights,
  type DensityMode,
  type PerformanceDutyContext
} from "./performance-model";
import { escapeHtml } from "./performance-view";

export interface PerformanceTableCallbacks {
  onSelectRow: (row: PerformanceOverviewRow) => void;
  onToggleSiteCollapse: (siteName: string) => void;
  onPageChange: (page: number) => void;
}

export class PerformanceTable {
  private container: HTMLElement;
  private rows: PerformanceOverviewRow[] = [];
  private collapsedSites: Set<string> = new Set();
  private selectedRowId: string | null = null;
  private density: DensityMode = "normal";
  private currentPage = 1;
  private pages: PageRange[] = [{ start: 0, end: 0 }];
  private callbacks: PerformanceTableCallbacks;
  private dutyContext: PerformanceDutyContext = { sites: [], patterns: [], schedules: [] };

  private bodyHeight = 500;
  private rowHeight = 38;
  private groupHeight = 32;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(container: HTMLElement, callbacks: PerformanceTableCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public setData(
    rows: PerformanceOverviewRow[],
    collapsedSites: Set<string>,
    selectedRowId: string | null,
    density: DensityMode,
    page = this.currentPage,
    dutyContext = this.dutyContext
  ): void {
    this.rows = rows;
    this.collapsedSites = collapsedSites;
    this.selectedRowId = selectedRowId;
    this.density = density;
    this.currentPage = page;
    this.dutyContext = dutyContext;

    const heights = getDensityHeights(this.density);
    this.rowHeight = heights.rowHeight;
    this.groupHeight = heights.groupHeight;

    this.rebuildPages();
    this.syncPageSelection();
    this.render();
  }

  public getCurrentPage(): number { return this.currentPage; }

  public getSelectedRowId(): string | null {
    return this.selectedRowId;
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    this.container.innerHTML = "";
  }

  private rebuildPages(): void {
    this.pages = paginateGroupsForHeight(
      this.rows,
      this.bodyHeight,
      this.rowHeight,
      this.groupHeight,
      row => row.entry.siteName || "미지정"
    );

    if (this.currentPage > this.pages.length) {
      this.currentPage = Math.max(1, this.pages.length);
    }
  }

  public fitToHeight(): void {
    const viewport = this.container.querySelector<HTMLElement>(".perf-table-viewport");
    const head = this.container.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head) return;

    const row = this.container.querySelector<HTMLElement>(".perf-data-row");
    const group = this.container.querySelector<HTMLElement>(".perf-group-row");

    const height = measurePaginationBody(viewport, head);
    const measuredRowHeight = row?.getBoundingClientRect().height || this.rowHeight;
    const measuredGroupHeight = group?.getBoundingClientRect().height || this.groupHeight;

    if (
      Math.abs(height - this.bodyHeight) < 0.25 &&
      Math.abs(measuredRowHeight - this.rowHeight) < 0.25 &&
      Math.abs(measuredGroupHeight - this.groupHeight) < 0.25
    ) {
      return;
    }

    const range = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    const anchorRowId = getPerformancePageSelection(this.rows, range, this.selectedRowId, this.collapsedSites)?.rowId
      || this.rows[range.start]?.rowId;
    this.bodyHeight = height;
    this.rowHeight = measuredRowHeight;
    this.groupHeight = measuredGroupHeight;

    this.rebuildPages();

    if (anchorRowId) {
      const idx = this.rows.findIndex(r => r.rowId === anchorRowId);
      if (idx >= 0) {
        const pageIdx = this.pages.findIndex(
          range => range.start <= idx && idx < range.end
        );
        if (pageIdx >= 0) {
          this.currentPage = pageIdx + 1;
        }
      }
    }

    this.syncPageSelection();
    this.renderTableBodyAndFooter();
    this.callbacks.onPageChange(this.currentPage);
  }

  private syncPageSelection(): void {
    const range = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    this.selectedRowId = getPerformancePageSelection(this.rows, range, this.selectedRowId, this.collapsedSites)?.rowId || null;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="perf-table-viewport density-${this.density}">
        <table class="perf-table" aria-label="실적 내역 표">
          <thead>
            <tr>
              <th scope="col" class="perf-col-no">No</th>
              <th scope="col" class="perf-col-date">근무일</th>
              <th scope="col" class="perf-col-code">사번</th>
              <th scope="col" class="perf-col-name">이름</th>
              <th scope="col" class="perf-col-team">조</th>
              <th scope="col" class="perf-col-type">근무 유형</th>
              <th scope="col" class="perf-col-section">실적 구분</th>
              <th scope="col" class="perf-col-time">시간</th>
              <th scope="col" class="perf-col-total">총분</th>
              <th scope="col" class="perf-col-status">상태</th>
              <th scope="col">비고 / 사유</th>
            </tr>
          </thead>
          <tbody id="perf-table-body"></tbody>
        </table>
      </div>
      <div class="perf-table-footer" id="perf-table-footer"></div>
    `;

    this.renderTableBodyAndFooter();
    this.setupResizeObserver();
  }

  private renderTableBodyAndFooter(): void {
    const tbody = this.container.querySelector<HTMLTableSectionElement>("#perf-table-body");
    const footer = this.container.querySelector<HTMLElement>("#perf-table-footer");
    if (!tbody || !footer) return;

    tbody.innerHTML = "";

    const currentRange = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    const pageRows = this.rows.slice(currentRange.start, currentRange.end);

    if (pageRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="perf-cell-empty">
            조회된 실적이 없습니다.
          </td>
        </tr>
      `;
      footer.innerHTML = `
        <div class="perf-footer-info">전체 0건</div>
      `;
      return;
    }

    let prevSite = "";
    pageRows.forEach((row, idx) => {
      const siteName = row.entry.siteName || "미지정 근무지";
      const isFirstOfGroupOnPage = siteName !== prevSite;
      const isContinuation =
        isFirstOfGroupOnPage &&
        currentRange.start > 0 &&
        this.rows[currentRange.start - 1]?.entry.siteName === siteName;

      if (isFirstOfGroupOnPage) {
        prevSite = siteName;
        const groupTr = document.createElement("tr");
        groupTr.className = "perf-group-row";
        groupTr.dataset.site = siteName;
        const isCollapsed = this.collapsedSites.has(siteName);

        const totalInSite = this.rows.filter(r => r.entry.siteName === siteName).length;

        groupTr.innerHTML = `
          <td colspan="11" class="perf-group-cell">
            <div class="perf-group-inner">
              <span class="material-symbols-outlined perf-group-toggle-icon ${
                isCollapsed ? "collapsed" : ""
              }" aria-hidden="true">expand_more</span>
              <span><strong>${escapeHtml(siteName)}</strong></span>
              <span class="perf-group-count-badge">${totalInSite}건</span>
              ${isContinuation ? '<span class="perf-continuation-tag">(이어서)</span>' : ""}
            </div>
          </td>
        `;

        groupTr.addEventListener("click", () => {
          this.callbacks.onToggleSiteCollapse(siteName);
        });

        tbody.appendChild(groupTr);
      }

      const isCollapsed = this.collapsedSites.has(siteName);
      if (isCollapsed) return;

      const dataTr = document.createElement("tr");
      dataTr.className = `perf-data-row ${row.rowId === this.selectedRowId ? "selected" : ""}`;
      dataTr.dataset.rowId = row.rowId;
      dataTr.tabIndex = 0;

      const badges = deriveRowBadges(row);
      const badgesHtml = badges
        .map(
          b =>
            `<span class="perf-badge ${b.className}" title="${escapeHtml(
              b.description || b.label
            )}">${escapeHtml(b.label)}</span>`
        )
        .join("");

      const globalNo = currentRange.start + idx + 1;
      const timeStr =
        row.entry.startTime && row.entry.endTime
          ? `${row.entry.startTime}~${row.entry.endTime}`
          : "-";
      const duty = getPerformanceDuty(row, this.dutyContext);

      dataTr.innerHTML = `
        <td class="perf-col-no perf-cell-muted">${globalNo}</td>
        <td class="perf-cell-nowrap">${escapeHtml(row.entry.workDate || "-")}</td>
        <td class="perf-cell-nowrap"><strong>${escapeHtml(row.entry.employeeCode || "-")}</strong></td>
        <td class="perf-cell-nowrap">${escapeHtml(row.entry.employeeName || "-")}</td>
        <td>${escapeHtml(row.entry.teamLabel || "-")}</td>
        <td><span class="perf-duty-badge ${duty.className}">${escapeHtml(duty.label)}</span></td>
        <td class="perf-cell-nowrap">${escapeHtml(formatSectionLabel(row.entry.section))}</td>
        <td class="perf-cell-nowrap">${escapeHtml(timeStr)}</td>
        <td class="perf-cell-right perf-cell-bold perf-cell-nowrap">${row.entry.totalWorkMinutes}분</td>
        <td><div class="perf-cell-badges">${badgesHtml}</div></td>
        <td class="perf-col-note">${escapeHtml(row.entry.reason || row.entry.note || "-")}</td>
      `;

      dataTr.addEventListener("click", () => {
        this.selectRow(row);
      });

      dataTr.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.selectRow(row);
        }
      });

      tbody.appendChild(dataTr);
    });

    footer.innerHTML = "";
    const infoSpan = document.createElement("div");
    infoSpan.className = "perf-footer-info";
    const startIdx = currentRange.start + 1;
    const endIdx = currentRange.end;
    infoSpan.textContent = `전체 ${this.rows.length.toLocaleString("ko-KR")}건 중 ${startIdx}~${endIdx}건 (${this.currentPage}/${this.pages.length} 페이지)`;
    footer.appendChild(infoSpan);

    const paginationEl = renderPagination({
      currentPage: this.currentPage,
      totalPages: this.pages.length,
      totalCount: this.rows.length,
      idPrefix: "perf-table",
      label: "실적 목록 페이지 이동",
      onPageChange: page => {
        this.currentPage = page;
        this.syncPageSelection();
        this.renderTableBodyAndFooter();
        this.callbacks.onPageChange(page);
      }
    });

    footer.appendChild(paginationEl);
  }

  private selectRow(row: PerformanceOverviewRow): void {
    this.selectedRowId = row.rowId;
    const allTrs = this.container.querySelectorAll<HTMLTableRowElement>(".perf-data-row");
    allTrs.forEach(tr => {
      if (tr.dataset.rowId === row.rowId) {
        tr.classList.add("selected");
      } else {
        tr.classList.remove("selected");
      }
    });
    this.callbacks.onSelectRow(row);
  }

  private setupResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    const viewport = this.container.querySelector<HTMLElement>(".perf-table-viewport");
    if (!viewport) return;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) {
        cancelAnimationFrame(this.resizeFrame);
      }
      this.resizeFrame = requestAnimationFrame(() => {
        this.fitToHeight();
      });
    });
    this.resizeObserver.observe(viewport);
  }
}
