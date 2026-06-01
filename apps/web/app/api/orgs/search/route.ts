import { db, jsonError } from "@/lib/server/context";
import { searchOrgs } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 조직 검색 (USER 가입 시 텍스트 입력 검색). 공개. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!q) return Response.json({ items: [] });
    const items = searchOrgs(await db(), q).map((o) => ({ id: o.id, name: o.name }));
    return Response.json({ items });
  } catch (e) {
    return jsonError(e);
  }
}
