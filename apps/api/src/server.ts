import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProxyError, type ProxyRuntime } from "./core/index.js";

/** C3/C4 MCP 서버 — runtime의 tools/list·call_tool를 SDK 핸들러로 노출. */
export function buildMcpServer(runtime: ProxyRuntime): Server {
  const server = new Server(
    { name: runtime.manifest.name, version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: runtime.listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await runtime.callTool(name, (args ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (e) {
      const code = e instanceof ProxyError ? e.code : "UPSTREAM_ERROR";
      const message = e instanceof Error ? e.message : String(e);
      // D5: 구조화 오류 — raw body 미노출
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
      };
    }
  });

  return server;
}
