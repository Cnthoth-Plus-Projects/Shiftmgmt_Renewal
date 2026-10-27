// 릴리즈 이력 탭 (R09)
import type { ReleaseHistoryListQuery } from "../../shared/bridge/contracts";
import type { ReleaseManifest } from "../../shared/domain/app-update";
import {
  el,
  createFormGroup,
  formatErrorMessage
} from "./operations-ui";
import { DataTable } from "../data-table";

export class OperationsReleasesTab {
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private isDestroyed = false;
  private loadRequestId = 0;
  private releases: ReleaseManifest[] = [];
  private selectedRelease: ReleaseManifest | null = null;
  private table?: DataTable<ReleaseManifest>;
  private detailPanelEl?: HTMLElement;

  private currentQuery: ReleaseHistoryListQuery = {
    keyword: "",
    requiredFilter: "all",
    backupFilter: "all"
  };

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  public async init(): Promise<void> {
    if (this.isDestroyed) return;
    this.container.innerHTML = "";
    await this.loadReleases();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.loadRequestId++;
    this.container.innerHTML = "";
  }

  private async loadReleases(): Promise<void> {
    if (this.isDestroyed) return;
    const reqId = ++this.loadRequestId;
    this.container.innerHTML = "";
    const loading = el("div", "loading-spinner", "릴리즈 이력을 불러오는 중...");
    this.container.appendChild(loading);

    const bridge = window.appBridge;
    if (!bridge) {
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", "브리지 연결을 찾을 수 없습니다."));
      return;
    }

    try {
      const operationGeneration1 = this.loadRequestId;
      if (this.isDestroyed) return;
      const res = await bridge.listReleaseHistory(this.currentQuery);
      if (this.isDestroyed || this.loadRequestId !== operationGeneration1) return;
      if (!res.ok && res.errorCode === "AUTH_SESSION_REQUIRED") { this.onSessionExpired?.(); return; }
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();

      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "릴리즈 이력을 불러오지 못했습니다."))
        );
        return;
      }

      if (!res.data) return;

      this.releases = res.data;
      if (!this.selectedRelease && this.releases.length > 0) {
        this.selectedRelease = this.releases[0];
      }
      this.render();
    } catch (e) {
      if (this.isDestroyed) return;
      if (this.isDestroyed || this.loadRequestId !== reqId) return;
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `릴리즈 이력 조회 오류: ${String(e)}`));
    }
  }

  private render(): void {
    this.container.innerHTML = "";
    const wrap = el("div", "operations-releases-wrap");

    // 1. 헤더 및 필터 바
    const header = el("div", "tab-header");
    header.appendChild(el("h3", "tab-title", "시스템 릴리즈 이력 (읽기 전용)"));
    wrap.appendChild(header);

    const filterBar = el("div", "releases-filter-bar");

    const keywordInput = el("input", "form-control filter-keyword") as HTMLInputElement;
    keywordInput.placeholder = "버전 또는 제목 검색...";
    keywordInput.value = this.currentQuery.keyword || "";
    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.currentQuery.keyword = keywordInput.value.trim();
        this.loadReleases();
      }
    });
    filterBar.appendChild(createFormGroup("검색어", keywordInput));

    const reqSelect = el("select", "form-control") as HTMLSelectElement;
    [
      { val: "all", label: "전체 필수여부" },
      { val: "required", label: "필수 릴리즈만" },
      { val: "optional", label: "선택 릴리즈만" }
    ].forEach((opt) => {
      const option = el("option", "", opt.label) as HTMLOptionElement;
      option.value = opt.val;
      if (this.currentQuery.requiredFilter === opt.val) option.selected = true;
      reqSelect.appendChild(option);
    });
    reqSelect.addEventListener("change", () => {
      this.currentQuery.requiredFilter = reqSelect.value as "all" | "required" | "optional";
      this.loadReleases();
    });
    filterBar.appendChild(createFormGroup("필수 구분", reqSelect));

    const backupSelect = el("select", "form-control") as HTMLSelectElement;
    [
      { val: "all", label: "전체 백업여부" },
      { val: "required", label: "DB 백업 필수" },
      { val: "not-required", label: "DB 백업 불필요" }
    ].forEach((opt) => {
      const option = el("option", "", opt.label) as HTMLOptionElement;
      option.value = opt.val;
      if (this.currentQuery.backupFilter === opt.val) option.selected = true;
      backupSelect.appendChild(option);
    });
    backupSelect.addEventListener("change", () => {
      this.currentQuery.backupFilter = backupSelect.value as "all" | "required" | "not-required";
      this.loadReleases();
    });
    filterBar.appendChild(createFormGroup("DB 백업 여부", backupSelect));

    wrap.appendChild(filterBar);

    // 2. 메인 컨텐츠 영역 (좌측: 목록, 우측: 상세 380px)
    const contentRow = el("div", "releases-content-layout");

    const listCol = el("div", "releases-list-col");
    this.table = new DataTable<ReleaseManifest>({
      container: listCol,
      pageSize: 10,
      getRowId: (r) => r.version,
      onRowSelect: (r) => {
        this.selectedRelease = r;
        this.renderDetail();
      },
      columns: [
        { key: "version", label: "버전", sticky: true, sortable: true },
        {
          key: "headline",
          label: "릴리즈 주요 내용",
          render: (r) => {
            const span = el("span", "release-headline-text");
            span.textContent = r.headline;
            return span;
          }
        },
        {
          key: "required",
          label: "구분",
          align: "center",
          render: (r) => (r.required ? el("span", "badge-required", "필수") : el("span", "badge-optional", "일반"))
        },
        {
          key: "requiresDbBackup",
          label: "DB백업",
          align: "center",
          render: (r) => (r.requiresDbBackup ? el("span", "badge-backup-req", "필요") : el("span", "text-muted", "-"))
        },
        { key: "publishedAt", label: "배포일시", sortable: true }
      ]
    });
    this.table.setData(this.releases);
    if (this.selectedRelease) {
      this.table.setSelectedId(this.selectedRelease.version);
    }
    contentRow.appendChild(listCol);

    // 상세 패널
    const detailCol = el("div", "releases-detail-col");
    this.detailPanelEl = detailCol;
    contentRow.appendChild(detailCol);

    wrap.appendChild(contentRow);
    this.container.appendChild(wrap);

    this.renderDetail();
  }

  private renderDetail(): void {
    if (!this.detailPanelEl) return;
    this.detailPanelEl.innerHTML = "";

    if (!this.selectedRelease) {
      this.detailPanelEl.appendChild(el("div", "detail-empty", "릴리즈를 선택하면 상세 정보가 표시됩니다."));
      return;
    }

    const rel = this.selectedRelease;
    const card = el("div", "release-detail-card");

    const top = el("div", "detail-card-header");
    top.appendChild(el("h4", "release-version-title", `버전 ${rel.version}`));
    const badges = el("div", "detail-badges");
    if (rel.required) badges.appendChild(el("span", "badge-required", "필수 업데이트"));
    if (rel.requiresDbBackup) badges.appendChild(el("span", "badge-backup-req", "DB 백업 필수"));
    top.appendChild(badges);
    card.appendChild(top);

    card.appendChild(el("div", "release-published-date", `배포 일시: ${rel.publishedAt}`));

    const headBox = el("div", "detail-section");
    headBox.appendChild(el("h5", "section-sub", "주요 개요"));
    const pHead = el("p", "headline-p");
    pHead.textContent = rel.headline;
    headBox.appendChild(pHead);
    if (rel.summary) {
      const pSum = el("p", "summary-p text-muted");
      pSum.textContent = rel.summary;
      headBox.appendChild(pSum);
    }
    card.appendChild(headBox);

    if (rel.notes && rel.notes.length > 0) {
      const notesBox = el("div", "detail-section");
      notesBox.appendChild(el("h5", "section-sub", "릴리즈 노트"));
      const ul = el("ul", "release-notes-list");
      rel.notes.forEach((n) => {
        const li = el("li", "");
        li.textContent = n;
        ul.appendChild(li);
      });
      notesBox.appendChild(ul);
      card.appendChild(notesBox);
    }

    if (rel.sections && rel.sections.length > 0) {
      rel.sections.forEach((sec) => {
        const secBox = el("div", "detail-section");
        secBox.appendChild(el("h5", "section-sub", sec.title));
        if (sec.description) {
          const p = el("p", "text-muted");
          p.textContent = sec.description;
          secBox.appendChild(p);
        }
        if (sec.items && sec.items.length > 0) {
          const ul = el("ul", "section-items-list");
          sec.items.forEach((item) => {
            const li = el("li", "");
            li.textContent = item.title + (item.detail ? ` - ${item.detail}` : "");
            ul.appendChild(li);
          });
          secBox.appendChild(ul);
        }
        if (sec.tables && sec.tables.length > 0) {
          sec.tables.forEach((tbl) => {
            if (tbl.title) secBox.appendChild(el("h6", "table-title", tbl.title));
            const t = el("table", "table table-sm release-custom-table");
            const thRow = el("tr", "");
            tbl.columns.forEach((c) => thRow.appendChild(el("th", "", c)));
            t.appendChild(el("thead", "")).appendChild(thRow);
            const tb = el("tbody", "");
            tbl.rows.forEach((row) => {
              const tr = el("tr", "");
              row.forEach((cell) => {
                const td = el("td", "");
                td.textContent = cell;
                tr.appendChild(td);
              });
              tb.appendChild(tr);
            });
            t.appendChild(tb);
            secBox.appendChild(t);
          });
        }
        card.appendChild(secBox);
      });
    }

    this.detailPanelEl.appendChild(card);
  }
}
