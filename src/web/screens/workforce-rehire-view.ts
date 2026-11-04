import type { EmployeeRecord, SiteRecord } from "../../shared/domain/model";
import type { EmployeeRehireInput, EmployeeSaveResult } from "../../shared/bridge/contracts";
import { formatCurrency, getSeoulTodayDateString, isBpEmploymentType } from "./workforce-model";

export type RehireMode = "start" | "reschedule" | "cancel";
export interface RehireFields {startDate:string;siteId:string;shiftGroup:string;hourlyRate:string;reason:string}
export const rehireText=(parent:HTMLElement,tag:string,value:string,className=""):HTMLElement=>{const el=document.createElement(tag);el.className=className;el.textContent=value;parent.appendChild(el);return el;};
const card=(root:HTMLElement,title:string,copy:string,kind=""):HTMLElement=>{const el=document.createElement("section");el.className=`wf-rehire-card ${kind}`;rehireText(el,"h3",title);rehireText(el,"p",copy);root.appendChild(el);return el;};
const dates=(root:HTMLElement,left:string,leftValue:string,right:string,rightValue:string)=>{const grid=document.createElement("div");grid.className="wf-rehire-dates";for(const [label,value] of [[left,leftValue],[right,rightValue]]){const item=document.createElement("div");rehireText(item,"span",label);rehireText(item,"strong",value);grid.appendChild(item);}root.appendChild(grid);};
const protection=(root:HTMLElement)=>card(root,"그대로 보존하는 정보","사번·최초 입사일·과거 재직기간과 시급·배정 원본, 이미 승인·계산된 수당을 유지합니다. 대기 실적은 저장 후 원본 Excel을 다시 읽어 확인하며 자동 승인하지 않습니다.","wf-rehire-preserve");

export function createRehireForm(employee:EmployeeRecord,mode:RehireMode,sites:SiteRecord[],values:RehireFields):HTMLElement {
  const root=document.createElement("div");root.className="wf-rehire";
  rehireText(root,"div","01 입력  →  02 변경 내용 확인  →  03 저장 결과","wf-rehire-steps");
  rehireText(root,"h3",`${employee.name} · ${employee.employeeCode}`,"wf-rehire-identity");
  rehireText(root,"p",mode==="reschedule"?"시작 전 예약의 날짜·시급·배정을 함께 변경합니다. 기존 예약은 취소 이력으로 남기고 새 예약을 만듭니다.":"같은 직원 기록에 새 재직기간을 추가합니다. 오늘·과거 재입사와 미래 재입사 예약을 모두 등록할 수 있습니다.");
  dates(root,"최초 입사일",employee.hireDate||"확인 필요","이전 퇴사일",employee.scheduledRehire?.previousRetireDate||employee.retireDate||"확인 필요");
  const grid=document.createElement("div");grid.className="wf-rehire-fields";
  grid.innerHTML=`<label>재입사일 <input id="rehire-date" type="date" class="workforce-input" required aria-describedby="rehire-date-hint"></label><label>새 시급 (원)<input id="rehire-rate" type="number" min="0" step="any" class="workforce-input" aria-describedby="rehire-rate-hint"></label><label>근무지<select id="rehire-site" class="workforce-select"></select></label><label>근무조<select id="rehire-group" class="workforce-select" aria-describedby="rehire-group-hint"></select></label>`;
  root.appendChild(grid);
  root.querySelector<HTMLInputElement>("#rehire-date")!.value=values.startDate;
  const rate=root.querySelector<HTMLInputElement>("#rehire-rate")!;rate.value=values.hourlyRate;rate.disabled=isBpEmploymentType(employee.employmentType);
  const site=root.querySelector<HTMLSelectElement>("#rehire-site")!;site.add(new Option("근무지를 선택해 주세요",""));sites.filter(s=>s.status==="active").forEach(s=>site.add(new Option(s.name,s.id)));site.value=values.siteId;
  rehireText(root,"p","이전 퇴사일부터 재입사 전날까지는 근무·시급 적용 대상에서 제외합니다. 재입사 당일부터 새 시급과 배정을 적용합니다.","workforce-form-hint").id="rehire-date-hint";
  rehireText(root,"p",rate.disabled?"BP는 수당 지급 대상이 아니므로 시급 이력을 등록하지 않습니다.":"새 기간에 적용할 시급을 직접 입력해 주세요. 0원은 미입력과 다르며, 실적 승인 시 지급 가능한 시급인지 별도로 확인합니다.","workforce-form-hint").id="rehire-rate-hint";
  rehireText(root,"p","선택한 재입사일에 사용 가능한 근무조를 불러옵니다.","workforce-form-hint").id="rehire-group-hint";
  const reason=rehireText(root,"label","처리 사유 (선택)","wf-rehire-reason");const input=document.createElement("textarea");input.id="rehire-reason";input.className="workforce-input";input.maxLength=500;input.rows=2;input.value=values.reason;reason.appendChild(input);
  card(root,"미래 날짜를 선택하면","목록에 ‘재입사 예정’으로 표시됩니다. 서울 날짜가 재입사일이 되면 저장된 새 시급·배정이 조회에 반영됩니다. 화면을 계속 열어 두었다면 새로고침해 확인해 주세요. 시작 전에는 예약 변경·취소가 가능하며, 관련 승인·계산 이력이 있으면 제한됩니다.");
  protection(root);const error=rehireText(root,"p","","workforce-form-error");error.id="rehire-error";error.setAttribute("role","alert");return root;
}

export function createRehireReview(employee:EmployeeRecord,request:EmployeeRehireInput,siteName:string):HTMLElement {
  const root=document.createElement("div");root.className="wf-rehire";root.id="rehire-review";
  rehireText(root,"div","02 변경 내용 확인","wf-rehire-steps");rehireText(root,"h3",`${employee.name} · ${employee.employeeCode}`,"wf-rehire-identity");
  rehireText(root,"p",`최초 입사일 ${employee.hireDate||"확인 필요"} · 이전 재직기간 ${employee.employmentPeriods?.filter(p=>!p.cancelled&&p.endDate===(employee.scheduledRehire?.previousRetireDate||employee.retireDate)).at(-1)?.startDate||employee.hireDate||"확인 필요"} ~ ${employee.scheduledRehire?.previousRetireDate||employee.retireDate} (퇴사일·근무 제외)`,"workforce-form-hint");
  if(request.operation==="cancel"){
    dates(root,"취소할 재입사 예약",employee.scheduledRehire!.startDate,"돌아갈 퇴사일",employee.scheduledRehire!.previousRetireDate);
    card(root,"예약 취소 후","이전 퇴사일을 복원합니다. 이전 퇴사일이 미래라면 그 전날까지 기존 재직기간을 유지합니다. 취소한 예약의 새 시급·배정은 적용하지 않고 이력으로 보관하며, 새 시급·배정은 추가하지 않습니다.","wf-rehire-warning");
  }else{
    const future=request.startDate>getSeoulTodayDateString();dates(root,request.operation==="reschedule"?"기존 예약일":"이전 퇴사일",employee.scheduledRehire?.startDate||employee.retireDate||"확인 필요",future?"새 재입사 예약일":"재입사일",request.startDate);
    const details=card(root,future?"예약할 새 근무 조건":"적용할 새 근무 조건",`${siteName} · ${request.shiftGroup} · ${isBpEmploymentType(employee.employmentType)?"BP · 시급 미등록":formatCurrency(request.hourlyRate!)}`);
    rehireText(details,"p",request.operation==="reschedule"?"기존 예약은 취소 이력으로 남깁니다. 새 재직기간 1개와 새 배정 1개를 추가하고, BP를 제외하면 새 시급 1개를 추가합니다.":"새 재직기간 1개와 새 배정 1개를 추가하고, BP를 제외하면 새 시급 1개를 추가합니다.");
    card(root,"퇴사 공백과 적용 시작",`이전 퇴사일 ${employee.scheduledRehire?.previousRetireDate||employee.retireDate}부터 ${request.startDate} 전날까지는 근무·시급 적용 대상에서 제외합니다. ${request.startDate} 당일부터 새 기간의 조건을 사용합니다.`);
  }
  protection(root);rehireText(root,"p","내용이 맞으면 아래 저장 버튼을 눌러 주세요. 돌아가기를 누르면 아직 저장하지 않은 입력을 수정할 수 있습니다.","workforce-form-hint");const err=rehireText(root,"p","","workforce-form-error");err.id="rehire-error";err.setAttribute("role","alert");return root;
}

export function createRehireResult(employee:EmployeeSaveResult):HTMLElement {
  const change=employee.rehireChange!,root=document.createElement("div");root.className="wf-rehire";root.id="rehire-result";
  rehireText(root,"div","03 저장 완료","wf-rehire-steps");rehireText(root,"h3",change.kind==="reservation-cancelled"?"재입사 예약을 취소했습니다.":employee.scheduledRehire?"재입사 예약을 저장했습니다.":"재입사를 저장했습니다.","wf-rehire-identity");
  dates(root,"이전 퇴사일",change.previousRetireDate,change.kind==="reservation-cancelled"?"취소한 예약일":"재입사일",change.startDate);
  const stats=document.createElement("div");stats.className="wf-rehire-stats";for(const [label,count] of [["새 시급",change.newWageCount],["새 배정",change.newAssignmentCount]]){const item=document.createElement("div");rehireText(item,"strong",`${count}건`);rehireText(item,"span",String(label));stats.appendChild(item);}root.appendChild(stats);
  const refresh=change.pendingPerformanceRefresh;card(root,refresh?.status==="partial"?"직원 정보는 저장됐지만 일부 대기 실적을 다시 읽지 못했습니다.":refresh?.targetFileCount===0?"다시 읽을 대기 실적이 없습니다.":"대기 실적 확인 결과",refresh?refresh.targetFileCount===0?"이번 변경에 해당하는 대기 파일이 없어 파일을 다시 읽지 않았습니다. 인력 상세에서 날짜·시급·배정을 확인해 주세요.":`대상 ${refresh.targetFileCount}개 중 ${refresh.refreshedFileCount}개 파일을 다시 읽었습니다. 이미 승인·계산된 수당은 유지합니다.`:"다시 읽기 결과를 받지 못했습니다. 저장된 직원 정보는 유지하며 실적 관리에서 원본 파일과 금액을 확인해 주세요.",refresh?.status==="partial"?"wf-rehire-warning":"");
  if(refresh?.issues.length){const details=document.createElement("details");rehireText(details,"summary","다시 읽지 못한 파일과 조치 확인");refresh.issues.forEach(issue=>rehireText(details,"p",`${issue.fileName}: ${issue.message}`));root.appendChild(details);}
  card(root,"이제 확인해 주세요",change.kind==="reservation-cancelled"?"복원한 이전 퇴사일과 취소 이력을 확인해 주세요. 이전 퇴사일이 미래라면 그 전날까지 기존 재직기간을 유지합니다. 대기 실적은 실적 관리에서 적용 대상과 금액을 확인해 주세요.":employee.scheduledRehire?"인력 목록의 재입사 예정 상태와 예약일·시급·배정을 확인해 주세요. 예약은 시작 전까지 상세 화면에서 변경·취소할 수 있습니다.":"인력 상세에서 현재 시급과 배정을 확인한 뒤, 실적 관리에서 해당 근무일의 금액과 알림을 확인하고 승인해 주세요.","wf-rehire-next");
  return root;
}

export function appendEmploymentPanel(parent:HTMLElement,employee:EmployeeRecord,canWrite:boolean,onOpen?:(employee:EmployeeRecord,mode:RehireMode)=>void):void {
  if(!employee.employmentPeriods&&employee.status!=="retired")return;
  const root=document.createElement("section");root.className="wf-rehire-detail";root.id="employee-employment-panel";
  const scheduled=employee.scheduledRehire;rehireText(root,"h3",scheduled?`재입사 예정 · ${scheduled.startDate}`:"재직기간과 재입사");
  rehireText(root,"p",scheduled?`${scheduled.siteName} · ${scheduled.shiftGroup} · ${scheduled.hourlyRate===undefined?"시급 미등록":formatCurrency(scheduled.hourlyRate)}. 재입사일 전까지 새 시급·배정은 현재 근무에 적용되지 않습니다.`:employee.status==="retired"?"복귀하는 직원은 같은 사번으로 재입사할 수 있습니다. 새 기간의 날짜·시급·배정을 함께 확인합니다.":"최초 입사일을 유지하며 각 재입사 기간의 시급·배정을 구분합니다.");
  if(scheduled?.blockedReason)rehireText(root,"p",scheduled.blockedReason,"workforce-form-error");
  const actions=document.createElement("div");actions.className="wf-rehire-actions";
  for(const mode of scheduled?["reschedule","cancel"] as const:employee.status==="retired"?["start"] as const:[]){const button=document.createElement("button");button.id=`btn-rehire-${mode}`;button.type="button";button.className=`workforce-btn workforce-btn-${mode==="cancel"?"secondary":"primary"} workforce-btn-sm`;button.textContent=mode==="start"?"같은 사번으로 재입사":mode==="reschedule"?"예약 변경":"예약 취소";button.disabled=!canWrite||Boolean(scheduled&&!scheduled.canManage);button.addEventListener("click",()=>{if(!button.disabled)onOpen?.(employee,mode);});actions.appendChild(button);}root.appendChild(actions);
  if(employee.employmentPeriods){const history=document.createElement("details");history.id="employee-employment-history";rehireText(history,"summary",`재직·예약 이력 ${employee.employmentPeriods.length}개 보기`);for(const period of employee.employmentPeriods)rehireText(history,"p",`${period.cancelled?"취소한 예약":period.startDate>getSeoulTodayDateString()?"예정":period.endDate?"종료":"재직"} · ${period.startDate} ~ ${period.cancelled?"미적용":period.endDate?`${period.endDate} (퇴사일·근무 제외)`:"계속"}`);root.appendChild(history);}parent.appendChild(root);
}
