import type { BrowserAppBridge } from "../bridge/app-bridge";
import type {
  PolicyKind,
  PolicyRuleKey,
} from "../../shared/domain/policy-history";
import type { PolicyChangePreviewResult } from "../../shared/bridge/contracts";
import { sharedDialog } from "./operations-ui";

/** Use the common accessible dialog, while keeping policy selectors and layout. */
export function openPolicyModal(backdrop: HTMLElement, id: string, triggerElement: HTMLElement | null, onClose: () => void): { overlay: HTMLElement; token: number } {
  const content = document.createElement("div");
  content.className = "policy-modal-content";
  const title = backdrop.querySelector("h2")?.textContent ?? "정책 이력";
  const compact = !!backdrop.querySelector(".compact");
  const toolbar = backdrop.querySelector(".policy-dialog-header-right");
  toolbar?.querySelector(".btn-close-dialog")?.remove();
  if (toolbar) content.appendChild(toolbar);
  for (const child of Array.from(backdrop.querySelectorAll(".policy-dialog-content, .policy-pagination"))) content.appendChild(child);
  const overlay = sharedDialog.open({ id, title, content, triggerElement, onClose, initialFocusSelector: "input, select, textarea, button" });
  overlay.classList.add("policy-history-dialog-backdrop");
  overlay.querySelector(".workforce-modal-box")?.classList.add("policy-history-dialog");
  if (compact) overlay.querySelector(".workforce-modal-box")?.classList.add("compact");
  overlay.querySelector(".workforce-modal-header button")?.classList.add("btn-close-dialog");
  return { overlay, token: sharedDialog.captureToken() };
}

export interface OpenPolicyDialogOptions {
  action: "add" | "correct" | "cancel";
  kind: PolicyKind;
  targetRevisionId?: string;
  initialRuleKey?: PolicyRuleKey;
  initialEffectiveFrom?: string;
  triggerElement?: HTMLElement;
  onSuccess: () => void;
  onClose?: () => void;
  expectedRegistryFingerprint?: string;
}

export class OperationsPolicyDialog {
  private backdropEl: HTMLElement | null = null;
  private previewToken: string | null = null;
  private isBusy = false;
  private generation = 0;
  private currentRequestId = 0;
  private modalToken: number | null = null;
  private triggerElement: HTMLElement | null = null;

  constructor(private bridge: BrowserAppBridge, private onSessionExpired?: () => void) {}

  public getBusy(): boolean {
    return this.isBusy;
  }

  open(options: OpenPolicyDialogOptions) {
    this.close();

    this.generation++;
    const currentGen = this.generation;
    this.currentRequestId++;
    this.previewToken = null;
    this.triggerElement = options.triggerElement ?? (document.activeElement as HTMLElement | null);

    let backdrop: HTMLElement = document.createElement("div");
    backdrop.className = "policy-history-dialog-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const titleId = `policy-dialog-title-${currentGen}`;
    backdrop.setAttribute("aria-labelledby", titleId);

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
      <div class="policy-history-dialog compact" role="document">
        <div class="policy-dialog-header">
          <h2 id="${titleId}" class="policy-dialog-title">${actionLabel} — ${kindLabel}</h2>
          <button type="button" class="btn-close-dialog policy-btn-close" aria-label="닫기">&times;</button>
        </div>
        <div class="policy-dialog-content">
          <form id="policy-dialog-form" class="policy-form-layout" >
            ${
              options.action !== "cancel"
                ? `
              <div class="form-group">
                <label for="policy-rule-select" class="policy-form-label">적용할 기준</label>
                <select id="policy-rule-select" class="form-control policy-form-select">
                  ${ruleOptions
                    .map(
                      (r) =>
                        `<option value="${r.key}" ${options.initialRuleKey === r.key ? "selected" : ""}>${escapeHtml(r.label)}</option>`
                    )
                    .join("")}
                </select>
              </div>
              <div class="form-group">
                <label for="policy-date-input" class="policy-form-label">적용 시작일 (근무일 기준)</label>
                <input type="date" id="policy-date-input" class="form-control policy-form-input" value="${escapeHtml(options.initialEffectiveFrom ?? "")}" />
              </div>
            `
                : ""
            }
            <div class="form-group">
              <label for="policy-reason-input" class="policy-form-label">사유 (필수)</label>
              <textarea id="policy-reason-input" class="form-control policy-form-textarea" rows="3" maxlength="500" aria-describedby="policy-dialog-error" placeholder="정책 변경/취소 사유를 입력하세요."></textarea>
            </div>
            <div id="policy-preview-result-container"></div>
            <div id="policy-dialog-error" class="policy-dialog-error" role="alert"></div>
          </form>
        </div>
        <div class="policy-pagination dialog-actions">
          <button type="button" id="btn-policy-preview" class="btn btn-secondary policy-btn-secondary">영향 확인</button>
          <button type="button" id="btn-policy-confirm" class="btn btn-primary policy-btn-primary" disabled>확인 후 등록</button>
          <button type="button" id="btn-policy-cancel" class="btn btn-secondary policy-btn-secondary">취소</button>
        </div>
      </div>
    `;

    const modal = openPolicyModal(backdrop, "operations-policy-editor", this.triggerElement, () => {
      this.modalToken = null;
      this.close();
      options.onClose?.();
    });
    backdrop = modal.overlay;
    this.modalToken = modal.token;
    this.backdropEl = backdrop;

    const cancelBtn = backdrop.querySelector("#btn-policy-cancel") as HTMLElement;
    const previewBtn = backdrop.querySelector("#btn-policy-preview") as HTMLButtonElement;
    const confirmBtn = backdrop.querySelector("#btn-policy-confirm") as HTMLButtonElement;
    const reasonInput = backdrop.querySelector("#policy-reason-input") as HTMLTextAreaElement;
    const ruleSelect = backdrop.querySelector("#policy-rule-select") as HTMLSelectElement | null;
    const dateInput = backdrop.querySelector("#policy-date-input") as HTMLInputElement | null;
    const previewContainer = backdrop.querySelector("#policy-preview-result-container") as HTMLElement;
    const errorEl = backdrop.querySelector("#policy-dialog-error") as HTMLElement;
    const formEl = backdrop.querySelector("#policy-dialog-form") as HTMLFormElement | null;
    formEl?.addEventListener("submit", (e) => e.preventDefault());

    // 입력값 변경 시 previewToken 무효화 및 confirm 비활성화 (단, 에러는 사용자가 의도적으로 확인하도록 분리)
    let applying = false;
    const invalidatePreviewOnly = () => {
      if (applying) return;
      this.currentRequestId++;
      this.previewToken = null;
      confirmBtn.disabled = true;
      previewContainer.innerHTML = "";
    };

    if (ruleSelect) {
      ruleSelect.addEventListener("change", () => {
        invalidatePreviewOnly();
      });
    }
    if (dateInput) {
      dateInput.addEventListener("input", () => {
        invalidatePreviewOnly();
      });
    }
    reasonInput.addEventListener("input", () => {
      invalidatePreviewOnly();
    });

    const handleClose = () => this.close();
    cancelBtn.addEventListener("click", handleClose);

    // 영향 확인 버튼
    previewBtn.addEventListener("click", async () => {
      if (this.isBusy || currentGen !== this.generation) return;
      errorEl.classList.remove("is-visible");
      errorEl.textContent = "";

      const reason = reasonInput.value.trim();
      if (!reason) {
        errorEl.textContent = "변경 사유를 입력해 주세요.";
        errorEl.classList.add("is-visible");
        reasonInput.focus();
        return;
      }

      const effectiveFrom = dateInput ? dateInput.value.trim() : undefined;
      const ruleKey = ruleSelect ? (ruleSelect.value as PolicyRuleKey) : undefined;

      if (options.action !== "cancel" && !effectiveFrom) {
        errorEl.textContent = "적용 시작일을 선택해 주세요.";
        errorEl.classList.add("is-visible");
        dateInput?.focus();
        return;
      }

      const reqId = ++this.currentRequestId;
      this.previewToken = null;
      confirmBtn.disabled = true;
      previewContainer.replaceChildren();
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
          expectedRegistryConfigFingerprint: options.expectedRegistryFingerprint,
        });

        if (currentGen !== this.generation || reqId !== this.currentRequestId || !this.backdropEl) {
          return;
        }

        if (!res.ok) {
          if (["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(res.errorCode)) { this.close(); this.onSessionExpired?.(); return; }
          throw new Error(res.message || "영향 미리보기에 실패했습니다.");
        }

        const data: PolicyChangePreviewResult = res.data;
        this.previewToken = data.previewToken;

        previewContainer.innerHTML = `
          <div class="policy-impact-preview-box">
            <div class="policy-impact-title">미리보기 완료 (5분 유효)</div>
            <div>${escapeHtml(data.impactSummary)}</div>
            <div class="policy-impact-note">기존에 이미 승인된 실적 및 산출 금액은 보존됩니다.</div>
          </div>
        `;
        confirmBtn.disabled = false;
      } catch (err: unknown) {
        if (currentGen !== this.generation || reqId !== this.currentRequestId || !this.backdropEl) {
          return;
        }
        errorEl.textContent = (err as Error).message || "영향 미리보기 중 오류가 발생했습니다.";
        errorEl.classList.add("is-visible");
        this.previewToken = null;
        confirmBtn.disabled = true;
        previewContainer.innerHTML = "";
      } finally {
        if (currentGen === this.generation && this.backdropEl) {
          this.isBusy = false;
          previewBtn.disabled = false;
          previewBtn.textContent = "영향 확인";
        }
      }
    });

    // 확인 후 등록 버튼
    confirmBtn.addEventListener("click", async () => {
      if (this.isBusy || !this.previewToken || currentGen !== this.generation) return;

      const reqId = ++this.currentRequestId;
      const tokenToApply = this.previewToken;
      applying = true;
      formEl?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea").forEach(field => {field.disabled = true;});
      this.isBusy = true;
      sharedDialog.setProcessing(true, "정책을 저장하고 있습니다. 잠시 기다려 주세요.", this.modalToken ?? undefined);
      confirmBtn.disabled = true;
      confirmBtn.textContent = "저장 중...";

      try {
        const res = await this.bridge.applyPolicyChange({
          previewToken: tokenToApply,
        });

        if (currentGen !== this.generation || reqId !== this.currentRequestId) {
          return;
        }

        if (!res.ok) {
          if (["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(res.errorCode)) { this.close(); this.onSessionExpired?.(); return; }
          throw new Error(res.message || "정책 변경 적용에 실패했습니다.");
        }

        options.onSuccess();
        this.close();
      } catch (err: unknown) {
        if (currentGen !== this.generation || reqId !== this.currentRequestId || !this.backdropEl) {
          return;
        }
        errorEl.textContent = (err as Error).message || "정책 등록 적용 중 오류가 발생했습니다.";
        errorEl.classList.add("is-visible");
        this.previewToken = null;
      } finally {
        if (currentGen === this.generation && this.backdropEl) {
          applying = false;
          formEl?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea").forEach(field => {field.disabled = false;});
          sharedDialog.setProcessing(false, undefined, this.modalToken ?? undefined);
          confirmBtn.disabled = !this.previewToken;
          confirmBtn.textContent = "확인 후 등록";
          this.isBusy = false;
        }
      }
    });
  }

  close() {
    this.generation++;
    this.currentRequestId++;
    this.previewToken = null;
    this.isBusy = false;

    this.backdropEl = null;
    const token = this.modalToken;
    this.modalToken = null;
    if (token !== null && sharedDialog.isCurrent(token)) sharedDialog.close();

    if (this.triggerElement) {
      if (this.triggerElement.isConnected) this.triggerElement.focus();
      this.triggerElement = null;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
