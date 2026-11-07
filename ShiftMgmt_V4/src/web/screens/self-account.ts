import type { AuthSession } from "../../shared/domain/model";
import { getRoleLabel } from "../../shared/domain/authorization";
import { getPasswordPolicyChecks, getPasswordPolicyErrorMessage, isStrongPasswordSatisfied } from "../../shared/config/auth-password-policy";
import { WorkforceDialog } from "./workforce-dialog";

interface SelfAccountOptions {
  getSession: () => AuthSession;
  onSessionChanged: (session: AuthSession) => void;
  onSessionExpired: () => void;
}

export class SelfAccount {
  private dialog = new WorkforceDialog();
  private destroyed = false;

  constructor(private options: SelfAccountOptions) {}

  public open(trigger: HTMLElement): void {
    if (this.destroyed) return;
    const other = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]'))
      .find(node => node.getBoundingClientRect().height > 0);
    if (other) { other.focus(); return; }
    const owner = this.options.getSession();
    const form = document.createElement("form");
    form.className = "self-account-form";
    form.noValidate = true;
    const identity = document.createElement("p");
    identity.className = "self-account-identity";
    identity.textContent = `${owner.displayName} · ${owner.loginId} · ${getRoleLabel(owner.role)}`;
    const hint = document.createElement("p");
    hint.className = "workforce-form-hint";
    hint.textContent = "현재 화면과 작성 중인 내용은 그대로 유지됩니다. 내 계정의 비밀번호만 변경합니다.";
    form.append(identity, hint);
    const fields = document.createElement("div");
    const inputs = new Map<string, HTMLInputElement>();
    for (const [id, label, autocomplete] of [
      ["current", "현재 비밀번호", "current-password"],
      ["next", "새 비밀번호", "new-password"],
      ["confirm", "새 비밀번호 확인", "new-password"]
    ]) {
      const group = document.createElement("div");
      group.className = "workforce-form-group";
      const heading = document.createElement("label");
      heading.className = "workforce-form-label";
      heading.htmlFor = "self-account-" + id;
      heading.textContent = label;
      const input = document.createElement("input");
      input.id = heading.htmlFor;
      input.className = "workforce-input";
      input.type = "password";
      input.setAttribute("autocomplete", autocomplete);
      input.required = true;
      input.setAttribute("aria-describedby", "self-account-policy self-account-message");
      inputs.set(id, input);
      group.append(heading, input);
      fields.appendChild(group);
    }
    const policy = document.createElement("ul");
    policy.id = "self-account-policy";
    policy.className = "self-account-policy";
    const refreshPolicy = () => {
      policy.replaceChildren(...getPasswordPolicyChecks(inputs.get("next")!.value).map(rule => {
        const li = document.createElement("li");
        li.textContent = (rule.met ? "✓ " : "○ ") + rule.label;
        li.classList.toggle("is-met", rule.met);
        return li;
      }));
    };
    inputs.get("next")!.addEventListener("input", refreshPolicy);
    refreshPolicy();
    fields.appendChild(policy);
    const message = document.createElement("p");
    message.id = "self-account-message";
    message.className = "self-account-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const recheck = document.createElement("button");
    recheck.type = "button";
    recheck.id = "self-account-recheck";
    recheck.className = "workforce-btn workforce-btn-secondary";
    recheck.textContent = "로그인 상태 다시 확인";
    recheck.hidden = true;
    form.append(fields, message, recheck);
    let busy = false;
    let state: "editing" | "changed" | "uncertain" = "editing";
    let token = 0;
    const live = () => !this.destroyed && this.dialog.isCurrent(token) && this.options.getSession().userId === owner.userId;
    const clearSecrets = () => { inputs.forEach(input => { input.value = ""; }); refreshPolicy(); };
    const notify = (text: string, error = false) => {
      message.textContent = text;
      message.classList.toggle("is-error", error);
      message.setAttribute("role", error ? "alert" : "status");
    };
    const setBusy = (value: boolean) => {
      busy = value;
      this.dialog.setProcessing(value, "계정 정보를 확인하고 있습니다…", token);
      inputs.forEach(input => { input.disabled = value; });
      recheck.disabled = value;
    };
    const markChanged = (session: AuthSession) => {
      state = "changed";
      fields.hidden = true;
      clearSecrets();
      this.options.onSessionChanged(session);
      notify("비밀번호를 변경했습니다. 현재 화면에서 작업을 계속할 수 있습니다.");
      recheck.hidden = true;
    };
    const confirmSession = async () => {
      const bridge = window.appBridge;
      if (!bridge || !live()) return;
      setBusy(true);
      try {
        const result = await bridge.getSession();
        if (!live()) return;
        if (result.ok && result.data?.userId === owner.userId &&
            (state === "changed" || Boolean(owner.sessionToken && result.data.sessionToken !== owner.sessionToken))) {
          markChanged(result.data);
        } else {
          notify(state === "changed"
            ? "비밀번호는 변경되었습니다. 로그인 상태를 확인하지 못했습니다. 새 비밀번호로 다시 로그인할 때 확인해 주세요."
            : "변경 여부를 확정할 수 없습니다. 비밀번호를 다시 변경하지 않고 로그인 상태를 확인하거나, 다음 로그인 때 새 비밀번호를 확인해 주세요.", true);
          recheck.hidden = false;
        }
      } catch {
        if (!live()) return;
        notify(state === "changed"
          ? "비밀번호는 변경되었습니다. 연결이 복구되면 로그인 상태를 다시 확인해 주세요."
          : "연결이 끊겨 변경 여부를 확인하지 못했습니다. 자동으로 다시 변경하지 않습니다. 연결을 확인한 뒤 로그인 상태를 확인해 주세요.", true);
        recheck.hidden = false;
      } finally { if (live()) setBusy(false); }
    };
    const submit = async () => {
      if (busy || !live() || state !== "editing") return;
      const bridge = window.appBridge;
      if (!bridge) { notify("프로그램 연결을 확인한 뒤 다시 시도해 주세요.", true); return; }
      const currentPassword = inputs.get("current")!.value;
      const nextPassword = inputs.get("next")!.value;
      if (!currentPassword) { notify("현재 비밀번호를 입력해 주세요.", true); inputs.get("current")!.focus(); return; }
      if (!isStrongPasswordSatisfied(nextPassword)) { notify(getPasswordPolicyErrorMessage("새 비밀번호"), true); inputs.get("next")!.focus(); return; }
      if (nextPassword !== inputs.get("confirm")!.value) { notify("새 비밀번호 확인이 일치하지 않습니다.", true); inputs.get("confirm")!.focus(); return; }
      if (nextPassword === currentPassword) { notify("새 비밀번호는 현재 비밀번호와 달라야 합니다.", true); return; }
      setBusy(true);
      clearSecrets();
      try {
        const result = await bridge.changePassword({ currentPassword, nextPassword });
        if (!live()) return;
        if (!result.ok) {
          if (result.errorCode === "AUTH_SESSION_REQUIRED") {
            this.dialog.close();
            this.options.onSessionExpired();
            return;
          }
          notify(result.message, true);
          return;
        }
        if (result.data.userId !== owner.userId) { this.dialog.close(); this.options.onSessionExpired(); return; }
        state = "changed";
        fields.hidden = true;
        this.options.onSessionChanged(result.data);
        const save = document.getElementById("self-account-save");
        if (save) save.hidden = true;
        await confirmSession();
      } catch {
        if (!live()) return;
        state = "uncertain";
        fields.hidden = true;
        const save = document.getElementById("self-account-save");
        if (save) save.hidden = true;
        await confirmSession();
      } finally {
        if (live()) {
          setBusy(false);
          if (state === "editing") inputs.get("current")!.focus();
          else if (!recheck.hidden) recheck.focus();
          else document.getElementById("self-account-close")?.focus();
        }
      }
    };
    recheck.addEventListener("click", () => { if (!busy) void confirmSession(); });
    form.addEventListener("submit", event => { event.preventDefault(); void submit(); });
    this.dialog.open({
      id: "self-account-dialog", title: "내 계정 · 비밀번호 변경", width: "520px", content: form,
      triggerElement: trigger, initialFocusSelector: "#self-account-current", onClose: clearSecrets,
      buttons: [
        { id: "self-account-close", label: "닫기", onClick: () => this.dialog.close() },
        { id: "self-account-save", label: "비밀번호 변경", variant: "primary", onClick: submit }
      ]
    });
    token = this.dialog.captureToken();
  }

  public destroy(): void { this.destroyed = true; this.dialog.close(); }
}
