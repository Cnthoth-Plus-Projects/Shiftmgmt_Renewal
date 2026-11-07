import {
  formatCurrency,
  type AllowanceFilterState,
  type AllowanceKpiSummary,
  type AllowanceTabId,
} from "./allowance-model";

export function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AllowanceToolbarOptions {
  filter: AllowanceFilterState;
  availableMonths: string[];
  availableSites: string[];
  activeTab: AllowanceTabId;
  hasError?: boolean;
  errorMessage?: string;
  secondaryErrorMessage?: string;
  canReview?: boolean;
  checkedCount?: number;
  checkedAmount?: number;
  onFilterChange: (changed: Partial<AllowanceFilterState>) => void;
  onTabChange: (tabId: AllowanceTabId) => void;
  onRefresh: () => void;
  onOpenProposalModal: () => void;
  onBatchApprove?: () => void;
  onBatchReject?: () => void;
  onBatchExport?: () => void;
}

/** KPI 바 렌더링 (R02: 4대 KPI - 정규금액/조기금액/총액/인원·건수, R04: 선택 합계와 명확히 구분) */
export function renderAllowanceKpiBar(
  container: HTMLElement,
  kpi: AllowanceKpiSummary
): void {
  renderAllowanceKpis(container, kpi);
}

/** KPI 요약 카드 렌더링 */
export function renderAllowanceKpis(
  container: HTMLElement,
  kpi: AllowanceKpiSummary
): void {
  const selectionNote =
    kpi.selectedCount > 0
      ? `체크 선택 ${kpi.selectedCount}건 · ${formatCurrency(kpi.selectedAmount)}`
      : `대기 ${kpi.pendingCount} · 승인 ${kpi.approvedCount} · 반려 ${kpi.rejectedCount} · 마감 ${kpi.proposalApprovedCount}`;

  container.innerHTML = `
    <div class="allowance-kpi-bar" aria-label="필터 결과 요약 지표">
      <div class="allowance-kpi-card kpi-regular">
        <span class="allowance-kpi-label">정규 지급액 (필터 기준)</span>
        <span class="allowance-kpi-value" id="kpi-regular-amount">${formatCurrency(kpi.regularTotalAmount)}</span>
      </div>

      <div class="allowance-kpi-card kpi-early">
        <span class="allowance-kpi-label">조기 지급액 (필터 기준)</span>
        <span class="allowance-kpi-value" id="kpi-early-amount">${formatCurrency(kpi.earlyPayoutTotalAmount)}</span>
      </div>

      <div class="allowance-kpi-card kpi-total">
        <span class="allowance-kpi-label">총 지급액 (필터 기준)</span>
        <span class="allowance-kpi-value" id="kpi-total-amount">${formatCurrency(kpi.totalAmount)}</span>
      </div>

      <div class="allowance-kpi-card kpi-count">
        <span class="allowance-kpi-label">대상 인원 · 건수</span>
        <span class="allowance-kpi-value" id="kpi-count-value">${kpi.employeeCount}명 · ${kpi.totalCount}건</span>
        <span class="allowance-kpi-sub" id="kpi-selection-sub" title="${escapeHtml(selectionNote)}">${escapeHtml(selectionNote)}</span>
      </div>
    </div>
  `;
}

/** 툴바 렌더링 */
export function renderAllowanceToolbar(
  container: HTMLElement,
  options: AllowanceToolbarOptions
): void {
  const {
    filter,
    availableMonths,
    availableSites,
    activeTab,
    hasError,
    errorMessage,
    secondaryErrorMessage,
    canReview,
    checkedCount = 0,
  } = options;

  const currentMonth = filter.workMonth || filter.scheduleMonth || "";
  const monthOptions = availableMonths
    .map(
      m =>
        `<option value="${escapeHtml(m)}"${m === currentMonth ? " selected" : ""}>${escapeHtml(m)}</option>`
    )
    .join("");

  const siteOptions = availableSites
    .map(
      s =>
        `<option value="${escapeHtml(s)}"${s === filter.siteName ? " selected" : ""}>${escapeHtml(s)}</option>`
    )
    .join("");

  const currentStatus = filter.status || filter.statusFilter || "all";
  const isResultsTab = activeTab === "results" || activeTab === "overview";
  const approveRejectTitle = !canReview
    ? "승인자(reviewer) 또는 관리자(admin) 권한이 필요합니다."
    : checkedCount > 0
      ? `선택된 ${checkedCount}건 검토 처리`
      : "처리할 항목을 표에서 먼저 체크해 주십시오.";

  container.innerHTML = `
    <div class="allowance-toolbar">
      <div class="allowance-toolbar-top">
        <div class="allowance-tabs-group" role="tablist" aria-label="수당 관리 보기 전환">
          <button type="button" class="allowance-tab-btn ${isResultsTab ? "active" : ""}" data-tab="results" role="tab" aria-selected="${isResultsTab}">
            수당 산출 내역
          </button>
          <button type="button" class="allowance-tab-btn ${activeTab === "calculations" ? "active" : ""}" data-tab="calculations" role="tab" aria-selected="${activeTab === "calculations"}">
            계산 과거 이력
          </button>
          <button type="button" class="allowance-tab-btn ${activeTab === "reviews" || activeTab === "history" ? "active" : ""}" data-tab="reviews" role="tab" aria-selected="${activeTab === "reviews" || activeTab === "history"}">
            검토 이력
          </button>
          <button type="button" class="allowance-tab-btn ${activeTab === "exports" || activeTab === "proposals" ? "active" : ""}" data-tab="exports" role="tab" aria-selected="${activeTab === "exports" || activeTab === "proposals"}">
            품의 및 출력 이력
          </button>
        </div>

        <div class="allowance-toolbar-actions">
          ${
            !canReview
              ? `<span class="allowance-role-hint" id="allowance-role-hint">검토·품의 승인은 승인자/관리자 전용 (조회·미리보기·조기일·출력 가능)</span>`
              : ""
          }
          ${
            isResultsTab
              ? `
            <button type="button" class="allowance-btn success" id="btn-batch-approve" ${!canReview || checkedCount === 0 ? "disabled" : ""} title="${escapeHtml(approveRejectTitle)}">
              선택 검토 승인${checkedCount > 0 ? ` (${checkedCount})` : ""}
            </button>
            <button type="button" class="allowance-btn danger" id="btn-batch-reject" ${!canReview || checkedCount === 0 ? "disabled" : ""} title="${escapeHtml(approveRejectTitle)}">
              선택 반려${checkedCount > 0 ? ` (${checkedCount})` : ""}
            </button>
            <button type="button" class="allowance-btn secondary" id="btn-batch-export" ${checkedCount === 0 ? "disabled" : ""} title="선택한 승인/품의완료 건 문서 3종 재출력">
              선택 문서 출력
            </button>
            <button type="button" class="allowance-btn primary" id="btn-open-proposal" title="검토 승인된 건에 대한 품의서 미리보기 및 결재">
              품의서 미리보기
            </button>
          `
              : ""
          }
          <button type="button" class="allowance-btn secondary" id="btn-allowance-refresh" title="서버 최신 결과 새로고침">
            새로고침
          </button>
        </div>
      </div>

      ${
        hasError
          ? `
        <div class="allowance-alert error" id="allowance-primary-error" role="alert">
          <strong>수당 결과 조회 실패:</strong> ${escapeHtml(errorMessage || "데이터 조회 실패")}
        </div>
      `
          : ""
      }

      ${
        secondaryErrorMessage
          ? `
        <div class="allowance-alert warning" id="allowance-secondary-error" role="alert">
          <strong>부가 이력 조회 오류:</strong> ${escapeHtml(secondaryErrorMessage)}
        </div>
      `
          : ""
      }

      <div class="allowance-toolbar-bottom"${!isResultsTab ? " hidden" : ""}>
        <div class="allowance-control-group">
          <label for="sel-allowance-month" class="allowance-control-label">근무월</label>
          <select id="sel-allowance-month" class="allowance-select">
            <option value="all"${!currentMonth || currentMonth === "all" ? " selected" : ""}>전체 근무월</option>
            ${monthOptions}
          </select>
        </div>

        <div class="allowance-control-group">
          <label for="sel-allowance-site" class="allowance-control-label">근무지</label>
          <select id="sel-allowance-site" class="allowance-select">
            <option value="all"${filter.siteName === "all" ? " selected" : ""}>전체 근무지</option>
            ${siteOptions}
          </select>
        </div>

        <div class="allowance-control-group">
          <label for="sel-allowance-status" class="allowance-control-label">상태</label>
          <select id="sel-allowance-status" class="allowance-select">
            <option value="all"${currentStatus === "all" ? " selected" : ""}>전체 상태</option>
            <option value="pending"${currentStatus === "pending" ? " selected" : ""}>검토 대기</option>
            <option value="approved"${currentStatus === "approved" ? " selected" : ""}>검토 승인</option>
            <option value="rejected"${currentStatus === "rejected" ? " selected" : ""}>반려</option>
            <option value="proposal-approved"${currentStatus === "proposal-approved" ? " selected" : ""}>품의 완료(마감)</option>
          </select>
        </div>

        <div class="allowance-control-group">
          <label for="sel-allowance-worktype" class="allowance-control-label">근무유형</label>
          <select id="sel-allowance-worktype" class="allowance-select">
            <option value="all"${!filter.workType || filter.workType === "all" ? " selected" : ""}>전체 유형</option>
            <option value="substitute"${filter.workType === "substitute" ? " selected" : ""}>대체근무</option>
            <option value="overtime"${filter.workType === "overtime" ? " selected" : ""}>연장근무</option>
            <option value="holiday"${filter.workType === "holiday" ? " selected" : ""}>휴일근무</option>
            <option value="night"${filter.workType === "night" ? " selected" : ""}>야간근무</option>
            <option value="regular"${filter.workType === "regular" ? " selected" : ""}>통상근무</option>
          </select>
        </div>

        <div class="allowance-control-group">
          <label for="sel-allowance-payout" class="allowance-control-label">지급구분</label>
          <select id="sel-allowance-payout" class="allowance-select">
            <option value="all"${filter.payoutType === "all" ? " selected" : ""}>전체</option>
            <option value="regular"${filter.payoutType === "regular" ? " selected" : ""}>정규 지급</option>
            <option value="early"${filter.payoutType === "early" ? " selected" : ""}>조기 지급</option>
          </select>
        </div>

        <div class="allowance-control-group">
          <label for="inp-allowance-search" class="allowance-control-label">검색</label>
          <input
            type="search"
            id="inp-allowance-search"
            class="allowance-search-input allowance-input"
            placeholder="사번, 이름, 근무지, 구분..."
            value="${escapeHtml(filter.searchQuery)}"
          />
        </div>

        <div class="allowance-control-group">
          <label for="sel-allowance-density" class="allowance-control-label">밀도</label>
          <select id="sel-allowance-density" class="allowance-select">
            <option value="compact"${filter.density === "compact" ? " selected" : ""}>조밀하게</option>
            <option value="normal"${filter.density === "normal" ? " selected" : ""}>보통</option>
            <option value="spacious"${filter.density === "spacious" ? " selected" : ""}>넓게</option>
          </select>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>(".allowance-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab") as AllowanceTabId;
      if (tabId) options.onTabChange(tabId);
    });
  });

  container
    .querySelector<HTMLButtonElement>("#btn-allowance-refresh")
    ?.addEventListener("click", () => options.onRefresh());
  container
    .querySelector<HTMLButtonElement>("#btn-open-proposal")
    ?.addEventListener("click", () => options.onOpenProposalModal());
  container
    .querySelector<HTMLButtonElement>("#btn-batch-approve")
    ?.addEventListener("click", () => options.onBatchApprove?.());
  container
    .querySelector<HTMLButtonElement>("#btn-batch-reject")
    ?.addEventListener("click", () => options.onBatchReject?.());
  container
    .querySelector<HTMLButtonElement>("#btn-batch-export")
    ?.addEventListener("click", () => options.onBatchExport?.());

  const selMonth = container.querySelector<HTMLSelectElement>("#sel-allowance-month");
  selMonth?.addEventListener("change", () => {
    const val = selMonth.value === "all" ? "" : selMonth.value;
    options.onFilterChange({ workMonth: val, scheduleMonth: val });
  });

  const selSite = container.querySelector<HTMLSelectElement>("#sel-allowance-site");
  selSite?.addEventListener("change", () => {
    options.onFilterChange({ siteName: selSite.value });
  });

  const selStatus = container.querySelector<HTMLSelectElement>("#sel-allowance-status");
  selStatus?.addEventListener("change", () => {
    const val = selStatus.value as AllowanceFilterState["statusFilter"];
    options.onFilterChange({ status: val, statusFilter: val });
  });

  const selWorkType = container.querySelector<HTMLSelectElement>("#sel-allowance-worktype");
  selWorkType?.addEventListener("change", () => {
    options.onFilterChange({ workType: selWorkType.value });
  });

  const selPayout = container.querySelector<HTMLSelectElement>("#sel-allowance-payout");
  selPayout?.addEventListener("change", () => {
    options.onFilterChange({ payoutType: selPayout.value as AllowanceFilterState["payoutType"] });
  });

  const selDensity = container.querySelector<HTMLSelectElement>("#sel-allowance-density");
  selDensity?.addEventListener("change", () => {
    options.onFilterChange({ density: selDensity.value as AllowanceFilterState["density"] });
  });

  const inpSearch = container.querySelector<HTMLInputElement>("#inp-allowance-search");
  let searchTimer: number | null = null;
  inpSearch?.addEventListener("input", () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      options.onFilterChange({ searchQuery: inpSearch.value });
    }, 180);
  });
  inpSearch?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      if (searchTimer !== null) window.clearTimeout(searchTimer);
      options.onFilterChange({ searchQuery: inpSearch.value });
    }
  });
}
