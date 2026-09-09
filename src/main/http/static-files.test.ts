// 정적 파일 경로 검사 시험(지시서 §6 9~13).
// 요청은 http.request 로 **raw request target** 을 그대로 보낸다 —
// new URL() 을 거치면 `/../` 가 미리 정리돼 검사 자체가 무의미해지기 때문이다.
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createServer } from "../server";
import { createStaticFiles } from "./static-files";

const MARKER = "이 파일은 정적 루트 바깥에 있습니다 — 절대 내주면 안 됩니다.";

let temporaryRoot = "";
let staticRoot = "";
let server: Server;
let port = 0;

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(requestPath: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const clientRequest = http.request({ host: "127.0.0.1", port, path: requestPath }, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });

    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

beforeAll(async () => {
  temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-static-"));
  staticRoot = path.join(temporaryRoot, "root");

  mkdirSync(path.join(staticRoot, "web", "assets", "woff2"), { recursive: true });
  writeFileSync(path.join(temporaryRoot, "OUTSIDE.txt"), MARKER, "utf8");
  // 형식 표에 있는 확장자로도 하나 둔다(시험 11이 경로 검사만 남겨 두고 확인하기 위해).
  writeFileSync(path.join(temporaryRoot, "OUTSIDE.css"), `/* ${MARKER} */`, "utf8");
  writeFileSync(path.join(staticRoot, "web", "styles.css"), "body { margin: 0; }", "utf8");
  writeFileSync(path.join(staticRoot, "web", "app.js"), "", "utf8");
  writeFileSync(path.join(staticRoot, "web", "app.js.map"), "", "utf8");
  writeFileSync(path.join(staticRoot, "web", "assets", "x.css"), "", "utf8");
  writeFileSync(path.join(staticRoot, "web", "assets", "woff2", "a.woff2"), "", "utf8");

  server = createServer({
    version: "0.0.0-test",
    dataDir: temporaryRoot,
    staticRoot,
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

describe("정적 파일", () => {
  it("9. 루트 밖으로 나가려는 요청은 전부 404 이고 바깥 파일 내용이 새지 않는다", async () => {
    const targets = [
      "/../OUTSIDE.txt",
      "/%2e%2e/OUTSIDE.txt",
      "/..%2fOUTSIDE.txt",
      "/..%5cOUTSIDE.txt",
      "/%252e%252e/OUTSIDE.txt",
      "/web/%zz.css",
      "/web/a%00.css",
      // 위 7개가 지시서 §6-9 목록이고, 아래는 「형식을 아는 확장자」로도 막히는지 함께 본다.
      "/../OUTSIDE.css",
      "/web/styles.css?q=%2f"
    ];

    for (const target of targets) {
      const response = await request(target);

      expect(response.status, target).toBe(404);
      expect(response.body, target).not.toContain(MARKER);
      expect(response.body, target).not.toContain("정적 루트 바깥");
    }
  });

  it("10. 정상 경로는 200 으로 내준다", async () => {
    const response = await request("/web/styles.css");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect(response.body).toContain("margin");
  });

  it("11. 루트 밖 경로는 파일 시스템에 손대기 전에 404 다", async () => {
    const readFile = vi.fn(async () => Buffer.from("읽으면 안 된다"));
    const stat = vi.fn(async () => ({ isFile: () => true }));
    const files = createStaticFiles({ root: staticRoot, readFile, stat });

    // 확장자를 **내줄 수 있는 것**(.css)으로 둔다 — 그래야 404 의 이유가 「형식을 모른다」가 아니라
    // 「루트 밖이라 경로 검사에서 걸렸다」임이 분명해진다(.txt 는 형식 표에 없어 어차피 404다).
    for (const target of ["/../OUTSIDE.css", "/%2e%2e/OUTSIDE.css", "/../OUTSIDE.txt", "/..%5cOUTSIDE.txt"]) {
      const result = await files.serve(target);

      expect(result.status, target).toBe(404);
    }

    expect(readFile).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();

    const allowed = await files.serve("/web/styles.css");

    expect(allowed.status).toBe(200);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("12. 디렉터리 요청은 목록을 내주지 않고 404 다", async () => {
    const response = await request("/web/");

    expect(response.status).toBe(404);
    expect(response.body).not.toContain("styles.css");
  });

  it("13. 확장자별 형식이 표대로 나간다", async () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      ["/web/app.js", "text/javascript; charset=utf-8"],
      ["/web/app.js.map", "application/json"],
      ["/web/assets/woff2/a.woff2", "font/woff2"],
      ["/web/assets/x.css", "text/css; charset=utf-8"]
    ];

    for (const [target, contentType] of expected) {
      const response = await request(target);

      expect(response.status, target).toBe(200);
      expect(response.headers["content-type"], target).toBe(contentType);
    }
  });
});
