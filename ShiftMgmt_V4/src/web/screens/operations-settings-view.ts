import { createFormGroup, sharedDialog } from "./operations-ui";

interface PolicyHelp {
  title: string;
  kind: "warning" | "policy";
  summary: string;
  purpose: string;
  when: string;
  example: string;
  effect: string;
}

const POLICY_HELP: Record<string, PolicyHelp> = {
  "input-scheduleConsecutiveNightLimit": {
    title: "연속 야간근무 확인 기준 (일)", kind: "warning",
    summary: "설정한 일수를 넘겨 야간근무가 이어지면 경고합니다.",
    purpose: "한 직원에게 야간근무가 계속 배정된 경우를 찾아 근무표를 검토할 수 있게 합니다.",
    when: "근무표 미리보기와 저장된 근무표의 경고 목록에서 확인합니다.",
    example: "3일로 설정하면 연속 야간 3일까지는 이 경고가 없고, 4일째부터 확인이 필요하다는 경고가 표시됩니다.",
    effect: "숫자를 낮추면 더 짧은 연속 야간근무에도 경고합니다. 근무자를 자동 교체하거나 근무표를 자동 수정하지 않습니다."
  },
  "input-scheduleMinimumRestMinutes": {
    title: "근무 사이 최소 휴식 (분)", kind: "warning",
    summary: "앞 근무 종료부터 다음 근무 시작까지의 간격입니다.",
    purpose: "퇴근 후 다음 출근까지 쉴 시간이 충분한지 확인합니다. 근무 중 휴게시간을 설정하는 항목은 아닙니다.",
    when: "한 직원의 앞 근무 종료 시각과 다음 근무 시작 시각을 비교해 기준보다 짧으면 경고합니다.",
    example: "660분은 11시간입니다. 밤 10시에 퇴근하고 다음 날 오전 8시에 출근하면 간격이 10시간이므로 경고합니다.",
    effect: "분 단위로 입력합니다. 값을 높이면 더 긴 휴식 간격을 요구하며, 실제 출퇴근 시각이나 수당 계산 시간은 바꾸지 않습니다."
  },
  "input-scheduleWeeklyMaxMinutes": {
    title: "주간 근무시간 확인 기준 (분)", kind: "warning",
    summary: "월요일부터 일요일까지 휴게를 뺀 근무시간을 확인합니다.",
    purpose: "한 직원의 한 주 근무시간이 설정한 기준을 초과했는지 확인합니다.",
    when: "월요일부터 일요일까지의 근무시간에서 휴게시간을 뺀 합계를 근무표 경고 기준과 비교합니다.",
    example: "3120분은 52시간입니다. 한 주 합계가 52시간이면 초과 경고가 없고, 53시간이면 경고합니다.",
    effect: "분 단위로 입력합니다. 값을 낮추면 더 이른 시점에 경고합니다. 이 값으로 근무시간을 잘라내거나 지급액을 제한하지 않습니다."
  },
  "checkbox-scheduleRequireWeeklyHoliday": {
    title: "주 1회 휴무 확인", kind: "warning",
    summary: "켜면 같은 주의 7일 모두 근무한 직원에게 경고합니다.",
    purpose: "한 주에 쉬는 날이 없는 근무표를 찾습니다. 주휴수당 지급 여부나 공휴일을 정하는 설정은 아닙니다.",
    when: "월요일부터 일요일까지 7일 모두 근무가 잡힌 직원에게 휴무일 확인 경고를 표시합니다.",
    example: "체크하면 월~일 모두 근무한 직원에게 경고합니다. 체크를 해제하면 이 휴무일 경고만 확인하지 않습니다.",
    effect: "휴무일을 자동 배정하거나 기존 근무를 삭제하지 않습니다. 주휴수당과 법정휴일수당 지급 기준도 이 체크로 바뀌지 않습니다."
  }
};

let policyHelpToken: number | undefined;

function showPolicyHelp(help: PolicyHelp, trigger: HTMLButtonElement): void {
  const content = document.createElement("div");
  content.className = "ops-policy-help";
  const badge = document.createElement("p");
  badge.className = `ops-policy-help-kind is-${help.kind}`;
  badge.textContent = help.kind === "warning" ? "근무표 확인용 · 경고 기준" : "실적 파일 읽기 · 수당 판정 기준";
  content.appendChild(badge);
  for (const [label, text] of [["어떤 기능인가요?", help.purpose], ["언제 적용되나요?", help.when], ["입력 예시", help.example], ["바꾸면 어떻게 되나요?", help.effect]]) {
    const section = document.createElement("section");
    const title = document.createElement("h3"); title.textContent = label;
    const copy = document.createElement("p"); copy.textContent = text;
    section.append(title, copy); content.appendChild(section);
  }
  sharedDialog.open({
    id: "ops-policy-help-modal", title: help.title, width: "640px", content,
    triggerElement: trigger, initialFocusSelector: "#btn-policy-help-close",
    buttons: [{ id: "btn-policy-help-close", label: "확인", variant: "primary", onClick: () => sharedDialog.close() }],
    onClose: () => { policyHelpToken = undefined; }
  });
  policyHelpToken = sharedDialog.captureToken();
}

// 운영 설정 4개 영역 뷰 헬퍼 (UI-ADMIN-01-SETTINGS: ADM01-R01~R09)
// 데이터 통신이나 API 호출 없이 뷰 상태, 접근성(WAI-ARIA 탭 패턴), 키보드 탐색, 고정 액션 바를 전담합니다.

export function createFormField(
  labelText: string,
  control: HTMLElement,
  inputId: string,
  hintText?: string
): HTMLElement {
  const help = POLICY_HELP[inputId];
  const summary = help?.summary ?? hintText;
  const group = createFormGroup(help?.title ?? labelText, control, summary);
  const label = group.querySelector("label.form-label") as HTMLLabelElement | null;
  if (label) {
    label.htmlFor = inputId;
  }
  if (help && label) {
    const heading = document.createElement("div"); heading.className = "ops-settings-field-heading";
    const button = document.createElement("button"); button.type = "button";
    button.className = "ops-settings-help-btn"; button.id = `help-${inputId}`;
    button.setAttribute("aria-label", `${help.title} 설명`);
    button.setAttribute("aria-haspopup", "dialog");
    button.textContent = "설명";
    button.addEventListener("click", () => showPolicyHelp(help, button));
    label.replaceWith(heading); heading.append(label, button);
    group.dataset.policyKind = help.kind;
  }
  if (summary) {
    const hint = group.querySelector(".form-help") as HTMLElement | null;
    if (hint) {
      const hintId = `hint-${inputId}`;
      hint.id = hintId;
      const input = group.querySelector(`#${CSS.escape(inputId)}`) as HTMLElement | null;
      input?.setAttribute("aria-describedby", hintId);
    }
  }
  return group;
}

export const SETTINGS_PATH_HINTS: Record<string, string> = {
  pendingDir: "회수한 실적 엑셀을 가져오는 위치",
  approvedDir: "승인이 끝난 실적 파일을 보관",
  scheduleExportDir: "현장에 배포할 근무표를 저장",
  allowanceProposalExportDir: "결재용 품의서 문서를 저장",
  allowanceAttachment1ExportDir: "품의서와 함께 출력되는 별첨 1을 저장",
  allowanceAttachment2ExportDir: "품의서와 함께 출력되는 별첨 2를 저장",
  databaseBackupDir: "자동·수동 백업 파일을 보관"
};

export function createReadOnlySystemInfo(info: { appName: string; dataDir: string; databasePath: string }): HTMLElement {
  const section = document.createElement("section");
  section.className = "settings-section ops-settings-section ops-settings-system-info";
  const title = document.createElement("h4"); title.className = "section-title"; title.textContent = "프로그램 정보";
  const heading = document.createElement("div"); heading.className = "ops-system-card-heading";
  const tag = document.createElement("span"); tag.className = "ops-system-tag"; tag.textContent = "조회 전용";
  heading.append(icon("desktop_windows"), title, tag);
  const grid = document.createElement("div"); grid.className = "form-grid ro-grid ops-settings-grid";
  for (const [key, label] of [["appName", "프로그램 이름"], ["dataDir", "프로그램 자료 폴더"], ["databasePath", "자료 파일 위치"]] as const) {
    const input = document.createElement("input"); input.className = "form-control"; input.id = `input-ro-${key}`; input.value = info[key]; input.title = info[key]; input.readOnly = true;
    grid.appendChild(createFormField(label, input, input.id));
  }
  section.append(heading, grid);
  return section;
}

export function formatWatchTime(value?: string): string {
  if (!value) return "확인됨";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(date);
}

export function decorateSystemSettings(slot: HTMLElement): void {
  const holiday = slot.querySelector<HTMLElement>(".settings-section:has(#input-holidayApiBaseUrl)");
  const watch = slot.querySelector<HTMLElement>(".file-watch-section");
  if (!holiday || !watch) return;
  const cards = document.createElement("div"); cards.className = "ops-system-service-grid";
  holiday.classList.add("ops-system-holiday-card");
  for (const [card, symbol, title] of [[holiday, "event_available", "공휴일 연동"], [watch, "radar", "실적 폴더 자동 감시"]] as const) {
    const heading = document.createElement("div"); heading.className = "ops-system-card-heading";
    const label = card.querySelector<HTMLElement>(".section-title")!; label.textContent = title;
    label.replaceWith(heading); heading.append(icon(symbol), label);
    if (card === watch) {
      const badge = watch.querySelector<HTMLElement>(".status-badge")!;
      badge.setAttribute("role", "status"); badge.setAttribute("aria-live", "polite");
      heading.appendChild(badge);
    }
  }
  const hint = holiday.querySelector<HTMLElement>(".form-help");
  if (hint) hint.textContent = "주소를 변경하면 아래 ‘설정 저장’을 눌러 적용하세요.";
  const watchBar = watch.querySelector<HTMLElement>(".watch-status-bar")!;
  const details = watch.querySelector<HTMLElement>(".watch-details")!;
  watchBar.before(details);
  for (const [id, symbol] of [["btn-ops-restart-watch", "play_arrow"], ["btn-stop-watch", "pause"], ["btn-ops-refresh-watch-status", "refresh"]]) {
    const button = watch.querySelector<HTMLButtonElement>(`#${id}`);
    button?.prepend(icon(symbol));
  }
  const note = document.createElement("p"); note.className = "ops-system-action-hint";
  note.textContent = "감시 제어는 즉시 적용됩니다. 중지하면 새 실적 파일의 자동 확인을 멈춥니다.";
  watch.appendChild(note);
  cards.append(holiday, watch); slot.appendChild(cards);
}

function icon(name: string, className = ""): HTMLElement {
  const span = document.createElement("span"); span.className = `material-symbols-outlined ${className}`.trim(); span.textContent = name; span.setAttribute("aria-hidden", "true"); return span;
}

export type SettingsAreaId = "folders" | "backup" | "policy" | "system";

export interface SettingsAreaMeta {
  id: SettingsAreaId;
  label: string;
  icon: string;
  hint: string;
  title: string;
  description: string;
}

export const SETTINGS_AREAS: readonly SettingsAreaMeta[] = [
  {
    id: "folders",
    icon: "folder_open",
    hint: "실적과 문서 저장 위치",
    label: "업무 폴더",
    title: "업무 폴더 경로 설정",
    description: "회수 실적이 들어오는 곳과 승인·출력 파일을 보관할 위치입니다."
  },
  {
    id: "backup",
    icon: "backup",
    hint: "자료 보관과 복원",
    label: "백업·복원",
    title: "자동 백업 및 데이터베이스 관리",
    description: "자동 백업 설정과 '즉시 백업/복원 실행'을 분리하여 안전하게 관리합니다."
  },
  {
    id: "policy",
    icon: "rule",
    hint: "근무 기준과 적용일",
    label: "근무·수당 기준",
    title: "근무표 확인 기준과 수당 적용일",
    description: "위 네 항목은 근무표 경고 기준, 아래 두 날짜는 실적 판정 기준입니다. 각 ‘설명’에서 기능과 예시를 확인하세요."
  },
  {
    id: "system",
    icon: "monitor_heart",
    hint: "기본 정보와 감시 상태",
    label: "시스템·감시",
    title: "시스템 정보 및 실시간 파일 감시",
    description: "프로그램 정보를 확인하고, 공휴일 연동과 실적 파일 자동 감시를 관리합니다."
  }
];

export const FIELD_AREA_MAP: Record<string, SettingsAreaId> = {
  pendingDir: "folders",
  approvedDir: "folders",
  scheduleExportDir: "folders",
  allowanceProposalExportDir: "folders",
  allowanceAttachment1ExportDir: "folders",
  allowanceAttachment2ExportDir: "folders",
  databaseBackupDir: "backup",
  databaseBackupSchedule: "backup",
  databaseBackupTime: "backup",
  migrationFilePath: "backup",
  scheduleConsecutiveNightLimit: "policy",
  scheduleMinimumRestMinutes: "policy",
  scheduleWeeklyMaxMinutes: "policy",
  scheduleRequireWeeklyHoliday: "policy",
  substituteAllowancePolicyEffectiveFrom: "policy",
  changedSlotPriorityEffectiveFrom: "policy",
  holidayApiBaseUrl: "system"
};

export interface OperationsSettingsViewDelegate {
  onBeforeAreaChange?: (targetArea: SettingsAreaId) => boolean;
  onSave?: () => void;
  onRevert?: () => void;
}

export class OperationsSettingsView {
  private layoutObserver?: ResizeObserver;
  private delegate: OperationsSettingsViewDelegate;
  private activeAreaId: SettingsAreaId = "folders";
  private rootEl?: HTMLElement;
  private tabButtons: Map<SettingsAreaId, HTMLButtonElement> = new Map();
  private panelEls: Map<SettingsAreaId, HTMLElement> = new Map();
  private panelSlots: Map<SettingsAreaId, HTMLElement> = new Map();
  private dirtyStatusEl?: HTMLElement;
  private btnSaveEl?: HTMLButtonElement;
  private btnRevertEl?: HTMLButtonElement;

  constructor(delegate: OperationsSettingsViewDelegate) {
    this.delegate = delegate;
  }

  public mount(container: HTMLElement): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "operations-settings-wrap ops-settings-workspace ops-menu-workspace";
    wrap.dataset.opsMenu = "settings";
    this.rootEl = wrap;

    // 1. 헤더 (간결한 제목 및 목적 안내)
    const header = document.createElement("div");
    header.className = "tab-header ops-settings-header";
    const headerTextGroup = document.createElement("div");
    headerTextGroup.className = "ops-settings-headline";
    const title = document.createElement("h3");
    title.className = "tab-title";
    title.textContent = "업무 환경 설정";
    const subtitle = document.createElement("p");
    subtitle.className = "ops-settings-caption";
    subtitle.textContent = "필요한 설정을 왼쪽에서 선택하세요. 변경한 항목은 저장 후 적용됩니다.";
    headerTextGroup.appendChild(title);
    headerTextGroup.appendChild(subtitle);
    header.append(icon("tune", "ops-settings-hero-icon"), headerTextGroup);
    wrap.appendChild(header);

    // 2. 본문 영역: 왼쪽(또는 상단) 탭 내비게이션 + 오른쪽 패널
    const body = document.createElement("div");
    body.className = "ops-settings-body";

    // 탭 목록 (role="tablist")
    const nav = document.createElement("div");
    nav.className = "ops-settings-nav ops-category-nav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "운영 설정 영역 선택");

    SETTINGS_AREAS.forEach((area) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = `btn-settings-area-${area.id}`;
      btn.className = "ops-settings-tab-btn ops-category-button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-controls", `settings-area-${area.id}`);
      btn.setAttribute("aria-selected", area.id === this.activeAreaId ? "true" : "false");
      btn.tabIndex = area.id === this.activeAreaId ? 0 : -1;

      const labelSpan = document.createElement("span");
      labelSpan.className = "ops-settings-tab-label";
      labelSpan.textContent = area.label;
      btn.setAttribute("aria-label", area.label);
      const copy = document.createElement("span"); copy.className = "ops-settings-tab-copy";
      const hint = document.createElement("small"); hint.className = "ops-settings-tab-hint"; hint.id = `settings-hint-${area.id}`; hint.textContent = area.hint;
      btn.setAttribute("aria-describedby", hint.id);
      copy.append(labelSpan, hint);
      btn.append(icon(area.icon, "ops-settings-nav-icon"), copy, icon("chevron_right", "ops-settings-nav-arrow"));

      btn.addEventListener("click", () => {
        this.selectArea(area.id);
      });

      btn.addEventListener("keydown", (e: KeyboardEvent) => {
        this.handleTabKeyDown(e, area.id);
      });

      this.tabButtons.set(area.id, btn);
      nav.appendChild(btn);
    });
    body.appendChild(nav);

    // 패널 컨테이너
    const panelsWrap = document.createElement("div");
    panelsWrap.className = "ops-settings-panels";

    SETTINGS_AREAS.forEach((area) => {
      const panel = document.createElement("div");
      panel.id = `settings-area-${area.id}`;
      panel.className = "ops-settings-area-panel";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `btn-settings-area-${area.id}`);
      panel.tabIndex = 0;
      if (area.id !== this.activeAreaId) {
        panel.hidden = true;
      }

      // 패널 헤더 (영역별 안내 문구)
      const panelHeader = document.createElement("div");
      panelHeader.className = "ops-settings-panel-header ops-menu-heading";
      const panelTitle = document.createElement("h4");
      panelTitle.className = "ops-settings-panel-title ops-menu-title";
      panelTitle.textContent = area.title;
      const panelDesc = document.createElement("p");
      panelDesc.className = "ops-settings-panel-desc ops-menu-description";
      panelDesc.textContent = area.description;
      panelHeader.appendChild(panelTitle);
      panelHeader.appendChild(panelDesc);
      panel.appendChild(panelHeader);

      // 패널 콘텐츠 슬롯
      const contentSlot = document.createElement("div");
      contentSlot.className = "ops-settings-panel-content";
      panel.appendChild(contentSlot);

      this.panelEls.set(area.id, panel);
      this.panelSlots.set(area.id, contentSlot);
      panelsWrap.appendChild(panel);
    });
    body.appendChild(panelsWrap);
    wrap.appendChild(body);

    // 3. 하단 고정 액션 바
    const footer = document.createElement("div");
    footer.className = "ops-settings-footer ops-menu-footer";

    const statusCol = document.createElement("div");
    statusCol.className = "ops-settings-status-col";
    const dirtyStatus = document.createElement("span");
    dirtyStatus.id = "ops-settings-dirty-status";
    dirtyStatus.className = "ops-settings-dirty-status status-clean";
    dirtyStatus.setAttribute("aria-live", "polite");
    dirtyStatus.textContent = "저장된 설정";
    this.dirtyStatusEl = dirtyStatus;
    statusCol.appendChild(dirtyStatus);
    footer.appendChild(statusCol);

    const actionCol = document.createElement("div");
    actionCol.className = "ops-settings-action-col";

    const btnRevert = document.createElement("button");
    btnRevert.type = "button";
    btnRevert.id = "btn-revert-settings";
    btnRevert.className = "btn btn-secondary ops-btn-revert";
    btnRevert.append(icon("restart_alt"), document.createTextNode("설정 되돌리기"));
    btnRevert.disabled = true;
    btnRevert.addEventListener("click", () => {
      this.delegate.onRevert?.();
    });
    this.btnRevertEl = btnRevert;
    actionCol.appendChild(btnRevert);

    const btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.id = "btn-save-settings";
    btnSave.className = "btn btn-primary ops-btn-save";
    btnSave.append(icon("save"), document.createTextNode("설정 저장"));
    btnSave.addEventListener("click", () => {
      this.delegate.onSave?.();
    });
    this.btnSaveEl = btnSave;
    actionCol.appendChild(btnSave);

    footer.appendChild(actionCol);
    wrap.appendChild(footer);

    container.appendChild(wrap);
    this.layoutObserver?.disconnect();
    this.layoutObserver = new ResizeObserver(() => nav.setAttribute("aria-orientation", window.innerWidth <= 1100 ? "horizontal" : "vertical"));
    this.layoutObserver.observe(wrap);
    return wrap;
  }

  public getPanelSlot(areaId: SettingsAreaId): HTMLElement {
    const slot = this.panelSlots.get(areaId);
    if (!slot) {
      throw new Error(`Settings area slot not found: ${areaId}`);
    }
    return slot;
  }

  public getActiveArea(): SettingsAreaId {
    return this.activeAreaId;
  }

  public selectArea(areaId: SettingsAreaId): boolean {
    if (this.activeAreaId === areaId) return true;
    if (this.delegate.onBeforeAreaChange && !this.delegate.onBeforeAreaChange(areaId)) {
      return false;
    }

    this.activeAreaId = areaId;

    this.tabButtons.forEach((btn, id) => {
      const isSelected = id === areaId;
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
      btn.tabIndex = isSelected ? 0 : -1;
      if (isSelected) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });

    this.panelEls.forEach((panel, id) => {
      panel.hidden = id !== areaId;
    });

    return true;
  }

  public focusField(fieldKey: string): void {
    const targetArea = FIELD_AREA_MAP[fieldKey];
    if (targetArea) {
      this.selectArea(targetArea);
    }
    const input = document.getElementById(`input-${fieldKey}`) ||
      document.getElementById(`select-${fieldKey}`) ||
      document.getElementById(`checkbox-${fieldKey}`);
    if (input instanceof HTMLElement) {
      input.focus();
    }
  }

  public updateDirtyStatus(dirtyCount: number, isSaving = false): void {
    if (!this.dirtyStatusEl) return;

    if (isSaving) {
      this.dirtyStatusEl.textContent = "저장 중...";
      this.dirtyStatusEl.className = "ops-settings-dirty-status status-saving";
    } else if (dirtyCount > 0) {
      this.dirtyStatusEl.textContent = `저장되지 않은 변경 ${dirtyCount}개`;
      this.dirtyStatusEl.className = "ops-settings-dirty-status status-dirty";
    } else {
      this.dirtyStatusEl.textContent = "저장된 설정";
      this.dirtyStatusEl.className = "ops-settings-dirty-status status-clean";
    }

    if (this.btnRevertEl) {
      this.btnRevertEl.disabled = dirtyCount === 0 || isSaving;
    }
    if (this.btnSaveEl) {
      this.btnSaveEl.disabled = isSaving;
    }
  }

  public destroy(): void {
    this.layoutObserver?.disconnect();
    if (policyHelpToken !== undefined && sharedDialog.isCurrent(policyHelpToken)) sharedDialog.close();
    this.tabButtons.clear();
    this.panelEls.clear();
    this.panelSlots.clear();
    if (this.rootEl) {
      this.rootEl.innerHTML = "";
    }
  }

  private handleTabKeyDown(e: KeyboardEvent, currentId: SettingsAreaId): void {
    const areaIds = SETTINGS_AREAS.map((a) => a.id);
    const currentIndex = areaIds.indexOf(currentId);
    let nextIndex = -1;

    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + areaIds.length) % areaIds.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % areaIds.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = areaIds.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextAreaId = areaIds[nextIndex];
    if (this.selectArea(nextAreaId)) {
      this.tabButtons.get(nextAreaId)?.focus();
    }
  }
}

export function createPolicyManageSection(
  onOpenSubstitute: () => void,
  onOpenSlot: () => void
): HTMLElement {
  const sec = document.createElement("div");
  sec.className = "settings-section ops-settings-section policy-manage-section";
  const title = document.createElement("h4");
  title.className = "section-title";
  title.textContent = "기간별 정책 버전 및 적용 이력 관리";
  sec.appendChild(title);

  const notice = document.createElement("p");
  notice.className = "policy-notice-text";
  notice.textContent = "정책은 [이력 및 관리] 대화상자에서 영향 확인 후 즉시 등록됩니다. 아래 [설정 저장] 버튼은 일반 설정과 근무표 확인 경고 기준에만 적용됩니다.";
  sec.appendChild(notice);

  const grid = document.createElement("div");
  grid.className = "policy-summary-grid";

  // 카드 1: 대체근무수당
  const subCard = document.createElement("div");
  subCard.className = "policy-summary-card active-card";
  subCard.innerHTML = `
    <div class="policy-card-header">
      <h5 class="policy-card-title">대체근무수당 지급 대상 정책</h5>
      <span class="policy-status-badge policy-status-active">버전 관리</span>
    </div>
    <div class="policy-card-body">근무일별 대체수당 지급 대상 판정 기준을 관리합니다.</div>
    <div class="policy-card-actions">
      <button type="button" class="btn btn-secondary btn-sm policy-btn-page" id="btn-open-substitute-policy">이력 및 관리</button>
    </div>
  `;
  subCard.querySelector("#btn-open-substitute-policy")!.addEventListener("click", onOpenSubstitute);
  grid.appendChild(subCard);

  // 카드 2: 실제 근무자
  const slotCard = document.createElement("div");
  slotCard.className = "policy-summary-card active-card";
  slotCard.innerHTML = `
    <div class="policy-card-header">
      <h5 class="policy-card-title">실제 근무자 우선순위 정책</h5>
      <span class="policy-status-badge policy-status-active">버전 관리</span>
    </div>
    <div class="policy-card-body">변경 전·후 근무자가 다를 때 실적에 반영할 사람을 정합니다.</div>
    <div class="policy-card-actions">
      <button type="button" class="btn btn-secondary btn-sm policy-btn-page" id="btn-open-changed-slot-policy">이력 및 관리</button>
    </div>
  `;
  slotCard.querySelector("#btn-open-changed-slot-policy")!.addEventListener("click", onOpenSlot);
  grid.appendChild(slotCard);

  sec.appendChild(grid);
  return sec;
}
