import { db, jsonError, requireActive } from "@/lib/server/context";
import { testDoc } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 문서 시험·확인 — 소유자/검토자 누구나(USER/ADMIN/SUPERVISOR). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req);
    const { id } = await params;
    return Response.json(await testDoc(await db(), actor, id));
  } catch (e) {
    return jsonError(e);
  }
}
