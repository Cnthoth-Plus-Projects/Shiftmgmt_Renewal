import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChrome } from "./lib/find-chrome.mjs";
import { verifyPackage } from "./verify-windows-package.mjs";
import { rejectInstalledUpdate, resolveInstalledUpdate, runUpdatedLauncher } from "./lib/installed-update.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const progressFile = option("--progress-file"), controlFile = option("--control-file");
let progress = 0, runningVersion = "", runningUrl = "", controlPoll;
function report(percent, stage, message, status = "loading", extra = {}) {
  if (!progressFile || !path.isAbsolute(progressFile)) return;
  progress = Math.max(progress, percent);
  appendFileSync(progressFile, JSON.stringify({ percent: progress, stage, message, status, version: runningVersion, url: runningUrl, pid: process.pid, ...extra }) + "\n");
}
let lockPath;
let ownsLock = false;
const releaseLock = () => { if (ownsLock) { try { unlinkSync(lockPath); } catch { /* 이미 종료됨 */ } ownsLock = false; } };
process.on("exit", releaseLock);

function acquireLock(dataRoot) {
  mkdirSync(dataRoot, { recursive: true });
  lockPath = path.join(dataRoot, "launcher.lock");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    let alive = true;
    try { process.kill(lock.pid, 0); } catch (e) { if (e.code === "ESRCH") alive = false; }
    if (alive) throw new Error("이 데이터 폴더를 사용하는 실행 창이 이미 열려 있습니다.");
    unlinkSync(lockPath);
  }
  const handle = openSync(lockPath, "wx");
  ownsLock = true;
  writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  closeSync(handle);
}

try {
  report(5, "프로그램 확인", "설치 파일을 확인하고 있습니다.");
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Windows 64비트 PC에서 실행해 주세요.");
  const manifest = verifyPackage(root, { installed: true });
  runningVersion = manifest.version;
  report(18, "설치 확인 완료", "실행 환경과 자료 위치를 확인합니다.");
  if (process.version !== manifest.nodeVersion) throw new Error("포함된 실행 파일로 시작해 주세요(START.cmd).");
  if (!existsSync(path.join(root, "installation.json"))) throw new Error("먼저 INSTALL.cmd로 설치해 주세요.");
  const config = JSON.parse(readFileSync(path.join(root, "installation.json"), "utf8"));
  if (config.version !== manifest.version || typeof config.dataRoot !== "string" || !path.isAbsolute(config.dataRoot)) throw new Error("설치 정보를 확인할 수 없습니다. 설치 안내를 확인해 주세요.");
  const chrome = findChrome();
  report(28, "실행 환경 준비", "Chrome과 실행 포트를 확인합니다.");
  const dataRoot = path.resolve(config.dataRoot);
  const port = Number(process.env.SHIFTMGMT_PORT ?? "8734");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("실행 포트 설정을 확인해 주세요.");
  const occupied = await new Promise(resolve => {
    const probe = createNetServer();
    probe.once("error", () => resolve(true));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(false)));
  });
  if (occupied) {
    if (progressFile) {
      try {
        const health = await (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })).json();
        if (health.ok && health.data.version === manifest.version && path.resolve(health.data.dataDir) === dataRoot) {
          runningUrl = `http://127.0.0.1:${port}/`;
          if (!process.argv.includes("--no-browser")) { const child = spawn(chrome.path, ["--new-window", runningUrl], { detached: true, stdio: "ignore", windowsHide: true }); child.on("error", () => {}); child.unref(); }
          report(100, "이미 실행 중입니다", "열려 있는 프로그램으로 연결합니다.", "existing"); process.exit(0);
        }
      } catch { /* A different service or version must never be adopted. */ }
    }
    throw new Error("이미 실행 중이거나 실행 포트를 사용 중입니다. 기존 교대근무관리 프로그램을 종료한 뒤 다시 실행해 주세요.");
  }
  acquireLock(dataRoot);
  if (controlFile && path.isAbsolute(controlFile)) controlPoll = setInterval(() => {
    if (!existsSync(controlFile)) return;
    clearInterval(controlPoll);
    if (process.listenerCount("SIGINT")) process.emit("SIGINT", "SIGINT"); else process.exit(0);
  }, 250);
  report(38, "업데이트 확인", "사용 가능한 버전을 확인합니다. 연결되지 않아도 현재 버전으로 시작합니다.");
  if (!process.argv.includes("--skip-update")) {
    let update = await resolveInstalledUpdate({ root, config, manifest });
    while (update) {
      console.log(`${update.version} 버전으로 시작합니다.`);
      releaseLock();
      const outcome = await runUpdatedLauncher(update, { args: process.argv.slice(2) });
      if (outcome.started) process.exit(outcome.exitCode);
      try { rejectInstalledUpdate(update); } catch { /* 기존 버전 실행을 우선한다. */ }
      update = update.fallback ?? null;
      if (!update) { console.log("새 버전을 시작하지 못해 기존 버전으로 실행합니다."); acquireLock(dataRoot); }
    }
  }
  report(62, "자료 준비", "저장된 자료와 프로그램 서비스를 준비합니다.");
  process.chdir(root);
  process.env.NODE_ENV = "production";
  // 정식 실행은 설치 정보의 전용 데이터 위치만 사용한다.
  for (const key of ["DATA_DIR", "DATABASE_PATH", "WATCH_PENDING_DIR", "WATCH_APPROVED_DIR", "SCHEDULE_EXPORT_DIR", "ALLOWANCE_PROPOSAL_EXPORT_DIR", "ALLOWANCE_ATTACHMENT1_EXPORT_DIR", "ALLOWANCE_ATTACHMENT2_EXPORT_DIR", "DATABASE_BACKUP_DIR", "MIGRATION_FILE_PATH"]) delete process.env[key];
  process.env.APP_NAME = "교대근무관리 시스템";
  process.env.SHIFTMGMT_USER_DATA_DIR = dataRoot;
  delete process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  delete process.env.AUTH_BOOTSTRAP_OPERATOR_PASSWORD;
  delete process.env.AUTH_BOOTSTRAP_REVIEWER_PASSWORD;
  const { startServer } = await import(pathToFileURL(path.join(root, "dist/server/main/server.js")).href);
  const { listStoredOperationUsers } = await import(pathToFileURL(path.join(root, "dist/server/main/services/operations-storage-service.js")).href);
  const server = startServer({ dataDir: dataRoot, port, version: manifest.version, log: () => {} });
  // 초기 계정은 기존 서비스가 첫 조회에 준비한다. Chrome을 열기 전에 준비/안내한다.
  listStoredOperationUsers();
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const url = `http://127.0.0.1:${port}/`;
  runningUrl = url;
  report(82, "연결 확인", "프로그램이 정상적으로 응답하는지 확인합니다.");
  const health = await (await fetch(`${url}api/health`)).json();
  if (!health.ok || health.data.version !== manifest.version || path.resolve(health.data.dataDir) !== dataRoot) throw new Error("실행 상태를 확인하지 못했습니다.");
  console.log(`\n교대근무관리 시스템 ${manifest.version}\n접속: ${url}\n자료 폴더: ${dataRoot}`);
  const bootstrapPath = path.join(dataRoot, "data/bootstrap-credentials.json");
  if (!progressFile && existsSync(bootstrapPath)) {
    const admin = JSON.parse(readFileSync(bootstrapPath, "utf8")).credentials?.["user-admin"];
    if (admin) console.log(`\n처음 로그인: ${admin.loginId}\n임시 비밀번호: ${admin.password}\n로그인 후 본인만 아는 비밀번호로 변경해 주세요. 이 정보는 공유하지 마세요.`);
  }
  console.log("\n프로그램을 끝내려면 이 창에서 Q를 입력하고 Enter를 누르세요. 작업 중에는 이 창을 열어 두세요.");
  const input = createInterface({ input: process.stdin });
  input.on("line", line => { if (line.trim().toLowerCase() === "q") { input.close(); process.emit("SIGINT", "SIGINT"); } });
  if (!process.argv.includes("--no-browser")) {
    report(94, "화면 열기", "교대근무관리 화면을 엽니다.");
    const child = spawn(chrome.path, ["--new-window", url], { detached: true, stdio: "ignore", windowsHide: true });
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
  }
  report(100, "준비 완료", "프로그램을 사용할 수 있습니다.", "ready", { bootstrapPath: existsSync(bootstrapPath) ? bootstrapPath : null });
} catch (error) {
  try { report(progress, "실행을 완료하지 못했습니다", error.message, "error"); } catch { /* Preserve the original failure. */ }
  console.error(`실행하지 못했습니다. ${error.message}`);
  process.exit(1);
}
