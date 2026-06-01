import { db, jsonError, requireAuth } from "@/lib/server/context";
import { listNotifications, sendNotification } from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 받은 알림 목록 — ADMIN/SUPERVISOR. */
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json({ items: listNotifications(await db(), actor) });
  } catch (e) {
    return jsonError(e);
  }
}

/** 알림 보내기 — USER/ADMIN(미승인 계정·API). pending 상태도 가능(requireAuth). */
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const { type, message, refId } = await req.json();
    if (!type || !message) return Response.json({ error: "type_message_required" }, { status: 400 });
    return Response.json(sendNotification(await db(), actor, { type: String(type), message: String(message), refId: refId ? String(refId) : undefined }), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
