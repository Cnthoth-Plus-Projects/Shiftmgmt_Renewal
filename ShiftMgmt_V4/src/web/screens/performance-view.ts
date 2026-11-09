import type { PerformanceEntrySection } from "../../shared/domain/performance-file";
import type {
  DensityMode,
  PerformanceFilterState,
  PerformanceKpiSummary
} from "./performance-model";

export interface PerformanceViewCallbacks {
  onTabChange: (section: PerformanceEntrySection | "all") => void;
  onFilterChange: (filters: Partial<PerformanceFilterState>) => void;
  onForceReparse: () => void;
  onOpenIntakeModal: () => void;
}

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** KPI 바 렌더링 */
export function renderPerformanceKpiBar(
  container: HTMLElement,
  kpi: PerformanceKpiSummary
): void {
  container.innerHTML = `
    <div class="perf-kpi-card" id="kpi-total">
      <span class="perf-kpi-card-label">조회 결과</span>
      <span class="perf-kpi-card-value">${kpi.totalRows.toLocaleString("ko-KR")}</span>
    </div>
    <div class="perf-kpi-card kpi-pending" id="kpi-pending">
      <span class="perf-kpi-card-label">승인 대기</span>
      <span class="perf-kpi-card-value">${kpi.pendingCount.toLocaleString("ko-KR")}</span>
    </div>
    <div class="perf-kpi-card kpi-approved" id="kpi-approved">
      <span class="perf-kpi-card-label">승인 완료</span>
      <span class="perf-kpi-card-value">${kpi.approvedCount.toLocaleString("ko-KR")}</span>
    </div>
    <div class="perf-kpi-card kpi-reapproval" id="kpi-reapproval">
      <span class="perf-kpi-card-label">재승인 대기</span>
      <span class="perf-kpi-card-value">${kpi.needsReapprovalCount.toLocaleString("ko-KR")}</span>
    </div>
    <div class="perf-kpi-card kpi-rejected" id="kpi-rejected">
      <span class="perf-kpi-card-label">반려</span>
      <span class="perf-kpi-card-value">${kpi.rejectedCount.toLocaleString("ko-KR")}</span>
    </div>
    <div class="perf-kpi-card kpi-locked" id="kpi-locked">
      <span class="perf-kpi-card-label">변경 불가</span>
      <span class="perf-kpi-card-value">${kpi.changeLockedCount.toLocaleString("ko-KR")}</span>
    </div>
  `;
}

/** 툴바 렌더링 및 이벤트 연결 */
export function renderPerformanceToolbar(
  container: HTMLElement,
  filter: PerformanceFilterState,
  availableSites: string[],
  syncStatusText: string,
  callbacks: PerformanceViewCallbacks
): void {
  const sitesOptions = [
    `<option value="all" ${filter.siteName === "all" ? "selected" : ""}>근무지 전체</option>`,
    ...availableSites.map(
      site =>
        `<option value="${escapeHtml(site)}" ${
          filter.siteName === site ? "selected" : ""
        }>${escapeHtml(site)}</option>`
    )
  ].join("");

  container.innerHTML = `
    <div class="perf-toolbar-row-top">
      <div class="perf-tabs-group" role="tablist" aria-label="실적 유형">
        <button type="button" class="perf-tab-btn ${
          filter.section === "all" ? "active" : ""
        }" role="tab" data-section="all" id="perf-tab-all">전체</button>
        <button type="button" class="perf-tab-btn ${
          filter.section === "legal-holiday" ? "active" : ""
        }" role="tab" data-section="legal-holiday" id="perf-tab-holiday">법정휴일</button>
        <button type="button" class="perf-tab-btn ${
          filter.section === "substitute" ? "active" : ""
        }" role="tab" data-section="substitute" id="perf-tab-substitute">대체</button>
        <button type="button" class="perf-tab-btn ${
          filter.section === "overtime" ? "active" : ""
        }" role="tab" data-section="overtime" id="perf-tab-overtime">연장</button>
      </div>

      <div class="perf-sync-status-box">
        <span class="perf-sync-indicator" aria-hidden="true"></span>
        <span id="perf-sync-text">${escapeHtml(syncStatusText)}</span>
        <button type="button" class="perf-btn-secondary" id="btn-perf-intake-status" title="폴더 감시 및 대기 파일 상태 확인">
          <span class="material-symbols-outlined icon-18" aria-hidden="true">folder_open</span>
          <span>접수 현황</span>
        </button>
        <button type="button" class="perf-btn-secondary" id="btn-perf-reparse" title="엑셀 파일 다시 읽기">
          <span class="material-symbols-outlined icon-18" aria-hidden="true">refresh</span>
          <span>다시 읽기</span>
        </button>
      </div>
    </div>

    <div class="perf-toolbar-row-bottom">
      <div class="perf-control-group">
        <label for="perf-filter-scope" class="perf-control-label">승인 범위</label>
        <select id="perf-filter-scope" class="perf-select" aria-label="승인 범위 필터">
          <option value="pending" ${filter.approvalScope === "pending" ? "selected" : ""}>승인 대기</option>
          <option value="approved" ${filter.approvalScope === "approved" ? "selected" : ""}>승인 완료 보관본</option>
        </select>
      </div>

      <div class="perf-control-group">
        <label for="perf-filter-month" class="perf-control-label">근무월</label>
        <input type="month" id="perf-filter-month" class="perf-input" value="${filter.scheduleMonth}" aria-label="근무월 선택">
      </div>

      <div class="perf-control-group">
        <label for="perf-filter-date" class="perf-control-label">근무일</label>
        <input type="date" id="perf-filter-date" class="perf-input" value="${escapeHtml(filter.workDate ?? "")}" aria-label="근무일 선택">
      </div>

      <div class="perf-control-group">
        <label for="perf-filter-site" class="perf-control-label">근무지</label>
        <select id="perf-filter-site" class="perf-select" aria-label="근무지 필터">
          ${sitesOptions}
        </select>
      </div>

      <div class="perf-control-group">
        <label for="perf-filter-status" class="perf-control-label">상태</label>
        <select id="perf-filter-status" class="perf-select" aria-label="상태 필터">
          <option value="all" ${filter.statusFilter === "all" ? "selected" : ""}>상태 전체</option>
          <option value="pending" ${filter.statusFilter === "pending" ? "selected" : ""}>대기</option>
          <option value="approved" ${filter.statusFilter === "approved" ? "selected" : ""}>승인</option>
          <option value="rejected" ${filter.statusFilter === "rejected" ? "selected" : ""}>반려</option>
          <option value="reapproval-pending" ${
            filter.statusFilter === "reapproval-pending" ? "selected" : ""
          }>재승인 대기</option>
          <option value="reapproval-completed" ${
            filter.statusFilter === "reapproval-completed" ? "selected" : ""
          }>재승인 완료</option>
          <option value="locked" ${filter.statusFilter === "locked" ? "selected" : ""}>변경 불가</option>
          <option value="non-payable" ${filter.statusFilter === "non-payable" ? "selected" : ""}>수당 미지급</option>
        </select>
      </div>

      <div class="perf-control-group">
        <label for="perf-filter-search" class="perf-control-label">검색</label>
        <input type="text" id="perf-filter-search" class="perf-input perf-search-input" placeholder="사번, 이름, 근무일, 파일명, 사유..." value="${escapeHtml(
          filter.searchQuery
        )}" aria-label="실적 검색">
      </div>

      <div class="perf-control-group">
        <label for="perf-filter-density" class="perf-control-label">밀도</label>
        <select id="perf-filter-density" class="perf-select" aria-label="행 밀도">
          <option value="compact" ${filter.density === "compact" ? "selected" : ""}>조밀</option>
          <option value="normal" ${filter.density === "normal" ? "selected" : ""}>기본</option>
          <option value="spacious" ${filter.density === "spacious" ? "selected" : ""}>넓게</option>
        </select>
      </div>
    </div>
  `;

  // 탭 클릭 이벤트
  const tabBtns = container.querySelectorAll<HTMLButtonElement>(".perf-tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const sec = btn.dataset.section as PerformanceEntrySection | "all";
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      callbacks.onTabChange(sec);
    });
  });

  // 승인 범위 변경 (D02)
  const scopeSelect = container.querySelector<HTMLSelectElement>("#perf-filter-scope");
  scopeSelect?.addEventListener("change", () => {
    callbacks.onFilterChange({
      approvalScope: scopeSelect.value as "pending" | "approved"
    });
  });

  // 월 변경
  const monthInput = container.querySelector<HTMLInputElement>("#perf-filter-month");
  monthInput?.addEventListener("change", () => {
    callbacks.onFilterChange({ scheduleMonth: monthInput.value });
  });

  // 근무지 변경
  container.querySelector<HTMLInputElement>("#perf-filter-date")?.addEventListener("change", event => {
    callbacks.onFilterChange({ workDate: (event.target as HTMLInputElement).value });
  });

  // 근무지 변경
  const siteSelect = container.querySelector<HTMLSelectElement>("#perf-filter-site");
  siteSelect?.addEventListener("change", () => {
    callbacks.onFilterChange({ siteName: siteSelect.value });
  });

  // 상태 변경
  const statusSelect = container.querySelector<HTMLSelectElement>("#perf-filter-status");
  statusSelect?.addEventListener("change", () => {
    callbacks.onFilterChange({
      statusFilter: statusSelect.value as PerformanceFilterState["statusFilter"]
    });
  });

  // Local filtering is immediate; no detached input timer survives a render.
  const searchInput = container.querySelector<HTMLInputElement>("#perf-filter-search");
  searchInput?.addEventListener("input", () => {
    callbacks.onFilterChange({ searchQuery: searchInput.value });
  });

  // 밀도 변경
  const densitySelect = container.querySelector<HTMLSelectElement>("#perf-filter-density");
  densitySelect?.addEventListener("change", () => {
    callbacks.onFilterChange({
      density: densitySelect.value as DensityMode
    });
  });

  // 다시 읽기 버튼
  const reparseBtn = container.querySelector<HTMLButtonElement>("#btn-perf-reparse");
  reparseBtn?.addEventListener("click", () => {
    callbacks.onForceReparse();
  });

  // 접수 현황 버튼
  const intakeBtn = container.querySelector<HTMLButtonElement>("#btn-perf-intake-status");
  intakeBtn?.addEventListener("click", () => {
    callbacks.onOpenIntakeModal();
  });
}

/** 상태 안내 박스 렌더링 */
export function renderPerformanceStateBox(
  container: HTMLElement,
  kind: "loading" | "empty" | "error" | "unauthorized",
  message?: string,
  onRetry?: () => void
): void {
  let icon = "info";
  let title = "알림";
  let desc = message || "";

  switch (kind) {
    case "loading":
      icon = "sync";
      title = "실적 정보를 불러오는 중입니다";
      desc = "잠시만 기다려 주십시오...";
      break;
    case "empty":
      icon = "inbox";
      title = "조회된 실적이 없습니다";
      desc = desc || "선택한 조건에 해당하는 실적 내역이 없거나 아직 접수된 엑셀 파일이 없습니다.";
      break;
    case "error":
      icon = "error";
      title = "실적 조회 중 오류가 발생했습니다";
      desc = desc || "네트워크 상태 또는 서버 오류를 확인한 뒤 다시 시도해 주십시오.";
      break;
    case "unauthorized":
      icon = "lock";
      title = "권한이 없습니다";
      desc = desc || "실적을 조회하거나 승인할 권한이 없습니다.";
      break;
  }

  container.innerHTML = `
    <div class="perf-state-box">
      <span class="material-symbols-outlined ${kind === "loading" ? "icon-spin" : ""}" aria-hidden="true">${icon}</span>
      <h3 class="perf-state-title">${escapeHtml(title)}</h3>
      <p class="perf-state-desc">${escapeHtml(desc)}</p>
      ${
        kind === "error" && onRetry
          ? `<button type="button" class="perf-btn-secondary" id="btn-perf-retry">다시 시도</button>`
          : ""
      }
    </div>
  `;

  if (kind === "error" && onRetry) {
    container.querySelector("#btn-perf-retry")?.addEventListener("click", onRetry);
  }
}
