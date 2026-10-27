// 인력 관리 화면: 시급 엑셀 일괄 업데이트 모달 (E6) 및 확인 모달
import type {
  WorkforceWageBulkUpdateApplyInput,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview,
  WorkforceWageBulkUpdatePreviewInput
} from "../../shared/bridge/contracts";
import { getSeoulTodayDateString, isBulkPreviewStale, isValidDateString } from "./workforce-model";
import { WorkforceDialog } from "./workforce-dialog";

export interface WorkforceBulkOptions {
  dialog: WorkforceDialog;
  isAdmin: boolean;
  canWrite: boolean;
  onSelectFile: () => Promise<{ ok: boolean; filePath?: string; message?: string }>;
  onPreview: (input: WorkforceWageBulkUpdatePreviewInput) => Promise<{ ok: boolean; preview?: WorkforceWageBulkUpdatePreview; message?: string }>;
  onApply: (input: WorkforceWageBulkUpdateApplyInput) => Promise<{ ok: boolean; summary?: WorkforceWageBulkUpdateApplySummary; message?: string }>;
  onSuccess: () => void;
}

export class WorkforceBulk {
  private dialog: WorkforceDialog;
  private isAdmin: boolean;
  private canWrite: boolean;
  private onSelectFile: () => Promise<{ ok: boolean; filePath?: string; message?: string }>;
  private onPreview: (input: WorkforceWageBulkUpdatePreviewInput) => Promise<{ ok: boolean; preview?: WorkforceWageBulkUpdatePreview; message?: string }>;
  private onApply: (input: WorkforceWageBulkUpdateApplyInput) => Promise<{ ok: boolean; summary?: WorkforceWageBulkUpdateApplySummary; message?: string }>;
  private onSuccess: () => void;
  private todayStr: string;

  private latestPreview: WorkforceWageBulkUpdatePreview | null = null;
  private previewSnapshotInput: WorkforceWageBulkUpdatePreviewInput | null = null;
  private previewReqGen = 0;

  constructor(options: WorkforceBulkOptions) {
    this.dialog = options.dialog;
    this.isAdmin = options.isAdmin;
    this.canWrite = options.canWrite;
    this.onSelectFile = options.onSelectFile;
    this.onPreview = options.onPreview;
    this.onApply = options.onApply;
    this.onSuccess = options.onSuccess;
    this.todayStr = getSeoulTodayDateString();
  }

  /** E6 시급 일괄 업데이트 모달 열기 */
  public openBulkModal(triggerBtn?: HTMLElement | null): void {
    this.latestPreview = null;
    this.previewSnapshotInput = null;
    this.previewReqGen++;

    const container = document.createElement("div");
    container.className = "workforce-form-container wf-flex-col wf-gap-14";

    container.innerHTML = `
      <div class="workforce-form-error wf-hidden" id="e6-global-error"></div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-e6-file-path">엑셀 파일 경로 (.xlsx, .xlsm)</label>
        <div class="wf-flex-row">
          <input type="text" class="workforce-input wf-flex-1" id="modal-e6-file-path" placeholder="파일의 전체 절대 경로를 입력하세요" />
          <button type="button" class="workforce-btn workforce-btn-secondary" id="btn-e6-select-file" ${!this.isAdmin ? "disabled title='파일 찾기 대화상자는 관리자만 열 수 있습니다. 기획자는 경로를 직접 입력하세요.'" : ""}>
            <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">folder_open</span>
            <span>찾아보기</span>
          </button>
        </div>
        <div class="workforce-form-hint">로컬 컴퓨터에 있는 엑셀 파일 경로를 입력하거나 찾아보기로 선택합니다.</div>
      </div>

      <div class="wf-grid-4">
        <div class="workforce-form-group">
          <label class="workforce-form-label workforce-form-label-required" for="modal-e6-effective-from">적용 날짜</label>
          <input type="date" class="workforce-input" id="modal-e6-effective-from" value="${this.todayStr}" />
        </div>

        <div class="workforce-form-group">
          <label class="workforce-form-label workforce-form-label-required" for="modal-e6-col-site">근무지 열</label>
          <input type="text" class="workforce-input wf-uppercase" id="modal-e6-col-site" value="A" maxlength="3" />
        </div>

        <div class="workforce-form-group">
          <label class="workforce-form-label workforce-form-label-required" for="modal-e6-col-name">이름 열</label>
          <input type="text" class="workforce-input wf-uppercase" id="modal-e6-col-name" value="B" maxlength="3" />
        </div>

        <div class="workforce-form-group">
          <label class="workforce-form-label workforce-form-label-required" for="modal-e6-col-rate">시급 열</label>
          <input type="text" class="workforce-input wf-uppercase" id="modal-e6-col-rate" value="C" maxlength="3" />
        </div>
      </div>

      <div class="wf-flex-between wf-mt-4">
        <button type="button" class="workforce-btn workforce-btn-secondary" id="btn-e6-preview">
          <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">visibility</span>
          <span>미리보기 실행</span>
        </button>
        <div id="e6-preview-summary" class="wf-preview-summary"></div>
      </div>

      <!-- 미리보기 결과 테이블 영역 -->
      <div class="workforce-preview-table-container wf-hidden" id="e6-preview-container">
        <table class="workforce-table" id="table-e6-preview">
          <thead>
            <tr>
              <th scope="col">행</th>
              <th scope="col">근무지</th>
              <th scope="col">이름</th>
              <th scope="col">현재 시급</th>
              <th scope="col">가져온 시급</th>
              <th scope="col">상태</th>
              <th scope="col">사유/안내</th>
            </tr>
          </thead>
          <tbody id="e6-preview-tbody"></tbody>
        </table>
      </div>

      <div class="workforce-form-hint wf-hidden wf-text-warning" id="e6-submit-desc">
        * 조건(파일/날짜/열)이 변경되었습니다. 미리보기를 다시 실행해야 적용할 수 있습니다.
      </div>
    `;

    const errBanner = container.querySelector<HTMLElement>("#e6-global-error")!;
    const pathInput = container.querySelector<HTMLInputElement>("#modal-e6-file-path")!;
    const fileBtn = container.querySelector<HTMLButtonElement>("#btn-e6-select-file")!;
    const fromInput = container.querySelector<HTMLInputElement>("#modal-e6-effective-from")!;
    const colSite = container.querySelector<HTMLInputElement>("#modal-e6-col-site")!;
    const colName = container.querySelector<HTMLInputElement>("#modal-e6-col-name")!;
    const colRate = container.querySelector<HTMLInputElement>("#modal-e6-col-rate")!;
    const previewBtn = container.querySelector<HTMLButtonElement>("#btn-e6-preview")!;
    const previewContainer = container.querySelector<HTMLElement>("#e6-preview-container")!;
    const previewTbody = container.querySelector<HTMLElement>("#e6-preview-tbody")!;
    const summaryEl = container.querySelector<HTMLElement>("#e6-preview-summary")!;
    const staleDesc = container.querySelector<HTMLElement>("#e6-submit-desc")!;

    // 찾아보기 버튼 클릭 (Admin 전용)
    if (this.isAdmin) {
      fileBtn.addEventListener("click", async () => {
        try {
          const token = this.dialog.captureToken();
          const res = await this.onSelectFile();
          if (!this.dialog.isCurrent(token)) return;
          if (res.ok && res.filePath) {
            pathInput.value = res.filePath;
            onConditionChange();
          }
        } catch (err) {
          errBanner.textContent = err instanceof Error ? err.message : "파일 선택 중 오류가 발생했습니다.";
          errBanner.classList.remove("wf-hidden");
        }
      });
    }

    const getCurrentInput = (): WorkforceWageBulkUpdatePreviewInput => ({
      filePath: pathInput.value.trim(),
      effectiveFrom: fromInput.value.trim(),
      mapping: {
        siteNameColumn: colSite.value.trim().toUpperCase(),
        employeeNameColumn: colName.value.trim().toUpperCase(),
        hourlyRateColumn: colRate.value.trim().toUpperCase()
      }
    });

    // UI01-D05: 조건 변경 시 이전 preview 즉시 무효화 및 적용 잠금 (N07)
    const onConditionChange = () => {
      this.previewReqGen++;
      this.latestPreview = null;
      this.previewSnapshotInput = null;
      const submitBtn = document.querySelector<HTMLButtonElement>("#btn-submit-e6");
      if (submitBtn) submitBtn.disabled = true;

      staleDesc.classList.remove("wf-hidden");
      summaryEl.textContent = "";
      previewContainer.classList.add("wf-hidden");
      previewTbody.innerHTML = "";
    };

    [pathInput, fromInput, colSite, colName, colRate].forEach((input) => {
      input.addEventListener("input", onConditionChange);
      input.addEventListener("change", onConditionChange);
    });

    // 미리보기 버튼 클릭 (UI01-D05: operator/reviewer도 읽기 preview 가능)
    previewBtn.addEventListener("click", async () => {
      errBanner.classList.add("wf-hidden");
      const input = getCurrentInput();

      if (!input.filePath) {
        errBanner.textContent = "엑셀 파일 경로를 입력해 주세요.";
        errBanner.classList.remove("wf-hidden");
        return;
      }
      if (!input.effectiveFrom || !isValidDateString(input.effectiveFrom)) {
        errBanner.textContent = "올바른 적용 날짜를 입력해 주세요.";
        errBanner.classList.remove("wf-hidden");
        return;
      }
      if (!input.mapping.siteNameColumn || !input.mapping.employeeNameColumn || !input.mapping.hourlyRateColumn) {
        errBanner.textContent = "모든 열 문자를 입력해 주세요.";
        errBanner.classList.remove("wf-hidden");
        return;
      }

      const currentGen = ++this.previewReqGen;
      const dialogToken = this.dialog.captureToken();
      this.dialog.setProcessing(true, "엑셀 시급 미리보기 분석 중...", dialogToken);

      try {
        const res = await this.onPreview(input);
            if (!this.dialog.isCurrent(dialogToken)) return;
        if (currentGen !== this.previewReqGen || isBulkPreviewStale(getCurrentInput(), input)) return;

        if (res.ok && res.preview) {
          this.latestPreview = res.preview;
          this.previewSnapshotInput = structuredClone(input);
          staleDesc.classList.add("wf-hidden");

          // 요약 렌더링
          summaryEl.textContent = `총 ${res.preview.totalRows}행 (적용 가능: ${res.preview.readyCount}행, 제외: ${res.preview.skippedCount}행)`;

          // 테이블 행 렌더링
          previewTbody.innerHTML = "";
          for (const row of res.preview.rows) {
            const tr = document.createElement("tr");
            const isReady = row.status === "ready";
            const statusClass = isReady
              ? "workforce-row-status-ready"
              : row.status === "same-rate" || row.status === "duplicate-entry"
                ? "workforce-row-status-skip"
                : "workforce-row-status-error";

            const currentRateText =
              row.currentHourlyRate !== undefined ? `${row.currentHourlyRate.toLocaleString("ko-KR")}원` : "-";
            const importedRateText =
              row.importedHourlyRate !== undefined ? `${row.importedHourlyRate.toLocaleString("ko-KR")}원` : "-";

            tr.innerHTML = `
              <td>${row.rowNumber}</td>
              <td>${this.escape(row.siteName || "-")}</td>
              <td><strong>${this.escape(row.employeeName || "-")}</strong></td>
              <td>${currentRateText}</td>
              <td><strong>${importedRateText}</strong></td>
              <td><span class="${statusClass}">${this.escape(row.statusLabel || row.status)}</span></td>
              <td class="wf-text-sm">${this.escape(row.note || "-")}</td>
            `;
            previewTbody.appendChild(tr);
          }

          previewContainer.classList.remove("wf-hidden");

          // UI01-D05: 권한 대조 (canWrite가 없는 operator/reviewer는 apply 버튼 항상 비활성화)
          const submitBtn = document.querySelector<HTMLButtonElement>("#btn-submit-e6");
          if (submitBtn) {
            if (!this.canWrite) {
              submitBtn.disabled = true;
              submitBtn.title = "수정 권한이 없습니다 (읽기 전용).";
            } else {
              submitBtn.disabled = res.preview.readyCount === 0;
            }
          }
        } else {
          // 실패 시 이전 preview 완전 폐기
          this.latestPreview = null;
          this.previewSnapshotInput = null;
          errBanner.textContent = res.message || "미리보기 조회에 실패했습니다.";
          errBanner.classList.remove("wf-hidden");
          previewContainer.classList.add("wf-hidden");
          summaryEl.textContent = "";

          const submitBtn = document.querySelector<HTMLButtonElement>("#btn-submit-e6");
          if (submitBtn) submitBtn.disabled = true;
        }
      } catch (err) {
        if (currentGen !== this.previewReqGen) return;
        this.latestPreview = null;
        this.previewSnapshotInput = null;
        errBanner.textContent = err instanceof Error ? err.message : "미리보기 중 오류가 발생했습니다.";
        errBanner.classList.remove("wf-hidden");
        previewContainer.classList.add("wf-hidden");
        summaryEl.textContent = "";

        const submitBtn = document.querySelector<HTMLButtonElement>("#btn-submit-e6");
        if (submitBtn) submitBtn.disabled = true;
      } finally {
        this.dialog.setProcessing(false, undefined, dialogToken);
        // setProcessing(false) 버튼 복원 후 최신 미리보기 및 권한에 따라 적용 버튼 최종 확정 (UI01-D05)
        const submitBtn = document.querySelector<HTMLButtonElement>("#btn-submit-e6");
        if (submitBtn) {
          submitBtn.disabled = !this.canWrite || !this.latestPreview || this.latestPreview.readyCount === 0;
        }
      }
    });

    this.dialog.open({
      id: "modal-e6",
      title: "시급 일괄 업데이트 (엑셀)",
      width: "860px",
      content: container,
      initialFocusSelector: "#modal-e6-file-path",
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-cancel-e6",
          label: "취소",
          variant: "secondary",
          onClick: () => this.dialog.close()
        },
        {
          id: "btn-submit-e6",
          label: "시급 일괄 적용",
          variant: "primary",
          disabled: true,
          onClick: () => {
            if (!this.canWrite) return;
            if (!this.latestPreview || this.latestPreview.readyCount === 0) return;
            const currentInput = getCurrentInput();
            if (isBulkPreviewStale(currentInput, this.previewSnapshotInput)) {
              staleDesc.classList.remove("wf-hidden");
              return;
            }
            // 최종 확인 모달 오픈 (N08)
            this.openConfirmModal(currentInput, this.latestPreview);
          }
        }
      ]
    });
  }

  /** E6 적용 전 최종 확인 모달 (되돌릴 수 없음 안내) */
  private openConfirmModal(
    input: WorkforceWageBulkUpdatePreviewInput,
    preview: WorkforceWageBulkUpdatePreview
  ): void {
    const box = document.createElement("div");
    box.className = "wf-flex-col wf-gap-14";

    box.innerHTML = `
      <div class="workforce-warning-banner">
        <span class="material-symbols-outlined wf-icon-warn" aria-hidden="true">warning</span>
        <div>
          <strong>주의: 이 작업은 되돌릴 수 없습니다.</strong><br>
          적용 일자: <strong>${input.effectiveFrom}</strong><br>
          총 ${preview.totalRows}건 중 <strong>${preview.readyCount}명</strong>의 시급이 즉시 업데이트됩니다.<br>
          (제외 ${preview.skippedCount}건은 적용되지 않습니다)
        </div>
      </div>
      <div class="wf-text-md">
        시급 일괄 적용을 진행하시겠습니까?
      </div>
      <div class="workforce-form-error wf-hidden" id="e6-confirm-error"></div>
    `;

    const errEl = box.querySelector<HTMLElement>("#e6-confirm-error")!;

    this.dialog.open({
      id: "modal-e6-confirm",
      title: "시급 일괄 적용 확인",
      width: "460px",
      content: box,
      buttons: [
        {
          id: "btn-cancel-e6-confirm",
          label: "취소",
          variant: "secondary",
          onClick: () => {
            this.dialog.close();
          }
        },
        {
          id: "btn-confirm-e6-apply",
          label: "확인 적용",
          variant: "primary",
          onClick: async () => {
            const dialogToken = this.dialog.captureToken();
            this.dialog.setProcessing(true, "시급 일괄 적용 실행 중...", dialogToken);
            try {
              const res = await this.onApply(input);
            if (!this.dialog.isCurrent(dialogToken)) return;
              if (res.ok && res.summary) {
                this.dialog.close();
                this.onSuccess();
                // 완료 안내
                this.openSummaryModal(res.summary);
              } else {
                errEl.textContent = res.message || "시급 일괄 적용에 실패했습니다.";
                errEl.classList.remove("wf-hidden");
              }
            } catch (err) {
              errEl.textContent = err instanceof Error ? err.message : "시급 일괄 적용 중 오류가 발생했습니다.";
              errEl.classList.remove("wf-hidden");
            } finally {
              this.dialog.setProcessing(false, undefined, dialogToken);
            }
          }
        }
      ]
    });
  }

  /** 적용 완료 요약 모달 */
  private openSummaryModal(summary: WorkforceWageBulkUpdateApplySummary): void {
    const box = document.createElement("div");
    box.className = "wf-flex-col wf-gap-14";

    box.innerHTML = `
      <div class="workforce-info-banner">
        <span class="material-symbols-outlined wf-icon-success" aria-hidden="true">check_circle</span>
        <div>
          <strong>시급 일괄 적용 완료:</strong> 총 ${summary.totalRows}행 중 <strong>${summary.appliedCount}건</strong>이 성공적으로 적용되었습니다.<br>
          (제외: ${summary.skippedCount}건)
        </div>
      </div>
      <div class="wf-text-sm">
        * 변경된 시급에 따라 기존 대기 실적의 재계산이 필요한 경우, 실적 관리 화면에서 대기 실적 파일을 다시 읽어주세요.
      </div>
    `;

    this.dialog.open({
      id: "modal-e6-summary",
      title: "시급 일괄 업데이트 완료",
      width: "480px",
      content: box,
      buttons: [
        {
          id: "btn-close-e6-summary",
          label: "확인",
          variant: "primary",
          onClick: () => this.dialog.close()
        }
      ]
    });
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
