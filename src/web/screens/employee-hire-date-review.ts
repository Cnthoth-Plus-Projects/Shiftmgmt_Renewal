import type { ImportedEmployeeHireDateReview, ImportedEmployeeHireDateRow } from "../../shared/bridge/contracts";
import { createButton, el } from "./operations-ui";

const labels:Record<ImportedEmployeeHireDateRow["classification"],string>={"source-date":"원본 날짜 있음",missing:"입사일 미입력",invalid:"날짜 형식 확인"};

export function createImportedHireDateReview(report:ImportedEmployeeHireDateReview|undefined,phase:"preview"|"result"):HTMLElement {
  const root=el("section","hire-review");root.id=`hire-date-review-${phase}`;
  const heading=el("div","hire-review-heading");const symbol=el("span","material-symbols-outlined","event_note");symbol.setAttribute("aria-hidden","true");heading.append(symbol,el("h3","",phase==="preview"?"복원 전, 등록 입사일을 확인해 주세요":"복원한 등록 입사일 확인"));root.appendChild(heading);
  if(!report||report.policy!=="preserve-source-no-fallback"||!Array.isArray(report.rows)||![report.totalEmployeeCount,report.sourceDateCount,report.missingDateCount,report.invalidDateCount].every(value=>Number.isInteger(value)&&value>=0)||report.rows.length!==report.totalEmployeeCount||report.sourceDateCount+report.missingDateCount+report.invalidDateCount!==report.totalEmployeeCount){
    root.appendChild(el("p","hire-review-warning","입사일 확인 결과를 받지 못해 건수를 확정할 수 없습니다. "+(phase==="preview"?"다시 미리보기를 진행하거나 원본 백업과 대조해 주세요.":"인력 관리에서 해당 직원의 등록 입사일을 원본 자료와 대조해 주세요.")));return root;
  }
  root.appendChild(el("p","hire-review-copy","백업에 저장된 입사일을 그대로 가져옵니다. 날짜가 입력되어 있어도 실제 입사일이라는 근거는 별도로 확인해야 합니다."));
  const metrics=el("div","hire-review-metrics");
  for(const [title,count,caption,kind] of [["전체 인력",report.totalEmployeeCount,"보관된 인력 포함","total"],["원본 날짜 있음",report.sourceDateCount,"실제 입사일은 별도 확인","source"],["입사일 미입력",report.missingDateCount,"빈 값 그대로 유지","missing"],["날짜 형식 확인",report.invalidDateCount,"원본 값을 유지하고 확인","invalid"]] as const){const card=el("div",`hire-review-metric hire-review-metric--${kind}`);card.append(el("span","",title),el("strong","",`${count}명`),el("small","",caption));metrics.appendChild(card);}root.appendChild(metrics);
  const preserve=el("div","hire-review-preserve");preserve.append(el("strong","","이번 입사일 처리 기준"),el("p","","입사일이 비어 있어도 시급 시작일·배정일·파일 연도 등으로 채우지 않습니다. 날짜의 값만 보고 실제 입사일이나 옛 대체 날짜라고 단정하지 않습니다. 기존 시급·배정·재직기간과 승인·계산 이력은 백업 원본 및 기존 복원 규칙에 따라 보존합니다."));root.appendChild(preserve);
  const next=el("div","hire-review-next");next.append(el("strong","","확인 후 이렇게 진행해 주세요"),el("p","",phase==="preview"?"아래에서 직원을 검색해 원본 날짜를 확인하세요. 실제 입사일을 알 수 없다면 빈 값을 유지할 수 있습니다. 복원 후에는 인력 관리 → 직원 선택 → 기본정보 수정에서 확인한 날짜를 정정할 수 있습니다.":"인력 관리 → 직원 선택 → 기본정보 수정에서 실제 입사일을 원본 자료와 대조해 주세요. 입사일 정정은 기존 시급·배정 기간과 승인 수당을 자동으로 변경하지 않습니다. 재입사 이력이 있는 직원의 최초 입사일은 기존 보호 기준을 따릅니다."));root.appendChild(next);
  if(!report.totalEmployeeCount){root.appendChild(el("p","hire-review-copy","이번 백업에는 인력 기록이 없어 확인할 입사일이 없습니다."));return root;}
  const details=el("details","hire-review-details");details.id=`hire-date-review-details-${phase}`;details.appendChild(el("summary","",`직원별 등록값 ${report.totalEmployeeCount}명 확인하기`));
  const filterLabel=el("label","hire-review-filter","확인 구분"),filter=el("select","form-select");filter.id=`hire-date-review-filter-${phase}`;filter.add(new Option("전체 인력","all"));for(const [value,label] of Object.entries(labels))filter.add(new Option(label,value));filterLabel.appendChild(filter);details.appendChild(filterLabel);
  const searchLabel=el("label","hire-review-search","사번·이름·원본 날짜 검색"),search=el("input","form-input");search.type="search";search.id=`hire-date-review-search-${phase}`;search.placeholder="검색할 사번·이름·날짜";searchLabel.appendChild(search);details.appendChild(searchLabel);
  const tableHost=el("div","hire-review-table");tableHost.id=`hire-date-review-table-${phase}`;details.appendChild(tableHost);
  const table=el("table","hire-review-data"),head=el("thead"),headRow=el("tr");
  for(const title of ["사번","이름","백업의 등록 입사일","확인 구분"]){const th=el("th","",title);th.scope="col";headRow.appendChild(th);}head.appendChild(headRow);table.appendChild(head);const body=el("tbody");table.appendChild(body);tableHost.appendChild(table);
  let page=1;const pageSize=10,pager=el("div","hire-review-pager"),count=el("span","hire-review-count");count.setAttribute("role","status");count.setAttribute("aria-live","polite");count.tabIndex=-1;
  const renderRows=()=>{
    const query=search.value.trim().toLowerCase(),rows=report.rows.filter(row=>(filter.value==="all"||row.classification===filter.value)&&(!query||[row.employeeCode,row.employeeName,row.sourceHireDate,labels[row.classification]].some(value=>String(value??"").toLowerCase().includes(query))));
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);body.replaceChildren();
    for(const row of rows.slice((page-1)*pageSize,page*pageSize)){
      const tr=el("tr");tr.dataset.employeeId=row.employeeId;tr.appendChild(el("td","",row.employeeCode||"사번 미등록"));
      const name=el("td","hire-review-person");name.appendChild(el("span","",row.employeeName||"이름 미등록"));if(row.archived)name.appendChild(el("small","","보관된 인력"));tr.appendChild(name);
      const date=el("td");date.appendChild(el("code","hire-review-value",row.sourceHireDate==null?"미입력":row.sourceHireDate===""?"미입력 (빈 값)":row.sourceHireDate.trim()===""?"미입력 (공백)":row.sourceHireDate));tr.appendChild(date);
      const status=el("td");status.appendChild(el("span",`hire-review-status hire-review-status--${row.classification}`,labels[row.classification]));tr.appendChild(status);body.appendChild(tr);
    }
    if(!rows.length){const td=el("td","hire-review-empty","선택한 조건에 해당하는 인력이 없습니다.");td.colSpan=4;const tr=el("tr");tr.appendChild(td);body.appendChild(tr);}
    previous.disabled=page<=1;nextButton.disabled=page>=pages;count.textContent=`전체 ${report.totalEmployeeCount}명 · 조회 ${rows.length}명 · ${page}/${pages}페이지`;
  };
  const previous=createButton("이전 페이지","secondary",()=>{page--;renderRows();if(previous.disabled)count.focus();}),nextButton=createButton("다음 페이지","secondary",()=>{page++;renderRows();if(nextButton.disabled)count.focus();});previous.id=`hire-date-review-prev-${phase}`;nextButton.id=`hire-date-review-next-${phase}`;pager.append(count,previous,nextButton);details.appendChild(pager);
  filter.addEventListener("change",()=>{page=1;renderRows();});search.addEventListener("input",()=>{page=1;renderRows();});renderRows();root.appendChild(details);return root;
}

export function createEmployeeHireDateGuidance(hireDate?:string,hasRehireHistory=false):HTMLElement {
  const details=el("details","hire-date-guide");details.appendChild(el("summary","","이전 자료의 입사일 확인 안내"));
  details.appendChild(el("p","",hireDate?`현재 등록값: ${hireDate}. 이전 프로그램에서 옮긴 자료에는 직무 적용일·시급 시작일 등이 입사일 대신 저장됐을 수 있습니다. 등록된 날짜만으로 실제 입사일 여부를 판단할 수 없습니다.`:"등록된 입사일이 없습니다. 실제 입사일을 확인한 뒤 기본정보에서 입력해 주세요. 시급 시작일이나 배정일을 입사일로 추정하지 않습니다."));
  details.appendChild(el("p","",hasRehireHistory?"재입사 이력이 있어 기존 재직기간을 보호하기 위해 최초 입사일을 유지합니다. 새 재입사일은 재입사·예약 변경에서 관리하며, 기존 이력은 그대로 보존합니다.":"실제 입사일을 원본 자료로 확인했다면 기본정보 수정에서 정정할 수 있습니다. 시급·배정 기간과 이미 승인·계산된 수당은 그대로 유지되며, 이후 근무표 생성·실적 다시 읽기에는 정정한 입사일이 반영됩니다."));return details;
}
