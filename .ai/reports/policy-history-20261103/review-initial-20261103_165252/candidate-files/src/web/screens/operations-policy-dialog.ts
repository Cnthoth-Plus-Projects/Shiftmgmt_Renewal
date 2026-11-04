import type { BrowserAppBridge } from "../bridge/app-bridge";
import type {
  PolicyKind,
  PolicyRuleKey,
} from "../../shared/domain/policy-history";
import type { PolicyChangePreviewResult } from "../../shared/bridge/contracts";

export interface OpenPolicyDialogOptions {
  action: "add" | "correct" | "cancel";
  kind: PolicyKind;
  targetRevisionId?: string;
  initialRuleKey?: PolicyRuleKey;
  initialEffectiveFrom?: string;
  onSuccess: () => void;
}

export class OperationsPolicyDialog {
  private backdropEl: HTMLElement | null = null;
  private previewToken: string | null = null;
  private isBusy = false;

  constructor(private bridge: BrowserAppBridge) {}

  open(options: OpenPolicyDialogOptions) {
    this.close();

    const backdrop = document.createElement("div");
    backdrop.className = "policy-history-dialog-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const kindLabel =
      options.kind === "substitute-eligibility"
        ? "대체근무수당 지급 대상 정책"
        : "실제 근무자 우선순위 정책";

    const actionLabel =
      options.action === "add"
        ? "새 정책 등록"
        : options.action === "correct"
          ? "예약 정책 정정"
          : "예약 정책 취소";

    const ruleOptions =
      options.kind === "substitute-eligibility"
        ? [
            { key: "substitute-legacy", label: "종전 방식 (일반/교대 구분 없이 지급)" },
            { key: "substitute-team-type-v1", label: "2026.07 개정 (교대근무자 대체 시만 지급)" },
          ]
        : [
            { key: "changed-worker-legacy", label: "종전 방식 (원 근무자 우선)" },
            { key: "changed-worker-after-v1", label: "2026.07 개정 (실제 근무자 우선)" },
          ];

    backdrop.innerHTML = `
      <div class="policy-history-dialog compact">
        <div class="policy-dialog-header">
          <h2 class="policy-dialog-title">${actionLabel} — ${kindLabel}</h2>
          <button type="button" class="btn-close-dialog policy-btn-close" aria-label="닫기">&times;</button>
        </div>
        <div class="policy-dialog-content">
          <form id="policy-dialog-form" class="policy-form-layout">
            ${
              options.action !== "cancel"
                ? `
              <div class="form-group">
                <label for="policy-rule-select" class="policy-form-label">적용할 기준</label>
                <select id="policy-rule-select" class="form-control policy-form-select">
                  ${ruleOptions
                    .map(
                      (r) =>
                        `<option value="${r.key}" ${options.initialRuleKey === r.key ? "selected" : ""}>${r.label}</option>`
                    )
                    .join("")}
                </select>
              </div>
              <div class="form-group">
                <label for="policy-date-input" class="policy-form-label">적용 시작일 (근무일 기준)</label>
                <input type="date" id="policy-date-input" class="form-control policy-form-input" value="${options.initialEffectiveFrom ?? ""}" />
              </div>
            `
                : ""
            }
            <div class="form-group">
              <label for="policy-reason-input" class="policy-form-label">사유 (필수)</label>
              <textarea id="policy-reason-input" class="form-control policy-form-textarea" rows="3" placeholder="정책 변경/취소 사유를 입력하세요."></textarea>
            </div>
            <div id="policy-preview-result-container"></div>
            <div id="policy-dialog-error" class="policy-dialog-error"></div>
          </form>
        </div>
        <div class="policy-pagination dialog-actions">
          <button type="button" id="btn-policy-preview" class="btn btn-secondary policy-btn-secondary">영향 확인</button>
          <button type="button" id="btn-policy-confirm" class="btn btn-primary policy-btn-primary" disabled>확인 후 등록</button>
          <button type="button" id="btn-policy-cancel" class="btn btn-secondary policy-btn-secondary">취소</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;

    const closeBtn = backdrop.querySelector(".btn-close-dialog") as HTMLElement;
    const cancelBtn = backdrop.querySelector("#btn-policy-cancel") as HTMLElement;
    const previewBtn = backdrop.querySelector("#btn-policy-preview") as HTMLButtonElement;
    const confirmBtn = backdrop.querySelector("#btn-policy-confirm") as HTMLButtonElement;
    const reasonInput = backdrop.querySelector("#policy-reason-input") as HTMLTextAreaElement;
    const ruleSelect = backdrop.querySelector("#policy-rule-select") as HTMLSelectElement | null;
    const dateInput = backdrop.querySelector("#policy-date-input") as HTMLInputElement | null;
    const previewContainer = backdrop.querySelector("#policy-preview-result-container") as HTMLElement;
    const errorEl = backdrop.querySelector("#policy-dialog-error") as HTMLElement;

    const invalidatePreview = () => {
      this.previewToken = null;
      confirmBtn.disabled = true;
      previewContainer.innerHTML = "";
      errorEl.classList.remove("is-visible");
      errorEl.textContent = "";
    };

    if (ruleSelect) ruleSelect.addEventListener("change", invalidatePreview);
    if (dateInput) dateInput.addEventListener("input", invalidatePreview);
    reasonInput.addEventListener("input", invalidatePreview);

    const handleClose = () => this.close();
    closeBtn.addEventListener("click", handleClose);
    cancelBtn.addEventListener("click", handleClose);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 영향 확인 버튼
    previewBtn.addEventListener("click", async () => {
      if (this.isBusy) return;
      errorEl.classList.remove("is-visible");
      errorEl.textContent = "";

      const reason = reasonInput.value.trim();
      if (!reason) {
        errorEl.textContent = "변경 사유를 입력해 주세요.";
        errorEl.classList.add("is-visible");
        return;
      }

      const effectiveFrom = dateInput ? dateInput.value.trim() : undefined;
      const ruleKey = ruleSelect ? (ruleSelect.value as PolicyRuleKey) : undefined;

      if (options.action !== "cancel" && !effectiveFrom) {
        errorEl.textContent = "적용 시작일을 선택해 주세요.";
        errorEl.classList.add("is-visible");
        return;
      }

      this.isBusy = true;
      previewBtn.disabled = true;
      previewBtn.textContent = "확인 중...";

      try {
        const res = await this.bridge.previewPolicyChange({
          action: options.action,
          kind: options.kind,
          ruleKey,
          effectiveFrom,
          reason,
          targetRevisionId: options.targetRevisionId,
        });

        if (!res.ok) {
          throw new Error(res.message || "영향 미리보기에 실패했습니다.");
        }

        const data: PolicyChangePreviewResult = res.data;
        this.previewToken = data.previewToken;

        previewContainer.innerHTML = `
          <div class="policy-impact-preview-box">
            <div class="policy-impact-title">미리보기 완료 (5분 유효)</div>
            <div>${data.impactSummary}</div>
            <div class="policy-impact-note">기존에 이미 승인된 실적 및 산출 금액은 보존됩니다.</div>
          </div>
        `;
        confirmBtn.disabled = false;
      } catch (err: unknown) {
        errorEl.textContent = (err as Error).message;
        errorEl.classList.add("is-visible");
        invalidatePreview();
      } finally {
        this.isBusy = false;
        previewBtn.disabled = false;
        previewBtn.textContent = "영향 확인";
      }
    });

    // 확인 후 등록 버튼
    confirmBtn.addEventListener("click", async () => {
      if (this.isBusy || !this.previewToken) return;

      this.isBusy = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "저장 중...";

      try {
        const res = await this.bridge.applyPolicyChange({
          previewToken: this.previewToken,
        });

        if (!res.ok) {
          throw new Error(res.message || "정책 변경 적용에 실패했습니다.");
        }

        this.close();
        options.onSuccess();
      } catch (err: unknown) {
        errorEl.textContent = (err as Error).message;
        errorEl.classList.add("is-visible");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "확인 후 등록";
      } finally {
        this.isBusy = false;
      }
    });
  }

  close() {
    if (this.backdropEl) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }
    this.previewToken = null;
    this.isBusy = false;
  }
}
