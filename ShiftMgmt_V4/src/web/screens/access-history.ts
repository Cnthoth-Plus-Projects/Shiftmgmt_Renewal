// 관리자 활동 이력 (Access History) 화면 관리
import type { AuthSession, UserRecord } from "../../shared/domain/model";
import type { AccessLogRecord } from "../../shared/domain/access-log";
import { accessLogActionOptions } from "../../shared/domain/access-log";
import {
  ACCESS_HISTORY_PAGE_SIZE,
  KEYWORD_DEBOUNCE_MS,
  buildLogListQuery,
  createDefaultDateRange,
  formatAccessDateTime,
  resolveActionBadge,
  resolveLogDetails,
  resolveRoleLabel,
  sortUserOptions,
  validateDateRange,
} from "./access-history-model";

export interface AccessHistoryScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
}

export class AccessHistoryScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;
  private destroyed = false;
  private loadGeneration = 0;
  private sessionExpiredTriggered = false;

  // 필터 상태
  private dateFrom: string;
  private dateTo: string;
  private selectedLoginId = "all";
  private selectedActionType = "all";
  private keyword = "";

  // 데이터 상태
  private logs: AccessLogRecord[] = [];
  private users: UserRecord[] = [];
  private usersLoaded = false;
  private visibleCount = ACCESS_HISTORY_PAGE_SIZE;

  // UI 상태
  private isLoading = true;
  private isSubmitting = false;
  private dateValidationError: string | null = null;
  private listErrorMessage: string | null = null;
  private usersErrorMessage: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // 고정 유지 DOM 참조 (포커스/캐럿 유지용)
  private rootElement: HTMLElement | null = null;
  private filterCardElement: HTMLElement | null = null;
  private dateFromInput: HTMLInputElement | null = null;
  private dateToInput: HTMLInputElement | null = null;
  private userSelectElement: HTMLSelectElement | null = null;
  private actionSelectElement: HTMLSelectElement | null = null;
  private keywordInput: HTMLInputElement | null = null;
  private refreshButton: HTMLButtonElement | null = null;
  private resetButton: HTMLButtonElement | null = null;
  private countTextElement: HTMLElement | null = null;
  private fieldErrorElement: HTMLElement | null = null;
  private alertContainer: HTMLElement | null = null;
  private bodyContainer: HTMLElement | null = null;

  constructor(options: AccessHistoryScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;

    const defaultRange = createDefaultDateRange();
    this.dateFrom = defaultRange.dateFrom;
    this.dateTo = defaultRange.dateTo;
  }

  public render(): void {
    if (this.destroyed) return;
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "access-history-container";
    wrapper.id = "access-history-screen";
    this.rootElement = wrapper;

    const desc = document.createElement("div");
    desc.className = "access-history-desc";
    desc.textContent =
      "로그인, 화면 이동, 주요 업무 처리 기록을 날짜와 사용자 기준으로 조회합니다.";
    wrapper.appendChild(desc);

    this.alertContainer = document.createElement("div");
    this.alertContainer.className = "access-history-alert-container";
    wrapper.appendChild(this.alertContainer);

    this.createFilterBar(wrapper);

    this.bodyContainer = document.createElement("div");
    this.bodyContainer.className = "access-history-body-container";
    wrapper.appendChild(this.bodyContainer);

    this.container.appendChild(wrapper);

    void this.loadData(true);
  }

  public destroy(): void {
    this.destroyed = true;
    this.loadGeneration++;
    this.clearDebounceTimer();
    this.container.innerHTML = "";
    this.rootElement = null;
    this.filterCardElement = null;
    this.dateFromInput = null;
    this.dateToInput = null;
    this.userSelectElement = null;
    this.actionSelectElement = null;
    this.keywordInput = null;
    this.refreshButton = null;
    this.resetButton = null;
    this.countTextElement = null;
    this.fieldErrorElement = null;
    this.alertContainer = null;
    this.bodyContainer = null;
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** 필터 바 DOM 생성 (화면 생명주기 동안 안정적으로 1회 생성) */
  private createFilterBar(parent: HTMLElement): void {
    const card = document.createElement("div");
    card.className = "access-history-filter-card";
    this.filterCardElement = card;

    const left = document.createElement("div");
    left.className = "access-history-filter-left";

    // 1. 시작일
    const startGroup = document.createElement("div");
    startGroup.className = "access-history-field-group";
    const startLabel = document.createElement("label");
    startLabel.className = "access-history-field-label";
    startLabel.htmlFor = "filter-date-from";
    startLabel.textContent = "조회 시작일";
    const startInput = document.createElement("input");
    startInput.type = "date";
    startInput.className = "access-history-date-input";
    startInput.id = "filter-date-from";
    startInput.value = this.dateFrom;
    startInput.setAttribute("aria-label", "조회 시작일");
    const handleDateFromChange = () => {
      if (this.dateFrom === startInput.value) return;
      this.dateFrom = startInput.value;
      this.clearDebounceTimer();
      void this.loadData(false);
    };
    startInput.addEventListener("change", handleDateFromChange);
    startInput.addEventListener("input", handleDateFromChange);
    this.dateFromInput = startInput;
    startGroup.append(startLabel, startInput);
    left.appendChild(startGroup);

    // 2. 종료일
    const endGroup = document.createElement("div");
    endGroup.className = "access-history-field-group";
    const endLabel = document.createElement("label");
    endLabel.className = "access-history-field-label";
    endLabel.htmlFor = "filter-date-to";
    endLabel.textContent = "조회 종료일";
    const endInput = document.createElement("input");
    endInput.type = "date";
    endInput.className = "access-history-date-input";
    endInput.id = "filter-date-to";
    endInput.value = this.dateTo;
    endInput.setAttribute("aria-label", "조회 종료일");
    const handleDateToChange = () => {
      if (this.dateTo === endInput.value) return;
      this.dateTo = endInput.value;
      this.clearDebounceTimer();
      void this.loadData(false);
    };
    endInput.addEventListener("change", handleDateToChange);
    endInput.addEventListener("input", handleDateToChange);
    this.dateToInput = endInput;
    endGroup.append(endLabel, endInput);
    left.appendChild(endGroup);

    // 3. 사용자 선택
    const userSelect = document.createElement("select");
    userSelect.className = "access-history-select";
    userSelect.id = "filter-user-select";
    userSelect.setAttribute("aria-label", "사용자 선택");
    userSelect.addEventListener("change", () => {
      this.selectedLoginId = userSelect.value;
      this.clearDebounceTimer();
      void this.loadData(false);
    });
    this.userSelectElement = userSelect;
    this.populateUserSelect();
    left.appendChild(userSelect);

    // 4. 액션 선택
    const actionSelect = document.createElement("select");
    actionSelect.className = "access-history-select";
    actionSelect.id = "filter-action-select";
    actionSelect.setAttribute("aria-label", "액션 선택");
    const allActionOpt = document.createElement("option");
    allActionOpt.value = "all";
    allActionOpt.textContent = "전체 액션";
    actionSelect.appendChild(allActionOpt);
    for (const opt of accessLogActionOptions) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      actionSelect.appendChild(el);
    }
    actionSelect.value = this.selectedActionType;
    actionSelect.addEventListener("change", () => {
      this.selectedActionType = actionSelect.value;
      this.clearDebounceTimer();
      void this.loadData(false);
    });
    this.actionSelectElement = actionSelect;
    left.appendChild(actionSelect);

    // 5. 검색어 입력 (250ms 디바운스, 입력 순간 old 세대 무효화)
    const kwInput = document.createElement("input");
    kwInput.type = "text";
    kwInput.className = "access-history-keyword-input";
    kwInput.id = "filter-keyword-input";
    kwInput.placeholder = "사용자 / 액션 / 상세";
    kwInput.setAttribute("aria-label", "이력 검색");
    kwInput.value = this.keyword;
    kwInput.addEventListener("input", () => {
      this.keyword = kwInput.value;
      this.clearDebounceTimer();
      this.loadGeneration++;
      const targetGen = this.loadGeneration;

      this.isLoading = true;
      this.isSubmitting = false;
      this.logs = [];
      this.visibleCount = 0;
      this.listErrorMessage = null;

      this.renderBody();
      this.updateFilterControlsState();
      if (this.countTextElement) {
        this.countTextElement.textContent = "검색 입력 중…";
      }

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        if (this.destroyed || this.loadGeneration !== targetGen) return;
        void this.loadData(false);
      }, KEYWORD_DEBOUNCE_MS);
    });
    this.keywordInput = kwInput;
    left.appendChild(kwInput);

    // 6. 초기화 버튼
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn-secondary btn-sm";
    resetBtn.id = "btn-filter-reset";
    resetBtn.textContent = "초기화";
    resetBtn.addEventListener("click", () => {
      this.resetFilters();
    });
    this.resetButton = resetBtn;
    left.appendChild(resetBtn);

    card.appendChild(left);

    // 우측 (건수 + 새로고침)
    const right = document.createElement("div");
    right.className = "access-history-filter-right";

    const countText = document.createElement("span");
    countText.className = "access-history-count-text";
    countText.id = "access-history-count-label";
    countText.textContent = "조회 중…";
    this.countTextElement = countText;
    right.appendChild(countText);

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn-secondary btn-sm";
    refreshBtn.id = "btn-refresh-logs";
    refreshBtn.textContent = "새로고침";
    refreshBtn.addEventListener("click", (e) => {
      this.clearDebounceTimer();
      if (this.dateValidationError || this.isSubmitting) {
        e.preventDefault();
        return;
      }
      void this.loadData(true);
    });
    this.refreshButton = refreshBtn;
    right.appendChild(refreshBtn);

    card.appendChild(right);

    this.fieldErrorElement = document.createElement("div");
    this.fieldErrorElement.className = "access-history-field-error";
    this.fieldErrorElement.id = "filter-date-error-desc";
    this.fieldErrorElement.style.display = "none";
    this.fieldErrorElement.setAttribute("role", "alert");
    card.appendChild(this.fieldErrorElement);

    parent.appendChild(card);
  }

  /** 사용자 select 엘리먼트 옵션 갱신 */
  private populateUserSelect(): void {
    if (!this.userSelectElement) return;
    const currentVal = this.selectedLoginId;
    this.userSelectElement.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "전체 사용자";
    this.userSelectElement.appendChild(allOpt);

    const sorted = sortUserOptions(this.users);
    for (const u of sorted) {
      const opt = document.createElement("option");
      opt.value = u.loginId;
      opt.textContent = u.label;
      this.userSelectElement.appendChild(opt);
    }

    const exists = sorted.some((u) => u.loginId === currentVal);
    if (!exists && currentVal !== "all") {
      const retainedOpt = document.createElement("option");
      retainedOpt.value = currentVal;
      retainedOpt.textContent = `${currentVal} (유지된 선택)`;
      this.userSelectElement.appendChild(retainedOpt);
    }

    this.userSelectElement.value = currentVal;
  }

  /** 필터를 기본값으로 리셋 */
  public resetFilters(): void {
    this.clearDebounceTimer();

    const defaultRange = createDefaultDateRange();
    this.dateFrom = defaultRange.dateFrom;
    this.dateTo = defaultRange.dateTo;
    this.selectedLoginId = "all";
    this.selectedActionType = "all";
    this.keyword = "";

    if (this.dateFromInput) this.dateFromInput.value = this.dateFrom;
    if (this.dateToInput) this.dateToInput.value = this.dateTo;
    if (this.userSelectElement) this.userSelectElement.value = "all";
    if (this.actionSelectElement) this.actionSelectElement.value = "all";
    if (this.keywordInput) this.keywordInput.value = "";

    void this.loadData(false);
  }

  /** 데이터 로드 메인 로직 */
  public async loadData(fetchUsers = false): Promise<void> {
    if (this.destroyed) return;

    if (this.session.role !== "admin") {
      this.listErrorMessage = "활동 이력은 관리자 권한만 조회할 수 있습니다.";
      this.isLoading = false;
      this.isSubmitting = false;
      this.logs = [];
      this.renderAlerts();
      this.renderBody();
      this.updateFilterControlsState();
      return;
    }

    // 날짜 범위 검증
    const dateCheck = validateDateRange(this.dateFrom, this.dateTo);
    if (!dateCheck.valid) {
      this.clearDebounceTimer();
      this.loadGeneration++;
      this.dateValidationError = dateCheck.error || "날짜 조건이 올바르지 않습니다.";
      this.isLoading = false;
      this.isSubmitting = false;
      this.logs = [];
      this.visibleCount = 0;
      this.listErrorMessage = null;
      if (this.countTextElement) {
        this.countTextElement.textContent = "날짜 조건 오류";
      }
      this.renderAlerts();
      this.renderBody();
      this.updateFilterControlsState();
      return;
    }

    this.dateValidationError = null;
    this.loadGeneration++;
    const currentGen = this.loadGeneration;

    this.isLoading = true;
    this.isSubmitting = true;
    this.listErrorMessage = null;
    this.renderAlerts();
    this.updateFilterControlsState();
    this.renderBody();

    const bridge = window.appBridge;
    if (!bridge) {
      if (this.destroyed || this.loadGeneration !== currentGen) return;
      this.isLoading = false;
      this.isSubmitting = false;
      this.listErrorMessage = "서버 연결에 실패했습니다.";
      this.renderAlerts();
      this.updateFilterControlsState();
      this.renderBody();
      return;
    }

    const query = buildLogListQuery({
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
      loginId: this.selectedLoginId,
      actionType: this.selectedActionType,
      keyword: this.keyword,
    });

    try {
      const logsPromise = bridge.listAccessLogs(query);
      const usersPromise = fetchUsers || !this.usersLoaded ? bridge.listOperationUsers() : null;

      const [logsSettled, usersSettled] = await Promise.allSettled([
        logsPromise,
        usersPromise ? usersPromise : Promise.resolve(null),
      ]);

      if (this.destroyed || this.loadGeneration !== currentGen) {
        return;
      }

      // 1) 사용자 목록 응답 처리
      if (usersSettled.status === "fulfilled" && usersSettled.value !== null) {
        const uRes = usersSettled.value;
        if (uRes.ok && Array.isArray(uRes.data)) {
          this.users = uRes.data;
          this.usersLoaded = true;
          this.usersErrorMessage = null;
          this.populateUserSelect();
        } else if (!uRes.ok) {
          if (uRes.errorCode === "AUTH_SESSION_REQUIRED") {
            this.handleSessionExpired(currentGen);
            return;
          }
          this.usersErrorMessage =
            uRes.message || "사용자 목록을 불러오지 못했습니다.";
        }
      } else if (usersSettled.status === "rejected") {
        this.usersErrorMessage = "사용자 목록 조회 중 통신 오류가 발생했습니다.";
      }

      // 2) 활동 이력 목록 응답 처리
      if (logsSettled.status === "fulfilled") {
        const logRes = logsSettled.value;
        if (logRes.ok && Array.isArray(logRes.data)) {
          this.logs = logRes.data;
          this.listErrorMessage = null;
          this.visibleCount = ACCESS_HISTORY_PAGE_SIZE;
        } else if (!logRes.ok) {
          if (logRes.errorCode === "AUTH_SESSION_REQUIRED") {
            this.handleSessionExpired(currentGen);
            return;
          }
          if (logRes.errorCode === "AUTH_FORBIDDEN") {
            this.listErrorMessage = "활동 이력 조회 권한이 없습니다.";
            this.logs = [];
          } else {
            this.listErrorMessage =
              logRes.message || "활동 이력을 불러오지 못했습니다.";
          }
        }
      } else {
        this.listErrorMessage = "활동 이력 조회 중 네트워크 오류가 발생했습니다.";
      }
    } catch (_err) {
      if (this.destroyed || this.loadGeneration !== currentGen) return;
      this.listErrorMessage = "활동 이력 처리 중 예기치 않은 오류가 발생했습니다.";
    } finally {
      if (!this.destroyed && this.loadGeneration === currentGen) {
        this.isLoading = false;
        this.isSubmitting = false;
        this.renderAlerts();
        this.updateFilterControlsState();
        this.renderBody();
      }
    }
  }

  /** 세션 만료 처리 (old 세대의 만료는 무시하여 최신 화면 보호) */
  private handleSessionExpired(requestGen: number): void {
    if (this.destroyed || this.loadGeneration !== requestGen) return;
    if (this.sessionExpiredTriggered) return;
    this.sessionExpiredTriggered = true;
    this.clearDebounceTimer();
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
  }

  /** 필터 제어부 상태 및 잠금 갱신 */
  private updateFilterControlsState(): void {
    if (!this.filterCardElement) return;

    if (this.fieldErrorElement) {
      if (this.dateValidationError) {
        this.fieldErrorElement.textContent = this.dateValidationError;
        this.fieldErrorElement.style.display = "block";
      } else {
        this.fieldErrorElement.textContent = "";
        this.fieldErrorElement.style.display = "none";
      }
    }

    if (this.refreshButton) {
      if (this.isSubmitting) {
        this.refreshButton.disabled = true;
        this.refreshButton.removeAttribute("aria-disabled");
        this.refreshButton.removeAttribute("aria-describedby");
      } else if (this.dateValidationError) {
        this.refreshButton.disabled = false;
        this.refreshButton.setAttribute("aria-disabled", "true");
        this.refreshButton.setAttribute("aria-describedby", "filter-date-error-desc");
      } else {
        this.refreshButton.disabled = false;
        this.refreshButton.removeAttribute("aria-disabled");
        this.refreshButton.removeAttribute("aria-describedby");
      }
    }

    if (this.countTextElement) {
      if (this.isLoading) {
        this.countTextElement.textContent = "조회 중…";
      } else if (this.listErrorMessage || this.dateValidationError) {
        this.countTextElement.textContent = "-";
      } else {
        const total = this.logs.length;
        const current = Math.min(this.visibleCount, total);
        this.countTextElement.textContent = `전체 ${total}건 중 ${current}건 표시`;
      }
    }
  }

  /** 오류 및 경고 배너 렌더링 */
  private renderAlerts(): void {
    if (!this.alertContainer) return;
    this.alertContainer.innerHTML = "";

    // 1. 목록 조회 에러
    if (this.listErrorMessage) {
      const alert = document.createElement("div");
      alert.className = "access-history-alert-banner";
      alert.setAttribute("role", "alert");

      const content = document.createElement("div");
      content.className = "access-history-alert-content";
      content.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">error</span>
        <span>${this.escape(this.listErrorMessage)}</span>
      `;
      alert.appendChild(content);

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn-secondary btn-sm";
      retryBtn.id = "btn-retry-logs";
      retryBtn.textContent = "재시도";
      if (this.isSubmitting) {
        retryBtn.disabled = true;
      }
      retryBtn.addEventListener("click", () => {
        if (this.isSubmitting) return;
        retryBtn.disabled = true;
        this.clearDebounceTimer();
        void this.loadData(true);
      });
      alert.appendChild(retryBtn);

      this.alertContainer.appendChild(alert);
    }

    // 2. 사용자 목록 로드 실패 경고
    if (this.usersErrorMessage) {
      const warn = document.createElement("div");
      warn.className = "access-history-users-warning";
      warn.setAttribute("role", "status");

      const content = document.createElement("div");
      content.className = "access-history-alert-content";
      content.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">warning</span>
        <span>${this.escape(this.usersErrorMessage)}</span>
      `;
      warn.appendChild(content);

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn-secondary btn-sm";
      retryBtn.id = "btn-retry-users";
      retryBtn.textContent = "사용자 목록 재시도";
      if (this.isSubmitting) {
        retryBtn.disabled = true;
      }
      retryBtn.addEventListener("click", () => {
        if (this.isSubmitting) return;
        retryBtn.disabled = true;
        this.clearDebounceTimer();
        void this.loadData(true);
      });
      warn.appendChild(retryBtn);

      this.alertContainer.appendChild(warn);
    }
  }

  /** 본문 영역 렌더링 (로딩 / G1 목록 / G2 빈 상태) */
  private renderBody(): void {
    if (!this.bodyContainer) return;
    this.bodyContainer.innerHTML = "";

    if (this.isLoading) {
      const loading = document.createElement("div");
      loading.className = "access-history-loading-banner";
      loading.setAttribute("role", "status");
      loading.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">progress_activity</span>
        <span>활동 이력을 불러오는 중입니다…</span>
      `;
      this.bodyContainer.appendChild(loading);
      return;
    }

    if (this.listErrorMessage || this.dateValidationError) {
      return;
    }

    if (this.logs.length === 0) {
      this.renderG2EmptyState(this.bodyContainer);
      return;
    }

    this.renderG1TableState(this.bodyContainer);
  }

  /** G2. 빈 상태 렌더링 */
  private renderG2EmptyState(parent: HTMLElement): void {
    const card = document.createElement("div");
    card.className = "access-history-empty-card";
    card.id = "state-g2-empty";

    const illustration = document.createElement("div");
    illustration.className = "access-history-empty-illustration";
    illustration.setAttribute("aria-hidden", "true");
    illustration.innerHTML = `<span class="material-symbols-outlined">history_toggle_off</span>`;
    card.appendChild(illustration);

    const title = document.createElement("div");
    title.className = "access-history-empty-title";
    title.textContent = "기록된 활동 이력이 없습니다";
    card.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "access-history-empty-desc";
    desc.textContent =
      "선택한 기간 동안 발생한 활동 이력이 없습니다. 날짜 범위를 변경하거나 필터를 초기화해 보세요.";
    card.appendChild(desc);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn-secondary access-history-empty-reset-btn";
    resetBtn.id = "btn-empty-reset";
    resetBtn.textContent = "필터 초기화";
    resetBtn.addEventListener("click", () => {
      this.resetFilters();
    });
    card.appendChild(resetBtn);

    parent.appendChild(card);
  }

  /** G1. 테이블 목록 렌더링 */
  private renderG1TableState(parent: HTMLElement): void {
    const card = document.createElement("div");
    card.className = "access-history-table-card";
    card.id = "state-g1-table";

    const scrollWrapper = document.createElement("div");
    scrollWrapper.className = "access-history-table-wrapper";
    scrollWrapper.tabIndex = 0;
    scrollWrapper.setAttribute("aria-label", "활동 이력 목록 표 가로 스크롤 영역");

    const table = document.createElement("table");
    table.className = "access-history-table";
    table.id = "table-access-logs";
    table.setAttribute("aria-label", "활동 이력 목록");

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th scope="col">활동시간</th>
        <th scope="col">사용자</th>
        <th scope="col">권한</th>
        <th scope="col">액션내용</th>
        <th scope="col">상세</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tbody.id = "table-access-logs-body";

    const displayLogs = this.logs.slice(0, this.visibleCount);
    for (const record of displayLogs) {
      tbody.appendChild(this.createRowElement(record));
    }
    table.appendChild(tbody);
    scrollWrapper.appendChild(table);
    card.appendChild(scrollWrapper);

    if (this.visibleCount < this.logs.length) {
      const loadMoreRow = document.createElement("div");
      loadMoreRow.className = "access-history-load-more-row";

      const remaining = this.logs.length - this.visibleCount;
      const nextBatch = Math.min(ACCESS_HISTORY_PAGE_SIZE, remaining);

      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "btn-secondary";
      moreBtn.id = "btn-load-more-logs";
      moreBtn.textContent = `더 보기 (${nextBatch}건 더 표시 / 남은 ${remaining}건)`;
      moreBtn.addEventListener("click", () => {
        const currentCount = this.visibleCount;
        this.visibleCount += ACCESS_HISTORY_PAGE_SIZE;
        const newBatch = this.logs.slice(currentCount, this.visibleCount);
        for (const r of newBatch) {
          tbody.appendChild(this.createRowElement(r));
        }
        this.updateFilterControlsState();
        if (this.visibleCount >= this.logs.length) {
          loadMoreRow.remove();
        } else {
          const nextRemaining = this.logs.length - this.visibleCount;
          const nextCount = Math.min(ACCESS_HISTORY_PAGE_SIZE, nextRemaining);
          moreBtn.textContent = `더 보기 (${nextCount}건 더 표시 / 남은 ${nextRemaining}건)`;
        }
      });

      loadMoreRow.appendChild(moreBtn);
      card.appendChild(loadMoreRow);
    }

    parent.appendChild(card);
  }

  /** 단일 테이블 행 엘리먼트 생성 (XSS 방지 textContent 기반) */
  private createRowElement(record: AccessLogRecord): HTMLTableRowElement {
    const tr = document.createElement("tr");
    tr.id = `log-row-${record.id}`;

    // 1. 활동시간
    const tdTime = document.createElement("td");
    const timeFormatted = formatAccessDateTime(record.occurredAt);
    tdTime.textContent = timeFormatted;
    tdTime.title = timeFormatted;
    tr.appendChild(tdTime);

    // 2. 사용자 (displayName · loginId)
    const tdUser = document.createElement("td");
    tdUser.className = "access-history-user-cell";
    const strongName = document.createElement("strong");
    strongName.textContent = record.displayName || record.loginId;
    const subLogin = document.createElement("span");
    subLogin.className = "access-history-user-sub";
    subLogin.textContent = ` · ${record.loginId}`;
    tdUser.append(strongName, subLogin);
    tdUser.title = `${record.displayName || record.loginId} (${record.loginId})`;
    tr.appendChild(tdUser);

    // 3. 권한
    const tdRole = document.createElement("td");
    const roleLabel = resolveRoleLabel(record.role);
    tdRole.textContent = roleLabel;
    tdRole.title = roleLabel;
    tr.appendChild(tdRole);

    // 4. 액션내용 (배지)
    const tdAction = document.createElement("td");
    const badge = document.createElement("span");
    const badgeStyle = resolveActionBadge(record.actionType);
    badge.className = `access-history-badge ${badgeStyle.className}`;
    const actionLabel = record.actionLabel || record.actionType;
    badge.textContent = actionLabel;
    tdAction.appendChild(badge);
    tdAction.title = actionLabel;
    tr.appendChild(tdAction);

    // 5. 상세
    const tdDetail = document.createElement("td");
    tdDetail.className = "access-history-detail-cell";
    const detailText = resolveLogDetails(record);
    tdDetail.textContent = detailText;
    if (detailText !== "-") {
      tdDetail.title = detailText;
    }
    tr.appendChild(tdDetail);

    return tr;
  }

  /** 문자열 HTML 이스케이프 유틸 */
  private escape(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
