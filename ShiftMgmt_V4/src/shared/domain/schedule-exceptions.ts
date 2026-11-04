import { calculateDurationMinutes } from "./calculation";

export interface ScheduleTiming { startTime: string; endTime: string; breakMinutes: number; }
export interface DateScheduleException {
  id: string;
  from: string;
  to: string;
  scope: "site" | "team" | "employee";
  teamLabel?: string;
  employeeId?: string;
  reason: string;
  dutyCode?: "D" | "E" | "N" | "O";
  timing?: ScheduleTiming;
}
export interface ExceptionShift { dutyCode: string; startTime?: string; endTime?: string; breakMinutes: number; }
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("예외 설정의 형식을 확인해 주세요.");
  return v as Record<string, unknown>;
};
const date = (v: unknown): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw Error("예외 적용 날짜를 올바르게 선택해 주세요.");
  return v;
};
export function parseScheduleTiming(value: unknown): ScheduleTiming {
  const t = obj(value), time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof t.startTime !== "string" || !time.test(t.startTime) || typeof t.endTime !== "string" || !time.test(t.endTime) || !Number.isInteger(t.breakMinutes) || Number(t.breakMinutes) < 0 || Number(t.breakMinutes) > 1440) throw Error("예외 근무의 시작·종료 시간과 휴게 분을 확인해 주세요.");
  return { startTime: t.startTime, endTime: t.endTime, breakMinutes: Number(t.breakMinutes) };
}
export function parseDateScheduleExceptions(value: unknown): DateScheduleException[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1000) throw Error("날짜 예외는 최대 1,000건까지 등록할 수 있습니다.");
  const ids = new Set<string>();
  return value.map(raw => {
    const r = obj(raw);
    if (typeof r.id !== "string" || !r.id.trim() || r.id.length > 100 || ids.has(r.id)) throw Error("예외 항목의 식별값이 중복되거나 올바르지 않습니다.");
    ids.add(r.id);
    const from = date(r.from), to = date(r.to);
    if (to < from) throw Error("예외 종료일은 시작일보다 빠를 수 없습니다.");
    if (!["site", "team", "employee"].includes(String(r.scope))) throw Error("예외를 적용할 대상을 선택해 주세요.");
    if (typeof r.reason !== "string" || !r.reason.trim() || r.reason.length > 200) throw Error("예외 사유를 1~200자로 입력해 주세요.");
    const result: DateScheduleException = { id: r.id, from, to, scope: r.scope as DateScheduleException["scope"], reason: r.reason.trim() };
    if (r.scope === "team") {
      if (typeof r.teamLabel !== "string" || !r.teamLabel.trim() || r.teamLabel.length > 100) throw Error("예외를 적용할 조를 선택해 주세요.");
      result.teamLabel = r.teamLabel;
    }
    if (r.scope === "employee") {
      if (typeof r.employeeId !== "string" || !r.employeeId.trim() || r.employeeId.length > 100) throw Error("예외를 적용할 인원을 선택해 주세요.");
      result.employeeId = r.employeeId;
    }
    if (r.dutyCode !== undefined) {
      if (!["D", "E", "N", "O"].includes(String(r.dutyCode))) throw Error("예외 근무 유형을 선택해 주세요.");
      result.dutyCode = r.dutyCode as DateScheduleException["dutyCode"];
    }
    if (r.timing !== undefined) result.timing = parseScheduleTiming(r.timing);
    if (result.dutyCode === "O" && result.timing) throw Error("휴무 예외에는 근무 시간을 지정할 수 없습니다.");
    if (!result.dutyCode && !result.timing) throw Error("변경할 근무 유형 또는 시간을 지정해 주세요.");
    return result;
  });
}
export function validateDateScheduleExceptions(rows: DateScheduleException[], teams: string[], available: string[], effectiveFrom?: string): string | undefined {
  const groups = new Map<string, DateScheduleException[]>();
  for (const row of rows) {
    if (effectiveFrom && row.from < effectiveFrom) return "날짜 예외는 이 설정의 적용 시작일 이후로 지정해 주세요.";
    if (row.scope === "team" && !teams.includes(row.teamLabel!)) return "예외에 지정된 조가 사용 중이 아닙니다. 대상을 다시 선택해 주세요.";
    if (row.dutyCode && row.dutyCode !== "O" && !available.includes(row.dutyCode)) return "예외에 지정된 근무 유형이 없습니다. 유형을 다시 선택해 주세요.";
    if (row.timing && row.timing.breakMinutes > calculateDurationMinutes({ ...row.timing, breakMinutes: 0 })) return "예외 휴게시간은 실제 근무 구간보다 길 수 없습니다.";
    const key = `${row.scope}:${row.teamLabel ?? row.employeeId ?? ""}`;
    const list = groups.get(key) ?? []; list.push(row); groups.set(key, list);
  }
  for (const list of groups.values()) {
    const ordered = list.slice().sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < ordered.length; i++) if (ordered[i].from <= ordered[i - 1].to) return "같은 대상의 예외 기간이 겹칩니다. 기존 항목을 수정하거나 날짜를 나눠 주세요.";
  }
  return undefined;
}
/** Date overrides never move cycle phase. Narrower scopes apply last; time-only changes never turn off-duty into work. */
export function resolveDateScheduleExceptions(rows: DateScheduleException[] | undefined, workDate: string, teamLabel: string, employeeId: string, base: ExceptionShift, catalog: ExceptionShift[]): ExceptionShift {
  if (!rows?.length) return base;
  const order = { site: 0, team: 1, employee: 2 };
  const matches = rows.filter(r => r.from <= workDate && workDate <= r.to && (r.scope === "site" || (r.scope === "team" && r.teamLabel === teamLabel) || (r.scope === "employee" && r.employeeId === employeeId))).sort((a, b) => order[a.scope] - order[b.scope]);
  let result = base;
  for (const row of matches) {
    const code = row.dutyCode ?? result.dutyCode;
    if (code === "O") { result = { dutyCode: "O", breakMinutes: 0 }; continue; }
    const source = code === result.dutyCode ? result : catalog.find(t => t.dutyCode === code);
    if (!source) throw Error("예외 근무 유형의 시간을 찾을 수 없습니다. 설정을 확인해 주세요.");
    result = { dutyCode: code, startTime: source.startTime, endTime: source.endTime, breakMinutes: source.breakMinutes, ...row.timing };
  }
  return result;
}
