import "./bridge/app-bridge";

import type { AuthSession } from "../shared/domain/model";
import { LoginScreen } from "./screens/login";
import { ShellScreen } from "./screens/shell";
import { installCommonControls } from "./common-controls";
import { installTableLayout } from "./table-layout";

installCommonControls();
installTableLayout();

// Phase 3-1b 앱 진입점
// 브리지 세션 확인 -> 상태별(로그인 L1~L5 / 셸) 렌더링 조정

let activeScreen: LoginScreen | ShellScreen | null = null;

function getRootElement(): HTMLElement {
  let root = document.getElementById("app");
  if (!root) {
    root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
  }
  return root;
}

function renderErrorState(message: string, onRetry: () => void): void {
  const root = getRootElement();
  root.innerHTML = "";

  const container = document.createElement("div");
  container.className = "login-container";

  const card = document.createElement("div");
  card.className = "login-card card-center";

  card.innerHTML = `
    <div class="server-error-icon">
      <span class="material-symbols-outlined" aria-hidden="true">cloud_off</span>
    </div>
    <h1 class="server-error-title">서버 연결 확인 실패</h1>
    <p class="server-error-desc">${escapeHtml(message)}</p>
  `;

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn-primary mt-16";
  retryBtn.textContent = "다시 시도";
  retryBtn.addEventListener("click", onRetry);

  card.appendChild(retryBtn);
  container.appendChild(card);
  root.appendChild(container);
}

function mountLogin(initialMode: "L1" | "L4" = "L1", initialSession?: AuthSession | null): void {
  if (activeScreen && "destroy" in activeScreen) {
    activeScreen.destroy();
  }

  const root = getRootElement();
  const screen = new LoginScreen({
    container: root,
    initialMode,
    initialSession,
    onLoginSuccess: (session: AuthSession) => {
      mountShell(session);
    },
  });

  activeScreen = screen;
  void screen.init();
}

function mountShell(session: AuthSession): void {
  if (activeScreen && "destroy" in activeScreen) {
    activeScreen.destroy();
  }

  const root = getRootElement();
  const screen = new ShellScreen({
    container: root,
    session,
    onSignOut: () => {
      mountLogin("L1");
    },
    onSessionExpired: () => {
      mountLogin("L1", null);
    },
  });

  activeScreen = screen;
  screen.render();
}

async function startApp(): Promise<void> {
  const root = getRootElement();
  root.innerHTML = `
    <div class="login-container">
      <div class="login-card card-center">
        <p id="health" role="status" aria-live="polite" class="loading-text">
          서버 연결 확인 중…
        </p>
      </div>
    </div>
  `;

  try {
    const bridge = window.appBridge;
    if (!bridge) {
      renderErrorState(
        "브리지 환경을 초기화하지 못했습니다. 브라우저 지원 여부를 확인해 주세요.",
        () => void startApp(),
      );
      return;
    }
    const sessionRes = await bridge.getSession();

    if (!sessionRes.ok) {
      renderErrorState(
        sessionRes.message || "서버 세션 정보를 조회하지 못했습니다. 프로그램 연결을 확인해 주세요.",
        () => void startApp(),
      );
      return;
    }

    const session = sessionRes.data;

    if (!session) {
      // 비로그인 상태 -> L1
      mountLogin("L1");
    } else if (session.passwordChangeRequired) {
      // 비밀번호 변경 필요 -> L4 (셸 진입 차단)
      mountLogin("L4", session);
    } else {
      // 정상 로그인 상태 -> 셸
      mountShell(session);
    }
  } catch {
    renderErrorState(
      "서버와 통신할 수 없습니다. 프로그램이 실행 중인지 확인하세요.",
      () => void startApp(),
    );
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void startApp());
} else {
  void startApp();
}
