// sites-list.ts — 근무지 목록, KPI, 검색/필터, 그룹화 접기/펼치기 및 페이징 컴포넌트
import { renderPagination, paginateGroupsForHeight, measurePaginationBody, type PageRange } from "../pagination";
import type { AuthSession } from "../../shared/domain/model";
import {
  type SiteListItem,
  type SiteListFilter,
  type SitePageResult,
  filterAndPaginateSites
} from "./sites-model";

export interface SitesListOptions {
  container: HTMLElement;
  toolbarContainer?: HTMLElement;
  session: AuthSession;
  sites: SiteListItem[];
  selectedSiteId: string | null;
  onSelectSite: (siteId: string | null) => void;
  onOpenCreateWizard: () => void;
}

export class SitesList {
  private container: HTMLElement;
  private toolbarContainer?: HTMLElement;
  private session: AuthSession;
  private allSites: SiteListItem[];
  private selectedSiteId: string | null;
  private onSelectSite: (siteId: string | null) => void;
  private onOpenCreateWizard: () => void;

  private filter: SiteListFilter = {
    keyword: "",
    status: "ALL",
    patternFilter: "ALL",
    sortBy: "customer",
    sortOrder: "asc"
  };

  private currentPage = 1;
  private collapsedGroups = new Set<string>();
  private pages: PageRange[] = [{ start: 0, end: 0 }];
  private bodyHeight = 0;
  private rowHeight = 34;
  private groupHeight = 40;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(options: SitesListOptions) {
    this.container = options.container;
    this.toolbarContainer = options.toolbarContainer;
    this.session = options.session;
    this.allSites = options.sites;
    this.selectedSiteId = options.selectedSiteId;
    this.onSelectSite = options.onSelectSite;
    this.onOpenCreateWizard = options.onOpenCreateWizard;
    const sorted=filterAndPaginateSites(this.allSites,this.filter,1,Math.max(1,this.allSites.length)).items;
    const selectedIndex=sorted.findIndex(s=>s.id===this.selectedSiteId);if(selectedIndex>=0)this.currentPage=Math.floor(selectedIndex/10)+1;
  }

  public updateData(sites: SiteListItem[], selectedSiteId?: string | null): void {
    this.allSites = sites;
    if (selectedSiteId !== undefined) {
      this.selectedSiteId = selectedSiteId;
    }
    this.render();
  }

  public render(): void {
    this.resizeObserver?.disconnect();
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    const focused=document.activeElement as HTMLInputElement|null,focusId=focused?.id,selection=focused?.selectionStart;const restoreFocus=!!focused && (!!this.toolbarContainer?.contains(focused)||this.container.contains(focused));

    if (this.toolbarContainer) {
      this.toolbarContainer.innerHTML = "";
    }
    this.container.innerHTML = "";

    // 1. 툴바 렌더링 (검색, 상태 필터, 패턴 필터, 정렬 드롭다운, 등록 버튼) (UI03-D08)
    const toolbar = document.createElement("div");
    toolbar.className = "sites-toolbar";

    const toolbarLeft = document.createElement("div");
    toolbarLeft.className = "sites-toolbar-left";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.id = "sites-search-input";
    searchInput.className = "sites-search-input";
    searchInput.placeholder = "근무지명/코드/고객사 검색";
    searchInput.value = this.filter.keyword;
    searchInput.setAttribute("aria-label", "근무지 검색");
    searchInput.addEventListener("input", (e) => {
      this.filter.keyword = (e.target as HTMLInputElement).value;
      this.currentPage = 1;
      this.render();
    });
    toolbarLeft.appendChild(searchInput);

    // 상태 필터 칩
    const chipGroup = document.createElement("div");
    chipGroup.className = "sites-filter-chip-group";
    const statuses: Array<{ label: string; value: "ALL" | "active" | "inactive" }> = [
      { label: "전체", value: "ALL" },
      { label: "활성", value: "active" },
      { label: "비활성", value: "inactive" }
    ];

    statuses.forEach((st) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `sites-filter-chip ${this.filter.status === st.value ? "active" : ""}`;
      chip.textContent = st.label;
      chip.addEventListener("click", () => {
        this.filter.status = st.value;
        this.currentPage = 1;
        this.render();
      });
      chipGroup.appendChild(chip);
    });
    toolbarLeft.appendChild(chipGroup);

    // 패턴 유무 필터 칩 (UI03-D08)
    const patGroup = document.createElement("div");
    patGroup.className = "sites-filter-chip-group";
    const patFilters: Array<{ label: string; value: "ALL" | "HAS_PATTERN" | "NO_PATTERN" }> = [
      { label: "전체패턴", value: "ALL" },
      { label: "설정됨", value: "HAS_PATTERN" },
      { label: "미설정", value: "NO_PATTERN" }
    ];
    patFilters.forEach((pf) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `sites-filter-chip ${this.filter.patternFilter === pf.value ? "active" : ""}`;
      chip.textContent = pf.label;
      chip.addEventListener("click", () => {
        this.filter.patternFilter = pf.value;
        this.currentPage = 1;
        this.render();
      });
      patGroup.appendChild(chip);
    });
    toolbarLeft.appendChild(patGroup);

    // 정렬 드롭다운 (UI03-D08)
    const sortSelect = document.createElement("select");
    sortSelect.id = "sites-sort-select";
    sortSelect.className = "sites-form-select";
    sortSelect.style.fontSize = "12px";
    sortSelect.style.height = "28px";
    sortSelect.style.padding = "2px 6px";
    sortSelect.innerHTML = `
      <option value="customer" ${this.filter.sortBy === "customer" ? "selected" : ""}>고객사순</option>
      <option value="name" ${this.filter.sortBy === "name" ? "selected" : ""}>근무지명순</option>
      <option value="code" ${this.filter.sortBy === "code" ? "selected" : ""}>코드순</option>
      <option value="teams" ${this.filter.sortBy === "teams" ? "selected" : ""}>조 수 많은 순</option>
      <option value="employees" ${this.filter.sortBy === "employees" ? "selected" : ""}>인원 많은 순</option>
    `;
    sortSelect.addEventListener("change", (e) => {
      this.filter.sortBy = (e.target as HTMLSelectElement).value as SiteListFilter["sortBy"];
      this.currentPage = 1;
      this.render();
    });
    toolbarLeft.appendChild(sortSelect);

    toolbar.appendChild(toolbarLeft);

    // 우측: 등록 버튼 (planner, admin만 가능)
    const canEdit = this.session.role === "admin" || this.session.role === "planner";
    if (canEdit) {
      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "btn-primary";
      createBtn.id = "btn-sites-create";
      createBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:18px;">add</span>
        <span>근무지 등록</span>
      `;
      createBtn.addEventListener("click", () => this.onOpenCreateWizard());
      toolbar.appendChild(createBtn);
    }

    if (this.toolbarContainer) {
      this.toolbarContainer.appendChild(toolbar);
    }

    // 2. 필터링 및 페이징 계산
    const all = filterAndPaginateSites(this.allSites, this.filter, 1, Math.max(1, this.allSites.length));
    this.pages = paginateGroupsForHeight(all.items, this.bodyHeight, this.rowHeight, this.groupHeight, site => site.customerName);
    this.currentPage = Math.max(1, Math.min(this.currentPage, this.pages.length));
    const range = this.pages[this.currentPage - 1];
    const pageResult: SitePageResult = { ...all, items: all.items.slice(range.start, range.end), totalPages: this.pages.length, currentPage: this.currentPage, startRange: all.totalCount ? range.start + 1 : 0, endRange: range.end };

    this.currentPage=pageResult.currentPage;
    if(!pageResult.items.some(s=>s.id===this.selectedSiteId)){this.selectedSiteId=pageResult.items[0]?.id||null;this.onSelectSite(this.selectedSiteId);}
    // 3. 테이블 래퍼 (workforce와 동일한 상하 stretch 구조)
    const tableWrapper = document.createElement("div");
    tableWrapper.id = "sites-table-wrapper";
    tableWrapper.className = "sites-table-wrapper";

    const viewport = document.createElement("div");
    viewport.className = "sites-table-viewport";

    const table = document.createElement("table");
    table.className = "sites-table";
    table.innerHTML = `
      <colgroup><col style="width:80px"><col style="width:62px"><col style="width:130px"><col><col style="width:52px"><col style="width:65px"><col style="width:126px"></colgroup>
      <thead>
        <tr>
          <th>코드</th><th>상태</th>
          <th style="width:130px;">고객사</th>
          <th>근무지명</th>

          <th style="width:80px; text-align:center;">조 수</th>
          <th style="width:90px; text-align:center;">배정인원</th>
          <th style="width:140px;">현재 패턴</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement("tbody");

    if (pageResult.items.length === 0) {
      const emptyTr = document.createElement("tr");
      emptyTr.innerHTML = `
        <td colspan="7" style="text-align:center; padding:32px; color:var(--text-sub, #4B5563);">
          검색 및 필터 조건에 일치하는 근무지가 없습니다.
        </td>
      `;
      tbody.appendChild(emptyTr);
    } else {
      // 고객사 그룹별 렌더링
      const currentGroups = new Map<string, SiteListItem[]>();
      for (const item of pageResult.items) {
        const list = currentGroups.get(item.customerName) ?? [];
        list.push(item);
        currentGroups.set(item.customerName, list);
      }

      currentGroups.forEach((groupItems, customerName) => {
        const entire=pageResult.groups.find(g=>g.customerName===customerName);const total=entire?.totalCount ?? groupItems.length;const continued=entire?.sites[0]?.id!==groupItems[0]?.id;

        const isCollapsed = this.collapsedGroups.has(customerName);
        const groupRow = document.createElement("tr");
        groupRow.className = "sites-group-row";groupRow.tabIndex=0;groupRow.setAttribute("aria-expanded",String(!isCollapsed));groupRow.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();groupRow.click();}});
        groupRow.innerHTML = `
          <td colspan="7">
            <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; margin-right:4px;">
              ${isCollapsed ? "chevron_right" : "expand_more"}
            </span>
            <span>${this.escape(customerName)}</span>
            <span style="font-size:12px; font-weight:normal; color:var(--text-sub, #4B5563); margin-left:6px;">
              (전체 ${total}곳 · 이 페이지 ${groupItems.length}곳${continued?" · 이어서":""})
            </span>
          </td>
        `;
        groupRow.addEventListener("click", () => {
          if (this.collapsedGroups.has(customerName)) {
            this.collapsedGroups.delete(customerName);
          } else {
            this.collapsedGroups.add(customerName);
          }
          this.render();
        });
        tbody.appendChild(groupRow);

        if (!isCollapsed) {
          groupItems.forEach((site) => {
            const tr = document.createElement("tr");
            tr.className = `sites-row-item sites-item-row ${this.selectedSiteId === site.id ? "selected" : ""}`;
            tr.dataset.id = site.id;tr.tabIndex=0;tr.setAttribute("aria-selected",String(this.selectedSiteId===site.id));tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();tr.click();}});

            const statusBadge =
              site.status === "active"
                ? `<span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600; background:#E8F5EE; color:#1E7A46;">활성</span>`
                : `<span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600; background:#F1F2F4; color:#4B5563;">비활성</span>`;

            tr.innerHTML = `
              <td class="sites-code-cell">${this.escape(site.siteCode)}</td><td>${statusBadge}</td>
              <td>${this.escape(site.customerName)}</td>
              <td style="font-weight:600;">${this.escape(site.name)}</td>

              <td style="text-align:center;">${site.teamCount > 0 ? `${site.teamCount}조` : "-"}</td>
              <td style="text-align:center;">${site.assignedCount > 0 ? `${site.assignedCount}명` : "-"}</td>
              <td style="color:var(--text-sub, #4B5563);">${this.escape(site.activePatternName || "패턴 미설정")}</td>
            `;

            tr.addEventListener("click", () => {
              this.selectedSiteId = site.id;
              this.onSelectSite(site.id);
              this.render();
            });

            tbody.appendChild(tr);
          });
        }
      });
    }

    table.appendChild(tbody);
    viewport.appendChild(table);
    tableWrapper.appendChild(viewport);

    // 4. 하단 페이징 컨트롤 (workforce와 동일)
    const pagination = document.createElement("nav");
    pagination.className = "sites-pagination pagination-footer";
    pagination.setAttribute("aria-label","근무지 목록 페이지");
    const description=document.createElement("span");description.id="sites-pagination-info";description.setAttribute("role","status");description.setAttribute("aria-live","polite");
    description.textContent=pageResult.totalCount ? `검색 결과 ${pageResult.totalCount}곳 · ${pageResult.startRange}–${pageResult.endRange}곳 · ${pageResult.currentPage}/${pageResult.totalPages}페이지` : "검색 결과 0곳";
    pagination.appendChild(description);
    pagination.appendChild(renderPagination({currentPage:pageResult.currentPage,totalPages:pageResult.totalPages,totalCount:pageResult.totalCount,idPrefix:"sites-page",label:"근무지 목록 페이지 이동",className:"sites-page-nav",onPageChange:page=>{this.currentPage=page;this.render();}}));
    tableWrapper.appendChild(pagination);

    if (!this.toolbarContainer) {
      // toolbarContainer가 없으면 container 내부에 toolbar와 tableWrapper를 함께 삽입
      this.container.appendChild(toolbar);
    }
    this.container.appendChild(tableWrapper);
    if(restoreFocus&&focusId){const input=document.getElementById(focusId) as HTMLInputElement|null;input?.focus({preventScroll:true});if(selection!=null&&input?.type==="text")input.setSelectionRange(selection,selection);}
    this.resizeObserver = new ResizeObserver(() => this.scheduleFit());
    this.resizeObserver.observe(viewport);
    this.resizeObserver.observe(table);
    this.scheduleFit();
  }

  public destroy(): void {
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
  }

  private scheduleFit(): void {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => { this.resizeFrame = null; this.fitToHeight(); });
  }

  private fitToHeight(): void {
    const viewport = this.container.querySelector<HTMLElement>(".sites-table-viewport"), head = this.container.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head) return;
    const height = measurePaginationBody(viewport, head);
    const row = this.container.querySelector<HTMLElement>(".sites-row-item")?.getBoundingClientRect().height || this.rowHeight;
    const group = this.container.querySelector<HTMLElement>(".sites-group-row")?.getBoundingClientRect().height || this.groupHeight;
    if (Math.abs(height - this.bodyHeight) < 0.1 && Math.abs(row - this.rowHeight) < 0.1 && Math.abs(group - this.groupHeight) < 0.1) return;
    this.bodyHeight = height; this.rowHeight = row; this.groupHeight = group;
    const all = filterAndPaginateSites(this.allSites, this.filter, 1, Math.max(1, this.allSites.length)).items;
    this.pages = paginateGroupsForHeight(all, height, row, group, site => site.customerName);
    const index = all.findIndex(site => site.id === this.selectedSiteId);
    const page = this.pages.findIndex(range => range.start <= index && index < range.end);
    this.currentPage = page >= 0 ? page + 1 : Math.min(this.currentPage, this.pages.length);
    this.render();
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
