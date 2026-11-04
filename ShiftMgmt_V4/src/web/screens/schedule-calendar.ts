import {
  measurePaginationBody,
  paginateGroupsForHeight,
  renderPagination,
  type PageRange,
} from "../pagination";
import type {
  DayDutyInfo,
  SchedulePreviewResult,
  WeekSummary,
} from "./schedule-model";
import { ScheduleMonthGrid } from "./schedule-calendar-grid";
import { ScheduleDayDialog } from "./schedule-calendar-dialog";
import { WorkforceDialog } from "./workforce-dialog";

export interface ScheduleCalendarCallbacks {
  onSelectEmployee: (employeeId: string) => void;
  onMoveMonth?: (delta: number) => void;
}

export class ScheduleCalendar {
  private container: HTMLElement;
  private callbacks: ScheduleCalendarCallbacks;
  private data: SchedulePreviewResult | null = null;
  private selectedEmployeeId: string | null = null;
  private publicHolidayDates = new Set<string>();
  private wideLayout: boolean | null = null;
  private weeklyMaxMinutes = 3120; // 52시간 default
  private monthGrid: ScheduleMonthGrid | null = null;
  private dayDialog: ScheduleDayDialog | null = null;
  private personDialog = new WorkforceDialog();
  private keyword = "";
  private hiddenTeams = new Set<string>();
  private siteScope = "";
  private expandedTeam = "";
  private focusedDate = "";
  private readingMode = false;
  private navigationDisabled = false;

  // 페이징 및 높이 측정 상태
  private currentPage = 1;
  private pages: PageRange[] = [{ start: 0, end: 0 }];
  private bodyHeight = 0;
  private rowHeight = 33;
  private groupHeight = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(container: HTMLElement, callbacks: ScheduleCalendarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public setData(
    data: SchedulePreviewResult | null,
    selectedEmpId: string | null,
    weeklyMaxMinutes = 3120,
    publicHolidayDates: string[] = [],
    navigationDisabled = false,
  ): void {
    const previous = this.data;
    this.data = data;
    const site = data?.pattern?.siteId || "";
    if (site && site !== this.siteScope) { this.hiddenTeams.clear(); this.keyword = ""; this.expandedTeam = ""; this.siteScope = site; }
    this.navigationDisabled = navigationDisabled;
    if (previous !== data) { this.dayDialog?.destroy(); this.personDialog.close(); }
    const previousSelection=this.selectedEmployeeId;this.selectedEmployeeId = selectedEmpId;
    const selectedRow=data?.rows.find(r=>r.rowKey===selectedEmpId);if(selectedRow&&previousSelection!==selectedEmpId)this.expandedTeam=selectedRow.shiftGroup;
    this.weeklyMaxMinutes = weeklyMaxMinutes;
    this.publicHolidayDates = new Set(publicHolidayDates);

    // 데이터 변경 시 첫 행 자동 선택 보정
    if (this.data && this.data.rows.length > 0) {
      if (!this.selectedEmployeeId || !this.data.rows.some((r) => r.rowKey === this.selectedEmployeeId)) {
        this.selectedEmployeeId = this.data.rows[0].rowKey;
        this.callbacks.onSelectEmployee(this.selectedEmployeeId);
      }
    } else {
      this.selectedEmployeeId = null;
    }

    this.currentPage = 1;
    this.render();
  }

  private matchingRows() {return (this.data?.rows??[]).filter(r=>`${r.name} ${r.employeeCode} ${r.displayName||r.shiftGroup}`.toLocaleLowerCase().includes(this.keyword.toLocaleLowerCase()));}
  private filteredRows() {
    const rows=this.matchingRows(),groups=rows.length?rows:(this.data?.rows??[]);if(!groups.some(r=>r.shiftGroup===this.expandedTeam))this.expandedTeam=groups[0]?.shiftGroup||"";
    return rows.filter(r=>r.shiftGroup===this.expandedTeam);
  }
  public render(): void {
    const tablePane = this.container.querySelector<HTMLElement>("#schedule-table-pane"), detailPane = this.container.querySelector<HTMLElement>("#schedule-detail-pane");
    if (!tablePane || !detailPane) return;
    this.monthGrid?.destroy(); this.monthGrid = null;
    if (!this.data || this.data.fatalIssues.length || !this.data.rows.length) {
      const fatal = this.data?.fatalIssues ?? [], message = !this.data ? "근무지와 대상 월을 선택한 뒤 미리보기를 조회해 주세요." : fatal.length ? "아래 설정을 확인한 뒤 다시 조회해 주세요." : "대상 월에 배정된 인력이 없습니다. 근무지의 인력 배정 기간을 확인해 주세요.";
      tablePane.innerHTML = `<div class="schedule-empty-container"><span class="schedule-empty-icon material-symbols-outlined" aria-hidden="true">${fatal.length ? "warning" : "calendar_month"}</span><div class="schedule-empty-title">${fatal.length ? "근무표 생성 불가 안내" : "표시할 근무표가 없습니다"}</div><p class="schedule-empty-desc">${this.escape(message)}</p>${fatal.length ? `<ul class="schedule-empty-issues-list">${fatal.map(m => `<li>${this.escape(m)}</li>`).join("")}</ul>` : ""}</div>`;
      detailPane.innerHTML = `<div class="detail-header"><div class="detail-title">근무 상세</div></div><div class="detail-content">${this.escape(message)}</div>`; this.appendEmptyPagination(tablePane); return;
    }
    const allRows = this.filteredRows();
    this.pages = this.bodyHeight > 0 && window.innerWidth > 1100 ? paginateGroupsForHeight(allRows, this.bodyHeight, this.rowHeight, 0, () => "") : Array.from({ length: Math.ceil(allRows.length / 10) || 1 }, (_, i) => ({ start: i * 10, end: Math.min((i + 1) * 10, allRows.length) }));
    this.currentPage = Math.max(1, Math.min(this.currentPage, this.pages.length)); const range = this.pages[this.currentPage - 1], paged = allRows.slice(range.start, range.end);
    if (!paged.some(r => r.rowKey === this.selectedEmployeeId) && paged.length) { this.selectedEmployeeId = paged[0].rowKey; this.callbacks.onSelectEmployee(this.selectedEmployeeId); }
    let body = "";
    for (const row of paged) {
      body += `<tr class="schedule-roster-row ${row.rowKey === this.selectedEmployeeId ? "selected" : ""}" data-row-key="${this.escape(row.rowKey)}" data-empid="${this.escape(row.employeeId)}" tabindex="0" aria-selected="${row.rowKey === this.selectedEmployeeId}"><td class="col-sticky-2" title="${this.escape(`${row.name} · ${row.employeeCode}`)}">${this.escape(row.name)}</td></tr>`;
    }
    const teams=[...new Set(this.data.rows.map(r=>r.shiftGroup))];
    const memberTable=`<div class="schedule-table-viewport"><table class="schedule-table schedule-staff-table" id="schedule-roster-table"><thead><tr><th class="col-sticky-2"><div class="schedule-staff-table-heading"><span>이름</span><button type="button" id="btn-schedule-person-detail" class="schedule-person-detail-button" aria-label="선택 인원의 월간 근무 상세">선택 인원 상세</button></div></th></tr></thead><tbody>${body||'<tr><td class="schedule-staff-empty">검색 결과가 없습니다.</td></tr>'}</tbody></table></div>`;
    const groups=teams.map(team=>{
      const members=this.data!.rows.filter(r=>r.shiftGroup===team),expanded=team===this.expandedTeam,label=members[0].displayName||team,active=!this.hiddenTeams.has(team);
      return `<section class="schedule-staff-group ${expanded?'is-expanded':''} ${active?'is-active':''}"><div class="schedule-team-heading"><input type="checkbox" class="schedule-team-visible" data-team="${this.escape(team)}" aria-label="${this.escape(label)} 달력에 표시" ${active?'checked':''}/><button type="button" class="schedule-team-select" data-team="${this.escape(team)}" aria-expanded="${expanded}"><b>${this.escape(label)}</b><span>${new Set(members.map(r=>r.employeeId)).size}명</span><span class="material-symbols-outlined" aria-hidden="true">${expanded?'expand_more':'chevron_right'}</span></button></div>${expanded?memberTable:''}</section>`;
    }).join('');
    tablePane.innerHTML=`<div class="schedule-calendar-layout"><aside class="schedule-staff-pane" aria-label="근무지의 조와 소속 인원"><div class="schedule-staff-heading"><strong>근무조 · 구성원</strong><button type="button" id="btn-schedule-view-all" class="schedule-view-all">전체 조</button></div><p class="schedule-staff-guide">체크한 조의 근무를 달력에 표시합니다.</p><label class="schedule-staff-search-label"><span>구성원 찾기 · 달력 표시에는 영향 없음</span><input type="search" id="schedule-staff-search" placeholder="구성원 찾기 · 조명 또는 이름" value="${this.escape(this.keyword)}"/></label><div class="schedule-staff-groups">${groups||memberTable}</div><nav class="schedule-pagination pagination-footer" aria-label="선택 조의 소속 인원 페이지"><span class="schedule-pagination-info" role="status" aria-live="polite">${this.escape(allRows[0]?.displayName||this.expandedTeam)} · ${allRows.length}명 · ${allRows.length?range.start+1:0}–${range.end}명 · ${this.currentPage}/${this.pages.length}페이지</span></nav></aside><section class="schedule-month-pane" aria-label="일요일부터 토요일까지 월간 근무 달력"></section></div>`;
    const visible=this.data.rows.filter(r=>!this.hiddenTeams.has(r.shiftGroup)),activeTeams=teams.filter(t=>!this.hiddenTeams.has(t));
    const scope=activeTeams.length?`${activeTeams.map(t=>this.data!.rows.find(r=>r.shiftGroup===t)?.displayName||t).join(' · ')} / ${new Set(visible.map(r=>r.employeeId)).size}명`:'표시할 조를 왼쪽에서 체크하세요';
    const mount = tablePane.querySelector<HTMLElement>(".schedule-month-pane")!;
    this.monthGrid = new ScheduleMonthGrid(mount, { dates: this.data.dates, rows: visible, publicDates: this.publicHolidayDates, scopeLabel: scope, focusedDate: this.focusedDate, readingMode: this.readingMode, onReadingChange: enabled => { this.readingMode = enabled; }, navigationDisabled: this.navigationDisabled || !this.callbacks.onMoveMonth,onDay: date => { this.dayDialog?.destroy(); this.dayDialog = new ScheduleDayDialog(date, visible, this.publicHolidayDates.has(date)); this.dayDialog.open(); }, onMoveMonth: d => this.callbacks.onMoveMonth?.(d), onFocusDate: date => { this.focusedDate = date; } }); this.monthGrid.render();
    tablePane.querySelector(".schedule-pagination")!.append(renderPagination({ currentPage: this.currentPage, totalPages: this.pages.length, totalCount: allRows.length, idPrefix: "schedule-roster", label: "근무표 인력 페이지 이동", className: "schedule-page-nav", onPageChange: p => { this.currentPage = p; this.render(); } }));
    const personButton=tablePane.querySelector<HTMLButtonElement>("#btn-schedule-person-detail")!;personButton.disabled=!paged.length;personButton.addEventListener("click",()=>this.openPersonDetail());
    tablePane.querySelector("#btn-schedule-view-all")!.addEventListener("click", () => { this.hiddenTeams.clear(); this.keyword = ""; this.currentPage = 1; this.render(); });
    tablePane.querySelectorAll<HTMLInputElement>(".schedule-team-visible").forEach(box=>box.addEventListener("change",()=>{const team=box.dataset.team!;if(box.checked)this.hiddenTeams.delete(team);else this.hiddenTeams.add(team);this.render();Array.from(tablePane.querySelectorAll<HTMLInputElement>(".schedule-team-visible")).find(e=>e.dataset.team===team)?.focus({preventScroll:true});}));
    tablePane.querySelectorAll<HTMLButtonElement>(".schedule-team-select").forEach(b => b.addEventListener("click", () => { this.expandedTeam=b.dataset.team||""; this.currentPage = 1; this.render(); }));
    tablePane.querySelectorAll<HTMLTableRowElement>(".schedule-roster-row").forEach(tr => {
      const select = () => { const key = tr.dataset.rowKey; if (!key) return; this.selectedEmployeeId = key; this.callbacks.onSelectEmployee(key); tablePane.querySelectorAll<HTMLTableRowElement>(".schedule-roster-row").forEach(row=>{const selected=row.dataset.rowKey===key;row.classList.toggle("selected",selected);row.setAttribute("aria-selected",String(selected));}); this.renderDetail(detailPane); };
      tr.addEventListener("click", select); tr.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
    });
    tablePane.querySelector<HTMLInputElement>("#schedule-staff-search")!.addEventListener("input", event => { const input = event.target as HTMLInputElement, start = input.selectionStart; this.keyword = input.value; this.currentPage = 1; this.render(); const next = tablePane.querySelector<HTMLInputElement>("#schedule-staff-search")!; next.focus(); try { next.setSelectionRange(start, start); } catch { /* Search selection is optional. */ } });
    this.renderDetail(detailPane);
    const viewport = tablePane.querySelector<HTMLElement>(".schedule-table-viewport"), table = tablePane.querySelector<HTMLElement>("#schedule-roster-table");
    if (viewport && table) { this.resizeObserver ??= new ResizeObserver(() => this.scheduleFit()); this.resizeObserver.disconnect(); this.resizeObserver.observe(viewport); this.resizeObserver.observe(table); }
  }

  private openPersonDetail():void {
    const content = document.createElement("div");content.className="schedule-person-dialog";this.renderDetail(content);this.personDialog.open({id:"schedule-person-modal",title:"인력별 월간 근무 상세",width:"880px",content,buttons:[{id:"btn-schedule-person-close",label:"닫기",onClick:()=>this.personDialog.close()}]});
  }
  private appendEmptyPagination(pane: HTMLElement): void {
    const nav = document.createElement("nav"); nav.className = "schedule-pagination pagination-footer"; nav.setAttribute("aria-label", "근무표 인력 목록 페이지");
    const label = document.createElement("span"); label.className = "schedule-pagination-info"; label.textContent = "조회된 근무 행0개"; nav.append(label);
    nav.append(renderPagination({ currentPage: 1, totalPages: 0, totalCount: 0, idPrefix: "schedule-roster", label: "근무표 인력 페이지 이동", className: "schedule-page-nav", onPageChange: () => {} })); pane.append(nav);
  }

  private scheduleFit(): void {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.fitToHeight();
    });
  }

  private fitToHeight(): void {
    const tablePane = this.container.querySelector<HTMLElement>("#schedule-table-pane");
    const viewport = tablePane?.querySelector<HTMLElement>(".schedule-table-viewport");
    const head = tablePane?.querySelector<HTMLElement>("thead");
    if (!viewport?.isConnected || !head) return;

    const height = measurePaginationBody(viewport, head);
    const rowEl = tablePane?.querySelector<HTMLElement>(".schedule-roster-row");
    const groupEl = tablePane?.querySelector<HTMLElement>("tr.schedule-group-row");
    const rowH = rowEl?.getBoundingClientRect().height || this.rowHeight;
    const groupH = groupEl?.getBoundingClientRect().height || 0;

    if (
      this.wideLayout === (window.innerWidth > 1100) &&
      Math.abs(height - this.bodyHeight) < 0.1 &&
      Math.abs(rowH - this.rowHeight) < 0.1 &&
      Math.abs(groupH - this.groupHeight) < 0.1
    ) {
      return;
    }

    this.wideLayout = window.innerWidth > 1100;
    this.bodyHeight = height;
    this.rowHeight = rowH;
    this.groupHeight = groupH;

    if (this.data && this.data.rows.length > 0) {
      const next=paginateGroupsForHeight(this.filteredRows(),height,rowH,0,()=>"");
      const changed=JSON.stringify(next)!==JSON.stringify(this.pages);this.pages=next;if(changed)this.render();
    }
  }

  private renderDetail(detailPane: HTMLElement): void {
    if (!this.data || !this.selectedEmployeeId) {
      detailPane.innerHTML = `
        <div class="detail-header"><div class="detail-title">인력별 근무 상세</div></div>
        <div class="detail-content"><div class="schedule-empty-desc">선택된 인력이 없습니다.</div></div>
      `;
      return;
    }

    const row = this.data.rows.find((r) => r.rowKey === this.selectedEmployeeId);
    if (!row) return;

    const totalHours = (row.totalWorkMinutes / 60).toFixed(1);
    const empWarnings = this.data.warnings.filter(
      (w) => w.employeeCode === row.employeeCode,
    );

    // 주차별 요약 카드 (weeklyMaxMinutes 기준 초과 시 스타일)
    const weeksHtml = row.weeklySummary
      .map((w: WeekSummary) => {
        const hours = (w.totalWorkMinutes / 60).toFixed(1);
        const isOver = w.totalWorkMinutes > this.weeklyMaxMinutes;
        return `
          <div class="detail-kpi-box">
            <div class="detail-kpi-box-lbl">${this.escape(w.label)} (${this.escape(w.dateRange)})</div>
            <div class="detail-kpi-box-val ${isOver ? "text-danger" : ""}">
              ${hours}시간 · ${w.workDaysCount}일 (야간 ${w.nightDaysCount}일)
              ${isOver ? " [한도 초과]" : ""}
            </div>
          </div>
        `;
      })
      .join("");

    // 규칙 경고 목록
    const warningsHtml =
      empWarnings.length > 0
        ? empWarnings
            .map(
              (w) => `
          <div class="detail-warn-item">
            <strong>${this.escape(({ "consecutive-night": "연속 야간", "minimum-rest": "최소 휴식", "weekly-holiday": "주휴", "weekly-max-minutes": "주간 근로시간" } as Record<string, string>)[w.rule] || "근무 규칙")}</strong> (${this.escape(w.dates.join(", "))}): ${this.escape(
                w.message,
              )}
          </div>
        `,
            )
            .join("")
        : `<div class="schedule-empty-desc">적발된 규칙 위반/경고가 없습니다.</div>`;

    // 일자별 근무 리스트
    const dutiesHtml = this.data.dates
      .map((d) => {
        const info = row.days[d] as DayDutyInfo | undefined;
        if (!info || info.dutyCode === "—") {
          return `
            <div class="detail-duty-item">
              <div class="detail-duty-left">
                <span class="dow-weekday">${d.slice(5)} (${this.getDayOfWeek(d)})</span>
                <span class="duty-badge duty-unassigned">—</span>
              </div>
              <div class="detail-duty-right">배정 없음</div>
            </div>
          `;
        }

        const isNight = info.dutyCode.includes("N");
        return `
          <div class="detail-duty-item">
            <div class="detail-duty-left">
              <span class="${info.isHoliday ? "dow-holiday" : "dow-weekday"}">${d.slice(5)} (${info.dayOfWeek})</span>
              <span class="duty-badge ${isNight ? "duty-n" : info.dutyCode === "D" ? "duty-d" : "duty-o"}">
                ${this.escape(info.dutyCode)}
              </span>
              <span>${this.escape(info.dutyLabel)}</span>
            </div>
            <div class="detail-duty-right">
              ${info.actualWorkMinutes ? (info.actualWorkMinutes / 60).toFixed(1) + "시간" : "-"}
            </div>
          </div>
        `;
      })
      .join("");

    detailPane.innerHTML = `
      <div class="detail-header">
        <div class="detail-title">${this.escape(row.name)} (${this.escape(row.employeeCode)})</div>
        <div class="detail-sub">${this.escape(row.displayName || row.shiftGroup)} · 배정 순서 ${row.assignmentOrder}</div>
      </div>
      <div class="detail-content">
        <div class="detail-section-title">월간 집계 요약</div>
        <div class="detail-section-grid">
          <div class="detail-kpi-box">
            <div class="detail-kpi-box-lbl">총 실근무 시간</div>
            <div class="detail-kpi-box-val">${totalHours}시간</div>
          </div>
          <div class="detail-kpi-box">
            <div class="detail-kpi-box-lbl">근무일수 / 야간</div>
            <div class="detail-kpi-box-val">${row.totalWorkDays}일 (야간 ${row.nightDaysCount}일)</div>
          </div>
        </div>

        <div class="detail-section-title">주차별 근로시간 요약</div>
        <div class="detail-section-grid">${weeksHtml}</div>

        <div class="detail-section-title">법정/운영 규칙 경고 (${empWarnings.length}건)</div>
        <div>${warningsHtml}</div>

        <div class="detail-section-title">일자별 근무 내역</div>
        <div>${dutiesHtml}</div>
      </div>
    `;
  }

  public destroy(): void {
    this.monthGrid?.destroy(); this.dayDialog?.destroy(); this.personDialog.close();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
  }

  private getDayOfWeek(dateStr: string): string {
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    return labels[dow];
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
