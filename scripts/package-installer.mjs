// Build a Setup.exe around an immutable, previously verified release ZIP.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPackageFiles, sha256, verifyPackage } from "./verify-windows-package.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const required = name => { const value = option(name); if (!value) throw new Error(`--${name}=절대경로 또는 값이 필요합니다.`); return value; };
const zip = path.resolve(required("zip")), expectedZipSha256 = required("zip-sha256");
const compilerReceiptPath = path.resolve(required("compiler-receipt")), output = path.resolve(required("out"));
const compilerReceipt = JSON.parse(readFileSync(compilerReceiptPath, "utf8"));
const compilerInstallerSha256 = "a549929319f9120716677c685535ca4671e4b937b5fdc87e2585f32d8eb30e8c";
const git = argv => execFileSync("git", argv, { cwd: root, encoding: "utf8" }).trim();
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Windows x64에서 설치 파일을 만들어 주세요.");
if (git(["status", "--porcelain"])) throw new Error("설치 소스와 안내를 먼저 커밋해 주세요.");
if (existsSync(output)) throw new Error("이미 있는 출력 폴더를 덮어쓰지 않습니다.");
assert.equal(sha256(readFileSync(zip)), expectedZipSha256, "기존 ZIP SHA256 불일치");
assert.equal(compilerReceipt.version, "6.7.4");
assert.equal(compilerReceipt.sha256, compilerInstallerSha256);
assert.equal(compilerReceipt.installerSignature.status, "Valid");
assert(compilerReceipt.installerSignature.subject.includes("Pyrsys B.V."));
assert.equal(sha256(readFileSync(compilerReceipt.path)), compilerReceipt.exeSha256);
assert(compilerReceipt.toolFiles?.length > 100, "고정 compiler 파일 지문이 필요합니다.");
const compilerRoot = path.dirname(compilerReceipt.path);
for (const item of compilerReceipt.toolFiles) {
  assert(!item.path.includes("..") && !path.isAbsolute(item.path));
  const bytes = readFileSync(path.join(compilerRoot, item.path));
  assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
}

const work = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-exe-build-"));
const unpack = path.join(work, "payload");
const expand = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:SM_EXE_ZIP -DestinationPath $env:SM_EXE_UNPACK"], {
  env: { ...process.env, SM_EXE_ZIP: zip, SM_EXE_UNPACK: unpack }, encoding: "utf8", windowsHide: true, timeout: 180_000
});
assert.equal(expand.status, 0, expand.stderr || expand.stdout);
const payloadRoot = path.join(unpack, path.basename(zip, ".zip"));
const manifest = verifyPackage(payloadRoot);
assert.equal(manifest.version, readFileSync(path.join(root, "VERSION"), "utf8").trim());
const originalManifestHash = sha256(readFileSync(path.join(payloadRoot, "PACKAGE_MANIFEST.json")));
const guide = path.join(work, "installer-guide.txt");
writeFileSync(guide, `교대근무관리 시스템 ${manifest.version}\r\n\r\n새 PC에 처음 설치하는 Windows 64비트 프로그램입니다.\r\nNode 실행 환경은 포함되어 있고 Google Chrome은 별도로 필요합니다.\r\n\r\n설치 후 바탕 화면의 바로가기로 실행합니다.\r\n첫 로그인 후 비밀번호를 변경하고 공휴일·요율·자료 폴더를 확인해 주세요.\r\n\r\n기존 프로그램이나 자료가 있으면 덮어쓰지 않습니다.\r\n프로그램 제거 시에도 DB와 업무 자료는 유지합니다.\r\n`);
mkdirSync(output);
const commandArgs = ["/Qp", "/O" + output, "/DPayloadDir=" + payloadRoot, "/DAppVersion=" + manifest.version, "/DGuideFile=" + guide, path.join(root, "build/windows-installer.iss")];
const started = Date.now();
const compiled = spawnSync(compilerReceipt.path, commandArgs, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 8e6 });
writeFileSync(path.join(work, "compile.log"), (compiled.stdout ?? "") + (compiled.stderr ?? ""));
if (compiled.status !== 0) throw new Error(`EXE 빌드 실패: ${compiled.stderr || compiled.stdout || compiled.error?.message}`);
const name = `ShiftMgmt-${manifest.version}-Setup-x64.exe`, file = path.join(output, name), bytes = readFileSync(file);
assert.equal(bytes.subarray(0, 2).toString(), "MZ", "Windows 실행 파일 헤더");
verifyPackage(payloadRoot); assert.equal(sha256(readFileSync(path.join(payloadRoot, "PACKAGE_MANIFEST.json"))), originalManifestHash);
const wrapperPaths = ["build/windows-installer.iss", "scripts/package-installer.mjs", "scripts/release-install-smoke.mjs"];
const receipt = { schemaVersion: 1, appVersion: manifest.version, appSourceCommit: manifest.sourceCommit, wrapperSourceCommit: git(["rev-parse", "HEAD"]), wrapperProductTree: git(["rev-parse", "HEAD:ShiftMgmt_V4"]),
  installer: name, installerBytes: bytes.length, installerSha256: sha256(bytes), payloadZip: path.basename(zip), payloadZipSha256: expectedZipSha256, payloadManifestSha256: originalManifestHash, payloadFiles: manifest.files.length,
  nodeVersion: manifest.nodeVersion, compiler: { version: compilerReceipt.version, officialInstallerSha256: compilerInstallerSha256, exeSha256: compilerReceipt.exeSha256, toolchainSha256: sha256(Buffer.from(JSON.stringify(compilerReceipt.toolFiles))) },
  wrapperFiles: wrapperPaths.map(member => ({ path: member, sha256: sha256(readFileSync(path.join(root, member))) })), dataRootPreservedOnUninstall: true, applicationRuntimeChanged: false, durationMs: Date.now() - started, builtAt: new Date().toISOString() };
assert.equal(git(["status", "--porcelain"]), "");
writeFileSync(path.join(output, "INSTALLER_BUILD_RECEIPT.json"), JSON.stringify(receipt, null, 2) + "\n");
writeFileSync(path.join(output, "INSTALLER_SHA256SUMS.txt"), `${receipt.installerSha256}  ${name}\n`);
const proof = { work, output, compilerReceipt: compilerReceiptPath, zip, receipt, files: listPackageFiles(payloadRoot).length };
writeFileSync(path.join(work, "build-evidence.json"), JSON.stringify(proof, null, 2));
console.log(`EXE_BUILT ${file}\nSHA256 ${receipt.installerSha256}\nPrivate evidence: ${work}`);
