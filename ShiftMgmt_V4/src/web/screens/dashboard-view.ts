import { dashboardCategories, dashboardCategoryLabels, dashboardMoney, dashboardSourceLabel, dashboardTime, type DashboardModel } from "./dashboard-model";

export const dashboardEscape = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function dashboardLayout(container: HTMLElement): void {
  container.innerHTML = `<section class="dashboard-screen" id="dashboard-root" aria-busy="true">
    <div class="dashboard-filter-card" id="dashboard-filters"></div>
    <div id="dashboard-notice" role="status" aria-live="polite"></div>
    <div class="dashboard-kpis" id="dashboard-kpis"></div>
    <div class="dashboard-grid" id="dashboard-grid">
      ${([['trend','월별 산출 수당 추이','최근 6개월'],['site','근무지별 산출 수당','필터 결과 전체'],['ratio','수당 구분별 비중','산출 수당 금액 기준']] as const).map(([key,title,note]) => `<article class="dashboard-card" data-chart="${key}"><div class="dashboard-card-head"><div class="dashboard-card-heading"><h2>${title}</h2><p class="dashboard-card-sub" id="dashboard-${key}-period">${note}</p></div><div class="dashboard-export-buttons"><button type="button" data-export="${key}" data-format="xlsx" class="dashboard-action" title="${title} Excel 내보내기">XLSX</button>${key==='trend'?'<button type="button" data-export="trend" data-format="pdf" class="dashboard-action" title="추이 PDF 내보내기">PDF</button>':''}</div></div><div class="dashboard-chart-slot"><canvas id="dashboard-canvas-${key}" tabindex="0" role="img" aria-label="${title}"></canvas></div><div class="dashboard-tooltip" id="dashboard-tooltip-${key}" role="status"></div><details class="dashboard-data-details"><summary title="원본 데이터 표 보기"><span class="material-symbols-outlined dashboard-data-icon" aria-hidden="true">table_chart</span><span class="dashboard-sr">원본 데이터 표 보기</span><span class="dashboard-data-close">데이터 표 닫기 <span aria-hidden="true">×</span></span></summary><div class="dashboard-data-table" id="dashboard-data-${key}"></div></details></article>`).join('')}
      <article class="dashboard-card dashboard-rank-card"><div class="dashboard-card-head"><div class="dashboard-card-heading"><h2>전체 인원 순위 <span id="dashboard-rank-count" class="dashboard-count-badge"></span></h2><p class="dashboard-card-sub">사번 기준 · 전체 필터 결과</p></div><div class="dashboard-export-buttons"><label for="dashboard-rank-sort" class="dashboard-sr">순위 정렬</label><select id="dashboard-rank-sort"><option value="amount">금액순</option><option value="minutes">시간순</option></select><button type="button" data-export="ranking" data-format="xlsx" class="dashboard-action">XLSX</button></div></div><div id="dashboard-ranking"></div></article>
    </div><div id="dashboard-export-result" role="status" aria-live="polite"></div>
  </section>`;
}
const options = (values: { value: string; label: string }[], selected: string) => {
  if (!values.some(v => v.value === selected)) values.push({ value: selected, label: `${selected} (현재 자료 없음)` });
  return values.map(v => `<option value="${dashboardEscape(v.value)}"${v.value === selected ? ' selected' : ''}>${dashboardEscape(v.label)}</option>`).join('');
};
export function dashboardFilters(container: HTMLElement, m: DashboardModel): void {
  const f=m.filter;
  const select=(key:string,label:string,values:{value:string;label:string}[],value:string)=>`<label class="dashboard-filter" for="dashboard-${key}"><span>${label}</span><select id="dashboard-${key}" data-filter="${key}">${options(values,value)}</select></label>`;
  const caption=[f.site==='all'?'전체 근무지':f.site,f.category==='all'?'전체 구분':dashboardCategoryLabels[f.category],f.employee==='all'?'전체 인원':`${m.options.employees.find(e=>e.code===f.employee)?.name||''} (${f.employee})`].join(' · ');
  container.innerHTML=`<div class="dashboard-filter-top"><div class="dashboard-period-group">
    ${select('year','연도',m.options.years.map(y=>({value:y,label:`${y}년`})),f.year)}
    ${select('month','기간',[{value:'all',label:'연간 전체'},...Array.from({length:12},(_,i)=>({value:String(i+1).padStart(2,'0'),label:`${i+1}월`}))],f.month)}
    <span class="dashboard-source" title="${dashboardSourceLabel}">${dashboardSourceLabel}</span><span class="material-symbols-outlined dashboard-source-info" role="img" aria-label="${dashboardSourceLabel}" title="${dashboardSourceLabel}">info</span></div><div class="dashboard-filter-actions"><button type="button" id="dashboard-refresh" class="dashboard-action dashboard-refresh" aria-label="새로고침" title="새로고침"><span class="material-symbols-outlined" aria-hidden="true">refresh</span></button><button type="button" data-report="xlsx" class="dashboard-action">보고서 Excel</button><button type="button" data-report="pdf" class="dashboard-primary"><span class="material-symbols-outlined" aria-hidden="true">download</span>보고서 PDF</button></div></div><div class="dashboard-filter-bottom"><p class="dashboard-filter-caption" title="${dashboardEscape(caption)}">${dashboardEscape(caption)}</p><div class="dashboard-filter-inline">
    ${select('site','근무지',[{value:'all',label:'전체 근무지'},...m.options.sites.map(s=>({value:s,label:s}))],f.site)}
    ${select('category','구분',[{value:'all',label:'전체 구분'},...dashboardCategories.map(c=>({value:c,label:dashboardCategoryLabels[c]}))],f.category)}
    ${select('employee','인원',[{value:'all',label:'전체 인원'},...m.options.employees.map(e=>({value:e.code,label:`${e.name} (${e.code})`}))],f.employee)}
    </div><div class="dashboard-filter-controls"><button type="button" id="dashboard-filter-toggle" class="dashboard-action" aria-expanded="false" aria-controls="dashboard-site"><span class="material-symbols-outlined" aria-hidden="true">tune</span>필터</button><button type="button" id="dashboard-reset" class="dashboard-action">초기화</button></div></div>`;
}
export function dashboardKpis(container: HTMLElement, m: DashboardModel): void {
  const items=[['amount','산출 수당 합계',dashboardMoney(m.totals.amount)],['minutes','총 근로시간',dashboardTime(m.totals.minutes)],['employees','대상 인원',`${m.totals.employees.toLocaleString('ko-KR')}명`],['count','산출 건수',`${m.totals.count.toLocaleString('ko-KR')}건`]] as const;
  const icons={amount:'payments',minutes:'schedule',employees:'group',count:'receipt_long'};
  container.innerHTML=items.map(([key,label,value])=>`<article class="dashboard-kpi" data-metric="${key}"><span class="material-symbols-outlined dashboard-kpi-icon" aria-hidden="true">${icons[key]}</span><div class="dashboard-kpi-body"><span>${label}</span><strong id="dashboard-kpi-${key}">${value}</strong></div><small title="직전 ${m.filter.month==='all'?'연도':'월'} 대비"><span>직전 ${m.filter.month==='all'?'연도':'월'}</span><b>${m.growth[key]}</b></small></article>`).join('');
}
