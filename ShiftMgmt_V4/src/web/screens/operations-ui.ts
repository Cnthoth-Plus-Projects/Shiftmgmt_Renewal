// 운영 관리 화면 UI 헬퍼 및 대화상자/메시지 공통 유틸리티
import { WorkforceDialog } from "./workforce-dialog";
import type { BridgeResult } from "../../shared/bridge/contracts";

export const sharedDialog = new WorkforceDialog();

/** 간단한 DOM 요소 생성 헬퍼 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** 텍스트 노드가 포함된 버튼 생성 */
export function createButton(
  label: string,
  variant: "primary" | "secondary" | "danger" = "secondary",
  onClick?: (e: MouseEvent) => void
): HTMLButtonElement {
  const btn = el("button", `btn btn-${variant}`, label);
  btn.type = "button";
  if (onClick) {
    btn.addEventListener("click", onClick);
  }
  return btn;
}

/** 라벨과 입력 필드를 묶는 그룹 생성 */
export function createFormGroup(
  label: string,
  inputEl: HTMLElement,
  helpText?: string,
  errorEl?: HTMLElement
): HTMLElement {
  const group = el("div", "form-group");
  const labelEl = el("label", "form-label", label);
  group.appendChild(labelEl);
  group.appendChild(inputEl);
  if (helpText) {
    const help = el("div", "form-help", helpText);
    group.appendChild(help);
  }
  if (errorEl) {
    group.appendChild(errorEl);
  }
  return group;
}

/** BridgeResult의 실패 메시지를 한국어 친화적으로 포맷팅 */
export function formatErrorMessage(
  result: BridgeResult<unknown> | null | undefined,
  defaultMsg = "작업 처리에 실패했습니다."
): string {
  if (!result || result.ok) return "";
  const code = result.errorCode;
  const msg = result.message;
  if (msg && /(?:database|sqlite).*(?:locked|busy)|SQLITE_(?:BUSY|LOCKED)/i.test(msg)) {
    return "데이터베이스를 다른 작업에서 사용 중입니다. 관련 작업이나 프로그램을 닫은 뒤 다시 시도해 주세요.";
  }

  if (code === "AUTH_FORBIDDEN") {
    return "관리자 권한이 필요합니다. 관리자 계정으로 로그인해 주세요.";
  }
  if (code === "AUTH_SESSION_REQUIRED" || code === "SESSION_EXPIRED") {
    return "인증 세션이 필요하거나 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (code === "STALE_REVISION") {
    return "다른 사용자에 의해 데이터가 변경되었습니다. 최신 데이터를 다시 불러오세요.";
  }
  if (code === "INVALID_INPUT") {
    return msg || "입력값이 올바르지 않습니다.";
  }

  return msg || defaultMsg;
}

/** 알림 팝업 */
export function showNotice(
  title: string,
  message: string,
  variant: "info" | "warning" | "error" = "info",
  onClose?: () => void
): void {
  const content = el("div", "modal-body-notice");
  const msgEl = el("p", `notice-message notice-${variant}`, message);
  content.appendChild(msgEl);

  const overlay = sharedDialog.open({
    id: "operations-notice-modal",
    initialFocusSelector: "#btn-notice-close",
    title,
    width: "440px",
    content,
    buttons: [
      {
        id: "btn-notice-close",
        label: "확인",
        variant: "primary",
        onClick: () => {
          sharedDialog.close();
        }
      }
    ],
    onClose
  });
  overlay.querySelector<HTMLButtonElement>("#btn-notice-close")?.focus();
}

/** 확인(Confirm) 대화상자 */
export function showConfirm(options: {
  title: string;
  message: string;
  subMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  triggerElement?: HTMLElement | null;
}): void {
  let confirmed = false;
  const content = el("div", "modal-body-confirm");
  const msgEl = el("p", "confirm-main-msg", options.message);
  content.appendChild(msgEl);
  if (options.subMessage) {
    const sub = el("p", "confirm-sub-msg", options.subMessage);
    content.appendChild(sub);
  }

  const overlay = sharedDialog.open({
    id: "operations-confirm-modal",
    initialFocusSelector: "#btn-confirm-cancel",
    title: options.title,
    triggerElement: options.triggerElement,
    width: "460px",
    content,
    buttons: [
      {
        id: "btn-confirm-cancel",
        label: options.cancelLabel || "취소",
        variant: "secondary",
        onClick: () => {
          sharedDialog.close();
        }
      },
      {
        id: "btn-confirm-ok",
        label: options.confirmLabel || "확인",
        variant: options.variant || "primary",
        onClick: async () => {
          try {
            if (confirmed) return;
            confirmed = true;
            sharedDialog.close();
            await options.onConfirm();
          } catch (e) {
            console.error(e);
          }
        }
      }
    ],
    onClose: () => { if (!confirmed) options.onCancel?.(); }
  });
  overlay.querySelector<HTMLButtonElement>("#btn-confirm-cancel")?.focus();
}

/** 특정 문자열 입력을 요구하는 확인 대화상자 (예: DB 교체 시 '교체' 입력) */
export function showPromptConfirm(options: {
  title: string;
  message: string;
  warningText?: string;
  requiredText: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}): void {
  let confirmed = false;
  const content = el("div", "modal-body-prompt");
  const msgEl = el("p", "prompt-msg", options.message);
  content.appendChild(msgEl);

  if (options.warningText) {
    const warn = el("div", "alert-warning", options.warningText);
    content.appendChild(warn);
  }

  const guide = el(
    "p",
    "prompt-guide",
    `계속 진행하려면 아래 입력창에 "${options.requiredText}"을(를) 정확히 입력하세요:`
  );
  content.appendChild(guide);

  const input = el("input", "form-control prompt-input") as HTMLInputElement;
  input.type = "text";
  input.placeholder = options.requiredText;
  content.appendChild(input);

  const errEl = el("div", "form-error", "");
  errEl.style.display = "none";
  content.appendChild(errEl);

  sharedDialog.open({
    id: "operations-prompt-modal",
    initialFocusSelector: ".prompt-input",
    title: options.title,
    width: "480px",
    content,
    buttons: [
      {
        id: "btn-prompt-cancel",
        label: "취소",
        variant: "secondary",
        onClick: () => {
          sharedDialog.close();
        }
      },
      {
        id: "btn-prompt-ok",
        label: options.confirmLabel || "실행",
        variant: "danger",
        onClick: async () => {
          if (input.value.trim() !== options.requiredText) {
            errEl.textContent = `"${options.requiredText}"을(를) 정확히 입력해야 합니다.`;
            errEl.style.display = "block";
            input.focus();
            return;
          }
          errEl.style.display = "none";
          try {
            if (confirmed) return;
            confirmed = true;
            sharedDialog.close();
            await options.onConfirm();
          } catch (e) {
            console.error(e);
          }
        }
      }
    ],
    onClose: () => { if (!confirmed) options.onCancel?.(); }
  });
}

/** HTML 특수문자 이스케이프 유틸리티 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** 상태 배지 렌더러 */
export function renderStatusBadge(
  status: string,
  customLabel?: string
): HTMLElement {
  const badge = el("span", `status-badge status-${status}`);
  let label = customLabel;
  if (!label) {
    switch (status) {
      case "active":
        label = "활성";
        break;
      case "draft":
        label = "초안";
        break;
      case "retired":
        label = "만료";
        break;
      case "suspended":
        label = "정지";
        break;
      default:
        label = status;
    }
  }
  badge.textContent = label;
  return badge;
}
