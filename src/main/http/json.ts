// 창구(HTTP) 요청 본문 읽기와 JSON 응답 보내기.
// 규약은 docs/api-convention.md §3(응답·오류 코드 표)이 정본이다.
import type { IncomingMessage, ServerResponse } from "node:http";

/** 계약 반환형: 성공 */
export interface BridgeSuccess<T> {
  ok: true;
  data: T;
}

/** 계약 반환형: 실패(비 200 응답의 본문도 이 형태다) */
export interface BridgeFailure {
  ok: false;
  errorCode: string;
  message: string;
}

export type BridgeResult<T> = BridgeSuccess<T> | BridgeFailure;

/** 요청 본문 상한 1 MB(초과 = 413) */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 415 | 500;

/** HTTP 상태 → 오류 코드·한국어 문구 표(docs/api-convention.md §3) */
export const HTTP_ERRORS: Record<ErrorStatus, BridgeFailure> = {
  400: {
    ok: false,
    errorCode: "BAD_REQUEST",
    message: "요청 내용이 올바르지 않습니다. 프로그램 창을 새로 고친 뒤 다시 시도해 주세요."
  },
  401: {
    ok: false,
    errorCode: "UNAUTHORIZED",
    message: "로그인이 필요합니다. 다시 로그인해 주세요."
  },
  403: {
    ok: false,
    errorCode: "FORBIDDEN",
    message: "이 프로그램 화면에서 보낸 요청이 아닙니다. 프로그램 창에서 다시 시도해 주세요."
  },
  404: {
    ok: false,
    errorCode: "NOT_FOUND",
    message: "요청한 창구를 찾을 수 없습니다."
  },
  413: {
    ok: false,
    errorCode: "PAYLOAD_TOO_LARGE",
    message: "보낸 내용이 너무 큽니다(1 MB를 넘었습니다)."
  },
  415: {
    ok: false,
    errorCode: "UNSUPPORTED_MEDIA_TYPE",
    message: "요청 형식이 올바르지 않습니다. 이 창구는 JSON만 받습니다."
  },
  500: {
    ok: false,
    errorCode: "INTERNAL_ERROR",
    message: "프로그램 안에서 오류가 났습니다. 잠시 뒤 다시 시도해 주세요."
  }
};

/** JSON 본문을 보낸다. 보안 헤더는 응답 시작 전에 이미 붙어 있다(security-headers.ts). */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), "utf8");

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(payload.byteLength));
  res.end(payload);
}

/**
 * 오류 상태와 그에 맞는 BridgeFailure 본문을 함께 보낸다.
 * message 를 주면 문구만 상황에 맞게 바꾼다(오류 코드는 표 그대로).
 */
export function sendFailure(res: ServerResponse, status: ErrorStatus, message?: string): void {
  const failure = HTTP_ERRORS[status];

  sendJson(res, status, message === undefined ? failure : { ...failure, message });
}

export type ReadJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; sendable: boolean };

/**
 * 요청 본문을 JSON으로 읽는다.
 * - 1 MB 초과 → 413. 상한을 넘은 뒤로는 **모아 두지 않고 흘려보내며**(메모리는 1 MB 를 넘지 않는다),
 *   끝까지 받은 뒤 413을 돌려준다 — 그래야 보낸 쪽이 상태 코드와 BridgeFailure 본문을 받는다.
 *   끝없이 보내는 요청은 Node 의 requestTimeout 이 끊는다.
 * - JSON이 아니면 → 400
 */
export function readJsonBody(
  req: IncomingMessage,
  limit: number = MAX_JSON_BODY_BYTES
): Promise<ReadJsonBodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    let settled = false;

    const settle = (result: ReadJsonBodyResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;

      if (total > limit) {
        tooLarge = true;
        chunks.length = 0;

        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (tooLarge) {
        settle({ ok: false, status: 413, sendable: true });
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf8");

      if (raw.trim().length === 0) {
        settle({ ok: true, value: undefined });
        return;
      }

      try {
        settle({ ok: true, value: JSON.parse(raw) });
      } catch {
        settle({ ok: false, status: 400, sendable: true });
      }
    });

    req.on("error", () => {
      settle({ ok: false, status: 400, sendable: false });
    });
  });
}
