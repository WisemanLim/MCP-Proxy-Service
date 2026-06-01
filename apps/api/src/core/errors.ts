/** D5 구조화 오류: raw 4xx/5xx 를 MCP 친화 코드로 정규화 (PRD §4.4). */

export type ProxyErrorCode =
  | "AUTH_EXPIRED"
  | "MISSING_SCOPE"
  | "INVALID_API_KEY"
  | "UPSTREAM_AUTH_UNAVAILABLE"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "BAD_INPUT";

export class ProxyError extends Error {
  constructor(
    public code: ProxyErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

/** upstream HTTP status → 구조화 코드. raw body는 노출하지 않음. */
export function mapUpstreamError(status: number): ProxyError {
  switch (status) {
    case 401:
      return new ProxyError("INVALID_API_KEY", "업스트림 인증 실패 (401)", status);
    case 403:
      return new ProxyError("MISSING_SCOPE", "권한 부족 (403)", status);
    case 419:
      return new ProxyError("AUTH_EXPIRED", "인증 만료 (419)", status);
    case 503:
      return new ProxyError("UPSTREAM_AUTH_UNAVAILABLE", "업스트림 인증 불가 (503)", status);
    default:
      return new ProxyError("UPSTREAM_ERROR", `업스트림 오류 (${status})`, status);
  }
}
