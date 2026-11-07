import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AuthSession } from "../../shared/domain/model";
import type { PerformanceCancellationHistoryRecord } from "../../shared/domain/performance-file";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

export const RETURN_HISTORY_TABLE = "performance_return_history";
export const RETURN_SNAPSHOT_TABLES = ["performance_files", "performance_entries", "performance_approvals", "allowance_calculations", "allowance_calculation_items", "allowance_approvals"] as const;
type Row = Record<string, unknown>;
export interface PerformanceReturnSnapshot {
  version: 1;
  actor: Pick<AuthSession, "userId" | "loginId" | "displayName" | "role">;
  tables: Record<typeof RETURN_SNAPSHOT_TABLES[number], Row[]>;
}
function fail(message: string): never { throw new Error("취소 보관 이력: " + message); }
const object = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Row, keys: readonly string[]) => {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) fail("기록 구성이 올바르지 않습니다.");
};
export const normalizeReturnReason = (reason: unknown): string => {
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) fail("승인대기로 돌리는 사유를 1~500자로 입력해 주세요.");
  return reason.trim();
};
export const parsePerformanceReturnSnapshot = (row: Row): PerformanceReturnSnapshot => {
  const raw = String(row.snapshot_json ?? "");
  if (createHash("sha256").update(raw).digest("hex") !== row.snapshot_sha256) fail("보관 내용의 해시가 일치하지 않습니다.");
  const value: unknown = JSON.parse(raw);
  if (!object(value)) fail("보관 내용이 객체가 아닙니다.");
  exact(value, ["version", "actor", "tables"]);
  if (value.version !== 1 || !object(value.actor) || !object(value.tables)) fail("지원하지 않는 보관 형식입니다.");
  exact(value.actor, ["userId", "loginId", "displayName", "role"]);
  const actor = value.actor;
  if (["userId", "loginId", "displayName"].some(key => typeof actor[key] !== "string" || !String(actor[key]).trim()) || !["reviewer", "admin"].includes(String(actor.role))) fail("취소 담당자 기록이 올바르지 않습니다.");
  if (value.actor.userId !== row.actor_user_id || value.actor.displayName !== row.actor_name) fail("취소 담당자 정보가 일치하지 않습니다.");
  if (normalizeReturnReason(row.reason) !== row.reason || typeof row.occurred_at !== "string" || !Number.isFinite(Date.parse(row.occurred_at)) || !String(row.id ?? "").trim()) fail("취소 사유나 시각이 올바르지 않습니다.");
  exact(value.tables, RETURN_SNAPSHOT_TABLES);
  const tables = value.tables as PerformanceReturnSnapshot["tables"];
  for (const name of RETURN_SNAPSHOT_TABLES) {
    const rows = tables[name];
    if (!Array.isArray(rows)) fail("원본 표의 행이 배열이 아닙니다.");
    const ids = new Set<string>();
    for (const item of rows) {
      if (!object(item) || typeof item.id !== "string" || !item.id || ids.has(item.id)) fail("원본 행 식별자가 없거나 중복되었습니다.");
      ids.add(item.id);
    }
  }
  if (tables.performance_files.length !== 1 || tables.performance_files[0].id !== row.file_id) fail("원본 파일 정보가 일치하지 않습니다.");
  if (tables.performance_files[0].directory_type !== "approved") fail("취소 전 파일은 승인완료 상태여야 합니다.");
  const fileId = row.file_id;
  if (tables.performance_entries.some(item => item.performance_file_id !== fileId) || tables.performance_approvals.some(item => item.file_id !== fileId)) fail("다른 파일의 실적 또는 승인이 포함되어 있습니다.");
  const approvalIds = new Set(tables.performance_approvals.map(item => item.id));
  for (const approval of tables.performance_approvals) {
    let snapshot: unknown;
    try { snapshot = approval.snapshot_json ? JSON.parse(String(approval.snapshot_json)) : null; } catch { snapshot = null; }
    // Old opaque snapshots remain raw; a present source identity must agree with its original approval.
    if (object(snapshot) && object(snapshot.entry)) {
      for (const [source, column] of [["id", "entry_id"], ["logicalKey", "logical_key"], ["employeeCode", "employee_code"], ["workDate", "work_date"]]) {
        if (typeof snapshot.entry[source] === "string" && snapshot.entry[source] !== approval[column]) fail("승인 스냅샷과 원본 실적 식별자가 일치하지 않습니다.");
      }
      if (typeof snapshot.fileId === "string" && snapshot.fileId !== fileId) fail("승인 스냅샷의 파일이 일치하지 않습니다.");
    }
  }
  const calculationIds = new Set(tables.allowance_calculations.map(item => item.id));
  if (tables.allowance_calculations.some(item => item.file_id !== fileId || !approvalIds.has(item.performance_approval_id))) fail("계산과 원본 승인의 연결이 올바르지 않습니다.");
  for (const calc of tables.allowance_calculations) {
    const approval = tables.performance_approvals.find(item => item.id === calc.performance_approval_id)!;
    if (calc.performance_entry_id && calc.performance_entry_id !== approval.entry_id) fail("계산과 승인 대상 실적이 일치하지 않습니다.");
  }
  if (tables.allowance_calculation_items.some(item => !calculationIds.has(item.calculation_id)) || tables.allowance_approvals.some(item => !calculationIds.has(item.calculation_id))) fail("계산 항목 또는 검토 이력의 연결이 올바르지 않습니다.");
  return value as unknown as PerformanceReturnSnapshot;
};

/** The caller owns the same transaction that removes active approvals and recalculates pending wages. */
export const archivePerformanceReturn = (database: DatabaseSync, fileId: string, actor: AuthSession, reason: string): string => {
  const select = (table: string, where: string, value: string) => database.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(value) as Row[];
  const tables: PerformanceReturnSnapshot["tables"] = {
    performance_files: select("performance_files", "id = ?", fileId),
    performance_entries: select("performance_entries", "performance_file_id = ?", fileId),
    performance_approvals: select("performance_approvals", "file_id = ?", fileId),
    allowance_calculations: select("allowance_calculations", "performance_approval_id IN (SELECT id FROM performance_approvals WHERE file_id = ?)", fileId),
    allowance_calculation_items: select("allowance_calculation_items", "calculation_id IN (SELECT id FROM allowance_calculations WHERE performance_approval_id IN (SELECT id FROM performance_approvals WHERE file_id = ?))", fileId),
    allowance_approvals: select("allowance_approvals", "calculation_id IN (SELECT id FROM allowance_calculations WHERE performance_approval_id IN (SELECT id FROM performance_approvals WHERE file_id = ?))", fileId)
  };
  const payload: PerformanceReturnSnapshot = { version: 1, actor: { userId: actor.userId, loginId: actor.loginId, displayName: actor.displayName, role: actor.role }, tables };
  const snapshot = JSON.stringify(payload);
  const row = { id: randomUUID(), file_id: fileId, occurred_at: new Date().toISOString(), actor_user_id: actor.userId, actor_name: actor.displayName, reason: normalizeReturnReason(reason), snapshot_json: snapshot, snapshot_sha256: createHash("sha256").update(snapshot).digest("hex") };
  parsePerformanceReturnSnapshot(row);
  database.prepare(`INSERT INTO performance_return_history(id,file_id,occurred_at,actor_user_id,actor_name,reason,snapshot_json,snapshot_sha256) VALUES(?,?,?,?,?,?,?,?)`).run(row.id, row.file_id, row.occurred_at, row.actor_user_id, row.actor_name, row.reason, row.snapshot_json, row.snapshot_sha256);
  return row.id;
};

export const listPerformanceReturnHistoryForFile = (fileId: string): PerformanceCancellationHistoryRecord[] => {
  const database = getSqliteDatabase();
  if (!database || !isSqliteStorageReady()) return [];
  const rows = database.prepare(`SELECT h.* FROM performance_return_history h WHERE h.file_id = ? OR EXISTS (
    SELECT 1 FROM json_each(h.snapshot_json, '$.tables.performance_approvals') a
    JOIN performance_entries e ON e.logical_key = json_extract(a.value, '$.logical_key') WHERE e.performance_file_id = ?
  ) ORDER BY occurred_at DESC, rowid DESC`).all(fileId, fileId) as Row[];
  return rows.map(row => {
    const { tables } = parsePerformanceReturnSnapshot(row);
    return {
      id: String(row.id), fileId: String(row.file_id), fileName: String(tables.performance_files[0].file_name), occurredAt: String(row.occurred_at), actorName: String(row.actor_name), reason: String(row.reason),
      entries: tables.performance_approvals.map(approval => ({
        approvalId: String(approval.id), logicalKey: String(approval.logical_key ?? ""), entryId: String(approval.entry_id), employeeCode: String(approval.employee_code ?? ""), employeeName: String(approval.employee_name ?? ""), workDate: String(approval.work_date ?? ""), approvedAt: String(approval.processed_at), approvedBy: String(approval.processed_by_name), approvalSnapshotJson: typeof approval.snapshot_json === "string" ? approval.snapshot_json : undefined,
        calculations: tables.allowance_calculations.filter(calc => calc.performance_approval_id === approval.id).map(calc => ({
          id: String(calc.id), hourlyRate: Number(calc.hourly_rate ?? 0), rateVersionId: String(calc.rate_version_id), rateVersionLabel: String(calc.rate_version_label), totalAmount: Number(calc.total_allowance_amount), status: String(calc.status), snapshotJson: String(calc.snapshot_json),
          items: tables.allowance_calculation_items.filter(item => item.calculation_id === calc.id).map(item => ({ allowanceCode: String(item.allowance_code), workMinutes: Number(item.work_minutes), multiplier: Number(item.multiplier), amount: Number(item.amount) })),
          reviews: tables.allowance_approvals.filter(item => item.calculation_id === calc.id).map(item => ({ decision: String(item.decision), processedAt: String(item.processed_at), processedBy: String(item.processed_by_name), comment: typeof item.comment === "string" ? item.comment : undefined }))
        }))
      }))
    };
  });
};
