import { db, jsonError, requireActive } from "@/lib/server/context";
import { docProxyStatus, restartDocProxy } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 승인 문서의 프록시(MCP HTTP) 실행 상태 — 소유자/검토자. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "USER", "ADMIN", "SUPERVISOR");
    const { id } = await params;
    return Response.json(await docProxyStatus(await db(), actor, id));
  } catch (e) {
    return jsonError(e);
  }
}

/** 프록시 강제 재시작 — 최신 dist/env로 재spawn. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "USER", "ADMIN", "SUPERVISOR");
    const { id } = await params;
    return Response.json(await restartDocProxy(await db(), actor, id));
  } catch (e) {
    return jsonError(e);
  }
}
