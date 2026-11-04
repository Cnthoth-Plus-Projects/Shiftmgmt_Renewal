import { resolveWageRateForDate } from "../../shared/domain/wage-rate";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listStoredEmployees, resetEmployeeStorageForTest } from "./employee-storage-service";
import {
  closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  reorderStoredEmployeeAssignment,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "./employee-history-service";
import { listStoredSites } from "./site-storage-service";
import { listStoredShiftPatterns, saveStoredShiftPattern } from "./shift-pattern-storage-service";
import { getSqliteDatabase, initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

describe("employee-history-service", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should list wage rate history for a seeded employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(wageRates).toHaveLength(1);
    expect(wageRates[0]?.employeeCode).toBe("EMP-001");
    expect(wageRates[0]?.employeeName).toBe("김현우");
    expect(wageRates[0]?.hourlyRate).toBe(12800);
    expect(wageRates[0]?.reason).toBe("초기 시드");
  });

  it("should list assignment history for a seeded employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const assignments = listStoredEmployeeAssignments(employee!.id);

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.employeeCode).toBe("EMP-001");
    expect(assignments[0]?.employeeName).toBe("김현우");
    expect(assignments[0]?.siteName).toBe("보라매DC");
    expect(assignments[0]?.shiftGroup).toBe("A조");
    expect(assignments[0]?.status).toBe("active");
  });

  it("should append a wage rate history entry and close the previous active one", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13600,
      effectiveFrom: "2026-04-01",
      reason: "정기 인상"
    });

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(saved.hourlyRate).toBe(13600);
    expect(saved.effectiveFrom).toBe("2026-04-01");
    expect(wageRates).toHaveLength(2);
    expect(wageRates[0]?.hourlyRate).toBe(13600);
    expect(wageRates[0]?.reason).toBe("정기 인상");
    expect(wageRates[1]?.effectiveTo).toBe("2026-03-31");
  });

  // 같은 적용일로 다시 저장하면 줄이 늘지 않고 그 줄을 고쳐 쓴다(잘못 넣은 시급 정정).
  it("should overwrite the wage rate that already starts on the same date", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const currentWageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(currentWageRate).toBeDefined();

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13600,
      effectiveFrom: currentWageRate!.effectiveFrom,
      reason: "금액 정정"
    });

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(saved.id).toBe(currentWageRate!.id);
    expect(wageRates).toHaveLength(1);
    expect(wageRates[0]?.hourlyRate).toBe(13600);
    expect(wageRates[0]?.reason).toBe("금액 정정");
  });

  // 소급 인상: 지난 날짜로 넣어도 기간이 겹치지 않게 앞뒤 줄이 정리돼야 한다.
  it("should insert a backdated wage rate without overlapping the neighbouring rows", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const seededWageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(seededWageRate).toBeDefined();

    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 14000,
      effectiveFrom: "2026-07-01",
      reason: "정기 인상"
    });

    const backdated = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13500,
      effectiveFrom: "2026-04-01",
      reason: "소급 인상"
    });

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(backdated.effectiveFrom).toBe("2026-04-01");
    // 시작일이 늦은 순서로 내려온다: 2026-07-01 → 2026-04-01 → 시드 시급.
    expect(wageRates.map((rate) => `${rate.effectiveFrom}~${rate.effectiveTo ?? ""}`)).toEqual([
      "2026-07-01~",
      "2026-04-01~2026-06-30",
      `${seededWageRate!.effectiveFrom}~2026-03-31`
    ]);
  });

  // 종료 처리된 줄이 있어도 기간이 겹치지 않아야 한다(예전에는 검사가 풀려 겹쳤다).
  it("should not overlap a closed wage rate when a backdated row is inserted", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const raised = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 14000,
      effectiveFrom: "2026-07-01",
      reason: "정기 인상"
    });

    closeStoredEmployeeWageRate({ wageRateId: raised.id, effectiveTo: "2026-12-31" });

    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13900,
      effectiveFrom: "2026-05-01",
      reason: "소급 인상"
    });

    const ranges = listStoredEmployeeWageRates(employee!.id).map((rate) => ({
      from: rate.effectiveFrom,
      to: rate.effectiveTo ?? "9999-12-31"
    }));
    const sorted = [...ranges].sort((left, right) => left.from.localeCompare(right.from));
    const overlaps = sorted.some((range, index) => {
      const next = sorted[index + 1];

      return next ? next.from <= range.to : false;
    });

    expect(overlaps).toBe(false);
    expect(sorted.map((range) => range.from)).toEqual(
      [...new Set(sorted.map((range) => range.from))]
    );
  });

  it("should append an assignment history entry and close the previous active one", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const site = listStoredSites().find((targetSite) => targetSite.siteCode === "SITE-DTN");

    expect(employee).toBeDefined();
    expect(site).toBeDefined();

    const saved = saveStoredEmployeeAssignment({
      employeeId: employee!.id,
      siteId: site!.id,
      shiftGroup: "A",
      startDate: "2026-04-01"
    });

    const assignments = listStoredEmployeeAssignments(employee!.id);

    expect(saved.siteId).toBe(site!.id);
    expect(saved.siteName).toBe(site!.name);
    expect(saved.shiftGroup).toBe("A조");
    expect(assignments).toHaveLength(2);
    expect(assignments[0]?.siteName).toBe(site!.name);
    expect(assignments[0]?.status).toBe("active");
    expect(assignments[0]?.shiftGroup).toBe("A조");
    expect(assignments[1]?.status).toBe("ended");
    expect(assignments[1]?.endDate).toBe("2026-04-01");
  });

  it("should reject assignments that exceed the active team capacity", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const site = listStoredSites().find((targetSite) => targetSite.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-014"
    );

    expect(site).toBeDefined();
    expect(pattern).toBeDefined();
    expect(employee).toBeDefined();

    saveStoredShiftPattern({
      id: pattern!.id,
      siteId: pattern!.siteId,
      name: pattern!.name,
      teamCount: pattern!.teamCount,
      patternCode: pattern!.patternCode,
      startIndexRule: pattern!.startIndexRule,
      patternStartDate: pattern!.patternStartDate,
      status: pattern!.status,
      steps: pattern!.steps.map((step) => ({
        stepIndex: step.stepIndex,
        dutyCode: step.dutyCode,
        startTime: step.startTime,
        endTime: step.endTime,
        breakMinutes: step.breakMinutes
      })),
      teamIndexes: pattern!.teamIndexes,
      cycles: pattern!.cycles.map((cycle) => ({
        cycleKey: cycle.cycleKey,
        name: cycle.name,
        order: cycle.order,
        shiftCount: cycle.shiftCount,
        patternCode: cycle.patternCode,
        patternStartDate: cycle.patternStartDate,
        steps: cycle.steps.map((step) => ({
          stepIndex: step.stepIndex,
          dutyCode: step.dutyCode,
          startTime: step.startTime,
          endTime: step.endTime,
          breakMinutes: step.breakMinutes
        })),
        teamIndexes: cycle.teamIndexes
      })),
      teamCycleAssignments: pattern!.teamCycleAssignments,
      teamCapacities: [{ teamLabel: "A조", maxHeadcount: 1 }],
      poolEnabled: pattern!.poolEnabled,
      poolStartTime: pattern!.poolStartTime,
      poolEndTime: pattern!.poolEndTime,
      poolBreakMinutes: pattern!.poolBreakMinutes
    });

    expect(() =>
      saveStoredEmployeeAssignment({
        employeeId: employee!.id,
        siteId: site!.id,
        shiftGroup: "A조",
        startDate: "2026-04-01"
      })
    ).toThrow("A조 정원(1명)을 초과할 수 없습니다.");
  });

  it("should close an active wage rate without deleting history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const wageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(wageRate).toBeDefined();

    const closed = closeStoredEmployeeWageRate({
      wageRateId: wageRate!.id,
      effectiveTo: "2026-03-31"
    });

    expect(closed.effectiveTo).toBe("2026-03-31");
    expect(listStoredEmployeeWageRates(employee!.id)).toHaveLength(1);
  });

  it("should close an active assignment without deleting history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const assignment = listStoredEmployeeAssignments(employee!.id)[0];

    expect(assignment).toBeDefined();

    const closed = closeStoredEmployeeAssignment({
      assignmentId: assignment!.id,
      endDate: "2026-03-31"
    });

    expect(closed.status).toBe("ended");
    expect(closed.endDate).toBe("2026-03-31");
    expect(listStoredEmployeeAssignments(employee!.id)).toHaveLength(1);
  });

  it("should reorder active assignments within the same team", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const site = listStoredSites().find((targetSite) => targetSite.siteCode === "SITE-DTN");
    const firstEmployee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const secondEmployee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-014"
    );

    expect(site).toBeDefined();
    expect(firstEmployee).toBeDefined();
    expect(secondEmployee).toBeDefined();

    saveStoredEmployeeAssignment({
      employeeId: firstEmployee!.id,
      siteId: site!.id,
      shiftGroup: "A조",
      startDate: "2026-04-01"
    });
    const secondAssignment = saveStoredEmployeeAssignment({
      employeeId: secondEmployee!.id,
      siteId: site!.id,
      shiftGroup: "A조",
      startDate: "2026-04-02"
    });

    const reordered = reorderStoredEmployeeAssignment({
      assignmentId: secondAssignment.id,
      direction: "up"
    });

    expect(reordered.map((assignment) => assignment.employeeId)).toEqual([
      secondEmployee!.id,
      firstEmployee!.id
    ]);
    expect(reordered.map((assignment) => assignment.sortOrder)).toEqual([0, 1]);
  });
});

describe("W-02: same-date wage snapshot preservation", () => {
  let fixtureRoot: string;
  const actor = { userId: "w02-admin", loginId: "w02-admin", displayName: "시급담당", role: "admin" as const };

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-w02-unit-"));
    initializeSqliteStorage({ dbPath: path.join(fixtureRoot, "test.sqlite") });
    listStoredEmployees();
  });
  afterEach(() => {
    vi.useRealTimers(); resetEmployeeStorageForTest(); resetSqliteStorageForTest();
    if (path.dirname(path.resolve(fixtureRoot)) !== path.resolve(os.tmpdir()) || !path.basename(fixtureRoot).startsWith("shiftmgmt-w02-unit-")) throw new Error("Unexpected W02 cleanup path.");
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
  const target = () => listStoredEmployees().find(e => e.employeeCode === "EMP-001")!;
  const history = () => getSqliteDatabase()!.prepare("SELECT * FROM wage_rate_history ORDER BY rowid").all();

  it("archives the previous amount, reason, period and trusted actor while retaining current wage identity and schema", () => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    const schema = getSqliteDatabase()!.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    const saved = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13600, effectiveFrom: before.effectiveFrom, reason: "금액 정정" }, actor);
    expect(saved.id).toBe(before.id);
    expect(listStoredEmployeeWageRates(employee.id)).toHaveLength(1);
    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({ wage_rate_id: before.id, employee_id: employee.id, hourly_rate: before.hourlyRate, wage_reason: before.reason, effective_from: before.effectiveFrom, effective_to: before.effectiveTo ?? null, actor_user_id: actor.userId, actor_login_id: actor.loginId, actor_display_name: actor.displayName, actor_role: actor.role });
    expect(saved.history?.[0]).toMatchObject({ hourlyRate: before.hourlyRate, reason: before.reason, actorDisplayName: actor.displayName });
    expect(getSqliteDatabase()!.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
  });

  it("preserves every preceding snapshot including an empty reason and deterministic same-time ordering", () => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13600, effectiveFrom: before.effectiveFrom }, actor);
    const saved = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 14000, effectiveFrom: before.effectiveFrom, reason: "재정정" }, actor);
    expect(saved.history?.map(h => h.hourlyRate)).toEqual([13600, before.hourlyRate]);
    expect(saved.history?.map(h => h.reason)).toEqual([undefined, before.reason]);
    expect(history()[1]).toMatchObject({ hourly_rate: 13600, wage_reason: null });
  });

  it("does not append duplicate audit snapshots for an identical value, reason and interval", () => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    const saved = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: before.hourlyRate, effectiveFrom: before.effectiveFrom, reason: before.reason }, actor);
    expect(history()).toHaveLength(0);
    expect(saved).toEqual(before);
  });

  it("archives reason-only corrections and explicitly identifies internal callers as system", () => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: before.hourlyRate, effectiveFrom: before.effectiveFrom, reason: "사유만 정정" });
    expect(history()[0]).toMatchObject({ hourly_rate: before.hourlyRate, wage_reason: before.reason, actor_user_id: "system", actor_role: "system" });
  });

  it("preserves unrelated imported history without labelling it a same-date correction", () => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13600, effectiveFrom: before.effectiveFrom, reason: "정정" }, actor);
    getSqliteDatabase()!.prepare("UPDATE wage_rate_history SET action_type = 'legacy-imported'").run();
    expect(listStoredEmployeeWageRates(employee.id)[0]?.history).toBeUndefined();
    expect(history()).toHaveLength(1);
  });

  it.each(["history", "update"] as const)("rolls back both current value and history on %s failure", failure => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    const db = getSqliteDatabase()!;
    db.exec(failure === "history"
      ? "CREATE TEMP TRIGGER w02_fail BEFORE INSERT ON wage_rate_history BEGIN SELECT RAISE(ABORT,'w02 rejected'); END"
      : "CREATE TEMP TRIGGER w02_fail BEFORE UPDATE ON wage_rates BEGIN SELECT RAISE(ABORT,'w02 rejected'); END");
    expect(() => saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13600, effectiveFrom: before.effectiveFrom, reason: "실패 정정" }, actor)).toThrow("w02 rejected");
    expect(listStoredEmployeeWageRates(employee.id)[0]).toEqual(before);
    expect(history()).toHaveLength(0);
    db.exec("BEGIN; ROLLBACK;");
  });

  it("keeps corrections inside an existing outer transaction until its commit", () => {
    const employee = target(); const before = listStoredEmployeeWageRates(employee.id)[0]!;
    const db = getSqliteDatabase()!; db.exec("BEGIN");
    const saved = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13600, effectiveFrom: before.effectiveFrom, reason: "일괄 정정" }, actor);
    expect(saved.history).toHaveLength(1);
    db.exec("ROLLBACK");
    expect(listStoredEmployeeWageRates(employee.id)[0]).toEqual(before);
    expect(history()).toHaveLength(0);
  });

  it("keeps closed-neighbour periods unchanged and isolates history by employee and wage row", () => {
    const employee = target();
    const first = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13600, effectiveFrom: "2026-04-01", reason: "인상" }, actor);
    saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 15000, effectiveFrom: "2026-07-01", reason: "다음 인상" }, actor);
    const saved = saveStoredEmployeeWageRate({ employeeId: employee.id, hourlyRate: 13800, effectiveFrom: first.effectiveFrom, reason: "중간 정정" }, actor);
    expect(saved.effectiveTo).toBe("2026-06-30");
    expect(saved.history?.[0]).toMatchObject({ hourlyRate: 13600, effectiveTo: "2026-06-30" });
    const rates = listStoredEmployeeWageRates(employee.id);
    expect(rates.find(r => r.effectiveFrom === "2026-07-01")?.history).toBeUndefined();
    const other = listStoredEmployees().find(e => e.employeeCode === "EMP-014")!;
    expect(listStoredEmployeeWageRates(other.id).every(r => !r.history?.length)).toBe(true);
  });
});


describe("W-08 explicit wage revision", () => {
  let root: string;
  const actor = { userId: "w08-admin", loginId: "w08-admin", displayName: "시급 담당", role: "admin" as const };
  beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-w08-history-")); initializeSqliteStorage({ dbPath: path.join(root, "test.sqlite") }); });
  afterEach(() => { vi.restoreAllMocks(); resetEmployeeStorageForTest(); resetSqliteStorageForTest(); if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("shiftmgmt-w08-history-")) throw new Error("Unexpected W08 root"); rmSync(root, { recursive: true, force: true }); });
  const employee = () => listStoredEmployees().find(e => e.employeeCode === "EMP-001")!;
  const current = () => listStoredEmployeeWageRates(employee().id)[0];
  const source = (id: string) => getSqliteDatabase()!.prepare("SELECT * FROM wage_rates WHERE id=?").get(id);
  const history = () => getSqliteDatabase()!.prepare("SELECT * FROM wage_rate_history ORDER BY rowid").all();
  const revise = (rate: ReturnType<typeof current>, operation: "correct" | "invalidate", amount = rate.hourlyRate) => saveStoredEmployeeWageRate({ employeeId: rate.employeeId, effectiveFrom: rate.effectiveFrom, hourlyRate: amount, revision: { operation, wageRateId: rate.id, expectedRevision: rate.revisionToken!, changeReason: "W08 원본 증빙 확인" } }, actor);

  it("corrects only amount/reason within the original closed period and preserves the old snapshot", () => {
    const rate = current(); closeStoredEmployeeWageRate({ wageRateId: rate.id, effectiveTo: "2026-03-31" });
    const before = current(), schema = getSqliteDatabase()!.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    const saved = revise(before, "correct", 15500);
    expect(saved).toMatchObject({ id: before.id, effectiveFrom: before.effectiveFrom, effectiveTo: before.effectiveTo, createdAt: before.createdAt, hourlyRate: 15500, reason: "W08 원본 증빙 확인" });
    expect(saved.history?.[0]).toMatchObject({ hourlyRate: before.hourlyRate, reason: before.reason, actorLoginId: actor.loginId, changeReason: "W08 원본 증빙 확인", actionType: "corrected" });
    expect(saved.revisionToken).not.toBe(before.revisionToken);
    expect(getSqliteDatabase()!.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
    expect(() => revise(before, "correct", 16000)).toThrow("변경");
  });

  it("invalidates without changing any original wage field, and rejects repeated mutation and close", () => {
    const rate = current(), before = source(rate.id); const saved = revise(rate, "invalidate");
    expect(source(rate.id)).toEqual(before); expect(saved.invalidation).toMatchObject({ actionType: "invalidated", hourlyRate: rate.hourlyRate, changeReason: "W08 원본 증빙 확인", actorLoginId: actor.loginId });
    expect(resolveWageRateForDate(listStoredEmployeeWageRates(rate.employeeId), rate.effectiveFrom)).toBeUndefined();
    expect(() => revise(rate, "invalidate")).toThrow(); expect(() => revise(saved, "correct", 17000)).toThrow();
    expect(() => closeStoredEmployeeWageRate({ wageRateId: rate.id, effectiveTo: "2026-12-31" })).toThrow("무효"); expect(history()).toHaveLength(1);
    expect(employee().currentHourlyRate).toBeUndefined();
  });

  it("allows explicit same-start replacement while retaining the invalid source and all evidence", () => {
    const rate = current(); revise(rate, "invalidate"); const invalid = source(rate.id);
    const replacement = saveStoredEmployeeWageRate({ employeeId: rate.employeeId, effectiveFrom: rate.effectiveFrom, hourlyRate: 16600, reason: "새 증빙" });
    expect(replacement.id).not.toBe(rate.id); expect(source(rate.id)).toEqual(invalid); expect(history()).toHaveLength(1);
    expect(resolveWageRateForDate(listStoredEmployeeWageRates(rate.employeeId),rate.effectiveFrom)?.id).toBe(replacement.id); expect(employee().currentHourlyRate).toBe(16600);
  });

  it("a same-start replacement outranks a later invalidated legacy duplicate", () => {
    const rate = current(), db=getSqliteDatabase()!;
    db.prepare(`INSERT INTO wage_rates (id,employee_id,hourly_rate,effective_from,effective_to,reason,created_at)
      SELECT 'w08-overlap',employee_id,14000,effective_from,effective_to,'legacy duplicate',created_at FROM wage_rates WHERE id=?`).run(rate.id);
    const duplicate=current();expect(duplicate.id).toBe("w08-overlap");revise(duplicate,"invalidate");
    expect(employee().currentHourlyRate).toBeUndefined();
    const replacement=saveStoredEmployeeWageRate({employeeId:rate.employeeId,effectiveFrom:rate.effectiveFrom,hourlyRate:17000});
    expect(replacement.id).not.toBe(rate.id);expect(replacement.id).not.toBe(duplicate.id);
    expect(resolveWageRateForDate(listStoredEmployeeWageRates(rate.employeeId),rate.effectiveFrom)?.hourlyRate).toBe(17000);
    expect(employee().currentHourlyRate).toBe(17000);expect(listStoredEmployeeWageRates(rate.employeeId).find(r=>r.id===duplicate.id)?.invalidation).toBeDefined();
  });

  it("keeps a middle void gap, inclusive bounds and future rates even with overlapping legacy data", () => {
    const e = employee(); const middle = saveStoredEmployeeWageRate({ employeeId: e.id, effectiveFrom: "2026-04-01", hourlyRate: 14000 });
    saveStoredEmployeeWageRate({ employeeId: e.id, effectiveFrom: "2026-07-01", hourlyRate: 16000 });
    const rate = listStoredEmployeeWageRates(e.id).find(r => r.id === middle.id)!; revise(rate, "invalidate"); const invalid = source(rate.id);
    getSqliteDatabase()!.prepare("UPDATE wage_rates SET effective_to=NULL WHERE employee_id=? AND effective_from < '2026-04-01'").run(e.id);
    const rates = listStoredEmployeeWageRates(e.id);
    expect(resolveWageRateForDate(rates,"2026-03-31")?.hourlyRate).toBeDefined();
    for (const day of ["2026-04-01","2026-06-30"]) expect(resolveWageRateForDate(rates,day)).toBeUndefined();
    expect(resolveWageRateForDate(rates,"2026-07-01")?.hourlyRate).toBe(16000);
    saveStoredEmployeeWageRate({ employeeId:e.id,effectiveFrom:"2026-05-01",hourlyRate:15500 });
    expect(source(rate.id)).toEqual(invalid); expect(resolveWageRateForDate(listStoredEmployeeWageRates(e.id),"2026-04-30")).toBeUndefined();
    expect(resolveWageRateForDate(listStoredEmployeeWageRates(e.id),"2026-05-01")?.hourlyRate).toBe(15500);
  });

  it.each(["operator","reviewer"] as const)("rejects forbidden actor %s and leaves original/history intact", role => {
    const rate=current(), before=source(rate.id); expect(() => saveStoredEmployeeWageRate({employeeId:rate.employeeId,hourlyRate:15500,effectiveFrom:rate.effectiveFrom,revision:{operation:"correct",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"금액 확인"}},{...actor,role})).toThrow("권한");
    expect(source(rate.id)).toEqual(before); expect(history()).toHaveLength(0);
  });

  it("rejects wrong employee, blank/oversized reason and noninteger/nonpositive correction without history", () => {
    const rate=current(), before=source(rate.id);
    for (const patch of [{employeeId:"unknown"},{hourlyRate:0},{hourlyRate:1.5},{hourlyRate:Infinity},{revision:{operation:"correct" as const,wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:" "}},{revision:{operation:"correct" as const,wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"a".repeat(501)}}]) {
      expect(() => saveStoredEmployeeWageRate({employeeId:rate.employeeId,effectiveFrom:rate.effectiveFrom,hourlyRate:15500,revision:{operation:"correct",wageRateId:rate.id,expectedRevision:rate.revisionToken!,changeReason:"금액 확인"},...patch},actor)).toThrow();
    }
    expect(source(rate.id)).toEqual(before); expect(history()).toHaveLength(0);
  });

  it.each(["ABORT","ROLLBACK"])("audit insert %s cannot leave a partial correction or void", failure => {
    const rate=current(), before=source(rate.id);getSqliteDatabase()!.exec(`CREATE TEMP TRIGGER w08_audit_failure BEFORE INSERT ON wage_rate_history BEGIN SELECT RAISE(${failure},'w08 audit failure'); END`);
    for(const operation of ["correct","invalidate"] as const) expect(()=>revise(rate,operation,15500)).toThrow("w08 audit failure");
    expect(source(rate.id)).toEqual(before);expect(history()).toHaveLength(0);
  });

  it("a failed update also rolls back its previously inserted correction snapshot", () => {
    const rate=current(), before=source(rate.id);getSqliteDatabase()!.exec("CREATE TEMP TRIGGER w08_update_failure BEFORE UPDATE ON wage_rates BEGIN SELECT RAISE(ABORT,'w08 update failure'); END");
    expect(()=>revise(rate,"correct",15500)).toThrow("w08 update failure");expect(source(rate.id)).toEqual(before);expect(history()).toHaveLength(0);
  });
});
