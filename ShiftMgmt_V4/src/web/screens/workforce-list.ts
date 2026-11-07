// 인력 관리 화면: 인력 목록 테이블, 필터, 정렬, 그룹 접기
import type { EmployeeRecord, SiteRecord } from "../../shared/domain/model";
import { renderPagination, paginateGroupsForHeight } from "../pagination";
import { formatCurrency, formatEmployeeRank, isBpEmploymentType, sortEmployeesByWorksite, type EmployeePageRange } from "./workforce-model";

import { employeeStatusLabel } from "./workforce-model";
export interface WorkforceListOptions {
  container: HTMLElement;
  tableContainer?: HTMLElement;
  canWrite: boolean;
  isAdmin: boolean;
  onSelectEmployee: (employeeId: string, openDetail?: boolean) => void;
  onOpenNewEmployeeModal: () => void;
  onOpenBulkModal: () => void;
  onFilterChange: () => void;
}

export class WorkforceList {
  private container: HTMLElement;
  private tableContainer: HTMLElement;
  private canWrite: boolean;
  private isAdmin: boolean;
  private onSelectEmployee: (employeeId: string, openDetail?: boolean) => void;
  private onOpenNewEmployeeModal: () => void;
  private onOpenBulkModal: () => void;
  private onFilterChange: () => void;

  private employees: EmployeeRecord[] = [];
  private allEmployees: EmployeeRecord[] = [];
  private page = 1;
  private pages: EmployeePageRange[] = [{ start: 0, end: 0 }];
  private bodyHeight = 0;
  private rowHeight = 27;
  private groupHeight = 28;
  private measuredTableWidth = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private filterSignature = "";
  private sites: SiteRecord[] = [];
  private selectedEmployeeId: string | null = null;
  private collapsedSites = new Set<string>();

  // 필터 상태
  private filterSiteId = "all";
  private filterStatus = "active";
  private searchKeyword = "";
  private filterEmploymentType = "all";
  private filterShiftGroup = "all";

  private searchDebounceTimer: number | null = null;

  constructor(options: WorkforceListOptions) {
    this.container = options.container;
    this.tableContainer = options.tableContainer ?? options.container;
    this.canWrite = options.canWrite;
    this.isAdmin = options.isAdmin;
    this.onSelectEmployee = options.onSelectEmployee;
    this.onOpenNewEmployeeModal = options.onOpenNewEmployeeModal;
    this.onOpenBulkModal = options.onOpenBulkModal;
    this.onFilterChange = options.onFilterChange;
  }

  public setData(employees: EmployeeRecord[], sites: SiteRecord[], selectedId?: string | null, allEmployees?: EmployeeRecord[]): void {
    const signature = JSON.stringify(this.getFilterState());
    if (signature !== this.filterSignature) {
      this.page = 1;
      this.rowHeight = 27;
    }
    this.filterSignature = signature;
    this.employees = sortEmployeesByWorksite(employees);
    this.allEmployees = allEmployees ?? employees;
    this.rebuildPages();
    this.page = Math.min(this.page, this.pages.length);
    this.sites = sites;
    if (selectedId !== undefined) {
      this.selectedEmployeeId = selectedId;
    } else if (!this.selectedEmployeeId && employees.length > 0) {
      // 첫 번째 인력 기본 선택
      this.selectedEmployeeId = employees[0].id;
    }
  }

  public setSelectedId(id: string | null): void {
    this.selectedEmployeeId = id;
    this.updateSelectionHighlight();
  }

  public revealEmployee(employee:EmployeeRecord):void {this.filterSiteId="all";this.filterShiftGroup="all";this.filterEmploymentType="all";this.searchKeyword=employee.employeeCode;this.filterStatus=employee.scheduledRehire?"scheduled":employee.employmentPhase==="employed"?employee.status==="leave"?"leave":"active":employee.employmentPhase==="retired"?"retired":employee.status;this.page=1;this.render();}

  public getFilterState() {
    return {
      siteId: this.filterSiteId,
      status: this.filterStatus,
      keyword: this.searchKeyword,
      employmentType: this.filterEmploymentType,
      shiftGroup: this.filterShiftGroup
    };
  }

  public render(): void {
    this.resizeObserver?.disconnect();
    if (this.resizeFrame !== null) { cancelAnimationFrame(this.resizeFrame); this.resizeFrame = null; }
    this.container.innerHTML = "";

    // 1. 상단 필터 바
    const filterCard = document.createElement("div");
    filterCard.className = "workforce-filter-card";

    const filterLeft = document.createElement("div");
    filterLeft.className = "workforce-filter-left";

    // 근무지 셀렉트
    const siteSelect = document.createElement("select");
    siteSelect.className = "workforce-select";
    siteSelect.id = "filter-site-select";
    siteSelect.setAttribute("aria-label", "근무지 필터");

    const optAllSite = document.createElement("option");
    optAllSite.value = "all";
    optAllSite.textContent = "전체 근무지";
    siteSelect.appendChild(optAllSite);
    siteSelect.appendChild(new Option("미배정", "unassigned", false, this.filterSiteId === "unassigned"));
    optAllSite.selected = this.filterSiteId === "all";

    for (const site of this.sites) {
      const opt = document.createElement("option");
      opt.value = site.id;
      opt.textContent = site.name;
      if (this.filterSiteId === site.id) opt.selected = true;
      siteSelect.appendChild(opt);
    }

    siteSelect.addEventListener("change", () => {
      this.filterSiteId = siteSelect.value;
      this.onFilterChange();
    });
    filterLeft.appendChild(siteSelect);

    // 재직 상태 셀렉트
    const statusSelect = document.createElement("select");
    statusSelect.className = "workforce-select";
    statusSelect.id = "filter-status-select";
    statusSelect.setAttribute("aria-label", "재직 상태 필터");

    const statusOptions = [
      { value: "all", label: "전체 상태" },
      { value: "active", label: "재직" },
      { value: "leave", label: "휴직" },
      { value: "retired", label: "퇴사" },
      { value: "scheduled", label: "재입사 예정" }
    ];
    for (const sOpt of statusOptions) {
      const opt = document.createElement("option");
      opt.value = sOpt.value;
      opt.textContent = sOpt.label;
      if (this.filterStatus === sOpt.value) opt.selected = true;
      statusSelect.appendChild(opt);
    }
    statusSelect.addEventListener("change", () => {
      this.filterStatus = statusSelect.value;
      this.onFilterChange();
    });
    filterLeft.appendChild(statusSelect);

    const typeSelect = document.createElement("select");
    typeSelect.className = "workforce-select";
    typeSelect.id = "filter-employment-type";
    typeSelect.setAttribute("aria-label", "고용형태 필터");
    for (const [value, label] of [["all", "전체 고용형태"], ["정규", "정규직"], ["계약", "계약직"], ["BP", "BP(외부인력)"]]) typeSelect.appendChild(new Option(label, value, false, value === this.filterEmploymentType));
    typeSelect.addEventListener("change", () => { this.filterEmploymentType = typeSelect.value; this.onFilterChange(); });
    filterLeft.appendChild(typeSelect);
    const teamSelect = document.createElement("select");
    teamSelect.className = "workforce-select";
    teamSelect.id = "filter-shift-group";
    teamSelect.setAttribute("aria-label", "조 필터");
    teamSelect.appendChild(new Option("전체 조", "all"));
    for (const team of [...new Set(this.allEmployees.map(e => e.currentShiftGroup).filter((g): g is string => Boolean(g)))].sort((x, y) => x.localeCompare(y, "ko"))) teamSelect.appendChild(new Option(team, team, false, team === this.filterShiftGroup));
    teamSelect.addEventListener("change", () => { this.filterShiftGroup = teamSelect.value; this.onFilterChange(); });
    filterLeft.appendChild(teamSelect);

    // 검색 인풋 (사번 또는 이름) - 300ms 디바운스
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "workforce-input workforce-input-search";
    searchInput.id = "filter-keyword-input";
    searchInput.placeholder = "이름 또는 사번 검색";
    searchInput.value = this.searchKeyword;
    searchInput.setAttribute("aria-label", "이름 또는 사번 검색");

    searchInput.addEventListener("input", () => {
      if (this.searchDebounceTimer) {
        window.clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.searchKeyword = searchInput.value;
        this.onFilterChange();
      }, 300);
    });
    filterLeft.appendChild(searchInput);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button"; resetBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm";
    resetBtn.id = "btn-workforce-reset-filters"; resetBtn.textContent = "초기화";
    resetBtn.addEventListener("click", () => {
      if (this.searchDebounceTimer) { clearTimeout(this.searchDebounceTimer); this.searchDebounceTimer = null; }
      this.filterSiteId = this.filterStatus = this.filterEmploymentType = this.filterShiftGroup = "all";
      this.searchKeyword = "";
      this.onFilterChange(); this.render();
    });
    filterLeft.appendChild(resetBtn);

    filterCard.appendChild(filterLeft);

    // 필터 우측: 카운트 및 액션 버튼들
    const filterRight = document.createElement("div");
    filterRight.className = "workforce-filter-right";

    const countBadge = document.createElement("div");
    countBadge.className = "workforce-count-badge";
    countBadge.id = "workforce-count-label";
    countBadge.textContent = `전체 ${this.employees.length}명`;
    filterRight.appendChild(countBadge);

    const compactNote = document.createElement("span");
    compactNote.className = "workforce-compact-note";
    compactNote.textContent = "연락처·이메일은 인력 상세에서 확인할 수 있습니다.";
    filterRight.appendChild(compactNote);

    // 시급 일괄 업데이트 버튼 (UI01-D05: operator/reviewer도 열어서 읽기 preview 가능)
    const bulkBtn = document.createElement("button");
    bulkBtn.type = "button";
    bulkBtn.id = "btn-open-e6";
    bulkBtn.className = "workforce-btn workforce-btn-secondary";
    bulkBtn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">upload_file</span><span>시급 일괄 업데이트</span>`;
    bulkBtn.addEventListener("click", () => {
      this.onOpenBulkModal();
    });
    filterRight.appendChild(bulkBtn);

    // 신규 인력 등록 버튼
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.id = "btn-e1-new";
    newBtn.className = "workforce-btn workforce-btn-primary";
    newBtn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">person_add</span><span>신규 인력 등록</span>`;
    if (!this.canWrite) {
      newBtn.disabled = true;
      newBtn.title = "기획자 또는 관리자 권한이 필요합니다.";
    }
    newBtn.addEventListener("click", () => {
      if (this.canWrite) this.onOpenNewEmployeeModal();
    });
    filterRight.appendChild(newBtn);

    filterCard.appendChild(filterRight);
    this.container.appendChild(filterCard);

    // 2. 테이블 카드
    const tableCard = document.createElement("div");
    tableCard.className = "workforce-table-card";
    tableCard.id = "workforce-table-wrapper";

    const table = document.createElement("table");
    table.className = "workforce-table";
    table.id = "table-emp-e1";

    const colgroup = document.createElement("colgroup");
    for (const width of [9, 7, 5, 7, 6, 9, 11, 5, 17, 10, 14]) { const col = document.createElement("col"); col.style.width = `${width}%`; colgroup.appendChild(col); }
    table.appendChild(colgroup);
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th scope="col">사번</th>
        <th scope="col">이름</th>
        <th scope="col">직급</th>
        <th scope="col">고용형태</th>
        <th scope="col">상태</th>
        <th scope="col">등록 입사일</th>
        <th scope="col">현재 근무지</th>
        <th scope="col">현재 조</th>
        <th scope="col" title="서울 기준 오늘 유효한 시급과 적용 시작일입니다. 미래 시급은 상세의 적용 예정 안내에서 확인하세요.">현재 시급·적용일</th>
        <th scope="col">연락처</th>
        <th scope="col">이메일</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tbody.id = "table-emp-tbody";
    table.appendChild(tbody);

    const rowSlots = document.createElement("div");
    rowSlots.id = "workforce-row-slots";
    rowSlots.className = "workforce-table-viewport";
    rowSlots.appendChild(table);
    tableCard.appendChild(rowSlots);
    const pager = document.createElement("nav");
    pager.id = "workforce-pagination";
    pager.className = "workforce-pagination pagination-footer";
    pager.setAttribute("aria-label", "인력 목록 페이지");
    tableCard.appendChild(pager);
    if (this.tableContainer === this.container) this.container.appendChild(tableCard);
    else this.tableContainer.replaceChildren(tableCard);

    this.renderTableRows(tbody);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => { this.resizeFrame = null; this.fitToHeight(); });
    });
    this.resizeObserver.observe(rowSlots);
    this.resizeObserver.observe(table);
    this.fitToHeight();
  }

  public renderTableRows(tbody?: HTMLElement): void {
    const body = tbody || this.tableContainer.querySelector<HTMLElement>("#table-emp-tbody");
    if (!body) return;

    body.innerHTML = "";
    this.renderPagination();

    if (this.employees.length === 0) {
      const emptyTr = document.createElement("tr");
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = 11;
      emptyTd.className = "wf-text-center wf-p-20 wf-text-muted";
      emptyTd.textContent = "조건에 일치하는 인력이 없습니다.";
      emptyTr.appendChild(emptyTd);
      body.appendChild(emptyTr);
      return;
    }

    // 근무지별 그룹화
    const siteKey = (emp: EmployeeRecord) => emp.currentSiteId && !emp.currentSiteDeletedAt ? emp.currentSiteId : "__unassigned";
    const siteGroups = new Map<string, EmployeeRecord[]>();
    const range = this.pages[this.page - 1];
    for (const emp of this.employees.slice(range.start, range.end)) {
      const sKey = siteKey(emp);
      if (!siteGroups.has(sKey)) {
        siteGroups.set(sKey, []);
      }
      siteGroups.get(sKey)!.push(emp);
    }

    // 그룹 행 및 인력 행 렌더링
    for (const [key, groupEmps] of siteGroups.entries()) {
      const siteName = key === "__unassigned" ? "미배정" : groupEmps[0].currentSiteName || "근무지명 없음";
      const totalInGroup = this.employees.filter(emp => siteKey(emp) === key).length;
      const continued = this.employees.findIndex(emp => siteKey(emp) === key) < range.start;
      const isCollapsed = this.collapsedSites.has(key);

      // 그룹 헤더 행
      const groupTr = document.createElement("tr");
      groupTr.className = "workforce-group-row";
      groupTr.dataset.siteKey = key;
      groupTr.tabIndex = 0;
      groupTr.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

      const groupTd = document.createElement("td");
      groupTd.colSpan = 11;
      groupTd.innerHTML = `
        <span class="material-symbols-outlined workforce-group-toggle-icon" aria-hidden="true">${isCollapsed ? "expand_more" : "expand_less"}</span>
        <span>${this.escape(siteName)} · 전체 ${totalInGroup}명 · 이 페이지 ${groupEmps.length}명${continued ? " · 이어서" : ""}</span>
      `;
      groupTr.appendChild(groupTd);

      const toggleCollapse = () => {
        if (this.collapsedSites.has(key)) {
          this.collapsedSites.delete(key);
        } else {
          this.collapsedSites.add(key);
        }
        this.renderTableRows();
      };

      groupTr.addEventListener("click", toggleCollapse);
      groupTr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleCollapse();
        }
      });
      body.appendChild(groupTr);

      if (isCollapsed) {
        continue;
      }

      // 그룹 내 인력 행들
      for (const emp of groupEmps) {
        const tr = document.createElement("tr");
        tr.className = `workforce-row ${this.selectedEmployeeId === emp.id ? "selected" : ""}`;
        tr.tabIndex = 0;
        tr.dataset.id = emp.id;
        tr.dataset.employeeCode = emp.employeeCode || "";

        // 상태 배지 클래스
        const statusClass =
          emp.employmentPhase === "scheduled" ? "workforce-status-scheduled" : emp.employmentPhase === "retired" ? "workforce-status-retired" : emp.status === "active"
            ? "workforce-status-active"
            : emp.status === "leave"
              ? "workforce-status-leave"
              : "workforce-status-retired";
        const statusLabel =
          employeeStatusLabel(emp);

        // 고용형태 표시
        const isBp = isBpEmploymentType(emp.employmentType);
        const empTypeLabel = isBp ? "BP" : emp.employmentType || "정규직";

        // 시급 표시
        const rateLabel = emp.currentHourlyRate === undefined ? "적용 중인 시급 없음" : formatCurrency(emp.currentHourlyRate);
        const rateStart = emp.currentHourlyRate !== undefined && emp.currentHourlyRateEffectiveFrom
          ? ` · ${emp.currentHourlyRateEffectiveFrom}부터` : "";

        tr.innerHTML = `
          <td>${this.escape(emp.employeeCode || "-")}</td>
          <td><strong>${this.escape(emp.name)}</strong></td>
          <td>${this.escape(formatEmployeeRank(emp.rank))}</td>
          <td>${this.escape(empTypeLabel)}</td>
          <td><span class="workforce-status-badge ${statusClass}">${statusLabel}</span></td>
          <td>${this.escape(emp.hireDate || "-")}</td>
          <td>${this.escape(emp.currentSiteName || "-")}</td>
          <td>${this.escape(emp.currentShiftGroup || "-")}</td>
          <td class="employee-current-wage">${this.escape(rateLabel)}<span class="wf-text-muted employee-wage-effective-from">${this.escape(rateStart)}</span></td>
          <td>${this.escape(emp.contact || "-")}</td>
          <td>${this.escape(emp.email || "-")}</td>
        `;
        tr.querySelectorAll("td").forEach(cell => { cell.title = cell.textContent || ""; });
        const wageCell = tr.querySelector<HTMLElement>(".employee-current-wage")!;
        wageCell.title = `${emp.currentHourlyRateAsOfDate ?? "오늘"} 서울 기준 · ${rateLabel}${emp.currentHourlyRateEffectiveFrom ? ` · 적용 기간 ${emp.currentHourlyRateEffectiveFrom} ~ ${emp.currentHourlyRateEffectiveTo ?? "계속"}` : ""}`;

        const selectThis = () => {
          this.selectedEmployeeId = emp.id;
          this.updateSelectionHighlight();
          this.onSelectEmployee(emp.id, true);
        };

        tr.addEventListener("click", selectThis);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectThis();
          }
        });

        body.appendChild(tr);
      }
    }
    this.fitToHeight();
  }

  public updateSelectionHighlight(): void {
    const rows = this.tableContainer.querySelectorAll<HTMLTableRowElement>(".workforce-row");
    rows.forEach((row) => {
      if (row.dataset.id === this.selectedEmployeeId) {
        row.classList.add("selected");
      } else {
        row.classList.remove("selected");
      }
    });
  }

  private renderPagination(): void {
    const pager = this.tableContainer.querySelector<HTMLElement>("#workforce-pagination");
    if (!pager) return;
    pager.replaceChildren();
    const total = this.employees.length, pages = this.pages.length, range = this.pages[this.page - 1];
    const description = document.createElement("span"); description.setAttribute("role", "status"); description.setAttribute("aria-live", "polite");
    description.textContent = total ? `검색 결과 ${total}명 · ${range.start + 1}–${range.end}명 · ${this.page}/${pages}페이지` : "검색 결과 0명";
    pager.appendChild(description);
    pager.appendChild(renderPagination({currentPage:this.page,totalPages:pages,totalCount:total,idPrefix:"employees",label:"인력 목록 페이지 이동",onPageChange:page=>{
      this.page = page;
      const first = this.employees[this.pages[this.page - 1].start];
      if (first) this.selectedEmployeeId = first.id;
      this.renderTableRows();
      if (first) this.onSelectEmployee(first.id);
    }}));
  }

  public destroy(): void {
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    if (this.searchDebounceTimer) {
      window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.container.innerHTML = "";
    if (this.tableContainer !== this.container) this.tableContainer.replaceChildren();
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  private rebuildPages(): void {
    this.pages = paginateGroupsForHeight(this.employees, this.bodyHeight, this.rowHeight, this.groupHeight, employee => employee.currentSiteId && !employee.currentSiteDeletedAt ? employee.currentSiteId : "__unassigned");
  }

  private fitToHeight(): void {
    const viewport = this.tableContainer.querySelector<HTMLElement>("#workforce-row-slots");
    const head = this.tableContainer.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head) return;
    const group = this.tableContainer.querySelector<HTMLElement>(".workforce-group-row");
    // This list also fills a bounded viewport on narrow screens. The shared
    // legacy measurement returns zero there (fixed ten-row fallback).
    const scrollbar = Math.max(0, viewport.offsetHeight - viewport.clientHeight);
    const height = Math.max(0, viewport.getBoundingClientRect().height - scrollbar - head.getBoundingClientRect().height - 0.5);
    // Wrapped rows can differ in height. Keep the largest observation at this
    // width so paging never oscillates when a tall row moves to another page.
    if (Math.abs(viewport.clientWidth - this.measuredTableWidth) > 0.5) {
      this.measuredTableWidth = viewport.clientWidth;
      this.rowHeight = 27;
    }
    const rowHeight = Math.max(this.rowHeight, ...Array.from(
      this.tableContainer.querySelectorAll<HTMLElement>(".workforce-row"),
      row => row.getBoundingClientRect().height
    ));
    const groupHeight = group?.getBoundingClientRect().height || this.groupHeight;
    if (Math.abs(height - this.bodyHeight) < 0.25 && Math.abs(rowHeight - this.rowHeight) < 0.25 && Math.abs(groupHeight - this.groupHeight) < 0.25) return;
    const anchor = this.selectedEmployeeId || this.employees[this.pages[this.page - 1]?.start]?.id;
    this.bodyHeight = height; this.rowHeight = rowHeight; this.groupHeight = groupHeight;
    this.rebuildPages();
    const index = this.employees.findIndex(employee => employee.id === anchor);
    const page = this.pages.findIndex(range => range.start <= index && index < range.end);
    this.page = page >= 0 ? page + 1 : Math.min(this.page, this.pages.length);
    this.renderTableRows();
  }
}
