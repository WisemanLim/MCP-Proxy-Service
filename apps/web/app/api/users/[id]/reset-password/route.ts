import { db, jsonError, requireActive } from "@/lib/server/context";
import { resetPassword } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 비밀번호 초기화 — SUPERVISOR(누구나) / ADMIN(같은 조직 USER). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "SUPERVISOR", "ADMIN");
    const { id } = await params;
    const { newPassword } = await req.json();
    if (!newPassword) return Response.json({ error: "newPassword_required" }, { status: 400 });
    await resetPassword(await db(), actor, id, String(newPassword));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
