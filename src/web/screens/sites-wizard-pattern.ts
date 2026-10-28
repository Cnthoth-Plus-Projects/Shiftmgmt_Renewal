import { isOffDutyCode } from "../../shared/domain/duty-type-catalog";
// sites-wizard-pattern.ts — 마법사 1-B 단계: 근무시간 설정 및 클릭 패턴 페인팅
import type { ShiftPatternDutyTypeInput } from "../../shared/bridge/contracts";
import type { PatternDraft } from "./sites-pattern-model";
import {
  togglePerTeamPattern,
  getDutyCodes,
  PatternHistoryManager
} from "./sites-pattern-model";
import { SitesWizardPalette } from "./sites-wizard-palette";
import { runThreeMonthSimulation } from "./sites-simulation";

/**
 * 카탈로그/팔레트 항목으로부터 고유 slot/code(D/E/N/O) 매핑
 */
export function getDutyCodeFromDutyType(duty: ShiftPatternDutyTypeInput, all: ShiftPatternDutyTypeInput[]): string { return getDutyCodes(all)[duty.id] || ""; }
export function findDutyTypeByCode(code: string, all: ShiftPatternDutyTypeInput[]): ShiftPatternDutyTypeInput | undefined { if(isOffDutyCode(code))return all.find(d=>d.kind==="off");const exact=all.find(d=>d.id===code&&d.kind==="work");if(exact)return exact;const map=getDutyCodes(all);return all.find(d=>map[d.id]===code); }

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export interface SitesWizardPatternOptions {
  container: HTMLElement;
  draft: PatternDraft;
  historyManager: PatternHistoryManager;
  onChange: () => void;
  sessionRole?: string;
  existingPatterns?: import("../../shared/domain/model").ShiftPatternRecord[];
  onSessionExpired?: () => void;
}

export class SitesWizardPattern {
  private options: SitesWizardPatternOptions;
  private disposed = false;
  private request = 0;
  private holidayDates = new Set<string>();
  private holidayState: "loading" | "ready" | "unavailable" = "unavailable";
  private container: HTMLElement;
  private draft: PatternDraft;
  private historyManager: PatternHistoryManager;
  private onChange: () => void;

  private selectedDutyId = "duty-day";
  private activeCycleKey = "cycle-main";
  private selectedSimTeam = "A조";
  private paletteComponent: SitesWizardPalette | null = null;
  private errorMessage = "";

  constructor(options: SitesWizardPatternOptions) {
    this.options = options;
    this.container = options.container;
    this.draft = options.draft;
    this.historyManager = options.historyManager;
    this.onChange = options.onChange;

    if (this.draft.cycles.length > 0) {
      this.activeCycleKey = this.draft.cycles[0].cycleKey;
    }
    if (this.draft.dutyTypes.length > 0) {
      this.selectedDutyId = this.draft.dutyTypes[0].id;
    }
    if (this.draft.teamSettings.length > 0) {
      this.selectedSimTeam = this.draft.teamSettings[0].teamLabel;
    }
  }

  private refreshSimulation(): void {
    const old=this.container.querySelector("#sites-simulation-section");if(!old)return;
    const detached=document.createElement("div"),saved=this.container;this.container=detached;this.render();this.container=saved;const fresh=detached.querySelector("#sites-simulation-section");if(fresh)old.replaceWith(fresh);
  }
  public destroy(): void { this.disposed=true;this.request++; }
  public async loadHolidayData(): Promise<void> {
    if(this.options.sessionRole!=="admin" || this.disposed)return;
    const id=++this.request;this.holidayState="loading";
    try{const base=this.draft.effectiveFrom || new Date().toISOString().slice(0,10),date=new Date(`${base.slice(0,7)}-01T12:00:00`),years=new Set<number>();for(let i=0;i<3;i++)years.add(new Date(date.getFullYear(),date.getMonth()+i,1).getFullYear());
      const rs=await Promise.all([...years].map(y=>window.appBridge!.listHolidayCalendars(y)));if(this.disposed||id!==this.request)return;
      for(const r of rs){if(!r.ok){if(/SESSION|AUTH_SESSION/.test(r.errorCode))this.options.onSessionExpired?.();throw Error(r.message);}for(const c of r.data)for(const day of c.items)this.holidayDates.add(day.holidayDate);}
      this.holidayState="ready";
    }catch{if(this.disposed||id!==this.request)return;this.holidayState="unavailable";}
    if(!this.disposed)this.render();
  }
  public render(): void {
    if(this.disposed)return;
    const active=document.activeElement as HTMLInputElement|null;
    const focusId=active?.id,focusIdx=active?.dataset.idx,focusClass=active?.classList[0];
    const focusHere=!!active && this.container.contains(active);
    this.container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "sites-wizard-card";

    // 에러 메시지 알림 영역 (alert 금지 준수)
    if (this.errorMessage) {
      const errBanner = document.createElement("div");
      errBanner.className = "banner-warning";
      errBanner.style.marginBottom = "10px";
      errBanner.style.padding = "8px 12px";
      errBanner.style.background = "#FEE2E2";
      errBanner.style.color = "#991B1B";
      errBanner.style.borderRadius = "4px";
      errBanner.style.fontSize = "12px";
      errBanner.textContent = this.errorMessage;
      card.appendChild(errBanner);
      this.errorMessage = "";
    }

    // 1. 유형 팔레트 컨테이너
    const paletteContainer = document.createElement("div");
    const primaryCycle = this.draft.cycles[0];
    const isHolidaySplit = primaryCycle?.holidayTimeMode === "split";

    this.paletteComponent = new SitesWizardPalette({
      container: paletteContainer,
      dutyTypes: structuredClone(this.draft.dutyTypes),
      isHolidaySplit,
      onChange: (updatedDutyTypes) => {
        const old=this.draft.dutyTypes,oldCodes=getDutyCodes(old,this.draft.dutyCodes);
        const deleted=old.find(d=>d.kind==="work" && !updatedDutyTypes.some(n=>n.id===d.id) && this.draft.cycles.some(c=>c.steps.some(s=>s.dutyCode===oldCodes[d.id])));
        if(deleted){this.errorMessage=`${deleted.label}은 패턴에서 사용 중입니다. 해당 셀을 먼저 다시 선택해 주세요.`;this.render();return;}
        this.draft.dutyTypes=structuredClone(updatedDutyTypes);this.draft.dutyCodes=getDutyCodes(updatedDutyTypes,oldCodes);
        for(const d of updatedDutyTypes){const code=this.draft.dutyCodes[d.id];if(!code || d.kind==="off")continue;for(const c of this.draft.cycles)for(const step of c.steps)if(step.dutyCode===code){Object.assign(step,{startTime:d.startTime,endTime:d.endTime,breakMinutes:d.breakMinutes??0,holidayStartTime:d.holidayStartTime,holidayEndTime:d.holidayEndTime,holidayBreakMinutes:d.holidayBreakMinutes});}}
        this.historyManager.record(this.draft);this.onChange();this.refreshSimulation();
        const badges=this.container.querySelectorAll<HTMLButtonElement>(".sites-palette-bar .sites-duty-badge");badges.forEach((badge,i)=>{const d=updatedDutyTypes[i];if(d)badge.textContent=`${d.label} (${d.kind==="work"?"근무":"휴무"})`;});
      }
    });
    this.paletteComponent.render();
    card.appendChild(paletteContainer);

    // 2. 패턴 옵션 토글 바 (개별 패턴, 평/휴 분리, 평일공휴일)
    const optionsBar = document.createElement("div");
    optionsBar.style.display = "flex";
    optionsBar.style.gap = "20px";
    optionsBar.style.alignItems = "center";
    optionsBar.style.padding = "10px 14px";
    optionsBar.style.background = "#F8FAFC";
    optionsBar.style.border = "1px solid var(--line, #E2E5EA)";
    optionsBar.style.borderRadius = "6px";
    optionsBar.style.fontSize = "12px";
    optionsBar.style.flexWrap = "wrap";

    optionsBar.innerHTML = `
      <label style="display:flex; align-items:center; gap:6px; font-weight:600; cursor:pointer;">
        <input type="checkbox" id="chk-per-team-toggle" ${this.draft.isPerTeamPattern ? "checked" : ""} />
        <span>조별 개별 패턴 사용</span>
      </label>

      <label style="display:flex; align-items:center; gap:6px; font-weight:600; cursor:pointer;">
        <input type="checkbox" id="chk-weekend-split-toggle" ${isHolidaySplit ? "checked" : ""} />
        <span>평일 / 휴일 근무시간 분리</span>
      </label>

      <label style="display:flex; align-items:center; gap:6px; font-weight:600; cursor:pointer;">
        <input type="checkbox" id="chk-weekday-holiday" ${primaryCycle?.weekdayPublicHolidayAsHoliday ? "checked" : ""} />
        <span>평일 공휴일을 휴일 시간으로 적용</span>
      </label>
    `;
    card.appendChild(optionsBar);

    // 토글 이벤트
    const perTeamChk = optionsBar.querySelector<HTMLInputElement>("#chk-per-team-toggle");
    perTeamChk?.addEventListener("change", () => {
      const res = togglePerTeamPattern(this.draft, perTeamChk.checked);
      if (!res.success) {
        this.errorMessage = res.error || "개별 패턴 전환 실패";
        perTeamChk.checked = !perTeamChk.checked;
        this.render();
        return;
      }
      this.activeCycleKey = this.draft.cycles[0]?.cycleKey || "cycle-main";
      this.historyManager.record(this.draft);
      this.onChange();
      this.render();
    });

    const holSplitChk = optionsBar.querySelector<HTMLInputElement>("#chk-weekend-split-toggle");
    holSplitChk?.addEventListener("change", () => {
      const mode = holSplitChk.checked ? "split" : "unified";
      this.draft.cycles.forEach((c) => {
        c.holidayTimeMode = mode;
      });
      this.historyManager.record(this.draft);this.onChange();this.render();
    });

    const weekdayHolChk = optionsBar.querySelector<HTMLInputElement>("#chk-weekday-holiday");
    weekdayHolChk?.addEventListener("change", () => {
      this.draft.cycles.forEach((c) => {
        c.weekdayPublicHolidayAsHoliday = weekdayHolChk.checked;
      });
      this.historyManager.record(this.draft);this.onChange();this.render();
    });

    // 3. 패턴 페인팅 영역
    const patternSection = document.createElement("div");
    patternSection.style.display = "flex";
    patternSection.style.flexDirection = "column";
    patternSection.style.gap = "10px";

    // 3-1. 묶음(사이클) 탭 선택기 (개별 패턴일 때 여러 개)
    if (this.draft.cycles.length > 1) {
      const tabsBar = document.createElement("div");
      tabsBar.style.display = "flex";
      tabsBar.style.gap = "6px";
      tabsBar.style.borderBottom = "1px solid var(--line, #E2E5EA)";
      tabsBar.style.paddingBottom = "6px";

      this.draft.cycles.forEach((cycle) => {
        const tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = `filter-chip ${this.activeCycleKey === cycle.cycleKey ? "active" : ""}`;
        tabBtn.textContent = cycle.name;
        tabBtn.style.fontSize = "12px";
        tabBtn.addEventListener("click", () => {
          this.activeCycleKey = cycle.cycleKey;
          this.render();
        });
        tabsBar.appendChild(tabBtn);
      });
      patternSection.appendChild(tabsBar);
    }

    // 3-2. 팔레트 선택 바 (페인팅용) + Undo/Redo 버튼
    const paintBar = document.createElement("div");
    paintBar.className = "sites-palette-bar";

    const labelSpan = document.createElement("span");
    labelSpan.style.fontSize = "12px";
    labelSpan.style.fontWeight = "bold";
    labelSpan.textContent = "적용할 유형 선택:";
    paintBar.appendChild(labelSpan);

    this.draft.dutyTypes.forEach((duty) => {
      const badge = document.createElement("button");
      badge.type = "button";
      const isSelected = this.selectedDutyId === duty.id;
      const dutyCodeChar = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes)[duty.id];
      badge.className = `sites-duty-badge duty-${dutyCodeChar}`;
      if (isSelected) {
        badge.style.boxShadow = "0 0 0 2px #1F2430";
      }
      badge.textContent = `${duty.label} (${duty.kind === "work" ? "근무" : "휴무"})`;
      badge.addEventListener("click", () => {
        this.selectedDutyId = duty.id;
        this.render();
      });
      paintBar.appendChild(badge);
    });

    // Undo / Redo / 일차 추가 버튼
    const toolBtns = document.createElement("div");
    toolBtns.style.marginLeft = "auto";
    toolBtns.style.display = "flex";
    toolBtns.style.gap = "6px";

    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "btn-secondary";
    undoBtn.id = "btn-pattern-undo";
    undoBtn.style.fontSize = "11px";
    undoBtn.style.height = "26px";
    undoBtn.disabled = !this.historyManager.canUndo(this.draft);
    undoBtn.textContent = "↶ 실행 취소";
    undoBtn.addEventListener("click", () => {
      const prev = this.historyManager.undo(this.draft);
      if (prev) {
        Object.assign(this.draft, prev);
        this.onChange();
        this.render();
      }
    });
    toolBtns.appendChild(undoBtn);

    const redoBtn = document.createElement("button");
    redoBtn.type = "button";
    redoBtn.className = "btn-secondary";
    redoBtn.id = "btn-pattern-redo";
    redoBtn.style.fontSize = "11px";
    redoBtn.style.height = "26px";
    redoBtn.disabled = !this.historyManager.canRedo(this.draft);
    redoBtn.textContent = "↷ 다시 실행";
    redoBtn.addEventListener("click", () => {
      const next = this.historyManager.redo(this.draft);
      if (next) {
        Object.assign(this.draft, next);
        this.onChange();
        this.render();
      }
    });
    toolBtns.appendChild(redoBtn);

    const addStepBtn = document.createElement("button");
    addStepBtn.type = "button";
    addStepBtn.className = "btn-secondary";
    addStepBtn.id = "btn-add-day";
    addStepBtn.style.fontSize = "11px";
    addStepBtn.style.height = "26px";
    addStepBtn.textContent = "+ 일차 추가";
    addStepBtn.addEventListener("click", () => {
      this.addStepToActiveCycle();
    });
    toolBtns.appendChild(addStepBtn);

    const delStepBtn = document.createElement("button");
    delStepBtn.type = "button";
    delStepBtn.className = "btn-secondary";
    delStepBtn.id = "btn-del-pattern-step";
    delStepBtn.style.fontSize = "11px";
    delStepBtn.style.height = "26px";
    delStepBtn.textContent = "- 마지막 일차 삭제";
    delStepBtn.addEventListener("click", () => {
      this.delStepFromActiveCycle();
    });
    toolBtns.appendChild(delStepBtn);

    paintBar.appendChild(toolBtns);
    patternSection.appendChild(paintBar);

    // 3-3. 일차별 셀 스트립
    const activeCycle =
      this.draft.cycles.find((c) => c.cycleKey === this.activeCycleKey) || this.draft.cycles[0];
    if(activeCycle){const controls=document.createElement("div");controls.className="sites-form-grid-2col";
      const label=document.createElement("input");label.id="cycle-name";label.className="sites-form-input";label.value=activeCycle.name;label.setAttribute("aria-label","묶음 이름");label.addEventListener("input",()=>{activeCycle.name=label.value;this.historyManager.record(this.draft);this.onChange();});
      const count=document.createElement("select");count.id="cycle-shift-count";count.className="sites-form-select";count.setAttribute("aria-label","묶음 교대 횟수");for(const n of [1,2,3]){const o=document.createElement("option");o.value=String(n);o.textContent=`${n}교대`;count.append(o);}count.value=String(activeCycle.shiftCount);count.addEventListener("change",()=>{activeCycle.shiftCount=Number(count.value);this.historyManager.record(this.draft);this.onChange();this.render();});
      const date=document.createElement("input");date.id="cycle-start-date";date.type="date";date.className="sites-form-input";date.value=activeCycle.patternStartDate||this.draft.patternStartDate||this.draft.effectiveFrom||"";date.setAttribute("aria-label","묶음 순환 시작일");date.addEventListener("change",()=>{activeCycle.patternStartDate=date.value;this.historyManager.record(this.draft);this.onChange();this.render();});controls.append(label,count,date);patternSection.append(controls);}
    const strip = document.createElement("div");
    strip.className = `sites-pattern-strip ${this.draft.cycles.length > 1 ? "sites-pattern-team-strip" : ""}`;

    (activeCycle?.steps || []).forEach((step, sIdx) => {
      const cell = document.createElement("div");
      cell.className = `sites-pattern-cell duty-${step.dutyCode}`;
      cell.dataset.slot = "1";
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `${sIdx + 1}일차 ${step.dutyCode}`);

      // 정확한 code에 대응하는 dutyType 찾기 (UI03-D02)
      const matchedDuty = findDutyTypeByCode(step.dutyCode, this.draft.dutyTypes);
      const displayLabel = matchedDuty?.label || step.dutyCode;

      cell.innerHTML = `
        <span style="font-size:9px; color:var(--text-sub, #4B5563);">${sIdx + 1}일차</span>
        <b style="font-size:14px;">${escapeHtml(step.dutyCode)}</b>
        <span style="font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:40px;">
          ${escapeHtml(displayLabel)}
        </span>
      `;

      // 클릭 시 선택된 카탈로그 ID에 해당하는 정확한 slot/code(D/E/N/O) 매핑 (UI03-D02)
      const applyDuty = () => {
        const curDuty = this.draft.dutyTypes.find((d) => d.id === this.selectedDutyId);
        if (curDuty) {
          const mappedCode = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes)[curDuty.id];
          step.dutyCode = mappedCode;
          step.startTime = curDuty.startTime;
          step.endTime = curDuty.endTime;
          step.breakMinutes = curDuty.breakMinutes ?? 0;
          step.holidayStartTime = curDuty.holidayStartTime;
          step.holidayEndTime = curDuty.holidayEndTime;
          step.holidayBreakMinutes = curDuty.holidayBreakMinutes;

          activeCycle.patternCode = activeCycle.steps.map((s) => s.dutyCode).join("-");
          this.historyManager.record(this.draft);
          this.onChange();
          this.render();
        }
      };

      cell.addEventListener("click", applyDuty);
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          applyDuty();
        }
      });

      strip.appendChild(cell);
    });

    patternSection.appendChild(strip);
    card.appendChild(patternSection);

    // 4. 하단 3개월 캘린더 시뮬레이션 미리보기 (조 선택 UI 지원 UI03-D06)
    const simSection = document.createElement("div");simSection.id="sites-simulation-section";
    simSection.style.marginTop = "14px";
    simSection.style.borderTop = "1px solid var(--line, #E2E5EA)";
    simSection.style.paddingTop = "14px";

    const simHeader = document.createElement("div");
    simHeader.style.display = "flex";
    simHeader.style.justifyContent = "space-between";
    simHeader.style.alignItems = "center";
    simHeader.style.marginBottom = "8px";

    simHeader.innerHTML = `
      <div style="font-size:13px; font-weight:bold; color:var(--text, #1F2430); display:flex; align-items:center; gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px; color:var(--accent, #3E56B6);">calendar_month</span>
        <span>3개월 교대 시뮬레이션 미리보기 (작성된 패턴 기준 실시간 계산)</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; font-size:12px;">
        <span>조 선택:</span>
        <select id="sel-sim-team" class="sites-form-input" style="font-size:11px; height:26px; padding:2px 6px;">
          ${this.draft.teamSettings
            .filter((t) => t.isActive !== false)
            .map(
              (t) =>
                `<option value="${escapeHtml(t.teamLabel)}" ${t.teamLabel === this.selectedSimTeam ? "selected" : ""}>${escapeHtml(t.displayName || t.teamLabel)}</option>`
            )
            .join("")}
        </select>
      </div>
    `;
    simSection.appendChild(simHeader);

    simHeader.querySelector<HTMLSelectElement>("#sel-sim-team")?.addEventListener("change", (e) => {
      this.selectedSimTeam = (e.target as HTMLSelectElement).value;
      this.render();
    });

    const simResult = runThreeMonthSimulation({draft:this.draft,startMonth:this.draft.effectiveFrom?.slice(0,7) || new Date().toISOString().slice(0,7),existingPatterns:this.options.existingPatterns,publicHolidayDates:this.holidayState === "ready" ? this.holidayDates : undefined});
    const calendarNote=document.createElement("p");calendarNote.className="sites-form-help";calendarNote.textContent=this.holidayState==="ready"?"조별 근무유형 미리보기 · 월 1일에 유효한 설정 기준 · 휴일 설정 반영":"조별 근무유형 미리보기 · 공휴일별 시간은 관리자 설정 확인이 필요합니다.";simSection.appendChild(calendarNote);
    if(this.draft.cycles.some(c=>c.holidayTimeMode==="split"&&c.steps.some(s=>s.dutyCode!=="O"&&(!s.holidayStartTime||!s.holidayEndTime)))){const warning=document.createElement("p");warning.className="sites-form-help";warning.textContent="휴일 시간이 비어 있는 칸은 평일 시간을 사용합니다. 시간 설정을 확인해 주세요.";simSection.appendChild(warning);}
    
    const simRow = document.createElement("div");
    simRow.className = "sites-sim-months-row";

    simResult.months.forEach((m) => {
      const mBox = document.createElement("div");
      mBox.className = "sites-sim-month-box";
      mBox.innerHTML = `
        <div style="font-weight:bold; font-size:12px; margin-bottom:6px; text-align:center;">
          ${escapeHtml(m.scheduleMonth)} (${m.dates.length}일)
        </div>
      `;

      const grid = document.createElement("div");
      grid.className = "sites-sim-grid";

      // 요일 헤더
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      days.forEach((d, dIdx) => {
        const dh = document.createElement("div");
        dh.className = `sites-sim-day-head ${dIdx === 0 ? "sun" : dIdx === 6 ? "sat" : ""}`;
        dh.textContent = d;
        grid.appendChild(dh);
      });

      // 1일의 시작 요일 공백
      if (m.dates.length > 0) {
        const firstDayOfWeek = new Date(m.dates[0]).getDay();
        for (let i = 0; i < firstDayOfWeek; i++) {
          const empty = document.createElement("div");
          grid.appendChild(empty);
        }
      }

      // 선택된 조의 일별 근무형 가져오기 (canonical teamLabel 또는 일반 키)
      const teamMap =
        m.teamDailyDuty.get(this.selectedSimTeam);

      m.dates.forEach((dStr) => {
        const dayNum = parseInt(dStr.slice(8), 10);
        const duty = teamMap?.get(dStr) || "-";
        const cell = document.createElement("div");
        cell.className = `sites-sim-cell duty-${duty}`;
        cell.dataset.date=dStr;cell.dataset.team=this.selectedSimTeam;cell.dataset.duty=duty;
        cell.innerHTML = `<span>${dayNum}</span><b>${escapeHtml(duty)}</b>`;
        grid.appendChild(cell);
      });

      mBox.appendChild(grid);
      simRow.appendChild(mBox);
    });

    simSection.appendChild(simRow);
    card.appendChild(simSection);

    // 5. 조별 묶음(사이클) 배정 섹션
    const teamMappingSection = document.createElement("div");
    teamMappingSection.style.marginTop = "14px";
    teamMappingSection.style.padding = "10px 14px";
    teamMappingSection.style.background = "#F8FAFC";
    teamMappingSection.style.borderRadius = "6px";
    teamMappingSection.style.border = "1px solid var(--line, #E2E5EA)";

    const tmTitle = document.createElement("div");
    tmTitle.style.fontWeight = "bold";
    tmTitle.style.fontSize = "12px";
    tmTitle.style.marginBottom = "8px";
    tmTitle.textContent = "조별 묶음(사이클) 및 시작 일차 오프셋";
    teamMappingSection.appendChild(tmTitle);

    const tmGrid = document.createElement("div");
    tmGrid.style.display = "grid";
    tmGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))";
    tmGrid.style.gap = "8px";

    this.draft.teamSettings
      .filter((t) => t.isActive !== false)
      .forEach((team) => {
        const tmCard = document.createElement("div");
        tmCard.style.padding = "6px 8px";
        tmCard.style.background = "#FFFFFF";
        tmCard.style.border = "1px solid var(--line, #E2E5EA)";
        tmCard.style.borderRadius = "4px";
        tmCard.style.fontSize = "11px";

        const curAssign = this.draft.teamCycleAssignments.find(
          (a) => a.teamLabel === team.teamLabel
        );
        const curCycleKey =
        curAssign?.cycleKey || "";

        tmCard.innerHTML = `
          <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(team.displayName || team.teamLabel)}</div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span>묶음:</span>
            <select class="sites-form-input sites-team-cycle-select" style="font-size:11px; height:24px; padding:2px 4px;" data-team="${escapeHtml(team.teamLabel)}">
              <option value="" ${!curCycleKey?"selected":""}>묶음 선택 필요</option>
              ${this.draft.cycles.map((c) => `<option value="${escapeHtml(c.cycleKey)}" ${c.cycleKey === curCycleKey ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </div>
        `;

        tmCard
          .querySelector<HTMLSelectElement>(".sites-team-cycle-select")
          ?.addEventListener("change", (e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (curAssign) {
              curAssign.cycleKey = val;
            } else {
              this.draft.teamCycleAssignments.push({
                teamLabel: team.teamLabel,
                cycleKey: val
              });
            }
            this.historyManager.record(this.draft);
            this.onChange();this.render();
          });

        const cycle=this.draft.cycles.find(c=>c.cycleKey===curCycleKey),offset=document.createElement("input");offset.type="number";offset.className="sites-form-input sites-team-offset";offset.min="0";offset.max=String((cycle?.steps.length||1)-1);offset.value=String(cycle?.teamIndexes.find(i=>i.teamLabel===team.teamLabel)?.index??"");offset.dataset.team=team.teamLabel;offset.setAttribute("aria-label",`${team.teamLabel} 시작 위치 (0부터)`);offset.addEventListener("change",()=>{if(!cycle)return;const value=offset.value===""?NaN:Number(offset.value),index=cycle.teamIndexes.find(i=>i.teamLabel===team.teamLabel);if(index)index.index=value;else cycle.teamIndexes.push({teamLabel:team.teamLabel,index:value});this.historyManager.record(this.draft);this.onChange();this.render();});tmCard.append(offset);
        tmGrid.appendChild(tmCard);
      });
    teamMappingSection.appendChild(tmGrid);
    card.appendChild(teamMappingSection);

    this.container.appendChild(card);
    if(focusHere){const target=focusId?this.container.querySelector<HTMLInputElement>(`#${CSS.escape(focusId)}`):focusIdx!==undefined&&focusClass?this.container.querySelector<HTMLInputElement>(`.${CSS.escape(focusClass)}[data-idx="${CSS.escape(focusIdx)}"]`):null;target?.focus();}

  }

  private addStepToActiveCycle(): void {
    const cycle =
      this.draft.cycles.find((c) => c.cycleKey === this.activeCycleKey) || this.draft.cycles[0];
    if (!cycle) return;

    const newIdx = cycle.steps.length;
    const curDuty =
      this.draft.dutyTypes.find((d) => d.id === this.selectedDutyId) || this.draft.dutyTypes[0];
    const dutyCode = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes)[curDuty.id];

    cycle.steps.push({
      stepIndex: newIdx,
      dutyCode,
      startTime: curDuty?.startTime,
      endTime: curDuty?.endTime,
      breakMinutes: curDuty?.breakMinutes ?? 0,
      holidayStartTime: curDuty?.holidayStartTime,
      holidayEndTime: curDuty?.holidayEndTime,
      holidayBreakMinutes: curDuty?.holidayBreakMinutes
    });

    // shiftCount는 고유 교대수(1~3)를 보존하고 steps.length를 덮어쓰지 않음 (UI03-D02)
    cycle.patternCode = cycle.steps.map((s) => s.dutyCode).join("-");
    this.historyManager.record(this.draft);
    this.onChange();
    this.render();
  }

  private delStepFromActiveCycle(): void {
    const cycle =
      this.draft.cycles.find((c) => c.cycleKey === this.activeCycleKey) || this.draft.cycles[0];
    if (!cycle || cycle.steps.length <= 1) {
      this.errorMessage = "최소 1개 이상의 일차가 존재해야 합니다.";
      this.render();
      return;
    }

    cycle.steps.pop();
    // shiftCount는 고유 교대수(1~3)를 보존함 (UI03-D02)
    cycle.patternCode = cycle.steps.map((s) => s.dutyCode).join("-");
    this.historyManager.record(this.draft);
    this.onChange();
    this.render();
  }
}

