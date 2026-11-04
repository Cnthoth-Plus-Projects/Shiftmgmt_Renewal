import type { ShiftPatternCycleInput, ShiftPatternStepInput } from "../../shared/bridge/contracts";
import type { PresetTeamPattern, PatternPresetDefinition } from "../../shared/bridge/pattern-presets";
import { parsePatternPresetDefinition } from "../../shared/bridge/pattern-presets";
import { getDutyCodes, type PatternDraft } from "./sites-pattern-model";
import { validateHolidayPolicy } from "../../shared/domain/holiday-pattern";
import { isOffDutyCode } from "../../shared/domain/duty-type-catalog";
import { showConfirm } from "./operations-ui";

const names:Record<string,string>={D:"주",E:"석",N:"야",O:"휴"};
const copy=<T>(v:T):T=>structuredClone(v);
const day=(s:string)=>Date.parse(`${s}T00:00:00Z`)/86400000;
export const guiBaseDate=(d:PatternDraft):string=>d.patternStartDate||d.effectiveFrom||d.cycles[0]?.patternStartDate||new Date().toISOString().slice(0,10);
export const patternText=(steps:ShiftPatternStepInput[]):string=>steps.map(s=>names[s.dutyCode]||"·").join("");
export function projectTeamPatterns(d:PatternDraft,base=guiBaseDate(d)):PresetTeamPattern[]{
  return d.teamSettings.filter(t=>t.isActive!==false).map(t=>{
    const key=d.teamCycleAssignments.find(a=>a.teamLabel===t.teamLabel)?.cycleKey,c=d.cycles.find(c=>c.cycleKey===key);
    const steps=copy(c?.steps||[]).sort((a,b)=>a.stepIndex-b.stepIndex),n=steps.length;
    const index=c?.teamIndexes.find(i=>i.teamLabel===t.teamLabel)?.index??0,anchor=c?.patternStartDate||d.patternStartDate||d.effectiveFrom||base;
    const offset=Number.isFinite(day(base)-day(anchor))?day(base)-day(anchor)+index:index;
    return {teamLabel:t.teamLabel,displayName:t.displayName||t.teamLabel,steps:steps.map((_,i)=>({...steps[((i+offset)%n+n)%n],stepIndex:i})),patternStartDate:base,shiftCount:c?.shiftCount||3,holidayTimeMode:c?.holidayTimeMode,weekdayPublicHolidayAsHoliday:c?.weekdayPublicHolidayAsHoliday};
  });
}
const signature=(r:PresetTeamPattern):string=>JSON.stringify({steps:r.steps.map(s=>({...s,stepIndex:undefined})),date:r.patternStartDate,shiftCount:r.shiftCount,holidayTimeMode:r.holidayTimeMode||"unified",holiday:r.weekdayPublicHolidayAsHoliday!==false});
/** Only user edits materialize cycles. Opening a legacy pattern never rewrites it. */
export function applyTeamPatterns(d:PatternDraft,rows:PresetTeamPattern[],base=guiBaseDate(d)):void{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(base)||!Number.isFinite(day(base)))throw Error("패턴 시작일을 입력해 주세요.");
  const work=copy(d),prior=projectTeamPatterns(d,base),active=d.teamSettings.filter(t=>t.isActive!==false);
  if(new Set(rows.map(r=>r.teamLabel)).size!==active.length||rows.length!==active.length||rows.some(r=>!active.some(t=>t.teamLabel===r.teamLabel)))throw Error("등록된 모든 조의 패턴을 함께 지정해 주세요.");
  if(new Set(rows.map(r=>r.steps.length)).size!==1||!rows[0]?.steps.length)throw Error("모든 조의 반복 패턴 칸 수가 같아야 합니다.");
  if(base!==guiBaseDate(d))for(const cycle of work.cycles)if(!cycle.patternStartDate)cycle.patternStartDate=guiBaseDate(d);
  for(const row of rows){
    if(signature(row)===signature(prior.find(r=>r.teamLabel===row.teamLabel)!))continue;
    const assignment=work.teamCycleAssignments.find(a=>a.teamLabel===row.teamLabel),source=work.cycles.find(c=>c.cycleKey===assignment?.cycleKey);
    const retainedIndex=source?.teamIndexes.some(i=>i.teamLabel!==row.teamLabel&&(!active.some(t=>t.teamLabel===i.teamLabel)||!work.teamCycleAssignments.some(a=>a.teamLabel===i.teamLabel)));
    const exclusive=source&&!retainedIndex&&!work.teamCycleAssignments.some(a=>a.cycleKey===source.cycleKey&&a.teamLabel!==row.teamLabel);
    let cycle:ShiftPatternCycleInput|undefined=exclusive?source:undefined;
    if(!cycle){cycle={cycleKey:`gui:${crypto.randomUUID()}`,name:`${row.displayName} 반복 패턴`,order:work.cycles.length,shiftCount:row.shiftCount,patternCode:"",steps:[],teamIndexes:[]};work.cycles.push(cycle);}
    cycle.steps=copy(row.steps).map((s,i)=>({...s,stepIndex:i}));cycle.patternCode=cycle.steps.map(s=>s.dutyCode).join("-");cycle.patternString=patternText(cycle.steps);cycle.patternStartDate=base;cycle.shiftCount=row.shiftCount;cycle.holidayTimeMode=row.holidayTimeMode;cycle.weekdayPublicHolidayAsHoliday=row.weekdayPublicHolidayAsHoliday;
    cycle.teamIndexes=[...cycle.teamIndexes.filter(i=>i.teamLabel!==row.teamLabel),{teamLabel:row.teamLabel,index:0}];if(assignment)assignment.cycleKey=cycle.cycleKey;else work.teamCycleAssignments.push({teamLabel:row.teamLabel,cycleKey:cycle.cycleKey});
  }
  if(work.cycles.length>8)throw Error("기존·비활성 조의 보관 패턴을 포함해 최대 8개 묶음까지 저장할 수 있습니다. 다른 조의 자료를 지우지 않고 이번 변경을 중단했습니다.");
  work.patternStartDate=base;work.requestedCycleCount=work.cycles.length;work.patternCode=work.cycles[0]?.patternCode||"";work.isPerTeamPattern=true;Object.assign(d,work);
}
export function resizeTeamPatterns(rows:PresetTeamPattern[],length:number):PresetTeamPattern[]{
  if(!Number.isInteger(length)||length<1||length>1000)throw Error("반복 패턴은 1~1000칸으로 지정해 주세요.");
  return rows.map(r=>({...copy(r),steps:Array.from({length},(_,i)=>r.steps[i]?{...r.steps[i],stepIndex:i}:{stepIndex:i,dutyCode:"",breakMinutes:0})}));
}
export function makePatternPreset(d:PatternDraft):PatternPresetDefinition{
  const holidayPolicy=copy(d.holidayPolicy);if(holidayPolicy)delete holidayPolicy.dateExceptions;
  return parsePatternPresetDefinition({holidayPolicy,version:1,effectiveFrom:d.effectiveFrom,patternStartDate:guiBaseDate(d),dutyTypes:copy(d.dutyTypes),dutyCodes:getDutyCodes(d.dutyTypes,d.dutyCodes),rows:projectTeamPatterns(d)});
}
export function loadPatternPreset(d:PatternDraft,definition:PatternPresetDefinition):void{
  const p=parsePatternPresetDefinition(definition),active=d.teamSettings.filter(t=>t.isActive!==false);if(active.length!==p.rows.length)throw Error(`저장 패턴은 ${p.rows.length}개 조입니다. 기본 설정의 조 수(${active.length}개)를 먼저 맞춰 주세요.`);
  const work=copy(d),oldCodes=getDutyCodes(d.dutyTypes,d.dutyCodes),activeLabels=new Set(active.map(t=>t.teamLabel));
  const retainedCodes=new Set(d.cycles.filter(c=>c.teamIndexes.some(i=>!activeLabels.has(i.teamLabel))||d.teamCycleAssignments.some(a=>a.cycleKey===c.cycleKey&&!activeLabels.has(a.teamLabel))).flatMap(c=>c.steps.map(s=>s.dutyCode)));
  for(const old of d.dutyTypes){const code=oldCodes[old.id],incoming=p.dutyTypes.find(t=>p.dutyCodes[t.id]===code);if(retainedCodes.has(code)&&incoming&&(incoming.label!==old.label||incoming.kind!==old.kind))throw Error("비활성 조에서 사용하는 근무 유형 이름이 저장 패턴과 다릅니다. 기존 자료를 보존하기 위해 불러오기를 중단했습니다.");}
  work.dutyTypes=p.dutyTypes.map(t=>{const code=p.dutyCodes[t.id],old=t.kind==="work"?d.dutyTypes.find(o=>o.kind==="work"&&oldCodes[o.id]===code):d.dutyTypes.find(o=>o.kind==="off"&&o.label===t.label);return {...copy(t),id:old?.id||t.id};});work.dutyCodes={};work.dutyTypes.forEach((t,i)=>{if(work.dutyCodes![t.id]!==undefined)throw Error("기존 근무 유형 식별값과 충돌하여 불러오기를 중단했습니다.");work.dutyCodes![t.id]=p.dutyCodes[p.dutyTypes[i].id];});for(const duty of d.dutyTypes){const code=oldCodes[duty.id];if(duty.kind==="work"&&!Object.values(work.dutyCodes).includes(code)&&d.cycles.some(c=>c.steps.some(s=>s.dutyCode===code))){work.dutyTypes.push(copy(duty));work.dutyCodes[duty.id]=code;}}if(work.dutyTypes.filter(t=>t.kind==="work").length>3)throw Error("기존 조의 근무 유형을 보존할 수 없어 불러오기를 중단했습니다.");const rows=p.rows.map((r,i)=>({...r,teamLabel:active[i].teamLabel,displayName:active[i].displayName||active[i].teamLabel}));applyTeamPatterns(work,rows,p.patternStartDate);work.effectiveFrom=p.effectiveFrom;work.holidayPolicy=copy(p.holidayPolicy);
  if(d.holidayPolicy?.dateExceptions?.length){work.holidayPolicy??={version:1,rules:{}};work.holidayPolicy.dateExceptions=copy(d.holidayPolicy.dateExceptions);}
  if(work.holidayPolicy)for(const rule of Object.values(work.holidayPolicy.rules)){
    if(rule.teamPatterns){const old=rule.teamPatterns;rule.teamPatterns=Object.fromEntries(p.rows.map((r,i)=>[active[i].teamLabel,old[r.teamLabel]]));}
    if(rule.teamTimes){const old=rule.teamTimes;rule.teamTimes=Object.fromEntries(p.rows.flatMap((r,i)=>old[r.teamLabel]?[[active[i].teamLabel,old[r.teamLabel]]]:[]));}
  }
  const policyError=validateHolidayPolicy(work.holidayPolicy,active.map(t=>t.teamLabel),Object.values(work.dutyCodes??{}),work.effectiveFrom);if(policyError)throw Error(policyError);
  Object.assign(d,work);
}
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls="",text=""):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
export interface TeamEditorOptions {draft:PatternDraft;initial:PatternDraft;selectedDuty:()=>string;onChange:(render?:boolean)=>void;onError:(message:string)=>void;onOpenDetails?:(team?:string)=>void;}
export function renderTeamPatternEditor(o:TeamEditorOptions):HTMLElement{
  const d=o.draft,base=guiBaseDate(d),rows=projectTeamPatterns(d,base),length=Math.max(1,...rows.map(r=>r.steps.length)),box=el("div","sites-gui-team-editor");
  if(length>8)box.classList.add("is-long-pattern");
  const apply=(next:PresetTeamPattern[],date=base)=>{try{applyTeamPatterns(d,next,date);o.onChange();}catch(e){o.onError((e as Error).message);}};
  const controls=el("div","sites-gui-controls");
  const dateLabel=el("label","","패턴 시작일 "),star=el("span","sites-required","*");dateLabel.append(star);const date=el("input","sites-form-input");date.id="cycle-start-date";date.type="date";date.value=base;date.setAttribute("aria-label","모든 조의 패턴 시작일");date.setAttribute("aria-required","true");date.addEventListener("change",()=>apply(rows.map(r=>({...r,patternStartDate:date.value})),date.value));dateLabel.append(date);
  const nLabel=el("label","","반복 주기 ");nLabel.append(el("span","sites-required","*"));const count=el("input","sites-form-input");count.id="gui-cycle-length";count.type="number";count.min="1";count.max="1000";count.value=String(length);count.setAttribute("aria-label","모든 조의 반복 패턴 칸 수");nLabel.append(count);
  const resize=(n:number)=>{const run=()=>{try{apply(resizeTeamPatterns(rows,n));}catch(e){o.onError((e as Error).message);}};if(n<length)showConfirm({title:"뒤쪽 패턴 칸 삭제",message:`모든 조의 ${n+1}~${length}일차 칸을 초안에서 삭제합니다. 실행 취소로 되돌릴 수 있습니다.`,confirmLabel:"칸 삭제",onConfirm:run});else run();};
  const button=(text:string,id:string,fn:()=>void)=>{const b=el("button","btn-secondary",text);b.type="button";b.id=id;b.addEventListener("click",fn);return b;};
  controls.append(dateLabel,nLabel,button("칸 수 적용","btn-gui-resize",()=>resize(Number(count.value))),button("+ 일차","btn-add-day",()=>resize(length+1)),button("− 일차","btn-del-pattern-step",()=>resize(length-1)));box.append(controls);
  const help=el("p","sites-gui-help",`${rows.length}개 조 · ${length}일 반복 · ${length>8?"상세 편집에서 조별 전체 일차를 설정하세요.":"유형을 선택하고 칸을 누르세요."} 빈 칸은 모두 지정해야 합니다.`);box.append(help);
  const table=el("div","sites-gui-rows");table.style.setProperty("--pattern-days",String(length));
  const heads=el("div","sites-gui-team-head");heads.append(el("b","","조"));const days=el("div","sites-gui-slots");if(length<=8)for(let i=0;i<length;i++)days.append(el("span","",String(i+1)));heads.append(days,el("span","","자동 생성 문자열"),el("span","","이동 / 초기화"));table.append(heads);
  for(const [teamOrder,row] of rows.entries()){
    const line=el("div","sites-team-pattern-row sites-gui-team-row");line.dataset.team=row.teamLabel;line.append(el("strong","",row.displayName));const slots=el("div","sites-pattern-strip sites-gui-slots");
    if(length<=8)for(let i=0;i<length;i++){const step=row.steps[i],code=step?.dutyCode||"",duty=d.dutyTypes.find(t=>getDutyCodes(d.dutyTypes,d.dutyCodes)[t.id]===code);const b=el("button",`sites-pattern-cell duty-${code||"none"}`,duty?.label||"미지정");b.type="button";b.dataset.team=row.teamLabel;b.dataset.index=String(i);b.dataset.duty=code;b.dataset.cycle=row.teamLabel;b.title=`${row.displayName} ${i+1}일차 ${duty?.label||"미지정"}`;b.setAttribute("aria-label",b.title);
      const paint=()=>{const selected=d.dutyTypes.find(t=>t.id===o.selectedDuty());if(!selected)return;const next=resizeTeamPatterns(rows,length),r=next.find(r=>r.teamLabel===row.teamLabel)!;r.steps[i]={stepIndex:i,dutyCode:getDutyCodes(d.dutyTypes,d.dutyCodes)[selected.id],startTime:selected.startTime,endTime:selected.endTime,breakMinutes:selected.breakMinutes??0,holidayStartTime:selected.holidayStartTime,holidayEndTime:selected.holidayEndTime,holidayBreakMinutes:selected.holidayBreakMinutes};r.shiftCount=Math.max(r.shiftCount,new Set(r.steps.filter(s=>s.dutyCode&&s.dutyCode!=="O").map(s=>s.dutyCode)).size);apply(next);};b.addEventListener("click",paint);b.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();paint();}});slots.append(b);}
    const string=el("code","sites-team-pattern-string",patternText(row.steps));string.title=string.textContent||"";const actions=el("div","sites-gui-row-actions");if(length>8){string.textContent=patternText(row.steps).slice(0,32)+(length>32?"…":"");const details=button("상세 편집","",()=>o.onOpenDetails?.(row.teamLabel));details.classList.add("btn-team-pattern-details");details.dataset.team=row.teamLabel;actions.append(details);}
    for(const delta of [1,-1]){const b=button(delta===1?"←":"→","",()=>{const next=copy(rows),r=next.find(r=>r.teamLabel===row.teamLabel)!;r.steps=r.steps.map((_,i)=>({...row.steps[(i+delta+row.steps.length)%row.steps.length],stepIndex:i}));apply(next);});b.setAttribute("aria-label",`${row.displayName} 패턴 한 칸 ${delta===1?"앞으로":"뒤로"} 이동`);actions.append(b);}
    const reset=button("초기화","",()=>showConfirm({title:`${row.displayName} 패턴 초기화`,message:`열었을 때의 패턴을 현재 ${length}칸에 반복 배치합니다. 다른 조는 유지하며 실행 취소할 수 있습니다.`,confirmLabel:"초기화",onConfirm:()=>{const initial=projectTeamPatterns(o.initial,base).find(r=>r.teamLabel===row.teamLabel);if(!initial?.steps.length){o.onError("초기 패턴이 없습니다.");return;}const next=copy(rows),r=next.find(r=>r.teamLabel===row.teamLabel)!;r.steps=Array.from({length},(_,i)=>{const s=initial.steps[i%initial.steps.length],type=d.dutyTypes.find(t=>getDutyCodes(d.dutyTypes,d.dutyCodes)[t.id]===s.dutyCode);return {...s,stepIndex:i,...(type?{startTime:type.startTime,endTime:type.endTime,breakMinutes:type.breakMinutes??0,holidayStartTime:type.holidayStartTime,holidayEndTime:type.holidayEndTime,holidayBreakMinutes:type.holidayBreakMinutes}:{})};});apply(next);}}));reset.classList.add("sites-team-reset");reset.dataset.team=row.teamLabel;actions.append(reset);if(length>8){
      line.replaceChildren();line.classList.add("sites-pattern-summary-card",`summary-team-${teamOrder%4}`);
      const header=el("div","sites-pattern-summary-header"),avatar=el("span","sites-pattern-team-avatar",row.teamLabel.slice(0,1)),name=el("strong","",row.displayName);
      const blanks=row.steps.filter(s=>!s.dutyCode).length,off=row.steps.filter(s=>isOffDutyCode(s.dutyCode)).length;
      const status=el("span",`sites-pattern-completeness ${blanks?"needs-input":"ready"}`,blanks?`미지정 ${blanks}칸`:"설정 완료");
      header.append(avatar,name,status,actions);
      const strip=el("div","sites-pattern-summary-strip");strip.setAttribute("role","img");strip.setAttribute("aria-label",`${row.displayName} ${length}일 패턴 · 미지정 ${blanks}칸`);
      for(const step of row.steps.slice(0,28)){const dot=el("span",`summary-duty-${isOffDutyCode(step.dutyCode)?"O":step.dutyCode||"none"}`);dot.title=isOffDutyCode(step.dutyCode)?(d.dutyTypes.find(t=>t.kind==="off")?.label||"휴무"):d.dutyTypes.find(t=>getDutyCodes(d.dutyTypes,d.dutyCodes)[t.id]===step.dutyCode)?.label||"미지정";strip.append(dot);}
      const footer=el("div","sites-pattern-summary-footer"),counts=el("small","sites-pattern-counts",`근무 ${length-off-blanks} · 휴무 ${off}`);footer.append(string,counts);line.append(header,strip,footer);
    }else line.append(slots,string,actions);table.append(line);
  }
  box.append(table);return box;
}
