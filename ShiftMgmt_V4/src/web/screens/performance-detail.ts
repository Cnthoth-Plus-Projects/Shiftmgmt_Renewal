import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type { PerformanceOverviewRow } from "../../shared/domain/performance-file";
import {
  deriveRowBadges,
  formatCurrencyOrUnsaved,
  formatMinutesToHours,
  formatSectionLabel,
  getPerformanceDuty,
  type PerformanceDutyContext
} from "./performance-model";
import { escapeHtml } from "./performance-view";

export interface PerformanceDetailCallbacks {
  onApprove: (row: PerformanceOverviewRow) => void;
  onReject: (row: PerformanceOverviewRow) => void;
  onCompare: (row: PerformanceOverviewRow) => void;
  onHistory: (row: PerformanceOverviewRow) => void;
  onHideRow: (row: PerformanceOverviewRow) => void;
  onOpenSourceFile: (row: PerformanceOverviewRow) => void;
  onFinalizeFile: (fileId: string) => void;
  onReturnToPending: (fileId: string) => void;
}

export class PerformanceDetailPanel {
  private container: HTMLElement;
  private selectedRow: PerformanceOverviewRow | null = null;
  private calculationRecord: AllowanceCalculationResultRecord | null = null;
  private canPerformAction = false;
  private fileCanFinalize = false;
  private fileLocked = false;
  private callbacks: PerformanceDetailCallbacks;
  private dutyContext: PerformanceDutyContext = { sites: [], patterns: [], schedules: [] };

  constructor(container: HTMLElement, callbacks: PerformanceDetailCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public setData(
    row: PerformanceOverviewRow | null,
    calculation: AllowanceCalculationResultRecord | null,
    canPerformAction: boolean,
    fileCanFinalize = false,
    fileLocked = false,
    dutyContext = this.dutyContext
  ): void {
    this.selectedRow = row;
    this.calculationRecord = calculation;
    this.canPerformAction = canPerformAction;
    this.fileCanFinalize = fileCanFinalize;
    this.fileLocked = fileLocked;
    this.dutyContext = dutyContext;
    this.render();
  }

  public destroy(): void {
    this.container.innerHTML = "";
  }

  private render(): void {
    if (!this.selectedRow) {
      this.container.innerHTML = `
        <div class="perf-detail-header">
          <h3 class="perf-detail-title">실적 상세 정보</h3>
        </div>
        <div class="perf-detail-body">
          <div class="perf-state-box">
            <span class="material-symbols-outlined" aria-hidden="true">touch_app</span>
            <div class="perf-state-title">선택된 실적이 없습니다</div>
            <div class="perf-state-desc">좌측 표에서 실적 행을 선택하면 상세 내용과 승인/반려 동작을 확인하실 수 있습니다.</div>
          </div>
        </div>
      `;
      return;
    }

    const row = this.selectedRow;
    const entry = row.entry;
    const badges = deriveRowBadges(row);
    const badgesHtml = badges
      .map(
        b =>
          `<span class="perf-badge ${b.className}" title="${escapeHtml(
            b.description || b.label
          )}">${escapeHtml(b.label)}</span>`
      )
      .join("");

    // 저장 수당 포맷 (D06: 0원과 미저장 구분)
    const hasCalc = Boolean(this.calculationRecord);
    const totalPay = this.calculationRecord?.snapshot?.totalAllowanceAmount;
    const payFormatted = formatCurrencyOrUnsaved(totalPay, hasCalc);

    // 시급
    const hourlyRateFormatted = entry.hourlyRate
      ? `${entry.hourlyRate.toLocaleString("ko-KR")}원`
      : "기본 시급 미설정";

    // 시간 문자열
    const timeRange =
      entry.startTime && entry.endTime ? `${entry.startTime} ~ ${entry.endTime}` : "-";

    // 권한 비활성화 이유
    const actionDisabledReason = !this.canPerformAction
      ? "승인 담당 또는 관리자 권한이 필요합니다"
      : row.isChangeLocked
      ? row.changeLockedReason || "품의 완료 또는 잠금 상태입니다"
      : "";

    // 근무유형 한국어 포맷 (D07)
    const sectionKo = formatSectionLabel(entry.section);
    const workTypeKo =
      entry.workType === "substitute"
        ? "대체근무"
        : entry.workType === "holiday"
        ? "법정휴일"
        : entry.workType === "overtime"
        ? "연장근무"
        : entry.workType || sectionKo;
    const displayWorkType =
      workTypeKo === sectionKo ? workTypeKo : `${workTypeKo} (${sectionKo})`;
    const duty = getPerformanceDuty(row, this.dutyContext);

    this.container.innerHTML = `
      <div class="perf-detail-header">
        <h3 class="perf-detail-title">실적 상세 정보</h3>
        <div class="perf-cell-badges">${badgesHtml}</div>
      </div>

      <div class="perf-detail-body">
        <!-- 기본 정보 -->
        <div class="perf-detail-section">
          <div class="perf-detail-section-title">인력 및 근무 정보</div>
          <div class="perf-detail-grid">
            <span class="perf-detail-label">사번</span>
            <span class="perf-detail-value perf-cell-nowrap"><strong>${escapeHtml(
              entry.employeeCode || "-"
            )}</strong></span>

            <span class="perf-detail-label">이름</span>
            <span class="perf-detail-value perf-cell-nowrap">${escapeHtml(entry.employeeName || "-")} ${
      entry.employeeRank ? `(${escapeHtml(entry.employeeRank)})` : ""
    }</span>

            <span class="perf-detail-label">근무지 / 조</span>
            <span class="perf-detail-value">${escapeHtml(entry.siteName || "-")} / ${escapeHtml(
      entry.teamLabel || "-"
    )}</span>

            <span class="perf-detail-label">근무일자</span>
            <span class="perf-detail-value perf-cell-nowrap"><strong>${escapeHtml(
              entry.workDate || "-"
            )}</strong></span>

            <span class="perf-detail-label">근무유형</span>
            <span class="perf-detail-value"><span class="perf-duty-badge ${duty.className}">${escapeHtml(duty.label)}</span></span>

            <span class="perf-detail-label">실적 구분</span>
            <span class="perf-detail-value">${escapeHtml(displayWorkType)}</span>
          </div>
        </div>

        <!-- 근로 시간 -->
        <div class="perf-detail-section">
          <div class="perf-detail-section-title">근로 시간 내역</div>
          <div class="perf-detail-grid">
            <span class="perf-detail-label">근무 시간</span>
            <span class="perf-detail-value perf-cell-nowrap">${escapeHtml(timeRange)}</span>

            <span class="perf-detail-label">휴게 시간</span>
            <span class="perf-detail-value">${entry.breakMinutes}분</span>

            <span class="perf-detail-label">총 근로시간</span>
            <span class="perf-detail-value highlight perf-cell-nowrap">${
              entry.totalWorkMinutes
            }분 (${formatMinutesToHours(entry.totalWorkMinutes)})</span>

            <span class="perf-detail-label">기본 / 연장</span>
            <span class="perf-detail-value">${entry.baseWorkMinutes}분 / ${
      entry.overtimeMinutes
    }분</span>

            <span class="perf-detail-label">야간 근로</span>
            <span class="perf-detail-value">${entry.nightMinutes}분</span>
          </div>
        </div>

        <!-- 시급 및 저장 수당 -->
        <div class="perf-detail-section">
          <div class="perf-detail-section-title">시급 및 저장 수당</div>
          <div class="perf-detail-grid">
            <span class="perf-detail-label">적용 시급</span>
            <span class="perf-detail-value">${escapeHtml(hourlyRateFormatted)}</span>

            <span class="perf-detail-label">저장된 수당</span>
            <span class="perf-detail-value highlight perf-value-large">${escapeHtml(
              payFormatted
            )}</span>
          </div>
        </div>

        <!-- 정책 적용 정보 (POLICY-HISTORY-01) -->
        <div class="perf-detail-section">
          <div class="perf-detail-section-title">적용 정책 버전 및 기준</div>
          <div class="perf-detail-grid">
            <span class="perf-detail-label">정책 적용 상태</span>
            <span class="perf-detail-value">${(() => {
              const applied = (entry as unknown as { appliedPolicies?: { bindings?: Array<{ kind: string; ruleKey: string; versionNumber: number }> } }).appliedPolicies;
              if (!applied) return '<span class="policy-status-badge policy-status-past">기록 없음 (종전 데이터)</span>';
              if (!applied.bindings || applied.bindings.length === 0) return '<span class="policy-status-badge policy-status-past">미적용 (해당 정책 대상 아님)</span>';
              return applied.bindings.map((b) => {
                const kindLabel = b.kind === "substitute-eligibility" ? "대체수당" : "실제근무자";
                const ruleLabel = b.ruleKey === "substitute-legacy" ? "종전 방식" : b.ruleKey === "substitute-team-type-v1" ? "교대대체 한정" : b.ruleKey === "changed-worker-legacy" ? "원근무자 우선" : "실제근무자 우선";
                return `<span class="policy-version-badge">${escapeHtml(kindLabel)} V${b.versionNumber} (${escapeHtml(ruleLabel)})</span>`;
              }).join(" ");
            })()}</span>
          </div>
        </div>

        <!-- 원본 파일 및 증적 -->
        <div class="perf-detail-section">
          <div class="perf-detail-section-title">증적 및 원본 파일</div>
          <div class="perf-detail-grid">
            <span class="perf-detail-label">사유</span>
            <span class="perf-detail-value">${escapeHtml(entry.reason || "-")}</span>

            <span class="perf-detail-label">증적 내용</span>
            <span class="perf-detail-value">${escapeHtml(entry.evidence || "-")}</span>

            <span class="perf-detail-label">파일명</span>
            <span class="perf-detail-value">${escapeHtml(row.sourceFileName)}</span>

            <span class="perf-detail-label">수신 시각</span>
            <span class="perf-detail-value">${escapeHtml(row.sourceReceivedAt || "-")}</span>
          </div>
        </div>

        <!-- 승인 정보 -->
        ${
          row.latestApprovalAt
            ? `
          <div class="perf-detail-section">
            <div class="perf-detail-section-title">승인 정보</div>
            <div class="perf-detail-grid">
              <span class="perf-detail-label">승인자</span>
              <span class="perf-detail-value">${escapeHtml(row.latestApprovalByName || "-")}</span>

              <span class="perf-detail-label">승인 시각</span>
              <span class="perf-detail-value">${escapeHtml(row.latestApprovalAt)}</span>

              <span class="perf-detail-label">비고/사유</span>
              <span class="perf-detail-value">${escapeHtml(row.latestApprovalComment || "-")}</span>
            </div>
          </div>
        `
            : ""
        }
      </div>

      <!-- 액션 버튼 영역 -->
      <div class="perf-detail-actions">
        <!-- 승인 및 반려 (D07: 반려는 흰 보조버튼 스타일) -->
        <div class="perf-action-btn-row">
          <button type="button" class="perf-btn-primary" id="btn-perf-approve" ${
            !(row.canApprove || row.reapprovalStatus === "pending") || !this.canPerformAction || row.isChangeLocked ? "disabled" : ""
          } title="${escapeHtml(actionDisabledReason || "실적을 승인합니다")}">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">check_circle</span>
            <span>${row.needsReapproval ? "재승인" : "승인"}</span>
          </button>

          <button type="button" class="perf-btn-secondary" id="btn-perf-reject" ${
            !this.canPerformAction || row.isChangeLocked || row.approvalStatus === "approved"
              ? "disabled"
              : ""
          } title="${escapeHtml(actionDisabledReason || "실적을 반려합니다")}">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">cancel</span>
            <span>반려</span>
          </button>
        </div>

        <!-- 차이 비교 및 이력 -->
        <div class="perf-action-btn-row">
          <button type="button" class="perf-btn-secondary perf-btn-flex" id="btn-perf-compare" title="현재 실적과 승인본 차이 비교">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">compare_arrows</span>
            <span>차이 비교</span>
          </button>

          <button type="button" class="perf-btn-secondary perf-btn-flex" id="btn-perf-history" title="승인 및 반려 이력 확인">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">history</span>
            <span>승인 이력</span>
          </button>
        </div>

        <!-- 원본 열기 및 행 숨김 (D07: 품의잠금 시 숨김 불가) -->
        <div class="perf-action-btn-row">
          <button type="button" class="perf-btn-secondary perf-btn-flex" id="btn-perf-open-file" title="원본 엑셀 파일 열기">
            <span class="material-symbols-outlined icon-18" aria-hidden="true">description</span>
            <span>원본 열기</span>
          </button>

          ${
            row.approvalStatus === "approved"
              ? `
            <button type="button" class="perf-btn-secondary" id="btn-perf-hide-row" ${
              !row.canHideApprovedRow || row.isChangeLocked ? "disabled" : ""
            } title="${escapeHtml(
                  !row.canHideApprovedRow ? row.hideApprovedRowBlockedReason || "현재 상태에서는 숨길 수 없습니다" : row.isChangeLocked
                    ? "품의 완료 잠금으로 숨길 수 없습니다"
                    : "목록에서 숨김 (승인/수당 삭제 아님)"
                )}">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">visibility_off</span>
              <span>숨김</span>
            </button>
          `
              : ""
          }
        </div>

        <!-- 파일 단위 액션: 재승인본 확정 및 승인대기로 되돌리기 (D02) -->
        <div class="perf-action-btn-row perf-action-file-row">
          ${
            this.fileCanFinalize
              ? `
            <button type="button" class="perf-btn-primary perf-btn-flex" id="btn-perf-finalize-file" ${
              !this.canPerformAction ? "disabled" : ""
            } title="수정 실적의 재승인이 완료된 파일의 승인본을 정식 확정합니다">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">task_alt</span>
              <span>파일 확정</span>
            </button>
          `
              : ""
          }

          ${
            row.approvalStatus === "approved" || row.reapprovalStatus === "completed"
              ? `
            <button type="button" class="perf-btn-secondary perf-btn-flex" id="btn-perf-return-pending" ${
              !this.canPerformAction || this.fileLocked ? "disabled" : ""
            } title="${escapeHtml(
                  row.isChangeLocked
                    ? "품의 완료 잠금으로 되돌릴 수 없습니다"
                    : "파일 전체의 승인 기록과 계산을 지우고 승인대기로 되돌립니다"
                )}">
              <span class="material-symbols-outlined icon-18" aria-hidden="true">undo</span>
              <span>승인대기 복귀</span>
            </button>
          `
              : ""
          }
        </div>
      </div>
    `;

    // 이벤트 리스너 연결
    this.container.querySelector("#btn-perf-approve")?.addEventListener("click", () => {
      this.callbacks.onApprove(row);
    });

    this.container.querySelector("#btn-perf-reject")?.addEventListener("click", () => {
      this.callbacks.onReject(row);
    });

    this.container.querySelector("#btn-perf-compare")?.addEventListener("click", () => {
      this.callbacks.onCompare(row);
    });

    this.container.querySelector("#btn-perf-history")?.addEventListener("click", () => {
      this.callbacks.onHistory(row);
    });

    this.container.querySelector("#btn-perf-open-file")?.addEventListener("click", () => {
      this.callbacks.onOpenSourceFile(row);
    });

    this.container.querySelector("#btn-perf-hide-row")?.addEventListener("click", () => {
      this.callbacks.onHideRow(row);
    });

    this.container.querySelector("#btn-perf-finalize-file")?.addEventListener("click", () => {
      this.callbacks.onFinalizeFile(row.fileId);
    });

    this.container.querySelector("#btn-perf-return-pending")?.addEventListener("click", () => {
      this.callbacks.onReturnToPending(row.fileId);
    });
  }
}
