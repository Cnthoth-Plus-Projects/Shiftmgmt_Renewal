// 앱 셸 (Shell, Header, Sidebar, Navigation, Content) 관리
import type { AuthSession } from "../../shared/domain/model";
import { StatusBar } from "./status-bar";
import { HomeScreen } from "./home";
import { AccessHistoryScreen } from "./access-history";
import { WorkforceScreen } from "./workforce";

export interface ShellScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSignOut: () => void;
  onSessionExpired?: () => void;
}

interface NavMenuItem {
  id: string;
  label: string;
  icon: string;
  group: "ready" | "ops" | "settle" | "admin";
  adminOnly?: boolean;
}

const MENU_ITEMS: NavMenuItem[] = [
  // 준비
  { id: "schedule-create", label: "근무표 생성", icon: "calendar_add_on", group: "ready" },
  { id: "performance-intake", label: "실적 가져오기", icon: "upload_file", group: "ready" },
  // 운영
  { id: "workforce", label: "인력 관리", icon: "badge", group: "ops" },
  { id: "schedule-status", label: "근무 현황", icon: "dashboard", group: "ops" },
  { id: "schedule-adjust", label: "근무표 조정", icon: "edit_calendar", group: "ops" },
  // 정산
  { id: "allowance-calc", label: "수당 계산", icon: "calculate", group: "settle" },
  { id: "proposal-export", label: "품의서 출력", icon: "description", group: "settle" },
  // 관리 (admin only)
  { id: "org-mgmt", label: "조직 관리", icon: "corporate_fare", group: "admin", adminOnly: true },
  { id: "user-mgmt", label: "사용자 관리", icon: "manage_accounts", group: "admin", adminOnly: true },
  { id: "access-history", label: "활동 이력", icon: "history", group: "admin", adminOnly: true },
];

export class ShellScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSignOut: () => void;
  private onSessionExpired?: () => void;
  private isSidebarCollapsed = false;
  private currentTitle = "홈";
  private noticeMessage = "";
  private statusBar: StatusBar | null = null;
  private homeScreen: HomeScreen | null = null;
  private accessHistoryScreen: AccessHistoryScreen | null = null;
  private workforceScreen: WorkforceScreen | null = null;
  private syncObserver: MutationObserver | null = null;

  constructor(options: ShellScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSignOut = options.onSignOut;
    this.onSessionExpired = options.onSessionExpired;
  }

  public render(): void {
    this.container.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "app-shell";

    // 1. 본문 바로가기 링크 (접근성)
    const skipLink = document.createElement("a");
    skipLink.href = "#main-content";
    skipLink.className = "skip-link";
    skipLink.textContent = "본문 바로가기";
    shell.appendChild(skipLink);

    // 2. 바디 (사이드바 + 메인 래퍼)
    const appBody = document.createElement("div");
    appBody.className = "app-body";

    // 사이드바
    const sidebar = this.createSidebar();
    appBody.appendChild(sidebar);

    // 메인 래퍼
    const mainWrapper = document.createElement("div");
    mainWrapper.className = "main-wrapper";

    // 헤더
    const header = this.createHeader(sidebar);
    mainWrapper.appendChild(header);

    // 메인 콘텐츠
    const mainContent = this.createMainContent();
    mainWrapper.appendChild(mainContent);

    appBody.appendChild(mainWrapper);
    shell.appendChild(appBody);

    // 3. 상태줄 컨테이너
    const statusContainer = document.createElement("div");
    shell.appendChild(statusContainer);

    this.container.appendChild(shell);

    // 상태줄 초기화
    this.statusBar = new StatusBar({
      container: statusContainer,
      session: this.session,
      onSessionExpired: () => {
        this.destroy();
        if (this.onSessionExpired) {
          this.onSessionExpired();
        } else {
          this.onSignOut();
        }
      },
    });
    void this.statusBar.render();
    this.observeSyncStatus(statusContainer);
  }

  public destroy(): void {
    if (this.syncObserver) {
      this.syncObserver.disconnect();
      this.syncObserver = null;
    }
    if (this.homeScreen) {
      this.homeScreen.destroy();
      this.homeScreen = null;
    }
    if (this.accessHistoryScreen) {
      this.accessHistoryScreen.destroy();
      this.accessHistoryScreen = null;
    }

    if (this.workforceScreen) {
      this.workforceScreen.destroy();
      this.workforceScreen = null;
    }
    if (this.statusBar) {
      this.statusBar.destroy();
      this.statusBar = null;
    }
    this.container.innerHTML = "";
  }

  private observeSyncStatus(statusContainer: HTMLElement): void {
    const attachObserver = () => {
      const syncCell = statusContainer.querySelector("#sb-sync");
      if (!syncCell) return false;

      const updateCodeSpan = () => {
        const text = syncCell.textContent || "";
        let code = "";
        if (text.includes("완료")) {
          code = " completed";
        } else if (text.includes("진행 중")) {
          code = " scanning";
        } else if (text.includes("오류")) {
          code = " error";
        } else if (text.includes("처리 이력 없음")) {
          code = " idle";
        }

        const existing = syncCell.querySelector(".sb-status-code");
        if (existing) {
          if (existing.textContent !== code) {
            existing.textContent = code;
          }
        } else if (code) {
          const span = document.createElement("span");
          span.className = "sb-status-code home-sr-only";
          span.textContent = code;
          syncCell.appendChild(span);
        }
      };

      this.syncObserver = new MutationObserver(() => {
        this.syncObserver?.disconnect();
        try {
          updateCodeSpan();
        } finally {
          this.syncObserver?.observe(syncCell, { childList: true, subtree: true, characterData: true });
        }
      });

      this.syncObserver.observe(syncCell, { childList: true, subtree: true, characterData: true });
      updateCodeSpan();
      return true;
    };

    if (!attachObserver()) {
      const tempObserver = new MutationObserver(() => {
        if (attachObserver()) {
          tempObserver.disconnect();
        }
      });
      tempObserver.observe(statusContainer, { childList: true, subtree: true });
    }
  }

  private createSidebar(): HTMLElement {
    const sidebar = document.createElement("aside");
    sidebar.className = `sidebar ${this.isSidebarCollapsed ? "collapsed" : ""}`;
    sidebar.setAttribute("aria-label", "사이드바 네비게이션");

    // 사이드바 상단 로고
    const sidebarHeader = document.createElement("div");
    sidebarHeader.className = "sidebar-header";
    sidebarHeader.innerHTML = `
      <span class="material-symbols-outlined nav-brand-icon" aria-hidden="true">schedule</span>
      <span class="sidebar-logo-text">교대근무관리</span>
    `;
    sidebar.appendChild(sidebarHeader);

    // 네비게이션 목록
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "주 메뉴");

    const navList = document.createElement("ul");
    navList.className = "nav-list";

    // 홈 버튼
    const homeLi = document.createElement("li");
    const homeBtn = document.createElement("button");
    homeBtn.type = "button";
    homeBtn.className = "nav-item active";
    homeBtn.setAttribute("aria-current", "page");
    homeBtn.innerHTML = `
      <span class="material-symbols-outlined" aria-hidden="true">home</span>
      <span class="nav-label">홈</span>
    `;
    homeBtn.addEventListener("click", () => {
      this.currentTitle = "홈";
      this.noticeMessage = "";
      this.updateActiveNav(navList, homeBtn);
      this.refreshMain();
    });
    homeLi.appendChild(homeBtn);
    navList.appendChild(homeLi);

    // 그룹별 항목 렌더링
    const groups: Array<{ key: "ready" | "ops" | "settle" | "admin"; label: string; adminOnly?: boolean }> = [
      { key: "ready", label: "준비" },
      { key: "ops", label: "운영" },
      { key: "settle", label: "정산" },
      { key: "admin", label: "관리", adminOnly: true },
    ];

    for (const grp of groups) {
      if (grp.adminOnly && this.session.role !== "admin") {
        continue; // 일반 사용자에게는 관리 그룹 미표시
      }

      // 그룹 헤더
      const grpHeaderLi = document.createElement("li");
      grpHeaderLi.className = "nav-group-header";
      grpHeaderLi.textContent = grp.label;
      navList.appendChild(grpHeaderLi);

      // 그룹 내 아이템
      const items = MENU_ITEMS.filter((item) => item.group === grp.key);
      for (const item of items) {
        if (item.adminOnly && this.session.role !== "admin") {
          continue;
        }

        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-item";
        btn.innerHTML = `
          <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
        `;

        btn.dataset.id = item.id;
        btn.addEventListener("click", () => {
          if (item.id === "access-history" || item.id === "workforce") {
            this.noticeMessage = "";
          } else {
            // 아직 구현되지 않은 업무 화면 클릭 시 차단 안내
            this.noticeMessage = `화면 준비 중 — '${item.label}' 화면은 다음 구현 단계에서 연결됩니다.`;
          }
          this.currentTitle = item.label;
          this.updateActiveNav(navList, btn);
          this.refreshMain();
        });

        li.appendChild(btn);
        navList.appendChild(li);
      }
    }

    nav.appendChild(navList);
    sidebar.appendChild(nav);

    return sidebar;
  }

  private createHeader(sidebar: HTMLElement): HTMLElement {
    const header = document.createElement("header");
    header.className = "header-bar";

    const left = document.createElement("div");
    left.className = "header-left";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn-sidebar-toggle";
    toggleBtn.setAttribute("aria-label", "사이드바 접기/펼치기");
    toggleBtn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">menu</span>`;
    toggleBtn.addEventListener("click", () => {
      this.isSidebarCollapsed = !this.isSidebarCollapsed;
      sidebar.classList.toggle("collapsed", this.isSidebarCollapsed);
    });

    const divider = document.createElement("div");
    divider.className = "header-divider";

    const titleEl = document.createElement("h1");
    titleEl.className = "header-title";
    titleEl.id = "header-current-title";
    titleEl.textContent = this.currentTitle;

    left.appendChild(toggleBtn);
    left.appendChild(divider);
    left.appendChild(titleEl);
    header.appendChild(left);

    const right = document.createElement("div");
    right.className = "header-user-actions";

    // 역할 칩
    const roleBadge = document.createElement("span");
    roleBadge.className = "role-badge";
    roleBadge.textContent = this.formatRole(this.session.role);

    // 계정 텍스트 (시안의 아바타 대신 텍스트)
    const userText = document.createElement("span");
    userText.className = "user-name-text";
    userText.textContent = this.session.displayName || this.session.loginId;

    // 로그아웃 버튼
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "btn-secondary btn-logout";
    logoutBtn.textContent = "로그아웃";
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      if (this.homeScreen) {
        this.homeScreen.destroy();
        this.homeScreen = null;
      }
      if (this.accessHistoryScreen) {
        this.accessHistoryScreen.destroy();
        this.accessHistoryScreen = null;
      }
      if (this.workforceScreen) {
        this.workforceScreen.destroy();
        this.workforceScreen = null;
      }
      if (this.statusBar) {
        this.statusBar.destroy();
        this.statusBar = null;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      const bridge = window.appBridge;
      if (!bridge) {
        logoutBtn.textContent = "연결 오류";
        setTimeout(() => {
          logoutBtn.disabled = false;
          logoutBtn.textContent = "로그아웃";
        }, 2000);
        return;
      }
      try {
        const res = await bridge.signOut();
        if (res.ok) {
          this.onSignOut();
        } else {
          logoutBtn.textContent = "실패: 재시도";
          setTimeout(() => {
            logoutBtn.disabled = false;
            logoutBtn.textContent = "로그아웃";
          }, 2000);
        }
      } catch {
        logoutBtn.textContent = "오류: 재시도";
        setTimeout(() => {
          logoutBtn.disabled = false;
          logoutBtn.textContent = "로그아웃";
        }, 2000);
      }
    });

    right.appendChild(roleBadge);
    right.appendChild(userText);
    right.appendChild(logoutBtn);
    header.appendChild(right);

    return header;
  }

  private createMainContent(): HTMLElement {
    const main = document.createElement("main");
    main.className = "page-content";
    main.id = "main-content";

    if (this.currentTitle === "홈") {
      this.homeScreen = new HomeScreen({
        container: main,
        session: this.session,
        onSessionExpired: () => {
          this.destroy();
          if (this.onSessionExpired) {
            this.onSessionExpired();
          } else {
            this.onSignOut();
          }
        },
      });
      this.homeScreen.render();
      return main;
    }

    if (this.currentTitle === "활동 이력") {
      this.accessHistoryScreen = new AccessHistoryScreen({
        container: main,
        session: this.session,
        onSessionExpired: () => {
          this.destroy();
          if (this.onSessionExpired) {
            this.onSessionExpired();
          } else {
            this.onSignOut();
          }
        },
      });
      this.accessHistoryScreen.render();
      return main;
    }

    if (this.currentTitle === "인력 관리") {
      this.workforceScreen = new WorkforceScreen({
        container: main,
        session: this.session,
        onSessionExpired: () => {
          this.destroy();
          if (this.onSessionExpired) {
            this.onSessionExpired();
          } else {
            this.onSignOut();
          }
        },
        onNavigatePerformance: () => {
          this.currentTitle = "실적 가져오기";
          this.noticeMessage = "화면 준비 중 — '실적 가져오기' 화면은 다음 구현 단계에서 연결됩니다. (UI-05 이전 준비 상태)";
          const navList = this.container.querySelector<HTMLElement>(".nav-list");
          const perfBtn = navList?.querySelector<HTMLButtonElement>('button[data-id="performance-intake"]');
          if (navList && perfBtn) {
            this.updateActiveNav(navList, perfBtn);
          }
          this.refreshMain();
        },
      });
      void this.workforceScreen.render();
      return main;
    }

    if (this.noticeMessage) {
      const banner = document.createElement("div");
      banner.className = "notice-banner";
      banner.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <span>${this.escape(this.noticeMessage)}</span>
      `;
      main.appendChild(banner);
    }

    const card = document.createElement("div");
    card.className = "content-card";
    card.innerHTML = `
      <h2 class="content-title">교대근무관리 시스템</h2>
      <p class="content-desc">
        로그인되었습니다. 현재 이용할 수 있는 기능은 다음과 같습니다.<br>
        - 사용자: <strong>${this.escape(this.session.displayName)}</strong> (${this.formatRole(this.session.role)})<br>
        - 현재 가능한 동작: 사이드바 접기/펼치기, 하단 상태줄 확인, 로그아웃<br>
        - 업무 메뉴(준비·운영·정산·관리)는 기능 연결 준비 중이며, 메뉴 선택 시 준비 안내가 표시됩니다.
      </p>
    `;
    main.appendChild(card);

    return main;
  }

  private refreshMain(): void {
    const titleEl = this.container.querySelector("#header-current-title");
    if (titleEl) {
      titleEl.textContent = this.currentTitle;
    }

    if (this.homeScreen) {
      this.homeScreen.destroy();
      this.homeScreen = null;
    }

    if (this.accessHistoryScreen) {
      this.accessHistoryScreen.destroy();
      this.accessHistoryScreen = null;
    }

    if (this.workforceScreen) {
      this.workforceScreen.destroy();
      this.workforceScreen = null;
    }

    const oldMain = this.container.querySelector("#main-content");
    if (oldMain && oldMain.parentElement) {
      const newMain = this.createMainContent();
      oldMain.parentElement.replaceChild(newMain, oldMain);
    }
  }

  private updateActiveNav(navList: HTMLElement, activeBtn: HTMLElement): void {
    navList.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    });
    activeBtn.classList.add("active");
    activeBtn.setAttribute("aria-current", "page");
  }

  private formatRole(role: string): string {
    switch (role) {
      case "admin":
        return "관리자";
      case "planner":
        return "기획자";
      case "operator":
        return "운영자";
      default:
        return role;
    }
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
