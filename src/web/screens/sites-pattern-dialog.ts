import type { PatternDraft } from "./sites-pattern-model";
import type { PresetTeamPattern } from "../../shared/bridge/pattern-presets";
import { getDutyCodes } from "./sites-pattern-model";
import { applyTeamPatterns, guiBaseDate, patternText, projectTeamPatterns, resizeTeamPatterns } from "./sites-team-pattern";
import { WorkforceDialog } from "./workforce-dialog";

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls="",text=""):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
interface Snapshot {base:string;rows:PresetTeamPattern[];}
/** All operations stay in a detached draft until Apply; closing is always lossless. */
export class SitesPatternDialog {
  private dialog=new WorkforceDialog();
  private mount=el("div","sites-pattern-detail");
  private state:Snapshot;
  private initial:Snapshot;
  private selected:string;
  private paint:string;
  private page=1;
  private from=1;
  private to=1;
  private copyFrom="";
  private error="";
  private shrinking:number|null=null;
  private past:Snapshot[]=[];
  private future:Snapshot[]=[];
  private readonly pageSize=28;
  constructor(private draft:PatternDraft,private onApply:()=>void,team?:string){
    this.state={base:guiBaseDate(draft),rows:projectTeamPatterns(draft)};this.initial=structuredClone(this.state);
    this.selected=team||this.state.rows[0]?.teamLabel||"";this.paint=draft.dutyTypes[0]?.id||"";this.to=this.state.rows[0]?.steps.length||1;
  }
  public destroy():void{this.dialog.close();}
  public open():void{
    this.render();this.dialog.open({id:"sites-pattern-detail-modal",title:"반복 패턴 상세 편집",width:"1240px",content:this.mount,initialFocusSelector:".sites-detail-team-tab",buttons:[
      {id:"btn-pattern-detail-cancel",label:"취소",onClick:()=>this.dialog.close()},
      {id:"btn-pattern-detail-apply",label:"초안에 적용",variant:"primary",onClick:()=>{
        try{applyTeamPatterns(this.draft,this.state.rows,this.state.base);this.dialog.close();this.onApply();}
        catch(error){this.error=(error as Error).message;this.render();}
      }}
    ]});
  }
  private change(action:()=>void):void{this.past.push(structuredClone(this.state));if(this.past.length>20)this.past.shift();this.future=[];action();this.error="";this.render();}
  private button(text:string,action:()=>void,cls="btn-secondary",id?:string):HTMLButtonElement{const b=el("button",cls,text);b.type="button";if(id)b.id=id;b.addEventListener("click",action);return b;}
  private chosenStep(index:number){const duty=this.draft.dutyTypes.find(d=>d.id===this.paint);if(!duty)throw Error("칠할 근무 유형을 선택해 주세요.");return {stepIndex:index,dutyCode:getDutyCodes(this.draft.dutyTypes,this.draft.dutyCodes)[duty.id],startTime:duty.startTime,endTime:duty.endTime,breakMinutes:duty.breakMinutes??0,holidayStartTime:duty.holidayStartTime,holidayEndTime:duty.holidayEndTime,holidayBreakMinutes:duty.holidayBreakMinutes};}
  private rangeValid(length:number):boolean{if(!Number.isInteger(this.from)||!Number.isInteger(this.to)||this.from<1||this.to<this.from||this.to>length){this.error=`적용 구간은 1~${length}일차 안에서 앞 번호부터 입력해 주세요.`;this.render();return false;}return true;}
  private render():void{
    this.mount.replaceChildren();const length=this.state.rows[0]?.steps.length||1,row=this.state.rows.find(r=>r.teamLabel===this.selected)||this.state.rows[0];if(!row)return;
    this.selected=row.teamLabel;this.page=Math.max(1,Math.min(this.page,Math.ceil(length/this.pageSize)));
    const top=el("div","sites-detail-top");
    const dateLabel=el("label","","패턴 시작일 "),date=el("input","sites-form-input");dateLabel.append(el("span","sites-required","*"));date.type="date";date.value=this.state.base;date.required=true;date.setAttribute("aria-label","상세 패턴 시작일");date.addEventListener("change",()=>{if(!date.reportValidity()||!date.value)return;this.change(()=>{this.state.base=date.value;this.state.rows.forEach(r=>r.patternStartDate=date.value);});});dateLabel.append(date);
    const lengthLabel=el("label","","모든 조의 반복 주기 "),n=el("input","sites-form-input");lengthLabel.append(el("span","sites-required","*"));n.type="number";n.min="1";n.max="1000";n.step="1";n.value=String(length);n.setAttribute("aria-label","상세 반복 일수");lengthLabel.append(n);
    const resize=this.button(this.shrinking?`${this.shrinking+1}일차 이후 삭제 확인`:"일수 적용",()=>{
      if(!n.reportValidity())return;const count=Number(n.value);
      if(count<length&&this.shrinking!==count){this.shrinking=count;this.error=`모든 조의 ${count+1}~${length}일차가 삭제됩니다. 아래 확인 버튼을 다시 눌러 적용하세요. 실행 취소할 수 있습니다.`;this.render();return;}
      this.change(()=>{this.state.rows=resizeTeamPatterns(this.state.rows,count);this.shrinking=null;this.from=1;this.to=count;this.page=1;});
    },"btn-secondary","btn-detail-resize");
    if(this.shrinking){n.value=String(this.shrinking);n.addEventListener("input",()=>this.shrinking=null);}
    const undo=this.button("실행 취소",()=>{const previous=this.past.pop();if(previous){this.future.push(structuredClone(this.state));this.state=previous;this.error="";this.render();}},"btn-secondary","btn-detail-undo");undo.disabled=!this.past.length;
    const redo=this.button("다시 실행",()=>{const next=this.future.pop();if(next){this.past.push(structuredClone(this.state));this.state=next;this.error="";this.render();}},"btn-secondary","btn-detail-redo");redo.disabled=!this.future.length;
    top.append(dateLabel,lengthLabel,resize,undo,redo);this.mount.append(top);
    this.mount.append(el("p","sites-detail-guide","조를 선택한 뒤 근무 유형으로 칸을 칠하세요. 긴 패턴은 28일씩 나눠 표시하며, 시작일과 반복 일수는 모든 조에 함께 적용합니다. 최종 등록 전까지 초안입니다."));
    if(this.error){const alert=el("div","sites-editor-alert",this.error);alert.setAttribute("role","alert");this.mount.append(alert);}
    const layout=el("div","sites-detail-layout"),nav=el("nav","sites-detail-team-nav");nav.setAttribute("aria-label","편집할 조");
    for(const team of this.state.rows){const blanks=team.steps.filter(s=>!s.dutyCode).length,b=this.button("",()=>{this.selected=team.teamLabel;this.page=1;this.from=1;this.to=length;this.render();},"sites-detail-team-tab");b.dataset.team=team.teamLabel;b.setAttribute("aria-pressed",String(team.teamLabel===this.selected));b.append(el("strong","",team.displayName),el("small","",blanks?`미지정 ${blanks}칸`:`${length}일 설정됨`));nav.append(b);}
    const canvas=el("section","sites-detail-canvas");canvas.setAttribute("aria-label",`${row.displayName} 패턴 편집`);
    const heading=el("div","sites-detail-canvas-heading");heading.append(el("h3","",row.displayName),el("span","",`${length}일 반복 · 미지정 ${row.steps.filter(s=>!s.dutyCode).length}칸`));canvas.append(heading);
    const brush=el("div","sites-detail-brush");brush.append(el("b","","칠할 유형"));const codes=getDutyCodes(this.draft.dutyTypes,this.draft.dutyCodes);
    for(const duty of this.draft.dutyTypes){const b=this.button(duty.label,()=>{this.paint=duty.id;this.render();},`sites-duty-choice duty-${codes[duty.id]}`);b.dataset.detailDuty=duty.id;b.setAttribute("aria-pressed",String(this.paint===duty.id));brush.append(b);}canvas.append(brush);
    const range=el("div","sites-detail-range");range.append(el("span","","적용 구간"));
    for(const [key,value] of [["from",this.from],["to",this.to]] as const){const input=el("input","sites-form-input");input.type="number";input.min="1";input.max=String(length);input.value=String(value);input.setAttribute("aria-label",key==="from"?"구간 시작 일차":"구간 끝 일차");input.addEventListener("input",()=>this[key]=Number(input.value));range.append(input);if(key==="from")range.append(el("span","","~"));}
    const fill=(onlyBlank=false)=>{if(!this.rangeValid(length))return;this.change(()=>{for(let i=this.from-1;i<this.to;i++)if(!onlyBlank||!row.steps[i].dutyCode)row.steps[i]=this.chosenStep(i);row.shiftCount=Math.max(row.shiftCount,new Set(row.steps.filter(s=>s.dutyCode&&s.dutyCode!=="O").map(s=>s.dutyCode)).size);});};
    range.append(this.button("구간 채우기",()=>fill(),"btn-secondary","btn-detail-fill"),this.button("빈 칸만 채우기",()=>fill(true),"btn-secondary","btn-detail-fill-empty"),this.button("이 구간을 뒤로 반복",()=>{if(!this.rangeValid(length))return;const seed=structuredClone(row.steps.slice(this.from-1,this.to));if(seed.some(s=>!s.dutyCode)){this.error="반복할 구간의 빈 칸부터 지정해 주세요.";this.render();return;}this.change(()=>{for(let i=this.to;i<length;i++)row.steps[i]={...seed[(i-this.to)%seed.length],stepIndex:i};});},"btn-secondary","btn-detail-repeat"));canvas.append(range);
    const transfer=el("div","sites-detail-transfer"),source=el("select","sites-form-select");source.setAttribute("aria-label","복사할 원본 조");const placeholder=el("option","","다른 조 패턴 가져오기");placeholder.value="";source.append(placeholder);
    for(const team of this.state.rows.filter(r=>r.teamLabel!==this.selected)){const option=el("option","",team.displayName);option.value=team.teamLabel;source.append(option);}source.value=this.copyFrom;source.addEventListener("change",()=>this.copyFrom=source.value);
    const copy=this.button("가져오기",()=>{const from=this.state.rows.find(r=>r.teamLabel===this.copyFrom);if(!from||from===row){this.error="가져올 다른 조를 먼저 선택해 주세요.";this.render();return;}this.change(()=>{row.steps=structuredClone(from.steps);row.shiftCount=from.shiftCount;});},"btn-secondary","btn-detail-copy");
    transfer.append(source,copy);
    for(const [delta,label] of [[1,"한 칸 앞당김"],[-1,"한 칸 뒤로"]] as const)transfer.append(this.button(label,()=>this.change(()=>{const steps=structuredClone(row.steps);row.steps=steps.map((_,i)=>({...steps[(i+delta+length)%length],stepIndex:i}));})));
    transfer.append(this.button("이 조 변경 취소",()=>this.change(()=>{const initial=this.initial.rows.find(r=>r.teamLabel===row.teamLabel);if(initial){row.steps=resizeTeamPatterns([initial],length)[0].steps;row.shiftCount=initial.shiftCount;}})));canvas.append(transfer);
    const start=(this.page-1)*this.pageSize,end=Math.min(start+this.pageSize,length),grid=el("div","sites-detail-day-grid");
    for(let i=start;i<end;i++){
      const step=row.steps[i],duty=this.draft.dutyTypes.find(d=>codes[d.id]===step.dutyCode),label=duty?.label||"미지정",tile=this.button("",()=>this.change(()=>{row.steps[i]=this.chosenStep(i);row.shiftCount=Math.max(row.shiftCount,new Set(row.steps.filter(s=>s.dutyCode&&s.dutyCode!=="O").map(s=>s.dutyCode)).size);}),`sites-detail-day duty-${step.dutyCode||"none"}`);
      tile.dataset.team=row.teamLabel;tile.dataset.index=String(i);tile.dataset.duty=step.dutyCode;tile.setAttribute("aria-label",`${row.displayName} ${i+1}일차 ${label}`);
      const day=el("small","",`${i+1}일차`),name=el("strong","",label),time=el("span","",step.dutyCode==="O"?"근무 없음":step.startTime&&step.endTime?`${step.startTime}–${step.endTime}`:"유형 선택 후 클릭");tile.append(day,name,time);grid.append(tile);
    }canvas.append(grid);
    const footer=el("div","sites-detail-day-pages"),previous=this.button("‹ 이전",()=>{this.page--;this.render();},"btn-secondary","btn-detail-prev"),next=this.button("다음 ›",()=>{this.page++;this.render();},"btn-secondary","btn-detail-next");previous.disabled=this.page<=1;next.disabled=end>=length;
    footer.append(el("span","",`${start+1}–${end}일차 / 전체 ${length}일 · ${this.page}/${Math.ceil(length/this.pageSize)}페이지`),previous,next);canvas.append(footer);
    const string=el("div","sites-detail-string");string.append(el("small","","자동 생성 문자열"),el("code","",patternText(row.steps)));canvas.append(string);
    layout.append(nav,canvas);this.mount.append(layout);
  }
}
