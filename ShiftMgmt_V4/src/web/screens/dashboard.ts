import type { AuthSession } from "../../shared/domain/model";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import { buildDashboardModel, defaultDashboardFilter, type DashboardFilter, type DashboardKey, type DashboardModel } from "./dashboard-model";
import { dashboardLayout, dashboardFilters, dashboardKpis } from "./dashboard-view";
import { DashboardCharts } from "./dashboard-charts";
import { DashboardRanking } from "./dashboard-ranking";
import { DashboardExport } from "./dashboard-export";

export interface DashboardScreenOptions { container: HTMLElement; session: AuthSession; onSessionExpired?: () => void }
export class DashboardScreen {
  private root!: HTMLElement;
  private charts!: DashboardCharts;
  private ranking!: DashboardRanking;
  private exporter!: DashboardExport;
  private destroyed = false;
  private generation = 0;
  private expired = false;
  private loading = false;
  private error = "";
  private source: AllowanceCalculationResultRecord[] = [];
  private filter: DashboardFilter | null = null;
  private model: DashboardModel | null = null;
  private sort: "amount" | "minutes" = "amount";
  private filtersOpen = false;
  constructor(private options: DashboardScreenOptions) {}
  async render(): Promise<void> {
    dashboardLayout(this.options.container); this.root = this.options.container.querySelector<HTMLElement>("#dashboard-root")!;
    this.charts = new DashboardCharts(this.root); this.ranking = new DashboardRanking(this.root.querySelector("#dashboard-ranking")!);
    this.exporter = new DashboardExport(this.root, this.charts, () => this.syncBusy(), () => this.sessionExpired());
    this.root.addEventListener("click", e => this.click(e)); this.root.addEventListener("change", e => this.change(e));
    this.root.addEventListener("keydown", e => { if (e.key !== "Escape") return; const details = this.root.querySelector<HTMLDetailsElement>("details[open]"); if (details) { details.open = false; details.querySelector<HTMLElement>("summary")?.focus(); e.stopPropagation(); } else if (this.filtersOpen) { this.filtersOpen = false; this.syncFilters(); this.root.querySelector<HTMLElement>("#dashboard-filter-toggle")?.focus(); } });
    await this.load();
  }
  isBusy(): boolean { return this.exporter?.isBusy() || false; }
  private sessionExpired(): void { if (this.destroyed || this.expired) return; this.expired = true; this.destroy(); this.options.onSessionExpired?.(); }
  private async load(): Promise<void> {
    if (this.destroyed || this.loading || this.isBusy()) return;
    const generation = ++this.generation; this.loading = true; this.error = ""; this.notice("산출 자료를 불러오는 중입니다…"); this.syncBusy();
    try {
      const bridge = window.appBridge; if (!bridge) throw new Error("서버 연결을 확인해 주세요.");
      const result = await bridge.listCalculationResults();
      if (this.destroyed || generation !== this.generation) return;
      if (!result.ok) { if (result.errorCode === "AUTH_SESSION_REQUIRED") { this.sessionExpired(); return; } throw new Error(result.message || "산출 자료를 조회하지 못했습니다."); }
      const nextFilter = this.filter || defaultDashboardFilter(result.data);
      const next = buildDashboardModel(result.data, nextFilter);
      this.source = result.data; this.filter = nextFilter; this.model = next; this.renderModel(false);
      this.notice(next.rows.length ? `${next.periodLabel} · ${next.rows.length}건의 저장된 계산 결과` : "해당 조건의 산출 내역이 없습니다. 기간과 필터를 확인해 주세요.", !next.rows.length ? "empty" : "");
    } catch (error) {
      if (!this.destroyed && generation === this.generation) { this.error = error instanceof Error ? error.message : "산출 자료를 조회하지 못했습니다."; this.notice(`${this.error}${this.model ? " 이전 조회 자료입니다. 새로고침 후 출력해 주세요." : " 새로고침으로 다시 시도해 주세요."}`, "error");
        if (!this.model) { const blank = buildDashboardModel([], defaultDashboardFilter([])); dashboardFilters(this.root.querySelector("#dashboard-filters")!, blank); }
      }
    } finally { if (!this.destroyed && generation === this.generation) { this.loading = false; this.syncBusy(); } }
  }
  private renderModel(reset: boolean): void {
    if (!this.model || this.destroyed) return;
    const rows = [...this.model.ranking].sort((a, b) => (this.sort === "minutes" ? b.workMinutes - a.workMinutes : b.totalAmount - a.totalAmount) || a.code.localeCompare(b.code));
    this.model = { ...this.model, ranking: rows };
    dashboardFilters(this.root.querySelector("#dashboard-filters")!, this.model); dashboardKpis(this.root.querySelector("#dashboard-kpis")!, this.model);
    this.syncFilters();
    this.charts.render(this.model); this.ranking.render(this.model, reset);
    this.root.querySelector<HTMLSelectElement>("#dashboard-rank-sort")!.value = this.sort;
    this.syncBusy();
  }
  private notice(text: string, type = ""): void { const e = this.root.querySelector<HTMLElement>("#dashboard-notice")!; e.className = `dashboard-alert${type ? ` dashboard-alert-${type}` : ""}`; e.textContent = text; if (type === "error") e.setAttribute("role", "alert"); else e.setAttribute("role", "status"); }
  private syncBusy(): void {
    if (this.destroyed) return;
    const busy = this.loading || this.isBusy(); this.root.setAttribute("aria-busy", String(busy)); this.root.dataset.loading = String(this.loading);
    this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button,select").forEach(e => {
      const refresh = e.id === "dashboard-refresh";
      e.disabled = busy || (!!this.error && !refresh) || ((!this.model?.rows.length) && (e.hasAttribute("data-export") || e.hasAttribute("data-report")));
    });
  }
  private click(e: Event): void {
    const target = e.target as Element;
    const button = target.closest<HTMLButtonElement>("button");
    if (this.filtersOpen && !target.closest(".dashboard-filter-inline") && button?.id !== "dashboard-filter-toggle") { this.filtersOpen = false; this.syncFilters(); }
    if (!button || button.disabled || this.loading || this.isBusy()) return;
    if (button.id === "dashboard-filter-toggle") { this.filtersOpen = !this.filtersOpen; this.syncFilters(); if (this.filtersOpen) this.root.querySelector<HTMLElement>("#dashboard-site")?.focus(); return; }
    if (button.id === "dashboard-refresh") { void this.load(); return; }
    if (button.id === "dashboard-reset") { try { this.filter = defaultDashboardFilter(this.source); this.model = buildDashboardModel(this.source, this.filter); this.renderModel(true); this.notice(`${this.model.periodLabel} · 필터를 초기화했습니다.`); } catch (error) { this.error = String(error); this.notice(this.error, "error"); this.syncBusy(); } return; }
    if (this.error || !this.model) return;
    const format = button.dataset.format || button.dataset.report;
    if (format === "xlsx" || format === "pdf") void this.exporter.run(this.model, format, button.dataset.export as DashboardKey | undefined);
  }
  private syncFilters(): void { this.root.querySelector("#dashboard-filters")?.classList.toggle("is-filter-open", this.filtersOpen); this.root.querySelector("#dashboard-filter-toggle")?.setAttribute("aria-expanded", String(this.filtersOpen)); }
  private change(e: Event): void {
    const select = e.target as HTMLSelectElement; if (this.loading || this.isBusy() || this.error || !this.filter || !this.model) return;
    if (select.id === "dashboard-rank-sort") { this.sort = select.value === "minutes" ? "minutes" : "amount"; this.renderModel(true); return; }
    const key = select.dataset.filter as keyof DashboardFilter | undefined;
    if (!key || !["year", "month", "site", "employee", "category"].includes(key)) return;
    try { this.filter = { ...this.filter, [key]: select.value }; this.model = buildDashboardModel(this.source, this.filter); this.renderModel(true); this.notice(this.model.rows.length ? `${this.model.periodLabel} · ${this.model.rows.length}건의 저장된 계산 결과` : "해당 조건의 산출 내역이 없습니다.", this.model.rows.length ? "" : "empty"); this.root.querySelector<HTMLElement>(`#${select.id}`)?.focus(); }
    catch (error) { this.error = error instanceof Error ? error.message : "필터를 확인해 주세요."; this.notice(this.error, "error"); this.syncBusy(); }
  }
  destroy(): void { if (this.destroyed) return; this.destroyed = true; ++this.generation; this.charts?.destroy(); this.ranking?.destroy(); this.exporter?.destroy(); }
}
