import type { EmployeeRecord, ShiftPatternRecord, SiteRecord } from "../../shared/domain/model";
import type { EmployeeRehireInput, EmployeeSaveResult, EmployeeUpsertInput } from "../../shared/bridge/contracts";
import { resolveShiftPatternForDate } from "../../shared/domain/shift-pattern-version";
import { getSeoulTodayDateString, getSeoulMaxHireDateString, isBpEmploymentType, MIN_HIRE_DATE, validateHireDate } from "./workforce-model";
import { WorkforceDialog } from "./workforce-dialog";
import { createRehireForm, createRehireResult, createRehireReview, type RehireFields, type RehireMode } from "./workforce-rehire-view";

interface Options {
  dialog:WorkforceDialog;
  getSites:()=>SiteRecord[];
  onFetchShiftPatterns:(siteId:string)=>Promise<{ok:boolean;patterns?:ShiftPatternRecord[];message?:string}>;
  onSave:(input:EmployeeUpsertInput)=>Promise<{ok:boolean;employee?:EmployeeSaveResult;message?:string}>;
  onSaved:(employee:EmployeeSaveResult)=>Promise<boolean>;
  onNavigatePerformance?:()=>void;
}

export class WorkforceRehire {
  private revision=0;
  private destroyed=false;
  constructor(private options:Options){}
  public destroy():void {this.destroyed=true;this.revision++;}

  public open(employee:EmployeeRecord,mode:RehireMode="start",restored?:RehireFields):void {
    if(this.destroyed)return;const generation=++this.revision;
    if(mode!=="start"&&(!employee.scheduledRehire||!employee.scheduledRehire.canManage))return;
    if(mode==="cancel"){this.review(employee,{operation:"cancel",periodId:employee.scheduledRehire!.periodId,expectedRevision:employee.scheduledRehire!.revisionToken},generation);return;}
    const booking=employee.scheduledRehire,values=restored??{startDate:booking?.startDate||getSeoulTodayDateString(),siteId:booking?.siteId||employee.currentSiteId||"",shiftGroup:booking?.shiftGroup||"",hourlyRate:booking?.hourlyRate?.toString()||"",reason:""};
    const content=createRehireForm(employee,mode,this.options.getSites(),values),date=content.querySelector<HTMLInputElement>("#rehire-date")!,site=content.querySelector<HTMLSelectElement>("#rehire-site")!,group=content.querySelector<HTMLSelectElement>("#rehire-group")!,rate=content.querySelector<HTMLInputElement>("#rehire-rate")!,reason=content.querySelector<HTMLTextAreaElement>("#rehire-reason")!,error=content.querySelector<HTMLElement>("#rehire-error")!;
    date.min=[MIN_HIRE_DATE,booking?.previousRetireDate||employee.retireDate||MIN_HIRE_DATE].sort().at(-1)!;date.max=getSeoulMaxHireDateString(getSeoulTodayDateString());
    let groupGeneration=0,patterns:ShiftPatternRecord[]=[];let ready=false;
    const loadGroups=async()=>{
      const request=++groupGeneration,selected=group.value||values.shiftGroup,selectedSite=site.value,selectedDate=date.value;ready=false;group.replaceChildren(new Option("근무조를 불러오는 중입니다...",""));group.disabled=true;
      try{
        const response=selectedSite?await this.options.onFetchShiftPatterns(selectedSite):{ok:true,patterns:[]};
        if(!response.ok)throw new Error(response.message||"근무조를 불러오지 못했습니다.");patterns=response.patterns??[];
        if(this.destroyed||generation!==this.revision||request!==groupGeneration||!content.isConnected)return;
        const active=resolveShiftPatternForDate(patterns,selectedDate)?.teamSettings.filter(team=>team.isActive)??[];group.replaceChildren(new Option(active.length?"근무조를 선택해 주세요":"이 날짜에 사용 가능한 근무조가 없습니다",""));active.forEach(team=>group.add(new Option(team.teamLabel,team.teamLabel)));group.value=active.some(t=>t.teamLabel===selected)?selected:"";group.disabled=!active.length;ready=Boolean(active.length);
        content.querySelector<HTMLElement>("#rehire-group-hint")!.textContent=active.length?"재입사일 기준으로 사용 가능한 근무조입니다. 저장할 때 해당 날짜의 정원도 확인합니다.":"근무지와 재입사일을 확인해 주세요. 해당 날짜의 근무조 설정이 필요하면 근무지 관리에서 확인해 주세요.";
      }catch{if(content.isConnected&&request===groupGeneration)error.textContent="근무조를 불러오지 못했습니다. 근무지를 다시 선택해 주세요.";}
    };
    const read=():RehireFields=>({startDate:date.value,siteId:site.value,shiftGroup:group.value,hourlyRate:rate.value,reason:reason.value.trim()});
    this.options.dialog.open({id:"modal-rehire-input",title:mode==="reschedule"?"재입사 예약 변경":"같은 사번으로 재입사",width:"760px",content,initialFocusSelector:"#rehire-date",buttons:[{id:"rehire-close",label:"닫기",onClick:()=>this.options.dialog.close()},{id:"rehire-next",label:"변경 내용 확인",variant:"primary",onClick:()=>{
      error.textContent="";const fields=read(),validation=validateHireDate(fields.startDate,getSeoulTodayDateString());
      if(!validation.valid){error.textContent=validation.message?.replace(/입사일/g,"재입사일")||"재입사일을 확인해 주세요.";date.focus();return;}
      if(fields.startDate<(booking?.previousRetireDate||employee.retireDate||"")){error.textContent="재입사일은 이전 퇴사일보다 빠를 수 없습니다.";date.focus();return;}
      if(!fields.siteId||!ready||!fields.shiftGroup){error.textContent="재입사일에 사용 가능한 근무지와 근무조를 선택해 주세요.";return;}
      if(!rate.disabled&&(!fields.hourlyRate||!Number.isFinite(Number(fields.hourlyRate))||Number(fields.hourlyRate)<0||Number(fields.hourlyRate)>Number.MAX_SAFE_INTEGER)){error.textContent="새 시급을 0 이상의 유효한 숫자로 입력해 주세요. 미입력과 0원은 다릅니다.";rate.focus();return;}
      const common={startDate:fields.startDate,siteId:fields.siteId,shiftGroup:fields.shiftGroup,...(isBpEmploymentType(employee.employmentType)?{}:{hourlyRate:Number(fields.hourlyRate)}),reason:fields.reason};
      const request:EmployeeRehireInput=mode==="start"?{operation:"start",...common,expectedRetireDate:employee.retireDate!,expectedUpdatedAt:employee.updatedAt}:{operation:"reschedule",...common,periodId:booking!.periodId,expectedRevision:booking!.revisionToken};
      this.review(employee,request,generation,fields);
    }}]});
    date.addEventListener("input",()=>void loadGroups());date.addEventListener("change",()=>void loadGroups());site.addEventListener("change",()=>void loadGroups());void loadGroups();
  }

  private review(employee:EmployeeRecord,request:EmployeeRehireInput,generation:number,fields?:RehireFields):void {
    const content=createRehireReview(employee,request,request.operation==="cancel"?"":this.options.getSites().find(s=>s.id===request.siteId)?.name||"근무지 확인 필요"),dialog=this.options.dialog;let saving=false;
    dialog.open({id:"modal-rehire-review",title:request.operation==="cancel"?"예약 취소 전 확인":"재입사 저장 전 확인",width:"760px",content,initialFocusSelector:"#rehire-back",buttons:[{id:"rehire-back",label:"돌아가기",onClick:()=>request.operation==="cancel"?dialog.close():this.open(employee,request.operation==="start"?"start":"reschedule",fields)},{id:"rehire-save",label:request.operation==="cancel"?"예약 취소 확정":request.startDate>getSeoulTodayDateString()?"예약 저장":"재입사 저장",variant:request.operation==="cancel"?"danger":"primary",onClick:async()=>{
      if(saving||this.destroyed||generation!==this.revision)return;saving=true;const token=dialog.captureToken();dialog.setProcessing(true,"재입사 정보와 관련 대기 실적을 확인하고 있습니다...",token);
      try{
        const result=await this.options.onSave({...employee,rehire:request});if(this.destroyed||generation!==this.revision||!dialog.isCurrent(token))return;
        if(!result.ok||!result.employee?.rehireChange){content.querySelector<HTMLElement>("#rehire-error")!.textContent=result.message||"재입사 처리 결과를 확인하지 못했습니다. 저장 상태를 다시 확인해 주세요.";return;}
        const refreshed=await this.options.onSaved(result.employee);if(this.destroyed||generation!==this.revision||!dialog.isCurrent(token))return;
        const resultView=createRehireResult(result.employee);if(!refreshed){const warning=document.createElement("p");warning.className="workforce-form-error";warning.setAttribute("role","alert");warning.textContent="직원 정보는 저장됐지만 전체 목록을 다시 불러오지 못했습니다. 저장 응답의 직원 정보는 반영했습니다. 다른 직원·근무지 정보와 상세 이력은 인력 관리를 다시 열어 확인해 주세요.";resultView.appendChild(warning);}
        dialog.open({id:"modal-rehire-result",title:"재입사 처리 결과",width:"760px",content:resultView,initialFocusSelector:"#rehire-done",buttons:[...(this.options.onNavigatePerformance?[{id:"rehire-performance",label:"실적 관리에서 확인",onClick:()=>{dialog.close();this.options.onNavigatePerformance?.();}}]:[]),{id:"rehire-done",label:"인력 정보 확인",variant:"primary",onClick:()=>dialog.close()}]});
      }catch{if(dialog.isCurrent(token))content.querySelector<HTMLElement>("#rehire-error")!.textContent="처리 결과를 받지 못했습니다. 인력 정보를 새로 불러와 저장 여부를 확인한 뒤 다시 진행해 주세요.";}finally{saving=false;dialog.setProcessing(false,undefined,token);}
    }}]});
  }
}
