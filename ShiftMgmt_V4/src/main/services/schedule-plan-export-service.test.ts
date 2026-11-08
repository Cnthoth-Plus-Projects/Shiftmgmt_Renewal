import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import { inspectDocumentTemplateImport } from "./document-template-management-service";
import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { saveStoredEmployee } from "./employee-storage-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import {
  listStoredDocumentTemplateVersions,
  saveStoredHolidayItem,
  saveStoredDocumentTemplateVersion
} from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { parseReturnedSchedulePerformanceFile } from "./schedule-return-performance-parser";
import {
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";
import {
  resetDocumentLayout,
  saveDocumentLayout
} from "./document-layout-storage-service";
import {
  readScheduleLayoutRevisionMetadataFromWorkbook,
  resolveScheduleSectionLayoutsFromDefinition
} from "./schedule-plan-adapter";
import type { DocumentLayoutDefinition } from "../../shared/domain/document-layout";
import { buildMonthlyScheduleDraft } from "../../shared/domain/monthly-schedule-draft";

const testOutputDir = path.resolve(process.cwd(), "artifacts", "tests", "schedule-exports");
const calendarDateFormat = 'dd"일"';

const expectCellDate = (value: unknown, year: number, month: number, day: number) => {
  expect(value).toBeInstanceOf(Date);

  const dateValue = value as Date;

  expect(dateValue.getFullYear()).toBe(year);
  expect(dateValue.getMonth()).toBe(month - 1);
  expect(dateValue.getDate()).toBe(day);
};

const expectCalendarDateCell = (
  worksheet: ExcelJS.Worksheet,
  address: string,
  year: number,
  month: number,
  day: number
) => {
  const cell = worksheet.getCell(address);

  expectCellDate(cell.value, year, month, day);
  expect(cell.numFmt).toBe(calendarDateFormat);
};

const createAssignedEmployee = (input: {
  employeeCode: string;
  name: string;
  siteId: string;
  shiftGroup: string;
}) => {
  const employee = saveStoredEmployee({
    employeeCode: input.employeeCode,
    name: input.name,
    employmentType: "정규",
    status: "active",
    hireDate: "2024-01-01"
  });

  saveStoredEmployeeAssignment({
    employeeId: employee.id,
    siteId: input.siteId,
    shiftGroup: input.shiftGroup,
    startDate: "2024-01-01"
  });

  return employee;
};

describe("schedule-plan-export-service", () => {
  it.each(["sample1", "sample2"] as const)("%s round trip keeps public-weekend hours, excludes ordinary weekends and preserves explicit off/zero", async variant => {
    initializeSqliteStorage({ dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite") });
    const site = listStoredSites().find(item => item.name === "보라매DC")!;
    const seed = listStoredShiftPatterns(site.id)[0]!;
    const employee = createAssignedEmployee({ employeeCode: "WEEKEND-ROUNDTRIP", name: "주말검증", siteId: site.id, shiftGroup: "A조" });
    const step = { id: "always-D", stepIndex: 0, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 };
    const pattern = { ...seed, steps: [step], cycles: [{ ...seed.cycles[0]!, cycleLength: 1, patternCode: "D", steps: [step], teamIndexes: [{ teamLabel: "A조", index: 0 }] }], teamCycleAssignments: [{ teamLabel: "A조", cycleKey: seed.cycles[0]!.cycleKey }], holidayPolicy: {
      version: 1 as const, rules: {
        public: { mode: "normal" as const, excludedDutyCodes: [], times: { D: { startTime: "09:00", endTime: "18:00", breakMinutes: 60 } } },
        saturday: { mode: "normal" as const, excludedDutyCodes: [], times: { D: { startTime: "10:00", endTime: "16:00", breakMinutes: 30 } } },
        sunday: { mode: "normal" as const, excludedDutyCodes: [], times: { D: { startTime: "11:00", endTime: "15:00", breakMinutes: 0 } } }
      }, dateExceptions: [
        { id: "off", from: "2026-05-16", to: "2026-05-16", scope: "site" as const, reason: "명시적 휴무", dutyCode: "O" },
        { id: "zero", from: "2026-05-17", to: "2026-05-17", scope: "site" as const, reason: "0분 유지", dutyCode: "D", timing: { startTime: "09:00", endTime: "10:00", breakMinutes: 60 } }
      ]
    } };
    const dates = new Set(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-16", "2026-05-17"]);
    for (const holidayDate of dates) saveStoredHolidayItem({ year: 2026, holidayDate, name: "검증 공휴일" });
    const items = buildMonthlyScheduleDraft({ pattern, employees: [{ ...employee, currentSiteId: site.id, currentShiftGroup: "A조" }], scheduleMonth: "2026-05", publicHolidayDates: dates });
    expect(items).toHaveLength(31);
    const template = listStoredDocumentTemplateVersions("schedule").find(item => item.id === `template-schedule-${variant}-2026-1`)!;
    const saved = saveStoredMonthlySchedule({ siteId: site.id, scheduleMonth: "2026-05", patternId: seed.id, generatedBy: "admin", templateVersionId: template.id, items });
    const exported = await exportMonthlySchedulePlan({ scheduleId: saved.id, userDataPath: process.cwd(), outputDir: testOutputDir });
    expect(exported).not.toBeNull();
    const parsed = await parseReturnedSchedulePerformanceFile({ filePath: exported!.outputPath, fileId: `weekend-${variant}` });
    const legal = parsed.entries.filter(item => item.section === "legal-holiday" && item.employeeCode === employee.employeeCode);
    for (const [date, startTime, endTime, totalWorkMinutes] of [["2026-05-01", "09:00", "18:00", 480], ["2026-05-02", "10:00", "16:00", 330], ["2026-05-03", "11:00", "15:00", 240]] as const) {
      expect(legal.filter(item => item.workDate === date)).toHaveLength(1);
      expect(legal.find(item => item.workDate === date)).toMatchObject({ startTime, endTime, totalWorkMinutes });
    }
    expect(legal.filter(item => ["2026-05-09", "2026-05-10"].includes(item.workDate))).toHaveLength(0);
    expect(legal.some(item => ["2026-05-16", "2026-05-17"].includes(item.workDate) && item.totalWorkMinutes > 0)).toBe(false);
    expect(items.find(item => item.workDate === "2026-05-16")).toMatchObject({ dutyCode: "O", breakMinutes: 0 });
    expect(items.find(item => item.workDate === "2026-05-17")).toMatchObject({ startTime: "09:00", endTime: "10:00", breakMinutes: 60 });
  });
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
    rmSync(testOutputDir, { recursive: true, force: true });
  });

  it("should export a template1 schedule workbook file from stored monthly data", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    expect(template).toBeDefined();

    if (template) {
      const inspection = await inspectDocumentTemplateImport({
        templateType: "schedule",
        sourcePath: template.sourcePath
      });

      if (inspection.profile.kind === "schedule") {
        saveStoredDocumentTemplateVersion({
          id: template.id,
          templateType: template.templateType,
          versionLabel: template.versionLabel,
          sourcePath: template.sourcePath,
          status: template.status,
          isDefault: template.isDefault,
          outputFileNamePattern: template.outputFileNamePattern,
          profileSchemaVersion: template.profileSchemaVersion,
          profile: {
            ...inspection.profile,
            styleSpec: {
              ...(inspection.profile.styleSpec ?? {}),
            fillColors: {
              siteNameCell: "#EAF2FF"
            },
            fontSizes: {
              siteNameCell: 15
            },
            mergedRanges: {
              siteNameCell: "C3:E3"
            }
          }
        },
          validation: inspection
        });
      }
    }
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-T1",
      name: "가람",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-03",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-02",
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);
    expect(exported?.templateVersionLabel).toBe("근무표 양식 1");
    expect(exported?.outputFileName).toBe("2026_3_보라매DC.xlsx");
    expect(path.dirname(exported!.outputPath)).toBe(
      path.resolve(testOutputDir, "2026년", "3월")
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    expect(worksheet.getCell("C3").value).toBe("보라매DC");
    expect(worksheet.getCell("C3").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFEAF2FF" })
      })
    );
    expect(worksheet.getCell("C3").font).toEqual(
      expect.objectContaining({
        size: 15
      })
    );
    expect(new Set(((worksheet.model.merges ?? []) as string[]).map(String)).has("C3:E3")).toBe(true);
    expectCellDate(worksheet.getCell("W6").value, 2026, 3, 1);
    expectCellDate(worksheet.getCell("C9").value, 2026, 3, 1);
    expectCellDate(worksheet.getCell("F9").value, 2026, 3, 2);
    expect(worksheet.getCell("D10").value).toBe("A");
    expect(worksheet.getCell("G12").value).toBe("A");
    expectCellDate(worksheet.getCell("Y12").value, 2026, 3, 1);
    expectCellDate(worksheet.getCell("Y13").value, 2026, 3, 2);
    expectCellDate(worksheet.getCell("Y14").value, 2026, 3, 3);
    expect(worksheet.getCell("Z12").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFD1D1" })
      })
    );
    expect(worksheet.getCell("AX12").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFD1D1" })
      })
    );
    expect(worksheet.getCell("C9").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFD1D1" })
      })
    );
    expect(worksheet.getCell("F9").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFFFFF" })
      })
    );
    expect(worksheet.getCell("Y13").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFFFFF" })
      })
    );
    expect(worksheet.getCell("Y14").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFF2F2F2" })
      })
    );
  });

  it("should export a template2 schedule workbook using the selected layout", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 2"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = saveStoredShiftPattern({
      siteId: site!.id,
      name: "보라매 6조 2교대 export 테스트",
      teamCount: 6,
      patternCode: "DNXXXX",
      startIndexRule: "team-sequence",
      patternStartDate: "2024-09-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: Array.from({ length: 6 }, (_, index) => ({
        teamLabel: `${String.fromCharCode(65 + index)}조`,
        index
      })),
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 2,
          patternCode: "DNXXXX",
          patternStartDate: "2024-09-01",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
            { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: Array.from({ length: 6 }, (_, index) => ({
            teamLabel: `${String.fromCharCode(65 + index)}조`,
            index
          }))
        }
      ],
      teamCycleAssignments: Array.from({ length: 6 }, (_, index) => ({
        teamLabel: `${String.fromCharCode(65 + index)}조`,
        cycleKey: "cycle-1"
      })),
      poolEnabled: false,
      poolBreakMinutes: 0
    });
    const employees = [
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-A",
        name: "가람",
        siteId: site!.id,
        shiftGroup: "A조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-B",
        name: "나래",
        siteId: site!.id,
        shiftGroup: "B조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-C",
        name: "다온",
        siteId: site!.id,
        shiftGroup: "C조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-D",
        name: "라온",
        siteId: site!.id,
        shiftGroup: "D조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-E",
        name: "마루",
        siteId: site!.id,
        shiftGroup: "E조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-F",
        name: "바다",
        siteId: site!.id,
        shiftGroup: "F조"
      })
    ];
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employees[0]!.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employees[1]!.employeeCode,
          teamLabel: "B조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employees[2]!.employeeCode,
          teamLabel: "C조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employees[3]!.employeeCode,
          teamLabel: "D조",
          workDate: "2024-10-01",
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);
    expect(exported?.templateVersionLabel).toBe("근무표 양식 2");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    expectCalendarDateCell(worksheet, "C9", 2024, 9, 29);
    expectCalendarDateCell(worksheet, "F9", 2024, 9, 30);
    expectCalendarDateCell(worksheet, "I9", 2024, 10, 1);
    expectCalendarDateCell(worksheet, "C59", 2024, 11, 3);
    expectCalendarDateCell(worksheet, "F59", 2024, 11, 4);
    expectCalendarDateCell(worksheet, "I59", 2024, 11, 5);
    expectCalendarDateCell(worksheet, "L59", 2024, 11, 6);
    expectCalendarDateCell(worksheet, "O59", 2024, 11, 7);
    expectCalendarDateCell(worksheet, "R59", 2024, 11, 8);
    expectCalendarDateCell(worksheet, "U59", 2024, 11, 9);
    expect(worksheet.getCell("I10").value).toBe("A");
    expect(worksheet.getCell("J10").value).toBe("B");
    expect(worksheet.getCell("K10").value).toBe("C");
    expect(worksheet.getCell("J13").value).toBe("D");
    expect(worksheet.getCell("J14").value).toBe("E");
    expect(worksheet.getCell("J15").value).toBe("F");
    expect(worksheet.getCell("Z12").value).toBe(employees[0]!.name);
    expect(worksheet.getCell("AA12").value).toBe(employees[1]!.name);
    expect(worksheet.getCell("AB12").value).toBe(employees[2]!.name);
    expect(worksheet.getCell("AL12").value).toBe(employees[3]!.name);
  });

  it("should apply the same DD일 format to previous-month dates in the left calendar", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-PREV-MONTH",
      name: "이전월",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    expectCalendarDateCell(worksheet, "C9", 2024, 9, 29);
    expectCalendarDateCell(worksheet, "F9", 2024, 9, 30);
    expectCalendarDateCell(worksheet, "I9", 2024, 10, 1);
    expectCalendarDateCell(worksheet, "C39", 2024, 11, 3);
    expectCalendarDateCell(worksheet, "F39", 2024, 11, 4);
    expectCalendarDateCell(worksheet, "I39", 2024, 11, 5);
    expectCalendarDateCell(worksheet, "L39", 2024, 11, 6);
    expectCalendarDateCell(worksheet, "O39", 2024, 11, 7);
    expectCalendarDateCell(worksheet, "R39", 2024, 11, 8);
    expectCalendarDateCell(worksheet, "U39", 2024, 11, 9);
  });

  it("should export template1 without sourcePath, apply modifications, and parse identically via return parser", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const seededTemplate = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.id === "template-schedule-sample1-2026-1"
    );
    expect(seededTemplate).toBeDefined();

    if (!seededTemplate) {
      return;
    }

    const staleTemplate = saveStoredDocumentTemplateVersion({
      id: seededTemplate.id,
      templateType: seededTemplate.templateType,
      versionLabel: seededTemplate.versionLabel,
      sourcePath: "C:/missing/templates/근무표_템플릿1.xlsx",
      status: seededTemplate.status,
      isDefault: seededTemplate.isDefault,
      outputFileNamePattern: seededTemplate.outputFileNamePattern,
      profileSchemaVersion: seededTemplate.profileSchemaVersion,
      profile: seededTemplate.profile,
      validation: seededTemplate.validation
    });
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-FALLBACK-1",
      name: "하랑",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-03",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: staleTemplate.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: exported!.outputPath,
      fileId: "test-return-t1"
    });

    expect(parsed.sheetName).toBe("교대 근무 계획표");
    expect(parsed.templateVariant).toBe("sample1");
    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe("보라매DC");
    expect(Array.isArray(parsed.entries)).toBe(true);

    const wbLoaded = new ExcelJS.Workbook();
    await wbLoaded.xlsx.readFile(exported!.outputPath);
    const meta = readScheduleLayoutRevisionMetadataFromWorkbook(wbLoaded);
    expect(meta).not.toBeNull();
    expect(meta?.layoutKey).toBe("schedule-xlsx/template1");
    expect(meta?.revisionKind).toBe("built-in");
    expect(meta?.definitionSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should export template2 without sourcePath, apply modifications, and parse identically via return parser", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const seededTemplate = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.id === "template-schedule-sample2-2026-1"
    );
    expect(seededTemplate).toBeDefined();

    if (!seededTemplate) {
      return;
    }

    const staleTemplate = saveStoredDocumentTemplateVersion({
      id: seededTemplate.id,
      templateType: seededTemplate.templateType,
      versionLabel: seededTemplate.versionLabel,
      sourcePath: "C:/missing/templates/근무표_템플릿2.xlsx",
      status: seededTemplate.status,
      isDefault: seededTemplate.isDefault,
      outputFileNamePattern: seededTemplate.outputFileNamePattern,
      profileSchemaVersion: seededTemplate.profileSchemaVersion,
      profile: seededTemplate.profile,
      validation: seededTemplate.validation
    });
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-FALLBACK-2",
      name: "다온",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-03",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: staleTemplate.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: exported!.outputPath,
      fileId: "test-return-t2"
    });

    expect(parsed.sheetName).toBe("교대 근무 계획표");
    expect(parsed.templateVariant).toBe("sample2");
    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe("보라매DC");
    expect(Array.isArray(parsed.entries)).toBe(true);

    const wbLoaded2 = new ExcelJS.Workbook();
    await wbLoaded2.xlsx.readFile(exported!.outputPath);
    const meta2 = readScheduleLayoutRevisionMetadataFromWorkbook(wbLoaded2);
    expect(meta2).not.toBeNull();
    expect(meta2?.layoutKey).toBe("schedule-xlsx/template2");
    expect(meta2?.revisionKind).toBe("built-in");
    expect(meta2?.definitionSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should throw an error and prevent file creation when duty code E is included in template2", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template2 = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.id === "template-schedule-sample2-2026-1"
    );
    expect(template2).toBeDefined();

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-E-FAIL",
      name: "가람",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-03",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template2!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-01",
          dutyCode: "E",
          startTime: "14:00",
          endTime: "22:00",
          breakMinutes: 60
        }
      ]
    });

    await expect(
      exportMonthlySchedulePlan({
        scheduleId: saved.id,
        userDataPath: process.cwd(),
        outputDir: testOutputDir
      })
    ).rejects.toThrow("선택한 배포 양식은 E 근무를 지원하지 않습니다.");

    expect(existsSync(path.resolve(testOutputDir, "2026년", "3월"))).toBe(false);
  });

  it("should use the stored schedule export directory when no output override is provided", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testOutputDir, "..", "pending"),
        approvedDir: path.resolve(testOutputDir, "..", "approved"),
        scheduleExportDir: testOutputDir,
        allowanceProposalExportDir: path.resolve(testOutputDir, "..", "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testOutputDir, "..", "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testOutputDir, "..", "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testOutputDir, "..", "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      {
        userDataPath: process.cwd()
      }
    );

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-DIR",
      name: "하늘",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-27",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd()
    });

    expect(exported).not.toBeNull();
    expect(path.dirname(exported!.outputPath)).toBe(
      path.resolve(testOutputDir, "2024년", "10월")
    );
    expect(existsSync(exported!.outputPath)).toBe(true);
  });

  it("should apply active saved layout modifications and handle duplicate output filenames with _dup01", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testOutputDir, "..", "pending"),
        approvedDir: path.resolve(testOutputDir, "..", "approved"),
        scheduleExportDir: testOutputDir,
        allowanceProposalExportDir: path.resolve(testOutputDir, "..", "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testOutputDir, "..", "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testOutputDir, "..", "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testOutputDir, "..", "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      {
        userDataPath: process.cwd()
      }
    );

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-LAYOUT-DUP",
      name: "테스트직원",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    // 1. 활성 저장본 레이아웃 등록 (커스텀 제목 문구 및 커스텀 파일명 패턴)
    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const customDef: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));
    customDef.outputs[0]!.outputFileNamePattern = "{year}년/{monthNumber}월/{siteName}_커스텀_{year}{month2}.xlsx";
    const titleBlock = customDef.outputs[0]!.blocks.find((b) => b.id === "schedule.title");
    expect(titleBlock).toBeDefined();
    titleBlock!.text = "보라매DC 전용 교대 근무 계획 관리";
    titleBlock!.font = {
      family: "맑은 고딕",
      sizePt: 22,
      bold: true,
      color: "#0000FF"
    };

    const savedLayout = saveDocumentLayout({
      definition: customDef,
      expectedRevisionId: null,
      versionLabel: "보라매 전용 레이아웃"
    });

    try {
      // 2. 1회차 내보내기 실행 -> 커스텀 파일명 및 제목 확인
      const export1 = await exportMonthlySchedulePlan({
        scheduleId: saved.id,
        userDataPath: process.cwd()
      });

      expect(export1).not.toBeNull();
      expect(export1!.outputFileName).toBe("보라매DC_커스텀_202410.xlsx");
      expect(existsSync(export1!.outputPath)).toBe(true);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(export1!.outputPath);
      const sheet = wb.getWorksheet("교대 근무 계획표") ?? wb.worksheets[0]!;
      expect(sheet.getCell("A1").value).toBe("보라매DC 전용 교대 근무 계획 관리");
      expect(sheet.getCell("A1").font?.bold).toBe(true);

      // 3. 2회차 내보내기 실행 -> 중복 회피로 _dup01.xlsx 생성 확인
      const export2 = await exportMonthlySchedulePlan({
        scheduleId: saved.id,
        userDataPath: process.cwd()
      });

      expect(export2).not.toBeNull();
      expect(export2!.outputFileName).toBe("보라매DC_커스텀_202410_dup01.xlsx");
      expect(existsSync(export2!.outputPath)).toBe(true);
    } finally {
      resetDocumentLayout({
        documentKind: "schedule-xlsx",
        variant: "template1",
        expectedRevisionId: savedLayout.activeRevisionId
      });
    }
  });

  // 9. 조정된 template1 및 template2 레이아웃 export 후 return parser 왕복 parity (Phase 2.5-4 R7/T4)
  it("조정된 template1 및 template2 레이아웃 export 후 return parser 왕복 parity (Phase 2.5-4 R7/T4)", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const variants: Array<"template1" | "template2"> = ["template1", "template2"];

    for (const v of variants) {
      const templateLabel = v === "template1" ? "근무표 양식 1" : "근무표 양식 2";
      const template = listStoredDocumentTemplateVersions("schedule").find(
        (item) => item.versionLabel === templateLabel
      );
      expect(template).toBeDefined();

      const site = listStoredSites().find((item) => item.name === "보라매DC")!;
      const pattern = listStoredShiftPatterns(site.id)[0]!;
      const emp1 = createAssignedEmployee({
        employeeCode: `EMP-ADJ-${v}-1`,
        name: `조정자_${v}_1`,
        siteId: site.id,
        shiftGroup: "A조"
      });
      const emp2 = createAssignedEmployee({
        employeeCode: `EMP-ADJ-${v}-2`,
        name: `조정자_${v}_2`,
        siteId: site.id,
        shiftGroup: "A조"
      });

      const savedSchedule = saveStoredMonthlySchedule({
        siteId: site.id,
        scheduleMonth: "2026-04",
        patternId: pattern.id,
        generatedBy: "admin",
        templateVersionId: template!.id,
        items: [
          {
            employeeCode: emp1.employeeCode,
            teamLabel: "A조",
            workDate: "2026-04-01",
            dutyCode: "D",
            startTime: "06:00",
            endTime: "18:00",
            breakMinutes: 60
          },
          {
            employeeCode: emp2.employeeCode,
            teamLabel: "A조",
            workDate: "2026-04-01",
            dutyCode: "D",
            startTime: "06:00",
            endTime: "18:00",
            breakMinutes: 60
          }
        ]
      });

      // 판독 블록 이동 레이아웃 저장 (substitute & overtime 위치 이동)
      const baseDef = getDefaultDocumentLayoutDefinition({
        documentKind: "schedule-xlsx",
        variant: v
      });
      const adjustedDef: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));
      const subBlock = adjustedDef.outputs[0]!.blocks.find((b) => b.id === "schedule.substitute")!;
      const otBlock = adjustedDef.outputs[0]!.blocks.find((b) => b.id === "schedule.overtime")!;
      if (v === "template1") {
        subBlock.x += 1;
        subBlock.y += 1;
        otBlock.x += 1;
        otBlock.y += 1;
      } else {
        subBlock.x -= 1;
        subBlock.y += 1;
        otBlock.x -= 1;
        otBlock.y += 1;
      }

      const savedLayout = saveDocumentLayout({
        definition: adjustedDef,
        expectedRevisionId: null,
        changeReason: `${v} 위치 조정 판`
      });

      try {
        const exported = await exportMonthlySchedulePlan({
          scheduleId: savedSchedule.id,
          userDataPath: process.cwd(),
          outputDir: testOutputDir
        });
        expect(exported).not.toBeNull();

        // 회수 파일 조작: 이동된 substitute 및 overtime에 실적 입력
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(exported!.outputPath);
        const ws = wb.getWorksheet("교대 근무 계획표")!;

        const sections = resolveScheduleSectionLayoutsFromDefinition(adjustedDef);

        // substitute 첫 행에 대체 실적 입력
        const subRow = sections.substitute.startRow;
        ws.getCell(`${sections.substitute.dateColumns[0]}${subRow}`).value = "2026-04-01";
        ws.getCell(`${sections.substitute.originalWorkerColumns![0]}${subRow}`).value = emp1.name;
        ws.getCell(`${sections.substitute.substituteWorkerColumns![0]}${subRow}`).value = emp2.name;

        // overtime 마지막 행(67행 스캔 윈도우 끝)에 연장 실적 입력
        const otRow = sections.overtime.endRow;
        ws.getCell(`${sections.overtime.dateColumns[0]}${otRow}`).value = "2026-04-01";
        ws.getCell(`${sections.overtime.startHourColumn}${otRow}`).value = "18";
        ws.getCell(`${sections.overtime.startMinuteColumn}${otRow}`).value = "00";
        ws.getCell(`${sections.overtime.endHourColumn}${otRow}`).value = "20";
        ws.getCell(`${sections.overtime.endMinuteColumn}${otRow}`).value = "00";
        ws.getCell(`${sections.overtime.workerColumns![0]}${otRow}`).value = emp1.name;

        await wb.xlsx.writeFile(exported!.outputPath);

        // 파서 실행
        const parsed = await parseReturnedSchedulePerformanceFile({
          filePath: exported!.outputPath,
          fileId: `return-adj-${v}`
        });

        // 결과 확인: substitute 및 마지막 67행 overtime 항목이 모두 파싱됨
        expect(parsed.entries.some((e) => e.section === "substitute" && e.employeeName === emp2.name)).toBe(true);
        expect(parsed.entries.some((e) => e.section === "overtime" && e.employeeName === emp1.name)).toBe(true);
      } finally {
        resetDocumentLayout({
          documentKind: "schedule-xlsx",
          variant: v,
          expectedRevisionId: savedLayout.activeRevisionId
        });
      }
    }
  });

  // 10. export 후 더 새 레이아웃 revision 활성화 시에도 과거 배포 파일은 당시 판으로 파싱 불변 (Phase 2.5-4 R2/T4)
  it("export 후 더 새 레이아웃 revision 활성화 시에도 과거 배포 파일은 당시 판으로 파싱 불변 (Phase 2.5-4 R2/T4)", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    )!;
    const site = listStoredSites().find((item) => item.name === "보라매DC")!;
    const pattern = listStoredShiftPatterns(site.id)[0]!;
    const emp = createAssignedEmployee({
      employeeCode: "EMP-EXP-HIST-1",
      name: "역사판직원",
      siteId: site.id,
      shiftGroup: "A조"
    });

    const savedSchedule = saveStoredMonthlySchedule({
      siteId: site.id,
      scheduleMonth: "2026-05",
      patternId: pattern.id,
      generatedBy: "admin",
      templateVersionId: template.id,
      items: [
        {
          employeeCode: emp.employeeCode,
          teamLabel: "A조",
          workDate: "2026-05-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    // 1) 판 v1 저장 및 활성화
    const baseDef = getDefaultDocumentLayoutDefinition({
      documentKind: "schedule-xlsx",
      variant: "template1"
    });
    const def1: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));
    const titleBlock1 = def1.outputs[0]!.blocks.find((b) => b.id === "schedule.title")!;
    titleBlock1.text = "버전 1 판 타이틀";
    const snap1 = saveDocumentLayout({
      definition: def1,
      expectedRevisionId: null,
      changeReason: "v1 저장"
    });
    const rev1 = snap1.activeRevisionId!;

    // 2) v1 활성 상태에서 export
    const exported1 = await exportMonthlySchedulePlan({
      scheduleId: savedSchedule.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });
    expect(exported1).not.toBeNull();

    // 3) 더 새 판 v2 저장 및 활성화 (rev1은 이제 비활성)
    const def2: DocumentLayoutDefinition = JSON.parse(JSON.stringify(baseDef));
    const titleBlock2 = def2.outputs[0]!.blocks.find((b) => b.id === "schedule.title")!;
    titleBlock2.text = "버전 2 판 타이틀";
    const snap2 = saveDocumentLayout({
      definition: def2,
      expectedRevisionId: rev1,
      changeReason: "v2 저장"
    });
    const rev2 = snap2.activeRevisionId!;
    expect(rev2).not.toBe(rev1);

    // 4) 앞서 export된 v1 파일 파싱 -> v2가 아닌 v1으로 해석되어야 함
    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: exported1!.outputPath,
      fileId: "return-hist-v1"
    });

    expect(parsed.sheetName).toBe("교대 근무 계획표");
    expect(parsed.scheduleMonth).toBe("2026-05");
    expect(parsed.siteName).toBe("보라매DC");

    // 파일 내 메타데이터가 rev1을 가리키는지 확인
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(exported1!.outputPath);
    const meta = readScheduleLayoutRevisionMetadataFromWorkbook(wb);
    expect(meta?.revisionId).toBe(rev1);
    expect(meta?.revisionKind).toBe("stored");

    // 정리
    resetDocumentLayout({
      documentKind: "schedule-xlsx",
      variant: "template1",
      expectedRevisionId: rev2
    });
  });
});
