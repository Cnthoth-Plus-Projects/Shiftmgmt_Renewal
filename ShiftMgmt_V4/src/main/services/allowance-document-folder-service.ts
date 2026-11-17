import path from "node:path";
import { statSync } from "node:fs";
import type { AllowanceDocumentFolderInput, BridgeResult } from "../../shared/bridge/contracts";
import { listStoredAllowanceDocumentExports } from "./allowance-document-export-history-service";

/** Only saved outputs can be opened; the caller never supplies a filesystem path. */
export async function openAllowanceDocumentFolder(input: AllowanceDocumentFolderInput, options: { openFolder: (folder: string) => Promise<boolean> }): Promise<BridgeResult<null>> {
  const fail = (message: string): BridgeResult<null> => ({ ok: false, errorCode: "ALLOWANCE_DOCUMENT_FOLDER_FAILED", message });
  if (!input || typeof input.exportId !== "string" || !input.exportId.trim() || !["proposal", "attachment1", "attachment2"].includes(input.documentKind)) return fail("열 문서를 확인할 수 없습니다. 출력 이력을 다시 조회해 주세요.");
  const record = listStoredAllowanceDocumentExports().find(row => row.id === input.exportId);
  if (!record) return fail("문서 출력 이력을 찾지 못했습니다. 목록을 새로고침해 주세요.");
  const file = { proposal: record.proposalPath, attachment1: record.attachment1Path, attachment2: record.attachment2Path }[input.documentKind];
  if (!file || !path.isAbsolute(file)) return fail("저장된 문서 경로가 올바르지 않습니다. 출력 이력을 확인해 주세요.");
  const folder = path.dirname(file);
  try {
    if (!statSync(folder).isDirectory()) return fail("저장 폴더를 찾지 못했습니다. 경로 복사로 위치를 확인해 주세요.");
    if (!await options.openFolder(folder)) return fail("폴더를 열지 못했습니다. 경로 복사로 위치를 확인해 주세요.");
    return { ok: true, data: null };
  } catch { return fail("저장 폴더에 접근할 수 없습니다. 폴더가 이동되었는지 또는 접근 권한이 있는지 확인해 주세요."); }
}
