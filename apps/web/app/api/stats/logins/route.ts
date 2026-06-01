import { db, jsonError, requireActive } from "@/lib/server/context";
import { loginFrequency } from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 로그인 빈도 통계 — ADMIN(조직)/SUPERVISOR(전체). */
export async function GET(req: Request) {
  try {
    const actor = await requireActive(req, "ADMIN", "SUPERVISOR");
    return Response.json({ items: loginFrequency(await db(), actor) });
  } catch (e) {
    return jsonError(e);
  }
}
