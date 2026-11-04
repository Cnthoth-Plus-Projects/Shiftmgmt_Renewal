import { WorkforceDialog } from "./workforce-dialog";
import { planAssignmentMoves, isValidDateString } from "./sites-model";
import { showConfirm } from "./operations-ui";
// sites-organization.ts — 마법사 2단계: 조직 구성 (좌측 인력 풀 + 우측 조별 보드)
import type { EmployeeRecord } from "../../shared/domain/model";
import type { PatternDraft } from "./sites-pattern-model";
import { type SiteEmployeeIdentity } from "./sites-model";

export interface StagedAssignmentMove {
  employeeId: string;
  fromTeam?: string;
  toTeam: string;
  startDate?: string;
  sortOrder?: number;
  orderOnly?: boolean;
}

export interface SitesOrganizationOptions {
  container: HTMLElement;
  draft: PatternDraft;
  allEmployees: EmployeeRecord[];
  identityMap: Map<string, SiteEmployeeIdentity>;
  stagedMoves: StagedAssignmentMove[];
  onUpdateMoves: (moves: StagedAssignmentMove[]) => void;
  onNavigateWorkforce: () => void;
}

export class SitesOrganization {
  private container: HTMLElement;
  private draft: PatternDraft;
  private allEmployees: EmployeeRecord[];
  private identityMap: Map<string, SiteEmployeeIdentity>;
  private stagedMoves: StagedAssignmentMove[];
  private onUpdateMoves: (moves: StagedAssignmentMove[]) => void;
  private onNavigateWorkforce: () => void;

  private poolScope = "all";
  private poolKeyword = "";
  private poolPage = 1;
  private poolPageSize = 8;
  private resizeObserver: ResizeObserver | null = null;
  private settingsDialog = new WorkforceDialog();
  private draggedEmployeeId: string | null = null;
  private selectedEmployeeId: string | null = null;
  private assignmentStartDate = "2026-01-01";
  private warningMessage = "";
  private disposed=false;
  public destroy():void {this.disposed=true;this.settingsDialog.close();this.resizeObserver?.disconnect();}

  constructor(options: SitesOrganizationOptions) {
    this.container = options.container;
    this.draft = options.draft;
    this.allEmployees = options.allEmployees;
    this.identityMap = options.identityMap;
    this.stagedMoves = [...options.stagedMoves];
    this.onUpdateMoves = options.onUpdateMoves;
    this.onNavigateWorkforce = options.onNavigateWorkforce;
    this.assignmentStartDate = options.stagedMoves.find(m=>m.startDate)?.startDate || options.draft.effectiveFrom || "";
  }

  private placements(): Map<string,string> {
    const result=new Map(this.allEmployees.filter(e=>e.currentSiteId===this.draft.siteId&&e.currentShiftGroup).map(e=>[e.id,e.currentShiftGroup!]));
    for(const m of this.stagedMoves)if(m.toTeam)result.set(m.employeeId,m.toTeam);else result.delete(m.employeeId);
    return result;
  }
  private memberIds(team:string):string[] {
    return [...this.placements()].filter(([,t])=>t===team).map(([id])=>id).sort((a,b)=>{
      const ea=this.allEmployees.find(e=>e.id===a)!,eb=this.allEmployees.find(e=>e.id===b)!;
      return (this.stagedMoves.find(m=>m.employeeId===a)?.sortOrder??ea.currentAssignmentOrder??0)-(this.stagedMoves.find(m=>m.employeeId===b)?.sortOrder??eb.currentAssignmentOrder??0)||ea.employeeCode.localeCompare(eb.employeeCode,"ko",{numeric:true});
    });
  }
  private commitOrder(ids:string[],team:string):void {
    const old=new Map(this.stagedMoves.map(m=>[m.employeeId,m]));this.stagedMoves=this.stagedMoves.filter(m=>!ids.includes(m.employeeId));
    ids.forEach((id,sortOrder)=>{const emp=this.allEmployees.find(e=>e.id===id)!,prior=old.get(id);this.stagedMoves.push({...prior,employeeId:id,fromTeam:emp.currentShiftGroup,toTeam:team,sortOrder,orderOnly:prior?prior.orderOnly:emp.currentSiteId===this.draft.siteId&&emp.currentShiftGroup===team});});
    this.onUpdateMoves([...this.stagedMoves]);this.render();
  }
  private dropMember(team:string,targetId?:string,after=false):void {
    const id=this.draggedEmployeeId;this.draggedEmployeeId=null;if(!id)return;
    const oldTeam=this.placements().get(id);if(oldTeam!==team&&!this.assignEmployeeToTeam(id,team))return;
    const ids=this.memberIds(team).filter(i=>i!==id),index=targetId?ids.indexOf(targetId):-1;
    ids.splice(index<0?ids.length:index+(after?1:0),0,id);this.commitOrder(ids,team);
  }
  private worker(emp:EmployeeRecord,team?:string):HTMLElement {
    const item=document.createElement("div"),ident=this.identityMap.get(emp.id);item.className=`sites-member-card ${team?"":"sites-org-worker-card"} ${this.selectedEmployeeId===emp.id?"selected":""}`;item.dataset.empid=emp.id;item.draggable=true;item.tabIndex=0;item.setAttribute("role","button");item.setAttribute("aria-label",`${emp.name} (${emp.employeeCode}) 선택`);
    item.innerHTML=`<span class="material-symbols-outlined sites-drag-handle" aria-hidden="true">drag_indicator</span><span class="sites-person-info"><strong>${this.escape(ident?.name||emp.name)}</strong><small>${this.escape(emp.employeeCode)}${ident?.rank?` · ${this.escape(ident.rank)}`:""}</small></span>${team?'<button type="button" class="btn-unassign" aria-label="인력 풀로 되돌리기"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>':""}`;
    item.addEventListener("dragstart",e=>{this.draggedEmployeeId=emp.id;e.dataTransfer?.setData("text/plain",emp.id);if(e.dataTransfer)e.dataTransfer.effectAllowed="move";item.classList.add("is-dragging");});
    item.addEventListener("dragend",()=>{this.draggedEmployeeId=null;this.container.querySelectorAll(".is-drop-target,.drop-before,.drop-after,.is-dragging").forEach(e=>e.classList.remove("is-drop-target","drop-before","drop-after","is-dragging"));});
    const select=()=>{this.selectedEmployeeId=this.selectedEmployeeId===emp.id?null:emp.id;this.render();};
    item.addEventListener("click",e=>{e.stopPropagation();if(!(e.target as HTMLElement).closest("button"))select();});
    item.addEventListener("keydown",e=>{if(e.target!==item)return;if(e.altKey&&team&&(e.key==="ArrowUp"||e.key==="ArrowDown")){e.preventDefault();e.stopPropagation();this.stageOrder(this.memberIds(team),emp.id,e.key==="ArrowUp"?-1:1,team);}else if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();select();}});
    item.querySelector(".btn-unassign")?.addEventListener("click",e=>{e.stopPropagation();this.unassignEmployee(emp.id);});
    if(team){item.addEventListener("dragover",e=>{if(!this.draggedEmployeeId||this.draggedEmployeeId===emp.id)return;e.preventDefault();e.stopPropagation();const after=e.clientY>item.getBoundingClientRect().top+item.offsetHeight/2;item.classList.toggle("drop-after",after);item.classList.toggle("drop-before",!after);});item.addEventListener("dragleave",()=>item.classList.remove("drop-before","drop-after"));item.addEventListener("drop",e=>{e.preventDefault();e.stopPropagation();this.dropMember(team,emp.id,e.clientY>item.getBoundingClientRect().top+item.offsetHeight/2);});}
    return item;
  }
  public render():void {
    if(this.disposed)return;
    this.resizeObserver?.disconnect();
    const focused=document.activeElement as HTMLInputElement|null,restore=focused?.placeholder==="사번/이름 검색",position=focused?.selectionStart;
    this.container.replaceChildren();const wrapper=document.createElement("div");wrapper.className="sites-org-layout sites-org-dense";
    const pool=document.createElement("section");pool.className="sites-wizard-card sites-org-pool";pool.tabIndex=0;pool.setAttribute("aria-label","인력 풀. 선택한 인력을 Enter로 되돌리기");
    pool.innerHTML=`<div class="sites-org-pool-heading"><b>인력 풀 <small>배정 대기</small></b><button type="button" class="btn-secondary" id="btn-goto-workforce">인력 관리</button></div><label class="sites-org-date">배정 시작일<input type="date" id="inp-org-assign-date" class="sites-form-input" value="${this.assignmentStartDate}" /></label><select class="sites-form-select" aria-label="배정 가능 인력 범위"><option value="all">전체 재직 인력</option><option value="unassigned">미배정 인력</option><option value="other">다른 근무지 인력</option></select><input class="sites-form-input" placeholder="사번/이름 검색" /><p class="sites-org-drag-help">조로 드래그하여 배정 · 이곳으로 되돌려 해제</p>`;
    pool.querySelector("#btn-goto-workforce")!.addEventListener("click",()=>this.onNavigateWorkforce());
    pool.querySelector<HTMLInputElement>("#inp-org-assign-date")!.addEventListener("change",e=>{this.assignmentStartDate=(e.target as HTMLInputElement).value;this.stagedMoves=this.stagedMoves.map(m=>m.orderOnly?m:{...m,startDate:this.assignmentStartDate});this.onUpdateMoves([...this.stagedMoves]);});
    const scope=pool.querySelector("select")!;scope.value=this.poolScope;scope.addEventListener("change",()=>{this.poolScope=scope.value;this.poolPage=1;this.render();});
    const search=pool.querySelector<HTMLInputElement>('input[placeholder]')!;search.value=this.poolKeyword;search.addEventListener("input",()=>{this.poolKeyword=search.value;this.poolPage=1;this.render();});
    if(this.warningMessage){const warning=document.createElement("div");warning.className="sites-editor-alert";warning.setAttribute("role","alert");warning.textContent=this.warningMessage;pool.append(warning);this.warningMessage="";}
    const placement=this.placements(),keyword=this.poolKeyword.trim().toLowerCase(),available=this.allEmployees.filter(e=>e.status==="active"&&!placement.has(e.id)&&(this.poolScope!=="unassigned"||!e.currentSiteId)&&(this.poolScope!=="other"||(e.currentSiteId&&e.currentSiteId!==this.draft.siteId))&&(!keyword||`${e.name} ${e.employeeCode} ${e.rank||""}`.toLowerCase().includes(keyword)));
    const total=Math.max(1,Math.ceil(available.length/this.poolPageSize));this.poolPage=Math.min(total,this.poolPage);const start=(this.poolPage-1)*this.poolPageSize;
    const list=document.createElement("div");list.className="sites-org-pool-list";for(const emp of available.slice(start,start+this.poolPageSize))list.append(this.worker(emp));if(!list.children.length)list.textContent="배정 가능한 인력이 없습니다.";pool.append(list);
    const nav=document.createElement("div");nav.className="sites-org-pool-pages";nav.innerHTML=`<span>총 ${available.length}명 · ${this.poolPage}/${total}</span><button type="button" class="sites-page-btn" aria-label="인력 풀 이전 페이지" ${this.poolPage<=1?"disabled":""}>‹</button><button type="button" class="sites-page-btn" aria-label="인력 풀 다음 페이지" ${this.poolPage>=total?"disabled":""}>›</button>`;nav.querySelectorAll("button").forEach((b,i)=>b.addEventListener("click",()=>{this.poolPage+=i?1:-1;this.render();}));pool.append(nav);
    pool.addEventListener("dragover",e=>{if(this.draggedEmployeeId){e.preventDefault();pool.classList.add("is-drop-target");}});pool.addEventListener("dragleave",e=>{if(!pool.contains(e.relatedTarget as Node))pool.classList.remove("is-drop-target");});pool.addEventListener("drop",e=>{e.preventDefault();const id=this.draggedEmployeeId;this.draggedEmployeeId=null;pool.classList.remove("is-drop-target");if(id&&placement.has(id))this.unassignEmployee(id);});pool.addEventListener("keydown",e=>{if(e.target===pool&&(e.key==="Enter"||e.key===" ")&&this.selectedEmployeeId){e.preventDefault();this.unassignEmployee(this.selectedEmployeeId);}});
    const board=document.createElement("section");board.className="sites-org-board";const toolbar=document.createElement("div");toolbar.className="sites-org-board-toolbar";toolbar.innerHTML='<span>인력 배치 <small>드래그로 조 이동·순서 변경 · 키보드: 선택 후 조에서 Enter, 순서는 Alt+↑/↓</small></span><button type="button" class="btn-secondary btn-team-settings">조 설정</button>';toolbar.querySelector("button")!.addEventListener("click",()=>this.openSettings());board.append(toolbar);
    const grid=document.createElement("div");grid.className="sites-team-board-grid";
    for(const [index,team] of this.draft.teamSettings.slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).entries()){
      const ids=this.memberIds(team.teamLabel),cap=this.draft.teamCapacities.find(c=>c.teamLabel===team.teamLabel)?.maxHeadcount,card=document.createElement("section");card.className=`sites-team-card sites-org-team-column team-color-${index%4}${team.isActive===false?" is-disabled":""}`;card.dataset.team=team.teamLabel;card.tabIndex=0;card.setAttribute("aria-label",team.displayName||team.teamLabel);
      card.innerHTML=`<header class="sites-team-header"><div><b>${this.escape(team.displayName||team.teamLabel)}</b><small>${this.escape(team.teamLabel)} · ${team.isActive===false?"사용 안 함":team.workType==="FIXED_DAY"?"주간 고정":team.workType==="POOL"?"지원":"교대"}</small></div><button type="button" class="btn-team-settings" aria-label="${this.escape(team.teamLabel)} 조 설정"><span class="material-symbols-outlined" aria-hidden="true">tune</span></button></header><div class="sites-team-capacity"><span>${ids.length}명 / ${cap?`${cap}명`:"무제한"}</span><meter min="0" max="${cap||Math.max(ids.length,1)}" value="${ids.length}"></meter></div>`;
      card.querySelector(".btn-team-settings")!.addEventListener("click",e=>{e.stopPropagation();this.openSettings(team.teamLabel);});
      const members=document.createElement("div");members.className="sites-team-member-list";for(const id of ids){const emp=this.allEmployees.find(e=>e.id===id);if(emp)members.append(this.worker(emp,team.teamLabel));}const zone=document.createElement("div");zone.className="sites-team-drop-slot";zone.textContent=team.isActive===false?"사용하지 않는 조":"드래그하여 추가";members.append(zone);card.append(members);
      const assign=()=>{if(this.selectedEmployeeId)this.assignEmployeeToTeam(this.selectedEmployeeId,team.teamLabel);};
      card.addEventListener("click",e=>{if(e.target===card||e.target===zone)assign();});card.addEventListener("keydown",e=>{if(e.target===card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();assign();}});
      card.addEventListener("dragover",e=>{if(this.draggedEmployeeId&&team.isActive!==false){e.preventDefault();card.classList.add("is-drop-target");}});card.addEventListener("dragleave",e=>{if(!card.contains(e.relatedTarget as Node))card.classList.remove("is-drop-target");});card.addEventListener("drop",e=>{e.preventDefault();if(team.isActive!==false)this.dropMember(team.teamLabel);});grid.append(card);
    }
    board.append(grid);wrapper.append(pool,board);this.container.append(wrapper);if(restore){search.focus({preventScroll:true});if(position!=null)search.setSelectionRange(position,position);}
    this.resizeObserver=new ResizeObserver(()=>{if(this.disposed)return;const first=list.querySelector<HTMLElement>(".sites-member-card");if(!first||!list.clientHeight)return;const count=Math.max(1,Math.min(24,Math.floor((list.clientHeight+6)/(first.getBoundingClientRect().height+6))));if(count!==this.poolPageSize){this.poolPageSize=count;this.poolPage=1;this.render();}});this.resizeObserver.observe(list);
  }
  private openSettings(focusTeam?:string):void {
    const teams=structuredClone(this.draft.teamSettings).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)),caps=structuredClone(this.draft.teamCapacities),content=document.createElement("div");content.className="sites-team-settings-editor";let dragged:string|null=null;
    const render=()=>{content.innerHTML='<p class="sites-form-help">행의 손잡이를 드래그하여 조 순서를 바꾸세요. 이름·유형·정원·사용 여부는 최종 저장 전에 초안에 반영됩니다.</p><div class="sites-editor-alert" role="alert" hidden></div><div class="sites-team-settings-head"><span>순서</span><span>사용</span><span>조 이름</span><span>근무 유형</span><span>정원 (명)</span></div>';
      for(const team of teams){const row=document.createElement("div");row.className="sites-team-settings-row";row.dataset.team=team.teamLabel;row.draggable=true;row.innerHTML=`<button type="button" class="sites-team-order-handle" aria-label="${this.escape(team.teamLabel)} 순서: Alt+위아래 화살표"><span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span></button><label><input type="checkbox" ${team.isActive!==false?"checked":""} aria-label="${this.escape(team.teamLabel)} 사용" /></label><label><span>${this.escape(team.teamLabel)}</span><input class="sites-form-input" aria-label="${this.escape(team.teamLabel)} 표시 이름" value="${this.escape(team.displayName||team.teamLabel)}" maxlength="100" required /></label><select class="sites-form-select" aria-label="${this.escape(team.teamLabel)} 근무 유형"><option value="ROTATING">교대 근무</option><option value="FIXED_DAY">주간 고정</option><option value="POOL">Pool 지원</option></select><input type="number" min="1" step="1" class="sites-form-input" placeholder="무제한" aria-label="${this.escape(team.teamLabel)} 정원" value="${caps.find(c=>c.teamLabel===team.teamLabel)?.maxHeadcount||""}" />`;
        row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.addEventListener("change",e=>team.isActive=(e.target as HTMLInputElement).checked);row.querySelector<HTMLInputElement>('input[maxlength]')!.addEventListener("input",e=>team.displayName=(e.target as HTMLInputElement).value);const select=row.querySelector("select")!;select.value=team.workType||"ROTATING";select.addEventListener("change",()=>team.workType=select.value as typeof team.workType);row.querySelector<HTMLInputElement>('input[type="number"]')!.addEventListener("input",e=>{let cap=caps.find(c=>c.teamLabel===team.teamLabel);if(!cap){cap={teamLabel:team.teamLabel};caps.push(cap);}cap.maxHeadcount=(e.target as HTMLInputElement).value?Number((e.target as HTMLInputElement).value):undefined;});
        row.addEventListener("dragstart",e=>{if((e.target as HTMLElement).matches("input,select")){e.preventDefault();return;}dragged=team.teamLabel;e.dataTransfer?.setData("text/plain",dragged);row.classList.add("is-dragging");});row.addEventListener("dragover",e=>{if(dragged){e.preventDefault();row.classList.add("drop-before");}});row.addEventListener("dragleave",()=>row.classList.remove("drop-before"));row.addEventListener("drop",e=>{e.preventDefault();const from=teams.findIndex(t=>t.teamLabel===dragged),to=teams.indexOf(team);if(from>=0&&from!==to){teams.splice(to,0,teams.splice(from,1)[0]);render();}dragged=null;});row.addEventListener("dragend",()=>{dragged=null;content.querySelectorAll(".is-dragging,.drop-before").forEach(e=>e.classList.remove("is-dragging","drop-before"));});
        row.querySelector("button")!.addEventListener("keydown",e=>{const event=e as KeyboardEvent;if(!event.altKey||!["ArrowUp","ArrowDown"].includes(event.key))return;event.preventDefault();const from=teams.indexOf(team),to=from+(event.key==="ArrowUp"?-1:1);if(to<0||to>=teams.length)return;teams.splice(to,0,teams.splice(from,1)[0]);render();content.querySelector<HTMLElement>(`[data-team="${CSS.escape(team.teamLabel)}"] button`)?.focus();});content.append(row);
      }
    };render();this.settingsDialog.open({id:"sites-team-settings-modal",title:"조 설정 · 드래그로 순서 변경",width:"820px",content,initialFocusSelector:focusTeam?`[data-team="${CSS.escape(focusTeam)}"] input[maxlength]`:"input[maxlength]",buttons:[{id:"btn-team-settings-cancel",label:"취소",onClick:()=>this.settingsDialog.close()},{id:"btn-team-settings-apply",label:"초안에 적용",variant:"primary",onClick:()=>{for(const input of Array.from(content.querySelectorAll<HTMLInputElement>("input")))if(!input.reportValidity())return;const invalid=teams.find(t=>{const n=this.memberIds(t.teamLabel).length,cap=caps.find(c=>c.teamLabel===t.teamLabel)?.maxHeadcount;return n>0&&(t.isActive===false||(cap!==undefined&&cap<n));});if(invalid){const alert=content.querySelector<HTMLElement>(".sites-editor-alert")!;alert.hidden=false;alert.textContent=`${invalid.displayName||invalid.teamLabel}: 배정 인원보다 정원을 줄이거나 사용을 해제할 수 없습니다. 인력을 먼저 이동해 주세요.`;return;}if(!teams.some(t=>t.isActive!==false)){const alert=content.querySelector<HTMLElement>(".sites-editor-alert")!;alert.hidden=false;alert.textContent="최소 한 개 조를 사용해 주세요.";return;}this.draft.teamSettings=teams.map((t,sortOrder)=>({...t,sortOrder}));this.draft.teamCapacities=caps;this.onUpdateMoves([...this.stagedMoves]);this.settingsDialog.close();this.render();}}]});
  }

  private assignEmployeeToTeam(employeeId: string, toTeam: string): boolean {
    if(this.disposed)return false;
    const emp=this.allEmployees.find(e=>e.id===employeeId);if(!emp||emp.status!=="active"||!this.draft.teamSettings.some(t=>t.teamLabel===toTeam&&t.isActive!==false))return false;
    if(!isValidDateString(this.assignmentStartDate)){this.warningMessage="올바른 배정 시작일을 선택해 주세요.";this.render();return false;}
    const move:StagedAssignmentMove={employeeId,fromTeam:emp.currentSiteId===this.draft.siteId?emp.currentShiftGroup:undefined,toTeam,startDate:this.assignmentStartDate};
    const next=[...this.stagedMoves.filter(m=>m.employeeId!==employeeId),move];
    try{planAssignmentMoves(this.allEmployees,this.draft.siteId,Object.fromEntries(this.draft.teamCapacities.map(c=>[c.teamLabel,c.maxHeadcount])),next);}catch(error){this.warningMessage=error instanceof Error?error.message:String(error);this.render();return false;}
    this.stagedMoves=next;this.selectedEmployeeId=null;this.onUpdateMoves([...next]);this.render();return true;
  }
  private stageOrder(ids:string[],employeeId:string,delta:number,team:string):void {
    const index=ids.indexOf(employeeId),goal=index+delta;if(index<0||goal<0||goal>=ids.length)return;
    [ids[index],ids[goal]]=[ids[goal],ids[index]];this.commitOrder(ids,team);
  }
  private unassignEmployee(employeeId:string):void {
    if(this.disposed)return;
    const emp=this.allEmployees.find(e=>e.id===employeeId);
    if(emp?.currentSiteId!==this.draft.siteId){this.stagedMoves=this.stagedMoves.filter(m=>m.employeeId!==employeeId);this.onUpdateMoves([...this.stagedMoves]);this.render();return;}
    if(!isValidDateString(this.assignmentStartDate)){this.warningMessage="배정 종료일을 선택해 주세요.";this.render();return;}
    showConfirm({title:"배정 해제 내용 확인",message:`${emp.name}의 현재 근무지 배정을 끝내도록 준비합니다.`,subMessage:`배정 종료일: ${this.assignmentStartDate}. 최종 저장할 때 적용되며 과거 이력은 유지됩니다. 근무지나 조 이동이면 새 조에 배정하는 방법을 사용해 주세요. 퇴사 상태는 인력 관리에서 따로 변경합니다.`,confirmLabel:"해제 준비",cancelLabel:"계속 배정",onConfirm:()=>{if(this.disposed)return;this.stagedMoves=[...this.stagedMoves.filter(m=>m.employeeId!==employeeId),{employeeId,fromTeam:emp.currentShiftGroup,toTeam:"",startDate:this.assignmentStartDate}];this.onUpdateMoves([...this.stagedMoves]);this.render();}});
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML.replace(/"/g,"&quot;");
  }
}
