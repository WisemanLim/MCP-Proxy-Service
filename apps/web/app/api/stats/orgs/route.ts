import { db, jsonError, requireActive } from "@/lib/server/context";
import { orgSummary } from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 조직별 사용자·문서 현황 — SUPERVISOR. */
export async function GET(req: Request) {
  try {
    const actor = await requireActive(req, "SUPERVISOR");
    return Response.json({ items: orgSummary(await db(), actor) });
  } catch (e) {
    return jsonError(e);
  }
}
