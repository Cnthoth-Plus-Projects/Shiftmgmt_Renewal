import { dashboardChartInput, dashboardMoney, type DashboardKey, type DashboardModel, type DashboardBucket } from "./dashboard-model";
import { dashboardEscape } from "./dashboard-view";
import { subscribeTheme } from "../theme-controls";

type PlotKey = "trend" | "site" | "ratio";
interface Hit { index: number; x: number; y: number; w: number; h: number; label: string }
interface Ring { cx: number; cy: number; radius: number; legendX: number; legendY: number; step: number; arcs: { start: number; end: number; index: number }[] }
const colors = ["#149c8f", "#eab35e", "#6f7fe7"];
const compact = (n: number) => n >= 10000 ? `${Number((n / 10000).toFixed(1))}만` : n.toLocaleString("ko-KR");
const keys: readonly PlotKey[] = ["trend", "site", "ratio"];

export class DashboardCharts {
  private model: DashboardModel | null = null;
  private darkPalette = false;
  private unsubscribeTheme: () => void;
  private color(light: string, role: "text" | "line" | "track" | "background" | "highlight" = "text"): string {
    return this.darkPalette ? ({ text: "#b9c8db", line: "#405169", track: "#344355", background: "#1d2633", highlight: "#2c4058" })[role] : light;
  }
  private observer: ResizeObserver;
  private destroyed = false;
  private hits = new Map<PlotKey, Hit[]>();
  private active = new Map<PlotKey, number>();
  private ring: Ring | null = null;
  private frame: number | null = null;
  private animationStart = 0;
  private events: { element: HTMLCanvasElement; type: string; handler: EventListener }[] = [];
  constructor(private root: HTMLElement) {
    this.observer = new ResizeObserver(() => this.draw());
    this.unsubscribeTheme = subscribeTheme(() => this.draw());
    for (const key of keys) {
      const c = this.canvas(key); this.observer.observe(c); c.setAttribute("aria-describedby", `dashboard-tooltip-${key}`);
      const listen = (type: string, handler: EventListener) => { c.addEventListener(type, handler); this.events.push({ element: c, type, handler }); };
      listen("mousemove", e => { const event = e as MouseEvent, box = c.getBoundingClientRect(); this.setActive(key, this.hit(key, event.clientX - box.left, event.clientY - box.top)); });
      listen("mouseleave", () => { if (document.activeElement !== c) this.setActive(key, -1); });
      listen("focus", () => this.setActive(key, 0));
      listen("blur", () => this.setActive(key, -1));
      listen("keydown", e => {
        const event = e as KeyboardEvent;
        if (event.key === "Escape") { this.setActive(key, -1); return; }
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const count = this.hits.get(key)?.length || 0; if (!count) return;
        const current = this.active.get(key) ?? 0;
        const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (current + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + count) % count;
        this.setActive(key, next);
      });
    }
    void document.fonts.ready.then(() => { if (!this.destroyed) this.draw(); });
  }
  private canvas(key: PlotKey): HTMLCanvasElement { return this.root.querySelector<HTMLCanvasElement>(`#dashboard-canvas-${key}`)!; }
  render(model: DashboardModel): void {
    this.model = model; this.active.clear();
    for (const key of keys) {
      const input = dashboardChartInput(model, key), table = this.root.querySelector(`#dashboard-data-${key}`)!;
      table.innerHTML = `<table aria-label="${dashboardEscape(input.chartTitle)} 원본 데이터"><thead><tr>${input.columns.map(c => `<th scope="col">${dashboardEscape(c.header)}</th>`).join("")}</tr></thead><tbody>${input.rows.map(r => `<tr>${input.columns.map(c => `<td>${dashboardEscape(typeof r[c.key] === "number" ? Number(r[c.key]).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const period = this.root.querySelector<HTMLElement>(`#dashboard-${key}-period`)!;
      period.textContent = key === "trend" ? model.trendLabel : `${model.periodLabel} · ${key === "site" ? `${model.sites.length}개 근무지` : "산출 금액 기준"}`;
      period.title = period.textContent;
      this.canvas(key).setAttribute("aria-label", `${input.chartTitle}. 방향키로 값을 탐색하거나 원본 데이터 표를 열 수 있습니다.`);
      this.canvas(key).dataset.activeIndex = "-1";
      this.tip(key).classList.remove("is-visible"); this.tip(key).textContent = "차트를 가리키거나 방향키로 값을 확인하세요.";
    }
    this.draw();
  }
  private tip(key: PlotKey): HTMLElement { return this.root.querySelector<HTMLElement>(`#dashboard-tooltip-${key}`)!; }
  private hit(key: PlotKey, x: number, y: number): number {
    if (key !== "ratio") return this.hits.get(key)?.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)?.index ?? -1;
    const ring = this.ring; if (!ring || !this.model?.totals.amount) return -1;
    if (x >= ring.legendX) { const i = Math.floor((y - ring.legendY + 5) / ring.step); return i >= 0 && i < 3 ? i : -1; }
    const distance = Math.hypot(x - ring.cx, y - ring.cy);
    if (distance < ring.radius * .62 || distance > ring.radius + 8) return -1;
    let angle = Math.atan2(y - ring.cy, x - ring.cx); if (angle < -Math.PI / 2) angle += Math.PI * 2;
    return ring.arcs.find(a => angle >= a.start && angle < a.end)?.index ?? -1;
  }
  private setActive(key: PlotKey, index: number): void {
    if (this.destroyed || (this.active.get(key) ?? -1) === index) return;
    this.active.set(key, index); this.canvas(key).dataset.activeIndex = String(index);
    const item = this.hits.get(key)?.find(h => h.index === index);
    const tip = this.tip(key); tip.classList.toggle("is-visible", !!item); tip.textContent = item?.label || "차트를 가리키거나 방향키로 값을 확인하세요.";
    this.animationStart = performance.now();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    const tick = (now: number) => {
      this.frame = null; if (this.destroyed) return;
      const progress = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : Math.min(1, (now - this.animationStart) / 150);
      this.draw(1 - Math.pow(1 - progress, 3));
      if (progress < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  private draw(progress = 1): void { if (!this.destroyed && this.model) for (const key of keys) this.drawOne(key, progress); }
  private drawOne(key: PlotKey, progress: number, interactive = true, exportMode = false): void {
    const previousPalette = this.darkPalette;
    this.darkPalette = !exportMode && document.documentElement.dataset.theme === "dark";
    try {
    const c = this.canvas(key); if (!this.model || !c?.isConnected) return;
    const box = c.getBoundingClientRect(); c.dataset.ready = "false"; if (box.width < 1 || box.height < 1) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1); c.width = Math.round(box.width * dpr); c.height = Math.round(box.height * dpr);
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.fillStyle = this.color("#ffffff", "background"); ctx.fillRect(0, 0, box.width, box.height); ctx.font = "10px Pretendard, sans-serif";
    const active = interactive ? this.active.get(key) ?? -1 : -1;
    if (key === "trend") this.trend(ctx, box.width, box.height, this.model.trend, active, progress);
    else if (key === "site") this.sites(ctx, box.width, box.height, active, progress);
    else this.ratio(ctx, box.width, box.height, active, progress);
    c.dataset.ready = "true";
    } finally { this.darkPalette = previousPalette; }
  }
  private rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
    ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(radius, w / 2, h / 2)));
  }
  private trend(ctx: CanvasRenderingContext2D, w: number, h: number, rows: DashboardBucket[], active: number, progress: number): void {
    const small = h < 130, left = Math.min(46, w * .16), top = small ? 9 : 16, bottom = Math.max(top + 8, h - 29), plot = Math.max(1, w - left - 8);
    const max = Math.max(1, ...rows.map(r => r.totalAmount)), column = plot / rows.length; ctx.font = `${small ? 9 : 10}px Pretendard, sans-serif`;
    for (let i = 0; i <= (small ? 2 : 4); i++) { const n = small ? 2 : 4, y = bottom - (bottom - top) * i / n; ctx.setLineDash([3, 4]); ctx.strokeStyle = this.color("#edf2f5", "line"); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - 4, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = this.color("#9aa9b5"); ctx.textAlign = "right"; ctx.fillText(compact(max * i / n), left - 7, y + 3); }
    if (h > 110) { ctx.fillStyle = this.color("#a3b1bb"); ctx.fillText("원", left - 7, 8); }
    const hits: Hit[] = [];
    rows.forEach((r, i) => {
      const x = left + column * i, bar = Math.min(46, column * .47), height = r.totalAmount / max * (bottom - top);
      if (i === active) { ctx.fillStyle = this.color(`rgba(229,242,246,${.5 + progress * .4})`, "highlight"); this.rounded(ctx, x + 2, top - 3, column - 4, bottom - top + 7, 6); ctx.fill(); }
      ctx.save(); ctx.globalAlpha = active >= 0 && active !== i ? .48 : 1;
      this.rounded(ctx, x + (column - bar) / 2, bottom - height, bar, height, 5); ctx.clip(); let y = bottom;
      [r.legalHolidayAmount, r.substituteAmount, r.overtimeAmount].forEach((amount, n) => { const block = amount / max * (bottom - top); const gradient = ctx.createLinearGradient(0, y - block, 0, y); gradient.addColorStop(0, colors[n]); gradient.addColorStop(1, ["#3aafa3", "#f1c47c", "#8d9aeF"][n]); ctx.fillStyle = gradient; ctx.fillRect(x + (column - bar) / 2, y - block, bar, block); y -= block; }); ctx.restore();
      ctx.fillStyle = active === i ? this.color("#456e81") : this.color("#98a7b4"); ctx.textAlign = "center"; ctx.fillText(rows.length === 12 ? `${Number(r.label.slice(5))}월` : r.label.slice(2).replace("-", "."), x + column / 2, bottom + 12);
      hits.push({ index: i, x, y: top - 4, w: column, h: bottom - top + 8, label: `${r.label}\n${dashboardMoney(r.totalAmount)} · ${r.workMinutes.toLocaleString("ko-KR")}분\n법정휴일 ${dashboardMoney(r.legalHolidayAmount)} / 대체 ${dashboardMoney(r.substituteAmount)} / 연장 ${dashboardMoney(r.overtimeAmount)}` });
    });
    this.legend(ctx, w, h - 1); this.hits.set("trend", hits);
  }
  private legend(ctx: CanvasRenderingContext2D, w: number, y: number): void {
    ctx.font = "9px Pretendard, sans-serif"; const labels = ["법정휴일", "대체근무", "연장근무"], start = Math.max(1, (w - 216) / 2);
    labels.forEach((label, i) => { ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(start + i * 72 + 3, y - 3, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = this.color("#96a7b3"); ctx.textAlign = "left"; ctx.fillText(label, start + i * 72 + 11, y); });
  }
  private sites(ctx: CanvasRenderingContext2D, w: number, h: number, active: number, progress: number): void {
    const source = this.model!.sites, limit = Math.min(10, Math.max(2, Math.floor((h - 4) / 22))); let rows = source;
    if (source.length > limit) { const rest = source.slice(limit - 1); const other: DashboardBucket = { label: `기타 ${rest.length}곳`, totalAmount: 0, workMinutes: 0, count: 0, overtimeAmount: 0, substituteAmount: 0, legalHolidayAmount: 0 }; for (const r of rest) for (const key of ["totalAmount", "workMinutes", "count", "overtimeAmount", "substituteAmount", "legalHolidayAmount"] as const) other[key] += r[key]; rows = [...source.slice(0, limit - 1), other]; }
    const max = Math.max(1, ...rows.map(r => r.totalAmount)), labelWidth = Math.min(112, w * .28), valueWidth = Math.min(100, w * .29), plot = Math.max(1, w - labelWidth - valueWidth - 8), step = Math.min(28, (h - 4) / Math.max(1, rows.length));
    ctx.font = `${h < 110 ? 9 : 10}px Pretendard, sans-serif`;
    if (!rows.length) { ctx.fillStyle = this.color("#a0afb9"); ctx.textAlign = "center"; ctx.fillText("표시할 산출 내역이 없습니다.", w / 2, h / 2); }
    const hits: Hit[] = [];
    rows.forEach((r, i) => {
      const y = 2 + i * step, barHeight = Math.min(13, step * .48); ctx.fillStyle = i === active ? this.color("#426b7e") : this.color("#8da0ae"); ctx.textAlign = "left"; let label = r.label; while (ctx.measureText(label).width > labelWidth - 9 && label.length > 1) label = label.slice(0, -2) + "…"; ctx.fillText(label, 0, y + step * .65);
      ctx.fillStyle = this.color("#f0f5f7", "track"); this.rounded(ctx, labelWidth, y + (step - barHeight) / 2, plot, barHeight, 4); ctx.fill();
      ctx.save(); ctx.globalAlpha = active >= 0 && active !== i ? .5 : 1; const gradient = ctx.createLinearGradient(labelWidth, 0, labelWidth + plot, 0); gradient.addColorStop(0, i === active ? "#559ac0" : "#81c9c1"); gradient.addColorStop(1, i === active ? "#5476c9" : "#259e93"); ctx.fillStyle = gradient;
      this.rounded(ctx, labelWidth, y + (step - barHeight) / 2, r.totalAmount / max * plot, barHeight + (i === active ? progress : 0), 4); ctx.fill(); ctx.restore();
      ctx.fillStyle = i === active ? this.color("#396c80") : this.color("#8a9daa"); ctx.textAlign = "right"; ctx.fillText(dashboardMoney(r.totalAmount), w - 1, y + step * .65, valueWidth - 3);
      hits.push({ index: i, x: 0, y, w, h: step, label: `${r.label}\n${dashboardMoney(r.totalAmount)} · ${r.workMinutes.toLocaleString("ko-KR")}분` });
    }); this.hits.set("site", hits);
  }
  private ratio(ctx: CanvasRenderingContext2D, w: number, h: number, active: number, progress: number): void {
    const m = this.model!, small = h < 120, cx = w * .27, cy = h / 2, radius = Math.max(10, Math.min(76, h * .37, w * .22)), legendX = cx + radius + (small ? 13 : 20), step = small ? 18 : 38, legendY = cy - step * 1.25; let angle = -Math.PI / 2;
    const arcs: Ring["arcs"] = []; const hits: Hit[] = [];
    ctx.strokeStyle = this.color("#f0f4f6", "track"); ctx.lineWidth = radius * .29; ctx.beginPath(); ctx.arc(cx, cy, radius * .83, 0, Math.PI * 2); ctx.stroke();
    m.ratio.forEach((r, i) => {
      const end = angle + r.percent / 100 * Math.PI * 2, middle = (angle + end) / 2, offset = i === active ? 5 * progress : 0;
      if (r.percent) { ctx.save(); ctx.globalAlpha = active >= 0 && active !== i ? .45 : 1; ctx.translate(Math.cos(middle) * offset, Math.sin(middle) * offset); ctx.beginPath(); ctx.arc(cx, cy, radius, angle + .015, Math.max(angle + .015, end - .015)); ctx.arc(cx, cy, radius * .66, Math.max(angle + .015, end - .015), angle + .015, true); ctx.closePath(); const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius); gradient.addColorStop(0, colors[i]); gradient.addColorStop(1, ["#54bcb0", "#f1ca83", "#9ca7f0"][i]); ctx.fillStyle = gradient; ctx.fill(); ctx.restore(); }
      arcs.push({ start: angle, end, index: i }); angle = end;
      const y = legendY + i * step; ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(legendX + 3, y + 3, 3, 0, Math.PI * 2); ctx.fill(); ctx.font = `${small ? 9 : 10}px Pretendard, sans-serif`; ctx.fillStyle = i === active ? this.color("#3b6576") : this.color("#8d9fac"); ctx.textAlign = "left"; ctx.fillText(`${r.label} ${r.percent.toFixed(1)}%`, legendX + 12, y + 6);
      if (small) { ctx.textAlign = "right"; ctx.fillText(dashboardMoney(r.totalAmount), w - 1, y + 6, Math.max(20, w - legendX - 92)); } else { ctx.fillStyle = this.color("#627f91"); ctx.fillText(dashboardMoney(r.totalAmount), legendX + 12, y + 22, Math.max(20, w - legendX - 15)); }
      hits.push({ index: i, x: legendX, y: y - 5, w: w - legendX, h: step, label: `${r.label} · ${r.percent.toFixed(1)}%\n${dashboardMoney(r.totalAmount)} · ${r.workMinutes.toLocaleString("ko-KR")}분` });
    });
    ctx.textAlign = "center"; ctx.fillStyle = this.color("#456779"); ctx.font = `600 ${small ? 12 : 16}px Pretendard, sans-serif`;
    const focus = active >= 0 ? m.ratio[active] : undefined; ctx.fillText(focus ? `${focus.percent.toFixed(1)}%` : m.totals.amount ? `${compact(m.totals.amount)}원` : "0원", cx, cy + (small ? 4 : 0), radius * 1.19);
    if (!small) { ctx.fillStyle = this.color("#a2b0ba"); ctx.font = "9px Pretendard, sans-serif"; ctx.fillText(focus ? focus.label : "산출 수당 합계", cx, cy + 17, radius * 1.2); }
    this.ring = { cx, cy, radius, legendX, legendY, step, arcs }; this.hits.set("ratio", hits);
  }
  capture(key: DashboardKey): string | undefined {
    if (key === "ranking") return undefined;
    const c = this.canvas(key); if (!c?.isConnected || !c.width || !c.height || c.dataset.ready !== "true") throw new Error("차트를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    const box = c.getBoundingClientRect(); if (box.width < 1 || box.height < 1) throw new Error("차트를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    try {
      this.drawOne(key, 1, false, true);
      if (c.dataset.ready !== "true") throw new Error("차트를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      const png = c.toDataURL("image/png"); if (!/^data:image\/png;base64,iVBORw0KGgo/.test(png)) throw new Error("차트 PNG 이미지를 만들지 못했습니다."); return png; }
    finally { this.drawOne(key, 1); }
  }
  destroy(): void { this.unsubscribeTheme(); this.destroyed = true; this.model = null; this.observer.disconnect(); if (this.frame !== null) cancelAnimationFrame(this.frame); for (const { element, type, handler } of this.events) element.removeEventListener(type, handler); this.events = []; }
}
