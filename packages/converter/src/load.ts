import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import type { OpenAPISpec } from "./types.js";

/** A1 입력: inline 객체 / JSON·YAML 문자열 / 파일 / URL 4종 (PRD §4.1). */

export function loadSpecInline(obj: unknown): OpenAPISpec {
  return assertOpenApi(obj);
}

export function loadSpecFromString(text: string): OpenAPISpec {
  const trimmed = text.trimStart();
  const parsed = trimmed.startsWith("{") || trimmed.startsWith("[")
    ? JSON.parse(text)
    : yaml.load(text);
  return assertOpenApi(parsed);
}

export function loadSpecFromFile(path: string): OpenAPISpec {
  return loadSpecFromString(readFileSync(path, "utf-8"));
}

export async function loadSpecFromUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenAPISpec> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`spec fetch 실패: ${url} → ${res.status}`);
  return loadSpecFromString(await res.text());
}

function assertOpenApi(obj: unknown): OpenAPISpec {
  if (!obj || typeof obj !== "object") throw new Error("스펙이 객체가 아님");
  const spec = obj as OpenAPISpec;
  if (!spec.openapi || !spec.openapi.startsWith("3")) {
    throw new Error(`OpenAPI v3 아님: openapi=${spec.openapi}`);
  }
  if (!spec.paths || typeof spec.paths !== "object") {
    throw new Error("paths 누락");
  }
  return spec;
}
