import { db, jsonError, requireActive } from "@/lib/server/context";
import { usageHistory } from "@/lib/server/dashboard";
import { findApiDocById, insertApiUsage } from "@/lib/server/db";
import { AuthConfig } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** MCP 사용(호출) 내역 조회 — 소유자/검토자(active). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireActive(req);
    const { id } = await params;
    return Response.json({ items: usageHistory(await db(), id) });
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * 사용내역 기록 — 헤드리스 프록시가 공유 토큰(x-usage-token)으로 호출.
 * 인증된 사용자(테스트용)도 허용.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const token = req.headers.get("x-usage-token") ?? "";
    const tokenOk = AuthConfig.usageToken && token === AuthConfig.usageToken;
    if (!tokenOk) await requireActive(req); // 토큰 없으면 로그인 필요
    const d = await db();
    const doc = findApiDocById(d, id);
    if (!doc) return Response.json({ error: "not_found" }, { status: 404 });
    const { tool, ok, caller, region } = await req.json();
    if (!tool) return Response.json({ error: "tool_required" }, { status: 400 });
    insertApiUsage(d, { docId: id, orgId: doc.org_id, caller: caller ? String(caller) : null, tool: String(tool), region: region ? String(region) : null, ok: ok !== false });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
