import { db, jsonError } from "@/lib/server/context";
import { registerUser } from "@/lib/server/auth-server";
import type { Role } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회원가입 (PRD Part B). role=USER|ADMIN.
 * ADMIN → orgName(조직 생성, 중복확인). USER → orgId(조직 검색 선택). 둘 다 status=pending.
 */
export async function POST(req: Request) {
  try {
    const { email, password, role, orgName, orgId } = await req.json();
    if (!email || !password) return Response.json({ error: "email_password_required" }, { status: 400 });
    const r: Role = role === "ADMIN" ? "ADMIN" : "USER";
    const result = await registerUser(await db(), {
      email: String(email),
      password: String(password),
      role: r,
      orgName: orgName ? String(orgName) : undefined,
      orgId: orgId ? String(orgId) : undefined,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
