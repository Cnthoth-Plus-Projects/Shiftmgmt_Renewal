import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function listPackageFiles(root, relative = "") {
  const result = [];
  for (const name of readdirSync(path.join(root, relative)).sort()) {
    const member = relative ? `${relative}/${name}` : name;
    const info = lstatSync(path.join(root, member));
    if (info.isSymbolicLink()) throw new Error(`링크 파일은 설치할 수 없습니다: ${member}`);
    if (info.isDirectory()) result.push(...listPackageFiles(root, member));
    else if (info.isFile()) result.push(member);
    else throw new Error(`지원하지 않는 파일입니다: ${member}`);
  }
  return result;
}

export function verifyPackage(root, { installed = false } = {}) {
  root = path.resolve(root);
  const manifest = JSON.parse(readFileSync(path.join(root, "PACKAGE_MANIFEST.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.platform !== "win32" || manifest.arch !== "x64" ||
      !/^\d+\.\d+\.\d+$/.test(manifest.version) || !/^v24\./.test(manifest.nodeVersion) ||
      !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("설치 목록 형식이 올바르지 않습니다.");
  const wanted = new Set();
  for (const item of manifest.files) {
    const member = item.path;
    if (typeof member !== "string" || member.includes("\\") || member.includes(":") ||
        member.split("/").some(s => !s || s === "." || s === "..") ||
        wanted.has(member.toLowerCase()) || member.toLowerCase() === "package_manifest.json" ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error("설치 목록에 잘못된 경로 또는 중복 파일이 있습니다.");
    }
    wanted.add(member.toLowerCase());
  }
  const actual = listPackageFiles(root).filter(f => f !== "PACKAGE_MANIFEST.json" && !(installed && f === "installation.json"));
  if (actual.length !== wanted.size || actual.some(f => !wanted.has(f.toLowerCase()))) throw new Error("설치 파일이 누락되었거나 알 수 없는 파일이 있습니다.");
  for (const item of manifest.files) {
    const bytes = readFileSync(path.join(root, item.path));
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) throw new Error(`설치 파일이 손상되었습니다: ${item.path}`);
  }
  for (const required of ["runtime/node.exe", "START.cmd", "INSTALL.cmd", "scripts/fresh-install.ps1", "scripts/start-installed.mjs", "dist/server/main/server.js", "dist/browser/web/app.js", "licenses/Node-LICENSE.txt"]) {
    if (!wanted.has(required.toLowerCase())) throw new Error(`필수 설치 파일이 없습니다: ${required}`);
  }
  const version = readFileSync(path.join(root, "VERSION"), "utf8").trim();
  const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (manifest.version !== version || version !== packageVersion) throw new Error("설치 파일의 판 번호가 다릅니다.");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = verifyPackage(process.argv[2] ?? process.cwd(), { installed: process.argv.includes("--installed") });
    console.log(`PACKAGE_OK ${manifest.version} ${manifest.files.length}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
