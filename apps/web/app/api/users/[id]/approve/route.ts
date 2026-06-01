import { db, jsonError, requireActive } from "@/lib/server/context";
import { approveUser } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 사용자 승인 — SUPERVISOR(누구나) / ADMIN(같은 조직 USER). Part B 3·4. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "SUPERVISOR", "ADMIN");
    const { id } = await params;
    return Response.json(approveUser(await db(), actor, id));
  } catch (e) {
    return jsonError(e);
  }
}
