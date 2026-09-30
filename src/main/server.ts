// 프로그램의 서버(창구) 진입점.
// 이 프로그램은 한 대의 PC 안에서만 돈다 — 127.0.0.1 에만 귀를 열고, 화면은 크롬으로 연다.
//
//   개발 중 실행: npm run dev   (빌드 → 서버 → 크롬)
//   빌드본 실행:  npm start
//
// 요청 검문·보안 헤더·정적 파일 규칙은 http/ 아래 파일들이 갖고 있다.
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";

import {
  countHeaderOccurrences,
  isAllowedHost,
  isJsonContentType,
  isTrustedRequestSource
} from "./http/guards";
import { readJsonArrayBody, sendFailure, sendJson } from "./http/json";
import { applySecurityHeaders } from "./http/security-headers";
import { createStaticFiles } from "./http/static-files";
import { isApiPath, resolveGetRoute, resolvePostRoute, type ApiContext } from "./http/router";
import type { RouteRegistry } from "./http/route-registry";
import type { SessionManager } from "./http/session";
import type { DialogBridge } from "./http/api-types";
import { AppRuntime } from "./runtime";
import { documentLayoutPreviewArtifactService } from "./services/document-layout-preview-artifact-service";

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
  /** 라우트 레지스트리 */
  routeRegistry?: RouteRegistry;
  /** 세션 관리자 */
  sessionManager?: SessionManager;
  /** 다이얼로그 브리지 */
  dialogBridge?: DialogBridge;
  /** 런타임 */
  runtime?: AppRuntime;
  /** PowerShell 대화상자 스크립트 경로 */
  scriptPath?: string;
  /** 미리보기 아티팩트 해석기(기본값 = 싱글톤 서비스) */
  previewArtifactResolver?: {
    resolveArtifact: (
      previewId: string,
      memberId: string
    ) => { bytes: Buffer; mediaType: string; fileName: string } | null;
  };
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

  const runtime =
    options.runtime ??
    new AppRuntime({
      dataDir,
      version,
      scriptPath: options.scriptPath,
      sessionManager: options.sessionManager,
      dialogBridge: options.dialogBridge,
      registry: options.routeRegistry,
    });

  if (!options.runtime) {
    runtime.initialize();
  }

  const dialogBridge = options.dialogBridge ?? runtime.dialogBridge;
  const routeRegistry = options.routeRegistry ?? runtime.registry;
  const sessionManager = options.sessionManager ?? runtime.sessionManager;
  const previewArtifactResolver =
    options.previewArtifactResolver ?? documentLayoutPreviewArtifactService;

  const staticFiles = createStaticFiles({ root: staticRoot });
  const context: ApiContext = { version, dataDir, routeRegistry };

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

    // S4 ⓑ — Host 위조 차단(Host 가 두 번 이상 오면 뒤엣것이 가려지므로 그것도 거절한다)
    if (countHeaderOccurrences(req.rawHeaders, "host") !== 1 || !isAllowedHost(req.headers.host, port)) {
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
      const PREVIEW_PREFIX = "/api/document-layout-previews/";
      if (pathname.startsWith(PREVIEW_PREFIX)) {
        const subPath = pathname.slice(PREVIEW_PREFIX.length);
        const segments = subPath.split("/");
        if (segments.length !== 2) {
          sendFailure(res, 404);
          return;
        }

        const [previewId, memberId] = segments as [string, string];
        const cookieHeader = req.headers.cookie;
        const guardResult = sessionManager.requireRoleSession("admin", cookieHeader);
        if (!guardResult.ok) {
          sendJson(res, guardResult.status, guardResult.body);
          return;
        }

        const artifact = previewArtifactResolver.resolveArtifact(previewId, memberId);
        if (!artifact) {
          sendFailure(res, 404);
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", artifact.mediaType);
        res.setHeader("Content-Length", String(artifact.bytes.length));
        res.setHeader("Cache-Control", "no-store");
        res.end(artifact.bytes);
        return;
      }

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

    // S4 ⓒ — JSON 만 받는다(예외 없음. Content-Type 이 두 번 이상 와도 거절한다)
    if (
      countHeaderOccurrences(req.rawHeaders, "content-type") !== 1 ||
      !isJsonContentType(req.headers["content-type"])
    ) {
      sendFailure(res, 415);
      return;
    }

    // S4 ⓖ & R2 — 1 MB 초과 413, 비배열 400
    const body = await readJsonArrayBody(req);

    if (!body.ok) {
      if (body.sendable) {
        sendFailure(res, body.status);
      }

      return;
    }

    const channel = pathname.startsWith("/api/") ? pathname.slice(5) : "";

    const abortController = new AbortController();
    req.on("aborted", () => abortController.abort());
    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    if (routeRegistry) {
      try {
        const dispatchResult = await routeRegistry.dispatch(
          channel,
          body.value,
          {
            headers: req.headers,
            cookie: req.headers.cookie,
            signal: abortController.signal,
            version,
            dataDir,
            dialogBridge,
          },
        );

        if (dispatchResult === null) {
          const fallback = resolvePostRoute(pathname);
          if (fallback !== undefined) {
            sendJson(res, 200, await fallback(body.value, context));
            return;
          }
          sendFailure(res, 404);
          return;
        }

        if (dispatchResult.setCookie) {
          res.setHeader("Set-Cookie", dispatchResult.setCookie);
        }

        sendJson(res, dispatchResult.status, dispatchResult.body);
      } catch {
        sendFailure(res, 500);
      }
      return;
    }

    const handler = resolvePostRoute(pathname);

    if (handler === undefined) {
      sendFailure(res, 404);
      return;
    }

    try {
      sendJson(res, 200, await handler(body.value, context));
    } catch {
      sendFailure(res, 500);
    }
  }

  return server;
}

export interface StartServerOptions extends CreateServerOptions {
  port?: number;
  exit?: (code?: number) => void;
}

/** 데이터 폴더를 만들고 127.0.0.1 에만 듣기 시작한다. */
export function startServer(options: StartServerOptions = {}): Server {
  const repoRoot = resolveRepoRoot();
  const version = options.version ?? readVersion(repoRoot);
  const dataDir = options.dataDir ?? resolveDataDir();
  const port = options.port ?? resolvePort();

  const runtime =
    options.runtime ??
    new AppRuntime({
      dataDir,
      version,
      scriptPath: options.scriptPath,
      sessionManager: options.sessionManager,
      dialogBridge: options.dialogBridge,
      registry: options.routeRegistry,
    });

  runtime.initialize();

  const server = createServer({
    ...options,
    version,
    dataDir,
    runtime,
    routeRegistry: runtime.registry,
    sessionManager: runtime.sessionManager,
    dialogBridge: runtime.dialogBridge,
  });

  // 크롬은 연결을 열어 둔 채(keep-alive) 기다린다.
  // 놀고 있는 연결을 서버가 먼저 끊으면 상대(크롬)가 응답하지 않는 한 OS 목록에 오래 남으므로,
  // 끊지 않고 갖고 있다가 종료할 때 한꺼번에 정리한다(같은 PC 안, 사용자 한 명이라 연결 수가 적다).
  server.keepAliveTimeout = 0;

  const openSockets = new Set<Socket>();

  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.on("close", () => {
      openSockets.delete(socket);
    });
  });

  server.listen(port, "127.0.0.1", () => {
    const actual = currentPort(server);

    runtime.startBackground();

    process.stdout.write(
      `서버 실행 중 — http://127.0.0.1:${actual} · 판 ${version} · Node ${process.version} · 데이터 폴더: ${dataDir}\n`
    );
  });

  let shutdownCoordinatorPromise: Promise<void> | null = null;

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownCoordinatorPromise) {
      return shutdownCoordinatorPromise;
    }

    shutdownCoordinatorPromise = (async () => {
      process.stdout.write(`서버를 종료합니다(${signal}).\n`);

      for (const socket of openSockets) {
        socket.resetAndDestroy();
      }

      server.closeAllConnections();

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      await runtime.shutdownOnce();

      const exitFn = options.exit ?? process.exit;
      exitFn(0);
    })();

    return shutdownCoordinatorPromise;
  };

  const sigintListener = () => {
    void shutdown("SIGINT");
  };
  const sigtermListener = () => {
    void shutdown("SIGTERM");
  };

  process.on("SIGINT", sigintListener);
  process.on("SIGTERM", sigtermListener);

  server.on("close", () => {
    process.removeListener("SIGINT", sigintListener);
    process.removeListener("SIGTERM", sigtermListener);
  });

  return server;
}

// 이 파일을 직접 실행했을 때만 서버를 띄운다(테스트가 불러올 때는 띄우지 않는다).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  startServer();
}
