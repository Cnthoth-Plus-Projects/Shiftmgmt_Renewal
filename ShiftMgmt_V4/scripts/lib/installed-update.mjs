import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256, verifyPackage } from "../verify-windows-package.mjs";

export const releaseRepository = "Cnthoth-Plus-Projects/Shiftmgmt_Renewal";
export const latestReleaseUrl = `https://api.github.com/repos/${releaseRepository}/releases/latest`;
const maxZipBytes = 200 * 1024 * 1024;
const versionParts = value => typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  ? value.split(".").map(Number).filter(Number.isSafeInteger) : [];

export function isNewerVersion(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (a.length !== 3 || b.length !== 3) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

export function selectReleaseUpdate(release, currentVersion) {
  if (!release || release.draft !== false || release.prerelease !== false ||
    typeof release.tag_name !== "string" || !release.tag_name.startsWith("v") ||
    !/^[a-f0-9]{40}$/.test(release.target_commitish ?? "")) return null;
  const version = release.tag_name.slice(1);
  if (!isNewerVersion(version, currentVersion)) return null;
  const name = `ShiftMgmt-${version}-win-x64.zip`;
  const matches = (release.assets ?? []).filter(asset => asset.name === name);
  if (matches.length !== 1) return null;
  const asset = matches[0];
  const url = `https://github.com/${releaseRepository}/releases/download/v${version}/${name}`;
  if (asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") ||
    !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > maxZipBytes) return null;
  return { version, name, url, bytes: asset.size, sha256: asset.digest.slice(7), sourceCommit: release.target_commitish };
}

const inside = (parent, child) => { const rel = path.relative(parent, child); return Boolean(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
function noLinks(target) {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("업데이트 위치에 링크가 있습니다.");
    if (path.dirname(current) === current) break;
  }
}
function cachePaths(root, dataRoot) {
  root = realpathSync(root);
  const cache = root + "-updates";
  noLinks(cache);
  if (inside(cache, dataRoot) || inside(dataRoot, cache) || path.resolve(dataRoot) === cache) throw new Error("업데이트와 자료 위치가 겹칩니다.");
  return { root, cache, versions: path.join(cache, "versions") };
}
function owner(paths, create = false) {
  if (!existsSync(paths.cache)) { if (!create) return false; mkdirSync(paths.cache); }
  const file = path.join(paths.cache, "owner.json");
  if (!existsSync(file)) {
    if (!create || requireEmptyDirectory(paths.cache) === false) return false;
    writeFileSync(file, JSON.stringify({ schema: 1, installRoot: paths.root }), { flag: "wx" });
  }
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (value.schema !== 1 || value.installRoot !== paths.root) throw new Error("업데이트 보관 위치를 확인할 수 없습니다.");
  return true;
}
// Do not adopt an existing directory containing files that were not created by this updater.
const requireEmptyDirectory = dir => readdirSync(dir).length === 0;
const atomicJson = (file, value) => {
  noLinks(file);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { flag: "wx" });
  try { renameSync(temp, file); } finally { if (existsSync(temp)) rmSync(temp); }
};

function packageDescriptor(paths, version, manifestHash, dataRoot, compatibility) {
  if (versionParts(version).length !== 3 || !/^[a-f0-9]{64}$/.test(manifestHash ?? "")) return null;
  const root = path.join(paths.versions, version);
  noLinks(root);
  if (!existsSync(root) || sha256(readFileSync(path.join(root, "PACKAGE_MANIFEST.json"))) !== manifestHash) return null;
  const manifest = verifyPackage(root, { installed: true });
  const config = JSON.parse(readFileSync(path.join(root, "installation.json"), "utf8"));
  if (manifest.version !== version || config.version !== version || path.resolve(config.dataRoot) !== path.resolve(dataRoot) ||
    manifest.autoUpdate?.protocolVersion !== 1 || manifest.autoUpdate.dataCompatibility !== compatibility) return null;
  return { root, version, manifestHash, cache: paths.cache, baseRoot: paths.root, sourceCommit: manifest.sourceCommit };
}

async function readBounded(response, limit) {
  if (!response.ok || !response.body) throw new Error("업데이트 자료를 받지 못했습니다.");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("업데이트 자료 크기가 다릅니다.");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export function unpackUpdateZip(zip, destination, expectedRoot) {
  const script = String.raw`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($env:SM_UPDATE_ZIP)
try {
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$total=0
  if ($archive.Entries.Count -gt 20000) { throw 'Too many files' }
  foreach ($entry in $archive.Entries) {
    $name=$entry.FullName.Replace('\','/')
    $member=$name.TrimEnd('/')
    if ($name -match '[\x00-\x1F<>:"|?*]' -or
        -not ($name.StartsWith($env:SM_UPDATE_NAME+'/') -or $name -eq $env:SM_UPDATE_NAME+'/') -or
        ($member.Split('/') | Where-Object { $_ -eq '' -or $_ -eq '.' -or $_ -eq '..' -or $_.EndsWith('.') -or $_.EndsWith(' ') -or $_ -match '^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$' }) -or
        -not $seen.Add($member) -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000 -or
        ($entry.ExternalAttributes -band 0x400) -ne 0) { throw 'Unsafe archive member' }
    $total += $entry.Length
    if ($total -gt 838860800) { throw 'Archive too large' }
  }
} finally { $archive.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($env:SM_UPDATE_ZIP,$env:SM_UPDATE_DEST)`;
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, SM_UPDATE_ZIP: zip, SM_UPDATE_DEST: destination, SM_UPDATE_NAME: expectedRoot },
    encoding: "utf8", windowsHide: true, timeout: 90_000, maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error("업데이트 압축 파일 검증에 실패했습니다.");
}

export async function resolveInstalledUpdate({ root, config, manifest, log = console.log, fetchImpl = fetch, unpack = unpackUpdateZip }) {
  let fallback = null, paths, stage;
  try {
    if (manifest.autoUpdate?.protocolVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.autoUpdate.dataCompatibility ?? "")) return null;
    paths = cachePaths(root, config.dataRoot);
    if (owner(paths) && existsSync(path.join(paths.cache, "active.json"))) {
      const active = JSON.parse(readFileSync(path.join(paths.cache, "active.json"), "utf8"));
      if (isNewerVersion(active.version, manifest.version)) fallback = packageDescriptor(paths, active.version, active.manifestHash, config.dataRoot, manifest.autoUpdate.dataCompatibility);
    }
    const response = await fetchImpl(latestReleaseUrl, { headers: { "User-Agent": "ShiftMgmt-Update", Accept: "application/vnd.github+json" }, redirect: "error", signal: AbortSignal.timeout(3500) });
    const candidate = selectReleaseUpdate(JSON.parse((await readBounded(response, 1024 * 1024)).toString("utf8")), fallback?.version ?? manifest.version);
    if (!candidate) return fallback;
    if (!owner(paths, true)) return fallback;
    noLinks(paths.versions); mkdirSync(paths.versions, { recursive: true });
    const rejection = path.join(paths.cache, "rejected.json");
    if (existsSync(rejection)) { const rejected = JSON.parse(readFileSync(rejection, "utf8")); if (rejected.version === candidate.version && rejected.zipHash === candidate.sha256) return fallback; }
    const destination = path.join(paths.versions, candidate.version);
    if (existsSync(destination)) {
      const existingHash = sha256(readFileSync(path.join(destination, "PACKAGE_MANIFEST.json")));
      const existing = packageDescriptor(paths, candidate.version, existingHash, config.dataRoot, manifest.autoUpdate.dataCompatibility);
      if (!existing || existing.sourceCommit !== candidate.sourceCommit) throw new Error("업데이트 사본을 확인할 수 없습니다.");
      return { ...existing, zipHash: candidate.sha256, fallback };
    }
    log(`새 버전 ${candidate.version}을 내려받는 중입니다. 자료 폴더는 유지합니다.`);
    stage = mkdtempSync(path.join(paths.cache, "stage-"));
    const downloaded = await fetchImpl(candidate.url, { redirect: "follow", signal: AbortSignal.timeout(90_000) });
    if (downloaded.url && (new URL(downloaded.url).protocol !== "https:" || !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(new URL(downloaded.url).hostname))) throw new Error("업데이트 다운로드 위치가 다릅니다.");
    const bytes = await readBounded(downloaded, candidate.bytes);
    if (bytes.length !== candidate.bytes || sha256(bytes) !== candidate.sha256) throw new Error("업데이트 파일 해시가 다릅니다.");
    const zip = path.join(stage, "update.zip"), unpacked = path.join(stage, "unpacked"), expectedName = path.basename(candidate.name, ".zip");
    writeFileSync(zip, bytes, { flag: "wx" });
    await unpack(zip, unpacked, expectedName);
    const packageRoot = path.join(unpacked, expectedName), next = verifyPackage(packageRoot);
    if (next.version !== candidate.version || next.sourceCommit !== candidate.sourceCommit ||
      next.autoUpdate?.protocolVersion !== 1 || next.autoUpdate.dataCompatibility !== manifest.autoUpdate.dataCompatibility ||
      !next.files.some(file => file.path === "scripts/lib/installed-update.mjs") ||
      next.files.some(file => /^(data|imports|exports|backups|src|\.git)\//i.test(file.path) || /(^|\/)bootstrap-credentials\.json$|\.(sqlite|db)(-|$)/i.test(file.path))) throw new Error("자동 적용할 수 없는 업데이트입니다.");
    writeFileSync(path.join(packageRoot, "installation.json"), JSON.stringify({ version: next.version, dataRoot: path.resolve(config.dataRoot) }), { flag: "wx" });
    verifyPackage(packageRoot, { installed: true });
    renameSync(packageRoot, destination);
    const descriptor = packageDescriptor(paths, next.version, sha256(readFileSync(path.join(destination, "PACKAGE_MANIFEST.json"))), config.dataRoot, manifest.autoUpdate.dataCompatibility);
    if (!descriptor) throw new Error("업데이트 사본 검증에 실패했습니다.");
    return { ...descriptor, zipHash: candidate.sha256, fallback };
  } catch {
    log("업데이트를 적용하지 못해 사용 가능한 기존 버전으로 시작합니다.");
    return fallback;
  } finally {
    if (stage && paths && inside(paths.cache, stage) && path.basename(stage).startsWith("stage-")) {
      noLinks(stage); rmSync(stage, { recursive: true, force: true });
    }
  }
}

export function activateInstalledUpdate(update) {
  noLinks(update.cache);
  atomicJson(path.join(update.cache, "active.json"), { schema: 1, version: update.version, manifestHash: update.manifestHash, sourceCommit: update.sourceCommit });
}
export function rejectInstalledUpdate(update) {
  noLinks(update.cache);
  atomicJson(path.join(update.cache, "rejected.json"), { version: update.version, zipHash: update.zipHash, at: new Date().toISOString() });
}

// Run the replacement with its bundled Node. Activation requires a healthy startup;
// a later application failure never triggers a database rollback.
export function runUpdatedLauncher(update, { args = [], log = console.log, timeoutMs = 25_000 } = {}) {
  return new Promise(resolve => {
    let started = false, tail = "", settled = false, killTimer;
    const child = spawn(path.join(update.root, "runtime/node.exe"), [path.join(update.root, "scripts/start-installed.mjs"), "--skip-update", ...args.filter(arg => arg === "--no-browser")], {
      cwd: update.root, env: process.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
    });
    const abort = () => { if (child.exitCode === null && !child.stdin.destroyed) child.stdin.write("q\n"); };
    process.on("SIGINT", abort); process.on("SIGTERM", abort);
    child.stdin.on("error", () => {});
    process.stdin.pipe(child.stdin);
    const deadline = setTimeout(() => { abort(); killTimer = setTimeout(() => child.kill(), 2000); }, timeoutMs);
    const finish = code => {
      if (settled) return; settled = true;
      clearTimeout(deadline); clearTimeout(killTimer);
      process.stdin.unpipe(child.stdin); process.stdin.pause();
      process.off("SIGINT", abort); process.off("SIGTERM", abort);
      resolve({ started, exitCode: code ?? 1 });
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", text => {
      process.stdout.write(text);
      tail = (tail + text).slice(-4096);
      if (!started && tail.includes("프로그램을 끝내려면")) {
        started = true; clearTimeout(deadline);
        try { activateInstalledUpdate(update); } catch { log("새 버전을 실행했습니다. 다음 실행 시 업데이트 기록을 다시 확인합니다."); }
      }
    });
    child.stderr.on("data", bytes => process.stderr.write(bytes));
    child.once("error", () => finish(1));
    child.once("close", finish);
  });
}
