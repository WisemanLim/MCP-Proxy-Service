import { db, jsonError } from "@/lib/server/context";
import { loginUser } from "@/lib/server/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, password, totp } = await req.json();
    if (!email || !password) return Response.json({ error: "email_password_required" }, { status: 400 });
    const result = await loginUser(await db(), String(email), String(password), totp ? String(totp) : undefined);
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
