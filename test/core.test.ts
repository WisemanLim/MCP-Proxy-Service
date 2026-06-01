import { describe, expect, it, vi } from "vitest";
import { parseManifest } from "@mcp-proxy/manifest";
import {
  ProxyError,
  ProxyRuntime,
  buildRequest,
  executeRequest,
  injectAuth,
  normalizeResponse,
} from "@mcp-proxy/core";
import { convertInline } from "@mcp-proxy/converter";
import { baseManifest, petstoreSpec } from "./fixtures/petstore.js";

const manifest = parseManifest(baseManifest);
const conv = convertInline(petstoreSpec, manifest);
const env = { PETSTORE_API_KEY: "key-abc" };

function tool(name: string) {
  return conv.plan.tools.find((t) => t.name === name)!;
}
function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(body == null ? "" : JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("auth injector (D2,D4)", () => {
  it("TC-D2-1 apiKey header 주입", () => {
    const r = injectAuth({ headers: {}, query: {}, cookies: {} }, manifest, conv.specAuth, ["apiKey"], env);
    expect(r.headers["X-API-Key"]).toBe("key-abc");
  });
  it("TC-D2-2 bearer 주입", () => {
    const r = injectAuth({ headers: {}, query: {}, cookies: {} }, manifest, conv.specAuth, ["bearer"], env);
    expect(r.headers["Authorization"]).toBe("Bearer key-abc");
  });
  it("TC-D2-3 query/cookie 위치 주입", () => {
    const sa = { schemes: [
      { name: "q", type: "apiKey" as const, in: "query" as const, paramName: "api_key" },
      { name: "c", type: "apiKey" as const, in: "cookie" as const, paramName: "sid" },
    ]};
    const rq = injectAuth({ headers: {}, query: {}, cookies: {} }, manifest, sa, ["q"], env);
    expect(rq.query["api_key"]).toBe("key-abc");
    const rc = injectAuth({ headers: {}, query: {}, cookies: {} }, manifest, sa, ["c"], env);
    expect(rc.cookies["sid"]).toBe("key-abc");
  });
});

describe("request builder (C1)", () => {
  it("TC-C1-1 path 파라미터 치환", () => {
    const req = buildRequest(tool("getPet"), { id: 7 }, manifest, conv.specAuth, ["apiKey"], env);
    expect(req.url).toContain("/pets/7");
  });
  it("TC-C1-2 query 직렬화", () => {
    const req = buildRequest(tool("listPets"), { tag: "cat" }, manifest, conv.specAuth, ["apiKey"], env);
    expect(req.url).toContain("tag=cat");
  });
  it("TC-C1-3 body 직렬화 + Content-Type", () => {
    const req = buildRequest(tool("createPet"), { body: { name: "rex" } }, manifest, conv.specAuth, ["apiKey"], env);
    expect(req.body).toBe(JSON.stringify({ name: "rex" }));
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(req.method).toBe("POST");
  });
});

describe("executor timeout/retry (C1)", () => {
  it("TC-C1-4 timeout → TIMEOUT", async () => {
    const slow: typeof fetch = vi.fn((_u, init) => new Promise((_res, rej) => {
      (init as RequestInit)?.signal?.addEventListener("abort", () => {
        const e = new Error("aborted"); e.name = "AbortError"; rej(e);
      });
    })) as unknown as typeof fetch;
    const m = parseManifest({ ...baseManifest, timeoutMs: 20, retry: { max: 0 } });
    await expect(executeRequest({ url: "http://x/", method: "GET", headers: {} }, m, slow))
      .rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("TC-C1-5 5xx 재시도 후 성공", async () => {
    let n = 0;
    const flaky: typeof fetch = vi.fn(async () => {
      n++;
      return n < 2 ? new Response("", { status: 503 }) : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = parseManifest({ ...baseManifest, retry: { max: 2 } });
    const out = await executeRequest({ url: "http://x/", method: "GET", headers: {} }, m, flaky);
    expect(out).toEqual({ ok: true });
    expect(n).toBe(2);
  });
});

describe("response normalizer (C5,C6)", () => {
  const policy = manifest.fieldsPolicy; // defaultLimit 2, truncateBytes 16, maxDepth 2
  it("TC-C5-1 fields projection", () => {
    const { data } = normalizeResponse([{ id: 1, name: "a", tag: "x" }], policy, { fields: "id,name" });
    expect(data).toEqual([{ id: 1, name: "a" }]);
  });
  it("TC-C5-2 allow-list 우선", () => {
    const p2 = { ...policy, allow: ["id"] };
    const { data } = normalizeResponse([{ id: 1, name: "a" }], p2, {});
    expect(data).toEqual([{ id: 1 }]);
  });
  it("TC-C6-1 페이지네이션 기본 limit", () => {
    const { data, meta } = normalizeResponse([1, 2, 3, 4, 5], policy, {});
    expect((data as number[]).length).toBe(2);
    expect(meta.totalCount).toBe(5);
    expect(meta.returnedCount).toBe(2);
  });
  it("TC-C6-2 nextCursor 산출", () => {
    const { meta } = normalizeResponse([1, 2, 3, 4, 5], policy, { cursor: 0, limit: 2 });
    expect(meta.nextCursor).toBe(2);
  });
  it("TC-C6-3 string truncation", () => {
    const longStr = "x".repeat(50);
    const { data } = normalizeResponse({ v: longStr }, policy, {});
    expect((data as { v: string }).v).toContain("…[truncated]");
  });
  it("TC-C6-4 depth 제한", () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const { data } = normalizeResponse(deep, policy, {});
    // maxDepth 2 → a.b 까지, 그 안은 치환
    expect(JSON.stringify(data)).toContain("depth-limited");
  });
});

describe("structured errors (D5)", () => {
  const m = parseManifest({ ...baseManifest, retry: { max: 0 } });
  it.each([
    [401, "INVALID_API_KEY"],
    [403, "MISSING_SCOPE"],
    [503, "UPSTREAM_AUTH_UNAVAILABLE"],
  ])("TC-D5 %s → %s", async (status, code) => {
    await expect(executeRequest({ url: "http://x/", method: "GET", headers: {} }, m, fakeFetch(status, null)))
      .rejects.toMatchObject({ code });
  });
});

describe("runtime end-to-end (C1,D4)", () => {
  it("TC-RT-1 callTool 정규화 응답", async () => {
    const rt = new ProxyRuntime(petstoreSpec, manifest);
    const upstream = fakeFetch(200, [
      { id: 1, name: "a", tag: "t" }, { id: 2, name: "b", tag: "t" }, { id: 3, name: "c", tag: "t" },
    ]);
    const { data, meta } = await rt.callTool("listPets", { fields: "id" }, upstream, env);
    expect((data as unknown[]).length).toBe(2); // defaultLimit
    expect(data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(meta.totalCount).toBe(3);
  });
  it("TC-RT-2 평문 비밀 manifest 거부", () => {
    const bad = parseManifest({ ...baseManifest, headerTemplate: { Authorization: "Bearer sk-plaintextsecrettoken1234567" } });
    expect(() => new ProxyRuntime(petstoreSpec, bad)).toThrow(/비밀 평문/);
  });
  it("unknown tool → BAD_INPUT", async () => {
    const rt = new ProxyRuntime(petstoreSpec, manifest);
    await expect(rt.callTool("nope", {}, fakeFetch(200, {}), env)).rejects.toBeInstanceOf(ProxyError);
  });
});
