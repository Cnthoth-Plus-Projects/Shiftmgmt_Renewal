import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const loadUpdater = () => import(pathToFileURL(path.resolve("scripts/lib/installed-update.mjs")).href);
const compatibility = "c".repeat(64), sourceCommit = "a".repeat(40);
const updateFixture = () => {
  const f = fixture(), dataRoot = f.root + "-data", cache = f.root + "-updates";
  roots.push(dataRoot, cache); mkdirSync(dataRoot);
  writeFileSync(path.join(dataRoot, "preserve.txt"), "existing approved data");
  const manifest = { ...f.manifest, version: "1.0.4", autoUpdate: { protocolVersion: 1, dataCompatibility: compatibility } };
  const config = { version: "1.0.4", dataRoot };
  const archiveBytes = Buffer.from("reviewed fake archive transport");
  const asset = { name: "ShiftMgmt-1.0.5-win-x64.zip", size: archiveBytes.length, digest: "sha256:" + hash(archiveBytes), browser_download_url: "https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/download/v1.0.5/ShiftMgmt-1.0.5-win-x64.zip" };
  const release = { tag_name: "v1.0.5", draft: false, prerelease: false, target_commitish: sourceCommit, assets: [asset] };
  const future = fixture();
  const next = { ...future.manifest, version: "1.0.5", sourceCommit, autoUpdate: manifest.autoUpdate, files: [...future.manifest.files] };
  for (const [member, bytes] of [["VERSION", "1.0.5"], ["package.json", JSON.stringify({ version: "1.0.5" })], ["scripts/lib/installed-update.mjs", "reviewed updater source"]]) {
    const full = path.join(future.root, member); mkdirSync(path.dirname(full), { recursive: true }); writeFileSync(full, bytes);
    const value = readFileSync(full), entry = { path: member, bytes: value.length, sha256: hash(value) }, index = next.files.findIndex(x => x.path === member);
    if (index < 0) next.files.push(entry); else next.files[index] = entry;
  }
  const saveNext = () => writeFileSync(path.join(future.root, "PACKAGE_MANIFEST.json"), JSON.stringify(next)); saveNext();
  const unpack = vi.fn(async (_zip: string, destination: string, name: string) => { cpSync(future.root, path.join(destination, name), { recursive: true }); });
  const fetchImpl = vi.fn(async (url: string) => new Response(url.includes("api.github.com") ? JSON.stringify(release) : archiveBytes));
  const input = { root: f.root, config, manifest, fetchImpl, unpack, log: vi.fn() };
  return { ...f, input, dataRoot, cache, archiveBytes, asset, release, future, next, saveNext, unpack, fetchImpl };
};

describe("Installed startup automatic updates", () => {
  it("compares numeric versions and rejects preview, malformed and unsafe integers", async () => {
    const u = await loadUpdater();
    expect(u.isNewerVersion("1.0.10", "1.0.9")).toBe(true);
    for (const version of ["1.0.4", "1.0.3", "1.0.5-beta", "01.0.5", "999999999999999999999.0.0"]) expect(u.isNewerVersion(version, "1.0.4")).toBe(false);
  });

  it.each(["draft", "preview", "repository", "digest", "size", "duplicate", "branch", "downgrade"])("rejects %s release metadata before downloading", async reason => {
    const u = await loadUpdater(), f = updateFixture();
    if (reason === "draft") f.release.draft = true;
    if (reason === "preview") f.release.prerelease = true;
    if (reason === "repository") f.asset.browser_download_url = "https://example.com/arbitrary.zip";
    if (reason === "digest") f.asset.digest = "missing";
    if (reason === "size") f.asset.size = 201 * 1024 * 1024;
    if (reason === "duplicate") f.release.assets.push(f.asset);
    if (reason === "branch") f.release.target_commitish = "main";
    if (reason === "downgrade") f.release.tag_name = "v1.0.3";
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull();
    expect(f.fetchImpl).toHaveBeenCalledTimes(1); expect(f.unpack).not.toHaveBeenCalled(); expect(existsSync(f.cache)).toBe(false);
  });

  it("keeps the current executable and data when offline", async () => {
    const u = await loadUpdater(), f = updateFixture(), before = readFileSync(path.join(f.root, "PACKAGE_MANIFEST.json"));
    f.fetchImpl.mockRejectedValue(new Error("offline"));
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull();
    expect(readFileSync(path.join(f.root, "PACKAGE_MANIFEST.json")).equals(before)).toBe(true);
    expect(readFileSync(path.join(f.dataRoot, "preserve.txt"), "utf8")).toBe("existing approved data");
    expect(existsSync(f.cache)).toBe(false);
  });

  it("rejects download redirects outside official release hosts", async () => {
    const u = await loadUpdater(), f = updateFixture();
    f.fetchImpl.mockImplementation(async (url: string) => {
      if (url.includes("api.github.com")) return new Response(JSON.stringify(f.release));
      const response = new Response(f.archiveBytes); Object.defineProperty(response, "url", { value: "https://example.com/payload.zip" }); return response;
    });
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull(); expect(f.unpack).not.toHaveBeenCalled();
  });

  it.each(["hash", "short-download", "manifest", "source", "database"])("does not activate a %s mismatch", async reason => {
    const u = await loadUpdater(), f = updateFixture();
    if (reason === "hash") f.asset.digest = "sha256:" + "0".repeat(64);
    if (reason === "short-download") f.asset.size += 1;
    if (reason === "manifest") writeFileSync(path.join(f.future.root, "START.cmd"), "tampered");
    if (reason === "source") { f.next.sourceCommit = "b".repeat(40); f.saveNext(); }
    if (reason === "database") { f.next.autoUpdate = { protocolVersion: 1, dataCompatibility: "d".repeat(64) }; f.saveNext(); }
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull();
    expect(existsSync(path.join(f.cache, "active.json"))).toBe(false);
    expect(readdirSync(f.cache).some(name => name.startsWith("stage-"))).toBe(false);
    expect(readFileSync(path.join(f.dataRoot, "preserve.txt"), "utf8")).toBe("existing approved data");
  });

  it("stages a verified version without activation, then reuses the healthy version offline", async () => {
    const u = await loadUpdater(), f = updateFixture(), update = await u.resolveInstalledUpdate(f.input);
    expect(update?.version).toBe("1.0.5"); expect(f.unpack).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(f.cache, "active.json"))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(update.root, "installation.json"), "utf8"))).toEqual({ version: "1.0.5", dataRoot: f.dataRoot });
    u.activateInstalledUpdate(update);
    f.fetchImpl.mockRejectedValue(new Error("offline"));
    expect((await u.resolveInstalledUpdate(f.input))?.root).toBe(update.root);
    expect(readFileSync(path.join(f.dataRoot, "preserve.txt"), "utf8")).toBe("existing approved data");
  });

  it("does not retry a version whose startup was rejected", async () => {
    const u = await loadUpdater(), f = updateFixture(), update = await u.resolveInstalledUpdate(f.input);
    u.rejectInstalledUpdate(update); f.fetchImpl.mockClear();
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull(); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(f.cache, "active.json"))).toBe(false);
  });

  it("rejects a corrupted cached package instead of launching it offline", async () => {
    const u = await loadUpdater(), f = updateFixture(), update = await u.resolveInstalledUpdate(f.input);
    u.activateInstalledUpdate(update); writeFileSync(path.join(update.root, "START.cmd"), "corrupted");
    f.fetchImpl.mockRejectedValue(new Error("offline"));
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull();
  });

  it("does not follow an update cache junction outside the installation", async () => {
    const u = await loadUpdater(), f = updateFixture(), outside = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-update-outside-")); roots.push(outside);
    symlinkSync(outside, f.cache, "junction");
    expect(await u.resolveInstalledUpdate(f.input)).toBeNull(); expect(readdirSync(outside)).toEqual([]);
    rmSync(f.cache); // remove only the junction itself before ordinary owned-directory cleanup
  });

  it("returns an unsuccessful startup when the replacement runtime is absent", async () => {
    const u = await loadUpdater(), f = updateFixture();
    expect((await u.runUpdatedLauncher({ root: path.join(f.root, "missing"), cache: f.cache }, { timeoutMs: 1000, log: vi.fn() })).started).toBe(false);
  });

  it.each(["../escape.txt", "ShiftMgmt-1.0.5-win-x64/../../escape.txt", "ShiftMgmt-1.0.5-win-x64/dir/../escape.txt", "other-root/file.txt", "ShiftMgmt-1.0.5-win-x64/CON.txt", "ShiftMgmt-1.0.5-win-x64\\..\\..\\escape.txt"])("rejects unsafe archive member %s before extraction", async member => {
    const u = await loadUpdater(), f = fixture(), zip = path.join(f.root, "unsafe.zip"), dest = path.join(f.root, "unpacked");
    const script = String.raw`Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open($env:SM_TEST_ZIP,'Create');try{$e=$z.CreateEntry($env:SM_TEST_ENTRY);$s=New-Object IO.StreamWriter($e.Open());$s.Write('unsafe');$s.Dispose()}finally{$z.Dispose()}`;
    const made = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { env: { ...process.env, SM_TEST_ZIP: zip, SM_TEST_ENTRY: member }, windowsHide: true, encoding: "utf8" });
    expect(made.status, made.stderr).toBe(0);
    expect(() => u.unpackUpdateZip(zip, dest, "ShiftMgmt-1.0.5-win-x64")).toThrow(); expect(existsSync(dest)).toBe(false);
  });

  it("extracts a valid archive through the actual Windows reader", async () => {
    const u = await loadUpdater(), f = fixture(), zip = path.join(f.root, "valid.zip"), dest = path.join(f.root, "unpacked");
    const script = String.raw`Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open($env:SM_TEST_ZIP,'Create');try{$e=$z.CreateEntry('ShiftMgmt-1.0.5-win-x64/VERSION');$s=New-Object IO.StreamWriter($e.Open());$s.Write('1.0.5');$s.Dispose()}finally{$z.Dispose()}`;
    const made = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { env: { ...process.env, SM_TEST_ZIP: zip }, windowsHide: true, encoding: "utf8" });
    expect(made.status, made.stderr).toBe(0); u.unpackUpdateZip(zip, dest, "ShiftMgmt-1.0.5-win-x64");
    expect(readFileSync(path.join(dest, "ShiftMgmt-1.0.5-win-x64/VERSION"), "utf8")).toBe("1.0.5");
  });

  it("accepts the backslash entries produced by Windows Compress-Archive", async () => {
    const u = await loadUpdater(), f = fixture(), source = path.join(f.root, "ShiftMgmt-1.0.5-win-x64"), zip = path.join(f.root, "windows.zip"), dest = path.join(f.root, "unpacked");
    mkdirSync(source); writeFileSync(path.join(source, "VERSION"), "1.0.5");
    const made = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Compress-Archive -LiteralPath $env:SM_TEST_SOURCE -DestinationPath $env:SM_TEST_ZIP"], { env: { ...process.env, SM_TEST_SOURCE: source, SM_TEST_ZIP: zip }, windowsHide: true, encoding: "utf8" });
    expect(made.status, made.stderr).toBe(0); u.unpackUpdateZip(zip, dest, "ShiftMgmt-1.0.5-win-x64");
    expect(readFileSync(path.join(dest, "ShiftMgmt-1.0.5-win-x64/VERSION"), "utf8")).toBe("1.0.5");
  });
});
