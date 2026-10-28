import { WorkforceDialog } from "./workforce-dialog";
import { draftFromPattern } from "./sites-pattern-model";
// sites-wizard-basics.ts — 마법사 1-A 단계: 기본 설정 및 빠른 시작(템플릿/복사)
import type { SiteRecord, ShiftPatternRecord } from "../../shared/domain/model";
import type { PatternDraft } from "./sites-pattern-model";
import { create4Team3ShiftTemplate, create2Team2ShiftTemplate } from "./sites-pattern-model";
import { showConfirm, showNotice } from "./operations-ui";

export interface SitesWizardBasicsOptions {
  container: HTMLElement;
  draft: PatternDraft;
  siteName: string;
  siteCustomer: string;
  siteStatus: SiteRecord["status"];
  siteCode: string;
  existingSites: SiteRecord[];
  existingPatterns: ShiftPatternRecord[];
  isAdmin?: boolean;
  siteNameOptions?: string[];
  onUpdateBasics: (updates: {
    siteName: string;
    siteCustomer: string;
    siteStatus: SiteRecord["status"];
    teamCount: number;
    effectiveFrom: string;
    patternStartDate?: string;
    poolEnabled: boolean;
    poolStartTime?: string;
    poolEndTime?: string;
    poolBreakMinutes?: number;
  }) => void;
  onApplyTemplate: (newDraft: PatternDraft) => void;
}

export class SitesWizardBasics {
  private dialog=new WorkforceDialog();
  private disposed=false;
  public destroy():void{this.disposed=true;this.dialog.close();}
  private container: HTMLElement;
  private draft: PatternDraft;
  private siteName: string;
  private siteCustomer: string;
  private siteStatus: SiteRecord["status"];
  private siteCode: string;
  private existingSites: SiteRecord[];
  private existingPatterns: ShiftPatternRecord[];
  private isAdmin: boolean;
  private siteNameOptions: string[];
  private onUpdateBasics: SitesWizardBasicsOptions["onUpdateBasics"];
  private onApplyTemplate: (newDraft: PatternDraft) => void;
  private teamCountError = "";

  constructor(options: SitesWizardBasicsOptions) {
    this.container = options.container;
    this.draft = options.draft;
    this.siteName = options.siteName;
    this.siteCustomer = options.siteCustomer;
    this.siteStatus = options.siteStatus;
    this.siteCode = options.siteCode;
    this.existingSites = options.existingSites;
    this.existingPatterns = options.existingPatterns;
    this.isAdmin = options.isAdmin ?? false;
    this.siteNameOptions = options.siteNameOptions ?? [];
    this.onUpdateBasics = options.onUpdateBasics;
    this.onApplyTemplate = options.onApplyTemplate;
  }

  public render(): void {
    this.container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "sites-wizard-card";

    // 상단 템플릿/복사 빠른 시작 툴바
    const quickStartBar = document.createElement("div");
    quickStartBar.style.display = "flex";
    quickStartBar.style.justifyContent = "space-between";
    quickStartBar.style.alignItems = "center";
    quickStartBar.style.padding = "10px 14px";
    quickStartBar.style.background = "#F8FAFC";
    quickStartBar.style.border = "1px solid var(--line, #E2E5EA)";
    quickStartBar.style.borderRadius = "6px";
    quickStartBar.style.marginBottom = "8px";

    quickStartBar.innerHTML = `
      <div style="font-size:12px; font-weight:bold; color:var(--text, #1F2430); display:flex; align-items:center; gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px; color:var(--accent, #3E56B6);">auto_fix</span>
        <span>빠른 시작 (템플릿 적용 및 기존 근무지 복사)</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn-secondary" id="btn-quick-template-4t3s" style="font-size:12px; height:28px;">4조 3교대</button>
        <button type="button" class="btn-secondary" id="btn-tpl-2t2s" style="font-size:12px; height:28px;">2조 2교대</button>
        <button type="button" class="btn-secondary" id="btn-open-site-copy" style="font-size:12px; height:28px;">기존 설정 복사</button>
      </div>
    `;

    // 템플릿 버튼 이벤트
    quickStartBar.querySelector("#btn-quick-template-4t3s")?.addEventListener("click", () => {
      this.confirmAndApplyTemplate(create4Team3ShiftTemplate(this.draft.siteId, `${this.siteName || "근무지"} 4조 3교대`));
    });

    quickStartBar.querySelector("#btn-tpl-2t2s")?.addEventListener("click", () => {
      this.confirmAndApplyTemplate(create2Team2ShiftTemplate(this.draft.siteId, `${this.siteName || "근무지"} 2조 2교대`));
    });

    quickStartBar.querySelector("#btn-open-site-copy")?.addEventListener("click", () => {
      this.openCopyModal();
    });

    card.appendChild(quickStartBar);

    // 2열 폼 그리드
    const grid = document.createElement("div");
    grid.className = "sites-form-grid-2col";

    // 좌측 열: 근무지 정보
    const leftCol = document.createElement("div");

    leftCol.innerHTML = `
      <div class="sites-form-group">
        <label class="sites-form-label" for="wizard-site-name">근무지 이름 <span style="color:#C0392B;">*</span></label>
        <input type="text" id="wizard-site-name" class="sites-form-input" value="${this.escape(this.siteName)}" placeholder="예: 보라매 사업장" />
        <label class="sites-form-label" for="site-name-choice">등록·기존 근무지 이름 불러오기</label><select id="site-name-choice" class="sites-form-select"><option value="">이름 선택 (직접 입력 가능)</option>${this.siteNameOptions.map(opt=>`<option value="${this.escape(opt)}">${this.escape(opt)}</option>`).join("")}</select>
      </div>

      <div class="sites-form-group">
        <label class="sites-form-label" for="wizard-client-name">고객사</label>
        <input type="text" id="wizard-client-name" class="sites-form-input" value="${this.escape(this.siteCustomer)}" placeholder="예: ㈜한빛에프엠" />
      </div>

      <div class="sites-form-group">
        <label class="sites-form-label">상태</label>
        <div style="display:flex; gap:16px; margin-top:4px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
            <input type="radio" name="site-status" value="active" ${this.siteStatus === "active" ? "checked" : ""} />
            <span>사용 (활성)</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
            <input type="radio" name="site-status" value="inactive" ${this.siteStatus === "inactive" ? "checked" : ""} />
            <span>사용 안 함 (비활성)</span>
          </label>
        </div>
      </div>

      <div class="sites-form-group">
        <label class="sites-form-label" for="inp-site-code">근무지 코드</label>
        <input type="text" id="inp-site-code" class="sites-form-input" value="${this.siteCode ? this.escape(this.siteCode) : "저장 시 자동 생성"}" readonly style="background:#F4F5F7; color:var(--text-sub, #4B5563);" />
        <span class="sites-form-help">신규 등록 시 시스템 표준 규칙에 따라 코드가 자동 채번됩니다.</span>
      </div>
    `;
    grid.appendChild(leftCol);

    // 우측 열: 패턴 기본 파라미터
    const rightCol = document.createElement("div");

    rightCol.innerHTML = `
      <div class="sites-form-group">
        <label class="sites-form-label" for="inp-effective-from">설정 적용 시작일 <span style="color:#C0392B;">*</span></label>
        <input type="date" id="inp-effective-from" class="sites-form-input" value="${this.draft.effectiveFrom || "2026-01-01"}" />
        <span class="sites-form-help">이 날짜부터 새로 작성된 교대 패턴 설정이 적용됩니다.</span>
      </div>

      <div class="sites-form-group">
        <label class="sites-form-label" for="inp-pattern-start-date">패턴 기준일 (선택)</label>
        <input type="date" id="inp-pattern-start-date" class="sites-form-input" value="${this.draft.patternStartDate || ""}" />
        <span class="sites-form-help">비워두면 적용 시작일이 패턴 1일차 기준일이 됩니다.</span>
      </div>

      <div class="sites-form-group">
        <label class="sites-form-label" for="wizard-team-count">조 수 (2 ~ 8개 조) <span style="color:#C0392B;">*</span></label>
        <input type="number" id="wizard-team-count" class="sites-form-input" min="2" max="8" value="${this.draft.teamCount}" />
        <span class="sites-form-help">운영할 교대 조의 개수입니다. 조 설정은 조직 구성 단계에서 상세 배정됩니다.</span>
        <div id="team-count-error" style="color:#C0392B; font-size:11px; margin-top:2px; display:${this.teamCountError ? "block" : "none"};">${this.escape(this.teamCountError)}</div>
      </div>

      <div class="sites-form-group" style="border:1px solid var(--line, #E2E5EA); border-radius:6px; padding:10px 12px; margin-top:8px;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
          <input type="checkbox" id="chk-pool-enabled" ${this.draft.poolEnabled ? "checked" : ""} />
          <span>Pool(대기/지원) 조 사용</span>
        </label>
        <div id="pool-time-fields" style="display:${this.draft.poolEnabled ? "flex" : "none"}; gap:10px; margin-top:8px; align-items:center; font-size:12px;">
          <span>근무시간:</span>
          <input type="time" id="inp-pool-start" class="sites-form-input" style="width:90px;" value="${this.draft.poolStartTime || "09:00"}" />
          <span>~</span>
          <input type="time" id="inp-pool-end" class="sites-form-input" style="width:90px;" value="${this.draft.poolEndTime || "18:00"}" />
          <span>휴게:</span>
          <input type="number" id="inp-pool-break" class="sites-form-input" style="width:60px;" min="0" step="30" value="${this.draft.poolBreakMinutes ?? 60}" />
          <span>분</span>
        </div>
      </div>
    `;
    grid.appendChild(rightCol);

    card.appendChild(grid);
    this.container.appendChild(card);

    const cycleBox=document.createElement("div");cycleBox.className="sites-form-group";cycleBox.innerHTML=`<label class="sites-form-label" for="wizard-cycle-count">묶음 개수 (1~8개)</label><input id="wizard-cycle-count" class="sites-form-input" type="number" min="1" max="8" value="${this.draft.requestedCycleCount ?? this.draft.cycles.length}"/><span class="sites-form-help">사용 중인 묶음은 삭제되지 않습니다. 보존된 전용 묶음도 개수에 포함됩니다.</span>`;rightCol.append(cycleBox);
    cycleBox.querySelector<HTMLInputElement>("input")!.addEventListener("change",e=>{const n=Number((e.target as HTMLInputElement).value);this.draft.requestedCycleCount=n;if(Number.isInteger(n)&&n>=1&&n<=8){if(n>this.draft.cycles.length){while(this.draft.cycles.length<n){const c=structuredClone(this.draft.cycles[0]);if(!c)break;c.cycleKey=`cycle-${crypto.randomUUID()}`;c.name=`묶음 ${this.draft.cycles.length+1}`;c.order=this.draft.cycles.length;this.draft.cycles.push(c);}}
      else if(n<this.draft.cycles.length){const removed=this.draft.cycles.slice(n);if(removed.some(c=>this.draft.teamCycleAssignments.some(a=>a.cycleKey===c.cycleKey))){showNotice("묶음 보존","조에 연결된 묶음이 포함되어 있습니다. 조별 묶음 연결을 먼저 확인해 주세요.","warning");return;}showConfirm({title:"사용하지 않는 묶음 정리",message:`연결되지 않은 ${removed.length}개 묶음과 그 내용을 초안에서 제거할까요?`,confirmLabel:"제거",onConfirm:()=>{if(this.disposed)return;this.draft.cycles=this.draft.cycles.slice(0,n);this.render();},onCancel:()=>{this.draft.requestedCycleCount=this.draft.cycles.length;this.render();}});}}
      card.querySelector<HTMLInputElement>("#wizard-site-name")?.dispatchEvent(new Event("input"));});
    card.querySelector<HTMLSelectElement>("#site-name-choice")?.addEventListener("change",e=>{const input=card.querySelector<HTMLInputElement>("#wizard-site-name")!;input.value=(e.target as HTMLSelectElement).value;input.dispatchEvent(new Event("input"));});
    // 이벤트 리스너 등록
    const nameInp = card.querySelector<HTMLInputElement>("#wizard-site-name, #inp-site-name");
    const custInp = card.querySelector<HTMLInputElement>("#wizard-client-name, #inp-site-customer");
    const effInp = card.querySelector<HTMLInputElement>("#inp-effective-from");
    const patStartInp = card.querySelector<HTMLInputElement>("#inp-pattern-start-date");
    const teamCountInp = card.querySelector<HTMLInputElement>("#wizard-team-count, #inp-team-count");
    const poolChk = card.querySelector<HTMLInputElement>("#chk-pool-enabled");
    const poolFields = card.querySelector<HTMLElement>("#pool-time-fields");
    const poolStartInp = card.querySelector<HTMLInputElement>("#inp-pool-start");
    const poolEndInp = card.querySelector<HTMLInputElement>("#inp-pool-end");
    const poolBreakInp = card.querySelector<HTMLInputElement>("#inp-pool-break");

    const notifyChange = () => {
      const siteName = nameInp?.value || "";
      const siteCustomer = custInp?.value || "";
      const statusRadio = card.querySelector<HTMLInputElement>('input[name="site-status"]:checked');
      const siteStatus = (statusRadio?.value as SiteRecord["status"]) || "active";
      const effectiveFrom = effInp?.value || "";
      const patternStartDate = patStartInp?.value || undefined;
      const rawCount = Number(teamCountInp?.value);
      const errEl = card.querySelector<HTMLElement>("#team-count-error");

      // 조용한 보정(clamp) 금지: 입력값을 그대로 반영하고 범위 밖이면 유효성 오류 표시 (UI03-D03)
      if (isNaN(rawCount) || rawCount < 2 || rawCount > 8) {
        this.teamCountError = "조 수는 2개 이상 8개 이하여야 합니다.";
        if (errEl) {
          errEl.textContent = this.teamCountError;
          errEl.style.display = "block";
        }
      } else {
        this.teamCountError = "";
        if (errEl) {
          errEl.textContent = "";
          errEl.style.display = "none";
        }
      }

      const poolEnabled = poolChk?.checked || false;

      this.siteName = siteName;
      this.siteCustomer = siteCustomer;
      this.siteStatus = siteStatus;

      this.onUpdateBasics({
        siteName,
        siteCustomer,
        siteStatus,
        teamCount: isNaN(rawCount) ? 4 : rawCount,
        effectiveFrom,
        patternStartDate,
        poolEnabled,
        poolStartTime: poolStartInp?.value,
        poolEndTime: poolEndInp?.value,
        poolBreakMinutes: poolBreakInp ? parseInt(poolBreakInp.value, 10) : 60
      });
    };

    [nameInp, custInp, effInp, patStartInp, teamCountInp, poolStartInp, poolEndInp, poolBreakInp].forEach((el) => {
      el?.addEventListener("input", notifyChange);
    });

    teamCountInp?.addEventListener("change", notifyChange);

    card.querySelectorAll('input[name="site-status"]').forEach((r) => {
      r.addEventListener("change", notifyChange);
    });

    poolChk?.addEventListener("change", () => {
      if (poolFields) {
        poolFields.style.display = poolChk.checked ? "flex" : "none";
      }
      notifyChange();
    });
  }

  private confirmAndApplyTemplate(templateDraft: PatternDraft): void {
    showConfirm({
      title: "템플릿 적용 확인",
      message: `'${templateDraft.name}' 템플릿을 적용하시겠습니까?`,
      subMessage: "기존에 작성 중이던 패턴 및 근무시간 설정이 템플릿 기본값으로 대체됩니다.",
      confirmLabel: "적용하기",
      cancelLabel: "취소",
      onConfirm: () => {
        this.onApplyTemplate(templateDraft);
      }
    });
  }

  private openCopyModal(): void {
    const records=this.existingPatterns;if(!records.length){showNotice("복사 안내","복사할 기존 설정이 없습니다.");return;}
    const content=document.createElement("div"),label=document.createElement("label"),select=document.createElement("select");select.id="sel-copy-pattern";select.className="sites-form-select";label.htmlFor=select.id;label.textContent="복사할 근무지·설정 버전";
    for(const p of records){const o=document.createElement("option");o.value=p.id;o.textContent=`${this.existingSites.find(s=>s.id===p.siteId)?.name || "근무지"} · ${p.name} · ${p.effectiveFrom || "기준일 없음"}`;select.append(o);}content.append(label,select);
    this.dialog.open({id:"sites-copy-modal",title:"기존 근무지 설정 복사",content,width:"600px",initialFocusSelector:"#btn-copy-cancel",buttons:[{id:"btn-copy-cancel",label:"취소",onClick:()=>this.dialog.close()},{id:"btn-copy-ok",label:"복사하여 적용",onClick:()=>{if(this.disposed)return;const p=records.find(p=>p.id===select.value);if(!p)return;const d=draftFromPattern(p);d.status="active";d.siteId=this.draft.siteId;d.patternId=this.draft.patternId;d.effectiveFrom=this.draft.effectiveFrom;d.baselineRevision=this.draft.baselineRevision;d.name=`${this.siteName || "근무지"} 설정 (복사본)`;this.dialog.close();this.onApplyTemplate(d);}}]});
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
