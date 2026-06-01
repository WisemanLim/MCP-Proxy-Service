import { db, jsonError, requireActive } from "@/lib/server/context";
import { getDocSpec } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 승인 문서의 OpenAPI 스펙 JSON (가이드 다운로드용). 소유자/검토자. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req);
    const { id } = await params;
    const spec = await getDocSpec(await db(), actor, id);
    return Response.json(spec);
  } catch (e) {
    return jsonError(e);
  }
}
