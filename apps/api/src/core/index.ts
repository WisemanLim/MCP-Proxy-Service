import { type Manifest, parseManifest, assertNoPlaintextSecret } from "@mcp-proxy/manifest";
import { convert, type ConversionResult, type OpenAPISpec, type ToolDef } from "@mcp-proxy/converter";
import { buildRequest, executeRequest, splitControlParams } from "./executor.js";
import { normalizeResponse, type ControlParams, type NormalizeMeta } from "./normalizer.js";
import { ProxyError } from "./errors.js";

export * from "./errors.js";
export * from "./auth-injector.js";
export * from "./executor.js";
export * from "./normalizer.js";

/**
 * 무변경 Proxy 런타임 (PRD §4.3 C1). 코드 고정 — spec + manifest만으로 동작.
 */
export class ProxyRuntime {
  readonly conversion: ConversionResult;
  private readonly toolIndex: Map<string, ToolDef>;

  constructor(
    spec: OpenAPISpec,
    readonly manifest: Manifest,
  ) {
    assertNoPlaintextSecret(manifest);
    this.conversion = convert(spec, manifest);
    this.toolIndex = new Map(this.conversion.plan.tools.map((t) => [t.name, t]));
  }

  static fromConfig(spec: OpenAPISpec, manifestInput: unknown): ProxyRuntime {
    return new ProxyRuntime(spec, parseManifest(manifestInput));
  }

  /** MCP tools/list 용 목록 (C4). */
  listTools(): Array<{ name: string; description: string; inputSchema: object }> {
    return this.conversion.plan.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  private applicableSchemes(toolName: string): string[] {
    const entry = this.conversion.authMatrix.find((e) => e.operationId === toolName);
    return entry?.schemes ?? [];
  }

  /** call_tool: 입력 → upstream 호출 → 응답 정규화 (C1,C5,C6). */
  async callTool(
    toolName: string,
    input: Record<string, unknown> = {},
    fetchImpl: typeof fetch = fetch,
    env: Record<string, string | undefined> = process.env,
  ): Promise<{ data: unknown; meta: NormalizeMeta }> {
    const tool = this.toolIndex.get(toolName);
    if (!tool) throw new ProxyError("BAD_INPUT", `알 수 없는 tool: ${toolName}`);

    const { control, rest } = splitControlParams(input);
    const req = buildRequest(
      tool,
      rest,
      this.manifest,
      this.conversion.specAuth,
      this.applicableSchemes(toolName),
      env,
    );
    let ok = true;
    try {
      const raw = await executeRequest(req, this.manifest, fetchImpl);
      return normalizeResponse(raw, this.manifest.fieldsPolicy, control as ControlParams);
    } catch (e) {
      ok = false;
      throw e;
    } finally {
      // await: 보고 완료 후 호출 종료 (프록시가 응답 직후 종료돼도 기록 유실 방지). 실패는 무시.
      await reportUsage(toolName, ok, env, fetchImpl);
    }
  }
}

/**
 * 사용내역 보고 (best-effort). 플랫폼에 MCP 호출 기록.
 * env: USAGE_REPORT_URL(=.../api/apidocs/:id/usage), USAGE_TOKEN.
 */
async function reportUsage(tool: string, ok: boolean, env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<void> {
  const url = env.USAGE_REPORT_URL;
  const token = env.USAGE_TOKEN;
  if (!url || !token) return;
  try {
    await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-usage-token": token },
      body: JSON.stringify({ tool, ok, caller: env.USAGE_CALLER ?? "mcp-proxy", region: env.USAGE_REGION ?? null }),
    });
  } catch { /* 보고 실패는 호출 결과에 영향 없음 */ }
}
