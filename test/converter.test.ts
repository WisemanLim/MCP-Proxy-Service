import { describe, expect, it } from "vitest";
import {
  buildAuthMatrix,
  buildMappingPlan,
  convertInline,
  extractMetadata,
  loadSpecFromString,
  loadSpecInline,
  normalizeSpec,
  parseSecuritySchemes,
} from "@mcp-proxy/converter";
import { parseManifest } from "@mcp-proxy/manifest";
import { baseManifest, petstoreSpec } from "./fixtures/petstore.js";

const manifest = parseManifest(baseManifest);

describe("load (A1)", () => {
  it("TC-A1-1 inline 객체", () => {
    expect(loadSpecInline(petstoreSpec).openapi).toBe("3.0.3");
  });
  it("TC-A1-2 JSON 문자열", () => {
    expect(loadSpecFromString(JSON.stringify(petstoreSpec)).paths["/pets"]).toBeDefined();
  });
  it("TC-A1-3 YAML 문자열", () => {
    const yaml = "openapi: 3.0.0\npaths:\n  /x:\n    get:\n      responses:\n        '200':\n          description: ok\n";
    expect(loadSpecFromString(yaml).openapi).toBe("3.0.0");
  });
  it("TC-A1-4 비OpenAPI 거부", () => {
    expect(() => loadSpecInline({ swagger: "2.0", paths: {} })).toThrow();
  });
});

describe("normalize (A3)", () => {
  const ops = normalizeSpec(petstoreSpec);
  it("TC-A3-1 $ref 파라미터(limit) 병합", () => {
    const list = ops.find((o) => o.operationId === "listPets")!;
    const names = list.parameters.map((p) => p.name);
    expect(names).toContain("limit"); // path-level $ref param
    expect(names).toContain("tag"); // operation-level param
  });
  it("TC-A3-2 requestBody $ref 인라인", () => {
    const create = ops.find((o) => o.operationId === "createPet")!;
    expect(create.requestBody?.schema.properties?.name).toBeDefined();
    expect(create.requestBody?.required).toBe(true);
  });
  it("TC-A3-3 파라미터 중복 병합 없음", () => {
    const list = ops.find((o) => o.operationId === "listPets")!;
    const limitCount = list.parameters.filter((p) => p.name === "limit").length;
    expect(limitCount).toBe(1);
  });
});

describe("metadata (A4)", () => {
  const ops = normalizeSpec(petstoreSpec);
  const meta = extractMetadata(petstoreSpec, ops);
  it("TC-A4-1 baseUrl·authSchemes·count", () => {
    expect(meta.baseUrl).toBe("https://api.example.com/v1");
    expect(meta.authSchemes).toEqual(expect.arrayContaining(["apiKey", "bearer"]));
    expect(meta.endpointCount).toBe(5);
  });
  it("TC-A4-2 위험 endpoint 탐지", () => {
    const paths = meta.riskyEndpoints.map((r) => r.path);
    expect(paths).toContain("/admin/stats");
    expect(meta.riskyEndpoints.some((r) => r.reason.includes("DELETE"))).toBe(true);
  });
  it("TC-A4-3 품질 점수 0-100", () => {
    expect(meta.qualityScore).toBeGreaterThanOrEqual(0);
    expect(meta.qualityScore).toBeLessThanOrEqual(100);
  });
});

describe("mapping (B1,B3,B4)", () => {
  const ops = normalizeSpec(petstoreSpec);
  const plan = buildMappingPlan(ops, manifest);
  it("TC-B1-1 operationId → tool 이름", () => {
    expect(plan.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["listPets", "getPet", "createPet"]));
  });
  it("TC-B1-2 operationId 없으면 slug", () => {
    const noId = normalizeSpec({
      openapi: "3.0.0",
      paths: { "/foo/bar": { get: { responses: { "200": { description: "ok" } } } } },
    });
    expect(noId[0].operationId).toBe("get_foo_bar");
  });
  it("TC-B3-1 /admin 자동 제외", () => {
    expect(plan.excluded.some((e) => e.operationId === "adminStats")).toBe(true);
  });
  it("TC-B3-2 DELETE 자동 제외", () => {
    expect(plan.excluded.some((e) => e.operationId === "deletePet")).toBe(true);
  });
  it("TC-B3-3 manifest exclude 적용", () => {
    const m2 = parseManifest({ ...baseManifest, exclude: ["createPet"] });
    const p2 = buildMappingPlan(ops, m2);
    expect(p2.tools.some((t) => t.name === "createPet")).toBe(false);
  });
  it("TC-B4-1 단일 입력 스키마 합성", () => {
    const create = plan.tools.find((t) => t.name === "createPet")!;
    expect(create.inputSchema.properties?.body).toBeDefined();
    const getPet = plan.tools.find((t) => t.name === "getPet")!;
    expect(getPet.inputSchema.properties?.id).toBeDefined();
  });
  it("TC-B4-2 required 반영", () => {
    const getPet = plan.tools.find((t) => t.name === "getPet")!;
    expect(getPet.inputSchema.required).toContain("id");
  });
});

describe("auth parse (D1)", () => {
  it("TC-D1-1 securitySchemes 파싱", () => {
    const sa = parseSecuritySchemes(petstoreSpec);
    expect(sa.schemes.map((s) => s.name)).toEqual(expect.arrayContaining(["apiKey", "bearer"]));
    expect(sa.schemes.find((s) => s.name === "apiKey")?.paramName).toBe("X-API-Key");
  });
  it("TC-D1-2 operation별 auth matrix", () => {
    const ops = normalizeSpec(petstoreSpec);
    const matrix = buildAuthMatrix(ops);
    const list = matrix.find((m) => m.operationId === "listPets")!;
    expect(list.schemes).toContain("apiKey"); // global security 상속
  });
});

describe("convert pipeline", () => {
  it("전체 변환 산출물", () => {
    const r = convertInline(petstoreSpec, manifest);
    expect(r.plan.tools.length).toBe(3); // listPets, getPet, createPet (admin/delete 제외)
    expect(r.metadata.endpointCount).toBe(5);
  });
});
