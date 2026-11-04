// 인력 관리 화면 전용 모달 및 접근성/포커스 트랩 관리
export interface ModalButtonConfig {
  id: string;
  label: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  onClick?: (e: MouseEvent) => void | Promise<void>;
  disabled?: boolean;
}

export interface ModalOpenOptions {
  id: string;
  title: string;
  width?: string;
  content: HTMLElement;
  buttons?: ModalButtonConfig[];
  initialFocusSelector?: string;
  triggerElement?: HTMLElement | null;
  onClose?: () => void;
}

export class WorkforceDialog {
  private overlayEl: HTMLElement | null = null;
  private currentTrigger: HTMLElement | null = null;
  private isProcessing = false;
  private revision = 0;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private buttonState = new Map<HTMLButtonElement, boolean>();
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private activeCloseCallback: (() => void) | null = null;

  public open(options: ModalOpenOptions): HTMLElement {
    this.close(); // 기존 열린 모달이 있다면 정리

    this.currentTrigger = options.triggerElement || (document.activeElement as HTMLElement) || null;
    this.activeCloseCallback = options.onClose || null;
    this.isProcessing = false;

    const overlay = document.createElement("div");
    overlay.className = "workforce-modal-overlay";
    overlay.id = options.id;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", `${options.id}-title`);
    overlay.tabIndex = -1;

    const box = document.createElement("div");
    box.className = "workforce-modal-box";
    if (options.width) {
      box.style.width = options.width;
    }

    // 헤더
    const header = document.createElement("div");
    header.className = "workforce-modal-header";

    const titleEl = document.createElement("h2");
    titleEl.id = `${options.id}-title`;
    titleEl.className = "workforce-modal-title";
    titleEl.textContent = options.title;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "workforce-btn workforce-btn-ghost";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">close</span>`;
    closeBtn.addEventListener("click", () => {
      if (!this.isProcessing) {
        this.close();
      }
    });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // 본문
    const body = document.createElement("div");
    body.className = "workforce-modal-body";
    body.appendChild(options.content);
    box.appendChild(body);

    // 푸터
    const footer = document.createElement("div");
    footer.className = "workforce-modal-footer";

    const processingNotice = document.createElement("div");
    processingNotice.className = "workforce-form-hint workforce-modal-processing-notice wf-hidden";
    processingNotice.textContent = "처리 중에는 이 화면을 유지해 주세요...";
    footer.appendChild(processingNotice);

    if (options.buttons && options.buttons.length > 0) {
      for (const btnConf of options.buttons) {
        const btn = document.createElement("button");
        btn.id = btnConf.id;
        btn.type = btnConf.type || "button";
        btn.className = `workforce-btn workforce-btn-${btnConf.variant || "secondary"}`;
        btn.textContent = btnConf.label;
        if (btnConf.disabled) {
          btn.disabled = true;
        }
        if (btnConf.onClick) {
          btn.addEventListener("click", async (e) => {
            if (this.isProcessing) return;
            await btnConf.onClick?.(e);
          });
        }
        footer.appendChild(btn);
      }
    }

    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    // 포커스 트랩 및 Esc 리스너
    this.setupFocusTrap(box, options.initialFocusSelector);

    return overlay;
  }

  public captureToken(): number { return this.revision; }

  public isCurrent(token: number): boolean { return this.overlayEl !== null && token === this.revision; }

  public setProcessing(processing: boolean, message?: string, token?: number): void {
    if (token !== undefined && !this.isCurrent(token)) return;
    this.isProcessing = processing;
    if (!this.overlayEl) return;

    const notice = this.overlayEl.querySelector<HTMLElement>(".workforce-modal-processing-notice");
    if (notice) {
      if (processing) {
        notice.classList.remove("wf-hidden");
        if (message) notice.textContent = message;
      } else {
        notice.classList.add("wf-hidden");
      }
    }

    // 닫기 버튼 및 푸터 버튼들 비활성화 토글 (UI01-D05: 원래 disabled 상태 보존)
    const buttons = this.overlayEl.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach((btn) => {
      if (processing) {
        if (!this.buttonState.has(btn)) this.buttonState.set(btn, btn.disabled);
        btn.disabled = true;
      } else if (this.buttonState.has(btn)) btn.disabled = this.buttonState.get(btn)!;
    });
    if (!processing) this.buttonState.clear();
  }

  public close(): void {
    this.buttonState.clear();
    this.revision++;
    if (this.focusTimer !== null) { clearTimeout(this.focusTimer); this.focusTimer = null; }
    this.isProcessing = false;

    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }

    if (this.overlayEl && this.overlayEl.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
      this.overlayEl = null;
    }

    if (this.activeCloseCallback) {
      const cb = this.activeCloseCallback;
      this.activeCloseCallback = null;
      cb();
    }

    // 포커스 복원
    if (this.currentTrigger?.isConnected && typeof this.currentTrigger.focus === "function") {
      try {
        this.currentTrigger.focus();
      } catch {
        // 포커스 복원 실패 무시
      }
      this.currentTrigger = null;
    }
  }

  public isOpen(): boolean {
    return this.overlayEl !== null;
  }

  private setupFocusTrap(modalBox: HTMLElement, initialFocusSelector?: string): void {
    const getFocusableElements = (): HTMLElement[] => {
      const selector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(modalBox.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null && el.tabIndex >= 0 && !el.matches(":disabled")
      );
    };

    // 초기 포커스 지정
    const token = this.captureToken();
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      if (!this.isCurrent(token)) return;
      if (initialFocusSelector) {
        const target = modalBox.querySelector<HTMLElement>(initialFocusSelector);
        if (target && typeof target.focus === "function") {
          target.focus();
          return;
        }
      }
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        modalBox.tabIndex = -1;
        modalBox.focus();
      }
    }, 10);

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!this.isProcessing) {
          e.preventDefault();
          this.close();
        }
        return;
      }

      if (e.key === "Tab") {
        const focusables = getFocusableElements();
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", this.keydownHandler);
  }
}
