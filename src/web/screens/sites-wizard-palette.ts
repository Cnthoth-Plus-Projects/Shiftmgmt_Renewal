// sites-wizard-palette.ts — 마법사 1-B 하위 컴포넌트: 근무/휴무 유형 팔레트 편집
import { getDutyCodes } from "./sites-pattern-model";
import { showNotice } from "./operations-ui";
import type { ShiftPatternDutyTypeInput } from "../../shared/bridge/contracts";
import { calculateAutomaticBreakMinutes, calculateDurationMinutes } from "../../shared/domain/calculation";
import { WorkforceDialog } from "./workforce-dialog";

export interface SitesWizardPaletteOptions {
  container: HTMLElement;
  dutyTypes: ShiftPatternDutyTypeInput[];
  isHolidaySplit: boolean;
  onChange: (updatedDutyTypes: ShiftPatternDutyTypeInput[]) => void;
}

export class SitesWizardPalette {
  private container: HTMLElement;
  private dutyTypes: ShiftPatternDutyTypeInput[];
  private isHolidaySplit: boolean;
  private onChange: (updatedDutyTypes: ShiftPatternDutyTypeInput[]) => void;
  private dialog = new WorkforceDialog();
  private editingIdx: number | null = null;
  private editMount: HTMLElement | null = null;

  constructor(options: SitesWizardPaletteOptions) {
    this.container = options.container;
    this.dutyTypes = JSON.parse(JSON.stringify(options.dutyTypes));
    this.isHolidaySplit = options.isHolidaySplit;
    this.onChange = options.onChange;
  }

  public updateHolidaySplit(isHolidaySplit: boolean): void {
    this.isHolidaySplit = isHolidaySplit;
    this.render();
  }

  public render(): void {
    if (this.editingIdx === null) { this.renderSummary(); return; }
    const target = this.editMount!;
    const active = document.activeElement as HTMLInputElement | null;
    const focusClass = active && target.contains(active) ? active.classList[1] : null;
    target.replaceChildren();

    const duty = this.dutyTypes[this.editingIdx!], idx = this.editingIdx!;
    const wrapper = document.createElement("div"); wrapper.className = "sites-duty-time-form";
    const times = (holiday: boolean) => {
      const prefix = holiday ? "duty-h-" : "duty-";
      const start = holiday ? duty.holidayStartTime ?? duty.startTime : duty.startTime;
      const end = holiday ? duty.holidayEndTime ?? duty.endTime : duty.endTime;
      const rest = holiday ? duty.holidayBreakMinutes ?? duty.breakMinutes : duty.breakMinutes;
      const net=start&&end ? calculateDurationMinutes({startTime:start,endTime:end,breakMinutes:rest??0}) : 0;
      return `<section class="sites-time-card ${holiday ? "holiday" : ""}"><h3>${holiday ? "휴일 기본 시간" : "기본 근무 시간"}</h3><div class="sites-time-fields">
        <label>시작 시간<input type="time" class="sites-form-input ${prefix}start ${holiday ? "sites-holiday-time-input" : ""}" data-idx="${idx}" value="${start || "09:00"}" required /></label>
        <label>종료 시간<input type="time" class="sites-form-input ${prefix}end ${holiday ? "sites-holiday-time-input" : ""}" data-idx="${idx}" value="${end || "18:00"}" required /></label>
        <label>휴게 (분)<input type="number" class="sites-form-input ${prefix}break ${holiday ? "sites-holiday-time-input" : ""}" data-idx="${idx}" min="0" max="1440" step="1" value="${rest??60}" /></label></div>
        <div class="sites-time-summary"><span>실근무 <b>${Math.floor(net/60)}시간 ${net%60}분</b> · 익일 종료 자동 인식</span>${holiday ? "" : `<button type="button" class="btn-secondary btn-auto-break" data-idx="${idx}">휴게 자동 계산</button>`}</div></section>`;
    };
    wrapper.innerHTML = `<label class="sites-duty-name-label">근무 유형 이름 <span class="sites-required">*</span><input type="text" class="sites-form-input duty-label" data-idx="${idx}" maxlength="100" value="${this.escape(duty.label)}" placeholder="예: 1근, 2근, 주간, 석간" required /></label>
      <p class="sites-form-help">이름을 자유롭게 지정하세요. 이름을 바꿔도 기존 패턴의 연결은 유지됩니다.</p>
      ${duty.kind === "work" ? times(false) + (this.isHolidaySplit ? times(true) : "") : '<p class="sites-form-help">휴무 유형에는 근무·휴게 시간을 적용하지 않습니다.</p>'}
      <p class="sites-form-help">공휴일·토요일·일요일별 적용 여부와 다른 시간은 ‘휴일 규칙 설정’에서 지정할 수 있습니다.</p>`;
    target.appendChild(wrapper);

    wrapper.querySelectorAll<HTMLInputElement>("input[data-idx]").forEach(input => {
      const duty = this.dutyTypes[Number(input.dataset.idx)];
      const field = input.classList.contains("duty-label") ? "이름" : input.classList.contains("duty-h-start") ? "휴일 시작시간" : input.classList.contains("duty-h-end") ? "휴일 종료시간" : input.classList.contains("duty-h-break") ? "휴일 휴게분" : input.classList.contains("duty-start") ? "평일 시작시간" : input.classList.contains("duty-end") ? "평일 종료시간" : "평일 휴게분";
      input.setAttribute("aria-label", `${duty?.label || "근무 유형"} ${field}`);
    });
    // 이벤트 리스너
    wrapper.querySelectorAll<HTMLInputElement>(".duty-label").forEach((el) => {
      el.addEventListener("input", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        this.dutyTypes[idx].label = (e.target as HTMLInputElement).value;
        this.notifyChange();
      });
    });

    // 시간 변경
    wrapper.querySelectorAll<HTMLInputElement>(".duty-start").forEach((el) => {
      el.addEventListener("change", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        this.dutyTypes[idx].startTime = (e.target as HTMLInputElement).value;
        this.recalcAutoBreakIfClean(idx);
        this.notifyChange();
        this.render();
      });
    });

    wrapper.querySelectorAll<HTMLInputElement>(".duty-end").forEach((el) => {
      el.addEventListener("change", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        this.dutyTypes[idx].endTime = (e.target as HTMLInputElement).value;
        this.recalcAutoBreakIfClean(idx);
        this.notifyChange();
        this.render();
      });
    });

    // 휴게시간 수동 입력 시 isBreakDirty 고정
    wrapper.querySelectorAll<HTMLInputElement>(".duty-break").forEach((el) => {
      el.addEventListener("input", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        this.dutyTypes[idx].breakMinutes = isNaN(val) ? 0 : val;
        this.dutyTypes[idx].isBreakDirty = true;
        this.notifyChange();
      });
    });

    // 자동 휴게 버튼
    wrapper.querySelectorAll<HTMLButtonElement>(".btn-auto-break").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt((e.target as HTMLButtonElement).dataset.idx || "0", 10);
        const duty = this.dutyTypes[idx];
        if (duty.startTime && duty.endTime) {
          duty.breakMinutes = calculateAutomaticBreakMinutes({
            startTime: duty.startTime,
            endTime: duty.endTime
          });
          duty.isBreakDirty = false;
          this.notifyChange();
          this.render();
        }
      });
    });

    // 휴일 시간 변경
    wrapper.querySelectorAll<HTMLInputElement>(".duty-h-start").forEach((el) => {
      el.addEventListener("change", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        this.dutyTypes[idx].holidayStartTime = (e.target as HTMLInputElement).value;
        this.notifyChange(); this.render();
      });
    });

    wrapper.querySelectorAll<HTMLInputElement>(".duty-h-end").forEach((el) => {
      el.addEventListener("change", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        this.dutyTypes[idx].holidayEndTime = (e.target as HTMLInputElement).value;
        this.notifyChange(); this.render();
      });
    });

    wrapper.querySelectorAll<HTMLInputElement>(".duty-h-break").forEach((el) => {
      el.addEventListener("input", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        this.dutyTypes[idx].holidayBreakMinutes = isNaN(val) ? 0 : val;
        this.dutyTypes[idx].isHolidayBreakDirty = true;
        this.notifyChange();
      });
    });

    // 삭제 버튼
    wrapper.querySelectorAll<HTMLButtonElement>(".btn-del-duty").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt((e.target as HTMLButtonElement).dataset.idx || "0", 10);
        if (this.dutyTypes.length <= 1) {
          showNotice("유형 확인", "최소 1개 이상의 유형이 필요합니다.", "warning");
          return;
        }
        this.dutyTypes.splice(idx, 1);
        this.notifyChange();
        this.render();
      });
    });
    if (focusClass) wrapper.querySelector<HTMLInputElement>(`.${CSS.escape(focusClass)}`)?.focus();
  }

  public destroy(): void { this.dialog.close(); }

  private renderSummary(): void {
    this.container.replaceChildren();
    const box = document.createElement("div"); box.className = "sites-palette-container sites-palette-summary";
    const workCount = this.dutyTypes.filter(d => d.kind === "work").length;
    const count = document.createElement("div"); count.className = "sites-palette-count"; count.textContent = `근무 ${workCount}/3 · 휴무 ${this.dutyTypes.length - workCount}`; box.append(count);
    const table = document.createElement("table"); table.innerHTML = "<thead><tr><th>유형</th><th>시간</th><th>휴게</th><th>관리</th></tr></thead>";
    const rows = document.createElement("tbody"); const codes = getDutyCodes(this.dutyTypes);
    for (const [idx, duty] of this.dutyTypes.entries()) {
      const row = document.createElement("tr"); row.dataset.duty = codes[duty.id] || "O";
      const name = document.createElement("td"); const badge = document.createElement("span"); badge.className = `sites-summary-duty duty-${row.dataset.duty}`; badge.textContent = duty.label; name.append(badge);
      const times = document.createElement("td"), breaks = document.createElement("td");
      if (duty.kind === "work") {
        times.textContent = `${duty.startTime || "—"} – ${duty.endTime || "—"}`; breaks.textContent = `${duty.breakMinutes ?? 0}분`;
        if (this.isHolidaySplit) {
          times.prepend(document.createTextNode("평일 "));
          const holiday = document.createElement("span"); holiday.className = "sites-summary-holiday"; holiday.textContent = `휴일 ${duty.holidayStartTime || duty.startTime || "—"} – ${duty.holidayEndTime || duty.endTime || "—"}`; times.append(holiday);
          const holidayBreak = document.createElement("span"); holidayBreak.className = "sites-summary-holiday"; holidayBreak.textContent = `${duty.holidayBreakMinutes ?? duty.breakMinutes ?? 0}분`; breaks.append(holidayBreak);
        }
      } else { times.textContent = "근무 없음"; breaks.textContent = "—"; }
      const actions = document.createElement("td");
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn-secondary btn-edit-duty"; edit.dataset.idx = String(idx); edit.textContent = "수정"; edit.setAttribute("aria-label", `${duty.label} 수정`); edit.addEventListener("click", () => this.openEditor(idx));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn-secondary btn-del-duty"; remove.dataset.idx = String(idx); remove.textContent = "삭제"; remove.setAttribute("aria-label", `${duty.label} 삭제`); remove.addEventListener("click", () => { if (this.dutyTypes.length <= 1) { showNotice("유형 확인", "최소 1개 이상의 유형이 필요합니다.", "warning"); return; } this.dutyTypes.splice(idx, 1); this.notifyChange(); this.render(); });
      actions.append(edit, remove); row.append(name, times, breaks, actions); rows.append(row);
    }
    table.append(rows); box.append(table);
    const add = (kind: "work" | "off", text: string, id: string) => {
      const button = document.createElement("button"); button.type = "button"; button.id = id; button.className = "btn-secondary"; button.textContent = text; button.disabled = kind === "work" && workCount >= 3;
      button.addEventListener("click", () => { this.dutyTypes.push({ id: `duty-${kind}-${crypto.randomUUID()}`, kind, label: kind === "work" ? `근무 ${workCount + 1}` : `휴무 ${this.dutyTypes.filter(d => d.kind === "off").length + 1}`, sortOrder: this.dutyTypes.length, ...(kind === "work" ? { startTime: "09:00", endTime: "18:00", breakMinutes: 60, isBreakDirty: false } : { breakMinutes: 0 }) }); this.notifyChange(); this.render(); }); return button;
    };
    const footer = document.createElement("div"); footer.className = "sites-summary-add"; footer.append(add("work", "+ 근무 유형", "btn-add-work-duty"), add("off", "+ 휴무 유형", "btn-add-off-duty")); box.append(footer);
    const help = document.createElement("p"); help.className = "sites-summary-help"; help.textContent = "수정에서 이름·시간·휴게를 편집합니다. 최종 저장 전까지는 초안에만 반영됩니다."; box.append(help); this.container.append(box);
  }

  private openEditor(idx: number): void {
    const before = structuredClone(this.dutyTypes); let applied = false;
    this.editingIdx = idx; this.editMount = document.createElement("div"); this.editMount.className = "sites-palette-column sites-duty-editor";
    this.dialog.open({ id: "sites-duty-editor-modal", title: `${this.dutyTypes[idx].label} 유형 수정`, width: "600px", content: this.editMount, initialFocusSelector: ".duty-label", onClose: () => { if (!applied) this.dutyTypes = before; this.editingIdx = null; this.editMount = null; this.render(); }, buttons: [
      { id: "btn-duty-cancel", label: "취소", onClick: () => this.dialog.close() },
      { id: "btn-duty-apply", label: "초안에 적용", variant: "primary", onClick: () => { if(!this.editMount?.querySelector<HTMLInputElement>(".duty-label")?.reportValidity())return;for(const input of Array.from(this.editMount.querySelectorAll<HTMLInputElement>("input")))if(!input.reportValidity())return;applied = true; this.dialog.close(); this.notifyChange(); } }
    ] }); this.render();
  }

  private recalcAutoBreakIfClean(idx: number): void {
    const duty = this.dutyTypes[idx];
    if (!duty.isBreakDirty && duty.startTime && duty.endTime) {
      duty.breakMinutes = calculateAutomaticBreakMinutes({
        startTime: duty.startTime,
        endTime: duty.endTime
      });
    }
  }

  private notifyChange(): void {
    if (this.editingIdx !== null) return;
    this.onChange(JSON.parse(JSON.stringify(this.dutyTypes)));
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML.replace(/"/g, "&quot;");
  }
}
