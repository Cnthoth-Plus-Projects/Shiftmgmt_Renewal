// 인력 관리 화면 메인 스크린 (WorkforceScreen)
import type { AuthSession } from "../../shared/domain/model";
import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  ShiftPatternRecord,
  SiteRecord,
  WageRateRecord
} from "../../shared/domain/model";
import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import type {
  EmployeeAssignmentCloseInput,
  EmployeeAssignmentInput,
  EmployeeAssignmentReorderInput,
  EmployeeUpsertInput,
  EmployeeWageRateInput,
  WorkforceWageBulkUpdateApplyInput,
  WorkforceWageBulkUpdatePreviewInput
} from "../../shared/bridge/contracts";
import { canPerformAction } from "../../shared/domain/authorization";
import { isBpEmploymentType } from "../../shared/domain/employment-type";
import {
  arePendingFileSetsEqual,
  calculatePendingPerformanceImpact,
  filterEmployees,
  sortEmployeesByWorksite
} from "./workforce-model";
import { WorkforceDialog } from "./workforce-dialog";
import { WorkforceList } from "./workforce-list";
import { WorkforceDetail } from "./workforce-detail";
import { WorkforceEmployeeForm } from "./workforce-employee-form";
import { WorkforceWage } from "./workforce-wage";
import { TeamMemberWithAssignment, WorkforceAssignment } from "./workforce-assignment";
import { WorkforceBulk } from "./workforce-bulk";

export interface WorkforceScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
  onNavigatePerformance?: () => void;
}

export class WorkforceScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;
  private onNavigatePerformance?: () => void;

  private dialog: WorkforceDialog;
  private workforceList: WorkforceList | null = null;
  private workforceDetail: WorkforceDetail | null = null;
  private employeeForm: WorkforceEmployeeForm | null = null;
  private wageManager: WorkforceWage | null = null;
  private assignmentManager: WorkforceAssignment | null = null;
  private bulkManager: WorkforceBulk | null = null;

  private allEmployees: EmployeeRecord[] = [];
  private sites: SiteRecord[] = [];
  private selectedEmployeeId: string | null = null;

  private generation = 0;
  private lifetime = 0;
  private isDestroyed = false;
  private isSessionExpiredTriggered = false; // UI01-D07: 만료 콜백 단 1회 보장

  constructor(options: WorkforceScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
    this.onNavigatePerformance = options.onNavigatePerformance;
    this.dialog = new WorkforceDialog();
  }

  public async render(): Promise<void> {
    this.isDestroyed = false;
    this.isSessionExpiredTriggered = false;
    this.lifetime++;
    this.generation++;
    const currentGen = this.generation;

    this.container.innerHTML = `
      <div class="workforce-container" id="workforce-root">
        <div class="workforce-loading-card" id="workforce-initial-loading">
          <span class="material-symbols-outlined workforce-icon-large" aria-hidden="true">sync</span>
          <div class="wf-text-lg">인력 관리 데이터를 불러오는 중입니다...</div>
        </div>
      </div>
    `;

    const canWrite = canPerformAction(this.session.role, "employee-write");
    const isAdmin = this.session.role === "admin";

    // 컴포넌트 인스턴스 초기화
    this.employeeForm = new WorkforceEmployeeForm({
      dialog: this.dialog,
      sites: this.sites,
      onSave: (input) => this.handleSaveEmployee(input),
      onDelete: (id) => this.handleDeleteEmployee(id),
      onSuccess: () => void this.reloadAllData(),
      onFetchShiftPatterns: (siteId) => this.handleFetchShiftPatterns(siteId)
    });

    this.wageManager = new WorkforceWage({
      dialog: this.dialog,
      onSaveWageRate: (input) => this.handleSaveWageRate(input),
      onCloseWageRate: (input) => this.handleCloseWageRate(input),
      onFetchPendingImpact: (code, from, to) => this.handleFetchPendingImpact(code, from, to),
      onNavigatePerformance: () => {
        if (this.onNavigatePerformance) {
          this.onNavigatePerformance();
        }
      },
      onSuccess: () => void this.reloadSelectedDetail()
    });

    this.assignmentManager = new WorkforceAssignment({
      dialog: this.dialog,
      sites: this.sites,
      onFetchShiftPatterns: (siteId) => this.handleFetchShiftPatterns(siteId),
      onFetchTeamMembers: (siteId, group) => this.handleFetchTeamMembers(siteId, group),
      onSaveAssignment: (input) => this.handleSaveAssignment(input),
      onCloseAssignment: (input) => this.handleCloseAssignment(input),
      onReorderAssignment: (input) => this.handleReorderAssignment(input),
      onSuccess: () => void this.reloadAllData()
    });

    this.bulkManager = new WorkforceBulk({
      dialog: this.dialog,
      isAdmin,
      canWrite,
      onSelectFile: () => this.handleSelectSpreadsheetFile(),
      onPreview: (input) => this.handlePreviewBulk(input),
      onApply: (input) => this.handleApplyBulk(input),
      onSuccess: () => void this.reloadAllData()
    });

    // 초기 데이터 로드 (인력 목록 및 근무지 목록)
    await this.loadInitialData(currentGen);
  }

  private async loadInitialData(gen: number): Promise<void> {
    const bridge = window.appBridge;
    if (!bridge) {
      this.renderError("브리지 연결을 찾을 수 없습니다.");
      return;
    }

    try {
      const [empRes, siteRes] = await Promise.all([
        bridge.listEmployees(),
        bridge.listSites()
      ]);

      if (this.isDestroyed || this.generation !== gen) return;

      this.checkSession(empRes);
      this.checkSession(siteRes);
      if (this.isSessionExpiredTriggered) return;

      if (!empRes.ok) {
        this.renderError(empRes.message || "인력 목록을 불러오지 못했습니다.");
        return;
      }
      if (!siteRes.ok) {
        this.renderError(siteRes.message || "근무지 목록을 불러오지 못했습니다.");
        return;
      }

      this.allEmployees = sortEmployeesByWorksite(empRes.data || []);
      this.sites = siteRes.data || [];
      this.employeeForm?.updateSites(this.sites);
      this.assignmentManager?.updateSites(this.sites);

      // 첫 번째 인력 선택
      if (this.allEmployees.length > 0 && !this.selectedEmployeeId) {
        this.selectedEmployeeId = this.allEmployees[0].id;
      }

      this.renderMainLayout();
    } catch (err) {
      if (this.isDestroyed || this.generation !== gen) return;
      this.renderError(err instanceof Error ? err.message : "초기 데이터 로딩 중 오류가 발생했습니다.");
    }
  }

  private renderMainLayout(): void {
    const root = this.container.querySelector<HTMLElement>("#workforce-root");
    if (!root) return;

    root.innerHTML = "";
    const summary = document.createElement("section");
    summary.className = "workforce-kpis";
    summary.id = "workforce-kpis";
    summary.setAttribute("aria-label", "인력 현황 요약");
    root.appendChild(summary);
    this.renderSummary();

    const canWrite = canPerformAction(this.session.role, "employee-write");
    const isAdmin = this.session.role === "admin";

    // 상단 및 테이블/상세 2열 래퍼
    const listWrapper = document.createElement("div");
    listWrapper.id = "workforce-list-container";
    root.appendChild(listWrapper);

    const contentGrid = document.createElement("div");
    contentGrid.className = "workforce-content-grid";

    const tableContainer = document.createElement("div");
    tableContainer.id = "workforce-table-area";
    contentGrid.appendChild(tableContainer);

    const detailContainer = document.createElement("div");
    detailContainer.id = "workforce-detail-area";
    detailContainer.setAttribute("aria-label", "선택한 인력의 상세 정보");
    contentGrid.appendChild(detailContainer);

    root.appendChild(contentGrid);

    // WorkforceList 렌더링
    this.workforceList = new WorkforceList({
      container: listWrapper,
      tableContainer,
      canWrite,
      isAdmin,
      onSelectEmployee: (empId) => void this.selectEmployee(empId),
      onOpenNewEmployeeModal: () => this.employeeForm?.openNewModal(),
      onOpenBulkModal: () => this.bulkManager?.openBulkModal(),
      onFilterChange: () => this.applyListFilter()
    });

    const filtered = filterEmployees(this.allEmployees, this.workforceList.getFilterState());
    if (!filtered.some(employee => employee.id === this.selectedEmployeeId)) this.selectedEmployeeId = filtered[0]?.id ?? null;
    this.workforceList.setData(filtered, this.sites, this.selectedEmployeeId, this.allEmployees);
    this.workforceList.render();

    // WorkforceDetail 렌더링 (UI01-D03: 시급 종료 모달 연결)
    this.workforceDetail = new WorkforceDetail({
      container: detailContainer,
      canWrite,
      isAdmin,
      onOpenEditModal: (emp) => this.employeeForm?.openEditModal(emp),
      onOpenWageModal: (emp, rates) => this.wageManager?.openWageModal(emp, rates),
      onOpenCloseWageModal: (emp, rate) => this.wageManager?.openCloseWageModal(emp, rate),
      onOpenAssignmentModal: (emp) => this.assignmentManager?.openAssignmentModal(emp),
      onOpenReorderModal: (emp, assigns) => this.assignmentManager?.openReorderModal(emp, assigns),
      onCloseAssignment: (assign) => this.assignmentManager?.openCloseAssignmentModal(assign),
      onDeleteEmployee: (emp) => this.employeeForm?.openDeleteModal(emp)
    });

    this.workforceDetail.render();

    if (this.selectedEmployeeId) {
      void this.selectEmployee(this.selectedEmployeeId);
    }
  }

  private applyListFilter(): void {
    if (!this.workforceList) return;
    const filterState = this.workforceList.getFilterState();
    const filtered = filterEmployees(this.allEmployees, filterState);
    const previousId = this.selectedEmployeeId;
    if (!filtered.some(e => e.id === this.selectedEmployeeId)) this.selectedEmployeeId = filtered[0]?.id ?? null;
    this.workforceList.setData(filtered, this.sites, this.selectedEmployeeId, this.allEmployees);
    this.workforceList.renderTableRows();
    this.renderSummary();
    if (previousId !== this.selectedEmployeeId) {
      if (this.selectedEmployeeId) void this.selectEmployee(this.selectedEmployeeId);
      else { this.workforceDetail?.setData(null, [], []); this.workforceDetail?.render(); }
    }

    // 카운트 라벨 업데이트
    const countLabel = this.container.querySelector<HTMLElement>("#workforce-count-label");
    if (countLabel) {
      countLabel.textContent = `전체 ${this.allEmployees.length}명 · 조건 일치 ${filtered.length}명`;
    }
  }

  private async selectEmployee(employeeId: string): Promise<void> {
    this.selectedEmployeeId = employeeId;
    this.workforceList?.setSelectedId(employeeId);

    const emp = this.allEmployees.find((e) => e.id === employeeId) || null;
    if (!emp) {
      this.workforceDetail?.setData(null);
      this.workforceDetail?.render();
      return;
    }

    this.workforceDetail?.setLoading(true);

    const gen = ++this.generation;
    const bridge = window.appBridge;
    if (!bridge) return;

    try {
      const [wageRes, assignRes] = await Promise.all([
        bridge.listEmployeeWageRates(employeeId),
        bridge.listEmployeeAssignments(employeeId)
      ]);

      if (this.isDestroyed || this.generation !== gen) return;

      this.checkSession(wageRes);
      this.checkSession(assignRes);
      if (this.isSessionExpiredTriggered) return;

      if (!wageRes.ok || !assignRes.ok) {
        // UI01-D07: 실패를 정상 빈 이력으로 덮지 않고 재시도 에러 표시
        const errMsg = !wageRes.ok
          ? wageRes.message
          : !assignRes.ok
            ? assignRes.message
            : "이력 정보를 불러오지 못했습니다.";
        this.workforceDetail?.setError(emp, errMsg, () => void this.selectEmployee(employeeId));
        this.workforceDetail?.render();
        return;
      }

      const wageRates = wageRes.data || [];
      const assignments = assignRes.data || [];

      this.workforceDetail?.setData(emp, wageRates, assignments);
      this.workforceDetail?.render();
    } catch (_err) {
      if (this.isDestroyed || this.generation !== gen) return;
      this.workforceDetail?.setError(
        emp,
        "이력 정보를 불러오는 중 오류가 발생했습니다.",
        () => void this.selectEmployee(employeeId)
      );
      this.workforceDetail?.render();
    }
  }

  private async reloadAllData(): Promise<void> {
    if (this.isDestroyed || this.isSessionExpiredTriggered) return;
    const bridge = window.appBridge;
    if (!bridge) return;
    const gen = ++this.generation;

    try {
      const [empRes, siteRes] = await Promise.all([
        bridge.listEmployees(),
        bridge.listSites()
      ]);

      if (this.isDestroyed || this.generation !== gen) return;

      this.checkSession(empRes);
      this.checkSession(siteRes);
      if (this.isSessionExpiredTriggered) return;

      if (empRes.ok) this.allEmployees = sortEmployeesByWorksite(empRes.data || []);
      if (siteRes.ok) this.sites = siteRes.data || [];

      this.employeeForm?.updateSites(this.sites);
      this.assignmentManager?.updateSites(this.sites);

      this.applyListFilter();

      if (this.selectedEmployeeId) {
        await this.selectEmployee(this.selectedEmployeeId);
      }
    } catch {
      // 재조회 실패 시 현재 상태 유지
    }
  }

  private async reloadSelectedDetail(): Promise<void> {
    if (this.selectedEmployeeId) {
      await this.selectEmployee(this.selectedEmployeeId);
    }
  }

  // --- API 브리지 핸들러들 ---

  private renderSummary(): void {
    const area = this.container.querySelector<HTMLElement>("#workforce-kpis");
    if (!area) return;
    area.replaceChildren();
    const active = this.allEmployees.filter(e => e.status === "active");
    const cards: Array<[string, number, string]> = [
      ["전체 인력", this.allEmployees.length, "검색 조건과 관계없는 전체 등록 인력"],
      ["재직", active.length, "재직 상태인 인력"],
      ["휴직", this.allEmployees.filter(e => e.status === "leave").length, "휴직 상태인 인력"],
      ["퇴사", this.allEmployees.filter(e => e.status === "retired").length, "퇴사 상태인 인력"],
      ["미배정 재직", active.filter(e => !e.currentSiteId).length, "현재 근무지 배정이 없는 재직 인력"],
      ["시급 확인 필요", active.filter(e => !isBpEmploymentType(e.employmentType) && e.currentHourlyRate === undefined).length, "최근 등록 시급 정보가 없는 재직 인력입니다. 상세 이력을 확인해 주세요."]
    ];
    for (const [label, count, help] of cards) { const card = document.createElement("div"); card.className = "workforce-kpi"; card.title = help; const title = document.createElement("span"); title.textContent = label; const value = document.createElement("strong"); value.textContent = `${count}명`; card.append(title, value); area.appendChild(card); }
  }

  private async handleSaveEmployee(input: EmployeeUpsertInput): Promise<{ ok: boolean; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.saveEmployee(input));
    this.checkSession(res);
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  }

  private async handleDeleteEmployee(id: string): Promise<{ ok: boolean; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.deleteEmployee({ employeeId: id }));
    this.checkSession(res);
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  }

  private async handleSaveWageRate(input: EmployeeWageRateInput): Promise<{ ok: boolean; record?: WageRateRecord; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.saveEmployeeWageRate(input));
    this.checkSession(res);
    return res.ok ? { ok: true, record: res.data } : { ok: false, message: res.message };
  }

  /** UI01-D03: 기존 시급 종료 계약 브리지 연결 */
  private async handleCloseWageRate(input: {
    employeeId: string;
    wageRateId: string;
    effectiveTo: string;
  }): Promise<{ ok: boolean; message?: string }> {
    const bridge = window.appBridge as unknown as {
      closeEmployeeWageRate?: (arg: { employeeId: string; wageRateId: string; effectiveTo: string }) => Promise<{ ok: boolean; message?: string; code?: string }>;
    };
    if (!bridge || typeof bridge.closeEmployeeWageRate !== "function") {
      return { ok: false, message: "시급 종료 API가 브리지에 연결되지 않았습니다." };
    }
    const closeWage = bridge.closeEmployeeWageRate;
    const res = await this.request(() => closeWage(input));
    this.checkSession(res);
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  }

  private async handleSaveAssignment(input: EmployeeAssignmentInput): Promise<{ ok: boolean; assignment?: EmployeeSiteAssignment; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.saveEmployeeAssignment(input));
    this.checkSession(res);
    return res.ok ? { ok: true, assignment: res.data } : { ok: false, message: res.message };
  }

  private async handleCloseAssignment(input: EmployeeAssignmentCloseInput): Promise<{ ok: boolean; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.closeEmployeeAssignment(input));
    this.checkSession(res);
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  }

  private async handleReorderAssignment(input: EmployeeAssignmentReorderInput): Promise<{ ok: boolean; assignments?: EmployeeSiteAssignment[]; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.reorderEmployeeAssignment(input));
    this.checkSession(res);
    return res.ok ? { ok: true, assignments: res.data } : { ok: false, message: res.message };
  }

  private async handleFetchShiftPatterns(siteId: string): Promise<{ ok: boolean; patterns?: ShiftPatternRecord[]; message?: string }> {
    const bridge = window.appBridge as unknown as {
      listShiftPatterns?: (siteId: string) => Promise<{ ok: boolean; data?: ShiftPatternRecord[]; message?: string; code?: string }>;
    };
    if (!bridge || typeof bridge.listShiftPatterns !== "function") {
      return { ok: false, message: "패턴 조회 API가 없습니다." };
    }
    const listPatterns = bridge.listShiftPatterns;
    const res = await this.request(() => listPatterns(siteId));
    this.checkSession(res);
    return res.ok ? { ok: true, patterns: res.data } : { ok: false, message: res.message };
  }

  /** UI01-D06: 조원별 실제 assignmentId 매핑 */
  private async handleFetchTeamMembers(siteId: string, shiftGroup: string): Promise<{ ok: boolean; members?: TeamMemberWithAssignment[]; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.listEmployees({ siteId, status: "active" }));
    this.checkSession(res);
    if (!res.ok) return { ok: false, message: res.message };

    const rawMembers = (res.data || []).filter((e) => e.currentShiftGroup === shiftGroup);

    // 각 조원의 활성 assignmentId 매핑
    const membersWithAssignments: TeamMemberWithAssignment[] = await Promise.all(
      rawMembers.map(async (m) => {
        try {
          const aRes = await this.request(() => bridge.listEmployeeAssignments(m.id));
          this.checkSession(aRes);
          if (aRes.ok && aRes.data) {
            const active = aRes.data.find(
              (a) => a.status === "active" && a.siteId === siteId && a.shiftGroup === shiftGroup
            );
            return { ...m, assignmentId: active?.id };
          }
        } catch {
          // ignore
        }
        return { ...m, assignmentId: undefined };
      })
    );

    return { ok: true, members: membersWithAssignments };
  }

  private async handleSelectSpreadsheetFile(): Promise<{ ok: boolean; filePath?: string; message?: string }> {
    const bridge = window.appBridge as unknown as {
      selectSpreadsheetFile?: () => Promise<{ ok: boolean; data?: { filePath?: string }; message?: string; code?: string }>;
    };
    if (!bridge || typeof bridge.selectSpreadsheetFile !== "function") {
      return { ok: false, message: "파일 선택 대화상자를 지원하지 않습니다." };
    }
    const selectFile = bridge.selectSpreadsheetFile;
    const res = await this.request(() => selectFile());
    this.checkSession(res);
    if (res.ok && res.data) {
      return { ok: true, filePath: res.data.filePath };
    }
    return { ok: false, message: res.ok ? "파일을 선택하지 않았습니다." : res.message };
  }

  private async handlePreviewBulk(input: WorkforceWageBulkUpdatePreviewInput) {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.previewWorkforceWageBulkUpdate(input));
    this.checkSession(res);
    return res.ok ? { ok: true, preview: res.data } : { ok: false, message: res.message };
  }

  private async handleApplyBulk(input: WorkforceWageBulkUpdateApplyInput) {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const res = await this.request(() => bridge.applyWorkforceWageBulkUpdate(input));
    this.checkSession(res);
    return res.ok ? { ok: true, summary: res.data } : { ok: false, message: res.message };
  }

  /** R08 & UI01-D04: 대기 실적 영향 건수 제한 병렬도 4로 전역 집계 조회 */
  private async handleFetchPendingImpact(
    employeeCode: string,
    effectiveFrom: string,
    effectiveTo?: string
  ): Promise<{ ok: boolean; count?: number; message?: string }> {
    const bridge = window.appBridge;
    if (!bridge) return { ok: false, message: "브리지 연결이 없습니다." };
    const modalToken = this.dialog.captureToken();
    const valid = () => this.dialog.isCurrent(modalToken);

    try {
      const initialFilesRes = await this.request(() => bridge.listPendingFiles(), valid);
      this.checkSession(initialFilesRes);
      if (!initialFilesRes.ok) {
        return { ok: false, message: initialFilesRes.message || "대기 실적 파일 목록 조회 실패" };
      }

      const initialFiles = initialFilesRes.data || [];

      // 제한 병렬도 4로 모든 파일의 entries 수집
      const allEntries: PerformanceEntryRecord[] = [];
      const concurrency = 4;

      for (let i = 0; i < initialFiles.length; i += concurrency) {
        const batch = initialFiles.slice(i, i + concurrency);
        const details = await Promise.all(
          batch.map(async (f) => {
            try {
              const dRes = await this.request(() => bridge.getPendingFileDetail(f.id), valid);
              this.checkSession(dRes);
              if (!dRes.ok || !dRes.data) return null;
              return dRes.data;
            } catch {
              return null;
            }
          })
        );

        for (const detail of details) {
          if (!detail || !detail.entries || detail.errorMessage) {
            return { ok: false, message: "대기 실적 파일 상세 정보를 읽지 못했습니다 (불완전 데이터)." };
          }
          allEntries.push(...detail.entries);
        }
      }

      // 처음/끝 파일 목록 집합 변화 감지
      const endFilesRes = await this.request(() => bridge.listPendingFiles(), valid);
      this.checkSession(endFilesRes);
      if (!endFilesRes.ok) {
        return { ok: false, message: "대기 실적 파일 목록 재확인 실패" };
      }

      const endFiles = endFilesRes.data || [];
      const initialFileIds = initialFiles.map((f) => f.id);
      const endFileIds = endFiles.map((f) => f.id);
      if (!arePendingFileSetsEqual(initialFileIds, endFileIds)) {
        return { ok: false, message: "대기 실적 파일 목록이 변경되었습니다. 다시 확인해 주세요." };
      }

      // 전역 단일 집합으로 logicalKey 중복 제거 및 유효성 계산
      const impactResult = calculatePendingPerformanceImpact(
        allEntries,
        employeeCode,
        effectiveFrom,
        effectiveTo
      );

      if (!impactResult.ok) {
        return { ok: false, message: impactResult.errorMessage || "대기 실적 영향 건수 계산 실패" };
      }

      return { ok: true, count: impactResult.count };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "대기 실적 조회 실패" };
    }
  }

  private async request<T extends { ok: boolean }>(action: () => Promise<T>, valid?: () => boolean): Promise<T> {
    const life = this.lifetime;
    const modalToken = this.dialog.isOpen() ? this.dialog.captureToken() : null;
    const current = valid ?? (() => modalToken === null || this.dialog.isCurrent(modalToken));
    const ignored = () => ({ ok: false, errorCode: "UI_REQUEST_IGNORED", message: "화면이 변경되어 이전 요청을 종료했습니다." } as unknown as T);
    if (this.isDestroyed || this.isSessionExpiredTriggered || !current()) return ignored();
    const result = await action();
    if (this.isDestroyed || life !== this.lifetime || !current()) return ignored();
    this.checkSession(result);
    return result;
  }

  /** UI01-D07: 세션 만료 시 단일 1회만 콜백 및 즉시 destroy */
  private checkSession(res: unknown): void {
    if (this.isDestroyed) return;
    if (!res || typeof res !== "object") return;
    const failure = res as { ok?: boolean; errorCode?: string; code?: string };
    const code = failure.errorCode || failure.code;
    if (code === "AUTH_SESSION_EXPIRED" || code === "AUTH_UNAUTHORIZED") {
      if (!this.isSessionExpiredTriggered) {
        this.isSessionExpiredTriggered = true;
        this.destroy();
        if (this.onSessionExpired) {
          this.onSessionExpired();
        }
      }
    }
  }

  private renderError(message: string): void {
    const root = this.container.querySelector<HTMLElement>("#workforce-root") || this.container;
    root.innerHTML = `
      <div class="workforce-error-card">
        <span class="material-symbols-outlined workforce-icon-large wf-icon-danger" aria-hidden="true">error</span>
        <div class="wf-text-lg wf-text-danger">데이터 로딩 실패</div>
        <div class="wf-text-sm">${this.escape(message)}</div>
        <button type="button" class="workforce-btn workforce-btn-secondary workforce-btn-sm wf-mt-10" id="btn-workforce-retry">다시 시도</button>
      </div>
    `;
    root.querySelector<HTMLButtonElement>("#btn-workforce-retry")?.addEventListener("click", () => {
      void this.render();
    });
  }

  public destroy(): void {
    this.lifetime++;
    this.isDestroyed = true;
    this.generation++;
    this.dialog.close();
    this.workforceList?.destroy();
    this.workforceDetail?.destroy();
    this.workforceList = null;
    this.workforceDetail = null;
    this.employeeForm = null;
    this.wageManager = null;
    this.assignmentManager = null;
    this.bulkManager = null;
    this.container.innerHTML = "";
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
