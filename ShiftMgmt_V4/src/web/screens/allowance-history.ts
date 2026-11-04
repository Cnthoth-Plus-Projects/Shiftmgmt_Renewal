import { renderPagination } from "../pagination";
import { WorkforceDialog } from "./workforce-dialog";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceCalculationStatus,
  AllowanceProposalApprovalRecord,
} from "../../shared/domain/allowance-workflow";
import type { AllowanceDocumentExportRecord } from "../../shared/domain/allowance-document";
import {
  formatCurrency,
  formatStatusLabel,
  formatWorkMinutes,
  formatWorkTypeLabel,
} from "./allowance-model";

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Compact local time; the cell title retains the original timestamp. */
function historyTime(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

export interface AllowanceHistoryState {
  calculationHistory: AllowanceCalculationResultRecord[];
  currentResultIds: Set<string>;
  calculationError?: string;
  reviewHistory: AllowanceApprovalRecord[];
  reviewError?: string;
  proposalHistory: AllowanceProposalApprovalRecord[];
  proposalError?: string;
  exportHistory: AllowanceDocumentExportRecord[];
  exportError?: string;
  recentExportWarnings: Map<string, string[]>;
  calcScopeFilter: "all" | "past";
  calcStatusFilter: AllowanceCalculationStatus | "all";
  calcSearchQuery: string;
  reviewFilterStatus: "all" | "approved" | "rejected";
  reviewSearchQuery: string;
  calcPage: number;
  reviewPage: number;
  proposalPage: number;
  exportPage: number;
}

export class AllowanceHistoryView {
  private onNavigateCalculation?: (calculationId: string) => void;
  private pageSizes = { calc: 1, review: 1, proposal: 1, export: 1 };
  private resizeObserver: ResizeObserver | null = null;
  private layoutFrame: number | null = null;
  private detailDialog = new WorkforceDialog();

  /** Release layout work when switching tabs or leaving the owning screen. */
  public deactivate(): void {
    this.stopMeasuring();
    this.detailDialog.close();
  }

  public destroy(): void {
    this.deactivate();
    this.onNavigateCalculation = undefined;
  }

  private stopMeasuring(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
  }

  private fitPages(targetEl: HTMLElement, render: () => void): void {
    const wrapper = targetEl.querySelector<HTMLElement>(".allowance-history-wrapper");
    if (!wrapper) return;
    wrapper.querySelectorAll<HTMLElement>("td").forEach(cell => {
      if (!cell.title) cell.title = cell.textContent?.trim() || "";
    });
    const measure = () => {
      this.layoutFrame = null;
      if (!wrapper.isConnected) { this.stopMeasuring(); return; }
      let changed = false;
      wrapper.querySelectorAll<HTMLElement>("[data-history-page]").forEach(viewport => {
        const key = viewport.dataset.historyPage as keyof typeof this.pageSizes;
        const head = viewport.querySelector("thead");
        if (!head || viewport.clientHeight <= 0) return;
        const rowHeight = 32;
        const available = viewport.clientHeight - head.getBoundingClientRect().height;
        const size = Math.max(1, Math.floor((available - 0.5) / rowHeight));
        if (size === this.pageSizes[key]) return;
        const pageKey = key === "calc" ? "calcPage" : key === "review" ? "reviewPage" : key === "proposal" ? "proposalPage" : "exportPage";
        const firstIndex = (this.state[pageKey] - 1) * this.pageSizes[key];
        this.pageSizes[key] = size;
        this.state[pageKey] = Math.floor(firstIndex / size) + 1;
        changed = true;
      });
      if (changed) render();
    };
    const queue = () => {
      if (this.layoutFrame === null) this.layoutFrame = requestAnimationFrame(measure);
    };
    this.resizeObserver = new ResizeObserver(queue);
    this.resizeObserver.observe(wrapper);
    wrapper.querySelectorAll<HTMLElement>("[data-history-page]").forEach(el => this.resizeObserver?.observe(el));
    queue();
  }

  private state: AllowanceHistoryState = {
    calculationHistory: [],
    currentResultIds: new Set(),
    recentExportWarnings: new Map(),
    reviewHistory: [],
    proposalHistory: [],
    exportHistory: [],
    calcScopeFilter: "all",
    calcStatusFilter: "all",
    calcSearchQuery: "",
    reviewFilterStatus: "all",
    reviewSearchQuery: "",
    calcPage: 1,
    reviewPage: 1,
    proposalPage: 1,
    exportPage: 1,
  };

  public setOnNavigateCalculation(cb: (calculationId: string) => void): void {
    this.onNavigateCalculation = cb;
  }

  public recordExportWarnings(exportId: string, names: string[] | undefined): void {
    if (exportId && names && names.length > 0) {
      this.state.recentExportWarnings.set(exportId, [...names]);
    }
  }

  public updateData(params: {
    currentResultIds?: Set<string>;
    calculations?: { data?: AllowanceCalculationResultRecord[]; error?: string };
    reviews?: { data?: AllowanceApprovalRecord[]; error?: string };
    proposals?: { data?: AllowanceProposalApprovalRecord[]; error?: string };
    exports?: { data?: AllowanceDocumentExportRecord[]; error?: string };
  }): void {
    if (params.currentResultIds) {
      this.state.currentResultIds = new Set(params.currentResultIds);
    }
    if (params.calculations) {
      if (params.calculations.error !== undefined) {
        this.state.calculationError = params.calculations.error;
      } else if (params.calculations.data) {
        this.state.calculationHistory = params.calculations.data;
        this.state.calculationError = undefined;
      }
    }
    if (params.reviews) {
      if (params.reviews.error !== undefined) {
        this.state.reviewError = params.reviews.error;
      } else if (params.reviews.data) {
        this.state.reviewHistory = params.reviews.data;
        this.state.reviewError = undefined;
      }
    }
    if (params.proposals) {
      if (params.proposals.error !== undefined) {
        this.state.proposalError = params.proposals.error;
      } else if (params.proposals.data) {
        this.state.proposalHistory = params.proposals.data;
        this.state.proposalError = undefined;
      }
    }
    if (params.exports) {
      if (params.exports.error !== undefined) {
        this.state.exportError = params.exports.error;
      } else if (params.exports.data) {
        this.state.exportHistory = params.exports.data;
        this.state.exportError = undefined;
      }
    }
  }

  private appendFooter(
    targetEl: HTMLElement,
    selector: string,
    idPrefix: string,
    label: string,
    currentPage: number,
    totalPages: number,
    totalCount: number,
    onChange: (page: number) => void
  ): void {
    const footerEl = targetEl.querySelector<HTMLElement>(selector);
    if (!footerEl) return;
    footerEl.append(
      renderPagination({
        currentPage,
        totalPages,
        totalCount,
        idPrefix,
        label,
        onPageChange: onChange,
      })
    );
  }

  private bindSearch(
    targetEl: HTMLElement,
    selector: string,
    onValue: (val: string) => void
  ): void {
    const inp = targetEl.querySelector<HTMLInputElement>(selector);
    inp?.addEventListener("input", () => {
      const pos = inp.selectionStart ?? inp.value.length;
      onValue(inp.value);
      const next = targetEl.querySelector<HTMLInputElement>(selector);
      if (next) {
        next.focus({ preventScroll: true });
        next.setSelectionRange(pos, pos);
      }
    });
  }

  /** 계산 과거 버전 이력 탭 (UI06-D07, R12, S15, L01: 과거 대체 버전 읽기 전용 구분 및 공통 페이지네이션) */
  public renderCalculationsTab(targetEl: HTMLElement): void {
    if (!targetEl) return;
    this.stopMeasuring();

    if (this.state.calculationError) {
      targetEl.innerHTML = `<div class="allowance-history-wrapper allowance-history-dense"><div class="allowance-alert error alert-spaced" id="calc-history-error" role="alert"><strong>계산 이력 조회 실패:</strong> ${esc(this.state.calculationError)}</div></div>`;
      return;
    }

    const pastTotalCount = this.state.calculationHistory.filter(
      r => !this.state.currentResultIds.has(r.id)
    ).length;

    let filtered = [...this.state.calculationHistory];
    if (this.state.calcScopeFilter === "past") {
      filtered = filtered.filter(r => !this.state.currentResultIds.has(r.id));
    }
    if (this.state.calcStatusFilter !== "all") {
      filtered = filtered.filter(r => r.status === this.state.calcStatusFilter);
    }
    const q = this.state.calcSearchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        r =>
          (r.employeeName || "").toLowerCase().includes(q) ||
          (r.employeeCode || "").toLowerCase().includes(q) ||
          (r.siteName || "").toLowerCase().includes(q) ||
          (r.fileName || "").toLowerCase().includes(q)
      );
    }

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / this.pageSizes.calc));
    if (this.state.calcPage > totalPages) this.state.calcPage = totalPages;
    const start = (this.state.calcPage - 1) * this.pageSizes.calc;
    const pageRows = filtered.slice(start, start + this.pageSizes.calc);

    const rowsHtml =
      pageRows.length === 0
        ? `<tr><td colspan="10" class="allowance-cell-empty">조건에 해당하는 계산 저장 이력이 없습니다.</td></tr>`
        : pageRows
            .map(r => {
              const isLatest = this.state.currentResultIds.has(r.id);
              const mins = r.snapshot?.breakdown?.totalWorkMinutes ?? 0;
              const amt = r.snapshot?.totalAllowanceAmount ?? 0;
              const stCls = r.status === "proposal-approved" ? "badge-locked" : `badge-${r.status}`;
              const verBadge = isLatest
                ? `<span class="allowance-badge badge-approved">현재 최신</span>`
                : `<span class="allowance-badge badge-locked" data-past-version="true">과거 버전 · 읽기 전용</span>`;
              const jumpHtml = isLatest
                ? `<button type="button" class="allowance-btn secondary btn-jump-calc" data-calc-id="${esc(r.id)}" aria-label="현재 계산 결과에서 보기">결과 보기</button>`
                : `<span class="allowance-history-readonly" title="재승인 전 보존본으로 변경이 차단됩니다.">읽기 전용</span>`;
              return `<tr class="allowance-data-row" data-calc-history-id="${esc(r.id)}" data-is-past="${!isLatest}"><td>${verBadge}</td><td>${esc(r.workDate)}</td><td>${esc(r.siteName)}</td><td>${esc(r.employeeCode)}</td><td><strong>${esc(r.employeeName)}</strong></td><td>${esc(formatWorkTypeLabel(r.workType))}</td><td>${formatWorkMinutes(mins)}</td><td class="text-right font-bold">${esc(formatCurrency(amt))}</td><td><span class="allowance-badge ${stCls}">${esc(formatStatusLabel(r.status))}</span></td><td><div class="allowance-history-rate"><span title="${esc(r.rateVersionLabel || r.rateVersionId || "-")}">${esc(r.rateVersionLabel || r.rateVersionId || "-")}</span>${jumpHtml}</div></td></tr>`;
            })
            .join("");

    targetEl.innerHTML = `
      <div class="allowance-history-wrapper allowance-history-dense">
        <div class="allowance-history-toolbar">
          <div class="allowance-control-group">
            <label for="sel-calc-history-scope" class="allowance-control-label">버전 구분</label>
            <select id="sel-calc-history-scope" class="allowance-select">
              <option value="all"${this.state.calcScopeFilter === "all" ? " selected" : ""}>전체 저장 이력</option>
              <option value="past"${this.state.calcScopeFilter === "past" ? " selected" : ""}>과거 대체 버전만 (읽기 전용)</option>
            </select>
            <label for="sel-calc-history-status" class="allowance-control-label">상태</label>
            <select id="sel-calc-history-status" class="allowance-select">
              <option value="all"${this.state.calcStatusFilter === "all" ? " selected" : ""}>전체 상태</option>
              <option value="pending"${this.state.calcStatusFilter === "pending" ? " selected" : ""}>검토 대기</option>
              <option value="approved"${this.state.calcStatusFilter === "approved" ? " selected" : ""}>검토 승인</option>
              <option value="rejected"${this.state.calcStatusFilter === "rejected" ? " selected" : ""}>반려</option>
              <option value="proposal-approved"${this.state.calcStatusFilter === "proposal-approved" ? " selected" : ""}>품의 완료(마감)</option>
            </select>
            <label for="inp-calc-history-search" class="allowance-control-label">검색</label>
            <input type="search" id="inp-calc-history-search" class="allowance-search-input allowance-input" placeholder="사번, 이름, 근무지, 파일명..." value="${esc(this.state.calcSearchQuery)}" />
          </div>
          <span class="allowance-footer-summary" id="calc-history-summary">조회 ${totalCount.toLocaleString()}건 (과거 대체 버전 ${pastTotalCount.toLocaleString()}건 · 과거 버전은 읽기 전용)</span>
        </div>
        <div class="allowance-history-body allowance-history-viewport" data-history-page="calc">
          <table class="allowance-table allowance-calculation-history-table">
            <thead><tr><th>버전 구분</th><th>근무일</th><th>근무지</th><th>사번</th><th>성명</th><th>근무유형</th><th>인정시간</th><th class="text-right">산출금액</th><th>상태</th><th>요율버전 / 연결</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="allowance-table-footer" id="calc-history-footer">
          <span class="allowance-footer-summary">페이지 ${this.state.calcPage} / ${totalPages} (총 ${totalCount.toLocaleString()}건)</span>
        </div>
      </div>
    `;

    this.appendFooter(
      targetEl,
      "#calc-history-footer",
      "calc-history",
      "계산 이력 페이지 이동",
      this.state.calcPage,
      totalPages,
      totalCount,
      page => {
        this.state.calcPage = page;
        this.renderCalculationsTab(targetEl);
      }
    );

    const selScope = targetEl.querySelector<HTMLSelectElement>("#sel-calc-history-scope");
    selScope?.addEventListener("change", () => {
      this.state.calcScopeFilter = selScope.value as "all" | "past";
      this.state.calcPage = 1;
      this.renderCalculationsTab(targetEl);
    });

    const selStatus = targetEl.querySelector<HTMLSelectElement>("#sel-calc-history-status");
    selStatus?.addEventListener("change", () => {
      this.state.calcStatusFilter = selStatus.value as AllowanceCalculationStatus | "all";
      this.state.calcPage = 1;
      this.renderCalculationsTab(targetEl);
    });

    this.bindSearch(targetEl, "#inp-calc-history-search", val => {
      this.state.calcSearchQuery = val;
      this.state.calcPage = 1;
      this.renderCalculationsTab(targetEl);
    });
    this.bindJumpButtons(targetEl);
    this.fitPages(targetEl, () => this.renderCalculationsTab(targetEl));
  }

  /** 검토 및 결재 이력 탭 (R12, S15: 55건 이상 다수 페이지 공통 페이지네이션 + 원 계산 연결) */
  public renderReviewsTab(targetEl: HTMLElement): void {
    if (!targetEl) return;
    this.stopMeasuring();

    if (this.state.reviewError) {
      targetEl.innerHTML = `<div class="allowance-history-wrapper allowance-history-dense"><div class="allowance-alert error alert-spaced" id="review-history-error" role="alert"><strong>검토 이력 조회 실패:</strong> ${esc(this.state.reviewError)}</div></div>`;
      return;
    }

    let filtered = [...this.state.reviewHistory];
    if (this.state.reviewFilterStatus !== "all") {
      filtered = filtered.filter(r => r.decision === this.state.reviewFilterStatus);
    }
    const q = this.state.reviewSearchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        r =>
          (r.employeeName || "").toLowerCase().includes(q) ||
          (r.employeeCode || "").toLowerCase().includes(q) ||
          (r.comment && r.comment.toLowerCase().includes(q)) ||
          (r.siteName || "").toLowerCase().includes(q)
      );
    }

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / this.pageSizes.review));
    if (this.state.reviewPage > totalPages) this.state.reviewPage = totalPages;
    const start = (this.state.reviewPage - 1) * this.pageSizes.review;
    const pageRows = filtered.slice(start, start + this.pageSizes.review);

    const rowsHtml =
      pageRows.length === 0
        ? `<tr><td colspan="9" class="allowance-cell-empty">기록된 검토 이력이 없습니다.</td></tr>`
        : pageRows
            .map(r => {
              const hasCurrent = this.state.currentResultIds.has(r.calculationId);
              const badgeCls = r.decision === "approved" ? "badge-approved" : "badge-rejected";
              const decLabel = r.decision === "approved" ? "승인" : "반려";
              const targetHtml = hasCurrent
                ? `<button type="button" class="allowance-btn secondary btn-jump-calc" data-calc-id="${esc(r.calculationId)}">대상 보기</button>`
                : `<span class="allowance-subtext">${esc(r.calculationId.slice(0, 8))}</span>`;
              return `<tr class="allowance-data-row" data-review-id="${esc(r.id)}"><td title="${esc(r.processedAt)}">${esc(historyTime(r.processedAt))}</td><td>${esc(r.workMonth)}</td><td>${esc(r.siteName)}</td><td>${esc(r.employeeCode)}</td><td><strong>${esc(r.employeeName)}</strong></td><td><span class="allowance-badge ${badgeCls}">${decLabel}</span></td><td>${esc(r.processedByName || r.processedBy)}</td><td>${esc(r.comment || "-")}</td><td>${targetHtml}</td></tr>`;
            })
            .join("");

    targetEl.innerHTML = `
      <div class="allowance-history-wrapper allowance-history-dense">
        <div class="allowance-history-toolbar">
          <div class="allowance-control-group">
            <label for="sel-history-decision" class="allowance-control-label">판정</label>
            <select id="sel-history-decision" class="allowance-select">
              <option value="all"${this.state.reviewFilterStatus === "all" ? " selected" : ""}>전체 판정</option>
              <option value="approved"${this.state.reviewFilterStatus === "approved" ? " selected" : ""}>승인</option>
              <option value="rejected"${this.state.reviewFilterStatus === "rejected" ? " selected" : ""}>반려</option>
            </select>
            <label for="inp-history-search" class="allowance-control-label">검색</label>
            <input type="search" id="inp-history-search" class="allowance-search-input allowance-input" placeholder="사번, 이름, 사유, 근무지..." value="${esc(this.state.reviewSearchQuery)}" />
          </div>
          <span class="allowance-footer-summary" id="review-history-summary">총 ${totalCount.toLocaleString()}건의 검토 이력</span>
        </div>
        <div class="allowance-history-body allowance-history-viewport" data-history-page="review">
          <table class="allowance-table allowance-review-history-table">
            <thead><tr><th>검토 일시</th><th>근무월</th><th>근무지</th><th>사번</th><th>성명</th><th>판정</th><th>검토자</th><th>비고 / 반려 사유</th><th>원 대상</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="allowance-table-footer" id="review-history-footer">
          <span class="allowance-footer-summary">페이지 ${this.state.reviewPage} / ${totalPages} (총 ${totalCount.toLocaleString()}건)</span>
        </div>
      </div>
    `;

    this.appendFooter(
      targetEl,
      "#review-history-footer",
      "review-history",
      "검토 이력 페이지 이동",
      this.state.reviewPage,
      totalPages,
      totalCount,
      page => {
        this.state.reviewPage = page;
        this.renderReviewsTab(targetEl);
      }
    );

    const selDecision = targetEl.querySelector<HTMLSelectElement>("#sel-history-decision");
    selDecision?.addEventListener("change", () => {
      this.state.reviewFilterStatus = selDecision.value as "all" | "approved" | "rejected";
      this.state.reviewPage = 1;
      this.renderReviewsTab(targetEl);
    });

    this.bindSearch(targetEl, "#inp-history-search", val => {
      this.state.reviewSearchQuery = val;
      this.state.reviewPage = 1;
      this.renderReviewsTab(targetEl);
    });
    this.bindJumpButtons(targetEl);
    this.fitPages(targetEl, () => this.renderReviewsTab(targetEl));
  }

  /** 품의 및 출력 이력 탭 (R12, R13, S14, S15: 백업 요약·3문서 경로 복사·실패 인라인 안내·prompt 0) */
  public renderExportsTab(targetEl: HTMLElement): void {
    if (!targetEl) return;
    this.stopMeasuring();

    const details = new Map<string, { title: string; html: string }>();
    const propTotal = this.state.proposalHistory.length;
    const propPages = Math.max(1, Math.ceil(propTotal / this.pageSizes.proposal));
    if (this.state.proposalPage > propPages) this.state.proposalPage = propPages;
    const propRows = this.state.proposalHistory.slice(
      (this.state.proposalPage - 1) * this.pageSizes.proposal,
      this.state.proposalPage * this.pageSizes.proposal
    );

    const expTotal = this.state.exportHistory.length;
    const expPages = Math.max(1, Math.ceil(expTotal / this.pageSizes.export));
    if (this.state.exportPage > expPages) this.state.exportPage = expPages;
    const expRows = this.state.exportHistory.slice(
      (this.state.exportPage - 1) * this.pageSizes.export,
      this.state.exportPage * this.pageSizes.export
    );

    const propRowsHtml =
      propRows.length === 0
        ? `<tr><td colspan="8" class="allowance-cell-empty">기록된 품의 결재 이력이 없습니다.</td></tr>`
        : propRows
            .map(p => {
              const bkp = p.backupSummary;
              const regAmt =
                p.regularTotalAllowanceAmount ??
                p.previewSnapshot?.regularTotalAllowanceAmount ??
                0;
              const earlyAmt =
                p.earlyPayoutTotalAllowanceAmount ??
                p.previewSnapshot?.earlyPayoutTotalAllowanceAmount ??
                0;
              const bkpHtml = bkp
                ? `<div>백업 기록 (테이블 ${bkp.tableCount ?? "기록 없음"} · 행 ${bkp.rowCount ?? "기록 없음"} · SHA ${esc(bkp.backupSha256 || "기록 없음")})</div><div class="allowance-file-item mt-4"><code class="allowance-path-code">${esc(bkp.jsonBackupPath)}</code><button type="button" class="allowance-btn secondary btn-copy-path" data-copy-path="${esc(bkp.jsonBackupPath)}">경로 복사</button><span class="allowance-copy-feedback" hidden></span></div>`
                : `<div>백업 요약 없음</div>`;
              const cmtHtml = p.comment
                ? `<div class="allowance-subtext">비고: ${esc(p.comment)}</div>`
                : "";
              details.set(`proposal:${p.id}`, { title: `${p.workMonth} 품의 백업 및 비고`, html: bkpHtml + cmtHtml });
              return `<tr class="allowance-data-row" data-proposal-id="${esc(p.id)}"><td title="${esc(p.approvedAt)}">${esc(historyTime(p.approvedAt))}</td><td>${esc(p.workMonth)}</td><td class="text-right">${p.employeeCount}명 · ${p.calculationCount}건</td><td class="text-right">${esc(formatCurrency(regAmt))} / ${esc(formatCurrency(earlyAmt))}</td><td class="text-right font-bold">${esc(formatCurrency(p.totalAllowanceAmount))}</td><td><span class="allowance-badge badge-locked">${esc(p.outputFormat.toUpperCase())}</span></td><td>${esc(p.approvedByName || p.approvedBy)}</td><td><div class="allowance-history-rate"><span>${bkp ? "백업 기록 있음" : "백업 요약 없음"}${p.comment ? " · 비고 있음" : ""}</span><button type="button" class="allowance-btn secondary" data-history-detail="${esc(`proposal:${p.id}`)}">상세</button></div></td></tr>`;
            })
            .join("");

    const expRowsHtml =
      expRows.length === 0
        ? `<tr><td colspan="6" class="allowance-cell-empty">기록된 문서 출력 이력이 없습니다.</td></tr>`
        : expRows
            .map(e => {
              const files = [
                { label: "품의서", name: e.proposalFileName, path: e.proposalPath },
                { label: "별첨 1", name: e.attachment1FileName, path: e.attachment1Path },
                { label: "별첨 2", name: e.attachment2FileName, path: e.attachment2Path },
              ];
              const warnings =
                e.rankMissingEmployeeNames && e.rankMissingEmployeeNames.length > 0
                  ? e.rankMissingEmployeeNames
                  : this.state.recentExportWarnings.get(e.id) || [];
              const firstCalcId = e.calculationIds?.[0];
              const jumpHtml =
                firstCalcId && this.state.currentResultIds.has(firstCalcId)
                  ? `<button type="button" class="allowance-btn secondary btn-jump-calc mt-4" data-calc-id="${esc(firstCalcId)}">원 대상 보기</button>`
                  : "";
              const warnHtml =
                warnings.length > 0
                  ? `<div class="allowance-alert warning export-rank-warning mt-4" role="status">직급 미확인 인원: ${warnings.map(esc).join(", ")}</div>`
                  : "";
              const filesHtml = files
                .map(
                  f =>
                    `<div class="allowance-file-item"><span class="allowance-badge badge-locked">${f.label}</span><strong>${esc(f.name)}</strong><code class="allowance-path-code">${esc(f.path)}</code><button type="button" class="allowance-btn secondary btn-copy-path" data-copy-path="${esc(f.path)}" title="전체 파일 경로 복사">경로 복사</button><span class="allowance-copy-feedback" hidden></span></div>`
                )
                .join("");
              details.set(`export:${e.id}`, { title: `${e.workMonth} 생성 문서 및 출력 안내`, html: warnHtml + jumpHtml + `<div class="allowance-file-list">${filesHtml}</div>` });
              return `<tr class="allowance-data-row" data-export-id="${esc(e.id)}"><td title="${esc(e.exportedAt)}">${esc(historyTime(e.exportedAt))}</td><td>${esc(e.workMonth)}</td><td><span class="allowance-badge badge-locked">${esc(e.outputFormat.toUpperCase())}</span></td><td class="text-right">${e.employeeCount}명 · ${e.calculationCount}건</td><td class="text-right font-bold">${esc(formatCurrency(e.totalAllowanceAmount))}</td><td><div class="allowance-history-rate"><span>품의서 · 별첨 1 · 별첨 2${warnings.length ? ` · 직급 확인 ${warnings.length}명` : ""}</span><button type="button" class="allowance-btn secondary" data-history-detail="${esc(`export:${e.id}`)}" aria-label="생성 문서 3종 및 출력 안내 상세">문서 상세</button></div></td></tr>`;
            })
            .join("");

    targetEl.innerHTML = `
      <div class="allowance-history-wrapper allowance-history-dense">
        <div class="allowance-history-body allowance-history-columns">
          <div class="allowance-history-section" id="proposal-history-section">
            <h3 class="allowance-history-section-title">수당 지급 품의 결재 완료 이력 (총 ${propTotal}건)</h3>
            ${
              this.state.proposalError
                ? `<div class="allowance-alert error" id="proposal-history-error" role="alert">품의 이력 조회 실패: ${esc(this.state.proposalError)}</div>`
                : `<div class="allowance-history-viewport" data-history-page="proposal"><table class="allowance-table"><thead><tr><th>결재 일시</th><th>근무월</th><th class="text-right">인원·건수</th><th class="text-right">정규 / 조기 지급액</th><th class="text-right">총 품의 금액</th><th>서식</th><th>결재자</th><th>JSON 백업 요약 · 비고</th></tr></thead><tbody>${propRowsHtml}</tbody></table></div><div class="allowance-table-footer" id="proposal-history-footer"><span class="allowance-footer-summary">품의 이력 ${this.state.proposalPage} / ${propPages} 페이지</span></div>`
            }
          </div>
          <div class="allowance-history-section" id="export-history-section">
            <h3 class="allowance-history-section-title">수당 산출 문서 출력 이력 (총 ${expTotal}건)</h3>
            ${
              this.state.exportError
                ? `<div class="allowance-alert error" id="export-history-error" role="alert">출력 이력 조회 실패: ${esc(this.state.exportError)}</div>`
                : `<div class="allowance-history-viewport" data-history-page="export"><table class="allowance-table"><thead><tr><th>출력 일시</th><th>근무월</th><th>서식</th><th class="text-right">인원·건수</th><th class="text-right">총 지급액</th><th>생성 문서 · 상세에서 경로 확인/복사</th></tr></thead><tbody>${expRowsHtml}</tbody></table></div><div class="allowance-table-footer" id="export-history-footer"><span class="allowance-footer-summary">출력 이력 ${this.state.exportPage} / ${expPages} 페이지</span></div>`
            }
          </div>
        </div>
      </div>
    `;

    if (!this.state.proposalError) {
      this.appendFooter(
        targetEl,
        "#proposal-history-footer",
        "proposal-history",
        "품의 이력 페이지 이동",
        this.state.proposalPage,
        propPages,
        propTotal,
        page => {
          this.state.proposalPage = page;
          this.renderExportsTab(targetEl);
        }
      );
    }
    if (!this.state.exportError) {
      this.appendFooter(
        targetEl,
        "#export-history-footer",
        "export-history",
        "문서 출력 이력 페이지 이동",
        this.state.exportPage,
        expPages,
        expTotal,
        page => {
          this.state.exportPage = page;
          this.renderExportsTab(targetEl);
        }
      );
    }

    targetEl.querySelectorAll<HTMLButtonElement>("[data-history-detail]").forEach(button => {
      button.addEventListener("click", () => {
        const detail = details.get(button.dataset.historyDetail || "");
        if (!detail) return;
        const content = document.createElement("div");
        content.className = "allowance-history-detail";
        content.innerHTML = detail.html;
        this.bindCopyButtons(content);
        this.bindJumpButtons(content);
        const overlay = this.detailDialog.open({
          id: "allowance-history-detail-modal", title: detail.title, content,
          triggerElement: button,
          buttons: [{ id: "btn-history-detail-close", label: "닫기", onClick: () => this.detailDialog.close() }],
        });
        overlay.classList.add("allowance-history-detail-overlay");
      });
    });
    this.fitPages(targetEl, () => this.renderExportsTab(targetEl));
  }

  private bindJumpButtons(targetEl: HTMLElement): void {
    targetEl.querySelectorAll<HTMLButtonElement>(".btn-jump-calc").forEach(btn => {
      btn.addEventListener("click", () => {
        const calcId = btn.getAttribute("data-calc-id");
        if (calcId) this.onNavigateCalculation?.(calcId);
      });
    });
  }

  private bindCopyButtons(targetEl: HTMLElement): void {
    targetEl.querySelectorAll<HTMLButtonElement>(".btn-copy-path").forEach(btn => {
      btn.addEventListener("click", () => {
        const copyPath = btn.getAttribute("data-copy-path");
        if (!copyPath) return;
        const itemEl = btn.closest(".allowance-file-item");
        const feedbackEl = itemEl?.querySelector<HTMLElement>(".allowance-copy-feedback");
        const codeEl = itemEl?.querySelector<HTMLElement>(".allowance-path-code");

        const showFailureAndSelect = () => {
          if (feedbackEl) {
            feedbackEl.textContent = "복사 실패 — 표시된 경로를 직접 복사하십시오.";
            feedbackEl.classList.add("error");
            feedbackEl.hidden = false;
          }
          if (codeEl && window.getSelection) {
            try {
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(codeEl);
              sel?.removeAllRanges();
              sel?.addRange(range);
            } catch {
              // ignore selection error
            }
          }
        };

        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard
            .writeText(copyPath)
            .then(() => {
              if (feedbackEl) {
                feedbackEl.textContent = "복사됨";
                feedbackEl.classList.remove("error");
                feedbackEl.hidden = false;
              }
            })
            .catch(showFailureAndSelect);
        } else {
          showFailureAndSelect();
        }
      });
    });
  }
}
