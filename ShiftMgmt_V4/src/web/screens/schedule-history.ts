import {
  measurePaginationBody,
  paginateGroupsForHeight,
  renderPagination,
  type PageRange,
} from "../pagination";
import type { ScheduleHistoryRow } from "./schedule-model";

export interface ScheduleHistoryCallbacks {
  onSelectHistoryRow: (exportId: string) => void;
  onNavigateToStoredSchedule: (scheduleId: string, siteId: string, scheduleMonth: string) => void;
}

export class ScheduleHistory {
  private container: HTMLElement;
  private callbacks: ScheduleHistoryCallbacks;
  private historyList: ScheduleHistoryRow[] = [];
  private selectedExportId: string | null = null;

  // 페이징 및 높이 측정 상태
  private currentPage = 1;
  private pages: PageRange[] = [{ start: 0, end: 0 }];
  private bodyHeight = 0;
  private wideLayout: boolean | null = null;
  private rowHeight = 36;
  private groupHeight = 28;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(container: HTMLElement, callbacks: ScheduleHistoryCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public setData(historyList: ScheduleHistoryRow[], selectedExportId: string | null): void {
    this.historyList = historyList;
    this.selectedExportId = selectedExportId;

    if (this.historyList.length > 0) {
      if (!this.selectedExportId || !this.historyList.some((h) => h.exportId === this.selectedExportId)) {
        this.selectedExportId = this.historyList[0].exportId;
        this.callbacks.onSelectHistoryRow(this.selectedExportId);
      }
    } else {
      this.selectedExportId = null;
    }

    this.currentPage = 1;
    this.render();
  }

  public render(): void {
    const tablePane = this.container.querySelector<HTMLElement>("#schedule-table-pane");
    const detailPane = this.container.querySelector<HTMLElement>("#schedule-detail-pane");
    if (!tablePane || !detailPane) return;

    if (this.historyList.length === 0) {
      tablePane.innerHTML = `
        <div class="schedule-empty-container">
          <span class="schedule-empty-icon material-symbols-outlined" aria-hidden="true">folder_open</span>
          <div class="schedule-empty-title">생성 및 게시 이력이 없습니다.</div>
          <div class="schedule-empty-desc">조건에 일치하는 엑셀 생성 또는 게시 내역이 존재하지 않습니다.</div>
        </div>
      `;
      detailPane.innerHTML = `
        <div class="detail-header"><div class="detail-title">이력 상세</div></div>
        <div class="detail-content"><div class="schedule-empty-desc">이력이 없습니다.</div></div>
      `;
      const nav = document.createElement("nav"); nav.className = "schedule-pagination pagination-footer"; nav.setAttribute("aria-label", "생성 및 게시 이력 페이지");
      const label = document.createElement("span"); label.className = "schedule-pagination-info"; label.textContent = "조회된 이력0건"; nav.append(label);
      nav.append(renderPagination({ currentPage: 1, totalPages: 0, totalCount: 0, idPrefix: "schedule-history", label: "생성 및 게시 이력 페이지 이동", className: "schedule-page-nav", onPageChange: () => {} })); tablePane.append(nav);
      return;
    }

    // 1. 페이징 계산 (고정 10행 제거)
    const allHistory = this.historyList;
    if (this.bodyHeight > 0 && window.innerWidth > 1100) {
      this.pages = paginateGroupsForHeight(
        allHistory,
        this.bodyHeight,
        this.rowHeight,
        this.groupHeight,
        (h) => h.scheduleMonth,
      );
    } else {
      const pageSize = 10;
      const count = Math.ceil(allHistory.length / pageSize) || 1;
      this.pages = Array.from({ length: count }, (_, i) => ({
        start: i * pageSize,
        end: Math.min((i + 1) * pageSize, allHistory.length),
      }));
    }

    const totalPages = Math.max(1, this.pages.length);
    this.currentPage = Math.max(1, Math.min(this.currentPage, totalPages));
    const currentRange = this.pages[this.currentPage - 1] || { start: 0, end: allHistory.length };
    const pagedHistory = allHistory.slice(currentRange.start, currentRange.end);

    // 선택된 행이 현재 페이지 밖이면 첫 행으로 보정
    if (
      this.selectedExportId &&
      !pagedHistory.some((h) => h.exportId === this.selectedExportId) &&
      pagedHistory.length > 0
    ) {
      this.selectedExportId = pagedHistory[0].exportId;
      this.callbacks.onSelectHistoryRow(this.selectedExportId);
    }

    // 2. 표 본문 렌더링
    let tbodyHtml = "";
    let lastMonth = "";

    pagedHistory.forEach((row) => {
      if (row.scheduleMonth !== lastMonth) {
        lastMonth = row.scheduleMonth;
        tbodyHtml += `
          <tr class="schedule-group-row">
            <td colspan="7">
              <strong>${this.escape(row.scheduleMonth)}</strong> 생성 내역
            </td>
          </tr>
        `;
      }

      const isSelected = row.exportId === this.selectedExportId;
      const isPublished = row.status === "게시 완료";
      const statusBadge = `<span class="${isPublished ? "badge-published" : "badge-draft"}">${this.escape(
        row.status,
      )}</span>`;

      tbodyHtml += `
        <tr class="schedule-history-row ${isSelected ? "selected" : ""}" data-exportid="${this.escape(
        row.exportId,
      )}" tabindex="0" aria-selected="${isSelected}">
          <td>${this.escape(row.exportedAt.slice(0, 16).replace("T", " "))}</td>
          <td>${this.escape(row.siteName)}</td>
          <td>${this.escape(row.scheduleMonth)}</td>
          <td class="text-left">${this.escape(row.fileName)}</td>
          <td>${statusBadge}</td>
          <td>${this.escape(row.generatedBy)}</td>
          <td>${row.employeeCount === undefined ? "—" : `${row.employeeCount}명`}</td>
        </tr>
      `;
    });

    tablePane.innerHTML = `
      <div class="schedule-table-viewport">
        <table class="schedule-table" id="schedule-history-table">
          <thead>
            <tr>
              <th>생성 일시</th>
              <th>근무지</th>
              <th>대상 월</th>
              <th>엑셀 파일명</th>
              <th>게시 상태</th>
              <th>생성자</th>
              <th>배정 인원</th>
            </tr>
          </thead>
          <tbody>
            ${tbodyHtml}
          </tbody>
        </table>
      </div>
      <nav class="schedule-pagination pagination-footer" aria-label="생성 및 게시 이력 페이지">
        <span class="schedule-pagination-info" role="status" aria-live="polite">
          이력 목록 ${allHistory.length}건 중 ${allHistory.length ? currentRange.start + 1 : 0}–${currentRange.end}건 · ${this.currentPage}/${totalPages}페이지
        </span>
      </nav>
    `;

    // 푸터에 공통 renderPagination 부착
    const nav = tablePane.querySelector<HTMLElement>(".schedule-pagination.pagination-footer");
    if (nav) {
      nav.appendChild(
        renderPagination({
          currentPage: this.currentPage,
          totalPages,
          totalCount: allHistory.length,
          idPrefix: "schedule-history",
          label: "생성 및 게시 이력 페이지 이동",
          className: "schedule-page-nav",
          onPageChange: (page) => {
            this.currentPage = page;
            this.render();
          },
        }),
      );
    }

    tablePane.querySelectorAll<HTMLTableRowElement>(".schedule-history-row").forEach(tr => {
      const select = () => {
        const id = tr.dataset.exportid;
        if (!id) return;
        this.selectedExportId = id; this.callbacks.onSelectHistoryRow(id); this.render();
        Array.from(tablePane.querySelectorAll<HTMLTableRowElement>(".schedule-history-row")).find(r => r.dataset.exportid === id)?.focus({ preventScroll: true });
      };
      tr.addEventListener("click", select);
      tr.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
    });

    // 3. 우측 상세 렌더링
    this.renderDetail(detailPane);

    // 4. ResizeObserver 설정
    const viewport = tablePane.querySelector<HTMLElement>(".schedule-table-viewport");
    const table = tablePane.querySelector<HTMLElement>("#schedule-history-table");
    if (viewport && table) {
      if (!this.resizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.scheduleFit());
      }
      this.resizeObserver.disconnect();
      this.resizeObserver.observe(viewport);
      this.resizeObserver.observe(table);
    }
  }

  private scheduleFit(): void {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.fitToHeight();
    });
  }

  private fitToHeight(): void {
    const tablePane = this.container.querySelector<HTMLElement>("#schedule-table-pane");
    const viewport = tablePane?.querySelector<HTMLElement>(".schedule-table-viewport");
    const head = tablePane?.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head) return;

    const height = measurePaginationBody(viewport, head);
    const rowEl = tablePane?.querySelector<HTMLElement>(".schedule-history-row");
    const groupEl = tablePane?.querySelector<HTMLElement>("tr.schedule-group-row");
    const rowH = rowEl?.getBoundingClientRect().height || this.rowHeight;
    const groupH = groupEl?.getBoundingClientRect().height || this.groupHeight;

    if (
      this.wideLayout === (window.innerWidth > 1100) &&
      Math.abs(height - this.bodyHeight) < 0.1 &&
      Math.abs(rowH - this.rowHeight) < 0.1 &&
      Math.abs(groupH - this.groupHeight) < 0.1
    ) {
      return;
    }

    this.wideLayout = window.innerWidth > 1100;
    this.bodyHeight = height;
    this.rowHeight = rowH;
    this.groupHeight = groupH;

    if (this.historyList.length > 0) {
      this.pages = paginateGroupsForHeight(
        this.historyList,
        height,
        rowH,
        groupH,
        (h) => h.scheduleMonth,
      );
      this.render();
    }
  }

  private renderDetail(detailPane: HTMLElement): void {
    if (!this.selectedExportId) {
      detailPane.innerHTML = `
        <div class="detail-header"><div class="detail-title">이력 상세</div></div>
        <div class="detail-content"><div class="schedule-empty-desc">선택된 이력이 없습니다.</div></div>
      `;
      return;
    }

    const item = this.historyList.find((h) => h.exportId === this.selectedExportId);
    if (!item) return;

    detailPane.innerHTML = `
      <div class="detail-header">
        <div class="detail-title">${this.escape(item.fileName)}</div>
        <div class="detail-sub">${this.escape(item.siteName)} · ${this.escape(item.scheduleMonth)}</div>
      </div>
      <div class="detail-content">
        <div class="history-detail-field">
          <div class="history-detail-lbl">생성 일시</div>
          <div class="history-detail-val">${this.escape(item.exportedAt.replace("T", " "))}</div>
        </div>
        <div class="history-detail-field">
          <div class="history-detail-lbl">근무표 생성자</div>
          <div class="history-detail-val">${this.escape(item.generatedBy)}</div>
        </div>
        <div class="history-detail-field">
          <div class="history-detail-lbl">게시 상태</div>
          <div class="history-detail-val">
            <span class="${item.status === "게시 완료" ? "badge-published" : "badge-draft"}">
              ${this.escape(item.status)}
            </span>
          </div>
        </div>
        <div class="history-detail-field">
          <div class="history-detail-lbl">엑셀 생성 파일 경로</div>
          <div class="history-detail-val">${this.escape(item.outputPath)}</div>
        </div>
        <div class="history-detail-field">
          <div class="history-detail-lbl">배포 폴더 게시 경로</div>
          <div class="history-detail-val">${this.escape(item.publishedPath || "미게시")}</div>
        </div>
        <div class="history-detail-field">
          <div class="history-detail-lbl">관련 저장 근무표 ID</div>
          <div class="history-detail-val">${this.escape(item.scheduleId)}</div>
        </div>

        <div class="detail-section-title">작업 안내</div>
        <div class="detail-warn-item">
          과거 엑셀 파일은 재생성으로 인해 내용이 변경되었을 수 있습니다. 최신 상태로 게시하려면 해당 저장본으로 이동하여 새 엑셀을 생성하세요.
        </div>
        <button type="button" class="btn-action-primary" id="btn-goto-schedule">
          해당 저장본 조회 화면으로 이동
        </button>
      </div>
    `;

    detailPane.querySelector("#btn-goto-schedule")?.addEventListener("click", () => {
      this.callbacks.onNavigateToStoredSchedule(item.scheduleId, item.siteId, item.scheduleMonth);
    });
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
