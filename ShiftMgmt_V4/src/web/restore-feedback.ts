import type { JsonDatabaseRestoreSummary } from "../shared/bridge/contracts";

const STORAGE_KEY = "shiftmgmt.restore-completed";
export interface RestoreCompletionNotice {
  completedAt: string;
  tableCount: number;
}
let pendingNotice: RestoreCompletionNotice | null = null;

/** 인증정보 없이 같은 탭의 복원 완료 안내만 재로그인까지 보존한다. */
export function rememberRestoreCompletion(summary: Pick<JsonDatabaseRestoreSummary, "completedAt" | "tableResults">): void {
  pendingNotice = { completedAt: summary.completedAt, tableCount: summary.tableResults.length };
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pendingNotice)); } catch { /* 저장소가 막힌 경우 현재 화면의 안내는 유지한다. */ }
}

export function getRestoreCompletion(): RestoreCompletionNotice | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch { return pendingNotice; }
  if (!raw) return pendingNotice = null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null &&
        "completedAt" in value && typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt)) &&
        "tableCount" in value && typeof value.tableCount === "number" && Number.isInteger(value.tableCount) && value.tableCount > 0) {
      return pendingNotice = { completedAt: value.completedAt, tableCount: value.tableCount };
    }
    clearRestoreCompletion();
    return null;
  } catch { clearRestoreCompletion(); return null; }
}

export function clearRestoreCompletion(): void {
  pendingNotice = null;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* 화면 내 안내도 함께 정리한다. */ }
}
