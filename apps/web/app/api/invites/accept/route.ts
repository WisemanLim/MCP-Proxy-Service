import { db, jsonError } from "@/lib/server/context";
import { acceptInvite } from "@/lib/server/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 초대 수락 → 계정 생성 + 자동 로그인. 공개. */
export async function POST(req: Request) {
  try {
    const { token, email, password } = await req.json();
    if (!token || !password) return Response.json({ error: "token_password_required" }, { status: 400 });
    const result = await acceptInvite(await db(), String(token), { email: email ? String(email) : undefined, password: String(password) });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
