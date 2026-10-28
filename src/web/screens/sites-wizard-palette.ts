// sites-wizard-palette.ts — 마법사 1-B 하위 컴포넌트: 근무/휴무 유형 팔레트 편집
import { showNotice } from "./operations-ui";
import type { ShiftPatternDutyTypeInput } from "../../shared/bridge/contracts";
import { calculateAutomaticBreakMinutes } from "../../shared/domain/calculation";

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
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "sites-palette-container";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "12px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.innerHTML = `
      <div style="font-size:13px; font-weight:bold; color:var(--text, #1F2430);">
        근무 및 휴무 유형 설정 (근무형 최대 3개, 휴무형 다수 등록 가능)
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn-secondary" id="btn-add-work-duty" ${this.dutyTypes.filter(t=>t.kind==="work").length>=3?"disabled":""} style="font-size:11px; height:26px;">+ 근무형 추가</button>
        <button type="button" class="btn-secondary" id="btn-add-off-duty" style="font-size:11px; height:26px;">+ 휴무형 추가</button>
      </div>
    `;
    wrapper.appendChild(header);

    // 테이블 렌더링
    const table = document.createElement("table");
    table.className = "sites-table";
    table.style.fontSize = "12px";
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:60px;">구분</th>
          <th style="width:100px;">유형 이름</th>
          <th>평일 근무/휴게 시간</th>
          ${this.isHolidaySplit ? "<th>휴일 근무/휴게 시간</th>" : ""}
          <th style="width:60px; text-align:center;">관리</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement("tbody");

    this.dutyTypes.forEach((duty, idx) => {
      const tr = document.createElement("tr");

      const kindBadge =
        duty.kind === "work"
          ? `<span class="sites-palette-chip kind-work" style="background:#EEF1FB; color:#3E56B6; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px;">근무</span>`
          : `<span class="sites-palette-chip kind-off" style="background:#F1F2F4; color:#4B5563; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px;">휴무</span>`;

      let timeInputsHtml = "";
      if (duty.kind === "work") {
        timeInputsHtml = `
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="time" class="sites-form-input duty-start" data-idx="${idx}" style="width:85px; height:26px; padding:2px 4px;" value="${duty.startTime || "09:00"}" />
            <span>~</span>
            <input type="time" class="sites-form-input duty-end" data-idx="${idx}" style="width:85px; height:26px; padding:2px 4px;" value="${duty.endTime || "18:00"}" />
            <span style="margin-left:6px;">휴게:</span>
            <input type="number" class="sites-form-input duty-break" data-idx="${idx}" min="0" step="30" style="width:55px; height:26px; padding:2px 4px;" value="${duty.breakMinutes ?? 60}" />
            <span>분</span>
            <button type="button" class="btn-secondary btn-auto-break" data-idx="${idx}" style="font-size:10px; height:24px; padding:0 6px;">자동</button>
          </div>
        `;
      } else {
        timeInputsHtml = `<span style="color:var(--text-sub, #4B5563); font-size:11px;">(휴무일 — 시간/휴게 없음)</span>`;
      }

      let holidayInputsHtml = "";
      if (this.isHolidaySplit) {
        if (duty.kind === "work") {
          holidayInputsHtml = `
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <input type="time" class="sites-form-input duty-h-start sites-holiday-time-input" data-idx="${idx}" style="width:85px; height:26px; padding:2px 4px;" value="${duty.holidayStartTime || duty.startTime || "09:00"}" />
                <span>~</span>
                <input type="time" class="sites-form-input duty-h-end sites-holiday-time-input" data-idx="${idx}" style="width:85px; height:26px; padding:2px 4px;" value="${duty.holidayEndTime || duty.endTime || "18:00"}" />
                <span style="margin-left:6px;">휴게:</span>
                <input type="number" class="sites-form-input duty-h-break sites-holiday-time-input" data-idx="${idx}" min="0" step="30" style="width:55px; height:26px; padding:2px 4px;" value="${duty.holidayBreakMinutes ?? duty.breakMinutes ?? 60}" />
                <span>분</span>
              </div>
            </td>
          `;
        } else {
          holidayInputsHtml = `<td><span style="color:var(--text-sub, #4B5563); font-size:11px;">-</span></td>`;
        }
      }

      tr.innerHTML = `
        <td>${kindBadge}</td>
        <td>
          <input type="text" class="sites-form-input duty-label" data-idx="${idx}" style="width:90px; height:26px; padding:2px 6px;" value="${this.escape(duty.label)}" />
        </td>
        <td>${timeInputsHtml}</td>
        ${holidayInputsHtml}
        <td style="text-align:center;">
          <button type="button" class="btn-secondary btn-del-duty" data-idx="${idx}" style="font-size:11px; height:24px; color:#C0392B; padding:0 6px;">삭제</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    this.container.appendChild(wrapper);

    // 이벤트 리스너
    wrapper.querySelector("#btn-add-work-duty")?.addEventListener("click", () => {
      const workCount = this.dutyTypes.filter((d) => d.kind === "work").length;
      if (workCount >= 3) {
        showNotice("근무 유형 확인","근무형은 최대 3개까지만 등록할 수 있습니다.","warning");
        return;
      }
      this.dutyTypes.push({
        id: `duty-work-${crypto.randomUUID()}`,
        kind: "work",
        label: `근무 ${workCount + 1}`,
        sortOrder: this.dutyTypes.length,
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60,
        isBreakDirty: false
      });
      this.notifyChange();
      this.render();
    });

    wrapper.querySelector("#btn-add-off-duty")?.addEventListener("click", () => {
      this.dutyTypes.push({
        id: `duty-off-${crypto.randomUUID()}`,
        kind: "off",
        label: `휴무 ${this.dutyTypes.filter((d) => d.kind === "off").length + 1}`,
        sortOrder: this.dutyTypes.length,
        breakMinutes: 0
      });
      this.notifyChange();
      this.render();
    });

    // 라벨 변경
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
        this.notifyChange();
      });
    });

    wrapper.querySelectorAll<HTMLInputElement>(".duty-h-end").forEach((el) => {
      el.addEventListener("change", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0", 10);
        this.dutyTypes[idx].holidayEndTime = (e.target as HTMLInputElement).value;
        this.notifyChange();
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
    this.onChange(JSON.parse(JSON.stringify(this.dutyTypes)));
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
