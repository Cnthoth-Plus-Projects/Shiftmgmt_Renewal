/** Identity-only exceptions for an explicitly reviewed, one-time legacy migration. */
export const LEGACY_IDENTITY_SETTING_KEY = "legacy_identity_mappings_json";
export const isLegacyUnknownCode = (value: string): boolean => value.startsWith("LEGACY-UNKNOWN-");

export interface LegacyIdentityResolution {
  employeeId: string;
  employeeCode: string;
  resolvedAt: string;
  actorUserId: string;
  actorName: string;
  reason: string;
}

export interface LegacyIdentity {
  id: string;
  name: string;
  initialCode: string;
  currentCode: string;
  matchedEmployeeId?: string;
  entryIds: string[];
  approvalIds: string[];
  calculationIds: string[];
  allowanceReviewIds: string[];
  originalApprovalSnapshots: Array<{ id: string; snapshotJson: string }>;
  logicalKeyChanges: Array<{ entryId: string; previousKey: string; migratedKey: string }>;
  resolution?: LegacyIdentityResolution;
}

export interface LegacyIdentityRegistry {
  version: 1;
  sourceSha256: string;
  createdAt: string;
  identities: LegacyIdentity[];
}

export interface LegacyIdentitySummary {
  id: string;
  name: string;
  employeeCode: string;
  entryCount: number;
  approvedCount: number;
  canResolve: boolean;
  resolution?: LegacyIdentityResolution;
}

export interface LegacyIdentityResolveInput {
  identityId: string;
  employeeCode: string;
  reason: string;
  confirmationText: string;
}

type Row = Record<string, unknown>;
export type LegacyIdentityTables = Record<string, Row[]>;
const fail = (): never => { throw new Error("과거 인력의 사번 연결 기록이 올바르지 않습니다. 원본 백업과 연결 내역을 확인해 주세요."); };
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : fail();
const text = (value: unknown): string => typeof value === "string" && value.trim() && value.length <= 1000 ? value : fail();
const date = (value: unknown): string => { const result = text(value); return Number.isFinite(Date.parse(result)) ? result : fail(); };
const ids = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 100000) return fail();
  const result = value.map(text);
  return new Set(result).size === result.length ? result : fail();
};

export function parseLegacyIdentityRegistry(value: unknown): LegacyIdentityRegistry {
  const root = object(value);
  if (root.version !== 1 || typeof root.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(root.sourceSha256) || !Array.isArray(root.identities) || root.identities.length > 1000) return fail();
  const identities = root.identities.map(raw => {
    const row = object(raw);
    const identity: LegacyIdentity = {
      id: text(row.id), name: text(row.name), initialCode: text(row.initialCode), currentCode: text(row.currentCode),
      entryIds: ids(row.entryIds), approvalIds: ids(row.approvalIds), calculationIds: ids(row.calculationIds), allowanceReviewIds: ids(row.allowanceReviewIds),
      originalApprovalSnapshots: [], logicalKeyChanges: []
    };
    if (row.matchedEmployeeId !== undefined) identity.matchedEmployeeId = text(row.matchedEmployeeId);
    if (!Array.isArray(row.originalApprovalSnapshots) || !Array.isArray(row.logicalKeyChanges)) return fail();
    identity.originalApprovalSnapshots = row.originalApprovalSnapshots.map(rawSnapshot => {
      const snapshot = object(rawSnapshot);
      if (typeof snapshot.snapshotJson !== "string") return fail();
      const parsed = object(JSON.parse(snapshot.snapshotJson));
      const entry = object(parsed.entry);
      if (entry.employeeName !== identity.name || String(entry.employeeCode ?? "").trim()) return fail();
      return { id: text(snapshot.id), snapshotJson: snapshot.snapshotJson };
    });
    if (identity.originalApprovalSnapshots.length !== identity.approvalIds.length || new Set(identity.originalApprovalSnapshots.map(s => s.id)).size !== identity.approvalIds.length || identity.originalApprovalSnapshots.some(s => !identity.approvalIds.includes(s.id))) return fail();
    identity.logicalKeyChanges = row.logicalKeyChanges.map(rawChange => {
      const change = object(rawChange), entryId = text(change.entryId);
      if (!identity.entryIds.includes(entryId)) return fail();
      return { entryId, previousKey: text(change.previousKey), migratedKey: text(change.migratedKey) };
    });
    if (row.resolution !== undefined) {
      const r = object(row.resolution);
      identity.resolution = { employeeId: text(r.employeeId), employeeCode: text(r.employeeCode), resolvedAt: date(r.resolvedAt), actorUserId: text(r.actorUserId), actorName: text(r.actorName), reason: text(r.reason) };
      if (!isLegacyUnknownCode(identity.initialCode) || isLegacyUnknownCode(identity.currentCode) || identity.resolution.employeeCode !== identity.currentCode) return fail();
    } else if (identity.currentCode !== identity.initialCode) return fail();
    if (!isLegacyUnknownCode(identity.initialCode) && !identity.matchedEmployeeId) return fail();
    return identity;
  });
  for (const values of [identities.map(i => i.id), identities.map(i => i.name), identities.map(i => i.initialCode)]) if (new Set(values).size !== values.length) return fail();
  for (const field of ["entryIds", "approvalIds", "calculationIds", "allowanceReviewIds"] as const) {
    const values = identities.flatMap(i => i[field]);
    if (new Set(values).size !== values.length) return fail();
  }
  return { version: 1, sourceSha256: root.sourceSha256, createdAt: date(root.createdAt), identities };
}

/** Validate the registry against the actual producer/reader rows, not just its shape. */
export function validateLegacyIdentityBindings(registry: LegacyIdentityRegistry, tables: LegacyIdentityTables): void {
  const mappings = [["performance_entries", "entryIds"], ["performance_approvals", "approvalIds"], ["allowance_calculations", "calculationIds"], ["allowance_approvals", "allowanceReviewIds"]] as const;
  for (const identity of registry.identities) {
    for (const [table, field] of mappings) {
      const indexed = new Map((tables[table] ?? []).map(row => [String(row.id), row]));
      for (const id of identity[field]) {
        const row = indexed.get(id);
        if (!row || row.employee_code !== identity.currentCode || row.employee_name !== identity.name) return fail();
      }
    }
    for (const snapshot of identity.originalApprovalSnapshots) {
      const row = tables.performance_approvals.find(row => row.id === snapshot.id)!;
      const current = object(JSON.parse(String(row.snapshot_json))), original = object(JSON.parse(snapshot.snapshotJson));
      const entry = object(current.entry), oldEntry = object(original.entry);
      if (entry.employeeCode !== identity.currentCode || entry.employeeName !== identity.name || entry.id !== oldEntry.id || !identity.entryIds.includes(String(row.entry_id))) return fail();
      entry.employeeCode = oldEntry.employeeCode;
      if (JSON.stringify(current) !== JSON.stringify(original)) return fail();
    }
    for (const change of identity.logicalKeyChanges) {
      if (tables.performance_entries.find(row => row.id === change.entryId)?.logical_key !== change.migratedKey) return fail();
    }
    const employeeId = identity.resolution?.employeeId ?? identity.matchedEmployeeId;
    // A later legitimate name correction must not invalidate an already audited link.
    if (employeeId && !(tables.employees ?? []).some(row => row.id === employeeId && row.employee_code === identity.currentCode)) return fail();
  }
}
