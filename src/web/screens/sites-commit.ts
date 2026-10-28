// sites-commit.ts — 최종 순차 저장 실행기 및 완료 결과 화면 컴포넌트
import type { BridgeResult, ShiftPatternUpsertInput } from "../../shared/bridge/contracts";
import { isValidDateString, planAssignmentMoves } from "./sites-model";
import { validatePatternDraft } from "./sites-pattern-model";
import type { SiteRecord, ShiftPatternRecord } from "../../shared/domain/model";
import type { PatternDraft } from "./sites-pattern-model";
import { serializePatternDraft } from "./sites-pattern-model";
import type { StagedAssignmentMove } from "./sites-organization";

export interface SitesCommitOptions {
  container: HTMLElement;
  siteName: string;
  siteCustomer: string;
  siteStatus: SiteRecord["status"];
  siteCode: string;
  siteId?: string;
  draft: PatternDraft;
  stagedMoves: StagedAssignmentMove[];
  onFinish: (savedSiteId: string) => void;
  isAlive?: () => boolean;
  onBusyChange?: (busy:boolean) => void;
  onSessionExpired?: () => void;
  onRetry: () => void;
}

export class SitesCommit {
  private container: HTMLElement;
  private siteName: string;
  private siteCustomer: string;
  private siteStatus: SiteRecord["status"];
  private siteCode: string;
  private siteId?: string;
  private draft: PatternDraft;
  private stagedMoves: StagedAssignmentMove[];
  private onFinish: (savedSiteId: string) => void;
  private onRetry: () => void;

  private disposed = false;
  private generation = 0;
  private unresolved: string | null = null;
  private pendingRecovery: (() => Promise<boolean>) | null = null;
  private options: SitesCommitOptions;
  private isRunning = false;
  private isCompleted = false;
  private currentStepIndex = 0;
  private stepLogs: string[] = [];
  private errorMessage = "";
  private savedSiteResult: SiteRecord | null = null;
  private savedPatternResult: ShiftPatternRecord | null = null;
  private completedMoves: Set<string> = new Set(); // 성공한 배정 employeeId 목록
  private failedMovesList: Array<{ employeeId: string; reason: string }> = [];

  constructor(options: SitesCommitOptions) {
    this.options = options;
    this.container = options.container;
    this.siteName = options.siteName;
    this.siteCustomer = options.siteCustomer;
    this.siteStatus = options.siteStatus;
    this.siteCode = options.siteCode;
    this.siteId = options.siteId;
    this.draft = options.draft;
    this.stagedMoves = options.stagedMoves;
    this.onFinish = options.onFinish;
    this.onRetry = options.onRetry;
  }

  public render(): void {
    if (!this.alive()) return;
    this.container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "sites-wizard-card";
    card.style.textAlign = "center";
    card.style.padding = "32px 20px";

    if (this.isRunning) {
      card.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
          <span class="material-symbols-outlined" style="font-size:48px; color:var(--accent, #3E56B6); animation:spin 1.5s linear infinite;">sync</span>
          <div style="font-size:16px; font-weight:bold;">근무지 및 교대 패턴 저장 중...</div>
          <div style="font-size:13px; color:var(--text-sub, #4B5563);" id="commit-progress-text">
            단계 ${this.currentStepIndex + 1} / 3 진행 중...
          </div>
          <div style="width:360px; max-width:100%; background:#F8FAFC; border:1px solid var(--line, #E2E5EA); border-radius:6px; padding:12px; font-size:11px; text-align:left; max-height:120px; overflow-y:auto;">
            ${this.stepLogs.map((l) => `<div>${this.escape(l)}</div>`).join("")}
          </div>
        </div>
      `;
    } else if (this.errorMessage) {
      card.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
          <span class="material-symbols-outlined" style="font-size:48px; color:#C0392B;">error</span>
          <div style="font-size:16px; font-weight:bold; color:#C0392B;">저장 중 오류가 발생했습니다.</div>
          <div style="font-size:13px; color:var(--text, #1F2430);">${this.escape(this.errorMessage)}</div>
          ${
            this.failedMovesList.length > 0
              ? `<div style="font-size:12px; color:#C0392B; text-align:left; background:#FEE2E2; padding:8px 12px; border-radius:4px; width:360px;">
                  <strong>실패한 배정 대상:</strong>
                  <ul style="margin:4px 0 0 16px; padding:0;">
                    ${this.failedMovesList.map((f) => `<li>직원 ID: ${this.escape(f.employeeId)} (${this.escape(f.reason)})</li>`).join("")}
                  </ul>
                </div>`
              : ""
          }
          <div style="font-size:12px; color:var(--text-sub, #4B5563); max-width:400px; line-height:1.5;">
            완료된 단계(근무지 및 성공한 배정)는 보존되었습니다. 정원 및 네트워크 상태를 확인한 후 다시 시도해 주세요.
          </div>
          <div style="display:flex; gap:10px; margin-top:8px;">
            <button type="button" class="btn-secondary" id="btn-commit-back">저장된 내용 확인</button>
            <button type="button" class="btn-primary" id="btn-commit-retry">다시 시도</button>
          </div>
        </div>
      `;
      card.querySelector("#btn-commit-back")?.addEventListener("click", () => this.onRetry());
      card.querySelector("#btn-commit-retry")?.addEventListener("click", () => this.startCommit());
    } else if (this.isCompleted) {
      card.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
          <span class="material-symbols-outlined" style="font-size:52px; color:#1E7A46;">check_circle</span>
          <div style="font-size:18px; font-weight:bold; color:#1E7A46;">근무지 및 교대 패턴 저장 완료!</div>
          <div style="font-size:13px; color:var(--text-sub, #4B5563); max-width:420px; line-height:1.5;">
            '${this.escape(this.savedSiteResult?.name || this.siteName)}' 근무지와 교대 패턴 설정, 조별 인력 배정이 성공적으로 등록되었습니다.
          </div>
          <div style="border:1px solid var(--line, #E2E5EA); border-radius:6px; padding:12px 20px; background:#F8FAFC; font-size:12px; text-align:left; width:340px; margin:8px 0;">
            <div>• 근무지 코드: <strong>${this.escape(this.savedSiteResult?.siteCode || this.siteCode)}</strong></div>
            <div>• 적용 시작일: <strong>${this.escape(this.draft.effectiveFrom || "미지정")}</strong></div>
            <div>• 조 구성: <strong>${this.draft.teamCount}개 조</strong></div>
            <div>• 배정 변동: <strong>${this.stagedMoves.length}건</strong> 반영 완료</div>
          </div>
          <button type="button" class="btn-primary" id="btn-commit-done" data-id="btn-commit-finish" style="padding:8px 24px;">
            근무지 목록으로 이동
          </button>
        </div>
      `;
      card.querySelector("#btn-commit-done, #btn-commit-finish")?.addEventListener("click", () => {
        this.onFinish(this.savedSiteResult?.id || this.siteId || "");
      });
    }

    this.container.appendChild(card);
  }

  public destroy(): void { this.disposed=true; this.generation++; }
  private alive(): boolean { return !this.disposed && (this.options.isAlive?.() ?? true); }
  private requireAlive(run: number): void { if(!this.alive() || run!==this.generation) throw Error("이전 화면의 저장 후속 작업을 중단했습니다. 저장 결과는 다시 조회해 주세요."); }
  private unwrap<T>(r: BridgeResult<T>): T { if(!r.ok){if(/SESSION|AUTH_SESSION/.test(r.errorCode) && this.alive())this.options.onSessionExpired?.();throw Object.assign(Error(r.message || "요청을 처리하지 못했습니다."),{code:r.errorCode});}return r.data; }
  public async startCommit(): Promise<void> {
    if(this.isRunning || this.isCompleted || !this.alive())return;
    const b=window.appBridge;if(!b){this.errorMessage="연결을 확인한 뒤 다시 시도해 주세요.";this.render();return;}
    const run=++this.generation;this.isRunning=true;this.errorMessage="";this.options.onBusyChange?.(true);this.render();
    try {
      if(this.pendingRecovery){const recovered=await this.pendingRecovery();this.requireAlive(run);if(!recovered)throw Error(this.unresolved || "저장 여부가 불명확합니다. 실제 저장 내역을 확인해 주세요.");this.pendingRecovery=null;this.unresolved=null;}
      const [sitesR,patternsR,peopleR]=await Promise.all([b.listSites(),b.listShiftPatterns(),b.listEmployees()]);this.requireAlive(run);
      const sites=this.unwrap(sitesR),patterns=this.unwrap(patternsR),people=this.unwrap(peopleR);
      const validation=validatePatternDraft(this.draft,this.siteName,patterns);
      if(!validation.isValid)throw Error(validation.issues.map(i=>i.message).join(" "));
      if(this.stagedMoves.some(m=>!m.orderOnly&&!isValidDateString(m.startDate||this.draft.effectiveFrom||"")))throw Error("배정 적용일을 확인해 주세요.");
      if(!this.savedPatternResult&&this.draft.patternId&&this.draft.baselineRevision&&patterns.some(p=>p.id===this.draft.patternId&&p.updatedAt!==this.draft.baselineRevision))throw Error("편집 중 원본 설정이 변경되었습니다. 최신 설정을 다시 열어 주세요.");
      const target=this.savedSiteResult?.id || this.siteId || this.draft.siteId;
      const capacities=Object.fromEntries(this.draft.teamCapacities.map(c=>[c.teamLabel,c.maxHeadcount]));
      const moves=planAssignmentMoves(people,target,capacities,this.stagedMoves);
      if(moves.some(m=>m.toTeam && !this.draft.teamSettings.some(t=>t.teamLabel===m.toTeam && t.isActive!==false)))throw Error("사용하지 않는 조에는 신규 배정할 수 없습니다.");
      if(moves.length && (!b.saveEmployeeAssignment || !b.closeEmployeeAssignment || !b.listEmployeeAssignments))throw Error("배정 저장 창구가 준비되지 않았습니다. 연결을 확인해 주세요.");
      if(!this.savedSiteResult){
        this.currentStepIndex=0;this.stepLogs.push("근무지 기본 정보를 저장합니다.");this.render();
        const input={id:this.siteId,siteCode:this.siteCode || "",name:this.siteName,customerName:this.siteCustomer || undefined,status:this.siteStatus,timezone:sites.find(s=>s.id===this.siteId)?.timezone || "Asia/Seoul"};
        const before=new Set(sites.map(s=>s.id));
        const recover=async()=>{const rs=this.unwrap(await b.listSites());const candidates=rs.filter(s=>(input.id?s.id===input.id:!before.has(s.id)) && s.name===input.name && (s.customerName||"")===(input.customerName||"") && s.status===input.status && s.timezone===input.timezone);if(candidates.length===1){this.savedSiteResult=candidates[0];this.siteId=candidates[0].id;this.draft.siteId=candidates[0].id;return true;}return false;};
        try {const r=await b.saveSite(input);this.requireAlive(run);this.savedSiteResult=this.unwrap(r);this.siteId=this.savedSiteResult.id;}
        catch(error){this.requireAlive(run);if(!await this.reconcile(error,recover,"근무지 저장 응답을 확인하지 못했습니다. 재조회로 저장 여부를 확인할 때까지 다시 저장하지 않습니다."))throw error;}
      }
      this.requireAlive(run);const siteId=this.savedSiteResult!.id;this.draft.siteId=siteId;
      if(!this.savedPatternResult){
        this.currentStepIndex=1;this.stepLogs.push("교대 패턴을 저장합니다.");this.render();
        const input=serializePatternDraft(this.draft),before=new Set(patterns.map(p=>p.id));
        const recover=async()=>{const ps=this.unwrap(await b.listShiftPatterns(siteId));const candidates=ps.filter(p=>p.siteId===siteId && (input.id&&p.id===input.id || !before.has(p.id)) && patternState(p)===patternState(input));if(candidates.length===1){this.savedPatternResult=candidates[0];this.draft.patternId=candidates[0].id;return true;}return false;};
        try{const r=await b.saveShiftPattern(input);this.requireAlive(run);this.savedPatternResult=this.unwrap(r);this.draft.patternId=this.savedPatternResult.id;}
        catch(error){this.requireAlive(run);if(!await this.reconcile(error,recover,"패턴 저장 응답이 불명확합니다. 저장 내역을 재조회한 뒤 이어서 진행해 주세요."))throw error;}
      }
      this.currentStepIndex=2;this.failedMovesList=[];
      for(const move of moves.filter(m=>!m.orderOnly && !this.completedMoves.has(m.employeeId))){
        this.requireAlive(run);const history=this.unwrap(await b.listEmployeeAssignments(move.employeeId));this.requireAlive(run);
        const date=move.startDate || this.draft.effectiveFrom!;
        const current=history.filter(a=>a.status==="active");
        const wanted=current.find(a=>a.siteId===siteId && a.shiftGroup===move.toTeam && a.startDate===date);
        if(move.toTeam && wanted){this.completedMoves.add(move.employeeId);continue;}
        const closing=current.find(a=>a.siteId===siteId && (!move.fromTeam || a.shiftGroup===move.fromTeam));
        if(!move.toTeam && !closing){if(!current.length){this.completedMoves.add(move.employeeId);continue;}throw Error("배정 상태가 달라졌습니다. 현재 배정을 다시 조회해 주세요.");}
        const beforeIds=new Set(history.map(a=>a.id));
        const recover=async()=>{const hs=this.unwrap(await b.listEmployeeAssignments(move.employeeId));const done=move.toTeam?hs.some(a=>!beforeIds.has(a.id)&&a.status==="active"&&a.siteId===siteId&&a.shiftGroup===move.toTeam&&a.startDate===date):hs.some(a=>a.id===closing!.id&&a.status==="ended"&&a.endDate===date);if(done)this.completedMoves.add(move.employeeId);return done;};
        try {const r=move.toTeam?await b.saveEmployeeAssignment({employeeId:move.employeeId,siteId,shiftGroup:move.toTeam,startDate:date,sortOrder:move.sortOrder}):await b.closeEmployeeAssignment({assignmentId:closing!.id,endDate:date});this.requireAlive(run);this.unwrap(r);this.completedMoves.add(move.employeeId);}
        catch(error){this.requireAlive(run);if(!await this.reconcile(error,recover,"배정 저장 응답이 불명확합니다. 실제 이력을 먼저 확인해 주세요.")){this.failedMovesList.push({employeeId:move.employeeId,reason:error instanceof Error?error.message:String(error)});throw error;}}
      }
      for(const move of moves.filter(m=>m.orderOnly && !this.completedMoves.has(m.employeeId))){
        const readOrder=async()=>{const employeesResponse=await b.listEmployees({siteId});this.requireAlive(run);const es=this.unwrap(employeesResponse);const lists=await Promise.all(es.filter(e=>e.currentShiftGroup===move.toTeam).map(e=>b.listEmployeeAssignments(e.id)));this.requireAlive(run);return lists.flatMap(r=>this.unwrap(r)).filter(a=>a.status==="active"&&a.siteId===siteId&&a.shiftGroup===move.toTeam).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)||a.id.localeCompare(b.id));};
        let order=await readOrder();this.requireAlive(run);let index=order.findIndex(a=>a.employeeId===move.employeeId);if(index<0)throw Error("순서를 바꿀 현재 배정을 찾지 못했습니다.");const goal=Math.max(0,Math.min(move.sortOrder ?? index,order.length-1));
        while(index!==goal){this.requireAlive(run);const before=order.map(a=>a.id),next=before.slice(),direction=index>goal?"up":"down",to=index+(direction==="up"?-1:1);[next[index],next[to]]=[next[to],next[index]];const recovery=async()=>{const live=await readOrder();if(JSON.stringify(live.map(a=>a.id))===JSON.stringify(next)){order=live;return true;}return false;};
          try{const r=await b.reorderEmployeeAssignment({assignmentId:order[index].id,direction});this.requireAlive(run);order=this.unwrap(r).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));if(JSON.stringify(order.map(a=>a.id))!==JSON.stringify(next))throw Error("조 명단이 변경되었습니다. 현재 순서를 다시 확인해 주세요.");}
          catch(error){this.requireAlive(run);if(!await recovery()){this.pendingRecovery=recovery;this.unresolved="순서 변경 결과를 확인하지 못했습니다. 현재 조 전체 명단을 재조회하기 전까지 이동을 반복하지 않습니다.";throw error;}}
          index=order.findIndex(a=>a.employeeId===move.employeeId);
        }
        this.completedMoves.add(move.employeeId);
      }
      this.requireAlive(run);
      const [ps,es]=await Promise.all([b.listShiftPatterns(siteId),b.listEmployees()]);this.requireAlive(run);this.unwrap(ps);this.unwrap(es);
      this.stepLogs.push("설정과 배정 결과를 다시 조회했습니다.");this.isCompleted=true;
    }catch(error){if(this.alive()){this.errorMessage=(error instanceof Error?error.message:String(error))+` (근무지 ${this.savedSiteResult?"저장됨":"미확인"} · 패턴 ${this.savedPatternResult?"저장됨":"미확인"} · 배정 ${this.completedMoves.size}/${this.stagedMoves.length}건 완료) 이미 저장된 부분은 취소되지 않습니다.`;}}
    finally{this.isRunning=false;if(this.alive()){this.options.onBusyChange?.(false);this.render();}}
  }

  private async reconcile(error:unknown,recover:()=>Promise<boolean>,message:string):Promise<boolean>{
    const unknown=error instanceof Error&&isUnknownOutcome(error);
    if(unknown){this.pendingRecovery=recover;this.unresolved=message;}
    try{const resolved=await recover();if(resolved){this.pendingRecovery=null;this.unresolved=null;}return resolved;}
    catch(readError){if(unknown)throw Error(message+" 재조회도 실패했습니다. 연결을 확인한 뒤 다시 조회해 주세요.");throw readError;}
  }
  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}


/** Compare business payloads, excluding generated identifiers and audit fields. */
function patternState(p: ShiftPatternRecord | ShiftPatternUpsertInput): string {
 const step=(s: {stepIndex:number;dutyCode:string;startTime?:string;endTime?:string;breakMinutes:number;holidayStartTime?:string;holidayEndTime?:string;holidayBreakMinutes?:number})=>[s.stepIndex,s.dutyCode,s.startTime||null,s.endTime||null,s.breakMinutes,s.holidayStartTime||null,s.holidayEndTime||null,s.holidayBreakMinutes??null];
 return JSON.stringify({site:p.siteId,name:p.name,team:p.teamCount,date:p.effectiveFrom,status:p.status,cycles:(p.cycles||[]).map(c=>({key:c.cycleKey,name:c.name,count:c.shiftCount,date:c.patternStartDate,mode:c.holidayTimeMode||"unified",public:c.holidayTimeMode==="split"&&c.weekdayPublicHolidayAsHoliday===true,steps:c.steps.map(step),indexes:c.teamIndexes.map(i=>[i.teamLabel,i.index]).sort()})),assign:(p.teamCycleAssignments||[]).map(a=>[a.teamLabel,a.cycleKey]).sort(),capacity:(p.teamCapacities||[]).map(c=>[c.teamLabel,c.maxHeadcount&&c.maxHeadcount>0?c.maxHeadcount:null]).sort(),teams:(p.teamSettings||[]).map(t=>[t.teamLabel,t.displayName||null,t.workType||"ROTATING",t.isActive!==false,t.sortOrder??0]),types:(p.dutyTypes||[]).map(d=>[d.id,d.kind,d.label,d.sortOrder,d.startTime||null,d.endTime||null,d.breakMinutes??0,d.isBreakDirty??false,d.holidayStartTime||null,d.holidayEndTime||null,d.holidayBreakMinutes??null,d.isHolidayBreakDirty??false]).sort(),pool:[!!p.poolEnabled,p.poolStartTime||null,p.poolEndTime||null,p.poolBreakMinutes??0]});
}

function isUnknownOutcome(error: Error): boolean { const code=(error as Error & {code?:string}).code;return !code || /NETWORK|BRIDGE|FETCH|TIMEOUT|HTTP|REQUEST|RESPONSE/.test(code); }
