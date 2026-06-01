import { db, jsonError, requireAuth } from "@/lib/server/context";
import { changePassword } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 본인 비밀번호 변경 (현재+신규). pending도 가능(requireAuth). */
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) return Response.json({ error: "password_required" }, { status: 400 });
    await changePassword(await db(), actor.sub, String(currentPassword), String(newPassword));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
