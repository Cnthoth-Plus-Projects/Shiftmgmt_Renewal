import { resolveShiftPatternForDate } from "../../shared/domain/shift-pattern-version";
import { draftFromPattern, serializePatternDraft } from "./sites-pattern-model";
// sites.ts — 근무지 관리(UI-03) 메인 화면 컨트롤러
import type { AuthSession, SiteRecord, ShiftPatternRecord, EmployeeRecord } from "../../shared/domain/model";
import {
  type SiteEmployeeIdentity,
  buildEmployeeIdentityMap,
  buildSiteListItems,
  filterAndPaginateSites,
  calculateSiteKpis
} from "./sites-model";
import { SitesList } from "./sites-list";
import { SitesDetail } from "./sites-detail";
import { SitesWizard } from "./sites-wizard";
import { showConfirm, showNotice } from "./operations-ui";

export interface SitesScreenOptions {
  container: HTMLElement;
  session: AuthSession;
  onSessionExpired?: () => void;
  onNavigateWorkforce?: () => void;
}

export class SitesScreen {
  private container: HTMLElement;
  private session: AuthSession;
  private onSessionExpired?: () => void;
  private onNavigateWorkforce?: () => void;

  private viewMode: "list" | "wizard" = "list";
  private sites: SiteRecord[] = [];
  private patterns: ShiftPatternRecord[] = [];
  private employees: EmployeeRecord[] = [];
  private identityMap = new Map<string, SiteEmployeeIdentity>();
  private selectedSiteId: string | null = null;
  private selectedPatternId: string | null = null;
  private mutating = false;

  private listComponent: SitesList | null = null;
  private detailComponent: SitesDetail | null = null;
  private wizardComponent: SitesWizard | null = null;

  private isDestroyed = false;
  private loadRequestId = 0;
  private isLoading = false;
  private errorMessage = "";

  constructor(options: SitesScreenOptions) {
    this.container = options.container;
    this.session = options.session;
    this.onSessionExpired = options.onSessionExpired;
    this.onNavigateWorkforce = options.onNavigateWorkforce;
  }

  public isDirty(): boolean {
    if (this.viewMode === "wizard" && this.wizardComponent) {
      return this.wizardComponent.isDirty();
    }
    return false;
  }

  public isBusy(): boolean {
    if(this.mutating)return true;
    if (this.viewMode === "wizard" && this.wizardComponent) {
      return this.wizardComponent.isBusy();
    }
    return false;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    this.listComponent?.destroy(); this.listComponent = null;
    this.detailComponent = null;
    this.wizardComponent?.destroy();
    this.wizardComponent = null;
    this.container.innerHTML = "";
  }

  public async render(): Promise<void> {
    if (this.isDestroyed) return;

    this.listComponent?.destroy(); this.listComponent = null;

    this.container.innerHTML = "";
    const root = document.createElement("div");
    root.id = "sites-screen";
    root.className = "sites-container";

    if (this.isLoading) {
      root.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:300px; color:var(--text-sub, #4B5563);">
          <span class="material-symbols-outlined" style="font-size:32px; animation:spin 1.5s linear infinite; margin-right:8px;">sync</span>
          <span>근무지 및 교대 패턴 정보를 불러오는 중입니다...</span>
        </div>
      `;
      this.container.appendChild(root);
      return;
    }

    if (this.errorMessage) {
      root.innerHTML = `
        <div style="padding:24px; background:#FCEBE9; border:1px solid #C0392B; border-radius:8px; color:#C0392B; text-align:center;">
          <div style="font-weight:bold; font-size:15px; margin-bottom:8px;">데이터 조회 오류</div>
          <div style="font-size:13px; margin-bottom:14px;">${this.escape(this.errorMessage)}</div>
          <button type="button" class="btn-primary" id="btn-sites-retry" style="margin:0 auto;">다시 시도</button>
        </div>
      `;
      root.querySelector("#btn-sites-retry")?.addEventListener("click", () => {
        void this.loadData();
      });
      this.container.appendChild(root);
      return;
    }

    if (this.viewMode === "wizard") {
      // 마법사 모드
      const wizardMount = document.createElement("div");
      wizardMount.className = "sites-wizard-mount";
      wizardMount.style.width = "100%";

      const targetSite = this.selectedSiteId
        ? this.sites.find((s) => s.id === this.selectedSiteId)
        : null;

      const sitePatterns=this.patterns.filter(p=>p.siteId===this.selectedSiteId);
      const targetPattern=this.selectedPatternId?sitePatterns.find(p=>p.id===this.selectedPatternId):resolveShiftPatternForDate(sitePatterns,new Date().toISOString().slice(0,10));
      this.wizardComponent?.destroy();
      this.wizardComponent = new SitesWizard({
        container: wizardMount,
        session: this.session,isAlive:()=>!this.isDestroyed,onSessionExpired:this.onSessionExpired,
        initialSite: targetSite,
        initialPattern: targetPattern,
        existingSites: this.sites,
        existingPatterns: this.patterns,
        allEmployees: this.employees,
        identityMap: this.identityMap,
        onClose: (savedSiteId) => {
          if(this.isDestroyed)return;this.wizardComponent?.destroy();this.selectedPatternId=null;
          this.viewMode = "list";
          if (savedSiteId) {
            this.selectedSiteId = savedSiteId;
          }
          void this.loadData();
        },
        onNavigateWorkforce: () => {
          if (this.onNavigateWorkforce) {
            this.onNavigateWorkforce();
          }
        }
      });
      void this.wizardComponent.loadNameOptions();this.wizardComponent.render();
      root.appendChild(wizardMount);
    } else {
      // 목록 및 380px 상세 모드 (인력관리와 동일한 상단 KPI + 툴바 + 2열 stretch 본문 구조) (UI03-D08)
      const listItems = buildSiteListItems(this.sites, this.patterns, this.employees);

      if (!this.selectedSiteId && listItems.length > 0) {
        this.selectedSiteId = filterAndPaginateSites(listItems,{keyword:"",status:"ALL",patternFilter:"ALL",sortBy:"customer",sortOrder:"asc"},1,10).items[0]?.id||null;
      }

      // 1. 최상단 KPI 요약 카드 (전체 폭)
      const kpis = calculateSiteKpis(listItems);
      const summarySec = document.createElement("section");
      summarySec.className = "sites-kpis";
      summarySec.id = "sites-kpis";
      summarySec.setAttribute("aria-label", "근무지 현황 요약");
      summarySec.innerHTML = `
        <div class="sites-kpi-grid">
          <div class="sites-kpi-card">
            <span class="sites-kpi-label">전체 근무지</span>
            <span class="sites-kpi-value" id="kpi-total-sites">${kpis.totalSites}</span>
          </div>
          <div class="sites-kpi-card">
            <span class="sites-kpi-label">활성 근무지</span>
            <span class="sites-kpi-value" id="kpi-active-sites" style="color:#1E7A46;">${kpis.activeSites}</span>
          </div>
          <div class="sites-kpi-card">
            <span class="sites-kpi-label">준비/비활성</span>
            <span class="sites-kpi-value" id="kpi-inactive-sites" style="color:#C0392B;">${kpis.inactiveSites}</span>
          </div>
          <div class="sites-kpi-card">
            <span class="sites-kpi-label">총 배정 인원</span>
            <span class="sites-kpi-value" id="kpi-total-employees" style="color:var(--accent, #3E56B6);">${kpis.totalAssignedEmployees}명</span>
          </div>
        </div>
      `;
      root.appendChild(summarySec);

      // 2. 상단 툴바 컨테이너 (전체 폭)
      const toolbarContainer = document.createElement("div");
      toolbarContainer.id = "sites-toolbar-container";
      root.appendChild(toolbarContainer);

      // 3. 본문 2열 그리드 (좌측 표 minmax(0, 1fr) + 우측 상세 380px)
      const contentGrid = document.createElement("div");
      contentGrid.className = "sites-content-grid";
      contentGrid.id = "sites-content-grid";

      const tableArea = document.createElement("div");
      tableArea.id = "sites-table-area";
      contentGrid.appendChild(tableArea);

      const detailArea = document.createElement("div");
      detailArea.id = "sites-detail-area";
      detailArea.setAttribute("aria-label", "선택한 근무지의 상세 정보");
      contentGrid.appendChild(detailArea);

      root.appendChild(contentGrid);

      // SitesList 렌더링 (툴바는 상단에, 표는 tableArea에 마운트)
      this.listComponent = new SitesList({
        container: tableArea,
        toolbarContainer: toolbarContainer,
        session: this.session,
        sites: listItems,
        selectedSiteId: this.selectedSiteId,
        onSelectSite: (siteId) => {
          this.selectedSiteId = siteId;
          this.updateDetailView();
        },
        onOpenCreateWizard: () => {
          if(!["planner","admin"].includes(this.session.role))return;
          this.selectedSiteId = null;this.selectedPatternId=null;
          this.viewMode = "wizard";
          void this.render();
        }
      });
      this.listComponent.render();

      // SitesDetail 렌더링 (우측 detailArea에 마운트)
      const selectedItem = listItems.find((s) => s.id === this.selectedSiteId) || null;
      this.detailComponent = new SitesDetail({
        container: detailArea,
        session: this.session,
        site: selectedItem,
        patterns: this.patterns,
        employees: this.employees,
        identityMap: this.identityMap,
        onEdit: (siteId, patternId) => {
          if(!["planner","admin"].includes(this.session.role))return;
          this.selectedPatternId=patternId || null;this.selectedSiteId = siteId;
          this.viewMode = "wizard";
          void this.render();
        },
        onDeactivate: (siteId) => {
          this.handleToggleDeactivate(siteId);
        },
        onDelete: (siteId) => {
          this.handleDeleteSite(siteId);
        },onTogglePattern:patternId=>this.handleTogglePattern(patternId)
      });
      this.detailComponent.render();
    }

    this.container.appendChild(root);
  }

  public async loadData(): Promise<void> {
    const bridge = window.appBridge;
    if (!bridge || !bridge.listSites || !bridge.listShiftPatterns || !bridge.listEmployees) {
      this.errorMessage = "근무지 조회 API를 사용할 수 없습니다.";
      void this.render();
      return;
    }

    const reqId = ++this.loadRequestId;
    this.isLoading = true;
    this.errorMessage = "";
    void this.render();

    try {
      const [sitesRes, patternsRes, empsRes] = await Promise.all([
        bridge.listSites(),
        bridge.listShiftPatterns(),
        bridge.listEmployees()
      ]);

      if (this.isDestroyed || reqId !== this.loadRequestId) return;

      if (!sitesRes.ok) {
        if (sitesRes.errorCode === "AUTH_SESSION_REQUIRED" || sitesRes.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
          return;
        }
        throw new Error(sitesRes.message || "근무지 목록을 불러오지 못했습니다.");
      }

      if (!patternsRes.ok) {
        if (patternsRes.errorCode === "AUTH_SESSION_REQUIRED" || patternsRes.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
          return;
        }
        throw new Error(patternsRes.message || "교대 패턴 목록을 불러오지 못했습니다.");
      }

      if (!empsRes.ok) {
        if (empsRes.errorCode === "AUTH_SESSION_REQUIRED" || empsRes.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
          return;
        }
        throw new Error(empsRes.message || "직원 목록을 불러오지 못했습니다.");
      }

      this.sites = sitesRes.data || [];
      this.patterns = patternsRes.data || [];
      this.employees = empsRes.data || [];
      this.identityMap = buildEmployeeIdentityMap(this.employees);

      this.isLoading = false;
      void this.render();
    } catch (err) {
      if (this.isDestroyed || reqId !== this.loadRequestId) return;
      this.isLoading = false;
      this.errorMessage = err instanceof Error ? err.message : String(err);
      void this.render();
    }
  }

  private updateDetailView(): void {
    if (!this.detailComponent) return;
    const listItems = buildSiteListItems(this.sites, this.patterns, this.employees);
    const selectedItem = listItems.find((s) => s.id === this.selectedSiteId) || null;
    this.detailComponent.updateData(selectedItem, this.patterns, this.employees, this.identityMap);
  }

  private handleToggleDeactivate(siteId: string): void {
    if(this.isDestroyed||this.mutating||!["planner","admin"].includes(this.session.role))return;
    const site = this.sites.find((s) => s.id === siteId);
    if (!site) return;

    const isCurrentActive = site.status === "active";
    const nextStatus = isCurrentActive ? "inactive" : "active";

    showConfirm({
      title: isCurrentActive ? "근무지 비활성화 확인" : "근무지 활성화 확인",
      message: `'${site.name}' 근무지를 ${isCurrentActive ? "비활성화" : "활성화"}하시겠습니까?`,
      subMessage: isCurrentActive
        ? "비활성화 시 근무표 생성 및 신규 배정 대상에서 제외됩니다. 기존 이력은 보존됩니다."
        : "활성화 시 정상 운영 상태로 복귀합니다.",
      confirmLabel: isCurrentActive ? "비활성화 실행" : "활성화 실행",
      cancelLabel: "취소",
      onConfirm: async () => {
        if(this.isDestroyed||this.mutating)return;this.mutating=true;const generation=this.loadRequestId;
        const bridge = window.appBridge;
        try {
        if (!bridge?.saveSite) throw Error("근무지 저장 연결을 확인해 주세요.");

        const res = await bridge.saveSite({
          id: site.id,
          siteCode: site.siteCode,
          name: site.name,
          customerName: site.customerName,
          status: nextStatus,
          timezone: site.timezone
        });

        this.mutating=false;if(this.isDestroyed||generation!==this.loadRequestId)return;
        if (res.ok) {
          showNotice(
            "상태 변경 완료",
            `'${site.name}' 근무지가 ${nextStatus === "active" ? "활성화" : "비활성화"}되었습니다.`,
            "info"
          );
          void this.loadData();
        } else {
          showNotice(
            "상태 변경 실패",
            (res as { message?: string }).message || "상태를 변경하지 못했습니다.",
            "error"
          );
        }
        }catch(error){if(!this.isDestroyed&&generation===this.loadRequestId)showNotice("처리 결과 확인 필요",error instanceof Error?error.message:String(error),"error");}finally{this.mutating=false;}
      }
    });
  }

  private handleTogglePattern(patternId:string):void {
    if(this.isDestroyed||this.mutating||!["planner","admin"].includes(this.session.role))return;
    const p=this.patterns.find(p=>p.id===patternId);if(!p)return;const active=p.status==="active";
    showConfirm({title:active?"선택한 설정 비활성화":"선택한 설정 사용 재개",message:`${p.name} (${p.effectiveFrom||"기준일 없음"}) 설정을 ${active?"비활성화":"사용 재개"}할까요?`,subMessage:"선택한 버전의 사용 여부만 변경합니다. 근무지·기존 배정·저장된 근무표와 정산 이력은 보존됩니다. 다른 활성 버전이 있으면 해당 버전이 적용될 수 있습니다.",confirmLabel:active?"설정 비활성화":"사용 재개",onConfirm:async()=>{
      if(this.isDestroyed||this.mutating)return;this.mutating=true;const generation=this.loadRequestId;
      try{const b=window.appBridge!;const d=draftFromPattern(p);d.status="active";const r=active?await b.deactivateShiftPattern({patternId}):await b.saveShiftPattern(serializePatternDraft(d));if(this.isDestroyed||generation!==this.loadRequestId)return;if(!r.ok){if(/SESSION|AUTH_SESSION/.test(r.errorCode))this.onSessionExpired?.();else showNotice("설정 상태 변경 실패",r.message,"error");return;}void this.loadData();}
      catch(error){if(!this.isDestroyed&&generation===this.loadRequestId)showNotice("설정 상태 확인",error instanceof Error?error.message:String(error),"error");}finally{this.mutating=false;}
    }});
  }

  private handleDeleteSite(siteId: string): void {
    if(this.isDestroyed||this.mutating||!["planner","admin"].includes(this.session.role))return;
    const site = this.sites.find((s) => s.id === siteId);
    if (!site) return;

    showConfirm({
      title: "근무지 삭제 확인",
      message: `'${site.name}' 근무지를 정말로 삭제하시겠습니까?`,
      subMessage: "목록에서 근무지를 숨깁니다. 과거 배정·정산 이력은 유지되며 이 화면에는 숨김을 되돌리는 기능이 없습니다. 단순 운영 중단이면 비활성화를 선택해 주세요.",
      confirmLabel: "삭제 실행",
      cancelLabel: "취소",
      variant: "danger",
      onConfirm: async () => {
        if(this.isDestroyed||this.mutating)return;this.mutating=true;const generation=this.loadRequestId;
        const bridge = window.appBridge;
        try {
        if (!bridge?.deleteSite) throw Error("근무지 삭제 연결을 확인해 주세요.");

        const res = await bridge.deleteSite({ siteId });
        this.mutating=false;if(this.isDestroyed||generation!==this.loadRequestId)return;
        if (res.ok) {
          showNotice(
            "삭제 완료",
            `'${site.name}' 근무지가 안전하게 삭제 처리되었습니다.`,
            "info"
          );
          this.selectedSiteId = null;
          void this.loadData();
        } else {
          showNotice(
            "삭제 실패",
            (res as { message?: string }).message || "근무지를 삭제하지 못했습니다.",
            "error"
          );
        }
        }catch(error){if(!this.isDestroyed&&generation===this.loadRequestId)showNotice("처리 결과 확인 필요",error instanceof Error?error.message:String(error),"error");}finally{this.mutating=false;}
      }
    });
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
