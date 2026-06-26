import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { extractSpecFromHtml } from "../apps/web/lib/html-spec-extractor";

const MINIMAL_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0.0" },
  paths: { "/health": { get: { responses: { "200": { description: "ok" } } } } },
});

function makeFetch(responses: Record<string, { status: number; body: string; ct?: string }>) {
  return vi.fn(async (url: string, _opts?: unknown) => {
    const entry = responses[url];
    if (!entry) return new Response("", { status: 404 });
    return new Response(entry.body, {
      status: entry.status,
      headers: { "content-type": entry.ct ?? "application/json" },
    });
  }) as unknown as typeof fetch;
}

const BASE = "https://docuops.example.com";

describe("extractSpecFromHtml", () => {
  let original: typeof fetch;
  beforeEach(() => { original = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = original; });

  it("T2: SwaggerUI JS url 패턴 → spec fetch 성공", async () => {
    const specUrl = `${BASE}/v3/api-docs`;
    const html = `<html><script>
      SwaggerUIBundle({ url: "/v3/api-docs", dom_id: '#swagger-ui' })
    </script></html>`;
    globalThis.fetch = makeFetch({ [specUrl]: { status: 200, body: MINIMAL_SPEC } });
    const spec = await extractSpecFromHtml(html, `${BASE}/swagger/ui`);
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.paths).toHaveProperty("/health");
  });

  it("T3: <a href> JSON 링크 → spec fetch 성공", async () => {
    const specUrl = `${BASE}/api.json`;
    const html = `<html><a href="/api.json">Download spec</a></html>`;
    globalThis.fetch = makeFetch({ [specUrl]: { status: 200, body: MINIMAL_SPEC } });
    const spec = await extractSpecFromHtml(html, `${BASE}/docs`);
    expect(spec.openapi).toBe("3.0.0");
  });

  it("T4: 패턴 없을 때 fallback /v3/api-docs 성공", async () => {
    const html = `<html><body>Swagger UI</body></html>`;
    globalThis.fetch = makeFetch({
      [`${BASE}/v3/api-docs`]: { status: 200, body: MINIMAL_SPEC },
    });
    const spec = await extractSpecFromHtml(html, `${BASE}/swagger/index.html`);
    expect(spec.openapi).toBe("3.0.0");
  });

  it("T4b: fallback /openapi.json 성공", async () => {
    const html = `<html><body>API Docs</body></html>`;
    globalThis.fetch = makeFetch({
      [`${BASE}/openapi.json`]: { status: 200, body: MINIMAL_SPEC },
    });
    const spec = await extractSpecFromHtml(html, `${BASE}/docs`);
    expect(spec.openapi).toBe("3.0.0");
  });

  it("T5: 모든 경로 실패 → html_spec_not_found 에러", async () => {
    const html = `<html><body>No spec here</body></html>`;
    globalThis.fetch = makeFetch({});
    await expect(extractSpecFromHtml(html, `${BASE}/docs`)).rejects.toThrow("html_spec_not_found");
  });

  it("T2b: url 패턴이 HTML 반환 → 건너뛰고 fallback", async () => {
    const badUrl = `${BASE}/swagger-ui.html`;
    const goodUrl = `${BASE}/openapi.json`;
    const html = `<html><script>ui = SwaggerUIBundle({ url: "/swagger-ui.html" })</script></html>`;
    globalThis.fetch = makeFetch({
      [badUrl]: { status: 200, body: "<html>still html</html>", ct: "text/html" },
      [goodUrl]: { status: 200, body: MINIMAL_SPEC },
    });
    const spec = await extractSpecFromHtml(html, `${BASE}/docs`);
    expect(spec.openapi).toBe("3.0.0");
  });
});
