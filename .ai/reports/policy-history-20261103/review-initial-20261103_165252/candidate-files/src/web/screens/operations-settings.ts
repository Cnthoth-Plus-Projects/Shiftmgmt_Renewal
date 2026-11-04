// 설정 탭 (R03) 및 파일 감시 제어 (UI-ADMIN-01-SETTINGS: ADM01-R01~R10)
import type {
  AppSettingsSnapshot,
  FileWatchStatusSnapshot
} from "../../shared/bridge/contracts";
import {
  el,
  createButton,
  formatErrorMessage,
  showNotice,
  showConfirm,
  sharedDialog
} from "./operations-ui";
import {
  validateAppSettings,
  buildCompleteSettingsInput
} from "./operations-model";
import { mountOperationsBackup, type OperationsBackupRunner } from "./operations-backup";
import { OperationsPolicyHistoryModal } from "./operations-policy-history";
import {
  OperationsSettingsView, createFormField, createReadOnlySystemInfo, SETTINGS_PATH_HINTS, decorateSystemSettings, formatWatchTime, createPolicyManageSection
} from "./operations-settings-view";

export class OperationsSettingsTab {
  private container: HTMLElement;
  private currentSettings: AppSettingsSnapshot | null = null;
  private watchStatus: FileWatchStatusSnapshot | null = null;
  private watchQueryFailed = false;
  private watchQueryErrorMessage = "";
  private isSaving = false;
  private isWatchActionRunning = false;

  private inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  private initialValues: Record<string, string | boolean | number> = {};
  private savedForm: Record<string, string | boolean | number> = {};

  private view?: OperationsSettingsView;
  private watchStatusBadgeEl?: HTMLElement;
  private watchDetailsEl?: HTMLElement;
  private btnRestartWatch?: HTMLButtonElement;
  private btnStopWatch?: HTMLButtonElement;
  private btnRefreshWatch?: HTMLButtonElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private backupRunner?: OperationsBackupRunner;
  private policyHistoryModal?: OperationsPolicyHistoryModal;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  public isDirty(): boolean {
    return !this.isDestroyed && !!this.currentSettings && this.calculateDirtyCount() > 0;
  }

  public isBusy(): boolean {
    return this.isSaving || this.isWatchActionRunning || !!this.backupRunner?.isBusy();
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.container.innerHTML = "";
    this.container.appendChild(el("div", "loading-spinner", "설정 정보를 불러오는 중..."));

    const bridge = window.appBridge;
    if (!bridge) {
      this.container.innerHTML = "";
      this.container.appendChild(el("div", "alert-danger", "브리지 연결을 찾을 수 없습니다."));
      return;
    }

    try {
      const [settingsRes, watchRes] = await Promise.all([
        bridge.getAppSettings(),
        bridge.getFileWatchStatus()
      ]);

      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      this.container.innerHTML = "";

      if (!settingsRes.ok) {
        if (settingsRes.errorCode === "AUTH_SESSION_REQUIRED" || settingsRes.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        const errWrap = el("div", "alert-danger");
        errWrap.appendChild(el("p", "", formatErrorMessage(settingsRes, "설정 정보를 불러오지 못했습니다.")));
        errWrap.appendChild(createButton("다시 시도", "secondary", () => { void this.init(); }));
        this.container.appendChild(errWrap);
        return;
      }

      if (!settingsRes.data) {
        const emptyWrap = el("div", "alert-warning");
        emptyWrap.appendChild(el("p", "", "설정 데이터가 비어 있습니다. 잠시 후 다시 조회해 주세요."));
        emptyWrap.appendChild(createButton("다시 조회", "secondary", () => { void this.init(); }));
        this.container.appendChild(emptyWrap);
        return;
      }

      if (!watchRes.ok && ["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(watchRes.errorCode)) {
        this.onSessionExpired?.();
        return;
      }
      this.currentSettings = settingsRes.data;

      if (watchRes.ok && watchRes.data) {
        this.watchStatus = watchRes.data;
        this.watchQueryFailed = false;
        this.watchQueryErrorMessage = "";
      } else {
        this.watchStatus = null;
        this.watchQueryFailed = true;
        this.watchQueryErrorMessage = formatErrorMessage(watchRes, "파일 감시자 상태를 확인하지 못했습니다.");
      }

      this.render();
    } catch (err) {
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      this.container.innerHTML = "";
      const crashWrap = el("div", "alert-danger");
      crashWrap.appendChild(el("p", "", `설정 로딩 중 오류가 발생했습니다: ${String(err)}`));
      crashWrap.appendChild(createButton("다시 시도", "secondary", () => { void this.init(); }));
      this.container.appendChild(crashWrap);
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.policyHistoryModal?.close();
    this.loadRequestId++;
    this.backupRunner?.destroy();
    this.view?.destroy();
    this.container.innerHTML = "";
  }

  private calculateDirtyCount(): number {
    if (!this.currentSettings) return 0;
    let count = 0;
    for (const [key, input] of Object.entries(this.inputs)) {
      const current = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      const saved = this.savedForm[key];
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        if (Boolean(current) !== Boolean(saved)) count++;
      } else {
        if (String(current) !== String(saved ?? "")) count++;
      }
    }
    return count;
  }

  private updateDirtyUI(): void {
    const dirtyCount = this.calculateDirtyCount();
    this.view?.updateDirtyStatus(dirtyCount, this.isSaving);
  }

  private registerField(key: string, input: HTMLInputElement | HTMLSelectElement, initVal: string | boolean | number): void {
    this.inputs[key] = input;
    this.initialValues[key] = initVal;
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      this.updateDirtyUI();
    });
    input.addEventListener("change", () => {
      input.removeAttribute("aria-invalid");
      this.updateDirtyUI();
    });
  }

  private render(): void {
    if (!this.currentSettings) return;

    this.inputs = {};
    this.initialValues = {};

    this.view = new OperationsSettingsView({
      onBeforeAreaChange: () => {
        if (this.backupRunner?.isBusy()) {
          showNotice("작업 진행 중", "DB 백업 또는 복원 작업이 진행 중입니다. 완료 후 이동해 주세요.", "warning");
          return false;
        }
        return true;
      },
      onSave: () => { void this.handleSave(); },
      onRevert: () => { this.handleRevert(); }
    });

    this.view.mount(this.container);

    // 1. 업무 폴더 (folders)
    const foldersSlot = this.view.getPanelSlot("folders");
    const dirSec = el("div", "settings-section ops-settings-section");
    const dirGrid = el("div", "form-grid ops-settings-grid");
    dirGrid.appendChild(this.createDirField("pendingDir", "실적 대기 폴더", this.currentSettings.pendingDir));
    dirGrid.appendChild(this.createDirField("approvedDir", "승인 실적 보관 폴더", this.currentSettings.approvedDir));
    dirGrid.appendChild(this.createDirField("scheduleExportDir", "근무표 내보내기 폴더", this.currentSettings.scheduleExportDir));
    dirGrid.appendChild(this.createDirField("allowanceProposalExportDir", "수당 품의서 내보내기 폴더", this.currentSettings.allowanceProposalExportDir));
    dirGrid.appendChild(this.createDirField("allowanceAttachment1ExportDir", "수당 별첨1 내보내기 폴더", this.currentSettings.allowanceAttachment1ExportDir));
    dirGrid.appendChild(this.createDirField("allowanceAttachment2ExportDir", "수당 별첨2 내보내기 폴더", this.currentSettings.allowanceAttachment2ExportDir));
    dirSec.appendChild(dirGrid);
    foldersSlot.appendChild(dirSec);

    // 2. 백업·복원 (backup)
    const backupSlot = this.view.getPanelSlot("backup");
    const backupSec = el("div", "settings-section ops-settings-section");
    const backupGrid = el("div", "form-grid ops-settings-grid");
    backupGrid.appendChild(this.createDirField("databaseBackupDir", "DB 자동 백업 폴더", this.currentSettings.databaseBackupDir));

    const schedSelect = el("select", "form-control") as HTMLSelectElement;
    schedSelect.id = "select-databaseBackupSchedule";
    ["daily", "weekly", "monthly"].forEach((opt) => {
      const option = el("option", "", opt === "daily" ? "매일 (Daily)" : opt === "weekly" ? "매주 (Weekly)" : "매월 (Monthly)") as HTMLOptionElement;
      option.value = opt;
      if (opt === this.currentSettings?.databaseBackupSchedule) option.selected = true;
      schedSelect.appendChild(option);
    });
    this.registerField("databaseBackupSchedule", schedSelect, this.currentSettings.databaseBackupSchedule);
    backupGrid.appendChild(createFormField("자동 백업 주기", schedSelect, schedSelect.id));

    const timeInput = el("input", "form-control") as HTMLInputElement;
    timeInput.id = "input-databaseBackupTime";
    timeInput.type = "time";
    timeInput.step = "60";
    timeInput.value = this.currentSettings.databaseBackupTime || "02:00";
    timeInput.placeholder = "HH:mm (예: 02:00)";
    this.registerField("databaseBackupTime", timeInput, timeInput.value);
    backupGrid.appendChild(createFormField("자동 백업 실행 시각", timeInput, timeInput.id, "24시간제 HH:mm 형식"));

    const migInput = el("input", "form-control") as HTMLInputElement;
    migInput.id = "input-migrationFilePath";
    migInput.value = this.currentSettings.migrationFilePath || "";
    this.registerField("migrationFilePath", migInput, migInput.value);
    backupGrid.appendChild(createFormField("외부 마이그레이션 정의 파일 경로", migInput, migInput.id, "선택 사항 (JSON 스키마 파일)"));
    backupSec.appendChild(backupGrid);
    backupSlot.appendChild(backupSec);

    // 즉시 DB 백업 및 교체/복원 흐름 마운트
    const dbBackupContainer = el("div", "settings-section db-backup-section ops-backup-flow-section");
    backupSlot.appendChild(dbBackupContainer);
    this.backupRunner?.destroy();
    this.backupRunner = mountOperationsBackup(dbBackupContainer, this.onSessionExpired);

    // 3. 근무·수당 기준 (policy)
    const policySlot = this.view.getPanelSlot("policy");
    const ruleSec = el("div", "settings-section ops-settings-section");
    const ruleGrid = el("div", "form-grid ops-settings-grid");

    const nightLimitInput = el("input", "form-control") as HTMLInputElement;
    nightLimitInput.id = "input-scheduleConsecutiveNightLimit";
    nightLimitInput.type = "number";
    nightLimitInput.value = String(this.currentSettings.scheduleConsecutiveNightLimit ?? 3);
    this.registerField("scheduleConsecutiveNightLimit", nightLimitInput, this.currentSettings.scheduleConsecutiveNightLimit ?? 3);
    ruleGrid.appendChild(createFormField("연속 야간 근무 제한 (일)", nightLimitInput, nightLimitInput.id, "최대 허용 연속 야간일수"));

    const minRestInput = el("input", "form-control") as HTMLInputElement;
    minRestInput.id = "input-scheduleMinimumRestMinutes";
    minRestInput.type = "number";
    minRestInput.value = String(this.currentSettings.scheduleMinimumRestMinutes ?? 660);
    this.registerField("scheduleMinimumRestMinutes", minRestInput, this.currentSettings.scheduleMinimumRestMinutes ?? 660);
    ruleGrid.appendChild(createFormField("근무 간 최소 휴식 시간 (분 단위)", minRestInput, minRestInput.id, "기본값 660분 (11시간)"));

    const maxWeeklyInput = el("input", "form-control") as HTMLInputElement;
    maxWeeklyInput.id = "input-scheduleWeeklyMaxMinutes";
    maxWeeklyInput.type = "number";
    maxWeeklyInput.value = String(this.currentSettings.scheduleWeeklyMaxMinutes ?? 3120);
    this.registerField("scheduleWeeklyMaxMinutes", maxWeeklyInput, this.currentSettings.scheduleWeeklyMaxMinutes ?? 3120);
    ruleGrid.appendChild(createFormField("주당 최대 근무 시간 (분 단위)", maxWeeklyInput, maxWeeklyInput.id, "기본값 3120분 (52시간)"));

    const weeklyHolWrap = el("div", "checkbox-wrap");
    const weeklyHolInput = el("input", "form-checkbox") as HTMLInputElement;
    weeklyHolInput.id = "checkbox-scheduleRequireWeeklyHoliday";
    weeklyHolInput.type = "checkbox";
    weeklyHolInput.checked = this.currentSettings.scheduleRequireWeeklyHoliday ?? true;
    this.registerField("scheduleRequireWeeklyHoliday", weeklyHolInput, weeklyHolInput.checked);
    const weeklyHolLabel = el("label", "checkbox-label", "주 1회 휴무 확인 켜기") as HTMLLabelElement;
    weeklyHolLabel.htmlFor = weeklyHolInput.id;
    weeklyHolWrap.appendChild(weeklyHolInput);
    weeklyHolWrap.appendChild(weeklyHolLabel);
    ruleGrid.appendChild(createFormField("주휴일 필수 여부", weeklyHolWrap, weeklyHolInput.id));

    ruleSec.appendChild(ruleGrid);
    policySlot.appendChild(ruleSec);

    policySlot.appendChild(
      createPolicyManageSection(
        () => {
          if (!this.policyHistoryModal && window.appBridge) {
            this.policyHistoryModal = new OperationsPolicyHistoryModal(window.appBridge);
          }
          this.policyHistoryModal?.open("substitute-eligibility");
        },
        () => {
          if (!this.policyHistoryModal && window.appBridge) {
            this.policyHistoryModal = new OperationsPolicyHistoryModal(window.appBridge);
          }
          this.policyHistoryModal?.open("changed-worker-priority");
        }
      )
    );

    // 4. 시스템·감시 (system)
    const systemSlot = this.view.getPanelSlot("system");
    systemSlot.appendChild(createReadOnlySystemInfo(this.currentSettings));

    // 공휴일 API 연동
    const holidaySec = el("div", "settings-section ops-settings-section");
    holidaySec.appendChild(el("h4", "section-title", "공휴일 공공데이터 연동"));
    const holidayGrid = el("div", "form-grid ops-settings-grid");
    const holidayApiInput = el("input", "form-control") as HTMLInputElement;
    holidayApiInput.id = "input-holidayApiBaseUrl";
    holidayApiInput.value = this.currentSettings.holidayApiBaseUrl || "";
    this.registerField("holidayApiBaseUrl", holidayApiInput, holidayApiInput.value);
    holidayGrid.appendChild(createFormField("공휴일 공공데이터 API 주소", holidayApiInput, holidayApiInput.id, "공휴일 목록을 가져올 주소입니다. 기존 주소를 유지해도 됩니다."));
    holidaySec.appendChild(holidayGrid);
    systemSlot.appendChild(holidaySec);

    // 파일 감시자 상태 및 제어
    const watchSec = el("div", "settings-section file-watch-section ops-settings-section");
    watchSec.appendChild(el("h4", "section-title", "실적 폴더 자동 감시"));
    const watchBar = el("div", "watch-status-bar");
    this.watchStatusBadgeEl = el("span", "status-badge");
    watchBar.appendChild(this.watchStatusBadgeEl);

    const btnRestart = createButton("감시 재시작", "secondary", () => { void this.handleRestartWatch(); });
    btnRestart.id = "btn-ops-restart-watch";
    this.btnRestartWatch = btnRestart;
    watchBar.appendChild(btnRestart);

    const btnStop = createButton("감시 중지", "danger", () => { void this.handleStopWatch(); });
    btnStop.id = "btn-stop-watch";
    this.btnStopWatch = btnStop;
    watchBar.appendChild(btnStop);

    const btnRefresh = createButton("상태 다시 조회", "secondary", () => { void this.handleRefreshWatchStatus(); });
    btnRefresh.id = "btn-ops-refresh-watch-status";
    this.btnRefreshWatch = btnRefresh;
    watchBar.appendChild(btnRefresh);
    watchSec.appendChild(watchBar);

    const details = el("div", "watch-details");
    this.watchDetailsEl = details;
    watchSec.appendChild(details);
    this.updateWatchUI();
    systemSlot.appendChild(watchSec);
    decorateSystemSettings(systemSlot);

    this.savedForm = { ...this.initialValues };
    this.updateDirtyUI();
  }

  private createDirField(key: string, label: string, initialVal: string, helpText?: string): HTMLElement {
    const wrap = el("div", "dir-input-group");
    const input = el("input", "form-control") as HTMLInputElement;
    input.value = initialVal;
    input.id = `input-${key}`;
    this.registerField(key, input, initialVal);

    const btnSelect = createButton("찾아보기...", "secondary", async () => {
      const bridge = window.appBridge;
      if (!bridge) return;
      try {
        const gen = this.loadRequestId;
        if (this.isDestroyed) return;
        const res = await bridge.selectDirectory({ defaultPath: input.value, title: `${label} 선택` });
        if (this.isDestroyed || this.loadRequestId !== gen) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok && res.data) {
          input.value = res.data;
          input.removeAttribute("aria-invalid");
          this.updateDirtyUI();
        }
      } catch (e) {
        if (this.isDestroyed) return;
        console.error(e);
      }
    });
    btnSelect.type = "button";
    wrap.appendChild(input);
    wrap.appendChild(btnSelect);
    return createFormField(label, wrap, input.id, helpText ?? SETTINGS_PATH_HINTS[key]);
  }

  private handleRevert(): void {
    if (this.backupRunner?.isBusy()) {
      showNotice("작업 진행 중", "DB 백업 또는 복원 작업이 진행 중입니다. 완료 후 다시 시도해 주세요.", "warning");
      return;
    }
    const dirtyCount = this.calculateDirtyCount();
    if (dirtyCount === 0) return;

    showConfirm({
      title: "설정 되돌리기",
      message: "저장되지 않은 모든 변경사항을 마지막 저장된 상태로 되돌리시겠습니까?",
      subMessage: `수정 중이던 ${dirtyCount}개 설정 항목의 입력값이 마지막 저장 상태로 복원됩니다.`,
      confirmLabel: "되돌리기",
      cancelLabel: "취소",
      onConfirm: () => {
        for (const [key, input] of Object.entries(this.inputs)) {
          const savedVal = this.savedForm[key];
          if (input instanceof HTMLInputElement && input.type === "checkbox") {
            input.checked = Boolean(savedVal);
          } else {
            input.value = String(savedVal ?? "");
          }
          input.removeAttribute("aria-invalid");
        }
        this.updateDirtyUI();
      }
    });
  }

  private async handleSave(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isSaving || !this.currentSettings || !bridge) return;

    if (this.backupRunner?.isBusy()) {
      showNotice("작업 진행 중", "DB 백업 또는 복원 작업이 진행 중입니다. 완료 후 다시 시도해 주세요.", "warning");
      return;
    }

    if (!this.inputs.databaseBackupTime.value.trim()) {
      this.view?.focusField("databaseBackupTime");
      const timeEl = this.inputs.databaseBackupTime;
      timeEl.focus();
      timeEl.setAttribute("aria-invalid", "true");
      showNotice("설정 입력 오류", "자동 백업 실행 시각을 입력해 주세요. (HH:mm 형식)", "warning");
      return;
    }

    const candidate: Record<string, unknown> = {};
    for (const [key, input] of Object.entries(this.inputs)) {
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        candidate[key] = input.checked;
      } else if (input instanceof HTMLInputElement && input.type === "number") {
        candidate[key] = input.value === "" ? "" : Number(input.value);
      } else {
        candidate[key] = input.value.trim();
      }
    }

    const validation = validateAppSettings(candidate);
    if (!validation.isValid) {
      const errKey = Object.keys(validation.errors)[0];
      const errText = validation.errors[errKey] || "입력한 설정값이 올바르지 않습니다.";
      if (errKey && this.inputs[errKey]) {
        this.view?.focusField(errKey);
        const errInput = this.inputs[errKey];
        errInput.focus();
        errInput.setAttribute("aria-invalid", "true");
      }
      showNotice("설정 입력 오류", errText, "warning");
      return;
    }

    const fullInput = buildCompleteSettingsInput(this.currentSettings, candidate);
    const submittedForm: Record<string, string | boolean | number> = {};
    for (const [key, input] of Object.entries(this.inputs)) {
      submittedForm[key] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
    }

    this.isSaving = true;
    this.updateDirtyUI();

    const gen = this.loadRequestId;
    const token = sharedDialog.captureToken();
    try {
      if (this.isDestroyed) return;
      const res = await bridge.saveAppSettings(fullInput);
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") {
        this.onSessionExpired?.();
        return;
      }
      if (res.ok && res.data) {
        this.currentSettings = res.data;
        const persisted: Record<string, string | boolean | number> = {};
        for (const [key, input] of Object.entries(this.inputs)) {
          const stored = res.data[key as keyof AppSettingsSnapshot] ?? submittedForm[key];
          persisted[key] = stored;
          const current = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
          if (current === submittedForm[key]) {
            if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(stored);
            else input.value = String(stored);
          }
          input.removeAttribute("aria-invalid");
        }
        this.savedForm = { ...persisted };
        this.initialValues = { ...persisted };
        this.updateDirtyUI();
        if (this.ownsNotice(token)) showNotice("설정 저장 완료", "운영 설정이 안전하게 저장되었습니다.", "info");
      } else if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        if (this.ownsNotice(token)) showNotice("설정 저장 실패", formatErrorMessage(res, "설정을 저장하지 못했습니다."), "error");
      }
    } catch (e) {
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (this.ownsNotice(token)) showNotice("설정 저장 오류", String(e), "error");
    } finally {
      this.isSaving = false;
      this.updateDirtyUI();
    }
  }

  private ownsNotice(token: number): boolean {
    return !this.isDestroyed && sharedDialog.captureToken() === token && !sharedDialog.isOpen();
  }

  private updateWatchUI(): void {
    if (!this.watchStatusBadgeEl || !this.watchDetailsEl) return;

    if (this.watchQueryFailed) {
      this.watchStatusBadgeEl.className = "status-badge status-badge-danger";
      this.watchStatusBadgeEl.textContent = "확인 실패";
      this.watchDetailsEl.replaceChildren(el("span", "text-danger", `${this.watchQueryErrorMessage || "감시자 상태를 확인하지 못했습니다."} (상태 다시 조회를 눌러주세요)`));
      if (this.btnRestartWatch) this.btnRestartWatch.disabled = false;
      if (this.btnStopWatch) this.btnStopWatch.disabled = true;
      return;
    }

    if (!this.watchStatus) {
      this.watchStatusBadgeEl.className = "status-badge status-badge-muted";
      this.watchStatusBadgeEl.textContent = "알 수 없음";
      this.watchDetailsEl.textContent = "감시자 상태 정보가 없습니다.";
      if (this.btnRestartWatch) this.btnRestartWatch.disabled = false;
      if (this.btnStopWatch) this.btnStopWatch.disabled = true;
      return;
    }

    const { isRunning, lastStartedAt, lastStoppedAt } = this.watchStatus;
    if (isRunning) {
      this.watchStatusBadgeEl.className = "status-badge status-badge-success";
      this.watchStatusBadgeEl.textContent = "감시 중";
      this.watchDetailsEl.textContent = `실적 대기 폴더를 자동으로 감시하고 있습니다. (시작 시각: ${formatWatchTime(lastStartedAt)})`;
      if (this.btnRestartWatch) this.btnRestartWatch.disabled = true;
      if (this.btnStopWatch) this.btnStopWatch.disabled = false;
    } else {
      this.watchStatusBadgeEl.className = "status-badge status-badge-warning";
      this.watchStatusBadgeEl.textContent = "중지됨";
      this.watchDetailsEl.textContent = `실적 대기 폴더의 자동 감시가 중지되어 있습니다. ${lastStoppedAt ? `(중지 시각: ${formatWatchTime(lastStoppedAt)})` : ""}`;
      if (this.btnRestartWatch) this.btnRestartWatch.disabled = false;
      if (this.btnStopWatch) this.btnStopWatch.disabled = true;
    }
    if (this.watchStatus.lastErrorMessage) {
      this.watchDetailsEl.appendChild(el("div", "alert-warning", `마지막 감시 오류: ${this.watchStatus.lastErrorMessage}`));
    }
  }

  private async handleRestartWatch(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isWatchActionRunning || !bridge) return;
    this.isWatchActionRunning = true;
    this.updateDirtyUI();
    const gen = this.loadRequestId;
    const token = sharedDialog.captureToken();
    try {
      if (this.isDestroyed) return;
      const res = await bridge.restartFileWatch();
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (!res.ok && ["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(res.errorCode)) { this.onSessionExpired?.(); return; }
      if (res.ok && res.data) {
        this.watchStatus = res.data;
        this.watchQueryFailed = false;
        this.watchQueryErrorMessage = "";
        this.updateWatchUI();
        if (this.ownsNotice(token)) showNotice("감시 재시작 완료", "파일 감시자가 정상적으로 재시작되었습니다.", "info");
      } else {
        if (this.ownsNotice(token)) showNotice("감시 재시작 실패", formatErrorMessage(res), "error");
      }
    } catch (e) {
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (this.ownsNotice(token)) showNotice("오류", String(e), "error");
    } finally {
      this.isWatchActionRunning = false;
      this.updateDirtyUI();
    }
  }

  private async handleStopWatch(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isWatchActionRunning || !bridge) return;
    this.isWatchActionRunning = true;
    this.updateDirtyUI();
    const gen = this.loadRequestId;
    const token = sharedDialog.captureToken();
    try {
      if (this.isDestroyed) return;
      const res = await bridge.stopFileWatch();
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (!res.ok && ["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(res.errorCode)) { this.onSessionExpired?.(); return; }
      if (res.ok && res.data) {
        this.watchStatus = res.data;
        this.watchQueryFailed = false;
        this.watchQueryErrorMessage = "";
        this.updateWatchUI();
        if (this.ownsNotice(token)) showNotice("감시 중지 완료", "파일 감시자가 안전하게 중지되었습니다.", "info");
      } else {
        if (this.ownsNotice(token)) showNotice("감시 중지 실패", formatErrorMessage(res), "error");
      }
    } catch (e) {
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (this.ownsNotice(token)) showNotice("오류", String(e), "error");
    } finally {
      this.isWatchActionRunning = false;
      this.updateDirtyUI();
    }
  }

  private async handleRefreshWatchStatus(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isWatchActionRunning || !bridge) return;
    this.isWatchActionRunning = true;
    if (this.btnRefreshWatch) this.btnRefreshWatch.disabled = true;
    const token = sharedDialog.captureToken();
    const gen = this.loadRequestId;
    try {
      if (this.isDestroyed) return;
      const res = await bridge.getFileWatchStatus();
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (!res.ok && (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED")) {
        this.onSessionExpired?.();
        return;
      }
      if (res.ok && res.data) {
        this.watchStatus = res.data;
        this.watchQueryFailed = false;
        this.watchQueryErrorMessage = "";
        this.updateWatchUI();
        if (this.ownsNotice(token)) {
          showNotice("상태 조회 완료", "파일 감시자 상태를 성공적으로 다시 확인했습니다.", "info");
        }
      } else {
        this.watchStatus = null;
        this.watchQueryFailed = true;
        this.watchQueryErrorMessage = formatErrorMessage(res, "파일 감시자 상태를 확인하지 못했습니다.");
        this.updateWatchUI();
        if (this.ownsNotice(token)) {
          showNotice("상태 조회 실패", this.watchQueryErrorMessage, "error");
        }
      }
    } catch (e) {
      if (this.isDestroyed || this.loadRequestId !== gen) return;
      if (this.ownsNotice(token)) {
        showNotice("오류", String(e), "error");
      }
    } finally {
      this.isWatchActionRunning = false;
      if (this.btnRefreshWatch) this.btnRefreshWatch.disabled = false;
    }
  }
}
