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
  private readonly poolPageSize = 10;
  private draggedEmployeeId: string | null = null;
  private selectedEmployeeId: string | null = null;
  private assignmentStartDate = "2026-01-01";
  private warningMessage = "";
  private disposed=false;
  public destroy():void {this.disposed=true;}

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

  public render(): void {
    if(this.disposed)return;
    const focused=document.activeElement as HTMLInputElement|null,restore=!!focused&&this.container.contains(focused),placeholder=focused?.placeholder,position=focused?.selectionStart;
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "sites-org-layout";

    // 1. 현재 조별 배정 상태 계산
    // 초기 근무지 배정 상태 + stagedMoves 반영
    const teamEmployees = new Map<string, Array<{ emp: EmployeeRecord; identity?: SiteEmployeeIdentity }>>();
    this.draft.teamSettings
      .slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0))
      .forEach((t) => {
        teamEmployees.set(t.teamLabel, []);
      });

    // 현재 이 사이트에 배정되어 있는 활성 직원들
    const initialSiteEmps = this.allEmployees.filter(
      (e) => e.currentSiteId === this.draft.siteId
    );

    // 각 직원의 최종 배치 조 결정
    const finalPlacement = new Map<string, string>(); // empId -> teamLabel
    for (const emp of initialSiteEmps) {
      if (emp.currentShiftGroup) {
        finalPlacement.set(emp.id, emp.currentShiftGroup);
      }
    }

    // stagedMoves 반영
    for (const move of this.stagedMoves) {
      if (move.toTeam) {
        finalPlacement.set(move.employeeId, move.toTeam);
      } else {
        finalPlacement.delete(move.employeeId);
      }
    }

    // 조별 명단 채우기
    finalPlacement.forEach((teamLabel, empId) => {
      const emp = this.allEmployees.find((e) => e.id === empId);
      if (emp && teamEmployees.has(teamLabel)) {
        teamEmployees.get(teamLabel)!.push({
          emp,
          identity: this.identityMap.get(emp.id)
        });
      }
    });

    for(const members of teamEmployees.values())members.sort((a,b)=>(this.stagedMoves.find(m=>m.employeeId===a.emp.id)?.sortOrder ?? a.emp.currentAssignmentOrder ?? 0)-(this.stagedMoves.find(m=>m.employeeId===b.emp.id)?.sortOrder ?? b.emp.currentAssignmentOrder ?? 0)||a.emp.employeeCode.localeCompare(b.emp.employeeCode,"ko",{numeric:true}));
    // 2. 좌측: 인력 풀 (검색 및 10명 페이징)
    const poolCard = document.createElement("div");
    poolCard.className = "sites-wizard-card";
    poolCard.style.padding = "14px";
    poolCard.style.display = "flex";
    poolCard.style.flexDirection = "column";
    poolCard.style.gap = "10px";

    if (this.warningMessage) {
      const warnBanner = document.createElement("div");
      warnBanner.style.padding = "8px 12px";
      warnBanner.style.background = "#FEE2E2";
      warnBanner.style.color = "#991B1B";
      warnBanner.style.borderRadius = "4px";
      warnBanner.style.fontSize = "11px";
      warnBanner.textContent = this.warningMessage;
      poolCard.appendChild(warnBanner);
      this.warningMessage = "";
    }

    const poolHeader = document.createElement("div");
    poolHeader.style.display = "flex";
    poolHeader.style.justifyContent = "space-between";
    poolHeader.style.alignItems = "center";
    poolHeader.innerHTML = `
      <div style="font-weight:bold; font-size:13px; color:var(--text, #1F2430);">
        인력 풀 (배정 대기)
      </div>
      <button type="button" class="btn-secondary" id="btn-goto-workforce" style="font-size:11px; height:24px;">
        인력 관리 이동
      </button>
    `;
    poolHeader.querySelector("#btn-goto-workforce")?.addEventListener("click", () => {
      this.onNavigateWorkforce();
    });
    poolCard.appendChild(poolHeader);

    // 배정 시작일 설정
    const dateRow = document.createElement("div");
    dateRow.style.display = "flex";
    dateRow.style.alignItems = "center";
    dateRow.style.gap = "8px";
    dateRow.style.fontSize = "11px";
    dateRow.innerHTML = `
      <span>배정 시작일:</span>
      <input type="date" id="inp-org-assign-date" class="sites-form-input" style="font-size:11px; height:24px; padding:2px 6px;" value="${this.assignmentStartDate}" />
    `;
    dateRow.querySelector("#inp-org-assign-date")?.addEventListener("change", (e) => {
      this.assignmentStartDate = (e.target as HTMLInputElement).value;
      this.stagedMoves=this.stagedMoves.map(m=>m.orderOnly?m:{...m,startDate:this.assignmentStartDate});this.onUpdateMoves([...this.stagedMoves]);
    });
    poolCard.appendChild(dateRow);

    const scope=document.createElement("select");scope.className="sites-form-select";scope.setAttribute("aria-label","배정 가능 인력 범위");
    for(const [value,label] of [["all","전체 재직 인력"],["unassigned","미배정 인력"],["other","다른 근무지 인력"]]){const o=document.createElement("option");o.value=value;o.textContent=label;scope.append(o);}scope.value=this.poolScope;scope.addEventListener("change",()=>{this.poolScope=scope.value;this.poolPage=1;this.render();});poolCard.append(scope);
    // 검색창
    const searchInp = document.createElement("input");
    searchInp.type = "text";
    searchInp.className = "sites-form-input";
    searchInp.placeholder = "사번/이름 검색";
    searchInp.value = this.poolKeyword;
    searchInp.style.fontSize = "12px";
    searchInp.addEventListener("input", (e) => {
      this.poolKeyword = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.poolPage = 1;
      this.render();
    });
    poolCard.appendChild(searchInp);

    // 아직 어느 조에도 배정되지 않은 직원 필터링
    const unassignedEmps = this.allEmployees.filter((emp) => {
      if (emp.status !== "active") return false;
      if(this.poolScope==="unassigned"&&emp.currentSiteId)return false;
      if(this.poolScope==="other"&&(!emp.currentSiteId||emp.currentSiteId===this.draft.siteId))return false;
      if (finalPlacement.has(emp.id)) return false; // 이미 어느 조에 배정됨
      if (this.poolKeyword) {
        const matchName = emp.name.toLowerCase().includes(this.poolKeyword);
        const matchCode = emp.employeeCode.toLowerCase().includes(this.poolKeyword);
        if (!matchName && !matchCode && !(emp.rank || "").toLowerCase().includes(this.poolKeyword)) return false;
      }
      return true;
    });

    // 페이징
    const totalPoolPages = Math.max(1, Math.ceil(unassignedEmps.length / this.poolPageSize));
    const curPoolPage = Math.min(this.poolPage, totalPoolPages);
    const startIdx = (curPoolPage - 1) * this.poolPageSize;
    const pagedUnassigned = unassignedEmps.slice(startIdx, startIdx + this.poolPageSize);

    const poolList = document.createElement("div");
    poolList.style.display = "flex";
    poolList.style.flexDirection = "column";
    poolList.style.gap = "6px";
    poolList.style.minHeight = "280px";

    if (pagedUnassigned.length === 0) {
      poolList.innerHTML = `
        <div style="text-align:center; padding:32px 0; color:var(--text-sub, #4B5563); font-size:12px;">
          배정 가능한 대기 인력이 없습니다.
        </div>
      `;
    } else {
      pagedUnassigned.forEach((emp) => {
        const item = document.createElement("div");
        const isSelected = this.selectedEmployeeId === emp.id;
        item.className = `sites-member-card sites-org-worker-card ${isSelected ? "selected" : ""}`;
        item.draggable = true;
        item.dataset.empid = emp.id;
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `${emp.name} (${emp.employeeCode})`);

        if (isSelected) {
          item.style.borderColor = "var(--accent, #3E56B6)";
          item.style.background = "#EEF1FB";
        }

        const ident = this.identityMap.get(emp.id);
        item.innerHTML = `
          <div>
            <strong>${this.escape(ident?.name || emp.name)}</strong>
            <span style="font-size:11px; color:var(--text-sub, #4B5563); margin-left:4px;">${this.escape(emp.employeeCode)}</span>
          </div>
          <div style="font-size:11px; color:var(--text-sub, #4B5563);">
            ${ident?.rank ? `[${this.escape(ident.rank)}]` : ""}
          </div>
        `;

        item.addEventListener("dragstart", () => {
          this.draggedEmployeeId = emp.id;
        });

        // 클릭 및 키보드 선택 지원 (UI03-D05)
        const toggleSelect = () => {
          this.selectedEmployeeId = this.selectedEmployeeId === emp.id ? null : emp.id;
          this.render();
        };

        item.addEventListener("click", toggleSelect);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSelect();
          }
        });

        poolList.appendChild(item);
      });
    }
    poolCard.appendChild(poolList);

    // 인력 풀 페이징
    const poolPageNav = document.createElement("div");
    poolPageNav.style.display = "flex";
    poolPageNav.style.justifyContent = "space-between";
    poolPageNav.style.alignItems = "center";
    poolPageNav.style.fontSize = "11px";
    poolPageNav.style.color = "var(--text-sub, #4B5563)";
    poolPageNav.innerHTML = `<span>총 ${unassignedEmps.length}명 · ${unassignedEmps.length?startIdx+1:0}~${Math.min(startIdx+this.poolPageSize,unassignedEmps.length)}명 표시</span>`;

    const navBtns = document.createElement("div");
    navBtns.style.display = "flex";
    navBtns.style.gap = "4px";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "sites-page-btn";
    prevBtn.textContent = "‹";
    prevBtn.style.height = "22px";
    prevBtn.style.minWidth = "22px";
    prevBtn.disabled = curPoolPage <= 1;
    prevBtn.addEventListener("click", () => {
      if (this.poolPage > 1) {
        this.poolPage--;
        this.render();
      }
    });
    navBtns.appendChild(prevBtn);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "sites-page-btn";
    nextBtn.textContent = "›";
    nextBtn.style.height = "22px";
    nextBtn.style.minWidth = "22px";
    nextBtn.disabled = curPoolPage >= totalPoolPages;
    nextBtn.addEventListener("click", () => {
      if (this.poolPage < totalPoolPages) {
        this.poolPage++;
        this.render();
      }
    });
    navBtns.appendChild(nextBtn);

    poolPageNav.appendChild(navBtns);
    poolCard.appendChild(poolPageNav);
    wrapper.appendChild(poolCard);

    // 3. 우측: 조별 보드 (Grid)
    const boardContainer = document.createElement("div");
    boardContainer.style.display = "flex";
    boardContainer.style.flexDirection = "column";
    boardContainer.style.gap = "12px";

    const boardGrid = document.createElement("div");
    boardGrid.className = "sites-team-board-grid";

    // 각 조별 카드 생성
    Array.from(teamEmployees.entries()).forEach(([teamLabel, members]) => {
      const teamSetting = this.draft.teamSettings.find((t) => t.teamLabel === teamLabel);
      const teamCapacity = this.draft.teamCapacities.find((c) => c.teamLabel === teamLabel);
      const maxHead = teamCapacity?.maxHeadcount;

      const teamCard = document.createElement("div");
      teamCard.className = "sites-team-card sites-org-team-column";
      teamCard.dataset.team = teamLabel;

      const isOverCapacity = typeof maxHead === "number" && maxHead > 0 && members.length > maxHead;

      teamCard.tabIndex = 0;
      teamCard.setAttribute("role", "region");
      teamCard.setAttribute("aria-label", `${teamSetting?.displayName || teamLabel}`);

      teamCard.innerHTML = `
        <div class="sites-team-header" style="${isOverCapacity ? "background:#FCEBE9; color:#C0392B;" : ""}">
          <div>
            <span>${this.escape(teamSetting?.displayName || teamLabel)}</span>
            <span style="font-size:11px; font-weight:normal; margin-left:4px;">(${teamLabel})</span>
          </div>
          <div style="font-size:11px; display:flex; align-items:center; gap:6px;">
            <span><strong>${members.length}</strong> / ${maxHead ? `${maxHead}명` : "무제한"}</span>
            <button type="button" class="btn-secondary btn-assign-here" style="font-size:10px; height:20px; padding:0 4px; display:${this.selectedEmployeeId ? "inline-block" : "none"};">
              여기로 배정
            </button>
          </div>
        </div>
      `;

      // 선택된 인력이 있을 때 조 카드 클릭/Enter 또는 버튼 클릭으로 배정 (UI03-D05)
      const handleAssignToThisTeam = () => {
        if (this.selectedEmployeeId) {
          this.assignEmployeeToTeam(this.selectedEmployeeId, teamLabel);
          this.selectedEmployeeId = null;
        }
      };

      teamCard.querySelector(".btn-assign-here")?.addEventListener("click", (e) => {
        e.stopPropagation();
        handleAssignToThisTeam();
      });

      teamCard.addEventListener("click", () => {
        if (this.selectedEmployeeId) {
          handleAssignToThisTeam();
        }
      });

      teamCard.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && this.selectedEmployeeId) {
          e.preventDefault();
          handleAssignToThisTeam();
        }
      });

      const memberList = document.createElement("div");
      memberList.className = "sites-team-member-list";

      // 드래그 앤 드롭 영역 설정
      teamCard.addEventListener("dragover", (e) => {
        e.preventDefault();
        teamCard.style.borderColor = "var(--accent, #3E56B6)";
      });

      teamCard.addEventListener("dragleave", () => {
        teamCard.style.borderColor = "var(--line, #E2E5EA)";
      });

      teamCard.addEventListener("drop", (e) => {
        e.preventDefault();
        teamCard.style.borderColor = "var(--line, #E2E5EA)";
        if (this.draggedEmployeeId) {
          this.assignEmployeeToTeam(this.draggedEmployeeId, teamLabel);
          this.draggedEmployeeId = null;
        }
      });

      if (members.length === 0) {
        memberList.innerHTML = `
          <div style="text-align:center; padding:24px 0; color:var(--text-sub, #4B5563); font-size:11px;">
            여기로 인력을 드래그하여 배정하세요.
          </div>
        `;
      } else {
        members.forEach((item, _mIdx) => {
          const mCard = document.createElement("div");
          mCard.className = "sites-member-card";
          mCard.draggable = true;
          mCard.dataset.empid = item.emp.id;

          mCard.innerHTML = `
            <div>
              <strong>${this.escape(item.identity?.name || item.emp.name)}</strong>
              <span style="font-size:11px; color:var(--text-sub, #4B5563); margin-left:4px;">${this.escape(item.emp.employeeCode)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              <button type="button" class="btn-secondary btn-order-up" aria-label="앞으로 이동">↑</button><button type="button" class="btn-secondary btn-order-down" aria-label="뒤로 이동">↓</button>
              <button type="button" class="btn-secondary btn-unassign" data-empid="${item.emp.id}" style="font-size:10px; height:20px; padding:0 4px; color:#C0392B;">해제</button>
            </div>
          `;

          mCard.addEventListener("dragstart", () => {
            this.draggedEmployeeId = item.emp.id;
          });

          mCard.querySelector(".btn-unassign")?.addEventListener("click", () => {
            this.unassignEmployee(item.emp.id);
          });

          mCard.tabIndex=0;mCard.setAttribute("role","button");mCard.setAttribute("aria-label",`${item.emp.name} 선택`);
          const select=()=>{this.selectedEmployeeId=item.emp.id;this.render();};mCard.addEventListener("click",e=>{if(!(e.target as HTMLElement).closest("button"))select();});mCard.addEventListener("keydown",e=>{if(e.target===mCard&&(e.key==="Enter"||e.key===" ")){e.preventDefault();e.stopPropagation();select();}});
          mCard.querySelector(".btn-order-up")?.addEventListener("click",e=>{e.stopPropagation();this.stageOrder(members.map(m=>m.emp.id),item.emp.id,-1,teamLabel);});
          mCard.querySelector(".btn-order-down")?.addEventListener("click",e=>{e.stopPropagation();this.stageOrder(members.map(m=>m.emp.id),item.emp.id,1,teamLabel);});
          memberList.appendChild(mCard);
        });
      }

      teamCard.appendChild(memberList);
      boardGrid.appendChild(teamCard);
    });

    boardContainer.appendChild(boardGrid);
    const settings=document.createElement("details");const summary=document.createElement("summary");summary.textContent="조 이름·근무 유형·정원·사용 여부·순서 설정";settings.append(summary);
    for(const team of this.draft.teamSettings){const row=document.createElement("div");row.className="sites-team-settings-row";const name=document.createElement("input");name.className="sites-form-input";name.value=team.displayName||team.teamLabel;name.setAttribute("aria-label",`${team.teamLabel} 표시 이름`);name.addEventListener("input",()=>{team.displayName=name.value;this.onUpdateMoves([...this.stagedMoves]);});
      const enabled=document.createElement("input");enabled.type="checkbox";enabled.checked=team.isActive!==false;enabled.setAttribute("aria-label",`${team.teamLabel} 사용`);enabled.addEventListener("change",()=>{team.isActive=enabled.checked;this.onUpdateMoves([...this.stagedMoves]);this.render();});
      const limit=document.createElement("input");limit.type="number";limit.min="1";limit.placeholder="무제한";limit.className="sites-form-input";const cap=this.draft.teamCapacities.find(c=>c.teamLabel===team.teamLabel);limit.value=cap?.maxHeadcount?String(cap.maxHeadcount):"";limit.setAttribute("aria-label",`${team.teamLabel} 정원`);limit.addEventListener("change",()=>{const value=limit.value===""?undefined:Number(limit.value);const item=this.draft.teamCapacities.find(c=>c.teamLabel===team.teamLabel);if(item)item.maxHeadcount=value;else this.draft.teamCapacities.push({teamLabel:team.teamLabel,maxHeadcount:value});this.onUpdateMoves([...this.stagedMoves]);this.render();});
      const work=document.createElement("select");work.className="sites-form-select";work.setAttribute("aria-label",`${team.teamLabel} 근무 유형`);for(const [value,label] of [["ROTATING","교대 근무"],["FIXED_DAY","주간 고정"],["POOL","Pool 지원"]]){const o=document.createElement("option");o.value=value;o.textContent=label;work.append(o);}work.value=team.workType||"ROTATING";work.addEventListener("change",()=>{team.workType=work.value as typeof team.workType;this.onUpdateMoves([...this.stagedMoves]);});
      const order=document.createElement("input");order.type="number";order.min="0";order.className="sites-form-input";order.value=String(team.sortOrder??0);order.setAttribute("aria-label",`${team.teamLabel} 표시 순서`);order.addEventListener("change",()=>{team.sortOrder=Number(order.value);this.onUpdateMoves([...this.stagedMoves]);this.render();});
      row.append(enabled,name,work,limit,order);settings.append(row);}
    boardContainer.append(settings);
    wrapper.appendChild(boardContainer);
    this.container.appendChild(wrapper);
    if(restore&&placeholder){const input=Array.from(this.container.querySelectorAll<HTMLInputElement>('input')).find(i=>i.placeholder===placeholder);input?.focus({preventScroll:true});if(position!=null&&input?.type==="text")input.setSelectionRange(position,position);}
  }

  private assignEmployeeToTeam(employeeId: string, toTeam: string): void {
    if(this.disposed)return;
    const emp=this.allEmployees.find(e=>e.id===employeeId);if(!emp||emp.status!=="active"||!this.draft.teamSettings.some(t=>t.teamLabel===toTeam&&t.isActive!==false))return;
    if(!isValidDateString(this.assignmentStartDate)){this.warningMessage="올바른 배정 시작일을 선택해 주세요.";this.render();return;}
    const move:StagedAssignmentMove={employeeId,fromTeam:emp.currentSiteId===this.draft.siteId?emp.currentShiftGroup:undefined,toTeam,startDate:this.assignmentStartDate};
    const next=[...this.stagedMoves.filter(m=>m.employeeId!==employeeId),move];
    try{planAssignmentMoves(this.allEmployees,this.draft.siteId,Object.fromEntries(this.draft.teamCapacities.map(c=>[c.teamLabel,c.maxHeadcount])),next);}catch(error){this.warningMessage=error instanceof Error?error.message:String(error);this.render();return;}
    this.stagedMoves=next;this.selectedEmployeeId=null;this.onUpdateMoves([...next]);this.render();
  }
  private stageOrder(ids:string[],employeeId:string,delta:number,team:string):void {
    const index=ids.indexOf(employeeId),goal=index+delta;if(index<0||goal<0||goal>=ids.length)return;
    const previous=new Map(this.stagedMoves.map(m=>[m.employeeId,m]));
    [ids[index],ids[goal]]=[ids[goal],ids[index]];
    this.stagedMoves=this.stagedMoves.filter(m=>!ids.includes(m.employeeId));
    ids.forEach((id,sortOrder)=>{const old=previous.get(id);const emp=this.allEmployees.find(e=>e.id===id)!;this.stagedMoves.push({...old,employeeId:id,fromTeam:emp.currentShiftGroup,toTeam:team,sortOrder,orderOnly:old ? old.orderOnly : emp.currentSiteId===this.draft.siteId&&emp.currentShiftGroup===team});});this.onUpdateMoves([...this.stagedMoves]);this.render();
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
    return div.innerHTML;
  }
}
