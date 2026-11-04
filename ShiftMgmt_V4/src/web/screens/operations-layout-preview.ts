// 양식 실제 생성물(PDF/XLSX) 미리보기 제어 모듈 (R12, S15, UI02-D04, UI02-D05)
import type {
  DocumentLayoutDefinition,
  DocumentLayoutPreview,
  DocumentLayoutPreviewOutput
} from "../../shared/domain/document-layout";
import {
  el,
  createButton,
  formatErrorMessage
} from "./operations-ui";

export class OperationsLayoutPreviewViewer {
  private container: HTMLElement;
  private onSessionExpired?: () => void;
  private currentPreview: DocumentLayoutPreview | null = null;
  private activeBlobUrls: string[] = [];
  private selectedMemberId: string | null = null;

  private isDestroyed = false;
  private previewGeneration = 0;
  private loadRequestId = 0;
  private expiresTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, onSessionExpired?: () => void) {
    this.container = container;
    this.onSessionExpired = onSessionExpired;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearExpiresTimer();
    this.revokeAllBlobs();
    this.container.innerHTML = "";
  }

  public invalidate(message?: string): void {
    this.previewGeneration++;
    this.clearExpiresTimer();
    this.revokeAllBlobs();
    this.currentPreview = null;
    this.selectedMemberId = null;

    this.container.innerHTML = "";
    if (message) {
      const notice = el("div", "alert-info preview-invalidated-msg", message);
      this.container.appendChild(notice);
    }
  }

  public revokeAllBlobs(): void {
    this.activeBlobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_e) {
        // 무시
      }
    });
    this.activeBlobUrls = [];
  }

  private clearExpiresTimer(): void {
    if (this.expiresTimer) {
      clearTimeout(this.expiresTimer);
      this.expiresTimer = null;
    }
  }

  public async loadPreview(
    definition: DocumentLayoutDefinition,
    basedOnRevisionId: string | null
  ): Promise<void> {
    if (this.isDestroyed) return;
    if (this.isDestroyed) return;
    const curGen = ++this.previewGeneration;
    const curReq = ++this.loadRequestId;

    this.clearExpiresTimer();
    this.revokeAllBlobs();
    this.container.innerHTML = "";

    const loading = el("div", "loading-spinner", "양식 실제 생성 미리보기를 생성하는 중...");
    this.container.appendChild(loading);

    const bridge = window.appBridge;
    if (!bridge) {
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", "브리지 연결을 찾을 수 없습니다."));
      return;
    }

    try {
      const res = await bridge.previewDocumentLayout({
        definition,
        basedOnRevisionId
      });

      if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) {
        return;
      }

      loading.remove();

      if (!res.ok) {
        if (res.errorCode === "AUTH_SESSION_REQUIRED" || res.errorCode === "SESSION_EXPIRED") {
          this.onSessionExpired?.();
        }
        this.container.appendChild(
          el("div", "alert-danger", formatErrorMessage(res, "미리보기 생성에 실패했습니다."))
        );
        return;
      }

      if (!res.data) {
        this.container.appendChild(el("div", "alert-danger", "미리보기 데이터가 비어 있습니다."));
        return;
      }

      this.currentPreview = res.data;
      if (this.currentPreview.outputs.length > 0) {
        this.selectedMemberId = this.currentPreview.outputs[0].memberId;
      }

      // 모든 출력 중 가장 이른 만료를 기준으로 이미 만료된 결과도 거절한다.
      const expireMs = Math.min(...this.currentPreview.outputs.map(output => Date.parse(output.expiresAt))) - Date.now();
      if (!Number.isFinite(expireMs) || expireMs <= 0) {
        this.invalidate("미리보기가 만료되었습니다. 다시 생성해 주세요.");
        return;
      }
          this.expiresTimer = setTimeout(() => {
            if (!this.isDestroyed && this.previewGeneration === curGen) {
              this.invalidate("미리보기 세션이 만료되었습니다(10분 경과). 다시 '미리보기 갱신'을 눌러주세요.");
            }
          }, expireMs);

      this.render();
    } catch (e) {
      if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) {
        return;
      }
      loading.remove();
      this.container.appendChild(el("div", "alert-danger", `미리보기 요청 오류: ${String(e)}`));
    }
  }

  private render(): void {
    if (!this.currentPreview || this.isDestroyed) return;
    this.container.innerHTML = "";

    const wrap = el("div", "preview-viewer-wrap");

    // 만료 안내 헤더
    const expireMeta = el(
      "div",
      "preview-expire-meta",
      `※ 미리보기 만료 일시: ${this.currentPreview.outputs[0]?.expiresAt || "10분 후"} (만료 후 재갱신 필요)`
    );
    wrap.appendChild(expireMeta);

    // 검증 이슈(경고 등)가 있는 경우 표시
    if (this.currentPreview.validationIssues && this.currentPreview.validationIssues.length > 0) {
      const issueBox = el("div", "alert-warning");
      issueBox.appendChild(el("strong", "", "양식 유효성 경고:"));
      const ul = el("ul", "");
      this.currentPreview.validationIssues.forEach((iss) => {
        ul.appendChild(el("li", "", `[${iss.code}] ${iss.message} (${iss.path})`));
      });
      issueBox.appendChild(ul);
      wrap.appendChild(issueBox);
    }

    // 출력 멤버가 여러 개인 경우 탭 제공 (예: proposal-pdf: main, proposal, attachment1, attachment2)
    if (this.currentPreview.outputs.length > 1) {
      const memberTabs = el("div", "preview-member-tabs");
      this.currentPreview.outputs.forEach((out: DocumentLayoutPreviewOutput) => {
        const btn = createButton(
          `멤버: ${out.memberId}`,
          out.memberId === this.selectedMemberId ? "primary" : "secondary",
          () => {
            this.selectedMemberId = out.memberId;
            this.renderMemberPreview();
          }
        );
        btn.id = `btn-preview-member-${out.memberId}`;
        btn.className = `btn btn-tab ${out.memberId === this.selectedMemberId ? "active" : ""}`;
        memberTabs.appendChild(btn);
      });
      wrap.appendChild(memberTabs);
    }

    // 미리보기 실제 렌더러 영역
    const displayArea = el("div", "preview-display-area");
    displayArea.id = "preview-display-area";
    wrap.appendChild(displayArea);

    this.container.appendChild(wrap);
    this.renderMemberPreview();
  }

  private async renderMemberPreview(): Promise<void> {
    const area = this.container.querySelector<HTMLElement>("#preview-display-area");
    if (!area || !this.currentPreview || this.isDestroyed) return;

    const curGen = this.previewGeneration;
    const curReq = ++this.loadRequestId;

    area.innerHTML = "<div class='loading-spinner'>실제 산출물 바이너리를 수신하여 검증하는 중...</div>";

    const targetOutput =
      this.currentPreview.outputs.find((o) => o.memberId === this.selectedMemberId) ||
      this.currentPreview.outputs[0];

    if (!targetOutput) {
      area.innerHTML = "<div class='alert-warning'>미리보기 대상 출력이 없습니다.</div>";
      return;
    }

    // URL 안전 검증: 같은 출처의 /api/document-layout-previews/ 확인 (UI02-D04)
    if (!targetOutput.previewUrl.startsWith("/api/document-layout-previews/")) {
      area.innerHTML = "<div class='alert-danger'>안전하지 않은 미리보기 경로입니다.</div>";
      return;
    }

    try {
      const resp = await fetch(targetOutput.previewUrl, { credentials: "same-origin" });
      if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) {
        return;
      }

      // HTTP 상태 코드 검증
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          this.onSessionExpired?.();
        }
        area.innerHTML = `<div class='alert-danger'>미리보기 파일을 가져오지 못했습니다 (HTTP ${resp.status}).</div>`;
        return;
      }

      const contentType = (resp.headers.get("content-type") || "").toLowerCase();

      // UI02-D04: application/json 또는 text인 경우 절대 Blob이나 iframe으로 표시하지 않고 에러 처리
      if (contentType.includes("application/json") || contentType.includes("text/")) {
        try {
          const jsonBody = await resp.json();
          if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) return;
          if (jsonBody.errorCode === "AUTH_SESSION_REQUIRED" || jsonBody.errorCode === "SESSION_EXPIRED") {
            this.onSessionExpired?.();
          }
          area.replaceChildren(el("div", "alert-danger", `미리보기 오류 응답: ${jsonBody.message || jsonBody.errorCode || "서버 오류"}`));
        } catch (_jsonErr) {
          if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) return;
          area.innerHTML = "<div class='alert-danger'>미리보기 응답이 올바른 바이너리 형식이 아닙니다 (JSON/텍스트 수신).</div>";
        }
        return;
      }

      const mime = contentType.split(";")[0].trim();
      const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!(["application/pdf", xlsxMime].includes(targetOutput.mediaType)) || mime !== targetOutput.mediaType) {
        area.replaceChildren(el("div", "alert-danger", "미리보기 파일 형식이 요청한 문서 형식과 일치하지 않습니다."));
        return;
      }

      // 바이너리 데이터 수신
      const arrayBuffer = await resp.arrayBuffer();
      if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) {
        return;
      }

      const bytes = new Uint8Array(arrayBuffer);
      const isPdfExpected = targetOutput.mediaType === "application/pdf";

      if (isPdfExpected) {
        // PDF 매직 바이트 검증: %PDF (0x25, 0x50, 0x44, 0x46)
        const isPdfMagic =
          bytes.length >= 4 &&
          bytes[0] === 0x25 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x44 &&
          bytes[3] === 0x46;

        if (!isPdfMagic || !contentType.includes("application/pdf")) {
          area.innerHTML = "<div class='alert-danger'>수신된 파일이 올바른 PDF 바이너리 형식이 아닙니다.</div>";
          return;
        }

        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        this.activeBlobUrls.push(objectUrl);

        area.innerHTML = "";
        const pdfWrap = el("div", "pdf-preview-container");
        const actBar = el("div", "preview-top-actions");
        actBar.appendChild(
          el("span", "badge-pdf", `실제 생성 PDF (${targetOutput.memberId})`)
        );
        const link = el("a", "btn btn-secondary btn-sm", "새 탭에서 PDF 열기") as HTMLAnchorElement;
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.id = `link-open-pdf-${targetOutput.memberId}`;
        actBar.appendChild(link);
        pdfWrap.appendChild(actBar);

        const iframe = el("iframe", "pdf-preview-frame") as HTMLIFrameElement;
        iframe.id = `iframe-preview-${targetOutput.memberId}`;
        iframe.src = objectUrl;
        iframe.style.width = "100%";
        iframe.style.height = "600px";
        iframe.style.border = "1px solid #ccc";
        pdfWrap.appendChild(iframe);

        area.appendChild(pdfWrap);
      } else {
        // XLSX 매직 바이트 검증: PK (0x50, 0x4B, 0x03, 0x04) (ZIP 컨테이너)
        const isZipMagic =
          bytes.length >= 2 &&
          bytes[0] === 0x50 &&
          bytes[1] === 0x4b;

        if (!isZipMagic) {
          area.innerHTML = "<div class='alert-danger'>수신된 파일이 올바른 XLSX 스프레드시트 형식이 아닙니다.</div>";
          return;
        }

        const blob = new Blob([arrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        const objectUrl = URL.createObjectURL(blob);
        this.activeBlobUrls.push(objectUrl);

        area.innerHTML = "";
        const xlsxWrap = el("div", "xlsx-preview-container");
        const card = el("div", "xlsx-info-card");
        card.appendChild(el("h5", "card-title", `실제 생성 XLSX 스프레드시트 (${targetOutput.memberId})`));
        card.appendChild(
          el(
            "p",
            "card-desc",
            `템플릿 정의에 따라 실제 생성된 XLSX 바이너리 파일입니다. 만료 시간(${targetOutput.expiresAt}) 내에 확인하세요.`
          )
        );

        const dlBtn = el("a", "btn btn-primary", "생성된 XLSX 파일 열기 / 다운로드") as HTMLAnchorElement;
        dlBtn.href = objectUrl;
        dlBtn.download = `preview-${targetOutput.memberId}.xlsx`;
        dlBtn.id = `btn-download-xlsx-${targetOutput.memberId}`;
        card.appendChild(dlBtn);

        xlsxWrap.appendChild(card);
        area.appendChild(xlsxWrap);
      }
    } catch (e) {
      if (this.isDestroyed || this.previewGeneration !== curGen || this.loadRequestId !== curReq) {
        return;
      }
      area.replaceChildren(el("div", "alert-danger", `바이너리 다운로드 오류: ${String(e)}`));
    }
  }
}
