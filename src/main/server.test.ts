// 서버 검문 규칙 시험(지시서 §6 1~8).
// 서버는 port 0 으로 띄우고, Host 허용 목록은 실제로 배정된 포트를 기준으로 만들어진다.
import http from "node:http";
import { createConnection } from "node:net";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServer, startServer } from "./server";

const repoRoot = process.cwd();
const versionText = readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface RequestOptions {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

let server: Server;
let port = 0;

function request(options: RequestOptions): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const clientRequest = http.request(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path,
        headers: options.headers
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    clientRequest.on("error", reject);

    if (options.body !== undefined) {
      clientRequest.write(options.body);
    }

    clientRequest.end();
  });
}

function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "Content-Type": "application/json", ...extra };
}

/**
 * 헤더를 **요청 줄에 적힌 그대로** 보낸다.
 * 같은 헤더를 두 번 보내는 시험은 http.request 로는 못 한다(Node 가 하나로 합친다).
 */
function rawRequest(requestLines: string[], body = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(`${requestLines.join("\r\n")}\r\n\r\n${body}`);
    });

    let received = "";

    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      received += chunk;
    });
    socket.on("end", () => resolve(received));
    socket.on("error", reject);
  });
}

beforeAll(async () => {
  server = createServer({
    // version 은 일부러 넘기지 않는다 — 서버가 VERSION 파일을 스스로 읽는지를 시험 2가 확인한다.
    dataDir: path.join(repoRoot, "data"),
    // 빌드하지 않아도 시험할 수 있게 원본 화면 폴더를 정적 루트로 쓴다(빌드본은 이 파일을 그대로 복사한 것).
    staticRoot: path.join(repoRoot, "src"),
    log: () => {}
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("창구 서버", () => {
  it("1. 127.0.0.1 에만 귀를 연다(운영 경로 startServer 를 실제로 태운다)", async () => {
    // 위쪽 시험용 서버는 이 파일이 직접 listen 한 것이라 **운영 바인딩을 보증하지 못한다**
    // (server.ts 의 listen 을 0.0.0.0 으로 바꿔도 빨간불이 되지 않았다 — Codex ⑥ 지적).
    // 그래서 운영 진입점 startServer 를 port 0 으로 직접 띄워 그 서버의 주소를 본다.
    const sigintBefore = new Set<unknown>(process.listeners("SIGINT"));
    const sigtermBefore = new Set<unknown>(process.listeners("SIGTERM"));

    const production = startServer({
      port: 0,
      version: versionText,
      dataDir: path.join(repoRoot, "data"),
      staticRoot: path.join(repoRoot, "src"),
      log: () => {}
    });

    try {
      await new Promise<void>((resolve, reject) => {
        production.once("listening", resolve);
        production.once("error", reject);
      });

      expect((production.address() as AddressInfo).address).toBe("127.0.0.1");
    } finally {
      await new Promise<void>((resolve) => {
        production.close(() => resolve());
      });

      // startServer 가 이 프로세스에 달아 둔 종료 신호 처리기를 걷어낸다(시험 뒤에 남기지 않는다).
      for (const listener of process.listeners("SIGINT")) {
        if (!sigintBefore.has(listener)) {
          process.off("SIGINT", listener);
        }
      }

      for (const listener of process.listeners("SIGTERM")) {
        if (!sigtermBefore.has(listener)) {
          process.off("SIGTERM", listener);
        }
      }
    }

    // 이 파일의 나머지 시험이 쓰는 서버도 같은 주소다.
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
  });

  it("2. GET /api/health 는 판 번호와 보안 헤더를 함께 돌려준다", async () => {
    const response = await request({ path: "/api/health" });

    expect(response.status).toBe(200);

    const payload = JSON.parse(response.body) as { ok: boolean; data: { version: string } };

    expect(payload.ok).toBe(true);
    expect(payload.data.version).toBe(versionText);

    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("3. Host 를 위조하면 400(대소문자·허용 목록 표본 포함)", async () => {
    const response = await request({ path: "/api/health", headers: { Host: "evil.example" } });

    expect(response.status).toBe(400);

    const payload = JSON.parse(response.body) as { ok: boolean; errorCode: string };

    expect(payload.ok).toBe(false);
    expect(payload.errorCode).toBe("BAD_REQUEST");

    // 「정확 일치」 규칙 — 대소문자를 접어 비교하지 않는다(대문자 LOCALHOST 는 허용 목록이 아니다).
    const upperHost = await request({ path: "/api/health", headers: { Host: `LOCALHOST:${port}` } });

    expect(upperHost.status, `Host: LOCALHOST:${port}`).toBe(400);
    expect((JSON.parse(upperHost.body) as { errorCode: string }).errorCode).toBe("BAD_REQUEST");

    // 허용 목록의 나머지 한 줄(소문자 localhost)은 실제로 통과해야 한다
    // — 목록에서 지워도 빨간불이 되지 않던 자리다(Codex ⑥ 지적).
    const lowerHost = await request({ path: "/api/health", headers: { Host: `localhost:${port}` } });

    expect(lowerHost.status, `Host: localhost:${port}`).toBe(200);
    expect((JSON.parse(lowerHost.body) as { ok: boolean }).ok).toBe(true);

    // Host 를 두 번 보내면(뒤엣것이 가려진다) 순서와 상관없이 거절한다.
    const first = await rawRequest([
      "GET /api/health HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      "Host: evil.example",
      "Connection: close"
    ]);
    const second = await rawRequest([
      "GET /api/health HTTP/1.1",
      "Host: evil.example",
      `Host: 127.0.0.1:${port}`,
      "Connection: close"
    ]);

    expect(first.startsWith("HTTP/1.1 400"), first.split("\r\n")[0]).toBe(true);
    expect(second.startsWith("HTTP/1.1 400"), second.split("\r\n")[0]).toBe(true);
  });

  it("4. 없는 POST 창구는 404(BridgeFailure)", async () => {
    const response = await request({
      method: "POST",
      path: "/api/health",
      headers: jsonHeaders({ Origin: `http://127.0.0.1:${port}` }),
      body: "[]"
    });

    expect(response.status).toBe(404);

    const payload = JSON.parse(response.body) as { ok: boolean; errorCode: string };

    expect(payload.ok).toBe(false);
    expect(payload.errorCode).toBe("NOT_FOUND");
  });

  it("5. Origin·Sec-Fetch-Site 검사(충돌 조합 포함)", async () => {
    const good = `http://127.0.0.1:${port}`;

    const blocked = [
      { Origin: "http://evil.example" },
      { "Sec-Fetch-Site": "cross-site" },
      {},
      { Origin: "http://evil.example", "Sec-Fetch-Site": "same-origin" },
      { Origin: good, "Sec-Fetch-Site": "cross-site" },
      // 「정확 일치」 규칙 — 대소문자를 접어 비교하지 않는다(크롬은 언제나 소문자로 보낸다).
      { Origin: `HTTP://127.0.0.1:${port}` }
    ];

    for (const headers of blocked) {
      const response = await request({
        method: "POST",
        path: "/api/x",
        headers: jsonHeaders(headers),
        body: "[]"
      });

      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect((JSON.parse(response.body) as { errorCode: string }).errorCode).toBe("FORBIDDEN");
    }

    // 허용 목록의 나머지 한 줄(http://localhost)도 실제로 통과해야 한다
    // — 목록에서 지워도 빨간불이 되지 않던 자리다(Codex ⑥ 지적).
    const allowed = [
      { Origin: good },
      { "Sec-Fetch-Site": "same-origin" },
      { Origin: `http://localhost:${port}` }
    ];

    for (const headers of allowed) {
      const response = await request({
        method: "POST",
        path: "/api/x",
        headers: jsonHeaders(headers),
        body: "[]"
      });

      expect(response.status, JSON.stringify(headers)).toBe(404);
    }
  });

  it("6. JSON 이 아닌 형식은 415", async () => {
    for (const contentType of ["text/plain", "multipart/form-data; boundary=x"]) {
      const response = await request({
        method: "POST",
        path: "/api/x",
        headers: { "Content-Type": contentType, Origin: `http://127.0.0.1:${port}` },
        body: "hello"
      });

      expect(response.status, contentType).toBe(415);
      expect((JSON.parse(response.body) as { errorCode: string }).errorCode).toBe("UNSUPPORTED_MEDIA_TYPE");
    }

    // Content-Type 을 두 번 보내면(뒤엣것이 가려진다) 순서와 상관없이 거절한다.
    for (const pair of [
      ["Content-Type: application/json", "Content-Type: text/plain"],
      ["Content-Type: text/plain", "Content-Type: application/json"]
    ]) {
      const raw = await rawRequest(
        [
          "POST /api/x HTTP/1.1",
          `Host: 127.0.0.1:${port}`,
          `Origin: http://127.0.0.1:${port}`,
          ...pair,
          "Content-Length: 2",
          "Connection: close"
        ],
        "[]"
      );

      expect(raw.startsWith("HTTP/1.1 415"), raw.split("\r\n")[0]).toBe(true);
    }
  });

  it("7. 1 MB 를 넘는 본문은 413", async () => {
    const body = `"${"a".repeat(1024 * 1024 - 1)}"`;

    expect(Buffer.byteLength(body, "utf8")).toBe(1024 * 1024 + 1);

    const response = await request({
      method: "POST",
      path: "/api/x",
      headers: jsonHeaders({ Origin: `http://127.0.0.1:${port}` }),
      body
    });

    expect(response.status).toBe(413);
    expect((JSON.parse(response.body) as { errorCode: string }).errorCode).toBe("PAYLOAD_TOO_LARGE");
  });

  it("8. GET / 는 준비 화면을 돌려준다(인라인 스크립트·스타일 없음)", async () => {
    const response = await request({ path: "/" });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("교대근무관리 시스템");
    expect(response.body).toContain('<link rel="icon" href="data:,">');

    const scriptTags = response.body.match(/<script\b[^>]*>/g) ?? [];

    expect(scriptTags.length).toBeGreaterThan(0);
    expect(scriptTags.every((tag) => /\ssrc=/.test(tag))).toBe(true);
    expect(response.body).not.toMatch(/<style[\s>]/);
    expect(response.body).not.toMatch(/\sstyle=/);
  });
});
