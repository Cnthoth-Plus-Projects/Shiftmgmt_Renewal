import { parseHolidayPatternPolicy, validateHolidayPolicy } from "../domain/holiday-pattern";
import type { ShiftPatternDutyTypeInput, ShiftPatternStepInput } from "./contracts";

export const PATTERN_PRESETS_SETTING_KEY = "shift_pattern_presets_json";
export interface PresetTeamPattern {
  teamLabel: string; displayName: string; steps: ShiftPatternStepInput[];
  patternStartDate: string; shiftCount: number;
  holidayTimeMode?: "unified" | "split"; weekdayPublicHolidayAsHoliday?: boolean;
}
export interface PatternPresetDefinition {
  holidayPolicy?: import("../domain/holiday-pattern").HolidayPatternPolicy;
  version: 1; effectiveFrom: string; patternStartDate: string;
  dutyTypes: ShiftPatternDutyTypeInput[]; dutyCodes: Record<string,string>; rows: PresetTeamPattern[];
}
export interface PatternPresetRecord {
  id: string; name: string; revision: number; definition: PatternPresetDefinition; createdAt: string; updatedAt: string;
}
export interface PatternPresetSaveInput { id?: string; expectedRevision?: number; name: string; definition: PatternPresetDefinition; }
export interface PatternPresetDeleteInput { id: string; expectedRevision: number; }
const object = (v: unknown): Record<string,unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("패턴 자료의 형식이 올바르지 않습니다.");
  return v as Record<string,unknown>;
};
const text = (v: unknown): string => { if (typeof v !== "string" || !v.trim() || v.length > 256) throw Error("패턴 이름과 식별값을 확인해 주세요."); return v.trim(); };
const date = (v: unknown): string => { const s=text(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0,10)!==s) throw Error("패턴 날짜를 확인해 주세요.");return s; };
const minutes = (v: unknown): number => { if (!Number.isInteger(v) || Number(v)<0 || Number(v)>1440) throw Error("휴게시간은 0~1440분의 정수로 입력해 주세요.");return Number(v); };
const time = (v: unknown): string | undefined => { if (v===undefined) return undefined; if (typeof v!=="string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw Error("근무시간 형식을 확인해 주세요.");return v; };
export function parsePatternPresetDefinition(value: unknown): PatternPresetDefinition {
  const v=object(value); if(v.version!==1 || !Array.isArray(v.rows) || v.rows.length<2 || v.rows.length>8 || !Array.isArray(v.dutyTypes)) throw Error("2~8개 조의 저장 패턴이 필요합니다.");
  const dutyTypes: ShiftPatternDutyTypeInput[]=v.dutyTypes.map(raw=>{const d=object(raw);if(d.kind!=="work"&&d.kind!=="off")throw Error("근무 유형을 확인해 주세요.");return {id:text(d.id),kind:d.kind,label:text(d.label),sortOrder:Number(d.sortOrder)||0,startTime:time(d.startTime),endTime:time(d.endTime),breakMinutes:minutes(d.breakMinutes??0),holidayStartTime:time(d.holidayStartTime),holidayEndTime:time(d.holidayEndTime),holidayBreakMinutes:d.holidayBreakMinutes===undefined?undefined:minutes(d.holidayBreakMinutes),isBreakDirty:d.isBreakDirty===true,isHolidayBreakDirty:d.isHolidayBreakDirty===true};});
  if(dutyTypes.filter(d=>d.kind==="work").length>3 || !dutyTypes.length || new Set(dutyTypes.map(d=>d.id)).size!==dutyTypes.length)throw Error("근무 유형은 최대3개이며 식별값은 중복될 수 없습니다.");
  const map=object(v.dutyCodes),dutyCodes:Record<string,string>={};for(const d of dutyTypes){const code=text(map[d.id]);if(!["D","E","N","O"].includes(code) || (d.kind==="off")!==(code==="O"))throw Error("패턴 근무 코드가 올바르지 않습니다.");dutyCodes[d.id]=code;}
  if(new Set(dutyTypes.filter(d=>d.kind==="work").map(d=>dutyCodes[d.id])).size!==dutyTypes.filter(d=>d.kind==="work").length)throw Error("근무 코드가 중복됩니다.");
  const rows:PresetTeamPattern[]=v.rows.map(raw=>{const r=object(raw);if(!Array.isArray(r.steps)||!r.steps.length||r.steps.length>1000||![1,2,3].includes(Number(r.shiftCount)))throw Error("조별 반복 패턴을 확인해 주세요.");const steps:ShiftPatternStepInput[]=r.steps.map((raw,i)=>{const s=object(raw),code=text(s.dutyCode);if(!Object.values(dutyCodes).includes(code))throw Error("지정하지 않은 근무 칸이 있습니다.");return {stepIndex:i,dutyCode:code,startTime:time(s.startTime),endTime:time(s.endTime),breakMinutes:minutes(s.breakMinutes??0),holidayStartTime:time(s.holidayStartTime),holidayEndTime:time(s.holidayEndTime),holidayBreakMinutes:s.holidayBreakMinutes===undefined?undefined:minutes(s.holidayBreakMinutes)};});if(steps.some(s=>s.dutyCode!=="O"&&(!s.startTime||!s.endTime)))throw Error("근무 칸의 시작·종료 시간을 입력해 주세요.");return {teamLabel:text(r.teamLabel),displayName:text(r.displayName),steps,patternStartDate:date(r.patternStartDate),shiftCount:Number(r.shiftCount),holidayTimeMode:r.holidayTimeMode==="split"?"split":"unified",weekdayPublicHolidayAsHoliday:r.weekdayPublicHolidayAsHoliday!==false};});
  if(new Set(rows.map(r=>r.teamLabel)).size!==rows.length || new Set(rows.map(r=>r.steps.length)).size!==1)throw Error("모든 조는 서로 다른 이름과 같은 수의 패턴 칸이 필요합니다.");
  const policyError=validateHolidayPolicy(v.holidayPolicy,rows.map(r=>r.teamLabel),Object.values(dutyCodes));if(policyError)throw Error(policyError);
  if (parseHolidayPatternPolicy(v.holidayPolicy)?.dateExceptions?.length) throw Error("날짜·개인 예외는 근무지 전용입니다. 반복 설정만 패턴 보관함에 저장해 주세요.");
  const result:PatternPresetDefinition={holidayPolicy:parseHolidayPatternPolicy(v.holidayPolicy),version:1,effectiveFrom:date(v.effectiveFrom),patternStartDate:date(v.patternStartDate),dutyTypes,dutyCodes,rows};if(new TextEncoder().encode(JSON.stringify(result)).length>1024*1024)throw Error("패턴 자료가 너무 큽니다.");return result;
}
export function parsePatternPresetRecords(value: unknown): PatternPresetRecord[] {
  if(!Array.isArray(value))throw Error("저장된 패턴 보관함을 읽을 수 없습니다.");
  const rows=value.map(raw=>{const r=object(raw);if(!Number.isInteger(r.revision)||Number(r.revision)<1)throw Error("저장 패턴의 버전을 확인해 주세요.");return {id:text(r.id),name:text(r.name),revision:Number(r.revision),definition:parsePatternPresetDefinition(r.definition),createdAt:text(r.createdAt),updatedAt:text(r.updatedAt)};});
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error("보관함 식별값이 중복됩니다.");return rows;
}
