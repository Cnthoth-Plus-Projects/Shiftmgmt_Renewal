// sites-wizard-review.ts — 마법사 1-C 단계: 입력 검토 및 오류 목록, 요약 표시
import type { PatternDraft } from "./sites-pattern-model";
import { validatePatternDraft, type PatternValidationResult } from "./sites-pattern-model";

export interface SitesWizardReviewOptions {
  container: HTMLElement;
  draft: PatternDraft;
  siteName: string;
  siteCustomer: string;
  existingPatterns?: import("../../shared/domain/model").ShiftPatternRecord[];
  onNavigateStep: (stepId: "basics" | "pattern") => void;
}

export class SitesWizardReview {
  private options:SitesWizardReviewOptions;
  private container: HTMLElement;
  private draft: PatternDraft;
  private siteName: string;
  private siteCustomer: string;
  private onNavigateStep: (stepId: "basics" | "pattern") => void;

  constructor(options: SitesWizardReviewOptions) {
    this.options=options;
    this.container = options.container;
    this.draft = options.draft;
    this.siteName = options.siteName;
    this.siteCustomer = options.siteCustomer;
    this.onNavigateStep = options.onNavigateStep;
  }

  public render(): void {
    this.container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "sites-wizard-card";

    // 유효성 검사 실행
    const validation: PatternValidationResult = validatePatternDraft(this.draft, this.siteName,this.options.existingPatterns);

    // 1. 검토 상태 배너
    const banner = document.createElement("div");
    banner.style.padding = "14px 18px";
    banner.style.borderRadius = "6px";
    banner.style.display = "flex";
    banner.style.alignItems = "flex-start";
    banner.style.gap = "12px";

    if (!validation.isValid) {
      banner.style.background = "#FCEBE9";
      banner.style.border = "1px solid #C0392B";
      banner.style.color = "#C0392B";
      banner.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:22px; margin-top:2px;">error</span>
        <div>
          <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">
            입력 항목 검토 결과 — 총 ${validation.issues.length}건의 오류가 발견되었습니다.
          </div>
          <div style="font-size:12px;">
            아래 오류 항목을 확인하고 해당 입력 단계로 이동하여 내용을 수정한 후 다시 검토해 주세요.
          </div>
        </div>
      `;
    } else {
      banner.style.background = "#E8F5EE";
      banner.style.border = "1px solid #1E7A46";
      banner.style.color = "#1E7A46";
      banner.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:22px; margin-top:2px;">check_circle</span>
        <div>
          <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">
            입력 항목 검토 완료 — 모든 설정이 유효합니다.
          </div>
          <div style="font-size:12px;">
            기본 설정과 교대 패턴이 정상적으로 검증되었습니다. 다음 단계로 이동하여 조별 인력 조직을 구성할 수 있습니다.
          </div>
        </div>
      `;
    }
    card.appendChild(banner);

    // 2. 오류 목록 (오류가 있는 경우)
    if (!validation.isValid) {
      const issueBox = document.createElement("div");
      issueBox.style.border = "1px solid var(--line, #E2E5EA)";
      issueBox.style.borderRadius = "6px";
      issueBox.style.padding = "14px";
      issueBox.style.background = "#FFFFFF";

      const issueTitle = document.createElement("div");
      issueTitle.style.fontWeight = "bold";
      issueTitle.style.fontSize = "13px";
      issueTitle.style.marginBottom = "10px";
      issueTitle.textContent = "오류 목록 및 수정 바로가기:";
      issueBox.appendChild(issueTitle);

      const ul = document.createElement("ul");
      ul.style.listStyle = "none";
      ul.style.padding = "0";
      ul.style.margin = "0";
      ul.style.display = "flex";
      ul.style.flexDirection = "column";
      ul.style.gap = "8px";

      validation.issues.forEach((issue) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.padding = "6px 10px";
        li.style.background = "#F8FAFC";
        li.style.borderRadius = "4px";
        li.style.fontSize = "12px";

        const textSpan = document.createElement("span");
        textSpan.style.color = "#C0392B";
        textSpan.style.fontWeight = "500";
        textSpan.textContent = `• ${issue.message}`;
        li.appendChild(textSpan);

        const linkBtn = document.createElement("button");
        linkBtn.type = "button";
        linkBtn.className = "btn-secondary";
        linkBtn.style.fontSize = "11px";
        linkBtn.style.height = "24px";
        linkBtn.textContent = issue.step === "basics" ? "기본 설정으로 이동" : "근무시간 설정으로 이동";
        linkBtn.addEventListener("click", () => {
          this.onNavigateStep(issue.step === "basics" ? "basics" : "pattern");
        });
        li.appendChild(linkBtn);

        ul.appendChild(li);
      });

      issueBox.appendChild(ul);
      card.appendChild(issueBox);
    }

    // 3. 설정 요약 테이블
    const summaryCard = document.createElement("div");
    summaryCard.style.border = "1px solid var(--line, #E2E5EA)";
    summaryCard.style.borderRadius = "6px";
    summaryCard.style.padding = "16px";
    summaryCard.style.background = "#FFFFFF";

    summaryCard.innerHTML = `
      <div style="font-weight:bold; font-size:14px; margin-bottom:12px; border-bottom:1px solid var(--line, #E2E5EA); padding-bottom:8px;">
        설정 요약 정보
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12px;">
        <div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">근무지 이름</span>
            <span class="sites-info-val"><strong>${this.escape(this.siteName || "미입력")}</strong></span>
          </div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">고객사</span>
            <span class="sites-info-val">${this.escape(this.siteCustomer || "기타")}</span>
          </div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">설정 적용 시작일</span>
            <span class="sites-info-val"><strong>${this.draft.effectiveFrom || "미지정"}</strong></span>
          </div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">조 수</span>
            <span class="sites-info-val">${this.draft.teamCount}개 조</span>
          </div>
        </div>
        <div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">패턴 코드</span>
            <span class="sites-info-val"><strong>${this.draft.patternCode || "D-E-N-O"}</strong></span>
          </div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">근무 묶음 수</span>
            <span class="sites-info-val">${this.draft.cycles.length}개 (${this.draft.isPerTeamPattern ? "조별 개별 패턴" : "공유 패턴"})</span>
          </div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">Pool 사용 여부</span>
            <span class="sites-info-val">${this.draft.poolEnabled ? "사용" : "미사용"}</span>
          </div>
          <div class="sites-info-row" style="padding:4px 0;">
            <span class="sites-info-label">등록된 근무/휴무 유형</span>
            <span class="sites-info-val">${this.draft.dutyTypes.map((d) => d.label).join(", ")}</span>
          </div>
        </div>
      </div>
    `;
    card.appendChild(summaryCard);

    this.container.appendChild(card);
  }

  private escape(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
