export * from "./types.js";
export * from "./load.js";
export * from "./normalize.js";
export * from "./metadata.js";
export * from "./auth.js";
export * from "./mapping.js";

import type { Manifest } from "@mcp-proxy/manifest";
import { loadSpecInline } from "./load.js";
import { normalizeSpec } from "./normalize.js";
import { extractMetadata } from "./metadata.js";
import { parseSecuritySchemes, buildAuthMatrix } from "./auth.js";
import { buildMappingPlan, type MappingPlan } from "./mapping.js";
import type { OpenAPISpec, SpecMetadata, NormalizedOperation } from "./types.js";

export interface ConversionResult {
  ops: NormalizedOperation[];
  metadata: SpecMetadata;
  specAuth: ReturnType<typeof parseSecuritySchemes>;
  authMatrix: ReturnType<typeof buildAuthMatrix>;
  plan: MappingPlan;
}

/** 전체 파이프라인 2단계 산출물 (PRD §7 불변식): normalized + plan. */
export function convert(spec: OpenAPISpec, manifest: Manifest): ConversionResult {
  const ops = normalizeSpec(spec);
  return {
    ops,
    metadata: extractMetadata(spec, ops),
    specAuth: parseSecuritySchemes(spec),
    authMatrix: buildAuthMatrix(ops),
    plan: buildMappingPlan(ops, manifest),
  };
}

export function convertInline(specObj: unknown, manifest: Manifest): ConversionResult {
  return convert(loadSpecInline(specObj), manifest);
}
