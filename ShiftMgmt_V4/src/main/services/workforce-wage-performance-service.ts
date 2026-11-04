import { createHash } from "node:crypto";
import { realpath, readFile } from "node:fs/promises";
import path from "node:path";
import type { WagePendingPerformanceRefresh } from "../../shared/bridge/contracts";
import { isPayablePerformanceEntry } from "../../shared/domain/performance-file";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { listStoredEmployees } from "./employee-storage-service";
import { listStoredEmployeeWageRates } from "./employee-history-service";
import { getLatestPerformanceApprovalByLogicalKey } from "./performance-approval-service";
import { getLatestAllowanceCalculationByApprovalId } from "./approved-allowance-calculation-service";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";
import { buildPerformanceFileDetailFromPath, invalidatePerformanceWageContext } from "./performance-file-intake-service";
import { getStoredPerformanceFileDetail, listStoredPerformanceFileDetails, upsertPerformanceFileDetail } from "./performance-file-storage-service";
import { getSqliteDatabase, getSqliteStorageContext } from "./sqlite-storage-service";

interface WageChange { id?: string; employeeId: string; effectiveFrom: string; employmentFrom?: string }
const inside = (file: string, directory: string) => {
  const relative = path.relative(directory, file);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
};
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Wage storage commits first. A refresh failure never undoes a successfully saved wage. */
export const refreshPendingPerformanceForWageChanges = async (
  changes: WageChange[]
): Promise<WagePendingPerformanceRefresh> => {
  const result: WagePendingPerformanceRefresh = { status: "completed", affectedEntryCount: 0, targetFileCount: 0, refreshedFileCount: 0, issues: [] };
  const issue = (fileName: string, message: string) => { result.status = "partial"; result.issues.push({ fileName, message }); };
  if (!changes.length) return result;
  invalidatePerformanceWageContext();
  try {
    const employees = listStoredEmployees({ includeDeleted: true, includeHistoricalAssignments: true });
    const ranges = changes.flatMap(change => {
      const employee = employees.find(e => e.id === change.employeeId);
      const rate = employee && listStoredEmployeeWageRates(employee.id).find(r => change.id ? r.id === change.id : r.effectiveFrom === change.effectiveFrom);
      if (!employee || !rate && !change.employmentFrom) { issue("시급 정보", "저장된 직원 또는 적용 기간을 확인하지 못했습니다. 실적 관리에서 다시 읽어 주세요."); return []; }
      return [{ employeeId: employee.id, code: employee.employeeCode, from: change.employmentFrom ?? rate!.effectiveFrom, to: change.employmentFrom ? undefined : rate!.effectiveTo }];
    });
    if (!ranges.length) return result;
    const keys = new Set<string>();
    const targets = listStoredPerformanceFileDetails({ directoryTypes: ["pending"] }).filter(detail => {
      let affected = false;
      for (const entry of detail.entries) {
        if (!isPayablePerformanceEntry(entry) || !ranges.some(r => r.code === entry.employeeCode && entry.workDate >= r.from && (!r.to || entry.workDate <= r.to))) continue;
        const latest = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
        if (latest?.decision === "approved" && (getLatestAllowanceCalculationByApprovalId(latest.id)?.status === "proposal-approved" || resolvePerformanceEntryApprovalState({ entry, latestApproval: latest }).satisfied)) continue;
        keys.add(entry.logicalKey); affected = true;
      }
      return affected;
    });
    result.affectedEntryCount = keys.size; result.targetFileCount = targets.length;
    if (!targets.length) return result;
    const context = getSqliteStorageContext();
    if (!context) throw new Error("실적 저장소가 연결되지 않았습니다.");
    const settings = getStoredAppSettingsSnapshot({ userDataPath: context.userDataPath ?? process.cwd(), env: context.env });
    const originalDatabase = getSqliteDatabase();
    const hasCurrentStorage = () => {
      if (getSqliteDatabase() !== originalDatabase) return false;
      const currentSettings = getStoredAppSettingsSnapshot({ userDataPath: context.userDataPath ?? process.cwd(), env: context.env });
      return currentSettings.pendingDir === settings.pendingDir && currentSettings.approvedDir === settings.approvedDir;
    };
    const pendingRoot = await realpath(settings.pendingDir);
    const approvedRoot = await realpath(settings.approvedDir).catch(() => path.resolve(settings.approvedDir));
    const wageBinding = () => JSON.stringify([...new Set(ranges.map(r => r.employeeId))].sort().map(id => {
      const employee = changes.some(c => c.employeeId === id && c.employmentFrom) ? listStoredEmployees({ includeDeleted:true,includeHistoricalAssignments:true }).find(e => e.id === id) : undefined;
      return { rates:listStoredEmployeeWageRates(id), ...(employee ? { employment:{ status:employee.status,hireDate:employee.hireDate,retireDate:employee.retireDate,employmentPeriods:employee.employmentPeriods } } : {}) };
    }));
    for (const target of targets) {
      try {
        if (!hasCurrentStorage()) throw new Error("저장소 또는 실적 폴더 설정이 변경되었습니다. 실적 관리에서 다시 읽어 주세요.");
        const physicalPath = await realpath(target.filePath);
        if (!inside(physicalPath, pendingRoot) || inside(physicalPath, approvedRoot)) throw new Error("승인대기 폴더 안의 원본 파일이 아닙니다.");
        const before = getStoredPerformanceFileDetail(target.id);
        if (!before || before.directoryType !== "pending" || path.resolve(before.filePath) !== path.resolve(target.filePath)) throw new Error("파일 상태가 변경되었습니다. 실적 관리에서 다시 확인해 주세요.");
        const storedBinding = JSON.stringify(before), rates = wageBinding();
        const bytes = digest(await readFile(physicalPath));
        if (!hasCurrentStorage()) throw new Error("저장소 또는 실적 폴더 설정이 변경되었습니다. 실적 관리에서 다시 읽어 주세요.");
        const parsed = await buildPerformanceFileDetailFromPath({ filePath: target.filePath, settings, forceReparse: true });
        if (!parsed || parsed.status === "error" || parsed.errorMessage || !parsed.entries.length) throw new Error(parsed?.errorMessage || "원본 파일을 다시 읽지 못했습니다. 이전 실적 자료를 유지했습니다.");
        const afterPath = await realpath(target.filePath);
        const afterBytes = digest(await readFile(afterPath));
        const current = getStoredPerformanceFileDetail(target.id);
        if (!hasCurrentStorage() || afterPath !== physicalPath || afterBytes !== bytes || wageBinding() !== rates || JSON.stringify(current) !== storedBinding || current?.directoryType !== "pending" || parsed.id !== target.id || parsed.directoryType !== "pending") {
          throw new Error("읽는 동안 원본·시급 또는 승인 상태가 변경되었습니다. 최신 자료를 유지했으니 실적 관리에서 다시 읽어 주세요.");
        }
        const database = originalDatabase;
        if (!database) throw new Error("실적 저장소가 연결되지 않았습니다.");
        database.exec("SAVEPOINT w06_pending_refresh");
        try {
          upsertPerformanceFileDetail(parsed);
          database.exec("RELEASE w06_pending_refresh");
        } catch (error) {
          database.exec("ROLLBACK TO w06_pending_refresh");
          database.exec("RELEASE w06_pending_refresh");
          throw error;
        }
        result.refreshedFileCount += 1;
      } catch (error) {
        issue(target.fileName, error instanceof Error ? error.message : "파일 재읽기에 실패했습니다. 이전 자료를 유지했습니다.");
      }
    }
  } catch (error) {
    issue("대기 실적", error instanceof Error ? error.message : "대기 실적 재읽기를 완료하지 못했습니다.");
  }
  return result;
};
