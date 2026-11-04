import { WorkforceDialog } from "./workforce-dialog";
import { mountPerformanceModal } from "./performance-actions";
import type { PerformanceApprovalRecord } from "../../shared/domain/performance-file";
import { escapeHtml } from "./performance-view";

export class PerformanceHistoryModal {
  private backdropEl: HTMLElement | null = null;
  private dialog = new WorkforceDialog();

  public show(
    targetLabel: string,
    history: PerformanceApprovalRecord[],
    logicalKey?: string
  ): void {
    this.close();


    // 해당 logicalKey 필터링 또는 전체
    const relevant = logicalKey
      ? history.filter(h => h.logicalKey === logicalKey)
      : history;

    // 최신순 정렬
    const sorted = [...relevant].sort((a, b) =>
      (b.processedAt || "").localeCompare(a.processedAt || "")
    );

    const backdrop = document.createElement("div");
    backdrop.className = "perf-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "perf-history-title");

    backdrop.innerHTML = `
      <div class="perf-modal-dialog wide">
        <div class="perf-modal-header">
          <h3 class="perf-modal-title" id="perf-history-title">승인 및 반려 이력 (${escapeHtml(
            targetLabel
          )})</h3>
          <button type="button" class="perf-modal-close-btn" id="btn-history-close" aria-label="닫기">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="perf-modal-body">
          <table class="perf-table perf-bordered-table">
            <thead>
              <tr class="perf-th-sub">
                <th class="perf-col-140">처리 일시</th>
                <th class="perf-col-80 perf-cell-center">구분</th>
                <th class="perf-col-100">처리자</th>
                <th class="perf-col-100">근무일자</th>
                <th class="perf-col-100">사번 / 이름</th>
                <th>비고 및 사유</th>
              </tr>
            </thead>
            <tbody>
              ${
                sorted.length === 0
                  ? `
                <tr>
                  <td colspan="6" class="perf-cell-empty">
                    기록된 승인 또는 반려 이력이 없습니다.
                  </td>
                </tr>
              `
                  : sorted
                      .map(h => {
                        const isApprove = h.decision === "approved";
                        const badgeClass = isApprove ? "badge-approved" : "badge-rejected";
                        const label = isApprove ? "승인" : "반려";
                        const comment = h.rejectionReason || h.comment || "-";

                        return `
                    <tr>
                      <td class="perf-cell-muted">${escapeHtml(h.processedAt || "-")}</td>
                      <td class="perf-cell-center">
                        <span class="perf-badge ${badgeClass}">${label}</span>
                      </td>
                      <td>${escapeHtml(h.processedByName || h.processedBy || "-")}</td>
                      <td>${escapeHtml(h.workDate || "-")}</td>
                      <td>${escapeHtml(h.employeeCode || "-")} / ${escapeHtml(
                          h.employeeName || "-"
                        )}</td>
                      <td class="perf-word-break">${escapeHtml(comment)}</td>
                    </tr>
                  `;
                      })
                      .join("")
              }
            </tbody>
          </table>
        </div>

        <div class="perf-modal-footer">
          <button type="button" class="perf-btn-secondary" id="btn-history-ok">닫기</button>
        </div>
      </div>
    `;

    this.backdropEl = mountPerformanceModal(backdrop, this.dialog);

    const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-history-close");
    const okBtn = backdrop.querySelector<HTMLButtonElement>("#btn-history-ok");

    closeBtn?.addEventListener("click", () => this.close());
    okBtn?.addEventListener("click", () => this.close());

  }

  public close(): void { this.dialog.close(); this.backdropEl = null; }
}
