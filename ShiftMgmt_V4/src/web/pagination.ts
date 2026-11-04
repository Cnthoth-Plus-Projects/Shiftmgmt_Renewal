export type PaginationItem = number | "ellipsis";
export interface PageRange { start: number; end: number }

/** Reserve group headings as well as complete data rows; collapsed groups keep stable pages. */
export function paginateGroupsForHeight<T>(items: readonly T[], bodyHeight: number, rowHeight: number, groupHeight: number, key: (item: T) => string): PageRange[] {
  if (!items.length) return [{ start: 0, end: 0 }];
  if (bodyHeight <= 0) return Array.from({ length: Math.ceil(items.length / 10) }, (_, i) => ({ start: i * 10, end: Math.min((i + 1) * 10, items.length) }));
  const pages: PageRange[] = [];
  let start = 0, used = 0, previous = "";
  for (let i = 0; i < items.length; i++) {
    const group = key(items[i]);
    let cost = rowHeight + (i === start || group !== previous ? groupHeight : 0);
    if (i > start && used + cost > bodyHeight) {
      pages.push({ start, end: i }); start = i; used = 0; cost = rowHeight + groupHeight;
    }
    used += cost; previous = group;
  }
  pages.push({ start, end: items.length });
  return pages;
}

/** Keep fractional CSS pixels; clientHeight alone rounds down and can lose a fitting row. */
export function measurePaginationBody(viewport: HTMLElement, head: HTMLElement): number {
  if (window.innerWidth <= 1100) return 0;
  const scrollbar = Math.max(0, viewport.offsetHeight - viewport.clientHeight);
  return Math.max(0, viewport.getBoundingClientRect().height - scrollbar - head.getBoundingClientRect().height - 0.5);
}

const whole = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

/** A bounded window: edges and current page remain reachable even with millions of pages. */
export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const total = whole(totalPages);
  if (!total) return [];
  const current = Math.max(1, Math.min(whole(currentPage), total));
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total - 1, total];
  if (current >= total - 3) return [1, 2, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, 2, "ellipsis", current - 1, current, current + 1, "ellipsis", total - 1, total];
}

export interface PaginationOptions {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  idPrefix: string;
  label: string;
  className?: string;
  onPageChange: (page: number) => void;
}

/** Shared controls only. Each screen retains its data filtering and page-size policy. */
export function renderPagination(options: PaginationOptions): HTMLElement {
  const total = options.totalCount > 0 ? Math.max(1, whole(options.totalPages)) : 0;
  const current = Math.max(1, Math.min(whole(options.currentPage), total || 1));
  const controls = document.createElement("div");
  controls.className = `pagination-controls ${options.className || ""}`.trim();
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", options.label);

  const button = (text: string, label: string, key: string, page: number, disabled: boolean, selected = false) => {
    const element = document.createElement("button");
    element.type = "button";
    element.id = `btn-${options.idPrefix}-${key}`;
    element.className = "pagination-button";
    element.textContent = text;
    element.title = label;
    element.setAttribute("aria-label", label);
    element.dataset.page = String(page);
    element.disabled = disabled;
    if (selected) element.setAttribute("aria-current", "page");
    element.addEventListener("click", () => {
      if (element.disabled || page === current || page < 1 || page > total) return;
      options.onPageChange(page);
      document.getElementById(`btn-${options.idPrefix}-number-${page}`)?.focus({ preventScroll: true });
    });
    controls.append(element);
  };
  button("«", "첫 페이지", "first", 1, !total || current === 1);
  button("‹", "이전 페이지", "prev", current - 1, !total || current === 1);
  for (const item of getPaginationItems(current, total)) {
    if (item === "ellipsis") {
      const gap = document.createElement("span");
      gap.className = "pagination-ellipsis";
      gap.textContent = "…";
      gap.setAttribute("aria-hidden", "true");
      controls.append(gap);
    } else button(String(item), `${item}페이지`, `number-${item}`, item, false, item === current);
  }
  button("›", "다음 페이지", "next", current + 1, !total || current === total);
  button("»", "마지막 페이지", "last", total, !total || current === total);
  return controls;
}
