import { z } from "zod";

/**
 * proxy manifest = 런타임이 소비하는 유일한 가변 입력 (PRD §7 핵심 불변식).
 * 런타임 코드는 고정, 행동은 이 manifest로만 결정.
 */

// 인증: 스펙 추론(spec_auth) vs 운영 정책(runtime_auth_policy) 분리 (PRD §4.4 D3)
export const SpecAuthSchema = z.object({
  // securitySchemes 파싱 결과 (PRD §4.4 D1)
  schemes: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["apiKey", "http", "oauth2", "openIdConnect"]),
        // apiKey: header/query/cookie 위치
        in: z.enum(["header", "query", "cookie"]).optional(),
        // http scheme: bearer/basic
        scheme: z.string().optional(),
        // 주입 시 사용할 헤더/파라미터 이름
        paramName: z.string().optional(),
      }),
    )
    .default([]),
});
export type SpecAuth = z.infer<typeof SpecAuthSchema>;

export const RuntimeAuthPolicySchema = z.object({
  // 비밀은 평문 미저장 — 외부 secret manager 참조 키만 (PRD §4.4 D4)
  secretRef: z.string().optional(),
  rotationDays: z.number().int().positive().optional(),
  rateLimitBucket: z.string().optional(),
});
export type RuntimeAuthPolicy = z.infer<typeof RuntimeAuthPolicySchema>;

export const FieldsPolicySchema = z.object({
  defaultLimit: z.number().int().positive().default(20),
  truncateBytes: z.number().int().positive().default(2048),
  maxDepth: z.number().int().positive().default(4),
  // allow-list 우선 (PRD §4.3 C5). 비면 전체 허용.
  allow: z.array(z.string()).default([]),
});
export type FieldsPolicy = z.infer<typeof FieldsPolicySchema>;

export const ManifestSchema = z.object({
  name: z.string().default("proxy"),
  specUrl: z.string().url().optional(),
  baseUrl: z.string().url(),
  headerTemplate: z.record(z.string()).default({}),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().default(30_000),
  retry: z.object({ max: z.number().int().min(0).default(2) }).default({ max: 2 }),
  rateLimit: z.object({ rps: z.number().positive() }).optional(),
  specAuth: SpecAuthSchema.default({ schemes: [] }),
  runtimeAuthPolicy: RuntimeAuthPolicySchema.default({}),
  fieldsPolicy: FieldsPolicySchema.default({}),
});

export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(input: unknown): Manifest {
  return ManifestSchema.parse(input);
}

/**
 * manifest에 비밀 평문이 들어있지 않은지 검증 (PRD §4.4 D4, §5 보안).
 * secretRef는 참조 키이므로 허용. 의심 패턴(긴 토큰형 문자열)을 탐지.
 */
export function assertNoPlaintextSecret(manifest: Manifest): void {
  const suspicious = /(?:bearer\s+|sk-|ghp_|secret|password)/i;
  const tokenLike = /^[A-Za-z0-9_\-]{24,}$/;
  for (const [k, v] of Object.entries(manifest.headerTemplate)) {
    // ${ENV} 참조는 허용
    if (/^\$\{[A-Z0-9_]+\}$/.test(v)) continue;
    if (suspicious.test(v) || tokenLike.test(v)) {
      throw new Error(`manifest.headerTemplate.${k}: 비밀 평문 의심 — \${ENV} 또는 secretRef 사용`);
    }
  }
}

/**
 * secretRef → 실제 비밀 해석. env에서만 읽음 (외부 secret manager 대리).
 * 평문은 manifest 외부(env)에만 존재 (PRD §4.4 D4).
 */
export function resolveSecret(
  policy: RuntimeAuthPolicy,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (!policy.secretRef) return undefined;
  return env[policy.secretRef];
}
