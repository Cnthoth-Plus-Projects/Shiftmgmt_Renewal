// 개발 실행 조정기.
//
//   npm run dev
//
// 순서: 빌드 → 서버 시작 → /api/health 200 확인 → 설치된 크롬으로 화면 열기.
// 수명 규칙: **서버가 끝나거나 Ctrl+C(SIGINT/SIGTERM) 를 받을 때만** 끝난다.
// 크롬은 이미 떠 있으면 새 탭만 넘기고 바로 끝나므로(윈도우 동작), 크롬 자식의 종료는 종료 조건이 아니다.
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findChrome } from "./lib/find-chrome.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const parsedPort = Number.parseInt(process.env.SHIFTMGMT_PORT ?? "", 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 8734;
const url = `http://127.0.0.1:${port}/`;

const HEALTH_TIMEOUT_MS = 10_000;
const HEALTH_INTERVAL_MS = 250;
const PORT_RELEASE_TIMEOUT_MS = 5_000;

let serverChild = null;
let shuttingDown = false;

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** npm 스크립트를 실행한다(cmd 셸을 거치지 않는다 — 인수가 그대로 전달되도록). */
function runNpmScript(script, options) {
  const npmCli = process.env.npm_execpath;

  if (typeof npmCli === "string" && npmCli.endsWith(".js")) {
    return spawnSync(process.execPath, [npmCli, "run", script], { cwd: root, ...options });
  }

  return spawnSync("npm", ["run", script], { cwd: root, shell: true, ...options });
}

/** 자식이 스스로 끝나기를 기다린다(Ctrl+C 는 같은 콘솔의 자식에게도 함께 간다). */
function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);

      return;
    }

    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }

    child.once("exit", onExit);
  });
}

/** 포트가 아직 열려 있는지(연결이 되면 열려 있는 것) */
function isPortOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1_000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}api/health`, { headers: { Accept: "application/json" } });

      if (response.ok) {
        const payload = await response.json();

        if (payload && payload.ok === true) {
          return payload.data;
        }
      }
    } catch {
      // 서버가 아직 안 떴다 — 잠시 뒤 다시 확인한다.
    }

    await sleep(HEALTH_INTERVAL_MS);
  }

  return null;
}

async function waitForPortRelease() {
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!(await isPortOpen())) {
      return true;
    }

    await sleep(HEALTH_INTERVAL_MS);
  }

  return false;
}

/**
 * @param {number} code 종료 코드
 * @param {string} reason 사람이 읽을 이유
 * @param {boolean} childAlreadySignalled 콘솔 Ctrl+C 처럼 서버 자식도 이미 같은 신호를 받았는가
 */
async function shutdown(code, reason, childAlreadySignalled = false) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  process.stdout.write(`종료합니다 — ${reason}\n`);

  if (serverChild !== null) {
    // 서버 자식에 종료 신호를 보낸다.
    // 콘솔 Ctrl+C 는 같은 콘솔의 자식에게도 이미 전달되므로(윈도우), 그때는 스스로 정리할 시간을 먼저 준다.
    if (!childAlreadySignalled) {
      serverChild.kill();
    }

    const exited = await waitForChildExit(serverChild, 3_000);

    if (!exited) {
      serverChild.kill();
    }
  }

  const released = await waitForPortRelease();

  if (!released) {
    process.stderr.write(`포트 ${port} 가 아직 열려 있습니다. 남은 프로그램이 있는지 확인해 주세요.\n`);
  }

  process.exit(code);
}

// 1) 빌드
process.stdout.write("빌드 중…\n");

const build = runNpmScript("build", { stdio: "inherit", env: { ...process.env, SHIFTMGMT_DEVELOPMENT_PREVIEW: "1" } });

if (build.status !== 0) {
  process.stderr.write("빌드에 실패했습니다. 위 오류를 먼저 고쳐 주세요.\n");
  process.exit(build.status ?? 1);
}

// 2) 서버 시작
const serverEntry = path.join(root, "dist", "server", "main", "server.js");

serverChild = spawn(process.execPath, [serverEntry], { cwd: root, stdio: "inherit" });

serverChild.on("exit", (code, signal) => {
  if (shuttingDown) {
    return;
  }

  void shutdown(code ?? (signal === null ? 0 : 1), `서버가 종료되었습니다(${signal ?? code}).`);
});

serverChild.on("error", (error) => {
  process.stderr.write(`서버를 시작하지 못했습니다: ${error.message}\n`);
  void shutdown(1, "서버 시작 실패");
});

process.on("SIGINT", () => {
  // 콘솔 Ctrl+C 는 같은 콘솔에 붙은 서버 자식에게도 함께 간다.
  void shutdown(0, "Ctrl+C", true);
});

process.on("SIGTERM", () => {
  void shutdown(0, "종료 요청(SIGTERM)");
});

// 3) health 확인
const health = await waitForHealth();

if (health === null) {
  process.stderr.write(`서버가 ${HEALTH_TIMEOUT_MS / 1000}초 안에 응답하지 않았습니다(${url}api/health).\n`);
  await shutdown(1, "서버 응답 없음");
}

process.stdout.write(`서버 연결 확인 — ${url}api/health · 판 ${health.version} · 데이터 폴더: ${health.dataDir}\n`);

// 4) 크롬으로 화면 열기
let chrome;

try {
  chrome = findChrome();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  await shutdown(1, "크롬 없음");
}

process.stdout.write(`크롬 실행 — ${chrome.path} · 판 ${chrome.version}\n`);

const chromeChild = spawn(chrome.path, [url], { stdio: "ignore" });

chromeChild.on("error", (error) => {
  process.stderr.write(`크롬을 실행하지 못했습니다: ${error.message}\n`);
});

// 크롬 자식의 종료는 무시한다(이미 떠 있는 크롬에 탭만 넘기면 바로 끝난다).
chromeChild.on("exit", () => {
  process.stdout.write("크롬 실행기가 끝났습니다. 서버는 계속 실행 중입니다(끝내려면 Ctrl+C).\n");
});

chromeChild.unref();

process.stdout.write(`화면: ${url} — 크롬 창을 닫아도 서버는 남습니다. 끝내려면 이 창에서 Ctrl+C 를 누르세요.\n`);
