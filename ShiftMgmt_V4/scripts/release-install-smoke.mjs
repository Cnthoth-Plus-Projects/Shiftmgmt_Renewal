// 새 설치 ZIP 전용 검문. 실제 바탕 화면/자료 폴더를 사용하지 않는다.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { findChrome } from "./lib/find-chrome.mjs";
import { sha256, verifyPackage } from "./verify-windows-package.mjs";

const zip = path.resolve(process.argv[2] ?? "missing-zip");
const setupOption = process.argv.find(arg => arg.startsWith("--setup-exe="));
const setupExe = setupOption ? path.resolve(setupOption.slice("--setup-exe=".length)) : undefined;
if (setupExe) assert.ok(existsSync(setupExe), "검증할 Setup.exe 절대 경로를 지정해 주세요.");
assert.ok(existsSync(zip), "ZIP 절대 경로를 지정해 주세요.");
const work = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-release-smoke-"));
const checks = [];
const chrome = findChrome();
let child;
let browser;
let captured = ""; // 임시 비밀번호를 포함하므로 디스크/보고서에 기록하지 않는다.
function passed(name) { checks.push({ name, ok: true }); console.log(`PASS ${name}`); }
function ps(script, env = {}) {
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { env: { ...process.env, ...env }, encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 });
}
function legacyInstaller(root, target, data, desktop) {
  return ps("& (Join-Path $env:SM_PACKAGE 'scripts\\fresh-install.ps1') -InstallRoot $env:SM_TARGET -DataRoot $env:SM_DATA -DesktopDirectory $env:SM_DESKTOP; exit $LASTEXITCODE", { SM_PACKAGE: root, SM_TARGET: target, SM_DATA: data, SM_DESKTOP: desktop });
}
let installAttempt = 0;
const metadataDir = path.join(work, "EXE 제거 정보");
function installer(root, target, data, desktop) {
  if (!setupExe) return legacyInstaller(root, target, data, desktop);
  const result = spawnSync(setupExe, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/DIR=" + target, "/DATAROOT=" + data, "/DESKTOPDIR=" + desktop, "/METADIR=" + metadataDir, "/LOG=" + path.join(work, `exe-install-${++installAttempt}.log`)], { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  // Inno's PrepareToInstall rejection is 7; keep the existing wrapper's explicit
  // rejection contract while preserving the native result for diagnosis.
  return result.status === 7 ? { ...result, actualStatus: 7, status: 1 } : result;
}
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function start(root, port) {
  captured = "";
  child = spawn(path.join(root, "runtime/node.exe"), [path.join(root, "scripts/start-installed.mjs"), "--no-browser"], {
    cwd: os.tmpdir(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, SHIFTMGMT_PORT: String(port), SHIFTMGMT_CHROME_PATH: chrome.path, DATABASE_PATH: path.join(work, "must-not-use.sqlite"), NODE_ENV: "development" }
  });
  child.stdout.on("data", b => { captured += b; });
  child.stderr.on("data", b => { captured += b; });
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`설치본 시작 실패(rc=${child.exitCode}). 비밀번호가 포함된 출력은 저장하지 않았습니다.`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      const health = await response.json();
      if (response.ok && health.ok && captured.includes("프로그램을 끝내려면")) return health.data;
    } catch { /* 시작 대기 */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("설치본 실행 대기 시간 초과");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const active = child;
  const exit = new Promise(resolve => active.once("exit", resolve));
  active.stdin.write("q\n");
  const result = await Promise.race([exit, new Promise(resolve => setTimeout(() => resolve("timeout"), 15_000))]);
  assert.equal(result, 0, "Q 정상 종료");
  child = undefined;
}
try {
  const expectedZipHash = readFileSync(path.join(path.dirname(zip), "SHA256SUMS.txt"), "utf8").trim().split(/\s+/)[0];
  assert.equal(sha256(readFileSync(zip)), expectedZipHash);
  passed("ZIP SHA256");
  const unpack = path.join(work, "압축 해제");
  const expand = ps("Expand-Archive -LiteralPath $env:SM_ZIP -DestinationPath $env:SM_UNPACK", { SM_ZIP: zip, SM_UNPACK: unpack });
  assert.equal(expand.status, 0, "ZIP 압축 해제");
  const packageRoot = path.join(unpack, path.basename(zip, ".zip"));
  const manifest = verifyPackage(packageRoot);
  passed(`압축 해제 후 ${manifest.files.length}개 파일 무결성`);
  assert.ok(!manifest.files.some(f => /^(data|imports|exports|backups|src)\//.test(f.path) || /bootstrap-credentials\.json|\.(db|sqlite)(-|$)/.test(f.path)));
  assert.ok(!existsSync(path.join(packageRoot, "node_modules/typescript")));
  passed("운영 자료·자격정보·개발 의존성 제외");
  const target = path.join(work, "프로그램 설치");
  const data = path.join(work, "사용자 자료");
  const desktop = path.join(work, "테스트 바탕 화면");
  mkdirSync(desktop);
  const startFile = path.join(packageRoot, "START.cmd");
  const original = readFileSync(startFile);
  writeFileSync(startFile, "tampered");
  assert.equal(legacyInstaller(packageRoot, target, data, desktop).status, 1);
  assert.ok(!existsSync(target) && !existsSync(data));
  writeFileSync(startFile, original);
  passed("변조된 설치 파일 거절·쓰기 없음");
  const occupiedData = path.join(work, "기존 자료");
  mkdirSync(occupiedData);
  writeFileSync(path.join(occupiedData, "preserve.txt"), "keep-data");
  assert.equal(installer(packageRoot, target, occupiedData, desktop).status, 1);
  assert.equal(readFileSync(path.join(occupiedData, "preserve.txt"), "utf8"), "keep-data");
  assert.ok(!existsSync(target));
  passed("기존 자료 보존·설치 거절");
  const occupiedApp = path.join(work, "기존 프로그램");
  mkdirSync(occupiedApp);
  writeFileSync(path.join(occupiedApp, "preserve.txt"), "keep-app");
  assert.equal(installer(packageRoot, occupiedApp, data, desktop).status, 1);
  assert.equal(readFileSync(path.join(occupiedApp, "preserve.txt"), "utf8"), "keep-app");
  passed("기존 프로그램 보존·설치 거절");
  const install = installer(packageRoot, target, data, desktop);
  if (install.status !== 0) throw new Error(`새 설치 실패: ${install.stdout} ${install.stderr}`);
  assert.ok(!existsSync(data));
  verifyPackage(target, { installed: true });
  const logoProbe = spawnSync(path.join(target, "runtime/node.exe"), ["-e", "const assert=require('node:assert/strict'); const path=require('node:path'); const m=require(path.join(process.cwd(),'dist/server/main/services/document-brand-logo-service.js')); const b=m.resolveBrandLogoBuffer(); assert(b && b.length>0);"], {cwd:target,encoding:"utf8",windowsHide:true});
  assert.equal(logoProbe.status, 0, "Installed document logo must resolve without source files");
  passed("설치본 문서 로고 해석·개발 소스 경로 불필요");
  const shortcut = path.join(desktop, "교대근무관리 시스템.lnk");
  assert.ok(existsSync(shortcut));
  const link = ps("$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SM_SHORTCUT); [Console]::OutputEncoding = New-Object Text.UTF8Encoding; @{target=$s.TargetPath; working=$s.WorkingDirectory} | ConvertTo-Json -Compress", { SM_SHORTCUT: shortcut });
  const shortcutData = JSON.parse(link.stdout.trim());
  assert.equal(shortcutData.target.toLowerCase(), path.join(target, "START.cmd").toLowerCase());
  assert.equal(shortcutData.working.toLowerCase(), target.toLowerCase());
  passed("한글·공백 경로 새 설치·바로가기 대상 확인");
  assert.equal(installer(packageRoot, target, data, desktop).status, 1);
  passed("중복 설치 거절");
  const port = await freePort();
  const health = await start(target, port);
  assert.equal(health.version, manifest.version);
  assert.equal(path.resolve(health.dataDir), data);
  assert.equal(health.node, manifest.nodeVersion);
  assert.ok(!existsSync(path.join(work, "must-not-use.sqlite")));
  passed("포함된 Node·설치 데이터 경로·health 판 번호");
  const db = new DatabaseSync(path.join(data, "data/shiftmgmt.sqlite"), { readOnly: true });
  for (const table of ["employees", "performance_files", "performance_entries", "performance_approvals", "allowance_calculations", "performance_return_history"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  db.close();
  passed("새 DB 업무 자료 0·SQLite 무결성");
  const bootstrapPath = path.join(data, "data/bootstrap-credentials.json");
  const credentials = JSON.parse(readFileSync(bootstrapPath, "utf8")).credentials["user-admin"];
  assert.equal(credentials.loginId, "admin");
  assert.equal(credentials.password, "1234", "기존 최초 관리자 비밀번호 정책 유지");
  const duplicate = spawnSync(path.join(target, "runtime/node.exe"), [path.join(target, "scripts/start-installed.mjs"), "--no-browser"], { env: { ...process.env, SHIFTMGMT_PORT: String(port), SHIFTMGMT_CHROME_PATH: chrome.path }, encoding: "utf8", windowsHide: true, timeout: 15_000 });
  assert.equal(duplicate.status, 1);
  passed("중복 실행 거절");
  browser = await chromium.launch({ executablePath: chrome.path, headless: true });
  let context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("shiftmgmt.developmentPreview", "1"));
  await page.goto(`http://127.0.0.1:${port}/?developmentPreview=1`);
  await page.locator("#login-id").waitFor();
  assert.equal(await page.locator("#btn-development-autofill").count(), 0);
  passed("정식 빌드 개발 자동입력 비노출(URL·저장값에도 차단)");
  await page.locator("#login-id").fill(credentials.loginId);
  await page.locator("#login-password").fill(credentials.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.locator("#l4-current-pw").waitFor();
  passed("실제 Chrome 첫 로그인·비밀번호 변경 강제");
  const nextPassword = `Release!${randomBytes(12).toString("hex")}Aa7`;
  await page.locator("#l4-current-pw").fill(credentials.password);
  await page.locator("#l4-new-pw").fill(nextPassword);
  await page.locator("#l4-confirm-pw").fill(nextPassword);
  await page.locator("#l4-btn-submit").click();
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  assert.ok(!JSON.parse(readFileSync(bootstrapPath, "utf8")).credentials["user-admin"]);
  const session = await page.evaluate(() => window.appBridge.getSession());
  assert.equal(session.ok, true);
  assert.equal(session.data.passwordChangeRequired, false);
  await page.screenshot({ path: path.join(work, "fresh-install-dashboard.png"), fullPage: true });
  assert.deepEqual(errors, []);
  passed("비밀번호 변경 후 화면 진입·초기 관리자 비밀번호 폐기·화면 오류 0");
  await context.close();
  await stop();
  assert.ok(!existsSync(path.join(data, "launcher.lock")));
  passed("Q 정상 종료·실행 잠금 해제");
  await start(target, port);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(!captured.includes("임시 비밀번호:"));
  context = await browser.newContext();
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator("#login-id").fill("admin");
  await page.locator("#login-password").fill(nextPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  passed("재실행·변경된 비밀번호 로그인·임시 비밀번호 재노출 없음");
  await context.close();
  await stop();
  const report = { ok: true, version: manifest.version, sourceCommit: manifest.sourceCommit, zip, zipSha256: expectedZipHash, checks, chromeVersion: chrome.version, work, recordedAt: new Date().toISOString(), ...(setupExe ? { setupExe, installerSha256: sha256(readFileSync(setupExe)), installedRoot: target, dataRoot: data, desktop, metadataDir, setupAttempts: installAttempt } : {}) };
  writeFileSync(path.join(work, "assessment.json"), JSON.stringify(report, null, 2) + "\n");
  // 공개 검증 요약에는 로컬 경로·비밀번호·화면 캡처를 넣지 않는다.
  writeFileSync(path.join(setupExe ? path.dirname(setupExe) : path.dirname(zip), setupExe ? "VERIFICATION_EXE_INSTALL.json" : "VERIFICATION_INSTALL.json"), JSON.stringify({ ok: true, version: manifest.version, sourceCommit: manifest.sourceCommit, zipSha256: expectedZipHash, checks, chromeVersion: chrome.version, recordedAt: report.recordedAt, ...(setupExe ? { installerSha256: report.installerSha256 } : {}) }, null, 2) + "\n");
  console.log(`INSTALL_SMOKE_OK ${checks.length} checks\nPrivate evidence: ${work}`);
} catch (error) {
  writeFileSync(path.join(work, "failure.json"), JSON.stringify({ ok: false, checks, message: error.message }, null, 2));
  console.error(`INSTALL_SMOKE_FAILED ${error.message}\nPrivate evidence: ${work}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { try { await stop(); } catch { child.kill(); } }
}
