import { db, jsonError, requireActive } from "@/lib/server/context";
import { usageStats } from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 그래픽 대시보드 집계 — USER 본인 / ADMIN 조직 / SUPERVISOR 전체. */
export async function GET(req: Request) {
  try {
    const actor = await requireActive(req);
    return Response.json(usageStats(await db(), actor));
  } catch (e) {
    return jsonError(e);
  }
}
