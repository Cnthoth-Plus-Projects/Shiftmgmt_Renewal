import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import {
  measurePaginationBody,
  paginateGroupsForHeight,
  renderPagination,
  type PageRange,
} from "../pagination";
import {
  deriveAllowanceBadges,
  formatCurrency,
  formatWorkMinutes,
  formatWorkTypeLabel,
  getAllowancePageSelection,
  getDensityHeights,
  groupAllowanceRows,
  type DensityMode,
} from "./allowance-model";

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AllowanceTableOptions {
  onSelectRow: (rowId: string) => void;
  onToggleRow: (rowId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPageChange: () => void;
}

export interface AllowanceTableRenderParams {
  rows: AllowanceCalculationResultRecord[];
  selectedId: string | null;
  checkedIds: Set<string>;
  density: DensityMode;
}

export class AllowanceTable {
  private options: AllowanceTableOptions;
  private containerEl: HTMLElement | null = null;
  private rows: AllowanceCalculationResultRecord[] = [];
  private selectedId: string | null = null;
  private checkedIds: Set<string> = new Set();
  private density: DensityMode = "normal";
  private collapsedSites: Set<string> = new Set();

  private currentPage = 1;
  private pages: PageRange[] = [{ start: 0, end: 0 }];
  private bodyHeight = 500;
  private rowHeight = 38;
  private groupHeight = 32;

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(options: AllowanceTableOptions) {
    this.options = options;
  }

  public resetPage(): void {
    this.currentPage = 1;
  }

  public getCurrentPage(): number {
    return this.currentPage;
  }

  public getTotalPages(): number {
    return Math.max(1, this.pages.length);
  }

  public getSelectedId(): string | null {
    return this.selectedId;
  }

  /** 현재 페이지에 실제로 표시 중인 행 ID 목록 반환 (D04: 헤더 체크 시 현재 가시 행만 토글) */
  public getVisibleRowIds(): string[] {
    const range = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    return this.rows
      .slice(range.start, range.end)
      .filter(r => !this.collapsedSites.has(r.siteName || "미지정 근무지"))
      .map(r => r.id);
  }

  public getFirstVisibleRowId(): string | null {
    const visible = this.getVisibleRowIds();
    if (visible.length > 0) return visible[0];
    const range = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    return this.rows[range.start]?.id || null;
  }

  /** 특정 계산 ID가 포함된 페이지로 직접 이동 및 선택 (R12 원 대상 연결) */
  public focusRowById(rowId: string): boolean {
    const idx = this.rows.findIndex(r => r.id === rowId);
    if (idx < 0) return false;
    const siteName = this.rows[idx].siteName || "미지정 근무지";
    this.collapsedSites.delete(siteName);
    const pageIdx = this.pages.findIndex(p => p.start <= idx && idx < p.end);
    if (pageIdx >= 0) {
      this.currentPage = pageIdx + 1;
    }
    this.selectedId = rowId;
    this.renderTableBodyAndFooter();
    const rowEl = this.containerEl?.querySelector<HTMLElement>(
      `.allowance-data-row[data-id="${CSS.escape(rowId)}"]`
    );
    rowEl?.focus({ preventScroll: true });
    return true;
  }

  public toggleAllVisibleCheckboxes(checked: boolean): void {
    if (!this.containerEl) return;
    const chkAll = this.containerEl.querySelector<HTMLInputElement>(".chk-allowance-all");
    if (chkAll) chkAll.checked = checked;
    const chkRows = this.containerEl.querySelectorAll<HTMLInputElement>(".chk-allowance-row");
    chkRows.forEach(chk => {
      chk.checked = checked;
      const row = chk.closest(".allowance-data-row");
      if (row) {
        if (checked) row.classList.add("checked");
        else row.classList.remove("checked");
      }
    });
  }

  public render(container: HTMLElement, params: AllowanceTableRenderParams): void {
    this.containerEl = container;
    this.rows = params.rows;
    this.selectedId = params.selectedId;
    this.checkedIds = params.checkedIds;
    const densityChanged = this.density !== params.density;
    this.density = params.density;

    if (densityChanged) {
      const heights = getDensityHeights(this.density);
      this.rowHeight = heights.rowHeight;
      this.groupHeight = heights.groupHeight;
    }

    this.rebuildPages();
    this.syncPageSelection();

    const existingViewport = container.querySelector<HTMLElement>(".allowance-table-viewport");
    if (!existingViewport) {
      container.innerHTML = `
        <div class="allowance-table-viewport density-${this.density}" tabindex="0" role="region" aria-label="수당 산출 테이블 영역">
          <table class="allowance-table" aria-label="수당 산출 내역 표">
            <thead>
              <tr>
                <th scope="col" class="cell-chk">
                  <input
                    type="checkbox"
                    class="chk-allowance-all"
                    title="현재 페이지 표시 행 전체 선택"
                    aria-label="현재 페이지 전체 선택"
                  />
                </th>
                <th scope="col">근무일</th>
                <th scope="col">사번</th>
                <th scope="col">성명</th>
                <th scope="col">근무유형 / 산출구분</th>
                <th scope="col">근무시간</th>
                <th scope="col" class="text-right">수당 금액</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody id="allowance-tbody"></tbody>
          </table>
        </div>
        <div class="allowance-table-footer" id="allowance-table-footer"></div>
      `;
      this.bindEvents();
      this.setupResizeObserver();
    } else {
      existingViewport.className = `allowance-table-viewport density-${this.density}`;
    }

    this.renderTableBodyAndFooter();
    // 체크 등 재렌더 직후에도 사용자가 보는 행과 페이지 경계가 일치해야 한다.
    this.fitToHeight();
  }

  private rebuildPages(): void {
    // §6.1 item 3: 그룹 접기는 페이지 경계를 바꾸지 않는다.
    this.pages = paginateGroupsForHeight(
      this.rows,
      this.bodyHeight,
      this.rowHeight,
      this.groupHeight,
      row => row.siteName || "미지정 근무지"
    );

    if (this.currentPage > this.pages.length) {
      this.currentPage = Math.max(1, this.pages.length);
    }
  }

  private syncPageSelection(): void {
    const range = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    const sel = getAllowancePageSelection(this.rows, range, this.selectedId);
    this.selectedId = sel?.id || null;
  }

  public fitToHeight(): void {
    if (!this.containerEl) return;
    const viewport = this.containerEl.querySelector<HTMLElement>(".allowance-table-viewport");
    const head = this.containerEl.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head) return;

    const row = this.containerEl.querySelector<HTMLElement>(".allowance-data-row");
    const group = this.containerEl.querySelector<HTMLElement>(".allowance-group-row");

    // 공통 함수의 좁은 창 0값(고정 개수 fallback)도 이 화면은 실제 높이로 분할한다.
    const height = measurePaginationBody(viewport, head) || Math.max(
      0,
      viewport.getBoundingClientRect().height -
        Math.max(0, viewport.offsetHeight - viewport.clientHeight) -
        head.getBoundingClientRect().height - 0.5
    );
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
    const anchor = getAllowancePageSelection(this.rows, range, this.selectedId);
    const anchorId = anchor?.id;

    this.bodyHeight = height;
    this.rowHeight = measuredRowHeight;
    this.groupHeight = measuredGroupHeight;

    this.rebuildPages();

    if (anchorId) {
      const idx = this.rows.findIndex(r => r.id === anchorId);
      if (idx >= 0) {
        const pageIdx = this.pages.findIndex(p => p.start <= idx && idx < p.end);
        if (pageIdx >= 0) {
          this.currentPage = pageIdx + 1;
        }
      }
    }

    const prevSelected = this.selectedId;
    this.syncPageSelection();
    this.renderTableBodyAndFooter();
    if (this.selectedId !== prevSelected) {
      this.options.onPageChange();
    }
  }

  private renderTableBodyAndFooter(): void {
    if (!this.containerEl) return;
    const tbody = this.containerEl.querySelector<HTMLElement>("#allowance-tbody");
    const footer = this.containerEl.querySelector<HTMLElement>("#allowance-table-footer");
    if (!tbody || !footer) return;

    const range = this.pages[this.currentPage - 1] || { start: 0, end: 0 };
    const pageRows = this.rows.slice(range.start, range.end);

    // 전체 필터 결과 기준 근무지별 총 건수·금액 계산 (§6.1 item 3)
    const siteTotals = new Map<string, { count: number; amount: number }>();
    for (const r of this.rows) {
      const s = r.siteName || "미지정 근무지";
      const cur = siteTotals.get(s) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.snapshot?.totalAllowanceAmount || 0;
      siteTotals.set(s, cur);
    }

    if (pageRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="allowance-cell-empty">
            조건에 부합하는 수당 산출 내역이 없습니다.
          </td>
        </tr>
      `;
      const chkAll = this.containerEl.querySelector<HTMLInputElement>(".chk-allowance-all");
      if (chkAll) chkAll.checked = false;
    } else {
      const prevRowSite =
        range.start > 0 ? this.rows[range.start - 1]?.siteName || "미지정 근무지" : null;
      const groups = groupAllowanceRows(pageRows);
      let html = "";

      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const g = groups[gIdx];
        const isCollapsed = this.collapsedSites.has(g.siteName);
        const isContinued = gIdx === 0 && prevRowSite === g.siteName;
        const overall = siteTotals.get(g.siteName) || { count: g.count, amount: g.totalAmount };

        html += `
          <tr class="allowance-group-row" data-site="${escapeHtml(g.siteName)}" tabindex="0" aria-expanded="${!isCollapsed}">
            <td colspan="8" class="allowance-group-cell">
              <div class="allowance-group-inner">
                <span class="allowance-group-title-wrap">
                  <span class="allowance-group-chevron" aria-hidden="true">${isCollapsed ? "▶" : "▼"}</span>
                  <span>${escapeHtml(g.siteName)}</span>
                  ${isContinued ? `<span class="allowance-group-continued">(이어서)</span>` : ""}
                </span>
                <span class="allowance-group-count-badge">
                  페이지 ${g.count}건 / 전체 ${overall.count}건 (${formatCurrency(overall.amount)})
                </span>
              </div>
            </td>
          </tr>
        `;

        if (!isCollapsed) {
          for (const row of g.rows) {
            const isSelected = row.id === this.selectedId;
            const isChecked = this.checkedIds.has(row.id);
            const badges = deriveAllowanceBadges(row);
            const minutes = row.snapshot?.breakdown?.totalWorkMinutes || 0;
            const hasSnap = Boolean(row.snapshot && typeof row.snapshot.totalAllowanceAmount === "number");
            const amountText = hasSnap ? formatCurrency(row.snapshot.totalAllowanceAmount) : "미저장";
            const catLabel = row.snapshot?.businessCategoryLabel || "";
            const workLabel = formatWorkTypeLabel(row.workType);
            const combinedType =
              catLabel && catLabel !== workLabel ? `${workLabel} · ${catLabel}` : workLabel;

            html += `
              <tr
                class="allowance-data-row ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}"
                data-id="${escapeHtml(row.id)}"
                tabindex="0"
                aria-selected="${isSelected}"
              >
                <td class="cell-chk">
                  <input
                    type="checkbox"
                    class="chk-allowance-row"
                    data-id="${escapeHtml(row.id)}"
                    aria-label="${escapeHtml(row.employeeName)} ${escapeHtml(row.workDate)} 선택"
                    ${isChecked ? "checked" : ""}
                  />
                </td>
                <td>${escapeHtml(row.workDate)}</td>
                <td>${escapeHtml(row.employeeCode)}</td>
                <td><strong>${escapeHtml(row.employeeName)}</strong></td>
                <td>${escapeHtml(combinedType)}</td>
                <td>${formatWorkMinutes(minutes)}</td>
                <td class="text-right"><strong>${escapeHtml(amountText)}</strong></td>
                <td>
                  ${badges
                    .map(
                      b =>
                        `<span class="allowance-badge ${b.className}" title="${escapeHtml(b.description)}">${escapeHtml(b.label)}</span>`
                    )
                    .join(" ")}
                </td>
              </tr>
            `;
          }
        }
      }

      tbody.innerHTML = html;

      const visibleIds = this.getVisibleRowIds();
      const chkAll = this.containerEl.querySelector<HTMLInputElement>(".chk-allowance-all");
      if (chkAll) {
        chkAll.checked = visibleIds.length > 0 && visibleIds.every(id => this.checkedIds.has(id));
      }
    }

    // 공통 renderPagination 항상 표시 (R03, UI06-D03)
    const paginationEl = renderPagination({
      currentPage: this.currentPage,
      totalPages: this.rows.length > 0 ? Math.max(1, this.pages.length) : 0,
      totalCount: this.rows.length,
      idPrefix: "allowance",
      label: "수당 산출 내역 페이지 이동",
      onPageChange: (newPage: number) => {
        this.currentPage = newPage;
        this.syncPageSelection();
        this.renderTableBodyAndFooter();
        this.options.onPageChange();
      },
    });

    footer.innerHTML = "";
    const summarySpan = document.createElement("span");
    summarySpan.className = "allowance-footer-summary";
    summarySpan.id = "allowance-footer-summary";
    summarySpan.textContent =
      this.rows.length > 0
        ? `전체 ${this.rows.length.toLocaleString()}건 중 ${range.start + 1}~${range.end}건 표시 · 현재 페이지 체크 기준 (총 선택 ${this.checkedIds.size}건)`
        : `전체 0건 (선택 ${this.checkedIds.size}건)`;
    footer.appendChild(summarySpan);
    footer.appendChild(paginationEl);
  }

  private bindEvents(): void {
    if (!this.containerEl) return;

    const tbody = this.containerEl.querySelector<HTMLElement>("#allowance-tbody");
    if (tbody) {
      tbody.addEventListener("click", (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest(".chk-allowance-row")) {
          e.stopPropagation();
          return;
        }

        const groupRow = target.closest<HTMLElement>(".allowance-group-row");
        if (groupRow) {
          const site = groupRow.getAttribute("data-site");
          if (site) {
            if (this.collapsedSites.has(site)) this.collapsedSites.delete(site);
            else this.collapsedSites.add(site);
            this.renderTableBodyAndFooter();
          }
          return;
        }

        const dataRow = target.closest<HTMLElement>(".allowance-data-row");
        if (dataRow) {
          const rowId = dataRow.getAttribute("data-id");
          if (rowId) {
            this.selectedId = rowId;
            tbody.querySelectorAll(".allowance-data-row").forEach(r => {
              r.classList.remove("selected");
              r.setAttribute("aria-selected", "false");
            });
            dataRow.classList.add("selected");
            dataRow.setAttribute("aria-selected", "true");
            this.options.onSelectRow(rowId);
          }
        }
      });

      tbody.addEventListener("change", (e: Event) => {
        const chk = (e.target as HTMLElement).closest<HTMLInputElement>(".chk-allowance-row");
        if (chk) {
          const rowId = chk.getAttribute("data-id");
          if (rowId) {
            const row = chk.closest(".allowance-data-row");
            if (row) {
              if (chk.checked) row.classList.add("checked");
              else row.classList.remove("checked");
            }
            this.options.onToggleRow(rowId, chk.checked);
          }
        }
      });

      tbody.addEventListener("keydown", (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("chk-allowance-row")) {
          return;
        }

        const groupRow = target.closest<HTMLElement>(".allowance-group-row");
        if (groupRow && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          const site = groupRow.getAttribute("data-site");
          if (site) {
            if (this.collapsedSites.has(site)) this.collapsedSites.delete(site);
            else this.collapsedSites.add(site);
            this.renderTableBodyAndFooter();
          }
          return;
        }

        const dataRow = target.closest<HTMLElement>(".allowance-data-row");
        if (!dataRow) return;

        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const id = dataRow.getAttribute("data-id");
          if (id) {
            this.selectedId = id;
            tbody.querySelectorAll(".allowance-data-row").forEach(r => {
              r.classList.remove("selected");
              r.setAttribute("aria-selected", "false");
            });
            dataRow.classList.add("selected");
            dataRow.setAttribute("aria-selected", "true");
            this.options.onSelectRow(id);
          }
          return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const allVisibleRows = Array.from(
            tbody.querySelectorAll<HTMLElement>(".allowance-data-row")
          );
          const curIdx = allVisibleRows.indexOf(dataRow);
          const nextIdx = e.key === "ArrowDown" ? curIdx + 1 : curIdx - 1;
          const targetRow = allVisibleRows[nextIdx];
          if (targetRow) {
            targetRow.focus();
            const id = targetRow.getAttribute("data-id");
            if (id) {
              this.selectedId = id;
              allVisibleRows.forEach(r => {
                r.classList.remove("selected");
                r.setAttribute("aria-selected", "false");
              });
              targetRow.classList.add("selected");
              targetRow.setAttribute("aria-selected", "true");
              this.options.onSelectRow(id);
            }
          }
        }
      });
    }

    const chkAll = this.containerEl.querySelector<HTMLInputElement>(".chk-allowance-all");
    chkAll?.addEventListener("change", () => {
      this.options.onToggleAll(chkAll.checked);
    });
  }

  private setupResizeObserver(): void {
    if (!this.containerEl) return;
    const viewport = this.containerEl.querySelector<HTMLElement>(".allowance-table-viewport");
    if (!viewport) return;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

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

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    if (this.containerEl) {
      this.containerEl.innerHTML = "";
      this.containerEl = null;
    }
  }
}
