import type { BrowserAppBridge } from "../bridge/app-bridge";
import type { PerformanceOverviewRow } from "../../shared/domain/performance-file";
import { escapeHtml } from "./performance-view";
import { WorkforceDialog } from "./workforce-dialog";

export function mountPerformanceModal(content: HTMLElement, dialog: WorkforceDialog, onClose?: () => void): HTMLElement {
  const box = content.querySelector<HTMLElement>(".perf-modal-dialog")!;
  const heading = box.querySelector<HTMLElement>(".perf-modal-title");
  const title = heading?.textContent || "실적 안내";
  const titleId = heading?.id;
  const wide = box.classList.contains("wide");
  box.querySelector(".perf-modal-header")?.remove();
  content.replaceChildren(...Array.from(box.childNodes));
  content.className = "perf-dialog-content";
  content.removeAttribute("role"); content.removeAttribute("aria-modal"); content.removeAttribute("aria-labelledby");
  const overlay = dialog.open({id: "performance-dialog", title, content, width: wide ? "960px" : "620px", onClose});
  overlay.classList.add("perf-modal-backdrop");
  overlay.querySelector(".workforce-modal-box")?.classList.add("perf-modal-dialog");
  overlay.querySelector(".workforce-modal-footer")?.classList.add("wf-hidden");
  if (titleId) { const h = overlay.querySelector(".workforce-modal-title"); if(h) {h.id=titleId;overlay.setAttribute("aria-labelledby",titleId);} }
  return overlay;
}

export class PerformanceActionManager {
  private bridge: BrowserAppBridge;
  private isBusy = false;
  private dialog = new WorkforceDialog();
  private isDestroyed = false;
  private activeModals: Array<{ backdrop: HTMLElement; cleanup: () => void }> = [];

  constructor(bridge: BrowserAppBridge) {
    this.bridge = bridge;
  }

  public getBusy(): boolean {
    return this.isBusy;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.closeAll();
  }

  public closeAll(): void {
    while (this.activeModals.length > 0) {
      const modal = this.activeModals.pop();
      modal?.cleanup();
    }
    this.isBusy = false;
    this.dialog.setProcessing(false);
  }

  private setupModalTrap(backdrop: HTMLElement, onEsc: () => void): () => void {
    let closing = false;
    mountPerformanceModal(backdrop, this.dialog, () => { if (!closing) onEsc(); });
    return () => { closing = true; this.dialog.close(); };
  }

  /** 공지/알림 모달 (alert 대체) */
  public async promptNotice(title: string, message: string): Promise<void> {
    if (this.isDestroyed) return;

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "perf-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      backdrop.innerHTML = `
        <div class="perf-modal-dialog">
          <div class="perf-modal-header">
            <h3 class="perf-modal-title">${escapeHtml(title)}</h3>
            <button type="button" class="perf-modal-close-btn" id="btn-notice-close">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
          <div class="perf-modal-body">
            <div class="perf-modal-desc">${escapeHtml(message)}</div>
          </div>
          <div class="perf-modal-footer">
            <button type="button" class="perf-btn-primary" id="btn-notice-confirm">확인</button>
          </div>
        </div>
      `;

      let cleaned = false;
      let removeTrap: (() => void) | null = null;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeTrap?.();
        backdrop.remove();
        const idx = this.activeModals.findIndex(m => m.backdrop === backdrop);
        if (idx !== -1) this.activeModals.splice(idx, 1);
        resolve();
      };

      removeTrap = this.setupModalTrap(backdrop, cleanup);
      this.activeModals.push({ backdrop, cleanup });


      backdrop.querySelector("#btn-notice-close")?.addEventListener("click", cleanup);
      backdrop.querySelector("#btn-notice-confirm")?.addEventListener("click", cleanup);
    });
  }

  /** 행 단위 승인 모달 (D03: 기존 시급은 읽기 전용, 명시 체크 시에만 수동 시급 전송) */
  public async promptApprove(
    row: PerformanceOverviewRow,
    onSuccess: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed) return;

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "perf-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      const entry = row.entry;
      const currentRateText = entry.hourlyRate
        ? `${entry.hourlyRate.toLocaleString("ko-KR")}원 (근무일 기준)`
        : "기본 시급 미설정";

      backdrop.innerHTML = `
        <div class="perf-modal-dialog">
          <div class="perf-modal-header">
            <h3 class="perf-modal-title">실적 승인 확인</h3>
            <button type="button" class="perf-modal-close-btn" id="btn-modal-close">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="perf-modal-body">
            <div class="perf-modal-desc">
              다음 실적을 승인하시겠습니까? 승인 시 수당 계산이 원자적으로 함께 저장됩니다.<br><br>
              - <strong>대상자:</strong> ${escapeHtml(entry.employeeName)} (${escapeHtml(
        entry.employeeCode
      )})<br>
              - <strong>근무일자:</strong> ${escapeHtml(entry.workDate)} (${escapeHtml(
        entry.workType
      )})<br>
              - <strong>기존 시급:</strong> <span id="perf-approve-current-rate">${escapeHtml(
                currentRateText
              )}</span><br>
              - <strong>총 근로:</strong> ${entry.totalWorkMinutes}분 (기본 ${
        entry.baseWorkMinutes
      }분 / 연장 ${entry.overtimeMinutes}분 / 야간 ${entry.nightMinutes}분)
            </div>

            <div class="perf-modal-field-group">
              <label class="perf-modal-checkbox-label" for="perf-manual-rate-toggle">
                <input type="checkbox" id="perf-manual-rate-toggle" class="perf-checkbox">
                <span>시급 수동 지정 (기본 시급 대신 새 시급을 명시적으로 적용할 경우에만 선택)</span>
              </label>
            </div>

            <div class="perf-modal-field-group" id="perf-manual-rate-group" hidden>
              <label for="perf-approve-rate" class="perf-modal-label">
                수동 지정 시급 (원)
              </label>
              <input type="number" id="perf-approve-rate" class="perf-input" placeholder="예: 11000" min="1" step="100" disabled>
            </div>

            <div class="perf-modal-field-group">
              <label for="perf-approve-comment" class="perf-modal-label">
                승인 비고 (선택 사항)
              </label>
              <input type="text" id="perf-approve-comment" class="perf-input" placeholder="비고 입력">
            </div>

            <div id="perf-approve-error" class="perf-modal-error" hidden></div>
          </div>

          <div class="perf-modal-footer">
            <button type="button" class="perf-btn-secondary" id="btn-modal-cancel">취소</button>
            <button type="button" class="perf-btn-primary" id="btn-modal-confirm">승인</button>
          </div>
        </div>
      `;

      let cleaned = false;
      let removeTrap: (() => void) | null = null;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeTrap?.();
        backdrop.remove();
        const idx = this.activeModals.findIndex(m => m.backdrop === backdrop);
        if (idx !== -1) this.activeModals.splice(idx, 1);
        resolve();
      };

      removeTrap = this.setupModalTrap(backdrop, cleanup);
      this.activeModals.push({ backdrop, cleanup });


      const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-modal-close");
      const cancelBtn = backdrop.querySelector<HTMLButtonElement>("#btn-modal-cancel");
      const confirmBtn = backdrop.querySelector<HTMLButtonElement>("#btn-modal-confirm");
      const rateToggle = backdrop.querySelector<HTMLInputElement>("#perf-manual-rate-toggle");
      const rateGroup = backdrop.querySelector<HTMLElement>("#perf-manual-rate-group");
      const rateInput = backdrop.querySelector<HTMLInputElement>("#perf-approve-rate");
      const commentInput = backdrop.querySelector<HTMLInputElement>("#perf-approve-comment");
      const errorDiv = backdrop.querySelector<HTMLElement>("#perf-approve-error");

      rateToggle?.addEventListener("change", () => {
        const isChecked = rateToggle.checked;
        if (rateGroup) rateGroup.hidden = !isChecked;
        if (rateInput) {
          rateInput.disabled = !isChecked;
          if (isChecked) {
            rateInput.focus();
          } else {
            rateInput.value = "";
          }
        }
      });

      closeBtn?.addEventListener("click", cleanup);
      cancelBtn?.addEventListener("click", cleanup);

      confirmBtn?.addEventListener("click", async () => {
        if (this.isDestroyed) {
          cleanup();
          return;
        }

        let manualRate: number | undefined = undefined;
        if (rateToggle?.checked) {
          const rawVal = rateInput?.value.trim() ?? "";
          if (!rawVal) {
            if (errorDiv) {
              errorDiv.textContent = "수동 지정 시급을 입력해 주십시오.";
              errorDiv.hidden = false;
            }
            rateInput?.focus();
            return;
          }
          const val = Number(rawVal);
          if (isNaN(val) || val <= 0) {
            if (errorDiv) {
              errorDiv.textContent = "시급은 0보다 큰 양수 숫자로 입력해 주십시오.";
              errorDiv.hidden = false;
            }
            rateInput?.focus();
            return;
          }
          manualRate = val;
        }

        const comment = commentInput?.value.trim() || undefined;
        if (manualRate !== undefined && !comment) {
          if (errorDiv) { errorDiv.textContent = "시급을 수동 지정하는 사유를 입력해 주세요."; errorDiv.hidden = false; }
          commentInput?.focus(); return;
        }

        this.isBusy = true;
        this.dialog.setProcessing(true);
        if (confirmBtn) confirmBtn.disabled = true;
        if (errorDiv) errorDiv.hidden = true;

        try {
          const res = await this.bridge.approvePendingFile({
            fileId: row.fileId,
            entryId: row.entryId,
            manualHourlyRate: manualRate,
            comment,
            expectedPolicyFingerprint: row.entry.appliedPolicies?.fingerprint
          });

          if (this.isDestroyed) {
            cleanup();
            return;
          }

          if (!res.ok) {
            if (errorDiv) {
              errorDiv.textContent = res.message || "승인 처리 중 오류가 발생했습니다.";
              errorDiv.hidden = false;
            }
            if (confirmBtn) confirmBtn.disabled = false;
            this.isBusy = false;
    this.dialog.setProcessing(false);
            return;
          }

          cleanup();
          await onSuccess();
        } catch (err: unknown) {
          if (errorDiv) {
            errorDiv.textContent =
              err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
            errorDiv.hidden = false;
          }
          if (confirmBtn) confirmBtn.disabled = false;
        } finally {
          this.isBusy = false;
    this.dialog.setProcessing(false);
        }
      });
    });
  }

  /** 행 단위 반려 모달 (D07: 흰 보조 버튼 스타일 적용) */
  public async promptReject(
    row: PerformanceOverviewRow,
    onSuccess: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed) return;

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "perf-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      const entry = row.entry;

      backdrop.innerHTML = `
        <div class="perf-modal-dialog">
          <div class="perf-modal-header">
            <h3 class="perf-modal-title">실적 반려 확인</h3>
            <button type="button" class="perf-modal-close-btn" id="btn-reject-close">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="perf-modal-body">
            <div class="perf-modal-desc">
              다음 실적을 반려하시겠습니까? 반려 사유는 필수 입력입니다.<br><br>
              - <strong>대상자:</strong> ${escapeHtml(entry.employeeName)} (${escapeHtml(
        entry.employeeCode
      )})<br>
              - <strong>근무일자:</strong> ${escapeHtml(entry.workDate)} (${escapeHtml(
        entry.workType
      )})
            </div>

            <div class="perf-modal-field-group">
              <label for="perf-reject-reason" class="perf-modal-label">
                반려 사유 (필수)
              </label>
              <textarea id="perf-reject-reason" class="perf-input perf-modal-textarea" placeholder="반려 사유를 상세히 입력해 주십시오."></textarea>
            </div>

            <div id="perf-reject-error" class="perf-modal-error" hidden></div>
          </div>

          <div class="perf-modal-footer">
            <button type="button" class="perf-btn-secondary" id="btn-reject-cancel">취소</button>
            <button type="button" class="perf-btn-secondary" id="btn-reject-confirm">반려 확정</button>
          </div>
        </div>
      `;

      let cleaned = false;
      let removeTrap: (() => void) | null = null;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeTrap?.();
        backdrop.remove();
        const idx = this.activeModals.findIndex(m => m.backdrop === backdrop);
        if (idx !== -1) this.activeModals.splice(idx, 1);
        resolve();
      };

      removeTrap = this.setupModalTrap(backdrop, cleanup);
      this.activeModals.push({ backdrop, cleanup });


      const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-reject-close");
      const cancelBtn = backdrop.querySelector<HTMLButtonElement>("#btn-reject-cancel");
      const confirmBtn = backdrop.querySelector<HTMLButtonElement>("#btn-reject-confirm");
      const reasonText = backdrop.querySelector<HTMLTextAreaElement>("#perf-reject-reason");
      const errorDiv = backdrop.querySelector<HTMLElement>("#perf-reject-error");

      closeBtn?.addEventListener("click", cleanup);
      cancelBtn?.addEventListener("click", cleanup);

      confirmBtn?.addEventListener("click", async () => {
        if (this.isDestroyed) {
          cleanup();
          return;
        }

        const reason = reasonText?.value.trim();
        if (!reason) {
          if (errorDiv) {
            errorDiv.textContent = "반려 사유를 반드시 입력해 주십시오.";
            errorDiv.hidden = false;
          }
          reasonText?.focus();
          return;
        }

        this.isBusy = true;
        this.dialog.setProcessing(true);
        if (confirmBtn) confirmBtn.disabled = true;
        if (errorDiv) errorDiv.hidden = true;

        try {
          const res = await this.bridge.rejectPendingFile({
            fileId: row.fileId,
            entryId: row.entryId,
            rejectionReason: reason
          });

          if (this.isDestroyed) {
            cleanup();
            return;
          }

          if (!res.ok) {
            if (errorDiv) {
              errorDiv.textContent = res.message || "반려 처리 중 오류가 발생했습니다.";
              errorDiv.hidden = false;
            }
            if (confirmBtn) confirmBtn.disabled = false;
            this.isBusy = false;
    this.dialog.setProcessing(false);
            return;
          }

          cleanup();
          await onSuccess();
        } catch (err: unknown) {
          if (errorDiv) {
            errorDiv.textContent =
              err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
            errorDiv.hidden = false;
          }
          if (confirmBtn) confirmBtn.disabled = false;
        } finally {
          this.isBusy = false;
    this.dialog.setProcessing(false);
        }
      });
    });
  }

  /** 파일 단위 승인대기로 되돌리기 모달 (D02, D04, D05) */
  public async promptReturnToPending(
    fileId: string,
    fileName: string,
    onSuccess: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed) return;

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "perf-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      backdrop.innerHTML = `
        <div class="perf-modal-dialog">
          <div class="perf-modal-header">
            <h3 class="perf-modal-title perf-modal-danger-title">승인대기로 되돌리기</h3>
            <button type="button" class="perf-modal-close-btn" id="btn-return-close">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="perf-modal-body">
            <div class="perf-modal-desc">
              대상 파일: <strong>${escapeHtml(fileName)}</strong><br><br>
              <div class="perf-modal-danger-box">
                승인 기록과 수당 계산이 함께 지워지며 되살릴 수 없습니다.
              </div>
              <br>
              복귀 시 근무일 기준 시급을 적용합니다. 시급이 없으면 과거 시급을 제거하고 승인을 차단합니다.<br><br>
              정말로 이 파일의 모든 승인 내역을 취소하고 대기 상태로 되돌리시겠습니까?
            </div>

            <div id="perf-return-error" class="perf-modal-error" hidden></div>
          </div>

          <div class="perf-modal-footer">
            <button type="button" class="perf-btn-secondary" id="btn-return-cancel">취소</button>
            <button type="button" class="perf-btn-secondary" id="btn-return-confirm">대기로 되돌리기</button>
          </div>
        </div>
      `;

      let cleaned = false;
      let removeTrap: (() => void) | null = null;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeTrap?.();
        backdrop.remove();
        const idx = this.activeModals.findIndex(m => m.backdrop === backdrop);
        if (idx !== -1) this.activeModals.splice(idx, 1);
        resolve();
      };

      removeTrap = this.setupModalTrap(backdrop, cleanup);
      this.activeModals.push({ backdrop, cleanup });


      const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-return-close");
      const cancelBtn = backdrop.querySelector<HTMLButtonElement>("#btn-return-cancel");
      const confirmBtn = backdrop.querySelector<HTMLButtonElement>("#btn-return-confirm");
      const errorDiv = backdrop.querySelector<HTMLElement>("#perf-return-error");

      closeBtn?.addEventListener("click", cleanup);
      cancelBtn?.addEventListener("click", cleanup);

      confirmBtn?.addEventListener("click", async () => {
        if (this.isDestroyed) {
          cleanup();
          return;
        }

        this.isBusy = true;
        this.dialog.setProcessing(true);
          if (confirmBtn) confirmBtn.disabled = true;

        try {
          const res = await this.bridge.returnApprovedFileToPending({ fileId });

          if (this.isDestroyed) {
            cleanup();
            return;
          }

          if (!res.ok) {
            if (errorDiv) {
              errorDiv.textContent = res.message || "되돌리기 처리 중 오류가 발생했습니다.";
              errorDiv.hidden = false;
            }
            if (confirmBtn) confirmBtn.disabled = false;
            this.isBusy = false;
    this.dialog.setProcessing(false);
            return;
          }

          cleanup();
          await onSuccess();
          const applied = res.data.wageReapplication;
          this.isBusy = false;
          this.dialog.setProcessing(false);
          await this.promptNotice("승인대기 복귀 완료", applied
            ? `시급 ${applied.appliedEntryCount}건 적용 · 확인 필요 ${applied.unresolvedEntryCount}건. 시급 확인 후 승인해 주세요.${applied.sourceFileMissing ? " 원본이 없어 저장된 실적으로 처리했습니다. 원본을 복원해 주세요." : ""}`
            : "시급 확인 후 승인해 주세요.");
        } catch (err: unknown) {
          if (errorDiv) {
            errorDiv.textContent =
              err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
            errorDiv.hidden = false;
          }
          if (confirmBtn) confirmBtn.disabled = false;
        } finally {
          this.isBusy = false;
    this.dialog.setProcessing(false);
        }
      });
    });
  }

  /** 파일 단위 재승인본 확정 모달 */
  public async promptFinalizeReapproval(
    fileId: string,
    fileName: string,
    onSuccess: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed) return;

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "perf-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      backdrop.innerHTML = `
        <div class="perf-modal-dialog">
          <div class="perf-modal-header">
            <h3 class="perf-modal-title">재승인본 확정</h3>
            <button type="button" class="perf-modal-close-btn" id="btn-finalize-close">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="perf-modal-body">
            <div class="perf-modal-desc">
              대상 파일: <strong>${escapeHtml(fileName)}</strong><br><br>
              모든 수정 실적의 재승인이 완료되었습니다. 확정 시 기존 승인본 엑셀이 새 승인본으로 정식 교체됩니다.
            </div>

            <div id="perf-finalize-error" class="perf-modal-error" hidden></div>
          </div>

          <div class="perf-modal-footer">
            <button type="button" class="perf-btn-secondary" id="btn-finalize-cancel">취소</button>
            <button type="button" class="perf-btn-primary" id="btn-finalize-confirm">확정</button>
          </div>
        </div>
      `;

      let cleaned = false;
      let removeTrap: (() => void) | null = null;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeTrap?.();
        backdrop.remove();
        const idx = this.activeModals.findIndex(m => m.backdrop === backdrop);
        if (idx !== -1) this.activeModals.splice(idx, 1);
        resolve();
      };

      removeTrap = this.setupModalTrap(backdrop, cleanup);
      this.activeModals.push({ backdrop, cleanup });


      const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-finalize-close");
      const cancelBtn = backdrop.querySelector<HTMLButtonElement>("#btn-finalize-cancel");
      const confirmBtn = backdrop.querySelector<HTMLButtonElement>("#btn-finalize-confirm");
      const errorDiv = backdrop.querySelector<HTMLElement>("#perf-finalize-error");

      closeBtn?.addEventListener("click", cleanup);
      cancelBtn?.addEventListener("click", cleanup);

      confirmBtn?.addEventListener("click", async () => {
        if (this.isDestroyed) {
          cleanup();
          return;
        }

        this.isBusy = true;
        this.dialog.setProcessing(true);
        if (confirmBtn) confirmBtn.disabled = true;

        try {
          const res = await this.bridge.finalizeReapprovedFile({ fileId });

          if (this.isDestroyed) {
            cleanup();
            return;
          }

          if (!res.ok) {
            if (errorDiv) {
              errorDiv.textContent = res.message || "확정 처리 중 오류가 발생했습니다.";
              errorDiv.hidden = false;
            }
            if (confirmBtn) confirmBtn.disabled = false;
            this.isBusy = false;
    this.dialog.setProcessing(false);
            return;
          }

          cleanup();
          await onSuccess();
        } catch (err: unknown) {
          if (errorDiv) {
            errorDiv.textContent =
              err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
            errorDiv.hidden = false;
          }
          if (confirmBtn) confirmBtn.disabled = false;
        } finally {
          this.isBusy = false;
    this.dialog.setProcessing(false);
        }
      });
    });
  }

  /** 행 숨김 확인 모달 */
  public async promptHideRow(
    row: PerformanceOverviewRow,
    onSuccess: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed || !row.latestApprovalId) return;

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "perf-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      backdrop.innerHTML = `
        <div class="perf-modal-dialog">
          <div class="perf-modal-header">
            <h3 class="perf-modal-title">승인 행 목록 숨김</h3>
            <button type="button" class="perf-modal-close-btn" id="btn-hide-close">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="perf-modal-body">
            <div class="perf-modal-desc">
              대상: <strong>${escapeHtml(row.entry.employeeName)}</strong> (${escapeHtml(
        row.entry.employeeCode
      )}) - ${escapeHtml(row.entry.workDate)}<br><br>
              <div class="perf-modal-info-box">
                목록에서 숨김 처리되며, 승인 및 수당 계산이 삭제되는 것은 아닙니다. 현재 버전에는 되돌릴 수단이 제공되지 않습니다.
              </div>
            </div>

            <div id="perf-hide-error" class="perf-modal-error" hidden></div>
          </div>

          <div class="perf-modal-footer">
            <button type="button" class="perf-btn-secondary" id="btn-hide-cancel">취소</button>
            <button type="button" class="perf-btn-secondary" id="btn-hide-confirm">숨김 확인</button>
          </div>
        </div>
      `;

      let cleaned = false;
      let removeTrap: (() => void) | null = null;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeTrap?.();
        backdrop.remove();
        const idx = this.activeModals.findIndex(m => m.backdrop === backdrop);
        if (idx !== -1) this.activeModals.splice(idx, 1);
        resolve();
      };

      removeTrap = this.setupModalTrap(backdrop, cleanup);
      this.activeModals.push({ backdrop, cleanup });


      const closeBtn = backdrop.querySelector<HTMLButtonElement>("#btn-hide-close");
      const cancelBtn = backdrop.querySelector<HTMLButtonElement>("#btn-hide-cancel");
      const confirmBtn = backdrop.querySelector<HTMLButtonElement>("#btn-hide-confirm");
      const errorDiv = backdrop.querySelector<HTMLElement>("#perf-hide-error");

      closeBtn?.addEventListener("click", cleanup);
      cancelBtn?.addEventListener("click", cleanup);

      confirmBtn?.addEventListener("click", async () => {
        if (this.isDestroyed) {
          cleanup();
          return;
        }

        this.isBusy = true;
        this.dialog.setProcessing(true);
        if (confirmBtn) confirmBtn.disabled = true;

        try {
          const res = await this.bridge.hideApprovedRow({
            approvalId: row.latestApprovalId!
          });

          if (this.isDestroyed) {
            cleanup();
            return;
          }

          if (!res.ok) {
            if (errorDiv) {
              errorDiv.textContent = res.message || "숨김 처리 중 오류가 발생했습니다.";
              errorDiv.hidden = false;
            }
            if (confirmBtn) confirmBtn.disabled = false;
            this.isBusy = false;
    this.dialog.setProcessing(false);
            return;
          }

          cleanup();
          await onSuccess();
        } catch (err: unknown) {
          if (errorDiv) {
            errorDiv.textContent =
              err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
            errorDiv.hidden = false;
          }
          if (confirmBtn) confirmBtn.disabled = false;
        } finally {
          this.isBusy = false;
    this.dialog.setProcessing(false);
        }
      });
    });
  }

  /** 원본 엑셀 파일 열기 (D05: alert 대신 promptNotice 사용) */
  public async openSourceFile(fileId: string): Promise<void> {
    try {
      const res = await this.bridge.openPerformanceSourceFile(fileId);
      if (!res.ok) {
        await this.promptNotice(
          "원본 파일 열기 안내",
          res.message || "원본 파일을 열 수 없습니다. 파일이 이동되었거나 삭제되었는지 확인해 주십시오."
        );
      }
    } catch (err: unknown) {
      await this.promptNotice(
        "원본 파일 열기 오류",
        err instanceof Error ? err.message : "원본 파일 열기 중 서버 통신 오류가 발생했습니다."
      );
    }
  }
}
