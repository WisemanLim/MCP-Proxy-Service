import { db, jsonError, requireAuth } from "@/lib/server/context";
import { getTotpQr } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const claims = await requireAuth(req);
    return Response.json(await getTotpQr(await db(), claims.sub));
  } catch (e) {
    return jsonError(e);
  }
}
