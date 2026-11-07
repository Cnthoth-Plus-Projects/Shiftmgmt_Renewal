type ColumnKind = "text" | "name" | "identifier" | "date" | "datetime" | "period" | "number" | "money" | "status" | "actions" | "group";
type ColumnStyle = { kind: ColumnKind; align: "left" | "center" | "right" };

let installed = false;
const ownedTitles = new WeakMap<HTMLTableCellElement, string>();
const originalAlignments = new WeakMap<HTMLTableCellElement, ColumnStyle["align"]>();
const scope = "#main-content table, .workforce-modal-overlay table";
const excluded = ".actual-canvas-board, .layout-preview-paper, .schedule-calendar-layout, .schedule-reading-overlay, .ui-control-popup";

function columnStyle(header: HTMLTableCellElement): ColumnStyle {
  const copy = header.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".material-symbols-outlined, svg, [aria-hidden=true]").forEach(e => e.remove());
  const label = (copy.textContent || "").replace(/\s/g, "");
  if (!originalAlignments.has(header)) {
    const align = getComputedStyle(header).textAlign;
    originalAlignments.set(header, align === "right" || align === "center" ? align : "left");
  }
  if (!label || /^(관리|동작|작업|선택)$/.test(label)) return { kind: "actions", align: "center" };
  if (/^(상세|보기)$/.test(label)) {
    const rows = Array.from(header.closest("table")?.tBodies || []).flatMap(body => Array.from(body.rows));
    const interactive = rows.some(row => row.cells[header.cellIndex]?.querySelector("button, a, input"));
    return { kind: interactive ? "actions" : "text", align: interactive ? "center" : "left" };
  }
  if (/적용기간|대상기간|유효기간|^기간$/.test(label)) return { kind: "period", align: "center" };
  if (/시급|금액|지급액|수당합계|총액/.test(label) || /수당(?:\(원\))?$|(?:합계|총계)\(원\)$/.test(label)) return { kind: "money", align: "right" };
  if (/일시|시각|활동시간|처리시간/.test(label)) return { kind: "datetime", align: "center" };
  if (/일자|날짜|입사일|근무일|적용일|시행일|기준일|발생일|시작일|종료일|대상월|근무월|연도|년도|^월$/.test(label)) return { kind: "date", align: "center" };
  if (/이름|성명|사용자|등록자|처리자|생성자|검토자/.test(label)) return { kind: "name", align: "left" };
  if (/^(No\.?|순위|번호)$/.test(label)) return { kind: "number", align: "center" };
  if (/^(사번|코드|직급|조|현재조|근무조|요일|버전|요율버전|고용형태|근무유형|실적구분|산출구분|서식|구분|판정|권한|상태|게시상태|노출상태)$/.test(label) || /상태$|여부$|^(역할|권한)(?:\(.*\))?$/.test(label)) return { kind: "status", align: "center" };
  if (/인원|인력|건수|사용건수|횟수|조수|파일수|문서수|총분|인정시간|근무시간|근로시간|배율|비율|^시간$/.test(label)) return { kind: "number", align: "center" };
  if (/ID|아이디|식별자/i.test(label)) return { kind: "identifier", align: "left" };
  return { kind: "text", align: originalAlignments.get(header) || "left" };
}

function optimizeTable(table: HTMLTableElement): void {
  if (!table.isConnected || !table.matches(scope) || table.closest(excluded)) return;
  const head = table.tHead;
  // Calendar grids and printed documents retain their own geometry.
  if (!head || head.rows.length !== 1 || head.rows[0].cells.length > 18) return;
  const headers = Array.from(head.rows[0].cells);
  if (headers.some(cell => cell.colSpan > 1 || cell.rowSpan > 1)) return;
  const styles = headers.map(columnStyle);
  table.dataset.tableOptimized = "true";
  table.parentElement?.classList.add("app-table-viewport");
  headers.forEach((cell, index) => {
    cell.dataset.tableKind = styles[index].kind;
    cell.dataset.tableAlign = styles[index].align;
  });
  for (const body of Array.from(table.tBodies)) for (const row of Array.from(body.rows)) {
    const regular = row.cells.length === headers.length && Array.from(row.cells).every(cell => cell.colSpan === 1);
    Array.from(row.cells).forEach((cell, index) => {
      const style: ColumnStyle = regular ? styles[index] : { kind: "group", align: "left" };
      cell.dataset.tableKind = style.kind;
      cell.dataset.tableAlign = style.align;
      if (cell.querySelector("button, input, select, textarea, a, table, [contenteditable=true]")) return;
      for (const br of Array.from(cell.querySelectorAll("br"))) br.replaceWith(document.createTextNode(" "));
      let content = cell.querySelector<HTMLElement>(":scope > .app-table-cell-content");
      if (!content) {
        content = document.createElement("span");
        content.className = "app-table-cell-content";
        content.append(...Array.from(cell.childNodes));
        cell.appendChild(content);
      }
      const text = (content.textContent || "").replace(/\s+/g, " ").trim();
      if (!cell.title || cell.title === ownedTitles.get(cell)) {
        cell.title = text;
        ownedTitles.set(cell, text);
      }
    });
  }
}

/** Presentation only: retain nodes, event handlers, source values and row IDs. */
export function installTableLayout(): void {
  if (installed) return;
  installed = true;
  const pending = new Set<HTMLTableElement>();
  let frame = 0;
  const enqueue = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return;
    const table = element.closest<HTMLTableElement>("table");
    if (table) pending.add(table);
    element.querySelectorAll<HTMLTableElement>("table").forEach(t => pending.add(t));
  };
  const flush = () => {
    frame = 0;
    const tables = [...pending];
    pending.clear();
    tables.forEach(optimizeTable);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      enqueue(record.target);
      record.addedNodes.forEach(enqueue);
    }
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.querySelectorAll<HTMLTableElement>(scope).forEach(optimizeTable);
}
