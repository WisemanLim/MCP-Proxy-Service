import { db, jsonError, requireActive } from "@/lib/server/context";
import { addEndpoint, listDocEndpoints } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 개별 endpoint 목록 — 소유자/검토자. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const actor = await requireActive(req);
    const { id } = await params;
    return Response.json({ items: listDocEndpoints(await db(), actor, id) });
  } catch (e) {
    return jsonError(e);
  }
}

/** 개별 endpoint 추가 — 소유자(endpoints 모드). 추가 시 문서 pending. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const actor = await requireActive(req);
    const { id } = await params;
    const { method, path, summary } = await req.json();
    if (!method || !path) return Response.json({ error: "method_path_required" }, { status: 400 });
    const ep = addEndpoint(await db(), actor, id, String(method), String(path), summary ? String(summary) : undefined);
    return Response.json(ep, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
