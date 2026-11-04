import type { EmployeeRecord, WageRateRecord } from "../../shared/domain/model";
import type { EmployeeWageRateInput, EmployeeWageRateSaveResult, WagePendingPerformanceRefresh } from "../../shared/bridge/contracts";
import type { WorkforceDialog } from "./workforce-dialog";

interface Options {
  dialog: WorkforceDialog;
  save: (input: EmployeeWageRateInput) => Promise<{ ok: boolean; record?: EmployeeWageRateSaveResult; message?: string }>;
  refreshNotice: (summary?: WagePendingPerformanceRefresh) => HTMLElement;
  onSuccess: () => void;
}

export const openWageRevisionModal = (options: Options, employee: EmployeeRecord, rate: WageRateRecord): void => {
  const { dialog } = options;
  let operation: "correct" | "invalidate" = "correct", amount = String(rate.hourlyRate), reason = "";
  const period = `${rate.effectiveFrom} ~ ${rate.effectiveTo ?? "계속"}`;
  const form = () => {
    const box = document.createElement("div"); box.className = "workforce-form-container wf-flex-col wf-gap-14";
    box.innerHTML = `
      <div id="wage-revision-original" class="workforce-rate-box"></div>
      <div class="workforce-form-group"><label for="wage-revision-operation" class="workforce-form-label">처리 구분</label>
        <select id="wage-revision-operation" class="workforce-input"><option value="correct">금액 정정</option><option value="invalidate">이력 무효 처리</option></select></div>
      <div class="workforce-form-group"><label for="wage-revision-amount" class="workforce-form-label">정정 시급 (원)</label><input id="wage-revision-amount" class="workforce-input" type="number" min="1" step="1" /></div>
      <div class="workforce-form-group"><label for="wage-revision-reason" class="workforce-form-label workforce-form-label-required">변경 사유</label><textarea id="wage-revision-reason" class="workforce-input" maxlength="500" rows="3"></textarea></div>
      <div class="workforce-warning-banner" id="wage-revision-warning"></div>
      <div class="wf-text-sm wf-text-muted">승인된 수당은 보존합니다. 적용일을 잘못 등록했다면 해당 이력을 무효 처리한 뒤 올바른 시작일로 시급을 등록하세요.</div>
      <div id="wage-revision-error" class="workforce-form-error" role="alert"></div>`;
    box.querySelector("#wage-revision-original")!.textContent = `${employee.name} (${employee.employeeCode}) · ${period} · ${rate.hourlyRate.toLocaleString("ko-KR")}원`;
    const choice = box.querySelector<HTMLSelectElement>("#wage-revision-operation")!;
    const rateInput = box.querySelector<HTMLInputElement>("#wage-revision-amount")!;
    const reasonInput = box.querySelector<HTMLTextAreaElement>("#wage-revision-reason")!;
    const error = box.querySelector<HTMLElement>("#wage-revision-error")!;
    choice.value = operation; rateInput.value = amount; reasonInput.value = reason;
    const update = () => {
      operation = choice.value === "invalidate" ? "invalidate" : "correct";
      rateInput.disabled = operation === "invalidate";
      box.querySelector("#wage-revision-warning")!.textContent = operation === "invalidate"
        ? "원본과 무효 사유는 이력에 남습니다. 이 기간은 시급 미등록으로 처리하며, 새 시급 등록 전까지 대기 실적 승인을 차단합니다. 이전 시급은 자동 연장하지 않습니다."
        : "적용 기간은 유지하고 금액만 정정합니다. 이전 금액과 사유는 정정 이력에 보관합니다.";
    };
    choice.addEventListener("change", update); update();
    dialog.open({ id: "modal-wage-revision", title: "시급 이력 정정·무효 처리", width: "520px", content: box,
      initialFocusSelector: "#wage-revision-operation", buttons: [
        { id: "btn-cancel-wage-revision", label: "취소", variant: "secondary", onClick: () => dialog.close() },
        { id: "btn-review-wage-revision", label: "다음", variant: "primary", onClick: () => {
          amount = rateInput.value; reason = reasonInput.value.trim(); const value = Number(amount);
          if (!reason || reason.length > 500) { error.textContent = "변경 사유를 1~500자로 입력해 주세요."; reasonInput.focus(); return; }
          if (operation === "correct" && (!Number.isSafeInteger(value) || value <= 0 || value === rate.hourlyRate)) { error.textContent = "현재 금액과 다른 양의 정수 시급을 입력해 주세요."; rateInput.focus(); return; }
          confirm(value);
        } }
      ] });
  };
  const confirm = (value: number) => {
    const box = document.createElement("div"); box.className = "wf-flex-col wf-gap-14";
    const summary = document.createElement("p");
    summary.textContent = `${employee.name} · ${period} · ${rate.hourlyRate.toLocaleString("ko-KR")}원 → ${operation === "invalidate" ? "무효 (시급 미등록)" : value.toLocaleString("ko-KR") + "원"}`;
    const why = document.createElement("p"); why.textContent = `변경 사유: ${reason}`;
    const warning = document.createElement("p"); warning.className = "workforce-warning-banner";
    warning.textContent = operation === "invalidate" ? "기존 시급으로 자동 복귀하지 않습니다. 새 시급을 등록하기 전까지 이 기간의 대기 실적 승인을 차단합니다. 원본 이력과 승인된 수당은 보존합니다." : "적용 기간과 승인된 수당은 유지하며, 이전 금액을 이력에 보관합니다.";
    const error = document.createElement("div"); error.id = "wage-revision-error"; error.className = "workforce-form-error"; error.setAttribute("role", "alert");
    box.append(summary, why, warning, error);
    dialog.open({ id: "modal-wage-revision-confirm", title: operation === "invalidate" ? "시급 무효 처리 확인" : "시급 금액 정정 확인", width: "520px", content: box,
      initialFocusSelector: "#btn-confirm-wage-revision", buttons: [
        { id: "btn-back-wage-revision", label: "이전", variant: "secondary", onClick: form },
        { id: "btn-confirm-wage-revision", label: "확인 후 처리", variant: "primary", onClick: async () => {
          const token = dialog.captureToken(); dialog.setProcessing(true, "시급 이력을 처리하고 있습니다.", token);
          try {
            const result = await options.save({ employeeId: employee.id, effectiveFrom: rate.effectiveFrom, hourlyRate: operation === "invalidate" ? rate.hourlyRate : value,
              revision: { operation, wageRateId: rate.id, expectedRevision: rate.revisionToken ?? "", changeReason: reason } });
            if (!dialog.isCurrent(token)) return;
            if (!result.ok) { error.textContent = result.message || "처리에 실패했습니다. 다시 조회해 주세요."; return; }
            dialog.setProcessing(false, undefined, token);
            const done = document.createElement("div"); done.className = "wf-flex-col wf-gap-14";
            const text = document.createElement("p"); text.textContent = operation === "invalidate" ? "이력을 무효 처리했습니다. 해당 기간은 시급 미등록이며 원본과 무효 사유는 보존했습니다." : "금액을 정정하고 이전 금액과 사유를 보존했습니다.";
            done.append(text, options.refreshNotice(result.record?.pendingPerformanceRefresh));
            dialog.open({ id: "modal-wage-revision-result", title: operation === "invalidate" ? "시급 무효 처리 완료" : "시급 금액 정정 완료", width: "520px", content: done,
              initialFocusSelector: "#btn-close-wage-revision-result", buttons: [{ id: "btn-close-wage-revision-result", label: "확인", variant: "primary", onClick: () => dialog.close() }] });
            options.onSuccess();
          } catch (cause) { if (dialog.isCurrent(token)) error.textContent = cause instanceof Error ? cause.message : "처리에 실패했습니다."; }
          finally { dialog.setProcessing(false, undefined, token); }
        } }
      ] });
  };
  form();
};
