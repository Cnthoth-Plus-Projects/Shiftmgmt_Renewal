// 운영 관리 메인 화면 (R01, R14)
// 7개 탭 조율 및 관리자 권한 가드
import type { AuthSession } from "../../shared/domain/model";
import { el, showConfirm, sharedDialog } from "./operations-ui";
import { OperationsSettingsTab } from "./operations-settings";
import { OperationsHolidaysTab } from "./operations-holidays";
import { OperationsRatesTab } from "./operations-rates";
import { OperationsUsersTab } from "./operations-users";
import { OperationsSiteNamesTab } from "./operations-site-names";
import { OperationsReleasesTab } from "./operations-releases";
import { OperationsLayoutTab } from "./operations-layout";

export type OperationsTabId =
  | "settings"
  | "holidays"
  | "rates"
  | "users"
  | "layout"
  | "site-names"
  | "releases";

interface TabConfig {
  id: OperationsTabId;
  label: string;
}

const TABS: TabConfig[] = [
  { id: "settings", label: "설정" },
  { id: "holidays", label: "공휴일" },
  { id: "rates", label: "요율" },
  { id: "users", label: "사용자" },
  { id: "layout", label: "양식 편집" },
  { id: "site-names", label: "근무지 이름" },
  { id: "releases", label: "릴리즈 이력" }
];

export interface OperationsScreenOptions {
  container: HTMLElement;
  session?: AuthSession;
  initialTab?: OperationsTabId;
  onSessionExpired?: () => void;
}

export class OperationsScreen {
  private container: HTMLElement;
  private session?: AuthSession;
  private currentTab: OperationsTabId = "settings";
  private onSessionExpired?: () => void;
  private isSessionExpiredTriggered = false;
  private activeTabInstance: { init: () => Promise<void>; destroy: () => void; isDirty?: () => boolean } | null = null;
  private tabButtons: Map<OperationsTabId, HTMLButtonElement> = new Map();
  private tabContentEl?: HTMLElement;
  private isDestroyed = false;
  private mountRequestId = 0;

  constructor(
    optionsOrContainer: OperationsScreenOptions | HTMLElement,
    session?: AuthSession,
    initialTab: OperationsTabId = "settings"
  ) {
    if ("container" in optionsOrContainer) {
      this.container = optionsOrContainer.container;
      this.session = optionsOrContainer.session;
      this.currentTab = optionsOrContainer.initialTab || "settings";
      this.onSessionExpired = optionsOrContainer.onSessionExpired;
    } else {
      this.container = optionsOrContainer;
      this.session = session;
      this.currentTab = initialTab;
    }
  }

  public reportSessionExpired(): void {
    if (this.isSessionExpiredTriggered || this.isDestroyed) return;
    this.isSessionExpiredTriggered = true;
    this.onSessionExpired?.();
  }

  public isDirty(): boolean {
    if (this.isDestroyed || !this.activeTabInstance) return false;
    if (typeof this.activeTabInstance.isDirty === "function") {
      return this.activeTabInstance.isDirty();
    }
    return false;
  }

  public async render(): Promise<void> {
    this.container.innerHTML = "";
    this.isDestroyed = false;

    // 1. 관리자 권한 가드 (R01, N01) - 세션 없거나 비관리자는 조회 전 즉시 차단
    if (!this.session || this.session.role !== "admin") {
      const guardBox = el("div", "operations-forbidden-guard");
      guardBox.appendChild(el("h3", "guard-title", "운영 관리 접근 권한 제한"));
      guardBox.appendChild(
        el("p", "guard-desc", "관리자 권한이 필요합니다. 관리자 계정으로 로그인해 주세요.")
      );
      this.container.appendChild(guardBox);
      return;
    }

    // 2. 운영 관리 메인 래퍼
    const wrap = el("div", "operations-screen-root");

    // 화면 타이틀
    const header = el("div", "operations-screen-header");
    header.appendChild(el("h2", "screen-title", "시스템 운영 관리"));
    wrap.appendChild(header);

    // 3. 7개 탭 내비게이션 바 (ARIA tablist)
    const tabList = el("div", "operations-tab-list");
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-label", "운영 관리 탭 메뉴");

    TABS.forEach((t, index) => {
      const btn = el("button", `tab-btn ${t.id === this.currentTab ? "active" : ""}`, t.label);
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("id", `tab-btn-${t.id}`);
      btn.setAttribute("aria-controls", `tab-panel-${t.id}`);
      btn.setAttribute("aria-selected", t.id === this.currentTab ? "true" : "false");
      btn.tabIndex = t.id === this.currentTab ? 0 : -1;

      btn.addEventListener("click", () => {
        this.switchTab(t.id);
      });

      // 키보드 내비게이션 (Left, Right, Home, End)
      btn.addEventListener("keydown", (e) => {
        let targetIndex = -1;
        if (e.key === "ArrowRight") {
          targetIndex = (index + 1) % TABS.length;
        } else if (e.key === "ArrowLeft") {
          targetIndex = (index - 1 + TABS.length) % TABS.length;
        } else if (e.key === "Home") {
          targetIndex = 0;
        } else if (e.key === "End") {
          targetIndex = TABS.length - 1;
        }

        if (targetIndex >= 0) {
          e.preventDefault();
          const targetTab = TABS[targetIndex];
          this.switchTab(targetTab.id);
        }
      });

      this.tabButtons.set(t.id, btn);
      tabList.appendChild(btn);
    });

    wrap.appendChild(tabList);

    // 4. 탭 콘텐츠 영역
    const content = el("div", "operations-tab-content");
    content.setAttribute("role", "tabpanel");
    content.setAttribute("id", `tab-panel-${this.currentTab}`);
    content.setAttribute("aria-labelledby", `tab-btn-${this.currentTab}`);
    this.tabContentEl = content;
    wrap.appendChild(content);

    this.container.appendChild(wrap);

    // 초기 선택된 탭 마운트
    await this.mountTab(this.currentTab);
  }

  public async switchTab(tabId: OperationsTabId): Promise<void> {
    if (this.isDestroyed) return;
    if (this.currentTab === tabId && this.activeTabInstance) return;

    // 미저장 초안 확인 가드 (UI02-D02)
    if (this.isDirty()) {
      showConfirm({
        title: "저장되지 않은 변경사항",
        message: "저장되지 않은 변경사항이 있습니다. 다른 탭으로 이동하시겠습니까?",
        subMessage: "이동하면 작성 중인 초안 내용이 모두 사라집니다.",
        confirmLabel: "이동하기 (변경사항 삭제)",
        cancelLabel: "계속 편집",
        variant: "danger",
        triggerElement: this.tabButtons.get(this.currentTab),
        onCancel: () => { if (!this.isDestroyed) this.tabButtons.get(this.currentTab)?.focus(); },
        onConfirm: async () => {
          await this.doSwitchTab(tabId);
        }
      });
      return;
    }

    await this.doSwitchTab(tabId);
  }

  private async doSwitchTab(tabId: OperationsTabId): Promise<void> {
    if (this.isDestroyed) return;
    // 이전 탭 버튼 상태 업데이트
    const prevBtn = this.tabButtons.get(this.currentTab);
    if (prevBtn) {
      prevBtn.classList.remove("active");
      prevBtn.setAttribute("aria-selected", "false");
      prevBtn.tabIndex = -1;
    }

    // 새 탭 버튼 상태 업데이트
    this.currentTab = tabId;
    const newBtn = this.tabButtons.get(tabId);
    if (newBtn) {
      newBtn.classList.add("active");
      newBtn.setAttribute("aria-selected", "true");
      newBtn.tabIndex = 0;
      newBtn.focus();
    }

    if (this.tabContentEl) {
      this.tabContentEl.setAttribute("id", `tab-panel-${tabId}`);
      this.tabContentEl.setAttribute("aria-labelledby", `tab-btn-${tabId}`);
    }

    await this.mountTab(tabId);
  }

  private async mountTab(tabId: OperationsTabId): Promise<void> {
    if (!this.tabContentEl || this.isDestroyed) return;
    const reqId = ++this.mountRequestId;
    sharedDialog.close();

    // 이전 탭 정리
    if (this.activeTabInstance) {
      this.activeTabInstance.destroy();
      this.activeTabInstance = null;
    }

    this.tabContentEl.innerHTML = "";

    // 새 탭 인스턴스 생성 및 초기화
    switch (tabId) {
      case "settings":
        this.activeTabInstance = new OperationsSettingsTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
      case "holidays":
        this.activeTabInstance = new OperationsHolidaysTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
      case "rates":
        this.activeTabInstance = new OperationsRatesTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
      case "users":
        this.activeTabInstance = new OperationsUsersTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
      case "layout":
        this.activeTabInstance = new OperationsLayoutTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
      case "site-names":
        this.activeTabInstance = new OperationsSiteNamesTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
      case "releases":
        this.activeTabInstance = new OperationsReleasesTab(this.tabContentEl, () => this.reportSessionExpired());
        break;
    }

    if (this.activeTabInstance) {
      const instance = this.activeTabInstance;
      await instance.init();
      if (this.isDestroyed || this.mountRequestId !== reqId) {
        if (this.activeTabInstance === instance) {
          instance.destroy();
          this.activeTabInstance = null;
        }
      }
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.mountRequestId++;
    sharedDialog.close();
    if (this.activeTabInstance) {
      this.activeTabInstance.destroy();
      this.activeTabInstance = null;
    }
    this.container.innerHTML = "";
  }
}
