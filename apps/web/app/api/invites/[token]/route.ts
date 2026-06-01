import { db, jsonError } from "@/lib/server/context";
import { getInviteInfo } from "@/lib/server/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 수락 페이지용 초대 정보 — 공개(토큰 보유). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return Response.json(getInviteInfo(await db(), token));
  } catch (e) {
    return jsonError(e);
  }
}
