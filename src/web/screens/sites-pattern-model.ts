// sites-pattern-model.ts — 근무 패턴, 팔레트, 사이클, 개별 토글, Undo/Redo 및 템플릿 모델
import type {
  ShiftPatternDutyTypeInput,
  ShiftPatternCycleInput,
  ShiftPatternStepInput,
  ShiftPatternTeamIndexInput,
  ShiftPatternTeamSettingInput,
  ShiftPatternTeamCapacityInput,
  ShiftPatternTeamCycleAssignmentInput,
  ShiftPatternUpsertInput
} from "../../shared/bridge/contracts";
import type { PatternStatus, ShiftPatternRecord } from "../../shared/domain/model";
import { validateDutyCatalog, isOffDutyCode } from "../../shared/domain/duty-type-catalog";
import { getShiftPatternEffectiveFromError } from "../../shared/domain/shift-pattern-version";
import { buildShiftPatternStepsFromPatternString, parseCompressedShiftPatternString, getShiftPatternDisplayLabels } from "../../shared/domain/shift-pattern-compression";
import type { SitePatternImportAnalysis } from "../../shared/bridge/contracts";
import { isValidDateString } from "./sites-model";

export interface PatternDraft {
  siteId: string;
  patternId?: string;
  name: string;
  teamCount: number;
  requestedCycleCount?: number;
  patternCode: string;
  startIndexRule: string;
  patternStartDate?: string;
  effectiveFrom?: string;
  status: PatternStatus;
  // 팔레트 정의 (근무형 최대 3개, 휴무형 여러 개)
  dutyTypes: ShiftPatternDutyTypeInput[];
  // 묶음 사이클 목록
  cycles: ShiftPatternCycleInput[];
  // 조별 묶음 배정
  teamCycleAssignments: ShiftPatternTeamCycleAssignmentInput[];
  // 조별 정원
  teamCapacities: ShiftPatternTeamCapacityInput[];
  // 조별 설정
  teamSettings: ShiftPatternTeamSettingInput[];
  // 개별 패턴 토글 활성화 여부
  isPerTeamPattern: boolean;
  sharedAssignments?: ShiftPatternTeamCycleAssignmentInput[];
  dutyCodes?: Record<string, string>;
  baselineRevision?: string;
  // Pool 설정
  poolEnabled: boolean;
  poolStartTime?: string;
  poolEndTime?: string;
  poolBreakMinutes?: number;
}

export interface PatternValidationResult {
  isValid: boolean;
  issues: Array<{ field: string; message: string; step: "basics" | "pattern" | "organization" }>;
}

/**
 * 기본 표준 팔레트 생성
 */
export function createDefaultDutyTypes(): ShiftPatternDutyTypeInput[] {
  return [
    {
      id: "duty-day",
      kind: "work",
      label: "주간",
      sortOrder: 0,
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      isBreakDirty: false
    },
    {
      id: "duty-night",
      kind: "work",
      label: "야간",
      sortOrder: 1,
      startTime: "18:00",
      endTime: "09:00",
      breakMinutes: 60,
      isBreakDirty: false
    },
    {
      id: "duty-off",
      kind: "off",
      label: "휴무",
      sortOrder: 2,
      breakMinutes: 0
    }
  ];
}

/**
 * 기본 4조 3교대 템플릿 생성
 */
export function create4Team3ShiftTemplate(siteId: string, name = "4조 3교대 패턴"): PatternDraft {
  const dutyTypes: ShiftPatternDutyTypeInput[] = [
    {
      id: "duty-day",
      kind: "work",
      label: "주간",
      sortOrder: 0,
      startTime: "07:00",
      endTime: "15:00",
      breakMinutes: 60,
      isBreakDirty: false
    },
    {
      id: "duty-evening",
      kind: "work",
      label: "석간",
      sortOrder: 1,
      startTime: "15:00",
      endTime: "23:00",
      breakMinutes: 60,
      isBreakDirty: false
    },
    {
      id: "duty-night",
      kind: "work",
      label: "야간",
      sortOrder: 2,
      startTime: "23:00",
      endTime: "07:00",
      breakMinutes: 60,
      isBreakDirty: false
    },
    {
      id: "duty-off",
      kind: "off",
      label: "휴무",
      sortOrder: 3,
      breakMinutes: 0
    }
  ];

  // 4일 주기: 주 / 석 / 야 / 휴
  const steps: ShiftPatternStepInput[] = [
    { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "15:00", breakMinutes: 60 },
    { stepIndex: 1, dutyCode: "E", startTime: "15:00", endTime: "23:00", breakMinutes: 60 },
    { stepIndex: 2, dutyCode: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 60 },
    { stepIndex: 3, dutyCode: "O", breakMinutes: 0 }
  ];

  const teamLabels = ["A조", "B조", "C조", "D조"];
  const teamIndexes: ShiftPatternTeamIndexInput[] = teamLabels.map((team, idx) => ({
    teamLabel: team,
    index: idx % 4
  }));

  const cycle: ShiftPatternCycleInput = {
    cycleKey: "cycle-main",
    name: "기본 묶음",
    order: 0,
    shiftCount: 3, // 3교대 (주간, 석간, 야간)
    patternCode: "D-E-N-O",
    steps,
    teamIndexes,
    holidayTimeMode: "unified",
    weekdayPublicHolidayAsHoliday: false
  };

  const teamCycleAssignments: ShiftPatternTeamCycleAssignmentInput[] = teamLabels.map((team) => ({
    teamLabel: team,
    cycleKey: "cycle-main"
  }));

  const teamSettings: ShiftPatternTeamSettingInput[] = teamLabels.map((team, idx) => ({
    teamLabel: team,
    displayName: `${idx + 1}조`,
    workType: "ROTATING",
    isActive: true,
    sortOrder: idx
  }));

  const teamCapacities: ShiftPatternTeamCapacityInput[] = teamLabels.map((team) => ({
    teamLabel: team,
    maxHeadcount: undefined
  }));

  return {
    siteId,
    name,
    teamCount: 4,
    patternCode: "D-E-N-O",
    startIndexRule: "manual",
    effectiveFrom: "2026-01-01",
    status: "active",
    dutyTypes,
    cycles: [cycle],
    teamCycleAssignments,
    teamCapacities,
    teamSettings,
    isPerTeamPattern: false,
    poolEnabled: false
  };
}

/**
 * 기본 2조 2교대 템플릿 생성
 */
export function create2Team2ShiftTemplate(siteId: string, name = "2조 2교대 패턴"): PatternDraft {
  const dutyTypes: ShiftPatternDutyTypeInput[] = [
    {
      id: "duty-day",
      kind: "work",
      label: "주간",
      sortOrder: 0,
      startTime: "09:00",
      endTime: "21:00",
      breakMinutes: 90,
      isBreakDirty: false
    },
    {
      id: "duty-night",
      kind: "work",
      label: "야간",
      sortOrder: 1,
      startTime: "21:00",
      endTime: "09:00",
      breakMinutes: 90,
      isBreakDirty: false
    },
    {
      id: "duty-off",
      kind: "off",
      label: "휴무",
      sortOrder: 2,
      breakMinutes: 0
    }
  ];

  // 4일 주기: 주 / 야 / 휴 / 휴
  const steps: ShiftPatternStepInput[] = [
    { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "21:00", breakMinutes: 90 },
    { stepIndex: 1, dutyCode: "N", startTime: "21:00", endTime: "09:00", breakMinutes: 90 },
    { stepIndex: 2, dutyCode: "O", breakMinutes: 0 },
    { stepIndex: 3, dutyCode: "O", breakMinutes: 0 }
  ];

  const teamLabels = ["A조", "B조"];
  const teamIndexes: ShiftPatternTeamIndexInput[] = [
    { teamLabel: "A조", index: 0 },
    { teamLabel: "B조", index: 2 }
  ];

  const cycle: ShiftPatternCycleInput = {
    cycleKey: "cycle-main",
    name: "기본 묶음",
    order: 0,
    shiftCount: 2, // 2교대 (주간, 야간)
    patternCode: "D-N-O-O",
    steps,
    teamIndexes,
    holidayTimeMode: "unified",
    weekdayPublicHolidayAsHoliday: false
  };

  const teamCycleAssignments: ShiftPatternTeamCycleAssignmentInput[] = teamLabels.map((team) => ({
    teamLabel: team,
    cycleKey: "cycle-main"
  }));

  const teamSettings: ShiftPatternTeamSettingInput[] = teamLabels.map((team, idx) => ({
    teamLabel: team,
    displayName: `${idx + 1}조`,
    workType: "ROTATING",
    isActive: true,
    sortOrder: idx
  }));

  const teamCapacities: ShiftPatternTeamCapacityInput[] = teamLabels.map((team) => ({
    teamLabel: team,
    maxHeadcount: undefined
  }));

  return {
    siteId,
    name,
    teamCount: 2,
    patternCode: "D-N-O-O",
    startIndexRule: "manual",
    effectiveFrom: "2026-01-01",
    status: "active",
    dutyTypes,
    cycles: [cycle],
    teamCycleAssignments,
    teamCapacities,
    teamSettings,
    isPerTeamPattern: false,
    poolEnabled: false
  };
}

/**
 * 개별 패턴 토글 전환 처리
 * ON: 각 조별로 전용 묶음 분리 생성 (최대 8개 제한)
 * OFF: 원래의 단일 공유 묶음으로 복귀하되 전용 묶음 데이터는 비파괴 보존
 */
export function togglePerTeamPattern(draft: PatternDraft, enable: boolean): { success: boolean; error?: string } {
  const active = draft.teamSettings.filter(t => t.isActive !== false && t.workType !== "POOL");
  const next = structuredClone(draft.cycles);
  if (enable) {
    const assignments = structuredClone(draft.teamCycleAssignments);
    for (const team of active) {
      const original = assignments.find(a => a.teamLabel === team.teamLabel);
      const source = next.find(c => c.cycleKey === original?.cycleKey);
      if (!source) return { success: false, error: `${team.displayName || team.teamLabel}의 공유 묶음을 먼저 지정해 주세요.` };
      if (source.cycleKey.startsWith("team:")) continue;
      const key = `team:${encodeURIComponent(team.teamLabel)}:${encodeURIComponent(source.cycleKey)}`;
      if (!next.some(c => c.cycleKey === key)) next.push({ ...structuredClone(source), cycleKey: key, name: `${team.displayName || team.teamLabel} 전용`, order: next.length });
      original!.cycleKey = key;
    }
    if (next.length > 8) return { success: false, error: "보존할 묶음과 전용 묶음을 합쳐 8개를 넘습니다. 공유 묶음 구성을 확인해 주세요." };
    draft.sharedAssignments = structuredClone(draft.teamCycleAssignments);
    draft.cycles = next;
    draft.teamCycleAssignments = assignments;
  } else {
    const restored = structuredClone(draft.teamCycleAssignments);
    for (const team of active) {
      const current = restored.find(a => a.teamLabel === team.teamLabel);
      const saved = draft.sharedAssignments?.find(a => a.teamLabel === team.teamLabel);
      const parts = current?.cycleKey.split(":");
      const origin = saved?.cycleKey || (parts?.length === 3 && parts[0] === "team" ? decodeURIComponent(parts[2]) : undefined);
      if (current?.cycleKey.startsWith("team:") && (!origin || !next.some(c => c.cycleKey === origin))) return { success: false, error: "원래 공유 묶음을 확인할 수 없습니다. 조별 묶음을 직접 지정해 주세요." };
      if (current && origin) current.cycleKey = origin;
    }
    draft.teamCycleAssignments = restored;
  }
  draft.isPerTeamPattern = enable;
  return { success: true };
}

export class PatternHistoryManager {
  private history: string[] = [];
  private pointer = -1;
  private context = "";
  private key(d: PatternDraft): string { return `${d.siteId}|${d.patternId || "new"}|${d.baselineRevision || ""}|${d.effectiveFrom || ""}`; }
  public record(d: PatternDraft): void {
    const key = this.key(d); if (key !== this.context) this.clear(key);
    const raw = JSON.stringify(d); if (this.history[this.pointer] === raw) return;
    this.history = this.history.slice(0, this.pointer + 1); this.history.push(raw);
    if (this.history.length > 100) this.history.shift();
    this.pointer = this.history.length - 1;
  }
  private matches(current?: PatternDraft): boolean { return !current || (this.context === this.key(current) && this.history[this.pointer] === JSON.stringify(current)); }
  public canUndo(current?: PatternDraft): boolean { return this.pointer > 0 && this.matches(current); }
  public canRedo(current?: PatternDraft): boolean { return this.pointer < this.history.length - 1 && this.matches(current); }
  public undo(current?: PatternDraft): PatternDraft | null { if (!this.canUndo(current)) return null; return JSON.parse(this.history[--this.pointer]) as PatternDraft; }
  public redo(current?: PatternDraft): PatternDraft | null { if (!this.canRedo(current)) return null; return JSON.parse(this.history[++this.pointer]) as PatternDraft; }
  public clear(context = ""): void { this.history = []; this.pointer = -1; this.context = context; }
}

/**
 * 시간 문자열(HH:MM) 유효성 검증
 */
function isValidTimeString(timeStr?: string): boolean {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return false;
  const [h, m] = timeStr.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * 전체 마법사 초안에 대한 종합 검토(1-C) 수행
 */
export function validatePatternDraft(draft: PatternDraft, siteName: string, existingPatterns: ShiftPatternRecord[] = []): PatternValidationResult {
  const issues: Array<{ field: string; message: string; step: "basics" | "pattern" | "organization" }> = [];

  // 1-A 기본 설정 검증
  if (!siteName || !siteName.trim()) {
    issues.push({ field: "siteName", message: "근무지 이름을 입력해 주세요.", step: "basics" });
  }
  if (!draft.name || !draft.name.trim()) {
    issues.push({ field: "patternName", message: "패턴 설정 이름을 입력해 주세요.", step: "basics" });
  }
  if (!draft.effectiveFrom || !draft.effectiveFrom.trim()) {
    issues.push({ field: "effectiveFrom", message: "설정 적용 시작일을 선택해 주세요.", step: "basics" });
  } else if (!isValidDateString(draft.effectiveFrom)) {
    issues.push({ field: "effectiveFrom", message: "올바른 날짜(YYYY-MM-DD) 형식을 입력해 주세요.", step: "basics" });
  }

  if (draft.patternStartDate && !isValidDateString(draft.patternStartDate)) {
    issues.push({ field: "patternStartDate", message: "올바른 기준 시작일(YYYY-MM-DD) 형식을 입력해 주세요.", step: "basics" });
  }

  if (draft.teamCount < 2 || draft.teamCount > 8) {
    issues.push({ field: "teamCount", message: "조 수는 2개 이상 8개 이하여야 합니다.", step: "basics" });
  }

  // 1-B 근무시간 및 패턴 검증
  const workDutyTypes = draft.dutyTypes.filter((d) => d.kind === "work");
  if (workDutyTypes.length === 0) {
    issues.push({ field: "dutyTypes", message: "최소 1개 이상의 근무형이 등록되어야 합니다.", step: "pattern" });
  }
  if (workDutyTypes.length > 3) {
    issues.push({ field: "dutyTypes", message: "근무형은 최대 3개까지만 등록할 수 있습니다.", step: "pattern" });
  }

  // 팔레트 시간 검증
  for (const duty of workDutyTypes) {
    if (!duty.startTime || !duty.endTime) {
      issues.push({
        field: `duty-${duty.id}`,
        message: `${duty.label}의 시작 및 종료 시간을 입력해 주세요.`,
        step: "pattern"
      });
    } else if (!isValidTimeString(duty.startTime) || !isValidTimeString(duty.endTime)) {
      issues.push({
        field: `duty-${duty.id}`,
        message: `${duty.label}의 시작 또는 종료 시간 형식(HH:MM)이 올바르지 않습니다.`,
        step: "pattern"
      });
    }
  }

  // 사이클 검증
  if (draft.cycles.length === 0) {
    issues.push({ field: "cycles", message: "최소 1개 이상의 근무 묶음이 필요합니다.", step: "pattern" });
  }
  if (draft.cycles.length > 8) {
    issues.push({ field: "cycles", message: "근무 묶음은 최대 8개까지만 생성할 수 있습니다.", step: "pattern" });
  }

  for (const cycle of draft.cycles) {
    if(new Set(cycle.steps.filter(s=>!isOffDutyCode(s.dutyCode)).map(s=>s.dutyCode)).size>cycle.shiftCount)issues.push({field:`cycle-${cycle.cycleKey}`,message:"사용 중인 근무 유형보다 교대 횟수가 적습니다. 셀을 먼저 수정해 주세요.",step:"pattern"});
    if (!cycle.steps || cycle.steps.length === 0) {
      issues.push({
        field: `cycle-${cycle.cycleKey}`,
        message: `${cycle.name}의 근무 일차(스텝)가 비어 있습니다.`,
        step: "pattern"
      });
    }
    for (const step of cycle.steps || []) {
      if (step.startTime && !isValidTimeString(step.startTime)) {
        issues.push({
          field: `step-${cycle.cycleKey}-${step.stepIndex}`,
          message: `${cycle.name} ${step.stepIndex + 1}일차 시작 시간 형식(HH:MM)이 올바르지 않습니다.`,
          step: "pattern"
        });
      }
      if (step.endTime && !isValidTimeString(step.endTime)) {
        issues.push({
          field: `step-${cycle.cycleKey}-${step.stepIndex}`,
          message: `${cycle.name} ${step.stepIndex + 1}일차 종료 시간 형식(HH:MM)이 올바르지 않습니다.`,
          step: "pattern"
        });
      }
    }
  }

  // 조별 묶음 배정 검증
  for (const team of draft.teamSettings) {
    if (team.isActive !== false) {
      const assignment = draft.teamCycleAssignments.find((a) => a.teamLabel === team.teamLabel);
      if (!assignment || !assignment.cycleKey) {
        issues.push({
          field: `assignment-${team.teamLabel}`,
          message: `${team.displayName || team.teamLabel}에 근무 묶음이 배정되지 않았습니다.`,
          step: "pattern"
        });
      }
    }
  }

  // 정원(Capacity) 검증
  for (const cap of draft.teamCapacities || []) {
    if (typeof cap.maxHeadcount === "number" && cap.maxHeadcount < 0) {
      issues.push({
        field: `capacity-${cap.teamLabel}`,
        message: `${cap.teamLabel}의 최대 정원은 0명 이상이어야 합니다.`,
        step: "organization"
      });
    }
  }

  // Pool 시간 검증
  if (draft.poolEnabled) {
    if (draft.poolStartTime && !isValidTimeString(draft.poolStartTime)) {
      issues.push({
        field: "poolStartTime",
        message: "풀 시작 시간 형식(HH:MM)이 올바르지 않습니다.",
        step: "pattern"
      });
    }
    if (draft.poolEndTime && !isValidTimeString(draft.poolEndTime)) {
      issues.push({
        field: "poolEndTime",
        message: "풀 종료 시간 형식(HH:MM)이 올바르지 않습니다.",
        step: "pattern"
      });
    }
  }

  const add = (field: string, message: string, step: "basics" | "pattern" | "organization" = "pattern") => issues.push({ field, message, step });
  if (!Number.isInteger(draft.teamCount)) add("teamCount", "조 수는 정수로 입력해 주세요.", "basics");
  if(draft.requestedCycleCount!==undefined && (!Number.isInteger(draft.requestedCycleCount)||draft.requestedCycleCount<1||draft.requestedCycleCount>8||draft.requestedCycleCount!==draft.cycles.length))add("cycles","묶음 개수와 보존할 설정을 확인해 주세요.","basics");
  const dateError = getShiftPatternEffectiveFromError({ editingPatternId: draft.patternId, effectiveFrom: draft.effectiveFrom || "", patterns: existingPatterns.filter(p => p.siteId === draft.siteId) });
  if (dateError) add("effectiveFrom", dateError, "basics");
  for (const msg of validateDutyCatalog(draft.dutyTypes.map((d,i)=>({...d,sortOrder:d.sortOrder??i}))).errors) add("dutyTypes", msg);
  const cycles = new Map(draft.cycles.map(c => [c.cycleKey, c]));
  if (cycles.size !== draft.cycles.length) add("cycles", "묶음 식별자가 중복되어 있습니다.");
  const teams = new Set(draft.teamSettings.map(t => t.teamLabel));
  for(const t of draft.teamSettings)if(!Number.isInteger(t.sortOrder??0)||(t.sortOrder??0)<0||!["ROTATING","FIXED_DAY","POOL"].includes(t.workType||"ROTATING"))add("teams","조의 표시 순서와 근무 유형을 확인해 주세요.","organization");
  if (teams.size !== draft.teamSettings.length) add("teams", "조 식별자가 중복되어 있습니다.");
  const codes = getDutyCodes(draft.dutyTypes, draft.dutyCodes);
  for (const cycle of draft.cycles) {
    if (!Number.isInteger(cycle.shiftCount) || cycle.shiftCount < 1 || cycle.shiftCount > 3) add(`cycle-${cycle.cycleKey}`, "교대 횟수는 1~3회입니다. 주기 일수와 구분해 주세요.");
    if (cycle.patternStartDate && !isValidDateString(cycle.patternStartDate)) add(`cycle-${cycle.cycleKey}`, "묶음 기준일을 확인해 주세요.");
    for (const [index, row] of cycle.steps.entries()) {
      if (row.stepIndex !== index) add(`cycle-${cycle.cycleKey}`, "일차 순서가 올바르지 않습니다.");
      if (!isOffDutyCode(row.dutyCode) && !Object.values(codes).includes(row.dutyCode)) add(`cycle-${cycle.cycleKey}`, `알 수 없는 근무 코드 ${row.dutyCode}를 다시 선택해 주세요.`);
      if (!isOffDutyCode(row.dutyCode) && (!isValidTimeString(row.startTime) || !isValidTimeString(row.endTime))) add(`cycle-${cycle.cycleKey}`, "근무 셀의 시작·종료 시간을 확인해 주세요.");
      for (const value of [row.breakMinutes, row.holidayBreakMinutes]) if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 1440)) add(`cycle-${cycle.cycleKey}`, "휴게시간은 0~1440분 정수로 입력해 주세요.");
      for (const value of [row.holidayStartTime, row.holidayEndTime]) if (value && !isValidTimeString(value)) add(`cycle-${cycle.cycleKey}`, "휴일 근무시간을 확인해 주세요.");
    }
  }
  for (const team of draft.teamSettings.filter(t => t.isActive !== false)) {
    const a = draft.teamCycleAssignments.find(a => a.teamLabel === team.teamLabel);
    if (team.workType === "POOL" && !a) continue;
    const cycle = cycles.get(a?.cycleKey || "");
    if (!cycle) { add(`assignment-${team.teamLabel}`, `${team.displayName || team.teamLabel}의 묶음을 확인해 주세요.`); continue; }
    const idx = cycle.teamIndexes.find(i => i.teamLabel === team.teamLabel)?.index;
    if (idx === undefined || !Number.isInteger(idx) || idx < 0 || idx >= cycle.steps.length) add(`assignment-${team.teamLabel}`, `${team.displayName || team.teamLabel}의 시작 위치를 확인해 주세요.`);
  }
  for (const cap of draft.teamCapacities) if (cap.maxHeadcount !== undefined && (!Number.isInteger(cap.maxHeadcount) || cap.maxHeadcount < 0)) add(`capacity-${cap.teamLabel}`, "정원은 빈칸(무제한) 또는 0 이상의 정수입니다.", "organization");
  if (draft.poolEnabled && (!isValidTimeString(draft.poolStartTime) || !isValidTimeString(draft.poolEndTime))) add("poolStartTime", "Pool 시작·종료 시간을 입력해 주세요.", "basics");
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Draft를 ShiftPatternUpsertInput 형식으로 직렬화 변환한다.
 */
export function serializePatternDraft(draft: PatternDraft): ShiftPatternUpsertInput {
  const primaryCycle = draft.cycles[0];
  const steps = primaryCycle?.steps || [];
  const teamIndexes = primaryCycle?.teamIndexes || [];

  return {
    id: draft.patternId,
    siteId: draft.siteId,
    name: draft.name,
    teamCount: draft.teamCount,
    patternCode: steps.map(s => s.dutyCode).join("-"),
    startIndexRule: draft.startIndexRule || "manual",
    patternStartDate: draft.patternStartDate || draft.effectiveFrom,
    effectiveFrom: draft.effectiveFrom,
    status: draft.status,
    steps,
    teamIndexes,
    cycles: draft.cycles.map(c=>({...c,patternCode:c.steps.map(s=>s.dutyCode).join("-"),patternStartDate:c.patternStartDate || draft.patternStartDate || draft.effectiveFrom})),
    teamCycleAssignments: draft.teamCycleAssignments,
    teamCapacities: draft.teamCapacities,
    teamSettings: draft.teamSettings,
    dutyTypes: draft.dutyTypes.map((d,i) => {const slot=["D","E","N"].indexOf(getDutyCodes(draft.dutyTypes,draft.dutyCodes)[d.id]);return {...d,sortOrder:d.kind==="off" ? 10+i : slot>=0?slot:d.sortOrder??i};}),
    poolEnabled: draft.poolEnabled,
    poolStartTime: draft.poolStartTime,
    poolEndTime: draft.poolEndTime,
    poolBreakMinutes: draft.poolBreakMinutes
  };
}


/** Identity comes from immutable IDs/order, never from an editable label. */
export function getDutyCodes(types: ShiftPatternDutyTypeInput[], previous: Record<string,string> = {}): Record<string,string> {
  const result: Record<string,string> = {}; const used = new Set<string>();
  const work = types.filter(d => d.kind === "work").slice().sort((a,b)=>(a.sortOrder ?? 0)-(b.sortOrder ?? 0));
  const known: Record<string,string> = { D:"D", E:"E", N:"N", "duty-D":"D", "duty-E":"E", "duty-N":"N", "duty-day":"D", "duty-evening":"E", "duty-night":"N" };
  for (const d of types.filter(d => d.kind === "off")) result[d.id] = "O";
  for (const d of work) { const code = previous[d.id] || known[d.id]; if (code && !used.has(code)) { result[d.id]=code; used.add(code); } }
  const preferred = work.length === 2 ? ["D","N","E"] : ["D","E","N"];
  for (const d of work) if (!result[d.id]) { const code = preferred.find(c=>!used.has(c)); if (code) { result[d.id]=code; used.add(code); } }
  return result;
}

export function draftFromPattern(p: ShiftPatternRecord): PatternDraft {
  const d: PatternDraft = { siteId:p.siteId,patternId:p.id,name:p.name,teamCount:p.teamCount,patternCode:p.patternCode,startIndexRule:p.startIndexRule,patternStartDate:p.patternStartDate,effectiveFrom:p.effectiveFrom,status:p.status,dutyTypes:structuredClone(p.dutyTypes || []),cycles:structuredClone(p.cycles),teamCycleAssignments:structuredClone(p.teamCycleAssignments),teamCapacities:structuredClone(p.teamCapacities),teamSettings:structuredClone(p.teamSettings),isPerTeamPattern:p.teamCycleAssignments.some(a=>a.cycleKey.startsWith("team:")),poolEnabled:p.poolEnabled,poolStartTime:p.poolStartTime,poolEndTime:p.poolEndTime,poolBreakMinutes:p.poolBreakMinutes,baselineRevision:p.updatedAt };
  if(!d.dutyTypes.length){const rows=d.cycles.flatMap(c=>c.steps),codes=[...new Set(rows.filter(s=>!isOffDutyCode(s.dutyCode)).map(s=>s.dutyCode))];d.dutyTypes=codes.map((code,sortOrder)=>{const row=rows.find(s=>s.dutyCode===code)!;return {id:code,kind:"work" as const,label:code,sortOrder,startTime:row.startTime,endTime:row.endTime,breakMinutes:row.breakMinutes,holidayStartTime:row.holidayStartTime,holidayEndTime:row.holidayEndTime,holidayBreakMinutes:row.holidayBreakMinutes};});d.dutyTypes.push({id:"off",kind:"off",label:"휴무",sortOrder:10});}
  d.dutyCodes=getDutyCodes(d.dutyTypes);
  for (const type of d.dutyTypes.filter(t=>t.kind==="work")) if (d.cycles.some(c=>c.steps.some(s=>s.dutyCode===type.id))) d.dutyCodes[type.id]=type.id;
  return d;
}

export function setDraftTeamCount(d: PatternDraft, count: number): void {
  d.teamCount=count; if (!Number.isInteger(count) || count<2 || count>8) return;
  for (let i=0;i<8;i++) { const label=`${String.fromCharCode(65+i)}조`,t=d.teamSettings.find(t=>t.teamLabel===label);
    if (i>=count) { if (t) t.isActive=false; continue; }
    if (t) t.isActive=true;
    else { d.teamSettings.push({teamLabel:label,isActive:true,workType:"ROTATING",sortOrder:d.teamSettings.length}); d.teamCapacities.push({teamLabel:label});
      const c=d.cycles[0]; if(c){ for (const cycle of d.cycles) cycle.teamIndexes.push({teamLabel:label,index:i%cycle.steps.length}); d.teamCycleAssignments.push({teamLabel:label,cycleKey:c.cycleKey}); } }
  }
}

export function applyImportSuggestion(current: PatternDraft, analysis: SitePatternImportAnalysis): PatternDraft {
  const s=analysis.suggestion;
  if (!s || s.teamCount<2 || s.teamCount>8 || !s.cycles.length || s.cycles.length>8 || s.cycles.some(c=>c.shiftCount<1||c.shiftCount>3)) throw Error("조 2~8개·묶음 1~8개·근무형 1~3개 범위를 확인해 주세요.");
  const d=structuredClone(current);
  d.teamCount=s.teamCount;
  d.cycles=s.cycles.map((c,order)=>{const labels=getShiftPatternDisplayLabels(c.shiftCount);const parsed=parseCompressedShiftPatternString(c.patternString,c.shiftCount,labels);if(parsed.invalidTokens.length || !parsed.tokens.length)throw Error("추출된 패턴에 사용할 수 없는 근무형이 있습니다.");const steps=buildShiftPatternStepsFromPatternString(c.shiftCount,labels,c.shiftTimes,c.breakMinutes,c.patternString);return {cycleKey:c.cycleKey,name:c.name,order,shiftCount:c.shiftCount,patternString:c.patternString,patternCode:steps.map(s=>s.dutyCode).join("-"),patternStartDate:c.patternStartDate,steps,teamIndexes:structuredClone(c.teamIndexes)};});
  d.teamSettings=s.teams.map((t,sortOrder)=>({teamLabel:t.teamLabel,workType:"ROTATING",isActive:true,sortOrder}));
  d.teamCycleAssignments=s.teams.map(t=>({teamLabel:t.teamLabel,cycleKey:t.cycleKey}));
  d.teamCapacities=s.teams.map(t=>({teamLabel:t.teamLabel,maxHeadcount:t.maxHeadcount>0?t.maxHeadcount:undefined}));
  d.poolEnabled=s.poolEnabled;d.poolBreakMinutes=s.poolBreakMinutes;
  const range=s.poolTimeRange.match(/(\d{2}:\d{2})\s*(?:-|~)\s*(\d{2}:\d{2})/);d.poolStartTime=range?.[1];d.poolEndTime=range?.[2];
  const codes=[...new Set(d.cycles.flatMap(c=>c.steps.filter(s=>!isOffDutyCode(s.dutyCode)).map(s=>s.dutyCode)))];
  d.dutyTypes=codes.map((code,sortOrder)=>{const step=d.cycles.flatMap(c=>c.steps).find(s=>s.dutyCode===code)!;return {id:code,kind:"work" as const,label:getShiftPatternDisplayLabels(codes.length)[sortOrder] || code,sortOrder,startTime:step.startTime,endTime:step.endTime,breakMinutes:step.breakMinutes};});
  d.dutyTypes.push({id:"off",kind:"off",label:"휴무",sortOrder:10});d.dutyCodes=Object.fromEntries(d.dutyTypes.map(t=>[t.id,t.kind==="off"?"O":t.id]));d.sharedAssignments=undefined;d.isPerTeamPattern=false;return d;
}
