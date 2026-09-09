// 프로그램의 서버(창구) 진입점.
// 이 프로그램은 한 대의 PC 안에서만 돈다 — 127.0.0.1 에만 귀를 열고, 화면은 크롬으로 연다.
//
//   개발 중 실행: npm run dev   (빌드 → 서버 → 크롬)
//   빌드본 실행:  npm start
//
// 요청 검문·보안 헤더·정적 파일 규칙은 http/ 아래 파일들이 갖고 있다.
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";

import { isAllowedHost, isJsonContentType, isTrustedRequestSource } from "./http/guards";
import { readJsonBody, sendFailure, sendJson } from "./http/json";
import { applySecurityHeaders } from "./http/security-headers";
import { createStaticFiles } from "./http/static-files";
import { isApiPath, resolveGetRoute, resolvePostRoute, type ApiContext } from "./http/router";

/** 기본 포트(환경변수 SHIFTMGMT_PORT 로 바꿀 수 있다) */
export const DEFAULT_PORT = 8734;

/** 데이터 폴더 기본 위치의 폴더 이름(환경변수 SHIFTMGMT_USER_DATA_DIR 로 덮어쓸 수 있다) */
export const DATA_DIR_NAME = "ShiftMgmt_V4";

/** VERSION 파일이 있는 저장소 뿌리를 찾는다(실행 위치가 어디든 같은 값이 나오게). */
export function resolveRepoRoot(): string {
  const starts = [process.cwd()];

  if (typeof __dirname !== "undefined") {
    starts.push(__dirname);
  }

  for (const start of starts) {
    let dir = path.resolve(start);

    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(path.join(dir, "VERSION"))) {
        return dir;
      }

      const parent = path.dirname(dir);

      if (parent === dir) {
        break;
      }

      dir = parent;
    }
  }

  return path.resolve(process.cwd());
}

/** 루트 VERSION 파일에 적힌 판 번호 */
export function readVersion(repoRoot: string = resolveRepoRoot()): string {
  return readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
}

/** 데이터 폴더(설정·DB) — 원본 0.5.4 와 같은 이름의 환경변수를 쓴다 */
export function resolveDataDir(): string {
  const override = process.env.SHIFTMGMT_USER_DATA_DIR;

  if (typeof override === "string" && override.trim().length > 0) {
    return path.resolve(override.trim());
  }

  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");

  return path.join(localAppData, DATA_DIR_NAME);
}

export function resolvePort(): number {
  const raw = process.env.SHIFTMGMT_PORT;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}

export interface CreateServerOptions {
  /** 판 번호(기본값 = 루트 VERSION 파일) */
  version?: string;
  /** 데이터 폴더(기본값 = %LOCALAPPDATA%\ShiftMgmt_V4) */
  dataDir?: string;
  /** 정적 파일 뿌리(기본값 = dist/browser) */
  staticRoot?: string;
  /** 요청 기록 1줄(기본값 = 표준 출력) */
  log?: (line: string) => void;
}

/** 실제로 배정된 포트(port 0 으로 띄운 테스트에서도 이 값이 검문 기준이 된다) */
function currentPort(server: Server): number {
  const address = server.address();

  return typeof address === "object" && address !== null ? address.port : 0;
}

/**
 * 서버를 만들기만 한다(듣기 시작하지 않는다 — 테스트가 port 0 으로 띄울 수 있게 분리).
 */
export function createServer(options: CreateServerOptions = {}): Server {
  const repoRoot = resolveRepoRoot();
  const version = options.version ?? readVersion(repoRoot);
  const dataDir = options.dataDir ?? resolveDataDir();
  const staticRoot = options.staticRoot ?? path.join(repoRoot, "dist", "browser");
  const log =
    options.log ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });

  const staticFiles = createStaticFiles({ root: staticRoot });
  const context: ApiContext = { version, dataDir };

  const server = createHttpServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawTarget = req.url ?? "/";
    const method = req.method ?? "GET";

    // 요청 기록 1줄 — 크롬이 몰래 요청하는 /favicon.ico 같은 것도 여기 남는다.
    res.on("finish", () => {
      log(`${method} ${rawTarget} ${res.statusCode}`);
    });

    applySecurityHeaders(res);

    const port = currentPort(server);

    // S4 ⓑ — Host 위조 차단
    if (!isAllowedHost(req.headers.host, port)) {
      sendFailure(res, 400);
      return;
    }

    const pathname = rawTarget.split("?")[0].split("#")[0];

    if (isApiPath(pathname)) {
      await handleApiRequest(req, res, method, pathname, port);
      return;
    }

    if (method !== "GET") {
      sendFailure(res, 404, "요청한 파일을 찾을 수 없습니다.");
      return;
    }

    const file = await staticFiles.serve(rawTarget);

    if (file.status === 404 || file.body === undefined || file.contentType === undefined) {
      sendFailure(res, 404, "요청한 파일을 찾을 수 없습니다.");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.body.byteLength));
    res.end(file.body);
  }

  async function handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    pathname: string,
    port: number
  ): Promise<void> {
    if (method === "GET") {
      const handler = resolveGetRoute(pathname);

      if (handler === undefined) {
        sendFailure(res, 404);
        return;
      }

      sendJson(res, 200, handler(context));
      return;
    }

    if (method !== "POST") {
      sendFailure(res, 404);
      return;
    }

    // S4 ⓓ — 이 프로그램 화면에서 온 요청인지
    if (!isTrustedRequestSource(req.headers, port)) {
      sendFailure(res, 403);
      return;
    }

    // S4 ⓒ — JSON 만 받는다(예외 없음)
    if (!isJsonContentType(req.headers["content-type"])) {
      sendFailure(res, 415);
      return;
    }

    // S4 ⓖ — 1 MB 초과 413
    const body = await readJsonBody(req);

    if (!body.ok) {
      if (body.sendable) {
        sendFailure(res, body.status);
      }

      return;
    }

    const handler = resolvePostRoute(pathname);

    if (handler === undefined) {
      sendFailure(res, 404);
      return;
    }

    const args = Array.isArray(body.value) ? body.value : [];

    try {
      sendJson(res, 200, await handler(args, context));
    } catch {
      sendFailure(res, 500);
    }
  }

  return server;
}

export interface StartServerOptions extends CreateServerOptions {
  port?: number;
}

/** 데이터 폴더를 만들고 127.0.0.1 에만 듣기 시작한다. */
export function startServer(options: StartServerOptions = {}): Server {
  const repoRoot = resolveRepoRoot();
  const version = options.version ?? readVersion(repoRoot);
  const dataDir = options.dataDir ?? resolveDataDir();
  const port = options.port ?? resolvePort();

  mkdirSync(dataDir, { recursive: true });

  const server = createServer({ ...options, version, dataDir });

  // 크롬은 연결을 열어 둔 채(keep-alive) 기다린다. 끝낼 때 이 연결들을 끊어야 포트가 곧바로 정리된다.
  const openSockets = new Set<Socket>();

  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.on("close", () => {
      openSockets.delete(socket);
    });
  });

  server.listen(port, "127.0.0.1", () => {
    const actual = currentPort(server);

    process.stdout.write(
      `서버 실행 중 — http://127.0.0.1:${actual} · 판 ${version} · Node ${process.version} · 데이터 폴더: ${dataDir}\n`
    );
  });

  const shutdown = (signal: string): void => {
    process.stdout.write(`서버를 종료합니다(${signal}).\n`);
    server.close(() => {
      process.exit(0);
    });

    // 남은 연결을 즉시 끊는다(끊긴 연결이 OS 목록에 남아 8734 가 오래 보이는 것을 막는다).
    for (const socket of openSockets) {
      socket.resetAndDestroy();
    }

    server.closeAllConnections();
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  return server;
}

// 이 파일을 직접 실행했을 때만 서버를 띄운다(테스트가 불러올 때는 띄우지 않는다).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  startServer();
}
