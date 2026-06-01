import { db, jsonError, requireActive } from "@/lib/server/context";
import { removeEndpoint } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 개별 endpoint 삭제 — 소유자. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; eid: string }> }) {
  try {
    const actor = await requireActive(req);
    const { eid } = await params;
    removeEndpoint(await db(), actor, eid);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
