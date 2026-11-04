import type { AllowanceBridge } from "../../shared/bridge/contracts";
import type { AllowanceDocumentExportRecord } from "../../shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import { WorkforceDialog, type ModalButtonConfig } from "./workforce-dialog";
import {
  formatCurrency,
  isValidCalendarDate,
  validateFreshRecordsForAction,
} from "./allowance-model";

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mountAllowanceDialog(options: {
  dialog: WorkforceDialog;
  id: string;
  title: string;
  closeButtonId: string;
  large?: boolean;
  contentHtml: string;
  buttons: ModalButtonConfig[];
  initialFocusSelector?: string;
  onClose?: () => void;
}): { overlay: HTMLElement; token: number } {
  const content = document.createElement("div");
  content.className = "allowance-dialog-content";
  content.innerHTML = options.contentHtml;

  // width 옵션을 전달하지 않아 inline style을 만들지 않는다 (CSP strict 준수).
  const overlay = options.dialog.open({
    id: options.id,
    title: options.title,
    content,
    buttons: options.buttons,
    initialFocusSelector: options.initialFocusSelector,
    onClose: options.onClose,
  });

  overlay.classList.add("allowance-modal-backdrop");
  const box = overlay.querySelector<HTMLElement>(".workforce-modal-box");
  box?.classList.add(options.large ? "allowance-modal-box-large" : "allowance-modal-box");

  const headerCloseBtn = overlay.querySelector<HTMLButtonElement>(
    ".workforce-modal-header button"
  );
  if (headerCloseBtn) {
    headerCloseBtn.id = options.closeButtonId;
  }

  return { overlay, token: options.dialog.captureToken() };
}

export class AllowanceActionManager {
  private bridge: AllowanceBridge;
  private dialog = new WorkforceDialog();
  private isDestroyed = false;
  private isBusy = false;

  constructor(bridge: AllowanceBridge) {
    this.bridge = bridge;
  }

  public getBusy(): boolean {
    return this.isBusy;
  }

  public isOpen(): boolean {
    return this.dialog.isOpen();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.closeAll();
  }

  public closeAll(): void {
    this.isBusy = false;
    this.dialog.close();
  }

  private isAlive(token: number): boolean {
    return !this.isDestroyed && this.dialog.isCurrent(token);
  }

  /** 검토 승인 모달 (단건·묶음, 중복제거, 혼합상태 변경분 명시, UI06-D02 fresh 검증, UI06-D05 WorkforceDialog) */
  public async promptApprove(
    targets: AllowanceCalculationResultRecord[],
    onSuccess: () => Promise<void>,
    skippedAlreadyApprovedCount = 0
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed || targets.length === 0) return;

    const uniqueMap = new Map(targets.map(r => [r.id, r]));
    const uniqueTargets = Array.from(uniqueMap.values());
    const workMonth = uniqueTargets[0]?.workDate?.slice(0, 7) || "-";
    const totalAmt = uniqueTargets.reduce(
      (sum, r) => sum + (r.snapshot?.totalAllowanceAmount ?? 0),
      0
    );

    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const closeSafe = () => {
        if (this.isBusy) return;
        this.dialog.close();
        finish();
      };

      const { overlay, token } = mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-approve-dialog",
        title: "수당 산출 검토 승인 확인",
        closeButtonId: "btn-approve-close",
        initialFocusSelector: "#allowance-approve-comment",
        onClose: finish,
        contentHtml: `
          <p>아래 대상의 수당 산출 내역을 <strong>검토 승인</strong>으로 확정하시겠습니까?</p>
          ${
            skippedAlreadyApprovedCount > 0
              ? `<div class="allowance-alert info">이미 승인된 ${skippedAlreadyApprovedCount}건은 제외하고 변경 대상 ${uniqueTargets.length}건만 처리합니다.</div>`
              : ""
          }
          <div class="allowance-detail-card">
            <div class="allowance-detail-row">
              <span class="allowance-detail-key">대상 근무월 / 건수</span>
              <span class="allowance-detail-val">${escapeHtml(workMonth)} · <strong>${uniqueTargets.length}건</strong></span>
            </div>
            <div class="allowance-detail-row">
              <span class="allowance-detail-key">승인 대상 합계 금액</span>
              <span class="allowance-detail-val text-blue font-bold">${formatCurrency(totalAmt)}</span>
            </div>
          </div>
          <div class="allowance-control-stack">
            <label for="allowance-approve-comment" class="allowance-control-label">검토 비고 (선택 사항)</label>
            <input type="text" id="allowance-approve-comment" class="allowance-input w-full" placeholder="검토 비고 입력">
          </div>
          <div class="allowance-alert error" id="allowance-approve-error" hidden role="alert"></div>
        `,
        buttons: [
          { id: "btn-approve-cancel", label: "취소", variant: "secondary", onClick: closeSafe },
          {
            id: "btn-approve-confirm",
            label: "승인 확정",
            variant: "primary",
            onClick: async () => {
              if (this.isBusy || !this.isAlive(token)) return;
              const errorDiv = overlay.querySelector<HTMLElement>("#allowance-approve-error");
              const commentInput = overlay.querySelector<HTMLInputElement>(
                "#allowance-approve-comment"
              );
              if (errorDiv) errorDiv.hidden = true;

              this.isBusy = true;
              this.dialog.setProcessing(true, "최신 산출 상태 검증 및 승인 처리 중...", token);

              try {
                const freshRes = await this.bridge.listCalculationResults();
                if (!this.isAlive(token)) return;

                if (!freshRes.ok || !freshRes.data) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      (!freshRes.ok ? freshRes.message : undefined) ||
                      "최신 수당 산출 결과를 확인하지 못했습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const validation = validateFreshRecordsForAction(
                  uniqueTargets.map(r => r.id),
                  freshRes.data,
                  {
                    requiredStatus: ["pending", "rejected"],
                    checkSameMonth: true,
                    blockProposalApproved: true,
                    expectedRecords: uniqueTargets,
                  }
                );

                if (!validation.valid) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      validation.reason || "선택된 항목의 최신 상태가 유효하지 않습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const res = await this.bridge.reviewAllowanceCalculations({
                  calculationIds: uniqueTargets.map(r => r.id),
                  decision: "approved",
                  comment: commentInput?.value.trim() || undefined,
                  syncPerformanceSiteReject: false,
                });

                if (!this.isAlive(token)) return;

                if (!res.ok) {
                  if (errorDiv) {
                    errorDiv.textContent = res.message || "승인 처리 중 오류가 발생했습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                this.isBusy = false;
                this.dialog.close();
                if (!this.isDestroyed) {
                  await onSuccess();
                }
                finish();
              } catch (err: unknown) {
                if (this.isAlive(token) && errorDiv) {
                  errorDiv.textContent =
                    err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
                  errorDiv.hidden = false;
                }
              } finally {
                this.isBusy = false;
                this.dialog.setProcessing(false, undefined, token);
              }
            },
          },
        ],
      });
    });
  }

  /** 검토 반려 모달 (일반 수당 반려: comment 선택 입력, syncPerformanceSiteReject: false 고정) */
  public async promptReject(
    targets: AllowanceCalculationResultRecord[],
    onSuccess: () => Promise<void>,
    skippedAlreadyRejectedCount = 0
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed || targets.length === 0) return;

    const uniqueMap = new Map(targets.map(r => [r.id, r]));
    const uniqueTargets = Array.from(uniqueMap.values());
    const workMonth = uniqueTargets[0]?.workDate?.slice(0, 7) || "-";
    const totalAmt = uniqueTargets.reduce(
      (sum, r) => sum + (r.snapshot?.totalAllowanceAmount ?? 0),
      0
    );

    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const closeSafe = () => {
        if (this.isBusy) return;
        this.dialog.close();
        finish();
      };

      const { overlay, token } = mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-reject-dialog",
        title: "수당 산출 반려 확인",
        closeButtonId: "btn-reject-close",
        initialFocusSelector: "#allowance-reject-reason",
        onClose: finish,
        contentHtml: `
          <p>아래 대상의 수당 산출을 <strong>반려</strong>하시겠습니까? (수당 검토 상태만 반려되며 원본 실적은 동기화 반려하지 않습니다)</p>
          ${
            skippedAlreadyRejectedCount > 0
              ? `<div class="allowance-alert info">이미 반려된 ${skippedAlreadyRejectedCount}건은 제외하고 변경 대상 ${uniqueTargets.length}건만 처리합니다.</div>`
              : ""
          }
          <div class="allowance-detail-card">
            <div class="allowance-detail-row">
              <span class="allowance-detail-key">대상 근무월 / 건수</span>
              <span class="allowance-detail-val">${escapeHtml(workMonth)} · <strong>${uniqueTargets.length}건</strong></span>
            </div>
            <div class="allowance-detail-row">
              <span class="allowance-detail-key">반려 대상 합계 금액</span>
              <span class="allowance-detail-val font-bold">${formatCurrency(totalAmt)}</span>
            </div>
          </div>
          <div class="allowance-control-stack">
            <label for="allowance-reject-reason" class="allowance-control-label">반려 사유 (선택 입력)</label>
            <input type="text" id="allowance-reject-reason" class="allowance-input w-full" placeholder="반려 사유 입력 (선택)">
          </div>
          <div class="allowance-alert error" id="allowance-reject-error" hidden role="alert"></div>
        `,
        buttons: [
          { id: "btn-reject-cancel", label: "취소", variant: "secondary", onClick: closeSafe },
          {
            id: "btn-reject-confirm",
            label: "반려 확정",
            variant: "secondary",
            onClick: async () => {
              if (this.isBusy || !this.isAlive(token)) return;
              const errorDiv = overlay.querySelector<HTMLElement>("#allowance-reject-error");
              const reasonInput = overlay.querySelector<HTMLInputElement>(
                "#allowance-reject-reason"
              );
              if (errorDiv) errorDiv.hidden = true;

              this.isBusy = true;
              this.dialog.setProcessing(true, "최신 산출 상태 검증 및 반려 처리 중...", token);

              try {
                const freshRes = await this.bridge.listCalculationResults();
                if (!this.isAlive(token)) return;

                if (!freshRes.ok || !freshRes.data) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      (!freshRes.ok ? freshRes.message : undefined) ||
                      "최신 수당 산출 결과를 확인하지 못했습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const validation = validateFreshRecordsForAction(
                  uniqueTargets.map(r => r.id),
                  freshRes.data,
                  {
                    requiredStatus: ["pending", "approved"],
                    checkSameMonth: true,
                    blockProposalApproved: true,
                    expectedRecords: uniqueTargets,
                  }
                );

                if (!validation.valid) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      validation.reason || "선택된 항목의 최신 상태가 유효하지 않습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const res = await this.bridge.reviewAllowanceCalculations({
                  calculationIds: uniqueTargets.map(r => r.id),
                  decision: "rejected",
                  comment: reasonInput?.value.trim() || undefined,
                  syncPerformanceSiteReject: false,
                });

                if (!this.isAlive(token)) return;

                if (!res.ok) {
                  if (errorDiv) {
                    errorDiv.textContent = res.message || "반려 처리 중 오류가 발생했습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                this.isBusy = false;
                this.dialog.close();
                if (!this.isDestroyed) {
                  await onSuccess();
                }
                finish();
              } catch (err: unknown) {
                if (this.isAlive(token) && errorDiv) {
                  errorDiv.textContent =
                    err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
                  errorDiv.hidden = false;
                }
              } finally {
                this.isBusy = false;
                this.dialog.setProcessing(false, undefined, token);
              }
            },
          },
        ],
      });
    });
  }

  /** 조기지급일 지정/해제 모달 (R09, N06: 공용 달력 input[type=date] + 빈 지정/불가능 날짜 차단, 명시 해제 null) */
  public async promptEarlyPayout(
    row: AllowanceCalculationResultRecord,
    onSuccess: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed) return;
    if (row.status === "proposal-approved") {
      await this.promptNotice(
        "변경 불가 (품의 마감)",
        "품의 완료(마감)된 항목은 조기지급일을 변경할 수 없습니다."
      );
      return;
    }

    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const executeEarlyPayout = async (
        payoutDate: string | null,
        overlay: HTMLElement,
        token: number
      ) => {
        if (this.isBusy || !this.isAlive(token)) return;
        const errorDiv = overlay.querySelector<HTMLElement>("#allowance-early-error");
        const dateInput = overlay.querySelector<HTMLInputElement>("#allowance-early-date");

        if (payoutDate !== null) {
          if (dateInput?.validity?.badInput || !isValidCalendarDate(payoutDate)) {
            if (errorDiv) {
              errorDiv.textContent =
                "지정할 조기지급일을 유효한 달력 날짜(YYYY-MM-DD)로 입력하거나 달력에서 선택해 주십시오. (빈 값이나 존재하지 않는 날짜는 저장할 수 없으며, 해제는 '지정 해제' 버튼을 사용하십시오)";
              errorDiv.hidden = false;
            }
            return;
          }
        }

        if (errorDiv) errorDiv.hidden = true;
        this.isBusy = true;
        this.dialog.setProcessing(true, "최신 산출 상태 검증 및 조기지급일 반영 중...", token);

        try {
          const freshRes = await this.bridge.listCalculationResults();
          if (!this.isAlive(token)) return;

          if (!freshRes.ok || !freshRes.data) {
            if (errorDiv) {
              errorDiv.textContent =
                (!freshRes.ok ? freshRes.message : undefined) ||
                "최신 수당 산출 결과를 확인하지 못했습니다.";
              errorDiv.hidden = false;
            }
            return;
          }

          const validation = validateFreshRecordsForAction([row.id], freshRes.data, {
            blockProposalApproved: true,
            expectedRecords: [row],
          });

          if (!validation.valid) {
            if (errorDiv) {
              errorDiv.textContent =
                validation.reason || "품의 완료되었거나 상태가 변경되어 저장할 수 없습니다.";
              errorDiv.hidden = false;
            }
            return;
          }

          const res = await this.bridge.setCalculationEarlyPayout({
            calculationId: row.id,
            earlyPayoutDate: payoutDate,
          });

          if (!this.isAlive(token)) return;

          if (!res.ok) {
            if (errorDiv) {
              errorDiv.textContent = res.message || "조기지급일 설정 중 오류가 발생했습니다.";
              errorDiv.hidden = false;
            }
            return;
          }

          this.isBusy = false;
          this.dialog.close();
          if (!this.isDestroyed) {
            await onSuccess();
          }
          finish();
        } catch (err: unknown) {
          if (this.isAlive(token) && errorDiv) {
            errorDiv.textContent =
              err instanceof Error ? err.message : "서버 통신 오류가 발생했습니다.";
            errorDiv.hidden = false;
          }
        } finally {
          this.isBusy = false;
          this.dialog.setProcessing(false, undefined, token);
        }
      };

      const { overlay, token } = mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-early-dialog",
        title: "조기지급일 지정 및 해제",
        closeButtonId: "btn-early-close",
        initialFocusSelector: "#allowance-early-date",
        onClose: finish,
        contentHtml: `
          <p><strong>${escapeHtml(row.employeeName)}</strong> (${escapeHtml(row.employeeCode)} · ${escapeHtml(row.workDate)}) 건의 조기지급일을 설정합니다.</p>
          <div class="allowance-detail-card">
            <div class="allowance-detail-row">
              <span class="allowance-detail-key">현재 지정 상태</span>
              <span class="allowance-detail-val">${row.earlyPayoutDate ? escapeHtml(row.earlyPayoutDate) : "미지정 (정규 지급)"}</span>
            </div>
            <div class="allowance-detail-row">
              <span class="allowance-detail-key">저장 산출 총액 (불변)</span>
              <span class="allowance-detail-val font-bold">${formatCurrency(row.snapshot?.totalAllowanceAmount)}</span>
            </div>
          </div>
          <div class="allowance-control-stack">
            <label for="allowance-early-date" class="allowance-control-label">조기지급일 선택 (YYYY-MM-DD, 클릭 시 달력 표시)</label>
            <input
              type="date"
              id="allowance-early-date"
              class="allowance-input w-full"
              value="${escapeHtml(row.earlyPayoutDate || "")}"
            >
          </div>
          <div class="allowance-subtext">안내: 최신 미마감 건만 편집하며 산출 금액/스냅샷은 변경되지 않습니다.</div>
          <div class="allowance-alert error" id="allowance-early-error" hidden role="alert"></div>
        `,
        buttons: [
          {
            id: "btn-early-clear",
            label: "지정 해제",
            variant: "secondary",
            onClick: () => executeEarlyPayout(null, overlay, token),
          },
          {
            id: "btn-early-save",
            label: "설정 저장",
            variant: "primary",
            onClick: () => {
              const dateInput = overlay.querySelector<HTMLInputElement>("#allowance-early-date");
              const rawVal = dateInput?.value.trim() || "";
              return executeEarlyPayout(rawVal, overlay, token);
            },
          },
        ],
      });
    });
  }

  /** 수당 산출 문서 3종 재출력 모달 (R13, S14, S20, UI06-D02, UI06-D05) */
  public async promptExportDocuments(
    targets: AllowanceCalculationResultRecord[],
    onSuccess: (exportedRecord: AllowanceDocumentExportRecord) => Promise<void>
  ): Promise<void> {
    if (this.isBusy || this.isDestroyed || targets.length === 0) return;

    const uniqueMap = new Map(targets.map(r => [r.id, r]));
    const uniqueTargets = Array.from(uniqueMap.values());
    const workMonth = uniqueTargets[0]?.workDate?.slice(0, 7) || "-";
    const totalAmt = uniqueTargets.reduce(
      (sum, r) => sum + (r.snapshot?.totalAllowanceAmount ?? 0),
      0
    );

    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const closeSafe = () => {
        if (this.isBusy) return;
        this.dialog.close();
        finish();
      };

      const { overlay, token } = mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-export-dialog",
        title: "수당 산출 문서 3종 출력",
        closeButtonId: "btn-export-close",
        initialFocusSelector: "#sel-export-format",
        onClose: finish,
        contentHtml: `
          <p>선택한 <strong>${uniqueTargets.length}건</strong> (${escapeHtml(workMonth)}, 총 ${formatCurrency(totalAmt)})에 대해 <strong>품의서 · 별첨1 · 별첨2</strong> 3개 파일을 출력합니다.</p>
          <div class="allowance-control-stack">
            <label for="sel-export-format" class="allowance-control-label">출력 파일 형식 선택</label>
            <select id="sel-export-format" class="allowance-select w-full">
              <option value="xlsx" selected>Excel 통합문서 (.xlsx 3종)</option>
              <option value="pdf">PDF 문서 (.pdf 3종)</option>
            </select>
          </div>
          <div class="allowance-alert error" id="allowance-export-error" hidden role="alert"></div>
        `,
        buttons: [
          { id: "btn-export-cancel", label: "취소", variant: "secondary", onClick: closeSafe },
          {
            id: "btn-export-confirm",
            label: "문서 출력",
            variant: "primary",
            onClick: async () => {
              if (this.isBusy || !this.isAlive(token)) return;
              const errorDiv = overlay.querySelector<HTMLElement>("#allowance-export-error");
              const selFormat = overlay.querySelector<HTMLSelectElement>("#sel-export-format");
              if (errorDiv) errorDiv.hidden = true;

              this.isBusy = true;
              this.dialog.setProcessing(true, "문서 3종 생성 및 출력 처리 중...", token);

              try {
                const freshRes = await this.bridge.listCalculationResults();
                if (!this.isAlive(token)) return;

                if (!freshRes.ok || !freshRes.data) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      (!freshRes.ok ? freshRes.message : undefined) ||
                      "최신 수당 산출 결과를 확인하지 못했습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const validation = validateFreshRecordsForAction(
                  uniqueTargets.map(r => r.id),
                  freshRes.data,
                  {
                    requiredStatus: ["approved", "proposal-approved"],
                    checkSameMonth: true,
                    expectedRecords: uniqueTargets,
                  }
                );

                if (!validation.valid) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      validation.reason ||
                      "문서 출력은 동일 근무월의 검토 승인 또는 품의 완료 건만 가능합니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const res = await this.bridge.exportAllowanceDocuments({
                  calculationIds: uniqueTargets.map(t => t.id),
                  outputFormat: (selFormat?.value || "xlsx") as "xlsx" | "pdf",
                });

                if (!this.isAlive(token)) return;

                if (!res.ok || !res.data) {
                  const errMsg = !res.ok ? res.message : undefined;
                  if (errorDiv) {
                    errorDiv.textContent = `${errMsg || "문서 출력에 실패했습니다."} (자동 재시도는 수행되지 않습니다. 출력 폴더 및 설정을 확인한 뒤 다시 시도해 주십시오.)`;
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const exportedRecord = res.data;
                this.isBusy = false;
                this.dialog.close();
                if (!this.isDestroyed) {
                  await onSuccess(exportedRecord);
                  if (
                    exportedRecord.rankMissingEmployeeNames &&
                    exportedRecord.rankMissingEmployeeNames.length > 0
                  ) {
                    await this.promptNotice(
                      "직급 미확인 인원 경고",
                      `문서 3종 출력은 완료되었으나 다음 인원의 직급 정보가 확인되지 않았습니다: ${exportedRecord.rankMissingEmployeeNames.join(", ")}`
                    );
                  }
                }
                finish();
              } catch (e: unknown) {
                if (this.isAlive(token) && errorDiv) {
                  errorDiv.textContent =
                    e instanceof Error ? e.message : "문서 출력 중 예외가 발생했습니다.";
                  errorDiv.hidden = false;
                }
              } finally {
                this.isBusy = false;
                this.dialog.setProcessing(false, undefined, token);
              }
            },
          },
        ],
      });
    });
  }

  /** 안내/차단 모달 (alert 완전 대체, WorkforceDialog 수명 연동) */
  public async promptNotice(title: string, message: string): Promise<void> {
    if (this.isDestroyed) return;

    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const closeNotice = () => {
        this.dialog.close();
        finish();
      };

      mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-notice-dialog",
        title,
        closeButtonId: "btn-notice-close",
        initialFocusSelector: "#btn-notice-confirm",
        onClose: finish,
        contentHtml: `<p id="allowance-notice-message">${escapeHtml(message)}</p>`,
        buttons: [
          { id: "btn-notice-confirm", label: "확인", variant: "primary", onClick: closeNotice },
        ],
      });
    });
  }
}
