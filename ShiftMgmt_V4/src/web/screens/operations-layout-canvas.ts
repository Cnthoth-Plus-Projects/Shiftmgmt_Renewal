// 양식 편집 캔버스 및 속성 제어 모듈 (R11, S14, N07, UI02-D07)
import type {
  DocumentLayoutDefinition,
  DocumentLayoutOutputMember,
  DocumentLayoutBlock,
  DocumentLayoutCapabilities,
  DocumentLayoutBlockCapability
} from "../../shared/domain/document-layout";
import {
  el,
  createButton,
  createFormGroup
} from "./operations-ui";

export interface LayoutCanvasOptions {
  container: HTMLElement;
  definition: DocumentLayoutDefinition;
  capabilities: DocumentLayoutCapabilities;
  onDraftChange: () => void;
}

export class OperationsLayoutCanvas {
  private container: HTMLElement;
  private definition: DocumentLayoutDefinition;
  private capabilities: DocumentLayoutCapabilities;
  private onDraftChange: () => void;

  private currentMemberIndex = 0;
  private selectedBlockId: string | null = null;

  private canvasWrapEl?: HTMLElement;
  private propPanelEl?: HTMLElement;
  private blockListEl?: HTMLElement;

  // 드래그 상태 관리
  private isDragging = false;
  private dragBlockId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private blockOrigX = 0;
  private blockOrigY = 0;
  private currentScale = 1;

  constructor(options: LayoutCanvasOptions) {
    this.container = options.container;
    this.definition = options.definition;
    this.capabilities = options.capabilities;
    this.onDraftChange = options.onDraftChange;

    const currentMember = this.definition.outputs[0];
    if (currentMember?.blocks.length > 0) {
      this.selectedBlockId = currentMember.blocks[0].id;
    }
  }

  public setDefinition(def: DocumentLayoutDefinition, cap: DocumentLayoutCapabilities): void {
    this.definition = def;
    this.capabilities = cap;
    this.currentMemberIndex = 0;
    const currentMember = this.definition.outputs[0];
    this.selectedBlockId = currentMember?.blocks[0]?.id || null;
    this.render();
  }

  public render(): void {
    this.container.innerHTML = "";
    const wrap = el("div", "layout-editor-canvas-wrap");

    // 1. 출력 멤버 탭 (선택: main, proposal, attachment1, attachment2 등)
    if (this.definition.outputs.length > 1) {
      const memberTabs = el("div", "member-tabs-bar");
      this.definition.outputs.forEach((m: DocumentLayoutOutputMember, idx: number) => {
        const btn = createButton(
          m.memberId,
          idx === this.currentMemberIndex ? "primary" : "secondary",
          () => {
            this.currentMemberIndex = idx;
            this.selectedBlockId = m.blocks[0]?.id || null;
            this.render();
          }
        );
        btn.id = `btn-canvas-member-${m.memberId}`;
        btn.className = `btn btn-tab ${idx === this.currentMemberIndex ? "active" : ""}`;
        memberTabs.appendChild(btn);
      });
      wrap.appendChild(memberTabs);
    }

    // 2. 3단 구성 레이아웃: [좌측 블록 목록] | [중앙 캔버스] | [우측 블록 속성]
    const mainGrid = el("div", "canvas-layout-grid");

    // 좌측: 블록 목록
    const leftCol = el("div", "canvas-col-left");
    leftCol.appendChild(el("h5", "col-title", "문서 구성 블록"));
    const blockList = el("div", "block-list-items");
    this.blockListEl = blockList;
    leftCol.appendChild(blockList);
    mainGrid.appendChild(leftCol);

    // 중앙: 캔버스 뷰
    const centerCol = el("div", "canvas-col-center");
    centerCol.appendChild(el("h5", "col-title", "배치 캔버스 (동일 종횡비 비율)"));
    const canvasWrap = el("div", "canvas-viewport");
    this.canvasWrapEl = canvasWrap;
    centerCol.appendChild(canvasWrap);
    mainGrid.appendChild(centerCol);

    // 우측: 속성 패널
    const rightCol = el("div", "canvas-col-right");
    rightCol.appendChild(el("h5", "col-title", "블록 상세 속성"));
    const propPanel = el("div", "property-panel-content");
    this.propPanelEl = propPanel;
    rightCol.appendChild(propPanel);
    mainGrid.appendChild(rightCol);

    wrap.appendChild(mainGrid);
    this.container.appendChild(wrap);

    this.renderBlockList();
    this.renderCanvas();
    this.renderProperties();
  }

  private getCurrentMember(): DocumentLayoutOutputMember {
    return this.definition.outputs[this.currentMemberIndex] || this.definition.outputs[0];
  }

  private getSelectedBlock(): DocumentLayoutBlock | null {
    const member = this.getCurrentMember();
    return member.blocks.find((b: DocumentLayoutBlock) => b.id === this.selectedBlockId) || null;
  }

  private getBlockCapability(blockId: string): DocumentLayoutBlockCapability | null {
    return (
      this.capabilities.blockCapabilities.find((bc: DocumentLayoutBlockCapability) => bc.blockId === blockId) || null
    );
  }

  private renderBlockList(): void {
    if (!this.blockListEl) return;
    this.blockListEl.innerHTML = "";

    const member = this.getCurrentMember();
    member.blocks.forEach((block: DocumentLayoutBlock) => {
      const item = el(
        "div",
        `block-item-btn ${block.id === this.selectedBlockId ? "selected" : ""}`
      );
      item.id = `block-item-${block.id}`;
      item.textContent = `${block.kind} (${block.id})`;
      item.addEventListener("click", () => {
        this.selectedBlockId = block.id;
        this.renderBlockList();
        this.renderCanvas();
        this.renderProperties();
      });
      this.blockListEl?.appendChild(item);
    });
  }

  private renderCanvas(focusSelectedBlock = false): void {
    if (!this.canvasWrapEl) return;
    this.canvasWrapEl.innerHTML = "";

    const member = this.getCurrentMember();
    const canvasDef = member.canvas;

    const canvasDom = el("div", "actual-canvas-board");
    canvasDom.style.position = "relative";
    canvasDom.style.backgroundColor = "#ffffff";
    canvasDom.style.border = "1px solid #c5cbd3";
    canvasDom.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
    canvasDom.style.margin = "0 auto";

    // UI02-D07: 종횡비 균일 scale (Uniform Scale) 적용
    const canvasWidth = canvasDef.width || 100;
    const canvasHeight = canvasDef.height || 100;
    const maxViewportW = 420;
    const maxViewportH = 560;

    const scale = Math.min(maxViewportW / canvasWidth, maxViewportH / canvasHeight);
    this.currentScale = scale;

    const renderedW = Math.round(canvasWidth * scale);
    const renderedH = Math.round(canvasHeight * scale);
    canvasDom.style.width = `${renderedW}px`;
    canvasDom.style.height = `${renderedH}px`;

    let activeBlockElement: HTMLElement | null = null;

    member.blocks.forEach((block: DocumentLayoutBlock) => {
      if (!block.visible) return;

      const isSelected = block.id === this.selectedBlockId;
      const blockEl = el("div", `canvas-block-node ${isSelected ? "active" : ""}`);
      blockEl.setAttribute("data-block-id", block.id);
      blockEl.id = `canvas-node-${block.id}`;
      blockEl.style.position = "absolute";
      blockEl.style.left = `${Math.round(block.x * scale)}px`;
      blockEl.style.top = `${Math.round(block.y * scale)}px`;
      blockEl.style.width = `${Math.max(1, Math.round(block.width * scale))}px`;
      blockEl.style.height = `${Math.max(1, Math.round(block.height * scale))}px`;
      blockEl.style.zIndex = isSelected ? "2" : "1";
      blockEl.style.boxSizing = "border-box";
      blockEl.style.overflow = "hidden";
      blockEl.style.cursor = "pointer";
      blockEl.style.userSelect = "none";

      if (block.font) {
        if (block.font.bold) blockEl.style.fontWeight = "bold";
        if (block.font.italic) blockEl.style.fontStyle = "italic";
        if (block.font.family) blockEl.style.fontFamily = block.font.family;
      }

      blockEl.textContent = block.text || block.kind;

      if (isSelected) {
        activeBlockElement = blockEl;
      }

      // 클릭 시 선택
      blockEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectedBlockId = block.id;
        this.renderBlockList();
        this.renderCanvas();
        this.renderProperties();
      });

      // UI02-D07: 포인터 드래그 이벤트 (pointerdown, pointermove, pointerup, setPointerCapture)
      const cap = this.getBlockCapability(block.id);
      const canMove = cap?.editableProperties.includes("position");

      if (canMove) {
        blockEl.style.cursor = "move";
        blockEl.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          this.isDragging = true;
          this.dragBlockId = block.id;
          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
          this.blockOrigX = block.x;
          this.blockOrigY = block.y;
          this.selectedBlockId = block.id;

          blockEl.setPointerCapture(e.pointerId);
          blockEl.classList.add("dragging");
        });

        blockEl.addEventListener("pointermove", (e) => {
          if (!this.isDragging || this.dragBlockId !== block.id) return;
          e.stopPropagation();
          const deltaX = (e.clientX - this.dragStartX) / this.currentScale;
          const deltaY = (e.clientY - this.dragStartY) / this.currentScale;

          block.x = Math.max(0, Math.round(this.blockOrigX + deltaX));
          block.y = Math.max(0, Math.round(this.blockOrigY + deltaY));

          blockEl.style.left = `${Math.round(block.x * this.currentScale)}px`;
          blockEl.style.top = `${Math.round(block.y * this.currentScale)}px`;
        });

        const finishDrag = (e: PointerEvent) => {
          if (!this.isDragging || this.dragBlockId !== block.id) return;
          e.stopPropagation();
          this.isDragging = false;
          this.dragBlockId = null;
          blockEl.classList.remove("dragging");
          try {
            blockEl.releasePointerCapture(e.pointerId);
          } catch (_err) {
            // 무시
          }
          this.onDraftChange();
          this.renderCanvas();
          this.renderProperties();
        };

        blockEl.addEventListener("pointerup", finishDrag);
        blockEl.addEventListener("pointercancel", finishDrag);
      }

      // UI02-D07: 키보드 연속 이동 지원 및 포커스 복원
      blockEl.tabIndex = 0;
      blockEl.addEventListener("keydown", (e) => {
        if (!canMove) return;

        let deltaX = 0;
        let deltaY = 0;
        if (e.key === "ArrowLeft") deltaX = -1;
        if (e.key === "ArrowRight") deltaX = 1;
        if (e.key === "ArrowUp") deltaY = -1;
        if (e.key === "ArrowDown") deltaY = 1;

        if (deltaX !== 0 || deltaY !== 0) {
          e.preventDefault();
          this.selectedBlockId = block.id;
          this.renderBlockList();
          block.x = Math.max(0, block.x + deltaX);
          block.y = Math.max(0, block.y + deltaY);
          this.onDraftChange();
          // 포커스를 유지한 채 캔버스 및 속성 패널 재렌더링
          this.renderCanvas(true);
          this.renderProperties();
        }
      });

      canvasDom.appendChild(blockEl);
    });

    this.canvasWrapEl.appendChild(canvasDom);

    // 연속 키보드 이동을 위해 포커스 복원 (UI02-D07)
    if (focusSelectedBlock && activeBlockElement) {
      (activeBlockElement as HTMLElement).focus();
    }
  }

  private renderProperties(): void {
    if (!this.propPanelEl) return;
    this.propPanelEl.innerHTML = "";

    const block = this.getSelectedBlock();
    if (!block) {
      this.propPanelEl.appendChild(el("p", "text-muted", "선택된 블록이 없습니다."));
      return;
    }

    const cap = this.getBlockCapability(block.id);
    const editables = cap?.editableProperties || [];

    const form = el("div", "prop-form");

    // 기본 정보 (읽기 전용)
    const idInput = el("input", "form-control") as HTMLInputElement;
    idInput.value = block.id;
    idInput.readOnly = true;
    form.appendChild(createFormGroup("블록 ID", idInput));

    const kindInput = el("input", "form-control") as HTMLInputElement;
    kindInput.value = block.kind;
    kindInput.readOnly = true;
    form.appendChild(createFormGroup("블록 종류", kindInput));

    // 바인딩 키 (보호 속성)
    if (block.bindingKey) {
      const bindInput = el("input", "form-control") as HTMLInputElement;
      bindInput.value = block.bindingKey;
      bindInput.readOnly = true;
      form.appendChild(createFormGroup("데이터 바인딩 키", bindInput));
    }

    // 1. 위치 (X, Y)
    const posEditable = editables.includes("position");
    const posRow = el("div", "form-row-2");
    const xInput = el("input", "form-control") as HTMLInputElement;
    xInput.type = "number";
    xInput.id = "input-prop-x";
    xInput.value = String(block.x);
    xInput.disabled = !posEditable;
    xInput.addEventListener("input", () => {
      block.x = parseFloat(xInput.value) || 0;
      this.onDraftChange();
      this.renderCanvas();
    });
    posRow.appendChild(createFormGroup("X 좌표", xInput));

    const yInput = el("input", "form-control") as HTMLInputElement;
    yInput.type = "number";
    yInput.id = "input-prop-y";
    yInput.value = String(block.y);
    yInput.disabled = !posEditable;
    yInput.addEventListener("input", () => {
      block.y = parseFloat(yInput.value) || 0;
      this.onDraftChange();
      this.renderCanvas();
    });
    posRow.appendChild(createFormGroup("Y 좌표", yInput));
    form.appendChild(posRow);
    if (!posEditable) {
      form.appendChild(el("div", "field-protected-reason", "🔒 위치 속성은 서식 규칙에 따라 고정되어 있습니다."));
    }

    // 2. 크기 (Width, Height)
    const sizeEditable = editables.includes("size");
    const sizeRow = el("div", "form-row-2");
    const wInput = el("input", "form-control") as HTMLInputElement;
    wInput.type = "number";
    wInput.id = "input-prop-width";
    wInput.value = String(block.width);
    wInput.disabled = !sizeEditable;
    wInput.addEventListener("input", () => {
      block.width = parseFloat(wInput.value) || 0;
      this.onDraftChange();
      this.renderCanvas();
    });
    sizeRow.appendChild(createFormGroup("너비 (Width)", wInput));

    const hInput = el("input", "form-control") as HTMLInputElement;
    hInput.type = "number";
    hInput.id = "input-prop-height";
    hInput.value = String(block.height);
    hInput.disabled = !sizeEditable;
    hInput.addEventListener("input", () => {
      block.height = parseFloat(hInput.value) || 0;
      this.onDraftChange();
      this.renderCanvas();
    });
    sizeRow.appendChild(createFormGroup("높이 (Height)", hInput));
    form.appendChild(sizeRow);
    if (!sizeEditable) {
      form.appendChild(el("div", "field-protected-reason", "🔒 크기 속성은 서식 규칙에 따라 고정되어 있습니다."));
    }

    // 3. 노출 여부 (Visibility)
    const visEditable = editables.includes("visibility");
    const visWrap = el("div", "checkbox-wrap");
    const visCheck = el("input", "form-checkbox") as HTMLInputElement;
    visCheck.type = "checkbox";
    visCheck.id = "input-prop-visible";
    visCheck.checked = block.visible;
    visCheck.disabled = !visEditable;
    visCheck.addEventListener("change", () => {
      block.visible = visCheck.checked;
      this.onDraftChange();
      this.renderCanvas();
    });
    visWrap.appendChild(visCheck);
    visWrap.appendChild(el("label", "checkbox-label", "화면에 표시 (Visible)"));
    form.appendChild(createFormGroup("노출 상태", visWrap));

    // 4. 텍스트 (Text)
    const textEditable = editables.includes("text");
    const textInput = el("input", "form-control") as HTMLInputElement;
    textInput.id = "input-prop-text";
    textInput.value = block.text || "";
    textInput.disabled = !textEditable;
    textInput.addEventListener("input", () => {
      block.text = textInput.value;
      this.onDraftChange();
      this.renderCanvas();
    });
    form.appendChild(createFormGroup("블록 텍스트", textInput));

    // 5. 로고 선택 (Logo - brand-logo / null)
    const logoEditable = editables.includes("logo");
    if (logoEditable || block.logoAssetId !== undefined) {
      const logoSelect = el("select", "form-control") as HTMLSelectElement;
      logoSelect.id = "select-prop-logo";
      logoSelect.disabled = !logoEditable;

      const optNull = el("option", "", "로고 없음 (None)") as HTMLOptionElement;
      optNull.value = "";
      if (!block.logoAssetId) optNull.selected = true;
      logoSelect.appendChild(optNull);

      const optBrand = el("option", "", "브랜드 로고 (brand-logo)") as HTMLOptionElement;
      optBrand.value = "brand-logo";
      if (block.logoAssetId === "brand-logo") optBrand.selected = true;
      logoSelect.appendChild(optBrand);

      logoSelect.addEventListener("change", () => {
        block.logoAssetId = logoSelect.value === "brand-logo" ? "brand-logo" : null;
        this.onDraftChange();
        this.renderCanvas();
      });
      form.appendChild(createFormGroup("로고 에셋 선택", logoSelect, "기존 등록된 브랜드 로고만 선택 가능합니다."));
    }

    // 6. UI02-D07: 글꼴 (Font) 편집 속성
    const fontEditable = editables.includes("font");
    if (fontEditable || block.font) {
      const fontBox = el("div", "font-properties-box");
      fontBox.appendChild(el("strong", "box-subtitle", "글꼴 서식 (Font)"));

      const fontRow = el("div", "form-row-2");
      const famInput = el("input", "form-control") as HTMLInputElement;
      famInput.id = "input-prop-font-family";
      famInput.value = block.font?.family || "Malgun Gothic";
      famInput.disabled = !fontEditable;
      famInput.addEventListener("input", () => {
        if (!block.font) block.font = { family: "Malgun Gothic", sizePt: 10 };
        block.font.family = famInput.value.trim();
        this.onDraftChange();
        this.renderCanvas();
      });
      fontRow.appendChild(createFormGroup("글꼴 패밀리", famInput));

      const sizeInput = el("input", "form-control") as HTMLInputElement;
      sizeInput.type = "number";
      sizeInput.id = "input-prop-font-size";
      sizeInput.value = String(block.font?.sizePt ?? 10);
      sizeInput.disabled = !fontEditable;
      sizeInput.addEventListener("input", () => {
        if (!block.font) block.font = { family: "Malgun Gothic", sizePt: 10 };
        block.font.sizePt = parseFloat(sizeInput.value) || 10;
        this.onDraftChange();
        this.renderCanvas();
      });
      fontRow.appendChild(createFormGroup("크기 (pt)", sizeInput));
      fontBox.appendChild(fontRow);

      const styleRow = el("div", "form-row-2");
      const boldWrap = el("div", "checkbox-wrap");
      const boldCheck = el("input", "form-checkbox") as HTMLInputElement;
      boldCheck.type = "checkbox";
      boldCheck.id = "input-prop-font-bold";
      boldCheck.checked = Boolean(block.font?.bold);
      boldCheck.disabled = !fontEditable;
      boldCheck.addEventListener("change", () => {
        if (!block.font) block.font = { family: "Malgun Gothic", sizePt: 10 };
        block.font.bold = boldCheck.checked;
        this.onDraftChange();
        this.renderCanvas();
      });
      boldWrap.appendChild(boldCheck);
      boldWrap.appendChild(el("label", "checkbox-label", "굵게 (Bold)"));
      styleRow.appendChild(createFormGroup("굵기", boldWrap));

      const italicWrap = el("div", "checkbox-wrap");
      const italicCheck = el("input", "form-checkbox") as HTMLInputElement;
      italicCheck.type = "checkbox";
      italicCheck.id = "input-prop-font-italic";
      italicCheck.checked = Boolean(block.font?.italic);
      italicCheck.disabled = !fontEditable;
      italicCheck.addEventListener("change", () => {
        if (!block.font) block.font = { family: "Malgun Gothic", sizePt: 10 };
        block.font.italic = italicCheck.checked;
        this.onDraftChange();
        this.renderCanvas();
      });
      italicWrap.appendChild(italicCheck);
      italicWrap.appendChild(el("label", "checkbox-label", "기울임 (Italic)"));
      styleRow.appendChild(createFormGroup("기울임꼴", italicWrap));
      fontBox.appendChild(styleRow);

      form.appendChild(fontBox);
    }

    // 7. UI02-D07: 열 너비 (Column-Width) 편집 속성
    const colWidthEditable = editables.includes("column-width");
    if (colWidthEditable || block.columnWidths) {
      const colWrap = el("div", "column-width-box");
      colWrap.appendChild(el("strong", "box-subtitle", "열 너비 (Column Widths)"));
      const colInput = el("input", "form-control") as HTMLInputElement;
      colInput.id = "input-prop-column-widths";
      colInput.disabled = !colWidthEditable;
      colInput.value = block.columnWidths ? JSON.stringify(block.columnWidths) : "{}";
      colInput.addEventListener("input", () => {
        try {
          block.columnWidths = JSON.parse(colInput.value.trim());
          this.onDraftChange();
          this.renderCanvas();
        } catch (_err) {
          // JSON 파싱 실패 시 대기
        }
      });
      colWrap.appendChild(
        createFormGroup("컬럼 너비 JSON", colInput, '예: {"col1": 120, "col2": 80}')
      );
      form.appendChild(colWrap);
    }

    // 8. 잠긴 보호 속성 안내 (row-order, binding, row-height, merge)
    const protectedSec = el("div", "protected-attributes-notice");
    protectedSec.appendChild(
      el(
        "div",
        "field-protected-reason",
        "🔒 행 순서(row-order), 행 높이(row-height), 셀 병합(merge), 데이터 바인딩 구조는 문서 정본 서식 규칙에 따라 읽기 전용으로 보호됩니다."
      )
    );
    form.appendChild(protectedSec);

    this.propPanelEl.appendChild(form);
  }
}
