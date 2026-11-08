import { HOLIDAY_CATEGORIES, parseHolidayPatternPolicy, validateHolidayPolicy } from "../../shared/domain/holiday-pattern";
import type { HolidayCategory, HolidayPatternPolicy, HolidayRule } from "../../shared/domain/holiday-pattern";
import type { PatternDraft } from "./sites-pattern-model";
import { getDutyCodes } from "./sites-pattern-model";
import { projectTeamPatterns, guiBaseDate } from "./sites-team-pattern";
import { WorkforceDialog } from "./workforce-dialog";

const labels: Record<HolidayCategory, string> = { public: "법정 공휴일", saturday: "토요일", sunday: "일요일" };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
/** Owns a detached copy: Cancel/Escape never changes the wizard draft. */
export class SitesHolidayPolicyEditor {
  private dialog = new WorkforceDialog();
  private category: HolidayCategory = "public";
  private policy: HolidayPatternPolicy;
  private mount = el("div", "sites-holiday-editor");
  private paint = "D";
  private timeTeam = "";
  constructor(private draft: PatternDraft, private onApply: () => void) {
    this.policy = structuredClone(draft.holidayPolicy ?? { version: 1, rules: {} });
  }
  public destroy(): void { this.dialog.close(); }
  public open(category:HolidayCategory="public"): void {
    this.category=category;this.render();
    this.dialog.open({ id: "sites-holiday-policy-modal", title: "휴일·공휴일 근무 설정", width: "1120px", content: this.mount, initialFocusSelector: "input", buttons: [
      { id: "btn-holiday-cancel", label: "취소", onClick: () => this.dialog.close() },
      { id: "btn-holiday-apply", label: "초안에 적용", variant: "primary", onClick: () => {
        for (const input of Array.from(this.mount.querySelectorAll<HTMLInputElement>("input"))) if (!input.reportValidity()) return;
        const codes = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes);
        for (const rule of Object.values(this.policy.rules)) if (rule.mode !== "off") {
          rule.times ??= {};
          for (const duty of this.draft.dutyTypes.filter(d => d.kind === "work")) rule.times[codes[duty.id]] ??= this.defaultTiming(duty);
        }
        const message = validateHolidayPolicy(this.policy, this.draft.teamSettings.filter(t => t.isActive !== false).map(t => t.teamLabel), Object.values(getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes)),this.draft.effectiveFrom);
        if (message) { this.showError(message); return; }
        this.draft.holidayPolicy = parseHolidayPatternPolicy(this.policy); this.dialog.close(); this.onApply();
      } }
    ] });
  }
  private showError(message: string): void { const box = this.mount.querySelector<HTMLElement>(".sites-editor-alert"); if (box) { box.textContent = message; box.hidden = false; } }
  private newRule(): HolidayRule { return { mode: "normal", excludedDutyCodes: [] }; }
  private defaultTiming(duty: PatternDraft["dutyTypes"][number]) { return { startTime: duty.holidayStartTime ?? duty.startTime ?? "09:00", endTime: duty.holidayEndTime ?? duty.endTime ?? "18:00", breakMinutes: duty.holidayBreakMinutes ?? duty.breakMinutes ?? 0 }; }
  private seedRows(rule: HolidayRule, length?: number): void {
    const rows = projectTeamPatterns(this.draft);
    const previous = rule.teamPatterns ?? {};
    const n = length ?? Object.values(previous)[0]?.length ?? rows[0]?.steps.length ?? 8;
    rule.startDate ||= guiBaseDate(this.draft);
    rule.teamPatterns = Object.fromEntries(rows.map(row => [row.teamLabel, Array.from({ length: n }, (_, i) => previous[row.teamLabel]?.[i] ?? row.steps[i % row.steps.length]?.dutyCode ?? "O")]));
  }
  private render(): void {
    this.mount.replaceChildren();
    this.mount.append(el("p", "sites-holiday-guide", "기본 패턴은 휴일에도 멈추지 않고 달력 날짜대로 진행합니다. 선택한 날의 근무만 아래 규칙으로 바꿉니다. 별도 휴일 사이클도 지정 시작일부터 매일 진행됩니다."));
    const alert = el("div", "sites-editor-alert"); alert.hidden = true; alert.setAttribute("role", "alert"); this.mount.append(alert);
    const tabs = el("div", "sites-holiday-tabs");
    for (const c of HOLIDAY_CATEGORIES) {
      const box = el("div", c === this.category ? "active" : "");
      const check = el("input"); check.type = "checkbox"; check.checked = !!this.policy.rules[c]; check.dataset.category = c; check.setAttribute("aria-label", `${labels[c]} 별도 규칙 사용`);
      check.addEventListener("change", () => { if (check.checked) this.policy.rules[c] = this.newRule(); else delete this.policy.rules[c]; this.category = c; this.render(); });
      const button = el("button", "", labels[c]); button.type = "button"; button.setAttribute("aria-pressed", String(c === this.category)); button.addEventListener("click", () => { this.category = c; this.render(); }); box.append(check, button); tabs.append(box);
    }
    this.mount.append(tabs, el("p", "sites-form-help", "체크한 날짜 종류에만 별도 규칙을 사용합니다. 체크하지 않은 날은 기존 기본 패턴·시간 설정을 따릅니다."));
    const priorityLabel = el("label", "sites-holiday-priority", "공휴일이 주말과 겹칠 때 근무편성 "), priority = el("select", "sites-form-input");
    priority.setAttribute("aria-label", "공휴일과 주말 우선순위");
    for (const [value, text] of [["public", "공휴일 근무편성 우선 (기본)"], ["weekend", "토·일요일 근무편성 우선"]]) { const option = el("option", "", text); option.value = value; priority.append(option); }
    priority.value = this.policy.overlapPriority ?? "public";
    priority.addEventListener("change", () => { this.policy.overlapPriority = priority.value as "public" | "weekend"; });
    priorityLabel.append(priority); this.mount.append(priorityLabel, el("p", "sites-form-help", "두 규칙을 모두 켠 날짜에만 우선순위를 적용합니다. 한쪽만 켜면 그 규칙을 사용합니다."));
    this.mount.append(el("p", "sites-form-help", "수당의 공휴일 여부는 공휴일 DB로 판단합니다. 일반 토·일 근무표만으로 휴일수당이 생기지 않습니다. 공휴일이 토·일과 겹치면 근무편성은 위 선택을 따르고, 시간은 해당 토·일의 조별·공통 설정을 우선합니다. 별도 시간이 없으면 기존 시간을 유지하며 휴무를 근무로 바꾸지 않습니다."));
    this.mount.append(el("p","sites-holiday-steps","① 적용할 날짜 종류 체크 → ② 근무 방식 선택 → ③ 시간·조별 사이클 지정 → ④ 초안에 적용"));
    if(this.category==="public")this.mount.append(el("p","sites-form-help","법정·대체공휴일을 포함해 ‘운영 관리 → 공휴일’에 등록된 날짜에 적용합니다. 여기서는 그날의 근무 방식만 설정합니다."));
    const rule = this.policy.rules[this.category];
    if (!rule) { this.mount.append(el("p", "sites-holiday-empty", `${labels[this.category]} 규칙을 사용하려면 위 체크박스를 선택하세요.`)); return; }
    const mode = el("div", "sites-holiday-modes");
    for (const [value, title, help] of [["normal", "기본 패턴 유지", "근무 차례는 유지하고 시간만 변경"], ["off", "휴무로 대체", "해당 날짜만 휴무 · 기본 차례는 계속 진행"], ["separate", "휴일 근무 별도 지정", "예: 평일 3교대 → 휴일 2교대"]]) {
      const label = el("label"), radio = el("input"); radio.type = "radio"; radio.name = "holiday-mode"; radio.value = value; radio.checked = rule.mode === value;
      radio.addEventListener("change", () => { rule.mode = value as HolidayRule["mode"]; if (value === "separate") this.seedRows(rule); this.render(); });
      label.append(radio, el("b", "", title), el("small", "", help)); mode.append(label);
    }
    this.mount.append(mode);
    if (rule.mode === "off") { this.mount.append(el("p", "sites-holiday-guide", "이 날짜는 모든 조가 휴무입니다. 다음 날의 기본 근무는 원래 달력 날짜에 해당하는 차례로 이어집니다.")); return; }
    const layout=el("div","sites-holiday-rule-layout"),timePanel=el("section","sites-holiday-times"),cyclePanel=el("section","sites-holiday-cycle");layout.append(timePanel,cyclePanel);this.mount.append(layout);
    const scope=el("label","sites-holiday-time-scope","시간 적용 대상 "),teamSelect=el("select","sites-form-input");teamSelect.setAttribute("aria-label","휴일 시간 적용 대상");
    for(const [value,text]of [["","모든 조 공통"],...this.draft.teamSettings.filter(t=>t.isActive!==false).map(t=>[t.teamLabel,`${t.displayName||t.teamLabel} 전용 시간`])]){const o=el("option","",text);o.value=value;teamSelect.append(o);}teamSelect.value=this.timeTeam;
    teamSelect.addEventListener("change",()=>{this.timeTeam=teamSelect.value;this.render();});scope.append(teamSelect);
    if(this.timeTeam){const reset=el("button","btn-secondary","공통 시간으로 되돌리기");reset.type="button";reset.addEventListener("click",()=>{if(rule.teamTimes)delete rule.teamTimes[this.timeTeam];this.render();});scope.append(reset);}
    timePanel.append(scope,el("p","sites-form-help",this.timeTeam?"이 조에서 수정한 유형의 시간만 우선합니다. 수정하지 않은 유형은 공통 시간을 사용합니다. 유형 적용 체크는 모든 조에 공통입니다.":"모든 조가 사용하는 시간입니다. 특정 조만 다르면 위 목록에서 해당 조를 선택하세요."));
    const codes = getDutyCodes(this.draft.dutyTypes, this.draft.dutyCodes), duties = this.draft.dutyTypes.filter(d => d.kind === "work");
    const table = el("table", "sites-holiday-time-table"); table.innerHTML = "<thead><tr><th>적용</th><th>유형</th><th>시작</th><th>종료</th><th>휴게 (분)</th></tr></thead>";
    const tbody = el("tbody");
    for (const duty of duties) {
      const code = codes[duty.id], row = el("tr"), eligible = el("input"); eligible.type = "checkbox"; eligible.checked = !rule.excludedDutyCodes.includes(code); eligible.dataset.code = code; eligible.setAttribute("aria-label", `${labels[this.category]} ${duty.label} 적용`);
      eligible.addEventListener("change", () => { rule.excludedDutyCodes = rule.excludedDutyCodes.filter(c => c !== code); if (!eligible.checked) rule.excludedDutyCodes.push(code); });
      const cell = el("td"); cell.append(eligible); const name = el("td"); name.append(el("span", `sites-summary-duty duty-${code}`, duty.label)); row.append(cell, name);
      const fallback = this.timeTeam ? rule.times?.[code] ?? this.defaultTiming(duty) : this.defaultTiming(duty);
      const current = this.timeTeam ? rule.teamTimes?.[this.timeTeam]?.[code] : rule.times?.[code];
      for (const field of ["startTime", "endTime", "breakMinutes"] as const) {
        const td = el("td"), input = el("input", "sites-form-input"); input.type = field === "breakMinutes" ? "number" : "time"; input.value = String(current?.[field] ?? fallback[field]); input.required = true;
        if (field === "breakMinutes") { input.min = "0"; input.max = "1440"; input.step = "1"; }
        input.setAttribute("aria-label", `${labels[this.category]} ${duty.label} ${field === "startTime" ? "시작" : field === "endTime" ? "종료" : "휴게 분"}`);
        input.addEventListener("change", () => { if (!input.reportValidity()) return; rule.times ??= {}; const times=this.timeTeam?((rule.teamTimes??={})[this.timeTeam]??={}):rule.times;const timing = times[code] ?? { ...fallback }; if (field === "breakMinutes") timing.breakMinutes = Number(input.value); else timing[field] = input.value; times[code] = timing; }); td.append(input); row.append(td);
      }
      tbody.append(row);
    }
    table.append(tbody); timePanel.append(table, el("p", "sites-form-help", "유형 체크를 해제하면 해당 유형이 오는 날은 휴무로 대체합니다. 기본 패턴의 차례는 그대로 진행합니다. 별도 사이클에서는 적용할 유형으로 칸을 다시 구성하세요."), el("p", "sites-form-help", "초안에 적용하면 표시된 휴일 시간이 별도로 저장됩니다. 이후 기본 유형의 시간을 바꿀 때는 이 시간도 확인하세요. 야간근무는 시작 날짜의 규칙을 적용하며, 시작과 종료가 같으면 24시간 근무입니다."));
    if (rule.mode !== "separate") { layout.classList.add("normal-mode"); cyclePanel.append(el("p","sites-holiday-guide","이 휴일의 시간만 변경합니다. 근무 차례는 기본 패턴을 그대로 따릅니다.")); return; }
    this.seedRows(rule);
    const controls = el("div", "sites-holiday-cycle-controls"), dateLabel = el("label", "", "휴일 사이클 시작일 "), date = el("input", "sites-form-input"); date.type = "date"; date.value = rule.startDate!; date.required = true; date.setAttribute("aria-label", "휴일 사이클 시작일"); date.addEventListener("change", () => { rule.startDate = date.value; }); dateLabel.append(date);
    const lengthLabel = el("label", "", "반복 칸 수 "), length = el("input", "sites-form-input"); length.type = "number"; length.min = "1"; length.max = "1000"; length.value = String(Object.values(rule.teamPatterns!)[0].length); length.setAttribute("aria-label", "휴일 사이클 반복 칸 수"); lengthLabel.append(length);
    const resize = el("button", "btn-secondary", "칸 수 적용"); resize.type = "button"; resize.addEventListener("click", () => { if (!length.reportValidity()) return; this.seedRows(rule, Number(length.value)); this.render(); }); controls.append(dateLabel, lengthLabel, resize); cyclePanel.append(controls);
    const paints = el("div", "sites-palette-bar");
    for (const duty of this.draft.dutyTypes) { const code = codes[duty.id], button = el("button", `sites-duty-choice duty-${code}`, duty.label); button.type = "button"; button.dataset.holidayPaint = code; button.setAttribute("aria-pressed", String(this.paint === code)); button.addEventListener("click", () => { this.paint = code; this.render(); }); paints.append(button); }
    cyclePanel.append(paints);
    for (const team of this.draft.teamSettings.filter(t => t.isActive !== false)) {
      const row = el("div", "sites-holiday-pattern-row"), cells = el("div", "sites-holiday-pattern-cells"); row.append(el("b", "", team.displayName || team.teamLabel));
      rule.teamPatterns![team.teamLabel].forEach((code, index) => {
        const label = this.draft.dutyTypes.find(d => codes[d.id] === code)?.label || code, button = el("button", `sites-pattern-cell duty-${code}`, label); button.type = "button"; button.dataset.team = team.teamLabel; button.dataset.index = String(index); button.setAttribute("aria-label", `${team.displayName || team.teamLabel} 휴일 ${index + 1}일차 ${label}`);
        button.addEventListener("click", () => { if (rule.excludedDutyCodes.includes(this.paint)) { this.showError("적용을 해제한 유형입니다. 적용 체크 후 배치해 주세요."); return; } rule.teamPatterns![team.teamLabel][index] = this.paint; this.render(); }); cells.append(button);
      }); row.append(cells); cyclePanel.append(row);
    }
  }
}
