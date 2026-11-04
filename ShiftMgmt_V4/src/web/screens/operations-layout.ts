// 양식 편집 탭 (R10, R13)
import type {
  DocumentLayoutKey,
  DocumentLayoutSnapshot,
  DocumentLayoutDefinition,
  DocumentLayoutHistoryRecord,
  DocumentLayoutOutputMember
} from "../../shared/domain/document-layout";
import {
  el,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  showConfirm,
  renderStatusBadge,
  sharedDialog
} from "./operations-ui";
import {
  layoutKeyToString,
  stringToLayoutKey,
  validateLayoutOutputFilename
} from "./operations-model";
import { OperationsLayoutCanvas } from "./operations-layout-canvas";
import { OperationsLayoutPreviewViewer } from "./operations-layout-preview";
import { DataTable } from "../data-table";

const SUPPORTED_KEYS: DocumentLayoutKey[] = [
  { documentKind: "schedule-xlsx", variant: "template1" },
  { documentKind: "schedule-xlsx", variant: "template2" },
  { documentKind: "proposal-xlsx" },
  { documentKind: "attachment1-xlsx" },
  { documentKind: "attachment2-xlsx" },
  { documentKind: "proposal-pdf" },
  { documentKind: "dashboard-report-pdf" }
];

export class OperationsLayoutTab {
  private container: HTMLElement;
  private currentKey: DocumentLayoutKey = SUPPORTED_KEYS[0];
  private snapshot: DocumentLayoutSnapshot | null = null;
  private draftDefinition: DocumentLayoutDefinition | null = null;
  private history: DocumentLayoutHistoryRecord[] = [];

  private canvasComponent?: OperationsLayoutCanvas;
  private previewViewer?: OperationsLayoutPreviewViewer;
  private historyTable?: DataTable<DocumentLayoutHistoryRecord>;

  private filenameInputs: HTMLInputElement[] = [];

  private isDestroyed = false;
  private loadRequestId = 0;
  private isSaving = false;
  private onSessionExpired?: () => void;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  public isDirty(): boolean {
    if (!this.snapshot || !this.draftDefinition) return false;
    return JSON.stringify(this.draftDefinition) !== JSON.stringify(this.snapshot.definition);
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    this.container.innerHTML = "";
    await this.loadLayout(this.currentKey);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    if (this.previewViewer) {
      this.previewViewer.destroy();
      this.previewViewer = undefined;
    }
    this.container.innerHTML = "";
  }

  private handleDraftChanged(): void {
    if (this.previewViewer) {
      this.previewViewer.invalidate(
        "초안 내용이 변경되었습니다. '미리보기 갱신' 버튼을 눌러 새 미리보기를 생성하세요."
      );
    }
  }

  private async loadLayout(key: DocumentLayoutKey): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.previewViewer?.destroy();
    this.previewViewer = undefined;
    this.currentKey = key;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", "문서 레이아웃 정의를 불러오는 중...");
    this.container.appendChild(loading);

    const bridge = window.appBridge;
    if (!bridge) {
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", "브리지 연결을 찾을 수 없습니다."));
      return;
    }

    try {
      const [snapRes, histRes] = await Promise.all([
        bridge.getDocumentLayout(key),
        bridge.listDocumentLayoutHistory(key)
      ]);

      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();

      if (!snapRes.ok) {
        if (snapRes.errorCode === "AUTH_SESSION_REQUIRED" || snapRes.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(snapRes, "레이아웃 정보를 불러오지 못했습니다."))
        );
        return;
      }

      if (!snapRes.data) return;

      this.snapshot = snapRes.data;
      // 깊은 복사로 초안 생성
      this.draftDefinition = JSON.parse(JSON.stringify(snapRes.data.definition));
      this.history = histRes.ok && histRes.data ? histRes.data : [];

      this.render();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `레이아웃 로딩 오류: ${String(e)}`));
    }
  }

  private render(): void {
    if (!this.snapshot || !this.draftDefinition) return;
    this.container.innerHTML = "";

    const wrap = el("div", "operations-layout-wrap");

    // 1. 헤더 (7개 문서 종류 선택 셀렉트 및 상태)
    const header = el("div", "tab-header");
    const titleGroup = el("div", "title-group");
    titleGroup.appendChild(el("h3", "tab-title", "문서 양식 및 레이아웃 편집"));

    const keySelect = el("select", "form-control layout-key-select") as HTMLSelectElement;
    SUPPORTED_KEYS.forEach((k) => {
      const kStr = layoutKeyToString(k);
      const opt = el("option", "", this.getKeyLabel(k)) as HTMLOptionElement;
      opt.value = kStr;
      if (kStr === layoutKeyToString(this.currentKey)) opt.selected = true;
      keySelect.appendChild(opt);
    });
    keySelect.addEventListener("change", () => {
      const nextKey = stringToLayoutKey(keySelect.value);
      if (this.isDirty()) {
        keySelect.value = layoutKeyToString(this.currentKey);
        showConfirm({
          title: "저장되지 않은 양식 변경",
          message: "다른 양식으로 이동하면 저장하지 않은 변경사항이 사라집니다.",
          confirmLabel: "변경사항을 버리고 이동",
          cancelLabel: "계속 편집",
          onCancel: () => { if (!this.isDestroyed) keySelect.focus(); },
          onConfirm: () => this.loadLayout(nextKey)
        });
      } else {
        void this.loadLayout(nextKey);
      }
    });
    titleGroup.appendChild(keySelect);
    header.appendChild(titleGroup);

    // 액션 버튼 (미리보기, 저장, 기본값복원)
    const btnGroup = el("div", "btn-group");
    const btnPreview = createButton("미리보기 갱신", "secondary", () => this.handleRefreshPreview());
    btnPreview.id = "btn-preview-layout";
    btnGroup.appendChild(btnPreview);

    const btnReset = createButton("기본값 복원", "danger", () => this.handleResetDefault());
    btnReset.id = "btn-reset-layout-default";
    btnGroup.appendChild(btnReset);

    const btnSave = createButton("양식 초안 저장", "primary", () => this.handleSaveDraft());
    btnSave.id = "btn-save-layout";
    btnGroup.appendChild(btnSave);

    header.appendChild(btnGroup);
    wrap.appendChild(header);

    // 버전 메타 배지
    const metaBar = el("div", "layout-meta-bar");
    const rev = this.snapshot.activeRevisionId || "기본값 (내장)";
    metaBar.appendChild(el("span", "meta-badge", `현재 활성판: ${rev}`));
    metaBar.appendChild(
      el("span", "meta-badge", this.snapshot.usingBuiltInDefault ? "내장 기본값 사용 중" : "사용자 저장판 사용 중")
    );
    if (this.snapshot.updatedAt) {
      metaBar.appendChild(el("span", "meta-badge", `최종 수정: ${this.snapshot.updatedAt}`));
    }
    wrap.appendChild(metaBar);

    // 2. 파일명 패턴 설정 영역
    const filenameSec = el("div", "layout-section filename-section");
    filenameSec.appendChild(el("h5", "section-sub", "출력 파일명 패턴 설정"));
    const fnGrid = el("div", "form-grid");
    this.filenameInputs = [];

    this.draftDefinition.outputs.forEach((out: DocumentLayoutOutputMember) => {
      const input = el("input", "form-control") as HTMLInputElement;
      input.value = out.outputFileNamePattern;
      input.id = `input-layout-filename-${out.memberId}`;
      input.addEventListener("input", () => {
        out.outputFileNamePattern = input.value.trim();
        this.handleDraftChanged();
      });
      this.filenameInputs.push(input);
      fnGrid.appendChild(
        createFormGroup(
          `파일명 패턴 [${out.memberId}]`,
          input,
          `사용 가능 토큰: ${this.getTokensDescription(this.draftDefinition?.documentKind || "")}`
        )
      );
    });
    filenameSec.appendChild(fnGrid);
    wrap.appendChild(filenameSec);

    // 3. 캔버스 영역 (R11)
    const canvasSec = el("div", "layout-section canvas-section");
    const canvasContainer = el("div", "canvas-host-container");
    this.canvasComponent = new OperationsLayoutCanvas({
      container: canvasContainer,
      definition: this.draftDefinition,
      capabilities: this.snapshot.capabilities,
      onDraftChange: () => {
        this.handleDraftChanged();
      }
    });
    this.canvasComponent.render();
    canvasSec.appendChild(canvasContainer);
    wrap.appendChild(canvasSec);

    // 4. 실제 생성물 미리보기 영역 (R12)
    const previewSec = el("div", "layout-section preview-section");
    previewSec.appendChild(el("h4", "section-title", "실제 문서 산출물 미리보기 (PDF / XLSX 바이너리)"));
    const previewContainer = el("div", "preview-host-container");
    this.previewViewer = new OperationsLayoutPreviewViewer(previewContainer, this.onSessionExpired);
    previewSec.appendChild(previewContainer);
    wrap.appendChild(previewSec);

    // 5. 이력 목록 테이블 (DataTable)
    const histSec = el("div", "layout-section history-section");
    histSec.appendChild(el("h4", "section-title", "양식 변경 이력 (Revision History)"));
    const histTableWrap = el("div", "history-table-wrap");
    this.historyTable = new DataTable<DocumentLayoutHistoryRecord>({
      container: histTableWrap,
      pageSize: 10,
      getRowId: (r) => r.revisionId,
      columns: [
        { key: "versionLabel", label: "버전 라벨", sticky: true, sortable: true },
        {
          key: "isActive",
          label: "활성 여부",
          align: "center",
          render: (r) => (r.isActive ? renderStatusBadge("active", "현재 활성") : el("span", "text-muted", "과거판"))
        },
        { key: "changeReason", label: "변경 사유", render: (r) => r.changeReason || "-" },
        { key: "createdAt", label: "저장 일시", sortable: true }
      ]
    });
    this.historyTable.setData(this.history);
    histSec.appendChild(histTableWrap);
    wrap.appendChild(histSec);

    this.container.appendChild(wrap);
  }

  private async applySavedSnapshot(snapshot: DocumentLayoutSnapshot): Promise<void> {
    if (this.isDestroyed) return;
    const requestId = ++this.loadRequestId;
    this.previewViewer?.destroy();
    this.snapshot = snapshot;
    this.draftDefinition = JSON.parse(JSON.stringify(snapshot.definition));
    this.history = [];
    this.render();
    const result = await window.appBridge?.listDocumentLayoutHistory(this.currentKey);
    if (this.isDestroyed || requestId !== this.loadRequestId) return;
    if (result?.ok && result.data) {
      this.history = result.data;
      this.historyTable?.setData(this.history);
    } else if (result && !result.ok && result.errorCode === "AUTH_SESSION_REQUIRED") this.onSessionExpired?.();
    else this.container.appendChild(el("div", "alert-warning", "양식은 저장되었습니다. 변경 이력 조회를 다시 시도해 주세요."));
  }

  private getKeyLabel(key: DocumentLayoutKey): string {
    if (key.documentKind === "schedule-xlsx") {
      return `근무표 엑셀 (${key.variant === "template1" ? "변형 1: 일반" : "변형 2: 상세"})`;
    }
    const map: Record<string, string> = {
      "proposal-xlsx": "수당 품의서 (XLSX)",
      "attachment1-xlsx": "수당 별첨 1 (XLSX)",
      "attachment2-xlsx": "수당 별첨 2 (XLSX)",
      "proposal-pdf": "수당 품의서 공식 양식 (PDF)",
      "dashboard-report-pdf": "운영 대시보드 리포트 (PDF)"
    };
    return map[key.documentKind] || key.documentKind;
  }

  private getTokensDescription(kind: string): string {
    if (kind === "schedule-xlsx") return "{year}, {monthNumber}, {month2}, {siteName}";
    if (kind.includes("proposal") || kind.includes("attachment")) return "{year}, {month2}";
    return "{name}, {timestamp}";
  }

  private handleRefreshPreview(): void {
    if (!this.draftDefinition || !this.previewViewer) return;
    this.previewViewer.loadPreview(
      this.draftDefinition,
      this.snapshot?.activeRevisionId || null
    );
  }

  private async handleSaveDraft(): Promise<void> {
    const bridge = window.appBridge;
    if (!this.draftDefinition || !this.snapshot || !bridge) return;

    // 파일명 유효성 검사
    for (const out of this.draftDefinition.outputs) {
      const check = validateLayoutOutputFilename(out.outputFileNamePattern, this.draftDefinition.documentKind);
      if (!check.isValid) {
        showNotice("파일명 오류", `[${out.memberId}] ${check.error}`, "warning");
        return;
      }
    }

    const content = el("div", "modal-form");
    const reasonInput = el("input", "form-control") as HTMLInputElement;
    reasonInput.placeholder = "변경 사유를 입력하세요 (예: 제목 글꼴 크기 조정)";
    content.appendChild(createFormGroup("변경 사유", reasonInput));

    sharedDialog.open({
      id: "modal-save-layout-draft",
      title: "양식 초안 저장 및 새 판 등록",
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
          label: "저장",
          variant: "primary",
          onClick: async () => {
            const modalToken = sharedDialog.captureToken();
            if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
            const reason = reasonInput.value.trim();
            try {
              sharedDialog.setProcessing(true, undefined, modalToken);
              const operationGeneration1 = this.loadRequestId;
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              const res = await bridge.saveDocumentLayout({
                definition: this.draftDefinition!,
                expectedRevisionId: this.snapshot?.activeRevisionId || null,
                changeReason: reason || undefined
              });
              if (this.isDestroyed || this.loadRequestId !== operationGeneration1 || !sharedDialog.isCurrent(modalToken)) return;
              if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

              if (res.ok && res.data) {
                sharedDialog.close();
                showNotice("저장 완료", "새 활성 판으로 저장되었습니다.", "info");
                await this.applySavedSnapshot(res.data);
              } else {
                sharedDialog.setProcessing(false, undefined, modalToken);
                showNotice("저장 실패", formatErrorMessage(res, "양식을 저장하지 못했습니다."), "error");
              }
            } catch (e) {
              if (this.isDestroyed || !sharedDialog.isCurrent(modalToken)) return;
              sharedDialog.setProcessing(false, undefined, modalToken);
              showNotice("오류", String(e), "error");
            }
          }
        }
      ]
    });
  }

  private handleResetDefault(): void {
    const bridge = window.appBridge;
    if (!this.snapshot || !bridge || this.isSaving || this.isDestroyed) return;

    showConfirm({
      title: "기본값으로 복원 확인",
      message: "이 문서 양식을 시스템 기본 정의로 복원하시겠습니까?",
      subMessage: "기본값으로 복원하면 기존 사용자 판을 덮어쓰지 않고 새로운 기본값 활성 판이 생성되어 이력에 추가됩니다.",
      confirmLabel: "기본값 복원",
      variant: "danger",
      onConfirm: async () => {
        if (this.isDestroyed) return;
        if (this.isSaving) return;
        this.isSaving = true;
        const operationGeneration2 = this.loadRequestId;
        if (this.isDestroyed) return;
        try {
        const dialogRevision2 = sharedDialog.captureToken();
        const res = await bridge.resetDocumentLayout({
          ...this.currentKey,
          expectedRevisionId: this.snapshot?.activeRevisionId || null,
          changeReason: "시스템 기본값으로 복원"
        });
        if (this.isDestroyed || this.loadRequestId !== operationGeneration2 || sharedDialog.captureToken() !== dialogRevision2) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

        if (res.ok && res.data) {
          showNotice("복원 완료", "시스템 기본값으로 새 활성판이 생성되었습니다.", "info");
          await this.applySavedSnapshot(res.data);
        } else {
          showNotice("복원 실패", formatErrorMessage(res, "기본값으로 복원하지 못했습니다."), "error");
        }
        } finally { this.isSaving = false; }
      }
    });
  }
}
