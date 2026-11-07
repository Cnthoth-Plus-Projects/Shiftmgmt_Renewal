import { randomUUID } from "node:crypto";
import { copyFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import { buildAllowanceRateTable } from "../../shared/domain/allowance-rate-matrix";
import { createAllowanceCalculationSnapshot } from "../../shared/domain/allowance-service";
import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import {
  deleteStoredEmployee,
  listStoredEmployees,
  saveStoredEmployee
} from "./employee-storage-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} from "./performance-test-helpers";
import { parseReturnedSchedulePerformanceFile } from "./schedule-return-performance-parser";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  attachScheduleLayoutMetadataToWorkbook,
  computeCanonicalDigestSha256,
  type ScheduleLayoutRevisionMetadata
} from "./schedule-plan-adapter";
import { getBuiltInDocumentLayoutDefinition } from "./document-layout-definition-service";
import { applyDocumentLayoutToWorksheet } from "./document-layout-excel-render-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "schedule-return-performance-parser");

const updateReturnedWorkbook = async (
  filePath: string,
  update: (worksheet: ExcelJS.Worksheet) => void
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  update(worksheet);
  await workbook.xlsx.writeFile(filePath);
};

const getSiteIdByName = (siteName: string) => {
  const site = listStoredSites().find((item) => item.name === siteName);

  if (!site) {
    throw new Error(`테스트 근무지를 찾지 못했습니다: ${siteName}`);
  }

  return site.id;
};

const calculateTestAllowanceAmount = (entry: PerformanceEntryRecord) => {
  const rateVersion = allowanceRateVersionFixtures[0]!;
  const snapshot = createAllowanceCalculationSnapshot({
    calculationId: `calculation-${entry.id}`,
    performanceApprovalId: `approval-${entry.id}`,
    calculationVersion: 1,
    createdAt: "2026-03-31T00:00:00+09:00",
    approvedSnapshot: {
      performanceFileId: entry.performanceFileId,
      performanceEntryId: entry.id,
      approvalStatus: "approved",
      approvedAt: "2026-03-31T00:00:00+09:00",
      approvedBy: "tester",
      holidayCalendarId: "holiday-calendar-2026",
      allowanceRateVersionId: rateVersion.id,
      sourceFileChecksum: "test"
    },
    workDate: entry.workDate,
    timeRange: {
      startTime: entry.startTime ?? "",
      endTime: entry.endTime ?? "",
      breakMinutes: entry.breakMinutes
    },
    hourlyRate: entry.hourlyRate ?? 0,
    isHoliday: entry.workType === "holiday",
    workType: entry.workType,
    rateTable: buildAllowanceRateTable(rateVersion)
  });

  return snapshot.totalAllowanceAmount;
};

describe("schedule-return-performance-parser", () => {
  it.each(["sample1", "sample2"] as const)("FLOW-01: %s rejects missing hours but preserves midnight and omitted whole-hour minutes", async variant => {
    const fixture = await prepareReturnedScheduleFixture({rootDir: testRoot, templateVariant: variant});
    const original = await new ExcelJS.Workbook().xlsx.readFile(fixture.filePath);
    const bytes = await original.xlsx.writeBuffer();
    const columns = variant === "sample1" ? ["BC", "BD", "BE", "BF"] : ["BK", "BL", "BM", "BN"];
    for (const missing of [[0, 1, 2, 3], [0], [2]]) {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
      for (const index of missing) workbook.worksheets[0].getCell(`${columns[index]}34`).value = null;
      await workbook.xlsx.writeFile(fixture.filePath);
      const parsed = await parseReturnedSchedulePerformanceFile({filePath: fixture.filePath, fileId: "missing-clock"});
      const overtime = parsed.entries.find(entry => entry.section === "overtime")!;
      expect(overtime.totalWorkMinutes).toBe(0);
      expect(overtime.startTime === undefined || overtime.endTime === undefined).toBe(true);
      expect(overtime.alerts.some(alert => alert.severity === "error")).toBe(true);
    }
    for (const values of [[0, 0, 4, 0], [20, null, 1, null]]) {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
      values.forEach((value, index) => { workbook.worksheets[0].getCell(`${columns[index]}34`).value = value; });
      await workbook.xlsx.writeFile(fixture.filePath);
      const parsed = await parseReturnedSchedulePerformanceFile({filePath: fixture.filePath, fileId: "valid-clock"});
      const overtime = parsed.entries.find(entry => entry.section === "overtime")!;
      expect(overtime.startTime).toBe(values[0] === 0 ? "00:00" : "20:00");
      expect(overtime.endTime).toBe(values[2] === 4 ? "04:00" : "01:00");
      expect(overtime.totalWorkMinutes).toBeGreaterThan(0);
      expect(overtime.alerts).toEqual([]);
    }
  });

  it.each(["sample1", "sample2"] as const)("FLOW-03: %s rejects a renamed file whose month differs from its worksheet", async variant => {
    const fixture = await prepareReturnedScheduleFixture({rootDir: testRoot, templateVariant: variant});
    const renamed = path.join(fixture.pendingDir, `2026_04_${fixture.siteName}.xlsx`);
    await copyFile(fixture.filePath, renamed);
    await expect(parseReturnedSchedulePerformanceFile({filePath: renamed, fileId: "wrong-file-month"})).rejects.toThrow(/파일명 근무월.*엑셀 본문 근무월/);
  });

  it.each(["sample1", "sample2"] as const)("FLOW-03: %s rejects an out-of-month actual overtime date", async variant => {
    const fixture = await prepareReturnedScheduleFixture({rootDir: testRoot, templateVariant: variant});
    await updateReturnedWorkbook(fixture.filePath, sheet => { sheet.getCell(variant === "sample1" ? "BA34" : "BI34").value = "2026-04-03"; });
    await expect(parseReturnedSchedulePerformanceFile({filePath: fixture.filePath, fileId: "wrong-work-month"})).rejects.toThrow(/근무월.*다른 근무일/);
  });

  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should parse template2 returned workbooks using the shifted row sections", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample2"
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-sample2"
    });
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(parsed.templateVariant).toBe("sample2");
    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe("보라매DC");
    expect(parsed.entries).toHaveLength(3);

    expect(holidayEntry).toMatchObject({
      employeeName: fixture.workers.holiday.name,
      workType: "holiday",
      dutyCode: "D",
      teamLabel: "A조",
      totalWorkMinutes: 660
    });

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workType: "substitute",
      teamLabel: "B조",
      reason: "교육",
      evidence: "대체증적"
    });

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      workType: "overtime",
      startTime: "20:00",
      endTime: "01:00",
      employeeRank: "사원",
      teamLabel: "D조",
      breakMinutes: 30,
      totalWorkMinutes: 270,
      overtimeMinutes: 120,
      nightMinutes: 150
    });
    expect(parsed.previewRows[0]?.["근로유형"]).toBe("법정휴일근무");
  });

  it("should parse Hong Gil-dong placeholder with a changed worker as legal holiday work", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = "홍길동";
      worksheet.getCell("AL12").value = fixture.workers.holidayReplacement.name;
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = "홍길동";
      worksheet.getCell("BE11").value = fixture.workers.substituteReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-hong-holiday"
    });
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");

    expect(holidayEntry).toMatchObject({
      employeeName: fixture.workers.holidayReplacement.name,
      workType: "holiday",
      dutyCode: "D",
      totalWorkMinutes: 660,
      note: "홍길동 기준 법정휴일근로"
    });
    expect(holidayEntry?.alerts.some((alert) => alert.message.includes("홍길동"))).toBe(false);
    expect(
      parsed.entries.some(
        (entry) => entry.section === "substitute" && entry.note === "원 근무자 홍길동"
      )
    ).toBe(false);
  });

  it("should keep worksheet site name when a returned file has a duplicate name suffix", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const duplicatePath = path.resolve(fixture.pendingDir, `2026_3_${fixture.siteName}_1.xlsx`);

    await copyFile(fixture.filePath, duplicatePath);
    await updateReturnedWorkbook(duplicatePath, (worksheet) => {
      worksheet.getCell("W6").value = new Date(2026, 2, 1);
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: duplicatePath,
      fileId: "schedule-return-duplicate-name-suffix"
    });

    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should parse site-first file names while using the worksheet site name", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const returnedPath = path.resolve(
      fixture.pendingDir,
      `${fixture.siteName}_2026-03_${fixture.siteName}_4조_2교대.xlsx`
    );

    await copyFile(fixture.filePath, returnedPath);
    await updateReturnedWorkbook(returnedPath, (worksheet) => {
      worksheet.getCell("W6").value = new Date(2026, 2, 1);
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: returnedPath,
      fileId: "schedule-return-site-first-file-name"
    });

    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should normalize duplicate suffixes from the worksheet site name", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("C3").value = `${fixture.siteName}_dup01`;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-worksheet-site-duplicate-suffix"
    });

    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should use the worksheet site name when the file name does not contain identity metadata", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const returnedPath = path.resolve(fixture.pendingDir, "returned-schedule.xlsx");

    await copyFile(fixture.filePath, returnedPath);
    await updateReturnedWorkbook(returnedPath, (worksheet) => {
      worksheet.getCell("C3").value = `${fixture.siteName}_dup01`;
      worksheet.getCell("W6").value = new Date(2026, 2, 1);
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: returnedPath,
      fileId: "schedule-return-worksheet-site-fallback"
    });

    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should preserve bare trailing digits in parsed site names", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const siteNameWithDigit = `${fixture.siteName}1`;
    const returnedPath = path.resolve(fixture.pendingDir, `2026_3_${siteNameWithDigit}.xlsx`);

    await copyFile(fixture.filePath, returnedPath);
    await updateReturnedWorkbook(returnedPath, (worksheet) => {
      worksheet.getCell("C3").value = siteNameWithDigit;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: returnedPath,
      fileId: "schedule-return-bare-digit-site-name"
    });

    expect(parsed.siteName).toBe(siteNameWithDigit);
    expect(parsed.scheduleKey).toBe(`2026-03:${siteNameWithDigit.replace(/\s+/g, "").toLowerCase()}`);
  });

  it("should prefer the parsed file site name when the worksheet site name was edited", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("C3").value = "잘못된근무지";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-edited-worksheet-site-name"
    });

    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should change the holiday source signature when the stored schedule source changes", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const firstParsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-source-signature-before"
    });
    const firstHolidayEntry = firstParsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );
    const database = getSqliteDatabase()!;

    database
      .prepare(
        `
          UPDATE monthly_schedule_items
          SET start_time = ?, end_time = ?, break_minutes = ?
          WHERE work_date = ?
            AND duty_code = ?
        `
      )
      .run("07:00", "19:00", 90, "2026-03-01", "D");

    const secondParsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-source-signature-after"
    });
    const secondHolidayEntry = secondParsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(firstHolidayEntry?.sourceSignature).toBeTruthy();
    expect(secondHolidayEntry?.sourceSignature).toBeTruthy();
    expect(secondHolidayEntry?.sourceSignature).not.toBe(firstHolidayEntry?.sourceSignature);
  });

  it("should use the returned duty column time before the replacement worker own schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const schedule = database
      .prepare(
        `
          SELECT id
          FROM monthly_schedules
          WHERE schedule_month = ?
            AND site_id = ?
          LIMIT 1
        `
      )
      .get("2026-03", getSiteIdByName(fixture.siteName)) as { id: string } | undefined;
    const eveningReferenceEmployee = database
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(fixture.workers.substituteOriginal.employeeCode) as { id: string } | undefined;
    const replacementEmployee = database
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(fixture.workers.holidayReplacement.employeeCode) as { id: string } | undefined;

    if (!schedule || !eveningReferenceEmployee || !replacementEmployee) {
      throw new Error("테스트 근무표 또는 인력 정보를 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          INSERT INTO monthly_schedule_items (
            id,
            schedule_id,
            employee_id,
            team_label,
            sort_order,
            work_date,
            duty_code,
            start_time,
            end_time,
            break_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        randomUUID(),
        schedule.id,
        eveningReferenceEmployee.id,
        "B조",
        10,
        "2026-03-01",
        "E",
        "14:00",
        "22:00",
        60
      );
    database
      .prepare(
        `
          INSERT INTO monthly_schedule_items (
            id,
            schedule_id,
            employee_id,
            team_label,
            sort_order,
            work_date,
            duty_code,
            start_time,
            end_time,
            break_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        randomUUID(),
        schedule.id,
        replacementEmployee.id,
        "C조",
        11,
        "2026-03-01",
        "N",
        "18:00",
        "06:00",
        90
      );

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("AD12").value = "홍길동";
      worksheet.getCell("AP12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-duty-column-before-worker-schedule"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.note === "홍길동 기준 법정휴일근로" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(holidayEntry).toMatchObject({
      dutyCode: "E",
      startTime: "14:00",
      endTime: "22:00",
      breakMinutes: 60
    });
  });

  it("should use the duty code slot time for an unscheduled changed worker on a holiday row", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database
      .prepare(
        `
          UPDATE monthly_schedule_items
          SET work_date = ?
          WHERE work_date = ?
            AND duty_code = ?
        `
      )
      .run("2026-03-31", "2026-03-01", "D");

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = "홍길동";
      worksheet.getCell("AL12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-holiday-duty-code-only-slot-time"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holidayReplacement.name &&
        entry.note === "홍길동 기준 법정휴일근로"
    );

    expect(holidayEntry).toMatchObject({
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalWorkMinutes: 660
    });
    expect(calculateTestAllowanceAmount(holidayEntry!)).toBeGreaterThan(0);
  });

  it("should fall back to the duty-code slot time for a real holiday worker missing from the schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample2"
    });
    const database = getSqliteDatabase()!;
    const holidayEmployee = database
      .prepare(`SELECT id FROM employees WHERE employee_code = ? LIMIT 1`)
      .get(fixture.workers.holiday.employeeCode) as { id: string } | undefined;

    if (!holidayEmployee) {
      throw new Error("테스트 휴일 투입자 정보를 찾지 못했습니다.");
    }

    // Move the real holiday worker's own schedule rows off the holiday date so they can no longer be
    // resolved by name on 2026-03-01, while the D-duty slot time still exists (any-date fallback).
    database
      .prepare(
        `UPDATE monthly_schedule_items SET work_date = ? WHERE work_date = ? AND employee_id = ?`
      )
      .run("2026-03-31", "2026-03-01", holidayEmployee.id);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-holiday-real-worker-duty-fallback"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
    );

    // Old code resolved the schedule only by worker name → null → 0 minutes; the duty-code fallback
    // now sources the fixed slot time even though the worker is absent from the (partial) schedule.
    expect(holidayEntry).toMatchObject({
      dutyCode: "D",
      totalWorkMinutes: 660
    });
    expect(
      holidayEntry?.alerts.some((alert) => alert.message.includes("개인 근무표 기준을 찾지 못해"))
    ).toBe(true);
    expect(calculateTestAllowanceAmount(holidayEntry!)).toBeGreaterThan(0);
  });

  it("should warn when falling back to the replacement worker own schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const schedule = database
      .prepare(
        `
          SELECT id
          FROM monthly_schedules
          WHERE schedule_month = ?
            AND site_id = ?
          LIMIT 1
        `
      )
      .get("2026-03", getSiteIdByName(fixture.siteName)) as { id: string } | undefined;
    const replacementEmployee = database
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(fixture.workers.holidayReplacement.employeeCode) as { id: string } | undefined;

    if (!schedule || !replacementEmployee) {
      throw new Error("테스트 근무표 또는 대체 투입자 정보를 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          DELETE FROM monthly_schedule_items
          WHERE duty_code = ?
        `
      )
      .run("E");

    database
      .prepare(
        `
          INSERT INTO monthly_schedule_items (
            id,
            schedule_id,
            employee_id,
            team_label,
            sort_order,
            work_date,
            duty_code,
            start_time,
            end_time,
            break_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        randomUUID(),
        schedule.id,
        replacementEmployee.id,
        "C조",
        11,
        "2026-03-01",
        "N",
        "18:00",
        "06:00",
        90
      );

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("AD12").value = "홍길동";
      worksheet.getCell("AP12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-worker-schedule-fallback-alert"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.note === "홍길동 기준 법정휴일근로" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(holidayEntry).toMatchObject({
      dutyCode: "N",
      startTime: "18:00",
      endTime: "06:00",
      breakMinutes: 90
    });
    expect(
      holidayEntry?.alerts.some((alert) =>
        alert.message.includes("근무열 기준을 찾지 못해 투입자 원래 근무시간을 사용했습니다")
      )
    ).toBe(true);
  });

  it("should skip BP workers that are shown only for schedule visibility", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BG34").value = "BP(외부인력)";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-bp-skip"
    });

    expect(parsed.entries.some((entry) => entry.employeeName === "BP(외부인력)")).toBe(false);
    expect(parsed.entries.some((entry) => entry.section === "overtime")).toBe(false);
    expect(parsed.entries).toHaveLength(2);
  });

  it("should skip a Hong Gil-dong duty slot when the actual worker is explicitly None", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = "홍길동";
      worksheet.getCell("AL12").value = "None";
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = "홍길동";
      worksheet.getCell("BE11").value = fixture.workers.substituteReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-hong-substitute"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.workDate === "2026-03-01" &&
        entry.note === "홍길동 기준 법정휴일근로"
    );
    const substituteEntry = parsed.entries.find(
      (entry) =>
        entry.section === "substitute" &&
        entry.workDate === "2026-03-01" &&
        entry.note === "원 근무자 홍길동"
    );

    expect(holidayEntry).toBeUndefined();
    expect(substituteEntry).toBeUndefined();
  });

  it("should use the duty code slot time for an empty original substitute slot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      expect(worksheet.getCell("AA12").value).toBe("-");
      worksheet.getCell("AM12").value = fixture.workers.substituteReplacement.name;
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = "-";
      worksheet.getCell("BE11").value = fixture.workers.substituteReplacement.name;
      worksheet.getCell("BG11").value = "빈 슬롯 대체";
      worksheet.getCell("BJ11").value = "운영자 변경";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-empty-slot-substitute-duty-time"
    });
    const substituteEntry = parsed.entries.find(
      (entry) =>
        entry.section === "substitute" &&
        entry.employeeName === fixture.workers.substituteReplacement.name &&
        entry.workDate === "2026-03-01"
    );

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workDate: "2026-03-01",
      workType: "substitute",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalWorkMinutes: 660,
      baseWorkMinutes: 480,
      overtimeMinutes: 180,
      reason: "빈 슬롯 대체",
      evidence: "운영자 변경",
      note: "원 근무자 -"
    });
    expect(calculateTestAllowanceAmount(substituteEntry!)).toBeGreaterThan(0);
  });

  it("should skip legal holiday work for a real scheduled worker when the actual worker is explicitly None", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("AL12").value = "None";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-real-worker-none-changed-cell"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(holidayEntry).toBeUndefined();
  });

  it("should skip legal holiday work when the returned change table marks the actual worker as None", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = fixture.workers.holiday.name;
      worksheet.getCell("BE11").value = "None";
      worksheet.getCell("BG11").value = "법정휴일 근무 취소";
      worksheet.getCell("BJ11").value = "운영자 확인";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-real-worker-none-change-table"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );
    const substituteEntry = parsed.entries.find(
      (entry) =>
        entry.section === "substitute" &&
        entry.workDate === "2026-03-01" &&
        entry.note === `원 근무자 ${fixture.workers.holiday.name}`
    );

    expect(holidayEntry).toBeUndefined();
    expect(substituteEntry).toBeUndefined();
  });

  it("should parse a manually filled empty duty slot on a holiday row", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      expect(worksheet.getCell("AA12").value).toBe("-");
      worksheet.getCell("AA12").value = "홍길동";
      worksheet.getCell("AM12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-manual-empty-duty-slot"
    });
    const manualEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.workDate === "2026-03-01" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(manualEntry).toMatchObject({
      employeeName: fixture.workers.holidayReplacement.name,
      workDate: "2026-03-01",
      workType: "holiday",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00"
    });
    expect(manualEntry?.logicalKey.endsWith(":holiday:12:D:1")).toBe(true);
  });

  it("should parse an after-only worker in an empty holiday duty slot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      expect(worksheet.getCell("AA12").value).toBe("-");
      worksheet.getCell("AM12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-after-only-empty-duty-slot"
    });
    const manualEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.workDate === "2026-03-01" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(manualEntry).toMatchObject({
      employeeName: fixture.workers.holidayReplacement.name,
      workDate: "2026-03-01",
      workType: "holiday",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00"
    });
    expect(manualEntry?.logicalKey.endsWith(":holiday:12:D:1")).toBe(true);
  });

  it("should keep rows visible with row alerts when the stored monthly schedule is missing", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-missing-stored-schedule"
    });

    expect(parsed.alerts.some((alert) => alert.message.includes("월간 근무표 저장본을 찾지 못했습니다"))).toBe(
      true
    );
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      workType: "overtime",
      section: "overtime",
      totalWorkMinutes: 270
    });
    expect(holidayEntry).toMatchObject({
      workType: "holiday",
      section: "legal-holiday",
      totalWorkMinutes: 0
    });
    expect(substituteEntry).toMatchObject({
      workType: "substitute",
      section: "substitute",
      totalWorkMinutes: 0
    });
    expect(
      [holidayEntry, substituteEntry].every((entry) =>
        entry?.alerts.some(
          (alert) =>
            alert.severity === "error" &&
            alert.message.includes("월간 근무표 저장본이 없어 근무시간을 산출할 수 없습니다")
        )
      )
    ).toBe(true);
  });

  it("should calculate past performance for an archived retired employee", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const retiredEmployee = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );
    const database = getSqliteDatabase()!;

    if (!retiredEmployee) {
      throw new Error("테스트 퇴사 인력을 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          UPDATE employees
          SET status = 'retired',
              retire_date = ?
          WHERE id = ?
        `
      )
      .run("2026-04-01", retiredEmployee.id);
    database
      .prepare(
        `
          UPDATE employee_site_assignments
          SET status = 'ended',
              end_date = ?
          WHERE employee_id = ?
        `
      )
      .run("2026-04-01", retiredEmployee.id);
    database
      .prepare(
        `
          UPDATE wage_rates
          SET effective_to = ?
          WHERE employee_id = ?
            AND effective_to IS NULL
        `
      )
      .run("2026-03-31", retiredEmployee.id);

    deleteStoredEmployee(retiredEmployee.id);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-archived-retired-worker"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(holidayEntry).toMatchObject({
      employeeCode: fixture.workers.holiday.employeeCode,
      hourlyRate: 13200,
      totalWorkMinutes: 660,
      baseWorkMinutes: 660,
      overtimeMinutes: 0
    });
    expect(
      holidayEntry?.alerts.some(
        (alert) =>
          alert.severity === "error" &&
          (alert.message.includes("인력 정보를 찾지 못했습니다") ||
            alert.message.includes("시급"))
      )
    ).toBe(false);
  });

  it("should keep Pool substitute workers in history without making them payable", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BE11").value = `${fixture.workers.substituteReplacement.name}(P)`;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-substitute"
    });
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      employeeCode: fixture.workers.substituteReplacement.employeeCode,
      workType: "substitute",
      isPoolWorker: true
    });
    expect(substituteEntry?.note).toContain("Pool 대체근무");
    expect(substituteEntry?.note).toContain("수당 미지급");
    expect(substituteEntry?.note).toContain(
      `원본 표기 ${fixture.workers.substituteReplacement.name}(P)`
    );
    expect(substituteEntry?.alerts).toEqual([]);
  });

  it("should resolve same-name workers by site before applying employee-code based checks", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const otherSite = listStoredSites().find((site) => site.name !== fixture.siteName);

    if (!otherSite) {
      throw new Error("동명이인 테스트용 다른 근무지를 찾지 못했습니다.");
    }

    saveStoredEmployee({
      employeeCode: "EMP-PF-T1-O-SAME-NAME",
      name: fixture.workers.overtime.name,
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: otherSite.id,
      shiftGroup: "A조",
      hourlyRate: 15100
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-same-name-different-site"
    });
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      employeeCode: fixture.workers.overtime.employeeCode
    });
    expect(
      overtimeEntry?.alerts.some((alert) => alert.message.includes("동명이인"))
    ).toBe(false);
  });

  it("should keep returned schedule workers available from the hire date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const overtimeEmployeeCode = fixture.workers.overtime.employeeCode;
    const overtimeEmployee = getSqliteDatabase()!
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(overtimeEmployeeCode) as { id: string } | undefined;

    if (!overtimeEmployee) {
      throw new Error("테스트 인력 정보를 찾지 못했습니다.");
    }

    getSqliteDatabase()!
      .prepare(
        `
          UPDATE employee_site_assignments
          SET start_date = ?
          WHERE employee_id = ?
            AND status = 'active'
        `
      )
      .run("2026-03-15", overtimeEmployee.id);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-hire-date-availability"
    });
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      employeeCode: overtimeEmployeeCode,
      hourlyRate: 14100
    });
    expect(
      overtimeEntry?.alerts.some((alert) => alert.message.includes("인력 정보를 찾지 못했습니다."))
    ).toBe(false);
  });

  it("should block same-name workers when the employee code cannot be resolved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    saveStoredEmployee({
      employeeCode: "EMP-PF-T1-O-AMBIGUOUS",
      name: fixture.workers.overtime.name,
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: getSiteIdByName(fixture.siteName),
      shiftGroup: "A조",
      hourlyRate: 15100
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-same-name-same-site"
    });
    const overtimeEntry = parsed.entries.find((entry) => entry.employeeName === fixture.workers.overtime.name);

    expect(overtimeEntry).toBeUndefined();
    expect(
      parsed.previewRows.some((row) =>
        String(row["직원명"] ?? row["employee_name"] ?? row["employeeName"] ?? "") ===
        fixture.workers.overtime.name
      )
    ).toBe(false);
    expect(
      parsed.alerts.some(
        (alert) =>
          alert.severity === "warning" &&
          alert.message.includes("사번 없는 실적 1건을 실적 목록에서 제외했습니다")
      )
    ).toBe(true);
  });

  it("should add error alerts when one employee code has overlapping work times", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BA35").value = "2026-03-03";
      worksheet.getCell("BC35").value = 22;
      worksheet.getCell("BD35").value = 0;
      worksheet.getCell("BE35").value = 23;
      worksheet.getCell("BF35").value = 0;
      worksheet.getCell("BG35").value = fixture.workers.overtime.name;
      worksheet.getCell("BH35").value = "추가복구";
      worksheet.getCell("BJ35").value = "추가증적";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-overlap"
    });
    const overtimeEntries = parsed.entries.filter(
      (entry) =>
        entry.section === "overtime" &&
        entry.employeeCode === fixture.workers.overtime.employeeCode
    );

    expect(overtimeEntries).toHaveLength(2);
    expect(
      overtimeEntries.every((entry) =>
        entry.alerts.some(
          (alert) => alert.severity === "error" && alert.message.includes("근무시간이")
        )
      )
    ).toBe(true);
  });

  it("should mark Pool holiday and overtime rows as non-payable without missing wage errors", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = `${fixture.workers.holiday.name}(P)`;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-holiday"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(holidayEntry).toMatchObject({
      employeeName: fixture.workers.holiday.name,
      isPoolWorker: true
    });
    expect(holidayEntry?.note).toContain("Pool 근무");
    expect(holidayEntry?.note).toContain("수당 미지급");
    expect(
      holidayEntry?.alerts.some((alert) => alert.message.includes("시급"))
    ).toBe(false);
  });

  it("should filter out non-BP rows without employee code and add an aggregated warning", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    // 엑셀에 등록되지 않은 임의의 비-BP 직원명 입력
    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BG34").value = "미등록비사번직원";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-missing-code-filter"
    });

    const unassignedEntry = parsed.entries.find(
      (entry) => entry.employeeName === "미등록비사번직원"
    );
    expect(unassignedEntry).toBeUndefined();
    expect(
      parsed.alerts.some(
        (alert) =>
          alert.severity === "warning" &&
          alert.message.includes("사번 없는 실적 1건을 실적 목록에서 제외했습니다")
      )
    ).toBe(true);
  });

  it("should not treat an employee as Pool when past Pool assignment has ended and current duty date is in a normal team", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const holidayEmployeeCode = fixture.workers.holiday.employeeCode;
    const holidayEmployee = getSqliteDatabase()!
      .prepare("SELECT id FROM employees WHERE employee_code = ?")
      .get(holidayEmployeeCode) as { id: string } | undefined;

    if (!holidayEmployee) {
      throw new Error("테스트 인력 정보를 찾지 못했습니다.");
    }

    // 과거 Pool 배치 추가 (2025년도)
    getSqliteDatabase()!
      .prepare(`
        INSERT INTO employee_site_assignments (
          id, employee_id, site_id, shift_group, start_date, end_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        "assign-past-pool",
        holidayEmployee.id,
        getSiteIdByName(fixture.siteName),
        "Pool",
        "2025-01-01",
        "2025-12-31",
        "closed",
        "2025-01-01T00:00:00.000Z"
      );

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-past-pool-not-pool-now"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    // 2026-03 근무일에는 Pool이 아니어야 함
    expect(holidayEntry?.isPoolWorker).toBe(false);
    expect(holidayEntry?.note).toBeUndefined();
  });

  it("should treat worker as normal when normal assignment starts on the pool assignment end_date (endDate exclusive)", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const holidayEmployeeCode = fixture.workers.holiday.employeeCode;
    const db = getSqliteDatabase()!;
    const holidayEmployee = db
      .prepare("SELECT id FROM employees WHERE employee_code = ?")
      .get(holidayEmployeeCode) as { id: string } | undefined;

    if (!holidayEmployee) {
      throw new Error("테스트 인력 정보를 찾지 못했습니다.");
    }

    // 기존 배정 모두 비활성화
    db.prepare("UPDATE employee_site_assignments SET status = 'closed' WHERE employee_id = ?").run(holidayEmployee.id);

    // 1) Pool 배정: 2026-01-01 ~ 2026-03-01 (2026-03-01은 endDate exclusive이므로 제외되어야 함)
    db.prepare(`
      INSERT INTO employee_site_assignments (
        id, employee_id, site_id, shift_group, start_date, end_date, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "assign-pool-end-0301",
      holidayEmployee.id,
      getSiteIdByName(fixture.siteName),
      "Pool",
      "2026-01-01",
      "2026-03-01",
      "active",
      "2026-01-01T00:00:00.000Z"
    );

    // 2) 일반 배정: 2026-03-01 ~ 2026-12-31
    db.prepare(`
      INSERT INTO employee_site_assignments (
        id, employee_id, site_id, shift_group, start_date, end_date, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "assign-normal-start-0301",
      holidayEmployee.id,
      getSiteIdByName(fixture.siteName),
      "A조",
      "2026-03-01",
      "2026-12-31",
      "active",
      "2026-03-01T00:00:00.000Z"
    );

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-end-date-boundary"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    // 2026-03-01 당일은 Pool 종료일(exclusive)이자 일반 시작일이므로 일반(false)이어야 함
    expect(holidayEntry?.isPoolWorker).toBe(false);
    expect(holidayEntry?.note ?? "").not.toContain("Pool");
  });

  it("should not treat worker as pool when pool assignment exists at another site on the same date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const holidayEmployeeCode = fixture.workers.holiday.employeeCode;
    const db = getSqliteDatabase()!;
    const holidayEmployee = db
      .prepare("SELECT id FROM employees WHERE employee_code = ?")
      .get(holidayEmployeeCode) as { id: string } | undefined;

    if (!holidayEmployee) {
      throw new Error("테스트 인력 정보를 찾지 못했습니다.");
    }

    // 다른 근무지 생성
    const otherSiteId = "test-other-site-pool-scope";
    db.prepare(`
      INSERT OR REPLACE INTO sites (id, site_code, name, customer_name, status, timezone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(otherSiteId, "SITE-OTHER-POOL", "다른근무지", "고객사", "active", "Asia/Seoul", "2026-01-01T00:00:00.000Z");

    // 다른 근무지에 동시 Pool 배정 등록 (2026-01-01 ~ 2026-12-31)
    db.prepare(`
      INSERT INTO employee_site_assignments (
        id, employee_id, site_id, shift_group, start_date, end_date, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "assign-other-site-pool",
      holidayEmployee.id,
      otherSiteId,
      "Pool",
      "2026-01-01",
      "2026-12-31",
      "active",
      "2026-01-01T00:00:00.000Z"
    );

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-other-site-pool-not-affect"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    // 대상 근무지에는 일반(A조) 배정이 있으므로 다른 근무지의 Pool 배정으로 인해 Pool로 오판되지 않아야 함
    expect(holidayEntry?.isPoolWorker).toBe(false);
    expect(holidayEntry?.note ?? "").not.toContain("Pool");
  });

  // 33. N1~N5: invalid metadata / missing fields / unknown revision / mismatch fail-closed matrix (Phase 2.5-4 R2/T5)
  it("N1~N5: invalid metadata / missing fields / unknown revision / mismatch fail-closed matrix (Phase 2.5-4 R2/T5)", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    const def = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const digest = computeCanonicalDigestSha256(def);

    const validMeta: ScheduleLayoutRevisionMetadata = {
      definitionSha256: digest,
      format: "shiftmgmt.schedule-layout-revision",
      generatorCompatibilityVersion: "built-in-excel-layout-v1",
      layoutKey: "schedule-xlsx/template1",
      revisionId: `builtin:schedule-xlsx/template1:${digest}`,
      revisionKind: "built-in",
      schemaVersion: 1
    };

    const testMetadataFailure = async (
      setupWb: (wb: ExcelJS.Workbook) => void,
      expectedErrorPattern: string | RegExp
    ) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(fixture.filePath);
      setupWb(wb);
      const testPath = path.join(path.dirname(fixture.filePath), `meta-test-${randomUUID()}.xlsx`);
      await wb.xlsx.writeFile(testPath);

      await expect(
        parseReturnedSchedulePerformanceFile({
          filePath: testPath,
          fileId: "invalid-meta-test"
        })
      ).rejects.toThrow(expectedErrorPattern);
    };

    // N1: invalid JSON
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      wb.getWorksheet("__shiftmgmt_meta")!.getCell("A1").value = "{invalid json";
    }, "메타데이터 JSON 형식이 올바르지 않습니다");

    // N1-2: 필드 누락
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      const corrupt = { ...validMeta } as Record<string, unknown>;
      delete corrupt.format;
      wb.getWorksheet("__shiftmgmt_meta")!.getCell("A1").value = JSON.stringify(corrupt);
    }, "허용되지 않거나 누락된 필드");

    // N1-3: 추가 필드
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      const corrupt = { ...validMeta, rogueField: "illegal" };
      wb.getWorksheet("__shiftmgmt_meta")!.getCell("A1").value = JSON.stringify(corrupt);
    }, "허용되지 않거나 누락된 필드");

    // N2: 정의 이름 없음
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      wb.definedNames.model = [];
    }, "메타데이터 시트 또는 정의 이름이 누락되었습니다");

    // N2-2: 정의 이름이 A1이 아닌 B1을 가리킴
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      wb.definedNames.model = [{ name: "_SHIFT_MGMT_SCHEDULE_LAYOUT_REVISION", ranges: ["__shiftmgmt_meta!$B$1"] }];
    }, "정의 이름이 가리키는 범위가 올바르지 않습니다");

    // N2-3: metaSheet가 visible
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      wb.getWorksheet("__shiftmgmt_meta")!.state = "visible";
    }, "메타데이터 시트가 숨겨져 있지 않습니다");

    // N3: unknown stored ID
    await testMetadataFailure((wb) => {
      const storedMeta: ScheduleLayoutRevisionMetadata = {
        ...validMeta,
        revisionKind: "stored",
        revisionId: randomUUID()
      };
      attachScheduleLayoutMetadataToWorkbook(wb, storedMeta);
    }, "레이아웃 판을 찾을 수 없습니다");

    // N4: unknown built-in ID
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      const unknownBuiltin: ScheduleLayoutRevisionMetadata = {
        ...validMeta,
        revisionId: `builtin:schedule-xlsx/template1:${"0".repeat(64)}`
      };
      wb.getWorksheet("__shiftmgmt_meta")!.getCell("A1").value = JSON.stringify(unknownBuiltin);
    }, "built-in revisionId가 규약과 일치하지 않습니다");

    // N4-2: generatorCompatibilityVersion 불일치
    await testMetadataFailure((wb) => {
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      const invalidGen: ScheduleLayoutRevisionMetadata = {
        ...validMeta,
        generatorCompatibilityVersion: "incompatible-generator-v99"
      };
      wb.getWorksheet("__shiftmgmt_meta")!.getCell("A1").value = JSON.stringify(invalidGen);
    }, "generatorCompatibilityVersion");

    // N5: layoutKey/variant 불일치 (template1 파일에 template2 layoutKey 기록)
    await testMetadataFailure((wb) => {
      const template2Def = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template2" });
      const template2Digest = computeCanonicalDigestSha256(template2Def);
      const mismatchKeyMeta: ScheduleLayoutRevisionMetadata = {
        definitionSha256: template2Digest,
        format: "shiftmgmt.schedule-layout-revision",
        generatorCompatibilityVersion: "built-in-excel-layout-v1",
        layoutKey: "schedule-xlsx/template2",
        revisionId: `builtin:schedule-xlsx/template2:${template2Digest}`,
        revisionKind: "built-in",
        schemaVersion: 1
      };
      attachScheduleLayoutMetadataToWorkbook(wb, mismatchKeyMeta);
    }, "보호 구조 검증 실패");
  });

  // 34. N6: parser-critical header / DATE / merge / row-height 변조 fail-closed matrix (Phase 2.5-4 R4/T5)
  it("N6: parser-critical header / DATE / merge / row-height 변조 fail-closed matrix (Phase 2.5-4 R4/T5)", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    const def = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const digest = computeCanonicalDigestSha256(def);
    const validMeta: ScheduleLayoutRevisionMetadata = {
      definitionSha256: digest,
      format: "shiftmgmt.schedule-layout-revision",
      generatorCompatibilityVersion: "built-in-excel-layout-v1",
      layoutKey: "schedule-xlsx/template1",
      revisionId: `builtin:schedule-xlsx/template1:${digest}`,
      revisionKind: "built-in",
      schemaVersion: 1
    };

    const testTamperFailure = async (
      tamper: (ws: ExcelJS.Worksheet) => void,
      expectedPattern: string | RegExp
    ) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(fixture.filePath);
      attachScheduleLayoutMetadataToWorkbook(wb, validMeta);
      const ws = wb.getWorksheet("교대 근무 계획표")!;
      tamper(ws);

      const testPath = path.join(path.dirname(fixture.filePath), `tamper-test-${randomUUID()}.xlsx`);
      await wb.xlsx.writeFile(testPath);

      await expect(
        parseReturnedSchedulePerformanceFile({
          filePath: testPath,
          fileId: "tamper-test"
        })
      ).rejects.toThrow(expectedPattern);
    };

    // A. DATE 표식 변조 (row 9 col 2)
    await testTamperFailure((ws) => {
      ws.getCell(9, 2).value = "날짜";
    }, "DATE 표식이 일치하지 않거나 변조되었습니다");

    // B. 변경 사유 머리글 변조 (AX9)
    await testTamperFailure((ws) => {
      ws.getCell("AX9").value = "단순 사유";
    }, "변경 사유 머리글이 일치하지 않거나 변조되었습니다");

    // C. 정적 표 머리글 변조 (substitute header: BA9)
    await testTamperFailure((ws) => {
      ws.getCell("BA9").value = "임의 변경된 머리글";
    }, "정적 표 머리글이 변조되었습니다");

    // D. 병합(Merge) 변조: 중요한 셀 unmerge
    await testTamperFailure((ws) => {
      try {
        ws.unMergeCells("C3:G4");
      } catch {
        const model = ws.model as unknown as { merges?: string[] };
        model.merges = model.merges?.filter((m: string) => !m.includes("C3"));
      }
    }, "보호된 병합 범위가 일치하지 않거나 변조되었습니다");

    // E. 행 높이 변조
    await testTamperFailure((ws) => {
      ws.getRow(9).height = 45;
    }, "보호된 행 높이가 변조되었습니다");
  });

  // 35. N7: legacy 정상 허용 vs metadata 제거된 shifted workbook 거절 (Phase 2.5-4 R5/T5)
  it("N7: legacy 정상 허용 vs metadata 제거된 shifted workbook 거절 (Phase 2.5-4 R5/T5)", async () => {
    // 1) metadata가 없는 정상 fixture는 legacy로 통과
    const fixture1 = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const parsedLegacy = await parseReturnedSchedulePerformanceFile({
      filePath: fixture1.filePath,
      fileId: "legacy-pass-1"
    });
    expect(parsedLegacy.entries.length).toBeGreaterThan(0);

    // 2) shifted 워크북에서 metadata만 제거한 경우 -> 거절 (N7)
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(fixture1.filePath);
    const ws = wb.getWorksheet("교대 근무 계획표")!;

    // 블록 이동 적용
    const baseDef = getBuiltInDocumentLayoutDefinition({ documentKind: "schedule-xlsx", variant: "template1" });
    const shiftedDef: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));
    const grid = shiftedDef.outputs[0]!.blocks.find((b) => b.id === "schedule.calendar-grid")!;
    grid.y += 1;
    applyDocumentLayoutToWorksheet({ worksheet: ws, definition: shiftedDef });

    // metadata 시트와 정의 이름이 전혀 없는 상태로 저장
    const shiftedPath = path.join(path.dirname(fixture1.filePath), "shifted-stripped.xlsx");
    await wb.xlsx.writeFile(shiftedPath);

    await expect(
      parseReturnedSchedulePerformanceFile({
        filePath: shiftedPath,
        fileId: "shifted-stripped-reject"
      })
    ).rejects.toThrow("보호 구조 검증 실패");
  });
});
