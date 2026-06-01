import type { Manifest } from "@mcp-proxy/manifest";
import { isRiskyEndpoint } from "./metadata.js";
import type { JSONSchema, NormalizedOperation } from "./types.js";

/** B1/B3/B4 매핑 계획: Tool 매핑 + 위험 제외 + 단일 입력 스키마 합성 (PRD §4.2). */

export interface ToolDef {
  name: string;
  description: string;
  method: string;
  path: string;
  inputSchema: JSONSchema;
  // 파라미터 출처 추적 (런타임 request 조립용)
  paramMap: Array<{ name: string; in: "path" | "query" | "header" | "cookie" | "body" }>;
}

export interface MappingPlan {
  tools: ToolDef[];
  excluded: Array<{ operationId: string; method: string; path: string; reason: string }>;
}

/** B4: path/query/header/body → 단일 MCP 입력 JSON Schema 합성. */
export function synthesizeInputSchema(op: NormalizedOperation): {
  schema: JSONSchema;
  paramMap: ToolDef["paramMap"];
} {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];
  const paramMap: ToolDef["paramMap"] = [];

  for (const p of op.parameters) {
    properties[p.name] = p.schema ?? { type: "string" };
    if (p.required) required.push(p.name);
    paramMap.push({ name: p.name, in: p.in });
  }
  if (op.requestBody) {
    properties.body = op.requestBody.schema;
    if (op.requestBody.required) required.push("body");
    paramMap.push({ name: "body", in: "body" });
  }

  return {
    schema: { type: "object", properties, required, additionalProperties: false },
    paramMap,
  };
}

function matchesAny(patterns: string[], op: NormalizedOperation): boolean {
  return patterns.some((pat) => {
    if (pat === op.operationId) return true;
    // "METHOD /path" 또는 경로 prefix
    if (pat.includes(" ")) {
      const [m, p] = pat.split(/\s+/);
      return m.toLowerCase() === op.method && op.path.startsWith(p);
    }
    return op.path.startsWith(pat);
  });
}

export function buildMappingPlan(ops: NormalizedOperation[], manifest: Manifest): MappingPlan {
  const tools: ToolDef[] = [];
  const excluded: MappingPlan["excluded"] = [];

  for (const op of ops) {
    // include가 지정되면 미포함은 제외
    if (manifest.include.length > 0 && !matchesAny(manifest.include, op)) {
      excluded.push({ operationId: op.operationId, method: op.method, path: op.path, reason: "include 목록 외" });
      continue;
    }
    // 명시적 exclude
    if (matchesAny(manifest.exclude, op)) {
      excluded.push({ operationId: op.operationId, method: op.method, path: op.path, reason: "exclude 지정" });
      continue;
    }
    // B3 위험 endpoint 자동 제외
    const risk = isRiskyEndpoint(op);
    if (risk) {
      excluded.push({ operationId: op.operationId, method: op.method, path: op.path, reason: risk });
      continue;
    }

    const { schema, paramMap } = synthesizeInputSchema(op);
    tools.push({
      name: op.operationId,
      description: op.summary ?? `${op.method.toUpperCase()} ${op.path}`,
      method: op.method,
      path: op.path,
      inputSchema: schema,
      paramMap,
    });
  }

  return { tools, excluded };
}
