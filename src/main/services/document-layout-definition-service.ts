import {
  type DocumentKind,
  type DocumentLayoutBlock,
  type DocumentLayoutBlockCapability,
  type DocumentLayoutCapabilities,
  type DocumentLayoutDefinition,
  type DocumentLayoutKey,
  type DocumentLayoutOutputMember,
  type DocumentLayoutValidationIssue,
  type ScheduleVariant,
  DOCUMENT_LAYOUT_EDITABLE_PROPERTIES,
  DOCUMENT_LAYOUT_PROTECTED_PROPERTIES,
  DOCUMENT_LAYOUT_SCHEMA_VERSION,
  EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
  PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
  SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS,
  SUPPORTED_EXCEL_LAYOUT_STORAGE_KEYS
} from "../../shared/domain/document-layout";
import {
  type BuiltInExcelLayoutKey,
  getBuiltInExcelLayoutDefinition as getLowLevelBuiltInExcelLayoutDefinition
} from "./built-in-excel-layout-service";

const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  Boolean(val) && typeof val === "object" && !Array.isArray(val);

export const parseRelativeColumnKey = (key: string): number => {
  if (!/^[A-Z]+$/.test(key)) {
    return -1;
  }
  let result = 0;
  for (let i = 0; i < key.length; i++) {
    result = result * 26 + (key.charCodeAt(i) - 64);
  }
  return result;
};

const MIN_RENDERABLE_BLOCK_SIZES: Record<string, { minWidth: number; minHeight: number }> = {
  "schedule.calendar-heading": { minWidth: 22, minHeight: 1 },
  "schedule.calendar-grid": { minWidth: 22, minHeight: 37 },
  "schedule.reschedule": { minWidth: 20, minHeight: 34 },
  "schedule.substitute": { minWidth: 10, minHeight: 18 },
  "schedule.overtime": { minWidth: 10, minHeight: 11 },
  "proposal.decision": { minWidth: 3, minHeight: 1 },
  "proposal.meta": { minWidth: 9, minHeight: 5 },
  "proposal.title": { minWidth: 5, minHeight: 1 },
  "proposal.scope": { minWidth: 8, minHeight: 3 },
  "proposal.regular-summary": { minWidth: 7, minHeight: 5 },
  "proposal.early-summary": { minWidth: 7, minHeight: 5 },
  "proposal.grand-total": { minWidth: 7, minHeight: 1 },
  "proposal.footer": { minWidth: 8, minHeight: 2 },
  "attachment1.regular-table": { minWidth: 19, minHeight: 15 },
  "attachment1.early-table": { minWidth: 19, minHeight: 4 },
  "attachment1.rate-guide": { minWidth: 19, minHeight: 22 },
  "attachment2.table": { minWidth: 7, minHeight: 84 }
};

const FIXED_TABLE_COLUMN_SETS: Record<string, string[]> = {
  "allowance-pdf.proposal.regular-table": ["A", "B", "C", "D", "E", "F", "G"],
  "allowance-pdf.proposal.early-table": ["A", "B", "C", "D", "E", "F", "G"],
  "proposal.regular-summary": ["A", "B", "C", "D", "E", "F", "G"],
  "proposal.early-summary": ["A", "B", "C", "D", "E", "F", "G"],
  "allowance-pdf.attachment1.table": [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"
  ],
  "attachment1.table": [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"
  ],
  "allowance-pdf.attachment2.table": ["A", "B", "C", "D", "E", "F", "G", "H"],
  "attachment2.table": ["A", "B", "C", "D", "E", "F", "G", "H"]
};

export const formatDocumentLayoutStorageKey = (key: DocumentLayoutKey): string => {
  if (key.documentKind === "schedule-xlsx") {
    if (key.variant !== "template1" && key.variant !== "template2") {
      throw new Error("근무표 레이아웃에는 유효한 변형('template1' 또는 'template2')이 필수입니다.");
    }
    return `schedule-xlsx/${key.variant}`;
  }

  if ("variant" in key && key.variant !== undefined) {
    throw new Error("근무표 외 문서 종류에는 변형을 지정할 수 없습니다.");
  }

  const validKinds: DocumentKind[] = [
    "proposal-xlsx",
    "attachment1-xlsx",
    "attachment2-xlsx",
    "proposal-pdf",
    "dashboard-report-pdf"
  ];

  if (!validKinds.includes(key.documentKind)) {
    throw new Error(`지원하지 않는 문서 종류입니다: ${String(key.documentKind)}`);
  }

  return key.documentKind;
};

export const parseDocumentLayoutStorageKey = (storageKey: string): DocumentLayoutKey => {
  if (storageKey === "schedule-xlsx/template1") {
    return { documentKind: "schedule-xlsx", variant: "template1" };
  }
  if (storageKey === "schedule-xlsx/template2") {
    return { documentKind: "schedule-xlsx", variant: "template2" };
  }
  if (storageKey.startsWith("schedule-xlsx/")) {
    throw new Error(`지원하지 않는 근무표 레이아웃 변형입니다: ${storageKey}`);
  }
  if (storageKey === "schedule-xlsx") {
    throw new Error("근무표 레이아웃에는 변형('template1' 또는 'template2')이 필수입니다.");
  }

  const singleKinds: Array<Exclude<DocumentKind, "schedule-xlsx">> = [
    "proposal-xlsx",
    "attachment1-xlsx",
    "attachment2-xlsx",
    "proposal-pdf",
    "dashboard-report-pdf"
  ];

  if (singleKinds.includes(storageKey as Exclude<DocumentKind, "schedule-xlsx">)) {
    return { documentKind: storageKey as Exclude<DocumentKind, "schedule-xlsx"> };
  }

  throw new Error(`지원하지 않는 문서 레이아웃 키입니다: ${storageKey}`);
};

export const isSupportedExcelLayoutKey = (key: DocumentLayoutKey | string): boolean => {
  try {
    const storageKey = typeof key === "string" ? key : formatDocumentLayoutStorageKey(key);
    return SUPPORTED_EXCEL_LAYOUT_STORAGE_KEYS.includes(storageKey);
  } catch {
    return false;
  }
};

export const isSupportedDocumentLayoutKey = (key: DocumentLayoutKey | string): boolean => {
  try {
    const storageKey = typeof key === "string" ? key : formatDocumentLayoutStorageKey(key);
    return SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS.includes(storageKey);
  } catch {
    return false;
  }
};

const SCHEDULE_PARSER_TABLE_BLOCK_IDS = new Set([
  "schedule.calendar-grid",
  "schedule.reschedule",
  "schedule.substitute",
  "schedule.overtime"
]);

const PROTECTED_METADATA_BLOCK_IDS = new Set([
  "schedule.month-anchors"
]);

const EXPECTED_CANVAS_RANGES: Record<string, string> = {
  "schedule-xlsx/template1": "A1:BS80",
  "schedule-xlsx/template2": "A1:BS80",
  "proposal-xlsx": "A1:I44",
  "attachment1-xlsx": "A1:S92",
  "attachment2-xlsx": "A1:G86"
};

const verifiedLowLevelKeys = new Set<string>();

const verifyLowLevelAssetCompatibility = (storageKey: string) => {
  if (verifiedLowLevelKeys.has(storageKey)) {
    return;
  }
  const expectedRange = EXPECTED_CANVAS_RANGES[storageKey];
  if (!expectedRange) {
    return;
  }
  const lowLevel = getLowLevelBuiltInExcelLayoutDefinition(storageKey as BuiltInExcelLayoutKey);
  if (lowLevel.layoutKey !== storageKey) {
    throw new Error(`저수준 내장 레이아웃 키 불일치: 기대 '${storageKey}', 실제 '${lowLevel.layoutKey}'`);
  }
  if (lowLevel.canvasRange !== expectedRange) {
    throw new Error(`저수준 내장 캔버스 범위 불일치: 기대 '${expectedRange}', 실제 '${lowLevel.canvasRange}'`);
  }
  verifiedLowLevelKeys.add(storageKey);
};

const buildTemplate1Blocks = (): DocumentLayoutBlock[] => [
  { id: "schedule.title", kind: "title", x: 0, y: 0, width: 23, height: 1, visible: true, text: "C&ThothPlus SM사업팀 교대근무 정규 근무 계획 관리", font: { family: "맑은 고딕", sizePt: 24, bold: true } },
  { id: "schedule.description", kind: "note", x: 1, y: 1, width: 22, height: 1, visible: true, text: "※ 본 근무 계획표는 실제 운영 상황에 따라 변경될 수 있습니다.", font: { family: "맑은 고딕", sizePt: 9 } },
  { id: "schedule.site", kind: "field", x: 1, y: 2, width: 5, height: 2, visible: true, bindingKey: "siteName", font: { family: "맑은 고딕", sizePt: 9, bold: true } },
  { id: "schedule.calendar-heading", kind: "header", x: 1, y: 5, width: 22, height: 1, visible: true, bindingKey: "monthHeading", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.roster", kind: "summary", x: 1, y: 6, width: 22, height: 1, visible: true, bindingKey: "rosterSummary", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.calendar-grid", kind: "table", x: 1, y: 7, width: 22, height: 37, visible: true, bindingKey: "calendarGrid", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.reschedule-note", kind: "note", x: 24, y: 5, width: 27, height: 2, visible: true, text: "정규 및 변경 투입표", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.reschedule", kind: "table", x: 24, y: 8, width: 27, height: 34, visible: true, bindingKey: "rescheduleTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.substitute-note", kind: "note", x: 52, y: 5, width: 11, height: 2, visible: true, text: "대체근무 투입 현황", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.substitute", kind: "table", x: 52, y: 8, width: 11, height: 18, visible: true, bindingKey: "substituteTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.overtime-note", kind: "note", x: 52, y: 27, width: 11, height: 2, visible: true, text: "연장근무 투입 현황", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.overtime", kind: "table", x: 52, y: 30, width: 11, height: 11, visible: true, bindingKey: "overtimeTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.month-anchors", kind: "table", x: 50, y: 7, width: 13, height: 23, visible: true, bindingKey: "monthAnchors" }
];

const buildTemplate2Blocks = (): DocumentLayoutBlock[] => [
  { id: "schedule.title", kind: "title", x: 0, y: 0, width: 23, height: 1, visible: true, text: "C&ThothPlus SM사업팀 교대근무 정규 근무 계획 관리", font: { family: "맑은 고딕", sizePt: 24, bold: true } },
  { id: "schedule.description", kind: "note", x: 1, y: 1, width: 22, height: 1, visible: true, text: "※ 본 근무 계획표는 실제 운영 상황에 따라 변경될 수 있습니다.", font: { family: "맑은 고딕", sizePt: 9 } },
  { id: "schedule.site", kind: "field", x: 1, y: 2, width: 5, height: 2, visible: true, bindingKey: "siteName", font: { family: "맑은 고딕", sizePt: 9, bold: true } },
  { id: "schedule.calendar-heading", kind: "header", x: 1, y: 5, width: 22, height: 1, visible: true, bindingKey: "monthHeading", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.roster", kind: "summary", x: 1, y: 6, width: 22, height: 1, visible: true, bindingKey: "rosterSummary", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.calendar-grid", kind: "table", x: 1, y: 7, width: 22, height: 61, visible: true, bindingKey: "calendarGrid", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.reschedule-note", kind: "note", x: 24, y: 5, width: 35, height: 2, visible: true, text: "정규 및 변경 투입표", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.reschedule", kind: "table", x: 24, y: 8, width: 35, height: 34, visible: true, bindingKey: "rescheduleTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.substitute-note", kind: "note", x: 60, y: 5, width: 11, height: 2, visible: true, text: "대체근무 투입 현황", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.substitute", kind: "table", x: 60, y: 8, width: 11, height: 18, visible: true, bindingKey: "substituteTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.overtime-note", kind: "note", x: 60, y: 27, width: 11, height: 2, visible: true, text: "연장근무 투입 현황", font: { family: "맑은 고딕", sizePt: 16, bold: true } },
  { id: "schedule.overtime", kind: "table", x: 60, y: 30, width: 11, height: 11, visible: true, bindingKey: "overtimeTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "schedule.month-anchors", kind: "table", x: 58, y: 7, width: 13, height: 23, visible: true, bindingKey: "monthAnchors" }
];

const buildProposalBlocks = (): DocumentLayoutBlock[] => [
  { id: "proposal.logo", kind: "logo", x: 0, y: 0, width: 3, height: 1, visible: true, logoAssetId: "brand-logo" },
  { id: "proposal.decision", kind: "field", x: 0, y: 2, width: 3, height: 1, visible: true, bindingKey: "decisionType", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "proposal.meta", kind: "field", x: 0, y: 4, width: 9, height: 5, visible: true, bindingKey: "documentMetadata", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "proposal.title", kind: "title", x: 0, y: 10, width: 9, height: 2, visible: true, text: "교대근무 연장근로 수당 지급 품의서", font: { family: "맑은 고딕", sizePt: 14, bold: true } },
  { id: "proposal.scope", kind: "field", x: 1, y: 13, width: 8, height: 3, visible: true, bindingKey: "targetScope", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "proposal.regular-summary", kind: "summary", x: 1, y: 17, width: 7, height: 5, visible: true, bindingKey: "regularSummary", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "proposal.early-summary", kind: "summary", x: 1, y: 23, width: 7, height: 5, visible: true, bindingKey: "earlySummary", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "proposal.grand-total", kind: "summary", x: 1, y: 29, width: 7, height: 1, visible: true, bindingKey: "grandTotal", font: { family: "맑은 고딕", sizePt: 11, bold: true } },
  { id: "proposal.footer", kind: "footer", x: 1, y: 31, width: 8, height: 2, visible: true, text: "붙임: 교대근무자 근무시간 명세표 1부. 끝.", font: { family: "맑은 고딕", sizePt: 11 } }
];

const buildAttachment1Blocks = (): DocumentLayoutBlock[] => [
  { id: "attachment1.logo", kind: "logo", x: 16, y: 0, width: 3, height: 1, visible: true, logoAssetId: "brand-logo" },
  { id: "attachment1.title", kind: "title", x: 0, y: 0, width: 16, height: 1, visible: true, bindingKey: "attachmentOneTitle", font: { family: "맑은 고딕", sizePt: 11, bold: true } },
  { id: "attachment1.regular-table", kind: "table", x: 0, y: 1, width: 19, height: 15, visible: true, bindingKey: "regularDetailTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "attachment1.early-title", kind: "title", x: 0, y: 17, width: 19, height: 1, visible: true, text: "다음 급여월 퇴사자 조기 지급 명세", font: { family: "맑은 고딕", sizePt: 11, bold: true } },
  { id: "attachment1.early-table", kind: "table", x: 0, y: 18, width: 19, height: 4, visible: true, bindingKey: "earlyDetailTable", font: { family: "맑은 고딕", sizePt: 11 } },
  { id: "attachment1.rate-guide", kind: "table", x: 0, y: 23, width: 19, height: 22, visible: true, bindingKey: "rateGuide", font: { family: "맑은 고딕", sizePt: 10 } }
];

const buildAttachment2Blocks = (): DocumentLayoutBlock[] => [
  { id: "attachment2.logo", kind: "logo", x: 5, y: 0, width: 2, height: 1, visible: true, logoAssetId: "brand-logo" },
  { id: "attachment2.title", kind: "title", x: 0, y: 0, width: 5, height: 1, visible: true, bindingKey: "attachmentTwoTitle", font: { family: "맑은 고딕", sizePt: 11, bold: true } },
  { id: "attachment2.period", kind: "field", x: 5, y: 1, width: 2, height: 1, visible: true, bindingKey: "workPeriod", font: { family: "맑은 고딕", sizePt: 10 } },
  { id: "attachment2.table", kind: "table", x: 0, y: 2, width: 7, height: 84, visible: true, bindingKey: "summaryTable", font: { family: "맑은 고딕", sizePt: 11 } }
];

const buildProposalPdfOutputs = (): [DocumentLayoutOutputMember, ...DocumentLayoutOutputMember[]] => [
  {
    memberId: "proposal",
    canvas: {
      unit: "mm",
      width: 210,
      height: 297,
      paperSize: "A4",
      orientation: "portrait",
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 }
    },
    outputFileNamePattern: "{year}년/{month2}월/{year}_{month2}_품의서.pdf",
    blocks: [
      {
        id: "allowance-pdf.proposal.title",
        kind: "title",
        page: 1,
        layoutMode: "flow",
        flowOrder: 1,
        autoHeight: true,
        x: 10,
        y: 10,
        width: 190,
        height: 30,
        visible: true,
        bindingKey: "proposalHeader",
        logoAssetId: "brand-logo"
      },
      {
        id: "allowance-pdf.proposal.meta",
        kind: "table",
        page: 1,
        layoutMode: "flow",
        flowOrder: 2,
        autoHeight: true,
        x: 10,
        y: 44,
        width: 190,
        height: 36,
        visible: true,
        bindingKey: "proposalMeta"
      },
      {
        id: "allowance-pdf.proposal.criteria",
        kind: "summary",
        page: 1,
        layoutMode: "flow",
        flowOrder: 3,
        autoHeight: true,
        x: 10,
        y: 84,
        width: 190,
        height: 40,
        visible: true,
        bindingKey: "proposalCriteria"
      },
      {
        id: "allowance-pdf.proposal.regular-table",
        kind: "table",
        page: 1,
        layoutMode: "flow",
        flowOrder: 4,
        autoHeight: true,
        repeatHeaderOnPageBreak: true,
        x: 10,
        y: 128,
        width: 190,
        height: 48,
        visible: true,
        bindingKey: "regularSiteSummary",
        columnWidths: { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1 }
      },
      {
        id: "allowance-pdf.proposal.early-table",
        kind: "table",
        page: 1,
        layoutMode: "flow",
        flowOrder: 5,
        autoHeight: true,
        repeatHeaderOnPageBreak: true,
        x: 10,
        y: 180,
        width: 190,
        height: 40,
        visible: true,
        bindingKey: "earlySiteSummary",
        columnWidths: { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1 }
      },
      {
        id: "allowance-pdf.proposal.footer",
        kind: "footer",
        page: 1,
        layoutMode: "flow",
        flowOrder: 6,
        autoHeight: true,
        x: 10,
        y: 224,
        width: 190,
        height: 18,
        visible: true,
        bindingKey: "proposalFooter"
      },
      {
        id: "allowance-pdf.proposal.chart-title",
        kind: "title",
        page: 2,
        layoutMode: "flow",
        flowOrder: 7,
        autoHeight: true,
        pageBreakBefore: true,
        x: 10,
        y: 10,
        width: 190,
        height: 14,
        visible: true,
        text: "수당 지급 분석"
      },
      {
        id: "allowance-pdf.proposal.chart-note",
        kind: "note",
        page: 2,
        layoutMode: "flow",
        flowOrder: 8,
        autoHeight: true,
        x: 10,
        y: 28,
        width: 190,
        height: 12,
        visible: true,
        text: "품의 제출용으로는 근무지별 지급액 순위를 가로 막대로, 근로유형별 구성 비중을 도넛으로 함께 제시하는 방식이 가장 빠르게 읽힙니다."
      },
      {
        id: "allowance-pdf.proposal.chart-summary",
        kind: "summary",
        page: 2,
        layoutMode: "flow",
        flowOrder: 9,
        autoHeight: true,
        x: 10,
        y: 44,
        width: 190,
        height: 28,
        visible: true,
        bindingKey: "chartSummary"
      },
      {
        id: "allowance-pdf.proposal.chart-grid",
        kind: "summary",
        page: 2,
        layoutMode: "flow",
        flowOrder: 10,
        autoHeight: true,
        x: 10,
        y: 76,
        width: 190,
        height: 120,
        visible: true,
        bindingKey: "chartGrid"
      }
    ]
  },
  {
    memberId: "attachment1",
    canvas: {
      unit: "mm",
      width: 297,
      height: 210,
      paperSize: "A4",
      orientation: "landscape",
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 }
    },
    outputFileNamePattern: "{year}년/{month2}월/{year}_{month2}_별첨1.pdf",
    blocks: [
      {
        id: "allowance-pdf.attachment1.title",
        kind: "title",
        page: 1,
        layoutMode: "flow",
        flowOrder: 1,
        autoHeight: true,
        x: 10,
        y: 10,
        width: 277,
        height: 22,
        visible: true,
        bindingKey: "attachment1Header",
        logoAssetId: "brand-logo"
      },
      {
        id: "allowance-pdf.attachment1.table",
        kind: "table",
        page: 1,
        layoutMode: "flow",
        flowOrder: 2,
        autoHeight: true,
        repeatHeaderOnPageBreak: true,
        x: 10,
        y: 36,
        width: 277,
        height: 80,
        visible: true,
        bindingKey: "attachment1Detail",
        columnWidths: {
          A: 3,
          B: 5.5,
          C: 5.5,
          D: 3.5,
          E: 7,
          F: 5,
          G: 6.5,
          H: 8,
          I: 5,
          J: 4,
          K: 3.5,
          L: 5,
          M: 4,
          N: 3.5,
          O: 5,
          P: 4,
          Q: 3.5,
          R: 5,
          S: 6,
          T: 7
        }
      },
      {
        id: "allowance-pdf.attachment1.rate-guide",
        kind: "note",
        page: 1,
        layoutMode: "flow",
        flowOrder: 3,
        autoHeight: true,
        x: 10,
        y: 120,
        width: 277,
        height: 40,
        visible: true,
        bindingKey: "rateGuide"
      }
    ]
  },
  {
    memberId: "attachment2",
    canvas: {
      unit: "mm",
      width: 210,
      height: 297,
      paperSize: "A4",
      orientation: "portrait",
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 }
    },
    outputFileNamePattern: "{year}년/{month2}월/{year}_{month2}_별첨2.pdf",
    blocks: [
      {
        id: "allowance-pdf.attachment2.title",
        kind: "title",
        page: 1,
        layoutMode: "flow",
        flowOrder: 1,
        autoHeight: true,
        x: 10,
        y: 10,
        width: 190,
        height: 22,
        visible: true,
        bindingKey: "attachment2Header",
        logoAssetId: "brand-logo"
      },
      {
        id: "allowance-pdf.attachment2.table",
        kind: "table",
        page: 1,
        layoutMode: "flow",
        flowOrder: 2,
        autoHeight: true,
        repeatHeaderOnPageBreak: true,
        x: 10,
        y: 36,
        width: 190,
        height: 120,
        visible: true,
        bindingKey: "attachment2Detail",
        columnWidths: {
          A: 6,
          B: 20,
          C: 13,
          D: 13,
          E: 12,
          F: 12,
          G: 12,
          H: 12
        }
      }
    ]
  }
];

const buildDashboardReportPdfOutputs = (): [DocumentLayoutOutputMember, ...DocumentLayoutOutputMember[]] => [
  {
    memberId: "main",
    canvas: {
      unit: "mm",
      width: 297,
      height: 210,
      paperSize: "A4",
      orientation: "landscape",
      marginsMm: { top: 12, right: 12, bottom: 12, left: 12 }
    },
    outputFileNamePattern: "{name}_{timestamp}.pdf",
    blocks: [
      {
        id: "dashboard.title",
        kind: "title",
        page: 1,
        layoutMode: "flow",
        flowOrder: 1,
        autoHeight: true,
        x: 12,
        y: 12,
        width: 273,
        height: 18,
        visible: true,
        bindingKey: "dashboardTitle"
      },
      {
        id: "dashboard.metadata",
        kind: "field",
        page: 1,
        layoutMode: "flow",
        flowOrder: 2,
        autoHeight: true,
        x: 12,
        y: 34,
        width: 273,
        height: 38,
        visible: true,
        bindingKey: "dashboardMetadata"
      },
      {
        id: "dashboard.section-summary",
        kind: "summary",
        page: 1,
        layoutMode: "flow",
        flowOrder: 3,
        autoHeight: true,
        x: 12,
        y: 76,
        width: 273,
        height: 24,
        visible: true,
        bindingKey: "dashboardSectionSummary"
      },
      {
        id: "dashboard.chart",
        kind: "summary",
        page: 1,
        layoutMode: "flow",
        flowOrder: 4,
        autoHeight: true,
        x: 12,
        y: 104,
        width: 273,
        height: 50,
        visible: true,
        bindingKey: "dashboardChartImage"
      },
      {
        id: "dashboard.table",
        kind: "table",
        page: 1,
        layoutMode: "flow",
        flowOrder: 5,
        autoHeight: true,
        repeatHeaderOnPageBreak: true,
        x: 12,
        y: 158,
        width: 273,
        height: 28,
        visible: true,
        bindingKey: "dashboardTable"
      }
    ]
  }
];

export const getDefaultDocumentLayoutDefinition = (key: DocumentLayoutKey): DocumentLayoutDefinition => {
  const storageKey = formatDocumentLayoutStorageKey(key);

  if (storageKey === "schedule-xlsx/template1") {
    verifyLowLevelAssetCompatibility(storageKey);
    return deepClone({
      documentKind: "schedule-xlsx" as const,
      variant: "template1" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: [
        {
          memberId: "main" as const,
          canvas: { unit: "cell" as const, width: 71, height: 80 },
          outputFileNamePattern: "{year}년/{monthNumber}월/{year}_{monthNumber}_{siteName}.xlsx",
          blocks: buildTemplate1Blocks()
        }
      ]
    });
  }

  if (storageKey === "schedule-xlsx/template2") {
    verifyLowLevelAssetCompatibility(storageKey);
    return deepClone({
      documentKind: "schedule-xlsx" as const,
      variant: "template2" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: [
        {
          memberId: "main" as const,
          canvas: { unit: "cell" as const, width: 71, height: 80 },
          outputFileNamePattern: "{year}년/{monthNumber}월/{year}_{monthNumber}_{siteName}.xlsx",
          blocks: buildTemplate2Blocks()
        }
      ]
    });
  }

  if (storageKey === "proposal-xlsx") {
    verifyLowLevelAssetCompatibility(storageKey);
    return deepClone({
      documentKind: "proposal-xlsx" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: [
        {
          memberId: "main" as const,
          canvas: { unit: "cell" as const, width: 9, height: 44 },
          outputFileNamePattern: "{year}년/{month2}월/{year}_{month2}_품의서.xlsx",
          blocks: buildProposalBlocks()
        }
      ]
    });
  }

  if (storageKey === "attachment1-xlsx") {
    verifyLowLevelAssetCompatibility(storageKey);
    return deepClone({
      documentKind: "attachment1-xlsx" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: [
        {
          memberId: "main" as const,
          canvas: { unit: "cell" as const, width: 19, height: 92 },
          outputFileNamePattern: "{year}년/{month2}월/{year}_{month2}_별첨1.xlsx",
          blocks: buildAttachment1Blocks()
        }
      ]
    });
  }

  if (storageKey === "attachment2-xlsx") {
    verifyLowLevelAssetCompatibility(storageKey);
    return deepClone({
      documentKind: "attachment2-xlsx" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: [
        {
          memberId: "main" as const,
          canvas: { unit: "cell" as const, width: 7, height: 86 },
          outputFileNamePattern: "{year}년/{month2}월/{year}_{month2}_별첨2.xlsx",
          blocks: buildAttachment2Blocks()
        }
      ]
    });
  }

  if (storageKey === "proposal-pdf") {
    return deepClone({
      documentKind: "proposal-pdf" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: buildProposalPdfOutputs()
    });
  }

  if (storageKey === "dashboard-report-pdf") {
    return deepClone({
      documentKind: "dashboard-report-pdf" as const,
      schemaVersion: DOCUMENT_LAYOUT_SCHEMA_VERSION,
      generatorCompatibilityVersion: PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION,
      outputs: buildDashboardReportPdfOutputs()
    });
  }

  throw new Error(`기본 레이아웃 정의가 지원되지 않는 문서 종류입니다: ${storageKey}`);
};

export const getBuiltInDocumentLayoutDefinition = getDefaultDocumentLayoutDefinition;

const computeBlockCapability = (block: DocumentLayoutBlock): DocumentLayoutBlockCapability => {
  const blockId = block.id;

  // 1. 공통 보호 메타데이터 블록
  if (PROTECTED_METADATA_BLOCK_IDS.has(blockId)) {
    return {
      blockId,
      editableProperties: [],
      protectedProperties: [
        ...DOCUMENT_LAYOUT_PROTECTED_PROPERTIES,
        ...DOCUMENT_LAYOUT_EDITABLE_PROPERTIES
      ]
    };
  }

  let cap: DocumentLayoutBlockCapability;

  // 2. 근무표 판독 표 블록 (위치, 열 너비, 글꼴 편집 허용)
  if (SCHEDULE_PARSER_TABLE_BLOCK_IDS.has(blockId)) {
    cap = {
      blockId,
      editableProperties: ["position", "column-width", "font"],
      protectedProperties: [
        "row-order",
        "value",
        "binding",
        "row-height",
        "merge",
        "size",
        "visibility",
        "text",
        "logo"
      ]
    };
  } else if (block.kind === "logo" || blockId.endsWith(".logo")) {
    // 3. 로고 블록
    cap = {
      blockId,
      editableProperties: ["position", "size", "visibility", "logo"],
      protectedProperties: [
        "row-order",
        "value",
        "binding",
        "row-height",
        "merge",
        "text",
        "column-width",
        "font"
      ]
    };
  } else if (block.bindingKey) {
    // 4. 데이터 바인딩 블록 (bindingKey가 있으면 kind 무관하게 text는 절대 편집 불가)
    if (block.kind === "table") {
      cap = {
        blockId,
        editableProperties: ["position", "size", "visibility", "column-width", "font"],
        protectedProperties: [
          "row-order",
          "value",
          "binding",
          "row-height",
          "merge",
          "text",
          "logo"
        ]
      };
    } else {
      cap = {
        blockId,
        editableProperties: ["position", "size", "visibility", "font"],
        protectedProperties: [
          "row-order",
          "value",
          "binding",
          "row-height",
          "merge",
          "text",
          "logo",
          "column-width"
        ]
      };
    }
  } else if (block.kind === "title" || block.kind === "note" || block.kind === "footer") {
    // 5. 정적 문구 블록 (bindingKey 없음)
    cap = {
      blockId,
      editableProperties: ["position", "size", "visibility", "text", "font"],
      protectedProperties: [
        "row-order",
        "value",
        "binding",
        "row-height",
        "merge",
        "logo",
        "column-width"
      ]
    };
  } else if (block.kind === "table") {
    cap = {
      blockId,
      editableProperties: ["position", "size", "visibility", "column-width", "font"],
      protectedProperties: [
        "row-order",
        "value",
        "binding",
        "row-height",
        "merge",
        "text",
        "logo"
      ]
    };
  } else {
    // 일반 필드 / 요약 / 헤더 (bindingKey 없는 경우)
    cap = {
      blockId,
      editableProperties: ["position", "size", "visibility", "font"],
      protectedProperties: [
        "row-order",
        "value",
        "binding",
        "row-height",
        "merge",
        "text",
        "logo",
        "column-width"
      ]
    };
  }

  // logoAssetId 속성이 정의되어 있으면 kind가 logo가 아니어도 logo 편집 허용 (설계 §4.2)
  if (block.logoAssetId !== undefined) {
    if (!cap.editableProperties.includes("logo")) {
      cap.editableProperties.push("logo");
    }
    cap.protectedProperties = cap.protectedProperties.filter((p) => p !== "logo");
  }

  return cap;
};

export const getDocumentLayoutCapabilities = (
  definition: DocumentLayoutDefinition
): DocumentLayoutCapabilities => {
  const blocks = (definition.outputs ?? []).flatMap((output) => output.blocks ?? []);
  const protectedBlockIds: string[] = [];

  const blockCapabilities = blocks.map((block) => {
    if (PROTECTED_METADATA_BLOCK_IDS.has(block.id)) {
      protectedBlockIds.push(block.id);
    }
    return computeBlockCapability(block);
  });

  return {
    editableProperties: [...DOCUMENT_LAYOUT_EDITABLE_PROPERTIES],
    protectedProperties: [...DOCUMENT_LAYOUT_PROTECTED_PROPERTIES],
    protectedBlockIds,
    blockCapabilities
  };
};

export type DocumentLayoutValidationMode = "preview" | "save";

const ALLOWED_DEFINITION_TOP_KEYS = new Set([
  "documentKind",
  "variant",
  "schemaVersion",
  "generatorCompatibilityVersion",
  "outputs"
]);

const ALLOWED_OUTPUT_KEYS = new Set([
  "memberId",
  "canvas",
  "outputFileNamePattern",
  "blocks"
]);

const ALLOWED_CANVAS_KEYS = new Set([
  "unit",
  "width",
  "height",
  "paperSize",
  "orientation",
  "marginsMm"
]);

const ALLOWED_BLOCK_KEYS = new Set([
  "id",
  "kind",
  "page",
  "layoutMode",
  "flowOrder",
  "autoHeight",
  "repeatHeaderOnPageBreak",
  "pageBreakBefore",
  "x",
  "y",
  "width",
  "height",
  "visible",
  "text",
  "logoAssetId",
  "columnWidths",
  "font",
  "bindingKey"
]);

const ALLOWED_FONT_KEYS = new Set([
  "family",
  "sizePt",
  "bold",
  "italic",
  "color"
]);

const validateOutputFileNamePattern = (
  pattern: unknown,
  documentKind: DocumentKind,
  issues: DocumentLayoutValidationIssue[],
  pathPrefix = "outputs[0].outputFileNamePattern"
) => {
  if (typeof pattern !== "string" || pattern.trim() === "") {
    issues.push({
      severity: "error",
      code: "INVALID_FILE_NAME_PATTERN",
      path: pathPrefix,
      message: "출력 파일명 패턴은 비어 있지 않은 문자열이어야 합니다."
    });
    return;
  }

  // Windows 금지 문자 (< > : " | ? *), NUL 및 제어 문자 (U+0000~U+001F), 역슬래시, 절대경로, 드라이브 문자, 상위경로 (..)
  const hasControlOrDisallowed =
    /[\x00-\x1F]/.test(pattern) ||
    /[<>:"|?*]/.test(pattern) ||
    pattern.includes("\\") ||
    pattern.includes("..") ||
    pattern.startsWith("/") ||
    /^[a-zA-Z]:/.test(pattern);

  if (hasControlOrDisallowed) {
    issues.push({
      severity: "error",
      code: "DISALLOWED_FILE_NAME_PATTERN_PATH",
      path: pathPrefix,
      message: "출력 파일명 패턴에 허용되지 않는 특수문자('?', '*', ':', '<', '>', '|', '\"'), 제어문자, 절대경로, 상위 디렉터리 이동('..'), 역슬래시는 허용되지 않습니다."
    });
  }

  // Brace 매칭 검사: 모든 { 와 } 는 짝이 맞는 비어 있지 않은 단일 토큰이어야 함
  const stripped = pattern.replace(/\{[^{}]+\}/g, "");
  if (stripped.includes("{") || stripped.includes("}")) {
    issues.push({
      severity: "error",
      code: "UNMATCHED_FILE_NAME_PATTERN_TOKEN",
      path: pathPrefix,
      message: "출력 파일명 패턴에 닫히지 않았거나 올바르지 않은 중괄호 치환자가 있습니다."
    });
  }

  const allowedTokensByKind: Record<DocumentKind, Set<string>> = {
    "schedule-xlsx": new Set(["{year}", "{monthNumber}", "{month2}", "{siteName}"]),
    "proposal-xlsx": new Set(["{year}", "{month2}"]),
    "attachment1-xlsx": new Set(["{year}", "{month2}"]),
    "attachment2-xlsx": new Set(["{year}", "{month2}"]),
    "proposal-pdf": new Set(["{year}", "{month2}"]),
    "dashboard-report-pdf": new Set(["{name}", "{timestamp}"])
  };

  const allowedTokens = allowedTokensByKind[documentKind] ?? new Set(["{year}", "{month2}"]);

  const tokenMatches = pattern.match(/\{[^{}]+\}/g) ?? [];
  for (const token of tokenMatches) {
    if (!allowedTokens.has(token)) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_FILE_NAME_PATTERN_TOKEN",
        path: pathPrefix,
        message: `출력 파일명 패턴에 지원하지 않는 치환 토큰('${token}')이 포함되어 있습니다.`
      });
    }
  }

  const isPdf = documentKind === "proposal-pdf" || documentKind === "dashboard-report-pdf";
  const expectedExt = isPdf ? ".pdf" : ".xlsx";

  if (!pattern.endsWith(expectedExt)) {
    issues.push({
      severity: "error",
      code: "INVALID_FILE_NAME_PATTERN_EXTENSION",
      path: pathPrefix,
      message: `출력 파일명 패턴은 반드시 '${expectedExt}'로 끝나야 합니다.`
    });
  }
};

export const validateDocumentLayoutDefinition = (
  candidate: unknown,
  _mode: DocumentLayoutValidationMode = "save"
): DocumentLayoutValidationIssue[] => {
  const issues: DocumentLayoutValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return [
      {
        severity: "error",
        code: "INVALID_DEFINITION_OBJECT",
        path: "root",
        message: "레이아웃 정의는 객체여야 합니다."
      }
    ];
  }

  for (const key of Object.keys(candidate)) {
    if (!ALLOWED_DEFINITION_TOP_KEYS.has(key)) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_DEFINITION_PROPERTY",
        path: key,
        message: `지원하지 않는 정의 속성('${key}')입니다.`
      });
    }
  }

  const kind = candidate.documentKind as DocumentKind;
  const variant = candidate.variant as ScheduleVariant | undefined;

  let storageKey = "";
  try {
    if (kind === "schedule-xlsx") {
      if (variant !== "template1" && variant !== "template2") {
        issues.push({
          severity: "error",
          code: "INVALID_SCHEDULE_VARIANT",
          path: "variant",
          message: "근무표 레이아웃에는 유효한 변형('template1' 또는 'template2')이 필수입니다."
        });
        return issues;
      }
      storageKey = `schedule-xlsx/${variant}`;
    } else {
      if (variant !== undefined) {
        issues.push({
          severity: "error",
          code: "DISALLOWED_VARIANT",
          path: "variant",
          message: "근무표 외 문서 종류에는 변형을 지정할 수 없습니다."
        });
        return issues;
      }
      storageKey = formatDocumentLayoutStorageKey({ documentKind: kind } as DocumentLayoutKey);
    }
  } catch (err) {
    issues.push({
      severity: "error",
      code: "INVALID_DOCUMENT_KIND",
      path: "documentKind",
      message: (err as Error).message
    });
    return issues;
  }

  let baseline: DocumentLayoutDefinition;
  try {
    const key = parseDocumentLayoutStorageKey(storageKey);
    baseline = getDefaultDocumentLayoutDefinition(key);
  } catch (err) {
    issues.push({
      severity: "error",
      code: "UNSUPPORTED_LAYOUT_KEY",
      path: "documentKind",
      message: (err as Error).message
    });
    return issues;
  }

  if (candidate.schemaVersion !== DOCUMENT_LAYOUT_SCHEMA_VERSION) {
    issues.push({
      severity: "error",
      code: "UNSUPPORTED_SCHEMA_VERSION",
      path: "schemaVersion",
      message: `스키마 버전은 '${DOCUMENT_LAYOUT_SCHEMA_VERSION}'이어야 합니다.`
    });
  }

  if (candidate.generatorCompatibilityVersion !== baseline.generatorCompatibilityVersion) {
    issues.push({
      severity: "error",
      code: "UNSUPPORTED_GENERATOR_COMPATIBILITY_VERSION",
      path: "generatorCompatibilityVersion",
      message: `생성기 호환성 버전은 '${baseline.generatorCompatibilityVersion}'이어야 합니다.`
    });
  }

  if (!Array.isArray(candidate.outputs) || candidate.outputs.length === 0) {
    issues.push({
      severity: "error",
      code: "INVALID_OUTPUTS",
      path: "outputs",
      message: "outputs는 비어 있지 않은 배열이어야 합니다."
    });
    return issues;
  }

  if (candidate.outputs.length !== baseline.outputs.length) {
    issues.push({
      severity: "error",
      code: "OUTPUT_MEMBER_COUNT_MISMATCH",
      path: "outputs",
      message: `출력 멤버 수는 정확히 ${baseline.outputs.length}개여야 합니다.`
    });
    return issues;
  }

  const globalSeenBlockIds = new Set<string>();

  for (let outputIdx = 0; outputIdx < candidate.outputs.length; outputIdx++) {
    const outputCandidate = candidate.outputs[outputIdx];
    const baselineOutput = baseline.outputs[outputIdx]!;
    const outputPrefix = `outputs[${outputIdx}]`;

    if (!isPlainObject(outputCandidate)) {
      issues.push({
        severity: "error",
        code: "INVALID_OUTPUT_MEMBER",
        path: outputPrefix,
        message: "출력 멤버는 객체여야 합니다."
      });
      continue;
    }

    for (const k of Object.keys(outputCandidate)) {
      if (!ALLOWED_OUTPUT_KEYS.has(k)) {
        issues.push({
          severity: "error",
          code: "UNKNOWN_OUTPUT_PROPERTY",
          path: `${outputPrefix}.${k}`,
          message: `지원하지 않는 출력 멤버 속성('${k}')입니다.`
        });
      }
    }

    if (outputCandidate.memberId !== baselineOutput.memberId) {
      issues.push({
        severity: "error",
        code: "OUTPUT_MEMBER_ID_MISMATCH",
        path: `${outputPrefix}.memberId`,
        message: `출력 멤버 ID는 '${baselineOutput.memberId}'이어야 합니다.`
      });
    }

    const canvasCandidate = outputCandidate.canvas;
    if (!isPlainObject(canvasCandidate)) {
      issues.push({
        severity: "error",
        code: "INVALID_CANVAS",
        path: `${outputPrefix}.canvas`,
        message: "canvas는 객체여야 합니다."
      });
    } else {
      for (const k of Object.keys(canvasCandidate)) {
        if (!ALLOWED_CANVAS_KEYS.has(k)) {
          issues.push({
            severity: "error",
            code: "UNKNOWN_CANVAS_PROPERTY",
            path: `${outputPrefix}.canvas.${k}`,
            message: `지원하지 않는 캔버스 속성('${k}')입니다.`
          });
        }
      }

      // Canvas 전체 구조 및 속성의 의미상 동일성 보호 (C3)
      const canvasKeys = ["unit", "width", "height", "paperSize", "orientation", "marginsMm"] as const;
      let canvasModified = false;
      for (const ck of canvasKeys) {
        const cVal = (canvasCandidate as Record<string, unknown>)[ck];
        const bVal = (baselineOutput.canvas as unknown as Record<string, unknown>)[ck];
        if (bVal === undefined) {
          if (cVal !== undefined) {
            canvasModified = true;
            break;
          }
        } else {
          if (typeof bVal === "object" && bVal !== null) {
            if (JSON.stringify(cVal) !== JSON.stringify(bVal)) {
              canvasModified = true;
              break;
            }
          } else if (cVal !== bVal) {
            canvasModified = true;
            break;
          }
        }
      }

      if (canvasModified) {
        issues.push({
          severity: "error",
          code: "PROTECTED_CANVAS_MODIFIED",
          path: `${outputPrefix}.canvas`,
          message: `캔버스 단위와 크기(${baselineOutput.canvas.width}x${baselineOutput.canvas.height} ${baselineOutput.canvas.unit}) 및 속성은 변경할 수 없습니다.`
        });
      }
    }

    validateOutputFileNamePattern(
      outputCandidate.outputFileNamePattern,
      kind,
      issues,
      `${outputPrefix}.outputFileNamePattern`
    );

    const canvasWidth = baselineOutput.canvas.width;
    const canvasHeight = baselineOutput.canvas.height;
    const isMmCanvas = baselineOutput.canvas.unit === "mm";

    if (!Array.isArray(outputCandidate.blocks)) {
      issues.push({
        severity: "error",
        code: "INVALID_BLOCKS",
        path: `${outputPrefix}.blocks`,
        message: "blocks는 배열이어야 합니다."
      });
      continue;
    }

    const candidateBlocks = outputCandidate.blocks as unknown[];
    const baselineBlocks = baselineOutput.blocks;

    if (candidateBlocks.length !== baselineBlocks.length) {
      issues.push({
        severity: "error",
        code: "BLOCK_COUNT_MISMATCH",
        path: `${outputPrefix}.blocks`,
        message: `블록 개수가 기본 정의(${baselineBlocks.length}개)와 다릅니다.`
      });
    }

    const baselineBlockMap = new Map<string, { block: DocumentLayoutBlock; index: number }>();
    baselineBlocks.forEach((b, idx) => baselineBlockMap.set(b.id, { block: b, index: idx }));

    candidateBlocks.forEach((bItemRaw, idx) => {
      const pathPrefix = `${outputPrefix}.blocks[${idx}]`;

      if (!isPlainObject(bItemRaw)) {
        issues.push({
          severity: "error",
          code: "INVALID_BLOCK_OBJECT",
          path: pathPrefix,
          message: "블록은 객체여야 합니다."
        });
        return;
      }

      const bItem = bItemRaw as Record<string, unknown>;

      for (const k of Object.keys(bItem)) {
        if (!ALLOWED_BLOCK_KEYS.has(k)) {
          issues.push({
            severity: "error",
            code: "UNKNOWN_BLOCK_PROPERTY",
            path: `${pathPrefix}.${k}`,
            message: `지원하지 않는 블록 속성('${k}')입니다.`
          });
        }
      }

      const bId = bItem.id;
      if (typeof bId !== "string" || !bId) {
        issues.push({
          severity: "error",
          code: "MISSING_BLOCK_ID",
          path: `${pathPrefix}.id`,
          message: "블록 ID가 누락되었습니다."
        });
        return;
      }

      if (globalSeenBlockIds.has(bId)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_BLOCK_ID",
          path: `${pathPrefix}.id`,
          message: `중복된 블록 ID('${bId}')입니다.`
        });
      }
      globalSeenBlockIds.add(bId);

      const baseEntry = baselineBlockMap.get(bId);
      if (!baseEntry) {
        issues.push({
          severity: "error",
          code: "UNKNOWN_BLOCK_ID",
          path: `${pathPrefix}.id`,
          message: `기본 정의에 존재하지 않는 블록 ID('${bId}')입니다.`
        });
        return;
      }

      if (baseEntry.index !== idx) {
        issues.push({
          severity: "error",
          code: "BLOCK_ORDER_MISMATCH",
          path: `${pathPrefix}.id`,
          message: `블록 순서가 기본 정의와 다릅니다. (기대 인덱스: ${baseEntry.index}, 실제 인덱스: ${idx})`
        });
      }

      const baseBlock = baseEntry.block;
      const blockCap = computeBlockCapability(baseBlock);

      // Structure checks
      if (bItem.kind !== baseBlock.kind) {
        issues.push({
          severity: "error",
          code: "PROTECTED_BLOCK_KIND_MODIFIED",
          path: `${pathPrefix}.kind`,
          message: `블록의 kind('${baseBlock.kind}')는 변경할 수 없습니다.`
        });
      }
      if (bItem.bindingKey !== baseBlock.bindingKey) {
        issues.push({
          severity: "error",
          code: "PROTECTED_BINDING_KEY_MODIFIED",
          path: `${pathPrefix}.bindingKey`,
          message: `블록의 bindingKey('${baseBlock.bindingKey ?? ""}')는 변경할 수 없습니다.`
        });
      }

      const structuralProps = [
        "page",
        "layoutMode",
        "flowOrder",
        "autoHeight",
        "repeatHeaderOnPageBreak",
        "pageBreakBefore"
      ] as const;

      for (const prop of structuralProps) {
        if (bItem[prop] !== (baseBlock as unknown as Record<string, unknown>)[prop]) {
          issues.push({
            severity: "error",
            code: "PROTECTED_STRUCTURAL_ATTRIBUTE_MODIFIED",
            path: `${pathPrefix}.${prop}`,
            message: `블록 '${bId}'의 구조 속성('${prop}')은 변경할 수 없습니다.`
          });
        }
      }

      // Runtime type & value validation (C2)
      // 1) visible: 반드시 boolean
      if (typeof bItem.visible !== "boolean") {
        issues.push({
          severity: "error",
          code: "INVALID_BLOCK_VISIBILITY",
          path: `${pathPrefix}.visible`,
          message: "visible은 boolean 값이어야 합니다."
        });
      }

      // 2) text: 존재하면 반드시 문자열
      if (bItem.text !== undefined && typeof bItem.text !== "string") {
        issues.push({
          severity: "error",
          code: "INVALID_BLOCK_TEXT",
          path: `${pathPrefix}.text`,
          message: "text는 문자열이어야 합니다."
        });
      }

      // 3) logoAssetId: 존재하면 null 또는 안전한 비어 있지 않은 식별자 문자열 ("brand-logo"만 지원)
      if (bItem.logoAssetId !== undefined && bItem.logoAssetId !== null) {
        if (
          typeof bItem.logoAssetId !== "string" ||
          !bItem.logoAssetId.trim() ||
          bItem.logoAssetId.includes("/") ||
          bItem.logoAssetId.includes("\\") ||
          /[\x00-\x1F]/.test(bItem.logoAssetId)
        ) {
          issues.push({
            severity: "error",
            code: "INVALID_LOGO_ASSET_ID",
            path: `${pathPrefix}.logoAssetId`,
            message: "logoAssetId는 경로 구분자나 제어 문자가 없는 비어 있지 않은 식별자 문자열이어야 합니다."
          });
        } else if (bItem.logoAssetId !== "brand-logo") {
          issues.push({
            severity: "error",
            code: "UNKNOWN_LOGO_ASSET_ID",
            path: `${pathPrefix}.logoAssetId`,
            message: `지원하지 않는 로고 자산 식별자('${bItem.logoAssetId}')입니다. 현재는 'brand-logo'만 지원됩니다.`
          });
        }
      }

      // 4) columnWidths: 존재하면 plain object, key는 대문자 영문 상대 열(A, B, AA..), 값은 0보다 큰 유한 숫자
      if (bItem.columnWidths !== undefined) {
        if (!isPlainObject(bItem.columnWidths)) {
          issues.push({
            severity: "error",
            code: "INVALID_COLUMN_WIDTHS",
            path: `${pathPrefix}.columnWidths`,
            message: "columnWidths는 열 키와 유한 숫자 너비의 매핑 객체여야 합니다."
          });
        } else {
          const cw = bItem.columnWidths as Record<string, unknown>;
          const fixedCols = FIXED_TABLE_COLUMN_SETS[bId];

          if (fixedCols) {
            const actualKeys = Object.keys(cw);
            if (actualKeys.length === 0) {
              issues.push({
                severity: "error",
                code: "INVALID_COLUMN_WIDTHS",
                path: `${pathPrefix}.columnWidths`,
                message: `고정 표 블록 '${bId}'의 columnWidths는 비어 있을 수 없으며, 모든 열(${fixedCols.join(", ")})의 너비를 포함해야 합니다.`
              });
            } else {
              const missingKeys = fixedCols.filter((k) => !(k in cw));
              const extraKeys = actualKeys.filter((k) => !fixedCols.includes(k));
              if (missingKeys.length > 0) {
                issues.push({
                  severity: "error",
                  code: "INVALID_COLUMN_WIDTHS",
                  path: `${pathPrefix}.columnWidths`,
                  message: `고정 표 블록 '${bId}'에 필수 열 [${missingKeys.join(", ")}]의 너비가 누락되었습니다.`
                });
              }
              if (extraKeys.length > 0) {
                issues.push({
                  severity: "error",
                  code: "INVALID_COLUMN_WIDTH_KEY",
                  path: `${pathPrefix}.columnWidths.${extraKeys[0]}`,
                  message: `고정 표 블록 '${bId}'에 허용되지 않은 열 [${extraKeys.join(", ")}]이 포함되어 있습니다.`
                });
              }
            }
          }

          const maxColumnIndex = isMmCanvas
            ? bId === "dashboard.table"
              ? 52 // A ~ AZ
              : baseBlock.columnWidths
                ? Math.max(...Object.keys(baseBlock.columnWidths).map(parseRelativeColumnKey), 1)
                : 52
            : typeof bItem.width === "number" && Number.isInteger(bItem.width)
              ? bItem.width
              : baseBlock.width;

          for (const [colKey, colWidth] of Object.entries(cw)) {
            const relIdx = parseRelativeColumnKey(colKey);
            if (relIdx < 1 || relIdx > maxColumnIndex) {
              issues.push({
                severity: "error",
                code: "INVALID_COLUMN_WIDTH_KEY",
                path: `${pathPrefix}.columnWidths.${colKey}`,
                message: `상대 열 키('${colKey}')는 대문자 영문이어야 하며 블록 너비(${maxColumnIndex}) 범위 내여야 합니다.`
              });
            }
            if (
              typeof colWidth !== "number" ||
              !Number.isFinite(colWidth) ||
              colWidth <= 0
            ) {
              issues.push({
                severity: "error",
                code: "INVALID_COLUMN_WIDTHS",
                path: `${pathPrefix}.columnWidths.${colKey}`,
                message: `열 '${colKey}'의 너비는 0보다 큰 유한 숫자여야 합니다.`
              });
            }
          }
        }
      }

      // 5) font: 존재하면 plain object, family/sizePt/bold/italic/color 타입 검증
      if (bItem.font !== undefined) {
        if (!isPlainObject(bItem.font)) {
          issues.push({
            severity: "error",
            code: "INVALID_FONT_OBJECT",
            path: `${pathPrefix}.font`,
            message: "font는 객체여야 합니다."
          });
        } else {
          const f = bItem.font as Record<string, unknown>;
          for (const fk of Object.keys(f)) {
            if (!ALLOWED_FONT_KEYS.has(fk)) {
              issues.push({
                severity: "error",
                code: "UNKNOWN_FONT_PROPERTY",
                path: `${pathPrefix}.font.${fk}`,
                message: `지원하지 않는 글꼴 속성('${fk}')입니다.`
              });
            }
          }
          if (typeof f.family !== "string" || !f.family.trim()) {
            issues.push({
              severity: "error",
              code: "INVALID_FONT_FAMILY",
              path: `${pathPrefix}.font.family`,
              message: "font.family는 비어 있지 않은 문자열이어야 합니다."
            });
          } else if (/["';\\<>()=\u0000-\u001f\u007f-\u009f]/.test(f.family)) {
            issues.push({
              severity: "error",
              code: "INVALID_FONT_FAMILY",
              path: `${pathPrefix}.font.family`,
              message: `font.family에 허용되지 않는 제어 문자나 특수 문자가 포함되어 있습니다: '${f.family}'`
            });
          }
          if (typeof f.sizePt !== "number" || !Number.isFinite(f.sizePt) || f.sizePt <= 0) {
            issues.push({
              severity: "error",
              code: "INVALID_FONT_SIZE",
              path: `${pathPrefix}.font.sizePt`,
              message: "font.sizePt는 0보다 큰 숫자여야 합니다."
            });
          }
          if (f.bold !== undefined && typeof f.bold !== "boolean") {
            issues.push({
              severity: "error",
              code: "INVALID_FONT_BOLD",
              path: `${pathPrefix}.font.bold`,
              message: "font.bold는 boolean이어야 합니다."
            });
          }
          if (f.italic !== undefined && typeof f.italic !== "boolean") {
            issues.push({
              severity: "error",
              code: "INVALID_FONT_ITALIC",
              path: `${pathPrefix}.font.italic`,
              message: "font.italic은 boolean이어야 합니다."
            });
          }
          if (f.color !== undefined && (typeof f.color !== "string" || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(f.color))) {
            issues.push({
              severity: "error",
              code: "INVALID_FONT_COLOR",
              path: `${pathPrefix}.font.color`,
              message: "font.color는 '#RRGGBB' 또는 '#AARRGGBB' 형식의 유효한 16진수 색상이어야 합니다."
            });
          }
        }
      }

      // Geometry checks (unit === "cell" requires integer, unit === "mm" requires finite float >= 0)
      const x = bItem.x;
      const y = bItem.y;
      const width = bItem.width;
      const height = bItem.height;

      const isGeometryValid = isMmCanvas
        ? typeof x === "number" &&
          Number.isFinite(x) &&
          x >= 0 &&
          typeof y === "number" &&
          Number.isFinite(y) &&
          y >= 0 &&
          typeof width === "number" &&
          Number.isFinite(width) &&
          width > 0 &&
          typeof height === "number" &&
          Number.isFinite(height) &&
          height > 0 &&
          x + width <= canvasWidth &&
          y + height <= canvasHeight
        : typeof x === "number" &&
          Number.isInteger(x) &&
          x >= 0 &&
          typeof y === "number" &&
          Number.isInteger(y) &&
          y >= 0 &&
          typeof width === "number" &&
          Number.isInteger(width) &&
          width > 0 &&
          typeof height === "number" &&
          Number.isInteger(height) &&
          height > 0 &&
          x + width <= canvasWidth &&
          y + height <= canvasHeight;

      if (!isGeometryValid) {
        issues.push({
          severity: "error",
          code: "INVALID_BLOCK_GEOMETRY",
          path: `${pathPrefix}.geometry`,
          message: `블록 좌표/크기(x=${String(x)}, y=${String(y)}, w=${String(width)}, h=${String(height)})가 정수가 아니거나 유효하지 않거나 캔버스 범위를 벗어났습니다.`
        });
      }

      // Unrenderable block size check (D3) - only for cell unit
      if (!isMmCanvas) {
        let minSize = MIN_RENDERABLE_BLOCK_SIZES[bId];
        if (bId === "schedule.calendar-grid" && variant === "template2") {
          minSize = { minWidth: 22, minHeight: 61 };
        }
        if (bId === "schedule.reschedule" && variant === "template2") {
          minSize = { minWidth: 35, minHeight: 34 };
        }
        if (minSize && typeof width === "number" && typeof height === "number") {
          if (width < minSize.minWidth || height < minSize.minHeight) {
            issues.push({
              severity: "error",
              code: "UNRENDERABLE_BLOCK_SIZE",
              path: `${pathPrefix}.size`,
              message: `블록 '${bId}'의 크기(${width}x${height})는 내부 필수 구조를 표현하기에 너무 작습니다. (최소: ${minSize.minWidth}x${minSize.minHeight})`
            });
          }
        }
      }

      // Capability-based checks
      const canPosition = blockCap.editableProperties.includes("position");
      const canSize = blockCap.editableProperties.includes("size");
      const canVisibility = blockCap.editableProperties.includes("visibility");
      const canText = blockCap.editableProperties.includes("text");
      const canLogo = blockCap.editableProperties.includes("logo");
      const canColumnWidth = blockCap.editableProperties.includes("column-width");
      const canFont = blockCap.editableProperties.includes("font");

      if (!canPosition && (x !== baseBlock.x || y !== baseBlock.y)) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.position`,
          message: `블록 '${bId}'의 위치(position)는 변경할 수 없습니다.`
        });
      }

      if (!canSize && (width !== baseBlock.width || height !== baseBlock.height)) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.size`,
          message: `블록 '${bId}'의 크기(size)는 변경할 수 없습니다.`
        });
      }

      if (!canVisibility && bItem.visible !== baseBlock.visible) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.visible`,
          message: `블록 '${bId}'의 표시 여부(visibility)는 변경할 수 없습니다.`
        });
      }

      if (!canText && bItem.text !== baseBlock.text) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.text`,
          message: `블록 '${bId}'의 문구(text)는 변경할 수 없습니다.`
        });
      }

      if (!canLogo && bItem.logoAssetId !== baseBlock.logoAssetId) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.logoAssetId`,
          message: `블록 '${bId}'의 로고(logo)는 변경할 수 없습니다.`
        });
      }

      if (
        !canColumnWidth &&
        bItem.columnWidths !== undefined &&
        JSON.stringify(bItem.columnWidths) !== JSON.stringify(baseBlock.columnWidths)
      ) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.columnWidths`,
          message: `블록 '${bId}'의 열 너비(column-width)는 변경할 수 없습니다.`
        });
      }

      if (!canFont && bItem.font !== undefined && JSON.stringify(bItem.font) !== JSON.stringify(baseBlock.font)) {
        issues.push({
          severity: "error",
          code: "PROTECTED_PROPERTY_MODIFIED",
          path: `${pathPrefix}.font`,
          message: `블록 '${bId}'의 글꼴(font)은 변경할 수 없습니다.`
        });
      }
    });

    // Cross-block: Conflicting column width check on same absolute column (D4) - only for cell canvas
    if (!isMmCanvas) {
      const colWidthByAbsCol = new Map<number, { width: number; blockId: string }>();
      candidateBlocks.forEach((bItemRaw) => {
        if (!isPlainObject(bItemRaw)) return;
        const b = bItemRaw as Record<string, unknown>;
        if (b.visible === false) return;
        if (typeof b.x !== "number" || !Number.isInteger(b.x)) return;
        if (!isPlainObject(b.columnWidths)) return;
        for (const [colKey, colWidth] of Object.entries(b.columnWidths as Record<string, unknown>)) {
          const relIdx = parseRelativeColumnKey(colKey);
          if (relIdx < 1) continue;
          if (typeof colWidth !== "number" || !Number.isFinite(colWidth) || colWidth <= 0) continue;
          const absCol = (b.x as number) + (relIdx - 1);
          const existing = colWidthByAbsCol.get(absCol);
          if (existing && existing.width !== colWidth) {
            issues.push({
              severity: "error",
              code: "CONFLICTING_COLUMN_WIDTH",
              path: `${outputPrefix}.blocks`,
              message: `블록 '${existing.blockId}'와 블록 '${String(b.id)}'가 절대 열 ${absCol + 1}에 서로 다른 너비(${existing.width} vs ${colWidth})를 지정하여 충돌합니다.`
            });
          } else if (!existing) {
            colWidthByAbsCol.set(absCol, { width: colWidth, blockId: String(b.id) });
          }
        }
      });
    }

    // Cross-block: Visible block collision check (D2) - skip for flow layout
    const visibleBlocks = candidateBlocks.filter((bItemRaw): bItemRaw is Record<string, unknown> => {
      if (!isPlainObject(bItemRaw)) return false;
      const b = bItemRaw as Record<string, unknown>;
      if (b.visible === false) return false;
      if (PROTECTED_METADATA_BLOCK_IDS.has(String(b.id))) return false;
      // PDF flow blocks do not collide (layoutMode === "flow")
      if (b.layoutMode === "flow") return false;
      return (
        typeof b.x === "number" &&
        typeof b.y === "number" &&
        typeof b.width === "number" &&
        typeof b.height === "number"
      );
    });

    for (let i = 0; i < visibleBlocks.length; i++) {
      const b1 = visibleBlocks[i]!;
      const x1 = b1.x as number;
      const y1 = b1.y as number;
      const w1 = b1.width as number;
      const h1 = b1.height as number;

      for (let j = i + 1; j < visibleBlocks.length; j++) {
        const b2 = visibleBlocks[j]!;
        const x2 = b2.x as number;
        const y2 = b2.y as number;
        const w2 = b2.width as number;
        const h2 = b2.height as number;

        const isOverlap = x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
        if (isOverlap) {
          issues.push({
            severity: "error",
            code: "BLOCK_COLLISION",
            path: `${outputPrefix}.blocks`,
            message: `보이는 블록 '${String(b1.id)}'과 블록 '${String(b2.id)}'의 영역이 겹칩니다.`
          });
        }
      }
    }
  }

  return issues;
};

export const assertValidDocumentLayoutDefinition = (
  candidate: unknown,
  mode: DocumentLayoutValidationMode = "save"
): DocumentLayoutDefinition => {
  const issues = validateDocumentLayoutDefinition(candidate, mode);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(`[레이아웃 검증 오류 (${first.code})] ${first.path}: ${first.message}`);
  }
  return deepClone(candidate as DocumentLayoutDefinition);
};
