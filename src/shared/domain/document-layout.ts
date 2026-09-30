export type DocumentKind =
  | "schedule-xlsx"
  | "proposal-xlsx"
  | "attachment1-xlsx"
  | "attachment2-xlsx"
  | "proposal-pdf"
  | "dashboard-report-pdf";

export type ScheduleVariant = "template1" | "template2";

export type DocumentLayoutKey =
  | { documentKind: "schedule-xlsx"; variant: ScheduleVariant }
  | {
      documentKind: Exclude<DocumentKind, "schedule-xlsx">;
      variant?: never;
    };

export type DocumentLayoutBlockKind =
  | "title"
  | "header"
  | "field"
  | "summary"
  | "table"
  | "signature"
  | "week"
  | "note"
  | "logo"
  | "footer";

export interface DocumentLayoutBlockFont {
  family: string;
  sizePt: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface DocumentLayoutBlock {
  id: string;
  kind: DocumentLayoutBlockKind;
  page?: number;
  layoutMode?: "absolute" | "flow";
  flowOrder?: number;
  autoHeight?: boolean;
  repeatHeaderOnPageBreak?: boolean;
  pageBreakBefore?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  text?: string;
  logoAssetId?: string | null;
  columnWidths?: Record<string, number>;
  font?: DocumentLayoutBlockFont;
  bindingKey?: string;
}

export type DocumentLayoutMemberId = "main" | "proposal" | "attachment1" | "attachment2";

export interface DocumentLayoutCanvas {
  unit: "cell" | "mm";
  width: number;
  height: number;
  paperSize?: "A4";
  orientation?: "portrait" | "landscape";
  marginsMm?: { top: number; right: number; bottom: number; left: number };
}

export interface DocumentLayoutOutputMember {
  memberId: DocumentLayoutMemberId;
  canvas: DocumentLayoutCanvas;
  outputFileNamePattern: string;
  blocks: DocumentLayoutBlock[];
}

export type DocumentLayoutDefinition = DocumentLayoutKey & {
  schemaVersion: string;
  generatorCompatibilityVersion: string;
  outputs: [DocumentLayoutOutputMember, ...DocumentLayoutOutputMember[]];
};

export type DocumentLayoutEditableProperty =
  | "position"
  | "size"
  | "visibility"
  | "text"
  | "logo"
  | "column-width"
  | "font";

export type DocumentLayoutProtectedProperty =
  | "row-order"
  | "value"
  | "binding"
  | "row-height"
  | "merge";

export interface DocumentLayoutBlockCapability {
  blockId: string;
  editableProperties: DocumentLayoutEditableProperty[];
  protectedProperties: Array<
    DocumentLayoutProtectedProperty | DocumentLayoutEditableProperty
  >;
}

export interface DocumentLayoutCapabilities {
  editableProperties: DocumentLayoutEditableProperty[];
  protectedBlockIds: string[];
  protectedProperties: DocumentLayoutProtectedProperty[];
  blockCapabilities: DocumentLayoutBlockCapability[];
}

export type DocumentLayoutSummary = DocumentLayoutKey & {
  activeRevisionId: string | null;
  usingBuiltInDefault: boolean;
  updatedAt: string | null;
};

export type DocumentLayoutSnapshot = DocumentLayoutSummary & {
  definition: DocumentLayoutDefinition;
  capabilities: DocumentLayoutCapabilities;
};

export interface DocumentLayoutSaveInput {
  definition: DocumentLayoutDefinition;
  expectedRevisionId: string | null;
  changeReason?: string;
}

export type DocumentLayoutResetInput = DocumentLayoutKey & {
  expectedRevisionId: string | null;
  changeReason?: string;
};

export interface DocumentLayoutPreviewInput {
  definition: DocumentLayoutDefinition;
  basedOnRevisionId: string | null;
}

export interface DocumentLayoutValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface DocumentLayoutPreviewOutput {
  memberId: DocumentLayoutMemberId;
  mediaType:
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/pdf";
  previewUrl: string;
  expiresAt: string;
}

export interface DocumentLayoutPreview {
  previewId: string;
  outputs: [DocumentLayoutPreviewOutput, ...DocumentLayoutPreviewOutput[]];
  validationIssues: DocumentLayoutValidationIssue[];
}

export type DocumentLayoutHistoryRecord = DocumentLayoutKey & {
  revisionId: string;
  versionLabel: string;
  changeReason?: string;
  createdAt: string;
  isActive: boolean;
};

export const DOCUMENT_LAYOUT_SCHEMA_VERSION = "1.0";
export const EXCEL_LAYOUT_GENERATOR_COMPATIBILITY_VERSION = "built-in-excel-layout-v1";
export const PDF_LAYOUT_GENERATOR_COMPATIBILITY_VERSION = "built-in-pdf-layout-v1";

export const DOCUMENT_LAYOUT_EDITABLE_PROPERTIES: DocumentLayoutEditableProperty[] = [
  "position",
  "size",
  "visibility",
  "text",
  "logo",
  "column-width",
  "font"
];

export const DOCUMENT_LAYOUT_PROTECTED_PROPERTIES: DocumentLayoutProtectedProperty[] = [
  "row-order",
  "value",
  "binding",
  "row-height",
  "merge"
];

export const SUPPORTED_EXCEL_LAYOUT_STORAGE_KEYS: string[] = [
  "schedule-xlsx/template1",
  "schedule-xlsx/template2",
  "proposal-xlsx",
  "attachment1-xlsx",
  "attachment2-xlsx"
];

export const SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS: string[] = [
  "schedule-xlsx/template1",
  "schedule-xlsx/template2",
  "proposal-xlsx",
  "attachment1-xlsx",
  "attachment2-xlsx",
  "proposal-pdf",
  "dashboard-report-pdf"
];
