import { calculateRotationIndex } from "./rotation-index";
import { calculateDurationMinutes } from "./calculation";
import { parseScheduleTiming, parseDateScheduleExceptions, validateDateScheduleExceptions } from "./schedule-exceptions";
import type { DateScheduleException } from "./schedule-exceptions";
import type { HolidayCalendar, ShiftPatternStep } from "./model";

/** Stable structured identity used by preview and the transactional writer. */
export function holidayCalendarFingerprint(calendar: HolidayCalendar | null | undefined): string {
  if (!calendar) return "empty";
  const sortedItems = [...(calendar.items || [])].sort((a, b) =>
    a.holidayDate.localeCompare(b.holidayDate) || a.id.localeCompare(b.id));
  return JSON.stringify([calendar.id, calendar.year, calendar.sourceName || "",
    sortedItems.map(i => [i.id, i.holidayDate, i.name, i.isSubstitute ? 1 : 0])]);
}

export function getPatternDutyCodes(types: Array<{id:string;kind:string;sortOrder?:number}>, previous: Record<string,string> = {}): Record<string,string> {
  const result: Record<string,string> = {}, used = new Set<string>();
  const work = types.filter(d=>d.kind==="work").slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
  const known: Record<string,string> = { D:"D",E:"E",N:"N","duty-D":"D","duty-E":"E","duty-N":"N","duty-day":"D","duty-evening":"E","duty-night":"N" };
  for(const d of types.filter(d=>d.kind==="off"))result[d.id]="O";
  for(const d of work){const code=previous[d.id]||known[d.id];if(code&&!used.has(code)){result[d.id]=code;used.add(code);}}
  const preferred=work.length===2?["D","N","E"]:["D","E","N"];
  for(const d of work)if(!result[d.id]){const code=preferred.find(c=>!used.has(c));if(code){result[d.id]=code;used.add(code);}}
  return result;
}

export const HOLIDAY_CATEGORIES = ["public", "saturday", "sunday"] as const;
export type HolidayCategory = typeof HOLIDAY_CATEGORIES[number];
export interface HolidayTiming { startTime: string; endTime: string; breakMinutes: number; }
export interface HolidayRule {
  mode: "normal" | "off" | "separate";
  excludedDutyCodes: string[];
  startDate?: string;
  teamPatterns?: Record<string, string[]>;
  times?: Record<string, HolidayTiming>;
  teamTimes?: Record<string, Record<string, HolidayTiming>>;
}
export interface HolidayPatternPolicy { version: 1; rules: Partial<Record<HolidayCategory, HolidayRule>>; overlapPriority?: "public" | "weekend"; dateExceptions?: DateScheduleException[]; }
const codes = ["D", "E", "N", "O"];
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("휴일 설정의 형식을 확인해 주세요.");
  return v as Record<string, unknown>;
};
export function parseHolidayPatternPolicy(value: unknown): HolidayPatternPolicy | undefined {
  if (value === undefined || value === null) return undefined;
  const v = object(value), raw = object(v.rules);
  if (v.version !== 1 || Object.keys(raw).some(k => !HOLIDAY_CATEGORIES.includes(k as HolidayCategory))) throw Error("지원하지 않는 휴일 설정입니다.");
  if (v.overlapPriority !== undefined && v.overlapPriority !== "public" && v.overlapPriority !== "weekend") throw Error("공휴일과 주말의 적용 우선순위를 확인해 주세요.");
  const rules: HolidayPatternPolicy["rules"] = {};
  for (const category of HOLIDAY_CATEGORIES) {
    if (raw[category] === undefined) continue;
    const r = object(raw[category]);
    if (!["normal", "off", "separate"].includes(String(r.mode)) || !Array.isArray(r.excludedDutyCodes) || r.excludedDutyCodes.some(c => !codes.slice(0, 3).includes(String(c)))) throw Error("휴일 근무 방식과 적용 유형을 확인해 주세요.");
    const rule: HolidayRule = { mode: r.mode as HolidayRule["mode"], excludedDutyCodes: [...new Set(r.excludedDutyCodes as string[])] };
    if (r.mode === "separate") {
      if (typeof r.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.startDate) || Number.isNaN(Date.parse(r.startDate)) || new Date(r.startDate).toISOString().slice(0, 10) !== r.startDate) throw Error("휴일 사이클 시작일을 확인해 주세요.");
      const patterns = object(r.teamPatterns), rows = Object.entries(patterns);
      if (!rows.length || rows.length > 8 || rows.some(([team, row]) => !team.trim() || team.length > 100 || !Array.isArray(row) || !row.length || row.length > 1000 || row.some(c => !codes.includes(String(c)))) || new Set(rows.map(([, row]) => (row as string[]).length)).size !== 1) throw Error("휴일 패턴은 모든 조에 같은 수의 근무 칸을 입력해 주세요.");
      rule.startDate = r.startDate; rule.teamPatterns = structuredClone(patterns) as Record<string, string[]>;
    }
    if (r.times !== undefined) {
      rule.times = {};
      for (const [code, rawTime] of Object.entries(object(r.times))) {
        const t = object(rawTime), time = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (!codes.slice(0, 3).includes(code) || typeof t.startTime !== "string" || typeof t.endTime !== "string" || !time.test(t.startTime) || !time.test(t.endTime) || !Number.isInteger(t.breakMinutes) || Number(t.breakMinutes) < 0 || Number(t.breakMinutes) > 1440) throw Error("휴일 근무 시간과 휴게 분을 확인해 주세요.");
        rule.times[code] = { startTime: t.startTime, endTime: t.endTime, breakMinutes: Number(t.breakMinutes) };
      }
    }
    if (r.teamTimes !== undefined) {
      const entries = Object.entries(object(r.teamTimes));
      if (entries.length > 8) throw Error("조별 휴일 시간은 최대 8개 조까지 지정할 수 있습니다.");
      rule.teamTimes = {};
      for (const [team, rawTimes] of entries) {
        if (!team.trim() || team.length > 100) throw Error("휴일 시간을 적용할 조를 확인해 주세요.");
        const timings: Record<string, HolidayTiming> = {};
        for (const [code, value] of Object.entries(object(rawTimes))) {
          if (!codes.slice(0, 3).includes(code)) throw Error("조별 휴일 근무 유형을 확인해 주세요.");
          timings[code] = parseScheduleTiming(value);
        }
        rule.teamTimes[team] = timings;
      }
    }
    rules[category] = rule;
  }
  return { version: 1, rules, ...(v.overlapPriority === undefined ? {} : { overlapPriority: v.overlapPriority as "public" | "weekend" }), ...(v.dateExceptions === undefined ? {} : { dateExceptions: parseDateScheduleExceptions(v.dateExceptions) }) };
}
export function holidayCategory(policy: HolidayPatternPolicy, date: string, publicDates: ReadonlySet<string>): HolidayCategory | undefined {
  const day = new Date(`${date}T12:00:00`).getDay();
  const weekend = day === 6 && policy.rules.saturday ? "saturday" : day === 0 && policy.rules.sunday ? "sunday" : undefined;
  if (policy.rules.public && publicDates.has(date)) return policy.overlapPriority === "weekend" && weekend ? weekend : "public";
  return weekend;
}
export function validateHolidayPolicy(value: unknown, teams: string[], available: string[], effectiveFrom?: string): string | undefined {
  try {
    const policy = parseHolidayPatternPolicy(value);
    if (!policy) return undefined;
    const exceptionError = validateDateScheduleExceptions(policy.dateExceptions ?? [], teams, available, effectiveFrom);
    if (exceptionError) return exceptionError;
    for (const rule of Object.values(policy.rules)) {
      if (Object.keys(rule.teamTimes ?? {}).some(team => !teams.includes(team))) return "휴일 시간에 지정된 조가 사용 중이 아닙니다. 공통 시간으로 되돌리거나 조를 다시 설정해 주세요.";
      if (rule.mode !== "off") for (const [code, timing] of [rule.times ?? {}, ...Object.values(rule.teamTimes ?? {})].flatMap(times => Object.entries(times))) {
        if (available.includes(code) && !rule.excludedDutyCodes.includes(code) && timing.breakMinutes > calculateDurationMinutes({ ...timing, breakMinutes: 0 })) return "휴일 휴게시간은 시작부터 종료까지의 근무 구간보다 길 수 없습니다.";
      }
      if (rule.mode !== "separate") continue;
      if (teams.some(t => !rule.teamPatterns?.[t])) return "사용 중인 모든 조에 휴일 패턴을 입력해 주세요.";
      if (Object.values(rule.teamPatterns ?? {}).some(row => row.some(c => c !== "O" && !available.includes(c)))) return "휴일 패턴에 없는 근무 유형이 있습니다. 유형을 먼저 등록해 주세요.";
    }
  } catch (e) { return (e as Error).message; }
  return undefined;
}
/** Both cycles always advance by calendar day. A rule replaces only this date's result. */
export function resolveHolidayStep(policy: HolidayPatternPolicy, date: string, publicDates: ReadonlySet<string>, team: string, base: ShiftPatternStep, catalog: ShiftPatternStep[]): { step: ShiftPatternStep; holiday?: boolean } {
  const category = holidayCategory(policy, date, publicDates), rule = category && policy.rules[category];
  if (!rule) return { step: base };
  let code = base.dutyCode;
  if (rule.mode === "off") code = "O";
  if (rule.mode === "separate") {
    const row = rule.teamPatterns?.[team];
    if (!row?.length || !rule.startDate) throw Error(`${team}의 휴일 반복 패턴이 없습니다.`);
    code = row[calculateRotationIndex(rule.startDate, date, 0, row.length)]!;
  }
  if (rule.excludedDutyCodes.includes(code)) code = "O";
  if (code === "O") return { step: { id: base.id, stepIndex: base.stepIndex, dutyCode: "O", breakMinutes: 0 }, holiday: true };
  const source = code === base.dutyCode ? base : catalog.find(s => s.dutyCode === code);
  if (!source) throw Error(`${code} 휴일 근무 유형의 시간을 찾을 수 없습니다.`);
  const selectedTiming = rule.teamTimes?.[team]?.[code] ?? rule.times?.[code];
  // 편성 규칙은 그대로 두고, 공휴일과 겹친 토·일의 시간만 해당 요일 설정을 우선한다.
  const day = new Date(`${date}T12:00:00`).getDay();
  const weekendRule = publicDates.has(date)
    ? day === 6 ? policy.rules.saturday : day === 0 ? policy.rules.sunday : undefined
    : undefined;
  const weekendTiming = weekendRule?.mode !== "off"
    ? weekendRule?.teamTimes?.[team]?.[code] ?? weekendRule?.times?.[code]
    : undefined;
  const timing = weekendTiming ?? selectedTiming;
  return { step: timing ? { ...source, ...timing, holidayStartTime: timing.startTime, holidayEndTime: timing.endTime, holidayBreakMinutes: timing.breakMinutes } : source, holiday: true };
}
