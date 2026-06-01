import { db, jsonError, requireActive } from "@/lib/server/context";
import { listUsers, listUsersByOrg } from "@/lib/server/db";
import { toPublic } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 사용자 목록 — SUPERVISOR 전체 / ADMIN 같은 조직. */
export async function GET(req: Request) {
  try {
    const actor = await requireActive(req, "SUPERVISOR", "ADMIN");
    const d = await db();
    const rows = actor.role === "SUPERVISOR" ? listUsers(d) : actor.orgId ? listUsersByOrg(d, actor.orgId) : [];
    return Response.json({ items: rows.map((u) => toPublic(d, u)) });
  } catch (e) {
    return jsonError(e);
  }
}
