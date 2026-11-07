// 운영 관리 화면 UI 헬퍼 및 대화상자/메시지 공통 유틸리티
import { WorkforceDialog } from "./workforce-dialog";
import type { BridgeResult } from "../../shared/bridge/contracts";
import type { DataTable } from "../data-table";
import { measurePaginationBody } from "../pagination";

class OperationsDialog extends WorkforceDialog {
  public override open(options: Parameters<WorkforceDialog["open"]>[0]): HTMLElement {
    const overlay = super.open(options);
    overlay.classList.add("ops-dialog");
    return overlay;
  }
}
export const sharedDialog = new OperationsDialog();

export function operationsIcon(name: string): HTMLElement {
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined ops-action-icon";
  icon.textContent = name;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

export interface OperationsArea {
  id: string;
  label: string;
  hint: string;
  description: string;
  icon: string;
  content: HTMLElement;
}

/** 운영 관리의 카테고리·제목·본문·작업 바. 영역 전환은 DOM과 초안을 재생성하지 않는다. */
export class OperationsWorkspace {
  public readonly actions = el("div", "ops-menu-actions");
  private readonly nav = el("div", "ops-category-nav");
  private readonly title = el("h3", "ops-menu-title");
  private readonly description = el("p", "ops-menu-description");
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly fits: Array<() => void> = [];
  private readonly observer: ResizeObserver;
  private frame: number | null = null;
  private busy = false;
  private destroyed = false;
  public activeArea: string;

  constructor(private root: HTMLElement, private options: {
    id: string;
    areas: OperationsArea[];
    initialArea?: string;
    context?: HTMLElement;
    footerText: string;
    canChange?: () => boolean;
    onChange?: (area: string) => void;
  }) {
    this.activeArea = options.initialArea || options.areas[0].id;
    root.classList.add("ops-menu-workspace");
    root.dataset.opsMenu = options.id;
    this.nav.setAttribute("role", "tablist");
    this.nav.setAttribute("aria-label", "세부 카테고리");
    const main = el("div", "ops-menu-main"), heading = el("div", "ops-menu-heading");
    const intro = el("div", "ops-menu-intro"); intro.append(this.title, this.description);
    heading.appendChild(intro);
    if (options.context) { options.context.classList.add("ops-menu-context"); heading.appendChild(options.context); }
    const panels = el("div", "ops-menu-panels");
    for (const [index, area] of options.areas.entries()) {
      const button = el("button", "ops-category-button"); button.type = "button";
      button.id = `ops-${options.id}-area-${area.id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `ops-${options.id}-panel-${area.id}`);
      const copy = el("span", "ops-category-copy"); copy.append(el("strong", "", area.label), el("small", "", area.hint));
      button.append(operationsIcon(area.icon), copy);
      button.addEventListener("click", () => this.select(area.id));
      button.addEventListener("keydown", event => {
        const horizontal = window.innerWidth <= 1100;
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.areas.length - 1
          : event.key === (horizontal ? "ArrowRight" : "ArrowDown") ? (index + 1) % options.areas.length
          : event.key === (horizontal ? "ArrowLeft" : "ArrowUp") ? (index + options.areas.length - 1) % options.areas.length : -1;
        if (next >= 0) { event.preventDefault(); if (this.select(options.areas[next].id)) this.buttons.get(options.areas[next].id)?.focus(); }
      });
      this.buttons.set(area.id, button); this.nav.appendChild(button);
      area.content.classList.add("ops-menu-panel");
      area.content.id = `ops-${options.id}-panel-${area.id}`;
      area.content.setAttribute("role", "tabpanel"); area.content.setAttribute("aria-labelledby", button.id);
      panels.appendChild(area.content);
    }
    const footer = el("div", "ops-menu-footer");
    footer.append(el("p", "ops-menu-footnote", options.footerText), this.actions);
    main.append(heading, panels, footer); root.replaceChildren(this.nav, main);
    this.observer = new ResizeObserver(() => this.scheduleFit()); this.observer.observe(root);
    this.applyArea();
  }

  public select(area: string): boolean {
    if (this.destroyed || this.busy || this.options.canChange?.() === false || !this.buttons.has(area)) return false;
    this.activeArea = area; this.applyArea(); this.options.onChange?.(area); return true;
  }

  public setBusy(busy: boolean): void {
    this.busy = busy;
    this.buttons.forEach(button => { button.disabled = busy; });
  }

  public observeTable<T>(table: DataTable<T>, host: HTMLElement): void {
    this.fits.push(() => {
      if (!host.isConnected || !host.getClientRects().length) return;
      const viewport = host.querySelector<HTMLElement>(".dt-table-wrapper"), head = host.querySelector<HTMLElement>("thead");
      if (!viewport || !head) return;
      const height = measurePaginationBody(viewport, head);
      table.setPageSize(height > 0 ? Math.max(1, Math.floor(height / 34)) : 10);
    });
    this.scheduleFit();
  }

  private applyArea(): void {
    const active = this.options.areas.find(area => area.id === this.activeArea) || this.options.areas[0];
    this.activeArea = active.id;
    this.title.textContent = active.label; this.description.textContent = active.description;
    this.options.areas.forEach(area => {
      const selected = area.id === active.id, button = this.buttons.get(area.id)!;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
      area.content.hidden = !selected;
    });
    this.root.dataset.activeArea = active.id; this.scheduleFit();
  }

  private scheduleFit(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.destroyed || !this.root.isConnected) return;
      this.nav.setAttribute("aria-orientation", window.innerWidth <= 1100 ? "horizontal" : "vertical");
      this.fits.forEach(fit => fit());
    });
  }

  public destroy(): void {
    this.destroyed = true; this.observer.disconnect(); this.fits.length = 0;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }
}

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
  if (label === "수정" || label === "삭제") btn.prepend(operationsIcon(label === "수정" ? "edit" : "delete"));
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
      case "inactive":
        label = "비활성";
        break;
      case "pending":
        label = "대기";
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
