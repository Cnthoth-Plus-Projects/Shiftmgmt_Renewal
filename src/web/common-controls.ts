// Shared selectors and calendar for every screen and modal. Native form values,
// labels, validation and change events remain the authoritative form contract.
export function installCommonControls(): void {
  let anchor: HTMLSelectElement | HTMLInputElement | null = null;
  let popup: HTMLDivElement | null = null;
  let activeIndex = -1;
  let items: HTMLOptionElement[] = [];
  let month = new Date();
  let dayCursor = "";
  let serial = 0;
  const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDate = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const close = (focus = false) => {
    const previous = anchor;
    previous?.setAttribute("aria-expanded", "false");
    previous?.removeAttribute("aria-controls");
    previous?.removeAttribute("aria-activedescendant");
    popup?.remove(); popup = null; anchor = null; items = [];
    if (focus && previous?.isConnected && !previous.disabled) previous.focus();
  };
  const position = () => {
    if (!anchor || !popup) return;
    const r = anchor.getBoundingClientRect();
    const width = anchor instanceof HTMLSelectElement ? Math.max(180, r.width) : 312;
    popup.style.width = `${Math.min(width, window.innerWidth - 24)}px`;
    popup.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - popup.offsetWidth - 12))}px`;
    const height = popup.offsetHeight;
    const top = r.bottom + height + 8 <= window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - height - 6);
    popup.style.top = `${top}px`;
  };
  const open = (control: HTMLSelectElement | HTMLInputElement, role: "listbox" | "dialog") => {
    close(); anchor = control; control.focus();
    popup = document.createElement("div"); popup.className = `ui-control-popup ui-${role}`;
    popup.id = `ui-control-popup-${++serial}`; popup.setAttribute("role", role);
    popup.setAttribute("aria-label", control.getAttribute("aria-label") || control.labels?.[0]?.textContent?.trim() || (role === "listbox" ? "항목 선택" : "날짜 선택"));
    // Keep calendar buttons inside the current dialog's existing focus trap.
    const dialog = control.closest('[role="dialog"]');
    (dialog?.querySelector(".workforce-modal-box, .modal-box") || dialog || document.body).appendChild(popup);
    control.setAttribute("aria-expanded", "true"); control.setAttribute("aria-controls", popup.id);
    control.setAttribute("aria-haspopup", role);
  };
  const commit = (value: string, optionIndex?: number) => {
    const control = anchor;
    if (!control || !control.isConnected || control.matches(":disabled") || (control instanceof HTMLInputElement && control.readOnly)) { close(); return; }
    const changed = optionIndex !== undefined && control instanceof HTMLSelectElement ? control.selectedIndex !== optionIndex : control.value !== value;
    if (optionIndex !== undefined && control instanceof HTMLSelectElement) control.selectedIndex = optionIndex;
    else control.value = value;
    close(true);
    if (changed) {
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const highlight = () => {
    if (!popup || !(anchor instanceof HTMLSelectElement)) return;
    popup.querySelectorAll<HTMLElement>('[role="option"]').forEach((row, i) => {
      row.classList.toggle("is-active", i === activeIndex);
      if (i === activeIndex) { anchor?.setAttribute("aria-activedescendant", row.id); row.scrollIntoView({ block: "nearest" }); }
    });
  };
  const openSelect = (control: HTMLSelectElement) => {
    open(control, "listbox");
    items = Array.from(control.options);
    activeIndex = control.selectedIndex;
    items.forEach((option, i) => {
      const row = document.createElement("div"); row.className = "ui-select-option"; row.id = `${popup!.id}-${i}`;
      row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(option.selected));
      const disabled = option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
      row.setAttribute("aria-disabled", String(disabled)); row.textContent = option.textContent;
      row.addEventListener("pointermove", () => { if (!disabled) { activeIndex = i; highlight(); } });
      row.addEventListener("pointerdown", e => e.preventDefault());
      row.addEventListener("click", () => { if (!disabled) commit(option.value, i); });
      popup!.appendChild(row);
    });
    if (!items.length) { const empty = document.createElement("div"); empty.className = "ui-select-empty"; empty.textContent = "선택할 항목이 없습니다."; popup!.appendChild(empty); }
    position(); highlight();
  };
  const dateAllowed = (value: string) => {
    if (!(anchor instanceof HTMLInputElement)) return false;
    const probe = anchor.cloneNode(false) as HTMLInputElement;
    probe.disabled = false; probe.readOnly = false; probe.value = value;
    return probe.validity.valid;
  };
  const button = (text: string, label: string, handler: () => void, className = "") => {
    const b = document.createElement("button"); b.type = "button"; b.className = `ui-calendar-button ${className}`;
    b.textContent = text; b.setAttribute("aria-label", label); b.addEventListener("click", handler); return b;
  };
  const drawCalendar = (focusDay = false) => {
    if (!popup || !(anchor instanceof HTMLInputElement)) return;
    popup.replaceChildren();
    const header = document.createElement("div"); header.className = "ui-calendar-header";
    const shiftMonth = (delta: number) => {
      month = new Date(month.getFullYear(), month.getMonth() + delta, 1, 12);
      dayCursor = dateKey(month);
      if (anchor instanceof HTMLInputElement && anchor.min && dayCursor < anchor.min) dayCursor = anchor.min;
      drawCalendar(true);
    };
    const prev = button("‹", "이전 달", () => shiftMonth(-1));
    const next = button("›", "다음 달", () => shiftMonth(1));
    prev.disabled = Boolean(anchor.min && dateKey(new Date(month.getFullYear(), month.getMonth(), 0, 12)) < anchor.min);
    next.disabled = Boolean(anchor.max && dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)) > anchor.max);
    const title = document.createElement("strong"); title.textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`; title.setAttribute("aria-live", "polite");
    header.append(prev, title, next); popup.appendChild(header);
    const grid = document.createElement("div"); grid.className = "ui-calendar-grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", title.textContent);
    for (const label of ["일", "월", "화", "수", "목", "금", "토"]) { const cell = document.createElement("span"); cell.className = "ui-calendar-weekday"; cell.textContent = label; grid.appendChild(cell); }
    const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    start.setDate(1 - start.getDay());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const value = dateKey(d);
      const cell = button(String(d.getDate()), `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`, () => commit(value), "ui-calendar-day");
      cell.dataset.date = value; cell.tabIndex = value === dayCursor ? 0 : -1; cell.disabled = !dateAllowed(value);
      cell.classList.toggle("is-outside", d.getMonth() !== month.getMonth()); cell.classList.toggle("is-selected", value === anchor.value);
      cell.setAttribute("aria-pressed", String(value === anchor.value));
      if (value === dateKey(new Date())) { cell.classList.add("is-today"); cell.setAttribute("aria-current", "date"); }
      grid.appendChild(cell);
    }
    popup.appendChild(grid);
    const footer = document.createElement("div"); footer.className = "ui-calendar-footer";
    const clear = button("날짜 지우기", "날짜 지우기", () => commit("")); clear.disabled = anchor.required;
    const todayValue = dateKey(new Date()); const today = button("오늘", "오늘 날짜 선택", () => commit(todayValue)); today.disabled = !dateAllowed(todayValue);
    footer.append(clear, today); popup.appendChild(footer); position();
    if (focusDay) popup.querySelector<HTMLButtonElement>(`[data-date="${dayCursor}"]`)?.focus();
  };
  const openCalendar = (control: HTMLInputElement) => {
    open(control, "dialog");
    dayCursor = control.value || dateKey(new Date());
    if (control.min && dayCursor < control.min) dayCursor = control.min;
    if (control.max && dayCursor > control.max) dayCursor = control.max;
    month = parseDate(dayCursor); drawCalendar(true);
  };
  const eligible = (target: EventTarget | null): target is HTMLSelectElement | HTMLInputElement =>
    target instanceof HTMLSelectElement ? !target.multiple && target.size <= 1 && !target.matches(":disabled") : target instanceof HTMLInputElement && target.type === "date" && !target.matches(":disabled") && !target.readOnly;
  document.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    if (eligible(e.target)) {
      e.preventDefault();
      if (anchor === e.target) { close(true); return; }
      if (e.target instanceof HTMLSelectElement) openSelect(e.target); else openCalendar(e.target);
    } else if (popup && e.target instanceof Node && !popup.contains(e.target)) close();
  }, true);
  document.addEventListener("click", e => {
    if (eligible(e.target)) {
      e.preventDefault();
      // Keyboard/assistive activation may produce click without pointerdown.
      if (e.detail === 0 && !popup) {
        if (e.target instanceof HTMLSelectElement) openSelect(e.target); else openCalendar(e.target);
      }
    }
  }, true);
  document.addEventListener("keydown", e => {
    if (!popup) {
      if (eligible(e.target) && ["ArrowDown", "ArrowUp", " ", "Enter"].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.target instanceof HTMLSelectElement) openSelect(e.target); else openCalendar(e.target);
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (e.key === "Tab") { if (anchor instanceof HTMLSelectElement) close(); return; }
    if (anchor instanceof HTMLSelectElement) {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation();
        const direction = e.key === "ArrowUp" || e.key === "End" ? -1 : 1;
        let index = e.key === "Home" ? -1 : e.key === "End" ? items.length : activeIndex;
        for (let i = 0; i < items.length; i++) {
          index = (index + direction + items.length) % items.length;
          if (popup.children[index]?.getAttribute("aria-disabled") !== "true") { activeIndex = index; break; }
        }
        highlight();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (activeIndex >= 0 && popup.children[activeIndex]?.getAttribute("aria-disabled") !== "true") commit(items[activeIndex].value, activeIndex);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.isComposing) {
        e.preventDefault();
        const index = items.findIndex((o, i) => o.text.toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase()) && popup?.children[i]?.getAttribute("aria-disabled") !== "true");
        if (index >= 0) { activeIndex = index; highlight(); }
      }
    } else if (e.target instanceof HTMLElement && e.target.matches(".ui-calendar-day") && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      const d = parseDate(e.target.dataset.date!);
      if (e.key === "PageUp" || e.key === "PageDown") d.setMonth(d.getMonth() + (e.key === "PageUp" ? -1 : 1), 1);
      else d.setDate(d.getDate() + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -d.getDay(), End: 6-d.getDay() }[e.key] || 0));
      const value = dateKey(d);
      if (dateAllowed(value)) { dayCursor = value; month = d; drawCalendar(true); }
    }
  }, true);
  document.addEventListener("change", e => { if (e.target === anchor) close(); }, true);
  document.addEventListener("focusin", e => { if (popup && e.target !== anchor && e.target instanceof Node && !popup.contains(e.target)) close(); });
  document.addEventListener("scroll", e => { if (popup && e.target instanceof Node && !popup.contains(e.target)) close(); }, true);
  window.addEventListener("resize", () => close());
  new MutationObserver(records => {
    if (anchor && (!anchor.isConnected || anchor.matches(":disabled") || records.some(r => r.type === "childList" && anchor?.contains(r.target)))) close();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
}
