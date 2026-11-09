// 개발 PC에서만 배포물을 만든다. 기존 사용자의 자료는 읽지 않는다.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPackageFiles, sha256, verifyPackage } from "./verify-windows-package.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const version = readFileSync(path.join(root, "VERSION"), "utf8").trim();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (process.platform !== "win32" || process.arch !== "x64" || !/^v24\./.test(process.version)) throw new Error("Windows x64 / Node24에서 패키지를 만들어 주세요.");
if (pkg.version !== version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("판 번호가 일치하지 않습니다.");
if (git(["status", "--porcelain"])) throw new Error("소스와 문서를 먼저 커밋해 주세요. 패키지는 고정된 커밋에서만 만듭니다.");
const output = path.resolve(process.argv[2] ?? path.join(root, "artifacts/releases", `v${version}`));
if (existsSync(output)) throw new Error("이미 있는 배포 폴더는 덮어쓰지 않습니다. 새 출력 경로를 지정해 주세요.");
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith(".js")) throw new Error("npm run release:package -- [새 출력 폴더] 로 실행해 주세요.");
const work = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-package-"));
const name = `ShiftMgmt-${version}-win-x64`;
const stage = path.join(work, name);
mkdirSync(stage);
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(command)} 실행 실패: ${(result.stderr || result.stdout || result.error?.message || "").slice(-2500)}`);
  return result.stdout;
}
function copy(from, to = from) {
  const target = path.join(stage, to);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(path.join(root, from), target, { recursive: true, dereference: false, filter: f => !f.endsWith(".map") });
}
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`공식 배포 자료를 받지 못했습니다: ${response.status} ${url}`);
  return await response.text();
}
try {
  console.log("1/5 정식 빌드");
  run(process.execPath, [npmCli, "run", "build"], root, { ...process.env, SHIFTMGMT_DEVELOPMENT_PREVIEW: "0" });
  for (const file of ["VERSION", "package.json", "package-lock.json", "dist/server", "dist/browser", "scripts/start-installed.mjs", "scripts/verify-windows-package.mjs", "scripts/lib/find-chrome.mjs", "scripts/windows-dialog.ps1"]) copy(file);
  copy("build/install.cmd", "INSTALL.cmd");
  copy("scripts/lib/installed-update.mjs");
  copy("src/renderer/assets/brand-logo-clean.png", "dist/assets/brand-logo-clean.png");
  copy("build/start.cmd", "START.cmd");
  copy("build/fresh-install.ps1", "scripts/fresh-install.ps1");
  // Windows PowerShell 5.1에서 한글이 깨지지 않게 한다.
  const installScript = path.join(stage, "scripts/fresh-install.ps1");
  writeFileSync(installScript, "\uFEFF" + readFileSync(installScript, "utf8").replace(/^\uFEFF/, ""));
  copy("docs/fresh-install.md", "설치안내.txt");
  copy(`docs/release-${version}.md`, "RELEASE_NOTES.md");
  console.log("2/5 고정된 실행 의존성 설치(브라우저 다운로드 없음)");
  run(process.execPath, [npmCli, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], stage, { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" });
  console.log("3/5 Node 실행 파일·공식 해시·라이선스 확인");
  const nodeBytes = readFileSync(process.execPath);
  const sums = await download(`https://nodejs.org/dist/${process.version}/SHASUMS256.txt`);
  const official = sums.split(/\r?\n/).find(line => /\swin-x64\/node\.exe$/.test(line))?.split(/\s+/)[0];
  if (!official || sha256(nodeBytes) !== official) throw new Error("현재 Node 실행 파일이 공식 Windows x64 배포 해시와 다릅니다.");
  mkdirSync(path.join(stage, "runtime"));
  writeFileSync(path.join(stage, "runtime/node.exe"), nodeBytes);
  mkdirSync(path.join(stage, "licenses"));
  writeFileSync(path.join(stage, "licenses/Node-LICENSE.txt"), await download(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`));
  copy("node_modules/pretendard/dist/LICENSE.txt", "licenses/Pretendard-LICENSE.txt");
  copy("node_modules/material-symbols/LICENSE", "licenses/Material-Symbols-LICENSE.txt");
  const dependencies = listPackageFiles(path.join(stage, "node_modules")).filter(f => f.endsWith("package.json")).flatMap(f => {
    const dep = JSON.parse(readFileSync(path.join(stage, "node_modules", f), "utf8"));
    return dep.name && dep.version ? [{ name: dep.name, version: dep.version, license: dep.license ?? "See package license files", path: `node_modules/${path.posix.dirname(f)}` }] : [];
  });
  writeFileSync(path.join(stage, "licenses/dependencies.json"), JSON.stringify(dependencies, null, 2) + "\n");
  const files = listPackageFiles(stage).map(member => {
    const bytes = readFileSync(path.join(stage, member));
    if (/^(data|imports|exports|backups|src|\.git)\//i.test(member) || /(^|\/)bootstrap-credentials\.json$|\.(sqlite|db)(-|$)/i.test(member)) throw new Error(`자료가 배포물에 포함되어 있습니다: ${member}`);
    return { path: member, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const autoUpdate = { protocolVersion: 1, dataCompatibility: sha256(Buffer.from(readFileSync(path.join(root, "src/main/services/sqlite-storage-service.ts"), "utf8").replace(/\r\n/g, "\n"))) };
  const manifest = { schemaVersion: 1, version, platform: "win32", arch: "x64", nodeVersion: process.version, sourceCommit, autoUpdate, files };
  writeFileSync(path.join(stage, "PACKAGE_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  verifyPackage(stage);
  if (git(["status", "--porcelain"])) throw new Error("작업 중 소스가 변경되었습니다. 배포물을 만들지 않습니다.");
  console.log(`4/5 ${files.length}개 파일 검사 완료, ZIP 압축`);
  mkdirSync(output, { recursive: true });
  const zipPath = path.join(output, `${name}.zip`);
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Compress-Archive -LiteralPath $env:SHIFTMGMT_ZIP_SOURCE -DestinationPath $env:SHIFTMGMT_ZIP_DEST -CompressionLevel Optimal"], work, { ...process.env, SHIFTMGMT_ZIP_SOURCE: stage, SHIFTMGMT_ZIP_DEST: zipPath });
  const zipBytes = readFileSync(zipPath);
  const releaseManifest = { version, headline: `교대근무관리 시스템 ${version}`, summary: "JSON 이관 및 실행 시 자동업데이트", required: false, requiresDbBackup: true, autoUpdate, publishedAt: new Date().toISOString(), notes: ["Node 실행 환경 포함. Google Chrome은 별도 설치가 필요합니다.", "기존 프로그램이나 데이터가 있으면 덮어쓰지 않습니다.", "품의서·별첨1·별첨2는 A4 출력, 근무표는 Excel 파일로 생성합니다.", "바로가기 실행 시 호환되는 새 정식 버전을 자동으로 확인·검증해 적용합니다. 구판 자료는 JSON 복원으로 이관합니다."] };
  writeFileSync(path.join(output, "RELEASE_MANIFEST.json"), JSON.stringify(releaseManifest, null, 2) + "\n");
  writeFileSync(path.join(output, "SHA256SUMS.txt"), `${sha256(zipBytes)}  ${path.basename(zipPath)}\n`);
  writeFileSync(path.join(output, "BUILD_RECEIPT.json"), JSON.stringify({ version, sourceCommit, productTree: git(["rev-parse", "HEAD:ShiftMgmt_V4"]), nodeVersion: process.version, nodeSha256: official, lockSha256: sha256(readFileSync(path.join(root, "package-lock.json"))), files: files.length, zip: path.basename(zipPath), zipBytes: zipBytes.length, zipSha256: sha256(zipBytes), builtAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`5/5 PACKAGE_BUILT ${zipPath}\nSHA256 ${sha256(zipBytes)}`);
} finally {
  const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (path.resolve(work).startsWith(temporaryRoot) && path.basename(work).startsWith("shiftmgmt-package-")) rmSync(work, { recursive: true, force: true });
}
