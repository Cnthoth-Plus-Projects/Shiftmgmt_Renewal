import type { BrowserAppBridge } from "../bridge/app-bridge";
import type { PolicyHistoryListResult } from "../../shared/bridge/contracts";
import type {
  PolicyKind,
  PolicyRevisionRecord,
  PolicyRuleKey,
} from "../../shared/domain/policy-history";
import { OperationsPolicyDialog } from "./operations-policy-dialog";

export class OperationsPolicyHistoryModal {
  private backdropEl: HTMLElement | null = null;
  private dialog: OperationsPolicyDialog;
  private currentPage = 1;
  private currentKind: PolicyKind = "substitute-eligibility";
  private isBusy = false;

  constructor(private bridge: BrowserAppBridge) {
    this.dialog = new OperationsPolicyDialog(bridge);
  }

  async open(kind: PolicyKind) {
    this.currentKind = kind;
    this.currentPage = 1;
    await this.render();
  }

  private async render() {
    this.close();

    const backdrop = document.createElement("div");
    backdrop.className = "policy-history-dialog-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const kindTitle =
      this.currentKind === "substitute-eligibility"
        ? "대체근무수당 지급 대상 정책 이력"
        : "실제 근무자 우선순위 정책 이력";

    backdrop.innerHTML = `
      <div class="policy-history-dialog">
        <div class="policy-dialog-header">
          <h2 class="policy-dialog-title">${kindTitle}</h2>
          <div class="policy-dialog-header-right">
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

    const addNewBtn = backdrop.querySelector("#btn-add-new-policy") as HTMLElement;
    addNewBtn.addEventListener("click", () => {
      this.dialog.open({
        action: "add",
        kind: this.currentKind,
        onSuccess: () => this.fetchAndPopulateTable(),
      });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    await this.fetchAndPopulateTable();
  }

  private async fetchAndPopulateTable() {
    if (!this.backdropEl || this.isBusy) return;
    this.isBusy = true;

    const container = this.backdropEl.querySelector("#policy-history-table-container") as HTMLElement;
    const pagination = this.backdropEl.querySelector("#policy-history-pagination") as HTMLElement;

    try {
      const res = await this.bridge.listPolicyHistory({
        kind: this.currentKind,
        view: "revisions",
        page: this.currentPage,
        pageSize: 10,
      });

      if (!res.ok) {
        throw new Error(res.message || "이력을 불러오지 못했습니다.");
      }

      const data: PolicyHistoryListResult = res.data;
      const items = (data.revisions ?? []) as Array<
        PolicyRevisionRecord & {
          status: "past" | "active" | "scheduled" | "cancelled";
          isUsed: boolean;
        }
      >;

      if (items.length === 0) {
        container.innerHTML = `<div class="policy-empty-box">등록된 정책 이력이 없습니다.</div>`;
        pagination.innerHTML = "";
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
                const statusClass =
                  item.status === "active"
                    ? "policy-status-active"
                    : item.status === "scheduled"
                      ? "policy-status-scheduled"
                      : item.status === "past"
                        ? "policy-status-past"
                        : "policy-status-cancelled";

                const statusLabel =
                  item.status === "active"
                    ? "현재 활성"
                    : item.status === "scheduled"
                      ? "적용 예정"
                      : item.status === "past"
                        ? "과거 종료"
                        : "취소됨";

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

                const effectiveText = item.effectiveFrom ? item.effectiveFrom : "최초 기준";
                const createdDateText = item.createdAt ? item.createdAt.substring(0, 16).replace("T", " ") : "-";

                // 정정/취소는 예정 정책(scheduled)이면서 used가 없고 origin !== 'initial'일 때만 활성화
                const canModify = item.status === "scheduled" && !item.isUsed && item.origin !== "initial";

                return `
                  <tr>
                    <td><span class="policy-version-badge">V${item.versionNumber}</span></td>
                    <td><span class="policy-status-badge ${statusClass}">${statusLabel}</span></td>
                    <td><strong>${escapeHtml(ruleLabel)}</strong></td>
                    <td>${escapeHtml(effectiveText)}</td>
                    <td class="policy-cell-reason" title="${escapeHtml(item.reason ?? "")}">${escapeHtml(item.reason ?? "-")}</td>
                    <td>${escapeHtml(item.actor?.displayName ?? item.actor?.role ?? "-")}</td>
                    <td>${escapeHtml(createdDateText)}</td>
                    <td class="policy-cell-action">
                      ${
                        canModify
                          ? `
                        <button type="button" class="btn-correct-policy policy-btn-sm" data-id="${item.id}" data-rule="${item.ruleKey}" data-date="${item.effectiveFrom ?? ""}">정정</button>
                        <button type="button" class="btn-cancel-policy policy-btn-cancel-sm" data-id="${item.id}">취소</button>
                      `
                          : `<span class="policy-action-lock">변경 잠금</span>`
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
            onSuccess: () => this.fetchAndPopulateTable(),
          });
        });
      });

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
      container.innerHTML = `<div class="policy-error-box">오류: ${(err as Error).message}</div>`;
    } finally {
      this.isBusy = false;
    }
  }

  close() {
    if (this.backdropEl) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }
    this.dialog.close();
    this.isBusy = false;
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
