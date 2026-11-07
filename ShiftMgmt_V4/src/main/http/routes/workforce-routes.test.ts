import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_CONTRACTS } from "../../../shared/bridge/channel-contracts";
import { accessLogActionLabels } from "../../../shared/domain/access-log";
import type { AuthSession } from "../../../shared/domain/model";
import type { DialogBridge } from "../api-types";
import type { WagePendingPerformanceRefresh } from "../../../shared/bridge/contracts";
import { RouteRegistry } from "../route-registry";
import { SessionManager } from "../session";
import { WORKFORCE_CHANNELS } from "./index";
import { registerWorkforceRoutes } from "./workforce-routes";

const mocks = vi.hoisted(() => ({
  refreshPendingPerformanceForWageChanges: vi.fn(async (_changes: unknown[]): Promise<WagePendingPerformanceRefresh> => ({ status: "completed", affectedEntryCount: 0, targetFileCount: 0, refreshedFileCount: 0, issues: [] })),
  listStoredPatternPresets: vi.fn(()=>[]),saveStoredPatternPreset: vi.fn((input:unknown)=>input),deleteStoredPatternPreset: vi.fn((input:unknown)=>input),
  getStoredAppSettingsSnapshot: vi.fn(() => ({
    scheduleExportDir: "C:/export",
    approvedDir: "C:/approved",
    consecutiveNightLimit: 3,
    minimumRestMinutes: 660,
    requireWeeklyHoliday: true,
    weeklyMaxMinutes: 3120,
  })),
  listStoredHolidayCalendars: vi.fn(() => [
    {
      year: 2026,
      items: [
        { holidayDate: "2026-01-01", name: "신정", isSubstitute: false },
        { holidayDate: "2026-03-01", name: "삼일절", isSubstitute: false },
      ],
    },
  ]),
  closeStoredEmployeeAssignment: vi.fn((input: unknown) => input),
  closeStoredEmployeeWageRate: vi.fn((input: unknown) => input),
  listStoredEmployeeAssignments: vi.fn(() => []),
  listStoredEmployeeWageRates: vi.fn(() => []),
  reorderStoredEmployeeAssignment: vi.fn((input: unknown) => input),
  saveStoredEmployeeAssignment: vi.fn((input: unknown) => input),
  saveStoredEmployeeWageRate: vi.fn((input: unknown) => input),
  deleteStoredEmployee: vi.fn((employeeId: string) => ({ employeeId })),
  listStoredEmployees: vi.fn(() => []),
  saveStoredEmployee: vi.fn((input: unknown) => input),
  listStoredMonthlySchedules: vi.fn(() => []),
  saveStoredMonthlySchedule: vi.fn((input: unknown) => input),
  exportMonthlySchedulePlan: vi.fn(async (input: unknown) => input),
  listStoredSchedulePlanExports: vi.fn(() => []),
  publishSchedulePlanExport: vi.fn(async (input: unknown) => input),
  resolveSchedulePlanPublishDirectory: vi.fn((_input: unknown) => "C:/export/배포"),
  previewMonthlySchedulePlan: vi.fn(async (scheduleId: string) => ({ scheduleId })),
  deactivateStoredShiftPattern: vi.fn((patternId: string) => ({ patternId })),
  listStoredShiftPatterns: vi.fn(() => []),
  saveStoredShiftPattern: vi.fn((input: unknown) => input),
  analyzeSitePatternImport: vi.fn(async (input: unknown) => input),
  deleteStoredSite: vi.fn((siteId: string) => ({ siteId })),
  listStoredSites: vi.fn(() => []),
  saveStoredSite: vi.fn((input: unknown) => input),
  applyWorkforceWageBulkUpdate: vi.fn(async (input: unknown) => input),
  previewWorkforceWageBulkUpdate: vi.fn(async (input: unknown) => input),
}));

vi.mock("../../services/workforce-wage-performance-service", () => ({ refreshPendingPerformanceForWageChanges: mocks.refreshPendingPerformanceForWageChanges }));

vi.mock("../../services/pattern-preset-storage-service",()=>({listStoredPatternPresets:mocks.listStoredPatternPresets,saveStoredPatternPreset:mocks.saveStoredPatternPreset,deleteStoredPatternPreset:mocks.deleteStoredPatternPreset}));
vi.mock("../../services/employee-history-service", () => ({
  closeStoredEmployeeAssignment: mocks.closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate: mocks.closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments: mocks.listStoredEmployeeAssignments,
  listStoredEmployeeWageRates: mocks.listStoredEmployeeWageRates,
  reorderStoredEmployeeAssignment: mocks.reorderStoredEmployeeAssignment,
  saveStoredEmployeeAssignment: mocks.saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate: mocks.saveStoredEmployeeWageRate,
}));
vi.mock("../../services/app-settings-storage-service", () => ({
  getStoredAppSettingsSnapshot: mocks.getStoredAppSettingsSnapshot,
}));
vi.mock("../../services/operations-storage-service", () => ({
  listStoredHolidayCalendars: mocks.listStoredHolidayCalendars,
}));
vi.mock("../../services/employee-storage-service", () => ({
  deleteStoredEmployee: mocks.deleteStoredEmployee,
  listStoredEmployees: mocks.listStoredEmployees,
  saveStoredEmployee: mocks.saveStoredEmployee,
}));
vi.mock("../../services/monthly-schedule-storage-service", () => ({
  listStoredMonthlySchedules: mocks.listStoredMonthlySchedules,
  saveStoredMonthlySchedule: mocks.saveStoredMonthlySchedule,
}));
vi.mock("../../services/schedule-plan-export-service", () => ({
  exportMonthlySchedulePlan: mocks.exportMonthlySchedulePlan,
}));
vi.mock("../../services/schedule-plan-export-history-service", () => ({
  listStoredSchedulePlanExports: mocks.listStoredSchedulePlanExports,
}));
vi.mock("../../services/schedule-plan-publish-service", () => ({
  publishSchedulePlanExport: mocks.publishSchedulePlanExport,
  resolveSchedulePlanPublishDirectory: mocks.resolveSchedulePlanPublishDirectory,
}));
vi.mock("../../services/schedule-plan-preview-service", () => ({
  previewMonthlySchedulePlan: mocks.previewMonthlySchedulePlan,
}));
vi.mock("../../services/shift-pattern-storage-service", () => ({
  deactivateStoredShiftPattern: mocks.deactivateStoredShiftPattern,
  listStoredShiftPatterns: mocks.listStoredShiftPatterns,
  saveStoredShiftPattern: mocks.saveStoredShiftPattern,
}));
vi.mock("../../services/site-pattern-extraction-service", () => ({
  analyzeSitePatternImport: mocks.analyzeSitePatternImport,
}));
vi.mock("../../services/site-storage-service", () => ({
  deleteStoredSite: mocks.deleteStoredSite,
  listStoredSites: mocks.listStoredSites,
  saveStoredSite: mocks.saveStoredSite,
}));
vi.mock("../../services/workforce-wage-bulk-update-service", () => ({
  applyWorkforceWageBulkUpdate: mocks.applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate: mocks.previewWorkforceWageBulkUpdate,
}));

const adminSession: AuthSession = {
  userId: "admin-1",
  loginId: "admin",
  displayName: "관리자",
  role: "admin",
  passwordChangeRequired: false,
  issuedAt: "2026-09-16T00:00:00.000Z",
  expiresAt: "2026-09-16T08:00:00.000Z",
};

const operatorSession: AuthSession = { ...adminSession, userId: "operator-1", role: "operator" };

const dialogBridge: DialogBridge = {
  showDialog: vi.fn(),
  dispose: vi.fn(async () => undefined),
};

const setup = (session: AuthSession | null = adminSession) => {
  const accessLogSpy = vi.fn();
  const sessionManager = new SessionManager({
    authService: {
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ ok: true, data: session })),
      getSessionWithRenewal: vi.fn(() => ({ ok: true, data: session })),
      changePassword: vi.fn(),
    },
    accessLogService: { recordAccessLog: accessLogSpy },
    findUserByLoginId: vi.fn(() => null),
    randomId: () => "a".repeat(64),
  });
  const cookieId = "a".repeat(64);
  if (session) {
    (
      sessionManager as unknown as {
        sessionMap: Map<string, { session: AuthSession; issuedAt: number; lastSeenAt: number }>;
      }
    ).sessionMap.set(cookieId, { session, issuedAt: Date.now(), lastSeenAt: Date.now() });
  }
  const registry = new RouteRegistry(sessionManager);
  registerWorkforceRoutes(registry, sessionManager);
  return {
    accessLogSpy,
    cookie: `sm_session=${cookieId}`,
    dataDir: "C:/sentinel/data",
    registry,
  };
};

const dispatch = (env: ReturnType<typeof setup>, channel: string, args: unknown[]) =>
  env.registry.dispatch(channel, args, {
    headers: {},
    cookie: env.cookie,
    signal: new AbortController().signal,
    version: "0.1.0",
    dataDir: env.dataDir,
    dialogBridge,
  });

type Descriptor = {
  args: unknown[];
  spy: ReturnType<typeof vi.fn>;
  expectedArgs: (env: ReturnType<typeof setup>, args: unknown[]) => unknown[];
};

const descriptors: Record<string, Descriptor> = {
  "employees:list": { args: [{ status: "active" }], spy: mocks.listStoredEmployees, expectedArgs: (_e, a) => [a[0]] },
  "employees:list-wage-rates": { args: ["emp-1"], spy: mocks.listStoredEmployeeWageRates, expectedArgs: (_e, a) => [a[0]] },
  "employees:list-assignments": { args: ["emp-1"], spy: mocks.listStoredEmployeeAssignments, expectedArgs: (_e, a) => [a[0]] },
  "employees:save-wage-rate": { args: [{ employeeId: "emp-1", hourlyWage: 12000 }], spy: mocks.saveStoredEmployeeWageRate, expectedArgs: (_e, a) => [a[0], adminSession] },
  "employees:close-wage-rate": { args: [{ employeeId: "emp-1", effectiveTo: "2026-09-30" }], spy: mocks.closeStoredEmployeeWageRate, expectedArgs: (_e, a) => [a[0]] },
  "employees:save-assignment": { args: [{ employeeId: "emp-1", siteId: "site-1" }], spy: mocks.saveStoredEmployeeAssignment, expectedArgs: (_e, a) => [a[0]] },
  "employees:close-assignment": { args: [{ assignmentId: "assignment-1" }], spy: mocks.closeStoredEmployeeAssignment, expectedArgs: (_e, a) => [a[0]] },
  "employees:reorder-assignment": { args: [{ assignmentId: "assignment-1", direction: "up" }], spy: mocks.reorderStoredEmployeeAssignment, expectedArgs: (_e, a) => [a[0]] },
  "employees:save": { args: [{ employeeId: "emp-1", name: "홍길동" }], spy: mocks.saveStoredEmployee, expectedArgs: (_e, a) => [a[0], adminSession] },
  "employees:delete": { args: [{ employeeId: "emp-1" }], spy: mocks.deleteStoredEmployee, expectedArgs: (_e, a) => [(a[0] as { employeeId: string }).employeeId, adminSession] },
  "employees:preview-wage-bulk-update": { args: [{ rows: [] }], spy: mocks.previewWorkforceWageBulkUpdate, expectedArgs: (_e, a) => [a[0]] },
  "employees:apply-wage-bulk-update": { args: [{ rows: [] }], spy: mocks.applyWorkforceWageBulkUpdate, expectedArgs: (_e, a) => [a[0], adminSession] },
  "sites:save": { args: [{ siteId: "site-1", name: "본사" }], spy: mocks.saveStoredSite, expectedArgs: (_e, a) => [a[0]] },
  "sites:list": { args: [], spy: mocks.listStoredSites, expectedArgs: () => [] },
  "sites:delete": { args: [{ siteId: "site-1" }], spy: mocks.deleteStoredSite, expectedArgs: (_e, a) => [(a[0] as { siteId: string }).siteId] },
  "shift-pattern-presets:list": {args:[],spy:mocks.listStoredPatternPresets,expectedArgs:()=>[]},
  "shift-pattern-presets:save": {args:[{name:"반복 패턴",definition:{version:1}}],spy:mocks.saveStoredPatternPreset,expectedArgs:(_e,a)=>[a[0]]},
  "shift-pattern-presets:delete": {args:[{id:"preset-1",expectedRevision:1}],spy:mocks.deleteStoredPatternPreset,expectedArgs:(_e,a)=>[a[0]]},
  "shift-patterns:list": { args: ["site-1"], spy: mocks.listStoredShiftPatterns, expectedArgs: (_e, a) => [a[0]] },
  "shift-patterns:analyze-import": { args: [{ filePath: "C:/pattern.xlsx" }], spy: mocks.analyzeSitePatternImport, expectedArgs: (_e, a) => [a[0]] },
  "shift-patterns:save": { args: [{ patternId: "pattern-1" }], spy: mocks.saveStoredShiftPattern, expectedArgs: (_e, a) => [a[0]] },
  "shift-patterns:deactivate": { args: [{ patternId: "pattern-1" }], spy: mocks.deactivateStoredShiftPattern, expectedArgs: (_e, a) => [(a[0] as { patternId: string }).patternId] },
  "monthly-schedules:list": { args: ["site-1"], spy: mocks.listStoredMonthlySchedules, expectedArgs: (_e, a) => [a[0]] },
  "monthly-schedules:save": { args: [{ scheduleId: "schedule-1" }], spy: mocks.saveStoredMonthlySchedule, expectedArgs: (_e, a) => [a[0]] },
  "monthly-schedules:preview-plan": { args: ["schedule-1"], spy: mocks.previewMonthlySchedulePlan, expectedArgs: (_e, a) => [a[0]] },
  "monthly-schedules:export-plan": { args: ["schedule-1"], spy: mocks.exportMonthlySchedulePlan, expectedArgs: (e, a) => [{ scheduleId: a[0], userDataPath: e.dataDir }] },
  "monthly-schedules:list-exports": { args: ["schedule-1"], spy: mocks.listStoredSchedulePlanExports, expectedArgs: (_e, a) => [a[0]] },
  "monthly-schedules:publish-export": { args: ["export-1"], spy: mocks.publishSchedulePlanExport, expectedArgs: (e, a) => [{ exportId: a[0], userDataPath: e.dataDir }] },
  "monthly-schedules:preparation-context": { args: [2026], spy: mocks.getStoredAppSettingsSnapshot, expectedArgs: (e) => [{ userDataPath: e.dataDir }] },
};

const activities = {
  "shift-pattern-presets:save": ["app-settings-save","sites","근무지 관리","반복 패턴 보관함 저장"],
  "shift-pattern-presets:delete": ["app-settings-save","sites","근무지 관리","반복 패턴 보관함 삭제"],
  "employees:save-wage-rate": ["employee-wage-save", "workforce", "인력 관리", "직원 시급 기준 저장"],
  "employees:close-wage-rate": ["employee-wage-close", "workforce", "인력 관리", "직원 시급 이력 종료"],
  "employees:save-assignment": ["employee-assignment-save", "workforce", "인력 관리", "직원 근무지 배정 저장"],
  "employees:close-assignment": ["employee-assignment-close", "workforce", "인력 관리", "직원 근무지 배정 종료"],
  "employees:reorder-assignment": ["employee-assignment-reorder", "sites", "근무지 관리", "직원 근무지 배정 순서 변경"],
  "employees:save": ["employee-save", "workforce", "인력 관리", "인력 기본 정보 저장"],
  "employees:delete": ["employee-delete", "workforce", "인력 관리", "인력 삭제"],
  "employees:apply-wage-bulk-update": ["employee-wage-bulk-apply", "workforce", "인력 관리", "시급 일괄 업데이트 적용"],
  "sites:save": ["site-save", "sites", "근무지 관리", "근무지 정보 저장"],
  "sites:delete": ["site-delete", "sites", "근무지 관리", "근무지 삭제"],
  "shift-patterns:analyze-import": ["shift-pattern-import", "schedule", "근무표 배포", "근무패턴 분석"],
  "shift-patterns:save": ["shift-pattern-save", "schedule", "근무표 배포", "근무패턴 저장"],
  "shift-patterns:deactivate": ["shift-pattern-deactivate", "schedule", "근무표 배포", "근무패턴 비활성화"],
  "monthly-schedules:save": ["schedule-save", "schedule", "근무표 배포", "근무표 저장"],
  "monthly-schedules:preview-plan": ["schedule-preview", "schedule", "근무표 배포", "근무표 미리보기"],
  "monthly-schedules:export-plan": ["schedule-export", "schedule", "근무표 배포", "근무표 생성"],
  "monthly-schedules:publish-export": ["schedule-publish", "schedule", "근무표 배포", "근무표 배포"],
} as const;

describe("workforce-routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["employees:save-wage-rate", "employees:apply-wage-bulk-update"])("W-06: %s returns the actual pending-file refresh outcome after saving", async channel => {
    const env = setup();
    const result = await dispatch(env, channel, descriptors[channel].args);
    expect(result?.body).toMatchObject({ ok: true, data: { pendingPerformanceRefresh: { status: "completed" } } });
    expect(mocks.refreshPendingPerformanceForWageChanges).toHaveBeenCalledTimes(1);
  });

  it("W-06: failed wage save never starts a pending-file refresh", async () => {
    mocks.saveStoredEmployeeWageRate.mockImplementationOnce(() => { throw new Error("저장 실패"); });
    const result = await dispatch(setup(), "employees:save-wage-rate", [{ employeeId: "emp-1" }]);
    expect(result?.body).toMatchObject({ ok: false, errorCode: "EMPLOYEE_WAGE_SAVE_FAILED" });
    expect(mocks.refreshPendingPerformanceForWageChanges).not.toHaveBeenCalled();
  });

  it("W-06: partial refresh is reported as a saved wage with separate file issues", async () => {
    mocks.refreshPendingPerformanceForWageChanges.mockResolvedValueOnce({ status: "partial", affectedEntryCount: 1, targetFileCount: 1, refreshedFileCount: 0, issues: [{ fileName: "실적.xlsx", message: "파일을 읽지 못했습니다." }] });
    const result = await dispatch(setup(), "employees:save-wage-rate", [{ employeeId: "emp-1" }]);
    expect(result?.body).toMatchObject({ ok: true, data: { pendingPerformanceRefresh: { status: "partial", refreshedFileCount: 0 } } });
  });

  it("W-09 employee save forwards trusted actor and reports corrected employment refresh interval separately", async () => {
    mocks.saveStoredEmployee.mockReturnValueOnce({id:"emp-1",retirementChange:{kind:"date-correction",retireDate:"2026-04-16",previousRetireDate:"2026-03-16"}});
    const input={id:"emp-1",status:"retired",retireDate:"2026-04-16",actor:{loginId:"forged"}};
    const result=await dispatch(setup(),"employees:save",[input]);
    expect(mocks.saveStoredEmployee).toHaveBeenCalledWith(input,adminSession);
    expect(mocks.refreshPendingPerformanceForWageChanges).toHaveBeenCalledWith([{employeeId:"emp-1",effectiveFrom:"2026-03-16",employmentFrom:"2026-03-16"}]);
    expect(result?.body).toMatchObject({ok:true,data:{retirementChange:{retireDate:"2026-04-16",pendingPerformanceRefresh:{status:"completed"}}}});
  });

  it.each(["rehire","reservation-updated","reservation-cancelled"])("W10 %s returns actual re-read summary covering old and new dates",async kind=>{
    mocks.saveStoredEmployee.mockReturnValueOnce({id:"emp-1",rehireChange:{kind,startDate:"2026-05-01",previousStartDate:"2026-04-01",previousRetireDate:"2026-03-16",employmentPeriodId:"p-new",newWageCount:1,newAssignmentCount:1}});
    const input={id:"emp-1",rehire:{operation:"reschedule"},actor:{loginId:"forged"}},result=await dispatch(setup(),"employees:save",[input]);
    expect(mocks.saveStoredEmployee).toHaveBeenCalledWith(input,adminSession);expect(mocks.refreshPendingPerformanceForWageChanges).toHaveBeenCalledWith([{employeeId:"emp-1",effectiveFrom:"2026-03-16",employmentFrom:"2026-03-16"}]);expect(result?.body).toMatchObject({ok:true,data:{rehireChange:{kind,pendingPerformanceRefresh:{status:"completed"}}}});
  });
  it("W-09 failed employee save cannot start retirement source refresh", async () => {
    mocks.saveStoredEmployee.mockImplementationOnce(()=>{throw new Error("퇴사 저장 실패");});
    const result=await dispatch(setup(),"employees:save",[{id:"emp-1",status:"retired"}]);expect(result?.body).toMatchObject({ok:false,errorCode:"EMPLOYEE_SAVE_FAILED"});expect(mocks.refreshPendingPerformanceForWageChanges).not.toHaveBeenCalled();
  });

  it("registers exactly the 29 workforce contracts", () => {
    const env = setup();
    expect(env.registry.getRegisteredChannels().sort()).toEqual([...WORKFORCE_CHANNELS].sort());
    expect(WORKFORCE_CHANNELS).toHaveLength(29);
    expect(Object.keys(descriptors).sort()).toEqual([...WORKFORCE_CHANNELS].sort());
    const manifestActivities = CHANNEL_CONTRACTS.filter(
      (contract) => contract.group === "workforce" && contract.recordsActivity,
    ).map((contract) => contract.channel).sort();
    expect(Object.keys(activities).sort()).toEqual(manifestActivities);
    expect(manifestActivities).toHaveLength(19);
    const dataDirChannels = CHANNEL_CONTRACTS.filter(
      (contract) => contract.group === "workforce" && contract.usesDataDir,
    ).map((contract) => contract.channel).sort();
    expect(dataDirChannels).toEqual([
      "monthly-schedules:export-plan",
      "monthly-schedules:preparation-context",
      "monthly-schedules:publish-export",
    ]);
  });

  it("dispatches all 29 channels with exact service arguments and 19 exact activities", async () => {
    for (const channel of WORKFORCE_CHANNELS) {
      vi.clearAllMocks();
      const env = setup();
      const descriptor = descriptors[channel];
      const result = await dispatch(env, channel, descriptor.args);
      expect(result?.status, channel).toBe(200);
            expect((result?.body as { ok: boolean }).ok, channel).toBe(true);
      expect(descriptor.spy, channel).toHaveBeenCalledTimes(1);
      expect(descriptor.spy, channel).toHaveBeenCalledWith(
        ...descriptor.expectedArgs(env, descriptor.args),
      );

      if (channel in activities) {
        const [actionType, routeKey, routeLabel, details] =
          activities[channel as keyof typeof activities];
        expect(env.accessLogSpy).toHaveBeenCalledTimes(1);
        expect(env.accessLogSpy).toHaveBeenCalledWith(
          {
            actionType,
            actionLabel: accessLogActionLabels[actionType],
            routeKey,
            routeLabel,
            details,
          },
          adminSession,
        );
      } else {
        expect(env.accessLogSpy).not.toHaveBeenCalled();
      }
    }
  });

  it("blocks missing sessions and insufficient roles before service effects", async () => {
    const noSession = setup(null);
    const noSessionResult = await dispatch(noSession, "employees:list", []);
    expect(noSessionResult?.status).toBe(401);
    expect(noSessionResult?.body).toMatchObject({ ok: false, errorCode: "AUTH_SESSION_REQUIRED" });
    expect(mocks.listStoredEmployees).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const operator = setup(operatorSession);
    const forbiddenResult = await dispatch(operator, "employees:save", [{ employeeId: "emp-1" }]);
    expect(forbiddenResult?.status).toBe(200);
    expect(forbiddenResult?.body).toMatchObject({ ok: false, errorCode: "AUTH_FORBIDDEN" });
    expect(mocks.saveStoredEmployee).not.toHaveBeenCalled();
    expect(operator.accessLogSpy).not.toHaveBeenCalled();
  });

  it.each(["employees:save-wage-rate", "employees:apply-wage-bulk-update"])("W-02: %s uses the session actor rather than forged payload metadata", async channel => {
    const env = setup();
    const payload = { employeeId: "emp-1", hourlyRate: 13600, effectiveFrom: "2026-04-01", actor: { userId: "forged", loginId: "forged", displayName: "위조", role: "admin" } };
    const result = await dispatch(env, channel, [payload]);
    expect(result?.status).toBe(200);
    const spy = channel === "employees:save-wage-rate" ? mocks.saveStoredEmployeeWageRate : mocks.applyWorkforceWageBulkUpdate;
    expect(spy).toHaveBeenCalledWith(payload, adminSession);
  });

  it("returns the original failure code and records no activity when a service throws", async () => {
    mocks.saveStoredEmployee.mockImplementationOnce(() => {
      throw new Error("저장 실패");
    });
    const env = setup();
    const result = await dispatch(env, "employees:save", [{ employeeId: "emp-1" }]);
    expect(result?.body).toEqual({
      ok: false,
      errorCode: "EMPLOYEE_SAVE_FAILED",
      message: "저장 실패",
    });
    expect(env.accessLogSpy).not.toHaveBeenCalled();
  });

  it("validates preparation-context year and filters out invalid or out-of-year holiday dates", async () => {
    const env = setup(adminSession);

    const invalidYearResult = await dispatch(env, "monthly-schedules:preparation-context", [1899]);
    expect(invalidYearResult?.body).toMatchObject({
      ok: false,
      errorCode: "MONTHLY_SCHEDULE_CONTEXT_FAILED",
      message: "유효한 연도(1900~9999)를 입력해 주세요.",
    });

    mocks.listStoredHolidayCalendars.mockReturnValueOnce([
      {
        year: 2026,
        items: [
          { holidayDate: "2026-01-01" },
          { holidayDate: "2026-02-29" },
          { holidayDate: "2026-02-30" },
          { holidayDate: "2026-13-01" },
          { holidayDate: "2025-12-25" },
          { holidayDate: "invalid-format" },
          { holidayDate: "2026-05-05" },
          { holidayDate: "2026-01-01" },
        ],
      },
    ]);

    const res2026 = await dispatch(env, "monthly-schedules:preparation-context", [2026]);
    expect(res2026?.body).toMatchObject({
      ok: true,
      data: {
        year: 2026,
        publicHolidayDates: ["2026-01-01", "2026-05-05"],
        publishDirectory: "C:/export/배포",
      },
    });

    mocks.listStoredHolidayCalendars.mockReturnValueOnce([
      {
        year: 2024,
        items: [
          { holidayDate: "2024-02-29" },
        ],
      },
    ]);
    const res2024 = await dispatch(env, "monthly-schedules:preparation-context", [2024]);
    expect((res2024?.body as { data: { publicHolidayDates: string[] } })?.data?.publicHolidayDates).toEqual(["2024-02-29"]);
  });
});
