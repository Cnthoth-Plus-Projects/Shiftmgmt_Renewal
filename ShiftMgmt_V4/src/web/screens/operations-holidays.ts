// 공휴일 관리 탭 (R05)
import type {
  HolidayCalendar,
  HolidayItem
} from "../../shared/domain/model";
import {
  el,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  showConfirm,
  sharedDialog
} from "./operations-ui";
import {
  validateHolidayItem,
  sortHolidays
} from "./operations-model";
import { DataTable } from "../data-table";

export class OperationsHolidaysTab {
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private selectedYear: number;
  private currentCalendar: HolidayCalendar | null = null;
  private table?: DataTable<HolidayItem>;
  private isProcessing = false;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
    this.selectedYear = new Date().getFullYear();
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    this.container.innerHTML = "";
    await this.loadYear(this.selectedYear);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    this.container.innerHTML = "";
  }

  private async loadYear(year: number): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.selectedYear = year;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", `${year}년 공휴일 목록을 불러오는 중...`);
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
      const res = await bridge.listHolidayCalendars(year);
      if (this.isDestroyed || this.loadRequestId !== operationGeneration1) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();

      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "공휴일 목록을 불러오지 못했습니다."))
        );
        return;
      }

      if (!res.data) return;

      const calendars: HolidayCalendar[] = res.data;
      this.currentCalendar = calendars.find((c) => c.year === year) || {
        id: `calendar-${year}`,
        year,
        sourceName: "수동 등록",
        createdAt: new Date().toISOString(),
        items: []
      };

      this.render();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `공휴일 조회 오류: ${String(e)}`));
    }
  }

  private render(): void {
    this.container.innerHTML = "";
    const wrap = el("div", "operations-holidays-wrap");

    // 1. 헤더 (연도 선택 및 액션 버튼)
    const header = el("div", "tab-header");
    const titleWrap = el("div", "title-group");
    titleWrap.appendChild(el("h3", "tab-title", "공휴일 관리"));

    // 연도 선택 셀렉트
    const yearSelect = el("select", "form-control year-select") as HTMLSelectElement;
    const curYear = new Date().getFullYear();
    for (let y = curYear - 2; y <= curYear + 3; y++) {
      const opt = el("option", "", `${y}년`) as HTMLOptionElement;
      opt.value = String(y);
      if (y === this.selectedYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
    yearSelect.addEventListener("change", () => {
      this.loadYear(parseInt(yearSelect.value, 10));
    });
    titleWrap.appendChild(yearSelect);
    header.appendChild(titleWrap);

    const btnGroup = el("div", "btn-group");
    const btnAdd = createButton("+ 공휴일 직접 추가", "primary", () => this.openAddModal());
    btnAdd.id = "btn-add-holiday";
    btnGroup.appendChild(btnAdd);

    const btnFetchApi = createButton("API에서 공휴일 가져오기", "secondary", () => this.handleFetchApi());
    btnFetchApi.id = "btn-fetch-holiday-api";
    btnGroup.appendChild(btnFetchApi);

    header.appendChild(btnGroup);
    wrap.appendChild(header);

    // 2. 공휴일 목록 테이블
    const tableWrap = el("div", "holidays-table-wrap");
    this.table = new DataTable<HolidayItem>({
      container: tableWrap,
      pageSize: 10,
      getRowId: (row) => row.id,
      searchPlaceholder: "공휴일명 또는 날짜 검색...",
      columns: [
        { key: "holidayDate", label: "날짜", sticky: true, sortable: true },
        { key: "name", label: "공휴일 명칭", sortable: true },
        {
          key: "isSubstitute",
          label: "대체공휴일 여부",
          align: "center",
          render: (r) => (r.isSubstitute ? el("span", "badge-substitute", "대체공휴일") : "-")
        },
        {
          key: "actions",
          label: "관리",
          align: "right",
          render: (r) => {
            const actWrap = el("div", "table-action-btns");
            const btnRename = createButton("수정", "secondary", () => this.openRenameModal(r));
            const btnDel = createButton("삭제", "danger", () => this.handleDelete(r));
            actWrap.appendChild(btnRename);
            actWrap.appendChild(btnDel);
            return actWrap;
          }
        }
      ]
    });

    const items = sortHolidays(this.currentCalendar?.items || []);
    this.table.setData(items);
    wrap.appendChild(tableWrap);

    this.container.appendChild(wrap);
  }

  private openAddModal(): void {
    const content = el("div", "modal-form");

    const dateInput = el("input", "form-control") as HTMLInputElement;
    dateInput.type = "date";
    dateInput.value = `${this.selectedYear}-01-01`;
    content.appendChild(createFormGroup("공휴일 날짜", dateInput));

    const nameInput = el("input", "form-control") as HTMLInputElement;
    nameInput.placeholder = "공휴일 명칭 입력 (예: 어린이날)";
    content.appendChild(createFormGroup("공휴일 명칭", nameInput));

    const subCheckWrap = el("div", "checkbox-wrap");
    const subCheck = el("input", "form-checkbox") as HTMLInputElement;
    subCheck.type = "checkbox";
    subCheckWrap.appendChild(subCheck);
    subCheckWrap.appendChild(el("label", "checkbox-label", "대체공휴일 여부"));
    content.appendChild(createFormGroup("구분", subCheckWrap));

    const errBox = el("div", "alert-danger");
    errBox.style.display = "none";
    content.appendChild(errBox);

    sharedDialog.open({
      id: "modal-add-holiday",
      title: "공휴일 추가",
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
          label: "추가",
          variant: "primary",
          onClick: async () => {
            const modalToken = sharedDialog.captureToken();
            if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
            const bridge = window.appBridge;
            if (!bridge) return;

            const date = dateInput.value.trim();
            const name = nameInput.value.trim();
            const isSubstitute = subCheck.checked;

            const check = validateHolidayItem(
              date,
              name,
              this.selectedYear,
              this.currentCalendar?.items || []
            );

            if (!check.isValid) {
              errBox.textContent = check.error || "입력값이 올바르지 않습니다.";
              errBox.style.display = "block";
              return;
            }

            try {
              sharedDialog.setProcessing(true, undefined, modalToken);
              const operationGeneration2 = this.loadRequestId;
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              const res = await bridge.addHolidayItem({
                year: this.selectedYear,
                holidayDate: date,
                name,
                isSubstitute
              });
              if (this.isDestroyed || this.loadRequestId !== operationGeneration2 || !sharedDialog.isCurrent(modalToken)) return;
              if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

              if (res.ok && res.data) {
                sharedDialog.close();
                this.currentCalendar = res.data;
                this.table?.setData(sortHolidays(res.data.items || []));
                showNotice("추가 완료", `공휴일 '${name}'이(가) 추가되었습니다.`, "info");
              } else {
                errBox.textContent = formatErrorMessage(res, "추가하지 못했습니다.");
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

  private openRenameModal(item: HolidayItem): void {
    const content = el("div", "modal-form");

    const dateInput = el("input", "form-control") as HTMLInputElement;
    dateInput.value = item.holidayDate;
    dateInput.readOnly = true;
    content.appendChild(createFormGroup("날짜 (수정 불가)", dateInput));

    const nameInput = el("input", "form-control") as HTMLInputElement;
    nameInput.value = item.name;
    content.appendChild(createFormGroup("공휴일 명칭", nameInput));

    const errBox = el("div", "alert-danger");
    errBox.style.display = "none";
    content.appendChild(errBox);

    sharedDialog.open({
      id: "modal-rename-holiday",
      title: "공휴일 명칭 수정",
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
          label: "수정 저장",
          variant: "primary",
          onClick: async () => {
            const modalToken = sharedDialog.captureToken();
            if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
            const bridge = window.appBridge;
            if (!bridge) return;

            const newName = nameInput.value.trim();
            if (!newName) {
              errBox.textContent = "명칭을 입력하세요.";
              errBox.style.display = "block";
              return;
            }

            try {
              sharedDialog.setProcessing(true, undefined, modalToken);
              const operationGeneration3 = this.loadRequestId;
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              const res = await bridge.renameHolidayItem({
                holidayItemId: item.id,
                name: newName
              });
              if (this.isDestroyed || this.loadRequestId !== operationGeneration3 || !sharedDialog.isCurrent(modalToken)) return;
              if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

              if (res.ok && res.data) {
                sharedDialog.close();
                this.currentCalendar = res.data;
                this.table?.setData(sortHolidays(res.data.items || []));
                showNotice("수정 완료", "공휴일 명칭이 변경되었습니다.", "info");
              } else {
                errBox.textContent = formatErrorMessage(res, "수정하지 못했습니다.");
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

  private handleDelete(item: HolidayItem): void {
    showConfirm({
      title: "공휴일 삭제 확인",
      message: `'${item.holidayDate} (${item.name})' 공휴일을 삭제하시겠습니까?`,
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        if (this.isDestroyed) return;
        const bridge = window.appBridge;
        if (!bridge) return;
        const operationGeneration4 = this.loadRequestId;
        if (this.isDestroyed) return;
        const dialogRevision4 = sharedDialog.captureToken();
        const res = await bridge.deleteHolidayItem({
          holidayItemId: item.id
        });
        if (this.isDestroyed || this.loadRequestId !== operationGeneration4 || sharedDialog.captureToken() !== dialogRevision4) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok && res.data) {
          this.currentCalendar = res.data;
          this.table?.setData(sortHolidays(res.data.items || []));
          showNotice("삭제 완료", "공휴일이 삭제되었습니다.", "info");
        } else {
          showNotice("삭제 실패", formatErrorMessage(res, "삭제하지 못했습니다."), "error");
        }
      }
    });
  }

  private async handleFetchApi(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isProcessing || !bridge) return;
    this.isProcessing = true;

    try {
      const operationGeneration5 = this.loadRequestId;
      if (this.isDestroyed) return;
      const dialogRevision5 = sharedDialog.captureToken();
      const res = await bridge.fetchHolidayApiItems(this.selectedYear);
      if (this.isDestroyed || this.loadRequestId !== operationGeneration5 || sharedDialog.captureToken() !== dialogRevision5) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (!res.ok || !res.data) {
        showNotice("API 가져오기 실패", formatErrorMessage(res, "공휴일 API 조회를 실패했습니다. 기존 공휴일이 유지됩니다."), "error");
        return;
      }

      const fetchedItems: HolidayItem[] = res.data;
      if (fetchedItems.length === 0) {
        showNotice("알림", `${this.selectedYear}년에 조회된 공공데이터 공휴일이 없습니다.`, "info");
        return;
      }

      // 교체 확인 모달 (현재 vs 가져올 항목 수)
      const curCount = this.currentCalendar?.items.length || 0;
      showConfirm({
        title: "공휴일 캘린더 교체 확인",
        message: `${this.selectedYear}년 공공데이터 공휴일 ${fetchedItems.length}건을 가져왔습니다.`,
        subMessage: `현재 등록된 ${curCount}건의 공휴일이 공공데이터 목록으로 완전히 대체됩니다. 계속하시겠습니까?`,
        confirmLabel: "공휴일 교체",
        variant: "primary",
        onConfirm: async () => {
        if (this.isDestroyed) return;
          const operationGeneration6 = this.loadRequestId;
          if (this.isDestroyed) return;
          const dialogRevision6 = sharedDialog.captureToken();
          const replaceRes = await bridge.replaceHolidayCalendar({
            year: this.selectedYear,
            sourceName: "공공데이터포털 공휴일 API",
            items: fetchedItems.map((f: HolidayItem) => ({
              holidayDate: f.holidayDate,
              name: f.name,
              isSubstitute: f.isSubstitute
            }))
          });
          if (this.isDestroyed || this.loadRequestId !== operationGeneration6 || sharedDialog.captureToken() !== dialogRevision6) return;
          if (!replaceRes.ok && replaceRes.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

          if (replaceRes.ok && replaceRes.data) {
            this.currentCalendar = replaceRes.data;
            this.table?.setData(sortHolidays(replaceRes.data.items || []));
            showNotice("교체 완료", `${this.selectedYear}년 공휴일이 공공데이터로 갱신되었습니다.`, "info");
          } else {
            showNotice("교체 실패", formatErrorMessage(replaceRes, "공휴일 교체에 실패했습니다."), "error");
          }
        }
      });
    } catch (e) {
      if (this.isDestroyed) return;
      showNotice("오류", `API 가져오기 중 오류 발생: ${String(e)}`, "error");
    } finally {
      this.isProcessing = false;
    }
  }
}
