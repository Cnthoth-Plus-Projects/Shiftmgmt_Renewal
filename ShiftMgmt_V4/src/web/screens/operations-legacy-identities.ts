import type { LegacyIdentitySummary } from "../../shared/domain/legacy-identity";
import { createButton, el, formatErrorMessage, operationsIcon, sharedDialog, showPromptConfirm } from "./operations-ui";

/** 실제 사번이 확인된 과거 인력만 별도 모달에서 한 번 연결한다. */
export class OperationsLegacyIdentities {
  private generation = 0;
  private destroyed = false;
  private busy = false;
  private identities: LegacyIdentitySummary[] = [];
  private selectedId = "";
  private modalToken: number | null = null;
  private drafts = new Map<string, { code: string; reason: string }>();
  private errors = new Map<string, string>();
  constructor(private container: HTMLElement, private onSessionExpired?: () => void) {}
  public isBusy(): boolean { return this.busy; }
  public destroy(): void {
    this.destroyed = true; this.generation++;
    this.closeModal(); this.drafts.clear(); this.errors.clear();
  }
  private closeModal(): void {
    const token = this.modalToken; this.modalToken = null;
    if (token !== null && sharedDialog.isCurrent(token)) sharedDialog.close();
  }
  public async refresh(): Promise<void> {
    if (this.destroyed || this.busy) return;
    const generation = ++this.generation;
    this.container.replaceChildren(el("p", "card-desc", "과거 인력의 사번 연결 내역을 불러오는 중입니다."));
    try {
      const bridge = window.appBridge;
      if (!bridge) throw Error("연결을 확인한 뒤 다시 시도해 주세요.");
      const response = await bridge.listLegacyIdentities();
      if (this.destroyed || generation !== this.generation) return;
      if (!response.ok) {
        if (response.errorCode === "AUTH_SESSION_REQUIRED") { this.closeModal(); this.onSessionExpired?.(); return; }
        throw Error(formatErrorMessage(response, "과거 인력 명부를 불러오지 못했습니다."));
      }
      this.identities = response.data ?? []; this.renderSummary();
    } catch (error) {
      if (this.destroyed || generation !== this.generation) return;
      this.container.replaceChildren(el("p", "alert-danger", error instanceof Error ? error.message : "과거 명부 조회에 실패했습니다."), createButton("다시 불러오기", "secondary", () => this.refresh()));
    }
  }
  private renderSummary(): void {
    const pending = this.identities.filter(identity => identity.canResolve).length;
    this.container.classList.add("legacy-identity-alert");
    this.container.classList.toggle("has-pending", pending > 0);
    const copy = el("div", "legacy-alert-copy"), heading = el("div", "legacy-alert-heading");
    heading.append(operationsIcon(pending ? "warning" : "verified"), el("h5", "card-subtitle", pending ? "과거 인력의 사번 확인이 필요합니다" : "과거 인력의 사번 연결"));
    copy.append(heading);
    if (!this.identities.length) {
      copy.append(el("p", "card-desc", "현재 연결할 과거 인력이 없습니다. 검토한 이관 파일을 복원하면 대상 인물이 표시됩니다."));
      this.container.replaceChildren(copy); return;
    }
    copy.append(el("p", "card-desc", pending ? `미확인 사번 ${pending}명 · 실제 사번이 확인된 대상만 연결해 주세요. 과거 기록과 승인 금액은 보존됩니다.` : "모든 대상의 사번을 연결했습니다. 연결 내역은 별도 창에서 확인할 수 있습니다."));
    const button = createButton(pending ? "대상 확인·사번 연결" : "연결 내역 보기", "secondary", () => { if (!this.busy) this.openModal(); });
    button.id = "btn-open-legacy-identities"; button.prepend(operationsIcon("open_in_new"));
    this.container.replaceChildren(copy, button);
  }
  private openModal(): void {
    if (this.destroyed || !this.identities.length) return;
    const selected = this.identities.find(identity => identity.id === this.selectedId) ?? this.identities.find(identity => identity.canResolve) ?? this.identities[0];
    this.selectedId = selected.id;
    const content = el("div", "legacy-identity-workspace"), guidance = el("div", "legacy-identity-guidance");
    guidance.append(operationsIcon("info"), el("p", "", "실제 사번이 확인된 대상만 한 번 연결합니다. 아직 확인되지 않았다면 그대로 두어도 과거 실적과 승인 금액은 유지됩니다."));
    content.append(guidance);
    const columns = el("div", "legacy-identity-columns"), list = el("div", "legacy-identity-list");
    list.setAttribute("aria-label", "과거 인력 선택"); list.append(el("h3", "legacy-list-title", `연결 대상 ${this.identities.length}명`));
    for (const identity of this.identities) {
      const button = el("button", "legacy-identity-option"); button.type = "button"; button.dataset.legacySelect = identity.id;
      button.setAttribute("aria-pressed", String(identity.id === selected.id)); button.disabled = this.busy;
      const top = el("span", "legacy-option-heading"); top.append(el("strong", "", identity.name), this.statusBadge(identity));
      button.append(top, el("small", "", `과거 실적 ${identity.entryCount}건 · 승인 ${identity.approvedCount}건`));
      button.addEventListener("click", () => { if (!this.busy) { this.selectedId = identity.id; this.openModal(); } }); list.append(button);
    }
    const detail = el("section", "legacy-identity-detail"); detail.dataset.legacyIdentity = selected.id;
    const heading = el("div", "legacy-detail-heading"); heading.append(el("h3", "", selected.name), this.statusBadge(selected));
    detail.append(heading, el("p", "legacy-current-code", `${selected.canResolve ? "현재 미확인 번호" : "연결된 사번"}: ${selected.employeeCode}`));
    const metrics = el("div", "legacy-identity-metrics");
    for (const [label, count] of [["보존된 과거 실적", selected.entryCount], ["본인 승인 기록", selected.approvedCount]] as const) {
      const metric = el("div", "legacy-identity-metric"); metric.append(el("span", "", label), el("strong", "", `${count}건`)); metrics.append(metric);
    }
    detail.append(metrics);
    if (selected.canResolve) {
      const draft = this.drafts.get(selected.id) ?? { code: "", reason: "" }; this.drafts.set(selected.id, draft);
      const code = el("input", "form-control legacy-identity-input"); code.id = `legacy-code-${selected.id}`;
      code.placeholder = "인력 관리에 등록된 실제 사번"; code.value = draft.code; code.autocomplete = "off"; code.disabled = this.busy;
      const reason = el("textarea", "form-control legacy-identity-input"); reason.id = `legacy-reason-${selected.id}`;
      reason.maxLength = 500; reason.rows = 3; reason.placeholder = "사번을 확인한 근거 또는 연결 사유를 입력하세요"; reason.value = draft.reason; reason.disabled = this.busy;
      for (const [label, input] of [["실제 사번", code], ["연결 사유", reason]] as const) {
        const group = el("div", "legacy-identity-field"), labelEl = el("label", "", label); labelEl.htmlFor = input.id;
        group.append(labelEl, input); detail.append(group);
      }
      code.addEventListener("input", () => { draft.code = code.value; }); reason.addEventListener("input", () => { draft.reason = reason.value; });
      const warning = el("div", "legacy-identity-caution");
      warning.append(operationsIcon("shield"), el("p", "", "먼저 인력 관리에 같은 이름으로 등록하세요. 연결은 한 번만 가능하며 완료 후에는 현재 사번을 다시 바꿀 수 없습니다. 근무 내용과 승인 금액은 그대로 보존됩니다.")); detail.append(warning);
    } else {
      const done = el("div", "legacy-resolution-result"); done.append(operationsIcon("check_circle"), el("strong", "", "사번 연결 완료"));
      if (selected.resolution) done.append(el("p", "", `${selected.resolution.resolvedAt.slice(0, 10)} · 담당 ${selected.resolution.actorName}`), el("p", "", `연결 사유: ${selected.resolution.reason}`));
      else done.append(el("p", "", "기존 직원 명부의 사번으로 연결됐습니다."));
      detail.append(done);
    }
    const error = el("p", "legacy-identity-error", this.errors.get(selected.id) ?? ""); error.id = "legacy-identity-error"; error.setAttribute("role", "alert");
    detail.append(error); columns.append(list, detail); content.append(columns);
    sharedDialog.open({
      id: "operations-legacy-identities-modal", title: "과거 인력의 사번 확인·연결", width: "960px", content,
      triggerElement: this.container.querySelector<HTMLElement>("#btn-open-legacy-identities"),
      initialFocusSelector: selected.canResolve ? `#legacy-code-${selected.id}` : "#btn-close-legacy-identities",
      buttons: [
        { id: "btn-close-legacy-identities", label: "닫기", onClick: () => this.closeModal(), disabled: this.busy },
        { id: "btn-resolve-legacy-identity", label: selected.canResolve ? "실제 사번 연결" : "연결 완료", variant: "primary", disabled: this.busy || !selected.canResolve, onClick: () => this.confirm(selected) }
      ], onClose: () => { this.modalToken = null; }
    });
    this.modalToken = sharedDialog.captureToken();
    if (this.busy) sharedDialog.setProcessing(true, "사번을 연결하고 있습니다. 잠시 기다려 주세요.", this.modalToken);
  }
  private statusBadge(identity: LegacyIdentitySummary): HTMLElement {
    return el("span", `legacy-identity-status ${identity.canResolve ? "is-pending" : "is-resolved"}`, identity.canResolve ? "확인 필요" : "연결 완료");
  }
  private confirm(identity: LegacyIdentitySummary): void {
    if (this.destroyed || this.busy || !identity.canResolve) return;
    const draft = this.drafts.get(identity.id), employeeCode = draft?.code.trim(), reason = draft?.reason.trim();
    if (!employeeCode || !reason) {
      this.errors.set(identity.id, "실제 사번과 연결 사유를 모두 입력해 주세요.");
      const message = document.getElementById("legacy-identity-error"); if (message) message.textContent = this.errors.get(identity.id)!; return;
    }
    this.errors.delete(identity.id); const generation = this.generation; this.busy = true;
    showPromptConfirm({
      title: "과거 인력의 사번 연결", requiredText: "연결", confirmLabel: "한 번 연결",
      message: `${identity.name}의 과거 기록을 실제 사번 ${employeeCode}로 연결합니다.`,
      warningText: "같은 이름으로 등록된 인력인지 확인하세요. 완료 후 다시 연결할 수 없으며, 완료한 뒤 JSON 백업을 새로 저장하세요.",
      onCancel: () => { this.busy = false; this.modalToken = null; queueMicrotask(() => { if (!this.destroyed && generation === this.generation) this.openModal(); }); },
      onConfirm: () => this.resolve(identity, employeeCode, reason, generation)
    });
    this.modalToken = sharedDialog.captureToken();
  }
  private async resolve(identity: LegacyIdentitySummary, employeeCode: string, reason: string, generation: number): Promise<void> {
    if (this.destroyed || generation !== this.generation) { this.busy = false; return; }
    this.openModal(); const token = this.modalToken;
    try {
      const response = await window.appBridge!.resolveLegacyIdentity({ identityId: identity.id, employeeCode, reason, confirmationText: "연결" });
      if (this.destroyed || generation !== this.generation) return;
      if (!response.ok) {
        if (response.errorCode === "AUTH_SESSION_REQUIRED") { this.closeModal(); this.onSessionExpired?.(); return; }
        this.errors.set(identity.id, formatErrorMessage(response, "연결에 실패했습니다. 입력한 실제 사번을 확인해 주세요."));
      } else { this.identities = response.data; this.drafts.delete(identity.id); this.errors.delete(identity.id); this.renderSummary(); }
    } catch (error) {
      if (!this.destroyed && generation === this.generation) this.errors.set(identity.id, error instanceof Error ? error.message : "연결에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      this.busy = false;
      if (!this.destroyed && generation === this.generation && token !== null && sharedDialog.isCurrent(token)) this.openModal();
    }
  }
}
