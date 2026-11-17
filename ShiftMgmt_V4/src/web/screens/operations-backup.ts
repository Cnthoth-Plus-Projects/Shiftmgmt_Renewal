// 설정 내 DB 백업 및 JSON 마이그레이션 교체 흐름 (R04, S17, S18, N02, N09, N10, UI02-D06)
import type {
  JsonDatabaseRestoreRequirementCheck,
  JsonDatabaseRestorePreview,
  JsonDatabaseRestoreSummary,
  JsonDatabaseBackupSummary,
  JsonDatabaseTableImpact
} from "../../shared/bridge/contracts";
import {
  el,
  createButton,
  formatErrorMessage,
  showNotice,
  showPromptConfirm,
  sharedDialog
} from "./operations-ui";
import { DataTable } from "../data-table";
import { createImportedHireDateReview } from "./employee-hire-date-review";
import { OperationsLegacyIdentities } from "./operations-legacy-identities";
import { rememberRestoreCompletion } from "../restore-feedback";

export function mountOperationsBackup(container: HTMLElement, onSessionExpired?: () => void): OperationsBackupRunner {
  const runner = new OperationsBackupRunner(container, onSessionExpired);
  runner.init();
  return runner;
}

type BackupFlowState =
  | "IDLE"
  | "PATH"
  | "CHECKING"
  | "CHECKED"
  | "PREVIEWING"
  | "PREVIEWED"
  | "RUNNING"
  | "RESULT";

export class OperationsBackupRunner {
  private container: HTMLElement;
  private state: BackupFlowState = "IDLE";

  private backupFilePath = "";
  private checkResult: JsonDatabaseRestoreRequirementCheck | null = null;
  private previewResult: JsonDatabaseRestorePreview | null = null;
  private restoreResult: JsonDatabaseRestoreSummary | null = null;
  private lastBackupSummary: JsonDatabaseBackupSummary | null = null;

  private isRunningBackup = false;
  private isDestroyed = false;
  private flowGeneration = 0;
  private isRestoring = false;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private legacyIdentities?: OperationsLegacyIdentities;
  private restoreDialogToken: number | null = null;

  private pathInputEl?: HTMLInputElement;
  private flowContainerEl?: HTMLElement;
  private backupInfoEl?: HTMLElement;

  constructor(container: HTMLElement, private onSessionExpired?: () => void) {
    this.container = container;
  }

  public isBusy(): boolean {
    return (!this.isDestroyed && (this.isRunningBackup || this.isRestoring || this.legacyIdentities?.isBusy() || this.state === "CHECKING" || this.state === "PREVIEWING")) === true;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.closeRestoreDialog();
    this.legacyIdentities?.destroy();
    this.flowGeneration++;
    clearTimeout(this.expiryTimer);
    this.checkResult = null;
    this.previewResult = null;
    this.container.innerHTML = "";
  }

  public init(): void {
    if (this.isDestroyed) return;
    this.container.innerHTML = "";
    this.render();
  }

  private resetFlowToPath(): void {
    if (this.isRestoring || this.isDestroyed) return;
    this.closeRestoreDialog();
    clearTimeout(this.expiryTimer);
    this.flowGeneration++;
    this.checkResult = null;
    this.previewResult = null;
    this.restoreResult = null;
    this.state = "PATH";
    if (this.flowContainerEl) {
      this.flowContainerEl.innerHTML = "";
      if (this.backupFilePath) {
        const wrap = el("div", "step-box");
        const btnCheck = createButton("1단계: 백업 파일 요구조건 검사", "primary", () => this.handleCheckRequirements());
        btnCheck.id = "btn-check-db-requirements";
        wrap.appendChild(btnCheck);
        this.flowContainerEl.appendChild(wrap);
      }
    }
  }

  private render(): void {
    this.container.appendChild(el("h4", "section-title", "데이터베이스 백업 및 마이그레이션 복원"));

    // 1. 즉시 백업 카드
    const backupBox = el("div", "backup-card");
    backupBox.appendChild(el("h5", "card-subtitle", "즉시 JSON DB 백업"));
    backupBox.appendChild(
      el("p", "card-desc", "현재 운영 데이터베이스의 전체 테이블을 안전한 JSON 스냅샷 파일로 백업합니다.")
    );

    const btnRunBackup = createButton("지금 즉시 백업 실행", "secondary", () => this.handleRunBackup());
    btnRunBackup.id = "btn-run-db-backup";
    backupBox.appendChild(btnRunBackup);

    const backupInfo = el("div", "backup-result-info");
    this.backupInfoEl = backupInfo;
    backupBox.appendChild(backupInfo);
    this.container.appendChild(backupBox);
    const legacyBox = el("div", "backup-card");
    this.container.appendChild(legacyBox);
    this.legacyIdentities = new OperationsLegacyIdentities(legacyBox, this.onSessionExpired);
    void this.legacyIdentities.refresh();

    // 2. JSON 복원/교체 카드
    const restoreBox = el("div", "restore-card");
    restoreBox.appendChild(el("h5", "card-subtitle", "JSON 마이그레이션 파일로 DB 교체"));
    restoreBox.appendChild(
      el("p", "card-desc", "검증된 JSON 백업 파일을 읽어 현재 데이터베이스 테이블을 안전하게 교체합니다. 교체 전 자동 백업이 수행됩니다.")
    );

    // 파일 선택/입력
    const pathGroup = el("div", "restore-path-group");
    const pathInput = el("input", "form-control restore-path-input") as HTMLInputElement;
    pathInput.id = "input-restore-backup-path";
    pathInput.placeholder = "JSON 백업 파일의 전체 경로를 입력하거나 [파일 선택]을 누르세요.";
    pathInput.addEventListener("input", () => {
      if (this.isRestoring || this.isDestroyed) return;
      this.backupFilePath = pathInput.value.trim();
      this.flowGeneration++;
      this.resetFlowToPath();
    });
    this.pathInputEl = pathInput;
    pathGroup.appendChild(pathInput);

    const btnBrowse = createButton("파일 선택...", "secondary", async () => {
      const bridge = window.appBridge;
      if (!bridge || this.isDestroyed || this.isRestoring) return;
      try {
        const pendingFlow1 = this.flowGeneration;
        const res = await bridge.selectJsonBackupFile();
        if (this.isDestroyed || this.flowGeneration !== pendingFlow1) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
        if (res.ok && res.data) {
          if (this.isRestoring) return;
        const selectedPath = res.data.filePath;
          pathInput.value = selectedPath;
          this.backupFilePath = selectedPath;
          this.flowGeneration++;
          this.resetFlowToPath();
        }
      } catch (e) {
        if (this.isDestroyed) return;
        showNotice("파일 선택 오류", String(e), "error");
      }
    });
    btnBrowse.id = "btn-browse-db-backup";
    pathGroup.appendChild(btnBrowse);
    restoreBox.appendChild(pathGroup);

    // 단계별 진행 컨테이너
    const flowContainer = el("div", "restore-flow-container");
    this.flowContainerEl = flowContainer;
    restoreBox.appendChild(flowContainer);

    this.container.appendChild(restoreBox);
    this.resetFlowToPath();
  }

  private async handleRunBackup(): Promise<void> {
    if (this.isRunningBackup) return;
    this.isRunningBackup = true;

    if (this.backupInfoEl) {
      this.backupInfoEl.innerHTML = "<div class='loading-spinner'>데이터베이스 즉시 백업을 실행하는 중...</div>";
    }

    const bridge = window.appBridge;
    if (!bridge) {
      if (this.backupInfoEl) {
        this.backupInfoEl.innerHTML = "<div class='alert-danger'>브리지 연결을 찾을 수 없습니다.</div>";
      }
      this.isRunningBackup = false;
      return;
    }

    try {
      const pendingFlow2 = this.flowGeneration;
      const res = await bridge.runDatabaseBackupNow();
      if (this.isDestroyed || this.flowGeneration !== pendingFlow2) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed) return;

      if (res.ok && res.data) {
        this.lastBackupSummary = res.data;
        if (this.backupInfoEl) {
          this.backupInfoEl.innerHTML = "";
          const alert = el("div", "alert-success");
          alert.appendChild(el("p", "msg-title", "백업이 성공적으로 생성되었습니다."));
          alert.appendChild(el("p", "msg-meta", `파일 경로: ${res.data.jsonBackupPath}`));
          alert.appendChild(el("p", "msg-meta", `일시: ${res.data.createdAt} | 테이블: ${res.data.tableCount}개 | 총 행수: ${res.data.rowCount}건`));
          alert.appendChild(el("p", "msg-meta", `SHA-256: ${res.data.backupSha256}`));
          this.backupInfoEl.appendChild(alert);
        }
      } else {
        if (this.backupInfoEl) {
          this.backupInfoEl.innerHTML = "";
          this.backupInfoEl.appendChild(
            el("div", "alert-danger", formatErrorMessage(res, "백업 생성에 실패했습니다."))
          );
        }
      }
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.backupInfoEl && !this.isDestroyed) {
        this.backupInfoEl.innerHTML = "";
        this.backupInfoEl.appendChild(el("div", "alert-danger", `백업 오류: ${String(e)}`));
      }
    } finally {
      this.isRunningBackup = false;
    }
  }

  private async handleCheckRequirements(): Promise<void> {
    const bridge = window.appBridge;
    if (!bridge || this.isDestroyed || this.isRestoring) return;
    if (!this.backupFilePath) {
      showNotice("경로 오류", "JSON 백업 파일 경로를 먼저 입력하세요.", "warning");
      return;
    }

    const capturedPath = this.backupFilePath;
    const curGen = ++this.flowGeneration;
    this.closeRestoreDialog();
    this.previewResult = null;
    clearTimeout(this.expiryTimer);

    this.state = "CHECKING";
    if (this.flowContainerEl) {
      this.flowContainerEl.innerHTML = "<div class='loading-spinner'>백업 파일의 스키마 및 무결성을 검사하는 중...</div>";
    }

    try {
      const pendingFlow3 = this.flowGeneration;
      const res = await bridge.checkDatabaseMigrationRequirements({
        backupFilePath: capturedPath
      });
      if (this.isDestroyed || this.flowGeneration !== pendingFlow3) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

      // UI02-D06: await 도중 경로 변경 또는 destroyed 검사
      if (this.isDestroyed || this.backupFilePath !== capturedPath || this.flowGeneration !== curGen) {
        return;
      }

      if (!this.flowContainerEl) return;
      this.flowContainerEl.innerHTML = "";

      if (!res.ok || !res.data) {
        this.state = "PATH";
        this.checkResult = null;
        this.previewResult = null;
        this.flowContainerEl.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "요구조건 검사에 실패했습니다."))
        );
        return;
      }

      this.checkResult = res.data;
      this.state = "CHECKED";
      this.renderCheckResult();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.backupFilePath !== capturedPath || this.flowGeneration !== curGen) {
        return;
      }
      this.state = "PATH";
      this.checkResult = null;
      this.previewResult = null;
      if (this.flowContainerEl) {
        this.flowContainerEl.innerHTML = "";
        this.flowContainerEl.appendChild(el("div", "alert-danger", `검사 실행 오류: ${String(e)}`));
      }
    }
  }

  private renderCheckResult(): void {
    if (!this.checkResult || !this.flowContainerEl || this.isDestroyed) return;

    const wrap = el("div", "step-box check-result-box");
    const title = el("h5", "step-title", `요구조건 검사 결과: ${this.checkResult.headline}`);
    wrap.appendChild(title);

    const meta = el("div", "check-meta");
    meta.appendChild(el("span", "", `검사 일시: ${this.checkResult.checkedAt}`));
    if (this.checkResult.backupSha256) {
      meta.appendChild(el("span", "", `파일 SHA-256: ${this.checkResult.backupSha256}`));
    }
    wrap.appendChild(meta);

    if (this.checkResult.details && this.checkResult.details.length > 0) {
      const ul = el("ul", "check-details-list");
      this.checkResult.details.forEach((d) => ul.appendChild(el("li", "", d)));
      wrap.appendChild(ul);
    }

    if (!this.checkResult.isReady) {
      wrap.appendChild(el("div", "alert-danger", "이 백업 파일은 현재 시스템 요구조건을 충족하지 않아 복원을 진행할 수 없습니다."));
      if (this.checkResult.recommendedActions && this.checkResult.recommendedActions.length > 0) {
        const actBox = el("div", "recommended-actions");
        actBox.appendChild(el("strong", "", "권장 조치:"));
        const ul = el("ul", "");
        this.checkResult.recommendedActions.forEach((a) => ul.appendChild(el("li", "", a)));
        actBox.appendChild(ul);
        wrap.appendChild(actBox);
      }
    } else {
      wrap.appendChild(el("div", "alert-success", "백업 파일 검사 완료: 데이터베이스 교체 미리보기를 생성할 수 있습니다."));
      const btnPreview = createButton("2단계: 변경 영향도 미리보기 생성", "primary", () => this.handleGeneratePreview());
      btnPreview.id = "btn-generate-db-preview";
      wrap.appendChild(btnPreview);
    }

    this.flowContainerEl.appendChild(wrap);
  }

  private async handleGeneratePreview(): Promise<void> {
    const bridge = window.appBridge;
    if (!this.checkResult || !this.checkResult.isReady || !bridge || this.isDestroyed || this.isRestoring || this.state === "PREVIEWING") return;

    const capturedPath = this.backupFilePath;
    const curGen = ++this.flowGeneration;
    this.closeRestoreDialog();
    this.previewResult = null;
    clearTimeout(this.expiryTimer);
    this.flowContainerEl?.querySelector(".preview-result-box")?.remove();

    this.state = "PREVIEWING";
    const previewButton = this.flowContainerEl?.querySelector<HTMLButtonElement>("#btn-generate-db-preview");
    if (previewButton) previewButton.disabled = true;
    const loading = el("div", "loading-spinner", "백업 파일의 테이블 영향도를 분석하고 미리보기를 생성하는 중...");
    this.flowContainerEl?.appendChild(loading);

    try {
      const pendingFlow4 = this.flowGeneration;
      const res = await bridge.previewDatabaseMigrationUpdate({
        backupFilePath: capturedPath
      });
      if (this.isDestroyed || this.flowGeneration !== pendingFlow4) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

      if (this.isDestroyed || this.backupFilePath !== capturedPath || this.flowGeneration !== curGen) {
        return;
      }

      loading.remove();

      if (!res.ok || !res.data) {
        this.previewResult = null;
        this.state = "CHECKED";
        this.flowContainerEl?.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "미리보기 생성에 실패했습니다."))
        );
        return;
      }

      this.previewResult = res.data;
      const remaining = Date.parse(res.data.expiresAt) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        this.resetFlowToPath();
        this.flowContainerEl?.appendChild(el("div", "alert-warning", "미리보기가 만료되었습니다. 다시 검사해 주세요."));
        return;
      }
      clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(() => { if (!this.isDestroyed && !this.isRestoring) this.resetFlowToPath(); }, remaining);
      this.state = "PREVIEWED";
      this.renderPreviewResult();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.backupFilePath !== capturedPath || this.flowGeneration !== curGen) {
        return;
      }
      loading.remove();
      this.previewResult = null;
      this.state = "CHECKED";
      this.flowContainerEl?.appendChild(el("div", "alert-danger", `미리보기 오류: ${String(e)}`));
    } finally {
      loading.remove();
      if (previewButton) previewButton.disabled = false;
    }
  }

  private renderPreviewResult(): void {
    if (!this.previewResult || !this.flowContainerEl || this.isDestroyed) return;

    const wrap = el("div", "step-box preview-result-box");
    wrap.appendChild(el("p", "", "변경 영향도 미리보기가 준비되었습니다. 별도 창에서 내용을 확인한 뒤 교체를 진행하세요."));
    const reopen = createButton("미리보기 다시 열기", "secondary", () => this.openPreviewDialog());
    reopen.id = "btn-open-db-preview";
    wrap.appendChild(reopen);
    this.flowContainerEl.appendChild(wrap);
    this.openPreviewDialog();
  }

  private closeRestoreDialog(): void {
    const token = this.restoreDialogToken;
    this.restoreDialogToken = null;
    if (token !== null && sharedDialog.isCurrent(token)) sharedDialog.close();
  }

  private openPreviewDialog(): void {
    if (!this.previewResult || this.isDestroyed || this.isRestoring) return;
    if (Date.parse(this.previewResult.expiresAt) <= Date.now()) {
      this.resetFlowToPath();
      return;
    }
    const wrap = el("div", "db-restore-preview-content");
    wrap.appendChild(el("p", "db-restore-preview-summary", `${this.previewResult.tableImpacts.length}개 테이블의 현재 자료와 교체 후 자료를 비교합니다. 아직 데이터베이스는 변경되지 않았습니다.`));

    if (this.previewResult.warningMessages && this.previewResult.warningMessages.length > 0) {
      const warnBox = el("div", "alert-warning");
      warnBox.appendChild(el("strong", "", "주의 사항:"));
      const ul = el("ul", "");
      this.previewResult.warningMessages.forEach((w) => ul.appendChild(el("li", "", w)));
      warnBox.appendChild(ul);
      wrap.appendChild(warnBox);
    }

    // 교체 전후 테이블 영향도 (DataTable)
    const tableWrap = el("div", "preview-table-container");
    const table = new DataTable<JsonDatabaseTableImpact>({
      container: tableWrap,
      pageSize: 10,
      getRowId: (row) => row.tableName,
      columns: [
        { key: "tableName", label: "테이블 명칭", sticky: true, sortable: true },
        { key: "currentRowCount", label: "현재 행 수", align: "right", sortable: true, getValue: (r) => r.currentRowCount },
        { key: "nextRowCount", label: "교체 후 행 수", align: "right", sortable: true, getValue: (r) => r.nextRowCount },
        {
          key: "delta",
          label: "변화량",
          align: "right",
          render: (r) => {
            const diff = r.nextRowCount - r.currentRowCount;
            const span = el("span", diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-muted");
            span.textContent = `${diff > 0 ? "+" : ""}${diff}`;
            return span;
          }
        }
      ]
    });
    table.setData(this.previewResult.tableImpacts || []);
    wrap.appendChild(tableWrap);
    wrap.appendChild(createImportedHireDateReview(this.previewResult.employeeHireDateReview,"preview"));

    wrap.appendChild(el("p", "execute-warning", "※ 교체를 실행하면 현재 데이터는 자동 백업된 후 선택한 파일의 내용으로 대체됩니다. 다음 확인 창에서 ‘교체’를 입력해야 실행됩니다."));
    sharedDialog.open({
      id: "operations-db-preview-modal",
      title: "3단계: 테이블 영향도 및 교체 확인",
      width: "1080px",
      content: wrap,
      triggerElement: this.flowContainerEl?.querySelector("#btn-open-db-preview"),
      initialFocusSelector: "#btn-close-db-preview",
      buttons: [
        { id: "btn-close-db-preview", label: "닫기", onClick: () => this.closeRestoreDialog() },
        { id: "btn-execute-db-restore", label: "최종 교체 실행 (확인 필요)", variant: "danger", onClick: () => this.handleConfirmExecute() }
      ],
      onClose: () => { this.restoreDialogToken = null; }
    });
    this.restoreDialogToken = sharedDialog.captureToken();
  }

  private handleConfirmExecute(): void {
    if (!this.previewResult || this.isRestoring || this.isDestroyed) return;
    const preview = this.previewResult;
    const generation = this.flowGeneration;

    showPromptConfirm({
      title: "데이터베이스 교체 최종 확인",
      message: "선택한 JSON 마이그레이션 파일로 데이터베이스를 교체하시겠습니까?",
      warningText: "교체 즉시 기존 활성 데이터가 새 데이터로 대체됩니다. 실행 전 현재 DB 백업이 자동 생성됩니다.",
      requiredText: "교체",
      confirmLabel: "교체 실행",
      onConfirm: async () => {
        this.restoreDialogToken = null;
        if (this.previewResult !== preview || this.flowGeneration !== generation) return;
        await this.executeRestore();
      },
      onCancel: () => {
        this.restoreDialogToken = null;
        queueMicrotask(() => {
          if (this.previewResult === preview && this.flowGeneration === generation) this.openPreviewDialog();
        });
      }
    });
    this.restoreDialogToken = sharedDialog.captureToken();
  }

  private async executeRestore(): Promise<void> {
    const bridge = window.appBridge;
    if (!this.previewResult || !bridge || this.isRestoring || this.isDestroyed) return;
    if (!Number.isFinite(Date.parse(this.previewResult.expiresAt)) || Date.parse(this.previewResult.expiresAt) <= Date.now()) {
      this.resetFlowToPath();
      showNotice("미리보기 만료", "미리보기가 만료되었습니다. 파일 검사부터 다시 진행해 주세요.", "warning");
      return;
    }

    const capturedPath = this.backupFilePath;
    const capturedSha = this.previewResult.backupSha256;
    const capturedToken = this.previewResult.previewToken;

    clearTimeout(this.expiryTimer);
    this.flowGeneration++;
    this.state = "RUNNING";
    this.isRestoring = true;
    const controls = Array.from(this.container.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button"));
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });

    const loading = el("div", "loading-spinner", "데이터베이스 교체 마이그레이션을 실행하는 중...");
    this.flowContainerEl?.appendChild(loading);

    try {
      const pendingFlow5 = this.flowGeneration;
      const res = await bridge.updateDatabaseFromMigration({
        backupFilePath: capturedPath,
        backupSha256: capturedSha,
        previewToken: capturedToken,
        confirmationText: "교체"
      });
      // 복원은 기존 세션을 무효화한다. 늦은 세션 오류가 화면을 닫아도 성공 안내는 남긴다.
      if (res.ok && res.data) {
        rememberRestoreCompletion(res.data);
        if (this.onSessionExpired) {
          this.onSessionExpired();
          return;
        }
      }
      if (this.isDestroyed || this.flowGeneration !== pendingFlow5) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

      if (this.isDestroyed) return;
      loading.remove();
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

      // UI02-D06: 실패 시 previewResult를 즉시 null로 만들어 토큰 및 미리보기 폐기 (재실행 불가 잠금)
      if (!res.ok || !res.data) {
        this.previewResult = null;
        this.state = "PATH";
        this.resetFlowAfterRestore();
        showNotice("DB 교체 실패", formatErrorMessage(res, "데이터베이스 교체에 실패했습니다. (기존 DB 상태는 안전하게 보존되었습니다)"), "error");
        return;
      }

      this.restoreResult = res.data;
      this.state = "RESULT";
      this.renderRestoreResult();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed) return;
      loading.remove();
      this.previewResult = null;
      this.state = "PATH";
      this.resetFlowAfterRestore();
      showNotice("오류", `교체 실행 중 오류 발생: ${String(e)} (기존 DB는 안전하게 보존되었습니다)`, "error");
    } finally {
      this.isRestoring = false;
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
    }
  }

  private resetFlowAfterRestore(): void {
    this.checkResult = null;
    this.previewResult = null;
    this.flowGeneration++;
    this.flowContainerEl?.replaceChildren(el("div", "alert-warning", "교체에 실패했습니다. 백업 파일을 다시 선택하거나 경로를 다시 입력하여 검사부터 진행해 주세요."));
  }

  private renderRestoreResult(): void {
    if (!this.restoreResult || !this.flowContainerEl) return;

    this.flowContainerEl.innerHTML = "";
    const wrap = el("div", "step-box restore-result-box");
    wrap.appendChild(el("h5", "step-title text-success", "데이터베이스 교체 완료"));

    const alert = el("div", "alert-success");
    alert.appendChild(el("p", "", "데이터베이스가 성공적으로 교체되었습니다."));
    if (this.restoreResult.backupBeforeRestore) {
      alert.appendChild(
        el("p", "text-muted", `(교체 직전 자동 백업 보존 경로: ${this.restoreResult.backupBeforeRestore.jsonBackupPath})`)
      );
    }
    wrap.appendChild(alert);

    wrap.appendChild(createImportedHireDateReview(this.restoreResult.employeeHireDateReview,"result"));
    this.flowContainerEl.appendChild(wrap);
  }
}
