import { describe, expect, it } from "vitest";
import {
  assertNoPlaintextSecret,
  parseManifest,
  resolveSecret,
} from "@mcp-proxy/manifest";
import { baseManifest } from "./fixtures/petstore.js";

describe("manifest (C2,D3,D4)", () => {
  it("TC-C2-1 valid manifest 파싱", () => {
    const m = parseManifest(baseManifest);
    expect(m.baseUrl).toBe("https://api.example.com/v1");
    expect(m.fieldsPolicy.defaultLimit).toBe(2);
  });

  it("TC-C2-2 baseUrl 누락 거부", () => {
    expect(() => parseManifest({ name: "x" })).toThrow();
  });

  it("TC-D3-1 spec_auth와 runtime_auth_policy 분리", () => {
    const m = parseManifest(baseManifest);
    expect(m.specAuth.schemes).toHaveLength(2);
    expect(m.runtimeAuthPolicy.secretRef).toBe("PETSTORE_API_KEY");
    // 두 섹션 독립 — specAuth에 secret 없음
    expect(JSON.stringify(m.specAuth)).not.toContain("secret");
  });

  it("TC-D4-1 평문 비밀 의심 시 거부", () => {
    const m = parseManifest({
      ...baseManifest,
      headerTemplate: { Authorization: "Bearer sk-livesecrettoken1234567890" },
    });
    expect(() => assertNoPlaintextSecret(m)).toThrow(/비밀 평문/);
  });

  it("TC-D4-2 ${ENV} 참조는 허용", () => {
    const m = parseManifest({
      ...baseManifest,
      headerTemplate: { "X-Tenant": "${TENANT_ID}" },
    });
    expect(() => assertNoPlaintextSecret(m)).not.toThrow();
  });

  it("TC-D4-3 secretRef → env 해석", () => {
    const m = parseManifest(baseManifest);
    expect(resolveSecret(m.runtimeAuthPolicy, { PETSTORE_API_KEY: "k-123" })).toBe("k-123");
    expect(resolveSecret(m.runtimeAuthPolicy, {})).toBeUndefined();
  });
});
