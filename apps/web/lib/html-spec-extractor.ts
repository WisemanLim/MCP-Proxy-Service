import { loadSpecFromString, type OpenAPISpec } from "@mcp-proxy/converter";

const TIMEOUT = 5_000;

/**
 * HTML API 문서(Swagger UI / Redoc 등)에서 OpenAPI 스펙 자동 추출 (PRD §4.6 P1).
 * 3단계: ① JS 내 url 패턴 → ② href JSON/YAML 링크 → ③ origin 공통 경로 fallback.
 * 실패 시 Error("html_spec_not_found: ...") throw.
 */
export async function extractSpecFromHtml(html: string, sourceUrl: string): Promise<OpenAPISpec> {
  const base = new URL(sourceUrl);
  const candidateUrls = new Set<string>();

  // ① SwaggerUI / Redoc JS 설정의 url: "..." 패턴
  const jsUrlPat = /(?:^|[,{(\s])url\s*:\s*["']([^"']+)["']/gm;
  // ① 경로에 openapi/swagger/api-docs 포함된 따옴표 문자열
  const quotedPathPat = /["']([^"']*\/(?:openapi|swagger|api[-_]?docs?)[^"']*\.(?:json|yaml))["']/gi;
  // ② <a href> 또는 <link href>의 JSON/YAML 파일
  const hrefPat = /href=["']([^"']+\.(?:json|yaml))["']/gi;

  for (const pat of [jsUrlPat, quotedPathPat, hrefPat]) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(html)) !== null) {
      try { candidateUrls.add(new URL(m[1], base).toString()); } catch { /* skip */ }
    }
  }

  for (const url of candidateUrls) {
    const spec = await tryFetchSpec(url);
    if (spec) return spec;
  }

  // ③ origin 기준 공통 스펙 경로 fallback
  const fallbackPaths = [
    "/openapi.json", "/openapi.yaml",
    "/swagger.json", "/swagger.yaml",
    "/v3/api-docs", "/v2/api-docs", "/api-docs",
    "/api/openapi.json",
  ];
  for (const p of fallbackPaths) {
    const spec = await tryFetchSpec(base.origin + p);
    if (spec) return spec;
  }

  throw new Error(
    "html_spec_not_found: HTML 페이지에서 OpenAPI 스펙을 자동으로 찾을 수 없습니다. " +
    "직접 스펙 URL을 입력하세요 (예: /openapi.json, /swagger/v3/api-docs, /v2/api-docs)",
  );
}

async function tryFetchSpec(url: string): Promise<OpenAPISpec | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return null;
    const text = await r.text();
    if (text.trimStart().startsWith("<")) return null;
    return loadSpecFromString(text);
  } catch {
    return null;
  }
}
