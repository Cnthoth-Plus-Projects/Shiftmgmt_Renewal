import { WorkforceDialog } from "./workforce-dialog";
import { mountPerformanceModal } from "./performance-actions";
import type {
  PerformanceFileSyncStateSnapshot,
  PerformanceQueueItem,
  PerformanceStartupRecoveryStatusSnapshot
} from "../../shared/domain/performance-file";
import { escapeHtml } from "./performance-view";
import { summarizeIntakeIssues } from "./performance-intake-issues";

export interface PerformanceWatchStatusInfo {
  isWatching: boolean | null;
  message?: string;
  issues?: string[];
  watchFolder?: string;
  autoProcess?: boolean;
}

export interface PerformanceIntakeCallbacks {
  onRetryRecovery: () => Promise<void>;
  onSelectFile?: (file: PerformanceQueueItem) => void;
}

export class PerformanceIntakeModal {
  private backdropEl: HTMLElement | null = null;
  private dialog = new WorkforceDialog();

  public show(
    syncState: PerformanceFileSyncStateSnapshot | null,
    recoveryStatus: PerformanceStartupRecoveryStatusSnapshot | null,
    pendingFiles: PerformanceQueueItem[],
    watchStatus: PerformanceWatchStatusInfo | null,
    callbacks: PerformanceIntakeCallbacks
  ): void {
    this.close();


    const backdrop = document.createElement("div");
    backdrop.className = "perf-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "perf-intake-title");

    const isWatching = watchStatus?.isWatching ?? false;
    const watchFolder = watchStatus?.watchFolder || "기본 대기 폴더";
    const syncStatusText =
      syncState?.status === "scanning" || syncState?.status === "parsing"
        ? "읽는 중..."
        : "대기 중";
    const processed = syncState?.processedCount ?? 0;
    const total = syncState?.totalCount ?? 0;
    const currentFile = syncState?.currentFileName || "-";
    const issues = summarizeIntakeIssues([...(recoveryStatus?.issues || []), ...(watchStatus?.issues || [])]);

    backdrop.innerHTML = `
      <div class="perf-modal-dialog wide">
        <div class="perf-modal-header">
          <h3 class="perf-modal-title" id="perf-intake-title">실적 접수 및 감시 현황</h3>
          <button type="button" class="perf-modal-close-btn" id="btn-intake-close" aria-label="닫기">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="perf-modal-body">
          <!-- 감시 상태 요약 (감시 켜짐과 읽기 진행 분리) -->
          <div class="perf-detail-section">
            <div class="perf-detail-section-title">폴더 감시 및 동기화 상태</div>
            <div class="perf-detail-grid">
              <span class="perf-detail-label">폴더 감시</span>
              <span class="perf-detail-value">
                <strong>${escapeHtml(watchStatus?.message || (isWatching ? "감시 실행 중" : watchStatus?.isWatching === false ? "감시 정지" : "관리자만 조회할 수 있습니다"))}</strong>
                <span class="perf-cell-muted">(${escapeHtml(watchFolder)})</span>
              </span>

              <span class="perf-detail-label">읽기 진행</span>
              <span class="perf-detail-value"><strong>${escapeHtml(syncStatusText)}</strong></span>

              <span class="perf-detail-label">처리 진행 건수</span>
              <span class="perf-detail-value">${processed} / ${total} 파일</span>

              <span class="perf-detail-label">현재 처리 파일</span>
              <span class="perf-detail-value">${escapeHtml(currentFile)}</span>

              <span class="perf-detail-label">메시지</span>
              <span class="perf-detail-value">${escapeHtml(syncState?.message || "-")}</span>
            </div>
          </div>

          <!-- 시작 복구 상태 -->
          ${
            recoveryStatus
              ? `
            <div class="perf-detail-section">
              <div class="perf-detail-section-title">시작 자동 복구 상태</div>
              <div class="perf-detail-grid">
                <span class="perf-detail-label">실행 여부</span>
                <span class="perf-detail-value">${recoveryStatus.hasRun ? "완료" : "미실행"} (${escapeHtml(
                  recoveryStatus.completedAt || "-"
                )})</span>

                <span class="perf-detail-label">복원 스케줄</span>
                <span class="perf-detail-value">${recoveryStatus.restoredScheduleCount}건 복원 / ${
                  recoveryStatus.skippedScheduleCount
                }건 건너뜀</span>

              </div>
            </div>
          `
              : ""
          }

          ${issues.missing.length ? `<section class="perf-source-notice" aria-label="원본 엑셀 확인 필요">
            <div class="perf-source-notice-heading"><span class="material-symbols-outlined" aria-hidden="true">folder_off</span><strong>원본 엑셀 확인 필요</strong><span class="perf-source-count">${issues.missing.length}개 항목</span></div>
            <p>실적 기록은 있지만 이 PC에서 원본 엑셀을 찾지 못했습니다. 저장된 실적·승인·수당 기록은 그대로 유지됩니다.</p>
            <p class="perf-source-next">원본을 확인해야 한다면 이전 PC나 별도 백업에서 엑셀을 찾아 주세요. 아래 목록에서 해당 근무지와 근무월을 확인할 수 있습니다.</p>
            <details class="perf-source-details"><summary>대상 목록 보기 (${issues.missing.length}개)</summary><div class="perf-source-list"><table class="perf-table"><thead><tr><th>근무지·근무월</th><th>확인할 내용</th></tr></thead><tbody>${issues.missing.map(issue => `<tr><td title="${escapeHtml(issue.message)}">${escapeHtml(issue.label)}</td><td>별도 보관한 원본 엑셀 확인</td></tr>`).join("")}</tbody></table></div></details>
          </section>` : ""}
          ${issues.other.length ? `<details class="perf-intake-other-issues"><summary>그 밖의 확인 사항 (${issues.other.length}건)</summary><ul>${issues.other.map(issue => `<li>${escapeHtml(issue)}</li>`).join("")}</ul></details>` : ""}
          <!-- 현재 범위 원본 파일 목록 -->
          <div class="perf-detail-section">
            <div class="perf-detail-section-title">현재 범위 원본 파일 목록 (${pendingFiles.length}건)</div>
            <table class="perf-table perf-bordered-table">
              <thead>
                <tr class="perf-th-sub">
                  <th>파일명</th>
                  <th class="perf-col-100">근무월</th>
                  <th class="perf-col-110">근무지</th>
                  <th class="perf-col-80 perf-cell-right">행 수</th>
                  <th class="perf-col-140">수신 시각</th>
                  <th class="perf-col-80 perf-cell-center">선택</th>
                </tr>
              </thead>
              <tbody>
                ${
                  pendingFiles.length === 0
                    ? `
                  <tr>
                    <td colspan="6" class="perf-cell-empty">
                      대기 중인 엑셀 파일이 없습니다.
                    </td>
                  </tr>
                `
                    : pendingFiles
                        .map(
                          (f, idx) => `
                    <tr>
                      <td><strong>${escapeHtml(f.fileName)}</strong></td>
                      <td>${escapeHtml(f.scheduleMonth || "-")}</td>
                      <td>${escapeHtml(f.siteName || "-")}</td>
                      <td class="perf-cell-right">${f.entryCount}행</td>
                      <td class="perf-cell-muted">${escapeHtml(f.receivedAt || "-")}</td>
                      <td class="perf-cell-center">
                        <button type="button" class="perf-btn-secondary perf-btn-select-file" data-idx="${idx}" title="해당 파일의 실적으로 필터 이동">선택</button>
                      </td>
                    </tr>
                  `
                        )
                        .join("")
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="perf-modal-footer">
          <button type="button" class="perf-btn-secondary" id="btn-intake-retry-recovery">복구 재시도</button>
          <button type="button" class="perf-btn-secondary" id="btn-intake-ok">닫기</button>
        </div>
      </div>
    `;

    this.backdropEl = mountPerformanceModal(backdrop, this.dialog);

    const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-intake-close");
    const okBtn = backdrop.querySelector<HTMLButtonElement>("#btn-intake-ok");
    const retryBtn = backdrop.querySelector<HTMLButtonElement>("#btn-intake-retry-recovery");

    closeBtn?.addEventListener("click", () => this.close());
    okBtn?.addEventListener("click", () => this.close());
    retryBtn?.addEventListener("click", async () => {
      retryBtn.disabled = true;
      this.dialog.setProcessing(true);
      try {
        await callbacks.onRetryRecovery();
        this.close();
      } finally {
        retryBtn.disabled = false;
        this.dialog.setProcessing(false);
      }
    });

    const selectBtns = backdrop.querySelectorAll<HTMLButtonElement>(".perf-btn-select-file");
    selectBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const file = pendingFiles[idx];
        if (file && callbacks.onSelectFile) {
          callbacks.onSelectFile(file);
          this.close();
        }
      });
    });

  }

  public close(): void { this.dialog.close(); this.backdropEl = null; }
}
