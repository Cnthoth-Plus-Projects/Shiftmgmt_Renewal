// 공통 데이터 테이블 컴포넌트 (.ai/UI_ACCEPTANCE_STANDARD.md 규격)
// - 10개씩 페이지 이동 (pageSize: 10)
// - 전체 정렬 및 전체 필터 적용 후 페이지네이션
// - 식별자 컬럼 왼쪽 고정 (sticky left)
// - 그룹 목록 정렬 및 페이지 경계 '이어서' / 접기 상태 공유
// - 우측 상세 카드 및 키보드 접근성 지원

export interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  sticky?: boolean;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => HTMLElement | string;
  getValue?: (row: T) => unknown;
}

export interface DataTableOptions<T> {
  container: HTMLElement;
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  pageSize?: number;
  groupBy?: (row: T) => string;
  onRowSelect?: (row: T | null) => void;
  searchPlaceholder?: string;
  emptyText?: string;
}

export type SortDirection = "asc" | "desc" | "none";

export class DataTable<T> {
  private container: HTMLElement;
  private columns: DataTableColumn<T>[];
  private getRowId: (row: T) => string;
  private pageSize: number;
  private groupBy?: (row: T) => string;
  private onRowSelect?: (row: T | null) => void;
  private searchPlaceholder: string;
  private emptyText: string;

  private allRows: T[] = [];
  private filteredRows: T[] = [];
  private currentPage = 1;
  private totalPages = 1;
  private sortKey: string | null = null;
  private sortDirection: SortDirection = "none";
  private searchQuery = "";
  private selectedRowId: string | null = null;
  private collapsedGroups = new Set<string>();

  constructor(options: DataTableOptions<T>) {
    this.container = options.container;
    this.columns = options.columns;
    this.getRowId = options.getRowId;
    this.pageSize = options.pageSize || 10;
    this.groupBy = options.groupBy;
    this.onRowSelect = options.onRowSelect;
    this.searchPlaceholder = options.searchPlaceholder || "목록 검색...";
    this.emptyText = options.emptyText || "조회된 데이터가 없습니다.";
  }

  public setData(data: T[]): void {
    this.allRows = data || [];
    this.applyFilterAndSort();
    this.render();
  }

  public getSelectedId(): string | null {
    return this.selectedRowId;
  }

  public setSelectedId(id: string | null): void {
    this.selectedRowId = id;
    this.updateSelectionVisual();
    if (this.onRowSelect) {
      const selected = this.allRows.find((r) => this.getRowId(r) === id) || null;
      this.onRowSelect(selected);
    }
  }

  public setPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.renderBodyAndPagination();
  }

  public setSearch(query: string): void {
    this.searchQuery = query;
    this.currentPage = 1;
    this.applyFilterAndSort();
    this.render();
  }

  private applyFilterAndSort(): void {
    let rows = [...this.allRows];

    // 1. 전체 검색 필터링
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => {
        return this.columns.some((col) => {
          const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // 2. 전체 정렬
    if (this.sortKey && this.sortDirection !== "none") {
      const col = this.columns.find((c) => c.key === this.sortKey);
      const dir = this.sortDirection === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const valA = col?.getValue ? col.getValue(a) : (a as Record<string, unknown>)[this.sortKey!];
        const valB = col?.getValue ? col.getValue(b) : (b as Record<string, unknown>)[this.sortKey!];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (typeof valA === "number" && typeof valB === "number") {
          return (valA - valB) * dir;
        }
        return String(valA).localeCompare(String(valB), "ko-KR") * dir;
      });
    }

    this.filteredRows = rows;
    this.totalPages = Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  public render(): void {
    this.container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "dt-container";

    // 툴바
    const toolbar = document.createElement("div");
    toolbar.className = "dt-toolbar";

    const left = document.createElement("div");
    left.className = "dt-toolbar-left";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "dt-search-input";
    searchInput.placeholder = this.searchPlaceholder;
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.currentPage = 1;
      this.applyFilterAndSort();
      this.renderBodyAndPagination();
    });
    left.appendChild(searchInput);

    const countBadge = document.createElement("div");
    countBadge.className = "dt-count-badge";
    countBadge.id = "dt-total-count";
    countBadge.innerHTML = `전체 <strong>${this.allRows.length}</strong>건 (조회 ${this.filteredRows.length}건)`;
    left.appendChild(countBadge);
    toolbar.appendChild(left);

    card.appendChild(toolbar);

    // 테이블 래퍼
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "dt-table-wrapper";

    const table = document.createElement("table");
    table.className = "dt-table";

    // 헤더 렌더링
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    this.columns.forEach((col) => {
      const th = document.createElement("th");
      if (col.width) th.style.width = col.width;
      if (col.sticky) th.classList.add("sticky-col");
      if (col.align) th.style.textAlign = col.align;

      const content = document.createElement("div");
      content.className = "dt-th-content";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = col.label;
      content.appendChild(labelSpan);

      if (col.sortable !== false) {
        th.classList.add("sortable");
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined dt-sort-icon";
        if (this.sortKey === col.key) {
          icon.classList.add("active");
          icon.textContent = this.sortDirection === "asc" ? "arrow_upward" : "arrow_downward";
        } else {
          icon.textContent = "unfold_more";
        }
        content.appendChild(icon);

        th.addEventListener("click", () => {
          if (this.sortKey === col.key) {
            this.sortDirection = this.sortDirection === "asc" ? "desc" : this.sortDirection === "desc" ? "none" : "asc";
            if (this.sortDirection === "none") this.sortKey = null;
          } else {
            this.sortKey = col.key;
            this.sortDirection = "asc";
          }
          this.applyFilterAndSort();
          this.render();
        });
      }

      th.appendChild(content);
      tr.appendChild(th);
    });

    thead.appendChild(tr);
    table.appendChild(thead);

    // 바디
    const tbody = document.createElement("tbody");
    tbody.id = "dt-table-body";
    tbody.className = "dt-body data-table-body";
    table.appendChild(tbody);

    tableWrapper.appendChild(table);
    card.appendChild(tableWrapper);

    // 페이지네이션 푸터
    const pagination = document.createElement("div");
    pagination.className = "dt-pagination data-table-pagination";
    pagination.id = "dt-pagination-footer";
    card.appendChild(pagination);

    this.container.appendChild(card);

    this.renderBodyAndPagination();
  }

  private renderBodyAndPagination(): void {
    const tbody = this.container.querySelector<HTMLElement>("#dt-table-body");
    const footer = this.container.querySelector<HTMLElement>("#dt-pagination-footer");
    const countBadge = this.container.querySelector<HTMLElement>("#dt-total-count");
    if (!tbody || !footer) return;

    if (countBadge) {
      countBadge.innerHTML = `전체 <strong>${this.allRows.length}</strong>건 (조회 ${this.filteredRows.length}건)`;
    }

    tbody.innerHTML = "";

    if (this.filteredRows.length === 0) {
      const emptyTr = document.createElement("tr");
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = this.columns.length;
      emptyTd.innerHTML = `
        <div class="dt-empty-card">
          <span class="material-symbols-outlined" aria-hidden="true">inbox</span>
          <div>${this.escape(this.emptyText)}</div>
        </div>
      `;
      emptyTr.appendChild(emptyTd);
      tbody.appendChild(emptyTr);
      footer.innerHTML = "";
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageRows = this.filteredRows.slice(startIndex, startIndex + this.pageSize);

    // 그룹화 렌더링 또는 일반 행 렌더링
    let lastGroup: string | null = null;
    pageRows.forEach((row, idx) => {
      const globalIndex = startIndex + idx;
      const rowId = this.getRowId(row);

      // 그룹 헤더 확인
      if (this.groupBy) {
        const grp = this.groupBy(row);
        if (grp !== lastGroup) {
          lastGroup = grp;
          const isCollapsed = this.collapsedGroups.has(grp);
          const grpTr = document.createElement("tr");
          grpTr.className = "dt-group-row";
          const grpTd = document.createElement("td");
          grpTd.colSpan = this.columns.length;

          // 페이지 경계 '이어서' 체크 (이전 페이지 마지막 행과 같은 그룹인 경우)
          const isContinuation = startIndex > 0 && this.groupBy(this.filteredRows[startIndex - 1]) === grp;
          const contText = isContinuation ? " (이어서)" : "";

          grpTd.innerHTML = `
            <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">${isCollapsed ? "chevron_right" : "expand_more"}</span>
            <span>${this.escape(grp)}${contText}</span>
          `;
          grpTd.addEventListener("click", () => {
            if (this.collapsedGroups.has(grp)) {
              this.collapsedGroups.delete(grp);
            } else {
              this.collapsedGroups.add(grp);
            }
            this.renderBodyAndPagination();
          });
          grpTr.appendChild(grpTd);
          tbody.appendChild(grpTr);
        }

        if (this.collapsedGroups.has(grp)) {
          return; // 접힌 그룹은 행 생략
        }
      }

      const tr = document.createElement("tr");
      tr.className = "table-row dt-row";
      tr.dataset.id = rowId;
      tr.tabIndex = 0;
      if (rowId === this.selectedRowId) {
        tr.classList.add("selected");
      }

      this.columns.forEach((col) => {
        const td = document.createElement("td");
        if (col.sticky) td.classList.add("sticky-col");
        if (col.align) td.style.textAlign = col.align;

        if (col.render) {
          const rendered = col.render(row, globalIndex);
          if (typeof rendered === "string") {
            td.innerHTML = rendered;
          } else {
            td.appendChild(rendered);
          }
        } else {
          const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
          td.textContent = val !== null && val !== undefined ? String(val) : "-";
        }
        tr.appendChild(td);
      });

      // 행 선택 이벤트
      tr.addEventListener("click", () => {
        this.setSelectedId(rowId);
      });

      // 키보드 엔터/스페이스 선택
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.setSelectedId(rowId);
        }
      });

      tbody.appendChild(tr);
    });

    // 페이지네이션 컨트롤 렌더링
    footer.innerHTML = "";

    const pageInfo = document.createElement("div");
    pageInfo.className = "dt-page-info pagination-info";
    const endCount = Math.min(startIndex + this.pageSize, this.filteredRows.length);
    pageInfo.textContent = `${startIndex + 1} - ${endCount} / 총 ${this.filteredRows.length}건 (페이지 ${this.currentPage} / ${this.totalPages})`;
    footer.appendChild(pageInfo);

    const controls = document.createElement("div");
    controls.className = "dt-page-controls";

    // 첫 페이지
    const firstBtn = document.createElement("button");
    firstBtn.type = "button";
    firstBtn.className = "dt-btn-page btn-first-page";
    firstBtn.title = "첫 페이지";
    firstBtn.disabled = this.currentPage === 1;
    firstBtn.innerHTML = `<span class="material-symbols-outlined wf-icon-18" aria-hidden="true">first_page</span>`;
    firstBtn.addEventListener("click", () => this.setPage(1));
    controls.appendChild(firstBtn);

    // 이전 페이지
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "dt-btn-page btn-prev-page";
    prevBtn.title = "이전 페이지";
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.innerHTML = `<span class="material-symbols-outlined wf-icon-18" aria-hidden="true">chevron_left</span>`;
    prevBtn.addEventListener("click", () => this.setPage(this.currentPage - 1));
    controls.appendChild(prevBtn);

    // 페이지 숫자 버튼 (최대 5개 노출)
    const pageWindow = 5;
    const startPage = Math.max(1, this.currentPage - Math.floor(pageWindow / 2));
    const endPage = Math.min(this.totalPages, startPage + pageWindow - 1);
    const adjustedStart = Math.max(1, endPage - pageWindow + 1);

    for (let p = adjustedStart; p <= endPage; p++) {
      const pageBtn = document.createElement("button");
      pageBtn.type = "button";
      pageBtn.className = `dt-btn-page ${p === this.currentPage ? "active" : ""}`;
      pageBtn.textContent = String(p);
      const targetP = p;
      pageBtn.addEventListener("click", () => this.setPage(targetP));
      controls.appendChild(pageBtn);
    }

    // 다음 페이지
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "dt-btn-page btn-next-page";
    nextBtn.title = "다음 페이지";
    nextBtn.disabled = this.currentPage === this.totalPages;
    nextBtn.innerHTML = `<span class="material-symbols-outlined wf-icon-18" aria-hidden="true">chevron_right</span>`;
    nextBtn.addEventListener("click", () => this.setPage(this.currentPage + 1));
    controls.appendChild(nextBtn);

    // 마지막 페이지
    const lastBtn = document.createElement("button");
    lastBtn.type = "button";
    lastBtn.className = "dt-btn-page btn-last-page";
    lastBtn.title = "마지막 페이지";
    lastBtn.disabled = this.currentPage === this.totalPages;
    lastBtn.innerHTML = `<span class="material-symbols-outlined wf-icon-18" aria-hidden="true">last_page</span>`;
    lastBtn.addEventListener("click", () => this.setPage(this.totalPages));
    controls.appendChild(lastBtn);

    footer.appendChild(controls);
  }

  private updateSelectionVisual(): void {
    const rows = this.container.querySelectorAll<HTMLTableRowElement>("#dt-table-body tr[data-id]");
    rows.forEach((tr) => {
      if (tr.dataset.id === this.selectedRowId) {
        tr.classList.add("selected");
      } else {
        tr.classList.remove("selected");
      }
    });
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
