import {
  HTTP_METHODS,
  type HttpMethod,
  type JSONSchema,
  type NormalizedOperation,
  type OpenAPISpec,
  type Operation,
  type Parameter,
  type Ref,
} from "./types.js";

/** A3 정규화: 내부 $ref 해석 + path/operation 파라미터 병합 (PRD §4.1). */

function isRef(x: unknown): x is Ref {
  return !!x && typeof x === "object" && typeof (x as Ref).$ref === "string";
}

/** #/components/... JSON 포인터 해석. 외부 $ref는 미지원(에러). */
export function resolveRef<T>(spec: OpenAPISpec, ref: string): T {
  if (!ref.startsWith("#/")) throw new Error(`외부 $ref 미지원: ${ref}`);
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = spec;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") throw new Error(`$ref 해석 실패: ${ref}`);
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === undefined) throw new Error(`$ref 대상 없음: ${ref}`);
  return cur as T;
}

function deref<T>(spec: OpenAPISpec, x: T | Ref): T {
  return isRef(x) ? resolveRef<T>(spec, x.$ref) : x;
}

/** 스키마 내부 $ref를 재귀 해석 (depth 제한으로 순환 방지). */
export function resolveSchema(spec: OpenAPISpec, schema: JSONSchema, depth = 0): JSONSchema {
  if (depth > 20) return schema;
  if (isRef(schema)) return resolveSchema(spec, resolveRef<JSONSchema>(spec, schema.$ref), depth + 1);
  const out: JSONSchema = { ...schema };
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, resolveSchema(spec, v, depth + 1)]),
    );
  }
  if (out.items) out.items = resolveSchema(spec, out.items as JSONSchema, depth + 1);
  return out;
}

function slug(method: string, path: string): string {
  const cleaned = path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${method}_${cleaned}`.toLowerCase();
}

export function normalizeSpec(spec: OpenAPISpec): NormalizedOperation[] {
  const ops: NormalizedOperation[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    const pathParams = (item.parameters ?? []).map((p) => deref<Parameter>(spec, p));
    for (const method of HTTP_METHODS) {
      const op = item[method] as Operation | undefined;
      if (!op) continue;

      // path-level + operation-level 파라미터 병합 (operation 우선)
      const opParams = (op.parameters ?? []).map((p) => deref<Parameter>(spec, p));
      const merged = new Map<string, Parameter>();
      for (const p of pathParams) merged.set(`${p.in}:${p.name}`, p);
      for (const p of opParams) merged.set(`${p.in}:${p.name}`, p);
      const parameters = [...merged.values()].map((p) => ({
        ...p,
        schema: p.schema ? resolveSchema(spec, p.schema) : { type: "string" },
      }));

      let requestBody: NormalizedOperation["requestBody"];
      if (op.requestBody) {
        const rb = deref(spec, op.requestBody);
        const json = rb.content?.["application/json"]?.schema;
        if (json) {
          requestBody = { required: rb.required ?? false, schema: resolveSchema(spec, json) };
        }
      }

      ops.push({
        operationId: op.operationId ?? slug(method, path),
        method: method as HttpMethod,
        path,
        summary: op.summary,
        tags: op.tags ?? [],
        parameters,
        requestBody,
        security: op.security ?? spec.security ?? [],
        deprecated: op.deprecated ?? false,
      });
    }
  }
  return ops;
}
