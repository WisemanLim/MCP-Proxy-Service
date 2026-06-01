import { db, jsonError, requireActive } from "@/lib/server/context";
import { rejectDoc, toPublicDoc } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 반려 — ADMIN(조직)/SUPERVISOR. 사유 기록. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "ADMIN", "SUPERVISOR");
    const { id } = await params;
    const { reason } = await req.json();
    return Response.json(toPublicDoc(rejectDoc(await db(), actor, id, String(reason ?? ""))));
  } catch (e) {
    return jsonError(e);
  }
}
