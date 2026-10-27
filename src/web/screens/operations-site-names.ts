// 근무지 이름 관리 탭 (R08)
import type { SiteNameOptionRecord } from "../../shared/domain/model";
import {
  el,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  showConfirm,
  sharedDialog
} from "./operations-ui";
import { validateSiteNameOption } from "./operations-model";
import { DataTable } from "../data-table";

export class OperationsSiteNamesTab {
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private siteNames: SiteNameOptionRecord[] = [];
  private table?: DataTable<SiteNameOptionRecord>;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", "근무지 이름 목록을 불러오는 중...");
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
      const res = await bridge.listSiteNameOptions();
      if (this.isDestroyed || this.loadRequestId !== operationGeneration1) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();

      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "근무지 이름 목록을 불러오지 못했습니다."))
        );
        return;
      }

      if (!res.data) return;

      this.siteNames = res.data;
      this.render();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `근무지 이름 조회 오류: ${String(e)}`));
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    this.container.innerHTML = "";
  }

  private render(): void {
    this.container.innerHTML = "";
    const wrap = el("div", "operations-site-names-wrap");

    // 헤더 (제목 및 추가 버튼)
    const header = el("div", "tab-header");
    header.appendChild(el("h3", "tab-title", "근무지 이름 관리"));

    const btnAdd = createButton("+ 새 근무지 이름 등록", "primary", () => this.openModal());
    btnAdd.id = "btn-add-site-name";
    header.appendChild(btnAdd);
    wrap.appendChild(header);

    // 테이블 (DataTable)
    const tableWrap = el("div", "site-names-table-wrap");
    this.table = new DataTable<SiteNameOptionRecord>({
      container: tableWrap,
      pageSize: 10,
      getRowId: (r) => r.id,
      searchPlaceholder: "근무지 명칭 검색...",
      columns: [
        {
          key: "name",
          label: "근무지 이름",
          sticky: true,
          sortable: true,
          render: (r) => {
            const span = el("span", "site-name-text");
            span.textContent = r.name; // XSS 안전
            return span;
          }
        },
        {
          key: "usageCount",
          label: "사용 건수",
          align: "right",
          sortable: true,
          render: (r) => el("span", "badge-usage", `${r.usageCount}건`)
        },
        {
          key: "actions",
          label: "관리",
          align: "right",
          render: (r) => {
            const actWrap = el("div", "table-action-btns");
            const btnEdit = createButton("수정", "secondary", () => this.openModal(r));
            const btnDel = createButton("삭제", "danger", () => this.handleDelete(r));
            actWrap.appendChild(btnEdit);
            actWrap.appendChild(btnDel);
            return actWrap;
          }
        }
      ]
    });
    this.table.setData(this.siteNames);
    wrap.appendChild(tableWrap);

    this.container.appendChild(wrap);
  }

  private openModal(item?: SiteNameOptionRecord): void {
    const isNew = !item;
    const content = el("div", "modal-form");

    const nameInput = el("input", "form-control") as HTMLInputElement;
    nameInput.value = item?.name || "";
    nameInput.placeholder = "근무지 명칭 (예: 서울본사, 판교지점)";
    content.appendChild(createFormGroup("근무지 명칭", nameInput));

    const errBox = el("div", "alert-danger");
    errBox.style.display = "none";
    content.appendChild(errBox);

    sharedDialog.open({
      id: isNew ? "modal-add-site-name" : "modal-edit-site-name",
      title: isNew ? "새 근무지 이름 추가" : "근무지 이름 수정",
      width: "440px",
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

            const siteName = nameInput.value;

            const check = validateSiteNameOption(siteName, this.siteNames, item?.id);
            if (!check.isValid) {
              errBox.textContent = check.error || "입력값이 올바르지 않습니다.";
              errBox.style.display = "block";
              return;
            }

            try {
              sharedDialog.setProcessing(true, undefined, modalToken);
              const operationGeneration2 = this.loadRequestId;
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              const res = await bridge.saveSiteNameOption({
                id: item?.id,
                name: siteName.trim()
              });
              if (this.isDestroyed || this.loadRequestId !== operationGeneration2 || !sharedDialog.isCurrent(modalToken)) return;
              if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

              if (res.ok && res.data) {
                sharedDialog.close();
                showNotice("저장 완료", `근무지 '${siteName.trim()}'이(가) 저장되었습니다.`, "info");
                await this.init();
              } else {
                errBox.textContent = formatErrorMessage(res, "근무지 이름을 저장하지 못했습니다.");
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

  private handleDelete(item: SiteNameOptionRecord): void {
    showConfirm({
      title: "근무지 이름 삭제 확인",
      message: `근무지 명칭 '${item.name}'을(를) 삭제하시겠습니까?`,
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        if (this.isDestroyed) return;
        const bridge = window.appBridge;
        if (!bridge) return;
        const operationGeneration3 = this.loadRequestId;
        if (this.isDestroyed) return;
        const dialogRevision3 = sharedDialog.captureToken();
        const res = await bridge.deleteSiteNameOption({
          optionId: item.id
        });
        if (this.isDestroyed || this.loadRequestId !== operationGeneration3 || sharedDialog.captureToken() !== dialogRevision3) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok) {
          showNotice("삭제 완료", "근무지 이름이 삭제되었습니다.", "info");
          await this.init();
        } else {
          showNotice("삭제 실패", formatErrorMessage(res, "삭제하지 못했습니다."), "error");
        }
      }
    });
  }
}
