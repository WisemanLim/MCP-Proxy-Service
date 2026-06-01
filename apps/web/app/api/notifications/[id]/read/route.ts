import { db, jsonError, requireActive } from "@/lib/server/context";
import { readNotification } from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 알림 확인(읽음) — ADMIN/SUPERVISOR. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "ADMIN", "SUPERVISOR");
    const { id } = await params;
    readNotification(await db(), actor, id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
