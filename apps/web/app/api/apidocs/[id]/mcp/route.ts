import { db } from "@/lib/server/context";
import { proxyStatus } from "@/lib/server/proxy-runtime";
import { findApiDocById } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transparent HTTP proxy to the internal MCP process (localhost:{port}/mcp).
 * Required for Docker deployments where dynamic proxy ports are not exposed to the host.
 * No user-auth at this layer — the upstream MCP server handles its own auth.
 */
async function forward(req: Request, docId: string): Promise<Response> {
  const database = await db();
  const doc = findApiDocById(database, docId);
  if (!doc || doc.status !== "approved") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const st = proxyStatus(docId, doc.proxy_port);
  if (!st.running || !st.port) {
    return Response.json({ error: "proxy_not_running" }, { status: 503 });
  }

  const targetUrl = `http://localhost:${st.port}/mcp`;
  const headers = new Headers(req.headers);
  headers.delete("host");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    duplex: "half",
  } as RequestInit);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

const handler = async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  try {
    return await forward(req, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return Response.json({ error: msg }, { status: 502 });
  }
};

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
