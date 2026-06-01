import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadRuntimeFromEnv } from "./config.js";
import { buildMcpServer } from "./server.js";

/**
 * 무변경 Proxy MCP 런타임 진입점 (PRD §4.3, §7). 코드 고정 — manifest로만 동작.
 * TRANSPORT=stdio → 로컬 호스트 / TRANSPORT=http → Streamable HTTP + /health
 */
const TRANSPORT = process.env.TRANSPORT ?? "stdio";
const PORT = Number(process.env.PORT ?? 8080);

async function main() {
  const runtime = await loadRuntimeFromEnv();

  if (TRANSPORT === "stdio") {
    const server = buildMcpServer(runtime);
    await server.connect(new StdioServerTransport());
    return;
  }

  // Streamable HTTP (stateless: 요청마다 새 transport, PRD §4.3 C4)
  const httpServer = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tools: runtime.listTools().length }));
      return;
    }
    if (req.url === "/mcp" && (req.method === "POST" || req.method === "GET")) {
      const server = buildMcpServer(runtime);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      let body: unknown;
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      }
      await transport.handleRequest(req, res, body);
      return;
    }
    res.writeHead(404).end();
  });

  httpServer.listen(PORT, () => {
    console.log(`[mcp-proxy] http transport on :${PORT} (/mcp, /health)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
