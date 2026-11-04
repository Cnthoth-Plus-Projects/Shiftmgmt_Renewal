import type { BridgeResult, SchedulePreparationContext } from "../../shared/bridge/contracts";
import type { AuthSession, MonthlyScheduleRecord, SiteRecord } from "../../shared/domain/model";
import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { showConfirm, showNotice } from "./operations-ui";
import type { SchedulePreviewResult } from "./schedule-model";

export interface ActionSnapshot {
  generationId: number;
  siteId: string;
  targetMonth: string;
  selectedScheduleId: string;
  actorKey: string;
  exportId: string | null;
}

export interface ScheduleActionsContext {
  snapshot: ActionSnapshot;
  isCurrent: (snapshot: ActionSnapshot) => boolean;
  isAlive: () => boolean;
  beginAction: () => number | null;
  endAction: (lease: number) => void;
  readResult: <T>(result: BridgeResult<T>, label: string) => T;
  refreshContext: () => Promise<SchedulePreparationContext | null>;
  site: SiteRecord | null;
  targetMonth: string;
  session: AuthSession | null;
  previewData: SchedulePreviewResult | null;
  selectedScheduleId: string;
  storedSchedules: MonthlyScheduleRecord[];
  currentExportRecord: SchedulePlanExportRecord | null;
  onScheduleCreated: (record: MonthlyScheduleRecord) => Promise<boolean>;
  onExportCompleted: (record: SchedulePlanExportRecord) => Promise<boolean>;
  onPublishCompleted: (record: SchedulePlanExportRecord) => Promise<boolean>;
}

function permitted(ctx: ScheduleActionsContext): boolean {
  return ctx.isCurrent(ctx.snapshot) && !!ctx.session &&
    (ctx.session.role === "admin" || ctx.session.role === "planner");
}

async function operate(ctx: ScheduleActionsContext, label: string, task: () => Promise<void>): Promise<void> {
  if (!permitted(ctx)) return;
  const lease = ctx.beginAction();
  if (lease === null) return;
  try { await task(); }
  catch (error) {
    if (ctx.isCurrent(ctx.snapshot)) showNotice(label, error instanceof Error ? error.message : "작업을 확인하지 못했습니다. 자료를 새로고침해 주세요.");
  } finally { ctx.endAction(lease); }
}

export async function executeCreateSchedule(ctx: ScheduleActionsContext): Promise<void> {
  if (!permitted(ctx)) return;
  const { site, previewData, targetMonth } = ctx;
  if (!site || !previewData?.pattern || previewData.fatalIssues.length || !previewData.items.length) {
    showNotice("생성 불가", "근무지와 생성 불가 사유를 확인한 후 미리보기를 다시 조회해 주세요."); return;
  }
  const pattern = previewData.pattern;
  const exists = ctx.storedSchedules.some(s => s.siteId === site.id && s.scheduleMonth === targetMonth);
  showConfirm({
    title: exists ? "같은 달 근무표 새로 저장" : "근무표 저장",
    message: `${site.name} · ${targetMonth} · ${new Set(previewData.rows.map(r => r.employeeCode)).size}명\n${exists ? "기존 근무표와 이력을 유지하고 새 기록으로 저장합니다." : "미리보기 내용을 새 근무표로 저장합니다."}`,
    confirmLabel: "저장", variant: "primary",
    onConfirm: () => operate(ctx, "저장 확인 실패", async () => {
      const bridge = window.appBridge;
      if (!bridge || !ctx.isCurrent(ctx.snapshot)) return;
      const response = await bridge.saveMonthlySchedule({
        siteId: site.id, scheduleMonth: targetMonth, patternId: pattern.id,
        generatedBy: ctx.session!.displayName || ctx.session!.loginId,
        items: previewData.items.map(it => ({ employeeCode: it.employeeCode, teamLabel: it.teamLabel, sortOrder: it.sortOrder, workDate: it.workDate, dutyCode: it.dutyCode, startTime: it.startTime, endTime: it.endTime, breakMinutes: it.breakMinutes })),
      });
      if (!ctx.isCurrent(ctx.snapshot)) return;
      const record = ctx.readResult(response, "근무표 저장");
      if (!record?.id || record.siteId !== site.id || record.scheduleMonth !== targetMonth || record.patternId !== pattern.id) throw new Error("저장 응답의 대상이 다릅니다. 다시 저장하지 말고 목록을 새로고침해 확인해 주세요.");
      if (await ctx.onScheduleCreated(record) && ctx.isAlive()) showNotice("저장 완료", "새 근무표를 저장하고 조회 결과를 확인했습니다.");
    }),
  });
}

export async function executeExportExcel(ctx: ScheduleActionsContext): Promise<void> {
  if (!permitted(ctx)) return;
  const saved = ctx.storedSchedules.find(s => s.id === ctx.selectedScheduleId && s.siteId === ctx.snapshot.siteId && s.scheduleMonth === ctx.targetMonth);
  if (!saved) { showNotice("엑셀 생성 불가", "먼저 근무표를 저장하거나 저장본을 선택해 주세요."); return; }
  showConfirm({
    title: "엑셀 근무표 생성",
    message: `${ctx.site?.name || saved.siteName || ""} · ${ctx.targetMonth}\n저장된 레이아웃으로 엑셀 파일을 만듭니다. 같은 출력 경로에 파일이 있으면 새 내용으로 바뀔 수 있습니다. 이미 게시된 파일은 별도로 유지됩니다.`,
    confirmLabel: "생성", variant: "primary",
    onConfirm: () => operate(ctx, "엑셀 생성 확인 실패", async () => {
      const bridge = window.appBridge;
      if (!bridge || !ctx.isCurrent(ctx.snapshot)) return;
      const previewResponse = await bridge.previewMonthlySchedulePlan(saved.id);
      if (!ctx.isCurrent(ctx.snapshot)) return;
      const preview = ctx.readResult(previewResponse, "엑셀 미리보기");
      if (!preview || preview.scheduleId !== saved.id) throw new Error("엑셀 미리보기를 확인하지 못했습니다. 저장본과 양식 설정을 확인해 주세요.");
      const response = await bridge.exportMonthlySchedulePlan(saved.id);
      if (!ctx.isCurrent(ctx.snapshot)) return;
      const record = ctx.readResult(response, "엑셀 생성");
      if (!record?.id || record.scheduleId !== saved.id || record.scheduleMonth !== ctx.targetMonth || !record.outputPath) throw new Error("생성 파일의 대상을 확인하지 못했습니다. 이력을 새로고침해 확인해 주세요.");
      if (await ctx.onExportCompleted(record) && ctx.isAlive()) showNotice("엑셀 생성 완료", `${record.outputFileName}\n저장 경로: ${record.outputPath}\n확인 후 배포 폴더로 게시할 수 있습니다.`);
    }),
  });
}

export async function executePublishSchedule(ctx: ScheduleActionsContext): Promise<void> {
  if (!permitted(ctx)) return;
  const record = ctx.currentExportRecord;
  const saved = ctx.storedSchedules.find(s => s.id === ctx.selectedScheduleId && s.siteId === ctx.snapshot.siteId && s.scheduleMonth === ctx.targetMonth);
  if (!saved || !record || record.scheduleId !== saved.id || record.scheduleMonth !== ctx.targetMonth) {
    showNotice("게시 불가", "현재 저장본을 선택하고 이 화면에서 엑셀을 새로 생성해 주세요."); return;
  }
  let context: SchedulePreparationContext | null;
  try { context = await ctx.refreshContext(); }
  catch (error) { if (ctx.isCurrent(ctx.snapshot)) showNotice("게시 폴더 조회 실패", error instanceof Error ? error.message : "게시 폴더 설정을 확인해 주세요."); return; }
  if (!ctx.isCurrent(ctx.snapshot) || !context?.publishDirectory) return;
  const confirmedDirectory = context.publishDirectory;
  showConfirm({
    title: "배포 폴더로 게시 확인",
    message: `근무지: ${ctx.site?.name || saved.siteName || ""}\n대상 월: ${ctx.targetMonth}\n인원: ${new Set(saved.items.map(it => it.employeeCode || it.employeeId)).size}명\n파일: ${record.outputFileName}\n게시 폴더: ${confirmedDirectory}\n같은 파일명이 있으면 기존 파일을 보존하고 새 이름으로 게시합니다.`,
    confirmLabel: "게시", variant: "primary",
    onConfirm: () => operate(ctx, "게시 확인 실패", async () => {
      const bridge = window.appBridge;
      if (!bridge || !ctx.isCurrent(ctx.snapshot)) return;
      const latest = await ctx.refreshContext();
      if (!ctx.isCurrent(ctx.snapshot)) return;
      if (!latest || latest.publishDirectory !== confirmedDirectory) throw new Error("게시 폴더 설정이 변경되었습니다. 대상을 다시 확인하고 게시해 주세요.");
      const response = await bridge.publishSchedulePlanExport(record.id);
      if (!ctx.isCurrent(ctx.snapshot)) return;
      const published = ctx.readResult(response, "게시");
      if (!published || published.id !== record.id || published.scheduleId !== saved.id || published.publishStatus !== "published" || !published.publishedPath) throw new Error("게시 결과를 확인하지 못했습니다. 이력을 새로고침해 확인해 주세요.");
      if (await ctx.onPublishCompleted(published) && ctx.isAlive()) showNotice("게시 완료", `게시 경로: ${published.publishedPath}\n생성·게시 이력에서 확인할 수 있습니다.`);
    }),
  });
}
