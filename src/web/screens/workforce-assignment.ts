import { resolveShiftPatternForDate } from "../../shared/domain/shift-pattern-version";
// 인력 관리 화면: 근무지 및 조 배정 (E4), 배정 해지, 조 안 순서 변경 (E5) 모달
import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  ShiftPatternRecord,
  SiteRecord
} from "../../shared/domain/model";
import type {
  EmployeeAssignmentCloseInput,
  EmployeeAssignmentInput,
  EmployeeAssignmentReorderInput
} from "../../shared/bridge/contracts";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import { getSeoulTodayDateString, isValidDateString } from "./workforce-model";
import { WorkforceDialog } from "./workforce-dialog";

export type TeamMemberWithAssignment = EmployeeRecord & { assignmentId?: string };

export interface WorkforceAssignmentOptions {
  dialog: WorkforceDialog;
  sites: SiteRecord[];
  onFetchShiftPatterns: (siteId: string) => Promise<{ ok: boolean; patterns?: ShiftPatternRecord[]; message?: string }>;
  onFetchTeamMembers: (siteId: string, shiftGroup: string) => Promise<{ ok: boolean; members?: TeamMemberWithAssignment[]; message?: string }>;
  onSaveAssignment: (input: EmployeeAssignmentInput) => Promise<{ ok: boolean; assignment?: EmployeeSiteAssignment; message?: string }>;
  onCloseAssignment: (input: EmployeeAssignmentCloseInput) => Promise<{ ok: boolean; message?: string }>;
  onReorderAssignment: (input: EmployeeAssignmentReorderInput) => Promise<{ ok: boolean; assignments?: EmployeeSiteAssignment[]; message?: string }>;
  onSuccess: () => void;
}

export class WorkforceAssignment {
  private dialog: WorkforceDialog;
  private sites: SiteRecord[];
  private onFetchShiftPatterns: (siteId: string) => Promise<{ ok: boolean; patterns?: ShiftPatternRecord[]; message?: string }>;
  private onFetchTeamMembers: (siteId: string, shiftGroup: string) => Promise<{ ok: boolean; members?: TeamMemberWithAssignment[]; message?: string }>;
  private onSaveAssignment: (input: EmployeeAssignmentInput) => Promise<{ ok: boolean; assignment?: EmployeeSiteAssignment; message?: string }>;
  private onCloseAssignment: (input: EmployeeAssignmentCloseInput) => Promise<{ ok: boolean; message?: string }>;
  private onReorderAssignment: (input: EmployeeAssignmentReorderInput) => Promise<{ ok: boolean; assignments?: EmployeeSiteAssignment[]; message?: string }>;
  private onSuccess: () => void;
  private todayStr: string;

  constructor(options: WorkforceAssignmentOptions) {
    this.dialog = options.dialog;
    this.sites = options.sites;
    this.onFetchShiftPatterns = options.onFetchShiftPatterns;
    this.onFetchTeamMembers = options.onFetchTeamMembers;
    this.onSaveAssignment = options.onSaveAssignment;
    this.onCloseAssignment = options.onCloseAssignment;
    this.onReorderAssignment = options.onReorderAssignment;
    this.onSuccess = options.onSuccess;
    this.todayStr = getSeoulTodayDateString();
  }

  public updateSites(sites: SiteRecord[]): void {
    this.sites = sites;
  }

  /** E4 근무지 및 조 배정 모달 열기 */
  public openAssignmentModal(emp: EmployeeRecord, triggerBtn?: HTMLElement | null): void {
    const container = document.createElement("div");
    container.className = "workforce-form-container wf-flex-col wf-gap-14";

    container.innerHTML = `
      <div class="workforce-form-error wf-hidden" id="e4-global-error"></div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-e4-site">근무지 선택</label>
        <select class="workforce-select" id="modal-e4-site">
          <option value="">근무지를 선택하세요</option>
          ${this.sites.map((s) => `<option value="${s.id}" ${emp.currentSiteId === s.id ? "selected" : ""}>${s.name}</option>`).join("")}
        </select>
        <div class="workforce-form-error wf-hidden" id="err-e4-site"></div>
      </div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-e4-shift-group">조 선택</label>
        <select class="workforce-select" id="modal-e4-shift-group" disabled>
          <option value="">근무지를 먼저 선택하세요</option>
        </select>
        <div class="workforce-form-hint" id="hint-e4-shift-group">근무지의 활성 교대 패턴에 설정된 조 목록입니다.</div>
        <div class="workforce-form-error wf-hidden" id="err-e4-shift-group"></div>
      </div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-e4-start">배정 시작일</label>
        <input type="date" class="workforce-input" id="modal-e4-start" value="${this.todayStr}" />
        <div class="workforce-form-error wf-hidden" id="err-e4-start"></div>
      </div>
    `;

    const errBanner = container.querySelector<HTMLElement>("#e4-global-error")!;
    const siteSelect = container.querySelector<HTMLSelectElement>("#modal-e4-site")!;
    const groupSelect = container.querySelector<HTMLSelectElement>("#modal-e4-shift-group")!;
    const startInput = container.querySelector<HTMLInputElement>("#modal-e4-start")!;

    let patternReqGen = 0;

    // UI01-D06: 활성 패턴의 teamSettings만 사용 (fallback 조 생성 금지, 응답 역전 방지)
    const loadTeamsForSite = async (siteId: string) => {
      const currentGen = ++patternReqGen;
      groupSelect.innerHTML = `<option value="">조 목록 조회 중...</option>`;
      groupSelect.disabled = true;

      if (!siteId) {
        groupSelect.innerHTML = `<option value="">근무지를 먼저 선택하세요</option>`;
        groupSelect.disabled = true;
        return;
      }

      try {
        const res = await this.onFetchShiftPatterns(siteId);
        if (currentGen !== patternReqGen || !container.isConnected) return;

        groupSelect.innerHTML = "";
        if (res.ok && res.patterns && res.patterns.length > 0) {
          const activePattern = resolveShiftPatternForDate(res.patterns, startInput.value);
          const settings = activePattern?.teamSettings || [];
          if (settings.length > 0) {
            groupSelect.appendChild(new Option("조를 선택하세요", ""));
            for (const ts of settings) {
              const label = ts.displayName || ts.teamLabel;
              const opt = new Option(label, ts.teamLabel);
              if (emp.currentShiftGroup && (emp.currentShiftGroup === ts.teamLabel || emp.currentShiftGroup === ts.displayName)) {
                opt.selected = true;
              }
              groupSelect.appendChild(opt);
            }
            groupSelect.disabled = false;
          } else {
            groupSelect.appendChild(new Option(activePattern ? "설정된 조가 없습니다" : "활성화된 교대패턴이 없습니다", ""));
            groupSelect.disabled = true;
          }
        } else {
          groupSelect.appendChild(new Option("등록된 교대패턴이 없습니다", ""));
          groupSelect.disabled = true;
        }
      } catch {
        if (currentGen !== patternReqGen || !container.isConnected) return;
        groupSelect.innerHTML = `<option value="">조 목록 조회 실패</option>`;
        groupSelect.disabled = true;
      }
    };

    startInput.addEventListener("input", () => { void loadTeamsForSite(siteSelect.value); });
    startInput.addEventListener("change", () => { void loadTeamsForSite(siteSelect.value); });
    siteSelect.addEventListener("change", () => {
      void loadTeamsForSite(siteSelect.value);
    });

    this.dialog.open({
      id: "modal-e4",
      title: `근무지 및 조 배정 (${emp.name})`,
      width: "480px",
      content: container,
      initialFocusSelector: "#modal-e4-site",
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-cancel-e4",
          label: "취소",
          variant: "secondary",
          onClick: () => this.dialog.close()
        },
        {
          id: "btn-submit-e4",
          label: "배정 저장",
          variant: "primary",
          onClick: async () => {
            errBanner.classList.add("wf-hidden");
            container.querySelectorAll(".workforce-form-error").forEach((el) => {
              el.textContent = "";
              el.classList.add("wf-hidden");
            });

            const siteId = siteSelect.value;
            const shiftGroup = groupSelect.value;
            const startDate = startInput.value.trim();

            let hasErr = false;
            if (!siteId) {
              const el = container.querySelector<HTMLElement>("#err-e4-site")!;
              el.textContent = "근무지를 선택해 주세요.";
              el.classList.remove("wf-hidden");
              hasErr = true;
            }
            if (!shiftGroup) {
              const el = container.querySelector<HTMLElement>("#err-e4-shift-group")!;
              el.textContent = "조를 선택해 주세요.";
              el.classList.remove("wf-hidden");
              hasErr = true;
            }
            if (!startDate || !isValidDateString(startDate)) {
              const el = container.querySelector<HTMLElement>("#err-e4-start")!;
              el.textContent = "올바른 배정 시작일을 입력해 주세요.";
              el.classList.remove("wf-hidden");
              hasErr = true;
            }
            if (hasErr) return;

            const normalizedGroup = normalizeTeamLabel(shiftGroup) || shiftGroup;
            const payload: EmployeeAssignmentInput = {
              employeeId: emp.id,
              siteId,
              shiftGroup: normalizedGroup,
              teamName: normalizedGroup,
              startDate
            };

            const dialogToken = this.dialog.captureToken();
            this.dialog.setProcessing(true, "배정 저장 중...", dialogToken);
            try {
              const res = await this.onSaveAssignment(payload);
            if (!this.dialog.isCurrent(dialogToken)) return;
              if (res.ok) {
                this.dialog.close();
                this.onSuccess();
              } else {
                errBanner.textContent = res.message || "배정 저장에 실패했습니다. (정원 초과 또는 날짜 오류)";
                errBanner.classList.remove("wf-hidden");
              }
            } catch (err) {
              errBanner.textContent = err instanceof Error ? err.message : "배정 저장 중 오류가 발생했습니다.";
              errBanner.classList.remove("wf-hidden");
            } finally {
              this.dialog.setProcessing(false, undefined, dialogToken);
            }
          }
        }
      ]
    });
    if (siteSelect.value) void loadTeamsForSite(siteSelect.value);
  }

  /** 배정 해지 모달 열기 */
  public openCloseAssignmentModal(assignment: EmployeeSiteAssignment, triggerBtn?: HTMLElement | null): void {
    const box = document.createElement("div");
    box.className = "wf-flex-col wf-gap-14";

    box.innerHTML = `
      <div class="workforce-form-error wf-hidden" id="close-assign-error"></div>

      <div class="workforce-info-banner">
        <span class="material-symbols-outlined wf-icon-18" aria-hidden="true">info</span>
        <div>
          <strong>${assignment.siteName || "근무지"} · ${assignment.shiftGroup || "조"}</strong> 배정을 해지합니다.<br>
          해당 업무·근무지에서 마지막으로 근무하는 날짜를 선택해 주세요. 이 처리는 배정만 해제합니다. 퇴사 처리는 기본정보 수정에서, 시급 변경·갱신은 시급 등록에서 진행해 주세요.
        </div>
      </div>

      <div class="workforce-form-group">
        <label class="workforce-form-label workforce-form-label-required" for="modal-close-assign-date">해지 종료일</label>
        <input type="date" class="workforce-input" id="modal-close-assign-date" value="${this.todayStr}" min="${assignment.startDate}" />
        <div class="workforce-form-hint">배정 시작일(${assignment.startDate}) 이후여야 합니다.</div>
        <div class="workforce-form-error wf-hidden" id="err-close-assign-date"></div>
      </div>
    `;

    const errBanner = box.querySelector<HTMLElement>("#close-assign-error")!;
    const dateInput = box.querySelector<HTMLInputElement>("#modal-close-assign-date")!;

    this.dialog.open({
      id: "modal-close-assignment",
      title: "근무지 배정 해제",
      width: "440px",
      content: box,
      initialFocusSelector: "#modal-close-assign-date",
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-cancel-close-assign",
          label: "취소",
          variant: "secondary",
          onClick: () => this.dialog.close()
        },
        {
          id: "btn-confirm-close-assign",
          label: "이 날짜까지 근무 후 배정 해제",
          variant: "danger",
          onClick: async () => {
            const endDate = dateInput.value.trim();
            const el = box.querySelector<HTMLElement>("#err-close-assign-date")!;
            el.classList.add("wf-hidden");
            errBanner.classList.add("wf-hidden");

            if (!endDate || !isValidDateString(endDate)) {
              el.textContent = "올바른 해지 종료일을 입력해 주세요.";
              el.classList.remove("wf-hidden");
              return;
            }
            if (endDate < assignment.startDate) {
              el.textContent = `종료일은 시작일(${assignment.startDate})보다 같거나 뒤여야 합니다.`;
              el.classList.remove("wf-hidden");
              return;
            }

            const dialogToken = this.dialog.captureToken();
            this.dialog.setProcessing(true, "배정 해지 처리 중...", dialogToken);
            try {
              const res = await this.onCloseAssignment({
                assignmentId: assignment.id,
                endDate
              });
            if (!this.dialog.isCurrent(dialogToken)) return;
              if (res.ok) {
                this.dialog.close();
                this.onSuccess();
              } else {
                errBanner.textContent = res.message || "배정 해지에 실패했습니다.";
                errBanner.classList.remove("wf-hidden");
              }
            } catch (err) {
              errBanner.textContent = err instanceof Error ? err.message : "배정 해지 중 오류가 발생했습니다.";
              errBanner.classList.remove("wf-hidden");
            } finally {
              this.dialog.setProcessing(false, undefined, dialogToken);
            }
          }
        }
      ]
    });
  }

  /** E5 조 안 순서 변경 모달 열기 (S10, N06, UI01-D06) */
  public openReorderModal(
    emp: EmployeeRecord,
    assignments: EmployeeSiteAssignment[],
    triggerBtn?: HTMLElement | null
  ): void {
    const activeAssignment = assignments.find((a) => a.status === "active");
    if (!activeAssignment || !emp.currentSiteId || !emp.currentShiftGroup) {
      return;
    }

    const box = document.createElement("div");
    box.className = "wf-flex-col wf-gap-14";

    box.innerHTML = `
      <div class="workforce-form-error wf-hidden" id="reorder-global-error"></div>
      <div class="wf-text-md wf-text-muted">
        ${this.escape(activeAssignment.siteName || "근무지")} ${this.escape(activeAssignment.shiftGroup || "조")} 소속 인력들의 근무 순서를 위/아래로 이동합니다.
      </div>
      <div id="reorder-team-list" class="workforce-reorder-list wf-flex-col wf-gap-6">
        <div class="wf-text-center wf-p-20 wf-text-muted">조 소속 인력 목록 로딩 중...</div>
      </div>
    `;

    const errBanner = box.querySelector<HTMLElement>("#reorder-global-error")!;
    const listContainer = box.querySelector<HTMLElement>("#reorder-team-list")!;

    const renderMemberList = (members: TeamMemberWithAssignment[]) => {
      listContainer.innerHTML = "";
      if (members.length === 0) {
        listContainer.innerHTML = `<div class="wf-text-center wf-p-10 wf-text-muted">소속 인력이 없습니다.</div>`;
        return;
      }

      // currentAssignmentOrder 기준 정렬
      const sorted = [...members].sort(
        (a, b) => (a.currentAssignmentOrder ?? 999) - (b.currentAssignmentOrder ?? 999)
      );

      sorted.forEach((m, idx) => {
        const item = document.createElement("div");
        item.className = "workforce-rate-box wf-flex-between";
        if (m.id === emp.id) {
          item.classList.add("wf-bg-highlight");
        }

        const isFirst = idx === 0;
        const isLast = idx === sorted.length - 1;

        item.innerHTML = `
          <div class="wf-flex-row">
            <span class="wf-badge-idx">${idx + 1}</span>
            <strong>${this.escape(m.name)}</strong>
            <span class="wf-text-sm">(${this.escape(m.employeeCode || "-")})</span>
          </div>
          <div class="wf-flex-gap-4">
            <button type="button" class="workforce-btn workforce-btn-secondary workforce-btn-sm btn-reorder-up" data-id="${m.id}" ${isFirst ? "disabled" : ""} title="${isFirst ? "맨 위입니다" : "위로 이동"}">
              <span class="material-symbols-outlined wf-icon-16" aria-hidden="true">arrow_upward</span>
            </button>
            <button type="button" class="workforce-btn workforce-btn-secondary workforce-btn-sm btn-reorder-down" data-id="${m.id}" ${isLast ? "disabled" : ""} title="${isLast ? "맨 아래입니다" : "아래로 이동"}">
              <span class="material-symbols-outlined wf-icon-16" aria-hidden="true">arrow_downward</span>
            </button>
          </div>
        `;

        // 위로 이동 클릭 (UI01-D06: 클릭한 대상 조원의 assignmentId 사용)
        item.querySelector(".btn-reorder-up")?.addEventListener("click", async () => {
          if (isFirst) return;
          await handleMove(m, "up");
        });

        // 아래로 이동 클릭
        item.querySelector(".btn-reorder-down")?.addEventListener("click", async () => {
          if (isLast) return;
          await handleMove(m, "down");
        });

        listContainer.appendChild(item);
      });
    };

    // UI01-D06: 선택된 직원이 아닌 클릭한 대상 조원(targetEmp)의 실제 assignmentId로 순서 변경 호출
    const handleMove = async (targetEmp: TeamMemberWithAssignment, direction: "up" | "down") => {
      errBanner.classList.add("wf-hidden");

      const targetAssignmentId = targetEmp.assignmentId || (targetEmp.id === emp.id ? activeAssignment.id : undefined);
      if (!targetAssignmentId) {
        errBanner.textContent = "해당 조원의 배정 식별자를 찾지 못했습니다.";
        errBanner.classList.remove("wf-hidden");
        return;
      }

      const dialogToken = this.dialog.captureToken();
      this.dialog.setProcessing(true, "순서 변경 중...", dialogToken);
      try {
        const res = await this.onReorderAssignment({
          assignmentId: targetAssignmentId,
          direction
        });
            if (!this.dialog.isCurrent(dialogToken)) return;
        if (res.ok) {
          // 재조회
          const reload = await this.onFetchTeamMembers(emp.currentSiteId!, emp.currentShiftGroup!);
          if (!this.dialog.isCurrent(dialogToken)) return;
          if (reload.ok && reload.members) {
            renderMemberList(reload.members);
          }
          this.onSuccess();
        } else {
          errBanner.textContent = res.message || "순서 변경에 실패했습니다.";
          errBanner.classList.remove("wf-hidden");
        }
      } catch (err) {
        errBanner.textContent = err instanceof Error ? err.message : "순서 변경 중 오류가 발생했습니다.";
        errBanner.classList.remove("wf-hidden");
      } finally {
        this.dialog.setProcessing(false, undefined, dialogToken);
      }
    };

    // 초기 조원 로드
    const memberToken = this.dialog.captureToken() + 1;
    void (async () => {
      try {
        const res = await this.onFetchTeamMembers(emp.currentSiteId!, emp.currentShiftGroup!);
        if (!this.dialog.isCurrent(memberToken)) return;
        if (res.ok && res.members) {
          renderMemberList(res.members);
        } else {
          listContainer.innerHTML = `<div class="wf-text-center wf-text-danger">조원 목록을 불러오지 못했습니다.</div>`;
        }
      } catch {
        listContainer.innerHTML = `<div class="wf-text-center wf-text-danger">조원 목록을 불러오지 못했습니다.</div>`;
      }
    })();

    this.dialog.open({
      id: "modal-e5",
      title: `조 순서 변경 (${activeAssignment.shiftGroup || "조"})`,
      width: "480px",
      content: box,
      triggerElement: triggerBtn,
      buttons: [
        {
          id: "btn-close-e5",
          label: "닫기",
          variant: "secondary",
          onClick: () => this.dialog.close()
        }
      ]
    });
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
