import { mkdtempSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AllowanceDocumentExportRecord } from "../../shared/domain/allowance-document";
import { openAllowanceDocumentFolder } from "./allowance-document-folder-service";

const mock = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./allowance-document-export-history-service", () => ({ listStoredAllowanceDocumentExports: mock.list }));
const root = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-folder-test-"));
const record = { id: "export-1", proposalPath: path.join(root, "proposal", "document.pdf"), attachment1Path: path.join(root, "one", "a.xlsx"), attachment2Path: path.join(root, "two", "b.xlsx") } as AllowanceDocumentExportRecord;
for (const folder of ["proposal", "one", "two"]) mkdirSync(path.join(root, folder));
describe("saved output folder opening", () => {
  beforeEach(() => mock.list.mockReturnValue([record]));
  it.each(["proposal", "attachment1", "attachment2"] as const)("opens %s parent even if the document itself is missing", async documentKind => {
    const openFolder = vi.fn(async () => true);
    expect(await openAllowanceDocumentFolder({ exportId: record.id, documentKind }, { openFolder })).toEqual({ ok: true, data: null });
    expect(openFolder).toHaveBeenCalledWith(path.dirname(record[`${documentKind}Path`]));
  });
  it("rejects stale IDs and invalid kinds without opening anything", async () => {
    const openFolder = vi.fn(async () => true);
    expect((await openAllowanceDocumentFolder({ exportId: "missing", documentKind: "proposal" }, { openFolder })).ok).toBe(false);
    expect((await openAllowanceDocumentFolder({ exportId: record.id, documentKind: "../../other" } as never, { openFolder })).ok).toBe(false);
    expect(openFolder).not.toHaveBeenCalled();
  });
  it("ignores an arbitrary caller path and resolves the stored history", async () => {
    const openFolder = vi.fn(async () => true);
    await openAllowanceDocumentFolder({ exportId: record.id, documentKind: "proposal", path: "C:/unrelated" } as never, { openFolder });
    expect(openFolder).toHaveBeenCalledWith(path.dirname(record.proposalPath));
  });
  it("reports missing directories and OS failures without success", async () => {
    const openFolder = vi.fn(async () => false);
    expect((await openAllowanceDocumentFolder({ exportId: record.id, documentKind: "proposal" }, { openFolder })).ok).toBe(false);
    mock.list.mockReturnValue([{ ...record, proposalPath: path.join(root, "missing", "file.pdf") }]);
    expect((await openAllowanceDocumentFolder({ exportId: record.id, documentKind: "proposal" }, { openFolder })).ok).toBe(false);
  });
});
