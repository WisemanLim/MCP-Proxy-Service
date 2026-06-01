import { db, jsonError, requireActive } from "@/lib/server/context";
import { previewDoc } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 요청 확인 — ADMIN/SUPERVISOR: URL fetch + 변환 결과(정상/비정상 판단). Part A 4. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "ADMIN", "SUPERVISOR");
    const { id } = await params;
    return Response.json(await previewDoc(await db(), actor, id));
  } catch (e) {
    return jsonError(e);
  }
}
