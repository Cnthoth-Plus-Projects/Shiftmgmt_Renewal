import { measurePaginationBody, paginateGroupsForHeight, renderPagination, type PageRange } from "../pagination";
import { dashboardMoney, dashboardTime, type DashboardModel, type DashboardRank } from "./dashboard-model";
import { dashboardEscape } from "./dashboard-view";

export class DashboardRanking {
  private currentPage = 1;
  private pages: PageRange[] = [{ start: 0, end: 0 }];
  private rows: DashboardRank[] = [];
  private selected = "";
  private anchor = "";
  private observer: ResizeObserver;
  private fitting = false;
  constructor(private container: HTMLElement) {
    container.innerHTML = '<div class="dashboard-rank-viewport"><table aria-label="전체 인원 수당 순위"><thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">사번</th><th scope="col">근무지</th><th scope="col" class="dashboard-number">총 근로시간</th><th scope="col" class="dashboard-number">산출 수당</th></tr></thead><tbody></tbody></table></div><div class="dashboard-rank-footer"></div>';
    this.observer = new ResizeObserver(() => this.fit()); this.observer.observe(this.viewport);
    container.querySelector("tbody")!.addEventListener("click", event => { const row = (event.target as Element).closest<HTMLElement>("[data-code]"); if (row) { this.selected = row.dataset.code!; this.anchor = this.selected; this.paint(); } });
    container.querySelector("tbody")!.addEventListener("keydown", event => { const e = event as KeyboardEvent; if (!["Enter", " "].includes(e.key)) return; const row = (e.target as Element).closest<HTMLElement>("[data-code]"); if (!row) return; e.preventDefault(); this.selected = row.dataset.code!; this.anchor = this.selected; this.paint(); Array.from(container.querySelectorAll<HTMLElement>("[data-code]")).find(r => r.dataset.code === this.selected)?.focus(); });
    void document.fonts.ready.then(() => { if (this.container.isConnected) this.fit(); });
  }
  private get viewport(): HTMLElement { return this.container.querySelector(".dashboard-rank-viewport")!; }
  render(m: DashboardModel, reset = false): void { this.rows = m.ranking; if (reset) { this.currentPage = 1; this.selected = ""; this.anchor = this.rows[0]?.code || ""; } if (this.selected && !this.rows.some(r => r.code === this.selected)) this.selected = ""; const count = this.container.closest("article")?.querySelector("#dashboard-rank-count"); if (count) count.textContent = `${m.ranking.length}명`; this.paint(); this.fit(); }
  private fit(): void {
    if (this.fitting || !this.container.isConnected) return;
    this.fitting = true;
    try {
      const oldRange = this.pages[this.currentPage - 1];
      const anchor = this.selected || this.anchor || this.rows[oldRange?.start || 0]?.code;
      for (let pass = 0; pass < 2; pass++) {
        const head = this.viewport.querySelector<HTMLElement>("thead")!; const row = this.viewport.querySelector<HTMLElement>("tr[data-code]");
        const height = measurePaginationBody(this.viewport, head) || Math.max(0, this.viewport.getBoundingClientRect().height - Math.max(0, this.viewport.offsetHeight - this.viewport.clientHeight) - head.getBoundingClientRect().height - .5);
        this.pages = paginateGroupsForHeight(this.rows, height, row?.getBoundingClientRect().height || 48, 0, () => "all");
        const index = this.rows.findIndex(r => r.code === anchor); const anchoredPage = this.pages.findIndex(p => index >= p.start && index < p.end);
        this.currentPage = anchoredPage >= 0 ? anchoredPage + 1 : Math.max(1, Math.min(this.currentPage, this.pages.length)); if (anchoredPage < 0) this.anchor = this.rows[this.pages[this.currentPage - 1]?.start || 0]?.code || ""; this.paint();
      }
    } finally { this.fitting = false; }
  }
  private paint(): void {
    const range = this.pages[this.currentPage - 1] || { start: 0, end: Math.min(5, this.rows.length) };
    const rows = this.rows.slice(range.start, range.end); const body = this.container.querySelector("tbody")!;
    body.innerHTML = rows.length ? rows.map((r, i) => `<tr data-code="${dashboardEscape(r.code)}" data-rank="${range.start + i + 1}" tabindex="0"${r.code === this.selected ? ' class="dashboard-selected"' : ''}><td><span class="dashboard-rank-position">${range.start + i + 1}</span></td><td><strong class="dashboard-rank-person">${dashboardEscape(r.name)}</strong></td><td class="dashboard-rank-code">${dashboardEscape(r.code)}</td><td title="${dashboardEscape(r.site)}">${dashboardEscape(r.site)}</td><td class="dashboard-number">${dashboardTime(r.workMinutes)}</td><td class="dashboard-number dashboard-rank-money">${dashboardMoney(r.totalAmount)}</td></tr>`).join("") : '<tr><td colspan="6">해당 조건의 인원이 없습니다.</td></tr>';
    const footer = this.container.querySelector(".dashboard-rank-footer")!; footer.replaceChildren();
    const summary = document.createElement("span"); summary.textContent = `전체 ${this.rows.length}명 · ${this.rows.length ? range.start + 1 : 0}~${range.end}명`; footer.append(summary);
    footer.append(renderPagination({ currentPage: this.currentPage, totalPages: this.pages.length, totalCount: this.rows.length, idPrefix: "dashboard", label: "전체 인원 순위 페이지", onPageChange: page => { this.currentPage = page; const range = this.pages[page - 1]; this.anchor = this.rows[range?.start || 0]?.code || ""; if (!this.rows.slice(range.start, range.end).some(r => r.code === this.selected)) this.selected = ""; this.paint(); } }));
  }
  destroy(): void { this.observer.disconnect(); }
}
