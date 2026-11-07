import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChrome } from "./lib/find-chrome.mjs";
import { verifyPackage } from "./verify-windows-package.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let lockPath;
let ownsLock = false;
process.on("exit", () => { if (ownsLock) { try { unlinkSync(lockPath); } catch { /* 이미 종료됨 */ } } });

try {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Windows 64비트 PC에서 실행해 주세요.");
  const manifest = verifyPackage(root, { installed: true });
  if (process.version !== manifest.nodeVersion) throw new Error("포함된 실행 파일로 시작해 주세요(START.cmd).");
  if (!existsSync(path.join(root, "installation.json"))) throw new Error("먼저 INSTALL.cmd로 설치해 주세요.");
  const config = JSON.parse(readFileSync(path.join(root, "installation.json"), "utf8"));
  if (config.version !== manifest.version || typeof config.dataRoot !== "string" || !path.isAbsolute(config.dataRoot)) throw new Error("설치 정보를 확인할 수 없습니다. 설치 안내를 확인해 주세요.");
  const chrome = findChrome();
  const dataRoot = path.resolve(config.dataRoot);
  const port = Number(process.env.SHIFTMGMT_PORT ?? "8734");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("실행 포트 설정을 확인해 주세요.");
  await new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", () => reject(new Error("이미 실행 중이거나 실행 포트를 다른 프로그램이 사용 중입니다. 기존 실행 창을 확인해 주세요.")));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
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
  process.chdir(root);
  process.env.NODE_ENV = "production";
  // 정식 실행은 설치 정보의 전용 데이터 위치만 사용한다.
  for (const key of ["DATA_DIR", "DATABASE_PATH", "WATCH_PENDING_DIR", "WATCH_APPROVED_DIR", "SCHEDULE_EXPORT_DIR", "ALLOWANCE_PROPOSAL_EXPORT_DIR", "ALLOWANCE_ATTACHMENT1_EXPORT_DIR", "ALLOWANCE_ATTACHMENT2_EXPORT_DIR", "DATABASE_BACKUP_DIR", "MIGRATION_FILE_PATH"]) delete process.env[key];
  process.env.APP_NAME = "교대근무관리 시스템";
  process.env.SHIFTMGMT_USER_DATA_DIR = dataRoot;
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = `Sm!${randomBytes(15).toString("base64url")}7a`;
  delete process.env.AUTH_BOOTSTRAP_OPERATOR_PASSWORD;
  delete process.env.AUTH_BOOTSTRAP_REVIEWER_PASSWORD;
  const { startServer } = await import(pathToFileURL(path.join(root, "dist/server/main/server.js")).href);
  const server = startServer({ dataDir: dataRoot, port, version: manifest.version, log: () => {} });
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const url = `http://127.0.0.1:${port}/`;
  const health = await (await fetch(`${url}api/health`)).json();
  if (!health.ok || health.data.version !== manifest.version || path.resolve(health.data.dataDir) !== dataRoot) throw new Error("실행 상태를 확인하지 못했습니다.");
  console.log(`\n교대근무관리 시스템 ${manifest.version}\n접속: ${url}\n자료 폴더: ${dataRoot}`);
  const bootstrapPath = path.join(dataRoot, "data/bootstrap-credentials.json");
  if (existsSync(bootstrapPath)) {
    const admin = JSON.parse(readFileSync(bootstrapPath, "utf8")).credentials?.["user-admin"];
    if (admin) console.log(`\n처음 로그인: ${admin.loginId}\n임시 비밀번호: ${admin.password}\n로그인 후 본인만 아는 비밀번호로 변경해 주세요. 이 정보는 공유하지 마세요.`);
  }
  console.log("\n프로그램을 끝내려면 이 창에서 Q를 입력하고 Enter를 누르세요. 작업 중에는 이 창을 열어 두세요.");
  const input = createInterface({ input: process.stdin });
  input.on("line", line => { if (line.trim().toLowerCase() === "q") { input.close(); process.emit("SIGINT", "SIGINT"); } });
  if (!process.argv.includes("--no-browser")) {
    const child = spawn(chrome.path, ["--new-window", url], { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => console.error(`크롬을 열지 못했습니다. 주소를 직접 열어 주세요: ${url}`));
    child.unref();
  }
} catch (error) {
  console.error(`실행하지 못했습니다. ${error.message}`);
  process.exit(1);
}
