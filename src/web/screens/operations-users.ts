// 사용자 관리 탭 (R07)
import type { UserRecord } from "../../shared/domain/model";
import type { OperationUserSaveInput } from "../../shared/bridge/contracts";
import {
  OperationsWorkspace,
  el,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  showConfirm,
  renderStatusBadge,
  sharedDialog
} from "./operations-ui";
import { OPERATION_USER_STATUS_OPTIONS, validateOperationUser } from "./operations-model";
import { DataTable } from "../data-table";

export class OperationsUsersTab {
  private workspace?: OperationsWorkspace;
  private activeArea = "users";
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private users: UserRecord[] = [];
  private table?: DataTable<UserRecord>;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", "사용자 목록을 불러오는 중...");
    this.container.appendChild(loading);

    const bridge = window.appBridge;
    if (!bridge) {
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", "브리지 연결을 찾을 수 없습니다."));
      return;
    }

    try {
      const operationGeneration1 = this.loadRequestId;
      if (this.isDestroyed) return;
      const res = await bridge.listOperationUsers();
      if (this.isDestroyed || this.loadRequestId !== operationGeneration1) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();

      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "사용자 목록을 불러오지 못했습니다."))
        );
        return;
      }

      if (!res.data) return;

      this.users = res.data;
      this.render();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `사용자 조회 오류: ${String(e)}`));
    }
  }

  public destroy(): void {
    this.workspace?.destroy();
    this.isDestroyed = true;
    this.loadRequestId++;
    this.container.innerHTML = "";
  }

  private render(): void {
    this.activeArea = this.workspace?.activeArea || this.activeArea;
    this.workspace?.destroy();
    this.container.innerHTML = "";
    const wrap = el("div", "operations-users-wrap");

    // 헤더 (제목 및 액션 버튼들)
    const header = el("div", "tab-header");
    header.appendChild(el("h3", "tab-title", "운영 사용자 관리"));

    const btnGroup = el("div", "btn-group");

    // 내 계정 복구키 재발급 버튼 (인자 없음)
    const btnRotateMyKey = createButton("내 계정 복구키 재발급", "secondary", () => this.handleRotateMyKey());
    btnRotateMyKey.id = "btn-rotate-my-recovery-key";
    btnGroup.appendChild(btnRotateMyKey);

    const btnAdd = createButton("+ 새 사용자 등록", "primary", () => this.openUserModal());
    btnAdd.id = "btn-add-user";
    btnGroup.appendChild(btnAdd);

    header.appendChild(btnGroup);
    wrap.appendChild(header);

    // 사용자 목록 테이블
    const tableWrap = el("div", "users-table-wrap");
    this.table = new DataTable<UserRecord>({
      container: tableWrap,
      pageSize: 10,
      getRowId: (r) => r.id,
      searchPlaceholder: "계정 ID, 이름, 역할, 이메일 검색...",
      columns: [
        { key: "loginId", label: "계정 ID (로그인)", sticky: true, sortable: true },
        { key: "displayName", label: "사용자 이름", sortable: true },
        {
          key: "role",
          label: "역할 (권한)",
          align: "center",
          sortable: true,
          render: (r) => {
            const roleLabels: Record<string, string> = {
              admin: "관리자 (Admin)",
              planner: "작성자 (Planner)",
              reviewer: "검토자 (Reviewer)",
              operator: "운영자 (Operator)"
            };
            return el("span", `role-badge role-${r.role}`, roleLabels[r.role] || r.role);
          }
        },
        {
          key: "status",
          label: "상태",
          align: "center",
          sortable: true,
          render: (r) => renderStatusBadge(r.status)
        },
        { key: "contact", label: "연락처", render: (r) => r.contact || "-" },
        { key: "email", label: "이메일", render: (r) => r.email || "-" },
        {
          key: "actions",
          label: "관리",
          align: "right",
          render: (r) => {
            const actWrap = el("div", "table-action-btns");
            const btnEdit = createButton("수정", "secondary", () => this.openUserModal(r));
            const btnDel = createButton("삭제", "danger", () => this.handleDelete(r));
            actWrap.appendChild(btnEdit);
            actWrap.appendChild(btnDel);
            return actWrap;
          }
        }
      ]
    });
    this.table.setData(this.users);
    wrap.appendChild(tableWrap);

    const list = el("div", "ops-list-panel");
    const toolbar = el("div", "ops-panel-toolbar"); toolbar.appendChild(btnAdd);
    list.append(toolbar, tableWrap);
    const security = el("section", "ops-info-card");
    security.append(el("h4", "", "내 계정의 복구키를 관리합니다"),
      el("p", "", "복구키는 비밀번호를 잊었을 때 계정을 되찾는 데 사용합니다. 새로 발급하면 이전 복구키는 사용할 수 없습니다. 확인창에서 발급 여부를 결정하고 새 키를 안전한 곳에 보관하세요."), btnRotateMyKey);
    this.workspace = new OperationsWorkspace(wrap, {
      id: "users", initialArea: this.activeArea,
      areas: [
        { id: "users", label: "사용자 관리", hint: "계정·역할·상태 관리", icon: "group", description: "사용자를 검색하고 등록·수정합니다. 역할은 사용할 수 있는 기능을, 상태는 로그인 가능 여부를 결정합니다.", content: list },
        { id: "security", label: "복구키 관리", hint: "복구키 확인과 재발급", icon: "key", description: "현재 로그인한 내 계정의 복구키를 재발급합니다. 비밀번호는 상단 ‘내 계정’에서 변경할 수 있습니다.", content: security }
      ], footerText: "등록·수정은 저장 후 적용됩니다. 삭제와 복구키 재발급은 확인창에서 다시 확인합니다.",
      canChange: () => !this.isDestroyed
    });
    this.container.appendChild(wrap);
    this.workspace.observeTable(this.table, tableWrap);
  }

  private openUserModal(user?: UserRecord): void {
    const isNew = !user;
    const content = el("div", "modal-form");

    const idInput = el("input", "form-control") as HTMLInputElement;
    idInput.value = user?.loginId || "";
    if (!isNew) idInput.readOnly = true;
    idInput.placeholder = "영문, 숫자 3~30자";
    content.appendChild(createFormGroup("계정 ID (로그인 전용)", idInput, isNew ? undefined : "계정 ID는 변경할 수 없습니다."));

    const nameInput = el("input", "form-control") as HTMLInputElement;
    nameInput.value = user?.displayName || "";
    nameInput.placeholder = "사용자 실명 또는 표시명";
    content.appendChild(createFormGroup("사용자 이름", nameInput));

    const roleSelect = el("select", "form-control") as HTMLSelectElement;
    [
      { val: "operator", label: "운영자 (Operator)" },
      { val: "planner", label: "작성자 (Planner)" },
      { val: "reviewer", label: "검토자 (Reviewer)" },
      { val: "admin", label: "관리자 (Admin)" }
    ].forEach((r) => {
      const opt = el("option", "", r.label) as HTMLOptionElement;
      opt.value = r.val;
      if (user && user.role === r.val) opt.selected = true;
      roleSelect.appendChild(opt);
    });
    content.appendChild(createFormGroup("권한 역할", roleSelect));

    const statusSelect = el("select", "form-control") as HTMLSelectElement;
    if (user && !OPERATION_USER_STATUS_OPTIONS.some(option => option.value === user.status)) {
      const unknown = el("option", "", "계정 상태를 확인해 주세요") as HTMLOptionElement;
      unknown.value = "";
      unknown.disabled = true;
      unknown.selected = true;
      statusSelect.appendChild(unknown);
    }
    OPERATION_USER_STATUS_OPTIONS.forEach((s) => {
      const opt = el("option", "", s.label) as HTMLOptionElement;
      opt.value = s.value;
      if (user && user.status === s.value) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    content.appendChild(createFormGroup("계정 상태", statusSelect));

    const phoneInput = el("input", "form-control") as HTMLInputElement;
    phoneInput.value = user?.contact || "";
    phoneInput.placeholder = "예: 010-1234-5678";
    content.appendChild(createFormGroup("연락처", phoneInput));

    const emailInput = el("input", "form-control") as HTMLInputElement;
    emailInput.value = user?.email || "";
    emailInput.placeholder = "예: user@example.com";
    content.appendChild(createFormGroup("이메일", emailInput));

    const pwInput = el("input", "form-control") as HTMLInputElement;
    pwInput.type = "password";
    pwInput.placeholder = isNew ? "최소 8자 이상 비밀번호" : "변경할 경우에만 8자 이상 입력";
    content.appendChild(createFormGroup("비밀번호", pwInput, isNew ? "초기 접속용 비밀번호" : "비워두면 기존 비밀번호가 유지됩니다."));

    const errBox = el("div", "alert-danger");
    errBox.style.display = "none";
    content.appendChild(errBox);

    sharedDialog.open({
      id: isNew ? "modal-add-user" : "modal-edit-user",
      title: isNew ? "새 운영 사용자 등록" : "운영 사용자 정보 수정",
      width: "480px",
      content,
      buttons: [
        {
          id: "btn-modal-cancel",
          label: "취소",
          variant: "secondary",
          onClick: () => sharedDialog.close()
        },
        {
          id: "btn-modal-submit",
          label: isNew ? "등록" : "저장",
          variant: "primary",
          onClick: async () => {
            const modalToken = sharedDialog.captureToken();
            if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
            const bridge = window.appBridge;
            if (!bridge) return;

            const loginId = idInput.value.trim();
            const displayName = nameInput.value.trim();
            const role = roleSelect.value as UserRecord["role"];
            const status = statusSelect.value as UserRecord["status"];
            const contact = phoneInput.value.trim() || undefined;
            const email = emailInput.value.trim() || undefined;
            const password = pwInput.value.trim();

            const check = validateOperationUser({
              loginId,
              displayName,
              role,
              status,
              password,
              isNew
            });

            if (!check.isValid) {
              errBox.textContent = Object.values(check.errors)[0];
              errBox.style.display = "block";
              return;
            }

            try {
              sharedDialog.setProcessing(true, undefined, modalToken);
              const saveInput: OperationUserSaveInput = {
                id: user?.id,
                loginId,
                displayName,
                role,
                status,
                contact,
                email,
                ...(password ? { password } : {})
              };

              const operationGeneration2 = this.loadRequestId;
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              const res = await bridge.saveOperationUser(saveInput);
              if (this.isDestroyed || this.loadRequestId !== operationGeneration2 || !sharedDialog.isCurrent(modalToken)) return;
              if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
              if (res.ok && res.data) {
                sharedDialog.close();
                showNotice("저장 완료", `사용자 '${displayName}' 정보가 저장되었습니다.`, "info");
                await this.init();
              } else {
                errBox.textContent = formatErrorMessage(res, "사용자 정보를 저장하지 못했습니다.");
                errBox.style.display = "block";
                sharedDialog.setProcessing(false, undefined, modalToken);
              }
            } catch (e) {
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              errBox.textContent = String(e);
              errBox.style.display = "block";
              sharedDialog.setProcessing(false, undefined, modalToken);
            }
          }
        }
      ]
    });
  }

  private handleDelete(user: UserRecord): void {
    showConfirm({
      title: "사용자 삭제 확인",
      message: `사용자 '${user.displayName} (${user.loginId})' 계정을 삭제하시겠습니까?`,
      subMessage: "※ 본인 계정이거나 시스템의 마지막 관리자인 경우 삭제가 차단됩니다.",
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        if (this.isDestroyed) return;
        const bridge = window.appBridge;
        if (!bridge) return;
        const operationGeneration3 = this.loadRequestId;
        if (this.isDestroyed) return;
        const dialogRevision3 = sharedDialog.captureToken();
        const res = await bridge.deleteOperationUser({
          userId: user.id
        });
        if (this.isDestroyed || this.loadRequestId !== operationGeneration3 || sharedDialog.captureToken() !== dialogRevision3) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok) {
          showNotice("삭제 완료", "사용자 계정이 삭제되었습니다.", "info");
          await this.init();
        } else {
          showNotice("삭제 실패", formatErrorMessage(res, "사용자를 삭제하지 못했습니다."), "error");
        }
      }
    });
  }

  private handleRotateMyKey(): void {
    showConfirm({
      title: "계정 복구키 재발급 확인",
      message: "현재 로그인된 관리자 계정의 복구키를 재발급하시겠습니까?",
      subMessage: "재발급 즉시 기존 복구키는 무효화되며, 새로 발급된 키는 지금 창을 닫으면 다시 조회할 수 없습니다.",
      confirmLabel: "복구키 재발급",
      variant: "primary",
      onConfirm: async () => {
        if (this.isDestroyed) return;
        const bridge = window.appBridge;
        if (!bridge) return;
        const operationGeneration4 = this.loadRequestId;
        if (this.isDestroyed) return;
        const dialogRevision4 = sharedDialog.captureToken();
        const res = await bridge.rotateAccountRecoveryKey();
        if (this.isDestroyed || this.loadRequestId !== operationGeneration4 || sharedDialog.captureToken() !== dialogRevision4) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok && res.data) {
          this.showRecoveryKeyModal(res.data.recoveryKey);
        } else {
          showNotice("재발급 실패", formatErrorMessage(res, "복구키를 재발급하지 못했습니다."), "error");
        }
      }
    });
  }

  private showRecoveryKeyModal(key: string): void {
    const content = el("div", "recovery-key-modal-content");
    content.appendChild(
      el("p", "alert-warning", "⚠️ 새로 발급된 복구키입니다. 안전한 곳에 즉시 복사하여 보관하세요. 이 창을 닫으면 다시 확인할 수 없습니다.")
    );

    const keyBox = el("div", "key-display-box");
    const keyInput = el("input", "form-control key-input") as HTMLInputElement;
    keyInput.value = key;
    keyInput.readOnly = true;
    keyBox.appendChild(keyInput);

    const btnCopy = createButton("복사", "secondary", async () => {
      try {
        await navigator.clipboard.writeText(key);
        btnCopy.textContent = "복사됨!";
        setTimeout(() => (btnCopy.textContent = "복사"), 2000);
      } catch (_e) {
        if (this.isDestroyed) return;
        keyInput.select();
      }
    });
    keyBox.appendChild(btnCopy);
    content.appendChild(keyBox);

    sharedDialog.open({
      id: "modal-recovery-key-display",
      title: "새 계정 복구키 발급",
      width: "500px",
      content,
      buttons: [
        {
          id: "btn-close-recovery-key",
          label: "안전하게 보관했습니다 (닫기)",
          variant: "primary",
          onClick: () => {
            key = "";
        keyInput.value = ""; // 메모리에서 즉시 폐기
            sharedDialog.close();
          }
        }
      ],
      onClose: () => {
        key = "";
        keyInput.value = "";
      }
    });
  }
}
