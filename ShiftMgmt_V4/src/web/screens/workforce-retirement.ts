import type { EmployeeRetirementChange } from "../../shared/bridge/contracts";
import type { WorkforceDialog } from "./workforce-dialog";

const lastWorkDay = (date: string): string => {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + "T00:00:00Z") : NaN;
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? new Date(parsed - 86400000).toISOString().slice(0, 10) : "퇴사일 전날";
};
const text = (parent: HTMLElement, value: string, className = "wf-retirement-copy"): void => {
  const line = document.createElement("div"); line.className = className; line.textContent = value; parent.appendChild(line);
};
const section = (parent: HTMLElement, title: string): HTMLElement => {
  const group = document.createElement("section"); group.className = "wf-retirement-section";
  const heading = document.createElement("strong"); heading.className = "wf-retirement-heading"; heading.textContent = title; group.appendChild(heading); parent.appendChild(group); return group;
};
const details = (parent: HTMLElement, label: string, lines: string[]): void => {
  const panel = document.createElement("details"); panel.className = "wf-retirement-copy";
  const toggle = document.createElement("summary"); toggle.className = "wf-retirement-summary"; text(toggle, label, ""); toggle.appendChild(icon("expand_more")); toggle.tabIndex = 0; panel.appendChild(toggle);
  const body = document.createElement("div"); body.className = "wf-retirement-detail-body";
  for (const line of lines) text(body, line);
  panel.appendChild(body); parent.appendChild(panel);
};

const icon = (name: string): HTMLElement => {
  const glyph = document.createElement("span"); glyph.className = "material-symbols-outlined wf-retirement-icon"; glyph.setAttribute("aria-hidden", "true"); glyph.textContent = name; return glyph;
};
const dateCard = (parent: HTMLElement, label: string, date: string, primary = false): void => {
  const card = document.createElement("div"); card.className = `wf-retirement-date${primary ? " wf-retirement-date--primary" : ""}`;
  text(card, label, "wf-retirement-date-label");
  const value = document.createElement("time"); value.className = "wf-retirement-date-value";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) value.dateTime = date;
  value.textContent = date.replace(/-/g, "."); card.appendChild(value); parent.appendChild(card);
};
const metric = (parent: HTMLElement, label: string, count: number): void => {
  const card = document.createElement("div"); card.className = `wf-retirement-metric${count === 0 ? " wf-retirement-metric--empty" : ""}`;
  text(card, label, "wf-retirement-metric-label"); const value = document.createElement("div"); value.className = "wf-retirement-metric-value";
  value.appendChild(document.createTextNode(String(count))); const unit = document.createElement("span"); unit.textContent = "건"; value.appendChild(unit); card.appendChild(value); parent.appendChild(card);
};
const callout = (parent: HTMLElement, tone: string, glyph: string, title: string): HTMLElement => {
  const group = section(parent, title); group.classList.add("wf-retirement-callout", `wf-retirement-callout--${tone}`);
  group.querySelector("strong")!.prepend(icon(glyph)); return group;
};

export const retirementGuidance = (date: string, correction: boolean): string =>
  `${date ? `${date}부터 근무에서 제외하며, ${lastWorkDay(date)}까지만 근무 대상입니다.` : "마지막으로 근무할 수 있는 날짜의 다음 날을 퇴사일로 입력해 주세요."} ${correction ? "퇴사일 정정 시 자동 종료한 이력만 원래 기간 안에서 조정합니다. " : ""}승인된 수당은 보존합니다.`;

export const renderRetirementGuidance = (container: HTMLElement, date: string, correction: boolean): void => {
  container.replaceChildren(); const body = document.createElement("div"); body.className = "wf-retirement-guide-content";
  const heading = document.createElement("div"); heading.className = "wf-retirement-guide-heading"; heading.appendChild(icon("event_busy"));
  text(heading, "퇴사일은 근무에서 제외되는 첫날입니다.", ""); body.appendChild(heading);
  const dates = document.createElement("div"); dates.className = "wf-retirement-dates wf-retirement-dates--compact"; dates.setAttribute("aria-label", retirementGuidance(date, correction));
  dateCard(dates, "마지막 근무 대상일", lastWorkDay(date)); dateCard(dates, "근무 제외 시작", date || "날짜를 선택해 주세요", true); body.appendChild(dates);
  if (correction) text(body, "퇴사일 정정 시 자동 종료한 이력만 원래 기간 안에서 조정합니다.", "wf-retirement-guide-meta");
  const preserved = document.createElement("div"); preserved.className = "wf-retirement-guide-preserved"; preserved.appendChild(icon("verified_user"));
  text(preserved, "승인된 수당은 보존합니다.", ""); body.appendChild(preserved);
  details(body, "저장하면 무엇이 바뀌는지 자세히 보기", [
    `시급은 ${lastWorkDay(date)}까지로 종료하되, 기존 종료일이 더 빠르면 그 날짜를 유지합니다. 근무지·근무조 배정은 ${date || "퇴사일"}부터 제외하며, 미래 퇴사일도 해당 날짜에 맞춰 제외됩니다.`,
    "퇴사일 이후에 시작하는 예정 시급·배정은 원본을 남겨 두고 적용에서 제외합니다. 무효 이력과 이미 승인된 수당은 그대로 보존합니다.",
    "퇴사일을 나중에 고쳐도 수동 종료일을 넘겨 늘리지 않습니다. 자동 종료 후 개별적으로 바꾼 이력이 있으면 덮어쓰지 않고 확인을 요청합니다.",
    "영향받는 대기 실적은 원본 엑셀을 다시 읽습니다. 저장 후 표시되는 반영 결과를 확인하고, 실적 관리에서 근무일과 시급을 확인한 뒤 직접 승인해 주세요."
  ]);
  container.appendChild(body);
};

export const showRetirementResult = (dialog: WorkforceDialog, result: EmployeeRetirementChange): void => {
  const box = document.createElement("div"); box.className = "wf-retirement-result";
  const intro = document.createElement("div"); intro.className = "wf-retirement-intro"; intro.appendChild(icon("task_alt"));
  text(intro, "저장 완료", "wf-retirement-status-tag"); text(intro, "적용 기간과 아래 처리 결과를 확인해 주세요.", "wf-retirement-copy"); box.appendChild(intro);
  if (result.kind === "date-correction" && result.previousRetireDate) text(box, `기존 퇴사일 ${result.previousRetireDate} → ${result.retireDate}`, "wf-retirement-correction");
  const date = document.createElement("div"); date.className = "wf-retirement-dates"; box.appendChild(date);
  dateCard(date, "퇴사일 · 근무 제외 시작", result.retireDate, true); dateCard(date, "시급 적용 마지막 날", lastWorkDay(result.retireDate));
  text(box, `시급은 늦어도 ${lastWorkDay(result.retireDate)}까지 적용하며, 기존 종료일이 더 빠르면 그 날짜를 유지합니다.`, "wf-retirement-caption");
  const applied = section(box, "이번에 반영한 내용");
  const metrics = document.createElement("div"); metrics.className = "wf-retirement-metrics"; applied.appendChild(metrics);
  metric(metrics, "시급 종료·조정", result.closedWageCount); metric(metrics, "근무 배정 종료·조정", result.closedAssignmentCount);
  metric(metrics, "예정 시급 적용 제외", result.excludedFutureWageCount); metric(metrics, "예정 배정 적용 제외", result.excludedFutureAssignmentCount);
  if (result.kind === "date-correction") text(applied, `자동 종료 이력 재조정 ${result.adjustedHistoryCount}건 — 위 종료·조정 건수에 포함됩니다.`);
  const preserved = callout(box, "neutral", "verified_user", "기존 기록은 보존했습니다");
  text(preserved, "수동으로 정한 종료 범위, 무효 이력과 승인된 수당은 보존했습니다. 예정 이력의 원본도 삭제하지 않았습니다.");
  if (result.legacyProvenanceIncomplete) text(callout(box, "warning", "history", "확인할 과거 이력"), "확인할 과거 이력이 있습니다. 예전 종료 이력이 자동 처리된 것인지 확인할 수 없어, 확인되지 않은 과거 기간은 복원하지 않았습니다. 직원 상세의 시급·배정 이력을 확인해 주세요.");
  const summary = result.pendingPerformanceRefresh;
  const refresh = callout(box, !summary || summary.status !== "completed" ? "warning" : summary.targetFileCount === 0 ? "info" : "success", !summary || summary.status !== "completed" ? "warning_amber" : summary.targetFileCount === 0 ? "info" : "check_circle", !summary || summary.status !== "completed" ? "대기 실적 확인 필요" : summary.targetFileCount === 0 ? "다시 읽을 대기 실적 없음" : "대기 실적 반영 완료");
  refresh.id = "employee-retirement-refresh-result";
  if (!summary) {
    text(refresh, "퇴사 정보 저장은 완료했지만, 대기 실적 반영 결과를 확인하지 못했습니다.");
  } else if (summary.targetFileCount === 0 && summary.affectedEntryCount === 0 && summary.status === "completed") {
    text(refresh, "이번 변경으로 다시 읽을 대기 실적이 없어 파일을 다시 읽지 않았습니다.");
  } else {
    text(refresh, `대기 실적 다시 읽기 ${summary.status === "completed" ? "완료" : "일부 미완료"}: ${summary.refreshedFileCount}/${summary.targetFileCount}개 파일 · 대상 ${summary.affectedEntryCount}건`);
    if (summary.status !== "completed") text(refresh, "퇴사 정보와 시급·배정 저장은 완료했습니다. 아래 사유로 일부 대기 실적에는 변경 내용이 아직 반영되지 않았습니다.");
  }
  for (const issue of summary?.issues ?? []) text(refresh, `${issue.fileName}: ${issue.message}`, "wf-retirement-copy wf-retirement-copy--danger");
  const next = section(box, "이제 확인해 주세요"); next.classList.add("wf-retirement-next"); next.querySelector("strong")!.prepend(icon("arrow_forward"));
  if (!summary || summary.status !== "completed") {
    text(next, "실적 관리에서 안내된 파일과 원본 엑셀·실적 폴더 설정을 확인하고 다시 읽어 주세요. 대상 근무일과 시급이 반영됐는지 확인하기 전에는 승인하지 마세요.");
  } else if (summary.targetFileCount === 0) {
    text(next, "직원 상세의 시급·배정 이력에서 종료일을 확인해 주세요. 새로 들어오는 실적도 퇴사일 이후 근무는 승인할 수 없습니다.");
  } else {
    text(next, "실적 관리에서 대상 근무일과 시급을 확인한 뒤 필요한 실적을 직접 승인해 주세요. 다시 읽기만으로 새 수당이 승인되거나 계산되지는 않습니다.");
  }
  details(box, "퇴사일 정정·재입사 처리 기준 자세히 보기", [
    "퇴사일을 고치면 자동 종료한 이력만 원래 기간 안에서 조정합니다. 예를 들어 시급이 원래 11월 17일까지였다면 퇴사일을 11월 20일로 늦춰도 시급은 17일까지만 적용합니다.",
    "무효 처리한 시급은 다시 적용하지 않습니다. 이미 승인된 수당도 자동 변경하지 않습니다.",
    "복귀하는 직원은 인력 상세의 ‘같은 사번으로 재입사’에서 새 재직기간·시급·배정을 등록해 주세요. 미래 날짜를 선택하면 예약으로 저장되며, 시작 전 예약 변경·취소가 가능합니다."
  ]);
  dialog.open({ id: "modal-retirement-result", title: result.kind === "date-correction" ? "퇴사일 정정 완료" : "퇴사 정보 저장 완료", width: "740px", content: box,
    initialFocusSelector: "#btn-close-retirement-result", buttons: [{ id: "btn-close-retirement-result", label: "확인", variant: "primary", onClick: () => dialog.close() }] });
};
