import { db, jsonError, requireAuth } from "@/lib/server/context";
import { findUserById } from "@/lib/server/db";
import { toPublic } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const claims = await requireAuth(req);
    const d = await db();
    const u = findUserById(d, claims.sub);
    if (!u) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(toPublic(d, u));
  } catch (e) {
    return jsonError(e);
  }
}
