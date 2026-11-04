import { WorkforceDialog } from "./workforce-dialog";
import type { HolidayCategory } from "../../shared/domain/holiday-pattern";
import { SitesPatternDialog } from "./sites-pattern-dialog";
import { renderTeamPatternEditor } from "./sites-team-pattern";
import { SitesPatternLibrary } from "./sites-pattern-library";
import { isOffDutyCode } from "../../shared/domain/duty-type-catalog";
import type { ShiftPatternDutyTypeInput } from "../../shared/bridge/contracts";
import type { PatternDraft } from "./sites-pattern-model";
import { getDutyCodes, PatternHistoryManager, validatePatternDraft } from "./sites-pattern-model";
import { SitesWizardPalette } from "./sites-wizard-palette";
import { SitesHolidayPolicyEditor } from "./sites-holiday-policy";
import { SitesExceptionsEditor } from "./sites-exceptions";
import { runThreeMonthSimulation } from "./sites-simulation";

export function getDutyCodeFromDutyType(duty: ShiftPatternDutyTypeInput, all: ShiftPatternDutyTypeInput[]): string { return getDutyCodes(all)[duty.id] || ""; }
export function findDutyTypeByCode(code: string, all: ShiftPatternDutyTypeInput[]): ShiftPatternDutyTypeInput | undefined {
  if (isOffDutyCode(code)) return all.find(d => d.kind === "off");
  const exact = all.find(d => d.id === code && d.kind === "work"); if (exact) return exact;
  const map = getDutyCodes(all); return all.find(d => map[d.id] === code);
}
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = className; if (text) e.textContent = text; return e; };
export interface SitesWizardPatternOptions {
  container: HTMLElement; draft: PatternDraft; historyManager: PatternHistoryManager; onChange: () => void;
  sessionRole?: string; existingPatterns?: import("../../shared/domain/model").ShiftPatternRecord[]; onSessionExpired?: () => void;
  employees?: import("../../shared/domain/model").EmployeeRecord[];
}

export class SitesWizardPattern {
  private options: SitesWizardPatternOptions;
  private disposed = false;
  private request = 0;
  private holidayDates = new Set<string>();
  private holidayState: "loading" | "ready" | "unavailable" = "unavailable";
  private container: HTMLElement;
  private draft: PatternDraft;
  private initialDraft: PatternDraft;
  private historyManager: PatternHistoryManager;
  private onChange: () => void;
  private selectedDutyId: string;
  private selectedSimTeam: string;
  private selectedCalendarMonth: string;
  private library: SitesPatternLibrary | null = null;
  private paletteComponent: SitesWizardPalette | null = null;
  private errorMessage = "";
  private holidayEditor: SitesHolidayPolicyEditor | null = null;
  private detailEditor: SitesPatternDialog | null = null;
  private guideDialog = new WorkforceDialog();
  private exceptionsEditor:SitesExceptionsEditor|null=null;
  constructor(options: SitesWizardPatternOptions) {
    this.options = options; this.container = options.container; this.draft = options.draft;
    this.initialDraft = structuredClone(options.draft); this.historyManager = options.historyManager; this.onChange = options.onChange;
    this.selectedDutyId = this.draft.dutyTypes[0]?.id || "";
    this.selectedSimTeam = this.draft.teamSettings.find(t => t.isActive !== false)?.teamLabel || "";
    this.selectedCalendarMonth = this.draft.effectiveFrom?.slice(0, 7) || new Date().toLocaleDateString("sv-SE").slice(0, 7);
  }
  public destroy(): void { this.disposed = true; this.request++; this.paletteComponent?.destroy(); this.library?.destroy(); this.holidayEditor?.destroy(); this.detailEditor?.destroy(); this.exceptionsEditor?.destroy();this.guideDialog.close(); }
  private changed(render = true): void {
    this.historyManager.record(this.draft); this.onChange();
    if (render) this.render(); else { this.refreshSimulation(); this.syncPaintLabels(); }
  }
  public async loadHolidayData(): Promise<void> {
    if (this.disposed) return;
    const request = ++this.request; this.holidayState = "loading";
    try {
      const [year, month] = this.selectedCalendarMonth.split("-").map(Number);
      const years = new Set(Array.from({ length: 3 }, (_, i) => new Date(year, month - 1 + i, 1, 12).getFullYear()));
      const results = await Promise.all([...years].map(y => window.appBridge!.getSchedulePreparationContext(y)));
      if (this.disposed || request !== this.request) return;
      const dates = new Set<string>();
      for (const result of results) {
        if (!result.ok) { if (/SESSION|AUTH_SESSION/.test(result.errorCode)) this.options.onSessionExpired?.(); throw new Error(result.message); }
        for (const date of result.data.publicHolidayDates) dates.add(date);
      }
      this.holidayDates = dates; this.holidayState = "ready";
    } catch { if (this.disposed || request !== this.request) return; this.holidayState = "unavailable"; }
    if (!this.disposed) this.refreshSimulation();
  }
  public render(): void {
    if (this.disposed) return;
    const active = document.activeElement as HTMLInputElement | null;
    const focus = active && this.container.contains(active) ? { id: active.id, cls: active.classList[0], idx: active.dataset.idx, cycle: active.dataset.cycle, index: active.dataset.index, team: active.dataset.team, selection: active.selectionStart } : null;
    this.library?.destroy();
    this.container.replaceChildren();
    if(!this.draft.dutyTypes.some(d=>d.id===this.selectedDutyId))this.selectedDutyId=this.draft.dutyTypes[0]?.id||"";
    const workspace = element("div", "sites-pattern-workspace sites-wizard-card");
    const palette = element("section", "sites-editor-column sites-palette-column"); palette.setAttribute("aria-label", "근무 유형과 시간 설정");
    palette.append(element("h2", "sites-editor-heading", "근무 유형 팔레트"));
    const paletteBody = element("div", "sites-editor-scroll"); const paletteMount = element("div");
    this.paletteComponent = new SitesWizardPalette({ container: paletteMount, dutyTypes: structuredClone(this.draft.dutyTypes), isHolidaySplit: this.draft.cycles[0]?.holidayTimeMode === "split", onChange: duties => {
      const codes = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes);
      const deleted = this.draft.dutyTypes.find(d => d.kind === "work" && !duties.some(n => n.id === d.id) && this.draft.cycles.some(c => c.steps.some(s => s.dutyCode === codes[d.id])));
      if (deleted) { this.errorMessage = `${deleted.label}은 패턴에서 사용 중입니다. 해당 칸을 다른 유형으로 바꾼 뒤 삭제해 주세요.`; this.render(); return; }
      this.draft.dutyTypes = structuredClone(duties); this.draft.dutyCodes = getDutyCodes(duties, codes);
      for (const duty of duties) { const code = this.draft.dutyCodes[duty.id]; if (!code || duty.kind === "off") continue;
        for (const cycle of this.draft.cycles) for (const step of cycle.steps) if (step.dutyCode === code) Object.assign(step, { startTime: duty.startTime, endTime: duty.endTime, breakMinutes: duty.breakMinutes ?? 0, holidayStartTime: duty.holidayStartTime, holidayEndTime: duty.holidayEndTime, holidayBreakMinutes: duty.holidayBreakMinutes });
      }
      this.changed(false);
    }});
    this.paletteComponent.render(); paletteBody.append(paletteMount, this.renderOptions()); palette.append(paletteBody);
    const pattern = element("section", "sites-editor-column sites-pattern-column"); pattern.setAttribute("aria-label", "반복 패턴과 조별 시작 위치");
    pattern.append(element("h2", "sites-editor-heading", "반복 패턴 · 조별 설정"));
    const exceptionButton=this.button(`날짜·개인 예외 · ${this.draft.holidayPolicy?.dateExceptions?.length??0}건`,()=>{this.exceptionsEditor?.destroy();this.exceptionsEditor=new SitesExceptionsEditor(this.draft,this.options.employees??[],()=>this.changed());this.exceptionsEditor.open();},"btn-pattern-exceptions");exceptionButton.classList.add("sites-exceptions-entry");palette.querySelector("h2")!.append(exceptionButton);
    const patternBody = element("div", "sites-editor-scroll");
    if (this.errorMessage) { const alert = element("div", "sites-editor-alert", this.errorMessage); alert.setAttribute("role", "alert"); patternBody.append(alert); this.errorMessage = ""; }
    patternBody.append(this.renderPaintBar());
    this.library = new SitesPatternLibrary({draft:this.draft,onApply:()=>this.changed(),onError:message=>{this.errorMessage=message;this.render();},onSessionExpired:this.options.onSessionExpired});
    const openDetails=(team?:string)=>{this.detailEditor?.destroy();this.detailEditor=new SitesPatternDialog(this.draft,()=>this.changed(),team);this.detailEditor.open();};
    pattern.querySelector("h2")!.append(this.button("패턴 상세 편집",()=>openDetails(),"btn-pattern-details"),this.library.render());
    patternBody.append(renderTeamPatternEditor({draft:this.draft,initial:this.initialDraft,onOpenDetails:openDetails,selectedDuty:()=>this.selectedDutyId,onChange:render=>this.changed(render),onError:message=>{this.errorMessage=message;this.render();}}));
    if(this.draft.teamSettings.filter(t=>t.isActive!==false).length>4){
      pattern.classList.add("sites-pattern-many-teams");pattern.querySelector("h2")!.append(this.button("휴일 설정",()=>this.openHoliday(),"btn-holiday-policy"),this.button("가이드",()=>this.openGuide(),"btn-pattern-guide"));
    }else patternBody.append(this.renderSupport());
    pattern.append(patternBody); workspace.append(palette, pattern, this.renderCalendar()); this.container.append(workspace);
    if (focus) {
      const selector = focus.id ? `#${CSS.escape(focus.id)}` : focus.team && focus.index !== undefined ? `.sites-pattern-cell[data-team="${CSS.escape(focus.team)}"][data-index="${CSS.escape(focus.index)}"]` : focus.idx !== undefined && focus.cls ? `.${CSS.escape(focus.cls)}[data-idx="${CSS.escape(focus.idx)}"]` : focus.team && focus.cls ? `.${CSS.escape(focus.cls)}[data-team="${CSS.escape(focus.team)}"]` : "";
      const target = selector ? this.container.querySelector<HTMLInputElement>(selector) : null; target?.focus({ preventScroll: true });
      try { if (target && focus.selection !== null) target.setSelectionRange(focus.selection, focus.selection); } catch { /* Number/time fields do not expose a selection range. */ }
    }
  }
  private button(label: string, callback: () => void, id?: string): HTMLButtonElement {
    const b = element("button", "btn-secondary", label); b.type = "button"; b.title = label; if (id) b.id = id; b.addEventListener("click", callback); return b;
  }
  private renderOptions(): HTMLElement {
    const box = element("div", "sites-editor-options"); const primary = this.draft.cycles[0]; const split = primary?.holidayTimeMode === "split";
    box.innerHTML = `<label><input id="chk-weekend-split-toggle" type="checkbox" ${split ? "checked" : ""}/>평일 / 휴일 시간 분리</label><label><input id="chk-weekday-holiday" type="checkbox" ${primary?.weekdayPublicHolidayAsHoliday !== false ? "checked" : ""} ${split ? "" : "disabled"}/>평일 공휴일에도 휴일 시간 적용</label>`;
    box.querySelector<HTMLInputElement>("#chk-weekend-split-toggle")!.addEventListener("change", event => { this.draft.cycles.forEach(c => { c.holidayTimeMode = (event.target as HTMLInputElement).checked ? "split" : "unified"; }); this.changed(); });
    box.querySelector<HTMLInputElement>("#chk-weekday-holiday")!.addEventListener("change", event => { this.draft.cycles.forEach(c => { c.weekdayPublicHolidayAsHoliday = (event.target as HTMLInputElement).checked; }); this.changed(); });
    box.append(element("p","sites-form-help","시간만 다르면 평일/휴일 시간을 분리하세요. 공휴일·요일별 근무 방식은 오른쪽 ‘휴일·공휴일 근무 설정’에서 정합니다."));
    return box;
  }
  private openHoliday(category:HolidayCategory="public"):void {
    this.holidayEditor?.destroy();this.holidayEditor=new SitesHolidayPolicyEditor(this.draft,()=>this.changed());this.holidayEditor.open(category);
  }
  private renderSupport():HTMLElement {
    const root=element("section","sites-pattern-support");root.setAttribute("aria-label","휴일 설정 및 사용 안내");
    const access=element("div","sites-holiday-access");
    const launch=this.button("",()=>this.openHoliday(),"btn-holiday-policy");launch.className="sites-holiday-launch";
    launch.innerHTML='<span class="material-symbols-outlined" aria-hidden="true">event_available</span><span><strong>휴일·공휴일 근무 설정</strong><small>주말 · 법정·대체공휴일의 근무 방식</small></span><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>';
    const categories=element("div","sites-holiday-shortcuts");
    for(const [category,label] of [["public","공휴일"],["saturday","토요일"],["sunday","일요일"]] as const){
      const rule=this.draft.holidayPolicy?.rules[category],button=this.button("",()=>this.openHoliday(category));button.className=`sites-holiday-shortcut ${rule?"is-configured":""}`;button.dataset.holidayCategory=category;
      button.setAttribute("aria-label",`${label} 근무 설정`);button.title=rule?`${label}: ${rule.mode==="normal"?"기본 차례·별도 시간":rule.mode==="off"?"휴무로 대체":"별도 사이클"}`:`${label}: 기본 패턴과 시간 설정 사용`;
      button.append(element("span","",label),element("b","",rule?"설정됨":"기본"));categories.append(button);
    }
    access.append(launch,categories);
    const help=element("div","sites-pattern-help-row");help.append(element("span","","기본 패턴과 휴일 사이클은 날짜대로 계속 진행합니다."),this.button("설정 사용 가이드",()=>this.openGuide(),"btn-pattern-guide"));root.append(access,help);return root;
  }
  private openGuide():void {
    const content=element("div","sites-pattern-guide");
    content.innerHTML=`<p class="sites-guide-intro">대부분의 교대근무는 <b>유형·시간 → 조별 패턴</b>만 설정하면 됩니다. 휴일에 시간이나 교대 방식이 달라지는 근무지만 휴일 규칙을 추가하세요.</p>
      <div class="sites-guide-columns"><section><h3>기본 패턴 만들기</h3><ol>
      <li><b>근무 유형과 시간</b><p>왼쪽 팔레트의 ‘수정’에서 이름·시작·종료·휴게를 지정합니다. 야간처럼 종료가 다음 날이면 자동으로 계산합니다.</p></li>
      <li><b>조별 반복 패턴</b><p>짧은 패턴은 유형을 선택하고 칸을 누릅니다. 긴 패턴은 ‘패턴 상세 편집’에서 조를 고른 뒤 구간 채우기·반복·다른 조 가져오기를 사용하세요. 모든 조의 반복 일수는 같아야 합니다.</p></li>
      <li><b>적용과 실행 취소</b><p>상세창의 ‘초안에 적용’으로 본 화면에 반영합니다. 취소하면 변경 전 상태를 유지합니다. 미지정 칸은 최종 저장 전에 모두 채워야 합니다. ‘초기화’는 이 패턴 화면을 열었을 때의 해당 조 값으로 되돌립니다.</p></li>
      <li><b>저장·불러오기와 미리보기</b><p>‘패턴 저장’은 반복 설정을 이 PC 보관함에 저장합니다. ‘패턴 불러오기’ 후 적용일·시작일을 확인하세요. 아래 달력에서 날짜를 누르면 실제 시간·휴게를 확인할 수 있고, 다음 ‘검토’ 단계에서 월별 산출 시간을 확인합니다.</p></li></ol>
      <p class="sites-guide-note">설정 적용일은 기본 설정 단계에서, 반복 패턴 시작일은 패턴 영역에서 정합니다. 근무지 등록은 마지막 ‘최종 저장 및 적용’으로 완료됩니다.</p></section>
      <section><h3>휴일·공휴일은 이렇게 설정하세요</h3><p>‘휴일·공휴일 근무 설정’에서 <b>공휴일·토요일·일요일을 각각 체크</b>하고 아래 방식 중 하나를 고릅니다.</p>
      <dl><dt>기본 패턴 유지 · 시간만 변경</dt><dd>예: 주말에 1시간 연장. 근무 차례는 유지하고 해당 요일의 시작·종료·휴게만 바꿉니다.</dd>
      <dt>휴무로 대체</dt><dd>체크한 날짜만 모든 조를 휴무로 바꿉니다. 다음 날 기본 패턴은 원래 날짜에 해당하는 차례로 진행합니다.</dd>
      <dt>휴일 근무 별도 지정</dt><dd>예: 평일 3교대 → 주말 2교대. 석간 적용을 해제하고, 모든 조의 휴일 칸을 주간·야간으로 구성하세요. 휴일 사이클 시작일과 반복 칸 수를 함께 지정합니다.</dd></dl>
      <p class="sites-guide-note"><b>공휴일 날짜와 근무 규칙은 별도로 관리합니다.</b> 법정·대체공휴일을 포함한 날짜 목록은 ‘운영 관리 → 공휴일’에서 관리합니다. 이 화면에서는 등록된 그 날짜에 어떤 근무를 적용할지 정합니다.</p>
      <p>겹치는 날짜는 기본적으로 공휴일 규칙이 우선합니다. 휴일 설정에서 토·일요일 우선으로 바꿀 수 있습니다. 기본 패턴·별도 휴일 사이클 모두 달력 날짜대로 진행하며 멈추지 않습니다.</p>
      <p>야간근무는 시작 날짜 기준입니다. 조별 휴일 시간은 휴일 설정의 ‘시간 적용 대상’에서, 행사·단축근무·개인 휴무·대체 투입은 ‘날짜·개인 예외’에서 설정하세요. 예외는 근무지 전체 → 조 → 개인 순서로 반영됩니다. 같은 대상의 겹치는 기간은 먼저 정리해야 합니다. 한 근무지만의 휴무일을 공통 공휴일 목록에 추가하지 마세요.</p>
      <p>‘평일/휴일 시간 분리’는 공통 휴일 시간을 지정하는 옵션입니다. 날짜 종류별로 세분화한 규칙이 있으면 해당 규칙을 먼저 적용하고, 없는 날은 기본 시간 설정을 따릅니다.</p></section></div>`;
    this.guideDialog.open({id:"sites-pattern-guide-modal",title:"근무 설정 사용 가이드",width:"1060px",content,buttons:[
      {id:"btn-guide-close",label:"닫기",onClick:()=>this.guideDialog.close()},
      {id:"btn-guide-pattern",label:"패턴 상세 편집",onClick:()=>{this.guideDialog.close();this.detailEditor?.destroy();this.detailEditor=new SitesPatternDialog(this.draft,()=>this.changed());this.detailEditor.open();}},
      {id:"btn-guide-holiday",label:"휴일·공휴일 설정",variant:"primary",onClick:()=>{this.guideDialog.close();this.openHoliday();}}
    ]});
  }
  private renderPaintBar(): HTMLElement {
    const bar = element("div", "sites-palette-bar sites-paint-toolbar"); bar.append(element("span", "sites-form-label", "칠하기"));
    for (const duty of this.draft.dutyTypes) {
      const code = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes)[duty.id];
      const b = this.button(duty.label, () => { this.selectedDutyId = duty.id; this.syncPaintLabels(); }); b.className = `sites-duty-choice duty-${code}`; b.dataset.dutyId = duty.id; b.setAttribute("aria-pressed", String(duty.id === this.selectedDutyId)); bar.append(b);
    }
    const undo = this.button("실행 취소", () => { const previous = this.historyManager.undo(this.draft); if (previous) { for (const key of Object.keys(this.draft)) Reflect.deleteProperty(this.draft,key); Object.assign(this.draft, previous); this.onChange(); this.render(); } }, "btn-pattern-undo"); undo.disabled = !this.historyManager.canUndo(this.draft);
    const redo = this.button("다시 실행", () => { const next = this.historyManager.redo(this.draft); if (next) { for (const key of Object.keys(this.draft)) Reflect.deleteProperty(this.draft,key); Object.assign(this.draft, next); this.onChange(); this.render(); } }, "btn-pattern-redo"); redo.disabled = !this.historyManager.canRedo(this.draft);
    bar.append(undo, redo); return bar;
  }
  private syncPaintLabels(): void {
    this.container.querySelectorAll<HTMLButtonElement>(".sites-duty-choice").forEach(b => { const d = this.draft.dutyTypes.find(d => d.id === b.dataset.dutyId); if (d) b.textContent = d.label; b.setAttribute("aria-pressed", String(b.dataset.dutyId === this.selectedDutyId)); });
    this.container.querySelectorAll<HTMLElement>(".sites-pattern-cell").forEach(cell => { const label = cell.querySelector("b"); if (label) label.textContent = this.dutyLabel(cell.dataset.duty || "", this.draft.dutyTypes); });
    const undo = this.container.querySelector<HTMLButtonElement>("#btn-pattern-undo"); if (undo) undo.disabled = !this.historyManager.canUndo(this.draft);
    const redo = this.container.querySelector<HTMLButtonElement>("#btn-pattern-redo"); if (redo) redo.disabled = !this.historyManager.canRedo(this.draft);
  }
  private dutyLabel(code: string, duties: ShiftPatternDutyTypeInput[]): string {
    if (code === "—") return "—";
    if (isOffDutyCode(code)) { const off = duties.filter(d => d.kind === "off"); return off.length === 1 ? off[0].label : "휴무"; }
    return findDutyTypeByCode(code, duties)?.label || ({ D: "주간", E: "석간", N: "야간" } as Record<string, string>)[code] || code;
  }
  private refreshSimulation(): void { const old = this.container.querySelector("#sites-simulation-section"); if (old) old.replaceWith(this.renderCalendar()); }
  private renderCalendar(): HTMLElement {
    const section = element("section", "sites-editor-column sites-simulation-column"); section.id = "sites-simulation-section"; section.setAttribute("aria-label", "3개월 근무 미리보기");
    section.append(element("h2", "sites-editor-heading", "3개월 시뮬레이션"));
    const controls = element("div", "sites-calendar-controls"); const teamSelect = element("select", "sites-form-select"); teamSelect.id = "sel-sim-team"; teamSelect.setAttribute("aria-label", "미리보기 조");
    const teams = this.draft.teamSettings.filter(t => t.isActive !== false); if (!teams.some(t => t.teamLabel === this.selectedSimTeam)) this.selectedSimTeam = teams[0]?.teamLabel || "";
    for (const team of teams) { const o = element("option", "", team.displayName || team.teamLabel); o.value = team.teamLabel; teamSelect.append(o); } teamSelect.value = this.selectedSimTeam;
    teamSelect.addEventListener("change", () => { this.selectedSimTeam = teamSelect.value; this.refreshSimulation(); });
    const date = element("input", "sites-form-input"); date.type = "date"; date.id = "sites-sim-start-date"; date.value = `${this.selectedCalendarMonth}-01`; date.setAttribute("aria-label", "미리보기 기준월을 선택할 날짜");
    date.addEventListener("change", () => { if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return; this.selectedCalendarMonth = date.value.slice(0, 7); this.refreshSimulation(); void this.loadHolidayData(); }); controls.append(teamSelect, date); section.append(controls);
    const body = element("div", "sites-editor-scroll sites-calendar-scroll");
    body.append(element("p", "sites-form-help", "날짜 선택: 시간 확인 · —: 적용 전/근무 없음"));
    if (this.holidayState !== "ready") body.append(element("p", "sites-form-help sites-holiday-note", this.holidayState === "loading" ? "공휴일을 확인하고 있습니다." : "공휴일 확인이 필요합니다. 휴일 시간은 다시 조회한 뒤 확인해 주세요."));
    const legend = element("div", "sites-calendar-legend"); const codes = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes); for (const duty of this.draft.dutyTypes.filter(d => d.kind === "work")) legend.append(element("span", `duty-${codes[duty.id]}`, duty.label)); legend.append(element("span", "duty-O", this.dutyLabel("O", this.draft.dutyTypes))); body.append(legend);
    const validation = validatePatternDraft(this.draft, "미리보기", this.options.existingPatterns);
    if (!validation.isValid) { const alert = element("div", "sites-editor-alert", `설정을 확인해 주세요. ${validation.issues.slice(0, 4).map(i => i.message).join(" · ")}`); alert.setAttribute("role", "alert"); body.append(alert); section.append(body); return section; }
    const result = runThreeMonthSimulation({ draft: this.draft, startMonth: this.selectedCalendarMonth, existingPatterns: this.options.existingPatterns, publicHolidayDates: this.holidayState === "ready" ? this.holidayDates : undefined });
    const months = element("div", "sites-sim-months-row");
    for (const month of result.months) {
      const box = element("div", "sites-sim-month-box"); box.append(element("h3", "sites-sim-month-title", `${month.scheduleMonth.replace("-", "년 ")}월 · ${month.dates.length}일`));
      const applied = month.appliedPattern;
      const info = element("p", "sites-applied-pattern", applied ? `${month.isDraftPattern ? "편집 중인 설정" : "저장된 설정"} · ${applied.name} · 적용일 ${applied.effectiveFrom || "미지정"}` : "이달에 적용할 설정이 없습니다."); info.title = info.textContent || ""; box.append(info);
      const grid = element("div", "sites-sim-grid"); ["일", "월", "화", "수", "목", "금", "토"].forEach((day, i) => grid.append(element("div", `sites-sim-day-head ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`, day)));
      if (month.dates.length) for (let i = 0; i < new Date(`${month.dates[0]}T12:00:00`).getDay(); i++) grid.append(element("div", "sites-sim-empty"));
      const map = month.teamDailyDuty.get(this.selectedSimTeam), duties = applied?.dutyTypes || this.draft.dutyTypes;
      for (const workDate of month.dates) {
        const code = map?.get(workDate) || "—", label = this.dutyLabel(code, duties), item = month.items.find(i => i.teamLabel === this.selectedSimTeam && i.workDate === workDate);
        const cell = element("button", `sites-sim-cell duty-${code === "—" ? "none" : code}`); cell.type = "button"; cell.dataset.date = workDate; cell.dataset.team = this.selectedSimTeam; cell.dataset.duty = code;
        const summary = `${workDate} · ${label}${item?.startTime ? ` · ${item.startTime}~${item.endTime} · 휴게 ${item.breakMinutes || 0}분` : ""}`;
        cell.title = summary; cell.setAttribute("aria-label", summary); if (this.holidayDates.has(workDate)) cell.classList.add("sites-sim-holiday");
        cell.append(element("span", "", String(Number(workDate.slice(8)))), element("b", "", label));
        cell.addEventListener("click", () => { const detail = section.querySelector<HTMLElement>(".sites-calendar-day-detail"); if (detail) detail.textContent = `${summary} · ${applied?.name || "미적용"}`; }); grid.append(cell);
      } box.append(grid); months.append(box);
    }
    body.append(months, element("p", "sites-form-help", "월간 근무표와 동일하게 월 1일 기준 설정을 사용합니다. 월중 신규 설정은 기존 설정이 있으면 다음 달부터 보일 수 있습니다."));
    if (this.draft.dutyTypes.filter(d => d.kind === "off").length > 1) body.append(element("p", "sites-form-help", "여러 휴무 유형은 달력에서 ‘휴무’로 함께 표시합니다."));
    const detail = element("p", "sites-calendar-day-detail", this.draft.holidayPolicy?.dateExceptions?.some(r=>r.scope==="employee")?"조별 대표 달력 · 개인 변경은 ‘날짜·개인 예외 → 결과 미리보기’에서 확인 · 날짜를 누르면 시간·휴게 표시":"날짜 선택: 시간·휴게 확인 · 월 1일 기준 설정 사용(월중 변경은 다음 달에 보일 수 있음) · —: 적용 전/근무 없음"); detail.setAttribute("role", "status"); section.append(body, detail); return section;
  }
}
