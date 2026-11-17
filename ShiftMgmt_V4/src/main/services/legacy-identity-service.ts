import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AuthSession } from "../../shared/domain/model";
import {
  LEGACY_IDENTITY_SETTING_KEY, isLegacyUnknownCode, parseLegacyIdentityRegistry, validateLegacyIdentityBindings,
  type LegacyIdentity, type LegacyIdentityRegistry, type LegacyIdentityResolveInput, type LegacyIdentitySummary, type LegacyIdentityTables
} from "../../shared/domain/legacy-identity";
import { getSqliteDatabase } from "./sqlite-storage-service";

type Row = Record<string, unknown>;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const boundTables = ["employees", "performance_entries", "performance_approvals", "allowance_calculations", "allowance_approvals"] as const;
const needDatabase = (): DatabaseSync => { const db = getSqliteDatabase(); if (!db) throw Error("데이터베이스를 먼저 열어 주세요."); return db; };
const registryFromDatabase = (db: DatabaseSync): LegacyIdentityRegistry | undefined => {
  const row = db.prepare("SELECT value FROM app_setting_entries WHERE setting_key=?").get(LEGACY_IDENTITY_SETTING_KEY);
  return row ? parseLegacyIdentityRegistry(JSON.parse(String(row.value))) : undefined;
};
const bindingTables = (db: DatabaseSync): LegacyIdentityTables => Object.fromEntries(boundTables.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all() as Row[]]));

/** Missing original workbooks must not make reviewed historical identities disappear. */
export function hasPreservedLegacyIdentityFile(fileId: string): boolean {
  const db = getSqliteDatabase();
  if (!db) return false;
  const ids = registryFromDatabase(db)?.identities.flatMap(identity => identity.entryIds) ?? [];
  if (!ids.length) return false;
  return Boolean(db.prepare(`SELECT 1 FROM performance_entries WHERE performance_file_id=? AND id IN (${ids.map(() => "?").join(",")}) LIMIT 1`).get(fileId, ...ids));
}

/** Only the caller's explicitly reviewed names are changed; no production database is opened. */
export function prepareLegacyIdentityBackup(input: {
  snapshot: { schemaVersion: number; createdAt: string; tables: LegacyIdentityTables };
  sourceSha256: string;
  names: string[];
  nowIso?: string;
}): { snapshot: typeof input.snapshot; registry: LegacyIdentityRegistry } {
  if (input.snapshot.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(input.sourceSha256)) throw Error("원본 V1 백업과 정확한 원본 해시를 지정해 주세요.");
  const names = input.names.map(name => name.trim());
  if (!names.length || names.some(name => !name) || new Set(names).size !== names.length) throw Error("검토한 인물 이름을 중복 없이 지정해 주세요.");
  const snapshot = structuredClone(input.snapshot), tables = snapshot.tables;
  if (tables.app_setting_entries.some(row => row.setting_key === LEGACY_IDENTITY_SETTING_KEY)) throw Error("이미 신원 연결을 준비한 백업입니다. 원본 백업을 사용해 주세요.");
  const registry: LegacyIdentityRegistry = { version: 1, sourceSha256: input.sourceSha256, createdAt: input.nowIso ?? new Date().toISOString(), identities: [] };
  for (const name of names) {
    const entries = tables.performance_entries.filter(row => row.employee_name === name && !String(row.employee_code ?? "").trim());
    if (!entries.length) throw Error(`${name}: 사번이 비어 있는 검토 대상 실적이 없습니다.`);
    const employees = tables.employees.filter(row => String(row.name).trim() === name && String(row.employee_code ?? "").trim());
    if (employees.length > 1) throw Error(`${name}: 동명이인이 있어 자동으로 사번을 연결할 수 없습니다.`);
    const employee = employees[0];
    const code = employee ? String(employee.employee_code) : `LEGACY-UNKNOWN-${digest(input.sourceSha256 + ":" + name).slice(0, 12).toUpperCase()}`;
    if (!employee && (tables.employees.some(row => row.employee_code === code) || tables.performance_entries.some(row => row.employee_code === code))) throw Error("미확인 번호가 기존 자료와 겹칩니다.");
    const identity: LegacyIdentity = {
      id: digest(input.sourceSha256 + ":identity:" + name).slice(0, 24), name, initialCode: code, currentCode: code,
      ...(employee ? { matchedEmployeeId: String(employee.id) } : {}),
      entryIds: entries.map(row => String(row.id)), approvalIds: [], calculationIds: [], allowanceReviewIds: [],
      originalApprovalSnapshots: [], logicalKeyChanges: []
    };
    const entryIds = new Set(identity.entryIds);
    const approvals = tables.performance_approvals.filter(row => entryIds.has(String(row.entry_id)));
    if (approvals.some(row => row.employee_name !== name || String(row.employee_code ?? "").trim())) throw Error(`${name}: 직접 연결된 승인 기록의 신원이 달라 검토가 필요합니다.`);
    for (const entry of entries) {
      const oldKey = String(entry.logical_key);
      const otherPersonSharesKey = tables.performance_entries.some(row => row.logical_key === oldKey && row.employee_name !== name) || tables.performance_approvals.some(row => row.logical_key === oldKey && row.employee_name !== name);
      if (otherPersonSharesKey) {
        // A workbook slot is not a person's identity. Keep different people in separate groups.
        if (approvals.some(row => row.entry_id === entry.id)) throw Error(`${name}: 승인된 실적의 식별값 충돌은 별도 검토가 필요합니다.`);
        entry.logical_key = `legacy-person:${identity.id}:${digest(oldKey).slice(0, 24)}`;
        identity.logicalKeyChanges.push({ entryId: String(entry.id), previousKey: oldKey, migratedKey: String(entry.logical_key) });
      }
      entry.employee_code = code;
    }
    const approvalIds = new Set(approvals.map(row => String(row.id)));
    for (const approval of approvals) {
      identity.originalApprovalSnapshots.push({ id: String(approval.id), snapshotJson: String(approval.snapshot_json) });
      const snapshot = JSON.parse(String(approval.snapshot_json));
      if (snapshot.entry?.employeeName !== name || snapshot.entry?.id !== approval.entry_id || String(snapshot.entry?.employeeCode ?? "").trim()) throw Error(`${name}: 승인 당시 인력 정보가 일치하지 않습니다.`);
      snapshot.entry.employeeCode = code;
      approval.employee_code = code;
      approval.snapshot_json = JSON.stringify(snapshot);
    }
    identity.approvalIds = [...approvalIds];
    const calculations = tables.allowance_calculations.filter(row => entryIds.has(String(row.performance_entry_id)) || approvalIds.has(String(row.performance_approval_id)));
    for (const calculation of calculations) {
      if (calculation.employee_name !== name || String(calculation.employee_code ?? "").trim()) throw Error(`${name}: 연결된 계산 기록의 신원이 일치하지 않습니다.`);
      // Calculation snapshots, amounts, rate versions and signatures are immutable.
      calculation.employee_code = code;
    }
    identity.calculationIds = calculations.map(row => String(row.id));
    const calculationIds = new Set(identity.calculationIds);
    const reviews = tables.allowance_approvals.filter(row => calculationIds.has(String(row.calculation_id)));
    for (const review of reviews) {
      if (review.employee_name !== name || String(review.employee_code ?? "").trim()) throw Error(`${name}: 수당 검토 기록의 신원이 일치하지 않습니다.`);
      review.employee_code = code;
    }
    identity.allowanceReviewIds = reviews.map(row => String(row.id));
    for (const file of tables.performance_files.filter(row => entries.some(entry => entry.performance_file_id === row.id))) {
      const preview = JSON.parse(String(file.preview_json ?? "[]"));
      let changed = false;
      if (Array.isArray(preview)) for (const row of preview) {
        if (String(row["직원명"] ?? row.employee_name ?? row.employeeName ?? "").trim() !== name) continue;
        for (const key of ["사번", "사원번호", "employee_code", "employeeCode"]) if (key in row && !String(row[key] ?? "").trim()) { row[key] = code; changed = true; }
      }
      if (changed) file.preview_json = JSON.stringify(preview);
    }
    registry.identities.push(identity);
  }
  validateLegacyIdentityBindings(parseLegacyIdentityRegistry(registry), tables);
  tables.app_setting_entries.push({ setting_key: LEGACY_IDENTITY_SETTING_KEY, value: JSON.stringify(registry), updated_at: registry.createdAt });
  return { snapshot, registry };
}

export function listLegacyIdentities(): LegacyIdentitySummary[] {
  return (registryFromDatabase(needDatabase())?.identities ?? []).map(identity => ({
    id: identity.id, name: identity.name, employeeCode: identity.currentCode, entryCount: identity.entryIds.length,
    approvedCount: identity.approvalIds.length, canResolve: isLegacyUnknownCode(identity.initialCode) && !identity.resolution,
    resolution: identity.resolution
  }));
}

export function resolveLegacyIdentity(input: LegacyIdentityResolveInput, actor: AuthSession | null | undefined): LegacyIdentitySummary[] {
  if (!actor || actor.role !== "admin") throw Error("관리자만 과거 기록의 사번을 연결할 수 있습니다.");
  if (!input || input.confirmationText !== "연결" || typeof input.employeeCode !== "string" || typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 500) throw Error("실제 사번과 연결 사유를 입력하고 ‘연결’을 확인해 주세요.");
  const db = needDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const registry = registryFromDatabase(db), identity = registry?.identities.find(row => row.id === input.identityId);
    if (!registry || !identity) throw Error("연결할 과거 인력 기록을 찾지 못했습니다.");
    if (!isLegacyUnknownCode(identity.initialCode) || identity.resolution) throw Error("이미 사번을 연결한 기록입니다. 사번 연결은 한 번만 가능합니다.");
    const code = input.employeeCode.trim();
    if (!code || isLegacyUnknownCode(code)) throw Error("미확인 번호 대신 등록된 실제 사번을 입력해 주세요.");
    const employee = db.prepare("SELECT id,name,employee_code,employment_type FROM employees WHERE employee_code=? AND deleted_at IS NULL").get(code);
    if (!employee || String(employee.name).trim() !== identity.name || String(employee.employment_type).includes("BP")) throw Error("같은 이름으로 등록된 실제 인력의 사번을 확인해 주세요. 인력 관리에서 먼저 등록할 수 있습니다.");
    validateLegacyIdentityBindings(registry, bindingTables(db));
    const mappings = [["performance_entries", identity.entryIds], ["performance_approvals", identity.approvalIds], ["allowance_calculations", identity.calculationIds], ["allowance_approvals", identity.allowanceReviewIds]] as const;
    for (const [table, ids] of mappings) for (const id of ids) {
      const result = db.prepare(`UPDATE ${table} SET employee_code=? WHERE id=? AND employee_code=? AND employee_name=?`).run(code, id, identity.currentCode, identity.name);
      if (Number(result.changes) !== 1) throw Error("연결 대상이 변경됐습니다. 화면을 새로 열어 확인해 주세요.");
    }
    for (const id of identity.approvalIds) {
      const row = db.prepare("SELECT snapshot_json FROM performance_approvals WHERE id=?").get(id)!;
      const snapshot = JSON.parse(String(row.snapshot_json));
      snapshot.entry.employeeCode = code;
      db.prepare("UPDATE performance_approvals SET snapshot_json=? WHERE id=?").run(JSON.stringify(snapshot), id);
    }
    const entryIds = new Set(identity.entryIds);
    const files = db.prepare("SELECT id,preview_json FROM performance_files").all();
    const fileIds = new Set((db.prepare("SELECT id,performance_file_id FROM performance_entries").all()).filter(row => entryIds.has(String(row.id))).map(row => String(row.performance_file_id)));
    for (const file of files.filter(row => fileIds.has(String(row.id)))) {
      const preview = JSON.parse(String(file.preview_json)), previous = identity.currentCode;
      let changed = false;
      if (Array.isArray(preview)) for (const row of preview) {
        if (String(row["직원명"] ?? row.employee_name ?? row.employeeName ?? "").trim() !== identity.name) continue;
        for (const key of ["사번", "사원번호", "employee_code", "employeeCode"]) if (row[key] === previous) { row[key] = code; changed = true; }
      }
      if (changed) db.prepare("UPDATE performance_files SET preview_json=? WHERE id=?").run(JSON.stringify(preview), file.id);
    }
    identity.currentCode = code;
    identity.resolution = { employeeId: String(employee.id), employeeCode: code, resolvedAt: new Date().toISOString(), actorUserId: actor.userId, actorName: actor.displayName, reason: input.reason.trim() };
    validateLegacyIdentityBindings(registry, bindingTables(db));
    db.prepare("UPDATE app_setting_entries SET value=?,updated_at=? WHERE setting_key=?").run(JSON.stringify(registry), identity.resolution.resolvedAt, LEGACY_IDENTITY_SETTING_KEY);
    db.exec("COMMIT");
    return listLegacyIdentities();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
