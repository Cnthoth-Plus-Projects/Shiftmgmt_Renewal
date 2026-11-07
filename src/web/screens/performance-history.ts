import { WorkforceDialog } from "./workforce-dialog";
import { mountPerformanceModal } from "./performance-actions";
import type { PerformanceApprovalRecord } from "../../shared/domain/performance-file";
import type { PerformanceFileDetail, PerformanceCancellationHistoryRecord } from "../../shared/domain/performance-file";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type { BridgeResult } from "../../shared/bridge/contracts";
import { parsePolicyApplicationSnapshot, POLICY_KIND_LABELS } from "../../shared/domain/policy-history";
import { allowanceRateAxisLabels, type AllowanceRateAxis } from "../../shared/domain/allowance-rate-matrix";
import { escapeHtml } from "./performance-view";

const historyTime = (value: string): string => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date) : value;
};

export class PerformanceHistoryModal {
  private backdropEl: HTMLElement | null = null;
  private dialog = new WorkforceDialog();

  public show(
    targetLabel: string,
    history: PerformanceApprovalRecord[],
    logicalKey?: string,
    cancellation?: { fileId: string; load: () => Promise<BridgeResult<PerformanceFileDetail | null>>; currentCalculation: AllowanceCalculationResultRecord | null }
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
          <h3 class="perf-modal-title" id="perf-history-title">처리 이력 (${escapeHtml(
            targetLabel
          )})</h3>
          <button type="button" class="perf-modal-close-btn" id="btn-history-close" aria-label="닫기">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="perf-modal-body">
          <table class="perf-table perf-bordered-table perf-history-approvals">
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
                      <td class="perf-cell-muted perf-history-stamp">${escapeHtml(historyTime(h.processedAt || "-"))}</td>
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
    this.backdropEl.querySelector(".workforce-modal-box")?.classList.add("perf-history-dialog");

    const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-history-close");
    const okBtn = backdrop.querySelector<HTMLButtonElement>("#btn-history-ok");

    closeBtn?.addEventListener("click", () => this.close());
    okBtn?.addEventListener("click", () => this.close());

    if (cancellation) {
      const body = backdrop.querySelector(".perf-modal-body")!;
      const section = document.createElement("section");
      section.className = "perf-cancellation-history";
      const heading = document.createElement("h4");
      heading.textContent = "승인대기 복귀 · 취소 전 기록";
      const current = document.createElement("p");
      current.textContent = cancellation.currentCalculation
        ? `현재 유효한 계산: ${cancellation.currentCalculation.snapshot.totalAllowanceAmount.toLocaleString("ko-KR")}원 · ${cancellation.currentCalculation.rateVersionLabel}`
        : "현재 이 행에 유효한 계산이 없습니다. 취소 전 금액은 지급 합계에 포함되지 않습니다.";
      const content = document.createElement("div");
      content.setAttribute("role", "status");
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "perf-btn-secondary"; retry.textContent = "취소 이력 다시 조회"; retry.hidden = true;
      section.append(heading, current, content, retry);
      body.append(section);
      const token = this.dialog.captureToken();
      let sequence = 0;
      const load = async () => {
        const request = ++sequence;
        retry.hidden = true; retry.disabled = true;
        content.textContent = "취소 전 기록을 불러오고 있습니다…";
        try {
          const result = await cancellation.load();
          if (!this.dialog.isCurrent(token) || request !== sequence) return;
          if (!result.ok) throw Error(result.message);
          if (!result.data) throw Error("실적 파일을 찾지 못했습니다. 화면을 새로 조회해 주세요.");
          const relevant = (result.data.cancellationHistory || []).filter(event => event.entries.some(entry => !logicalKey || entry.logicalKey === logicalKey) || !event.entries.length && event.fileId === cancellation.fileId);
          content.innerHTML = relevant.length ? relevant.map(event => this.renderCancellation(event, logicalKey)).join("") : '<p class="perf-cell-muted">보관된 취소 이력이 없습니다. 이 기능 적용 전의 취소 기록은 새로 만들어지지 않습니다.</p>';
        } catch (error) {
          if (!this.dialog.isCurrent(token) || request !== sequence) return;
          content.textContent = error instanceof Error ? error.message : "취소 이력을 불러오지 못했습니다.";
          retry.hidden = false;
        } finally { if (this.dialog.isCurrent(token) && request === sequence) retry.disabled = false; }
      };
      retry.addEventListener("click", () => { void load(); });
      void load();
    }

  }

  private renderCancellation(event: PerformanceCancellationHistoryRecord, logicalKey?: string): string {
    const entries = event.entries.filter(entry => !logicalKey || entry.logicalKey === logicalKey);
    const total = entries.flatMap(entry => entry.calculations).reduce((sum, calc) => sum + calc.totalAmount, 0);
    const date = (value: string) => escapeHtml(historyTime(value));
    const rows = entries.map(entry => {
      let policy = "당시 정책 기록 없음";
      try {
        const snapshot = JSON.parse(entry.approvalSnapshotJson || "null");
        const application = parsePolicyApplicationSnapshot(snapshot?.entry?.appliedPolicies);
        if (application?.bindings.length) policy = application.bindings.map(binding => `${POLICY_KIND_LABELS[binding.kind]} v${binding.versionNumber} · ${binding.criteriaSummary}`).join(" / ");
        else if (typeof snapshot?.entry?.substituteAllowancePolicyVersion === "string") policy = snapshot.entry.substituteAllowancePolicyVersion;
      } catch { /* Keep the historical missing/corrupt snapshot visible as unavailable. */ }
      const calculations = entry.calculations.map(calc => `<div class="perf-cancel-calculation"><strong>${calc.totalAmount.toLocaleString("ko-KR")}원</strong> · 시급 ${calc.hourlyRate.toLocaleString("ko-KR")}원 · 요율 ${escapeHtml(calc.rateVersionLabel)}<ul>${calc.items.map(item => `<li>${escapeHtml(allowanceRateAxisLabels[item.allowanceCode as AllowanceRateAxis] || item.allowanceCode)} · ${item.workMinutes}분 × ${item.multiplier}배 · ${item.amount.toLocaleString("ko-KR")}원</li>`).join("")}</ul>${calc.reviews.map(review => `<p>당시 검토: ${escapeHtml(({approved:"승인",rejected:"반려",pending:"검토 대기"} as Record<string,string>)[review.decision] || review.decision)} · ${escapeHtml(review.processedBy)} · ${date(review.processedAt)} · ${escapeHtml(review.comment || "사유 없음")}</p>`).join("")}</div>`).join("") || "당시 계산 기록 없음";
      return `<article class="perf-cancel-entry"><div class="perf-cancel-identity"><strong>${escapeHtml(entry.employeeCode)} / ${escapeHtml(entry.employeeName)}</strong><span>${escapeHtml(entry.workDate)}</span></div><p class="perf-cancel-approval">당시 승인: ${escapeHtml(entry.approvedBy)} · ${date(entry.approvedAt)}</p><div class="perf-cancel-values">${calculations}<p>적용 정책: ${escapeHtml(policy)}</p></div></article>`;
    }).join("");
    return `<details class="perf-cancel-event"><summary><span class="perf-badge badge-rejected">승인 취소</span> ${date(event.occurredAt)} · ${escapeHtml(event.actorName)} · ${entries.length}건 · ${total.toLocaleString("ko-KR")}원</summary><p class="perf-cancel-reason">복귀 사유: ${escapeHtml(event.reason)}</p><p>원본: ${escapeHtml(event.fileName)}</p>${rows || '<p>이 파일에 보관된 개별 승인 기록이 없습니다.</p>'}</details>`;
  }

  public close(): void { this.dialog.close(); this.backdropEl = null; }
}
