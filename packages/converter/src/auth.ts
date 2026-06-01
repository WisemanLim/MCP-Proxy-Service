import type { SpecAuth } from "@mcp-proxy/manifest";
import type { NormalizedOperation, OpenAPISpec } from "./types.js";

/** D1 securitySchemes 파싱 → SpecAuth + operation-level auth matrix (PRD §4.4). */

export function parseSecuritySchemes(spec: OpenAPISpec): SpecAuth {
  const schemes = Object.entries(spec.components?.securitySchemes ?? {}).map(([name, s]) => ({
    name,
    type: s.type,
    in: s.in,
    scheme: s.scheme,
    paramName: s.name,
  }));
  return { schemes };
}

export interface AuthMatrixEntry {
  operationId: string;
  schemes: string[]; // 이 operation에 적용되는 securityScheme 이름들
}

/** operation별 적용 인증 매트릭스. operation.security 우선, 없으면 global. */
export function buildAuthMatrix(ops: NormalizedOperation[]): AuthMatrixEntry[] {
  return ops.map((op) => ({
    operationId: op.operationId,
    schemes: op.security.flatMap((req) => Object.keys(req)),
  }));
}
