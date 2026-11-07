// 수당 요율 5x3 매트릭스 및 영향도 비교 탭 (R06, S07, S08, N04, N05, UI02-D02, UI02-D03)
import type { AllowanceRateVersion, AllowanceRateHistoryRecord } from "../../shared/domain/model";
import type { AllowanceRateItemSaveInput } from "../../shared/bridge/contracts";
import {
  allowanceRateCategoryOrder,
  allowanceRateAxisOrder,
  allowanceRateCategoryLabels,
  allowanceRateAxisLabels,
  buildAllowanceRateTable,
  type AllowanceRateMatrix
} from "../../shared/domain/allowance-rate-matrix";
import {
  buildAllowanceRateImpactPreview
} from "../../shared/domain/allowance-rate-impact";
import {
  el,
  OperationsWorkspace,
  createButton,
  createFormGroup,
  formatErrorMessage,
  showNotice,
  showConfirm,
  renderStatusBadge,
  sharedDialog
} from "./operations-ui";
import {
  validateRateMatrix,
  matrixToRateItems,
  isValidDateFormat
} from "./operations-model";
import { DataTable } from "../data-table";

export class OperationsRatesTab {
  private workspace?: OperationsWorkspace;
  private activeArea = "versions";
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private impactRequestId = 0;
  private isSaving = false;

  private versions: AllowanceRateVersion[] = [];
  private history: AllowanceRateHistoryRecord[] = [];
  private historyError = "";
  private selectedVersion: AllowanceRateVersion | null = null;
  private currentMatrix: AllowanceRateMatrix = buildAllowanceRateTable(null);
  private versionTable?: DataTable<AllowanceRateVersion>;

  // 폼 입력 요소 참조
  private labelInputEl?: HTMLInputElement;
  private yearInputEl?: HTMLInputElement;
  private statusSelectEl?: HTMLSelectElement;
  private fromInputEl?: HTMLInputElement;
  private toInputEl?: HTMLInputElement;
  private reasonInputEl?: HTMLInputElement;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  private editorBaseline = "";

  private editorSnapshot(): string {
    return JSON.stringify(Array.from(this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#rate-editor-section input, #rate-editor-section select")).map(input => input.value));
  }

  public isDirty(): boolean {
    return !this.isDestroyed && this.editorSnapshot() !== this.editorBaseline;
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", "수당 요율 버전을 불러오는 중...");
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
      const [res, historyRes] = await Promise.all([bridge.listAllowanceRateVersions(), bridge.listAllowanceRateHistory()]);
      if (this.isDestroyed || this.loadRequestId !== operationGeneration1) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();

      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "요율 버전을 불러오지 못했습니다."))
        );
        return;
      }

      if (!res.data) return;

      this.versions = res.data;
      if (!historyRes.ok && historyRes.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      this.history = historyRes.ok ? historyRes.data || [] : [];
      this.historyError = historyRes.ok ? "" : formatErrorMessage(historyRes, "변경 이력을 불러오지 못했습니다.");
      // 기본적으로 최신 활성(active) 버전 선택 또는 첫 버전 선택
      this.selectedVersion =
        this.versions.find((v) => v.status === "active") || this.versions[0] || null;
      if (this.selectedVersion) {
        this.currentMatrix = buildAllowanceRateTable(this.selectedVersion);
      }

      this.render();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `요율 버전 로딩 오류: ${String(e)}`));
    }
  }

  public destroy(): void {
    this.workspace?.destroy();
    this.isDestroyed = true;
    this.impactRequestId++;
    this.loadRequestId++;
    this.container.innerHTML = "";
  }

  private render(): void {
    if (this.isDestroyed) return;
    this.activeArea = this.workspace?.activeArea || this.activeArea;
    this.workspace?.destroy();
    this.container.innerHTML = "";
    const wrap = el("div", "operations-rates-wrap");

    // 1. 상단: 버전 목록 테이블 (DataTable)
    const listSec = el("div", "rates-section list-section");
    const listHeader = el("div", "section-header");
    listHeader.appendChild(el("h3", "tab-title", "수당 요율 버전 관리"));

    const btnNew = createButton("+ 새 요율 버전 작성", "primary", () => this.handleNewVersion());
    btnNew.id = "btn-new-rate-version";
    listHeader.appendChild(btnNew);
    listSec.appendChild(listHeader);

    const filters = el("div", "form-grid");
    const yearFilter = el("input", "form-control");
    yearFilter.type = "number";
    yearFilter.id = "filter-rate-year";
    const stateFilter = el("select", "form-control");
    stateFilter.id = "filter-rate-status";
    for (const [value, label] of [["", "전체 상태"], ["draft", "초안"], ["active", "활성"], ["retired", "만료"]]) {
      const option = el("option", "", label); option.value = value; stateFilter.appendChild(option);
    }
    const periodFrom = el("input", "form-control"); periodFrom.type = "date"; periodFrom.id = "filter-rate-from";
    const periodTo = el("input", "form-control"); periodTo.type = "date"; periodTo.id = "filter-rate-to";
    filters.append(createFormGroup("적용 연도", yearFilter), createFormGroup("상태", stateFilter), createFormGroup("조회 시작일", periodFrom), createFormGroup("조회 종료일", periodTo));
    const applyFilters = () => this.versionTable?.setData(this.versions.filter(version =>
      (!yearFilter.value || version.year === Number(yearFilter.value)) &&
      (!stateFilter.value || version.status === stateFilter.value) &&
      (!periodFrom.value || !version.effectiveTo || version.effectiveTo >= periodFrom.value) &&
      (!periodTo.value || version.effectiveFrom <= periodTo.value)));
    filters.addEventListener("input", applyFilters);
    filters.addEventListener("change", applyFilters);
    listSec.appendChild(filters);

    const tableWrap = el("div", "rates-table-wrap");
    this.versionTable = new DataTable<AllowanceRateVersion>({
      container: tableWrap,
      pageSize: 10,
      getRowId: (r) => r.id,
      searchPlaceholder: "버전 라벨, 상태 검색...",
      onRowSelect: (r) => {
        if (r) {
          this.selectVersion(r);
        }
      },
      columns: [
        { key: "versionLabel", label: "버전 라벨", sticky: true, sortable: true },
        { key: "year", label: "적용 연도", sortable: true, getValue: (r) => r.year },
        {
          key: "status",
          label: "상태",
          align: "center",
          render: (r) => renderStatusBadge(r.status)
        },
        { key: "effectiveFrom", label: "적용 시작일", sortable: true },
        { key: "effectiveTo", label: "적용 종료일", render: (r) => r.effectiveTo || "미지정" },
        { key: "changeReason", label: "변경 사유" }
      ]
    });
    this.versionTable.setData(this.versions);
    if (this.selectedVersion) {
      this.versionTable.setSelectedId(this.selectedVersion.id);
    }
    listSec.appendChild(tableWrap);
    wrap.appendChild(listSec);

    // 2. 하단: 5x3 매트릭스 편집기 및 영향도 분석
    const editorSec = el("div", "rates-section editor-section");
    editorSec.id = "rate-editor-section";
    wrap.appendChild(editorSec);

    const history = el("section", "rate-history-section");
    history.appendChild(el("h4", "section-title", "요율 변경 이력 (최근 40건)"));
    const historyContent = el("div", "rate-history-table");
    history.appendChild(historyContent);
    let historyTable: DataTable<AllowanceRateHistoryRecord> | undefined;
    if (this.historyError) historyContent.appendChild(el("div", "alert-danger", this.historyError));
    else {
      const actions: Record<string, string> = { registered: "등록", updated: "수정", applied: "활성 적용", deleted: "삭제" };
      historyTable = new DataTable<AllowanceRateHistoryRecord>({
        container: historyContent, pageSize: 10, getRowId: row => row.id,
        columns: [
          { key: "occurredAt", label: "변경 일시", width: "200px", render: row => {
            const date = new Date(row.occurredAt);
            const pad = (value: number) => String(value).padStart(2, "0");
            const time = el("time", "ops-rate-history-time", `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`);
            time.setAttribute("datetime", row.occurredAt);
            time.title = date.toLocaleString("ko-KR");
            return time;
          } },
          { key: "versionLabel", label: "요율 버전", sticky: true },
          { key: "actionType", label: "변경", render: row => actions[row.actionType] || row.actionType },
          { key: "reason", label: "변경 사유" }
        ]
      });
      historyTable.setData(this.history);
    }
    const versions = el("div", "ops-rate-version-panel"); versions.append(listSec, editorSec);
    const impact = el("section", "ops-rate-impact-panel");
    const impactSlot = el("div"); impactSlot.id = "rate-impact-slot";
    impact.append(el("p", "ops-area-guidance", "요율 버전에서 배율과 적용 기간을 편집한 뒤 아래 ‘영향도 비교 분석’을 누르세요. 저장된 계산 결과와 비교만 하며 실제 지급액이나 승인 이력을 변경하지 않습니다."), impactSlot);
    const context = el("span", "ops-menu-selection"); context.id = "ops-rate-current-label";
    this.workspace = new OperationsWorkspace(wrap, { id: "rates", initialArea: this.activeArea, context,
      areas: [
        { id: "versions", label: "요율 버전", hint: "버전 선택과 수당별 배율", icon: "percent", description: "버전을 선택하고 적용 기간·수당별 배율을 편집합니다. 저장 전 영향도를 확인하고, 활성 적용은 확인창에서 결정하세요.", content: versions },
        { id: "impact", label: "영향도 비교", hint: "적용 전 금액 영향 확인", icon: "compare_arrows", description: "편집 중인 요율을 저장된 계산 결과와 비교합니다. 비교 결과는 조회 전용이며 요율 저장이나 재계산을 실행하지 않습니다.", content: impact },
        { id: "history", label: "변경 이력", hint: "기존 변경 기록 조회", icon: "history", description: "등록·수정·활성 적용의 변경 사유와 일시를 확인합니다. 과거 승인 결과를 이 화면에서 덮어쓰지 않습니다.", content: history }
      ], footerText: "배율 편집 → 영향도 비교 → 변경 사유 확인 → 요율 버전 저장 순서로 진행하세요.", canChange: () => !this.isSaving && !this.isDestroyed });
    this.container.appendChild(wrap);
    this.renderEditor();
    this.workspace.observeTable(this.versionTable!, tableWrap);
    if (historyTable) this.workspace.observeTable(historyTable, historyContent);
  }

  private renderEditor(): void {
    const editorSec = document.getElementById("rate-editor-section");
    if (!editorSec || this.isDestroyed) return;
    editorSec.innerHTML = "";

    const titleBox = el("div", "editor-header");
    const vName = this.selectedVersion ? this.selectedVersion.versionLabel : "새 요율 버전";
    titleBox.appendChild(el("h4", "section-title", `수당별 배율: ${vName}`));
    const currentLabel = this.container.querySelector("#ops-rate-current-label");
    if (currentLabel) currentLabel.textContent = `선택 버전: ${vName}`;
    editorSec.appendChild(titleBox);

    // 폼 메타데이터 필드 (버전명, 연도, 상태, 적용기간, 사유)
    const metaGrid = el("div", "form-grid rate-meta-grid");

    const labelInput = el("input", "form-control") as HTMLInputElement;
    labelInput.id = "input-rate-version-label";
    labelInput.value = this.selectedVersion?.versionLabel || "";
    this.labelInputEl = labelInput;
    metaGrid.appendChild(createFormGroup("버전 라벨", labelInput));

    const yearInput = el("input", "form-control") as HTMLInputElement;
    yearInput.type = "number";
    yearInput.id = "input-rate-year";
    yearInput.value = String(this.selectedVersion?.year || new Date().getFullYear());
    this.yearInputEl = yearInput;
    metaGrid.appendChild(createFormGroup("적용 연도", yearInput));

    const statusSelect = el("select", "form-control") as HTMLSelectElement;
    statusSelect.id = "select-rate-status";
    ["draft", "active", "retired"].forEach((st) => {
      const opt = el("option", "", st === "active" ? "활성 (Active)" : st === "draft" ? "초안 (Draft)" : "만료 (Retired)") as HTMLOptionElement;
      opt.value = st;
      if (this.selectedVersion && this.selectedVersion.status === st) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    this.statusSelectEl = statusSelect;
    metaGrid.appendChild(createFormGroup("버전 상태", statusSelect));

    const fromInput = el("input", "form-control") as HTMLInputElement;
    fromInput.type = "date";
    fromInput.id = "input-rate-effective-from";
    fromInput.value = this.selectedVersion?.effectiveFrom || `${new Date().getFullYear()}-01-01`;
    this.fromInputEl = fromInput;
    metaGrid.appendChild(createFormGroup("적용 시작일", fromInput));

    const toInput = el("input", "form-control") as HTMLInputElement;
    toInput.type = "date";
    toInput.id = "input-rate-effective-to";
    toInput.value = this.selectedVersion?.effectiveTo || "";
    this.toInputEl = toInput;
    metaGrid.appendChild(createFormGroup("적용 종료일 (선택)", toInput));

    const reasonInput = el("input", "form-control") as HTMLInputElement;
    reasonInput.id = "input-rate-reason";
    reasonInput.value = this.selectedVersion?.changeReason || "";
    this.reasonInputEl = reasonInput;
    metaGrid.appendChild(createFormGroup("변경 사유", reasonInput));

    editorSec.appendChild(metaGrid);

    // 5x3 매트릭스 표
    const matrixBox = el("div", "matrix-container");
    const matrixTable = el("table", "table table-bordered rate-matrix-table");
    const thead = el("thead", "");
    const htr = el("tr", "");
    htr.appendChild(el("th", "matrix-th-cat", "수당 구분 (5종)"));
    allowanceRateAxisOrder.forEach((axis) => {
      htr.appendChild(el("th", "matrix-th-axis", `${allowanceRateAxisLabels[axis]} 배율`));
    });
    thead.appendChild(htr);
    matrixTable.appendChild(thead);

    const tbody = el("tbody", "");

    allowanceRateCategoryOrder.forEach((cat) => {
      const tr = el("tr", "");
      tr.appendChild(el("td", "matrix-td-cat", allowanceRateCategoryLabels[cat]));

      allowanceRateAxisOrder.forEach((axis) => {
        const td = el("td", "matrix-td-cell");
        const input = el("input", "form-control matrix-cell-input") as HTMLInputElement;
        input.type = "number";
        input.step = "0.1";
        input.min = "0";
        input.value = String(this.currentMatrix[cat]?.[axis] ?? 0);
        input.id = `input-rate-${cat}-${axis}`;
        input.addEventListener("input", () => {
          const val = parseFloat(input.value);
          this.currentMatrix[cat][axis] = input.value.trim() && Number.isFinite(val) ? val : NaN;
        });
        td.appendChild(input);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    matrixTable.appendChild(tbody);
    matrixBox.appendChild(matrixTable);
    editorSec.appendChild(matrixBox);

    // 버튼 영역: 영향도 비교 & 저장
    const actBar = el("div", "editor-actions-bar");
    const btnCompare = createButton("영향도 비교 분석", "secondary", () => this.handleCompareImpact(fromInput.value, toInput.value));
    btnCompare.id = "btn-rate-impact-preview";
    actBar.appendChild(btnCompare);

    const btnSave = createButton("요율 버전 저장", "primary", () => {
      this.handleSaveVersion({
        label: labelInput.value.trim(),
        year: parseInt(yearInput.value, 10),
        status: statusSelect.value as AllowanceRateVersion["status"],
        effectiveFrom: fromInput.value.trim(),
        effectiveTo: toInput.value.trim() || undefined,
        changeReason: reasonInput.value.trim()
      });
    });
    btnSave.id = "btn-save-rate-version";
    actBar.appendChild(btnSave);

    this.workspace?.actions.replaceChildren(actBar);

    // 영향도 분석 결과 컨테이너
    const impactContainer = el("div", "impact-preview-container");
    impactContainer.id = "rate-impact-container";
    this.container.querySelector("#rate-impact-slot")?.replaceChildren(impactContainer);
    const invalidateImpact = () => { this.impactRequestId++; impactContainer.replaceChildren(); };
    editorSec.addEventListener("input", invalidateImpact);
    editorSec.addEventListener("change", invalidateImpact);
    this.editorBaseline = this.editorSnapshot();
  }

  private handleNewVersion(): void {
    this.selectVersion(null);
  }

  private selectVersion(version: AllowanceRateVersion | null): void {
    if (version && version.id === this.selectedVersion?.id) return;
    const select = () => {
      if (this.isDestroyed) return;
      this.impactRequestId++;
      this.selectedVersion = version;
      this.currentMatrix = buildAllowanceRateTable(version);
      this.versionTable?.setSelectedId(version?.id ?? null);
      this.renderEditor();
    };
    if (this.isDirty()) {
      this.versionTable?.setSelectedId(this.selectedVersion?.id ?? null);
      showConfirm({ title: "저장되지 않은 요율 변경", message: "저장하지 않은 변경사항을 버리고 다른 버전을 편집하시겠습니까?", onConfirm: select });
    } else select();
  }

  private async handleCompareImpact(fromDate: string, toDate?: string): Promise<void> {
    this.workspace?.select("impact");
    const bridge = window.appBridge;
    const impactBox = document.getElementById("rate-impact-container");
    if (!impactBox || !bridge || this.isDestroyed) return;
    const impactId = ++this.impactRequestId;
    impactBox.innerHTML = "<div class='loading-spinner'>저장된 계산 결과와 대조하여 읽기 전용 영향도를 계산하는 중...</div>";

    const valResult = validateRateMatrix(this.currentMatrix);
    if (!valResult.isValid) {
      impactBox.innerHTML = `<div class='alert-danger'>매트릭스 오류: ${Object.values(valResult.errors)[0]}</div>`;
      return;
    }

    try {
      const operationGeneration2 = this.loadRequestId;
      if (this.isDestroyed) return;
      const res = await bridge.listCalculationResults();
      if (this.isDestroyed || this.loadRequestId !== operationGeneration2) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed) return;

      if (this.impactRequestId !== impactId) return;
      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        impactBox.replaceChildren(el("div", "alert-danger", formatErrorMessage(res, "계산 결과 조회 실패로 영향도를 분석할 수 없습니다. (0건 대체 금지)")));
        return;
      }

      if (!Array.isArray(res.data)) { impactBox.replaceChildren(el("div", "alert-danger", "영향도 조회 응답이 완전하지 않습니다. 다시 조회해 주세요.")); return; }

      if (this.impactRequestId !== impactId) return;

      // 후보 기간 필터링
      let filtered = res.data;
      if (fromDate) {
        filtered = filtered.filter((c) => c.workDate >= fromDate);
      }
      if (toDate) {
        filtered = filtered.filter((c) => c.workDate <= toDate);
      }

      const candidateItems = matrixToRateItems(this.currentMatrix);
      const preview = buildAllowanceRateImpactPreview(filtered, candidateItems as AllowanceRateItemSaveInput[]);

      impactBox.innerHTML = "";
      const card = el("div", "impact-result-card");
      card.appendChild(el("h5", "card-title", "요율 변경 영향도 분석 결과 (읽기 전용 비교)"));
      card.appendChild(
        el("p", "text-muted", "※ 저장된 계산 기준 비교이며 실제 승인 금액이 자동으로 변경되지 않습니다. (계산/재승인 실행 API 미호출)")
      );

      const summaryGrid = el("div", "impact-summary-grid");
      summaryGrid.appendChild(el("div", "summary-item", `분석 대상 건수: ${preview.calculationCount}건`));
      summaryGrid.appendChild(el("div", "summary-item", `기존 총액: ${preview.beforeAmount.toLocaleString()}원`));
      summaryGrid.appendChild(el("div", "summary-item", `적용 예상 총액: ${preview.afterAmount.toLocaleString()}원`));
      const deltaClass = preview.deltaAmount >= 0 ? "text-success" : "text-danger";
      summaryGrid.appendChild(el("div", `summary-item ${deltaClass}`, `차액: ${preview.deltaAmount > 0 ? "+" : ""}${preview.deltaAmount.toLocaleString()}원`));
      card.appendChild(summaryGrid);

      if (preview.zeroedPayWarningCount > 0) {
        const warn = el("div", "alert-warning");
        warn.appendChild(el("strong", "", `⚠️ 0배율 지급 주의: 총 ${preview.zeroedPayWarningCount}건에서 기존 수당이 0원으로 산출됩니다.`));
        card.appendChild(warn);
      }

      impactBox.appendChild(card);
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed) return;
      impactBox.replaceChildren(el("div", "alert-danger", `영향도 계산 오류: ${String(e)}`));
    }
  }

  private async handleSaveVersion(meta: {
    label: string;
    year: number;
    status: AllowanceRateVersion["status"];
    effectiveFrom: string;
    effectiveTo?: string;
    changeReason?: string;
  }): Promise<void> {
    const bridge = window.appBridge;
    if (!bridge || this.isDestroyed) return;

    if (!meta.label) {
      showNotice("입력 오류", "버전 라벨을 입력하세요.", "warning");
      return;
    }
    if (!isValidDateFormat(meta.effectiveFrom)) {
      showNotice("입력 오류", "유효한 적용 시작일(YYYY-MM-DD)을 입력하세요.", "warning");
      return;
    }

    const valResult = validateRateMatrix(this.currentMatrix);
    if (!valResult.isValid) {
      showNotice("매트릭스 오류", Object.values(valResult.errors)[0], "warning");
      return;
    }

    const doSave = async () => {
      if (this.isDestroyed || this.isSaving) return;
      this.isSaving = true;
      const items = matrixToRateItems(this.currentMatrix);
      try {
        const operationGeneration3 = this.loadRequestId;
        if (this.isDestroyed) return;
        const dialogRevision3 = sharedDialog.captureToken();
        const res = await bridge.saveAllowanceRateVersion({
          id: this.selectedVersion?.id,
          year: meta.year,
          versionLabel: meta.label,
          status: meta.status,
          effectiveFrom: meta.effectiveFrom,
          effectiveTo: meta.effectiveTo,
          changeReason: meta.changeReason,
          items: items as AllowanceRateItemSaveInput[]
        });
        if (this.isDestroyed || this.loadRequestId !== operationGeneration3 || sharedDialog.captureToken() !== dialogRevision3) return;
        if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }

        if (this.isDestroyed) return;

        if (res.ok && res.data) {
          showNotice("저장 완료", `요율 버전 '${meta.label}'이(가) 저장되었습니다.`, "info");
          await this.init();
        } else if (!res.ok) {
          if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
            this.onSessionExpired?.();
          }
          showNotice("저장 실패", formatErrorMessage(res, "요율 버전을 저장하지 못했습니다."), "error");
        }
      } catch (e) {
        if (this.isDestroyed) return;
        if (this.isDestroyed) return;
        showNotice("오류", String(e), "error");
      } finally { this.isSaving = false; }
    };

    if (meta.status === "active") {
      showConfirm({
        title: "활성 버전 설정 확인",
        message: `이 버전(${meta.label})을 '활성(Active)' 상태로 저장하시겠습니까?`,
        subMessage: "새 활성 버전이 저장되면 기존에 활성화되어 있던 다른 요율 버전은 자동으로 '만료(Retired)' 상태로 전환됩니다.",
        confirmLabel: "활성화 및 저장",
        variant: "primary",
        onConfirm: doSave
      });
    } else {
      await doSave();
    }
  }
}
