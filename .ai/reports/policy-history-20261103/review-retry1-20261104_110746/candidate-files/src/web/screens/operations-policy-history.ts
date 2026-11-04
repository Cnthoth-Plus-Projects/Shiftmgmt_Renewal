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
import { OperationsPolicyDialog } from "./operations-policy-dialog";

export class OperationsPolicyHistoryModal {
  private backdropEl: HTMLElement | null = null;
  private dialog: OperationsPolicyDialog;
  private currentPage = 1;
  private currentKind: PolicyKind = "substitute-eligibility";
  private currentView: "revisions" | "events" = "revisions";
  private isBusy = false;
  private generation = 0;
  private currentRequestId = 0;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private triggerElement: HTMLElement | null = null;

  constructor(private bridge: BrowserAppBridge) {
    this.dialog = new OperationsPolicyDialog(bridge);
  }

  async open(kind: PolicyKind, triggerElement?: HTMLElement) {
    this.currentKind = kind;
    this.currentView = "revisions";
    this.currentPage = 1;
    this.triggerElement = triggerElement ?? (document.activeElement as HTMLElement | null);
    await this.render();
  }

  private async render() {
    this.close();

    this.generation++;
    const currentGen = this.generation;

    const backdrop = document.createElement("div");
    backdrop.className = "policy-history-dialog-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const titleId = `policy-history-title-${currentGen}`;
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

    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;

    const closeBtn = backdrop.querySelector(".btn-close-dialog") as HTMLElement;
    closeBtn.addEventListener("click", () => this.close());

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
      this.dialog.open({
        action: "add",
        kind: this.currentKind,
        triggerElement: addNewBtn,
        onSuccess: () => this.fetchAndPopulateTable(),
      });
    });

    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.close();
      }
    };
    window.addEventListener("keydown", this.keydownListener);

    await this.fetchAndPopulateTable();
  }

  private async fetchAndPopulateTable() {
    if (!this.backdropEl || this.isBusy) return;

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
        pageSize: 10,
      });

      if (currentGen !== this.generation || reqId !== this.currentRequestId || !this.backdropEl) {
        return;
      }

      if (!res.ok) {
        throw new Error(res.message || "이력을 불러오지 못했습니다.");
      }

      const data: PolicyHistoryListResult = res.data;

      if (this.currentView === "events") {
        this.renderEventsTable(container, data.events ?? []);
      } else {
        this.renderRevisionsTable(container, (data.revisions ?? []) as Array<
          PolicyRevisionRecord & {
            status: "past" | "active" | "scheduled" | "retired" | "corrected" | "cancelled";
            isUsed: boolean;
            usedCount?: number;
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
      if (currentGen === this.generation && this.backdropEl) {
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
            <th class="policy-th-date">적용 시작일</th>
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

              const ruleLabel =
                item.ruleKey === "substitute-legacy"
                  ? "종전 방식 (일반/교대 구분 없음)"
                  : item.ruleKey === "substitute-team-type-v1"
                    ? "2026.07 개정 (교대근무자 대체 시만)"
                    : item.ruleKey === "changed-worker-legacy"
                      ? "종전 방식 (원 근무자 우선)"
                      : item.ruleKey === "changed-worker-after-v1"
                        ? "2026.07 개정 (실제 근무자 우선)"
                        : item.ruleKey;

              const effectiveText = item.effectiveFrom ? item.effectiveFrom : "최초 기준 (도입)";
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
                  <td><strong>${escapeHtml(ruleLabel)}</strong></td>
                  <td>${escapeHtml(effectiveText)}</td>
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

    // 정정/취소 이벤트 연결
    container.querySelectorAll(".btn-correct-policy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-id")!;
        const ruleKey = (btn.getAttribute("data-rule") || undefined) as PolicyRuleKey | undefined;
        const effectiveFrom = btn.getAttribute("data-date") || undefined;
        this.dialog.open({
          action: "correct",
          kind: this.currentKind,
          targetRevisionId: targetId,
          initialRuleKey: ruleKey,
          initialEffectiveFrom: effectiveFrom,
          triggerElement: btn as HTMLElement,
          onSuccess: () => this.fetchAndPopulateTable(),
        });
      });
    });

    container.querySelectorAll(".btn-cancel-policy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-id")!;
        this.dialog.open({
          action: "cancel",
          kind: this.currentKind,
          targetRevisionId: targetId,
          triggerElement: btn as HTMLElement,
          onSuccess: () => this.fetchAndPopulateTable(),
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
                  <td>${escapeHtml(detailText)}</td>
                  <td>${escapeHtml(evt.actor?.displayName ?? evt.actor?.role ?? "-")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  close() {
    this.generation++;
    this.currentRequestId++;
    this.isBusy = false;

    if (this.keydownListener) {
      window.removeEventListener("keydown", this.keydownListener);
      this.keydownListener = null;
    }

    if (this.backdropEl) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }

    this.dialog.close();

    if (this.triggerElement) {
      this.triggerElement.focus();
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
