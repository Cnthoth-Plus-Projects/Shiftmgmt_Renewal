// sites-detail.ts — 우측 380px 근무지 상세, 패턴 버전 이력 및 조별 명단 컴포넌트
import type { AuthSession, ShiftPatternRecord, EmployeeRecord } from "../../shared/domain/model";
import {
  type SiteListItem,
  type SiteEmployeeIdentity,
  resolvePatternVersionStatus
} from "./sites-model";

export interface SitesDetailOptions {
  container: HTMLElement;
  session: AuthSession;
  site: SiteListItem | null;
  patterns: ShiftPatternRecord[];
  employees: EmployeeRecord[];
  identityMap: Map<string, SiteEmployeeIdentity>;
  onEdit: (siteId: string, patternId?: string) => void;
  onDeactivate: (siteId: string) => void;
  onDelete: (siteId: string) => void;
  onTogglePattern?: (patternId:string) => void;
}

export class SitesDetail {
  private container: HTMLElement;
  private session: AuthSession;
  private site: SiteListItem | null;
  private patterns: ShiftPatternRecord[];
  private employees: EmployeeRecord[];
  private identityMap: Map<string, SiteEmployeeIdentity>;
  private onEdit: (siteId: string, patternId?: string) => void;
  private onDeactivate: (siteId: string) => void;
  private onDelete: (siteId: string) => void;
  private onTogglePattern?: (patternId:string)=>void;

  private versionPage = 1;
  private readonly versionPageSize = 5;
  private selectedPatternId: string | null = null;

  constructor(options: SitesDetailOptions) {
    this.container = options.container;
    this.session = options.session;
    this.site = options.site;
    this.patterns = options.patterns;
    this.employees = options.employees;
    this.identityMap = options.identityMap;
    this.onEdit = options.onEdit;
    this.onDeactivate = options.onDeactivate;
    this.onDelete = options.onDelete;
    this.onTogglePattern=options.onTogglePattern;
  }

  public updateData(
    site: SiteListItem | null,
    patterns: ShiftPatternRecord[],
    employees: EmployeeRecord[],
    identityMap: Map<string, SiteEmployeeIdentity>
  ): void {
    if(this.site?.id!==site?.id){this.selectedPatternId=null;this.versionPage=1;}
    this.site = site;
    this.patterns = patterns;
    this.employees = employees;
    this.identityMap = identityMap;
    this.render();
  }

  public render(): void {
    this.container.innerHTML = "";

    const card = document.createElement("div");
    card.id = "sites-detail-panel";
    card.className = "sites-detail-card";

    if (!this.site) {
      card.innerHTML = `
        <div class="sites-empty-detail">
          <span class="material-symbols-outlined sites-empty-icon">domain</span>
          <div>목록에서 근무지를 선택하면<br>상세 정보와 설정 이력을 확인할 수 있습니다.</div>
        </div>
      `;
      this.container.appendChild(card);
      return;
    }

    const canEdit = this.session.role === "admin" || this.session.role === "planner";

    // 1. 헤더
    const header = document.createElement("div");
    header.className = "sites-detail-header";
    header.innerHTML = `
      <div>
        <div class="sites-detail-title">${this.escape(this.site.name)}</div>
        <div class="sites-detail-subtitle">${this.escape(this.site.siteCode)} · ${this.escape(this.site.customerName)}</div>
      </div>
      <div>
        ${
          this.site.status === "active"
            ? `<span class="sites-detail-active">활성</span>`
            : `<span class="sites-detail-inactive">비활성</span>`
        }
      </div>
    `;
    card.appendChild(header);

    // 2. 기본 정보
    const infoSec = document.createElement("div");
    infoSec.className = "sites-detail-section";
    infoSec.innerHTML = `
      <div class="sites-detail-sec-title">기본 정보</div>
      <div class="sites-info-list">
        <div class="sites-info-row">
          <span class="sites-info-label">고객사</span>
          <span class="sites-info-val">${this.escape(this.site.customerName)}</span>
        </div>
        <div class="sites-info-row">
          <span class="sites-info-label">타임존</span>
          <span class="sites-info-val">${this.escape(this.site.timezone)}</span>
        </div>
        <div class="sites-info-row">
          <span class="sites-info-label">현재 조 구성</span>
          <span class="sites-info-val">${this.site.teamCount > 0 ? `${this.site.teamCount}개 조` : "미설정"}</span>
        </div>
        <div class="sites-info-row">
          <span class="sites-info-label">배정 인원</span>
          <span class="sites-info-val"><strong>${this.site.assignedCount}</strong>명</span>
        </div>
      </div>
    `;
    card.appendChild(infoSec);

    // 3. 패턴 버전 이력 (과거/현재/예정/비활성 구분 UI03-D08)
    const sitePatterns = this.patterns
      .filter((p) => p.siteId === this.site?.id)
      .sort((a, b) => (b.effectiveFrom || "").localeCompare(a.effectiveFrom || ""));

    // 선택된 패턴이 없거나 목록에 없으면 첫 번째 패턴 자동 선택
    if (!sitePatterns.some(p=>p.id===this.selectedPatternId) && sitePatterns.length > 0) {
      const activePat = sitePatterns.find(p=>resolvePatternVersionStatus(p,sitePatterns)==="current") || sitePatterns[0];
      this.selectedPatternId = activePat.id;
    }

    const historySec = document.createElement("div");
    historySec.className = "sites-detail-section";

    const historyTitle = document.createElement("div");
    historyTitle.className = "sites-detail-sec-title";
    historyTitle.textContent = `설정 버전 이력 (${sitePatterns.length}건)`;
    historySec.appendChild(historyTitle);

    if (sitePatterns.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.fontSize = "12px";
      emptyDiv.style.color = "var(--text-sub, #4B5563)";
      emptyDiv.style.padding = "8px 0";
      emptyDiv.textContent = "등록된 근무 패턴 버전이 없습니다.";
      historySec.appendChild(emptyDiv);
    } else {
      const totalVerPages = Math.max(1, Math.ceil(sitePatterns.length / this.versionPageSize));
      const curVerPage = Math.min(this.versionPage, totalVerPages);
      const startIdx = (curVerPage - 1) * this.versionPageSize;
      const pagedPatterns = sitePatterns.slice(startIdx, startIdx + this.versionPageSize);

      const listDiv = document.createElement("div");
      listDiv.style.display = "flex";
      listDiv.style.flexDirection = "column";
      listDiv.style.gap = "6px";

      pagedPatterns.forEach((pat) => {
        const itemDiv = document.createElement("div");
        const isSelected = this.selectedPatternId === pat.id;
        itemDiv.className = `sites-version-item ${isSelected ? "selected" : ""}`;
        itemDiv.style.border = `1px solid ${isSelected ? "var(--accent, #3E56B6)" : "var(--line, #E2E5EA)"}`;
        itemDiv.style.borderRadius = "4px";
        itemDiv.style.padding = "8px 10px";
        itemDiv.style.fontSize = "12px";
        itemDiv.style.cursor = "pointer";
        itemDiv.style.background = isSelected ? "#EEF1FB" : "#FFFFFF";

        // 공통 날짜 판정 함수로 과거/현재/예정/비활성 판정 (UI03-D08)
        const verStatus = resolvePatternVersionStatus(pat, sitePatterns);
        let badgeHtml = "";
        if (verStatus === "current") {
          badgeHtml = `<span class="sites-version-current">현재</span>`;
        } else if (verStatus === "scheduled") {
          badgeHtml = `<span class="sites-version-upcoming">예정</span>`;
        } else if (verStatus === "past") {
          badgeHtml = `<span class="sites-version-past">과거</span>`;
        } else {
          badgeHtml = `<span class="sites-version-inactive">비활성</span>`;
        }

        itemDiv.innerHTML = `
          <div class="sites-version-heading">
            <strong class="sites-text-primary">${this.escape(pat.name)}</strong>
            ${badgeHtml}
          </div>
          <div class="sites-version-meta">
            적용일: ${this.escape(pat.effectiveFrom || "미지정")} · ${pat.teamCount}개 조 · ${this.escape(pat.patternCode || "패턴")}
          </div>
        `;

        itemDiv.addEventListener("click", () => {
          this.selectedPatternId = pat.id;
          this.render();
        });

        if(this.session.role==="planner"||this.session.role==="admin"){const edit=document.createElement("button");edit.type="button";edit.className="btn-secondary";edit.textContent="이 버전 수정";edit.addEventListener("click",()=>this.onEdit(this.site!.id,pat.id));itemDiv.append(edit);}
        listDiv.appendChild(itemDiv);
      });
      historySec.appendChild(listDiv);

      // 버전 이력 페이징
      if (totalVerPages > 1) {
        const verNav = document.createElement("div");
        verNav.style.display = "flex";
        verNav.style.justifyContent = "center";
        verNav.style.gap = "4px";
        verNav.style.marginTop = "6px";

        for (let p = 1; p <= totalVerPages; p++) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `sites-page-btn ${p === curVerPage ? "active" : ""}`;
          btn.textContent = String(p);
          btn.style.height = "22px";
          btn.style.minWidth = "22px";
          btn.style.fontSize = "11px";
          btn.addEventListener("click", () => {
            this.versionPage = p;
            this.render();
          });
          verNav.appendChild(btn);
        }
        historySec.appendChild(verNav);
      }
    }
    card.appendChild(historySec);

    // 4. 조별 명단 요약
    const teamSec = document.createElement("div");
    teamSec.className = "sites-detail-section";

    const assignedEmps = this.employees.filter(
      (e) => e.currentSiteId === this.site?.id && e.status === "active"
    );

    const teamTitle = document.createElement("div");
    teamTitle.className = "sites-detail-sec-title";
    teamTitle.textContent = `조별 명단 (총 ${assignedEmps.length}명)`;
    teamSec.appendChild(teamTitle);

    if (assignedEmps.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.fontSize = "12px";
      emptyDiv.style.color = "var(--text-sub, #4B5563)";
      emptyDiv.style.padding = "8px 0";
      emptyDiv.textContent = "현재 배정된 직원이 없습니다.";
      teamSec.appendChild(emptyDiv);
    } else {
      // 조별 그룹화
      const teamMap = new Map<string, EmployeeRecord[]>();
      for (const emp of assignedEmps) {
        const team = emp.currentShiftGroup || "미지정";
        const list = teamMap.get(team) ?? [];
        list.push(emp);
        teamMap.set(team, list);
      }

      const teamListDiv = document.createElement("div");
      teamListDiv.style.display = "flex";
      teamListDiv.style.flexDirection = "column";
      teamListDiv.style.gap = "6px";
      teamListDiv.style.maxHeight = "160px";
      teamListDiv.style.overflowY = "auto";

      Array.from(teamMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([team, emps]) => {
          const row = document.createElement("div");
          row.className = "sites-detail-team-card";
          row.style.border = "1px solid var(--line, #E2E5EA)";
          row.style.borderRadius = "4px";
          row.style.padding = "6px 8px";
          row.style.fontSize = "11px";

          const names = emps
            .map((e) => {
              const ident = this.identityMap.get(e.id);
              return `${ident?.name || e.name}${ident?.rank ? `(${ident.rank})` : ""} · ${e.employeeCode}`;
            })
            .join(", ");

          row.innerHTML = `
            <div class="sites-team-name">
              ${this.escape(team)} (${emps.length}명)
            </div>
            <div class="sites-team-cycle">
              ${this.escape(names)}
            </div>
          `;
          teamListDiv.appendChild(row);
        });

      teamSec.appendChild(teamListDiv);
    }
    card.appendChild(teamSec);

    // 5. 하단 액션 버튼 그룹 (planner, admin만 가능)
    if (canEdit) {
      const actionsDiv = document.createElement("div");
      actionsDiv.style.display = "flex";
      actionsDiv.style.flexDirection = "column";
      actionsDiv.style.gap = "8px";
      actionsDiv.style.borderTop = "1px solid var(--line, #E2E5EA)";
      actionsDiv.style.paddingTop = "14px";
      actionsDiv.style.marginTop = "auto";

      const selectedPat = sitePatterns.find((p) => p.id === this.selectedPatternId) || sitePatterns[0];

      // 버전 수정 안내 (UI03-D08: 같은 적용일 수정 덮어쓰기 vs 새 버전 생성 안내)
      const noticeDiv = document.createElement("div");
      noticeDiv.style.fontSize = "11px";
      noticeDiv.style.color = "var(--text-sub, #4B5563)";
      noticeDiv.style.lineHeight = "1.4";
      noticeDiv.style.background = "#F8FAFC";
      noticeDiv.style.padding = "6px 8px";
      noticeDiv.style.borderRadius = "4px";
      noticeDiv.style.border = "1px solid var(--line, #E2E5EA)";
      noticeDiv.innerHTML = `선택 버전: <strong>${this.escape(selectedPat?.name || "기본")}</strong> (적용일: ${selectedPat?.effectiveFrom || "미지정"})<br><span class="sites-version-help">동일한 적용일로 수정 시 기존 설정이 덮어써지며, 새로운 적용일을 입력하면 신규 버전이 생성됩니다.</span>`;
      actionsDiv.appendChild(noticeDiv);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-primary";
      editBtn.id = "btn-edit-site";
      editBtn.style.justifyContent = "center";
      editBtn.innerHTML = `
        <span class="material-symbols-outlined sites-icon-small">edit</span>
        <span>선택 버전 및 조 수정</span>
      `;
      editBtn.addEventListener("click", () => {
        this.onEdit(this.site!.id, selectedPat?.id);
      });
      actionsDiv.appendChild(editBtn);
      if(selectedPat&&this.onTogglePattern){const toggle=document.createElement("button");toggle.type="button";toggle.className="btn-secondary";toggle.id="btn-toggle-pattern";toggle.textContent=selectedPat.status==="active"?"선택한 설정만 비활성화":"선택한 설정 사용 재개";toggle.addEventListener("click",()=>this.onTogglePattern?.(selectedPat.id));actionsDiv.append(toggle);}

      const subActions = document.createElement("div");
      subActions.style.display = "grid";
      subActions.style.gridTemplateColumns = "1fr 1fr";
      subActions.style.gap = "8px";

      const deactBtn = document.createElement("button");
      deactBtn.type = "button";
      deactBtn.className = "btn-secondary";
      deactBtn.id = "btn-deactivate-site";
      deactBtn.style.justifyContent = "center";
      deactBtn.textContent = this.site.status === "active" ? "비활성화" : "활성화";
      deactBtn.addEventListener("click", () => {
        this.onDeactivate(this.site!.id);
      });
      subActions.appendChild(deactBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-secondary";
      delBtn.id = "btn-delete-site";
      delBtn.style.color = "#C0392B";
      delBtn.style.justifyContent = "center";
      delBtn.textContent = "근무지 삭제";
      delBtn.addEventListener("click", () => {
        this.onDelete(this.site!.id);
      });
      subActions.appendChild(delBtn);

      actionsDiv.appendChild(subActions);
      card.appendChild(actionsDiv);
    }

    this.container.appendChild(card);
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
