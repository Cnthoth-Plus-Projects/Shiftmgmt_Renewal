// 실제 API 기반 하단 상태줄 컴포넌트
import type { AuthSession } from "../../shared/domain/model";

export interface StatusBarOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
}

export class StatusBar {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;
  private hasReportedSessionExpired = false;
  private generation = 0;
  private isDestroyed = false;
  private pollInterval: number | null = null;
  private isFetching = false;

  constructor(options: StatusBarOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
  }

  public async render(): Promise<void> {
    const currentGen = ++this.generation;
    this.container.innerHTML = "";

    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    const footer = document.createElement("footer");
    footer.className = "footer-statusbar";
    footer.setAttribute("role", "status");
    footer.setAttribute("aria-live", "polite");

    // 기본 로딩 뼈대
    footer.innerHTML = `
      <div class="status-cell" id="sb-db">
        <span class="status-dot-green"></span>
        <span class="sb-label">DB: 확인 중…</span>
      </div>
      <div class="status-cell" id="sb-sync">
        <span class="sb-label">동기화: 확인 중…</span>
      </div>
      <div class="status-cell" id="sb-pending">
        <span class="sb-label">대기 파일: 확인 중…</span>
      </div>
      ${
        this.session.role === "admin"
          ? `
      <div class="status-cell" id="sb-watch">
        <span class="sb-label">감시: 확인 중…</span>
      </div>
      <div class="status-cell" id="sb-update">
        <span class="sb-label">업데이트: 확인 중…</span>
      </div>
      `
          : ""
      }
      <div class="status-cell status-cell-right" id="sb-system">
        <span>시스템 준비됨</span>
      </div>
    `;

    this.container.appendChild(footer);

    (window as unknown as { statusBar?: StatusBar }).statusBar = this;

    // 2.5초마다 주기적 새로고침
    this.pollInterval = window.setInterval(() => {
      if (this.isDestroyed || this.isFetching) return;
      void this.fetchStatusData(this.generation, footer);
    }, 2500);

    // 실제 데이터 비동기 조회
    await this.fetchStatusData(currentGen, footer);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.generation++;
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    delete (window as unknown as { statusBar?: StatusBar }).statusBar;
    this.container.innerHTML = "";
  }

  public async refresh(): Promise<void> {
    const footer = this.container.querySelector("footer");
    if (footer) {
      await this.fetchStatusData(this.generation, footer);
    }
  }

  private handleAuthError(res: { ok: boolean; errorCode?: string }): boolean {
    if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") {
      if (!this.hasReportedSessionExpired) {
        this.hasReportedSessionExpired = true;
        this.destroy();
        this.onSessionExpired?.();
      }
      return true;
    }
    return false;
  }

  private async fetchStatusData(gen: number, footer: HTMLElement): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;
    try {
      const bridge = window.appBridge;
      if (!bridge) return;

      const isAdmin = this.session.role === "admin";

    // 1. DB 상태 (getAppHealth)
    try {
      const healthRes = await bridge.getAppHealth();
      if (this.isStale(gen)) return;

      const dbCell = footer.querySelector("#sb-db");
      if (dbCell) {
        if (healthRes.ok && healthRes.data) {
          const isConfigured = Boolean(healthRes.data.databaseConfigured);
          dbCell.innerHTML = `
            <span class="${isConfigured ? "status-dot-green" : "status-dot-red"}"></span>
            <span class="sb-label">DB: ${isConfigured ? "경로 설정됨" : "확인 필요"}</span>
          `;
        } else {
          dbCell.innerHTML = `
            <span class="status-dot-red"></span>
            <span class="sb-label">DB: 확인 실패</span>
          `;
        }
      }
    } catch {
      if (this.isStale(gen)) return;
      const dbCell = footer.querySelector("#sb-db");
      if (dbCell) {
        dbCell.innerHTML = `
          <span class="status-dot-red"></span>
          <span class="sb-label">DB: 확인 실패</span>
        `;
      }
    }

    // 2. 최근 인테이크 / 동기화 상태 (getPerformanceSyncState)
    try {
      const syncRes = await bridge.getPerformanceSyncState();
      if (this.isStale(gen)) return;
      if (this.handleAuthError(syncRes)) return;

      const syncCell = footer.querySelector("#sb-sync");
      if (syncCell) {
        if (syncRes.ok && syncRes.data) {
          const status = syncRes.data.status;
          let label = "동기화: 처리 이력 없음";
          if (status === "scanning" || status === "parsing") {
            label = "동기화: 가져오기 진행 중";
          } else if (status === "completed") {
            label = syncRes.data.updatedAt
              ? `동기화: 완료 (${syncRes.data.updatedAt})`
              : "동기화: 완료";
          } else if (status === "error") {
            label = "동기화: 오류";
          }
          syncCell.innerHTML = `<span class="sb-label">${this.escape(label)}</span>`;
        } else {
          syncCell.innerHTML = `<span class="sb-label">동기화: 확인 실패</span>`;
        }
      }
    } catch {
      if (this.isStale(gen)) return;
      const syncCell = footer.querySelector("#sb-sync");
      if (syncCell) {
        syncCell.innerHTML = `<span class="sb-label">동기화: 확인 실패</span>`;
      }
    }

    // 3. 대기 파일 수 (listPendingFiles)
    try {
      const pendingRes = await bridge.listPendingFiles();
      if (this.isStale(gen)) return;
      if (this.handleAuthError(pendingRes)) return;

      const pendingCell = footer.querySelector("#sb-pending");
      if (pendingCell) {
        if (pendingRes.ok && Array.isArray(pendingRes.data)) {
          const count = pendingRes.data.length;
          pendingCell.innerHTML = `<span class="sb-label">대기 파일: ${count}개</span>`;
        } else {
          pendingCell.innerHTML = `<span class="sb-label">대기 파일: 확인 실패</span>`;
        }
      }
    } catch {
      if (this.isStale(gen)) return;
      const pendingCell = footer.querySelector("#sb-pending");
      if (pendingCell) {
        pendingCell.innerHTML = `<span class="sb-label">대기 파일: 확인 실패</span>`;
      }
    }

    // 4 & 5. admin 전용: 파일 감시 상태 및 업데이트 상태
    if (isAdmin) {
      // 파일 감시 상태 (getFileWatchStatus)
      try {
        const watchRes = await bridge.getFileWatchStatus();
        if (this.isStale(gen)) return;
        if (this.handleAuthError(watchRes)) return;

        const watchCell = footer.querySelector("#sb-watch");
        if (watchCell) {
          if (watchRes.ok && watchRes.data) {
            const isRunning = Boolean(watchRes.data.isRunning);
            if (isRunning) {
              watchCell.innerHTML = `
                <span class="status-dot-green"></span>
                <span class="sb-label">폴더 감시 중</span>
              `;
            } else {
              watchCell.innerHTML = `
                <span class="status-dot-red"></span>
                <span class="sb-label">감시 중단</span>
                <button type="button" class="btn-statusbar-restart" id="btn-restart-watch">다시 시작</button>
              `;
              const restartBtn = watchCell.querySelector("#btn-restart-watch") as HTMLButtonElement;
              restartBtn?.addEventListener("click", async () => {
                restartBtn.disabled = true;
                restartBtn.textContent = "시작 중…";
                try {
                  await bridge.restartFileWatch();
                  await this.fetchStatusData(gen, footer);
                } catch {
                  restartBtn.textContent = "실패";
                  restartBtn.disabled = false;
                }
              });
            }
          } else {
            watchCell.innerHTML = `
              <span class="status-dot-red"></span>
              <span class="sb-label">감시: 확인 실패</span>
            `;
          }
        }
      } catch {
        if (this.isStale(gen)) return;
        const watchCell = footer.querySelector("#sb-watch");
        if (watchCell) {
          watchCell.innerHTML = `
            <span class="status-dot-red"></span>
            <span class="sb-label">감시: 확인 실패</span>
          `;
        }
      }

      // 업데이트 상태 (getUpdateState)
      try {
        const updateRes = await bridge.getUpdateState();
        if (this.isStale(gen)) return;
        if (this.handleAuthError(updateRes)) return;

        const updateCell = footer.querySelector("#sb-update");
        if (updateCell) {
          if (updateRes.ok && updateRes.data) {
            // enabled: false이므로 수동 적용 안내만 표시 (다운로드/설치 버튼 없음)
            updateCell.innerHTML = `<span class="sb-label">업데이트: 수동 적용</span>`;
          } else {
            updateCell.innerHTML = `<span class="sb-label">업데이트: 확인 실패</span>`;
          }
        }
      } catch {
        if (this.isStale(gen)) return;
        const updateCell = footer.querySelector("#sb-update");
        if (updateCell) {
          updateCell.innerHTML = `<span class="sb-label">업데이트: 확인 실패</span>`;
        }
      }
    }
  } finally {
    this.isFetching = false;
  }
}

  private isStale(gen: number): boolean {
    return this.isDestroyed || this.generation !== gen;
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
