import { db, jsonError, requireActive } from "@/lib/server/context";
import { approveDoc, toPublicDoc } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 승인 — ADMIN(조직)/SUPERVISOR. 변환 검증 통과해야 승인됨. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "ADMIN", "SUPERVISOR");
    const { id } = await params;
    return Response.json(toPublicDoc(await approveDoc(await db(), actor, id)));
  } catch (e) {
    return jsonError(e);
  }
}
