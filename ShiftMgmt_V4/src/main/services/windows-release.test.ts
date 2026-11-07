import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const verifier = path.resolve("scripts/verify-windows-package.mjs");
const required = ["runtime/node.exe", "START.cmd", "INSTALL.cmd", "scripts/fresh-install.ps1", "scripts/start-installed.mjs", "dist/server/main/server.js", "dist/browser/web/app.js", "licenses/Node-LICENSE.txt", "VERSION", "package.json"];
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-package-test-"));
  roots.push(root);
  const files = required.map(member => {
    const full = path.join(root, member);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, member === "VERSION" ? "1.0.0" : member === "package.json" ? JSON.stringify({ version: "1.0.0" }) : "fixture bytes");
    const bytes = readFileSync(full);
    return { path: member, bytes: bytes.length, sha256: hash(bytes) };
  });
  const manifest = { schemaVersion: 1, version: "1.0.0", platform: "win32", arch: "x64", nodeVersion: "v24.19.0", files };
  const save = () => writeFileSync(path.join(root, "PACKAGE_MANIFEST.json"), JSON.stringify(manifest));
  save();
  return { root, manifest, save };
};
const check = (root: string, ...args: string[]) => spawnSync(process.execPath, [verifier, root, ...args], { encoding: "utf8" });
afterEach(() => { for (const root of roots.splice(0)) { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error("unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });

describe("Windows release package integrity", () => {
  it("accepts a complete package", () => { expect(check(fixture().root).status).toBe(0); });
  it("rejects changed bytes", () => { const { root } = fixture(); writeFileSync(path.join(root, "START.cmd"), "tampered"); expect(check(root).status).toBe(1); });
  it("rejects missing files", () => { const { root } = fixture(); rmSync(path.join(root, "START.cmd")); expect(check(root).status).toBe(1); });
  it("rejects extra private credentials", () => { const { root } = fixture(); writeFileSync(path.join(root, "bootstrap-credentials.json"), "{}"); expect(check(root).status).toBe(1); });
  it("rejects traversal before reading external bytes", () => { const f = fixture(); f.manifest.files[0].path = "../outside"; f.save(); const r = check(f.root); expect(r.status).toBe(1); expect(r.stderr).toContain("경로"); });
  it("rejects case-insensitive duplicate manifest entries", () => { const f = fixture(); f.manifest.files.push({ ...f.manifest.files[0], path: "RUNTIME/NODE.EXE" }); f.save(); expect(check(f.root).status).toBe(1); });
  it("allows only installation metadata in installed mode", () => { const { root } = fixture(); writeFileSync(path.join(root, "installation.json"), "{}"); expect(check(root).status).toBe(1); expect(check(root, "--installed").status).toBe(0); writeFileSync(path.join(root, "extra.txt"), "unknown"); expect(check(root, "--installed").status).toBe(1); });
  it("rejects inconsistent package versions even with valid hashes", () => { const f = fixture(); const file = path.join(f.root, "VERSION"); writeFileSync(file, "9.0.0"); const entry = f.manifest.files.find(x => x.path === "VERSION")!; entry.bytes = 5; entry.sha256 = hash(readFileSync(file)); f.save(); expect(check(f.root).status).toBe(1); });
});
