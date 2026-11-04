import { WorkforceDialog } from "./workforce-dialog";
import { mountPerformanceModal } from "./performance-actions";
import type { PerformanceComparisonDetail } from "../../shared/domain/performance-file";
import { formatCurrencyOrUnsaved, formatMinutesToHours } from "./performance-model";
import { escapeHtml } from "./performance-view";

export class PerformanceComparisonModal {
  private backdropEl: HTMLElement | null = null;
  private dialog = new WorkforceDialog();

  public show(detail: PerformanceComparisonDetail): void {
    this.close();


    const current = detail.currentEntry;
    const approved = detail.approvedEntry;
    const approvedCalc = detail.approvedCalculation;

    const diff = (a: unknown, b: unknown) => {
      const isDiff = a !== b && approved !== null;
      return isDiff ? 'class="perf-diff-changed"' : "";
    };

    const curTime = `${current.startTime || "-"} ~ ${current.endTime || "-"}`;
    const appTime = approved ? `${approved.startTime || "-"} ~ ${approved.endTime || "-"}` : "-";

    const backdrop = document.createElement("div");
    backdrop.className = "perf-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "perf-compare-title");

    backdrop.innerHTML = `
      <div class="perf-modal-dialog wide">
        <div class="perf-modal-header">
          <h3 class="perf-modal-title" id="perf-compare-title">실적 차이 비교 (현재 실적 vs 승인본)</h3>
          <button type="button" class="perf-modal-close-btn" id="btn-compare-close" aria-label="닫기">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="perf-modal-body">
          <div class="perf-sub-target-info">
            대상: <strong>${escapeHtml(current.employeeName)}</strong> (${escapeHtml(
      current.employeeCode
    )}) | ${escapeHtml(current.workDate)} | ${escapeHtml(current.siteName)}
          </div>

          <table class="perf-table perf-bordered-table">
            <thead>
              <tr class="perf-th-sub">
                <th class="perf-col-140">항목</th>
                <th>현재 실적 (대기본)</th>
                <th>기존 승인본</th>
                <th class="perf-col-80 perf-cell-center">차이 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>근무 시간</strong></td>
                <td><span ${diff(curTime, appTime)}>${escapeHtml(curTime)}</span></td>
                <td>${escapeHtml(appTime)}</td>
                <td class="perf-cell-center">${curTime !== appTime && approved ? "변경" : "-"}</td>
              </tr>
              <tr>
                <td><strong>총 근로분</strong></td>
                <td><span ${diff(current.totalWorkMinutes, approved?.totalWorkMinutes)}>${
      current.totalWorkMinutes
    }분 (${formatMinutesToHours(current.totalWorkMinutes)})</span></td>
                <td>${
                  approved
                    ? `${approved.totalWorkMinutes}분 (${formatMinutesToHours(
                        approved.totalWorkMinutes
                      )})`
                    : "-"
                }</td>
                <td class="perf-cell-center">${
                  current.totalWorkMinutes !== approved?.totalWorkMinutes && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>기본 근로분</strong></td>
                <td><span ${diff(current.baseWorkMinutes, approved?.baseWorkMinutes)}>${
      current.baseWorkMinutes
    }분</span></td>
                <td>${approved ? `${approved.baseWorkMinutes}분` : "-"}</td>
                <td class="perf-cell-center">${
                  current.baseWorkMinutes !== approved?.baseWorkMinutes && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>연장 근로분</strong></td>
                <td><span ${diff(current.overtimeMinutes, approved?.overtimeMinutes)}>${
      current.overtimeMinutes
    }분</span></td>
                <td>${approved ? `${approved.overtimeMinutes}분` : "-"}</td>
                <td class="perf-cell-center">${
                  current.overtimeMinutes !== approved?.overtimeMinutes && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>야간 근로분</strong></td>
                <td><span ${diff(current.nightMinutes, approved?.nightMinutes)}>${
      current.nightMinutes
    }분</span></td>
                <td>${approved ? `${approved.nightMinutes}분` : "-"}</td>
                <td class="perf-cell-center">${
                  current.nightMinutes !== approved?.nightMinutes && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>휴게 시간</strong></td>
                <td><span ${diff(current.breakMinutes, approved?.breakMinutes)}>${
      current.breakMinutes
    }분</span></td>
                <td>${approved ? `${approved.breakMinutes}분` : "-"}</td>
                <td class="perf-cell-center">${
                  current.breakMinutes !== approved?.breakMinutes && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>적용 시급</strong></td>
                <td><span ${diff(current.hourlyRate, approved?.hourlyRate)}>${
      current.hourlyRate ? `${current.hourlyRate.toLocaleString()}원` : "미설정"
    }</span></td>
                <td>${approved?.hourlyRate ? `${approved.hourlyRate.toLocaleString()}원` : "-"}</td>
                <td class="perf-cell-center">${
                  current.hourlyRate !== approved?.hourlyRate && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>사유</strong></td>
                <td><span ${diff(current.reason, approved?.reason)}>${escapeHtml(
      current.reason || "-"
    )}</span></td>
                <td>${escapeHtml(approved?.reason || "-")}</td>
                <td class="perf-cell-center">${
                  current.reason !== approved?.reason && approved ? "변경" : "-"
                }</td>
              </tr>
              <tr>
                <td><strong>저장 수당</strong></td>
                <td>저장 전 (승인 시 계산)</td>
                <td><strong>${formatCurrencyOrUnsaved(
                  approvedCalc?.snapshot?.totalAllowanceAmount,
                  Boolean(approvedCalc)
                )}</strong></td>
                <td class="perf-cell-center">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="perf-modal-footer">
          <button type="button" class="perf-btn-secondary" id="btn-compare-ok">닫기</button>
        </div>
      </div>
    `;

    this.backdropEl = mountPerformanceModal(backdrop, this.dialog);

    const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-compare-close");
    const okBtn = backdrop.querySelector<HTMLButtonElement>("#btn-compare-ok");

    closeBtn?.addEventListener("click", () => this.close());
    okBtn?.addEventListener("click", () => this.close());

  }

  public close(): void { this.dialog.close(); this.backdropEl = null; }
}
