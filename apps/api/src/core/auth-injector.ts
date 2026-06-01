import { type Manifest, resolveSecret } from "@mcp-proxy/manifest";
import type { SpecAuth } from "@mcp-proxy/manifest";

/** D2 auth injector: header/query/cookie 공통 삽입. 비밀은 env(secretRef)에서만 (D4). */

export interface RequestParts {
  headers: Record<string, string>;
  query: Record<string, string>;
  cookies: Record<string, string>;
}

/** ${ENV} 참조 해석 — 평문 비밀은 manifest에 없음 (PRD §4.4 D4). */
function resolveTemplate(value: string, env: Record<string, string | undefined>): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k] ?? "");
}

export function injectAuth(
  parts: RequestParts,
  manifest: Manifest,
  specAuth: SpecAuth,
  applicableSchemes: string[],
  env: Record<string, string | undefined> = process.env,
): RequestParts {
  const out: RequestParts = {
    headers: { ...parts.headers },
    query: { ...parts.query },
    cookies: { ...parts.cookies },
  };

  // 1) manifest headerTemplate (${ENV} 해석)
  for (const [k, v] of Object.entries(manifest.headerTemplate)) {
    out.headers[k] = resolveTemplate(v, env);
  }

  // 2) securityScheme 기반 주입
  const secret = resolveSecret(manifest.runtimeAuthPolicy, env);
  if (secret) {
    for (const schemeName of applicableSchemes) {
      const scheme = specAuth.schemes.find((s) => s.name === schemeName);
      if (!scheme) continue;
      if (scheme.type === "apiKey") {
        const pname = scheme.paramName ?? "Authorization";
        if (scheme.in === "query") out.query[pname] = secret;
        else if (scheme.in === "cookie") out.cookies[pname] = secret;
        else out.headers[pname] = secret;
      } else if (scheme.type === "http") {
        if (scheme.scheme === "basic") out.headers["Authorization"] = `Basic ${secret}`;
        else out.headers["Authorization"] = `Bearer ${secret}`;
      } else if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
        out.headers["Authorization"] = `Bearer ${secret}`;
      }
    }
  }

  return out;
}
