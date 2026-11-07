import { draftFromPattern, setDraftTeamCount, applyImportSuggestion } from "./sites-pattern-model";
import { planAssignmentMoves } from "./sites-model";
// sites-wizard.ts — 근무지 등록/수정 2단계 마법사 컨테이너
import type { AuthSession, SiteRecord, ShiftPatternRecord, EmployeeRecord } from "../../shared/domain/model";
import type { PatternDraft } from "./sites-pattern-model";
import {
  create4Team3ShiftTemplate,
  PatternHistoryManager,
  validatePatternDraft
} from "./sites-pattern-model";
import { SitesWizardBasics } from "./sites-wizard-basics";
import { SitesWizardPattern } from "./sites-wizard-pattern";
import { SitesWizardReview } from "./sites-wizard-review";
import { SitesOrganization, type StagedAssignmentMove } from "./sites-organization";
import { SitesCommit } from "./sites-commit";
import { SitesImportModal } from "./sites-import";
import { showConfirm, showNotice } from "./operations-ui";
import { type SiteEmployeeIdentity } from "./sites-model";

export type WizardStepId = "basics" | "pattern" | "review" | "org" | "commit";

export interface SitesWizardOptions {
  container: HTMLElement;
  session: AuthSession;
  initialSite?: SiteRecord | null;
  initialPattern?: ShiftPatternRecord | null;
  existingSites: SiteRecord[];
  existingPatterns: ShiftPatternRecord[];
  allEmployees: EmployeeRecord[];
  identityMap: Map<string, SiteEmployeeIdentity>;
  onClose: (savedSiteId?: string) => void;
  onNavigateWorkforce: () => void;
  onSessionExpired?: () => void;
  isAlive?: () => boolean;
}

export class SitesWizard {
  private options: SitesWizardOptions;
  private destroyed = false;
  private generation = 0;
  private orgComponent:SitesOrganization|null=null;
  private basicsComponent:SitesWizardBasics|null=null;
  private reviewComponent: SitesWizardReview | null = null;
  private patternComponent: SitesWizardPattern | null = null;
  private importModal: SitesImportModal | null = null;
  private commitComponent: SitesCommit | null = null;
  private siteNameOptions: string[] = [];
  private container: HTMLElement;
  private session: AuthSession;
  private initialSite: SiteRecord | null = null;
  private existingSites: SiteRecord[];
  private existingPatterns: ShiftPatternRecord[];
  private allEmployees: EmployeeRecord[];
  private identityMap: Map<string, SiteEmployeeIdentity>;
  private onClose: (savedSiteId?: string) => void;
  private onNavigateWorkforce: () => void;

  private currentStep: WizardStepId = "basics";
  private draft: PatternDraft;
  private siteName = "";
  private siteCustomer = "";
  private siteStatus: SiteRecord["status"] = "active";
  private siteCode = "";
  private siteId?: string;

  private stagedMoves: StagedAssignmentMove[] = [];
  private historyManager = new PatternHistoryManager();
  private isDirtyState = false;
  private isBusyState = false;

  constructor(options: SitesWizardOptions) {
    this.options=options;
    this.siteNameOptions=[...new Set(options.existingSites.map(s=>s.name))];
    this.container = options.container;
    this.session = options.session;
    this.initialSite = options.initialSite || null;
    this.existingSites = options.existingSites;
    this.existingPatterns = options.existingPatterns;
    this.allEmployees = options.allEmployees;
    this.identityMap = options.identityMap;
    this.onClose = options.onClose;
    this.onNavigateWorkforce = options.onNavigateWorkforce;

    if (this.initialSite) {
      this.siteId = this.initialSite.id;
      this.siteName = this.initialSite.name;
      this.siteCustomer = this.initialSite.customerName || "";
      this.siteStatus = this.initialSite.status;
      this.siteCode = this.initialSite.siteCode;
    }

    this.draft=options.initialPattern?draftFromPattern(options.initialPattern):create4Team3ShiftTemplate(this.siteId || `new-${Date.now()}`);
    this.historyManager.record(this.draft);
  }

  public destroy(): void {this.destroyed=true;this.generation++;this.orgComponent?.destroy();this.basicsComponent?.destroy();this.patternComponent?.destroy();this.reviewComponent?.destroy();this.importModal?.destroy();this.commitComponent?.destroy();}
  private alive(): boolean {return !this.destroyed && (this.options.isAlive?.() ?? true);}
  public async loadNameOptions(): Promise<void> {if(this.session.role!=="admin")return;const gen=this.generation;const r=await window.appBridge!.listSiteNameOptions();if(!this.alive()||gen!==this.generation)return;if(r.ok){this.siteNameOptions=[...new Set([...this.siteNameOptions,...r.data.map(n=>n.name)])];const select=this.container.querySelector<HTMLSelectElement>("#site-name-choice");if(select){const selected=select.value;select.replaceChildren();for(const name of ["",...this.siteNameOptions]){const o=document.createElement("option");o.value=name;o.textContent=name||"이름 선택 (직접 입력 가능)";select.append(o);}select.value=selected;}}else if(/SESSION|AUTH_SESSION/.test(r.errorCode))this.options.onSessionExpired?.();}
  public isDirty(): boolean {
    return this.isDirtyState;
  }

  public isBusy(): boolean {
    return this.isBusyState;
  }

  public render(): void {
    if(!this.alive())return;
    this.orgComponent?.destroy();this.orgComponent=null;
    this.basicsComponent?.destroy();this.basicsComponent=null;
    this.patternComponent?.destroy();this.patternComponent=null;this.reviewComponent?.destroy();this.reviewComponent=null;
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.id = "sites-wizard-container";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "12px";
    wrapper.style.width = "100%";

    // 1. 상단 스텝퍼 바
    const topBar = document.createElement("div");
    topBar.className = "sites-wizard-top";

    const isEditMode = !!this.initialSite;
    topBar.innerHTML = `
      <div class="sites-wizard-title">
        ${isEditMode ? `근무지 설정 수정 — '${this.escape(this.siteName)}'` : "신규 근무지 등록 마법사"}
      </div>
    `;

    const stepper = document.createElement("div");
    stepper.className = "sites-stepper";

    const stepsInfo: Array<{ id: WizardStepId; num: string; label: string }> = [
      { id: "basics", num: "1-A", label: "기본 설정" },
      { id: "pattern", num: "1-B", label: "근무시간 설정" },
      { id: "review", num: "1-C", label: "검토" },
      { id: "org", num: "2", label: "조직 구성" }
    ];

    stepsInfo.forEach((step, idx) => {
      const stepItem = document.createElement("div");
      const isCurrent = this.currentStep === step.id;
      const isPast = this.getStepIndex(this.currentStep) > idx;

      stepItem.className = `sites-step-item sites-wizard-step-item ${isCurrent ? "active" : isPast ? "completed" : ""}`;
      stepItem.dataset.step = step.id;
      stepItem.innerHTML = `
        <div class="sites-step-circle">${isPast ? "✓" : step.num}</div>
        <span>${step.label}</span>
      `;

      stepItem.style.cursor = "pointer";
      stepItem.addEventListener("click", () => {
        if (!this.isBusyState && this.currentStep !== "commit" && this.canNavigate(step.id)) {
          this.currentStep = step.id;this.render();
        }
      });

      stepper.appendChild(stepItem);

      if (idx < stepsInfo.length - 1) {
        const div = document.createElement("div");
        div.className = "sites-step-divider";
        stepper.appendChild(div);
      }
    });

    topBar.appendChild(stepper);
    wrapper.appendChild(topBar);

    const summary = document.createElement("div"); summary.className = "sites-wizard-summary";
    summary.textContent = `${this.siteName || "새 근무지"} · 설정 적용일 ${this.draft.effectiveFrom || "입력 필요"}${isEditMode ? " · 저장 전까지 기존 설정을 유지합니다." : " · 단계별 입력 후 최종 저장합니다."}`;
    wrapper.append(summary);

    // 2. 단계별 컨텐츠 영역
    const stepContentContainer = document.createElement("div");
    stepContentContainer.id = `sites-wizard-step-${this.currentStep}`;
    stepContentContainer.className = "sites-wizard-step-content";

    if (this.currentStep === "basics") {
      const basics = new SitesWizardBasics({
        container: stepContentContainer,
        draft: this.draft,
        siteName: this.siteName,
        siteCustomer: this.siteCustomer,
        siteStatus: this.siteStatus,
        siteCode: this.siteCode,
        existingSites: this.existingSites,
        existingPatterns: this.existingPatterns,
        isAdmin:this.session.role==="admin",siteNameOptions:this.siteNameOptions,
        onUpdateBasics: (updates) => {
          this.siteName = updates.siteName;
          this.siteCustomer = updates.siteCustomer;
          this.siteStatus = updates.siteStatus;
          if(this.draft.teamCount!==updates.teamCount)setDraftTeamCount(this.draft,updates.teamCount);
          this.draft.effectiveFrom = updates.effectiveFrom;
          this.draft.patternStartDate = updates.patternStartDate;
          this.draft.poolEnabled = updates.poolEnabled;
          this.draft.poolStartTime = updates.poolStartTime;
          this.draft.poolEndTime = updates.poolEndTime;
          this.draft.poolBreakMinutes = updates.poolBreakMinutes;
          this.isDirtyState = true;
        },
        onApplyTemplate: (newDraft) => {
          newDraft.patternId=this.draft.patternId;newDraft.baselineRevision=this.draft.baselineRevision;newDraft.effectiveFrom=this.draft.effectiveFrom;
          this.draft = newDraft;
          this.historyManager.clear();this.historyManager.record(this.draft);
          this.isDirtyState = true;
          this.render();
        }
      });
      this.basicsComponent=basics;basics.render();
    } else if (this.currentStep === "pattern") {
      const pattern = new SitesWizardPattern({
        container: stepContentContainer,
        draft: this.draft,
        historyManager: this.historyManager,sessionRole:this.session.role,existingPatterns:this.existingPatterns.filter(p=>p.siteId===this.draft.siteId),onSessionExpired:this.options.onSessionExpired,employees:this.allEmployees,
        onChange: () => {
          this.isDirtyState = true;
        }
      });
      this.patternComponent=pattern;pattern.render();void pattern.loadHolidayData();
    } else if (this.currentStep === "review") {
      const review = new SitesWizardReview({
        container: stepContentContainer,
        draft: this.draft,
        siteName: this.siteName,
        siteCustomer: this.siteCustomer,existingPatterns:this.existingPatterns,onSessionExpired:this.options.onSessionExpired,
        onNavigateStep: (stepId) => {
          this.currentStep = stepId;
          this.render();
        }
      });
      this.reviewComponent=review;review.render();void review.loadHolidayData();
    } else if (this.currentStep === "org") {
      const org = new SitesOrganization({
        container: stepContentContainer,
        draft: this.draft,
        allEmployees: this.allEmployees,
        identityMap: this.identityMap,
        stagedMoves: this.stagedMoves,
        onUpdateMoves: (moves) => {
          this.stagedMoves = moves;
          this.isDirtyState = true;
        },
        onNavigateWorkforce: () => {
          this.handleExitWithDirtyCheck(() => {
            this.onNavigateWorkforce();
          });
        }
      });
      this.orgComponent=org;org.render();
    } else if (this.currentStep === "commit") {
      const commit = this.commitComponent || new SitesCommit({
        container: stepContentContainer,
        siteName: this.siteName,
        siteCustomer: this.siteCustomer,
        siteStatus: this.siteStatus,
        siteCode: this.siteCode,
        siteId: this.siteId,
        draft: this.draft,
        stagedMoves: this.stagedMoves,
        isAlive:()=>this.alive(),onBusyChange:busy=>{this.isBusyState=busy;},onSessionExpired:this.options.onSessionExpired,
        onFinish: (savedSiteId) => {
          this.isDirtyState = false;
          this.isBusyState = false;
          this.onClose(savedSiteId);
        },
        onRetry: () => {
          showConfirm({title:"저장된 내용 확인",message:"이미 저장된 단계는 유지됩니다. 목록으로 돌아가 실제 저장 내용을 확인하시겠습니까?",subMessage:"미처리 배정은 적용되지 않았습니다. 현재 화면에서 계속하려면 취소 후 다시 시도를 선택해 주세요.",confirmLabel:"목록에서 확인",cancelLabel:"계속 처리",onConfirm:()=>{if(this.alive())this.onClose(this.draft.siteId || this.siteId);}});
        }
      });
      this.commitComponent=commit;commit.render();
      void commit.startCommit();
    }

    wrapper.appendChild(stepContentContainer);

    // 3. 하단 네비게이션 버튼 바 (commit 단계 제외)
    if (this.currentStep !== "commit") {
      const footer = document.createElement("div");
      footer.className = "sites-wizard-footer";

      const leftBtns = document.createElement("div");
      leftBtns.style.display = "flex";
      leftBtns.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-secondary";
      cancelBtn.id = "btn-wizard-cancel";
      cancelBtn.textContent = "작성 취소";
      cancelBtn.addEventListener("click", () => {
        this.handleExitWithDirtyCheck(() => {
          this.onClose();
        });
      });
      leftBtns.appendChild(cancelBtn);

      // 엑셀 역추출 버튼
      const excelImportBtn = document.createElement("button");
      excelImportBtn.type = "button";
      excelImportBtn.className = "btn-secondary";
      excelImportBtn.id = "btn-open-import-modal";
      excelImportBtn.innerHTML = `
        <span class="material-symbols-outlined sites-icon-small">upload_file</span>
        <span>엑셀에서 패턴 가져오기</span>
      `;
      excelImportBtn.addEventListener("click", () => {
        if(!this.alive()||this.isBusyState)return;
        this.importModal?.destroy();const baseline=JSON.stringify(this.draft);
        this.importModal=new SitesImportModal({session:this.session,draft:this.draft,isAlive:()=>this.alive(),onBusyChange:busy=>{this.isBusyState=busy;},onSessionExpired:this.options.onSessionExpired,onClose:()=>{this.importModal=null;},onApplyAnalysis:analysis=>{
          if(!this.alive()||JSON.stringify(this.draft)!==baseline)return false;
          const next=applyImportSuggestion(this.draft,analysis);this.draft=next;this.historyManager.clear();this.historyManager.record(next);this.isDirtyState=true;this.currentStep="pattern";this.render();return true;
        }});this.importModal.open();
      });
      const importMount = this.currentStep === "basics" ? stepContentContainer.querySelector(".sites-basics-import-mount") : null;
      if (importMount) importMount.append(excelImportBtn); else leftBtns.appendChild(excelImportBtn);

      footer.appendChild(leftBtns);

      const rightBtns = document.createElement("div");
      rightBtns.style.display = "flex";
      rightBtns.style.gap = "8px";

      if (this.currentStep !== "basics") {
        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "btn-secondary";
        prevBtn.id = "btn-wizard-prev";
        prevBtn.textContent = "이전 단계";
        prevBtn.addEventListener("click", () => {
          this.goToPrevStep();
        });
        rightBtns.appendChild(prevBtn);
      }

      if (this.currentStep !== "org") {
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "btn-primary";
        nextBtn.id = "btn-wizard-next";
        nextBtn.textContent = this.currentStep === "review" ? "조직 구성 (다음 단계)" : "다음 단계";

        // 1-C 검토 단계에서 유효하지 않으면 비활성화
        if (this.currentStep === "review") {
          const val = validatePatternDraft(this.draft, this.siteName);
          if (!val.isValid) {
            nextBtn.disabled = true;
            nextBtn.title = "오류를 먼저 해소해야 다음 단계로 이동할 수 있습니다.";
          }
        }

        nextBtn.addEventListener("click", () => {
          this.goToNextStep();
        });
        rightBtns.appendChild(nextBtn);
      } else {
        // 최종 단계: 저장 확인 버튼
        const submitBtn = document.createElement("button");
        submitBtn.type = "button";
        submitBtn.className = "btn-primary";
        submitBtn.id = "btn-wizard-save";
        submitBtn.textContent = "최종 저장 및 적용";
        submitBtn.addEventListener("click", () => {
          this.confirmAndSubmit();
        });
        rightBtns.appendChild(submitBtn);
      }

      footer.appendChild(rightBtns);
      wrapper.appendChild(footer);
    }

    this.container.appendChild(wrapper);
  }

  private getStepIndex(step: WizardStepId): number {
    switch (step) {
      case "basics":
        return 0;
      case "pattern":
        return 1;
      case "review":
        return 2;
      case "org":
        return 3;
      case "commit":
        return 4;
    }
  }

  private goToPrevStep(): void {
    switch (this.currentStep) {
      case "pattern":
        this.currentStep = "basics";
        break;
      case "review":
        this.currentStep = "pattern";
        break;
      case "org":
        this.currentStep = "review";
        break;
    }
    this.render();
  }

  private goToNextStep(): void {
    if(this.isBusyState || !this.canNavigate(this.currentStep==="basics"?"pattern":this.currentStep==="pattern"?"review":"org"))return;
    switch (this.currentStep) {
      case "basics":
        this.currentStep = "pattern";
        break;
      case "pattern":
        this.currentStep = "review";
        break;
      case "review":
        this.currentStep = "org";
        break;
    }
    this.render();
  }

  private canNavigate(step: WizardStepId): boolean {
    const errors=validatePatternDraft(this.draft,this.siteName,this.existingPatterns).issues;
    const relevant=step==="pattern"||step==="review"?errors.filter(e=>e.step==="basics"):errors;
    if(this.getStepIndex(step)<=this.getStepIndex(this.currentStep))return true;
    if(relevant.length){showNotice("입력 확인",relevant.map(e=>e.message).join(" "),"warning");return false;}return true;
  }
  private confirmAndSubmit(): void {
    if(!this.alive()||this.isBusyState||!(this.session.role==="planner"||this.session.role==="admin"))return;
    const validation=validatePatternDraft(this.draft,this.siteName,this.existingPatterns);
    if(!validation.isValid){showNotice("입력 확인",validation.issues.map(e=>e.message).join(" "),"warning");return;}
    try{planAssignmentMoves(this.allEmployees,this.draft.siteId,Object.fromEntries(this.draft.teamCapacities.map(c=>[c.teamLabel,c.maxHeadcount])),this.stagedMoves);}catch(error){showNotice("배정 확인",error instanceof Error?error.message:String(error),"warning");return;}
    const sameDate=this.existingPatterns.some(p=>p.id===this.draft.patternId&&p.effectiveFrom===this.draft.effectiveFrom);

    showConfirm({
      title: "근무지 및 패턴 저장 확인",
      message: `'${this.siteName}' 근무지의 패턴 설정과 조별 인력 배정을 저장하시겠습니까?`,
      subMessage: `적용 시작일: ${this.draft.effectiveFrom || "미지정"} · 총 ${this.draft.teamCount}개 조 · 배정 변동 ${this.stagedMoves.length}건. ${sameDate?"같은 적용일의 설정을 수정합니다. 이전 설정값을 덮어쓰므로 확인해 주세요.":"다른 적용일의 기존 설정은 보존하고 새 버전을 저장합니다."} 배정 이동 시 이전 배정이 끝나며, 단계별 일부 저장은 이미 반영된 뒤 취소할 수 없습니다.`,
      confirmLabel: "저장 실행",
      cancelLabel: "계속 편집",
      onConfirm: () => {
        if(!this.alive()||this.isBusyState)return;
        this.isBusyState = true;
        this.currentStep = "commit";
        this.render();
      }
    });
  }

  private handleExitWithDirtyCheck(onExit: () => void): void {
    if(!this.alive()||this.isBusyState){showNotice("처리 중","저장 또는 분석이 끝날 때까지 이 화면을 유지해 주세요.");return;}
    if (this.isDirtyState) {
      showConfirm({
        title: "작성 취소 확인",
        message: "마법사에 저장되지 않은 변경사항이 있습니다. 화면을 나가시겠습니까?",
        subMessage: "나가면 작성 중이던 근무지 및 패턴 초안 내용이 모두 사라집니다.",
        confirmLabel: "나가기 (초안 삭제)",
        cancelLabel: "계속 작성",
        variant: "danger",
        onConfirm: () => {
          this.isDirtyState = false;
          onExit();
        }
      });
      return;
    }
    onExit();
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
