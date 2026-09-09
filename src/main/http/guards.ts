// 요청 검문(지시서 S4 ⓑ Host · ⓒ Content-Type · ⓓ Origin/Sec-Fetch-Site).
// 서버는 같은 PC(127.0.0.1)에서만 쓰이므로, 다른 곳에서 온 요청은 전부 막는다.
import type { IncomingHttpHeaders } from "node:http";

/** 실제로 배정된 포트를 기준으로 만든 허용 Host 목록 */
export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

/** 실제로 배정된 포트를 기준으로 만든 허용 Origin 목록 */
export function allowedOrigins(port: number): string[] {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

/** S4 ⓑ — Host 헤더가 허용 목록과 정확히 일치해야 한다(아니면 400) */
export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (typeof hostHeader !== "string") {
    return false;
  }

  return allowedHosts(port).includes(hostHeader.trim().toLowerCase());
}

/**
 * S4 ⓓ — POST /api/* 의 출처 검사.
 * Origin 헤더가 있으면 정확히 일치해야 하고, Sec-Fetch-Site 헤더가 있으면 same-origin·none 이어야 한다.
 * 각 헤더는 있으면 독립으로 검사하고(하나라도 불신 값이면 거부), 둘 다 없으면 거부한다.
 */
export function isTrustedRequestSource(headers: IncomingHttpHeaders, port: number): boolean {
  const origin = typeof headers.origin === "string" ? headers.origin.trim() : undefined;
  const fetchSiteRaw = headers["sec-fetch-site"];
  const fetchSite = typeof fetchSiteRaw === "string" ? fetchSiteRaw.trim().toLowerCase() : undefined;

  if (origin === undefined && fetchSite === undefined) {
    return false;
  }

  if (origin !== undefined && !allowedOrigins(port).includes(origin.toLowerCase())) {
    return false;
  }

  if (fetchSite !== undefined && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  return true;
}

/**
 * S4 ⓒ — POST /api/* 는 application/json 만 받는다(`; charset=utf-8` 허용).
 * 예외는 없다 — 대화상자 채널도 JSON이다(S12).
 */
export function isJsonContentType(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const [type, ...parameters] = value.split(";");

  if (type.trim().toLowerCase() !== "application/json") {
    return false;
  }

  return parameters.every((parameter) => {
    const [name, parameterValue = ""] = parameter.split("=");

    return (
      name.trim().toLowerCase() === "charset" &&
      parameterValue.trim().toLowerCase().replace(/^"|"$/g, "") === "utf-8"
    );
  });
}
