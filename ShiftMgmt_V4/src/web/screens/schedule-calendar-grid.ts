import type { DayDutyInfo, ScheduleRosterRow } from "./schedule-model";

export interface MonthCell { date: string; inMonth: boolean; }
export function monthCalendarCells(dates: string[]): MonthCell[] {
  if (!dates.length) return [];
  const first = Date.parse(`${dates[0]}T12:00:00Z`), offset = new Date(first).getUTCDay();
  const length = Math.ceil((offset + dates.length) / 7) * 7;
  return Array.from({ length }, (_, i) => {
    const date = new Date(first + (i - offset) * 86400000).toISOString().slice(0, 10);
    return { date, inMonth: date.slice(0, 7) === dates[0].slice(0, 7) };
  });
}
export const isCalendarOff = (code: string): boolean => ["O", "OFF", "X"].includes(code);
export const calendarDutyClass = (code: string): string => code === "D" ? "duty-d" : code === "E" ? "duty-e" : code === "N" ? "duty-n" : isCalendarOff(code) ? "duty-off" : "duty-unassigned";
export interface CalendarTeamDay { team: string; label: string; rows: ScheduleRosterRow[]; workers: ScheduleRosterRow[]; duties: Array<{ code: string; label: string; count: number; timingKey: string; timeLabel: string }>; }
/** Excludes assignment segments with no entry on this date; the sidebar's current page never limits the calendar. */
export function calendarTeamDays(rows: ScheduleRosterRow[], date: string): CalendarTeamDay[] {
  const groups = new Map<string, CalendarTeamDay>();
  for (const row of rows) {
    const info = row.days[date]; if (!info || info.dutyCode === "—") continue;
    const group = groups.get(row.shiftGroup) ?? { team: row.shiftGroup, label: row.displayName || row.shiftGroup, rows: [], workers: [], duties: [] };
    group.rows.push(row); if (!isCalendarOff(info.dutyCode)) group.workers.push(row);
    const timingKey = `${info.startTime || ""}/${info.endTime || ""}/${info.unpaidBreakMinutes ?? ""}`, label = info.dutyLabel || (isCalendarOff(info.dutyCode) ? "휴무" : "근무");
    const duty = group.duties.find(d => d.code === info.dutyCode && d.label === label && d.timingKey === timingKey);
    if (duty) duty.count++; else group.duties.push({ code: info.dutyCode, label, count: 1, timingKey, timeLabel: isCalendarOff(info.dutyCode) ? "" : info.startTime && info.endTime ? `${info.startTime}–${info.endTime}` : "시간 미설정" });
    groups.set(row.shiftGroup, group);
  }
  return [...groups.values()];
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
export interface MonthGridOptions {
  dates: string[]; rows: ScheduleRosterRow[]; publicDates: ReadonlySet<string>; scopeLabel: string;
  focusedDate?: string; navigationDisabled?: boolean;
  readingMode?: boolean; onReadingChange?: (enabled: boolean) => void;
  onDay: (date: string) => void; onMoveMonth: (delta: number) => void; onFocusDate: (date: string) => void;
}
export class ScheduleMonthGrid {
  private observer: ResizeObserver | null = null; private frame: number | null = null; private disposed = false;
  private readingDialog: HTMLDialogElement | null = null;
  private placeholder: Comment | null = null;
  private readingButton: HTMLButtonElement | null = null;
  constructor(private mount: HTMLElement, private options: MonthGridOptions) {}
  destroy(): void { this.disposed = true; this.observer?.disconnect(); if (this.frame !== null) cancelAnimationFrame(this.frame); this.closeReadingView(false); }
  private openReadingView(): void {
    if (this.readingDialog || !this.mount.isConnected) return;
    const dialog = el("dialog", "schedule-reading-dialog"); dialog.id = "schedule-reading-dialog"; dialog.setAttribute("aria-label", "근무 달력 크게 보기");
    this.placeholder = document.createComment("calendar position"); this.mount.replaceWith(this.placeholder); dialog.append(this.mount); document.body.append(dialog);
    this.readingDialog = dialog; this.mount.classList.add("is-reading"); this.readingButton!.textContent = "원래 화면"; this.readingButton!.setAttribute("aria-label", "원래 화면으로 돌아가기"); this.readingButton!.setAttribute("aria-expanded", "true");
    dialog.addEventListener("cancel", event => { event.preventDefault(); this.closeReadingView(); });
    dialog.showModal(); this.options.readingMode = true; this.options.onReadingChange?.(true); this.readingButton!.focus({ preventScroll: true });
  }
  private closeReadingView(notify = true): void {
    const dialog = this.readingDialog; if (!dialog) return;
    this.readingDialog = null; this.placeholder?.replaceWith(this.mount); this.placeholder = null; this.mount.classList.remove("is-reading");
    dialog.close(); dialog.remove();
    if (this.readingButton) { this.readingButton.textContent = "크게 보기"; this.readingButton.setAttribute("aria-label", "달력 크게 보기"); this.readingButton.setAttribute("aria-expanded", "false"); }
    if (notify) { this.options.readingMode = false; this.options.onReadingChange?.(false); this.readingButton?.focus({ preventScroll: true }); }
  }
  private openDay(date: string): void {
    this.options.onDay(date);
    // Keep the existing detail modal inside the native modal's interactive top layer.
    const detail = document.getElementById("schedule-day-modal"); if (detail && this.readingDialog) this.readingDialog.append(detail);
  }
  render(): void {
    if (this.disposed) return;
    const o = this.options; this.mount.replaceChildren();
    if (!o.dates.length) { this.mount.append(el("p", "schedule-empty-desc", "표시할 날짜가 없습니다. 대상 월을 다시 선택하세요.")); return; }
    const month = o.dates[0].slice(0, 7), [year, number] = month.split("-").map(Number), cells = monthCalendarCells(o.dates), weeks = cells.length / 7;
    const header = el("div", "schedule-month-heading"), title = el("div", "schedule-month-title");
    const icon = el("span", "material-symbols-outlined", "calendar_month"); icon.setAttribute("aria-hidden", "true");
    title.append(icon, el("h2", "", `${year}년 ${number}월`), el("span", "schedule-month-scope", o.scopeLabel));
    const nav = el("div", "schedule-month-navigation");
    const reading = el("button", "schedule-reading-toggle", "크게 보기"); reading.type = "button"; reading.id = "btn-schedule-reading"; reading.setAttribute("aria-label", "달력 크게 보기"); reading.setAttribute("aria-haspopup", "dialog"); reading.setAttribute("aria-expanded", "false"); reading.addEventListener("click", () => this.readingDialog ? this.closeReadingView() : this.openReadingView()); this.readingButton = reading; nav.append(reading);
    for (const [delta, label, glyph] of [[-1, "이전 달", "chevron_left"], [1, "다음 달", "chevron_right"]] as const) {
      const b = el("button", "schedule-month-arrow"); b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
      b.disabled = !!o.navigationDisabled || (delta === -1 && month === "1900-01") || (delta === 1 && month === "9999-12");
      const symbol = el("span", "material-symbols-outlined", glyph); symbol.setAttribute("aria-hidden", "true"); b.append(symbol); b.addEventListener("click", () => o.onMoveMonth(delta)); nav.append(b);
    }
    header.append(title, nav); this.mount.append(header);
    const grid = el("div", `schedule-month-grid weeks-${weeks}`); grid.setAttribute("role", "grid"); grid.setAttribute("aria-label", `${year}년 ${number}월 근무 달력`); grid.setAttribute("aria-colcount", "7");
    const weekdays = el("div", "schedule-month-weekdays"); weekdays.setAttribute("role", "row");
    ["일", "월", "화", "수", "목", "금", "토"].forEach((day, i) => { const c = el("div", i === 0 ? "is-sunday" : i === 6 ? "is-saturday" : "", day); c.setAttribute("role", "columnheader"); weekdays.append(c); }); grid.append(weekdays);
    const body = el("div", "schedule-month-weeks"); body.setAttribute("role", "rowgroup");
    const today = new Date().toLocaleDateString("sv-SE"), focused = o.dates.includes(o.focusedDate || "") ? o.focusedDate : o.dates.includes(today) ? today : o.dates[0];
    for (let week = 0; week < weeks; week++) {
      const row = el("div", "schedule-month-week"); row.setAttribute("role", "row");
      for (const cell of cells.slice(week * 7, week * 7 + 7)) {
        const wrapper = el("div", "schedule-month-cell"); wrapper.setAttribute("role", "gridcell");
        if (!cell.inMonth) { wrapper.classList.add("is-other-month"); wrapper.append(el("span", "schedule-adjacent-date", String(Number(cell.date.slice(8))))); wrapper.setAttribute("aria-label", `${cell.date} · 대상 월 아님`); row.append(wrapper); continue; }
        const dow = new Date(`${cell.date}T12:00:00Z`).getUTCDay(), holiday = o.publicDates.has(cell.date), groups = calendarTeamDays(o.rows, cell.date), workers = groups.flatMap(g => g.workers);
        const day = el("article", `schedule-month-day ${dow === 0 ? "is-sunday" : dow === 6 ? "is-saturday" : ""} ${holiday ? "is-public-holiday" : ""} ${cell.date === today ? "is-today" : ""}`);
        day.dataset.date = cell.date; day.setAttribute("role", "button"); day.tabIndex = cell.date === focused ? 0 : -1;
        const dateHead = el("div", "schedule-day-heading"); dateHead.append(el("span", "schedule-day-number", String(Number(cell.date.slice(8)))));
        if (holiday) dateHead.append(el("span", "schedule-public-holiday-label", "공휴일"));
        dateHead.append(el("small", "schedule-day-count", `${new Set(workers.map(r => r.employeeId)).size}명 근무`)); day.append(dateHead);
        const entries = el("div", "schedule-day-teams");
        let lineCount = 0;
        for (const group of groups) {
          const duties = new Map<string, { code: string; label: string; rows: ScheduleRosterRow[] }>();
          for (const person of group.rows) {
            const info = person.days[cell.date], label = info.dutyLabel || (isCalendarOff(info.dutyCode) ? "휴무" : "근무"), key = `${info.dutyCode}:${label}`;
            const duty = duties.get(key) ?? { code: info.dutyCode, label, rows: [] }; duty.rows.push(person); duties.set(key, duty);
          }
          for (const duty of duties.values()) {
            const line = el("div", "schedule-day-team"), names = duty.rows.map(r => r.name).join("·");
            line.dataset.team = group.team; line.dataset.duty = duty.code; line.hidden = lineCount++ >= 4;
            line.append(el("b", "schedule-day-team-name", group.label), el("span", `duty-badge ${calendarDutyClass(duty.code)}`, duty.label), el("span", "schedule-day-names", names));
            line.title = `${group.label} · ${duty.label} · ${names} · ${group.duties.filter(d => d.code === duty.code && d.label === duty.label).map(d => d.timeLabel).filter(Boolean).join(" / ")}`;
            entries.append(line);
          }
        }
        if (!groups.length) entries.append(el("span", "schedule-day-empty", o.rows.length ? "배정된 근무 없음" : "표시한 조 없음"));
        day.append(entries);
        const more=el("span","schedule-day-more",`+ ${Math.max(0,lineCount-4)}개 근무 · 전체 보기`);more.hidden=lineCount<=4;day.append(more);
        day.setAttribute("aria-label", `${cell.date} ${["일", "월", "화", "수", "목", "금", "토"][dow]}요일${holiday ? " 공휴일" : ""}, ${groups.length}개 조, ${workers.length}명 근무. 날짜별 전체 근무 보기`);
        day.addEventListener("click", () => { o.focusedDate=cell.date;o.onFocusDate(cell.date); this.openDay(cell.date); });
        day.addEventListener("keydown", event => {
          const index = o.dates.indexOf(cell.date), target = ({ ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - 7, ArrowDown: index + 7, Home: index - dow, End: index + (6 - dow) } as Record<string, number>)[event.key];
          if (target !== undefined) { event.preventDefault(); const date = o.dates[Math.max(0, Math.min(target, o.dates.length - 1))]; o.focusedDate=date;o.onFocusDate(date); this.mount.querySelectorAll<HTMLElement>(".schedule-month-day").forEach(e => { e.tabIndex = e.dataset.date === date ? 0 : -1; }); this.mount.querySelector<HTMLElement>(`.schedule-month-day[data-date="${date}"]`)?.focus(); }
          else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); o.onFocusDate(cell.date); this.openDay(cell.date); }
        }); wrapper.append(day); row.append(wrapper);
      } body.append(row);
    }
    grid.append(body); this.mount.append(grid);
    const legend = el("div", "schedule-month-legend"), labels = new Map<string, DayDutyInfo>();
    for (const row of o.rows) for (const info of Object.values(row.days)) if (info.dutyCode !== "—") labels.set(`${info.dutyCode}:${info.dutyLabel}`, info);
    for (const info of labels.values()) legend.append(el("span", `duty-badge ${calendarDutyClass(info.dutyCode)}`, info.dutyLabel));
    legend.append(el("span", "schedule-calendar-hint", "조별 근무자 · 날짜를 누르면 근무 시간·예외 확인 · 방향키로 날짜 이동")); this.mount.append(legend);
    this.observer ??= new ResizeObserver(() => { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => {
      this.frame = null; if (this.disposed) return;
      const h = this.mount.querySelector<HTMLElement>(".schedule-month-day")?.getBoundingClientRect().height ?? 0; if (!h) return;
      const compact = !this.readingDialog && h < 87; this.mount.classList.toggle("is-compact",compact);
      const day = this.mount.querySelector<HTMLElement>(".schedule-month-day")!, heading = day.querySelector<HTMLElement>(".schedule-day-heading")!, line = day.querySelector<HTMLElement>(".schedule-day-team"), list = day.querySelector<HTMLElement>(".schedule-day-teams")!;
      const style = getComputedStyle(day), gap = parseFloat(getComputedStyle(list).rowGap) || 0, row = line?.getBoundingClientRect().height || (compact ? 12 : 14);
      const header = heading.getBoundingClientRect().height + (parseFloat(getComputedStyle(heading).marginBottom) || 0) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom), available = h - header;
      const capacity = Math.max(1, Math.floor((available + gap) / (row + gap)));
      this.mount.querySelectorAll<HTMLElement>(".schedule-month-day").forEach(day => {
        const lines = day.querySelectorAll<HTMLElement>(".schedule-day-team"), more = day.querySelector<HTMLElement>(".schedule-day-more")!;
        const moreHeight = parseFloat(getComputedStyle(more).lineHeight) + (parseFloat(getComputedStyle(more).marginTop) || 0), limit = lines.length <= capacity ? capacity : Math.max(1, Math.floor((available - moreHeight + gap) / (row + gap)));
        lines.forEach((line, i) => { line.hidden = i >= limit; });
        more.hidden = lines.length <= limit; more.textContent = `+ ${Math.max(0, lines.length - limit)}개 근무 · 전체 보기`;
      });
    }); });
    this.observer.disconnect(); this.observer.observe(grid);
    if (o.readingMode) this.openReadingView();
  }
}
