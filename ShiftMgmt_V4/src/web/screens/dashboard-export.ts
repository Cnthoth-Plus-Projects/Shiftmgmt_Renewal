import { dashboardChartInput, dashboardReportInput, type DashboardKey, type DashboardModel } from "./dashboard-model";
import type { DashboardCharts } from "./dashboard-charts";

export class DashboardExport {
  private busy = false;
  private destroyed = false;
  constructor(private root: HTMLElement, private charts: DashboardCharts, private onBusy: (busy: boolean) => void, private onExpired: () => void) {}
  isBusy(): boolean { return this.busy; }
  async run(model: DashboardModel, format: "xlsx" | "pdf", key?: DashboardKey): Promise<void> {
    if (this.busy || this.destroyed || !model.rows.length) return;
    this.busy = true; this.onBusy(true);
    const target = this.root.querySelector<HTMLElement>("#dashboard-export-result")!;
    target.className = "";
    target.textContent = "파일 저장을 준비하고 있습니다…";
    try {
      const snapshot = structuredClone(model);
      const single = key ? dashboardChartInput(snapshot, key) : undefined;
      const report = key ? undefined : dashboardReportInput(snapshot, format);
      if (single) { single.outputFormat = format; single.chartImageDataUrl = this.charts.capture(key!); }
      if (report) for (const s of report.sections) s.chartImageDataUrl = this.charts.capture(s.sectionKey);
      const bridge = window.appBridge; if (!bridge) throw new Error("서버 연결을 확인해 주세요.");
      const result = single ? await bridge.exportDashboardChartData(single) : await bridge.exportDashboardReport(report!);
      if (this.destroyed) return;
      if (!result.ok) {
        if (result.errorCode === "AUTH_SESSION_REQUIRED") { this.onExpired(); return; }
        if (result.errorCode === "EXPORT_CANCELLED") { target.textContent = "파일 저장을 취소했습니다."; return; }
        throw new Error(result.message || "파일을 저장하지 못했습니다.");
      }
      const data = result.data;
      if (!data.outputPath || !data.outputFileName) throw new Error("저장 경로를 확인하지 못했습니다.");
      target.replaceChildren(); const box = document.createElement("div"); box.className = "dashboard-result";
      const title = document.createElement("strong"); title.textContent = `${format.toUpperCase()} 파일을 저장했습니다.`;
      const name = document.createElement("p"); name.textContent = data.outputFileName;
      const path = document.createElement("p"); path.id = "dashboard-output-path"; path.textContent = data.outputPath;
      const count = document.createElement("p"); count.textContent = "rowCount" in data ? `${data.rowCount}행 · ${snapshot.periodLabel}` : `${data.sectionCount}개 영역 · ${snapshot.periodLabel}`;
      const copy = document.createElement("button"); copy.type = "button"; copy.className = "btn-secondary"; copy.id = "dashboard-copy-path"; copy.textContent = "경로 복사";
      copy.addEventListener("click", () => { void navigator.clipboard.writeText(data.outputPath).then(() => { if (!this.destroyed) copy.textContent = "복사했습니다"; }, () => { if (!this.destroyed) copy.textContent = "경로를 선택해 복사해 주세요"; }); });
      const close = document.createElement("button"); close.type = "button"; close.className = "dashboard-action"; close.textContent = "닫기"; close.addEventListener("click", () => { target.replaceChildren(); target.className = ""; });
      box.append(title, name, path, count, copy, close); target.append(box);
    } catch (error) {
      if (!this.destroyed) { target.className = "dashboard-alert dashboard-alert-error"; target.textContent = error instanceof Error ? error.message : "파일 저장 중 오류가 발생했습니다."; }
    } finally { this.busy = false; if (!this.destroyed) { if (!target.querySelector(".dashboard-result") && target.className !== "dashboard-alert dashboard-alert-error") target.className = ""; this.onBusy(false); } }
  }
  destroy(): void { this.destroyed = true; }
}
