/** OpenAPI v3 최소 타입 + 정규화 산출물 타입 (PRD §4.1-4.2). */

export interface OpenAPISpec {
  openapi: string;
  info?: { title?: string; version?: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JSONSchema>;
    securitySchemes?: Record<string, SecurityScheme>;
    parameters?: Record<string, Parameter>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{ name: string; description?: string }>;
}

export interface PathItem {
  parameters?: Array<Parameter | Ref>;
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  patch?: Operation;
  head?: Operation;
  options?: Operation;
}

export const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<Parameter | Ref>;
  requestBody?: RequestBody | Ref;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: JSONSchema;
  description?: string;
}

export interface RequestBody {
  required?: boolean;
  content?: Record<string, { schema?: JSONSchema }>;
}

export interface SecurityScheme {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  in?: "header" | "query" | "cookie";
  name?: string;
  scheme?: string;
}

export interface Ref {
  $ref: string;
}

export type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | Ref;
  required?: string[];
  $ref?: string;
  [k: string]: unknown;
};

/** 정규화된 operation — $ref 해석·파라미터 병합 완료 (PRD A3). */
export interface NormalizedOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: { required: boolean; schema: JSONSchema };
  security: Array<Record<string, string[]>>;
  deprecated: boolean;
}

export interface SpecMetadata {
  baseUrl: string | null;
  authSchemes: string[];
  endpointCount: number;
  tags: string[];
  riskyEndpoints: Array<{ method: string; path: string; reason: string }>;
  qualityScore: number; // 0-100
}
