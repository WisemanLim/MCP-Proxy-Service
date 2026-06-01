import type { Manifest, SpecAuth } from "@mcp-proxy/manifest";
import type { ToolDef } from "@mcp-proxy/converter";
import { injectAuth, type RequestParts } from "./auth-injector.js";
import { ProxyError, mapUpstreamError } from "./errors.js";

/** C1 request executor: tool 입력 → upstream HTTP 요청 조립 + 실행 (timeout/retry). */

const CONTROL_KEYS = new Set(["fields", "limit", "cursor", "sort", "expand"]);

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export function buildRequest(
  tool: ToolDef,
  input: Record<string, unknown>,
  manifest: Manifest,
  specAuth: SpecAuth,
  applicableSchemes: string[],
  env: Record<string, string | undefined> = process.env,
): BuiltRequest {
  let path = tool.path;
  const parts: RequestParts = { headers: {}, query: {}, cookies: {} };
  let body: string | undefined;

  for (const pm of tool.paramMap) {
    const val = input[pm.name];
    if (val === undefined) continue;
    switch (pm.in) {
      case "path":
        path = path.replace(`{${pm.name}}`, encodeURIComponent(String(val)));
        break;
      case "query":
        parts.query[pm.name] = String(val);
        break;
      case "header":
        parts.headers[pm.name] = String(val);
        break;
      case "cookie":
        parts.cookies[pm.name] = String(val);
        break;
      case "body":
        body = JSON.stringify(val);
        break;
    }
  }

  const injected = injectAuth(parts, manifest, specAuth, applicableSchemes, env);

  const qs = new URLSearchParams(injected.query).toString();
  const base = manifest.baseUrl.replace(/\/$/, "");
  const url = `${base}${path}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = { ...injected.headers };
  if (body) headers["Content-Type"] = "application/json";
  const cookieEntries = Object.entries(injected.cookies);
  if (cookieEntries.length > 0) {
    headers["Cookie"] = cookieEntries.map(([k, v]) => `${k}=${v}`).join("; ");
  }

  return { url, method: tool.method.toUpperCase(), headers, body };
}

/** 제어 파라미터(fields/limit/...) 분리 — upstream에 보내지 않고 normalizer가 소비 (C5). */
export function splitControlParams(input: Record<string, unknown>): {
  control: Record<string, unknown>;
  rest: Record<string, unknown>;
} {
  const control: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (CONTROL_KEYS.has(k)) control[k] = v;
    else rest[k] = v;
  }
  return { control, rest };
}

export async function executeRequest(
  req: BuiltRequest,
  manifest: Manifest,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const maxRetry = manifest.retry.max;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), manifest.timeoutMs);
    try {
      const res = await fetchImpl(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const err = mapUpstreamError(res.status);
        // 5xx만 재시도 (4xx 인증/입력 오류는 즉시 반환)
        if (res.status >= 500 && attempt < maxRetry) {
          lastErr = err;
          continue;
        }
        throw err;
      }

      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ProxyError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        lastErr = new ProxyError("TIMEOUT", `요청 타임아웃 (${manifest.timeoutMs}ms)`);
        if (attempt < maxRetry) continue;
        throw lastErr;
      }
      lastErr = e;
      if (attempt < maxRetry) continue;
      throw new ProxyError("UPSTREAM_ERROR", `요청 실패: ${(e as Error).message}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProxyError("UPSTREAM_ERROR", "알 수 없는 오류");
}
