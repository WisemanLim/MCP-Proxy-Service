import { db, jsonError, requireAuth } from "@/lib/server/context";
import { enableTotp } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const claims = await requireAuth(req);
    const { code } = await req.json();
    if (!code) return Response.json({ error: "code_required" }, { status: 400 });
    return Response.json(enableTotp(await db(), claims.sub, String(code)));
  } catch (e) {
    return jsonError(e);
  }
}
