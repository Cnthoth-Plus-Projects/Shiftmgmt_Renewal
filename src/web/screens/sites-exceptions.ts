import type { EmployeeRecord } from "../../shared/domain/model";
import type { DateScheduleException } from "../../shared/domain/schedule-exceptions";
import { parseDateScheduleExceptions } from "../../shared/domain/schedule-exceptions";
import { validateHolidayPolicy } from "../../shared/domain/holiday-pattern";
import { buildMonthlyScheduleDraft } from "../../shared/domain/monthly-schedule-draft";
import { draftToPatternRecord, buildVirtualTeamEmployees } from "./sites-simulation";
import { getDutyCodes, type PatternDraft } from "./sites-pattern-model";
import { WorkforceDialog } from "./workforce-dialog";
import { renderPagination } from "../pagination";

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls="",text=""):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
type Form = { id?:string; from:string; to:string; scope:"site"|"team"|"employee"; teamLabel:string; employeeId:string; replacementId:string; reason:string; mode:"off"|"time"|"work"|"replacement"; dutyCode:"D"|"E"|"N"; startTime:string; endTime:string; breakMinutes:number; };
/** Changes remain detached until Apply, including paired planned replacement entries. */
export class SitesExceptionsEditor {
  private dialog=new WorkforceDialog();private mount=el("div","sites-exceptions");private rows:DateScheduleException[];private form:Form;private dirty=false;private page=1;private generation=0;private disposed=false;
  private people:EmployeeRecord[];
  constructor(private draft:PatternDraft,employees:EmployeeRecord[],private onApply:()=>void){
    this.rows=structuredClone(draft.holidayPolicy?.dateExceptions??[]);
    this.people=employees.filter(e=>e.currentSiteId===draft.siteId&&!!e.currentShiftGroup&&e.status!=="retired");this.form=this.empty();
  }
  destroy():void{this.disposed=true;this.generation++;this.dialog.close();}
  open():void{
    this.render();this.dialog.open({id:"sites-exceptions-modal",title:"날짜·개인 예외 설정",width:"1240px",content:this.mount,initialFocusSelector:'input[aria-label="예외 시작일"]',buttons:[
      {id:"btn-exceptions-cancel",label:"취소",onClick:()=>this.dialog.close()},
      {id:"btn-exceptions-apply",label:"초안에 적용",variant:"primary",onClick:()=>{if(this.dirty&&!this.stage())return;const message=this.validate(this.rows);if(message){this.error(message);return;}if(this.draft.holidayPolicy||this.rows.length){this.draft.holidayPolicy??={version:1,rules:{}};this.draft.holidayPolicy.dateExceptions=structuredClone(this.rows);}this.dialog.close();this.onApply();}}
    ]});
  }
  private empty():Form{const from=[this.draft.effectiveFrom||"",new Date().toLocaleDateString("sv-SE")].sort().at(-1)!;return{from,to:from,scope:"site",teamLabel:this.draft.teamSettings.find(t=>t.isActive!==false)?.teamLabel??"",employeeId:this.people?.[0]?.id??"",replacementId:this.people?.[1]?.id??"",reason:"",mode:"off",dutyCode:"D",startTime:"09:00",endTime:"18:00",breakMinutes:60};}
  private button(text:string,id:string,action:()=>void,cls="btn-secondary"):HTMLButtonElement{const b=el("button",cls,text);b.type="button";b.id=id;b.addEventListener("click",action);return b;}
  private error(message:string):void{const box=this.mount.querySelector<HTMLElement>(".sites-editor-alert")!;box.textContent=message;box.hidden=false;}
  private validate(rows:DateScheduleException[]):string|undefined{return validateHolidayPolicy({...this.draft.holidayPolicy,version:1,rules:this.draft.holidayPolicy?.rules??{},dateExceptions:rows},this.draft.teamSettings.filter(t=>t.isActive!==false).map(t=>t.teamLabel),Object.values(getDutyCodes(this.draft.dutyTypes,this.draft.dutyCodes)),this.draft.effectiveFrom);}
  private candidate():DateScheduleException[]{
    for(const input of Array.from(this.mount.querySelectorAll<HTMLInputElement>(".sites-exception-form input")))if(!input.reportValidity())throw Error("필수 입력 항목을 확인해 주세요.");
    const f=this.form,scope=f.mode==="replacement"?"employee":f.scope;
    if(scope==="employee"&&!this.people.some(e=>e.id===f.employeeId))throw Error("이 근무지에 배정된 인원을 선택해 주세요. 신규 근무지는 인력 배정·저장 후 개인 예외를 설정할 수 있습니다.");
    const row:DateScheduleException={id:f.id??crypto.randomUUID(),from:f.from,to:f.to,scope,reason:f.reason,...(scope==="team"?{teamLabel:f.teamLabel}:scope==="employee"?{employeeId:f.employeeId}:{})};
    if(f.mode==="off"||f.mode==="replacement")row.dutyCode="O";
    else{if(f.mode==="work")row.dutyCode=f.dutyCode;row.timing={startTime:f.startTime,endTime:f.endTime,breakMinutes:f.breakMinutes};}
    const next=this.rows.filter(r=>r.id!==f.id);next.push(row);
    if(f.mode==="replacement"){
      if(f.employeeId===f.replacementId||!this.people.some(e=>e.id===f.replacementId))throw Error("원래 근무자와 다른 대체 투입 인원을 선택해 주세요.");
      next.push({id:crypto.randomUUID(),from:f.from,to:f.to,scope:"employee",employeeId:f.replacementId,reason:`${f.reason} · 대체 투입`,dutyCode:f.dutyCode,timing:{startTime:f.startTime,endTime:f.endTime,breakMinutes:f.breakMinutes}});
    }
    const parsed=parseDateScheduleExceptions(next)!;const message=this.validate(parsed);if(message)throw Error(message);
    for(const r of parsed.filter(r=>r.scope==="employee")){const p=this.people.find(e=>e.id===r.employeeId);if(!p||[p.hireDate,p.currentAssignmentStartDate].some(d=>d&&r.from<d)||(p.currentAssignmentEndDate&&r.to>p.currentAssignmentEndDate)||(p.retireDate&&r.to>=p.retireDate)||!this.draft.teamSettings.some(t=>t.isActive!==false&&t.teamLabel===p.currentShiftGroup))throw Error("개인 예외의 날짜가 인력 배정·재직 기간과 맞지 않습니다. 배정된 날짜 안으로 기간을 나눠 주세요.");}
    return parsed;
  }
  private stage():boolean{try{this.rows=this.candidate();this.dirty=false;this.form=this.empty();this.page=Math.max(1,Math.ceil(this.rows.length/6));this.render();return true;}catch(e){this.error((e as Error).message);return false;}}
  private target(row:DateScheduleException):string{return row.scope==="site"?"근무지 전체":row.scope==="team"?(this.draft.teamSettings.find(t=>t.teamLabel===row.teamLabel)?.displayName||row.teamLabel!):(this.people.find(e=>e.id===row.employeeId)?`${this.people.find(e=>e.id===row.employeeId)!.name} · ${this.people.find(e=>e.id===row.employeeId)!.employeeCode}`:"현재 미배정 인원");}
  private edit(row:DateScheduleException):void{
    if(this.dirty){this.error("작성 중인 내용을 목록에 추가하거나 ‘입력 취소’를 누른 뒤 다른 항목을 선택해 주세요.");return;}
    this.form={...this.empty(),id:row.id,from:row.from,to:row.to,scope:row.scope,teamLabel:row.teamLabel??"",employeeId:row.employeeId??"",reason:row.reason,mode:row.dutyCode==="O"?"off":row.dutyCode?"work":"time",dutyCode:row.dutyCode&&row.dutyCode!=="O"?row.dutyCode:"D",...row.timing};this.render();
  }
  private render():void{
    this.mount.replaceChildren();const banner=el("div","sites-exception-banner");banner.innerHTML='<span class="material-symbols-outlined" aria-hidden="true">event_note</span><div><b>반복 패턴은 그대로, 필요한 날짜만 다르게</b><p>근무지 전체 → 특정 조 → 개인 순서로 적용합니다. 기간이 끝나면 원래 패턴으로 돌아가며 차례는 멈추지 않습니다.</p></div>';this.mount.append(banner);
    const alert=el("div","sites-editor-alert");alert.hidden=true;alert.setAttribute("role","alert");this.mount.append(alert);
    const layout=el("div","sites-exception-layout"),list=el("section","sites-exception-list"),form=el("section","sites-exception-form");layout.append(list,form);this.mount.append(layout);
    const listHead=el("div","sites-exception-section-head");listHead.append(el("h3","",`예외 목록 · ${this.rows.length}건`),this.button("+ 새 예외","btn-exception-new",()=>{if(this.dirty){this.error("작성 중인 내용을 목록에 추가하거나 입력을 취소해 주세요.");return;}this.form=this.empty();this.render();}));list.append(listHead);
    this.page=Math.min(this.page,Math.max(1,Math.ceil(this.rows.length/6)));
    if(!this.rows.length)list.append(el("p","sites-exception-empty","아직 예외가 없습니다. 오른쪽에서 날짜와 대상을 선택해 추가하세요. 일반적인 교대근무는 기본·휴일 규칙만으로 운영할 수 있습니다."));
    for(const row of this.rows.slice((this.page-1)*6,this.page*6)){
      const card=el("article",`sites-exception-item ${this.form.id===row.id?"is-selected":""}`),select=this.button("","",()=>this.edit(row),"sites-exception-item-select");
      select.append(el("span",`sites-exception-scope scope-${row.scope}`,this.target(row)),el("b","",row.reason),el("small","",`${row.from}${row.to!==row.from?` ~ ${row.to}`:""} · ${row.dutyCode==="O"?"휴무":row.timing?`${row.timing.startTime}~${row.timing.endTime} · 휴게 ${row.timing.breakMinutes}분`:"근무 변경"}`));select.dataset.exceptionId=row.id;
      card.append(select,this.button("삭제","",()=>{this.rows=this.rows.filter(r=>r.id!==row.id);if(this.form.id===row.id){this.form=this.empty();this.dirty=false;}this.render();},"btn-secondary sites-exception-delete"));list.append(card);
    }
    list.append(renderPagination({currentPage:this.page,totalPages:Math.ceil(this.rows.length/6),totalCount:this.rows.length,idPrefix:"exceptions-page",label:"예외 목록 페이지",onPageChange:p=>{this.page=p;this.render();}}),el("p","sites-form-help","목록 변경은 ‘초안에 적용’ 전까지 임시입니다. 취소하면 열기 전 상태로 돌아갑니다."));
    form.append(el("h3","",this.form.id?"선택한 예외 수정":"어떤 날짜를 바꿀까요?"));const dates=el("div","sites-exception-fields");dates.append(this.input("예외 시작일","from","date"),this.input("예외 종료일","to","date"));form.append(dates);
    form.append(this.select("적용 범위","scope",[["site","근무지 전체"],["team","특정 조"],["employee","개인"]]));
    if(this.form.scope==="team")form.append(this.select("대상 조","teamLabel",this.draft.teamSettings.filter(t=>t.isActive!==false).map(t=>[t.teamLabel,t.displayName||t.teamLabel])));
    if(this.form.scope==="employee")form.append(this.peopleSelect("대상 인원","employeeId"));
    form.append(this.select("변경 방식","mode",[["off","휴무로 변경"],["time","근무 차례 유지 · 시간만 변경"],["work","근무 유형·시간 변경"],...(this.form.scope==="employee"?[["replacement","휴무 + 다른 인원 대체 투입"]]:[])]));
    if(this.form.mode==="replacement")form.append(this.peopleSelect("대체 투입 인원","replacementId"),el("p","sites-form-help","원래 인원의 휴무와 대체 인원의 근무를 2건으로 함께 추가합니다. 이 근무지에 배정된 인원만 선택할 수 있습니다. 예정 근무 변경이며 실제 실적·수당을 직접 만들지 않습니다."));
    if(this.form.mode!=="off"){
      if(this.form.mode!=="time")form.append(this.select("예외 근무 유형","dutyCode",this.draft.dutyTypes.filter(t=>t.kind==="work").map(t=>[getDutyCodes(this.draft.dutyTypes,this.draft.dutyCodes)[t.id],t.label])));
      const times=el("div","sites-exception-fields times");times.append(this.input("예외 시작 시간","startTime","time"),this.input("예외 종료 시간","endTime","time"),this.input("예외 휴게 분","breakMinutes","number"));form.append(times);
      if(this.form.mode==="time")form.append(el("p","sites-form-help","원래 휴무인 날은 휴무를 유지합니다. 휴무일에 근무를 추가하려면 ‘근무 유형·시간 변경’을 선택하세요."));
    }
    form.append(this.input("예외 사유","reason","text"));const actions=el("div","sites-exception-actions");actions.append(this.button("입력 취소","btn-exception-reset",()=>{this.form=this.empty();this.dirty=false;this.render();}),this.button(this.form.id?"변경 내용 반영":"예외 목록에 추가","btn-exception-stage",()=>this.stage(),"btn-primary"),this.button("결과 미리보기","btn-exception-preview",()=>void this.preview()));form.append(actions);
    this.mount.append(el("p","sites-exception-footnote","공휴일 날짜는 ‘운영 관리 → 공휴일’에 등록된 목록과 연동됩니다. 여기서는 해당 근무지의 예외만 설정합니다. 저장된 근무표·승인 실적은 자동 변경하지 않으며, 근무표 생성 전 결과를 확인하세요."));
    const preview=el("section","sites-exception-preview");preview.id="sites-exception-preview";preview.setAttribute("aria-live","polite");preview.append(el("p","sites-form-help","‘결과 미리보기’에서 운영 관리의 공휴일과 실제 배정 인원을 반영한 변경 전·후를 확인할 수 있습니다."));this.mount.append(preview);
  }
  private input(label:string,key:"from"|"to"|"reason"|"startTime"|"endTime"|"breakMinutes",type:string):HTMLElement{
    const wrap=el("label","sites-exception-field"),title=el("span","",label),star=el("span","sites-required"," *"),input=el("input","sites-form-input");star.setAttribute("aria-hidden","true");title.append(star);wrap.append(title);input.type=type;input.value=String(this.form[key]);input.setAttribute("aria-label",label);input.required=true;if(type==="number"){input.min="0";input.max="1440";input.step="1";}if(key==="reason"){input.maxLength=190;input.placeholder="예: 시설 점검, 행사 지원, 연차, 대체 투입";}input.addEventListener("input",()=>{if(key==="breakMinutes")this.form.breakMinutes=Number(input.value);else this.form[key]=input.value;this.dirty=true;this.generation++;});wrap.append(input);return wrap;
  }
  private select(label:string,key:"scope"|"mode"|"teamLabel"|"employeeId"|"replacementId"|"dutyCode",options:string[][]):HTMLElement{
    const wrap=el("label","sites-exception-field",label),select=el("select","sites-form-input");select.setAttribute("aria-label",label);for(const [value,text]of options){const o=el("option","",text);o.value=value;select.append(o);}select.value=this.form[key];
    select.addEventListener("change",()=>{Object.assign(this.form,{[key]:select.value});if(key==="scope"&&this.form.mode==="replacement")this.form.mode="off";if(key==="dutyCode"){const duty=this.draft.dutyTypes.find(t=>getDutyCodes(this.draft.dutyTypes,this.draft.dutyCodes)[t.id]===select.value);if(duty)Object.assign(this.form,{startTime:duty.startTime??"09:00",endTime:duty.endTime??"18:00",breakMinutes:duty.breakMinutes??0});}this.dirty=true;this.generation++;this.render();});wrap.append(select);return wrap;
  }
  private peopleSelect(label:string,key:"employeeId"|"replacementId"):HTMLElement{
    const field=this.select(label,key,this.people.length?this.people.map(e=>[e.id,`${e.name} · ${e.employeeCode} · ${e.currentShiftGroup}`]):[["","이 근무지에 배정된 인원이 없습니다"]]);if(!this.people.length){field.querySelector("select")!.disabled=true;field.append(el("small","sites-form-help","근무지 저장·인력 배정 후 개인 예외를 설정하세요."));}return field;
  }
  private async preview():Promise<void>{
    const box=this.mount.querySelector<HTMLElement>("#sites-exception-preview")!;let rows:DateScheduleException[];try{rows=this.dirty?this.candidate():this.rows;const error=this.validate(rows);if(error)throw Error(error);}catch(e){this.error((e as Error).message);return;}
    const request=++this.generation;box.replaceChildren(el("p","sites-form-help","공휴일과 배정 인원을 확인하고 있습니다…"));
    try{
      const from=(this.dirty||this.form.id?this.form.from:rows[0]?.from)||this.empty().from,days=Array.from({length:7},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10)),years=[...new Set(days.map(d=>Number(d.slice(0,4))))];
      const results=await Promise.all(years.map(y=>window.appBridge!.getSchedulePreparationContext(y)));if(this.disposed||request!==this.generation)return;
      for(const r of results)if(!r.ok)throw Error("공휴일 목록을 읽지 못했습니다. 운영 관리의 공휴일 설정과 연결 상태를 확인한 뒤 다시 시도해 주세요.");
      const dates=new Set(results.flatMap(r=>r.ok?r.data.publicHolidayDates:[])),pattern=draftToPatternRecord(this.draft),before=structuredClone(pattern);pattern.holidayPolicy={...pattern.holidayPolicy,version:1,rules:pattern.holidayPolicy?.rules??{},dateExceptions:rows};if(before.holidayPolicy)delete before.holidayPolicy.dateExceptions;
      const employees=this.people.length?this.people:buildVirtualTeamEmployees(pattern),months=[...new Set(days.map(d=>d.slice(0,7)))],options={employees,publicHolidayDates:dates};
      const prior=months.flatMap(scheduleMonth=>buildMonthlyScheduleDraft({...options,pattern:before,scheduleMonth})),after=months.flatMap(scheduleMonth=>buildMonthlyScheduleDraft({...options,pattern,scheduleMonth}));
      box.replaceChildren(el("b","",`변경 전·후 · ${from}부터 7일 표본 · 공휴일 ${dates.size}일 연동`));const table=el("table","sites-table"),head=el("thead");head.innerHTML="<tr><th>날짜</th><th>대상</th><th>변경 전</th><th>변경 후</th></tr>";table.append(head);const body=el("tbody"),codes=getDutyCodes(this.draft.dutyTypes,this.draft.dutyCodes),text=(r:{dutyCode:string;startTime?:string;endTime?:string;breakMinutes?:number})=>r.dutyCode==="O"?"휴무":`${this.draft.dutyTypes.find(t=>codes[t.id]===r.dutyCode)?.label??r.dutyCode} ${r.startTime}~${r.endTime} · 휴게${r.breakMinutes??0}분`;
      const changed=after.map((row,i)=>({row,old:prior[i]})).filter(({row,old})=>days.includes(row.workDate)&&JSON.stringify(row)!==JSON.stringify(old));
      for(const {row,old}of changed.slice(0,20)){const tr=el("tr");for(const value of [row.workDate,`${row.employeeName} · ${row.teamLabel}`,text(old),text(row)])tr.append(el("td","",value));body.append(tr);}table.append(body);box.append(table,el("p","sites-form-help",changed.length?`${changed.length}개 변경 중 최대20개를 표시합니다. 전체 기간의 원본 설정은 모두 저장됩니다.`:"선택한 7일에 변경되는 근무가 없습니다. 예외 날짜·대상 배정 기간과 설정 적용일을 확인하세요."));box.scrollIntoView({block:"nearest"});
    }catch(e){if(!this.disposed&&request===this.generation){box.replaceChildren(el("p","sites-editor-alert",(e as Error).message));}}
  }
}
