import { db, jsonError } from "@/lib/server/context";
import { findOrgByName } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 조직명 중복 확인 (ADMIN 가입 시). 공개. */
export async function GET(req: Request) {
  try {
    const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
    if (!name) return Response.json({ error: "name_required" }, { status: 400 });
    return Response.json({ name, available: !findOrgByName(await db(), name) });
  } catch (e) {
    return jsonError(e);
  }
}
