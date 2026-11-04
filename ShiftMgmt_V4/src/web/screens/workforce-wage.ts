import { openWageRevisionModal } from "./workforce-wage-revision";
// 인력 관리 화면: 시급 등록 모달 (E3), 소급/동일일 사전 확인 모달, 시급 종료 모달 및 R08 대기 실적 영향 안내
import type { EmployeeRecord, WageRateRecord } from "../../shared/domain/model";
import type { EmployeeWageRateInput, EmployeeWageRateSaveResult, WagePendingPerformanceRefresh } from "../../shared/bridge/contracts";
import {
  getSeoulTodayDateString,
  isValidDateString,
  validateWageRateFormInput
} from "./workforce-model";
import { WorkforceDialog } from "./workforce-dialog";

export const createWagePendingRefreshNotice = (summary?: WagePendingPerformanceRefresh): HTMLElement => {
  const box = document.createElement("div");
  box.id = "wage-pending-refresh-result";
  box.className = "workforce-rate-box wf-flex-col wf-gap-8";
  const heading = document.createElement("strong");
  heading.textContent = summary
    ? `대기 실적 다시 읽기 ${summary.status === "completed" ? "완료" : "일부 미완료"}: ${summary.refreshedFileCount}/${summary.targetFileCount}개 파일 · 대상 ${summary.affectedEntryCount}건`
    : "대기 실적 자동 반영 결과를 확인하지 못했습니다. 실적 관리에서 다시 읽어 주세요.";
  box.appendChild(heading);
  for (const issue of summary?.issues ?? []) {
    const message = document.createElement("div");
    message.className = "wf-text-sm wf-text-danger";
    message.textContent = `${issue.fileName}: ${issue.message}`;
    box.appendChild(message);
  }
  const hint = document.createElement("div");
  hint.className = "wf-text-xs wf-text-muted";
  hint.textContent = "시급 저장은 완료되었습니다. 승인된 수당은 유지됩니다. 미완료 파일은 실적 관리에서 원본을 확인하고 다시 읽어 주세요.";
  box.appendChild(hint);
  return box;
};

export interface WorkforceWageOptions {
  dialog: WorkforceDialog;
  onSaveWageRate: (input: EmployeeWageRateInput) => Promise<{ ok: boolean; record?: EmployeeWageRateSaveResult; message?: string }>;
  onCloseWageRate?: (input: { employeeId: string; wageRateId: string; effectiveTo: string }) => Promise<{ ok: boolean; message?: string }>;
  onFetchPendingImpact: (employeeCode: string, effectiveFrom: string, effectiveTo?: string) => Promise<{ ok: boolean; count?: number; message?: string }>;
  onNavigatePerformance: () => void;
  onSuccess: () => void;
}

export class WorkforceWage {
  private dialog: WorkforceDialog;
  private onSaveWageRate: (input: EmployeeWageRateInput) => Promise<{ ok: boolean; record?: EmployeeWageRateSaveResult; message?: string }>;
  private onCloseWageRate?: (input: { employeeId: string; wageRateId: string; effectiveTo: string }) => Promise<{ ok: boolean; message?: string }>;
  private onFetchPendingImpact: (employeeCode: string, effectiveFrom: string, effectiveTo?: string) => Promise<{ ok: boolean; count?: number; message?: string }>;
  private onNavigatePerformance: () => void;
  private onSuccess: () => void;
  private todayStr: string;

  constructor(options: WorkforceWageOptions) {
    this.dialog = options.dialog;
    this.onSaveWageRate = options.onSaveWageRate;
    this.onCloseWageRate = options.onCloseWageRate;
    this.onFetchPendingImpact = options.onFetchPendingImpact;
    this.onNavigatePerformance = options.onNavigatePerformance;
    this.onSuccess = options.onSuccess;
    this.todayStr = getSeoulTodayDateString();
  }

  public openRevisionModal(employee: EmployeeRecord, rate: WageRateRecord): void {
    openWageRevisionModal({ dialog: this.dialog, save: this.onSaveWageRate, refreshNotice: createWagePendingRefreshNotice, onSuccess: this.onSuccess }, employee, rate);
  }

  /** E3 시급 등록 모달 열기 */
  public openWageModal(
    emp: EmployeeRecord,
    existingRates: WageRateRecord[],
    triggerBtn?: HTMLElement | null
  ): void {
    existingRates = existingRates.filter(r => !r.invalidation);
    const container = document.createElement("div");
    container.className = "workforce-form-container wf-flex-col wf-gap-14";

    container.innerHTML = `
      <!-- 소급 경고 배너 -->
      <div class="workforce-warning-banner wf-hidden" id="banner-retroactive-warn">
        <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">warning</span>
        <div><strong>소급 적용 안내:</strong> 오늘 이전 날짜로 시급을 등록합니다. 과거 근무 실적의 재계산 여부를 확인해 주세요.</div>
      </div>

      <!-- 동일일 덮어쓰기 경고 배너 -->
      <div class="workforce-warning-banner wf-hidden" id="banner-overwrite-warn">
        <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">warning</span>
        <div><strong>같은 적용일 정정 안내:</strong> 같은 시작일의 기존 시급이 존재합니다. 이전 금액과 사유는 정정 이력에 보관하고 새 값으로 갱신합니다.</div>
      </div>

      <div class="workforce-form-error wf-hidden" id="e3-global-error"></div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-e3-rate">시급 금액 (원)</label>
        <input type="number" class="workforce-input" id="modal-e3-rate" placeholder="예: 12000" min="1" step="100" />
        <div class="workforce-form-error wf-hidden" id="err-e3-rate"></div>
      </div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-e3-from">적용 시작일</label>
        <input type="date" class="workforce-input" id="modal-e3-from" value="" />
        <div class="workforce-form-hint">기본값은 공백이며, 적용을 시작할 정확한 날짜를 선택해 주세요.</div>
        <div class="workforce-form-error wf-hidden" id="err-e3-from"></div>
      </div>

      <div class="workforce-form-group">
        <label class="workforce-form-label" for="modal-e3-reason">변경 사유</label>
        <input type="text" class="workforce-input" id="modal-e3-reason" placeholder="예: 2026년 정기 인상, 직급 변동 등" />
      </div>
    `;

    const retroWarn = container.querySelector<HTMLElement>("#banner-retroactive-warn")!;
    const overwriteWarn = container.querySelector<HTMLElement>("#banner-overwrite-warn")!;
    const fromInput = container.querySelector<HTMLInputElement>("#modal-e3-from")!;

    // 날짜 입력 변화에 따른 사전 경고 토글
    const updateWarnings = () => {
      const fromVal = fromInput.value.trim();
      if (!fromVal) {
        retroWarn.classList.add("wf-hidden");
        overwriteWarn.classList.add("wf-hidden");
        return;
      }
      if (fromVal < this.todayStr) {
        retroWarn.classList.remove("wf-hidden");
      } else {
        retroWarn.classList.add("wf-hidden");
      }

      const hasSame = existingRates.some((r) => r.effectiveFrom === fromVal);
      if (hasSame) {
        overwriteWarn.classList.remove("wf-hidden");
      } else {
        overwriteWarn.classList.add("wf-hidden");
      }
    };

    fromInput.addEventListener("input", updateWarnings);
    fromInput.addEventListener("change", updateWarnings);

    this.dialog.open({
      id: "modal-e3",
      title: `시급 등록 (${emp.name})`,
      width: "480px",
      content: container,
      initialFocusSelector: "#modal-e3-rate",
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-cancel-e3",
          label: "취소",
          variant: "secondary",
          onClick: () => this.dialog.close()
        },
        {
          id: "btn-submit-e3",
          label: "시급 등록",
          variant: "primary",
          onClick: async () => {
            await this.handleSubmitWage(container, emp, existingRates, triggerBtn);
          }
        }
      ]
    });
  }

  private async handleSubmitWage(
    container: HTMLElement,
    emp: EmployeeRecord,
    existingRates: WageRateRecord[],
    triggerBtn?: HTMLElement | null
  ): Promise<void> {
    const rateInput = container.querySelector<HTMLInputElement>("#modal-e3-rate")!;
    const fromInput = container.querySelector<HTMLInputElement>("#modal-e3-from")!;
    const reasonInput = container.querySelector<HTMLInputElement>("#modal-e3-reason")!;
    const globalErr = container.querySelector<HTMLElement>("#e3-global-error")!;

    container.querySelectorAll(".workforce-form-error").forEach((el) => {
      el.textContent = "";
      el.classList.add("wf-hidden");
    });

    const rateNum = parseInt(rateInput.value.trim(), 10);
    const fromVal = fromInput.value.trim();

    const val = validateWageRateFormInput(
      {
        hourlyRate: rateNum,
        effectiveFrom: fromVal,
        reason: reasonInput.value.trim()
      },
      this.todayStr,
      existingRates
    );

    if (!val.valid) {
      if (isNaN(rateNum) || rateNum <= 0) {
        const el = container.querySelector<HTMLElement>("#err-e3-rate")!;
        el.textContent = "0원보다 큰 유효한 시급을 입력해 주세요.";
        el.classList.remove("wf-hidden");
      }
      if (!fromVal || !isValidDateString(fromVal)) {
        const el = container.querySelector<HTMLElement>("#err-e3-from")!;
        el.textContent = "올바른 적용 시작일을 입력해 주세요.";
        el.classList.remove("wf-hidden");
      }
      return;
    }

    const payload: EmployeeWageRateInput = {
      employeeId: emp.id,
      hourlyRate: rateNum,
      effectiveFrom: fromVal,
      reason: reasonInput.value.trim() || undefined
    };

    const isRetroactive = fromVal < this.todayStr;
    const isOverwrite = existingRates.some((r) => r.effectiveFrom === fromVal);

    // UI01-D03: 소급 적용 또는 동일일 덮어쓰기 시 사전 명시 확인 다이얼로그 단계 (요청 0 / 취소 시 0요청 / 확인 시 1요청)
    if (isRetroactive || isOverwrite) {
      this.openWageConfirmModal(emp, payload, isRetroactive, isOverwrite, existingRates, triggerBtn);
      return;
    }

    await this.executeSaveWage(emp, payload, globalErr);
  }

  /** UI01-D03: 소급 또는 동일일 덮어쓰기 명시 확인 다이얼로그 (N04 취소 시 0요청, 확인 시 1요청) */
  private openWageConfirmModal(
    emp: EmployeeRecord,
    payload: EmployeeWageRateInput,
    isRetroactive: boolean,
    isOverwrite: boolean,
    existingRates: WageRateRecord[],
    triggerBtn?: HTMLElement | null
  ): void {
    const box = document.createElement("div");
    box.className = "wf-flex-col wf-gap-14";

    const banner = document.createElement("div");
    banner.className = "workforce-warning-banner";

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined wf-icon-18";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "warning";

    const textDiv = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = isOverwrite ? "같은 적용일 시급 정정: " : "소급 시급 등록 주의: ";
    textDiv.appendChild(strong);

    let desc = "";
    if (isOverwrite) {
      desc = `적용 시작일(${payload.effectiveFrom})이 같은 기존 시급이 존재합니다. 이전 금액·사유와 변경자·변경 시각을 정정 이력에 보관하고 새 값으로 갱신합니다. 기존 승인 결과는 변경되지 않습니다.`;
    } else {
      desc = `오늘 이전 날짜(${payload.effectiveFrom})로 시급을 등록합니다. 과거 대기 실적 재계산 여부를 확인해 주세요.`;
    }
    textDiv.appendChild(document.createTextNode(desc));

    banner.appendChild(icon);
    banner.appendChild(textDiv);
    box.appendChild(banner);

    const info = document.createElement("div");
    info.className = "wf-text-md";
    info.textContent = `시급 ${payload.hourlyRate.toLocaleString("ko-KR")}원을 등록하시겠습니까?`;
    box.appendChild(info);

    const errEl = document.createElement("div");
    errEl.className = "workforce-form-error wf-hidden";
    errEl.id = "wage-confirm-error";
    box.appendChild(errEl);

    this.dialog.open({
      id: "modal-wage-confirm",
      title: isOverwrite ? "동일일 시급 덮어쓰기 확인" : "소급 시급 등록 확인",
      width: "460px",
      content: box,
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-cancel-wage-confirm",
          label: "취소",
          variant: "secondary",
          onClick: () => {
            // 취소 시 요청 0건, 원래 시급 모달 복귀
            this.openWageModal(emp, existingRates, triggerBtn);
          }
        },
        {
          id: "btn-confirm-wage-save",
          label: "확인하고 등록",
          variant: "primary",
          onClick: async () => {
            await this.executeSaveWage(emp, payload, errEl);
          }
        }
      ]
    });
  }

  private async executeSaveWage(
    emp: EmployeeRecord,
    payload: EmployeeWageRateInput,
    errBanner?: HTMLElement
  ): Promise<void> {
    const dialogToken = this.dialog.captureToken();
    this.dialog.setProcessing(true, "시급 저장·대기 실적 다시 읽는 중...", dialogToken);
    try {
      const res = await this.onSaveWageRate(payload);
            if (!this.dialog.isCurrent(dialogToken)) return;
      if (res.ok && res.record) {
        this.dialog.close();
        this.onSuccess();
        // R08 대기 실적 영향 건수 안내 모달 오픈
        this.openImpactModal(emp, res.record);
      } else {
        if (errBanner) {
          errBanner.textContent = res.message || "시급 등록에 실패했습니다.";
          errBanner.classList.remove("wf-hidden");
        }
      }
    } catch (err) {
      if (errBanner) {
        errBanner.textContent = err instanceof Error ? err.message : "시급 등록 중 오류가 발생했습니다.";
        errBanner.classList.remove("wf-hidden");
      }
    } finally {
      this.dialog.setProcessing(false, undefined, dialogToken);
    }
  }

  /** UI01-D03: 기존 시급 종료 계약 모달 (closeEmployeeWageRate) */
  public openCloseWageModal(
    emp: EmployeeRecord,
    record: WageRateRecord,
    triggerBtn?: HTMLElement | null
  ): void {
    const box = document.createElement("div");
    box.className = "workforce-form-container wf-flex-col wf-gap-14";

    box.innerHTML = `
      <div class="workforce-info-banner">
        <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">info</span>
        <div>
          시급 <strong>${record.hourlyRate.toLocaleString("ko-KR")}원</strong> (${record.effectiveFrom}~)의 적용을 끝내는 마지막 날짜를 지정합니다.
        </div>
      </div>

      <div class="workforce-action-guide">
        <strong>어떤 경우에 사용하나요?</strong>
        <p>퇴사하거나 해당 업무가 끝나 이 시급을 더 이상 적용하지 않을 때 사용합니다. 선택한 날짜까지는 이 시급이 적용됩니다.</p>
        <strong>금액 변경·갱신이 목적이라면</strong>
        <p>이 창을 닫고 <b>시급 등록</b>에서 새 금액과 적용 시작일을 입력하세요. 기존 시급을 먼저 종료할 필요 없이 적용 기간이 자동으로 정리됩니다. 시작일이 기존과 같으면 이전 금액과 사유를 정정 이력에 보관한 뒤 새 값으로 갱신합니다.</p>
        <strong>퇴사·업무 배정도 함께 정리하려면</strong>
        <p>이 버튼은 선택한 시급의 적용 기간만 끝냅니다. 퇴사는 <b>기본정보 수정 → 재직 상태 ‘퇴사’ → 퇴사일</b>에서, 업무·근무지 배정 해제는 <b>근무지 및 조 배정 → 배정 해제</b>에서 각각 처리해 주세요.</p>
        <p>기존에 승인된 수당은 변경되지 않습니다. 이미 가져온 대기 실적에 시급 변경을 반영하려면 실적 관리에서 해당 파일을 다시 읽어야 합니다.</p>
      </div>

      <div class="workforce-form-error wf-hidden" id="close-wage-global-error"></div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-close-wage-to">종료일</label>
        <input type="date" class="workforce-input" id="modal-close-wage-to" value="${this.todayStr}" min="${record.effectiveFrom}" />
        <div class="workforce-form-hint">시급의 유효 종료일을 선택해 주세요 (시작일 ${record.effectiveFrom} 이후).</div>
        <div class="workforce-form-error wf-hidden" id="err-close-wage-to"></div>
      </div>
    `;

    const toInput = box.querySelector<HTMLInputElement>("#modal-close-wage-to")!;
    const toErr = box.querySelector<HTMLElement>("#err-close-wage-to")!;
    const globalErr = box.querySelector<HTMLElement>("#close-wage-global-error")!;

    this.dialog.open({
      id: "modal-wage-close",
      title: `시급 적용 종료 (${emp.name})`,
      width: "640px",
      content: box,
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-cancel-close-wage",
          label: "취소",
          variant: "secondary",
          onClick: () => this.dialog.close()
        },
        {
          id: "btn-submit-close-wage",
          label: "이 날짜까지 시급 적용",
          variant: "primary",
          onClick: async () => {
            toErr.classList.add("wf-hidden");
            globalErr.classList.add("wf-hidden");

            const toVal = toInput.value.trim();
            if (!toVal || !isValidDateString(toVal)) {
              toErr.textContent = "올바른 종료일을 입력해 주세요.";
              toErr.classList.remove("wf-hidden");
              return;
            }
            if (toVal < record.effectiveFrom) {
              toErr.textContent = `종료일은 시작일(${record.effectiveFrom})보다 이전일 수 없습니다.`;
              toErr.classList.remove("wf-hidden");
              return;
            }

            if (!this.onCloseWageRate) {
              globalErr.textContent = "시급 종료 계약이 연결되지 않았습니다.";
              globalErr.classList.remove("wf-hidden");
              return;
            }

            const dialogToken = this.dialog.captureToken();
            this.dialog.setProcessing(true, "시급 종료 처리 중...", dialogToken);
            try {
              const res = await this.onCloseWageRate({
                employeeId: emp.id,
                wageRateId: record.id,
                effectiveTo: toVal
              });
            if (!this.dialog.isCurrent(dialogToken)) return;
              if (res.ok) {
                this.dialog.close();
                this.onSuccess();
              } else {
                globalErr.textContent = res.message || "시급 종료 처리에 실패했습니다.";
                globalErr.classList.remove("wf-hidden");
              }
            } catch (err) {
              globalErr.textContent = err instanceof Error ? err.message : "시급 종료 중 오류가 발생했습니다.";
              globalErr.classList.remove("wf-hidden");
            } finally {
              this.dialog.setProcessing(false, undefined, dialogToken);
            }
          }
        }
      ]
    });
  }

  /** R08 시급 저장 후 영향 대기 실적 안내 모달 오픈 (UI01-D02 DOM 안전 렌더링) */
  public openImpactModal(emp: EmployeeRecord, record: EmployeeWageRateSaveResult): void {
    const box = document.createElement("div");
    box.className = "wf-flex-col wf-gap-14";

    const banner = document.createElement("div");
    banner.className = "workforce-info-banner";

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined wf-icon-success";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "check_circle";

    const textDiv = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = "시급 등록 완료: ";
    textDiv.appendChild(strong);
    textDiv.appendChild(
      document.createTextNode(
        `'${emp.name}' 인력의 시급이 ${record.hourlyRate.toLocaleString("ko-KR")}원 (${record.effectiveFrom}~)으로 등록되었습니다.`
      )
    );

    banner.appendChild(icon);
    banner.appendChild(textDiv);
    box.appendChild(banner);
    box.appendChild(createWagePendingRefreshNotice(record.pendingPerformanceRefresh));

    // 대기 실적 건수 표시 영역
    const impactResultArea = document.createElement("div");
    impactResultArea.id = "wage-impact-result-area";
    impactResultArea.className = "workforce-rate-box wf-flex-col wf-gap-8";
    box.appendChild(impactResultArea);

    const descDiv = document.createElement("div");
    descDiv.className = "wf-text-sm";
    descDiv.innerHTML = `
      * 적용 기간에 해당하는 미승인 대기 실적 파일을 다시 읽었습니다. 위 결과에서 미완료 파일을 확인해 주세요.<br>
      * [실적 관리로 이동]에서 반영된 시급을 확인한 뒤 승인할 수 있습니다. 승인된 수당은 자동으로 변경하지 않습니다.
    `;
    box.appendChild(descDiv);

    // 건수 비동기 조회 함수 (UI01-D04 / R08)
    let impactToken = 0;
    const loadImpact = async () => {
      if (!this.dialog.isCurrent(impactToken)) return;
      impactResultArea.innerHTML = `<div class="wf-text-md wf-text-muted">대기 실적 영향 건수 조회 중...</div>`;
      try {
        const impact = await this.onFetchPendingImpact(
          emp.employeeCode,
          record.effectiveFrom,
          record.effectiveTo
        );
        if (!this.dialog.isCurrent(impactToken)) return;
        if (impact.ok && impact.count !== undefined) {
          impactResultArea.innerHTML = `
            <div class="wf-flex-between">
              <span class="wf-text-md wf-text-lg">영향받는 대기 실적</span>
              <strong class="wf-text-xl" id="impact-count-label">저장된 대기 실적 ${impact.count}건(반려 포함·저장 자료 기준)</strong>
            </div>
          `;
        } else {
          impactResultArea.innerHTML = `
            <div class="wf-flex-between wf-text-danger">
              <span class="wf-text-md wf-text-lg">영향 건수 확인 실패</span>
              <button type="button" class="workforce-btn workforce-btn-secondary workforce-btn-sm" id="btn-retry-impact">다시 확인</button>
            </div>
            <div class="wf-text-xs wf-text-danger">${this.escape(impact.message || "파일 상태를 읽지 못했습니다.")}</div>
          `;
          box.querySelector<HTMLButtonElement>("#btn-retry-impact")?.addEventListener("click", loadImpact);
        }
      } catch (_err) {
        impactResultArea.innerHTML = `
          <div class="wf-flex-between wf-text-danger">
            <span class="wf-text-md wf-text-lg">영향 건수 확인 실패</span>
            <button type="button" class="workforce-btn workforce-btn-secondary workforce-btn-sm" id="btn-retry-impact">다시 확인</button>
          </div>
          <div class="wf-text-xs wf-text-danger">대기 실적 건수 조회 중 오류가 발생했습니다.</div>
        `;
        box.querySelector<HTMLButtonElement>("#btn-retry-impact")?.addEventListener("click", loadImpact);
      }
    };


    this.dialog.open({
      id: "modal-wage-impact",
      title: "시급 등록 완료 및 실적 반영 안내",
      width: "520px",
      content: box,
      buttons: [
        {
          id: "btn-navigate-performance",
          label: "실적 관리로 이동",
          variant: "primary",
          onClick: () => {
            this.dialog.close();
            this.onNavigatePerformance();
          }
        },
        {
          id: "btn-close-impact",
          label: "닫기",
          variant: "secondary",
          onClick: () => this.dialog.close()
        }
      ]
    });
    impactToken = this.dialog.captureToken();
    void loadImpact();
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
