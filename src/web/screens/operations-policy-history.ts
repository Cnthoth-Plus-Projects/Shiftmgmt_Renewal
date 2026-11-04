import type { BrowserAppBridge } from "../bridge/app-bridge";
import type {
  PolicyHistoryListResult,
} from "../../shared/bridge/contracts";
import type {
  PolicyKind,
  PolicyRevisionRecord,
  PolicyRuleKey,
  PolicyEventRecord,
} from "../../shared/domain/policy-history";
import { OperationsPolicyDialog, openPolicyModal, type OpenPolicyDialogOptions } from "./operations-policy-dialog";
import { sharedDialog } from "./operations-ui";
import { RULE_KEY_METADATA } from "../../shared/domain/policy-history";

export class OperationsPolicyHistoryModal {
  private backdropEl: HTMLElement | null = null;
  private dialog: OperationsPolicyDialog;
  private currentPage = 1;
  private currentKind: PolicyKind = "substitute-eligibility";
  private currentView: "revisions" | "events" = "revisions";
  private isBusy = false;
  private generation = 0;
  private currentRequestId = 0;
  private modalToken: number | null = null;
  private registryFingerprint: string | undefined;
  private pageSize = 6;
  private triggerElement: HTMLElement | null = null;

  constructor(private bridge: BrowserAppBridge, private onSessionExpired?: () => void) {
    this.dialog = new OperationsPolicyDialog(bridge, onSessionExpired);
  }

  public getBusy(): boolean { return this.isBusy || this.dialog.getBusy(); }

  async open(kind: PolicyKind, triggerElement?: HTMLElement) {
    this.currentKind = kind;
    this.currentView = "revisions";
    this.currentPage = 1;
    this.triggerElement = triggerElement ?? (document.activeElement as HTMLElement | null);
    await this.render();
  }

  private async render() {
    const trigger = this.triggerElement;
    this.close();
    this.triggerElement = trigger;
    this.pageSize = Math.max(3, Math.min(10, Math.floor((window.innerHeight - 360) / 48)));

    this.generation++;
    let backdrop: HTMLElement = document.createElement("div");
    backdrop.className = "policy-history-dialog-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const titleId = `policy-history-title-${this.generation}`;
    backdrop.setAttribute("aria-labelledby", titleId);

    const kindTitle =
      this.currentKind === "substitute-eligibility"
        ? "대체근무수당 지급 대상 정책 이력"
        : "실제 근무자 우선순위 정책 이력";

    backdrop.innerHTML = `
      <div class="policy-history-dialog" role="document">
        <div class="policy-dialog-header">
          <h2 id="${titleId}" class="policy-dialog-title">${escapeHtml(kindTitle)}</h2>
          <div class="policy-dialog-header-right">
            <div class="policy-view-toggle-group">
              <button type="button" id="btn-toggle-revisions" class="btn btn-sm ${this.currentView === "revisions" ? "btn-primary policy-btn-primary" : "btn-secondary policy-btn-secondary"}">개정 목록</button>
              <button type="button" id="btn-toggle-events" class="btn btn-sm ${this.currentView === "events" ? "btn-primary policy-btn-primary" : "btn-secondary policy-btn-secondary"}">사건 이력</button>
            </div>
            <button type="button" id="btn-add-new-policy" class="btn btn-primary policy-btn-primary">+ 새 정책 추가</button>
            <button type="button" class="btn-close-dialog policy-btn-close-lg" aria-label="닫기">&times;</button>
          </div>
        </div>
        <div class="policy-dialog-content">
          <div id="policy-history-table-container">
            <div class="policy-empty-box">이력을 불러오는 중...</div>
          </div>
        </div>
        <div class="policy-pagination" id="policy-history-pagination"></div>
      </div>
    `;

    const modal = openPolicyModal(backdrop, "operations-policy-history", this.triggerElement, () => {
      if (this.modalToken !== modal.token) return;
      this.modalToken = null;
      this.close();
    });
    backdrop = modal.overlay;
    this.modalToken = modal.token;
    this.backdropEl = backdrop;


    const toggleRevisionsBtn = backdrop.querySelector("#btn-toggle-revisions") as HTMLElement;
    const toggleEventsBtn = backdrop.querySelector("#btn-toggle-events") as HTMLElement;

    toggleRevisionsBtn?.addEventListener("click", () => {
      if (this.currentView !== "revisions") {
        this.currentView = "revisions";
        this.currentPage = 1;
        toggleRevisionsBtn.className = "btn btn-sm btn-primary policy-btn-primary";
        toggleEventsBtn.className = "btn btn-sm btn-secondary policy-btn-secondary";
        this.fetchAndPopulateTable();
      }
    });

    toggleEventsBtn?.addEventListener("click", () => {
      if (this.currentView !== "events") {
        this.currentView = "events";
        this.currentPage = 1;
        toggleEventsBtn.className = "btn btn-sm btn-primary policy-btn-primary";
        toggleRevisionsBtn.className = "btn btn-sm btn-secondary policy-btn-secondary";
        this.fetchAndPopulateTable();
      }
    });

    const addNewBtn = backdrop.querySelector("#btn-add-new-policy") as HTMLElement;
    addNewBtn.addEventListener("click", () => {
      this.openEditor({
        action: "add",
        kind: this.currentKind,
        triggerElement: addNewBtn,
        onSuccess: () => { /* editor close refreshes the current page */ },
      });
    });

    await this.fetchAndPopulateTable();
  }

  private async fetchAndPopulateTable() {
    if (!this.backdropEl) return;

    const currentGen = this.generation;
    const reqId = ++this.currentRequestId;
    this.isBusy = true;

    const container = this.backdropEl.querySelector("#policy-history-table-container") as HTMLElement;
    const pagination = this.backdropEl.querySelector("#policy-history-pagination") as HTMLElement;

    try {
      const res = await this.bridge.listPolicyHistory({
        kind: this.currentKind,
        view: this.currentView,
        page: this.currentPage,
        pageSize: this.pageSize,
      });

      if (currentGen !== this.generation || reqId !== this.currentRequestId || !this.backdropEl) {
        return;
      }

      if (!res.ok) {
        if (["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(res.errorCode)) { this.close(); this.onSessionExpired?.(); return; }
        throw new Error(res.message || "이력을 불러오지 못했습니다.");
      }

      const data: PolicyHistoryListResult = res.data;
      this.registryFingerprint = data.registryConfigFingerprint;

      if (this.currentView === "events") {
        this.renderEventsTable(container, data.events ?? []);
      } else {
        this.renderRevisionsTable(container, (data.revisions ?? []) as Array<
          PolicyRevisionRecord & {
            status: "past" | "active" | "scheduled" | "retired" | "corrected" | "cancelled";
            isUsed: boolean;
            usedCount?: number;
        effectiveTo?: string | null;
          }
        >);
      }

      // 페이지네이션 렌더링
      const totalPages = Math.ceil((data.totalCount ?? 0) / (data.pageSize || 10)) || 1;
      pagination.innerHTML = `
        <div class="policy-page-info">총 ${data.totalCount ?? 0}건 (페이지 ${this.currentPage} / ${totalPages})</div>
        <div class="policy-page-controls">
          <button type="button" id="btn-policy-prev-page" class="btn btn-secondary policy-btn-page" ${this.currentPage <= 1 ? "disabled" : ""}>이전</button>
          <button type="button" id="btn-policy-next-page" class="btn btn-secondary policy-btn-page" ${this.currentPage >= totalPages ? "disabled" : ""}>다음</button>
        </div>
      `;

      const prevBtn = pagination.querySelector("#btn-policy-prev-page") as HTMLButtonElement | null;
      const nextBtn = pagination.querySelector("#btn-policy-next-page") as HTMLButtonElement | null;

      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          if (this.currentPage > 1) {
            this.currentPage--;
            this.fetchAndPopulateTable();
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          if (this.currentPage < totalPages) {
            this.currentPage++;
            this.fetchAndPopulateTable();
          }
        });
      }
    } catch (err: unknown) {
      if (currentGen !== this.generation || reqId !== this.currentRequestId || !this.backdropEl) {
        return;
      }
      container.innerHTML = `<div class="policy-error-box">오류: ${escapeHtml((err as Error).message || "조회 실패")}</div>`;
    } finally {
      if (currentGen === this.generation && reqId === this.currentRequestId && this.backdropEl) {
        this.isBusy = false;
      }
    }
  }

  private renderRevisionsTable(
    container: HTMLElement,
    items: Array<
      PolicyRevisionRecord & {
        status: "past" | "active" | "scheduled" | "retired" | "corrected" | "cancelled";
        isUsed: boolean;
        usedCount?: number;
        effectiveTo?: string | null;
      }
    >
  ) {
    if (items.length === 0) {
      container.innerHTML = `<div class="policy-empty-box">등록된 정책 개정이 없습니다.</div>`;
      return;
    }

    container.innerHTML = `
      <table class="policy-history-dense-table">
        <thead>
          <tr>
            <th class="policy-th-ver">버전</th>
            <th class="policy-th-status">상태</th>
            <th>적용 기준</th>
            <th class="policy-th-date">적용 기간</th>
            <th>사유</th>
            <th class="policy-th-actor">등록자</th>
            <th class="policy-th-created">등록일시</th>
            <th class="policy-th-action">관리</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const normalizedStatus = item.status === "past" ? "retired" : item.status;
              const statusClass =
                normalizedStatus === "active"
                  ? "policy-status-active"
                  : normalizedStatus === "scheduled"
                    ? "policy-status-scheduled"
                    : normalizedStatus === "retired"
                      ? "policy-status-past"
                      : normalizedStatus === "corrected"
                        ? "policy-status-cancelled"
                        : "policy-status-cancelled";

              const statusLabel =
                normalizedStatus === "active"
                  ? "현재 활성"
                  : normalizedStatus === "scheduled"
                    ? "적용 예정"
                    : normalizedStatus === "retired"
                      ? "과거 종료"
                      : normalizedStatus === "corrected"
                        ? "정정됨"
                        : "취소됨";

              const isUsedFlag = item.isUsed || (item.usedCount ?? 0) > 0;
              const usedBadge = isUsedFlag
                ? `<span class="policy-used-badge" title="실적 승인에 사용됨 (${item.usedCount ?? 1}건)">사용됨</span>`
                : "";

              const ruleLabel = {
                "substitute-legacy": "종전 기준",
                "substitute-team-type-v1": "근무유형 기준",
                "changed-worker-legacy": "종전 슬롯 판정",
                "changed-worker-after-v1": "실근무자 우선"
              }[item.ruleKey];

              const effectiveText = `${item.effectiveFrom ?? "도입 이전"} ~ ${item.effectiveTo ?? "다음 개정 전"}`;
              const createdDateText = item.createdAt ? item.createdAt.substring(0, 16).replace("T", " ") : "-";

              // 정정/취소는 예정 정책(scheduled)이면서 used가 없고 origin !== 'initial'일 때만 활성화
              const canModify =
                normalizedStatus === "scheduled" &&
                !isUsedFlag &&
                item.origin !== "initial";

              let lockReason = "변경 불가";
              if (normalizedStatus === "active") lockReason = "현재 적용 중";
              else if (normalizedStatus === "retired") lockReason = "종료된 정책";
              else if (normalizedStatus === "corrected") lockReason = "정정된 정책";
              else if (normalizedStatus === "cancelled") lockReason = "취소된 정책";
              else if (isUsedFlag) lockReason = "실적 승인에 사용됨";
              else if (item.origin === "initial") lockReason = "최초 도입 기준";

              return `
                <tr>
                  <td><span class="policy-version-badge">V${item.versionNumber}</span></td>
                  <td>
                    <span class="policy-status-badge ${statusClass}">${statusLabel}</span>
                    ${usedBadge}
                  </td>
                  <td><div class="policy-rule-cell"><strong title="${escapeHtml(RULE_KEY_METADATA[item.ruleKey].summary)}">${escapeHtml(ruleLabel)}</strong><button type="button" class="policy-show-revision policy-btn-sm" data-id="${escapeHtml(item.id)}">상세</button></div></td>
                  <td class="policy-period-cell">${escapeHtml(effectiveText).replace(" ~ ", "<br>~ ")}</td>
                  <td class="policy-cell-reason" title="${escapeHtml(item.reason ?? "")}">${escapeHtml(item.reason ?? "-")}</td>
                  <td>${escapeHtml(item.actor?.displayName ?? item.actor?.role ?? "-")}</td>
                  <td>${escapeHtml(createdDateText)}</td>
                  <td class="policy-cell-action">
                    ${
                      canModify
                        ? `
                      <button type="button" class="btn-correct-policy policy-btn-sm" data-id="${escapeHtml(item.id)}" data-rule="${escapeHtml(item.ruleKey)}" data-date="${escapeHtml(item.effectiveFrom ?? "")}">정정</button>
                      <button type="button" class="btn-cancel-policy policy-btn-cancel-sm" data-id="${escapeHtml(item.id)}">취소</button>
                    `
                        : `<span class="policy-action-lock" title="${escapeHtml(lockReason)}">${escapeHtml(lockReason)}</span>`
                    }
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    container.querySelectorAll<HTMLElement>(".policy-show-revision").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = items.find(row => row.id === btn.dataset.id);
        if (item) this.showDetails(`V${item.versionNumber} 적용 기준`, item, btn);
      });
    });

    // 정정/취소 이벤트 연결
    container.querySelectorAll(".btn-correct-policy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-id")!;
        const ruleKey = (btn.getAttribute("data-rule") || undefined) as PolicyRuleKey | undefined;
        const effectiveFrom = btn.getAttribute("data-date") || undefined;
        this.openEditor({
          action: "correct",
          kind: this.currentKind,
          targetRevisionId: targetId,
          initialRuleKey: ruleKey,
          initialEffectiveFrom: effectiveFrom,
          triggerElement: btn as HTMLElement,
          onSuccess: () => { /* editor close refreshes the current page */ },
        });
      });
    });

    container.querySelectorAll(".btn-cancel-policy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-id")!;
        this.openEditor({
          action: "cancel",
          kind: this.currentKind,
          targetRevisionId: targetId,
          triggerElement: btn as HTMLElement,
          onSuccess: () => { /* editor close refreshes the current page */ },
        });
      });
    });
  }

  private renderEventsTable(container: HTMLElement, events: PolicyEventRecord[]) {
    if (events.length === 0) {
      container.innerHTML = `<div class="policy-empty-box">등록된 정책 사건 이력이 없습니다.</div>`;
      return;
    }

    container.innerHTML = `
      <table class="policy-history-dense-table">
        <thead>
          <tr>
            <th class="policy-th-created">발생 시각</th>
            <th class="policy-th-status">사건 종류</th>
            <th class="policy-th-ver">대상</th>
            <th>사유 / 상세</th>
            <th class="policy-th-actor">수행자</th>
          </tr>
        </thead>
        <tbody>
          ${events
            .map((evt) => {
              const typeLabel =
                evt.eventType === "initialized"
                  ? "초기 도입"
                  : evt.eventType === "created"
                    ? "신규 등록"
                    : evt.eventType === "corrected"
                      ? "정정됨"
                      : evt.eventType === "cancelled"
                        ? "취소됨"
                        : evt.eventType === "used"
                          ? "실적 승인 사용"
                          : evt.eventType;

              const typeClass =
                evt.eventType === "initialized" || evt.eventType === "created"
                  ? "policy-status-active"
                  : evt.eventType === "used"
                    ? "policy-status-scheduled"
                    : "policy-status-cancelled";

              const occurredAtText = evt.occurredAt
                ? evt.occurredAt.substring(0, 19).replace("T", " ")
                : "-";

              const detailText = evt.relatedApprovalId
                ? `승인 건 참조 (${evt.relatedApprovalId})`
                : evt.replacementRevisionId
                  ? `새 버전(${evt.replacementRevisionId})으로 정정 교체`
                  : "-";

              return `
                <tr>
                  <td>${escapeHtml(occurredAtText)}</td>
                  <td><span class="policy-status-badge ${typeClass}">${escapeHtml(typeLabel)}</span></td>
                  <td>${escapeHtml(evt.revisionId || "-")}</td>
                  <td>${escapeHtml(detailText)} <button type="button" class="policy-show-event policy-btn-sm" data-id="${escapeHtml(evt.id)}">전후 상세</button></td>
                  <td>${escapeHtml(evt.actor?.displayName ?? evt.actor?.role ?? "-")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
    container.querySelectorAll<HTMLElement>(".policy-show-event").forEach(btn => {
      btn.addEventListener("click", () => {
        const event = events.find(row => row.id === btn.dataset.id);
        if (event) this.showDetails("정책 변경 전후 기록", event, btn);
      });
    });
  }

  private openEditor(options: OpenPolicyDialogOptions): void {
    const token = this.modalToken;
    this.modalToken = null;
    this.backdropEl = null;
    this.isBusy = false;
    this.generation++;
    const generation = this.generation;
    if (token !== null && sharedDialog.isCurrent(token)) sharedDialog.close();
    this.dialog.open({ ...options, onSuccess: () => { options.onSuccess(); void refreshPolicySummary(this.onSessionExpired); }, triggerElement: this.triggerElement ?? undefined, expectedRegistryFingerprint: this.registryFingerprint,
      onClose: () => { const closedToken = sharedDialog.captureToken(); queueMicrotask(() => { if (generation === this.generation && closedToken === sharedDialog.captureToken() && !sharedDialog.isOpen()) void this.render(); }); } });
  }

  private showDetails(title: string, value: unknown, trigger: HTMLElement): void {
    const token = this.modalToken;
    this.modalToken = null;
    this.backdropEl = null;
    this.generation++;
    const generation = this.generation;
    if (token !== null && sharedDialog.isCurrent(token)) sharedDialog.close();
    const content = document.createElement("div");
    content.className = "policy-record-details";
    const field = (parent: HTMLElement, label: string, text: string) => {
      const row = document.createElement("div"); row.className = "policy-detail-field";
      const term = document.createElement("strong"); term.textContent = label;
      const description = document.createElement("span"); description.textContent = text;
      row.append(term, description); parent.appendChild(row);
    };
    const revision = (raw: unknown, heading: string) => {
      const section = document.createElement("section"); section.className = "policy-detail-section";
      const h = document.createElement("h3"); h.textContent = heading; section.appendChild(h);
      let record: PolicyRevisionRecord;
      try { record = (typeof raw === "string" ? JSON.parse(raw) : raw) as PolicyRevisionRecord; }
      catch { field(section, "기록", "기준 기록을 읽을 수 없습니다."); content.appendChild(section); return; }
      if (!record?.ruleKey) { field(section, "기록", "해당 기록 없음"); content.appendChild(section); return; }
      field(section, "버전", `V${record.versionNumber}`);
      field(section, "기준", RULE_KEY_METADATA[record.ruleKey]?.label ?? record.ruleKey);
      field(section, "적용 시작일", record.effectiveFrom ?? "도입 이전부터 적용");
      field(section, "등록 사유", record.reason);
      field(section, "등록자", record.actor.displayName);
      field(section, "등록 시각", new Date(record.createdAt).toLocaleString("ko-KR", {timeZone: "Asia/Seoul"}));
      try {
        const criteria = JSON.parse(record.criteriaJson) as Record<string, unknown>;
        field(section, "공통 제외", "Pool · BP 근무자");
        if (typeof criteria.additionalWorkOnly === "boolean") {
          field(section, "추가 근무 여부", criteria.additionalWorkOnly ? "본인의 정규근무 외 추가 근무만 인정" : "종전 판정 방식 적용");
          field(section, "대체 대상", criteria.rotatingTargetOnly ? "교대조 근무만 인정" : "종전 판정 방식 적용");
          field(section, "주간고정조", criteria.excludeFixedDay ? "대체수당 지급 대상에서 제외" : "종전 지급 기준 적용");
        } else field(section, "근무자 선택", criteria.workerSelection === "after-valid-worker" ? "등록된 실제근무자(변경후)를 우선 판정" : "종전 슬롯 판정 방식 적용");
      } catch { field(section, "세부 기준", "당시 기준 기록을 읽을 수 없습니다."); }
      content.appendChild(section);
    };
    const record = value as PolicyEventRecord & PolicyRevisionRecord;
    if (record.eventType) {
      field(content, "발생 시각", new Date(record.occurredAt).toLocaleString("ko-KR", {timeZone: "Asia/Seoul"}));
      field(content, "수행자", record.actor.displayName);
      if (record.relatedApprovalId) field(content, "승인 참조", record.relatedApprovalId);
      if (record.eventType === "cancelled") {
        try { field(content, "취소 사유", (JSON.parse(record.afterJson ?? "{}") as {cancelReason?: string}).cancelReason ?? "사유 기록 없음"); } catch { field(content, "취소 사유", "기록 확인 필요"); }
      }
      revision(record.beforeJson, "변경 전");
      revision(record.afterJson, "변경 후");
    } else revision(value, "등록 당시 적용 기준");
    const overlay = sharedDialog.open({ id: "operations-policy-details", title, content,
      triggerElement: trigger, onClose: () => { const closedToken = sharedDialog.captureToken(); queueMicrotask(() => { if (generation === this.generation && closedToken === sharedDialog.captureToken() && !sharedDialog.isOpen()) void this.render(); }); } });
    overlay.classList.add("policy-history-dialog-backdrop");
    overlay.querySelector(".workforce-modal-box")?.classList.add("policy-history-dialog");
    this.modalToken = sharedDialog.captureToken();
  }

  close() {
    this.generation++;
    this.currentRequestId++;
    this.isBusy = false;

    const token = this.modalToken;
    this.modalToken = null;
    this.backdropEl = null;
    this.dialog.close();
    if (token !== null && sharedDialog.isCurrent(token)) sharedDialog.close();

    if (this.triggerElement) {
      if (this.triggerElement.isConnected) this.triggerElement.focus();
      this.triggerElement = null;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function refreshPolicySummary(onSessionExpired?: () => void): Promise<void> {
  const bridge = window.appBridge;
  if (!bridge) return;
  const targets = [
    {kind: "substitute-eligibility" as const, button: "btn-open-substitute-policy"},
    {kind: "changed-worker-priority" as const, button: "btn-open-changed-slot-policy"}
  ];
  await Promise.all(targets.map(async ({kind, button}) => {
    const card = document.getElementById(button)?.closest(".policy-summary-card");
    if (!card) return;
    const previous = card.querySelector(".policy-current-summary"); previous?.remove();
    const summary = document.createElement("div"); summary.className = "policy-current-summary"; summary.textContent = "현재·예정 기준 확인 중...";
    card.querySelector(".policy-card-actions")?.before(summary);
    try {
      const response = await bridge.listPolicyHistory({kind, pageSize: 1});
      if (!summary.isConnected) return;
      if (!response.ok) {
        if (["AUTH_SESSION_REQUIRED", "SESSION_EXPIRED"].includes(response.errorCode)) onSessionExpired?.();
        summary.textContent = response.message || "현재 기준을 조회하지 못했습니다. 이력에서 다시 확인해 주세요."; return;
      }
      const {currentRevision, nextScheduledRevision} = response.data;
      summary.replaceChildren();
      for (const [label, projection] of [["현재", currentRevision], ["다음 예정", nextScheduledRevision]] as const) {
        const line = document.createElement("div");
        line.textContent = projection ? `${label} · V${projection.revision.versionNumber} ${RULE_KEY_METADATA[projection.revision.ruleKey].label} (${projection.effectiveFrom ?? "도입 이전"}부터)` : `${label} · 예약 없음`;
        summary.appendChild(line);
      }
    } catch { if (summary.isConnected) summary.textContent = "정책 조회에 실패했습니다. 이력에서 다시 확인해 주세요."; }
  }));
}
