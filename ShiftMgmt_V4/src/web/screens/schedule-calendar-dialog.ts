import type { ScheduleRosterRow } from "./schedule-model";
import { calendarDutyClass, isCalendarOff } from "./schedule-calendar-grid";
import { WorkforceDialog } from "./workforce-dialog";
import { renderPagination } from "../pagination";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
export class ScheduleDayDialog {
  private dialog = new WorkforceDialog(); private mount = el("div", "schedule-day-dialog"); private page = 1; private keyword = "";
  constructor(private date: string, private rows: ScheduleRosterRow[], private isPublicHoliday: boolean) {}
  destroy(): void { this.dialog.close(); }
  open(): void { this.render(); this.dialog.open({ id: "schedule-day-modal", title: `${this.date} · 날짜별 근무`, width: "980px", content: this.mount, initialFocusSelector: "#schedule-day-search", buttons: [{ id: "btn-schedule-day-close", label: "닫기", onClick: () => this.dialog.close() }] }); }
  private render(): void {
    this.mount.replaceChildren(); const rows = this.rows.filter(r => r.days[this.date] && r.days[this.date].dutyCode !== "—"), filtered = rows.filter(r => `${r.name} ${r.employeeCode} ${r.displayName || r.shiftGroup}`.toLocaleLowerCase().includes(this.keyword.toLocaleLowerCase()));
    const workers = rows.filter(r => !isCalendarOff(r.days[this.date].dutyCode)), summary = el("div", "schedule-day-summary");
    summary.append(el("b", "", `${["일", "월", "화", "수", "목", "금", "토"][new Date(`${this.date}T12:00:00Z`).getUTCDay()]}요일`));
    if (this.isPublicHoliday) summary.append(el("span", "schedule-public-holiday-label", "공휴일"));
    summary.append(el("span", "", `근무 ${workers.length}명`), el("span", "", `휴무 ${rows.length - workers.length}명`), el("span", "", `전체 ${rows.length}명`)); this.mount.append(summary);
    const label = el("label", "schedule-day-search-label", "조·이름 찾기"), search = el("input", "schedule-day-search"); search.id = "schedule-day-search"; search.type = "search"; search.placeholder = "조명, 이름 또는 사번"; search.value = this.keyword; label.htmlFor = search.id; label.append(search);
    search.addEventListener("input", () => { const start = search.selectionStart; this.keyword = search.value; this.page = 1; this.render(); const input = this.mount.querySelector<HTMLInputElement>("#schedule-day-search")!; input.focus(); try { input.setSelectionRange(start, start); } catch { /* Search inputs may not expose a selection range. */ } }); this.mount.append(label);
    const table = el("table", "schedule-day-table"), head = el("thead"), hr = el("tr"); for (const text of ["조", "이름", "근무 유형", "근무 시간", "휴게", "실근무"]) hr.append(el("th", "", text)); head.append(hr); table.append(head);
    const body = el("tbody"), totalPages = Math.ceil(filtered.length / 10); this.page = Math.max(1, Math.min(this.page, totalPages || 1));
    for (const row of filtered.slice((this.page - 1) * 10, this.page * 10)) {
      const info = row.days[this.date], off = isCalendarOff(info.dutyCode), tr = el("tr"); tr.dataset.rowKey = row.rowKey;
      const name = el("td", "", row.name); name.title = row.employeeCode;
      const duty = el("td"); duty.append(el("span", `duty-badge ${calendarDutyClass(info.dutyCode)}`, info.dutyLabel));
      const overnight = info.startTime && info.endTime && info.endTime <= info.startTime;
      tr.append(el("td", "", row.displayName || row.shiftGroup), name, duty, el("td", "", off ? "—" : info.startTime && info.endTime ? `${info.startTime} ~ ${info.endTime}${overnight ? " (익일)" : ""}` : "시간 미등록"), el("td", "", off ? "—" : `${info.unpaidBreakMinutes ?? 0}분`), el("td", "", off ? "—" : `${Math.floor((info.actualWorkMinutes ?? 0) / 60)}시간 ${(info.actualWorkMinutes ?? 0) % 60}분`)); body.append(tr);
    }
    if (!filtered.length) { const tr = el("tr"), td = el("td", "schedule-day-empty", rows.length ? "검색 결과가 없습니다. 조명이나 이름을 다시 확인해 주세요." : "이 날짜에 배정된 근무가 없습니다. 배정 기간과 대상 인원을 확인해 주세요."); td.colSpan = 6; tr.append(td); body.append(tr); }
    table.append(body); const viewport = el("div", "schedule-day-table-viewport"); viewport.append(table); this.mount.append(viewport);
    const footer = el("div", "pagination-footer"); footer.append(el("span", "", `조회 ${filtered.length}명 · ${filtered.length ? (this.page - 1) * 10 + 1 : 0}–${Math.min(this.page * 10, filtered.length)}명`), renderPagination({ currentPage: this.page, totalPages, totalCount: filtered.length, idPrefix: "schedule-day", label: "날짜별 근무자 페이지", onPageChange: p => { this.page = p; this.render(); } })); this.mount.append(footer, el("p", "schedule-calendar-hint", "선택한 근무표의 예정 근무를 보여줍니다. 공휴일 날짜는 운영 관리의 목록을 사용하며, 근무 시간은 해당 근무표의 값을 표시합니다."));
  }
}
