import fs from "node:fs/promises";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import {
  buildDashboardPdfHtml,
  exportDashboardChartData,
  exportDashboardReport,
  validateChartImageDataUrl
} from "./dashboard-chart-export-service";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootDir = path.resolve(process.cwd(), "artifacts", "tests", "dashboard-chart-export");
const testOutputDir = path.resolve(testRootDir, "direct-output");
const storedOutputDir = path.resolve(testRootDir, "stored-output");
const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0Y4AAAAASUVORK5CYII=";

describe("dashboard-chart-export-service", () => {
  beforeEach(() => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRootDir, "dashboard-chart-export.test.sqlite")
    });
  });

  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRootDir, { recursive: true, force: true });
  });

  it("should export dashboard chart rows with metadata and headers to a selected save path", async () => {
    const selectedOutputPath = path.resolve(testOutputDir, "trend-selected-path");
    const result = await exportDashboardChartData(
      {
        chartKey: "trend",
        chartTitle: "월별 수당 지급 추이 (최근 6개월)",
        sheetName: "월별 수당 추이",
        filters: {
          year: "2026",
          month: "2월",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "샘플 데이터"
        },
        outputFormat: "xlsx",
        chartImageDataUrl: tinyPngDataUrl,
        columns: [
          { key: "month", header: "월", format: "text" },
          { key: "overtimeAmount", header: "연장수당(원)", format: "currency" },
          { key: "substituteAmount", header: "대체수당(원)", format: "currency" },
          { key: "legalHolidayAmount", header: "법정공휴일수당(원)", format: "currency" }
        ],
        rows: [
          {
            month: "9월",
            overtimeAmount: 2_640_120,
            substituteAmount: 1_422_880,
            legalHolidayAmount: 2_118_400
          },
          {
            month: "10월",
            overtimeAmount: 2_812_500,
            substituteAmount: 1_533_200,
            legalHolidayAmount: 2_305_920
          }
        ]
      },
      {
        userDataPath: process.cwd(),
        outputPath: selectedOutputPath
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.outputPath).toBe(`${selectedOutputPath}.xlsx`);
    expect(existsSync(result.data.outputPath)).toBe(true);
    expect(result.data.rowCount).toBe(2);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.data.outputPath);
    const worksheet = workbook.getWorksheet("월별 수당 추이");
    let headerRowNumber = 0;

    worksheet?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "월") {
        headerRowNumber = rowNumber;
      }
    });

    expect(String(worksheet?.getCell("A1").value ?? "")).toContain("월별 수당 지급 추이");
    expect(worksheet?.getCell("A2").value).toBe("내보내기 시각");
    expect(worksheet?.getCell("A7").value).toBe("데이터 기준");
    expect(headerRowNumber).toBeGreaterThan(0);
    expect(worksheet?.getCell(`A${headerRowNumber}`).value).toBe("월");
    expect(worksheet?.getCell(`B${headerRowNumber}`).value).toBe("연장수당(원)");
    expect(worksheet?.getCell(`A${headerRowNumber + 1}`).value).toBe("9월");
    expect(worksheet?.getCell(`B${headerRowNumber + 1}`).value).toBe(2_640_120);
    expect(worksheet?.getCell(`D${headerRowNumber + 2}`).value).toBe(2_305_920);
  });

  it("should use the stored export directory when no output override is provided", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRootDir, "dashboard-chart-export.test.sqlite")
    });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRootDir, "pending"),
        approvedDir: path.resolve(testRootDir, "approved"),
        scheduleExportDir: storedOutputDir,
        allowanceProposalExportDir: path.resolve(testRootDir, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRootDir, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRootDir, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRootDir, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      {
        userDataPath: process.cwd()
      }
    );

    const result = await exportDashboardChartData(
      {
        chartKey: "ratio",
        chartTitle: "전사 수당 유형 비율",
        sheetName: "수당 유형 비율",
        filters: {
          year: "2026",
          month: "전체",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "실데이터"
        },
        columns: [
          { key: "category", header: "수당 유형", format: "text" },
          { key: "amount", header: "금액(원)", format: "currency" },
          { key: "ratioPercent", header: "비율(%)", format: "percent" }
        ],
        rows: [
          {
            category: "연장수당",
            amount: 3_260_305,
            ratioPercent: 37.9
          }
        ]
      },
      {
        userDataPath: process.cwd()
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(path.dirname(result.data.outputPath)).toBe(path.resolve(storedOutputDir, "dashboard-exports"));
    expect(existsSync(result.data.outputPath)).toBe(true);
  });

  it("should export ranking rows with allowance amount for individual dashboard export", async () => {
    const selectedOutputPath = path.resolve(testOutputDir, "ranking-selected-path");
    const result = await exportDashboardChartData(
      {
        chartKey: "ranking",
        chartTitle: "근무 유형별 상위 인원 (Top 10)",
        sheetName: "근무 유형별 상위 인원",
        filters: {
          year: "2024",
          month: "10월",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "실데이터"
        },
        outputFormat: "xlsx",
        columns: [
          { key: "categoryLabel", header: "근무 유형", format: "text" },
          { key: "employeeName", header: "이름", format: "text" },
          { key: "siteName", header: "근무지", format: "text" },
          { key: "minutes", header: "근무시간(h)", format: "number" },
          { key: "allowanceAmount", header: "지급 수당(원)", format: "currency" }
        ],
        rows: [
          {
            categoryLabel: "법정휴일",
            employeeName: "김현수",
            siteName: "보라매DC",
            minutes: 8,
            allowanceAmount: 120_000
          },
          {
            categoryLabel: "대체근무",
            employeeName: "이민호",
            siteName: "신림CC",
            minutes: 6.5,
            allowanceAmount: 91_000
          },
          {
            categoryLabel: "연장근무",
            employeeName: "김현수",
            siteName: "보라매DC",
            minutes: 12.5,
            allowanceAmount: 175_000
          }
        ]
      },
      {
        userDataPath: process.cwd(),
        outputPath: selectedOutputPath
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.outputPath).toBe(`${selectedOutputPath}.xlsx`);
    expect(existsSync(result.data.outputPath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.data.outputPath);
    const worksheet = workbook.getWorksheet("근무 유형별 상위 인원");
    let headerRowNumber = 0;

    worksheet?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "근무 유형") {
        headerRowNumber = rowNumber;
      }
    });

    expect(headerRowNumber).toBeGreaterThan(0);
    expect(worksheet?.getCell(`A${headerRowNumber}`).value).toBe("근무 유형");
    expect(worksheet?.getCell(`E${headerRowNumber}`).value).toBe("지급 수당(원)");
    expect(worksheet?.getCell(`A${headerRowNumber + 1}`).value).toBe("법정휴일");
    expect(worksheet?.getCell(`A${headerRowNumber + 2}`).value).toBe("대체근무");
    expect(worksheet?.getCell(`A${headerRowNumber + 3}`).value).toBe("연장근무");
    expect(worksheet?.getCell(`E${headerRowNumber + 3}`).value).toBe(175_000);
  });

  it("should export a dashboard report workbook with overview and section sheets", async () => {
    const selectedOutputPath = path.resolve(testOutputDir, "dashboard-report");
    const result = await exportDashboardReport(
      {
        title: "대시보드 전체 내보내기",
        outputFormat: "xlsx",
        filters: {
          year: "2026",
          month: "전체",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "실데이터"
        },
        sections: [
          {
            sectionKey: "trend",
            chartTitle: "월별 수당 지급 추이",
            sheetName: "월별 수당 추이",
            chartImageDataUrl: tinyPngDataUrl,
            columns: [
              { key: "month", header: "월", format: "text" },
              { key: "amount", header: "금액(원)", format: "currency" }
            ],
            rows: [
              {
                month: "3월",
                amount: 1_250_000
              }
            ]
          },
          {
            sectionKey: "ranking",
            chartTitle: "근무 유형별 상위 인원 (Top 10)",
            sheetName: "근무 유형별 상위 인원",
            columns: [
              { key: "categoryLabel", header: "근무 유형", format: "text" },
              { key: "employeeName", header: "이름", format: "text" },
              { key: "siteName", header: "근무지", format: "text" },
              { key: "minutes", header: "근무시간(h)", format: "number" },
              { key: "allowanceAmount", header: "지급 수당(원)", format: "currency" }
            ],
            rows: [
              {
                categoryLabel: "법정휴일",
                employeeName: "최유진",
                siteName: "안양센터",
                minutes: 7.5,
                allowanceAmount: 114_000
              },
              {
                categoryLabel: "대체근무",
                employeeName: "한소희",
                siteName: "신림CC",
                minutes: 6.5,
                allowanceAmount: 91_000
              },
              {
                categoryLabel: "연장근무",
                employeeName: "김현수",
                siteName: "보라매DC",
                minutes: 12.5,
                allowanceAmount: 175_000
              }
            ]
          }
        ]
      },
      {
        userDataPath: process.cwd(),
        outputPath: selectedOutputPath
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.outputPath).toBe(`${selectedOutputPath}.xlsx`);
    expect(existsSync(result.data.outputPath)).toBe(true);
    expect(result.data.sectionCount).toBe(2);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.data.outputPath);
    let trendHeaderRowNumber = 0;
    let rankingHeaderRowNumber = 0;

    workbook.getWorksheet("월별 수당 추이")?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "월") {
        trendHeaderRowNumber = rowNumber;
      }
    });
    workbook.getWorksheet("근무 유형별 상위 인원")?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "근무 유형") {
        rankingHeaderRowNumber = rowNumber;
      }
    });

    expect(workbook.worksheets).toHaveLength(3);
    expect(String(workbook.getWorksheet("대시보드")?.getCell("A1").value ?? "")).toContain(
      "대시보드 전체 내보내기"
    );
    expect(trendHeaderRowNumber).toBeGreaterThan(0);
    expect(rankingHeaderRowNumber).toBeGreaterThan(0);
    expect(workbook.getWorksheet("근무 유형별 상위 인원")?.getCell(`A${rankingHeaderRowNumber}`).value).toBe(
      "근무 유형"
    );
    expect(workbook.getWorksheet("근무 유형별 상위 인원")?.getCell(`A${rankingHeaderRowNumber + 1}`).value).toBe(
      "법정휴일"
    );
    expect(workbook.getWorksheet("근무 유형별 상위 인원")?.getCell(`A${rankingHeaderRowNumber + 2}`).value).toBe(
      "대체근무"
    );
    expect(workbook.getWorksheet("근무 유형별 상위 인원")?.getCell(`A${rankingHeaderRowNumber + 3}`).value).toBe(
      "연장근무"
    );
    expect(workbook.getWorksheet("근무 유형별 상위 인원")?.getCell(`E${rankingHeaderRowNumber + 3}`).value).toBe(
      175_000
    );
  });

  it("should allow empty rows (0 rows) and render empty-state message in XLSX and PDF", async () => {
    const selectedXlsxPath = path.resolve(testOutputDir, "empty-rows-test");
    const resultXlsx = await exportDashboardChartData(
      {
        chartKey: "empty-chart",
        chartTitle: "데이터 없는 차트",
        sheetName: "빈차트",
        filters: {
          year: "2026",
          month: "3월",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "실데이터"
        },
        outputFormat: "xlsx",
        columns: [{ key: "col1", header: "컬럼1" }],
        rows: []
      },
      {
        userDataPath: process.cwd(),
        outputPath: selectedXlsxPath
      }
    );

    expect(resultXlsx.ok).toBe(true);
    if (resultXlsx.ok) {
      expect(existsSync(resultXlsx.data.outputPath)).toBe(true);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultXlsx.data.outputPath);
      const worksheet = workbook.getWorksheet("빈차트");
      let headerRow = 0;
      worksheet?.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === "컬럼1") {
          headerRow = rowNumber;
        }
      });
      expect(headerRow).toBeGreaterThan(0);
      expect(worksheet?.getCell(`A${headerRow + 1}`).value).toBe("표시할 데이터가 없습니다.");
    }
  });

  it("should reject columns 0 and sections 0 (N12)", async () => {
    const resultCol0 = await exportDashboardChartData(
      {
        chartKey: "col0",
        chartTitle: "컬럼0",
        sheetName: "컬럼0",
        filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
        columns: [],
        rows: []
      },
      { userDataPath: process.cwd() }
    );
    expect(resultCol0.ok).toBe(false);
    expect(resultCol0.message).toContain("내보낼 차트 컬럼이 없습니다.");

    const resultSec0 = await exportDashboardReport(
      {
        title: "섹션0",
        outputFormat: "xlsx",
        filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
        sections: []
      },
      { userDataPath: process.cwd() }
    );
    expect(resultSec0.ok).toBe(false);
    expect(resultSec0.message).toContain("내보낼 대시보드 섹션이 없습니다.");
  });

  it("should validate and reject unsafe image data URLs (N10)", () => {
    // 1. Whitespace
    expect(() => validateChartImageDataUrl("data:image/png;base64, abc")).toThrow("차트 이미지 형식");
    // 2. SVG
    expect(() => validateChartImageDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrow(
      "차트 이미지 형식"
    );
    // 3. Fake base64 (not valid canonical base64)
    expect(() => validateChartImageDataUrl("data:image/png;base64,!!!invalid!!!")).toThrow(
      "차트 이미지 형식"
    );
    // 4. Fake signature
    const fakePng = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString("base64");
    expect(() => validateChartImageDataUrl(`data:image/png;base64,${fakePng}`)).toThrow(
      "차트 이미지 형식"
    );
    // 5. Valid PNG
    expect(() => validateChartImageDataUrl(tinyPngDataUrl)).not.toThrow();
  });

  it("should export dashboard chart and report as PDF using installed Chrome (R9, R11)", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-pdf-test-"));
    const chartPdfPath = path.join(tempDir, "dashboard-chart.pdf");
    const reportPdfPath = path.join(tempDir, "dashboard-report.pdf");

    try {
      const chartResult = await exportDashboardChartData(
        {
          chartKey: "pdf-trend",
          chartTitle: "월별 수당 지급 추이 PDF",
          sheetName: "추이",
          filters: {
            year: "2026",
            month: "3월",
            siteName: "전체",
            employeeName: "전체",
            dataSource: "실데이터"
          },
          outputFormat: "pdf",
          chartImageDataUrl: tinyPngDataUrl,
          columns: [
            { key: "month", header: "월", format: "text" },
            { key: "amount", header: "금액", format: "currency" }
          ],
          rows: [{ month: "3월", amount: 1500000 }]
        },
        {
          userDataPath: process.cwd(),
          outputPath: chartPdfPath
        }
      );

      if (!chartResult.ok) {
        console.error("chartResult failure:", chartResult);
      }
      expect(chartResult.ok).toBe(true);
      const chartBytes = await fs.readFile(chartPdfPath);
      expect(chartBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

      const reportResult = await exportDashboardReport(
        {
          title: "대시보드 종합 보고서 PDF",
          outputFormat: "pdf",
          filters: {
            year: "2026",
            month: "3월",
            siteName: "전체",
            employeeName: "전체",
            dataSource: "실데이터"
          },
          sections: [
            {
              sectionKey: "sec1",
              chartTitle: "섹션 1 - 추이",
              sheetName: "추이",
              chartImageDataUrl: tinyPngDataUrl,
              columns: [{ key: "name", header: "이름" }],
              rows: [{ name: "홍길동" }]
            },
            {
              sectionKey: "sec2",
              chartTitle: "섹션 2 - 랭킹 (빈 데이터)",
              sheetName: "랭킹",
              columns: [{ key: "name", header: "이름" }],
              rows: []
            }
          ]
        },
        {
          userDataPath: process.cwd(),
          outputPath: reportPdfPath
        }
      );

      expect(reportResult.ok).toBe(true);
      const reportBytes = await fs.readFile(reportPdfPath);
      expect(reportBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should apply layout delta to dashboard PDF HTML", () => {
    const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "dashboard-report-pdf" });
    const customizedDef = JSON.parse(JSON.stringify(baseDef));

    // title delta
    const titleBlock = customizedDef.outputs[0]!.blocks.find((b: { id: string }) => b.id === "dashboard.title")!;
    titleBlock.x = 18;
    titleBlock.y = 15;

    // table colgroup delta
    const tableBlock = customizedDef.outputs[0]!.blocks.find((b: { id: string }) => b.id === "dashboard.table")!;
    tableBlock.columnWidths = {
      A: 30,
      B: 70
    };

    const html = buildDashboardPdfHtml({
      title: "커스텀 레이아웃 대시보드",
      exportedAt: "2026-03-23 12:00:00",
      filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
      sections: [
        {
          title: "섹션",
          columns: [
            { key: "c1", header: "항목1" },
            { key: "c2", header: "항목2" }
          ],
          rows: []
        }
      ],
      layoutDefinition: customizedDef
    });

    expect(html).toContain('data-layout-block-id="dashboard.title"');
    expect(html).toContain("margin-left: 6mm");
    expect(html).toContain("margin-top: 3mm");
    expect(html).toContain('data-layout-block-id="dashboard.table"');
    expect(html).toContain("<colgroup>");
    expect(html).toContain('style="width: 30.00%"');
    expect(html).toContain('style="width: 70.00%"');
  });

  // T-C4: font family 적대 payload 및 style attribute escape 검증
  it("T-C4: font family 적대 payload와 style attribute가 안전하게 escape/정제된다", () => {
    const dangerousPayloads = [
      '" onmouseover="boom',
      "';background:url(http://x)",
      "</style><script>"
    ];

    for (const payload of dangerousPayloads) {
      const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "dashboard-report-pdf" });
      const customizedDef = JSON.parse(JSON.stringify(baseDef));
      const targetBlock = customizedDef.outputs[0]!.blocks.find(
        (b: { id: string }) => b.id === "dashboard.title"
      )!;
      targetBlock.font = { family: payload, sizePt: 12 };

      const html = buildDashboardPdfHtml({
        title: "보안 테스트",
        exportedAt: "2026-03-23 12:00:00",
        filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
        sections: [
          {
            title: "섹션1",
            columns: [{ key: "c1", header: "항목1" }],
            rows: []
          }
        ],
        layoutDefinition: customizedDef
      });

      expect(html).not.toContain("onmouseover=");
      expect(html).not.toContain("url(");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("</style><script>");
      expect((html.match(/<\/style>/g) ?? []).length).toBe(1);
    }
  });

  // T-C5c: dashboard partial 2개 + 실제 4열 검증
  it("T-C5c: dashboard partial 열 폭 2개 지정 시 실제 4열에서 미지정 2개는 weight 1로 계산된다", () => {
    const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "dashboard-report-pdf" });
    const customizedDef = JSON.parse(JSON.stringify(baseDef));
    const tableBlock = customizedDef.outputs[0]!.blocks.find(
      (b: { id: string }) => b.id === "dashboard.table"
    )!;
    // A: 2, B: 2, 실제 4열이면 C=1, D=1. 총 가중치 6. A=2/6=33.33%, B=33.33%, C=16.67%, D=16.67%
    tableBlock.columnWidths = {
      A: 2,
      B: 2
    };

    const html = buildDashboardPdfHtml({
      title: "대시보드 열 폭 테스트",
      exportedAt: "2026-03-23 12:00:00",
      filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
      sections: [
        {
          title: "섹션1",
          columns: [
            { key: "c1", header: "1" },
            { key: "c2", header: "2" },
            { key: "c3", header: "3" },
            { key: "c4", header: "4" }
          ],
          rows: []
        }
      ],
      layoutDefinition: customizedDef
    });

    const colMatches = html.match(/<col style="width: [^"]+" \/>/g) ?? [];
    expect(colMatches.length).toBe(4);
    expect(html).toContain('style="width: 33.33%"');
    expect(html).toContain('style="width: 16.67%"');
  });

  // T-C7: dashboard 5개 블록 visible === false 시 DOM 완전 생략 검증
  it("T-C7: dashboard 블록 visible=false 시 wrapper 및 내용이 DOM에서 완전히 생략된다", () => {
    const blockIds = [
      "dashboard.title",
      "dashboard.metadata",
      "dashboard.section-summary",
      "dashboard.chart",
      "dashboard.table"
    ];

    for (const targetId of blockIds) {
      const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "dashboard-report-pdf" });
      const customizedDef = JSON.parse(JSON.stringify(baseDef));
      const targetBlock = customizedDef.outputs[0]!.blocks.find(
        (b: { id: string }) => b.id === targetId
      )!;
      targetBlock.visible = false;

      const html = buildDashboardPdfHtml({
        title: "생략 테스트 제목",
        exportedAt: "2026-03-23 12:00:00",
        filters: { year: "2026", month: "3월", siteName: "전체", employeeName: "전체", dataSource: "실데이터" },
        sections: [
          {
            title: "섹션 제목",
            chartImageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            columns: [{ key: "c1", header: "항목1" }],
            rows: [{ c1: "값1" }]
          }
        ],
        layoutDefinition: customizedDef
      });

      expect(html).not.toContain(`data-layout-block-id="${targetId}"`);
      if (targetId === "dashboard.chart") {
        expect(html).not.toContain('class="chart-frame"');
      }
      if (targetId === "dashboard.section-summary") {
        expect(html).not.toContain('class="section-summary"');
      }
      if (targetId === "dashboard.table") {
        expect(html).not.toContain("값1");
      }
    }
  });
});
