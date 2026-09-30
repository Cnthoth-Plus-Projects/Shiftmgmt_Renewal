import { randomUUID } from "node:crypto";

import {
  type DocumentLayoutDefinition,
  type DocumentLayoutHistoryRecord,
  type DocumentLayoutKey,
  type DocumentLayoutResetInput,
  type DocumentLayoutSaveInput,
  type DocumentLayoutSnapshot,
  type DocumentLayoutSummary,
  SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS
} from "../../shared/domain/document-layout";
import {
  assertValidDocumentLayoutDefinition,
  formatDocumentLayoutStorageKey,
  getBuiltInDocumentLayoutDefinition,
  getDocumentLayoutCapabilities,
  isSupportedDocumentLayoutKey,
  parseDocumentLayoutStorageKey
} from "./document-layout-definition-service";
import {
  getSqliteDatabase,
  isSqliteStorageReady
} from "./sqlite-storage-service";

interface DocumentTemplateVersionRow {
  id: string;
  template_type: string;
  version_label: string;
  source_path: string;
  status: string;
  is_default: number;
  output_file_name_pattern: string | null;
  profile_schema_version: string | null;
  profile_json: string | null;
  validation_json: string | null;
  checksum: string | null;
  created_at: string;
  updated_at: string | null;
  approved_at: string | null;
}

const ensureStorageReady = () => {
  if (!isSqliteStorageReady()) {
    throw new Error("SQLite 저장소가 준비되지 않았습니다.");
  }
  const database = getSqliteDatabase();
  if (!database) {
    throw new Error("SQLite 저장소가 준비되지 않았습니다.");
  }
  return database;
};

export const listDocumentLayouts = (): DocumentLayoutSummary[] => {
  const database = ensureStorageReady();

  return SUPPORTED_DOCUMENT_LAYOUT_STORAGE_KEYS.map((storageKey) => {
    const key = parseDocumentLayoutStorageKey(storageKey);

    const rows = database
      .prepare(`
        SELECT *
        FROM document_template_versions
        WHERE template_type = ? AND source_path = ''
        ORDER BY created_at DESC, id DESC
      `)
      .all(storageKey) as unknown as DocumentTemplateVersionRow[];

    const activeRows = rows.filter((r) => r.is_default === 1);
    if (activeRows.length > 1) {
      throw new Error(`활성 레이아웃 판이 2개 이상 존재하여 판정할 수 없습니다: ${storageKey}`);
    }

    if (activeRows.length === 1) {
      const active = activeRows[0]!;
      return {
        ...key,
        activeRevisionId: active.id,
        usingBuiltInDefault: false,
        updatedAt: active.updated_at ?? active.created_at
      };
    }

    return {
      ...key,
      activeRevisionId: null,
      usingBuiltInDefault: true,
      updatedAt: null
    };
  });
};

export const getDocumentLayout = (key: DocumentLayoutKey): DocumentLayoutSnapshot => {
  const database = ensureStorageReady();
  const storageKey = formatDocumentLayoutStorageKey(key);

  if (!isSupportedDocumentLayoutKey(storageKey)) {
    throw new Error(`지원하지 않거나 기본 정의가 없는 레이아웃 키입니다: ${storageKey}`);
  }

  const rows = database
    .prepare(`
      SELECT *
      FROM document_template_versions
      WHERE template_type = ? AND source_path = ''
      ORDER BY created_at DESC, id DESC
    `)
    .all(storageKey) as unknown as DocumentTemplateVersionRow[];

  const activeRows = rows.filter((r) => r.is_default === 1);
  if (activeRows.length > 1) {
    throw new Error(`활성 레이아웃 판이 2개 이상 존재하여 판정할 수 없습니다: ${storageKey}`);
  }

  if (activeRows.length === 0) {
    const definition = getBuiltInDocumentLayoutDefinition(key);
    const capabilities = getDocumentLayoutCapabilities(definition);
    return {
      ...key,
      activeRevisionId: null,
      usingBuiltInDefault: true,
      updatedAt: null,
      definition,
      capabilities
    };
  }

  const active = activeRows[0]!;
  if (!active.profile_json) {
    throw new Error(`저장된 레이아웃 프로필 데이터가 비어 있습니다: ${active.id}`);
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(active.profile_json);
  } catch {
    throw new Error(`저장된 레이아웃 JSON 데이터가 올바르지 않습니다: ${active.id}`);
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`저장된 레이아웃 데이터가 객체 형식이 아닙니다: ${active.id}`);
  }

  const candidateObj = candidate as { documentKind?: string; variant?: string };
  if (candidateObj.documentKind !== key.documentKind) {
    throw new Error(
      `저장된 레이아웃 문서 종류('${candidateObj.documentKind}')가 요청된 종류('${key.documentKind}')와 일치하지 않습니다.`
    );
  }
  if ("variant" in key && candidateObj.variant !== key.variant) {
    throw new Error(
      `저장된 레이아웃 변형('${candidateObj.variant}')이 요청된 변형('${key.variant}')과 일치하지 않습니다.`
    );
  }

  const definition = assertValidDocumentLayoutDefinition(candidate, "save");
  const capabilities = getDocumentLayoutCapabilities(definition);

  return {
    ...key,
    activeRevisionId: active.id,
    usingBuiltInDefault: false,
    updatedAt: active.updated_at ?? active.created_at,
    definition,
    capabilities
  };
};

export const getDocumentLayoutDefinitionByRevision = (
  key: DocumentLayoutKey,
  revisionId: string
): DocumentLayoutDefinition => {
  const database = ensureStorageReady();
  const storageKey = formatDocumentLayoutStorageKey(key);

  if (!isSupportedDocumentLayoutKey(storageKey)) {
    throw new Error(`지원하지 않거나 기본 정의가 없는 레이아웃 키입니다: ${storageKey}`);
  }

  const rows = database
    .prepare(`
      SELECT *
      FROM document_template_versions
      WHERE id = ? AND template_type = ? AND source_path = ''
    `)
    .all(revisionId, storageKey) as unknown as DocumentTemplateVersionRow[];

  if (rows.length === 0) {
    throw new Error(`해당 revisionId('${revisionId}')의 레이아웃 판을 찾을 수 없습니다: ${storageKey}`);
  }

  const row = rows[0]!;
  if (!row.profile_json) {
    throw new Error(`저장된 레이아웃 프로필 데이터가 비어 있습니다: ${revisionId}`);
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(row.profile_json);
  } catch {
    throw new Error(`저장된 레이아웃 JSON 데이터가 올바르지 않습니다: ${revisionId}`);
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`저장된 레이아웃 데이터가 객체 형식이 아닙니다: ${revisionId}`);
  }

  const candidateObj = candidate as { documentKind?: string; variant?: string };
  if (candidateObj.documentKind !== key.documentKind) {
    throw new Error(
      `저장된 레이아웃 문서 종류('${candidateObj.documentKind}')가 요청된 종류('${key.documentKind}')와 일치하지 않습니다.`
    );
  }
  if ("variant" in key && candidateObj.variant !== key.variant) {
    throw new Error(
      `저장된 레이아웃 변형('${candidateObj.variant}')이 요청된 변형('${key.variant}')과 일치하지 않습니다.`
    );
  }

  return assertValidDocumentLayoutDefinition(candidate, "save");
};


const executeLayoutMutation = (
  key: DocumentLayoutKey,
  definition: DocumentLayoutDefinition,
  expectedRevisionId: string | null,
  operation: "save" | "reset",
  changeReason?: string
): DocumentLayoutSnapshot => {
  const database = ensureStorageReady();
  const storageKey = formatDocumentLayoutStorageKey(key);

  if (!isSupportedDocumentLayoutKey(storageKey)) {
    throw new Error(`지원하지 않는 레이아웃 키입니다: ${storageKey}`);
  }

  // 트랜잭션 전 후보 정의 검증 (실패 시 mutation 0)
  const validDefinition = assertValidDocumentLayoutDefinition(definition, "save");

  const now = new Date().toISOString();
  const newRevisionId = randomUUID();

  database.exec("BEGIN");

  try {
    const existingRows = database
      .prepare(`
        SELECT *
        FROM document_template_versions
        WHERE template_type = ? AND source_path = ''
        ORDER BY created_at ASC, id ASC
      `)
      .all(storageKey) as unknown as DocumentTemplateVersionRow[];

    const activeRows = existingRows.filter((r) => r.is_default === 1);
    if (activeRows.length > 1) {
      throw new Error(`활성 레이아웃 판이 2개 이상 존재하여 수정할 수 없습니다: ${storageKey}`);
    }

    const currentActiveRevisionId = activeRows.length === 1 ? activeRows[0]!.id : null;

    if (expectedRevisionId !== currentActiveRevisionId) {
      throw new Error(
        `레이아웃 판 동시성 충돌이 발생했습니다. (기대 판: ${expectedRevisionId ?? "없음"}, 현재 활성 판: ${currentActiveRevisionId ?? "없음"})`
      );
    }

    const versionLabel = `v${existingRows.length + 1}`;

    // 이전 활성 판이 있으면 default 해제
    if (activeRows.length === 1) {
      database
        .prepare(`
          UPDATE document_template_versions
          SET is_default = 0, updated_at = ?
          WHERE id = ?
        `)
        .run(now, activeRows[0]!.id);
    }

    const validationPayload = {
      operation,
      ...(changeReason && changeReason.trim() ? { changeReason: changeReason.trim() } : {})
    };

    database
      .prepare(`
        INSERT INTO document_template_versions (
          id,
          template_type,
          version_label,
          source_path,
          status,
          is_default,
          output_file_name_pattern,
          profile_schema_version,
          profile_json,
          validation_json,
          checksum,
          created_at,
          updated_at,
          approved_at
        ) VALUES (
          ?, ?, ?, '', 'approved', 1, NULL, '1.0', ?, ?, NULL, ?, ?, ?
        )
      `)
      .run(
        newRevisionId,
        storageKey,
        versionLabel,
        JSON.stringify(validDefinition),
        JSON.stringify(validationPayload),
        now,
        now,
        now
      );

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const capabilities = getDocumentLayoutCapabilities(validDefinition);

  return {
    ...key,
    activeRevisionId: newRevisionId,
    usingBuiltInDefault: false,
    updatedAt: now,
    definition: validDefinition,
    capabilities
  };
};

export const saveDocumentLayout = (input: DocumentLayoutSaveInput): DocumentLayoutSnapshot => {
  const def = input.definition;
  const key: DocumentLayoutKey =
    def.documentKind === "schedule-xlsx"
      ? { documentKind: "schedule-xlsx", variant: def.variant! }
      : { documentKind: def.documentKind };

  return executeLayoutMutation(
    key,
    def,
    input.expectedRevisionId,
    "save",
    input.changeReason
  );
};

export const resetDocumentLayout = (input: DocumentLayoutResetInput): DocumentLayoutSnapshot => {
  const key: DocumentLayoutKey =
    input.documentKind === "schedule-xlsx"
      ? { documentKind: "schedule-xlsx", variant: input.variant }
      : { documentKind: input.documentKind };

  const defaultDefinition = getBuiltInDocumentLayoutDefinition(key);

  return executeLayoutMutation(
    key,
    defaultDefinition,
    input.expectedRevisionId,
    "reset",
    input.changeReason
  );
};

export const listDocumentLayoutHistory = (key: DocumentLayoutKey): DocumentLayoutHistoryRecord[] => {
  const database = ensureStorageReady();
  const storageKey = formatDocumentLayoutStorageKey(key);

  if (!isSupportedDocumentLayoutKey(storageKey)) {
    throw new Error(`지원하지 않는 레이아웃 키입니다: ${storageKey}`);
  }

  const rows = database
    .prepare(`
      SELECT *
      FROM document_template_versions
      WHERE template_type = ? AND source_path = ''
      ORDER BY CAST(SUBSTR(version_label, 2) AS INTEGER) DESC, created_at DESC, id DESC
    `)
    .all(storageKey) as unknown as DocumentTemplateVersionRow[];

  return rows.map((row) => {
    let changeReason: string | undefined;
    if (row.validation_json) {
      try {
        const parsed = JSON.parse(row.validation_json);
        if (parsed && typeof parsed.changeReason === "string" && parsed.changeReason.trim()) {
          changeReason = parsed.changeReason.trim();
        }
      } catch {
        // 무시
      }
    }

    return {
      ...key,
      revisionId: row.id,
      versionLabel: row.version_label,
      changeReason,
      createdAt: row.created_at,
      isActive: row.is_default === 1
    };
  });
};
