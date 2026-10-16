// 정적 파일(화면) 제공 — 정적 루트는 dist/browser 다.
// 경로 검사는 지시서 S4 ⓗ: raw request target 을 그대로 보고(브라우저 주소 정규화에 기대지 않는다)
// 루트 밖으로 나가는 요청은 파일 시스템에 손대기 전에 404로 끊는다.
import path from "node:path";
import { readFile as fsReadFile, stat as fsStat } from "node:fs/promises";

export type ReadFileFn = (filePath: string) => Promise<Buffer>;
export type StatFn = (filePath: string) => Promise<{ isFile(): boolean }>;

export interface StaticFilesOptions {
  root: string;
  /** 테스트에서 주입(루트 밖 요청은 이 함수가 불리지 않아야 한다) */
  readFile?: ReadFileFn;
  stat?: StatFn;
}

export interface StaticFileResponse {
  status: 200 | 404;
  contentType?: string;
  body?: Buffer;
}

/** 지시서 §3 static-files.ts — 확장자별 형식(목록에 없는 확장자는 내주지 않는다) */
export const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

/** `GET /` 이 가리키는 파일 */
export const INDEX_PATH = "/web/index.html";

const ENCODED_SEPARATORS = /%2f|%5c|%00/i;
const BAD_PERCENT = /%(?![0-9a-fA-F]{2})/;

/**
 * raw request target → 실제 파일 경로.
 * 루트 밖이거나 형식이 수상하면 null(= 404). 파일 시스템은 건드리지 않는다.
 */
export function resolveStaticPath(root: string, rawTarget: string): string | null {
  // 검사 대상은 **요청 줄에 적힌 그대로**(질의 문자열 포함)다 — 뒤를 잘라내고 보면 검사에 구멍이 생긴다.
  if (ENCODED_SEPARATORS.test(rawTarget) || rawTarget.includes("\\") || BAD_PERCENT.test(rawTarget)) {
    return null;
  }

  const rawPath = rawTarget.split("?")[0].split("#")[0];

  if (rawPath.length === 0 || !rawPath.startsWith("/")) {
    return null;
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\")) {
    return null;
  }

  const pathname = decoded === "/" ? INDEX_PATH : decoded;

  // 디렉터리 요청은 목록을 내주지 않는다.
  if (pathname.endsWith("/")) {
    return null;
  }

  const resolved = path.resolve(root, "." + pathname);
  const relative = path.relative(root, resolved);

  if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return resolved;
}

export function contentTypeFor(filePath: string): string | undefined {
  return MIME_TYPES[path.extname(filePath).toLowerCase()];
}

export interface StaticFiles {
  resolve(rawTarget: string): string | null;
  serve(rawTarget: string): Promise<StaticFileResponse>;
}

export function createStaticFiles(options: StaticFilesOptions): StaticFiles {
  const root = path.resolve(options.root);
  const readFile = options.readFile ?? ((filePath: string) => fsReadFile(filePath));
  const stat = options.stat ?? ((filePath: string) => fsStat(filePath));

  return {
    resolve(rawTarget: string): string | null {
      return resolveStaticPath(root, rawTarget);
    },

    async serve(rawTarget: string): Promise<StaticFileResponse> {
      const filePath = resolveStaticPath(root, rawTarget);

      if (filePath === null) {
        return { status: 404 };
      }

      const contentType = contentTypeFor(filePath);

      if (contentType === undefined) {
        return { status: 404 };
      }

      try {
        const info = await stat(filePath);

        if (!info.isFile()) {
          return { status: 404 };
        }

        return { status: 200, contentType, body: await readFile(filePath) };
      } catch {
        return { status: 404 };
      }
    }
  };
}
