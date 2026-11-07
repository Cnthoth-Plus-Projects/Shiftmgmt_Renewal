import path from "node:path";

import type {
  DocumentLayoutDefinition,
  DocumentLayoutMemberId
} from "../../shared/domain/document-layout";
import type { DocumentLayoutValidationIssue } from "../../shared/domain/document-layout";
import type {
  AllowanceRateCategoryCode,
  AllowanceSummaryCategory
} from "../../shared/domain/allowance-rate-matrix";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import {
  assertValidDocumentLayoutDefinition,
  validateDocumentLayoutDefinition
} from "./document-layout-definition-service";
import { resolveDocumentLayoutOutputFilePath } from "./document-layout-excel-render-service";
import { writeSchedulePlanWorkbook } from "./schedule-plan-adapter";
import {
  type AllowanceRateGuideEntry,
  writeAttachmentOneWorkbook,
  writeAttachmentTwoWorkbook,
  writeUpdatedProposalWorkbook
} from "./allowance-document-export-service";
import { writeAllowancePdfDocuments } from "./allowance-document-pdf-service";
import { buildDashboardPdfHtml } from "./dashboard-chart-export-service";
import {
  commitPdfBytesAtomically,
  renderHtmlToPdfBytes
} from "./installed-chrome-pdf-service";

export interface DocumentLayoutPreviewArtifact {
  memberId: DocumentLayoutMemberId;
  mediaType:
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/pdf";
  filePath: string;
  fileName: string;
}

export interface GenerateDocumentLayoutPreviewInput {
  definition: DocumentLayoutDefinition;
  outputDir: string;
}

export interface GenerateDocumentLayoutPreviewResult {
  artifacts: [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]];
  validationIssues: DocumentLayoutValidationIssue[];
}

const PREVIEW_WORK_MONTH = "2026-05";
const PREVIEW_SITE_NAME = "미리보기근무지";

const buildPreviewScheduleUpdates = (variant: "sample1" | "sample2") => {
  const commonUpdates = [
    { address: "C3", value: PREVIEW_SITE_NAME },
    { address: "W6", value: "2026년 05월" },
    {
      address: "B7",
      value: variant === "sample1" ? "D: 4명, E: 4명, N: 4명" : "D: 12명, N: 4명"
    },
    // 달력 날짜
    { address: "C9", value: 1 },
    { address: "F9", value: 2 },
    { address: "I9", value: 3 },
    { address: "L9", value: 4 },
    { address: "O9", value: 5 }
  ];

  if (variant === "sample1") {
    return [
      ...commonUpdates,
      { address: "D10", value: "홍길동" }, // 5/1 D
      { address: "D11", value: "김철수" }, // 5/1 E
      { address: "D12", value: "이영희" }, // 5/1 N
      { address: "D13", value: "박지성" }, // 5/1 O
      // 변경 및 사유
      { address: "Z11", value: "홍길동" },
      { address: "AD11", value: "김철수" },
      { address: "AH11", value: "이영희" },
      { address: "AX11", value: "연장근무 수행" },
      { address: "AY11", value: "대체근무" }
    ];
  }

  return [
    ...commonUpdates,
    { address: "C10", value: "홍길동" }, // 5/1 D
    { address: "D13", value: "김철수" }, // 5/1 N
    { address: "D14", value: "이영희" }, // 5/1 O
    // 변경 및 사유
    { address: "Z11", value: "홍길동" },
    { address: "AL11", value: "김철수" },
    { address: "BF11", value: "연장근무 수행" },
    { address: "BG11", value: "대체근무" }
  ];
};

const buildPreviewScheduleCellFills = () => [
  { address: "O9", colorArgb: "FFFFD1D1" }, // 5/5 어린이날 공휴일
  { address: "C11", colorArgb: "FFF2F2F2" },
  { address: "C12", colorArgb: "FFFFFFFF" }
];

interface ResolvedAllowanceRowForPreview {
  calculation: AllowanceCalculationResultRecord;
  businessCategoryCode: AllowanceRateCategoryCode;
  businessCategoryLabel: string;
  summaryCategory: AllowanceSummaryCategory;
  earlyPayoutDate?: string;
  customerName?: string;
  employeeCode: string;
  employeeName: string;
  employeeRank?: string;
  department: string;
  workDate: string;
  hourlyRate: number;
  primaryMinutes: number;
  primaryMultiplier: number;
  primaryAmount: number;
  overtimeMinutes: number;
  overtimeMultiplier: number;
  overtimeAmount: number;
  nightMinutes: number;
  nightMultiplier: number;
  nightAmount: number;
  substituteAmount: number;
  summaryOvertimeAmount: number;
  holidayAmount: number;
  totalAllowanceAmount: number;
}

const buildPreviewAllowanceRows = (): ResolvedAllowanceRowForPreview[] => {
  const baseCalc = (id: string, empCode: string, name: string): AllowanceCalculationResultRecord =>
    ({
      id,
      workMonth: PREVIEW_WORK_MONTH,
      workDate: "2026-05-01",
      employeeCode: empCode,
      employeeName: name,
      siteId: "preview-site",
      siteName: "강남센터",
      patternCode: "4조2교대",
      workType: "shift",
      assignedDuty: "D",
      actualDuty: "D",
      status: "approved",
      regularTime: 480,
      overtime: 0,
      nightTime: 0,
      holidayWorkTime: 0,
      holidayOvertime: 0,
      baseHourlyWage: 10000,
      appliedMultiplier: 1.5,
      calculatedAmount: 120000,
      calculatedAt: "2026-05-01T00:00:00.000Z",
      snapshot: {
        workType: "shift",
        breakdown: {
          totalWorkMinutes: 480
        }
      }
    }) as unknown as AllowanceCalculationResultRecord;

  return [
    // 1. 홍길동 - 강남센터 (정규, 대체 + 연장)
    {
      calculation: baseCalc("calc-prev-001", "EMP001", "홍길동"),
      businessCategoryCode: "weekday-substitute",
      businessCategoryLabel: "대체근무",
      summaryCategory: "substitute",
      customerName: "고객사A",
      employeeCode: "EMP001",
      employeeName: "홍길동",
      employeeRank: "사원",
      department: "강남센터",
      workDate: "2026-05-01",
      hourlyRate: 10000,
      primaryMinutes: 480,
      primaryMultiplier: 1.5,
      primaryAmount: 120000,
      overtimeMinutes: 120,
      overtimeMultiplier: 1.5,
      overtimeAmount: 30000,
      nightMinutes: 0,
      nightMultiplier: 0.5,
      nightAmount: 0,
      substituteAmount: 120000,
      summaryOvertimeAmount: 30000,
      holidayAmount: 0,
      totalAllowanceAmount: 150000
    },
    // 2. 김철수 - 판교센터 (정규, 공휴일)
    {
      calculation: baseCalc("calc-prev-002", "EMP002", "김철수"),
      businessCategoryCode: "legal-holiday",
      businessCategoryLabel: "공휴일근무",
      summaryCategory: "legalHoliday",
      customerName: "고객사B",
      employeeCode: "EMP002",
      employeeName: "김철수",
      employeeRank: "대리",
      department: "판교센터",
      workDate: "2026-05-05",
      hourlyRate: 10000,
      primaryMinutes: 480,
      primaryMultiplier: 2.0,
      primaryAmount: 160000,
      overtimeMinutes: 0,
      overtimeMultiplier: 1.5,
      overtimeAmount: 0,
      nightMinutes: 0,
      nightMultiplier: 0.5,
      nightAmount: 0,
      substituteAmount: 0,
      summaryOvertimeAmount: 0,
      holidayAmount: 160000,
      totalAllowanceAmount: 160000
    },
    // 3. 이영희 - 강남센터 (퇴사자 조기 지급)
    {
      calculation: baseCalc("calc-prev-003", "EMP003", "이영희"),
      businessCategoryCode: "weekday-overtime",
      businessCategoryLabel: "연장근무",
      summaryCategory: "overtime",
      earlyPayoutDate: "2026-05-31",
      customerName: "고객사A",
      employeeCode: "EMP003",
      employeeName: "이영희",
      employeeRank: "과장",
      department: "강남센터",
      workDate: "2026-05-10",
      hourlyRate: 10000,
      primaryMinutes: 0,
      primaryMultiplier: 1.5,
      primaryAmount: 0,
      overtimeMinutes: 180,
      overtimeMultiplier: 1.5,
      overtimeAmount: 45000,
      nightMinutes: 0,
      nightMultiplier: 0.5,
      nightAmount: 0,
      substituteAmount: 0,
      summaryOvertimeAmount: 45000,
      holidayAmount: 0,
      totalAllowanceAmount: 45000
    }
  ];
};

const buildPreviewRateGuideEntries = (): AllowanceRateGuideEntry[] => [
  {
    categoryCode: "legal-holiday",
    label: "법정공휴일",
    sequence: 1,
    lines: [{ kind: "detail", text: "법정공휴일근로 x1.5 기준" }]
  },
  {
    categoryCode: "weekday-substitute",
    label: "평_대체근로수당",
    sequence: 2,
    lines: [{ kind: "detail", text: "평일 대체근로 x1.5 기준" }]
  },
  {
    categoryCode: "holiday-substitute",
    label: "휴_대체근로수당",
    sequence: 3,
    lines: [{ kind: "detail", text: "휴일 대체근로 x1.5 기준" }]
  },
  {
    categoryCode: "weekday-overtime",
    label: "평_연장근로수당",
    sequence: 4,
    lines: [{ kind: "detail", text: "평일 연장근로 x1.5 기준" }]
  },
  {
    categoryCode: "holiday-overtime",
    label: "휴_연장근로수당",
    sequence: 5,
    lines: [{ kind: "detail", text: "휴일 연장근로 x0 기준" }]
  }
];

export const generateDocumentLayoutPreview = async (
  input: GenerateDocumentLayoutPreviewInput
): Promise<GenerateDocumentLayoutPreviewResult> => {
  // 1. preview 모드 검증 수행 - 유효하지 않으면 즉시 오류 throw (파일/폴더 미생성 보장)
  assertValidDocumentLayoutDefinition(input.definition, "preview");
  const validationIssues = validateDocumentLayoutDefinition(input.definition, "preview");

  const definition = input.definition;
  const member = definition.outputs[0]!;
  const pattern = member.outputFileNamePattern;
  const kind = definition.documentKind;

  let targetPath = "";

  if (kind === "schedule-xlsx") {
    targetPath = resolveDocumentLayoutOutputFilePath(input.outputDir, pattern, {
      year: 2026,
      monthNumber: 5,
      month2: "05",
      siteName: PREVIEW_SITE_NAME
    });

    const variant = definition.variant === "template2" ? "sample2" : "sample1";
    const layoutKey =
      definition.variant === "template2"
        ? "schedule-xlsx/template2"
        : "schedule-xlsx/template1";

    const updates = buildPreviewScheduleUpdates(variant);
    const cellFillUpdates = buildPreviewScheduleCellFills();

    await writeSchedulePlanWorkbook({
      variant,
      layoutKey,
      outputPath: targetPath,
      updates,
      cellFillUpdates,
      definition
    });
  } else if (kind === "proposal-xlsx") {
    targetPath = resolveDocumentLayoutOutputFilePath(input.outputDir, pattern, {
      year: 2026,
      month2: "05"
    });

    const rows = buildPreviewAllowanceRows();
    const regularTotal = rows
      .filter((r) => !r.earlyPayoutDate)
      .reduce((sum, r) => sum + r.totalAllowanceAmount, 0);
    const earlyTotal = rows
      .filter((r) => Boolean(r.earlyPayoutDate))
      .reduce((sum, r) => sum + r.totalAllowanceAmount, 0);

    await writeUpdatedProposalWorkbook({
      outputPath: targetPath,
      workMonth: PREVIEW_WORK_MONTH,
      rows: rows as unknown as Parameters<typeof writeUpdatedProposalWorkbook>[0]["rows"],
      regularTotalAllowanceAmount: regularTotal,
      earlyPayoutTotalAllowanceAmount: earlyTotal,
      definition
    });
  } else if (kind === "attachment1-xlsx") {
    targetPath = resolveDocumentLayoutOutputFilePath(input.outputDir, pattern, {
      year: 2026,
      month2: "05"
    });

    const rows = buildPreviewAllowanceRows();
    const rateGuideEntries = buildPreviewRateGuideEntries();

    await writeAttachmentOneWorkbook({
      outputPath: targetPath,
      workMonth: PREVIEW_WORK_MONTH,
      rateGuideEntries,
      rows: rows as unknown as Parameters<typeof writeAttachmentOneWorkbook>[0]["rows"],
      definition
    });
  } else if (kind === "attachment2-xlsx") {
    targetPath = resolveDocumentLayoutOutputFilePath(input.outputDir, pattern, {
      year: 2026,
      month2: "05"
    });

    const rows = buildPreviewAllowanceRows();
    const totalAmount = rows.reduce((sum, r) => sum + r.totalAllowanceAmount, 0);

    await writeAttachmentTwoWorkbook({
      outputPath: targetPath,
      workMonth: PREVIEW_WORK_MONTH,
      rows: rows as unknown as Parameters<typeof writeAttachmentTwoWorkbook>[0]["rows"],
      totalAllowanceAmount: totalAmount,
      definition
    });
  } else if (kind === "proposal-pdf") {
    const outputs = definition.outputs;
    if (
      outputs.length !== 3 ||
      outputs[0]?.memberId !== "proposal" ||
      outputs[1]?.memberId !== "attachment1" ||
      outputs[2]?.memberId !== "attachment2"
    ) {
      throw new Error("수당 PDF 레이아웃 정의의 출력 멤버 구성이 올바르지 않습니다.");
    }

    const reservedOutputPaths = new Set<string>();
    const proposalPath = resolveDocumentLayoutOutputFilePath(
      input.outputDir,
      outputs[0].outputFileNamePattern,
      { year: 2026, month2: "05" },
      reservedOutputPaths
    );
    const attachment1Path = resolveDocumentLayoutOutputFilePath(
      input.outputDir,
      outputs[1].outputFileNamePattern,
      { year: 2026, month2: "05" },
      reservedOutputPaths
    );
    const attachment2Path = resolveDocumentLayoutOutputFilePath(
      input.outputDir,
      outputs[2].outputFileNamePattern,
      { year: 2026, month2: "05" },
      reservedOutputPaths
    );

    const rows = buildPreviewAllowanceRows();
    const rateGuideEntries = buildPreviewRateGuideEntries();
    const regularTotal = rows
      .filter((r) => !r.earlyPayoutDate)
      .reduce((sum, r) => sum + r.totalAllowanceAmount, 0);
    const earlyTotal = rows
      .filter((r) => Boolean(r.earlyPayoutDate))
      .reduce((sum, r) => sum + r.totalAllowanceAmount, 0);
    const totalAmount = rows.reduce((sum, r) => sum + r.totalAllowanceAmount, 0);

    await writeAllowancePdfDocuments({
      proposalPath,
      attachment1Path,
      attachment2Path,
      workMonth: PREVIEW_WORK_MONTH,
      rows: rows as unknown as Parameters<typeof writeAllowancePdfDocuments>[0]["rows"],
      totalAllowanceAmount: totalAmount,
      regularTotalAllowanceAmount: regularTotal,
      earlyPayoutTotalAllowanceAmount: earlyTotal,
      formatDate: (v) => v.replaceAll("-", "."),
      formatMonthLabel: (m) => `${Number(m.slice(5))}월`,
      formatProposalDateRange: () => "2026.05.01 ~ 2026.05.31",
      formatCurrencyLabel: (a) => `₩${a.toLocaleString("ko-KR")}`,
      formatHoursLabel: (m) => `${m / 60}h`,
      formatNextPayrollMonthLabel: () => "2026년 6월",
      summaryCategoryOrder: { substitute: 0, overtime: 1, legalHoliday: 2 },
      rateGuideEntries,
      holidayNamesByDate: new Map([["2026-05-05", "어린이날"]]),
      allowanceAxisLabels: { base: "기본", overtime: "연장", night: "야간" },
      layoutDefinition: definition
    });

    const relPath = (target: string) =>
      path.relative(path.resolve(input.outputDir), target).replace(/\\/g, "/");

    const artifacts: [DocumentLayoutPreviewArtifact, ...DocumentLayoutPreviewArtifact[]] = [
      {
        memberId: "proposal",
        mediaType: "application/pdf",
        filePath: proposalPath,
        fileName: relPath(proposalPath)
      },
      {
        memberId: "attachment1",
        mediaType: "application/pdf",
        filePath: attachment1Path,
        fileName: relPath(attachment1Path)
      },
      {
        memberId: "attachment2",
        mediaType: "application/pdf",
        filePath: attachment2Path,
        fileName: relPath(attachment2Path)
      }
    ];

    return {
      artifacts,
      validationIssues
    };
  } else if (kind === "dashboard-report-pdf") {
    const output = definition.outputs[0];
    const targetPath = resolveDocumentLayoutOutputFilePath(
      input.outputDir,
      output.outputFileNamePattern,
      { name: "미리보기_대시보드", timestamp: "2026-05-01-12-00-00" }
    );

    const tinyPngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0Y4AAAAASUVORK5CYII=";

    const html = buildDashboardPdfHtml({
      title: "대시보드 미리보기",
      exportedAt: "2026-05-01 12:00:00",
      filters: {
        year: "2026",
        month: "5월",
        siteName: PREVIEW_SITE_NAME,
        employeeName: "전체",
        dataSource: "미리보기"
      },
      sections: [
        {
          title: "섹션 1 - 수당 추이",
          chartImageDataUrl: tinyPngDataUrl,
          columns: [
            { key: "month", header: "월", format: "text" },
            { key: "amount", header: "금액(원)", format: "currency" }
          ],
          rows: [
            { month: "5월", amount: 1500000 },
            { month: "6월", amount: 1800000 }
          ]
        },
        {
          title: "섹션 2 - 상위 인원 (빈 데이터)",
          columns: [{ key: "name", header: "이름", format: "text" }],
          rows: []
        }
      ],
      layoutDefinition: definition
    });

    const pdfBytes = await renderHtmlToPdfBytes(html);
    await commitPdfBytesAtomically(targetPath, pdfBytes);

    const relativeFileName = path
      .relative(path.resolve(input.outputDir), targetPath)
      .replace(/\\/g, "/");

    const artifact: DocumentLayoutPreviewArtifact = {
      memberId: output.memberId,
      mediaType: "application/pdf",
      filePath: targetPath,
      fileName: relativeFileName
    };

    return {
      artifacts: [artifact],
      validationIssues
    };
  } else {
    throw new Error(`[미리보기 지원 불가] 지원하지 않는 문서 종류입니다: ${kind}`);
  }

  const relativeFileName = path.relative(path.resolve(input.outputDir), targetPath).replace(/\\/g, "/");

  const artifact: DocumentLayoutPreviewArtifact = {
    memberId: member.memberId,
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filePath: targetPath,
    fileName: relativeFileName
  };

  return {
    artifacts: [artifact],
    validationIssues
  };
};
