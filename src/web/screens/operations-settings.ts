// 설정 탭 (R03) 및 파일 감시 제어
import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput,
  FileWatchStatusSnapshot
} from "../../shared/bridge/contracts";
import {
  el,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  renderStatusBadge,
  sharedDialog
} from "./operations-ui";
import {
  validateAppSettings,
  buildCompleteSettingsInput
} from "./operations-model";
import { mountOperationsBackup, type OperationsBackupRunner } from "./operations-backup";

export class OperationsSettingsTab {
  private container: HTMLElement;
  private currentSettings: AppSettingsSnapshot | null = null;
  private watchStatus: FileWatchStatusSnapshot | null = null;
  private isSaving = false;
  private isWatchActionRunning = false;

  private inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};

  private watchStatusBadgeEl?: HTMLElement;
  private watchDetailsEl?: HTMLElement;
  private btnRestartWatch?: HTMLButtonElement;
  private btnStopWatch?: HTMLButtonElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private backupRunner?: OperationsBackupRunner;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  private savedForm = "";

  private formSnapshot(): string {
    return JSON.stringify(Object.entries(this.inputs).map(([key, input]) => [key,
      input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value]));
  }

  public isDirty(): boolean {
    return !this.isDestroyed && !!this.currentSettings && this.formSnapshot() !== this.savedForm;
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", "설정 정보를 불러오는 중...");
    this.container.appendChild(loading);

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
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(settingsRes, "설정 정보를 불러오지 못했습니다."))
        );
        return;
      }

      if (!settingsRes.data) return;

      this.currentSettings = settingsRes.data;
      if (watchRes.ok && watchRes.data) {
        this.watchStatus = watchRes.data;
      }

      this.render();
    } catch (err) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      this.container.innerHTML = "";
      this.container.appendChild(
        el("div", "alert-danger", `설정 로딩 중 오류가 발생했습니다: ${String(err)}`)
      );
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    this.backupRunner?.destroy();
    this.container.innerHTML = "";
  }

  private render(): void {
    if (!this.currentSettings) return;

    const wrap = el("div", "operations-settings-wrap");

    // 1. 헤더 및 저장 버튼
    const header = el("div", "tab-header");
    header.appendChild(el("h3", "tab-title", "환경 및 운영 설정"));
    const btnSave = createButton("설정 저장", "primary", () => this.handleSave());
    btnSave.id = "btn-save-settings";
    header.appendChild(btnSave);
    wrap.appendChild(header);

    // 2. 기본 정보 (읽기 전용)
    const readOnlySec = el("div", "settings-section");
    readOnlySec.appendChild(el("h4", "section-title", "기본 시스템 정보 (읽기 전용)"));
    const roGrid = el("div", "form-grid ro-grid");

    const appNameInput = el("input", "form-control") as HTMLInputElement;
    appNameInput.value = this.currentSettings.appName;
    appNameInput.readOnly = true;
    roGrid.appendChild(createFormGroup("애플리케이션 명칭", appNameInput));

    const dataDirInput = el("input", "form-control") as HTMLInputElement;
    dataDirInput.value = this.currentSettings.dataDir;
    dataDirInput.readOnly = true;
    roGrid.appendChild(createFormGroup("데이터 루트 디렉터리", dataDirInput));

    const dbPathInput = el("input", "form-control") as HTMLInputElement;
    dbPathInput.value = this.currentSettings.databasePath;
    dbPathInput.readOnly = true;
    roGrid.appendChild(createFormGroup("데이터베이스 파일 경로", dbPathInput));

    readOnlySec.appendChild(roGrid);
    wrap.appendChild(readOnlySec);

    // 3. 업무 디렉터리 6종
    const dirSec = el("div", "settings-section");
    dirSec.appendChild(el("h4", "section-title", "업무 폴더 경로 설정"));
    const dirGrid = el("div", "form-grid");

    dirGrid.appendChild(this.createDirField("pendingDir", "인테이크 대기 폴더", this.currentSettings.pendingDir));
    dirGrid.appendChild(this.createDirField("approvedDir", "인테이크 승인 완료 폴더", this.currentSettings.approvedDir));
    dirGrid.appendChild(this.createDirField("scheduleExportDir", "근무표 내보내기 폴더", this.currentSettings.scheduleExportDir));
    dirGrid.appendChild(this.createDirField("allowanceProposalExportDir", "수당 품의서 내보내기 폴더", this.currentSettings.allowanceProposalExportDir));
    dirGrid.appendChild(this.createDirField("allowanceAttachment1ExportDir", "수당 별첨1 내보내기 폴더", this.currentSettings.allowanceAttachment1ExportDir));
    dirGrid.appendChild(this.createDirField("allowanceAttachment2ExportDir", "수당 별첨2 내보내기 폴더", this.currentSettings.allowanceAttachment2ExportDir));

    dirSec.appendChild(dirGrid);
    wrap.appendChild(dirSec);

    // 4. 백업 및 마이그레이션 설정
    const backupSec = el("div", "settings-section");
    backupSec.appendChild(el("h4", "section-title", "자동 백업 및 마이그레이션"));
    const backupGrid = el("div", "form-grid");

    backupGrid.appendChild(this.createDirField("databaseBackupDir", "DB 자동 백업 폴더", this.currentSettings.databaseBackupDir));

    const schedSelect = el("select", "form-control") as HTMLSelectElement;
    schedSelect.id = "select-databaseBackupSchedule";
    ["daily", "weekly", "monthly"].forEach((opt) => {
      const option = el("option", "", opt === "daily" ? "매일 (Daily)" : opt === "weekly" ? "매주 (Weekly)" : "매월 (Monthly)") as HTMLOptionElement;
      option.value = opt;
      if (opt === this.currentSettings?.databaseBackupSchedule) option.selected = true;
      schedSelect.appendChild(option);
    });
    this.inputs.databaseBackupSchedule = schedSelect;
    backupGrid.appendChild(createFormGroup("자동 백업 주기", schedSelect));

    const timeInput = el("input", "form-control") as HTMLInputElement;
    timeInput.id = "input-databaseBackupTime";
    timeInput.value = this.currentSettings.databaseBackupTime || "02:00";
    timeInput.placeholder = "HH:mm (예: 02:00)";
    this.inputs.databaseBackupTime = timeInput;
    backupGrid.appendChild(createFormGroup("자동 백업 실행 시각", timeInput, "24시간제 HH:mm 형식"));

    const migInput = el("input", "form-control") as HTMLInputElement;
    migInput.id = "input-migrationFilePath";
    migInput.value = this.currentSettings.migrationFilePath || "";
    this.inputs.migrationFilePath = migInput;
    backupGrid.appendChild(createFormGroup("외부 마이그레이션 정의 파일 경로", migInput, "선택 사항 (JSON 스키마 파일)"));

    backupSec.appendChild(backupGrid);
    wrap.appendChild(backupSec);

    // 5. 공휴일 API 및 근무표/수당 정책 규칙
    const ruleSec = el("div", "settings-section");
    ruleSec.appendChild(el("h4", "section-title", "공휴일 연동 및 정책 규칙"));
    const ruleGrid = el("div", "form-grid");

    const holidayApiInput = el("input", "form-control") as HTMLInputElement;
    holidayApiInput.id = "input-holidayApiBaseUrl";
    holidayApiInput.value = this.currentSettings.holidayApiBaseUrl || "";
    this.inputs.holidayApiBaseUrl = holidayApiInput;
    ruleGrid.appendChild(createFormGroup("공휴일 공공데이터 API 주소", holidayApiInput, "기본 공휴일 조회 엔드포인트 URL"));

    const nightLimitInput = el("input", "form-control") as HTMLInputElement;
    nightLimitInput.id = "input-scheduleConsecutiveNightLimit";
    nightLimitInput.type = "number";
    nightLimitInput.value = String(this.currentSettings.scheduleConsecutiveNightLimit ?? 3);
    this.inputs.scheduleConsecutiveNightLimit = nightLimitInput;
    ruleGrid.appendChild(createFormGroup("연속 야간 근무 제한 (일)", nightLimitInput, "최대 허용 연속 야간일수"));

    const minRestInput = el("input", "form-control") as HTMLInputElement;
    minRestInput.id = "input-scheduleMinimumRestMinutes";
    minRestInput.type = "number";
    minRestInput.value = String(this.currentSettings.scheduleMinimumRestMinutes ?? 660);
    this.inputs.scheduleMinimumRestMinutes = minRestInput;
    ruleGrid.appendChild(createFormGroup("근무 간 최소 휴식 시간 (분 단위)", minRestInput, "기본값 660분 (11시간)"));

    const maxWeeklyInput = el("input", "form-control") as HTMLInputElement;
    maxWeeklyInput.id = "input-scheduleWeeklyMaxMinutes";
    maxWeeklyInput.type = "number";
    maxWeeklyInput.value = String(this.currentSettings.scheduleWeeklyMaxMinutes ?? 3120);
    this.inputs.scheduleWeeklyMaxMinutes = maxWeeklyInput;
    ruleGrid.appendChild(createFormGroup("주당 최대 근무 시간 (분 단위)", maxWeeklyInput, "기본값 3120분 (52시간)"));

    const weeklyHolWrap = el("div", "checkbox-wrap");
    const weeklyHolInput = el("input", "form-checkbox") as HTMLInputElement;
    weeklyHolInput.id = "checkbox-scheduleRequireWeeklyHoliday";
    weeklyHolInput.type = "checkbox";
    weeklyHolInput.checked = this.currentSettings.scheduleRequireWeeklyHoliday ?? true;
    this.inputs.scheduleRequireWeeklyHoliday = weeklyHolInput;
    const weeklyHolLabel = el("label", "checkbox-label", "주 1회 이상 주휴일 필수 검증");
    weeklyHolWrap.appendChild(weeklyHolInput);
    weeklyHolWrap.appendChild(weeklyHolLabel);
    ruleGrid.appendChild(createFormGroup("주휴일 필수 여부", weeklyHolWrap));

    const subPolicyInput = el("input", "form-control") as HTMLInputElement;
    subPolicyInput.type = "date";
    subPolicyInput.id = "input-substituteAllowancePolicyEffectiveFrom";
    subPolicyInput.value = this.currentSettings.substituteAllowancePolicyEffectiveFrom || "";
    subPolicyInput.placeholder = "YYYY-MM-DD (비어있으면 미적용)";
    this.inputs.substituteAllowancePolicyEffectiveFrom = subPolicyInput;
    ruleGrid.appendChild(createFormGroup("대체근무수당 새 정책 시작일", subPolicyInput, "비어 있으면 새 규칙(Pool·주간고정조 제외)을 적용하지 않습니다."));

    const slotPolicyInput = el("input", "form-control") as HTMLInputElement;
    slotPolicyInput.type = "date";
    slotPolicyInput.id = "input-changedSlotPriorityEffectiveFrom";
    slotPolicyInput.value = this.currentSettings.changedSlotPriorityEffectiveFrom || "";
    slotPolicyInput.placeholder = "YYYY-MM-DD (비어있으면 옛 규칙)";
    this.inputs.changedSlotPriorityEffectiveFrom = slotPolicyInput;
    ruleGrid.appendChild(createFormGroup("변경후 우선 규칙 적용 시작일", slotPolicyInput, "비어 있으면 옛 규칙(변경전 우선)을 그대로 사용합니다."));

    ruleSec.appendChild(ruleGrid);
    wrap.appendChild(ruleSec);

    // 6. 파일 감시자 (File Watcher) 상태 및 제어
    const watchSec = el("div", "settings-section file-watch-section");
    watchSec.appendChild(el("h4", "section-title", "인테이크 폴더 실시간 감시 (File Watcher)"));
    const watchBar = el("div", "watch-status-bar");

    const statusBadge = renderStatusBadge(
      this.watchStatus?.isRunning ? "active" : "retired",
      this.watchStatus?.isRunning ? "감시 실행 중" : "감시 중지됨"
    );
    this.watchStatusBadgeEl = statusBadge;
    watchBar.appendChild(statusBadge);

    const btnRestart = createButton("감시 재시작", "secondary", () => this.handleRestartWatch());
    btnRestart.id = "btn-ops-restart-watch";
    this.btnRestartWatch = btnRestart;
    watchBar.appendChild(btnRestart);

    const btnStop = createButton("감시 중지", "danger", () => this.handleStopWatch());
    btnStop.id = "btn-stop-watch";
    this.btnStopWatch = btnStop;
    watchBar.appendChild(btnStop);

    watchSec.appendChild(watchBar);

    const details = el("div", "watch-details");
    if (this.watchStatus?.lastErrorMessage) {
      details.appendChild(el("div", "alert-warning", `감시 오류: ${this.watchStatus.lastErrorMessage}`));
    }
    this.watchDetailsEl = details;
    watchSec.appendChild(details);

    wrap.appendChild(watchSec);

    // 7. DB 백업 및 교체 흐름 (R04) 마운트
    const dbBackupContainer = el("div", "settings-section db-backup-section");
    wrap.appendChild(dbBackupContainer);
    this.backupRunner?.destroy();
    this.backupRunner = mountOperationsBackup(dbBackupContainer, this.onSessionExpired);

    this.container.appendChild(wrap);
    this.savedForm = this.formSnapshot();
  }

  private createDirField(
    key: string,
    label: string,
    initialVal: string
  ): HTMLElement {
    const wrap = el("div", "dir-input-group");
    const input = el("input", "form-control") as HTMLInputElement;
    input.value = initialVal;
    input.id = `input-${key}`;
    this.inputs[key] = input;

    const btnSelect = createButton("찾아보기...", "secondary", async () => {
      const bridge = window.appBridge;
      if (!bridge) return;
      try {
        const operationGeneration1 = this.loadRequestId;
        if (this.isDestroyed) return;
        const res = await bridge.selectDirectory({
          defaultPath: input.value,
          title: `${label} 선택`
        });
        if (this.isDestroyed || this.loadRequestId !== operationGeneration1) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok && res.data) {
          input.value = res.data;
        }
      } catch (e) {
        if (this.isDestroyed) return;
        console.error(e);
      }
    });
    btnSelect.type = "button";

    wrap.appendChild(input);
    wrap.appendChild(btnSelect);

    return createFormGroup(label, wrap);
  }

  private async handleSave(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isSaving || !this.currentSettings || !bridge) return;
    if (!this.inputs.databaseBackupTime.value.trim()) { showNotice("설정 입력 오류", "백업 시각을 HH:mm 형식으로 입력해 주세요.", "warning"); return; }

    const candidate: Partial<AppSettingsUpdateInput> = {
      holidayApiBaseUrl: (this.inputs.holidayApiBaseUrl as HTMLInputElement)?.value.trim(),
      pendingDir: (this.inputs.pendingDir as HTMLInputElement)?.value.trim(),
      approvedDir: (this.inputs.approvedDir as HTMLInputElement)?.value.trim(),
      scheduleExportDir: (this.inputs.scheduleExportDir as HTMLInputElement)?.value.trim(),
      allowanceProposalExportDir: (this.inputs.allowanceProposalExportDir as HTMLInputElement)?.value.trim(),
      allowanceAttachment1ExportDir: (this.inputs.allowanceAttachment1ExportDir as HTMLInputElement)?.value.trim(),
      allowanceAttachment2ExportDir: (this.inputs.allowanceAttachment2ExportDir as HTMLInputElement)?.value.trim(),
      databaseBackupDir: (this.inputs.databaseBackupDir as HTMLInputElement)?.value.trim(),
      databaseBackupSchedule: (this.inputs.databaseBackupSchedule as HTMLSelectElement)?.value as AppSettingsSnapshot["databaseBackupSchedule"],
      databaseBackupTime: (this.inputs.databaseBackupTime as HTMLInputElement)?.value.trim(),
      migrationFilePath: (this.inputs.migrationFilePath as HTMLInputElement)?.value.trim(),
      scheduleConsecutiveNightLimit: Number(this.inputs.scheduleConsecutiveNightLimit?.value || NaN),
      scheduleMinimumRestMinutes: Number(this.inputs.scheduleMinimumRestMinutes?.value || NaN),
      scheduleRequireWeeklyHoliday: (this.inputs.scheduleRequireWeeklyHoliday as HTMLInputElement)?.checked,
      scheduleWeeklyMaxMinutes: Number(this.inputs.scheduleWeeklyMaxMinutes?.value || NaN),
      substituteAllowancePolicyEffectiveFrom: (this.inputs.substituteAllowancePolicyEffectiveFrom as HTMLInputElement)?.value.trim(),
      changedSlotPriorityEffectiveFrom: (this.inputs.changedSlotPriorityEffectiveFrom as HTMLInputElement)?.value.trim()
    };

    const validation = validateAppSettings(candidate);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      showNotice("설정 입력 오류", firstError, "warning");
      return;
    }

    const fullInput = buildCompleteSettingsInput(this.currentSettings, candidate);

    const submittedForm = this.formSnapshot();
    this.isSaving = true;
    try {
      const operationGeneration2 = this.loadRequestId;
      if (this.isDestroyed) return;
      const dialogRevision2 = sharedDialog.captureToken();
      const res = await bridge.saveAppSettings(fullInput);
      if (this.isDestroyed || this.loadRequestId !== operationGeneration2 || sharedDialog.captureToken() !== dialogRevision2) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (res.ok && res.data) {
        this.currentSettings = res.data;
        this.savedForm = submittedForm;
        showNotice("설정 저장 완료", "운영 설정이 안전하게 저장되었습니다.", "info");
      } else if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        showNotice("설정 저장 실패", formatErrorMessage(res, "설정을 저장하지 못했습니다."), "error");
      }
    } catch (e) {
      if (this.isDestroyed) return;
      showNotice("설정 저장 오류", String(e), "error");
    } finally {
      this.isSaving = false;
    }
  }

  private async handleRestartWatch(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isWatchActionRunning || !bridge) return;
    this.isWatchActionRunning = true;
    try {
      const operationGeneration3 = this.loadRequestId;
      if (this.isDestroyed) return;
      const dialogRevision3 = sharedDialog.captureToken();
      const res = await bridge.restartFileWatch();
      if (this.isDestroyed || this.loadRequestId !== operationGeneration3 || sharedDialog.captureToken() !== dialogRevision3) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (res.ok && res.data) {
        this.watchStatus = res.data;
        this.updateWatchUI();
        showNotice("감시자 시작", "파일 감시자가 정상적으로 재시작되었습니다.", "info");
      } else {
        showNotice("감시자 시작 실패", formatErrorMessage(res), "error");
      }
    } catch (e) {
      if (this.isDestroyed) return;
      showNotice("오류", String(e), "error");
    } finally {
      this.isWatchActionRunning = false;
    }
  }

  private async handleStopWatch(): Promise<void> {
    const bridge = window.appBridge;
    if (this.isWatchActionRunning || !bridge) return;
    this.isWatchActionRunning = true;
    try {
      const operationGeneration4 = this.loadRequestId;
      if (this.isDestroyed) return;
      const dialogRevision4 = sharedDialog.captureToken();
      const res = await bridge.stopFileWatch();
      if (this.isDestroyed || this.loadRequestId !== operationGeneration4 || sharedDialog.captureToken() !== dialogRevision4) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (res.ok && res.data) {
        this.watchStatus = res.data;
        this.updateWatchUI();
        showNotice("감시자 중지", "파일 감시자가 중지되었습니다.", "info");
      } else {
        showNotice("감시자 중지 실패", formatErrorMessage(res), "error");
      }
    } catch (e) {
      if (this.isDestroyed) return;
      showNotice("오류", String(e), "error");
    } finally {
      this.isWatchActionRunning = false;
    }
  }

  private updateWatchUI(): void {
    if (!this.watchStatusBadgeEl) return;
    const isRunning = !!this.watchStatus?.isRunning;
    this.watchStatusBadgeEl.className = `status-badge status-${isRunning ? "active" : "retired"}`;
    this.watchStatusBadgeEl.textContent = isRunning ? "감시 실행 중" : "감시 중지됨";
  }
}
