import { db, jsonError, requireActive } from "@/lib/server/context";
import { rejectUser } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 사용자 반려 — SUPERVISOR / ADMIN(같은 조직 USER). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "SUPERVISOR", "ADMIN");
    const { id } = await params;
    const { reason } = await req.json();
    return Response.json(rejectUser(await db(), actor, id, String(reason ?? "")));
  } catch (e) {
    return jsonError(e);
  }
}
