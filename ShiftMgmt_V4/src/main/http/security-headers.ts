// 모든 응답에 붙는 보안 헤더(지시서 S4 ⓕ).
// CSP가 인라인 스크립트·인라인 스타일을 막으므로 화면은 외부 .js/.css만 쓴다.
import type { ServerResponse } from "node:http";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join("; ");

export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
  ["Cache-Control", "no-store"]
];

/** 응답을 보내기 전에 한 번 호출한다(응답 종류와 상관없이 전부). */
export function applySecurityHeaders(res: ServerResponse): void {
  for (const [name, value] of SECURITY_HEADERS) {
    res.setHeader(name, value);
  }
}
