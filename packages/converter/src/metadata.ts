import type { NormalizedOperation, OpenAPISpec, SpecMetadata } from "./types.js";

/** A4 운영 메타데이터 추출 (PRD §4.1). */

const SENSITIVE_TAGS = ["admin", "internal", "danger", "private"];
const RISKY_PATH = /\/(admin|internal|debug|_internal)\b/i;

export function isRiskyEndpoint(op: { method: string; path: string; tags: string[] }): string | null {
  if (RISKY_PATH.test(op.path)) return `위험 경로 패턴: ${op.path}`;
  const tag = op.tags.find((t) => SENSITIVE_TAGS.includes(t.toLowerCase()));
  if (tag) return `민감 tag: ${tag}`;
  if (op.method.toLowerCase() === "delete") return "위험 operation: DELETE";
  return null;
}

export function extractMetadata(spec: OpenAPISpec, ops: NormalizedOperation[]): SpecMetadata {
  const authSchemes = Object.keys(spec.components?.securitySchemes ?? {});
  const tags = [...new Set(ops.flatMap((o) => o.tags))];
  const riskyEndpoints = ops
    .map((o) => {
      const reason = isRiskyEndpoint(o);
      return reason ? { method: o.method, path: o.path, reason } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 품질 점수: summary 보유율 + operationId 보유율 + 응답 정의율 기반 (0-100)
  const total = ops.length || 1;
  const withSummary = ops.filter((o) => o.summary).length / total;
  const withParams = ops.filter((o) => o.parameters.length > 0 || o.requestBody).length / total;
  const hasServers = spec.servers && spec.servers.length > 0 ? 1 : 0;
  const qualityScore = Math.round((withSummary * 40 + withParams * 30 + hasServers * 30));

  return {
    baseUrl: spec.servers?.[0]?.url ?? null,
    authSchemes,
    endpointCount: ops.length,
    tags,
    riskyEndpoints,
    qualityScore,
  };
}
