import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import {
  deriveAllowanceBadges,
  formatAllowanceLineCodeLabel,
  formatCurrency,
  formatStatusLabel,
  formatWorkMinutes,
  formatWorkTypeLabel,
  inspectAllowanceSnapshot,
} from "./allowance-model";

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AllowanceDetailPanelOptions {
  canReview?: boolean;
  onApprove: (row: AllowanceCalculationResultRecord) => void;
  onReject: (row: AllowanceCalculationResultRecord) => void;
  onSetEarlyPayout: (row: AllowanceCalculationResultRecord) => void;
  onExportDocuments?: (row: AllowanceCalculationResultRecord) => void;
}

export class AllowanceDetailPanel {
  private options: AllowanceDetailPanelOptions;

  constructor(options: AllowanceDetailPanelOptions) {
    this.options = options;
  }

  public setCanReview(canReview: boolean): void {
    this.options.canReview = canReview;
  }

  public render(container: HTMLElement, row: AllowanceCalculationResultRecord | null): void {
    if (!container) return;

    if (!row) {
      container.innerHTML = `
        <div class="allowance-detail-header">
          <h2 class="allowance-detail-title">산출 상세 정보</h2>
        </div>
        <div class="allowance-detail-body">
          <div class="allowance-cell-empty">
            목록에서 행을 선택하면 저장된 수당 산출 근거 및 상세 내역이 표시됩니다.
          </div>
        </div>
      `;
      return;
    }

    const isLocked = row.status === "proposal-approved";
    const canReview = !!this.options.canReview;
    const badges = deriveAllowanceBadges(row);
    const badgesHtml = badges
      .map(b => `<span class="allowance-badge ${b.className}">${escapeHtml(b.label)}</span>`)
      .join(" ");

    const snapInfo = inspectAllowanceSnapshot(row);
    const breakdown = row.snapshot?.breakdown;
    const lines = row.snapshot?.lines || [];

    const linesHtml = !snapInfo.hasSnapshot
      ? '<tr><td colspan="4" class="text-center">산출 스냅샷 미저장</td></tr>'
      : lines.length === 0
        ? `<tr><td colspan="4" class="text-center">${snapInfo.isZeroAmount ? "산출 항목 없음 (정상 산출 0원)" : "산출 항목 없음"}</td></tr>`
        : lines
            .map(
              line => `
            <tr>
              <td>${escapeHtml(formatAllowanceLineCodeLabel(line.allowanceCode))}</td>
              <td class="text-right">${formatWorkMinutes(line.workMinutes)}</td>
              <td class="text-right">${line.multiplier}배</td>
              <td class="text-right font-bold">${formatCurrency(line.amount)}</td>
            </tr>
          `
            )
            .join("");

    const totalDisplay = !snapInfo.hasSnapshot
      ? "산출 스냅샷 미저장"
      : snapInfo.isZeroAmount
        ? "0원 (산출 0원)"
        : formatCurrency(snapInfo.totalAllowanceAmount);

    const consistencyNote = !snapInfo.hasSnapshot
      ? "저장된 스냅샷 데이터가 없습니다."
      : snapInfo.isLineSumConsistent
        ? `항목 합계 일치 (${formatCurrency(snapInfo.lineSumAmount)})`
        : `항목 합계(${formatCurrency(snapInfo.lineSumAmount)})와 저장 총액(${formatCurrency(snapInfo.totalAllowanceAmount)}) 차이 있음`;

    container.innerHTML = `
      <div class="allowance-detail-header">
        <h2 class="allowance-detail-title">수당 산출 상세</h2>
        <div>${badgesHtml}</div>
      </div>

      <div class="allowance-detail-body">
        <div class="allowance-detail-card">
          <div class="allowance-detail-card-title">근무자 및 산출 기준 정보</div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">계산 ID</span>
            <span class="allowance-detail-val" id="detail-calc-id">${escapeHtml(row.id)}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">성명 / 사번</span>
            <span class="allowance-detail-val"><strong>${escapeHtml(row.employeeName)}</strong> (${escapeHtml(row.employeeCode)})</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">직급 / 근무지</span>
            <span class="allowance-detail-val">${escapeHtml(row.employeeRank || "미확인")} / ${escapeHtml(row.siteName)}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">근무일자 / 유형</span>
            <span class="allowance-detail-val">${escapeHtml(row.workDate)} (${escapeHtml(formatWorkTypeLabel(row.workType))})</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">산출 구분</span>
            <span class="allowance-detail-val">${escapeHtml(snapInfo.businessCategoryLabel)}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">저장 적용 시급</span>
            <span class="allowance-detail-val font-bold" id="detail-hourly-rate">${formatCurrency(row.hourlyRate)}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">적용 요율 버전</span>
            <span class="allowance-detail-val">${escapeHtml(row.rateVersionLabel || row.rateVersionId || "-")}${snapInfo.calculationVersion !== null ? ` (v${snapInfo.calculationVersion})` : ""}</span>
          </div>
        </div>

        <div class="allowance-detail-card">
          <div class="allowance-detail-card-title">저장된 근로시간 배분</div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">총 인정 시간</span>
            <span class="allowance-detail-val font-bold text-blue">${formatWorkMinutes(breakdown?.totalWorkMinutes)}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">기본 / 연장 / 야간</span>
            <span class="allowance-detail-val">${formatWorkMinutes(breakdown?.baseWorkMinutes)} / ${formatWorkMinutes(breakdown?.overtimeMinutes)} / ${formatWorkMinutes(breakdown?.nightMinutes)}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">휴일 / 대체 인정</span>
            <span class="allowance-detail-val">${formatWorkMinutes(breakdown?.holidayMinutes)} / ${formatWorkMinutes(breakdown?.substituteMinutes)}</span>
          </div>
        </div>

        <div class="allowance-detail-card">
          <div class="allowance-detail-card-title">항목별 수당 산출 내역 (저장값)</div>
          <table class="allowance-table">
            <thead>
              <tr>
                <th>항목</th>
                <th class="text-right">시간</th>
                <th class="text-right">배율</th>
                <th class="text-right">금액</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" class="font-bold">저장 산출 총액</td>
                <td colspan="2" class="text-right font-bold allowance-detail-amount" id="detail-total-amount">
                  ${escapeHtml(totalDisplay)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div class="allowance-subtext" id="detail-snapshot-consistency">${escapeHtml(consistencyNote)}</div>
        </div>

        <div class="allowance-detail-card">
          <div class="allowance-detail-card-title">결재 상태 및 조기지급</div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">현재 결재 상태</span>
            <span class="allowance-detail-val" id="detail-status-label">${escapeHtml(formatStatusLabel(row.status))}</span>
          </div>
          <div class="allowance-detail-row">
            <span class="allowance-detail-key">조기지급 지정일</span>
            <span class="allowance-detail-val" id="detail-early-payout-text">${row.earlyPayoutDate ? escapeHtml(row.earlyPayoutDate) : "미지정 (정규 급여 반영)"}</span>
          </div>
        </div>
      </div>

      <div class="allowance-detail-actions">
        ${
          isLocked
            ? `
          <div class="allowance-locked-notice">
            <span>품의 완료(마감)된 건은 승인·반려·조기지급일 변경이 잠겨 있습니다.</span>
          </div>
          <button type="button" class="allowance-btn secondary" id="btn-detail-export" title="품의 완료된 수당 문서 3종 재출력">
            문서 출력
          </button>
        `
            : `
          ${
            !canReview
              ? `<div class="allowance-locked-notice" id="detail-role-notice">검토 승인·반려는 승인자(reviewer) 또는 관리자(admin)만 가능합니다.</div>`
              : ""
          }
          <button
            type="button"
            class="allowance-btn success"
            id="btn-detail-approve"
            ${!canReview ? "disabled title='승인자(reviewer) 또는 관리자(admin) 권한이 필요합니다.'" : row.status === "approved" ? "disabled title='이미 검토 승인 상태입니다.'" : ""}
          >
            검토 승인
          </button>
          <button
            type="button"
            class="allowance-btn danger"
            id="btn-detail-reject"
            ${!canReview ? "disabled title='승인자(reviewer) 또는 관리자(admin) 권한이 필요합니다.'" : row.status === "rejected" ? "disabled title='이미 반려 상태입니다.'" : ""}
          >
            검토 반려
          </button>
          <button type="button" class="allowance-btn secondary" id="btn-detail-early-payout" title="미마감 현재 건 조기지급일 지정 또는 해제">
            조기지급일 설정
          </button>
          ${
            row.status === "approved"
              ? `
            <button type="button" class="allowance-btn secondary" id="btn-detail-export" title="승인된 수당 문서 3종 출력">
              문서 출력
            </button>
          `
              : ""
          }
        `
        }
      </div>
    `;

    const btnApprove = container.querySelector<HTMLButtonElement>("#btn-detail-approve");
    if (btnApprove && canReview && row.status !== "approved") {
      btnApprove.addEventListener("click", () => this.options.onApprove(row));
    }

    const btnReject = container.querySelector<HTMLButtonElement>("#btn-detail-reject");
    if (btnReject && canReview && row.status !== "rejected") {
      btnReject.addEventListener("click", () => this.options.onReject(row));
    }

    const btnEarly = container.querySelector<HTMLButtonElement>("#btn-detail-early-payout");
    if (btnEarly && !isLocked) {
      btnEarly.addEventListener("click", () => this.options.onSetEarlyPayout(row));
    }

    const btnExport = container.querySelector<HTMLButtonElement>("#btn-detail-export");
    if (btnExport && this.options.onExportDocuments) {
      btnExport.addEventListener("click", () => this.options.onExportDocuments?.(row));
    }
  }
}

export { AllowanceDetailPanel as AllowanceDetailComponent };
