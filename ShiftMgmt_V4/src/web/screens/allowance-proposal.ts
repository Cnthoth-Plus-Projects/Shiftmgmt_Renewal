import type { AllowanceBridge } from "../../shared/bridge/contracts";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type { AllowanceProposalPreview } from "../../shared/domain/allowance-workflow";
import { WorkforceDialog } from "./workforce-dialog";
import { mountAllowanceDialog } from "./allowance-actions";
import {
  createPreviewBinding,
  formatCurrency,
  formatWorkMinutes,
  validatePreviewBinding,
  type AllowancePreviewBinding,
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

export class AllowanceProposalManager {
  private bridge: AllowanceBridge;
  private dialog = new WorkforceDialog();
  private isDestroyed = false;
  private isLoadingPreview = false;
  private isSubmitting = false;

  constructor(bridge: AllowanceBridge) {
    this.bridge = bridge;
  }

  public getBusy(): boolean {
    return this.isLoadingPreview || this.isSubmitting;
  }

  public isOpen(): boolean {
    return this.dialog.isOpen();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.closeAll();
  }

  public closeAll(): void {
    this.isLoadingPreview = false;
    this.isSubmitting = false;
    this.dialog.close();
  }

  private async showErrorNotice(title: string, message: string): Promise<void> {
    if (this.isDestroyed) return;
    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-proposal-error-dialog",
        title,
        closeButtonId: "btn-notice-close",
        initialFocusSelector: "#btn-notice-confirm",
        onClose: finish,
        contentHtml: `<div class="allowance-alert error" role="alert">${escapeHtml(message)}</div>`,
        buttons: [
          {
            id: "btn-notice-confirm",
            label: "확인",
            variant: "primary",
            onClick: () => {
              this.dialog.close();
              finish();
            },
          },
        ],
      });
    });
  }

  public async show(options: {
    workMonth: string;
    initialTargets: AllowanceCalculationResultRecord[];
    latestAllRowsProvider: () => AllowanceCalculationResultRecord[];
    onProposalApproved: () => Promise<void>;
    canReview?: boolean;
  }): Promise<void> {
    const uniqueMap = new Map(options.initialTargets.map(t => [t.id, t]));
    const uniqueTargets = Array.from(uniqueMap.values());
    return this.openProposalModal(
      uniqueTargets,
      options.latestAllRowsProvider,
      options.onProposalApproved,
      options.canReview
    );
  }

  /** 품의서 미리보기 및 결재 승인 모달 (UI06-D01: 미리보기 busy와 제출 busy 완전 분리, alert 0) */
  public async openProposalModal(
    initialTargets: AllowanceCalculationResultRecord[],
    _getCurrentRows: () => AllowanceCalculationResultRecord[],
    onSuccess: () => Promise<void>,
    canReview = true
  ): Promise<void> {
    if (this.getBusy() || this.isDestroyed || initialTargets.length === 0) return;
    const calculationIds = initialTargets.map(t => t.id);

    this.isLoadingPreview = true;
    let preview: AllowanceProposalPreview | null = null;
    let previewError: string | null = null;

    try {
      const previewRes = await this.bridge.previewAllowanceProposal({
        calculationIds,
      });

      if (this.isDestroyed) return;

      if (!previewRes.ok || !previewRes.data) {
        previewError =
          (!previewRes.ok ? previewRes.message : undefined) ||
          "품의서 미리보기 데이터를 불러오지 못했습니다.";
      } else {
        preview = previewRes.data;
      }
    } catch (err: unknown) {
      if (this.isDestroyed) return;
      previewError =
        err instanceof Error ? err.message : "품의 미리보기 요청 중 오류가 발생했습니다.";
    } finally {
      // UI06-D01: 성공·실패·예외 어떤 경로에서도 미리보기 로딩 잠금을 즉시 해제한다.
      this.isLoadingPreview = false;
    }

    if (this.isDestroyed) return;

    if (previewError || !preview) {
      await this.showErrorNotice("품의서 미리보기 실패", previewError || "미리보기 실패");
      return;
    }

    await this.showProposalDialog(preview, initialTargets, onSuccess, canReview);
  }

  private async showProposalDialog(
    preview: AllowanceProposalPreview,
    sourceRows: AllowanceCalculationResultRecord[],
    onSuccess: () => Promise<void>,
    canReview: boolean
  ): Promise<void> {
    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      let outputFormat: "pdf" | "xlsx" = "pdf";
      let binding: AllowancePreviewBinding = createPreviewBinding(
        preview,
        outputFormat,
        sourceRows
      );
      const isConsistent =
        binding.isPreviewConsistent && preview.rows.length === sourceRows.length;

      const regularCount = preview.rows.filter(r => !r.earlyPayoutDate).length;
      const earlyCount = preview.rows.filter(r => !!r.earlyPayoutDate).length;
      const distinctSites = Array.from(new Set(preview.rows.map(r => r.siteName)));

      const renderSummaryRows = (
        list: AllowanceProposalPreview["regularSiteSummaries"],
        badgeText: string,
        badgeClass: string
      ) =>
        list
          .map(
            s => `
          <tr>
            <td><span class="allowance-badge ${badgeClass}">${escapeHtml(badgeText)}</span> ${escapeHtml(s.siteName)}</td>
            <td class="text-right">${formatCurrency(s.substituteAmount)}</td>
            <td class="text-right">${formatCurrency(s.overtimeAmount)}</td>
            <td class="text-right">${formatCurrency(s.holidayAmount)}</td>
            <td class="text-right font-bold">${formatCurrency(s.totalAmount)}</td>
          </tr>
        `
          )
          .join("");

      const siteSummariesHtml =
        renderSummaryRows(preview.regularSiteSummaries, "정규", "badge-approved") +
        renderSummaryRows(preview.earlyPayoutSiteSummaries, "조기", "badge-early-payout");

      const detailRowsHtml = preview.rows
        .map(
          r => `
          <tr>
            <td>${escapeHtml(r.siteName)}</td>
            <td>${escapeHtml(r.employeeName)} (${escapeHtml(r.employeeCode)})</td>
            <td>${escapeHtml(r.workDate)}</td>
            <td>${escapeHtml(r.businessCategoryLabel)}</td>
            <td class="text-right">${formatWorkMinutes(r.totalWorkMinutes)}</td>
            <td>${r.earlyPayoutDate ? `<span class="allowance-badge badge-early-payout">조기 (${escapeHtml(r.earlyPayoutDate)})</span>` : `<span class="allowance-badge badge-approved">정규</span>`}</td>
            <td class="text-right font-bold">${formatCurrency(r.totalAllowanceAmount)}</td>
          </tr>
        `
        )
        .join("");

      const closeSafe = () => {
        if (this.isSubmitting) return;
        this.dialog.close();
        finish();
      };

      const canApproveInitially = canReview && isConsistent;

      const { overlay, token } = mountAllowanceDialog({
        dialog: this.dialog,
        id: "allowance-proposal-dialog",
        title: `수당 지급 품의서 미리보기 및 결재 (${preview.workMonth})`,
        closeButtonId: "btn-prop-close",
        large: true,
        initialFocusSelector: "#allowance-prop-comment",
        onClose: finish,
        contentHtml: `
          <div class="allowance-kpi-bar">
            <div class="allowance-kpi-card kpi-total">
              <span class="allowance-kpi-label">총 품의 금액 (${preview.calculationCount}건 · ${preview.employeeCount}명)</span>
              <span class="allowance-kpi-value" id="prop-total-amount">${formatCurrency(preview.totalAllowanceAmount)}</span>
            </div>
            <div class="allowance-kpi-card kpi-regular">
              <span class="allowance-kpi-label">정규 지급 (${regularCount}건)</span>
              <span class="allowance-kpi-value" id="prop-regular-amount">${formatCurrency(preview.regularTotalAllowanceAmount)}</span>
            </div>
            <div class="allowance-kpi-card kpi-early">
              <span class="allowance-kpi-label">조기 지급 (${earlyCount}건)</span>
              <span class="allowance-kpi-value" id="prop-early-amount">${formatCurrency(preview.earlyPayoutTotalAllowanceAmount)}</span>
            </div>
            <div class="allowance-kpi-card kpi-count">
              <span class="allowance-kpi-label">대상 근무지</span>
              <span class="allowance-kpi-value">${distinctSites.length}곳</span>
              <span class="allowance-kpi-sub">${escapeHtml(distinctSites.slice(0, 2).join(", "))}${distinctSites.length > 2 ? ` 외 ${distinctSites.length - 2}곳` : ""}</span>
            </div>
          </div>

          ${
            !isConsistent
              ? `<div class="allowance-alert error" role="alert">선택한 계산 ID 수와 미리보기 응답 행 수 또는 합계가 일치하지 않아 결재 승인이 차단되었습니다.</div>`
              : ""
          }
          ${
            !canReview
              ? `<div class="allowance-alert warning" id="prop-role-notice">현재 계정 권한은 미리보기만 가능하며, 품의 결재 승인은 승인자(reviewer) 또는 관리자(admin)만 가능합니다.</div>`
              : ""
          }

          <div class="allowance-detail-card">
            <div class="allowance-detail-card-title">근무지 · 지급구분별 요약 (대체 · 연장 · 휴일)</div>
            <table class="allowance-table">
              <thead>
                <tr>
                  <th>구분 · 근무지</th>
                  <th class="text-right">대체근무</th>
                  <th class="text-right">연장근무</th>
                  <th class="text-right">휴일근무</th>
                  <th class="text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                ${siteSummariesHtml || '<tr><td colspan="5" class="text-center">요약 정보 없음</td></tr>'}
              </tbody>
            </table>
          </div>

          <div class="allowance-detail-card">
            <div class="allowance-detail-card-title">대상 산출 명세 (${preview.rows.length}건)</div>
            <table class="allowance-table">
              <thead>
                <tr>
                  <th>근무지</th>
                  <th>성명 (사번)</th>
                  <th>근무일</th>
                  <th>산출구분</th>
                  <th class="text-right">시간</th>
                  <th>지급구분</th>
                  <th class="text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                ${detailRowsHtml}
              </tbody>
            </table>
          </div>

          <div class="allowance-detail-card">
            <div class="allowance-detail-card-title">품의 결재 확정 조건 확인</div>
            <div class="allowance-control-group">
              <span class="allowance-control-label">생성할 문서 3종 형식 (품의서·별첨1·별첨2):</span>
              <label class="allowance-control-label">
                <input type="radio" name="allowance-output-format" value="pdf" checked>
                PDF 문서 3종 (기본)
              </label>
              <label class="allowance-control-label">
                <input type="radio" name="allowance-output-format" value="xlsx">
                Excel 통합문서 3종 (.xlsx)
              </label>
            </div>
            <div class="allowance-subtext">
              확정 시 선택한 형식의 문서 3종과 운영 DB JSON 백업이 즉시 생성되며, 대상 ${preview.calculationCount}건은 '품의 승인(마감)' 상태로 변경 잠금됩니다.
            </div>
            <div class="allowance-control-stack">
              <label for="allowance-prop-comment" class="allowance-control-label">품의 결재 비고 (선택 사항)</label>
              <input type="text" id="allowance-prop-comment" class="allowance-input w-full" placeholder="품의 결재 비고 입력">
            </div>
          </div>

          <div class="allowance-alert error" id="allowance-prop-error" hidden role="alert"></div>
        `,
        buttons: [
          { id: "btn-prop-cancel", label: "취소", variant: "secondary", onClick: closeSafe },
          {
            id: "btn-prop-approve",
            label: "품의 결재 승인",
            variant: "primary",
            disabled: !canApproveInitially,
            onClick: async () => {
              if (this.isSubmitting || this.isDestroyed || !canReview || !isConsistent) return;
              if (!this.dialog.isCurrent(token)) return;

              const approveBtn = overlay.querySelector<HTMLButtonElement>("#btn-prop-approve");
              const commentInput = overlay.querySelector<HTMLInputElement>(
                "#allowance-prop-comment"
              );
              const errorDiv = overlay.querySelector<HTMLElement>("#allowance-prop-error");
              if (errorDiv) errorDiv.hidden = true;

              this.isSubmitting = true;
              this.dialog.setProcessing(
                true,
                "최신 지문 검증 · 문서 3종 및 JSON 백업 생성 · 품의 마감 처리 중...",
                token
              );

              let invalidated = false;
              try {
                // UI06-D02: 확정 직전 fresh listCalculationResults() 호출하여 지문 대조
                const freshRes = await this.bridge.listCalculationResults();
                if (this.isDestroyed || !this.dialog.isCurrent(token)) return;

                if (!freshRes.ok || !freshRes.data) {
                  if (errorDiv) {
                    errorDiv.textContent =
                      (!freshRes.ok ? freshRes.message : undefined) ||
                      "최신 수당 산출 결과를 확인하지 못했습니다.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                const validation = validatePreviewBinding(binding, freshRes.data);
                if (!validation.valid) {
                  invalidated = true;
                  if (errorDiv) {
                    errorDiv.textContent =
                      validation.reason ||
                      "품의서 미리보기 이후 대상 데이터가 변경되었습니다. 창을 닫고 새 미리보기를 실행해 주십시오.";
                    errorDiv.hidden = false;
                  }
                  return;
                }

                // R11: approveAllowanceProposal 단 1회 호출 (이후 exportAllowanceDocuments 자동 호출 금지)
                const res = await this.bridge.approveAllowanceProposal({
                  calculationIds: binding.calculationIds,
                  comment: commentInput?.value.trim() || undefined,
                  outputFormat,
                });

                if (this.isDestroyed || !this.dialog.isCurrent(token)) return;

                if (!res.ok) {
                  // L03 & S20 & N10: 문서 출력/JSON 백업 이후 DB 반영 실패 시 잔여 산출 가능성 안내, 자동 원복/자동 재시도 없음
                  if (errorDiv) {
                    errorDiv.textContent = `${res.message || "품의 결재 승인 처리 중 오류가 발생했습니다."} (품의 결재가 완료되지 않았습니다. 문서 출력 또는 백업 단계 이후 실패한 경우 생성된 파일이 남아 있을 수 있으므로 이력 및 폴더를 확인한 뒤 명시적으로 재시도해 주십시오.)`;
                    errorDiv.hidden = false;
                  }
                  return;
                }

                this.isSubmitting = false;
                this.dialog.close();
                if (!this.isDestroyed) {
                  await onSuccess();
                }
                finish();
              } catch (err: unknown) {
                if (!this.isDestroyed && this.dialog.isCurrent(token) && errorDiv) {
                  errorDiv.textContent =
                    err instanceof Error ? err.message : "품의 승인 중 예외가 발생했습니다.";
                  errorDiv.hidden = false;
                }
              } finally {
                this.isSubmitting = false;
                this.dialog.setProcessing(false, undefined, token);
                if (invalidated && approveBtn && this.dialog.isCurrent(token)) {
                  approveBtn.disabled = true;
                }
              }
            },
          },
        ],
      });

      overlay
        .querySelectorAll<HTMLInputElement>('input[name="allowance-output-format"]')
        .forEach(radio => {
          radio.addEventListener("change", () => {
            if (radio.checked) {
              outputFormat = radio.value as "pdf" | "xlsx";
              binding = createPreviewBinding(preview, outputFormat, sourceRows);
            }
          });
        });
    });
  }
}
