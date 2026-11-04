// 인력 관리 화면: 우측 상세 패널 (E2), 시급/배정 이력 표시
import { appendEmploymentPanel, type RehireMode } from "./workforce-rehire-view";
import { assignmentEmploymentBounds } from "../../shared/domain/employee-employment";
import { employeeStatusLabel } from "./workforce-model";
import { createEmployeeHireDateGuidance } from "./employee-hire-date-review";
import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  WageRateRecord
} from "../../shared/domain/model";
import {
  calculateEffectiveWageRates,
  canDeleteEmployee,
  formatCurrency,
  formatEmployeeRank,
  getSeoulTodayDateString,
  isBpEmploymentType
} from "./workforce-model";

export interface WorkforceDetailOptions {
  container: HTMLElement;
  canWrite: boolean;
  isAdmin: boolean;
  onOpenEditModal: (employee: EmployeeRecord) => void;
  onOpenRehire?: (employee:EmployeeRecord,mode:RehireMode)=>void;
  onOpenWageModal: (employee: EmployeeRecord, existingRates: WageRateRecord[]) => void;
  onOpenWageRevision?: (employee: EmployeeRecord, rate: WageRateRecord) => void;
  onOpenCloseWageModal?: (employee: EmployeeRecord, rate: WageRateRecord) => void;
  onOpenAssignmentModal: (employee: EmployeeRecord) => void;
  onOpenReorderModal: (employee: EmployeeRecord, assignments: EmployeeSiteAssignment[]) => void;
  onCloseAssignment: (assignment: EmployeeSiteAssignment) => void;
  onDeleteEmployee: (employee: EmployeeRecord) => void;
  onClosePanel?: () => void;
}

export class WorkforceDetail {
  private container: HTMLElement;
  private canWrite: boolean;
  private isAdmin: boolean;
  private onOpenEditModal: (employee: EmployeeRecord) => void;
  private onOpenRehire?: (employee:EmployeeRecord,mode:RehireMode)=>void;
  private onOpenWageModal: (employee: EmployeeRecord, existingRates: WageRateRecord[]) => void;
  private onOpenWageRevision?: (employee: EmployeeRecord, rate: WageRateRecord) => void;
  private onOpenCloseWageModal?: (employee: EmployeeRecord, rate: WageRateRecord) => void;
  private onOpenAssignmentModal: (employee: EmployeeRecord) => void;
  private onOpenReorderModal: (employee: EmployeeRecord, assignments: EmployeeSiteAssignment[]) => void;
  private onCloseAssignment: (assignment: EmployeeSiteAssignment) => void;
  private onDeleteEmployee: (employee: EmployeeRecord) => void;
  private onClosePanel?: () => void;

  private currentEmployee: EmployeeRecord | null = null;
  private wageRates: WageRateRecord[] = [];
  private assignments: EmployeeSiteAssignment[] = [];
  private hasError = false;
  private errorMessage = "";
  private retryCallback: (() => void) | null = null;
  private todayStr: string;

  constructor(options: WorkforceDetailOptions) {
    this.container = options.container;
    this.canWrite = options.canWrite;
    this.isAdmin = options.isAdmin;
    this.onOpenEditModal = options.onOpenEditModal;
    this.onOpenRehire = options.onOpenRehire;
    this.onOpenWageModal = options.onOpenWageModal;
    this.onOpenWageRevision = options.onOpenWageRevision;
    this.onOpenCloseWageModal = options.onOpenCloseWageModal;
    this.onOpenAssignmentModal = options.onOpenAssignmentModal;
    this.onOpenReorderModal = options.onOpenReorderModal;
    this.onCloseAssignment = options.onCloseAssignment;
    this.onDeleteEmployee = options.onDeleteEmployee;
    this.onClosePanel = options.onClosePanel;
    this.todayStr = getSeoulTodayDateString();
  }

  public setData(
    employee: EmployeeRecord | null,
    wageRates: WageRateRecord[] = [],
    assignments: EmployeeSiteAssignment[] = []
  ): void {
    this.currentEmployee = employee;
    this.wageRates = wageRates;
    this.assignments = assignments;
    this.hasError = false;
    this.errorMessage = "";
    this.retryCallback = null;
  }

  /** UI01-D07: 상세 정보 로딩 실패 상태 설정 (정상 빈 이력과 실패를 명확히 구분) */
  public setError(employee: EmployeeRecord, message: string, onRetry?: () => void): void {
    this.currentEmployee = employee;
    this.wageRates = [];
    this.assignments = [];
    this.hasError = true;
    this.errorMessage = message;
    this.retryCallback = onRetry || null;
  }

  public setLoading(loading: boolean): void {
    if (loading) {
      this.hasError = false;
    }
  }

  public render(): void {
    this.todayStr = getSeoulTodayDateString();
    this.container.innerHTML = "";

    if (!this.currentEmployee) {
      const emptyPanel = document.createElement("div");
      emptyPanel.className = "workforce-detail-panel wf-center wf-min-h-400";
      emptyPanel.innerHTML = `
        <span class="material-symbols-outlined workforce-icon-large" aria-hidden="true">person_search</span>
        <div class="wf-text-md wf-text-muted">목록에서 인력을 선택하면 상세 정보가 표시됩니다.</div>
      `;
      this.container.appendChild(emptyPanel);
      return;
    }

    const emp = this.currentEmployee;
    const isBp = isBpEmploymentType(emp.employmentType);
    const empTypeLabel = isBp ? "BP(외부인력)" : emp.employmentType || "정규직";
    this.todayStr=getSeoulTodayDateString();
    const statusLabel = employeeStatusLabel(emp);

    const panel = document.createElement("div");
    panel.className = "workforce-detail-panel";
    panel.id = "workforce-detail-panel";

    // 1. 헤더: 이름, 사번, 기본 메타, 닫기 버튼
    const header = document.createElement("div");
    header.className = "workforce-detail-header";

    const titleArea = document.createElement("div");

    const nameTitle = document.createElement("div");
    nameTitle.className = "workforce-detail-title";
    nameTitle.id = "e2-detail-title";
    nameTitle.tabIndex = -1;
    nameTitle.innerHTML = `
      <span>${this.escape(emp.name)}</span>
      <span class="wf-code-bracket">(${this.escape(emp.employeeCode || "-")})</span>
    `;

    const subInfo = document.createElement("div");
    subInfo.className = "workforce-detail-sub";
    subInfo.textContent = `${formatEmployeeRank(emp.rank)} · ${empTypeLabel} · ${statusLabel} · 등록 입사일 ${emp.hireDate || "미입력"}`;

    titleArea.appendChild(nameTitle);
    titleArea.appendChild(subInfo);
    const contactInfo = document.createElement("div");
    contactInfo.className = "workforce-detail-sub";
    contactInfo.textContent = `연락처 ${emp.contact || "미등록"} · 이메일 ${emp.email || "미등록"}`;
    titleArea.appendChild(contactInfo);
    header.appendChild(titleArea);

    if (this.onClosePanel) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "workforce-btn workforce-btn-ghost";
      closeBtn.setAttribute("aria-label", "패널 닫기");
      closeBtn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">close</span>`;
      closeBtn.addEventListener("click", () => this.onClosePanel?.());
      header.appendChild(closeBtn);
    }

    panel.appendChild(header);

    // 기본정보 수정 버튼 바
    const editBtnBar = document.createElement("div");
    editBtnBar.className = "wf-flex-between";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.id = "btn-edit-employee";
    editBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm";
    editBtn.innerHTML = `<span class="material-symbols-outlined wf-icon-16" aria-hidden="true">edit</span><span>기본정보 수정</span>`;
    if (!this.canWrite) {
      editBtn.disabled = true;
      editBtn.title = "기획자 또는 관리자 권한이 필요합니다.";
    }
    editBtn.addEventListener("click", () => {
      if (this.canWrite) this.onOpenEditModal(emp);
    });
    editBtnBar.appendChild(editBtn);
    panel.appendChild(editBtnBar);
    appendEmploymentPanel(panel,emp,this.canWrite,this.onOpenRehire);
    panel.appendChild(createEmployeeHireDateGuidance(emp.hireDate,Boolean(emp.employmentPeriods)));

    // UI01-D07: 상세 이력 조회 실패 상태 처리 (재시도 UI 노출)
    if (this.hasError) {
      const errBox = document.createElement("div");
      errBox.className = "workforce-error-card wf-mt-10";
      errBox.innerHTML = `
        <span class="material-symbols-outlined workforce-icon-large wf-icon-danger" aria-hidden="true">error</span>
        <div class="wf-text-lg wf-text-danger">상세 이력 조회 실패</div>
        <div class="wf-text-sm">${this.escape(this.errorMessage || "이력 정보를 불러오지 못했습니다.")}</div>
        <button type="button" class="workforce-btn workforce-btn-secondary workforce-btn-sm wf-mt-10" id="btn-detail-retry">다시 시도</button>
      `;
      if (this.retryCallback) {
        errBox.querySelector<HTMLButtonElement>("#btn-detail-retry")?.addEventListener("click", () => {
          this.retryCallback?.();
        });
      }
      panel.appendChild(errBox);
      this.container.appendChild(panel);
      return;
    }

    // 2. 시급 이력 섹션 (BP는 시급 없음)
    const wageSection = document.createElement("div");
    wageSection.className = "workforce-section";

    const wageHeader = document.createElement("div");
    wageHeader.className = "workforce-section-header";

    const wageTitle = document.createElement("div");
    wageTitle.className = "workforce-section-title";
    wageTitle.textContent = "시급 이력";

    const wageRegisterBtn = document.createElement("button");
    wageRegisterBtn.type = "button";
    wageRegisterBtn.id = "btn-open-e3";
    wageRegisterBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm";
    wageRegisterBtn.textContent = "시급 등록";

    if (isBp) {
      wageRegisterBtn.disabled = true;
      wageRegisterBtn.title = "BP(외부인력)는 시급을 등록하지 않습니다.";
    } else if (!this.canWrite) {
      wageRegisterBtn.disabled = true;
      wageRegisterBtn.title = "기획자 또는 관리자 권한이 필요합니다.";
    }

    wageRegisterBtn.addEventListener("click", () => {
      if (this.canWrite && !isBp) {
        this.onOpenWageModal(emp, this.wageRates);
      }
    });

    wageHeader.appendChild(wageTitle);
    wageHeader.appendChild(wageRegisterBtn);
    wageSection.appendChild(wageHeader);

    if (isBp) {
      const bpNotice = document.createElement("div");
      bpNotice.className = "workforce-rate-box wf-text-muted";
      bpNotice.textContent = "BP(외부인력)는 시급 관리 대상이 아닙니다.";
      wageSection.appendChild(bpNotice);
    } else {
      const wageAsOfDate = emp.currentHourlyRateAsOfDate ?? this.todayStr;
      const rateSummary = calculateEffectiveWageRates(this.wageRates, wageAsOfDate);

      const rateBox = document.createElement("div");
      rateBox.className = "workforce-rate-box";

      const currentRateLabel = rateSummary.currentRate
        ? formatCurrency(rateSummary.currentRate.hourlyRate)
        : "적용 중인 시급 없음";

      rateBox.innerHTML = `
        <span class="wf-text-sm">현재 시급 (${wageAsOfDate} 기준)</span>
        <strong class="wf-text-lg" id="e2-current-rate">${currentRateLabel}</strong>
      `;
      wageSection.appendChild(rateBox);
      if (rateSummary.currentRate) {
        const period = document.createElement("div");
        period.className = "wf-text-sm wf-text-muted";
        period.id = "e2-current-rate-period";
        period.textContent = `적용 기간: ${rateSummary.currentRate.effectiveFrom} ~ ${rateSummary.currentRate.effectiveTo ?? "계속"}`;
        wageSection.appendChild(period);
      }

      // 미래 적용 예정 시급 안내
      if (rateSummary.scheduledRate) {
        const scheduledDiv = document.createElement("div");
        scheduledDiv.className = "workforce-scheduled-rate-text";
        scheduledDiv.id = "e2-scheduled-rate";
        scheduledDiv.textContent = `${rateSummary.scheduledRate.effectiveFrom}부터 ${formatCurrency(rateSummary.scheduledRate.hourlyRate)} 적용 예정`;
        wageSection.appendChild(scheduledDiv);
      }

      // 시급 이력 테이블 (UI01-D03: 유효 시급 종료 액션 버튼 포함)
      const wageTable = document.createElement("table");
      wageTable.className = "workforce-history-table";
      wageTable.id = "e2-wage-history";

      wageTable.innerHTML = `
        <thead>
          <tr>
            <th scope="col">시급</th>
            <th scope="col">적용 기간</th>
            <th scope="col">구분</th>
            <th scope="col">관리</th>
          </tr>
        </thead>
      `;

      const wageTbody = document.createElement("tbody");
      if (rateSummary.rates.length === 0) {
        wageTbody.innerHTML = `<tr><td colspan="4" class="wf-text-center wf-text-muted">등록된 시급 이력이 없습니다.</td></tr>`;
      } else {
        for (const wr of rateSummary.rates) {
          const reservationControlled = wr.employmentPeriodCancelled || Boolean(emp.scheduledRehire && wr.employmentPeriodId===emp.scheduledRehire.periodId);
          const retirementExcluded = Boolean(wr.employmentPeriodCancelled || wr.retirementDate && wr.effectiveFrom >= wr.retirementDate);
          const isScheduled = !wr.invalidation && !retirementExcluded && wr.effectiveFrom > wageAsOfDate;
          const isCurrent =
            rateSummary.currentRate?.id === wr.id;
          const typeLabel = wr.employmentPeriodCancelled ? "취소한 예약 · 미적용" : wr.invalidation ? "무효" : retirementExcluded ? "퇴사로 적용 제외" : isScheduled ? "적용 예정" : isCurrent ? "현재" : "과거";
          const rowClass = isCurrent ? "workforce-rate-current" : isScheduled ? "workforce-rate-scheduled" : "workforce-rate-past";

          const isOpenRate = !wr.effectiveTo || wr.effectiveTo >= this.todayStr;

          const tr = document.createElement("tr");
          tr.className = rowClass;
          tr.dataset.wageRateId = wr.id;

          const tdRate = document.createElement("td");
          tdRate.textContent = formatCurrency(wr.hourlyRate);

          const tdPeriod = document.createElement("td");
          tdPeriod.textContent = `${wr.effectiveFrom} ~ ${wr.effectiveTo || ""}`;

          const tdType = document.createElement("td");
          tdType.textContent = typeLabel;


          const tdAction = document.createElement("td");
          if (!reservationControlled && !wr.invalidation && isOpenRate && this.canWrite && this.onOpenCloseWageModal) {
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm btn-close-wage";
            closeBtn.textContent = "시급 적용 종료";
            closeBtn.title = "퇴사·업무 종료로 이 시급의 적용을 끝낼 때 사용합니다. 금액 변경은 위의 시급 등록을 이용하세요.";
            closeBtn.addEventListener("click", () => {
              this.onOpenCloseWageModal?.(emp, wr);
            });
            tdAction.appendChild(closeBtn);
          } else {
            tdAction.textContent = "-";
          }

          if (!reservationControlled && !wr.invalidation && this.canWrite && this.onOpenWageRevision) {
            if (tdAction.textContent === "-") tdAction.textContent = "";
            const revise = document.createElement("button"); revise.type = "button";
            revise.className = "workforce-btn workforce-btn-secondary workforce-btn-sm btn-revise-wage";
            revise.textContent = "정정·무효";
            revise.addEventListener("click", () => this.onOpenWageRevision?.(emp, wr)); tdAction.appendChild(revise);
          }
          tr.appendChild(tdRate);
          tr.appendChild(tdPeriod);
          tr.appendChild(tdType);
          tr.appendChild(tdAction);
          wageTbody.appendChild(tr);
          if(retirementExcluded) {
            const info=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=4;cell.style.whiteSpace="normal";cell.className="wf-text-xs wf-text-muted";
            cell.textContent=`퇴사일 ${wr.retirementDate} 이후 시작하는 예정 이력은 원본을 보존하고 적용에서 제외합니다.`;info.appendChild(cell);wageTbody.appendChild(info);
          }
          if (wr.invalidation) {
            const info = document.createElement("tr"); info.dataset.wageInvalidationId = wr.id;
            const cell = document.createElement("td"); cell.colSpan = 4; cell.className = "wf-text-xs wf-text-muted";
            cell.style.whiteSpace = "normal";
            cell.textContent = `무효 사유: ${wr.invalidation.changeReason} · ${wr.invalidation.actorDisplayName} (${wr.invalidation.actorLoginId}) · ${new Date(wr.invalidation.occurredAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
            info.appendChild(cell); wageTbody.appendChild(info);
          }
        }
      }
      wageTable.appendChild(wageTbody);
      wageSection.appendChild(wageTable);

      const preserved = this.wageRates.flatMap(rate => rate.history ?? []);
      if (preserved.length > 0) {
        const details = document.createElement("details");
        details.id = "e2-wage-corrections";
        const summary = document.createElement("summary");
        summary.textContent = `보존된 시급 정정 이력 ${preserved.length}건`;
        details.appendChild(summary);
        const table = document.createElement("table");
        table.className = "workforce-history-table";
        table.id = "e2-wage-correction-history";
        table.innerHTML = '<thead><tr><th scope="col">이전 시급·적용 기간</th><th scope="col">이전 사유·변경 기록</th></tr></thead>';
        const body = document.createElement("tbody");
        for (const history of preserved) {
          const tr = document.createElement("tr");
          tr.dataset.historyId = history.id;
          const amount = document.createElement("td");
          const value = document.createElement("strong");
          value.textContent = formatCurrency(history.hourlyRate);
          const period = document.createElement("div");
          period.textContent = `${history.effectiveFrom} ~ ${history.effectiveTo ?? ""}`;
          amount.append(value, period);
          const note = document.createElement("td");
          const reason = document.createElement("div");
          reason.textContent = `${history.changeReason} · 이전 사유: ${history.reason || "없음"}`;
          const actor = document.createElement("div");
          actor.className = "wf-text-muted";
          actor.textContent = `${history.actorDisplayName} (${history.actorLoginId})`;
          const time = document.createElement("div");
          time.className = "wf-text-muted";
          const date = new Date(history.occurredAt);
          time.textContent = Number.isNaN(date.getTime()) ? "변경 시각 확인 필요" : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
          note.append(reason, actor, time);
          tr.append(amount, note); body.appendChild(tr);
        }
        table.appendChild(body); details.appendChild(table); wageSection.appendChild(details);
      }
    }

    panel.appendChild(wageSection);

    // 3. 배정 이력 섹션
    const assignSection = document.createElement("div");
    assignSection.className = "workforce-section";

    const assignHeader = document.createElement("div");
    assignHeader.className = "workforce-section-header";

    const assignTitle = document.createElement("div");
    assignTitle.className = "workforce-section-title";
    assignTitle.textContent = "근무지 및 조 배정";

    const assignBtnGroup = document.createElement("div");
    assignBtnGroup.className = "wf-flex-row wf-gap-6";

    const reorderBtn = document.createElement("button");
    reorderBtn.type = "button";
    reorderBtn.id = "btn-open-e5";
    reorderBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm";
    reorderBtn.textContent = "조 순서 변경";
    if (!this.canWrite || !emp.currentSiteId || !emp.currentShiftGroup) {
      reorderBtn.disabled = true;
      reorderBtn.title = !this.canWrite ? "기획자 또는 관리자 권한이 필요합니다." : "현재 배정된 조가 없습니다.";
    }
    reorderBtn.addEventListener("click", () => {
      if (this.canWrite) this.onOpenReorderModal(emp, this.assignments);
    });
    assignBtnGroup.appendChild(reorderBtn);

    const assignBtn = document.createElement("button");
    assignBtn.type = "button";
    assignBtn.id = "btn-open-e4";
    assignBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm";
    assignBtn.textContent = "배정";
    if (!this.canWrite) {
      assignBtn.disabled = true;
      assignBtn.title = "기획자 또는 관리자 권한이 필요합니다.";
    }
    assignBtn.addEventListener("click", () => {
      if (this.canWrite) this.onOpenAssignmentModal(emp);
    });
    assignBtnGroup.appendChild(assignBtn);

    assignHeader.appendChild(assignTitle);
    assignHeader.appendChild(assignBtnGroup);
    assignSection.appendChild(assignHeader);

    // 현재 배정 박스
    const currentAssignment = this.assignments.find((a) => {const bounds=assignmentEmploymentBounds(a);return a.status === "active"&&!bounds.excluded&&(emp.employmentPeriods||emp.status==="retired"?bounds.startDate<=this.todayStr&&(!bounds.endDate||this.todayStr<bounds.endDate):true);}) || null;
    const assignBox = document.createElement("div");
    assignBox.className = "workforce-rate-box wf-flex-col wf-gap-4";

    if (currentAssignment) {
      assignBox.innerHTML = `
        <div class="wf-flex-between">
          <strong>${this.escape(currentAssignment.siteName || emp.currentSiteName || "-")} · ${this.escape(currentAssignment.shiftGroup || emp.currentShiftGroup || "-")}</strong>
          <span class="workforce-status-badge workforce-status-active">현재 배정</span>
        </div>
        <div class="wf-text-sm">배정 시작일: ${currentAssignment.startDate} ~ ${currentAssignment.endDate || ""}</div>
      `;
    } else {
      assignBox.innerHTML = `
        <div class="wf-text-md wf-text-muted">현재 배정된 근무지가 없습니다.</div>
      `;
    }
    assignSection.appendChild(assignBox);

    // 배정 이력 테이블
    const assignTable = document.createElement("table");
    assignTable.className = "workforce-history-table";
    assignTable.id = "e4-assignment-history";
    assignTable.innerHTML = `
      <thead>
        <tr>
          <th scope="col">근무지</th>
          <th scope="col">조</th>
          <th scope="col">적용 기간</th>
          <th scope="col">상태</th>
        </tr>
      </thead>
    `;

    const assignTbody = document.createElement("tbody");
    if (this.assignments.length === 0) {
      assignTbody.innerHTML = `<tr><td colspan="4" class="wf-text-center wf-text-muted">배정 이력이 없습니다.</td></tr>`;
    } else {
      for (const a of this.assignments) {
        const tr = document.createElement("tr");
        const bounds=assignmentEmploymentBounds(a);
        const isCurrent = a.status === "active"&&!bounds.excluded&&bounds.startDate<=this.todayStr&&(!bounds.endDate||this.todayStr<bounds.endDate);
        tr.className = isCurrent ? "wf-text-lg" : "wf-text-muted";
        tr.innerHTML = `
          <td>${this.escape(a.siteName || "-")}</td>
          <td>${this.escape(a.shiftGroup || "-")}</td>
          <td>${a.startDate} ~ ${a.endDate || ""}</td>
          <td>${a.employmentPeriodCancelled ? "취소한 예약 · 미적용" : bounds.excluded ? "퇴사로 적용 제외" : a.startDate>this.todayStr ? "예정" : isCurrent ? "현재" : "종료"}</td>
        `;
        assignTbody.appendChild(tr);
      }
    }
    assignTable.appendChild(assignTbody);
    assignSection.appendChild(assignTable);

    panel.appendChild(assignSection);

    // 4. 하단 액션 버튼들 (배정 해지, 인력 삭제)
    const footerActions = document.createElement("div");
    footerActions.className = "workforce-detail-actions wf-flex-row";

    // 배정 해지 버튼
    const closeAssignBtn = document.createElement("button");
    closeAssignBtn.type = "button";
    closeAssignBtn.id = "btn-close-assignment";
    closeAssignBtn.className = "workforce-btn workforce-btn-secondary workforce-btn-sm wf-flex-1";
    closeAssignBtn.textContent = "배정 해제";

    if (!this.canWrite || !currentAssignment) {
      closeAssignBtn.disabled = true;
      closeAssignBtn.title = !this.canWrite ? "기획자 또는 관리자 권한이 필요합니다." : "현재 활성 배정이 없습니다.";
    }

    closeAssignBtn.addEventListener("click", () => {
      if (this.canWrite && currentAssignment) {
        this.onCloseAssignment(currentAssignment);
      }
    });
    footerActions.appendChild(closeAssignBtn);

    // 인력 삭제 버튼 (R11)
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.id = "btn-delete-employee";
    deleteBtn.className = "workforce-btn workforce-btn-danger workforce-btn-sm wf-flex-1";
    deleteBtn.textContent = "인력 삭제";

    const deleteCheck = canDeleteEmployee(emp, this.todayStr);
    if (!this.canWrite) {
      deleteBtn.disabled = true;
      deleteBtn.title = "기획자 또는 관리자 권한이 필요합니다.";
    } else if (!deleteCheck.canDelete) {
      deleteBtn.disabled = true;
      deleteBtn.title = deleteCheck.reason || "퇴사일이 지난 퇴사자만 삭제할 수 있습니다.";
    }

    deleteBtn.addEventListener("click", () => {
      if (this.canWrite && deleteCheck.canDelete) {
        this.onDeleteEmployee(emp);
      }
    });
    footerActions.appendChild(deleteBtn);

    panel.appendChild(footerActions);
    this.container.appendChild(panel);
  }

  public destroy(): void {
    this.container.innerHTML = "";
    this.retryCallback = null;
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
